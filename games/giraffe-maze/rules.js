// Giraffe's Maze: the numbers and rules, with no screen in this file, so they can be tested on their own.
//
// The maze is a grid of cells, cols across and rows down, with hedges between them. Places in it are in cells:
// the middle of the cell in column c and row r is at x = c + 0.5, y = r + 0.5, with y going down the screen. The
// child's character walks along the paths from the middle of one cell to the middle of the next, towards the
// child's open hand, and never through a hedge: see stepWalker. Each maze is made from a seed, so friends on their
// own computers all walk the same one. Level 1 is the plain game, and every level from 2 brings something new:
// see NEWS.
import { clampLevel, ramp } from '../../core/levels.js';

// Up, right, down and left.
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];
export const opposite = (d) => (d + 2) % 4;

// How hard: how many cells the maze has, so the bigger it is the narrower its paths. obstacles is how many things
// can stand in the way in one maze, from the levels.
export const SIZES = {
  easy: { cols: 5, rows: 3, obstacles: 1 },
  medium: { cols: 7, rows: 4, obstacles: 2 },
  hard: { cols: 9, rows: 5, obstacles: 3 },
};
export const SIZE_NAMES = Object.keys(SIZES);
// How many mazes in a game, each with a friend to find, as a grown-up chooses.
export const MAZE_COUNTS = [2, 3, 5];
// Reach help: how much further the glove goes than the hand, so a smaller movement crosses the whole maze.
export const REACH = { none: 1, little: 1.25, lots: 1.6 };
// How the character follows the hand: along the paths the hand leads it, or finding its own way to the hand.
export const WAYS = ['lead', 'find'];

export const WALK = {
  speed: 2.5, // Cells a second.
  stop: 0.06, // Closer to the hand than this, it stands still.
  better: 0.02, // Somewhere has to be at least this much nearer the hand to set off for it.
  straight: 0.04, // Going on the way it was going wins a close call, so it doesn't zigzag.
  cap: 0.22, // How far along a way it can go up to something standing in the middle of it.
};

export const REACHES = {
  pick: 0.42, // How near the middle of a cell the character has to come to pick up what's there.
  find: 0.5, // And to find a lost friend.
  gate: 0.6, // To open a gate with the key.
  touch: 0.62, // How near the glove has to be to a sheep or a bush to work on it, in cells.
  catch: 0.6, // To catch a butterfly, open or closed.
};

// What the levels bring, from level 2. Missing any of it never costs anything.
export const EXTRAS = {
  butterflyEvery: [9, 6], // Seconds between butterflies, at level 2 and at level 10.
  butterflyLife: 15,
  butterflies: 2, // At once, at most.
  butterflySpeed: 0.7, // Cells a second.
  sheepWake: 1, // Seconds of an open hand held on a sleeping sheep to wake it.
  sheepWakes: 12, // Seconds the character waits by a sleeping sheep before it wakes by itself.
  rubSeconds: 1.4, // Seconds of an open hand moving over a bush to rub it away.
  rubSpeed: 0.35, // Cells a second the glove has to move at, at least, for that to be rubbing.
  bushGoes: 15, // Seconds the character waits by a bush before it shrinks away by itself.
  shoesSeconds: 8, // How long the running shoes last, in seconds of the hand being open.
  shoesSpeed: 1.6,
  magnetSeconds: 8,
  magnetRange: 2.5, // Cells.
  magnetPull: 4, // Cells a second.
  birdSpeed: 5, // Cells a second.
  birdTrail: 14, // Seconds the bluebird's trail stays.
  gems: 2, // In the dead ends, at most.
};

// The sun, playing on their own: it goes down over each maze, and if it sets before the friend lost there is found,
// the game is over. It only moves while the hand is in the picture, and only while there's a maze to walk. A maze's
// time is base seconds, and slack times what it takes to walk straight to the friend, by way of the key if there's a
// gate, and to deal with what's in the way at once: work is the seconds for each thing, coming to it included. Both go
// from level 1's to level 10's. A grown-up can choose the gentle maze instead, with no sun, as it always was.
export const SUN = { base: [20, 3], slack: [3.5, 1.35], work: { sheep: 2.2, bush: 2.6, gate: 0.4 }, setSeconds: 2.4 };
export const SUNS = ['sets', 'gentle'];

