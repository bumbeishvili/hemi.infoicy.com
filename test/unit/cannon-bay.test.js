// The rules of Cannon Bay. Its screen is tested in test/e2e/cannon-bay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Battle, HEARTS, HULL, LEVELS, MOST_AT_ONCE, MOST_HEARTS, NEWS, PACES, POWERS, REST_AFTER, SHIP_KINDS, challengePlan, forwardOf, levelPlan, newsAt } from '../../games/cannon-bay/battle.js';
import { BaySound } from '../../games/cannon-bay/bay-sound.js';
import { getChart } from '../../games/cannon-bay/chart.js';
import { Duel, SHIP_TRACK, duelSeconds, duelStart, shipWire } from '../../games/cannon-bay/duel.js';
import { WORLD, heightAt } from '../../games/sky-wings/island-map.js';
import { Track } from '../../core/friends.js';
import { MOST_BYTES, cleanFoes, cleanShip, cleanTag } from '../../server/race-room.js';
import { MOST_BALLS, MOST_PIRATES, TEAM_HITS, TeamBattle } from '../../games/cannon-bay/team.js';

const STEP = 1 / 30;
const OPEN = { open: true, seen: true, drive: 1, steer: 0 };
const CLOSED = { open: false, seen: true, drive: 0, steer: 0 };
const GONE = { open: false, seen: false, drive: 0, steer: 0 };

function seeded(seed = 7) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function start(options = {}) {
  const events = [];
  // Gentle, the game as it always was, unless a test says otherwise: the challenge has its own tests.
  const battle = new Battle({ random: seeded(), onEvent: (event) => events.push(event), level: 'gentle', ...options });
  battle.begin();
  return { battle, events, types: () => events.map(({ type }) => type) };
}

const run = (battle, seconds, input = OPEN) => {
  for (let i = 0; i < seconds / STEP; i += 1) battle.update(STEP, typeof input === 'function' ? input() : input);
};

/** Keeps a pirate this far off the bow, so a test is about one thing. Others go far away. */
function hold(battle, off, away = 90) {
  const [pirate, ...others] = battle.afloat;
  const direction = battle.heading + off;
  pirate.x = battle.x + Math.sin(direction) * away;
  pirate.z = battle.z - Math.cos(direction) * away;
  pirate.mode = 'circle';
  pirate.runAt = -1;
  pirate.fireIn = 100;
  pirate.burstLeft = 0;
  for (const other of others) {
    other.x = battle.x - Math.sin(battle.heading) * 600;
    other.z = battle.z + Math.cos(battle.heading) * 600;
    other.fireIn = 100;
    other.burstLeft = 0;
  }
  battle.broadsideIn = 100;
  return pirate;
}

const holding = (battle, seconds, off, input = OPEN, away = 90) => {
  let pirate = null;
  for (let i = 0; i < seconds / STEP; i += 1) {
    pirate = hold(battle, off, away);
    battle.update(STEP, input);
  }
  return pirate;
};

/** A ball that lands this far from the middle of the child's ship, right now. */
function ballAt(battle, x, z) {
  const ball = { from: { x, y: 5, z }, to: { x, z }, t: 0.999, seconds: 2, arc: 40, x, y: 1, z, harmless: false, pirate: null };
  battle.balls.push(ball);
  return ball;
}

const ballOnHull = (battle) => ballAt(battle, battle.x, battle.z);

/* ---------- the wheel and the sails ---------- */

test('moving the hand turns the wheel, and the ship with it', () => {
  const { battle } = start();
  run(battle, 2, OPEN);
  const before = battle.heading;
  run(battle, 1.5, { ...OPEN, steer: 1 });
  assert.ok(battle.wheel > 0.9);
  assert.ok(battle.heading > before + 0.3, `turned right ${battle.heading - before}`);
  const after = battle.heading;
  run(battle, 3, { ...OPEN, steer: -1 });
  assert.ok(battle.wheel < -0.9);
  assert.ok(battle.heading < after - 0.3, `turned left ${battle.heading - after}`);
});

test('with the hand in the middle the ship goes straight, and the wheel comes back', () => {
  const { battle } = start({ ships: 0 });
  run(battle, 1, { ...OPEN, steer: 1 });
  run(battle, 2, { ...OPEN, steer: 0 });
  assert.ok(Math.abs(battle.wheel) < 0.01);
  const before = battle.heading;
  run(battle, 1, OPEN);
  assert.ok(Math.abs(battle.heading - before) < 0.02);
});

test('an open hand raises the sails and the ship moves, and a closed hand lowers them', () => {
  const { battle } = start();
  assert.equal(battle.sails, 0);
  run(battle, 3, OPEN);
  assert.ok(battle.sails > 0.95, `sails ${battle.sails}`);
  assert.ok(battle.speed > PACES.slow.speed * 0.8, `speed ${battle.speed}`);
  const { speed } = battle;
  run(battle, 4, CLOSED);
  assert.ok(battle.sails < 0.01);
  assert.ok(battle.speed < speed * 0.3, `slowed to ${battle.speed}`);
  // It drifts, rather than stopping dead.
  run(battle, 8, CLOSED);
  assert.ok(battle.speed > 0.5);
  const { x, z } = battle;
  run(battle, 1, CLOSED);
  assert.ok(Math.hypot(battle.x - x, battle.z - z) > 0.5);
});

test('the wider the hand is open, the faster the ship goes', () => {
  const speedAt = (drive) => {
    const { battle } = start();
    run(battle, 6, { ...OPEN, drive });
    return battle.speed;
  };
  assert.ok(speedAt(1) > speedAt(0.9) + 2);
  assert.ok(speedAt(0.9) > speedAt(0.8) + 2);
  assert.ok(speedAt(0.8) > 0);
});

test('speed is a setting', () => {
  const speedAt = (pace) => {
    const { battle } = start({ pace });
    run(battle, 6, OPEN);
    return battle.speed;
  };
  assert.ok(speedAt('slow') < speedAt('medium'));
  assert.ok(speedAt('medium') < speedAt('fast'));
});

test('a closed hand can still turn the wheel, but a hand that can\'t be seen turns nothing', () => {
  const { battle } = start();
  run(battle, 1, { ...CLOSED, steer: 1 });
  assert.ok(battle.wheel > 0.9);
  run(battle, 2, GONE);
  assert.ok(Math.abs(battle.wheel) < 0.01);
});

test('numbers that make no sense count as nothing, never as an open hand', () => {
  const { battle } = start();
  run(battle, 2, { open: false, seen: false, drive: Number.NaN, steer: Number.NaN });
  assert.equal(battle.sails, 0);
  assert.equal(battle.wheel, 0);
  assert.ok(Number.isFinite(battle.heading) && Number.isFinite(battle.x));
  // Only true counts: an open hand can't be anything else.
  battle.update(STEP, { open: 'yes', seen: 'yes', drive: 1 });
  assert.equal(battle.canFire, false);
  assert.equal(battle.sails, 0);
});

/* ---------- the firing zones ---------- */

test('a pirate in a firing zone gets fired at with an open hand, and hit, on that side only', () => {
  const { battle, events } = start();
  holding(battle, 2, Math.PI / 2);
  assert.equal(battle.zones.right.firing, true);
  assert.equal(battle.zones.left.firing, false);
  assert.ok(battle.stats.shots >= 4);
  assert.ok(battle.stats.hits >= 3);
  assert.ok(events.filter(({ type }) => type === 'fire').every(({ side }) => side === 'right'));
});

test('the zone on the left fires to the left', () => {
  const { battle, events } = start();
  holding(battle, 1, -Math.PI / 2);
  assert.equal(battle.zones.left.firing, true);
  assert.equal(battle.zones.right.firing, false);
  assert.ok(events.filter(({ type }) => type === 'fire').every(({ side }) => side === 'left'));
  assert.ok(events.some(({ type }) => type === 'fire'));
});

test('a closed hand doesn\'t fire', () => {
  const { battle } = start();
  holding(battle, 2, Math.PI / 2, CLOSED);
  assert.equal(battle.stats.shots, 0);
  assert.equal(battle.zones.right.firing, false);
  // The zone can still see it, which is what asks the child to open their hand.
  assert.equal(battle.zones.right.inside, true);
});

test('a hand out of view doesn\'t fire, even when the cannons are set to fire always', () => {
  for (const cannons of ['open', 'always']) {
    const { battle } = start({ cannons });
    holding(battle, 2, Math.PI / 2, GONE);
    assert.equal(battle.stats.shots, 0, cannons);
  }
});

test('set to always, the cannons fire with a closed hand that\'s in view', () => {
  const { battle } = start({ cannons: 'always' });
  holding(battle, 2, Math.PI / 2, CLOSED);
  assert.ok(battle.stats.shots >= 4);
});

test('closing the hand stops the cannons at once', () => {
  const { battle } = start();
  holding(battle, 1, Math.PI / 2, OPEN);
  const { shots } = battle.stats;
  assert.ok(shots > 0);
  holding(battle, 2, Math.PI / 2, CLOSED);
  assert.equal(battle.stats.shots, shots);
});

test('straight ahead, straight behind or far away is outside the zones', () => {
  const { battle } = start();
  holding(battle, 1, 0.05);
  holding(battle, 1, Math.PI - 0.05);
  holding(battle, 1, Math.PI / 2, OPEN, LEVELS.gentle.zone.reach + 60);
  assert.equal(battle.stats.shots, 0);
});

test('any part of a ship in a zone counts, as what\'s seen there is what gets fired at', () => {
  const { battle } = start();
  const [pirate] = battle.afloat;
  const { from, reach } = LEVELS.gentle.zone;
  // Its middle is just past the far edge, along the line of the zone's front edge, and it's lying
  // with its bow pointing back towards the ship.
  const direction = battle.heading + from + 0.05;
  pirate.x = battle.x + Math.sin(direction) * (reach + 8);
  pirate.z = battle.z - Math.cos(direction) * (reach + 8);
  pirate.heading = Math.atan2(battle.x - pirate.x, -(battle.z - pirate.z));
  assert.equal(battle.zoneOf(pirate), 'right');
  pirate.heading += Math.PI / 2;
  assert.equal(battle.zoneOf(pirate), null);
});

test('the zones are generous on Gentle, and shrink on the harder settings', () => {
  const { gentle, medium, tough } = LEVELS;
  const size = ({ zone }) => (zone.to - zone.from) * zone.reach;
  assert.ok(size(gentle) > size(medium) && size(medium) > size(tough));
  // There's no way of being alongside without being in it.
  assert.ok(gentle.zone.from < Math.PI / 4 && gentle.zone.to > (Math.PI * 2) / 3);
});

test('the ship turns a little by itself to keep a nearby pirate alongside, only with an open hand', () => {
  const turned = (input, off) => {
    const { battle } = start();
    run(battle, 1, OPEN);
    const before = battle.heading;
    holding(battle, 1.5, off, input, 120);
    return battle.heading - before;
  };
  // Nearly ahead on the right: it turns away to the left, to bring it onto the beam.
  assert.ok(turned(OPEN, 0.3) < -0.1);
  // Well behind on the right: it turns right, to bring it forward.
  assert.ok(turned(OPEN, 2.7) > 0.1);
  assert.equal(turned(CLOSED, 0.3), 0);
  assert.equal(turned(GONE, 0.3), 0);
});

test('help with lining up is less on the harder settings', () => {
  const turned = (level) => {
    const { battle } = start({ level });
    run(battle, 1, OPEN);
    const before = battle.heading;
    holding(battle, 1, 0.3, OPEN, 120);
    return Math.abs(battle.heading - before);
  };
  assert.ok(turned('gentle') > turned('medium'));
  assert.ok(turned('medium') > turned('tough'));
});

/* ---------- pirates ---------- */

test('a few pirates at a time, on the water, and another as soon as one is beaten', () => {
  const { battle, types } = start({ ships: 6 });
  assert.equal(battle.afloat.length, MOST_AT_ONCE);
  assert.equal(battle.waiting, 3);
  const chart = getChart();
  for (const { x, z } of battle.afloat) assert.ok(chart.room(x, z) > 40);
  const [first] = battle.afloat;
  while (first.state === 'sailing') battle.hit(first, first);
  assert.equal(battle.beaten, 1);
  assert.ok(types().includes('beaten'));
  run(battle, 1.1, OPEN);
  assert.equal(battle.afloat.length, MOST_AT_ONCE);
  assert.equal(battle.waiting, 2);
});

test('they come up in the sea however close to land the child is', () => {
  const chart = getChart();
  for (let angle = 0; angle < Math.PI * 2; angle += 0.3) {
    const battle = new Battle({ random: seeded(11) });
    // Pointing straight at the coast.
    battle.x = Math.cos(angle) * 560;
    battle.z = Math.sin(angle) * 560;
    battle.heading = Math.atan2(-battle.x, battle.z);
    battle.begin();
    for (const { x, z } of battle.afloat) assert.ok(chart.room(x, z) > 40 && Math.hypot(x, z) <= WORLD.limit, `${x}, ${z}`);
  }
});

test('they come to the child, and turn side on to fire slow balls in a high arc', () => {
  const { battle, events } = start();
  run(battle, 40, { ...CLOSED, seen: true });
  const fired = events.filter(({ type }) => type === 'pirate-fire');
  // A closed hand rests after a while, so nothing here is about that: this is a hand that stays open.
  const open = start();
  for (let i = 0; i < 40 / STEP; i += 1) {
    // The ship is kept nearly still, and holds its fire, by nobody being in range of its zones.
    open.battle.zones.left.reload = 100;
    open.battle.zones.right.reload = 100;
    open.battle.update(STEP, { ...OPEN, drive: 0.8 });
  }
  const shots = open.events.filter(({ type }) => type === 'pirate-fire');
  assert.ok(fired.length <= shots.length);
  assert.ok(shots.length >= 2, `${shots.length} balls`);
  for (const { ball } of shots) {
    assert.ok(ball.seconds >= 2, 'slow');
    assert.ok(ball.arc >= 30, 'high');
  }
});

test('a ball that lands away from the ship makes a splash, and costs nothing', () => {
  const { battle, types } = start();
  ballAt(battle, battle.x + 40, battle.z + 40);
  battle.update(STEP, OPEN);
  assert.equal(battle.hearts, HEARTS);
  assert.ok(types().includes('splash'));
  assert.ok(!types().includes('hurt'));
});

test('a ball that lands on the ship costs a heart, and they come back with time', () => {
  const { battle, types } = start();
  ballOnHull(battle);
  battle.update(STEP, OPEN);
  assert.equal(battle.hearts, HEARTS - 1);
  assert.ok(types().includes('hurt'));
  battle.pirates.length = 0;
  battle.waiting = 0;
  run(battle, LEVELS.gentle.healAfter + 0.5, OPEN);
  assert.equal(battle.hearts, HEARTS);
  assert.ok(types().includes('healed'));
});

