// Mighty Lift: how an arm's height is read, the warm-up that sets each arm's own line, and the rules of a game,
// level by level. The arm is tested against what the real pose model reported for footage of a person raising
// an arm (test/fixtures/mighty-lift-arms.json, whose "about" says what happens when), and the rules with arms
// that go exactly where a test says.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BodyReader } from '../../core/body/reader.js';
import { ROSTER } from '../../core/body/roster.js';
import { Arm, Arms, HEIGHTS, HOLDS, LIFT_COUNTS, Lifting, MOST_LIFT, NEW_THINGS, Partner, STAR_AT, THINGS, Warmup, armHeights, layOut, liftLevel, newAt, sidesFor, starAtFor, thingsUpTo } from '../../games/mighty-lift/lift.js';

const footage = JSON.parse(readFileSync(new URL('../fixtures/mighty-lift-arms.json', import.meta.url)));
const toBody = ([, image, world]) => (image
  ? {
      image: image.map((p) => (p ? { x: p[0], y: p[1], z: 0, visibility: p[2] } : { x: 0, y: 0, z: 0, visibility: 0 })),
      world: world.map((p) => (p ? { x: p[0], y: p[1], z: p[2] } : { x: 0, y: 0, z: 0 })),
    }
  : null);

/** What the game reads from each frame of the footage: how high each wrist is above its shoulder. */
const READINGS = (() => {
  const reader = new BodyReader();
  reader.upperBodyOnly = true;
  return footage.frames.map((frame) => {
    const body = toBody(frame);
    reader.update(body, frame[0], footage.aspect);
    return { t: frame[0], heights: armHeights(body, reader.torsoSize) };
  });
})();
const FRAME = 1 / footage.fps;
const between = (from, to) => READINGS.filter(({ t }) => t >= from && t < to);
const at = (t) => READINGS.find((reading) => reading.t >= t).heights;

/**
 * Plays the footage from one moment to another: the arms read each frame, and a game, if there is one, runs four
 * times for each, as a screen draws more often than the tracker looks.
 */
function play(from, to, { arms, game = null, warmup = null, each = () => {} }) {
  for (const { t, heights } of between(from, to)) {
    if (warmup && !warmup.done) warmup.update(heights, FRAME);
    else arms.update(heights, FRAME);
    if (game) {
      game.span = arms.span;
      for (let i = 0; i < 4; i += 1) game.update(FRAME / 4, arms.lift);
    }
    each(t);
  }
}

/**
 * A game whose events are kept. The first friend is always the same one, so tests can say who it is. Unless a
 * test says, it's the gentle game, as it was, with no clock before sunset.
 */
function newGame(options = {}) {
  const seen = [];
  const game = new Lifting({ random: () => 0, gentle: true, ...options, onEvent: (event) => seen.push(event) });
  game.begin();
  return { game, seen, types: () => seen.map(({ type }) => type), count: (type) => seen.filter((event) => event.type === type).length };
}

/** Runs a game for so many seconds with the arm where lift says: a number, or a function of the seconds so far. */
function run(game, seconds, lift, { dt = 1 / 60, mates = [] } = {}) {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i += 1) game.update(dt, typeof lift === 'function' ? lift(i * dt) : lift, typeof mates === 'function' ? mates(i * dt) : mates);
}

/** An arm that goes up in half a second, stays for a while, and comes down in a second: one whole lift. */
const oneLift = (game, held, high = 1.05) => {
  run(game, 0.5, (t) => (t / 0.5) * high);
  run(game, held, high);
  run(game, 1, (t) => high * (1 - t));
  run(game, 0.3, 0);
};

/** Lifts, each held long enough for anything, until the game is over or it's had more than enough tries. */
function playThrough(game, held = 7) {
  for (let i = 0; i < 60 && game.state === 'playing'; i += 1) {
    oneLift(game, held);
    run(game, 3, 0);
  }
  return game;
}

/* ------------------------------- reading the arm ------------------------------- */

test('the real tracker\'s points give how high each wrist is above its shoulder, in torso lengths', () => {
  const mean = (list) => list.reduce((sum, value) => sum + value, 0) / list.length;
  const right = (from, to) => mean(between(from, to).map(({ heights }) => heights.right));
  const left = (from, to) => mean(between(from, to).map(({ heights }) => heights.left));
  // Hanging by the hip, right overhead, level with the shoulder, and a small raise in front of the tummy.
  assert.ok(right(0.2, 1.4) < -0.85 && right(0.2, 1.4) > -1.1, `resting ${right(0.2, 1.4)}`);
  assert.ok(right(3, 5) > 0.88 && right(3, 5) < 1.05, `overhead ${right(3, 5)}`);
  assert.ok(Math.abs(right(9, 10.4) - 0.16) < 0.06, `shoulder height ${right(9, 10.4)}`);
  assert.ok(right(29, 30.5) > -0.55 && right(29, 30.5) < -0.35, `a small raise ${right(29, 30.5)}`);
  assert.ok(left(13.3, 14.9) > 0.88, `the left arm overhead ${left(13.3, 14.9)}`);
  assert.ok(left(3, 5) < -0.6, `the left arm resting while the right is up ${left(3, 5)}`);
});

test('a wrist half hidden by the hip is still read, and one that can\'t be told is not', () => {
  // The model was only 20 to 45% sure of a hanging wrist, and it's still where a hanging hand is.
  const resting = toBody(footage.frames.find((frame) => frame[0] >= 0.5));
  assert.ok(resting.image[16].visibility < 0.5, `the model was ${resting.image[16].visibility} sure`);
  const heights = armHeights(resting, 0.2);
  assert.ok(heights.right < -0.8 && heights.left < -0.8, JSON.stringify(heights));

  const hidden = structuredClone(resting);
  hidden.image[16].visibility = 0.1;
  assert.equal(armHeights(hidden, 0.2).right, null);
  assert.notEqual(armHeights(hidden, 0.2).left, null);
  const noShoulder = structuredClone(resting);
  noShoulder.image[12].visibility = 0.3;
  assert.equal(armHeights(noShoulder, 0.2).right, null);
  assert.deepEqual(armHeights(null, 0.2), { left: null, right: null });
  assert.deepEqual(armHeights(resting, 0), { left: null, right: null });
});

test('an arm is 0 at rest and 1 at its line, which is as high as a grown-up chose', () => {
  for (const [name, target] of Object.entries(HEIGHTS)) {
    const arm = new Arm(target);
    arm.read(-0.9, 0.03);
    assert.equal(arm.lift, 0, `${name}: resting`);
    for (let i = 0; i < 60; i += 1) arm.read(target, 0.03);
    assert.ok(Math.abs(arm.lift - 1) < 0.01, `${name}: at its line it reads ${arm.lift}`);
    assert.ok(Math.abs(arm.line - target) < 1e-9, `${name}: the line is where it was set`);
  }
  assert.ok(HEIGHTS.little < HEIGHTS.shoulder && HEIGHTS.shoulder < HEIGHTS.head);
  assert.equal(HEIGHTS.shoulder, 0, 'shoulder height is the wrist level with the shoulder');
});

test('the line is never so near to where the arm rests that resting could count', () => {
  // A bent arm held by the chest rests far higher than "a little" asks for.
  const arm = new Arm(HEIGHTS.little);
  arm.read(-0.3, 0.03);
  arm.restHere();
  assert.ok(arm.line - arm.rest >= 0.3 - 1e-9, `the line is ${arm.line - arm.rest} above rest`);
  // The tracker's wobble on a hanging hand, which was up to a tenth of a torso length, is nowhere near it.
  for (const { heights } of between(0, 1.4)) arm.read(heights.right, FRAME);
  assert.ok(arm.lift < 0.5, `a resting hand reads ${arm.lift}`);
});

test('where an arm rests follows it down at once, and only comes up when the game says it\'s resting there', () => {
  const arm = new Arm(HEIGHTS.shoulder);
  arm.read(-0.5, 0.03);
  for (let i = 0; i < 40; i += 1) arm.read(-0.95, 0.03);
  assert.ok(Math.abs(arm.rest + 0.95) < 0.01, `rest followed down to ${arm.rest}`);
  for (let i = 0; i < 100; i += 1) arm.read(-0.4, 0.03);
  assert.ok(Math.abs(arm.rest + 0.95) < 0.01, 'holding it part of the way up doesn\'t move where it rests');
  assert.ok(arm.lift > 0.5);
  arm.restHere();
  assert.ok(Math.abs(arm.rest + 0.4) < 0.01);
  assert.equal(arm.lift, 0);
});

