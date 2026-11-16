// Swamp Splash: the child jumps, mud splats onto the window, and the level is won when enough of it is muddy, or
// lost if the rain cloud gets here first and washes it. Everything here runs without a screen, with a pretend
// child who is said to jump this high, or to bend their knees, or to be in the picture or not. The random is a
// seeded one, so the same thing happens every time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUBBLE, CUP, FROGS, GOLD, GRID, HERON, NEW_THINGS, SHOWER, SPLASH, SQUAT, STAR, Swamp, WIND, newAt, splashShare, swampLevel,
} from '../../games/swamp-splash/swamp.js';

const FRAME = 1 / 60;
const LEVELS = Array.from({ length: 10 }, (_, index) => index + 1);
const CELLS = GRID.wide * GRID.high;
const SEEN = { seen: true };
const AWAY = { seen: false };
const SMALL = 1.2; // A jump, but not a big one.
const BIG = SPLASH.bigAt;

/** A small seeded random (mulberry32), so that nothing depends on chance. */
function seeded(seed = 7) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSwamp({ seed = 7, ...options } = {}) {
  const log = [];
  const swamp = new Swamp({ random: seeded(seed), onEvent: (event) => log.push(event), ...options });
  swamp.log = log;
  swamp.count = (type, kind) => log.filter((event) => event.type === type && (!kind || event.kind === kind || event.why === kind)).length;
  swamp.last = (type, kind) => log.filter((event) => event.type === type && (!kind || event.kind === kind || event.why === kind)).at(-1);
  return swamp;
}

/** A swamp whose countdown is over. */
function playing(options) {
  const swamp = makeSwamp(options);
  swamp.begin();
  return swamp;
}

/** Runs the game for some seconds, with the child in the picture unless said otherwise. input can be a function of
 * the swamp, asked each frame. */
function run(swamp, seconds, input = SEEN) {
  for (let frame = 0; frame < Math.round(seconds / FRAME); frame += 1) swamp.update(FRAME, typeof input === 'function' ? input(swamp) : input);
}

/** Runs the game, with the child in the picture, until something happens, and says what it was. */
function until(swamp, type, seconds = 60) {
  const before = swamp.count(type);
  for (let frame = 0; frame < Math.round(seconds / FRAME) && swamp.count(type) === before; frame += 1) swamp.update(FRAME, SEEN);
  const event = swamp.last(type);
  assert.ok(swamp.count(type) > before, `a ${type} within ${seconds} s`);
  return event;
}

/** Jumps a few times, so that there's mud on the window. */
function jumps(swamp, count, size = SMALL) {
  for (let n = 0; n < count; n += 1) swamp.land(size);
}

const muddyCells = (swamp) => [...swamp.mud.keys()].filter((cell) => swamp.mud[cell]);
const goldCells = (swamp) => [...swamp.mud.keys()].filter((cell) => swamp.mud[cell] === 2);
const cellAt = ({ x, y }) => Math.floor(y * GRID.high) * GRID.wide + Math.floor(x * GRID.wide);
const corners = [0, GRID.wide - 1, (GRID.high - 1) * GRID.wide, CELLS - 1];
/** How many muddy squares a strip of columns has, from top to bottom. */
function stripMud(swamp, from) {
  let count = 0;
  for (let y = 0; y < GRID.high; y += 1) for (let x = from; x < from + SHOWER.wide; x += 1) count += swamp.mud[y * GRID.wide + x] ? 1 : 0;
  return count;
}
const reachOf = (share) => Math.sqrt((share * CELLS) / Math.PI) / GRID.high;
const near = (actual, expected, within, message) => assert.ok(Math.abs(actual - expected) <= within, `${message ?? ''} expected about ${expected}, got ${actual}`);
/** Everything a player could see change, as one thing to compare. */
const snapshot = (swamp) => JSON.stringify({
  mud: [...swamp.mud], muddy: swamp.muddy, coverage: swamp.coverage, cloud: swamp.cloud, state: swamp.state, time: swamp.time,
  stats: swamp.stats, bubbleBig: swamp.bubbleBig, shower: swamp.shower, bubble: swamp.bubble, heron: swamp.heron, wind: swamp.wind,
  events: swamp.log.length,
});

/* ---------- what each level is ---------- */

test('every level from 2 brings something new, with a name in both languages', () => {
  assert.deepEqual(newAt(1), []);
  for (const level of LEVELS.slice(1)) {
    const things = newAt(level);
    assert.ok(things.length > 0, `level ${level}`);
    for (const thing of things) {
      assert.ok(thing.id && thing.mark && thing.name, `level ${level}`);
      assert.ok(/[ა-ჿ]/.test(thing.nameKa), `level ${level} has its name in Georgian letters`);
      assert.ok(!/[a-z]/i.test(thing.nameKa), `level ${level}'s Georgian name has no English in it`);
    }
  }
  assert.deepEqual(newAt(11), newAt(10), 'past the last level is the last level');
});