test('the hull is long and thin: a ball past the bow or beside the bow counts as it should', () => {
  const { battle } = start();
  const forward = forwardOf(battle.heading);
  assert.equal(battle.distanceFromHull(battle.x + forward.x * HULL.half, battle.z + forward.z * HULL.half), 0);
  const past = battle.distanceFromHull(battle.x + forward.x * (HULL.half + 30), battle.z + forward.z * (HULL.half + 30));
  assert.ok(Math.abs(past - 30) < 1e-6);
});

test('on Gentle the child can\'t be sunk: hearts stop at one', () => {
  const { battle, types } = start({ level: 'gentle' });
  for (let i = 0; i < HEARTS * 3; i += 1) {
    ballOnHull(battle);
    battle.update(STEP, OPEN);
    assert.ok(battle.hearts >= 1);
  }
  assert.equal(battle.hearts, 1);
  assert.equal(battle.state, 'sailing');
  assert.ok(!types().includes('lost'));
});

test('on the harder settings running out of hearts ends the battle', () => {
  for (const level of ['medium', 'tough']) {
    const { battle, types } = start({ level });
    for (let i = 0; i < HEARTS; i += 1) {
      ballOnHull(battle);
      battle.update(STEP, OPEN);
    }
    assert.equal(battle.hearts, 0);
    assert.equal(battle.state, 'lost');
    assert.ok(types().includes('lost'));
    // And it stays harmless afterwards.
    ballOnHull(battle);
    battle.update(STEP, OPEN);
    assert.equal(battle.hearts, 0);
  }
});

/* ---------- resting ---------- */

for (const [name, input] of [['closed', CLOSED], ['gone', GONE]]) {
  test(`a hand that's ${name} for a while is a rest: no firing, and the pirates sail in circles`, () => {
    const { battle, events, types } = start();
    run(battle, 12, OPEN);
    const ball = ballOnHull(battle);
    ball.t = 0.5; // It's still in the air when the rest begins.
    run(battle, REST_AFTER + 0.5, input);
    assert.equal(battle.resting, true);
    assert.ok(types().includes('resting'));
    const { hurts } = battle.stats;
    const fired = events.filter(({ type }) => type === 'pirate-fire').length;
    run(battle, 60, input);
    assert.equal(events.filter(({ type }) => type === 'pirate-fire').length, fired);
    assert.equal(battle.stats.hurts, hurts);
    assert.equal(battle.state, 'sailing');
    assert.ok(battle.afloat.every(({ mode }) => mode === 'circle'));
    assert.equal(battle.balls.length, 0);
  });
}

test('a ball already in the air when the rest begins lands harmlessly', () => {
  const { battle } = start();
  const ball = ballOnHull(battle);
  ball.t = 0;
  ball.seconds = 3;
  for (let i = 0; i < (REST_AFTER + 0.2) / STEP; i += 1) {
    ball.t = Math.min(ball.t, 0.5);
    battle.update(STEP, CLOSED);
  }
  assert.equal(battle.resting, true);
  assert.equal(ball.harmless, true);
  run(battle, 3, CLOSED);
  assert.equal(battle.hearts, HEARTS);
});

test('opening the hand ends a rest, with a moment before anyone fires again', () => {
  const { battle, events } = start();
  run(battle, 10, CLOSED);
  assert.equal(battle.resting, true);
  const fired = events.filter(({ type }) => type === 'pirate-fire').length;
  battle.update(STEP, OPEN);
  assert.equal(battle.resting, false);
  run(battle, 1.5, OPEN);
  assert.equal(events.filter(({ type }) => type === 'pirate-fire').length, fired);
  assert.ok(battle.afloat.every(({ mode }) => mode !== 'circle'));
});

test('a short close is not a rest, as closing is never a failure and never a pause either', () => {
  const { battle } = start();
  run(battle, REST_AFTER - 0.5, CLOSED);
  assert.equal(battle.resting, false);
  run(battle, 1, OPEN);
  run(battle, REST_AFTER - 0.5, CLOSED);
  assert.equal(battle.resting, false);
});

/* ---------- the land and the edge of the world ---------- */

/** Steers as badly as possible: straight at the middle of the island, at full speed. */
const straightAtTheMiddle = (battle) => {
  const wanted = Math.atan2(-battle.x, battle.z);
  const off = Math.atan2(Math.sin(wanted - battle.heading), Math.cos(wanted - battle.heading));
  return { ...OPEN, steer: Math.max(-1, Math.min(1, off * 3)) };
};

const LEAST_ROOM = 20;

test('the ship can\'t hit the land, however it\'s steered, from anywhere', () => {
  const chart = getChart();
  for (let angle = 0; angle < Math.PI * 2; angle += 0.25) {
    const { battle } = start({ ships: 0, pace: 'fast' });
    battle.x = Math.cos(angle) * 950;
    battle.z = Math.sin(angle) * 950;
    battle.heading = Math.atan2(-battle.x, battle.z);
    for (let i = 0; i < 60 / STEP; i += 1) {
      battle.update(STEP, straightAtTheMiddle(battle));
      assert.ok(chart.room(battle.x, battle.z) > LEAST_ROOM, `room ${chart.room(battle.x, battle.z)} at ${battle.x}, ${battle.z}`);
      assert.ok(heightAt(battle.x, battle.z) < 0);
    }
  }
});

test('held full over in either direction, it goes round and round without ever hitting anything', () => {
  const chart = getChart();
  for (const steer of [1, -1]) {
    const { battle } = start({ ships: 0, pace: 'fast' });
    battle.x = -450;
    battle.z = 330;
    for (let i = 0; i < 90 / STEP; i += 1) {
      battle.update(STEP, { ...OPEN, steer });
      assert.ok(chart.room(battle.x, battle.z) > LEAST_ROOM);
    }
  }
});

test('near the coast it\'s steered along it rather than stopping, so it gets somewhere', () => {
  const { battle } = start({ ships: 0 });
  const startAt = { x: battle.x, z: battle.z };
  let furthest = 0;
  for (let i = 0; i < 60 / STEP; i += 1) {
    battle.update(STEP, straightAtTheMiddle(battle));
    furthest = Math.max(furthest, Math.hypot(battle.x - startAt.x, battle.z - startAt.z));
  }
  assert.ok(furthest > 500, `only got ${furthest} away`);
  assert.ok(battle.speed > PACES.slow.speed * 0.8, 'it kept its speed');
});

test('the ship can\'t leave the world: it\'s turned back before the edge', () => {
  for (let angle = 0; angle < Math.PI * 2; angle += 0.4) {
    const { battle, types } = start({ ships: 0, pace: 'fast' });
    battle.x = Math.cos(angle) * 900;
    battle.z = Math.sin(angle) * 900;
    // Straight out to sea, with the wheel fighting to keep it going that way.
    battle.heading = Math.atan2(battle.x, -battle.z);
    let most = 0;
    for (let i = 0; i < 40 / STEP; i += 1) {
      const wanted = Math.atan2(battle.x, -battle.z);
      const off = Math.atan2(Math.sin(wanted - battle.heading), Math.cos(wanted - battle.heading));
      battle.update(STEP, { ...OPEN, steer: Math.max(-1, Math.min(1, off * 3)) });
      most = Math.max(most, Math.hypot(battle.x, battle.z));
    }
    assert.ok(most <= WORLD.limit + 0.001, `${most}`);
    assert.ok(types().includes('limit'));
  }
});

test('the pirates and their lifeboats stay on the water too', () => {
  const chart = getChart();
  const { battle } = start({ ships: 9, pace: 'fast', level: 'tough' });
  battle.x = 200;
  battle.z = 600;
  for (let i = 0; i < 120 / STEP; i += 1) {
    battle.update(STEP, { ...OPEN, steer: Math.sin(i / 200) });
    for (const ship of [...battle.afloat, ...battle.boats]) {
      // Squeezed between the child's ship and the shore it can get close, but it's still in deep water.
      assert.ok(chart.room(ship.x, ship.z) > 5, `room ${chart.room(ship.x, ship.z)}`);
      assert.ok(heightAt(ship.x, ship.z) < -3);
      assert.ok(Math.hypot(ship.x, ship.z) <= WORLD.limit + 0.001);
    }
    if (battle.state !== 'sailing') break;
  }
});

test('nobody sails into the place the child watches from', () => {
  const { battle } = start({ ships: 3 });
  const [pirate] = battle.afloat;
  const forward = forwardOf(battle.heading);
  for (let i = 0; i < 300; i += 1) {
    pirate.x = battle.x - forward.x * 72;
    pirate.z = battle.z - forward.z * 72;
    battle.update(STEP, OPEN);
    const mine = forwardOf(battle.heading);
    assert.ok(Math.hypot(pirate.x - (battle.x - mine.x * 72), pirate.z - (battle.z - mine.z * 72)) > 30);
  }
});

test('nothing ever sits on top of anything else: ships slide apart', () => {
  const { battle } = start({ pace: 'slow' });
  for (let i = 0; i < 90 / STEP; i += 1) {
    battle.update(STEP, CLOSED);
    for (const pirate of battle.afloat) assert.ok(Math.hypot(pirate.x - battle.x, pirate.z - battle.z) > 30);
  }
});

/* ---------- from start to finish ---------- */

const nearestOf = (battle) => battle.afloat.slice().sort((a, b) => Math.hypot(a.x - battle.x, a.z - battle.z) - Math.hypot(b.x - battle.x, b.z - battle.z))[0];
const wheelFor = (battle, wanted) => {
  const off = Math.atan2(Math.sin(wanted - battle.heading), Math.cos(wanted - battle.heading));
  return { ...OPEN, steer: Math.max(-1, Math.min(1, off * 2)) };
};

/** A child steering straight for the nearest pirate, as anyone might at first. */
const sailAtThem = (battle) => {
  const nearest = nearestOf(battle);
  if (!nearest) return OPEN;
  return wheelFor(battle, Math.atan2(nearest.x - battle.x, -(nearest.z - battle.z)));
};

/** A child who has got the idea: straight for the nearest until it's near, then alongside it. */
const sailBeside = (battle) => {
  const nearest = nearestOf(battle);
  if (!nearest) return OPEN;
  const to = Math.atan2(nearest.x - battle.x, -(nearest.z - battle.z));
  if (Math.hypot(nearest.x - battle.x, nearest.z - battle.z) > battle.level.zone.reach * 0.8) return wheelFor(battle, to);
  const off = Math.atan2(Math.sin(to - battle.heading), Math.cos(to - battle.heading));
  return wheelFor(battle, to - (off >= 0 ? 1 : -1) * (Math.PI / 2));
};

for (const ships of [4, 6, 9]) {
  for (const [pace, level, steering, most] of [['slow', 'gentle', sailAtThem, 170], ['medium', 'medium', sailAtThem, 300], ['fast', 'tough', sailBeside, 480]]) {
    test(`${ships} ships at ${pace} speed on ${level}: the whole game can be finished, steering as a child might`, () => {
      const { battle, types } = start({ ships, pace, level, random: seeded(ships * 13) });
      let seconds = 0;
      while (battle.state === 'sailing' && seconds < 900) {
        battle.update(STEP, steering(battle));
        // Hearts might run out on the harder settings. That's for another test.
        if (battle.state === 'sailing') battle.hearts = Math.max(battle.hearts, 2);
        seconds += STEP;
      }
      assert.equal(battle.state, 'won');
      assert.equal(battle.beaten, ships);
      assert.equal(battle.left, 0);
      assert.equal(types().filter((type) => type === 'beaten').length, ships);
      assert.ok(types().includes('won'));
      assert.ok(seconds < ships * (most / 6), `took ${Math.round(seconds)} seconds`);
    });
  }
}

test('with the child going round and round, a pirate that hasn\'t been hit slows down to be caught', () => {
  const { battle } = start({ ships: 1, level: 'tough' });
  const [pirate] = battle.afloat;
  run(battle, 2, { ...OPEN, steer: 1 });
  pirate.sinceHit = 17;
  const direction = battle.heading - 2.8;
  pirate.x = battle.x + Math.sin(direction) * 150;
  pirate.z = battle.z - Math.cos(direction) * 150;
  pirate.mode = 'side';
  pirate.modeLeft = 8;
  for (let i = 0; i < 3 / STEP; i += 1) {
    pirate.sinceHit = 17;
    battle.update(STEP, { ...OPEN, steer: 1 });
  }
  assert.ok(pirate.speed < battle.pace.speed * 0.6, `${pirate.speed}`);
});

test('a child who does nothing but hold their hand open still gets there, as the pirates come to them', () => {
  const { battle } = start({ ships: 4 });
  let seconds = 0;
  while (battle.state === 'sailing' && seconds < 300) {
    battle.update(STEP, OPEN);
    seconds += STEP;
  }
  assert.equal(battle.state, 'won');
});

test('every crew gets away in a lifeboat, and a beaten ship slowly sinks with its sails down', () => {
  const { battle, events } = start({ ships: 3 });
  const [pirate] = battle.afloat;
  while (pirate.state === 'sailing') battle.hit(pirate, pirate);
  assert.equal(pirate.state, 'sinking');
  const { boat } = events.find(({ type }) => type === 'beaten');
  assert.ok(boat);
  assert.equal(battle.boats.length, 1);
  const { x, z } = boat;
  run(battle, 2, CLOSED);
  assert.ok(pirate.sails < 0.1, 'sails down');
  assert.ok(pirate.sink > 0.2 && pirate.sink < 0.5, `slowly: ${pirate.sink}`);
  assert.ok(Math.hypot(boat.x - x, boat.z - z) > 5, 'rowing');
  run(battle, 6, CLOSED);
  assert.ok(!battle.pirates.includes(pirate), 'gone');
  assert.equal(battle.boats.length, 1, 'still rowing after the ship has gone');
  run(battle, 8, CLOSED);
  assert.equal(battle.boats.length, 0);
  assert.equal(battle.stats.crewsAway, 1);
});

test('a beaten ship leaves gold on the water, and sailing through it picks it up', () => {
  const chart = getChart();
  const { battle, types } = start({ ships: 3 });
  const [pirate] = battle.afloat;
  pirate.x = battle.x + 100;
  pirate.z = battle.z;
  while (pirate.state === 'sailing') battle.hit(pirate, pirate);
  assert.ok(battle.coins.length >= 4);
  for (const { x, z } of battle.coins) assert.ok(chart.room(x, z) > 5);
  // The line leads towards the child's ship.
  const [first, second] = battle.coins;
  assert.ok(Math.hypot(second.x - battle.x, second.z - battle.z) < Math.hypot(first.x - battle.x, first.z - battle.z));
  const coins = battle.coins.length;
  // On top of the nearest, and it's gone, and counted.
  battle.x = second.x;
  battle.z = second.z;
  battle.update(STEP, CLOSED);
  assert.ok(battle.stats.gold >= 1);
  assert.ok(battle.coins.length < coins);
  assert.ok(types().includes('gold'));
});

