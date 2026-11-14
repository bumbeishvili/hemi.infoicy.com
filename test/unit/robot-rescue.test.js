// The rules of Robot Rescue. Its screen is tested in test/e2e/robot-rescue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import {
  AIM_HELP,
  Aim,
  BIG_SPOTS,
  BOING,
  BUBBLE_SECONDS,
  Blaster,
  KEY_SECONDS,
  LID_BONKS,
  NEWS,
  PALS,
  POWERS,
  POWER_EVERY,
  PRIZE_SECONDS,
  SLOW,
  lidIsUp,
  newsAt,
  powerOrder,
  DRAIN_SECONDS,
  FILLS_ITSELF_AFTER,
  FIRE_RATE,
  GOO_LEAST_SECONDS,
  HOP,
  LEVELS,
  Mission,
  levelPlan,
  lineUp,
  PACES,
  PLACES,
  REFILL_SECONDS,
  REST_AFTER_SECONDS,
  CHALLENGE_GOO_LEAST_SECONDS,
  challengePlan,
  readHand,
} from '../../games/robot-rescue/rescue.js';
import { RescueSound } from '../../games/robot-rescue/rescue-sound.js';
import { Debris, FloatingCage, carriedFriend, makeRobotView } from '../../games/robot-rescue/robots.js';
import { Stage } from '../../games/robot-rescue/stage.js';
import { WATER_LEVEL } from '../../games/robot-rescue/town.js';
import { byId } from '../../core/body/roster.js';
import { Sound } from '../../core/sound.js';
import * as THREE from '../../vendor/three/three.module.js';

const DT = 1 / 60;
const FOLDER = new URL('../../games/robot-rescue/', import.meta.url);
const VOICE = new URL('audio/voice/', FOLDER);
const LINES = JSON.parse(readFileSync(new URL('lines.json', VOICE)));

const logged = () => {
  const events = [];
  return { events, onEvent: (event) => events.push(event), types: () => events.map(({ type }) => type), count: (type) => events.filter((event) => event.type === type).length };
};

/** The same "random" numbers each time, so a failure can be repeated. */
function steady(seed = 7) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

const makeMission = (options = {}) => {
  const log = logged();
  // Gentle, the game as it always was, unless a test says otherwise: the challenge has its own tests.
  const mission = new Mission({ random: steady(), onEvent: log.onEvent, level: 'gentle', ...options });
  mission.start();
  return { mission, log };
};

/** Runs the game for a while, with a hand doing the same thing all the way through. */
function run(mission, seconds, { hand = 'open', aim = () => null } = {}) {
  for (let t = 0; t < seconds; t += DT) {
    if (['won', 'lost'].includes(mission.phase)) return;
    mission.update(DT, { hand, target: aim(mission) });
  }
}

/** Aims at whatever there is to aim at, as the crosshair would. */
const firstTarget = (mission) => mission.targets()[0] ?? null;

/** Gets a robot of this kind out where it can be aimed at. */
function outKind(mission, kind) {
  const robot = mission.robots.find((each) => each.kind === kind) ?? mission.spawn(kind);
  if (kind === 'peeker') {
    robot.rise = 1;
    robot.state = 'ready';
  }
  return robot;
}

/** Plays a whole rescue with a hand that fires, and closes to reload whenever it runs out. */
function playThrough(mission) {
  let closing = 0;
  for (let t = 0; t < 900 && !['won', 'lost'].includes(mission.phase); t += DT) {
    if (mission.blaster.empty) closing = REFILL_SECONDS + 0.1;
    closing -= DT;
    const hand = closing > 0 ? 'closed' : 'open';
    mission.update(DT, { hand, target: hand === 'open' ? firstTarget(mission) : null });
  }
}

/* ---------- the hand ---------- */

const hand = (status, reason, extra = {}) => ({ side: 'right', handOpen: false, overlap: false, right: { status, reason }, left: { status: 'missing', reason: 'missing' }, ...extra });

test('only a hand read as open fires, and only one read as closed raises the shield', () => {
  assert.equal(readHand(hand('open', null, { handOpen: true })), 'open');
  assert.equal(readHand(hand('closed', 'closed')), 'closed');
});

test('anything uncertain does neither: gone, at the edge, too far away, or overlapping', () => {
  assert.equal(readHand(hand('missing', 'missing')), 'none');
  for (const reason of ['edge', 'small', 'overlap']) assert.equal(readHand(hand('closed', reason)), 'unsure', reason);
  assert.equal(readHand(hand('closed', 'closed', { overlap: true })), 'unsure');
});

test('the hand in play is the one that counts', () => {
  const left = { side: 'left', handOpen: true, overlap: false, left: { status: 'open', reason: null }, right: { status: 'closed', reason: 'closed' } };
  assert.equal(readHand(left), 'open');
  const closedLeft = { side: 'left', handOpen: false, overlap: false, left: { status: 'closed', reason: 'closed' }, right: { status: 'open', reason: null } };
  assert.equal(readHand(closedLeft), 'closed');
});

/* ---------- the blaster ---------- */

test('firing all the time empties the blaster in about three or four seconds', () => {
  const blaster = new Blaster();
  let seconds = 0;
  let shots = 0;
  let ranOut = 0;
  while (blaster.charge > 0 && seconds < 20) {
    const result = blaster.update(DT, { hand: 'open', aiming: true });
    shots += result.shots;
    if (result.ranOut) ranOut += 1;
    seconds += DT;
  }
  assert.ok(seconds >= 3 && seconds <= 4, `${seconds}`);
  assert.equal(Math.abs(seconds - DRAIN_SECONDS) < 0.05, true);
  assert.ok(Math.abs(shots - DRAIN_SECONDS * FIRE_RATE) <= 2, `${shots}`);
  assert.equal(ranOut, 1);
  assert.equal(blaster.update(DT, { hand: 'open', aiming: true }).shots, 0);
});

test('with nothing in the crosshair it doesn\'t fire, and doesn\'t lose any charge', () => {
  const blaster = new Blaster();
  for (let i = 0; i < 120; i += 1) assert.equal(blaster.update(DT, { hand: 'open', aiming: false }).shots, 0);
  assert.equal(blaster.charge, 1);
  assert.equal(blaster.firing, false);
});

test('only an open hand fires, whatever is in the crosshair', () => {
  for (const state of ['closed', 'none', 'unsure']) {
    const blaster = new Blaster();
    blaster.charge = 0.5;
    for (let i = 0; i < 120; i += 1) assert.equal(blaster.update(DT, { hand: state, aiming: true }).shots, 0, state);
    assert.equal(blaster.firing, false, state);
  }
});

test('a closed hand fills it well inside a second, and says so', () => {
  const blaster = new Blaster();
  blaster.charge = 0;
  let filled = 0;
  let seconds = 0;
  while (blaster.charge < 1 && seconds < 3) {
    if (blaster.update(DT, { hand: 'closed', aiming: false }).filled) filled += 1;
    seconds += DT;
  }
  assert.ok(seconds < 0.8, `${seconds}`);
  assert.equal(filled, 1);
  // A hand that closes with it nearly full doesn't count as reloading.
  blaster.charge = 0.97;
  blaster.lowest = 0.97;
  assert.equal(blaster.update(0.2, { hand: 'closed', aiming: false }).filled, false);
});

test('a hand out of view or uncertain doesn\'t reload', () => {
  for (const state of ['none', 'unsure', 'open']) {
    const blaster = new Blaster();
    blaster.charge = 0.4;
    blaster.update(1, { hand: state, aiming: false });
    assert.equal(blaster.charge, 0.4, state);
  }
});

test('with reloading off, it never runs out', () => {
  const blaster = new Blaster({ reloading: false });
  let shots = 0;
  for (let i = 0; i < 60 * 30; i += 1) shots += blaster.update(DT, { hand: 'open', aiming: true }).shots;
  assert.equal(blaster.charge, 1);
  assert.ok(shots > 100);
});

test('a child who can\'t close yet isn\'t stuck: after a while it fills up by itself', () => {
  const blaster = new Blaster();
  blaster.charge = 0;
  blaster.update(FILLS_ITSELF_AFTER - 1, { hand: 'open', aiming: true });
  assert.equal(blaster.charge, 0);
  assert.equal(blaster.empty, true);
  for (let t = 0; t < 1.2; t += DT) blaster.update(DT, { hand: 'open', aiming: true });
  assert.equal(blaster.fillingItself, true);
  // It doesn't dribble out while it's filling, as that would look broken.
  const during = blaster.update(DT, { hand: 'open', aiming: true });
  assert.equal(during.shots, 0);
  for (let t = 0; t < 4; t += DT) blaster.update(DT, { hand: 'open', aiming: false });
  assert.equal(blaster.charge, 1);
  assert.equal(blaster.fillingItself, false);
});

/* ---------- aiming ---------- */

const HEIGHT = 720;
const robotAt = (x, y, size = 40) => ({ ref: { x, y }, x, y, size });

test('the crosshair is pulled onto what\'s near it', () => {
  const aim = new Aim();
  const target = robotAt(500, 300);
  let locked = null;
  for (let i = 0; i < 90; i += 1) locked = aim.update(DT, 560, 340, [target], AIM_HELP.little, HEIGHT);
  assert.equal(locked, target.ref);
  assert.ok(Math.hypot(aim.x - 500, aim.y - 300) < 10);
});

test('more reach help reaches further', () => {
  const lockedFrom = (distance, help) => {
    const aim = new Aim();
    const target = robotAt(400, 300);
    let locked = null;
    for (let i = 0; i < 120; i += 1) locked = aim.update(DT, 400 + distance, 300, [target], help, HEIGHT);
    return locked === target.ref;
  };
  assert.equal(lockedFrom(170, AIM_HELP.none), false);
  assert.equal(lockedFrom(170, AIM_HELP.little), true);
  assert.equal(lockedFrom(280, AIM_HELP.little), false);
  assert.equal(lockedFrom(280, AIM_HELP.lots), true);
  // Even the least help gets a hand that's only nearly there the rest of the way.
  assert.equal(lockedFrom(70, AIM_HELP.none), true);
});

test('with nothing in reach it stays with the hand, and isn\'t on anything', () => {
  const aim = new Aim();
  let locked = 'something';
  for (let i = 0; i < 90; i += 1) locked = aim.update(DT, 900, 600, [robotAt(100, 100)], AIM_HELP.little, HEIGHT);
  assert.equal(locked, null);
  assert.ok(Math.hypot(aim.x - 900, aim.y - 600) < 5);
});

test('it goes for the nearest, and doesn\'t flip back and forth between two', () => {
  const aim = new Aim();
  const near = robotAt(520, 300);
  const far = robotAt(700, 300);
  for (let i = 0; i < 60; i += 1) aim.update(DT, 560, 300, [near, far], AIM_HELP.lots, HEIGHT);
  assert.equal(aim.locked, near.ref);
  // The hand drifts to just past half way: it stays with the one it has.
  for (let i = 0; i < 60; i += 1) aim.update(DT, 615, 300, [near, far], AIM_HELP.lots, HEIGHT);
  assert.equal(aim.locked, near.ref);
  // Now clearly nearer the other.
  for (let i = 0; i < 90; i += 1) aim.update(DT, 690, 300, [near, far], AIM_HELP.lots, HEIGHT);
  assert.equal(aim.locked, far.ref);
});

test('a target that\'s gone isn\'t aimed at any more', () => {
  const aim = new Aim();
  const target = robotAt(500, 300);
  for (let i = 0; i < 60; i += 1) aim.update(DT, 500, 300, [target], AIM_HELP.lots, HEIGHT);
  assert.equal(aim.locked, target.ref);
  assert.equal(aim.update(DT, 500, 300, [], AIM_HELP.lots, HEIGHT), null);
});

test('a wobbling hand moves the crosshair much less than the hand moves', () => {
  const aim = new Aim();
  let furthest = 0;
  for (let i = 0; i < 240; i += 1) {
    aim.update(DT, 400 + Math.sin(i * 1.3) * 12, 300 + Math.cos(i * 1.7) * 12, [], AIM_HELP.little, HEIGHT);
    if (i > 60) furthest = Math.max(furthest, Math.hypot(aim.x - 400, aim.y - 300));
  }
  assert.ok(furthest < 6, `${furthest}`);
});

