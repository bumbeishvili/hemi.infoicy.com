// Flap, Little Chick!: a little chick runs home along a farm track, seen from the side, with a fox trotting
// along behind. The child's hands are its wings: each time a hand comes up from hanging forwards, bent back at the
// wrist, that wing flaps and the chick rises, and while the hands stay up it glides. A flap in good time carries
// it over what's in the way. The track ends at the hen house, where the chick is safe.
//
// The rules are here, with no screen, camera or sound, so they run in the unit tests. wings.js says what each hand
// is doing, main.js passes that on, and view.js draws what this says. Everything is measured in the chick's own
// world: places along the track and heights in units a little longer than the chick is tall, and times in seconds.
//
// As the game comes, the fox can catch the chick, and then that flight is over: a grown-up who played the first
// version, where he never could, said so ("make sure fox can catch, right now it just stops"). A chick that
// stands at something for more than a moment has the fox come on, every tumble, splash and bump brings him nearer,
// and each thing flown over cleanly takes the chick further ahead. Right behind a chick on the ground, he has it.
//
// A grown-up can have the game as it was, where nothing can be lost and nothing is taken away: the fox never
// catches anyone, as the mother hen flies in when he gets right up behind, carries the chick on over the next
// thing, and he sits down, puffing; a child who isn't flapping finds the chick waiting at whatever is in the way,
// for as long as it takes, and the fox waiting too; and only a flap that was too early or too small has the chick
// tumble, and never twice running. Flying home with friends, it's that game too.
import { clampLevel, ramp } from '../../core/levels.js';

// How long the way home is, as a grown-up chooses: how many things are in the way.
export const WAYS = { short: 8, medium: 12, long: 16 };
export const WAY_NAMES = Object.keys(WAYS);
// What the fox does, as a grown-up chooses. He can catch the chick, which is how the game comes. Or he never
// can: a flap that was too early or too small has the chick tumble over the thing and him come nearer, with the
// mother hen there before he gets it. Or the chick waits there for another flap, and he keeps his distance.
export const FOX_NAMES = ['catch', 'tumble', 'wait'];

export const CHICK = {
  r: 0.36, // Half as wide as it is.
  tall: 0.78,
  gravity: 5.2,
  hop: 1.45, // How high one wing's flap takes it. Two together take it twice as high.
  sink: 1.7, // How fast it comes down at the most with its wings down,
  glide: 0.42, // and with both held up. One held up is half way between.
  ceiling: 4.3, // As high as it goes.
  // The same wing flapping again in the air, without the other one having flapped since, lifts by this share of a
  // hop at the most, and never above where one hop gets to: enough to stay up over a pond, and not to climb over a
  // fence. A bird needs both wings for that.
  again: 0.4,
  open: 1.2, // A flap made with the hand open is this much stronger. A closed hand's is never weaker for it.
  together: 0.4, // Two wings flapping within this many seconds of each other are flapping together.
  tumble: 1, // Seconds a tumble takes, a splash, and being dizzy after bumping the scarecrow.
  splash: 1.3,
  dizzy: 0.8,
  reach: 0.62, // How near it has to come to a piece of corn to have it.
};

// The fox: how far behind the chick he is. He starts a good way back, a tumble brings him this much nearer and
// each thing cleared without one takes the chick this much further ahead. At caught, the hen comes. On the track
// ahead, a chick on the ground stops standoff short of him.
export const FOX = { start: 3.4, most: 4.2, caught: 0.9, nearer: 0.85, further: 0.3, after: 3.6, standoff: 1.5 };
// The fox that can catch: a chick standing at something has this many seconds before he comes on, or first, at
// the first thing of a flight, while the child finds out what to do. Then he comes this much nearer each second.
// Catching it takes a moment, in which he comes right up to it and lifts it.
export const HUNT = { patience: 3, first: 8, creep: 0.22, seconds: 1.4, held: 0.25, lift: 0.5 };
// The mother hen: after this many flaps at one thing that didn't get over it, she helps. Carrying the chick takes
// seconds, and a little more for each unit she carries it, as high as high, and she sets it down beyond what was
// in the way. Flying home together, a chick the rest have waited flockAfter seconds for is carried up to them.
export const HEN = { fails: 3, seconds: 2.4, perUnit: 0.12, high: 2.7, beyond: 0.9, flockAfter: 10, flockBehind: 1.8 };
// Flying home together: a chick more than leash ahead of the last one waits for it, once it's on the ground.
export const FLOCK = { leash: 3.5 };
export const AHEAD = 11.2; // How far ahead of the chick the screen shows, which is how early a thing is seen.
export const FIRST = 10; // Where the first thing is.
// The hen house: how far it is after the last thing, how far in front of it the chick is home, and the party.
export const HOME = { before: 6.5, door: 1.6, party: 2.4 };

// What's in the way. A wall has to be flown over, and is safe to land on. Water has to be crossed in the air, and
// is so many seconds of running wide. The scarecrow has to be run under. A gust is a stretch of wind that carries
// a chick that's in the air. wings is how many have to flap to get over it from the ground.
export const KINDS = {
  log: { type: 'wall', tall: 0.62, wide: 1.1, wings: 1 },
  fence: { type: 'wall', tall: 1.9, wide: 0.3, wings: 2 },
  hay: { type: 'wall', tall: 1.1, wide: 1.2, wings: 1 },
  tractor: { type: 'wall', tall: 2, wide: 3.6, wings: 2 },
  fox: { type: 'wall', tall: 1.5, wide: 1.1, wings: 2 },
  pond: { type: 'water', seconds: 2, wings: 2 },
  duckpond: { type: 'water', seconds: 3.4, wings: 2 },
  scarecrow: { type: 'over', low: 1.55, top: 3.3, wide: 1.5, wings: 0 },
  gust: { type: 'zone', wide: 8, wings: 1 },
};
export const HAY = { bales: 3, gap: 1.6 }; // Hay bales come in a row, this far apart.
// The tractor trundles along ahead of the chick, this far, once the chick is this near, and then turns off.
export const TRACTOR = { speed: 0.8, goes: 10, from: 11 };
// The duck: how wide and high her back is, how fast she swims with the chick, and how fast she comes to catch it.
export const DUCK = { wide: 1.3, tall: 0.3, swims: 1.7, comes: 4 };
// The wind: how high it carries a chick, how fast it lifts it, how much faster it goes, and where the thing in it is.
export const GUST = { high: 3, lift: 2.6, faster: 1.35, inside: 4.2, after: 2.2 };
// The fox sets off round the back of the hedge when the chick is this far from where he'll wait, and takes this long.
export const SHORTCUT = { from: 18, seconds: 2 };

