// The rules of Tank Patrol, and the valley they're played in. Its screen is tested in test/e2e/tank-patrol.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { AIM_HELP, CAGE_SPOTS, GUN, KINDS, LEVELS, NEWS, PACES, POWERS, Patrol, STANDOFF, challengePlan, headingTo, levelPlan, newsAt, readHand, shellPoint, tanksFor } from '../../games/tank-patrol/patrol.js';
import { BATTLE_SECONDS, CLEAR, Duel, SAFE_SECONDS, STARTS, battleSeconds, wrap } from '../../games/tank-patrol/duel.js';
import { MOST_FOES, MOST_SHELLS, TEAM_CLEAR, TEAM_STARTS, TeamPatrol, teamTanks } from '../../games/tank-patrol/team.js';
import { MOST_BYTES, cleanFoes, cleanTag, cleanTank } from '../../server/race-room.js';
import { BRIDGES, PLAY, SPAWNS, START, TANK_RADIUS, groundY, heightAt, riverNear, seeded, solidNear, valleyNav } from '../../games/tank-patrol/valley-map.js';
import { PatrolSound } from '../../games/tank-patrol/patrol-sound.js';

const STEP = 1 / 60;
// Gentle, the game as it always was, unless a test says otherwise: the challenge has its own tests.
const quiet = (settings = {}) => new Patrol({ random: seeded(7), level: 'gentle', ...settings });

function run(patrol, seconds, input) {
  for (let t = 0; t < seconds; t += STEP) patrol.update(STEP, typeof input === 'function' ? input(t) : input);
}

const eventsOf = (patrol) => {
  const events = [];
  patrol.onEvent = (event) => events.push(event);
  return { events, types: () => events.map(({ type }) => type), count: (type) => events.filter((event) => event.type === type).length };
};

const started = (settings) => {
  const patrol = quiet(settings);
  patrol.begin();
  return patrol;
};

/** Puts a tank somewhere, and tells it to stay put. */
function hold(patrol, enemy, x, z) {
  Object.assign(enemy, { x, z, y: groundY(x, z), goal: { x, z }, holdFor: 999 });
  enemy.flow = patrol.nav.flowTo(x, z, enemy.flow);
}

/** One robot tank a set distance straight up the valley from the child's, and no others about. */
function oneTankAt(patrol, away) {
  const [enemy] = patrol.enemies;
  patrol.enemies = [enemy];
  patrol.queue = [];
  patrol.total = 1;
  const { tank } = patrol;
  hold(patrol, enemy, tank.x, tank.z - away);
  return enemy;
}

/* ---------- the valley ---------- */

test('a tank can get from the start to everywhere that\'s free, including over every bridge', () => {
  const nav = valleyNav();
  const field = nav.flowTo(START.x, START.z);
  let free = 0;
  for (let index = 0; index < field.length; index += 1) {
    if (!nav.blocked[index]) {
      free += 1;
      assert.ok(Number.isFinite(field[index]), `cut off at ${nav.centreX(index)}, ${nav.centreZ(index)}`);
    }
  }
  assert.ok(free > 900, `only ${free} free squares`);
  for (const spot of SPAWNS) assert.ok(nav.isFree(spot.x, spot.z), `can't start at ${spot.x}, ${spot.z}`);
  // The far bank can only be reached over a bridge, and there's more than one.
  for (const bridge of BRIDGES) assert.ok(nav.isFree(bridge.x, bridge.z), `can't cross at ${bridge.id}`);
  assert.ok(BRIDGES.length >= 3);
});

test('no free square is in the river or on top of a building', () => {
  const nav = valleyNav();
  for (let index = 0; index < nav.blocked.length; index += 1) {
    if (nav.blocked[index]) continue;
    const x = nav.centreX(index);
    const z = nav.centreZ(index);
    const onBridge = BRIDGES.some((bridge) => Math.hypot(x - bridge.x, z - bridge.z) < bridge.length * 0.6);
    if (!onBridge) assert.ok(!riverNear(x, z), `in the river at ${x}, ${z}`);
    if (!onBridge) assert.ok(!solidNear(x, z, TANK_RADIUS * 0.5), `in something at ${x}, ${z}`);
  }
});

test('a bridge lifts a tank up over the water, and the valley floor is nearly flat', () => {
  const main = BRIDGES.find(({ id }) => id === 'main');
  assert.ok(groundY(main.x, main.z) > heightAt(main.x, main.z) + 1);
  for (let x = PLAY.left; x <= PLAY.right; x += 8) {
    for (let z = -26; z <= PLAY.near; z += 8) assert.ok(Math.abs(heightAt(x, z)) < 2.5, `steep at ${x}, ${z}`);
  }
});

test('the flow field leads round what\'s in the way, and over the bridge to the far bank', () => {
  const nav = valleyNav();
  const goal = nav.nearestFree(-38, -21); // In the clearing beyond the river.
  const field = nav.flowTo(goal.x, goal.z);
  const route = nav.route(field, START.x, START.z, goal, 12);
  assert.deepEqual(route.at(-1), goal);
  assert.ok(route.length >= 3, 'it can\'t just go straight there');
  for (let i = 1; i < route.length - 1; i += 1) assert.ok(nav.lineClear(route[i].x, route[i].z, route[i + 1].x, route[i + 1].z), `leg ${i} goes through something`);
});

test('pointing at a house or the river means the nearest place beside it', () => {
  const nav = valleyNav();
  for (const [x, z] of [[-30.6, 10.5], [20, 11.5], [-12, -6], [44, -21]]) {
    assert.ok(!nav.isFree(x, z));
    const spot = nav.nearestFree(x, z);
    assert.ok(nav.isFree(spot.x, spot.z));
    assert.ok(Math.hypot(spot.x - x, spot.z - z) < 14, `${x},${z} is ${Math.hypot(spot.x - x, spot.z - z)} away`);
  }
});

/* ---------- the hand ---------- */

const snapshotOf = (status, reason, extra = {}) => ({ side: 'right', handOpen: status === 'open' && !extra.overlap, overlap: false, ...extra, right: { status, reason } });

test('only a hand read as open is open, and only one read as closed is closed', () => {
  assert.equal(readHand(snapshotOf('open', null)), 'open');
  assert.equal(readHand(snapshotOf('closed', 'closed')), 'closed');
  assert.equal(readHand(snapshotOf('missing', 'missing')), 'none');
  for (const reason of ['edge', 'small', 'overlap']) assert.equal(readHand(snapshotOf('closed', reason)), 'unsure', reason);
  assert.equal(readHand(snapshotOf('closed', 'closed', { overlap: true })), 'unsure');
  assert.equal(readHand(snapshotOf('open', null, { overlap: true })), 'unsure');
});

/* ---------- driving ---------- */

const closedAt = (x, z) => ({ hand: 'closed', pointer: { x, z } });
const openAt = (x, z) => ({ hand: 'open', pointer: { x, z } });

test('a closed hand drives the tank to where it points, and stops there', () => {
  const patrol = started();
  run(patrol, 6, closedAt(8, 6));
  const { tank } = patrol;
  assert.ok(Math.hypot(tank.x - 8, tank.z - 6) < 1.6, `at ${tank.x}, ${tank.z}`);
  assert.ok(tank.speed < 1);
  assert.ok(patrol.stats.driven > 10);
});

test('an open hand, a hand out of view and a hand that can\'t be read don\'t drive', () => {
  for (const input of [openAt(-6, 6), { hand: 'none', pointer: null }, { hand: 'unsure', pointer: { x: -6, z: 6 } }]) {
    const patrol = started();
    run(patrol, 2, input);
    assert.deepEqual([patrol.tank.x, patrol.tank.z], [START.x, START.z], input.hand);
  }
});

test('a hand only just closed, or just coming into view, doesn\'t set the tank off', () => {
  const patrol = started();
  run(patrol, 0.15, closedAt(START.x, START.z - 12));
  assert.equal(patrol.tank.speed, 0);
  assert.notEqual(patrol.look, 'go');
  run(patrol, 0.3, openAt(START.x, START.z - 12));
  run(patrol, 0.15, closedAt(START.x, START.z - 12));
  assert.equal(patrol.tank.speed, 0, 'starting again from nothing each time it opens');
  run(patrol, 0.3, closedAt(START.x, START.z - 12));
  assert.ok(patrol.tank.speed > 0);
  assert.equal(patrol.look, 'go');
});

test('opening the hand stops the tank nearly at once', () => {
  const patrol = started();
  run(patrol, 1, closedAt(3, -2));
  const { tank } = patrol;
  assert.ok(tank.speed > 5);
  run(patrol, 0.35, openAt(3, -2));
  assert.equal(tank.speed, 0);
});

test('whatever it\'s told, the tank never gets stuck, and ends up beside where it was sent', () => {
  const random = seeded(99);
  const patrol = started({ random });
  const nav = valleyNav();
  // No shells or other tanks needed for this.
  patrol.enemies = [];
  patrol.queue = [];
  patrol.lobIn = 1e9;
  const trips = 120;
  for (let i = 0; i < trips; i += 1) {
    const x = PLAY.left + random() * (PLAY.right - PLAY.left);
    const z = PLAY.far + random() * (PLAY.near - PLAY.far);
    const want = nav.nearestFree(x, z);
    let seconds = 0;
    while (Math.hypot(patrol.tank.x - want.x, patrol.tank.z - want.z) > 1.6 && seconds < 40) {
      patrol.update(STEP, closedAt(x, z));
      seconds += STEP;
    }
    assert.ok(seconds < 40, `trip ${i} to ${x.toFixed(1)}, ${z.toFixed(1)} from ${patrol.tank.x.toFixed(1)}, ${patrol.tank.z.toFixed(1)} didn't arrive`);
    assert.ok(nav.isFree(patrol.tank.x, patrol.tank.z) || patrol.tank.slipFor > 0, 'it ended up somewhere it can\'t be');
  }
});

test('a robot tank in the way never holds the child\'s tank up', () => {
  const patrol = started();
  const enemy = oneTankAt(patrol, 12);
  hold(patrol, enemy, START.x + 2, START.z - 12);
  enemy.stun = 100;
  run(patrol, 5, closedAt(START.x, START.z - 22));
  assert.ok(patrol.tank.z < START.z - 20, `only got to ${patrol.tank.z}`);
  assert.ok(Math.hypot(enemy.x - patrol.tank.x, enemy.z - patrol.tank.z) >= 6.5, 'it should have been pushed out of the way');
});

test('a tank starts at the bottom of the valley, and every speed is quicker than the robots', () => {
  assert.ok(START.z > 10);
  for (const { drive, enemy } of Object.values(PACES)) assert.ok(drive > enemy * 2);
});

/* ---------- firing ---------- */

test('an open hand on a tank in range fires by itself, and stops it', () => {
  const patrol = started();
  const log = eventsOf(patrol);
  const enemy = oneTankAt(patrol, GUN.range - 4);
  run(patrol, 6, () => openAt(enemy.x, enemy.z));
  assert.equal(enemy.hp, 0);
  assert.notEqual(enemy.state, 'rolling');
  assert.equal(patrol.stats.stopped, 1);
  assert.ok(log.count('shot') >= enemy.maxHp);
  assert.equal(log.count('hit'), enemy.maxHp);
  assert.equal(log.count('stopped'), 1);
});

test('out of range it doesn\'t fire, and the crosshair says so', () => {
  const patrol = started();
  const log = eventsOf(patrol);
  const enemy = oneTankAt(patrol, GUN.range + 12);
  run(patrol, 2, () => openAt(enemy.x, enemy.z));
  assert.equal(log.count('shot'), 0);
  assert.equal(patrol.locked?.id, enemy.id);
  assert.equal(patrol.look, 'far');
  assert.equal(patrol.firing, false);
});

test('a closed hand on a tank doesn\'t fire, and neither does a hand out of view or one that can\'t be read', () => {
  for (const hand of ['closed', 'none', 'unsure']) {
    const patrol = started();
    const log = eventsOf(patrol);
    const enemy = oneTankAt(patrol, 20);
    run(patrol, 2, () => ({ hand, pointer: hand === 'none' ? null : { x: enemy.x, z: enemy.z } }));
    assert.equal(log.count('shot'), 0, hand);
    assert.equal(enemy.hp, enemy.maxHp, hand);
  }
});

test('driving at a robot tank stops well short of it, within reach of the gun', () => {
  const patrol = started();
  const enemy = oneTankAt(patrol, GUN.range + 12);
  run(patrol, 4, () => closedAt(enemy.x, enemy.z));
  assert.ok(patrol.inRange(enemy));
  assert.ok(patrol.tank.speed < 1);
  assert.ok(Math.hypot(enemy.x - patrol.tank.x, enemy.z - patrol.tank.z) > GUN.range * 0.6);
});

test('open, drive nearer, and open again: that\'s how a tank out of range gets stopped', () => {
  const patrol = started();
  const enemy = oneTankAt(patrol, GUN.range + 10);
  run(patrol, 1, () => openAt(enemy.x, enemy.z));
  assert.equal(enemy.hp, enemy.maxHp);
  run(patrol, 2, () => closedAt(enemy.x, enemy.z));
  assert.ok(patrol.inRange(enemy));
  run(patrol, 5, () => openAt(enemy.x, enemy.z));
  assert.notEqual(enemy.state, 'rolling');
});

test('the turret swings to the crosshair with an open hand, and it fires only once it\'s on target', () => {
  const patrol = started();
  const log = eventsOf(patrol);
  const enemy = oneTankAt(patrol, 18);
  hold(patrol, enemy, patrol.tank.x, patrol.tank.z + 18);
  patrol.tank.turret = 0; // Facing the other way.
  patrol.update(STEP, openAt(enemy.x, enemy.z));
  assert.equal(log.count('shot'), 0);
  run(patrol, 0.8, () => openAt(enemy.x, enemy.z));
  assert.ok(log.count('shot') > 0);
  assert.ok(Math.abs(Math.cos(patrol.tank.turret) + 1) < 0.1);
});

test('the crosshair is pulled onto a tank near it, by as much as Reach help says', () => {
  const place = (help) => {
    const patrol = started({ help });
    const enemy = oneTankAt(patrol, 18);
    const gap = enemy.size + AIM_HELP.little.radius * 0.8;
    run(patrol, 1, () => openAt(enemy.x + gap, enemy.z));
    return { locked: patrol.locked === enemy, off: Math.hypot(patrol.crosshair.x - enemy.x, patrol.crosshair.z - enemy.z) };
  };
  const [none, little, lots] = ['none', 'little', 'lots'].map(place);
  assert.equal(none.locked, false);
  assert.equal(little.locked, true);
  assert.equal(lots.locked, true);
  assert.ok(lots.off < little.off);
  assert.ok(little.off < none.off);
});

test('a hand that wanders a little stays on its target, rather than flicking between two', () => {
  const patrol = started({ tanks: 2 });
  const [a, b] = [patrol.enemies[0], patrol.enemies[1]];
  patrol.queue = [];
  patrol.total = 2;
  hold(patrol, a, START.x - 8, START.z - 14);
  hold(patrol, b, START.x + 8, START.z - 14);
  run(patrol, 0.5, () => openAt(START.x - 4, START.z - 14));
  assert.equal(patrol.locked?.id, a.id);
  run(patrol, 0.5, () => openAt(START.x, START.z - 14));
  assert.equal(patrol.locked?.id, a.id);
  run(patrol, 0.5, () => openAt(START.x + 8, START.z - 14));
  assert.equal(patrol.locked?.id, b.id);
});

/* ---------- the Driving setting ---------- */

test('driving by itself: an open hand on a tank out of range drives nearer, and then fires', () => {
  const patrol = started({ driving: 'auto' });
  const log = eventsOf(patrol);
  const enemy = oneTankAt(patrol, GUN.range + 14);
  run(patrol, 0.5, () => openAt(enemy.x, enemy.z));
  assert.ok(patrol.tank.speed > 1, 'it should have set off');
  assert.equal(log.count('shot'), 0);
  run(patrol, 8, () => openAt(enemy.x, enemy.z));
  assert.ok(log.count('shot') > 0);
  assert.notEqual(enemy.state, 'rolling');
});

