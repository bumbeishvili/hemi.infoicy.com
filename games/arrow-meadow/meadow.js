// Arrow Meadow: it's the meadow fair, and Giraffe is in the archery contest. The child holds his bow with one hand
// and his bowstring with the other: the bow hand, up or down, tilts the bow, the hands going apart draw it, and
// opening the string hand lets the arrow fly. It goes in an arc, and a dotted line shows where, so nothing is a
// guess. Enough targets hit win the contest.
//
// The rules are here, with no screen, camera or sound, so they run in the unit tests. bow.js says what the two hands
// are asking for, main.js passes it on, and view.js draws what this says. The meadow is seen from the side. Places
// are in screen heights, x from the edge behind the archer and y down from the top, so the meadow is WORLD.wide
// across and 1 high, whatever the screen: view.js fits it in, and turns it round for the hand in play.
//
// On their own, the contest comes with a quiver of so many arrows, a few more than there are targets to hit, fewer
// at each level. Every arrow let go takes one, so a miss costs an arrow, and an empty quiver before enough targets are
// hit loses the contest. A target only stands for a while before it's taken away and another comes, though that
// clock waits while the hands are out of the picture. A plain straw target always stands near, whatever else the
// level has brought. gentle is the contest as it always was: nothing can be lost, an arrow that misses costs nothing,
// every target waits for as long as it takes, after a few misses in a row the plain target grows, and the castle's
// golden target is given anyway. With friends it's always gentle.
//
// With friends, each on their own computer: together, everyone has the same targets, laid out the same from one
// seed, and each game claims the ones its own arrows hit. The server says whose each one is (claimed), the first to
// claim it having it, so every game counts the same. Against each other, everyone has the same targets in a lane of
// their own, one after another, and the first to enough of them wins.
import { clampLevel, ramp } from '../../core/levels.js';

const deg = (degrees) => (degrees * Math.PI) / 180;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const mix = (from, to, share) => from + (to - from) * share;

export const WORLD = { wide: 16 / 9, ground: 0.84 };
// The bow. The string hand comes back to the archer's chin, here, and the bow is held so far in front of it: the bow
// hand goes up and down round the string hand, as the child's does, and an arrow flies from where the bow is held.
export const BOW = { x: 0.17, y: 0.585, reach: 0.16 };
export const GRAVITY = 1.8; // Screen heights a second, each second.
// How fast an arrow leaves the bow, in screen heights a second, from a bow barely drawn to one drawn right back.
// Right back, the furthest it can go along the level is most * most / GRAVITY, 1.3 screen heights, so every target
// stands nearer than that, and an arrow sent nearly straight up comes down again without leaving the top.
export const SPEED = { least: 0.95, most: 1.53 };
export const ANGLES = { low: deg(-12), high: deg(78) }; // How far down, and up, the bow tilts.
export const MIN_DRAW = 0.25; // A string let go with the bow drawn less than this far isn't a shot.
export const GOALS = [6, 10, 14]; // How many targets win the contest.
// Help with aiming, as a grown-up chooses: an arc that's within so far of one that would hit a target is pulled
// that much of the way to it.
export const HELP = { off: null, little: { within: deg(5), pull: 0.6 }, lots: { within: deg(10), pull: 0.85 } };
export const HELP_NAMES = Object.keys(HELP);
export const ARROW_LONG = 0.13;

const STEP = 1 / 120; // An arrow is followed this many times a second, so it can't skip past anything.
const FLIGHT_MOST = 5; // Seconds, after which an arrow has gone.
const DOT_EVERY = 3; // The dotted line has a dot for every so many steps.
const SHOWN = { hit: 0.8, stuck: 3, fell: 1.6 }; // Seconds a target that's been hit, and an arrow that's landed, still show.
const GAPS = { plain: 0.35, special: 1.2, first: 1.4 }; // Seconds before the next target comes, and the first special one.
const LEAVING_SECONDS = 0.5; // A target that has stood long enough shrinks away over this long.
const OUT_SECONDS = 1.2; // With the last arrow landed and the contest not won, a moment before it's over.
/** How many arrows are in the quiver for a contest of so many targets, at a level, or Infinity gently. */
export const quiverFor = (goal, level, { gentle = false } = {}) => {
  const each = meadowLevel(level, { gentle }).quiver;
  return Number.isFinite(each) ? Math.ceil(goal * each) : Infinity;
};
export const PARTY_SECONDS = 2.4; // The cheering once the contest is won, before the finish card.
// After misses in a row, the plain target grows: from so many, every other miss, by this much, up to so many times.
export const MERCY = { from: 3, every: 2, by: 0.15, most: 3 };
const ASK_AGAIN_SECONDS = 2; // With friends, a claim with no answer after this long is made again.

// The plain straw target stands near: so far along the meadow, at the least and at the most, which grows with the
// levels, and how far up, as its middle, with its stand going down to the grass. Nothing else comes this near.
const NEAR = { from: 0.72, to: [0.8, 0.92], y: [0.52, 0.72], edge: 0.94 };

