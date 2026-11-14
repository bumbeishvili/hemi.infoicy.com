// Rooftop Rope's rules: a walker crossing ropes strung between rooftops, by standing on one leg. While the
// child holds one foot off the floor, their walker glides along the rope on one foot, faster the higher the
// foot is held. With both feet down on the rope the walker stops and starts to wobble, and after a few seconds
// of that drops into the net below and goes back up to the rooftop the rope started from. It's the game about
// standing on one leg and holding it, which children with hemiplegia find hard, above all on the weaker leg.
//
// No screen, camera or sound in this file, so all of it runs in the unit tests. How high a foot is lifted is
// measured against the child's own height, from the standing foot to the nose, and a lift is a share of this
// child's own lift with that foot: 1 is as high as a crossing ever asks for.
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const SIDES = ['left', 'right'];
export const otherLeg = (side) => (side === 'left' ? 'right' : 'left');

/* ------------------------------- the child's lifted foot ------------------------------- */

// MediaPipe's numbers for the points this game reads.
const POINTS = { nose: 0, leftAnkle: 27, rightAnkle: 28 };
const SURE = 0.5; // A point the tracker is less sure of than this isn't used.

export const LIFT = {
  // How high the foot goes for a whole lift, as a share of the body's height, by the grown-ups' setting. It's
  // never more than most of this child's own lift with that foot, from the warm-up. A foot at the other knee
  // is about a quarter of the body's height up.
  full: { tiny: 0.04, small: 0.07, medium: 0.11, big: 0.17 },
  ofBest: 0.85,
  // A foot the warm-up didn't measure, as when it's skipped, asks for no more than this.
  unmeasured: 0.07,
  least: 0.03, // A whole lift is never less than this, however small the child's own is.
  dead: 0.012, // Under this the foot is on the floor: the tracker's feet wobble by about that much.
  most: 2.5, // Lifting higher than a whole lift goes on counting, up to this many of them.
  follow: 12, // How quickly the reading follows the foot, per second.
  settle: 1.2, // And how quickly the slow average does, which is where level feet are taken from.
  levelMost: 0.035, // Feet further apart in height than this aren't taken as both on the floor.
  steady: 0.006, // Feet that have moved less than this lately are standing still.
  wild: 0.22, // A jump of more than this between two looks is the tracker's mistake,
  wildLooks: 2, // unless it's still there after this many more.
  lostAfter: 0.5, // Seconds without feet to see before the lift is let go.
  letGo: 4, // And how quickly it then comes down, per second.
  easedBy: 0.85, // What a whole lift comes down to, each time a child who's trying can't get there.
};

/**
 * How much higher one foot is than the other, as a share of the body's height, from what the tracker reports:
 * positive with the right foot the higher one, negative with the left. The body's height is taken from the
 * lower foot up to the nose, so it doesn't matter how far from the camera the child stands. Returns null
 * without both ankles and the nose to go by.
 */
export function liftOf(body) {
  const image = body?.image;
  if (!image) return null;
  const [nose, left, right] = [image[POINTS.nose], image[POINTS.leftAnkle], image[POINTS.rightAnkle]];
  if (!nose || !left || !right) return null;
  if ((left.visibility ?? 1) < SURE || (right.visibility ?? 1) < SURE || (nose.visibility ?? 1) < SURE) return null;
  const height = Math.max(left.y, right.y) - nose.y;
  // A body lying down, or half out of the picture, says nothing about a lifted foot.
  if (!(height > 0.15)) return null;
  return (left.y - right.y) / height;
}

/** The child's lifted foot in their own terms: where level is, and how high a whole lift is with each foot. */
export class Lifter {
  constructor({ size = 'medium' } = {}) {
    this.best = { left: null, right: null }; // The child's own lift with each foot, from the warm-up.
    this.eased = { left: 1, right: 1 };
    this.zero = 0;
    this.setSize(size);
    this.forget();
  }

  setSize(name) {
    this.sizeName = LIFT.full[name] ? name : 'medium';
    this.full = LIFT.full[this.sizeName];
  }

  /** The child stepped away or the camera restarted. Where level is, and their own lifts, are kept. */
  forget() {
    this.value = null;
    this.slow = null;
    this.last = null;
    this.wild = 0;
    this.raw = 0; // How much higher the right foot is than the left, past level: negative for the left.
    this.up = { left: 0, right: 0 }; // Each foot's lift, as a share of a whole lift with it.
    this.seen = false;
    this.unseen = 0;
  }

