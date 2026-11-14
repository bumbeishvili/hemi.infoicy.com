// The story of The Lighthouse Keeper. A storm has covered the lighthouse windows with mud, and ships
// out at sea can't see the light. Each window the child wipes clean with an open hand brings one of
// them home. There's no screen in this file, so it runs in the unit tests.
//
// With friends, everyone wipes the same windows, each on their own computer. Every game has the same
// plain storm, and keeps the patches of mud its child's hand wipes for the game to claim. Each patch is
// whoever's hand wiped it first, which the server decides, and a friend's patches come off the glass
// here too, so every game has the same mud left, and its windows come clean together.
//
// What's at stake, on their own: each ship can only wait so long in the storm. While its window is muddy and
// the camera can see the hand, the ship drifts towards the fog, and if the window isn't clean before it gets
// there, the ship drifts away and the game ends there, kindly (see shipWaits). On Gentle, a grown-up's
// choice, the ships wait as long as it takes, as they always did. With friends the ships always wait, as
// each game would count its own time.
import { clampLevel, ramp, stepsAt } from '../../core/levels.js';

export const SHIPS = [
  { who: 'frost', boat: 'ice', ask: 'Frost here! I can’t see! Wipe the mud off the window!', thanks: 'Safe! Thank you!' },
  { who: 'kit', boat: 'fishing', ask: 'Kit here! I’m lost in the dark! Wipe it clean!', thanks: 'I’m home! You’re the best!' },
  { who: 'widget', boat: 'tin', ask: 'Widget here! Beep! Light my way!', thanks: 'Thank you! Boop!' },
  { who: 'bramble', boat: 'honey', ask: 'Bramble here! The waves are huge! One last window!', thanks: 'Honey for everyone!' },
];

export const CLEAN_ENOUGH = 0.88; // The last bits fall away by themselves after this.
// How the mud on a window is counted: patches, across and down. With friends, these are what's claimed,
// and the server knows how many there are: see WINDOW_PATCHES in server/race-room.js.
export const GRID = { columns: 14, rows: 9 };
export const PATCHES = GRID.columns * GRID.rows;

// Where on the window the storm throws things, as shares of its width and height. Never the corners,
// which may be out of reach.
export const MIDDLE = { left: 0.14, right: 0.86, top: 0.18, bottom: 0.82 };
const SPLAT = { rx: 0.1, ry: 0.15 }; // A splat's size at level 2, as a share of the window.
const LUMP = { rx: 0.075, ry: 0.11 };
const LAST_SPLAT_AT = 0.8; // Every splat has landed by the time this much is clean.

// Treasure: shells hidden in the mud, and pearls and coins from what the storm throws on. Each is
// picked up by the open hand coming near it, and drifts towards a hand that's close.
const PRIZE = { rx: 0.05, ry: 0.07 }; // How big a prize is, as a share of the window, for picking up.
export const PRIZE_READY_SECONDS = 0.4; // A prize pops out for this long before it can be picked up.
const PULL = 2.6; // A prize drifts towards an open hand within this many times its reach.
const PULL_SPEED = 0.45; // In window widths a second.
const CHEST_COINS = 5;
// What each thing the storm put on the glass leaves behind when it comes off.
const LEAVES = { weed: ['shell'], star: ['pearl'], clam: ['pearl'], chest: Array(CHEST_COINS).fill('coin') };
const CRAB = { rx: 0.07, ry: 0.09 };

// Power-ups stuck to the glass, which an open hand picks up. Each lasts this many seconds of wiping:
// they only count down while an open hand is on the glass, so resting never wastes them.
export const POWER_SECONDS = { lantern: 6, bubble: 10 };
export const LANTERN_SCALE = 1.6; // How much bigger a wipe is, with the lantern.
const POWER = { rx: 0.07, ry: 0.1 };
export const POWER_READY_SECONDS = 0.8; // A power-up pops out for this long before it can be picked up.