// What the levels bring. Missing any of it never costs anything.
export const EXTRAS = {
  balloon: { x: [1, 1.28], y: [0.26, 0.42], r: 0.06, bob: 0.012 },
  far: { x: [1.32, 1.38], y: [0.56, 0.68], r: 0.072 },
  // A target on a little cart, rolling to and fro: where the middle of its run is, how far it goes either way, and
  // how many seconds there and back take.
  roller: { x: 1.22, y: 0.725, r: 0.08, sway: 0.12, seconds: 9 },
  // How hard the wind can blow, in screen heights a second each second, and how much of that each time it changes:
  // with the arrow, or against it, which is never as hard.
  wind: { most: 0.2, turns: [1, -0.5, 0.5, -0.75, 0.75, -0.5] },
  // A wall of hay bales, with a low target behind it that only a high arc reaches.
  wall: { x: [1.1, 1.16], top: 0.47, target: { x: 1.33, y: 0.73, r: 0.08 } },
  bell: { x: 1.1, y: 0.3, r: 0.05, post: 1.16 },
  // A windmill with a target at the middle of its sails, which turn in the way: where its middle is, how far out
  // its four sails go, and from how far out they start, as each is on a bare arm near the middle, how wide half a
  // sail is, and half its tower, how fast it turns, in radians a second, and how big its target is.
  mill: { x: 1.2, y: 0.5, r: 0.17, inner: 0.07, blade: 0.018, tower: 0.02, rate: 0.5, target: 0.06 },
  // A bird that carries a gift across, from the far end over the archer's head: how high it flies, how far below it
  // the gift hangs, how fast it goes, and how long before the first one and between one and the next.
  bird: { y: 0.215, hangs: 0.09, r: 0.055, speed: 0.1, first: 5, every: 11, from: WORLD.wide + 0.12, to: -0.14 },
  // The castle's golden target, which comes up once the contest is won, and is given anyway after a while.
  castle: { x: 1.4, y: 0.52, r: 0.08, waits: 25, rises: 1.2 },
};
// How many stars each kind of target is worth, from level 2.
export const STARS = { butt: 0, balloon: 1, far: 1, roller: 1, wall: 1, bell: 2, mill: 2, gift: 3, castle: 0 };
// The kinds of target the levels bring, the newest first.
const SPECIALS = ['mill', 'bell', 'wall', 'roller', 'far', 'balloon'];

// With friends: where each target stands, by its place in the row of them. Near, in the middle, up high and far.
export const FRIEND_ZONES = [
  { kind: 'butt', x: [0.72, 0.86], y: [0.56, 0.72] },
  { kind: 'butt', x: [1.04, 1.2], y: [0.54, 0.7] },
  { kind: 'balloon', x: [0.92, 1.18], y: [0.3, 0.42] },
  { kind: 'far', x: [1.3, 1.4], y: [0.56, 0.68] },
];
/** How many targets are up at once for so many playing together: one more than there are players, up to four. */
export const teamSlots = (players) => clamp(Math.round(players) + 1, 2, FRIEND_ZONES.length);

/**
 * What changes from level 1 to 10. Each level from 2 brings something new: see NEWS. gentle is the contest as it
 * always was, with the gentler climb.
 */
export function meadowLevel(level, { gentle = false } = {}) {
  const at = clampLevel(level);
  return {
    // The plain target is smaller each level, and can stand a little further off: at level 10 it's 65% of level 1's
    // size, or 76% gently.
    size: ramp(at, 0.1, gentle ? 0.076 : 0.065),
    // Arrows in the quiver, for each target to hit: two and a half at level 1, and 1.4 at level 10. Gently, as many as
    // it takes.
    quiver: gentle ? Infinity : ramp(at, 2.5, 1.4),
    // Seconds a target stands, while the hands are in the picture, before it's taken away and another comes: 20 at
    // level 1 and 8 at level 10. Gently, for as long as it takes.
    stays: gentle ? Infinity : ramp(at, 20, 8),
    near: ramp(at, NEAR.to[0], NEAR.to[1]),
    // From level 2, a balloon to pop, up in the air, and a star for it, and for every target the levels bring.
    balloon: at >= 2,
    // From level 3, a target far off, which takes a bow drawn right back.
    far: at >= 3,
    // From level 4, a target on a little cart, rolling to and fro.
    roller: at >= 4,
    // From level 5, wind, shown by a flag, which bends every arrow's arc.
    wind: at >= 5 ? EXTRAS.wind.most : 0,
    // From level 6, a wall of hay bales with a target behind it, which takes a high arc.
    wall: at >= 6,
    // From level 7, a bell up on a post, which rings.
    bell: at >= 7,
    // From level 8, a windmill with a target at its middle, whose sails get in the way as they turn.
    mill: at >= 8,
    // From level 9, a bird that carries a gift across, now and then.
    bird: at >= 9,
    // At level 10, the castle's golden target, once the contest is won.
    castle: at >= 10,
  };
}

// What each level brings that's new, for the title card, the countdown and the finish card. key says which part of
// meadowLevel turns it on, which the unit tests check.
export const NEWS = {
  2: [{ key: 'balloon', mark: '🎈', name: 'Balloons', nameKa: 'ბუშტები' }],
  3: [{ key: 'far', mark: '🎯', name: 'The far target', nameKa: 'შორეული სამიზნე' }],
  4: [{ key: 'roller', mark: '🛒', name: 'A target on wheels', nameKa: 'სამიზნე ბორბლებზე' }],
  5: [{ key: 'wind', mark: '🚩', name: 'Wind', nameKa: 'ქარი' }],
  6: [{ key: 'wall', mark: '🌾', name: 'The hay wall', nameKa: 'თივის კედელი' }],
  7: [{ key: 'bell', mark: '🔔', name: 'The bell', nameKa: 'ზარი' }],
  8: [{ key: 'mill', mark: '🌀', name: 'The windmill', nameKa: 'ქარის წისქვილი' }],
  9: [{ key: 'bird', mark: '🐦', name: 'A bird with a gift', nameKa: 'ჩიტი საჩუქრით' }],
  10: [{ key: 'castle', mark: '🏰', name: 'The castle', nameKa: 'ციხესიმაგრე' }],
};

