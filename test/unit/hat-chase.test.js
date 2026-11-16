// Hat Chase's rules, without a screen or a camera: the path, the marching, what each thing in the way wants, the
// magpie that can get away, and what each level brings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  BIG_JUMP, Chase, chaseLevel, CLAMBER_SECONDS, FEATHER, FUSE, HELP_AFTER, KINDS, layPath, MAGPIE, NEW_THINGS, newAt, PACE,
  SPRING_STARS, STEP, TREE, TUMBLE_SECONDS,
} from '../../games/hat-chase/chase.js';
import { LEAST_LINE, LIFT, Marcher } from '../../games/hat-chase/march.js';

const LEVELS = Array.from({ length: 10 }, (_, index) => index + 1);
const FRAME = 1 / 60;

function seeded(seed = 7) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function setup(options = {}) {
  const events = [];
  const chase = new Chase({ random: seeded(), onEvent: (event) => events.push(event), ...options });
  chase.begin();
  return { chase, events };
}

/** Time goes by, with the child in the picture unless said. */
const wait = (chase, seconds, seen = true) => {
  for (let time = 0; time < seconds - 1e-9; time += FRAME) chase.update(FRAME, { seen });
};

/** Marches, a step every so often, until the character is standing at something, or the game is over. */
function marchToNext(chase, every = 0.5) {
  let side = 'left';
  for (let i = 0; i < 400 && chase.state === 'play' && !chase.station; i += 1) {
    chase.step(side);
    side = side === 'left' ? 'right' : 'left';
    wait(chase, every);
  }
  return chase.station;
}

/** Does what the thing the character is standing at wants, and waits until it's past it. */
function getPast(chase, { size = 1, star = false } = {}) {
  const thing = chase.station;
  for (let i = 0; i < 6 && chase.station === thing && chase.state === 'play'; i += 1) {
    if (thing.needs === 'jump') chase.jump(size, { star });
    else chase.squat();
    wait(chase, thing.seconds + 0.1);
  }
  return thing;
}

/** A child who marches and does every move as soon as it's wanted. */
function playWell(chase, every = 0.5) {
  while (chase.state === 'play') {
    if (!marchToNext(chase, every)) break;
    getPast(chase);
  }
}

/* ---------- the path ---------- */

test('a path has the things asked for, in order, with room to walk between them, and ends at the magpie\'s tree', () => {
  for (const level of LEVELS) {
    for (const things of [8, 12, 18]) {
      const { course, end, stars, trees } = layPath({ level, things, random: seeded(level) });
      assert.equal(course.length, things);
      let before = 0;
      for (const thing of course) {
        assert.ok(thing.at >= before, `level ${level}: ${thing.kind} at ${thing.at} after ${before}`);
        assert.ok(KINDS[thing.kind].from <= level, `${thing.kind} at level ${level}`);
        before = thing.at + thing.wide;
      }
      assert.ok(end > before + 3, 'a last stretch before the tree');
      // No star is inside a thing, where the character never walks.
      for (const star of stars) assert.ok(!course.some((thing) => star.at > thing.at - 0.5 && star.at < thing.at + thing.wide + 0.5), `a star at ${star.at}`);
      for (const tree of trees) assert.ok(!course.some((thing) => tree.at < thing.at + thing.wide && tree.at + tree.wide > thing.at), `a tree at ${tree.at}`);
      assert.ok(stars.length >= things / 2, `${stars.length} stars`);
    }
  }
});

test('the first level is only streams, and every level from 2 has what it brings that\'s new on any path', () => {
  assert.deepEqual(chaseLevel(1).kinds, ['stream']);
  assert.ok(layPath({ level: 1, things: 8, random: seeded() }).course.every(({ kind }) => kind === 'stream'));
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    for (const things of [8, 18]) {
      const at = (level) => layPath({ level, things, random: seeded(seed) });
      for (const [level, kind] of [[2, 'branch'], [4, 'hedgehog'], [5, 'stones'], [6, 'spring'], [7, 'bees']]) {
        assert.ok(at(level).course.some((thing) => thing.kind === kind), `a ${kind} at level ${level}, seed ${seed}`);
        assert.ok(!at(level - 1).course.some((thing) => thing.kind === kind), `no ${kind} at level ${level - 1}`);
      }
      assert.equal(at(2).trees.length, 0);
      assert.ok(at(3).trees.length >= 1, `an apple tree at level 3, seed ${seed}`);
      assert.ok(at(8).course.some((thing) => thing.kind === 'stream' && thing.high.feather), `a feather at level 8, seed ${seed}`);
      assert.ok(!at(7).course.some((thing) => thing.high?.feather));
      assert.ok(at(9).course.some((thing) => thing.paired), `a pair at level 9, seed ${seed}`);
      assert.ok(!at(8).course.some((thing) => thing.paired));
    }
  }
  assert.equal(chaseLevel(9).cup, false);
  assert.equal(chaseLevel(10).cup, true);
});

