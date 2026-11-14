// Flap, Little Chick!: how the wrists are read (games/chick-flap/wings.js), against what the real tracker reported
// for real photos of hands, each also squeezed shorter, as a hand tipped towards the camera looks, and turned, for
// fingers that point out to the side or hang down. And the rules (games/chick-flap/farm.js): the chick's flight,
// everything that can be in the way, the fox, the mother hen, the ten levels, and flying home with friends
// (games/chick-flap/flock.js), played here by made-up children who flap well, badly, with one hand, or not at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seededRandom, Track } from '../../core/friends.js';
import { LAST_LEVEL } from '../../core/levels.js';
import { UPRIGHT } from '../../core/upright.js';
import {
  AHEAD, CHICK, DUCK, Farm, farmLevel, farmNewAt, FIRST, FLOCK, flapWindow, FOX, FOX_NAMES, GUST, HAY, heightAfter, HEN, HOME, HUNT,
  KINDS, LABELS, layTrack, NEWS, newsIsOn, NOT_WITH_FRIENDS, timesAt, TRACTOR, WAYS, zoneFor,
} from '../../games/chick-flap/farm.js';
import { CHICK_TRACK, chickState, flockFrom, friendFrom, STATES, wireFor } from '../../games/chick-flap/flock.js';
import { RISE_NAMES, riseOf, trusted, Wing, Wings, WINGS } from '../../games/chick-flap/wings.js';
import { FRAME_ASPECT, feed, leftHand, rightHand, setup } from './photo-hands.js';

const FRAME_MS = 33;
const DT = 1 / 60;

/* ---------- the hands, read as wings ---------- */

/** A hand's points, as the monitor gives them to a game, for a photo: the hand in play, on its own side. */
function seen(name, side = 'right') {
  const { monitor, clock } = setup({}, side);
  return feed(monitor, clock, 300, [(side === 'right' ? rightHand : leftHand)(name)])[side].image;
}

/** A wing that has watched the hand check with this photo, so it knows how this hand looks held flat. */
function checkedWith(name = 'palm') {
  const wing = new Wing();
  const image = seen(name);
  for (let i = 0; i < 20; i += 1) wing.sample(image, FRAME_ASPECT);
  wing.calibrate();
  wing.now = 10_000;
  return wing;
}

/** Shows a wing photos, one after another, each for so long, and returns how many times it flapped. null is no hand. */
function show(wing, steps, need = WINGS.rises.little) {
  let flaps = 0;
  for (const [name, ms] of steps) {
    const image = name ? seen(name) : null;
    for (let elapsed = 0; elapsed < ms; elapsed += FRAME_MS) {
      wing.now += FRAME_MS;
      if (wing.update(image, FRAME_ASPECT, wing.now, need)) flaps += 1;
    }
  }
  return flaps;
}

test('how far up a hand is goes from 1, held flat to the camera, to about a half tipped right over, and below nothing hanging down', () => {
  const flat = riseOf(seen('palm'), FRAME_ASPECT, 0.663);
  assert.ok(flat > 0.97, `held up reads ${flat}`);
  // The palm at 90% of its height, 80%, 70%, 60% and 50%, as it looks tipped 26°, 37°, 46°, 53° and 60°.
  let last = flat;
  for (const [name, about] of [['palm-short-90', 0.9], ['palm-short-80', 0.8], ['palm-short-70', 0.7], ['palm-short-60', 0.6], ['palm-short-50', 0.5]]) {
    const rise = riseOf(seen(name), FRAME_ASPECT, 0.663);
    assert.ok(Math.abs(rise - about) < 0.06, `${name} reads ${rise}`);
    assert.ok(rise < last, `${name} is lower than the one before`);
    last = rise;
  }
  // It stops falling at about 0.47, for a hand whose fingers still point up: nothing asks for less than that.
  const least = riseOf(seen('palm-short-40'), FRAME_ASPECT, 0.663);
  assert.ok(least > 0.42 && least < 0.52, `${least}`);
  assert.ok(WINGS.floor < least && WINGS.droppedTo >= least);
  // Fingers leaning 45° to one side are still up. Out to the side they hardly count, and hanging down they're below nothing.
  assert.ok(riseOf(seen('palm-turn-45'), FRAME_ASPECT, 0.663) > 0.95);
  assert.ok(riseOf(seen('palm-turn-315'), FRAME_ASPECT, 0.663) > 0.95);
  assert.ok(Math.abs(riseOf(seen('palm-turn-90'), FRAME_ASPECT, 0.663)) < 0.2);
  assert.ok(riseOf(seen('palm-turn-135'), FRAME_ASPECT, 0.663) < -0.5);
  assert.ok(riseOf(seen('palm-turn-180'), FRAME_ASPECT, 0.663) < -0.9);
  // A closed hand held up is up too: it's the wrist that's read, not the fingers.
  assert.ok(riseOf(seen('fist'), FRAME_ASPECT) > 0.8);
});

test('a flap is a hand coming up: from hanging forwards to held up flaps once, and holding it up does not flap again', () => {
  const wing = checkedWith();
  assert.equal(show(wing, [['palm-short-50', 500]]), 0, 'a hand that starts tipped over has not flapped');
  assert.equal(wing.up, false);
  assert.equal(show(wing, [['palm', 400]]), 1);
  assert.equal(wing.up, true);
  assert.ok(wing.lift > 0.9, `the wing is drawn up: ${wing.lift}`);
  assert.equal(show(wing, [['palm', 2000]]), 0, 'held up, it glides');
  assert.equal(wing.up, true);
  // Down and up again is another, each time.
  for (let n = 0; n < 4; n += 1) {
    assert.equal(show(wing, [['palm-short-50', 300]]), 0);
    assert.equal(wing.up, false, 'the wing is down once the hand has dropped');
    assert.ok(wing.lift < 0.2);
    assert.equal(show(wing, [['palm', 300]]), 1);
  }
});

test('a hand that starts held up has to drop before it can flap, as after the hand check', () => {
  const wing = checkedWith();
  assert.equal(show(wing, [['palm', 1500]]), 0);
  assert.equal(wing.up, false);
  assert.equal(show(wing, [['palm-short-60', 300], ['palm', 300]]), 1);
});

test('how far it has to come up is the grown-ups\' choice, and a smaller rise than that is not a flap', () => {
  assert.deepEqual(RISE_NAMES, ['little', 'more', 'lots']);
  assert.ok(WINGS.rises.little < WINGS.rises.more && WINGS.rises.more < WINGS.rises.lots);
  // From tipped 53° to tipped 37° is a rise of about a fifth: a flap on a little, and not on more or a lot.
  const flaps = (need, steps) => show(checkedWith(), steps, WINGS.rises[need]);
  const small = [['palm-short-60', 500], ['palm-short-80', 500]];
  assert.equal(flaps('little', small), 1);
  assert.equal(flaps('more', small), 0);
  assert.equal(flaps('lots', small), 0);
  // From tipped 53° to held up flat is a rise of four tenths: a flap on all three.
  const big = [['palm-short-60', 500], ['palm', 500]];
  for (const need of RISE_NAMES) assert.equal(flaps(need, big), 1, need);
  // From tipped 46° to held up is a third: a flap on a little and on more, and not on a lot.
  const middling = [['palm-short-70', 500], ['palm', 500]];
  assert.deepEqual(RISE_NAMES.map((need) => flaps(need, middling)), [1, 1, 0]);
  // Even the most that's asked can be reached by a hand that can be seen: from as low as it reads to held up.
  assert.ok(WINGS.rises.lots < 1 - WINGS.droppedTo - 0.08);
});

test('each hand is its own: a wrist that only comes part of the way up flaps from where it hangs to where it gets to', () => {
  const wing = checkedWith();
  // It never gets nearer held up than tipped 37°, and that's a flap each time, from tipped 60°.
  let flaps = 0;
  for (let n = 0; n < 3; n += 1) flaps += show(wing, [['palm-short-50', 400], ['palm-short-80', 400]]);
  assert.equal(flaps, 3);
  // The wing is drawn as far up as the hand really is, so its share shows: not right up.
  show(wing, [['palm-short-80', 400]]);
  assert.ok(wing.lift > 0.55 && wing.lift < 0.8, `${wing.lift}`);
});

test('a real hand wobbles: tipping to and fro a little never flaps, held up or hanging', () => {
  const up = checkedWith();
  show(up, [['palm-short-50', 300], ['palm', 300]]);
  // From frame to frame it looks held up and then tipped 26°.
  let flaps = 0;
  for (let frame = 0; frame < 120; frame += 1) flaps += show(up, [[frame % 2 ? 'palm' : 'palm-short-90', FRAME_MS]]);
  assert.equal(flaps, 0);
  assert.equal(up.up, true, 'and the wing stays up all the while');
  const down = checkedWith();
  show(down, [['palm-short-50', 300]]);
  for (let frame = 0; frame < 120; frame += 1) flaps += show(down, [[frame % 2 ? 'palm-short-50' : 'palm-short-60', FRAME_MS]]);
  assert.equal(flaps, 0);
  // Slower, a second each way, between held up and tipped 26°: still not enough of a rise.
  for (let n = 0; n < 4; n += 1) flaps += show(up, [['palm-short-90', 1000], ['palm', 1000]]);
  assert.equal(flaps, 0);
});

test('it has to come part of the way down again before the next flap', () => {
  const wing = checkedWith();
  assert.equal(show(wing, [['palm-short-50', 300], ['palm', 300]]), 1);
  // Down only to tipped 17°, and up: not a flap, on a little.
  assert.equal(show(wing, [['palm-short-95', 400], ['palm', 400]]), 0);
  assert.equal(wing.up, true);
  // Down to tipped 37° lets go of the wing, and coming up from there is a flap.
  assert.equal(show(wing, [['palm-short-80', 400]]), 0);
  assert.equal(wing.up, false);
  assert.equal(show(wing, [['palm', 400]]), 1);
});

test('fingers out to the side or hanging down are not a wing up, and coming up from hanging is a flap', () => {
  const wing = checkedWith();
  assert.equal(show(wing, [['palm-turn-180', 500], ['palm-turn-135', 500], ['palm-turn-90', 500]]), 0, 'from hanging down to out to the side');
  assert.equal(wing.up, false);
  assert.equal(wing.lift, 0);
  assert.equal(show(wing, [['palm', 300]]), 1);
  assert.equal(show(wing, [['palm-turn-180', 500], ['palm', 300]]), 1);
});

test('the tracker losing the hand for a moment changes nothing, and a hand gone for longer has dropped', () => {
  const wing = checkedWith();
  show(wing, [['palm-short-50', 300], ['palm', 300]]);
  // Lost for a fifth of a second, held up: still up, and no flap as it's found again.
  assert.equal(show(wing, [[null, 200], ['palm', 300]]), 0);
  assert.equal(wing.up, true);
  // Gone for a second: the wing folds, and coming back up is a flap, as a hand that drops right down is often lost.
  assert.equal(show(wing, [[null, 1000]]), 0);
  assert.equal(wing.up, false);
  assert.equal(wing.seen, false);
  assert.ok(wing.lift < 0.1, `${wing.lift}`);
  assert.equal(show(wing, [['palm', 300]]), 1);
  // Back in the picture still hanging forwards, it hasn't flapped until it comes up.
  show(wing, [[null, 1000]]);
  assert.equal(show(wing, [['palm-short-50', 400]]), 0);
  assert.equal(show(wing, [['palm', 300]]), 1);
});

