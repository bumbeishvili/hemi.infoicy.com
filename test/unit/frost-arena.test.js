// The rules of Frost Arena: what a match makes of what the player's hands ask for. How the hands are read is
// tested in frost-arena-controls.test.js, and the screen in test/e2e/frost-arena.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { AIM_ASSIST, AWAY_AFTER, BASES, BLOCKS, BODY, CRATE_SPOTS, EYES, HEALTH, LEVELS, MAGAZINE, MOST_LANDS, Match, challengePlan, NEWS, OUT_SECONDS, PLAYER, POWERS, RIFLES, TAGS_TO_WIN, TALL, WIDE, YARD, aimOf, clearLine, forwardOf, freeAt, headingTo, keptClear, levelPlan, newsAt, reachAlong, shotMeets, shotReach, stepTowards, turnBetween, wayTo } from '../../games/frost-arena/arena.js';

const STEP = 1 / 60;
const degrees = (radians) => (radians * 180) / Math.PI;
const radians = (value) => (value * Math.PI) / 180;

function seeded(seed = 7) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

/** A match that has begun, with what happens in it written down. */
function start(options = {}) {
  const events = [];
  const match = new Match({ random: seeded(options.seed ?? 7), onEvent: (event) => events.push(event), ...options });
  match.begin();
  return { match, events, count: (type, when = () => true) => events.filter((event) => event.type === type && when(event)).length };
}

// What the hands can ask for. With nothing asked, both hands are in the picture, and still.
const STILL = {};
const FIRE = { fire: true };
const FORWARDS = { moveY: 1 };

const run = (match, seconds, input = STILL) => {
  for (let i = 0; i < Math.round(seconds / STEP); i += 1) match.update(STEP, typeof input === 'function' ? input(i * STEP) : input);
};

const reds = (match) => match.troopers.filter(({ team }) => team === 1);
const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * One of the other team stands this far in front of the player, this far round to the right of straight ahead,
 * and stays there. The rest are out of the way, and nobody the computer plays does anything. The player is at
 * the near end of the alley down one side of the yard, looking up it, where there's nothing in the way.
 */
function standInFront(match, away = 10, off = 0) {
  const { child } = match;
  Object.assign(child, { x: -21, z: 13, heading: 0, vx: 0, vz: 0 });
  const [first, ...others] = reds(match);
  const way = forwardOf(child.heading + off);
  Object.assign(first, { x: child.x + way.x * away, z: child.z + way.z * away, bot: false, safeLeft: 0, shield: 0 });
  for (const other of others) Object.assign(other, { x: 20, z: -13.5, bot: false });
  for (const mate of match.troopers.filter(({ team, bot }) => team === 0 && bot)) Object.assign(mate, { x: -20, z: 13.5, bot: false });
  return first;
}

/** A rifle that goes exactly where the sights are, for tests that are about something else. */
const steady = (match) => {
  match.spreadNow = () => 0;
};

/* ---------- the yard ---------- */

test('the yard is the same from both ends, with each team\'s places on free ground facing the other', () => {
  for (const block of BLOCKS) {
    assert.ok(BLOCKS.some((other) => Math.abs(other.x + block.x) < 1e-9 && Math.abs(other.z + block.z) < 1e-9 && other.w === block.w && other.d === block.d && other.h === block.h), `${block.kind} at ${block.x}, ${block.z} has its other half`);
    assert.ok(Math.abs(block.x) + block.w / 2 < YARD.halfX && Math.abs(block.z) + block.d / 2 < YARD.halfZ, 'inside the fence');
    // Taller than a player, so what hides someone covers them.
    assert.ok(block.h > TALL, `${block.kind} is ${block.h} tall`);
  }
  for (const [team, base] of BASES.entries()) {
    for (const x of base.spots) assert.ok(freeAt(x, base.z), `team ${team} at ${x}`);
    assert.equal(Math.sign(base.z), team === 0 ? 1 : -1);
    // Facing up the yard, towards the other end.
    assert.ok(forwardOf(base.heading).z * base.z < 0);
  }
  assert.deepEqual([BASES[0].z, BASES[0].spots], [-BASES[1].z, BASES[1].spots.map((x) => (x === 0 ? 0 : -x))]);
});

test('everywhere a player can stand can be walked to from both ends, and there\'s room to get round everything', () => {
  for (const base of BASES) {
    const way = wayTo(base.spots[0], base.z);
    for (let x = -YARD.halfX + 0.5; x < YARD.halfX; x += 1) {
      for (let z = -YARD.halfZ + 0.5; z < YARD.halfZ; z += 1) {
        if (!freeAt(x, z, BODY + 0.15)) continue;
        const next = stepTowards(way, x, z);
        assert.ok(freeAt(next.x, next.z), `from ${x}, ${z}`);
      }
    }
    assert.ok(way.far.filter((far) => far >= 0).length > 44 * 30 * 0.6, 'most of the yard is open');
  }
  // Following the way from one end gets to the other, round whatever's in between.
  const way = wayTo(BASES[1].spots[0], BASES[1].z);
  let at = { x: BASES[0].spots[0], z: BASES[0].z };
  for (let i = 0; i < 200 && gap(at, way.goal) > 1; i += 1) at = stepTowards(way, at.x, at.z);
  assert.ok(gap(at, way.goal) <= 1);
});

test('what\'s in the way can\'t be seen through, and a shot goes as far as the first thing it meets: something in the way, the fence or the snow', () => {
  // The long container in the middle is between the two ends.
  assert.equal(clearLine({ x: 0, z: 8 }, { x: 0, z: -8 }), false);
  assert.equal(clearLine({ x: 0, z: 8 }, { x: 0, z: 2 }), true);
  // Down the open alley on one side, from end to end, and the same either way round.
  assert.equal(clearLine({ x: -21, z: 13 }, { x: -21, z: -13 }), true);
  assert.equal(clearLine({ x: 0, z: -8 }, { x: 0, z: 8 }), false);
  const container = BLOCKS[0];
  assert.ok(Math.abs(reachAlong({ x: 0, z: 8 }, 0) - (8 - container.d / 2)) < 0.3);
  // A shot from the eye, level, up the middle from the near end meets the container's near side.
  const eye = (x, z) => ({ x, y: EYES, z });
  const middle = shotReach(eye(0, 8), aimOf(0, 0));
  assert.deepEqual([middle.what, Math.abs(middle.far - (8 - container.d / 2)) < 1e-6], ['container', true]);
  // With nothing in the way, the fence. Aimed down, the snow, and up over the fence, nothing at all.
  const alley = shotReach(eye(-21, 13), aimOf(0, 0));
  assert.deepEqual([alley.what, Math.abs(alley.far - (13 + YARD.halfZ)) < 1e-6], ['fence', true]);
  const down = shotReach(eye(-21, 13), aimOf(0, radians(-10)));
  assert.equal(down.what, 'snow');
  assert.ok(Math.abs(down.far - EYES / Math.sin(radians(10))) < 1e-6);
  assert.equal(shotReach(eye(-21, 13), aimOf(0, radians(20))).what, 'sky');
  // Nothing in the yard is low enough to fire over at someone behind it.
  for (const block of BLOCKS) {
    const from = eye(block.x, block.z + block.d / 2 + 4);
    const behind = { x: block.x, z: block.z - block.d / 2 - 1 };
    for (let pitch = -5; pitch <= 30; pitch += 1) {
      const way = aimOf(0, radians(pitch));
      const meets = shotMeets(from, way, behind);
      if (meets !== null) assert.ok(shotReach(from, way).far < meets, `${block.kind} at ${block.x}, ${block.z}, aiming ${pitch} degrees up`);
    }
  }
});

test('a shot meets a player if it passes through where they stand, between the snow and the top of their head', () => {
  const from = { x: 0, y: EYES, z: 10 };
  const there = { x: 0, z: 0 };
  assert.ok(Math.abs(shotMeets(from, aimOf(0, 0), there) - (10 - WIDE)) < 1e-6);
  // Just inside their width it meets them, and just outside it doesn't.
  const edge = Math.asin(WIDE / 10);
  assert.ok(shotMeets(from, aimOf(edge * 0.95, 0), there) !== null);
  assert.equal(shotMeets(from, aimOf(edge * 1.06, 0), there), null);
  // Over their head, or into the snow in front of them, it doesn't.
  assert.equal(shotMeets(from, aimOf(0, radians(4)), there), null);
  assert.equal(shotMeets(from, aimOf(0, radians(-12)), there), null);
  assert.ok(shotMeets(from, aimOf(0, radians(-5)), there) !== null, 'at their knees it does');
  // Someone behind the one firing, or straight up, isn't met.
  assert.equal(shotMeets(from, aimOf(Math.PI, 0), there), null);
  assert.equal(shotMeets(from, { x: 0, y: 1, z: 0 }, there), null);
});

/* ---------- walking ---------- */

