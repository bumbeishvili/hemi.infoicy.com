// Giraffe's Riddle Doors: the riddles, each with one piece that fits its rule and others that each break it, what
// each level brings, an open hand settling on a piece and holding it in the gap, the candles, and the same doors on
// every friend's computer. Everything here runs without a screen, with a pretend child moving a glove over the hall.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CANDLES, DARK_SECONDS, doorLevel, doorNewAt, Doors, DOORS, GRABS, GRACE, LABELS, layoutFor, LOOK_AFTER, NEWS, newsIsOn,
  OPEN_SECONDS, PICK_SECONDS, planDoors, TABLE, TRIED, TRY_SECONDS,
} from '../../games/riddle-doors/doors.js';
import { COLOURS, KINDS, keyOf, makeRiddle, MOST_COUNT, OUTLINES, SHAPES, seededRandom, STICK_ENDS } from '../../games/riddle-doors/riddles.js';
import { LAST_LEVEL } from '../../core/levels.js';

const FRAME = 1 / 60;
const LEVELS = Array.from({ length: LAST_LEVEL }, (_, index) => index + 1);
const SEEDS = Array.from({ length: 150 }, (_, index) => index * 7919 + 3);

/* ---------- the riddles ---------- */

const rows = (riddle, cells = riddle.cells) => Array.from({ length: riddle.size }, (_, row) => cells.slice(row * riddle.size, (row + 1) * riddle.size));
const columns = (grid) => grid[0].map((_, col) => grid.map((row) => row[col]));
const allSame = (list) => new Set(list).size === 1;
const allDifferent = (list) => new Set(list).size === list.length;
const steps = (list) => list.slice(1).map((value, at) => value - list[at]);
const turnSteps = (list) => list.slice(1).map((value, at) => (((value - list[at]) % 8) + 8) % 8);
/** What changes from one picture to another: the names of what's different, with their new values. */
const change = (a, b) => JSON.stringify(Object.keys(a).filter((name) => a[name] !== b[name]).map((name) => [name, b[name]]));

/**
 * Whether a whole square of pictures, with something in the gap, keeps its kind's rule: worked out here from the
 * pictures alone, not from how riddles.js made them, so a riddle with two answers, or none, is found.
 */
function keepsRule(kind, grid) {
  const of = (row, name) => row.map((cell) => cell[name]);
  switch (kind) {
    case 'rows':
      return grid.every((row) => allSame(row.map(keyOf)));
    case 'two':
      return change(grid[0][0], grid[0][1]) === change(grid[1][0], grid[1][1]) && change(grid[0][0], grid[1][0]) === change(grid[0][1], grid[1][1]) && grid[0][0] !== grid[1][1];
    case 'count': {
      const way = steps(of(grid[0], 'count'))[0];
      return Math.abs(way) === 1 && grid.every((row) => allSame(of(row, 'shape')) && allSame(of(row, 'colour')) && allSame(of(row, 'size')) && steps(of(row, 'count')).every((step) => step === way));
    }
    case 'grow': {
      const way = steps(of(grid[0], 'size'))[0];
      return Math.abs(way) === 1 && grid.every((row) => allSame(of(row, 'shape')) && allSame(of(row, 'colour')) && allSame(of(row, 'count')) && steps(of(row, 'size')).every((step) => step === way));
    }
    case 'turn': {
      const way = turnSteps(of(grid[0], 'turn'))[0];
      return way !== 0 && grid.every((row) => allSame(of(row, 'colour')) && turnSteps(of(row, 'turn')).every((step) => step === way));
    }
    case 'once': {
      const three = new Set(of(grid[0], 'shape'));
      return three.size === 3 && grid.every((row) => allSame(of(row, 'colour')) && allSame(of(row, 'count')) && allSame(of(row, 'size')) && allDifferent(of(row, 'shape')) && of(row, 'shape').every((shape) => three.has(shape)));
    }
    case 'add':
      return grid.every((row) => allSame(of(row, 'colour')) && (row[0].sticks & row[1].sticks) === 0 && row[2].sticks === (row[0].sticks | row[1].sticks));
    case 'take':
      return grid.every((row) => allSame(of(row, 'colour')) && (row[1].sticks & ~row[0].sticks) === 0 && row[2].sticks === (row[0].sticks & ~row[1].sticks));
    case 'double': {
      const three = new Set(of(grid[0], 'colour'));
      return three.size === 3 && grid.every((row) => allSame(of(row, 'shape')) && steps(of(row, 'count')).every((step) => step === 1) && allDifferent(of(row, 'colour')) && of(row, 'colour').every((colour) => three.has(colour)));
    }
    case 'inside': {
      const three = new Set(of(grid[0], 'outer'));
      return three.size === 3 && grid.every((row) => allSame(of(row, 'colour')) && allDifferent(of(row, 'outer')) && of(row, 'outer').every((outer) => three.has(outer))) && columns(grid).every((column) => allSame(of(column, 'inner')));
    }
    default:
      return false;
  }
}

