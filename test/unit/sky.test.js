// Sky Wings without a screen or a camera: reading arms as wings, and the rules of a dogfight.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { DEMOS } from '../../core/body/demos.js';
import { BodyReader, viewProblem } from '../../core/body/reader.js';
import { CAMERA, Flight, HEARTS, KINDS, LEVELS, MOST_AT_ONCE, MOST_AT_ONCE_EVER, NEW_AT, PACES, POWERS, RANGE, flightLevel, forwardOf, freshKinds, isOn, planPirates } from '../../games/sky-wings/flight.js';
import { PLACES, WORLD, coastAt, floorAt, heightAt } from '../../games/sky-wings/island-map.js';
import { Lesson } from '../../games/sky-wings/lesson.js';

const clips = JSON.parse(readFileSync(new URL('../fixtures/body-moves.json', import.meta.url)));
const toBody = ([, image, world]) => (image
  ? {
      image: image.map((p) => (p ? { x: p[0], y: p[1], z: 0, visibility: p[2] } : { x: 0, y: 0, z: 0, visibility: 0 })),
      world: world.map((p) => (p ? { x: p[0], y: p[1], z: p[2] } : { x: 0, y: 0, z: 0 })),
    }
  : null);

/** Plays the real tracker's numbers for arms as wings, up to a moment, and says how they read. */
function wingsAt(seconds, prepare = () => {}) {
  const reader = new BodyReader({ size: 'small' });
  reader.upperBodyOnly = true;
  prepare(reader);
  for (const frame of clips.wings.frames) {
    if (frame[0] > seconds) break;
    reader.update(toBody(frame), frame[0], clips.wings.aspect);
  }
  return reader.wings;
}

const seeded = (seed = 1) => {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
};

function flying(options = {}) {
  const events = [];
  const flight = new Flight({ planes: 6, random: seeded(), onEvent: (event) => events.push(event), ...options });
  flight.begin();
  return { flight, events };
}

const fly = (flight, seconds, controls = { out: true }) => {
  for (let t = 0; t < seconds; t += 1 / 30) flight.update(1 / 30, typeof controls === 'function' ? controls() : controls);
};
const named = (events, type) => events.filter((event) => event.type === type);
const turnBetween = (to, from) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/** Puts another plane somewhere in front of the child's, and keeps it there. */
function holdInFront(flight, enemy, { ahead = 120, across = 0, up = 0 } = {}) {
  const { forward, view } = flight;
  const right = { x: -forward.z, z: forward.x };
  enemy.x = view.eye.x + forward.x * ahead + right.x * across;
  enemy.y = view.eye.y + forward.y * ahead + up;
  enemy.z = view.eye.z + forward.z * ahead + right.z * across;
  enemy.mode = 'cross';
  enemy.way = { x: enemy.x, y: enemy.y, z: enemy.z };
  enemy.modeLeft = 5;
  enemy.dodgeLeft = 0;
}

/** Everyone else out of the way, a long way behind. */
function clearTheRest(flight, keep) {
  for (const enemy of flight.enemies) {
    if (enemy === keep) continue;
    const { forward } = flight;
    enemy.x = flight.x - forward.x * 900;
    enemy.z = flight.z - forward.z * 900;
    enemy.way = { x: enemy.x, y: enemy.y, z: enemy.z };
    enemy.modeLeft = 5;
  }
}

/** Arms that steer straight for the nearest plane, as a child doing well would. */
const huntingWell = (flight) => () => {
  const nearest = flight.flying.slice().sort((a, b) => Math.hypot(a.x - flight.x, a.z - flight.z) - Math.hypot(b.x - flight.x, b.z - flight.z))[0];
  if (!nearest) return { out: true };
  const off = turnBetween(Math.atan2(nearest.x - flight.x, -(nearest.z - flight.z)), flight.heading);
  const elevation = Math.atan2(nearest.y - flight.y, Math.hypot(nearest.x - flight.x, nearest.z - flight.z));
  return { out: true, bank: Math.max(-1, Math.min(1, off * 2)), climb: Math.max(-1, Math.min(1, elevation * 2)) };
};

test('both arms out, level, are wings going straight on, in what the real tracker reports', () => {
  for (const seconds of [3.5, 4.5, 19.5]) {
    const { seen, out, bank, climb } = wingsAt(seconds);
    assert.equal(seen, true);
    assert.equal(out, true, `${seconds}`);
    assert.ok(Math.abs(bank) < 0.1, `${seconds}: bank ${bank}`);
    assert.equal(climb, 0, `${seconds}`);
  }
});

test('arms hanging down aren\'t wings', () => {
  assert.equal(wingsAt(1).out, false);
  assert.equal(wingsAt(23).out, false);
});

test('tipping to the right is a turn to the right, and to the left a turn to the left', () => {
  const right = wingsAt(7);
  assert.ok(right.out);
  assert.ok(right.bank > 0.5, `right: ${right.bank}`);
  const left = wingsAt(10.5);
  assert.ok(left.out);
  assert.ok(left.bank < -0.5, `left: ${left.bank}`);
});

test('both arms high is climbing, and both low is diving', () => {
  const high = wingsAt(14);
  assert.ok(high.out);
  assert.ok(high.climb > 0.5, `high: ${high.climb}`);
  const low = wingsAt(17);
  assert.ok(low.out);
  assert.ok(low.climb < -0.4, `low: ${low.climb}`);
});

test('arms held unevenly can be this child\'s level, so the plane doesn\'t fly in circles', () => {
  const uneven = wingsAt(7);
  const learned = wingsAt(7, (reader) => {
    reader.personal.tiltZero = uneven.tilt;
    reader.personal.heightZero = uneven.height;
  });
  assert.ok(Math.abs(learned.bank) < 0.05, `now ${learned.bank}`);
});

test('tipping as far as this child can is a full turn, whichever side', () => {
  const full = wingsAt(7, (reader) => {
    reader.personal.tiltRight = 0.2;
  });
  assert.equal(full.bank, 1);
  const otherWay = wingsAt(10.5, (reader) => {
    reader.personal.tiltRight = 0.2;
  });
  assert.ok(otherWay.bank > -1, 'the other side has its own measure');
});

test('flying can be done sitting down, but there has to be room for both arms', () => {
  const body = toBody(clips.wings.frames[100]);
  const { aspect } = clips.wings;
  assert.equal(viewProblem(body, aspect, { upperBodyOnly: true, armsOut: true }), null);
  const closeUp = {
    ...body,
    image: body.image.map((point) => ({ ...point, x: 0.5 + (point.x - 0.5) * 6, y: 0.5 + (point.y - 0.3) * 6 })),
  };
  assert.equal(viewProblem(closeUp, aspect, { upperBodyOnly: true, armsOut: true }), 'step-back');
});

/* ---------- the island ---------- */

test('the island is real land in the sea, with a volcano, and places flat enough to build on', () => {
  assert.ok(heightAt(0, 0) > 0, 'land in the middle');
  assert.ok(heightAt(0, 1000) < 0, 'sea further out');
  const volcano = Math.max(...[-30, -15, 15, 30].map((off) => heightAt(-150 + off * 1.8, -190 + off)));
  assert.ok(volcano > 110, `the volcano is ${volcano} high`);
  for (const [name, { x, z, height }] of Object.entries(PLACES)) assert.ok(Math.abs(heightAt(x, z) - height) < 0.01, name);
  for (let angle = 0; angle < 6.28; angle += 0.4) {
    const { x, z, far } = coastAt(angle);
    assert.ok(far > 300 && far < 800, `the coast is ${far} out at ${angle}`);
    assert.ok(heightAt(x, z) > 0);
  }
});

test('the island is the same every time', () => {
  assert.equal(heightAt(123.4, -56.7), heightAt(123.4, -56.7));
});

/* ---------- flying in all three directions ---------- */

test('tipping the arms banks the plane, and that turns it, whichever way', () => {
  const right = flying().flight;
  fly(right, 1.5, { out: true, bank: 1 });
  assert.ok(right.heading > 0.8, `heading ${right.heading}`);
  assert.ok(right.roll > 0.5, 'it leans into the turn');
  assert.ok(right.x > 10, 'and goes that way');
  const left = flying().flight;
  fly(left, 1.5, { out: true, bank: -1 });
  assert.ok(left.heading < -0.8);
  assert.ok(left.roll < -0.5);
  assert.ok(left.x < -10);
});