test('one wild frame from the tracker lifts nothing, as the real footage has them', () => {
  // While the right arm is up, the tracker now and then puts the resting left wrist somewhere else for a frame.
  const wild = between(22.5, 26.5).filter(({ heights }) => heights.left > -0.5);
  assert.ok(wild.length >= 3, `only ${wild.length} wild frames to test with`);
  const arms = new Arms({ side: 'left', height: 'shoulder' });
  let highest = 0;
  play(17, 31, { arms, each: (t) => { if (t > 22.5 && t < 31) highest = Math.max(highest, arms.lift); } });
  assert.ok(highest < 0.5, `the resting left arm read as high as ${highest}`);
});

test('an arm the camera loses stays where it was for a moment, and then comes down gently', () => {
  const arm = new Arm(HEIGHTS.shoulder);
  arm.read(-0.9, 0.03);
  for (let i = 0; i < 60; i += 1) arm.read(0.1, 0.03);
  const held = arm.lift;
  for (let i = 0; i < 15; i += 1) arm.read(null, 0.03);
  assert.equal(arm.lift, held, 'half a second lost is nothing');
  assert.equal(arm.seen, false);
  for (let i = 0; i < 10; i += 1) arm.read(null, 0.03);
  assert.ok(arm.lift < held && arm.lift > held - 0.4, `coming down slowly: ${arm.lift}`);
  for (let i = 0; i < 60; i += 1) arm.read(null, 0.03);
  assert.equal(arm.lift, 0);
  // An arm that was never seen is at rest.
  const never = new Arm();
  never.read(null, 0.03);
  assert.equal(never.lift, 0);
});

test('which arm lifts is the one being worked on, the other, or both, and both is as high as the lower', () => {
  assert.deepEqual(sidesFor('right', 'play'), ['right']);
  assert.deepEqual(sidesFor('left', 'play'), ['left']);
  assert.deepEqual(sidesFor('right', 'other'), ['left']);
  assert.deepEqual(sidesFor('left', 'other'), ['right']);
  assert.deepEqual(sidesFor('left', 'both'), ['left', 'right']);

  const settle = (arms, heights) => {
    for (let i = 0; i < 60; i += 1) arms.update(heights, 0.03);
  };
  const one = new Arms({ side: 'right', liftWith: 'play' });
  settle(one, { left: -0.9, right: -0.9 });
  settle(one, { left: 0.4, right: -0.9 });
  assert.equal(one.lift, 0, 'the other arm lifts nothing');
  settle(one, { left: -0.9, right: 0 });
  assert.ok(Math.abs(one.lift - 1) < 0.01);

  const both = new Arms({ side: 'right', liftWith: 'both' });
  settle(both, { left: -0.9, right: -0.9 });
  settle(both, { left: -0.9, right: 0.5 });
  assert.equal(both.lift, 0, 'one arm up, with both, lifts nothing');
  assert.ok(both.tilt > 1, 'and the bar tips');
  assert.equal(both.oneSided, false, 'not said at once');
  for (let i = 0; i < 100; i += 1) both.update({ left: -0.9, right: 0.5 }, 0.03);
  assert.equal(both.oneSided, true, 'after a couple of seconds it\'s one-sided');
  settle(both, { left: -0.45, right: 0.5 });
  assert.ok(Math.abs(both.lift - 0.5) < 0.02, `as high as the lower arm: ${both.lift}`);
  settle(both, { left: 0, right: 0.5 });
  assert.ok(Math.abs(both.lift - 1) < 0.01);
  assert.equal(both.oneSided, false);
});

test('a child who keeps trying and can\'t reach the line has it come down to just below their best', () => {
  const arm = new Arm(HEIGHTS.head);
  arm.read(-0.9, 0.03);
  const before = arm.line;
  // Up to shoulder height and down again: a long way short of above the head. Once is nothing.
  const tryOnce = () => {
    let eased = false;
    for (let i = 0; i < 60; i += 1) {
      arm.read(i < 40 ? 0 : -0.9, 0.03);
      eased = arm.tried(0.03) || eased;
    }
    return eased;
  };
  arm.tried(0.03);
  assert.equal(tryOnce(), false);
  assert.equal(arm.line, before);
  // Twice running, and the line comes down to just below how high they got.
  assert.equal(tryOnce(), true);
  assert.ok(Math.abs(arm.line - (-0.9 + 0.9 * 0.85)) < 0.03, `the line is now ${arm.line}`);
  for (let i = 0; i < 60; i += 1) arm.read(0, 0.03);
  assert.ok(arm.lift >= 1, 'and the same try now reaches it');
});

test('an arm held short of the line for a few seconds has it come down too, and one held there that never moved doesn\'t', () => {
  const arm = new Arm(HEIGHTS.head);
  arm.read(-0.9, 0.03);
  arm.tried(0.03);
  let easedAt = null;
  for (let i = 0; i < 200 && easedAt === null; i += 1) {
    arm.read(0.1, 0.03);
    if (arm.tried(0.03)) easedAt = i * 0.03;
  }
  assert.ok(easedAt > 3.5 && easedAt < 5, `eased after ${easedAt} seconds`);
  assert.ok(arm.lift >= 1, 'and where it\'s held is now over the line');

  // A bent arm that rests by the chest, and has never been seen any lower, isn't trying: it's resting.
  const bent = new Arm(HEIGHTS.shoulder);
  for (let i = 0; i < 400; i += 1) {
    bent.read(-0.45, 0.03);
    assert.equal(bent.tried(0.03), false);
  }
  assert.equal(bent.eased, null);
});

test('an arm on its way down from the line is not a try, however long it then rests', () => {
  const arm = new Arm(HEIGHTS.shoulder);
  arm.read(-0.9, 0.03);
  const line = arm.line;
  const steps = (count, height) => {
    for (let i = 0; i < count; i += 1) {
      arm.read(typeof height === 'function' ? height(i / count) : height, 0.03);
      assert.equal(arm.tried(0.03), false);
    }
  };
  for (let round = 0; round < 4; round += 1) {
    steps(10, -0.9);
    steps(20, (through) => -0.9 + through * 1.1);
    steps(40, 0.2);
    // Down slowly, stopping half way for a while, and then a long rest.
    steps(30, (through) => 0.2 - through * 0.6);
    steps(60, -0.4);
    steps(30, (through) => -0.4 - through * 0.5);
    steps(300, -0.9);
  }
  // And then one try that falls short is only one, not the second of two with the way down before it.
  steps(20, (through) => -0.9 + through * 0.6);
  steps(30, -0.3);
  steps(20, (through) => -0.3 - through * 0.6);
  steps(10, -0.9);
  assert.equal(arm.fails, 1);
  assert.equal(arm.line, line);
  assert.equal(arm.eased, null);
  // The same, when the game says the line was reached, as it does for an arm that got there while nothing was asked.
  const other = new Arm(HEIGHTS.shoulder);
  other.read(-0.9, 0.03);
  other.tried(0.03);
  for (let i = 0; i < 60; i += 1) other.read(0.2, 0.03);
  other.made();
  for (let i = 0; i < 400; i += 1) {
    other.read(Math.max(-0.9, 0.2 - i * 0.02), 0.03);
    assert.equal(other.tried(0.03), false);
  }
  assert.equal(other.eased, null);
});

test('standing still never brings the line down, and it never comes as low as an arm at rest', () => {
  const still = new Arm(HEIGHTS.shoulder);
  for (const { heights } of between(0, 1.4)) still.read(heights.right, FRAME);
  const line = still.line;
  for (let round = 0; round < 40; round += 1) {
    for (const { heights } of between(0, 1.4)) {
      still.read(heights.right, FRAME);
      assert.equal(still.tried(FRAME), false);
    }
  }
  assert.equal(still.line, line);

  // An arm that can only come up a little: the line comes down, but stays clear of where it rests.
  const weak = new Arm(HEIGHTS.shoulder);
  weak.read(-0.9, 0.03);
  weak.tried(0.03);
  for (let i = 0; i < 400; i += 1) {
    weak.read(i % 60 < 40 ? -0.55 : -0.9, 0.03);
    weak.tried(0.03);
  }
  assert.ok(weak.eased !== null, 'it came down');
  assert.ok(weak.line - weak.rest >= 0.3 - 1e-9, `the line is ${weak.line - weak.rest} above rest`);
  assert.ok(weak.line <= -0.55, 'and those tries reach it');

  // Nor does an arm that only comes up a little way, or only for a moment, as the tracker's guess at a hand by the hip does.
  for (const [high, seconds] of [[0.2, 1.2], [0.5, 0.2]]) {
    const resting = new Arm(HEIGHTS.shoulder);
    resting.read(-0.9, 0.03);
    for (let i = 0; i < 600; i += 1) {
      resting.read(i % 80 < seconds / 0.03 ? -0.9 + high : -0.9, 0.03);
      assert.equal(resting.tried(0.03), false, `up ${high} for ${seconds} seconds`);
    }
  }
});

