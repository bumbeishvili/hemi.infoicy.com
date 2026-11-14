// Arrow Meadow: arrows that fly in an arc to where the dotted line says, targets that count and misses that cost
// nothing, what each level brings, and the meadow shared with friends. Everything here runs without a screen, with a
// pretend archer who aims where the meadow wants, well or badly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ANGLES, BOW, EXTRAS, FRIEND_ZONES, friendTarget, flightAt, GOALS, GRAVITY, gripAt, HELP, HELP_NAMES, inMill, LABELS, Meadow, meadowLevel,
  meadowNewAt, MERCY, MIN_DRAW, NEWS, newsIsOn, PARTY_SECONDS, seeded, shotFor, SPEED, speedFor, STARS, teamSlots, WORLD,
} from '../../games/arrow-meadow/meadow.js';

const FRAME = 1 / 60;
const LEVELS = Array.from({ length: 10 }, (_, index) => index + 1);
const rad = (degrees) => (degrees * Math.PI) / 180;
const deg = (radians) => (radians * 180) / Math.PI;

function makeMeadow(options = {}) {
  const log = [];
  // The contest as it always was, nothing lost: test/unit/arrow-meadow-quiver.test.js has the default.
  const meadow = new Meadow({ random: seeded(options.seed ?? 7), help: 'off', gentle: true, onEvent: (event) => log.push(event), ...options });
  meadow.log = log;
  return meadow;
}

const said = (meadow, type) => meadow.log.filter((event) => event.type === type);
const plainOf = (meadow) => meadow.live.find((target) => target.slot === 'plain');
const specialOf = (meadow) => meadow.live.find((target) => target.slot === 'special');

/** Runs the meadow for a while, or until something is so. */
function run(meadow, seconds, until = () => false) {
  let t = 0;
  for (; t < seconds && !until(); t += FRAME) meadow.update(FRAME);
  return t;
}

/** Runs until the level's own kind of target is up, and gives it. */
function special(meadow) {
  run(meadow, 20, () => specialOf(meadow));
  return specialOf(meadow);
}

/** Lets an arrow go and runs until it has come to something. Returns what happened since, by type. */
function shoot(meadow, angle, draw = 1) {
  const from = meadow.log.length;
  const arrow = meadow.loose(angle, draw);
  run(meadow, 8, () => arrow.state !== 'flying');
  const events = meadow.log.slice(from);
  return { arrow, events, types: events.map((event) => event.type) };
}

/** Shoots at a target as the meadow says to. */
function shootAt(meadow, target, { lob = false } = {}) {
  for (const draw of [1, 0.85, 0.7, 0.55]) {
    const angle = meadow.solve(target, draw, { lob });
    if (angle !== null) return shoot(meadow, angle, draw);
  }
  throw new Error(`no arc reaches the ${target.kind}`);
}

/** Shoots an arrow that comes down in the grass, short of everything. */
function miss(meadow) {
  for (const [degrees, draw] of [[78, 0.3], [70, 0.3], [-12, 0.3], [78, 0.5]]) {
    if (meadow.trace(rad(degrees), draw).end.what === 'ground') return shoot(meadow, rad(degrees), draw);
  }
  throw new Error('no way to miss');
}

/** Takes the plain target away, and keeps it away, for trying the others without it in the line of fire. */
function withoutPlain(meadow) {
  meadow.targets = meadow.targets.filter((target) => target.slot !== 'plain');
  meadow.waits.plain = Infinity;
}

/**
 * A pretend archer: every so often, lets an arrow go at what the meadow wants hit. wander is how far off its aim
 * can be, in degrees, and it goes through the help with aiming, as a child's does.
 */
function playThrough(meadow, { every = 1.2, wander = 0, seconds = 600, seed = 11 } = {}) {
  const random = seeded(seed);
  let wait = every;
  return run(meadow, seconds, () => {
    wait -= FRAME;
    if (wait <= 0 && !meadow.done) {
      wait = every;
      const wanted = meadow.wants();
      if (wanted) {
        const aim = meadow.aimFor(wanted.angle + rad((random() - 0.5) * 2 * wander), wanted.draw);
        meadow.loose(aim.angle, aim.draw);
      }
    }
    return meadow.done;
  });
}

/* ---------- arrows ---------- */

test('an arrow flies in an arc: up, over and down, further for a bow drawn further', () => {
  const shot = shotFor(rad(40), 1);
  // It leaves from where the bow is held: out in front of the string hand, and up from it as the bow is tilted up.
  assert.deepEqual([shot.x0, shot.y0], [gripAt(rad(40)).x, gripAt(rad(40)).y]);
  assert.ok(Math.abs(Math.hypot(shot.x0 - BOW.x, shot.y0 - BOW.y) - BOW.reach) < 1e-9);
  assert.ok(gripAt(rad(40)).y < gripAt(0).y && gripAt(0).y === BOW.y && gripAt(rad(-10)).y > BOW.y);
  const top = shot.vy / GRAVITY;
  const [rising, peak, falling] = [flightAt(shot, top / 2), flightAt(shot, top), flightAt(shot, top * 1.5)];
  assert.ok(rising.y < shot.y0 && peak.y < rising.y && falling.y > peak.y, 'it goes up, and comes down');
  assert.ok(rising.x < peak.x && peak.x < falling.x, 'and on across the meadow all the while');
  assert.ok(rising.dy < 0 && Math.abs(peak.dy) < 1e-9 && falling.dy > 0, 'pointing the way it goes');
  // The same height again, twice as long after the top: an arc, the same each side.
  assert.ok(Math.abs(flightAt(shot, top * 2).y - shot.y0) < 1e-9);
  // Faster off the string the further the bow is drawn.
  assert.equal(speedFor(0), SPEED.least);
  assert.equal(speedFor(1), SPEED.most);
  assert.ok(speedFor(0.5) > speedFor(0.3));
  const meadow = makeMeadow();
  meadow.targets = [];
  const reach = (draw) => shoot(meadow, rad(40), draw).arrow.x;
  assert.ok(reach(1) > reach(0.6) && reach(0.6) > reach(MIN_DRAW));
  // Drawn right back, an arrow reaches right across the meadow.
  assert.ok(reach(1) > 1.4, `${reach(1)}`);
  // The bow only tilts so far.
  assert.equal(shotFor(rad(120), 1).angle, ANGLES.high);
  assert.equal(shotFor(rad(-60), 1).angle, ANGLES.low);
});