test('it isn\'t stuck on one level: raising the arms puts its nose up and it climbs, and lowering them dives', () => {
  const up = flying().flight;
  const fromUp = up.y;
  fly(up, 1.5, { out: true, climb: 1 });
  assert.ok(up.pitch > 0.4, `pitch ${up.pitch}`);
  assert.ok(up.y > fromUp + 15, 'it has really gone up');
  assert.ok(up.forward.y > 0.3, 'it\'s pointing up');
  const down = flying().flight;
  const fromDown = down.y;
  fly(down, 1, { out: true, climb: -1 });
  assert.ok(down.pitch < -0.3);
  assert.ok(down.y < fromDown - 6);
  fly(down, 3, { out: true, climb: 0 });
  assert.ok(Math.abs(down.pitch) < 0.2, 'arms level again is flying level');
});

test('it can turn and climb at once, going anywhere in the sky', () => {
  const { flight } = flying();
  const start = { x: flight.x, y: flight.y, z: flight.z };
  fly(flight, 3, { out: true, bank: 0.7, climb: 0.8 });
  assert.ok(Math.abs(flight.x - start.x) > 20);
  assert.ok(flight.y - start.y > 30);
  assert.ok(Math.abs(flight.z - start.z) > 20);
});

test('how steep and how far over it can go have limits, so nobody ends up upside down', () => {
  const { flight } = flying();
  let steepest = 0;
  let furthestOver = 0;
  fly(flight, 20, () => {
    steepest = Math.max(steepest, Math.abs(flight.pitch));
    furthestOver = Math.max(furthestOver, Math.abs(flight.roll));
    return { out: true, bank: 1, climb: 1 };
  });
  assert.ok(steepest < 0.9 && steepest > 0.3, `pitch ${steepest}`);
  assert.ok(furthestOver < 1.1, `roll ${furthestOver}`);
});

test('a little wobble in the arms doesn\'t steer', () => {
  const { flight } = flying({ planes: 1 });
  clearTheRest(flight);
  flight.enemies.length = 0;
  flight.waiting = 0;
  fly(flight, 2, { out: true, bank: 0.05 });
  assert.equal(flight.heading, 0);
});

test('the sky has a ceiling, and a plane can\'t go through it however long it climbs', () => {
  const { flight } = flying({ planes: 1 });
  flight.enemies.length = 0;
  flight.waiting = 0;
  fly(flight, 40, () => {
    assert.ok(flight.y <= WORLD.ceiling);
    return { out: true, climb: 1, bank: 0.4 };
  });
  assert.ok(flight.y > WORLD.ceiling - 60, `it got to ${flight.y}`);
});

test('nothing can fly into the ground or the sea, even the volcano, however long it dives', () => {
  for (const heading of [0, 0.5, 1, -0.7]) {
    const { flight } = flying({ planes: 1 });
    flight.enemies.length = 0;
    flight.waiting = 0;
    flight.heading = heading;
    fly(flight, 45, () => {
      assert.ok(flight.y >= floorAt(flight.x, flight.z) - 1e-6, `at ${flight.x}, ${flight.z}`);
      return { out: true, climb: -1 };
    });
  }
});

test('there\'s an outer edge, and a plane heading out is turned back towards the island', () => {
  const { flight } = flying({ planes: 1 });
  flight.enemies.length = 0;
  flight.waiting = 0;
  flight.heading = Math.PI; // Straight out to sea.
  let furthest = 0;
  let atLimit = 0;
  fly(flight, 60, () => {
    furthest = Math.max(furthest, Math.hypot(flight.x, flight.z));
    atLimit = Math.max(atLimit, flight.atLimit);
    return { out: true };
  });
  assert.ok(furthest <= WORLD.limit, `it got ${furthest} out`);
  assert.ok(atLimit > 0, 'it noticed');
  assert.ok(Math.hypot(flight.x, flight.z) < furthest, 'and it has come back');
});

/* ---------- the ring and the guns ---------- */

test('the camera is behind and above, looking the way the plane points', () => {
  const { flight } = flying();
  flight.pitch = 0.4;
  flight.heading = 1;
  const { eye, forward, up } = flight.view;
  const f = forwardOf(1, 0.4);
  assert.ok(Math.abs(forward.x - f.x) < 1e-9 && Math.abs(forward.y - f.y) < 1e-9);
  assert.ok(Math.abs(Math.hypot(forward.x, forward.y, forward.z) - 1) < 1e-9);
  assert.ok(Math.abs(forward.x * up.x + forward.y * up.y + forward.z * up.z) < 1e-9, 'up is square to it');
  const away = Math.hypot(eye.x - flight.x, eye.y - flight.y, eye.z - flight.z);
  assert.ok(Math.abs(away - Math.hypot(CAMERA.back, CAMERA.up)) < 1e-9);
});

test('a plane inside the ring gets fired at by itself, with nothing for the child to do', () => {
  const { flight, events } = flying();
  const [enemy] = flight.enemies;
  clearTheRest(flight, enemy);
  holdInFront(flight, enemy);
  flight.update(1 / 30, { out: true });
  assert.equal(flight.locked, enemy);
  assert.equal(flight.firing, true);
  assert.equal(named(events, 'firing').at(-1).on, true);
  fly(flight, 0.5, () => {
    holdInFront(flight, enemy);
    return { out: true };
  });
  assert.ok(flight.stats.shots >= 3);
  assert.ok(flight.stats.hits >= 1);
  assert.ok(enemy.hitsLeft < LEVELS.gentle.enemyHits);
});

test('a plane outside the ring, too far off, or behind, isn\'t fired at', () => {
  const { flight } = flying();
  const [enemy] = flight.enemies;
  clearTheRest(flight, enemy);
  const aim = LEVELS.gentle.aim;
  const check = (where, expected, message) => {
    holdInFront(flight, enemy, where);
    assert.equal(flight.findTarget() === enemy, expected, message);
  };
  check({ ahead: 120, across: Math.tan(aim) * 120 * 0.8 }, true, 'just inside');
  check({ ahead: 120, across: Math.tan(aim) * 120 * 1.2 }, false, 'just outside');
  check({ ahead: 120, up: Math.tan(aim) * 120 * 0.8 }, true, 'just inside, above');
  check({ ahead: 120, up: Math.tan(aim) * 120 * 1.2 }, false, 'just outside, above');
  check({ ahead: RANGE - 5 }, true, 'as far as it reaches');
  check({ ahead: RANGE + 20 }, false, 'too far');
  check({ ahead: -60 }, false, 'behind');
});

test('the ring gets smaller as it gets harder', () => {
  assert.ok(LEVELS.gentle.aim > LEVELS.medium.aim);
  assert.ok(LEVELS.medium.aim > LEVELS.tough.aim);
  assert.ok(LEVELS.gentle.enemyHits < LEVELS.tough.enemyHits);
});

test('the guns stop when the plane leaves the ring', () => {
  const { flight, events } = flying();
  const [enemy] = flight.enemies;
  clearTheRest(flight, enemy);
  holdInFront(flight, enemy);
  fly(flight, 0.2, { out: true });
  assert.equal(flight.firing, true);
  holdInFront(flight, enemy, { ahead: 120, across: 150 });
  flight.update(1 / 30, { out: true });
  assert.equal(flight.firing, false);
  assert.equal(named(events, 'firing').at(-1).on, false);
});

test('a plane being shot at tries to get away, so that it has to be chased', () => {
  const { flight } = flying();
  const [enemy] = flight.enemies;
  clearTheRest(flight, enemy);
  holdInFront(flight, enemy);
  const before = enemy.way;
  flight.hit(enemy);
  assert.notEqual(enemy.way, before);
  assert.ok(enemy.dodgeLeft > 0);
  enemy.mode = 'hunt';
  enemy.dodgeLeft = 0;
  flight.hit(enemy);
  assert.equal(enemy.mode, 'cross', 'and it stops hunting');
});

test('enough hits drop a plane: it falls away and goes, and the next one comes', () => {
  const { flight, events } = flying();
  const [enemy] = flight.enemies;
  const { index } = enemy;
  for (let i = 0; i < LEVELS.gentle.enemyHits; i += 1) flight.hit(enemy);
  assert.equal(enemy.state, 'falling');
  assert.equal(flight.dropped, 1);
  assert.equal(flight.left, 5);
  assert.equal(named(events, 'down').length, 1);
  flight.hit(enemy);
  assert.equal(flight.dropped, 1, 'it can only be dropped once');

  const height = enemy.y;
  fly(flight, 1.5, { out: true });
  assert.ok(enemy.y < height, 'falling');
  assert.equal(flight.flying.length, MOST_AT_ONCE, 'there\'s another one along straight away');
  assert.ok(flight.flying.every((plane) => plane.index !== index));
  fly(flight, 6, { out: true });
  assert.ok(!flight.enemies.includes(enemy), 'and it has gone');
});

