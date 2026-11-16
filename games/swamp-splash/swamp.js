// Swamp Splash: the child jumps, and their character lands in the swamp with a splash that throws mud on the
// screen, as if it were a window: the bigger the jump, the more mud. The game is to get the window muddy enough
// before the rain cloud that's coming across the sky gets here, and washes it clean.
//
// What can be lost is the mud: if the cloud arrives first, it rains, the window is washed, and the level is to
// be tried again. A grown-up can have the gentle swamp, where no rain cloud comes. With nobody in the picture
// the cloud waits, and so does everything else.
//
// The window is counted in squares, GRID.wide by GRID.high: a square is muddy or it isn't, and how much of the
// window is muddy is how many of them are. The rules are here, with no screen, so they run in the unit tests.
// main.js says when a jump has landed and how big it was, and view.js draws what this says.
import { clampLevel } from '../../core/levels.js';

export const GRID = { wide: 32, high: 18 };
const CELLS = GRID.wide * GRID.high;

// How much of the window a jump's mud covers, as a share of it. size is how big the jump was: 1 is the smallest
// that counts as a jump at all, and bigAt is a jump that many times as high, which is a big one.
export const SPLASH = {
  small: 0.03,
  big: 0.11,
  bigAt: 2.2,
  counts: 1.6, // From this size up a jump is a big one, for the frogs and for golden mud.
  tries: 10, // How many places are looked at for a splat, to find the one with the most clean window in it.
};

// How much of the window has to be muddy to win, and how long the rain cloud takes to arrive, at levels 1 to 10.
const TARGETS = [0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85];
const SECONDS = [80, 80, 75, 75, 70, 70, 65, 65, 60, 60];

// What the levels bring, and from which level.
export const FROGS = { from: 2, share: 0.022, counts: [1, 1, 1, 1, 2, 2, 2, 3, 3] }; // How many frogs, from level 2.
export const SQUAT = { from: 3, more: 1.5, within: 1.4 }; // Knees bent this long before a jump at most.
export const SHOWER = { from: 4, every: [24, 16], wide: 5, warning: 3 }; // A strip this many squares wide.
export const BUBBLE = { from: 5, every: 9, grows: 2, big: 3, more: 2 }; // Seconds growing, and then big.
export const HERON = { from: 6, every: 17, coming: 4, reach: 4.2 }; // A patch this many squares round.
export const GOLD = { from: 7, row: 3 }; // Big jumps in a row for golden mud.
export const STAR = { from: 8, share: 0.035 }; // What each corner gets from a star jump.
export const WIND = { from: 9, every: [2.2, 1.4], takes: 2 }; // Seconds between flakes, and squares in each.
export const CUP = { from: 10 };

// What each level brings that's new, for the title card, the countdown and the finish card.
export const NEW_THINGS = {
  2: [{ id: 'frog', mark: '🐸', name: 'Frogs that jump when you jump big', nameKa: 'ბაყაყები, რომლებიც შენთან ერთად ხტებიან' }],
  3: [{ id: 'squat', mark: '🦵', name: 'Bend your knees first for a super splash', nameKa: 'ჯერ მუხლები მოხარე: სუპერ ჭყაპი' }],
  4: [{ id: 'shower', mark: '🌦️', name: 'A shower that washes a strip clean', nameKa: 'წვიმა, რომელიც ზოლს რეცხავს' }],
  5: [{ id: 'bubble', mark: '🫧', name: 'Mud bubbles: land when one is big', nameKa: 'ტალახის ბუშტები: დიდზე დახტი' }],
  6: [{ id: 'heron', mark: '🪶', name: 'The heron wipes the window: a jump scares it off', nameKa: 'ყანჩა ფანჯარას წმენდს: ახტი და დააფრთხე' }],
  7: [{ id: 'gold', mark: '⭐', name: 'Three big jumps in a row: golden mud', nameKa: 'სამი დიდი ნახტომი ზედიზედ: ოქროს ტალახი' }],
  8: [{ id: 'star', mark: '✨', name: 'A star jump throws mud to every corner', nameKa: 'ვარსკვლავა ნახტომი ტალახს ყველა კუთხეში ისვრის' }],
  9: [{ id: 'wind', mark: '💨', name: 'The wind dries the mud: keep jumping', nameKa: 'ქარი ტალახს აშრობს: არ გაჩერდე' }],
  10: [{ id: 'cup', mark: '🏆', name: 'The muddiest window of all wins the cup', nameKa: 'ყველაზე ტალახიანი ფანჯარა თასს იგებს' }],
};

