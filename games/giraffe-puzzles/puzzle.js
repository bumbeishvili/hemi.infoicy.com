// Giraffe's Puzzles: Giraffe's picture fell off the wall and broke into pieces, and the child puts it back together.
// The pieces lie on a board at each side, with the empty frame on Giraffe's easel in the middle. An open hand over a
// loose piece picks it up, and the piece goes with the hand for as long as it stays open. Brought near its place, it
// snaps in. A hand that closes, or can't be seen, just leaves the piece where it is: nothing is lost, and nothing has
// to be gripped. Keeping the hand open while reaching to every part of the picture is what's practised.
//
// The rules are here, with no screen, so they run in the unit tests. main.js says where the glove is and whether the
// hand is open, and view.js draws what this says. Places are in table units: the table is TABLE.width wide and 1 high,
// x across from the left and y down from the top, the same on every screen.
//
// On their own, as it comes, the clock on the playroom wall gives each picture its time, and a picture not back
// together when it runs out ends the game. It only goes round while the hand is in the picture, so a child who goes
// away, or whose hand the camera loses, comes back to it as they left it. A grown-up can choose the gentle puzzle
// instead, which is the game as it always was: nothing has a time limit and nothing goes away, and a resting child
// comes back to it just as they left it. With friends there's no clock.
//
// With friends, together, everyone works on the same puzzle, each on their own computer. A hand that comes to a
// loose piece claims it, and the server says whose each claim is (claimed), the first having it, so a piece one
// child holds can't be taken by another. Each game tells the others which piece it holds, and where the pieces it
// last held now lie, so every computer shows the same puzzle. Against each other, each has a copy of the same
// puzzle to themselves, and only how far they've got goes to the others.
import { clampLevel, stepsAt } from '../../core/levels.js';

export const TABLE = { width: 2, height: 1 };
// How a picture can be cut, as pieces across and down. A level chooses one, and a grown-up can have one step fewer
// or more pieces than that.
export const CUTS = [[2, 1], [2, 2], [3, 2], [4, 2], [4, 3], [5, 3]];
export const PIECE_CHOICES = { fewer: -1, usual: 0, more: 1 };
// How near its place a piece has to be brought, as a share of a piece's shorter side: generous unless a grown-up
// chooses otherwise.
export const SNAPS = { near: 0.6, closer: 0.4, exact: 0.22 };
// Reach help: how much further the glove goes than the hand, so a smaller movement crosses the whole table, and how
// far outside a piece the middle of the glove can be and still pick it up, in table units.
export const REACH = { none: 1, little: 1.25, lots: 1.6 };
export const GRAB = { none: 0.012, little: 0.03, lots: 0.06 };
// The pictures there are, by name: pictures.js draws them. A game takes different ones each time.
export const PICTURES = ['meadow', 'stall', 'lighthouse', 'balloons', 'racer', 'picnic', 'ship', 'rocket'];
// The clock on the wall, as a grown-up chooses: it gives each picture its time (the default), or the gentle puzzle,
// with no clock.
export const CLOCKS = ['ticks', 'gentle'];
// A picture's time: base seconds, and so many for each of its pieces, each from level 1's to level 10's. A piece the
// wrong way up, under a leaf or in a bubble has extra seconds more. timeUpSeconds is how long the clock is looked at
// once it has run out, before the finish card.
export const CLOCK = { base: [12, 3], each: [9, 2], extra: 1.5, timeUpSeconds: 2.4 };

// The frame on the easel, when there's one picture, and when there are two side by side.
const FRAME_ONE = { width: 0.72, height: 0.54 };
const FRAME_TWO = { width: 0.48, height: 0.36, gap: 0.06 };
export const FRAME_EDGE = 0.022; // The wood round a picture.
const FRAME_MIDDLE = 0.5; // How far down the table the middle of the picture is.
// The board at each side, where the loose pieces lie: how far in from the table's edges, from the frame, and from
// its own edges the pieces keep.
const BOARD = { margin: 0.025, top: 0.05, bottom: 0.95, fromFrame: 0.012, pad: 0.016 };
const SLOT_GAP = 0.02;
const EDGE = 0.012; // How near the table's edge a piece can come: all of it stays on the table.

const FOLLOW_RATE = 14; // How tightly a piece follows the hand that has it.
// A hand that was open a moment ago still has its piece for this long, as the tracker can read an open hand as
// closed for a few frames while it moves. A piece only snaps in while the hand really is open.
export const GRACE = 0.25;
export const HINT_AFTER = 4; // Seconds a piece has been carried before its place lights up, so nobody is stuck.
const HINT_RATE = 2;
export const MENDED_SECONDS = 2.6; // A finished picture is looked at this long before the next one.
export const PARTY_SECONDS = 2.4; // And the last one, before the finish card.