test('one look is not enough: a hand has to be seen twice running before it can flap', () => {
  const wing = checkedWith();
  show(wing, [[null, 1000]]);
  const image = seen('palm');
  wing.now += FRAME_MS;
  assert.equal(wing.update(image, FRAME_ASPECT, wing.now), false, 'the first look');
  wing.now += FRAME_MS;
  assert.equal(wing.update(image, FRAME_ASPECT, wing.now), true, 'and the second');
  assert.equal(WINGS.looks, 2);
});

test('the hand check sets each hand\'s held up, if it looked like a hand held up, and otherwise it\'s the usual hand\'s', () => {
  const held = checkedWith('palm');
  assert.equal(held.checked, true);
  assert.ok(Math.abs(held.flat - 0.663) < 0.01, `${held.flat}`);
  // A check made with the wrist dropped looks wider than any flat hand does, so it isn't believed.
  const dropped = checkedWith('palm-short-50');
  assert.deepEqual([dropped.checked, dropped.flat], [false, UPRIGHT.defaultWide]);
  // And it still flaps as the hand comes up from there.
  assert.equal(show(dropped, [['palm-short-50', 300], ['palm', 300]]), 1);
  // Fingers hanging down in the check are not how a hand looks held up, so they aren't taken for it.
  const hanging = new Wing();
  for (let i = 0; i < 20; i += 1) hanging.sample(seen('palm-turn-180'), FRAME_ASPECT);
  hanging.calibrate();
  assert.deepEqual([hanging.checked, hanging.flat], [false, UPRIGHT.defaultWide]);
  // With no check at all, the usual hand's.
  const unchecked = new Wing();
  unchecked.calibrate();
  assert.deepEqual([unchecked.checked, unchecked.flat], [false, UPRIGHT.defaultWide]);
  // Another hand, the back of it: its own.
  const back = checkedWith('back');
  assert.equal(back.checked, true);
  back.now = 10_000;
  assert.equal(show(back, [['back-short-50', 300], ['back', 300]]), 1);
});

test('a hand that can\'t be trusted is no wing: missing, cut off by the edge, too far away or touching the other one', () => {
  const image = seen('palm');
  const view = (change = {}) => ({ image, status: 'closed', reason: 'closed', ...change });
  assert.equal(trusted(view()), image);
  assert.equal(trusted(view({ status: 'open', reason: null })), image);
  assert.equal(trusted(view({ status: 'missing', reason: 'missing' })), null);
  assert.equal(trusted(view({ reason: 'edge' })), null);
  assert.equal(trusted(view({ reason: 'small' })), null);
  assert.equal(trusted(view({ reason: 'overlap' })), null);
  assert.equal(trusted(view(), true), null, 'the two hands are touching');
  assert.equal(trusted({ image: null, status: 'missing' }), null);
  assert.equal(trusted(undefined), null);
});

test('both hands are read at once, each its own wing, through the real hand monitor', () => {
  const { monitor, clock } = setup({}, 'right');
  const wings = new Wings();
  const flapped = { left: 0, right: 0 };
  let last = null;
  const play = (left, right, ms) => {
    for (let elapsed = 0; elapsed < ms; elapsed += FRAME_MS) {
      clock.now += FRAME_MS;
      const snapshot = monitor.update([leftHand(left), rightHand(right)], clock.now, FRAME_ASPECT);
      const images = { [snapshot.side]: trusted(snapshot[snapshot.side], snapshot.overlap), [snapshot.other.side]: trusted(snapshot.other, snapshot.overlap) };
      last = wings.update(images, FRAME_ASPECT, clock.now);
      for (const side of last.flaps) flapped[side] += 1;
    }
  };
  play('palm-short-50', 'palm-short-50', 500);
  assert.deepEqual(flapped, { left: 0, right: 0 });
  // Only the right hand comes up.
  play('palm-short-50', 'palm', 400);
  assert.deepEqual(flapped, { left: 0, right: 1 });
  assert.deepEqual([last.wings.left.up, last.wings.right.up], [false, true]);
  assert.ok(last.wings.right.lift > 0.9 && last.wings.left.lift < 0.2);
  // Then the left, with the right still up.
  play('palm', 'palm', 400);
  assert.deepEqual(flapped, { left: 1, right: 1 });
  // Both down, and both up together.
  play('palm-short-50', 'palm-short-50', 400);
  play('palm', 'palm', 400);
  assert.deepEqual(flapped, { left: 2, right: 2 });
  assert.deepEqual([last.wings.left.seen, last.wings.right.seen], [true, true]);
});

test('with one hand working both wings, the other hand is left alone, and both wings go as that one does', () => {
  const wings = new Wings();
  let now = 1000;
  const play = (left, right, ms) => {
    let flaps = [];
    let last = null;
    for (let elapsed = 0; elapsed < ms; elapsed += FRAME_MS) {
      now += FRAME_MS;
      last = wings.update({ left: left && seen(left, 'left'), right: right && seen(right) }, FRAME_ASPECT, now, { only: 'right' });
      flaps = flaps.concat(last.flaps);
    }
    return { flaps, wings: last.wings };
  };
  play('palm-short-50', 'palm-short-50', 400);
  // The left hand coming up does nothing.
  assert.deepEqual(play('palm', 'palm-short-50', 400).flaps, []);
  // The right hand coming up flaps, once, and both wings are up.
  const both = play('palm', 'palm', 400);
  assert.deepEqual(both.flaps, ['right']);
  assert.deepEqual([both.wings.left.up, both.wings.right.up], [true, true]);
  assert.equal(both.wings.left.lift, both.wings.right.lift);
  // With no left hand in the picture at all, it's the same.
  play(null, 'palm-short-50', 400);
  assert.deepEqual(play(null, 'palm', 400).flaps, ['right']);
});

test('the gauge by each wing fills as the hand comes up towards a flap', () => {
  const wing = checkedWith();
  show(wing, [['palm-short-50', 400]]);
  assert.ok(wing.progress(WINGS.rises.lots) < 0.1);
  show(wing, [['palm-short-60', 400]]);
  const part = wing.progress(WINGS.rises.lots);
  assert.ok(part > 0.1 && part < 0.5, `${part}`);
  show(wing, [['palm', 400]], WINGS.rises.lots);
  assert.equal(wing.progress(WINGS.rises.lots), 1);
  assert.equal(new Wing().progress(), 0);
});

/* ---------- made-up children ---------- */

const still = (lift = 0) => ({ lift, up: lift > 0.5, seen: true });
const HANDS_DOWN = { wings: 0, keep: false };

/**
 * A child whose hands go up and down as choose(farm, seconds) says: { wings, keep }, how many hands to bring up, or
 * to leave them as they are. Their hands are a moment behind, as anyone's are, and hands that have been up a while
 * with the chick still on the ground come down, to flap again. most is how many hands they use. Returns the farm.
 */
function play(farm, choose = (game) => game.wants(), { seconds = 600, delay = 0.12, most = 2, until = () => false, flock = () => [] } = {}) {
  const hands = { left: false, right: false };
  const queue = [];
  let upFor = 0;
  let rest = 0;
  if (!farm.started) farm.begin();
  for (let t = 0; t < seconds && !farm.done && !until(farm); t += DT) {
    let wanted = choose(farm, t);
    if (rest > 0) {
      rest -= DT;
      wanted = HANDS_DOWN;
    } else if (wanted.wings > 0 && !farm.chick.air && farm.chick.state === 'run' && upFor > 0.7) {
      rest = 0.35;
      wanted = HANDS_DOWN;
    }
    queue.push({ at: t + delay, wanted });
    let now = null;
    while (queue.length && queue[0].at <= t) now = queue.shift().wanted;
    const flaps = [];
    if (now && !now.keep) {
      const want = { right: Math.min(most, now.wings) >= 1, left: Math.min(most, now.wings) >= 2 };
      for (const side of ['left', 'right']) {
        if (want[side] && !hands[side]) flaps.push(side);
        hands[side] = want[side];
      }
    }
    upFor = hands.left || hands.right ? upFor + DT : 0;
    farm.update(DT, { wings: { left: still(hands.left ? 1 : 0), right: still(hands.right ? 1 : 0) }, flaps, flock: flock(farm) });
  }
  return farm;
}

/** Runs the rules for a while with the hands as they're given, flapping the wings named on the first frame. */
function run(farm, seconds, { flaps = [], wings = { left: still(), right: still() }, open = {}, flock = [] } = {}) {
  if (!farm.started) farm.begin();
  let first = true;
  for (let t = 0; t < seconds; t += DT) {
    farm.update(DT, { wings, flaps: first ? flaps : [], open, flock });
    first = false;
  }
  return farm;
}

/** A farm with one kind of thing first in the way, and what's heard from it. */
function farmWith(kind, options = {}) {
  const level = { log: 1, fence: 3, pond: 4, scarecrow: 5, gust: 6, hay: 7, duckpond: 8, tractor: 9, fox: 10 }[kind];
  const events = [];
  const farm = new Farm({ level, random: seededRandom(7), onEvent: (event) => events.push(event), ...options });
  // The level's own thing is among the first three, and whatever comes before it is taken away.
  const at = farm.things.findIndex((thing) => thing.kind === kind);
  assert.ok(at >= 0 && at <= 3, `${kind} comes early at level ${level}`);
  const shift = farm.things[at].x0 - FIRST;
  farm.things.splice(0, at);
  for (const thing of farm.things) {
    thing.x0 -= shift;
    thing.x1 -= shift;
    if (thing.duck) thing.duck.x -= shift;
  }
  for (const piece of farm.corn) piece.x -= shift;
  farm.corn = farm.corn.filter((piece) => piece.x > 2);
  farm.end -= shift;
  return { farm, events, thing: farm.things[0], heard: (type) => events.filter((event) => event.type === type) };
}

/** A farm with nothing in the way, and the hen house a long way off: for looking at the flight by itself. */
function openField(options = {}) {
  const farm = new Farm({ things: 0, ...options });
  farm.end = 1000;
  return farm;
}

/** Runs until the chick is so far from the front of a thing, with its hands down. */
function approach(farm, thing, gap) {
  if (!farm.started) farm.begin();
  for (let n = 0; n < 60 * 60 && thing.x0 - CHICK.r - farm.chick.x > gap; n += 1) farm.update(DT, {});
  return farm;
}

/* ---------- the flight ---------- */

test('one wing\'s flap is a hop over a log, and both wings together go twice as high, over a fence', () => {
  assert.ok(Math.abs(Math.max(...Array.from({ length: 300 }, (_, n) => heightAfter(n / 100, 1))) - CHICK.hop) < 0.01);
  assert.ok(Math.abs(Math.max(...Array.from({ length: 300 }, (_, n) => heightAfter(n / 100, 2))) - CHICK.hop * 2) < 0.01);
  assert.ok(CHICK.hop > KINDS.log.tall + 0.5 && CHICK.hop > KINDS.hay.tall + 0.2, 'one wing clears a log and a bale');
  assert.ok(CHICK.hop < KINDS.fence.tall && CHICK.hop * CHICK.open < KINDS.fence.tall, 'and not a fence, even with the hand open');
  assert.ok(CHICK.hop * 2 > KINDS.fence.tall + 0.7 && CHICK.hop * 2 > KINDS.tractor.tall + 0.7 && CHICK.hop * 2 > KINDS.fox.tall + 1);
  assert.equal(flapWindow(KINDS.fence.tall, 1), null);
  // The rules fly it as the sums say: up to the top and down again, on the same wings.
  for (const [flaps, top] of [[['right'], CHICK.hop], [['left', 'right'], CHICK.hop * 2]]) {
    const farm = openField();
    farm.begin();
    let highest = 0;
    for (let t = 0; t < 4; t += DT) {
      farm.update(DT, { flaps: t === 0 ? flaps : [] });
      highest = Math.max(highest, farm.chick.h);
      assert.ok(Math.abs(farm.chick.h - heightAfter(t + DT, flaps.length)) < 0.06, `${flaps.length} wings, ${t.toFixed(2)} s: ${farm.chick.h}`);
    }
    assert.ok(Math.abs(highest - top) < 0.03, `${highest}`);
    assert.equal(farm.chick.air, false, 'and it lands');
  }
});