/** What changes from level 1 to 10. Each level from 2 brings something new: see NEWS. */
export function farmLevel(level) {
  const at = clampLevel(level);
  return {
    // How fast the chick runs, and how far it is from one thing to the next: a little quicker and closer each level.
    speed: ramp(at, 2.2, 2.86),
    spacing: ramp(at, 14, 13.4),
    corn: at >= 2,
    fence: at >= 3,
    pond: at >= 4,
    scarecrow: at >= 5,
    gust: at >= 6,
    hay: at >= 7,
    duckpond: at >= 8,
    tractor: at >= 9,
    fox: at >= 10,
  };
}

/** Seconds from a thing coming into view to the chick reaching it, and from one thing to the next, at a level. */
export function timesAt(level) {
  const { speed, spacing } = farmLevel(level);
  return { seen: AHEAD / speed, between: spacing / speed };
}

// What each level brings that's new, for the title card, the countdown and the finish card. key says which part
// of farmLevel turns it on, which the unit tests check.
export const NEWS = {
  2: [{ key: 'corn', mark: '🌽', name: 'Corn to catch', nameKa: 'დასაჭერი სიმინდი' }],
  3: [{ key: 'fence', mark: '🚧', name: 'Fences', nameKa: 'ღობეები' }],
  4: [{ key: 'pond', mark: '💦', name: 'The pond', nameKa: 'ტბორი' }],
  5: [{ key: 'scarecrow', mark: '👒', name: 'The scarecrow', nameKa: 'საფრთხობელა' }],
  6: [{ key: 'gust', mark: '🍃', name: 'A gust of wind', nameKa: 'ქარის ნაკადი' }],
  7: [{ key: 'hay', mark: '🌾', name: 'Hay bales', nameKa: 'თივის ზვინები' }],
  8: [{ key: 'duckpond', mark: '🦆', name: 'The friendly duck', nameKa: 'კეთილი იხვი' }],
  9: [{ key: 'tractor', mark: '🚜', name: 'The tractor', nameKa: 'ტრაქტორი' }],
  10: [{ key: 'fox', mark: '🦊', name: 'The fox’s shortcut', nameKa: 'მელიის მოკლე გზა' }],
};

// The little label each new thing has beside it the first time it comes in a game, in English and Georgian.
// Nothing new is said out loud.
export const LABELS = {
  corn: ['Catch the corn!', 'სიმინდი დაიჭირე!'],
  fence: ['Both wings for a fence!', 'ღობეს ორივე ფრთა უნდა!'],
  pond: ['Keep your wings up!', 'ფრთები მაღლა გეჭიროს!'],
  scarecrow: ['Run under it!', 'ქვეშ გაირბინე!'],
  gust: ['The wind carries you!', 'ქარი წაგიყვანს!'],
  hay: ['Hop from one to the next!', 'ერთიდან მეორეზე გადახტი!'],
  duckpond: ['The duck gives you a ride!', 'იხვი გაგასეირნებს!'],
  tractor: ['Fly over the tractor!', 'ტრაქტორს გადაუფრინე!'],
  fox: ['Fly over the fox!', 'მელიას გადაუფრინე!'],
  // And three that aren't a level's: the mother hen's help, the first flap with an open hand, and waiting for a
  // friend's chick, flying home together.
  hen: ['Mother hen helps!', 'დედა კრუხი გეხმარება!'],
  open: ['Open wings fly higher!', 'გაშლილი ფრთებით უფრო მაღლა აფრინდები!'],
  flock: ['Waiting for the flock', 'გუნდს ველოდებით'],
};

// The things the levels bring, the newest first, apart from fences, which take turns with the logs.
const SPECIALS = ['fox', 'tractor', 'duckpond', 'hay', 'gust', 'scarecrow', 'pond'];
// With friends, each on their own computer, only what stays where it is: nothing that moves by a game's own clock.
export const NOT_WITH_FRIENDS = ['fox', 'tractor', 'duckpond'];

/** What's new at a level, as [{ key, mark, name, nameKa }]. Nothing at level 1. */
export const farmNewAt = (level) => NEWS[clampLevel(level)] ?? [];

/** Whether the part of a level that a piece of news names is on. */
export const newsIsOn = (key, level) => Boolean(farmLevel(level)[key]);

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const mix = (from, to, share) => from + (to - from) * share;
const ease = (share) => share * share * (3 - 2 * share);

/**
 * The flight of a flap from the ground, with the wings dropped again straight after it: how high the chick is so
 * many seconds after a flap by wings wings, 1 or 2.
 */
export function heightAfter(seconds, wings = 1) {
  const { gravity, hop, sink } = CHICK;
  const launch = Math.sqrt(2 * gravity * hop * wings);
  const top = launch / gravity;
  if (seconds <= top) return Math.max(0, launch * seconds - (gravity * seconds * seconds) / 2);
  const apex = hop * wings;
  const falling = seconds - top;
  const speedingUp = sink / gravity;
  if (falling <= speedingUp) return Math.max(0, apex - (gravity * falling * falling) / 2);
  return Math.max(0, apex - (gravity * speedingUp * speedingUp) / 2 - sink * (falling - speedingUp));
}

/**
 * When a flap has to be made to clear something tall high, with wings wings and the wings dropped straight after:
 * { early, late }, from so many seconds before the chick reaches it until so many. Holding the wings up, or
 * flapping again, only makes more room. null if it can't be cleared like that at all.
 */
export function flapWindow(tall, wings = 1) {
  const step = 0.01;
  let early = null;
  let late = null;
  for (let t = step; t < 8; t += step) {
    if (heightAfter(t, wings) > tall + 0.04) {
      if (late === null) late = t;
      early = t;
    } else if (late !== null) break;
  }
  return late === null ? null : { early, late };
}

/**
 * The painted stretch of track before a thing, where to flap, for a chick running at speed: { from, to }, along the
 * track, or null for what isn't flown over. For a wall, a flap anywhere on it carries the chick over even with the
 * wings dropped straight after. For water it's the bank, where the flap starts and the wings have to stay up.
 */