// What the levels bring. Missing any of it never costs anything.
export const EXTRAS = {
  turnRate: 100, // Degrees a second a piece the wrong way up turns while it's held.
  peekHold: 0.5, // Seconds an open hand stays on the peek button before it shows the picture.
  peekSeconds: 4, // How long the finished picture shows.
  peekReach: 0.1, // How near the button the glove has to be, in table units.
  brushDistance: 0.35, // How far an open hand has to move over a leaf to brush it away, in table units.
  brushHold: 2.5, // Or how long it has to stay on it, held still.
  drift: 0.07, // How fast a bubble floats, in table units a second.
  bubble: 0.62, // How big a bubble is round its piece, as a share of the piece's longer side.
  magnetSeconds: 8, // How long the magnet lasts, which only runs down while the hand is open.
  magnetTouch: 0.11, // How near the glove has to come to the magnet's bubble to take it.
  magnetRange: 0.42, // With the magnet, a loose piece this near the open hand flies to it.
  magnetSnap: 2, // And a piece snaps into place from this many times as far.
};
// With friends: a claim with no answer for this long is given up, as the connection may have lost it, and a piece
// a friend is said to hold, when their own game says it doesn't, is put down where it is after this long.
const ASK_AGAIN_SECONDS = 1.5;
const LET_GO_SECONDS = 1.2;
export const GRABS = 1000; // A claim is a piece's number times this, plus which grab of it this is.

/** What changes from level 1 to 10. Each level from 2 brings something new: see NEWS. */
export function puzzleLevel(level) {
  const at = clampLevel(level);
  return {
    // How a picture is cut, as a place in CUTS: 4 big pieces at first, then 6, then 8.
    cut: stepsAt(at, { 1: 1, 3: 2, 6: 3, 9: 2 }),
    // How many times the frame is filled in a game. Fewer as the pictures have more pieces, so a game at level
    // 10 has no more than a third more pieces to place than one at level 1.
    rounds: stepsAt(at, { 1: 3, 3: 2, 9: 1 }),
    // From level 2, one piece of each picture is golden, and putting it in place gives a star.
    golden: at >= 2,
    // From level 3, a button that shows the finished picture for a few seconds, for an open hand held on it.
    peek: at >= 3,
    // From level 4, a piece that lies the wrong way up, and turns the right way up while it's held. Two from 8.
    turned: stepsAt(at, { 1: 0, 4: 1, 8: 2 }),
    // From level 5, a leaf lying on a piece, which an open hand brushes away.
    leaf: at >= 5,
    // From level 6, the pieces have knobs and holes, like a jigsaw's.
    jigsaw: at >= 6,
    // From level 7, one piece floats slowly about in a bubble, until an open hand pops it.
    bubble: at >= 7,
    // From level 8, a magnet in a bubble: for a while pieces fly to the open hand, and into place from further.
    magnet: at >= 8,
    // From level 9, two pictures at once, side by side, with their pieces mixed up.
    pair: at >= 9,
    // At level 10, a finished picture comes to life, and gives a gem.
    alive: at >= 10,
  };
}

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/**
 * The puzzle for a level, with how many pieces a grown-up chose: fewer, usual or more. With friends it's the plain
 * puzzle, one picture at a time, without what the levels bring, and where a level has two pictures at once, one
 * with as many pieces as the two.
 */
export function puzzlePlan(level, pieces = 'usual', { friends = false } = {}) {
  const base = puzzleLevel(level);
  const shift = PIECE_CHOICES[pieces] ?? 0;
  const frames = base.pair && !friends ? 2 : 1;
  const cutIndex = clamp((base.pair && friends ? 4 : base.cut) + shift, 0, CUTS.length - 1);
  const [cols, rows] = CUTS[cutIndex];
  const plain = friends ? { golden: false, peek: false, turned: 0, leaf: false, jigsaw: false, bubble: false, magnet: false, pair: false, alive: false } : {};
  return { ...base, ...plain, cutIndex, cols, rows, frames, total: cols * rows * frames * base.rounds };
}

// What each level brings that's new, for the title card, the countdown and the finish card. key says which part of
// puzzleLevel turns it on, which the unit tests check.
export const NEWS = {
  2: [{ key: 'golden', mark: '⭐', name: 'A golden piece', nameKa: 'ოქროს ნაწილი' }],
  3: [{ key: 'peek', mark: '👀', name: 'A peek at the picture', nameKa: 'სურათის ნახვა' }],
  4: [{ key: 'turned', mark: '🔄', name: 'A piece to turn', nameKa: 'გადასაბრუნებელი ნაწილი' }],
  5: [{ key: 'leaf', mark: '🍃', name: 'A piece under a leaf', nameKa: 'ნაწილი ფოთლის ქვეშ' }],
  6: [{ key: 'jigsaw', mark: '🧩', name: 'Jigsaw pieces', nameKa: 'ფაზლის ნაწილები' }],
  7: [{ key: 'bubble', mark: '🫧', name: 'A piece in a bubble', nameKa: 'ნაწილი ბუშტში' }],
  8: [{ key: 'magnet', mark: '🧲', name: 'The magnet', nameKa: 'მაგნიტი' }],
  9: [{ key: 'pair', mark: '🖼️', name: 'Two pictures at once', nameKa: 'ორი სურათი ერთად' }],
  10: [{ key: 'alive', mark: '✨', name: 'A picture that comes to life', nameKa: 'ცოცხალი სურათი' }],
};

// The little label each new thing has beside it the first time it comes in a game, in English and Georgian. Nothing
// new is said out loud.
export const LABELS = {
  golden: ['A golden piece: a star!', 'ოქროს ნაწილი: ვარსკვლავი!'],
  peek: ['Hold your hand here to peek!', 'ხელი აქ გააჩერე და სურათს ნახავ!'],
  turned: ['Hold it, and it turns!', 'გეჭიროს და გასწორდება!'],
  leaf: ['Brush the leaf away!', 'ფოთოლი მოაშორე!'],
  jigsaw: ['Jigsaw pieces!', 'ფაზლის ნაწილები!'],
  bubble: ['Pop the bubble!', 'გახეთქე ბუშტი!'],
  magnet: ['Take the magnet!', 'აიღე მაგნიტი!'],
  pair: ['Two pictures!', 'ორი სურათი!'],
  alive: ['It comes to life!', 'სურათი გაცოცხლდა!'],
};

