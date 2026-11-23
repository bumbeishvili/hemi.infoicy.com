// Giraffe's Riddle Doors: a row of doors, each with a riddle on it, a square of pictures with one missing, and Giraffe
// peeking over the top. The pieces to choose from lie on a shelf at each side. An open hand over a piece picks it up,
// and it goes with the hand for as long as it stays open. Held in the gap for a moment, it's tried there: the piece
// that fits goes in and the door opens, and one that doesn't goes back to its shelf, greyed, and can't be tried again.
// A hand that closes, or can't be seen, just leaves the piece where it is: nothing has to be gripped. Reaching out to
// the shelves at both sides with an open hand, and keeping it open across to the door, is what's practised, and
// working out which piece fits is the riddle.
//
// The rules are here, with no screen, so they run in the unit tests. main.js says where the glove is and whether the
// hand is open, and view.js draws what this says. Places are in table units: the table is TABLE.width wide and 1 high,
// x across from the left and y down from the top, the same on every screen. riddles.js makes the riddles.
//
// On their own, as it comes, three candles light the doors, and each piece that doesn't fit blows one out: with all of
// them out it's too dark to go on, and the game is lost. A grown-up can choose five candles, or the gentle game, where
// they never go out. There's no clock: a riddle takes as long as it takes.
//
// With friends, together, everyone has the same door, each on their own computer, as in Giraffe's Puzzles: a hand that
// comes to a loose piece claims it, and the server says whose each claim is, the first having it. A piece one tries
// that doesn't fit is claimed as tried, so it's greyed on every computer. Against each other, each has their own copy
// of the same doors, and only how many they've opened goes to the others.
import { clampLevel, stepsAt } from '../../core/levels.js';
import { KINDS, makeRiddle, seededRandom, shuffled } from './riddles.js';

export const TABLE = { width: 2, height: 1 };
export const DOORS = 6; // Doors in a game, at every level.
// How near the gap a piece has to be held, as a share of a piece's side: generous unless a grown-up chooses otherwise.
export const SNAPS = { near: 0.6, closer: 0.4, exact: 0.22 };
// Reach help: how much further the glove goes than the hand, so a smaller movement crosses the whole table, and how
// far outside a piece the middle of the glove can be and still pick it up, in table units.
export const REACH = { none: 1, little: 1.25, lots: 1.6 };
const GRAB = { none: 0.012, little: 0.03, lots: 0.06 };
// The candles, as a grown-up chooses: three (the default), five, or the gentle game, where they never go out.
export const CANDLES = { three: 3, five: 5, gentle: 0 };

// Where things are. A riddle's square of pictures is on the door, a little above the middle of the table, and the
// door goes down to the floor, with its arch over the top. Sizes are in table units.
const CELL = { 2: 0.2, 3: 0.17 }; // A picture in the riddle, and a piece, which is the same size, for each size of riddle.
const CELL_GAP = 0.016;
const BOARD_PAD = 0.03; // The paper round the pictures.
const BOARD_MIDDLE = 0.53;
const DOOR = { side: 0.065, above: 0.045, arch: 0.05, floor: 0.965 };
// The shelf at each side, where the pieces lie: how far in from the table's edges and from the door, and from its own edges.
const SHELF = { margin: 0.025, top: 0.07, bottom: 0.93, fromDoor: 0.03, pad: 0.02 };
const SLOTS = { across: 2, down: 3 };
const EDGE = 0.012; // How near the table's edge a piece can come: all of it stays on the table.

const FOLLOW_RATE = 14; // How tightly a piece follows the hand that has it.
// A hand that was open a moment ago still has its piece for this long, as the tracker can read an open hand as closed
// for a few frames while it moves. A piece is only tried in the gap while the hand really is open.
export const GRACE = 0.25;
// An open hand passing over a piece on its way to another doesn't pick it up: only one that settles on a piece, going
// slower than this, in table units a second, for this long, with a ring filling round the piece. Here, unlike in
// Giraffe's Puzzles, which piece is in the hand matters.
export const PICK_SECONDS = 0.3;
export const SETTLE_SPEED = 0.45;
// The glove's speed is judged from where it is smoothed this much, so a hand that shakes, as a child's can, still
// settles on a piece, and then smoothed again.
const STEADY_RATE = 5;
const SPEED_RATE = 10;
export const TRY_SECONDS = 0.6; // How long a piece is held in the gap before it's tried there, with a ring filling round it.
const TRY_FADE_RATE = 3; // How quickly that ring empties again, as the piece goes out of the gap.
export const LOOK_AFTER = 20; // Seconds on a door without it opening before the row with the gap is lit, so nobody is stuck.
const LOOK_RATE = 0.8;
export const OPEN_SECONDS = 2.2; // An opened door is looked through this long before the next one.
export const PARTY_SECONDS = 2.6; // And the last one, before the finish card.
export const DARK_SECONDS = 2.4; // With the last candle out, how long that's seen before the finish card.