/** What's new at a level, as the cards want it. */
export const newAt = (level) => NEW_THINGS[clampLevel(level)] ?? [];

/** A number that goes from one end to the other between the level something starts at and level 10. */
const since = (level, first, [from, to]) => from + ((to - from) * Math.max(0, level - first)) / Math.max(1, 10 - first);

/** How a level is played. gentle is the swamp where no rain cloud comes. */
export function swampLevel(level, { gentle = false } = {}) {
  const at = clampLevel(level);
  return {
    level: at,
    target: TARGETS[at - 1],
    seconds: gentle ? Infinity : SECONDS[at - 1],
    frogs: at >= FROGS.from ? FROGS.counts[at - FROGS.from] : 0,
    squat: at >= SQUAT.from,
    shower: at >= SHOWER.from ? since(at, SHOWER.from, SHOWER.every) : null,
    bubble: at >= BUBBLE.from,
    heron: at >= HERON.from,
    gold: at >= GOLD.from,
    star: at >= STAR.from,
    wind: at >= WIND.from ? since(at, WIND.from, WIND.every) : null,
    cup: at >= CUP.from,
  };
}

/** How much of the window a jump of some size covers, before anything a level adds to it. */
export function splashShare(size) {
  const share = Math.min(1, Math.max(0, (size - 1) / (SPLASH.bigAt - 1)));
  return SPLASH.small + (SPLASH.big - SPLASH.small) * share;
}

export class Swamp {
  /** gentle is the grown-ups' choice: see swampLevel. onEvent hears what happens, as { type, ... }. */
  constructor({ level = 1, gentle = false, random = Math.random, onEvent = () => {} } = {}) {
    this.rules = swampLevel(level, { gentle });
    this.levelNumber = this.rules.level;
    this.random = random;
    this.onEvent = onEvent;
    this.state = 'ready'; // ready, play, won, lost
    this.mud = new Uint8Array(CELLS); // 0 is clean, 1 is muddy, 2 is golden mud.
    this.muddy = 0;
    this.time = 0; // Seconds played with the child in the picture, which is what the rain cloud goes by.
    this.bent = Infinity; // How long ago the knees were bent.
    this.row = 0; // Big jumps in a row.
    this.golden = false; // Whether the next splat is golden.
    this.shower = this.rules.shower ? { in: this.rules.shower, at: null } : null;
    this.bubble = this.rules.bubble ? { in: BUBBLE.every, age: null } : null;
    this.heron = this.rules.heron ? { in: HERON.every, coming: null, at: null } : null;
    this.wind = this.rules.wind ? { in: this.rules.wind } : null;
    this.stats = { jumps: 0, big: 0, biggest: 0, supers: 0, frogs: 0, bubbles: 0, herons: 0, wiped: 0, stars: 0, starJumps: 0, showers: 0, seconds: 0, cup: false };
  }

  /** How much of the window is muddy, from 0 to 1. */
  get coverage() {
    return this.muddy / CELLS;
  }

  /** How far the rain cloud has come, from 0 as it sets off to 1 when it's here. Always 0 in the gentle swamp. */
  get cloud() {
    return Number.isFinite(this.rules.seconds) ? Math.min(1, this.time / this.rules.seconds) : 0;
  }

  /** Whether a mud bubble is up and big enough to land on. */
  get bubbleBig() {
    return Boolean(this.bubble && this.bubble.age !== null && this.bubble.age >= BUBBLE.grows);
  }

  /** The countdown is over. */
  begin() {
    if (this.state === 'ready') this.state = 'play';
  }

  /** The child has bent their knees: a jump soon after is a super splash, from the level that brings it. */
  squat() {
    if (this.state === 'play' && this.rules.squat) this.bent = 0;
  }

  /** The squares within reach of a place, in squares, with a ragged edge so that no splat is a neat round. */
  blob(cx, cy, reach) {
    const cells = [];
    const turn = this.random() * 7;
    for (let y = Math.max(0, Math.floor(cy - reach - 1)); y <= Math.min(GRID.high - 1, Math.ceil(cy + reach + 1)); y += 1) {
      for (let x = Math.max(0, Math.floor(cx - reach - 1)); x <= Math.min(GRID.wide - 1, Math.ceil(cx + reach + 1)); x += 1) {
        const [dx, dy] = [x + 0.5 - cx, y + 0.5 - cy];
        const ragged = reach * (1 + 0.16 * Math.sin(Math.atan2(dy, dx) * 5 + turn));
        if (Math.hypot(dx, dy) <= ragged) cells.push(y * GRID.wide + x);
      }
    }
    return cells;
  }

