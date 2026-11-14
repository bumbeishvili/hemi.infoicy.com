// Tests the open-hand rules against what the real model reported for real photos.
// test/fixtures/photo-hands.json holds the model's landmarks for each photo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  HandCheck,
  OPEN_RULES,
  PlayStats,
  measureHand,
  promptFor,
  steerFromReach,
  targetFor,
} from '../../core/hands.js';
import { FINGERS_PROMPT, SHAPES, SHAPE_RESTING } from '../../core/shapes.js';
import { FIST, FRAME_ASPECT, OPEN, feed, handAt, leftHand, photos, rightHand, setup } from './photo-hands.js';
import { engineRate, gearAt } from '../../games/high-five-racers/car-sound.js';

const score = (name, index = 0) => measureHand(photos[name].hands[index].world).openness;

test('poses that are not open all score below the floor', () => {
  for (const name of ['fist', 'pointing_up', 'pointing_up_rotated', 'victory', 'thumb_up']) {
    assert.ok(score(name) < OPEN_RULES.floor, `${name} scored ${score(name).toFixed(2)}`);
  }
});

test('wide open hands score high and relaxed hands land in between', () => {
  for (const name of ['left_hands', 'right_hands']) {
    for (const index of [0, 1]) assert.ok(score(name, index) >= 0.9, `${name} scored ${score(name, index)}`);
  }
  for (const index of [0, 1]) {
    const relaxed = score('woman_hands', index);
    assert.ok(relaxed > OPEN_RULES.floor && relaxed < 0.8, `relaxed scored ${relaxed}`);
  }
});

test('one curled finger or a tucked thumb pulls a hand well below wide open', () => {
  const world = photos[OPEN].hands[0].world;
  const curlFinger = structuredClone(world);
  // Fold the pinky back towards the wrist.
  for (const joint of [18, 19, 20]) curlFinger[joint] = { ...world[17], z: world[17].z + 0.002 * (joint - 17) };
  assert.ok(measureHand(curlFinger).openness < 0.7, 'a curled pinky should cost a lot');

  const tuckThumb = structuredClone(world);
  tuckThumb[4] = { ...world[9] };
  assert.ok(measureHand(tuckThumb).openness <= 2 / 3 + 0.001, 'a tucked thumb should cost a third');
});

/**
 * A simple model of a hand with every finger curled by the same share, 0 straight to
 * 1 a full fist. It fills the gap in the photos, which have no half-curled hands.
 */
function curledHand(curl, thumbOut) {
  const world = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  const fingers = [
    { knuckle: 5, x: -0.026, y: 0.09, bones: [0.04, 0.024, 0.02] },
    { knuckle: 9, x: -0.009, y: 0.095, bones: [0.044, 0.028, 0.021] },
    { knuckle: 13, x: 0.009, y: 0.09, bones: [0.04, 0.026, 0.02] },
    { knuckle: 17, x: 0.026, y: 0.08, bones: [0.032, 0.019, 0.018] },
  ];
  for (const { knuckle, x, y, bones } of fingers) {
    world[knuckle] = { x, y, z: 0 };
    // Bend at the three joints, adding up as a real finger does.
    const flexion = [85, 100, 70].map((degrees) => (degrees * curl * Math.PI) / 180);
    let angle = 0;
    let point = world[knuckle];
    bones.forEach((length, bone) => {
      angle += flexion[bone];
      point = { x, y: point.y + length * Math.cos(angle), z: point.z + length * Math.sin(angle) };
      world[knuckle + bone + 1] = point;
    });
  }
  // From lying across the palm to held well out to the side.
  world[4] = { x: -0.09 * thumbOut, y: 0.055 + 0.01 * thumbOut, z: 0.02 * (1 - thumbOut) };
  return world;
}