test('what a level brings is really in it, from that level on and not before', () => {
  const brings = {
    frog: [FROGS.from, (rules) => rules.frogs > 0],
    squat: [SQUAT.from, (rules) => rules.squat],
    shower: [SHOWER.from, (rules) => rules.shower !== null],
    bubble: [BUBBLE.from, (rules) => rules.bubble],
    heron: [HERON.from, (rules) => rules.heron],
    gold: [GOLD.from, (rules) => rules.gold],
    star: [STAR.from, (rules) => rules.star],
    wind: [WIND.from, (rules) => rules.wind !== null],
    cup: [CUP.from, (rules) => rules.cup],
  };
  assert.deepEqual(Object.values(brings).map(([from]) => from), [2, 3, 4, 5, 6, 7, 8, 9, 10]);
  for (const [id, [from, has]] of Object.entries(brings)) {
    assert.deepEqual(NEW_THINGS[from].map((thing) => thing.id), [id], `the card for level ${from} says ${id}`);
    for (const level of LEVELS) assert.equal(Boolean(has(swampLevel(level))), level >= from, `${id} at level ${level}`);
  }
});

test('the window has to be muddier and the rain cloud comes sooner as the levels go up', () => {
  for (const level of LEVELS.slice(1)) {
    assert.ok(swampLevel(level).target > swampLevel(level - 1).target, `more mud at level ${level}`);
    assert.ok(swampLevel(level).seconds <= swampLevel(level - 1).seconds, `no more time at level ${level}`);
  }
  assert.ok(swampLevel(10).seconds < swampLevel(1).seconds);
  for (const level of LEVELS) {
    const { target, seconds } = swampLevel(level);
    assert.ok(target > 0 && target < 1, `level ${level}`);
    assert.ok(Number.isFinite(seconds) && seconds > 0, `level ${level} has a rain cloud coming`);
  }
  // And what the levels bring comes on stronger too.
  assert.ok(swampLevel(10).frogs > swampLevel(2).frogs, 'more frogs');
  assert.ok(swampLevel(10).shower < swampLevel(4).shower, 'the shower comes oftener');
  assert.ok(swampLevel(10).wind < swampLevel(9).wind, 'the wind dries quicker');
});

test('the gentle swamp has no rain cloud at any level', () => {
  for (const level of LEVELS) {
    assert.equal(swampLevel(level, { gentle: true }).seconds, Infinity, `level ${level}`);
    assert.equal(swampLevel(level, { gentle: true }).target, swampLevel(level).target, 'the same mud to get');
  }
  for (const level of [1, 10]) {
    const swamp = playing({ level, gentle: true });
    swamp.land(SMALL);
    run(swamp, 200);
    assert.equal(swamp.cloud, 0, `level ${level}`);
    assert.equal(swamp.state, 'play');
    assert.equal(swamp.count('lost'), 0);
    assert.equal(swamp.count('clean', 'rain'), 0);
  }
});

test('a level past the ends is the nearest end', () => {
  assert.equal(new Swamp({ level: 0 }).levelNumber, 1);
  assert.equal(new Swamp({ level: 14 }).levelNumber, 10);
  assert.deepEqual(swampLevel(14), swampLevel(10));
});

/* ---------- a jump and its mud ---------- */

test('a bigger jump throws more mud, from the smallest jump to a big one and no further', () => {
  assert.equal(splashShare(1), SPLASH.small);
  near(splashShare(SPLASH.bigAt), SPLASH.big, 1e-12);
  near(splashShare(SPLASH.bigAt + 1), SPLASH.big, 1e-12, 'higher than big is big');
  assert.equal(splashShare(0.5), SPLASH.small, 'less than a jump is the smallest splash');
  let last = 0;
  for (let size = 1; size <= SPLASH.bigAt + 1e-9; size += 0.1) {
    assert.ok(splashShare(size) > last, `size ${size.toFixed(1)}`);
    last = splashShare(size);
  }
});

test('a big jump muddies more of the window than a small one', () => {
  for (const seed of [1, 2, 3]) {
    const small = playing({ seed });
    const big = playing({ seed });
    small.land(1);
    big.land(BIG);
    assert.ok(big.muddy > small.muddy * 2, `seed ${seed}: ${big.muddy} squares against ${small.muddy}`);
    near(small.coverage, SPLASH.small, 0.015, 'the smallest jump covers about its share');
    near(big.coverage, SPLASH.big, 0.025, 'a big one covers about its share');
  }
});

test('nothing lands before the countdown is over, and knees bent then don\'t count', () => {
  const swamp = makeSwamp({ level: 3 });
  swamp.land(BIG);
  swamp.squat();
  run(swamp, 5);
  assert.equal(swamp.state, 'ready');
  assert.equal(swamp.muddy, 0);
  assert.equal(swamp.time, 0);
  assert.equal(swamp.stats.jumps, 0);
  assert.deepEqual(swamp.log, []);
  swamp.begin();
  assert.equal(swamp.state, 'play');
  swamp.land(SMALL);
  assert.ok(swamp.muddy > 0);
  assert.equal(swamp.stats.supers, 0);
});

test('the mud goes where the window is cleanest, and little of it lands on mud that is there already', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const swamp = playing({ seed });
    while (swamp.coverage < 0.3 && swamp.stats.jumps < 40) {
      assert.equal(swamp.state, 'play');
      swamp.land(1.6);
      const { fresh, cells } = swamp.last('splat');
      assert.ok(fresh >= cells.length * 0.75, `seed ${seed}: ${fresh} new of ${cells.length}`);
    }
    const splats = swamp.log.filter((event) => event.type === 'splat');
    assert.ok(splats.length >= 4, 'several jumps');
    const fresh = splats.reduce((sum, splat) => sum + splat.fresh, 0);
    const all = splats.reduce((sum, splat) => sum + splat.cells.length, 0);
    assert.ok(fresh >= all * 0.93, `seed ${seed}: ${fresh} new of ${all}`);
    assert.equal(swamp.muddy, fresh, 'what was new is what is muddy');
  }
});