export function zoneFor(thing, speed) {
  if (thing.type === 'over' || thing.type === 'zone' || !thing.wings) return null;
  const front = thing.x0 - CHICK.r;
  if (thing.type === 'water') return { from: front - 1.6, to: front };
  const window = flapWindow(thing.tall, thing.wings);
  if (!window) return null;
  const closing = speed - (thing.kind === 'tractor' ? TRACTOR.speed : 0);
  return { from: front - window.early * closing, to: front - window.late * closing };
}

/**
 * Lays out the way home: what's in the way and where, the corn over it, and where the hen house is. level is the
 * level played and things how many things are in the way. random gives numbers from 0 to 1, the same ones on every
 * friend's computer. friends leaves out what moves by a game's own clock.
 */
export function layTrack({ level = 1, things = WAYS.medium, random = Math.random, friends = false } = {}) {
  const plan = farmLevel(level);
  const specials = SPECIALS.filter((kind) => plan[kind] && !(friends && NOT_WITH_FRIENDS.includes(kind)));
  // The fox needs the chick to have set off before he can run round it, so he's the second of them, not the first.
  if (specials[0] === 'fox' && specials.length > 1) [specials[0], specials[1]] = [specials[1], specials[0]];
  const made = [];
  const corn = [];
  let nextId = 1;
  let cursor = FIRST;
  // The level's things take turns, the newest first, with a log between each and the next, or from level 3 a log
  // and a fence by turns. With nothing but logs and fences, as at level 3, the fence comes first.
  const kindAt = (slot) => {
    if (!specials.length) return plan.fence && slot % 2 === 0 ? 'fence' : 'log';
    if (slot % 2 === 0) return specials[(slot / 2) % specials.length];
    return plan.fence && ((slot - 1) / 2) % 2 === 0 ? 'fence' : 'log';
  };
  const add = (kind, x0, extra = {}) => {
    const spec = KINDS[kind];
    const wide = spec.type === 'water' ? spec.seconds * plan.speed : spec.wide;
    const thing = { id: nextId, kind, type: spec.type, x0, x1: x0 + wide, tall: spec.tall ?? 0, wings: spec.wings, tries: 0, fails: 0, stopped: false, done: false, clean: true, ...extra };
    if (spec.type === 'over') Object.assign(thing, { low: spec.low, top: spec.top, bonked: false });
    if (kind === 'duckpond') thing.duck = { x: x0 + wide * 0.3, riding: false };
    if (kind === 'tractor') Object.assign(thing, { moving: false, gone: 0, away: false });
    if (kind === 'fox') Object.assign(thing, { waiting: false, standoff: FOX.standoff });
    nextId += 1;
    made.push(thing);
    return thing;
  };
  const piece = (x, h, extra = {}) => {
    corn.push({ id: nextId, x, h, taken: false, ...extra });
    nextId += 1;
  };
  /** Corn in a line at one height. */
  const line = (from, to, high, count, extra) => {
    for (let n = 0; n < count; n += 1) piece(mix(from, to, count === 1 ? 0.5 : n / (count - 1)), high, extra);
  };
  /**
   * Corn along the way a flap takes the chick: one made at a place along the track, with so many wings, has the
   * chick's middle at each of these so many seconds later, coming down neither as fast as it can nor as slowly.
   */
  const along = (from, wings, times) => {
    const top = Math.sqrt((2 * CHICK.hop * wings) / CHICK.gravity);
    for (const t of times) {
      const high = t <= top ? heightAfter(t, wings) : CHICK.hop * wings - ((CHICK.sink + CHICK.glide) / 2) * (t - top);
      piece(from + plan.speed * t, Math.max(0.42, high + CHICK.tall / 2));
    }
  };

  for (let slot = 0; slot < things; slot += 1) {
    const kind = kindAt(slot);
    let end = cursor;
    if (kind === 'hay') {
      // A row of bales, to hop along, with corn over the first and over each gap.
      for (let n = 0; n < HAY.bales; n += 1) {
        const bale = add('hay', cursor + n * (KINDS.hay.wide + HAY.gap), { first: n === 0 });
        end = bale.x1;
        if (!plan.corn) continue;
        const zone = zoneFor(bale, plan.speed);
        if (n === 0) along(mix(zone.from, zone.to, 0.5), 1, [0.35, 0.75]);
        else line(bale.x0 - HAY.gap * 0.75, bale.x0 - HAY.gap * 0.25, bale.tall + 1.25, 2);
      }
    } else if (kind === 'gust') {
      // A stretch of wind, with a pond or a fence in it by turns, which the wind carries the chick over.
      const zone = add('gust', cursor);
      const held = add(Math.floor(slot / 2) % 2 === 0 && plan.pond ? 'pond' : 'fence', cursor + GUST.inside, { inGust: zone.id });
      zone.x1 = Math.max(zone.x1, held.x1 + GUST.after);
      end = zone.x1;
      if (plan.corn) line(zone.x0 + 2.6, zone.x1 - 0.4, GUST.high + CHICK.tall / 2, 7);
    } else {
      const thing = add(kind, cursor);
      end = thing.x1;
      const zone = zoneFor(thing, plan.speed);
      if (!plan.corn) {
        // No corn yet.
      } else if (kind === 'tractor') {
        // Corn on top of the hay, which goes along with the cart.
        line(thing.x0 + 0.5, thing.x1 - 1.3, thing.tall + CHICK.tall / 2, 4, { rides: thing.id });
      } else if (thing.type === 'wall') {
        along(mix(zone.from, zone.to, 0.5), thing.wings, thing.wings === 2 ? [0.35, 0.7, 1.05, 1.45, 1.85] : [0.3, 0.7, 1.1]);
      } else if (kind === 'duckpond') {
        // Over the near half, and low over the far half, where the duck swims with the chick on her back.
        along(zone.to - 0.3, 2, [0.4, 0.85, 1.3]);
        line(mix(thing.x0, thing.x1, 0.6), thing.x1 - 0.9, DUCK.tall + CHICK.tall / 2, 3);
      } else if (thing.type === 'water') {
        along(zone.to - 0.3, 2, [0.45, 0.95, 1.45, 1.95]);
      } else {
        line(thing.x0 - 0.6, thing.x1 + 0.6, 0.42, 3);
      }
    }
    // A little uneven, so the things don't come like a clock.
    cursor = Math.max(cursor + plan.spacing, end + plan.spacing * 0.72) + (random() - 0.5) * 1.2;
  }
  const last = made.at(-1);
  return { things: made, corn, end: (last ? last.x1 : FIRST) + HOME.before };
}