  /** How high a whole lift is with one foot, as a share of the body's height. */
  reachOf(side) {
    const best = this.best[side];
    const most = Math.min(this.full, best === null ? LIFT.unmeasured : best * LIFT.ofBest);
    return Math.max(LIFT.least, most * this.eased[side]);
  }

  get reach() {
    return { left: this.reachOf('left'), right: this.reachOf('right') };
  }

  /** How high one foot is off the floor, as a share of the body's height. */
  heightOf(side) {
    return Math.max(0, side === 'right' ? this.raw : -this.raw);
  }

  /**
   * Whether both feet are on the floor and still: the reading hasn't moved lately, and is within what counts
   * as on the floor. A foot held up, however low, is not this.
   */
  get settled() {
    if (!this.seen || this.value === null || this.slow === null) return false;
    return Math.abs(this.value - this.slow) < LIFT.steady && Math.abs(this.slow - this.zero) < LIFT.dead;
  }

  /**
   * However the feet have settled is level from now on, unless one is well off the floor. A child who stands
   * with one foot a little in front of the other, which the camera sees as lower, then starts from there.
   */
  restHere() {
    if (this.slow === null || Math.abs(this.slow) > LIFT.levelMost) return false;
    this.zero = this.slow;
    return true;
  }

  /** The warm-up measured how high this child lifts one foot, as a share of their height. */
  measured(side, best) {
    this.best[side] = best;
    this.eased[side] = 1;
  }

  /** A child who's trying and can't get the foot high enough: a whole lift with it comes down to meet them. */
  ease(side) {
    const before = this.reachOf(side);
    this.eased[side] *= LIFT.easedBy;
    return this.reachOf(side) < before - 1e-9;
  }

  /** One look from the tracker: what liftOf made of it, or null with no feet to see. */
  update(value, dt) {
    if (value === null || !Number.isFinite(value)) {
      this.unseen += dt;
      if (this.unseen >= LIFT.lostAfter) {
        this.seen = false;
        this.value = null;
        this.slow = null;
        this.last = null;
      }
      // With no feet to see, the lifted foot comes down by itself, gently.
      this.raw *= Math.exp(-LIFT.letGo * dt);
      this.shares();
      return;
    }
    // One wild look is the tracker's mistake. The same one a few times running is the child.
    if (this.last !== null && Math.abs(value - this.last) > LIFT.wild && this.wild < LIFT.wildLooks) {
      this.wild += 1;
      return;
    }
    this.wild = 0;
    this.last = value;
    this.unseen = 0;
    this.seen = true;
    const towards = (was, rate) => (was === null ? value : was + (value - was) * (1 - Math.exp(-rate * dt)));
    this.value = towards(this.value, LIFT.follow);
    this.slow = towards(this.slow, LIFT.settle);
    this.raw = this.value - this.zero;
    this.shares();
  }

  shares() {
    for (const side of SIDES) {
      const height = this.heightOf(side);
      const reach = this.reachOf(side);
      this.up[side] = height <= LIFT.dead ? 0 : Math.min(LIFT.most, (height - LIFT.dead) / (reach - LIFT.dead));
    }
  }
}

export const WARM = {
  hold: 0.8, // A lift counts as high as it was held for this long, so a kick isn't taken as the child's lift.
  least: 0.03, // Less than this share of the body's height isn't a lift that was measured.
  back: 0.45, // Coming back to under this share of it says the lift is over.
  patience: 9, // Seconds on one foot before moving on with whatever there was.
  between: 0.9, // Seconds between one foot and the other.
};

/**
 * Before the first game, the child lifts each foot as high as they comfortably can and holds it, and that's
 * what a whole lift is set from, each foot by itself. It can be skipped, and then a whole lift is a small one.
 */
export class Warmup {
  constructor({ lifter, sides = SIDES, onEvent = () => {} }) {
    this.lifter = lifter;
    this.sides = sides;
    this.onEvent = onEvent;
    this.index = 0;
    this.done = false;
    this.results = {};
    this.startSide();
  }

  get side() {
    return this.sides[this.index] ?? null;
  }

  /** How far towards the setting's whole lift the foot being asked for is, for the bar under the film. */
  get share() {
    return clamp(this.height / this.lifter.full, 0, 1);
  }

  startSide() {
    this.time = 0;
    this.best = 0;
    this.height = 0;
    this.recent = [];
    this.wait = 0;
  }

