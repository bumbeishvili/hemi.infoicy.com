// Giraffe's Paint Box: Giraffe is painting pictures for the friends' party, and the child colours them in. The open
// hand is the brush: paint goes down where it moves, and never over the lines. A closed hand, or one that can't be
// seen, is the brush lifted: nothing happens, and nothing is lost. Dipping the open hand in a paint pot takes that
// paint. Each part of a picture has a dot of the colour it asks for, and once a part is mostly painted it fills
// itself in. Every part painted, the picture is done.
//
// The rules are here, with no screen, so they run in the unit tests. main.js says where the hand is and whether it's
// open, and view.js draws what this says. Places are on the sheet (pages.js): 150 across and 100 down, with the row
// of paint pots under it.
//
// On their own, as it comes, it's a painting contest: a friend paints the same picture at their own easel, a little at
// a time, and finishing it before they do wins. They only paint while the child's hand is in the picture, so a child
// who goes away, or whose hand the camera loses, comes back to the contest as they left it. A grown-up can choose the
// gentle picture instead, which is the game as it always was: nothing has a time limit and nothing goes away, a
// resting child comes back to the picture just as they left it, and a brush with the wrong paint is given the right
// one after a while. With friends there's no painter to beat: the friends are the contest, or the team.
//
// How much of a part is painted is counted on a grid of little squares, one for each unit of the sheet: 150 by 100.
// Each square belongs to the part that's on top there, and is painted or not. The screen draws the real brush
// strokes, cut to each part's shape; the squares are only for counting.
//
// With friends, either everyone paints the same sheet together, each on their own computer, or each paints their own
// copy, to see who finishes first. Together, each game sends the strokes its child paints, as a few numbers, and
// paints the ones that come from the others, so every sheet ends up the same. Whoever's stroke finishes a part
// claims it, and the server says whose it is, the first to claim it having it.
import { clampLevel } from '../../core/levels.js';
import { boxOf, COLOUR_NAMES, insideOutline, mixes, mixOf, outlineOf, PAGES, RAINBOW, recipeFor, SHEET } from './pages.js';

const { width: WIDE, height: HIGH } = SHEET;

// The brush's size, from the middle of the hand, as a grown-up chooses: bigger is easier.
export const BRUSHES = { small: 5, medium: 6.5, big: 8.5 };
export const BRUSH_NAMES = Object.keys(BRUSHES);
// How much of a part has to be painted before it fills itself in.
export const DONE_SHARES = { some: 0.65, most: 0.8, all: 0.92 };
export const DONE_NAMES = Object.keys(DONE_SHARES);
// Reach help: the middle of the camera picture covers the whole desk, so a smaller movement goes further.
export const REACH = { none: 1, little: 1.25, lots: 1.6 };
// Which paint a part takes: only the one its dot asks for, or any colour anywhere.
export const RULES = ['own', 'free'];
// The row of paint pots under the sheet: where it runs from and to, how far down, and how big a pot can be.
export const ROW = { left: -8, right: 158, y: 114, most: 8.5, apart: 24 };
// Everything the hand has to reach: the sheet and the pots under it, with a little room round them.
export const DESK = { left: -12, right: 162, top: -3, bottom: 125 };
export const DIP_SECONDS = 0.3; // An open hand has to stay in a pot this long to take its paint.
const DIP_STILL = 5; // And to have gone no further than this meanwhile: one only passing over, on its way along the row, takes nothing.
export const FREE_SHARE = 0.25; // How much of the space to draw in has to have something drawn in it.
const POT_REACH = 1.15; // A pot takes a hand a little way outside it too.
const JUMP = 28; // A hand that moves further than this at once has been lost and found: it starts a new stroke.
const STICK = 0.6; // Free painting: the brush stays with its part while that's within this much of its own size.
const SWITCH_SECONDS = 0.3; // And for this long in another part, before it's that one's.
const TOUCH = 9; // How near the hand has to come to the big brush or a paint balloon to take it.
const MOST_PARTS = 30; // Which parts are done goes to friends as one number, a bit for each.
export const CLAIM_LATE = 0.5; // Together: seconds a done part can be nobody's before each child who painted some of it claims it.

// The other painter, as a grown-up chooses: a contest (the default), or the gentle picture, with nobody to beat.
export const RIVALS = ['contest', 'gentle'];
// How long the other painter takes over a picture: base seconds, and so many for each part to paint and for each
// hundred squares of it, each from level 1's to level 10's. lostSeconds is how long their finished picture is looked
// at before the finish card.
export const RIVAL = { base: [15, 3], part: [5, 1.1], hundred: [1.6, 0.4], lostSeconds: 2.4 };
// Who the other painter is at each level, from core/body/roster.js: never Giraffe, whose pictures they are.
export const RIVAL_PAINTERS = ['truffle', 'kit', 'mochi', 'widget', 'frost', 'bramble', 'nova', 'cinder', 'tur', 'kit'];

// What the levels bring. Missing any of it never costs anything.
export const EXTRAS = {
  rollerSeconds: 10, // How long the big brush lasts. It only runs down while the brush is on the sheet.
  rollerScale: 2.2, // How much bigger it makes the brush.
  stampSeconds: 0.5, // How long the hand holds still to print a star.
  stampStill: 4, // And how far it can wander meanwhile, on the sheet.
  stampsMost: 40, // The oldest star goes once there are more than this.
  splat: 15, // How far a paint balloon's splash reaches.
  balloonsAtOnce: 3,
  balloonsMost: 6, // In one picture.
  balloonEvery: 4, // Seconds between one coming and the next.
  balloonNeeds: 60, // A part has at least this much still to paint for a balloon to come to it.
  hintAfter: 0.6, // Seconds with the wrong paint on a part before it shows which pot it wants.
  hintStays: 5, // And how long that stays up once the hand has gone, as it goes off to the pot.
  helpAfter: 6, // And before the brush is given that paint, so nobody is stuck.
};
// With friends: the most numbers one message can hold of the strokes painted, and of the strokes kept to send.
export const STROKE_NUMBERS = 120;
const OUTBOX_MOST = 2400;
const RUN_NUMBERS = 100; // A run of strokes kept to send is no longer than this: the next starts where it ended.

