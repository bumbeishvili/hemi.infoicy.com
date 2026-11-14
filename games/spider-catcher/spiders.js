// The story and rules of Spider Catcher. Giraffe's little spider friends have run off all over the garden,
// and the child brings them home: a hand that opens near a spider and closes on it picks it up, it's
// carried to its web, and opening the hand over the web lets it in. Each spider home makes its web a
// little fuller. There's no screen in this file, so it runs in the unit tests.
//
// Lengths are in screen heights, times in seconds, so the game is the same on any screen.
import { ramp, stepsAt } from '../../core/levels.js';

// Each place in the garden: how many spiders live in its web, who's there, and what they say.
export const PLACES = [
  { place: 'gate', count: 3, who: 'giraffe', hello: 'My little spiders ran off! Please bring them home!' },
  { place: 'carrots', count: 3, who: 'mochi', hello: 'Spiders in my carrots! Help them home!' },
  { place: 'honey', count: 4, who: 'bramble', hello: 'One is swinging from my honey tree!' },
  { place: 'pond', count: 4, who: 'frost', hello: 'They’re playing by the pond. Catch them!' },
  {
    place: 'house',
    count: 3,
    who: 'giraffe',
    hello: 'The last ones! Then everyone is home!',
    done: 'Thank you! All my spiders are home!',
  },
];

// Which places get one more spider as the levels go up, in this order: the long ones in the middle.
const MORE_AT = ['honey', 'pond'];
// Where a ladybird comes to play instead of one of the spiders, from level 3: the second and fourth places.
const LADYBIRD_AT = ['carrots', 'pond'];
// Where the butterfly comes to help, from level 5, and where a treasure chest sits, from level 7. They
// take turns, so no place has both.
const BUTTERFLY_AT = ['gate', 'honey', 'house'];
const CHEST_AT = ['carrots', 'pond'];

/**
 * What each level brings, from 1 to 10. Spiders nobody plays with wander off: when no spider has been
 * caught or brought home for awayAfter seconds of the hand being in the picture, one heads for the edge of
 * the garden, and one that gets there has got away. GET_AWAY_MOST getting away ends the game. gentle is the
 * garden as it always was, where nothing has a time limit and nothing can be lost, with the gentler climb
 * from level to level. A spider let go of anywhere but its web just scuttles back to playing, at no cost,
 * either way. How far there is to reach is the grown-ups' choice, under How far to reach, and no level
 * changes it.
 */
export function gardenAt(level, { gentle = false } = {}) {
  return {
    // Places with one more spider to bring home: none at level 1, then one, then two.
    more: stepsAt(level, { 1: 0, 3: 1, 8: 2 }),
    // How many are out playing at once, while there are that many still to bring home.
    atOnce: stepsAt(level, { 1: 2, 3: 3, 6: 4 }),
    // The fastest a spider ever goes, in screen heights a second. At most 1.7 times level 1's, or 1.35 gently.
    speed: ramp(level, 0.07, gentle ? 0.094 : 0.12),
    // Seconds of play without a spider caught or brought home, before one heads off to get away. Never, gently.
    awayAfter: gentle ? Infinity : ramp(level, 24, 12),
    // How long one heading off takes to get to the edge of the garden. It can be caught all the way there.
    awayRun: gentle ? Infinity : ramp(level, 5, 3),
    // How far a scuttling spider goes either side of the middle of its path.
    wander: ramp(level, 0.09, 0.13),
    // How far a spider on its thread swings up and down, either side of the middle.
    swing: ramp(level, 0.05, 0.1),
    // How twisty a path is: 1 goes round in a loop, 2 is a figure of eight, 3 a pretzel.
    twist: stepsAt(level, { 1: 1, 3: 2, 8: 3 }),
    // From level 4, the web sways slowly on its branch, this far either way, in screen heights.
    webSway: level >= 4 ? ramp(level, 0.02, 0.06) : 0,
    // From level 5, some spiders are shy: the first time a hand comes near, they scuttle a little way
    // off. After that they can be caught like any other. This is the share of them that are shy.
    shy: stepsAt(level, { 1: 0, 5: 0.34, 8: 0.5 }),
    // From level 7, some spiders come in twos, holding hands, to bring home one after the other.
    pairs: stepsAt(level, { 1: 0, 7: 1, 9: 2 }),
    // From level 2, a spider caught leaves a berry on the leaf where it was, to pick up on the way back.
    berries: level >= 2,
    // From level 3, a ladybird plays at some places instead of a spider. She goes home to her flower.
    ladybird: level >= 3,
    // From level 4, some spiders are asleep. An open hand held by one for a moment wakes it, and it
    // wakes by itself after a while anyway. This is the share of them that start asleep.
    sleepy: stepsAt(level, { 1: 0, 4: 0.2, 8: 0.25 }),
    // From level 5, a butterfly comes to some places. Touching it makes the spiders slow right down to
    // watch it, for a few seconds.
    butterfly: level >= 5,
    // From level 6, a little basket sits in the grass at each place. Picked up, it carries two at once.
    basket: level >= 6,
    // From level 7, a treasure chest at some places, which an open hand held on it opens, for berries.
    chest: level >= 7,
    // From level 8, two webs, pink and blue, and each spider goes home to the web of its own colour.
    webs: stepsAt(level, { 1: 1, 8: 2 }),
    // From level 9, one spider at each place sails about on a leaf boat.
    boats: level >= 9,
    // At level 10, one spider at each place is golden, and brings a shower of berries home with it.
    golden: level >= 10,
  };
}