test('the stick walks the player the way they\'re facing: forwards, back and to either side, as fast as it\'s pushed', () => {
  const walked = (input, heading = 0) => {
    const { match } = start();
    standInFront(match, 25, Math.PI);
    // Out in the open, with room to walk every way.
    Object.assign(match.child, { x: -7, z: 6.5, heading });
    run(match, 1.5, input);
    return { x: match.child.x + 7, z: match.child.z - 6.5, match };
  };
  // Facing up the yard: forwards is up it, and right is to the right.
  const ahead = walked({ moveY: 1 });
  assert.ok(ahead.z < -5 && Math.abs(ahead.x) < 0.01, `${ahead.x}, ${ahead.z}`);
  const back = walked({ moveY: -1 });
  assert.ok(back.z > 3 && Math.abs(back.x) < 0.01);
  const right = walked({ moveX: 1 });
  assert.ok(right.x > 5 && Math.abs(right.z) < 0.01, `${right.x}, ${right.z}`);
  assert.ok(walked({ moveX: -1 }).x < -5);
  // Facing the other way, it's all the other way round: it goes by where they're looking.
  const turned = walked({ moveY: 1 }, Math.PI / 2);
  assert.ok(turned.x > 5 && Math.abs(turned.z) < 0.01);
  // Half way out is half as fast, and on a slant it's no faster than straight.
  assert.ok(Math.abs(walked({ moveY: 0.5 }).z / ahead.z - 0.5) < 0.05);
  const slant = walked({ moveX: 1, moveY: 1 });
  assert.ok(Math.abs(Math.hypot(slant.x, slant.z) - Math.abs(ahead.z)) < 0.2);
  // As fast as a player walks, and it's counted.
  assert.ok(Math.abs(ahead.match.child.speed - PLAYER.run) < 0.05, `${ahead.match.child.speed}`);
  assert.ok(Math.abs(ahead.match.stats.walked - Math.hypot(ahead.x, ahead.z)) < 0.01);
  // With the stick let go they stop, in a moment rather than at once, and don't creep.
  const { match } = ahead;
  run(match, 0.1, STILL);
  assert.ok(match.child.speed > 0.2 && match.child.speed < PLAYER.run * 0.5, `${match.child.speed}`);
  run(match, 0.6, STILL);
  const stopped = { x: match.child.x, z: match.child.z };
  run(match, 2, STILL);
  assert.deepEqual({ x: match.child.x, z: match.child.z }, stopped);
  assert.equal(match.child.speed, 0);
});

test('a sprint is a good deal faster than a walk, only forwards, and opens the rifle\'s aim right up', () => {
  const { match } = start();
  standInFront(match, 25, Math.PI);
  Object.assign(match.child, { x: -21, z: 13, heading: 0 });
  run(match, 1, { moveY: 1, sprint: true });
  assert.ok(Math.abs(match.child.speed - PLAYER.sprint) < 0.05, `${match.child.speed}`);
  assert.equal(match.child.sprinting, true);
  assert.ok(PLAYER.sprint > PLAYER.run * 1.3);
  assert.ok(match.stats.sprintSeconds > 0.9);
  const sprinting = match.spreadNow();
  // Backwards or to the side there's no such thing.
  run(match, 1, { moveY: -1, sprint: true });
  assert.equal(match.child.sprinting, false);
  assert.ok(match.child.speed <= PLAYER.run + 0.05);
  run(match, 1, { moveX: 1, sprint: true });
  assert.equal(match.child.sprinting, false);
  const walking = match.spreadNow();
  run(match, 1, STILL);
  const still = match.spreadNow();
  assert.equal(still, RIFLES.ak.spread);
  assert.ok(Math.abs(walking / still - PLAYER.walking) < 0.05 && Math.abs(sprinting / still - PLAYER.sprinting) < 0.05, `${still}, ${walking}, ${sprinting}`);
});

test('walking into something slides along it, and wherever the stick sends them a player is never stuck, inside anything or outside the fence', () => {
  // Straight at the long side of the container in the middle, a little off square: along it, and round its end.
  const { match } = start();
  standInFront(match, 25, Math.PI);
  Object.assign(match.child, { x: 1, z: 6, heading: 0.35 });
  run(match, 4, FORWARDS);
  assert.ok(match.child.z < -1.5, `got round to ${match.child.x.toFixed(1)}, ${match.child.z.toFixed(1)}`);
  // Into a corner of the fence, it stops there, and walks straight back out.
  Object.assign(match.child, { x: 20, z: 13, heading: Math.PI * 0.75, vx: 0, vz: 0 });
  run(match, 2, FORWARDS);
  assert.ok(Math.abs(match.child.x - (YARD.halfX - BODY)) < 0.01 && Math.abs(match.child.z - (YARD.halfZ - BODY)) < 0.01);
  run(match, 1, { moveY: -1 });
  assert.ok(match.child.x < 19 && match.child.z < 12.5);
  // Anywhere, any way, for a long time.
  const random = seeded(31);
  let input = {};
  let last = { x: match.child.x, z: match.child.z };
  for (let i = 0; i < 60 * 240; i += 1) {
    if (i % 45 === 0) input = { moveX: random() * 2 - 1, moveY: random() * 2 - 1, sprint: random() < 0.3 };
    match.update(STEP, { ...input, turn: (random() - 0.5) * 0.1 });
    const { x, z } = match.child;
    assert.ok(freeAt(x, z, BODY - 1e-6), `at ${x}, ${z}`);
    assert.ok(Math.hypot(x - last.x, z - last.z) <= PLAYER.sprint * STEP * 1.01, 'no jumps');
    last = { x, z };
  }
  // Pushed out of something they've somehow got into, by the shortest way.
  for (const block of BLOCKS) {
    const out = keptClear(block.x + 0.1, block.z);
    assert.ok(freeAt(out.x, out.z, BODY - 1e-6), `${block.kind}`);
    assert.ok(Math.hypot(out.x - block.x, out.z - block.z) <= Math.min(block.w, block.d) / 2 + BODY + 0.11);
  }
  assert.deepEqual(keptClear(900, -900), { x: YARD.halfX - BODY, z: -YARD.halfZ + BODY });
  assert.deepEqual(keptClear(-7, 6.5), { x: -7, z: 6.5 }, 'and left alone in the open');
});

/* ---------- looking ---------- */

test('the view turns as far as it\'s told, the same whatever else is going on, and stays level', () => {
  const { match } = start();
  standInFront(match, 25, Math.PI);
  const { child } = match;
  const from = child.heading;
  run(match, 1, { turn: radians(1) });
  assert.ok(Math.abs(degrees(child.heading - from) - 60) < 1e-6);
  run(match, 1, { turn: radians(-0.5), moveY: 1 });
  assert.ok(Math.abs(degrees(child.heading - from) - 30) < 1e-6);
  // Level: with nothing fired, the eye looks straight along the yard, whatever is asked for.
  run(match, 0.5, { pitch: 0.3, turn: 0 });
  assert.deepEqual(match.view, { yaw: child.heading, pitch: 0 });
  // Nothing that isn't a number turns anything, or breaks anything.
  const before = child.heading;
  for (const bad of [{ turn: NaN }, { turn: 'left' }, { moveX: Infinity, moveY: NaN }, { turn: undefined, moveX: 'far' }]) match.update(STEP, bad);
  assert.ok(Number.isFinite(child.heading + child.x + child.z));
  assert.equal(child.heading, before);
});

/* ---------- firing ---------- */

test('a shot goes where the middle of the sights is: it hits whoever is there, and nobody who isn\'t', () => {
  const { match, events, count } = start();
  steady(match);
  const other = standInFront(match, 10);
  assert.equal(match.aimed, null);
  run(match, STEP, STILL);
  assert.equal(match.aimed, other, 'the sights know who they\'re on');
  assert.equal(match.stats.shots, 0, 'and nothing fires until the trigger is pulled');
  run(match, STEP, FIRE);
  assert.deepEqual([match.stats.shots, match.stats.hits, other.health], [1, 1, other.most - RIFLES.ak.hit]);
  const [shot] = events.filter(({ type }) => type === 'shot');
  assert.deepEqual([shot.by, shot.at, shot.hit, shot.what], [match.child, other, true, 'player']);
  assert.ok(Math.abs(shot.to.z - (other.z + WIDE)) < 1e-6 && Math.abs(shot.to.y - EYES) < 0.02, 'it ends where it meets them');
  run(match, 1, STILL);
  // The sights a little to one side of them: the shots go by, to the fence, and they're none the worse.
  const before = other.health;
  match.child.heading = Math.asin(WIDE / 10) * 1.3;
  run(match, 0.5, FIRE);
  assert.equal(other.health, before);
  assert.equal(match.aimed, null);
  assert.equal(count('shot', ({ hit, what }) => !hit && what === 'fence'), match.stats.shots - 1);
  // A shot that goes over their head, or into the snow at the player's own feet, as one thrown up by the
  // rifle's kick might, is the same: it meets the sky, or the snow, and not them.
  match.child.heading = 0;
  assert.deepEqual([match.cast(0, 0).trooper, match.cast(0, 0).what], [other, 'player']);
  assert.deepEqual([match.cast(0, radians(18)).trooper, match.cast(0, radians(18)).what], [null, 'sky']);
  assert.deepEqual([match.cast(0, radians(-30)).trooper, match.cast(0, radians(-30)).what], [null, 'snow']);
  assert.equal(other.health, before);
  // The player's own side isn't in the way of a shot, and isn't hit by one.
  run(match, 1, STILL);
  const friend = match.troopers.find((each) => each.team === 0 && each !== match.child);
  Object.assign(friend, { x: -21, z: 8 });
  match.child.rounds = MAGAZINE;
  run(match, 0.3, FIRE);
  assert.ok(other.health < before && friend.health === friend.most);
});