test('the dotted line is where the arrow goes: nothing is a guess', () => {
  for (const level of [1, 5, 6, 8]) {
    const meadow = makeMeadow({ level });
    special(meadow);
    for (const [degrees, draw] of [[-8, 1], [5, 0.5], [20, 1], [35, 0.8], [50, 0.6], [66, 1], [75, 0.9]]) {
      // The sails keep turning, so each arc is traced at the moment it's let go.
      const traced = meadow.trace(rad(degrees), draw, { dots: true });
      const { arrow, types } = shoot(meadow, rad(degrees), draw);
      const landed = types.includes('hit') ? 'target' : types.includes('bonk') ? meadow.log.filter((event) => event.type === 'bonk').at(-1).what : types.includes('land') ? 'ground' : 'out';
      assert.equal(landed, traced.end.what, `level ${level}, ${degrees} degrees at ${draw}`);
      if (landed === 'ground') assert.ok(Math.abs(arrow.x - traced.end.x) < 0.02, `it landed ${Math.abs(arrow.x - traced.end.x)} from where the line ended`);
      assert.ok(traced.dots.length > 2, 'and the line has its dots');
      // Whatever it hit comes back, for the next arrow.
      run(meadow, 3, () => plainOf(meadow) && (meadow.level === 1 || specialOf(meadow)));
    }
  }
});

test('an arrow in the grass stays a moment and goes, and one that hits nothing costs nothing', () => {
  const meadow = makeMeadow();
  const before = { ...plainOf(meadow) };
  const { arrow, types } = miss(meadow);
  assert.deepEqual(types.filter((type) => type !== 'loose'), ['land']);
  assert.equal(arrow.state, 'stuck');
  assert.equal(arrow.y, WORLD.ground);
  assert.deepEqual([meadow.stats.shots, meadow.stats.hits, meadow.stats.misses], [1, 0, 1]);
  run(meadow, 4);
  assert.equal(meadow.arrows.length, 0);
  // The target is just where it was, and nothing was taken away.
  const after = plainOf(meadow);
  assert.deepEqual([after.id, after.x, after.y, after.r], [before.id, before.x, before.y, before.r]);
  assert.equal(meadow.stats.stars, 0);
});

/* ---------- targets, and winning ---------- */

test('level 1 is one big straw target, near, and each one hit is followed by another somewhere new', () => {
  const meadow = makeMeadow();
  assert.equal(meadow.targets.length, 1);
  const places = [];
  for (let n = 0; n < 6; n += 1) {
    run(meadow, 5, () => plainOf(meadow));
    const target = plainOf(meadow);
    assert.equal(target.kind, 'butt');
    assert.equal(meadow.live.length, 1, 'only ever the one');
    // Big, near, and no higher than the bow can easily be pointed.
    assert.ok(target.r >= 0.095);
    assert.ok(target.x - gripAt(0).x > 0.35 && target.x - gripAt(0).x < 0.5, `${target.x - gripAt(0).x} from the bow`);
    assert.ok(target.y >= 0.5 && target.y + target.r <= WORLD.ground + 0.001);
    if (places.length) assert.ok(Math.hypot(target.x - places.at(-1).x, target.y - places.at(-1).y) >= 0.1, 'not where the last one was');
    places.push({ x: target.x, y: target.y });
    const { types } = shootAt(meadow, target);
    assert.ok(types.includes('hit'));
    assert.equal(target.state, 'hit');
    // It's still there for a moment, with the arrow in it, and then goes, arrow and all.
    assert.equal(meadow.arrows.at(-1).in, target);
    run(meadow, 1.2);
    assert.equal(meadow.targets.includes(target), false);
    assert.equal(meadow.arrows.length, 0);
  }
  assert.equal(meadow.stats.hits, 6);
  assert.equal(meadow.stats.stars, 0, 'and there are no stars at level 1');
});

test('enough targets win the contest, however many arrows it takes, and then there\'s a party and it\'s over', () => {
  assert.deepEqual(GOALS, [6, 10, 14]);
  for (const goal of GOALS) {
    const meadow = makeMeadow({ goal });
    let arrows = 0;
    while (!said(meadow, 'won').length && arrows < 200) {
      run(meadow, 5, () => plainOf(meadow));
      // Every third arrow goes nowhere near.
      if (arrows % 3 === 2) miss(meadow);
      else shootAt(meadow, plainOf(meadow));
      arrows += 1;
    }
    assert.equal(meadow.stats.hits, goal);
    assert.ok(meadow.stats.shots > goal);
    assert.equal(said(meadow, 'hit').at(-1).last, true);
    assert.equal(said(meadow, 'hit').filter((event) => event.last).length, 1);
    assert.equal(meadow.phase, 'won');
    assert.equal(meadow.done, false);
    // Nothing more comes, and nothing more is shot at.
    assert.equal(meadow.live.length, 0);
    const took = run(meadow, 10, () => meadow.done);
    assert.ok(Math.abs(took - PARTY_SECONDS) < 0.1);
    assert.equal(meadow.loose(rad(20), 1), null);
  }
});

test('a child who rests comes back to the meadow just as they left it', () => {
  const meadow = makeMeadow({ level: 4 });
  const roller = special(meadow);
  shootAt(meadow, plainOf(meadow));
  run(meadow, 2);
  const before = { hits: meadow.stats.hits, stars: meadow.stats.stars, targets: meadow.live.map((target) => target.id) };
  // Ten minutes with nobody shooting.
  run(meadow, 600);
  assert.deepEqual({ hits: meadow.stats.hits, stars: meadow.stats.stars, targets: meadow.live.map((target) => target.id) }, before);
  assert.equal(meadow.stats.misses, 0);
  assert.equal(meadow.done, false);
  assert.equal(meadow.live.includes(roller), true, 'the target on wheels is still rolling');
  assert.equal(shootAt(meadow, plainOf(meadow)).types.includes('hit'), true);
});