test('a quick move of the hand isn\'t held back by the steadying', () => {
  const aim = new Aim();
  aim.update(DT, 100, 300, [], AIM_HELP.little, HEIGHT);
  let frames = 0;
  while (Math.abs(aim.x - 900) > 30 && frames < 120) {
    aim.update(DT, 900, 300, [], AIM_HELP.little, HEIGHT);
    frames += 1;
  }
  assert.ok(frames < 30, `${frames} frames`);
});

test('a hand that has gone isn\'t aiming at anything', () => {
  const aim = new Aim();
  const target = robotAt(500, 300);
  for (let i = 0; i < 60; i += 1) aim.update(DT, 500, 300, [target], AIM_HELP.lots, HEIGHT);
  aim.lose();
  assert.equal(aim.locked, null);
  assert.equal(aim.seen, false);
});

/* ---------- robots ---------- */

test('the robots are there from the very start, and nobody waits for them', () => {
  for (const pace of Object.keys(PACES)) {
    const { mission } = makeMission({ pace });
    assert.equal(mission.phase, 'fighting');
    assert.ok(mission.robots.length >= 3, pace);
    assert.ok(mission.targets().length >= 1, pace);
  }
});

test('an open hand on a robot fires and drops it', () => {
  const { mission, log } = makeMission();
  const walker = outKind(mission, 'walker');
  const count = mission.stats.robots;
  run(mission, 2, { aim: () => (mission.robots.includes(walker) ? walker : null) });
  assert.ok(log.count('shot') >= walker.maxHp);
  assert.ok(log.count('robot-hit') >= walker.maxHp - 1);
  assert.ok(!mission.robots.includes(walker));
  assert.equal(mission.stats.robots, count + 1);
  assert.ok(log.events.some(({ type, robot }) => type === 'robot-dropped' && robot === walker));
});

test('a closed hand doesn\'t fire, and raises the shield', () => {
  const { mission, log } = makeMission();
  const walker = outKind(mission, 'walker');
  run(mission, 2, { hand: 'closed', aim: () => walker });
  assert.equal(log.count('shot'), 0);
  assert.equal(mission.shield, true);
  assert.equal(walker.hp, walker.maxHp);
});

test('a closed hand refills the blaster in the middle of a fight', () => {
  const { mission, log } = makeMission();
  run(mission, DRAIN_SECONDS + 0.5, { aim: firstTarget });
  assert.ok(log.count('empty') === 1);
  assert.equal(mission.blaster.empty, true);
  run(mission, REFILL_SECONDS + 0.1, { hand: 'closed' });
  assert.equal(mission.blaster.charge, 1);
  assert.equal(log.count('reloaded'), 1);
});

test('a hand out of view does neither', () => {
  for (const state of ['none', 'unsure']) {
    const { mission, log } = makeMission();
    mission.blaster.charge = 0.5;
    const walker = outKind(mission, 'walker');
    run(mission, 1.5, { hand: state, aim: () => walker });
    assert.equal(log.count('shot'), 0, state);
    assert.equal(mission.shield, false, state);
    assert.equal(mission.blaster.charge, 0.5, state);
  }
});

test('peekers can only be aimed at when they\'ve popped up', () => {
  const { mission } = makeMission();
  const peeker = outKind(mission, 'peeker');
  assert.ok(mission.targets().includes(peeker));
  peeker.rise = 0;
  peeker.state = 'hidden';
  assert.ok(!mission.targets().includes(peeker));
});

test('peekers keep popping up, somewhere each time', () => {
  const { mission, log } = makeMission();
  const before = log.count('peek');
  run(mission, 30, { hand: 'open' });
  assert.ok(log.count('peek') > before + 2);
});

test('walkers don\'t stand about for long, and stay where they can be seen', () => {
  const { mission } = makeMission();
  const walker = outKind(mission, 'walker');
  const visited = new Set();
  for (let t = 0; t < 40; t += DT) {
    mission.update(DT, { hand: 'open', target: null });
    if (walker.state === 'ready') visited.add(walker.post);
  }
  assert.ok(visited.size >= 2);
});

test('every place keeps its robots where they can be seen from the tram', () => {
  // The view is about 0.9 of a distance wide to each side, and robots shouldn't be right at its edge.
  const inView = (x, z, name) => assert.ok(Math.abs(x) <= z * 0.8, `${name} at ${x}, ${z}`);
  for (const { id, posts, covers, air, cage, big } of PLACES) {
    for (const [x, z] of posts) inView(x, z, `${id} post`);
    for (const [x, z] of covers) inView(x, z, `${id} cover`);
    for (const [x, , z] of air) inView(x, z, `${id} air`);
    inView(cage[0], cage[1], `${id} cage`);
    if (big) inView(big[0], big[1], `${id} big`);
    assert.ok(posts.length >= 5 && covers.length >= 4 && air.length >= 3, id);
  }
});

test('nobody stands inside anything: not a cover, not a cage, and not the big one', () => {
  const clear = (a, b, gap, name) => assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) >= gap, `${name}: ${a} and ${b}`);
  for (const { id, posts, covers, cage, big } of PLACES) {
    for (const post of posts) {
      for (const cover of covers) clear(post, cover, 1.4, `${id} post and cover`);
      clear(post, cage, 2.6, `${id} post and cage`);
      if (big) clear(post, big, 5, `${id} post and big one`);
    }
    for (const cover of covers) clear(cover, cage, 2.6, `${id} cover and cage`);
    for (const [i, cover] of covers.entries()) {
      for (const other of covers.slice(i + 1)) clear(cover, other, 2, `${id} covers`);
    }
  }
});

/* ---------- goo ---------- */

/** Throws one goo at the tram, as a robot would. */
function throwOne(mission) {
  const robot = outKind(mission, 'walker');
  robot.state = 'ready';
  robot.throwing = 0;
  mission.throwGoo(robot);
  return mission.goo.at(-1);
}

test('the shield stops goo, and it costs nothing', () => {
  const { mission, log } = makeMission();
  mission.holdThrows = 999;
  const goo = throwOne(mission);
  const hearts = mission.hearts;
  run(mission, goo.seconds + 0.1, { hand: 'closed' });
  assert.equal(mission.hearts, hearts);
  assert.equal(log.count('goo-blocked'), 1);
  assert.equal(log.count('goo-hit'), 0);
  assert.equal(mission.stats.gooBlocked, 1);
});

test('without the shield, goo costs a heart', () => {
  const { mission, log } = makeMission();
  mission.holdThrows = 999;
  const goo = throwOne(mission);
  const hearts = mission.hearts;
  run(mission, goo.seconds + 0.1, { hand: 'open' });
  assert.equal(mission.hearts, hearts - 1);
  assert.equal(log.count('goo-hit'), 1);
  assert.equal(log.count('goo-blocked'), 0);
});

test('a hand that can\'t be read doesn\'t count as a shield', () => {
  const { mission, log } = makeMission();
  mission.holdThrows = 999;
  const goo = throwOne(mission);
  // Just short of counting as a rest, since a rest would take the goo away.
  mission.restFor = 0;
  run(mission, goo.seconds + 0.1, { hand: 'unsure' });
  assert.equal(log.count('goo-hit'), 1);
});

test('goo can be shot out of the air', () => {
  const { mission, log } = makeMission();
  mission.holdThrows = 999;
  const goo = throwOne(mission);
  assert.ok(mission.targets().includes(goo));
  const hearts = mission.hearts;
  run(mission, 0.5, { aim: () => (mission.goo.includes(goo) ? goo : null) });
  assert.ok(!mission.goo.includes(goo));
  assert.equal(log.count('goo-shot'), 1);
  assert.equal(mission.stats.gooShot, 1);
  run(mission, goo.seconds, { hand: 'open' });
  assert.equal(mission.hearts, hearts);
});

test('goo is slow enough to see coming, even on the hardest setting', () => {
  for (const level of Object.keys(LEVELS)) {
    const { mission } = makeMission({ level });
    assert.ok(throwOne(mission).seconds >= 2, level);
  }
});

test('at the first stop, nothing\'s thrown until a robot has been dropped', () => {
  const { mission, log } = makeMission({ level: 'tough' });
  run(mission, 10, { hand: 'open' });
  assert.equal(log.count('goo'), 0);
  const walker = outKind(mission, 'walker');
  run(mission, 1.5, { aim: () => (mission.robots.includes(walker) ? walker : null) });
  run(mission, 8, { hand: 'open' });
  assert.ok(log.count('goo') > 0);
});

test('robots wind up where they can be seen before they throw', () => {
  const { mission, log } = makeMission();
  mission.holdThrows = 0;
  mission.throwIn = 0;
  run(mission, 20, { hand: 'open' });
  const types = log.types();
  assert.ok(types.indexOf('windup') >= 0 && types.indexOf('windup') < types.indexOf('goo'));
});

test('there\'s never more goo in the air than the difficulty allows', () => {
  for (const [name, level] of Object.entries(LEVELS)) {
    const { mission } = makeMission({ level: name });
    mission.holdThrows = 0;
    for (let t = 0; t < 60; t += DT) {
      mission.update(DT, { hand: 'open', target: null });
      assert.ok(mission.goo.length <= level.gooInAir, name);
    }
  }
});

test('on Gentle a child can\'t lose: hearts stop at one', () => {
  const { mission, log } = makeMission({ level: 'gentle' });
  mission.holdThrows = 0;
  let lowest = mission.hearts;
  for (let i = 0; i < 12; i += 1) {
    const goo = throwOne(mission);
    run(mission, goo.seconds + 0.1, { hand: 'open' });
    lowest = Math.min(lowest, mission.hearts);
  }
  assert.equal(lowest, 1);
  assert.equal(mission.hearts, 1);
  assert.notEqual(mission.phase, 'lost');
  assert.equal(log.count('lost'), 0);
});

test('on the harder settings, running out of hearts ends the game', () => {
  for (const level of ['medium', 'tough']) {
    const { mission, log } = makeMission({ level });
    mission.holdThrows = 999;
    for (let i = 0; i < LEVELS[level].hearts && mission.hearts > 0; i += 1) {
      const goo = throwOne(mission);
      run(mission, goo.seconds + 0.1, { hand: 'open' });
    }
    assert.equal(mission.hearts, 0, level);
    run(mission, 2, { hand: 'open' });
    assert.equal(mission.phase, 'lost', level);
    assert.equal(log.count('lost'), 1, level);
  }
});

test('freeing a friend gives a heart back, up to as many as there were', () => {
  const { mission } = makeMission();
  mission.hearts = 1;
  mission.queue = [];
  mission.robots = [];
  mission.update(DT, { hand: 'open' });
  assert.equal(mission.hearts, 2);
  const again = makeMission().mission;
  again.queue = [];
  again.robots = [];
  again.update(DT, { hand: 'open' });
  assert.equal(again.hearts, LEVELS.gentle.hearts);
});

/* ---------- resting ---------- */

test('a hand gone for a few seconds means resting: no throwing, and nothing bad happens', () => {
  for (const state of ['none', 'closed', 'unsure']) {
    const { mission, log } = makeMission({ level: 'tough' });
    mission.holdThrows = 0;
    mission.throwIn = 0;
    run(mission, REST_AFTER_SECONDS + 0.1, { hand: state });
    assert.equal(mission.resting, true, state);
    assert.equal(log.count('rest'), 1, state);
    const hearts = mission.hearts;
    const thrown = log.count('goo');
    run(mission, 60, { hand: state });
    assert.equal(log.count('goo'), thrown, state);
    assert.equal(mission.hearts, hearts, state);
    assert.equal(mission.goo.length, 0, state);
    assert.notEqual(mission.phase, 'lost', state);
  }
});

test('goo already in the air goes when a rest starts', () => {
  const { mission, log } = makeMission();
  mission.holdThrows = 999;
  run(mission, REST_AFTER_SECONDS - 0.5, { hand: 'none' });
  throwOne(mission);
  const hearts = mission.hearts;
  run(mission, 1, { hand: 'none' });
  assert.equal(mission.goo.length, 0);
  assert.equal(log.count('goo-gone'), 1);
  assert.equal(mission.hearts, hearts);
});