test('there\'s more than a second to flap for a log, and well over a second for a fence, with the wings dropped straight after', () => {
  const log = flapWindow(KINDS.log.tall, 1);
  const fence = flapWindow(KINDS.fence.tall, 2);
  assert.ok(log.early - log.late > 1.1, `a log: ${log.early - log.late} s`);
  assert.ok(fence.early - fence.late > 1.2, `a fence: ${fence.early - fence.late} s`);
  assert.ok(flapWindow(KINDS.hay.tall, 1).early - flapWindow(KINDS.hay.tall, 1).late > 0.6);
  // And the painted stretch before each is where that is, for a chick running at the level's pace.
  const farm = new Farm({ level: 3, random: seededRandom(1) });
  const fenceThing = farm.things.find((thing) => thing.kind === 'fence');
  const zone = farm.zoneOf(fenceThing);
  assert.ok(Math.abs(zone.to - (fenceThing.x0 - CHICK.r - fence.late * farm.plan.speed)) < 1e-9);
  assert.ok(Math.abs(zone.from - (fenceThing.x0 - CHICK.r - fence.early * farm.plan.speed)) < 1e-9);
  assert.ok(zone.to - zone.from > 2.5, 'a good long stretch');
});

test('a flap anywhere on the painted stretch clears the thing, with the wings dropped straight after', () => {
  for (const [kind, wings] of [['log', ['right']], ['fence', ['left', 'right']], ['hay', ['right']]]) {
    for (const share of [0.02, 0.25, 0.5, 0.75, 0.98]) {
      const { farm, thing, heard } = farmWith(kind);
      const zone = farm.zoneOf(thing);
      const at = zone.from + (zone.to - zone.from) * share;
      farm.begin();
      while (farm.chick.x < at) farm.update(DT, {});
      farm.update(DT, { flaps: wings });
      while (!thing.done && farm.time < 30) farm.update(DT, {});
      assert.equal(thing.done, true);
      assert.equal(thing.clean, true, `${kind}, flapped ${Math.round(share * 100)}% of the way along the stretch`);
      assert.equal(heard('tumble').length + heard('wait').length, 0);
    }
  }
  // And one made well before the stretch comes down too soon.
  const { farm, thing } = farmWith('log');
  run(approach(farm, thing, 7), 0.05, { flaps: ['right'] });
  while (!thing.done && farm.time < 30) farm.update(DT, {});
  assert.equal(thing.clean, false);
});

test('holding the wings up is a glide: the chick comes down four times as slowly with both up, and half way between with one', () => {
  // Seconds from the top of a flap by both wings back down to the ground, with the wings held like this.
  const fall = (wings) => {
    const farm = openField();
    run(farm, 0.05, { flaps: ['left', 'right'] });
    let seconds = 0;
    while (farm.chick.air && seconds < 30) {
      farm.update(DT, { wings });
      if (farm.chick.vy <= 0) seconds += DT;
    }
    return seconds;
  };
  const dropped = fall({ left: still(0), right: still(0) });
  const one = fall({ left: still(0), right: still(1) });
  const both = fall({ left: still(1), right: still(1) });
  assert.ok(dropped > 1.6 && dropped < 2.1, `${dropped}`);
  assert.ok(both > dropped * 3.4 && both < dropped * 4.2, `${both} s gliding, ${dropped} s not`);
  assert.ok(one > dropped * 1.3 && one < both * 0.6, `${one}`);
  assert.equal(CHICK.sink / CHICK.glide > 4, true);
  // With nobody holding anything up, it's the flight the sums give: a little under three seconds in the air.
  assert.ok(Math.abs(heightAfter(2.9, 2)) < 0.1 && heightAfter(2.7, 2) > 0.2);
});

test('the same wing again in the air only keeps the chick up: it takes the other wing to climb over a fence', () => {
  // The wings named flap one after another, so far apart, and this is how high the chick gets and how long it's up.
  const fly = (sequence, every = 0.45) => {
    const farm = openField();
    farm.begin();
    let highest = 0;
    let next = 0;
    let aloft = 0;
    for (let t = 0; t < 12; t += DT) {
      const flaps = next < sequence.length && t >= next * every ? [sequence[next]] : [];
      if (flaps.length) next += 1;
      farm.update(DT, { flaps });
      highest = Math.max(highest, farm.chick.h);
      if (farm.chick.air) aloft += DT;
    }
    return { highest, aloft };
  };
  // However often one wing flaps, and however quickly, the chick never gets above where one hop takes it.
  for (const every of [0.3, 0.45, 0.6, 0.75]) {
    const alone = fly(Array(12).fill('right'), every);
    assert.ok(alone.highest < CHICK.hop + 0.02, `one wing every ${every} s gets to ${alone.highest}`);
    assert.ok(alone.highest < KINDS.fence.tall - 0.4);
    // But it does stay up, for as long as the wing keeps going: long enough for any pond.
    assert.ok(alone.aloft > every * 11, `and stays up ${alone.aloft} s`);
  }
  const turns = fly(['right', 'left', 'right']);
  assert.ok(turns.highest > KINDS.fence.tall + 0.5, `the two wings in turn get to ${turns.highest}`);
  // One flap by itself is in the air for under two seconds.
  assert.ok(fly(['right']).aloft < 1.9);
  // Back on the ground, the same wing's flap is a whole one again.
  const farm = openField();
  run(farm, 4, { flaps: ['right'] });
  assert.equal(farm.chick.air, false);
  run(farm, 0.05, { flaps: ['right'] });
  assert.ok(Math.abs(farm.chick.vy - Math.sqrt(2 * CHICK.gravity * CHICK.hop)) < 0.4);
});

test('a flap with the hand open is a little stronger, and a closed hand\'s is a whole flap all the same', () => {
  const top = (open) => {
    const farm = openField();
    farm.begin();
    let highest = 0;
    for (let t = 0; t < 3; t += DT) {
      farm.update(DT, { flaps: t === 0 ? ['right'] : [], open });
      highest = Math.max(highest, farm.chick.h);
    }
    return { highest, open: farm.stats.open };
  };
  const closed = top({});
  const opened = top({ right: true });
  assert.ok(Math.abs(closed.highest - CHICK.hop) < 0.03);
  assert.ok(Math.abs(opened.highest - CHICK.hop * CHICK.open) < 0.04, `${opened.highest}`);
  assert.deepEqual([closed.open, opened.open], [0, 1]);
});

test('the chick never goes higher than the sky, however much it flaps', () => {
  const farm = openField();
  farm.begin();
  let highest = 0;
  for (let t = 0; t < 12; t += DT) {
    const beat = Math.floor(t / 0.3);
    farm.update(DT, { flaps: Math.floor((t - DT) / 0.3) !== beat ? [beat % 2 ? 'left' : 'right'] : [] });
    highest = Math.max(highest, farm.chick.h);
  }
  assert.equal(highest, CHICK.ceiling);
});

/* ---------- what's in the way, and resting ---------- */

test('a child who isn\'t flapping finds the chick waiting at whatever is in the way, for as long as it takes, and the fox waiting too', () => {
  for (const kind of ['log', 'fence', 'pond', 'hay', 'duckpond', 'fox']) {
    const { farm, thing, heard } = farmWith(kind);
    run(farm, 40);
    const stop = thing.x0 - CHICK.r - (thing.standoff ?? 0);
    assert.ok(Math.abs(farm.chick.x - stop) < 0.01, `${kind}: stopped at ${farm.chick.x}, in front of it at ${stop}`);
    assert.equal(farm.chick.waiting, thing);
    assert.equal(farm.resting, true);
    assert.equal(farm.fox.sitting, true, `${kind}: the fox sits`);
    assert.equal(farm.fox.gap, FOX.start, `${kind}: and comes no nearer`);
    assert.equal(heard('wait').length, 1);
    assert.deepEqual([farm.stats.tumbles, farm.stats.splashes, farm.stats.hen], [0, 0, 0], kind);
    // And a flap, whenever it comes, carries it over.
    run(farm, 0.05, { flaps: ['left', 'right'] });
    run(farm, 8, { wings: { left: still(1), right: still(1) } });
    assert.equal(thing.done, true, `${kind}: over it`);
    assert.equal(farm.chick.waiting === thing, false);
  }
});

test('resting all the way never loses anything: the chick just waits, with nothing taken away', () => {
  const farm = new Farm({ level: 6, random: seededRandom(3) });
  run(farm, 300);
  assert.ok(farm.chick.waiting);
  assert.equal(farm.done, false);
  assert.deepEqual([farm.stats.tumbles, farm.stats.splashes, farm.stats.bonks, farm.stats.hen], [0, 0, 0, 0]);
  assert.ok(farm.fox.gap >= FOX.start);
});

test('a flap that was too early has the chick tumble over the log, and the fox come nearer', () => {
  const { farm, thing, heard } = farmWith('log');
  run(approach(farm, thing, 7), 0.05, { flaps: ['right'] });
  while (farm.chick.state === 'run' && farm.time < 30) farm.update(DT, {});
  assert.equal(farm.chick.state, 'tumble');
  assert.equal(heard('tumble').length, 1);
  assert.equal(farm.stats.tumbles, 1);
  assert.ok(Math.abs(farm.fox.gap - (FOX.start - FOX.nearer)) < 1e-9);
  // It rolls over the log and is on its feet beyond it, a second later.
  run(farm, CHICK.tumble + 0.1);
  assert.equal(farm.chick.state, 'run');
  assert.ok(farm.chick.x > thing.x1 + CHICK.r);
  assert.equal(farm.chick.h, 0);
  assert.equal(thing.done, true);
  assert.equal(farm.stats.clean, 0);
});

test('one wing at a fence is too small a flap: a tumble, the first time', () => {
  const { farm, thing } = farmWith('fence');
  const zone = farm.zoneOf(thing);
  farm.begin();
  while (farm.chick.x < (zone.from + zone.to) / 2) farm.update(DT, {});
  run(farm, 0.05, { flaps: ['right'] });
  let highest = 0;
  while (farm.chick.state === 'run' && farm.time < 30) {
    farm.update(DT, {});
    highest = Math.max(highest, farm.chick.h);
  }
  assert.ok(highest < KINDS.fence.tall);
  assert.equal(farm.chick.state, 'tumble');
});

