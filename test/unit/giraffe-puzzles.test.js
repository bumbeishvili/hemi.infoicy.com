// Giraffe's Puzzles: pieces an open hand picks up and carries to their places, what each level brings, the clock on
// the wall, that in the gentle puzzle a hand which closes or rests loses nothing, and the same puzzle on every
// friend's computer. Everything here runs without a screen, with a pretend child moving a glove over the table. The
// tests of the old kind rules play the gentle puzzle, as makePuzzle does unless a test says otherwise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  choosePictures, CLOCK, cutEdges, CUTS, EXTRAS, GRAB, GRABS, GRACE, HINT_AFTER, LABELS, layoutFor, MENDED_SECONDS, NEWS, newsIsOn,
  PARTY_SECONDS, PICTURES, PIECE_CHOICES, Puzzle, puzzleLevel, puzzleNewAt, puzzlePlan, REACH, seededRandom, sidesOf, SNAPS,
  TABLE,
} from '../../games/giraffe-puzzles/puzzle.js';
import { CAST, NAMES } from '../../games/giraffe-puzzles/pictures.js';
import { byId } from '../../core/body/roster.js';
import { LAST_LEVEL } from '../../core/levels.js';

const FRAME = 1 / 60;
const LEVELS = Array.from({ length: LAST_LEVEL }, (_, index) => index + 1);
const CHOICES = Object.keys(PIECE_CHOICES);
const AWAY = { x: 1, y: 0.03 }; // Somewhere on the table with nothing to pick up.

function makePuzzle(options = {}) {
  const log = [];
  const puzzle = new Puzzle({ seed: 7, clock: 'gentle', onEvent: (event) => log.push(event), ...options });
  puzzle.log = log;
  return puzzle;
}

const said = (puzzle, type) => puzzle.log.filter((event) => event.type === type);
const open = (at) => ({ glove: { x: at.x, y: at.y }, open: true });
const closed = (at) => ({ glove: { x: at.x, y: at.y }, open: false });
const NO_HAND = { glove: null, open: false };

/** Runs the puzzle for a while with the same input, or one worked out each frame, or until something is so. */
function run(puzzle, seconds, input, until = () => false) {
  let t = 0;
  for (; t < seconds && !until(); t += FRAME) puzzle.update(FRAME, typeof input === 'function' ? input(t) : input);
  return t;
}

/** An open hand goes from one place to another in a straight line, at a hand's speed, and stays there. */
function sweep(puzzle, from, to, { speed = 0.8, hand = true, stay = 0.2 } = {}) {
  const far = Math.hypot(to.x - from.x, to.y - from.y);
  const seconds = far / speed;
  run(puzzle, seconds + stay, (t) => {
    const share = Math.min(1, seconds ? t / seconds : 1);
    return { glove: { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share }, open: hand };
  });
}

/** Picks a piece up with an open hand held on it. */
function pickUp(puzzle, piece) {
  run(puzzle, 0.1, open(piece));
  assert.equal(puzzle.held, piece, 'the piece is in the hand');
}

/** A plain piece of the picture being put together: not golden, turned, under a leaf or in a bubble. */
const plainPiece = (puzzle) => puzzle.pieces.find((piece) => piece.state === 'loose' && !piece.golden && !piece.leaf && !piece.floating && piece.angle === 0);

/**
 * A pretend child: takes an open hand to wherever the puzzle says a child would, at a hand's speed. wobble shakes
 * the hand as it goes, and blink closes it for a moment now and then, as the tracker can read an open hand.
 */
function child(puzzle, { speed = 0.7, wobble = 0, blink = 0 } = {}) {
  const hand = { x: 1, y: 0.5 };
  let t = 0;
  return () => {
    t += FRAME;
    const wanted = puzzle.wants(hand);
    if (wanted) {
      const gap = Math.hypot(wanted.x - hand.x, wanted.y - hand.y);
      const step = Math.min(gap, speed * FRAME);
      if (gap > 0) {
        hand.x += ((wanted.x - hand.x) / gap) * step;
        hand.y += ((wanted.y - hand.y) / gap) * step;
      }
    }
    const shake = { x: hand.x + Math.sin(t * 23) * wobble, y: hand.y + Math.cos(t * 17) * wobble };
    return { glove: shake, open: !(blink && t % blink < 0.1) };
  };
}

function playThrough(puzzle, options = {}, seconds = 900) {
  const next = child(puzzle, options);
  let t = 0;
  for (; t < seconds && !puzzle.done; t += FRAME) puzzle.update(FRAME, next());
  return t;
}

/* ---------- picking up, carrying and putting in place ---------- */

test('an open hand over a loose piece picks it up, and the piece goes with the hand for as long as it stays open', () => {
  const puzzle = makePuzzle();
  const [piece] = puzzle.pieces;
  const start = { x: piece.x, y: piece.y };
  // Nowhere near a piece, nothing is picked up.
  run(puzzle, 0.5, open(AWAY));
  assert.equal(puzzle.held, null);
  pickUp(puzzle, piece);
  assert.equal(said(puzzle, 'pick').length, 1);
  // It follows the hand across the table, staying loose until it's near its place.
  const to = { x: 1, y: 0.85 };
  sweep(puzzle, start, to);
  assert.equal(puzzle.held, piece);
  assert.ok(Math.hypot(piece.x - to.x, piece.y - to.y) < 0.01, 'the piece is where the hand is');
  assert.equal(piece.state, 'held');
  assert.equal(piece.tilt, 0, 'it straightens up in the hand');
});

test('brought near its place a piece snaps in, with nothing to grip, and not before it gets there', () => {
  const puzzle = makePuzzle();
  const piece = puzzle.pieces.find((each) => each.col === 0 && each.row === 0);
  pickUp(puzzle, piece);
  // To just outside how near it has to come, on the side it comes from: still in the hand.
  const reach = puzzle.snapRadius();
  const side = Math.sign(piece.x - piece.home.x);
  const nearly = { x: piece.home.x + side * (reach + 0.03), y: piece.home.y };
  sweep(puzzle, piece, nearly);
  assert.equal(piece.state, 'held');
  assert.equal(said(puzzle, 'placed').length, 0);
  // A little nearer, and it's in, right in its place, and out of the hand.
  sweep(puzzle, nearly, { x: piece.home.x + side * (reach - 0.03), y: piece.home.y });
  assert.equal(piece.state, 'placed');
  assert.deepEqual([piece.x, piece.y], [piece.home.x, piece.home.y]);
  assert.equal(puzzle.held, null);
  assert.equal(puzzle.stats.placed, 1);
  assert.deepEqual(said(puzzle, 'placed').map(({ piece: which, mine }) => [which, mine]), [[piece, true]]);
  // Once in, it stays in: an open hand on it doesn't take it out again.
  run(puzzle, 0.5, open(piece.home));
  assert.equal(piece.state, 'placed');
  assert.equal(puzzle.held, null);
});

test('only an open hand does anything: a closed one never picks a piece up, carries one or puts one in', () => {
  const puzzle = makePuzzle();
  const [piece] = puzzle.pieces;
  const start = { x: piece.x, y: piece.y };
  run(puzzle, 2, closed(piece));
  assert.equal(puzzle.held, null);
  assert.equal(piece.state, 'loose');
  // A fist dragged from the piece to its place takes nothing with it.
  sweep(puzzle, start, piece.home, { hand: false });
  assert.deepEqual([piece.x, piece.y, piece.state], [start.x, start.y, 'loose']);
  assert.equal(said(puzzle, 'pick').length, 0);
  // And a hand that can't be seen is no hand at all.
  run(puzzle, 2, NO_HAND);
  assert.equal(puzzle.held, null);
});