export class Farm {
  /**
   * level is the level played. things is how many things are in the way, fox what a flap that misses does
   * ('tumble' or 'wait'), and single the one hand that works both wings, 'left' or 'right', or null when each hand
   * is a wing, all as a grown-up chose. together is flying home with friends as one flock, and friends that there
   * are friends at all. random lays out the track. onEvent hears what happens: see main.js.
   */
  constructor({ level = 1, things = WAYS.medium, fox = 'tumble', single = null, together = false, friends = false, random = Math.random, onEvent = () => {} } = {}) {
    Object.assign(this, { single, together, friends, onEvent });
    this.level = clampLevel(level);
    this.plan = farmLevel(level);
    this.gentle = fox === 'wait';
    // The fox that can catch is for a chick on its own: a flock is never hunted.
    this.catches = fox === 'catch' && !friends && !together;
    this.lost = false; // Whether the fox caught the chick, which is how a flight is lost.
    const track = layTrack({ level, things, random, friends });
    this.things = track.things;
    this.corn = track.corn;
    this.end = track.end;
    this.time = 0;
    this.done = false;
    this.started = false;
    // The chick: where it is along the track, how high, how fast it's rising, and what it's doing: 'run' (on the
    // ground or in the air), 'tumble', 'splash', 'carried' by the hen, 'ride' on the duck, 'door', at the hen house
    // waiting for the flock, and 'home'. waiting is the thing it has stopped at, waitFor how long it has stood there,
    // and behind the tractor it's following.
    this.chick = { x: 0, h: 0, vy: 0, state: 'run', t: 0, air: false, dizzy: 0, waiting: null, waitFor: 0, behind: null, flockWait: false };
    this.wings = { left: { lift: 0, up: false, seen: false }, right: { lift: 0, up: false, seen: false } };
    this.flock = [];
    // The fox: 'chase', behind the chick by gap, 'dash', on his way round, and 'ahead', waiting on the track.
    this.fox = { mode: 'chase', gap: FOX.start, sitting: false, t: 0, thing: null };
    this.hen = null; // The mother hen, while she's carrying the chick: { why, from, to, t, seconds }.
    this.script = null; // What a tumble, a splash or a ride is about: { from, thing, high, seconds }.
    this.mercy = false; // After a tumble, the next thing is never tumbled over.
    this.restFor = 0; // Seconds since a wing last flapped.
    this.lastWing = null;
    this.lastFlapAt = { left: -Infinity, right: -Infinity };
    this.lastTogetherAt = -Infinity;
    this.behindFor = 0;
    this.partyLeft = 0;
    this.stats = {
      seconds: 0,
      flaps: { left: 0, right: 0 },
      together: 0,
      open: 0,
      held: { left: 0, right: 0 },
      cleared: 0,
      clean: 0,
      tumbles: 0,
      splashes: 0,
      bonks: 0,
      hen: 0,
      rides: 0,
      corn: 0,
      cornOut: this.corn.length,
    };
  }

  /** The countdown is over: off the chick goes. */
  begin() {
    this.started = true;
  }

  /** The things that count as one each to get past: a row of bales is one, and so is a gust with what's in it. */
  get counted() {
    return this.things.filter((thing) => thing.type !== 'zone' && !(thing.kind === 'hay' && !thing.first));
  }

  /** How many things there are to get past, how many the chick has, and how far along the way home it is. */
  get progress() {
    const { counted } = this;
    return { of: counted.length, past: counted.filter((thing) => thing.done).length, along: clamp(this.chick.x / this.end, 0, 1) };
  }

  /** The next thing ahead that hasn't been got past, or null. */
  get next() {
    return this.things.find((thing) => !thing.done && thing.type !== 'zone') ?? null;
  }

  /** Whether the chick is resting: stopped at something, with the child not flapping. */
  get resting() {
    return Boolean(this.chick.waiting) && this.restFor > 2;
  }

  /* ---------- where things are ---------- */

  /** Whether a thing is there to bump into or stand on: the fox only once he's waiting, the tractor until it turns off. */
  solid(thing) {
    return thing.type === 'wall' && !thing.away && (thing.kind !== 'fox' || thing.waiting);
  }

  /** How high whatever is under a place is: the top of a log, a bale or the hay cart, or the ground. */
  floorAt(x) {
    let floor = 0;
    for (const thing of this.things) {
      if (this.solid(thing) && x > thing.x0 - CHICK.r * 0.6 && x < thing.x1 + CHICK.r * 0.6) floor = Math.max(floor, thing.tall);
    }
    return floor;
  }

  /** The water under a place, if there is any. */
  waterAt(x) {
    return this.things.find((thing) => thing.type === 'water' && x > thing.x0 + 0.05 && x < thing.x1 - 0.05) ?? null;
  }

  /** The stretch of wind a place is in, if it's in one. */
  gustAt(x) {
    return this.things.find((thing) => thing.type === 'zone' && x > thing.x0 && x < thing.x1) ?? null;
  }

  /** The painted stretch of track before a thing, where to flap: see zoneFor. */
  zoneOf(thing) {
    return zoneFor(thing, this.plan.speed);
  }

  /* ---------- one frame ---------- */

  /**
   * One frame. wings is { left, right }, each { lift, up, seen }: how far up that wing is, whether it's up, and
   * whether its hand can be seen. flaps lists the wings that flapped just now, and open says which of them were
   * flapped with an open hand. flock is the friends' chicks, each { x, home, gone, carried }, flying home together
   * or racing.
   */
  update(dt, { wings = this.wings, flaps = [], open = {}, flock = [] } = {}) {
    if (this.done || !this.started) return;
    const { chick, stats } = this;
    this.time += dt;
    stats.seconds += dt;
    this.wings = wings;
    this.flock = flock;
    // With one hand working both wings, only that hand's flaps and its time held up are the child's.
    const mine = this.single ? flaps.filter((side) => side === this.single) : flaps;
    for (const side of this.single ? [this.single] : ['left', 'right']) if (wings[side].up) stats.held[side] += dt;
    this.restFor = mine.length ? 0 : this.restFor + dt;
    flaps = mine;
    this.countFlaps(flaps, open);
    if (chick.dizzy > 0) chick.dizzy = Math.max(0, chick.dizzy - dt);

    this.moveThings(dt);
    if (chick.state === 'run') this.fly(dt, flaps, open);
    else if (chick.state === 'tumble' || chick.state === 'splash') this.playScript(dt);
    else if (chick.state === 'carried') this.carry(dt);
    else if (chick.state === 'ride') this.ride(dt, flaps, open);
    else if (chick.state === 'door') this.waitAtDoor(dt);
    else if (chick.state === 'home') this.party(dt);
    else if (chick.state === 'caught') this.held(dt);

    this.pickCorn();
    this.passThings();
    this.fox.sitting = Boolean(chick.waiting) || chick.flockWait || ['carried', 'door', 'home'].includes(chick.state);
    if (this.catches) this.hunt(dt);
    if (this.together) this.keepWithFlock(dt);
  }