test('the chick never tumbles twice running: after a tumble it waits at the next thing, and tumbles again only after one cleared cleanly', () => {
  const farm = new Farm({ level: 1, random: seededRandom(11) });
  const early = (game) => {
    const { next } = game;
    if (!next || game.chick.air) return HANDS_DOWN;
    if (game.chick.waiting) return { wings: 1, keep: false };
    const gap = next.x0 - game.chick.x;
    return { wings: gap < 7.2 && gap > 6 ? 1 : 0, keep: false };
  };
  const [first, second, third, fourth] = farm.things;
  play(farm, early, { until: () => second.done });
  assert.equal(farm.stats.tumbles, 1, 'over the first');
  assert.equal(first.clean, false);
  assert.equal(second.stopped, true, 'and a stop at the second, where it flapped too early again');
  assert.ok(Math.abs(farm.fox.gap - (FOX.start - FOX.nearer)) < 1e-9, 'so the fox came nearer only once');
  // The third is flown over as it should be, and the fourth, too early again, is a tumble.
  play(farm, (game) => (game.next === third ? game.wants() : early(game)), { until: () => fourth.done });
  assert.equal(third.clean, true);
  assert.equal(farm.stats.tumbles, 2);
  assert.ok(Math.abs(farm.fox.gap - (FOX.start - FOX.nearer + FOX.further - FOX.nearer)) < 1e-9);
});

test('set to wait, the chick never tumbles into anything, and the fox keeps his distance whatever happens', () => {
  assert.deepEqual(FOX_NAMES, ['catch', 'tumble', 'wait']);
  const farm = new Farm({ level: 5, fox: 'wait', random: seededRandom(4) });
  // Too early every time, and flying into the scarecrow and the ponds.
  play(farm, (game) => {
    const { next } = game;
    if (!next || game.chick.air) return HANDS_DOWN;
    if (game.chick.waiting) return { wings: 2, keep: false };
    const gap = next.x0 - game.chick.x;
    return { wings: gap < 7.2 && gap > 6 ? 2 : 0, keep: false };
  });
  assert.equal(farm.done, true);
  assert.equal(farm.stats.tumbles, 0);
  assert.ok(farm.stats.bonks + farm.stats.splashes > 0, 'it did bump and splash');
  assert.ok(farm.fox.gap >= FOX.start, 'he\'s never nearer than he started');
  assert.equal(farm.stats.hen, 0);
  // The same child with the fox set to come nearer: tumbles, and a nearer fox.
  const lively = new Farm({ level: 5, fox: 'tumble', random: seededRandom(4) });
  let nearest = FOX.start;
  play(lively, (game) => {
    nearest = Math.min(nearest, game.fox.gap);
    const { next } = game;
    if (!next || game.chick.air) return HANDS_DOWN;
    if (game.chick.waiting) return { wings: 2, keep: false };
    const gap = next.x0 - game.chick.x;
    return { wings: gap < 7.2 && gap > 6 ? 2 : 0, keep: false };
  });
  assert.ok(lively.stats.tumbles >= 1);
  assert.ok(nearest < FOX.start);
});

test('after three flaps at one thing that didn\'t get over it, the mother hen carries the chick over', () => {
  const { farm, thing, heard } = farmWith('fence', { fox: 'wait' });
  run(farm, 12);
  assert.equal(farm.chick.waiting, thing);
  for (let n = 1; n <= HEN.fails; n += 1) {
    run(farm, 0.05, { flaps: ['right'] });
    run(farm, 2.5);
    assert.equal(thing.fails, n);
  }
  assert.equal(farm.chick.state, 'carried');
  assert.deepEqual(heard('hen').map((event) => event.why), ['help']);
  // Up, over the fence, and down beyond it, with nothing lost.
  let highest = 0;
  while (farm.chick.state === 'carried') {
    farm.update(DT, {});
    highest = Math.max(highest, farm.chick.h);
  }
  assert.ok(highest > KINDS.fence.tall);
  assert.ok(farm.chick.x > thing.x1 + CHICK.r);
  assert.equal(farm.chick.h, 0);
  assert.equal(thing.done, true);
  assert.equal(farm.stats.hen, 1);
  assert.equal(heard('set-down').length, 1);
  assert.equal(farm.fox.gap, FOX.start);
});

test('the fox never catches anyone: when he\'s right behind, the hen carries the chick on, and he sits a good way back', () => {
  const { farm, heard } = farmWith('log');
  farm.fox.gap = FOX.caught + FOX.nearer - 0.01;
  const [thing] = farm.things;
  run(approach(farm, thing, 7), 0.05, { flaps: ['right'] });
  while (farm.chick.state !== 'tumble' && farm.time < 30) farm.update(DT, {});
  assert.equal(farm.fox.gap, FOX.caught, 'never nearer than that');
  run(farm, CHICK.tumble + 0.05);
  assert.equal(farm.chick.state, 'carried');
  assert.deepEqual(heard('hen').map((event) => event.why), ['caught']);
  assert.equal(farm.fox.sitting, true);
  const from = farm.chick.x;
  while (farm.chick.state === 'carried') farm.update(DT, {});
  assert.ok(farm.chick.x > from + 2, 'set down further on, never back');
  assert.equal(farm.fox.gap, FOX.after);
  assert.ok(FOX.after > FOX.start);
  // And nothing in the way where she sets it down.
  assert.equal(farm.floorAt(farm.chick.x), 0);
  assert.equal(farm.waterAt(farm.chick.x), null);
});

test('each thing flown over without a stop takes the chick further ahead of the fox, up to a limit', () => {
  const farm = new Farm({ level: 1, random: seededRandom(2) });
  play(farm);
  assert.equal(farm.done, true);
  assert.equal(farm.stats.clean, WAYS.medium);
  assert.equal(farm.fox.gap, FOX.most);
  assert.ok(FOX.start + 2 * FOX.further < FOX.most + 0.3);
});

test('the pond: on the ground the chick stops at the bank, a flap that comes down in the water is a splash, and the wings held up carry it over', () => {
  // One wing, let go at once, comes down in the middle.
  const short = farmWith('pond');
  run(short.farm, 12);
  assert.equal(short.farm.chick.waiting, short.thing);
  run(short.farm, 0.05, { flaps: ['right'] });
  while (short.farm.chick.state === 'run' && short.farm.time < 40) short.farm.update(DT, {});
  assert.equal(short.farm.chick.state, 'splash');
  assert.equal(short.heard('splash').length, 1);
  assert.ok(short.farm.chick.x > short.thing.x0 && short.farm.chick.x < short.thing.x1);
  // It flutters out onto the far bank, and is on its way again: nothing is done twice.
  run(short.farm, CHICK.splash + 0.1);
  assert.equal(short.farm.chick.state, 'run');
  assert.ok(short.farm.chick.x > short.thing.x1 + CHICK.r);
  assert.equal(short.thing.done, true);
  assert.equal(short.farm.stats.splashes, 1);
  // Both wings, held up: over.
  const held = farmWith('pond');
  run(held.farm, 12);
  run(held.farm, 0.05, { flaps: ['left', 'right'] });
  run(held.farm, 6, { wings: { left: still(1), right: still(1) } });
  assert.equal(held.thing.done, true);
  assert.equal(held.farm.stats.splashes, 0);
  // The pond is as wide as two seconds of running, whatever the level's pace.
  for (const level of [4, 10]) {
    const pond = layTrack({ level, random: seededRandom(1) }).things.find((thing) => thing.kind === 'pond');
    assert.ok(Math.abs(pond.x1 - pond.x0 - KINDS.pond.seconds * farmLevel(level).speed) < 1e-9);
  }
});

test('the scarecrow: running under is free, and flying into his arm is a bump, a drop and a dizzy moment', () => {
  // Hands down all the way: under, and clean.
  const under = farmWith('scarecrow');
  run(under.farm, 12);
  assert.equal(under.thing.done, true);
  assert.equal(under.thing.clean, true);
  assert.equal(under.farm.stats.bonks, 0);
  // Flying as it gets there: a bump.
  const into = farmWith('scarecrow');
  approach(into.farm, into.thing, 1.2);
  run(into.farm, 0.05, { flaps: ['left', 'right'] });
  while (!into.thing.bonked && into.farm.time < 30) into.farm.update(DT, { wings: { left: still(1), right: still(1) } });
  assert.equal(into.heard('bonk').length, 1);
  assert.ok(into.farm.chick.h + CHICK.tall < into.thing.low, 'knocked down to under his arm');
  assert.ok(into.farm.chick.dizzy > 0);
  // Dizzy, a flap does nothing, so it can't bump him twice.
  run(into.farm, 0.05, { flaps: ['left', 'right'] });
  assert.ok(into.farm.chick.vy <= 0);
  run(into.farm, 6);
  assert.equal(into.thing.done, true);
  assert.equal(into.farm.stats.bonks, 1);
  assert.ok(Math.abs(into.farm.fox.gap - (FOX.start - FOX.nearer)) < 1e-9);
  // High enough to be over his hat is over him altogether.
  const over = farmWith('scarecrow');
  approach(over.farm, over.thing, 3);
  over.farm.chick.h = KINDS.scarecrow.top + 0.9;
  over.farm.chick.air = true;
  run(over.farm, 3, { wings: { left: still(1), right: still(1) } });
  assert.equal(over.thing.done, true);
  assert.equal(over.farm.stats.bonks, 0);
  assert.ok(KINDS.scarecrow.top + 0.9 < CHICK.ceiling && KINDS.scarecrow.low > CHICK.tall + 0.5, 'there\'s room over him and under him');
});

test('a gust of wind carries a chick that\'s in the air up and over what\'s in it, from one flap by one wing', () => {
  const { farm, thing, heard } = farmWith('gust');
  const inside = farm.things.find((each) => each.inGust === thing.id);
  assert.ok(inside && ['pond', 'fence'].includes(inside.kind));
  approach(farm, thing, -0.6);
  // On the ground the wind does nothing.
  assert.equal(farm.chick.h, 0);
  assert.equal(heard('gust').length, 0);
  run(farm, 0.05, { flaps: ['right'] });
  let highest = 0;
  while (!inside.done && farm.time < 30) {
    farm.update(DT, {});
    highest = Math.max(highest, farm.chick.h);
  }
  assert.equal(inside.clean, true, 'over the thing in it, with the wings dropped');
  assert.ok(Math.abs(highest - GUST.high) < 0.3, `carried to ${highest}`);
  assert.equal(heard('gust').length, 1);
  assert.equal(farm.stats.splashes + farm.stats.tumbles, 0);
  // Out of the wind, it comes down as usual.
  run(farm, 4);
  assert.equal(farm.chick.air, false);
});

test('hay bales come in a row: the chick lands on top of one, runs along it, and hops to the next', () => {
  const { farm, thing } = farmWith('hay');
  const bales = farm.things.filter((each) => each.kind === 'hay').slice(0, HAY.bales);
  assert.equal(bales.length, HAY.bales);
  assert.equal(bales.filter((bale) => bale.first).length, 1);
  assert.ok(Math.abs(bales[1].x0 - bales[0].x1 - HAY.gap) < 1e-9);
  // One wing from the stretch before the first puts it on top, or over.
  const zone = farm.zoneOf(thing);
  farm.begin();
  while (farm.chick.x < (zone.from + zone.to) / 2) farm.update(DT, {});
  run(farm, 0.05, { flaps: ['right'] });
  // Brought down onto the first bale, it stands on it.
  farm.chick.x = thing.x0 + 0.3;
  farm.chick.h = thing.tall + 0.2;
  farm.chick.vy = -1;
  run(farm, 0.3);
  assert.equal(farm.chick.air, false);
  assert.ok(Math.abs(farm.chick.h - thing.tall) < 1e-9, 'on top of the bale');
  assert.equal(farm.floorAt(thing.x0 + 0.5), thing.tall);
  // Off the end, it comes down into the gap, and waits at the next bale without a tumble: it hadn't flapped at it.
  run(farm, 3);
  assert.equal(farm.chick.h, 0);
  assert.equal(farm.chick.waiting, bales[1]);
  assert.equal(farm.stats.tumbles, 0);
  // A whole row is one thing got past.
  const whole = farmWith('hay');
  play(whole.farm, undefined, { until: (game) => game.things.filter((each) => each.kind === 'hay').slice(0, HAY.bales).every((bale) => bale.done) });
  assert.equal(whole.farm.stats.cleared, 1);
});