test('a hand that closes, or goes, leaves the piece where it is: nothing is lost, and it can be picked up again', () => {
  const puzzle = makePuzzle();
  const [piece] = puzzle.pieces;
  pickUp(puzzle, piece);
  const middle = { x: 1, y: 0.85 };
  sweep(puzzle, piece, middle);
  // The hand closes, and stays closed.
  run(puzzle, 1, closed(middle));
  assert.equal(puzzle.held, null);
  assert.equal(piece.state, 'loose');
  assert.ok(Math.hypot(piece.x - middle.x, piece.y - middle.y) < 0.02, 'it lies where it was let go');
  assert.equal(said(puzzle, 'drop').length, 1);
  // The closed hand moves off, and the piece doesn't go with it.
  sweep(puzzle, middle, { x: 0.3, y: 0.3 }, { hand: false });
  assert.ok(Math.hypot(piece.x - middle.x, piece.y - middle.y) < 0.02);
  // A long rest, with no hand at all, and it's still there.
  run(puzzle, 120, NO_HAND);
  assert.ok(Math.hypot(piece.x - middle.x, piece.y - middle.y) < 0.02);
  // Open again over it, and it's back in the hand, to carry on.
  pickUp(puzzle, piece);
  // The hand going out of the picture puts it down at once, wherever it is.
  run(puzzle, 0.05, NO_HAND);
  assert.equal(puzzle.held, null);
  assert.equal(piece.state, 'loose');
});

test('a hand read as closed for a moment keeps its piece, but a piece only goes in while the hand really is open', () => {
  const puzzle = makePuzzle();
  const piece = plainPiece(puzzle);
  pickUp(puzzle, piece);
  // The tracker reads the open hand as closed for less than the grace, on the way: the piece comes too.
  const half = { x: (piece.x + piece.home.x) / 2, y: (piece.y + piece.home.y) / 2 };
  sweep(puzzle, piece, half, { stay: 0 });
  run(puzzle, GRACE * 0.7, closed(half));
  assert.equal(puzzle.held, piece, 'still in the hand');
  assert.equal(said(puzzle, 'drop').length, 0);
  // Closed for longer than that, it's put down.
  run(puzzle, GRACE * 1.5, closed(half));
  assert.equal(puzzle.held, null);
  // Carried right to its place by a hand that closes just before it gets there, it doesn't go in until it opens.
  pickUp(puzzle, piece);
  const short = { x: piece.home.x + puzzle.snapRadius() + 0.05, y: piece.home.y };
  sweep(puzzle, piece, short, { stay: 0 });
  run(puzzle, GRACE * 0.6, (t) => ({ glove: { x: short.x + (piece.home.x - short.x) * Math.min(1, t / (GRACE * 0.5)), y: short.y }, open: false }));
  assert.equal(piece.state, 'held', 'at its place, but the hand is not open');
  run(puzzle, 0.1, open(piece.home));
  assert.equal(piece.state, 'placed');
});

test('a resting child is never hurried: nothing in a puzzle is timed, moves off or can be missed, at any level', () => {
  for (const level of LEVELS) {
    const puzzle = makePuzzle({ level });
    const before = puzzle.pieces.map((piece) => [piece.x, piece.y, piece.angle, piece.state, Boolean(piece.leaf)]);
    // Ten minutes with no hand, and then with a fist lying in the middle of the table.
    run(puzzle, 300, NO_HAND);
    run(puzzle, 300, closed({ x: 0.3, y: 0.5 }));
    assert.equal(puzzle.phase, 'play', `level ${level}`);
    puzzle.pieces.forEach((piece, at) => {
      if (piece.floating) {
        // A piece in a bubble floats about, and never leaves the table.
        assert.ok(piece.x > 0.2 && piece.x < TABLE.width - 0.2 && piece.y > 0.12 && piece.y < 0.88, `level ${level}: the bubble is at ${piece.x.toFixed(2)}, ${piece.y.toFixed(2)}`);
      } else {
        assert.deepEqual([piece.x, piece.y, piece.angle, piece.state, Boolean(piece.leaf)], before[at], `level ${level}: piece ${piece.id} is as it was`);
      }
    });
    const { magnet, peek } = puzzle.round;
    // The magnet may have floated into the fist, and been taken, but it only runs down while the hand is open.
    if (magnet) assert.equal(magnet.left, EXTRAS.magnetSeconds, `level ${level}: the magnet hasn't run down`);
    if (peek) assert.equal(peek.showing, 0);
    assert.equal(puzzle.stats.placed, 0);
    // And it can all still be finished.
    playThrough(puzzle);
    assert.ok(puzzle.done, `level ${level} can still be finished after a rest`);
  }
});

test('a piece carried for a while without finding its place has its place lit up, so nobody is stuck', () => {
  const puzzle = makePuzzle();
  const piece = plainPiece(puzzle);
  pickUp(puzzle, piece);
  const lost = { x: 1, y: 0.85 };
  sweep(puzzle, piece, lost);
  run(puzzle, HINT_AFTER - 2, open(lost));
  assert.equal(piece.hint, 0, 'not at once');
  run(puzzle, 3, open(lost));
  assert.equal(piece.hint, 1);
  // Put down, the light goes, and it comes straight back when the piece is picked up again.
  run(puzzle, 1, closed(lost));
  assert.equal(piece.hint, 0);
  run(puzzle, 1, open(lost));
  assert.equal(puzzle.held, piece);
  assert.equal(piece.hint, 1);
  // In its place, there's nothing more to light.
  sweep(puzzle, lost, piece.home);
  assert.equal(piece.state, 'placed');
  assert.equal(piece.hint, 0);
});

test('however far out the hand goes, all of the piece in it stays on the table, where it can be seen and picked up again', () => {
  for (const level of [1, 6, 9]) {
    for (const pieces of CHOICES) {
      const puzzle = makePuzzle({ level, pieces, reach: 'lots' });
      const { width, height } = puzzle.layout.piece;
      const piece = plainPiece(puzzle);
      // Reach help lets the glove go well past the table's edges. The piece goes as far as the edge, and no further.
      for (const out of [{ x: -0.7, y: piece.y }, { x: piece.x, y: 1.8 }, { x: TABLE.width + 0.7, y: 1.8 }, { x: TABLE.width + 0.7, y: -0.8 }]) {
        if (piece.state === 'placed') break;
        run(puzzle, 0.2, open(piece));
        run(puzzle, 1.5, open(out));
        run(puzzle, 0.5, closed(out));
        const what = `level ${level}, ${pieces}: left at ${piece.x.toFixed(2)}, ${piece.y.toFixed(2)}`;
        assert.ok(piece.x - width / 2 > 0 && piece.x + width / 2 < TABLE.width, what);
        assert.ok(piece.y - height / 2 > 0 && piece.y + height / 2 < TABLE.height, what);
      }
    }
  }
});

test('a pretend child finishes every level, with fewer, the usual and more pieces, steadily or with a shaking, blinking hand', () => {
  for (const level of LEVELS) {
    for (const pieces of CHOICES) {
      for (const hand of [{}, { wobble: 0.02, blink: 1.7 }]) {
        const puzzle = makePuzzle({ level, pieces, seed: level * 31 + CHOICES.indexOf(pieces) });
        const took = playThrough(puzzle, hand);
        const what = `level ${level}, ${pieces} pieces${hand.wobble ? ', shaking' : ''}`;
        assert.ok(puzzle.done, `${what} finishes`);
        assert.equal(puzzle.stats.placed, puzzle.total, what);
        assert.equal(puzzle.stats.pictures, puzzle.plan.rounds * puzzle.plan.frames, what);
        assert.equal(said(puzzle, 'mended').length, puzzle.plan.rounds, what);
        assert.equal(said(puzzle, 'done').length, 1, what);
        assert.ok(took < 400, `${what} took ${took.toFixed(0)} s`);
        assert.ok(puzzle.rounds.every((round) => round.pieces.every((piece) => piece.state === 'placed' && piece.angle === 0 && !piece.leaf)), what);
      }
    }
  }
});