test('every kind of riddle has exactly one piece that keeps its rule, among pieces that are all different, however many there are', () => {
  for (const kind of KINDS) {
    for (const choices of [3, 4, 5, 6]) {
      for (const seed of SEEDS) {
        const riddle = makeRiddle(kind, seededRandom(seed), { choices, level: 10 });
        const where = `${kind}, ${choices} pieces, seed ${seed}`;
        assert.equal(riddle.size, ['rows', 'two'].includes(kind) ? 2 : 3, where);
        assert.equal(riddle.cells.length, riddle.size ** 2, where);
        assert.equal(riddle.hole, riddle.cells.length - 1, where);
        assert.equal(riddle.cells[riddle.hole], null, where);
        assert.equal(riddle.options.length, choices, where);
        assert.ok(allDifferent(riddle.options.map(keyOf)), `${where}: two pieces the same`);
        assert.equal(keyOf(riddle.options[riddle.right]), keyOf(riddle.answer), where);
        const fits = riddle.options.filter((option) => keepsRule(kind, rows(riddle, [...riddle.cells.slice(0, -1), option])));
        assert.deepEqual(fits.map(keyOf), [keyOf(riddle.answer)], `${where}: ${fits.length} pieces fit`);
      }
    }
  }
});

test('every picture in a riddle can be drawn: its shapes, colours, counts, sizes, arrows and sticks are all ones there are', () => {
  for (const kind of KINDS) {
    for (const seed of SEEDS) {
      const riddle = makeRiddle(kind, seededRandom(seed), { choices: 6, level: 10 });
      for (const cell of [...riddle.cells.filter(Boolean), ...riddle.options]) {
        assert.ok(COLOURS.includes(cell.colour), `${kind}: ${keyOf(cell)}`);
        if (cell.look === 'shapes') {
          assert.ok(SHAPES.includes(cell.shape) && cell.count >= 1 && cell.count <= MOST_COUNT && cell.size >= 0 && cell.size <= 2, keyOf(cell));
        } else if (cell.look === 'arrow') {
          assert.ok(Number.isInteger(cell.turn) && cell.turn >= 0 && cell.turn < 8, keyOf(cell));
        } else if (cell.look === 'sticks') {
          assert.ok(cell.sticks > 0 && cell.sticks < 2 ** STICK_ENDS.length, keyOf(cell));
        } else {
          assert.equal(cell.look, 'nest');
          assert.ok(OUTLINES.includes(cell.outer) && SHAPES.includes(cell.inner), keyOf(cell));
        }
      }
    }
  }
});