test('walkers stop and stay put while the child rests, and peekers stay up to wave', () => {
  const { mission } = makeMission();
  const walker = outKind(mission, 'walker');
  const peeker = outKind(mission, 'peeker');
  run(mission, REST_AFTER_SECONDS + 0.1, { hand: 'none' });
  const at = [walker.x, walker.z];
  peeker.state = 'ready';
  peeker.rise = 1;
  run(mission, 20, { hand: 'none' });
  assert.deepEqual([walker.x, walker.z], at);
  assert.equal(peeker.state, 'ready');
});

test('opening the hand ends a rest straight away, with a moment before anything is thrown', () => {
  const { mission, log } = makeMission();
  run(mission, REST_AFTER_SECONDS + 1, { hand: 'none' });
  mission.holdThrows = 0;
  mission.throwIn = 0;
  mission.update(DT, { hand: 'open' });
  assert.equal(mission.resting, false);
  assert.equal(log.count('rest-over'), 1);
  assert.ok(mission.throwIn > 1);
});

/* ---------- the story ---------- */

test('dealing with every robot here frees the friend, and the tram moves on', () => {
  const { mission, log } = makeMission();
  assert.equal(mission.place.who, 'truffle');
  run(mission, 120, { aim: firstTarget, hand: 'open' });
  assert.ok(log.count('freed') >= 1);
  const freed = log.events.find(({ type }) => type === 'freed');
  assert.equal(freed.place.who, 'truffle');
  assert.equal(mission.freed >= 1, true);
  assert.ok(log.types().indexOf('moving') > log.types().indexOf('freed'));
});

test('the moves between stops take two to three seconds, and the next robots are already there', () => {
  for (const [pace, { moveSeconds }] of Object.entries(PACES)) {
    assert.ok(moveSeconds >= 2 && moveSeconds <= 3, pace);
    const { mission, log } = makeMission({ pace });
    mission.queue = [];
    for (const robot of [...mission.robots]) mission.drop(robot);
    let seconds = 0;
    while (mission.phase !== 'moving' && seconds < 5) {
      mission.update(DT, { hand: 'open' });
      seconds += DT;
    }
    assert.ok(seconds < 1.5, `${pace}: ${seconds}`);
    assert.equal(mission.phase, 'moving', pace);
    assert.ok(mission.robots.length >= 3, pace);
    let moving = 0;
    while (mission.phase === 'moving' && moving < 5) {
      mission.update(DT, { hand: 'open' });
      moving += DT;
    }
    assert.ok(Math.abs(moving - moveSeconds) < 0.1, `${pace}: ${moving}`);
    assert.equal(log.count('arrived'), 2, pace);
    assert.equal(mission.phase, 'fighting', pace);
  }
});

test('in the short rescue the tram has further to go, and still takes no more than three seconds', () => {
  for (const pace of Object.keys(PACES)) {
    const { mission } = makeMission({ pace, stops: 3 });
    mission.queue = [];
    for (const robot of [...mission.robots]) mission.drop(robot);
    while (mission.phase !== 'moving') mission.update(DT, { hand: 'open' });
    assert.ok(mission.moveSeconds >= 2 && mission.moveSeconds <= 3, pace);
  }
});

test('nothing is thrown while the tram is moving', () => {
  const { mission, log } = makeMission({ level: 'tough' });
  mission.queue = [];
  for (const robot of [...mission.robots]) mission.drop(robot);
  while (mission.phase !== 'moving') mission.update(DT, { hand: 'open' });
  const thrown = log.count('goo');
  while (mission.phase === 'moving') mission.update(DT, { hand: 'open' });
  assert.equal(log.count('goo'), thrown);
});

test('the whole rescue can be finished, and everyone gets freed in turn', () => {
  const { mission, log } = makeMission();
  playThrough(mission);
  assert.equal(mission.phase, 'won');
  assert.equal(log.count('won'), 1);
  assert.deepEqual(log.events.filter(({ type }) => type === 'freed').map(({ place }) => place.who), PLACES.map(({ who }) => who));
  assert.equal(mission.stats.friends, PLACES.length);
  // Any helpers still to come when the big one goes down don't need to be dealt with.
  const total = PLACES.reduce((sum, { robots }) => sum + robots.length, 0);
  const atTheEnd = PLACES.at(-1).robots.length;
  assert.ok(mission.stats.robots <= total && mission.stats.robots > total - atTheEnd, `${mission.stats.robots}`);
});

test('the short rescue has three stops, and still ends with Giraffe', () => {
  const { mission, log } = makeMission({ stops: 3 });
  assert.equal(mission.stops.length, 3);
  assert.equal(mission.stops.at(-1).who, 'giraffe');
  playThrough(mission);
  assert.equal(mission.phase, 'won');
  assert.equal(log.events.filter(({ type }) => type === 'freed').at(-1).place.who, 'giraffe');
});

test('Giraffe comes last, and each stop has someone different in it', () => {
  assert.equal(PLACES.at(-1).who, 'giraffe');
  assert.equal(new Set(PLACES.map(({ who }) => who)).size, PLACES.length);
  assert.ok(PLACES.at(-1).robots.includes('big'));
  assert.ok(!PLACES.slice(0, -1).some(({ robots }) => robots.includes('big')));
});

test('every kind of robot turns up along the way', () => {
  const kinds = new Set(PLACES.flatMap(({ robots }) => robots));
  assert.deepEqual([...kinds].sort(), ['big', 'drone', 'peeker', 'walker']);
});

/* ---------- the big one ---------- */

function atTheBigOne(options = {}) {
  const { mission, log } = makeMission(options);
  while (mission.place.id !== 'tower') {
    mission.queue = [];
    for (const robot of [...mission.robots]) mission.drop(robot);
    while (mission.phase !== 'fighting' || mission.leftHere === 0) mission.update(DT, { hand: 'open' });
  }
  return { mission, log, big: mission.robots.find(({ kind }) => kind === 'big') };
}

test('the big one can\'t be hit, except in a weak spot that has opened', () => {
  const { mission, big } = atTheBigOne();
  assert.ok(big);
  assert.ok(!mission.targets().includes(big));
  assert.equal(big.spots.length, LEVELS.gentle.bigSpots);
  assert.ok(big.spots.every(({ open }) => !open));
  run(mission, 1, { hand: 'open' });
  const open = big.spots.filter((spot) => spot.open);
  assert.equal(open.length, 1);
  assert.ok(mission.targets().includes(open[0]));
});

test('its weak spots open up one at a time, with hardly a wait', () => {
  const { mission, big, log } = atTheBigOne();
  for (const [index, spot] of big.spots.entries()) {
    run(mission, 1, { hand: 'open' });
    assert.equal(spot.open, true, `spot ${index}`);
    assert.equal(big.spots.filter(({ open }) => open).length, 1);
    run(mission, 4, { aim: () => (spot.open ? spot : null) });
    assert.equal(spot.done, true, `spot ${index}`);
    mission.blaster.charge = 1;
  }
  assert.equal(log.count('spot-done'), big.spots.length);
});

test('when the big one goes, its helpers all go with it, and Giraffe is freed', () => {
  const { mission, big, log } = atTheBigOne();
  run(mission, 1, { hand: 'open' });
  assert.ok(mission.robots.length > 1);
  for (const spot of big.spots) {
    run(mission, 1, { hand: 'open' });
    run(mission, 4, { aim: () => (spot.open ? spot : null) });
    mission.blaster.charge = 1;
  }
  assert.ok(!mission.robots.length);
  assert.equal(mission.queue.length, 0);
  assert.ok(log.events.some(({ type, robot }) => type === 'robot-dropped' && robot === big));
  assert.ok(log.events.some(({ type, place }) => type === 'freed' && place.who === 'giraffe'));
  run(mission, 5, { hand: 'open' });
  assert.equal(mission.phase, 'won');
});

test('harder settings have more weak spots', () => {
  assert.ok(LEVELS.gentle.bigSpots < LEVELS.medium.bigSpots);
  assert.ok(LEVELS.medium.bigSpots <= LEVELS.tough.bigSpots);
  assert.ok(LEVELS.tough.bigSpots <= BIG_SPOTS.length);
});

/* ---------- settings ---------- */

test('settings saved by an older version don\'t break anything', () => {
  const { mission } = makeMission({ pace: 'warp', level: 'impossible' });
  assert.equal(mission.pace, PACES.slow);
  assert.equal(mission.level, LEVELS.medium); // How it comes.
});

test('speed, difficulty and reloading can change in the middle of a game', () => {
  const { mission } = makeMission();
  mission.blaster.charge = 0.3;
  mission.configure({ pace: 'fast', level: 'tough', reloading: false });
  assert.equal(mission.pace, PACES.fast);
  assert.equal(mission.level, LEVELS.tough);
  assert.equal(mission.blaster.charge, 1);
  assert.equal(mission.blaster.reloading, false);
  assert.ok(mission.hearts <= LEVELS.tough.hearts);
});

test('faster has more robots out at once, and harder throws more often', () => {
  assert.ok(PACES.slow.atOnce < PACES.medium.atOnce && PACES.medium.atOnce < PACES.fast.atOnce);
  assert.ok(LEVELS.gentle.throwEvery > LEVELS.medium.throwEvery && LEVELS.medium.throwEvery > LEVELS.tough.throwEvery);
  assert.ok(LEVELS.gentle.gooSeconds > LEVELS.tough.gooSeconds);
  assert.equal(LEVELS.gentle.canLose, false);
});

test('the game counts what it says it counts', () => {
  const { mission } = makeMission();
  playThrough(mission);
  const { stats } = mission;
  assert.ok(stats.robots > 0 && stats.friends === PLACES.length && stats.shots >= stats.robots);
  assert.ok(stats.reloads > 0);
});

/* ---------- talking ---------- */

const MOST_WORDS = 10; // Children are here to move, and nobody's waiting for anyone to finish talking.

test('robot-rescue keeps its talking short, and everything it says has a voice in both languages', () => {
  assert.ok(LINES.length <= 14);
  for (const { id, text, ka } of LINES) {
    assert.ok(text.split(/\s+/).length <= MOST_WORDS, `too long: ${text}`);
    assert.ok(ka.split(/\s+/).length <= MOST_WORDS, `too long: ${ka}`);
    assert.match(ka, /[Ⴀ-ჿ]/, id);
    for (const language of ['en', 'ka']) assert.ok(existsSync(new URL(`${language}/${id}.ogg`, VOICE)), `${language}/${id}`);
  }
  const source = readFileSync(new URL('main.js', FOLDER), 'utf8');
  const rules = readFileSync(new URL('rescue.js', FOLDER), 'utf8');
  for (const { text } of LINES) assert.ok(source.includes(text) || rules.includes(text), `nothing says: ${text}`);
});

test('there are no voice files left over from lines that have gone', () => {
  const ids = new Set(LINES.map(({ id }) => id));
  for (const language of ['en', 'ka']) {
    for (const file of readdirSync(new URL(`${language}/`, VOICE))) assert.ok(ids.has(file.replace('.ogg', '')), `${language}/${file}`);
  }
});

test('each character speaks in their own voice, the same as everywhere else', () => {
  const shared = JSON.parse(readFileSync(new URL('../../core/body/voice/lines.json', import.meta.url)));
  const own = Object.fromEntries(shared.filter(({ id }) => id.startsWith('shout-')).map((line) => [line.id.replace('shout-', ''), line]));
  const speakers = LINES.filter(({ voice }) => voice);
  assert.ok(speakers.length >= PLACES.length);
  for (const { id, voice, kaVoice, kaPitch } of speakers) {
    const { voice: wanted, kaVoice: wantedKa, kaPitch: wantedPitch } = own[id.split('-')[0]];
    assert.deepEqual({ voice, kaVoice, kaPitch }, { voice: wanted, kaVoice: wantedKa, kaPitch: wantedPitch }, id);
  }
});

