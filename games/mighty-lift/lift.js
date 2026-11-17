// The rules of Mighty Lift. No screen, camera or sound in this file: how high each arm is comes in, and
// what happened comes out as events, so all of it runs in the unit tests.
//
// Someone is stuck under something heavy, and the child lifts it off them. Raising the arm raises the
// weight, as high as the arm goes, and held above a line for a moment, the friend scrambles out. Letting
// it down early only lowers the weight again: what the friend has already managed is kept, and nobody is
// hurt. Then the weight comes down with the arm, and the next friend needs help. A game is so many lifts,
// as a grown-up chose, and they have to be done before sunset: a clock that runs while the child is lifting,
// and waits between friends, while the arm rests and while the child is out of the picture. When the sun
// sets with friends still stuck, the game is over. On the gentle setting there's no clock, as it once was.
//
// How high is high enough is the child's own. Each arm has its own line: as high as a grown-up chose, but
// never more than most of the way to the highest that arm reached in the warm-up, and it comes down to
// meet a child who's trying. Each level, from 1 to 10, brings something new: see liftLevel below.
//
// With friends, everyone lifts one big weight together, each arm adding its share, or each frees their own
// friends and the most wins: see Lifting's team.
import { ROSTER } from '../../core/body/roster.js';
import { clampLevel, ramp } from '../../core/levels.js';

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const SIDES = ['left', 'right'];

/* ------------------------------- how high an arm is ------------------------------- */

// How high the wrist has to go, above the shoulder, in lengths of the child's own torso: a hand hanging
// by the hip is about -0.9, level with the shoulder is 0, and an arm straight up about 1.1.
export const HEIGHTS = { little: -0.45, shoulder: 0, head: 0.7 };
const REST_USUAL = -0.85; // Where a hand hangs, until this child's own has been seen.
const LEAST_RISE = 0.3; // The line is never nearer than this to where the arm rests, so resting can't count.
const OWN_SHARE = 0.9; // Of the way from resting to the highest the arm reached in the warm-up.
// A try is the arm coming up from rest, falling short of its line, and coming down again, or being held there.
// The tracker's guess at a hand hanging half hidden by the hip jumps about: on test footage of an arm at rest,
// by up to 0.2 torso lengths for seconds at a time, and up to 0.45 for a moment.
const LEAST_TRY = 0.3; // So it has to get this far above where the arm rests, as far as the line ever comes down,
const TRY_HELD = 0.4; // and be up there for this long, or it's just an arm at rest,
const TRY_OVER = 0.1; // and it's over once the arm is back within this of where it rests.
const EASE_AFTER = 2; // This many tries in a row that fall short bring the line down,
const EASE_HELD = 4; // and so does one held short of it for this many seconds,
const EASE_SHARE = 0.85; // to this share of the best of them, but never nearer to rest than LEAST_RISE.
// In the warm-up, a height counts as reached once the arm has stayed at least that high for this long, so the
// tracker jumping up for a moment doesn't set a line an arm at rest could reach.
const BEST_HELD = 0.4;
const FOLLOW_RATE = 18; // How quickly the height read follows the tracker, which jitters.
const UNSEEN_GRACE = 0.6; // An arm the camera loses stays where it was for this long.
const UNSEEN_SINKS = 0.9; // And then comes down gently, this many lifts a second.
const MOST_ARM = 4; // An arm's lift is never counted as more than this, however low its line.
export const MOST_LIFT = 1.3; // As far above the line as a weight goes.
// The body's points the heights are read from: MediaPipe's numbers for each shoulder and wrist.
const POINTS = { left: { shoulder: 11, wrist: 15 }, right: { shoulder: 12, wrist: 16 } };
const SHOULDER_SEEN = 0.5;
// A wrist down by the hip is often half hidden, and the tracker still places it well: on test footage a
// hanging hand read 0.2 to 0.45 sure, within a tenth of a torso length of where it was. Below this it's a guess.
const WRIST_SEEN = 0.2;

/**
 * How high each wrist is above its shoulder, in lengths of the torso, from the tracker's picture of a body, or
 * null for an arm that can't be told. torso is the reader's own measure of the torso, in picture heights.
 */
export function armHeights(body, torso) {
  const heights = { left: null, right: null };
  if (!body || !(torso > 0)) return heights;
  for (const side of SIDES) {
    const shoulder = body.image[POINTS[side].shoulder];
    const wrist = body.image[POINTS[side].wrist];
    if ((shoulder.visibility ?? 1) < SHOULDER_SEEN || (wrist.visibility ?? 1) < WRIST_SEEN) continue;
    heights[side] = (shoulder.y - wrist.y) / torso;
  }
  return heights;
}

/** One arm: where it rests, how high it has reached, and so where its own line is. */
export class Arm {
  constructor(target = HEIGHTS.shoulder) {
    this.target = target;
    this.forget();
  }

  /** Nothing is known about this arm any more, as when the body check is done again. */
  forget() {
    this.rest = REST_USUAL;
    this.best = null; // The highest it reached in the warm-up, or null if that was skipped.
    this.eased = null; // Where the line has come down to, for a child who was trying.
    this.height = null; // Where it is now, smoothed, or null until it's seen.
    this.lately = []; // The last three readings: the middle one is used, so one wild frame from the tracker isn't.
    this.measured = []; // In the warm-up, the heights it has been at lately, each with how long: see BEST_HELD.
    this.seen = false;
    this.unseenFor = Infinity;
    this.downSeen = false; // Whether the arm has been seen at rest while a lift was wanted: tries start from there.
    this.forgetTries();
    this.tryMade = false;
  }

  forgetTries() {
    this.tryPeak = -Infinity; // The highest the arm has got in this try.
    this.tryFor = 0; // How long this try has been held short of the line.
    this.fails = 0; // Tries in a row that fell short,
    this.failBest = -Infinity; // and the best of them.
  }