test('every level from 2 to 10 says what it brings, in English and Georgian, and it is really there', () => {
  assert.deepEqual(newAt(1), []);
  for (const level of LEVELS.slice(1)) {
    const [news] = newAt(level);
    assert.ok(news?.id && news.mark && news.name, `level ${level}`);
    assert.match(news.nameKa, /[Ⴀ-ჿ]/);
    const rules = chaseLevel(level);
    const before = chaseLevel(level - 1);
    const has = (plan) => plan.kinds.includes(news.id) || plan[{ tree: 'trees', feather: 'feathers', pairs: 'pairs', cup: 'cup' }[news.id]] === true;
    assert.equal(has(rules), true, `${news.id} at level ${level}`);
    assert.equal(has(before), false, `${news.id} before level ${level}`);
  }
  assert.equal(Object.keys(NEW_THINGS).length, 9);
});

/* ---------- walking ---------- */

test('each knee lifted is one step of a metre, and the character stops when the marching does', () => {
  const { chase, events } = setup();
  assert.equal(chase.hero.x, 0);
  // Nothing moves by itself.
  wait(chase, 3);
  assert.equal(chase.hero.x, 0);
  assert.equal(chase.step('left'), true);
  wait(chase, STEP.seconds + 0.05);
  assert.ok(Math.abs(chase.hero.x - STEP.length) < 1e-6, `${chase.hero.x}`);
  assert.equal(chase.hero.mode, 'stand');
  chase.step('right');
  wait(chase, 2);
  assert.ok(Math.abs(chase.hero.x - 2 * STEP.length) < 1e-6);
  assert.deepEqual([chase.stats.steps, chase.stats.left, chase.stats.right], [2, 1, 1]);
  assert.deepEqual(events.filter(({ type }) => type === 'step').map(({ side }) => side), ['left', 'right']);
});

test('steps taken faster than the character walks wait their turn, two at most, so it never runs on by itself for long', () => {
  const { chase } = setup();
  for (let i = 0; i < 6; i += 1) chase.step(i % 2 ? 'right' : 'left');
  // Six lifts at once are two steps' worth of walking, and the rest are let go.
  wait(chase, 5);
  assert.ok(Math.abs(chase.hero.x - STEP.waiting * STEP.length) < 1e-6, `${chase.hero.x}`);
  assert.equal(chase.stats.steps, STEP.waiting);
});

test('the character stops by itself just before the first thing, and marching on the spot there goes nowhere', () => {
  const { chase, events } = setup();
  const thing = marchToNext(chase);
  assert.equal(thing, chase.course[0]);
  assert.equal(thing.state, 'at');
  assert.ok(chase.hero.x < thing.at && chase.hero.x > thing.at - 1, `${chase.hero.x} before ${thing.at}`);
  assert.deepEqual(events.at(-1), { type: 'arrive', thing });
  const here = chase.hero.x;
  const steps = chase.stats.steps;
  for (let i = 0; i < 5; i += 1) {
    assert.equal(chase.step('left'), false);
    wait(chase, 0.5);
  }
  assert.equal(chase.hero.x, here);
  assert.equal(chase.stats.steps, steps);
});

test('the stars along the path are picked up by walking past them', () => {
  const { chase } = setup();
  const first = chase.stars[0];
  assert.ok(first.at < chase.course[0].at);
  marchToNext(chase);
  const passed = chase.stars.filter((star) => star.at <= chase.hero.x);
  assert.ok(passed.length >= 1);
  assert.ok(passed.every((star) => star.taken));
  assert.equal(chase.stats.stars, passed.length);
  assert.ok(chase.stars.filter((star) => star.at > chase.hero.x).every((star) => !star.taken));
});

/* ---------- the things in the way ---------- */

test('a jump at a stream carries the character over it, and a squat or a step there does nothing', () => {
  const { chase, events } = setup();
  const stream = marchToNext(chase);
  assert.equal(stream.kind, 'stream');
  const before = chase.stats.stars;
  assert.equal(chase.squat(), false);
  wait(chase, 1);
  assert.equal(chase.station, stream);
  assert.equal(chase.jump(1), true);
  assert.equal(chase.hero.mode, 'move');
  // In the air it can't be turned back, or jumped again.
  assert.equal(chase.jump(1), false);
  assert.equal(chase.step('left'), false);
  wait(chase, stream.seconds + 0.05);
  assert.equal(stream.state, 'cleared');
  assert.ok(chase.hero.x > stream.at + stream.wide, `${chase.hero.x}`);
  assert.equal(chase.station, null);
  assert.equal(chase.stats.cleared, 1);
  assert.equal(chase.stats.stars, before + KINDS.stream.stars);
  // A small jump leaves the star over the stream where it is.
  assert.equal(stream.high.taken, false);
  assert.ok(events.some(({ type, how }) => type === 'cleared' && how === 'leap'));
});

test('a big jump over a stream catches what is above it: a star, or from level 8 a golden feather worth five', () => {
  const low = setup({ level: 1 }).chase;
  const stream = marchToNext(low);
  const before = low.stats.stars;
  low.jump(BIG_JUMP);
  wait(low, 1);
  assert.equal(stream.high.taken, true);
  assert.equal(low.stats.stars, before + KINDS.stream.stars + 1);
  assert.equal(low.stats.big, 1);
  assert.equal(low.stats.feathers, 0);
  // Just under a big jump, it isn't one.
  const nearly = setup({ level: 1 }).chase;
  marchToNext(nearly);
  nearly.jump(BIG_JUMP - 0.01);
  wait(nearly, 1);
  assert.equal(nearly.course[0].high.taken, false);

  const high = setup({ level: 8, things: 18 }).chase;
  let found = null;
  while (high.state === 'play' && !found) {
    const thing = marchToNext(high);
    if (!thing) break;
    if (thing.kind === 'stream') {
      const stars = high.stats.stars;
      high.jump(BIG_JUMP + 0.5);
      wait(high, 1);
      assert.equal(high.stats.stars, stars + KINDS.stream.stars + FEATHER.worth);
      assert.equal(high.stats.feathers, 1);
      found = thing;
    } else getPast(high);
  }
  assert.ok(found, 'a stream at level 8');
});