// With friends: a claim with no answer for this long is given up, as the connection may have lost it, and a piece a
// friend is said to hold, when their own game says it doesn't, is put down where it is after this long.
const ASK_AGAIN_SECONDS = 1.5;
const LET_GO_SECONDS = 1.2;
export const GRABS = 1000; // A claim is a piece's number times this, plus which grab of it this is.
export const TRIED = 500_000; // And a piece tried in the gap that didn't fit is claimed as this plus its number.
const PER_DOOR = 50; // A piece's number is its door's times this, plus which piece of that door it is.

/** What changes from level 1 to 10: each level from 2 brings a new kind of riddle, and later more pieces to choose from. */
export function doorLevel(level) {
  const at = clampLevel(level);
  return {
    // The kinds of riddle there are at this level: the newest five, so the doors keep up with the level.
    kinds: KINDS.slice(Math.max(0, at - 5), at),
    newest: KINDS[at - 1],
    // How many pieces there are to choose from on each door.
    choices: stepsAt(at, { 1: 3, 2: 4, 6: 5, 9: 6 }),
  };
}

// What each level brings that's new, for the title card, the countdown and the finish card: the kind of riddle.
export const NEWS = {
  2: [{ key: 'two', mark: '🔀', name: 'Two things change', nameKa: 'ორი რამ იცვლება' }],
  3: [{ key: 'count', mark: '🔢', name: 'Counting', nameKa: 'თვლა' }],
  4: [{ key: 'grow', mark: '📏', name: 'Bigger and smaller', nameKa: 'დიდი და პატარა' }],
  5: [{ key: 'turn', mark: '🔄', name: 'Turning arrows', nameKa: 'მბრუნავი ისრები' }],
  6: [{ key: 'once', mark: '🎲', name: 'Each one once in a row', nameKa: 'თითოეული ერთხელ რიგში' }],
  7: [{ key: 'add', mark: '➕', name: 'Putting together', nameKa: 'შეერთება' }],
  8: [{ key: 'take', mark: '➖', name: 'Taking away', nameKa: 'გამოკლება' }],
  9: [{ key: 'double', mark: '✌️', name: 'Two rules at once', nameKa: 'ორი წესი ერთად' }],
  10: [{ key: 'inside', mark: '🪆', name: 'Inside and outside', nameKa: 'შიგნით და გარეთ' }],
};

// The little label beside a riddle the first time its kind comes in a game, in English and Georgian. Nothing new is
// said out loud.
export const LABELS = {
  two: ['New: two things change!', 'ახალი: ორი რამ იცვლება!'],
  count: ['New: counting!', 'ახალი: თვლა!'],
  grow: ['New: bigger and smaller!', 'ახალი: დიდი და პატარა!'],
  turn: ['New: turning arrows!', 'ახალი: მბრუნავი ისრები!'],
  once: ['New: each one once in a row!', 'ახალი: თითოეული ერთხელ რიგში!'],
  add: ['New: putting together!', 'ახალი: შეერთება!'],
  take: ['New: taking away!', 'ახალი: გამოკლება!'],
  double: ['New: two rules at once!', 'ახალი: ორი წესი ერთად!'],
  inside: ['New: inside and outside!', 'ახალი: შიგნით და გარეთ!'],
};

/** What's new at a level, as [{ key, mark, name, nameKa }]. Nothing at level 1. */
export const doorNewAt = (level) => NEWS[clampLevel(level)] ?? [];

/** Whether the kind of riddle a piece of news names comes at a level. */
export const newsIsOn = (key, level) => doorLevel(level).kinds.includes(key);

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/**
 * The kind of riddle on each door of a game: the newest kind first and again half way, and the doors between of the
 * level's other kinds, mixed, never the same twice running.
 */