test('the pieces that don\'t fit are near misses: each copies a picture in the riddle, or is the answer with one thing changed', () => {
  const things = (cell) => Object.keys(cell).filter((name) => name !== 'look');
  for (const kind of KINDS) {
    for (const seed of SEEDS.slice(0, 40)) {
      const riddle = makeRiddle(kind, seededRandom(seed), { choices: 4, level: 5 });
      const shown = new Set(riddle.cells.filter(Boolean).map(keyOf));
      for (const option of riddle.options) {
        // Level 1's riddles are the easiest: one of their pieces is another shape in another colour altogether.
        if (keyOf(option) === keyOf(riddle.answer) || kind === 'rows') continue;
        const changed = things(option).filter((name) => option[name] !== riddle.answer[name]);
        assert.ok(shown.has(keyOf(option)) || changed.length === 1, `${kind}, seed ${seed}: ${keyOf(option)} against ${keyOf(riddle.answer)}`);
      }
    }
  }
});

test('the same seed makes the same riddles, so every friend has the same doors', () => {
  for (const kind of KINDS) {
    const a = makeRiddle(kind, seededRandom(42), { choices: 5, level: 8 });
    const b = makeRiddle(kind, seededRandom(42), { choices: 5, level: 8 });
    assert.deepEqual(a, b);
  }
  assert.deepEqual(new Doors({ level: 7, seed: 5 }).doors.map(({ riddle }) => riddle), new Doors({ level: 7, seed: 5 }).doors.map(({ riddle }) => riddle));
});

/* ---------- the levels ---------- */

test('each level from 2 brings a new kind of riddle, first on the first door and again half way, and more pieces to choose from later', () => {
  assert.deepEqual(doorNewAt(1), []);
  let choices = 0;
  for (const level of LEVELS) {
    const plan = doorLevel(level);
    assert.equal(plan.newest, KINDS[level - 1]);
    assert.ok(plan.kinds.includes(plan.newest) && plan.kinds.length <= 5);
    assert.ok(plan.choices >= choices && plan.choices >= 3 && plan.choices <= 6);
    choices = plan.choices;
    for (const seed of SEEDS.slice(0, 30)) {
      const doors = planDoors(level, seededRandom(seed));
      assert.equal(doors.length, DOORS);
      assert.equal(doors[0], plan.newest);
      assert.equal(doors[DOORS / 2], plan.newest);
      assert.ok(doors.every((kind) => plan.kinds.includes(kind)));
      // From level 3, never the same kind twice running.
      if (level >= 3) assert.ok(doors.every((kind, at) => at === 0 || kind !== doors[at - 1]), `level ${level}: ${doors}`);
    }
    if (level === 1) continue;
    const [news] = doorNewAt(level);
    assert.equal(news.key, plan.newest);
    assert.equal(newsIsOn(news.key, level), true);
    assert.equal(newsIsOn(news.key, level - 1), false);
    assert.ok(news.name && /[ა-ჿ]/.test(news.nameKa) && news.mark);
    const [en, ka] = LABELS[news.key];
    assert.ok(en.length <= 32 && /[ა-ჿ]/.test(ka), `${news.key}'s label is short, and in Georgian too`);
  }
  assert.deepEqual(Object.keys(NEWS).map(Number), LEVELS.slice(1));
  assert.equal(doorLevel(1).choices, 3);
  assert.equal(doorLevel(10).choices, 6);
});