test('a picture finished is looked at for a moment, then the next one comes, and the last one ends the game', () => {
  const puzzle = makePuzzle({ level: 1 });
  assert.equal(puzzle.rounds.length, 3);
  const next = child(puzzle);
  run(puzzle, 60, next, () => puzzle.phase === 'mended');
  assert.equal(puzzle.index, 0);
  assert.deepEqual(said(puzzle, 'mended').map(({ last }) => last), [false]);
  // Nothing can be picked up while it's looked at, and then the next picture's pieces are on the boards.
  run(puzzle, MENDED_SECONDS - 0.2, next);
  assert.equal(puzzle.index, 0);
  run(puzzle, 0.4, next);
  assert.equal(puzzle.index, 1);
  assert.equal(puzzle.phase, 'play');
  assert.equal(said(puzzle, 'round').length, 1);
  assert.ok(puzzle.pieces.every((piece) => piece.state !== 'placed'));
  run(puzzle, 200, next, () => puzzle.done);
  assert.deepEqual(said(puzzle, 'mended').map(({ last }) => last), [false, false, true]);
  assert.ok(puzzle.done);
});

/* ---------- the grown-ups' choices ---------- */

test('a grown-up can have fewer or more pieces than a level usually has, and each picture is cut that way', () => {
  for (const level of LEVELS) {
    const [fewer, usual, more] = CHOICES.map((pieces) => puzzlePlan(level, pieces));
    assert.ok(fewer.cols * fewer.rows < usual.cols * usual.rows, `level ${level}: fewer`);
    assert.ok(more.cols * more.rows > usual.cols * usual.rows, `level ${level}: more`);
    // The same number of pictures either way: it's the pieces that change.
    assert.deepEqual([fewer.rounds, more.rounds, fewer.frames, more.frames], [usual.rounds, usual.rounds, usual.frames, usual.frames]);
    for (const plan of [fewer, usual, more]) {
      const puzzle = makePuzzle({ level, pieces: CHOICES[[fewer, usual, more].indexOf(plan)] });
      assert.equal(puzzle.pieces.length, plan.cols * plan.rows * plan.frames);
      assert.equal(puzzle.total, plan.total);
    }
  }
  // Anything else is the usual number.
  assert.deepEqual(puzzlePlan(4, 'lots').cols, puzzlePlan(4, 'usual').cols);
});

test('how near its place a piece has to come is the grown-ups\' choice: generous unless they say', () => {
  const radius = (snap) => makePuzzle({ snap }).snapRadius();
  const [near, closer, exact] = ['near', 'closer', 'exact'].map(radius);
  assert.ok(near > closer && closer > exact && exact > 0);
  assert.equal(radius(undefined), near, 'generous by default');
  assert.equal(radius('nonsense'), near);
  // Generous is more than half a piece's shorter side, so a piece carried over its place is always caught.
  const { piece } = makePuzzle().layout;
  assert.ok(near > Math.min(piece.width, piece.height) / 2);
  assert.deepEqual(Object.keys(SNAPS), ['near', 'closer', 'exact']);
  // A piece a little way off its place goes in when it's generous, and not when it has to be right on it.
  for (const [snap, goesIn] of [['near', true], ['exact', false]]) {
    const puzzle = makePuzzle({ snap });
    const one = plainPiece(puzzle);
    pickUp(puzzle, one);
    sweep(puzzle, one, { x: one.home.x + near * 0.8, y: one.home.y });
    assert.equal(one.state === 'placed', goesIn, snap);
  }
});

test('reach help picks a piece up from a little way off it, and never changes the puzzle', () => {
  assert.deepEqual(Object.keys(REACH), ['none', 'little', 'lots']);
  assert.ok(REACH.none === 1 && REACH.little > 1 && REACH.lots > REACH.little);
  assert.ok(GRAB.none < GRAB.little && GRAB.little < GRAB.lots);
  const beside = (puzzle, piece, gap) => ({ x: piece.x + puzzle.layout.piece.width / 2 + gap, y: piece.y });
  for (const [reach, taken] of [['none', false], ['lots', true]]) {
    const puzzle = makePuzzle({ reach });
    const [piece] = puzzle.pieces;
    run(puzzle, 0.3, open(beside(puzzle, piece, 0.04)));
    assert.equal(puzzle.held === piece, taken, `reach help ${reach}`);
  }
  const places = (reach) => makePuzzle({ reach }).pieces.map(({ x, y, home }) => [x, y, home.x, home.y]);
  assert.deepEqual(places('none'), places('lots'));
});

/* ---------- where everything is ---------- */

test('every piece has a place of its own on a board, clear of the frame and of the other pieces, as many on each side', () => {
  for (const level of LEVELS) {
    for (const pieces of CHOICES) {
      const puzzle = makePuzzle({ level, pieces });
      const { layout } = puzzle;
      const { width, height } = layout.piece;
      for (const round of puzzle.rounds) {
        const lying = round.pieces.filter((piece) => !piece.floating);
        for (const piece of lying) {
          const board = layout.boards.find((each) => piece.x > each.x && piece.x < each.x + each.width);
          assert.ok(board, `level ${level}, ${pieces}: piece ${piece.id} is on a board`);
          assert.ok(piece.y > board.y && piece.y < board.y + board.height);
          assert.ok(piece.x + width / 2 < layout.easel.x || piece.x - width / 2 > layout.easel.x + layout.easel.width, 'clear of the easel');
        }
        // No two on the same place: their middles are at least most of a piece apart, one way or the other.
        for (const a of lying) {
          for (const b of lying) {
            if (a.id >= b.id) continue;
            assert.ok(Math.abs(a.x - b.x) > width * 0.9 || Math.abs(a.y - b.y) > height * 0.9, `level ${level}, ${pieces}: pieces ${a.id} and ${b.id} overlap`);
          }
        }
        const onLeft = lying.filter((piece) => piece.x < TABLE.width / 2).length;
        assert.ok(Math.abs(onLeft - (lying.length - onLeft)) <= 1, `level ${level}, ${pieces}: ${onLeft} of ${lying.length} on the left`);
      }
    }
  }
});

test('the places in a frame fit together into the whole picture, and everything is within the table', () => {
  for (const [count, cut] of [[1, CUTS[0]], [1, CUTS[1]], [1, CUTS[4]], [1, CUTS[5]], [2, CUTS[1]], [2, CUTS[2]], [2, CUTS[3]]]) {
    const layout = layoutFor(count, cut);
    assert.equal(layout.frames.length, count);
    for (const frame of layout.frames) {
      // 4 across for every 3 down, as the pictures are drawn.
      assert.ok(Math.abs(frame.width / frame.height - 4 / 3) < 1e-9);
      assert.ok(Math.abs(layout.piece.width * cut[0] - frame.width) < 1e-9 && Math.abs(layout.piece.height * cut[1] - frame.height) < 1e-9);
      assert.ok(frame.x > layout.boards[0].x + layout.boards[0].width && frame.x + frame.width < layout.boards[1].x);
    }
    assert.ok(layout.slots.length >= cut[0] * cut[1] * count, `${count} of ${cut}: ${layout.slots.length} places`);
    for (const slot of layout.slots) assert.ok(slot.x > 0 && slot.x < TABLE.width && slot.y > 0 && slot.y < TABLE.height);
    for (const thing of [layout.peek, layout.film]) assert.ok(thing.y > layout.easel.y + layout.easel.height && thing.y < TABLE.height);
  }
  // The peek button is on the side of the hand in play, and the little film on the other.
  const [right, left] = ['right', 'left'].map((side) => layoutFor(1, CUTS[1], side));
  assert.ok(right.peek.x > TABLE.width / 2 && right.film.x < TABLE.width / 2);
  assert.ok(left.peek.x < TABLE.width / 2 && left.film.x > TABLE.width / 2);
});

