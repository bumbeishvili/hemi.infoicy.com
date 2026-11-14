// Rooftop Rope's rules, with no screen or camera: how a lifted foot is read from a body, how the child's own
// lift is learnt, how a game is laid out at each level, and what a crossing does with a child who holds a foot
// up well, too low, not for long, the wrong foot, or not at all. The walkers are pretend children: see
// rope-walker.js.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DROPS, HIGHER, HOLDS, LIFT, Lifter, NEW_THINGS, ROPE_COUNTS, WALK, WARM, WOBBLES, Walk, Warmup, layOut, liftOf, newAt, otherLeg, thingsUpTo, walkLevel } from '../../games/rooftop-rope/walk.js';
import { STEP, bodyStanding, measuredLifter, planOf, seeded, valueFor, walk } from './rope-walker.js';

const near = (actual, expected, within, message) => assert.ok(Math.abs(actual - expected) <= within, `${message ?? ''} expected about ${expected}, got ${actual}`);
const types = (events) => events.map(({ type }) => type);
/** A lifter fed a steady reading for a while, as when a child holds still. */
function settled(lifter, value, seconds = 1.5) {
  for (let time = 0; time < seconds; time += STEP) lifter.update(value, STEP);
  return lifter;
}

/* ------------------------------- reading a lifted foot ------------------------------- */

test('a foot off the floor is read as that foot lifted, by how high it is as a share of the body’s height', () => {
  near(liftOf(bodyStanding()), 0, 1e-9, 'both feet down');
  near(liftOf(bodyStanding({ right: 0.1 })), 0.1, 1e-9, 'the right foot up');
  near(liftOf(bodyStanding({ left: 0.2 })), -0.2, 1e-9, 'the left foot up, the other way');
  // It goes by the child's own height, so standing nearer or further off reads the same.
  near(liftOf(bodyStanding({ right: 0.1, tall: 0.4 })), 0.1, 1e-9, 'far from the camera');
  near(liftOf(bodyStanding({ right: 0.1, tall: 0.85 })), 0.1, 1e-9, 'and close to it');
});

test('without both feet and the head to go by there is nothing to read, and nobody is nobody', () => {
  assert.equal(liftOf(bodyStanding({ right: 0.1, feet: false })), null);
  assert.equal(liftOf(bodyStanding({ right: 0.1, nose: false })), null);
  assert.equal(liftOf(null), null);
  assert.equal(liftOf({ image: null }), null);
  // A body lying down, with its head as low as its feet, isn't standing on one leg.
  assert.equal(liftOf(bodyStanding({ tall: 0.05 })), null);
});

/* ------------------------------- reading a lifted foot, on real footage ------------------------------- */

// What the real tracker reported for footage of a person standing on one leg: see the file's "about".
const footage = JSON.parse(readFileSync(new URL('../fixtures/rooftop-rope-stands.json', import.meta.url)));
// And for footage of the same person with both feet on the floor, one behind the other.
const staggers = JSON.parse(readFileSync(new URL('../fixtures/rooftop-rope-staggers.json', import.meta.url)));
/** The frame of some footage that's nearest a moment in it. */
const frameAt = (clip, t) => clip.frames.reduce((best, frame) => (Math.abs(frame.t - t) < Math.abs(best.t - t) ? frame : best));

/** The body the tracker reported in one frame. */
function bodyIn(frame) {
  const image = [];
  footage.points.forEach((index, n) => {
    const [x, y, z, visibility] = frame.image[n];
    image[index] = { x, y, z, visibility };
  });
  return { image };
}
const between = (from, to) => footage.frames.filter(({ t }) => t >= from && t < to);
/** The straight line that fits what was read for one foot going up: how much is read for each metre, and how far off it any reading is. */
function fit(from, to, sign) {
  const pairs = between(from + 0.3, to).map((frame) => [(frame.t - from) * 0.06, liftOf(bodyIn(frame)) * sign]);
  const meanHigh = pairs.reduce((sum, [high]) => sum + high, 0) / pairs.length;
  const meanRead = pairs.reduce((sum, [, read]) => sum + read, 0) / pairs.length;
  const slope = pairs.reduce((sum, [high, read]) => sum + (high - meanHigh) * (read - meanRead), 0) / pairs.reduce((sum, [high]) => sum + (high - meanHigh) ** 2, 0);
  const worst = Math.max(...pairs.map(([high, read]) => Math.abs(read - (meanRead + slope * (high - meanHigh)))));
  return { slope, worst, at: (high) => meanRead + slope * (high - meanHigh) };
}

test('on real footage of a person lifting a foot, it’s read as that foot, and goes evenly with how high the foot is', () => {
  const right = fit(1, 9, 1);
  const left = fit(10, 18, -1);
  // Their nose is about 1.25 metres up, so a foot a metre off the floor would be 0.8 of their height.
  for (const [name, line] of [['right', right], ['left', left]]) {
    assert.ok(line.slope > 0.7 && line.slope < 0.9, `${name}: ${line.slope} of their height read for each metre`);
    assert.ok(line.worst < 0.03, `${name}: never more than ${line.worst} of their height off the line`);
    assert.ok(line.at(0.3) > 0.17 && line.at(0.3) < 0.25, `${name}: a foot 30 centimetres up reads as ${line.at(0.3)} of their height`);
  }
  near(right.slope, left.slope, 0.05, 'and the same for either foot');
  // Standing still, with both feet down, is within what counts as on the floor.
  for (const frame of between(0, 0.9)) assert.ok(Math.abs(liftOf(bodyIn(frame))) < LIFT.dead, `standing: ${liftOf(bodyIn(frame))}`);
});

test('on real footage of a person lifting each foot and holding it, the warm-up measures each foot', () => {
  const events = [];
  const lifter = new Lifter();
  for (const frame of between(18.5, 19.8)) lifter.update(liftOf(bodyIn(frame)), 1 / footage.fps);
  lifter.restHere();
  const warmup = new Warmup({ lifter, sides: ['right', 'left'], onEvent: (event) => events.push(event) });
  for (const frame of between(19.8, 33.5)) {
    lifter.update(liftOf(bodyIn(frame)), 1 / footage.fps);
    warmup.update(1 / footage.fps);
  }
  assert.equal(warmup.done, true);
  assert.deepEqual(types(events), ['measured', 'side', 'measured', 'done']);
  // Feet 30 centimetres up, read as about a fifth of their height.
  near(lifter.best.right, 0.21, 0.03, 'the right foot');
  near(lifter.best.left, 0.21, 0.03, 'the left foot');
});