/**
 * What each level brings that's new, with a picture and a name in each language. The level each
 * comes in is in NEW_AT, and stormAt switches it on there.
 */
export const NEW_THINGS = {
  splats: { mark: '💦', name: 'Mud splats', nameKa: 'ტალახის შხეფები' },
  shells: { mark: '🐚', name: 'Shells', nameKa: 'ნიჟარები' },
  crab: { mark: '🦀', name: 'Crab', nameKa: 'კიბორჩხალა' },
  weed: { mark: '🌿', name: 'Seaweed', nameKa: 'წყალმცენარე' },
  lantern: { mark: '🏮', name: 'Big lantern', nameKa: 'დიდი ფარანი' },
  star: { mark: '⭐', name: 'Starfish', nameKa: 'ზღვის ვარსკვლავი' },
  bubble: { mark: '🫧', name: 'Bubble shield', nameKa: 'ბუშტის ფარი' },
  night: { mark: '🌙', name: 'Night sea', nameKa: 'ღამის ზღვა' },
  clam: { mark: '🦪', name: 'Oyster', nameKa: 'ხამანწკა' },
  gull: { mark: '🐦', name: 'Gull helper', nameKa: 'თოლია მეგობარი' },
  chest: { mark: '🪙', name: 'Treasure chest', nameKa: 'განძის ზანდუკი' },
};

export const NEW_AT = {
  2: ['splats', 'shells'],
  3: ['crab'],
  4: ['weed'],
  5: ['lantern'],
  6: ['star'],
  7: ['bubble', 'night'],
  8: ['clam'],
  9: ['gull'],
  10: ['chest'],
};

// How long a ship waits for its window, in seconds: at level 1 and at level 10, for a medium window, and a
// little more for each thing the storm throws on it, as each takes a moment more. A big window has longer,
// and a small one less, as there's more or less to wipe.
export const WAITS = { base: [50, 16], splat: 3, lump: 5, chest: 4, crab: 0, size: { none: 1.25, little: 1, lots: 0.8 } };

/** How long a ship waits for a window, at a level, with what the storm has planned for it and a size of window. */
export function shipWaits(level, coming = [], size = 'little') {
  const extra = coming.reduce((sum, { what }) => sum + (what === 'splat' ? WAITS.splat : what === 'chest' ? WAITS.chest : ['weed', 'star', 'clam'].includes(what) ? WAITS.lump : 0), 0);
  return ramp(level, WAITS.base[0], WAITS.base[1]) * (WAITS.size[size] ?? 1) + extra;
}

/** What's new at a level, as the title card and the countdown show it. Nothing at level 1. */
export function newAt(level) {
  return (NEW_AT[clampLevel(level)] ?? []).map((key) => ({ key, ...NEW_THINGS[key] }));
}

/**
 * What each level of the storm brings, from 1 to 10. Level 1 is the storm as it always was. Nothing
 * here has a time limit: nothing goes away by itself or can be missed, and it all comes from wiping,
 * so resting brings nothing new. The number of ships and the size of the window are the grown-ups'.
 * Each level brings something new to see and do: see NEW_AT.
 */