test('the hall: every place a piece lies is on a shelf, none on another, none on the door, and the gap is the last place on the riddle', () => {
  for (const size of [2, 3]) {
    for (const side of ['right', 'left']) {
      const layout = layoutFor(size, side);
      const { cell, slots, shelves, door, board, hole } = layout;
      assert.deepEqual(hole, layout.places.at(-1));
      assert.ok(hole.x + cell / 2 < board.x + board.width && hole.y + cell / 2 < board.y + board.height);
      assert.ok(board.x > door.x && board.x + board.width < door.x + door.width);
      for (const slot of slots) {
        const shelf = shelves[slot.shelf];
        assert.ok(slot.x - cell / 2 > shelf.x && slot.x + cell / 2 < shelf.x + shelf.width, 'across, on its shelf');
        assert.ok(slot.y - cell / 2 > shelf.y && slot.y + cell / 2 < shelf.y + shelf.height, 'down, on its shelf');
        assert.ok(slot.x + cell / 2 < door.x || slot.x - cell / 2 > door.x + door.width, 'not on the door');
        for (const other of slots) if (other !== slot) assert.ok(Math.abs(other.x - slot.x) > cell * 1.1 || Math.abs(other.y - slot.y) > cell * 1.1, 'apart');
      }
      assert.ok(shelves[0].x > 0 && shelves[1].x + shelves[1].width < TABLE.width);
      // The little film goes on the side away from the hand in play.
      assert.equal(Math.sign(layout.film.x - TABLE.width / 2), side === 'right' ? -1 : 1);
    }
  }
  // Every door's pieces lie as many on one shelf as on the other, give or take one.
  for (const level of LEVELS) {
    for (const door of new Doors({ level, seed: level * 31 }).doors) {
      const left = door.tiles.filter((tile) => tile.home.x < TABLE.width / 2).length;
      assert.ok(Math.abs(door.tiles.length - left * 2) <= 1, `level ${level}: ${left} of ${door.tiles.length} on the left`);
    }
  }
});

/* ---------- a pretend child ---------- */

const NO_HAND = () => ({ glove: null, open: false });
const open = (at) => () => ({ glove: { x: at.x, y: at.y }, open: true });
const closed = (at) => () => ({ glove: { x: at.x, y: at.y }, open: false });
const AWAY = { x: 1, y: 0.95 }; // On the door, under the riddle, where no piece lies.

/** Runs the game for so long, with the hand as input() says, or until done() is true. Gives how long it took. */
function run(doors, seconds, input, done = () => false) {
  let t = 0;
  for (; t < seconds && !done(); t += FRAME) doors.update(FRAME, input(t));
  return t;
}

/** Moves an open hand from where it is to a place at an even speed, in table units a second. */
function sweep(doors, from, to, speed = 1.2) {
  const far = Math.hypot(to.x - from.x, to.y - from.y);
  const seconds = Math.max(FRAME, far / speed);
  run(doors, seconds, (t) => ({ glove: { x: from.x + ((to.x - from.x) * t) / seconds, y: from.y + ((to.y - from.y) * t) / seconds }, open: true }));
}

/** Gets past a door's start, the hand having been off the pieces, and picks a piece up as a child would: going to it, and stopping on it. */
function pickUp(doors, tile) {
  run(doors, 0.1, open(AWAY));
  sweep(doors, AWAY, tile);
  run(doors, 1, open(tile), () => doors.held === tile);
  assert.equal(doors.held, tile, 'picked up');
}

/** Takes the piece in the hand to the gap, and holds it there until it's tried. */
function tryIt(doors) {
  const tile = doors.held;
  sweep(doors, tile, doors.layout.hole);
  return run(doors, 3, open(doors.layout.hole), () => doors.held !== tile);
}

const rightTile = (doors) => doors.tiles.find((tile) => tile.right);
const wrongTile = (doors) => doors.tiles.find((tile) => !tile.right && tile.state === 'loose');
const said = (events, type) => events.filter((event) => event.type === type);

function makeDoors(options = {}) {
  const events = [];
  const doors = new Doors({ level: 3, seed: 11, ...options, onEvent: (event) => events.push(event) });
  return { doors, events };
}

test('an open hand passing over a piece on its way to another doesn\'t pick it up, and one that stops on a piece does, after a moment', () => {
  const { doors } = makeDoors();
  run(doors, 0.1, open(AWAY));
  const [first, second] = doors.tiles.filter((tile) => tile.home.x < 1).sort((a, b) => a.y - b.y);
  assert.ok(first && second, 'two pieces on one shelf');
  // Across one and on to the next, at a child's quick reach, and over the first again on the way back.
  sweep(doors, AWAY, first, 1.2);
  sweep(doors, first, second, 1.2);
  assert.equal(doors.held, null, 'nothing picked up on the way');
  const t = run(doors, 2, open(second), () => doors.held !== null);
  assert.equal(doors.held, second);
  assert.ok(t >= PICK_SECONDS - FRAME && t < PICK_SECONDS + 0.4, `picked up after ${t} s`);
  // A hand that's slow is picking up, even crossing: a child stopping on it, or near enough.
  const { doors: slow } = makeDoors();
  run(slow, 0.1, open(AWAY));
  const [one] = slow.tiles;
  sweep(slow, AWAY, one, 1.2);
  run(slow, 1.5, open({ x: one.x + 0.02, y: one.y - 0.01 }), () => slow.held !== null);
  assert.equal(slow.held, one);
});

