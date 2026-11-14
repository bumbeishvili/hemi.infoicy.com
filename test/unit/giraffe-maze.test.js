// Giraffe's Maze: the mazes, walking towards the hand, what's in the way, the levels, the sun going down, and playing
// with friends. Everything here runs without a screen, with a pretend child holding their hand where each test says.
// The tests of the old kind rules play the gentle maze, with no sun, as soloRun does unless a test says otherwise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MazeRun } from '../../games/giraffe-maze/play.js';
import {
  buildMaze, castFor, deadEnds, distances, DX, DY, edgeKey, EXTRAS, featuresFor, FOUND_SECONDS, LABELS, MAZE_COUNTS,
  mazeLevel, mazeNewAt, modeWord, NEWS, newSeedWord, newsIsOn, newWalker, OUT_CELLS, readMode, REACHES, seededRandom,
  seedOf, SIZES, SLIDE_SECONDS, stepWalker, SUN, sunSeconds, WALK, walkerAt, wayToward,
} from '../../games/giraffe-maze/rules.js';
import { cleanWalker, MAX_RACERS, mostIn, RaceRoom } from '../../server/race-room.js';

const LEVELS = Array.from({ length: 10 }, (_, index) => index + 1);
const ROSTER = ['giraffe', 'truffle', 'kit', 'mochi', 'widget', 'frost', 'bramble', 'nova', 'cinder', 'tur'];
const SEEDS = ['KQZTRW', 'ABCDEF', 'MAZEGO', 'HEDGES', 'SPRING', 'QQQQQQ'];
const FRAME = 1 / 60;

/** Every way the walker went along was an open path: it's on a path between two cells, never in a hedge. */
function onAPath(maze, { x, y }) {
  const cx = x - 0.5;
  const cy = y - 0.5;
  const c = Math.round(cx);
  const r = Math.round(cy);
  const onRow = Math.abs(cy - r) < 1e-6;
  const onCol = Math.abs(cx - c) < 1e-6;
  if (onRow && onCol) return true;
  if (onRow) {
    const left = Math.floor(cx);
    return left >= 0 && left + 1 < maze.cols && maze.isOpen(maze.id(left, r), 1);
  }
  if (onCol) {
    const top = Math.floor(cy);
    return top >= 0 && top + 1 < maze.rows && maze.isOpen(maze.id(c, top), 2);
  }
  return false;
}

/**
 * A pretend child who leads the character along the way, a little ahead of it, with an open hand, the way the tests
 * of the real game do. At a sheep they hold the hand on it, and at a bush they rub it, back and forth.
 */
function leader(run, t) {
  const blocker = run.waitingAt;
  if (blocker && blocker.kind !== 'gate') {
    const wiggle = blocker.kind === 'bush' ? Math.sin(t * 9) * 0.3 : 0;
    const at = { x: blocker.x + wiggle, y: blocker.y };
    return { target: at, glove: at, open: true, gloveSpeed: blocker.kind === 'bush' ? 2.5 : 0 };
  }
  const at = run.wayAhead(run.nextCell(), 1.3);
  return { target: at, glove: at, open: true, gloveSpeed: 1 };
}

/** Plays until it's over or the time's up, and says how long it took. */
function playThrough(run, child = leader, seconds = 600) {
  run.begin();
  let t = 0;
  for (; t < seconds && !run.over; t += FRAME) run.update(FRAME, child(run, t));
  return t;
}

function soloRun(options = {}) {
  const level = options.level ?? 1;
  const mazes = options.mazes ?? 3;
  const log = [];
  const events = new Proxy({}, { get: (_, name) => (...args) => log.push([name, ...args]) });
  const run = new MazeRun({ seed: 'KQZTRW', size: 'medium', sun: 'gentle', cast: castFor(ROSTER, 'giraffe', mazes, level).map((id) => [id]), random: seededRandom(5), events, ...options, level });
  run.log = log;
  return run;
}

const said = (run, name) => run.log.filter(([event]) => event === name);

/**
 * A pretend child for a maze with the sun going down, whose hand moves along at speed cells a second, a little ahead
 * of the character, and who sees to a sheep or a bush as soon as the character is near it, and holds the hand there,
 * on it or rubbing it, until it's out of the way, as nothing moves by itself then.
 */
function hurrying(speed = 99) {
  let hand = null;
  return (run, t) => {
    const at = run.position;
    const blocker = run.layout.blockers.find((each) => !each.open && each.kind !== 'gate' && Math.hypot(each.x - at.x, each.y - at.y) < 1);
    const wanted = blocker ? { x: blocker.x + (blocker.kind === 'bush' ? Math.sin(t * 9) * 0.3 : 0), y: blocker.y } : run.wayAhead(run.nextCell(), 1.3);
    hand ??= { ...wanted };
    const gap = Math.hypot(wanted.x - hand.x, wanted.y - hand.y);
    const step = Math.min(gap, speed * FRAME);
    if (gap > 0) {
      hand.x += ((wanted.x - hand.x) / gap) * step;
      hand.y += ((wanted.y - hand.y) / gap) * step;
    }
    return { target: { ...hand }, glove: { ...hand }, open: true, gloveSpeed: blocker?.kind === 'bush' ? 2.5 : 1 };
  };
}

/* ---------- the mazes ---------- */

test('a maze is made from its seed: the same every time, another for another seed, with every cell joined up', () => {
  for (const size of Object.keys(SIZES)) {
    for (const seed of SEEDS) {
      const a = buildMaze({ seed, size, level: 4 });
      const b = buildMaze({ seed, size, level: 4 });
      assert.deepEqual([...a.maze.cells], [...b.maze.cells], 'the same seed, the same maze');
      assert.deepEqual(a.items.map(({ kind, cell }) => [kind, cell]), b.items.map(({ kind, cell }) => [kind, cell]));
      const reach = distances(a.maze, a.start);
      assert.ok([...reach].every((steps) => steps >= 0), `every cell can be reached in ${seed} ${size}`);
      assert.equal(a.maze.col(a.start), 0, 'the way in is on the left');
      assert.equal(a.maze.col(a.goal), a.maze.cols - 1, 'the friend waits on the right');
      assert.equal(a.cols, SIZES[size].cols);
    }
  }
  const one = buildMaze({ seed: 'KQZTRW' });
  const other = buildMaze({ seed: 'ABCDEF' });
  assert.notDeepEqual([...one.maze.cells], [...other.maze.cells]);
  const next = buildMaze({ seed: 'KQZTRW', index: 1 });
  assert.notDeepEqual([...one.maze.cells], [...next.maze.cells], 'each maze of a game is new');
});

