// Giraffe's World Tour: Giraffe flies round the globe in a little plane, and at each stop the child finds the
// country, colours in its flag, and raises it. A journey is three countries, and each level is another journey.
//
// A stop goes like this. The globe turns to a part of the world where a few countries are lit, and the voice asks
// where one of them is: an open hand held over it for a moment chooses it. Giraffe flies there and lands. The
// country's flag stands in outline, with a pot of each of its paints: dipping the open hand in a pot takes that
// paint, and it goes down where the hand moves, but only on the parts of the flag that are that colour. A part
// that's mostly painted fills itself in. With the flag done, an open hand lifted up sends it up its pole.
//
// What can be lost is the plane's fuel. A country chosen wrongly costs a can of it, and so, from level 5, does a
// gust of wind that finds the flag not held down. With no cans left the journey is over, and is to be tried
// again. A grown-up can have the gentle tour, where there's always fuel.
//
// From level 5 the flag is held with the other hand while it's painted: one hand keeps it still and the other
// does the work, which is what two hands are for. A grown-up can ask for that from the first level, or never:
// then one hand does it all, and meets a gust by staying open on the flag.
//
// The rules are here, with no screen, so they run in the unit tests. main.js says where the hands are and what
// they're over, and view.js draws what this says. Places on a flag are in its own units: see shapes.js.
import { clampLevel } from '../../core/levels.js';
import { apart } from './globe.js';
import { inPart } from './shapes.js';

// Each level's journey, in the order the countries are flown to. The flags get harder to paint as they go.
export const JOURNEYS = {
  1: ['UKR', 'POL', 'DEU'],
  2: ['FRA', 'ITA', 'IRL'],
  3: ['GEO', 'ARM', 'AZE'],
  4: ['SWE', 'FIN', 'NOR'],
  5: ['AUT', 'CZE', 'CHE'],
  6: ['JPN', 'VNM', 'THA'],
  7: ['NGA', 'GHA', 'BWA'],
  8: ['COL', 'PER', 'CHL'],
  9: ['GRC', 'TUR', 'BGR'],
  10: ['CHN', 'ZAF', 'USA', 'GBR'],
};
export const COUNTRIES = Object.values(JOURNEYS).flat();

// The fuel the plane sets off with, in cans, at levels 1 to 10. Infinity on the gentle tour.
const CANS = [5, 5, 5, 4, 4, 4, 4, 3, 3, 3];
// How many countries are lit to choose from, at levels 1 to 10.
const CHOICES = [3, 3, 3, 4, 4, 4, 4, 5, 5, 5];

export const TOUR = {
  dwell: 0.9, // Seconds an open hand has to stay over a country to choose it.
  wrongRest: 1.4, // After a wrong one, before another can be chosen: time to hear which country that was.
  fly: 2.8, // Seconds the plane takes from one country to the next,
  flyWithCan: 4, // or with a fuel can to catch on the way.
  land: 2.4, // Coming down into the country, while its name is said.
  dip: 0.3, // An open hand has to stay in a pot this long to take its paint.
  done: 0.8, // How much of a part has to be painted before it fills itself in.
  brush: 7, // The brush's reach from the middle of the hand, in flag units,
  roller: 12.5, // and the roller's.
  raised: 0.9, // How far up the pole counts as up, as a share of it.
  raiseFrom: 0.4, // The hand has to start from under this far up, to pull the flag up from below.
  settle: 1.6, // After the flag is up, before the plane sets off again.
  peek: 2.5, // Painting from memory: how long the finished flag shows again after a wrong paint,
  wrong: 0.7, // and how long the wrong paint has to be on a part before it does.
};

// How far from the country asked for, in degrees round the globe, the others lit with it can be.
const NEAR = { most: 55, far: 80 };

// The wind, from level 5: seconds of painting between gusts, and how long each is seen coming, at that level and
// at level 10. A hand the camera loses for no longer than loose is still holding the flag.
export const WIND = { from: 5, every: [13, 8], warning: [4, 2.6], loose: 0.45 };
// Painting from memory, from level 7: seconds the finished flag is shown before it's hidden.
export const MEMORY = { from: 7, shown: [6, 3] };