test('a jump that turns out to be a big one while it\'s still going up reaches what is above the stream after all', () => {
  const { chase, events } = setup({ level: 1 });
  const stream = marchToNext(chase);
  const before = chase.stats.stars;
  // The camera sees a jump as it leaves the floor, and only then how high it goes.
  chase.jump(1);
  wait(chase, stream.seconds * 0.3);
  assert.equal(chase.grow(BIG_JUMP - 0.1), false);
  assert.equal(stream.high.taken, false);
  assert.equal(chase.grow(BIG_JUMP + 0.2), true);
  assert.equal(stream.high.taken, true);
  assert.equal(chase.hero.move.big, true);
  assert.deepEqual([chase.stats.jumps, chase.stats.big], [1, 1]);
  assert.ok(events.some(({ type, thing }) => type === 'high' && thing === stream));
  // Once is all: it doesn't count again.
  assert.equal(chase.grow(3), false);
  wait(chase, 1);
  assert.equal(chase.stats.stars, before + KINDS.stream.stars + 1);

  // Coming down, it's too late to go higher.
  const late = setup({ level: 1 }).chase;
  const second = marchToNext(late);
  late.jump(1);
  wait(late, second.seconds * 0.7);
  assert.equal(late.grow(3), false);
  assert.equal(second.high.taken, false);
  // And a hop on the spot, or nothing in the air at all, grows into nothing.
  const still = setup({ level: 1 }).chase;
  assert.equal(still.grow(3), false);
  still.jump(1);
  assert.equal(still.grow(3), false);
});

test('bent knees go under a branch, and a jump there is only a hop on the spot', () => {
  const { chase } = setup({ level: 2 });
  let branch = null;
  while (chase.state === 'play' && !branch) {
    const thing = marchToNext(chase);
    if (thing.kind === 'branch') branch = thing;
    else getPast(chase);
  }
  const here = chase.hero.x;
  assert.equal(chase.jump(2), true);
  wait(chase, 1);
  assert.equal(chase.hero.x, here);
  assert.equal(chase.station, branch);
  assert.equal(chase.squat(), true);
  wait(chase, branch.seconds + 0.05);
  assert.equal(branch.state, 'cleared');
  assert.ok(chase.hero.x > branch.at + branch.wide);
});

/** Plays on until the character is standing at a thing of this kind. */
function upTo(chase, kind) {
  while (chase.state === 'play') {
    const thing = marchToNext(chase);
    if (!thing) return null;
    if (thing.kind === kind) return thing;
    getPast(chase);
  }
  return null;
}

test('a hedgehog rolls in if it isn\'t jumped in time: a tumble, nothing for it, and the walk goes on', () => {
  const { chase, events } = setup({ level: 4, things: 18 });
  const hedgehog = upTo(chase, 'hedgehog');
  assert.ok(hedgehog);
  assert.equal(hedgehog.fuse, chaseLevel(4).fuse.hedgehog);
  assert.equal(hedgehog.fuse, FUSE[0]);
  // It began rolling in as the character stopped, a moment ago.
  assert.ok(hedgehog.left <= FUSE[0] && hedgehog.left > FUSE[0] - 0.6, `${hedgehog.left}`);
  const stars = chase.stats.stars;
  wait(chase, hedgehog.left - 0.2);
  assert.equal(chase.station, hedgehog);
  wait(chase, 0.3);
  assert.equal(chase.hero.mode, 'tumble');
  assert.equal(chase.station, null);
  assert.equal(hedgehog.missed, true);
  assert.equal(chase.stats.tumbles, 1);
  assert.equal(chase.stats.stars, stars);
  assert.ok(events.some(({ type, thing }) => type === 'tumble' && thing === hedgehog));
  // Sitting there, nothing can be done, and then it's up and walking again.
  assert.equal(chase.step('left'), false);
  assert.equal(chase.jump(1), false);
  wait(chase, TUMBLE_SECONDS + 0.05);
  assert.equal(chase.hero.mode, 'stand');
  assert.equal(chase.step('left'), true);

  // Jumped in time, it's two stars, and no tumble.
  const quick = setup({ level: 4, things: 18 }).chase;
  const second = upTo(quick, 'hedgehog');
  const before = quick.stats.stars;
  wait(quick, 2);
  quick.jump(1);
  wait(quick, 1);
  assert.equal(second.state, 'cleared');
  assert.equal(second.missed, undefined);
  assert.equal(quick.stats.tumbles, 0);
  assert.equal(quick.stats.stars, before + KINDS.hedgehog.stars);
});