test('there are never too many at once, and they all have to be dropped to win', () => {
  const { flight, events } = flying({ planes: 7 });
  assert.equal(flight.flying.length, MOST_AT_ONCE);
  assert.equal(flight.waiting, 4);
  let safety = 0;
  while (flight.state === 'flying' && safety < 2000) {
    safety += 1;
    for (const enemy of flight.flying) {
      for (let i = 0; i < LEVELS.gentle.enemyHits; i += 1) flight.hit(enemy);
    }
    fly(flight, 1.2, { out: true });
    assert.ok(flight.flying.length <= MOST_AT_ONCE);
  }
  assert.equal(flight.state, 'won');
  assert.equal(flight.dropped, 7);
  assert.equal(named(events, 'won').length, 1);
  assert.equal(new Set(named(events, 'spawn').map(({ enemy }) => enemy.index)).size, 7);
  // It carries on flying afterwards, inside the limits, and nothing else happens.
  const { x } = flight;
  fly(flight, 3, { out: true });
  assert.notEqual(flight.x, x);
  assert.equal(named(events, 'won').length, 1);
});

/* ---------- being hunted ---------- */

test('every so often one of them comes after the child, and shoots when it\'s behind them', () => {
  const { flight, events } = flying();
  let hunted = false;
  fly(flight, 40, () => {
    hunted = hunted || flight.flying.some(({ mode }) => mode === 'hunt');
    return { out: true };
  });
  assert.ok(hunted, 'someone hunted');
  assert.ok(named(events, 'enemy-shot').length > 0, 'and shot');
  assert.ok(flight.flying.filter(({ mode }) => mode === 'hunt').length <= 1, 'one at a time');
});

test('being hit costs a heart, and they come back', () => {
  const { flight, events } = flying();
  flight.hurt();
  assert.equal(flight.hearts, HEARTS - 1);
  assert.equal(named(events, 'hurt').length, 1);
  assert.ok(flight.hurtLeft > 0);
  fly(flight, LEVELS.gentle.healAfter + 0.5, () => {
    flight.shots = [];
    for (const enemy of flight.flying) enemy.mode = 'cross';
    flight.huntIn = 100;
    return { out: true };
  });
  assert.equal(flight.hearts, HEARTS);
});

test('on Gentle a child can\'t be shot down, whatever happens', () => {
  const { flight } = flying();
  for (let i = 0; i < 40; i += 1) flight.hurt();
  assert.equal(flight.hearts, 1);
  assert.equal(flight.state, 'flying');
});

test('on the harder levels running out of hearts ends it', () => {
  for (const level of ['medium', 'tough']) {
    const { flight, events } = flying({ level });
    for (let i = 0; i < HEARTS; i += 1) flight.hurt();
    assert.equal(flight.state, 'lost');
    assert.equal(named(events, 'lost').length, 1);
    assert.equal(flight.firing, false);
  }
});

test('a child steering for the planes wins, and one who isn\'t doesn\'t by accident', () => {
  for (const pace of Object.keys(PACES)) {
    const { flight } = flying({ pace });
    fly(flight, 240, huntingWell(flight));
    assert.equal(flight.state, 'won', pace);
    assert.ok(flight.stats.seconds > 20, `${pace}: over in ${flight.stats.seconds}`);
  }
  const { flight } = flying({ random: seeded(5) });
  fly(flight, 120, { out: true });
  assert.notEqual(flight.state, 'won');
});

/* ---------- resting ---------- */

test('with arms down the plane glides, and after a while nobody shoots, however long the rest', () => {
  const { flight, events } = flying();
  const flyingSpeed = flight.speed;
  fly(flight, 2, { out: false });
  assert.ok(flight.speed < flyingSpeed * 0.8, 'gliding');
  assert.equal(flight.resting, false);
  fly(flight, 3, { out: false });
  assert.equal(flight.resting, true);
  assert.equal(named(events, 'resting').at(-1).on, true);

  const { hurts, shots } = flight.stats;
  for (const enemy of flight.flying) {
    enemy.mode = 'hunt';
    enemy.modeLeft = 100;
  }
  fly(flight, 90, () => {
    assert.ok(Math.hypot(flight.x, flight.z) <= WORLD.limit);
    assert.ok(flight.y >= floorAt(flight.x, flight.z) - 1e-6);
    assert.equal(flight.locked, null);
    return { out: false };
  });
  assert.equal(flight.stats.hurts, hurts, 'nobody gets hurt while resting');
  assert.equal(flight.stats.shots, shots, 'and nobody shoots');
  assert.ok(flight.flying.every(({ mode }) => mode !== 'hunt'), 'nobody hunts them');

  fly(flight, 1, { out: true });
  assert.equal(flight.resting, false);
  assert.equal(named(events, 'resting').at(-1).on, false);
});

test('on Medium and Tough the pirates don\'t stop for a rest: they hunt a gliding plane and can bring it down', () => {
  for (const level of ['medium', 'tough']) {
    const { flight, events } = flying({ level, random: seeded(3) });
    fly(flight, 5, { out: false });
    assert.equal(flight.resting, true, `${level}: resting`);
    // Every pirate turns to hunt, and keeps on hunting, a little behind the child's plane.
    fly(flight, 120, () => {
      for (const enemy of flight.flying) {
        if (enemy.mode !== 'hunt') {
          enemy.mode = 'hunt';
          enemy.modeLeft = 100;
        }
        if (enemy.burstLeft === 0) enemy.fireIn = Math.min(enemy.fireIn, 0.1);
      }
      return { out: false };
    });
    assert.ok(flight.stats.shots > 0 || named(events, 'enemy-shot').length > 0, `${level}: they shot`);
    assert.ok(flight.stats.hurts >= HEARTS, `${level}: hit ${flight.stats.hurts} times`);
    assert.equal(flight.state, 'lost', `${level}: brought down`);
    assert.equal(named(events, 'lost').length, 1);
  }
});

test('on Gentle the same rest is left alone, and the plane can\'t be brought down', () => {
  const { flight } = flying({ level: 'gentle', random: seeded(3) });
  fly(flight, 5, { out: false });
  fly(flight, 120, () => {
    for (const enemy of flight.flying) {
      enemy.mode = 'hunt';
      enemy.modeLeft = 100;
    }
    return { out: false };
  });
  assert.equal(flight.stats.hurts, 0);
  assert.equal(flight.state, 'flying');
});

test('a pirate left alone hunting a child who\'s flying straight brings the plane down on Medium', () => {
  const { flight } = flying({ level: 'medium', planes: 1, random: seeded(4) });
  const [enemy] = flight.enemies;
  fly(flight, 90, () => {
    if (flight.state === 'flying' && enemy.state === 'flying' && enemy.mode !== 'hunt') {
      enemy.mode = 'hunt';
      enemy.modeLeft = 100;
    }
    return { out: true, bank: 0, climb: 0 };
  });
  assert.equal(flight.state, 'lost');
});

/* ---------- for a child who can't do it all ---------- */

test('with climbing off, the plane follows the others up and down by itself', () => {
  const { flight } = flying({ climbing: false, planes: 1 });
  const [enemy] = flight.enemies;
  flight.huntIn = 1000;
  holdInFront(flight, enemy, { ahead: 200, up: 90 });
  const from = flight.y;
  fly(flight, 2, () => {
    enemy.way = { x: enemy.x, y: enemy.y, z: enemy.z };
    return { out: true, climb: -1 };
  });
  assert.ok(flight.pitch > 0.1, `pitch ${flight.pitch}`);
  assert.ok(flight.y > from + 5, 'even with the arms held low');
});

test('the plane helps with lining up, when something is near the ring', () => {
  const { flight } = flying({ planes: 1 });
  const [enemy] = flight.enemies;
  flight.huntIn = 1000;
  // Off to one side of the ring, and staying in that direction.
  const { forward } = flight;
  const direction = { x: forward.x * 160 - forward.z * 40, y: 0, z: forward.z * 160 + forward.x * 40 };
  fly(flight, 2, () => {
    const { eye } = flight.view;
    Object.assign(enemy, { x: eye.x + direction.x, y: eye.y, z: eye.z + direction.z, mode: 'cross', dodgeLeft: 1 });
    enemy.way = { x: enemy.x, y: enemy.y, z: enemy.z };
    return { out: true };
  });
  assert.ok(flight.heading > 0.1, `heading ${flight.heading}`);
  assert.ok(flight.stats.shots > 0, 'and it has been in the ring');
});