export function stormAt(level) {
  return {
    // Mud the waves throw back onto glass that's been wiped, per window: from level 2, and two from 5.
    splats: stepsAt(level, { 1: 0, 2: 1, 5: 2 }),
    // How much of the window is clean when the first one lands: sooner each level.
    splatFrom: ramp(level, 0.6, 0.35),
    // How big a splat is: a little bigger each level.
    splatSize: ramp(level, 1, 1.3),
    // From level 2, shells hidden in each window's mud, which pop out as it's wiped.
    shells: stepsAt(level, { 1: 0, 2: 2, 6: 3 }),
    // From level 3, a crab walks back and forth on the glass with a pearl. Touching it with an open
    // hand makes it let go of the pearl. Two from level 9. It never leaves, so it can't be missed.
    crabs: stepsAt(level, { 1: 0, 3: 1, 9: 2 }),
    // How quickly a crab walks, in window widths a second. Slower than any hand.
    crabSpeed: ramp(level, 0.05, 0.08),
    // What the storm sticks onto each window, taking turns window by window, the newest first:
    // seaweed from level 4, starfish from 6, which creep about, and from 8 oysters, which open for a
    // hand held open on them. A window isn't clean until they're off, and each leaves treasure.
    lumps: stepsAt(level, { 1: [], 4: ['weed'], 6: ['star', 'weed'], 8: ['clam', 'weed', 'star'] }),
    // How much rubbing each needs, in lengths of a wipe: the hand moving over it, open.
    weedRub: ramp(level, 3, 3.5),
    starRub: ramp(level, 4, 5),
    // How quickly a starfish creeps, in window widths a second. Slower than any hand.
    creep: ramp(level, 0.02, 0.04),
    // Seconds an open hand has to be on an oyster or a chest to open it. They add up, however
    // the hand comes and goes, so they're never lost.
    hold: ramp(level, 1, 1.4),
    // A power-up stuck to each window, taking turns, the newest first: a big lantern from level 5,
    // which makes each wipe bigger, a bubble shield from 7, which mud splats bounce off, and from 9 a
    // gull, which flies across and wipes a wide stripe.
    powers: stepsAt(level, { 1: [], 5: ['lantern'], 7: ['bubble', 'lantern'], 9: ['gull', 'bubble', 'lantern'] }),
    // From level 7, it's night: a moon and stars over the sea. Just to look at.
    night: level >= 7,
    // At level 10, the last window has a treasure chest washed onto it, full of coins.
    chest: level >= 10,
    // A wilder sea outside, just to look at.
    swell: ramp(level, 1, 1.3),
  };
}

/**
 * The storm friends share: the host's level, without anything the levels bring that's new, as each of
 * those would need sharing. It's all mud, so the level only makes the sea outside a little wilder.
 */
export function plainStorm(level) {
  return { ...stormAt(level), splats: 0, shells: 0, crabs: 0, lumps: [], powers: [], night: false, chest: false };
}

/** How much of a window has been wiped, in a grid, as a share of its width and height. */
export class Mud {
  constructor(columns = GRID.columns, rows = GRID.rows) {
    this.columns = columns;
    this.rows = rows;
    this.cells = new Uint8Array(columns * rows);
    this.wiped = 0;
  }

  /** Calls back with each cell inside an oval, as (index, x, y). */
  eachIn(x, y, sizeX, sizeY, visit) {
    const { columns, rows } = this;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const dx = ((column + 0.5) / columns - x) / sizeX;
        const dy = ((row + 0.5) / rows - y) / sizeY;
        if (dx * dx + dy * dy <= 1) visit(row * columns + column);
      }
    }
  }

  /**
   * A wipe around a point, with its size given as a share of the window's width and height. Each cell it
   * cleans that wasn't clean already goes into wiped, if there's a list for them.
   */
  wipe(x, y, sizeX, sizeY, wiped = null) {
    let added = 0;
    this.eachIn(x, y, sizeX, sizeY, (index) => {
      if (!this.cells[index]) {
        this.cells[index] = 1;
        added += 1;
        wiped?.push(index);
      }
    });
    this.wiped += added;
    return added;
  }

  /** These cells clean, as when a friend wiped them. Returns the ones that weren't clean already. */
  wipeCells(cells) {
    const added = [];
    for (const index of cells) {
      if (!Number.isInteger(index) || index < 0 || index >= this.cells.length || this.cells[index]) continue;
      this.cells[index] = 1;
      added.push(index);
    }
    this.wiped += added.length;
    return added;
  }

  /** Mud back on, as when a wave throws some. Returns how many cells it covered again. */
  unwipe(x, y, sizeX, sizeY) {
    let covered = 0;
    this.eachIn(x, y, sizeX, sizeY, (index) => {
      if (this.cells[index]) {
        this.cells[index] = 0;
        covered += 1;
      }
    });
    this.wiped -= covered;
    return covered;
  }

  /** The middle of each cell that's clean, as { x, y }. */
  cleanSpots() {
    const spots = [];
    for (let index = 0; index < this.cells.length; index += 1) {
      if (!this.cells[index]) continue;
      spots.push({ x: ((index % this.columns) + 0.5) / this.columns, y: (Math.floor(index / this.columns) + 0.5) / this.rows });
    }
    return spots;
  }

  /** Whether the place at x, y, as shares of the window, has been wiped. */
  isClean(x, y) {
    const column = Math.min(this.columns - 1, Math.max(0, Math.floor(x * this.columns)));
    const row = Math.min(this.rows - 1, Math.max(0, Math.floor(y * this.rows)));
    return Boolean(this.cells[row * this.columns + column]);
  }

  /** The middle of the row with the most mud left on it, between top and bottom, as a share. */
  muddiestRow(top = 0, bottom = 1) {
    let best = { y: 0.5, mud: -1 };
    for (let row = 0; row < this.rows; row += 1) {
      const y = (row + 0.5) / this.rows;
      if (y < top || y > bottom) continue;
      let mud = 0;
      for (let column = 0; column < this.columns; column += 1) mud += this.cells[row * this.columns + column] ? 0 : 1;
      if (mud > best.mud) best = { y, mud };
    }
    return best.y;
  }

  get share() {
    return this.wiped / this.cells.length;
  }
}