test('driving by itself still needs a hand: it does nothing with none, one it can\'t read, or nothing to go to', () => {
  for (const input of [{ hand: 'none', pointer: null }, { hand: 'unsure', pointer: { x: START.x, z: -20 } }]) {
    const patrol = started({ driving: 'auto' });
    oneTankAt(patrol, GUN.range + 14);
    run(patrol, 1, input);
    assert.deepEqual([patrol.tank.x, patrol.tank.z], [START.x, START.z], input.hand);
  }
  const patrol = started({ driving: 'auto' });
  oneTankAt(patrol, GUN.range + 14);
  run(patrol, 1, openAt(START.x + 20, START.z + 2));
  assert.deepEqual([patrol.tank.x, patrol.tank.z], [START.x, START.z], 'open, with no tank there');
});

test('driving by itself: a closed hand drives it too, and it gets out from under a shell by itself', () => {
  const patrol = started({ driving: 'auto' });
  run(patrol, 2, closedAt(START.x - 10, START.z));
  assert.ok(patrol.tank.x < START.x - 7);
  const moved = started({ driving: 'auto' });
  const log = eventsOf(moved);
  oneTankAt(moved, GUN.range + 14);
  moved.lobIn = 0;
  moved.update(STEP, openAt(START.x + 20, START.z));
  assert.equal(moved.shells.length, 1);
  const startAt = { x: moved.tank.x, z: moved.tank.z };
  moved.level = { ...moved.level, lobEvery: [999, 999] };
  run(moved, 5, () => openAt(START.x + 20, START.z));
  assert.ok(Math.hypot(moved.tank.x - startAt.x, moved.tank.z - startAt.z) > moved.level.blast);
  assert.equal(moved.stats.hurts, 0);
  assert.equal(log.count('land'), 1);
});

/* ---------- shells ---------- */

function shellOverhead(patrol) {
  patrol.lobIn = 0;
  patrol.level = { ...patrol.level, firstLob: 0 };
  const stayOpen = { hand: 'open', pointer: { x: patrol.tank.x + 25, z: patrol.tank.z + 3 } };
  patrol.update(STEP, stayOpen);
  assert.equal(patrol.shells.length, 1);
  patrol.level = { ...patrol.level, lobEvery: [999, 999] };
  return patrol.shells[0];
}

test('a shell lands where the tank was when it was lobbed, slowly enough to be seen', () => {
  const patrol = started();
  oneTankAt(patrol, 30);
  const shell = shellOverhead(patrol);
  assert.ok(shell.seconds >= 3);
  assert.ok(Math.hypot(shell.to.x - patrol.tank.x, shell.to.z - patrol.tank.z) < 2);
  assert.equal(patrol.underShell, true);
  shell.share = 0.5;
  assert.ok(shellPoint(shell).y > 10, 'it goes over in a high arc');
});

test('a shell costs a heart if the tank is still there, and nothing if it has been driven away', () => {
  const stay = started();
  oneTankAt(stay, 30);
  const log = eventsOf(stay);
  shellOverhead(stay);
  run(stay, 4, (t) => ({ hand: t % 1 < 0.5 ? 'open' : 'closed', pointer: { x: stay.tank.x, z: stay.tank.z } }));
  assert.equal(stay.stats.hurts, 1);
  assert.equal(log.count('hurt'), 1);
  assert.equal(stay.hearts, LEVELS.gentle.hearts - 1);

  const away = started();
  oneTankAt(away, 30);
  const logAway = eventsOf(away);
  shellOverhead(away);
  run(away, 2, closedAt(START.x + 16, START.z));
  assert.equal(away.shells.length, 1);
  assert.equal(away.underShell, false, 'it\'s out from under it by now');
  run(away, 2, closedAt(START.x + 16, START.z));
  assert.equal(away.stats.hurts, 0);
  assert.equal(away.hearts, LEVELS.gentle.hearts);
  assert.equal(away.stats.dodged, 1);
  assert.equal(logAway.events.find(({ type }) => type === 'land').hit, false);
});

test('there\'s no shell until the child has had a while to get going, and not too many at once', () => {
  for (const [name, level] of Object.entries(LEVELS)) {
    const patrol = started({ level: name, tanks: 15 });
    const log = eventsOf(patrol);
    let most = 0;
    let seconds = 0;
    while (seconds < 30) {
      // Keeps moving, so it's never a rest.
      const t = seconds;
      patrol.update(STEP, closedAt(START.x + Math.sin(t) * 12, START.z - 3));
      most = Math.max(most, patrol.shells.length);
      if (t < level.firstLob - 0.05) assert.equal(log.count('lob'), 0, name);
      seconds += STEP;
    }
    assert.ok(log.count('lob') > 0, name);
    assert.ok(most <= level.inAir, name);
  }
});

/* ---------- hearts ---------- */

function lotsOfHits(patrol, times) {
  for (let i = 0; i < times; i += 1) {
    patrol.shells.push({ share: 0.999, seconds: 3, blast: 5, from: { x: 0, y: 0, z: 0 }, to: { x: patrol.tank.x, y: 0, z: patrol.tank.z } });
    patrol.update(STEP, closedAt(patrol.tank.x, patrol.tank.z));
  }
}

test('on Gentle a child can\'t lose: hearts stop at one', () => {
  const patrol = started({ level: 'gentle' });
  oneTankAt(patrol, 30);
  const log = eventsOf(patrol);
  lotsOfHits(patrol, 20);
  run(patrol, 2, closedAt(patrol.tank.x, patrol.tank.z));
  assert.equal(patrol.hearts >= 1, true);
  assert.equal(patrol.state, 'playing');
  assert.equal(log.count('lost'), 0);
});

test('on harder settings, running out ends the game, a moment later', () => {
  for (const level of ['medium', 'tough']) {
    const patrol = started({ level });
    oneTankAt(patrol, 30);
    const log = eventsOf(patrol);
    lotsOfHits(patrol, LEVELS[level].hearts);
    assert.equal(patrol.hearts, 0);
    assert.equal(patrol.state, 'playing');
    run(patrol, 1.2, closedAt(patrol.tank.x, patrol.tank.z));
    assert.equal(patrol.state, 'lost');
    assert.equal(log.count('lost'), 1);
  }
});

test('hearts come back with time', () => {
  const patrol = started();
  oneTankAt(patrol, 30);
  const log = eventsOf(patrol);
  lotsOfHits(patrol, 2);
  const after = patrol.hearts;
  patrol.level = { ...patrol.level, lobEvery: [999, 999] };
  run(patrol, LEVELS.gentle.healAfter + 0.5, (t) => closedAt(START.x + Math.sin(t) * 8, START.z - 3));
  assert.equal(patrol.hearts, after + 1);
  assert.equal(log.count('healed'), 1);
});

/* ---------- resting ---------- */

test('with the hand gone, the robots stop, the shells fizzle out, and nothing bad happens', () => {
  const patrol = started({ tanks: 6 });
  const enemy = oneTankAt(patrol, 30);
  const log = eventsOf(patrol);
  shellOverhead(patrol);
  patrol.lobIn = 0.1;
  const before = patrol.hearts;
  run(patrol, 3.2, { hand: 'none', pointer: null });
  assert.equal(patrol.resting, true);
  assert.equal(patrol.shells.length, 0);
  assert.equal(log.count('fizzle'), 1);
  const placed = { x: enemy.x, z: enemy.z };
  enemy.goal = null;
  run(patrol, 30, { hand: 'none', pointer: null });
  assert.equal(log.count('lob'), 1, 'only the one that was already on its way');
  assert.equal(patrol.hearts, before);
  assert.ok(Math.hypot(enemy.x - placed.x, enemy.z - placed.z) < 0.3, 'it should wait where it is');
});

test('a hand that stays the same for a few seconds is a rest too', () => {
  const patrol = started();
  oneTankAt(patrol, 30);
  run(patrol, 4.9, closedAt(patrol.tank.x, patrol.tank.z));
  assert.equal(patrol.resting, false);
  run(patrol, 0.4, closedAt(patrol.tank.x, patrol.tank.z));
  assert.equal(patrol.resting, true);
});

test('a hand held still while it fires isn\'t resting, and neither is one that\'s driving', () => {
  const patrol = started();
  const enemy = oneTankAt(patrol, 18);
  enemy.hp = enemy.maxHp = 100;
  run(patrol, 9, () => openAt(enemy.x, enemy.z));
  assert.equal(patrol.resting, false);
  assert.ok(patrol.firing);
});

test('a rest ends when the hand moves, and there\'s a moment before any more shells', () => {
  const patrol = started();
  oneTankAt(patrol, 30);
  const log = eventsOf(patrol);
  run(patrol, 4, { hand: 'none', pointer: null });
  assert.equal(patrol.resting, true);
  patrol.lobIn = 0;
  patrol.update(STEP, closedAt(START.x - 6, START.z));
  assert.equal(patrol.resting, false);
  assert.ok(patrol.lobIn > 2);
  assert.equal(log.count('lob'), 0);
});

/* ---------- a whole patrol ---------- */

test('tanks come a few at a time, more as others are stopped, and small ones first with a big one last', () => {
  for (const total of [6, 10, 15]) {
    const line = tanksFor(total);
    assert.equal(line.length, total);
    assert.equal(line[0], 'scout');
    assert.equal(line.at(-1), 'heavy');
  }
  const patrol = started({ tanks: 10, pace: 'fast' });
  const [first, most] = PACES.fast.out;
  // There are only so many ways in, so a few of them come in just after the rest.
  run(patrol, 6, (t) => closedAt(START.x + Math.sin(t * 3) * 6, START.z));
  assert.equal(patrol.rolling.length, first);
  let peak = 0;
  for (let i = 0; i < 10; i += 1) {
    const enemy = patrol.rolling[0];
    assert.ok(enemy, `tank ${i} is missing`);
    enemy.hp = 1;
    patrol.hit(enemy);
    // A second or two later the next is on its way.
    run(patrol, 2, (t) => closedAt(START.x + Math.sin(t * 3) * 6, START.z));
    peak = Math.max(peak, patrol.rolling.length);
    assert.ok(patrol.rolling.length <= most);
  }
  assert.equal(peak, most);
  assert.equal(patrol.stopped, 10);
});

test('a stopped tank doesn\'t explode: it rattles to a halt, its crew climbs out and waves, and it fades', () => {
  const patrol = started();
  const enemy = oneTankAt(patrol, 18);
  const log = eventsOf(patrol);
  enemy.hp = 1;
  patrol.hit(enemy);
  assert.equal(enemy.state, 'rattling');
  const seen = [enemy.state];
  for (let t = 0; t < 8; t += STEP) {
    patrol.update(STEP, closedAt(patrol.tank.x, patrol.tank.z));
    if (seen.at(-1) !== enemy.state) seen.push(enemy.state);
  }
  assert.deepEqual(seen, ['rattling', 'waving', 'fading', 'gone']);
  assert.ok(log.types().includes('crew'));
  assert.ok(!patrol.enemies.includes(enemy));
});

test('stopping them all wins, once the last crew has had time to climb out', () => {
  const patrol = started({ tanks: 6 });
  const log = eventsOf(patrol);
  // A child who drives up to each tank in turn and holds an open hand on it.
  let seconds = 0;
  let phase = 'closed';
  while (patrol.state === 'playing' && seconds < 300) {
    const [target] = patrol.rolling;
    if (target) phase = patrol.inRange(target) && patrol.tank.speed < 2 ? 'open' : patrol.inRange(target) ? phase : 'closed';
    const at = target ?? patrol.tank;
    patrol.update(STEP, { hand: phase, pointer: { x: at.x, z: at.z } });
    seconds += STEP;
    if (target && phase === 'closed' && Math.hypot(target.x - patrol.tank.x, target.z - patrol.tank.z) < GUN.range - 3) phase = 'open';
  }
  assert.equal(patrol.state, 'won', `after ${seconds} seconds, ${patrol.stopped} stopped`);
  assert.equal(patrol.stopped, 6);
  assert.equal(log.count('won'), 1);
  assert.ok(seconds < 240, `took ${seconds} seconds`);
});

test('every speed and every level can be played right through without anything going wrong', () => {
  for (const pace of Object.keys(PACES)) {
    for (const level of Object.keys(LEVELS)) {
      const patrol = started({ tanks: 10, pace, level, random: seeded(pace.length * 13 + level.length) });
      let seconds = 0;
      let closed = true;
      while (patrol.state === 'playing' && seconds < 500) {
        const [target] = patrol.rolling;
        const at = target ?? patrol.tank;
        if (target) closed = !patrol.inRange(target);
        patrol.update(STEP, { hand: closed ? 'closed' : 'open', pointer: { x: at.x, z: at.z } });
        seconds += STEP;
      }
      assert.ok(patrol.state === 'won' || (patrol.state === 'lost' && LEVELS[level].canLose), `${pace} ${level}: ${patrol.state} after ${seconds} seconds`);
      if (patrol.state === 'won') assert.equal(patrol.stopped, 10);
      assert.ok(Number.isFinite(patrol.tank.x + patrol.tank.z + patrol.tank.heading + patrol.tank.turret));
    }
  }
});

test('robot tanks never get stuck, and go on moving about, keeping off the child\'s tank and each other', () => {
  const patrol = started({ tanks: 15, pace: 'medium', random: seeded(1234) });
  const nav = valleyNav();
  patrol.level = { ...patrol.level, lobEvery: [999, 999] };
  patrol.lobIn = 999;
  const moved = new Map();
  const last = new Map();
  for (let t = 0; t < 180; t += STEP) {
    patrol.update(STEP, closedAt(START.x + Math.sin(t * 0.3) * 30, 4 + Math.cos(t * 0.21) * 16));
    for (const enemy of patrol.rolling) {
      const before = last.get(enemy);
      if (before) moved.set(enemy, (moved.get(enemy) ?? 0) + Math.hypot(enemy.x - before.x, enemy.z - before.z));
      last.set(enemy, { x: enemy.x, z: enemy.z });
      assert.ok(nav.isFree(enemy.x, enemy.z) || enemy.slipFor > 0, `${enemy.kind} at ${enemy.x}, ${enemy.z} is somewhere it can't be`);
    }
  }
  assert.ok(moved.size >= 2);
  for (const [enemy, distance] of moved) assert.ok(distance > 60, `${enemy.kind} only went ${distance}`);
});

test('nothing here looks like a promise to GameSession', () => {
  assert.equal(typeof new Patrol().then, 'undefined');
});

/* ---------- what's said ---------- */

const MOST_WORDS = 10;

test('Tank Patrol keeps its talking short, and everything it says has a voice in both languages', () => {
  const folder = new URL('../../games/tank-patrol/audio/voice/', import.meta.url);
  const lines = JSON.parse(readFileSync(new URL('lines.json', folder)));
  assert.ok(lines.length <= 12, `${lines.length} lines is a lot`);
  const ids = new Set(lines.map(({ id }) => id));
  assert.equal(ids.size, lines.length);
  for (const { id, text, ka, voice, kaVoice, kaPitch } of lines) {
    assert.ok(text.split(/\s+/).length <= MOST_WORDS, `too long: ${text}`);
    assert.match(ka, /[Ⴀ-ჿ]/, id);
    for (const language of ['en', 'ka']) assert.ok(existsSync(new URL(`${language}/${id}.ogg`, folder)), `${language}/${id}`);
    if (voice) assert.deepEqual([voice, kaVoice, kaPitch], ['am_michael', 'ka-GE-GiorgiNeural', 0], `${id} is Giraffe`);
  }
  const source = readFileSync(new URL('../../games/tank-patrol/main.js', import.meta.url), 'utf8');
  for (const { text } of lines) assert.ok(source.includes(text), `nothing says: ${text}`);
});

/* ---------- levels ---------- */

const LEVEL_NUMBERS = Array.from({ length: 10 }, (_, index) => index + 1);
// Which way is harder for each thing a level changes: up, down, or switched on.
const HARDER = { enemy: 'up', hold: 'down', standoff: 'up', lobEvery: 'down', shellSeconds: 'down', moreFirst: 'up', moreMost: 'up', inAir: 'up', dash: 'on', pairs: 'on', lead: 'up', retreat: 'on', doubleShell: 'on' };
// What the levels bring that's new, which once switched on stays on.
const NEW_THINGS = ['bolts', 'spread', 'shield', 'bubble', 'gems', 'cage', 'digger', 'heart', 'boing', 'magnet', 'sunset', 'splitter', 'slow', 'boss', 'treasure'];
for (const key of NEW_THINGS) HARDER[key] = 'on';