test('the friend is a long way in, and there are a few ways round at level 1, fewer at level 10', () => {
  let loopsFirst = 0;
  let loopsLast = 0;
  for (const seed of SEEDS) {
    const first = buildMaze({ seed, size: 'medium', level: 1 });
    const last = buildMaze({ seed, size: 'medium', level: 10, features: featuresFor(10, 0, 'medium', { extras: false }) });
    assert.ok(first.way.length >= 7, `the way to the friend is ${first.way.length} cells`);
    const openings = (maze) => [...maze.cells].reduce((sum, bits) => sum + ((bits >> 1) & 1) + ((bits >> 2) & 1), 0);
    // A maze with exactly one way between any two cells has one fewer opening than it has cells.
    loopsFirst += openings(first.maze) - (first.maze.count - 1);
    loopsLast += openings(last.maze) - (last.maze.count - 1);
  }
  assert.ok(loopsFirst > loopsLast, `${loopsFirst} ways round at level 1, ${loopsLast} at level 10`);
  assert.ok(loopsLast >= SEEDS.length, 'still one or so at level 10');
});

test('a maze\'s size and seed go to friends as one word of letters, and come back the same', () => {
  for (const size of Object.keys(SIZES)) {
    const seed = newSeedWord(seededRandom(3));
    assert.match(seed, /^[A-Z]{6}$/);
    const word = modeWord(size, seed);
    assert.match(word, /^[A-Za-z]{1,12}$/, 'which is all the server lets a mode be');
    assert.deepEqual(readMode(word), { size, seed });
  }
  assert.deepEqual(readMode('nonsense'), { size: 'medium', seed: 'A' }, 'anything else is medium, with a seed of its own');
  assert.equal(seedOf('ABC'), seedOf('abc'));
  assert.notEqual(seedOf('ABC'), seedOf('ABD'));
});

/* ---------- walking ---------- */

test('the character only ever walks along the paths, never through a hedge, wherever the hand goes', () => {
  for (const seed of SEEDS) {
    const { maze, start } = buildMaze({ seed, size: 'hard', level: 1 });
    const walker = newWalker(start);
    const random = seededRandom(seedOf(seed));
    const limit = (a, d) => (maze.isOpen(a, d) ? 1 : 0);
    let target = { x: 4, y: 2 };
    for (let frame = 0; frame < 3000; frame += 1) {
      if (frame % 40 === 0) target = { x: random() * maze.cols, y: random() * maze.rows };
      stepWalker(maze, walker, target, WALK.speed * FRAME, { limit });
      assert.ok(onAPath(maze, walkerAt(maze, walker)), `on a path in ${seed} at frame ${frame}`);
    }
  }
});

test('it goes as near the hand as the paths let it, and then stands still, without going back and forth', () => {
  for (const seed of SEEDS) {
    const { maze, start } = buildMaze({ seed, size: 'medium', level: 1 });
    const limit = (a, d) => (maze.isOpen(a, d) ? 1 : 0);
    for (const target of [{ x: 6.5, y: 0.5 }, { x: 3.2, y: 2.7 }, { x: 0.1, y: 3.9 }]) {
      const walker = newWalker(start);
      for (let frame = 0; frame < 900; frame += 1) stepWalker(maze, walker, target, WALK.speed * FRAME, { limit });
      const settled = walkerAt(maze, walker);
      let moved = 0;
      for (let frame = 0; frame < 120; frame += 1) moved += stepWalker(maze, walker, target, WALK.speed * FRAME, { limit });
      assert.equal(moved, 0, `still, by ${JSON.stringify(settled)} for ${JSON.stringify(target)} in ${seed}`);
    }
  }
});

test('a hand in the next path along brings it straight there, and one right on it holds it still', () => {
  const { maze, start } = buildMaze({ seed: 'KQZTRW', size: 'medium', level: 1 });
  const limit = (a, d) => (maze.isOpen(a, d) ? 1 : 0);
  const walker = newWalker(start);
  const ahead = maze.centre(maze.next(start, 1));
  for (let frame = 0; frame < 60; frame += 1) stepWalker(maze, walker, ahead, WALK.speed * FRAME, { limit });
  assert.deepEqual(walkerAt(maze, walker), ahead, 'a cell along takes under half a second');
  const here = walkerAt(maze, walker);
  assert.equal(stepWalker(maze, walker, here, WALK.speed * FRAME, { limit }), 0);
});

test('finding its own way, it gets to the hand wherever it is, round any number of corners', () => {
  for (const seed of SEEDS) {
    const { maze, start } = buildMaze({ seed, size: 'hard', level: 10, features: featuresFor(10, 0, 'hard', { extras: false }) });
    const passable = (a, d) => maze.isOpen(a, d);
    const limit = (a, d) => (passable(a, d) ? 1 : 0);
    for (const cell of [maze.count - 1, maze.cols - 1, maze.id(0, maze.rows - 1)]) {
      const walker = newWalker(start);
      const target = maze.centre(cell);
      for (let frame = 0; frame < 60 * 40; frame += 1) {
        stepWalker(maze, walker, target, WALK.speed * FRAME, { limit, field: wayToward(maze, walker, target, passable) });
        assert.ok(onAPath(maze, walkerAt(maze, walker)));
      }
      assert.deepEqual(walkerAt(maze, walker), target, `found its way to ${cell} in ${seed}`);
    }
  }
});