// What each level brings that's new, for the title card, the countdown and the finish card.
export const NEW_THINGS = {
  2: [{ id: 'roller', mark: '🧽', name: 'The roller, for long stripes', nameKa: 'ლილვაკი გრძელი ზოლებისთვის' }],
  3: [{ id: 'stamp', mark: '📮', name: 'A stamp from every country', nameKa: 'მარკა ყველა ქვეყნიდან' }],
  4: [{ id: 'four', mark: '🗺️', name: 'Four countries to choose from', nameKa: 'ოთხი ქვეყანა ასარჩევად' }],
  5: [{ id: 'wind', mark: '💨', name: 'The wind: hold the flag with your other hand', nameKa: 'ქარი: დროშა მეორე ხელით დაიჭირე' }],
  6: [{ id: 'can', mark: '⛽', name: 'A fuel can to catch on the way', nameKa: 'საწვავის ავზი გზაში დასაჭერად' }],
  7: [{ id: 'memory', mark: '🙈', name: 'Paint the flag from memory', nameKa: 'დროშა მეხსიერებით დახატე' }],
  8: [{ id: 'five', mark: '🧭', name: 'Five countries to choose from', nameKa: 'ხუთი ქვეყანა ასარჩევად' }],
  9: [{ id: 'dark', mark: '🔦', name: 'No lights: find the country yourself', nameKa: 'შუქების გარეშე: ქვეყანა თვითონ იპოვე' }],
  10: [{ id: 'cup', mark: '🏆', name: 'Four stops, and the cup', nameKa: 'ოთხი გაჩერება და თასი' }],
};

// The wind for a child who paints with one hand, as a grown-up can choose.
const WIND_ONE_HAND = { name: 'The wind: keep your open hand on the flag', nameKa: 'ქარი: გაშლილი ხელი დროშაზე გეჭიროს' };

/** What's new at a level, as the cards want it. hold is the grown-ups' choice about holding the flag. */
export function newAt(level, { hold = 'later' } = {}) {
  const things = NEW_THINGS[clampLevel(level)] ?? [];
  return things.map((thing) => (thing.id === 'wind' && hold === 'never' ? { ...thing, ...WIND_ONE_HAND } : thing));
}

const ramp = (level, from, to) => from + ((to - from) * (clampLevel(level) - 1)) / 9;
/** A number that goes from one end to the other between the level something starts at and level 10. */
const since = (level, first, [from, to]) => from + ((to - from) * Math.max(0, clampLevel(level) - first)) / Math.max(1, 10 - first);

/**
 * How a level is played. gentle is the tour where fuel never runs out. hold is whether the other hand has to
 * hold the flag while it's painted: 'later' for from level 5, which is how it comes, 'always', or 'never' for
 * one hand doing it all.
 */
export function tourLevel(level, { gentle = false, hold = 'later' } = {}) {
  const at = clampLevel(level);
  return {
    level: at,
    stops: JOURNEYS[at],
    choices: CHOICES[at - 1],
    lights: at < 9,
    cans: gentle ? Infinity : CANS[at - 1],
    roller: at >= 2,
    stamps: at >= 3,
    // Whether the other hand has to hold the flag for paint to go on it.
    holding: hold === 'always' || (hold === 'later' && at >= WIND.from),
    wind: at >= WIND.from ? { every: since(at, WIND.from, WIND.every), warning: since(at, WIND.from, WIND.warning) } : null,
    can: at >= 6,
    memory: at >= MEMORY.from ? since(at, MEMORY.from, MEMORY.shown) : null,
    cup: at >= 10,
    // The plane flies a little quicker as the levels go up, so the tour isn't longer for having more in it.
    fly: ramp(at, 1, 0.8),
  };
}

/**
 * The countries lit for a stop: the one asked for, and the nearest others in the game. Those of this journey that
 * haven't a flag yet come first, as they're the ones being learnt, and those that have one last. places is each
 * country's place, [lon, lat].
 */
export function choicesFor(target, { count, stops, flown, places, random = Math.random }) {
  const others = COUNTRIES.filter((id) => id !== target && places[id]);
  const near = (id) => apart(places[target], places[id]);
  // A country whose flag is up already gives itself away, so it's only lit if there's no other near.
  const rank = (id) => (flown.includes(id) ? 2 : stops.includes(id) ? 0 : 1);
  others.sort((a, b) => rank(a) - rank(b) || near(a) - near(b));
  // Only ones near enough to be well in view with it. A country a long way from the rest, as the United States
  // is, still has its two nearest, a little further round the globe.
  let picked = others.filter((id) => near(id) < NEAR.most).slice(0, count - 1);
  if (picked.length < 2) picked = [...others].sort((a, b) => near(a) - near(b)).filter((id) => near(id) < NEAR.far).slice(0, 2);
  const all = [target, ...picked];
  // In no order that gives the answer away.
  for (let n = all.length - 1; n > 0; n -= 1) {
    const other = Math.floor(random() * (n + 1));
    [all[n], all[other]] = [all[other], all[n]];
  }
  return all;
}