test('a hand shaking as a child\'s can still settles on a piece, and a closed hand, or none, never picks one up', () => {
  const { doors } = makeDoors();
  run(doors, 0.1, open(AWAY));
  const [tile] = doors.tiles;
  run(doors, 3, closed(tile));
  run(doors, 3, NO_HAND);
  assert.equal(doors.held, null);
  sweep(doors, AWAY, tile);
  // Shaking, a little this way and that, many times a second, about its middle.
  run(doors, 3, (t) => ({ glove: { x: tile.home.x + Math.sin(t * 19) * 0.03, y: tile.home.y + Math.cos(t * 13) * 0.03 }, open: true }), () => doors.held !== null);
  assert.equal(doors.held, tile);
});

test('a hand resting on a piece as a door appears doesn\'t pick it up, until the glove has been off the pieces', () => {
  const { doors } = makeDoors();
  const [tile] = doors.tiles;
  run(doors, 3, open(tile));
  assert.equal(doors.held, null);
  run(doors, 0.2, open(AWAY));
  run(doors, 1, open(tile), () => doors.held !== null);
  assert.equal(doors.held, tile);
});

test('held in the gap a moment, the piece that fits goes in and the door opens, and the next door comes', () => {
  const { doors, events } = makeDoors();
  const tile = rightTile(doors);
  pickUp(doors, tile);
  // Only a moment in the gap and away again isn't a try.
  sweep(doors, tile, doors.layout.hole);
  run(doors, TRY_SECONDS * 0.25, open(doors.layout.hole));
  sweep(doors, doors.layout.hole, AWAY, 2.5);
  run(doors, 0.5, open(AWAY));
  assert.equal(tile.state, 'held');
  const t = tryIt(doors);
  assert.ok(t >= TRY_SECONDS - 0.1 && t < TRY_SECONDS + 0.5, `tried after ${t} s`);
  assert.equal(tile.state, 'placed');
  assert.deepEqual([doors.phase, doors.door.open, doors.stats.opened, doors.stats.firstTry, doors.stats.prizes.star], ['open', true, 1, 1, 1]);
  assert.equal(said(events, 'opened').length, 1);
  run(doors, OPEN_SECONDS + 0.1, NO_HAND);
  assert.deepEqual([doors.phase, doors.index], ['play', 1]);
  assert.equal(said(events, 'door').length, 1);
});

test('a piece that doesn\'t fit goes back to its shelf, can\'t be tried again, and blows a candle out', () => {
  const { doors, events } = makeDoors();
  const tile = wrongTile(doors);
  pickUp(doors, tile);
  tryIt(doors);
  assert.deepEqual([tile.state, tile.x, tile.y], ['tried', tile.home.x, tile.home.y]);
  assert.deepEqual([doors.held, doors.phase, doors.stats.wrong, doors.candles.left], [null, 'play', 1, 2]);
  assert.equal(said(events, 'wrong').length, 1);
  assert.equal(said(events, 'candle').length, 1);
  // An open hand on it does nothing now.
  run(doors, 0.2, open(AWAY));
  sweep(doors, AWAY, tile);
  run(doors, 2, open(tile));
  assert.equal(doors.held, null);
  // And the door, opened now, gives no star: a piece was tried that didn't fit.
  pickUp(doors, rightTile(doors));
  tryIt(doors);
  assert.deepEqual([doors.stats.opened, doors.stats.firstTry, doors.stats.prizes.star], [1, 0, 0]);
});