test('gold that isn\'t picked up goes in the end, and that costs nothing', () => {
  const { battle } = start({ ships: 3 });
  const [pirate] = battle.afloat;
  pirate.x = battle.x + 300;
  pirate.z = battle.z;
  while (pirate.state === 'sailing') battle.hit(pirate, pirate);
  battle.x -= 200;
  const { hearts } = battle;
  run(battle, 30, CLOSED);
  assert.equal(battle.coins.length, 0);
  assert.equal(battle.hearts, hearts);
});

test('winning takes a moment, so that the last ship can be seen going down', () => {
  const { battle, types } = start({ ships: 1 });
  const [pirate] = battle.afloat;
  while (pirate.state === 'sailing') battle.hit(pirate, pirate);
  assert.equal(battle.state, 'sailing');
  assert.equal(battle.left, 0);
  run(battle, 3, OPEN);
  assert.equal(battle.state, 'won');
  assert.ok(types().includes('won'));
  // It all carries on quietly, with a lap of honour under full sail whatever the hand is doing.
  const { x, z } = battle;
  run(battle, 3, GONE);
  assert.ok(Math.hypot(battle.x - x, battle.z - z) > 1);
  assert.ok(battle.sails > 0.8);
  assert.equal(battle.canFire, false);
});

test('the numbers for the finish: ships beaten, seconds open and times it opened', () => {
  const { battle } = start();
  run(battle, 2, OPEN);
  run(battle, 1, CLOSED);
  run(battle, 3, OPEN);
  run(battle, 1, GONE);
  run(battle, 1, OPEN);
  assert.ok(Math.abs(battle.stats.openSeconds - 6) < 0.1);
  assert.equal(battle.stats.openings, 3);
  assert.ok(Math.abs(battle.stats.seconds - 8) < 0.1);
});

/* ---------- what's said ---------- */

const FOLDER = new URL('../../games/cannon-bay/audio/voice/', import.meta.url);
const MOST_WORDS = 11;

test('it keeps its talking short, and everything it says has a voice in both languages', () => {
  const lines = JSON.parse(readFileSync(new URL('lines.json', FOLDER)));
  const source = readFileSync(new URL('../../games/cannon-bay/main.js', import.meta.url), 'utf8');
  for (const { id, text, ka } of lines) {
    assert.ok(text.split(/\s+/).length <= MOST_WORDS, `too long: ${text}`);
    assert.match(ka, /[Ⴀ-ჿ]/, id);
    for (const language of ['en', 'ka']) assert.ok(existsSync(new URL(`${language}/${id}.ogg`, FOLDER)), `${language}/${id}`);
    assert.ok(source.includes(text), `nothing says: ${text}`);
  }
  assert.ok(lines.length <= 20, `${lines.length} lines`);
});

test('every captain\'s line is in that character\'s own voice', () => {
  const lines = JSON.parse(readFileSync(new URL('lines.json', FOLDER)));
  const shared = JSON.parse(readFileSync(new URL('../../core/body/voice/lines.json', import.meta.url)));
  const voiceOf = Object.fromEntries(shared.filter(({ id }) => id.startsWith('shout-')).map((line) => [line.id.slice('shout-'.length), line]));
  const said = lines.filter(({ id }) => id.startsWith('captain-') || id.startsWith('giraffe-'));
  assert.ok(said.length >= 10);
  for (const { id, voice, kaVoice, kaPitch } of said) {
    const who = id.split('-')[id.startsWith('captain-') ? 1 : 0];
    assert.equal(voice, voiceOf[who].voice, id);
    assert.equal(kaVoice, voiceOf[who].kaVoice, id);
    assert.equal(kaPitch, voiceOf[who].kaPitch, id);
  }
});