/**
 * The garden at a level when playing with friends: as many spiders, as quick, on paths as long and twisty as the
 * level has, and none of the new things the levels bring. Those would be one child's and not another's, and a
 * spider that dashes off from a hand, or sleeps until one wakes it, couldn't be in the same place on every screen.
 */
export function friendsGardenAt(level) {
  return {
    // The gentle climb, and nobody getting away, so that it's the same garden whatever each child's grown-up chose.
    ...gardenAt(level, { gentle: true }),
    webSway: 0,
    shy: 0,
    pairs: 0,
    berries: false,
    ladybird: false,
    sleepy: 0,
    butterfly: false,
    basket: false,
    chest: false,
    webs: 1,
    boats: false,
    golden: false,
  };
}

// What each level brings that's new, for the title card, the countdown and the finish card. key says
// which part of gardenAt turns it on, which the unit tests check.
const NEWS = {
  2: [{ key: 'berries', mark: '🍓', name: 'Berries', nameKa: 'კენკრა' }],
  3: [{ key: 'ladybird', mark: '🐞', name: 'Ladybird', nameKa: 'ჭიამაია' }, { key: 'twist', mark: '➰', name: 'Loopier paths', nameKa: 'მრუდე ბილიკები' }],
  4: [{ key: 'sleepy', mark: '💤', name: 'Sleepy spiders', nameKa: 'მძინარა ობობები' }, { key: 'webSway', mark: '🍃', name: 'Swaying web', nameKa: 'მოქანავე ქსელი' }],
  5: [{ key: 'butterfly', mark: '🦋', name: 'Butterfly', nameKa: 'პეპელა' }, { key: 'shy', mark: '🙈', name: 'Shy spiders', nameKa: 'მორცხვი ობობები' }],
  6: [{ key: 'basket', mark: '🧺', name: 'Basket for two', nameKa: 'კალათა ორისთვის' }],
  7: [{ key: 'chest', mark: '🧰', name: 'Treasure chest', nameKa: 'განძის სკივრი' }, { key: 'pairs', mark: '🤝', name: 'Holding hands', nameKa: 'ხელჩაკიდებულები' }],
  8: [{ key: 'webs', mark: '🎀', name: 'Two webs', nameKa: 'ორი ქსელი' }],
  9: [{ key: 'boats', mark: '⛵', name: 'Leaf boats', nameKa: 'ფოთლის ნავები' }],
  10: [{ key: 'golden', mark: '✨', name: 'Golden spider', nameKa: 'ოქროს ობობა' }],
};

/** What's new at a level, as [{ key, mark, name, nameKa }]. Nothing at level 1. */
export const spiderNewAt = (level) => NEWS[level] ?? [];

/** Whether the part of a level that a piece of news names is on. */
export function newsIsOn(key, level) {
  const at = gardenAt(level);
  if (key === 'twist') return at.twist > 1;
  if (key === 'webs') return at.webs > 1;
  return Boolean(at[key]);
}

// Prizes and helpers.
export const BERRY = {
  pickPalms: 1.4, // How near the glove picks a berry up, in palm lengths from the middle of the hand.
  pullRange: 0.28, // How near the hand it has to be to roll towards it, in screen heights.
  pull: 0.22, // How fast it rolls, in screen heights a second.
  away: 0.3, // How far the hand has to have gone from a berry it just left, before it can pick it up.
};
export const CHEST_BERRIES = 4;
export const GOLDEN_BERRIES = 5;
export const WAKE_SECONDS = 0.6; // An open hand held by a sleepy spider this long wakes it.
export const SLEEP_MOST = 12; // A sleepy spider wakes by itself after this long, so nobody gets stuck.
export const CHEST_SECONDS = 0.6; // An open hand held on a chest this long opens it.
export const BUTTERFLY = { seconds: 8, slow: 0.45, waitMost: 20 };
export const BASKET_HOLDS = 2;