test('on real footage, a small lift counts for a child whose whole lift is small, and is only a try for one whose whole lift is high', () => {
  // The right foot 8 centimetres off the floor, held for two seconds.
  const lifted = (lifter) => {
    for (const frame of between(32.2, 33.4)) lifter.update(liftOf(bodyIn(frame)), 1 / footage.fps);
    lifter.restHere();
    let most = 0;
    for (const frame of between(33.4, 36)) {
      lifter.update(liftOf(bodyIn(frame)), 1 / footage.fps);
      most = Math.max(most, lifter.up.right);
      assert.equal(lifter.up.left, 0, 'the other foot stays down');
    }
    return most;
  };
  const small = lifted(new Lifter({ size: 'tiny' }));
  const high = lifted(measuredLifter('big'));
  assert.ok(small >= WALK.on, `with a whole lift of 4% of their height, it's a lift: ${small}`);
  assert.ok(high < WALK.on && high > 0.1, `with one of 17%, it's a foot off the floor, trying: ${high}`);
});

test('on real footage of a person with one foot on the floor behind the other, the foot that’s behind is not read as lifted', () => {
  assert.deepEqual(staggers.points, footage.points);
  const read = (t) => liftOf(bodyIn(frameAt(staggers, t)));
  const level = read(0.5);
  // 20 centimetres behind, a seventh of this person's height: the camera sees that foot a little higher in the
  // picture, as it's further off, by no more than counts as on the floor.
  near(read(3) - level, 0, LIFT.dead + 0.003, 'the right foot 20 cm behind');
  near(read(9) - level, 0, LIFT.dead + 0.003, 'the left foot 20 cm behind');
  // The same foot that far off the floor reads many times as high.
  const lifted = liftOf(bodyIn(frameAt(footage, 1 + 20 / 6))) - liftOf(bodyIn(frameAt(footage, 0.5)));
  assert.ok(lifted > 0.1, `a foot 20 cm up reads as ${lifted}`);
  assert.ok(Math.abs(read(3) - level) < lifted / 6);
  // A long step back, 30 centimetres, reads as a little off the floor: far less than a foot lifted that high.
  for (const [t, sign] of [[4, 1], [10, -1]]) {
    const back = (read(t) - level) * sign;
    assert.ok(back > 0 && back < 0.045, `a foot 30 cm behind reads as ${back}`);
  }
});

test('on that footage, a foot put down behind the other never moves the walker: 20 centimetres behind at any setting, and further with a higher one', () => {
  // How high a whole lift is, what the warm-up measured, and how many seconds of the foot sliding back, 10
  // centimetres a second, are played.
  for (const [size, best, seconds] of [['tiny', 0.05, 2.05], ['small', null, 2.5], ['medium', null, 2.5], ['medium', 0.3, 3], ['big', 0.3, 3.9]]) {
    for (const from of [0, 6]) {
      const lifter = measuredLifter(size, best);
      const game = new Walk({ plan: planOf([{ leg: 'any', seconds: 3 }]), lifter, wobble: 'never' });
      // Standing level, as through the countdown, and then "Go!".
      for (const frame of staggers.frames.filter(({ t }) => t >= from && t < from + 1)) lifter.update(liftOf(bodyIn(frame)), 1 / staggers.fps);
      assert.equal(lifter.restHere(), true);
      game.begin();
      for (const frame of staggers.frames.filter(({ t }) => t >= from + 1 && t < from + 1 + seconds)) {
        lifter.update(liftOf(bodyIn(frame)), 1 / staggers.fps);
        game.update(1 / staggers.fps, lifter);
        assert.equal(game.gliding, false, `${size}, at ${frame.t} seconds: read as ${lifter.raw}`);
      }
      assert.deepEqual([game.state, game.progress], ['roof', 0]);
    }
  }
});

/* ------------------------------- the child's own lift ------------------------------- */

test('a foot on the floor counts for nothing, and past that the lift grows evenly up to a whole one and beyond', () => {
  const lifter = measuredLifter('medium');
  assert.deepEqual(settled(lifter, 0).up, { left: 0, right: 0 });
  assert.deepEqual(settled(lifter, 0.008).up, { left: 0, right: 0 }, 'the tracker’s wobble is not a lift');
  const half = settled(lifter, valueFor(lifter, 'right', 0.5)).up;
  near(half.right, 0.5, 0.01);
  assert.equal(half.left, 0, 'and the other foot is down');
  near(settled(lifter, LIFT.full.medium).up.right, 1, 0.01, 'the whole lift');
  near(settled(lifter, -LIFT.full.medium).up.left, 1, 0.01, 'and with the left foot');
  assert.ok(settled(lifter, LIFT.full.medium * 1.8).up.right > 1.7, 'higher than a whole lift goes on counting');
  assert.ok(settled(lifter, 0.9).up.right <= LIFT.most, 'up to a limit');
});

test('how high a lift has to be is the grown-ups’ setting', () => {
  const shares = Object.keys(LIFT.full).map((size) => settled(measuredLifter(size), 0.04).up.right);
  for (let i = 1; i < shares.length; i += 1) assert.ok(shares[i] < shares[i - 1], `a bigger setting makes the same lift count for less: ${shares}`);
  near(shares[0], 1, 0.01, 'at the smallest setting, 4% of the body’s height is the whole lift');
});

test('level is wherever the feet have settled, so a child with one foot in front of the other starts from there', () => {
  const lifter = settled(measuredLifter(), 0.02, 4);
  assert.ok(lifter.up.right > 0.05, 'before, the foot that looks higher is a little lift');
  assert.equal(lifter.restHere(), true);
  assert.deepEqual(settled(lifter, 0.02).up, { left: 0, right: 0 }, 'after, both are on the floor');
  assert.ok(settled(lifter, 0.02 + 0.08).up.right > 0.5, 'and a lift is measured from there');
  // A child with a foot well up isn't taken as standing level.
  const lifted = settled(measuredLifter(), 0.12, 4);
  assert.equal(lifted.restHere(), false);
  assert.equal(lifted.zero, 0);
});

test('one wild look from the tracker lifts nothing, and the same one over and over is the child', () => {
  const lifter = settled(measuredLifter(), 0);
  lifter.update(0.4, STEP);
  assert.equal(lifter.up.right, 0, 'one look');
  lifter.update(0, STEP);
  assert.equal(lifter.up.right, 0);
  for (let i = 0; i < 30; i += 1) lifter.update(0.4, STEP);
  assert.ok(lifter.up.right > 1, 'held, it counts');
});

test('with no feet to see, the lifted foot comes down gently, and nothing is forgotten about the child', () => {
  const lifter = new Lifter();
  lifter.measured('left', 0.1);
  settled(lifter, -0.085);
  const before = lifter.up.left;
  near(before, 1, 0.02);
  lifter.update(null, STEP);
  assert.ok(lifter.up.left > 0.5 && lifter.up.left < before, 'a little at a time');
  assert.equal(lifter.seen, true, 'a look or two missed is not nobody');
  settled(lifter, null, 2);
  assert.equal(lifter.up.left, 0);
  assert.equal(lifter.seen, false);
  near(lifter.reachOf('left'), 0.1 * LIFT.ofBest, 1e-9, 'their own lift is kept');
});