test('the friendly duck: she comes to wherever the chick is coming down over her pond, catches it, and gives it a ride to the bank', () => {
  const { farm, thing, heard } = farmWith('duckpond');
  assert.ok(thing.x1 - thing.x0 > KINDS.pond.seconds * farm.plan.speed * 1.5, 'a wider pond than the plain one');
  run(farm, 12);
  assert.equal(farm.chick.waiting, thing);
  const before = thing.duck.x;
  // One wing, let go at once: it would be a splash, in a plain pond.
  run(farm, 0.05, { flaps: ['right'] });
  while (farm.chick.state === 'run' && farm.time < 40) farm.update(DT, {});
  assert.equal(farm.chick.state, 'ride');
  assert.equal(heard('ride').length, 1);
  assert.equal(farm.stats.splashes, 0);
  assert.ok(Math.abs(farm.chick.h - DUCK.tall) < 1e-9);
  assert.ok(Math.abs(thing.duck.x - farm.chick.x) < 1e-9, 'on her back');
  assert.notEqual(thing.duck.x, before, 'she swam to it');
  // She swims it to the far bank, and it hops off.
  const from = farm.chick.x;
  while (farm.chick.state === 'ride' && farm.time < 60) farm.update(DT, {});
  assert.ok(farm.chick.x > from + 1);
  assert.equal(heard('ride-off').length, 1);
  run(farm, 2);
  assert.equal(thing.done, true);
  assert.equal(farm.stats.cleared, 1);
  assert.equal(farm.stats.rides, 1);
  assert.equal(farm.fox.gap >= FOX.start, true, 'a ride costs nothing');
  // A flap takes off from her back, too.
  const off = farmWith('duckpond');
  run(off.farm, 12);
  run(off.farm, 0.05, { flaps: ['right'] });
  while (off.farm.chick.state === 'run' && off.farm.time < 40) off.farm.update(DT, {});
  run(off.farm, 0.05, { flaps: ['left', 'right'] });
  assert.equal(off.farm.chick.state, 'run');
  assert.equal(off.farm.chick.air, true);
  assert.equal(off.thing.duck.riding, false);
});

test('the tractor trundles along ahead: a chick on the ground trots after it, both wings fly over it, and it turns off by itself', () => {
  const { farm, thing, heard } = farmWith('tractor');
  farm.begin();
  const start = thing.x0;
  run(farm, 4.2);
  assert.equal(heard('tractor').length, 1);
  assert.ok(thing.x0 > start + 1, 'it sets off as the chick comes up behind');
  // Behind it, on the ground: no tumble, no stop, just following at its pace.
  run(farm, 3);
  assert.equal(farm.chick.behind, thing);
  assert.ok(Math.abs(farm.chick.x - (thing.x0 - CHICK.r)) < 0.01);
  assert.equal(farm.stats.tumbles, 0);
  assert.equal(farm.chick.waiting, null);
  assert.equal(farm.fox.sitting, false);
  // Left alone, it turns off the track after a while, and the way is clear.
  const waited = farmWith('tractor');
  waited.farm.begin();
  while (!waited.thing.done && waited.farm.time < 60) waited.farm.update(DT, {});
  assert.ok(Math.abs(waited.farm.time - TRACTOR.goes / TRACTOR.speed) < 0.5, `it turned off after ${waited.farm.time} s`);
  assert.equal(waited.thing.away, true);
  assert.equal(waited.farm.chick.behind, null);
  assert.equal(waited.farm.floorAt(waited.thing.x0 + 1), 0, 'and it isn\'t there to stand on');
  assert.equal(waited.farm.stats.clean, 0, 'which isn\'t flying over it');
  const after = waited.farm.chick.x;
  run(waited.farm, 1);
  assert.ok(waited.farm.chick.x > after + 1.5, 'the chick runs on');
  // Both wings from behind it: over, landing on the hay or beyond.
  run(farm, 0.05, { flaps: ['left', 'right'] });
  run(farm, 8, { wings: { left: still(1), right: still(1) } });
  assert.equal(thing.done, true);
  assert.equal(thing.away, false);
  assert.ok(farm.chick.x > thing.x1);
  // Its corn rides on the hay, and goes along with it.
  const corn = farmWith('tractor').farm.corn.filter((piece) => piece.rides);
  assert.equal(corn.length, 4);
});

test('the fox\'s shortcut: he runs round behind the hedge, waits on the track ahead, and leaps and misses as the chick flies over', () => {
  const { farm, thing, heard } = farmWith('fox');
  farm.begin();
  farm.update(DT, {});
  // He sets off at once, as the chick is near enough already, and the chaser is gone from behind.
  assert.equal(farm.fox.mode, 'dash');
  assert.equal(heard('shortcut').length, 1);
  assert.equal(thing.waiting, false);
  assert.equal(farm.floorAt(thing.x0 + 0.5), 0, 'not there yet');
  run(farm, 2.05);
  assert.equal(farm.fox.mode, 'ahead');
  assert.equal(thing.waiting, true);
  assert.equal(heard('fox-ahead').length, 1);
  // Flown over, he leaps and misses, and he's behind again, a good way back.
  play(farm, undefined, { until: () => thing.done });
  assert.equal(thing.clean, true);
  assert.equal(heard('pounce').length, 1);
  assert.equal(farm.fox.mode, 'chase');
  assert.ok(farm.fox.gap >= FOX.after);
  assert.equal(farm.stats.hen, 0);
});

test('down in front of the fox on the track, the mother hen is there first', () => {
  const { farm, thing, heard } = farmWith('fox');
  run(farm, 14);
  // A chick on the ground stops well short of him.
  assert.ok(Math.abs(farm.chick.x - (thing.x0 - CHICK.r - FOX.standoff)) < 0.01);
  assert.equal(farm.chick.waiting, thing);
  // One wing isn't enough to get over him, and it comes down right in front of him.
  run(farm, 0.05, { flaps: ['right'] });
  while (farm.chick.state === 'run' && farm.time < 40) farm.update(DT, {});
  assert.equal(farm.chick.state, 'carried');
  assert.deepEqual(heard('hen').map((event) => event.why), ['fox']);
  while (farm.chick.state === 'carried') farm.update(DT, {});
  assert.ok(farm.chick.x > thing.x1 + CHICK.r);
  assert.equal(thing.done, true);
  assert.equal(farm.fox.mode, 'chase');
  assert.equal(farm.fox.gap, FOX.after);
});

test('corn is the chick\'s as it comes near, in the air or on the ground, and missing it costs nothing', () => {
  const farm = new Farm({ level: 2, random: seededRandom(5) });
  assert.ok(farm.corn.length >= 30);
  assert.equal(farm.stats.cornOut, farm.corn.length);
  play(farm);
  assert.equal(farm.done, true);
  assert.ok(farm.stats.corn >= farm.corn.length * 0.8, `a child who flaps in good time has most of it: ${farm.stats.corn} of ${farm.corn.length}`);
  assert.equal(farm.corn.filter((piece) => piece.taken).length, farm.stats.corn);
  // Resting, none of it is had, and nothing is lost.
  const resting = new Farm({ level: 2, random: seededRandom(5) });
  run(resting, 30);
  assert.equal(resting.stats.corn, 0);
  // There's none at level 1.
  assert.equal(new Farm({ level: 1 }).corn.length, 0);
});

test('at the hen house the chick is home: a little party, and then it\'s over', () => {
  const events = [];
  const farm = new Farm({ level: 1, things: WAYS.short, random: seededRandom(8), onEvent: (event) => events.push(event.type) });
  play(farm, undefined, { until: (game) => game.chick.state === 'home' });
  assert.equal(farm.done, false);
  assert.ok(Math.abs(farm.chick.x - (farm.end - HOME.door)) < 0.3);
  assert.deepEqual(events.filter((type) => type === 'door' || type === 'home'), ['door', 'home']);
  assert.equal(farm.fox.sitting, true);
  run(farm, HOME.party + 0.1);
  assert.equal(farm.done, true);
  assert.equal(farm.chick.h, 0);
  // Flying in, it comes down at the door.
  const flying = new Farm({ things: 0 });
  flying.begin();
  for (let t = 0; t < 30 && flying.chick.state === 'run'; t += DT) {
    const beat = Math.floor(t / 0.4);
    flying.update(DT, { flaps: Math.floor((t - DT) / 0.4) !== beat ? ['left', 'right'] : [] });
  }
  assert.equal(flying.chick.state, 'home');
  assert.ok(flying.chick.x <= flying.end);
  run(flying, HOME.party + 0.1);
  assert.equal(flying.done, true);
});

test('every flap is counted for the hand that made it, with the time each wing was held up and how often both flapped together', () => {
  const farm = openField();
  farm.begin();
  farm.update(DT, { flaps: ['left', 'right'] });
  run(farm, 1, { wings: { left: still(1), right: still(0) } });
  farm.update(DT, { flaps: ['right'] });
  run(farm, 0.2);
  farm.update(DT, { flaps: ['left'] });
  run(farm, 1);
  farm.update(DT, { flaps: ['left'] });
  assert.deepEqual(farm.stats.flaps, { left: 3, right: 2 });
  assert.equal(farm.stats.together, 2, 'both at once, and one a fifth of a second after the other');
  assert.ok(Math.abs(farm.stats.held.left - 1) < 0.05 && farm.stats.held.right === 0);
  // Flaps count while the chick is tumbling or being carried too: they're the child's own work.
  const { farm: busy, thing } = farmWith('log');
  run(approach(busy, thing, 7), 0.05, { flaps: ['right'] });
  while (busy.chick.state !== 'tumble') busy.update(DT, {});
  busy.update(DT, { flaps: ['left'] });
  assert.deepEqual(busy.stats.flaps, { left: 1, right: 1 });
  assert.equal(busy.chick.state, 'tumble');
});

test('with one hand working both wings, its flap is both wings\' and gets over a fence, and only that hand is counted', () => {
  const { farm, thing } = farmWith('fence', { single: 'right' });
  const zone = farm.zoneOf(thing);
  farm.begin();
  while (farm.chick.x < (zone.from + zone.to) / 2) farm.update(DT, {});
  // The other hand's flap, if one were ever passed on, does nothing and isn't counted.
  farm.update(DT, { flaps: ['left'] });
  assert.equal(farm.chick.air, false);
  farm.update(DT, { flaps: ['right'], wings: { left: still(1), right: still(1) } });
  while (!thing.done && farm.time < 30) farm.update(DT, {});
  assert.equal(thing.clean, true);
  assert.deepEqual(farm.stats.flaps, { left: 0, right: 1 });
  // And the same hand again in the air is a whole flap, as there's no other wing to take its turn.
  const free = openField({ single: 'left' });
  free.begin();
  let highest = 0;
  for (let t = 0; t < 3; t += DT) {
    free.update(DT, { flaps: Math.abs(t - 0) < 1e-9 || Math.abs(t - 0.5) < DT / 2 ? ['left'] : [] });
    highest = Math.max(highest, free.chick.h);
  }
  assert.ok(highest > CHICK.hop * 2.5, `${highest}`);
});