export const FOUND_SECONDS = 1.3; // A friend found, or the way out reached in a race, cheers this long before the next maze.
export const SLIDE_SECONDS = 1.1; // The last maze fades away and the next comes in, over this long.
export const OUT_CELLS = 1.6; // Out of a maze in a race, the character walks on this far past the middle of the last cell.
export const FRUIT_SHARE = 0.36; // About this share of the cells have fruit. In a race, each child has all of their own.
export const FRUIT_KINDS = ['apple', 'orange', 'pear', 'banana', 'plum', 'peach'];

/** What changes from level 1 to 10. */
export function mazeLevel(level) {
  const at = clampLevel(level);
  return {
    // Fewer ways round as the levels go up, so more of it is one long path with some dead ends.
    loops: ramp(at, 0.12, 0.04),
    // From level 2, butterflies flutter over the maze, for the glove to catch.
    butterflies: at >= 2,
    butterflyEvery: ramp(Math.max(2, at), EXTRAS.butterflyEvery[0], EXTRAS.butterflyEvery[1]),
    // From level 3, a gate across the way, and its key somewhere to fetch first.
    gate: at >= 3,
    // From level 4, running shoes, which make the character quicker for a while.
    shoes: at >= 4,
    // From level 5, a sleepy sheep in the way, which wakes for an open hand held on it.
    sheep: at >= 5,
    // From level 6, gems in the dead ends.
    gems: at >= 6 ? EXTRAS.gems : 0,
    // From level 7, the bluebird, which shows the way to the friend.
    bird: at >= 7,
    // From level 8, a bush in the way, rubbed away with an open hand.
    bush: at >= 8,
    // From level 9, the magnet, which draws fruit and gems in for a while.
    magnet: at >= 9,
    // At level 10, a treasure chest with a crown in it.
    chest: at >= 10,
    // How long the sun takes to set over a maze: see SUN and sunSeconds.
    sunBase: ramp(at, SUN.base[0], SUN.base[1]),
    sunSlack: ramp(at, SUN.slack[0], SUN.slack[1]),
  };
}

/**
 * Seconds the sun takes to set over a maze, at a level: base, and slack times the walk straight to the friend, by way
 * of the key if there's a gate, at the character's own pace, and the work of what's in the way.
 */
export function sunSeconds(layout, level) {
  const { maze, start, goal, items, blockers } = layout;
  const open = (a, d) => maze.isOpen(a, d);
  const key = items.find((item) => item.kind === 'key');
  const steps = key ? distances(maze, start, open)[key.cell] + distances(maze, key.cell, open)[goal] : distances(maze, start, open)[goal];
  const work = blockers.reduce((sum, blocker) => sum + (SUN.work[blocker.kind] ?? 0), 0);
  const plan = mazeLevel(level);
  return plan.sunBase + plan.sunSlack * (steps / WALK.speed + work);
}

// What each level brings that's new, for the title card, the countdown and the finish card. key says which part of
// mazeLevel turns it on, which the unit tests check.
export const NEWS = {
  2: [{ key: 'butterflies', mark: '🦋', name: 'Butterflies to catch', nameKa: 'პეპლები' }],
  3: [{ key: 'gate', mark: '🔑', name: 'A gate and its key', nameKa: 'ჭიშკარი და გასაღები' }],
  4: [{ key: 'shoes', mark: '👟', name: 'Running shoes', nameKa: 'სარბენი კედები' }],
  5: [{ key: 'sheep', mark: '🐑', name: 'A sleepy sheep', nameKa: 'მძინარე ცხვარი' }],
  6: [{ key: 'gems', mark: '💎', name: 'Gems in the corners', nameKa: 'ძვირფასი ქვები' }],
  7: [{ key: 'bird', mark: '🐦', name: 'The bluebird shows the way', nameKa: 'ლურჯი ჩიტი' }],
  8: [{ key: 'bush', mark: '🌿', name: 'Bushes to rub away', nameKa: 'ბუჩქები' }],
  9: [{ key: 'magnet', mark: '🧲', name: 'The magnet', nameKa: 'მაგნიტი' }],
  10: [{ key: 'chest', mark: '👑', name: 'Treasure chests', nameKa: 'განძის სკივრები' }],
};