/** Whether a point is within reach of a hand of a size, both given as shares of the window. */
const within = (thing, hand, rx, ry, times = 1) => {
  const dx = (thing.x - hand.x) / ((hand.sizeX + rx) * times);
  const dy = (thing.y - hand.y) / ((hand.sizeY + ry) * times);
  return dx * dx + dy * dy <= 1;
};

export class Storm {
  /**
   * ships says how many come in, and level is from 1 to 10. shared is with friends: the plain storm, and
   * the patches the hand wipes are kept for the game to claim (see takeWiped), while a friend's come off
   * with wipePatches. waits false is Gentle: the ships wait for as long as it takes. size is the size of the
   * window, as the grown-ups' reach setting has it, for how long a ship waits.
   */
  constructor({ ships = SHIPS.length, level = 1, shared = false, waits = true, size = 'little', random = Math.random, onEvent = () => {} } = {}) {
    this.levelNumber = clampLevel(level);
    // With friends the ships always wait: see the top of this file.
    this.waits = waits && !shared;
    this.size = size;
    this.waitTotal = Infinity;
    this.waitLeft = Infinity;
    this.drifted = false;
    // Always the last one too, as that's where the story ends.
    this.ships = ships >= SHIPS.length ? SHIPS : [...SHIPS.slice(0, ships - 1), SHIPS.at(-1)];
    this.level = shared ? plainStorm(level) : stormAt(level);
    this.shared = shared;
    this.wiped = []; // With friends, the patches of this window the hand has wiped, waiting to be claimed.
    this.random = random;
    this.onEvent = onEvent;
    this.index = -1;
    this.mud = null;
    this.home = 0;
    this.clean = false;
    this.coming = []; // What this window has still to come, as { at, what }, by how clean it is.
    this.lumps = []; // Seaweed, starfish, oysters and chests on the glass now.
    this.prizes = []; // Shells, pearls and coins, hidden in the mud or out on the glass.
    this.crabs = []; // Crabs walking on the glass, each with a pearl.
    this.powers = []; // Power-ups stuck to the glass, waiting for a hand.
    this.active = { lantern: 0, bubble: 0 }; // Seconds of wiping left with each power-up.
    this.treasure = 0; // How many prizes have been picked up.
    this.lastWipe = null;
    this.stats = { splats: 0, lumps: 0, bounced: 0, crabs: 0, powers: 0, prizes: 0, shells: 0, pearls: 0, coins: 0 };
  }