/** A flag being painted: which part each little square of it belongs to, and whether it's painted. */
export class Painting {
  constructor(flag) {
    this.flag = flag;
    // Whole squares only: a flag whose length isn't a whole number, as Norway's isn't, has no square hanging off its end.
    this.wide = Math.floor(flag.wide);
    this.high = 100;
    // The part on top at each square: the last in the flag's list that the square's middle is in.
    this.owner = new Int8Array(this.wide * this.high).fill(-1);
    this.painted = new Uint8Array(this.wide * this.high);
    this.sizes = flag.parts.map(() => 0);
    this.counts = flag.parts.map(() => 0);
    for (let y = 0; y < this.high; y += 1) {
      for (let x = 0; x < this.wide; x += 1) {
        for (let part = flag.parts.length - 1; part >= 0; part -= 1) {
          if (!inPart(flag.parts[part], x + 0.5, y + 0.5)) continue;
          this.owner[y * this.wide + x] = part;
          this.sizes[part] += 1;
          break;
        }
      }
    }
    // A part with nothing of it to be seen has nothing to paint.
    this.done = this.sizes.map((size) => size === 0);
  }

  /** Which part is on top at a place, by its number in the flag's list, or -1 off the flag. */
  partAt(x, y) {
    if (x < 0 || y < 0 || x >= this.wide || y >= this.high) return -1;
    return this.owner[Math.floor(y) * this.wide + Math.floor(x)];
  }

  /** How much of a part is painted, from 0 to 1. */
  share(part) {
    return this.sizes[part] ? this.counts[part] / this.sizes[part] : 1;
  }

  /**
   * Paint goes down round a place, on the parts that take it: takes says which, by their numbers. Returns the
   * parts that got some new paint, the one with the most of it last.
   */
  stroke(x, y, reach, takes) {
    const fresh = new Map();
    const [left, right] = [Math.max(0, Math.floor(x - reach)), Math.min(this.wide - 1, Math.ceil(x + reach))];
    const [top, bottom] = [Math.max(0, Math.floor(y - reach)), Math.min(this.high - 1, Math.ceil(y + reach))];
    for (let row = top; row <= bottom; row += 1) {
      for (let column = left; column <= right; column += 1) {
        const at = row * this.wide + column;
        const part = this.owner[at];
        if (part < 0 || !takes[part] || this.painted[at] || Math.hypot(column + 0.5 - x, row + 0.5 - y) > reach) continue;
        this.painted[at] = 1;
        fresh.set(part, (fresh.get(part) ?? 0) + 1);
      }
    }
    for (const [part, count] of fresh) this.counts[part] += count;
    return [...fresh.keys()].sort((a, b) => fresh.get(a) - fresh.get(b));
  }

  /** A part fills itself in, or loses its paint. */
  fill(part, painted = true) {
    for (let at = 0; at < this.owner.length; at += 1) if (this.owner[at] === part) this.painted[at] = painted ? 1 : 0;
    this.counts[part] = painted ? this.sizes[part] : 0;
    this.done[part] = painted;
  }

  get allDone() {
    return this.done.every(Boolean);
  }

  /** How much of the whole flag is painted, from 0 to 1. */
  get progress() {
    const all = this.sizes.reduce((sum, size) => sum + size, 0);
    return all ? this.counts.reduce((sum, count) => sum + count, 0) / all : 1;
  }
}