  update(dt) {
    if (this.done) return;
    if (this.wait > 0) {
      this.wait -= dt;
      if (this.wait <= 0) this.next();
      return;
    }
    const { lifter } = this;
    this.time += dt;
    this.height = lifter.seen ? lifter.heightOf(this.side) : 0;
    // The least it has been over the last moment is how high it was held.
    this.recent.push({ at: this.time, value: this.height });
    while (this.recent.length && this.time - this.recent[0].at > WARM.hold) this.recent.shift();
    const held = this.time >= WARM.hold ? Math.min(...this.recent.map(({ value }) => value)) : 0;
    if (held > this.best) this.best = held;

    const enough = this.best >= WARM.least;
    if (enough && this.height < this.best * WARM.back) this.measure();
    else if (this.time >= WARM.patience) this.measure();
  }

  measure() {
    const side = this.side;
    const best = this.best >= WARM.least ? this.best : null;
    this.results[side] = best;
    if (best !== null) this.lifter.measured(side, best);
    this.onEvent({ type: 'measured', side, best });
    this.wait = WARM.between;
  }

  next() {
    this.index += 1;
    if (this.index >= this.sides.length) this.finish(true);
    else {
      this.startSide();
      this.onEvent({ type: 'side', side: this.side });
    }
  }

  /** The warm-up is over, by being done or by the button that skips it. */
  finish(measured = false) {
    if (this.done) return;
    this.done = true;
    this.onEvent({ type: 'done', measured });
  }
}

/* ------------------------------- the ropes ------------------------------- */

export const ROPE_COUNTS = [4, 6, 8];
// Seconds a rope takes to cross with the foot at its whole lift, at level 1.
export const HOLDS = { short: 3, medium: 5, long: 8 };
// Seconds of standing on the rope with both feet down before the walker drops into the net.
export const WOBBLES = { soon: 5, later: 9, never: Infinity };
// How many drops into the net a crossing has, as a grown-up chooses. After the last of them the walker doesn't
// go back up: the crossing is over, and is to be tried again. With any number it always goes back up, which is
// how the game was to begin with, when nothing in it could be lost.
export const DROPS = { three: 3, five: 5, any: Infinity };
// Which foot lifts: taking turns, a rope each; always standing on the leg being worked on; always lifting
// that leg's foot; or whichever the child likes.
export const WHICH = ['turns', 'stand', 'lift', 'any'];

export const NEW_THINGS = {
  2: [{ id: 'star', mark: '⭐', name: 'Gold stars', nameKa: 'ოქროს ვარსკვლავები' }],
  3: [{ id: 'balloon', mark: '🎈', name: 'Balloons: lift higher to pop them', nameKa: 'ბუშტები: ფეხი უფრო მაღლა ასწიე' }],
  4: [{ id: 'bird', mark: '🐦', name: 'A little bird to carry across', nameKa: 'პატარა ჩიტი, რომელიც უნდა გადაიყვანო' }],
  5: [{ id: 'swap', mark: '🚩', name: 'A change of legs half way', nameKa: 'ფეხის შეცვლა შუა გზაზე' }],
  6: [{ id: 'light', mark: '🚦', name: 'A crossing light: rest on red', nameKa: 'შუქნიშანი: წითელზე დაისვენე' }],
  7: [{ id: 'climb', mark: '🧗', name: 'A rope that climbs', nameKa: 'აღმართი ბაგირი' }],
  8: [{ id: 'long', mark: '🌉', name: 'The long rope, with a post to rest on', nameKa: 'გრძელი ბაგირი დასასვენებელი ბოძით' }],
  9: [{ id: 'gust', mark: '💨', name: 'Gusts of wind', nameKa: 'ქარის ქროლვა' }],
  10: [{ id: 'cup', mark: '🏆', name: 'The cup, on the last rooftop', nameKa: 'თასი ბოლო სახურავზე' }],
};
const clampLevel = (level) => clamp(Math.round(Number(level) || 1), 1, 10);
export const newThingsAt = (level) => NEW_THINGS[clampLevel(level)] ?? [];
/** What's new at a level, for the cards: nothing at level 1. */
export const newAt = (level) => newThingsAt(level).map(({ mark, name, nameKa }) => ({ mark, name, nameKa }));
/** Everything a level has that level 1 hasn't, the newest last. */
export const thingsUpTo = (level) => Object.keys(NEW_THINGS).map(Number).filter((from) => from <= clampLevel(level)).flatMap((from) => NEW_THINGS[from]);