  /**
   * The fox that can catch. While the chick stands at something he sits for a moment, and then he's up and coming
   * on. Right behind a chick that's on the ground, he has it. A child whose hands the camera can't see isn't
   * hunted: he waits, as the game does.
   */
  hunt(dt) {
    const { chick, fox, wings } = this;
    if (fox.mode !== 'chase' || chick.state !== 'run') return;
    const seen = Boolean(wings?.left?.seen || wings?.right?.seen);
    const patience = this.stats.cleared === 0 ? HUNT.first : HUNT.patience;
    if (chick.waiting && !chick.air && chick.waitFor >= patience && seen) {
      fox.sitting = false;
      const before = fox.gap;
      fox.gap = Math.max(FOX.caught, fox.gap - HUNT.creep * dt);
      // Said once each time he gets up and comes on.
      if (!fox.coming && fox.gap < before) {
        fox.coming = true;
        this.onEvent({ type: 'fox-coming', thing: chick.waiting });
      }
    } else if (!chick.waiting || chick.air) {
      fox.coming = false;
    }
    if (fox.gap <= FOX.caught && !chick.air) this.catchChick(null);
  }

  /** The fox has the chick: the one trotting behind, or the one waiting on the track, by. */
  catchChick(by) {
    const { chick } = this;
    if (chick.state === 'caught' || this.done) return;
    Object.assign(chick, { state: 'caught', t: 0, vy: 0, air: false, waiting: null, behind: null, dizzy: 0 });
    this.script = null;
    this.caughtBy = by;
    this.caughtAt = chick.h;
    this.onEvent({ type: 'caught', thing: by });
  }

  /** In the fox's paws: he comes right up and lifts the chick off the ground, and that flight is over. */
  held(dt) {
    const { chick, fox } = this;
    chick.t = Math.min(1, chick.t + dt / HUNT.seconds);
    if (fox.mode === 'chase') fox.gap = Math.max(HUNT.held, fox.gap - 2.4 * dt);
    chick.h = mix(this.caughtAt, HUNT.lift, ease(clamp(chick.t * 2, 0, 1)));
    if (chick.t < 1) return;
    this.lost = true;
    this.done = true;
  }

  /** Every flap is counted, whatever the chick is doing: it's the child's own work. */
  countFlaps(flaps, open) {
    const { stats } = this;
    for (const side of flaps) {
      stats.flaps[side] += 1;
      if (open[side]) stats.open += 1;
      const other = side === 'left' ? 'right' : 'left';
      // Both wings within a moment of each other are flapping together, counted once.
      if (this.time - this.lastFlapAt[other] <= CHICK.together && this.lastFlapAt[other] > this.lastTogetherAt) {
        stats.together += 1;
        this.lastTogetherAt = this.time;
      }
      this.lastFlapAt[side] = this.time;
    }
  }

  /**
   * A set of flaps lifts the chick: each wing's flap adds a hop's worth of height to wherever it was going, and
   * more with the hand open. With one hand working both wings, its flap is both wings' at once. The same wing
   * again in the air, without the other having flapped since, only holds the chick up, and never above where one
   * wing's hop gets to. Returns how many wings' worth of lift that was.
   */
  liftBy(flaps, open) {
    const { chick } = this;
    let lift = 0;
    for (const side of flaps) {
      const stronger = open[side] ? CHICK.open : 1;
      if (!this.single && chick.air && this.lastWing === side) {
        const room = Math.min(CHICK.hop * CHICK.again, CHICK.hop - chick.h) * stronger;
        chick.vy = Math.max(chick.vy, Math.sqrt(2 * CHICK.gravity * Math.max(0, room)));
        lift += CHICK.again * stronger;
      } else {
        const wings = (this.single ? 2 : 1) * stronger;
        chick.vy = Math.sqrt(Math.max(chick.vy, 0) ** 2 + 2 * CHICK.gravity * CHICK.hop * wings);
        lift += wings;
      }
    }
    // Both at once is neither one's turn next.
    this.lastWing = flaps.length === 1 && !this.single ? flaps[0] : null;
    return lift;
  }

  /** The chick takes off, or climbs. Returns whether it did. */
  flapUp(flaps, open) {
    const { chick } = this;
    if (!flaps.length || chick.dizzy > 0) return false;
    const energy = this.liftBy(flaps, open);
    chick.air = true;
    // A flap on the way to something is a try at it.
    const { next } = this;
    if (next && next.x0 - chick.x < AHEAD) next.tries += 1;
    this.onEvent({ type: 'flap', sides: flaps, energy, open: flaps.some((side) => open[side]) });
    return true;
  }