test('a hedgehog and the bees leave less time at each level, and never less than two and a half seconds', () => {
  assert.equal(chaseLevel(4).fuse.hedgehog, FUSE[0]);
  assert.equal(chaseLevel(7).fuse.bees, FUSE[0]);
  assert.ok(Math.abs(chaseLevel(10).fuse.hedgehog - FUSE[1]) < 1e-9);
  assert.ok(Math.abs(chaseLevel(10).fuse.bees - FUSE[1]) < 1e-9);
  for (const level of LEVELS.slice(4)) assert.ok(chaseLevel(level).fuse.hedgehog <= chaseLevel(level - 1).fuse.hedgehog);
  assert.ok(FUSE[1] >= 2.5);
});

test('with nobody in the picture the hedgehog waits where it is', () => {
  const { chase } = setup({ level: 4, things: 18 });
  const hedgehog = upTo(chase, 'hedgehog');
  wait(chase, 1);
  const left = hedgehog.left;
  wait(chase, 20, false);
  assert.equal(hedgehog.left, left);
  assert.equal(chase.station, hedgehog);
});

test('stepping stones take three jumps, one stone each, and the third lands on the far bank', () => {
  const { chase } = setup({ level: 5, things: 18 });
  const stones = upTo(chase, 'stones');
  assert.ok(stones);
  const start = chase.hero.x;
  const stars = chase.stats.stars;
  chase.jump(1);
  wait(chase, stones.seconds + 0.05);
  assert.equal(chase.station, stones);
  assert.ok(chase.hero.x > start && chase.hero.x < stones.at + stones.wide);
  const first = chase.hero.x;
  chase.jump(1);
  wait(chase, stones.seconds + 0.05);
  assert.ok(chase.hero.x > first && chase.hero.x < stones.at + stones.wide);
  assert.equal(stones.state, 'at');
  // On a stone, marching goes nowhere.
  assert.equal(chase.step('left'), false);
  chase.jump(1);
  wait(chase, stones.seconds + 0.05);
  assert.equal(stones.state, 'cleared');
  assert.ok(chase.hero.x > stones.at + stones.wide);
  assert.equal(chase.stats.stars, stars + KINDS.stones.stars);
  assert.equal(chase.stats.cleared >= 1, true);
});

test('any jump bounces off a springboard, and a star jump catches the arc of stars above it', () => {
  const plain = setup({ level: 6, things: 18 }).chase;
  const spring = upTo(plain, 'spring');
  assert.ok(spring);
  const before = plain.stats.stars;
  plain.jump(1);
  wait(plain, spring.seconds + 0.05);
  assert.equal(spring.state, 'cleared');
  assert.equal(plain.stats.stars, before + KINDS.spring.stars);

  const starry = setup({ level: 6, things: 18 }).chase;
  const second = upTo(starry, 'spring');
  const stars = starry.stats.stars;
  starry.jump(1.5, { star: true });
  wait(starry, second.seconds + 0.05);
  assert.equal(starry.stats.stars, stars + KINDS.spring.stars + SPRING_STARS);
  assert.equal(starry.stats.starJumps, 1);
});

test('the bees are ducked with bent knees, and sting a character still standing when they arrive', () => {
  const ducked = setup({ level: 7, things: 18 }).chase;
  const bees = upTo(ducked, 'bees');
  assert.ok(bees);
  ducked.squat();
  wait(ducked, bees.seconds + 0.05);
  assert.equal(bees.state, 'cleared');
  assert.equal(ducked.stats.tumbles, 0);

  const stung = setup({ level: 7, things: 18 }).chase;
  const second = upTo(stung, 'bees');
  // A jump doesn't help.
  stung.jump(2);
  wait(stung, chaseLevel(7).fuse.bees + 1);
  assert.equal(second.missed, true);
  assert.equal(stung.stats.tumbles, 1);
});

test('under an apple tree, reaching up brings the apples down, once, and anywhere else it brings nothing', () => {
  const { chase, events } = setup({ level: 3, things: 18 });
  assert.equal(chase.reach(), false);
  const [tree] = chase.trees;
  // Walk to it, getting past whatever is before it.
  while (chase.state === 'play' && chase.hero.x < tree.at + 0.5) {
    if (chase.station) getPast(chase);
    else {
      chase.step('left');
      wait(chase, 0.5);
    }
  }
  assert.equal(chase.treeHere, tree);
  const stars = chase.stats.stars;
  assert.equal(chase.reach(), true);
  assert.equal(tree.picked, true);
  assert.equal(chase.stats.stars, stars + TREE.apples);
  assert.equal(chase.stats.apples, TREE.apples);
  assert.ok(events.some(({ type }) => type === 'apples'));
  assert.equal(chase.reach(), false);
  assert.equal(chase.stats.stars, stars + TREE.apples);
});

test('from level 9 two things come in a row: landing from the first is standing at the second', () => {
  const { chase } = setup({ level: 9, things: 18 });
  let pair = null;
  while (chase.state === 'play' && !pair) {
    const thing = marchToNext(chase);
    if (!thing) break;
    if (thing.paired) pair = thing;
    getPast(chase);
  }
  assert.ok(pair);
  const second = chase.course[pair.index + 1];
  assert.equal(chase.station, second, 'no step needed between them');
  assert.equal(second.state, 'at');
});