  /** The height the wrist has to reach, in torso lengths above the shoulder. */
  get line() {
    let line = this.target;
    if (this.best !== null) line = Math.min(line, this.rest + (this.best - this.rest) * OWN_SHARE);
    if (this.eased !== null) line = Math.min(line, this.eased);
    return Math.max(line, this.rest + LEAST_RISE);
  }

  /** How far up the arm is: 0 at rest, 1 at its line, and on above it. */
  get lift() {
    if (this.height === null) return 0;
    return clamp((this.height - this.rest) / this.span, 0, MOST_ARM);
  }

  /** How far it is from resting to the line, in torso lengths: one lift. */
  get span() {
    return this.line - this.rest;
  }

  /** The highest the arm reached in the warm-up, as a lift, or null if it wasn't measured. */
  get reach() {
    return this.best === null ? null : (this.best - this.rest) / (this.line - this.rest);
  }

  /**
   * One reading: the wrist's height above the shoulder in torso lengths, or null if the camera can't see
   * the arm. measuring is the warm-up, when the highest it gets is remembered.
   */
  read(height, dt, measuring = false) {
    if (height === null || !Number.isFinite(height)) {
      this.seen = false;
      this.unseenFor += dt;
      // Lost for a moment, as an arm right overhead can be, it stays where it was, and then comes down gently,
      // from no higher than a weight goes.
      if (this.height !== null && this.unseenFor > UNSEEN_GRACE) {
        this.height = Math.max(this.rest, Math.min(this.height, this.rest + MOST_LIFT * this.span) - UNSEEN_SINKS * this.span * dt);
      }
      this.lately = [];
      this.measured = [];
      return this.lift;
    }
    this.seen = true;
    this.unseenFor = 0;
    this.lately.push(height);
    if (this.lately.length > 3) this.lately.shift();
    const middle = this.lately.length === 3 ? [...this.lately].sort((a, b) => a - b)[1] : height;
    this.height = this.height === null ? middle : this.height + (middle - this.height) * (1 - Math.exp(-FOLLOW_RATE * dt));
    // Where it rests follows the arm down at once. It only comes up when the game says so: see restHere.
    if (this.height < this.rest) this.rest = this.height;
    if (measuring) this.measure(dt);
    return this.lift;
  }

  /** In the warm-up: the highest the arm has stayed for a moment is the best it can do. */
  measure(dt) {
    this.measured.push({ dt, height: this.height });
    let lasted = this.measured.reduce((sum, each) => sum + each.dt, 0);
    while (this.measured.length > 1 && lasted - this.measured[0].dt >= BEST_HELD) lasted -= this.measured.shift().dt;
    if (lasted >= BEST_HELD) this.best = Math.max(this.best ?? -Infinity, Math.min(...this.measured.map((each) => each.height)));
  }

  /** The arm is at rest right now, wherever that is: a bent arm held by the chest rests higher than one that hangs. */
  restHere() {
    if (this.seen && this.height !== null) this.rest = this.height;
    this.forgetTries();
  }

  /**
   * Called while a lift is wanted. A child who comes up from rest and falls short of the line, twice running,
   * or holds the arm there short of it for a few seconds, has the line come down to just below the best they've
   * done, though never as low as an arm at rest. An arm on its way down from the line isn't a try, and neither
   * is one that hasn't moved. Returns whether the line came down.
   */
  tried(dt) {
    if (this.height === null) return false;
    const rise = this.height - this.rest;
    if (this.lift >= 1) {
      this.made();
      return false;
    }
    if (rise < TRY_OVER) {
      // Down again. If it had been up for a while, short of the line, that was a try.
      const fell = this.tryFor >= TRY_HELD;
      const peak = this.tryPeak;
      this.downSeen = true;
      this.tryMade = false;
      this.tryPeak = -Infinity;
      this.tryFor = 0;
      if (!fell) return false;
      this.fails += 1;
      this.failBest = Math.max(this.failBest, peak);
      return this.fails >= EASE_AFTER ? this.easeTo(this.failBest) : false;
    }
    if (!this.downSeen || this.tryMade || rise < LEAST_TRY) return false;
    this.tryPeak = Math.max(this.tryPeak, this.height);
    this.tryFor += dt;
    if (this.tryFor < EASE_HELD) return false;
    return this.easeTo(this.tryPeak);
  }

  /** The line comes down to just below this height, if that's lower than it is. */
  easeTo(best) {
    const eased = this.rest + Math.max(LEAST_RISE, (best - this.rest) * EASE_SHARE);
    this.forgetTries();
    if (eased >= this.line - 0.005) return false;
    this.eased = eased;
    return true;
  }

  /** The line was reached, so what comes down from it isn't a try, and the next tries are counted afresh. */
  made() {
    this.forgetTries();
    this.tryMade = true;
  }
}

/** Which arm lifts: the one being worked on, the other one, or both together with a bar. */
export const sidesFor = (side, liftWith) => {
  if (liftWith === 'both') return SIDES;
  if (liftWith === 'other') return [side === 'left' ? 'right' : 'left'];
  return [side === 'left' ? 'left' : 'right'];
};

/**
 * The arm or arms that lift. With both, the weight goes as high as the lower of them, each measured
 * against its own line, so both arms do their share.
 */
export class Arms {
  constructor({ side = 'right', liftWith = 'play', height = 'shoulder' } = {}) {
    this.left = new Arm();
    this.right = new Arm();
    this.measuring = false;
    this.lift = 0;
    this.oneSidedFor = 0;
    this.setArms(side, liftWith);
    this.setHeight(height);
  }

  setArms(side, liftWith) {
    this.sides = sidesFor(side, liftWith);
    this.both = this.sides.length === 2;
  }

  setHeight(name) {
    const target = HEIGHTS[name] ?? HEIGHTS.shoulder;
    for (const side of SIDES) this[side].target = target;
  }

  forget() {
    for (const side of SIDES) this[side].forget();
    this.lift = 0;
  }

  get arms() {
    return this.sides.map((side) => this[side]);
  }