test('a whole lift with each foot is most of what the child managed in the warm-up, and never more than the setting', () => {
  const lifter = new Lifter({ size: 'medium' });
  // Before the warm-up, or with it skipped, nothing is known of the child: a whole lift is a small one.
  near(lifter.reachOf('left'), LIFT.unmeasured, 1e-9, 'before the warm-up');
  near(new Lifter({ size: 'tiny' }).reachOf('right'), LIFT.full.tiny, 1e-9, 'with a smaller setting');
  lifter.measured('left', 0.06);
  lifter.measured('right', 0.3);
  near(lifter.reachOf('left'), 0.06 * LIFT.ofBest, 1e-9, 'the weaker side asks for less');
  near(lifter.reachOf('right'), LIFT.full.medium, 1e-9, 'the stronger for no more than the setting');
  lifter.measured('left', 0.01);
  near(lifter.reachOf('left'), LIFT.least, 1e-9, 'and never less than can be told from wobble');
  // Eased for a child who can't get there, a step at a time, to the floor.
  const before = lifter.reachOf('right');
  assert.equal(lifter.ease('right'), true);
  near(lifter.reachOf('right'), before * LIFT.easedBy, 1e-9);
  for (let i = 0; i < 30; i += 1) lifter.ease('right');
  near(lifter.reachOf('right'), LIFT.least, 1e-9);
  assert.equal(lifter.ease('right'), false);
});

/* ------------------------------- the warm-up ------------------------------- */

/** A warm-up with feet that do what's listed: [seconds, how much higher the right foot is] one after another. */
function warmUp(moves, { sides = ['left', 'right'] } = {}) {
  const events = [];
  const lifter = new Lifter({ size: 'big' });
  const warmup = new Warmup({ lifter, sides, onEvent: (event) => events.push(event) });
  let value = 0;
  for (const [seconds, wanted] of moves) {
    for (let time = 0; time < seconds && !warmup.done; time += STEP) {
      if (wanted === null) lifter.update(null, STEP);
      else {
        value += (wanted - value) * (1 - Math.exp(-6 * STEP));
        lifter.update(value, STEP);
      }
      warmup.update(STEP);
    }
  }
  return { lifter, warmup, events };
}

test('the warm-up measures how high the child lifts each foot, each by itself', () => {
  const { lifter, warmup, events } = warmUp([[0.5, 0], [2.5, -0.09], [1.5, 0], [2.5, 0.2], [1.5, 0], [2, 0]]);
  assert.equal(warmup.done, true);
  assert.deepEqual(types(events), ['measured', 'side', 'measured', 'done']);
  assert.equal(events[0].side, 'left');
  near(lifter.best.left, 0.09, 0.006, 'left');
  near(lifter.best.right, 0.2, 0.008, 'right');
  assert.ok(lifter.reachOf('left') < lifter.reachOf('right'), 'so a whole lift is less with the weaker leg');
});

test('a kick is not taken as the child’s lift: only what was held counts', () => {
  const { lifter } = warmUp([[0.5, 0], [0.25, -0.3], [0.6, 0], [2.5, -0.08], [1.5, 0]], { sides: ['left'] });
  assert.ok(lifter.best.left < 0.1 && lifter.best.left > 0.06, `the kick was not measured: ${lifter.best.left}`);
});

test('the wrong foot, or hardly a lift at all, measures nothing, and the warm-up moves on by itself or is skipped', () => {
  const { lifter, warmup, events } = warmUp([[WARM.patience + 0.5, 0.15], [1, 0], [WARM.patience + 0.5, 0.012], [2, 0]]);
  assert.equal(warmup.done, true, 'nobody is kept waiting');
  assert.equal(lifter.best.left, null, 'the right foot when asked for the left');
  assert.equal(lifter.best.right, null, 'a foot hardly off the floor');
  assert.equal(events[0].best, null);
  near(lifter.reachOf('left'), LIFT.unmeasured, 1e-9);
  const skipped = warmUp([[0.5, 0]]);
  skipped.warmup.finish(false);
  assert.equal(skipped.warmup.done, true);
  assert.equal(skipped.events.at(-1).measured, false);
});

/* ------------------------------- laying out a game ------------------------------- */

test('a game has as many ropes as a grown-up chose, at every level, each as long as they chose', () => {
  for (let level = 1; level <= 10; level += 1) {
    for (const ropes of ROPE_COUNTS) {
      const plan = layOut({ level, ropes, hold: 'short', random: seeded(level * 7 + ropes) });
      assert.equal(plan.ropes.length, ropes, `level ${level}`);
      for (const rope of plan.ropes.filter(({ long }) => !long)) near(rope.seconds, HOLDS.short * walkLevel(level).hold, 1e-9);
    }
  }
  assert.equal(layOut({ ropes: 99, random: seeded(1) }).ropes.length, 6, 'a number that is not one of the choices');
  assert.ok(HOLDS.short < HOLDS.medium && HOLDS.medium < HOLDS.long);
});

test('which foot lifts is the grown-ups’ choice: taking turns, standing on the leg being worked on, lifting it, or either', () => {
  const legs = (options) => layOut({ ropes: 6, random: seeded(3), ...options }).ropes.map(({ leg }) => leg);
  const turns = legs({ which: 'turns' });
  turns.forEach((leg, index) => {
    if (index) assert.equal(leg, otherLeg(turns[index - 1]), 'one foot and then the other');
  });
  // Standing on the leg being worked on means lifting the other foot.
  assert.deepEqual(new Set(legs({ which: 'stand', side: 'left' })), new Set(['right']));
  assert.deepEqual(new Set(legs({ which: 'stand', side: 'right' })), new Set(['left']));
  assert.deepEqual(new Set(legs({ which: 'lift', side: 'left' })), new Set(['left']));
  assert.deepEqual(new Set(legs({ which: 'any' })), new Set(['any']));
});

test('the same numbers lay out the same game, so friends each get the same ropes', () => {
  assert.deepEqual(layOut({ level: 9, random: seeded(77) }), layOut({ level: 9, random: seeded(77) }));
  assert.notDeepEqual(layOut({ level: 9, random: seeded(77) }).ropes, layOut({ level: 9, random: seeded(78) }).ropes);
});

test('every level from 2 to 10 brings one new thing, named for the cards, and level 1 has none', () => {
  assert.deepEqual(newAt(1), []);
  const ids = new Set();
  for (let level = 2; level <= 10; level += 1) {
    const news = newAt(level);
    assert.equal(news.length, 1, `level ${level}`);
    assert.ok(news[0].mark && news[0].name && news[0].nameKa, `level ${level} has a picture and both names`);
    ids.add(NEW_THINGS[level][0].id);
  }
  assert.equal(ids.size, 9, 'each one different');
  assert.deepEqual(thingsUpTo(4).map(({ id }) => id), ['star', 'balloon', 'bird']);
});