const ramp = (level, from, to) => from + ((to - from) * (level - 1)) / 9;

/**
 * What a level changes. Level 1 is the plain rope. How many ropes a game has, which foot lifts, how high it
 * has to go, how long a rope takes and how soon the walker falls stay as a grown-up chose: a level only
 * brings its new thing, and ropes that take a little longer, up to 1.3 times by level 10. Nothing gets quicker,
 * so there's as long to get the foot up at level 10 as at level 1. With friends it's the plain rope with its
 * stars, at any level.
 */
export function walkLevel(level = 1, plain = false) {
  const at = clampLevel(level);
  return {
    level: at,
    hold: ramp(at, 1, 1.3),
    star: plain || at >= 2,
    balloon: !plain && at >= 3,
    bird: !plain && at >= 4,
    swap: !plain && at >= 5,
    light: !plain && at >= 6,
    climb: !plain && at >= 7,
    long: !plain && at >= 8,
    gust: !plain && at >= 9,
    cup: !plain && at >= 10,
    plain,
  };
}

const EXTRAS = ['balloon', 'bird', 'swap', 'light', 'climb', 'gust'];
const LONG = 2; // The long rope is this many times as long as the others.
export const HIGHER = 1.2; // A balloon pops for a foot this many whole lifts up as the walker goes under it.

/**
 * Lays out a game: its ropes, which foot each is crossed on, and what's on each. The same numbers from random
 * lay out the same game, so friends each get the same ropes. side is the side being worked on.
 */
export function layOut({ level = 1, ropes = 6, hold = 'medium', which = 'turns', side = 'left', random = Math.random, plain = false } = {}) {
  const rules = walkLevel(level, plain);
  const count = ROPE_COUNTS.includes(ropes) ? ropes : 6;
  const seconds = (HOLDS[hold] ?? HOLDS.medium) * rules.hold;
  const worked = side === 'right' ? 'right' : 'left';
  // Standing on the leg being worked on means lifting the other foot.
  const fixed = which === 'stand' ? otherLeg(worked) : which === 'lift' ? worked : null;
  const first = random() < 0.5 ? 'left' : 'right';

  // What each rope has besides its stars: the level's own new thing on the first rope, so it's met right
  // away, and again later, and the things from earlier levels on the others, one to a rope.
  const unlocked = EXTRAS.filter((name) => rules[name]);
  const newest = newThingsAt(level).map(({ id }) => id).find((id) => unlocked.includes(id)) ?? null;
  const extras = new Array(count).fill(null);
  if (newest) {
    extras[0] = newest;
    extras[Math.min(count - 1, Math.ceil(count / 2))] = newest;
  }
  const others = unlocked.filter((name) => name !== newest);
  for (let i = 0; i < count; i += 1) {
    if (extras[i] || !others.length || random() < 0.3) continue;
    extras[i] = others[Math.floor(random() * others.length) % others.length];
  }
  // The long rope is the one before last, so there's a short one after it to finish on.
  const longAt = rules.long ? Math.max(0, count - 2) : -1;

  const list = [];
  for (let i = 0; i < count; i += 1) {
    const long = i === longAt;
    const extra = long ? null : extras[i];
    const leg = which === 'any' ? 'any' : fixed ?? (i % 2 ? otherLeg(first) : first);
    const things = [];
    if (rules.star) for (const at of long ? [0.15, 0.3, 0.7, 0.85] : [0.25, 0.5, 0.75]) things.push({ kind: 'star', at });
    if (extra === 'balloon') for (const at of [0.38, 0.62]) things.push({ kind: 'balloon', at });
    if (extra === 'bird') things.push({ kind: 'bird', at: 0.15, to: 0.9 });
    if (extra === 'swap' && leg !== 'any') things.push({ kind: 'swap', at: 0.5 });
    if (extra === 'light') things.push({ kind: 'light', at: 0.5, seconds: 3 });
    if (extra === 'gust') things.push({ kind: 'gust', at: 0.35, to: 0.65 });
    if (long) things.push({ kind: 'post', at: 0.5 });
    things.sort((a, b) => a.at - b.at);
    list.push({ index: i, leg, seconds: seconds * (long ? LONG : 1), long, climb: extra === 'climb', things });
  }
  const tally = (kind) => list.reduce((sum, rope) => sum + rope.things.filter((thing) => thing.kind === kind).length, 0);
  return { rules, ropes: list, stars: tally('star'), balloons: tally('balloon'), birds: tally('bird'), lights: tally('light') };
}