/** What's new at a level, as [{ key, mark, name, nameKa }]. Nothing at level 1. */
export const puzzleNewAt = (level) => NEWS[clampLevel(level)] ?? [];

/** Whether the part of a level that a piece of news names is on. */
export function newsIsOn(key, level) {
  const plan = puzzleLevel(level);
  return typeof plan[key] === 'number' ? plan[key] > 0 : Boolean(plan[key]);
}

/** The same numbers every time from the same seed, so every friend's game lays out the same puzzle. */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function shuffled(list, random) {
  const out = list.slice();
  for (let at = out.length - 1; at > 0; at -= 1) {
    const other = Math.floor(random() * (at + 1));
    [out[at], out[other]] = [out[other], out[at]];
  }
  return out;
}

/**
 * Where everything is on the table, for so many pictures at once, each cut cols across and rows down: the pictures'
 * frames, how big a piece is, the board at each side and the places on them where loose pieces lie, the peek button
 * on the side of the hand in play, and where Giraffe looks over the top.
 */
export function layoutFor(frameCount = 1, [cols, rows] = CUTS[1], side = 'right') {
  const two = frameCount > 1;
  const size = two ? FRAME_TWO : FRAME_ONE;
  const total = two ? size.width * 2 + size.gap : size.width;
  const left = (TABLE.width - total) / 2;
  const top = FRAME_MIDDLE - size.height / 2;
  const frames = Array.from({ length: two ? 2 : 1 }, (_, index) => ({ x: left + index * (size.width + (size.gap ?? 0)), y: top, width: size.width, height: size.height }));
  const piece = { width: size.width / cols, height: size.height / rows };
  const boardWidth = left - FRAME_EDGE - BOARD.fromFrame - BOARD.margin;
  const boards = [BOARD.margin, TABLE.width - BOARD.margin - boardWidth].map((x) => ({ x, y: BOARD.top, width: boardWidth, height: BOARD.bottom - BOARD.top }));
  // As many places on each board as fit without the pieces touching, and at least enough for every piece.
  const needed = Math.ceil((cols * rows * frames.length) / 2);
  const inside = { width: boardWidth - BOARD.pad * 2, height: BOARD.bottom - BOARD.top - BOARD.pad * 2 };
  const across = Math.max(1, Math.floor((inside.width + SLOT_GAP) / (piece.width + SLOT_GAP)));
  const down = Math.max(Math.ceil(needed / across), Math.floor((inside.height + SLOT_GAP) / (piece.height + SLOT_GAP)));
  const slots = [];
  boards.forEach((board, at) => {
    for (let row = 0; row < down; row += 1) {
      for (let col = 0; col < across; col += 1) {
        slots.push({ board: at, x: board.x + BOARD.pad + (inside.width * (col + 0.5)) / across, y: board.y + BOARD.pad + (inside.height * (row + 0.5)) / down });
      }
    }
  });
  const middle = TABLE.width / 2;
  const hand = side === 'left' ? -1 : 1;
  return {
    frames,
    piece,
    boards,
    slots,
    easel: { x: left - FRAME_EDGE, y: top - FRAME_EDGE, width: total + FRAME_EDGE * 2, height: size.height + FRAME_EDGE * 2 },
    // Under the frame, on the side of the hand in play, with the little film of what to do on the other side.
    peek: { x: middle + hand * 0.2, y: (top + size.height + FRAME_EDGE + TABLE.height) / 2 + 0.005 },
    film: { x: middle - hand * 0.22, y: (top + size.height + FRAME_EDGE + TABLE.height) / 2 + 0.005 },
    giraffe: { x: middle, y: top - FRAME_EDGE },
  };
}

/**
 * Which way each join between two pieces goes: 1 for a knob on the piece to the left, or above, and -1 for a hole
 * there, or all 0 for straight cuts. right[row][col] is the join on the right of that piece, and down[row][col]
 * the one under it.
 */
export function cutEdges(cols, rows, jigsaw, random = Math.random) {
  const way = () => (jigsaw ? (random() < 0.5 ? 1 : -1) : 0);
  return {
    right: Array.from({ length: rows }, () => Array.from({ length: cols - 1 }, way)),
    down: Array.from({ length: rows - 1 }, () => Array.from({ length: cols }, way)),
  };
}

/** A piece's four sides: 1 for a knob, -1 for a hole and 0 for a straight one, as the picture's edges are. */
export function sidesOf(edges, col, row, cols, rows) {
  // A knob on one piece is a hole in the piece it joins, so the piece below, or to the right, has it the other way.
  return {
    top: row > 0 ? 0 - edges.down[row - 1][col] : 0,
    right: col < cols - 1 ? edges.right[row][col] : 0,
    bottom: row < rows - 1 ? edges.down[row][col] : 0,
    left: col > 0 ? 0 - edges.right[row][col - 1] : 0,
  };
}

/** count of the pictures, in an order that's different each game, with any in avoid last, so they don't come round at once. */
export function choosePictures(random, count, avoid = []) {
  const mixed = shuffled(PICTURES, random);
  const order = [...mixed.filter((name) => !avoid.includes(name)), ...mixed.filter((name) => avoid.includes(name))];
  return Array.from({ length: count }, (_, index) => order[index % order.length]);
}