test('something in the way can be walked up to, and never past', () => {
  for (const ways of ['lead', 'find']) {
    const run = soloRun({ level: 5, ways });
    run.begin();
    const sheep = run.layout.blockers.find(({ kind }) => kind === 'sheep');
    assert.ok(sheep, 'a sheep at level 5');
    // Just the other side of it, with a closed hand over it, so it stays asleep.
    run.walker = newWalker(sheep.a);
    const past = run.maze.centre(sheep.b);
    for (let t = 0; t < 4; t += FRAME) run.update(FRAME, { target: past, glove: null, open: true });
    const at = run.position;
    assert.ok(Math.abs(Math.hypot(at.x - sheep.x, at.y - sheep.y) - (0.5 - WALK.cap)) < 1e-6, `right up against the sheep, ${ways}`);
    assert.equal(run.waitingAt, sheep);
    // The hand anywhere beyond it: the character never gets past while it sleeps, which is less than the time it
    // takes to wake by itself.
    const side = distances(run.maze, run.layout.start, (a, d) => run.maze.isOpen(a, d) && edgeKey(a, run.maze.next(a, d)) !== edgeKey(sheep.a, sheep.b));
    for (let t = 0; t < EXTRAS.sheepWakes - 5; t += FRAME) {
      run.update(FRAME, { target: run.layout.lost[0], glove: null, open: true });
      assert.ok(side[run.walker.a] >= 0, `still this side of it, ${ways}`);
    }
    assert.equal(run.stats.found, 0);
  }
});

/* ---------- playing ---------- */

test('a child leading the way finds every friend, at every level and size, and the game ends', () => {
  for (const size of Object.keys(SIZES)) {
    for (const level of LEVELS) {
      const run = soloRun({ level, size, mazes: 3 });
      const seconds = playThrough(run);
      assert.ok(run.over, `level ${level} ${size} is over`);
      assert.equal(run.stats.found, 3);
      assert.equal(run.followers.length, 3, 'everyone found follows along');
      assert.ok(run.stats.fruit > 0);
      // Not too long for three mazes, even with all there is to do on the way.
      assert.ok(seconds < 200, `level ${level} ${size} took ${seconds.toFixed(0)} s`);
      assert.deepEqual(said(run, 'onMazeStart').map(([, index]) => index), [0, 1, 2]);
    }
  }
});

test('a closed hand, or one that can\'t be seen, never moves the character, and resting costs nothing', () => {
  for (const input of [{ target: { x: 6, y: 1 }, glove: { x: 6, y: 1 }, open: false, gloveSpeed: 0 }, { target: null, glove: null, open: false }]) {
    const run = soloRun({ level: 10 });
    run.begin();
    const before = run.position;
    for (let t = 0; t < 40; t += FRAME) run.update(FRAME, input);
    assert.deepEqual(run.position, before, 'it waits where it is');
    assert.equal(run.stats.walked, 0);
    assert.equal(run.phase, 'walking', 'nothing ends, and nothing is lost');
    assert.equal(run.stats.fruit, 0);
    // A closed hand over a sheep or a bush does nothing to it, and the power-ups don't run down.
    assert.ok(run.layout.blockers.every(({ progress }) => progress === 0));
    // And then the hand opens, and it's all still there to play.
    const seconds = playThrough(run);
    assert.ok(run.over && seconds < 120);
  }
});

test('an open hand held on a sleeping sheep wakes it in a second, and it hops out of the way', () => {
  const run = soloRun({ level: 5 });
  run.begin();
  const sheep = run.layout.blockers.find(({ kind }) => kind === 'sheep');
  const on = { target: sheep, glove: sheep, open: true, gloveSpeed: 0 };
  // A closed hand over it doesn't wake it.
  for (let t = 0; t < 3; t += FRAME) run.update(FRAME, { ...on, open: false });
  assert.equal(sheep.open, false);
  let t = 0;
  for (; t < 10 && !sheep.open; t += FRAME) run.update(FRAME, on);
  assert.ok(sheep.open && t <= EXTRAS.sheepWake + 0.1, `awake after ${t.toFixed(2)} s`);
  assert.equal(said(run, 'onUnblock')[0][1], sheep);
  assert.equal(run.stats.sheep, 1);
});

test('a sheep wakes by itself once the character has waited by it a while, so nobody gets stuck', () => {
  const run = soloRun({ level: 5, ways: 'find' });
  run.begin();
  const sheep = run.layout.blockers.find(({ kind }) => kind === 'sheep');
  const friend = run.layout.lost[0];
  // The hand far over by the friend, never on the sheep.
  const far = { target: friend, glove: friend, open: true, gloveSpeed: 0 };
  let t = 0;
  for (; t < 60 && !sheep.open; t += FRAME) run.update(FRAME, far);
  assert.ok(sheep.open, 'awake');
  assert.ok(sheep.waited >= EXTRAS.sheepWakes - 0.1 && t < 40, `after ${t.toFixed(1)} s, ${sheep.waited.toFixed(1)} of them waiting by it`);
});

test('a bush only goes for an open hand rubbing it: still, or closed, it stays', () => {
  const run = soloRun({ level: 8 });
  run.begin();
  const bush = run.layout.blockers.find(({ kind }) => kind === 'bush');
  assert.ok(bush, 'a bush at level 8, the newest thing, in the first maze');
  for (let t = 0; t < 3; t += FRAME) run.update(FRAME, { target: bush, glove: bush, open: true, gloveSpeed: 0 });
  assert.equal(bush.progress, 0, 'an open hand held still isn\'t rubbing');
  for (let t = 0; t < 3; t += FRAME) run.update(FRAME, { target: bush, glove: bush, open: false, gloveSpeed: 3 });
  assert.equal(bush.progress, 0, 'nor is a closed one');
  let t = 0;
  for (; t < 10 && !bush.open; t += FRAME) run.update(FRAME, { target: bush, glove: { x: bush.x + Math.sin(t * 9) * 0.3, y: bush.y }, open: true, gloveSpeed: 2.5 });
  assert.ok(bush.open && t <= EXTRAS.rubSeconds + 0.1, `rubbed away in ${t.toFixed(2)} s`);
});