/** The places at a level, with how many spiders each needs. */
export function placesAt(level) {
  const more = MORE_AT.slice(0, gardenAt(level).more);
  return PLACES.map((place) => (more.includes(place.place) ? { ...place, count: place.count + 1 } : place));
}

// How far a closed hand can be from a spider and still catch it, in palm lengths, beyond the spider.
export const CATCH_REACH = 1.2;
// How far a spider's body reaches from its middle, as a share of the screen's height.
export const SPIDER_SIZE = 0.05;
// How close to the middle of the web the hand has to be when it opens, as a share of the screen's height.
export const WEB_REACH = 0.2;
// A closed hand catches for this long after it was last seen open, so it has to close on a spider,
// and a fist that's just held still can't collect spiders as they go by.
export const GRAB_WINDOW = 1.2;
// A hand has to be closed by a spider this long to catch it, so one flicker of the tracker can't.
const FALSE_START = 0.1;
// A shy spider's dash: how far, and how long it takes.
export const DASH = { distance: 0.15, seconds: 0.8 };
// How long a web takes to sway each way and back, in seconds.
export const WEB_SWAY_SECONDS = 10;

/**
 * A spider's path: where it goes round, given the middle of it and the level. kind is 'scuttle' for one
 * running about on the leaves, and 'dangle' for one swinging on its thread from the branch above.
 * Paths are smooth loops, and the speed is set so that nowhere on one is faster than the level's speed.
 */
export function pathFor({ kind, centre, phase = 0, level, at = gardenAt(level) }) {
  const { wander, swing, twist, speed } = at;
  // A dangling spider's thread slides along the branch slowly while it swings up and down.
  const [ax, ay] = kind === 'dangle' ? [wander * 0.45, swing] : [wander, wander * 0.6];
  const k = kind === 'dangle' ? Math.min(twist, 2) : twist;
  if (kind === 'boat') {
    // Along the stream at the bottom of the garden and back, bobbing gently. The stream runs under the
    // middle of the garden, so that's where the boat goes along, whichever spot it was given.
    const [bx, by] = [wander * 1.15, 0.008];
    return { kind, cx: 0, cy: 0.17, ax: bx, ay: by, k: 2, rate: speed / Math.hypot(bx, 2 * by), phase, phaseY: phase * 0.7 + 1.1 };
  }
  // The fastest anywhere on the loop is at most this many times its rate of going round.
  const fastest = Math.hypot(ax, k * ay);
  return { kind, cx: centre.x, cy: centre.y, ax, ay, k, rate: speed / fastest, phase, phaseY: phase * 0.7 + 1.1 };
}

/** Where a spider on a path is after t seconds, relative to the middle of its garden. */
export function spiderAt(path, t) {
  const turn = path.rate * t + path.phase;
  return {
    x: path.cx + path.ax * Math.sin(turn),
    y: path.cy + path.ay * Math.sin(path.k * turn + path.phaseY),
  };
}

/** Where the middle of the web is, relative to where it hangs, after t seconds. */
export function webAt(sway, t, reducedMotion = false) {
  const far = sway * (reducedMotion ? 0.5 : 1);
  const turn = (t / WEB_SWAY_SECONDS) * Math.PI * 2;
  return { x: far * Math.sin(turn), y: far * 0.35 * Math.sin(turn * 1.6 + 0.8) };
}

// Where the middles of spiders' paths are in their part of the garden, so they spread out.
const SPOTS = [[-0.1, 0.1], [0.1, -0.1], [0.12, 0.13], [-0.12, -0.12], [0, 0], [0, -0.15], [0, 0.15]];

/**
 * Who's coming out to play at a place, in order, for a level. Every other one swings on its thread.
 * Each pair is two spiders on one path, one just behind the other. at is the garden they're for: the
 * level's, or with friends, friendsGardenAt's.
 */