/** What changes from level 1 to 10: each level is a new picture, and from 2 each brings something new: see NEWS. */
export function paintLevel(level) {
  const at = clampLevel(level);
  return {
    page: at - 1,
    // From level 2, a pot of rainbow paint, and a part in most pictures that asks for it.
    rainbow: at >= 2,
    // From level 3, a star stamp: with it, the hand held still prints a star.
    stamp: at >= 3,
    // From level 4, a big brush lying on the sheet, which makes the brush much bigger for a while.
    roller: at >= 4,
    // From level 5, someone hiding in one part of the picture, who comes out as it's painted.
    friend: at >= 5,
    // Level 6 is a butterfly, and what's painted on one wing is painted on the other.
    mirror: at === 6,
    // From level 7, a mixing dish: two paints dipped into it make a new one, with a pot of its own.
    dish: at >= 7,
    // Level 8 is coloured by numbers: each part has a number rather than a dot, and so has each pot.
    numbers: at === 8,
    // From level 9, balloons full of paint, which splash it over the part they're on.
    balloons: at >= 9,
    // Level 10 has a space to draw anything in.
    free: at === 10,
  };
}

// What each level brings that's new, for the title card, the countdown and the finish card. key says which part of
// paintLevel turns it on, which the unit tests check.
export const NEWS = {
  2: [{ key: 'rainbow', mark: '🌈', name: 'Rainbow paint', nameKa: 'ცისარტყელას საღებავი' }],
  3: [{ key: 'stamp', mark: '⭐', name: 'The star stamp', nameKa: 'ვარსკვლავის შტამპი' }],
  4: [{ key: 'roller', mark: '🖌️', name: 'The big brush', nameKa: 'დიდი ფუნჯი' }],
  5: [{ key: 'friend', mark: '🐰', name: 'A hidden friend', nameKa: 'დამალული მეგობარი' }],
  6: [{ key: 'mirror', mark: '🦋', name: 'Mirror painting', nameKa: 'სარკისებური ხატვა' }],
  7: [{ key: 'dish', mark: '🥣', name: 'The mixing dish', nameKa: 'შესარევი ჯამი' }],
  8: [{ key: 'numbers', mark: '🔢', name: 'Colour by numbers', nameKa: 'გაფერადება ციფრებით' }],
  9: [{ key: 'balloons', mark: '🎈', name: 'Paint balloons', nameKa: 'საღებავიანი ბუშტები' }],
  10: [{ key: 'free', mark: '✏️', name: 'A space to draw in', nameKa: 'სახატავი ადგილი' }],
};

// The little label each new thing has beside it the first time it comes in a game, in English and Georgian. Nothing
// new is said out loud.
export const LABELS = {
  rainbow: ['Rainbow paint!', 'ცისარტყელას საღებავი!'],
  stamp: ['Hold still to print a star!', 'გააჩერე ხელი და ვარსკვლავი დაიბეჭდება!'],
  roller: ['Touch the big brush!', 'შეეხე დიდ ფუნჯს!'],
  friend: ['Who is hiding here?', 'ვინ იმალება აქ?'],
  mirror: ['Both wings at once!', 'ორივე ფრთა ერთად!'],
  dish: ['Mix two paints here!', 'აქ ორი საღებავი შეურიე!'],
  numbers: ['Match the numbers!', 'შეუსაბამე ციფრები!'],
  balloon: ['Pop it for a splash!', 'გახეთქე და საღებავი გადმოიღვრება!'],
  free: ['Draw what you like!', 'დახატე, რაც გინდა!'],
};

/** What's new at a level, as [{ key, mark, name, nameKa }]. Nothing at level 1. */
export const paintNewAt = (level) => NEWS[clampLevel(level)] ?? [];

/** Whether the part of a level that a piece of news names is on. */
export const newsIsOn = (key, level) => Boolean(paintLevel(level)[key]);

/** How a game with friends is to be played, as one word for the server to pass on: the rule, and how much is done. */
export const modeWord = (rule, done) => `${RULES.includes(rule) ? rule : 'own'}${DONE_NAMES.includes(done) ? done[0].toUpperCase() + done.slice(1) : 'Most'}`;

/** And back again. Anything that isn't one of the words is the usual. */
export function readMode(word = '') {
  const found = /^(own|free)(Some|Most|All)$/.exec(word);
  return found ? { rule: found[1], done: found[2].toLowerCase() } : { rule: 'own', done: 'most' };
}

const INDEX = new Map(COLOUR_NAMES.map((name, index) => [name, index]));
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const round1 = (value) => Math.round(value * 10) / 10;

export class Painting {
  /**
   * level is the level played, which says which picture it is. plain leaves out everything the levels bring, as
   * with friends. rule is 'own', each part taking only the paint its dot asks for, or 'free', any colour anywhere;
   * done is how much of a part has to be painted before it fills itself in (see DONE_SHARES), and brush how big the
   * brush is (see BRUSHES), all as a grown-up chose. shared is { claim(k) } with friends painting the same sheet,
   * and me this child's id among them. onEvent hears what happens: see main.js.
   */
  constructor({ level = 1, plain = false, rule = 'own', done = 'most', brush = 'medium', rival = 'contest', shared = null, me = 'me', onEvent = () => {} } = {}) {
    Object.assign(this, { shared, me, onEvent });
    this.level = clampLevel(level);
    const full = paintLevel(level);
    this.plan = plain ? { ...full, rainbow: false, stamp: false, roller: false, friend: false, mirror: false, dish: false, numbers: false, balloons: false, free: false } : full;
    this.page = PAGES[full.page];
    this.rule = rule === 'free' ? 'free' : 'own';
    this.share = DONE_SHARES[done] ?? DONE_SHARES.most;
    this.size = BRUSHES[brush] ?? BRUSHES.medium;
    this.time = 0;
    this.done = false;
    this.marks = []; // The strokes painted since the screen last took them: see takeMarks.
    this.stats = { parts: 0, dips: 0, mixes: 0, stamps: 0, friends: 0, balloons: 0, helped: 0, cells: 0, seconds: 0 };
    this.fresh = 0; // How many squares the child's own brush newly painted in the last frame.
    this.lock = -1; // Free painting: the part the brush is in.
    this.otherFor = 0;
    this.wrongFor = 0;
    this.hint = null; // The part that wants another paint, and the pots for it: see hintFor.
    this.hintUntil = 0;
    this.dipping = null;
    this.stamping = null;
    this.stamps = [];
    this.balloons = [];
    this.balloonIn = 1.5;
    this.balloonsMade = 0;
    // With friends: the strokes still to send, how many parts each one's stroke finished, and whose each part was.
    this.outbox = [];
    this.outboxNumbers = 0;
    this.tally = new Map();
    this.owners = new Map();
    this.lay();
    // The other painter, on their own, unless the gentle picture was chosen. progress goes from 0 to 1 as they paint.
    this.lost = false;
    this.lostFor = 0;
    this.rival = !plain && !shared && rival !== 'gentle' ? { who: RIVAL_PAINTERS[this.level - 1], progress: 0, seconds: this.rivalSeconds() } : null;
  }