test('the game has no method called then, which await would take for a promise', () => {
  assert.equal(new Battle().then, undefined);
  const source = readFileSync(new URL('../../games/cannon-bay/main.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /^\s+then\s*\(/m);
});

/* ---------- levels ---------- */

const LEVEL_NUMBERS = Array.from({ length: 10 }, (_, index) => index + 1);
// Which way is harder for each thing a level changes: up, down, or switched on.
const NEW_THINGS = ['gems', 'triple', 'sailors', 'hearts', 'rafts', 'shield', 'bubble', 'keys', 'magnet', 'smoke', 'mist', 'subs', 'bounce', 'snow', 'king', 'sunset'];
const HARDER = { fireEvery: 'down', apart: 'down', chase: 'up', side: 'down', runEvery: 'down', weave: 'on', sloops: 'on', atOnce: 'up', balls: 'up', flagship: 'on', ...Object.fromEntries(NEW_THINGS.map((key) => [key, 'on'])) };

test('level 1 is the game as it always was', () => {
  const plan = levelPlan(1);
  // levelPlan(1) as it was before the levels brought anything new.
  const before = { fireEvery: 1, apart: 1, chase: 1, side: 1, runEvery: 0.33, weave: false, sloops: false, atOnce: 0, balls: 0, flagship: false };
  for (const [key, value] of Object.entries(before)) assert.equal(plan[key], value, key);
  for (const key of NEW_THINGS) assert.equal(plan[key], false, key);
  for (const key of ['fireEvery', 'apart', 'chase', 'side']) assert.equal(plan[key], 1, key);
  assert.equal(plan.runEvery, 0.33);
  assert.deepEqual([plan.weave, plan.sloops, plan.atOnce, plan.balls, plan.flagship], [false, false, 0, 0, false]);
  // Plain ships only, which drop only their line of gold, and the cannons fire as they always did.
  const { battle, types } = start({ ships: 9, levelNumber: 1 });
  assert.ok(battle.roles.every(({ kind, cage, key }) => kind === 'ship' && !cage && !key));
  assert.deepEqual(battle.bonuses, []);
  const [pirate] = battle.afloat;
  while (pirate.state === 'sailing') battle.hit(pirate, pirate);
  assert.ok(battle.coins.length > 0);
  assert.deepEqual(battle.prizes, []);
  assert.equal(battle.fireKind, 'ball');
  assert.ok(!types().includes('drop'));
  for (const level of Object.keys(LEVELS)) {
    const { battle } = start({ level, ships: 9, levelNumber: 1 });
    assert.equal(battle.level, LEVELS[level]);
    assert.equal(battle.mostAtOnce, MOST_AT_ONCE);
    assert.equal(battle.afloat.length, MOST_AT_ONCE);
    for (const pirate of battle.afloat) {
      assert.equal(pirate.kind, 'ship');
      assert.equal(pirate.hitsLeft, LEVELS[level].shipHits);
    }
  }
});

test('each level is the same or harder than the one before in every way, and harder in at least one', () => {
  assert.deepEqual(Object.keys(levelPlan(1)).sort(), Object.keys(HARDER).sort());
  for (const level of LEVEL_NUMBERS.slice(1)) {
    const before = levelPlan(level - 1);
    const now = levelPlan(level);
    let harder = 0;
    for (const [key, way] of Object.entries(HARDER)) {
      const [a, b] = way === 'down' ? [now[key], before[key]] : [Number(before[key]), Number(now[key])];
      assert.ok(a <= b, `level ${level}: ${key} got easier`);
      if (a < b) harder += 1;
    }
    assert.ok(harder >= 1, `level ${level} is no harder than ${level - 1}`);
  }
  for (const key of ['weave', 'sloops', 'atOnce', 'balls', 'flagship']) assert.ok(LEVEL_NUMBERS.find((level) => Number(levelPlan(level)[key]) > 0) >= 3, key);
});

test('each level from 2 brings something new, listed for the cards, and nothing at level 1', () => {
  assert.deepEqual(newsAt(1), []);
  for (const level of LEVEL_NUMBERS.slice(1)) {
    const news = newsAt(level);
    assert.ok(news.length >= 1 && news.length <= 2, `level ${level}: ${news.length}`);
    for (const item of news) {
      assert.match(item.mark, /\p{Extended_Pictographic}/u, item.name);
      assert.ok(item.name.split(' ').length <= 3, item.name);
      assert.match(item.nameKa, /[\u10D0-\u10FF]/, item.name);
      // Really switched on from that level, and not before.
      assert.ok(Number(levelPlan(level)[item.key]) > 0, `${item.key} at ${level}`);
      assert.ok(!(Number(levelPlan(level - 1)[item.key]) > 0), `${item.key} before ${level}`);
    }
  }
  // Every new thing in levelPlan is on the cards somewhere.
  for (const key of NEW_THINGS) assert.ok(NEWS.some((item) => item.key === key), key);
});

test('each new kind of ship comes along in its level, even in a battle of only four, and straight away', () => {
  for (const [level, kind] of [[4, 'raft'], [5, 'sloop'], [7, 'smoky'], [8, 'sub'], [9, 'flagship'], [10, 'king']]) {
    for (const ships of [4, 6, 9]) {
      const { battle } = start({ ships, levelNumber: level });
      const kinds = battle.roles.map((role) => role.kind);
      assert.ok(kinds.includes(kind), `${kind} at level ${level} with ${ships}`);
      // The newest is the first one out, unless it's the last, as a flagship or the king is.
      if (!['flagship', 'king'].includes(kind)) assert.equal(battle.afloat[0].kind, kind);
      else assert.equal(kinds.at(-1), kind);
    }
  }
  // A sailor to rescue from level 3, and a key from level 6, in any battle.
  for (const ships of [4, 6, 9]) {
    for (const level of [3, 6, 10]) {
      const { battle } = start({ ships, levelNumber: level });
      assert.ok(battle.roles.some(({ cage }) => cage), `cage at ${level} with ${ships}`);
      assert.equal(battle.roles.some(({ key }) => key), level >= 6, `key at ${level} with ${ships}`);
      assert.ok(!battle.roles.at(-1).cage, 'not on the last');
    }
  }
});

test('a level never changes what a grown-up chose: the zones, the help with lining up, Gentle, the cannons or how many ships', () => {
  for (const level of LEVEL_NUMBERS) {
    const { battle } = start({ levelNumber: level, ships: 4, cannons: 'always' });
    assert.equal(battle.level, LEVELS.gentle);
    assert.equal(battle.cannons, 'always');
    assert.equal(battle.total, 4);
    assert.equal(battle.hearts, HEARTS);
  }
  const { battle, types } = start({ levelNumber: 10 });
  for (let i = 0; i < HEARTS * 3; i += 1) {
    ballOnHull(battle);
    battle.update(STEP, OPEN);
  }
  assert.equal(battle.hearts, 1);
  assert.ok(!types().includes('lost'), 'Gentle still can\'t be lost');
});

/**
 * A child who has got the idea, sailing beside the nearest pirate, as in sailBeside, and closing the hand
 * for a moment now and then. Counts the movements: how far the hand goes from side to side, in full
 * turns of the wheel, and each close and open.
 */
function battleLikeAChild(battle) {
  let seconds = 0;
  let steer = 0;
  let travel = 0;
  while (battle.state === 'sailing' && seconds < 900) {
    const input = sailBeside(battle);
    // A hand moves only so fast.
    const next = steer + Math.max(-STEP * 2.5, Math.min(STEP * 2.5, input.steer - steer));
    travel += Math.abs(next - steer);
    steer = next;
    battle.update(STEP, { ...input, steer });
    seconds += STEP;
  }
  return { seconds, perMinute: (travel / 2 / seconds) * 60, won: battle.state === 'won' };
}

const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

test('level 10 asks no more than twice the movements a minute of level 1, and lasts no more than a third longer', () => {
  // On Gentle, so that every game gets to the end and they can be compared.
  for (const [pace, ships] of [['slow', 4], ['medium', 6], ['fast', 9]]) {
    const play = (levelNumber) => [3, 7, 11, 19].map((seed) => battleLikeAChild(start({ pace, ships, levelNumber, random: seeded(seed) }).battle));
    const first = play(1);
    const last = play(10);
    for (const game of [...first, ...last]) assert.ok(game.won, `${pace}: not finished`);
    const longer = average(last.map(({ seconds }) => seconds)) / average(first.map(({ seconds }) => seconds));
    const busier = average(last.map(({ perMinute }) => perMinute)) / average(first.map(({ perMinute }) => perMinute));
    console.log(`cannon bay ${pace}: level 10 is ${longer.toFixed(2)} times as long, with ${busier.toFixed(2)} times the movements a minute`);
    assert.ok(longer <= 1.34, `${pace}: ${longer.toFixed(2)} times as long`);
    assert.ok(busier <= 2, `${pace}: ${busier.toFixed(2)} times the movements`);
  }
});

test('at level 10 there\'s still at least 70% of the time to react: balls fly as slowly, and pirates stay alongside long enough', () => {
  assert.ok(levelPlan(10).side >= 0.7);
  const { battle, events } = start({ levelNumber: 10 });
  run(battle, 60, () => ({ ...OPEN, drive: 0.8 }));
  const balls = events.filter(({ type }) => type === 'pirate-fire');
  assert.ok(balls.length > 0);
  for (const { ball } of balls) assert.ok(ball.seconds >= 2, 'slow');
});

for (const pace of Object.keys(PACES)) {
  for (const level of Object.keys(LEVELS)) {
    test(`level 10 at ${pace} speed on ${level} can be finished, steering as a child might`, () => {
      const { battle, types } = start({ ships: 9, pace, level, levelNumber: 10, random: seeded(17) });
      let seconds = 0;
      while (battle.state === 'sailing' && seconds < 900) {
        battle.update(STEP, sailBeside(battle));
        if (battle.state === 'sailing') battle.hearts = Math.max(battle.hearts, 2);
        seconds += STEP;
      }
      assert.equal(battle.state, 'won');
      assert.equal(types().filter((type) => type === 'beaten').length, 9);
      assert.equal(battle.left, 0);
    });
  }
}

test('at level 10 the new things really happen, in a whole battle played as a child might', () => {
  const { battle, events, types } = start({ ships: 9, levelNumber: 10, random: seeded(4) });
  assert.equal(battle.afloat.length, MOST_AT_ONCE + 1);
  const spawned = () => events.filter(({ type }) => type === 'spawn').map(({ pirate }) => pirate);
  let weaving = false;
  let most = 0;
  let seconds = 0;
  const fired = new Set();
  while (battle.state === 'sailing' && seconds < 900) {
    battle.update(STEP, sailBeside(battle));
    for (const pirate of battle.afloat) if (pirate.mode === 'away' && Math.abs(battle.weaving(pirate)) > 0.5) weaving = true;
    for (const pirate of battle.pirates) most = Math.max(most, pirate.burstLeft);
    fired.add(battle.fireKind);
    seconds += STEP;
  }
  const kinds = spawned().map(({ kind }) => kind);
  assert.equal(battle.state, 'won');
  assert.ok(weaving, 'weaving');
  for (const kind of ['sub', 'smoky', 'sloop', 'raft']) assert.ok(kinds.includes(kind), kind);
  assert.equal(kinds.at(-1), 'king');
  assert.ok(most >= LEVELS.gentle.balls + 1, 'bigger broadsides');
  const king = spawned().at(-1);
  assert.equal(king.maxHits, Math.round(LEVELS.gentle.shipHits * SHIP_KINDS.king.hits));
  for (const type of ['split', 'little-beaten', 'smoke', 'dive', 'surface', 'sail-down', 'drop', 'prize', 'power']) assert.ok(types().includes(type), type);
  const { stats } = battle;
  console.log('level 10 battle', JSON.stringify({ seconds: Math.round(seconds), gems: stats.gems, sailors: stats.sailors, keys: stats.keys, chests: stats.chests, powers: stats.powers, hearts: stats.hearts, fired: [...fired] }));
  assert.ok(stats.gems >= 9, 'gems picked up');
  assert.ok(stats.sailors >= 1, 'a sailor rescued');
  assert.ok(stats.powers >= 3, 'power-ups');
  assert.ok(fired.size >= 3, 'other kinds of fire');
});

test('at level 10, resting still stops the firing, and the pirates sail in circles', () => {
  const { battle, events } = start({ levelNumber: 10 });
  run(battle, 12, OPEN);
  run(battle, REST_AFTER + 0.5, CLOSED);
  assert.equal(battle.resting, true);
  const fired = events.filter(({ type }) => type === 'pirate-fire').length;
  const { hurts } = battle.stats;
  run(battle, 60, CLOSED);
  assert.equal(events.filter(({ type }) => type === 'pirate-fire').length, fired);
  assert.equal(battle.stats.hurts, hurts);
  assert.ok(battle.afloat.every(({ mode }) => mode === 'circle'));
});

/* ---------- what the higher levels bring: prizes, power-ups and new kinds of ship ---------- */

/** Beats the first pirate afloat right beside the child's ship, so whatever it drops is close. */
function beatBeside(battle, pirate = battle.afloat[0], away = 70) {
  pirate.x = battle.x + Math.cos(battle.heading) * away;
  pirate.z = battle.z + Math.sin(battle.heading) * away;
  while (pirate.state === 'sailing') battle.hit(pirate, pirate);
  return pirate;
}

/** A prize of this kind, right here. */
const prizeAt = (battle, kind, x, z, details = {}) => battle.addPrize(kind, x, z, details);

test('from level 2, a beaten ship drops gems, which float over to the ship, are picked up and counted', () => {
  const { battle, types } = start({ levelNumber: 2 });
  beatBeside(battle);
  const gems = battle.prizes.filter(({ kind }) => kind === 'gem');
  assert.equal(gems.length, 3);
  assert.ok(types().includes('drop'));
  // Just sitting there with the sails down, they come over by themselves.
  run(battle, 8, CLOSED);
  assert.equal(battle.stats.gems, 3);
  assert.ok(types().includes('prize'));
  assert.equal(battle.prizes.filter(({ kind }) => kind === 'gem').length, 0);
});

test('a prize too far away to come over goes in the end, and that costs nothing; resting keeps it', () => {
  const { battle } = start({ levelNumber: 2 });
  const gem = prizeAt(battle, 'gem', battle.x + 400, battle.z);
  run(battle, REST_AFTER + 1, CLOSED);
  assert.equal(battle.resting, true);
  const left = gem.left;
  run(battle, 20, CLOSED);
  assert.equal(gem.left, left, 'resting keeps it');
  // Short closes aren't a rest, so the time goes, and the ship stays put.
  for (let i = 0; i < 12; i += 1) {
    run(battle, REST_AFTER - 0.5, CLOSED);
    battle.update(STEP, { ...CLOSED, open: true, drive: 0 });
  }
  assert.ok(!battle.prizes.includes(gem));
  assert.ok(!gem.taken);
  assert.equal(battle.stats.gems, 0);
});

test('the newest power-up of the level is the first one dropped, and then they take turns', () => {
  for (const [level, first] of [[2, 'triple'], [4, 'shield'], [5, 'bubble'], [6, 'magnet'], [8, 'bounce'], [9, 'snow']]) {
    const { battle } = start({ levelNumber: level });
    beatBeside(battle);
    const power = battle.prizes.find(({ kind }) => kind === 'power');
    assert.equal(power?.power, first, `level ${level}`);
  }
  const { battle } = start({ levelNumber: 3, ships: 9 });
  const dropped = [];
  for (let i = 0; i < 4; i += 1) {
    battle.prizes = [];
    beatBeside(battle);
    battle.fill();
    const bonus = battle.prizes.find(({ kind }) => kind === 'power' || kind === 'heart');
    dropped.push(bonus.power ?? bonus.kind);
  }
  assert.deepEqual(dropped, ['heart', 'triple', 'heart', 'triple']);
});

/** Picks up a power-up of this kind, as sailing over it would. */
function powerUp(battle, power) {
  prizeAt(battle, 'power', battle.x, battle.z, { power });
  battle.update(STEP, OPEN);
  assert.equal(battle.power?.kind, power);
}

test('a power-up lasts a few seconds, shows how long is left, waits while the child rests, and is counted', () => {
  const { battle, types } = start({ levelNumber: 10 });
  powerUp(battle, 'triple');
  assert.equal(battle.stats.powers, 1);
  assert.equal(battle.fireKind, 'triple');
  run(battle, 4, OPEN);
  assert.ok(battle.power.left < battle.power.total && battle.power.left > 0);
  run(battle, REST_AFTER + 0.5, CLOSED);
  const left = battle.power.left;
  run(battle, 10, CLOSED);
  assert.equal(battle.power.left, left, 'resting keeps it');
  // Anything else dropped meanwhile is cleared away, so this is about the one.
  run(battle, POWERS.triple.seconds, () => {
    battle.prizes = [];
    for (const pirate of battle.afloat) pirate.hitsLeft = pirate.maxHits;
    return OPEN;
  });
  assert.equal(battle.power, null);
  assert.equal(battle.fireKind, 'ball');
  assert.ok(types().includes('power-end'));
  // A new one takes over from one going.
  powerUp(battle, 'bubble');
  powerUp(battle, 'snow');
  assert.equal(battle.fireKind, 'snow');
});

test('the triple shot fires three balls at once, side by side, and all three hit', () => {
  const { battle } = start({ levelNumber: 2 });
  powerUp(battle, 'triple');
  const pirate = hold(battle, Math.PI / 2);
  const { hitsLeft } = pirate;
  holding(battle, 0.1, Math.PI / 2);
  assert.equal(battle.shots.length, 3);
  assert.ok(battle.shots.every(({ fire }) => fire === 'triple'));
  const alongs = battle.shots.map(({ along }) => along).sort((a, b) => a - b);
  assert.ok(alongs[2] - alongs[0] > 15, 'side by side');
  holding(battle, 1.4, Math.PI / 2);
  assert.ok(hitsLeft - pirate.hitsLeft >= 3);
});

test('the bubble shot traps a ship in a bubble for a moment: it stops, and can\'t fire', () => {
  const { battle, types } = start({ levelNumber: 5 });
  powerUp(battle, 'bubble');
  const pirate = hold(battle, Math.PI / 2);
  holding(battle, 1.5, Math.PI / 2);
  assert.ok(pirate.bubbled > 0);
  assert.ok(types().includes('bubbled'));
  battle.power = null;
  // Let go of it, and it bobs where it is.
  pirate.fireIn = 0;
  battle.broadsideIn = 0;
  const fired = types().filter((type) => type === 'pirate-fire').length;
  run(battle, 1.2, CLOSED);
  assert.ok(pirate.speed < 3, `${pirate.speed}`);
  assert.equal(types().filter((type) => type === 'pirate-fire').length, fired);
  run(battle, 3, CLOSED);
  assert.equal(pirate.bubbled, 0);
  assert.ok(types().includes('unbubbled'));
});

test('the snow shot slows a ship down, and it reloads more slowly', () => {
  const { battle, types } = start({ levelNumber: 9 });
  powerUp(battle, 'snow');
  const pirate = hold(battle, Math.PI / 2);
  holding(battle, 1.5, Math.PI / 2);
  assert.ok(pirate.frosted > 0);
  assert.ok(types().includes('frosted'));
  assert.ok(battle.quicker(pirate) < battle.plan.chase * 0.6);
  pirate.frosted = 0;
  assert.ok(battle.quicker(pirate) >= battle.plan.chase * 0.99);
});

test('the bouncing ball goes on to the next ship near enough, once', () => {
  const { battle, types } = start({ levelNumber: 8 });
  powerUp(battle, 'bounce');
  const [first, second] = battle.afloat;
  const place = () => {
    hold(battle, Math.PI / 2);
    second.x = first.x + Math.sin(battle.heading) * 60;
    second.z = first.z - Math.cos(battle.heading) * 60;
    second.fireIn = 100;
  };
  const before = second.hitsLeft;
  for (let i = 0; i < 2 / STEP; i += 1) {
    place();
    battle.update(STEP, OPEN);
  }
  assert.ok(types().includes('bounce'));
  assert.ok(second.hitsLeft < before, 'the second one was hit too');
  // A bounced ball doesn't bounce again.
  const bounces = types().filter((type) => type === 'bounce').length;
  const fires = types().filter((type) => type === 'fire').length;
  assert.ok(bounces <= fires);
});

test('the shield bubble: a ball landing on the ship bounces off, and costs nothing', () => {
  const { battle, types } = start({ levelNumber: 4, level: 'tough' });
  powerUp(battle, 'shield');
  ballOnHull(battle);
  battle.update(STEP, OPEN);
  assert.equal(battle.hearts, HEARTS);
  assert.equal(battle.stats.blocked, 1);
  assert.ok(types().includes('blocked'));
  battle.power = null;
  ballOnHull(battle);
  battle.update(STEP, OPEN);
  assert.equal(battle.hearts, HEARTS - 1);
});

test('the magnet brings prizes and gold over from far away', () => {
  const { battle } = start({ levelNumber: 6 });
  const far = prizeAt(battle, 'gem', battle.x + 380, battle.z);
  run(battle, 3, CLOSED);
  assert.equal(battle.stats.gems, 0, 'too far without it');
  powerUp(battle, 'magnet');
  battle.coins.push({ x: battle.x - 300, z: battle.z, left: 26, phase: 0 });
  run(battle, 8, CLOSED);
  assert.equal(battle.stats.gems, 1);
  assert.ok(!battle.prizes.includes(far));
  assert.ok(battle.stats.gold >= 1);
});

test('a heart from level 3 adds a heart, up to two more than the usual five', () => {
  const { battle } = start({ levelNumber: 3 });
  for (let i = 0; i < 4; i += 1) {
    prizeAt(battle, 'heart', battle.x, battle.z);
    battle.update(STEP, OPEN);
  }
  assert.equal(battle.hearts, MOST_HEARTS);
  assert.equal(MOST_HEARTS, HEARTS + 2);
  assert.equal(battle.stats.hearts, 4);
});

test('from level 3 a pirate tows a sailor in a cage, who floats free when it\'s beaten, and is rescued by sailing over', () => {
  const { battle, types } = start({ levelNumber: 3, ships: 4 });
  battle.update(STEP, OPEN);
  const towing = battle.afloat.find(({ cage }) => cage) ?? (() => {
    while (!battle.afloat.some(({ cage }) => cage)) {
      beatBeside(battle);
      battle.fill();
    }
    return battle.afloat.find(({ cage }) => cage);
  })();
  beatBeside(battle, towing);
  const cage = battle.prizes.find(({ kind }) => kind === 'cage');
  assert.ok(cage);
  run(battle, 10, CLOSED);
  assert.equal(battle.stats.sailors, 1);
  assert.ok(types().includes('prize'));
});

test('from level 6 a pirate carries a key: picking it up brings a treasure chest, which opens for gems and a power-up', () => {
  const { battle } = start({ levelNumber: 6, ships: 6 });
  let carrier = battle.afloat.find(({ key }) => key);
  while (!carrier) {
    beatBeside(battle);
    battle.fill();
    carrier = battle.afloat.find(({ key }) => key);
  }
  battle.prizes = [];
  beatBeside(battle, carrier);
  assert.ok(battle.prizes.some(({ kind }) => kind === 'key'));
  // Without the magnet, which would bring the chest over too.
  battle.prizes = battle.prizes.filter(({ kind }) => kind !== 'power');
  run(battle, 8, CLOSED);
  assert.equal(battle.stats.keys, 1);
  const chest = battle.prizes.find(({ kind }) => kind === 'chest');
  assert.ok(chest, 'a chest');
  assert.ok(getChart().room(chest.x, chest.z) > 20, 'on open water');
  const away = Math.hypot(chest.x - battle.x, chest.z - battle.z);
  assert.ok(away > 90 && away < 170, `${away}`);
  // It doesn't go away by itself.
  run(battle, 40, CLOSED);
  assert.ok(battle.prizes.includes(chest));
  const { gems, powers } = battle.stats;
  battle.x = chest.x;
  battle.z = chest.z;
  battle.update(STEP, CLOSED);
  assert.equal(battle.stats.chests, 1);
  // It all comes straight over, and some may be picked up at once.
  run(battle, 5, CLOSED);
  assert.ok(battle.stats.gems - gems + battle.prizes.filter(({ kind }) => kind === 'gem').length >= 5);
  assert.equal(battle.stats.powers, powers + 1);
});

test('from level 4 a barrel raft comes apart into two little rafts, which never fire, and both have to be beaten too', () => {
  const { battle, types } = start({ levelNumber: 4, ships: 1 });
  const [raft] = battle.afloat;
  assert.equal(raft.kind, 'raft');
  assert.equal(battle.left, 1);
  beatBeside(battle, raft);
  assert.ok(types().includes('split'));
  const littles = battle.afloat.filter(({ little }) => little);
  assert.equal(littles.length, 2);
  assert.equal(battle.left, 2);
  assert.equal(battle.stats.beaten, 1);
  assert.ok(!types().includes('lifeboat'));
  assert.equal(battle.boats.length, 0, 'nobody was on it');
  // Alongside, loaded and ready, they still never fire. A closed hand doesn't fire at them either.
  for (let i = 0; i < 3 / STEP; i += 1) {
    littles.forEach((little, index) => {
      const direction = battle.heading + (index ? 1 : -1) * Math.PI / 2;
      little.x = battle.x + Math.sin(direction) * 90;
      little.z = battle.z - Math.cos(direction) * 90;
      little.heading = battle.heading;
      little.fireIn = 0;
    });
    battle.broadsideIn = 0;
    battle.update(STEP, CLOSED);
  }
  assert.ok(!types().includes('pirate-fire'), 'little ones never fire');
  assert.notEqual(battle.state, 'won');
  for (const little of littles) beatBeside(battle, little);
  assert.equal(battle.left, 0);
  assert.equal(battle.stats.littles, 2);
  run(battle, 3, OPEN);
  assert.equal(battle.state, 'won');
});

test('from level 7 a smoke ship hides in its own smoke when hit, twice, and can\'t be fired at for a moment', () => {
  const { battle, types } = start({ levelNumber: 7, ships: 4 });
  const smoky = battle.afloat.find(({ kind }) => kind === 'smoky');
  assert.ok(smoky);
  let smokes = 0;
  while (smoky.state === 'sailing' && smokes < 2) {
    battle.hit(smoky, smoky);
    if (smoky.smoke > 0) {
      smokes += 1;
      assert.equal(battle.canTarget(smoky), false);
      assert.ok(!battle.targets.includes(smoky));
      run(battle, 3.2, CLOSED);
      assert.equal(battle.canTarget(smoky), true);
    }
  }
  assert.equal(smokes, 2);
  assert.equal(types().filter((type) => type === 'smoke').length, 2);
});

test('from level 8 a submarine dives and comes up again beside the child, and can\'t be fired at under the water', () => {
  const { battle, types } = start({ levelNumber: 8, ships: 4 });
  const sub = battle.afloat.find(({ kind }) => kind === 'sub');
  assert.ok(sub);
  assert.equal(sub.under, false, 'it starts where it can be seen');
  let dived = false;
  for (let i = 0; i < 12 / STEP; i += 1) {
    battle.update(STEP, OPEN);
    if (sub.under) {
      dived = true;
      assert.equal(battle.canTarget(sub), false);
      assert.equal(sub.burstLeft, 0);
    }
  }
  assert.ok(dived);
  assert.ok(types().includes('dive'));
  run(battle, 6, OPEN);
  assert.ok(types().includes('surface'));
  // Resting brings it up, so it's all there when the child comes back.
  sub.under = true;
  sub.diveIn = 4;
  run(battle, REST_AFTER + 0.5, CLOSED);
  assert.equal(sub.under, false);
});

test('at level 10 the pirate king\'s sails come down one at a time as it\'s hit', () => {
  const { battle, events } = start({ levelNumber: 10, ships: 1 });
  const [king] = battle.afloat;
  assert.equal(king.kind, 'king');
  assert.equal(king.partsLeft, 4);
  const downs = [];
  while (king.state === 'sailing') {
    battle.hit(king, king);
    const last = events.at(-1);
    if (events.some((event) => event.type === 'sail-down' && !downs.includes(event))) downs.push(...events.filter((event) => event.type === 'sail-down' && !downs.includes(event)));
    void last;
  }
  assert.deepEqual(downs.map(({ partsLeft }) => partsLeft), [3, 2, 1, 0]);
});

test('nothing new makes Gentle losable, at any level: hearts still stop at one', () => {
  for (const level of LEVEL_NUMBERS) {
    const { battle, types } = start({ levelNumber: level, ships: 4 });
    for (let i = 0; i < 40; i += 1) {
      ballOnHull(battle);
      battle.update(STEP, OPEN);
    }
    assert.equal(battle.hearts, 1, `level ${level}`);
    assert.ok(!types().includes('lost'));
  }
});

test('at level 10, resting stops the new kinds of ship too: nobody hides or fires, and power-ups wait', () => {
  const { battle, events } = start({ levelNumber: 10, ships: 9, random: seeded(5) });
  run(battle, 8, OPEN);
  powerUp(battle, 'bounce');
  run(battle, REST_AFTER + 0.5, CLOSED);
  const left = battle.power.left;
  const fired = events.filter(({ type }) => type === 'pirate-fire').length;
  run(battle, 40, CLOSED);
  assert.equal(events.filter(({ type }) => type === 'pirate-fire').length, fired);
  assert.ok(battle.afloat.every(({ under }) => !under));
  assert.equal(battle.power.left, left);
});

/* ---------- the end of a battle, and what's still on its way ---------- */

/** Which way is to the right of the child's ship. */
const rightOfShip = (battle) => ({ x: Math.cos(battle.heading), z: Math.sin(battle.heading) });

/** Beats every pirate there is, one after another right beside the ship, and waits for the win. */
function winNow(battle) {
  for (let i = 0; i < 40 && battle.left > 0; i += 1) {
    battle.fill();
    if (battle.afloat[0]) beatBeside(battle, battle.afloat[0]);
  }
  while (battle.state === 'sailing') battle.update(STEP, CLOSED);
}

test('prizes still floating over when a battle is won keep coming and are counted, and nothing new starts', () => {
  const { battle, types } = start({ levelNumber: 6, ships: 4 });
  winNow(battle);
  assert.equal(battle.state, 'won');
  battle.prizes = [];
  battle.power = null;
  const right = rightOfShip(battle);
  const gem = prizeAt(battle, 'gem', battle.x + right.x * 60, battle.z + right.z * 60);
  prizeAt(battle, 'power', battle.x + right.x * 20, battle.z + right.z * 20, { power: 'triple' });
  prizeAt(battle, 'key', battle.x - right.x * 20, battle.z - right.z * 20);
  const before = { ...battle.stats };
  const at = { x: gem.x, z: gem.z };
  run(battle, 0.5, CLOSED);
  assert.ok(Math.hypot(gem.x - at.x, gem.z - at.z) > 5, 'it isn\'t frozen on the water');
  // The finish card comes up 2.2 seconds after the win.
  run(battle, 1.7, CLOSED);
  assert.equal(battle.stats.gems, before.gems + 1);
  assert.equal(battle.stats.powers, before.powers + 1);
  assert.equal(battle.stats.keys, before.keys + 1);
  assert.ok(types().filter((type) => type === 'prize').length >= 3);
  // Nothing new starts once it's over: no power-up, and no chest to sail to.
  assert.equal(battle.power, null);
  assert.ok(!battle.prizes.some(({ kind }) => kind === 'chest'));
});

test('when the finish card comes up, whatever\'s still on its way counts, everything else shrinks away, and the count stays put', () => {
  const { battle } = start({ levelNumber: 3, ships: 4 });
  winNow(battle);
  battle.prizes = [];
  const right = rightOfShip(battle);
  prizeAt(battle, 'gem', battle.x + right.x * 100, battle.z + right.z * 100);
  prizeAt(battle, 'cage', battle.x - right.x * 105, battle.z - right.z * 105);
  const far = prizeAt(battle, 'gem', battle.x + right.x * 500, battle.z + right.z * 500);
  const before = { ...battle.stats };
  battle.collectAll();
  assert.equal(battle.stats.gems, before.gems + 1, 'the one floating over');
  assert.equal(battle.stats.sailors, before.sailors + 1);
  assert.ok(battle.prizes.every(({ fading, left }) => fading && left <= 1.2), 'they all shrink away');
  const counted = { ...battle.stats };
  run(battle, 2, CLOSED);
  assert.equal(battle.prizes.length, 0);
  assert.ok(!far.taken);
  assert.deepEqual(battle.stats, counted, 'nothing changes after the tally');
});

test('once the last heart has gone, no heart comes back, though one picked up still counts', () => {
  const { battle } = start({ levelNumber: 3, level: 'tough' });
  battle.hearts = 1;
  ballOnHull(battle);
  battle.update(STEP, OPEN);
  assert.equal(battle.state, 'lost');
  prizeAt(battle, 'heart', battle.x, battle.z);
  run(battle, 0.5, OPEN);
  assert.equal(battle.hearts, 0);
  assert.equal(battle.stats.hearts, 1);
});

test('a shot still on its way when the battle ends just splashes down, and beats nobody', () => {
  const { battle, types } = start({ level: 'tough' });
  const pirate = holding(battle, 0.1, Math.PI / 2);
  assert.ok(battle.shots.length > 0);
  const { hitsLeft } = pirate;
  battle.hearts = 1;
  ballOnHull(battle);
  battle.update(STEP, CLOSED);
  assert.equal(battle.state, 'lost');
  run(battle, 2, CLOSED);
  assert.equal(pirate.hitsLeft, hitsLeft);
  assert.equal(battle.stats.beaten, 0);
  assert.ok(types().includes('splash'));
});

test('the key is never on the last pirate, or on one that hides, dives or comes apart, so its chest can be sailed to in time', () => {
  for (const level of LEVEL_NUMBERS.filter((at) => levelPlan(at).keys)) {
    for (const ships of [4, 6, 9]) {
      const { roles } = new Battle({ ships, levelNumber: level });
      const carriers = roles.flatMap(({ key }, index) => (key ? [index] : []));
      assert.equal(carriers.length, 1, `level ${level}, ${ships} ships`);
      assert.ok(carriers[0] < ships - 1, `level ${level}, ${ships} ships: the last`);
      assert.ok(['ship', 'sloop'].includes(roles[carriers[0]].kind), `level ${level}, ${ships} ships: a ${roles[carriers[0]].kind}`);
    }
  }
  // Played through by a child who sails over to the chest once it's up, it's nearly always reached.
  const chestFirst = (battle) => {
    const chest = battle.prizes.find(({ kind }) => kind === 'chest');
    return chest ? wheelFor(battle, Math.atan2(chest.x - battle.x, -(chest.z - battle.z))) : sailBeside(battle);
  };
  for (const level of [6, 7]) {
    let opened = 0;
    for (let seed = 1; seed <= 8; seed += 1) {
      const { battle } = start({ levelNumber: level, ships: 4, random: seeded(seed) });
      for (let seconds = 0; battle.state === 'sailing' && seconds < 600; seconds += STEP) {
        battle.update(STEP, chestFirst(battle));
        if (battle.state === 'sailing') battle.hearts = Math.max(battle.hearts, 2);
      }
      opened += battle.stats.chests;
    }
    assert.ok(opened >= 7, `level ${level}: ${opened} of 8`);
  }
});

test('a treasure chest always comes up in water the ship can sail to, well inside the edge of the world', () => {
  const random = seeded(3);
  for (let i = 0; i < 400; i += 1) {
    const { battle } = start({ levelNumber: 6, random });
    // Anywhere on the water the ship can be, heading any way at all.
    do {
      const angle = random() * Math.PI * 2;
      const out = Math.sqrt(random()) * WORLD.limit;
      battle.x = Math.sin(angle) * out;
      battle.z = Math.cos(angle) * out;
    } while (getChart().room(battle.x, battle.z) < 30);
    battle.heading = random() * Math.PI * 2;
    const chest = battle.showChest();
    assert.ok(Math.hypot(chest.x, chest.z) < WORLD.limit - 110, `${Math.round(Math.hypot(chest.x, chest.z))} from the middle`);
    assert.ok(getChart().room(chest.x, chest.z) >= 12, 'on open water');
  }
});

test('a snowball\'s frost and a bubble wait while the child rests, as the power-ups do', () => {
  const { battle } = start({ levelNumber: 9 });
  const pirate = hold(battle, Math.PI / 2, 300);
  run(battle, REST_AFTER + 0.5, CLOSED);
  assert.equal(battle.resting, true);
  pirate.frosted = 5;
  pirate.bubbled = 3;
  run(battle, 10, CLOSED);
  assert.equal(pirate.frosted, 5);
  assert.equal(pirate.bubbled, 3);
  run(battle, 1, OPEN);
  assert.ok(pirate.frosted < 5 && pirate.bubbled < 3);
});

test('a triple shot\'s three balls landing together make one thud, and a raft beaten has nobody heard rowing away', () => {
  const sound = new BaySound();
  const played = [];
  sound.play = (name) => played.push(name);
  for (let i = 0; i < 3; i += 1) sound.hit(40);
  assert.deepEqual(played, ['thud']);
  played.length = 0;
  sound.beaten(40, { rowing: false });
  assert.ok(played.length > 0 && !played.includes('row'));
  played.length = 0;
  sound.beaten(40);
  assert.ok(played.includes('row'));
  // The rules say who's rowing: a raft launches no lifeboat.
  const { battle, events } = start({ levelNumber: 4, ships: 2 });
  const raft = battle.afloat.find(({ kind }) => kind === 'raft');
  beatBeside(battle, raft);
  assert.equal(events.find(({ type, pirate }) => type === 'beaten' && pirate === raft).boat, null);
  const ship = battle.afloat.find(({ kind, little }) => kind === 'ship' && !little);
  beatBeside(battle, ship);
  assert.ok(events.find(({ type, pirate }) => type === 'beaten' && pirate === ship).boat);
});

/* ---------- with a friend: ship against ship, see duel.js ---------- */

/** A duel from one child's side: their ship in this slot, and their friend's beside it, as each game starts. */
function duel(slot = 0, options = {}) {
  const { battle, events, types } = start({ ships: 0, start: duelStart(slot), ...options });
  const friend = battle.addFriend(duelStart(1 - slot));
  return { battle, events, types, friend };
}

/** The friend's ship where their game would say it is: this far off the bow, going the same way. */
function holdFriend(battle, off = Math.PI / 2, away = 110) {
  const direction = battle.heading + off;
  battle.placeFriend({ x: battle.x + Math.sin(direction) * away, z: battle.z - Math.cos(direction) * away, heading: battle.heading, speed: battle.speed, sails: 1 }, STEP);
}

const besideFriend = (battle, seconds, input = OPEN, off = Math.PI / 2) => {
  for (let i = 0; i < seconds / STEP; i += 1) {
    holdFriend(battle, off);
    battle.update(STEP, input);
  }
};

test('a duel lasts two, three or four minutes, from the host\'s ships to beat', () => {
  assert.deepEqual([4, 6, 9].map(duelSeconds), [120, 180, 240]);
  assert.equal(duelSeconds(undefined), 180);
  assert.equal(duelSeconds(7), 180);
  const clock = new Duel({ seconds: 120 });
  clock.tick(119);
  assert.equal(clock.over, false);
  clock.tick(5);
  assert.equal(clock.left, 0);
  assert.equal(clock.over, true);
});

test('the two ships start side by side out at sea, each in the other\'s firing zone on every How hard', () => {
  const chart = getChart();
  const [host, guest] = [duelStart(0), duelStart(1)];
  assert.equal(host.heading, guest.heading);
  assert.ok(guest.x > host.x, 'the host is on the left');
  for (const at of [host, guest]) {
    assert.ok(chart.room(at.x, at.z) > 150, 'in open water');
    assert.ok(Math.hypot(at.x, at.z) < WORLD.limit - 150, 'well inside the edge of the world');
  }
  for (const level of Object.keys(LEVELS)) {
    for (const slot of [0, 1]) {
      const { battle, friend } = duel(slot, { level });
      assert.equal(battle.zoneOf(friend), slot === 0 ? 'right' : 'left', `${level}, slot ${slot}`);
    }
  }
});

test('with a friend there are no pirates, and the friend\'s ship is only ever where their game says', () => {
  const { battle, friend, types } = duel(0);
  run(battle, 20, CLOSED);
  assert.deepEqual(battle.afloat, [friend]);
  assert.equal(battle.state, 'sailing');
  assert.ok(!types().includes('spawn'));
  // Nothing has come from their game, so it's where it started, and it has never fired here by itself.
  assert.deepEqual({ x: friend.x, z: friend.z }, { x: duelStart(1).x, z: duelStart(1).z });
  assert.equal(battle.balls.length, 0);
  assert.equal(friend.mode, 'friend');
  battle.placeFriend({ x: friend.x + 30, z: friend.z - 40, heading: 0.4, speed: 20, sails: 0.7 }, STEP);
  assert.deepEqual([friend.x, friend.z, friend.heading, friend.speed, friend.sails], [duelStart(1).x + 30, duelStart(1).z - 40, 0.4, 20, 0.7]);
});

test('a hit on the friend\'s ship is a point for the child, and it never sinks, runs, fires back or costs a heart', () => {
  const { battle, friend, events } = duel(0);
  besideFriend(battle, 60);
  const hits = events.filter(({ type, friend: onFriend }) => type === 'hit' && onFriend);
  // About two a second while it's alongside, as the cannons always fire.
  assert.ok(hits.length > 100, `${hits.length} hits`);
  assert.equal(battle.stats.hits, hits.length);
  assert.equal(friend.state, 'sailing');
  assert.equal(friend.mode, 'friend');
  assert.equal(battle.balls.length, 0);
  assert.equal(battle.hearts, HEARTS);
  assert.ok(!events.some(({ type }) => ['beaten', 'won', 'lost', 'smoke', 'hurt'].includes(type)));
});

test('with a friend too, only a hand seen open fires: closed, gone or unreadable, it never does', () => {
  for (const input of [CLOSED, GONE]) {
    const { battle } = duel(0);
    besideFriend(battle, 10, input);
    assert.equal(battle.stats.shots, 0);
  }
  // Set to always, a closed hand that can be seen fires, and one that's gone still doesn't.
  const always = duel(0, { cannons: 'always' });
  besideFriend(always.battle, 5, CLOSED);
  assert.ok(always.battle.stats.hits > 0);
  const gone = duel(0, { cannons: 'always' });
  besideFriend(gone.battle, 5, GONE);
  assert.equal(gone.battle.stats.shots, 0);
});

test('the friend\'s balls fly over to the child\'s ship, and only the hits their game says it made show, costing nothing', () => {
  const { battle, events } = duel(0);
  besideFriend(battle, 1);
  battle.friendFired(2);
  assert.equal(battle.balls.filter(({ homing, harmless }) => homing && harmless).length, 2);
  assert.equal(events.filter(({ type }) => type === 'pirate-fire').length, 2);
  // Their game says one of them hit: it shows as the first lands, on the side facing them, and the other lands quietly.
  battle.struck(1);
  const landed = [];
  for (let i = 0; i < 2 / STEP; i += 1) {
    holdFriend(battle);
    const before = events.length;
    battle.update(STEP, OPEN);
    for (const event of events.slice(before)) if (event.type === 'struck') landed.push({ along: battle.distanceFromHull(event.x, event.z), facing: Math.hypot(event.x - battle.friend.x, event.z - battle.friend.z) < Math.hypot(battle.x - battle.friend.x, battle.z - battle.friend.z) });
  }
  assert.equal(battle.balls.length, 0);
  assert.equal(landed.length, 1);
  assert.ok(Math.abs(landed[0].along - HULL.beam) < 0.5, `${landed[0].along} from the middle of the hull`);
  assert.equal(landed[0].facing, true);
  assert.equal(battle.hearts, HEARTS);
  // With none of theirs on the way, a hit their game says it made shows at once.
  battle.struck(1);
  besideFriend(battle, STEP);
  assert.equal(events.filter(({ type }) => type === 'struck').length, 2);
  assert.equal(battle.stats.struck, 2);
  assert.equal(battle.hearts, HEARTS);
  assert.ok(!events.some(({ type }) => type === 'hurt'));
});

test('the two ships never bump: each makes half the room, as the friend\'s game does the same', () => {
  const { battle, friend } = duel(0);
  run(battle, 1, CLOSED);
  const before = { x: battle.x, z: battle.z };
  battle.placeFriend({ x: battle.x + 20, z: battle.z, heading: battle.heading, speed: 0, sails: 0 });
  battle.update(STEP, CLOSED);
  const gap = Math.hypot(friend.x - battle.x, friend.z - battle.z);
  assert.ok(gap >= 45, `${gap} apart as it's shown`);
  const moved = Math.hypot(battle.x - before.x, battle.z - before.z);
  assert.ok(moved > 10 && moved < 16, `the child's ship made ${moved} of the room`);
});

test('when the time is up it\'s over at once, and a ball still in the air lands on nothing', () => {
  const { battle, events } = duel(0);
  besideFriend(battle, 3);
  assert.ok(battle.shots.length > 0, 'a ball on its way');
  const { hits } = battle.stats;
  battle.friendFired(1);
  battle.struck(1);
  battle.stop();
  assert.equal(battle.state, 'won');
  assert.equal(events.filter(({ type }) => type === 'won').length, 1);
  besideFriend(battle, 3);
  assert.equal(battle.stats.hits, hits);
  assert.equal(battle.stats.struck, 0);
  battle.struck(2);
  battle.friendFired(2);
  assert.equal(battle.strikesDue, 0);
  assert.equal(battle.balls.length, 0);
  // Stopping again changes nothing.
  battle.stop();
  assert.equal(events.filter(({ type }) => type === 'won').length, 1);
});

test('a friend who goes takes their ship and its balls with them', () => {
  const { battle } = duel(1);
  besideFriend(battle, 1);
  battle.friendFired(2);
  battle.struck(1);
  battle.removeFriend();
  assert.deepEqual(battle.afloat, []);
  assert.equal(battle.friend, null);
  assert.equal(battle.balls.length, 0);
  const { shots, hits } = battle.stats;
  run(battle, 2, OPEN);
  assert.equal(battle.stats.struck, 0);
  // Nothing more to fire at, and what was on its way lands on nothing.
  assert.equal(battle.stats.shots, shots);
  assert.equal(battle.stats.hits, hits);
});

test('what\'s sent about the ship is what the server passes on, and a friend\'s ship carries on smoothly between messages', () => {
  const { battle } = duel(0);
  run(battle, 3, { ...OPEN, steer: 1 });
  battle.heading += Math.PI * 6;
  const wire = shipWire(battle);
  assert.deepEqual(Object.keys(wire), ['x', 'z', 'h', 's', 'v', 'f', 'r']);
  assert.equal(wire.r, 0, 'sailing, with the hand open, isn\'t resting');
  assert.ok(Math.abs(wire.h) <= Math.PI, 'the same way round, however many times it has gone round');
  assert.deepEqual(cleanShip({ ms: 100, ...wire }), { ms: 100, ...wire });
  // Between two messages it goes smoothly, and with nothing new for a moment, it carries on as it was going.
  const track = new Track(SHIP_TRACK);
  track.push({ ms: 0, x: 0, z: 0, h: 0, s: 20, v: 1, f: 0 }, 1000);
  track.push({ ms: 100, x: 0, z: -2, h: 0.2, s: 20, v: 0.5, f: 1 }, 1100);
  const between = track.at(1100 + 120 - 50);
  assert.ok(between.z < 0 && between.z > -2 && between.h > 0 && between.h < 0.2);
  const later = track.at(1100 + 120 + 300);
  assert.ok(later.z < -6, `${later.z}: still going`);
  assert.equal(later.f, 1);
});

test('a duel counts each ship\'s hits, the friend\'s balls since they were last shown, and equal points share the win', () => {
  const counted = new Duel({ seconds: 120 });
  assert.equal(counted.newlyFired(5), 0, 'what was fired before is not shown');
  assert.equal(counted.newlyFired(7), 2);
  assert.equal(counted.newlyFired(7), 0);
  assert.equal(counted.newlyFired(30), 3, 'only a few at once after a pause');
  assert.equal(counted.heard(3), 3);
  assert.equal(counted.heard(2), 0, 'a late message changes nothing');
  assert.equal(counted.heard(4), 1);
  assert.equal(counted.theirs, 4);
  assert.equal(counted.scored(), 1);
  assert.equal(counted.scored(), 2);
  assert.deepEqual([Duel.outcome(5, 5), Duel.outcome(6, 5), Duel.outcome(4, 5), Duel.outcome(0, 0)], ['tied', 'won', 'lost', 'tied']);
});

test('the game\'s rooms are known to both servers, a friend\'s ship gets through to the game, and the page may reach the server', () => {
  for (const file of ['../../server/worker.js', '../../tools/race-server.mjs']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /const GAMES = \[[^\]]*'cannon-bay'/, file);
  }
  const friends = readFileSync(new URL('../../core/friends.js', import.meta.url), 'utf8');
  assert.match(friends, /\[[^\]]*'ship'[^\]]*\]\.includes\(message\.t\)/);
  const page = readFileSync(new URL('../../games/cannon-bay/index.html', import.meta.url), 'utf8');
  assert.match(page, /connect-src 'self' wss:\/\/hemi-race\.infoicy\.com ws:\/\/localhost:\* /);
});