// The little label each new thing has beside it the first time it comes in a game, in English and Georgian. Nothing
// new is said out loud.
export const LABELS = {
  balloon: ['Pop the balloon!', 'გახეთქე ბუშტი!'],
  far: ['It’s far: pull right back!', 'შორსაა: ბოლომდე გაჭიმე!'],
  roller: ['It rolls!', 'ის მოძრაობს!'],
  wind: ['The wind bends it!', 'ქარი ისარს ხრის!'],
  wall: ['Aim high, over the wall!', 'მაღლა დაუმიზნე, კედლის ზემოთ!'],
  bell: ['Ring the bell!', 'დარეკე ზარი!'],
  mill: ['Between the sails!', 'ფრთებს შორის ესროლე!'],
  bird: ['Hit the gift!', 'მოარტყი საჩუქარს!'],
  castle: ['The golden target!', 'ოქროს სამიზნე!'],
};

/** What's new at a level, as [{ key, mark, name, nameKa }]. Nothing at level 1. */
export const meadowNewAt = (level) => NEWS[clampLevel(level)] ?? [];

/** Whether the part of a level that a piece of news names is on. */
export function newsIsOn(key, level) {
  const plan = meadowLevel(level);
  return typeof plan[key] === 'number' ? plan[key] > 0 : Boolean(plan[key]);
}

/** Numbers from 0 to 1 that come out the same from the same seed, so friends' meadows are laid out the same. */
export function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** How fast an arrow leaves a bow drawn this far, from 0 to 1. */
export const speedFor = (draw) => mix(SPEED.least, SPEED.most, clamp(draw, 0, 1));

/** Where the bow is held, tilted this far: out in front of the string hand, and up or down from it. */
export const gripAt = (angle) => ({ x: BOW.x + BOW.reach * Math.cos(angle), y: BOW.y - BOW.reach * Math.sin(angle) });

/** An arrow as it leaves the bow: where from, and how it's going. wind pushes it along, or back, all the way. */
export function shotFor(angle, draw, wind = 0) {
  const tilt = clamp(angle, ANGLES.low, ANGLES.high);
  const speed = speedFor(draw);
  const from = gripAt(tilt);
  return { x0: from.x, y0: from.y, vx: speed * Math.cos(tilt), vy: speed * Math.sin(tilt), wind, angle: tilt, draw: clamp(draw, 0, 1) };
}

/** Where an arrow's tip is so many seconds after it left the bow, and which way it's pointing. */
export function flightAt(shot, t) {
  const dx = shot.vx + shot.wind * t;
  const dy = -shot.vy + GRAVITY * t;
  return { x: shot.x0 + shot.vx * t + 0.5 * shot.wind * t * t, y: shot.y0 - shot.vy * t + 0.5 * GRAVITY * t * t, dx, dy };
}

/**
 * The target with number k in a meadow shared with friends, the same on every computer: where it stands and what
 * kind it is. With several up at once (slots), each has its own part of the meadow, and with one at a time they go
 * round the parts in turn.
 */
export function friendTarget(seed, k, level = 1, slots = 1) {
  const random = seeded(((seed >>> 0) * 31 + k * 7919 + 17) >>> 0);
  const zone = FRIEND_ZONES[(slots > 1 ? k % slots : k) % FRIEND_ZONES.length];
  const x = mix(zone.x[0], zone.x[1], random());
  const y = mix(zone.y[0], zone.y[1], random());
  const r = zone.kind === 'butt' ? meadowLevel(level, { gentle: true }).size : EXTRAS[zone.kind].r;
  return { k, kind: zone.kind, x, y, r };
}

/**
 * Whether a place is on one of a windmill's sails, or on its tower, at a moment. The sails are out from the middle,
 * where the target is, so the target itself is never covered: an arrow gets to it between two sails.
 */
export function inMill(mill, x, y, time) {
  const [dx, dy] = [x - mill.x, y - mill.y];
  if (Math.abs(dx) <= mill.tower && dy >= mill.inner) return 'tower';
  const out = Math.hypot(dx, dy);
  if (out > mill.r || out < mill.inner) return null;
  // The nearest of its four sails: how far round from it this place is.
  const round = Math.atan2(dy, dx) - (mill.phase + mill.rate * time);
  const off = round - Math.round(round / (Math.PI / 2)) * (Math.PI / 2);
  return Math.abs(Math.sin(off)) * out <= mill.blade ? 'sail' : null;
}