  get ship() {
    return this.ships[this.index] ?? null;
  }

  get over() {
    return this.index >= this.ships.length;
  }

  /** How much of the storm has gone, from 0 to 1, as every ship comes home. */
  get calm() {
    return this.home / this.ships.length;
  }

  /** How much bigger a wipe is now: bigger with the lantern. */
  get wipeScale() {
    return this.active.lantern > 0 ? LANTERN_SCALE : 1;
  }

  emit(type, details = {}) {
    this.onEvent({ type, ...details });
  }

  nextShip() {
    this.index += 1;
    if (this.over) {
      this.emit('all-home');
      return;
    }
    this.mud = new Mud();
    this.clean = false;
    // Never another window's: they're taken every frame, and none are left by the time the next ship comes.
    this.wiped = [];
    this.lumps = [];
    this.crabs = [];
    this.powers = [];
    this.prizes = this.hideShells();
    this.lastWipe = null;
    this.coming = this.plan(this.index);
    this.waitTotal = this.waits ? shipWaits(this.levelNumber, this.coming, this.size) : Infinity;
    this.waitLeft = this.waitTotal;
    this.emit('ship', { ship: this.ship, index: this.index, total: this.ships.length });
  }

  /** Shells hidden in the new mud, in the middle of the window and apart from each other. */
  hideShells() {
    const shells = [];
    for (let tries = 0; shells.length < this.level.shells && tries < 200; tries += 1) {
      const x = MIDDLE.left + 0.04 + this.random() * (MIDDLE.right - MIDDLE.left - 0.08);
      const y = MIDDLE.top + 0.04 + this.random() * (MIDDLE.bottom - MIDDLE.top - 0.08);
      if (shells.every((other) => Math.hypot(other.x - x, other.y - y) >= 0.25)) shells.push(this.makePrize('shell', x, y, { hidden: true }));
    }
    return shells;
  }

  makePrize(kind, x, y, { hidden = false } = {}) {
    return { kind, x, y, hidden, age: 0 };
  }

  /** What the storm throws at this window, and when, by how much of it is clean. */
  plan(index) {
    const { splats, splatFrom, lumps, crabs, powers, chest } = this.level;
    const coming = [];
    for (let i = 0; i < splats; i += 1) {
      coming.push({ at: splats === 1 ? splatFrom : splatFrom + ((LAST_SPLAT_AT - splatFrom) * i) / (splats - 1), what: 'splat' });
    }
    if (lumps.length) {
      // Halfway between the splats, or about halfway through if there's only the one.
      const at = splats > 1 ? (coming[0].at + coming[1].at) / 2 : (splatFrom + LAST_SPLAT_AT) / 2 - 0.05;
      coming.push({ at, what: lumps[index % lumps.length] });
    }
    for (let i = 0; i < crabs; i += 1) coming.push({ at: 0.1 + i * 0.3, what: 'crab' });
    if (powers.length) coming.push({ at: 0.25, what: powers[index % powers.length] });
    if (chest && index === this.ships.length - 1) coming.push({ at: 0.5, what: 'chest' });
    return coming.sort((a, b) => a.at - b.at);
  }

  /**
   * A wipe, as in Mud.wipe, with moved saying how far the hand went in it, in lengths of a wipe, which
   * is what rubs seaweed and starfish off. It returns how much mud it cleaned, and says when the
   * window is clean enough. byHand is false for the gull's wipe, which isn't where the hand is, so
   * what lands on the glass still lands away from the hand.
   */
  wipe(x, y, sizeX, sizeY, moved = 0, { byHand = true } = {}) {
    if (!this.mud || this.clean) return 0;
    const added = this.mud.wipe(x, y, sizeX, sizeY, this.shared ? this.wiped : null);
    if (byHand) this.lastWipe = { x, y };
    if (moved > 0) this.rub(x, y, sizeX, sizeY, moved);
    this.afterWipe();
    return added;
  }