  /** Whether the camera can see every arm that lifts. */
  get seen() {
    return this.arms.every((arm) => arm.seen);
  }

  /** How far the bar tips: above 0 with the right hand higher. Nothing with one arm. */
  get tilt() {
    return this.both ? this.right.lift - this.left.lift : 0;
  }

  /** How far one lift is, in torso lengths: from resting to the line, for the arms that lift. */
  get span() {
    return this.arms.reduce((sum, arm) => sum + arm.span, 0) / this.arms.length;
  }

  /** How high the child can lift, at best, as a lift, or null if the warm-up was skipped. */
  get reach() {
    const reaches = this.arms.map((arm) => arm.reach);
    return reaches.includes(null) ? null : Math.min(...reaches);
  }

  /** With both arms: whether one is well up while the other has stayed down for a while. */
  get oneSided() {
    return this.oneSidedFor > 2.5;
  }

  /** heights is { left, right }, each the wrist's height above its shoulder, or null. Returns the lift. */
  update(heights, dt) {
    for (const side of SIDES) this[side].read(heights[side] ?? null, dt, this.measuring && this.sides.includes(side));
    const lifts = this.arms.map((arm) => arm.lift);
    this.lift = Math.min(...lifts);
    this.oneSidedFor = this.both && Math.max(...lifts) > 0.6 && this.lift < 0.3 ? this.oneSidedFor + dt : 0;
    return this.lift;
  }

  /** The arms are at rest where they are now. below leaves out an arm that's still held up, as a lift. */
  restHere(below = Infinity) {
    for (const arm of this.arms) if (arm.lift < below) arm.restHere();
  }

  /** A lift is wanted. Returns whether a line came down, for a child who's trying and can't reach it. */
  tried(dt) {
    let eased = false;
    for (const arm of this.arms) if (arm.tried(dt)) eased = true;
    return eased;
  }

  made() {
    for (const arm of this.arms) arm.made();
  }
}

/* ------------------------------- the warm-up ------------------------------- */

const WARM_STOPPED = 0.8; // The arm has got as high as it's going once it hasn't risen for this long.
const WARM_RISING = 0.02; // Rising by less than this isn't rising.
const WARM_ONE_ARM = 8; // With both arms, if only one comes up, the warm-up ends after this long anyway.
const WARM_PATIENCE = 12; // And for an arm that moves but can't get far, it ends this long after it first moved,
const WARM_MOVED = 0.25; // this far above where it rests: further than a hand at rest seems to move, if not as far as a line.

/**
 * Before the first game: the child raises the arm as high as it goes, and that's what its line is set
 * from. It ends once the arm has gone up and stopped rising. Nobody gets stuck: it can be skipped, and
 * with both arms it ends even if only one of them comes up.
 */
export class Warmup {
  constructor({ arms, onEvent = () => {} }) {
    this.arms = arms;
    this.onEvent = onEvent;
    this.done = false;
    this.top = -Infinity;
    this.sinceRose = 0;
    this.oneArmFor = 0;
    this.triedFor = 0;
    arms.measuring = true;
    for (const arm of arms.arms) arm.best = null;
    arms.restHere();
  }

  /** How far up the arm is, from resting at 0 to as high as a grown-up chose at 1, for the meter. */
  get share() {
    return Math.min(...this.arms.arms.map((arm) => (arm.height === null ? 0 : clamp((arm.height - arm.rest) / Math.max(LEAST_RISE, arm.target - arm.rest), 0, 1.2))));
  }

  update(heights, dt) {
    if (this.done) return;
    const { arms } = this;
    arms.update(heights, dt);
    const rises = arms.arms.map((arm) => (arm.best === null ? 0 : arm.best - arm.rest));
    const total = arms.arms.reduce((sum, arm) => sum + (arm.best ?? arm.rest), 0);
    if (total > this.top + WARM_RISING) {
      this.top = total;
      this.sinceRose = 0;
    } else {
      this.sinceRose += dt;
    }
    const up = rises.filter((rise) => rise >= LEAST_RISE).length;
    this.oneArmFor = up > 0 && up < rises.length ? this.oneArmFor + dt : 0;
    const allUp = up === rises.length;
    if (rises.some((rise) => rise >= WARM_MOVED)) this.triedFor += dt;
    if ((allUp && this.sinceRose >= WARM_STOPPED) || this.oneArmFor >= WARM_ONE_ARM || this.triedFor >= WARM_PATIENCE) this.finish(true);
  }

  /** measured is false when it was skipped, and then each line is as a grown-up chose until a child's tries bring it down. */
  finish(measured) {
    if (this.done) return;
    this.done = true;
    this.arms.measuring = false;
    if (!measured) for (const arm of this.arms.arms) arm.best = null;
    this.onEvent({ type: measured ? 'measured' : 'skipped' });
  }
}

/* ------------------------------- levels ------------------------------- */

export const HOLDS = { short: 0.6, medium: 1, long: 2 }; // Seconds a weight is held up, at level 1.
export const LIFT_COUNTS = [5, 8, 12];

// What a child lifts. lifts is how many it takes, rise how many seconds it takes to come up at its fastest,
// parts how many come out from under it, one after another, and from the level it first comes at.
export const THINGS = {
  basket: { lifts: 1 },
  crate: { lifts: 1, heavy: true, from: 3 }, // Heavy: it rises slowly, so the arm stays up for longer.
  tub: { lifts: 1, parts: 3, who: 'ducks', from: 4 }, // Three ducklings, who waddle out one at a time.
  rock: { lifts: 2, from: 5 }, // Too heavy for one lift: each one jacks it up a notch.
  chest: { lifts: 3, from: 10 }, // The champion's chest, the last of all, with the trophy in it.
};

/**
 * What each level brings that's new, which the cards show and the game names the first time it comes
 * along. Every level from 2 brings something, and keeps what came before.
 */