test('every friend has one thing to say when freed, and it\'s in the lines', () => {
  const texts = new Set(LINES.map(({ text }) => text));
  for (const { who, thanks } of PLACES) {
    assert.ok(texts.has(thanks), thanks);
    assert.ok(LINES.some(({ id, text }) => id.startsWith(`${who}-`) && text === thanks), who);
  }
});

/* ---------- the rules of the house ---------- */

const CODE = readdirSync(FOLDER).filter((file) => file.endsWith('.js'));

test('the game\'s sounds don\'t take over anything the shared sound code needs', () => {
  // A method here called unlock once replaced the one that starts the audio, and there was no sound.
  const own = Object.getOwnPropertyNames(RescueSound.prototype).filter((name) => name !== 'constructor');
  const shared = new Set([...Object.getOwnPropertyNames(Sound.prototype), ...Object.keys(new Sound())]);
  assert.deepEqual(own.filter((name) => shared.has(name)), ['finish']);
  // The same goes for what it keeps for itself, as the shared code has things of its own to keep.
  const kept = Object.keys(new RescueSound()).filter((name) => !Object.keys(new Sound()).includes(name));
  assert.deepEqual(kept.sort(), ['lastAt', 'lost']);
});

test('things that can happen a lot at once don\'t all make their sound', () => {
  const sound = new RescueSound();
  sound.context = { currentTime: 10 };
  const played = [];
  sound.play = (name) => played.push(name);
  for (let i = 0; i < 6; i += 1) sound.fallApart();
  assert.equal(played.length, 1);
  sound.context.currentTime = 10.5;
  sound.fallApart();
  assert.equal(played.length, 2);
  // When the big one comes down, its helpers don't add to it.
  played.length = 0;
  sound.bigFallsApart();
  for (let i = 0; i < 6; i += 1) sound.fallApart();
  assert.deepEqual(played, ['crash', 'boom']);
  played.length = 0;
  for (let i = 0; i < 6; i += 1) sound.popUp();
  assert.deepEqual(played, ['boing']);
});

test('nothing here makes its own sound: no browser speech, and no generated tones', () => {
  for (const file of CODE) {
    const source = readFileSync(new URL(file, FOLDER), 'utf8');
    for (const word of ['speechSynthesis', 'createOscillator', 'OscillatorNode', 'SpeechSynthesisUtterance']) {
      assert.ok(!source.includes(word), `${file}: ${word}`);
    }
  }
});