/** Just enough of a reader for the lesson. */
function fakeReader() {
  return {
    wings: { seen: true, out: false, span: 1.3, tilt: 0, height: 0, bank: 0, climb: 0 },
    personal: {},
    wingsNeeded: 1.9,
  };
}

function lessonWith(steps = ['wings', 'tipRight', 'tipLeft', 'climb', 'dive']) {
  const reader = fakeReader();
  const events = [];
  const lesson = new Lesson({ steps, reader, onEvent: (event) => events.push(event) });
  let now = 0;
  const pass = (seconds, each = () => {}) => {
    for (let t = 0; t < seconds; t += 1 / 30) {
      now += 1 / 30;
      each();
      lesson.update(1 / 30);
    }
  };
  return { reader, lesson, events, pass };
}

test('the lesson goes through each thing in turn, moving on when it\'s been done', () => {
  const { reader, lesson, events, pass } = lessonWith();
  assert.equal(lesson.step, 'wings');
  assert.deepEqual(events[0], { type: 'step', step: 'wings', index: 0, total: 5 });
  pass(3);
  assert.equal(lesson.step, 'wings', 'arms down isn\'t wings');

  reader.wings = { ...reader.wings, out: true, span: 3.5, tilt: 0.1, height: -0.2 };
  pass(0.9);
  assert.ok(events.some(({ type, step }) => type === 'success' && step === 'wings'));
  assert.ok(Math.abs(reader.personal.tiltZero - 0.1) < 1e-9, 'how the arms are held is the middle');
  assert.ok(Math.abs(reader.personal.heightZero + 0.2) < 1e-9);
  pass(1.4);
  assert.equal(lesson.step, 'tipRight');

  reader.wings = { ...reader.wings, tilt: 0.1 + 0.5, bank: 1 };
  pass(0.4);
  assert.ok(Math.abs(reader.personal.tiltRight - 0.45) < 1e-9, 'as far as they tipped is a full turn');
  pass(1.4);
  assert.equal(lesson.step, 'tipLeft');

  reader.wings = { ...reader.wings, tilt: 0.1 - 0.3, bank: -1 };
  pass(0.4);
  assert.ok(Math.abs(reader.personal.tiltLeft - 0.27) < 1e-9, 'with its own measure');
  pass(1.4);
  assert.equal(lesson.step, 'climb');

  reader.wings = { ...reader.wings, tilt: 0.1, climb: 0.7 };
  pass(0.4);
  pass(1.4);
  assert.equal(lesson.step, 'dive');

  pass(1);
  assert.equal(lesson.step, 'dive', 'arms up isn\'t going down');
  reader.wings = { ...reader.wings, climb: -0.7 };
  pass(0.4);
  pass(1.4);
  assert.equal(lesson.finished, true);
  assert.equal(events.at(-1).type, 'finished');
});

test('a small tip counts after a few seconds of trying, for a child who can\'t tip far', () => {
  const { reader, lesson, pass } = lessonWith(['tipRight']);
  reader.wings = { ...reader.wings, out: true, tilt: 0.14 };
  pass(3);
  assert.equal(lesson.pause > 0, false);
  pass(4);
  assert.ok(lesson.pause > 0 || lesson.finished);
  assert.ok(reader.personal.tiltRight < 0.14, `a full turn is ${reader.personal.tiltRight}`);
});

test('what counts as arms out comes down for a child who is trying', () => {
  const { reader, pass } = lessonWith(['wings']);
  reader.personal = {};
  reader.wings = { ...reader.wings, span: 1.9 };
  Object.defineProperty(reader, 'wingsNeeded', { get() { return reader.personal.wings ?? 2.4; } });
  pass(5.2);
  assert.ok(reader.personal.wings > 1.6 && reader.personal.wings < 1.9, `now ${reader.personal.wings}`);
});

test('arms hanging down never bring what counts down that far', () => {
  const { reader, pass } = lessonWith(['wings']);
  reader.wings = { ...reader.wings, span: 1.45 };
  Object.defineProperty(reader, 'wingsNeeded', { get() { return reader.personal.wings ?? 2.4; } });
  pass(30);
  assert.equal(reader.personal.wings, undefined);
});

test('there\'s a film for each thing the lesson asks for', () => {
  for (const name of ['wings', 'tip', 'climb', 'dive']) assert.ok(DEMOS[name], name);
});

test('everything Sky Wings says has a voice file, in English and in Georgian', () => {
  const folder = new URL('../../games/sky-wings/audio/voice/', import.meta.url);
  const lines = JSON.parse(readFileSync(new URL('lines.json', folder)));
  const shared = JSON.parse(readFileSync(new URL('../../core/body/voice/lines.json', import.meta.url)));
  const core = JSON.parse(readFileSync(new URL('../../core/audio/voice/lines.json', import.meta.url)));
  const known = new Set([...lines, ...shared, ...core].map(({ text }) => text));
  for (const { id, ka } of lines) {
    assert.match(ka, /[Ⴀ-ჿ]/, id);
    for (const language of ['en', 'ka']) assert.ok(existsSync(new URL(`${language}/${id}.ogg`, folder)), `${language}/${id}.ogg is missing`);
  }
  const source = readFileSync(new URL('../../games/sky-wings/main.js', import.meta.url), 'utf8');
  const asked = new Set();
  for (const block of source.matchAll(/const SAY = \{([\s\S]+?)\n?\};/g)) {
    for (const [, text] of block[1].matchAll(/'([^']+)'/g)) asked.add(text);
  }
  assert.ok(asked.size >= 14, `only found ${asked.size} lines`);
  assert.deepEqual([...asked].filter((text) => !known.has(text)), []);
  assert.deepEqual(lines.map(({ text }) => text).filter((text) => !asked.has(text)), [], 'nothing rendered that can no longer be said');
});

/* ---------- levels ---------- */

const LEVEL_NUMBERS = Array.from({ length: 10 }, (_, index) => index + 1);

/** A minute of a child steering for the nearest plane, as a line of what came of it. */
function aMinuteOf(options) {
  const { flight } = flying({ planes: 6, random: seeded(9), ...options });
  for (let i = 0; i < 1800 && flight.state === 'flying'; i += 1) {
    const nearest = flight.flying.slice().sort((a, b) => Math.hypot(a.x - flight.x, a.z - flight.z) - Math.hypot(b.x - flight.x, b.z - flight.z))[0];
    const off = nearest ? turnBetween(Math.atan2(nearest.x - flight.x, -(nearest.z - flight.z)), flight.heading) : 0;
    flight.update(1 / 30, nearest ? { out: true, bank: Math.max(-1, Math.min(1, off * 2)), climb: 0.2 } : { out: true });
  }
  return [flight.state, flight.stats.dropped, flight.stats.hits, flight.stats.hurts, flight.x.toFixed(3), flight.z.toFixed(3)].join(',');
}

test('level 1 is the dogfight as it always was', () => {
  assert.deepEqual(flightLevel(1), {
    enemySpeed: 0.84, enemyTurn: 0.82, huntEvery: 1, dodgeSeconds: 2.2, sharpness: 1, weave: 0, climbs: 1, atOnce: MOST_AT_ONCE, captain: false,
    prizes: false, gifts: [], kinds: [], airship: false, sky: 'day',
  });
  // The same flights, to the millimetre, as before there were levels.
  assert.equal(aMinuteOf({ pace: 'slow', level: 'gentle' }), 'flying,4,78,3,76.702,957.743');
  assert.equal(aMinuteOf({ pace: 'fast', level: 'medium' }), 'flying,1,53,3,-320.143,565.902');
  assert.equal(aMinuteOf({ pace: 'medium', level: 'tough' }), 'flying,0,41,4,-121.350,-133.508');
  assert.equal(aMinuteOf({ pace: 'slow', level: 'gentle', levelNumber: 1 }), 'flying,4,78,3,76.702,957.743');
  const { flight } = flying();
  assert.equal(flight.levelNumber, 1);
  assert.ok(flight.enemies.every(({ captain, hitsTotal }) => !captain && hitsTotal === LEVELS.gentle.enemyHits));
});