test('nobody is stuck at a move they can\'t do: after a long wait, marching on climbs past it, slowly and for nothing', () => {
  const { chase, events } = setup({ level: 1 });
  const stream = marchToNext(chase);
  const stars = chase.stats.stars;
  wait(chase, HELP_AFTER - 1);
  assert.equal(chase.step('left'), false);
  wait(chase, 1.1);
  assert.equal(chase.step('left'), true);
  assert.equal(chase.hero.move.kind, 'clamber');
  wait(chase, CLAMBER_SECONDS - 0.2);
  assert.equal(chase.hero.mode, 'move');
  wait(chase, 0.3);
  assert.equal(stream.state, 'cleared');
  assert.equal(chase.stats.helped, 1);
  assert.equal(chase.stats.cleared, 0);
  assert.equal(chase.stats.stars, stars);
  assert.ok(events.some(({ type, how }) => type === 'cleared' && how === 'clamber'));
  // It's slower than the move would have been.
  assert.ok(CLAMBER_SECONDS > 2 * KINDS.stream.seconds);
});

/* ---------- the magpie ---------- */

test('the magpie flies on at its own pace, quicker at each level, and never lets the character nearer than six metres', () => {
  for (const level of LEVELS.slice(1)) assert.ok(chaseLevel(level).pace > chaseLevel(level - 1).pace);
  assert.deepEqual([chaseLevel(1).pace, chaseLevel(10).pace], PACE);
  const { chase } = setup({ level: 1 });
  assert.equal(chase.lead, MAGPIE.start);
  wait(chase, 10);
  assert.ok(Math.abs(chase.lead - (MAGPIE.start + PACE[0] * 10)) < 0.05, `${chase.lead}`);
  // Marching briskly catches it up, as far as it lets anyone.
  for (let i = 0; i < 12; i += 1) {
    chase.step(i % 2 ? 'right' : 'left');
    wait(chase, STEP.seconds);
    if (chase.station) break;
  }
  assert.ok(chase.lead >= MAGPIE.least - 1e-6, `${chase.lead}`);
  // A child marching a step a second is quicker than the magpie at level 1, and slower than it at level 10.
  assert.ok(PACE[0] <= 0.5 && PACE[1] > 1 && PACE[1] < STEP.length / STEP.seconds);
});

test('a child who stands still loses the magpie: out of sight, it has got away, and the game is over', () => {
  const { chase, events } = setup({ level: 1 });
  const seconds = (MAGPIE.away - MAGPIE.start) / PACE[0];
  wait(chase, seconds - 1);
  assert.equal(chase.state, 'play');
  // It was said to be getting away first, once.
  assert.equal(events.filter(({ type }) => type === 'away').length, 1);
  assert.ok(chase.danger > 0.9 && chase.danger < 1, `${chase.danger}`);
  wait(chase, 1.2);
  assert.equal(chase.state, 'lost');
  assert.deepEqual(events.at(-1), { type: 'lost' });
  // Nothing more happens after that.
  const lead = chase.lead;
  wait(chase, 5);
  assert.equal(chase.lead, lead);
  assert.equal(chase.step('left'), false);
});

test('with nobody in the picture the magpie waits, and so does the clock', () => {
  const { chase } = setup({ level: 10 });
  wait(chase, 2);
  const [lead, seconds] = [chase.lead, chase.stats.seconds];
  wait(chase, 600, false);
  assert.equal(chase.lead, lead);
  assert.equal(chase.stats.seconds, seconds);
  assert.equal(chase.state, 'play');
});

test('the gentle magpie waits twelve metres ahead, for as long as it takes, at any level', () => {
  for (const level of [1, 10]) {
    const { chase } = setup({ level, gentle: true });
    wait(chase, 900);
    assert.equal(chase.state, 'play');
    assert.ok(Math.abs(chase.lead - MAGPIE.waits) < 1e-6, `${chase.lead}`);
    assert.equal(chase.danger, 0);
    playWell(chase);
    assert.equal(chase.state, 'won');
  }
});

test('a child who marches a step every half second and makes each move wins every level, on any length of path', () => {
  for (const level of LEVELS) {
    for (const things of [8, 12, 18]) {
      const { chase, events } = setup({ level, things });
      playWell(chase, 0.5);
      assert.equal(chase.state, 'won', `level ${level}, ${things} things: ${chase.state} with the magpie ${Math.round(chase.lead)} m ahead`);
      assert.equal(chase.stats.cleared, things);
      assert.equal(chase.stats.tumbles, 0);
      assert.equal(chase.hero.x, chase.end);
      assert.equal(events.at(-1).type, 'won');
      assert.equal(chase.stats.cup, level === 10);
      assert.equal(events.some(({ type }) => type === 'cup'), level === 10);
    }
  }
});

test('how quick a child has to be goes up with the levels: slow marching keeps the magpie at level 1, and only brisk marching at level 10', () => {
  /** A child who takes a step every so often, and stands so long at each thing before making the move. */
  const play = (level, every, pause, things = 12) => {
    const { chase } = setup({ level, things });
    while (chase.state === 'play') {
      if (!marchToNext(chase, every)) break;
      wait(chase, Math.max(0, Math.min(pause, (chase.station.left ?? 99) - 0.3)));
      getPast(chase);
    }
    return chase.state;
  };
  // A step every two seconds, and five seconds at each thing: enough at level 1, on any length of path.
  for (const things of [8, 12, 18]) assert.equal(play(1, 2, 5, things), 'won', `${things} things`);
  // A step every second and a half, and four seconds at each thing: level 1 and 2, and no longer by level 5.
  assert.deepEqual([1, 2, 5, 10].map((level) => play(level, 1.5, 4)), ['won', 'won', 'lost', 'lost']);
  // A step a second, and three seconds at each thing: up to level 7, and not at level 10.
  assert.deepEqual([1, 5, 7, 10].map((level) => play(level, 1, 3)), ['won', 'won', 'won', 'lost']);
  // A step every eight tenths of a second, and two seconds at each thing, is enough at every level.
  for (const level of LEVELS) assert.equal(play(level, 0.8, 2), 'won', `level ${level}`);
});