// The little label each new thing has beside it the first time it comes in a game, in English and Georgian.
// Nothing new is said out loud.
export const LABELS = {
  butterfly: ['Catch the butterfly!', 'დაიჭირე პეპელა!'],
  key: ['Take the key to the gate!', 'გასაღები ჭიშკართან მიიტანე!'],
  locked: ['Find the key!', 'იპოვე გასაღები!'],
  shoes: ['Running shoes!', 'სარბენი კედები!'],
  sheep: ['Hold your open hand on the sheep!', 'გაშლილი ხელი ცხვარზე გააჩერე!'],
  gem: ['A gem!', 'ძვირფასი ქვა!'],
  bird: ['The bluebird shows the way!', 'ლურჯი ჩიტი გზას გაჩვენებს!'],
  bush: ['Rub the bush with your open hand!', 'ბუჩქს გაშლილი ხელით გადაუსვი!'],
  magnet: ['The magnet!', 'მაგნიტი!'],
  chest: ['Treasure!', 'განძი!'],
  // In a race with friends, by the way out, as the first maze starts.
  wayOut: ['The way out!', 'გასასვლელი!'],
};

/** What's new at a level, as [{ key, mark, name, nameKa }]. Nothing at level 1. */
export const mazeNewAt = (level) => NEWS[clampLevel(level)] ?? [];

/** Whether the part of a level that a piece of news names is on. */
export function newsIsOn(key, level) {
  const plan = mazeLevel(level);
  return key === 'gems' ? plan.gems > 0 : Boolean(plan[key]);
}

// The things that stand in the way, and the helpers, each list newest first.
const OBSTACLES = ['bush', 'sheep', 'gate'];
const HELPERS = ['magnet', 'bird', 'shoes'];

/**
 * What one maze of a game has, at a level: index counts the mazes from 0. The newest thing a level brings is in
 * the first maze, so it's met, and the others take turns, with no more things in the way than the maze has room
 * for. With friends, extras is false, and it's the plain maze with its fruit, the same for everyone.
 */
export function featuresFor(level, index = 0, size = 'medium', { extras = true } = {}) {
  const plan = mazeLevel(level);
  if (!extras) return { obstacles: [], helper: null, gems: 0, chest: false, butterflies: false };
  const obstacles = OBSTACLES.filter((kind) => plan[kind]);
  const helpers = HELPERS.filter((kind) => plan[kind]);
  const room = (SIZES[size] ?? SIZES.medium).obstacles;
  // Taking turns: the first maze starts with the newest, and each maze after starts one further on.
  const turn = (list) => list.map((_, at) => list[(at + index) % list.length]);
  return {
    obstacles: obstacles.length ? turn(obstacles).slice(0, room) : [],
    helper: helpers.length ? turn(helpers)[0] : null,
    gems: plan.gems,
    chest: plan.chest,
    butterflies: plan.butterflies,
  };
}

/* ---------- seeds ---------- */

/** The same numbers from 0 to 1 every time for the same seed (mulberry32). */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const SEED_LENGTH = 6;

/** A new seed, as letters, which is how it goes to friends: see modeWord. */
export function newSeedWord(random = Math.random) {
  let word = '';
  for (let i = 0; i < SEED_LENGTH; i += 1) word += SEED_LETTERS[Math.floor(random() * SEED_LETTERS.length) % SEED_LETTERS.length];
  return word;
}

/** The seed a word of letters stands for. */
export function seedOf(word = '') {
  let seed = 0;
  for (const letter of String(word).toUpperCase()) {
    const at = SEED_LETTERS.indexOf(letter);
    if (at >= 0) seed = (seed * 26 + at) % 2147483647;
  }
  return seed;
}

/**
 * How hard and which maze, together in one word for friends' games, as in mediumKQZTRW: the host's size, in small
 * letters, and the seed every friend's game makes the same mazes from, in capitals. Friends' games are told it as
 * the host's mode (see server/race-room.js), which may only be letters.
 */
export const modeWord = (size, seed) => `${SIZE_NAMES.includes(size) ? size : 'medium'}${String(seed).replace(/[^A-Z]/g, '').slice(0, SEED_LENGTH) || 'A'}`;

/** The same, read back: anything else is medium, with a seed of its own. */
export function readMode(word = '') {
  const text = String(word);
  const size = SIZE_NAMES.find((each) => text.startsWith(each)) ?? 'medium';
  const seed = text.slice(SIZE_NAMES.includes(text.slice(0, size.length)) ? size.length : 0).replace(/[^A-Z]/g, '');
  return { size, seed: seed || 'A' };
}

/* ---------- the maze ---------- */