test('on real footage, an arm hanging at rest while the other one lifts never has its line come down, or reaches it', () => {
  // The left hangs while the right is up, from 1.5 to 10.5, and the right while the left is, from 12 to 16. The
  // tracker's guess at a hand by the hip jumps about, by 0.4 torso lengths at times. The game asks each arm that
  // lifts whether it's trying, every time the screen is drawn, as long as there's something to lift.
  for (const [side, from, to] of [['left', 0, 11], ['right', 11.5, 16.5], ['left', 22.5, 31.5]]) {
    const arms = new Arms({ side: 'right', liftWith: 'both', height: 'shoulder' });
    for (let round = 0; round < 10; round += 1) {
      play(from, to, {
        arms,
        each: () => {
          for (let i = 0; i < 4; i += 1) arms.tried(FRAME / 4);
          if (round > 0) assert.ok(arms[side].lift < 0.8, `the ${side} arm, at rest, read ${arms[side].lift} of a lift`);
        },
      });
    }
    assert.equal(arms[side].eased, null, `the ${side} arm's line came down to ${arms[side].line}`);
  }
  // While the same footage, of an arm that does try, brings its line down: up to the shoulder with the line above the head.
  const trying = new Arms({ side: 'right', height: 'head' });
  let eased = false;
  for (let round = 0; round < 3 && !eased; round += 1) play(6.6, 11.5, { arms: trying, each: () => { for (let i = 0; i < 4; i += 1) eased = trying.tried(FRAME / 4) || eased; } });
  assert.equal(eased, true);
  assert.ok(trying.right.line < HEIGHTS.head);
});

/* ------------------------------- the warm-up ------------------------------- */

test('the warm-up ends once a real arm has gone right up and stopped, and its line is set from how high it got', () => {
  const arms = new Arms({ side: 'right', height: 'head' });
  const seen = [];
  const warmup = new Warmup({ arms, onEvent: (event) => seen.push(event.type) });
  let endedAt = null;
  play(0, 7, { arms, warmup, each: (t) => { if (warmup.done && endedAt === null) endedAt = t; } });
  assert.deepEqual(seen, ['measured']);
  // The arm is up by 2.6 seconds, and has stopped rising a moment later.
  assert.ok(endedAt > 2.6 && endedAt < 4.2, `ended at ${endedAt}`);
  assert.ok(arms.right.best > 0.88, `its best was ${arms.right.best}`);
  assert.equal(arms.measuring, false);
  // Above the head is within its reach, so that's the line, and its best is a little above it.
  assert.equal(arms.right.line, HEIGHTS.head);
  assert.ok(arms.reach > 1.05 && arms.reach < 1.25, `reach ${arms.reach}`);
});

test('an arm that can\'t go as high as a grown-up chose has its line most of the way to its own best', () => {
  // Only as high as the shoulder, from 7.6 seconds, with above the head chosen.
  const arms = new Arms({ side: 'right', height: 'head' });
  const warmup = new Warmup({ arms });
  play(7, 10.4, { arms, warmup });
  assert.equal(warmup.done, true);
  const { rest, best, line } = arms.right;
  assert.ok(best > 0.1 && best < 0.25, `best ${best}`);
  assert.ok(Math.abs(line - (rest + (best - rest) * 0.9)) < 1e-9);
  assert.ok(line < 0.1 && line > -0.1, `the line is at ${line}, about the shoulder`);
  // And with shoulder height chosen, that's the line, as it's within reach.
  const lower = new Arms({ side: 'right', height: 'shoulder' });
  play(7, 10.4, { arms: lower, warmup: new Warmup({ arms: lower }) });
  assert.equal(lower.right.line, HEIGHTS.shoulder);
});

test('the warm-up never ends for someone standing still, can be skipped, and then the line is as it was set', () => {
  const arms = new Arms({ side: 'right', height: 'shoulder' });
  const seen = [];
  const warmup = new Warmup({ arms, onEvent: (event) => seen.push(event.type) });
  for (let round = 0; round < 30; round += 1) play(0, 1.4, { arms, warmup });
  assert.equal(warmup.done, false);
  warmup.finish(false);
  assert.deepEqual(seen, ['skipped']);
  assert.equal(arms.right.best, null);
  assert.equal(arms.reach, null);
  assert.equal(arms.right.line, HEIGHTS.shoulder);
  warmup.finish(true);
  assert.deepEqual(seen, ['skipped'], 'only once');
});

test('with both arms, the warm-up waits for both, but not for ever if only one comes up', () => {
  // Both arms right up, from 17 seconds.
  const arms = new Arms({ side: 'right', liftWith: 'both', height: 'head' });
  const warmup = new Warmup({ arms });
  play(16.5, 21, { arms, warmup });
  assert.equal(warmup.done, true);
  assert.ok(arms.left.best > 0.88 && arms.right.best > 0.88);

  // Only the right arm comes up: it waits, and then ends anyway, so nobody is stuck.
  const one = new Arms({ side: 'right', liftWith: 'both', height: 'head' });
  const seen = [];
  const waiting = new Warmup({ arms: one, onEvent: (event) => seen.push(event.type) });
  for (let i = 0; i < 200; i += 1) waiting.update({ left: -0.9, right: i < 30 ? -0.9 + i * 0.06 : 0.9 }, 0.03);
  assert.equal(waiting.done, false, 'after six seconds it\'s still waiting for the other arm');
  for (let i = 0; i < 120; i += 1) waiting.update({ left: -0.9, right: 0.9 }, 0.03);
  assert.deepEqual(seen, ['measured']);
});

test('an arm that moves but can\'t get far still ends the warm-up, after a while', () => {
  const arms = new Arms({ side: 'right', height: 'shoulder' });
  const warmup = new Warmup({ arms });
  for (let i = 0; i < 300 && !warmup.done; i += 1) warmup.update({ left: -0.9, right: i < 20 ? -0.9 : -0.62 }, 0.03);
  assert.equal(warmup.done, false, 'not in the first nine seconds');
  for (let i = 0; i < 200 && !warmup.done; i += 1) warmup.update({ left: -0.9, right: -0.62 }, 0.03);
  assert.equal(warmup.done, true);
});

test('the warm-up goes by how high a real arm stays, so an arm at rest, which the tracker sees jump about, doesn\'t end it', () => {
  // Real footage of an arm hanging while the other one lifts, over and over: the tracker has it up 0.4 torso lengths
  // now and then, for a moment, and that isn't a lift.
  for (const [liftWith, from, to] of [['other', 0, 11], ['play', 11.5, 16.5], ['other', 22.5, 31.5]]) {
    const arms = new Arms({ side: 'right', liftWith, height: 'shoulder' });
    const warmup = new Warmup({ arms });
    for (let round = 0; round < 6; round += 1) play(from, to, { arms, warmup });
    assert.equal(warmup.done, false, `${liftWith}, ${from} to ${to}`);
  }
  // A hand that only gets high for a moment doesn't set the line, and one that stays there does.
  const arms = new Arms({ side: 'right', height: 'head' });
  const warmup = new Warmup({ arms });
  for (let i = 0; i < 40; i += 1) warmup.update({ left: -0.9, right: i % 20 < 5 ? 0.6 : -0.9 }, 0.03);
  assert.ok(arms.right.best < -0.5, `a moment up set the best to ${arms.right.best}`);
  for (let i = 0; i < 60 && !warmup.done; i += 1) warmup.update({ left: -0.9, right: 0.6 }, 0.03);
  assert.ok(Math.abs(arms.right.best - 0.6) < 0.01);
});

/* ------------------------------- real footage, through a whole rescue ------------------------------- */

test('a real arm raised and held frees a friend, and a raise that doesn\'t reach the line frees nobody', () => {
  // Right up, held 2.6 seconds: enough at any height.
  for (const height of ['little', 'shoulder', 'head']) {
    const arms = new Arms({ side: 'right', height });
    const { game, count } = newGame({ level: 1 });
    play(0, 7, { arms, game });
    assert.equal(count('freed'), 1, `${height}: right overhead`);
    assert.equal(count('down'), 1, `${height}: and put down again`);
    assert.equal(game.stats.lifts, 1);
  }
  // Shoulder height, held 2 seconds: enough for shoulder height and for a little, and not for above the head.
  for (const [height, freed] of [['little', 1], ['shoulder', 1], ['head', 0]]) {
    const arms = new Arms({ side: 'right', height });
    const { game, count } = newGame({ level: 1 });
    play(6.6, 11.5, { arms, game });
    assert.equal(count('freed'), freed, `${height}: to the shoulder`);
    if (!freed) assert.equal(count('up'), 0, 'the weight never got to the line');
  }
  // A small raise, to about the tummy: enough only for a little.
  for (const [height, freed] of [['little', 1], ['shoulder', 0]]) {
    const arms = new Arms({ side: 'right', height });
    const { game, count } = newGame({ level: 1 });
    play(27, 32, { arms, game });
    assert.equal(count('freed'), freed, `${height}: a small raise`);
  }
});