test('a hand that closes, or goes, puts the piece down where it is, and a moment\'s flicker of the tracker doesn\'t', () => {
  const { doors } = makeDoors();
  const tile = rightTile(doors);
  pickUp(doors, tile);
  const there = { x: 1, y: 0.93 };
  sweep(doors, tile, there);
  run(doors, 0.5, open(there));
  run(doors, GRACE * 0.6, closed(there));
  run(doors, 0.3, open(there));
  assert.equal(doors.held, tile, 'a flicker keeps it');
  run(doors, GRACE + 0.1, closed(there));
  assert.deepEqual([doors.held, tile.state], [null, 'loose']);
  assert.ok(Math.hypot(tile.x - there.x, tile.y - there.y) < 0.03, 'put down where it was');
  // Picked up again from there, and no hand at all puts it down too.
  run(doors, 1, open(there), () => doors.held === tile);
  assert.equal(doors.held, tile);
  run(doors, 0.1, NO_HAND);
  assert.equal(doors.held, null);
  assert.equal(doors.stats.wrong, 0, 'nothing put down counts as a try');
});

test('three candles: the third piece that doesn\'t fit puts the last out, and a moment later the game is over and lost', () => {
  const { doors, events } = makeDoors({ level: 9 });
  for (let n = 0; n < 3; n += 1) {
    const tile = wrongTile(doors);
    pickUp(doors, tile);
    tryIt(doors);
  }
  assert.deepEqual([doors.phase, doors.lost, doors.candles.left, doors.done], ['dark', true, 0, false]);
  assert.equal(said(events, 'dark').length, 1);
  run(doors, DARK_SECONDS - 0.1, open(rightTile(doors)));
  assert.equal(doors.stats.opened, 0, 'nothing more can be done');
  run(doors, 0.2, NO_HAND);
  assert.deepEqual([doors.done, doors.lost], [true, true]);
  // Five candles take five, and the gentle game none: with every wrong piece tried, nothing is lost.
  assert.equal(new Doors({ candles: 'five' }).candles.total, 5);
  assert.equal(CANDLES.gentle, 0);
  const { doors: gentle } = makeDoors({ level: 9, candles: 'gentle' });
  assert.equal(gentle.candles, null);
  while (wrongTile(gentle)) {
    pickUp(gentle, wrongTile(gentle));
    tryIt(gentle);
  }
  assert.deepEqual([gentle.phase, gentle.lost, gentle.stats.wrong], ['play', false, 5]);
});

test('a child who has been on a door a while sees the gap\'s row lit, but not one who has gone away', () => {
  const { doors, events } = makeDoors();
  run(doors, LOOK_AFTER * 2, NO_HAND);
  assert.equal(doors.door.look, 0);
  run(doors, LOOK_AFTER - 1, closed(AWAY));
  assert.equal(doors.door.look, 0);
  run(doors, 3, closed(AWAY));
  assert.ok(doors.door.look > 0.9);
  assert.equal(said(events, 'look').length, 1);
  assert.equal(doors.stats.picks, 0, 'nothing is done for them');
});

test('a child who knows the answers opens every door at every level, with a star for each, and the level is won', () => {
  for (const level of LEVELS) {
    for (const side of ['right', 'left']) {
      const { doors } = makeDoors({ level, side, seed: level * 101 });
      for (let n = 0; n < DOORS; n += 1) {
        pickUp(doors, rightTile(doors));
        tryIt(doors);
        run(doors, OPEN_SECONDS + 1, NO_HAND, () => doors.phase !== 'open');
      }
      assert.deepEqual([doors.done, doors.lost, doors.stats.opened, doors.stats.prizes.star, doors.stats.wrong], [true, false, DOORS, DOORS, 0], `level ${level}, ${side}`);
    }
  }
});

/* ---------- with friends ---------- */