  /**
   * With friends: the patches of this window the hand has wiped since this was last asked, as { w, c }, w
   * being which window. The game asks every frame, so they're always this window's.
   */
  takeWiped() {
    const c = this.wiped;
    this.wiped = [];
    return { w: this.index, c };
  }

  /**
   * With friends: patches of this window a friend's hand wiped, as the server says. They're clean here
   * too, and can make the window clean enough. Returns the ones that weren't clean here already.
   */
  wipePatches(cells) {
    if (!this.mud || this.clean) return [];
    const added = this.mud.wipeCells(cells);
    if (added.length) this.afterWipe();
    return added;
  }

  /** What follows a wipe: what it uncovers, what the storm throws as the window gets cleaner, and whether it's clean. */
  afterWipe() {
    for (const prize of this.prizes) {
      if (prize.hidden && this.mud.isClean(prize.x, prize.y)) {
        prize.hidden = false;
        prize.age = 0;
        this.emit('prize-out', { prize });
      }
    }
    while (this.coming.length && this.mud.share >= this.coming[0].at && this.mud.share < CLEAN_ENOUGH) {
      const { what } = this.coming.shift();
      if (what === 'splat') this.splat();
      else if (what === 'crab') this.addCrab();
      else if (what in POWER_SECONDS || what === 'gull') this.addPower(what);
      else this.addLump(what);
    }
    this.checkClean();
  }

  rub(x, y, sizeX, sizeY, moved) {
    for (const lump of this.lumps) {
      if (lump.kind === 'clam' || lump.kind === 'chest') continue; // These open for a hand held on them.
      const dx = (lump.x - x) / (sizeX + lump.rx);
      const dy = (lump.y - y) / (sizeY + lump.ry);
      if (dx * dx + dy * dy > 1) continue;
      lump.rubbed += moved;
      if (lump.rubbed >= lump.needs) this.lumpOff(lump);
    }
  }

  /** Seaweed, a starfish, an oyster or a chest coming off the glass, leaving its treasure there. */
  lumpOff(lump) {
    this.lumps = this.lumps.filter((other) => other !== lump);
    this.stats.lumps += 1;
    this.emit('lump-off', { lump });
    const kinds = LEAVES[lump.kind] ?? [];
    kinds.forEach((kind, i) => {
      const angle = (i / kinds.length) * Math.PI * 2;
      const spread = kinds.length > 1 ? 0.07 : 0;
      const prize = this.makePrize(kind, lump.x + Math.cos(angle) * spread, lump.y + Math.sin(angle) * spread * 1.4);
      this.prizes.push(prize);
      this.emit('prize-out', { prize });
    });
  }

  checkClean() {
    if (this.clean || !this.mud || this.mud.share < CLEAN_ENOUGH || this.lumps.length) return;
    this.clean = true;
    this.coming = [];
    // Nothing on a window is ever missed: the treasure out on the glass, the shells still under the last
    // bits of mud and the pearls the crabs are carrying are all kept for the child as it comes clean.
    // A crab that lets go of its pearl like this walks off the glass, as one that's touched does.
    for (const crab of this.crabs) {
      this.prizes.push(this.makePrize('pearl', crab.x, crab.y));
      this.emit('crab-off', { crab });
    }
    this.crabs = [];
    for (const prize of [...this.prizes]) {
      prize.hidden = false;
      this.collect(prize, { found: true });
    }
    this.emit('window-clean', { ship: this.ship });
  }

  /** Somewhere clean in the middle of the window, away from where the hand is wiping if it can be. */
  spotForSomething({ near = false } = {}) {
    const inMiddle = this.mud.cleanSpots().filter(({ x, y }) => x >= MIDDLE.left && x <= MIDDLE.right && y >= MIDDLE.top && y <= MIDDLE.bottom);
    const from = this.lastWipe ?? { x: 0.5, y: 0.5 };
    // A power-up comes near the hand, so it's easy to pick up, and anything else away from it.
    const choices0 = inMiddle.filter(({ x, y }) => {
      const distance = Math.hypot(x - from.x, y - from.y);
      return near ? distance >= 0.25 && distance <= 0.42 : distance >= 0.3;
    });
    const choices = choices0.length ? choices0 : inMiddle;
    if (!choices.length) return { x: 0.5, y: 0.5 };
    return choices[Math.floor(this.random() * choices.length)];
  }