test('openness falls steadily as fingers curl, all the way from straight to a fist', () => {
  const scores = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].map((curl) => ({
    curl,
    openness: measureHand(curledHand(curl, 1)).openness,
  }));
  console.log(scores.map(({ curl, openness }) => `${curl}: ${openness.toFixed(2)}`).join('  '));
  for (let i = 1; i < scores.length; i++) {
    assert.ok(scores[i].openness <= scores[i - 1].openness + 1e-9, `not steady at curl ${scores[i].curl}`);
  }
  const at = (curl) => scores.find((score) => score.curl === curl).openness;
  assert.ok(at(0) > 0.95, 'straight fingers');
  const defaultTarget = targetFor(OPEN_RULES.defaultBest, OPEN_RULES.defaultStrictness);
  assert.ok(at(0.5) < defaultTarget, `half curled scored ${at(0.5)} against ${defaultTarget}`);
  // With the thumb out it still takes a third of the score, so judge the fingers alone.
  assert.ok(measureHand(curledHand(1, 0)).openness < 0.05, 'a full fist with the thumb in');
  assert.ok(measureHand(curledHand(0.75, 0)).openness < OPEN_RULES.floor, 'mostly curled, thumb in');
});

test('the floor holds whatever the settings say', () => {
  assert.equal(targetFor(0, 0.5), OPEN_RULES.floor);
  assert.equal(targetFor(0.3, 1), OPEN_RULES.floor);
  assert.equal(targetFor(1, 1), OPEN_RULES.ceiling);
  assert.ok(Math.abs(targetFor(0.8, 0.8) - 0.64) < 1e-9);
});

test('an open hand drives, and any other pose does not', () => {
  const { monitor, clock } = setup();
  let snapshot = feed(monitor, clock, 500, [rightHand(OPEN)]);
  assert.equal(snapshot.right.status, 'open');
  assert.equal(snapshot.handOpen, true);
  assert.ok(snapshot.drive >= 0.8);

  for (const pose of ['fist', 'pointing_up', 'victory', 'thumb_up']) {
    snapshot = feed(monitor, clock, 500, [rightHand(pose)]);
    assert.equal(snapshot.right.status, 'closed', pose);
    assert.equal(snapshot.drive, 0, pose);
    feed(monitor, clock, 500, [rightHand(OPEN)]);
  }
});

test('an opening has to hold, so a flicker does not start the car', () => {
  const { monitor, clock } = setup();
  feed(monitor, clock, 400, [rightHand(FIST)]);
  // Two frames of an open hand: not enough to count.
  const snapshot = feed(monitor, clock, 66, [rightHand(OPEN)]);
  assert.equal(snapshot.right.status, 'closed');
  assert.equal(snapshot.drive, 0);
});

test('a fist never passes even at the most lenient setting', () => {
  const { monitor, clock } = setup({ right: 0.5 });
  monitor.applyCheck({ best: 0.1, neutralSteer: 1 });
  const snapshot = feed(monitor, clock, 600, [rightHand(FIST)]);
  assert.equal(snapshot.right.target, OPEN_RULES.floor);
  assert.equal(snapshot.right.status, 'closed');
  assert.equal(snapshot.drive, 0);
});

test('each hand is judged against its own best', () => {
  const { monitor, clock } = setup();
  const relaxed = score('woman_hands', 1);
  const partlyOpen = (label, x) => handAt('woman_hands', x, 0.5, { index: 1, label });

  // The right hand opens fully and the left only this far.
  monitor.applyCheck({ best: 1, neutralSteer: 0.7 });
  let snapshot = feed(monitor, clock, 500, [partlyOpen('Right', 0.73)]);
  assert.equal(snapshot.right.status, 'closed', 'not enough for the right hand');

  monitor.setSide('left');
  monitor.applyCheck({ best: relaxed, neutralSteer: 0.3 });
  snapshot = feed(monitor, clock, 500, [partlyOpen('Left', 0.27)]);
  assert.equal(snapshot.left.status, 'open', 'its own best counts for the left hand');
  assert.equal(snapshot.handOpen, true);

  snapshot = feed(monitor, clock, 500, [leftHand(FIST)]);
  assert.equal(snapshot.left.status, 'closed', 'a fist still does not pass on the left');
});

test('a hand that leaves the picture stops counting after a short grace', () => {
  const { monitor, clock } = setup();
  feed(monitor, clock, 500, [rightHand(OPEN)]);

  let snapshot = feed(monitor, clock, 100, []);
  assert.equal(snapshot.right.status, 'open', 'a single dropped detection is ridden out');

  snapshot = feed(monitor, clock, 300, []);
  assert.equal(snapshot.right.status, 'missing');
  assert.equal(snapshot.handOpen, false);
  assert.equal(snapshot.drive, 0);
});

