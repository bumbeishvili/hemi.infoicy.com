// Giraffe's Riddle Doors: the riddles on the doors. Each is a square of pictures, 2 by 2 or 3 by 3, with the last one
// missing, and a few pieces to choose from, only one of which fits. It's the kind of puzzle in the picture parts of
// intelligence tests (matrix reasoning, as in Raven's Progressive Matrices): no words to read, and a rule to find
// along the rows. Each level brings a new kind of rule (KINDS), and the pieces that don't fit are each wrong in one
// way the rule decides, often a copy of the picture beside the gap or above it, so a guess is no help.
//
// No screen here, so it runs in the unit tests: riddle-art.js draws a picture. A picture is a plain object, as one of
//   { look: 'shapes', shape, colour, count, size }    count of one shape, from 1 to 5, small, middling or big (0 to 2)
//   { look: 'arrow', colour, turn }                   an arrow, turned so many eighths of the way round from pointing up
//   { look: 'sticks', colour, sticks }                some of the eight sticks in STICK_ENDS, as one bit each
//   { look: 'nest', outer, inner, colour }            an outline with a small shape inside it

export const SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'diamond'];
export const OUTLINES = ['circle', 'square', 'triangle', 'diamond'];
export const COLOURS = ['red', 'blue', 'yellow', 'green', 'purple'];
// Where each stick goes, in a square from -1 to 1: its four sides, the upright and the flat one through the middle,
// and the two slants.
export const STICK_ENDS = [
  [-1, -1, 1, -1],
  [1, -1, 1, 1],
  [-1, 1, 1, 1],
  [-1, -1, -1, 1],
  [0, -1, 0, 1],
  [-1, 0, 1, 0],
  [-1, -1, 1, 1],
  [1, -1, -1, 1],
];
const ALL_STICKS = (1 << STICK_ENDS.length) - 1;
export const MOST_COUNT = 5;

// The kinds of rule, one new at each level from 1 to 10.
//   rows     each row is one picture over and over (2 by 2)
//   two      one thing changes along the rows and another down the columns (2 by 2)
//   count    one more, or one fewer, each step along a row
//   grow     bigger each step along a row, or smaller
//   turn     an arrow turns the same way each step
//   once     each of three shapes once in every row
//   add      the last of a row is the first two put together
//   take     the last of a row is the first with the second taken away
//   double   two rules at once: counting along, and each colour once in every row
//   inside   an outline and a shape inside it, each with a rule of its own
export const KINDS = ['rows', 'two', 'count', 'grow', 'turn', 'once', 'add', 'take', 'double', 'inside'];

/** The same numbers every time from the same seed, so every friend's game has the same riddles. */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function shuffled(list, random) {
  const out = list.slice();
  for (let at = out.length - 1; at > 0; at -= 1) {
    const other = Math.floor(random() * (at + 1));
    [out[at], out[other]] = [out[other], out[at]];
  }
  return out;
}

const some = (list, n, random) => shuffled(list, random).slice(0, n);
const oneOf = (list, random) => list[Math.floor(random() * list.length)];
const without = (list, ...gone) => list.filter((each) => !gone.includes(each));
const bits = (mask) => Array.from({ length: STICK_ENDS.length }, (_, at) => at).filter((at) => mask & (1 << at));
const countBits = (mask) => bits(mask).length;

/** A picture's own key: two pictures are the same when their keys are. */
export function keyOf(cell) {
  switch (cell.look) {
    case 'shapes':
      return `shapes:${cell.shape}:${cell.colour}:${cell.count}:${cell.size}`;
    case 'arrow':
      return `arrow:${cell.colour}:${((cell.turn % 8) + 8) % 8}`;
    case 'sticks':
      return `sticks:${cell.colour}:${cell.sticks}`;
    case 'nest':
      return `nest:${cell.outer}:${cell.inner}:${cell.colour}`;
    default:
      return JSON.stringify(cell);
  }
}

export const same = (a, b) => keyOf(a) === keyOf(b);

const shapes = (shape, colour, count = 1, size = 1) => ({ look: 'shapes', shape, colour, count, size });
const arrow = (colour, turn) => ({ look: 'arrow', colour, turn: ((turn % 8) + 8) % 8 });
const sticks = (colour, mask) => ({ look: 'sticks', colour, sticks: mask });
const nest = (outer, inner, colour) => ({ look: 'nest', outer, inner, colour });