export class Puzzle {
  /**
   * level is the level played, and pieces, snap and reach what a grown-up chose: see PIECE_CHOICES, SNAPS and
   * REACH. side is the hand in play. friends is the plain puzzle friends play, and shared is { claim(k) } when they
   * play it together, with me this child's id among them. seed lays the puzzle out, the same from the same seed,
   * and avoid is pictures to leave till last, as the ones in the game before. onEvent hears what happens: see main.js.
   */
  constructor({ level = 1, pieces = 'usual', snap = 'near', reach = 'little', side = 'right', friends = false, clock = 'ticks', shared = null, me = 'me', seed = null, avoid = [], onEvent = () => {} } = {}) {
    Object.assign(this, { side, shared, me, onEvent });
    this.level = clampLevel(level);
    // Whether the clock gives each picture its time: on their own, unless the gentle puzzle was chosen.
    this.timed = !friends && !shared && clock !== 'gentle';
    this.clock = null; // { left, total }, in seconds, while a picture is being put together.
    this.lost = false;
    this.timeUpFor = 0;
    this.plan = puzzlePlan(level, pieces, { friends });
    this.snapShare = SNAPS[snap] ?? SNAPS.near;
    this.grab = GRAB[reach] ?? GRAB.little;
    this.seed = (seed ?? Math.floor(Math.random() * 2 ** 31)) >>> 0;
    this.time = 0;
    this.top = 0; // The last piece moved lies on top.
    this.held = null;
    this.sure = false; // With friends: the server has said the piece in the hand is this child's.
    this.openAt = -Infinity;
    this.lastGlove = null;
    this.phase = 'play'; // play, mended while a finished picture is looked at, timeup once the clock has run out, or done.
    this.mendedFor = 0;
    this.stats = { placed: 0, pictures: 0, picks: 0, carried: 0, longest: 0, peeks: 0, prizes: { star: 0, gem: 0 } };
    this.carryFor = 0;
    this.tally = new Map(); // With friends, how many pieces each one has put in place, by their id.
    this.mine = new Map(); // With friends: the pieces this child last held, by number, as { k, s }: see report().
    this.rounds = this.lay(avoid);
    this.index = 0;
    this.windClock();
  }

  /** The clock is set for the picture being put together now: see CLOCK. */
  windClock() {
    if (!this.timed) return;
    const at = (this.level - 1) / 9;
    const mix = ([first, last]) => first + (last - first) * at;
    const tricky = this.pieces.filter((piece) => piece.angle !== 0 || piece.leaf || piece.floating).length;
    const total = mix(CLOCK.base) + this.pieces.length * mix(CLOCK.each) + tricky * CLOCK.extra;
    this.clock = { left: total, total };
  }

  /** Every picture of the game, cut and scattered, from the seed. */
  lay(avoid) {
    const { plan, side } = this;
    const random = seededRandom(this.seed);
    const names = choosePictures(random, plan.rounds * plan.frames, avoid);
    const layout = layoutFor(plan.frames, [plan.cols, plan.rows], side);
    const rounds = [];
    for (let index = 0; index < plan.rounds; index += 1) {
      const pieces = [];
      const pictures = [];
      layout.frames.forEach((frame, at) => {
        const edges = cutEdges(plan.cols, plan.rows, plan.jigsaw, random);
        pictures.push({ name: names[index * plan.frames + at], frame, edges });
        for (let row = 0; row < plan.rows; row += 1) {
          for (let col = 0; col < plan.cols; col += 1) {
            pieces.push({
              id: index * 50 + pieces.length,
              round: index,
              frame: at,
              col,
              row,
              sides: sidesOf(edges, col, row, plan.cols, plan.rows),
              home: { x: frame.x + (col + 0.5) * layout.piece.width, y: frame.y + (row + 0.5) * layout.piece.height },
              x: 0,
              y: 0,
              tilt: 0, // A little, as it lies on the board, in degrees.
              angle: 0, // How far it is from the right way up, in degrees: a piece the wrong way up starts at 90 or 180.
              state: 'loose', // loose, held or placed.
              holder: null,
              z: 0,
              golden: false,
              leaf: null,
              floating: null,
              carried: 0,
              hint: 0,
              by: null,
              // With friends: the newest grab of it anyone has been given, whose that was, the grab this game
              // would ask for next, and the one it's waiting to hear about.
              last: -1,
              owner: null,
              next: 0,
              asked: null,
              heldSince: 0,
            });
          }
        }
      });
      // Each piece on a place of its own on the boards, a little askew, as many on one board as on the other, so
      // there's as much to reach for on each side.
      const places = shuffled(layout.slots, random);
      const first = random() < 0.5 ? 0 : 1;
      shuffled(pieces, random).forEach((piece, at) => {
        const wanted = (first + at) % 2;
        const found = places.findIndex((each) => each.board === wanted);
        const [place] = places.splice(found < 0 ? 0 : found, 1);
        piece.x = place.x + (random() - 0.5) * 0.012;
        piece.y = place.y + (random() - 0.5) * 0.012;
        piece.tilt = (random() - 0.5) * 9;
        piece.z = at;
      });
      // What the level brings, each on a piece of its own, the newest first, for as long as there are pieces.
      const free = shuffled(pieces, random);
      const take = (fits = () => true) => {
        const at = free.findIndex(fits);
        return at < 0 ? null : free.splice(at, 1)[0];
      };
      // Whatever floats in a bubble starts up beside Giraffe, one each side of him, and sets off down across the table.
      const hand = side === 'left' ? -1 : 1;
      const setOff = () => {
        const way = (0.2 + random() * 0.6) * Math.PI;
        return { vx: Math.cos(way) * EXTRAS.drift, vy: Math.sin(way) * EXTRAS.drift };
      };
      if (plan.bubble) {
        const piece = take();
        if (piece) {
          piece.floating = setOff();
          piece.x = TABLE.width / 2 + hand * 0.3;
          piece.y = 0.16;
          piece.tilt = 0;
        }
      }
      if (plan.leaf) {
        const piece = take();
        if (piece) piece.leaf = { brushed: 0 };
      }
      for (let n = 0; n < plan.turned; n += 1) {
        const piece = take();
        if (piece) piece.angle = n % 2 ? 180 : random() < 0.5 ? 90 : -90;
      }
      if (plan.golden) {
        for (let at = 0; at < layout.frames.length; at += 1) {
          const piece = take((each) => each.frame === at);
          if (piece) piece.golden = true;
        }
      }
      rounds.push({
        index,
        layout,
        pictures,
        pieces,
        peek: plan.peek ? { ...layout.peek, hold: 0, showing: 0 } : null,
        magnet: plan.magnet ? { x: TABLE.width / 2 - hand * 0.3, y: 0.13, ...setOff(), state: 'waiting', left: EXTRAS.magnetSeconds } : null,
        alive: false,
      });
    }
    return rounds;
  }