test('broken tracker numbers count as no hand, and cannot leave a hand stuck on open', () => {
  const { monitor, clock } = setup();
  feed(monitor, clock, 500, [rightHand(OPEN)]);
  const broken = rightHand(OPEN);
  broken.world = broken.world.map(() => ({ x: 0, y: 0, z: 0 }));
  const snapshot = feed(monitor, clock, 500, [broken]);
  assert.equal(snapshot.right.status, 'missing');
  assert.equal(snapshot.drive, 0);
  assert.ok(Number.isFinite(snapshot.right.openness), 'bad numbers must not stick in the smoothing');
  const recovered = feed(monitor, clock, 500, [rightHand(OPEN)]);
  assert.equal(recovered.right.status, 'open', 'and the hand recovers when good numbers return');
});

test('forgetting hands clears them at once, so a restarted camera starts from nothing', () => {
  const { monitor, clock } = setup();
  assert.equal(feed(monitor, clock, 500, [rightHand(OPEN)]).handOpen, true);
  monitor.forgetHands();
  const { right, handOpen, drive, steer } = monitor.snapshot;
  assert.deepEqual([right.status, handOpen, drive, steer], ['missing', false, 0, 0]);
});

test('a returning hand is in view at once but has to earn open', () => {
  const { monitor, clock } = setup();
  feed(monitor, clock, 500, []);
  clock.now += 33;
  const snapshot = monitor.update([rightHand(OPEN)], clock.now, FRAME_ASPECT);
  assert.equal(snapshot.right.status, 'closed');
  assert.equal(snapshot.handVisible, true);
});

test('overlay points are in screen terms', () => {
  const { monitor, clock } = setup();
  assert.ok(feed(monitor, clock, 400, [rightHand(OPEN)]).right.image[9].x > 0.5);
});

test('one hand detected twice counts as one hand', () => {
  const { monitor, clock } = setup();
  const copy = handAt(OPEN, 0.74, 0.5, { label: 'Right' });
  const snapshot = feed(monitor, clock, 500, [rightHand(OPEN), copy]);
  assert.equal(snapshot.overlap, false);
  assert.equal(snapshot.right.status, 'open');
  assert.ok(snapshot.drive > 0);
});

test('overlapping hands do not count, so one hand cannot hold the other open', () => {
  const { monitor, clock } = setup();
  const snapshot = feed(monitor, clock, 500, [handAt(OPEN, 0.44, 0.5, { label: 'Left' }), handAt(OPEN, 0.56, 0.5, { label: 'Right' })]);
  assert.equal(snapshot.overlap, true);
  assert.equal(snapshot.right.status, 'closed');
  assert.equal(snapshot.right.reason, 'overlap');
  assert.equal(snapshot.drive, 0);
  assert.equal(promptFor(snapshot).key, 'apart');
});

test('a hand cut off by the frame does not count', () => {
  const { monitor, clock } = setup();
  feed(monitor, clock, 400, [rightHand(OPEN)]);
  const snapshot = feed(monitor, clock, 200, [handAt(OPEN, 0.99, 0.5, { label: 'Right' })]);
  assert.equal(snapshot.right.status, 'closed');
  assert.equal(snapshot.right.reason, 'edge');
  assert.equal(snapshot.drive, 0);
});

test('a hand too far away to read does not count', () => {
  const { monitor, clock } = setup();
  const snapshot = feed(monitor, clock, 400, [rightHand(OPEN, { palm: 0.03 })]);
  assert.equal(snapshot.right.reason, 'small');
  assert.equal(snapshot.drive, 0);
  assert.equal(promptFor(snapshot).text, 'Come a little closer');
});

test('opening wider than the target adds speed', () => {
  const { monitor, clock } = setup();
  monitor.applyCheck({ best: 1, neutralSteer: 0.7 });
  const relaxed = score('woman_hands', 0);
  monitor.setStrictness('right', relaxed - 0.02);
  const nearTarget = feed(monitor, clock, 500, [handAt('woman_hands', 0.73, 0.5, { label: 'Right' })]);
  assert.equal(nearTarget.handOpen, true);
  const wide = feed(monitor, clock, 500, [rightHand(OPEN)]);
  assert.ok(wide.drive > nearTarget.drive, `${wide.drive} should beat ${nearTarget.drive}`);
  assert.ok(nearTarget.drive >= 0.8);
});