/** Some sticks, n of them, none of those in taken. */
function someSticks(n, random, taken = 0) {
  const free = bits(ALL_STICKS & ~taken);
  return some(free, n, random).reduce((mask, at) => mask | (1 << at), 0);
}

/* ---------- each kind of riddle ---------- */
// Each makes { size, grid, answer, near }: grid is size rows of size pictures, with the answer as the last of the last
// row, and near the pieces that don't fit, best first, each wrong in a way the rule decides.

const MAKERS = {
  // Each row is one picture over and over, so the gap is the same as the picture beside it.
  rows(random) {
    const [s0, s1, s2] = some(SHAPES, 3, random);
    const [k0, k1, k2] = some(COLOURS, 3, random);
    const [n0, n1] = [1 + Math.floor(random() * 2), 1 + Math.floor(random() * 2)];
    const a = shapes(s0, k0, n0);
    const b = shapes(s1, k1, n1);
    return { size: 2, grid: [[a, a], [b, b]], answer: b, near: [a, shapes(s2, k2, n1), shapes(s1, k2, n1), shapes(s2, k1, n1)] };
  },

  // One thing changes along the rows and another down the columns: shape, colour or how many.
  two(random) {
    const [across, down] = some(['shape', 'colour', 'count'], 2, random);
    const values = { shape: some(SHAPES, 3, random), colour: some(COLOURS, 3, random), count: shuffled([1, 2, 3], random) };
    const base = { shape: values.shape[0], colour: values.colour[0], count: values.count[0] };
    const at = (row, col) => {
      const parts = { ...base, [across]: values[across][col], [down]: values[down][row] };
      return shapes(parts.shape, parts.colour, parts.count);
    };
    const answer = at(1, 1);
    const third = (name) => {
      const parts = { shape: answer.shape, colour: answer.colour, count: answer.count, [name]: values[name][2] };
      return shapes(parts.shape, parts.colour, parts.count);
    };
    return { size: 2, grid: [[at(0, 0), at(0, 1)], [at(1, 0), answer]], answer, near: [at(1, 0), at(0, 1), third(across), third(down)] };
  },

  // One more each step along a row, or one fewer: each row its own shape and colour, and its own count to start from.
  count(random) {
    const way = random() < 0.65 ? 1 : -1;
    const rowShapes = some(SHAPES, 3, random);
    const rowColours = some(COLOURS, 3, random);
    const starts = [0, 1, 2].map(() => (way > 0 ? 1 + Math.floor(random() * 2) : 3 + Math.floor(random() * 2)));
    const grid = [0, 1, 2].map((row) => [0, 1, 2].map((col) => shapes(rowShapes[row], rowColours[row], starts[row] + way * col)));
    const answer = grid[2][2];
    const n = answer.count;
    const other = without(SHAPES, ...rowShapes)[0];
    return {
      size: 3,
      grid,
      answer,
      near: [grid[2][1], shapes(answer.shape, answer.colour, n + way > 0 && n + way <= MOST_COUNT ? n + way : n - 2 * way), shapes(rowShapes[1], answer.colour, n), shapes(answer.shape, rowColours[1], n), shapes(other, answer.colour, n)],
    };
  },

  // Bigger each step along a row, or smaller: one of a shape in each, each row its own shape and colour.
  grow(random) {
    const way = random() < 0.65 ? 1 : -1;
    const rowShapes = some(SHAPES, 3, random);
    const rowColours = some(COLOURS, 3, random);
    const sizeAt = (col) => (way > 0 ? col : 2 - col);
    const grid = [0, 1, 2].map((row) => [0, 1, 2].map((col) => shapes(rowShapes[row], rowColours[row], 1, sizeAt(col))));
    const answer = grid[2][2];
    return {
      size: 3,
      grid,
      answer,
      near: [grid[2][1], grid[2][0], shapes(rowShapes[1], answer.colour, 1, answer.size), shapes(answer.shape, rowColours[1], 1, answer.size), shapes(answer.shape, answer.colour, 2, answer.size)],
    };
  },

  // An arrow turns the same way each step along a row: a quarter turn, or at the higher levels an eighth or three.
  turn(random, { level }) {
    const steps = level >= 8 ? [1, 2, 3] : [2];
    const step = oneOf(steps, random) * (random() < 0.5 ? 1 : -1);
    const rowColours = some(COLOURS, 3, random);
    const starts = some([0, 1, 2, 3, 4, 5, 6, 7], 3, random);
    const grid = [0, 1, 2].map((row) => [0, 1, 2].map((col) => arrow(rowColours[row], starts[row] + step * col)));
    const answer = grid[2][2];
    const t = answer.turn;
    const k = answer.colour;
    // The other ways it could point, nearest the right one first, then the right way in another row's colour.
    const turns = Math.abs(step) === 2 ? [t - step, t + step, t + 4] : [t - step, t + step, t + 4, t + 2 * step, t - 2 * step];
    return { size: 3, grid, answer, near: [...turns.map((each) => arrow(k, each)), arrow(rowColours[1], t), arrow(rowColours[0], t)] };
  },

  // Each of three shapes once in every row, in a different order in each, and each row its own colour.
  once(random) {
    const three = some(SHAPES, 3, random);
    const shift = random() < 0.5 ? 1 : 2;
    const rowColours = some(COLOURS, 3, random);
    const grid = [0, 1, 2].map((row) => [0, 1, 2].map((col) => shapes(three[(col + row * shift) % 3], rowColours[row])));
    const answer = grid[2][2];
    const [first, second] = [grid[2][0], grid[2][1]];
    const other = without(SHAPES, ...three)[0];
    return { size: 3, grid, answer, near: [second, first, shapes(answer.shape, rowColours[1]), shapes(other, answer.colour), shapes(answer.shape, answer.colour, 2)] };
  },

  // The last of a row is the first two put together: every stick in either.
  add(random) {
    const rowColours = some(COLOURS, 3, random);
    const grid = [0, 1, 2].map((row) => {
      const a = someSticks(1 + Math.floor(random() * 2), random);
      const b = someSticks(1 + Math.floor(random() * 2), random, a);
      return [sticks(rowColours[row], a), sticks(rowColours[row], b), sticks(rowColours[row], a | b)];
    });
    const answer = grid[2][2];
    const all = answer.sticks;
    const k = answer.colour;
    const lessOne = all & ~(1 << oneOf(bits(all), random));
    const oneMore = all | (1 << oneOf(bits(ALL_STICKS & ~all), random));
    return { size: 3, grid, answer, near: [grid[2][1], grid[2][0], sticks(k, lessOne), sticks(k, oneMore), sticks(rowColours[1], all)] };
  },

  // The last of a row is the first with the second taken away.
  take(random) {
    const rowColours = some(COLOURS, 3, random);
    const grid = [0, 1, 2].map((row) => {
      const whole = someSticks(3 + Math.floor(random() * 2), random);
      const gone = some(bits(whole), 1 + Math.floor(random() * 2), random).reduce((mask, at) => mask | (1 << at), 0);
      return [sticks(rowColours[row], whole), sticks(rowColours[row], gone), sticks(rowColours[row], whole & ~gone)];
    });
    const answer = grid[2][2];
    const [whole, gone] = [grid[2][0].sticks, grid[2][1].sticks];
    const k = answer.colour;
    const left = answer.sticks;
    // Taking away, and one stick of what was taken left behind.
    const oneBack = left | (1 << oneOf(bits(gone), random));
    const lessOne = countBits(left) > 1 ? left & ~(1 << oneOf(bits(left), random)) : left | (1 << oneOf(bits(ALL_STICKS & ~whole), random));
    return { size: 3, grid, answer, near: [grid[2][1], grid[2][0], sticks(k, oneBack), sticks(k, lessOne), sticks(rowColours[1], left)] };
  },

  // Two rules at once: one more each step along a row, and each of three colours once in every row. Each row its own shape.
  double(random) {
    const rowShapes = some(SHAPES, 3, random);
    const three = some(COLOURS, 3, random);
    const shift = random() < 0.5 ? 1 : 2;
    const starts = [0, 1, 2].map(() => 1 + Math.floor(random() * 2));
    const grid = [0, 1, 2].map((row) => [0, 1, 2].map((col) => shapes(rowShapes[row], three[(col + row * shift) % 3], starts[row] + col)));
    const answer = grid[2][2];
    const { shape, colour, count } = answer;
    const [c0, c1] = [grid[2][0].colour, grid[2][1].colour];
    return {
      size: 3,
      grid,
      answer,
      near: [grid[2][1], shapes(shape, c1, count), shapes(shape, colour, count - 1), shapes(shape, c0, count), shapes(rowShapes[1], colour, count), shapes(shape, colour, count + 1 <= MOST_COUNT ? count + 1 : count - 2)],
    };
  },

  // An outline and a shape inside it: each of three outlines once in every row, and the shape inside the same all the
  // way down each column. Each row its own colour.
  inside(random) {
    const outers = some(OUTLINES, 3, random);
    const inners = some(without(SHAPES, 'diamond'), 3, random);
    const shift = random() < 0.5 ? 1 : 2;
    const rowColours = some(COLOURS, 3, random);
    const grid = [0, 1, 2].map((row) => [0, 1, 2].map((col) => nest(outers[(col + row * shift) % 3], inners[col], rowColours[row])));
    const answer = grid[2][2];
    const { outer, inner, colour } = answer;
    const [o0, o1] = [grid[2][0].outer, grid[2][1].outer];
    return { size: 3, grid, answer, near: [grid[2][1], nest(o1, inner, colour), nest(outer, inners[1], colour), nest(o0, inner, colour), nest(outer, inners[0], colour), nest(outer, inner, rowColours[1])] };
  },
};