export class Meadow {
  /**
   * level is the level played, goal how many targets win, and help the help with aiming (see HELP), as a grown-up
   * chose. onEvent hears what happens: see main.js. With friends, team is { seed, players, claim(k) } for a meadow
   * shared with them, and race { seed } for a lane of one's own with the same targets as theirs: both are the plain
   * meadow, without what the levels bring. me is this child's id among them.
   */
  constructor({ level = 1, goal = 10, help = 'little', team = null, race = null, gentle = false, me = 'me', random = Math.random, onEvent = () => {} } = {}) {
    Object.assign(this, { random, onEvent, me });
    this.level = clampLevel(level);
    this.mode = team ? 'team' : race ? 'race' : 'solo';
    // With friends it's always the contest as it was: nothing lost, and nothing taken away.
    this.gentle = gentle || this.mode !== 'solo';
    const full = meadowLevel(level, { gentle: this.gentle });
    this.plan = this.mode === 'solo' ? full : { ...full, balloon: false, far: false, roller: false, wind: 0, wall: false, bell: false, mill: false, bird: false, castle: false };
    this.stars = this.mode === 'solo' && this.level >= 2;
    this.goal = Math.max(1, Math.round(goal));
    // Every arrow let go takes one from the quiver. Empty before the contest is won, it's lost.
    this.quiver = quiverFor(this.goal, this.level, { gentle: this.gentle });
    this.arrowsLeft = this.quiver;
    this.outFor = 0;
    this.help = HELP_NAMES.includes(help) ? help : 'little';
    this.time = 0;
    this.phase = 'play'; // Then 'castle', at level 10, and 'won', or 'lost' with the quiver empty.
    this.done = false;
    this.targets = [];
    this.arrows = [];
    this.bird = null;
    this.birdIn = EXTRAS.bird.first;
    this.wind = 0;
    this.windTurn = 0;
    this.missRun = 0;
    this.partyLeft = 0;
    this.nextId = 1;
    this.spawned = 0; // How many special targets have come, for which kind is next.
    this.lastPlain = null;
    this.waits = { plain: 0, special: GAPS.first };
    this.specials = SPECIALS.filter((kind) => this.plan[kind]);
    this.stats = { shots: 0, hits: 0, misses: 0, run: 0, bestRun: 0, stars: 0, full: 0, trophy: false };
    // With friends: who got each target, by its number, and how many each one has.
    this.seed = (team ?? race)?.seed ?? 0;
    this.claim = team?.claim ?? null;
    this.slots = team ? teamSlots(team.players ?? 2) : 1;
    this.owners = new Map();
    this.tally = new Map();
    this.coming = []; // Targets on their way, with friends: { k, left }.
    if (this.plan.wind) this.turnWind();
    if (this.mode === 'solo') this.spawnPlain();
    else for (let k = 0; k < this.slots; k += 1) this.spawnShared(k);
  }

  /* ---------- targets ---------- */

  add(target) {
    const made = { id: this.nextId, state: 'up', since: 0, born: this.time, grown: 0, stars: this.stars ? STARS[target.kind] ?? 0 : 0, ...target };
    made.home = { x: made.x, y: made.y };
    made.size = made.r;
    this.nextId += 1;
    this.targets.push(made);
    this.onEvent({ type: 'spawn', target: made });
    return made;
  }

  /** Whether the contest was lost, with the quiver empty before enough targets were hit. */
  get lost() {
    return this.phase === 'lost';
  }

  /** The targets that can be hit now. */
  get live() {
    return this.targets.filter((target) => target.state === 'up');
  }

  /** Where a target is at a moment: most stand still, a balloon bobs, a cart rolls and a gift is carried along. */
  whereAt(target, time = this.time) {
    const age = time - target.born;
    if (target.kind === 'roller') return { x: target.home.x + EXTRAS.roller.sway * Math.sin((age * Math.PI * 2) / EXTRAS.roller.seconds), y: target.home.y };
    if (target.kind === 'balloon') return { x: target.home.x, y: target.home.y + EXTRAS.balloon.bob * Math.sin(age * 1.3) };
    if (target.kind === 'gift') return { x: target.home.x - EXTRAS.bird.speed * age, y: target.home.y + 0.008 * Math.sin(age * 2.1) };
    if (target.kind === 'castle') return { x: target.home.x, y: target.home.y + 0.12 * (1 - clamp(age / EXTRAS.castle.rises, 0, 1)) ** 2 };
    return { x: target.home.x, y: target.home.y };
  }

  /** A plain straw target, near, somewhere new: never where the last one stood, and clear of anything else. */
  spawnPlain() {
    const { plan, random } = this;
    const r = plan.size;
    let place = null;
    for (let tries = 0; tries < 12; tries += 1) {
      const x = Math.min(NEAR.edge - r, mix(NEAR.from, plan.near, random()));
      const y = mix(NEAR.y[0], NEAR.y[1], random());
      place = { x, y };
      const last = this.lastPlain;
      if (!last || Math.hypot(x - last.x, y - last.y) >= 0.1) break;
    }
    this.lastPlain = place;
    return this.add({ kind: 'butt', slot: 'plain', ...place, r });
  }

  /** The next of the targets the levels bring: the newest kind first, and then each in turn. */
  spawnSpecial() {
    const { specials, random } = this;
    if (!specials.length) return null;
    const kind = specials[this.spawned % specials.length];
    this.spawned += 1;
    const spec = EXTRAS[kind];
    const between = ([low, high]) => mix(low, high, random());
    if (kind === 'balloon') return this.add({ kind, slot: 'special', x: between(spec.x), y: between(spec.y), r: spec.r, colour: Math.floor(random() * 5) });
    if (kind === 'far') return this.add({ kind, slot: 'special', x: between(spec.x), y: between(spec.y), r: spec.r });
    if (kind === 'roller') return this.add({ kind, slot: 'special', x: spec.x, y: spec.y, r: spec.r });
    if (kind === 'wall') return this.add({ kind, slot: 'special', ...spec.target, wall: { x0: spec.x[0], x1: spec.x[1], top: spec.top } });
    if (kind === 'bell') return this.add({ kind, slot: 'special', x: spec.x, y: spec.y, r: spec.r });
    // The windmill: its sails start somewhere new each time.
    const { x, y, r, inner, blade, tower, rate } = spec;
    return this.add({ kind, slot: 'special', x, y, r: spec.target, mill: { x, y, r, inner, blade, tower, rate, phase: random() * Math.PI * 2 } });
  }