/* ------------------------------- the walk ------------------------------- */

export const WALK = {
  on: 0.4, // A foot this share of a whole lift up is off the floor, and the walker glides.
  off: 0.25, // Once up, it has to come down under this to count as down again.
  slowest: 0.5, // The share of its speed the walker has with the foot only just up. At a whole lift it's all of it.
  climbSlowest: 0.15, // On a rope that climbs, a foot only just up hardly moves the walker.
  steadies: 2, // Balancing takes the wobble away this many times as fast as standing brings it on.
  gust: 0.3, // The share of its speed the walker keeps in a gust of wind.
  fallSeconds: 2.8, // Into the net, and back up to the rooftop.
  fallsMost: 2, // After this many drops from the same rope, the walker doesn't fall from it again: it waits.
  stepSeconds: 1.5, // Stepping off the rope, and across the rooftop to the next one.
  birdGrace: 0.35, // Seconds the foot can be down without the bird flying off.
  postReach: 0.06, // How near the post, as a share of the rope, a foot put down before it steps onto it,
  postPast: 0.14, // and how far past it: a child sees the walker get there, and then puts the foot down.
  away: 0.6, // Seconds with nobody in the picture before everything waits.
  said: 6, // Seconds standing on a rooftop before the child is told there's no hurry.
};
const TRY = {
  share: 0.12, // A foot this share of a whole lift up, and under what counts, is a child trying.
  seconds: 3, // This long trying, and a whole lift with that foot comes down.
};

export class Walk {
  /**
   * level, ropes, hold, which and side lay the game out: see layOut. wobble is the grown-ups' setting for how
   * soon the walker falls. team is true when friends cross together. onEvent hears what happens.
   */
  constructor({ level = 1, ropes = 6, hold = 'medium', which = 'turns', side = 'left', wobble = 'later', drops = 'any', random = Math.random, plain = false, team = false, lifter = null, plan = null, onEvent = () => {} } = {}) {
    // A game already laid out can be handed in, as the tests do.
    this.plan = plan ?? layOut({ level, ropes, hold, which, side, random, plain });
    this.rules = this.plan.rules;
    this.levelNumber = this.rules.level;
    this.plain = plain;
    this.team = team;
    this.lifter = lifter;
    this.onEvent = onEvent;
    this.grace = WOBBLES[wobble] ?? WOBBLES.later;
    this.dropsMost = DROPS[drops] ?? Infinity; // The drops into the net that end the crossing.
    this.state = 'ready'; // ready, roof, rope, falling, stepping, finished, lost
    this.index = 0; // Which rope the walker is on, or about to cross.
    this.progress = 0; // How far along it, from 0 to 1.
    this.leg = this.plan.ropes[0].leg; // The foot to lift now: left, right or any.
    this.foot = null; // The foot that's up and counting, or null.
    this.lift = 0; // How high it is, as a share of a whole lift with it.
    this.gliding = false;
    this.wobble = 0; // From 0, steady, to 1, which is a fall.
    this.timer = 0;
    this.elapsed = 0;
    this.away = 0;
    this.idle = 0;
    this.held = false; // Together, on a rooftop: waiting there for a friend who's still behind.
    this.levelled = false; // Whether level has been taken again on this rooftop.
    this.struggle = 0;
    this.bird = null; // On a rope with a bird: { on, lost }.
    this.light = null; // At a crossing light: { left, rested }.
    this.things = [];
    this.stats = {
      seconds: 0,
      ropes: this.plan.ropes.length,
      crossed: 0,
      falls: 0,
      stars: 0,
      balloons: 0,
      feathers: 0,
      rests: 0,
      cup: false,
      holds: { left: 0, right: 0 }, // How many times each foot was lifted and held.
      holdSeconds: { left: 0, right: 0 }, // And for how long in all.
      longest: 0,
      highest: { left: 0, right: 0 }, // The highest each foot got, as a share of a whole lift.
      eased: { left: 0, right: 0 },
    };
    this.holding = null;
    this.heldFor = 0;
    this.setRope(0);
  }

  get rope() {
    return this.plan.ropes[this.index] ?? null;
  }

  begin() {
    if (this.state !== 'ready') return;
    this.state = 'roof';
    this.onEvent({ type: 'go' });
  }