test('level 1 is the game as it always was, with every speed and difficulty', () => {
  for (const pace of Object.keys(PACES)) {
    for (const level of Object.keys(LEVELS)) {
      const patrol = started({ pace, level, levelNumber: 1 });
      assert.equal(patrol.pace, PACES[pace]);
      assert.equal(patrol.level, LEVELS[level]);
      assert.equal(patrol.enemySpeed, PACES[pace].enemy);
      assert.equal(patrol.shellSeconds, LEVELS[level].shellSeconds);
      assert.equal(patrol.inAir, LEVELS[level].inAir);
      assert.equal(patrol.lead, LEVELS[level].lead);
      assert.equal(patrol.mostOut, PACES[pace].out[0]);
    }
  }
  const plan = levelPlan(1);
  assert.deepEqual([plan.standoff, plan.moreFirst, plan.moreMost, plan.dash, plan.pairs, plan.retreat, plan.doubleShell], [0, 0, 0, false, false, false, 0]);
  for (const key of ['enemy', 'hold', 'lobEvery', 'shellSeconds']) assert.equal(plan[key], 1, key);
  // Exactly the numbers level 1 had before the levels brought anything new, and none of the new things.
  const before = { enemy: 1, hold: 1, standoff: 0, lobEvery: 1, shellSeconds: 1, moreFirst: 0, moreMost: 0, inAir: 0, dash: false, pairs: false, lead: 0, retreat: false, doubleShell: 0 };
  assert.deepEqual(plan, { ...before, ...Object.fromEntries(NEW_THINGS.map((key) => [key, false])) });
  for (const tanks of [6, 10, 15]) assert.deepEqual(tanksFor(tanks, plan), tanksFor(tanks));
  const patrol = started({ levelNumber: 1, tanks: 6 });
  assert.deepEqual([patrol.cages.length, patrol.powerOrder.length], [0, 0]);
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
  for (const key of ['dash', 'pairs', 'retreat', 'doubleShell']) assert.ok(LEVEL_NUMBERS.find((level) => levelPlan(level)[key]) >= 3, key);
});

test('a level never changes what a grown-up chose: hearts, Gentle, how many tanks, reach help or driving', () => {
  for (const level of LEVEL_NUMBERS) {
    const patrol = started({ levelNumber: level, tanks: 10, help: 'lots', driving: 'auto' });
    assert.equal(patrol.total, 10);
    assert.equal(patrol.hearts, LEVELS.gentle.hearts);
    assert.equal(patrol.level, LEVELS.gentle);
    assert.equal(patrol.help, AIM_HELP.lots);
    assert.equal(patrol.autoDrive, true);
    assert.equal(patrol.queue.length + patrol.enemies.length, 10);
  }
  const patrol = started({ levelNumber: 10 });
  oneTankAt(patrol, 30);
  lotsOfHits(patrol, 20);
  run(patrol, 2, closedAt(patrol.tank.x, patrol.tank.z));
  assert.equal(patrol.state, 'playing', 'Gentle still can\'t be lost');
  assert.equal(patrol.hearts, 1);
});

/**
 * A child playing: driving at the nearest robot tank with a closed hand until it's in range, then
 * opening to fire, and driving away from a shell that's coming down on them. Changing from one to the
 * other takes a moment. Counts the movements asked for: each open or close, and each new tank to aim at.
 */
function patrolLikeAChild(patrol, { switchSeconds = 0.45, dodge = true, auto = false } = {}) {
  let hand = 'closed';
  let waitFor = 0;
  let target = null;
  let movements = 0;
  let seconds = 0;
  while (patrol.state === 'playing' && seconds < 900) {
    const { tank } = patrol;
    const nearest = patrol.rolling.slice().sort((a, b) => Math.hypot(a.x - tank.x, a.z - tank.z) - Math.hypot(b.x - tank.x, b.z - tank.z))[0];
    if (nearest && nearest !== target) {
      target = nearest;
      movements += 1;
    }
    const shell = dodge && !auto && patrol.shells.find(({ to, blast, share }) => share > 0.25 && Math.hypot(tank.x - to.x, tank.z - to.z) <= blast + 1);
    let wanted = 'closed';
    let pointer = target ? { x: target.x, z: target.z } : { x: tank.x, z: tank.z };
    if (shell) {
      const dx = tank.x - shell.to.x;
      const dz = tank.z - shell.to.z;
      const gap = Math.hypot(dx, dz) || 1;
      pointer = { x: tank.x + (dx / gap) * 12, z: tank.z + (dz / gap) * 12 };
    } else if (auto || (target && patrol.inRange(target))) {
      wanted = 'open';
    }
    if (wanted !== hand) {
      waitFor += STEP;
      if (waitFor >= switchSeconds) {
        hand = wanted;
        waitFor = 0;
        movements += 1;
      }
    } else {
      waitFor = 0;
    }
    patrol.update(STEP, { hand, pointer });
    seconds += STEP;
  }
  return { seconds, perMinute: (movements / seconds) * 60, won: patrol.state === 'won' };
}

const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

test('level 10 asks no more than twice the movements a minute of level 1, and lasts no more than a third longer', () => {
  // On Gentle, so that every game gets to the end and they can be compared.
  for (const [pace, tanks] of [['slow', 6], ['medium', 10], ['fast', 15]]) {
    const play = (levelNumber) => [3, 7, 11, 19].map((seed) => patrolLikeAChild(started({ pace, tanks, levelNumber, random: seeded(seed) })));
    const first = play(1);
    const last = play(10);
    for (const game of [...first, ...last]) assert.ok(game.won, `${pace}: not finished`);
    const longer = average(last.map(({ seconds }) => seconds)) / average(first.map(({ seconds }) => seconds));
    const busier = average(last.map(({ perMinute }) => perMinute)) / average(first.map(({ perMinute }) => perMinute));
    console.log(`tank patrol ${pace}: level 10 is ${longer.toFixed(2)} times as long, with ${busier.toFixed(2)} times the movements a minute`);
    assert.ok(longer <= 1.34, `${pace}: ${longer.toFixed(2)} times as long`);
    assert.ok(busier <= 2, `${pace}: ${busier.toFixed(2)} times the movements`);
  }
});

test('on Gentle, at level 10 there\'s still at least 70% of the time to get out from under a shell', () => {
  for (const level of ['gentle']) {
    const first = started({ level, levelNumber: 1 });
    const last = started({ level, levelNumber: 10 });
    assert.ok(last.shellSeconds >= first.shellSeconds * 0.7, level);
  }
  assert.ok(started({ levelNumber: 10 }).shellSeconds >= 3, 'on Gentle, still three seconds or more');
});

test('every speed, difficulty and way of driving can be played right through at level 10', () => {
  for (const pace of Object.keys(PACES)) {
    for (const level of Object.keys(LEVELS)) {
      for (const driving of ['closed', 'auto']) {
        const patrol = started({ tanks: 10, pace, level, driving, levelNumber: 10, random: seeded(pace.length * 13 + level.length) });
        const { won } = patrolLikeAChild(patrol, { auto: driving === 'auto' });
        assert.ok(won || (patrol.state === 'lost' && LEVELS[level].canLose), `${pace} ${level} ${driving}: ${patrol.state}`);
        if (won) assert.equal(patrol.stopped, 10);
        assert.ok(Number.isFinite(patrol.tank.x + patrol.tank.z + patrol.tank.heading + patrol.tank.turret));
      }
    }
  }
});

test('at level 10 the new things really happen: dashing scouts, pairs, shells aimed ahead, running off and two shells at once', () => {
  const events = [];
  const patrol = started({ tanks: 15, levelNumber: 10, random: seeded(5), onEvent: (event) => events.push({ ...event, paired: Boolean(event.enemy?.leader) }) });
  const count = (type) => events.filter((event) => event.type === type).length;
  const log = { events, count };
  const result = patrolLikeAChild(patrol);
  assert.ok(result.won);
  assert.ok(log.count('dash') > 0, 'dashes');
  assert.ok(log.count('run-off') > 0, 'runs off');
  assert.ok(log.events.some(({ type, second }) => type === 'lob' && second), 'two shells at once');
  assert.ok(log.events.some(({ type, paired }) => type === 'spawn' && paired), 'pairs');
  assert.equal(patrol.mostOut, PACES.slow.out[1] + 2);
});

test('a pair keeps together, and a tank running off can still be chased down and stopped', () => {
  const patrol = started({ tanks: 6, levelNumber: 10, random: seeded(8) });
  const follower = patrol.enemies.find(({ leader }) => leader);
  assert.ok(follower);
  let closest = Infinity;
  for (let t = 0; t < 30; t += STEP) {
    patrol.update(STEP, closedAt(START.x + Math.sin(t) * 3, START.z));
    if (t > 8 && follower.leader?.state === 'rolling') closest = Math.min(closest, Math.hypot(follower.x - follower.leader.x, follower.z - follower.leader.z));
  }
  assert.ok(closest < 20, `${closest} apart`);

  const chase = started({ levelNumber: 10 });
  const log = eventsOf(chase);
  const enemy = oneTankAt(chase, GUN.range - 4);
  enemy.hp = 12;
  enemy.maxHp = 12;
  let gotAway = false;
  for (let t = 0; t < 6; t += STEP) {
    chase.update(STEP, openAt(enemy.x, enemy.z));
    if (log.count('run-off') && !chase.inRange(enemy)) gotAway = true;
  }
  assert.equal(log.count('run-off'), 1);
  assert.ok(gotAway, 'it got out of range');
  assert.equal(enemy.state, 'rolling');
  // Driving after it and opening again stops it.
  let seconds = 0;
  while (enemy.state === 'rolling' && seconds < 60) {
    chase.update(STEP, chase.inRange(enemy) ? openAt(enemy.x, enemy.z) : closedAt(enemy.x, enemy.z));
    seconds += STEP;
  }
  assert.notEqual(enemy.state, 'rolling');
  assert.ok(Math.max(...STANDOFF) > GUN.range);
});

test('driving by itself gets out from under two shells at once', () => {
  const patrol = started({ driving: 'auto', levelNumber: 10 });
  oneTankAt(patrol, GUN.range + 14);
  const { tank } = patrol;
  for (const dx of [0, 9]) patrol.shells.push({ share: 0.3, seconds: 3, blast: patrol.level.blast, from: { x: 0, y: 0, z: 0 }, to: { x: tank.x + dx, y: 0, z: tank.z } });
  patrol.lobIn = 999;
  run(patrol, 3, () => openAt(START.x + 20, START.z));
  assert.equal(patrol.stats.hurts, 0);
});

test('at level 10, resting still stops it all, and nothing bad happens', () => {
  const patrol = started({ levelNumber: 10, tanks: 15 });
  const log = eventsOf(patrol);
  run(patrol, 6, (t) => closedAt(START.x + Math.sin(t) * 8, START.z - 3));
  run(patrol, 3.2, { hand: 'none', pointer: null });
  assert.equal(patrol.resting, true);
  run(patrol, 2, { hand: 'none', pointer: null }); // Coming to a stop.
  const where = patrol.rolling.map(({ x, z }) => [x, z]);
  const before = { lob: log.count('lob'), hearts: patrol.hearts, dash: log.count('dash') };
  run(patrol, 30, { hand: 'none', pointer: null });
  assert.deepEqual([log.count('lob'), patrol.hearts, log.count('dash')], [before.lob, before.hearts, before.dash]);
  patrol.rolling.forEach(({ x, z }, index) => assert.ok(Math.hypot(x - where[index][0], z - where[index][1]) < 0.5));
});

/* ---------- what each level brings that's new ---------- */

/** A robot tank of a kind, alone, this far straight up the valley from the child's tank, staying put. */
function oneOfKind(patrol, kind, away) {
  const enemy = oneTankAt(patrol, away);
  const shape = KINDS[kind];
  const hp = Math.round(shape.hp * patrol.level.toughness);
  Object.assign(enemy, { kind, hp, maxHp: hp, size: shape.size, top: shape.speed, leader: null, partner: null });
  if (kind === 'shield') Object.assign(enemy, { shieldUp: true, shieldFacing: Math.PI, bonks: 0 });
  if (kind === 'digger') Object.assign(enemy, { dig: null, digs: 0 });
  if (kind === 'boss') enemy.partsOff = 0;
  patrol.lobIn = 999;
  return enemy;
}

/** Another robot tank, beside the first, for things that go from one to the next. */
function another(patrol, kind, x, z) {
  const enemy = patrol.makeEnemy(kind, { x, z });
  hold(patrol, enemy, x, z);
  patrol.enemies.push(enemy);
  patrol.total += 1;
  return enemy;
}

/** Fires at a tank with an open hand until it's stopped, or the time's up. */
function fireAt(patrol, enemy, seconds = 20) {
  for (let t = 0; t < seconds && enemy.state === 'rolling'; t += STEP) patrol.update(STEP, openAt(enemy.x, enemy.z));
}

test('level 1 has nothing new, and every other level has something new that it really switches on', () => {
  assert.deepEqual(newsAt(1), []);
  for (const level of LEVEL_NUMBERS.slice(1)) {
    const news = newsAt(level);
    assert.ok(news.length >= 1, `level ${level}`);
    for (const { key, mark, name, nameKa } of news) {
      assert.ok(levelPlan(level)[key], `${key} at level ${level}`);
      assert.ok(!levelPlan(level - 1)[key], `${key} is already on before level ${level}`);
      assert.ok(mark && name.split(' ').length <= 3, key);
      assert.match(nameKa, /[Ⴀ-ჿ]/, key);
    }
  }
  // Everything new is listed at the level it comes in.
  const listed = Object.values(NEWS).flat().map(({ key }) => key);
  for (const key of NEW_THINGS) assert.ok(listed.includes(key), key);
});

test('the new kinds of tank come in at their levels, in place of others, so the number of tanks stays the same', () => {
  for (const tanks of [6, 10, 15]) {
    for (const level of LEVEL_NUMBERS) {
      const line = tanksFor(tanks, levelPlan(level));
      assert.equal(line.length, tanks);
      assert.equal(line.includes('shield'), level >= 4, `shield, ${tanks} at ${level}`);
      assert.equal(line.includes('digger'), level >= 7, `digger, ${tanks} at ${level}`);
      assert.equal(line.includes('splitter'), level >= 9, `splitter, ${tanks} at ${level}`);
      assert.equal(line.at(-1), level >= 10 ? 'boss' : 'heavy');
    }
  }
});

test('from level 2, a stopped tank drops bolts that roll over to the child\'s tank and are counted', () => {
  const patrol = started({ levelNumber: 2 });
  const log = eventsOf(patrol);
  const enemy = oneTankAt(patrol, GUN.range - 4);
  fireAt(patrol, enemy);
  assert.equal(log.count('prizes'), 1);
  assert.ok(patrol.prizes.length >= 3);
  // They bounce where they fell for a moment, and then come over by themselves.
  run(patrol, 0.4, { hand: 'none', pointer: null });
  assert.equal(patrol.stats.bolts, 0);
  run(patrol, 4, { hand: 'none', pointer: null });
  assert.equal(patrol.prizes.length, 0);
  assert.equal(patrol.stats.bolts, log.count('prize'));
  assert.ok(patrol.stats.bolts >= 3);

  const first = started({ levelNumber: 1 });
  const none = oneTankAt(first, GUN.range - 4);
  fireAt(first, none);
  run(first, 4, { hand: 'none', pointer: null });
  assert.equal(first.stats.bolts + first.prizes.length, 0, 'level 1 is as it always was');
});

test('from level 5 a heavy drops a gem too, and before then it doesn\'t', () => {
  for (const [level, gems] of [[4, 0], [5, 1]]) {
    const patrol = started({ levelNumber: level });
    const enemy = oneOfKind(patrol, 'heavy', GUN.range - 4);
    fireAt(patrol, enemy);
    run(patrol, 5, { hand: 'none', pointer: null });
    assert.equal(patrol.stats.gems, gems, `level ${level}`);
  }
});