test('a friend\'s hits that are shown together are heard as one thud, which is no louder than the child\'s own', () => {
  const sound = new BaySound();
  const played = [];
  sound.play = (name, { gain }) => played.push([name, gain]);
  sound.struck();
  sound.struck();
  assert.equal(played.length, 1);
  assert.equal(played[0][0], 'thud');
  sound.hit(0);
  assert.ok(played[0][1] <= played[1][1] * 1.2, 'about as loud as a hit of the child\'s own, close by');
});

/* ---------- together with a friend, against the pirates ---------- */

/** A child's ship, as their game sends it and the server passes it on, and as the other game is told of it. */
const shipHeard = (battle) => {
  const { x, z, h, s: speed, v, r } = cleanShip(shipWire(battle));
  return { x, z, heading: h, speed, sails: v, resting: Boolean(r) };
};
/** What the host's game tells of its pirates and their cannonballs, as the server passes it on. */
const piratesHeard = (battle) => cleanFoes(JSON.parse(JSON.stringify(battle.wire())));

/**
 * Two games of a battle together: whoever made it, whose game runs the pirates, and their friend. Each has what
 * happens in it written down. A hit the friend's game makes is told to the host's, unless a test loses it.
 */
function teamUp(settings = {}) {
  const both = { tags: [], losing: false, hostGone: false, sinceWire: 0 };
  const make = (slot, seed) => {
    const log = [];
    const battle = new TeamBattle({
      slot,
      runs: slot === 0,
      random: seeded(seed),
      level: 'gentle', // As it always was, unless a test says otherwise.
      ...settings,
      onEvent: (event) => {
        log.push(event);
        if (event.type === 'tag' && !both.losing) both.tags.push(cleanTag({ k: event.id, n: event.hits }));
      },
    });
    battle.begin();
    return { battle, log, count: (type, when = () => true) => log.filter((event) => event.type === type && when(event)).length };
  };
  both.host = make(0, 7);
  both.guest = make(1, 11);
  return both;
}