test('a gate only opens for the key, which can always be got to without going through it', () => {
  for (const seed of SEEDS) {
    for (const size of Object.keys(SIZES)) {
      const layout = buildMaze({ seed, size, level: 3, features: featuresFor(3, 0, size) });
      const gate = layout.blockers.find(({ kind }) => kind === 'gate');
      if (!gate) continue;
      const key = layout.items.find(({ kind }) => kind === 'key');
      assert.ok(key, `a key for the gate in ${seed} ${size}`);
      const before = distances(layout.maze, layout.start, (a, d) => layout.maze.isOpen(a, d) && edgeKey(a, layout.maze.next(a, d)) !== edgeKey(gate.a, gate.b));
      assert.ok(before[key.cell] > 0, 'the key is on this side of the gate');
      assert.equal(before[layout.goal], -1, 'and the gate is the only way to the friend');
    }
  }
  const run = soloRun({ level: 3 });
  run.begin();
  const gate = run.layout.blockers.find(({ kind }) => kind === 'gate');
  // Led straight up to the gate, without the key.
  run.walker = newWalker(gate.a);
  const past = run.maze.centre(gate.b);
  for (let t = 0; t < 10; t += FRAME) run.update(FRAME, { target: past, glove: past, open: true });
  assert.equal(gate.open, false, 'without the key it stays shut');
  assert.equal(run.waitingAt, gate);
  assert.equal(said(run, 'onLocked').length, 1, 'and says to find the key, once');
  run.walker = newWalker(run.layout.start);
  const seconds = playThrough(run);
  assert.ok(gate.open && run.over && seconds < 120);
  assert.equal(run.stats.keys, 3, 'a key in each maze');
});

test('everything in the way is the only way on: there\'s no way round it', () => {
  for (const seed of SEEDS) {
    for (const level of [3, 5, 8, 10]) {
      for (const index of [0, 1, 2]) {
        const layout = buildMaze({ seed, index, size: 'hard', level, features: featuresFor(level, index, 'hard') });
        for (const blocker of layout.blockers) {
          const without = distances(layout.maze, layout.start, (a, d) => layout.maze.isOpen(a, d) && edgeKey(a, layout.maze.next(a, d)) !== edgeKey(blocker.a, blocker.b));
          assert.equal(without[blocker.b], -1, `${blocker.kind} at level ${level}`);
        }
      }
    }
  }
});

test('the running shoes make the character quicker, but only run down while the hand is open', () => {
  const run = soloRun({ level: 4 });
  run.begin();
  const shoes = run.layout.items.find(({ kind }) => kind === 'shoes');
  assert.ok(shoes, 'running shoes at level 4, on the way');
  for (let t = 0; t < 60 && !run.power; t += FRAME) run.update(FRAME, leader(run, t));
  assert.equal(run.power?.kind, 'shoes');
  const left = run.power.left;
  for (let t = 0; t < 5; t += FRAME) run.update(FRAME, { target: null, glove: null, open: false });
  assert.equal(run.power.left, left, 'resting never wastes them');
  const from = run.stats.walked;
  for (let t = 0; t < 0.5; t += FRAME) run.update(FRAME, leader(run, t));
  assert.ok(run.stats.walked - from > WALK.speed * 0.5 * 1.3, 'quicker than walking');
  assert.equal(run.index, 0);
  // An open hand held still on the character: they run down, as the hand is open, and run out.
  const still = () => {
    const at = run.position;
    return { target: at, glove: at, open: true, gloveSpeed: 0 };
  };
  for (let t = 0; t < EXTRAS.shoesSeconds; t += FRAME) run.update(FRAME, still());
  assert.equal(run.power, null, 'and they run out');
  assert.equal(run.index, 0);
});

test('the bluebird shows the way to the friend, and the magnet draws fruit in over the hedges', () => {
  const bird = soloRun({ level: 7 });
  bird.begin();
  for (let t = 0; t < 30 && !bird.bird; t += FRAME) bird.update(FRAME, leader(bird, t));
  assert.ok(bird.bird, 'the bluebird was met');
  const { cells } = bird.bird;
  assert.equal(cells.at(-1), bird.layout.lost[0].cell, 'its trail goes to the friend');
  for (let i = 1; i < cells.length; i += 1) {
    const d = [0, 1, 2, 3].find((way) => bird.maze.next(cells[i - 1], way) === cells[i]);
    assert.ok(d !== undefined && bird.maze.isOpen(cells[i - 1], d), 'along the paths');
  }
  const magnet = soloRun({ level: 9 });
  playThrough(magnet, (run, t) => (run.power ? { target: null, glove: null, open: true } : leader(run, t)), 30);
  assert.equal(magnet.power?.kind, 'magnet');
  const fruitBefore = magnet.stats.fruit;
  // The character stands still and the hand is open: fruit near it comes to it.
  const at = magnet.position;
  const near = magnet.layout.items.filter((item) => item.kind === 'fruit' && !item.gone && Math.hypot(item.x - at.x, item.y - at.y) < EXTRAS.magnetRange);
  for (let t = 0; t < 3; t += FRAME) magnet.update(FRAME, { target: at, glove: at, open: true });
  assert.equal(magnet.stats.fruit, fruitBefore + near.length, `${near.length} fruit drawn in`);
});

test('butterflies come along from level 2, and the glove catches one by coming near it, open or closed', () => {
  assert.equal(featuresFor(1).butterflies, false);
  const run = soloRun({ level: 2 });
  run.begin();
  for (let t = 0; t < 10 && !run.butterflies.length; t += FRAME) run.update(FRAME, { target: null, glove: null, open: false });
  assert.equal(run.butterflies.length, 1);
  const fly = run.butterflies[0];
  run.update(FRAME, { target: null, glove: { x: fly.x, y: fly.y }, open: false });
  assert.equal(run.stats.prizes.butterfly, 1, 'caught by a closed hand too');
  assert.equal(run.butterflies.length, 0);
});