test('from level 3 every other tank stopped drops a crate, this level\'s new power-up first, which is picked up by driving near it', () => {
  const patrol = started({ levelNumber: 3, tanks: 6 });
  const log = eventsOf(patrol);
  const enemy = oneTankAt(patrol, GUN.range - 4);
  fireAt(patrol, enemy);
  assert.equal(log.count('crate'), 1);
  const [crate] = patrol.crates;
  assert.equal(crate.power, 'spread');
  // Driving to it picks it up, and it's the triple shot for a while.
  for (let t = 0; t < 6 && patrol.crates.length; t += STEP) patrol.update(STEP, closedAt(crate.x, crate.z));
  assert.equal(patrol.crates.length, 0);
  assert.equal(patrol.fireKind, 'spread');
  assert.equal(patrol.stats.powerUps, 1);
  assert.deepEqual(patrol.powerOrder, ['spread']);
});

test('pointing at a crate brings it over, and one that\'s left alone drifts over by itself', () => {
  const pointed = started({ levelNumber: 8 });
  const crate = pointed.dropCrate({ x: pointed.tank.x + 30, z: pointed.tank.z - 30 });
  run(pointed, 0.1, { hand: 'open', pointer: { x: crate.x, z: crate.z } });
  assert.equal(crate.zip, true);
  run(pointed, 3, { hand: 'open', pointer: { x: crate.x, z: crate.z } });
  assert.equal(pointed.crates.length, 0);
  assert.equal(pointed.fireKind, 'boing');

  const left = started({ levelNumber: 3 });
  left.dropCrate({ x: left.tank.x + 20, z: left.tank.z - 20 });
  run(left, 14, closedAt(left.tank.x, left.tank.z));
  assert.equal(left.crates.length, 0);
  assert.equal(left.fireKind, 'spread');
});

test('a power-up runs out, and waits while the child rests', () => {
  const patrol = started({ levelNumber: 3 });
  const log = eventsOf(patrol);
  patrol.powerUp('spread');
  run(patrol, 4, (t) => closedAt(START.x + Math.sin(t) * 6, START.z - 4));
  assert.equal(patrol.fireKind, 'spread');
  run(patrol, 3.2, { hand: 'none', pointer: null });
  assert.equal(patrol.resting, true);
  const left = patrol.power.fireLeft;
  run(patrol, 20, { hand: 'none', pointer: null });
  assert.equal(patrol.power.fireLeft, left, 'resting keeps it');
  run(patrol, 12, (t) => closedAt(START.x + Math.sin(t * 2) * 8, START.z - 4));
  assert.equal(patrol.fireKind, null);
  assert.equal(log.count('power-off'), 1);
});

test('the triple shot fires three balls at once, and the side ones hit another tank near the one aimed at', () => {
  const patrol = started({ levelNumber: 3 });
  const enemy = oneTankAt(patrol, GUN.range - 6);
  const near = another(patrol, 'scout', enemy.x + 7, enemy.z);
  patrol.powerUp('spread');
  const log = eventsOf(patrol);
  for (let t = 0; t < 1.5 && !log.count('hit'); t += STEP) patrol.update(STEP, openAt(enemy.x, enemy.z));
  run(patrol, 0.5, openAt(enemy.x, enemy.z));
  assert.ok(log.count('shot') >= 3);
  assert.equal(log.events.filter(({ type, side }) => type === 'shot' && side).length % 2, 0);
  assert.ok(near.hp < near.maxHp, 'the side ball hit the other tank');
});

test('a bubble shot traps a tank in a floating bubble: it can\'t move or lob, and every hit counts double', () => {
  const patrol = started({ levelNumber: 5 });
  const enemy = oneOfKind(patrol, 'heavy', GUN.range - 4);
  patrol.powerUp('bubble');
  const log = eventsOf(patrol);
  for (let t = 0; t < 3 && !log.count('bubbled'); t += STEP) patrol.update(STEP, openAt(enemy.x, enemy.z));
  assert.equal(log.count('bubbled'), 1);
  assert.ok(enemy.bubbled > 0);
  // Nothing is lobbed from inside a bubble, and it stays where it is.
  patrol.lobIn = 0;
  patrol.power.fireLeft = 0;
  const at = { x: enemy.x, z: enemy.z };
  enemy.goal = { x: enemy.x + 20, z: enemy.z };
  const hp = enemy.hp;
  run(patrol, 0.9, openAt(enemy.x, enemy.z));
  assert.equal(log.count('lob'), 0);
  assert.ok(Math.hypot(enemy.x - at.x, enemy.z - at.z) < 0.5);
  const hits = log.count('hit') - 1;
  assert.equal(hp - enemy.hp, hits * 2);
  run(patrol, 5, closedAt(patrol.tank.x, patrol.tank.z));
  assert.equal(enemy.bubbled, 0, 'the bubble goes');
});

test('a boing ball bounces on from the tank it hits to the next one, and the next', () => {
  const patrol = started({ levelNumber: 8 });
  const first = oneTankAt(patrol, GUN.range - 6);
  const second = another(patrol, 'scout', first.x + 10, first.z - 4);
  const third = another(patrol, 'scout', first.x - 10, first.z - 4);
  patrol.powerUp('boing');
  const log = eventsOf(patrol);
  for (let t = 0; t < 1 && !log.count('shot'); t += STEP) patrol.update(STEP, openAt(first.x, first.z));
  patrol.power.fireLeft = 0; // Just the one ball.
  run(patrol, 4, closedAt(patrol.tank.x, patrol.tank.z));
  assert.equal(log.count('bounce'), 2);
  for (const enemy of [first, second, third]) assert.equal(enemy.maxHp - enemy.hp, 1, enemy.kind);
});

test('a shield tank\'s shield stops shots from the front, but not from the side, and gets tired after a few', () => {
  const patrol = started({ levelNumber: 4 });
  const enemy = oneOfKind(patrol, 'shield', GUN.range - 4);
  const log = eventsOf(patrol);
  // Face on, it bonks.
  enemy.shieldFacing = Math.PI;
  run(patrol, 1.2, openAt(enemy.x, enemy.z));
  assert.ok(log.count('bonk') >= 1);
  assert.equal(enemy.hp, enemy.maxHp);
  // From the side, it's hit.
  enemy.shieldFacing = Math.PI / 2;
  enemy.bonks = 0;
  run(patrol, 1.2, openAt(enemy.x, enemy.z));
  assert.ok(enemy.hp < enemy.maxHp);
  // And from the front for long enough, the shield drops.
  enemy.shieldFacing = Math.PI;
  run(patrol, 4, openAt(enemy.x, enemy.z));
  assert.equal(enemy.shieldUp, false);
  assert.equal(log.count('shield-down'), 1);
  fireAt(patrol, enemy);
  assert.notEqual(enemy.state, 'rolling');
});

test('a shield turns to face the child\'s tank slowly, more slowly than driving round it, and not while being fired on', () => {
  const patrol = started({ levelNumber: 4 });
  const enemy = oneOfKind(patrol, 'shield', GUN.range + 10);
  enemy.shieldFacing = 0;
  run(patrol, 1, closedAt(patrol.tank.x, patrol.tank.z));
  assert.ok(Math.abs(enemy.shieldFacing) > 0.2 && Math.abs(enemy.shieldFacing) < 0.5, `${enemy.shieldFacing}`);
});

test('a digger digs down, can\'t be seen or fired at underground, and pops up nearer the child\'s tank', () => {
  const patrol = started({ levelNumber: 7 });
  const enemy = oneOfKind(patrol, 'digger', GUN.range + 12);
  const log = eventsOf(patrol);
  enemy.holdFor = 0;
  run(patrol, 0.2, openAt(enemy.x, enemy.z));
  assert.equal(log.count('dig'), 1);
  run(patrol, 1.5, openAt(enemy.x, enemy.z));
  assert.equal(patrol.hidden(enemy), true);
  assert.ok(!patrol.targets.includes(enemy));
  assert.equal(patrol.firing, false);
  run(patrol, 3, closedAt(patrol.tank.x, patrol.tank.z));
  assert.equal(log.count('pop-up'), 1);
  assert.ok(Math.hypot(enemy.x - patrol.tank.x, enemy.z - patrol.tank.z) < GUN.range + 2, 'up within reach');
  assert.equal(patrol.hidden(enemy), false);
  fireAt(patrol, enemy);
  assert.notEqual(enemy.state, 'rolling');
});

test('a splitting tank comes apart into two little ones, and counts as stopped when both are', () => {
  const patrol = started({ levelNumber: 9 });
  const enemy = oneOfKind(patrol, 'splitter', GUN.range - 4);
  const log = eventsOf(patrol);
  fireAt(patrol, enemy);
  assert.equal(log.count('split'), 1);
  const halves = patrol.rolling.filter(({ kind }) => kind === 'mini');
  assert.equal(halves.length, 2);
  assert.equal(patrol.stopped, 0);
  fireAt(patrol, halves[0]);
  assert.equal(patrol.stopped, 0, 'one half isn\'t the whole tank');
  fireAt(patrol, halves[1]);
  assert.equal(patrol.stopped, 1);
  run(patrol, 5, closedAt(patrol.tank.x, patrol.tank.z));
  assert.equal(patrol.state, 'won');
});

test('the big boss loses a cannon with each third of its hits, and leaves a treasure chest full of gold stars', () => {
  const patrol = started({ levelNumber: 10 });
  const enemy = oneOfKind(patrol, 'boss', GUN.range - 4);
  enemy.ranOff = true;
  const log = eventsOf(patrol);
  fireAt(patrol, enemy, 40);
  assert.notEqual(enemy.state, 'rolling');
  assert.deepEqual(log.events.filter(({ type }) => type === 'part-off').map(({ part }) => part), [1, 2]);
  assert.ok(patrol.prizes.some(({ type }) => type === 'chest'));
  run(patrol, 5, closedAt(patrol.tank.x, patrol.tank.z));
  assert.equal(patrol.stats.chests, 1);
  assert.equal(patrol.stats.stars, 6);
});

test('from level 6 a friend is in a cage: firing at it lets them out, which counts, and the robots let them go at the end anyway', () => {
  const patrol = started({ levelNumber: 6 });
  assert.equal(patrol.cages.length, 1);
  const [cage] = patrol.cages;
  assert.ok(patrol.targets.includes(cage));
  patrol.lobIn = 999;
  for (const enemy of patrol.rolling) hold(patrol, enemy, enemy.x, enemy.z);
  const log = eventsOf(patrol);
  let seconds = 0;
  while (cage.state === 'closed' && seconds < 30) {
    const near = Math.hypot(cage.x - patrol.tank.x, cage.z - patrol.tank.z) < GUN.range - 3;
    patrol.update(STEP, near ? openAt(cage.x, cage.z) : closedAt(cage.x, cage.z));
    seconds += STEP;
  }
  assert.equal(cage.state, 'open');
  assert.equal(patrol.stats.friends, 1);
  assert.equal(log.count('freed'), 1);
  assert.ok(!patrol.targets.includes(cage));

  const other = started({ levelNumber: 6 });
  const enemy = oneTankAt(other, GUN.range - 4);
  fireAt(other, enemy);
  assert.equal(other.cages[0].state, 'open');
  assert.equal(other.stats.friends, 0, 'only counts if the child did it');
});

test('a heart crate gives a heart back, and doesn\'t come when no heart has been lost', () => {
  const patrol = started({ levelNumber: 7, level: 'medium' });
  assert.ok(!patrol.powerOrder.slice(0, 1).includes('heart') || patrol.powerOrder[0] === 'heart');
  patrol.cratesDropped = patrol.powerOrder.indexOf('heart');
  assert.notEqual(patrol.dropCrate({ x: 0, z: 0 }).power, 'heart', 'not with every heart still there');
  lotsOfHits(patrol, 2);
  patrol.cratesDropped = patrol.powerOrder.indexOf('heart');
  assert.equal(patrol.dropCrate({ x: 0, z: 0 }).power, 'heart');
  const hearts = patrol.hearts;
  patrol.powerUp('heart');
  assert.equal(patrol.hearts, hearts + 1);
});

test('the magnet brings every prize and crate over at once, and slow motion slows the robot tanks and their shells', () => {
  const patrol = started({ levelNumber: 9 });
  patrol.dropCrate({ x: patrol.tank.x + 40, z: patrol.tank.z - 40 });
  patrol.dropPrizes({ x: patrol.tank.x - 40, z: patrol.tank.z - 40 }, 'heavy');
  patrol.powerUp('magnet');
  run(patrol, 2.2, closedAt(patrol.tank.x, patrol.tank.z));
  assert.equal(patrol.crates.length, 0);
  assert.equal(patrol.prizes.length, 0);

  // The crate was slow motion, which is the new power-up at level 9.
  assert.equal(patrol.slowing, true);
  const speed = patrol.pace.enemy * patrol.plan.enemy;
  assert.ok(Math.abs(patrol.enemySpeed - speed * 0.55) < 1e-9);
  patrol.powerUp('slow');
  patrol.shells.push({ share: 0, seconds: 3, blast: 5, from: { x: 0, y: 0, z: 0 }, to: { x: 40, y: 0, z: 0 } });
  patrol.lobIn = 999;
  run(patrol, 1, closedAt(patrol.tank.x, patrol.tank.z));
  assert.ok(Math.abs(patrol.shells[0].share - 0.2) < 0.02, `${patrol.shells[0].share}`);
});

test('at the end, prizes still on their way are counted, as they were the child\'s', () => {
  const patrol = started({ levelNumber: 10 });
  const enemy = oneOfKind(patrol, 'boss', GUN.range - 4);
  enemy.ranOff = true;
  fireAt(patrol, enemy, 40);
  const waiting = patrol.prizes.length;
  assert.ok(waiting > 0);
  patrol.finish();
  assert.equal(patrol.prizes.length, 0);
  assert.equal(patrol.stats.stars, 6);
  assert.ok(patrol.stats.bolts >= 6);
});

test('every level can be played right through at every speed, and Gentle still can\'t be lost with everything new about', () => {
  for (const levelNumber of LEVEL_NUMBERS.slice(1)) {
    for (const pace of Object.keys(PACES)) {
      const patrol = started({ tanks: 10, pace, levelNumber, random: seeded(levelNumber * 7 + pace.length) });
      const { won } = patrolLikeAChild(patrol);
      assert.ok(won, `level ${levelNumber} ${pace}: ${patrol.state}`);
      assert.equal(patrol.stopped, 10);
      assert.ok(patrol.stats.bolts > 0);
    }
  }
  const patrol = started({ levelNumber: 10, tanks: 15 });
  patrol.powerUp('spread');
  lotsOfHits(patrol, 30);
  assert.equal(patrol.hearts, 1);
  const { won } = patrolLikeAChild(patrol, { dodge: false });
  assert.ok(won);
});

test('resting at level 10 stops diggers digging and power-ups running down, and nothing bad happens', () => {
  const patrol = started({ levelNumber: 10, tanks: 15 });
  const log = eventsOf(patrol);
  patrol.powerUp('slow');
  run(patrol, 3, (t) => closedAt(START.x + Math.sin(t) * 8, START.z - 3));
  run(patrol, 5.2, { hand: 'none', pointer: null });
  assert.equal(patrol.resting, true);
  const before = { lob: log.count('lob'), dig: log.count('dig'), hearts: patrol.hearts, slow: patrol.power.slowLeft };
  run(patrol, 30, { hand: 'none', pointer: null });
  assert.deepEqual([log.count('lob'), log.count('dig'), patrol.hearts, patrol.power.slowLeft], [before.lob, before.dig, before.hearts, before.slow]);
});

test('the child\'s tank goes round the cage rather than through it, and driving at it stops short, within reach', () => {
  const quietCage = () => {
    const patrol = started({ levelNumber: 6 });
    patrol.lobIn = 999;
    for (const enemy of patrol.rolling) hold(patrol, enemy, enemy.x, enemy.z);
    return patrol;
  };
  // Driving with a closed hand pointing at the cage stops within reach of the gun.
  const patrol = quietCage();
  const [cage] = patrol.cages;
  run(patrol, 12, closedAt(cage.x, cage.z));
  const away = Math.hypot(patrol.tank.x - cage.x, patrol.tank.z - cage.z);
  assert.ok(away <= GUN.range && away > cage.size + 3, `${away} away`);
  // Driving to somewhere on the far side of it goes round it, and gets there.
  const other = quietCage();
  const [box] = other.cages;
  const beyond = other.nav.nearestFree(box.x + (box.x - START.x) * 0.5, box.z + (box.z - START.z) * 0.5);
  let closest = Infinity;
  for (let t = 0; t < 16; t += STEP) {
    other.update(STEP, closedAt(beyond.x, beyond.z));
    closest = Math.min(closest, Math.hypot(other.tank.x - box.x, other.tank.z - box.z));
  }
  assert.ok(closest >= box.size + 2.9, `came within ${closest}`);
  assert.ok(Math.hypot(other.tank.x - beyond.x, other.tank.z - beyond.z) < 4, 'and got there');
});