  setRope(index) {
    this.index = index;
    this.fallsHere = 0; // Drops into the net from this rope.
    const rope = this.rope;
    this.things = rope ? rope.things.map((thing) => ({ ...thing, done: false })) : [];
    this.startRope();
  }

  /** At the start of the rope, for the first time or after a fall. Stars and balloons already had stay had. */
  startRope() {
    this.progress = 0;
    this.leg = this.rope ? this.rope.leg : 'any';
    this.bird = null;
    this.light = null;
    for (const thing of this.things) if (thing.kind !== 'star' && thing.kind !== 'balloon') thing.done = false;
  }

  /** The foot to lift, as the film shows it: for a rope that takes either, the one that was up last. */
  get asked() {
    return this.leg === 'any' ? this.foot ?? this.lastFoot ?? 'right' : this.leg;
  }

  /**
   * What to ask of the child, if anything: 'left' or 'right' for that foot, 'other' with the wrong one up, 'rest'
   * at a red light, and 'wait' on a rooftop where a friend is being waited for.
   */
  get hint() {
    if (this.state !== 'roof' && this.state !== 'rope') return null;
    if (this.away >= WALK.away) return null;
    if (this.light && this.light.left > 0) return 'rest';
    // Together, on a rooftop with a friend still behind: there's nothing to do but wait for them.
    if (this.held) return 'wait';
    if (this.gliding) return null;
    if (this.wrongFoot) return 'other';
    return this.asked;
  }

  get resting() {
    return this.state === 'roof' && !this.gliding;
  }

  /** Whether the walker is somewhere it can stand as long as it likes: a rooftop, the post, or a red light. */
  get safe() {
    if (this.state !== 'rope') return true;
    if (this.light && this.light.left > 0) return true;
    return this.atPost !== null;
  }

  /** The resting post the walker is at, on the long rope, or null: near enough to step onto counts, back onto it too. */
  get atPost() {
    return this.things.find((thing) => thing.kind === 'post' && this.progress - thing.at >= -WALK.postReach && this.progress - thing.at <= WALK.postPast) ?? null;
  }

  /**
   * One frame. lifter is the child's lifted foot: { up: { left, right }, seen }, as a Lifter has it. mates are
   * the friends in a game together, each { index, progress }.
   */
  update(dt, lifter, mates = []) {
    if (this.state === 'ready' || this.state === 'finished' || this.state === 'lost') return;
    const { stats } = this;
    this.elapsed += dt;
    const seen = Boolean(lifter?.seen);
    this.away = seen ? 0 : this.away + dt;
    this.readFoot(lifter, seen);
    this.countHold(dt);
    if (this.state !== 'roof') {
      this.held = false;
      this.levelled = false;
    }

    if (this.state === 'falling' || this.state === 'stepping') {
      this.timer -= dt;
      if (this.timer > 0) return;
      if (this.lastDrop) {
        // That was the last drop the crossing had: the walker stays in the net, and it's over.
        this.lose();
      } else if (this.state === 'falling') {
        this.state = 'roof';
        this.startRope();
        this.onEvent({ type: 'back', index: this.index });
      } else {
        this.arrive(mates);
      }
      return;
    }

    if (this.state === 'roof') {
      this.wobble = 0;
      // A rooftop is for resting on, for as long as the child likes. Together, it's also where a walker
      // who's in front waits for the others.
      const held = this.team && mates.some((mate) => mate && !mate.gone && mate.index < this.index);
      this.held = held;
      // Standing still on a rooftop with both feet down: however they are now is level from here on, so a
      // child who has shifted how they stand starts the next rope from where they are. Once a rooftop.
      if (!this.levelled && !this.gliding && this.lifter?.settled) this.levelled = this.lifter.restHere();
      if (this.gliding && !held) {
        this.state = 'rope';
        this.idle = 0;
        this.onEvent({ type: 'off', index: this.index, foot: this.foot });
      } else if (this.away < WALK.away) {
        const before = this.idle;
        this.idle += dt;
        if (before < WALK.said && this.idle >= WALK.said) this.onEvent({ type: 'resting' });
      }
      this.readTrying(lifter, dt);
      return;
    }

    // On the rope.
    const rope = this.rope;
    this.tendLight(dt);
    const stopped = this.light && this.light.left > 0;
    if (this.gliding && !stopped) {
      const least = rope.climb ? WALK.climbSlowest : WALK.slowest;
      let speed = least + (1 - least) * clamp((this.lift - WALK.on) / (1 - WALK.on), 0, 1);
      if (this.inGust()) speed *= WALK.gust;
      const before = this.progress;
      this.progress = Math.min(1, this.progress + (speed * dt) / rope.seconds);
      this.passThings(before);
    }
    // A foot put down beside the post steps onto it.
    const post = this.atPost;
    if (post && !this.gliding) this.progress += (post.at - this.progress) * Math.min(1, dt * 6);
    // Wobbling: with both feet on the rope, more and more. Balancing takes it away again, on either foot:
    // the other foot up doesn't move the walker, but it is standing on one leg.
    if (seen && !this.safe) {
      if (this.gliding || this.wrongFoot) this.wobble = Math.max(0, this.wobble - (WALK.steadies * dt) / Math.min(this.grace, WOBBLES.later));
      // A rope that has dropped the walker twice doesn't again: nobody is stuck on a rope they can't hold for.
      else if (Number.isFinite(this.grace) && this.fallsHere < WALK.fallsMost) this.wobble = Math.min(1, this.wobble + dt / this.grace);
    } else if (this.safe) {
      this.wobble = Math.max(0, this.wobble - dt);
    }
    this.tendBird(dt);
    this.readTrying(lifter, dt);

    if (this.progress >= 1) {
      // Off the rope, and across the rooftop to where the next one starts.
      this.finishBird();
      stats.crossed += 1;
      this.state = 'stepping';
      this.timer = WALK.stepSeconds;
      this.onEvent({ type: 'crossed', index: this.index });
      return;
    }
    if (this.wobble >= 1) {
      stats.falls += 1;
      this.fallsHere += 1;
      this.state = 'falling';
      this.timer = WALK.fallSeconds;
      this.wobble = 0;
      this.gliding = false;
      this.onEvent({ type: 'fall', index: this.index, progress: this.progress });
    }
  }