test('the hand check only counts time with the hand in view', () => {
  const { monitor, clock } = setup();
  const check = new HandCheck({ seconds: 1 });
  check.add(feed(monitor, clock, 500, []), 1);
  assert.equal(check.elapsed, 0, 'no hand does not count');
  check.add(feed(monitor, clock, 500, [leftHand(OPEN)]), 1);
  assert.equal(check.elapsed, 0, 'the other hand does not count');

  const inView = feed(monitor, clock, 500, [rightHand(OPEN)]);
  assert.equal(check.add(inView, 0.5), true);
  assert.equal(check.progress, 0.5);
  assert.equal(check.done, false);
  check.add(inView, 0.5);
  assert.equal(check.done, true);
});

test('the hand check ignores one lucky frame', () => {
  const check = new HandCheck();
  const snapshot = (openness) => ({
    overlap: false,
    side: 'right',
    steerInput: 2,
    right: { side: 'right', status: 'closed', reason: 'closed', openness },
  });
  for (let i = 0; i < 40; i++) check.add(snapshot(0.5), 0.05);
  check.add(snapshot(1), 0.05);
  const result = check.result();
  assert.equal(result.best, 0.5);
  assert.equal(result.neutralSteer, 2);
});

test('prompts name the hand, most basic problem first', () => {
  const { monitor, clock } = setup();
  assert.equal(promptFor(feed(monitor, clock, 400, [])).text, 'Show your right hand!');
  const fist = promptFor(feed(monitor, clock, 400, [rightHand(FIST)]));
  assert.equal(fist.text, 'Open your right hand!');
  assert.equal(fist.side, 'right');
  assert.equal(promptFor(feed(monitor, clock, 400, [rightHand(OPEN)])), null);

  const left = setup(undefined, 'left');
  assert.equal(promptFor(feed(left.monitor, left.clock, 400, [])).text, 'Show your left hand!');
  assert.equal(promptFor(feed(left.monitor, left.clock, 400, [leftHand(FIST)])).text, 'Open your left hand!');
});

test('only a hand the tracker names as the hand in play counts', () => {
  const { monitor, clock } = setup(undefined, 'right');
  const right = (x) => handAt(OPEN, x, 0.5, { label: 'Right' });
  const left = (x) => handAt(OPEN, x, 0.5, { label: 'Left' });

  let snapshot = feed(monitor, clock, 500, [right(0.73)]);
  assert.equal(snapshot.right.status, 'open');
  assert.equal(snapshot.handOpen, true);
  assert.ok(snapshot.drive > 0);

  // Wherever it is in the picture.
  snapshot = feed(monitor, clock, 500, [right(0.2)]);
  assert.equal(snapshot.handOpen, true, 'the right hand on the left of the picture');

  snapshot = feed(monitor, clock, 500, [left(0.73)]);
  assert.equal(snapshot.right.status, 'missing', 'a left hand is not the right hand');
  assert.equal(snapshot.drive, 0);
  assert.equal(promptFor(snapshot).text, 'Show your right hand!');
});

test('a hand alone the tracker can\'t be sure of goes by its side of the mirror', () => {
  const unsure = (x, label = 'Left') => handAt(OPEN, x, 0.5, { label, confidence: () => 0.55 });

  const onItsSide = setup(undefined, 'right');
  assert.ok(feed(onItsSide.monitor, onItsSide.clock, 500, [unsure(0.73)]).drive > 0, 'unsure, on the right of the mirror');

  const onTheOther = setup(undefined, 'right');
  assert.equal(feed(onTheOther.monitor, onTheOther.clock, 500, [unsure(0.27)]).drive, 0, 'unsure, on the left of the mirror');

  const noName = setup(undefined, 'right');
  assert.ok(feed(noName.monitor, noName.clock, 500, [handAt(OPEN, 0.73)]).drive > 0, 'no label at all');

  const leftChosen = setup(undefined, 'left');
  assert.ok(feed(leftChosen.monitor, leftChosen.clock, 500, [unsure(0.27)]).drive > 0, 'the same for the left hand');
});

test('going by the mirror still needs the hand to be open', () => {
  const { monitor, clock } = setup(undefined, 'right');
  const fist = handAt(FIST, 0.73, 0.5, { label: 'Left', confidence: () => 0.55 });
  const snapshot = feed(monitor, clock, 500, [fist]);
  assert.equal(snapshot.right.status, 'closed');
  assert.equal(snapshot.drive, 0);
});