  /**
   * Mud lands on the window: as much as share of it, round a place, or where the window is cleanest. Returns
   * how many squares are newly muddy.
   */
  splat(share, { at = null, kind = 'jump' } = {}) {
    const reach = Math.sqrt((share * CELLS) / Math.PI);
    let best = null;
    const tries = at ? 1 : SPLASH.tries;
    for (let n = 0; n < tries; n += 1) {
      const centre = at ?? { x: reach * 0.6 + this.random() * (GRID.wide - reach * 1.2), y: reach * 0.6 + this.random() * (GRID.high - reach * 1.2) };
      const cells = this.blob(centre.x, centre.y, reach);
      const fresh = cells.filter((cell) => !this.mud[cell]).length;
      if (!best || fresh > best.fresh) best = { centre, cells, fresh };
    }
    const colour = this.golden ? 2 : 1;
    const golden = this.golden;
    this.golden = false;
    for (const cell of best.cells) {
      if (!this.mud[cell]) this.muddy += 1;
      // Golden mud shows over plain mud, and plain mud never covers gold.
      this.mud[cell] = Math.max(this.mud[cell], colour);
    }
    this.onEvent({ type: 'splat', kind, x: best.centre.x / GRID.wide, y: best.centre.y / GRID.high, reach: reach / GRID.high, cells: best.cells, fresh: best.fresh, golden });
    if (golden) {
      this.stats.stars += 1;
      this.onEvent({ type: 'star' });
    }
    return best.fresh;
  }

  /** Squares are washed, wiped or dried clean. Returns how many were muddy. */
  clean(cells, why) {
    const was = cells.filter((cell) => this.mud[cell]);
    for (const cell of was) this.mud[cell] = 0;
    this.muddy -= was.length;
    if (was.length) this.onEvent({ type: 'clean', why, cells: was });
    return was.length;
  }