  /** With friends: the target with this number comes, unless it has, or someone has it already. */
  spawnShared(k) {
    if (this.owners.has(k) || this.targets.some((target) => target.k === k)) return null;
    const { kind, x, y, r } = friendTarget(this.seed, k, this.level, this.slots);
    return this.add({ kind, slot: 'shared', k, x, y, r, colour: k % 5 });
  }

  /* ---------- the wind ---------- */

  /** The wind changes: the other way, and more or less of it. An arrow in the air keeps the wind it left with. */
  turnWind() {
    const { turns, most } = EXTRAS.wind;
    this.wind = Math.min(this.plan.wind, most) * turns[this.windTurn % turns.length];
    this.windTurn += 1;
    this.onEvent({ type: 'wind', wind: this.wind });
  }

  /* ---------- arrows ---------- */

  /**
   * What an arrow's tip touches at a place and a moment: a target, a wall, a windmill, the grass, or nothing. only
   * leaves out every target but that one, for working out an arc to it. shown takes in a target that has just been
   * hit and is still showing, for a friend's arrow, which gets here a moment after the server says whose it is.
   */
  touch(x, y, time, { only = null, shown = false } = {}) {
    if (y >= WORLD.ground) return { what: 'ground' };
    if (x > WORLD.wide + 0.2 || x < -0.2) return { what: 'out' };
    const there = (target) => target.state === 'up' || (shown && target.state !== 'gone');
    for (const target of this.targets) {
      if (target.state !== 'up') continue;
      if (target.wall && x >= target.wall.x0 && x <= target.wall.x1 && y >= target.wall.top) return { what: 'wall', target };
      if (target.mill) {
        const part = inMill(target.mill, x, y, time);
        if (part) return { what: part, target };
      }
    }
    for (const target of this.targets) {
      if (!there(target) || (only && target !== only)) continue;
      const at = this.whereAt(target, time);
      if (Math.hypot(x - at.x, y - at.y) <= target.r) return { what: 'target', target, centre: at };
    }
    return null;
  }

  /**
   * Where an arrow let go now would fly: { shot, dots, end }. dots are places along its arc, for the dotted line,
   * and end is what it comes to: { what, target, x, y, t, off }, off being how far from the middle of a target it
   * would strike, as a share of the target, from 0 to 1.
   */
  trace(angle, draw, { only = null, dots = false } = {}) {
    const shot = shotFor(angle, draw, this.wind);
    const points = [];
    let end = { what: 'out', x: shot.x0, y: shot.y0, t: FLIGHT_MOST };
    for (let step = 1; step * STEP <= FLIGHT_MOST; step += 1) {
      const t = step * STEP;
      const at = flightAt(shot, t);
      const hit = this.touch(at.x, at.y, this.time + t, { only });
      if (dots && step % DOT_EVERY === 0) points.push({ x: at.x, y: at.y });
      if (!hit) continue;
      end = { ...hit, x: at.x, y: at.y, t };
      if (hit.what === 'target') {
        // How far to one side of the target's middle the arrow is heading, as it gets there.
        const along = Math.hypot(at.dx, at.dy) || 1;
        end.off = Math.abs((hit.centre.x - at.x) * at.dy - (hit.centre.y - at.y) * at.dx) / along / hit.target.r;
      }
      break;
    }
    return { shot, dots: points, end };
  }

  /**
   * The angle, with the bow drawn this far, that would hit a target nearest its middle, or null if none would.
   * Of a low arc and a high one that both would, lob says which. Tried a degree at a time, and then more finely.
   */
  solve(target, draw, { lob = false, from = ANGLES.low, to = ANGLES.high } = {}) {
    const offAt = (angle) => {
      const { end } = this.trace(angle, draw, { only: target });
      return end.what === 'target' && end.target === target ? end.off : null;
    };
    // Each run of angles that hit it, one after another: a low arc, and often a high one too.
    const runs = [];
    let run = null;
    for (let angle = from; angle <= to + 1e-9; angle += deg(1)) {
      const off = offAt(angle);
      if (off === null) {
        run = null;
        continue;
      }
      if (!run) {
        run = { angle, off };
        runs.push(run);
      } else if (off < run.off) Object.assign(run, { angle, off });
    }
    if (!runs.length) return null;
    const best = lob ? runs.at(-1) : runs[0];
    for (let angle = best.angle - deg(0.75); angle <= best.angle + deg(0.75) + 1e-9; angle += deg(0.25)) {
      const off = offAt(angle);
      if (off !== null && off < best.off) Object.assign(best, { angle, off });
    }
    return best.angle;
  }

  /**
   * The arc for a bow held like this, with the help with aiming a grown-up chose: within so far of an angle that
   * would hit a target, it's pulled towards it. Returns { angle, draw, dots, end, target }, the arc as it will fly.
   */
  aimFor(angle, draw) {
    const tilt = clamp(angle, ANGLES.low, ANGLES.high);
    const help = HELP[this.help];
    let aimed = tilt;
    if (help && draw >= MIN_DRAW && this.phase !== 'won') {
      let best = null;
      for (const target of this.live) {
        const wanted = this.nearestHit(target, draw, tilt, help.within);
        if (wanted !== null && (!best || Math.abs(wanted - tilt) < Math.abs(best - tilt))) best = wanted;
      }
      if (best !== null) {
        // All the way inside half of how far the help reaches, and less and less from there, so it never jumps.
        const share = Math.abs(best - tilt) / help.within;
        aimed = tilt + (best - tilt) * help.pull * clamp(2 - 2 * share, 0, 1);
      }
    }
    const { dots, end } = this.trace(aimed, draw, { dots: true });
    return { angle: aimed, draw, dots, end, target: end.what === 'target' ? end.target : null };
  }