/* ---------- hearts at the end, the cage, diggers, bubbles and what lands after the end ---------- */

test('once the last heart has gone, a heart crate still on its way puts no heart back, and the round is lost', () => {
  const patrol = started({ levelNumber: 7, level: 'medium' });
  oneTankAt(patrol, 40);
  const log = eventsOf(patrol);
  lotsOfHits(patrol, LEVELS.medium.hearts);
  assert.equal(patrol.hearts, 0);
  // A heart crate right beside the tank, which comes straight over.
  patrol.crates.push({ id: 9999, power: 'heart', x: patrol.tank.x + 2, z: patrol.tank.z, y: 0, age: 0, zip: true, state: 'waiting' });
  run(patrol, 1.2, closedAt(patrol.tank.x, patrol.tank.z));
  assert.equal(log.count('crate-got'), 1);
  assert.equal(log.count('healed'), 0);
  assert.equal(patrol.hearts, 0);
  assert.equal(patrol.state, 'lost');
});

test('a heart whose turn comes with every heart there waits, and comes in the first crate after one has gone', () => {
  const patrol = started({ levelNumber: 7, level: 'medium' });
  oneTankAt(patrol, 40);
  patrol.cratesDropped = patrol.powerOrder.indexOf('heart');
  assert.notEqual(patrol.dropCrate({ x: 0, z: 0 }).power, 'heart', 'not with every heart there');
  lotsOfHits(patrol, 1);
  assert.equal(patrol.dropCrate({ x: 0, z: 0 }).power, 'heart', 'its turn waited');
  // Then the others carry on in turn, and the heart comes round again.
  const next = Array.from({ length: patrol.powerOrder.length }, () => patrol.dropCrate({ x: 0, z: 0 }).power);
  assert.ok(next.includes('heart'));
});

/** Random numbers whose first one puts the cage at this one of its places. */
const cageAt = (spot, seed) => {
  const rest = seeded(seed);
  let first = true;
  return () => {
    if (!first) return rest();
    first = false;
    return (spot + 0.5) / CAGE_SPOTS.length;
  };
};

test('wherever the cage is, with it in the way every tank can still get everywhere in the valley', () => {
  for (let spot = 0; spot < CAGE_SPOTS.length; spot += 1) {
    const patrol = started({ levelNumber: 6, random: cageAt(spot, 3) });
    const { nav } = patrol;
    const seen = new Uint8Array(nav.blocked.length);
    const stack = [nav.indexOf(START.x, START.z)];
    seen[stack[0]] = 1;
    while (stack.length) {
      const index = stack.pop();
      const col = index % nav.cols;
      for (const next of [col > 0 ? index - 1 : -1, col < nav.cols - 1 ? index + 1 : -1, index - nav.cols, index + nav.cols]) {
        if (next >= 0 && next < seen.length && !seen[next] && !nav.blocked[next]) {
          seen[next] = 1;
          stack.push(next);
        }
      }
    }
    const cutOff = nav.blocked.reduce((count, blocked, index) => count + (!blocked && !seen[index] ? 1 : 0), 0);
    assert.equal(cutOff, 0, `the cage at ${CAGE_SPOTS[spot].x}, ${CAGE_SPOTS[spot].z} cuts off ${cutOff} squares`);
  }
});

test('robot tanks never drive into the closed cage or stop in it, wherever it is, so it can always be aimed at, and the valley\'s own map is left alone', () => {
  const map = valleyNav().blocked.slice();
  for (let spot = 0; spot < CAGE_SPOTS.length; spot += 1) {
    for (const [levelNumber, driving] of [[6, 'closed'], [8, 'auto'], [10, 'closed']]) {
      const patrol = started({ levelNumber, tanks: 10, driving, random: cageAt(spot, levelNumber * 3 + spot) });
      const [cage] = patrol.cages;
      let closest = Infinity;
      const update = patrol.update.bind(patrol);
      patrol.update = (dt, input) => {
        update(dt, input);
        if (cage.state !== 'closed') return;
        for (const enemy of patrol.rolling) if (!patrol.hidden(enemy)) closest = Math.min(closest, Math.hypot(enemy.x - cage.x, enemy.z - cage.z) - cage.size);
      };
      const { won } = patrolLikeAChild(patrol, { auto: driving === 'auto' });
      const where = `the cage at ${CAGE_SPOTS[spot].x}, ${CAGE_SPOTS[spot].z}, level ${levelNumber}, driving ${driving}`;
      assert.ok(won, `${where}: ${patrol.state} after ${patrol.stopped} stopped`);
      assert.ok(closest > TANK_RADIUS - 0.5, `${where}: a robot tank came within ${closest.toFixed(1)} of the bars`);
    }
  }
  assert.deepEqual(valleyNav().blocked, map);
  // Once it's open, the way is clear again.
  const patrol = started({ levelNumber: 6 });
  const [cage] = patrol.cages;
  assert.equal(patrol.nav.isFree(cage.x, cage.z), false);
  patrol.openCage(cage, false);
  assert.equal(patrol.nav.isFree(cage.x, cage.z), valleyNav().isFree(cage.x, cage.z));
});

/** A digger popping up out of the ground, halfway. */
function poppingUp(patrol) {
  const enemy = oneOfKind(patrol, 'digger', GUN.range - 6);
  enemy.dig = { phase: 'up', left: 0.4 };
  return enemy;
}

test('a digger stopped on its way up comes out of the ground, and one hit hard on its way up runs off once it\'s out', () => {
  const patrol = started({ levelNumber: 7 });
  const enemy = poppingUp(patrol);
  enemy.hp = 1;
  patrol.hit(enemy, { kind: 'ball' });
  assert.equal(enemy.state, 'rattling');
  assert.equal(enemy.dig, null, 'it isn\'t left half in the ground');

  const other = started({ levelNumber: 7 });
  const digger = poppingUp(other);
  digger.hp = Math.floor(digger.maxHp / 2) + 1;
  other.hit(digger, { kind: 'ball' });
  assert.equal(digger.ranOff, true);
  run(other, 1, closedAt(other.tank.x, other.tank.z));
  assert.equal(digger.dig, null);
  assert.ok(Math.hypot(digger.goal.x - digger.x, digger.goal.z - digger.z) > 5, 'it\'s on its way somewhere else');
  run(other, 8, closedAt(other.tank.x, other.tank.z));
  assert.ok(!other.inRange(digger), 'and it got out of range');
});

test('a bubble waits while the child rests, and another bubble shot keeps it there without a fuss', () => {
  const patrol = started({ levelNumber: 5 });
  const enemy = oneOfKind(patrol, 'heavy', GUN.range - 4);
  enemy.hp = enemy.maxHp = 99;
  const log = eventsOf(patrol);
  patrol.hit(enemy, { kind: 'bubble' });
  patrol.hit(enemy, { kind: 'bubble' });
  patrol.hit(enemy, { kind: 'bubble' });
  assert.equal(log.count('bubbled'), 1);
  run(patrol, 5.2, { hand: 'none', pointer: null });
  assert.equal(patrol.resting, true);
  const left = enemy.bubbled;
  assert.ok(left > 0);
  run(patrol, 10, { hand: 'none', pointer: null });
  assert.equal(enemy.bubbled, left);
});

test('a shot still on its way when the round is over lands on nothing: it can\'t let the friend out after the count', () => {
  const patrol = started({ levelNumber: 6, level: 'medium' });
  oneTankAt(patrol, 40);
  const [cage] = patrol.cages;
  cage.hp = 1;
  patrol.shots.push({ target: cage, share: 0.2, seconds: 1, kind: 'ball', origin: { x: patrol.tank.x, z: patrol.tank.z }, from: { x: 0, y: 0, z: 0 } });
  lotsOfHits(patrol, LEVELS.medium.hearts);
  patrol.finish();
  assert.equal(patrol.state, 'lost');
  run(patrol, 2, { hand: 'none', pointer: null });
  assert.equal(cage.state, 'closed');
  assert.equal(patrol.stats.friends, 0);
});

test('hits landing together, like a triple shot\'s, are heard as one', () => {
  const sound = new PatrolSound();
  const played = [];
  sound.play = (name) => played.push(name);
  for (let i = 0; i < 3; i += 1) sound.hit();
  assert.equal(played.filter((name) => name.startsWith('hit')).length, 1);
});

/* ---------- a battle with a friend ---------- */

const battle = (settings = {}) => {
  const duel = new Duel({ random: seeded(7), ...settings });
  duel.begin();
  return duel;
};

/** The friend's tank, as their game says, this far across from this child's, and not doing anything. */
const friendAt = (duel, dx, dz = 0, extra = {}) => duel.placeFriend({ x: duel.tank.x + dx, z: duel.tank.z + dz, h: 0, a: 0, s: 0, r: 0, o: 0, n: 0, ...extra }, STEP);

test('a battle with a friend has no robot tanks, and the two tanks start apart on free ground, facing each other, out of reach of each other\'s guns', () => {
  const nav = valleyNav();
  for (const { x, z } of STARTS) assert.ok(nav.isFree(x, z), `${x}, ${z}`);
  const [host, guest] = [battle({ slot: 0 }), battle({ slot: 1 })];
  // Each game puts its own tank in its own place, and the friend's in the other.
  assert.deepEqual([host.tank.x, host.tank.z, host.friend.x, host.friend.z], [guest.friend.x, guest.friend.z, guest.tank.x, guest.tank.z]);
  for (const duel of [host, guest]) {
    assert.deepEqual([duel.enemies.length, duel.queue.length, duel.total, duel.cages.length], [0, 0, 0, 0]);
    assert.equal(duel.inRange(duel.friend), false, 'the first thing to do is drive');
    const facing = headingTo(duel.friend.x - duel.tank.x, duel.friend.z - duel.tank.z);
    assert.ok(Math.abs(wrap(duel.tank.heading - facing)) < 0.01);
  }
  // However long it goes on, nothing else comes: no robot tanks, no shells and nothing to pick up.
  run(host, 30, (t) => closedAt(STARTS[0].x + Math.sin(t) * 12, 10 + Math.cos(t * 0.7) * 8));
  assert.deepEqual([host.enemies.length, host.shells.length, host.prizes.length, host.crates.length], [0, 0, 0, 0]);
  assert.equal(host.state, 'playing');
});

test('a battle lasts 2, 3 or 4 minutes, from the host\'s number of robot tanks', () => {
  assert.deepEqual([6, 10, 15].map(battleSeconds), [120, 180, 240]);
  assert.equal(battleSeconds(undefined), BATTLE_SECONDS[10]);
});

test('a closed hand on the friend\'s tank drives up to it, and stops within reach of the gun', () => {
  const duel = battle({ pace: 'medium' });
  run(duel, 8, () => closedAt(duel.friend.x, duel.friend.z));
  assert.ok(duel.inRange(duel.friend));
  assert.ok(Math.hypot(duel.tank.x - duel.friend.x, duel.tank.z - duel.friend.z) > CLEAR * 1.5, 'well short of it');
  assert.ok(duel.stats.driven > 8);
  assert.equal(duel.stats.shots, 0, 'a closed hand never fires');
});

test('a shot of this child\'s that reaches the friend\'s tank is a hit and a point, and then the tank has its bubble for a moment, which shots bounce off', () => {
  const duel = battle();
  const log = eventsOf(duel);
  friendAt(duel, 14);
  const aim = () => openAt(duel.friend.x, duel.friend.z);
  run(duel, 1.5, aim);
  assert.equal(duel.score.mine, 1);
  assert.equal(log.count('friend-hit'), 1);
  assert.deepEqual(log.events.find(({ type }) => type === 'friend-hit').hits, 1);
  assert.equal(duel.friendSafe, true);
  // The gun keeps firing while the hand's open, and the shots bounce off the bubble.
  assert.ok(log.count('friend-bonk') >= 1);
  // The first hit landed a moment after the first shot, and its bubble lasts a little past this.
  run(duel, SAFE_SECONDS - 1.5, aim);
  assert.equal(duel.score.mine, 1, 'nothing more while it lasts');
  // Once it's gone, the next shot that gets there is another hit.
  run(duel, 1, aim);
  assert.equal(duel.score.mine, 2);
  assert.equal(duel.score.theirs, 0, 'the friend\'s hits are only theirs to say');
  // Never more than a hit for every few seconds of firing.
  run(duel, 30, aim);
  assert.ok(duel.score.mine <= 2 + Math.ceil(30 / SAFE_SECONDS), `${duel.score.mine}`);
  assert.ok(duel.score.mine >= 2 + Math.floor(30 / (SAFE_SECONDS + 1)), `${duel.score.mine}`);
});

test('a friend who is resting can still be fired at and hit, with only the bubble after a hit in the way, and an uncertain hand doesn\'t fire', () => {
  const duel = battle();
  const log = eventsOf(duel);
  // Resting from the start: the crosshair takes it, and the first shot to get there is a hit.
  friendAt(duel, 14, 0, { r: 1 });
  assert.equal(duel.friend.resting, true);
  assert.deepEqual(duel.targets, [duel.friend]);
  run(duel, 1.5, () => openAt(duel.friend.x, duel.friend.z));
  assert.equal(duel.locked, duel.friend);
  assert.equal(duel.score.mine, 1);
  assert.ok(duel.stats.shots >= 1);
  // Still resting, the bubble after the hit is all that stops the next, as when they aren't.
  assert.ok(log.count('friend-bonk') >= 1, 'shots in the bubble bounce off');
  run(duel, SAFE_SECONDS, () => openAt(duel.friend.x, duel.friend.z));
  assert.equal(duel.score.mine, 2);
  assert.equal(duel.locked, duel.friend, 'the crosshair never lets go of a friend who rests');
  // Starting to rest in the middle changes nothing either.
  friendAt(duel, 14, 0, { r: 0 });
  run(duel, SAFE_SECONDS, () => openAt(duel.friend.x, duel.friend.z));
  friendAt(duel, 14, 0, { r: 1 });
  assert.equal(duel.locked, duel.friend);
  const before = duel.score.mine;
  run(duel, SAFE_SECONDS + 1.5, () => openAt(duel.friend.x, duel.friend.z));
  assert.ok(duel.score.mine > before, `${before} then ${duel.score.mine}`);
  // A hand that can't be read, or has gone, never fires, as on a patrol.
  for (const hand of ['unsure', 'none']) {
    const shots = duel.stats.shots;
    run(duel, 4, { hand, pointer: { x: duel.friend.x, z: duel.friend.z } });
    assert.equal(duel.stats.shots, shots, hand);
  }
});

test('a hit from the friend\'s game is their point: this tank goes in its bubble for a moment, and nothing is taken away', () => {
  const duel = battle();
  const log = eventsOf(duel);
  friendAt(duel, 14);
  run(duel, 1, () => openAt(duel.friend.x, duel.friend.z));
  const { mine } = duel.score;
  const hearts = duel.hearts;
  assert.equal(duel.hitBy(1), true);
  assert.deepEqual(duel.score, { mine, theirs: 1 });
  assert.equal(duel.safe, true);
  assert.equal(log.count('hit-by'), 1);
  assert.equal(duel.hitBy(1), false, 'the same hit, heard twice, counts once');
  assert.equal(duel.hitBy(0), false);
  assert.equal(duel.hitBy(3), true, 'one missed on the way is made up by the next');
  assert.equal(duel.score.theirs, 3);
  // Nothing is lost, and the tank goes on just as it was: it fires, and it drives.
  assert.deepEqual([duel.score.mine, duel.hearts, duel.state], [mine, hearts, 'playing']);
  run(duel, SAFE_SECONDS + 0.5, () => openAt(duel.friend.x, duel.friend.z));
  assert.equal(duel.safe, false);
  assert.ok(duel.score.mine > mine);
  const before = { x: duel.tank.x, z: duel.tank.z };
  run(duel, 3, closedAt(STARTS[0].x + 2, 4));
  assert.ok(Math.hypot(duel.tank.x - before.x, duel.tank.z - before.z) > 5);
});