test('gems wait in the dead ends from level 6, and a treasure chest with a crown at level 10', () => {
  for (const seed of SEEDS) {
    for (const size of Object.keys(SIZES)) {
      const layout = buildMaze({ seed, size, level: 10, features: featuresFor(10, 0, size) });
      const ends = deadEnds(layout.maze);
      const gems = layout.items.filter(({ kind }) => kind === 'gem');
      const chest = layout.items.filter(({ kind }) => kind === 'chest');
      assert.equal(chest.length, 1, `a chest in ${seed} ${size}`);
      assert.equal(gems.length, EXTRAS.gems, `gems in ${seed} ${size}`);
      // In a dead end, unless they're all taken, and then down a side path, but never past the friend.
      const goal = layout.lost[0].cell;
      const before = distances(layout.maze, layout.start, (a, d) => layout.maze.isOpen(a, d) && a !== goal);
      const freeEnds = ends.filter((cell) => before[cell] >= 0 && !layout.items.some((item) => item.cell === cell && !['gem', 'chest'].includes(item.kind)) && cell !== layout.start && cell !== goal);
      const hidden = [...gems, ...chest].filter((item) => ends.includes(item.cell)).length;
      assert.equal(hidden, Math.min(freeEnds.length, gems.length + chest.length), `${seed} ${size}`);
    }
  }
  assert.equal(featuresFor(5).gems, 0);
  assert.equal(featuresFor(6).gems, EXTRAS.gems);
  const run = soloRun({ level: 10, ways: 'find' });
  const chest = run.layout.items.find(({ kind }) => kind === 'chest');
  playThrough(run, (each, t) => (each.index === 0 && !chest.opened ? { target: chest, glove: chest, open: true } : leader(each, t)));
  assert.ok(chest.opened);
  assert.ok(run.stats.prizes.crown >= 1);
});

test('a helper is where every way to the child\'s first goal goes past, the key if there\'s a gate, so it\'s met', () => {
  let checked = 0;
  for (const seed of SEEDS) {
    for (const size of Object.keys(SIZES)) {
      for (const level of [4, 7, 9, 10]) {
        for (const index of [0, 1, 2]) {
          const layout = buildMaze({ seed, index, size, level, features: featuresFor(level, index, size) });
          const helper = layout.items.find(({ kind }) => ['shoes', 'bird', 'magnet'].includes(kind));
          assert.ok(helper, `a helper in ${seed} ${size} ${level} ${index}`);
          const key = layout.items.find(({ kind }) => kind === 'key');
          const first = key ? key.cell : layout.goal;
          const without = distances(layout.maze, layout.start, (a, d) => layout.maze.isOpen(a, d) && layout.maze.next(a, d) !== helper.cell);
          assert.ok(without[first] < 0 || without[layout.goal] < 0, `${helper.kind} can't be gone round, in ${seed} ${size} ${level} ${index}`);
          checked += 1;
        }
      }
    }
  }
  assert.equal(checked, SEEDS.length * 3 * 4 * 3);
});

test('on their own, everything to pick up can be got to before the friend, as finding them ends the maze', () => {
  for (const seed of SEEDS) {
    for (const size of Object.keys(SIZES)) {
      for (const level of [1, 6, 10]) {
        for (const index of [0, 1, 2]) {
          const layout = buildMaze({ seed, index, size, level, features: featuresFor(level, index, size) });
          const goal = layout.lost[0].cell;
          const before = distances(layout.maze, layout.start, (a, d) => layout.maze.isOpen(a, d) && a !== goal);
          for (const item of layout.items) assert.ok(before[item.cell] >= 0 && item.cell !== goal, `${item.kind} in ${seed} ${size} ${level} ${index}`);
        }
      }
    }
  }
});

test('a friend found cheers for a moment, and then the next maze comes in, with no waiting about', () => {
  const run = soloRun({ level: 1, mazes: 2 });
  run.begin();
  let t = 0;
  for (; t < 60 && run.phase === 'walking'; t += FRAME) run.update(FRAME, leader(run, t));
  assert.equal(run.phase, 'found');
  assert.equal(said(run, 'onFound').length, 1);
  let gap = 0;
  for (; run.phase !== 'walking' && gap < 5; gap += FRAME) run.update(FRAME, { target: null, glove: null, open: false });
  assert.equal(run.index, 1);
  assert.ok(Math.abs(gap - (FOUND_SECONDS + SLIDE_SECONDS)) < 0.1, `${gap.toFixed(2)} s between mazes, resting or not`);
  assert.deepEqual(run.position, run.layout.maze.centre(run.layout.start), 'in at the way in of the next one');
});

test('the levels: each brings what it says, nothing is new at level 1, and the newest is in the first maze', () => {
  assert.deepEqual(mazeNewAt(1), []);
  for (const level of LEVELS.slice(1)) {
    const news = mazeNewAt(level);
    assert.ok(news.length >= 1, `something new at level ${level}`);
    for (const { key, name, nameKa, mark } of news) {
      assert.ok(name && nameKa && mark);
      assert.ok(newsIsOn(key, level), `${key} is on at ${level}`);
      assert.ok(!newsIsOn(key, level - 1), `${key} isn't on before ${level}`);
    }
  }
  // The newest obstacle or helper is in the first maze of a game at its level.
  const firsts = { 3: 'gate', 5: 'sheep', 8: 'bush' };
  for (const [level, kind] of Object.entries(firsts)) assert.equal(featuresFor(Number(level), 0, 'easy').obstacles[0], kind);
  const helpers = { 4: 'shoes', 7: 'bird', 9: 'magnet' };
  for (const [level, kind] of Object.entries(helpers)) assert.equal(featuresFor(Number(level), 0).helper, kind);
  // The others take turns, and no maze has more in the way than its size has room for.
  assert.deepEqual([0, 1, 2].map((index) => featuresFor(10, index, 'easy').obstacles), [['bush'], ['sheep'], ['gate']]);
  for (const size of Object.keys(SIZES)) for (const index of [0, 1, 2, 3]) assert.ok(featuresFor(10, index, size).obstacles.length <= SIZES[size].obstacles);
  // With friends, it's the plain maze at any level.
  assert.deepEqual(featuresFor(10, 0, 'hard', { extras: false }), { obstacles: [], helper: null, gems: 0, chest: false, butterflies: false });
  // Every new thing has a label in English and Georgian.
  for (const key of ['butterfly', 'key', 'locked', 'shoes', 'sheep', 'gem', 'bird', 'bush', 'magnet', 'chest']) assert.equal(LABELS[key].length, 2);
  assert.ok(Object.keys(NEWS).every((level) => Number(level) >= 2 && Number(level) <= 10));
  assert.equal(mazeLevel(1).butterflies, false);
});