test('after a few misses in a row the plain target grows, and the next one is its own size again', () => {
  const meadow = makeMeadow();
  const target = plainOf(meadow);
  const size = target.r;
  for (let n = 0; n < MERCY.from - 1; n += 1) miss(meadow);
  assert.equal(target.r, size, 'not yet');
  miss(meadow);
  assert.ok(Math.abs(target.r - size * (1 + MERCY.by)) < 1e-9);
  assert.equal(said(meadow, 'grow').length, 1);
  for (let n = 0; n < 20; n += 1) miss(meadow);
  assert.ok(Math.abs(target.r - size * (1 + MERCY.by * MERCY.most)) < 1e-9, 'and no bigger than that');
  assert.equal(said(meadow, 'grow').length, MERCY.most);
  assert.equal(meadow.stats.hits, 0);
  // A hit, and the next one is the size the level gives it.
  shootAt(meadow, target);
  run(meadow, 3, () => plainOf(meadow));
  assert.equal(plainOf(meadow).r, size);
  // And the misses start counting again from there.
  miss(meadow);
  assert.equal(plainOf(meadow).r, size);
});

/* ---------- help with aiming ---------- */

test('the help with aiming pulls an arc that\'s nearly right onto the target, and leaves any other alone', () => {
  assert.deepEqual(HELP_NAMES, ['off', 'little', 'lots']);
  assert.ok(HELP.lots.within > HELP.little.within && HELP.lots.pull > HELP.little.pull);
  for (const help of ['little', 'lots']) {
    const meadow = makeMeadow({ help });
    const target = plainOf(meadow);
    const right = meadow.solve(target, 1);
    const { within, pull } = HELP[help];
    // A little off: most of the way back to it.
    for (const off of [-0.4, 0.3]) {
      const aim = meadow.aimFor(right + within * off, 1);
      assert.ok(Math.abs(aim.angle - right) < Math.abs(within * off) * (1 - pull) + rad(0.6), `${help}, ${off}: ${deg(aim.angle - right)}`);
      assert.equal(aim.target, target);
    }
    // Well off: left as it is.
    for (const off of [-1.3, 1.6, 3]) {
      const asked = right + within * off;
      assert.ok(Math.abs(meadow.aimFor(asked, 1).angle - asked) < 1e-9, `${help}, ${off}`);
    }
    // Sweeping the bow across the target, the arc never jumps.
    let last = null;
    for (let angle = right - within * 1.5; angle <= right + within * 1.5; angle += rad(0.1)) {
      const { angle: aimed } = meadow.aimFor(angle, 1);
      if (last !== null) assert.ok(Math.abs(aimed - last) < rad(1.3), `${help}: a jump of ${deg(aimed - last)} at ${deg(angle)}`);
      last = aimed;
    }
  }
  // Off, the arc is just where the bow points.
  const plain = makeMeadow({ help: 'off' });
  const right = plain.solve(plainOf(plain), 1);
  assert.equal(plain.aimFor(right + rad(2), 1).angle, right + rad(2));
  // And a bow that isn't drawn far enough to shoot isn't helped.
  const weak = makeMeadow({ help: 'lots' });
  assert.equal(weak.aimFor(rad(10), MIN_DRAW - 0.05).angle, rad(10));
});

test('the arc that is shown says what it will hit, and how it ends', () => {
  const meadow = makeMeadow({ help: 'little' });
  const target = plainOf(meadow);
  const onto = meadow.aimFor(meadow.solve(target, 1), 1);
  assert.equal(onto.target, target);
  assert.equal(onto.end.what, 'target');
  assert.ok(onto.dots.length >= 2);
  assert.ok(onto.dots.every((dot, index) => index === 0 || dot.x > onto.dots[index - 1].x), 'the dots go on across');
  // Pointing down, with the bow barely drawn, and no help: it comes down in the grass, short of the target.
  const plain = makeMeadow({ help: 'off' });
  const short = plain.aimFor(ANGLES.low, 0.3);
  assert.equal(short.target, null);
  assert.equal(short.end.what, 'ground');
  assert.ok(short.end.x < BOW.x + 0.7 && Math.abs(short.end.y - WORLD.ground) < 0.02);
});

/* ---------- what each level brings ---------- */

test('each level from 2 brings something new, named in both languages, that the level before did not have', () => {
  assert.deepEqual(meadowNewAt(1), []);
  const keys = [];
  for (const level of LEVELS.slice(1)) {
    const news = meadowNewAt(level);
    assert.equal(news.length, 1, `level ${level}`);
    for (const { key, mark, name, nameKa } of news) {
      assert.ok(mark && name && nameKa, `level ${level}`);
      assert.equal(newsIsOn(key, level), true, `${key} is on at level ${level}`);
      assert.equal(newsIsOn(key, level - 1), false, `${key} is not on before level ${level}`);
      assert.equal(newsIsOn(key, 10), true, `${key} is still on at level 10`);
      assert.ok(LABELS[key]?.length === 2, `${key} has a label in both languages`);
      keys.push(key);
    }
  }
  assert.equal(new Set(keys).size, 9);
  assert.deepEqual(Object.keys(NEWS).map(Number), LEVELS.slice(1));
  // The plain target is a little smaller each level, and never tiny: gently, at level 10 it's three quarters the size.
  const gently = (level) => meadowLevel(level, { gentle: true });
  for (const level of LEVELS.slice(1)) assert.ok(gently(level).size < gently(level - 1).size);
  assert.ok(gently(10).size >= 0.75 * gently(1).size);
  assert.ok(gently(10).near > gently(1).near);
});