/** A grid of cells, each with a bit for each way out of it that's open: 1 up, 2 right, 4 down, 8 left. */
export class Maze {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.cells = new Uint8Array(cols * rows);
  }

  get count() {
    return this.cols * this.rows;
  }

  id(c, r) {
    return r * this.cols + c;
  }

  col(id) {
    return id % this.cols;
  }

  row(id) {
    return Math.floor(id / this.cols);
  }

  /** The middle of a cell, in cells. */
  centre(id) {
    return { x: this.col(id) + 0.5, y: this.row(id) + 0.5 };
  }

  /** The cell a place is in, the nearest one if it's outside. */
  cellAt(x, y) {
    const c = Math.min(this.cols - 1, Math.max(0, Math.floor(x)));
    const r = Math.min(this.rows - 1, Math.max(0, Math.floor(y)));
    return this.id(c, r);
  }

  /** The cell next to this one that way, or -1 off the edge. */
  next(id, d) {
    const c = this.col(id) + DX[d];
    const r = this.row(id) + DY[d];
    return c >= 0 && c < this.cols && r >= 0 && r < this.rows ? this.id(c, r) : -1;
  }

  isOpen(id, d) {
    return Boolean((this.cells[id] >> d) & 1);
  }

  carve(id, d) {
    const other = this.next(id, d);
    if (other < 0) return;
    this.cells[id] |= 1 << d;
    this.cells[other] |= 1 << opposite(d);
  }

  /** How many ways out a cell has. */
  degree(id) {
    let ways = 0;
    for (let d = 0; d < 4; d += 1) if (this.isOpen(id, d)) ways += 1;
    return ways;
  }
}

/** The direction from one cell to the next one, or -1 if they aren't next to each other. */
export function directionBetween(maze, a, b) {
  for (let d = 0; d < 4; d += 1) if (maze.next(a, d) === b) return d;
  return -1;
}

/** A number for the way between two cells, the same whichever end it's from. */
export const edgeKey = (a, b) => Math.min(a, b) * 4096 + Math.max(a, b);

/**
 * A maze with exactly one way between any two cells, dug out from start: a long winding path with side paths off
 * it. straight is how often it carries on the way it was going, so its paths run longer.
 */
export function digMaze(cols, rows, random, { start = 0, straight = 0.35 } = {}) {
  const maze = new Maze(cols, rows);
  const seen = new Uint8Array(maze.count);
  const stack = [{ id: start, d: -1 }];
  seen[start] = 1;
  while (stack.length) {
    const top = stack[stack.length - 1];
    const choices = [];
    for (let d = 0; d < 4; d += 1) {
      const other = maze.next(top.id, d);
      if (other >= 0 && !seen[other]) choices.push(d);
    }
    if (!choices.length) {
      stack.pop();
      continue;
    }
    let d = choices[Math.floor(random() * choices.length) % choices.length];
    if (top.d >= 0 && choices.includes(top.d) && random() < straight) d = top.d;
    const other = maze.next(top.id, d);
    maze.carve(top.id, d);
    seen[other] = 1;
    stack.push({ id: other, d });
  }
  return maze;
}

/**
 * How many steps each cell is from one cell, or -1 where it can't be reached. passable(a, d) says whether the way
 * from a in direction d can be walked: by default, any open way.
 */
export function distances(maze, from, passable = (a, d) => maze.isOpen(a, d)) {
  const dist = new Int16Array(maze.count).fill(-1);
  if (from < 0) return dist;
  dist[from] = 0;
  const queue = [from];
  for (let head = 0; head < queue.length; head += 1) {
    const a = queue[head];
    for (let d = 0; d < 4; d += 1) {
      if (!passable(a, d)) continue;
      const b = maze.next(a, d);
      if (b >= 0 && dist[b] < 0) {
        dist[b] = dist[a] + 1;
        queue.push(b);
      }
    }
  }
  return dist;
}

/** The cells on the way from one cell to another, both included, or [] if there's no way. */
export function wayBetween(maze, from, to, passable) {
  const dist = distances(maze, to, passable);
  if (dist[from] < 0) return [];
  const way = [from];
  let at = from;
  while (at !== to) {
    let stepped = false;
    for (let d = 0; d < 4; d += 1) {
      const b = maze.next(at, d);
      if (b >= 0 && passable(at, d) && dist[b] === dist[at] - 1) {
        way.push(b);
        at = b;
        stepped = true;
        break;
      }
    }
    if (!stepped) return [];
  }
  return way;
}

const shuffle = (list, random) => {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1)) % (i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};

/**
 * Opens a few more ways through, so there's sometimes another way round. keep() says whether the way just opened
 * may stay: things in the way have to stay the only way past, so they can't be walked round.
 */