test('the friends lost in each maze are never the child\'s own character, and a new one comes each level', () => {
  for (const mine of ROSTER) {
    const cast = castFor(ROSTER, mine, 5, 1);
    assert.equal(new Set(cast).size, 5);
    assert.ok(!cast.includes(mine));
  }
  assert.notEqual(castFor(ROSTER, 'giraffe', 3, 1)[0], castFor(ROSTER, 'giraffe', 3, 2)[0]);
  assert.ok(castFor(ROSTER, 'kit', 3, 1).includes('giraffe') || castFor(ROSTER, 'kit', 9, 1).includes('giraffe'), 'Giraffe can be lost when the child plays someone else');
});

/* ---------- racing friends ---------- */

/** Friends' games, racing: each makes the same mazes from the same seed, and needs nothing from the others'. */
function race(players = ['aaaa', 'bbbb'], { level = 3, size = 'medium', mazes = 2 } = {}) {
  const runs = {};
  for (const id of players) {
    const log = [];
    const events = new Proxy({}, { get: (_, name) => (...args) => log.push([name, ...args]) });
    runs[id] = new MazeRun({ seed: 'MAZEGO', size, level, mazes, race: true, events, random: seededRandom(9) });
    runs[id].log = log;
  }
  return runs;
}

const RESTING = { target: null, glove: null, open: false };

test('with friends it\'s a race: everyone\'s mazes are the same, with nobody lost in them, and the way out on the right', () => {
  const [a, b, c] = Object.values(race(['aaaa', 'bbbb', 'cccc'], { mazes: 3 }));
  assert.deepEqual([a.race, a.mazes], [true, 3]);
  assert.deepEqual([...a.layout.maze.cells], [...b.layout.maze.cells]);
  assert.deepEqual(a.layout.items.map(({ k, cell }) => [k, cell]), c.layout.items.map(({ k, cell }) => [k, cell]));
  for (const seed of SEEDS) {
    for (const size of Object.keys(SIZES)) {
      for (const level of [1, 10]) {
        for (let index = 0; index < 5; index += 1) {
          const plain = featuresFor(level, index, size, { extras: false });
          const layout = buildMaze({ seed, index, size, level, features: plain, race: true });
          const { maze, goal, start } = layout;
          const where = `${seed} ${size} level ${level} maze ${index}`;
          assert.deepEqual(layout.lost, [], `nobody is lost: ${where}`);
          assert.equal(layout.race, true);
          assert.equal(maze.col(goal), maze.cols - 1, `the way out is on the right: ${where}`);
          assert.ok(distances(maze, start)[goal] > 0, `and can be got to: ${where}`);
          assert.ok(layout.blockers.length === 0 && layout.items.every(({ kind }) => kind === 'fruit'), `the plain maze, with its fruit: ${where}`);
          // The fruit is where it would be on their own, without the friend by the way out.
          const own = buildMaze({ seed, index, size, level, features: plain });
          assert.deepEqual([...layout.maze.cells], [...own.maze.cells], where);
          assert.deepEqual(layout.items.map(({ cell, fruit }) => [cell, fruit]), own.items.map(({ cell, fruit }) => [cell, fruit]), where);
          assert.equal(own.lost[0].cell, goal);
          // Nothing lies on the way out, or anywhere only got to past it, as getting there is getting out.
          const before = distances(maze, start, (cell, d) => maze.isOpen(cell, d) && cell !== goal);
          assert.ok(layout.items.every(({ cell }) => cell !== goal && before[cell] >= 0), where);
        }
      }
    }
  }
});

test('in a race, each goes through the mazes at their own pace, walking out of each, and nobody waits for anyone', () => {
  const { aaaa: ana, bbbb: ben } = race(['aaaa', 'bbbb']);
  ana.begin();
  ben.begin();
  // Ana leads the way, and Ben rests.
  let furthestOut = 0;
  for (let t = 0; t < 400 && !ana.over; t += FRAME) {
    ana.update(FRAME, leader(ana, t));
    ben.update(FRAME, RESTING);
    if (ana.phase === 'out') furthestOut = Math.max(furthestOut, ana.position.x - ana.layout.cols);
  }
  assert.ok(ana.over, 'Ana got out of both');
  assert.deepEqual([ana.stats.out, ana.stats.found], [2, 0]);
  assert.deepEqual(said(ana, 'onOut').map(([, index, last]) => [index, last]), [[0, false], [1, true]]);
  assert.equal(said(ana, 'onFound').length, 0);
  // Out of each, she walked on through the way out, past the maze's edge, and is still out of it at the end.
  assert.ok(Math.abs(furthestOut - (OUT_CELLS - 0.5)) < 1e-6, `${furthestOut}`);
  assert.ok(ana.position.x > ana.layout.cols);
  assert.ok(ana.stats.fruit > 3, `${ana.stats.fruit} fruit`);
  // Ben is still at the way in of the first maze, as nothing waits for anyone, and all its fruit is still there.
  assert.equal(ben.over, false);
  assert.deepEqual([ben.index, ben.phase, ben.stats.out, ben.stats.walked], [0, 'walking', 0, 0]);
  assert.ok(ben.layout.items.every(({ gone }) => !gone), 'Ana going by first leaves Ben just as much');
  // Now Ben goes, and finds as much as she did along the same way.
  for (let t = 0; t < 400 && !ben.over; t += FRAME) ben.update(FRAME, leader(ben, t));
  assert.ok(ben.over);
  assert.equal(ben.stats.out, 2);
  assert.equal(ben.stats.fruit, ana.stats.fruit);
});