test('someone behind something can\'t be hit, however well the sights are on them', () => {
  const { match, count } = start();
  steady(match);
  const other = standInFront(match, 10);
  // Behind the wall near the far corner of the alley.
  Object.assign(match.child, { x: -17, z: -3, heading: 0 });
  Object.assign(other, { x: -17, z: -9 });
  assert.equal(match.sees(match.child, other), false);
  run(match, 1, FIRE);
  assert.equal(other.health, other.most);
  assert.equal(match.aimed, null);
  assert.equal(count('shot', ({ what }) => what === 'wall'), match.stats.shots);
  // Both of them a few steps to the side, in the open alley past the end of it, and there they are.
  Object.assign(match.child, { x: -21, z: -3, heading: 0 });
  Object.assign(other, { x: -21, z: -9 });
  assert.equal(match.sees(match.child, other), true);
  run(match, 1, STILL);
  run(match, 0.3, FIRE);
  assert.ok(other.health < other.most);
});

test('holding the trigger fires as fast as the rifle can, a magazine holds thirty, and an empty rifle changes its own', () => {
  for (const [rifle, each] of Object.entries(RIFLES)) {
    const { match, count } = start({ rifle });
    steady(match);
    const other = standInFront(match, 10);
    other.most = other.health = 100_000;
    const { child } = match;
    run(match, 1, FIRE);
    assert.ok(Math.abs(match.stats.shots - 1 / each.every) <= 1, `${rifle}: ${match.stats.shots} shots in a second`);
    // Letting go stops it at once.
    const fired = match.stats.shots;
    run(match, 0.5, STILL);
    assert.equal(match.stats.shots, fired);
    assert.equal(child.firing, false);
    run(match, (MAGAZINE - fired) * each.every + 0.05, FIRE);
    // Thirty, and then it's changing its magazine by itself: no shots meanwhile, and then it carries on.
    assert.deepEqual([match.stats.shots, child.rounds, count('empty')], [MAGAZINE, 0, 1], rifle);
    assert.ok(child.reloadLeft > each.reload - 0.25);
    assert.deepEqual([match.stats.reloads, match.stats.byHand], [1, 0]);
    run(match, each.reload - 0.2, FIRE);
    assert.deepEqual([match.stats.shots, child.firing], [MAGAZINE, false], `${rifle}: no shots while it's being changed`);
    run(match, 0.4, FIRE);
    assert.ok(match.stats.shots > MAGAZINE && child.rounds < MAGAZINE && count('loaded') === 1, rifle);
  }
  assert.equal(MAGAZINE, 30);
});

test('asking for a new magazine changes it, once each time it\'s asked, and never a full one', () => {
  const { match, count } = start();
  steady(match);
  const other = standInFront(match, 10);
  other.most = other.health = 100_000;
  const { child } = match;
  // A full one: nothing to change.
  match.update(STEP, { reload: true });
  assert.deepEqual([child.reloadLeft, match.stats.reloads], [0, 0]);
  run(match, 0.5, FIRE);
  const used = MAGAZINE - child.rounds;
  assert.ok(used > 2);
  match.update(STEP, { reload: true });
  assert.ok(child.reloadLeft > RIFLES.ak.reload - 0.05);
  assert.deepEqual([match.stats.reloads, match.stats.byHand, count('reload')], [1, 1, 1]);
  // Asked again while it's being changed, nothing more happens, and it can't fire meanwhile.
  const shots = match.stats.shots;
  run(match, 1, { fire: true, reload: true });
  assert.deepEqual([match.stats.reloads, match.stats.shots], [1, shots]);
  run(match, RIFLES.ak.reload, STILL);
  assert.deepEqual([child.rounds, child.reloadLeft, count('loaded')], [MAGAZINE, 0, 1]);
  // Walking goes on while it's changed.
  run(match, 0.3, FIRE);
  Object.assign(child, { x: -7, z: 6.5, heading: 0, vx: 0, vz: 0 });
  match.update(STEP, { reload: true, moveY: 1 });
  run(match, 1, FORWARDS);
  assert.ok(child.reloadLeft > 0 && child.z < 3.5);
});

test('the rifle is steadiest held still with its first shot: firing on opens it up, shot by shot, and it closes again when it stops', () => {
  for (const [rifle, each] of Object.entries(RIFLES)) {
    const { match } = start({ rifle });
    const other = standInFront(match, 10);
    other.most = other.health = 100_000;
    const { child } = match;
    run(match, STEP, STILL);
    assert.equal(child.spread, each.spread, rifle);
    // Firing on: wider with every shot, up to a most.
    const widths = [];
    for (let i = 0; i < 20; i += 1) {
      run(match, each.every, FIRE);
      widths.push(child.spread);
    }
    for (let i = 1; i < 8; i += 1) assert.ok(widths[i] > widths[i - 1], `${rifle}: ${widths.map((width) => width.toFixed(4))}`);
    assert.ok(widths.at(-1) < each.spread + each.bloomMost + 1e-9 && widths.at(-1) > each.spread * 2.5, `${rifle}: ${widths.at(-1)}`);
    // And back to steady within half a second of stopping.
    run(match, 0.6, STILL);
    assert.ok(child.spread < each.spread * 1.06, `${rifle}: ${child.spread}`);
  }
  // Which is the difference between hitting and missing from far off: short bursts from 25 paces mostly hit,
  // and the end of a long one mostly doesn't.
  const landed = (burst) => {
    const { match } = start({ seed: 11 });
    const other = standInFront(match, 25);
    other.most = other.health = 100_000;
    let hits = 0;
    let shots = 0;
    for (let i = 0; i < 40; i += 1) {
      run(match, RIFLES.ak.every * (burst - 3) + STEP, FIRE);
      const before = { ...match.stats };
      run(match, RIFLES.ak.every * 3, FIRE);
      hits += match.stats.hits - before.hits;
      shots += match.stats.shots - before.shots;
      run(match, 1, STILL);
      match.child.rounds = MAGAZINE;
    }
    return hits / shots;
  };
  const [taps, sprays] = [landed(3), landed(14)];
  assert.ok(taps > 0.7, `${Math.round(taps * 100)}% of the first three`);
  assert.ok(sprays < taps - 0.3, `${Math.round(sprays * 100)}% of the last three of fourteen against ${Math.round(taps * 100)}%`);
  // Every shot lands somewhere within the spread, and they're spread over it, not all in one place.
  const { match, events } = start({ seed: 5 });
  const other = standInFront(match, 30);
  other.most = other.health = 100_000;
  match.spreadNow = () => 0.03;
  match.child.punchSpeed = { pitch: 0, yaw: 0 };
  const noKick = RIFLES.ak.kick;
  const offs = [];
  for (let i = 0; i < 200; i += 1) {
    Object.assign(match.child, { rounds: MAGAZINE, fireIn: 0, punch: { pitch: 0, yaw: 0 }, punchSpeed: { pitch: 0, yaw: 0 } });
    const before = events.length;
    match.update(STEP, FIRE);
    const shot = events.slice(before).find(({ type }) => type === 'shot');
    const way = { x: shot.to.x - match.child.x, y: shot.to.y - EYES, z: shot.to.z - match.child.z };
    offs.push(Math.acos(-way.z / Math.hypot(way.x, way.y, way.z)));
  }
  assert.ok(noKick > 0);
  assert.ok(Math.max(...offs) <= 0.03 + 1e-9, `${Math.max(...offs)}`);
  assert.ok(offs.filter((off) => off > 0.015).length > offs.length * 0.55, 'not bunched in the middle');
});

test('each shot kicks the view up and a little to one side, and it comes back by itself: the sights end where they began', () => {
  const kicked = Object.fromEntries(Object.keys(RIFLES).map((rifle) => {
    const { match } = start({ rifle });
    const other = standInFront(match, 10);
    other.most = other.health = 100_000;
    const { child } = match;
    let most = 0;
    let sideways = 0;
    for (let i = 0; i < 90; i += 1) {
      match.update(STEP, FIRE);
      most = Math.max(most, child.punch.pitch);
      sideways = Math.max(sideways, Math.abs(child.punch.yaw));
    }
    // It's in where the shots go, and in what the eye sees: the view is the heading and the kick together.
    assert.deepEqual(match.view, { yaw: child.heading + child.punch.yaw, pitch: child.punch.pitch });
    assert.ok(match.view.pitch > 0);
    run(match, 1.5, STILL);
    assert.deepEqual([child.punch.pitch, child.punch.yaw, child.heading], [0, 0, 0], rifle);
    return [rifle, { most, sideways }];
  }));
  for (const [rifle, { most, sideways }] of Object.entries(kicked)) {
    assert.ok(degrees(most) > 0.4 && degrees(most) < 3.5, `${rifle} climbs ${degrees(most).toFixed(2)} degrees`);
    assert.ok(sideways > 0 && sideways < most, `${rifle} goes ${degrees(sideways).toFixed(2)} degrees sideways`);
  }
  assert.ok(kicked.ak.most > kicked.m4.most * 1.2, 'the Kalashnikov kicks harder');
});