test('each level is the same as the one before or harder, in every way, and always harder in something', () => {
  for (const level of LEVEL_NUMBERS.slice(1)) {
    const before = flightLevel(level - 1);
    const now = flightLevel(level);
    assert.ok(now.enemySpeed >= before.enemySpeed && now.enemyTurn >= before.enemyTurn && now.huntEvery <= before.huntEvery && now.dodgeSeconds >= before.dodgeSeconds, `${level}: the pirates`);
    assert.ok(now.weave >= before.weave && now.climbs >= before.climbs && now.atOnce >= before.atOnce && (now.captain || !before.captain), `${level}: new things stay`);
    const harder = [now.enemySpeed > before.enemySpeed, now.enemyTurn > before.enemyTurn, now.huntEvery < before.huntEvery, now.dodgeSeconds > before.dodgeSeconds, now.weave > before.weave, now.climbs > before.climbs, now.atOnce > before.atOnce, now.captain && !before.captain];
    assert.ok(harder.some(Boolean), `${level}: something is harder`);
  }
  assert.ok(flightLevel(10).enemySpeed < 1, 'a pirate is never as fast as the child\'s plane');
  assert.equal(MOST_AT_ONCE_EVER, 4);
  assert.deepEqual([3, 5, 8, 9].map((level) => {
    const now = flightLevel(level);
    return [now.weave > 0, now.climbs > 1, now.captain, now.atOnce];
  }), [[true, false, false, 3], [true, true, false, 3], [true, true, true, 3], [true, true, true, 4]]);
});

test('on Medium and Tough the levels climb much more steeply than on Gentle, from the same level 1', () => {
  assert.deepEqual(flightLevel(1), flightLevel(1, { gentle: true }));
  const hard = flightLevel(10);
  const gentle = flightLevel(10, { gentle: true });
  assert.deepEqual([hard.enemySpeed, hard.enemyTurn, hard.huntEvery, hard.dodgeSeconds, hard.sharpness].map((n) => +n.toFixed(3)), [0.94, 1.2, 0.5, 3.2, 1.6]);
  assert.deepEqual([gentle.enemySpeed, gentle.enemyTurn, gentle.huntEvery, gentle.dodgeSeconds, gentle.sharpness].map((n) => +n.toFixed(3)), [0.88, 0.95, 0.8, 2.4, 1]);
  assert.ok(hard.enemySpeed < 1, 'a pirate still never flies as fast as the child');
  // The setting picks the ramp.
  assert.equal(flying({ level: 'gentle', levelNumber: 10 }).flight.levelRules.sharpness, 1);
  assert.equal(flying({ level: 'medium', levelNumber: 10 }).flight.levelRules.sharpness, 1.6);
  assert.equal(flying({ level: 'tough', levelNumber: 10 }).flight.levelRules.huntEvery, 0.5);
});

test('a level never changes what a grown-up chose: the ring, the help, how hard they shoot, or being shot down', () => {
  for (const level of Object.keys(LEVELS)) {
    const { flight } = flying({ level, levelNumber: 10 });
    assert.deepEqual(flight.level, LEVELS[level]);
    assert.equal(flight.enemyHits, LEVELS[level].enemyHits);
    assert.equal(flight.total, 6);
  }
  const gentle = flying({ levelNumber: 10 }).flight;
  for (let i = 0; i < 40; i += 1) gentle.hurt();
  assert.equal(gentle.state, 'flying', 'Gentle still can\'t be shot down');
  const byItself = flying({ climbing: false, levelNumber: 10, planes: 1 }).flight;
  assert.equal(byItself.climbing, false, 'and flying up and down is still left to the plane');
});

test('from level 3 the pirates weave from side to side as they cross', () => {
  const swings = (levelNumber) => {
    const { flight } = flying({ levelNumber, planes: 1, random: seeded(2) });
    const [enemy] = flight.enemies;
    flight.huntIn = 1000;
    let turns = 0;
    let last = 0;
    fly(flight, 12, () => {
      enemy.way = { x: enemy.x + Math.sin(enemy.heading) * 500, y: enemy.y, z: enemy.z - Math.cos(enemy.heading) * 500 };
      enemy.modeLeft = 5;
      const side = Math.sign(Math.round(enemy.roll * 10));
      if (side && side !== last) {
        turns += 1;
        last = side;
      }
      return { out: false };
    });
    return turns;
  };
  assert.ok(swings(1) <= 1, 'flying straight at level 1');
  assert.ok(swings(3) >= 4, 'and from side to side from level 3');
});

test('from level 9 there can be four in the air at once, never more', () => {
  const { flight } = flying({ levelNumber: 9, planes: 9 });
  assert.equal(flight.flying.length, 4);
  let safety = 0;
  while (flight.state === 'flying' && safety < 2000) {
    safety += 1;
    flight.flying[0] && flight.hit(flight.flying[0]);
    fly(flight, 0.3, { out: true });
    assert.ok(flight.flying.length <= 4);
  }
  assert.equal(flight.state, 'won');
  assert.equal(flight.dropped, 9);
});

test('from level 8 the last pirate is the captain, which takes more hits, and dropping it wins', () => {
  const { flight, events } = flying({ levelNumber: 8, planes: 6 });
  let captain = null;
  while (flight.state === 'flying') {
    const [enemy] = flight.flying;
    if (!enemy) {
      fly(flight, 1.2, { out: true });
      continue;
    }
    if (enemy.captain) captain = enemy;
    while (enemy.state === 'flying') flight.hit(enemy);
    fly(flight, 1.2, { out: true });
  }
  assert.equal(flight.state, 'won');
  assert.ok(captain, 'there was a captain');
  assert.equal(captain.index, 5, 'the last one');
  assert.ok(captain.hitsTotal > flight.enemyHits);
  assert.equal(named(events, 'spawn').filter(({ enemy }) => enemy.captain).length, 1);
  // At level 7, and with only one plane to drop, there isn't one.
  assert.equal(flying({ levelNumber: 7 }).flight.enemies.some(({ captain: is }) => is), false);
  const one = flying({ levelNumber: 10, planes: 1 }).flight;
  assert.equal(one.enemies[0].captain, false);
});

test('on Gentle at level 10, resting is still never punished: nobody hunts, shoots or hurts a child with arms down', () => {
  const { flight } = flying({ levelNumber: 10, level: 'gentle' });
  fly(flight, 5, { out: false });
  assert.equal(flight.resting, true);
  const { hurts, shots } = flight.stats;
  for (const enemy of flight.flying) {
    enemy.mode = 'hunt';
    enemy.modeLeft = 100;
  }
  fly(flight, 90, { out: false });
  assert.equal(flight.stats.hurts, hurts);
  assert.equal(flight.stats.shots, shots);
  assert.equal(flight.state, 'flying');
});

/** A whole dogfight flown well, and how long it took and how many changes of direction it asked for. */
function flyItAll({ levelNumber, pace, seed }) {
  const { flight } = flying({ planes: 6, pace, levelNumber, random: seeded(seed) });
  const steer = huntingWell(flight);
  let changes = 0;
  const side = { bank: 0, climb: 0 };
  const count = (name, value) => {
    const now = value > 0.4 ? 1 : value < -0.4 ? -1 : side[name];
    if (now !== side[name] && side[name]) changes += 1;
    side[name] = now;
  };
  for (let t = 0; t < 600 && flight.state === 'flying'; t += 1 / 30) {
    const arms = steer();
    count('bank', arms.bank ?? 0);
    count('climb', arms.climb ?? 0);
    flight.update(1 / 30, arms);
  }
  return { won: flight.state === 'won', seconds: flight.stats.seconds, perMinute: changes / (flight.stats.seconds / 60) };
}

test('level 10 is still doable: won by steering for the planes, not much longer, and no more than double the moves', () => {
  for (const pace of Object.keys(PACES)) {
    const mean = (levelNumber) => {
      const flights = Array.from({ length: 100 }, (_, i) => flyItAll({ levelNumber, pace, seed: i + 1 }));
      assert.ok(flights.every(({ won }) => won), `${pace} at level ${levelNumber}: every one won`);
      return { seconds: flights.reduce((sum, one) => sum + one.seconds, 0) / flights.length, perMinute: flights.reduce((sum, one) => sum + one.perMinute, 0) / flights.length };
    };
    const first = mean(1);
    const last = mean(10);
    assert.ok(last.seconds <= first.seconds * 1.33, `${pace}: ${last.seconds} seconds against ${first.seconds}`);
    assert.ok(last.perMinute <= first.perMinute * 2, `${pace}: ${last.perMinute} changes a minute against ${first.perMinute}`);
  }
});