  /** Which foot is up, how high, and whether that's the foot this rope is crossed on. */
  readFoot(lifter, seen) {
    const up = seen ? lifter.up : { left: 0, right: 0 };
    const higher = up.left >= up.right ? 'left' : 'right';
    const wanted = this.leg === 'any' ? higher : this.leg;
    const lift = up[wanted] ?? 0;
    this.lift = lift;
    // The other foot up, on a rope that's for this one: balancing, but not what was asked.
    this.wrongFoot = this.leg !== 'any' && lift < WALK.off && (up[otherLeg(this.leg)] ?? 0) >= WALK.on;
    const was = this.gliding;
    if (!was && lift >= WALK.on) this.gliding = true;
    else if (was && lift < WALK.off) this.gliding = false;
    if (this.gliding) {
      this.foot = wanted;
      this.lastFoot = wanted;
      if (lift > this.stats.highest[wanted]) this.stats.highest[wanted] = lift;
    } else {
      this.foot = null;
    }
    if (was !== this.gliding) this.onEvent({ type: this.gliding ? 'up' : 'down', foot: wanted });
  }

  /** Holds, counted and timed, for the numbers at the finish. */
  countHold(dt) {
    const { stats } = this;
    if (this.holding && this.holding !== this.foot) {
      this.holding = null;
      this.heldFor = 0;
    }
    if (!this.holding && this.foot) {
      this.holding = this.foot;
      this.heldFor = 0;
      stats.holds[this.foot] += 1;
    }
    if (!this.holding) return;
    this.heldFor += dt;
    stats.holdSeconds[this.holding] += dt;
    if (this.heldFor > stats.longest) stats.longest = this.heldFor;
  }

  /**
   * A child whose foot is off the floor, and not as high as counts, is trying and not getting there. After a
   * few seconds of that, a whole lift with that foot comes down to meet them.
   */
  readTrying(lifter, dt) {
    if (!this.lifter || !lifter?.seen || this.gliding || this.leg === 'any' || (this.light && this.light.left > 0)) {
      this.struggle = Math.max(0, this.struggle - dt);
      return;
    }
    const lift = lifter.up[this.leg] ?? 0;
    if (lift < TRY.share || lift >= WALK.on) return;
    this.struggle += dt;
    if (this.struggle < TRY.seconds) return;
    this.struggle = 0;
    if (this.lifter.ease(this.leg)) {
      this.stats.eased[this.leg] += 1;
      this.onEvent({ type: 'eased', side: this.leg });
    }
  }