test('a splat says where it landed and which squares it covered', () => {
  const swamp = playing();
  swamp.land(BIG);
  const splat = swamp.last('splat');
  assert.equal(splat.kind, 'jump');
  assert.ok(splat.x > 0 && splat.x < 1 && splat.y > 0 && splat.y < 1);
  near(splat.reach, reachOf(SPLASH.big), 1e-9);
  assert.deepEqual([...splat.cells].sort((a, b) => a - b), muddyCells(swamp));
  assert.ok(splat.cells.includes(cellAt(splat)), 'the place it landed is in it');
  assert.equal(splat.golden, false);
});

test('a splat has a ragged edge, not a neat round one', () => {
  for (const seed of [1, 2, 3]) {
    const swamp = playing({ seed });
    swamp.land(BIG);
    const splat = swamp.last('splat');
    const [cx, cy, reach] = [splat.x * GRID.wide, splat.y * GRID.high, splat.reach * GRID.high];
    const from = (cell) => Math.hypot((cell % GRID.wide) + 0.5 - cx, Math.floor(cell / GRID.wide) + 0.5 - cy);
    const inside = new Set(splat.cells);
    assert.ok(splat.cells.some((cell) => from(cell) > reach * 1.04), `seed ${seed}: mud sticks out in places`);
    assert.ok([...swamp.mud.keys()].some((cell) => !inside.has(cell) && from(cell) < reach * 0.96), `seed ${seed}: and is short in others`);
  }
});

/* ---------- winning ---------- */

test('how muddy the window is, is its muddy squares over all of them', () => {
  const swamp = playing({ level: 9 });
  assert.equal(swamp.coverage, 0);
  jumps(swamp, 3, BIG);
  jumps(swamp, 3, 1.5);
  assert.equal(swamp.state, 'play');
  assert.equal(swamp.coverage, muddyCells(swamp).length / CELLS);
  // And it stays so as mud is washed, wiped and dried off.
  run(swamp, 40);
  assert.ok(swamp.count('clean', 'shower') && swamp.count('clean', 'wind'), 'some mud went');
  assert.equal(swamp.coverage, muddyCells(swamp).length / CELLS);
});

test('muddy enough is the level won, there and then, once', () => {
  const swamp = playing({ level: 1 });
  const { target } = swamp.rules;
  while (swamp.state === 'play' && swamp.stats.jumps < 100) {
    assert.ok(swamp.coverage < target);
    assert.equal(swamp.count('won'), 0);
    swamp.land(1.8);
  }
  assert.equal(swamp.state, 'won');
  assert.ok(swamp.coverage >= target);
  assert.equal(swamp.count('won'), 1);
  assert.equal(swamp.count('cup'), 0, 'no cup below level 10');
  assert.equal(swamp.stats.cup, false);
  assert.equal(swamp.log.at(-1).type, 'won');
});

test('after the level is won nothing more happens, however long or high the child jumps', () => {
  const swamp = playing({ level: 9 });
  while (swamp.state === 'play' && swamp.stats.jumps < 100) swamp.land(BIG);
  assert.equal(swamp.state, 'won');
  const before = snapshot(swamp);
  swamp.squat();
  swamp.land(BIG, { star: true });
  run(swamp, 100);
  swamp.begin();
  assert.equal(snapshot(swamp), before);
});

test('at level 10 the muddiest window wins the cup', () => {
  const swamp = playing({ level: 10 });
  while (swamp.state === 'play' && swamp.stats.jumps < 200) swamp.land(BIG);
  assert.equal(swamp.state, 'won');
  assert.ok(swamp.coverage >= swampLevel(10).target);
  assert.equal(swamp.count('cup'), 1);
  assert.equal(swamp.count('won'), 1);
  assert.equal(swamp.stats.cup, true);
});

/* ---------- the rain cloud ---------- */

test('with nobody in the picture the rain cloud waits, and so does everything else', () => {
  const swamp = playing({ level: 10 });
  jumps(swamp, 4);
  run(swamp, 1);
  const before = snapshot(swamp);
  run(swamp, 200, AWAY);
  for (let frame = 0; frame < 600; frame += 1) swamp.update(FRAME);
  assert.equal(snapshot(swamp), before);
  assert.equal(swamp.stats.seconds, swamp.time);
  // And it goes on again when the child is back.
  run(swamp, 1);
  assert.ok(swamp.time > 1.9 && swamp.cloud > 0);
});

test('the rain cloud comes across while the child plays, and when it gets here the window is washed and the level is lost', () => {
  const swamp = playing({ level: 1 });
  const { seconds } = swamp.rules;
  jumps(swamp, 4);
  const mud = swamp.muddy;
  run(swamp, seconds / 2);
  near(swamp.cloud, 0.5, 0.01, 'half way');
  run(swamp, seconds / 2 - 0.5);
  assert.equal(swamp.state, 'play', 'not before it gets here');
  assert.ok(swamp.cloud > 0.99 && swamp.cloud < 1);
  assert.equal(swamp.muddy, mud, 'the mud is all still there');
  run(swamp, 1);
  assert.equal(swamp.state, 'lost');
  assert.equal(swamp.cloud, 1);
  assert.equal(swamp.muddy, 0);
  assert.equal(swamp.coverage, 0);
  assert.deepEqual(muddyCells(swamp), [], 'the whole window is washed');
  assert.equal(swamp.count('lost'), 1);
  assert.equal(swamp.last('clean', 'rain').cells.length, mud);
  assert.equal(swamp.count('won'), 0);
});