  /** The picture, or pictures, being put together now. */
  get round() {
    return this.rounds[this.index];
  }

  get pieces() {
    return this.round.pieces;
  }

  get layout() {
    return this.round.layout;
  }

  get done() {
    return this.phase === 'done';
  }

  /** Every piece of the game, placed or not, in every picture. */
  get total() {
    return this.plan.total;
  }

  piece(id) {
    return this.rounds[Math.floor(id / 50)]?.pieces.find((each) => each.id === id) ?? null;
  }

  /** How near its place a piece has to come to snap in, in table units: further with the magnet on. */
  snapRadius() {
    const { width, height } = this.layout.piece;
    const magnet = this.magnetOn ? EXTRAS.magnetSnap : 1;
    return Math.min(width, height) * this.snapShare * magnet;
  }

  get magnetOn() {
    const magnet = this.round?.magnet;
    return Boolean(magnet && magnet.state === 'on');
  }

  /** Puts a piece's middle at (x, y), or as near as keeps all of it on the table, so none of it is ever out of sight. */
  keepIn(piece, x, y) {
    const { width, height } = this.layout.piece;
    piece.x = clamp(x, width / 2 + EDGE, TABLE.width - width / 2 - EDGE);
    piece.y = clamp(y, height / 2 + EDGE, TABLE.height - height / 2 - EDGE);
  }

  /** How far a piece's middle is from somewhere, in table units. */
  gap(piece, at) {
    return Math.hypot(piece.x - at.x, piece.y - at.y);
  }

  /** Whether the middle of the glove is over a piece, or within the reach that reach help gives round it. */
  over(piece, glove, extra = 0) {
    const { width, height } = this.layout.piece;
    // A piece lying on its side is as wide as it's tall the right way up.
    const sideways = Math.abs(Math.abs(piece.angle) - 90) < 45;
    const [wide, tall] = sideways ? [height, width] : [width, height];
    return Math.abs(glove.x - piece.x) <= wide / 2 + this.grab + extra && Math.abs(glove.y - piece.y) <= tall / 2 + this.grab + extra;
  }

  /** The bubble round a floating piece, as far as the glove has to come to pop it. */
  bubbleRadius() {
    const { width, height } = this.layout.piece;
    return Math.max(width, height) * EXTRAS.bubble;
  }

  /**
   * The loose piece an open hand at the glove would pick up: the nearest it's over, or one floating in a bubble it
   * touches, and with the magnet on, the nearest one in the magnet's range. Never one under a leaf, or in a
   * friend's hand.
   */
  pieceUnder(glove) {
    let best = null;
    let bestGap = Infinity;
    for (const piece of this.pieces) {
      if (piece.state !== 'loose' || piece.leaf) continue;
      const gap = this.gap(piece, glove);
      const reached = piece.floating ? gap <= this.bubbleRadius() + this.grab : this.over(piece, glove) || (this.magnetOn && gap <= EXTRAS.magnetRange);
      if (reached && gap < bestGap) {
        best = piece;
        bestGap = gap;
      }
    }
    return best;
  }