export function planDoors(level, random, count = DOORS) {
  const { kinds, newest } = doorLevel(level);
  const plan = [];
  for (let at = 0; at < count; at += 1) {
    if (at === 0 || at === Math.floor(count / 2)) {
      plan.push(newest);
      continue;
    }
    // At level 2 there's only one older kind, the easiest, so the newest comes between it too.
    const older = kinds.length > 2 ? kinds.filter((kind) => kind !== newest) : kinds;
    const fresh = older.filter((kind) => kind !== plan[at - 1]);
    const from = fresh.length ? fresh : older.length ? older : kinds;
    plan.push(from[Math.floor(random() * from.length)]);
  }
  return plan;
}

/**
 * Where everything is on the table for a riddle size by size with so many pieces: the paper with the pictures, each
 * picture's place, the gap, the door round them, the shelf at each side and the places on them where pieces lie, the
 * little film of what to do on the door under the riddle, away from the hand in play, and where Giraffe peeks over.
 */
export function layoutFor(size = 3, side = 'right') {
  const cell = CELL[size] ?? CELL[3];
  const across = size * cell + (size - 1) * CELL_GAP + BOARD_PAD * 2;
  const board = { x: (TABLE.width - across) / 2, y: BOARD_MIDDLE - across / 2, width: across, height: across };
  const places = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      places.push({ x: board.x + BOARD_PAD + col * (cell + CELL_GAP) + cell / 2, y: board.y + BOARD_PAD + row * (cell + CELL_GAP) + cell / 2 });
    }
  }
  const hole = places[places.length - 1];
  const door = { x: board.x - DOOR.side, y: board.y - DOOR.above, width: across + DOOR.side * 2, arch: DOOR.arch };
  door.height = DOOR.floor - door.y;
  const shelfWidth = door.x - SHELF.fromDoor - SHELF.margin;
  const shelves = [SHELF.margin, TABLE.width - SHELF.margin - shelfWidth].map((x) => ({ x, y: SHELF.top, width: shelfWidth, height: SHELF.bottom - SHELF.top }));
  const inside = { width: shelfWidth - SHELF.pad * 2, height: SHELF.bottom - SHELF.top - SHELF.pad * 2 };
  const slots = [];
  shelves.forEach((shelf, at) => {
    for (let row = 0; row < SLOTS.down; row += 1) {
      for (let col = 0; col < SLOTS.across; col += 1) {
        slots.push({ shelf: at, x: shelf.x + SHELF.pad + (inside.width * (col + 0.5)) / SLOTS.across, y: shelf.y + SHELF.pad + (inside.height * (row + 0.5)) / SLOTS.down });
      }
    }
  });
  const hand = side === 'left' ? -1 : 1;
  const under = board.y + board.height;
  return {
    size,
    cell,
    board,
    places,
    hole,
    door,
    shelves,
    slots,
    // The row with the gap in it, lit when someone has been on a door a while.
    row: { x: board.x + BOARD_PAD * 0.4, y: hole.y - cell / 2 - BOARD_PAD * 0.4, width: across - BOARD_PAD * 0.8, height: cell + BOARD_PAD * 0.8 },
    film: { x: TABLE.width / 2 - hand * across * 0.27, y: under, bottom: DOOR.floor },
    giraffe: { x: TABLE.width / 2, y: door.y - door.arch },
  };
}