export function spidersFor(count, level, random = Math.random, { ladybird = false, at = gardenAt(level) } = {}) {
  const { pairs, shy, sleepy, webs, boats, golden } = at;
  const spiders = [];
  let pairsLeft = pairs;
  // Starting halfway, so the first shy one comes early on, not only at the end.
  let shyOwed = shy > 0 ? 0.5 : 0;
  let sleepyOwed = sleepy > 0 ? 0.5 : 0;
  let web = 0;
  for (let index = 0; spiders.length < count; index += 1) {
    const kind = index % 2 ? 'dangle' : 'scuttle';
    const twins = pairsLeft > 0 && count - spiders.length >= 2 && index % 3 === 1;
    if (twins) pairsLeft -= 1;
    // Shy ones are spread out evenly, so a level's share of them always comes round.
    shyOwed += shy;
    const isShy = !twins && shyOwed >= 1 - 1e-9;
    if (isShy) shyOwed -= 1;
    // So are sleepy ones, which are never shy as well.
    sleepyOwed += sleepy;
    const isSleepy = !twins && !isShy && index > 0 && sleepyOwed >= 1 - 1e-9;
    if (isSleepy) sleepyOwed -= 1;
    const pair = twins ? index : null;
    const plan = { kind, shy: isShy, sleepy: isSleepy, pair, colour: spiders.length, phase: random() * Math.PI * 2, web, golden: false };
    spiders.push(plan);
    if (twins) spiders.push({ ...plan, shy: false, sleepy: false, golden: false, colour: spiders.length, phase: null, behind: true });
    // With two webs, they take turns: twins go to the same one.
    if (webs > 1) web = 1 - web;
  }
  const out = spiders.slice(0, count);
  const free = (plan) => plan.pair === null && !plan.golden && plan.kind !== 'boat' && plan.kind !== 'ladybird';
  const pick = () => {
    const spot = out.findIndex((plan, index) => index >= 1 && free(plan));
    return spot >= 0 ? spot : out.findIndex(free);
  };
  // A ladybird comes out to play second, or first if the others are twins, instead of a spider on its own.
  if (ladybird && count >= 2) {
    const spot = pick();
    if (spot >= 0) out[spot] = { ...out[spot], kind: 'ladybird', shy: false, sleepy: false, web: null };
  }
  // One sails about on a leaf boat, never shy or asleep. If the others are all taken, a pair of twins
  // sail on it together.
  if (boats) {
    const spot = pick();
    if (spot >= 0) {
      out[spot] = { ...out[spot], kind: 'boat', shy: false, sleepy: false };
    } else {
      const leader = out.findIndex((plan) => plan.pair !== null && !plan.behind);
      if (leader >= 0) {
        for (const index of [leader, leader + 1]) if (out[index]?.pair === out[leader].pair) out[index] = { ...out[index], kind: 'boat' };
      }
    }
  }
  // One is golden, early on, and if all the others are taken, it's the first of a pair of twins.
  if (golden) {
    let spot = pick();
    if (spot < 0) spot = out.findIndex((plan) => plan.pair !== null && !plan.behind);
    if (spot >= 0) out[spot] = { ...out[spot], golden: true, sleepy: false };
  }
  return out;
}

/** Whether a place has a ladybird, a butterfly or a treasure chest at a level. */
export function visitorsAt(place, level) {
  const at = gardenAt(level);
  return {
    ladybird: at.ladybird && LADYBIRD_AT.includes(place),
    butterfly: at.butterfly && BUTTERFLY_AT.includes(place),
    chest: at.chest && CHEST_AT.includes(place),
    basket: at.basket,
  };
}

export const spotFor = (index) => {
  const [x, y] = SPOTS[index % SPOTS.length];
  return { x, y };
};

// How many spiders getting away ends the game, unless a grown-up has chosen the gentle garden.
export const GET_AWAY_MOST = 3;
// How long one that got away stays out of sight before it comes back to play, in seconds.
export const AWAY_SECONDS = 2;

/**
 * Spiders wandering off. Every frame of play, tick says whether one heads off now: once the hand in play has been in
 * the picture for after seconds with no spider caught or brought home. Catching one or bringing one home settles
 * them, and so does a new place. A hand that has gone, or that the camera has lost, keeps them where they are. One
 * that gets all the way to the edge has got away, and most of those ends the game.
 */
export class Wandering {
  constructor({ after = Infinity, most = GET_AWAY_MOST } = {}) {
    this.after = after;
    this.most = most;
    this.since = 0;
    this.away = 0;
  }

  get on() {
    return Number.isFinite(this.after);
  }

  tick(dt, { seen }) {
    if (!this.on || !seen || this.lost) return false;
    this.since += dt;
    if (this.since < this.after) return false;
    this.since = 0;
    return true;
  }

  /** A spider caught or brought home, or a new place: nobody is about to wander off. */
  settle() {
    this.since = 0;
  }

  /** One got away. Returns whether that was the last there could be, which ends the game. */
  gotAway() {
    this.away += 1;
    return this.lost;
  }

  get lost() {
    return this.away >= this.most;
  }
}