  /**
   * One frame of play. glove is where the middle of the glove is on the table, or null when the hand can't be
   * seen, and open whether the hand is open. Anything else is a hand that's resting, which costs nothing.
   */
  update(dt, { glove = null, open = false } = {}) {
    this.time += dt;
    if (this.shared) this.askAgain();
    if (this.phase === 'done') return;
    if (this.phase === 'timeup') {
      // The clock has run out: a moment for it to be seen, and the game is over.
      this.timeUpFor += dt;
      if (this.timeUpFor >= CLOCK.timeUpSeconds) {
        this.phase = 'done';
        this.onEvent({ type: 'done' });
      }
      return;
    }
    if (this.phase === 'mended') {
      this.mendedFor += dt;
      if (this.mendedFor >= (this.index === this.rounds.length - 1 ? PARTY_SECONDS : MENDED_SECONDS)) this.nextRound();
      this.lastGlove = glove;
      return;
    }
    const hand = Boolean(glove && open);
    if (hand) this.openAt = this.time;
    const moved = glove && this.lastGlove ? Math.hypot(glove.x - this.lastGlove.x, glove.y - this.lastGlove.y) : 0;
    this.lastGlove = glove ? { x: glove.x, y: glove.y } : null;
    this.float(dt);
    this.updatePeek(dt, hand ? glove : null);
    this.updateMagnet(dt, glove, hand);
    if (hand) this.brush(glove, moved, dt);

    if (this.held) {
      // A hand that was open a moment ago keeps its piece: a moment's flicker in the tracker shouldn't drop it.
      if (!glove || this.time - this.openAt > GRACE) this.drop();
      else this.carry(dt, glove, hand);
    } else if (hand) {
      const piece = this.pieceUnder(glove);
      if (piece) this.pick(piece);
    }
    if (!this.held) this.carryFor = 0;
    for (const piece of this.pieces) {
      const lit = piece.state === 'held' && piece.holder === this.me && piece.carried >= HINT_AFTER;
      piece.hint = clamp(piece.hint + (lit ? dt : -dt) * HINT_RATE, 0, 1);
    }
    if (this.phase === 'play') this.tick(dt, glove);
  }

  /** The clock goes round while the hand is in the picture, open or not, and running out ends the game. */
  tick(dt, glove) {
    const { clock } = this;
    if (!clock || !glove) return;
    clock.left = Math.max(0, clock.left - dt);
    if (clock.left > 0) return;
    this.drop();
    this.phase = 'timeup';
    this.timeUpFor = 0;
    this.lost = true;
    this.onEvent({ type: 'timeup', round: this.round });
  }

  /** The piece in the hand goes with it, turns the right way up if it wasn't, and snaps in once it's near its place. */
  carry(dt, glove, hand) {
    const piece = this.held;
    const blend = 1 - Math.exp(-dt * FOLLOW_RATE);
    this.keepIn(piece, piece.x + (glove.x - piece.x) * blend, piece.y + (glove.y - piece.y) * blend);
    if (!hand) return;
    piece.carried += dt;
    this.carryFor += dt;
    this.stats.carried += dt;
    this.stats.longest = Math.max(this.stats.longest, this.carryFor);
    if (piece.angle !== 0) {
      const step = EXTRAS.turnRate * dt;
      piece.angle = Math.abs(piece.angle) <= step ? 0 : piece.angle - Math.sign(piece.angle) * step;
      if (piece.angle === 0) this.onEvent({ type: 'turned', piece });
    }
    // With friends, only once the server has said the piece is this child's.
    if (piece.angle === 0 && this.gap(piece, piece.home) <= this.snapRadius() && (!this.shared || this.sure)) this.place(piece, this.me);
  }

  pick(piece) {
    piece.state = 'held';
    piece.holder = this.me;
    piece.tilt = 0;
    this.top += 1;
    piece.z = this.top;
    this.held = piece;
    this.sure = false;
    this.stats.picks += 1;
    if (piece.floating) {
      piece.floating = null;
      this.onEvent({ type: 'pop', piece });
    }
    if (this.shared) {
      piece.asked = { k: piece.id * GRABS + piece.next, at: this.time };
      this.shared.claim(piece.asked.k);
    }
    this.onEvent({ type: 'pick', piece });
  }

  /** The hand has closed, or gone: the piece waits where it is. */
  drop() {
    const piece = this.held;
    if (!piece) return;
    this.held = null;
    piece.state = 'loose';
    piece.holder = null;
    // With friends, once it's this child's, everyone is told where it lies: see report().
    if (this.shared && this.sure) this.mine.set(piece.id, { k: piece.id * GRABS + piece.last, s: 0 });
    this.sure = false;
    this.onEvent({ type: 'drop', piece });
  }

  /** A piece goes into its place, for good. by is whose hand put it there. */
  place(piece, by = this.me) {
    if (piece.state === 'placed') return;
    if (this.held === piece) {
      this.held = null;
      this.sure = false;
    }
    // With friends, everyone is told it's in, for good: see report().
    if (this.shared && by === this.me) this.mine.set(piece.id, { k: piece.id * GRABS + Math.max(0, piece.last), s: 1 });
    // Where it was, for the screen to slide it the last little way in.
    const from = { x: piece.x, y: piece.y };
    piece.state = 'placed';
    piece.holder = null;
    piece.by = by;
    piece.x = piece.home.x;
    piece.y = piece.home.y;
    piece.angle = 0;
    piece.tilt = 0;
    piece.hint = 0;
    piece.floating = null;
    piece.leaf = null;
    piece.asked = null;
    this.tally.set(by, (this.tally.get(by) ?? 0) + 1);
    if (by === this.me) this.stats.placed += 1;
    this.onEvent({ type: 'placed', piece, by, mine: by === this.me, from });
    if (piece.golden && by === this.me) this.prize('star', piece.home);
    if (piece.round === this.index && this.phase === 'play' && this.pieces.every((each) => each.state === 'placed')) this.mend();
  }