test('the two rifles are different: the Kalashnikov hits harder, and the M4 is quicker and steadier', () => {
  const { ak, m4 } = RIFLES;
  assert.ok(ak.hit > m4.hit && ak.every > m4.every && ak.spread > m4.spread && ak.bloom > m4.bloom && ak.kick > m4.kick && ak.reload > m4.reload);
  // Either tags someone out with four or five hits, in about half a second with every shot on them.
  for (const [rifle, each] of Object.entries(RIFLES)) {
    const hits = Math.ceil(HEALTH / each.hit);
    assert.ok(hits >= 4 && hits <= 5, `${rifle}: ${hits} hits`);
    assert.ok(hits * each.every < 0.6, `${rifle}: ${hits * each.every} seconds`);
    const { match } = start({ rifle });
    steady(match);
    const other = standInFront(match, 10);
    run(match, hits * each.every, FIRE);
    assert.deepEqual([other.state, match.stats.tags, match.score[0]], ['out', 1, 1], rifle);
    assert.equal(match.child.rifle, rifle);
  }
  assert.equal(start({ rifle: 'cannon' }).match.child.rifle, 'ak', 'anything else is the first of them');
});

/* ---------- being tagged out, and winning ---------- */

test('someone hit enough is tagged out, which is a point, and they\'re back at their own end a few seconds later, where nothing can hit them for a moment', () => {
  const { match, count } = start();
  steady(match);
  const other = standInFront(match, 10);
  run(match, 0.6, FIRE);
  assert.deepEqual([other.state, match.score, count('tagged'), match.aimed], ['out', [1, 0], 1, null]);
  // Sitting out, a shot goes straight through where they were.
  const [shots, hits] = [match.stats.shots, match.stats.hits];
  run(match, 0.3, FIRE);
  assert.ok(match.stats.shots > shots && match.stats.hits === hits);
  run(match, OUT_SECONDS, STILL);
  assert.deepEqual([other.state, other.health, count('back')], ['in', other.most, 1]);
  assert.ok(gap(other, { x: BASES[1].spots[other.slot], z: BASES[1].z }) < 1e-6);
  assert.ok(other.safeLeft > 1);
  // Just back, nothing takes anything off them, though a shot still stops at them.
  Object.assign(other, { x: -21, z: 3 });
  run(match, 0.5, FIRE);
  assert.equal(other.health, other.most);
  run(match, 2, STILL);
  run(match, 0.3, FIRE);
  assert.ok(other.health < other.most);
});

test('on Easy the player can\'t be tagged out and the other team\'s tags count for nothing. On Medium and Tough every tag counts for the team that made it', () => {
  const easy = start({ level: 'gentle', tags: 5 });
  const [red] = reds(easy.match);
  for (let i = 0; i < 40; i += 1) easy.match.hit(easy.match.child, 30, red);
  assert.deepEqual([easy.match.child.state, easy.match.child.health, easy.match.score, easy.match.stats.out], ['in', 1, [0, 0], 0]);
  // Giraffe can be, there as anywhere, but on Easy it's no point to anyone.
  const mate = easy.match.troopers.find(({ team, bot }) => team === 0 && bot);
  for (let i = 0; i < 8; i += 1) {
    Object.assign(mate, { state: 'in', health: 1, safeLeft: 0 });
    easy.match.hit(mate, 30, red);
  }
  run(easy.match, 3, STILL);
  assert.deepEqual([easy.match.score, easy.match.state, easy.count('tagged')], [[0, 0], 'playing', 8]);
  // And even with the other team's number at the tags, however it got there, Easy isn't lost.
  easy.match.score[1] = 5;
  easy.match.checkEnd();
  run(easy.match, 3, STILL);
  assert.deepEqual([easy.match.state, easy.count('lost')], ['playing', 0]);

  for (const level of ['medium', 'tough']) {
    // The player tagged out three times and Giraffe twice: five to the other team, and that's the match.
    const hard = start({ level, tags: 5 });
    const [other] = reds(hard.match);
    const { child } = hard.match;
    const friend = hard.match.troopers.find(({ team, bot }) => team === 0 && bot);
    for (const [who, times] of [[child, 3], [friend, 2]]) {
      for (let i = 0; i < times; i += 1) {
        Object.assign(who, { state: 'in', health: 5, safeLeft: 0 });
        hard.match.hit(who, 30, other);
      }
    }
    assert.deepEqual([hard.match.score, hard.match.stats.out, other.tags], [[0, 5], 3, 5], level);
    run(hard.match, 2, STILL);
    assert.deepEqual([hard.match.state, hard.count('lost'), hard.count('won')], ['lost', 1, 0], level);
  }
  assert.deepEqual([LEVELS.gentle.canLose, LEVELS.medium.canLose, LEVELS.tough.canLose], [false, true, true]);
  assert.deepEqual(TAGS_TO_WIN, [5, 10, 15]);
  // Out of the box it's a match that can be lost, to ten.
  const usual = new Match();
  assert.deepEqual([usual.goal, usual.level, usual.assist], [10, LEVELS.medium, true]);
});

test('the first team to the tags wins, a moment later, and after that nothing moves, fires or counts', () => {
  const { match, count } = start({ tags: 5 });
  steady(match);
  const other = standInFront(match, 10);
  for (let i = 0; i < 5; i += 1) {
    Object.assign(other, { state: 'in', health: 1, safeLeft: 0 });
    match.hit(other, 5, match.child);
  }
  assert.deepEqual([match.score, match.state, match.left], [[5, 0], 'playing', 0]);
  // Once it's decided nothing more lands, so the tags on the finish card are the tags that won it.
  Object.assign(other, { state: 'in', health: 1, safeLeft: 0 });
  match.hit(other, 5, match.child);
  assert.deepEqual([match.score, other.health], [[5, 0], 1]);
  run(match, 2, FIRE);
  assert.deepEqual([match.state, count('won')], ['won', 1]);
  const { child } = match;
  run(match, 1, STILL);
  const at = { x: child.x, z: child.z, heading: child.heading, shots: match.stats.shots };
  run(match, 3, { turn: 0.02, fire: true, moveY: 1, moveX: 1, reload: true });
  assert.deepEqual({ x: child.x, z: child.z, heading: child.heading, shots: match.stats.shots }, at);
  assert.equal(count('won'), 1);
});

/* ---------- with no hands in the picture ---------- */

test('with neither hand in the picture it\'s paused: everyone the computer plays stops and waits, nothing can happen, and it carries on when a hand is back', () => {
  const { match, count } = start({ level: 'tough', seed: 5, levelNumber: 6 });
  const AWAY = { hands: 0 };
  run(match, 6, { turn: 0.004, hands: 2 });
  assert.equal(match.resting, false);
  // A moment with no hands is nothing: a tracker loses a hand now and then.
  run(match, AWAY_AFTER - 0.2, AWAY);
  assert.equal(match.resting, false);
  run(match, 0.4, AWAY);
  assert.deepEqual([match.resting, match.paused, count('resting', ({ on }) => on)], [true, true, 1]);
  const places = () => match.troopers.map(({ x, z }) => [x, z]);
  run(match, 1, AWAY);
  const [at, shots, health, crate] = [places(), count('shot'), match.child.health, match.crate ? match.crate.left : match.crateIn];
  // For as long as it lasts: nobody moves, nothing's fired, nothing lands, and the crates wait too.
  run(match, 30, { hands: 0, fire: true, moveY: 1, turn: 0.01, reload: true });
  assert.deepEqual(places(), at);
  assert.deepEqual([count('shot'), match.child.health, match.crate ? match.crate.left : match.crateIn, match.state], [shots, health, crate, 'playing']);
  // One hand is enough to carry on.
  run(match, 0.1, { hands: 1 });
  assert.deepEqual([match.resting, count('resting', ({ on }) => !on)], [false, 1]);
  run(match, 5, { hands: 1, turn: 0.004 });
  assert.notDeepEqual(places(), at);
  // Hands that are there and doing nothing aren't away: standing still is part of the game, and nobody waits for it.
  const idle = start({ level: 'tough', seed: 5 });
  run(idle.match, 20, STILL);
  assert.equal(idle.match.resting, false);
  assert.ok(idle.count('shot') > 0);
});

/* ---------- the players the computer plays ---------- */

