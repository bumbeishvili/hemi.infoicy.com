// Moto Mountain's rules, with no screen or camera: how a lean is read from a body, how the child's own lean is
// learnt, how a road is laid out at each level, and what a ride does with a child who leans well, too little,
// too much, the wrong way, or not at all. The riders are pretend children: see moto-rider.js.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { BEND_COUNTS, BIKE, HELP, LEAN, Leaner, NEW_THINGS, PACES, ROAD, Ride, STEER, WARM, Warmup, layOut, leanOf, newAt, rideLevel, rollFor, thingsUpTo, turnOf } from '../../games/moto-mountain/ride.js';
import { FULL_CURVE, curveAt, nearestApproach, nearestTo, placeAt, shapeOf } from '../../games/moto-mountain/road.js';
import { RAD, STEP, angleFor, bodyLeaning, measuredLeaner, planOf, ride, seeded } from './moto-rider.js';

const near = (actual, expected, within, message) => assert.ok(Math.abs(actual - expected) <= within, `${message ?? ''} expected about ${expected}, got ${actual}`);
const types = (events) => events.map(({ type }) => type);
/** A leaner fed a steady body for a while, as when a child holds still. */
function settled(leaner, degrees, seconds = 1.5) {
  for (let time = 0; time < seconds; time += STEP) leaner.update(degrees === null ? null : degrees * RAD, STEP);
  return leaner;
}

/* ------------------------------- reading a lean ------------------------------- */

test('a body leaning to its right reads as a lean to the right, by as much as it leans, and to the left the other way', () => {
  near(leanOf(bodyLeaning(0)), 0, 0.001, 'upright');
  near(leanOf(bodyLeaning(12)) / RAD, 12, 0.2, 'leaning right');
  near(leanOf(bodyLeaning(-12)) / RAD, -12, 0.2, 'leaning left');
  near(leanOf(bodyLeaning(25)) / RAD, 25, 0.3, 'leaning a long way');
});

test('a body bending at the waist reads the same as one leaning all in a piece', () => {
  near(leanOf(bodyLeaning(12, { whole: false })) / RAD, 12, 0.3);
  near(leanOf(bodyLeaning(-18, { whole: false })) / RAD, -18, 0.4);
});

test('with the hips hidden, as behind a table, the shoulders alone say how far the body leans', () => {
  near(leanOf(bodyLeaning(12, { hips: false })) / RAD, 12, 0.2);
  near(leanOf(bodyLeaning(-9, { hips: false })) / RAD, -9, 0.2);
});

test('a body standing to one side of the picture, upright, is not leaning', () => {
  near(leanOf(bodyLeaning(0, { middle: 0.2 })), 0, 0.001);
  near(leanOf(bodyLeaning(0, { middle: 0.8 })), 0, 0.001);
  near(leanOf(bodyLeaning(10, { middle: 0.25 })) / RAD, 10, 0.2);
});

test('with no shoulders to go by there is no lean to read, and nobody is nobody', () => {
  assert.equal(leanOf(bodyLeaning(12, { shoulders: false })), null);
  assert.equal(leanOf(null), null);
  assert.equal(leanOf({ image: null }), null);
});

/* ------------------------------- reading a lean, on real footage ------------------------------- */

// What the real tracker reported for footage of a person bending sideways at the waist: see the file's "about".
const footage = JSON.parse(readFileSync(new URL('../fixtures/moto-mountain-leans.json', import.meta.url)));
const ASPECT = footage.width / footage.height;
/** The body the tracker reported in one frame, with its hips as they were, or hidden. */
function bodyIn(frame, { hips = true } = {}) {
  const image = [];
  footage.points.forEach((index, n) => {
    const [x, y, z, visibility] = frame.image[n];
    image[index] = { x, y, z, visibility: !hips && index >= 23 ? 0.1 : visibility };
  });
  return { image };
}
/** How far the person in the footage is bent, in degrees at the top of the spine, in the part that's a dial. */
const bendAt = (t) => (t - 6) * 4;
const dial = footage.frames.filter(({ t }) => t >= 1.2 && t < 11);
const between = (from, to) => footage.frames.filter(({ t }) => t >= from && t < to);
/** The straight line that fits what was read best: how much is read for each degree of bend, and how far off it any reading is. */
function fit(read) {
  const pairs = dial.map((frame) => [bendAt(frame.t), read(frame) / RAD]);
  const meanBend = pairs.reduce((sum, [bend]) => sum + bend, 0) / pairs.length;
  const meanRead = pairs.reduce((sum, [, seen]) => sum + seen, 0) / pairs.length;
  const slope = pairs.reduce((sum, [bend, seen]) => sum + (bend - meanBend) * (seen - meanRead), 0) / pairs.reduce((sum, [bend]) => sum + (bend - meanBend) ** 2, 0);
  const worst = Math.max(...pairs.map(([bend, seen]) => Math.abs(seen - (meanRead + slope * (bend - meanBend)))));
  return { slope, worst, at: (bend) => meanRead + slope * (bend - meanBend) };
}

test('on real footage of a person bending at the waist, the lean is read the right way, and goes evenly with the bend', () => {
  const line = fit((frame) => leanOf(bodyIn(frame), ASPECT));
  // A little under half the bend at the top of the spine, all the way from 20 degrees one way to 20 the other.
  assert.ok(line.slope > 0.35 && line.slope < 0.55, `${line.slope} degrees read for each degree of bend`);
  assert.ok(line.worst < 1.6, `never more than ${line.worst} degrees off the line`);
  assert.ok(line.at(-16) < -5 && line.at(16) > 5, 'to the left reads as left, and to the right as right');
  near(Math.abs(line.at(-16)), line.at(16), 1.5, 'and the same bend each way reads as the same lean');
});

test('on real footage, with the hips hidden the lean is read from the shoulders alone, and still goes evenly with the bend', () => {
  const line = fit((frame) => leanOf(bodyIn(frame, { hips: false }), ASPECT));
  assert.ok(line.slope > 0.45 && line.slope < 0.7, `${line.slope} degrees read for each degree of bend`);
  assert.ok(line.worst < 2.6, `never more than ${line.worst} degrees off the line`);
  // The shoulders tip further than the line from the hips does, so they read a little more by themselves.
  assert.ok(line.slope > fit((frame) => leanOf(bodyIn(frame), ASPECT)).slope);
});

test('on real footage, hips that come and go at the edge of the picture never jolt the lean', () => {
  // A lean held still, with the hips in the picture all the time, and with them flickering in and out.
  const held = between(14.3, 16.4);
  const swing = (hipsIn) => {
    const leaner = new Leaner();
    const angles = held.map((frame, index) => {
      leaner.read(bodyIn(frame, { hips: hipsIn(index) }), ASPECT, 1 / footage.fps);
      return leaner.angle / RAD;
    }).slice(8);
    return Math.max(...angles) - Math.min(...angles);
  };
  const steady = swing(() => true);
  const flickering = swing((index) => Math.floor(index / 4) % 2 === 0);
  assert.ok(steady < 0.8, `held still, the reading moves by ${steady} degrees`);
  assert.ok(flickering < steady + 0.45, `with the hips coming and going it moves by ${flickering}, against ${steady} with them there`);
});