export function addLoops(maze, count, random, keep = () => true) {
  const candidates = [];
  for (let id = 0; id < maze.count; id += 1) {
    for (const d of [1, 2]) {
      if (maze.next(id, d) >= 0 && !maze.isOpen(id, d)) candidates.push([id, d]);
    }
  }
  shuffle(candidates, random);
  let added = 0;
  for (const [id, d] of candidates) {
    if (added >= count) break;
    maze.carve(id, d);
    if (!keep(id, d)) {
      // Close it again.
      const other = maze.next(id, d);
      maze.cells[id] &= ~(1 << d);
      maze.cells[other] &= ~(1 << opposite(d));
      continue;
    }
    added += 1;
  }
  return added;
}

/** The cells with only one way in or out, which is where gems and chests go. */
export const deadEnds = (maze) => Array.from({ length: maze.count }, (_, id) => id).filter((id) => maze.degree(id) === 1);

/**
 * One maze of a game, with all that's in it. Returns { maze, start, goal, lost, way, blockers, items, race }:
 *   start      the cell the character comes in at, on the left
 *   goal       the cell on the right by the way out, as far along the paths as it can be: on their own, where the
 *              lost friend waits, and in a race with friends, where getting out of the maze is
 *   lost       the friend to find, on their own, as [{ id, k, cell, x, y }], and nobody in a race
 *   way        the cells from the start to the goal
 *   blockers   what stands in the way, each { id, kind, a, b, d, x, y }, between cells a and b, a on the start's side
 *   items      what's lying about, each { id, k, kind, cell, x, y, fruit }
 * seed and index make the same maze on every computer. features is what featuresFor says. race is true with
 * friends, who race each other out of the mazes.
 */