  /** The angle that would hit a target nearest its middle, within so far of where the bow points, or null. */
  nearestHit(target, draw, tilt, within) {
    return this.solve(target, draw, { from: Math.max(ANGLES.low, tilt - within), to: Math.min(ANGLES.high, tilt + within), lob: false });
  }

  /**
   * What a helpful archer would do now, for the tests and the film of the game, which play it as a child would:
   * { angle, draw, target }, an arc that hits a target, the level's newest thing first. Null with nothing to hit.
   */
  wants() {
    const order = [...this.live].sort((a, b) => Number(b.slot !== 'plain') - Number(a.slot !== 'plain') || a.id - b.id);
    for (const target of order) {
      for (const draw of [1, 0.85, 0.7, 0.55]) {
        for (const lob of [false, true]) {
          const angle = this.solve(target, draw, { lob });
          if (angle !== null) return { angle, draw, target };
        }
      }
    }
    return null;
  }

  /**
   * An arrow leaves the bow, at this angle and with the bow drawn this far, which the string hand opening does.
   * ghost is a friend's arrow, shown as it flies on their computer, which hits nothing here.
   */
  loose(angle, draw, { ghost = false, by = this.me } = {}) {
    if (this.done || this.phase === 'lost') return null;
    // An empty quiver has nothing to let go. The castle's golden target, once the contest is won, takes none.
    const counted = !ghost && this.phase === 'play';
    if (counted && this.arrowsLeft <= 0) return null;
    if (counted && Number.isFinite(this.arrowsLeft)) this.arrowsLeft -= 1;
    const shot = shotFor(angle, draw, ghost ? 0 : this.wind);
    const arrow = { id: this.nextId, by, ghost, shot, t: 0, at: this.time, state: 'flying', x: shot.x0, y: shot.y0, dx: shot.vx, dy: -shot.vy, since: 0, in: null, scored: false };
    this.nextId += 1;
    this.arrows.push(arrow);
    if (!ghost) {
      this.stats.shots += 1;
      if (shot.draw >= 0.95) this.stats.full += 1;
    }
    this.onEvent({ type: 'loose', arrow });
    return arrow;
  }

  /** One arrow's frame: on its way, or stuck where it landed, or tumbling off something it hit. */
  fly(arrow, dt) {
    if (arrow.state === 'stuck') {
      arrow.since += dt;
      // One in a target goes where the target goes, and goes when it does.
      const target = arrow.in;
      if (target) {
        const at = this.whereAt(target);
        arrow.x = at.x + arrow.offset.x;
        arrow.y = at.y + arrow.offset.y;
        if (!this.targets.includes(target)) arrow.state = 'gone';
      } else if (arrow.since >= SHOWN.stuck) arrow.state = 'gone';
      return;
    }
    if (arrow.state === 'fell') {
      arrow.since += dt;
      arrow.fall.vy += GRAVITY * dt;
      arrow.x += arrow.fall.vx * dt;
      arrow.y = Math.min(WORLD.ground, arrow.y + arrow.fall.vy * dt);
      arrow.spin += arrow.fall.turn * dt * (arrow.y >= WORLD.ground ? 0 : 1);
      if (arrow.since >= SHOWN.fell) arrow.state = 'gone';
      return;
    }
    let left = dt;
    while (left > 1e-9 && arrow.state === 'flying') {
      const step = Math.min(STEP, left);
      left -= step;
      arrow.t += step;
      Object.assign(arrow, flightAt(arrow.shot, arrow.t));
      const hit = arrow.t >= FLIGHT_MOST ? { what: 'out' } : this.touch(arrow.x, arrow.y, arrow.at + arrow.t, { shown: arrow.ghost });
      if (hit) this.lands(arrow, hit);
    }
  }

  /** An arrow has come to something. */
  lands(arrow, hit) {
    const at = { x: arrow.x, y: arrow.y };
    const tumble = () => {
      arrow.state = 'fell';
      arrow.since = 0;
      arrow.spin = 0;
      arrow.fall = { vx: -0.12 * Math.sign(arrow.dx || 1), vy: -0.25, turn: 5 };
    };
    // One that has popped a balloon on its way hasn't missed, wherever it comes down.
    const miss = () => {
      if (!arrow.ghost && !arrow.scored) this.missed();
    };
    if (hit.what === 'out') {
      arrow.state = 'gone';
      miss();
      return;
    }
    if (hit.what === 'ground') {
      arrow.state = 'stuck';
      arrow.since = 0;
      arrow.y = WORLD.ground;
      this.onEvent({ type: 'land', at, arrow });
      miss();
      return;
    }
    if (hit.what !== 'target') {
      // A wall, a sail or the windmill's tower: it bonks off, and drops.
      tumble();
      this.onEvent({ type: 'bonk', what: hit.what, at, arrow });
      miss();
      return;
    }
    const { target } = hit;
    if (arrow.ghost) {
      // A friend's arrow stops where it would have, and whose the target is comes from the server.
      arrow.state = 'gone';
      return;
    }
    arrow.scored = true;
    if (target.kind === 'balloon') {
      // A balloon doesn't stop an arrow.
    } else if (target.kind === 'bell' || target.kind === 'gift') {
      tumble();
    } else {
      arrow.state = 'stuck';
      arrow.since = 0;
      arrow.in = target;
      arrow.offset = { x: arrow.x - hit.centre.x, y: arrow.y - hit.centre.y };
    }
    this.strike(target, at);
  }