test('on real footage of a person leaning to each side and holding it, the warm-up measures each side', () => {
  const events = [];
  const leaner = new Leaner();
  for (const frame of between(12.2, 13)) leaner.read(bodyIn(frame), ASPECT, 1 / footage.fps);
  leaner.restHere();
  const warmup = new Warmup({ leaner, sides: ['right', 'left'], onEvent: (event) => events.push(event) });
  for (const frame of between(13, 24)) {
    leaner.read(bodyIn(frame), ASPECT, 1 / footage.fps);
    warmup.update(1 / footage.fps);
  }
  assert.equal(warmup.done, true);
  assert.deepEqual(types(events), ['measured', 'side', 'measured', 'done']);
  // A bend of 16 degrees each way, read as about 7.
  near(leaner.best.right / RAD, 7, 1.6, 'to the right');
  near(leaner.best.left / RAD, 7, 1.6, 'to the left');
  near(leaner.reachOf('left') / RAD, (leaner.best.left / RAD) * LEAN.ofBest, 0.01);
});

/* ------------------------------- the child's own lean ------------------------------- */

test('around upright nothing counts, and past that the lean grows smoothly up to a whole one', () => {
  const leaner = measuredLeaner('medium');
  assert.equal(settled(leaner, 0).share, 0);
  assert.equal(settled(leaner, 1.5).share, 0, 'a body a little crooked rides straight');
  assert.equal(settled(leaner, -1.5).share, 0);
  const small = settled(leaner, 4).share;
  const more = settled(leaner, 8).share;
  assert.ok(small > 0.05 && small < more, `a small lean is a small share: ${small}, ${more}`);
  near(settled(leaner, LEAN.full.medium).share, 1, 0.01, 'the whole lean');
  near(settled(leaner, -LEAN.full.medium).share, -1, 0.01, 'and to the left');
  assert.ok(settled(leaner, 40).share <= LEAN.most, 'a lean past a whole one is not much more than one');
});

test('how big a lean has to be is the grown-ups’ setting', () => {
  const shares = Object.keys(LEAN.full).map((size) => settled(measuredLeaner(size), 7).share);
  for (let i = 1; i < shares.length; i += 1) assert.ok(shares[i] < shares[i - 1], `a bigger setting makes the same lean count for less: ${shares}`);
  near(shares[0], 1, 0.01, 'at the smallest setting, seven degrees is the whole lean');
});

test('upright is wherever the child has settled, so one who sits crooked rides straight', () => {
  const leaner = settled(new Leaner(), 5, 4);
  assert.ok(leaner.share > 0.1, 'before, five degrees is a lean');
  assert.equal(leaner.restHere(), true);
  assert.equal(settled(leaner, 5).share, 0, 'after, it is upright');
  assert.ok(settled(leaner, 5 + 8).share > 0.3, 'and a lean is measured from there');
  // A child in the middle of a big lean isn't taken as upright.
  const leaning = settled(new Leaner(), 16, 4);
  assert.equal(leaning.restHere(), false);
  assert.equal(leaning.zero, 0);
});

test('one wild look from the tracker moves nothing, and the same one over and over is the child', () => {
  const leaner = settled(new Leaner(), 0);
  leaner.update(35 * RAD, STEP);
  assert.equal(leaner.share, 0, 'one look');
  leaner.update(0, STEP);
  assert.equal(leaner.share, 0);
  for (let i = 0; i < 30; i += 1) leaner.update(35 * RAD, STEP);
  assert.ok(leaner.share > 1, 'held, it counts');
});

test('with nobody to see, the lean is let go gently, and nothing is forgotten about the child', () => {
  const leaner = new Leaner();
  leaner.measured('left', 9 * RAD);
  settled(leaner, -9);
  const before = leaner.share;
  assert.ok(before < -0.9);
  leaner.update(null, STEP);
  assert.ok(leaner.share < 0 && leaner.share > before, 'it comes back a little at a time');
  assert.equal(leaner.seen, true, 'a look or two missed is not nobody');
  settled(leaner, null, 2);
  assert.equal(leaner.share, 0);
  assert.equal(leaner.seen, false);
  near(leaner.reachOf('left') / RAD, 9 * LEAN.ofBest, 0.01, 'their own lean is kept');
});

test('a whole lean to each side is most of what the child managed in the warm-up, and never more than the setting', () => {
  const leaner = new Leaner({ size: 'medium' });
  // Before the warm-up, or with it skipped, nothing is known of the child: a whole lean is a small one, or the
  // setting if that's smaller still.
  near(leaner.reachOf('left') / RAD, LEAN.unmeasured, 0.01, 'before the warm-up');
  near(new Leaner({ size: 'tiny' }).reachOf('right') / RAD, LEAN.full.tiny, 0.01, 'with a smaller setting');
  assert.ok(LEAN.unmeasured < LEAN.full.medium);
  leaner.measured('left', 8 * RAD);
  leaner.measured('right', 30 * RAD);
  near(leaner.reachOf('left') / RAD, 8 * LEAN.ofBest, 0.01, 'the weaker side asks for less');
  near(leaner.reachOf('right') / RAD, LEAN.full.medium, 0.01, 'the stronger side for no more than the setting');
  leaner.measured('left', 1 * RAD);
  near(leaner.reachOf('left') / RAD, LEAN.least, 0.01, 'and never less than can be told from wobble');
  // The same lean then counts for more on the weaker side.
  leaner.measured('left', 8 * RAD);
  const left = settled(leaner, -6).share;
  const right = settled(leaner, 6).share;
  assert.ok(-left > right + 0.2, `six degrees left ${left}, six degrees right ${right}`);
});

test('a lean eased for a child who can’t make a bend comes down a step at a time, to a floor', () => {
  const leaner = measuredLeaner('medium');
  const before = leaner.reachOf('left');
  assert.equal(leaner.ease('left'), true);
  near(leaner.reachOf('left'), before * LEAN.easedBy, 1e-9);
  near(leaner.reachOf('right'), before, 1e-9, 'the other side is left alone');
  for (let i = 0; i < 30; i += 1) leaner.ease('left');
  near(leaner.reachOf('left') / RAD, LEAN.least, 0.001);
  assert.equal(leaner.ease('left'), false, 'at the floor there is nothing more to ease');
});

/* ------------------------------- the warm-up ------------------------------- */

/** A warm-up with a body that does what's listed: [seconds, degrees] one after another. */
function warmUp(moves, { sides = WARM.sides } = {}) {
  const events = [];
  const leaner = new Leaner({ size: 'big' });
  const warmup = new Warmup({ leaner, sides, onEvent: (event) => events.push(event) });
  let body = 0;
  for (const [seconds, degrees] of moves) {
    for (let time = 0; time < seconds && !warmup.done; time += STEP) {
      if (degrees === null) leaner.update(null, STEP);
      else {
        body += (degrees - body) * (1 - Math.exp(-6 * STEP));
        leaner.update(body * RAD, STEP);
      }
      warmup.update(STEP);
    }
  }
  return { leaner, warmup, events };
}

test('the warm-up measures how far the child leans to each side, each by itself', () => {
  const { leaner, warmup, events } = warmUp([[0.5, 0], [2.5, -9], [1.5, 0], [2.5, 16], [1.5, 0], [2, 0]]);
  assert.equal(warmup.done, true);
  assert.deepEqual(types(events), ['measured', 'side', 'measured', 'done']);
  assert.equal(events[0].side, 'left');
  assert.equal(events[2].side, 'right');
  near(leaner.best.left / RAD, 9, 0.5, 'left');
  near(leaner.best.right / RAD, 16, 0.6, 'right');
  assert.ok(leaner.reachOf('left') < leaner.reachOf('right'), 'so a whole lean is less to the weaker side');
  assert.equal(events.at(-1).measured, true);
});