test('a hand the tracker is sure is the other one does not count, and that gets noticed', () => {
  const { monitor, clock } = setup(undefined, 'right');
  const snapshot = feed(monitor, clock, 500, [handAt(OPEN, 0.73, 0.5, { label: 'Left' })]);
  assert.equal(snapshot.right.status, 'missing');
  assert.equal(snapshot.drive, 0);
  assert.equal(snapshot.otherHandSeen, true);
  assert.equal(feed(monitor, clock, 500, []).otherHandSeen, false, 'no hand at all is different');
  assert.equal(feed(monitor, clock, 500, [handAt(OPEN, 0.73, 0.5, { label: 'Right' })]).otherHandSeen, false);
});

test('of two hands, labels that disagree win, even with arms crossed', () => {
  const { monitor, clock } = setup(undefined, 'right');
  const crossed = [
    handAt(OPEN, 0.27, 0.5, { label: 'Right' }),
    handAt(FIST, 0.73, 0.5, { label: 'Left' }),
  ];
  assert.equal(feed(monitor, clock, 500, crossed).right.status, 'open', 'the open hand is the right hand');

  const swapped = [
    handAt(FIST, 0.27, 0.5, { label: 'Right' }),
    handAt(OPEN, 0.73, 0.5, { label: 'Left' }),
  ];
  assert.equal(feed(monitor, clock, 500, swapped).right.status, 'closed', 'the fist is the right hand');
});

test('of two hands the tracker gives the same name, position decides', () => {
  const { monitor, clock } = setup(undefined, 'right');
  const same = [
    handAt(FIST, 0.27, 0.5, { label: 'Right' }),
    handAt(OPEN, 0.73, 0.5, { label: 'Right' }),
  ];
  assert.equal(feed(monitor, clock, 500, same).right.status, 'open');
});

test('the resting hand can do anything, but still can\'t hold the other one open', () => {
  const { monitor, clock } = setup(undefined, 'right');
  const hand = (name, x, label) => handAt(name, x, 0.5, { label });

  for (const pose of ['fist', OPEN, 'victory']) {
    const snapshot = feed(monitor, clock, 500, [hand(pose, 0.27, 'Left'), hand(OPEN, 0.73, 'Right')]);
    assert.equal(snapshot.handOpen, true, `left hand showing ${pose}`);
  }

  const touching = feed(monitor, clock, 500, [hand(OPEN, 0.44, 'Left'), hand(OPEN, 0.56, 'Right')]);
  assert.equal(touching.overlap, true);
  assert.equal(touching.drive, 0);
  assert.equal(promptFor(touching).key, 'apart');
});

test('the other hand is watched on its own, and never changes the hand in play', () => {
  const { monitor, clock } = setup(undefined, 'right');
  const both = (left, right) => [handAt(left, 0.27, 0.5, { label: 'Left' }), handAt(right, 0.73, 0.5, { label: 'Right' })];

  let snapshot = feed(monitor, clock, 500, both(OPEN, OPEN));
  assert.equal(snapshot.other.side, 'left');
  assert.equal(snapshot.other.status, 'open');
  assert.equal(snapshot.left.status, 'missing', 'the left and right views still only show the hand in play');
  assert.equal(snapshot.handOpen, true);

  snapshot = feed(monitor, clock, 500, both(FIST, OPEN));
  assert.equal(snapshot.other.status, 'closed');
  assert.equal(snapshot.other.reason, 'closed');
  assert.equal(snapshot.handOpen, true, 'a fist in the other hand doesn\'t stop the car');

  snapshot = feed(monitor, clock, 500, both(OPEN, FIST));
  assert.equal(snapshot.other.status, 'open');
  assert.equal(snapshot.handOpen, false, 'an open other hand can\'t drive for the hand in play');
});