export const NEW_THINGS = {
  2: [{ id: 'star', mark: '⭐', name: 'Gold stars', nameKa: 'ოქროს ვარსკვლავები' }],
  3: [{ id: 'crate', mark: '📦', name: 'Heavy crates', nameKa: 'მძიმე ყუთები' }],
  4: [{ id: 'tub', mark: '🦆', name: 'Ducklings', nameKa: 'იხვის ჭუკები' }],
  5: [{ id: 'rock', mark: '🪨', name: 'A big rock: two lifts', nameKa: 'დიდი ლოდი: ორი აწევა' }],
  6: [{ id: 'owl', mark: '🦉', name: 'A sleepy owl', nameKa: 'მძინარე ბუ' }],
  7: [{ id: 'hive', mark: '🐝', name: 'A beehive', nameKa: 'ფუტკრის სკა' }],
  8: [{ id: 'balloons', mark: '🎈', name: 'Balloons', nameKa: 'ბუშტები' }],
  9: [{ id: 'helper', mark: '🤝', name: 'A helper friend', nameKa: 'დამხმარე მეგობარი' }],
  10: [{ id: 'chest', mark: '🏆', name: 'The champion’s chest', nameKa: 'ჩემპიონის სკივრი' }],
};

export const newThingsAt = (level) => NEW_THINGS[clampLevel(level)] ?? [];
/** What's new at a level, for the cards: nothing at level 1. */
export const newAt = (level) => newThingsAt(level).map(({ mark, name, nameKa }) => ({ mark, name, nameKa }));
/** Everything a level has that level 1 hasn't, the newest last, for naming each thing the first time it comes. */
export const thingsUpTo = (level) => Object.keys(NEW_THINGS).map(Number).filter((from) => from <= clampLevel(level)).flatMap((from) => NEW_THINGS[from]);

/**
 * What a level changes. Level 1 is the plain game: light baskets and a short hold. How high the arm has to
 * go, which arm lifts, how long a hold is and how many lifts make a game stay as a grown-up chose: a level
 * makes the hold longer, up to 1.7 times by level 10, and the time before sunset shorter. gentle is the game
 * as it was: the hold up to 1.4 times by level 10, and no clock.
 */
export function liftLevel(level = 1, { gentle = false } = {}) {
  const at = clampLevel(level);
  return {
    hold: ramp(at, 1, gentle ? 1.4 : 1.7),
    // The time before sunset, for each lift, besides the hold it needs: seconds for the arm to go up and come
    // down again, and how many times over the hold itself. From 8 seconds and twice the hold at level 1 to 3.5
    // seconds and 1.25 times at level 10. None on the gentle setting.
    clock: gentle ? null : { perLift: ramp(at, 8, 3.5), slack: ramp(at, 2, 1.25) },
    // From level 2, a gold star hangs above the line over light things: lifting a little higher gets it.
    star: at >= 2,
    // From level 3, heavy crates, which take this many seconds to come up, however quick the arm is.
    heavyRise: ramp(at, 1.3, 1.6),
    // From level 6, an owl asleep on some baskets, which stays asleep if the basket is put down gently.
    owl: at >= 6,
    // From level 7, a beehive on some baskets, whose bees give honey for a steady hold.
    hive: at >= 7,
    // From level 8, the first friend freed gives balloons, which make the next heavy things light.
    balloons: at >= 8,
    // From level 9, a friend who's been freed stays to help, and the next one gets out twice as fast.
    helper: at >= 9,
    // At level 10 the last thing is the champion's chest, with the trophy in it.
    chest: at >= 10,
    kinds: Object.keys(THINGS).filter((kind) => (THINGS[kind].from ?? 1) <= at),
  };
}

const DUCKS_HOLD = 1.8; // Three ducklings take this many holds between them.
const NOTCH_HOLD = 0.5; // And each notch of a rock or the chest takes this much of one.
const BALLOON_LIFTS = 2; // Heavy things a bunch of balloons makes light.
const CHEST_LEAST = 5; // The chest is three lifts, so a game needs at least this many for it.
export const STAR_AT = 1.22; // How far above the line a star hangs, as a lift.
const STAR_LEAST = 1.08;
const STAR_OF_REACH = 0.97; // Or this share of the highest the child reached, if that's lower.

/** Where the star hangs for a child who can reach this high, as a lift, so that it's a stretch and not out of reach. */
export const starAtFor = (reach) => (reach === null || reach === undefined ? 1.15 : clamp(reach * STAR_OF_REACH, STAR_LEAST, STAR_AT));

/**
 * The rescues of one game, in order: exactly as many lifts as a grown-up chose. What the level brings that's
 * new comes first. lifter is the child's own character, who isn't among the friends to free, or a list of
 * them when several lift in front of one camera, and random says which friend is first. plain is the game as
 * it's played with friends: baskets only, with none of the levels' new things.
 */