  /** What moves by itself: the tractor, the duck, and the fox on his way round. */
  moveThings(dt) {
    const { chick, fox } = this;
    for (const thing of this.things) {
      if (thing.done) continue;
      if (thing.kind === 'tractor') {
        // It sets off as the chick comes up behind, and trundles along until it turns off the track.
        if (!thing.moving && thing.x0 - chick.x < TRACTOR.from) {
          thing.moving = true;
          this.onEvent({ type: 'tractor', thing });
        }
        if (thing.moving) {
          const step = TRACTOR.speed * dt;
          thing.x0 += step;
          thing.x1 += step;
          thing.gone += step;
          for (const piece of this.corn) if (piece.rides === thing.id) piece.x += step;
          if (thing.gone >= TRACTOR.goes) this.passed(thing, { away: true });
        }
      } else if (thing.kind === 'duckpond' && !thing.duck.riding && chick.state === 'run') {
        // The duck swims to wherever the chick is coming down over her pond.
        const over = chick.air && chick.x > thing.x0 && chick.x < thing.x1;
        const to = clamp(over ? chick.x : thing.x0 + (thing.x1 - thing.x0) * 0.3, thing.x0 + DUCK.wide * 0.6, thing.x1 - DUCK.wide * 0.6);
        thing.duck.x += clamp(to - thing.duck.x, -DUCK.comes * dt, DUCK.comes * dt);
      } else if (thing.kind === 'fox' && !thing.waiting && fox.mode === 'chase' && thing.x0 - chick.x < SHORTCUT.from) {
        // The fox sets off round the back of the hedge, to wait for the chick on the track ahead.
        Object.assign(fox, { mode: 'dash', t: 0, thing });
        this.onEvent({ type: 'shortcut', thing });
      }
    }
    if (fox.mode === 'dash') {
      fox.t += dt / SHORTCUT.seconds;
      if (fox.t >= 1) {
        fox.mode = 'ahead';
        fox.thing.waiting = true;
        this.onEvent({ type: 'fox-ahead', thing: fox.thing });
      }
    }
  }

  /** Running and flying: the chick's own frame. */
  fly(dt, flaps, open) {
    const { chick } = this;
    this.flapUp(flaps, open);
    // Off the end of a log or a bale, it's in the air.
    if (!chick.air && chick.h > this.floorAt(chick.x) + 0.001) chick.air = true;
    const ups = Number(this.wings.left.up) + Number(this.wings.right.up);

    // Up and down. In a gust of wind a chick in the air is carried up, and doesn't sink.
    const gust = chick.air ? this.gustAt(chick.x) : null;
    const rising = chick.vy;
    if (gust) {
      chick.vy = Math.max(chick.vy - CHICK.gravity * dt, Math.min(GUST.lift, (GUST.high - chick.h) * 2));
      if (!gust.blew) {
        gust.blew = true;
        this.onEvent({ type: 'gust', thing: gust });
      }
    } else if (chick.air) {
      chick.vy = Math.max(chick.vy - CHICK.gravity * dt, -mix(CHICK.sink, CHICK.glide, ups / 2));
    }
    // By how fast it was going at the start of the frame and at the end, so it flies the same at any frame rate.
    if (chick.air) chick.h += ((rising + chick.vy) / 2) * dt;
    if (chick.h > CHICK.ceiling) {
      chick.h = CHICK.ceiling;
      chick.vy = Math.min(chick.vy, 0);
    }

    // Along, as far as the hen house. A chick ahead of its flock waits for it, on the ground, and so does one ahead
    // of a chick the mother hen is carrying up, until she has set it down just behind.
    const home = this.end - HOME.door;
    let to = Math.min(home, chick.x + this.plan.speed * (gust ? GUST.faster : 1) * dt);
    chick.flockWait = false;
    if (this.together && !chick.air) {
      const others = this.flock.filter((friend) => !friend.gone);
      const last = Math.min(Infinity, ...others.map((friend) => friend.x));
      const henComing = others.some((friend) => friend.carried && friend.x < chick.x);
      if (chick.x - last >= FLOCK.leash || henComing) {
        to = chick.x;
        chick.flockWait = true;
      }
    }
    const blocked = this.blockAt(to);
    if (blocked) to = Math.min(to, blocked.at);
    chick.x = Math.max(chick.x, to);

    this.bumpScarecrow();
    this.land(blocked?.thing ?? null);
    if (chick.state !== 'run') return;
    this.standAt(blocked?.thing ?? null, dt);
    if (chick.state === 'run' && chick.x >= home - 0.001) this.reachHome();
  }

  /**
   * What stops the chick getting to a place along the track: a wall it isn't high enough to clear, or the edge of
   * water when it's on the ground. Returns { thing, at }, at being as far as it can go, or null.
   */
  blockAt(to) {
    const { chick } = this;
    let found = null;
    for (const thing of this.things) {
      if (thing.done || !(this.solid(thing) || thing.type === 'water')) continue;
      // On the ground, a chick stops a little way short of the fox.
      const short = thing.standoff && !chick.air ? thing.standoff : 0;
      const at = thing.x0 - CHICK.r - short;
      const inTheWay = thing.type === 'wall' ? chick.h < thing.tall - 0.02 : !chick.air;
      if (!inTheWay || chick.x > at + 0.001 || to <= at) continue;
      if (!found || at < found.at) found = { thing, at };
    }
    return found;
  }

  /** The scarecrow: a chick that's flying as it gets there bumps his arm, drops, and runs on under, dizzy. */
  bumpScarecrow() {
    const { chick } = this;
    for (const thing of this.things) {
      if (thing.type !== 'over' || thing.done || thing.bonked) continue;
      if (chick.x + CHICK.r <= thing.x0 || chick.x - CHICK.r >= thing.x1) continue;
      if (chick.h + CHICK.tall <= thing.low || chick.h >= thing.top) continue;
      thing.bonked = true;
      thing.clean = false;
      chick.h = Math.min(chick.h, thing.low - CHICK.tall - 0.02);
      chick.vy = Math.min(chick.vy, -1.2);
      chick.dizzy = CHICK.dizzy;
      this.stats.bonks += 1;
      this.onEvent({ type: 'bonk', thing });
      this.foxNearer();
    }
  }

  /** Coming down: onto the ground, onto the top of something, onto the duck's back, or into the water. */
  land(blocker) {
    const { chick } = this;
    if (!chick.air || chick.vy > 0) return;
    const top = this.floorAt(chick.x);
    const water = top === 0 ? this.waterAt(chick.x) : null;
    const duck = water?.duck && Math.abs(water.duck.x - chick.x) <= DUCK.wide * 0.75 ? water.duck : null;
    const floor = duck ? DUCK.tall : top;
    if (chick.h > floor) return;
    if (duck) {
      this.startRide(water);
      return;
    }
    if (water) {
      this.startSplash(water);
      return;
    }
    chick.h = floor;
    chick.vy = 0;
    chick.air = false;
    this.lastWing = null;
    this.onEvent({ type: 'land', on: floor > 0 ? 'top' : 'ground' });
    if (floor > 0) return;
    // Down right in front of the fox: he has it, or, where he never can, the mother hen is there first.
    const fox = this.things.find((thing) => thing.kind === 'fox' && thing.waiting && !thing.done && chick.x > thing.x0 - CHICK.r - thing.standoff + 0.01);
    if (fox) {
      if (this.catches) this.catchChick(fox);
      else this.callHen('fox', fox);
      return;
    }
    // Down again in front of what it was trying to get over: that flap didn't do it.
    if (blocker?.stopped) {
      blocker.fails += 1;
      if (blocker.fails >= HEN.fails) this.callHen('help', blocker);
    }
  }