test('the friend\'s tank goes where their game says, and the shots it fires come over, a few at a time', () => {
  const duel = battle();
  assert.equal(friendAt(duel, 20, -6, { h: 1, a: -2, s: 6, o: 1 }), 0);
  assert.deepEqual([duel.friend.x, duel.friend.z, duel.friend.heading, duel.friend.turret, duel.friend.speed, duel.friend.open], [duel.tank.x + 20, duel.tank.z - 6, 1, -2, 6, true]);
  assert.equal(duel.friend.y, groundY(duel.friend.x, duel.friend.z));
  assert.equal(friendAt(duel, 20, -6, { n: 2 }), 2);
  assert.equal(friendAt(duel, 20, -6, { n: 2 }), 0, 'each shot once');
  assert.equal(friendAt(duel, 20, -6, { n: 40 }), 3, 'after a gap, only a few at once');
  assert.equal(friendAt(duel, 20, -6, { n: 1 }), 0, 'an older message brings back none');
});

test('the two tanks never go through each other', () => {
  const duel = battle();
  // The friend's tank drives right up against this one, from the side away from the village.
  friendAt(duel, -2, 0.5);
  run(duel, 0.2, { hand: 'none', pointer: null });
  assert.ok(Math.hypot(duel.tank.x - duel.friend.x, duel.tank.z - duel.friend.z) >= CLEAR - 0.01);
  assert.ok(valleyNav().isFree(duel.tank.x, duel.tank.z));
  // Driving straight into it, with the hand on the far side, so it isn't driving at the tank and stopping short of
  // it: it never goes into it.
  const { x, z } = duel.tank;
  friendAt(duel, 12, 0.6);
  let nearest = Infinity;
  run(duel, 4, () => {
    nearest = Math.min(nearest, Math.hypot(duel.tank.x - duel.friend.x, duel.tank.z - duel.friend.z));
    return closedAt(x + 26, z);
  });
  assert.ok(nearest >= CLEAR - 0.01, `${nearest}`);
  assert.ok(duel.stats.driven > 3, 'it did try to drive through');
});

test('at the end of a battle nobody has lost, and a shot still on its way lands on nothing', () => {
  const duel = battle();
  const log = eventsOf(duel);
  friendAt(duel, 14);
  run(duel, 0.1, () => openAt(duel.friend.x, duel.friend.z));
  assert.ok(duel.shots.length > 0, 'a shot on its way');
  duel.endBattle();
  run(duel, 1.5, () => openAt(duel.friend.x, duel.friend.z));
  assert.deepEqual([duel.score.mine, duel.state, duel.firing], [0, 'won', false]);
  assert.equal(log.count('battle-over'), 1);
  duel.endBattle();
  assert.equal(log.count('battle-over'), 1, 'it only ends once');
  // A hit the friend's game sent just before the end still counts for them, without any fuss.
  assert.equal(duel.hitBy(2), false);
  assert.equal(duel.score.theirs, 2);
  assert.equal(log.count('hit-by'), 0);
});

test('a friend who goes takes their tank with them, and nothing can be fired at it', () => {
  const duel = battle();
  friendAt(duel, 14);
  run(duel, 0.2, () => openAt(duel.friend.x, duel.friend.z));
  duel.friendGone();
  const { shots } = duel.stats;
  run(duel, 3, () => openAt(duel.friend.x, duel.friend.z));
  assert.deepEqual([duel.targets.length, duel.stats.shots, duel.locked], [0, shots, null]);
  assert.equal(friendAt(duel, 10, 0, { n: 5 }), 0, 'and it doesn\'t come back');
});

test('what a battle sends of the child\'s tank is what the server passes on, and its directions stay within a turn', () => {
  const duel = battle();
  run(duel, 6, (t) => closedAt(STARTS[0].x + Math.sin(t * 2) * 20, 6 + Math.cos(t * 3) * 14));
  const heading = duel.tank.heading + Math.PI * 6;
  assert.ok(Math.abs(wrap(heading)) <= Math.PI);
  assert.ok(Math.abs(Math.sin(wrap(heading) - heading)) < 1e-9);
  const state = { ms: 1234, x: Math.round(duel.tank.x * 100) / 100, z: Math.round(duel.tank.z * 100) / 100, h: Math.round(wrap(heading) * 1000) / 1000, a: 0.5, s: 7.5, n: 3, r: 0, o: 1 };
  assert.deepEqual(cleanTank(state), state);
});

test('a battle\'s rooms are known to both servers, and a friend\'s tank is passed on to the game', () => {
  for (const file of ['../../server/worker.js', '../../tools/race-server.mjs']) {
    assert.match(readFileSync(new URL(file, import.meta.url), 'utf8'), /const GAMES = \[[^\]]*'tank-patrol'/, file);
  }
  assert.match(readFileSync(new URL('../../core/friends.js', import.meta.url), 'utf8'), /'tank'[^\]]*\]\.includes\(message\.t\)/);
});

/* ---------- a patrol together with a friend ---------- */

/** A child's tank, as their game sends it and the server passes it on. */
const tankSent = (patrol) => cleanTank({ x: patrol.tank.x, z: patrol.tank.z, h: wrap(patrol.tank.heading), a: wrap(patrol.tank.turret), s: patrol.tank.speed, n: patrol.stats.shots, r: patrol.resting ? 1 : 0, o: patrol.hand === 'open' ? 1 : 0 });
/** What the host's game tells of its robot tanks and shells, as the server passes it on. */
const wireSent = (patrol) => cleanFoes(JSON.parse(JSON.stringify(patrol.wire())));

/**
 * Two games of a patrol together: whoever made it, whose game runs the robot tanks, and their friend. Each has
 * what happens in it written down. A hit the friend's game makes is told to the host's, unless a test loses it.
 */