test('the weight goes up and down with a real arm, as high as the arm goes', () => {
  const arms = new Arms({ side: 'right', height: 'head' });
  const { game } = newGame({ level: 1 });
  const heights = {};
  play(0, 7, { arms, game, each: (t) => { heights[t.toFixed(1)] = game.height; } });
  assert.ok(heights['1.0'] < 0.1, `on the ground while the arm hangs: ${heights['1.0']}`);
  assert.ok(heights['4.0'] > 1.05 && heights['4.0'] <= MOST_LIFT, `up over the line: ${heights['4.0']}`);
  assert.ok(heights['5.9'] < heights['5.5'] && heights['5.5'] <= heights['4.0'], 'coming down with it');
  assert.equal(heights['6.9'], 0);
});

test('only the arm that was chosen lifts, on real footage of each arm and of both', () => {
  // The right arm is up from 1.5 to 6.4 and the left from 12 to 16.
  const left = new Arms({ side: 'right', liftWith: 'other', height: 'head' });
  const first = newGame({ level: 1 });
  play(0, 7, { arms: left, game: first.game });
  assert.equal(first.count('freed'), 0, 'the right arm doesn\'t lift for the left');
  play(11.5, 16.5, { arms: left, game: first.game });
  assert.equal(first.count('freed'), 1);

  // With both, neither arm alone lifts anything, and the two together do, from 17 seconds.
  const both = new Arms({ side: 'right', liftWith: 'both', height: 'head' });
  const second = newGame({ level: 1 });
  play(0, 16.5, { arms: both, game: second.game });
  assert.equal(second.count('up'), 0);
  play(16.5, 22.4, { arms: both, game: second.game });
  assert.equal(second.count('freed'), 1);

  // The right overhead and the left only to the shoulder, from 32.3: enough for shoulder height, not above the head.
  for (const [height, freed] of [['shoulder', 1], ['head', 0]]) {
    const uneven = new Arms({ side: 'right', liftWith: 'both', height });
    const third = newGame({ level: 1 });
    play(31.5, 37, { arms: uneven, game: third.game });
    assert.equal(third.count('freed'), freed, `${height}: one arm lower than the other`);
    assert.ok(uneven.oneSided === false);
  }
});

test('a real arm lowered with care leaves the owl asleep, and one let drop wakes it', () => {
  // Right up, held, and down gently by 6.4 seconds.
  const gentle = newGame({ level: 6 });
  assert.equal(gentle.game.rescue.owl, true, 'the first basket at level 6 has an owl on it');
  play(0, 7, { arms: new Arms({ side: 'right', height: 'head' }), game: gentle.game });
  assert.deepEqual([gentle.count('feather'), gentle.count('woke')], [1, 0]);
  assert.equal(gentle.game.stats.feathers, 1);

  // To the shoulder, held, and dropped at 10.5 seconds.
  const dropped = newGame({ level: 6 });
  play(6.6, 11.5, { arms: new Arms({ side: 'right', height: 'shoulder' }), game: dropped.game });
  assert.deepEqual([dropped.count('freed'), dropped.count('feather'), dropped.count('woke')], [1, 0, 1]);
  assert.equal(dropped.game.owlAwake, true);
});

test('a real arm held steady fills the honey pot, and one that shakes frees the friend without it', () => {
  const steady = newGame({ level: 7 });
  assert.equal(steady.game.rescue.hive, true, 'the first basket at level 7 has a hive on it');
  play(0, 7, { arms: new Arms({ side: 'right', height: 'head' }), game: steady.game });
  assert.deepEqual([steady.count('freed'), steady.count('honey')], [1, 1]);

  // Held up from 23.4 to 26, but shaking a tenth of a metre up and down twice a second.
  const shaking = newGame({ level: 7 });
  play(22, 27.5, { arms: new Arms({ side: 'right', height: 'shoulder' }), game: shaking.game });
  assert.deepEqual([shaking.count('freed'), shaking.count('honey')], [1, 0]);
  assert.ok(shaking.game.honey < 0.8, `the pot got to ${shaking.game.honey}`);
});

/* ------------------------------- levels ------------------------------- */

test('every level from 2 to 10 brings one new thing, with a picture and a name in both languages, and level 1 none', () => {
  assert.deepEqual(newAt(1), []);
  const ids = new Set();
  for (let level = 2; level <= 10; level += 1) {
    const news = newAt(level);
    assert.equal(news.length, 1, `level ${level}`);
    for (const { mark, name, nameKa } of news) {
      assert.ok(mark && name && nameKa, `level ${level}`);
      assert.match(nameKa, /[Ⴀ-ჿ]/, `level ${level}'s name in Georgian`);
    }
    for (const { id } of NEW_THINGS[level]) ids.add(id);
  }
  assert.equal(ids.size, 9, 'each is a different thing');
  assert.deepEqual(thingsUpTo(1), []);
  assert.deepEqual(thingsUpTo(4).map(({ id }) => id), ['star', 'crate', 'tub']);
  assert.equal(thingsUpTo(10).length, 9);
  assert.deepEqual(newAt(99), newAt(10), 'and there\'s no level past 10');
});

test('a level makes a hold longer, up to 1.7 times, or 1.4 on the gentle game, and nothing a grown-up chose changes', () => {
  assert.equal(liftLevel(1).hold, 1);
  assert.ok(Math.abs(liftLevel(10).hold - 1.7) < 1e-9);
  assert.ok(Math.abs(liftLevel(10, { gentle: true }).hold - 1.4) < 1e-9);
  for (let level = 2; level <= 10; level += 1) assert.ok(liftLevel(level).hold > liftLevel(level - 1).hold);
  for (const [name, seconds] of Object.entries(HOLDS)) {
    assert.equal(new Lifting({ level: 1, hold: name }).holdSeconds, seconds);
    assert.ok(Math.abs(new Lifting({ level: 10, hold: name }).holdSeconds - seconds * 1.7) < 1e-9);
    assert.ok(Math.abs(new Lifting({ level: 10, hold: name, gentle: true }).holdSeconds - seconds * 1.4) < 1e-9);
  }
  assert.ok(HOLDS.short < HOLDS.medium && HOLDS.medium < HOLDS.long);
  // What comes at each level stays for the levels after it.
  const flags = ['star', 'owl', 'hive', 'balloons', 'helper', 'chest'];
  for (let level = 2; level <= 10; level += 1) {
    for (const flag of flags) if (liftLevel(level - 1)[flag]) assert.equal(liftLevel(level)[flag], true, `${flag} at ${level}`);
    for (const kind of liftLevel(level - 1).kinds) assert.ok(liftLevel(level).kinds.includes(kind));
  }
  assert.deepEqual(liftLevel(1).kinds, ['basket']);
  assert.deepEqual(flags.filter((flag) => liftLevel(1)[flag]), []);
});

test('a game is exactly as many lifts as a grown-up chose, at every level', () => {
  for (let level = 1; level <= 10; level += 1) {
    for (const lifts of LIFT_COUNTS) {
      const rescues = layOut({ lifts, level, random: () => 0.37 });
      assert.equal(rescues.reduce((sum, rescue) => sum + rescue.lifts, 0), lifts, `level ${level}, ${lifts} lifts`);
      assert.ok(rescues.length >= 3, `level ${level}, ${lifts} lifts: ${rescues.length} friends to free`);
      rescues.forEach((rescue, index) => assert.equal(rescue.index, index));
      const game = new Lifting({ level, lifts });
      assert.equal(game.liftsPlanned, lifts);
    }
  }
});

test('what a level brings that\'s new comes first, and level 1 is all baskets', () => {
  const first = (level) => layOut({ lifts: 8, level, random: () => 0 })[0];
  assert.ok(layOut({ lifts: 8, level: 1 }).every((rescue) => rescue.kind === 'basket' && !rescue.star && !rescue.owl && !rescue.hive && !rescue.gives));
  assert.equal(first(2).star, true);
  assert.equal(first(3).kind, 'crate');
  assert.equal(first(4).kind, 'tub');
  assert.equal(first(5).kind, 'rock');
  assert.equal(first(6).owl, true);
  assert.equal(first(7).hive, true);
  assert.equal(first(8).gives, 'balloons');
  assert.equal(first(9).gives, 'helper');
  // The chest is the last of all, and only where there are lifts enough for it.
  for (const lifts of LIFT_COUNTS) {
    const rescues = layOut({ lifts, level: 10 });
    assert.equal(rescues.at(-1).kind, 'chest', `${lifts} lifts`);
    assert.equal(rescues.filter((rescue) => rescue.kind === 'chest').length, 1);
  }
  assert.ok(!layOut({ lifts: 3, level: 10 }).some((rescue) => rescue.kind === 'chest'));
});