test('level 1 is the plain rope, and each level’s new thing is on its very first rope', () => {
  for (const rope of layOut({ level: 1, random: seeded(2) }).ropes) assert.deepEqual([rope.things, rope.long, rope.climb], [[], false, false]);
  const first = (level, seed) => layOut({ level, random: seeded(seed) }).ropes[0];
  for (let seed = 1; seed <= 12; seed += 1) {
    assert.equal(first(2, seed).things.filter(({ kind }) => kind === 'star').length, 3);
    assert.ok(first(3, seed).things.some(({ kind }) => kind === 'balloon'));
    assert.ok(first(4, seed).things.some(({ kind }) => kind === 'bird'));
    assert.ok(first(5, seed).things.some(({ kind }) => kind === 'swap'));
    assert.ok(first(6, seed).things.some(({ kind }) => kind === 'light'));
    assert.equal(first(7, seed).climb, true);
    assert.ok(first(9, seed).things.some(({ kind }) => kind === 'gust'));
    // And nothing from a later level.
    for (const rope of layOut({ level: 4, random: seeded(seed) }).ropes) {
      assert.ok(!rope.climb && !rope.long && !rope.things.some(({ kind }) => ['swap', 'light', 'gust', 'post'].includes(kind)));
    }
  }
});

test('from level 8 one rope is the long one, twice as long, with a post half way to rest on', () => {
  assert.ok(!layOut({ level: 7, random: seeded(3) }).ropes.some(({ long }) => long));
  for (const level of [8, 9, 10]) {
    const plan = layOut({ level, random: seeded(level) });
    const long = plan.ropes.filter((rope) => rope.long);
    assert.equal(long.length, 1);
    near(long[0].seconds, plan.ropes.find((rope) => !rope.long).seconds * 2, 1e-9);
    assert.deepEqual(long[0].things.filter(({ kind }) => kind === 'post').map(({ at }) => at), [0.5]);
    assert.notEqual(long[0].index, plan.ropes.length - 1, 'and it isn’t the last rope');
  }
});

test('with friends it is the plain rope with its stars, whatever the level, and ropes take a little longer as the levels go up but nothing gets quicker', () => {
  for (const level of [1, 6, 10]) {
    const plan = layOut({ level, plain: true, random: seeded(level + 20) });
    for (const rope of plan.ropes) {
      assert.deepEqual(rope.things.map(({ kind }) => kind), ['star', 'star', 'star']);
      assert.ok(!rope.long && !rope.climb);
    }
  }
  for (let level = 2; level <= 10; level += 1) assert.ok(walkLevel(level).hold >= walkLevel(level - 1).hold);
  near(walkLevel(10).hold, 1.3, 1e-9);
});

/* ------------------------------- crossing ------------------------------- */

const oneRope = (rope = {}, rules = {}) => planOf([rope], rules);

test('a child who holds a foot up crosses every rope without a fall, at every level', () => {
  for (let level = 1; level <= 10; level += 1) {
    const { game, time } = walk({ level, random: seeded(level + 40) });
    assert.equal(game.state, 'finished', `level ${level}`);
    assert.equal(game.stats.crossed, game.stats.ropes);
    assert.equal(game.stats.falls, 0);
    assert.equal(game.stats.stars, game.plan.stars, 'and every star on the way is theirs');
    assert.ok(time > 25 && time < 110, `level ${level} took ${time} seconds`);
  }
});

test('the walker stays on the rooftop until a foot is lifted, for as long as the child likes, and then steps onto the rope', () => {
  const waiting = walk({ plan: oneRope() }, { feet: () => null, seconds: 30 });
  assert.equal(waiting.game.state, 'roof');
  assert.equal(waiting.game.progress, 0);
  assert.equal(waiting.game.stats.falls, 0, 'nothing is ever lost by resting on a rooftop');
  assert.equal(waiting.game.hint, 'right', 'it asks for the foot the rope is crossed on');
  assert.equal(waiting.game.resting, true);
  assert.equal(waiting.types.filter((type) => type === 'resting').length, 1, 'and says once that there’s no hurry');
  const going = walk({ plan: oneRope() }, { feet: (game, time) => (time > 2 ? { foot: 'right', share: 1 } : null), until: (game) => game.state === 'rope' });
  assert.equal(going.game.state, 'rope');
  assert.deepEqual(going.types.filter((type) => ['up', 'off'].includes(type)), ['up', 'off']);
});

test('while the foot is up the walker glides along the rope, and with it at a whole lift a rope takes as long as it says', () => {
  const { game, time } = walk({ plan: oneRope({ seconds: 4 }) }, { feet: () => ({ foot: 'right', share: 1 }), late: 0 });
  assert.equal(game.state, 'finished');
  near(time, 4 + WALK.stepSeconds, 0.6, 'four seconds on the rope, and a step onto the roof');
  assert.equal(game.stats.crossed, 1);
  assert.deepEqual(game.stats.holds, { left: 0, right: 1 });
  near(game.stats.longest, time, 0.5);
});

test('the higher the foot, the faster the walker goes: only just off the floor it takes twice as long, and higher than a whole lift is no quicker', () => {
  const seconds = (share) => walk({ plan: oneRope({ seconds: 4 }) }, { feet: () => ({ foot: 'right', share }), late: 0 }).time;
  const [low, middle, whole, more] = [seconds(0.45), seconds(0.7), seconds(1), seconds(2)];
  assert.ok(low > middle && middle > whole, `${low}, ${middle}, ${whole}`);
  near(low, 4 / (WALK.slowest + (1 - WALK.slowest) * (0.05 / 0.6)) + WALK.stepSeconds, 0.8);
  near(more, whole, 0.3);
});

test('a foot that’s hardly off the floor doesn’t count, and it has to come well down again to count as down', () => {
  const low = walk({ plan: oneRope() }, { feet: () => ({ foot: 'right', share: 0.3 }), seconds: 8 });
  assert.equal(low.game.state, 'roof', 'under what counts, the walker stays on the roof');
  // Up, and then sagging to a third of the way: still gliding.
  const sagging = walk({ plan: oneRope({ seconds: 6 }) }, { feet: (game, time) => ({ foot: 'right', share: time < 1.5 ? 1 : 0.3 }), until: (game, time) => time > 4 });
  assert.equal(sagging.game.gliding, true);
  assert.ok(!sagging.types.includes('down'));
  const down = walk({ plan: oneRope({ seconds: 6 }) }, { feet: (game, time) => ({ foot: 'right', share: time < 1.5 ? 1 : 0.15 }), until: (game, time) => time > 4 });
  assert.equal(down.game.gliding, false);
});