  inGust() {
    return this.things.some((thing) => thing.kind === 'gust' && this.progress >= thing.at && this.progress < thing.to);
  }

  /** Whatever the walker has just glided past. */
  passThings(before) {
    const { stats } = this;
    for (const thing of this.things) {
      if (thing.done || !(before < thing.at && this.progress >= thing.at)) continue;
      if (thing.kind === 'star') {
        thing.done = true;
        stats.stars += 1;
        this.onEvent({ type: 'star', thing });
      } else if (thing.kind === 'balloon') {
        thing.done = true;
        // Only a foot held higher than a whole lift reaches it. Missing it costs nothing.
        if (this.lift >= HIGHER) {
          thing.popped = true;
          stats.balloons += 1;
          this.onEvent({ type: 'pop', thing });
        } else {
          this.onEvent({ type: 'missed', thing });
        }
      } else if (thing.kind === 'bird') {
        thing.done = true;
        this.bird = { on: true, lost: false, down: 0, thing };
        this.onEvent({ type: 'bird', thing });
      } else if (thing.kind === 'swap') {
        thing.done = true;
        // Half way: the other foot from here. The walker stops at the flag until it's up.
        this.progress = thing.at;
        this.leg = otherLeg(this.leg);
        this.gliding = false;
        this.foot = null;
        this.onEvent({ type: 'swap', leg: this.leg, thing });
      } else if (thing.kind === 'light') {
        thing.done = true;
        this.progress = thing.at;
        this.light = { left: thing.seconds, rested: false, thing };
        this.onEvent({ type: 'red', thing });
      } else if (thing.kind === 'post') {
        thing.done = true;
        this.onEvent({ type: 'post', thing });
      } else if (thing.kind === 'gust') {
        thing.done = true;
        this.onEvent({ type: 'gust', thing });
      }
    }
  }

  /** A red light: the walker waits at it, and a foot put down there is a rest well taken. */
  tendLight(dt) {
    const { light } = this;
    if (!light || light.left <= 0) return;
    if (!this.gliding && !light.rested) {
      light.rested = true;
      this.stats.rests += 1;
      this.onEvent({ type: 'rested', thing: light.thing });
    }
    light.left -= dt;
    if (light.left <= 0) this.onEvent({ type: 'green', thing: light.thing });
  }

  /** A bird rides on the walker for as long as the foot stays up. Put down, the bird flies off. */
  tendBird(dt) {
    const { bird } = this;
    if (!bird || bird.lost || !bird.on) return;
    bird.down = this.gliding ? 0 : bird.down + dt;
    if (bird.down < WALK.birdGrace) return;
    bird.lost = true;
    bird.on = false;
    this.onEvent({ type: 'bird-off', thing: bird.thing });
  }

  finishBird() {
    const { bird } = this;
    if (!bird || bird.lost) return;
    bird.on = false;
    this.stats.feathers += 1;
    this.onEvent({ type: 'feather', thing: bird.thing });
  }

  /** Across the rooftop: at the next rope, or that was the last of them. */
  arrive() {
    if (this.index + 1 >= this.plan.ropes.length) {
      this.finish();
      return;
    }
    this.state = 'roof';
    this.gliding = false;
    this.foot = null;
    this.idle = 0;
    this.setRope(this.index + 1);
  }

  /** How many more drops into the net the crossing has, or Infinity where the walker always goes back up. */
  get dropsLeft() {
    return Math.max(0, this.dropsMost - this.stats.falls);
  }

  /** Whether the walker is on its way down for the last time: the drop it won't come back up from. */
  get lastDrop() {
    return this.state === 'falling' && this.stats.falls >= this.dropsMost;
  }

  /** The crossing is over: the walker has dropped into the net once too often. */
  lose() {
    if (this.state === 'lost' || this.state === 'finished') return;
    this.state = 'lost';
    this.gliding = false;
    this.foot = null;
    this.lift = 0;
    this.wobble = 0;
    this.stats.seconds = this.elapsed;
    this.onEvent({ type: 'lost', index: this.index });
  }

  finish() {
    if (this.state === 'finished') return;
    this.state = 'finished';
    this.stats.seconds = this.elapsed;
    if (this.rules.cup) {
      this.stats.cup = true;
      this.onEvent({ type: 'cup' });
    }
    this.onEvent({ type: 'finished' });
  }
}