/* ---------- marching, as the camera reads it ---------- */

/** A foot going up to a height and down again, as the camera would see it, with the other foot on the floor. */
function lift(marcher, side, height, now, { other = 0.02, inAir = false } = {}) {
  const steps = [];
  const rises = (rise) => ({ left: other, right: other, [side]: rise });
  let time = now;
  for (const share of [0.3, 0.6, 1, 1, 0.6, 0.3, 0.1, 0]) {
    const step = marcher.update(rises(Math.max(other, height * share)), time, { inAir });
    if (step) steps.push(step);
    time += 0.05;
  }
  return steps;
}

test('a foot lifted to the line with the other on the floor is one step, however long it stays up', () => {
  const marcher = new Marcher({ line: LIFT.medium });
  assert.deepEqual(lift(marcher, 'left', LIFT.medium + 0.01, 0), ['left']);
  assert.deepEqual(lift(marcher, 'right', 0.3, 1), ['right']);
  // Held up for a long time, it's still one step, until it has come down.
  const held = new Marcher({ line: LIFT.medium });
  let steps = 0;
  for (let time = 0; time < 5; time += 0.05) if (held.update({ left: 0.2, right: 0.01 }, time)) steps += 1;
  assert.equal(steps, 1);
  for (let time = 5; time < 5.3; time += 0.05) held.update({ left: 0.01, right: 0.01 }, time);
  assert.equal(held.update({ left: 0.2, right: 0.01 }, 5.4), 'left');
});

test('a foot that doesn\'t reach the line is no step, and nor is standing still or a jump with both feet up', () => {
  const marcher = new Marcher({ line: LIFT.medium });
  assert.deepEqual(lift(marcher, 'left', LIFT.medium - 0.02, 0), []);
  // Standing still, as the camera reads it: up to 6% of leg length of wobble.
  for (let time = 1; time < 6; time += 0.05) assert.equal(marcher.update({ left: 0.03 + 0.03 * Math.sin(time * 7), right: 0.03 + 0.03 * Math.cos(time * 5) }, time), null);
  // Both feet up together is a jump.
  for (let time = 6; time < 6.4; time += 0.05) assert.equal(marcher.update({ left: 0.25, right: 0.24 }, time), null);
  // And whatever the feet do while the reader says the child is in the air.
  assert.deepEqual(lift(marcher, 'right', 0.3, 7, { inAir: true }), []);
  assert.ok(LIFT.low > 0.06 && LIFT.low < LIFT.medium && LIFT.medium < LIFT.high);
});

test('a leg that keeps nearly getting there is met: its line comes down, and the other leg\'s stays', () => {
  const marcher = new Marcher({ line: LIFT.high });
  const nearly = LIFT.high * 0.8;
  assert.deepEqual(lift(marcher, 'left', nearly, 0), []);
  assert.equal(marcher.line.left, LIFT.high);
  assert.deepEqual(lift(marcher, 'left', nearly, 1), []);
  assert.ok(marcher.line.left < LIFT.high);
  assert.equal(marcher.line.right, LIFT.high);
  // Two more tries bring it down again, to where the same lift counts.
  let steps = [];
  for (let i = 2; i < 8 && !steps.length; i += 1) steps = lift(marcher, 'left', nearly, i);
  assert.deepEqual(steps, ['left']);
  assert.ok(marcher.line.left <= nearly);
  // It never comes down to where standing still would be a step.
  const weak = new Marcher({ line: LIFT.low });
  for (let i = 0; i < 40; i += 1) lift(weak, 'right', 0.05, i);
  assert.ok(weak.line.right >= LEAST_LINE);
  assert.ok(LEAST_LINE > 0.06);
  // A foot that barely leaves the floor isn't a try, and nor is a jump.
  const still = new Marcher({ line: LIFT.high });
  for (let i = 0; i < 10; i += 1) lift(still, 'left', LIFT.high * 0.4, i);
  for (let i = 10; i < 20; i += 1) {
    for (let time = i; time < i + 0.4; time += 0.05) still.update({ left: 0.3, right: 0.3 }, time);
    still.update({ left: 0, right: 0 }, i + 0.5);
  }
  assert.deepEqual(still.line, { left: LIFT.high, right: LIFT.high });
  // A grown-up's new line starts from that line.
  marcher.setLine(LIFT.medium);
  assert.deepEqual(marcher.line, { left: LIFT.medium, right: LIFT.medium });
});