test('the friends to free are the other characters, never the child\'s own, and each game starts with another', () => {
  for (const { id } of ROSTER) {
    const rescues = layOut({ lifts: 12, level: 1, lifter: id });
    assert.ok(!rescues.some((rescue) => rescue.friend === id), `${id} lifts, and isn't stuck`);
    assert.equal(new Set(rescues.slice(0, 9).map((rescue) => rescue.friend)).size, 9, 'nine different friends before any comes round again');
  }
  const firsts = new Set([0, 0.2, 0.4, 0.6, 0.8].map((chance) => layOut({ lifts: 8, level: 1, random: () => chance })[0].friend));
  assert.equal(firsts.size, 5);
  // The ducklings are their own family.
  assert.equal(layOut({ lifts: 8, level: 4 })[0].friend, 'ducks');
});

test('each kind of thing is as the level says: a star over what\'s one lift, an owl or a hive only on baskets', () => {
  for (let level = 1; level <= 10; level += 1) {
    for (const rescue of layOut({ lifts: 12, level, random: () => 0.5 })) {
      assert.equal(rescue.lifts, THINGS[rescue.kind].lifts);
      assert.ok((THINGS[rescue.kind].from ?? 1) <= level, `${rescue.kind} at level ${level}`);
      assert.equal(rescue.star, level >= 2 && ['basket', 'crate'].includes(rescue.kind), `a star on a ${rescue.kind} at level ${level}`);
      if (rescue.owl || rescue.hive) assert.equal(rescue.kind, 'basket');
      assert.ok(!(rescue.owl && rescue.hive), 'never both on one basket');
      if (rescue.owl) assert.ok(level >= 6);
      if (rescue.hive) assert.ok(level >= 7);
      if (rescue.gives === 'balloons') assert.ok(level >= 8);
      if (rescue.gives === 'helper') assert.ok(level >= 9);
    }
  }
  // Balloons are only given just before a heavy crate, as they're for making one light.
  for (let level = 8; level <= 10; level += 1) {
    for (const lifts of LIFT_COUNTS) {
      const rescues = layOut({ lifts, level });
      rescues.forEach((rescue, index) => {
        if (rescue.gives === 'balloons') assert.equal(rescues[index + 1].heavy, true, `level ${level}, ${lifts} lifts`);
      });
    }
  }
});

test('with friends it\'s the plain game, laid out the same on every computer from one seed', () => {
  const seeded = (seed) => {
    let state = seed;
    return () => {
      state = (state * 9301 + 49297) % 233280;
      return state / 233280;
    };
  };
  const one = layOut({ lifts: 8, level: 9, plain: true, lifter: null, random: seeded(5) });
  const other = layOut({ lifts: 8, level: 9, plain: true, lifter: null, random: seeded(5) });
  assert.deepEqual(one, other);
  assert.ok(one.every((rescue) => rescue.kind === 'basket' && !rescue.star && !rescue.owl && !rescue.hive && !rescue.gives));
  assert.equal(one.length, 8);
  assert.equal(new Lifting({ level: 9, plain: true }).plain, true);
  // The host's level still sets how long a hold is, as it always did, and there's no clock before sunset.
  assert.ok(Math.abs(new Lifting({ level: 9, plain: true }).holdSeconds - HOLDS.medium * liftLevel(9, { gentle: true }).hold) < 1e-9, 'the host\'s level still sets how long a hold is');
  assert.equal(new Lifting({ level: 9, plain: true }).timeLeft, null);
  assert.equal(new Lifting({ level: 9, team: { size: 2 } }).timeLeft, null);
});

/* ------------------------------- a game ------------------------------- */

test('raising the arm lifts the weight, holding it up frees the friend, and putting it down brings the next', () => {
  const { game, types, seen } = newGame({ level: 1, lifts: 5 });
  assert.equal(game.phase, 'lifting', 'the first friend is there from the start, with nothing to wait for');
  assert.deepEqual(types(), ['arrive']);
  run(game, 0.5, (t) => t * 2.1);
  assert.ok(game.up, 'at the line');
  assert.ok(game.height > 1 && game.height === game.lift, `the weight is as high as the arm: ${game.height}`);
  run(game, 0.5, 1.05);
  assert.ok(game.out > 0.4 && game.out < 0.6, `half way out after half a second: ${game.out}`);
  assert.equal(game.phase, 'lifting');
  run(game, 0.55, 1.05);
  assert.equal(game.phase, 'freed');
  assert.deepEqual(types(), ['arrive', 'lift', 'up', 'freed']);
  assert.equal(seen.at(-1).rescue, game.rescues[0]);
  // It stays up as long as the arm does, and the next friend only comes once it's down.
  run(game, 3, 1.05);
  assert.equal(game.phase, 'freed');
  assert.ok(game.height > 1);
  run(game, 1, (t) => 1.05 * (1 - t));
  run(game, 0.2, 0);
  assert.equal(game.phase, 'resting');
  assert.equal(types().at(-1), 'down');
  run(game, 1.7, 0);
  assert.equal(game.phase, 'arriving');
  assert.equal(game.index, 1);
  run(game, 1, 0);
  assert.equal(game.phase, 'lifting');
  assert.deepEqual(types().slice(-2), ['down', 'arrive']);
});

test('a whole game: every friend freed, and then it\'s finished, with nothing to lose on the way', () => {
  const { game, count, seen } = newGame({ level: 1, lifts: 5 });
  playThrough(game, 1.2);
  assert.equal(game.state, 'finished');
  assert.equal(count('freed'), 5);
  assert.equal(count('finished'), 1);
  assert.deepEqual(seen.at(-1).all, true);
  assert.equal(game.stats.freed, 5);
  assert.equal(game.stats.lifts, 5);
  assert.equal(game.liftsDone, 5);
  // Nothing more happens once it's over.
  const events = seen.length;
  run(game, 5, 1.2);
  assert.equal(seen.length, events);
});

test('letting it down early loses nothing: the friend waits where they got to', () => {
  const { game, count } = newGame({ level: 1, hold: 'long' });
  oneLift(game, 0.6);
  assert.equal(count('dropped'), 1);
  const out = game.out;
  assert.ok(out > 0.3 && out < 0.5, `out by ${out}`);
  run(game, 20, 0);
  assert.equal(game.out, out, 'however long the arm rests');
  oneLift(game, 0.6);
  assert.ok(game.out > out);
  assert.equal(count('freed'), 0);
  oneLift(game, 0.6);
  assert.equal(count('freed'), 1, 'three short holds do what one long one does');
  assert.equal(game.stats.lifts, 3);
});

test('an arm at rest is never punished: nothing happens, nothing is lost, and after a while it\'s told that\'s fine', () => {
  const { game, types } = newGame({ level: 10 });
  run(game, 14, 0);
  assert.deepEqual(types(), ['arrive']);
  assert.equal(game.resting, false);
  run(game, 2, 0);
  assert.deepEqual(types(), ['arrive', 'resting']);
  assert.equal(game.resting, true);
  run(game, 600, 0);
  assert.deepEqual(types(), ['arrive', 'resting'], 'ten minutes on, the friend is still waiting, and it\'s said only once');
  assert.equal(game.state, 'playing');
  assert.equal(game.index, 0);
  // Lifting again is having a go, and resting after that is said again.
  oneLift(game, 0.2);
  assert.equal(game.resting, false);
});

test('a wobble at the line doesn\'t drop the weight, and each time the arm comes right down and goes up is one lift', () => {
  const { game, count } = newGame({ level: 1, hold: 'long' });
  run(game, 0.5, (t) => t * 2.1);
  // Bobbing a little under the line and back.
  run(game, 1.2, (t) => 1 + Math.sin(t * 20) * 0.08);
  assert.equal(count('dropped'), 0);
  assert.equal(game.stats.lifts, 1);
  // Down to half way and up again is the same lift, and right down and up is another.
  run(game, 0.3, 0.5);
  run(game, 0.3, 1.05);
  assert.equal(game.stats.lifts, 1);
  run(game, 0.3, 0.1);
  run(game, 0.3, 1.05);
  assert.equal(game.stats.lifts, 2);
});

test('a weight goes no higher than a little above the line, however high the arm', () => {
  const { game } = newGame({ level: 1 });
  run(game, 2, 3.5);
  assert.equal(game.height, MOST_LIFT);
  assert.equal(game.lift, 3.5);
});

test('how long it was held up is counted: in all, and the longest at once', () => {
  const { game } = newGame({ level: 1, hold: 'long' });
  oneLift(game, 1);
  oneLift(game, 0.5);
  assert.ok(game.stats.longestHold > 1 && game.stats.longestHold < 1.3, `longest ${game.stats.longestHold}`);
  assert.ok(game.stats.heldSeconds > 1.5 && game.stats.heldSeconds < 2.1, `in all ${game.stats.heldSeconds}`);
});