test('the players the computer plays find their way about the yard without ever getting stuck or going through anything', () => {
  const { match } = start({ seed: 13, levelNumber: 10 });
  // All on one side for now, with nobody to stop for, and the player out of it.
  const bots = match.troopers.filter(({ bot }) => bot);
  for (const bot of bots) bot.team = 0;
  const travelled = new Map(bots.map((bot) => [bot, 0]));
  for (let i = 0; i < 60 * 60; i += 1) {
    const before = bots.map(({ x, z }) => ({ x, z }));
    match.update(STEP, STILL);
    bots.forEach((bot, index) => {
      assert.ok(freeAt(bot.x, bot.z, BODY - 0.01), `${bot.who} at ${bot.x}, ${bot.z}`);
      const moved = Math.hypot(bot.x - before[index].x, bot.z - before[index].z);
      // Nobody jumps: no more in a frame than the quickest of them, the runner, could go.
      assert.ok(moved <= 5.2 * STEP * 1.05, `${bot.who} went ${moved} in a frame`);
      travelled.set(bot, travelled.get(bot) + moved);
    });
  }
  // Each was walking somewhere for most of the time.
  for (const [bot, far] of travelled) assert.ok(far > 60 * 2, `${bot.who} went ${far}`);
});

test('a player the computer plays takes a moment to start firing, and fires a few at a time', () => {
  for (const [level, each] of Object.entries(LEVELS)) {
    const { match, events } = start({ level, seed: 9 });
    const [red, ...others] = reds(match);
    for (const other of [...others, ...match.troopers.filter(({ team, bot }) => team === 0 && bot)]) Object.assign(other, { x: 20, z: 13.5, bot: false });
    Object.assign(match.child, { x: -21, z: 13, heading: 0 });
    Object.assign(red, { x: -21, z: 4, heading: Math.PI, haunt: null });
    const shots = [];
    for (let t = 0; t < 12; t += STEP) {
      Object.assign(match.child, { health: HEALTH, sinceHit: 0 });
      const before = events.length;
      match.update(STEP, STILL);
      if (events.slice(before).some(({ type, by }) => type === 'shot' && by === red)) shots.push(t);
    }
    // Not at once: only after it's had its moment to take aim.
    assert.ok(shots[0] >= each.react - 0.05 && shots[0] < each.react + 0.6, `${level}: first shot after ${shots[0]}`);
    // A few, a pause, a few more.
    const pauses = shots.slice(1).map((at, index) => at - shots[index]).filter((between) => between > 0.3);
    assert.ok(pauses.length >= 3, `${level}: ${pauses.length} pauses`);
    assert.ok(Math.min(...pauses) >= each.rest[0] - 0.05, `${level}: ${Math.min(...pauses)}`);
    const longest = shots.reduce((most, at, index) => {
      const row = index && at - shots[index - 1] < 0.3 ? most.row + 1 : 1;
      return { row, best: Math.max(most.best, row) };
    }, { row: 0, best: 0 }).best;
    assert.ok(longest <= each.burst[1], `${level}: ${longest} in a row`);
    assert.equal(red.seen, match.child);
  }
  // Harder is quicker to fire, hits more often and harder, and pauses less.
  const { gentle, medium, tough } = LEVELS;
  for (const [easier, harder] of [[gentle, medium], [medium, tough]]) {
    assert.ok(harder.aim > easier.aim && harder.hit > easier.hit && harder.react < easier.react && harder.rest[1] < easier.rest[1]);
  }
});

test('their shots land less often on a player who\'s walking, less still on one sprinting, and less from far off, so moving and keeping a distance are worth it', () => {
  const { match } = start({ level: 'medium' });
  const [red] = reds(match);
  const { child } = match;
  Object.assign(red, { x: 0, z: 0 });
  const chance = (change) => {
    Object.assign(child, { x: 0, z: 6, speed: 0, sprinting: false }, change);
    return match.chanceOn(child, red);
  };
  const still = chance({});
  assert.equal(still, LEVELS.medium.aim);
  assert.ok(chance({ speed: PLAYER.run }) < still * 0.75 && chance({ speed: PLAYER.run }) > still * 0.5);
  assert.ok(chance({ speed: PLAYER.sprint, sprinting: true }) < chance({ speed: PLAYER.run }));
  assert.ok(chance({ speed: PLAYER.run * 0.5 }) > chance({ speed: PLAYER.run }));
  assert.ok(chance({ z: 14 }) < still && chance({ z: 14 }) > chance({ z: 28 }));
  assert.ok(chance({ z: 28 }) >= still * 0.45);
  // And it's borne out: standing still in front of one for a while costs a good deal more than sidestepping.
  const taken = (input) => {
    const played = start({ level: 'medium', seed: 17 });
    const [other, ...rest] = reds(played.match);
    for (const each of [...rest, ...played.match.troopers.filter(({ team, bot }) => team === 0 && bot)]) Object.assign(each, { x: 20, z: 13.5, bot: false });
    Object.assign(played.match.child, { x: -19, z: 12, heading: 0 });
    Object.assign(other, { x: -19, z: 4, heading: Math.PI });
    let lost = 0;
    for (let t = 0; t < 30; t += STEP) {
      const before = played.match.child.health;
      played.match.update(STEP, input(t));
      lost += Math.max(0, before - played.match.child.health);
      Object.assign(played.match.child, { health: HEALTH, sinceHit: 0, state: 'in' });
    }
    return lost;
  };
  const [standing, dodging] = [taken(() => STILL), taken((t) => ({ moveX: Math.sin(t * 2.5) > 0 ? 1 : -1 }))];
  assert.ok(standing > 150, `${standing} standing still`);
  assert.ok(dodging < standing * 0.8, `${dodging} sidestepping against ${standing} standing still`);
  // Their shots at each other land more often than not, the same for both teams.
  const mate = match.troopers.find(({ team, bot }) => team === 0 && bot);
  assert.equal(match.chanceOn(mate, red), match.chanceOn(red, mate));
  assert.equal(match.botHit(red, mate), match.botHit(mate, red));
  assert.equal(match.botHit(red, child), LEVELS.medium.hit);
});

test('one of them that\'s hit from further off than it would fight goes after whoever did it', () => {
  const { match } = start({ seed: 3 });
  steady(match);
  const [red, ...others] = reds(match);
  for (const other of [...others, ...match.troopers.filter(({ team, bot }) => team === 0 && bot)]) Object.assign(other, { x: 20, z: 13.5, bot: false });
  // 24 paces up the alley: further than it would stop and fight from.
  Object.assign(match.child, { x: -21, z: 13, heading: 0 });
  Object.assign(red, { x: -21, z: -11, heading: Math.PI / 2, haunt: { x: -21, z: -11.5 } });
  red.most = red.health = 1000;
  run(match, 0.3, STILL);
  assert.equal(red.seen, null, 'left alone, it goes about its business');
  run(match, RIFLES.ak.every + STEP, FIRE);
  assert.equal(red.angryAt, match.child);
  run(match, 0.3, () => {
    Object.assign(match.child, { health: HEALTH, sinceHit: 0 });
    return STILL;
  });
  assert.equal(red.seen, match.child, 'hit, it turns on whoever did it');
  // And lets it go after a while, if they don't keep at it.
  run(match, 6, () => {
    Object.assign(match.child, { health: HEALTH, sinceHit: 0 });
    return STILL;
  });
  assert.equal(red.angryAt, null);
});

/* ---------- the help with aiming ---------- */

test('with the help with aiming, the view turns less for the hand while the sights are on someone, and it never moves the sights for anyone', () => {
  const { match } = start();
  const other = standInFront(match, 10);
  const wide = Math.atan2(WIDE, 10);
  const slowAt = (off) => {
    match.child.heading = off;
    return match.aimSlow();
  };
  assert.equal(slowAt(0), AIM_ASSIST.slow);
  assert.equal(slowAt(wide * 0.9), AIM_ASSIST.slow, 'anywhere on them');
  // Coming off them it eases back to the usual, and well away from them it is the usual.
  const [near, further] = [slowAt(wide * 1.5), slowAt(wide * 2)];
  assert.ok(near > AIM_ASSIST.slow && further > near && further < 1, `${near}, ${further}`);
  assert.equal(slowAt(wide * AIM_ASSIST.within * 1.05), 1);
  assert.equal(slowAt(-wide * 0.5), AIM_ASSIST.slow, 'either side');
  // Sitting out, they don't count, and nor does someone behind something, however well the sights are on them.
  match.child.heading = 0;
  other.state = 'out';
  assert.equal(match.aimSlow(), 1);
  other.state = 'in';
  const [here, there] = [{ x: match.child.x, z: match.child.z }, { x: other.x, z: other.z }];
  Object.assign(match.child, { x: -17, z: -3, heading: 0 });
  Object.assign(other, { x: -17, z: -9 });
  assert.equal(match.aimSlow(), 1, 'behind the wall');
  Object.assign(match.child, here);
  Object.assign(other, there);
  assert.equal(match.aimSlow(), AIM_ASSIST.slow);
  // It's only ever how far the view turns: left to itself, the view doesn't move at all.
  const before = match.child.heading;
  run(match, 2, STILL);
  assert.equal(match.child.heading, before);
  // Switched off, there's none of it.
  match.configure({ assist: false });
  assert.equal(match.aimSlow(), 1);
  assert.equal(start({ assist: false }).match.assist, false);
});

/* ---------- whole matches ---------- */