  splat() {
    const { x, y } = this.spotForSomething();
    const rx = SPLAT.rx * this.level.splatSize;
    const ry = SPLAT.ry * this.level.splatSize;
    this.stats.splats += 1;
    if (this.active.bubble > 0) {
      // The bubble shield: it bounces off, and the glass stays clean.
      this.stats.bounced += 1;
      this.emit('splat-bounced', { x, y, rx, ry });
      return;
    }
    const covered = this.mud.unwipe(x, y, rx, ry);
    this.emit('splat', { x, y, rx, ry, covered });
  }

  addLump(kind) {
    const { x, y } = kind === 'chest' ? { x: 0.5, y: 0.6 } : this.spotForSomething();
    const star = kind === 'star';
    const held = kind === 'clam' || kind === 'chest';
    const big = kind === 'chest' ? 1.35 : 1;
    const lump = {
      kind,
      x,
      y,
      rx: LUMP.rx * big,
      ry: LUMP.ry * big,
      needs: held ? this.level.hold : star ? this.level.starRub : this.level.weedRub,
      rubbed: 0,
      heading: this.random() * Math.PI * 2,
      speed: star ? this.level.creep : 0,
    };
    this.lumps.push(lump);
    this.emit('lump', { lump });
  }

  /** A crab, from one side of the middle, carrying a pearl. */
  addCrab() {
    const fromLeft = this.crabs.length % 2 === 0 ? this.random() < 0.5 : !this.crabs[0].fromLeft;
    const y = MIDDLE.top + 0.1 + this.random() * (MIDDLE.bottom - MIDDLE.top - 0.2);
    const crab = { x: fromLeft ? MIDDLE.left : MIDDLE.right, y, fromLeft, heading: fromLeft ? 1 : -1, speed: this.level.crabSpeed, rx: CRAB.rx, ry: CRAB.ry };
    this.crabs.push(crab);
    this.emit('crab', { crab });
  }

  addPower(kind) {
    const { x, y } = this.spotForSomething({ near: true });
    const power = { kind, x, y, rx: POWER.rx, ry: POWER.ry, age: 0 };
    this.powers.push(power);
    this.emit('power-out', { power });
  }

  /** A prize into the treasure. found says it was collected for the child as a window came clean. */
  collect(prize, { found = false } = {}) {
    this.prizes = this.prizes.filter((other) => other !== prize);
    this.treasure += 1;
    this.stats.prizes += 1;
    this.stats[`${prize.kind}s`] += 1;
    this.emit('prize', { prize, found, treasure: this.treasure });
  }