export function layOut({ lifts = 8, level = 1, lifter = 'giraffe', random = Math.random, plain = false } = {}) {
  const rules = liftLevel(plain ? 1 : level);
  const at = plain ? 1 : clampLevel(level);
  const lifters = [lifter].flat();
  const friends = ROSTER.map(({ id }) => id).filter((id) => !lifters.includes(id));
  const first = Math.floor(random() * friends.length) % friends.length;
  let budget = Math.max(1, Math.round(lifts));
  const kinds = [];
  const chest = rules.chest && budget >= CHEST_LEAST;
  if (chest) budget -= THINGS.chest.lifts;
  // Round and round the kinds this level has, starting with its newest.
  const round = ['basket', 'crate', 'tub', 'rock'].filter((kind) => rules.kinds.includes(kind));
  const newest = newThingsAt(at).map(({ id }) => id).find((id) => round.includes(id));
  let next = newest ? round.indexOf(newest) : 0;
  while (budget > 0) {
    const kind = THINGS[round[next % round.length]].lifts <= budget ? round[next % round.length] : 'basket';
    kinds.push(kind);
    budget -= THINGS[kind].lifts;
    next += 1;
  }
  if (chest) kinds.push('chest');

  let baskets = 0;
  const rescues = kinds.map((kind, index) => {
    const thing = THINGS[kind];
    const rescue = {
      index,
      kind,
      lifts: thing.lifts,
      parts: thing.parts ?? 1,
      heavy: Boolean(thing.heavy),
      friend: thing.who ?? friends[(first + index) % friends.length],
      // A star over anything that's one lift for one friend.
      star: rules.star && thing.lifts === 1 && !thing.parts,
      owl: false,
      hive: false,
      gives: null,
    };
    if (kind === 'basket') {
      // Taking turns on the baskets: a beehive, an owl, and one with neither. The newer of the two is on the first.
      const turn = baskets % 3;
      if (rules.hive) [rescue.hive, rescue.owl] = [turn === 0, turn === 1];
      else if (rules.owl) rescue.owl = turn === 0;
      baskets += 1;
    }
    return rescue;
  });
  // From level 9 the first friend freed stays to help with the next. From level 8, whoever is freed just before
  // a heavy crate gives balloons, once a game: the first friend at level 8. With no crate for them, there are none.
  if (rules.helper && rescues.length > 1) rescues[0].gives = 'helper';
  if (rules.balloons) {
    const before = rescues.find((rescue, index) => !rescue.gives && rescues[index + 1]?.heavy);
    if (before) before.gives = 'balloons';
  }
  return rescues;
}

/* ------------------------------- a game ------------------------------- */

const UP_AT = 1; // A weight is up once it's at the line,
const DOWN_AGAIN = 0.88; // and stays up until it's this far below it, so a wobble doesn't drop it.
const LOWERED = 0.3; // An arm this low has come down, and its next raise is another lift.
const SET_DOWN = 0.2; // A weight this low is back on the ground.
const LIGHT_RISE = 3.5; // Lifts a second: how fast a light thing follows the arm up.
const FALL_RATE = 12; // And how quickly anything follows it down.
const ARRIVE_SECONDS = 0.9; // The next friend and what's on them coming in.
const REST_SECONDS = 1.6; // A shake of the arms between rescues.
const TEAM_FREED_SECONDS = 1.4; // With friends, the big weight isn't waited for: the next comes after this.
const STEADY_WITHIN = 0.4; // Torso lengths a second: an arm moving less than this is steady.
const WOBBLE_SECONDS = 0.35; // Over about this long.
const TRACKER_SLOWEST = 0.1; // An arm that reads the same for this long really is still.
const HONEY_SHARE = 0.6; // Of a hold, held steady, fills the honey pot,
const HONEY_LEAST = 0.6; // and never less than this many seconds.
// A weight put down gently takes at least this long to reach the ground, from when the arm starts down. On test
// footage, an arm lowered from right overhead with care took 0.65 seconds, and one let drop took 0.3.
const GENTLE_SECONDS = 0.5;
const GENTLE_FROM = 0.9; // The arm has started down once it's below this share of the highest it held.
const STILL_WITHIN = 0.25; // Torso lengths a second: an arm moving less than this has stopped.
const STILL_SECONDS = 2; // An arm that stays stopped this long after a rescue is where it rests.
const STILL_BELOW = 0.8;
const IDLE_SECONDS = 15; // After this long without lifting, the child is resting, and is told that's fine.
const CLOCK_REST = 4; // An arm down this long is resting, and the clock waits for it.
const HINT_LOW = 4; // Seconds with the arm down before being asked to lift.
const HINT_MIDDLE = 2.5; // Seconds part of the way up before being asked to go a little higher.
const HINT_DOWN = 3.5; // Seconds still holding it up after a rescue before being asked to put it down.

/**
 * Someone else lifting the same weight in front of the same camera. Their arm is up, and each time it goes up is
 * one more lift, by the same rules as the child's own: see Lifting.readArm. It's given to Lifting.update as one
 * of the mates, as a friend's arm is from their own computer.
 */
export class Partner {
  constructor() {
    this.lift = 0;
    this.up = false;
    this.armed = true; // Their arm has come down since its last lift.
    this.lifts = 0;
  }

  /** How far up their arm is now: 0 at rest, 1 at its own line. Returns whether that was one more lift. */
  read(lift = 0) {
    this.lift = Math.max(0, lift || 0);
    if (this.lift < LOWERED) this.armed = true;
    this.up = this.lift >= UP_AT || (this.up && this.lift >= DOWN_AGAIN);
    // Up, and down since the last time: once up it's not armed again until it has come right down.
    if (!this.up || !this.armed) return false;
    this.armed = false;
    this.lifts += 1;
    return true;
  }
}

/**
 * One game. Each frame, update(dt, lift) says how far up the arm is: 0 at rest, 1 at its line. What
 * happens comes out through onEvent. The weight follows the arm up and down, heavy things more slowly, and
 * what a friend has managed is never lost.
 *
 * team is for playing with friends on one big weight: { size }, how many are lifting. The weight then goes
 * as high as everyone's arms between them, and the friend gets out as fast as the share of arms that are up,
 * so a child on their own still frees them, slowly. Each rescue is over on every computer as soon as it is
 * on one: see settle.
 */