/** Both games for a while, each hearing of the other as they do through the server, the pirates ten times a second. */
function runTeam(both, seconds, hostHand = () => OPEN, guestHand = () => OPEN, before = () => {}) {
  const [host, guest] = [both.host.battle, both.guest.battle];
  for (let i = 0; i < seconds / STEP; i += 1) {
    before();
    if (!both.hostGone) {
      if (host.friend) host.placeFriend(shipHeard(guest), STEP);
      host.update(STEP, hostHand());
    }
    if (guest.friend) guest.placeFriend(shipHeard(host), STEP);
    guest.update(STEP, guestHand());
    for (const tag of both.tags.splice(0)) host.friendTagged(tag.k, tag.n);
    both.sinceWire += STEP;
    if (both.sinceWire >= 0.1 && host.friend && guest.friend && !both.hostGone) {
      both.sinceWire = 0;
      guest.follow(piratesHeard(host));
    }
  }
}

/**
 * One of the host's pirates, its first unless a test says which, kept this far off one ship's bow, and the others
 * far away, none of them firing. Once it's beaten, they all stay far away.
 */
function pinBeside(both, ship, off = Math.PI / 2, away = 90, which = null) {
  const host = both.host.battle;
  const afloat = host.afloat.filter((each) => !each.friend);
  const pirate = which ?? afloat[0];
  const direction = ship.heading + off;
  if (pirate.state === 'sailing') Object.assign(pirate, { x: ship.x + Math.sin(direction) * away, z: ship.z - Math.cos(direction) * away, heading: ship.heading, runAt: -1, fireIn: 100, burstLeft: 0 });
  for (const other of afloat) if (other !== pirate) Object.assign(other, { x: ship.x - Math.sin(ship.heading) * 700, z: ship.z + Math.cos(ship.heading) * 700, fireIn: 100, burstLeft: 0 });
  return pirate;
}

/** A child who has got the idea, for a game with a friend's ship in it: for the nearest pirate, and then alongside it. */
const teamHand = (battle) => () => {
  const nearest = battle.targets.slice().sort((a, b) => Math.hypot(a.x - battle.x, a.z - battle.z) - Math.hypot(b.x - battle.x, b.z - battle.z))[0];
  if (!nearest) return OPEN;
  const to = Math.atan2(nearest.x - battle.x, -(nearest.z - battle.z));
  if (Math.hypot(nearest.x - battle.x, nearest.z - battle.z) > battle.level.zone.reach * 0.8) return wheelFor(battle, to);
  const off = Math.atan2(Math.sin(to - battle.heading), Math.cos(to - battle.heading));
  return wheelFor(battle, to - (off >= 0 ? 1 : -1) * (Math.PI / 2));
};

const piratesOf = (battle) => battle.afloat.filter((each) => !each.friend);

test('together, there are as many pirate ships as the host chose, each taking twice the hits, the two ships start side by side, and only the host\'s game runs the pirates', () => {
  const both = teamUp({ ships: 4, level: 'tough' });
  const [host, guest] = [both.host.battle, both.guest.battle];
  assert.deepEqual([host.total, guest.total, host.left, guest.left], [4, 4, 4, 4]);
  assert.deepEqual([host.runs, guest.runs], [true, false]);
  // Each game has its own ship in its own place, and the friend's in the other, as in a duel.
  for (const [battle, slot] of [[host, 0], [guest, 1]]) {
    assert.deepEqual([battle.x, battle.z], [duelStart(slot).x, duelStart(slot).z]);
    assert.deepEqual([battle.friend.x, battle.friend.z], [duelStart(1 - slot).x, duelStart(1 - slot).z]);
    // The friend's ship is on the child's side: never fired at, and it's drawn after the pirates' ships.
    assert.equal(battle.friend.ally, true);
    assert.equal(battle.targets.includes(battle.friend), false);
    assert.equal(battle.friend.index, 4);
    // The plain battle, whatever anyone's level: nothing a level brings.
    assert.equal(battle.levelNumber, 1);
    assert.equal(Object.values(battle.plan).some((value) => value === true), false);
    // The firing zones, the pirates' fire and whether the ship can be sunk are this child's own, from Tough. The
    // pirate ships take as many hits as on Gentle, twice over.
    assert.equal(battle.level.canLose, true);
    assert.deepEqual([battle.level.hitChance, battle.level.balls, battle.level.fireEvery], [LEVELS.tough.hitChance, LEVELS.tough.balls, LEVELS.tough.fireEvery]);
    assert.equal(battle.level.zone.reach, LEVELS.tough.zone.reach);
    assert.equal(battle.level.shipHits, LEVELS.gentle.shipHits * TEAM_HITS);
  }
  assert.equal(TEAM_HITS, 2);
  // One more pirate is about at a time than on their own, and the friend's ship isn't counted as one of them.
  assert.equal(host.mostAtOnce, MOST_AT_ONCE + 1);
  assert.equal(piratesOf(host).length, Math.min(4, MOST_AT_ONCE + 1));
  assert.ok(piratesOf(host).every(({ maxHits, kind }) => maxHits === LEVELS.gentle.shipHits * 2 && kind === 'ship'));
  assert.deepEqual([piratesOf(guest).length, guest.waiting], [0, 0], 'none of its own');
});