export function buildMaze({ seed, index = 0, size = 'medium', level = 1, features = featuresFor(level, index, size), race = false }) {
  const { cols, rows } = SIZES[size] ?? SIZES.medium;
  const random = seededRandom((seedOf(seed) * 31 + index * 7919 + 17) >>> 0);
  const startRow = Math.floor(rows / 2);
  const start = startRow * cols;
  const maze = digMaze(cols, rows, random, { start });
  const fromStart = distances(maze, start);

  // The way out is on the right, as far along the paths as it can be. On their own, the friend waits by it.
  let goal = -1;
  for (let r = 0; r < rows; r += 1) {
    const id = r * cols + cols - 1;
    if (goal < 0 || fromStart[id] > fromStart[goal]) goal = id;
  }
  const way = wayBetween(maze, start, goal, (a, d) => maze.isOpen(a, d));

  // Things in the way stand along the way to the friend, spread out, newest first, never right by the start or
  // the friend. A gate needs room before it for its key.
  const blockers = [];
  const wanted = features.obstacles.slice(0, Math.max(0, Math.floor((way.length - 4) / 2)));
  const low = 2;
  const high = way.length - 3;
  wanted.forEach((kind, order) => {
    if (high < low) return;
    let at = Math.round(low + ((high - low) * (order + 1)) / (wanted.length + 1));
    at = Math.min(high, Math.max(low, at));
    while (blockers.some((each) => Math.abs(each.at - at) < 2) && at < high) at += 1;
    if (blockers.some((each) => Math.abs(each.at - at) < 2)) return;
    const a = way[at];
    const b = way[at + 1];
    const d = directionBetween(maze, a, b);
    const mid = { x: (maze.centre(a).x + maze.centre(b).x) / 2, y: (maze.centre(a).y + maze.centre(b).y) / 2 };
    blockers.push({ id: `${kind}-${index}`, kind, a, b, d, at, ...mid });
  });

  // A few ways round, but none round anything in the way.
  const stillTheOnlyWay = () => blockers.every(({ a, b }) => {
    const without = distances(maze, start, (from, d) => maze.isOpen(from, d) && edgeKey(from, maze.next(from, d)) !== edgeKey(a, b));
    return without[b] < 0;
  });
  addLoops(maze, Math.round(maze.count * mazeLevel(level).loops), random, () => stillTheOnlyWay());
  // The way to the friend in the finished maze, which a way round may have made shorter.
  const open = (a, d) => maze.isOpen(a, d);
  way.splice(0, way.length, ...wayBetween(maze, start, goal, open));

  // Getting to the goal ends the maze, finding the friend or getting out, so nothing goes where it could only be
  // got to past it, and nothing lies on it.
  const beforeGoal = distances(maze, start, (a, d) => maze.isOpen(a, d) && a !== goal);
  const taken = new Set([start, goal]);
  for (let id = 0; id < maze.count; id += 1) if (beforeGoal[id] < 0) taken.add(id);
  const items = [];
  let itemNumber = 0;
  const add = (kind, cell, extra = {}) => {
    taken.add(cell);
    const { x, y } = maze.centre(cell);
    items.push({ id: `${kind}-${index}-${itemNumber}`, k: index * 1000 + 100 + itemNumber, kind, cell, x, y, ...extra });
    itemNumber += 1;
  };

  // The lost friend, on their own, by the way out. In a race, nobody is lost: the way out is what everyone's after.
  const lost = race ? [] : [{ id: `lost-${index}-0`, k: index * 1000, cell: goal, ...maze.centre(goal) }];
  const onWay = new Set(way);

  // The gate's key, somewhere that can be reached without going through the gate: a side path if there is one.
  const gate = blockers.find(({ kind }) => kind === 'gate');
  if (gate) {
    const before = distances(maze, start, (a, d) => maze.isOpen(a, d) && edgeKey(a, maze.next(a, d)) !== edgeKey(gate.a, gate.b));
    const reachable = Array.from({ length: maze.count }, (_, id) => id).filter((id) => before[id] > 0 && !taken.has(id) && id !== gate.a);
    const sides = reachable.filter((id) => !onWay.has(id));
    const ends = sides.filter((id) => maze.degree(id) === 1);
    const pool = ends.length ? ends : sides.length ? sides : reachable;
    if (pool.length) add('key', pool[Math.floor(random() * pool.length) % pool.length]);
    else blockers.splice(blockers.indexOf(gate), 1);
  }

  // A helper early on, where every way to where the child goes first passes, so it's met: the key, if there's a
  // gate, and otherwise the friend.
  if (features.helper) {
    const key = items.find(({ kind }) => kind === 'key');
    const routes = (key ? [key.cell, goal] : [goal]).map((first) => ({
      first,
      free: wayBetween(maze, start, first, open).slice(1, -1).filter((id) => !taken.has(id)),
    }));
    let cell;
    for (const { first, free } of routes) {
      const mustPass = (id) => distances(maze, start, (a, d) => open(a, d) && maze.next(a, d) !== id)[first] < 0;
      cell = free.slice(0, 4).find(mustPass) ?? free.find(mustPass);
      if (cell !== undefined) break;
    }
    cell ??= routes.find(({ free }) => free.length)?.free[0];
    if (cell !== undefined) add(features.helper, cell);
  }

  // Gems, and a treasure chest, in the dead ends, or down the side paths when there aren't enough dead ends free,
  // so they're always there at their levels.
  const freeEnds = shuffle(deadEnds(maze).filter((id) => !taken.has(id)), random);
  const sides = shuffle(Array.from({ length: maze.count }, (_, id) => id).filter((id) => !taken.has(id) && !onWay.has(id) && maze.degree(id) > 1), random);
  const hideaways = [...freeEnds, ...sides, ...shuffle(way.filter((id) => !taken.has(id)), random)];
  const hideaway = () => {
    while (hideaways.length && taken.has(hideaways[0])) hideaways.shift();
    return hideaways.shift();
  };
  if (features.chest) {
    const cell = hideaway();
    if (cell !== undefined) add('chest', cell);
  }
  for (let n = 0; n < features.gems; n += 1) {
    const cell = hideaway();
    if (cell !== undefined) add('gem', cell);
  }

  // Fruit, mostly along the way to the friend or the way out, and some down the side paths.
  const fruitCount = Math.round(maze.count * FRUIT_SHARE);
  const alongWay = shuffle(way.filter((id) => !taken.has(id)), random);
  const elsewhere = shuffle(Array.from({ length: maze.count }, (_, id) => id).filter((id) => !taken.has(id) && !onWay.has(id)), random);
  const pickFrom = [...alongWay.slice(0, Math.ceil(fruitCount * 0.6)), ...elsewhere, ...alongWay.slice(Math.ceil(fruitCount * 0.6))];
  for (const cell of pickFrom.slice(0, fruitCount)) add('fruit', cell, { fruit: FRUIT_KINDS[Math.floor(random() * FRUIT_KINDS.length) % FRUIT_KINDS.length] });

  return { maze, start, goal, lost, way, blockers, items, size, cols, rows, index, seed, race };
}

/* ---------- walking ---------- */