/** A piece that doesn't fit, when a kind's own aren't enough: the answer with one thing about it changed. */
function anyOtherThan(answer, random) {
  switch (answer.look) {
    case 'shapes': {
      const change = oneOf(['shape', 'colour', 'count'], random);
      if (change === 'shape') return shapes(oneOf(without(SHAPES, answer.shape), random), answer.colour, answer.count, answer.size);
      if (change === 'colour') return shapes(answer.shape, oneOf(without(COLOURS, answer.colour), random), answer.count, answer.size);
      return shapes(answer.shape, answer.colour, oneOf(without([1, 2, 3, 4], answer.count), random), answer.size);
    }
    case 'arrow':
      return random() < 0.5 ? arrow(answer.colour, answer.turn + 1 + Math.floor(random() * 7)) : arrow(oneOf(without(COLOURS, answer.colour), random), answer.turn);
    case 'sticks':
      return sticks(answer.colour, answer.sticks ^ (1 << Math.floor(random() * STICK_ENDS.length)));
    default:
      return random() < 0.5 ? nest(oneOf(without(OUTLINES, answer.outer), random), answer.inner, answer.colour) : nest(answer.outer, answer.inner, oneOf(without(COLOURS, answer.colour), random));
  }
}

const valid = (cell) => cell.look !== 'shapes' || (cell.count >= 1 && cell.count <= MOST_COUNT && cell.size >= 0 && cell.size <= 2);
const visible = (cell) => cell.look !== 'sticks' || cell.sticks !== 0;