function teamUp(settings = {}) {
  const both = { tags: [], losing: false, hostGone: false, sinceWire: 0 };
  const make = (slot, seed) => {
    const log = [];
    const patrol = new TeamPatrol({
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
    patrol.begin();
    return { patrol, log, count: (type, when = () => true) => log.filter((event) => event.type === type && when(event)).length };
  };
  both.host = make(0, 7);
  both.guest = make(1, 11);
  return both;
}

const noHand = () => ({ hand: 'none', pointer: null });
/** A hand that's there and moving about, without driving far or firing: a child who isn't resting. */
const busyHand = (patrol) => (t) => closedAt(patrol.tank.x + Math.sin(t * 5) * 3.5, patrol.tank.z + Math.cos(t * 5) * 3.5);

/** Both games for a while, each hearing of the other as they do through the server, the robot tanks ten times a second. */
function runTeam(both, seconds, hostHand = noHand, guestHand = noHand) {
  const [host, guest] = [both.host.patrol, both.guest.patrol];
  for (let t = 0; t < seconds; t += STEP) {
    if (!both.hostGone) {
      if (host.together) host.placeFriend(tankSent(guest), STEP);
      host.update(STEP, hostHand(t));
    }
    if (guest.together) guest.placeFriend(tankSent(host), STEP);
    guest.update(STEP, guestHand(t));
    for (const tag of both.tags.splice(0)) host.friendTagged(tag.k, tag.n);
    both.sinceWire += STEP;
    if (both.sinceWire >= 0.1 && host.together && guest.together && !both.hostGone) {
      both.sinceWire = 0;
      guest.follow(wireSent(host));
    }
  }
}

/** A child's hand, as patrolLikeAChild plays it, for a game that something else is running. */
function childHand(patrol, { switchSeconds = 0.45 } = {}) {
  let hand = 'closed';
  let waitFor = 0;
  return () => {
    const { tank } = patrol;
    const target = patrol.targets.slice().sort((a, b) => Math.hypot(a.x - tank.x, a.z - tank.z) - Math.hypot(b.x - tank.x, b.z - tank.z))[0];
    const shell = patrol.shells.find(({ to, blast, share }) => share > 0.25 && Math.hypot(tank.x - to.x, tank.z - to.z) <= blast + 1);
    let wanted = 'closed';
    let pointer = target ? { x: target.x, z: target.z } : { x: tank.x, z: tank.z };
    if (shell) {
      const dx = tank.x - shell.to.x;
      const dz = tank.z - shell.to.z;
      const gap = Math.hypot(dx, dz) || 1;
      pointer = { x: tank.x + (dx / gap) * 12, z: tank.z + (dz / gap) * 12 };
    } else if (target && patrol.inRange(target)) {
      wanted = 'open';
    }
    if (wanted !== hand) {
      waitFor += STEP;
      if (waitFor >= switchSeconds) {
        hand = wanted;
        waitFor = 0;
      }
    } else {
      waitFor = 0;
    }
    return { hand, pointer };
  };
}

/** One robot tank in the host's game, at a place, staying there, with no shells coming. */
function oneRobotAt(both, x, z) {
  const host = both.host.patrol;
  const enemy = oneTankAt(host, 30);
  hold(host, enemy, x, z);
  host.lobIn = 999;
  return enemy;
}

test('a patrol together has twice the host\'s robot tanks, the two tanks side by side on free ground, and only the host\'s game runs the robot tanks', () => {
  const nav = valleyNav();
  for (const { x, z } of TEAM_STARTS) assert.ok(nav.isFree(x, z), `${x}, ${z}`);
  assert.ok(Math.hypot(TEAM_STARTS[0].x - TEAM_STARTS[1].x, TEAM_STARTS[0].z - TEAM_STARTS[1].z) > CLEAR * 1.5, 'with room between them');
  assert.deepEqual([6, 10, 15].map(teamTanks), [12, 20, 30]);
  assert.equal(teamTanks(undefined), 12);
  const both = teamUp({ tanks: 6 });
  const [host, guest] = [both.host.patrol, both.guest.patrol];
  // Each game puts its own tank in its own place, and the friend's in the other, both facing up the valley.
  assert.deepEqual([host.tank.x, host.tank.z, host.friend.x, host.friend.z], [guest.friend.x, guest.friend.z, guest.tank.x, guest.tank.z]);
  assert.deepEqual([host.tank.heading, guest.tank.heading], [0, 0]);
  // The plain patrol on Gentle, whatever anyone's own level or difficulty: nothing a level brings, and it can't be lost.
  for (const patrol of [host, guest]) {
    assert.deepEqual([patrol.total, patrol.left, patrol.levelNumber, patrol.level.canLose, patrol.hearts], [12, 12, 1, false, 5]);
    assert.equal(Object.keys(patrol.plan).some((key) => patrol.plan[key] === true), false);
    assert.equal(patrol.cages.length, 0);
  }
  assert.deepEqual([host.runs, guest.runs], [true, false]);
  assert.ok(host.enemies.length > 0);
  assert.equal(host.enemies.length + host.queue.length, 12);
  assert.deepEqual([guest.enemies.length, guest.queue.length], [0, 0], 'none of its own');
  // A big one comes last, as on a patrol alone.
  assert.equal(host.queue.at(-1), 'heavy');
  // With two tanks to stop them, one more robot tank is about at a time.
  const alone = started({ tanks: 12 });
  assert.equal(host.mostOut, alone.mostOut + 1);
});

test('the friend\'s game shows the host\'s robot tanks: the same ones, where they are, moving smoothly between what it\'s told', () => {
  const both = teamUp({ pace: 'fast' });
  const [host, guest] = [both.host.patrol, both.guest.patrol];
  runTeam(both, 0.3);
  assert.equal(both.guest.count('spawn'), host.rolling.length, 'each comes in once');
  let biggestStep = 0;
  let furthestOut = 0;
  for (let i = 0; i < 20 * 60; i += 1) {
    const before = new Map(guest.enemies.map((enemy) => [enemy, { x: enemy.x, z: enemy.z }]));
    runTeam(both, STEP, busyHand(host), busyHand(guest));
    for (const [enemy, was] of before) biggestStep = Math.max(biggestStep, Math.hypot(enemy.x - was.x, enemy.z - was.z));
    for (const enemy of guest.rolling) {
      const theirs = host.enemies.find(({ id }) => id === enemy.id);
      if (theirs) furthestOut = Math.max(furthestOut, Math.hypot(enemy.x - theirs.x, enemy.z - theirs.z));
    }
  }
  assert.deepEqual(guest.rolling.map(({ id, kind, hp, maxHp }) => [id, kind, hp, maxHp]), host.rolling.map(({ id, kind, hp, maxHp }) => [id, kind, hp, maxHp]));
  // They've been driving about all this time, and are never far from where the host's game has them.
  assert.ok(host.rolling.some(({ z }) => z > -24), 'they have rolled in');
  assert.ok(furthestOut < 1.5, `${furthestOut} units out`);
  // And never jump: no more in a frame than a fast robot tank could drive in a few.
  assert.ok(biggestStep < 0.6, `${biggestStep} in one frame`);
  for (const enemy of guest.rolling) assert.equal(enemy.y, groundY(enemy.x, enemy.z));
  // Nothing in the friend's game ran them: no goals of their own, and no shells lobbed by it.
  assert.ok(guest.enemies.every(({ goal }) => goal === null));
});

test('a hit of the friend\'s shows on their own screen at once and counts in the host\'s game, and the robot tank they stop is stopped on both, and theirs', () => {
  const both = teamUp();
  const [host, guest] = [both.host.patrol, both.guest.patrol];
  // One robot tank, within reach of the friend's gun and out of reach of the host's.
  const enemy = oneRobotAt(both, guest.tank.x, guest.tank.z - 16);
  runTeam(both, 0.5);
  assert.equal(guest.enemies.length, 1);
  const [seen] = guest.enemies;
  assert.deepEqual([guest.inRange(seen), host.inRange(enemy)], [true, false]);
  const hits = enemy.hp;
  // The friend opens their hand on it. As the first ball lands, it shows on their screen, and the host's game hears.
  for (let i = 0; i < 300 && !both.guest.count('tag'); i += 1) runTeam(both, STEP, busyHand(host), () => openAt(seen.x, seen.z));
  assert.equal(both.guest.count('tag'), 1);
  assert.equal(seen.hp, hits - 1, 'on their own screen at once');
  assert.equal(enemy.hp, hits - 1, 'and counted by the game that runs it');
  assert.deepEqual([guest.stats.hits, host.stats.hits], [1, 0], 'it\'s the friend\'s hit, not the host\'s');
  assert.equal(both.host.count('hit', ({ friend }) => friend), 1, 'which shows on the host\'s screen as theirs');
  // They keep firing, and stop it. It rattles to a halt on both screens, and it's theirs on both.
  runTeam(both, 5, busyHand(host), () => openAt(seen.x, seen.z));
  assert.deepEqual([enemy.state === 'rolling', seen.state === 'rolling'], [false, false]);
  assert.deepEqual([host.stats.stopped, guest.stats.stopped], [1, 1]);
  assert.deepEqual([host.stoppedBy, guest.stoppedBy], [{ mine: 0, theirs: 1 }, { mine: 1, theirs: 0 }]);
  assert.deepEqual([both.host.count('stopped'), both.guest.count('stopped')], [1, 1]);
  assert.equal(guest.stats.hits, hits, 'no more hits than it took');
  // It was the only one: the patrol is won on both screens, a moment later, together.
  runTeam(both, 4, busyHand(host), busyHand(guest));
  assert.deepEqual([host.state, guest.state], ['won', 'won']);
  assert.deepEqual([both.host.count('won'), both.guest.count('won')], [1, 1]);
});

test('the host\'s hits show on the friend\'s screen as they\'re made, without counting as the friend\'s', () => {
  const both = teamUp();
  const [host, guest] = [both.host.patrol, both.guest.patrol];
  const enemy = oneRobotAt(both, host.tank.x, host.tank.z - 16);
  enemy.hp = enemy.maxHp = 6;
  runTeam(both, 0.5);
  const [seen] = guest.enemies;
  assert.equal(seen.maxHp, 6);
  runTeam(both, 2, () => openAt(enemy.x, enemy.z), busyHand(guest));
  assert.ok(host.stats.hits >= 2);
  assert.equal(seen.hp, enemy.hp);
  assert.equal(both.guest.count('hit', ({ friend }) => friend), host.stats.hits);
  assert.equal(both.guest.count('tag'), 0);
  assert.deepEqual([guest.stats.hits, guest.stats.shots], [0, 0]);
  runTeam(both, 6, () => openAt(enemy.x, enemy.z), busyHand(guest));
  assert.deepEqual([host.stoppedBy, guest.stoppedBy], [{ mine: 1, theirs: 0 }, { mine: 0, theirs: 1 }]);
  // The friend's shots, on the host's screen, go for the robot tank their turret points at, and otherwise out along it.
  const far = host.friendAim();
  assert.ok(Math.abs(Math.hypot(far.x - host.friend.x, far.z - host.friend.z) - GUN.range * 0.7) < 0.01);
});

test('a hit that never reaches the host\'s game is made up for: the robot tank\'s hits come back, and the next one tells of both', () => {
  const both = teamUp();
  const [host, guest] = [both.host.patrol, both.guest.patrol];
  const enemy = oneRobotAt(both, guest.tank.x, guest.tank.z - 16);
  enemy.hp = enemy.maxHp = 6;
  runTeam(both, 0.5);
  const [seen] = guest.enemies;
  both.losing = true;
  for (let i = 0; i < 300 && !both.guest.count('tag'); i += 1) runTeam(both, STEP, busyHand(host), () => openAt(seen.x, seen.z));
  assert.deepEqual([seen.hp, enemy.hp], [5, 6]);
  // For a moment the friend's screen keeps their hit, while the host's game might still be about to count it.
  runTeam(both, 0.5, busyHand(host), busyHand(guest));
  assert.equal(seen.hp, 5);
  runTeam(both, 1.5, busyHand(host), busyHand(guest));
  assert.equal(seen.hp, 6, 'it never got there');
  both.losing = false;
  const tagsBefore = both.guest.count('tag');
  for (let i = 0; i < 300 && both.guest.count('tag') === tagsBefore; i += 1) runTeam(both, STEP, busyHand(host), () => openAt(seen.x, seen.z));
  assert.equal(enemy.hp, 4, 'both hits, now');
  runTeam(both, 0.3, busyHand(host), busyHand(guest));
  assert.equal(seen.hp, 4);
});

test('a robot tank the friend has just stopped isn\'t fired at again while the host\'s game catches up', () => {
  const both = teamUp();
  const [host, guest] = [both.host.patrol, both.guest.patrol];
  const enemy = oneRobotAt(both, guest.tank.x, guest.tank.z - 16);
  enemy.hp = enemy.maxHp = 1;
  runTeam(both, 0.5);
  const [seen] = guest.enemies;
  both.losing = true;
  for (let i = 0; i < 300 && !both.guest.count('tag'); i += 1) runTeam(both, STEP, busyHand(host), () => openAt(seen.x, seen.z));
  assert.equal(seen.hp, 0);
  assert.deepEqual([guest.targets.length, guest.locked], [0, null]);
  const { shots } = guest.stats;
  runTeam(both, 0.8, busyHand(host), () => openAt(seen.x, seen.z));
  assert.equal(guest.stats.shots, shots);
  assert.equal(seen.state, 'rolling', 'only the host\'s game says it\'s stopped');
});

test('shells come for each tank in turn, as often for each as on a patrol alone, and each game shows them all', () => {
  const both = teamUp();
  const [host, guest] = [both.host.patrol, both.guest.patrol];
  oneRobotAt(both, 0, -20);
  host.lobIn = 0;
  runTeam(both, 60, busyHand(host), busyHand(guest));
  const lobs = both.host.log.filter(({ type }) => type === 'lob');
  assert.ok(lobs.length >= 12, `${lobs.length} shells in a minute`);
  const whose = lobs.map(({ shell }) => (shell.target === host.tank ? 'host' : 'friend'));
  assert.deepEqual(whose, whose.map((_, index) => (index % 2 ? 'friend' : 'host')), 'turn and turn about, whoever made the patrol first');
  // Two can be on their way at once, one for each, but never two for the same tank.
  assert.equal(host.inAir, started().inAir + 1);
  // The friend's game shows each of them, coming for the same tank.
  const shown = both.guest.log.filter(({ type }) => type === 'lob');
  assert.ok(shown.length >= lobs.length - 1);
  shown.forEach(({ shell }, index) => {
    assert.equal(shell.target === guest.tank, whose[index] === 'friend', `shell ${index}`);
    assert.equal(shell.id, lobs[index].shell.id);
    assert.deepEqual([shell.to.x, shell.to.z, shell.seconds], [Math.round(lobs[index].shell.to.x * 100) / 100, Math.round(lobs[index].shell.to.z * 100) / 100, Math.round(lobs[index].shell.seconds * 100) / 100]);
  });
  // Each lands once in each game.
  assert.ok(Math.abs(both.host.count('land') - both.guest.count('land')) <= 1);
  assert.equal(both.guest.count('fizzle'), 0);
});

test('a shell only hurts the tank it comes down on, on that child\'s own screen, and never one whose child is resting', () => {
  const both = teamUp();
  const [host, guest] = [both.host.patrol, both.guest.patrol];
  oneRobotAt(both, 0, -20);
  // The friend's turn for a shell. They stay where they are, with their hand there, and it lands on them.
  Object.assign(host, { lobTurn: 1, lobIn: 0 });
  runTeam(both, 0.3, busyHand(host), () => openAt(30, 0));
  // Never two on their way to the same tank, as on Gentle there's only ever one to get out from under: another turn
  // of theirs, with this one still coming, is passed on to the other child.
  Object.assign(host, { lobTurn: 1, lobIn: 0 });
  runTeam(both, STEP, busyHand(host), () => openAt(30, 0));
  assert.equal(host.shells.length, 1, 'no second one for the same tank');
  assert.equal(host.lobTurn, 0, 'the turn has passed on');
  host.lobIn = 999;
  assert.equal(host.shells[0].target, host.friend);
  assert.equal(guest.shells.length, 1);
  assert.equal(guest.shells[0].target, guest.tank);
  assert.equal(guest.underShell, true, 'the ring is under their tank');
  assert.equal(host.underShell, false);
  runTeam(both, 5, busyHand(host), (t) => openAt(30, Math.sin(t * 4) * 4));
  assert.deepEqual([host.hearts, guest.hearts], [5, 4]);
  assert.deepEqual([both.host.count('hurt'), both.guest.count('hurt')], [0, 1]);
  assert.deepEqual([both.host.count('land'), both.guest.count('land')], [1, 1], 'it lands on both screens');
  // The next is for the friend again. This time they put their hand down, and before it lands they're resting:
  // it fizzles on both screens, and nothing happens to them.
  Object.assign(host, { lobTurn: 1, lobIn: 0 });
  runTeam(both, 0.3, busyHand(host), () => openAt(30, 0));
  host.lobIn = 999;
  assert.equal(guest.shells.length, 1);
  runTeam(both, 3.4, busyHand(host), noHand);
  assert.equal(guest.resting, true);
  assert.deepEqual([host.shells.length, guest.shells.length], [0, 0]);
  assert.deepEqual([both.host.count('fizzle'), both.guest.count('fizzle')], [1, 1]);
  runTeam(both, 2, busyHand(host), noHand);
  assert.deepEqual([both.host.count('hurt'), both.guest.count('hurt')], [0, 1]);
  assert.ok(guest.hearts >= 4, 'and the one that was lost comes back with time, as ever');
  assert.deepEqual([both.host.count('land'), both.guest.count('land')], [1, 1], 'and it never lands');
  // One for the friend that comes down on this child's tank counts if they had a hand to drive away with, and never while resting.
  const overMe = { to: { x: host.tank.x, z: host.tank.z }, blast: 5, target: host.friend };
  assert.equal(host.struckBy(overMe), true);
  assert.equal(host.struckBy({ ...overMe, to: { x: host.tank.x + 9, z: host.tank.z } }), false);
  host.goneFor = 0.5;
  assert.equal(host.struckBy(overMe), false);
  assert.equal(host.struckBy({ ...overMe, target: host.tank }), true, 'its own still does, as on a patrol alone');
  host.resting = true;
  assert.equal(host.struckBy({ ...overMe, target: host.tank }), false);
});

test('while one child rests, the other goes on with no more shells than before, and the robot tanks only wait when both are resting', () => {
  const both = teamUp();
  const [host, guest] = [both.host.patrol, both.guest.patrol];
  const enemy = oneRobotAt(both, 0, -20);
  runTeam(both, 3.5, busyHand(host), noHand);
  assert.deepEqual([host.resting, guest.resting, host.friend.resting], [false, true, true]);
  assert.deepEqual([host.paused, guest.paused], [false, false], 'the robot tanks keep going for the one who\'s playing');
  // The robot tank goes by the tank of the child who's playing.
  assert.equal(host.tankFor(enemy), host.tank);
  host.lobIn = 0;
  const from = both.host.log.length;
  runTeam(both, 60, busyHand(host), noHand);
  const lobs = both.host.log.slice(from).filter(({ type }) => type === 'lob');
  assert.ok(lobs.length >= 5, `${lobs.length} shells`);
  assert.ok(lobs.every(({ shell }) => shell.target === host.tank), 'never for the one who\'s resting');
  // No more often than on a patrol alone on Gentle, where there are at least 6 seconds between them.
  const times = both.host.log.slice(from).map((event, index) => (event.type === 'lob' ? index : -1)).filter((index) => index >= 0);
  assert.ok(lobs.length <= 60 / 6 + 1, `${lobs.length} in a minute`);
  assert.ok(times.length === lobs.length);
  // The host rests too: now the robot tanks wait, on both screens, and nothing more comes over.
  enemy.goal = null;
  enemy.holdFor = 0;
  runTeam(both, 3.5);
  assert.deepEqual([host.resting, host.paused, guest.paused], [true, true, true]);
  const placed = { x: enemy.x, z: enemy.z };
  const lobbed = both.host.count('lob');
  host.lobIn = 0;
  runTeam(both, 20);
  assert.equal(both.host.count('lob'), lobbed);
  assert.ok(Math.hypot(enemy.x - placed.x, enemy.z - placed.z) < 0.3, 'it waits where it is');
  assert.deepEqual([host.shells.length, guest.shells.length], [0, 0]);
  // The friend picks their hand up again: off the robot tanks go, and there's a moment before a shell for either.
  runTeam(both, 0.5, noHand, busyHand(guest));
  assert.deepEqual([guest.resting, host.paused, guest.paused], [false, false, false]);
  assert.ok(host.lobIn > 1.5);
  assert.equal(host.tankFor(enemy), host.friend);
});

test('the robot tanks keep off both tanks, and each goes by the nearer one, without changing its mind at every step', () => {
  const both = teamUp({ pace: 'fast' });
  const [host, guest] = [both.host.patrol, both.guest.patrol];
  runTeam(both, 40, busyHand(host), busyHand(guest));
  let nearest = Infinity;
  let changes = 0;
  const after = new Map();
  for (let i = 0; i < 40 * 60; i += 1) {
    runTeam(both, STEP, busyHand(host), busyHand(guest));
    for (const enemy of host.rolling) {
      for (const tank of [host.tank, host.friend]) nearest = Math.min(nearest, Math.hypot(enemy.x - tank.x, enemy.z - tank.z));
      if (after.has(enemy) && after.get(enemy) !== enemy.after) changes += 1;
      after.set(enemy, enemy.after);
    }
  }
  assert.ok(nearest > 6, `${nearest} units from a child's tank`);
  assert.ok(changes <= host.rolling.length * 3, `${changes} changes of mind`);
  assert.deepEqual(host.childTanks, [host.tank, host.friend]);
  // The two children's tanks keep out of each other's way too, as in a battle: the friend's drives right up
  // against this one, from the side the village is on.
  const fresh = teamUp().host.patrol;
  fresh.placeFriend({ x: fresh.tank.x + 2, z: fresh.tank.z + 0.5, h: 0, a: 0, s: 0, r: 0, o: 0, n: 0 }, STEP);
  fresh.update(STEP, noHand());
  assert.ok(Math.hypot(fresh.tank.x - fresh.friend.x, fresh.tank.z - fresh.friend.z) >= TEAM_CLEAR - 0.01);
  assert.ok(valleyNav().isFree(fresh.tank.x, fresh.tank.z));
  // Far enough apart that one tank is never over the other, whichever way each faces: more than the longest way across one.
  assert.ok(TEAM_CLEAR > Math.hypot(7.8, 5.4));
  assert.ok(Math.hypot(TEAM_STARTS[0].x - TEAM_STARTS[1].x, TEAM_STARTS[0].z - TEAM_STARTS[1].z) > TEAM_CLEAR);
});

test('a robot tank sticks with the child\'s tank it goes by until the other is clearly nearer, and doesn\'t choose somewhere within reach of the other\'s gun', () => {
  const both = teamUp();
  const host = both.host.patrol;
  const { tank, friend } = host;
  const robotAt = (x, z, after) => ({ x, z, after });
  const between = (tank.x + friend.x) / 2;
  // Half way between the two, a little nearer one: it's that one's.
  assert.equal(host.tankFor(robotAt(between - 0.5, tank.z - 20)), tank);
  assert.equal(host.tankFor(robotAt(between + 0.5, tank.z - 20)), friend);
  // Having gone by one, a little nearer the other isn't enough to change, and a lot nearer is.
  assert.equal(host.tankFor(robotAt(between + 2, tank.z - 20, 'mine')), tank);
  assert.equal(host.tankFor(robotAt(between - 2, tank.z - 20, 'friend')), friend);
  assert.equal(host.tankFor(robotAt(friend.x, tank.z - 12, 'mine')), friend);
  assert.equal(host.tankFor(robotAt(tank.x, tank.z - 12, 'friend')), tank);

  // The friend's tank is off to one side, up the valley, where robot tanks keeping their distance from the host's
  // would often go. One that goes by the host's tank still keeps out of reach of the friend's gun.
  host.placeFriend({ x: tank.x + 28, z: tank.z - 14, h: 0, a: 0, s: 0, r: 0, o: 0, n: 0 }, STEP);
  const [enemy] = host.rolling;
  host.enemies = [enemy];
  let within = 0;
  for (let i = 0; i < 300; i += 1) {
    Object.assign(enemy, { x: tank.x, z: tank.z - 30, after: 'mine', leader: null, goal: null });
    host.chooseGoal(enemy);
    assert.equal(host.tankFor(enemy), tank);
    assert.ok(Math.hypot(enemy.goal.x - tank.x, enemy.goal.z - tank.z) > GUN.range * 0.8, 'out of the host\'s reach, as ever');
    if (Math.hypot(enemy.goal.x - friend.x, enemy.goal.z - friend.z) <= GUN.range * 0.8) within += 1;
  }
  assert.ok(within <= 3, `${within} of 300 places were within reach of the friend's gun`);
});

test('a patrol together can be played right through at every speed: both games agree on every count, both win together, and nobody can lose', () => {
  for (const [pace, tanks] of [['slow', 6], ['medium', 10], ['fast', 15]]) {
    const both = teamUp({ pace, tanks });
    const [host, guest] = [both.host.patrol, both.guest.patrol];
    const hands = [childHand(host), childHand(guest)];
    let seconds = 0;
    let wonApart = 0;
    while ((host.state === 'playing' || guest.state === 'playing') && seconds < 1500) {
      runTeam(both, 0.5, ...hands);
      seconds += 0.5;
      if (host.state !== guest.state) wonApart += 0.5;
    }
    const total = teamTanks(tanks);
    assert.deepEqual([host.state, guest.state], ['won', 'won'], `${pace}, after ${seconds} seconds`);
    assert.ok(wonApart <= 1, `${pace}: they finish together, not ${wonApart} seconds apart`);
    assert.deepEqual([host.stats.stopped, guest.stats.stopped, host.left, guest.left], [total, total, 0, 0], pace);
    assert.equal(host.stoppedBy.mine + host.stoppedBy.theirs, total, pace);
    assert.deepEqual(guest.stoppedBy, { mine: host.stoppedBy.theirs, theirs: host.stoppedBy.mine }, pace);
    assert.ok(host.stoppedBy.mine > 0 && host.stoppedBy.theirs > 0, `${pace}: both had some to stop, ${JSON.stringify(host.stoppedBy)}`);
    assert.deepEqual([both.host.count('stopped'), both.guest.count('stopped')], [total, total], pace);
    // Every hit the host's game counted for the friend was one the friend's game made.
    const counted = both.host.count('hit', ({ friend }) => friend);
    assert.ok(counted > 0 && counted <= guest.stats.hits, `${pace}: ${counted} counted of ${guest.stats.hits} made`);
    assert.ok(guest.stats.hits - counted <= total, `${pace}: ${guest.stats.hits - counted} hits landed on a tank already stopped`);
    // Shells came for both, nobody lost, and the friend's game never ran anything of its own.
    assert.ok(both.host.count('lob') > 2 && both.guest.count('lob') > 2, pace);
    assert.ok(host.hearts >= 1 && guest.hearts >= 1, pace);
    assert.deepEqual([both.host.count('lost'), both.guest.count('lost'), guest.runs], [0, 0, false], pace);
    assert.ok(seconds < 600, `${pace}: ${seconds} seconds`);
  }
});

test('a friend who goes leaves the one who made the patrol to finish it, with half of what was left', () => {
  const both = teamUp({ tanks: 6 });
  const [host, guest] = [both.host.patrol, both.guest.patrol];
  const hands = [childHand(host), childHand(guest)];
  while (host.stats.stopped < 3) runTeam(both, 0.5, ...hands);
  Object.assign(host, { lobTurn: 1, lobIn: 0 });
  runTeam(both, 0.2, ...hands);
  const [stopped, out] = [host.stats.stopped, host.rolling.length];
  const left = Math.max(out, Math.ceil((12 - stopped) / 2));
  host.friendGone();
  assert.deepEqual([host.together, host.friend.state], [false, 'gone']);
  assert.deepEqual([host.total, host.left, host.queue.length], [stopped + left, left, left - out]);
  if (host.queue.length) assert.equal(host.queue.at(-1), 'heavy', 'the big one still comes last');
  assert.ok(host.shells.every(({ target }) => target === host.tank), 'a shell on its way to their tank goes with it');
  assert.deepEqual(host.childTanks, [host.tank]);
  host.friendGone();
  assert.equal(host.total, stopped + left, 'only once');
  // Nothing more comes from the friend's game, and the host finishes it by themselves.
  both.tags.length = 0;
  const hand = childHand(host);
  for (let t = 0; t < 600 && host.state === 'playing'; t += STEP) host.update(STEP, hand());
  assert.equal(host.state, 'won');
  assert.deepEqual([host.stats.stopped, host.left], [stopped + left, 0]);
  assert.equal(host.stoppedBy.mine + host.stoppedBy.theirs, stopped + left);
});

test('if whoever made the patrol goes, the friend\'s game takes the robot tanks over as they are, and the patrol can still be won', () => {
  const both = teamUp({ tanks: 6 });
  const [host, guest] = [both.host.patrol, both.guest.patrol];
  const hands = [childHand(host), childHand(guest)];
  while (host.stats.stopped < 3) runTeam(both, 0.5, ...hands);
  runTeam(both, 0.3, ...hands);
  const was = guest.rolling.map(({ id, kind, x, z, hp }) => ({ id, kind, x, z, hp }));
  const [stopped, mine] = [guest.stats.stopped, guest.stoppedBy.mine];
  const out = was.filter(({ hp }) => hp > 0).length;
  const left = Math.max(out, Math.ceil((12 - stopped - (was.length - out)) / 2));
  both.hostGone = true;
  guest.friendGone();
  assert.deepEqual([guest.runs, guest.together], [true, false]);
  // The same robot tanks, where they were, with the hits they had left.
  assert.deepEqual(guest.rolling.map(({ id, kind, x, z, hp }) => ({ id, kind, x, z, hp })), was.filter(({ hp }) => hp > 0));
  assert.deepEqual([guest.left, guest.queue.length], [left, left - out]);
  if (guest.queue.length) assert.equal(guest.queue.at(-1), 'heavy');
  // Now they're this game's to run: they set off somewhere, more come, and shells come for this tank alone.
  const hand = childHand(guest);
  const from = both.guest.log.length;
  for (let t = 0; t < 600 && guest.state === 'playing'; t += STEP) guest.update(STEP, hand());
  assert.equal(guest.state, 'won');
  assert.equal(guest.left, 0);
  assert.equal(guest.stoppedBy.mine, mine + (guest.stats.stopped - stopped), 'what they stop from here is theirs');
  const since = both.guest.log.slice(from);
  assert.ok(since.filter(({ type }) => type === 'lob').every(({ shell }) => shell.target === guest.tank));
  assert.equal(since.filter(({ type }) => type === 'tag').length, 0, 'and there\'s nobody to tell of a hit');
  // Anything more from the old host's game is ignored.
  const total = guest.total;
  guest.follow(wireSent(host));
  assert.equal(guest.total, total);
});

test('a friend who goes before it has begun leaves a patrol for one, on either side', () => {
  for (const slot of [0, 1]) {
    const patrol = new TeamPatrol({ slot, runs: slot === 0, tanks: 6, level: 'gentle', random: seeded(5) });
    patrol.friendGone();
    assert.deepEqual([patrol.runs, patrol.total, patrol.rolling.length + patrol.queue.length], [true, 6, 6], `slot ${slot}`);
    patrol.begin();
    const hand = childHand(patrol);
    for (let t = 0; t < 600 && patrol.state === 'playing'; t += STEP) patrol.update(STEP, hand());
    assert.deepEqual([patrol.state, patrol.stats.stopped], ['won', 6], `slot ${slot}`);
  }
});

test('what the host\'s game tells of its robot tanks and shells is what the server passes on, and never too much for one message', () => {
  const both = teamUp({ pace: 'fast', tanks: 15 });
  const [host, guest] = [both.host.patrol, both.guest.patrol];
  host.lobIn = 0;
  runTeam(both, 12, busyHand(host), busyHand(guest));
  const wire = host.wire();
  assert.ok(wire.e.length >= 4 && wire.s.length >= 1);
  assert.deepEqual(cleanFoes({ ms: 1234, ...wire }), { ms: 1234, ...wire });
  assert.deepEqual(wire.n, [0, 30, 0, 0, 0, 0]);
  // With more robot tanks and shells than there could ever be, in the far corner, it still fits.
  const [enemy] = host.rolling;
  host.enemies = Array.from({ length: 40 }, (_, index) => ({ ...enemy, id: 999_000 + index, x: -45.55, z: -27.77, heading: -3.141, turret: -3.141, hp: 14, maxHp: 14, speed: 12.5 }));
  host.shells = Array.from({ length: 9 }, (_, index) => ({ id: 999_100 + index, share: 0.123, seconds: 3.04, blast: 5, from: { x: -45.55, y: 4, z: -27.77 }, to: { x: -45.55, y: 0, z: -27.77 }, target: host.friend, by: 999_000 }));
  const most = host.wire();
  assert.deepEqual([most.e.length, most.s.length], [MOST_FOES, MOST_SHELLS]);
  const sent = JSON.stringify({ t: 'foes', ms: 3_599_999, ...most });
  assert.ok(sent.length < MOST_BYTES, `${sent.length} characters`);
  assert.deepEqual(cleanFoes(most).e, most.e);
  // Nonsense from the other game does no harm: rows that aren't rows are passed over.
  const quiet = new TeamPatrol({ slot: 1, runs: false, random: seeded(3) });
  quiet.begin();
  quiet.follow({ e: [null, [1, 2], 'three'], s: [[1], {}], n: ['x'] });
  quiet.follow({});
  quiet.follow({ e: 'all', s: 7, n: null });
  assert.deepEqual([quiet.enemies.length, quiet.shells.length, quiet.state], [0, 0, 'playing']);
});

test('a patrol together\'s messages are passed on to the game, and its hits go from the game to the room', () => {
  const friends = readFileSync(new URL('../../core/friends.js', import.meta.url), 'utf8');
  assert.match(friends, /'foes', 'tag'\]\.includes\(message\.t\)/);
  assert.match(friends, /sendTag\(k, n\) \{\s*this\.say\(\{ t: 'tag', k, n \}\);/);
  const main = readFileSync(new URL('../../games/tank-patrol/main.js', import.meta.url), 'utf8');
  assert.match(main, /tag: \(\) => this\.friends\.sendTag\(event\.id, event\.hits\)/);
  assert.match(main, /this\.patrol\.friendTagged\(message\.k, message\.n\)/);
});

/* ---------- the challenge: Medium, how it comes, and Tough, where the shells can win ---------- */

/**
 * A made-up player. notice is how long after a shell sets off they see it's coming for them, switchSeconds how
 * long their hand takes to change, and a careless one never drives away from a shell at all. To get out from under
 * one, they drive for the nearest free place just outside where it will land.
 */
function patrolAs(patrol, { notice = 0.8, switchSeconds = 0.45, dodge = true } = {}) {
  let hand = 'closed';
  let waitFor = 0;
  for (let seconds = 0; patrol.state === 'playing' && seconds < 900; seconds += STEP) {
    const { tank } = patrol;
    const target = patrol.rolling.slice().sort((a, b) => Math.hypot(a.x - tank.x, a.z - tank.z) - Math.hypot(b.x - tank.x, b.z - tank.z))[0];
    const shell = dodge && patrol.shells.find(({ to, blast, share, seconds: over }) => share * over > notice && Math.hypot(tank.x - to.x, tank.z - to.z) <= blast + 1);
    let wanted = 'closed';
    let pointer = target ? { x: target.x, z: target.z } : { x: tank.x, z: tank.z };
    if (shell) {
      let best = null;
      for (let step = 0; step < 16; step += 1) {
        const angle = (step / 16) * Math.PI * 2;
        const x = shell.to.x + Math.cos(angle) * (shell.blast + 5);
        const z = shell.to.z + Math.sin(angle) * (shell.blast + 5);
        const gap = Math.hypot(x - tank.x, z - tank.z);
        if (patrol.nav.isFree(x, z) && (!best || gap < best.gap)) best = { x, z, gap };
      }
      pointer = best ?? pointer;
    } else if (target && patrol.inRange(target)) {
      wanted = 'open';
    }
    if (wanted !== hand) {
      waitFor += STEP;
      if (waitFor >= switchSeconds) {
        hand = wanted;
        waitFor = 0;
      }
    } else {
      waitFor = 0;
    }
    patrol.update(STEP, { hand, pointer });
  }
  return patrol.state;
}

const TANK_PLAYERS = {
  careless: { dodge: false },
  slowChild: { notice: 1.2, switchSeconds: 0.6 },
  adult: { notice: 0.6, switchSeconds: 0.3 },
  sharp: { notice: 0.3, switchSeconds: 0.15 },
};

const patrolWins = (options, player) => [3, 7, 11, 19].filter((seed) => {
  const patrol = new Patrol({ random: seeded(seed), ...options });
  patrol.begin();
  return patrolAs(patrol, TANK_PLAYERS[player]) === 'won';
}).length;

test('it comes on Medium, where the shells can win: four hearts, coming back slowly, and no stopping at one', () => {
  const patrol = new Patrol();
  assert.equal(patrol.level, LEVELS.medium);
  assert.deepEqual([LEVELS.medium.hearts, LEVELS.medium.canLose, LEVELS.medium.healAfter], [4, true, 14]);
  // A child who never drives away from a shell mostly loses, even at level 1, and a slow, careful one wins it.
  assert.ok(patrolWins({ levelNumber: 1 }, 'careless') <= 1);
  assert.equal(patrolWins({ levelNumber: 1 }, 'slowChild'), 4);
  // On Gentle, the game as it was, even the careless one gets there.
  assert.equal(patrolWins({ level: 'gentle', levelNumber: 1 }, 'careless'), 4);
});

test('level 10 on Medium needs real skill: a slow child and a fair grown-up lose it, and a sharp player wins', () => {
  assert.equal(patrolWins({ levelNumber: 10 }, 'careless'), 0);
  assert.equal(patrolWins({ levelNumber: 10 }, 'slowChild'), 0);
  assert.equal(patrolWins({ levelNumber: 10 }, 'adult'), 0);
  assert.ok(patrolWins({ levelNumber: 10 }, 'sharp') >= 3);
  for (const player of Object.keys(TANK_PLAYERS)) assert.equal(patrolWins({ level: 'gentle', levelNumber: 10 }, player), 4, `Gentle ${player}`);
});

test('on Medium and Tough the levels ramp: by level 10 shells come about twice as often and take about 60% as long', () => {
  for (const level of ['medium', 'tough']) {
    const first = started({ level, levelNumber: 1 });
    const last = started({ level, levelNumber: 10 });
    assert.equal(first.shellSeconds, LEVELS[level].shellSeconds, 'level 1 is as it always was');
    assert.ok(last.shellSeconds <= first.shellSeconds * 0.61 && last.shellSeconds >= first.shellSeconds * 0.5, `${level}: ${last.shellSeconds}`);
    const gaps = (patrol) => average(Array.from({ length: 200 }, () => patrol.lobGap()));
    assert.ok(gaps(last) <= gaps(first) * 0.55, `${level}: shells`);
    assert.ok(last.lead >= first.lead + 0.5, `${level}: shells aim further ahead`);
    assert.equal(last.challenge.healAfter, 2, 'hearts come back half as quickly');
  }
  assert.deepEqual(challengePlan(10, false), challengePlan(1, false), 'Gentle never ramps more than it did');
  assert.deepEqual(challengePlan(1, true), challengePlan(1, false), 'level 1 is the same on every setting');
});

test('at level 10 on Medium a heart takes twice as long to come back', () => {
  const patrol = started({ level: 'medium', levelNumber: 10 });
  oneTankAt(patrol, 30);
  lotsOfHits(patrol, 1);
  patrol.level = { ...patrol.level, lobEvery: [999, 999] };
  const after = patrol.hearts;
  run(patrol, LEVELS.medium.healAfter + 0.5, (t) => closedAt(START.x + Math.sin(t) * 8, START.z - 3));
  assert.equal(patrol.hearts, after);
  run(patrol, LEVELS.medium.healAfter, (t) => closedAt(START.x + Math.sin(t) * 8, START.z - 3));
  assert.equal(patrol.hearts, after + 1);
});

test('resting still stops the shells on Tough at level 10, so a child who walks away is never caught for it', () => {
  const patrol = started({ level: 'tough', levelNumber: 10 });
  run(patrol, 3.5, { hand: 'none', pointer: null });
  assert.equal(patrol.resting, true);
  const hearts = patrol.hearts;
  run(patrol, 60, { hand: 'none', pointer: null });
  assert.deepEqual([patrol.state, patrol.hearts, patrol.shells.length], ['playing', hearts, 0]);
});

test('together, on Medium, a child whose hearts run out has lost, and on Gentle hearts still stop at one', () => {
  for (const [level, lost] of [['medium', true], ['gentle', false]]) {
    const both = teamUp({ level });
    const [host, guest] = [both.host.patrol, both.guest.patrol];
    for (let i = 0; i < 6; i += 1) {
      guest.shells.push({ id: 900 + i, share: 0.999, seconds: 3, blast: 5, from: { x: 0, y: 0, z: 0 }, to: { x: guest.tank.x, y: 0, z: guest.tank.z }, target: guest.tank });
      runTeam(both, STEP, busyHand(host), busyHand(guest));
    }
    runTeam(both, 1.2, busyHand(host), busyHand(guest));
    assert.equal(guest.state === 'lost', lost, level);
    assert.equal(guest.hearts > 0, !lost, level);
    assert.equal(host.state, 'playing', 'the host hears of it from the result the friend\'s game sends');
  }
});

test('a patrol together that is lost says so in the result that goes to the friend, and the friend\'s game ends it too', () => {
  const main = readFileSync(new URL('../../games/tank-patrol/main.js', import.meta.url), 'utf8');
  assert.match(main, /this\.friends\.finished\(this\.sinceGo, \{ n: mine, w: this\.lost \? 0 : 1 \}\)/);
  assert.match(main, /this\.friends\.results\.get\(team\.friend\.id\)\?\.won !== false/);
});