test('what\'s asked for comes only after a while, and is the right thing', () => {
  const { game } = newGame({ level: 1, hold: 'long' });
  run(game, 3.5, 0);
  assert.equal(game.hint, null);
  run(game, 1, 0);
  assert.equal(game.hint, 'lift');
  // Up part of the way, and stuck there.
  run(game, 2, 0.6);
  assert.equal(game.hint, null);
  run(game, 1, 0.6);
  assert.equal(game.hint, 'higher');
  // Up, and nothing is asked. Down before the friend is out: it's the hold that's wanted.
  run(game, 1, 1.05);
  assert.equal(game.hint, null);
  run(game, 4.5, 0);
  assert.equal(game.hint, 'hold');
  // Free, and still holding it up: put it down.
  run(game, 3, 1.05);
  assert.equal(game.phase, 'freed');
  assert.equal(game.hint, null);
  run(game, 3, 1.05);
  assert.equal(game.hint, 'down');
  run(game, 1, 0);
  assert.equal(game.hint, null);
  // Resting, nothing is asked at all.
  run(game, 30, 0);
  assert.equal(game.phase, 'lifting');
  assert.equal(game.resting, true);
  assert.equal(game.hint, null);
});

test('an arm that stops part of the way down after a rescue is where it rests, and the next friend comes', () => {
  const { game, count, seen } = newGame({ level: 1 });
  run(game, 0.5, (t) => t * 2.1);
  run(game, 1.2, 1.05);
  assert.equal(game.phase, 'freed');
  // Down to 0.4 of the way, as a bent arm rests, and still.
  run(game, 0.5, (t) => 1.05 - t * 1.3);
  run(game, 1.5, 0.4);
  assert.equal(count('settle'), 0);
  run(game, 1.5, 0.4);
  assert.equal(count('settle'), 1);
  assert.equal(game.phase, 'freed', 'the rules only say so: the game then counts that as the arm\'s rest');
  // Which makes it 0, and down the weight goes.
  run(game, 0.5, 0);
  assert.equal(game.phase, 'resting');
  assert.equal(seen.at(-1).gentle, true);
});

/* ------------------------------- what each level brings ------------------------------- */

test('level 2: a star hangs above the line, had by lifting a little higher, and missing it costs nothing', () => {
  assert.equal(starAtFor(null), 1.15);
  assert.equal(starAtFor(2), STAR_AT);
  assert.equal(starAtFor(1.11), 1.08, 'for a child whose line is near the top of their reach, it\'s only a little above it');
  assert.ok(starAtFor(1.2) > 1.08 && starAtFor(1.2) < 1.2, 'and always within reach');

  const high = newGame({ level: 2, reach: 2 });
  assert.equal(high.game.starAt, STAR_AT);
  oneLift(high.game, 1.5, 1.05);
  assert.deepEqual([high.count('freed'), high.count('star')], [1, 0], 'at the line, the friend is free and the star still hangs');
  run(high.game, 3, 0);
  oneLift(high.game, 1.5, STAR_AT + 0.02);
  assert.equal(high.count('star'), 1);
  assert.equal(high.game.stats.stars, 1);
  assert.equal(high.game.stats.starsHung, 2);
  // Once a rescue: holding it there doesn't take it twice.
  const once = newGame({ level: 2, reach: 2, hold: 'long' });
  run(once.game, 3, 1.3);
  assert.equal(once.count('star'), 1);
  // And none at level 1.
  const plain = newGame({ level: 1 });
  run(plain.game, 3, 1.3);
  assert.equal(plain.count('star'), 0);
});

test('level 3: a heavy crate comes up slowly however quick the arm, and a basket comes up with it', () => {
  // How long a weight takes to get up to the line with the arm held over it from the start.
  const secondsToUp = (game) => {
    let seconds = 0;
    while (!game.up && seconds < 10) {
      game.update(1 / 60, 1.2);
      seconds += 1 / 60;
    }
    return seconds;
  };
  const crate = newGame({ level: 3 });
  assert.equal(crate.game.rescue.kind, 'crate');
  assert.equal(crate.game.slow, true);
  const seconds = secondsToUp(crate.game);
  assert.ok(Math.abs(seconds - liftLevel(3).heavyRise) < 0.1, `a crate took ${seconds} seconds to come up`);
  assert.ok(liftLevel(3).heavyRise >= 1.2 && liftLevel(10).heavyRise <= 1.7);
  const basket = newGame({ level: 1 });
  assert.equal(basket.game.rescue.kind, 'basket');
  const basketSeconds = secondsToUp(basket.game);
  assert.ok(basketSeconds < 0.4, `a basket took ${basketSeconds}`);
  // It comes down with the arm as anything does, and what it has risen isn't lost by a pause on the way up.
  run(crate.game, 0.3, 0);
  assert.ok(crate.game.height < 0.1);
});

test('level 4: three ducklings come out one at a time, each one kept, over a longer hold', () => {
  const { game, count, seen } = newGame({ level: 4, hold: 'medium' });
  assert.equal(game.rescue.kind, 'tub');
  assert.equal(game.rescue.friend, 'ducks');
  const hold = game.holdSeconds * 1.8;
  run(game, 0.4, (t) => t * 3);
  run(game, hold / 3 + 0.05, 1.1);
  assert.equal(count('part'), 1);
  assert.deepEqual([seen.at(-1).n, seen.at(-1).of], [1, 3]);
  // Down, and the first duckling stays out.
  run(game, 3, 0);
  assert.equal(game.parts, 1);
  assert.equal(game.stats.ducklings, 1);
  run(game, 0.4, (t) => t * 3);
  run(game, hold / 3 + 0.05, 1.1);
  assert.equal(count('part'), 2);
  run(game, hold / 3 + 0.05, 1.1);
  assert.equal(count('freed'), 1);
  assert.equal(game.stats.ducklings, 3);
  assert.equal(game.stats.freed, 1, 'the family is one rescue');
});

test('level 5: a big rock takes two lifts, stays up a notch between them, and the arm has to come down for the second', () => {
  const { game, count, seen } = newGame({ level: 5 });
  assert.equal(game.rescue.kind, 'rock');
  assert.equal(game.rescue.lifts, 2);
  run(game, 0.4, (t) => t * 3);
  run(game, game.holdSeconds * 0.5 + 0.05, 1.1);
  assert.equal(count('notch'), 1);
  assert.deepEqual([seen.at(-1).n, seen.at(-1).of], [1, 2]);
  assert.equal(game.mustLower, true);
  assert.equal(game.liftsDone, 1);
  // Still holding it up does nothing more: the rock is on its jack, half way.
  run(game, 3, 1.1);
  assert.equal(count('notch'), 1);
  assert.ok(Math.abs(game.thingHeight - 0.5) < 1e-9, `the rock is at ${game.thingHeight}`);
  run(game, 1, 1.1);
  assert.equal(game.hint, 'again');
  // Down, and it stays up. Up again, and it's free.
  run(game, 0.5, 0);
  assert.equal(game.mustLower, false);
  assert.ok(Math.abs(game.thingHeight - 0.5) < 1e-9);
  assert.equal(count('freed'), 0);
  run(game, 0.4, (t) => t * 3);
  assert.ok(game.thingHeight > 0.9);
  run(game, game.holdSeconds * 0.5 + 0.05, 1.1);
  assert.equal(count('notch'), 2);
  assert.equal(count('freed'), 1);
  assert.equal(game.stats.lifts, 2);
  assert.ok(game.thingHeight >= 1, 'and it stays up while the friend gets out');
});

test('level 6: an owl asleep on a basket stays asleep if it\'s put down gently, and flies off if it\'s dropped', () => {
  const lowered = newGame({ level: 6 });
  assert.equal(lowered.game.rescue.owl, true);
  run(lowered.game, 0.4, (t) => t * 3);
  run(lowered.game, 1.5, 1.1);
  run(lowered.game, 1, (t) => 1.1 * (1 - t));
  run(lowered.game, 0.3, 0);
  assert.deepEqual([lowered.count('feather'), lowered.count('woke')], [1, 0]);
  assert.equal(lowered.seen.find(({ type }) => type === 'down').gentle, true);

  const dropped = newGame({ level: 6 });
  run(dropped.game, 0.4, (t) => t * 3);
  run(dropped.game, 1.5, 1.1);
  run(dropped.game, 0.5, 0);
  assert.deepEqual([dropped.count('feather'), dropped.count('woke')], [0, 1]);
  assert.equal(dropped.seen.find(({ type }) => type === 'down').gentle, false);
  assert.equal(dropped.game.stats.feathers, 0);
  assert.equal(dropped.game.stats.owls, 1);
  assert.equal(dropped.game.state, 'playing', 'and the game goes on just the same');

  // An arm held up for a long time and then lowered with care is gentle too, wherever it stopped on the way.
  const slow = newGame({ level: 6 });
  run(slow.game, 0.4, (t) => t * 3);
  run(slow.game, 6, 1.1);
  run(slow.game, 0.2, 0.7);
  run(slow.game, 1, 0.7);
  run(slow.game, 0.3, 0);
  assert.equal(slow.count('feather'), 1);
});