  /**
   * Every frame. Starfish creep about in the middle of the window, and crabs walk. hand is where the
   * open hand is on the glass, as { x, y, sizeX, sizeY } in shares of the window, or null if there's
   * no open hand on it: it picks up treasure and power-ups, takes the pearl from a crab and opens
   * oysters and chests. still is for anyone who prefers less motion.
   */
  update(dt, { still = false, hand = null } = {}) {
    for (const prize of this.prizes) if (!prize.hidden) prize.age += dt;
    for (const power of this.powers) power.age += dt;
    if (!still) this.creep(dt);
    for (const crab of this.crabs) {
      crab.x += crab.heading * crab.speed * dt * (still ? 0.5 : 1);
      // Back and forth, never off the glass, so a resting child can't miss it.
      if (crab.x < MIDDLE.left || crab.x > MIDDLE.right) crab.heading = crab.x < MIDDLE.left ? 1 : -1;
      crab.x = Math.min(MIDDLE.right, Math.max(MIDDLE.left, crab.x));
    }
    if (!hand || !this.mud || this.clean) return;
    for (const key of Object.keys(this.active)) this.active[key] = Math.max(0, this.active[key] - dt);
    for (const crab of [...this.crabs]) {
      if (!within(crab, hand, crab.rx, crab.ry)) continue;
      this.crabs = this.crabs.filter((other) => other !== crab);
      this.stats.crabs += 1;
      this.emit('crab-caught', { crab });
      const prize = this.makePrize('pearl', crab.x, crab.y);
      this.prizes.push(prize);
      this.emit('prize-out', { prize });
    }
    for (const power of [...this.powers]) {
      if (power.age < POWER_READY_SECONDS || !within(power, hand, power.rx, power.ry)) continue;
      this.powers = this.powers.filter((other) => other !== power);
      this.stats.powers += 1;
      if (power.kind === 'gull') {
        this.emit('gull', { y: this.mud.muddiestRow(MIDDLE.top, MIDDLE.bottom), power });
      } else {
        this.active[power.kind] = POWER_SECONDS[power.kind];
        this.emit('power', { kind: power.kind, power });
      }
    }
    for (const lump of [...this.lumps]) {
      if ((lump.kind !== 'clam' && lump.kind !== 'chest') || !within(lump, hand, lump.rx, lump.ry)) continue;
      lump.rubbed = Math.min(lump.needs, lump.rubbed + dt);
      if (lump.rubbed >= lump.needs) this.lumpOff(lump);
    }
    for (const prize of [...this.prizes]) {
      if (prize.hidden || prize.age < PRIZE_READY_SECONDS) continue;
      if (within(prize, hand, PRIZE.rx, PRIZE.ry)) {
        this.collect(prize);
      } else if (within(prize, hand, PRIZE.rx, PRIZE.ry, PULL)) {
        // Drifting towards the hand that's near it.
        const dx = hand.x - prize.x;
        const dy = hand.y - prize.y;
        const distance = Math.hypot(dx, dy) || 1;
        const step = Math.min(distance, PULL_SPEED * dt);
        prize.x += (dx / distance) * step;
        prize.y += (dy / distance) * step;
      }
    }
    this.checkClean();
  }

  creep(dt) {
    for (const lump of this.lumps) {
      if (!lump.speed) continue;
      lump.heading += Math.sin(lump.x * 9 + lump.y * 7) * dt * 0.8;
      lump.x += Math.cos(lump.heading) * lump.speed * dt;
      lump.y += Math.sin(lump.heading) * lump.speed * dt * 1.6;
      // Turning back at the edge of the middle.
      if (lump.x < MIDDLE.left || lump.x > MIDDLE.right) lump.heading = Math.PI - lump.heading;
      if (lump.y < MIDDLE.top || lump.y > MIDDLE.bottom) lump.heading = -lump.heading;
      lump.x = Math.min(MIDDLE.right, Math.max(MIDDLE.left, lump.x));
      lump.y = Math.min(MIDDLE.bottom, Math.max(MIDDLE.top, lump.y));
    }
  }

  /** How long the ship has still to wait, from 1 as it comes to 0 as it drifts away. Always 1 on Gentle. */
  get waitShare() {
    return Number.isFinite(this.waitTotal) ? this.waitLeft / this.waitTotal : 1;
  }

  /**
   * The ship drifts while its window is muddy. The game only calls this while the window is being played on
   * and the camera can see the hand. When the time runs out, the ship drifts away and the game is over.
   */
  passTime(dt) {
    if (this.drifted || this.clean || !this.mud || !Number.isFinite(this.waitTotal)) return;
    this.waitLeft = Math.max(0, this.waitLeft - dt);
    if (this.waitLeft > 0) return;
    this.drifted = true;
    this.coming = [];
    this.emit('drifted', { ship: this.ship });
  }

  shipHome() {
    this.home += 1;
    this.emit('ship-home', { ship: this.ship, home: this.home });
  }
}