test('a plain target is always up, near, whatever else the level has brought, and what\'s new comes first', () => {
  const newest = { 2: 'balloon', 3: 'far', 4: 'roller', 5: 'roller', 6: 'wall', 7: 'bell', 8: 'mill', 9: 'mill', 10: 'mill' };
  for (const level of LEVELS.slice(1)) {
    const meadow = makeMeadow({ level });
    assert.equal(meadow.live.length, 1);
    const first = special(meadow);
    assert.equal(first.kind, newest[level], `level ${level}`);
    assert.equal(meadow.live.filter((target) => target.slot === 'special').length, 1, 'one at a time');
    // Each kind the level has takes its turn, the newest first, and a plain target is there all the while.
    const kinds = [];
    for (let n = 0; n < meadow.specials.length * 2; n += 1) {
      const target = special(meadow);
      kinds.push(target.kind);
      assert.ok(plainOf(meadow) || meadow.waits.plain <= 0.5, `level ${level}: a plain target is up, or about to be`);
      const plain = plainOf(meadow);
      if (plain) assert.ok(plain.x + plain.r <= 0.9401 && Math.hypot(plain.x - target.x, plain.y - target.y) > plain.r + target.r, 'and clear of the other');
      target.state = 'hit';
      target.since = 0;
      meadow.waits.special = 0.2;
      run(meadow, 1.5, () => !meadow.targets.includes(target));
    }
    assert.deepEqual(kinds.slice(0, meadow.specials.length), meadow.specials);
    assert.deepEqual(kinds.slice(meadow.specials.length), meadow.specials, 'and round again');
    assert.equal(new Set(kinds).size, meadow.specials.length);
  }
});

test('every target can be hit, in any wind the level has, without the bow drawn right back', () => {
  for (const level of LEVELS) {
    const meadow = makeMeadow({ level });
    const winds = meadow.plan.wind ? EXTRAS.wind.turns.map((turn) => turn * meadow.plan.wind) : [0];
    const seen = new Set();
    for (let n = 0; n < 40 && seen.size < meadow.specials.length + 1; n += 1) {
      for (const target of meadow.live) {
        if (target.slot === 'extra') continue;
        seen.add(target.kind);
        for (const wind of winds) {
          meadow.wind = wind;
          // The plain one with a bow half drawn, and the rest with one drawn nine tenths of the way.
          const draw = target.slot === 'plain' ? 0.5 : 0.9;
          const angle = meadow.solve(target, draw) ?? meadow.solve(target, draw, { lob: true });
          assert.ok(angle !== null, `level ${level}: the ${target.kind} at ${target.x.toFixed(2)}, ${target.y.toFixed(2)} in a wind of ${wind} at ${draw}`);
          assert.ok(angle > ANGLES.low && angle < ANGLES.high);
        }
        target.state = 'hit';
        target.since = 0;
      }
      meadow.waits.special = 0;
      run(meadow, 2);
    }
    assert.equal(seen.size, meadow.specials.length + 1, `level ${level}: ${[...seen]}`);
  }
});

test('from level 2, a balloon bobs up in the air, pops for a star, and doesn\'t stop the arrow', () => {
  const meadow = makeMeadow({ level: 2 });
  assert.equal(meadow.stars, true);
  const balloon = special(meadow);
  assert.equal(balloon.kind, 'balloon');
  assert.ok(balloon.y < BOW.y - 0.1, 'higher than the bow');
  const heights = [];
  run(meadow, 5, () => {
    heights.push(meadow.whereAt(balloon).y);
    return false;
  });
  assert.ok(Math.max(...heights) - Math.min(...heights) > 0.01, 'it bobs');
  const { arrow, types } = shootAt(meadow, balloon);
  assert.ok(types.includes('hit') && types.includes('prize'));
  assert.equal(meadow.stats.stars, STARS.balloon);
  assert.equal(meadow.stats.hits, 1);
  // The arrow went on through, to the grass, and that's no miss.
  assert.equal(arrow.state, 'stuck');
  assert.equal(arrow.in, null);
  assert.equal(meadow.stats.misses, 0);
  assert.equal(meadow.stats.run, 1);
  // A plain target hit gives no star.
  shootAt(meadow, plainOf(meadow));
  assert.equal(meadow.stats.stars, STARS.balloon);
});

test('from level 3, the far target stands at the far end, and a bow that\'s barely drawn doesn\'t reach it', () => {
  const meadow = makeMeadow({ level: 3 });
  const far = special(meadow);
  withoutPlain(meadow);
  assert.equal(far.kind, 'far');
  assert.ok(far.x - BOW.x > 1, `${far.x - BOW.x} from the bow`);
  assert.equal(meadow.solve(far, 0.35), null, 'with the bow a third drawn, nothing reaches');
  assert.ok(meadow.solve(far, 0.9) !== null);
  const { types } = shootAt(meadow, far);
  assert.ok(types.includes('hit'));
  assert.equal(meadow.stats.stars, STARS.far);
});

test('from level 4, a target on wheels rolls slowly to and fro, and an arrow let go for where it will be hits it', () => {
  const meadow = makeMeadow({ level: 4 });
  const roller = special(meadow);
  assert.equal(roller.kind, 'roller');
  const places = [];
  run(meadow, EXTRAS.roller.seconds, () => {
    places.push(meadow.whereAt(roller).x);
    return false;
  });
  const [low, high] = [Math.min(...places), Math.max(...places)];
  assert.ok(Math.abs(high - low - 2 * EXTRAS.roller.sway) < 0.01, 'all the way there and back');
  assert.ok(high + roller.r < WORLD.wide && low - roller.r > 0.94, 'clear of the plain target');
  // Slowly: in the time an arrow takes to get there, it moves less than its own width.
  const fastest = Math.max(...places.slice(1).map((x, index) => Math.abs(x - places[index]) / FRAME));
  assert.ok(fastest * 1 < roller.r * 2, `${fastest} a second`);
  for (let n = 0; n < 4; n += 1) {
    run(meadow, 1.7);
    const target = special(meadow);
    assert.ok(shootAt(meadow, target).types.includes('hit'), `arrow ${n + 1}, with the cart at ${meadow.whereAt(target).x.toFixed(2)}`);
    target.kind === 'roller' || assert.fail('only the cart is tried here');
    // The next special thing is something else: bring the cart round again.
    while (special(meadow).kind !== 'roller') {
      const other = special(meadow);
      other.state = 'hit';
      other.since = 0;
      meadow.waits.special = 0;
      run(meadow, 1.5);
    }
  }
});