test('the same seed lays out the same puzzle, and a new game has pictures the last one didn\'t', () => {
  const lay = (seed) => makePuzzle({ level: 7, seed }).rounds.map((round) => [round.pictures.map(({ name }) => name), round.pieces.map(({ x, y, angle, golden, sides }) => [x, y, angle, golden, sides])]);
  assert.deepEqual(lay(1234), lay(1234));
  assert.notDeepEqual(lay(1234), lay(4321));
  // Every picture has a name, and its characters are ones the games have.
  assert.ok(PICTURES.length >= 6);
  for (const name of PICTURES) {
    assert.ok(NAMES[name], `${name} has a name`);
    for (const who of CAST[name]) assert.ok(byId(who), `${who} in ${name}`);
  }
  // A game's pictures are all different, and the ones in the game before come last.
  for (let seed = 1; seed <= 40; seed += 1) {
    const first = choosePictures(seededRandom(seed), 3);
    assert.equal(new Set(first).size, 3);
    const second = choosePictures(seededRandom(seed + 100), 3, first);
    assert.ok(second.every((name) => !first.includes(name)), `${second} after ${first}`);
  }
  const used = makePuzzle({ level: 1, seed: 3 }).rounds.flatMap((round) => round.pictures.map(({ name }) => name));
  const after = makePuzzle({ level: 1, seed: 3, avoid: used }).rounds.flatMap((round) => round.pictures.map(({ name }) => name));
  assert.ok(after.every((name) => !used.includes(name)));
});

/* ---------- the levels ---------- */

test('the levels: each from 2 brings something new, which is in its first picture, and level 1 is the plain puzzle', () => {
  assert.deepEqual(puzzleNewAt(1), []);
  const plain = puzzleLevel(1);
  assert.deepEqual([plain.golden, plain.peek, plain.turned, plain.leaf, plain.jigsaw, plain.bubble, plain.magnet, plain.pair, plain.alive], [false, false, 0, false, false, false, false, false, false]);
  const first = makePuzzle({ level: 1 });
  assert.ok(first.pieces.every((piece) => !piece.golden && !piece.leaf && !piece.floating && piece.angle === 0 && Object.values(piece.sides).every((way) => way === 0)));
  assert.equal(first.round.peek, null);
  assert.equal(first.round.magnet, null);
  const seen = new Set();
  for (const level of LEVELS.slice(1)) {
    const news = puzzleNewAt(level);
    assert.equal(news.length, 1, `level ${level} brings one new thing`);
    for (const { key, mark, name, nameKa } of news) {
      assert.ok(mark && name && nameKa, `level ${level}'s news has a picture and a name in both languages`);
      assert.ok(!seen.has(key), `${key} is new only once`);
      seen.add(key);
      assert.ok(newsIsOn(key, level), `${key} is on at level ${level}`);
      assert.ok(!newsIsOn(key, level - 1), `${key} isn't on before level ${level}`);
      // It stays for the levels after it, and has a label for the first time it's met.
      for (const later of LEVELS.filter((each) => each > level)) assert.ok(newsIsOn(key, later), `${key} stays at level ${later}`);
      assert.equal(LABELS[key]?.length, 2, `${key} has a label in English and Georgian`);
    }
  }
  assert.deepEqual(Object.keys(NEWS).map(Number), LEVELS.slice(1));
});

test('level 10 has no more than a third more pieces to place than level 1, and nothing gets quicker', () => {
  const total = (level, pieces) => puzzlePlan(level, pieces).total;
  // As it comes, no level has more than a third more than level 1.
  for (const level of LEVELS) assert.ok(total(level, 'usual') <= total(1, 'usual') * (4 / 3) + 1e-9, `level ${level}: ${total(level, 'usual')} pieces`);
  // And with fewer or more, level 10 still hasn't.
  for (const pieces of CHOICES) assert.ok(total(10, pieces) <= total(1, pieces) * (4 / 3) + 1e-9, `${pieces}: ${total(10, pieces)} at level 10, ${total(1, pieces)} at level 1`);
  assert.equal(total(1, 'usual'), 12);
  assert.deepEqual([puzzlePlan(1).cols, puzzlePlan(1).rows], [2, 2], 'level 1 has 4 big pieces to a picture');
  // Pictures have more pieces as the levels go up, until there are two at once.
  const each = LEVELS.map((level) => puzzlePlan(level).cols * puzzlePlan(level).rows * puzzlePlan(level).frames);
  each.forEach((count, at) => assert.ok(at === 0 || count >= each[at - 1], `level ${at + 1} has ${count} at once`));
  // What floats goes as slowly at level 10 as when it first comes, and what helps lasts as long.
  for (const level of [7, 10]) {
    const puzzle = makePuzzle({ level });
    const floating = puzzle.pieces.find((piece) => piece.floating);
    assert.ok(Math.abs(Math.hypot(floating.floating.vx, floating.floating.vy) - EXTRAS.drift) < 1e-9);
  }
  assert.equal(makePuzzle({ level: 8 }).round.magnet.left, makePuzzle({ level: 10 }).round.magnet.left);
});

test('level 2: one piece of each picture is golden, and putting it in place gives a star', () => {
  const puzzle = makePuzzle({ level: 2 });
  for (const round of puzzle.rounds) assert.equal(round.pieces.filter((piece) => piece.golden).length, 1);
  const golden = puzzle.pieces.find((piece) => piece.golden);
  const plain = plainPiece(puzzle);
  pickUp(puzzle, plain);
  sweep(puzzle, plain, plain.home);
  assert.equal(puzzle.stats.prizes.star, 0, 'a plain piece gives none');
  run(puzzle, 0.3, NO_HAND);
  pickUp(puzzle, golden);
  sweep(puzzle, golden, golden.home);
  assert.equal(golden.state, 'placed');
  assert.equal(puzzle.stats.prizes.star, 1);
  assert.deepEqual(said(puzzle, 'prize').map(({ kind, at }) => [kind, at.x, at.y]), [['star', golden.home.x, golden.home.y]]);
  // Left on the board, it costs nothing: the picture still can't be finished without it, and waits.
  assert.equal(makePuzzle({ level: 1 }).pieces.some((piece) => piece.golden), false);
});

test('level 3: an open hand held on the peek button shows the finished picture for a few seconds, as often as it\'s wanted', () => {
  const puzzle = makePuzzle({ level: 3 });
  const { peek } = puzzle.round;
  assert.ok(peek);
  // A hand passing over it doesn't set it off, and nor does a closed one staying on it.
  run(puzzle, EXTRAS.peekHold * 0.5, open(peek));
  assert.equal(peek.showing, 0);
  run(puzzle, 1, open(AWAY));
  run(puzzle, 2, closed(peek));
  assert.equal(peek.showing, 0);
  assert.equal(said(puzzle, 'peek').length, 0);
  // Held on it, open, it shows the picture.
  run(puzzle, EXTRAS.peekHold + 0.1, open(peek));
  assert.ok(peek.showing > EXTRAS.peekSeconds - 0.2);
  assert.equal(said(puzzle, 'peek').length, 1);
  assert.equal(puzzle.stats.peeks, 1);
  // It stays for a few seconds after the hand has gone, and then it's over.
  run(puzzle, EXTRAS.peekSeconds - 0.5, NO_HAND);
  assert.ok(peek.showing > 0);
  run(puzzle, 1, NO_HAND);
  assert.equal(peek.showing, 0);
  // And again, whenever it's wanted. Staying on it keeps the picture up, and counts as one look.
  run(puzzle, EXTRAS.peekSeconds * 2, open(peek));
  assert.ok(peek.showing > EXTRAS.peekSeconds - 1.1);
  assert.equal(puzzle.stats.peeks, 2);
  // A piece can be carried over it without being lost.
  assert.equal(makePuzzle({ level: 2 }).round.peek, null);
});