/**
 * The character in the maze: at the middle of cell a when d is -1, or t of the way from cell a to the next cell in
 * direction d. facing is the way it last moved.
 */
export const newWalker = (cell) => ({ a: cell, d: -1, t: 0, facing: 1 });

export function walkerAt(maze, walker) {
  const { x, y } = maze.centre(walker.a);
  if (walker.d < 0) return { x, y };
  return { x: x + DX[walker.d] * walker.t, y: y + DY[walker.d] * walker.t };
}

/** The point on a straight bit of path nearest the target: how far along it is, and how far from the target. */
function nearestAlong(x, y, d, length, target) {
  const along = DX[d] * (target.x - x) + DY[d] * (target.y - y);
  const s = Math.min(length, Math.max(0, along));
  return { s, gap: Math.hypot(target.x - (x + DX[d] * s), target.y - (y + DY[d] * s)) };
}

/** The nearest the walker can get to the target by setting off from a cell's middle that way: along it, and one path on. */
function reachFrom(maze, cell, d, target, limit) {
  const room = limit(cell, d);
  if (room <= 0) return Infinity;
  const { x, y } = maze.centre(cell);
  let best = nearestAlong(x, y, d, room, target).gap;
  if (room >= 1) best = Math.min(best, reachBeyond(maze, maze.next(cell, d), opposite(d), target, limit));
  return best;
}

/** The nearest it can get going on from a cell's middle, any way but back the way it came. */
function reachBeyond(maze, cell, back, target, limit) {
  const { x, y } = maze.centre(cell);
  let best = Infinity;
  for (let e = 0; e < 4; e += 1) {
    if (e === back) continue;
    const room = limit(cell, e);
    if (room > 0) best = Math.min(best, nearestAlong(x, y, e, room, target).gap);
  }
  return best;
}

/**
 * Moves the walker up to distance cells along the paths towards target, and returns how far it went. It heads for
 * the nearest point to the target it can see, along the path it's on or one path on from either end, so it goes
 * round a corner towards the hand rather than stopping just before it. It never goes back and forth: it only ever
 * heads for somewhere nearer the target than it is. limit(a, d) is how far it may go along the way from cell a in
 * direction d: 0 for a hedge, 1 for an open path, and a little way for one with something standing in it. field,
 * when the character finds its own way, is { goal, dist }: the cell to head for and how many steps each cell is
 * from it.
 */
export function stepWalker(maze, walker, target, distance, { limit, field = null }) {
  let left = distance;
  let moved = 0;
  // Standing still, it only sets off for somewhere clearly nearer, so a hand that trembles doesn't jiggle it. Once
  // it's walking, it goes all the way.
  const better = walker.walking ? 1e-4 : WALK.better;
  for (let guard = 0; guard < 16 && left > 1e-6; guard += 1) {
    const at = walkerAt(maze, walker);
    const gap = Math.hypot(target.x - at.x, target.y - at.y);
    const finding = field && field.goal >= 0 && field.goal !== walker.a && field.dist[walker.a] > 0;
    if (walker.d < 0) {
      let best = -1;
      if (finding) {
        for (let d = 0; d < 4 && best < 0; d += 1) {
          const b = maze.next(walker.a, d);
          if (b >= 0 && limit(walker.a, d) >= 1 && field.dist[b] === field.dist[walker.a] - 1) best = d;
        }
      }
      if (best < 0) {
        if (gap < WALK.stop) break;
        let bestScore = Infinity;
        for (let d = 0; d < 4; d += 1) {
          const reach = reachFrom(maze, walker.a, d, target, limit);
          if (reach >= gap - better) continue;
          const score = reach - (d === walker.facing ? WALK.straight : 0);
          if (score < bestScore) {
            bestScore = score;
            best = d;
          }
        }
      }
      if (best < 0) break;
      walker.d = best;
      walker.t = 0;
    }
    const d = walker.d;
    const b = maze.next(walker.a, d);
    // How far it wants to go along this path: forwards, or back if it's negative.
    let want;
    if (field && field.goal >= 0 && field.goal !== walker.a && field.goal !== b && field.dist[walker.a] >= 0) {
      want = b >= 0 && field.dist[b] >= 0 && field.dist[b] < field.dist[walker.a] ? Infinity : -Infinity;
    } else {
      // The nearest point on this path, ahead or behind, and the nearest one path on from either end of it.
      const room = limit(walker.a, d);
      const ahead = nearestAlong(at.x, at.y, d, room - walker.t, target);
      const behind = nearestAlong(at.x, at.y, opposite(d), walker.t, target);
      const onPast = room >= 1 ? reachBeyond(maze, b, opposite(d), target, limit) : Infinity;
      const backPast = reachBeyond(maze, walker.a, d, target, limit);
      // Only somewhere clearly nearer is worth setting off for, and going on the way it's going wins a close call.
      const choices = [[ahead.gap, ahead.s, true], [behind.gap, -behind.s, false], [onPast, room - walker.t, true], [backPast, -walker.t, false]];
      let bestScore = Infinity;
      want = 0;
      for (const [reach, go, onwards] of choices) {
        if (reach >= gap - better) continue;
        const score = reach - (onwards ? WALK.straight : 0);
        if (score < bestScore) {
          bestScore = score;
          want = go;
        }
      }
    }
    if (want > 1e-6) {
      const step = Math.min(left, want, limit(walker.a, d) - walker.t);
      if (step <= 1e-6) break;
      walker.t += step;
      left -= step;
      moved += step;
      walker.facing = d;
      if (walker.t >= 1 - 1e-6) {
        walker.a = b;
        walker.d = -1;
        walker.t = 0;
      }
    } else if (want < -1e-6) {
      const step = Math.min(left, -want, walker.t);
      if (step > 1e-6) {
        walker.t -= step;
        left -= step;
        moved += step;
        walker.facing = opposite(d);
      }
      if (walker.t <= 1e-6) {
        walker.d = -1;
        walker.t = 0;
      } else {
        break;
      }
    } else {
      break;
    }
  }
  walker.walking = moved > 1e-6;
  return moved;
}