test('from level 5, the wind bends every arc, changes with each new plain target, and blows less hard against', () => {
  const calm = makeMeadow({ level: 4 });
  assert.equal(calm.wind, 0);
  assert.equal(said(calm, 'wind').length, 0);
  const meadow = makeMeadow({ level: 5, goal: 14 });
  assert.ok(meadow.wind > 0, 'it starts by blowing the arrow along');
  assert.equal(said(meadow, 'wind').length, 1);
  // The same shot goes further with the wind behind it, and less far against it.
  const lands = (wind) => {
    const each = makeMeadow({ level: 5 });
    each.targets = [];
    each.wind = wind;
    return each.trace(rad(40), 1).end.x;
  };
  assert.ok(lands(0.2) > lands(0) + 0.05 && lands(0) > lands(-0.15) + 0.03);
  // An arrow keeps the wind it left with.
  const winds = [meadow.wind];
  for (let n = 0; n < 12; n += 1) {
    run(meadow, 5, () => plainOf(meadow));
    const arrow = meadow.loose(meadow.solve(plainOf(meadow), 1), 1);
    const leftWith = meadow.wind;
    run(meadow, 3, () => arrow.state !== 'flying');
    assert.equal(arrow.shot.wind, leftWith);
    if (meadow.wind !== winds.at(-1)) winds.push(meadow.wind);
  }
  assert.ok(winds.length >= 12, 'a new wind with each new plain target');
  assert.ok(winds.some((wind) => wind > 0) && winds.some((wind) => wind < 0), 'both ways');
  assert.ok(Math.max(...winds) <= EXTRAS.wind.most + 1e-9);
  assert.ok(Math.min(...winds) >= -0.8 * EXTRAS.wind.most, 'and never as hard against the arrow');
  assert.equal(said(meadow, 'wind').length, winds.length);
});

test('from level 6, a hay wall stops a low arrow, and a high arc goes over it to the target behind', () => {
  const meadow = makeMeadow({ level: 6 });
  const target = special(meadow);
  assert.equal(target.kind, 'wall');
  const { wall } = target;
  assert.ok(wall.x0 > 0.94 && target.x > wall.x1 && wall.top < target.y - target.r, 'the target is behind it, and lower than its top');
  // Straight at it: the arrow bonks off the wall and drops, which costs nothing.
  const straight = Math.atan2(BOW.y - target.y, target.x - BOW.x);
  const low = shoot(meadow, straight + rad(8), 1);
  assert.deepEqual(low.events.filter((event) => event.type === 'bonk').map((event) => event.what), ['wall']);
  assert.equal(low.arrow.state, 'fell');
  assert.equal(meadow.stats.hits, 0);
  assert.equal(target.state, 'up');
  // No low arc reaches it at all, and a high one does.
  const angle = meadow.solve(target, 1);
  assert.ok(angle !== null && deg(angle) > 45, `it takes ${deg(angle)} degrees`);
  const high = shoot(meadow, angle, 1);
  assert.ok(high.types.includes('hit'));
  assert.equal(meadow.stats.stars, STARS.wall);
  // The wall goes with its target.
  run(meadow, 1.5);
  assert.equal(meadow.targets.some((each) => each.wall), false);
});

test('from level 7, the bell up on its post rings for two stars, and the arrow drops', () => {
  const meadow = makeMeadow({ level: 7 });
  const bell = special(meadow);
  assert.equal(bell.kind, 'bell');
  assert.ok(bell.y < 0.4 && bell.r <= 0.05, 'high up, and small');
  const { arrow, types } = shootAt(meadow, bell);
  assert.ok(types.includes('hit'));
  assert.equal(arrow.state, 'fell');
  assert.equal(meadow.stats.stars, 2);
  assert.equal(STARS.bell, 2);
});

test('from level 8, the windmill has a target at its middle, and its sails stop an arrow that meets one on the way in', () => {
  const meadow = makeMeadow({ level: 8 });
  const target = special(meadow);
  withoutPlain(meadow);
  assert.equal(target.kind, 'mill');
  const { mill } = target;
  mill.phase = 0.3;
  assert.deepEqual([target.x, target.y], [mill.x, mill.y], 'the target is the middle of the windmill');
  assert.ok(mill.x - mill.r > 0.94 && target.r < mill.inner, 'clear of the plain target, and never covered by a sail');
  // Four sails, a quarter of a turn apart, going round: a place on one now is clear a moment later.
  const out = mill.r * 0.7;
  const along = (turn, far = out) => [mill.x + Math.cos(turn) * far, mill.y + Math.sin(turn) * far];
  for (let sail = 0; sail < 4; sail += 1) assert.equal(inMill(mill, ...along(mill.phase + (sail * Math.PI) / 2), 0), 'sail');
  assert.equal(inMill(mill, ...along(mill.phase + Math.PI / 4), 0), null, 'between two sails');
  assert.equal(inMill(mill, ...along(mill.phase), (Math.PI / 4) / mill.rate), null, 'and where a sail was, once it has gone on');
  assert.equal(inMill(mill, ...along(mill.phase, mill.r + 0.02), 0), null, 'past the end of a sail');
  assert.equal(inMill(mill, ...along(mill.phase, mill.inner * 0.8), 0), null, 'and inside where they start, by the target');
  assert.equal(inMill(mill, mill.x, mill.y + mill.r + 0.05, 0), 'tower');
  assert.ok((Math.PI / 2) / mill.rate >= 3, 'slowly: a sail every three seconds or more');
  // The arc to the target, low or high, with the sails a little further round each time: about a third of the
  // time one is in the way, and the rest of the time none is.
  const open = { ...mill, rate: 0, phase: 0 };
  for (const lob of [false, true]) {
    let angle = null;
    for (let turn = 0; turn < 90 && angle === null; turn += 5) {
      target.mill = { ...open, phase: rad(turn) };
      angle = meadow.solve(target, 1, { lob });
    }
    assert.ok(angle !== null);
    const ends = [];
    for (let turn = 0; turn < 90; turn += 3) {
      target.mill = { ...open, phase: rad(turn) };
      ends.push(meadow.trace(angle, 1).end.what);
    }
    const stopped = ends.filter((what) => what === 'sail').length;
    assert.ok(ends.every((what) => what === 'sail' || what === 'target'), `${[...new Set(ends)]}`);
    assert.ok(stopped >= ends.length * 0.2 && stopped <= ends.length * 0.45, `a sail is in the way ${stopped} times in ${ends.length}`);
    if (lob) continue;
    // An arrow that meets one bonks off it and drops, which costs nothing, and one that doesn't hits the target.
    target.mill = { ...open, phase: rad(3 * ends.indexOf('sail')) };
    const met = shoot(meadow, angle, 1);
    assert.deepEqual(met.events.filter((event) => event.type === 'bonk').map((event) => event.what), ['sail']);
    assert.equal(met.arrow.state, 'fell');
    assert.deepEqual([meadow.stats.hits, target.state], [0, 'up']);
    target.mill = { ...open, phase: rad(3 * ends.indexOf('target')) };
    assert.ok(shoot(meadow, angle, 1).types.includes('hit'));
    assert.equal(meadow.stats.stars, STARS.mill);
    target.state = 'up';
  }
  // With the sails turning, an arrow let go when the dotted line gets through gets through.
  const fresh = makeMeadow({ level: 8 });
  const again = special(fresh);
  withoutPlain(fresh);
  let hits = 0;
  for (let n = 0; n < 12; n += 1) {
    run(fresh, 0.37);
    const angle = fresh.solve(again, 1);
    if (angle === null) continue;
    assert.ok(shoot(fresh, angle, 1).types.includes('hit'), `arrow ${n + 1}`);
    hits += 1;
    again.state = 'up';
  }
  assert.ok(hits >= 6, `${hits} of 12 moments had a way through`);
});