/** The whole game: from one place in the garden to the next, until every spider is home. */
export class Gathering {
  constructor({ level = 1, onEvent = () => {} } = {}) {
    this.onEvent = onEvent;
    this.places = placesAt(level);
    this.level = gardenAt(level);
    this.index = -1;
    this.home = 0;
    this.stats = { home: 0, letGo: 0 };
  }

  get place() {
    return this.places[this.index] ?? null;
  }

  get over() {
    return this.index >= this.places.length;
  }

  get total() {
    return this.places.reduce((sum, { count }) => sum + count, 0);
  }

  /** How many spiders are home, of all of them, from 0 to 1. */
  get progress() {
    return Math.min(1, this.stats.home / this.total);
  }

  emit(type, details = {}) {
    this.onEvent({ type, ...details });
  }

  nextPlace() {
    this.index += 1;
    this.home = 0;
    if (this.over) this.emit('all-home');
    else this.emit('place', { place: this.place, index: this.index, total: this.places.length });
  }

  /** A spider went into its web. */
  spiderHome() {
    this.home += 1;
    this.stats.home += 1;
    this.emit('home', { home: this.home, count: this.place.count });
    if (this.home >= this.place.count) this.emit('place-done', { place: this.place });
  }

  /** A spider was let go of somewhere else. It costs nothing, and it goes back to playing. */
  letGo() {
    this.stats.letGo += 1;
    this.emit('let-go');
  }
}

/**
 * What happens to a spider as the hand comes and goes, frame by frame. A hand that has been seen open,
 * and then closes on a spider, catches it. It's carried in the closed hand, and opening the hand lets it
 * go: into its web if that's where the hand is, or back to playing anywhere else.
 *
 * With the basket, from level 6, the hand can carry two. Opening the hand away from the web with one in
 * it pops that one into the basket instead of letting it go, and the hand can then catch another.
 * Opening at the web puts both home. Where two don't share a home, as with two webs or the ladybird,
 * opening at one home only lets in what lives there, and the other stays carried, in the basket.
 *
 * It fails closed. open and closed are only true when the tracker is sure, so a hand at the edge of the
 * picture, too far away or overlapping the other one is neither, and does neither. A hand that has gone
 * from the picture lets go of what it had, as it can't be seen, and never puts a spider in its web.
 */
export class Catching {
  constructor({ holds = 1 } = {}) {
    this.held = null;
    this.stash = []; // In the basket.
    this.holds = holds;
    this.sinceOpen = Infinity;
    this.nearFor = 0;
    this.released = []; // What the last 'home' or 'let-go' was about.
  }

  /** Everything being carried: in the basket, and then in the hand. */
  get carried() {
    return this.held ? [...this.stash, this.held] : [...this.stash];
  }

  /**
   * near is the spider the hand is by, if any. onWeb says whether the hand is where a spider it carries
   * goes home: a function of the spider, or true or false for all of them. Returns 'caught', 'stashed',
   * 'home', 'let-go' or null, and released says which ones.
   */
  update(dt, { seen, open, closed, near, onWeb }) {
    this.released = [];
    if (!seen) {
      this.sinceOpen = Infinity;
      this.nearFor = 0;
      if (!this.carried.length) return null;
      this.released = this.carried;
      this.held = null;
      this.stash = [];
      return 'let-go';
    }
    if (open) {
      this.sinceOpen = 0;
      this.nearFor = 0;
      const atHome = typeof onWeb === 'function' ? onWeb : () => Boolean(onWeb);
      const home = this.carried.filter((spider) => atHome(spider));
      if (home.length) {
        // What lives here goes home. Anything else stays carried, in the basket, as the hand is open
        // and there's room in it now.
        this.released = home;
        this.stash = this.carried.filter((spider) => !home.includes(spider));
        this.held = null;
        return 'home';
      }
      if (!this.held) return null;
      if (this.stash.length < this.holds - 1 && this.held.kind !== 'ladybird') {
        this.stash.push(this.held);
        this.held = null;
        return 'stashed';
      }
      this.released = [this.held];
      this.held = null;
      return 'let-go';
    }
    // Closed, or not sure: anything in the hand stays there.
    if (this.held) return null;
    this.sinceOpen += dt;
    if (closed && near && this.sinceOpen <= GRAB_WINDOW) {
      this.nearFor += dt;
      if (this.nearFor >= FALSE_START) {
        this.held = near;
        this.nearFor = 0;
        return 'caught';
      }
    } else {
      this.nearFor = 0;
    }
    return null;
  }

  /** The spider got away, as a shy one does: nothing is held any more. */
  drop() {
    this.held = null;
  }
}