  /** Every piece of the picture is in: it's whole again, and looked at for a moment. */
  mend() {
    const { round } = this;
    this.phase = 'mended';
    this.mendedFor = 0;
    this.held = null;
    this.stats.pictures += round.pictures.length;
    if (round.magnet) round.magnet.state = 'done';
    if (round.peek) round.peek.showing = 0;
    this.onEvent({ type: 'mended', round, last: this.index === this.rounds.length - 1 });
    if (this.plan.alive) {
      round.alive = true;
      this.onEvent({ type: 'alive', round });
      for (const { frame } of round.pictures) this.prize('gem', { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 });
    }
  }

  nextRound() {
    if (this.index >= this.rounds.length - 1) {
      this.phase = 'done';
      this.onEvent({ type: 'done' });
      return;
    }
    this.index += 1;
    this.phase = 'play';
    this.held = null;
    this.windClock();
    this.onEvent({ type: 'round', round: this.round });
    // With friends, a piece of the next picture a friend put in while this one was still being looked at.
    if (this.pieces.every((each) => each.state === 'placed')) this.mend();
  }

  prize(kind, at) {
    this.stats.prizes[kind] += 1;
    this.onEvent({ type: 'prize', kind, at: { x: at.x, y: at.y } });
  }

  /* ---------- what the levels bring ---------- */

  /** A piece in a bubble, and the magnet in its own, float slowly about the table, and turn back at its edges. */
  float(dt) {
    const drift = (thing, speed) => {
      thing.x += speed.vx * dt;
      thing.y += speed.vy * dt;
      if ((thing.x < 0.22 && speed.vx < 0) || (thing.x > TABLE.width - 0.22 && speed.vx > 0)) speed.vx = -speed.vx;
      if ((thing.y < 0.14 && speed.vy < 0) || (thing.y > 0.86 && speed.vy > 0)) speed.vy = -speed.vy;
    };
    for (const piece of this.pieces) if (piece.floating && piece.state === 'loose') drift(piece, piece.floating);
    const { magnet } = this.round;
    if (magnet?.state === 'waiting') drift(magnet, magnet);
  }

  /** The peek button: an open hand held on it shows the finished picture for a few seconds, as often as it's wanted. */
  updatePeek(dt, glove) {
    const { peek } = this.round;
    if (!peek) return;
    peek.showing = Math.max(0, peek.showing - dt);
    const on = glove && Math.hypot(glove.x - peek.x, glove.y - peek.y) <= EXTRAS.peekReach;
    peek.hold = on ? peek.hold + dt : Math.max(0, peek.hold - dt * 2);
    if (on && peek.hold >= EXTRAS.peekHold && peek.showing < EXTRAS.peekSeconds - 1) {
      if (peek.showing === 0) {
        this.stats.peeks += 1;
        this.onEvent({ type: 'peek', peek });
      }
      peek.showing = EXTRAS.peekSeconds;
    }
  }

  /** The magnet: the glove coming to its bubble takes it, and it runs down only while the hand is open. */
  updateMagnet(dt, glove, hand) {
    const { magnet } = this.round;
    if (!magnet) return;
    if (magnet.state === 'waiting' && glove && Math.hypot(glove.x - magnet.x, glove.y - magnet.y) <= EXTRAS.magnetTouch) {
      magnet.state = 'on';
      this.onEvent({ type: 'magnet', magnet });
    } else if (magnet.state === 'on' && hand) {
      magnet.left = Math.max(0, magnet.left - dt);
      if (magnet.left === 0) {
        magnet.state = 'done';
        this.onEvent({ type: 'magnet-done', magnet });
      }
    }
  }

  /** An open hand moving over a leaf brushes it away, and one held still on it does too, more slowly. */
  brush(glove, moved, dt) {
    for (const piece of this.pieces) {
      if (!piece.leaf || piece.state !== 'loose' || !this.over(piece, glove, 0.02)) continue;
      piece.leaf.brushed += moved / EXTRAS.brushDistance + dt / EXTRAS.brushHold;
      if (piece.leaf.brushed >= 1) {
        piece.leaf = null;
        this.onEvent({ type: 'leaf-off', piece });
      }
    }
  }

  /* ---------- with friends, together ---------- */

  /**
   * The server says whose claim k is: the first to ask for that grab of that piece. The newest grab of a piece is
   * the one that counts, on every computer. If it's this child's, the piece in the hand is theirs for sure, and if
   * it's a friend's, it's in their hand, and comes out of this one.
   */
  claimed(k, by) {
    const piece = this.piece(Math.floor(k / GRABS));
    if (!piece || !Number.isInteger(k)) return;
    const grab = k % GRABS;
    if (piece.asked?.k === k) piece.asked = null;
    if (piece.state === 'placed') return;
    if (grab <= piece.last) {
      // An older grab than the newest known: if this hand was waiting to hear about it, it didn't get it.
      if (this.held === piece && !piece.asked && !this.sure) this.letGo(piece);
      return;
    }
    piece.last = grab;
    piece.owner = by;
    piece.next = Math.max(piece.next, grab + 1);
    if (by === this.me) {
      if (this.held === piece) {
        this.sure = true;
        this.mine.delete(piece.id);
      } else {
        // Given to this child after their hand had let go of it: it lies where it is, and everyone is told so.
        piece.state = 'loose';
        piece.holder = null;
        this.mine.set(piece.id, { k, s: 0 });
      }
      return;
    }
    this.mine.delete(piece.id);
    if (this.held === piece) this.letGo(piece);
    piece.state = 'held';
    piece.holder = by;
    piece.heldSince = this.time;
    piece.tilt = 0;
    this.top += 1;
    piece.z = this.top;
  }