/** A player who plays as someone with a hand in the air would: finding whoever they can see, late and not quite steadily. */
function gamer(match, { seed = 5, wobble = 0.05, reaction = 0.4, quick = 0.08, turnMost = 2.6 } = {}) {
  const random = seeded(seed);
  const me = match.child;
  let way = null;
  let wayIn = 0;
  let goal = { x: 0, z: -6 };
  let seenFor = 0;
  let t = 0;
  const phases = [random() * 6, random() * 6, random() * 6];
  return () => {
    t += STEP;
    const seen = match.foesOf(me).filter((other) => other.safeLeft <= 0 && match.sees(me, other)).sort((a, b) => gap(a, me) - gap(b, me))[0];
    seenFor = seen ? seenFor + STEP : 0;
    const noise = wobble * (0.6 * Math.sin(t * 2.1 + phases[0]) + 0.3 * Math.sin(t * 5.3 + phases[1]) + 0.25 * Math.sin(t * 9.7 + phases[2]));
    const input = { turn: 0, moveX: 0, moveY: 0, sprint: false, fire: false, reload: false, pitch: 0, hands: 2 };
    if (seen && seenFor > reaction) {
      const off = turnBetween(headingTo(seen.x - me.x, seen.z - me.z), me.heading) + noise;
      input.turn = Math.max(-turnMost * STEP, Math.min(turnMost * STEP, off * quick));
      input.fire = Math.abs(off) < 0.08;
    } else if (!seen) {
      wayIn -= STEP;
      if (gap(me, goal) < 2) goal = { x: (random() - 0.5) * 36, z: (random() - 0.5) * 22 };
      const to = match.crate ?? goal;
      if (!way || wayIn <= 0) {
        way = wayTo(to.x, to.z);
        wayIn = 0.5;
      }
      const next = stepTowards(way, me.x, me.z);
      const off = turnBetween(headingTo(next.x - me.x, next.z - me.z), me.heading);
      input.turn = Math.max(-turnMost * STEP, Math.min(turnMost * STEP, off * 0.2));
      input.moveY = Math.abs(off) < 0.9 ? 1 : 0.2;
      input.sprint = Math.abs(off) < 0.3;
      input.reload = me.rounds < 10 && me.reloadLeft === 0;
    }
    return input;
  };
}

function playOut(match, options, most = 900) {
  const brain = gamer(match, options);
  let seconds = 0;
  while (match.state === 'playing' && seconds < most) {
    match.update(STEP, brain());
    seconds += STEP;
  }
  return seconds;
}

test('every difficulty, rifle and number of tags can be played right through, Easy is always won, and the harder ones can be lost', () => {
  for (const level of Object.keys(LEVELS)) {
    for (const [tags, rifle] of [[5, 'ak'], [10, 'm4'], [15, 'ak'], [10, 'ak']]) {
      const { match, count } = start({ level, tags, rifle, seed: tags + level.length });
      const seconds = playOut(match, { seed: tags });
      const about = `${level}, ${tags} tags with the ${rifle}`;
      assert.ok(['won', 'lost'].includes(match.state), `${about}: ${match.state} after ${seconds}`);
      if (level === 'gentle') assert.deepEqual([match.state, match.stats.out, match.score[1]], ['won', 0, 0], about);
      assert.equal(Math.max(...match.score) >= tags, true, about);
      // Every tag was made by someone, and counted for their team.
      assert.equal(count('tagged', ({ by }) => by.team === 0), match.score[0], about);
      if (level !== 'gentle') assert.equal(count('tagged', ({ by }) => by.team === 1), match.score[1], about);
      assert.ok(match.stats.tags > 0 && match.stats.tags <= match.score[0], `${about}: ${match.stats.tags} of ${match.score[0]}`);
      assert.ok(match.stats.hits <= match.stats.shots && match.stats.hits >= match.stats.tags, about);
      assert.ok(seconds < 600, `${about}: ${seconds} seconds`);
      for (const trooper of match.troopers) assert.ok(freeAt(trooper.x, trooper.z, BODY - 0.01), `${about}: ${trooper.who}`);
    }
  }
  // Someone who can hardly aim, standing in the open, loses on Tough.
  const poor = start({ level: 'tough', tags: 10, seed: 4 });
  playOut(poor.match, { seed: 9, wobble: 0.16, reaction: 1.2, quick: 0.03, turnMost: 1.2 });
  assert.equal(poor.match.state, 'lost');
  assert.ok(poor.match.stats.out >= 3);
});

test('level 1 is the plain match: Giraffe with the player against two, and nothing new', () => {
  const { match } = start();
  assert.deepEqual(match.troopers.filter(({ team }) => team === 0).map(({ who, bot }) => (bot ? who : 'player')), ['player', 'giraffe']);
  assert.equal(reds(match).length, 2);
  assert.ok(reds(match).every(({ who, most, part }) => who !== 'giraffe' && most === HEALTH && part === null));
  const plan = levelPlan(1);
  assert.deepEqual([plan.aim, plan.react, plan.health], [1, 1, 1]);
  assert.deepEqual(match.crateKinds, []);
});

/* ---------- what the levels bring ---------- */

const LEVEL_NUMBERS = Array.from({ length: 10 }, (_, index) => index + 1);
const NEW_THINGS = ['stars', 'shield', 'three', 'runner', 'power', 'snow', 'captain', 'boots', 'champions', 'trophy'];

test('level 1 has nothing new, every other level has something new that it really switches on, and nothing is ever taken away', () => {
  assert.deepEqual(newsAt(1), []);
  assert.equal(NEW_THINGS.some((key) => levelPlan(1)[key]), false);
  const seen = new Set();
  for (const level of LEVEL_NUMBERS.slice(1)) {
    const news = newsAt(level);
    assert.ok(news.length >= 1, `level ${level} brings something`);
    for (const { key, mark, name, nameKa } of news) {
      assert.ok(mark && name && nameKa, `${key} has a mark and a name in both languages`);
      assert.equal(seen.has(key), false, `${key} is only new once`);
      seen.add(key);
      assert.equal(levelPlan(level)[key], true, `${key} is on at level ${level}`);
      assert.equal(Boolean(levelPlan(level - 1)[key]), false, `${key} isn't on before level ${level}`);
    }
    for (const key of NEW_THINGS) if (levelPlan(level - 1)[key]) assert.equal(levelPlan(level)[key], true, `${key} stays on at level ${level}`);
  }
  assert.deepEqual([...seen].sort(), [...NEW_THINGS].sort());
  assert.deepEqual(Object.keys(NEWS).map(Number), LEVEL_NUMBERS.slice(1));
});

test('each level is the same or harder than the one before, and a level never changes what was chosen', () => {
  for (const level of LEVEL_NUMBERS.slice(1)) {
    const [before, now] = [levelPlan(level - 1), levelPlan(level)];
    assert.ok(now.aim >= before.aim && now.react <= before.react && now.health >= before.health && now.reds >= before.reds, `level ${level}`);
  }
  for (const level of LEVEL_NUMBERS) {
    const { match } = start({ levelNumber: level, tags: 15, level: 'gentle', rifle: 'm4', assist: false });
    assert.deepEqual([match.goal, match.level.canLose, match.child.rifle, match.assist], [15, false, 'm4', false], `level ${level}`);
    assert.equal(match.child.most, HEALTH, 'the player takes as many hits as ever');
  }
});

test('from level 2 each of the player\'s tags is a gold star, and before that there are none', () => {
  for (const [level, stars] of [[1, 0], [2, 1]]) {
    const { match, count } = start({ levelNumber: level });
    steady(match);
    standInFront(match, 10);
    run(match, 0.6, FIRE);
    assert.deepEqual([match.stats.tags, match.stats.stars, count('star')], [1, stars, stars], `level ${level}`);
  }
  // A tag of Giraffe's is a point for the team, but the stars are for the player's own.
  const { match } = start({ levelNumber: 2 });
  const [other] = reds(match);
  const mate = match.troopers.find(({ team, bot }) => team === 0 && bot);
  Object.assign(other, { health: 1, safeLeft: 0 });
  match.hit(other, 5, mate);
  assert.deepEqual([match.score, match.stats.stars, mate.tags], [[1, 0], 0, 1]);
});

test('from level 3 one of the other team carries a shield: the first shots bounce off it, then it\'s down, and it\'s up again when they come back', () => {
  const { match, count } = start({ levelNumber: 3 });
  steady(match);
  const carrier = reds(match).find(({ part }) => part === 'shield');
  assert.ok(carrier, 'someone carries it');
  assert.equal(reds(match).filter(({ part }) => part === 'shield').length, 1);
  assert.equal(reds(start({ levelNumber: 2 }).match).some(({ part }) => part), false);
  const { child } = match;
  Object.assign(child, { x: -21, z: 13, heading: 0 });
  for (const each of match.troopers) if (each !== child) Object.assign(each, { bot: false, x: 20, z: each.team ? -13.5 : 13.5 });
  Object.assign(carrier, { x: -21, z: 3, safeLeft: 0 });
  const shield = carrier.shield;
  assert.ok(shield >= 4);
  run(match, (shield - 1) * RIFLES.ak.every + 0.03, FIRE);
  assert.deepEqual([carrier.health, carrier.shield, count('bonk')], [carrier.most, 0, shield], 'they bounce off, and nothing else happens');
  assert.equal(count('bonk', ({ down }) => down), 1);
  run(match, 1, FIRE);
  assert.equal(carrier.state, 'out');
  run(match, OUT_SECONDS + 0.2, STILL);
  assert.deepEqual([carrier.state, carrier.shield], ['in', shield]);
});