test('the friend\'s game shows the host\'s pirate ships: the same ones, where they are, moving smoothly between what it\'s told', () => {
  const both = teamUp({ pace: 'fast' });
  const [host, guest] = [both.host.battle, both.guest.battle];
  runTeam(both, 0.5);
  assert.equal(both.guest.count('spawn'), piratesOf(host).length, 'each comes in once');
  let biggestStep = 0;
  let furthestOut = 0;
  for (let i = 0; i < 20 / STEP; i += 1) {
    const before = new Map(piratesOf(guest).map((pirate) => [pirate, { x: pirate.x, z: pirate.z }]));
    runTeam(both, STEP, teamHand(host), teamHand(guest));
    for (const [pirate, was] of before) if (pirate.state === 'sailing') biggestStep = Math.max(biggestStep, Math.hypot(pirate.x - was.x, pirate.z - was.z));
    for (const pirate of piratesOf(guest)) {
      const theirs = host.pirates.find(({ index, friend }) => index === pirate.index && !friend);
      if (theirs) furthestOut = Math.max(furthestOut, Math.hypot(pirate.x - theirs.x, pirate.z - theirs.z));
    }
  }
  assert.deepEqual(piratesOf(guest).map(({ index, kind, maxHits }) => [index, kind, maxHits]), piratesOf(host).map(({ index, kind, maxHits }) => [index, kind, maxHits]));
  assert.ok(furthestOut < 12, `${furthestOut} units out`);
  // And never jump: no more in a frame than a fast pirate ship could sail in a few.
  assert.ok(biggestStep < 6, `${biggestStep} in one frame`);
  // The captains are numbered as on the host's screen, so each has the same ship and face on both.
  assert.equal(guest.nextPirate, host.nextPirate);
});

test('a hit of the friend\'s shows on their own screen at once and counts in the host\'s game, and the pirate ship they beat goes down on both, and is theirs', () => {
  const both = teamUp();
  const [host, guest] = [both.host.battle, both.guest.battle];
  // One pirate ship, beside the friend's ship and well away from the host's, with a few hits to go.
  const pirate = pinBeside(both, guest);
  pirate.hitsLeft = pirate.maxHits = 6;
  const pin = () => pinBeside(both, guest, Math.PI / 2, 90, pirate);
  runTeam(both, 0.5, () => CLOSED, () => CLOSED, pin);
  const seen = guest.pirates.find(({ index, friend }) => index === pirate.index && !friend);
  assert.ok(seen);
  assert.equal(seen.maxHits, 6);
  // The friend opens their hand. As their first ball lands, it shows on their screen, and the host's game hears.
  for (let i = 0; i < 300 && !both.guest.count('tag'); i += 1) runTeam(both, STEP, () => CLOSED, () => OPEN, pin);
  assert.equal(both.guest.count('tag'), 1);
  assert.equal(seen.hitsLeft, 5, 'on their own screen at once');
  assert.equal(pirate.hitsLeft, 5, 'and counted by the game that runs it');
  assert.deepEqual([guest.stats.hits, host.stats.hits], [1, 0], 'it\'s the friend\'s hit, not the host\'s');
  assert.equal(both.host.count('hit', ({ theirs }) => theirs), 1, 'which shows on the host\'s screen as theirs');
  // They keep firing, and beat it. It goes down on both screens, and it's theirs on both.
  runTeam(both, 8, () => CLOSED, () => OPEN, pin);
  assert.deepEqual([pirate.state === 'sailing', seen.state === 'sailing'], [false, false]);
  assert.deepEqual([host.stats.beaten, guest.stats.beaten], [1, 1]);
  assert.deepEqual([host.beatenBy, guest.beatenBy], [{ mine: 0, theirs: 1 }, { mine: 1, theirs: 0 }]);
  assert.deepEqual([both.host.count('beaten'), both.guest.count('beaten')], [1, 1]);
  assert.equal(both.host.log.find(({ type }) => type === 'beaten').theirs, true);
  assert.equal(guest.stats.hits, 6, 'no more hits than it took');
  // Its crew rows away on both screens, and each child has gold floating towards their own ship.
  assert.deepEqual([host.boats.length, guest.boats.length], [1, 1]);
  assert.ok(guest.coins.length > 0);
});

test('the host\'s hits show on the friend\'s screen as they\'re made, without counting as the friend\'s, and the friend\'s balls are seen going for the pirate they fire at', () => {
  const both = teamUp();
  const [host, guest] = [both.host.battle, both.guest.battle];
  const pirate = pinBeside(both, host, -Math.PI / 2);
  pirate.hitsLeft = pirate.maxHits = 8;
  const pin = () => pinBeside(both, host, -Math.PI / 2, 90, pirate);
  guest.newlyFired(0);
  runTeam(both, 3, () => OPEN, () => CLOSED, pin);
  const seen = guest.pirates.find(({ index, friend }) => index === pirate.index && !friend);
  assert.ok(host.stats.hits >= 2);
  assert.equal(seen.hitsLeft, pirate.hitsLeft);
  assert.equal(both.guest.count('hit', ({ theirs }) => theirs), host.stats.hits);
  assert.equal(both.guest.count('tag'), 0);
  assert.deepEqual([guest.stats.hits, guest.stats.shots], [0, 0]);
  // The host's balls, on the friend's screen, go for that pirate ship, and land on it without doing anything there.
  const fired = guest.newlyFired(shipWire(host).f);
  assert.ok(fired > 0);
  guest.friendFired(fired);
  const theirs = guest.balls.filter(({ homing }) => homing);
  assert.equal(theirs.length, fired);
  assert.ok(theirs.every(({ at, harmless }) => at === seen && harmless));
  const hearts = guest.hearts;
  runTeam(both, 1.5, () => CLOSED, () => CLOSED, pin);
  assert.equal(guest.balls.filter(({ homing }) => homing).length, 0);
  assert.deepEqual([guest.hearts, guest.stats.struck], [hearts, 0]);
  // With no pirate within their reach, there's nothing to show them firing at.
  seen.x += 5000;
  guest.friendFired(2);
  assert.equal(guest.balls.filter(({ homing }) => homing).length, 0);
});

test('a hit that never reaches the host\'s game is made up for, and a pirate ship the friend has just beaten isn\'t fired at again while the host\'s game catches up', () => {
  const both = teamUp();
  const [host, guest] = [both.host.battle, both.guest.battle];
  const pirate = pinBeside(both, guest);
  pirate.hitsLeft = pirate.maxHits = 12;
  const pin = () => pinBeside(both, guest, Math.PI / 2, 90, pirate);
  runTeam(both, 0.5, () => CLOSED, () => CLOSED, pin);
  const seen = guest.pirates.find(({ index, friend }) => index === pirate.index && !friend);
  both.losing = true;
  for (let i = 0; i < 300 && !both.guest.count('tag'); i += 1) runTeam(both, STEP, () => CLOSED, () => OPEN, pin);
  assert.deepEqual([seen.hitsLeft, pirate.hitsLeft], [11, 12]);
  // For a moment the friend's screen keeps their hits, while the host's game might still be about to count them.
  // A ball that was already on its way lands too.
  runTeam(both, 0.4, () => CLOSED, () => CLOSED, pin);
  assert.equal(seen.hitsLeft, 12 - both.guest.count('tag'));
  runTeam(both, 2.4, () => CLOSED, () => CLOSED, pin);
  assert.equal(seen.hitsLeft, 12, 'they never got there');
  const lost = both.guest.count('tag');
  both.losing = false;
  for (let i = 0; i < 300 && both.guest.count('tag') === lost; i += 1) runTeam(both, STEP, () => CLOSED, () => OPEN, pin);
  assert.equal(pirate.hitsLeft, 12 - (lost + 1), 'all of them, now');
  // With its last hit made on the friend's screen, their cannons leave it alone until the host's game says it's beaten.
  runTeam(both, 1, () => CLOSED, () => CLOSED, pin);
  both.losing = true;
  pirate.hitsLeft = 1;
  runTeam(both, 0.3, () => CLOSED, () => CLOSED, pin);
  assert.equal(seen.hitsLeft, 1);
  for (let i = 0; i < 300 && seen.hitsLeft > 0; i += 1) runTeam(both, STEP, () => CLOSED, () => OPEN, pin);
  assert.equal(seen.hitsLeft, 0);
  assert.equal(guest.targets.includes(seen), false);
  const { shots } = guest.stats;
  runTeam(both, 0.8, () => CLOSED, () => OPEN, pin);
  assert.ok(guest.stats.shots - shots <= 1, 'at most one that was already loaded');
  assert.equal(seen.state, 'sailing', 'only the host\'s game says it\'s beaten');
});

test('every other pirate goes for the friend\'s ship, none for a child who\'s resting while the other sails on, and they only circle and wait when both are resting', () => {
  const both = teamUp({ ships: 6 });
  const [host, guest] = [both.host.battle, both.guest.battle];
  assert.equal(host.preyOf({ index: 0 }), host);
  assert.equal(host.preyOf({ index: 1 }), host.friend);
  assert.equal(host.preyOf({ index: 2 }), host);
  // After a while of both sailing, each pirate is nearer the ship it's after than the other one.
  runTeam(both, 25);
  for (const pirate of piratesOf(host)) {
    const prey = host.preyOf(pirate);
    const other = prey === host ? host.friend : host;
    assert.ok(Math.hypot(pirate.x - prey.x, pirate.z - prey.z) < Math.hypot(pirate.x - other.x, pirate.z - other.z) + 60, `pirate ${pirate.index}`);
  }
  // The friend closes their hand, and after a few seconds is resting: every pirate goes for the host's ship, and
  // they don't wait, on either screen.
  runTeam(both, REST_AFTER + 0.6, () => OPEN, () => CLOSED);
  assert.deepEqual([guest.resting, host.friend.resting, host.resting], [true, true, false]);
  assert.ok(piratesOf(host).every((pirate) => host.preyOf(pirate) === host));
  assert.deepEqual([host.paused, guest.paused], [false, false]);
  assert.ok(piratesOf(host).every(({ mode }) => mode !== 'circle'));
  // No ball that lands on the resting child's ship does anything to it.
  const hearts = guest.hearts;
  ballOnHull(guest);
  runTeam(both, 0.3, () => OPEN, () => CLOSED);
  assert.equal(guest.hearts, hearts);
  // The host rests too: now the pirates circle and wait, and stop firing, on both screens.
  runTeam(both, REST_AFTER + 0.6, () => CLOSED, () => CLOSED);
  assert.deepEqual([host.resting, host.paused, guest.paused], [true, true, true]);
  assert.ok(piratesOf(host).every(({ mode }) => mode === 'circle'));
  const fired = both.host.count('pirate-fire');
  runTeam(both, 12, () => CLOSED, () => CLOSED);
  assert.equal(both.host.count('pirate-fire'), fired);
  // The friend opens their hand again: the pirates set off, all of them for the friend's ship now.
  runTeam(both, 0.5, () => CLOSED, () => OPEN);
  assert.deepEqual([guest.resting, host.paused, guest.paused], [false, false, false]);
  assert.ok(piratesOf(host).every((pirate) => host.preyOf(pirate) === host.friend));
});

test('a pirate\'s cannonball shows on both screens and only costs a heart on the screen of the ship it lands on, with broadsides at each ship as far apart as on their own', () => {
  const both = teamUp();
  const [host, guest] = [both.host.battle, both.guest.battle];
  runTeam(both, 1);
  // A pirate after the friend's ship fires a ball that's aimed true.
  host.level = { ...host.level, hitChance: 1 };
  const pirate = piratesOf(host).find((each) => host.preyOf(each) === host.friend);
  Object.assign(pirate, { x: guest.x + 90, z: guest.z, burstSide: -1 });
  host.fireBall(pirate);
  const ball = host.balls.at(-1);
  assert.equal(ball.prey, host.friend);
  assert.ok(ball.id > 0);
  runTeam(both, 0.2);
  const shown = guest.balls.find(({ id }) => id === ball.id);
  assert.ok(shown, 'it\'s on the friend\'s screen too');
  assert.equal(shown.prey, guest);
  assert.deepEqual([shown.to.x, shown.to.z, shown.seconds], [Math.round(ball.to.x * 10) / 10, Math.round(ball.to.z * 10) / 10, Math.round(ball.seconds * 100) / 100]);
  assert.equal(both.guest.count('pirate-fire'), both.host.count('pirate-fire'));
  const [hers, his] = [host.hearts, guest.hearts];
  runTeam(both, 4);
  assert.equal(guest.hearts, his - 1, 'it landed on the friend\'s ship, on the friend\'s screen');
  assert.equal(host.hearts, hers, 'and cost the host nothing');
  assert.equal(both.guest.count('hurt'), 1);
  assert.equal(guest.balls.some(({ id }) => id === ball.id), false, 'and it doesn\'t come again');
  // Hearts stop at one for both, whatever each one's own How hard.
  for (let i = 0; i < 12; i += 1) {
    ballOnHull(guest);
    guest.update(STEP, OPEN);
  }
  assert.deepEqual([guest.hearts, guest.state], [1, 'sailing']);
  // Word from the host's game that still has a ball in it, coming just after that ball has landed here, doesn't
  // bring it back to land a second time.
  host.fireBall(pirate);
  const again = host.balls.at(-1);
  const word = piratesHeard(host);
  guest.follow(word);
  const copy = guest.balls.find(({ id }) => id === again.id);
  assert.ok(copy);
  copy.t = 0.999;
  guest.update(STEP, OPEN);
  assert.equal(guest.balls.some(({ id }) => id === again.id), false, 'it has landed');
  guest.follow(word);
  assert.equal(guest.balls.some(({ id }) => id === again.id), false, 'and doesn\'t come again');
  // A broadside at one ship doesn't hold up one at the other: each has its own time between them.
  host.broadsideIn = 0;
  host.friend.broadsideIn = 0;
  const [mine, theirs] = [piratesOf(host).find((each) => host.preyOf(each) === host), piratesOf(host).find((each) => host.preyOf(each) === host.friend)];
  for (const each of [mine, theirs]) Object.assign(each, { burstLeft: 0, fireIn: 0 });
  host.fireWhenSideOn(mine, 100, Math.PI / 2, 1);
  assert.ok(host.broadsideIn > 4 && host.friend.broadsideIn === 0);
  host.fireWhenSideOn(theirs, 100, Math.PI / 2, 1);
  assert.ok(theirs.burstLeft > 0 && host.friend.broadsideIn > 4);
});