test('in a race, getting out is reaching the last cell by the way out, and a closed hand never gets anyone out', () => {
  const [run] = Object.values(race(['aaaa'], { mazes: 2, size: 'easy' }));
  run.begin();
  const { maze, goal } = run.layout;
  const way = maze.centre(goal);
  // Standing in the cell next to it, with the hand closed on it, nothing happens however long it's held.
  const beside = [0, 1, 2, 3].filter((d) => maze.isOpen(goal, d)).map((d) => maze.next(goal, d))[0];
  run.walker = newWalker(beside);
  for (let t = 0; t < 5; t += FRAME) run.update(FRAME, { target: way, glove: way, open: false });
  assert.deepEqual([run.phase, run.walker.a, run.stats.out], ['walking', beside, 0]);
  // An open hand on it, and the character walks up to it and out.
  for (let t = 0; t < 5 && run.phase === 'walking'; t += FRAME) run.update(FRAME, { target: way, glove: way, open: true });
  assert.equal(run.phase, 'out');
  assert.equal(run.stats.out, 1);
  for (let t = 0; t < FOUND_SECONDS + 0.05; t += FRAME) run.update(FRAME, RESTING);
  assert.equal(run.phase, 'sliding');
  assert.ok(run.position.x > maze.cols, 'out past the edge while the next maze comes in');
  for (let t = 0; t < SLIDE_SECONDS + 0.05; t += FRAME) run.update(FRAME, RESTING);
  assert.deepEqual([run.index, run.phase], [1, 'walking']);
  assert.deepEqual(run.position, run.layout.maze.centre(run.layout.start), 'at the way in of the next one');
});

test('a friends\' game holds four, the fifth is told it\'s full, and each one\'s walker goes to the others, cleaned', () => {
  assert.equal(mostIn('giraffe-maze'), MAX_RACERS);
  assert.equal(MAX_RACERS, 4);
  const players = [];
  let clock = 1000;
  const rules = new RaceRoom({ players: () => players }, () => clock);
  const join = (id) => {
    const player = { meta: null, heard: [], setMeta(meta) { this.meta = meta; }, send(message) { this.heard.push(message); }, close() {} };
    players.push(player);
    clock += 10;
    return rules.arrive(player, id, null, { most: mostIn('giraffe-maze'), making: players.length === 1 }) ? player : null;
  };
  const four = ['aaaaaaaa', 'bbbbbbbb', 'cccccccc', 'dddddddd'].map(join);
  assert.ok(four.every(Boolean));
  const fifth = { meta: null, heard: [], setMeta(meta) { this.meta = meta; }, send(message) { this.heard.push(message); }, close() {} };
  players.push(fifth);
  assert.equal(rules.arrive(fifth, 'eeeeeeee', null, { most: mostIn('giraffe-maze') }), false);
  assert.equal(fifth.heard.at(-1).t, 'full');
  players.pop();
  for (const player of four) rules.hear(player, JSON.stringify({ t: 'ready' }));
  const points = Array.from({ length: 42 }, (_, i) => (i % 2 ? 0.123456 : -9));
  rules.hear(four[1], JSON.stringify({ t: 'walker', ms: 1500.4, z: 1, x: 3.14159, y: 99, f: 2, m: 1, v: 1, o: 1, gx: 4.567, gy: 1.234, p: points, picture: 'not this' }));
  const heard = four[0].heard.filter(({ t }) => t === 'walker').at(-1);
  assert.deepEqual(Object.keys(heard), ['t', 'from', 'ms', 'z', 'x', 'y', 'f', 'm', 'v', 'o', 'gx', 'gy', 'p']);
  assert.equal(heard.from, 'bbbbbbbb');
  assert.equal(heard.x, 3.14);
  assert.equal(heard.y, 40, 'no further off than a maze can go');
  assert.deepEqual(heard.p.slice(0, 2), [-4, 0.12]);
  assert.equal(four[1].heard.filter(({ t }) => t === 'walker').length, 0, 'nobody hears their own');
  assert.deepEqual(cleanWalker({ v: 0, o: 1, x: 'x', f: 9, p: [1, 2] }), { ms: 0, z: 0, x: 0, y: 0, f: 3, m: 0, v: 0, o: 0, gx: 0, gy: 0, p: [] });
  const biggest = JSON.stringify({ t: 'walker', from: 'abcdefghijkl', ...cleanWalker({ ms: 3_599_999, z: 20, x: 39.99, y: 39.99, f: 3, m: 1, v: 1, o: 1, gx: 39.99, gy: 39.99, p: Array(42).fill(-3.99) }) });
  assert.ok(biggest.length < 400, `${biggest.length} characters at most`);
});

test('the game\'s rooms are known to both servers', () => {
  for (const file of ['../../server/worker.js', '../../tools/race-server.mjs']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /const GAMES = \[[^\]]*'giraffe-maze'/, file);
  }
  const friends = readFileSync(new URL('../../core/friends.js', import.meta.url), 'utf8');
  assert.match(friends, /'walker'[^\]]*\]\.includes\(message\.t\)/, 'a friend\'s walker is passed on to the game');
});

test('every line the game says has its English and Georgian voice files', () => {
  const folder = new URL('../../games/giraffe-maze/audio/voice/', import.meta.url);
  const lines = JSON.parse(readFileSync(new URL('lines.json', folder), 'utf8'));
  assert.ok(lines.length >= 12);
  for (const { id, ka } of lines) {
    assert.ok(ka, `${id} has Georgian`);
    for (const language of ['en', 'ka']) assert.ok(readFileSync(new URL(`${language}/${id}.ogg`, folder)).length > 1000, `${language}/${id}.ogg`);
  }
  const source = readFileSync(new URL('../../games/giraffe-maze/main.js', import.meta.url), 'utf8');
  for (const { text } of lines) assert.ok(source.includes(text), `"${text}" is said by the game`);
});

test('a resting child is never hurried: nothing in a maze has a time limit, and nothing is missed for resting', () => {
  const run = soloRun({ level: 10 });
  run.begin();
  const items = run.layout.items.length;
  for (let t = 0; t < 120; t += FRAME) run.update(FRAME, { target: null, glove: null, open: false });
  assert.equal(run.layout.items.filter(({ gone }) => !gone).length, items, 'everything is still there');
  assert.equal(run.index, 0);
  assert.ok(MAZE_COUNTS.includes(3));
  // A walker never moves without an open hand, even near a waiting power-up.
  assert.deepEqual(run.position, run.layout.maze.centre(run.layout.start));
  assert.ok(REACHES.pick < 0.5, 'things are picked up from their own cell only');
  assert.equal(DX.length + DY.length, 8);
});