  /** The piece comes out of this child's hand without a word, as a friend has it. */
  letGo(piece) {
    this.held = null;
    this.sure = false;
    piece.asked = null;
    if (piece.holder === this.me) {
      piece.state = 'loose';
      piece.holder = null;
    }
  }

  /** A claim with no answer for a while is given up, and the piece put down, to be picked up again as a new grab. */
  askAgain() {
    for (const round of this.rounds) {
      for (const piece of round.pieces) {
        if (!piece.asked || this.time - piece.asked.at < ASK_AGAIN_SECONDS) continue;
        piece.next = Math.max(piece.next, (piece.asked.k % GRABS) + 1);
        piece.asked = null;
        if (this.held === piece && !this.sure) this.letGo(piece);
      }
    }
  }

  /**
   * What this game tells its friends, about 10 times a second: h, the claim of the piece in this child's hand, or
   * -1, and d, each piece this child was the last to hold, as [claim, x, y, angle, placed], where it lies now.
   * Saying it over and over means a friend who missed it once still hears.
   */
  report() {
    const d = [];
    for (const [id, { k, s }] of this.mine) {
      const piece = this.piece(id);
      if (piece) d.push([k, Math.round(piece.x * 1000) / 1000, Math.round(piece.y * 1000) / 1000, Math.round(piece.angle), s]);
    }
    const held = this.held && this.sure ? this.held.id * GRABS + this.held.last : -1;
    return { h: held, d, n: this.tally.get(this.me) ?? 0 };
  }

  /** What a friend's game says: the piece in their hand, and where the pieces they last held lie. */
  heard(from, { h = -1, d = [] } = {}) {
    if (!this.shared || from === this.me) return;
    const said = new Set();
    for (const entry of Array.isArray(d) ? d : []) {
      if (!Array.isArray(entry)) continue;
      const [k, x, y, angle, placed] = entry;
      const piece = this.piece(Math.floor(k / GRABS));
      if (!piece || !Number.isInteger(k) || piece.state === 'placed') continue;
      if (placed) {
        this.place(piece, from);
        continue;
      }
      const grab = k % GRABS;
      const newer = grab > piece.last;
      // Only the newest grab of a piece says where it is: anything older has been picked up since.
      if (!newer && !(grab === piece.last && piece.owner === from)) continue;
      if (newer) this.takenBy(piece, grab, from);
      said.add(piece.id);
      if (piece.state === 'held' && piece.holder !== from) continue;
      piece.state = 'loose';
      piece.holder = null;
      this.keepIn(piece, Number(x) || 0, Number(y) || 0);
      piece.angle = Number(angle) || 0;
    }
    const inHand = Number.isInteger(h) && h >= 0 ? this.piece(Math.floor(h / GRABS)) : null;
    if (inHand && inHand.state !== 'placed') {
      const grab = h % GRABS;
      if (grab > inHand.last) this.takenBy(inHand, grab, from);
      if (grab === inHand.last && inHand.owner === from) {
        inHand.state = 'held';
        inHand.holder = from;
        said.add(inHand.id);
      }
    }
    // A piece this game has in the friend's hand, which the friend's own game says nothing of: put down where it is.
    for (const round of this.rounds) {
      for (const piece of round.pieces) {
        if (piece.state !== 'held' || piece.holder !== from || said.has(piece.id)) continue;
        if (this.time - piece.heldSince > LET_GO_SECONDS) {
          piece.state = 'loose';
          piece.holder = null;
        }
      }
    }
  }

  /** A grab of a piece this game hadn't heard of, from what its holder says. */
  takenBy(piece, grab, by) {
    piece.last = grab;
    piece.owner = by;
    piece.next = Math.max(piece.next, grab + 1);
    piece.heldSince = this.time;
    this.mine.delete(piece.id);
    if (this.held === piece) this.letGo(piece);
  }

  /** A piece in a friend's hand goes where their glove is, on every computer. at is null when it can't be seen. */
  friendAt(id, at, dt) {
    if (!at) return;
    const blend = 1 - Math.exp(-dt * FOLLOW_RATE);
    for (const piece of this.pieces) {
      if (piece.state !== 'held' || piece.holder !== id) continue;
      this.keepIn(piece, piece.x + (at.x - piece.x) * blend, piece.y + (at.y - piece.y) * blend);
    }
  }

  /** A friend has gone: whatever was in their hand lies where it was. What they put in place stays in place. */
  friendGone(id) {
    for (const round of this.rounds) {
      for (const piece of round.pieces) {
        if (piece.state === 'held' && piece.holder === id) {
          piece.state = 'loose';
          piece.holder = null;
        }
      }
    }
  }

  /* ---------- for the tests and the films ---------- */

  /**
   * Where a child would take their hand next, as the tests and the films do: to its place with the piece they
   * hold, or to the nearest loose piece, or the leaf to brush away. from is where the hand is now.
   */
  wants(from = { x: TABLE.width / 2, y: 0.5 }) {
    if (this.phase !== 'play') return null;
    if (this.held) return { x: this.held.home.x, y: this.held.home.y, why: 'place', piece: this.held };
    let best = null;
    let bestGap = Infinity;
    for (const piece of this.pieces) {
      if (piece.state !== 'loose') continue;
      const gap = this.gap(piece, from);
      if (gap < bestGap) {
        best = piece;
        bestGap = gap;
      }
    }
    return best ? { x: best.x, y: best.y, why: best.leaf ? 'brush' : 'pick', piece: best } : null;
  }
}