export class Tour {
  /**
   * flags is each country's flag (flags.js) and places where each is, [lon, lat]. gentle and hold are the
   * grown-ups' choices: see tourLevel. onEvent hears what happens, as { type, ... }.
   */
  constructor({ level = 1, flags, places, gentle = false, hold = 'later', random = Math.random, onEvent = () => {} } = {}) {
    this.rules = tourLevel(level, { gentle, hold });
    this.levelNumber = this.rules.level;
    this.flags = flags;
    this.places = places;
    this.random = random;
    this.onEvent = onEvent;
    this.stops = this.rules.stops.filter((id) => flags[id] && places[id]);
    this.state = 'ready'; // ready, find, fly, land, paint, raise, settle, won, lost
    this.stop = 0;
    this.flown = []; // The countries whose flags are up.
    this.cans = this.rules.cans;
    this.timer = 0;
    this.choices = [];
    this.out = new Set(); // The lit countries already chosen wrongly at this stop.
    this.over = null; // The country the hand is over, and for how long.
    this.overFor = 0;
    this.rest = 0;
    this.from = null; // Where the plane sets off from, for a flight.
    this.painting = null;
    this.paint = null; // The paint on the hand: a key of the flag's colours.
    this.rollerOn = false;
    this.pot = null;
    this.potFor = 0;
    this.last = null; // The part painted last, which a gust takes the paint from.
    this.hint = null; // What the child is shown to do next: see update.
    this.gust = null; // { in, warned } while the wind blows.
    this.held = false;
    this.loose = 0; // How long the other hand has been off the flag.
    this.wrongFor = 0; // How long the wrong paint has been on a part.
    this.shown = true; // Whether the finished flag is to be seen beside the one being painted.
    this.shownFor = 0;
    this.peeking = false;
    this.raisedTo = 0;
    this.gripped = false;
    this.can = null; // The fuel can on the way: { taken }.
    this.stats = { stops: 0, wrong: 0, parts: 0, gusts: 0, held: 0, lost: 0, stamps: 0, cans: 0, dips: 0, peeks: 0, seconds: 0, cup: false };
  }

  get target() {
    return this.stops[this.stop] ?? null;
  }

  get flag() {
    return this.target ? this.flags[this.target] : null;
  }

  get counted() {
    return Number.isFinite(this.rules.cans);
  }

  /** The countdown is over: the plane is up, and the first country is asked for. */
  begin() {
    if (this.state !== 'ready') return;
    this.ask();
  }

  ask() {
    this.state = 'find';
    this.choices = choicesFor(this.target, { count: this.rules.choices, stops: this.stops, flown: this.flown, places: this.places, random: this.random });
    this.out = new Set();
    this.over = null;
    this.overFor = 0;
    this.rest = 0;
    this.onEvent({ type: 'ask', target: this.target, choices: this.choices });
  }

  /** A can of fuel is gone. With none left, the journey is over. */
  burn(why) {
    if (!this.counted) return false;
    this.cans = Math.max(0, this.cans - 1);
    this.onEvent({ type: 'fuel', cans: this.cans, why });
    if (this.cans > 0) return false;
    this.state = 'lost';
    this.onEvent({ type: 'lost', why });
    return true;
  }

  /**
   * One frame. input is what main.js sees:
   *   seen       whether the hand in play is in the picture, open or closed
   *   open       whether it's open
   *   over       the lit country it's over, or null
   *   brush      where it is on the flag, as { x, y } in flag units (it may be off the flag), or null
   *   pot        the paint pot it's in, as a key of the flag's colours, 'roller' for the roller, or null
   *   holding    whether the other hand is on the flag, holding it
   *   lift       how high it is, from 0 at the bottom of the pole to 1 at the top
   *   onCan      whether it's on the fuel can
   */
  update(dt, input) {
    input ??= {};
    if (this.state === 'ready' || this.state === 'won' || this.state === 'lost') return;
    // The clock only runs with a hand to be seen: a child who's gone away comes back to the tour as they left it.
    if (input.seen) this.stats.seconds += dt;
    if (this.state === 'find') this.find(dt, input);
    else if (this.state === 'fly') this.fly(dt, input);
    else if (this.state === 'land') this.land(dt);
    else if (this.state === 'paint') this.colour(dt, input);
    else if (this.state === 'raise') this.raise(dt, input);
    else if (this.state === 'settle') this.settle(dt);
  }

  find(dt, { open = false, over = null } = {}) {
    if (this.rest > 0) {
      this.rest -= dt;
      this.over = null;
      this.overFor = 0;
      return;
    }
    const on = open && over && this.choices.includes(over) && !this.out.has(over) ? over : null;
    if (on !== this.over) {
      this.over = on;
      this.overFor = 0;
    }
    if (!on) return;
    this.overFor += dt;
    if (this.overFor < TOUR.dwell) return;
    this.over = null;
    this.overFor = 0;
    if (on === this.target) {
      this.onEvent({ type: 'right', country: on });
      this.takeOff();
      return;
    }
    // The wrong country: it's named, it goes out, and it costs a can of fuel.
    this.out.add(on);
    this.stats.wrong += 1;
    this.rest = TOUR.wrongRest;
    this.onEvent({ type: 'wrong', country: on, target: this.target });
    this.burn('wrong');
  }