/**
 * A riddle of a kind (KINDS), with choices pieces to choose from, from random(). level tunes a kind a little, as an
 * arrow turning by eighths from level 8. Returns { kind, size, cells, hole, answer, options, right }: cells is every
 * picture, row by row, with null at the hole, the last of all, and options the pieces, with the one that fits at
 * options[right].
 */
export function makeRiddle(kind, random, { choices = 4, level = 1 } = {}) {
  const made = MAKERS[kind](random, { level });
  const options = [made.answer];
  const taken = new Set([keyOf(made.answer)]);
  const add = (cell) => {
    if (options.length >= choices || !valid(cell) || !visible(cell) || taken.has(keyOf(cell))) return;
    taken.add(keyOf(cell));
    options.push(cell);
  };
  for (const cell of made.near) add(cell);
  for (let tries = 0; options.length < choices && tries < 200; tries += 1) add(anyOtherThan(made.answer, random));
  const order = shuffled(options.map((_, at) => at), random);
  const cells = made.grid.flat();
  const hole = cells.length - 1;
  return {
    kind,
    size: made.size,
    cells: cells.map((cell, at) => (at === hole ? null : cell)),
    hole,
    answer: made.answer,
    options: order.map((at) => options[at]),
    right: order.indexOf(0),
  };
}