test('with friends there are no candles, and nobody can lose', () => {
  assert.equal(new Doors({ friends: true }).candles, null);
  assert.equal(new Doors({ shared: { claim() {} } }).candles, null);
});

function friendsDoors(players = ['aaaa', 'bbbb'], options = {}) {
  const claims = new Map();
  const all = {};
  const announce = (k, by) => {
    for (const id of players) all[id].claimed(k, by);
  };
  const claim = (by) => (k) => {
    if (claims.has(k)) return;
    claims.set(k, by);
    announce(k, by);
  };
  for (const id of players) all[id] = new Doors({ level: 6, friends: true, seed: 99, ...options, shared: { claim: claim(id) }, me: id });
  return {
    all,
    claims,
    tell: (only = players) => {
      for (const from of only) for (const to of players) if (to !== from) all[to].heard(from, JSON.parse(JSON.stringify(all[from].report())));
    },
  };
}

test('with friends, together, a piece one child holds can\'t be taken by another, and goes back for everyone when it doesn\'t fit', () => {
  const { all, claims, tell } = friendsDoors();
  const { aaaa: ana, bbbb: ben } = all;
  assert.deepEqual(ana.tiles.map(({ cell, x, y }) => [keyOf(cell), x, y]), ben.tiles.map(({ cell, x, y }) => [keyOf(cell), x, y]), 'the same door, from the seed');
  const mine = wrongTile(ana);
  const theirs = ben.tile(mine.id);
  pickUp(ana, mine);
  assert.ok(ana.sure);
  assert.deepEqual([...claims.keys()], [mine.id * GRABS]);
  assert.deepEqual([theirs.state, theirs.holder], ['held', 'aaaa']);
  // Ben's open hand on it takes nothing: it's in Ana's.
  run(ben, 0.2, open(AWAY));
  sweep(ben, AWAY, theirs);
  run(ben, 1, open(theirs));
  assert.equal(ben.held, null);
  // Ana tries it in the gap, and it doesn't fit: it's tried for both of them, and back on its shelf.
  tryIt(ana);
  assert.ok(claims.has(TRIED + mine.id));
  assert.deepEqual([mine.state, theirs.state, theirs.x, theirs.y], ['tried', 'tried', theirs.home.x, theirs.home.y]);
  assert.deepEqual([ana.stats.wrong, ben.stats.wrong], [1, 0]);
  tell();
  assert.equal(theirs.state, 'tried');
});

test('with friends, together, the piece that fits opens the door for everyone, and counts for whoever put it in', () => {
  const { all, tell } = friendsDoors();
  const { aaaa: ana, bbbb: ben } = all;
  pickUp(ben, rightTile(ben));
  tryIt(ben);
  assert.equal(ben.phase, 'open');
  tell();
  assert.equal(ana.phase, 'open');
  assert.deepEqual([ana.tally.get('bbbb'), ben.tally.get('bbbb'), ana.stats.opened, ben.stats.opened], [1, 1, 0, 1]);
  // Both go on to the next door together, and the whole game ends for both at once.
  for (let n = 0; n < DOORS; n += 1) {
    run(ana, 4, NO_HAND, () => ana.phase !== 'open');
    run(ben, 4, NO_HAND, () => ben.phase !== 'open');
    if (ana.done) break;
    assert.equal(ana.index, ben.index);
    const doer = n % 2 ? ana : ben;
    pickUp(doer, rightTile(doer));
    tryIt(doer);
    tell();
  }
  assert.deepEqual([ana.done, ben.done], [true, true]);
  assert.equal(ana.tally.get('aaaa') + ana.tally.get('bbbb'), DOORS);
});