test('a battle together can be played right through with any number of ships: both games agree on every count, both win together, and nobody is sunk', () => {
  for (const [ships, pace] of [[4, 'slow'], [6, 'medium'], [9, 'fast']]) {
    const both = teamUp({ ships, pace });
    const [host, guest] = [both.host.battle, both.guest.battle];
    const hands = [teamHand(host), teamHand(guest)];
    let seconds = 0;
    let apart = 0;
    while ((host.state === 'sailing' || guest.state === 'sailing') && seconds < 1500) {
      runTeam(both, 0.5, ...hands);
      seconds += 0.5;
      if (host.state !== guest.state) apart += 0.5;
    }
    assert.deepEqual([host.state, guest.state], ['won', 'won'], `${ships} ships, after ${seconds} seconds`);
    assert.ok(apart <= 1, `${ships} ships: they finish together, not ${apart} seconds apart`);
    assert.deepEqual([host.stats.beaten, guest.stats.beaten, host.left, guest.left], [ships, ships, 0, 0]);
    assert.equal(host.beatenBy.mine + host.beatenBy.theirs, ships);
    assert.deepEqual(guest.beatenBy, { mine: host.beatenBy.theirs, theirs: host.beatenBy.mine });
    assert.deepEqual([both.host.count('beaten'), both.guest.count('beaten')], [ships, ships]);
    // Both had pirates to fire at, and every hit the host's game counted for the friend was one the friend made.
    const counted = both.host.count('hit', ({ theirs }) => theirs);
    assert.ok(host.stats.hits > 0 && counted > 0 && counted <= guest.stats.hits, `${ships} ships: ${host.stats.hits} and ${counted} of ${guest.stats.hits}`);
    assert.ok(guest.stats.hits - counted <= ships * 2, `${ships} ships: ${guest.stats.hits - counted} hits landed on a ship already beaten`);
    // The pirates fired at both, nobody was sunk, and the friend's game never ran a pirate of its own.
    assert.ok(both.host.count('pirate-fire') > 4 && both.guest.count('pirate-fire') > 4);
    assert.ok(host.hearts >= 1 && guest.hearts >= 1);
    assert.deepEqual([both.host.count('lost'), both.guest.count('lost'), guest.runs], [0, 0, false]);
    assert.ok(seconds < 900, `${ships} ships: ${seconds} seconds`);
  }
});

test('a friend who goes leaves the one who made the battle to finish it, with half the hits still to make', () => {
  const both = teamUp({ ships: 4 });
  const [host, guest] = [both.host.battle, both.guest.battle];
  const hands = [teamHand(host), teamHand(guest)];
  while (host.stats.beaten < 1) runTeam(both, 0.5, ...hands);
  const was = piratesOf(host).map(({ index, hitsLeft }) => ({ index, hitsLeft }));
  const beaten = host.stats.beaten;
  host.friendGone();
  assert.deepEqual([host.together, host.friend, host.total, host.left], [false, null, 4, 4 - beaten]);
  assert.deepEqual(piratesOf(host).map(({ index, hitsLeft }) => ({ index, hitsLeft })), was.map(({ index, hitsLeft }) => ({ index, hitsLeft: Math.max(1, Math.ceil(hitsLeft / 2)) })));
  assert.equal(host.level.shipHits, LEVELS.gentle.shipHits, 'and those still to come take the usual number');
  assert.equal(host.mostAtOnce, MOST_AT_ONCE);
  assert.ok(host.balls.every(({ homing }) => !homing));
  host.friendGone();
  assert.equal(host.left, 4 - beaten, 'only once');
  // Every pirate is after the host's ship now, and the host finishes it.
  assert.ok(piratesOf(host).every((pirate) => host.preyOf(pirate) === host));
  const hand = teamHand(host);
  for (let t = 0; t < 900 && host.state === 'sailing'; t += STEP) host.update(STEP, hand());
  assert.deepEqual([host.state, host.stats.beaten], ['won', 4]);
  assert.equal(host.beatenBy.mine + host.beatenBy.theirs, 4);
});

test('if whoever made the battle goes, the friend\'s game takes the pirates over as they are, and the battle can still be won', () => {
  const both = teamUp({ ships: 6 });
  const [host, guest] = [both.host.battle, both.guest.battle];
  const hands = [teamHand(host), teamHand(guest)];
  while (host.stats.beaten < 2) runTeam(both, 0.5, ...hands);
  runTeam(both, 0.3, ...hands);
  const was = piratesOf(guest).map(({ index, x, z, hitsLeft }) => ({ index, x, z, hitsLeft }));
  const [beaten, mine] = [guest.stats.beaten, guest.beatenBy.mine];
  both.hostGone = true;
  guest.friendGone();
  assert.deepEqual([guest.runs, guest.together], [true, false]);
  // The same pirate ships, where they were, with half the hits they had left, and the rest still to come.
  const still = was.filter(({ hitsLeft }) => hitsLeft > 0);
  assert.deepEqual(piratesOf(guest).filter(({ index }) => still.some((each) => each.index === index)).map(({ index, x, z, hitsLeft }) => ({ index, x, z, hitsLeft })), still.map(({ index, x, z, hitsLeft }) => ({ index, x, z, hitsLeft: Math.max(1, Math.ceil(hitsLeft / 2)) })));
  assert.equal(guest.total, 6);
  assert.equal(guest.waiting + piratesOf(guest).length + guest.stats.beaten, 6);
  // Now they're this game's to run: they go for this ship, fire at it, and more come, until all six are beaten.
  const hand = teamHand(guest);
  const from = both.guest.log.length;
  for (let t = 0; t < 900 && guest.state === 'sailing'; t += STEP) guest.update(STEP, hand());
  assert.deepEqual([guest.state, guest.stats.beaten, guest.left], ['won', 6, 0]);
  assert.equal(guest.beatenBy.mine, mine + (6 - beaten), 'what they beat from here is theirs');
  const since = both.guest.log.slice(from);
  assert.ok(since.some(({ type }) => type === 'spawn'), 'more came');
  assert.ok(since.filter(({ type }) => type === 'pirate-fire').length > 0);
  assert.equal(since.filter(({ type }) => type === 'tag').length, 0, 'and there\'s nobody to tell of a hit');
  // Anything more from the old host's game is ignored.
  const afloat = piratesOf(guest).length;
  guest.follow(piratesHeard(host));
  assert.equal(piratesOf(guest).length, afloat);
});

test('a friend who goes before it has begun leaves a battle for one, on either side', () => {
  for (const slot of [0, 1]) {
    const battle = new TeamBattle({ slot, runs: slot === 0, ships: 4, level: 'gentle', random: seeded(5) });
    battle.friendGone();
    assert.deepEqual([battle.runs, battle.total, battle.waiting, battle.level.shipHits], [true, 4, 4, LEVELS.gentle.shipHits], `slot ${slot}`);
    battle.begin();
    const hand = teamHand(battle);
    for (let t = 0; t < 900 && battle.state === 'sailing'; t += STEP) battle.update(STEP, hand());
    assert.deepEqual([battle.state, battle.stats.beaten], ['won', 4], `slot ${slot}`);
  }
});

test('what the host\'s game tells of its pirates and their cannonballs is what the server passes on, never too much for one message, and nonsense is passed over', () => {
  const both = teamUp({ pace: 'fast', ships: 9 });
  const [host, guest] = [both.host.battle, both.guest.battle];
  runTeam(both, 12, teamHand(host), teamHand(guest));
  const pirate = piratesOf(host)[0];
  for (let i = 0; i < 3; i += 1) host.fireBall(pirate);
  const wire = host.wire();
  assert.ok(wire.e.length >= 3 && wire.s.length >= 3);
  assert.deepEqual(cleanFoes({ ms: 1234, ...wire }), { ms: 1234, ...wire });
  assert.deepEqual(wire.n.slice(1), [9, host.beatenBy.mine, host.beatenBy.theirs, 0, 0]);
  // With more pirate ships and balls than there could ever be, at the far edge of the sea, it still fits.
  host.pirates = [host.friend, ...Array.from({ length: 30 }, (_, index) => ({ ...pirate, index: index % 9, x: -1999.9, z: -1999.9, heading: -3.141, speed: 99.9, hitsLeft: 120, maxHits: 120 }))];
  host.balls = Array.from({ length: 40 }, (_, index) => ({ id: 999_000 + index, from: { x: -1999.9, y: 5, z: -1999.9 }, to: { x: -1999.9, z: -1999.9 }, t: 0.123, seconds: 3.19, arc: 110.5, prey: host.friend, pirate }));
  const most = host.wire();
  assert.deepEqual([most.e.length, most.s.length], [MOST_PIRATES, MOST_BALLS]);
  const sent = JSON.stringify({ t: 'foes', ms: 3_599_999, ...most });
  assert.ok(sent.length < MOST_BYTES, `${sent.length} characters`);
  assert.deepEqual(cleanFoes(most).s, most.s);
  // Nonsense from the other game does no harm: rows that aren't rows of numbers are passed over.
  const quiet = new TeamBattle({ slot: 1, runs: false, random: seeded(3) });
  quiet.begin();
  quiet.follow({ e: [null, [1, 2], 'three', [99, 0, 0, 0, 0, 0, 5, 5, 1], [1.5, 0, 0, 0, 0, 0, 5, 5, 1]], s: [[1], {}], n: ['x'] });
  quiet.follow({});
  quiet.follow({ e: 'all', s: 7, n: null });
  quiet.follow(null);
  assert.deepEqual([piratesOf(quiet).length, quiet.balls.length, quiet.state, quiet.stats.beaten], [0, 0, 'sailing', 0]);
});

test('a battle together\'s messages are passed on to the game, and its hits go from the game to the room', () => {
  const main = readFileSync(new URL('../../games/cannon-bay/main.js', import.meta.url), 'utf8');
  assert.match(main, /tag: \(\) => this\.friends\.sendTag\(event\.id, event\.hits\)/);
  assert.match(main, /battle\.friendTagged\(message\.k, message\.n\)/);
  assert.match(main, /battle\.follow\(message\)/);
  assert.match(main, /this\.friends\.sendMove\('foes', battle\.wire\(\), this\.sinceGo\)/);
});

/* ---------- the challenge: Medium, how it comes, and Tough, where the pirates can win ---------- */

/** A whole battle sailed beside the nearest pirate, as a child who has got the idea would, never dodging. */
function sailItThrough(options) {
  const { battle } = start(options);
  for (let seconds = 0; battle.state === 'sailing' && seconds < 900; seconds += STEP) battle.update(STEP, sailBeside(battle));
  return battle.state;
}

test('it comes on Medium, where running out of hearts lets the pirates win', () => {
  const battle = new Battle();
  assert.equal(battle.level, LEVELS.medium);
  assert.equal(battle.level.canLose, true);
  const { battle: sunk, types } = start({ level: 'medium' });
  for (let i = 0; i < HEARTS; i += 1) {
    ballOnHull(sunk);
    run(sunk, STEP);
  }
  assert.equal(sunk.state, 'lost');
  assert.ok(types().includes('lost'));
});

test('level 1 on Medium can be learnt, and at level 10 the pirates win some battles on Medium and every one on Tough', () => {
  const seeds = [3, 7, 11, 19];
  const results = (level, levelNumber) => seeds.map((seed) => sailItThrough({ level, levelNumber, random: seeded(seed) }));
  assert.deepEqual(results('medium', 1), ['won', 'won', 'won', 'won']);
  assert.ok(results('medium', 10).includes('lost'));
  assert.deepEqual(results('tough', 10), ['lost', 'lost', 'lost', 'lost']);
  // And on Gentle, the game as it was, every one is won.
  assert.deepEqual(results('gentle', 10), ['won', 'won', 'won', 'won']);
});

test('on Medium and Tough the levels ramp: by level 10 pirates reload twice as quickly, aim truer, and their balls come over quicker', () => {
  const first = challengePlan(1, true);
  const last = challengePlan(10, true);
  assert.deepEqual(first, challengePlan(1, false), 'level 1 is the same on every setting');
  assert.deepEqual(challengePlan(10, false), challengePlan(1, false), 'Gentle never ramps more than it did');
  assert.ok(levelPlan(10).fireEvery * last.fireEvery <= 0.55);
  assert.ok(levelPlan(10).apart * last.apart <= 0.55);
  assert.ok(LEVELS.medium.hitChance * last.hitChance >= 0.3);
  assert.equal(last.healAfter, 2);
  // The balls still fly slowly enough to see coming: at least 1.4 seconds.
  const { battle, events } = start({ level: 'tough', levelNumber: 10 });
  run(battle, 60, () => ({ ...OPEN, drive: 0.8 }));
  const balls = events.filter(({ type }) => type === 'pirate-fire');
  assert.ok(balls.length > 0);
  for (const { ball } of balls) assert.ok(ball.seconds >= 1.4 && ball.seconds <= 3.2 * 0.7 + 1e-9, `${ball.seconds}`);
});

test('resting still stops the pirates on Tough at level 10, so a child who walks away is never sunk for it', () => {
  const { battle } = start({ level: 'tough', levelNumber: 10 });
  run(battle, REST_AFTER + 4, CLOSED);
  assert.equal(battle.resting, true);
  const hearts = battle.hearts;
  run(battle, 60, CLOSED);
  assert.deepEqual([battle.state, battle.hearts], ['sailing', hearts]);
});

test('together on Medium a child whose ship is sunk has lost, and on Gentle hearts still stop at one', () => {
  for (const [level, lost] of [['medium', true], ['gentle', false]]) {
    const both = teamUp({ level });
    const guest = both.guest.battle;
    for (let i = 0; i < HEARTS + 2; i += 1) {
      ballOnHull(guest);
      runTeam(both, STEP);
    }
    assert.equal(guest.state === 'lost', lost, level);
    assert.equal(both.host.battle.state, 'sailing', 'the host hears of it from the result the friend\'s game sends');
  }
  const main = readFileSync(new URL('../../games/cannon-bay/main.js', import.meta.url), 'utf8');
  assert.match(main, /w: battle\.state === 'lost' \? 0 : 1/);
  assert.match(main, /this\.friends\.results\.get\(team\.friend\.id\)\?\.won !== false/);
});