/* ---------- what each level brings that's new ---------- */

test('every level from 2 brings something new, level 1 brings nothing, and each is really on from then', () => {
  assert.equal(NEW_AT[1], undefined);
  for (const level of LEVEL_NUMBERS.slice(1)) {
    assert.ok(NEW_AT[level]?.length > 0, `${level}: something new`);
    for (const { thing, mark, name, nameKa } of NEW_AT[level]) {
      assert.ok(mark && name && nameKa, `${level}: ${thing} has a picture and names`);
      assert.ok(name.split(' ').length <= 3, `${name}: a few words`);
      assert.equal(isOn(thing, level), true, `${thing} is on at ${level}`);
      assert.equal(isOn(thing, level - 1), false, `${thing} isn't on before ${level}`);
      // It stays, except the sky, which goes from sunset to snow.
      if (!thing.startsWith('sky:')) for (let later = level; later <= 10; later += 1) assert.equal(isOn(thing, later), true, `${thing} still on at ${later}`);
    }
  }
});

test('the pirates come in kinds, in a set order, with the captain last and the airship before it', () => {
  assert.deepEqual(planPirates(6, flightLevel(1)), Array(6).fill('pirate'));
  assert.deepEqual(planPirates(6, flightLevel(4)), ['scout', 'pirate', 'scout', 'pirate', 'scout', 'pirate']);
  assert.deepEqual(planPirates(6, flightLevel(6)), ['scout', 'balloon', 'pirate', 'scout', 'balloon', 'pirate']);
  assert.deepEqual(planPirates(6, flightLevel(8)), ['scout', 'lead', 'wing', 'balloon', 'pirate', 'captain']);
  assert.deepEqual(planPirates(6, flightLevel(10)), ['scout', 'lead', 'wing', 'balloon', 'airship', 'captain']);
  assert.deepEqual(planPirates(3, flightLevel(10)), ['scout', 'airship', 'captain']);
  // Never half a pair: one without room goes to the next kind. One plane to drop is never a captain or an airship.
  assert.deepEqual(planPirates(3, flightLevel(8)), ['scout', 'balloon', 'captain']);
  assert.deepEqual(planPirates(1, flightLevel(10)), ['scout']);
  // With too few planes for every kind, what's new at the level comes first.
  assert.deepEqual(planPirates(3, flightLevel(8), ['pair']), ['lead', 'wing', 'captain']);
  assert.deepEqual(new Flight({ planes: 3, levelNumber: 8 }).plan, ['lead', 'wing', 'captain']);
  for (const total of [1, 3, 6, 9]) {
    for (const level of LEVEL_NUMBERS) {
      const plan = planPirates(total, flightLevel(level), freshKinds(level));
      plan.forEach((kind, i) => {
        if (kind === 'lead') assert.equal(plan[i + 1], 'wing');
        if (kind === 'wing') assert.equal(plan[i - 1], 'lead');
      });
    }
  }
});

test('the sky is day, then a sunset from level 6, and light snow from level 9', () => {
  assert.deepEqual(LEVEL_NUMBERS.map((level) => flightLevel(level).sky), ['day', 'day', 'day', 'day', 'day', 'sunset', 'sunset', 'sunset', 'snow', 'snow']);
});

/** Drops a pirate where it is. */
const dropNow = (flight, enemy) => {
  while (enemy.state === 'flying') flight.hit(enemy);
};

test('from level 2 a dropped pirate leaves a gold coin, which flies to the plane by itself and is counted', () => {
  const none = flying({ levelNumber: 1 }).flight;
  dropNow(none, none.flying[0]);
  assert.equal(none.prizes.length, 0, 'no prizes at level 1');

  const { flight, events } = flying({ levelNumber: 2 });
  const [enemy] = flight.flying;
  flight.huntIn = 1000;
  holdInFront(flight, enemy, { ahead: 200, across: 60 });
  dropNow(flight, enemy);
  assert.deepEqual(flight.prizes.map(({ kind }) => kind), ['coin']);
  // Whatever the child does, even resting, it gets to the plane in a few seconds.
  fly(flight, 4, { out: false });
  assert.equal(flight.prizes.length, 0);
  assert.equal(flight.stats.prizes.coin, 1);
  assert.equal(named(events, 'prize').length, 1);
});

test('each kind of pirate leaves its own prize, and prizes still on their way at the end are counted', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(KINDS).map(([kind, { prize }]) => [kind, prize])), {
    pirate: 'coin', lead: 'coin', wing: 'coin', scout: 'gem', balloon: 'coin', captain: 'medal', airship: 'chest',
  });
  const { flight } = flying({ levelNumber: 10, planes: 6 });
  let guard = 0;
  while (flight.state === 'flying' && guard < 400) {
    guard += 1;
    const [enemy] = flight.flying;
    if (enemy) dropNow(flight, enemy);
    fly(flight, 0.4, { out: true });
  }
  assert.equal(flight.state, 'won');
  assert.deepEqual(flight.stats.prizes, { coin: 3, gem: 1, medal: 1, chest: 1 });
  assert.equal(flight.prizes.length, 0);
});

test('from level 3 a gift box floats out in front, with this level\'s new power first, and flying through it gives that power', () => {
  assert.deepEqual(flightLevel(2).gifts, []);
  const never = flying({ levelNumber: 2 }).flight;
  fly(never, 30, { out: true });
  assert.equal(never.gift, null);
  assert.equal(never.stats.gifts, 0);

  const { flight, events } = flying({ levelNumber: 7, planes: 9 });
  flight.huntIn = 1000;
  fly(flight, 5.2, { out: true });
  assert.equal(flight.gift?.kind, 'snow', 'the first of level 7\'s new powers');
  // Flying straight on, it's caught.
  fly(flight, 6, { out: true });
  assert.equal(flight.power?.kind, 'snow');
  assert.equal(flight.stats.gifts, 1);
  assert.equal(named(events, 'power').at(-1).on, true);
  // It lasts as long as it should, then goes.
  fly(flight, POWERS.snow + 0.2, { out: true });
  assert.notEqual(flight.power?.kind, 'snow');
  // The next gift box is the next power.
  const { gifts } = flight.levelRules;
  assert.equal(flight.gift?.kind ?? gifts[flight.giftTurn % gifts.length], 'shield');
});

test('a missed gift box costs nothing, and no gift box comes while resting', () => {
  const { flight, events } = flying({ levelNumber: 3 });
  flight.huntIn = 1000;
  fly(flight, 5.1, { out: true });
  assert.ok(flight.gift);
  // Put it far away behind, so it's missed.
  Object.assign(flight.gift, { x: flight.x - flight.forward.x * 900, z: flight.z - flight.forward.z * 900 });
  const before = { hearts: flight.hearts, dropped: flight.dropped, prizes: { ...flight.stats.prizes } };
  fly(flight, 17, { out: true });
  assert.equal(named(events, 'gift-gone').length, 1);
  assert.deepEqual({ hearts: flight.hearts, dropped: flight.dropped, prizes: flight.stats.prizes }, before);

  const resting = flying({ levelNumber: 10 }).flight;
  fly(resting, 60, { out: false });
  assert.equal(resting.gift, null);
  assert.equal(resting.stats.gifts, 0);
});

/** A flight with a power on, and one pirate held in front of the ring. */
function withPower(kind, options = {}) {
  const { flight, events } = flying({ levelNumber: 10, planes: 6, ...options });
  flight.huntIn = 1000;
  flight.giftIn = 1000;
  const enemy = flight.flying.find((one) => one.kind === (options.kind ?? 'scout'));
  clearTheRest(flight, enemy);
  flight.startPower(kind);
  return { flight, events, enemy };
}

test('the triple shot fires three at a time, so a pirate drops three times as fast', () => {
  const hitsAfter = (power) => {
    const { flight, enemy } = power ? withPower(power, { kind: 'lead' }) : withPower('shield', { kind: 'lead' });
    if (!power) flight.endPower();
    enemy.hitsLeft = 1000;
    fly(flight, 1, () => {
      holdInFront(flight, enemy, { ahead: 100 });
      return { out: true };
    });
    return { hits: flight.stats.hits, triples: flight.shots.filter(({ kind }) => kind === 'triple').length };
  };
  const plain = hitsAfter(null);
  const triple = hitsAfter('triple');
  assert.ok(triple.hits >= plain.hits * 2.5, `${triple.hits} against ${plain.hits}`);
  assert.equal(triple.triples % 3, 0);
});