test('level 7: a steady hold fills the honey pot, a shaking one doesn\'t, and either frees the friend', () => {
  const steady = newGame({ level: 7 });
  assert.equal(steady.game.rescue.hive, true);
  run(steady.game, 0.4, (t) => t * 3);
  run(steady.game, 2.5, 1.1);
  assert.deepEqual([steady.count('freed'), steady.count('honey')], [1, 1]);
  assert.equal(steady.game.stats.honey, 1);

  const shaking = newGame({ level: 7 });
  run(shaking.game, 0.4, (t) => t * 3);
  run(shaking.game, 2.5, (t) => 1.15 + Math.sin(t * 14) * 0.12);
  assert.deepEqual([shaking.count('freed'), shaking.count('honey')], [1, 0]);
  assert.equal(shaking.game.steady, false);
  // Held still after that, the pot fills after all: the hive is up for as long as the arm is.
  run(shaking.game, 2, 1.15);
  assert.equal(shaking.count('honey'), 1);
});

test('level 8: the first friend gives balloons, and the heavy crate after them comes up as fast as a basket', () => {
  const { game, count } = newGame({ level: 8 });
  assert.equal(game.rescue.gives, 'balloons');
  assert.equal(game.rescues[1].kind, 'crate');
  oneLift(game, 2);
  assert.equal(count('balloons'), 1);
  assert.equal(game.balloons, 2);
  run(game, 3, 0);
  assert.equal(game.rescue.kind, 'crate');
  assert.equal(game.slow, false, 'light, with balloons on it');
  let seconds = 0;
  while (!game.up && seconds < 10) {
    game.update(1 / 60, 1.2);
    seconds += 1 / 60;
  }
  assert.ok(seconds < 0.4, `it came up in ${seconds}`);
  // Resting never uses them up: they last until they've made their crates light.
  const waiting = newGame({ level: 8 });
  oneLift(waiting.game, 2);
  run(waiting.game, 120, 0);
  assert.equal(waiting.game.balloons, 2);
  // And they're used up one crate at a time.
  run(game, 3, 1.2);
  assert.equal(game.balloons, 1);
  assert.equal(count('balloons-gone'), 0);
});

test('level 9: the first friend freed stays to help, and the next one gets out twice as fast', () => {
  const timeToFree = (level) => {
    const { game, count, seen } = newGame({ level, hold: 'long' });
    oneLift(game, 4);
    run(game, 3, 0);
    assert.equal(game.index, 1);
    const kind = game.rescue.kind;
    // Up, and held until the friend is out, however heavy it is.
    let held = 0;
    run(game, 0.3, (t) => t * 4);
    while (game.phase === 'lifting' && held < 20) {
      game.update(1 / 60, 1.2);
      if (game.up) held += 1 / 60;
    }
    return { held, game, count, seen, kind };
  };
  const helped = timeToFree(9);
  assert.equal(helped.count('helper'), 1);
  assert.equal(helped.seen.find(({ type }) => type === 'helper').friend, helped.game.rescues[0].friend, 'the helper is the friend just freed');
  assert.equal(helped.count('helper-gone'), 1, 'and they\'ve gone once they\'ve helped');
  const alone = timeToFree(8);
  assert.equal(helped.kind, alone.kind);
  const ratio = (helped.held / liftLevel(9).hold) / (alone.held / liftLevel(8).hold);
  assert.ok(Math.abs(ratio - 0.5) < 0.05, `with help it took ${helped.held} against ${alone.held}`);
  assert.equal(helped.game.helping, false);
});

test('level 10: the champion\'s chest is the last thing, takes three lifts, and has the trophy in it', () => {
  const { game, count, seen } = newGame({ level: 10, lifts: 5 });
  playThrough(game);
  assert.equal(game.state, 'finished');
  assert.equal(count('trophy'), 1);
  assert.equal(game.stats.trophy, true);
  const chest = game.rescues.at(-1);
  assert.equal(chest.kind, 'chest');
  assert.equal(seen.filter(({ type, rescue }) => type === 'notch' && rescue === chest).length, 3);
  const order = seen.map(({ type }) => type);
  assert.ok(order.lastIndexOf('trophy') > order.lastIndexOf('notch'));
  assert.equal(game.stats.freed, game.rescues.length);
  // No trophy at level 9.
  const before = newGame({ level: 9, lifts: 5 });
  playThrough(before.game);
  assert.equal(before.game.stats.trophy, false);
});

test('every level can be played through to the end, by an arm that holds long enough, with as many lifts as were planned', () => {
  for (let level = 1; level <= 10; level += 1) {
    for (const lifts of LIFT_COUNTS) {
      const { game } = newGame({ level, lifts, hold: 'long' });
      playThrough(game, 9);
      assert.equal(game.state, 'finished', `level ${level}, ${lifts} lifts`);
      assert.equal(game.stats.freed, game.rescues.length);
      assert.equal(game.liftsDone, lifts);
      assert.equal(game.stats.lifts, lifts, `level ${level}, ${lifts} lifts: one lift each, held long enough`);
    }
  }
});

/* ------------------------------- with friends ------------------------------- */

test('together, the weight is as high as everyone\'s arms between them, and the friend gets out as fast as the share that are up', () => {
  const two = newGame({ level: 1, team: { size: 2 } });
  assert.equal(two.game.plain, true);
  const down = [{ lift: 0, up: false }];
  const up = [{ lift: 1.1, up: true }];
  // This child up, the friend's arm down: the weight is half way, and the friend still gets out, half as fast.
  run(two.game, 0.5, (t) => t * 2.2, { mates: down });
  run(two.game, 1, 1.1, { mates: down });
  assert.ok(Math.abs(two.game.height - 0.55) < 0.02, `half way: ${two.game.height}`);
  assert.ok(Math.abs(two.game.out - 0.5) < 0.1, `out by ${two.game.out} after a second`);
  assert.equal(two.count('freed'), 0);
  // Both up: all the way, at full speed.
  run(two.game, 0.5, 1.1, { mates: up });
  assert.ok(two.game.height > 1.05);
  assert.equal(two.count('freed'), 1);

  // This child resting while the friend lifts: it still goes up, and the friend is freed.
  const resting = newGame({ level: 1, team: { size: 2 } });
  run(resting.game, 2.6, 0, { mates: up });
  assert.equal(resting.count('freed'), 1);
  assert.equal(resting.game.stats.lifts, 0, 'though this child lifted nothing');

  // Four of them, with one arm up: a quarter of the speed, and it gets there.
  const four = newGame({ level: 1, team: { size: 4 } });
  run(four.game, 4.6, 1.1, { mates: [down[0], down[0], down[0]] });
  assert.equal(four.count('freed'), 1);
});

test('together, nobody is waited for: the next friend comes whoever is still holding the weight up', () => {
  const { game } = newGame({ level: 1, team: { size: 2 } });
  const up = [{ lift: 1.1, up: true }];
  run(game, 2, 1.1, { mates: up });
  assert.equal(game.phase, 'freed');
  run(game, 1.5, 0, { mates: up });
  assert.equal(game.phase, 'resting');
  run(game, 3, 0, { mates: up });
  assert.equal(game.index, 1);
  assert.equal(game.hint, null);
});

test('together, a rescue is over on every computer as soon as it is on one, and a game that fell behind catches up', () => {
  const mine = newGame({ level: 1, team: { size: 2 } });
  run(mine.game, 0.5, 0.4);
  mine.game.settle(0);
  assert.equal(mine.count('freed'), 1);
  mine.game.settle(0);
  assert.equal(mine.count('freed'), 1, 'heard twice, it\'s still once');
  // Two more are done on a friend's computer while this game was stopped, as with the panel open.
  mine.game.settle(1);
  mine.game.settle(2);
  assert.equal(mine.count('freed'), 1, 'not until this game gets to them');
  run(mine.game, 12, 0);
  assert.equal(mine.count('freed'), 3);
  assert.equal(mine.game.index, 3);
  assert.equal(mine.game.phase, 'lifting', 'and then it waits for arms, as everyone\'s game does');
  // Something from before this rescue changes nothing.
  mine.game.settle(1);
  assert.equal(mine.count('freed'), 3);
});