test('with both feet down on the rope the walker stops and wobbles, and balancing again steadies it', () => {
  // Up for two seconds, down for four, and up again.
  const { game, events } = walk({ plan: oneRope({ seconds: 8 }), wobble: 'later' }, {
    feet: (ride, time) => (time < 2 || time > 6 ? { foot: 'right', share: 1 } : null),
    until: (ride, time) => time > 6.2,
  });
  assert.equal(game.state, 'rope');
  near(game.wobble, 4 / WOBBLES.later, 0.08, 'four seconds of standing');
  near(game.progress, 2 / 8, 0.06, 'and it has gone no further than it had');
  assert.equal(game.stats.falls, 0);
  assert.ok(types(events).includes('down'));
  const steadied = walk({ plan: oneRope({ seconds: 8 }), wobble: 'later' }, {
    feet: (ride, time) => (time < 2 || time > 6 ? { foot: 'right', share: 1 } : null),
    until: (ride, time) => time > 8.4,
  });
  assert.ok(steadied.game.wobble < 0.05, `two seconds of balancing took it away: ${steadied.game.wobble}`);
});

test('standing on the rope too long, the walker drops into the net and goes back to the rooftop the rope started from, with nothing else lost', () => {
  const plan = planOf([{ seconds: 3 }, { seconds: 8, leg: 'left', things: [{ kind: 'star', at: 0.2 }] }, { seconds: 3 }]);
  let fellAt = null;
  const { game, events } = walk({ plan, wobble: 'soon' }, {
    // Across the first rope, a quarter of the way along the second, and then both feet down.
    feet: (ride) => (ride.index === 1 && ride.progress > 0.3 && ride.stats.falls === 0 ? null : { foot: ride.asked, share: 1 }),
    until: (ride, time) => {
      if (ride.state === 'falling' && fellAt === null) fellAt = { time, progress: ride.progress, stars: ride.stats.stars };
      return false;
    },
  });
  assert.ok(fellAt, 'it fell');
  assert.deepEqual(types(events).filter((type) => ['fall', 'back'].includes(type)), ['fall', 'back']);
  assert.equal(game.stats.falls, 1);
  // The first rope stayed crossed, the star already caught stayed caught, and the game went on to its end.
  assert.equal(game.state, 'finished');
  assert.equal(game.stats.crossed, 3);
  assert.equal(game.stats.stars, 1, 'the star is not counted twice');
  assert.equal(fellAt.stars, 1);
});

test('a rope that has dropped the walker twice doesn’t drop it again: a child who can only hold for a moment still gets across', () => {
  // Half a second up, three seconds down, over and over: not long enough to cross before the wobble wins.
  const plan = () => planOf([{ seconds: 5 }, { seconds: 5, leg: 'left' }]);
  const feet = (ride, time) => (ride.state === 'roof' || time % 3.5 < 0.5 ? { foot: ride.asked, share: 1 } : null);
  const { game, time } = walk({ plan: plan(), wobble: 'soon' }, { feet, seconds: 600 });
  assert.equal(game.state, 'finished', `got across, in ${Math.round(time)} seconds`);
  // Two drops from each rope, and no more.
  assert.equal(game.stats.falls, WALK.fallsMost * 2);
  assert.equal(game.stats.crossed, 2);
  // With no end to the drops, they'd have been on the first rope for ever.
  const mostDrops = WALK.fallsMost;
  WALK.fallsMost = Infinity;
  try {
    const stuck = walk({ plan: plan(), wobble: 'soon' }, { feet, seconds: 200 });
    assert.equal(stuck.game.index, 0);
    assert.ok(stuck.game.stats.falls > 5);
  } finally {
    WALK.fallsMost = mostDrops;
  }
});

test('how soon the walker falls is the grown-ups’ setting, and it can be never', () => {
  const fallsAfter = (wobble) => {
    const { game, time } = walk({ plan: oneRope({ seconds: 20 }), wobble }, {
      feet: (ride, at) => (at < 2 ? { foot: 'right', share: 1 } : null),
      until: (ride) => ride.stats.falls > 0,
      seconds: 40,
    });
    return game.stats.falls ? time - 2 : null;
  };
  near(fallsAfter('soon'), WOBBLES.soon, 0.8);
  near(fallsAfter('later'), WOBBLES.later, 0.8);
  assert.equal(fallsAfter('never'), null, 'with never, the walker waits on the rope for ever');
  assert.ok(WOBBLES.soon < WOBBLES.later);
});

/* A child who gets onto every rope and then can't keep the foot up: half a second up, three seconds down. */
const cantHold = (ride, time) => (ride.state === 'roof' || time % 3.5 < 0.5 ? { foot: ride.asked, share: 1 } : null);

test('a crossing has so many drops into the net, as a grown-up chooses: after the last of them the walker stays down, and it’s over', () => {
  // Two drops from the first rope, across it once it has stopped dropping them, and a third from the second.
  const plan = planOf([{ seconds: 4 }, { seconds: 4, leg: 'left' }, { seconds: 4 }]);
  const last = [];
  const { game, events, time } = walk({ plan, wobble: 'soon', drops: 'three' }, {
    feet: cantHold,
    seconds: 600,
    until: (ride) => {
      if (ride.state === 'falling') last[ride.stats.falls] = ride.lastDrop;
      return false;
    },
  });
  assert.equal(game.state, 'lost');
  assert.equal(game.stats.falls, DROPS.three);
  assert.equal(game.dropsLeft, 0);
  // Only the third is the one it doesn't come back up from.
  assert.deepEqual(last.slice(1), [false, false, true]);
  assert.equal(game.lastDrop, false, 'and that one is over');
  // Back up twice, and not the third time. That it's over is said once.
  assert.deepEqual(types(events).filter((type) => ['fall', 'back', 'lost', 'finished'].includes(type)), ['fall', 'back', 'fall', 'back', 'fall', 'lost']);
  assert.equal(game.index, 1, 'in the net under the second rope');
  assert.equal(game.stats.crossed, 1);
  near(game.stats.seconds, time, 0.2, 'how long it lasted is kept for the card');
  // Nothing more happens, whatever the child does: the foot the rope was for held up, and then the other.
  const all = () => JSON.stringify([game.state, game.index, game.progress, game.elapsed, game.stats]);
  const before = all();
  const lifter = measuredLifter();
  for (let n = 0; n < 300; n += 1) {
    lifter.update(valueFor(lifter, n < 150 ? game.asked : otherLeg(game.asked), 1), STEP);
    game.update(STEP, lifter, []);
  }
  assert.equal(all(), before);
  assert.equal(events.filter(({ type }) => type === 'lost').length, 1);
});