  /** On the ground with something in the way: the chick tumbles over it if it was flown at, and otherwise waits. */
  standAt(thing, dt) {
    const { chick } = this;
    if (chick.air) return;
    if (!thing) {
      chick.waiting = null;
      return;
    }
    if (thing.kind === 'tractor') {
      // Stuck behind a tractor: the chick trots along after it until it flies over, or the tractor turns off.
      chick.behind = thing;
      thing.clean = false;
      return;
    }
    if (!thing.stopped) {
      // It ran into this having flapped on the way: too early, or not enough.
      if (thing.tries > 0 && thing.type === 'wall' && !this.gentle && !this.mercy) {
        if (thing.kind === 'fox' && this.catches) this.catchChick(thing);
        else if (thing.kind === 'fox') this.callHen('fox', thing);
        else this.startTumble(thing);
        return;
      }
      thing.stopped = true;
      thing.clean = false;
      chick.waitFor = 0;
      this.onEvent({ type: 'wait', thing });
    }
    chick.waiting = thing;
    chick.waitFor += dt;
  }

  /* ---------- tumbles, splashes, rides and the hen ---------- */

  startTumble(thing) {
    const { chick } = this;
    thing.clean = false;
    this.script = { from: chick.x, thing, high: thing.tall + 0.55, seconds: CHICK.tumble };
    Object.assign(chick, { state: 'tumble', t: 0, vy: 0, air: false, waiting: null });
    this.stats.tumbles += 1;
    this.onEvent({ type: 'tumble', thing });
    this.foxNearer();
  }

  startSplash(thing) {
    const { chick } = this;
    thing.clean = false;
    this.script = { from: chick.x, thing, high: 0, seconds: CHICK.splash };
    Object.assign(chick, { state: 'splash', t: 0, h: 0, vy: 0, air: false, waiting: null });
    this.lastWing = null;
    this.stats.splashes += 1;
    this.onEvent({ type: 'splash', thing });
    this.foxNearer();
  }

  /** A tumble over something, or a flutter out of the water, to just beyond it. */
  playScript(dt) {
    const { chick, script } = this;
    chick.t = Math.min(1, chick.t + dt / script.seconds);
    const to = script.thing.x1 + CHICK.r + 0.3;
    if (chick.state === 'tumble') {
      chick.x = mix(script.from, to, ease(chick.t));
      chick.h = Math.sin(Math.PI * chick.t) * script.high;
    } else {
      // Paddling for the first part, then a hop out onto the bank.
      const out = clamp((chick.t - 0.55) / 0.45, 0, 1);
      chick.x = mix(script.from, to, ease(clamp(chick.t / 0.9, 0, 1)));
      chick.h = -0.16 * (1 - out) + Math.sin(Math.PI * out) * 0.5;
    }
    if (chick.t < 1) return;
    Object.assign(chick, { state: 'run', h: 0, vy: 0, air: false, x: to });
    this.script = null;
    // The fox right behind: the mother hen is there first, unless he's one who can catch, and then he does.
    if (this.fox.mode === 'chase' && this.fox.gap <= FOX.caught && !this.catches) this.callHen('caught', null);
  }

  /**
   * A tumble brings the fox nearer: though never for two running, not when a grown-up has him keep his distance,
   * and not from a flock. The fox that can catch comes nearer every time.
   */
  foxNearer() {
    const spared = this.mercy && !this.catches;
    this.mercy = true;
    if (spared || this.gentle || this.together || this.fox.mode !== 'chase') return;
    this.fox.gap = Math.max(FOX.caught, this.fox.gap - FOX.nearer);
    this.onEvent({ type: 'fox-nearer', gap: this.fox.gap });
  }

  startRide(pond) {
    const { chick } = this;
    pond.duck.riding = true;
    Object.assign(chick, { state: 'ride', h: DUCK.tall, vy: 0, air: false, x: pond.duck.x, waiting: null });
    this.script = { thing: pond };
    this.lastWing = null;
    this.stats.rides += 1;
    this.onEvent({ type: 'ride', thing: pond });
  }

  /** On the duck's back, across the pond. A flap takes off from her, and at the bank the chick hops down. */
  ride(dt, flaps, open) {
    const { chick, script } = this;
    const pond = script.thing;
    const { duck } = pond;
    const bank = pond.x1 - DUCK.wide * 0.55;
    duck.x = Math.min(bank, duck.x + DUCK.swims * dt);
    chick.x = duck.x;
    const landed = duck.x >= bank;
    if (!landed && !this.flapUp(flaps, open)) return;
    if (landed) {
      chick.vy = 2.6;
      this.onEvent({ type: 'ride-off', thing: pond });
    }
    Object.assign(chick, { state: 'run', air: true });
    duck.riding = false;
    this.script = null;
  }

  /**
   * The mother hen flies in and carries the chick on, over whatever is in the way. why is 'caught', the fox right
   * behind, 'fox', down in front of the fox on the track, 'help', after flaps that didn't get over something, or
   * 'flock', a chick its flock has waited for. to is where she sets it down, if that's known.
   */
  callHen(why, thing, to = null) {
    const { chick } = this;
    if (chick.state === 'carried' || chick.state === 'home' || chick.state === 'door') return;
    const ahead = thing ?? this.things.find((each) => !each.done && each.type !== 'zone' && each.x0 - chick.x < 6);
    let down = to ?? (ahead ? ahead.x1 + CHICK.r + HEN.beyond : chick.x + 3.5);
    // Never set down in the middle of something, or on water.
    for (const each of this.things) {
      if (each.type !== 'zone' && !each.away && down > each.x0 - CHICK.r - 0.3 && down < each.x1 + CHICK.r + 0.3) down = each.x1 + CHICK.r + HEN.beyond;
    }
    down = Math.max(chick.x, Math.min(down, this.end - HOME.door - 0.2));
    this.hen = { why, from: { x: chick.x, h: chick.h }, to: down, t: 0, seconds: HEN.seconds + HEN.perUnit * (down - chick.x) };
    Object.assign(chick, { state: 'carried', t: 0, vy: 0, air: false, waiting: null, behind: null, dizzy: 0 });
    this.script = null;
    this.stats.hen += 1;
    this.onEvent({ type: 'hen', why, to: down });
  }