test('after the level is lost nothing more happens', () => {
  const swamp = playing({ level: 10 });
  run(swamp, swamp.rules.seconds + 0.5, (now) => {
    if (now.time % 6 < FRAME) now.land(SMALL);
    return SEEN;
  });
  assert.equal(swamp.state, 'lost');
  const before = snapshot(swamp);
  swamp.squat();
  jumps(swamp, 20, BIG);
  swamp.land(BIG, { star: true });
  run(swamp, 60);
  swamp.begin();
  assert.equal(snapshot(swamp), before);
  assert.equal(swamp.count('lost'), 1);
});

/* ---------- the frogs, from level 2 ---------- */

test('a big jump makes the frogs jump too, and each throws a little mud of its own', () => {
  for (const level of [2, 6, 10]) {
    const swamp = playing({ level });
    const { frogs } = swamp.rules;
    assert.ok(frogs >= 1);
    swamp.land(SPLASH.counts);
    assert.equal(swamp.count('frog'), frogs, `level ${level}`);
    assert.equal(swamp.count('splat', 'frog'), frogs);
    assert.equal(swamp.stats.frogs, frogs);
    const jump = swamp.log.find((event) => event.type === 'splat' && event.kind === 'jump');
    for (const splat of swamp.log.filter((event) => event.type === 'splat' && event.kind === 'frog')) {
      near(splat.reach, reachOf(FROGS.share), 1e-9, 'a frog\'s splat');
      assert.ok(splat.cells.length < jump.cells.length, 'a little one');
      assert.ok(splat.fresh > 0, 'on clean window');
    }
  }
});

test('a small jump leaves the frogs sitting, and there are no frogs at level 1', () => {
  const swamp = playing({ level: 2 });
  swamp.land(SPLASH.counts - 0.01);
  assert.equal(swamp.count('frog'), 0);
  assert.equal(swamp.count('splat'), 1);
  const first = playing({ level: 1 });
  first.land(BIG);
  assert.equal(first.count('frog'), 0);
  assert.equal(first.count('splat'), 1);
  assert.equal(first.stats.frogs, 0);
});

/* ---------- bent knees, from level 3 ---------- */

test('knees bent just before a jump make a super splash', () => {
  const plain = playing({ level: 3 });
  const bent = playing({ level: 3 });
  bent.squat();
  run(bent, SQUAT.within - 0.2);
  run(plain, SQUAT.within - 0.2);
  plain.land(1.5);
  bent.land(1.5);
  assert.ok(bent.muddy > plain.muddy * 1.25, `${bent.muddy} squares against ${plain.muddy}`);
  near(bent.last('splat').reach, reachOf(splashShare(1.5) * SQUAT.more), 1e-9);
  assert.equal(bent.stats.supers, 1);
  assert.equal(plain.stats.supers, 0);
  assert.equal(bent.last('land').bent, true);
  assert.equal(plain.last('land').bent, false);
});

test('knees bent count for one jump only', () => {
  const swamp = playing({ level: 3 });
  swamp.squat();
  swamp.land(SMALL);
  swamp.land(SMALL);
  assert.equal(swamp.stats.supers, 1);
  near(swamp.last('splat').reach, reachOf(splashShare(SMALL)), 1e-9, 'the second is an ordinary splash');
});

test('knees bent too long before the jump, or before level 3, make an ordinary splash', () => {
  const late = playing({ level: 3 });
  late.squat();
  run(late, SQUAT.within + 0.2);
  late.land(1.5);
  assert.equal(late.stats.supers, 0);
  assert.equal(late.last('land').bent, false);
  near(late.last('splat').reach, reachOf(splashShare(1.5)), 1e-9);

  const early = playing({ level: 2 });
  const plain = playing({ level: 2 });
  early.squat();
  early.land(SMALL);
  plain.land(SMALL);
  assert.equal(early.stats.supers, 0);
  assert.equal(early.muddy, plain.muddy);
  assert.deepEqual([...early.mud], [...plain.mud]);
});

/* ---------- the shower, from level 4 ---------- */

test('a shower is seen coming before it washes a strip of the window clean, from top to bottom', () => {
  const swamp = playing({ level: 4 });
  jumps(swamp, 8, 1.5);
  const every = swamp.rules.shower;
  run(swamp, every - SHOWER.warning - 0.3);
  assert.equal(swamp.count('shower-coming'), 0, 'not yet');
  const coming = until(swamp, 'shower-coming', 1);
  assert.equal(swamp.count('shower'), 0, 'it hasn\'t washed anything yet');
  const from = Math.round(coming.from * GRID.wide);
  near(coming.wide, SHOWER.wide / GRID.wide, 1e-9);
  // Over the muddiest strip there is.
  const most = Math.max(...Array.from({ length: GRID.wide - SHOWER.wide + 1 }, (_, at) => stripMud(swamp, at)));
  assert.ok(stripMud(swamp, from) > 0);
  assert.equal(stripMud(swamp, from), most);
  const mud = [...swamp.mud];
  run(swamp, SHOWER.warning - 0.3);
  assert.equal(swamp.count('shower'), 0, 'warned for a while');
  const shower = until(swamp, 'shower', 1);
  assert.equal(Math.round(shower.from * GRID.wide), from, 'where it was seen coming');
  assert.equal(swamp.stats.showers, 1);
  assert.equal(stripMud(swamp, from), 0, 'the strip is clean');
  for (let cell = 0; cell < CELLS; cell += 1) {
    const x = cell % GRID.wide;
    if (x < from || x >= from + SHOWER.wide) assert.equal(swamp.mud[cell], mud[cell], `square ${cell} is left as it was`);
  }
  assert.equal(swamp.last('clean', 'shower').cells.length, most);
  assert.equal(swamp.muddy, muddyCells(swamp).length);
});