  /**
   * A jump has landed. size is how big it was: 1 is the smallest that counts, and more is higher. star is
   * whether it was a star jump, arms and legs out.
   */
  land(size, { star = false } = {}) {
    if (this.state !== 'play') return;
    const { rules, stats } = this;
    const big = size >= SPLASH.counts;
    stats.jumps += 1;
    stats.biggest = Math.max(stats.biggest, size);
    if (big) stats.big += 1;
    let share = splashShare(size);
    // Knees bent first, and a mud bubble landed on, each make it more.
    const bent = rules.squat && this.bent <= SQUAT.within;
    if (bent) {
      share *= SQUAT.more;
      stats.supers += 1;
    }
    this.bent = Infinity;
    const popped = this.bubbleBig;
    if (popped) {
      share *= BUBBLE.more;
      stats.bubbles += 1;
      this.bubble = { in: BUBBLE.every, age: null };
      this.onEvent({ type: 'pop' });
    }
    this.onEvent({ type: 'land', size, big, bent, popped, star });

    // Three big jumps in a row turn the next mud to gold. A small one starts the count again.
    if (rules.gold) {
      this.row = big ? this.row + 1 : 0;
      if (this.row >= GOLD.row) {
        this.row = 0;
        this.golden = true;
      }
    }
    this.splat(Math.min(0.4, share));
    // A star jump throws mud to every corner as well.
    if (star && rules.star) {
      stats.starJumps += 1;
      const reach = Math.sqrt((STAR.share * CELLS) / Math.PI);
      for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        this.splat(STAR.share, { at: { x: x ? GRID.wide - reach * 0.7 : reach * 0.7, y: y ? GRID.high - reach * 0.7 : reach * 0.7 }, kind: 'corner' });
      }
    }
    // The frogs jump with a big jump, and each throws a little mud of its own.
    if (big) {
      for (let frog = 0; frog < rules.frogs; frog += 1) {
        stats.frogs += 1;
        this.onEvent({ type: 'frog', frog });
        this.splat(FROGS.share, { kind: 'frog' });
      }
    }
    // A jump while the heron is on its way scares it off.
    if (this.heron && this.heron.coming !== null) {
      stats.herons += 1;
      this.heron = { in: HERON.every, coming: null, at: null };
      this.onEvent({ type: 'scared' });
    }
    this.check();
  }

  /** Muddy enough is the game won, there and then. */
  check() {
    if (this.state !== 'play' || this.coverage < this.rules.target) return;
    this.state = 'won';
    if (this.rules.cup) {
      this.stats.cup = true;
      this.onEvent({ type: 'cup' });
    }
    this.onEvent({ type: 'won' });
  }

  /** One frame. seen is whether the child is in the picture: with nobody there, everything waits. */
  update(dt, { seen = false } = {}) {
    if (this.state !== 'play' || !seen) return;
    this.time += dt;
    this.stats.seconds += dt;
    this.bent += dt;
    if (this.shower) this.rain(dt);
    if (this.bubble) this.swell(dt);
    if (this.heron) this.fly(dt);
    if (this.wind) this.dry(dt);
    // The rain cloud is here: it washes the window, and that's the level lost.
    if (this.cloud >= 1) {
      this.clean([...this.mud.keys()], 'rain');
      this.state = 'lost';
      this.onEvent({ type: 'lost' });
    }
  }

  /** A shower: a little cloud is seen coming over one strip of the window, and then washes it. */
  rain(dt) {
    const { shower } = this;
    shower.in -= dt;
    if (shower.at === null && shower.in <= SHOWER.warning) {
      // Over the muddiest strip, so that it always washes something.
      let [best, most] = [0, -1];
      for (let from = 0; from <= GRID.wide - SHOWER.wide; from += 1) {
        let count = 0;
        for (let y = 0; y < GRID.high; y += 1) for (let x = from; x < from + SHOWER.wide; x += 1) count += this.mud[y * GRID.wide + x] ? 1 : 0;
        // The same among strips as muddy as each other, by chance, so it isn't always the first.
        if (count > most || (count === most && this.random() < 0.3)) [best, most] = [from, count];
      }
      shower.at = best;
      this.onEvent({ type: 'shower-coming', from: best / GRID.wide, wide: SHOWER.wide / GRID.wide });
    }
    if (shower.in > 0) return;
    const cells = [];
    for (let y = 0; y < GRID.high; y += 1) for (let x = shower.at; x < shower.at + SHOWER.wide; x += 1) cells.push(y * GRID.wide + x);
    this.stats.showers += 1;
    this.onEvent({ type: 'shower', from: shower.at / GRID.wide, wide: SHOWER.wide / GRID.wide });
    this.clean(cells, 'shower');
    this.shower = { in: this.rules.shower, at: null };
  }

  /** A mud bubble comes up, grows, stays big for a while, and sinks again if nobody lands on it. */
  swell(dt) {
    const { bubble } = this;
    if (bubble.age === null) {
      bubble.in -= dt;
      if (bubble.in > 0) return;
      bubble.age = 0;
      this.onEvent({ type: 'bubble' });
      return;
    }
    bubble.age += dt;
    if (bubble.age >= BUBBLE.grows + BUBBLE.big) {
      this.bubble = { in: BUBBLE.every, age: null };
      this.onEvent({ type: 'sunk' });
    }
  }

  /** The heron: it's seen coming to one part of the window, and wipes it clean unless a jump scares it off. */
  fly(dt) {
    const { heron } = this;
    if (heron.coming === null) {
      heron.in -= dt;
      if (heron.in > 0 || this.muddy === 0) return;
      // To the middle of a muddy part, so that there's something there to wipe.
      const muddy = [...this.mud.keys()].filter((cell) => this.mud[cell]);
      const cell = muddy[Math.floor(this.random() * muddy.length)];
      heron.at = { x: (cell % GRID.wide) + 0.5, y: Math.floor(cell / GRID.wide) + 0.5 };
      heron.coming = HERON.coming;
      this.onEvent({ type: 'heron', x: heron.at.x / GRID.wide, y: heron.at.y / GRID.high, seconds: HERON.coming });
      return;
    }
    heron.coming -= dt;
    if (heron.coming > 0) return;
    const wiped = this.clean(this.blob(heron.at.x, heron.at.y, HERON.reach), 'heron');
    this.stats.wiped += wiped;
    this.onEvent({ type: 'wiped', x: heron.at.x / GRID.wide, y: heron.at.y / GRID.high });
    this.heron = { in: HERON.every, coming: null, at: null };
  }

  /** The wind dries the mud: every so often a few squares of it flake off. */
  dry(dt) {
    this.wind.in -= dt;
    if (this.wind.in > 0) return;
    this.wind.in = this.rules.wind;
    const muddy = [...this.mud.keys()].filter((cell) => this.mud[cell]);
    if (!muddy.length) return;
    const first = muddy[Math.floor(this.random() * muddy.length)];
    // The square, and the ones beside it.
    const cells = [first];
    for (let n = 1; n < WIND.takes; n += 1) {
      const next = first + n;
      if (next % GRID.wide !== 0 && next < CELLS) cells.push(next);
    }
    this.clean(cells, 'wind');
  }
}