test('level 4: a piece the wrong way up turns the right way up while an open hand holds it, and only then goes in', () => {
  const puzzle = makePuzzle({ level: 4 });
  const turned = puzzle.pieces.filter((piece) => piece.angle !== 0);
  assert.equal(turned.length, 1);
  const [piece] = turned;
  assert.ok([90, -90, 180].includes(piece.angle));
  const from = Math.abs(piece.angle);
  pickUp(puzzle, piece);
  // Taken straight to its place, it isn't the right way up yet, so it stays in the hand, turning.
  sweep(puzzle, piece, piece.home, { speed: 3, stay: 0 });
  assert.equal(piece.state, 'held');
  assert.ok(Math.abs(piece.angle) > 0 && Math.abs(piece.angle) < from);
  // Put down part of the way round, it stays as it is: nothing is lost. A closed hand doesn't turn it.
  run(puzzle, 0.5, closed(piece.home));
  const part = piece.angle;
  run(puzzle, 3, closed(piece.home));
  assert.equal(piece.angle, part);
  assert.equal(piece.state, 'loose');
  // Held again, it finishes turning, and goes in.
  run(puzzle, from / EXTRAS.turnRate + 0.3, open(piece.home));
  assert.equal(piece.angle, 0);
  assert.equal(piece.state, 'placed');
  assert.equal(said(puzzle, 'turned').length, 1);
  assert.equal(makePuzzle({ level: 8 }).pieces.filter((each) => each.angle !== 0).length, 2, 'two from level 8');
  assert.equal(makePuzzle({ level: 3 }).pieces.filter((each) => each.angle !== 0).length, 0);
});

test('level 5: a leaf lies on a piece, and an open hand brushes it away, or more slowly, rests on it', () => {
  const under = (puzzle) => puzzle.pieces.find((piece) => piece.leaf);
  const puzzle = makePuzzle({ level: 5 });
  const piece = under(puzzle);
  assert.ok(piece);
  assert.equal(puzzle.pieces.filter((each) => each.leaf).length, 1);
  // Under its leaf it can't be picked up, and a closed hand rubbing at the leaf does nothing.
  run(puzzle, 0.3, open(piece));
  assert.equal(puzzle.held, null);
  const rub = (hand) => (t) => ({ glove: { x: piece.x + Math.sin(t * 9) * 0.05, y: piece.y }, open: hand });
  const sofar = piece.leaf.brushed;
  run(puzzle, 3, rub(false));
  assert.equal(piece.leaf.brushed, sofar);
  // An open hand going to and fro over it brushes it off, quicker than one held still.
  const brushing = run(puzzle, 10, rub(true), () => !piece.leaf);
  assert.equal(piece.leaf, null);
  assert.equal(said(puzzle, 'leaf-off').length, 1);
  assert.ok(brushing < 1.5, `${brushing.toFixed(2)} s of brushing`);
  // And then the piece is picked up, as any other.
  run(puzzle, 0.2, open(piece));
  assert.equal(puzzle.held, piece);
  const still = makePuzzle({ level: 5 });
  const other = under(still);
  const resting = run(still, 10, open(other), () => !other.leaf);
  assert.ok(resting > brushing && resting <= EXTRAS.brushHold + 0.1, `${resting.toFixed(2)} s held still`);
  assert.equal(under(makePuzzle({ level: 4 })), undefined);
});

test('level 6: the pieces have knobs and holes, and each knob fits the hole in the piece beside it', () => {
  const puzzle = makePuzzle({ level: 6 });
  const { cols, rows } = puzzle.plan;
  const at = (col, row) => puzzle.pieces.find((piece) => piece.col === col && piece.row === row);
  let joins = 0;
  for (const piece of puzzle.pieces) {
    const { top, right, bottom, left } = piece.sides;
    // Straight along the picture's own edges.
    assert.equal(top === 0, piece.row === 0);
    assert.equal(left === 0, piece.col === 0);
    assert.equal(bottom === 0, piece.row === rows - 1);
    assert.equal(right === 0, piece.col === cols - 1);
    if (piece.col < cols - 1) {
      assert.equal(right + at(piece.col + 1, piece.row).sides.left, 0, 'a knob meets a hole');
      assert.ok(Math.abs(right) === 1);
      joins += 1;
    }
    if (piece.row < rows - 1) {
      assert.equal(bottom + at(piece.col, piece.row + 1).sides.top, 0);
      joins += 1;
    }
  }
  assert.equal(joins, (cols - 1) * rows + (rows - 1) * cols);
  // Before level 6 every cut is straight.
  const straight = cutEdges(3, 2, false);
  assert.deepEqual(sidesOf(straight, 1, 0, 3, 2), { top: 0, right: 0, bottom: 0, left: 0 });
  assert.ok(makePuzzle({ level: 5 }).pieces.every((piece) => Object.values(piece.sides).every((way) => way === 0)));
});

test('level 7: a piece floats slowly about in a bubble, and an open hand that touches it pops it and has the piece', () => {
  const puzzle = makePuzzle({ level: 7 });
  const floating = puzzle.pieces.filter((piece) => piece.floating);
  assert.equal(floating.length, 1);
  const [piece] = floating;
  const start = { x: piece.x, y: piece.y };
  run(puzzle, 4, NO_HAND);
  const went = Math.hypot(piece.x - start.x, piece.y - start.y);
  assert.ok(went > 0.2 && went < 0.3, `it floated ${went.toFixed(2)} in 4 seconds`);
  // A closed hand in it doesn't pop it.
  run(puzzle, 0.5, () => closed(piece));
  assert.ok(piece.floating);
  // An open one does, from anywhere in the bubble, and the piece is in the hand. (From the side of it towards the
  // middle of the table, where no other piece is nearer.)
  const edge = () => open({ x: piece.x + (piece.x < TABLE.width / 2 ? 1 : -1) * puzzle.bubbleRadius() * 0.9, y: piece.y });
  run(puzzle, 0.1, edge);
  assert.equal(piece.floating, null);
  assert.equal(puzzle.held, piece);
  assert.equal(said(puzzle, 'pop').length, 1);
  // Put down, it lies still, like any other piece.
  run(puzzle, 1, NO_HAND);
  const lying = { x: piece.x, y: piece.y };
  run(puzzle, 5, NO_HAND);
  assert.deepEqual({ x: piece.x, y: piece.y }, lying);
  assert.equal(makePuzzle({ level: 6 }).pieces.some((each) => each.floating), false);
});

test('level 8: the magnet draws pieces to the open hand, and into place from twice as far, and only runs down while the hand is open', () => {
  const puzzle = makePuzzle({ level: 8 });
  const { magnet } = puzzle.round;
  assert.equal(magnet.state, 'waiting');
  const usual = puzzle.snapRadius();
  // The glove coming to its bubble takes it.
  run(puzzle, 0.1, () => closed(magnet));
  assert.equal(magnet.state, 'on');
  assert.equal(said(puzzle, 'magnet').length, 1);
  assert.equal(puzzle.snapRadius(), usual * EXTRAS.magnetSnap);
  // A closed hand, or none, doesn't use it up.
  run(puzzle, 20, closed(AWAY));
  run(puzzle, 20, NO_HAND);
  assert.equal(magnet.left, EXTRAS.magnetSeconds);
  // A loose piece a good way from the open hand flies to it.
  const piece = plainPiece(puzzle);
  const far = EXTRAS.magnetRange * 0.9;
  const off = { x: piece.x + (piece.x < 1 ? far : -far), y: piece.y };
  assert.ok(!puzzle.over(piece, off), 'further off than a hand could pick it up from');
  run(puzzle, 0.6, open(off));
  assert.equal(puzzle.held, piece);
  assert.ok(Math.hypot(piece.x - off.x, piece.y - off.y) < 0.01);
  // And it goes in from twice as far off its place.
  sweep(puzzle, off, { x: piece.home.x + usual * 1.6, y: piece.home.y });
  assert.equal(piece.state, 'placed');
  // It runs down while the hand is open, and then it's over.
  run(puzzle, EXTRAS.magnetSeconds + 1, open(AWAY));
  assert.equal(magnet.state, 'done');
  assert.equal(said(puzzle, 'magnet-done').length, 1);
  assert.equal(puzzle.snapRadius(), usual);
  assert.equal(makePuzzle({ level: 7 }).round.magnet, null);
});