test('from level 9, a bird carries a gift across now and then: three stars for hitting it, and nothing lost for not', () => {
  const none = makeMeadow({ level: 8 });
  run(none, 40);
  assert.equal(none.bird, null);
  const meadow = makeMeadow({ level: 9 });
  const waited = run(meadow, 30, () => meadow.bird);
  assert.ok(Math.abs(waited - EXTRAS.bird.first) < 0.1);
  assert.equal(said(meadow, 'bird').length, 1);
  const { gift } = meadow.bird;
  assert.equal(gift.kind, 'gift');
  // It comes from the far end, with the gift hanging under it, and goes out over the archer's head.
  run(meadow, 3);
  const [bird, hung] = [meadow.bird, meadow.whereAt(gift)];
  assert.ok(Math.abs(bird.x - hung.x) < 1e-6 && hung.y - bird.y > 0.06);
  assert.ok(bird.x < EXTRAS.bird.from && bird.x > BOW.x);
  const crossing = (EXTRAS.bird.from - EXTRAS.bird.to) / EXTRAS.bird.speed;
  assert.ok(crossing > 15, 'slowly');
  // Nobody shoots: it goes, with its gift, and comes again after a while. Nothing is lost.
  run(meadow, crossing, () => !meadow.bird);
  assert.equal(meadow.bird, null);
  assert.equal(meadow.targets.includes(gift), false);
  assert.deepEqual([meadow.stats.stars, meadow.stats.misses], [0, 0]);
  const again = run(meadow, 60, () => meadow.bird);
  assert.ok(Math.abs(again - EXTRAS.bird.every) < 0.1);
  // This time the gift is hit, once it's near enough.
  run(meadow, 60, () => meadow.solve(meadow.bird.gift, 1) !== null);
  const { types } = shootAt(meadow, meadow.bird.gift);
  assert.ok(types.includes('hit'));
  assert.equal(meadow.stats.stars, 3);
  assert.equal(meadow.bird.given, true);
  // The bird itself is never hit: it flies on.
  run(meadow, 1);
  assert.ok(meadow.bird);
});

test('at level 10, the castle\'s golden target comes up once the contest is won, and hitting it wins the trophy', () => {
  const meadow = makeMeadow({ level: 10, goal: 6 });
  assert.equal(meadow.castle, undefined);
  for (let n = 0; n < 6; n += 1) {
    run(meadow, 5, () => plainOf(meadow));
    shootAt(meadow, plainOf(meadow));
  }
  assert.equal(meadow.stats.hits, 6);
  assert.equal(meadow.phase, 'castle');
  assert.equal(said(meadow, 'castle').length, 1);
  assert.equal(said(meadow, 'won').length, 0);
  // Only the golden target is left, at the far end.
  run(meadow, 2);
  assert.deepEqual(meadow.live.map((target) => target.kind), ['castle']);
  const golden = meadow.castle;
  assert.ok(golden.x - BOW.x > 1);
  // A miss is nothing. A hit is the trophy, and then the party.
  shoot(meadow, rad(60), 0.4);
  assert.equal(meadow.phase, 'castle');
  const { types } = shootAt(meadow, golden);
  assert.ok(types.includes('trophy') && types.includes('won'));
  assert.deepEqual([meadow.stats.trophy, meadow.stats.hits], [true, 6]);
  assert.equal(said(meadow, 'trophy')[0].given, false);
  run(meadow, 5, () => meadow.done);
  assert.equal(meadow.done, true);
});

test('a golden target nobody hits is given anyway, so the contest always ends', () => {
  const meadow = makeMeadow({ level: 10, goal: 6 });
  for (let n = 0; n < 6; n += 1) {
    run(meadow, 5, () => plainOf(meadow));
    shootAt(meadow, plainOf(meadow));
  }
  const waited = run(meadow, 60, () => said(meadow, 'trophy').length);
  assert.ok(Math.abs(waited - EXTRAS.castle.waits) < 0.1, `${waited}`);
  assert.equal(said(meadow, 'trophy')[0].given, true);
  assert.equal(meadow.stats.trophy, true);
  run(meadow, 5, () => meadow.done);
  assert.equal(meadow.done, true);
});

test('every level can be won by an archer who aims where the meadow wants, well or badly, quickly or slowly', () => {
  let wasted = 0;
  for (const level of LEVELS) {
    const good = makeMeadow({ level, help: 'little' });
    const took = playThrough(good, { every: 1.2, wander: 0 });
    assert.equal(good.done, true, `level ${level}: not over after ${took} s`);
    assert.ok(good.stats.hits >= 10);
    assert.ok(took < 150, `level ${level} took ${took} s`);
    // One whose aim wanders by a dozen degrees either way, and who takes their time, still gets there.
    const clumsy = makeMeadow({ level, help: 'little' });
    const slow = playThrough(clumsy, { every: 3, wander: 12, seconds: 1500 });
    assert.equal(clumsy.done, true, `level ${level}, aiming badly: not over after ${slow} s`);
    assert.ok(slow < 400, `level ${level}, aiming badly, took ${slow} s`);
    wasted += clumsy.stats.shots - clumsy.stats.hits;
  }
  // Some of those arrows missed, and it made no difference.
  assert.ok(wasted >= 10, `${wasted} arrows hit nothing`);
});