test('taking turns, the same leg again is no step, until the other has had its turn or there has been a pause', () => {
  const marcher = new Marcher({ line: LIFT.medium, turns: true });
  assert.deepEqual(lift(marcher, 'left', 0.2, 0), ['left']);
  assert.deepEqual(lift(marcher, 'left', 0.2, 0.6), []);
  assert.equal(marcher.same, true);
  assert.deepEqual(lift(marcher, 'right', 0.2, 1.2), ['right']);
  assert.equal(marcher.same, false);
  assert.deepEqual(lift(marcher, 'left', 0.2, 1.8), ['left']);
  // After a pause, either leg can begin again.
  assert.deepEqual(lift(marcher, 'left', 0.2, 5), ['left']);
  // As the game comes, either leg counts every time.
  const either = new Marcher({ line: LIFT.medium });
  assert.deepEqual([...lift(either, 'left', 0.2, 0), ...lift(either, 'left', 0.2, 0.6)], ['left', 'left']);
});

/* ---------- marching, on what the real tracker reported ---------- */

// What the real pose tracker reported, 15 times a second, for footage of a person lifting one foot and then the
// other, and for the same person sliding each foot back along the floor: see each file's "about". They were made
// for Rooftop Rope, and only hold the nose and the ankles.
const lifts = JSON.parse(readFileSync(new URL('../fixtures/rooftop-rope-stands.json', import.meta.url)));
const slides = JSON.parse(readFileSync(new URL('../fixtures/rooftop-rope-staggers.json', import.meta.url)));
const mean = (list) => list.reduce((sum, value) => sum + value, 0) / list.length;

/** Each foot's height off the floor in each frame, as a share of leg length, as the body reader gives it. */
function footRises(clip) {
  const standing = clip.frames.filter(({ t }) => t < 0.8);
  const floor = { left: mean(standing.map(({ image }) => image[1][1])), right: mean(standing.map(({ image }) => image[2][1])) };
  // Their hips aren't kept: they're about 0.57 of the way from the floor up to the nose.
  const leg = 0.57 * ((floor.left + floor.right) / 2 - mean(standing.map(({ image }) => image[0][1])));
  return clip.frames.map(({ t, image }) => ({ t, rises: { left: (floor.left - image[1][1]) / leg, right: (floor.right - image[2][1]) / leg } }));
}

/** The steps a line of some height reads in some footage, as 'side@seconds'. */
function stepsIn(clip, line) {
  const marcher = new Marcher({ line });
  const steps = [];
  for (const { t, rises } of footRises(clip)) {
    const side = marcher.update(rises, t);
    if (side) steps.push({ side, t });
  }
  return steps;
}

test('on the real tracker\'s readings of a person lifting each foot, every lift is one step with that leg, however slowly it comes up or long it\'s held', () => {
  // The right foot goes up slowly from 1 to 9 seconds and the left from 10 to 18, then each is lifted 30
  // centimetres and held for three and a half seconds, from 20 and from 26.5. Last, the right is lifted 8
  // centimetres, from 34.
  for (const line of [LIFT.medium, LIFT.high]) {
    const steps = stepsIn(lifts, line);
    assert.deepEqual(steps.map(({ side }) => side), ['right', 'left', 'right', 'left'], `at ${line}`);
    const [first, second, third, fourth] = steps.map(({ t }) => t);
    assert.ok(first > 1.5 && first < 4 && second > 10.5 && second < 13, `the slow lifts at ${first} and ${second}`);
    // The quick lifts are read within half a second of beginning.
    assert.ok(third >= 20 && third < 20.6 && fourth >= 26.5 && fourth < 27.1, `the quick lifts at ${third} and ${fourth}`);
  }
  // A foot only 8 centimetres up is a step for a child whose line is Low, and not otherwise.
  assert.deepEqual(stepsIn(lifts, LIFT.low).map(({ side }) => side), ['right', 'left', 'right', 'left', 'right']);
  // Standing still, before any of it, nothing is near any line.
  for (const { t, rises } of footRises(lifts)) if (t < 0.9) assert.ok(Math.abs(rises.left) < 0.03 && Math.abs(rises.right) < 0.03, `${t}`);
});

test('on the real tracker\'s readings, a foot slid back along the floor isn\'t a step at Medium or High', () => {
  // The camera sees a foot that's further off as a little higher in the picture, so one slid 40 centimetres back
  // reads as about a tenth of a leg length up: under the Medium line, though not under the Low one.
  const most = Math.max(...footRises(slides).flatMap(({ rises }) => [rises.left, rises.right]));
  assert.ok(most > 0.08 && most < LIFT.medium, `${most}`);
  assert.deepEqual(stepsIn(slides, LIFT.medium), []);
  assert.deepEqual(stepsIn(slides, LIFT.high), []);
  assert.equal(stepsIn(slides, LIFT.low).length, 2);
});

/* ---------- what it says ---------- */

test('every line Hat Chase says has a voice file in both languages, and none is left over', () => {
  const folder = new URL('../../games/hat-chase/audio/voice/', import.meta.url);
  const lines = JSON.parse(readFileSync(new URL('lines.json', folder), 'utf8'));
  const source = readFileSync(new URL('../../games/hat-chase/main.js', import.meta.url), 'utf8');
  const [, block] = source.match(/const SAY = \{([\s\S]*?)\n\};/);
  const said = [...block.matchAll(/: '([^']+)'/g)].map(([, text]) => text);
  assert.ok(said.length >= 10, `only found ${said.length} lines`);
  assert.deepEqual(said.filter((text) => !lines.some((line) => line.text === text)), []);
  assert.deepEqual(lines.map(({ text }) => text).filter((text) => !said.includes(text)), []);
  for (const { id, ka } of lines) {
    assert.match(ka, /[Ⴀ-ჿ]/, id);
    for (const language of ['en', 'ka']) assert.ok(existsSync(new URL(`${language}/${id}.ogg`, folder)), `${language}/${id}.ogg`);
  }
  // The folder is one the voice tools know about.
  assert.ok(readFileSync(new URL('../../tools/voice_common.py', import.meta.url), 'utf8').includes('"hat-chase"'));
});