test('five drops can be chosen instead, or any number, which is how the rules come: then the walker always goes back up', () => {
  const plan = () => planOf([{ seconds: 4 }, { seconds: 4, leg: 'left' }, { seconds: 4 }, { seconds: 4, leg: 'left' }]);
  const five = walk({ plan: plan(), wobble: 'soon', drops: 'five' }, { feet: cantHold, seconds: 900 });
  assert.equal(five.game.state, 'lost');
  assert.equal(five.game.stats.falls, DROPS.five);
  assert.equal(five.game.index, 2, 'two from each of the first two ropes, and the fifth from the third');
  // Any number: two from every rope, and all the way across. It's what an unknown choice is taken as, too.
  for (const drops of ['any', undefined, 'nonsense']) {
    const any = walk({ plan: plan(), wobble: 'soon', ...(drops ? { drops } : {}) }, { feet: cantHold, seconds: 900 });
    assert.equal(any.game.state, 'finished', String(drops));
    assert.equal(any.game.stats.falls, WALK.fallsMost * 4);
    assert.equal(any.game.dropsLeft, Infinity);
    assert.equal(any.game.lastDrop, false);
    assert.equal(any.types.includes('lost'), false);
  }
  assert.deepEqual(DROPS, { three: 3, five: 5, any: Infinity });
});

test('a drop or two on the way is not the end of a crossing: it’s finished with the drops that are left', () => {
  const plan = planOf([{ seconds: 4 }, { seconds: 4, leg: 'left' }, { seconds: 4 }]);
  // Both feet down on the second rope until it has dropped the walker twice, and a foot held up for the rest.
  const { game, types: happened } = walk({ plan, wobble: 'soon', drops: 'three' }, {
    feet: (ride) => (ride.index === 1 && ride.state === 'rope' && ride.stats.falls < 2 ? null : { foot: ride.asked, share: 1 }),
  });
  assert.equal(game.state, 'finished');
  assert.equal(game.stats.crossed, 3);
  assert.equal(game.stats.falls, 2);
  assert.equal(game.dropsLeft, 1);
  assert.equal(happened.includes('lost'), false);
  // And a child who holds the foot up all the way has them all at the end, at every level.
  for (const level of [1, 5, 10]) {
    const steady = walk({ level, ropes: 4, hold: 'short', drops: 'three', random: seeded(level) });
    assert.equal(steady.game.state, 'finished', `level ${level}`);
    assert.equal(steady.game.dropsLeft, DROPS.three, `level ${level}`);
  }
});

test('with nobody in the picture nothing happens: the walker neither goes on nor wobbles, and carries on when they’re back', () => {
  const { game } = walk({ plan: oneRope({ seconds: 6 }), wobble: 'soon' }, {
    feet: () => ({ foot: 'right', share: 1 }),
    seen: (ride, time) => time < 2 || time > 14,
  });
  assert.equal(game.state, 'finished');
  assert.equal(game.stats.falls, 0, 'twelve seconds away is not a fall');
  const away = walk({ plan: oneRope({ seconds: 6 }), wobble: 'soon' }, { feet: () => ({ foot: 'right', share: 1 }), seen: (ride, time) => time < 2, until: (ride, time) => time > 10 });
  assert.equal(away.game.state, 'rope');
  assert.equal(away.game.hint, null, 'and nothing is asked of nobody');
  assert.ok(away.game.wobble < 0.05);
});

test('the other foot up, on a rope that’s for this one, is not a fall: the walker waits and asks for the other foot', () => {
  const { game } = walk({ plan: oneRope({ seconds: 6, leg: 'left' }), wobble: 'soon' }, {
    feet: (ride, time) => ({ foot: time < 2 ? 'left' : 'right', share: 1 }),
    until: (ride, time) => time > 12,
  });
  assert.equal(game.state, 'rope');
  assert.equal(game.stats.falls, 0);
  assert.equal(game.hint, 'other');
  assert.equal(game.wrongFoot, true);
  near(game.progress, 2 / 6, 0.1, 'and goes no further');
  // Changing feet, both were down for a moment, and the walker wobbled a little. Standing on the other leg
  // is balancing too, and steadies it again.
  assert.equal(game.wobble, 0);
  // On a rope for either foot, either does, and the walker lifts the same one.
  const either = walk({ plan: oneRope({ leg: 'any' }) }, { feet: () => ({ foot: 'left', share: 1 }), until: (ride) => ride.state === 'rope' });
  assert.equal(either.game.foot, 'left');
  assert.equal(walk({ plan: oneRope({ leg: 'any' }) }, { feet: () => ({ foot: 'right', share: 1 }) }).game.state, 'finished');
});

test('a child whose foot comes off the floor, but not far enough, has a whole lift come down to meet them', () => {
  // Their left foot only comes 3% of their height off the floor, and a whole lift, unmeasured, is 7%.
  const { game, lifter } = walk({ plan: planOf([{ leg: 'left', seconds: 3 }, { leg: 'left', seconds: 3 }]) }, { feet: () => ({ foot: 'left', height: 0.03 }), best: null });
  assert.ok(game.stats.eased.left >= 1 && game.stats.eased.left <= 3, `the left came down: ${game.stats.eased.left} times`);
  assert.equal(game.stats.eased.right, 0, 'the right was left alone');
  assert.ok(lifter.reachOf('left') < lifter.reachOf('right'));
  assert.equal(game.state, 'finished', 'and they got across');
  // A foot flat on the floor is resting, not trying.
  const resting = walk({ plan: oneRope() }, { feet: () => null, seconds: 20 });
  assert.deepEqual(resting.game.stats.eased, { left: 0, right: 0 });
  // A warm-up done again, as when a grown-up has the body checked again, starts from what it measures.
  const again = measuredLifter('medium', 0.1);
  const whole = again.reachOf('left');
  assert.equal(again.ease('left'), true);
  assert.equal(again.ease('left'), true);
  assert.ok(again.reachOf('left') < whole * 0.75);
  again.measured('left', 0.1);
  near(again.reachOf('left'), whole, 1e-9, 'a whole lift is most of what was measured again');
});

test('holds are counted and timed for the finish: how many with each foot, for how long, the longest and the highest', () => {
  const plan = planOf([{ leg: 'left', seconds: 3 }, { leg: 'right', seconds: 6 }]);
  const { game } = walk({ plan }, { height: 1.3 });
  assert.deepEqual(game.stats.holds, { left: 1, right: 1 });
  assert.ok(game.stats.holdSeconds.right > game.stats.holdSeconds.left + 2, 'the longer rope is the longer hold');
  near(game.stats.longest, game.stats.holdSeconds.right, 0.01);
  near(game.stats.highest.left, 1.3, 0.08);
  assert.ok(game.stats.seconds > 9);
});

/* ------------------------------- what each level brings ------------------------------- */

test('level 2: the stars along a rope are caught as the walker glides past them', () => {
  const { game, types: seen } = walk({ plan: oneRope({ things: [{ kind: 'star', at: 0.25 }, { kind: 'star', at: 0.5 }, { kind: 'star', at: 0.75 }] }) }, {
    until: (ride) => ride.progress > 0.6,
  });
  assert.equal(game.stats.stars, 2, 'two of the three so far');
  assert.equal(seen.filter((type) => type === 'star').length, 2);
});