test('from level 4 it\'s three a side, with a second friend on the player\'s team', () => {
  const sides = (level) => {
    const { match } = start({ levelNumber: level });
    return [match.troopers.filter(({ team }) => team === 0).map(({ who, bot }) => (bot ? who : 'player')), reds(match).length];
  };
  assert.deepEqual(sides(3), [['player', 'giraffe'], 2]);
  assert.deepEqual(sides(4), [['player', 'giraffe', 'mochi'], 3]);
  const { match } = start({ levelNumber: 4 });
  const places = match.troopers.map(({ x, z }) => `${x},${z}`);
  assert.equal(new Set(places).size, places.length, 'each in a place of their own');
});

test('from level 5 one of the other team is a runner: quicker, never still while firing, and tagged out sooner', () => {
  const { match } = start({ levelNumber: 5, seed: 3 });
  const runner = reds(match).find(({ part }) => part === 'runner');
  assert.ok(runner);
  assert.ok(runner.most < reds(match).find(({ part }) => part === 'shield').most);
  const { child } = match;
  for (const each of match.troopers) if (each !== child && each !== runner) Object.assign(each, { bot: false, x: 20, z: each.team ? -13.5 : 13.5 });
  Object.assign(child, { x: -21, z: 13 });
  Object.assign(runner, { x: -18, z: 3, heading: Math.PI, haunt: null });
  let moved = 0;
  let fired = 0;
  match.onEvent = (event) => {
    if (event.type === 'shot' && event.by === runner) fired += 1;
  };
  for (let t = 0; t < 8; t += STEP) {
    const before = { x: runner.x, z: runner.z };
    Object.assign(child, { health: HEALTH, sinceHit: 0 });
    match.update(STEP, STILL);
    if (runner.seen === child) moved += Math.hypot(runner.x - before.x, runner.z - before.z);
    assert.ok(freeAt(runner.x, runner.z, BODY - 0.01));
  }
  assert.ok(fired > 3, `${fired} shots`);
  assert.ok(moved > 6, `it kept moving while it fired: ${moved}`);
});

test('from level 6 a crate of double shots turns up: walking over it makes each shot count twice for a while, and missing it costs nothing', () => {
  assert.deepEqual(start({ levelNumber: 5 }).match.crateKinds, []);
  const { match, count } = start({ levelNumber: 6 });
  steady(match);
  assert.deepEqual(match.crateKinds, ['double']);
  for (const spot of CRATE_SPOTS) assert.ok(freeAt(spot.x, spot.z), `${spot.x}, ${spot.z}`);
  const other = standInFront(match, 10);
  other.most = other.health = 10_000;
  run(match, 9, STILL);
  assert.ok(match.crate, 'one has turned up');
  assert.equal(count('crate'), 1);
  assert.ok(gap(match.crate, match.child) > 10, 'a walk away');
  // Left alone, it goes after a while, and another comes, and nothing is lost.
  run(match, 41, STILL);
  assert.equal(count('crate-gone'), 1);
  run(match, 19, STILL);
  assert.equal(count('crate'), 2);
  // The player walks over this one.
  Object.assign(match.child, { x: match.crate.x, z: match.crate.z + 0.5, heading: 0 });
  Object.assign(other, { x: match.child.x, z: match.child.z - 8 });
  if (!match.sees(match.child, other)) Object.assign(other, { x: match.child.x - 0.01, z: match.child.z - 3 });
  run(match, STEP * 2, STILL);
  assert.deepEqual([match.crate, count('crate-got'), match.stats.crates], [null, 1, 1]);
  assert.ok(match.power.doubleLeft > POWERS.double.seconds - 0.1);
  const before = other.health;
  run(match, RIFLES.ak.every * 3 + 0.02, FIRE);
  const shots = match.stats.shots;
  assert.ok(shots >= 3);
  assert.equal(before - other.health, shots * RIFLES.ak.hit * 2, 'each counts twice');
  run(match, POWERS.double.seconds, STILL);
  assert.deepEqual([match.power.doubleLeft, count('power-off')], [0, 1]);
});

test('from level 7 it snows, and nobody can see as far', () => {
  const clear = start({ levelNumber: 6 }).match;
  const snowy = start({ levelNumber: 7 }).match;
  assert.ok(snowy.sight < clear.sight && snowy.sight > 15);
  for (const match of [clear, snowy]) {
    const other = standInFront(match, 26);
    assert.equal(match.sees(match.child, other), match === clear, 'someone 26 paces off');
    Object.assign(other, { z: match.child.z - 18 });
    assert.equal(match.sees(match.child, other), true, 'and nearer, they can be seen');
  }
});

test('from level 8 the other team has a captain, who takes twice the hits and is worth two tags', () => {
  const { match, count } = start({ levelNumber: 8 });
  const captain = reds(match).find(({ part }) => part === 'captain');
  const plain = reds(match).find(({ part }) => part === null);
  assert.ok(captain);
  assert.equal(reds(match).filter(({ part }) => part === 'captain').length, 1);
  assert.ok(captain.most > (plain?.most ?? HEALTH) * 1.9);
  Object.assign(captain, { health: 1, safeLeft: 0 });
  match.hit(captain, 5, match.child);
  assert.deepEqual([match.score, match.stats.tags, match.stats.stars], [[2, 0], 1, 2]);
  assert.equal(count('star', ({ worth }) => worth === 2), 1);
});

test('from level 9 a crate of snow boots turns up too, and walking and sprinting are quicker for a while', () => {
  const { match } = start({ levelNumber: 9 });
  assert.deepEqual(match.crateKinds, ['double', 'boots']);
  standInFront(match, 30, Math.PI);
  run(match, 9, STILL);
  assert.equal(match.crate.kind, 'boots', 'the newest kind first');
  const walkFor = (seconds, input = FORWARDS) => {
    Object.assign(match.child, { x: -21, z: 13, heading: 0, vx: 0, vz: 0 });
    const from = match.child.z;
    run(match, seconds, input);
    return from - match.child.z;
  };
  const usual = walkFor(2);
  const usualSprint = walkFor(2, { moveY: 1, sprint: true });
  match.power.bootsLeft = POWERS.boots.seconds;
  const quicker = walkFor(2);
  assert.ok(quicker > usual * 1.25, `${quicker} against ${usual}`);
  assert.ok(walkFor(2, { moveY: 1, sprint: true }) > usualSprint * 1.25);
  // And the next crate is the other kind.
  match.crate = null;
  match.crateIn = 0;
  run(match, STEP * 2, STILL);
  assert.equal(match.crate.kind, 'double');
});

test('at level 10 the other team are the champions, who all take more hits, and beating them wins the trophy', () => {
  const champions = start({ levelNumber: 10, tags: 5 });
  const before = start({ levelNumber: 9, tags: 5 });
  assert.ok(reds(champions.match).every(({ champion }) => champion));
  assert.ok(reds(before.match).every(({ champion }) => !champion));
  const mostOf = ({ match }, part) => reds(match).find((each) => each.part === part).most;
  for (const part of ['captain', 'shield', 'runner']) assert.ok(mostOf(champions, part) > mostOf(before, part), part);
  for (const [played, trophy] of [[champions, 1], [before, 0]]) {
    const [other] = reds(played.match);
    for (let i = 0; i < 5; i += 1) {
      Object.assign(other, { state: 'in', health: 1, safeLeft: 0, shield: 0, part: null });
      played.match.hit(other, 5, played.match.child);
    }
    run(played.match, 2, STILL);
    assert.deepEqual([played.match.state, played.match.stats.trophy], ['won', trophy]);
  }
});

test('every level can be played right through, Easy is still always won, and the new things really happen', () => {
  const happened = new Set();
  for (const level of LEVEL_NUMBERS) {
    for (const difficulty of Object.keys(LEVELS)) {
      const { match, events } = start({ levelNumber: level, level: difficulty, tags: 10, seed: level + 20 });
      const seconds = playOut(match, { seed: level });
      const about = `level ${level}, ${difficulty}`;
      assert.ok(['won', 'lost'].includes(match.state), `${about}: ${match.state} after ${seconds}`);
      if (difficulty === 'gentle') assert.deepEqual([match.state, match.stats.out], ['won', 0], about);
      assert.ok(seconds < 700, `${about}: ${seconds} seconds`);
      for (const { type } of events) happened.add(type);
      for (const trooper of match.troopers) assert.ok(freeAt(trooper.x, trooper.z, BODY - 0.01), `${about}: ${trooper.who}`);
      if (level >= 2 && match.state === 'won') assert.ok(match.stats.stars >= match.stats.tags, about);
      if (level === 10 && match.state === 'won') assert.equal(match.stats.trophy, 1, about);
    }
  }
  for (const type of ['star', 'bonk', 'crate', 'crate-got', 'reload', 'loaded', 'tagged', 'back', 'empty']) assert.ok(happened.has(type), `${type} happened somewhere`);
});