  /** How long the other painter takes over this picture, at this level: see RIVAL. */
  rivalSeconds() {
    const at = (this.level - 1) / 9;
    const mix = ([first, last]) => first + (last - first) * at;
    const squares = this.toPaint.reduce((sum, part) => sum + part.cells * part.need, 0);
    return mix(RIVAL.base) + this.toPaint.length * mix(RIVAL.part) + (squares / 100) * mix(RIVAL.hundred);
  }

  /* ---------- a new sheet ---------- */

  /** The picture's parts, which square of the sheet is whose, the pots, and what the level brings. */
  lay() {
    const { page, plan } = this;
    const hidden = plan.friend ? page.friend ?? null : null;
    this.parts = page.parts.map((source, index) => {
      let kind = 'part';
      let { colour } = source;
      if (source.free) {
        // The space to draw in takes any paint. Without it, it stays white paper.
        kind = plan.free ? 'free' : 'paper';
        colour = null;
      } else if (colour === null) {
        kind = 'paper';
      } else if (colour === RAINBOW && !plan.rainbow) {
        colour = source.plain;
      }
      const outlines = source.shapes.map(outlineOf);
      const boxes = outlines.map(boxOf);
      const box = { left: Math.min(...boxes.map((each) => each.left)), top: Math.min(...boxes.map((each) => each.top)), right: Math.max(...boxes.map((each) => each.right)), bottom: Math.max(...boxes.map((each) => each.bottom)) };
      return { index, id: source.id, kind, colour, outlines, box, cells: 0, covered: 0, done: kind === 'paper', painted: false, claimed: false, unclaimedFor: 0, magic: hidden?.part === source.id, need: kind === 'free' ? FREE_SHARE : this.share, dot: null };
    });
    if (this.parts.length > MOST_PARTS) throw new Error(`${page.id} has too many parts`);
    this.mirror = Boolean(page.mirror && plan.mirror);
    this.numbers = Boolean(page.numbers && plan.numbers);
    this.friend = hidden ? { ...hidden, part: this.parts.findIndex((part) => part.magic), found: false } : null;
    this.roller = plan.roller && page.roller ? { x: page.roller[0], y: page.roller[1], taken: false, left: EXTRAS.rollerSeconds } : null;
    this.mapSheet();
    this.layPots();
    // The brush starts with the paint for the biggest part, so it paints straight away.
    const ready = new Set(this.pots.filter((pot) => pot.kind === 'colour' && pot.ready).map((pot) => pot.colour));
    const first = this.parts.filter((part) => part.kind === 'part' && part.colour !== RAINBOW && ready.has(part.colour)).sort((a, b) => b.cells - a.cells)[0];
    this.brush = { tool: 'paint', colour: first?.colour ?? this.pots[0].colour, down: false, at: null, travel: 0 };
  }