export class Lifting {
  /**
   * gentle is the game as it was, with no clock. With friends, plain, there's no clock either: together is
   * lifting one weight between everyone, and against each other is who frees the most.
   */
  constructor({ level = 1, lifts = 8, hold = 'medium', lifter = 'giraffe', random = Math.random, plain = false, team = null, reach = null, gentle = false, onEvent = () => {} } = {}) {
    this.levelNumber = clampLevel(level);
    this.rules = liftLevel(level, { gentle: gentle || plain || Boolean(team) });
    this.plain = plain || Boolean(team);
    this.team = team;
    this.onEvent = onEvent;
    this.holdSeconds = (HOLDS[hold] ?? HOLDS.medium) * this.rules.hold;
    this.rescues = layOut({ lifts, level, lifter, random, plain: this.plain });
    this.starAt = starAtFor(reach);
    this.state = 'ready';
    this.index = -1;
    this.phase = 'arriving';
    this.phaseFor = 0;
    this.height = 0; // How high the weight is, as a lift.
    this.up = false;
    this.freeing = false; // Whether the friend is getting out right now.
    this.armUp = false;
    this.armed = true; // The arm has come down since its last lift.
    this.lift = 0;
    this.span = 1; // How far one lift is for this child, in torso lengths: see Arms.span. The game keeps it up to date.
    this.wobble = 0;
    this.sinceMoved = 0;
    this.progress = 0;
    this.pull = 0;
    this.pulls = 0;
    this.parts = 0;
    this.mustLower = false;
    this.starTaken = false;
    this.honey = 0;
    this.honeyGiven = false;
    this.owlAwake = false;
    this.armPeak = 0;
    this.fallFrom = 0;
    this.clock = 0;
    this.idle = 0;
    this.resting = false;
    this.lowFor = 0;
    this.middleFor = 0;
    this.upFor = 0;
    this.stillFor = 0;
    this.holdFor = 0;
    this.balloons = 0;
    this.settled = -1; // With friends on one weight: the last rescue the server has said is done.
    this.helper = null; // The friend who's helping with this rescue, or about to with the next.
    this.helping = false;
    this.stats = { lifts: 0, freed: 0, ducklings: 0, stars: 0, starsHung: 0, feathers: 0, owls: 0, honey: 0, hives: 0, trophy: false, heldSeconds: 0, longestHold: 0, eased: 0 };
    // Seconds left before sunset, or null when there's no clock. lost is whether the sun set first.
    this.timeAll = this.rules.clock ? this.rescues.reduce((sum, rescue) => sum + this.secondsFor(rescue), 0) : null;
    this.timeLeft = this.timeAll;
    this.clockWaits = false;
    this.armDownFor = 0;
    this.lost = false;
  }

  /**
   * The time before sunset a rescue brings: the arm going up and down for each of its lifts, and so many times
   * the hold it needs, with a heavy crate's slow rise and ducklings' longer hold.
   */
  secondsFor(rescue) {
    const { perLift, slack } = this.rules.clock;
    const holds = rescue.lifts > 1 ? rescue.lifts * NOTCH_HOLD : rescue.parts > 1 ? DUCKS_HOLD : 1;
    const rise = rescue.lifts * (rescue.heavy ? this.rules.heavyRise : 1 / LIGHT_RISE);
    return rescue.lifts * perLift + (holds * this.holdSeconds + rise) * slack;
  }