test('the shower comes again, and not at level 3', () => {
  const swamp = playing({ level: 4, gentle: true });
  for (let n = 1; n <= 3; n += 1) {
    jumps(swamp, 3, 1.5);
    until(swamp, 'shower', swamp.rules.shower + 0.5);
    assert.equal(swamp.stats.showers, n);
  }
  assert.equal(swamp.count('shower-coming'), 3);
  const before = playing({ level: 3, gentle: true });
  jumps(before, 6, 1.5);
  const mud = before.muddy;
  run(before, 100);
  assert.equal(before.count('shower-coming'), 0);
  assert.equal(before.count('shower'), 0);
  assert.equal(before.muddy, mud);
});

test('the shower comes to the muddiest strip wherever it is, the last strip on the right too', () => {
  for (const at of [0, 11, GRID.wide - SHOWER.wide]) {
    const swamp = playing({ level: 4 });
    // Mud put on by hand, in that strip only, so that it's the muddiest.
    for (let y = 0; y < GRID.high; y += 1) {
      for (let x = at; x < at + SHOWER.wide; x += 1) swamp.mud[y * GRID.wide + x] = 1;
    }
    swamp.muddy = SHOWER.wide * GRID.high;
    const coming = until(swamp, 'shower-coming', swamp.rules.shower);
    assert.equal(Math.round(coming.from * GRID.wide), at);
    until(swamp, 'shower', SHOWER.warning + 0.5);
    assert.equal(swamp.muddy, 0, `strip at ${at}`);
  }
});

/* ---------- the mud bubble, from level 5 ---------- */

test('a mud bubble comes up, grows big, and a jump onto it then throws twice the mud and pops it', () => {
  const swamp = playing({ level: 5 });
  run(swamp, BUBBLE.every - 0.3);
  assert.equal(swamp.count('bubble'), 0, 'not yet');
  until(swamp, 'bubble', 1);
  assert.equal(swamp.bubbleBig, false, 'it isn\'t big at once');
  run(swamp, BUBBLE.grows - 0.3);
  assert.equal(swamp.bubbleBig, false, 'still growing');
  run(swamp, 0.5);
  assert.equal(swamp.bubbleBig, true);
  swamp.land(SMALL);
  assert.equal(swamp.count('pop'), 1);
  assert.equal(swamp.stats.bubbles, 1);
  assert.equal(swamp.last('land').popped, true);
  near(swamp.last('splat', 'jump').reach, reachOf(splashShare(SMALL) * BUBBLE.more), 1e-9);
  assert.equal(swamp.bubbleBig, false, 'it\'s gone');
  // Another comes up later.
  run(swamp, BUBBLE.every - 0.3);
  assert.equal(swamp.count('bubble'), 1);
  until(swamp, 'bubble', 1);
});

test('a bubble popped covers more of the window than the same jump without one', () => {
  const plain = playing({ level: 5 });
  const popped = playing({ level: 5 });
  run(popped, BUBBLE.every + BUBBLE.grows + 0.2);
  assert.ok(popped.bubbleBig);
  plain.land(1.4); // Before any bubble is up.
  popped.land(1.4);
  assert.ok(popped.muddy > plain.muddy * 1.6, `${popped.muddy} squares against ${plain.muddy}`);
});

test('a jump while the bubble is still growing is an ordinary one, and the bubble stays', () => {
  const swamp = playing({ level: 5 });
  until(swamp, 'bubble');
  run(swamp, BUBBLE.grows / 2);
  swamp.land(SMALL);
  assert.equal(swamp.count('pop'), 0);
  assert.equal(swamp.stats.bubbles, 0);
  assert.equal(swamp.last('land').popped, false);
  near(swamp.last('splat').reach, reachOf(splashShare(SMALL)), 1e-9);
  run(swamp, BUBBLE.grows / 2 + 0.1);
  assert.equal(swamp.bubbleBig, true, 'and grows big all the same');
});

test('a bubble nobody lands on sinks by itself, and another comes up', () => {
  const swamp = playing({ level: 5 });
  until(swamp, 'bubble');
  run(swamp, BUBBLE.grows + BUBBLE.big - 0.3);
  assert.equal(swamp.bubbleBig, true, 'big for a while');
  assert.equal(swamp.count('sunk'), 0);
  until(swamp, 'sunk', 1);
  assert.equal(swamp.bubbleBig, false);
  swamp.land(SMALL);
  assert.equal(swamp.count('pop'), 0);
  assert.equal(swamp.stats.bubbles, 0);
  until(swamp, 'bubble', BUBBLE.every + 0.5);
  assert.equal(swamp.count('bubble'), 2);
});

test('there are no mud bubbles at level 4', () => {
  const swamp = playing({ level: 4, gentle: true });
  for (let n = 0; n < 60 * 30; n += 1) {
    swamp.update(FRAME, SEEN);
    assert.equal(swamp.bubbleBig, false);
  }
  swamp.land(SMALL);
  assert.equal(swamp.count('bubble'), 0);
  assert.equal(swamp.count('pop'), 0);
  near(swamp.last('splat').reach, reachOf(splashShare(SMALL)), 1e-9);
});