  takeOff() {
    this.state = 'fly';
    this.from = this.flown.at(-1) ?? null;
    const withCan = this.rules.can && this.counted;
    this.timer = (withCan ? TOUR.flyWithCan : TOUR.fly) * this.rules.fly;
    this.flight = this.timer;
    this.can = withCan ? { taken: false } : null;
    this.onEvent({ type: 'fly', from: this.from, to: this.target });
  }

  /** How far along the flight the plane is, from 0 to 1. */
  get flightShare() {
    return this.state === 'fly' ? 1 - Math.max(0, this.timer) / this.flight : this.state === 'find' || this.state === 'ready' ? 0 : 1;
  }

  fly(dt, { open = false, onCan = false } = {}) {
    this.timer -= dt;
    if (this.can && !this.can.taken && open && onCan) {
      this.can.taken = true;
      this.stats.cans += 1;
      // It tops the tank up by a can, and never past full.
      this.cans = Math.min(this.rules.cans, this.cans + 1);
      this.onEvent({ type: 'can', cans: this.cans });
    }
    if (this.timer > 0) return;
    this.can = null;
    this.state = 'land';
    this.timer = TOUR.land;
    this.onEvent({ type: 'landed', country: this.target });
  }

  land(dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.state = 'paint';
    this.painting = new Painting(this.flag);
    this.paint = null;
    this.rollerOn = false;
    this.pot = null;
    this.potFor = 0;
    this.last = null;
    this.hint = null;
    this.loose = 0;
    this.wrongFor = 0;
    this.gust = this.rules.wind ? { in: this.rules.wind.every, warned: false } : null;
    this.shown = true;
    this.shownFor = 0;
    this.peeking = false;
    this.onEvent({ type: 'easel', country: this.target });
  }

  /** The paint a part asks for, by its number. */
  wants(part) {
    return this.flag.parts[part].colour;
  }

  colour(dt, { seen = false, open = false, brush = null, pot = null, holding = false } = {}) {
    const { painting, rules } = this;
    // The other hand holds the flag, where that's asked. One the camera loses for a moment is still holding.
    this.loose = holding ? 0 : this.loose + dt;
    this.held = !rules.holding || this.loose < WIND.loose;
    const under = open && brush ? painting.partAt(brush.x, brush.y) : -1;
    // Painting from memory: the finished flag is shown for a while, and then hidden. A peek shows it again.
    if (rules.memory !== null) {
      this.shownFor += seen ? dt : 0;
      const limit = this.peeking ? TOUR.peek : rules.memory;
      if (this.shown && this.shownFor >= limit) {
        this.shown = false;
        this.peeking = false;
        this.onEvent({ type: 'hidden' });
      }
    }
    // A gust is met by the hand that holds the flag, or, painting with one hand, by that hand open on the flag.
    if (rules.wind) this.blow(dt, { seen, safe: rules.holding ? this.held : under >= 0 });
    if (this.state !== 'paint') return;

    // Dipping in a pot: an open hand that stays in it takes its paint, or the roller.
    const dipping = open ? pot : null;
    if (dipping !== this.pot) {
      this.pot = dipping;
      this.potFor = 0;
    }
    if (dipping) {
      this.hint = null;
      this.potFor += dt;
      if (this.potFor < TOUR.dip) return;
      if (dipping === 'roller') {
        if (rules.roller && !this.rollerOn) {
          this.rollerOn = true;
          this.onEvent({ type: 'roller' });
        }
      } else if (this.flag.colours[dipping] && this.paint !== dipping) {
        this.paint = dipping;
        this.wrongFor = 0;
        this.stats.dips += 1;
        this.onEvent({ type: 'dip', paint: dipping });
      }
      return;
    }

    this.hint = null;
    if (!open || !brush) return;
    const waiting = under >= 0 && !painting.done[under];
    if (!this.paint) {
      // No paint on the hand yet: the pots are pointed out.
      if (waiting) this.hint = { part: under, paint: this.wants(under) };
      return;
    }
    if (!this.held) {
      // A flag that isn't held flaps about, and paint won't go on it.
      if (under >= 0) this.hint = { hold: true };
      return;
    }
    // The paint goes on whatever is this colour, within the brush's reach, and nowhere else.
    const reach = this.rollerOn ? TOUR.roller : TOUR.brush;
    const takes = this.flag.parts.map((part, number) => !painting.done[number] && part.colour === this.paint);
    const touched = painting.stroke(brush.x, brush.y, reach, takes);
    if (!touched.length) {
      const landing = takes.some(Boolean) && under >= 0 && takes[under];
      if (waiting && !landing) {
        // The wrong paint for this part: nothing lands, and the pot the part wants is pointed out. To a child
        // painting from memory the finished flag is shown again instead, once the wrong paint has stayed a while.
        this.hint = { part: under, paint: this.wants(under) };
        this.wrongFor += dt;
        if (rules.memory !== null && !this.shown && this.wrongFor >= TOUR.wrong) this.peek();
      }
      return;
    }
    this.wrongFor = 0;
    this.last = touched.at(-1);
    this.onEvent({ type: 'stroke', x: brush.x, y: brush.y, reach, paint: this.paint, parts: touched });
    for (const part of touched) {
      if (painting.share(part) < TOUR.done) continue;
      painting.fill(part);
      this.stats.parts += 1;
      this.onEvent({ type: 'part', part });
    }
    if (!painting.allDone) return;
    this.state = 'raise';
    this.raisedTo = 0;
    this.gripped = false;
    this.gust = null;
    this.hint = null;
    this.shown = true;
    this.onEvent({ type: 'painted', country: this.target });
  }