test('against each other, a game that\'s stopped because a friend has freed all of theirs says how far it got', () => {
  const { game, seen, count } = newGame({ level: 1, lifts: 5, plain: true });
  oneLift(game, 1.5);
  run(game, 3, 0);
  oneLift(game, 1.5);
  game.finish();
  assert.equal(game.state, 'finished');
  assert.equal(seen.at(-1).type, 'finished');
  assert.equal(seen.at(-1).all, false);
  assert.equal(seen.at(-1).stats.freed, 2);
  game.finish();
  assert.equal(count('finished'), 1);
});

/* ---------- before sunset: a game can be lost ---------- */

/** An arm that takes up seconds to get up, holds it a little longer than it needs, and takes down seconds to come down. */
const slowLift = (game, up, down) => {
  run(game, up, (t) => (t / up) * 1.05);
  run(game, game.holdSeconds * 1.15, 1.05);
  run(game, down, (t) => 1.05 * (1 - t / down));
  run(game, 0.5, 0);
};

/** Lifts like that until the game is over, or it's gone on far too long. */
function liftUntilOver(game, up, down) {
  for (let i = 0; i < 200 && game.state === 'playing'; i += 1) slowLift(game, up, down);
  return game;
}

test('as it comes, the lifts have to be done before sunset, and the clock gets shorter level by level', () => {
  const { game } = newGame({ gentle: false });
  assert.ok(game.timeLeft > 0, 'a clock, as it comes');
  assert.equal(game.timeLeft, game.timeAll);
  const perLift = (level) => {
    const lifting = new Lifting({ level, lifts: 8, random: () => 0 });
    return lifting.timeAll / lifting.liftsPlanned;
  };
  for (let level = 2; level <= 10; level += 1) assert.ok(liftLevel(level).clock.perLift < liftLevel(level - 1).clock.perLift);
  assert.ok(perLift(1) > 10, `${perLift(1)} seconds a lift at level 1`);
  assert.ok(perLift(10) < 7, `${perLift(10)} seconds a lift at level 10`);
});

test('a child whose arm is slow, four seconds up, frees everyone before sunset at level 1, and so does a quick one at level 10', () => {
  const steady = liftUntilOver(newGame({ gentle: false, level: 1 }).game, 4, 4);
  assert.deepEqual([steady.state, steady.lost, steady.stats.freed], ['finished', false, 8]);
  assert.ok(steady.timeLeft > steady.timeAll * 0.2, `${steady.timeLeft} of ${steady.timeAll} seconds left`);
  const quick = liftUntilOver(newGame({ gentle: false, level: 10 }).game, 0.5, 0.5);
  assert.deepEqual([quick.state, quick.lost], ['finished', false]);
});

test('lifting slowly at level 10, two and a half seconds up, the sun sets first: the game is over, with friends still to free', () => {
  const { game, seen, count } = newGame({ gentle: false, level: 10 });
  liftUntilOver(game, 2.5, 2.5);
  assert.equal(game.state, 'finished');
  assert.equal(game.lost, true);
  assert.equal(game.timeLeft, 0);
  assert.ok(game.stats.freed < game.rescues.length, `${game.stats.freed} of ${game.rescues.length} freed`);
  assert.equal(count('sunset'), 1);
  assert.equal(seen.find(({ type }) => type === 'finished').all, false);
  // Nothing more happens after.
  const freed = game.stats.freed;
  run(game, 10, 1.05);
  assert.equal(game.stats.freed, freed);
});

test('the clock waits for an arm that rests, between friends, and for a child out of the picture', () => {
  const { game } = newGame({ gentle: false, level: 5 });
  // Down for a moment costs a moment, and then the clock waits for as long as the arm rests.
  run(game, 4.5, 0);
  const rested = game.timeLeft;
  assert.ok(game.timeAll - rested <= 4.1, `${game.timeAll - rested} seconds gone`);
  assert.equal(game.clockWaits, true);
  run(game, 120, 0);
  assert.equal(game.timeLeft, rested);
  // Half way up and out of the picture: it waits.
  for (let i = 0; i < 600; i += 1) game.update(1 / 60, 0.6, [], { seen: false });
  assert.equal(game.timeLeft, rested);
  // Half way up, in the picture: it runs.
  run(game, 2, 0.6);
  assert.ok(game.timeLeft < rested - 1.9);
  // Between one friend and the next, it waits.
  oneLift(game, game.holdSeconds + 0.2);
  for (let i = 0; i < 600 && game.phase !== 'resting' && game.phase !== 'arriving'; i += 1) game.update(1 / 60, 0);
  const between = game.timeLeft;
  for (let i = 0; i < 300 && (game.phase === 'resting' || game.phase === 'arriving'); i += 1) game.update(1 / 60, 0);
  assert.ok(between - game.timeLeft < 0.05, 'nothing gone between friends');
});

test('the gentle game is as it was: no clock, and however slowly the arm goes, every friend is freed', () => {
  const { game } = newGame({ gentle: true, level: 10 });
  assert.equal(game.timeLeft, null);
  liftUntilOver(game, 4, 4);
  assert.deepEqual([game.state, game.lost, game.stats.freed], ['finished', false, game.rescues.length]);
});

/* ---------- several lifting in front of one camera ---------- */

test('someone else at the camera: each time their arm goes up to its line is one lift, and a wobble at the top isn\'t another', () => {
  const partner = new Partner();
  assert.equal(partner.read(0.5), false, 'half way up is no lift');
  assert.equal(partner.up, false);
  assert.equal(partner.read(1.02), true, 'up at the line');
  assert.equal(partner.up, true);
  assert.equal(partner.lifts, 1);
  // Dipping a little under the line and back is the same lift, still held.
  assert.equal(partner.read(0.92), false);
  assert.equal(partner.up, true, 'still up, as a wobble doesn\'t drop it');
  assert.equal(partner.read(1.1), false);
  assert.equal(partner.lifts, 1);
  // Further down it's no longer up, but until the arm has come right down, going up again isn't another lift.
  assert.equal(partner.read(0.6), false);
  assert.equal(partner.up, false);
  assert.equal(partner.read(1.1), false);
  assert.equal(partner.up, true, 'it does lift the weight again');
  assert.equal(partner.lifts, 1, 'but it isn\'t counted twice');
  // Down, and up again: the second lift.
  assert.equal(partner.read(0.1), false);
  assert.equal(partner.read(1.2), true);
  assert.equal(partner.lifts, 2);
  // An arm the camera can't read is down, and so is one that reads below where it rests.
  for (const unread of [null, undefined, NaN, -0.4]) {
    assert.equal(partner.read(unread), false);
    assert.equal(partner.lift, 0);
    assert.equal(partner.up, false);
  }
});

test('several at one camera lift one weight: one of them alone frees the friend, slowly, and their lifts are their own', () => {
  const { game, count } = newGame({ level: 1, team: { size: 2 } });
  const partner = new Partner();
  // The child rests, and the other one lifts and holds: half the speed, so twice the hold.
  let seconds = 0;
  while (count('freed') === 0 && seconds < 10) {
    partner.read(1.1);
    game.update(1 / 60, 0, [partner]);
    seconds += 1 / 60;
  }
  assert.equal(count('freed'), 1);
  assert.ok(seconds > game.holdSeconds * 1.8 && seconds < game.holdSeconds * 2.4, `in about two holds: ${seconds}`);
  assert.equal(partner.lifts, 1);
  assert.equal(game.stats.lifts, 0, 'the child who rested lifted nothing');
  // With one arm of two up, the weight is half way to as high as it goes, not at its line.
  assert.ok(game.height > 0.5 && game.height < 0.6, String(game.height));
  assert.equal(game.up, false);
  // Like the game friends play together, it's the plain one, with no clock: nothing to lose.
  assert.equal(game.plain, true);
  assert.equal(game.timeLeft, null);
});

test('nobody who\'s lifting is stuck under anything: with several lifters, none of their characters needs freeing', () => {
  const lifters = ['giraffe', 'truffle', 'kit', 'mochi'];
  for (let first = 0; first < 10; first += 1) {
    const rescues = layOut({ lifts: 12, level: 1, lifter: lifters, random: () => first / 10, plain: true });
    assert.equal(rescues.length, 12);
    for (const { friend } of rescues) assert.ok(!lifters.includes(friend), `${friend} is lifting`);
  }
  // One lifter, by name as it always was, or in a list: the same.
  assert.deepEqual(layOut({ lifts: 8, lifter: ['kit'], random: () => 0.3 }), layOut({ lifts: 8, lifter: 'kit', random: () => 0.3 }));
  // And with nobody named, as friends play it on their own computers, anyone may be stuck.
  const anyone = new Set(layOut({ lifts: 12, lifter: null, random: () => 0, plain: true }).map(({ friend }) => friend));
  assert.equal(anyone.size, ROSTER.length);
});