/* ---------- the heron, from level 6 ---------- */

test('the heron is seen coming to a muddy place, and wipes it clean unless the child jumps', () => {
  const swamp = playing({ level: 6, gentle: true });
  jumps(swamp, 8, 1.5);
  run(swamp, HERON.every - 0.3);
  assert.equal(swamp.count('heron'), 0, 'not yet');
  const heron = until(swamp, 'heron', 1);
  near(heron.seconds, HERON.coming, 1e-9);
  assert.ok(swamp.mud[cellAt(heron)], 'to a muddy place');
  run(swamp, HERON.coming - 0.3);
  assert.equal(swamp.count('wiped'), 0, 'it takes a while to get there');
  assert.ok(swamp.mud[cellAt(heron)], 'the mud is still there');
  const wiped = until(swamp, 'wiped', 1);
  assert.deepEqual([wiped.x, wiped.y], [heron.x, heron.y]);
  assert.equal(swamp.mud[cellAt(heron)], 0, 'wiped clean there');
  const clean = swamp.last('clean', 'heron');
  assert.ok(clean.cells.length > 1, 'a patch, not one square');
  assert.equal(swamp.stats.wiped, clean.cells.length);
  for (const cell of clean.cells) {
    const [x, y] = [(cell % GRID.wide) + 0.5, Math.floor(cell / GRID.wide) + 0.5];
    assert.ok(Math.hypot(x - heron.x * GRID.wide, y - heron.y * GRID.high) <= HERON.reach * 1.2, 'round the place it came to');
  }
  assert.equal(swamp.stats.herons, 0);
  // And it comes again.
  run(swamp, HERON.every - 0.5);
  assert.equal(swamp.count('heron'), 1);
  until(swamp, 'heron', 1);
});

test('the heron wipes where it was seen coming to, wherever that is', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const swamp = playing({ level: 6, gentle: true, seed });
    jumps(swamp, 8, 1.5);
    const heron = until(swamp, 'heron', HERON.every + 1);
    until(swamp, 'wiped', HERON.coming + 1);
    const { cells } = swamp.last('clean', 'heron');
    assert.ok(cells.includes(cellAt(heron)), `seed ${seed}: the place it came to`);
    for (const cell of cells) {
      const [x, y] = [(cell % GRID.wide) + 0.5, Math.floor(cell / GRID.wide) + 0.5];
      assert.ok(Math.hypot(x - heron.x * GRID.wide, y - heron.y * GRID.high) <= HERON.reach * 1.2, `seed ${seed}: square ${cell} is near it`);
    }
  }
});

test('a jump while the heron is coming scares it off, and nothing is wiped', () => {
  const swamp = playing({ level: 6, gentle: true });
  jumps(swamp, 8, 1.5);
  until(swamp, 'heron', HERON.every + 1);
  run(swamp, HERON.coming - 1);
  swamp.land(SMALL);
  assert.equal(swamp.count('scared'), 1);
  assert.equal(swamp.stats.herons, 1);
  // A jump with no heron coming scares nothing.
  swamp.land(SMALL);
  assert.equal(swamp.count('scared'), 1);
  assert.equal(swamp.stats.herons, 1);
  run(swamp, HERON.every - 0.3);
  assert.equal(swamp.count('wiped'), 0);
  assert.equal(swamp.count('clean', 'heron'), 0);
  assert.equal(swamp.stats.wiped, 0);
  // It comes back later.
  assert.equal(swamp.count('heron'), 1);
  until(swamp, 'heron', 1);
});

test('the shower waits for there to be mud to wash, and then is seen coming', () => {
  const swamp = playing({ level: 4, gentle: true });
  run(swamp, swampLevel(4).shower * 2);
  assert.equal(swamp.count('shower-coming'), 0, 'nothing is announced over a clean window');
  assert.equal(swamp.count('shower'), 0);
  swamp.land(SMALL);
  const coming = until(swamp, 'shower-coming', 1);
  assert.ok(coming, 'with mud on the window it comes straight away, having waited');
  until(swamp, 'shower', SHOWER.warning + 1);
  assert.ok(swamp.last('clean', 'shower').cells.length > 0, 'and washes something');
});

test('the heron comes to where there\'s plenty of mud, and not to one square the wind left', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const swamp = playing({ level: 6, gentle: true, seed });
    // A big muddy part on the left, by hand, and single muddy squares scattered over the rest.
    for (let y = 2; y < 16; y += 1) for (let x = 2; x < 12; x += 1) swamp.mud[y * GRID.wide + x] = 1;
    for (const cell of [20, 60, 125, 190, 250, 315, 380, 445, 510, 570]) swamp.mud[cell] = 1;
    swamp.muddy = [...swamp.mud].filter(Boolean).length;
    const heron = until(swamp, 'heron', HERON.every + 2);
    const [x, y] = [heron.x * GRID.wide, heron.y * GRID.high];
    assert.ok(x > 1 && x < 13 && y > 1 && y < 17, `seed ${seed}: it's coming to the big muddy part (${x}, ${y})`);
    const wiped = until(swamp, 'clean', HERON.coming + 2);
    assert.ok(wiped.cells.length >= 20, `seed ${seed}: and wipes plenty: ${wiped.cells.length} squares`);
  }
});