export class Doors {
  /**
   * level is the level played, and snap, reach and candles what a grown-up chose: see SNAPS, REACH and CANDLES. side
   * is the hand in play. friends is the plain game friends play, and shared is { claim(k) } when they play it
   * together, with me this child's id among them. seed makes the riddles, the same from the same seed. onEvent hears
   * what happens: see main.js.
   */
  constructor({ level = 1, snap = 'near', reach = 'little', side = 'right', friends = false, candles = 'three', shared = null, me = 'me', seed = null, onEvent = () => {} } = {}) {
    Object.assign(this, { side, shared, me, onEvent });
    this.level = clampLevel(level);
    this.plan = doorLevel(this.level);
    this.snapShare = SNAPS[snap] ?? SNAPS.near;
    this.grab = GRAB[reach] ?? GRAB.little;
    // The candles: on their own, unless the gentle game was chosen. With friends nobody can lose.
    const lit = friends || shared ? 0 : CANDLES[candles] ?? CANDLES.three;
    this.candles = lit ? { left: lit, total: lit } : null;
    this.lost = false;
    this.seed = (seed ?? Math.floor(Math.random() * 2 ** 31)) >>> 0;
    this.time = 0;
    this.top = 0; // The last piece moved lies on top.
    this.held = null;
    this.sure = false; // With friends: the server has said the piece in the hand is this child's.
    this.openAt = -Infinity;
    this.trying = 0; // How long the piece in the hand has been held in the gap.
    this.hover = { tile: null, for: 0 }; // The piece an open hand is settling on, and for how long.
    this.steady = null; // Where the glove is, smoothed: see STEADY_RATE.
    this.speed = 0; // How fast the glove is going, in table units a second, smoothed.
    // A new door's pieces fade in under a hand that may be resting on one: none is picked up until the glove has been
    // off them.
    this.fresh = true;
    this.phase = 'play'; // play, open while an opened door is looked through, dark once the last candle is out, or done.
    this.phaseFor = 0;
    this.stats = { opened: 0, firstTry: 0, wrong: 0, picks: 0, carried: 0, longest: 0, prizes: { star: 0 } };
    this.carryFor = 0;
    this.tally = new Map(); // With friends, how many doors each one has opened, by their id.
    this.mine = new Map(); // With friends: the pieces this child last held, by number, as { k, s }: see report().
    this.doors = this.lay();
    this.index = 0;
  }

  /** Every door of the game, its riddle and its pieces, from the seed. */
  lay() {
    const random = seededRandom(this.seed);
    const kinds = planDoors(this.level, random);
    return kinds.map((kind, index) => {
      const riddle = makeRiddle(kind, random, { choices: this.plan.choices, level: this.level });
      const layout = layoutFor(riddle.size, this.side);
      // Each piece on a place of its own on the shelves, a little askew, as many on one as on the other, so there's
      // as much to reach for on each side.
      const places = shuffled(layout.slots, random);
      const first = random() < 0.5 ? 0 : 1;
      const tiles = riddle.options.map((cell, at) => {
        const wanted = (first + at) % 2;
        const found = places.findIndex((each) => each.shelf === wanted);
        const [place] = places.splice(found < 0 ? 0 : found, 1);
        const home = { x: place.x + (random() - 0.5) * 0.012, y: place.y + (random() - 0.5) * 0.012 };
        return {
          id: index * PER_DOOR + at,
          door: index,
          cell,
          right: at === riddle.right,
          home,
          x: home.x,
          y: home.y,
          tilt: (random() - 0.5) * 9, // A little, as it lies on the shelf, in degrees.
          state: 'loose', // loose, held, placed, or tried once it has been tried in the gap and didn't fit.
          holder: null,
          z: at,
          carried: 0,
          by: null,
          // With friends: the newest grab of it anyone has been given, whose that was, the grab this game would ask
          // for next, and the one it's waiting to hear about.
          last: -1,
          owner: null,
          next: 0,
          asked: null,
          heldSince: 0,
        };
      });
      return { index, kind, riddle, layout, tiles, wrong: 0, look: 0, lookFor: 0, looked: false, open: false };
    });
  }

  /** The door being worked on now. */
  get door() {
    return this.doors[this.index];
  }

  get tiles() {
    return this.door.tiles;
  }

  get layout() {
    return this.door.layout;
  }

  get done() {
    return this.phase === 'done';
  }

  get total() {
    return this.doors.length;
  }

  tile(id) {
    return this.doors[Math.floor(id / PER_DOOR)]?.tiles.find((each) => each.id === id) ?? null;
  }

  /** How near the gap a piece has to be held, in table units. */
  snapRadius() {
    return this.layout.cell * this.snapShare;
  }

  /** Puts a piece's middle at (x, y), or as near as keeps all of it on the table, so none of it is ever out of sight. */
  keepIn(tile, x, y) {
    const half = this.layout.cell / 2;
    tile.x = clamp(x, half + EDGE, TABLE.width - half - EDGE);
    tile.y = clamp(y, half + EDGE, TABLE.height - half - EDGE);
  }