/**
 * For finding its own way: the cell nearest the target that can be got to from the walker, and how many steps each
 * cell is from it. passable(a, d) says which ways can be walked now.
 */
export function wayToward(maze, walker, target, passable) {
  const from = distances(maze, walker.a, passable);
  let goal = -1;
  let best = Infinity;
  for (let id = 0; id < maze.count; id += 1) {
    if (from[id] < 0) continue;
    const { x, y } = maze.centre(id);
    const score = Math.hypot(x - target.x, y - target.y) + from[id] * 0.001;
    if (score < best) {
      best = score;
      goal = id;
    }
  }
  return { goal, dist: distances(maze, goal, passable) };
}

/**
 * A trail of where a walker has been, newest first, so the friends it has found can follow along behind it.
 */
export class Trail {
  constructor(spacing = 0.06, longest = 6) {
    this.spacing = spacing;
    this.longest = longest;
    this.points = [];
  }

  /** Starts again at a place, with the trail going back the way it came in from, as at the way in on the left. */
  reset(x, y, back = { x: -1, y: 0 }) {
    this.points = [];
    for (let along = 0; along <= this.longest; along += this.spacing) this.points.push({ x: x + back.x * along, y: y + back.y * along });
  }

  add(x, y) {
    const head = this.points[0];
    if (!head) {
      this.points.unshift({ x, y });
      return;
    }
    const gap = Math.hypot(x - head.x, y - head.y);
    if (gap < this.spacing) return;
    // Long jumps, as from a friend's game, are filled in, so followers don't cut corners too much.
    const steps = Math.min(40, Math.floor(gap / this.spacing));
    for (let i = 1; i <= steps; i += 1) this.points.unshift({ x: head.x + ((x - head.x) * i) / steps, y: head.y + ((y - head.y) * i) / steps });
    const most = Math.ceil(this.longest / this.spacing) + 2;
    if (this.points.length > most) this.points.length = most;
  }

  /** Where something following this far behind is, and which way it's heading. */
  behind(distance) {
    const { points } = this;
    if (!points.length) return null;
    const at = Math.min(points.length - 1, Math.round(distance / this.spacing));
    const here = points[at];
    const ahead = points[Math.max(0, at - 3)];
    return { x: here.x, y: here.y, dx: ahead.x - here.x, dy: ahead.y - here.y };
  }
}

/** The way a step from one place to another faces: 0 up, 1 right, 2 down, 3 left. */
export function facingOf(dx, dy, otherwise = 2) {
  if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) return otherwise;
  return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
}

/** Who is lost in each maze of a game on their own: the friends, never the child's own character, a new one each. */
export function castFor(roster, mine, count, level = 1) {
  const others = roster.filter((id) => id !== mine);
  const from = (clampLevel(level) - 1) % others.length;
  return Array.from({ length: count }, (_, at) => others[(from + at) % others.length]);
}