test('the heron doesn\'t come to a clean window, and comes once there\'s mud', () => {
  const swamp = playing({ level: 6, gentle: true });
  run(swamp, HERON.every * 3);
  assert.equal(swamp.count('heron'), 0);
  swamp.land(SMALL);
  until(swamp, 'heron', 0.1);
});

test('there is no heron at level 5', () => {
  const swamp = playing({ level: 5, gentle: true });
  jumps(swamp, 8, 1.5);
  run(swamp, HERON.every * 3);
  assert.equal(swamp.count('heron'), 0);
  assert.equal(swamp.count('wiped'), 0);
  assert.equal(swamp.stats.wiped, 0);
  swamp.land(SMALL);
  assert.equal(swamp.count('scared'), 0);
});

/* ---------- golden mud, from level 7 ---------- */

test('three big jumps in a row turn the mud to gold', () => {
  const swamp = playing({ level: 7 });
  swamp.land(SPLASH.counts);
  swamp.land(SPLASH.counts);
  assert.equal(goldCells(swamp).length, 0, 'not after two');
  assert.equal(swamp.count('star'), 0);
  swamp.land(SPLASH.counts);
  const splat = swamp.last('splat', 'jump');
  assert.equal(splat.golden, true, 'the third one\'s mud is golden');
  assert.equal(swamp.count('star'), 1);
  assert.equal(swamp.stats.stars, 1);
  for (const cell of splat.cells) assert.equal(swamp.mud[cell], 2, 'every square of it, over plain mud too');
  // The frogs' mud after it is plain.
  const frogs = swamp.log.filter((event) => event.type === 'splat' && event.kind === 'frog');
  assert.equal(frogs.length, swamp.rules.frogs * 3);
  assert.ok(frogs.every((frog) => !frog.golden));
  // And three more for the next gold, not one.
  swamp.land(SPLASH.counts);
  assert.equal(swamp.last('splat', 'jump').golden, false);
  swamp.land(SPLASH.counts);
  swamp.land(SPLASH.counts);
  assert.equal(swamp.last('splat', 'jump').golden, true);
  assert.equal(swamp.stats.stars, 2);
});

test('a small jump in between starts the count for golden mud again', () => {
  const swamp = playing({ level: 7 });
  for (const size of [BIG, BIG, SMALL, BIG, BIG]) swamp.land(size);
  assert.equal(swamp.count('star'), 0);
  assert.equal(goldCells(swamp).length, 0);
  swamp.land(BIG);
  assert.equal(swamp.count('star'), 1);
});

test('plain mud never covers gold', () => {
  const swamp = playing({ level: 7, seed: 3 });
  jumps(swamp, 3, BIG);
  const gold = goldCells(swamp);
  assert.ok(gold.length > 10);
  const from = swamp.log.length;
  jumps(swamp, 30, 1.5);
  assert.ok(swamp.log.slice(from).filter((event) => event.type === 'splat' && !event.golden).some((splat) => splat.cells.some((cell) => gold.includes(cell))), 'some plain mud landed on it');
  for (const cell of gold) assert.equal(swamp.mud[cell], 2, `square ${cell}`);
});

test('there is no golden mud at level 6', () => {
  const swamp = playing({ level: 6 });
  jumps(swamp, 6, BIG);
  assert.equal(swamp.count('star'), 0);
  assert.equal(goldCells(swamp).length, 0);
  assert.equal(swamp.stats.stars, 0);
});

/* ---------- the star jump, from level 8 ---------- */

test('a star jump throws mud to all four corners as well', () => {
  const swamp = playing({ level: 8 });
  swamp.land(SMALL, { star: true });
  assert.equal(swamp.count('splat', 'corner'), 4);
  assert.equal(swamp.count('splat', 'jump'), 1);
  assert.equal(swamp.stats.starJumps, 1);
  assert.equal(swamp.last('land').star, true);
  for (const corner of corners) assert.ok(swamp.mud[corner], `corner ${corner}`);
  for (const splat of swamp.log.filter((event) => event.type === 'splat' && event.kind === 'corner')) near(splat.reach, reachOf(STAR.share), 1e-9);
  const plain = playing({ level: 8 });
  plain.land(SMALL, { star: true });
  plain.land(SMALL);
  assert.equal(plain.stats.starJumps, 1, 'an ordinary jump is no star jump');
  assert.equal(plain.count('splat', 'corner'), 4);
});

test('at level 7 a star jump is an ordinary jump', () => {
  const star = playing({ level: 7 });
  const plain = playing({ level: 7 });
  star.land(SMALL, { star: true });
  plain.land(SMALL);
  assert.equal(star.count('splat', 'corner'), 0);
  assert.equal(star.stats.starJumps, 0);
  assert.deepEqual([...star.mud], [...plain.mud]);
});

/* ---------- the wind, from level 9 ---------- */

test('the wind dries the mud off a little at a time while the child is there', () => {
  const swamp = playing({ level: 9 });
  jumps(swamp, 6, 1.5);
  const mud = swamp.muddy;
  run(swamp, swamp.rules.wind - 0.2);
  assert.equal(swamp.count('clean', 'wind'), 0, 'not at once');
  assert.equal(swamp.muddy, mud);
  run(swamp, 10);
  const flakes = swamp.log.filter((event) => event.type === 'clean' && event.why === 'wind');
  assert.equal(flakes.length, Math.floor((10 + swamp.rules.wind - 0.2) / swamp.rules.wind));
  for (const flake of flakes) assert.ok(flake.cells.length >= 1 && flake.cells.length <= WIND.takes, `${flake.cells.length} squares`);
  assert.ok(flakes.some((flake) => flake.cells.length === WIND.takes), 'the square and the one beside it');
  const gone = flakes.reduce((sum, flake) => sum + flake.cells.length, 0);
  assert.equal(swamp.muddy, mud - gone);
  assert.ok(gone < mud / 4, 'only a little of it');
});