  gap(tile, at) {
    return Math.hypot(tile.x - at.x, tile.y - at.y);
  }

  /** Whether the middle of the glove is over a piece, or within the reach that reach help gives round it. */
  over(tile, glove) {
    const half = this.layout.cell / 2 + this.grab;
    return Math.abs(glove.x - tile.x) <= half && Math.abs(glove.y - tile.y) <= half;
  }

  /** The loose piece an open hand at the glove would pick up: the nearest it's over. Never one tried already, or in a friend's hand. */
  tileUnder(glove) {
    let best = null;
    let bestGap = Infinity;
    for (const tile of this.tiles) {
      if (tile.state !== 'loose' || !this.over(tile, glove)) continue;
      const gap = this.gap(tile, glove);
      if (gap < bestGap) {
        best = tile;
        bestGap = gap;
      }
    }
    return best;
  }

  /**
   * One frame of play. glove is where the middle of the glove is on the table, or null when the hand can't be seen,
   * and open whether the hand is open. Anything else is a hand that's resting, which costs nothing.
   */
  update(dt, { glove = null, open = false } = {}) {
    this.time += dt;
    if (this.shared) this.askAgain();
    if (this.phase === 'done') return;
    if (this.phase === 'dark' || this.phase === 'open') {
      this.phaseFor += dt;
      if (this.phase === 'dark' && this.phaseFor >= DARK_SECONDS) {
        this.phase = 'done';
        this.onEvent({ type: 'done' });
      } else if (this.phase === 'open' && this.phaseFor >= (this.index === this.doors.length - 1 ? PARTY_SECONDS : OPEN_SECONDS)) {
        this.nextDoor();
      }
      return;
    }
    const hand = Boolean(glove && open);
    if (hand) this.openAt = this.time;
    this.judgeSpeed(dt, glove);
    if (this.held) {
      // A hand that was open a moment ago keeps its piece: a moment's flicker in the tracker shouldn't drop it.
      if (!glove || this.time - this.openAt > GRACE) this.drop();
      else this.carry(dt, glove, hand);
    } else {
      this.settle(dt, glove, hand);
    }
    if (!this.held) {
      this.carryFor = 0;
      this.trying = 0;
    }
    // Only while someone is there to look: a child who goes away doesn't come back to the answer lit.
    const door = this.door;
    if (glove) door.lookFor += dt;
    door.look = clamp(door.look + (door.lookFor >= LOOK_AFTER ? dt : -dt) * LOOK_RATE, 0, 1);
    if (door.lookFor >= LOOK_AFTER && !door.looked) {
      door.looked = true;
      this.onEvent({ type: 'look', door });
    }
  }

  /**
   * An open hand settling on a loose piece, rather than passing over it, picks it up after a moment. A hand that
   * closes, goes, speeds up or moves to another piece starts again, though a moment's flicker of the tracker doesn't.
   */
  settle(dt, glove, hand) {
    const { hover } = this;
    const tile = glove ? this.tileUnder(glove) : null;
    if (glove && !tile) this.fresh = false;
    if (this.fresh) return;
    if (!tile || tile !== hover.tile) {
      hover.for = Math.max(0, hover.for - dt * 4);
      if (hover.for === 0) hover.tile = tile;
      return;
    }
    // Read as closed for a moment, as the tracker can while a hand moves: it waits.
    if (!hand && this.time - this.openAt <= GRACE) return;
    if (hand && this.speed < SETTLE_SPEED) hover.for += dt;
    else hover.for = Math.max(0, hover.for - dt * (hand ? 2 : 4));
    if (hover.for >= PICK_SECONDS) this.pick(tile);
  }

  /** How fast the glove is going, from where it is smoothed, so a shake doesn't count but going from place to place does. */
  judgeSpeed(dt, glove) {
    if (!glove || dt <= 0) {
      this.steady = null;
      return;
    }
    if (!this.steady) {
      this.steady = { x: glove.x, y: glove.y };
      return;
    }
    const blend = 1 - Math.exp(-dt * STEADY_RATE);
    const [dx, dy] = [(glove.x - this.steady.x) * blend, (glove.y - this.steady.y) * blend];
    this.steady.x += dx;
    this.steady.y += dy;
    this.speed += (Math.hypot(dx, dy) / dt - this.speed) * (1 - Math.exp(-dt * SPEED_RATE));
  }