test('level 9: two pictures at once, side by side, with their pieces mixed up on the boards', () => {
  const puzzle = makePuzzle({ level: 9 });
  const { round } = puzzle;
  assert.equal(round.pictures.length, 2);
  assert.notEqual(round.pictures[0].name, round.pictures[1].name);
  const [first, second] = round.layout.frames;
  assert.ok(first.x + first.width < second.x, 'side by side');
  // Each picture's pieces go into its own frame, and both lots are on both boards.
  for (const piece of round.pieces) {
    const frame = round.layout.frames[piece.frame];
    assert.ok(piece.home.x > frame.x && piece.home.x < frame.x + frame.width && piece.home.y > frame.y && piece.home.y < frame.y + frame.height);
  }
  for (const frame of [0, 1]) {
    const lying = round.pieces.filter((piece) => piece.frame === frame && !piece.floating);
    assert.ok(lying.some((piece) => piece.x < 1) && lying.some((piece) => piece.x > 1), `picture ${frame}'s pieces are on both sides`);
  }
  assert.equal(puzzle.rounds.length, 1);
  assert.equal(round.pieces.filter((piece) => piece.golden).length, 2, 'a golden piece in each');
  // Both have to be finished.
  playThrough(puzzle);
  assert.equal(puzzle.stats.pictures, 2);
  assert.equal(makePuzzle({ level: 8 }).round.pictures.length, 1);
});

test('level 10: a finished picture comes to life, and gives a gem', () => {
  const puzzle = makePuzzle({ level: 10 });
  playThrough(puzzle);
  assert.equal(said(puzzle, 'alive').length, 1);
  assert.ok(puzzle.round.alive);
  assert.equal(puzzle.stats.prizes.gem, 2, 'one for each picture');
  const before = makePuzzle({ level: 9 });
  playThrough(before);
  assert.equal(said(before, 'alive').length, 0);
  assert.equal(before.stats.prizes.gem, 0);
  assert.ok(PARTY_SECONDS > 2);
});

test('what a level brings is each on a piece of its own, for as long as there are pieces', () => {
  for (const level of LEVELS) {
    for (const pieces of CHOICES) {
      const puzzle = makePuzzle({ level, pieces });
      for (const round of puzzle.rounds) {
        for (const piece of round.pieces) {
          const special = [piece.golden, Boolean(piece.leaf), Boolean(piece.floating), piece.angle !== 0].filter(Boolean).length;
          assert.ok(special <= 1, `level ${level}, ${pieces}: piece ${piece.id} has ${special} things about it`);
        }
      }
    }
  }
});

/* ---------- with friends ---------- */

test('with friends, the plain puzzle: one picture at a time, with none of what the levels bring', () => {
  for (const level of LEVELS) {
    const plan = puzzlePlan(level, 'usual', { friends: true });
    assert.deepEqual([plan.golden, plan.peek, plan.turned, plan.leaf, plan.jigsaw, plan.bubble, plan.magnet, plan.pair, plan.alive], [false, false, 0, false, false, false, false, false, false]);
    assert.equal(plan.frames, 1);
    const puzzle = makePuzzle({ level, friends: true });
    for (const round of puzzle.rounds) {
      assert.equal(round.pictures.length, 1);
      assert.equal(round.peek, null);
      assert.equal(round.magnet, null);
      assert.ok(round.pieces.every((piece) => !piece.golden && !piece.leaf && !piece.floating && piece.angle === 0));
    }
    // As many pieces as on their own: where a level has two pictures at once, one picture with as many as the two.
    assert.equal(plan.total, puzzlePlan(level).total, `level ${level}`);
  }
  assert.equal(puzzlePlan(9, 'usual', { friends: true }).cols * puzzlePlan(9, 'usual', { friends: true }).rows, 12);
});

/**
 * Friends' games, putting the same puzzle together, with a pretend server between them: the first claim of each
 * grab of a piece has it, and everyone is told. hold keeps the answers back, as a slow connection would, until
 * they're let go, and lose drops them, as a connection that breaks would. tell passes on what each game reports.
 */
function friendsPuzzle(players = ['aaaa', 'bbbb'], options = {}) {
  const claims = new Map();
  const puzzles = {};
  const held = [];
  let holding = false;
  let losing = false;
  const announce = (k, by) => {
    for (const id of players) puzzles[id].claimed(k, by);
  };
  const claim = (by) => (k) => {
    if (claims.has(k)) return;
    claims.set(k, by);
    if (losing) return;
    if (holding) held.push([k, by]);
    else announce(k, by);
  };
  for (const id of players) puzzles[id] = makePuzzle({ level: 3, friends: true, seed: 99, ...options, shared: { claim: claim(id) }, me: id });
  return {
    puzzles,
    claims,
    tell: (only = players) => {
      for (const from of only) for (const to of players) if (to !== from) puzzles[to].heard(from, JSON.parse(JSON.stringify(puzzles[from].report())));
    },
    hold: () => {
      holding = true;
    },
    letGo: () => {
      holding = false;
      for (const [k, by] of held.splice(0)) announce(k, by);
    },
    lose: (on = true) => {
      losing = on;
    },
  };
}

test('with friends, together, a piece one child holds can\'t be taken by another, and it goes with their glove on every computer', () => {
  const { puzzles, claims, tell } = friendsPuzzle();
  const { aaaa: ana, bbbb: ben } = puzzles;
  assert.deepEqual(ana.pieces.map(({ x, y }) => [x, y]), ben.pieces.map(({ x, y }) => [x, y]), 'the same puzzle, from the seed');
  const [mine] = ana.pieces;
  const theirs = ben.piece(mine.id);
  // Ana's open hand comes to a piece, and it's hers.
  run(ana, 0.1, open(mine));
  assert.equal(ana.held, mine);
  assert.ok(ana.sure);
  assert.deepEqual([...claims.entries()], [[mine.id * GRABS, 'aaaa']]);
  assert.deepEqual([theirs.state, theirs.holder], ['held', 'aaaa']);
  // Ben's open hand on it takes nothing: it's in Ana's.
  run(ben, 0.5, open(theirs));
  assert.equal(ben.held, null);
  assert.equal(claims.size, 1);
  // It goes where Ana's glove goes, on Ben's computer too.
  const to = { x: 1, y: 0.85 };
  sweep(ana, mine, to);
  for (let t = 0; t < 1; t += FRAME) ben.friendAt('aaaa', to, FRAME);
  assert.ok(Math.hypot(theirs.x - to.x, theirs.y - to.y) < 0.01);
  // Ana puts it down, and it lies in the same place for both, for either to pick up.
  run(ana, 1, closed(to));
  tell();
  assert.deepEqual([theirs.state, theirs.holder], ['loose', null]);
  assert.ok(Math.abs(theirs.x - mine.x) < 0.002 && Math.abs(theirs.y - mine.y) < 0.002);
  // What Ana's game said then, which may still be on its way when Ben picks the piece up.
  const late = JSON.parse(JSON.stringify(ana.report()));
  run(ben, 0.1, open(theirs));
  assert.equal(ben.held, theirs);
  assert.ok(ben.sure);
  assert.deepEqual([mine.state, mine.holder], ['held', 'bbbb'], 'and now it\'s in Ben\'s hand on Ana\'s computer');
  run(ana, 0.5, open(mine));
  assert.equal(ana.held, null);
  // Ben puts it down somewhere else. Ana's old word on it, arriving late, is about an older grab, so it doesn't move it.
  const there = { x: 1.8, y: 0.2 };
  sweep(ben, theirs, there);
  run(ben, 1, closed(there));
  const put = { x: theirs.x, y: theirs.y };
  ben.heard('aaaa', late);
  assert.deepEqual([theirs.state, theirs.x, theirs.y], ['loose', put.x, put.y]);
});