test('no game object has a method called then, which would make await hang for ever', () => {
  for (const file of CODE) {
    const source = readFileSync(new URL(file, FOLDER), 'utf8');
    assert.ok(!/^\s*(async\s+)?then\s*\(/m.test(source), file);
    assert.ok(!/\bthen\s*[:=]\s*(\(|function|async)/.test(source), file);
  }
});

test('the rules have no screen in them, so that they can run here', () => {
  const rules = readFileSync(new URL('rescue.js', FOLDER), 'utf8');
  assert.ok(!/\b(document|window|THREE)\b/.test(rules));
  // Only the shared levels, which have no screen in them either.
  const imports = rules.match(/^import .*$/gm) ?? [];
  assert.deepEqual(imports.map((line) => line.match(/from '([^']+)'/)[1]), ['../../core/levels.js']);
});

test('everything is on this computer', () => {
  for (const file of [...CODE, 'index.html', 'style.css']) {
    const source = readFileSync(new URL(file, FOLDER), 'utf8');
    // The page's security policy names Google's analytics, which counts visits: see core/analytics.js.
    assert.ok(!/https?:\/\/(?!www\.w3\.org|www\.googletagmanager\.com|\*\.google-analytics\.com|\*\.analytics\.google\.com|\*\.googletagmanager\.com)/.test(source), file);
  }
});

test('the page keeps the same security as the other games, with no styles written into it', () => {
  const page = readFileSync(new URL('index.html', FOLDER), 'utf8');
  const other = readFileSync(new URL('../lighthouse/index.html', FOLDER), 'utf8');
  // Leaving aside the server for playing with friends, which only a game played with friends can reach.
  const policy = (html) => html.match(/Content-Security-Policy" content="([^"]+)"/)[1].replace(' wss://hemi-race.infoicy.com ws://localhost:*', '');
  assert.equal(policy(page), policy(other));
  assert.ok(!/ style=/.test(page));
  assert.ok(!/<style/.test(page));
  const main = readFileSync(new URL('main.js', FOLDER), 'utf8');
  assert.ok(!/ style=/.test(main));
});

test('nothing lights up the whole screen: there are no full-screen effects to find', () => {
  for (const file of CODE) {
    const source = readFileSync(new URL(file, FOLDER), 'utf8');
    assert.ok(!/fillRect\(0,\s*0,\s*width,\s*height\)/.test(source), file);
    assert.ok(!/emissive/.test(source), file);
  }
});

/* ---------- levels ---------- */

const LEVEL_NUMBERS = Array.from({ length: 10 }, (_, index) => index + 1);
// Which way is harder for each thing a level changes: up, down, or switched on.
const HARDER = {
  walk: 'up', shuffle: 'down', peek: 'down', throwEvery: 'down', gooSeconds: 'down', atOnce: 'up', gooInAir: 'up', swoop: 'on', hop: 'on', rollers: 'up', doubleThrow: 'up', bigSteps: 'on',
  // What's new to see and play with, which only ever comes in and stays: see NEWS.
  bolts: 'on', spread: 'on', lids: 'up', bubble: 'on', keyChest: 'on', gems: 'on', splitters: 'up', guard: 'on', boing: 'on', heart: 'on', planes: 'on', magnet: 'on', sunset: 'on', carrier: 'on', slow: 'on', king: 'on', treasure: 'on',
};

test('level 1 is the game as it always was, with every pace and difficulty', () => {
  for (const pace of Object.keys(PACES)) {
    for (const level of Object.keys(LEVELS)) {
      const { mission } = makeMission({ pace, level, levelNumber: 1 });
      const was = { ...PACES[pace], ...LEVELS[level] };
      assert.equal(mission.walkSpeed, was.walk);
      assert.equal(mission.shuffleEvery, was.shuffleEvery);
      assert.equal(mission.peekSeconds, was.peekSeconds);
      assert.equal(mission.atOnce, was.atOnce);
      assert.equal(mission.throwEvery, was.throwEvery);
      assert.equal(mission.gooSeconds, was.gooSeconds);
      assert.equal(mission.gooInAir, was.gooInAir);
      assert.equal(mission.pace, PACES[pace]);
      assert.equal(mission.level, LEVELS[level]);
    }
  }
  const plan = levelPlan(1);
  assert.deepEqual([plan.swoop, plan.hop, plan.rollers, plan.doubleThrow, plan.bigSteps], [false, false, 0, 0, false]);
  for (const place of PLACES) assert.deepEqual(lineUp(place, levelPlan(1).rollers), place.robots);
  for (const place of PLACES) assert.deepEqual(lineUp(place, plan.rollers, plan), place.robots);
  // Nothing new at all: every new thing is off.
  for (const { key } of Object.values(NEWS).flat()) assert.ok(!Number(plan[key]), key);
  // The same robots come out in the same order, and nothing new happens.
  const old = makeMission({ levelNumber: 1 });
  const log = old.log;
  playThrough(old.mission);
  for (const type of ['swoop', 'hop', 'prize-out', 'prize', 'power', 'bonk', 'split', 'key', 'chest-open', 'pal-freed', 'bubbled', 'bounce', 'heart-up']) assert.equal(log.count(type), 0, type);
  assert.ok(!log.events.some(({ type, robot }) => type === 'robot' && robot.kind === 'roller'));
  assert.ok(log.events.filter(({ type }) => type === 'robot').every(({ robot }) => ['walker', 'drone', 'peeker', 'big'].includes(robot.kind)));
  const { stats } = old.mission;
  assert.deepEqual([stats.bolts, stats.gems, stats.stars, stats.pals, stats.powers, stats.chests], [0, 0, 0, 0, 0, 0]);
  assert.ok(log.events.filter(({ type }) => type === 'shot').every(({ shot }) => shot.kind === 'paint' && shot.flight === 0.2));
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
});

test('new kinds of thing come in from level 3 on, and level 10 has them all', () => {
  const firstAt = (key) => LEVEL_NUMBERS.find((level) => Number(levelPlan(level)[key]) > 0);
  for (const key of ['swoop', 'hop', 'rollers', 'doubleThrow', 'bigSteps']) {
    assert.ok(firstAt(key) >= 3, key);
    assert.ok(Number(levelPlan(10)[key]) > 0, key);
  }
});

test('a level never changes what a grown-up chose: hearts, Gentle, reloading, reach or the number of stops', () => {
  for (const level of LEVEL_NUMBERS) {
    const { mission } = makeMission({ levelNumber: level, stops: 3, reloading: false });
    assert.equal(mission.level, LEVELS.gentle);
    assert.equal(mission.hearts, LEVELS.gentle.hearts);
    assert.equal(mission.stops.length, 3);
    assert.equal(mission.blaster.reloading, false);
    assert.equal(mission.level.canLose, false);
    assert.equal(mission.level.bigSpots, LEVELS.gentle.bigSpots);
  }
});

test('at level 10 on Gentle, goo still can\'t win: hearts stop at one', () => {
  const { mission, log } = makeMission({ levelNumber: 10 });
  mission.holdThrows = 0;
  for (let i = 0; i < 12; i += 1) {
    const goo = throwOne(mission);
    run(mission, goo.seconds + 0.1, { hand: 'open' });
  }
  assert.equal(mission.hearts, 1);
  assert.equal(log.count('lost'), 0);
});

test('at level 10, resting still stops it all: no throwing, swooping, hopping, rolling or stepping', () => {
  const { mission, log } = makeMission({ levelNumber: 10, level: 'tough' });
  while (mission.place.id !== 'tower') {
    mission.queue = [];
    for (const robot of [...mission.robots]) mission.drop(robot);
    while (mission.phase !== 'fighting' || mission.leftHere === 0) mission.update(DT, { hand: 'open' });
  }
  mission.spawn('roller');
  run(mission, REST_AFTER_SECONDS + 0.1, { hand: 'none' });
  assert.equal(mission.resting, true);
  run(mission, 3, { hand: 'none' }); // Anything already under way finishes.
  const where = () => mission.robots.filter(({ kind }) => kind !== 'drone').map(({ x, z }) => `${x.toFixed(4)},${z.toFixed(4)}`);
  const before = { at: where(), goo: log.count('goo'), swoop: log.count('swoop'), hop: log.count('hop'), hearts: mission.hearts };
  run(mission, 40, { hand: 'none' });
  assert.deepEqual(where(), before.at);
  assert.deepEqual([log.count('goo'), log.count('swoop'), log.count('hop'), mission.hearts], [before.goo, before.swoop, before.hop, before.hearts]);
  assert.equal(mission.goo.length, 0);
});

/**
 * A child playing, more slowly than a test would: moving the hand onto a new target takes a moment,
 * closing to reload takes a while, and the shield goes up for goo that's about to arrive. Counts the
 * movements asked for: each close of the hand, and each move of the hand onto a new target.
 */
function playLikeAChild(mission, { aimSeconds = 0.6, reloadSeconds = 0.9 } = {}) {
  let target = null;
  let aimingFor = 0;
  let closedFor = 0;
  let closes = 0;
  let moves = 0;
  let seconds = 0;
  while (!['won', 'lost'].includes(mission.phase) && seconds < 1500) {
    if (closedFor <= 0) {
      const arriving = mission.goo.find((goo) => (1 - goo.t) * goo.seconds < 0.7);
      if (mission.blaster.empty || arriving) {
        closedFor = arriving ? (1 - arriving.t) * arriving.seconds + 0.25 : reloadSeconds;
        closes += 1;
      }
    }
    let hand = 'open';
    if (closedFor > 0) {
      closedFor -= DT;
      hand = 'closed';
    } else {
      const robots = mission.targets().filter(({ kind }) => kind !== 'goo');
      if (!robots.includes(target)) {
        target = robots[0] ?? null;
        if (target) {
          aimingFor = aimSeconds;
          moves += 1;
        }
      }
      aimingFor -= DT;
    }
    mission.update(DT, { hand, target: hand === 'open' && aimingFor <= 0 ? target : null });
    seconds += DT;
  }
  return { seconds, perMinute: ((closes + moves) / seconds) * 60, won: mission.phase === 'won' };
}

const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

test('level 10 asks no more than twice the movements a minute of level 1, and lasts no more than a third longer', () => {
  // On Gentle, so that every game gets to the end and they can be compared.
  for (const [pace, stops] of [['slow', 5], ['medium', 5], ['fast', 3]]) {
    const play = (levelNumber) => [3, 7, 11, 19].map((seed) => {
      const mission = new Mission({ pace, stops, levelNumber, level: 'gentle', random: steady(seed) });
      mission.start();
      return playLikeAChild(mission);
    });
    const first = play(1);
    const last = play(10);
    for (const game of [...first, ...last]) assert.ok(game.won, `${pace}: not finished`);
    const longer = average(last.map(({ seconds }) => seconds)) / average(first.map(({ seconds }) => seconds));
    const busier = average(last.map(({ perMinute }) => perMinute)) / average(first.map(({ perMinute }) => perMinute));
    console.log(`robot rescue ${pace}: level 10 is ${longer.toFixed(2)} times as long, with ${busier.toFixed(2)} times the movements a minute`);
    assert.ok(longer <= 1.34, `${pace}: ${longer.toFixed(2)} times as long`);
    assert.ok(busier <= 2, `${pace}: ${busier.toFixed(2)} times the movements`);
  }
});

test('on Gentle, at level 10 there\'s still at least 70% of the time to react that level 1 gives', () => {
  for (const pace of Object.keys(PACES)) {
    for (const level of ['gentle']) {
      const first = makeMission({ pace, level, levelNumber: 1 }).mission;
      const last = makeMission({ pace, level, levelNumber: 10 }).mission;
      assert.ok(last.gooSeconds >= first.gooSeconds * 0.7, `${pace} ${level}: goo`);
      assert.ok(last.gooSeconds >= Math.min(first.gooSeconds, GOO_LEAST_SECONDS), `${pace} ${level}: goo under 2 seconds`);
      assert.ok(last.peekSeconds >= first.peekSeconds * 0.7, `${pace} ${level}: peekers`);
    }
  }
});

test('at level 10 the new things really happen, and the whole rescue can still be finished', () => {
  const { mission, log } = makeMission({ levelNumber: 10 });
  const result = playLikeAChild(mission);
  assert.ok(result.won);
  assert.equal(mission.stats.friends, PLACES.length);
  assert.ok(log.count('swoop') > 0, 'swoops');
  assert.ok(log.count('hop') > 0, 'hops');
  assert.ok(log.events.some(({ type, robot }) => type === 'robot' && robot.kind === 'roller'), 'rollers');
  assert.ok(log.events.some(({ type, again }) => type === 'windup' && again), 'second throws');
  assert.equal(mission.atOnce, PACES.slow.atOnce + 1);
});

test('rollers keep moving, never throw, and the big one steps from side to side', () => {
  const { mission, log } = makeMission({ levelNumber: 10 });
  mission.holdThrows = 0;
  const roller = mission.spawn('roller');
  const seen = new Set();
  for (let t = 0; t < 20; t += DT) {
    mission.update(DT, { hand: 'open' });
    seen.add(`${Math.round(roller.x)},${Math.round(roller.z)}`);
  }
  assert.ok(seen.size > 6, 'it rolls about');
  assert.ok(!log.events.some(({ type, robot }) => type === 'windup' && robot === roller));
  const { mission: there } = atTheBigOne({ levelNumber: 10 });
  const steps = [];
  for (let t = 0; t < 8; t += DT) {
    there.update(DT, { hand: 'open' });
    steps.push(there.robots.find(({ kind }) => kind === 'big').x);
  }
  assert.ok(Math.max(...steps) - Math.min(...steps) > 2, 'the big one steps');
  assert.ok(Math.max(...steps.map(Math.abs)) <= PLACES.at(-1).big[0] + 2.5);
});

test('a hopping peeker flies from one cover to another, and can be aimed at as it goes', () => {
  const { mission, log } = makeMission({ levelNumber: 10 });
  const peeker = outKind(mission, 'peeker');
  let hopping = false;
  for (let t = 0; t < 30 && !hopping; t += DT) {
    mission.update(DT, { hand: 'open' });
    hopping = peeker.state === 'hopping' && peeker.hop > 0.3 && peeker.hop < 0.7;
  }
  assert.ok(hopping);
  assert.ok(peeker.lift > 0.8);
  assert.ok(mission.targets().includes(peeker));
  assert.ok(log.count('hop') >= 1);
});

/* ---------- what's new at each level ---------- */

test('what\'s new: nothing at level 1, and something at every level from 2 to 10, each with a picture and names', () => {
  assert.deepEqual(newsAt(1), []);
  for (const level of LEVEL_NUMBERS.slice(1)) {
    const news = newsAt(level);
    assert.ok(news.length >= 1, `level ${level}`);
    for (const { mark, name, nameKa, key } of news) {
      assert.ok(mark && name && nameKa && key, `level ${level}: ${name}`);
      assert.ok(name.split(' ').length <= 3, name);
      assert.ok(/[ა-ჿ]/.test(nameKa), nameKa);
    }
  }
  const keys = Object.values(NEWS).flat().map(({ key }) => key);
  assert.equal(new Set(keys).size, keys.length, 'each new thing is new only once');
});

test('each new thing listed is really switched on from its level, and not before', () => {
  for (const level of LEVEL_NUMBERS.slice(1)) {
    for (const { key } of newsAt(level)) {
      assert.ok(key in levelPlan(level), key);
      assert.ok(Number(levelPlan(level)[key]) > 0, `${key} on at ${level}`);
      assert.ok(!Number(levelPlan(level - 1)[key]), `${key} not before ${level}`);
      for (const later of LEVEL_NUMBERS.filter((at) => at > level)) assert.ok(Number(levelPlan(later)[key]) > 0, `${key} stays at ${later}`);
    }
  }
  // Every power-up comes in on a level of its own, and a level's own come first.
  for (const kind of Object.keys(POWERS)) assert.ok(Object.values(NEWS).flat().some(({ key }) => key === kind), kind);
  assert.deepEqual(powerOrder(2), ['spread']);
  assert.deepEqual(powerOrder(4).slice(0, 1), ['bubble']);
  assert.deepEqual(powerOrder(8).slice(0, 2), ['planes', 'magnet']);
  assert.equal(powerOrder(10).length, Object.keys(POWERS).length);
});

test('the new kinds of robot come out where they can be seen, early at each stop, and the line is no longer than one more', () => {
  for (const level of LEVEL_NUMBERS) {
    const plan = levelPlan(level);
    for (const place of PLACES) {
      const line = lineUp(place, plan.rollers, plan);
      assert.ok(line.length <= place.robots.length + 1, `${level} ${place.id}`);
      if (plan.keyChest) assert.equal(line[2], 'keybot');
      if (plan.carrier) assert.equal(line[1], 'carrier');
      if (plan.lids) assert.ok(line.includes('lid'), `${level} ${place.id} lid`);
      if (place.big) assert.equal(line[0], 'big');
    }
  }
  // At the top level, everything comes along at once somewhere.
  const all = new Set(PLACES.flatMap((place) => lineUp(place, levelPlan(10).rollers, levelPlan(10))));
  for (const kind of ['walker', 'drone', 'peeker', 'roller', 'lid', 'splitter', 'keybot', 'carrier', 'big']) assert.ok(all.has(kind), kind);
});

/* ---------- prizes and power-ups ---------- */

/** Drops a robot of this kind where it stands, as if it had been shot. */
function dropOne(mission, kind = 'walker') {
  const robot = outKind(mission, kind);
  mission.drop(robot);
  return robot;
}

test('from level 2, a robot falling apart leaves bolts, which fly over and are counted', () => {
  const { mission, log } = makeMission({ levelNumber: 2 });
  dropOne(mission);
  assert.equal(mission.prizes.filter(({ kind }) => kind === 'bolt').length, 2);
  assert.equal(log.count('prize-out'), 2);
  assert.equal(mission.stats.bolts, 0, 'not counted until they get there');
  run(mission, PRIZE_SECONDS + 0.4, { hand: 'none' });
  assert.equal(mission.stats.bolts, 2);
  assert.equal(mission.prizes.length, 0);
  assert.equal(log.count('prize'), 2);
  // Nothing is lost for missing a prize: there's nothing to miss, and they come whatever the hand does.
  assert.equal(mission.hearts, LEVELS.gentle.hearts);
});

test('every eighth robot, from the second, leaves a power-up, and the level\'s own one comes first', () => {
  const { mission } = makeMission({ levelNumber: 4 });
  const powers = [];
  for (let i = 0; i < 20; i += 1) {
    dropOne(mission);
    powers.push(...mission.prizes.filter(({ kind }) => kind === 'power').map(({ power }) => power));
    mission.collectAll();
  }
  assert.deepEqual(powers, ['bubble', 'spread', 'bubble']);
  assert.equal(POWER_EVERY, 8);
});

test('a power-up runs out, waits while the child rests, and waits between stops', () => {
  const { mission, log } = makeMission({ levelNumber: 2 });
  mission.holdThrows = 999;
  mission.startPower('spread');
  assert.equal(mission.fireKind, 'spread');
  run(mission, 1, { hand: 'open' });
  const left = mission.fire.left;
  assert.ok(Math.abs(left - (POWERS.spread.seconds - 1)) < 0.05);
  run(mission, 12, { hand: 'none' }); // Resting from 4 seconds in.
  assert.ok(mission.resting);
  assert.ok(Math.abs(mission.fire.left - (left - REST_AFTER_SECONDS)) < 0.05, 'it waited');
  run(mission, POWERS.spread.seconds, { hand: 'open' });
  assert.equal(mission.fireKind, null);
  assert.equal(log.count('power-end'), 1);
  // Between stops it waits too.
  mission.startPower('magnet');
  mission.queue = [];
  for (const robot of [...mission.robots]) mission.drop(robot);
  while (mission.phase === 'fighting') mission.update(DT, { hand: 'open' });
  const before = mission.timed.magnet;
  while (mission.phase !== 'fighting') mission.update(DT, { hand: 'open' });
  assert.equal(mission.timed.magnet, before);
});

test('prizes still on their way when the tram moves on carry on over and are counted, and the rest when the game ends', () => {
  const { mission } = makeMission({ levelNumber: 5, stops: 3 });
  for (let i = 0; i < 3; i += 1) {
    mission.queue = [];
    for (const robot of [...mission.robots]) mission.drop(robot);
    while (mission.phase === 'fighting' && mission.leftHere > 0) {
      for (const robot of [...mission.robots]) mission.drop(robot);
    }
    while (!['moving', 'won'].includes(mission.phase)) mission.update(DT, { hand: 'open' });
    if (mission.phase === 'won') break;
    // They don't vanish as the tram sets off: they're still flying over, and counted as they get there.
    const from = mission.stops[mission.index - 1].id;
    const flying = mission.prizes.filter(({ place }) => place === from);
    assert.ok(flying.length > 0);
    const counted = mission.stats.bolts + mission.stats.gems + mission.stats.stars;
    while (mission.phase !== 'fighting') mission.update(DT, { hand: 'open' });
    assert.equal(mission.prizes.filter(({ place }) => place === from).length, 0, 'all there by the next stop');
    assert.ok(mission.stats.bolts + mission.stats.gems + mission.stats.stars >= counted + flying.length);
  }
  assert.equal(mission.phase, 'won');
  assert.equal(mission.prizes.length, 0);
  assert.ok(mission.stats.bolts > 0 && mission.stats.gems > 0);
});

test('a key still on its way when the tram sets off opens its own stop\'s chest, and not the next one\'s', () => {
  const { mission, log } = makeMission({ levelNumber: 5 });
  mission.queue = [];
  const key = mission.robots.find(({ kind }) => kind === 'keybot') ?? outKind(mission, 'keybot');
  for (const robot of mission.robots.filter((robot) => robot !== key)) mission.drop(robot);
  mission.drop(key);
  const first = mission.place;
  while (mission.phase !== 'moving') mission.update(DT, { hand: 'open' });
  assert.equal(log.count('chest-open'), 0, 'the key is still on its way');
  while (!log.count('chest-open') && mission.phase === 'moving') mission.update(DT, { hand: 'open' });
  assert.equal(log.events.find(({ type }) => type === 'chest-open').place, first);
  const fromChest = mission.prizes.filter(({ source }) => source === 'chest');
  assert.equal(fromChest.length, 6);
  assert.ok(fromChest.every(({ place }) => place === first.id), 'its gems and stars come out of it');
  assert.equal(mission.chest.place, mission.place);
  assert.equal(mission.chest.open, false, 'the next stop\'s chest is still locked');
  while (mission.phase !== 'fighting') mission.update(DT, { hand: 'open' });
  assert.equal(mission.stats.chests, 1);
  assert.equal(mission.stats.stars, 2);
});

test('the triple shot sends two more balls at what\'s near, and just the one when there\'s nothing near', () => {
  const { mission, log } = makeMission({ levelNumber: 2 });
  mission.holdThrows = 999;
  mission.startPower('spread');
  const robot = outKind(mission, 'walker');
  // Another one close by, for the other balls to go for.
  mission.spawn('walker', 0, { x: robot.x + 2, z: robot.z, state: 'ready' });
  run(mission, 0.5, { hand: 'open', aim: () => robot });
  const shots = log.events.filter(({ type }) => type === 'shot');
  assert.ok(shots.length >= 1);
  assert.ok(shots.length <= Math.ceil((0.5 * 5.5) / 2.5) + 1, 'it comes less often than paint');
  for (const { sides } of shots) {
    assert.ok(sides.length >= 1 && sides.length <= 2);
    for (const side of sides) assert.ok(side.target && side.target !== robot);
  }
  // With nothing else about, there's only the one ball.
  const alone = makeMission({ levelNumber: 2 }).mission;
  alone.holdThrows = 999;
  alone.queue = [];
  const only = alone.robots[0];
  for (const other of alone.robots.slice(1)) alone.drop(other);
  alone.startPower('spread');
  run(alone, 0.6, { hand: 'open', aim: () => only });
  assert.ok(alone.shots.every(({ target }) => target === only));
  assert.ok(alone.shots.length >= 1);
});

test('the bubble shot traps a robot: it floats where it is, doesn\'t throw, and every hit counts twice', () => {
  const { mission, log } = makeMission({ levelNumber: 4 });
  mission.holdThrows = 0;
  mission.throwIn = 0;
  mission.startPower('bubble');
  const robot = outKind(mission, 'walker');
  robot.state = 'walking';
  robot.hp = 99;
  robot.maxHp = 99;
  run(mission, 0.4, { hand: 'open', aim: () => robot });
  assert.ok(robot.bubbled > 0);
  assert.equal(log.count('bubbled'), 1);
  const at = [robot.x, robot.z];
  const hp = robot.hp;
  run(mission, 1, { hand: 'open', aim: () => robot });
  assert.deepEqual([robot.x, robot.z], at);
  assert.ok(hp - robot.hp >= 2 * 3, `${hp - robot.hp} for about 4 hits`);
  assert.ok(!log.events.some(({ type, robot: thrower }) => type === 'windup' && thrower === robot));
  run(mission, BUBBLE_SECONDS + 0.5, { hand: 'none' });
  assert.equal(robot.bubbled, 0);
  assert.equal(log.count('unbubbled'), 1);
  // The big one can't be trapped.
  const { mission: there, big } = atTheBigOne({ levelNumber: 4 });
  there.startPower('bubble');
  run(there, 3, { hand: 'open', aim: (m) => m.targets().find(({ kind }) => kind === 'spot') ?? null });
  assert.ok(!(big.bubbled > 0));
});

test('the boing ball does twice the damage, comes half as often, and bounces on to the next robot', () => {
  const { mission, log } = makeMission({ levelNumber: 7 });
  mission.holdThrows = 999;
  mission.startPower('boing');
  const robot = outKind(mission, 'walker');
  robot.hp = 99;
  run(mission, 1, { hand: 'open', aim: () => robot });
  const shots = log.events.filter(({ type }) => type === 'shot');
  assert.ok(shots.every(({ shot }) => shot.kind === 'boing'));
  assert.ok(shots.length <= 4);
  assert.ok(log.count('bounce') > 0, 'it bounces');
  const bounce = log.events.find(({ type }) => type === 'bounce').shot;
  assert.notEqual(bounce.target, robot);
  assert.ok(bounce.bounces < BOING.bounces);
  assert.ok(99 - robot.hp >= 2 * (shots.length - 1));
});

test('paper planes find a robot by themselves, with nothing in the crosshair, and fly round a lid', () => {
  const { mission, log } = makeMission({ levelNumber: 8 });
  mission.holdThrows = 999;
  mission.startPower('planes');
  run(mission, 1, { hand: 'open', aim: () => null });
  const planes = log.events.filter(({ type }) => type === 'shot').map(({ shot }) => shot);
  assert.ok(planes.length >= 2);
  assert.ok(planes.every(({ kind, target }) => kind === 'plane' && target));
  // A closed hand still doesn't fire them.
  const before = log.count('shot');
  run(mission, 1, { hand: 'closed', aim: () => null });
  assert.equal(log.count('shot'), before);
  const lid = outKind(mission, 'lid');
  lid.state = 'ready';
  lid.throwing = 0;
  assert.ok(lidIsUp(lid));
  const hp = lid.hp;
  mission.land({ target: lid, kind: 'plane' });
  assert.equal(lid.hp, hp - 1);
});

test('a lid robot\'s lid bonks shots off while it\'s up, never while it walks or throws, and falls off in the end', () => {
  const { mission, log } = makeMission({ levelNumber: 3 });
  const lid = outKind(mission, 'lid');
  lid.state = 'ready';
  lid.throwing = 0;
  const hp = lid.hp;
  for (let i = 0; i < LID_BONKS - 1; i += 1) mission.land({ target: lid, kind: 'paint' });
  assert.equal(lid.hp, hp);
  assert.equal(log.count('bonk'), LID_BONKS - 1);
  lid.state = 'walking';
  assert.ok(!lidIsUp(lid));
  mission.land({ target: lid, kind: 'paint' });
  assert.equal(lid.hp, hp - 1);
  lid.state = 'ready';
  lid.throwing = 0.3;
  assert.ok(!lidIsUp(lid));
  lid.throwing = 0;
  mission.land({ target: lid, kind: 'paint' });
  assert.equal(log.count('lid-off'), 1);
  assert.ok(!lidIsUp(lid));
  mission.land({ target: lid, kind: 'paint' });
  assert.equal(lid.hp, hp - 2);
  // A child just keeping the hand open on one gets it in the end, lid and all.
  const { mission: again } = makeMission({ levelNumber: 3 });
  again.holdThrows = 999;
  const other = outKind(again, 'lid');
  other.state = 'ready';
  run(again, 8, { hand: 'open', aim: (m) => (m.robots.includes(other) ? other : null) });
  assert.ok(!again.robots.includes(other));
});

test('a splitting robot comes apart into two little ones, which never throw, and the stop isn\'t done until they\'re gone', () => {
  const { mission, log } = makeMission({ levelNumber: 6 });
  const splitter = outKind(mission, 'splitter');
  const before = mission.leftHere;
  mission.drop(splitter);
  const minis = mission.robots.filter(({ kind }) => kind === 'mini');
  assert.equal(minis.length, 2);
  assert.equal(mission.leftHere, before + 1);
  assert.equal(log.count('split'), 1);
  assert.ok(minis.every(({ x }) => Math.abs(Math.abs(x - splitter.x) - 0.75) < 1e-9));
  mission.holdThrows = 0;
  mission.throwIn = 0;
  for (const robot of mission.robots) if (robot.kind !== 'mini') robot.throwing = 9;
  run(mission, 6, { hand: 'none' });
  assert.ok(!log.events.some(({ type, robot }) => type === 'windup' && robot.kind === 'mini'));
  // Falling down with the big one, it doesn't come apart.
  const { mission: there, big } = atTheBigOne({ levelNumber: 6 });
  there.spawn('splitter');
  for (const spot of big.spots) {
    spot.open = true;
    spot.hp = 1;
    there.land({ target: spot, kind: 'paint' });
  }
  assert.equal(there.robots.filter(({ kind }) => kind === 'mini').length, 0);
});

test('the golden robot\'s key flies to the chest, which opens with gems and stars, even if the stop ends first', () => {
  const { mission, log } = makeMission({ levelNumber: 5 });
  assert.ok(mission.chest && !mission.chest.open);
  const golden = mission.robots.find(({ kind }) => kind === 'keybot') ?? outKind(mission, 'keybot');
  mission.drop(golden);
  assert.equal(log.count('key'), 1);
  run(mission, KEY_SECONDS + 0.1, { hand: 'none' });
  assert.ok(mission.chest.open);
  assert.equal(log.count('chest-open'), 1);
  run(mission, PRIZE_SECONDS + 1, { hand: 'none' });
  assert.equal(mission.stats.gems >= 4, true);
  assert.equal(mission.stats.stars, 2);
  assert.equal(mission.stats.chests, 1);
  // If it's the last robot there, the chest still opens before the tram goes.
  const { mission: quick } = makeMission({ levelNumber: 5 });
  quick.queue = [];
  const key = quick.robots.find(({ kind }) => kind === 'keybot') ?? outKind(quick, 'keybot');
  for (const robot of quick.robots.filter((robot) => robot !== key)) quick.drop(robot);
  quick.drop(key);
  while (quick.phase !== 'moving') quick.update(DT, { hand: 'open' });
  while (quick.phase === 'moving') quick.update(DT, { hand: 'open' });
  assert.equal(quick.stats.chests, 1);
  assert.equal(quick.stats.stars, 2);
});

test('a drone carrying a friend goes slowly to and fro, never throws, and its friend floats down and is counted', () => {
  const { mission, log } = makeMission({ levelNumber: 9 });
  const carrier = mission.robots.find(({ kind }) => kind === 'carrier');
  assert.ok(carrier, 'it comes out second');
  assert.equal(carrier.pal, PALS[0]);
  mission.holdThrows = 0;
  mission.throwIn = 0;
  const seen = [];
  for (let t = 0; t < 20; t += DT) {
    mission.update(DT, { hand: 'none' });
    if (!mission.resting) seen.push(carrier.x);
  }
  assert.ok(Math.max(...seen) - Math.min(...seen) > 2, 'it goes to and fro');
  assert.ok(!log.events.some(({ type, robot }) => type === 'windup' && robot === carrier));
  // It stays where it is while the child rests.
  const at = carrier.x;
  run(mission, 3, { hand: 'none' });
  assert.equal(carrier.x, at);
  mission.drop(carrier);
  assert.equal(mission.stats.pals, 1);
  assert.equal(log.events.find(({ type }) => type === 'pal-freed').who, PALS[0]);
});

test('the shield bubble stops goo without the hand closing, and doesn\'t count as the child\'s own shield', () => {
  const { mission, log } = makeMission({ levelNumber: 6 });
  mission.startPower('guard');
  const goo = throwOne(mission);
  run(mission, goo.seconds + 0.1, { hand: 'open' });
  assert.equal(mission.hearts, LEVELS.gentle.hearts);
  assert.equal(mission.stats.gooBubbled, 1);
  assert.equal(mission.stats.gooBlocked, 0);
  assert.ok(log.events.some(({ type, bubble }) => type === 'goo-blocked' && bubble));
});

test('the magnet pulls a bolt out of a robot that\'s hit, now and then', () => {
  const { mission } = makeMission({ levelNumber: 8 });
  mission.holdThrows = 999;
  mission.startPower('magnet');
  const robot = outKind(mission, 'walker');
  robot.hp = 99;
  run(mission, 2, { hand: 'open', aim: () => robot });
  const pulled = mission.prizes.filter(({ pulled }) => pulled).length + mission.stats.bolts;
  assert.ok(pulled >= 2 && pulled <= 4, `${pulled} bolts in 2 seconds`);
});

test('a heart only comes once one has been lost, and gives one back', () => {
  const { mission } = makeMission({ levelNumber: 7, level: 'medium' });
  for (let i = 0; i < 40; i += 1) assert.notEqual(mission.nextPower(), 'heart');
  mission.hearts -= 1;
  const kinds = Array.from({ length: 6 }, () => mission.nextPower());
  assert.ok(kinds.includes('heart'));
  mission.startPower('heart');
  assert.equal(mission.hearts, LEVELS.medium.hearts);
});

test('slow motion slows the robots and their goo, and not the blaster', () => {
  const plain = makeMission({ levelNumber: 9 }).mission;
  const slow = makeMission({ levelNumber: 9 }).mission;
  slow.startPower('slow');
  for (const mission of [plain, slow]) {
    mission.holdThrows = 999;
    run(mission, 2, { hand: 'open' });
  }
  const walked = (mission) => mission.robots.filter(({ kind }) => kind === 'walker' || kind === 'lid').reduce((sum, { x, z }) => sum + Math.abs(x) + Math.abs(z), 0);
  assert.notEqual(walked(plain), walked(slow));
  assert.ok(Math.abs(slow.clock - 2 * SLOW.robots) < 0.05);
  const goo = throwOne(slow);
  run(slow, 1, { hand: 'open' });
  assert.ok(Math.abs(goo.t - SLOW.goo / goo.seconds) < 0.02);
});

test('at level 10 the big one is the robot king: weak spots leave prizes, and he leaves his treasure', () => {
  const { mission, log, big } = atTheBigOne({ levelNumber: 10 });
  assert.equal(big.king, true);
  assert.equal(atTheBigOne({ levelNumber: 9 }).big.king, false);
  for (const spot of big.spots) {
    spot.open = true;
    spot.hp = 1;
    mission.land({ target: spot, kind: 'paint' });
  }
  const stars = mission.prizes.filter(({ kind, treasure }) => kind === 'star' && treasure).length;
  assert.equal(stars, 6);
  assert.ok(mission.prizes.filter(({ source }) => source?.kind === 'spot').length >= big.spots.length * 2);
  while (mission.phase !== 'won') mission.update(DT, { hand: 'open' });
  assert.ok(mission.stats.stars >= 6);
  assert.equal(log.count('won'), 1);
});

/* ---------- the new things and the rules that never change ---------- */

test('every level from 2 to 10 can be finished, and level 10 at every pace and difficulty', () => {
  for (const levelNumber of LEVEL_NUMBERS.slice(1)) {
    const mission = new Mission({ levelNumber, random: steady(levelNumber) });
    mission.start();
    assert.ok(playLikeAChild(mission).won, `level ${levelNumber}`);
    if (levelNumber >= 2) assert.ok(mission.stats.bolts > 0, `level ${levelNumber} bolts`);
  }
  for (const pace of Object.keys(PACES)) {
    for (const level of Object.keys(LEVELS)) {
      for (const reloading of [true, false]) {
        const mission = new Mission({ pace, level, reloading, levelNumber: 10, random: steady(5) });
        mission.start();
        const result = playLikeAChild(mission);
        assert.ok(result.won, `${pace} ${level} reloading ${reloading}`);
        assert.equal(mission.stats.friends, PLACES.length);
      }
    }
  }
});

test('at level 10 with every power-up on at once, Gentle still can\'t be lost, and resting still stops everything', () => {
  const { mission, log } = makeMission({ levelNumber: 10 });
  mission.holdThrows = 0;
  for (const kind of Object.keys(POWERS)) mission.startPower(kind);
  mission.timed.guard = 0; // So the goo really arrives.
  for (let i = 0; i < 10; i += 1) {
    const goo = throwOne(mission);
    run(mission, goo.seconds / SLOW.goo + 0.2, { hand: 'open' });
  }
  assert.equal(mission.hearts, 1);
  assert.equal(log.count('lost'), 0);
  // Resting: nothing is thrown, nothing moves, and the power-ups wait.
  run(mission, 6, { hand: 'none' });
  assert.ok(mission.resting);
  const left = mission.powersOn.map((kind) => mission.powerLeft(kind).left);
  const where = mission.robots.map(({ x, z }) => `${x.toFixed(3)},${z.toFixed(3)}`);
  const goo = log.count('goo');
  run(mission, 20, { hand: 'none' });
  assert.deepEqual(mission.powersOn.map((kind) => mission.powerLeft(kind).left), left);
  assert.deepEqual(mission.robots.filter(({ kind }) => kind !== 'drone').map(({ x, z }) => `${x.toFixed(3)},${z.toFixed(3)}`), where.filter((_, index) => mission.robots[index]?.kind !== 'drone'));
  assert.equal(log.count('goo'), goo);
});

test('the level 10 game, played as a child would, has every new thing in it', () => {
  const { mission, log } = makeMission({ levelNumber: 10, pace: 'medium' });
  playLikeAChild(mission);
  assert.equal(mission.phase, 'won');
  const kinds = new Set(log.events.filter(({ type }) => type === 'robot').map(({ robot }) => robot.kind));
  for (const kind of ['lid', 'splitter', 'mini', 'keybot', 'carrier', 'roller', 'big']) assert.ok(kinds.has(kind), kind);
  const fired = new Set(log.events.filter(({ type }) => type === 'shot').map(({ shot }) => shot.kind));
  console.log('robot rescue level 10:', JSON.stringify(mission.stats), [...fired].join(' '));
  assert.ok(fired.size >= 3, [...fired].join(' '));
  assert.ok(mission.stats.powers >= 6);
  assert.equal(mission.stats.chests, PLACES.length);
  assert.equal(mission.stats.pals, PLACES.length);
  assert.ok(mission.stats.bolts > 40 && mission.stats.gems > 10 && mission.stats.stars >= 6 + 2 * PLACES.length);
});

test('the new sounds don\'t pile up: bolts twinkle once for a handful, and bonks and bubbles take turns', () => {
  const sound = new RescueSound();
  sound.context = { currentTime: 10 };
  const played = [];
  sound.play = (name) => played.push(name);
  for (let i = 0; i < 6; i += 1) sound.prizeIn('bolt');
  assert.deepEqual(played, ['sparkle']);
  played.length = 0;
  for (let i = 0; i < 6; i += 1) sound.bonk();
  for (let i = 0; i < 6; i += 1) sound.bubbleUp();
  for (let i = 0; i < 6; i += 1) sound.boingBall();
  assert.deepEqual(played, ['shieldHit', 'gooPop', 'boing']);
  // A power-up always gets its sound, as there's only ever one at a time.
  played.length = 0;
  sound.prizeIn('power');
  sound.prizeIn('power');
  assert.equal(played.length, 4);
});

/* ---------- a robot in a bubble, hearts, the progress, and the pieces on the screen ---------- */

test('a robot let out of a bubble picks up where it left off: a hop doesn\'t land at once, a duck doesn\'t vanish, and a drone doesn\'t jump', () => {
  const { mission } = makeMission({ levelNumber: 10 });
  mission.holdThrows = 999;
  const peeker = outKind(mission, 'peeker');
  mission.startHop(peeker);
  run(mission, HOP.seconds / 2, { hand: 'open' });
  const hop = peeker.hop;
  mission.trap(peeker);
  run(mission, BUBBLE_SECONDS + 0.05, { hand: 'open' });
  assert.equal(peeker.bubbled, 0);
  let at = { x: peeker.x, z: peeker.z };
  mission.update(DT, { hand: 'open' });
  assert.ok(Math.hypot(peeker.x - at.x, peeker.z - at.z) < 0.3, 'not on the far cover in one go');
  assert.ok(peeker.hop > hop - 0.01 && peeker.hop < hop + 0.1, `${hop} then ${peeker.hop}`);

  const ducking = makeMission({ levelNumber: 10 }).mission;
  ducking.holdThrows = 999;
  const duck = outKind(ducking, 'peeker');
  ducking.setState(duck, 'ducking');
  run(ducking, 0.1, { hand: 'open' });
  const rise = duck.rise;
  ducking.trap(duck);
  while (duck.bubbled > 0) ducking.update(DT, { hand: 'open' });
  ducking.update(DT, { hand: 'open' });
  assert.ok(duck.rise > 0 && duck.rise > rise - 0.1, `${rise} then ${duck.rise}: it carries on going down from where it was`);

  const flying = makeMission({ levelNumber: 10 }).mission;
  flying.holdThrows = 999;
  const drone = outKind(flying, 'drone');
  run(flying, 2, { hand: 'open' });
  flying.trap(drone);
  run(flying, BUBBLE_SECONDS + 0.05, { hand: 'open' });
  at = { x: drone.x, y: drone.y, z: drone.z };
  flying.update(DT, { hand: 'open' });
  assert.ok(Math.hypot(drone.x - at.x, drone.y - at.y, drone.z - at.z) < 0.2, 'it doesn\'t jump');
});

test('once the last heart has gone, a heart still on its way puts none back, and the game is lost', () => {
  const { mission, log } = makeMission({ levelNumber: 7, level: 'medium' });
  mission.holdThrows = 999;
  mission.hearts = 1;
  const goo = throwOne(mission);
  run(mission, goo.seconds + 0.05, { hand: 'none' });
  assert.equal(mission.hearts, 0);
  const robot = mission.robots.find(({ kind }) => kind !== 'big');
  const heart = mission.addPrize('power', robot, 0, { power: 'heart' });
  heart.t = 0.99;
  run(mission, 2, { hand: 'none' });
  assert.equal(log.count('heart-up'), 0);
  assert.equal(mission.hearts, 0);
  assert.equal(mission.phase, 'lost');
});

test('a heart whose turn comes with every heart there waits, and comes as soon as one has gone', () => {
  const { mission } = makeMission({ levelNumber: 7, level: 'medium' });
  mission.powerTurn = mission.powers.indexOf('heart');
  assert.notEqual(mission.nextPower(), 'heart', 'not with every heart there');
  mission.hearts -= 1;
  assert.equal(mission.nextPower(), 'heart', 'its turn waited');
  assert.notEqual(mission.nextPower(), 'heart');
});

test('how many robots there are at a stop counts the little ones a splitting robot comes apart into', () => {
  const { mission } = makeMission({ levelNumber: 6 });
  const plan = levelPlan(6);
  assert.equal(mission.toDealWith, lineUp(mission.place, plan.rollers, plan).length);
  assert.equal(mission.toDealWith, mission.leftHere);
  const before = mission.toDealWith;
  mission.split(outKind(mission, 'walker'));
  assert.equal(mission.toDealWith, before + 2);
});

/** A robot's record, as the rules would make it, for its look on the screen. */
const robotOf = (kind, extra = {}) => ({ id: 1, kind, hp: 2, maxHp: 2, x: 1, y: 0, z: 12, state: 'ready', stateFor: 0, phase: 0.4, paint: 1, rise: 1, shakeFor: 0, throwing: 0, ...extra });

test('a robot falling apart: each bit shrinks away from its own size, so a little robot\'s bits and the golden one\'s key never grow', () => {
  for (const kind of ['mini', 'keybot', 'walker']) {
    const scene = new THREE.Scene();
    const view = makeRobotView(robotOf(kind), false);
    scene.add(view.root);
    const debris = new Debris(scene);
    debris.burst(view, 1);
    const sizes = new Map(debris.bits.map(({ bit }) => [bit, bit.scale.x]));
    for (let t = 0; t < 2; t += DT) {
      debris.update(DT);
      for (const [bit, size] of sizes) assert.ok(bit.scale.x <= size + 1e-9, `${kind}: from ${size} to ${bit.scale.x}`);
    }
    assert.equal(debris.bits.length, 0);
  }
});

test('a lid robot\'s lid, and a drone\'s rope, come away with the rest of it when it falls apart', () => {
  const scene = new THREE.Scene();
  const debris = new Debris(scene);
  const lid = makeRobotView(robotOf('lid'), false);
  scene.add(lid.root);
  debris.burst(lid, 1);
  assert.ok(debris.bits.some(({ bit }) => bit === lid.lid), 'the lid');
  const place = new THREE.Group();
  scene.add(place);
  const carrier = makeRobotView(robotOf('carrier', { y: 5.4, enter: 1, drift: 0 }), false, 1.5, carriedFriend(byId('widget')));
  place.add(carrier.root);
  carrier.root.updateWorldMatrix(true, true);
  place.attach(carrier.cage); // The friend is let go first.
  debris.burst(carrier, 1);
  assert.ok(debris.bits.some(({ bit }) => bit === carrier.hanging), 'the rope');
});

test('a friend let go by a drone floats down onto the street, the bridge or the water, and stays there, and is kept for next time', () => {
  const landings = { market: Stage.prototype.landingFor('market', 6.2, 15), bridge: Stage.prototype.landingFor('canal', 4.1, 15), water: Stage.prototype.landingFor('canal', 6.2, 15) };
  assert.deepEqual(landings.market, { x: 6.2, y: 0 });
  assert.deepEqual(landings.bridge, { x: 3.6, y: 0 });
  assert.equal(landings.water.water, true);
  assert.ok(landings.water.y < 0 && landings.water.y >= WATER_LEVEL - 0.1);
  assert.ok(Math.abs(landings.water.x) > 5.5, 'clear of the bridge\'s low wall');
  for (const land of Object.values(landings)) {
    const scene = new THREE.Scene();
    const place = new THREE.Group();
    scene.add(place);
    const friend = carriedFriend(byId('nova'));
    const view = makeRobotView(robotOf('carrier', { x: 6.2, y: 5.1, z: 15, enter: 1, drift: 0 }), false, 1.5, friend);
    place.add(view.root);
    view.root.updateWorldMatrix(true, true);
    place.attach(view.cage);
    const floating = new FloatingCage(view, false, land);
    let lowest = Infinity;
    for (let t = 0; t < 3.3; t += DT) {
      floating.update(DT);
      lowest = Math.min(lowest, view.cage.position.y);
    }
    assert.ok(lowest >= land.y - 0.07, `it went down to ${lowest}, and the ground is at ${land.y}`);
    assert.ok(view.cage.position.y < land.y + 0.08, 'it got down');
    assert.ok(Math.abs(view.cage.position.x - land.x) < 0.01);
    while (floating.update(DT));
    assert.equal(friend.root.parent, null);
    assert.equal(carriedFriend(byId('nova')), friend, 'made once, and kept for the next drone');
  }
});

test('a new thing\'s name only counts once it has really come up: one whose thing goes first waits for the next of its kind, and never holds the others up', () => {
  const labels = (level) => {
    const stage = { news: new Map(newsAt(level).map((item) => [item.key, item])), named: [], labels: [], playing: true, language: 'en', hudBottom: 120, name: Stage.prototype.name };
    const name = (key, at, gone = () => false) => Stage.prototype.name.call(stage, key, at, gone);
    const play = (seconds) => {
      for (let t = 0; t < seconds; t += DT) Stage.prototype.updateLabels.call(stage, DT);
    };
    return { stage, name, play };
  };
  // At level 5, a roller's name is up when a gem comes out, and the gem lands before the roller's name is done.
  const { stage, name, play } = labels(5);
  name('rollers', () => ({ x: 100, y: 300 }));
  play(0.1);
  assert.deepEqual(stage.named, ['rollers']);
  let landed = false;
  name('gems', () => (landed ? null : { x: 200, y: 260 }), () => landed);
  play(1.2);
  landed = true;
  play(3);
  assert.ok(!stage.named.includes('gems'), 'never seen, so not named');
  assert.ok(stage.labels.some(({ key }) => key === 'gems'), 'it waits for the next one');
  // The next gem gets the name, below the chips along the top.
  name('gems', () => ({ x: 220, y: 90 }));
  play(0.1);
  assert.ok(stage.named.includes('gems'));
  assert.equal(stage.labels[0].key, 'gems');
  assert.ok(stage.labels[0].pinned.y >= 120);
  assert.equal(stage.labels[0].words, 'Gems');
  stage.language = 'ka';
  assert.equal(stage.labels[0].words, 'ძვირფასი ქვები', 'in the language the voice speaks now');
  // At level 8, a power-up that can't be seen yet doesn't hold up the sunset.
  const later = labels(8);
  later.name('planes', () => null);
  later.name('sunset', () => ({ x: 640, y: 140 }));
  later.play(0.1);
  assert.deepEqual(later.stage.named, ['sunset']);
  // And one that never can be seen goes in the end, and isn't counted as named.
  later.play(12);
  assert.ok(!later.stage.labels.some(({ key }) => key === 'planes'));
  assert.ok(!later.stage.named.includes('planes'));
  // A power-up that has got there before its name could come up is on, at the top, and named there.
  const power = labels(4);
  const prize = { kind: 'power', power: 'bubble' };
  Object.assign(power.stage, { prizeLooks: new Map(), prizeHomes: { 'power:bubble': { x: 300, y: 60 } }, mission: { powersOn: [] } });
  power.name('hop', () => ({ x: 600, y: 300 }));
  Stage.prototype.namePrize.call(power.stage, 'bubble', prize);
  power.play(1);
  power.stage.mission.powersOn = ['bubble'];
  power.play(2);
  assert.ok(power.stage.named.includes('bubble'));
  assert.deepEqual(power.stage.labels[0].pinned, { x: 300, y: 154 });
});

test('a triple shot\'s three balls landing together are heard as one hit', () => {
  const sound = new RescueSound();
  sound.context = { currentTime: 10 };
  const played = [];
  sound.play = (name) => played.push(name);
  for (let i = 0; i < 3; i += 1) sound.hit();
  assert.equal(played.length, 1);
  sound.context.currentTime = 10.2;
  sound.hit();
  assert.equal(played.length, 2, 'the next shot\'s is heard');
});

/* ---------- the challenge: Medium, how it comes, and Tough, where the goo can win ---------- */

/**
 * A made-up player. warn is how long before goo arrives they see it coming, closeTakes how long their
 * hand takes to read as closed after that, aimSeconds how long getting onto a new robot takes, and a
 * careless one never raises the shield at all, only closing to reload.
 */
function playAs(mission, { warn = 0.7, closeTakes = 0, aimSeconds = 0.6, reloadSeconds = 0.9, shield = true } = {}) {
  let target = null;
  let aimingFor = 0;
  let closedFor = 0;
  let closing = -1;
  for (let seconds = 0; seconds < 1500 && !['won', 'lost'].includes(mission.phase); seconds += DT) {
    if (closedFor <= 0 && closing < 0) {
      const arriving = shield && mission.goo.find((goo) => (1 - goo.t) * goo.seconds < warn);
      if (mission.blaster.empty) closedFor = reloadSeconds;
      else if (arriving) {
        closing = closeTakes;
        closedFor = (1 - arriving.t) * arriving.seconds + 0.25;
      }
    }
    let hand = 'open';
    if (closing >= 0) closing -= DT;
    if (closedFor > 0 && closing < 0) {
      closedFor -= DT;
      hand = 'closed';
    } else if (closing < 0) {
      const robots = mission.targets().filter(({ kind }) => kind !== 'goo');
      if (!robots.includes(target)) {
        target = robots[0] ?? null;
        if (target) aimingFor = aimSeconds;
      }
      aimingFor -= DT;
    }
    mission.update(DT, { hand, target: hand === 'open' && aimingFor <= 0 ? target : null });
  }
  return mission.phase;
}

const PLAYERS = {
  careless: { shield: false },
  slowChild: { warn: 1, closeTakes: 0.35, aimSeconds: 1, reloadSeconds: 1.2 },
  adult: { warn: 0.9, closeTakes: 0.15, aimSeconds: 0.5 },
  sharp: { warn: 0.7, closeTakes: 0 },
};

const wins = (options, player) => [3, 7, 11, 19].filter((seed) => {
  const mission = new Mission({ random: steady(seed), ...options });
  mission.start();
  return playAs(mission, PLAYERS[player]) === 'won';
}).length;

test('it comes on Medium, where the goo can win: a player who never raises the shield loses, even at level 1', () => {
  const mission = new Mission({ random: steady(3) });
  assert.equal(mission.level, LEVELS.medium);
  assert.equal(mission.level.canLose, true);
  assert.equal(wins({}, 'careless'), 0);
  assert.equal(wins({ level: 'gentle' }, 'careless'), 4, 'Gentle still can\'t be lost');
});

test('level 1 on Medium can be learnt: a slow, careful child wins it', () => {
  assert.equal(wins({ levelNumber: 1 }, 'slowChild'), 4);
});

test('level 10 needs real skill: a fair grown-up loses it, and only a sharp player wins', () => {
  for (const level of ['medium', 'tough']) {
    assert.equal(wins({ level, levelNumber: 10 }, 'adult'), 0, `${level} adult`);
    assert.equal(wins({ level, levelNumber: 10 }, 'sharp'), 4, `${level} sharp`);
  }
  assert.equal(wins({ level: 'tough', levelNumber: 10 }, 'slowChild'), 0);
  // And on Gentle, the game as it was, every one of them gets there.
  for (const player of Object.keys(PLAYERS)) assert.equal(wins({ level: 'gentle', levelNumber: 10 }, player), 4, player);
});

test('on Medium and Tough the levels ramp: by level 10 goo comes about twice as often and takes about half as long', () => {
  for (const pace of Object.keys(PACES)) {
    for (const level of ['medium', 'tough']) {
      const first = makeMission({ pace, level, levelNumber: 1 }).mission;
      const last = makeMission({ pace, level, levelNumber: 10 }).mission;
      assert.equal(first.gooSeconds, LEVELS[level].gooSeconds, 'level 1 is as it always was');
      assert.equal(first.throwEvery, LEVELS[level].throwEvery);
      assert.ok(last.gooSeconds <= first.gooSeconds * 0.6 && last.gooSeconds >= first.gooSeconds * 0.5, `${pace} ${level}: ${last.gooSeconds}`);
      assert.ok(last.gooSeconds >= CHALLENGE_GOO_LEAST_SECONDS);
      assert.ok(last.throwEvery <= first.throwEvery * 0.5, `${pace} ${level}: throws`);
      assert.equal(last.gooInAir, first.gooInAir + 2);
    }
  }
  assert.deepEqual(challengePlan(10, false), challengePlan(1, false), 'Gentle never ramps more than it did');
});

test('on Medium from level 4 the robots hold on to their goo while the shield is up, and throw as it comes down', () => {
  for (const [level, levelNumber, waits] of [['medium', 4, true], ['tough', 10, true], ['medium', 3, false], ['gentle', 10, false]]) {
    const { mission, log } = makeMission({ level, levelNumber });
    mission.holdThrows = 0;
    mission.throwIn = 0;
    run(mission, 1.5, { hand: 'closed' });
    assert.equal(log.count('windup') === 0, waits, `${level} ${levelNumber}`);
    if (!waits) continue;
    run(mission, 0.2, { hand: 'open' });
    assert.ok(log.count('windup') > 0, `${level} ${levelNumber}: throws once it's down`);
  }
});

test('only level 1 has the quiet start at the first stop on Medium, and every level on Gentle', () => {
  const quiet = (level, levelNumber) => makeMission({ level, levelNumber }).mission.holdThrows > 0;
  assert.equal(quiet('medium', 1), true);
  assert.equal(quiet('medium', 2), false);
  assert.equal(quiet('tough', 10), false);
  assert.equal(quiet('gentle', 10), true);
});

test('resting still stops the goo on Tough at level 10, so a child who walks away is never caught for it', () => {
  const { mission } = makeMission({ level: 'tough', levelNumber: 10 });
  run(mission, 2, { hand: 'open', aim: firstTarget });
  run(mission, REST_AFTER_SECONDS + 0.1, { hand: 'none' });
  assert.equal(mission.resting, true);
  const rested = mission.hearts;
  run(mission, 60, { hand: 'none' });
  assert.equal(mission.phase, 'fighting');
  assert.equal(mission.hearts, rested);
  assert.equal(mission.goo.length, 0);
});