test('a lurch is not taken as the child’s lean: only what was held counts', () => {
  // Over to 20 degrees and straight back, within half a second, then a held lean of 8.
  const { leaner } = warmUp([[0.5, 0], [0.25, -20], [0.6, 0], [2.5, -8], [1.5, 0]], { sides: ['left'] });
  assert.ok(leaner.best.left / RAD < 9.5, `the lurch was not measured: ${leaner.best.left / RAD}`);
  assert.ok(leaner.best.left / RAD > 6.5);
});

test('leaning the wrong way, or hardly at all, measures nothing, and the warm-up moves on by itself', () => {
  const { leaner, warmup, events } = warmUp([[WARM.patience + 0.5, 12], [1, 0], [WARM.patience + 0.5, 2], [2, 0]]);
  assert.equal(warmup.done, true, 'nobody is kept waiting');
  assert.equal(leaner.best.left, null, 'leaning right when asked for left');
  assert.equal(leaner.best.right, null, 'two degrees is not a lean');
  assert.equal(events[0].best, null);
  near(leaner.reachOf('left') / RAD, LEAN.unmeasured, 0.01, 'so a whole lean is the small one of a child nobody has measured');
});

test('the warm-up can be skipped, and a child out of the picture is waited for, not measured', () => {
  const skipped = warmUp([[0.5, 0]]);
  skipped.warmup.finish(false);
  assert.equal(skipped.warmup.done, true);
  assert.equal(skipped.events.at(-1).measured, false);
  const away = warmUp([[3, null]], { sides: ['left'] });
  assert.equal(away.leaner.best.left, null);
});

/* ------------------------------- laying out a road ------------------------------- */

test('a ride has as many bends as a grown-up chose, at every level', () => {
  for (let level = 1; level <= 10; level += 1) {
    for (const bends of BEND_COUNTS) {
      const plan = layOut({ level, bends, random: seeded(level * 31 + bends) });
      assert.equal(plan.bends.length, bends, `level ${level}`);
    }
  }
  assert.equal(layOut({ bends: 99, random: seeded(1) }).bends.length, 10, 'a number that is not one of the choices');
});

test('bends go one way and then the other, and a straight comes between every two', () => {
  const plan = layOut({ level: 3, bends: 14, random: seeded(4) });
  plan.bends.forEach((bend, index) => {
    if (index) {
      assert.equal(bend.turn, -plan.bends[index - 1].turn, 'the other way from the last');
      assert.ok(bend.from - plan.bends[index - 1].to >= 40, 'with a straight to rest in');
    }
    assert.ok(bend.to - bend.from >= 50);
  });
  assert.ok(plan.bends[0].from >= ROAD.start, 'and a straight before the first');
  assert.ok(plan.length - plan.bends.at(-1).to >= ROAD.end - 1, 'and after the last');
});

test('with more bends towards the side being worked on, two in three go that way and never three running', () => {
  for (const side of ['left', 'right']) {
    const worked = side === 'left' ? -1 : 1;
    for (let seed = 1; seed <= 12; seed += 1) {
      const plan = layOut({ level: 5, bends: 14, favour: 'more', side, random: seeded(seed) });
      const towards = plan.bends.filter(({ turn }) => turn === worked).length;
      assert.ok(towards >= 9 && towards <= 10, `${towards} of 14 to the ${side}`);
      for (let i = 2; i < plan.bends.length; i += 1) {
        assert.ok(!(plan.bends[i].turn === plan.bends[i - 1].turn && plan.bends[i].turn === plan.bends[i - 2].turn), 'never three the same way running');
      }
    }
  }
});

test('the same numbers lay out the same road, so friends each get the same one', () => {
  const one = layOut({ level: 9, bends: 10, random: seeded(77) });
  const two = layOut({ level: 9, bends: 10, random: seeded(77) });
  assert.deepEqual(one, two);
  const other = layOut({ level: 9, bends: 10, random: seeded(78) });
  assert.notDeepEqual(one.bends, other.bends);
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
  assert.deepEqual(thingsUpTo(4).map(({ id }) => id), ['star', 'puddle', 'boost']);
});

test('level 1 is the plain road, and each level’s new thing is on its road, met early', () => {
  assert.deepEqual(layOut({ level: 1, random: seeded(2) }).things, []);
  const kinds = { 2: 'star', 3: 'puddle', 4: 'boost', 5: 'sheep', 6: 'bridge', 7: 'ramp', 9: 'scooter', 10: 'snow' };
  for (const [level, kind] of Object.entries(kinds)) {
    for (let seed = 1; seed <= 15; seed += 1) {
      const plan = layOut({ level: Number(level), random: seeded(seed) });
      const found = plan.things.filter((thing) => thing.kind === kind);
      assert.ok(found.length >= 2, `level ${level} has its ${kind}, more than once (seed ${seed})`);
      if (kind !== 'snow') assert.ok(found[0].at < plan.bends[2].from, `and the first comes before the third bend (seed ${seed})`);
      // Nothing from a later level.
      for (const [later, other] of Object.entries(kinds)) {
        if (Number(later) > Number(level)) assert.ok(!plan.things.some((thing) => thing.kind === other), `no ${other} at level ${level}`);
      }
    }
  }
});

test('from level 8 one bend is the big bend: most of the way round, and the lean held all the way', () => {
  for (const level of [1, 7]) assert.ok(!layOut({ level, random: seeded(3) }).bends.some(({ big }) => big));
  for (const level of [8, 9, 10]) {
    for (const favour of ['even', 'more']) {
      const plan = layOut({ level, favour, random: seeded(level) });
      const big = plan.bends.filter((bend) => bend.big);
      assert.equal(big.length, 1, `level ${level}`);
      const shape = shapeOf(plan);
      const turned = Math.abs(placeAt(shape, big[0].to).heading - placeAt(shape, big[0].from).heading) / RAD;
      near(turned, 150, 4, 'it turns');
      assert.ok(big[0].to - big[0].from > 120);
    }
  }
});

test('at level 10 the top of the road is under snow, with heaps of it to burst through where the stars were', () => {
  const plan = layOut({ level: 10, random: seeded(8) });
  assert.ok(plan.snowFrom > plan.length * 0.5 && plan.snowFrom < plan.length * 0.6);
  assert.ok(plan.snows >= 6, `${plan.snows} heaps`);
  for (const thing of plan.things) {
    if (thing.kind === 'snow') assert.ok(thing.at >= plan.snowFrom);
    if (thing.kind === 'star') assert.ok(thing.at < plan.snowFrom);
  }
  assert.equal(layOut({ level: 9, random: seeded(8) }).snowFrom, null);
});

test('with friends it is the plain road with stars and speed arrows, whatever the level', () => {
  for (const level of [1, 6, 10]) {
    const plan = layOut({ level, plain: true, random: seeded(level + 20) });
    const kinds = new Set(plan.things.map(({ kind }) => kind));
    for (const kind of kinds) assert.ok(['star', 'boost'].includes(kind), `only stars and arrows: ${kind}`);
    assert.ok(kinds.has('star'));
    assert.ok(!plan.bends.some(({ big }) => big));
    assert.equal(plan.snowFrom, null);
  }
});

test('things in a straight are well clear of the bends on either side, and never on top of each other', () => {
  for (let level = 2; level <= 10; level += 1) {
    for (let seed = 1; seed <= 10; seed += 1) {
      const plan = layOut({ level, bends: 14, random: seeded(seed * 7 + level) });
      const inBend = (s) => plan.bends.some(({ from, to }) => s > from && s < to);
      for (const thing of plan.things) {
        if (['puddle', 'boost', 'sheep', 'ramp'].includes(thing.kind)) {
          assert.ok(!inBend(thing.at - 20) && !inBend(thing.at + 14), `a ${thing.kind} has room before and after it`);
          assert.ok(Math.abs(thing.x) < ROAD.half - 1, 'and is on the tarmac');
        }
        if (thing.kind === 'bridge' || thing.kind === 'scooter') assert.ok(!inBend(thing.from - 8) && !inBend(thing.to + 8), `a ${thing.kind} is all in a straight`);
      }
      const features = plan.things.filter(({ kind }) => !['star', 'snow'].includes(kind));
      features.forEach((thing, index) => {
        if (index) assert.ok(thing.at - features[index - 1].at > 60, 'one thing to a straight');
      });
    }
  }
});