/* ---------- with friends ---------- */

/** So many games, wired to each other as the server wires them: the first claim of a target has it, for everyone. */
function together(count, { goal = 5, seed = 4242, level = 3 } = {}) {
  const owners = new Map();
  const ids = Array.from({ length: count }, (_, index) => `player-${index + 1}`);
  const games = [];
  const server = { down: false, heard: [] };
  const claim = (id) => (k) => {
    server.heard.push([id, k]);
    if (server.down || owners.has(k)) return;
    owners.set(k, id);
    for (const game of games) game.claimed(k, id);
  };
  for (const id of ids) games.push(makeMeadow({ level, goal: goal * count, me: id, team: { seed, players: count, claim: claim(id) } }));
  return { games, ids, owners, server };
}

test('with friends, everyone has the same targets, laid out the same from the seed', () => {
  assert.deepEqual([1, 2, 3, 4, 9].map(teamSlots), [2, 3, 4, 4, 4]);
  for (const count of [2, 3, 4]) {
    const { games } = together(count);
    const shown = (game) => game.live.map(({ k, kind, x, y, r }) => ({ k, kind, x, y, r }));
    assert.equal(games[0].live.length, teamSlots(count));
    for (const game of games.slice(1)) assert.deepEqual(shown(game), shown(games[0]));
    // Each in its own part of the meadow, with none of what the levels bring but balloons and the far target.
    for (const target of games[0].live) {
      const zone = FRIEND_ZONES[target.k % teamSlots(count)];
      assert.equal(target.kind, zone.kind);
      assert.ok(target.x >= zone.x[0] && target.x <= zone.x[1] && target.y >= zone.y[0] && target.y <= zone.y[1]);
      assert.ok(games[0].solve(target, 0.9) !== null, `the ${target.kind} can be hit`);
    }
    assert.deepEqual([games[0].wind, games[0].plan.bird, games[0].plan.castle, games[0].stars], [0, false, false, false]);
  }
  // Another seed is another meadow, and the same seed the same one, whoever asks.
  assert.deepEqual(friendTarget(7, 3, 2, 3), friendTarget(7, 3, 2, 3));
  assert.notDeepEqual(friendTarget(7, 3, 2, 3), friendTarget(8, 3, 2, 3));
  // Every target a seed can lay out is one an arrow can reach.
  const meadow = makeMeadow({ team: { seed: 99, players: 4, claim: () => {} } });
  for (let k = 0; k < 60; k += 1) {
    meadow.targets = [];
    meadow.owners.clear();
    const target = meadow.spawnShared(k);
    assert.ok(meadow.solve(target, 0.9) !== null, `target ${k}, a ${target.kind} at ${target.x.toFixed(2)}, ${target.y.toFixed(2)}`);
  }
});

test('together, a target is whoever\'s arrow hit it first, it counts for the team on every computer, and the next one comes', () => {
  const { games, ids, owners } = together(2);
  const [ana, ben] = games;
  const first = ana.live[0];
  const k = first.k;
  const { types } = shootAt(ana, first);
  assert.ok(types.includes('hit') && types.includes('claimed'));
  assert.equal(owners.get(k), ids[0]);
  // Counted the same on both, as Ana's, and gone from both, with the next one in its place a moment later.
  for (const game of games) {
    assert.equal(game.total, 1);
    assert.equal(game.tally.get(ids[0]), 1);
    assert.equal(game.live.some((target) => target.k === k), false);
  }
  assert.deepEqual([ana.stats.hits, ben.stats.hits], [1, 0]);
  assert.equal(said(ben, 'claimed')[0].mine, false);
  for (const game of games) run(game, 2);
  for (const game of games) assert.ok(game.live.some((target) => target.k === k + teamSlots(2)), 'the next one in that part of the meadow');
  // Ben hits one too, and both count two.
  shootAt(ben, ben.live[0]);
  for (const game of games) assert.equal(game.total, 2);
  assert.deepEqual([ana.tally.get(ids[1]), ben.stats.hits], [1, 1]);
});

test('together, two arrows at the same target make it one hit, for whoever got there first', () => {
  const { games, ids } = together(2);
  const [ana, ben] = games;
  const k = ana.live[1].k;
  const hers = ana.loose(ana.solve(ana.live[1], 1), 1);
  const his = ben.loose(ben.solve(ben.live.find((target) => target.k === k), 0.9), 0.9);
  for (let t = 0; t < 4; t += FRAME) for (const game of games) game.update(FRAME);
  assert.notEqual(hers.state, 'flying');
  assert.notEqual(his.state, 'flying');
  for (const game of games) {
    assert.equal(game.total, 1);
    assert.equal(game.owners.get(k), ids[0], 'the quicker arrow');
  }
  assert.deepEqual([ana.stats.hits, ben.stats.hits], [1, 0]);
  // Ben's arrow came to nothing, which is no miss to speak of: nothing is taken from anyone.
  assert.equal(ben.total, 1);
});

test('together, enough targets between everyone win it for everyone at once, with each one\'s share counted the same', () => {
  for (const count of [2, 3, 4]) {
    const { games, ids } = together(count, { goal: 4 });
    assert.equal(games[0].goal, 4 * count);
    let turn = 0;
    for (let guard = 0; guard < 400 && !games[0].done; guard += 1) {
      const game = games[turn % count];
      turn += 1;
      const wanted = game.wants();
      if (wanted) game.loose(wanted.angle, wanted.draw);
      for (let t = 0; t < 1.2; t += FRAME) for (const each of games) each.update(FRAME);
    }
    for (const game of games) {
      assert.equal(game.done, true, `${count} players`);
      assert.equal(game.total, 4 * count);
      assert.deepEqual([...game.tally.entries()].sort(), [...games[0].tally.entries()].sort());
      assert.equal(said(game, 'won').length, 1);
    }
    assert.equal(ids.reduce((sum, id) => sum + (games[0].tally.get(id) ?? 0), 0), 4 * count);
    assert.ok(ids.every((id) => (games[0].tally.get(id) ?? 0) > 0), 'everyone hit some');
  }
});