test('the other hand fails closed: alone, gone, touching or switched', () => {
  const { monitor, clock } = setup(undefined, 'right');
  assert.equal(feed(monitor, clock, 500, [rightHand(OPEN)]).other.status, 'missing', 'only the hand in play is there');
  assert.equal(feed(monitor, clock, 500, [leftHand(OPEN)]).other.status, 'open', 'the other hand alone is still seen');
  assert.equal(feed(monitor, clock, 1500, []).other.status, 'missing');

  const touching = feed(monitor, clock, 500, [handAt(OPEN, 0.44, 0.5, { label: 'Left' }), handAt(OPEN, 0.56, 0.5, { label: 'Right' })]);
  assert.equal(touching.other.status, 'closed');
  assert.equal(touching.other.reason, 'overlap');

  feed(monitor, clock, 500, [leftHand(OPEN), rightHand(OPEN)]);
  monitor.setSide('left');
  assert.equal(monitor.snapshot.other.side, 'right');
  assert.equal(monitor.snapshot.other.status, 'missing', 'changing hands starts the other hand afresh');
  monitor.forgetHands();
  assert.equal(monitor.snapshot.other.status, 'missing');
});

test('the hand steers by moving side to side, from wherever it started', () => {
  assert.equal(steerFromReach(0.01), 0, 'small movements are ignored');
  assert.equal(steerFromReach(0.2), 1);
  assert.equal(steerFromReach(-0.2), -1);

  const { monitor, clock } = setup(undefined, 'right');
  const at = (x) => [handAt(OPEN, x, 0.5, { label: 'Right' })];
  assert.equal(feed(monitor, clock, 400, at(0.7)).steer, 0, 'where it starts is straight on');
  assert.equal(feed(monitor, clock, 500, at(0.8)).steer > 0.5, true, 'towards the right of the picture');
  assert.equal(feed(monitor, clock, 500, at(0.6)).steer < -0.5, true, 'towards the left of the picture');
  assert.equal(feed(monitor, clock, 800, at(0.7)).steer, 0);
});

test('an affected arm resting off to one side still means straight on after the hand check', () => {
  const { monitor, clock } = setup(undefined, 'right');
  const check = new HandCheck({ seconds: 0.3 });
  const resting = [handAt(OPEN, 0.9, 0.5, { label: 'Right' })];
  while (!check.done) check.add(feed(monitor, clock, 33, resting), 0.033);
  monitor.applyCheck(check.result());
  assert.equal(feed(monitor, clock, 200, resting).steer, 0);
});

test('steering lets go when the hand disappears', () => {
  const { monitor, clock } = setup(undefined, 'right');
  const at = (x) => [handAt(OPEN, x, 0.5, { label: 'Right' })];
  feed(monitor, clock, 400, at(0.7));
  assert.ok(feed(monitor, clock, 500, at(0.85)).steer > 0.5);
  const snapshot = feed(monitor, clock, 1500, []);
  assert.equal(snapshot.steer, 0);
  assert.equal(snapshot.steerInput, null);
});

test('the hand check sets only the hand in play', () => {
  const { monitor, clock } = setup(undefined, 'right');
  const check = new HandCheck({ seconds: 0.3 });
  const right = handAt('woman_hands', 0.73, 0.5, { label: 'Right' });
  while (!check.done) check.add(feed(monitor, clock, 33, [right]), 0.033);
  const result = check.result();
  assert.ok(result.best > OPEN_RULES.floor);
  monitor.applyCheck(result);
  assert.equal(monitor.right.checked, true);
  assert.equal(monitor.left.checked, false);
  assert.equal(monitor.left.best, OPEN_RULES.defaultBest);
});

test('changing hands starts steering afresh', () => {
  const { monitor, clock } = setup(undefined, 'right');
  feed(monitor, clock, 400, [handAt(OPEN, 0.7, 0.5, { label: 'Right' })]);
  feed(monitor, clock, 400, [handAt(OPEN, 0.85, 0.5, { label: 'Right' })]);
  monitor.setSide('left');
  assert.equal(monitor.snapshot.steer, 0);
  assert.equal(monitor.snapshot.side, 'left');
  assert.equal(feed(monitor, clock, 400, [handAt(OPEN, 0.3, 0.5, { label: 'Left' })]).steer, 0);
});