test('Hat Chase comes with the magpie that can get away, and a grown-up can have the one that waits', () => {
  const source = readFileSync(new URL('../../games/hat-chase/main.js', import.meta.url), 'utf8');
  assert.match(source, /const DEFAULTS = \{[^}]*chaseMagpie: 'flies'/);
  for (const [name, values] of Object.entries({ chaseMagpie: ['flies', 'waits'], chaseLift: ['low', 'medium', 'high'], chaseLegs: ['either', 'turns'], chaseJump: ['jump', 'arms'], chaseLength: ['8', '12', '18'] })) {
    for (const value of values) assert.ok(source.includes(`choice('${name}', '${value}'`), `${name} ${value}`);
  }
});

/* ---------- several walking together in front of one camera ---------- */

test('with several walking together, each step takes them all on by its share: together they go as far as one child would', () => {
  const alone = setup().chase;
  const pair = setup({ walkers: 2 }).chase;
  assert.equal(alone.walkers, 1);
  assert.equal(pair.walkers, 2);
  // One step from one of two is half a step along the path.
  assert.equal(pair.step('left', 0), true);
  wait(pair, 1);
  assert.ok(Math.abs(pair.hero.x - STEP.length / 2) < 1e-6, `at ${pair.hero.x}`);
  // And a step from each is a whole one, as one child's step is.
  assert.equal(pair.step('right', 1), true);
  wait(pair, 1);
  alone.step('left');
  wait(alone, 1);
  assert.ok(Math.abs(pair.hero.x - alone.hero.x) < 1e-6, `${pair.hero.x} and ${alone.hero.x}`);
  // Four of them, one step each: the same again.
  const four = setup({ walkers: 4 }).chase;
  for (const by of [0, 1, 2, 3]) {
    four.step(by % 2 ? 'right' : 'left', by);
    wait(four, 0.5);
  }
  assert.ok(Math.abs(four.hero.x - STEP.length) < 1e-6, `at ${four.hero.x}`);
  // Never fewer than one, whatever is asked.
  assert.equal(new Chase({ walkers: 0 }).walkers, 1);
});

test('each of them has their own count of steps, and the legs are counted for everyone', () => {
  const { chase, events } = setup({ walkers: 3 });
  assert.deepEqual(chase.stats.by, [0, 0, 0]);
  chase.step('left', 0);
  wait(chase, 0.3);
  chase.step('right', 2);
  wait(chase, 0.3);
  chase.step('left', 2);
  wait(chase, 0.3);
  assert.deepEqual(chase.stats.by, [1, 0, 2]);
  assert.equal(chase.stats.steps, 3);
  assert.equal(chase.stats.left, 2);
  assert.equal(chase.stats.right, 1);
  // Whose step it was is said, for their character to show it.
  assert.deepEqual(events.filter(({ type }) => type === 'step').map(({ by }) => by), [0, 2, 2]);
  // One child's game counts its steps as their own.
  const alone = setup().chase;
  alone.step('left');
  assert.deepEqual(alone.stats.by, [1]);
});

test('two marching at once are not held back: no more than two whole steps wait, however many take them', () => {
  const { chase } = setup({ walkers: 2 });
  // Eight quick half steps with no time going by: four whole steps asked for, and two are kept.
  let taken = 0;
  for (let step = 0; step < 8; step += 1) taken += Number(chase.step(step % 2 ? 'right' : 'left', step % 2));
  assert.equal(taken, 4);
  assert.ok(Math.abs(chase.hero.walkTo - STEP.waiting * STEP.length) < 1e-6);
});

test('anyone\'s jump gets everyone past a thing in the way, and a second jump just after is not a second thing', () => {
  const { chase } = setup({ walkers: 2 });
  let side = 'left';
  for (let i = 0; i < 800 && !chase.station; i += 1) {
    chase.step(side, i % 2);
    side = side === 'left' ? 'right' : 'left';
    wait(chase, 0.25);
  }
  assert.ok(chase.station, 'they have come to something');
  const first = chase.station;
  const needs = first.needs;
  const act = () => (needs === 'jump' ? chase.jump(1.2) : needs === 'squat' ? chase.squat() : chase.jump(1.2));
  assert.equal(act(), true);
  // The other one's, a moment later, while everyone is on their way past: nothing.
  wait(chase, 0.1);
  assert.equal(act(), false);
  assert.equal(chase.stats.cleared + chase.stats.jumps >= 1, true);
});

test('the step that climbs past a thing after a long wait is counted for whoever took it', () => {
  const { chase } = setup({ walkers: 2, gentle: true });
  marchToNext(chase);
  assert.ok(chase.station, 'they have come to something');
  wait(chase, HELP_AFTER + 0.2);
  const before = [...chase.stats.by];
  assert.equal(chase.step('right', 1), true);
  assert.deepEqual(chase.stats.by, [before[0], before[1] + 1]);
  assert.equal(chase.stats.helped, 1);
});