  /** The finished flag shows again for a moment, to a child painting from memory who has the wrong paint. */
  peek() {
    if (this.shown) return;
    this.shown = true;
    this.peeking = true;
    this.shownFor = 0;
    this.wrongFor = 0;
    this.stats.peeks += 1;
    this.onEvent({ type: 'peek' });
  }

  /** The wind: a gust is seen coming, and when it comes, a flag that isn't held down loses the paint that's wet. */
  blow(dt, { seen, safe }) {
    const { gust, rules } = this;
    // It only comes on while there's a hand to be seen: nobody is caught out for having gone away.
    if (!seen) return;
    gust.in -= dt;
    if (!gust.warned && gust.in <= rules.wind.warning) {
      gust.warned = true;
      this.onEvent({ type: 'gust-coming', seconds: gust.in });
    }
    if (gust.in > 0) return;
    this.gust = { in: rules.wind.every, warned: false };
    this.stats.gusts += 1;
    if (safe) {
      this.stats.held += 1;
      this.onEvent({ type: 'gust', held: true });
      return;
    }
    // Not held: the part that was being painted loses its paint, and it costs a can of fuel.
    const wet = this.last !== null && !this.painting.done[this.last] ? this.last : null;
    if (wet !== null) this.painting.fill(wet, false);
    this.stats.lost += 1;
    this.onEvent({ type: 'gust', held: false, part: wet });
    this.burn('gust');
  }

  /** How near the next gust is, from 0 when it's far off to 1 as it comes, or null where no wind blows. */
  get gustShare() {
    if (!this.gust || this.state !== 'paint') return null;
    return Math.max(0, Math.min(1, 1 - this.gust.in / this.rules.wind.warning));
  }

  raise(dt, { open = false, lift = 0 } = {}) {
    if (!open) return;
    // The rope is taken from low down, and then the flag goes up with the hand, and never back down.
    if (!this.gripped) {
      if (lift > TOUR.raiseFrom) return;
      this.gripped = true;
      this.onEvent({ type: 'grip' });
    }
    this.raisedTo = Math.max(this.raisedTo, Math.min(1, lift));
    if (this.raisedTo < TOUR.raised) return;
    this.raisedTo = 1;
    this.flown.push(this.target);
    this.stats.stops += 1;
    this.onEvent({ type: 'raised', country: this.target });
    if (this.rules.stamps) {
      this.stats.stamps += 1;
      this.onEvent({ type: 'stamp', country: this.target });
    }
    this.state = 'settle';
    this.timer = TOUR.settle;
  }

  settle(dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.stop += 1;
    this.painting = null;
    if (this.stop < this.stops.length) {
      this.ask();
      return;
    }
    this.state = 'won';
    if (this.rules.cup) {
      this.stats.cup = true;
      this.onEvent({ type: 'cup' });
    }
    this.onEvent({ type: 'won' });
  }
}