test('level 10 is never much longer than level 1, and leaves most of level 1’s time to see what’s coming', () => {
  const mean = (level) => {
    let sum = 0;
    for (let seed = 1; seed <= 40; seed += 1) sum += layOut({ level, random: seeded(seed) }).length;
    return sum / 40;
  };
  // A tighter bend takes longer to come on, so the road is longer, and the bike is faster: what counts is the time.
  const ratio = (mean(10) / rideLevel(10).cruise) / (mean(1) / rideLevel(1).cruise);
  assert.ok(ratio < 1.33, `level 10 takes ${ratio} times as long as level 1`);
  const time = rideLevel(1).cruise / rideLevel(10).cruise;
  assert.ok(time >= 0.8, `the same distance takes ${time} of level 1’s time at level 10`);
  for (let level = 2; level <= 10; level += 1) assert.ok(rideLevel(level).cruise >= rideLevel(level - 1).cruise);
});

test('the road never comes near itself, whichever way the bends go, so it can never cross itself', () => {
  let least = Infinity;
  for (const favour of ['even', 'more']) {
    for (const bends of BEND_COUNTS) {
      for (const level of [1, 8, 10]) {
        for (const side of ['left', 'right']) {
          for (let seed = 1; seed <= 12; seed += 1) {
            least = Math.min(least, nearestApproach(shapeOf(layOut({ level, bends, favour, side, random: seeded(seed) }))));
          }
        }
      }
    }
  }
  assert.ok(least >= 90, `the nearest the road came to itself was ${least} metres`);
});

test('a road that can\'t keep clear of itself is laid out again, and at last with its bends one way and then the other', () => {
  const options = () => ({ level: 5, bends: 14, favour: 'more', side: 'left', random: seeded(3) });
  const usual = layOut(options());
  assert.ok(usual.bends.filter(({ turn }) => turn < 0).length >= 9, 'as it comes, most bends go to the left');
  // Asked to keep further from itself than any road does, it's laid out again and again from the numbers that
  // come next, and the last tries are with the bends one way and then the other, which winds round least.
  const again = layOut(options(), 100_000);
  again.bends.forEach((bend, index) => {
    if (index) assert.equal(bend.turn, -again.bends[index - 1].turn, 'one way and then the other');
  });
  assert.equal(again.bends.length, 14);
  assert.deepEqual(layOut(options(), 100_000), again, 'and the same again from the same numbers, as on a friend\'s computer');
  // As the bends are now, no road needs it: the nearest any comes to itself is well clear.
  assert.ok(nearestApproach(shapeOf(usual)) > 90);
});

test('a bend that needs more lean is a tighter one, and the road turns as far as its bends say', () => {
  const plan = planOf({ bends: [{ from: 100, to: 180, turn: 1, need: 0.5 }, { from: 240, to: 320, turn: -1, need: 1 }], length: 400 });
  near(curveAt(plan, 140), 0.5 * FULL_CURVE, 1e-9, 'half a lean, half as tight');
  near(curveAt(plan, 280), -FULL_CURVE, 1e-9, 'a whole lean, to the left');
  assert.equal(curveAt(plan, 50), 0, 'a straight');
  assert.ok(Math.abs(curveAt(plan, 104)) < 0.5 * FULL_CURVE * 0.3, 'a bend comes on gently');
  const shape = shapeOf(plan);
  const start = placeAt(shape, 0);
  const after = placeAt(shape, 200);
  near(start.x, 0, 1e-6);
  near(start.z, 0, 1e-6);
  assert.ok(after.heading > 0.5 && after.x > 10, 'a bend to the right takes the road to the right');
  near(placeAt(shape, 350).heading, after.heading - 2 * (after.heading), 0.02, 'and the tighter one brings it back twice as far');
  assert.ok(placeAt(shape, 300).y > placeAt(shape, 100).y, 'and it climbs');
  // Across the road is to the right of the way it's heading.
  const middle = placeAt(shape, 30, 0);
  const right = placeAt(shape, 30, 3);
  near(right.x - middle.x, 3, 1e-6);
  const found = nearestTo(shape, right.x + 10, right.z);
  near(found.distance, 13, 0.1);
  near(found.s, 30, 2);
});

/* ------------------------------- riding ------------------------------- */

const oneBend = (turn = 1, need = 0.55, extra = {}) => planOf({ bends: [{ from: 100, to: 180, turn, need }], length: 300, ...extra });

test('a child who leans into each bend stays on the road all the way up, at every level', () => {
  for (let level = 1; level <= 10; level += 1) {
    const { game, time } = ride({ level, random: seeded(level + 40) });
    assert.equal(game.state, 'finished', `level ${level}`);
    assert.equal(game.stats.clean, game.stats.bends, `level ${level}: every bend ridden on the road`);
    assert.equal(game.stats.vergeSeconds, 0);
    assert.equal(game.stats.tows, 0);
    assert.ok(time > 60 && time < 130, `level ${level} took ${time} seconds`);
  }
});

test('a wobbly child who is late into every bend still gets up the mountain, mostly on the road', () => {
  for (const level of [1, 5, 10]) {
    const { game } = ride({ level, random: seeded(level + 3) }, { late: 0.7, wobble: 5, skill: 0.85 });
    assert.equal(game.state, 'finished');
    assert.ok(game.stats.clean >= game.stats.bends - 2, `level ${level}: ${game.stats.clean} of ${game.stats.bends} bends on the road`);
    assert.equal(game.stats.tows, 0);
  }
});

test('at level 10 a child can be nearly as late into a bend as at level 1 and still stay on the road', () => {
  // The latest a child who leans as far as the bends need can be, to the tenth of a second, and still ride
  // nine bends in ten on the road.
  const latest = (level) => {
    let found = 0;
    for (let late = 0.3; late <= 1.5; late += 0.1) {
      let clean = 0;
      let bends = 0;
      for (let seed = 1; seed <= 6; seed += 1) {
        const { game } = ride({ level, random: seeded(seed * 3 + level) }, { late, wobble: 2 });
        clean += game.stats.clean;
        bends += game.stats.bends;
      }
      if (clean / bends < 0.9) break;
      found = late;
    }
    return found;
  };
  const first = latest(1);
  const last = latest(10);
  assert.ok(first >= 0.8, `level 1 forgives ${first} seconds`);
  assert.ok(last >= first * 0.7, `level 10 forgives ${last} seconds, and level 1 ${first}`);
});

test('a child whose body only leans a little, and wobbles, rides the bends on the road once the warm-up has measured them', () => {
  // Seven degrees each way in the warm-up, so a whole lean is six: the tracker's wobble is a bigger share of it.
  for (const level of [1, 10]) {
    const { game, leaner } = ride({ level, random: seeded(level + 9) }, { best: 7, wobble: 2, late: 0.5 });
    near(leaner.reachOf('left') / RAD, 7 * LEAN.ofBest, 0.01);
    assert.equal(game.state, 'finished');
    assert.ok(game.stats.clean >= game.stats.bends - 1, `level ${level}: ${game.stats.clean} of ${game.stats.bends} bends on the road`);
    assert.equal(game.stats.tows, 0);
  }
});