  /** One of the child's arrows has hit a target. */
  strike(target, at) {
    if (this.claim) {
      // With friends, the server says whose it is. It shows as hit at once, and counts once that's known.
      target.state = 'asked';
      target.since = 0;
      target.asked = this.time;
      this.onEvent({ type: 'hit', target, at, stars: 0, last: false, asked: true });
      this.claim(target.k);
      return;
    }
    this.scored(target, at);
  }

  /** A target is hit, and counts. */
  scored(target, at) {
    const { stats } = this;
    target.state = 'hit';
    target.since = 0;
    this.missRun = 0;
    stats.run += 1;
    stats.bestRun = Math.max(stats.bestRun, stats.run);
    if (target.kind === 'castle') {
      stats.trophy = true;
      this.onEvent({ type: 'trophy', at, given: false });
      this.celebrate();
      return;
    }
    stats.hits += 1;
    if (this.mode === 'race') this.tallyUp(target.k, this.me);
    const last = this.phase === 'play' && this.total >= this.goal;
    this.onEvent({ type: 'hit', target, at, stars: target.stars, last });
    if (target.stars) {
      stats.stars += target.stars;
      this.onEvent({ type: 'prize', kind: 'star', at, count: target.stars });
    }
    if (target.kind === 'gift' && this.bird) this.bird.given = true;
    // A new plain target has a new wind.
    if (target.slot === 'plain' && this.plan.wind && !last) this.turnWind();
    if (target.slot === 'plain' || target.slot === 'special') this.waits[target.slot] = GAPS[target.slot];
    if (target.slot === 'shared' && this.mode === 'race') this.coming.push({ k: target.k + 1, left: SHOWN.hit + GAPS.plain });
    if (last) this.contestWon();
  }

  /** How many targets count so far: this child's, or with friends together, everyone's. */
  get total() {
    return this.mode === 'team' ? this.owners.size : this.stats.hits;
  }

  /**
   * An arrow that hit no target. It has cost an arrow from the quiver, and gently it costs nothing, and after a few in
   * a row the plain target grows.
   */
  missed() {
    this.stats.misses += 1;
    this.stats.run = 0;
    this.missRun += 1;
    if (!this.gentle) return;
    const plain = this.live.find((target) => target.slot === 'plain');
    const due = this.missRun >= MERCY.from && (this.missRun - MERCY.from) % MERCY.every === 0;
    if (plain && due && plain.grown < MERCY.most) {
      plain.grown += 1;
      plain.r = plain.size * (1 + MERCY.by * plain.grown);
      this.onEvent({ type: 'grow', target: plain });
    }
  }

  /* ---------- with friends ---------- */

  tallyUp(k, by) {
    this.owners.set(k, by);
    this.tally.set(by, (this.tally.get(by) ?? 0) + 1);
  }

  /** The server says whose target k is. It counts for them on every computer, and the next one comes in its place. */
  claimed(k, by) {
    if (this.mode !== 'team' || this.owners.has(k) || this.done) return;
    this.tallyUp(k, by);
    const mine = by === this.me;
    const target = this.targets.find((each) => each.k === k);
    if (target && target.state !== 'hit') {
      target.state = 'hit';
      target.since = 0;
      target.by = by;
    }
    if (mine) {
      this.stats.hits += 1;
      this.stats.run += 1;
      this.stats.bestRun = Math.max(this.stats.bestRun, this.stats.run);
      this.missRun = 0;
    }
    const last = this.phase === 'play' && this.total >= this.goal;
    this.onEvent({ type: 'claimed', k, by, mine, target: target ?? null, last });
    this.coming.push({ k: k + this.slots, left: SHOWN.hit + GAPS.plain });
    if (last) this.contestWon();
  }

  /**
   * With friends together, one of them has gone: the rest finish with as many targets fewer as that one's share of
   * what was left. before and after are how many were playing, and are now.
   */
  fewer(before, after) {
    if (this.mode !== 'team' || this.phase !== 'play' || !(after > 0) || after >= before) return;
    this.goal = this.total + Math.max(1, Math.round(((this.goal - this.total) * after) / before));
  }

  /* ---------- each frame ---------- */