  /** The piece in the hand goes with it, and once it has been held in the gap for a moment, it's tried there. */
  carry(dt, glove, hand) {
    const tile = this.held;
    const blend = 1 - Math.exp(-dt * FOLLOW_RATE);
    this.keepIn(tile, tile.x + (glove.x - tile.x) * blend, tile.y + (glove.y - tile.y) * blend);
    if (!hand) return;
    tile.carried += dt;
    this.carryFor += dt;
    this.stats.carried += dt;
    this.stats.longest = Math.max(this.stats.longest, this.carryFor);
    // With friends, only once the server has said the piece is this child's.
    const inGap = this.gap(tile, this.layout.hole) <= this.snapRadius() && (!this.shared || this.sure);
    this.trying = inGap ? this.trying + dt : Math.max(0, this.trying - dt * TRY_FADE_RATE);
    if (this.trying < TRY_SECONDS) return;
    this.trying = 0;
    if (tile.right) this.place(tile, this.me);
    else this.wrong(tile, this.me);
  }

  pick(tile) {
    tile.state = 'held';
    tile.holder = this.me;
    tile.tilt = 0;
    this.top += 1;
    tile.z = this.top;
    this.held = tile;
    this.sure = false;
    this.trying = 0;
    this.hover = { tile: null, for: 0 };
    this.stats.picks += 1;
    if (this.shared) {
      tile.asked = { k: tile.id * GRABS + tile.next, at: this.time };
      this.shared.claim(tile.asked.k);
    }
    this.onEvent({ type: 'pick', tile });
  }

  /** The hand has closed, or gone: the piece waits where it is. */
  drop() {
    const tile = this.held;
    if (!tile) return;
    this.held = null;
    this.trying = 0;
    tile.state = 'loose';
    tile.holder = null;
    // With friends, once it's this child's, everyone is told where it lies: see report().
    if (this.shared && this.sure) this.mine.set(tile.id, { k: tile.id * GRABS + tile.last, s: 0 });
    this.sure = false;
    this.onEvent({ type: 'drop', tile });
  }

  /** The piece that fits goes into the gap, and the door opens. by is whose hand put it there. */
  place(tile, by = this.me) {
    if (tile.state === 'placed') return;
    if (this.held === tile) {
      this.held = null;
      this.sure = false;
      this.trying = 0;
    }
    // With friends, everyone is told it's in, for good: see report().
    if (this.shared && by === this.me) this.mine.set(tile.id, { k: tile.id * GRABS + Math.max(0, tile.last), s: 1 });
    const from = { x: tile.x, y: tile.y };
    const door = this.doors[tile.door];
    tile.state = 'placed';
    tile.holder = null;
    tile.by = by;
    tile.x = door.layout.hole.x;
    tile.y = door.layout.hole.y;
    tile.tilt = 0;
    tile.asked = null;
    this.tally.set(by, (this.tally.get(by) ?? 0) + 1);
    const mine = by === this.me;
    if (mine) this.stats.opened += 1;
    this.onEvent({ type: 'placed', tile, by, mine, from });
    // Opened with no piece tried that didn't fit, by anyone: a star.
    if (mine && door.wrong === 0) {
      this.stats.firstTry += 1;
      this.prize('star', door.layout.hole);
    }
    if (tile.door === this.index && this.phase === 'play') this.openDoor();
  }

  /** A piece tried in the gap that doesn't fit: it goes back to its shelf, greyed, and a candle goes out. */
  wrong(tile, by = this.me) {
    if (tile.state === 'tried' || tile.state === 'placed') return;
    if (this.held === tile) {
      this.held = null;
      this.sure = false;
      this.trying = 0;
    }
    if (this.shared && by === this.me) this.shared.claim(TRIED + tile.id);
    this.mine.delete(tile.id);
    const from = { x: tile.x, y: tile.y };
    tile.state = 'tried';
    tile.holder = null;
    tile.by = by;
    tile.x = tile.home.x;
    tile.y = tile.home.y;
    tile.asked = null;
    const door = this.doors[tile.door];
    door.wrong += 1;
    const mine = by === this.me;
    if (mine) this.stats.wrong += 1;
    this.onEvent({ type: 'wrong', tile, by, mine, from });
    if (!mine || !this.candles || this.phase !== 'play') return;
    this.candles.left = Math.max(0, this.candles.left - 1);
    this.onEvent({ type: 'candle', left: this.candles.left });
    if (this.candles.left > 0) return;
    this.drop();
    this.phase = 'dark';
    this.phaseFor = 0;
    this.lost = true;
    this.onEvent({ type: 'dark' });
  }