  /** Up, along and down again, on the hen's back. */
  carry(dt) {
    const { chick, hen } = this;
    hen.t = Math.min(1, hen.t + dt / hen.seconds);
    chick.t = hen.t;
    const along = ease(clamp((hen.t - 0.18) / 0.64, 0, 1));
    const up = hen.t < 0.25 ? ease(hen.t / 0.25) : hen.t > 0.8 ? 1 - ease((hen.t - 0.8) / 0.2) : 1;
    chick.x = mix(hen.from.x, hen.to, along);
    chick.h = mix(hen.t < 0.25 ? hen.from.h : 0, HEN.high, up);
    if (hen.t < 1) return;
    Object.assign(chick, { state: 'run', h: 0, vy: 0, air: false });
    // The fox has sat down, a good way back, and the chick starts afresh.
    if (hen.why === 'caught' || hen.why === 'fox') this.fox.gap = Math.max(this.fox.gap, FOX.after);
    this.mercy = true;
    this.hen = null;
    this.onEvent({ type: 'set-down' });
  }

  /* ---------- what's along the way ---------- */

  /** The chick has any corn it comes near, in the air or on the ground. */
  pickCorn() {
    const { chick } = this;
    if (chick.state === 'home' || chick.state === 'door') return;
    for (const piece of this.corn) {
      if (piece.taken || Math.abs(piece.x - chick.x) > CHICK.reach) continue;
      if (Math.hypot(piece.x - chick.x, piece.h - (chick.h + CHICK.tall / 2)) > CHICK.reach) continue;
      piece.taken = true;
      this.stats.corn += 1;
      this.onEvent({ type: 'corn', piece });
    }
  }

  /** Things the chick has got past are done with. */
  passThings() {
    const { chick } = this;
    for (const thing of this.things) {
      if (!thing.done && chick.x - CHICK.r > thing.x1) this.passed(thing);
    }
  }

  /** One thing is behind the chick now. away is the tractor turning off the track with the chick still behind it. */
  passed(thing, { away = false } = {}) {
    const { chick, stats, fox } = this;
    thing.done = true;
    if (away) thing.away = true;
    if (chick.waiting === thing) chick.waiting = null;
    if (chick.behind === thing) chick.behind = null;
    if (thing.type === 'zone') return;
    const clean = thing.clean && !away && chick.state !== 'carried';
    // A row of bales is one thing got past.
    if (!(thing.kind === 'hay' && !thing.first)) {
      stats.cleared += 1;
      if (clean) stats.clean += 1;
    }
    if (clean) {
      // Clear of it without a stop or a tumble: the chick is further ahead, and the next one can be tumbled over.
      this.mercy = false;
      if (fox.mode === 'chase') fox.gap = Math.min(FOX.most, fox.gap + FOX.further);
    }
    if (thing.kind === 'fox') {
      // The fox jumped, and missed: he's behind again.
      Object.assign(fox, { mode: 'chase', gap: FOX.after, thing: null });
      thing.waiting = false;
      this.onEvent({ type: 'pounce', thing });
    }
    this.onEvent({ type: 'clear', thing, clean, away });
  }

  /* ---------- the flock, and home ---------- */

  /** Flying home together: a chick that's a long way behind the rest for a while is carried up to them. */
  keepWithFlock(dt) {
    const { chick } = this;
    const others = this.flock.filter((friend) => !friend.gone);
    if (!others.length || chick.state !== 'run') {
      this.behindFor = 0;
      return;
    }
    const first = Math.max(...others.map((friend) => friend.x));
    this.behindFor = first - chick.x >= FLOCK.leash - 0.3 ? this.behindFor + dt : 0;
    if (this.behindFor >= HEN.flockAfter && !chick.air) {
      this.behindFor = 0;
      this.callHen('flock', null, first - HEN.flockBehind);
    }
  }

  /** At the hen house. Together, the chick waits by the door until the whole flock is there. */
  reachHome() {
    const { chick } = this;
    Object.assign(chick, { state: 'door', t: 0, waiting: null, behind: null, air: false, vy: 0 });
    this.onEvent({ type: 'door' });
    this.waitAtDoor(0);
  }

  waitAtDoor(dt) {
    const { chick } = this;
    chick.t += dt;
    chick.h = Math.max(0, chick.h - 3 * dt);
    if (this.together && this.flock.some((friend) => !friend.gone && !friend.home)) return;
    chick.state = 'home';
    chick.t = 0;
    this.partyLeft = HOME.party;
    this.onEvent({ type: 'home' });
  }

  /** In through the door, and the party, before the finish card. */
  party(dt) {
    const { chick } = this;
    chick.t += dt;
    chick.h = Math.max(0, chick.h - 3 * dt);
    chick.x = Math.min(this.end, chick.x + this.plan.speed * 0.8 * dt);
    this.partyLeft -= dt;
    if (this.partyLeft <= 0) this.done = true;
  }

  /* ---------- for the tests, and the film of the game ---------- */

  /**
   * What a child who knows the game would do now: { wings, keep }. wings is how many hands to bring up, 0, 1 or 2,
   * and keep says to leave the hands as they are instead. For the tests and the film, which play it as a child
   * would: hands down while running, up for a flap in good time, kept up while the chick is over something, and
   * down again for the scarecrow.
   */
  wants() {
    const { chick } = this;
    const down = { wings: 0, keep: false };
    if (chick.state !== 'run') return down;
    const under = this.things.find((thing) => thing.type === 'over' && !thing.done && thing.x0 - chick.x < 5.5 && chick.x - CHICK.r < thing.x1);
    if (under) return down;
    const { next } = this;
    // In the air: kept up over water and over whatever is still in front, and let go once the way down is clear.
    if (chick.air) return this.waterAt(chick.x) || (next && next.x0 - chick.x < 2.6) ? { wings: 0, keep: true } : down;
    if (!next || next.type === 'over') return down;
    const zone = this.zoneOf(next);
    const ready = chick.waiting === next || chick.behind === next || this.gustAt(chick.x + 0.5) || (zone && chick.x >= mix(zone.from, zone.to, 0.3) && chick.x <= zone.to + 0.4);
    return ready ? { wings: Math.max(1, next.wings), keep: false } : down;
  }
}