test('with friends, together, a claim with no answer is given up, and a friend who goes leaves what they held where it was', () => {
  const quiet = new Doors({ level: 4, friends: true, seed: 3, shared: { claim() {} }, me: 'aaaa' });
  const tile = quiet.tiles[0];
  run(quiet, 0.2, open(AWAY));
  sweep(quiet, AWAY, tile);
  run(quiet, 1, open(tile), () => quiet.held !== null);
  assert.equal(quiet.held, tile);
  assert.equal(quiet.sure, false);
  // Held in the gap, nothing is tried before the server says the piece is this child's.
  sweep(quiet, tile, quiet.layout.hole);
  run(quiet, 1, open(quiet.layout.hole));
  assert.equal(quiet.stats.opened + quiet.stats.wrong, 0);
  run(quiet, 2, open(quiet.layout.hole));
  // Given up, and asked for again as a new grab, as the open hand is still on it: still nothing tried.
  assert.ok(tile.next >= 1, 'given up');
  assert.equal(quiet.stats.opened + quiet.stats.wrong, 0);
  // A friend's piece, as their game said, lies where they were when they went.
  const { all, tell } = friendsDoors();
  const { aaaa: ana, bbbb: ben } = all;
  const mine = ana.tiles[1];
  pickUp(ana, mine);
  tell();
  ben.friendGone('aaaa');
  assert.deepEqual([ben.tile(mine.id).state, ben.tile(mine.id).holder], ['loose', null]);
});

test('with friends, what a game tells the others is only numbers: the piece in the hand, and where the last ones it held lie', () => {
  const { all } = friendsDoors();
  const { aaaa: ana } = all;
  pickUp(ana, ana.tiles[0]);
  const there = { x: 1, y: 0.93 };
  sweep(ana, ana.tiles[0], there);
  run(ana, 0.5, closed(there));
  const said = ana.report();
  assert.deepEqual(Object.keys(said).sort(), ['d', 'h', 'n']);
  assert.ok([said.h, said.n, ...said.d.flat()].every((value) => typeof value === 'number' && Number.isFinite(value)));
  assert.equal(said.d[0].length, 5);
});

test('against each other, every friend has a copy of the same doors, from the seed', () => {
  const a = new Doors({ level: 8, friends: true, seed: 77, me: 'a' });
  const b = new Doors({ level: 8, friends: true, seed: 77, me: 'b' });
  assert.deepEqual(a.doors.map(({ riddle }) => riddle), b.doors.map(({ riddle }) => riddle));
  assert.equal(a.shared, null);
  assert.equal(a.candles, null);
});

/* ---------- the rest ---------- */

test('every line the game says has its English and Georgian voice files, and the game says each one', () => {
  const folder = new URL('../../games/riddle-doors/audio/voice/', import.meta.url);
  const lines = JSON.parse(readFileSync(new URL('lines.json', folder), 'utf8'));
  assert.ok(lines.length >= 5);
  for (const { id, ka } of lines) {
    assert.ok(ka, `${id} has Georgian`);
    for (const language of ['en', 'ka']) assert.ok(readFileSync(new URL(`${language}/${id}.ogg`, folder)).length > 1000, `${language}/${id}.ogg`);
  }
  const source = readFileSync(new URL('../../games/riddle-doors/main.js', import.meta.url), 'utf8');
  for (const { text } of lines) assert.ok(source.includes(text), `"${text}" is said by the game`);
  const voices = readFileSync(new URL('../../tools/voice_common.py', import.meta.url), 'utf8');
  assert.match(voices, /"riddle-doors" \/ "audio" \/ "voice"/);
});

test('the doors\' rooms are known to both servers, and a friend\'s glove and pieces are passed on as the puzzles\' are', () => {
  for (const file of ['../../server/worker.js', '../../tools/race-server.mjs']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /const GAMES = \[[^\]]*'riddle-doors'/, file);
  }
  const friends = readFileSync(new URL('../../core/friends.js', import.meta.url), 'utf8');
  assert.match(friends, /'jigsaw'[^\]]*\]\.includes\(message\.t\)/);
  // A piece's claims, and a piece tried, fit in what the server lets through.
  const last = new Doors({ level: 10, seed: 1 }).doors.at(-1).tiles.at(-1);
  assert.ok(last.id * GRABS + GRABS - 1 < TRIED && TRIED + last.id < 1_000_000);
});