  /** The piece that fits is in: the door opens, and is looked through for a moment. */
  openDoor() {
    const { door } = this;
    this.phase = 'open';
    this.phaseFor = 0;
    this.held = null;
    this.trying = 0;
    door.open = true;
    this.onEvent({ type: 'opened', door, last: this.index === this.doors.length - 1 });
  }

  nextDoor() {
    if (this.index >= this.doors.length - 1) {
      this.phase = 'done';
      this.onEvent({ type: 'done' });
      return;
    }
    this.index += 1;
    this.phase = 'play';
    this.phaseFor = 0;
    this.held = null;
    this.trying = 0;
    this.hover = { tile: null, for: 0 };
    this.fresh = true;
    this.onEvent({ type: 'door', door: this.door });
    // With friends, a door a friend opened while this one was still being looked through.
    if (this.tiles.some((each) => each.state === 'placed')) this.openDoor();
  }

  prize(kind, at) {
    this.stats.prizes[kind] += 1;
    this.onEvent({ type: 'prize', kind, at: { x: at.x, y: at.y } });
  }

  /* ---------- with friends, together ---------- */

  /**
   * The server says whose claim k is: the first to ask for that grab of that piece. The newest grab of a piece is the
   * one that counts, on every computer. If it's this child's, the piece in the hand is theirs for sure, and if it's a
   * friend's, it's in their hand, and comes out of this one. A claim from TRIED on is a piece someone tried in the gap
   * that didn't fit.
   */
  claimed(k, by) {
    if (!Number.isInteger(k)) return;
    if (k >= TRIED) {
      const tile = this.tile(k - TRIED);
      if (tile && by !== this.me) this.wrong(tile, by);
      return;
    }
    const tile = this.tile(Math.floor(k / GRABS));
    if (!tile) return;
    const grab = k % GRABS;
    if (tile.asked?.k === k) tile.asked = null;
    if (tile.state === 'placed' || tile.state === 'tried') return;
    if (grab <= tile.last) {
      // An older grab than the newest known: if this hand was waiting to hear about it, it didn't get it.
      if (this.held === tile && !tile.asked && !this.sure) this.letGo(tile);
      return;
    }
    tile.last = grab;
    tile.owner = by;
    tile.next = Math.max(tile.next, grab + 1);
    if (by === this.me) {
      if (this.held === tile) {
        this.sure = true;
        this.mine.delete(tile.id);
      } else {
        // Given to this child after their hand had let go of it: it lies where it is, and everyone is told so.
        tile.state = 'loose';
        tile.holder = null;
        this.mine.set(tile.id, { k, s: 0 });
      }
      return;
    }
    this.mine.delete(tile.id);
    if (this.held === tile) this.letGo(tile);
    tile.state = 'held';
    tile.holder = by;
    tile.heldSince = this.time;
    tile.tilt = 0;
    this.top += 1;
    tile.z = this.top;
  }

  /** The piece comes out of this child's hand without a word, as a friend has it. */
  letGo(tile) {
    this.held = null;
    this.sure = false;
    this.trying = 0;
    tile.asked = null;
    if (tile.holder === this.me) {
      tile.state = 'loose';
      tile.holder = null;
    }
  }

  /** A claim with no answer for a while is given up, and the piece put down, to be picked up again as a new grab. */
  askAgain() {
    for (const door of this.doors) {
      for (const tile of door.tiles) {
        if (!tile.asked || this.time - tile.asked.at < ASK_AGAIN_SECONDS) continue;
        tile.next = Math.max(tile.next, (tile.asked.k % GRABS) + 1);
        tile.asked = null;
        if (this.held === tile && !this.sure) this.letGo(tile);
      }
    }
  }