/* ---------- what's said ---------- */

const FOLDER = new URL('../../games/frost-arena/audio/voice/', import.meta.url);
const MOST_WORDS = 10;

test('Frost Arena keeps its talking short, and everything it says has a voice in both languages', () => {
  const lines = JSON.parse(readFileSync(new URL('lines.json', FOLDER), 'utf8'));
  assert.ok(lines.length >= 5);
  const main = readFileSync(new URL('../../games/frost-arena/main.js', import.meta.url), 'utf8');
  for (const { id, text, ka } of lines) {
    assert.ok(text.split(/\s+/).length <= MOST_WORDS, `"${text}" is ${text.split(/\s+/).length} words`);
    assert.ok(ka && ka.trim().length > 0, `${id} has Georgian words`);
    for (const language of ['en', 'ka']) assert.ok(existsSync(new URL(`${language}/${id}.ogg`, FOLDER)), `${language}/${id}.ogg`);
    // Every line is one the game says: nothing is left over from before.
    assert.ok(main.includes(text), `"${text}" is said somewhere`);
  }
  assert.equal(new Set(lines.map(({ id }) => id)).size, lines.length);
});

/* ---------- the other team: cleverer and more dangerous on Medium and Tough, level by level ---------- */

test('Medium and Tough hit harder and sooner than they did, and Easy is just as it was', () => {
  assert.deepEqual(LEVELS.gentle, { aim: 0.35, hit: 10, react: 1, burst: [3, 5], rest: [1, 1.6], canLose: false });
  assert.deepEqual([LEVELS.medium.aim, LEVELS.medium.hit, LEVELS.medium.react], [0.68, 17, 0.6]);
  assert.deepEqual([LEVELS.tough.aim, LEVELS.tough.hit, LEVELS.tough.react], [0.82, 20, 0.4]);
  assert.equal(new Match().level, LEVELS.medium, 'it comes on Medium');
  // Easy never ramps more than it did, and level 1 is the plain match on every setting.
  assert.deepEqual(challengePlan(10, false), challengePlan(1, false));
  assert.deepEqual(challengePlan(1, true), challengePlan(1, false));
});

test('on Medium and Tough the levels ramp more: by level 10 their shots land more, take more off and come sooner, and they take more hits', () => {
  const first = start({ level: 'medium', levelNumber: 1 }).match;
  const last = start({ level: 'medium', levelNumber: 10 }).match;
  const easy = start({ level: 'gentle', levelNumber: 10 }).match;
  const [red1, red10, redEasy] = [reds(first)[0], reds(last)[0], reds(easy)[0]];
  for (const [match, red] of [[first, red1], [last, red10], [easy, redEasy]]) Object.assign(red, { x: 0, z: 0 });
  const still = (match, red) => {
    Object.assign(match.child, { x: 0, z: 6, speed: 0, sprinting: false });
    return match.chanceOn(match.child, red);
  };
  assert.ok(still(last, red10) >= Math.min(MOST_LANDS, still(first, red1) * 1.6), 'lands more often');
  assert.ok(still(last, red10) <= MOST_LANDS, 'though never every time');
  assert.equal(still(easy, redEasy), Math.min(MOST_LANDS, LEVELS.gentle.aim * levelPlan(10).aim), 'Easy as it was');
  assert.ok(last.botHit(red10, last.child) >= LEVELS.medium.hit * 1.15 - 1e-9);
  assert.equal(easy.botHit(redEasy, easy.child), LEVELS.gentle.hit);
  assert.ok(reds(last).filter(({ part }) => !part).every(({ most }) => most >= Math.round(HEALTH * levelPlan(10).health * 1.1)));
  assert.ok(reds(easy).filter(({ part }) => !part).every(({ most }) => most < Math.round(HEALTH * levelPlan(10).health * 1.1 * 1.25)));
  // They lead a player on the move: walking helps less at level 10 than at level 1. From far enough off that
  // neither is as likely as it can be.
  const walking = (match, red) => {
    Object.assign(match.child, { x: 0, z: 20, speed: PLAYER.run, sprinting: false });
    const moving = match.chanceOn(match.child, red);
    Object.assign(match.child, { speed: 0 });
    return moving / match.chanceOn(match.child, red);
  };
  assert.ok(walking(last, red10) > walking(first, red1) + 0.1, `${walking(last, red10)} against ${walking(first, red1)}`);
});

/** One of the other team, with Giraffe nearer to it than the player, both in plain sight. */
function giraffeNearer(options) {
  const { match } = start(options);
  const [red, ...others] = reds(match);
  const giraffe = match.troopers.find(({ who }) => who === 'giraffe');
  for (const each of [...others, ...match.troopers.filter(({ team, bot, who }) => team === 0 && bot && who !== 'giraffe')]) Object.assign(each, { x: 20, z: 13.5, bot: false });
  Object.assign(red, { x: -21, z: 0, heading: Math.PI, seen: null, safeLeft: 0 });
  Object.assign(giraffe, { x: -21, z: 4, bot: false, safeLeft: 0 });
  Object.assign(match.child, { x: -20, z: 9, heading: 0, safeLeft: 0 });
  match.update(STEP, STILL);
  return red.seen?.who ?? null;
}

test('from level 3 on Medium and Tough they go for the player first, rather than whoever is nearer', () => {
  assert.equal(giraffeNearer({ level: 'medium', levelNumber: 2 }), 'giraffe');
  assert.equal(giraffeNearer({ level: 'gentle', levelNumber: 10 }), 'giraffe');
  assert.equal(giraffeNearer({ level: 'medium', levelNumber: 3 }), 'child');
  assert.equal(giraffeNearer({ level: 'tough', levelNumber: 10 }), 'child');
});

test('from level 5 on Medium and Tough, one with nobody in sight goes where its team last saw the player', () => {
  for (const [options, hunts] of [[{ level: 'medium', levelNumber: 5 }, true], [{ level: 'medium', levelNumber: 4 }, false], [{ level: 'gentle', levelNumber: 10 }, false]]) {
    const { match } = start({ ...options, seed: 2 });
    const [red] = reds(match);
    for (const each of match.troopers.filter((one) => one !== red && one !== match.child)) Object.assign(each, { x: 20, z: 13.5, bot: false });
    Object.assign(match.child, { x: 13, z: 10, heading: 0 });
    Object.assign(red, { x: -20, z: -12, haunt: null, way: null });
    match.spotted = { x: 13, z: 10, at: match.time };
    match.update(STEP, STILL);
    const goingFor = red.haunt && Math.hypot(red.haunt.x - 13, red.haunt.z - 10) < 0.01;
    assert.equal(Boolean(goingFor), hunts, JSON.stringify(options));
  }
});

test('a player who has been tagged out is no longer hunted where they were last seen', () => {
  const { match } = start({ level: 'medium', levelNumber: 5, seed: 2 });
  const [red] = reds(match);
  match.spotted = { x: match.child.x, z: match.child.z, at: match.time };
  match.hit(match.child, HEALTH * 10, red);
  assert.equal(match.child.state, 'out');
  assert.equal(match.spotted, null);
});

test('from level 7 on Medium and Tough they all side-step while they fire, and on Easy only a runner does', () => {
  for (const [options, moves] of [[{ level: 'medium', levelNumber: 7 }, true], [{ level: 'medium', levelNumber: 6 }, false], [{ level: 'gentle', levelNumber: 7 }, false]]) {
    const { match } = start({ ...options, seed: 9 });
    const red = reds(match).find(({ part }) => !part);
    for (const each of match.troopers.filter((one) => one !== red && one !== match.child)) Object.assign(each, { x: 20, z: 13.5, bot: false });
    Object.assign(match.child, { x: -21, z: 13, heading: 0 });
    Object.assign(red, { x: -21, z: 4, heading: Math.PI, haunt: null });
    let moved = 0;
    for (let t = 0; t < 3; t += STEP) {
      const before = { x: red.x, z: red.z };
      Object.assign(match.child, { health: HEALTH, sinceHit: 0 });
      match.update(STEP, STILL);
      moved += Math.hypot(red.x - before.x, red.z - before.z);
    }
    assert.equal(red.seen, match.child);
    assert.equal(moved > 1, moves, `${JSON.stringify(options)}: moved ${moved.toFixed(2)}`);
  }
});

test('losing is likelier now: one who can hardly aim mostly loses on Medium by level 5, and level 10 beats an ordinary player', () => {
  const poor = { wobble: 0.1, reaction: 0.8, quick: 0.05 };
  const results = (options, player = {}) => [1, 2, 3, 4, 5, 6].map((seed) => {
    const { match } = start({ tags: 10, seed: seed + 20, ...options });
    playOut(match, { seed, ...player });
    return match.state;
  });
  // These made-up players won 5 and 5 of the 6 before.
  assert.ok(results({ level: 'medium', levelNumber: 5 }, poor).filter((state) => state === 'lost').length >= 2);
  assert.ok(results({ level: 'medium', levelNumber: 10 }).filter((state) => state === 'won').length <= 2);
  // And Easy still can't be lost.
  assert.ok(results({ level: 'gentle', levelNumber: 10 }, poor).every((state) => state === 'won'));
});