/* ---------- the sun going down ---------- */

const sunRun = (options = {}) => soloRun({ sun: 'sets', ...options });

test('on their own the sun goes down over each maze, while the hand is in the picture, open or closed, and not while it isn\'t', () => {
  const run = sunRun({ level: 1 });
  run.begin();
  assert.equal(run.timed, true);
  const { total } = run.sun;
  assert.ok(Math.abs(total - sunSeconds(run.layout, 1)) < 1e-9);
  // No hand: nothing goes down, however long it's away.
  for (let t = 0; t < 120; t += FRAME) run.update(FRAME, { target: null, glove: null, open: false });
  assert.equal(run.sun.left, total);
  // A closed hand in the picture: it goes down all the same.
  const closed = { target: { x: 1, y: 1 }, glove: { x: 1, y: 1 }, open: false, gloveSpeed: 0 };
  for (let t = 0; t < 5; t += FRAME) run.update(FRAME, closed);
  assert.ok(Math.abs(run.sun.left - (total - 5)) < 0.05, `${run.sun.left} left`);
});

test('the sun setting before the friend is found ends the game, a moment later, and nobody is found', () => {
  const run = sunRun({ level: 1 });
  run.begin();
  const closed = { target: { x: 1, y: 1 }, glove: { x: 1, y: 1 }, open: false, gloveSpeed: 0 };
  let t = 0;
  for (; t < 300 && run.phase === 'walking'; t += FRAME) run.update(FRAME, closed);
  assert.ok(Math.abs(t - run.sun.total) < 0.05, `set after ${t} s`);
  assert.deepEqual([run.phase, run.lost, run.over, run.sun.left], ['sunset', true, false, 0]);
  assert.equal(said(run, 'onSunset').length, 1);
  assert.equal(said(run, 'onSunset')[0][1], run.layout.lost[0]);
  // A moment for it to be seen, then it's over, whatever the hand does.
  let after = 0;
  for (; after < 10 && !run.over; after += FRAME) run.update(FRAME, hurrying()(run, after));
  assert.ok(Math.abs(after - SUN.setSeconds) < 0.05, `${after} s`);
  assert.deepEqual([run.over, run.lost, run.stats.found, run.index], [true, true, 0, 0]);
  assert.equal(said(run, 'onOver').length, 1);
});

test('with the sun going down a sheep or a bush never gets out of the way by itself', () => {
  for (const [level, kind] of [[5, 'sheep'], [8, 'bush']]) {
    const run = sunRun({ level, ways: 'find' });
    run.begin();
    const blocker = run.layout.blockers.find((each) => each.kind === kind);
    const friend = run.layout.lost[0];
    const far = { target: friend, glove: friend, open: true, gloveSpeed: 0 };
    for (let t = 0; t < 60 && !run.over; t += FRAME) run.update(FRAME, far);
    assert.equal(blocker.open, false, `the ${kind} is still there`);
    assert.equal(run.lost, true, 'and the sun set');
  }
});

test('with the sun going down a child who leads the way, and sees to what\'s in it, finds every friend, at every level and size', () => {
  for (const size of Object.keys(SIZES)) {
    for (const level of LEVELS) {
      const run = sunRun({ level, size });
      playThrough(run, hurrying());
      assert.ok(run.over && !run.lost, `level ${level} ${size}: ${run.lost ? 'the sun set' : 'not over'}`);
      assert.equal(run.stats.found, 3);
    }
  }
});

test('the sun is slower at level 1 and quicker at level 10: a slow hand finds everyone at level 1, and not at level 10', () => {
  for (const size of ['medium', 'hard']) {
    const first = sunRun({ level: 1, size });
    playThrough(first, hurrying(0.8));
    assert.ok(!first.lost && first.stats.found === 3, `level 1 ${size}`);
    const last = sunRun({ level: 10, size });
    playThrough(last, hurrying(0.8));
    assert.ok(last.lost, `level 10 ${size}`);
  }
  // The same maze has less time at each level up, and level 10 has under half of level 1's.
  const layout = sunRun({ level: 1, size: 'hard' }).layout;
  const times = LEVELS.map((level) => sunSeconds(layout, level));
  for (const level of LEVELS.slice(1)) assert.ok(times[level - 1] < times[level - 2]);
  assert.ok(times[9] < times[0] / 2, `${times[0].toFixed(1)} s at level 1, ${times[9].toFixed(1)} s at level 10`);
  assert.equal(mazeLevel(1).sunBase, SUN.base[0]);
  assert.equal(mazeLevel(10).sunSlack, SUN.slack[1]);
});

test('the gentle maze has no sun, and in a race there\'s none either: the race is the contest', () => {
  const gentle = soloRun({ level: 10, sun: 'gentle' });
  gentle.begin();
  assert.deepEqual([gentle.timed, gentle.sun], [false, null]);
  const closed = { target: { x: 1, y: 1 }, glove: { x: 1, y: 1 }, open: false, gloveSpeed: 0 };
  for (let t = 0; t < 400; t += FRAME) gentle.update(FRAME, closed);
  assert.deepEqual([gentle.phase, gentle.lost], ['walking', false]);
  const race = new MazeRun({ seed: 'MAZEGO', size: 'medium', level: 10, mazes: 2, race: true, sun: 'sets', random: seededRandom(9) });
  race.begin();
  assert.deepEqual([race.timed, race.sun], [false, null]);
  for (let t = 0; t < 400; t += FRAME) race.update(FRAME, closed);
  assert.deepEqual([race.phase, race.lost], ['walking', false]);
});

test('the grown-ups\' settings: the sun going down and the big maze come first, and the gentle maze can be chosen', () => {
  const source = readFileSync(new URL('../../games/giraffe-maze/main.js', import.meta.url), 'utf8');
  assert.match(source, /defaults: \{ mazeSize: 'hard', mazeSun: 'sets', /);
  assert.match(source, /choice\('mazeSun', 'gentle', 'Gentle: /);
});