  /**
   * What this game tells its friends, about 10 times a second: h, the claim of the piece in this child's hand, or -1,
   * and d, each piece this child was the last to hold, as [claim, x, y, 0, placed], where it lies now. Saying it over
   * and over means a friend who missed it once still hears.
   */
  report() {
    const d = [];
    for (const [id, { k, s }] of this.mine) {
      const tile = this.tile(id);
      if (tile) d.push([k, Math.round(tile.x * 1000) / 1000, Math.round(tile.y * 1000) / 1000, 0, s]);
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
      const [k, x, y, , placed] = entry;
      const tile = this.tile(Math.floor(k / GRABS));
      if (!tile || !Number.isInteger(k) || tile.state === 'placed' || tile.state === 'tried') continue;
      if (placed) {
        if (tile.right) this.place(tile, from);
        continue;
      }
      const grab = k % GRABS;
      const newer = grab > tile.last;
      // Only the newest grab of a piece says where it is: anything older has been picked up since.
      if (!newer && !(grab === tile.last && tile.owner === from)) continue;
      if (newer) this.takenBy(tile, grab, from);
      said.add(tile.id);
      if (tile.state === 'held' && tile.holder !== from) continue;
      tile.state = 'loose';
      tile.holder = null;
      this.keepIn(tile, Number(x) || 0, Number(y) || 0);
    }
    const inHand = Number.isInteger(h) && h >= 0 ? this.tile(Math.floor(h / GRABS)) : null;
    if (inHand && inHand.state !== 'placed' && inHand.state !== 'tried') {
      const grab = h % GRABS;
      if (grab > inHand.last) this.takenBy(inHand, grab, from);
      if (grab === inHand.last && inHand.owner === from) {
        inHand.state = 'held';
        inHand.holder = from;
        said.add(inHand.id);
      }
    }
    // A piece this game has in the friend's hand, which the friend's own game says nothing of: put down where it is.
    for (const door of this.doors) {
      for (const tile of door.tiles) {
        if (tile.state !== 'held' || tile.holder !== from || said.has(tile.id)) continue;
        if (this.time - tile.heldSince > LET_GO_SECONDS) {
          tile.state = 'loose';
          tile.holder = null;
        }
      }
    }
  }

  /** A grab of a piece this game hadn't heard of, from what its holder says. */
  takenBy(tile, grab, by) {
    tile.last = grab;
    tile.owner = by;
    tile.next = Math.max(tile.next, grab + 1);
    tile.heldSince = this.time;
    this.mine.delete(tile.id);
    if (this.held === tile) this.letGo(tile);
  }

  /** A piece in a friend's hand goes where their glove is, on every computer. at is null when it can't be seen. */
  friendAt(id, at, dt) {
    if (!at) return;
    const blend = 1 - Math.exp(-dt * FOLLOW_RATE);
    for (const tile of this.tiles) {
      if (tile.state !== 'held' || tile.holder !== id) continue;
      this.keepIn(tile, tile.x + (at.x - tile.x) * blend, tile.y + (at.y - tile.y) * blend);
    }
  }

  /** A friend has gone: whatever was in their hand lies where it was. The doors they opened stay open. */
  friendGone(id) {
    for (const door of this.doors) {
      for (const tile of door.tiles) {
        if (tile.state === 'held' && tile.holder === id) {
          tile.state = 'loose';
          tile.holder = null;
        }
      }
    }
  }

  /* ---------- for the tests and the films ---------- */

  /**
   * Where a child would take their hand next, as the tests and the films do: to the gap with the piece they hold, or
   * to the piece that fits, or with right false, to a piece that doesn't. from is where the hand is now.
   */
  wants(from = { x: TABLE.width / 2, y: 0.5 }, { right = true } = {}) {
    if (this.phase !== 'play') return null;
    const { hole, board } = this.layout;
    if (this.held) return { x: hole.x, y: hole.y, why: 'try', tile: this.held };
    // A hand resting on a piece as the door came moves off it first, as a child reaching for another would.
    if (this.fresh && this.tileUnder(from)) return { x: board.x + board.width / 2, y: board.y + board.height / 2, why: 'off', tile: null };
    const loose = this.tiles.filter((tile) => tile.state === 'loose' && tile.right === right);
    if (!loose.length) return null;
    const best = loose.reduce((a, b) => (this.gap(a, from) <= this.gap(b, from) ? a : b));
    return { x: best.x, y: best.y, why: 'pick', tile: best };
  }
}