test('every line the game can say has a rendered voice file', () => {
  const lines = JSON.parse(readFileSync(new URL('../../core/audio/voice/lines.json', import.meta.url)));
  const known = new Set(lines.map(({ text }) => text));
  for (const { id, ka } of lines) assert.ok(ka, `${id} has no Georgian`);
  for (const { id } of lines) {
    assert.ok(existsSync(new URL(`../../core/audio/voice/en/${id}.ogg`, import.meta.url)), `English ${id}.ogg is missing`);
    assert.ok(existsSync(new URL(`../../core/audio/voice/ka/${id}.ogg`, import.meta.url)), `Georgian ${id}.ogg is missing`);
  }

  // Everything the hand rules can ask for, with either hand in play.
  const asked = new Set();
  for (const side of ['left', 'right']) {
    for (const reason of ['missing', 'edge', 'small', 'closed', null]) {
      const prompt = promptFor({ side, [side]: { reason }, overlap: false });
      if (prompt) asked.add(prompt.text);
    }
    asked.add(promptFor({ side, [side]: { reason: null }, overlap: true }).text);
    // And each hand shape a grown-up can choose for the open move: see core/shapes.js.
    for (const shape of [...Object.keys(SHAPES), 'fingers']) {
      asked.add(promptFor({ side, [side]: { reason: 'closed', shape }, overlap: false }).text);
    }
  }
  for (const { prompt } of Object.values(SHAPES)) if (prompt) asked.add(prompt);
  asked.add(FINGERS_PROMPT);
  asked.add(SHAPE_RESTING);

  // Everything the shared code and each game say directly.
  const files = ['core/session.js', 'core/sound.js', 'games/high-five-racers/main.js', 'games/balloon-pop/main.js'];
  const source = files.map((file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')).join('\n');
  for (const [, text] of source.matchAll(/(?:say\(|finishLine: |const (?:STEER_HINT|POP_HINT|MATHS_HINT|TOO_HOT|COOL_IT|COOLED|SO_CLOSE) = )'([^']+)'/g)) asked.add(text);
  for (const block of source.matchAll(/const (?:PRAISE|SPOKEN|OPEN_TO_POP) = [\[{]([\s\S]+?)\n?[\]}];/g)) {
    for (const [, text] of block[1].matchAll(/'([^']+)'/g)) asked.add(text);
  }
  for (const text of ['3', '2', '1', 'Go!', 'Lap 2!', 'Lap 3!', 'Last lap!']) asked.add(text);

  assert.ok(asked.size >= 20, `only found ${asked.size} lines`);
  assert.deepEqual([...asked].filter((text) => !known.has(text)), []);
  // Nothing rendered that the game can no longer say.
  assert.deepEqual([...known].filter((text) => !asked.has(text)), []);
});

test('the engine sounds like gears: idle, climbing revs, and drops at each shift', () => {
  assert.equal(engineRate(0), 0.62, 'idle');
  assert.deepEqual([gearAt(0.1), gearAt(0.5), gearAt(0.9), gearAt(1)], [0, 1, 2, 2]);

  // Revs climb within a gear...
  for (const [low, high] of [[0.05, 0.28], [0.34, 0.6], [0.65, 1]]) {
    assert.ok(engineRate(high) > engineRate(low), `${low} to ${high}`);
  }
  // ...and drop when it changes up.
  assert.ok(engineRate(0.31) < engineRate(0.29), 'first shift');
  assert.ok(engineRate(0.63) < engineRate(0.61), 'second shift');

  // Pitching a recording too far makes it sound artificial.
  for (let speed = 0; speed <= 1; speed += 0.01) {
    const rate = engineRate(speed);
    assert.ok(rate >= 0.6 && rate <= 1.71, `${rate} at ${speed}`);
  }
});

test('the numbers follow the hand in play', () => {
  const { monitor, clock } = setup();
  const stats = new PlayStats();
  const play = (ms, hands) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 33) {
      clock.now += 33;
      stats.update(monitor.update(hands, clock.now, FRAME_ASPECT), 0.033);
    }
  };
  play(1000, [rightHand(OPEN)]);
  play(1000, [rightHand(FIST)]);
  play(2000, [rightHand(OPEN)]);

  assert.equal(stats.right.openings, 2, 'the hand opened twice');
  assert.equal(stats.left.openings, 0);
  assert.ok(stats.right.openSeconds > 2.4 && stats.right.openSeconds < 3.1);
  assert.ok(stats.right.longestHold > 1.5 && stats.right.longestHold < 2.1);
  assert.ok(Math.abs(stats.handOpenSeconds - stats.right.openSeconds) < 0.1);
  assert.ok(Math.abs(stats.seconds - 4) < 0.1);
  assert.ok(stats.right.peak > 0.9);
});