test('the bubble shot wraps a pirate up, and it floats gently down, but a captain or an airship is too big', () => {
  const { flight, events, enemy } = withPower('bubble', { kind: 'lead' });
  fly(flight, 2, () => {
    if (enemy.state === 'flying') holdInFront(flight, enemy, { ahead: 90 });
    return { out: true };
  });
  assert.equal(enemy.bubbled, true);
  assert.equal(named(events, 'bubbled').length, 1);
  assert.equal(enemy.state, 'falling');
  const from = enemy.y;
  fly(flight, 1, { out: true });
  assert.ok(from - enemy.y > 3 && from - enemy.y < 10, `sinks gently: ${from - enemy.y}`);

  const big = withPower('bubble', { kind: 'airship', planes: 3 });
  big.flight.wrap(big.enemy);
  assert.equal(big.enemy.bubbled, false);
  assert.equal(big.enemy.state, 'flying');
  assert.equal(big.enemy.hitsTotal - big.enemy.hitsLeft, 4);
});

test('the snowflake shot slows a pirate right down for a while', () => {
  const { flight, enemy } = withPower('snow', { kind: 'lead' });
  enemy.hitsLeft = 1000;
  fly(flight, 0.6, () => {
    holdInFront(flight, enemy, { ahead: 90 });
    return { out: true };
  });
  assert.ok(enemy.slowLeft > 0);
  // How far it goes in a second, slowed and not.
  const step = () => {
    const from = { x: enemy.x, z: enemy.z };
    fly(flight, 0.5, { out: true });
    return Math.hypot(enemy.x - from.x, enemy.z - from.z);
  };
  flight.endPower();
  enemy.slowLeft = 3;
  enemy.dodgeLeft = 0;
  const slowed = step();
  enemy.slowLeft = 0;
  const usual = step();
  assert.ok(slowed < usual * 0.7, `${slowed} against ${usual}`);
});

test('the shield bubble stops a pirate\'s shots from costing hearts', () => {
  const { flight, events } = withPower('shield', { level: 'tough' });
  for (let i = 0; i < 8; i += 1) flight.shots.push({ mine: false, x: flight.x, y: flight.y, z: flight.z, dx: 0, dy: 0, dz: 1, left: 0.01, hit: true });
  fly(flight, 0.1, { out: true });
  assert.equal(flight.hearts, HEARTS);
  assert.equal(flight.stats.blocked, 8);
  assert.equal(named(events, 'shielded').length, 8);
  flight.endPower();
  flight.shots.push({ mine: false, x: flight.x, y: flight.y, z: flight.z, dx: 0, dy: 0, dz: 1, left: 0.01, hit: true });
  fly(flight, 0.1, { out: true });
  assert.equal(flight.hearts, HEARTS - 1, 'and without it, they do as before');
});

test('a friend flies alongside and helps, and paper planes find their own way, but neither fires while resting', () => {
  for (const power of ['helper', 'paper']) {
    const { flight, enemy } = withPower(power, { kind: 'lead' });
    enemy.hitsLeft = 1000;
    // Off to the side of the ring, where the guns don't fire, but in front.
    fly(flight, 3, () => {
      holdInFront(flight, enemy, { ahead: 140, across: power === 'paper' ? 90 : 45 });
      return { out: true };
    });
    assert.equal(flight.locked, null, `${power}: not in the ring`);
    assert.ok(flight.stats.hits > 0, `${power}: hits all the same`);
    if (power === 'helper') assert.ok(Math.hypot(flight.helper.x - flight.x, flight.helper.z - flight.z) < 20, 'right beside');

    flight.power.left = 6;
    fly(flight, 4.5, { out: false });
    assert.equal(flight.resting, true);
    const left = flight.power.left;
    // Anything already on its way lands, and then nothing more is sent.
    fly(flight, 5.5, { out: false });
    const { hits } = flight.stats;
    fly(flight, 4, () => {
      holdInFront(flight, enemy, { ahead: 140, across: 45 });
      assert.equal(flight.shots.filter(({ mine }) => mine).length, 0, `${power}: nothing fired while resting`);
      return { out: false };
    });
    assert.equal(flight.stats.hits, hits);
    assert.ok(flight.power.left > left - 1.2, `${power}: and resting doesn't use the power up`);
  }
});

test('scouts need fewer hits and zigzag, but are never as fast as the child', () => {
  const { flight } = flying({ levelNumber: 4, planes: 3 });
  const [scout, pirate] = flight.flying;
  assert.equal(scout.kind, 'scout');
  assert.ok(scout.hitsTotal < pirate.hitsTotal);
  assert.ok(KINDS.scout.weave > flightLevel(10).weave);
  assert.ok(flightLevel(10, { gentle: true }).enemySpeed + KINDS.scout.faster < 0.96);
  // On the harder settings a scout at level 10 is held just under the child's speed: a fast one, to catch.
  const hard = flying({ level: 'medium', levelNumber: 10, planes: 9 }).flight;
  hard.huntIn = 1000;
  let most = 0;
  let seen = false;
  fly(hard, 4, () => {
    for (const enemy of hard.flying) {
      if (enemy.kind !== 'scout' || enemy.dodgeLeft > 0 || !(enemy.share <= 1.2)) continue;
      seen = true;
      most = Math.max(most, enemy.share);
    }
    return { out: true };
  });
  assert.ok(seen, 'a scout crossed');
  assert.ok(most <= 0.95, `crossing at ${most} of the child's speed`);
});

test('balloon pirates drift slowly, high up, and never hunt or shoot', () => {
  const { flight } = flying({ levelNumber: 6, planes: 3, level: 'tough' });
  const balloon = flight.flying.find(({ kind }) => kind === 'balloon');
  assert.ok(balloon.y > flight.y + 10, 'higher up');
  for (let i = 0; i < 400; i += 1) {
    flight.huntIn = 0;
    fly(flight, 0.1, huntingWell(flight));
    if (balloon.state !== 'flying') break;
    assert.notEqual(balloon.mode, 'hunt');
    assert.equal(balloon.burstLeft, 0);
  }
  assert.equal(KINDS.balloon.dodges, false);
});

test('a wingman keeps beside its leader', () => {
  const { flight } = flying({ levelNumber: 8, planes: 6 });
  const lead = flight.flying.find(({ kind }) => kind === 'lead');
  const wing = flight.flying.find(({ kind }) => kind === 'wing');
  assert.equal(wing.leader, lead);
  flight.huntIn = 1000;
  let furthest = 0;
  fly(flight, 20, () => {
    if (lead.state === 'flying' && wing.state === 'flying' && lead.mode === 'cross' && flight.time > 3) furthest = Math.max(furthest, Math.hypot(lead.x - wing.x, lead.z - wing.z));
    return { out: false };
  });
  assert.ok(furthest > 0 && furthest < 70, `furthest apart ${furthest}`);
});

test('a pair gets out of the way together: hitting either one sends its leader off, with the wingman beside it', () => {
  for (const shot of ['wing', 'lead']) {
    const { flight } = flying({ levelNumber: 8, planes: 6 });
    const lead = flight.flying.find(({ kind }) => kind === 'lead');
    const wing = flight.flying.find(({ kind }) => kind === 'wing');
    flight.huntIn = 1000;
    fly(flight, 4, { out: false });
    for (const one of [lead, wing]) one.hitsLeft = 1000;
    let furthest = 0;
    for (let i = 0; i < 4; i += 1) {
      flight.hit(shot === 'wing' ? wing : lead);
      assert.ok(lead.dodgeLeft > 0, `${shot}: its leader gets out of the way`);
      assert.equal(wing.dodgeLeft, 0, `${shot}: and the wingman goes with it, rather than its own way`);
      fly(flight, 1.5, () => {
        furthest = Math.max(furthest, Math.hypot(lead.x - wing.x, lead.z - wing.z));
        return { out: false };
      });
    }
    assert.ok(furthest < 70, `${shot}: furthest apart ${furthest}`);
  }
});