test('with friends, together, a piece put in place is in place for everyone, and counts for whoever put it there', () => {
  const { puzzles, tell } = friendsPuzzle();
  const { aaaa: ana, bbbb: ben } = puzzles;
  const [mine] = ana.pieces;
  pickUp(ana, mine);
  sweep(ana, mine, mine.home);
  assert.equal(mine.state, 'placed');
  tell();
  const theirs = ben.piece(mine.id);
  assert.equal(theirs.state, 'placed');
  assert.deepEqual([theirs.x, theirs.y], [theirs.home.x, theirs.home.y]);
  assert.deepEqual([...ben.tally.entries()], [['aaaa', 1]]);
  assert.deepEqual([...ana.tally.entries()], [['aaaa', 1]]);
  assert.equal(ben.stats.placed, 0, 'it isn\'t one of Ben\'s own');
  assert.deepEqual(said(ben, 'placed').map(({ by, mine: own }) => [by, own]), [['aaaa', false]]);
  // Said again and again, it's only counted once.
  tell();
  tell();
  assert.equal(ben.tally.get('aaaa'), 1);
  assert.equal(said(ben, 'placed').length, 1);
});

test('with friends, together, two children finish the puzzle between them, and it ends for both at once', () => {
  const { puzzles, tell } = friendsPuzzle(['aaaa', 'bbbb'], { level: 1 });
  const { aaaa: ana, bbbb: ben } = puzzles;
  const [first, second] = [child(ana, { speed: 0.6 }), child(ben, { speed: 0.5, wobble: 0.015 })];
  let t = 0;
  for (; t < 300 && !(ana.done && ben.done); t += FRAME) {
    ana.update(FRAME, first());
    ben.update(FRAME, second());
    // What each game says reaches the other about 10 times a second.
    if (Math.round(t / FRAME) % 6 === 0) tell();
  }
  assert.ok(ana.done && ben.done, 'both finish');
  assert.equal(ana.total, 12);
  for (const puzzle of [ana, ben]) {
    assert.equal([...puzzle.tally.values()].reduce((sum, count) => sum + count, 0), 12, 'every piece is counted once');
    assert.equal(said(puzzle, 'mended').length, 3);
  }
  assert.deepEqual([...ana.tally.entries()].sort(), [...ben.tally.entries()].sort(), 'and counted the same on both');
  assert.ok(ana.tally.get('aaaa') > 0 && ana.tally.get('bbbb') > 0, 'each of them put some in');
  assert.equal(ana.stats.placed, ana.tally.get('aaaa'));
});

test('with friends, together, of two hands that come to a piece at once only one has it, and nothing goes in before the server says whose it is', () => {
  const setup = friendsPuzzle();
  const { aaaa: ana, bbbb: ben } = setup.puzzles;
  // Not the first piece, whose number is 0, so a claim for it couldn't be mistaken for none.
  const mine = ana.pieces.find((piece) => piece.col === 1 && piece.row === 1);
  const theirs = ben.piece(mine.id);
  setup.hold();
  // Both pick it up, as far as each can tell, and carry it to its place: it waits there for the answer.
  for (const [puzzle, piece] of [[ana, mine], [ben, theirs]]) {
    pickUp(puzzle, piece);
    sweep(puzzle, piece, piece.home, { speed: 2 });
    assert.equal(piece.state, 'held');
    assert.ok(!puzzle.sure);
    // Until the server says whose it is, nobody tells the others it's in their hand.
    assert.equal(puzzle.report().h, -1);
  }
  // So what each game says while they wait takes it from neither.
  setup.tell();
  assert.deepEqual([ana.held, ben.held], [mine, theirs]);
  // Ana's claim was first, so it's hers, and in. Ben's hand lets go of it.
  setup.letGo();
  run(ana, 0.1, open(mine.home));
  run(ben, 0.1, open(theirs.home));
  assert.equal(mine.state, 'placed');
  assert.equal(ben.held, null);
  setup.tell();
  assert.equal(theirs.state, 'placed');
  assert.deepEqual([...ana.tally.entries()], [['aaaa', 1]]);
  assert.deepEqual([...ben.tally.entries()], [['aaaa', 1]]);
});

test('with friends, together, a claim with no answer is given up and asked again, and a hold nobody speaks for is put down', () => {
  const setup = friendsPuzzle();
  const { aaaa: ana, bbbb: ben } = setup.puzzles;
  const [mine] = ana.pieces;
  const theirs = ben.piece(mine.id);
  // The connection loses Ana's claim: after a while the piece is put down, and picked up again as a new grab.
  setup.lose();
  run(ana, 0.5, open(mine));
  assert.equal(ana.held, mine);
  assert.ok(!ana.sure);
  setup.lose(false);
  run(ana, 2, open(mine));
  assert.equal(ana.held, mine);
  assert.ok(ana.sure, 'the second time, it gets through');
  assert.deepEqual([...setup.claims.keys()], [mine.id * GRABS, mine.id * GRABS + 1]);
  assert.deepEqual([theirs.state, theirs.holder], ['held', 'aaaa']);
  // Ben's game was told a piece is in Ana's hand, and then Ana's game says, over and over, that her hand is empty and
  // nothing of where the piece is, as it would if it had missed the answer: after a moment it's put down for Ben.
  const lost = friendsPuzzle();
  const { aaaa: one, bbbb: two } = lost.puzzles;
  two.claimed(one.pieces[1].id * GRABS, 'aaaa');
  const stuck = two.piece(one.pieces[1].id);
  assert.equal(stuck.state, 'held');
  for (let t = 0; t < 2; t += 0.1) {
    run(two, 0.1, NO_HAND);
    lost.tell(['aaaa']);
  }
  assert.deepEqual([stuck.state, stuck.holder], ['loose', null]);
  // And Ben can pick it up.
  run(two, 0.1, open(stuck));
  assert.equal(two.held, stuck);
});

test('with friends, together, a friend who goes leaves what they held lying where it was, and what they put in stays in', () => {
  const { puzzles, tell } = friendsPuzzle();
  const { aaaa: ana, bbbb: ben } = puzzles;
  const [first, second] = ana.pieces;
  pickUp(ana, first);
  sweep(ana, first, first.home);
  run(ana, 0.3, NO_HAND);
  pickUp(ana, second);
  tell();
  assert.deepEqual([ben.piece(first.id).state, ben.piece(second.id).state], ['placed', 'held']);
  ben.friendGone('aaaa');
  assert.deepEqual([ben.piece(first.id).state, ben.piece(second.id).state], ['placed', 'loose']);
  assert.equal(ben.tally.get('aaaa'), 1);
  // Ben can finish it without them.
  playThrough(ben);
  assert.ok(ben.done);
});