test('level 3: a balloon pops for a foot held higher than a whole lift as the walker goes under it, and is missed for nothing otherwise', () => {
  const plan = () => oneRope({ seconds: 6, things: [{ kind: 'balloon', at: 0.4 }, { kind: 'balloon', at: 0.7 }] });
  const high = walk({ plan: plan() }, { height: HIGHER + 0.15 });
  assert.equal(high.game.stats.balloons, 2);
  const usual = walk({ plan: plan() }, { height: 1 });
  assert.equal(usual.game.stats.balloons, 0);
  assert.equal(usual.game.state, 'finished', 'and the rope is crossed all the same');
  assert.deepEqual(usual.types.filter((type) => ['pop', 'missed'].includes(type)), ['missed', 'missed']);
  // Higher for the first, and back to a whole lift for the second.
  const one = walk({ plan: plan() }, { feet: (game) => ({ foot: 'right', share: game.progress < 0.5 ? HIGHER + 0.15 : 1 }) });
  assert.equal(one.game.stats.balloons, 1);
});

test('level 4: a bird rides across on a walker whose foot stays up, and flies off one that puts it down', () => {
  const plan = () => oneRope({ seconds: 6, things: [{ kind: 'bird', at: 0.15, to: 0.9 }] });
  const steady = walk({ plan: plan() });
  assert.equal(steady.game.stats.feathers, 1);
  assert.deepEqual(steady.types.filter((type) => type.startsWith('bird') || type === 'feather'), ['bird', 'feather']);
  // A foot put down for a second in the middle.
  let downAt = null;
  const dropped = walk({ plan: plan() }, {
    feet: (game, time) => {
      if (downAt === null && game.progress > 0.4) downAt = time;
      return downAt !== null && time < downAt + 1 ? null : { foot: 'right', share: 1 };
    },
  });
  assert.equal(dropped.game.stats.feathers, 0);
  assert.deepEqual(dropped.types.filter((type) => type.startsWith('bird') || type === 'feather'), ['bird', 'bird-off']);
  assert.equal(dropped.game.state, 'finished', 'and the rope is crossed all the same');
});

test('level 5: half way along, the rope is for the other foot, and the walker waits at the flag until it’s up', () => {
  const plan = () => oneRope({ leg: 'right', seconds: 6, things: [{ kind: 'swap', at: 0.5 }] });
  const stays = walk({ plan: plan(), wobble: 'never' }, { feet: () => ({ foot: 'right', share: 1 }), seconds: 14 });
  near(stays.game.progress, 0.5, 1e-6, 'with the same foot up, it stays at the flag');
  assert.equal(stays.game.leg, 'left');
  assert.equal(stays.game.hint, 'other');
  const swaps = walk({ plan: plan() });
  assert.equal(swaps.game.state, 'finished');
  assert.deepEqual(swaps.game.stats.holds, { left: 1, right: 1 });
  assert.ok(swaps.types.includes('swap'));
  // Level 5's ropes have the flag, the first of them for sure. Where the child lifts whichever foot they like
  // there's no other foot to change to, and no flag.
  const flags = (which) => layOut({ level: 5, which, random: seeded(3) }).ropes.filter(({ things }) => things.some(({ kind }) => kind === 'swap')).length;
  assert.ok(flags('turns') >= 2);
  assert.ok(layOut({ level: 5, which: 'turns', random: seeded(3) }).ropes[0].things.some(({ kind }) => kind === 'swap'));
  assert.equal(flags('any'), 0);
});

test('level 6: at a red light the walker waits, a foot put down there is a rest well taken, and nothing wobbles', () => {
  const plan = () => oneRope({ seconds: 6, things: [{ kind: 'light', at: 0.5, seconds: 3 }] });
  // Keeping the foot up all the way: the walker still waits out the red.
  const through = walk({ plan: plan(), wobble: 'soon' }, { feet: () => ({ foot: 'right', share: 1 }), late: 0 });
  near(through.time, 6 + 3 + WALK.stepSeconds, 0.8, 'three seconds longer than the rope');
  assert.equal(through.game.stats.rests, 0);
  assert.deepEqual(through.types.filter((type) => ['red', 'green', 'rested'].includes(type)), ['red', 'green']);
  // Resting at it, as the pretend child does: a rest counted, and no wobble for it.
  let most = 0;
  const rested = walk({ plan: plan(), wobble: 'soon' }, {
    until: (game) => {
      if (game.light && game.light.left > 0) most = Math.max(most, game.wobble);
      return false;
    },
  });
  assert.equal(rested.game.stats.rests, 1);
  assert.equal(most, 0);
  assert.equal(rested.game.stats.falls, 0);
  assert.equal(rested.game.state, 'finished');
});

test('level 7: on a rope that climbs, a foot only just up hardly moves the walker, and one at a whole lift climbs as fast as ever', () => {
  const seconds = (climb, share) => walk({ plan: oneRope({ seconds: 4, climb }), wobble: 'never' }, { feet: () => ({ foot: 'right', share }), late: 0 }).time;
  near(seconds(true, 1), seconds(false, 1), 0.1, 'a whole lift');
  assert.ok(seconds(true, 0.45) > seconds(false, 0.45) * 1.8, 'only just up');
});

test('level 8: on the long rope, a foot put down by the post steps onto it, and there the walker can rest as long as it likes', () => {
  const plan = () => oneRope({ seconds: 10, long: true, things: [{ kind: 'post', at: 0.5 }] });
  const { game } = walk({ plan: plan(), wobble: 'soon' }, {
    // Down a little before the post, and staying down for a long time.
    feet: (ride, time) => (ride.progress < 0.46 || time > 30 ? { foot: 'right', share: 1 } : null),
    until: (ride, time) => time > 29,
  });
  assert.equal(game.state, 'rope');
  near(game.progress, 0.5, 0.005, 'on the post');
  assert.equal(game.safe, true);
  assert.equal(game.stats.falls, 0, 'twenty seconds and more on the post is not a fall');
  // A child sees the walker get to the post, and then puts the foot down: a little past it, the walker steps
  // back onto it.
  const past = walk({ plan: plan(), wobble: 'soon' }, { feet: (ride) => (ride.progress < 0.5 ? { foot: 'right', share: 1 } : null), until: (ride, time) => time > 25 });
  assert.ok(past.types.includes('post'));
  near(past.game.progress, 0.5, 0.005, 'back on the post');
  assert.equal(past.game.stats.falls, 0);
  // Well past it, there's no going back.
  const beyond = walk({ plan: plan(), wobble: 'soon' }, { feet: (ride) => (ride.progress < 0.5 + WALK.postPast + 0.03 ? { foot: 'right', share: 1 } : null), until: (ride) => ride.stats.falls > 0, seconds: 40, late: 0 });
  assert.equal(beyond.game.stats.falls, 1);
  // Anywhere else on the rope it would have been.
  const elsewhere = walk({ plan: plan(), wobble: 'soon' }, { feet: (ride) => (ride.progress < 0.3 ? { foot: 'right', share: 1 } : null), until: (ride) => ride.stats.falls > 0, seconds: 40 });
  assert.equal(elsewhere.game.stats.falls, 1);
});