test('a child who skipped the warm-up is asked for a small lean, and rides the bends with it', () => {
  const { game, leaner } = ride({ level: 3, random: seeded(12) }, { best: null });
  near(leaner.reachOf('right') / RAD, LEAN.unmeasured, 0.01);
  assert.equal(game.stats.clean, game.stats.bends);
});

test('in a bend the bike drifts to the outside, and the lean the bend needs holds it in the middle', () => {
  const upright = ride({ plan: oneBend(1) }, { lean: () => 0, until: (game) => game.offRoad });
  assert.ok(upright.game.x < -ROAD.half, `no lean in a bend to the right: carried out to the left, ${upright.game.x}`);
  assert.ok(upright.game.s > 120 && upright.game.s < 145, `between one and three seconds after the bend starts, not at once: ${upright.game.s}`);
  assert.equal(upright.events.find(({ type }) => type === 'verge').side, 'left');
  const held = ride({ plan: oneBend(1) }, { until: (game) => game.s > 150 });
  near(held.game.x, 0, 0.8, 'the lean it needs');
  const left = ride({ plan: oneBend(-1) }, { lean: () => 0, until: (game) => game.offRoad });
  assert.ok(left.game.x > ROAD.half, 'and a bend to the left carries it out to the right');
});

test('leaning much too far takes the bike to the inside, a little too far doesn’t, and leaning the wrong way takes it out faster', () => {
  const over = ride({ plan: oneBend(1, 0.5) }, { lean: (game) => (game.s > 100 ? 2.5 : 0), until: (game) => game.s > 150 });
  assert.ok(over.game.x > ROAD.half, `two and a half whole leans in a gentle bend: on the inside, ${over.game.x}`);
  // Half as far again as the bend needs is still on the road at the end of it: leaning further turns the bike
  // more, but by less and less.
  const little = ride({ plan: oneBend(1, 0.5) }, { lean: (game) => (game.bendAt(game.s) ? 0.75 : 0) });
  assert.equal(little.game.stats.clean, 1, 'a lean half as big again as the bend needs');
  const offAt = (lean) => {
    const { game } = ride({ plan: oneBend(1) }, { lean, until: (ride) => ride.offRoad });
    return game.s;
  };
  assert.ok(offAt(() => -0.6) < offAt(() => 0) - 5, 'the wrong way is off the road sooner than no lean');
});

test('on a straight, leaning moves the bike across the road and it comes back to the middle by itself', () => {
  const plan = planOf({ length: 600 });
  const { game } = ride({ plan }, { lean: (ride, time) => (time < 3 ? 0.2 : 0), until: (ride, time) => time > 3 });
  assert.ok(game.x > 1.2 && game.x < ROAD.half, `a small lean to the right: ${game.x}`);
  const back = ride({ plan }, { lean: (ride, time) => (time < 3 ? 0.2 : 0), until: (ride, time) => time > 8 });
  near(back.game.x, 0, 0.6, 'upright again, five seconds on');
  const later = ride({ plan }, { lean: (ride, time) => (time < 3 ? 0.2 : 0), until: (ride, time) => time > 13 });
  near(later.game.x, 0, 0.1, 'and ten seconds on');
  const left = ride({ plan }, { lean: () => -0.2, until: (ride, time) => time > 3 });
  assert.ok(left.game.x < -1.2);
  assert.equal(left.game.stats.vergeSeconds, 0);
});

test('the bike leans over as the child does, further the further they lean, and comes upright with them', () => {
  const plan = planOf({ length: 600 });
  const { game } = ride({ plan }, { lean: () => -1, until: (ride, time) => time > 2 });
  near(game.roll, rollFor(-1), 0.03);
  near(rollFor(-1) / RAD, -21.5, 0.5, 'a whole lean tips it about 21 degrees');
  const up = ride({ plan }, { lean: (ride, time) => (time < 2 ? 1 : 0), until: (ride, time) => time > 5 });
  near(up.game.roll, 0, 0.03);
  // It doesn't snap over: half a second into a lean it's only part of the way.
  const start = ride({ plan }, { lean: () => 1, late: 0, until: (ride, time) => time > 0.5 });
  assert.ok(start.game.roll > 0.05 && start.game.roll < rollFor(1) * 0.75, `half a second in: ${start.game.roll}`);
  // And leaning further than a whole lean goes on tipping it, up to three whole leans.
  assert.ok(rollFor(0.5) < rollFor(1) && rollFor(1) < rollFor(2) && rollFor(2) < rollFor(3));
  near(rollFor(3), BIKE.leanMost, 1e-9);
  near(rollFor(5), BIKE.leanMost, 1e-9);
});

test('a lean turns the bike by a logarithm: the more lean the more turn, by less and less, and never all at once', () => {
  assert.equal(turnOf(0), 0);
  near(turnOf(1), 1, 1e-9, 'a whole lean');
  near(turnOf(-1), -1, 1e-9, 'and the other way');
  // Each step further adds less than the step before.
  const steps = [0.5, 1, 1.5, 2, 2.5, 3].map((share) => turnOf(share) - turnOf(share - 0.5));
  for (let i = 1; i < steps.length; i += 1) assert.ok(steps[i] > 0 && steps[i] < steps[i - 1], `steps of half a lean: ${steps}`);
  assert.ok(turnOf(0.5) > 0.5 && turnOf(0.5) < 0.7, 'half a lean turns it more than half as much');
  assert.ok(turnOf(3) > 1.6 && turnOf(3) < 2, 'three whole leans turn it less than twice as much as one');
  near(turnOf(2) / Math.log(1 + STEER.curve * 2), turnOf(0.3) / Math.log(1 + STEER.curve * 0.3), 1e-9, 'it is a logarithm');
  // In the ride: on a straight, the nose swings round by more for a bigger lean, and the bike goes that way.
  const swing = (share) => {
    let most = 0;
    const { game } = ride({ plan: planOf({ length: 600 }) }, {
      lean: () => share,
      late: 0,
      until: (ride, time) => {
        most = Math.max(most, ride.yaw);
        return time > 2;
      },
    });
    return { most, x: game.x };
  };
  const [small, whole, far] = [swing(0.3), swing(1), swing(3)];
  assert.ok(small.most > 0.02 && small.most < whole.most && whole.most < far.most, `the nose swings ${small.most}, ${whole.most}, ${far.most}`);
  assert.ok(small.x > 0.5 && small.x < whole.x && whole.x <= far.x, `and the bike goes ${small.x}, ${whole.x}, ${far.x} metres across`);
  assert.ok(far.most <= STEER.yawMost + 1e-9, 'the nose never points far from the road');
  // Not at once: a quarter of a second into a whole lean the bike has hardly moved across.
  const { game: early } = ride({ plan: planOf({ length: 600 }) }, { lean: (ride, time) => (time > 3 ? 1 : 0), late: 0, until: (ride, time) => time > 3.25 });
  assert.ok(Math.abs(early.x) < 0.15, `a quarter of a second in: ${early.x} metres`);
});

test('how much help the road gives is the grown-ups’ setting: with lots, half the lean is plenty, and with little it isn’t', () => {
  const half = (help) => ride({ plan: oneBend(1, 0.6), help }, { skill: 0.5 }).game.stats.clean;
  assert.equal(half('lots'), 1);
  assert.equal(half('little'), 0);
  assert.ok(HELP.lots > HELP.some && HELP.some > HELP.little);
  // With the usual help, about half the lean a gentle bend needs keeps the bike on the road, and a third doesn't.
  assert.equal(ride({ plan: oneBend(1, 0.55) }, { skill: 0.6 }).game.stats.clean, 1);
  assert.equal(ride({ plan: oneBend(1, 0.55) }, { skill: 0.3 }).game.stats.clean, 0);
});