  /**
   * present says the hands are in the picture: a target only stands for so long while they are, so a child who goes,
   * or whose hands the camera loses, finds it still there when they come back.
   */
  update(dt, { present = true } = {}) {
    if (this.done) return;
    this.time += dt;
    for (const arrow of this.arrows) this.fly(arrow, dt);
    this.arrows = this.arrows.filter((arrow) => arrow.state !== 'gone');

    for (const target of this.targets) {
      target.since += dt;
      if (target.state === 'up' && present) this.standing(target, dt);
      // A claim the server hasn't answered, as when the connection dropped, is made again.
      if (target.state === 'asked' && this.time - target.asked >= ASK_AGAIN_SECONDS) {
        target.asked = this.time;
        this.claim?.(target.k);
      }
    }
    if (this.phase === 'play') {
      if (this.mode === 'solo') this.fill(dt);
      else this.fillShared(dt);
      if (this.plan.bird) this.flyBird(dt);
    }
    // One that's been hit shows for a moment, with the arrow in it, and then it's gone, as is one that has shrunk away.
    this.targets = this.targets.filter((target) => !(target.state === 'hit' && target.since >= SHOWN.hit) && !(target.state === 'leaving' && target.since >= LEAVING_SECONDS) && target.state !== 'gone');
    if (this.phase === 'play') this.checkQuiver(dt);
    if (this.phase === 'lost') {
      this.outFor += dt;
      if (this.outFor >= OUT_SECONDS) this.done = true;
    }
    if (this.phase === 'castle') this.waitAtCastle(dt);
    if (this.phase === 'won') {
      this.partyLeft -= dt;
      if (this.partyLeft <= 0) this.done = true;
    }
  }

  /**
   * A target that has stood as long as the level lets it is taken away, shrinking, and another comes in its place. A
   * gift goes with its bird, and the castle's golden target waits as long as it waits.
   */
  standing(target, dt) {
    if (!Number.isFinite(this.plan.stays) || (target.slot !== 'plain' && target.slot !== 'special')) return;
    target.stood = (target.stood ?? 0) + dt;
    if (target.stood < this.plan.stays) return;
    target.state = 'leaving';
    target.since = 0;
    this.waits[target.slot] = GAPS[target.slot];
    // A new plain target has a new wind, as when one is hit.
    if (target.slot === 'plain' && this.plan.wind) this.turnWind();
    this.onEvent({ type: 'leave', target });
  }

  /** The quiver is empty, the last arrow has landed, and the contest isn't won: it's lost, after a moment. */
  checkQuiver() {
    if (this.arrowsLeft > 0 || this.arrows.some((arrow) => !arrow.ghost && arrow.state === 'flying')) return;
    this.phase = 'lost';
    this.outFor = 0;
    for (const target of this.targets) if (target.state === 'up') Object.assign(target, { state: 'leaving', since: 0 });
    this.bird = null;
    this.onEvent({ type: 'out' });
  }

  /** On their own: a plain target is always up, or on its way, and from level 2 one of what the levels bring. */
  fill(dt) {
    const has = (slot) => this.targets.some((target) => target.slot === slot);
    if (!has('plain')) {
      this.waits.plain -= dt;
      if (this.waits.plain <= 0) this.spawnPlain();
    }
    if (this.specials.length && !has('special')) {
      this.waits.special -= dt;
      if (this.waits.special <= 0) this.spawnSpecial();
    }
  }

  fillShared(dt) {
    for (const next of this.coming) next.left -= dt;
    for (const next of this.coming.filter((each) => each.left <= 0)) this.spawnShared(next.k);
    this.coming = this.coming.filter((each) => each.left > 0);
  }

  /** The bird comes across now and then, with a gift hanging under it, and goes on its way. */
  flyBird(dt) {
    const spec = EXTRAS.bird;
    if (!this.bird) {
      this.birdIn -= dt;
      if (this.birdIn > 0) return;
      const gift = this.add({ kind: 'gift', slot: 'extra', x: spec.from, y: spec.y + spec.hangs, r: spec.r });
      this.bird = { gift, born: this.time, given: false };
      this.onEvent({ type: 'bird', bird: this.bird });
      return;
    }
    const { bird } = this;
    bird.x = spec.from - spec.speed * (this.time - bird.born);
    bird.y = spec.y + 0.008 * Math.sin((this.time - bird.born) * 2.1);
    if (bird.x <= spec.to) {
      // Gone over the archer's head: the gift nobody hit goes with it, which costs nothing.
      if (bird.gift.state === 'up') bird.gift.state = 'gone';
      this.bird = null;
      this.birdIn = spec.every;
    }
  }

  /** Enough targets: the contest is won. At level 10 the castle's golden target comes up first. */
  contestWon() {
    // What's left standing goes, and nothing more comes.
    for (const target of this.targets) if (target.state === 'up' || target.state === 'asked') target.state = 'gone';
    this.targets = this.targets.filter((target) => target.state !== 'gone');
    this.bird = null;
    this.coming = [];
    if (this.plan.castle) {
      const spec = EXTRAS.castle;
      this.phase = 'castle';
      this.castle = this.add({ kind: 'castle', slot: 'castle', x: spec.x, y: spec.y, r: spec.r });
      this.castleFor = 0;
      this.onEvent({ type: 'castle', target: this.castle });
      return;
    }
    this.celebrate();
  }

  /**
   * The golden target waits to be hit. After a good while it goes down again, and the contest is still won, without
   * the trophy. Gently, the trophy is given anyway then. An empty quiver here costs nothing, as the contest is won.
   */
  waitAtCastle(dt) {
    this.castleFor += dt;
    if (this.castleFor < EXTRAS.castle.waits || this.castle.state !== 'up') return;
    this.castle.since = 0;
    if (!this.gentle) {
      this.castle.state = 'leaving';
      this.onEvent({ type: 'leave', target: this.castle });
      this.celebrate();
      return;
    }
    this.castle.state = 'hit';
    this.stats.trophy = true;
    this.onEvent({ type: 'trophy', at: this.whereAt(this.castle), given: true });
    this.celebrate();
  }

  celebrate() {
    this.phase = 'won';
    this.partyLeft = PARTY_SECONDS;
    this.onEvent({ type: 'won' });
  }
}