test('level 9: in a gust of wind the walker is slowed, and holding on gets through it', () => {
  const calm = walk({ plan: oneRope({ seconds: 5 }) }, { feet: () => ({ foot: 'right', share: 1 }), late: 0 });
  const windy = walk({ plan: oneRope({ seconds: 5, things: [{ kind: 'gust', at: 0.35, to: 0.65 }] }) }, { feet: () => ({ foot: 'right', share: 1 }), late: 0 });
  near(windy.time - calm.time, (0.3 * 5) / WALK.gust - 0.3 * 5, 0.5, 'the windy part takes over three times as long');
  assert.ok(windy.types.includes('gust'));
  assert.equal(windy.game.state, 'finished');
  assert.equal(windy.game.stats.falls, 0);
});

test('level 10: the cup is won at the last rooftop, and only at level 10', () => {
  const { game, types: seen } = walk({ plan: planOf([{}], { cup: true }) });
  assert.equal(game.stats.cup, true);
  assert.ok(seen.indexOf('cup') >= 0 && seen.indexOf('cup') < seen.indexOf('finished'));
  assert.equal(walk({ plan: planOf([{}]) }).game.stats.cup, false);
  assert.equal(layOut({ level: 10, random: seeded(1) }).rules.cup, true);
  assert.equal(layOut({ level: 9, random: seeded(1) }).rules.cup, false);
});

/* ------------------------------- crossing together ------------------------------- */

test('crossing together, a walker who’s in front waits on the rooftop for the others, and against each other nobody waits', () => {
  const plan = () => planOf([{ seconds: 3 }, { seconds: 3, leg: 'left' }]);
  // A friend who's still on the first rope.
  const waits = walk({ plan: plan(), team: true }, { mates: () => [{ index: 0, progress: 0.4 }], seconds: 20 });
  assert.equal(waits.game.state, 'roof');
  assert.equal(waits.game.index, 1, 'across the first rope, and waiting there');
  assert.equal(waits.game.stats.falls, 0);
  // The child is told to wait, and no foot is asked for, whether theirs is up or down.
  assert.equal(waits.game.hint, 'wait');
  assert.ok(waits.types.includes('crossed') && !waits.types.includes('finished'));
  // On the first rooftop, with everyone level, nobody is waited for: the foot is asked for.
  const level = walk({ plan: plan(), team: true }, { feet: () => null, mates: () => [{ index: 0, progress: 0 }], seconds: 3 });
  assert.equal(level.game.hint, level.game.asked);
  // Once they've caught up, on it goes.
  const hints = new Set();
  const together = walk({ plan: plan(), team: true }, {
    mates: (game, time) => {
      if (time > 13) hints.add(game.hint);
      return [{ index: time > 12 ? 1 : 0, progress: 0 }];
    },
  });
  assert.equal(together.game.state, 'finished');
  assert.ok(together.time > 12);
  assert.ok(!hints.has('wait'), 'and nothing more is said about waiting');
  // A friend who has gone holds nobody up, and in a race nobody waits for anybody.
  assert.equal(walk({ plan: plan(), team: true }, { mates: () => [{ index: 0, progress: 0.4, gone: true }] }).game.state, 'finished');
  assert.equal(walk({ plan: plan(), team: false }, { mates: () => [{ index: 0, progress: 0.4 }] }).game.state, 'finished');
});

test('feet that are still and on the floor are settled, and a foot that’s up or moving is not', () => {
  const lifter = measuredLifter();
  assert.equal(lifter.settled, false, 'nothing seen yet');
  settled(lifter, 0.004, 3);
  assert.equal(lifter.settled, true, 'standing still, about level');
  // A foot on its way up: the reading is moving, though it hasn't been up for long enough to show in the
  // slow average, which is still about level.
  settled(lifter, 0.03, 0.1);
  assert.ok(Math.abs(lifter.slow - lifter.zero) < LIFT.dead, 'the slow average is still about level');
  assert.equal(lifter.settled, false, 'on its way up');
  // Up, however little: over what counts as on the floor.
  settled(lifter, 0.03, 4);
  assert.equal(lifter.settled, false);
  // Down again: not until the feet have been still for a moment.
  lifter.update(0.004, STEP);
  assert.equal(lifter.settled, false, 'only just down');
  settled(lifter, 0.004, 4);
  assert.equal(lifter.settled, true);
  lifter.update(null, 1);
  assert.equal(lifter.settled, false, 'nobody to see');
});

test('standing still on a rooftop with both feet down is taken as level again, so a child who shifts how they stand starts the next rope from there', () => {
  const lifter = measuredLifter();
  const game = new Walk({ plan: planOf([{ seconds: 3 }, { seconds: 3 }]), lifter });
  game.begin();
  // The child has shuffled a foot back a little: the camera now sees it a hundredth of their height higher.
  const shifted = 0.01;
  for (let time = 0; time < 4; time += STEP) {
    lifter.update(shifted, STEP);
    game.update(STEP, lifter);
  }
  assert.equal(game.state, 'roof');
  near(lifter.zero, shifted, 0.002, 'level is where the feet are now');
  // So each foot has as far to go as the other.
  settled(lifter, shifted + 0.05, 1);
  near(lifter.heightOf('right'), 0.05, 0.003);
  settled(lifter, shifted - 0.05, 1);
  near(lifter.heightOf('left'), 0.05, 0.003);
  // It's taken once on a rooftop: a foot that creeps up afterwards isn't followed.
  settled(lifter, shifted, 2);
  for (let time = 0; time < 6; time += STEP) {
    lifter.update(shifted + Math.min(0.011, time * 0.004), STEP);
    game.update(STEP, lifter);
  }
  near(lifter.zero, shifted, 0.002, 'and level stays where it was taken');
});

test('a foot held up on a rooftop, however low, is never taken as level: it’s a child trying, and the rope comes down to meet them', () => {
  const lifter = measuredLifter();
  const game = new Walk({ plan: planOf([{ seconds: 3, leg: 'right' }]), lifter });
  game.begin();
  const low = valueFor(lifter, 'right', 0.25);
  for (let time = 0; time < 4; time += STEP) {
    lifter.update(low, STEP);
    game.update(STEP, lifter);
  }
  assert.equal(lifter.zero, 0);
  assert.ok(game.stats.eased.right >= 1);
  assert.ok(lifter.up.right > 0.25, 'and what they hold counts for more than it did');
});