test('the grass slows the bike and never stops it while the child is leaning into the bend', () => {
  // Leaning the right way, but only a little: out on the grass, and still going.
  const { game, types: seen } = ride({ plan: oneBend(1, 0.8) }, { lean: (ride) => (ride.s > 95 ? 0.2 : 0), until: (ride) => ride.s > 170 });
  assert.ok(seen.includes('verge'));
  assert.ok(!seen.includes('waiting'), 'it never stopped');
  assert.ok(game.v > 5 && game.v < game.cruise * 0.6, `slower on the grass: ${game.v}`);
  assert.ok(Math.abs(game.x) <= ROAD.half + ROAD.verge + 1e-9, 'and never beyond the grass');
  // Leaning hard the wrong way takes it to the far edge of the grass and no further, and there its nose is
  // back in line with the road, not pointing off the mountain.
  const far = ride({ plan: oneBend(1, 0.8) }, { lean: (ride) => (ride.s > 95 ? -2 : 0), until: (ride) => ride.x <= -(ROAD.half + ROAD.verge) + 1e-9 || ride.s > 178 });
  near(far.game.x, -(ROAD.half + ROAD.verge), 1e-6, 'at the far edge');
  assert.ok(far.game.yaw >= -0.02, `its nose: ${far.game.yaw}`);
});

test('a child who doesn’t lean finds the bike waiting in the bend, and the smallest lean into it gets it going', () => {
  let stopped = null;
  let wrongWay = null;
  const { game, types: seen } = ride({ plan: oneBend(1) }, {
    lean: (ride, time) => {
      if (ride.waiting && stopped === null && ride.v === 0) stopped = time;
      if (stopped === null) return 0;
      // Two seconds of leaning the wrong way first, which does nothing.
      if (time < stopped + 2) return -0.5;
      if (wrongWay === null) wrongWay = { waiting: ride.waiting, v: ride.v };
      return time > stopped + 2.5 ? 0.3 : 0;
    },
  });
  assert.ok(stopped !== null, 'it stopped and waited');
  assert.deepEqual(wrongWay, { waiting: 'bend', v: 0 }, 'leaning away from the bend leaves it waiting');
  assert.deepEqual(seen.filter((type) => ['waiting', 'going', 'tow'].includes(type)), ['waiting', 'going'], 'and went again at the lean, with no help needed');
  assert.equal(game.state, 'finished');
  assert.equal(game.stats.tows, 0);
  assert.ok(game.stats.waitSeconds > 1.5);
});

test('while it waits, the bike asks for a lean into the bend, and says there’s no hurry', () => {
  const { game, types: seen } = ride({ plan: oneBend(-1) }, { lean: () => 0, until: (ride) => ride.waited > 6 });
  assert.equal(game.waiting, 'bend');
  assert.equal(game.hint, 'left', 'a bend to the left wants a lean to the left');
  assert.equal(game.resting, true);
  assert.equal(seen.filter((type) => type === 'resting').length, 1, 'said once');
  assert.equal(game.v, 0);
});

test('nobody is left stuck: after a long wait the bike is helped round the bend, slowly, and rides on', () => {
  const { game, types: seen, time } = ride({ plan: oneBend(1) }, { lean: () => 0 });
  assert.equal(game.state, 'finished', 'a child who never leans still gets to the top');
  assert.equal(game.stats.tows, 1);
  assert.equal(game.stats.clean, 0, 'a bend that needed help is not one ridden on the road');
  assert.ok(seen.indexOf('tow') > seen.indexOf('waiting'));
  assert.ok(time > 25, `it took its time: ${time}`);
});

test('resting on a straight costs nothing: the bike rides itself between the bends', () => {
  const { game, types: seen } = ride({ plan: planOf({ length: 500 }) }, { lean: () => 0 });
  assert.equal(game.state, 'finished');
  assert.ok(!seen.includes('waiting') && !seen.includes('verge'));
  near(game.x, 0, 0.01);
});

test('with nobody in the picture the bike stops and waits wherever it is, and goes on when they come back', () => {
  const { game, types: seen } = ride({ plan: planOf({ length: 500 }) }, {
    lean: () => 0,
    seen: (ride, time) => time < 5 || time > 12,
  });
  assert.equal(game.state, 'finished');
  assert.deepEqual(seen.filter((type) => ['waiting', 'going'].includes(type)), ['waiting', 'going']);
  assert.ok(game.stats.waitSeconds > 5 && game.stats.waitSeconds < 8);
  const away = ride({ plan: planOf({ length: 500 }) }, { lean: () => 0, seen: (ride, time) => time < 5, until: (ride, time) => time > 9 });
  assert.equal(away.game.waiting, 'away');
  assert.equal(away.game.v, 0);
  assert.equal(away.game.hint, null, 'there is nothing to lean for');
});

test('a child who leans the right way and still can’t make a bend has a whole lean come down to meet them', () => {
  // Their body only goes five degrees, and the setting asks for fourteen.
  const { game, leaner } = ride({ plan: planOf({ bends: [{ from: 100, to: 190, turn: -1, need: 0.8 }, { from: 250, to: 340, turn: -1, need: 0.8 }, { from: 400, to: 490, turn: -1, need: 0.8 }], length: 560 }) }, {
    lean: (ride) => (ride.bendAt(ride.s + 6) ? -0.3 : 0),
  });
  assert.ok(game.stats.eased.left >= 1, 'the left came down');
  assert.equal(game.stats.eased.right, 0, 'the right was left alone');
  assert.ok(leaner.reachOf('left') < leaner.reachOf('right'));
  assert.equal(game.stats.tows, 0, 'and they got round by themselves');
  // And the last bend went better than the first.
  assert.equal(game.state, 'finished');
});

test('leaning the wrong way, or to the inside, eases nothing', () => {
  const wrong = ride({ plan: oneBend(1, 0.8) }, { lean: (ride) => (ride.s > 95 ? -0.4 : 0), until: (ride) => ride.s > 175 });
  assert.deepEqual(wrong.game.stats.eased, { left: 0, right: 0 });
  // Leaning much too far, all the way round a long bend: on the grass on the inside for most of it.
  const long = planOf({ bends: [{ from: 100, to: 260, turn: 1, need: 0.5 }], length: 360 });
  const inside = ride({ plan: long }, { lean: (ride) => (ride.s > 95 ? 2.5 : 0), until: (ride) => ride.s > 255 });
  assert.ok(inside.game.stats.vergeSeconds > 4 && inside.game.x > ROAD.half, `on the inside: ${inside.game.x}`);
  assert.deepEqual(inside.game.stats.eased, { left: 0, right: 0 });
  assert.equal(inside.game.waiting, null, 'and a bike on the inside is never made to wait');
});

test('a bend ridden all on the road counts, and each one makes the bike a little faster until it touches the grass', () => {
  const bends = [0, 1, 2, 3, 4, 5].map((n) => ({ from: 100 + n * 150, to: 180 + n * 150, turn: n % 2 ? -1 : 1, need: 0.55 }));
  const plan = planOf({ bends, length: 1050 });
  const clean = ride({ plan });
  assert.equal(clean.game.stats.clean, 6);
  assert.equal(clean.game.flow, BIKE.flowMost, 'faster, up to a limit');
  assert.ok(clean.game.v > clean.game.cruise * 1.1 && clean.game.v <= clean.game.cruise * (1 + BIKE.flowStep * BIKE.flowMost) + 0.01);
  // The same, but upright through the third bend.
  const rough = ride({ plan }, { lean: (game) => (game.bendAt(game.s)?.index === 2 ? 0.15 * 1 : game.needAt(game.s + game.v * 0.25)) });
  assert.equal(rough.game.stats.clean, 5);
  assert.deepEqual(rough.types.filter((type) => ['clean', 'rough'].includes(type)), ['clean', 'clean', 'rough', 'clean', 'clean', 'clean']);
  assert.equal(rough.game.flow, 3, 'the count starts again after the grass');
});