  /**
   * The clock runs while there's a friend to free, unless the arm has been down a while, resting: it waits then,
   * between friends, and while the child is out of the picture. seen says whether the camera can see them.
   */
  runClock(dt, seen) {
    if (this.timeLeft === null) return;
    this.armDownFor = this.lift < LOWERED ? this.armDownFor + dt : 0;
    this.clockWaits = !seen || this.armDownFor >= CLOCK_REST || (this.phase !== 'lifting' && this.phase !== 'freed');
    if (this.clockWaits) return;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this.timeLeft > 0 || this.phase !== 'lifting') return;
    // The sun has set with a friend still stuck.
    this.lost = true;
    this.emit('sunset', { freed: this.stats.freed, of: this.rescues.length });
    this.finish();
  }

  get rescue() {
    return this.rescues[this.index] ?? null;
  }

  /** How many lifts the game is, and how many of them are done, counting each notch of a rock. */
  get liftsPlanned() {
    return this.rescues.reduce((sum, rescue) => sum + rescue.lifts, 0);
  }

  get liftsDone() {
    return this.rescues.slice(0, Math.max(0, this.index)).reduce((sum, rescue) => sum + rescue.lifts, 0) + (this.phase === 'lifting' ? this.pulls : this.rescue?.lifts ?? 0);
  }

  /** Whether the weight on the hook comes up slowly: a heavy crate, unless balloons are tied to it. */
  get slow() {
    return Boolean(this.rescue?.heavy) && this.balloons === 0;
  }

  /** How far out the friend has got: 0 still under it, 1 free. With ducklings, how far the next one has. */
  get out() {
    const { rescue } = this;
    if (!rescue) return 0;
    if (this.phase !== 'lifting') return this.phase === 'arriving' ? 0 : 1;
    if (rescue.lifts > 1) return (this.pulls + clamp(this.pull, 0, 1)) / rescue.lifts;
    return this.progress;
  }

  /**
   * How high the thing itself is, as a share of the way to the line: a rock or the chest only comes up a
   * notch with each lift, and stays there.
   */
  get thingHeight() {
    const { rescue } = this;
    if (!rescue || this.phase === 'arriving' || this.phase === 'resting') return 0;
    if (rescue.lifts === 1) return this.height;
    if (this.phase !== 'lifting') return Math.max(1, this.height);
    return (this.pulls + (this.mustLower ? 0 : Math.min(1, this.height))) / rescue.lifts;
  }

  /** Whether the arm is being held steady, rather than shaking or still on its way. */
  get steady() {
    return this.wobble * this.span < STEADY_WITHIN;
  }

  /**
   * What to ask for, if anything: 'lift', 'higher', 'hold', 'down' or, for a rock that wants another lift,
   * 'again'. Only after a while, and never while resting.
   */
  get hint() {
    if (this.state !== 'playing') return null;
    if (this.phase === 'freed') return !this.team && this.upFor >= HINT_DOWN ? 'down' : null;
    if (this.phase !== 'lifting' || this.up) return null;
    if (this.mustLower) return this.upFor >= HINT_DOWN ? 'again' : null;
    if (this.middleFor >= HINT_MIDDLE) return 'higher';
    // Held up once and let down before the friend was out: it's the hold that's wanted.
    const partWay = this.rescue.lifts > 1 ? this.pull > 0 : this.progress > 0;
    if (this.lowFor >= HINT_LOW && !this.resting) return partWay ? 'hold' : 'lift';
    return null;
  }

  /** The game starts. The first friend has been there all through the countdown, so there's nothing to wait for. */
  begin() {
    this.state = 'playing';
    this.arrive();
    this.setPhase('lifting');
  }

  emit(type, extra = {}) {
    this.onEvent({ type, ...extra });
  }

  arrive() {
    this.index += 1;
    Object.assign(this, { phase: 'arriving', phaseFor: 0, progress: 0, pull: 0, pulls: 0, parts: 0, mustLower: false, starTaken: false, honey: 0, honeyGiven: false, owlAwake: false, up: false, height: 0, lowFor: 0, middleFor: 0, upFor: 0, stillFor: 0 });
    const { rescue } = this;
    if (rescue.star) this.stats.starsHung += 1;
    if (rescue.owl) this.stats.owls += 1;
    if (rescue.hive) this.stats.hives += 1;
    // A friend who stayed to help does so now.
    this.helping = Boolean(this.helper);
    this.emit('arrive', { rescue, index: this.index });
    if (this.helping) this.emit('helper', { friend: this.helper });
  }

  /**
   * dt in seconds, lift how far up the child's arm is, and mates, with friends, each friend's { lift, up }. seen
   * is false while the child is out of the picture, when the clock waits.
   */
  update(dt, lift = 0, mates = [], { seen = true } = {}) {
    if (this.state !== 'playing') return;
    this.clock += dt;
    this.phaseFor += dt;
    this.readArm(dt, Math.max(0, lift || 0));
    this.runClock(dt, seen);
    if (this.state !== 'playing') return;
    const everyone = [{ lift: this.lift, up: this.armUp }, ...mates];
    const high = (each) => clamp(each.lift || 0, 0, MOST_LIFT);
    const wanted = this.team ? everyone.reduce((sum, each) => sum + high(each), 0) / everyone.length : high(this);
    // How fast the friend gets out: with friends, the share of everyone's arms that are up.
    const share = this.team ? everyone.filter((each) => each.up).length / everyone.length : 1;

    this.freeing = false;
    if (this.phase === 'arriving') {
      if (this.phaseFor >= ARRIVE_SECONDS) {
        this.setPhase('lifting');
        this.catchUp();
      }
      return;
    }
    if (this.phase === 'resting') {
      if (this.phaseFor >= REST_SECONDS) this.arrive();
      return;
    }
    this.moveWeight(dt, wanted);
    this.fillHoney(dt);
    // The friend gets out while the weight is up over the line, or, with friends, while anyone's arm is at its own.
    this.freeing = this.phase === 'lifting' && !this.mustLower && (this.team ? share > 0 : this.up);
    if (this.phase === 'lifting') this.updateLifting(dt, share);
    else this.updateFreed(dt);
  }

  /**
   * Honey for a steady hold, while a hive is up over the line, before the friend is out or after. A hold that
   * shakes still frees the friend, and only the honey waits.
   */
  fillHoney(dt) {
    if (!this.rescue.hive || this.honeyGiven || !this.up || !this.steady) return;
    this.honey = Math.min(1, this.honey + dt / Math.max(HONEY_LEAST, this.holdSeconds * HONEY_SHARE));
    if (this.honey < 1) return;
    this.honeyGiven = true;
    this.stats.honey += 1;
    this.emit('honey', { honey: this.stats.honey });
  }

  setPhase(phase) {
    this.phase = phase;
    this.phaseFor = 0;
  }

  /** The child's own arm: whether it's up, each time it goes up, how steady it is, and whether they're resting. */
  readArm(dt, lift) {
    // How fast it's moving, measured from one reading of the tracker to the next: the screen is drawn more often
    // than the tracker looks, and between its looks the arm only seems to be still.
    this.sinceMoved += dt;
    const speed = this.sinceMoved > 0 ? Math.abs(lift - this.lift) / this.sinceMoved : 0;
    if (lift !== this.lift || this.sinceMoved >= TRACKER_SLOWEST) {
      this.wobble += (speed - this.wobble) * (1 - Math.exp(-this.sinceMoved / WOBBLE_SECONDS));
      this.sinceMoved = 0;
    }
    this.lift = lift;
    if (lift < LOWERED) this.armed = true;
    const wasUp = this.armUp;
    this.armUp = lift >= UP_AT || (wasUp && lift >= DOWN_AGAIN);
    if (this.armUp && !wasUp && this.armed) {
      this.armed = false;
      this.stats.lifts += 1;
      this.emit('lift', { lifts: this.stats.lifts });
    }
    if (this.armUp) {
      this.holdFor += dt;
      this.stats.heldSeconds += dt;
      this.stats.longestHold = Math.max(this.stats.longestHold, this.holdFor);
    } else {
      this.holdFor = 0;
    }
    // Resting is an arm that stays down. Anything else is having a go.
    this.idle = lift >= LOWERED || this.wobble > 0.6 ? 0 : this.idle + dt;
    const resting = this.idle >= IDLE_SECONDS && this.phase === 'lifting';
    if (resting !== this.resting) {
      this.resting = resting;
      if (resting) this.emit('resting');
    }
  }

  /** The weight follows the arm: up no faster than it can go, and down with it. */
  moveWeight(dt, wanted) {
    if (wanted > this.height) {
      const fastest = this.slow ? 1 / this.rules.heavyRise : LIGHT_RISE;
      this.height = Math.min(wanted, this.height + fastest * dt);
    } else {
      this.height += (wanted - this.height) * (1 - Math.exp(-FALL_RATE * dt));
    }
    const wasUp = this.up;
    this.up = !this.mustLower && (this.height >= UP_AT || (wasUp && this.height >= DOWN_AGAIN));
    if (this.up && !wasUp) this.emit('up', { rescue: this.rescue });
    if (!this.up && wasUp && this.phase === 'lifting' && !this.mustLower) this.emit('dropped', { rescue: this.rescue, out: this.out });
  }

  updateLifting(dt, share) {
    const { rescue } = this;
    this.lowFor = this.lift < LOWERED ? this.lowFor + dt : 0;
    this.middleFor = !this.up && this.lift >= 0.45 && this.lift < UP_AT ? this.middleFor + dt : 0;
    if (this.mustLower) {
      // A rock stays where the last lift got it, and the arm comes down for the next one.
      this.upFor = this.lift >= LOWERED ? this.upFor + dt : 0;
      if (this.lift < LOWERED) {
        this.mustLower = false;
        this.pull = 0;
        this.upFor = 0;
        this.height = Math.min(this.height, this.lift);
      }
      return;
    }
    // A star over it, for lifting a little higher than the line. Missing it costs nothing.
    if (rescue.star && !this.starTaken && this.height >= this.starAt) {
      this.starTaken = true;
      this.stats.stars += 1;
      this.emit('star', { stars: this.stats.stars });
    }
    if (!this.freeing) return;
    const speed = share * (this.helping ? 2 : 1);
    if (rescue.lifts > 1) {
      this.pull += (dt * speed) / (this.holdSeconds * NOTCH_HOLD);
      if (this.pull < 1) return;
      this.pulls += 1;
      this.pull = 0;
      this.emit('notch', { rescue, n: this.pulls, of: rescue.lifts });
      if (this.pulls >= rescue.lifts) this.free();
      else {
        this.mustLower = true;
        this.up = false;
        this.upFor = 0;
      }
      return;
    }
    this.progress = Math.min(1, this.progress + (dt * speed) / (this.holdSeconds * (rescue.parts > 1 ? DUCKS_HOLD : 1)));
    // Ducklings come out one at a time, and one that's out stays out.
    while (rescue.parts > 1 && this.parts < rescue.parts - 1 && this.progress >= (this.parts + 1) / rescue.parts) {
      this.parts += 1;
      this.stats.ducklings += 1;
      this.emit('part', { rescue, n: this.parts, of: rescue.parts });
    }
    if (this.progress >= 1) this.free();
  }

  /** The friend is out. by is who the server says got them out, with friends. */
  free() {
    const { rescue } = this;
    if (!rescue || this.phase !== 'lifting') return;
    this.progress = 1;
    if (rescue.parts > 1) {
      this.stats.ducklings += rescue.parts - this.parts;
      this.parts = rescue.parts;
    }
    this.stats.freed += 1;
    this.setPhase('freed');
    this.upFor = 0;
    this.stillFor = 0;
    this.armPeak = this.lift;
    this.fallFrom = this.clock;
    this.emit('freed', { rescue, index: this.index, freed: this.stats.freed });
    if (rescue.kind === 'chest') {
      this.stats.trophy = true;
      this.emit('trophy');
    }
    // What made this one easier is used up, and what this friend gives is for the next.
    if (rescue.heavy && this.balloons > 0) {
      this.balloons -= 1;
      if (this.balloons === 0) this.emit('balloons-gone');
    }
    if (this.helping) {
      this.helping = false;
      this.helper = null;
      this.emit('helper-gone');
    }
    const more = this.index + 1 < this.rescues.length;
    if (rescue.gives === 'balloons' && more) {
      this.balloons = BALLOON_LIFTS;
      this.emit('balloons', { lifts: BALLOON_LIFTS });
    } else if (rescue.gives === 'helper' && more) {
      this.helper = rescue.friend;
    }
  }

  /**
   * With friends on one weight, the server says when a rescue is over, as someone's game got there first.
   * Whatever this game had got to, that rescue is done here too.
   */
  settle(index) {
    this.settled = Math.max(this.settled, index);
    this.catchUp();
  }

  /** A game that has fallen behind its friends', as while a grown-up had its panel open, goes straight on. */
  catchUp() {
    if (this.state !== 'playing' || this.index > this.settled) return;
    if (this.phase === 'arriving') this.setPhase('lifting');
    if (this.phase === 'lifting') this.free();
  }

  updateFreed(dt) {
    const { rescue } = this;
    this.upFor = this.height >= SET_DOWN ? this.upFor + dt : 0;
    if (this.team) {
      // Nobody is waited for: one friend still holding it up doesn't keep the rest from the next rescue.
      if (this.phaseFor >= TEAM_FREED_SECONDS) this.setDown(true);
      return;
    }
    // How it comes down: an owl asleep on it stays asleep if it's put down gently, which is how long it takes
    // from when the arm starts down, from as high as it was held.
    this.armPeak = Math.max(this.armPeak, this.lift);
    if (this.lift >= this.armPeak * GENTLE_FROM) this.fallFrom = this.clock;
    if (this.height < SET_DOWN) {
      this.setDown(this.clock - this.fallFrom >= GENTLE_SECONDS);
      return;
    }
    // An arm that has stopped, part of the way down, is at rest there: a bent arm rests higher than one that hangs.
    this.stillFor = this.wobble * this.span < STILL_WITHIN && this.lift < STILL_BELOW ? this.stillFor + dt : 0;
    if (this.stillFor >= STILL_SECONDS) {
      this.stillFor = 0;
      this.emit('settle', { rescue });
    }
  }

  /** The weight is back on the ground, and the next friend needs help, or that was the last. */
  setDown(gentle) {
    const { rescue } = this;
    this.height = 0;
    this.up = false;
    if (rescue.owl) {
      if (gentle) {
        this.stats.feathers += 1;
        this.emit('feather', { feathers: this.stats.feathers });
      } else {
        this.owlAwake = true;
        this.emit('woke');
      }
    }
    this.emit('down', { rescue, gentle });
    if (this.index + 1 >= this.rescues.length) this.finish();
    else this.setPhase('resting');
  }

  /** The game is over: everyone's free, or, against friends, someone else has freed all of theirs. */
  finish() {
    if (this.state === 'finished') return;
    this.state = 'finished';
    this.emit('finished', { stats: this.stats, all: this.stats.freed >= this.rescues.length });
  }
}