/* ---------- the ten levels ---------- */

test('each level is a little quicker and closer than the last, and level 10 still leaves three quarters of level 1\'s time', () => {
  for (let level = 2; level <= LAST_LEVEL; level += 1) {
    assert.ok(farmLevel(level).speed > farmLevel(level - 1).speed);
    assert.ok(timesAt(level).seen < timesAt(level - 1).seen);
    assert.ok(timesAt(level).between < timesAt(level - 1).between);
  }
  const [first, last] = [timesAt(1), timesAt(LAST_LEVEL)];
  // From a thing coming into view to the chick reaching it, and from one thing to the next.
  assert.ok(first.seen > 5 && first.between > 6, `level 1: ${first.seen} s to see it coming, ${first.between} s between`);
  assert.ok(last.seen / first.seen >= 0.7, `seen ${last.seen / first.seen}`);
  assert.ok(last.between / first.between >= 0.7, `between ${last.between / first.between}`);
  assert.ok(farmLevel(LAST_LEVEL).speed / farmLevel(1).speed <= 1.31);
  // The first thing is in view from the start, with nearly as long to get ready.
  assert.ok(FIRST <= AHEAD);
  assert.ok(FIRST / farmLevel(LAST_LEVEL).speed >= 0.7 * (FIRST / farmLevel(1).speed));
  // The time to flap is the same at every level: it's the flight's, and the flight doesn't change.
  assert.ok(flapWindow(KINDS.log.tall, 1).early > 1.3);
});