test('a flake of dried mud is one square and the one beside it, never round the edge to the next row', () => {
  const swamp = playing({ level: 9, seed: 5 });
  jumps(swamp, 8, 1.5);
  run(swamp, 12);
  const flakes = swamp.log.filter((event) => event.type === 'clean' && event.why === 'wind');
  for (const { cells } of flakes.filter((flake) => flake.cells.length === 2)) assert.equal(cells[1] - cells[0], 1, 'beside it');
  // Mud put on by hand down the left and right edges only: the square beside one on the right edge is on the left
  // of the next row, and isn't taken with it.
  const edges = playing({ level: 9, seed: 5 });
  for (let y = 0; y < GRID.high; y += 1) for (const x of [0, GRID.wide - 1]) edges.mud[y * GRID.wide + x] = 1;
  edges.muddy = 2 * GRID.high;
  run(edges, 14);
  const edgeFlakes = edges.log.filter((event) => event.type === 'clean' && event.why === 'wind');
  assert.ok(edgeFlakes.some((flake) => flake.cells[0] % GRID.wide === GRID.wide - 1), 'some from the right edge');
  for (const { cells } of edgeFlakes) assert.equal(cells.length, 1, `square ${cells[0]} alone`);
  assert.equal(edges.muddy, muddyCells(edges).length);
});

test('the wind doesn\'t dry anything with nobody there, nor before level 9', () => {
  const away = playing({ level: 9 });
  jumps(away, 6, 1.5);
  const mud = away.muddy;
  run(away, 30, AWAY);
  assert.equal(away.muddy, mud);
  assert.equal(away.count('clean'), 0);
  const before = playing({ level: 8 });
  jumps(before, 6, 1.5);
  run(before, 12);
  assert.equal(before.count('clean', 'wind'), 0);
  assert.equal(before.count('clean'), 0, 'nothing else takes mud off in that time');
});

/* ---------- the numbers ---------- */

test('the numbers for the finish card: jumps, big ones, the biggest, frogs and seconds played', () => {
  const swamp = playing({ level: 2 });
  for (const size of [1.1, 1.7, 1.3, 2.0, 1.6]) swamp.land(size);
  assert.equal(swamp.stats.jumps, 5);
  assert.equal(swamp.stats.big, 3);
  assert.equal(swamp.stats.biggest, 2.0);
  assert.equal(swamp.stats.frogs, 3 * swamp.rules.frogs);
  run(swamp, 5);
  run(swamp, 5, AWAY);
  near(swamp.stats.seconds, 5, 1e-6, 'only while the child is seen');
  near(swamp.time, 5, 1e-6);
  assert.equal(swamp.stats.supers, 0);
  assert.equal(swamp.stats.stars, 0);
  assert.equal(swamp.stats.cup, false);
});

/* ---------- several jumping in front of one camera ---------- */

test('with several jumping, a landing says whose it was, and bent knees only make a super splash of that jumper\'s own next jump', () => {
  const events = [];
  const swamp = new Swamp({ level: 3, gentle: true, random: seeded(), onEvent: (event) => events.push(event) });
  swamp.begin();
  // The second jumper bends their knees, and the first one lands: an ordinary splash.
  swamp.squat(1);
  swamp.land(1.2, { by: 0 });
  assert.deepEqual(events.filter(({ type }) => type === 'land').map(({ by, bent }) => [by, bent]), [[0, false]]);
  // Then the second one lands, soon enough after bending: theirs is the super splash.
  swamp.update(0.5, { seen: true });
  swamp.land(1.2, { by: 1 });
  assert.deepEqual(events.filter(({ type }) => type === 'land').map(({ by, bent }) => [by, bent]), [[0, false], [1, true]]);
  assert.equal(swamp.stats.supers, 1);
  assert.equal(swamp.stats.jumps, 2);
  // And it's used up: their next jump is an ordinary one again.
  swamp.land(1.2, { by: 1 });
  assert.equal(swamp.stats.supers, 1);
  // Bent knees wear off for each jumper on their own.
  swamp.squat(2);
  swamp.update(SQUAT.within + 0.1, { seen: true });
  swamp.land(1.2, { by: 2 });
  assert.equal(swamp.stats.supers, 1);
  // One jumper on their own is the first, as it always was.
  swamp.squat();
  assert.equal(swamp.bent, 0);
  swamp.land(1.2);
  assert.equal(events.at(-1).type === 'land' || events.some(({ type, by }) => type === 'land' && by === 0), true);
  assert.equal(swamp.stats.supers, 2);
});

test('everyone\'s mud lands on the one window: two jumpers cover it as one would with as many jumps', () => {
  const together = new Swamp({ level: 1, gentle: true, random: seeded() });
  const alone = new Swamp({ level: 1, gentle: true, random: seeded() });
  together.begin();
  alone.begin();
  for (let jump = 0; jump < 6; jump += 1) {
    together.land(1.5, { by: jump % 2 });
    alone.land(1.5);
  }
  assert.equal(together.coverage, alone.coverage);
  assert.ok(together.coverage > 0.2);
});