test('with friends, what a game tells the others is only numbers: the piece in the hand, and where the last ones it held lie', () => {
  const { puzzles } = friendsPuzzle();
  const { aaaa: ana } = puzzles;
  assert.deepEqual(ana.report(), { h: -1, d: [], n: 0 });
  const [first, second] = ana.pieces;
  pickUp(ana, first);
  assert.deepEqual(ana.report(), { h: first.id * GRABS, d: [], n: 0 });
  sweep(ana, first, first.home);
  run(ana, 0.3, NO_HAND);
  pickUp(ana, second);
  const to = { x: 1.013, y: 0.8504 };
  sweep(ana, second, to);
  run(ana, 1, closed(to));
  const { h, d, n } = ana.report();
  assert.equal(h, -1);
  assert.equal(n, 1);
  assert.deepEqual(d, [[first.id * GRABS, first.home.x, first.home.y, 0, 1], [second.id * GRABS, 1.013, 0.85, 0, 0]]);
  assert.ok(JSON.stringify(d).length < 80);
});

test('against each other, every friend has a copy of the same puzzle to themselves, from the seed', () => {
  const copies = ['aaaa', 'bbbb', 'cccc'].map((me) => makePuzzle({ level: 6, friends: true, seed: 4242, me }));
  const laid = copies.map((puzzle) => puzzle.rounds.map((round) => [round.pictures.map(({ name }) => name), round.pieces.map(({ x, y, home }) => [x, y, home.x, home.y])]));
  assert.deepEqual(laid[0], laid[1]);
  assert.deepEqual(laid[0], laid[2]);
  // One finishing theirs changes nothing in another's.
  playThrough(copies[0]);
  assert.ok(copies[0].done);
  assert.equal(copies[1].stats.placed, 0);
  assert.ok(copies[1].pieces.every((piece) => piece.state === 'loose'));
  // With friends the table is laid for the right hand on every computer, whichever hand each child plays with.
  assert.equal(copies[0].side, 'right');
});

/* ---------- its voice, and its place among the games ---------- */

test('every line the game says has its English and Georgian voice files, and the game says each one', () => {
  const folder = new URL('../../games/giraffe-puzzles/audio/voice/', import.meta.url);
  const lines = JSON.parse(readFileSync(new URL('lines.json', folder), 'utf8'));
  assert.ok(lines.length >= 4);
  for (const { id, ka } of lines) {
    assert.ok(ka, `${id} has Georgian`);
    for (const language of ['en', 'ka']) assert.ok(readFileSync(new URL(`${language}/${id}.ogg`, folder)).length > 1000, `${language}/${id}.ogg`);
  }
  const source = readFileSync(new URL('../../games/giraffe-puzzles/main.js', import.meta.url), 'utf8');
  for (const { text } of lines) assert.ok(source.includes(text), `"${text}" is said by the game`);
});

test('the puzzles\' rooms are known to both servers, and a friend\'s glove and pieces are passed on to the game', () => {
  for (const file of ['../../server/worker.js', '../../tools/race-server.mjs']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /const GAMES = \[[^\]]*'giraffe-puzzles'/, file);
  }
  const friends = readFileSync(new URL('../../core/friends.js', import.meta.url), 'utf8');
  assert.match(friends, /'jigsaw'[^\]]*\]\.includes\(message\.t\)/);
});

/* ---------- the clock on the wall ---------- */

const ticking = (options = {}) => makePuzzle({ clock: 'ticks', ...options });

/** Plays until it's over, or a long time has gone, with a pretend child, and says how long it took. */
function solve(puzzle, options = {}, seconds = 900) {
  const hand = child(puzzle, options);
  return run(puzzle, seconds, () => hand(), () => puzzle.done);
}

test('on their own the clock gives each picture its time, and goes round while the hand is in the picture, open or closed', () => {
  const puzzle = ticking({ level: 1 });
  assert.equal(puzzle.timed, true);
  const { total } = puzzle.clock;
  assert.ok(Math.abs(total - (CLOCK.base[0] + puzzle.pieces.length * CLOCK.each[0])) < 1e-9, `${total} s for ${puzzle.pieces.length} pieces`);
  // No hand: it waits, however long the hand is away.
  run(puzzle, 120, NO_HAND);
  assert.equal(puzzle.clock.left, total);
  // A closed hand in the picture: it goes round all the same.
  run(puzzle, 5, closed(AWAY));
  assert.ok(Math.abs(puzzle.clock.left - (total - 5)) < 0.05);
  // Each picture has its own time, wound up as it comes.
  const hand = child(puzzle, { speed: 1.5 });
  run(puzzle, 120, () => hand(), () => puzzle.index > 0);
  assert.equal(puzzle.index, 1);
  assert.equal(puzzle.clock.left, puzzle.clock.total);
});

test('the clock running out before the picture is back together ends the game, a moment later, and the piece in the hand is put down', () => {
  const puzzle = ticking({ level: 1 });
  pickUp(puzzle, plainPiece(puzzle));
  let t = 0;
  for (; t < 300 && puzzle.phase === 'play'; t += FRAME) puzzle.update(FRAME, open(AWAY));
  assert.ok(Math.abs(t + 0.1 - puzzle.clock.total) < 0.1, `ran out after ${t} s`);
  assert.deepEqual([puzzle.phase, puzzle.lost, puzzle.done, puzzle.held], ['timeup', true, false, null]);
  assert.equal(said(puzzle, 'timeup').length, 1);
  // Nothing more can be done, and then it's over.
  const placed = puzzle.stats.placed;
  run(puzzle, CLOCK.timeUpSeconds - 0.1, open(plainPiece(puzzle) ?? AWAY));
  assert.equal(puzzle.stats.placed, placed);
  assert.equal(puzzle.done, false);
  run(puzzle, 0.2, NO_HAND);
  assert.deepEqual([puzzle.done, puzzle.lost], [true, true]);
});

test('a quick child mends every picture at every level in time, and a slow one does at level 1 and not at level 10', () => {
  for (const level of LEVELS) {
    for (const pieces of CHOICES) {
      const puzzle = ticking({ level, pieces });
      solve(puzzle, { speed: 1.5 });
      assert.ok(puzzle.done && !puzzle.lost, `level ${level}, ${pieces}: ${puzzle.lost ? 'the clock ran out' : 'not over'}`);
    }
  }
  const first = ticking({ level: 1, pieces: 'more' });
  solve(first, { speed: 0.2 });
  assert.ok(first.done && !first.lost, 'level 1, slowly');
  const last = ticking({ level: 10, pieces: 'more' });
  solve(last, { speed: 0.2 });
  assert.equal(last.lost, true, 'level 10, slowly');
  // Each piece has less time each level, and at level 10 under a quarter of level 1's.
  assert.ok(CLOCK.each[1] < CLOCK.each[0] / 4 && CLOCK.base[1] < CLOCK.base[0] / 2);
});

test('the gentle puzzle, and puzzles with friends, have no clock', () => {
  const gentle = makePuzzle({ clock: 'gentle', level: 10 });
  run(gentle, 400, closed(AWAY));
  assert.deepEqual([gentle.timed, gentle.clock, gentle.phase, gentle.lost], [false, null, 'play', false]);
  for (const options of [{ friends: true }, { friends: true, shared: { claim: () => {} } }]) {
    const friends = makePuzzle({ clock: 'ticks', ...options });
    assert.deepEqual([friends.timed, friends.clock], [false, null]);
  }
});

test('the grown-ups\' settings: the clock, more pieces and a closer snap come first, and the gentle puzzle can be chosen', () => {
  const source = readFileSync(new URL('../../games/giraffe-puzzles/main.js', import.meta.url), 'utf8');
  assert.match(source, /defaults: \{ puzzlePieces: 'more', puzzleSnap: 'closer', puzzleClock: 'ticks', /);
  assert.match(source, /choice\('puzzleClock', 'gentle', 'Gentle: /);
});