test('a wingman never goes hunting on its own while its leader flies: it comes along when its leader hunts', () => {
  const { flight } = flying({ levelNumber: 8, planes: 6, level: 'tough' });
  const lead = flight.flying.find(({ kind }) => kind === 'lead');
  const wing = flight.flying.find(({ kind }) => kind === 'wing');
  for (const one of flight.flying) one.hitsLeft = 1000;
  // Each hunt goes to the last plane there is to choose from, which the wingman would be, after its leader.
  assert.deepEqual(flight.flying.map(({ kind }) => kind), ['scout', 'lead', 'wing']);
  flight.random = () => 0.99;
  let leaderHunted = 0;
  let furthestHunting = 0;
  for (let i = 0; i < 900; i += 1) {
    flight.huntIn = 0;
    fly(flight, 0.1, huntingWell(flight));
    assert.notEqual(wing.mode, 'hunt', `at ${flight.time.toFixed(1)} s`);
    if (lead.mode === 'hunt') {
      leaderHunted += 1;
      furthestHunting = Math.max(furthestHunting, Math.hypot(lead.x - wing.x, lead.z - wing.z));
    }
  }
  assert.ok(leaderHunted > 0, 'its leader hunts');
  assert.ok(furthestHunting < 70, `the wingman beside it while it hunts: ${furthestHunting}`);
});

test('a wingman whose leader is already near comes in from the distance, like any pirate, and flies over to join it', () => {
  // Nine planes at level 8: the second pair's leader comes first, and its wingman later.
  const { flight } = flying({ levelNumber: 8, planes: 9 });
  flight.huntIn = 1000;
  assert.deepEqual(flight.plan.slice(6, 8), ['lead', 'wing']);
  // Drop all but one, until the second leader is in the air, near the child.
  let lead = null;
  for (let i = 0; i < 40 && !lead; i += 1) {
    lead = flight.flying.find(({ kind, index }) => kind === 'lead' && index === 6) ?? null;
    if (!lead) {
      dropNow(flight, flight.flying[0]);
      fly(flight, 1.2, { out: true });
    }
  }
  assert.ok(lead, 'the second leader came');
  holdInFront(flight, lead, { ahead: 80, across: 30 });
  for (const other of flight.flying.filter((one) => one !== lead)) dropNow(flight, other);
  fly(flight, 1.2, () => {
    holdInFront(flight, lead, { ahead: 80, across: 30 });
    return { out: true };
  });
  const wing = flight.enemies.find(({ kind, index }) => kind === 'wing' && index === 7);
  assert.ok(wing, 'its wingman came');
  assert.equal(wing.leader, lead);
  const fromChild = Math.hypot(wing.x - flight.x, wing.z - flight.z);
  assert.ok(fromChild > 200, `it came from the distance: ${fromChild}`);
  // And it comes to fly beside its leader.
  lead.mode = 'cross';
  let nearest = Infinity;
  fly(flight, 40, () => {
    if (lead.state === 'flying' && wing.state === 'flying') nearest = Math.min(nearest, Math.hypot(lead.x - wing.x, lead.z - wing.z));
    flight.huntIn = 1000;
    return { out: false };
  });
  assert.ok(nearest < 40, `beside its leader at last: ${nearest}`);
});

test('a wingman getting back to its leader is never quicker than a pirate can fly, so it never seems to jump', () => {
  for (const off of [25, 60, 200]) {
    const { flight } = flying({ levelNumber: 8, planes: 6 });
    flight.huntIn = 1000;
    const lead = flight.flying.find(({ kind }) => kind === 'lead');
    const wing = flight.flying.find(({ kind }) => kind === 'wing');
    // Away to one side, as after dodging.
    const spot = flight.wingSpot(lead);
    Object.assign(wing, { x: spot.x + off, z: spot.z + off / 2, dodgeLeft: 0, slowLeft: 0, mode: 'cross' });
    let fastest = 0;
    for (let i = 0; i < 60 * 6; i += 1) {
      const { x, y, z } = wing;
      flight.update(1 / 60, { out: false });
      if (wing.state !== 'flying' || wing.mode !== 'cross') break;
      fastest = Math.max(fastest, Math.hypot(wing.x - x, wing.y - y, wing.z - z) * 60);
    }
    assert.ok(fastest > 0 && fastest <= flight.pace.speed * 1.35, `${off} away: ${fastest / flight.pace.speed} times the child's speed`);
  }
});

test('with fewer planes to drop, what\'s new at a level still comes, and the cards only promise what does', () => {
  for (const planes of [1, 3, 6, 9]) {
    for (const level of LEVEL_NUMBERS.slice(1)) {
      const flight = new Flight({ planes, levelNumber: level });
      for (const { thing } of NEW_AT[level]) {
        if (!isOn(thing, level, planes)) continue;
        const [what, which] = thing.split(':');
        if (what === 'kind') assert.ok(flight.plan.includes(which === 'pair' ? 'lead' : which), `${planes} planes at ${level}: ${thing}`);
        if (what === 'atOnce') assert.ok(planes >= Number(which), `${planes} planes at ${level}: ${thing}`);
      }
    }
  }
  // Three planes: a pair and the captain at level 8, but never four in the air at once.
  assert.equal(isOn('kind:pair', 8, 3), true);
  assert.equal(isOn('atOnce:4', 9, 3), false);
  assert.equal(isOn('atOnce:4', 9, 6), true);
  // And every level still brings something, with three as with nine.
  for (const level of LEVEL_NUMBERS.slice(1)) assert.ok(NEW_AT[level].some(({ thing }) => isOn(thing, level, 3)), `${level}`);
});

test('losing tidies up as winning does: prizes on their way are counted, and the power, the friend and the gift box go', () => {
  const { flight, events } = flying({ levelNumber: 9, planes: 6, level: 'medium' });
  flight.startPower('helper');
  flight.placeGift('triple');
  dropNow(flight, flight.flying[0]);
  assert.equal(flight.prizes.length, 1, 'a prize on its way');
  flight.hearts = 1;
  flight.shots.push({ mine: false, x: flight.x, y: flight.y, z: flight.z, dx: 0, dy: 0, dz: 1, left: 0.01, hit: true });
  flight.update(1 / 30, { out: true });
  assert.equal(flight.state, 'lost');
  assert.deepEqual([flight.power, flight.helper, flight.gift, flight.prizes.length], [null, null, null, 0]);
  assert.equal(Object.values(flight.stats.prizes).reduce((sum, count) => sum + count, 0), 1, 'the prize on its way is counted');
  assert.ok(events.some(({ type, kind, on }) => type === 'power' && kind === 'helper' && on === false));
  // Nothing fires while it carries on round, and nothing stays hanging in the sky.
  const shots = flight.shots.length;
  fly(flight, 3, { out: true });
  assert.ok(flight.shots.length <= shots);
  assert.ok(!flight.shots.some(({ kind }) => kind === 'helper'));
});

test('the treasure airship takes twice the hits, never hunts, and goes down gently', () => {
  const { flight } = flying({ levelNumber: 10, planes: 3 });
  const airship = flight.flying.find(({ kind }) => kind === 'airship');
  assert.equal(airship.hitsTotal, LEVELS.gentle.enemyHits * 2);
  for (let i = 0; i < 100; i += 1) {
    flight.huntIn = 0;
    fly(flight, 0.1, { out: true });
    assert.notEqual(airship.mode, 'hunt');
  }
  dropNow(flight, airship);
  const from = airship.y;
  fly(flight, 1, { out: true });
  assert.ok(from - airship.y < 10);
});

test('nothing new can make a child lose who couldn\'t before: on Gentle at level 10, with every power, nobody is shot down', () => {
  const { flight } = flying({ levelNumber: 10, planes: 9 });
  for (const power of Object.keys(POWERS)) {
    flight.startPower(power);
    for (let i = 0; i < 12; i += 1) flight.hurt();
    fly(flight, 2, huntingWell(flight));
  }
  assert.notEqual(flight.state, 'lost');
  assert.ok(flight.hearts >= 1);
});

test('on Gentle, level 10 still gives at least 70% of the time to react: hunts come no more than a quarter more often, and last as long', () => {
  assert.ok(flightLevel(10, { gentle: true }).huntEvery >= 0.7);
  assert.ok(flightLevel(10, { gentle: true }).dodgeSeconds <= 2.4);
});

test('on Medium and Tough, level 10 leaves about half the time between hunts, and a hunt still lasts as long', () => {
  assert.equal(flightLevel(10).huntEvery, 0.5);
  const { flight } = flying({ level: 'medium', levelNumber: 10 });
  assert.deepEqual(flight.huntEvery, LEVELS.medium.huntEvery.map((seconds) => seconds * 0.5));
});