test('leans are counted and timed for the finish: how many each way, how long, and the longest', () => {
  const plan = planOf({ bends: [{ from: 100, to: 190, turn: -1, need: 0.6 }, { from: 250, to: 310, turn: 1, need: 0.6 }], length: 400 });
  const { game } = ride({ plan });
  assert.deepEqual(game.stats.leans, { left: 1, right: 1 });
  assert.ok(game.stats.leanSeconds.left > game.stats.leanSeconds.right + 1, 'the longer bend is the longer lean');
  near(game.stats.longest, game.stats.leanSeconds.left, 1.2);
  assert.ok(game.stats.longest > 3 && game.stats.longest < 7);
  assert.ok(game.stats.seconds > 15);
});

test('how fast the bike goes is the grown-ups’ setting, and a level makes it only a little faster', () => {
  const speed = (options) => ride({ plan: planOf({ length: 400 }), ...options }, { lean: () => 0, until: (game) => game.s > 300 }).game.v;
  near(speed({ pace: 'usual' }), 15, 0.01);
  near(speed({ pace: 'gentle' }), 15 * PACES.gentle, 0.01);
  near(speed({ pace: 'quick' }), 15 * PACES.quick, 0.01);
  assert.ok(PACES.gentle < 1 && PACES.quick > 1);
});

/* ------------------------------- what each level brings ------------------------------- */

const straight = (things, length = 400, rules = {}) => planOf({ things, length, rules });

test('level 2: a star is caught by riding over it, and missed by riding past', () => {
  const plan = straight([{ kind: 'star', at: 150, x: 0 }, { kind: 'star', at: 200, x: 2.6 }, { kind: 'star', at: 250, x: -2.6 }]);
  const { game, types: seen } = ride({ plan }, { lean: () => 0 });
  assert.equal(game.stats.stars, 1, 'the one in the middle');
  assert.equal(seen.filter((type) => type === 'star').length, 1);
  // A child who leans towards whichever star is next.
  const far = straight([{ kind: 'star', at: 150, x: 0 }, { kind: 'star', at: 260, x: 2.6 }, { kind: 'star', at: 420, x: -2.6 }], 500);
  const leaning = ride({ plan: far }, {
    lean: (ride) => {
      const next = ride.passing.find((thing) => !thing.done);
      return next ? Math.max(-0.4, Math.min(0.4, (next.x - ride.x) * 0.1)) : 0;
    },
  });
  assert.equal(leaning.game.stats.stars, 3, 'leaning over to each of the others');
  assert.ok(leaning.game.things.every((thing) => thing.taken));
});

test('level 3: a puddle splashes and slows the bike for a moment, and leaning away misses it', () => {
  const plan = straight([{ kind: 'puddle', at: 200, x: 2.1, reach: 1.9 }]);
  const through = ride({ plan }, { lean: (game) => (game.s < 200 ? 0.1 : 0), until: (game) => game.s > 206 });
  assert.equal(through.game.stats.splashes, 1);
  assert.ok(through.types.includes('splash'));
  assert.ok(through.game.v < through.game.cruise * 0.9, 'slower');
  const after = ride({ plan }, { lean: (game) => (game.s < 200 ? 0.1 : 0) });
  assert.equal(after.game.state, 'finished');
  near(after.game.v, after.game.cruise, 0.01, 'and back to speed');
  const missed = ride({ plan }, { lean: () => -0.1 });
  assert.equal(missed.game.stats.splashes, 0);
});

test('level 4: a speed arrow makes the bike faster for a couple of seconds', () => {
  const plan = straight([{ kind: 'boost', at: 150, x: -2.1, reach: 1.7 }], 500);
  const { game } = ride({ plan }, { lean: () => -0.1, until: (ride) => ride.s > 175 });
  assert.equal(game.stats.boosts, 1);
  assert.ok(game.v > game.cruise * 1.1, `faster: ${game.v}`);
  const later = ride({ plan }, { lean: () => -0.1, until: (ride) => ride.s > 400 });
  near(later.game.v, later.game.cruise, 0.01, 'for a while');
  assert.equal(ride({ plan }, { lean: () => 0.1 }).game.stats.boosts, 0, 'and not for a bike on the other side');
});

test('level 5: the bike stops for a sheep in its way, which walks off, and is never hit', () => {
  const plan = straight([{ kind: 'sheep', at: 200, x: 1.6, reach: 1.9 }]);
  let nearest = Infinity;
  const { game, types: seen } = ride({ plan }, {
    lean: () => 0.15,
    until: (ride) => {
      if (!ride.things[0].aside && ride.s < 200) nearest = Math.min(nearest, 200 - ride.s);
      return false;
    },
  });
  assert.equal(game.state, 'finished', 'and the bike rides on once the road is clear');
  assert.ok(nearest > 2.5, `it stopped ${nearest} metres short`);
  assert.ok(seen.includes('sheep-goes'));
  assert.equal(game.stats.stops, 1);
  assert.equal(game.stats.passed, 0);
});

test('level 5: leaning round the sheep passes it without slowing', () => {
  const plan = straight([{ kind: 'sheep', at: 200, x: 1.6, reach: 1.9 }]);
  let slowest = Infinity;
  const { game, types: seen } = ride({ plan }, {
    lean: (ride) => (ride.s > 120 && ride.s < 205 ? -0.2 : 0),
    until: (ride) => {
      if (ride.s > 100 && ride.s < 220) slowest = Math.min(slowest, ride.v);
      return false;
    },
  });
  assert.equal(game.stats.passed, 1);
  assert.equal(game.stats.stops, 0);
  assert.ok(seen.includes('pass') && !seen.includes('sheep-goes'));
  near(slowest, game.cruise, 0.01, 'at full speed');
});

test('level 6: a bridge is narrower than the road, and its edges slow the bike but can’t be left', () => {
  const plan = straight([{ kind: 'bridge', at: 150, from: 150, to: 200 }], 400);
  const middle = ride({ plan }, { lean: () => 0 });
  assert.equal(middle.game.stats.vergeSeconds, 0, 'down the middle is all road');
  assert.deepEqual(middle.types.filter((type) => type.startsWith('bridge')), ['bridge', 'bridge-end']);
  const game = new Ride({ plan });
  near(game.halfAt(100), ROAD.half, 1e-9);
  near(game.halfAt(175), ROAD.bridgeHalf, 1e-9);
  near(game.edgeAt(175), ROAD.bridgeHalf + ROAD.rail, 1e-9);
  assert.ok(game.halfAt(146) < ROAD.half && game.halfAt(146) > ROAD.bridgeHalf, 'it narrows smoothly');
  // A bike held over to one side is on the planks' edge on the bridge, and on the road before it.
  let widest = 0;
  const side = ride({ plan }, {
    lean: () => 0.22,
    until: (ride) => {
      if (ride.s > 155 && ride.s < 195) widest = Math.max(widest, Math.abs(ride.x));
      return false;
    },
  });
  assert.ok(side.game.stats.vergeSeconds > 1, 'slowed on the bridge');
  assert.ok(widest <= ROAD.bridgeHalf + ROAD.rail + 1e-9, `never through the railing: ${widest}`);
});