test('together, a claim the server never answered is made again, and a target stays hit meanwhile', () => {
  const { games, server } = together(2);
  const [ana] = games;
  server.down = true;
  const target = ana.live[0];
  shootAt(ana, target);
  assert.equal(target.state, 'asked');
  assert.equal(ana.total, 0);
  assert.equal(ana.live.includes(target), false, 'another arrow can\'t hit it again');
  assert.equal(server.heard.length, 1);
  run(ana, 1.5);
  assert.equal(server.heard.length, 1);
  server.down = false;
  run(ana, 1);
  assert.equal(server.heard.length, 2);
  assert.equal(ana.total, 1);
  assert.equal(target.state, 'hit');
});

test('a friend\'s arrow is shown flying, and hits nothing here', () => {
  const { games } = together(2);
  const [ana] = games;
  const target = ana.live[0];
  const ghost = ana.loose(ana.solve(target, 1), 1, { ghost: true, by: 'player-2' });
  assert.equal(ghost.ghost, true);
  run(ana, 4, () => ghost.state !== 'flying');
  assert.equal(target.state, 'up');
  assert.deepEqual([ana.total, ana.stats.shots, ana.stats.misses, ana.stats.hits], [0, 0, 0, 0]);
  assert.equal(said(ana, 'hit').length, 0);
});

test('against each other, everyone has the same targets one after another, in a lane of their own', () => {
  const lane = (me, seed = 31) => makeMeadow({ goal: 6, me, race: { seed }, level: 5 });
  const [ana, ben] = [lane('a'), lane('b')];
  const order = [];
  for (let n = 0; n < 6; n += 1) {
    run(ana, 5, () => ana.live.length);
    assert.equal(ana.live.length, 1, 'one at a time');
    const target = ana.live[0];
    order.push([target.k, target.kind, target.x, target.y]);
    assert.equal(target.k, n);
    assert.equal(target.kind, FRIEND_ZONES[n % FRIEND_ZONES.length].kind, 'near, then further, then up high, then far');
    assert.ok(shootAt(ana, target).types.includes('hit'));
  }
  assert.equal(ana.stats.hits, 6);
  assert.equal(ana.phase, 'won');
  // Ben's lane has the same ones in the same order, and nothing Ana did has touched it.
  assert.equal(ben.stats.hits, 0);
  for (let n = 0; n < 6; n += 1) {
    run(ben, 5, () => ben.live.length);
    const target = ben.live[0];
    assert.deepEqual([target.k, target.kind, target.x, target.y], order[n]);
    shootAt(ben, target);
  }
  // No wind, and none of what the levels bring.
  assert.deepEqual([ana.wind, ana.specials.length, ana.plan.castle], [0, 0, false]);
  // Another seed, other places.
  const other = lane('c', 32);
  assert.notDeepEqual([other.live[0].x, other.live[0].y], [order[0][2], order[0][3]]);
});

/* ---------- its words, and where it's listed ---------- */

test('every line the game says has its English and Georgian voice files, and the game says each one', () => {
  const folder = new URL('../../games/arrow-meadow/audio/voice/', import.meta.url);
  const lines = JSON.parse(readFileSync(new URL('lines.json', folder), 'utf8'));
  assert.ok(lines.length >= 9);
  for (const { id, ka } of lines) {
    assert.ok(ka && /[\u10D0-\u10FF]/.test(ka), `${id} has Georgian`);
    for (const language of ['en', 'ka']) assert.ok(readFileSync(new URL(`${language}/${id}.ogg`, folder)).length > 1000, `${language}/${id}.ogg`);
  }
  const source = readFileSync(new URL('../../games/arrow-meadow/main.js', import.meta.url), 'utf8');
  for (const { text } of lines) assert.ok(source.includes(text), `"${text}" is said by the game`);
  // And nothing for players has a long dash in it.
  for (const { text, ka } of lines) assert.ok(!/[—–]/.test(text + ka));
  for (const [en, ka] of Object.values(LABELS)) assert.ok(!/[—–]/.test(en + ka));
});

test('the grown-ups\' settings for this game have names of their own, as every game\'s are kept together', () => {
  const source = readFileSync(new URL('../../games/arrow-meadow/main.js', import.meta.url), 'utf8');
  assert.match(source, /defaults: \{ arrowReach: 'small', arrowHelp: 'off', arrowQuiver: 'quiver', arrowGoal: 10, arrowFriends: 'together' \}/);
  assert.match(source, /choices: \{ arrowReach: String, arrowHelp: String, arrowQuiver: String, arrowGoal: Number, arrowFriends: String \}/);
  // Together is how a game with friends comes. The contest comes as a challenge: no help with aiming, and only so many
  // arrows. The gentle choice under "Arrows in the quiver" is the contest as it always was.
  assert.equal(GOALS.includes(10), true);
  assert.equal(HELP_NAMES.includes('off'), true);
  assert.match(source, /choice\('arrowQuiver', 'gentle'/);
});

test('the game is on the page for choosing one, under sports and both hands, with friends, and its server knows it', () => {
  const hub = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const card = /<a class="game-card" href="games\/arrow-meadow\/index.html"[^>]*>[\s\S]*?<\/a>/.exec(hub)?.[0] ?? '';
  assert.match(card, /data-game="arrow-meadow"/);
  assert.match(card, /data-tags="sports stories hands sitting"/);
  assert.match(card, /data-words="[^"]*archery[^"]*"/);
  assert.match(card, /class="game-friends"/);
  assert.match(card, /<h2>Arrow Meadow<\/h2>/);
  for (const file of ['../../server/worker.js', '../../tools/race-server.mjs']) {
    assert.match(readFileSync(new URL(file, import.meta.url), 'utf8'), /const GAMES = \[[^\]]*'arrow-meadow'[^\]]*\]/, file);
  }
  // Its own page may reach the server for playing with friends, and nothing else off this computer but Google's tag.
  const page = readFileSync(new URL('../../games/arrow-meadow/index.html', import.meta.url), 'utf8');
  assert.match(page, /connect-src 'self' wss:\/\/hemi-race\.infoicy\.com ws:\/\/localhost:\* /);
});