test('every level from 2 brings one new thing, which is on from that level, off before it, and has its label', () => {
  assert.deepEqual(Object.keys(NEWS).map(Number), [2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(farmNewAt(1), []);
  const keys = new Set();
  for (const [level, news] of Object.entries(NEWS)) {
    assert.equal(news.length, 1);
    const [{ key, mark, name, nameKa }] = news;
    assert.ok(mark && name && /[ა-ჿ]/.test(nameKa), `${name} has a picture and a Georgian name`);
    assert.ok(!keys.has(key));
    keys.add(key);
    assert.equal(newsIsOn(key, Number(level)), true, `${key} is on at level ${level}`);
    assert.equal(newsIsOn(key, Number(level) - 1), false, `${key} is off before it`);
    assert.equal(newsIsOn(key, LAST_LEVEL), true, 'and stays for the levels after');
    assert.deepEqual(farmNewAt(Number(level)), news);
    const [en, ka] = LABELS[key];
    assert.ok(en.length <= 28 && /[ა-ჿ]/.test(ka), `${key}'s label is short, and in Georgian too`);
  }
  for (const extra of ['hen', 'open', 'flock']) assert.ok(LABELS[extra]?.[1]);
  // Nothing an em dash, and nothing that names anyone.
  for (const [en] of Object.values(LABELS)) assert.ok(!en.includes('—'));
});

test('level 1 is low logs with long gaps, and each level\'s new thing really is on its track, among the first three things', () => {
  const kinds = (level, options) => layTrack({ level, random: seededRandom(level), ...options }).things.map((thing) => thing.kind);
  assert.deepEqual([...new Set(kinds(1))], ['log']);
  assert.deepEqual([...new Set(kinds(2))], ['log']);
  const firstThree = (level) => layTrack({ level, random: seededRandom(level) }).things.filter((thing) => !thing.inGust && !(thing.kind === 'hay' && !thing.first)).slice(0, 3).map((thing) => thing.kind);
  for (const [level, kind] of [[3, 'fence'], [4, 'pond'], [5, 'scarecrow'], [6, 'gust'], [7, 'hay'], [8, 'duckpond'], [9, 'tractor'], [10, 'fox']]) {
    assert.ok(firstThree(level).includes(kind), `level ${level}: ${firstThree(level)}`);
    assert.ok(!kinds(level - 1).includes(kind), `no ${kind} at level ${level - 1}`);
    // And on the shortest way home, too.
    assert.ok(kinds(level, { things: WAYS.short }).includes(kind), `${kind} on a short way at level ${level}`);
  }
  // The newest comes first, except the fox, who needs the chick to have set off before he can run round it.
  for (const level of [3, 4, 5, 6, 7, 8, 9]) assert.equal(firstThree(level)[0], NEWS[level][0].key === 'gust' ? 'gust' : NEWS[level][0].key);
  assert.notEqual(firstThree(10)[0], 'fox');
  // Level 10 has all of it, on a long way home.
  const all = new Set(kinds(10, { things: WAYS.long }));
  for (const kind of ['log', 'fence', 'pond', 'scarecrow', 'gust', 'hay', 'duckpond', 'tractor', 'fox']) assert.ok(all.has(kind), kind);
  assert.equal(farmLevel(2).corn && !farmLevel(1).corn, true);
});

test('the way home is as long as a grown-up chose, at every level, laid out the same from the same seed', () => {
  assert.deepEqual(WAYS, { short: 8, medium: 12, long: 16 });
  for (const level of [1, 5, 10]) {
    for (const things of Object.values(WAYS)) {
      const farm = new Farm({ level, things, random: seededRandom(42) });
      assert.equal(farm.progress.of, things, `level ${level}: ${things} things to get past`);
      assert.equal(farm.progress.past, 0);
      // Never closer together than most of the level's spacing, from the back of one to the front of the next.
      const counted = farm.counted;
      for (let n = 1; n < counted.length; n += 1) {
        const before = farm.things.filter((thing) => thing.x1 <= counted[n].x0 + 0.01 && thing !== counted[n]).reduce((far, thing) => Math.max(far, thing.x1), 0);
        if (counted[n].inGust) continue;
        assert.ok(counted[n].x0 - before > farm.plan.spacing * 0.6, `level ${level}, thing ${n}: ${counted[n].x0 - before}`);
      }
      assert.ok(farm.end > farm.things.at(-1).x1 + HOME.before - 0.01);
    }
  }
  const same = (seed) => JSON.stringify(layTrack({ level: 7, random: seededRandom(seed) }));
  assert.equal(same(9), same(9));
  assert.notEqual(same(9), same(10));
  // A game lasts about as long at level 10 as at level 1, for a child who doesn't stop: never a third longer.
  const lasts = (level) => layTrack({ level, random: seededRandom(1) }).end / farmLevel(level).speed;
  assert.ok(lasts(10) < lasts(1) * 1.33, `${lasts(10)} s against ${lasts(1)} s`);
  assert.ok(lasts(1) > 60 && lasts(1) < 100);
});

test('a child who flaps in good time gets home cleanly at every level, with the fox left behind', () => {
  for (let level = 1; level <= LAST_LEVEL; level += 1) {
    const farm = play(new Farm({ level, random: seededRandom(level * 77) }));
    const { stats } = farm;
    assert.equal(farm.done, true, `level ${level}`);
    assert.deepEqual([stats.tumbles, stats.splashes, stats.bonks, stats.hen], [0, 0, 0, 0], `level ${level}`);
    assert.equal(stats.cleared, WAYS.medium, `level ${level}`);
    assert.ok(stats.clean >= WAYS.medium - 1, `level ${level}: ${stats.clean} clean`);
    assert.ok(farm.fox.gap >= FOX.start, `level ${level}`);
    assert.ok(stats.seconds < 110, `level ${level} took ${stats.seconds} s`);
  }
});

test('a child who only ever flaps one hand still gets home at every level, where the fox can\'t catch, and is never stuck', () => {
  for (const level of [1, 3, 4, 5, 6, 7, 8, 9, 10]) {
    for (const fox of ['tumble', 'wait']) {
      const farm = play(new Farm({ level, fox, random: seededRandom(level + 30) }), undefined, { most: 1, seconds: 900 });
      assert.equal(farm.done, true, `level ${level}, ${fox}`);
      assert.equal(farm.stats.cleared, WAYS.medium);
      assert.equal(farm.stats.flaps.left, 0);
      if (fox === 'wait') assert.equal(farm.stats.tumbles, 0);
      assert.ok(farm.fox.gap >= FOX.caught);
    }
  }
});

test('a child who flaps all the time gets home too, missing the corn it flies over', () => {
  for (const level of [1, 5, 10]) {
    const farm = play(new Farm({ level, random: seededRandom(9) }), (game, t) => ({ wings: Math.floor(t / 0.4) % 2 ? 2 : 0, keep: false }));
    assert.equal(farm.done, true, `level ${level}`);
    assert.equal(farm.stats.tumbles, 0);
  }
});

/* ---------- with friends ---------- */

test('with friends the track is the host\'s level\'s, without what moves by each game\'s own clock, and the same on every computer', () => {
  assert.deepEqual(NOT_WITH_FRIENDS, ['fox', 'tractor', 'duckpond']);
  const mine = new Farm({ level: 10, friends: true, random: seededRandom(123) });
  const theirs = new Farm({ level: 10, friends: true, random: seededRandom(123) });
  const lay = (farm) => farm.things.map(({ kind, x0, x1 }) => [kind, x0, x1]);
  assert.deepEqual(lay(mine), lay(theirs));
  assert.deepEqual(mine.corn.map(({ x, h }) => [x, h]), theirs.corn.map(({ x, h }) => [x, h]));
  const kinds = new Set(mine.things.map((thing) => thing.kind));
  for (const kind of NOT_WITH_FRIENDS) assert.ok(!kinds.has(kind), `no ${kind} with friends`);
  for (const kind of ['log', 'fence', 'pond', 'scarecrow', 'gust', 'hay']) assert.ok(kinds.has(kind), kind);
  assert.equal(mine.progress.of, WAYS.medium);
});

test('flying home together, a chick too far ahead of the last one waits for it, on the ground, and goes on as it catches up', () => {
  const farm = new Farm({ level: 1, together: true, friends: true, random: seededRandom(6) });
  const friend = { x: 0, home: false };
  farm.begin();
  for (let t = 0; t < 8; t += DT) farm.update(DT, { flock: [friend] });
  // Its friend hasn't moved: it stops a leash ahead, and says so.
  assert.ok(Math.abs(farm.chick.x - FLOCK.leash) < 0.05, `${farm.chick.x}`);
  assert.equal(farm.chick.flockWait, true);
  assert.equal(farm.fox.sitting, true);
  assert.equal(chickState(farm), STATES.indexOf('wait'));
  // The friend comes along, and off it goes again, staying within the leash.
  for (let t = 0; t < 3; t += DT) {
    friend.x += 1.5 * DT;
    farm.update(DT, { flock: [friend] });
    assert.ok(farm.chick.x - friend.x <= FLOCK.leash + 0.05);
  }
  assert.ok(farm.chick.x > FLOCK.leash + 3);
  // In the air it's never held back: nothing drops a chick into a pond.
  const flying = openField({ together: true, friends: true });
  flying.begin();
  flying.chick.x = FLOCK.leash + 1;
  flying.update(DT, { flaps: ['left', 'right'], flock: [{ x: 0, home: false }] });
  const from = flying.chick.x;
  for (let t = 0; t < 1; t += DT) flying.update(DT, { flock: [{ x: 0, home: false }] });
  assert.ok(flying.chick.x > from + 1.5);
  // Racing, nobody waits for anybody.
  const race = new Farm({ level: 1, together: false, friends: true, random: seededRandom(6) });
  run(race, 3.5, { flock: [{ x: 0, home: false }] });
  assert.ok(race.chick.x > FLOCK.leash + 2);
  assert.equal(race.chick.flockWait, false);
});

test('together, a chick the flock has waited ten seconds for is carried up to it by the mother hen', () => {
  const { farm, thing, heard } = farmWith('fence', { together: true, friends: true });
  const ahead = { x: thing.x1 + 12, home: false };
  // It rests at the fence, with the flock waiting further on.
  run(farm, HEN.flockAfter - 2, { flock: [ahead] });
  assert.equal(farm.chick.state, 'run');
  while (farm.chick.state === 'run' && farm.time < 60) farm.update(DT, { flock: [ahead] });
  assert.equal(farm.chick.state, 'carried');
  assert.deepEqual(heard('hen').map((event) => event.why), ['flock']);
  while (farm.chick.state === 'carried') farm.update(DT, { flock: [ahead] });
  assert.ok(Math.abs(farm.chick.x - (ahead.x - HEN.flockBehind)) < 0.6, `set down at ${farm.chick.x}, just behind the flock at ${ahead.x}`);
  assert.equal(thing.done, true);
  // Racing, nobody is carried: each flies their own way home.
  const race = farmWith('fence', { together: false, friends: true });
  run(race.farm, 30, { flock: [ahead] });
  assert.equal(race.farm.stats.hen, 0);
  // And a chick ahead waits while the hen carries its friend up, so she sets the friend down just behind it.
  const front = openField({ together: true, friends: true });
  front.begin();
  front.chick.x = 2;
  const carried = { x: 0, home: false, carried: true };
  run(front, 3, { flock: [carried] });
  assert.ok(front.chick.x < 2.05, `${front.chick.x}`);
  assert.equal(front.chick.flockWait, true);
  carried.carried = false;
  run(front, 0.5, { flock: [carried] });
  assert.equal(front.chick.flockWait, false);
  assert.ok(front.chick.x > 2.3, 'off again once the friend is down');
});

test('together, nobody tumbles the fox nearer, and everyone is home when the whole flock is', () => {
  const farm = new Farm({ level: 1, things: WAYS.short, together: true, friends: true, random: seededRandom(2) });
  const friend = { x: 0, home: false };
  // The friend keeps just behind, and too early a flap now and then tumbles this chick.
  const flock = (game) => {
    friend.x = Math.max(friend.x, game.chick.x - 2);
    return [friend];
  };
  play(farm, (game) => {
    const { next } = game;
    if (!next || game.chick.air) return HANDS_DOWN;
    if (game.chick.waiting) return { wings: 1, keep: false };
    const gap = next.x0 - game.chick.x;
    return { wings: gap < 7.2 && gap > 6 ? 1 : 0, keep: false };
  }, { flock, until: (game) => game.chick.state === 'door' });
  assert.ok(farm.stats.tumbles >= 1);
  assert.equal(farm.fox.gap, FOX.start, 'the fox keeps his distance from a flock');
  // At the door, it waits for its friend, for as long as it takes.
  run(farm, 20, { flock: [friend] });
  assert.equal(farm.chick.state, 'door');
  assert.equal(farm.done, false);
  // The friend gets home, and so is everyone.
  friend.home = true;
  run(farm, 0.1, { flock: [friend] });
  assert.equal(farm.chick.state, 'home');
  run(farm, HOME.party + 0.1, { flock: [friend] });
  assert.equal(farm.done, true);
  // A friend who has gone isn't waited for.
  const left = new Farm({ things: 0, together: true, friends: true });
  run(left, 8, { flock: [{ x: 100, home: false, gone: true }] });
  assert.equal(left.chick.state, 'home');
});

test('what a game tells its friends about its chick is numbers and nothing else, and it comes out the other end as a chick to draw', () => {
  const farm = new Farm({ level: 2, friends: true, random: seededRandom(4) });
  farm.begin();
  farm.update(DT, { flaps: ['left', 'right'], wings: { left: still(0.8), right: still(0.4) } });
  run(farm, 0.5, { wings: { left: still(0.8), right: still(0.4) } });
  const wire = wireFor(farm);
  assert.deepEqual(Object.keys(wire), ['d', 'y', 'v', 'l', 'r', 's', 'n', 'c']);
  for (const value of Object.values(wire)) assert.equal(typeof value, 'number');
  assert.equal(wire.s, STATES.indexOf('fly'));
  assert.equal(wire.n, 2);
  assert.deepEqual([wire.l, wire.r], [0.8, 0.4]);
  assert.ok(Math.abs(wire.v - farm.plan.speed) < 0.01);
  // Through a friend's track, as it would arrive, 10 times a second.
  const track = new Track(CHICK_TRACK);
  const ghost = { friend: { id: 'bbbbbbbb', spec: { name: 'Nino' } }, look: { body: '#fff' } };
  track.push({ ms: 1000, ...wire }, 5000);
  const later = { ...wire, d: wire.d + 0.25, y: wire.y + 0.1 };
  track.push({ ms: 1100, ...later }, 5100);
  const shown = friendFrom(track.at(5170), ghost);
  assert.ok(shown.x > wire.d && shown.x < later.d, 'between the two, a moment ago');
  assert.equal(shown.name, 'Nino');
  assert.deepEqual([shown.air, shown.waiting, shown.carried, shown.home], [true, false, false, false]);
  assert.deepEqual(shown.wings, { left: 0.8, right: 0.4 });
  // With nothing new for a moment, a chick that was flying carries on at its pace.
  const guessed = friendFrom(track.at(5500), ghost);
  assert.ok(guessed.x > later.d + 0.3);
  // Every state there is has its number, and comes back as something to draw.
  for (const [index, name] of STATES.entries()) {
    const drawn = friendFrom({ d: 5, y: 1, l: 0, r: 0, s: index }, ghost);
    assert.ok(['run', 'tumble', 'splash', 'ride', 'door', 'home'].includes(drawn.state), name);
    assert.equal(drawn.home, name === 'door' || name === 'home');
  }
  assert.equal(friendFrom({ d: 5, y: 1, l: 0, r: 0, s: STATES.indexOf('carried') }, ghost).carried, true);
  assert.equal(friendFrom({ d: 5, y: 1, l: 0, r: 0, s: STATES.indexOf('wait') }, ghost).waiting, true);
  // A game whose flight has ended is home, whatever it last said, and nothing that makes no sense is drawn.
  assert.equal(friendFrom({ d: 5, y: 0, l: 0, r: 0, s: 0 }, ghost, true).home, true);
  assert.equal(friendFrom(null, ghost), null);
  assert.equal(friendFrom({ d: NaN, y: 0, l: 0, r: 0, s: 0 }, ghost), null);
  assert.equal(friendFrom({ d: 5, y: 0, l: 'up', r: 0, s: 0 }, ghost), null);
  assert.deepEqual(friendFrom({ d: 5, y: -3, l: 9, r: -2, s: 99 }, ghost).wings, { left: 1, right: 0 });
  // For the rules: one nothing has come from is at the start, one that's home is at the hen house, one that's gone is gone.
  const flock = flockFrom([
    { friend: { id: 'a' }, shown: null },
    { friend: { id: 'b' }, shown: { x: 40, home: false } },
    { friend: { id: 'c' }, shown: { x: 90, home: true } },
    { friend: { id: 'd', gone: true }, shown: { x: 12, home: false } },
  ], 120);
  assert.deepEqual(flock, [{ x: 0, home: false, gone: false, carried: false }, { x: 40, home: false, gone: false, carried: false }, { x: 120, home: true, gone: false, carried: false }, { x: 12, home: false, gone: true, carried: false }]);
  assert.equal(flockFrom([{ friend: { id: 'e' }, shown: { x: 30, home: false, carried: true } }], 120)[0].carried, true);
});

test('two games fly home together through what they tell each other: one waits, and both are home in the end', () => {
  const games = ['a', 'b'].map(() => new Farm({ level: 3, things: WAYS.short, together: true, friends: true, random: seededRandom(77) }));
  const seenBy = [null, null];
  for (const farm of games) farm.begin();
  // The first flaps as it should, and the second only now and then, when its chick has waited a while.
  const hands = [{ left: false, right: false, upFor: 0 }, { left: false, right: false, upFor: 0 }];
  let waited = 0;
  for (let t = 0; t < 900 && !(games[0].done && games[1].done); t += DT) {
    games.forEach((farm, index) => {
      if (farm.done) return;
      const lazy = index === 1;
      let want = farm.wants();
      if (lazy && !farm.chick.air && !(farm.chick.waiting && farm.chick.waitFor >= 3)) want = HANDS_DOWN;
      const hand = hands[index];
      if (want.wings > 0 && !farm.chick.air && hand.upFor > 0.7) want = HANDS_DOWN;
      const flaps = [];
      if (!want.keep) {
        for (const [side, up] of [['right', want.wings >= 1], ['left', want.wings >= 2]]) {
          if (up && !hand[side]) flaps.push(side);
          hand[side] = up;
        }
      }
      hand.upFor = hand.left || hand.right ? hand.upFor + DT : 0;
      const other = seenBy[1 - index];
      farm.update(DT, { wings: { left: still(hand.left ? 1 : 0), right: still(hand.right ? 1 : 0) }, flaps, flock: other ? [{ x: other.d, home: other.s >= STATES.indexOf('door'), carried: other.s === STATES.indexOf('carried') }] : [{ x: 0, home: false }] });
      seenBy[index] = wireFor(farm);
    });
    if (games[0].chick.flockWait) waited += DT;
    if (games[0].chick.state === 'run' && games[1].chick.state === 'run') assert.ok(games[0].chick.x - games[1].chick.x <= FLOCK.leash + 7.5, `${games[0].chick.x - games[1].chick.x} apart at ${t.toFixed(1)} s`);
  }
  assert.deepEqual(games.map((farm) => farm.done), [true, true]);
  assert.ok(waited > 2, `the quicker chick waited ${waited} s for the slower one`);
  assert.ok(Math.abs(games[0].stats.seconds - games[1].stats.seconds) < 1, 'and they were home together');
});

/* ---------- its words ---------- */

test('every line the game says has its English and Georgian voice files, and the game says each one', () => {
  const folder = new URL('../../games/chick-flap/audio/voice/', import.meta.url);
  const lines = JSON.parse(readFileSync(new URL('lines.json', folder), 'utf8'));
  assert.ok(lines.length >= 8);
  const source = readFileSync(new URL('../../games/chick-flap/main.js', import.meta.url), 'utf8');
  for (const { id, text, ka } of lines) {
    assert.ok(/[ა-ჿ]/.test(ka), `${id} has Georgian`);
    for (const language of ['en', 'ka']) assert.ok(readFileSync(new URL(`${language}/${id}.ogg`, folder)).length > 1000, `${language}/${id}.ogg`);
    assert.ok(source.includes(`'${text}'`), `"${text}" is said by the game`);
    assert.ok(!text.includes('—') && text.split(' ').length <= 9, `"${text}" is short`);
  }
});

test('the grown-ups\' settings for this game have names of their own, as every game\'s are kept together', () => {
  const source = readFileSync(new URL('../../games/chick-flap/main.js', import.meta.url), 'utf8');
  assert.match(source, /defaults: \{ flapRise: 'little', flapWings: 'both', flapFox: 'catch', flapWay: 'medium', flapFriends: 'together' \}/);
  assert.match(source, /choices: \{ flapRise: String, flapWings: String, flapFox: String, flapWay: String, flapFriends: String \}/);
  // Every choice in the panel is one the rules know.
  for (const name of RISE_NAMES) assert.ok(source.includes(`choice('flapRise', '${name}'`));
  for (const name of Object.keys(WAYS)) assert.ok(source.includes(`choice('flapWay', '${name}'`));
  for (const name of FOX_NAMES) assert.ok(source.includes(`choice('flapFox', '${name}'`));
  assert.ok(zoneFor({ type: 'over' }, 2) === null);
});

/* ---------- the fox that can catch ---------- */

test('the fox that can catch: a chick left standing at something has a moment, then he gets up and comes on, and has it', () => {
  const { farm, thing, heard } = farmWith('log', { fox: 'catch' });
  assert.equal(farm.catches, true);
  // Up to the log, and standing there: for the first few seconds he sits, as far back as he started.
  run(approach(farm, thing, 0.01), 0.2);
  assert.equal(farm.chick.waiting, thing);
  const from = farm.time - farm.chick.waitFor;
  // It's the first thing of the flight, where he gives it longer, while the child finds out what to do.
  run(farm, HUNT.first - 0.5);
  assert.equal(farm.fox.sitting, true);
  assert.equal(farm.fox.gap, FOX.start);
  assert.equal(heard('fox-coming').length, 0);
  // Then he's up, and nearer each second.
  run(farm, 2);
  assert.equal(farm.fox.sitting, false);
  assert.ok(Math.abs(farm.fox.gap - (FOX.start - HUNT.creep * 1.5)) < 0.12, `${farm.fox.gap}`);
  assert.equal(heard('fox-coming').length, 1, 'said once');
  assert.equal(farm.chick.state, 'run');
  // Right behind it, he has it: a moment in his paws, and the flight is over, and lost.
  for (let n = 0; n < 60 * 30 && farm.chick.state === 'run'; n += 1) farm.update(DT, { wings: { left: still(), right: still() } });
  assert.ok(Math.abs(farm.time - from - (HUNT.first + (FOX.start - FOX.caught) / HUNT.creep)) < 0.5, `after ${farm.time - from} seconds of standing there`);
  assert.equal(heard('caught').length, 1);
  assert.equal(farm.chick.state, 'caught');
  assert.equal(farm.done, false, 'not until he has lifted it');
  run(farm, HUNT.seconds + 0.1);
  assert.deepEqual([farm.done, farm.lost], [true, true]);
  assert.ok(Math.abs(farm.chick.h - HUNT.lift) < 0.01, 'held off the ground');
  assert.ok(farm.fox.gap <= HUNT.held + 0.01, 'and he\'s right up to it');
  assert.equal(farm.stats.hen, 0, 'with no mother hen in sight');
  assert.equal(thing.done, false);
});

test('a flap in time gets the chick away from him: over the thing, on its way, and further ahead for every thing flown over cleanly', () => {
  const { farm, thing } = farmWith('log', { fox: 'catch' });
  run(approach(farm, thing, 0.01), HUNT.first + 4);
  const near = farm.fox.gap;
  assert.ok(near < FOX.start - 0.5 && near > FOX.caught, `he has come on: ${near}`);
  // A flap, and it's over the log. He comes no nearer while it's on its way.
  run(farm, 0.05, { flaps: ['left', 'right'] });
  run(farm, 3, { wings: { left: still(1), right: still(1) } });
  assert.equal(thing.done, true);
  assert.equal(farm.fox.gap, near, 'no nearer, and no further: it had stopped at that one');
  assert.equal(farm.lost, false);
  // Flying on well takes it further ahead again, and home.
  play(farm);
  assert.deepEqual([farm.done, farm.lost], [true, false]);
  assert.ok(farm.fox.gap > near + 0.5, `ahead again: ${farm.fox.gap}`);
});

test('a child the camera can\'t see isn\'t hunted: with no hands in the picture the fox sits and waits, however long', () => {
  const { farm, thing } = farmWith('log', { fox: 'catch' });
  const unseen = { left: { lift: 0, up: false, seen: false }, right: { lift: 0, up: false, seen: false } };
  run(approach(farm, thing, 0.01), 60, { wings: unseen });
  assert.equal(farm.chick.waiting, thing);
  assert.deepEqual([farm.fox.gap, farm.fox.sitting, farm.done], [FOX.start, true, false]);
  // One hand back in the picture is enough for the game to go on, and so does he.
  run(farm, 2, { wings: { ...unseen, right: still() } });
  assert.ok(farm.fox.gap < FOX.start);
});

test('every tumble brings the fox that can catch nearer, with none let off, and tumbling with him right behind is being caught', () => {
  const { farm, heard } = farmWith('log', { fox: 'catch' });
  farm.fox.gap = FOX.caught + FOX.nearer - 0.01;
  const [thing] = farm.things;
  run(approach(farm, thing, 7), 0.05, { flaps: ['right'] });
  while (farm.chick.state !== 'tumble' && farm.time < 30) farm.update(DT, { wings: { left: still(), right: still() } });
  assert.equal(farm.fox.gap, FOX.caught);
  // Over the log it rolls, and as it gets to its feet he has it. The mother hen doesn't come.
  run(farm, CHICK.tumble + 0.1);
  assert.equal(farm.chick.state, 'caught');
  assert.equal(heard('hen').length, 0);
  run(farm, HUNT.seconds + 0.1);
  assert.equal(farm.lost, true);
  // Where he can't catch, the same tumble has the hen carry the chick on: see the test of that.
  // And a splash or a bump straight after a tumble isn't let off, as it is where he can't catch.
  const again = new Farm({ level: 5, fox: 'catch', random: seededRandom(4) });
  again.mercy = true;
  again.begin();
  again.foxNearer();
  assert.ok(Math.abs(again.fox.gap - (FOX.start - FOX.nearer)) < 1e-9);
  const spared = new Farm({ level: 5, fox: 'tumble', random: seededRandom(4) });
  spared.mercy = true;
  spared.begin();
  spared.foxNearer();
  assert.equal(spared.fox.gap, FOX.start);
});

test('he doesn\'t catch a chick that\'s in the air: only once it\'s down', () => {
  const { farm, thing } = farmWith('pond', { fox: 'catch' });
  // Up, and held up over the pond, and then he's right behind.
  run(approach(farm, thing, 1.2), 0.05, { flaps: ['left', 'right'], wings: { left: still(1), right: still(1) } });
  farm.fox.gap = FOX.caught;
  run(farm, 0.6, { wings: { left: still(1), right: still(1) } });
  assert.equal(farm.chick.air, true);
  assert.equal(farm.chick.state, 'run');
  // Down it comes, and then he has it.
  for (let n = 0; n < 60 * 20 && farm.chick.state === 'run'; n += 1) farm.update(DT, { wings: { left: still(), right: still() } });
  assert.equal(farm.chick.state, 'caught');
  assert.equal(farm.chick.air, false);
});

test('level 10: coming down right in front of the fox on the track is being caught, where he can catch', () => {
  const { farm, thing, heard } = farmWith('fox', { fox: 'catch' });
  run(farm, 30);
  assert.equal(thing.waiting, true, 'he has run round, and waits on the track');
  // A hop that comes down short of him, inside where a chick on the ground would have stopped.
  const stop = thing.x0 - CHICK.r - thing.standoff;
  assert.ok(Math.abs(farm.chick.x - stop) < 0.05);
  run(farm, 0.05, { flaps: ['right'] });
  for (let n = 0; n < 60 * 10 && farm.chick.state === 'run' && (farm.chick.air || n < 5); n += 1) farm.update(DT, { wings: { left: still(), right: still() } });
  assert.equal(farm.chick.state, 'caught');
  assert.equal(heard('caught')[0].thing, thing);
  assert.equal(heard('hen').length, 0);
  run(farm, HUNT.seconds + 0.1);
  assert.equal(farm.lost, true);
});

test('a child who flaps in good time gets home at every level with the fox that can catch, and is never caught', () => {
  for (let level = 1; level <= LAST_LEVEL; level += 1) {
    const farm = play(new Farm({ level, fox: 'catch', random: seededRandom(level + 50) }));
    assert.deepEqual([farm.done, farm.lost], [true, false], `level ${level}`);
    assert.equal(farm.stats.cleared, WAYS.medium);
    assert.ok(farm.fox.gap > FOX.caught);
  }
});

test('a child who never flaps is caught at the first thing, and one who is slow at every thing is caught on the way', () => {
  const still1 = new Farm({ level: 1, fox: 'catch', random: seededRandom(3) });
  run(still1, 60);
  assert.deepEqual([still1.done, still1.lost, still1.stats.cleared], [true, true, 0]);
  // Waiting six seconds at each thing: three of them his, each time, and nothing flown over cleanly to get ahead.
  const slow = play(new Farm({ level: 1, fox: 'catch', random: seededRandom(3) }), (game) => (game.chick.waiting && game.chick.waitFor > 6 ? { wings: 2, keep: false } : HANDS_DOWN), { seconds: 400 });
  assert.equal(slow.lost, true);
  assert.ok(slow.stats.cleared >= 2 && slow.stats.cleared < WAYS.medium, `caught after ${slow.stats.cleared} things`);
});

test('a child who only ever flaps one hand is caught where a thing needs both wings, and gets home where none does', () => {
  // Level 1 has logs, which one wing clears.
  const logs = play(new Farm({ level: 1, fox: 'catch', random: seededRandom(31) }), undefined, { most: 1, seconds: 900 });
  assert.deepEqual([logs.done, logs.lost], [true, false]);
  // Level 3 has fences, which take both: it tumbles at them, or waits and is lifted over after three tries, and
  // he's nearer each time, and in the end he has it.
  const fences = play(new Farm({ level: 3, fox: 'catch', random: seededRandom(33) }), undefined, { most: 1, seconds: 900 });
  assert.deepEqual([fences.done, fences.lost], [true, true]);
  assert.ok(fences.stats.cleared < WAYS.medium);
  assert.ok(fences.stats.tumbles + fences.stats.hen >= 1, 'it tumbled at a fence, or was lifted over one');
});

test('flying home with friends, the fox never catches anyone, whatever a grown-up chose for flying alone', () => {
  for (const options of [{ friends: true }, { friends: true, together: true }]) {
    const farm = new Farm({ level: 1, fox: 'catch', random: seededRandom(3), ...options });
    assert.equal(farm.catches, false);
    run(farm, 60);
    assert.deepEqual([farm.done, farm.lost], [false, false]);
    assert.equal(farm.fox.gap, FOX.start);
  }
});

test('at the first thing of a flight the fox gives the chick longer, and after that only a moment', () => {
  assert.ok(HUNT.first > HUNT.patience * 2);
  const farm = new Farm({ level: 1, fox: 'catch', random: seededRandom(3) });
  const [first, second] = farm.things;
  // Standing at the first thing for a little less than he gives it there: he hasn't moved.
  run(approach(farm, first, 0.01), HUNT.first - 0.3);
  assert.equal(farm.fox.gap, FOX.start);
  // Over it, and standing at the second for as long: he has come a good way.
  run(farm, 0.05, { flaps: ['left', 'right'] });
  run(farm, 3, { wings: { left: still(1), right: still(1) } });
  assert.equal(first.done, true);
  const before = farm.fox.gap;
  approach(farm, second, 0.01);
  while (!farm.chick.waiting && farm.time < 60) farm.update(DT, { wings: { left: still(), right: still() } });
  run(farm, HUNT.first - 0.3);
  assert.ok(farm.fox.gap < before - (HUNT.first - HUNT.patience - 1) * HUNT.creep, `from ${before} to ${farm.fox.gap}`);
});