test('level 7: riding over a ramp is a jump, and riding beside it is nothing', () => {
  const plan = straight([{ kind: 'ramp', at: 150, x: 1.7, reach: 1.5 }, { kind: 'star', at: 160, x: 1.7 }], 400);
  let highest = 0;
  const over = ride({ plan }, {
    lean: (game) => (game.s < 150 ? 0.08 : 0),
    until: (game) => {
      highest = Math.max(highest, game.height);
      return false;
    },
  });
  assert.equal(over.game.stats.jumps, 1);
  assert.deepEqual(over.types.filter((type) => ['jump', 'land'].includes(type)), ['jump', 'land']);
  assert.ok(highest > 1.8 && highest < 2.8, `a couple of metres up: ${highest}`);
  assert.equal(over.game.height, 0, 'and down again');
  const beside = ride({ plan }, { lean: () => -0.1 });
  assert.equal(beside.game.stats.jumps, 0);
  assert.ok(!beside.types.includes('jump'));
});

test('level 7: in the air the bike keeps its line, and it lands on the road', () => {
  const plan = straight([{ kind: 'ramp', at: 150, x: 0, reach: 1.5 }], 400);
  let inAir = [];
  ride({ plan }, {
    lean: (game) => (game.air ? 1 : 0),
    late: 0,
    until: (game) => {
      if (game.air) inAir.push(game.x);
      return false;
    },
  });
  assert.ok(inAir.length > 20);
  assert.ok(Math.max(...inAir) - Math.min(...inAir) < 0.01, 'leaning in the air does nothing');
});

test('level 8: the big bend, ridden all on the road, wins the medal', () => {
  const level8 = layOut({ level: 8, random: seeded(11) });
  const well = ride({ plan: level8 });
  assert.equal(well.game.stats.medal, true);
  assert.ok(well.game.stats.longest > 5.5, `a long lean held: ${well.game.stats.longest}`);
  const badly = ride({ plan: layOut({ level: 8, random: seeded(11) }) }, { lean: (game) => (game.bendAt(game.s)?.big ? 0.15 * game.bendAt(game.s).turn : game.needAt(game.s + game.v * 0.25)) });
  assert.equal(badly.game.stats.medal, false);
  assert.equal(badly.game.state, 'finished');
});

test('level 9: a friend on a scooter is followed, never hit, and pulls over for a bike that stays behind', () => {
  const plan = straight([{ kind: 'scooter', at: 150, from: 150, to: 250, x: 2, reach: 1.9 }], 500);
  let nearest = Infinity;
  const { game, types: seen } = ride({ plan }, {
    lean: () => 0.1,
    until: (ride) => {
      const scooter = ride.things[0];
      if (scooter.moving && !scooter.aside && !scooter.done) nearest = Math.min(nearest, scooter.pos - ride.s);
      return false;
    },
  });
  assert.equal(game.state, 'finished');
  assert.ok(nearest > 2.5, `never nearer than ${nearest} metres`);
  assert.ok(seen.includes('scooter'), 'it sets off as the bike comes near');
  assert.ok(seen.includes('scooter-aside'), 'and pulls over');
  assert.equal(game.stats.stops, 1);
  assert.equal(game.stats.passed, 0);
});

test('level 9: leaning over to the other side passes the scooter at full speed', () => {
  const plan = straight([{ kind: 'scooter', at: 150, from: 150, to: 250, x: 2, reach: 1.9 }], 500);
  let slowest = Infinity;
  const { game, types: seen } = ride({ plan }, {
    lean: (ride) => (ride.s > 110 && !ride.things[0].done ? -0.15 : 0),
    until: (ride) => {
      if (ride.s > 100) slowest = Math.min(slowest, ride.v);
      return false;
    },
  });
  assert.equal(game.stats.passed, 1);
  assert.ok(seen.includes('pass') && !seen.includes('scooter-aside'));
  near(slowest, game.cruise, 0.01);
});

test('level 10: heaps of snow burst when ridden through, and the cup is won at the top', () => {
  const plan = straight([{ kind: 'snow', at: 150, x: 0 }, { kind: 'snow', at: 200, x: 3.5 }], 400, { cup: true });
  const { game, types: seen } = ride({ plan }, { lean: () => 0 });
  assert.equal(game.stats.snow, 1);
  assert.equal(game.stats.cup, true);
  assert.ok(seen.indexOf('cup') >= 0 && seen.indexOf('cup') < seen.indexOf('finished'));
  assert.equal(ride({ plan: straight([], 300) }, { lean: () => 0 }).game.stats.cup, false, 'only at level 10');
});

test('a pretend child gets every new thing at its level, and no level can be lost', () => {
  const had = { 2: 'stars', 3: 'splashes', 4: 'boosts', 7: 'jumps' };
  for (let level = 1; level <= 10; level += 1) {
    let got = 0;
    for (let seed = 1; seed <= 6; seed += 1) {
      // A child who goes for whatever is next on the road, as well as leaning into the bends.
      const { game } = ride({ level, random: seeded(seed * 13 + level) }, {
        lean: (game) => {
          const road = game.needAt(game.s + game.v * 0.25);
          const next = game.passing.find((thing) => !thing.done && thing.at > game.s && thing.at - game.s < 40 && ['star', 'snow', 'boost', 'ramp', 'puddle'].includes(thing.kind));
          return road + (next && !game.bendAt(game.s) ? Math.max(-0.3, Math.min(0.3, (next.x - game.x) * 0.12)) : 0);
        },
      });
      assert.equal(game.state, 'finished', `level ${level}, seed ${seed}`);
      if (had[level]) got += game.stats[had[level]];
    }
    if (had[level]) assert.ok(got >= 6, `level ${level}: ${got} ${had[level]} over six rides`);
  }
});

/* ------------------------------- riding together ------------------------------- */

test('riding together, whoever is far in front eases off and whoever is far behind gets a tow', () => {
  const plan = () => planOf({ length: 900 });
  const alone = ride({ plan: plan(), team: true }, { lean: () => 0, until: (game) => game.s > 300 });
  near(alone.game.v, alone.game.cruise, 0.01, 'with nobody else, the usual speed');
  const ahead = ride({ plan: plan(), team: true }, { lean: () => 0, mates: () => [{ s: 0 }], until: (game) => game.s > 300 });
  near(ahead.game.v, ahead.game.cruise * 0.5, 0.05, 'far in front: half speed, and never stopped');
  const close = ride({ plan: plan(), team: true }, { lean: () => 0, mates: (game) => [{ s: game.s - 20 }], until: (game) => game.s > 300 });
  near(close.game.v, close.game.cruise, 0.01, 'near each other: the usual speed');
  const behind = ride({ plan: plan(), team: true }, { lean: () => 0, mates: (game) => [{ s: game.s + 60 }], until: (game) => game.s > 300 });
  near(behind.game.v, behind.game.cruise * 1.2, 0.05, 'far behind: a tow');
  const racing = ride({ plan: plan(), team: false }, { lean: () => 0, mates: () => [{ s: 0 }], until: (game) => game.s > 300 });
  near(racing.game.v, racing.game.cruise, 0.01, 'against each other, nobody is held back');
});

test('a friend who waits doesn’t stop the ride: everyone still gets to the top', () => {
  const { game } = ride({ plan: planOf({ length: 600 }), team: true }, { lean: () => 0, mates: () => [{ s: 10 }] });
  assert.equal(game.state, 'finished');
});