  /** Which part each square of the sheet belongs to, the one on top there, and where each part's dot goes. */
  mapSheet() {
    const owner = new Int8Array(WIDE * HIGH).fill(-1);
    for (const part of this.parts) {
      for (const outline of part.outlines) {
        const box = boxOf(outline);
        const [left, right] = [Math.max(0, Math.floor(box.left)), Math.min(WIDE - 1, Math.ceil(box.right))];
        const [top, bottom] = [Math.max(0, Math.floor(box.top)), Math.min(HIGH - 1, Math.ceil(box.bottom))];
        for (let j = top; j <= bottom; j += 1) {
          for (let i = left; i <= right; i += 1) {
            if (insideOutline(outline, i + 0.5, j + 0.5)) owner[j * WIDE + i] = part.index;
          }
        }
      }
    }
    this.owner = owner;
    this.paint = new Uint8Array(WIDE * HIGH); // For each square, the paint on it: its place in COLOUR_NAMES and one, or 0.
    for (let cell = 0; cell < owner.length; cell += 1) if (owner[cell] >= 0) this.parts[owner[cell]].cells += 1;
    // How deep inside its part each square is, so a part's dot goes where it's deepest, well away from the lines.
    const deep = new Float32Array(WIDE * HIGH).fill(Infinity);
    const at = (i, j) => (i < 0 || j < 0 || i >= WIDE || j >= HIGH ? -2 : owner[j * WIDE + i]);
    for (let j = 0; j < HIGH; j += 1) {
      for (let i = 0; i < WIDE; i += 1) {
        const mine = owner[j * WIDE + i];
        if (at(i - 1, j) !== mine || at(i + 1, j) !== mine || at(i, j - 1) !== mine || at(i, j + 1) !== mine) deep[j * WIDE + i] = 0.5;
      }
    }
    const lower = (cell, other, far) => {
      if (deep[other] + far < deep[cell]) deep[cell] = deep[other] + far;
    };
    for (let j = 0; j < HIGH; j += 1) {
      for (let i = 0; i < WIDE; i += 1) {
        const cell = j * WIDE + i;
        if (i > 0) lower(cell, cell - 1, 1);
        if (j > 0) lower(cell, cell - WIDE, 1);
        if (i > 0 && j > 0) lower(cell, cell - WIDE - 1, 1.414);
        if (i < WIDE - 1 && j > 0) lower(cell, cell - WIDE + 1, 1.414);
      }
    }
    for (let j = HIGH - 1; j >= 0; j -= 1) {
      for (let i = WIDE - 1; i >= 0; i -= 1) {
        const cell = j * WIDE + i;
        if (i < WIDE - 1) lower(cell, cell + 1, 1);
        if (j < HIGH - 1) lower(cell, cell + WIDE, 1);
        if (i < WIDE - 1 && j < HIGH - 1) lower(cell, cell + WIDE + 1, 1.414);
        if (i > 0 && j < HIGH - 1) lower(cell, cell + WIDE - 1, 1.414);
      }
    }
    // A part in several pieces, as a pair of eyes is, has a dot on each piece big enough for one. Each piece is
    // found by spreading out from one of its squares to all those that touch it.
    const seen = new Uint8Array(WIDE * HIGH);
    const pieces = this.parts.map(() => []);
    for (let start = 0; start < owner.length; start += 1) {
      if (seen[start] || owner[start] < 0) continue;
      const mine = owner[start];
      const piece = { x: 0, y: 0, deep: 0, cells: 0 };
      const waiting = [start];
      seen[start] = 1;
      while (waiting.length) {
        const cell = waiting.pop();
        piece.cells += 1;
        if (deep[cell] > piece.deep) Object.assign(piece, { x: (cell % WIDE) + 0.5, y: Math.floor(cell / WIDE) + 0.5, deep: deep[cell] });
        const [i, j] = [cell % WIDE, Math.floor(cell / WIDE)];
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const next = (j + dj) * WIDE + i + di;
          if (i + di < 0 || i + di >= WIDE || j + dj < 0 || j + dj >= HIGH || seen[next] || owner[next] !== mine) continue;
          seen[next] = 1;
          waiting.push(next);
        }
      }
      pieces[mine].push(piece);
    }
    this.parts.forEach((part, index) => {
      const biggest = pieces[index].sort((a, b) => b.cells - a.cells);
      // The picture can say where a dot goes, where the deepest place has something drawn on it.
      const placed = this.page.parts[index].dot;
      part.dots = placed ? [{ x: placed[0], y: placed[1], deep: 3 }] : biggest.filter((piece, order) => order === 0 || (piece.cells >= 15 && piece.deep >= 1.4)).map(({ x, y, deep: far }) => ({ x, y, deep: far }));
      part.dot = part.dots[0] ?? null;
    });
  }

  /**
   * The pots, along their row: one for each paint the picture asks for, an empty place for each that has to be
   * mixed, the mixing dish, the rainbow, and the star stamp.
   */
  layPots() {
    const { page, plan } = this;
    const wanted = COLOUR_NAMES.filter((name) => this.parts.some((part) => part.kind === 'part' && part.colour === name));
    const mixing = plan.dish ? (page.mix ?? []).filter((colour) => wanted.includes(colour)) : [];
    const there = wanted.filter((colour) => colour !== RAINBOW && !mixing.includes(colour));
    // The paints a colour is mixed from have pots, whether or not a part asks for them.
    for (const colour of mixing) for (const base of recipeFor(colour)) if (!there.includes(base)) there.push(base);
    there.sort((a, b) => INDEX.get(a) - INDEX.get(b));
    const pots = [
      ...there.map((colour) => ({ kind: 'colour', colour, ready: true })),
      ...mixing.map((colour) => ({ kind: 'colour', colour, ready: false, mixed: true })),
      ...(mixing.length ? [{ kind: 'dish', holds: null }] : []),
      ...(wanted.includes(RAINBOW) ? [{ kind: 'colour', colour: RAINBOW, ready: true }] : []),
      ...(plan.stamp ? [{ kind: 'stamp' }] : []),
    ];
    const apart = Math.min(ROW.apart, (ROW.right - ROW.left) / pots.length);
    const first = (ROW.left + ROW.right) / 2 - (apart * (pots.length - 1)) / 2;
    let number = 0;
    pots.forEach((pot, index) => {
      Object.assign(pot, { index, x: first + apart * index, y: ROW.y, r: Math.min(ROW.most, apart * 0.44) });
      // Coloured by numbers: each paint's pot has its number.
      if (this.numbers && pot.kind === 'colour') pot.number = (number += 1);
    });
    this.pots = pots;
  }

  /* ---------- what there is to know ---------- */

  /** The parts there are to paint. */
  get toPaint() {
    return this.parts.filter((part) => part.kind !== 'paper');
  }

  /** How far along the picture is, from 0 to 1: of what each part needs, how much it has. */
  get progress() {
    let [had, needed] = [0, 0];
    for (const part of this.toPaint) {
      const need = part.cells * part.need;
      needed += need;
      had += part.done ? need : Math.min(need, part.covered);
    }
    return needed ? had / needed : 1;
  }

  /** How big the brush is now: bigger with the big brush. */
  get radius() {
    return round1(this.size * (this.roller?.taken && this.roller.left > 0 ? EXTRAS.rollerScale : 1));
  }

  /** The number on a part's dot, when the picture is coloured by numbers. */
  numberOf(colour) {
    return this.pots.find((pot) => pot.kind === 'colour' && pot.colour === colour)?.number ?? null;
  }

  /** The part to paint that's on top at a place on the sheet, as its number, or -1 for white paper or off the sheet. */
  partAt(x, y) {
    if (x < 0 || y < 0 || x >= WIDE || y >= HIGH) return -1;
    const index = this.owner[Math.floor(y) * WIDE + Math.floor(x)];
    return index >= 0 && this.parts[index].kind !== 'paper' ? index : -1;
  }

  /** The pot a place is in, or null. */
  potAt(at) {
    let found = null;
    for (const pot of this.pots) {
      if (pot.kind === 'colour' && !pot.ready) continue;
      const far = gap(at, pot);
      if (far <= pot.r * POT_REACH && (!found || far < gap(at, found))) found = pot;
    }
    return found;
  }

  /** Whether any of a part is within so far of a place. */
  near(at, index, within) {
    const [left, right] = [Math.max(0, Math.floor(at.x - within)), Math.min(WIDE - 1, Math.floor(at.x + within))];
    const [top, bottom] = [Math.max(0, Math.floor(at.y - within)), Math.min(HIGH - 1, Math.floor(at.y + within))];
    for (let j = top; j <= bottom; j += 1) {
      for (let i = left; i <= right; i += 1) {
        if (this.owner[j * WIDE + i] === index && Math.hypot(i + 0.5 - at.x, j + 0.5 - at.y) <= within) return true;
      }
    }
    return false;
  }

  /* ---------- each frame ---------- */

  /**
   * One frame of play. at is where the middle of the hand is on the sheet, or null when it can't be seen, and open
   * whether it's open, which is the brush down.
   */
  update(dt, { at = null, open = false } = {}) {
    this.fresh = 0;
    this.claimLeftovers(dt);
    if (this.done) {
      this.lift();
      return;
    }
    if (this.lost) {
      // The other painter finished first: a moment for it to be seen, and the contest is over.
      this.lift();
      this.lostFor += dt;
      return;
    }
    this.time += dt;
    // The other painter paints while the child's hand is in the picture, open or not, and finishing first wins.
    if (this.rival && at) {
      this.rival.progress = Math.min(1, this.rival.progress + dt / this.rival.seconds);
      if (this.rival.progress >= 1) {
        this.lost = true;
        this.lift();
        this.onEvent({ type: 'beaten', rival: this.rival });
        return;
      }
    }
    // Which pot a part wants stays up for a while, as the hand goes off to it.
    if (this.hint && this.time > this.hintUntil) this.hint = null;
    this.updateBalloons(dt);
    if (!at) {
      this.lift();
      this.dipping = null;
      return;
    }
    this.touch(at);
    const pot = open ? this.potAt(at) : null;
    this.dip(pot, dt, at);
    const onSheet = at.x >= 0 && at.x <= WIDE && at.y >= 0 && at.y <= HIGH;
    if (!open || !onSheet || pot || this.done) {
      this.lift();
      return;
    }
    if (this.brush.tool === 'stamp') {
      this.stamp(at, dt);
      return;
    }
    this.brushAt(at, dt);
  }

  /** The brush comes up: the next stroke starts afresh. */
  lift() {
    this.brush.down = false;
    this.brush.at = null;
    this.lock = -1;
    this.otherFor = 0;
    this.stamping = null;
  }

  /**
   * The open hand on the sheet, with paint on it: a stroke from where it was to where it is. Where it is, is kept
   * to a tenth of a square, which is how it goes to friends, so the same stroke paints the same squares on every sheet.
   */
  brushAt(where, dt) {
    const { brush } = this;
    const at = { x: round1(where.x), y: round1(where.y) };
    const radius = this.radius;
    const from = brush.down && brush.at && gap(brush.at, at) <= JUMP ? brush.at : at;
    const lock = this.rule === 'free' ? this.lockFor(at, dt) : -1;
    const before = this.stats.cells;
    if (this.rule === 'own' || lock >= 0) {
      const phase = brush.travel;
      const touched = this.strokeTo(from, at, radius, brush.colour, lock, { mine: true, phase });
      // The butterfly: the same stroke on the other wing, in whichever part is under it there.
      if (this.mirror) {
        const [far, farFrom] = [{ x: WIDE - at.x, y: at.y }, { x: WIDE - from.x, y: from.y }];
        const farLock = lock >= 0 ? this.partAt(far.x, far.y) : -1;
        if (lock < 0 || farLock >= 0) for (const index of this.strokeTo(farFrom, far, radius, brush.colour, farLock, { mine: true, phase })) touched.add(index);
      }
      if (this.shared && touched.size) this.note(from, at, radius, brush.colour, lock);
      this.settle(touched, true);
    }
    brush.travel += gap(from, at);
    brush.down = true;
    brush.at = { x: at.x, y: at.y };
    this.fresh = this.stats.cells - before;
    this.stats.seconds += dt;
    const { roller } = this;
    if (roller?.taken && roller.left > 0) {
      roller.left = Math.max(0, roller.left - dt);
      if (roller.left === 0) this.onEvent({ type: 'roller-done' });
    }
    this.watch(at, dt);
  }

  /**
   * Free painting: the part the brush is in, which it stays with while that's still close by, so a shaky hand that
   * wanders over a line doesn't start painting next door. A while well inside another part, and it's that one's.
   */
  lockFor(at, dt) {
    const under = this.partAt(at.x, at.y);
    if (this.lock < 0 || under === this.lock) {
      this.lock = under;
      this.otherFor = 0;
      return this.lock;
    }
    this.otherFor = under >= 0 ? this.otherFor + dt : 0;
    if (this.otherFor < SWITCH_SECONDS && this.near(at, this.lock, this.radius * STICK)) return this.lock;
    this.lock = under;
    this.otherFor = 0;
    return this.lock;
  }

  /** Whether a part takes a paint: its own, or with free painting any, in the part the brush is in. */
  takes(part, colour, lock) {
    if (part.kind === 'paper') return false;
    if (lock >= 0) return part.index === lock;
    return part.kind === 'free' || part.colour === colour;
  }

  /**
   * Paint along a line, as dabs close enough together to leave no gaps. Returns the parts it landed on, as their
   * numbers, and keeps the stroke for the screen to draw.
   */
  strokeTo(from, to, radius, colour, lock, { mine = false, phase = 0 } = {}) {
    const touched = new Set();
    const far = gap(from, to);
    const steps = Math.max(1, Math.ceil(far / (radius * 0.5)));
    for (let step = far > 0 ? 0 : steps; step <= steps; step += 1) {
      const along = step / steps;
      this.dab(from.x + (to.x - from.x) * along, from.y + (to.y - from.y) * along, radius, colour, lock, mine, touched);
    }
    if (touched.size) this.marks.push({ x0: from.x, y0: from.y, x1: to.x, y1: to.y, r: radius, colour, phase, parts: [...touched] });
    return touched;
  }

  /** One dab of paint: every square within the brush that takes it. */
  dab(x, y, radius, colour, lock, mine, touched) {
    const code = INDEX.get(colour) + 1;
    const [left, right] = [Math.max(0, Math.floor(x - radius)), Math.min(WIDE - 1, Math.floor(x + radius))];
    const [top, bottom] = [Math.max(0, Math.floor(y - radius)), Math.min(HIGH - 1, Math.floor(y + radius))];
    const reach = radius * radius;
    for (let j = top; j <= bottom; j += 1) {
      for (let i = left; i <= right; i += 1) {
        const [dx, dy] = [i + 0.5 - x, j + 0.5 - y];
        if (dx * dx + dy * dy > reach) continue;
        const cell = j * WIDE + i;
        const index = this.owner[cell];
        if (index < 0) continue;
        const part = this.parts[index];
        if (!this.takes(part, colour, lock)) continue;
        touched.add(index);
        if (mine) part.painted = true;
        if (this.paint[cell] === 0) {
          part.covered += 1;
          if (mine) this.stats.cells += 1;
        }
        this.paint[cell] = code;
      }
    }
  }

  /** Any of these parts that now has enough paint fills itself in. */
  settle(touched, mine) {
    for (const index of touched) {
      const part = this.parts[index];
      if (!part.done && part.covered >= part.cells * part.need) this.finish(part, mine);
    }
  }

  /**
   * A part is done. It fills itself in with the paint it has most of, which is its own unless it was painted
   * freely. The space to draw in stays just as it was drawn.
   */
  finish(part, mine = false) {
    if (part.done) return;
    part.done = true;
    let colour = part.colour;
    if (part.kind !== 'free') {
      const counts = new Map();
      for (let cell = 0; cell < this.owner.length; cell += 1) {
        if (this.owner[cell] === part.index && this.paint[cell]) counts.set(this.paint[cell], (counts.get(this.paint[cell]) ?? 0) + 1);
      }
      const most = [...counts].sort((a, b) => b[1] - a[1])[0];
      if (most) colour = COLOUR_NAMES[most[0] - 1];
      const code = INDEX.get(colour) + 1;
      for (let cell = 0; cell < this.owner.length; cell += 1) {
        if (this.owner[cell] === part.index && !this.paint[cell]) this.paint[cell] = code;
      }
      part.covered = part.cells;
    }
    this.stats.parts += 1;
    this.onEvent({ type: 'part', part, colour, mine });
    // A balloon over it has nothing left to splash.
    for (const balloon of this.balloons) {
      if (balloon.part === part.index && !balloon.popped) {
        balloon.popped = true;
        this.onEvent({ type: 'balloon-gone', balloon });
      }
    }
    if (part.magic && this.friend && !this.friend.found) {
      this.friend.found = true;
      this.stats.friends += 1;
      this.onEvent({ type: 'friend', friend: this.friend, part });
    }
    // With friends, whoever's stroke finished it claims it, and the server says whose it is.
    if (this.shared && mine) {
      part.claimed = true;
      this.shared.claim(part.index);
    }
    if (!this.done && this.toPaint.every((each) => each.done)) {
      this.done = true;
      this.hint = null;
      this.onEvent({ type: 'done' });
    }
  }

  /**
   * With the wrong paint on a part, nothing lands. After a moment the part shows which pot it wants, and after a
   * good while the brush is given that paint, so nobody is ever stuck.
   */
  watch(at, dt) {
    if (this.rule !== 'own') return;
    if (this.fresh > 0) {
      this.wrongFor = 0;
      this.hint = null;
      return;
    }
    const index = this.partAt(at.x, at.y);
    const part = index >= 0 ? this.parts[index] : null;
    if (!part || part.done || part.kind !== 'part' || part.colour === this.brush.colour) return;
    this.wrongFor += dt;
    if (this.wrongFor >= EXTRAS.hintAfter) {
      this.hint = this.hintFor(part);
      this.hintUntil = this.time + EXTRAS.hintStays;
    }
    // In the gentle picture, after a good while the brush is given that paint. In a contest it isn't.
    if (!this.rival && this.wrongFor >= EXTRAS.helpAfter) {
      this.wrongFor = 0;
      this.hint = null;
      this.give(part.colour);
      this.stats.helped += 1;
      this.onEvent({ type: 'helped', colour: part.colour, part });
    }
  }

  /** Which pot a part's paint comes from, or the two to mix for it and the dish, as their places in the row. */
  hintFor(part) {
    const pot = this.pots.find((each) => each.kind === 'colour' && each.ready && each.colour === part.colour);
    if (pot) return { part: part.index, colour: part.colour, pots: [pot.index], recipe: null };
    const recipe = recipeFor(part.colour) ?? [];
    const from = recipe.map((colour) => this.pots.find((each) => each.kind === 'colour' && each.ready && each.colour === colour)?.index).filter((index) => index !== undefined);
    const dish = this.pots.find((each) => each.kind === 'dish');
    return { part: part.index, colour: part.colour, pots: dish ? [...from, dish.index] : from, recipe };
  }

  /** The brush is given a paint, and if it's one that has to be mixed, its pot is there from now on. */
  give(colour) {
    this.brush.tool = 'paint';
    this.brush.colour = colour;
    this.wrongFor = 0;
    this.hint = null;
    const pot = this.pots.find((each) => each.kind === 'colour' && each.colour === colour);
    if (pot && !pot.ready) pot.ready = true;
  }

  /* ---------- the pots ---------- */

  /**
   * An open hand in a pot takes its paint once it has stayed there a moment, and once each time it comes. A hand
   * only passing over a pot, on its way along the row to another, takes nothing: over that moment it has to have
   * ended up about where it started, which a hand that trembles has, and one going by hasn't.
   */
  dip(pot, dt, at) {
    if (!pot) {
      this.dipping = null;
      return;
    }
    if (this.dipping?.pot !== pot) this.dipping = { pot, for: 0, done: false, trail: [] };
    const now = this.dipping;
    if (now.done) return;
    now.trail.push({ t: this.time, x: at.x, y: at.y });
    while (now.trail.length > 1 && this.time - now.trail[1].t >= DIP_SECONDS) now.trail.shift();
    const stayed = this.time - now.trail[0].t;
    // How far round the ring closing on the pot has got, for the screen.
    now.for = gap(now.trail[0], at) <= DIP_STILL ? stayed : 0;
    if (now.for < DIP_SECONDS - dt / 2) return;
    now.done = true;
    this.dipInto(pot);
  }

  dipInto(pot) {
    const { brush } = this;
    this.stats.dips += 1;
    if (pot.kind === 'stamp') {
      brush.tool = 'stamp';
      this.onEvent({ type: 'dip', pot });
      return;
    }
    if (pot.kind === 'colour') {
      this.give(pot.colour);
      this.onEvent({ type: 'dip', pot });
      return;
    }
    // The mixing dish: the first paint waits in it, and a second one mixes with it into a new paint, which the
    // brush takes, and which has a pot of its own from then on. Only paints that make something go in.
    if (brush.tool !== 'paint' || !mixes(brush.colour)) {
      this.onEvent({ type: 'dish-no', pot });
      return;
    }
    const made = pot.holds ? mixOf(pot.holds, brush.colour) : null;
    if (!made) {
      pot.holds = brush.colour;
      this.onEvent({ type: 'dish', pot });
      return;
    }
    const from = [pot.holds, brush.colour];
    pot.holds = null;
    this.give(made);
    this.stats.mixes += 1;
    this.onEvent({ type: 'mix', pot, colour: made, from, into: this.pots.find((each) => each.kind === 'colour' && each.colour === made) ?? null });
  }

  /* ---------- what the levels bring ---------- */

  /** The hand coming near the big brush, or a paint balloon, takes it, open or closed. */
  touch(at) {
    const { roller } = this;
    if (roller && !roller.taken && gap(at, roller) < TOUCH) {
      roller.taken = true;
      this.onEvent({ type: 'roller', roller });
    }
    for (const balloon of this.balloons) if (!balloon.popped && gap(at, balloon) < TOUCH) this.pop(balloon);
  }

  /** A paint balloon bursts, and its paint splashes over the part it was on. */
  pop(balloon) {
    balloon.popped = true;
    this.stats.balloons += 1;
    const part = this.parts[balloon.part];
    this.onEvent({ type: 'balloon', balloon, colour: part.colour });
    const touched = this.strokeTo(balloon, balloon, EXTRAS.splat, part.colour, part.index, { mine: true });
    if (this.shared && touched.size) this.note(balloon, balloon, EXTRAS.splat, part.colour, part.index);
    this.settle(touched, true);
  }

  /** Paint balloons come one at a time, to the parts with the most still to paint, a few at once. */
  updateBalloons(dt) {
    if (!this.plan.balloons) return;
    this.balloonIn -= dt;
    const up = this.balloons.filter((balloon) => !balloon.popped);
    if (this.balloonIn > 0 || up.length >= EXTRAS.balloonsAtOnce || this.balloonsMade >= EXTRAS.balloonsMost) return;
    const taken = new Set(up.map((balloon) => balloon.part));
    const part = this.parts
      .filter((each) => each.kind === 'part' && !each.done && !taken.has(each.index) && each.cells - each.covered >= EXTRAS.balloonNeeds)
      .sort((a, b) => b.cells - b.covered - (a.cells - a.covered))[0];
    this.balloonIn = EXTRAS.balloonEvery;
    if (!part) return;
    const where = this.emptiest(part);
    const balloon = { id: this.balloonsMade, part: part.index, x: where.x, y: where.y, popped: false };
    this.balloonsMade += 1;
    this.balloons.push(balloon);
    this.onEvent({ type: 'balloon-new', balloon, colour: part.colour });
  }

  /** The middle of what's still to paint of a part, on a square of it that isn't painted yet. */
  emptiest(part) {
    let [sumX, sumY, count] = [0, 0, 0];
    for (let cell = 0; cell < this.owner.length; cell += 1) {
      if (this.owner[cell] !== part.index || this.paint[cell]) continue;
      sumX += (cell % WIDE) + 0.5;
      sumY += Math.floor(cell / WIDE) + 0.5;
      count += 1;
    }
    if (!count) return { x: part.dot.x, y: part.dot.y };
    const middle = { x: sumX / count, y: sumY / count };
    let best = null;
    for (let cell = 0; cell < this.owner.length; cell += 1) {
      if (this.owner[cell] !== part.index || this.paint[cell]) continue;
      const here = { x: (cell % WIDE) + 0.5, y: Math.floor(cell / WIDE) + 0.5 };
      if (!best || gap(here, middle) < gap(best, middle)) best = here;
    }
    return best;
  }

  /** The star stamp: the open hand held still for a moment prints a star, and it has to move on to print another. */
  stamp(at, dt) {
    this.brush.down = false;
    this.brush.at = null;
    const now = this.stamping;
    if (!now || gap(now.anchor, at) > EXTRAS.stampStill) {
      this.stamping = { anchor: { x: at.x, y: at.y }, for: 0, printed: false };
      return;
    }
    if (now.printed) return;
    now.for += dt;
    if (now.for < EXTRAS.stampSeconds) return;
    now.printed = true;
    const star = { id: this.stats.stamps, x: now.anchor.x, y: now.anchor.y, turn: ((this.stats.stamps * 47) % 60) - 30, colour: COLOUR_NAMES[(this.stats.stamps * 2) % (COLOUR_NAMES.length - 1)] };
    this.stats.stamps += 1;
    this.stamps.push(star);
    if (this.stamps.length > EXTRAS.stampsMost) this.stamps.shift();
    this.onEvent({ type: 'stamp', star });
  }

  /** The strokes painted since this was last asked, for the screen to draw: each { x0, y0, x1, y1, r, colour, phase, parts }. */
  takeMarks() {
    const { marks } = this;
    this.marks = [];
    return marks;
  }

  /* ---------- with friends, painting the same sheet ---------- */

  /** Keeps a stroke the child painted, to send: a run of points with the same paint, size and part. */
  note(from, to, radius, colour, lock) {
    const [g, c, r] = [lock, INDEX.get(colour), round1(radius)];
    const here = [round1(from.x), round1(from.y)];
    const there = [round1(to.x), round1(to.y)];
    const last = this.outbox.at(-1);
    // A run goes on while it's the same paint, size and part, from where the last stroke ended, up to a length.
    if (last && last.g === g && last.c === c && last.r === r && last.points.length < RUN_NUMBERS && last.points.at(-2) === here[0] && last.points.at(-1) === here[1]) {
      last.points.push(...there);
      this.outboxNumbers += 2;
    } else {
      this.outbox.push({ g, c, r, points: [...here, ...there] });
      this.outboxNumbers += 8;
    }
    // A connection that's down for a long while can't hold everything: the oldest goes, and friends hear which
    // parts are done all the same.
    while (this.outboxNumbers > OUTBOX_MOST && this.outbox.length > 1) this.outboxNumbers -= this.outbox.shift().points.length + 4;
  }

  /**
   * The strokes to send, as one flat list of numbers, no more than most of them: for each run, the part it's
   * kept to (or -1 for every part that takes the paint), the paint, the brush's size, how many points, and the
   * points, x then y. What doesn't fit waits for next time, starting from the last point sent.
   */
  takeStrokes(most = STROKE_NUMBERS) {
    const numbers = [];
    while (this.outbox.length) {
      const run = this.outbox[0];
      const room = Math.floor((most - numbers.length - 4) / 2);
      if (room < 2) break;
      const count = Math.min(room, run.points.length / 2);
      numbers.push(run.g, run.c, run.r, count, ...run.points.slice(0, count * 2));
      if (count * 2 >= run.points.length) {
        this.outbox.shift();
        this.outboxNumbers -= run.points.length + 4;
      } else {
        run.points = run.points.slice((count - 1) * 2);
        this.outboxNumbers -= (count - 1) * 2;
      }
    }
    return numbers;
  }

  /** Strokes from a friend's game, as takeStrokes made them. Anything that isn't a stroke on this sheet is left out. */
  friendStrokes(numbers) {
    if (!Array.isArray(numbers) || this.done) return;
    let at = 0;
    const touched = new Set();
    while (at + 4 <= numbers.length) {
      const [g, c, r, count] = numbers.slice(at, at + 4);
      at += 4;
      if (!Number.isInteger(count) || count < 1 || at + count * 2 > numbers.length) break;
      const points = numbers.slice(at, at + count * 2);
      at += count * 2;
      const colour = COLOUR_NAMES[c];
      const lock = Number.isInteger(g) && g >= 0 && this.parts[g]?.kind !== 'paper' && g < this.parts.length ? g : -1;
      if (!colour || !(r > 0 && r <= 40) || (g >= 0 && lock < 0) || points.some((value) => typeof value !== 'number' || !Number.isFinite(value))) continue;
      for (let i = 0; i < count; i += 1) {
        const to = { x: points[i * 2], y: points[i * 2 + 1] };
        const from = i === 0 ? to : { x: points[i * 2 - 2], y: points[i * 2 - 1] };
        if (i === 0 && count > 1) continue;
        for (const index of this.strokeTo(from, to, r, colour, lock)) touched.add(index);
      }
    }
    this.settle(touched, false);
  }

  /** Which parts are done, as one number, a bit for each, for friends to hear. */
  doneBits() {
    return this.parts.reduce((bits, part) => (part.done && part.kind !== 'paper' ? bits + 2 ** part.index : bits), 0);
  }

  /** A friend's game says these parts are done: they are here too, even if some of their strokes never came. */
  learnDone(bits) {
    if (!Number.isFinite(bits) || bits <= 0) return;
    for (const part of this.toPaint) if (!part.done && Math.floor(bits / 2 ** part.index) % 2 === 1) this.finish(part, false);
  }

  /** The server says whose stroke finished part k: it counts for them, on every computer, and it's done here too. */
  claimed(k, by) {
    const part = this.parts[k];
    if (!part || part.kind === 'paper' || this.owners.has(k)) return;
    this.owners.set(k, by);
    this.tally.set(by, (this.tally.get(by) ?? 0) + 1);
    this.finish(part, false);
  }

  /**
   * Together, a part can be finished on each sheet by the other child's strokes as they arrive, so that on neither
   * was it the child's own stroke that finished it, and nobody claims it. A part that's done and still nobody's after
   * a moment is claimed by each game whose child painted some of it, and the server gives it to the first.
   */
  claimLeftovers(dt) {
    if (!this.shared) return;
    for (const part of this.toPaint) {
      if (!part.done || part.claimed || !part.painted || this.owners.has(part.index)) continue;
      part.unclaimedFor += dt;
      if (part.unclaimedFor >= CLAIM_LATE) {
        part.claimed = true;
        this.shared.claim(part.index);
      }
    }
  }

  /* ---------- for the tests and the films, which play as a child would ---------- */

  /**
   * Where a child would take their hand next from at: to the big brush if it's lying there, to what's nearest still
   * to paint with the paint on the brush, or to the pot, or the dish, for a paint that's needed. Returns { x, y,
   * why }, why being 'roller', 'paint', 'pot' or 'dish', or null once the picture is done.
   */
  guide(at = { x: WIDE / 2, y: HIGH / 2 }) {
    if (this.done) return null;
    if (this.roller && !this.roller.taken) return { x: this.roller.x, y: this.roller.y, why: 'roller' };
    const { brush } = this;
    const spot = brush.tool === 'paint' ? this.nearestToPaint(at, brush.colour) : null;
    if (spot) return { ...spot, why: 'paint' };
    // Nothing more for this paint: the one for the part with the most still to do, then.
    const part = this.toPaint.filter((each) => !each.done).sort((a, b) => b.cells - b.covered - (a.cells - a.covered))[0];
    if (!part) return null;
    const wanted = part.colour ?? this.pots.find((pot) => pot.kind === 'colour' && pot.ready).colour;
    const pot = this.pots.find((each) => each.kind === 'colour' && each.ready && each.colour === wanted);
    if (pot) return { x: pot.x, y: pot.y, why: 'pot' };
    // It has to be mixed: one paint into the dish, and then the other.
    const dish = this.pots.find((each) => each.kind === 'dish');
    const recipe = recipeFor(wanted);
    if (!dish || !recipe) return null;
    const next = dish.holds === recipe[0] ? recipe[1] : dish.holds === recipe[1] ? recipe[0] : recipe[0];
    if (brush.tool === 'paint' && brush.colour === next) return { x: dish.x, y: dish.y, why: 'dish' };
    const base = this.pots.find((each) => each.kind === 'colour' && each.ready && each.colour === next);
    return base ? { x: base.x, y: base.y, why: 'pot' } : null;
  }

  /**
   * The nearest square still to paint with a paint. A hand led there never quite gets to it: the brush paints it
   * on the way, and the next nearest is a little further on, so the hand sweeps along the edge of what's painted.
   * With free painting it finishes the part it's in first.
   */
  nearestToPaint(at, colour) {
    const mine = (part) => part.kind !== 'paper' && !part.done && (this.rule === 'free' || part.kind === 'free' || part.colour === colour);
    const staying = this.rule === 'free' && this.lock >= 0 && mine(this.parts[this.lock]) ? this.lock : -1;
    let nearest = null;
    let best = Infinity;
    for (let cell = 0; cell < this.owner.length; cell += 1) {
      const index = this.owner[cell];
      if (index < 0 || this.paint[cell] || (staying >= 0 ? index !== staying : !mine(this.parts[index]))) continue;
      const [x, y] = [(cell % WIDE) + 0.5, Math.floor(cell / WIDE) + 0.5];
      const far = Math.hypot(x - at.x, y - at.y);
      if (far < best) {
        best = far;
        nearest = { x, y, part: index };
      }
    }
    return nearest;
  }
}
