// Moto Mountain's rules: a motorbike going up a winding mountain road, steered by leaning the body. The bike
// rides by itself. In a bend it drifts to the outside, and leaning into the bend holds it on the road: a gentle
// bend needs a small lean and a tight one a deep lean, held until the road straightens. It's the game about
// leaning the trunk to each side and holding it there, which children with hemiplegia find hard, above all
// towards their weaker side.
//
// The wild ride, which is how the game comes, is a race: other riders to beat, steep hills that throw the bike
// into the air at the top, ramps, hay bales in the way, and a river to jump. The gentle ride is the road alone.
//
// No screen, camera or sound in this file, so all of it runs in the unit tests. Distances are in metres along
// the road from the start line, x is across the road with the right side positive, and a lean is a share of
// this child's own lean to that side: 1 is as far as a bend ever asks for.
import { BEND_RAMP, FULL_CURVE, bendShare, hillsAt, nearestApproach, shapeOf, slopeAt } from './road.js';

export { FULL_CURVE, bendShare };

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const smooth = (share) => {
  const t = clamp(share, 0, 1);
  return t * t * (3 - 2 * t);
};
const RAD = Math.PI / 180;

/* ------------------------------- the child's lean ------------------------------- */

// MediaPipe's numbers for the points this game reads.
const POINTS = { leftShoulder: 11, rightShoulder: 12, leftHip: 23, rightHip: 24 };
const SURE = 0.5; // A point the tracker is less sure of than this isn't used.

export const LEAN = {
  // How far the body leans for a whole lean, in degrees from upright, by the grown-ups' setting for how big a
  // movement has to be. It's never more than most of this child's own lean to that side, from the warm-up.
  full: { tiny: 7, small: 10, medium: 14, big: 19 },
  ofBest: 0.85,
  // A side the warm-up didn't measure, as when it's skipped, asks for no more than this: nothing is known of
  // how far this child leans, and a body bending at the waist is read as only about half as far as it bends.
  unmeasured: 8,
  least: 3.5, // A whole lean is never less than this, however small the child's own is.
  // Around upright nothing counts, so a child sitting a little crooked rides straight: this share of a whole
  // lean, and never less than this many degrees, which is what the tracker wobbles by.
  dead: 0.14,
  deadLeast: 1.6,
  most: 3, // Leaning further than a whole lean goes on counting, up to this many whole leans: see turnOf.
  follow: 10, // How quickly the reading follows the body, per second.
  settle: 1.5, // And how quickly the slow average does, which is where upright is taken from.
  uprightMost: 10, // A body leaning more than this isn't taken as upright.
  wild: 22, // A jump of more than this many degrees between two looks is the tracker's mistake,
  wildLooks: 2, // unless it's still there after this many more.
  hipsFollow: 1.5, // How quickly hips coming into the picture, or going out of it, change how the lean is read.
  lostAfter: 0.5, // Seconds without a body before the lean is let go.
  letGo: 3, // And how quickly the bike then comes upright, per second.
  easedBy: 0.85, // What a whole lean comes down to, each time a child who's trying can't make a bend.
};

/**
 * The two things a lean is read from, each in radians, from what the tracker reports: positive towards the
 * child's right, which is the right of the picture as they see it in the mirror. shoulders is the tilt of the
 * line between the shoulders, and trunk the tilt of the line from the middle of the hips to the middle of the
 * shoulders, or null with the hips hidden, as behind a table. Returns null with no shoulders to go by.
 */
export function leanParts(body, aspect = 16 / 9) {
  const image = body?.image;
  if (!image) return null;
  const at = (index) => {
    const point = image[index];
    return point ? { x: (1 - point.x) * aspect, y: point.y, sure: point.visibility ?? 1 } : null;
  };
  const left = at(POINTS.leftShoulder);
  const right = at(POINTS.rightShoulder);
  if (!left || !right || left.sure < SURE || right.sure < SURE) return null;
  const across = right.x - left.x;
  // Shoulders one behind the other, as when the child turns away, say nothing about leaning.
  if (!(across > 0.02)) return null;
  const shoulders = Math.atan2(right.y - left.y, across);
  const leftHip = at(POINTS.leftHip);
  const rightHip = at(POINTS.rightHip);
  if (!leftHip || !rightHip || leftHip.sure < SURE || rightHip.sure < SURE) return { shoulders, trunk: null };
  const up = (leftHip.y + rightHip.y) / 2 - (left.y + right.y) / 2;
  if (!(up > 0.03)) return { shoulders, trunk: null };
  return { shoulders, trunk: Math.atan2((left.x + right.x) / 2 - (leftHip.x + rightHip.x) / 2, up) };
}

/**
 * How far the body leans to the side, in radians, from one look: the tilt of the shoulders and the tilt of the
 * trunk, half of each, or the shoulders alone with the hips hidden. hips, from 0 to 1, is how much the trunk
 * counts. The trunk is what shifting the weight sideways moves, and a shoulder alone can be hitched up without
 * leaning at all, so both are read. A body leaning all in a piece tips both the same, and one bending at the
 * waist tips its shoulders about twice as far as the line from its hips: on real footage of that, the reading
 * is a little under half the bend at the top of the spine, and goes evenly with it.
 */
export function leanOf(body, aspect = 16 / 9, hips = 1) {
  const parts = leanParts(body, aspect);
  if (!parts) return null;
  if (parts.trunk === null) return parts.shoulders;
  return parts.shoulders + (parts.trunk - parts.shoulders) * 0.5 * hips;
}

/** The child's lean in their own terms: where upright is, and how far a whole lean is to each side. */
export class Leaner {
  constructor({ size = 'medium' } = {}) {
    this.best = { left: null, right: null }; // The child's own lean each way, in radians, from the warm-up.
    this.eased = { left: 1, right: 1 };
    this.zero = 0;
    this.setSize(size);
    this.forget();
  }

  setSize(name) {
    this.sizeName = LEAN.full[name] ? name : 'medium';
    this.full = LEAN.full[this.sizeName] * RAD;
  }

  /** The child stepped away or the camera restarted. Where upright is, and their own lean, are kept. */
  forget() {
    this.angle = null;
    this.slow = null;
    this.last = null;
    this.hips = null; // How much the hips count, from 0 to 1: see read().
    this.trunkOff = 0;
    this.wild = 0;
    this.raw = 0;
    this.share = 0;
    this.seen = false;
    this.unseen = 0;
  }

  /** How far a whole lean is to one side, in radians. */
  reachOf(side) {
    const best = this.best[side];
    const most = Math.min(this.full, best === null ? LEAN.unmeasured * RAD : best * LEAN.ofBest);
    return Math.max(LEAN.least * RAD, most * this.eased[side]);
  }

  get reach() {
    return { left: this.reachOf('left'), right: this.reachOf('right') };
  }

  /**
   * Wherever the body has settled is upright from now on, unless it's leaning a long way. A child who sits a
   * little to one side, as many do, then rides straight without trying.
   */
  restHere() {
    if (this.slow === null || Math.abs(this.slow) > LEAN.uprightMost * RAD) return false;
    this.zero = this.slow;
    return true;
  }

  /** The warm-up measured how far this child leans to one side, in radians. */
  measured(side, best) {
    this.best[side] = best;
    this.eased[side] = 1;
  }

  /** A child who's trying and can't make a bend: a whole lean to that side comes down to meet them. */
  ease(side) {
    const before = this.reachOf(side);
    this.eased[side] *= LEAN.easedBy;
    return this.reachOf(side) < before - 1e-9;
  }

  /**
   * One look from the tracker, as the body it reports. Hips that come into the picture or go out of it, as at
   * the bottom edge of it, change how the lean is read little by little, so the bike is never jolted by them.
   */
  read(body, aspect, dt) {
    const parts = leanParts(body, aspect);
    if (!parts) return this.update(null, dt);
    const seen = parts.trunk !== null;
    this.hips = this.hips === null ? Number(seen) : this.hips + (Number(seen) - this.hips) * (1 - Math.exp(-LEAN.hipsFollow * dt));
    // While they're out of sight, the trunk is taken to be where it last was against the shoulders.
    if (seen) this.trunkOff = parts.trunk - parts.shoulders;
    return this.update(parts.shoulders + this.trunkOff * 0.5 * this.hips, dt);
  }

  /** One look from the tracker: the lean in radians, or null with nobody to see. Returns the lean as a share. */
  update(angle, dt) {
    if (angle === null || !Number.isFinite(angle)) {
      this.unseen += dt;
      if (this.unseen >= LEAN.lostAfter) {
        this.seen = false;
        this.angle = null;
        this.slow = null;
        this.last = null;
      }
      // With nobody to copy, the bike comes upright by itself, gently.
      this.share *= Math.exp(-LEAN.letGo * dt);
      this.raw *= Math.exp(-LEAN.letGo * dt);
      if (Math.abs(this.share) < 0.01) this.share = 0;
      return this.share;
    }
    // One wild look is the tracker's mistake. The same one a few times running is the child.
    if (this.last !== null && Math.abs(angle - this.last) > LEAN.wild * RAD && this.wild < LEAN.wildLooks) {
      this.wild += 1;
      return this.share;
    }
    this.wild = 0;
    this.last = angle;
    this.unseen = 0;
    this.seen = true;
    const towards = (value, rate) => (value === null ? angle : value + (angle - value) * (1 - Math.exp(-rate * dt)));
    this.angle = towards(this.angle, LEAN.follow);
    this.slow = towards(this.slow, LEAN.settle);

    this.raw = this.angle - this.zero;
    const reach = this.reachOf(this.raw < 0 ? 'left' : 'right');
    const dead = Math.min(0.5, Math.max(LEAN.dead, (LEAN.deadLeast * RAD) / reach));
    const size = Math.abs(this.raw) / reach;
    this.share = size <= dead ? 0 : Math.sign(this.raw) * Math.min(LEAN.most, (size - dead) / (1 - dead));
    return this.share;
  }
}

export const WARM = {
  sides: ['left', 'right'],
  hold: 0.8, // A lean counts as far as it was held for this long, so a lurch isn't taken as the child's lean.
  least: 4, // Degrees: less than this isn't a lean that was measured.
  back: 0.45, // Coming back to under this share of it says the lean is over.
  patience: 9, // Seconds on one side before moving on with whatever there was.
  between: 0.9, // Seconds between one side and the other.
};

/**
 * Before the first ride, the child leans as far as they comfortably can to each side, and that's what a whole
 * lean is set from, each side by itself. It can be skipped, and then a whole lean is the grown-ups' setting.
 */
export class Warmup {
  constructor({ leaner, sides = WARM.sides, onEvent = () => {} }) {
    this.leaner = leaner;
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

  /** How far through the lean being asked for the child is, for the bar under the film. */
  get share() {
    return clamp(this.towards / this.leaner.full, 0, 1);
  }

  startSide() {
    this.time = 0;
    this.best = 0;
    this.towards = 0;
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
    const { leaner } = this;
    this.time += dt;
    const sign = this.side === 'left' ? -1 : 1;
    this.towards = leaner.seen ? Math.max(0, leaner.raw * sign) : 0;
    // The least it has been over the last moment is how far it was held.
    this.recent.push({ at: this.time, value: this.towards });
    while (this.recent.length && this.time - this.recent[0].at > WARM.hold) this.recent.shift();
    const held = this.time >= WARM.hold ? Math.min(...this.recent.map(({ value }) => value)) : 0;
    if (held > this.best) this.best = held;

    const enough = this.best >= WARM.least * RAD;
    if (enough && this.towards < this.best * WARM.back) this.measure();
    else if (this.time >= WARM.patience) this.measure();
  }

  measure() {
    const side = this.side;
    const best = this.best >= WARM.least * RAD ? this.best : null;
    this.results[side] = best;
    if (best !== null) this.leaner.measured(side, best);
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

/* ------------------------------- the road ------------------------------- */

export const ROAD = {
  half: 4.2, // From the middle of the road to the edge of the tarmac.
  verge: 2.4, // The grass beside it, which a bike can still ride on, slowly.
  bridgeHalf: 2.8, // A bridge is narrower,
  rail: 0.5, // with this much plank beyond that before its railing.
  taper: 8, // And the road narrows down to it over this many metres.
  start: 70, // The straight before the first bend,
  end: 85, // and after the last, up to the finish.
};
export const BEND_COUNTS = [6, 10, 14];
export const PACES = { gentle: 0.78, usual: 1, quick: 1.18 };
// A bend comes on at the same pace whatever the level: a lean of a little over half a whole one is asked for
// over this many seconds at the bike's fastest, and a deeper one over longer. So a tighter bend on a faster
// road leaves a child as long to lean into it as a gentle one at level 1.
const ONSET = { seconds: 1, need: 0.55, fastest: 1.16 };
// And then it's held for this many seconds, at the usual pace.
const HOLD_SECONDS = [1.4, 3.4];
// Where two bends in three go one way, those are the shorter ones and the others the longer, so the road
// doesn't wind round and round.
const HOLD_SECONDS_MORE = { towards: [1.4, 2.2], away: [3.2, 4.2] };
const LAY_OUT_TRIES = 12;
const ROOM_BETWEEN = 90; // Metres the road keeps from itself, for the hillside between.
const GAP_LENGTH = [42, 62];
// The big bend, from level 8: most of the way round, with the lean held all the way.
const BIG = { need: 0.72, turn: 150 * RAD };
const STAR_GAP = 10;
const STAR_SIDE = 2;
const SNOW_FROM = 0.55; // The share of the road after which there's snow, at level 10.

// What comes along in the straights, how long a straight it needs, and how many a ride has at most.
const FEATURES = {
  puddle: { room: [58, 70], most: 4 },
  boost: { room: [58, 70], most: 4 },
  sheep: { room: [64, 76], most: 3 },
  bridge: { room: [78, 88], most: 2 },
  ramp: { room: [70, 80], most: 3 },
  river: { room: [100, 112], most: 2 },
  scooter: { room: [104, 114], most: 2 },
};
const FEATURE_ORDER = ['puddle', 'boost', 'sheep', 'bridge', 'ramp', 'scooter'];
// On the wild ride there are ramps from the start, so they aren't something a level brings, and there's a river.
const FEATURE_ORDER_WILD = ['puddle', 'boost', 'sheep', 'bridge', 'river', 'scooter'];
const FEATURE_CHANCE = 0.62;
// On the wild ride fewer of the straights have something from the levels, which leaves most of them for hills,
// bales and ramps.
const FEATURE_CHANCE_WILD = 0.3;

// The wild ride: what's in a straight that has nothing else, how long a straight it needs, and how often.
const WILD = {
  crest: { room: [86, 100], share: 0.4 }, // A steep hill, which throws a bike that's going well into the air at its top.
  both: { room: [124, 138], share: 0.25 }, // Hay bales to steer round, and then a hill.
  wall: { room: [84, 96], share: 0.2 }, // A ramp at one side, and bales right across the road beyond it, to fly over.
  bales: { room: [60, 72], share: 0.15 }, // Hay bales across half the road, to steer round.
  boost: { room: [104, 116], arrows: 16, top: 58 }, // A speed arrow, where there is one, is followed by a hill: a longer jump.
  balesBefore: 26, // With a hill after them, the bales are this far into the straight, and the hill's top this far.
  topAfter: 72,
  slope: { tall: [3, 5.5], round: 24 }, // A bend in three goes downhill, and one in three uphill, by this many metres.
  hill: { top: 24, up: 30, down: [52, 60], rise: [9.5, 11.5], falls: [0.95, 1.15], round: 5 }, // As steep as a ramp of earth: about 20 degrees.
  bank: { top: 40, up: 9, down: 4.5, rise: 3, round: 1.2, water: [3, 14] }, // A river: the near bank is a ramp, with a drop to the water just past it.
  balesAt: 0.55, // How far along its straight a row of bales is.
  rampAt: 34, // How far into its straight a ramp is,
  wallAfter: 13, // and how far past it the bales it flies over.
  // The stars in the air: how far past the top of a hill, a ramp or a river's bank each is, and how high over
  // the road there, which is about where a bike going well flies.
  airStars: { hill: [[8, 1.6], [15, 2], [22, 1.5]], ramp: [[6, 2], [11, 2], [16, 1.2]], bank: [[6, 4.4], [11, 4.8], [16, 4]] },
};
// The other riders in the race: where they start, how good each is, and how the race is kept close.
export const RIVAL = {
  grid: 7, // Metres between one rider and the next on the start line, with the child at the back.
  lanes: [-2.2, 2.2, -1.1, 1.1, 0],
  skills: [1, 1.05, 1.09, 1.13, 1.16], // Each one's speed, as a share of the bike's own steady speed.
  far: 70, // A rider this far in front of the child has eased off as much as they will, and one this far behind is trying their hardest,
  band: 0.14, // which is this share slower, or faster.
  sees: 42, // Metres ahead that a rider sees what's in the way,
  room: 0.9, // how much room they leave it,
  across: 3, // and how fast they go across the road, in metres a second.
  slips: 0.14, // The chance that a rider doesn't get out of the way of something.
  slowed: 2, // Seconds a rider takes to get going again after hitting something.
};
// How good the other riders are, by the grown-ups' setting: their speed, as a share of what's above.
export const RIVALRY = { easy: 0.93, medium: 1.035, hard: 1.09 };

export const NEW_THINGS = {
  2: [{ id: 'star', mark: '⭐', name: 'Gold stars', nameKa: 'ოქროს ვარსკვლავები' }],
  3: [{ id: 'puddle', mark: '💦', name: 'Puddles', nameKa: 'გუბეები' }],
  4: [{ id: 'boost', mark: '⏩', name: 'Speed arrows', nameKa: 'სიჩქარის ისრები' }],
  5: [{ id: 'sheep', mark: '🐑', name: 'Sheep on the road', nameKa: 'ცხვრები გზაზე' }],
  6: [{ id: 'bridge', mark: '🌉', name: 'A narrow bridge', nameKa: 'ვიწრო ხიდი' }],
  7: [{ id: 'ramp', mark: '🚀', name: 'A jump', nameKa: 'ტრამპლინი' }],
  8: [{ id: 'big', mark: '↩️', name: 'The big bend', nameKa: 'დიდი მოსახვევი' }],
  9: [{ id: 'scooter', mark: '🛵', name: 'A friend to pass', nameKa: 'მეგობარი, რომელსაც გაუსწრებ' }],
  10: [{ id: 'snow', mark: '⛄', name: 'Snow at the top, and the cup', nameKa: 'თოვლი მწვერვალზე და თასი' }],
};
// The wild ride has jumps from the start, so what level 7 brings to it is a river to jump.
export const NEW_THINGS_WILD = { ...NEW_THINGS, 7: [{ id: 'river', mark: '🌊', name: 'A river to jump', nameKa: 'მდინარე, რომელსაც უნდა გადაახტე' }] };
const clampLevel = (level) => clamp(Math.round(Number(level) || 1), 1, 10);
export const newThingsAt = (level, wild = false) => (wild ? NEW_THINGS_WILD : NEW_THINGS)[clampLevel(level)] ?? [];
/** What's new at a level, for the cards: nothing at level 1. */
export const newAt = (level, wild = false) => newThingsAt(level, wild).map(({ mark, name, nameKa }) => ({ mark, name, nameKa }));
/** Everything a level has that level 1 hasn't, the newest last, for naming each thing the first time it comes. */
export const thingsUpTo = (level, wild = false) => {
  const things = wild ? NEW_THINGS_WILD : NEW_THINGS;
  return Object.keys(things).map(Number).filter((from) => from <= clampLevel(level)).flatMap((from) => things[from]);
};

const ramp = (level, from, to) => from + ((to - from) * (level - 1)) / 9;

/**
 * What a level changes. Level 1 is the plain road. How many bends a ride has, which way most of them go, how
 * far a lean has to be and how fast the bike goes stay as a grown-up chose: a level only brings its new thing,
 * bends a little tighter, and a bike a fifth faster by level 10, which still leaves over 80% of level 1's
 * time to see what's coming. With friends it's the plain road with its stars and speed arrows, at any level.
 */
export function rideLevel(level = 1, plain = false, wild = false) {
  const at = clampLevel(level);
  // With friends it's the road alone: they are each other's race.
  const race = wild && !plain;
  return {
    level: at,
    wild: race,
    cruise: ramp(at, 15, 18.2), // Metres a second.
    need: [ramp(at, 0.5, 0.6), ramp(at, 0.58, 0.78)], // How much of a whole lean the bends need.
    star: plain || at >= 2,
    puddle: !plain && at >= 3,
    boost: plain || at >= 4,
    sheep: !plain && at >= 5,
    bridge: !plain && at >= 6,
    // The wild ride has ramps from the start, and from level 7 a river to jump.
    ramp: !plain && (race || at >= 7),
    river: race && at >= 7,
    big: !plain && at >= 8,
    scooter: !plain && at >= 9,
    snow: !plain && at >= 10,
    cup: !plain && at >= 10,
    // The wild ride is a race: how many other riders there are, and how many of the road's empty straights
    // have a hill, a row of bales or a ramp in them.
    rivals: race ? (at < 6 ? 4 : 5) : 0,
    busy: race ? ramp(at, 0.8, 0.96) : 0,
    // And how many of those have a second jump after the first: more as the levels go up.
    doubles: race ? ramp(at, 0.15, 0.7) : 0,
    plain,
  };
}

/**
 * Lays out a ride: its bends, and what's on the road. The same numbers from random lay out the same ride, so
 * friends each get the same road. side is the side being worked on, and favour 'more' sends two bends in every
 * three that way.
 */
export function layOut(options = {}, room = ROOM_BETWEEN) {
  let plan = layOutOnce(options);
  // A road that turns more one way than the other could come round on itself. One that would is laid out
  // again, from the numbers that come next, which are the same on every friend's computer. As the bends are
  // now, none does: this is here for when they change. room is how far the road has to keep from itself.
  for (let tries = 1; tries < LAY_OUT_TRIES && nearestApproach(shapeOf(plan)) < room; tries += 1) {
    plan = layOutOnce(tries < LAY_OUT_TRIES - 2 ? options : { ...options, favour: 'even' });
  }
  return plan;
}

function layOutOnce({ level = 1, bends = 10, favour = 'even', side = 'left', random = Math.random, plain = false, wild = false } = {}) {
  const rules = rideLevel(level, plain, wild);
  const count = BEND_COUNTS.includes(bends) ? bends : 10;
  const between = ([low, high]) => low + (high - low) * random();
  const pick = (list) => list[Math.min(list.length - 1, Math.floor(random() * list.length))];

  // Which way each bend goes: one way and then the other, or two in three towards the side being worked on,
  // and never three the same way running, which would send the road round in a ring.
  const turns = [];
  const worked = side === 'right' ? 1 : -1;
  if (favour === 'more') {
    const phase = Math.floor(random() * 3);
    for (let i = 0; i < count; i += 1) turns.push((i + phase) % 3 === 2 ? -worked : worked);
  } else {
    const first = random() < 0.5 ? -1 : 1;
    for (let i = 0; i < count; i += 1) turns.push(i % 2 ? -first : first);
  }
  // The big bend is near the middle of the ride. Where most bends go one way, it goes the other.
  let bigIndex = -1;
  if (rules.big) {
    bigIndex = Math.floor(count / 2);
    if (favour === 'more') {
      const others = turns.map((turn, index) => (turn === -worked ? index : -1)).filter((index) => index >= 0);
      bigIndex = others.reduce((nearest, index) => (Math.abs(index - count / 2) < Math.abs(nearest - count / 2) ? index : nearest), others[0]);
    }
  }

  // What's in each straight between two bends. The newest thing comes first, so it's met right away, and
  // again in the second half.
  const unlocked = (rules.wild ? FEATURE_ORDER_WILD : FEATURE_ORDER).filter((name) => rules[name]);
  const newest = newThingsAt(level, rules.wild).map(({ id }) => id).find((id) => unlocked.includes(id)) ?? null;
  const used = Object.fromEntries(Object.keys(FEATURES).map((name) => [name, 0]));
  const features = new Array(count).fill(null); // features[i] is in the straight after bend i - 1. 0 is the start.
  const take = (slot, name) => {
    if (!name || features[slot] || used[name] >= FEATURES[name].most) return false;
    features[slot] = name;
    used[name] += 1;
    return true;
  };
  if (newest && !plain) {
    take(1, newest);
    take(Math.min(count - 1, Math.ceil(count / 2) + 1), newest);
  }
  const chance = rules.wild ? FEATURE_CHANCE_WILD : FEATURE_CHANCE;
  for (let slot = 1; slot < count; slot += 1) {
    if (features[slot] || !unlocked.length || random() >= chance) continue;
    const free = unlocked.filter((name) => used[name] < FEATURES[name].most);
    if (free.length) take(slot, pick(free));
  }

  // On the wild ride, a straight with nothing else in it has a hill, a row of bales or a ramp, most of the time.
  const wilds = features.map((feature, slot) => {
    if (!rules.wild || feature || slot === 0 || random() >= rules.busy) return null;
    let roll = random();
    for (const kind of ['crest', 'both', 'wall', 'bales']) {
      if (roll < WILD[kind].share) return kind;
      roll -= WILD[kind].share;
    }
    return 'bales';
  });

  const slopesFrom = rules.wild ? Math.floor(random() * 3) : 0;
  const list = [];
  const things = [];
  const hills = [];
  const add = (thing) => things.push(thing);
  // Stars in the air, past the top of a hill or a ramp, for a bike that's flying.
  const airStars = (top, from, x = 0) => {
    if (rules.star) for (const [past, high] of WILD.airStars[from]) add({ kind: 'star', at: top + past, x, air: true, high });
  };
  // A hill, with stars in the air past its top.
  const hillAt = (top) => {
    const rise = between(WILD.hill.rise);
    hills.push({ at: top, up: WILD.hill.up, down: between(WILD.hill.down), rise, drop: rise * between(WILD.hill.falls), round: WILD.hill.round });
    airStars(top, 'hill');
  };
  // Hay bales across half the road, to one side, or across the middle of it with a way round on each side.
  const balesAt = (where, side) => {
    const middle = random() < 0.34;
    add({ kind: 'barrier', at: where, x: middle ? 0 : side * 2.1, reach: middle ? 1.5 : 2 });
  };
  // A ramp at one side of the road, and bales right across it beyond, which only a bike off the ramp gets over.
  const wallAt = (from, side) => {
    const ramp = from + WILD.rampAt;
    add({ kind: 'ramp', at: ramp, x: side * 1.7, reach: 1.5 });
    add({ kind: 'barrier', at: ramp + WILD.wallAfter, x: 0, reach: ROAD.half + ROAD.verge, wall: true });
    // Stars over the ramp's side of the road, where the bike that took it is.
    airStars(ramp, 'ramp', side * 1.7);
  };
  let at = ROAD.start;
  for (let i = 0; i < count; i += 1) {
    const big = i === bigIndex;
    const need = big ? BIG.need : between(rules.need);
    // A bend turns as far as its lean and its length make it.
    const onset = Math.max(BEND_RAMP, rules.cruise * ONSET.fastest * ONSET.seconds * (need / ONSET.need));
    const holds = favour === 'more' ? HOLD_SECONDS_MORE[turns[i] === worked ? 'towards' : 'away'] : HOLD_SECONDS;
    const length = big ? BIG.turn / (BIG.need * FULL_CURVE) + onset : 2 * onset + between(holds) * rules.cruise;
    const bend = { index: i, from: at, to: at + length, turn: turns[i], need, big, ramp: onset };
    list.push(bend);
    // On the wild ride some bends go downhill, where the bike is faster, and some uphill, where it's slower.
    if (rules.wild) {
      // One downhill, one uphill, one on the level, and round again, from wherever this road starts.
      const way = ['down', 'up', 'level'][(i + slopesFrom) % 3];
      const tall = between(WILD.slope.tall);
      // A slope is a hill with one side to it: it comes on, and goes off, gently, so no bike leaves the ground for it.
      const turn = WILD.slope.round / 2;
      if (way === 'down') hills.push({ at: bend.from, up: turn, rise: 0, down: length, drop: tall, round: WILD.slope.round, slope: 'down' });
      else if (way === 'up') hills.push({ at: bend.to, up: length, rise: tall, down: turn, drop: 0, round: WILD.slope.round, slope: 'up' });
    }
    if (rules.star) {
      // Stars down the middle of the bend, for the bike that's leaning as far as the bend needs.
      const stars = big ? 5 : 3;
      const middle = (bend.from + bend.to) / 2;
      for (let n = 0; n < stars; n += 1) add({ kind: 'star', at: middle + (n - (stars - 1) / 2) * STAR_GAP, x: 0 });
    }
    at = bend.to;
    if (i === count - 1) break;

    // The straight after it, and what's in it.
    const feature = features[i + 1];
    const wildOne = wilds[i + 1];
    // On the wild ride a speed arrow is followed by a hill, which takes a longer straight.
    const boosted = rules.wild && feature === 'boost';
    const gap = boosted ? between(WILD.boost.room) : feature ? between(FEATURES[feature].room) : wildOne ? between(WILD[wildOne].room) : between(GAP_LENGTH);
    const from = at;
    const to = at + gap;
    const middle = (from + to) / 2;
    const oneSide = (random() < 0.5 ? -1 : 1);
    if (feature === 'puddle') add({ kind: 'puddle', at: middle, x: oneSide * 2.1, reach: 1.9 });
    else if (boosted) {
      add({ kind: 'boost', at: from + WILD.boost.arrows, x: oneSide * 2.1, reach: 1.7 });
      hillAt(from + WILD.boost.top);
    } else if (feature === 'boost') add({ kind: 'boost', at: middle, x: oneSide * 2.1, reach: 1.7 });
    else if (feature === 'sheep') add({ kind: 'sheep', at: middle + 6, x: oneSide * 1.6, reach: 1.9 });
    else if (feature === 'ramp') add({ kind: 'ramp', at: middle, x: oneSide * 1.7, reach: 1.5 });
    else if (feature === 'bridge') add({ kind: 'bridge', at: from + 18, from: from + 18, to: to - 16 });
    else if (feature === 'scooter') add({ kind: 'scooter', at: from + 46, from: from + 46, to: to - 14, x: oneSide * 2, reach: 1.9 });
    else if (feature === 'river') {
      // The near bank is a ramp right across the road, and the water starts just past the top of it.
      const top = from + WILD.bank.top;
      hills.push({ at: top, up: WILD.bank.up, down: WILD.bank.down, rise: WILD.bank.rise, drop: WILD.bank.rise, round: WILD.bank.round, bank: true });
      add({ kind: 'river', at: top + WILD.bank.water[0], from: top + WILD.bank.water[0], to: top + WILD.bank.water[1] });
      airStars(top, 'bank');
    } else if (wildOne === 'crest') {
      hillAt(from + WILD.hill.top);
    } else if (wildOne === 'both') {
      balesAt(from + WILD.balesBefore, oneSide);
      hillAt(from + WILD.topAfter);
    } else if (wildOne === 'bales') {
      balesAt(from + gap * WILD.balesAt, oneSide);
    } else if (wildOne === 'wall') {
      wallAt(from, oneSide);
    } else if (rules.star && random() < 0.5) {
      for (let n = -1; n <= 1; n += 1) add({ kind: 'star', at: middle + n * STAR_GAP, x: oneSide * STAR_SIDE });
    }
    at = to;
    // A second jump in some straights, after whatever came first: a ramp where that had a hill, and a hill
    // where it hadn't. Not after a scooter, which wants the road to itself.
    if (rules.wild && (wildOne || (feature && feature !== 'scooter')) && random() < rules.doubles) {
      const hadHill = wildOne === 'crest' || wildOne === 'both' || boosted || feature === 'river';
      if (hadHill) {
        wallAt(at, -oneSide);
        at += between(WILD.wall.room);
      } else {
        hillAt(at + WILD.hill.top);
        at += between(WILD.crest.room);
      }
    }
  }
  const length = at + ROAD.end;
  // At level 10 the top of the road is under snow, and the stars up there are heaps of snow to burst through.
  const snowFrom = rules.snow ? length * SNOW_FROM : null;
  if (snowFrom !== null) {
    for (const thing of things) if (thing.kind === 'star' && thing.at >= snowFrom) thing.kind = 'snow';
  }
  things.sort((a, b) => a.at - b.at);
  // The other riders in the race: each a little better or worse than the next, in the order they line up, with
  // the best of them furthest back, just in front of the child. Each will fail to get out of the way of a few
  // of the things in the road, which is where they can be caught.
  const barriers = things.filter(({ kind }) => kind === 'barrier');
  const rivals = [];
  for (let n = 0; n < rules.rivals; n += 1) {
    const skill = RIVAL.skills[Math.round((n * (RIVAL.skills.length - 1)) / Math.max(1, rules.rivals - 1))];
    rivals.push({
      skill,
      lane: RIVAL.lanes[n % RIVAL.lanes.length],
      from: (rules.rivals - n) * RIVAL.grid,
      slips: barriers.map(() => random() < RIVAL.slips),
    });
  }
  return {
    rules,
    bends: list,
    things,
    hills,
    rivals,
    length,
    snowFrom,
    stars: things.filter(({ kind }) => kind === 'star').length,
    snows: things.filter(({ kind }) => kind === 'snow').length,
  };
}

/* ------------------------------- the ride ------------------------------- */

// How far the bike's turn can be from what a bend needs, as a share of a whole lean's turn, with the bike
// still on the road in the end: the grown-ups' setting for how much help the road gives.
export const HELP = { lots: 0.42, some: 0.3, little: 0.2 };
// How a lean turns the bike. The bike doesn't jump across the road: a lean swings its nose round, little by
// little, and the bike goes where its nose points. The more the child leans, the more it turns, by a
// logarithm: the first of a lean turns it most, and leaning further always turns it more, by less and less,
// so there's no lean at which it suddenly does a lot, and none past which it stops doing more.
export const STEER = {
  curve: 2, // How much of a logarithm it is: 0 would be a straight line.
  align: 1.6, // How quickly the bike's nose comes back in line with the road, per second.
  centre: 0.0427, // And how much the road draws the nose back towards its middle, in radians a second for each metre.
  yawMost: 0.45, // The furthest the nose can point away from the road, in radians.
};

/** How much a lean turns the bike: 1 for a whole lean, more than half for half a one, and 1.8 for three. */
export function turnOf(share) {
  return (Math.sign(share) * Math.log(1 + STEER.curve * Math.abs(share))) / Math.log(1 + STEER.curve);
}

export const BIKE = {
  speedUp: 4, // Metres a second, each second.
  brake: 7,
  verge: 0.45, // The share of its speed the bike keeps on the grass.
  flowStep: 0.04, // A bend ridden all on the road makes the bike this much faster,
  flowMost: 4, // up to this many times, until it next touches the grass.
  boost: 1.3,
  boostSeconds: 2.2,
  splash: 0.7,
  splashSeconds: 0.9,
  leanMost: 38 * RAD, // How far over the bike goes at the very most, for three whole leans. For one it's 21 degrees.
  rollFollow: 5, // How quickly the bike tips over to follow the child's lean, per second.
  starReach: 1.5,
  snowReach: 1.7,
  jumpSeconds: 1.5, // About how long a jump off a ramp lasts, for how the rider sits through it.
  jumpLeast: 6, // A bike slower than this rolls over a ramp, or the top of a hill, and doesn't fly.
  gravity: 9, // Metres a second, each second, that a bike in the air falls faster.
  kick: 0.5, // How steep a ramp is: a bike going over it goes up at this share of its speed.
  takeOff: 1.15, // The road has to fall away from under the bike this many times as fast as the bike can fall, for it to fly.
  climb: 0.25, // On a hill the bike is slower by this share of how steep the hill is,
  descend: 0.9, // and faster down one by this share.
  crash: 0.3, // The share of its speed the bike keeps after going through a row of hay bales.
  wade: 0.4, // And the share it has in a river.
};
// A trick: a lean held in the air, which is the game's own move with nothing in the way of it. In the air a
// lean doesn't steer, so it costs nothing, and a trick landed is a burst of speed: it's how a race is won.
export const TRICK = { share: 0.6, seconds: 0.5, boost: 1.6 };
/** How far over the bike tips for a lean, in radians: as its turn does, by a logarithm, up to BIKE.leanMost. */
export const rollFor = (share) => clamp(turnOf(share) / turnOf(LEAN.most), -1, 1) * BIKE.leanMost;

const WAIT = {
  into: 0.12, // Leaning this much into a bend is enough to get going again.
  after: 1.2, // Seconds on the grass in a bend without leaning into it before the bike stops to wait.
  away: 0.6, // Seconds with nobody in the picture before it does.
  said: 5, // Seconds stopped before the child is told there's no hurry.
  tow: 10, // Seconds stopped in a bend, with the child there, before the bike is helped round it.
};
const TRY = {
  angle: 1.2, // Degrees past upright, the right way, which is a child trying.
  seconds: 3, // This long trying, on the grass on the outside of a bend, and a whole lean comes down.
};
const HINT_BEFORE = 10; // Metres before the first bend that its lean is asked for: leaning sooner would take the bike off a straight road.
const COUNTS = { on: 0.35, off: 0.15, share: 0.25 }; // What counts as a lean, for the numbers at the finish.
const SHEEP = { stopAt: 4, near: 6.5, waits: 1.2, goes: 1.5, seen: 45 };
const SCOOTER = { speed: 0.35, starts: 45, follows: 5, near: 8, patience: 3, aside: 1 };
const LEASH = { ahead: 45, slack: 30, slowest: 0.5, behind: 25, tow: 1.2 }; // Riding together: see update().

export class Ride {
  /**
   * level, bends, favour and side lay the road out: see layOut. pace is the grown-ups' setting for how fast
   * the bike goes. team is true when friends ride together, as one convoy. onEvent hears what happens.
   */
  constructor({ level = 1, bends = 10, favour = 'even', side = 'left', pace = 'usual', help = 'some', random = Math.random, plain = false, wild = false, rivalry = 'medium', team = false, leaner = null, plan = null, onEvent = () => {} } = {}) {
    // A ride already laid out can be handed in, as the tests do.
    this.plan = plan ?? layOut({ level, bends, favour, side, random, plain, wild });
    this.rules = this.plan.rules;
    this.levelNumber = this.rules.level;
    this.plain = plain;
    this.team = team;
    this.leaner = leaner;
    this.onEvent = onEvent;
    this.cruise = this.rules.cruise * (PACES[pace] ?? 1);
    // How quickly the bike's nose swings round when its turn is a whole lean's away from what the bend needs,
    // in radians a second: enough to take it to the edge of the road when it's as far out as the help allows.
    this.gain = (ROAD.half / (HELP[help] ?? HELP.some)) * STEER.centre;
    this.yaw = 0; // How far the bike's nose points away from the way the road goes, in radians, the right positive.
    this.towed = null; // The bend the bike is being helped round, after a long wait.
    this.things = this.plan.things.map((thing) => ({ ...thing, done: false }));
    this.bridges = this.things.filter(({ kind }) => kind === 'bridge');
    // What the bike goes past, in the order it comes to them, and what can be in its way.
    this.passing = this.things.filter(({ kind }) => ['star', 'snow', 'puddle', 'boost', 'ramp', 'sheep', 'barrier'].includes(kind));
    this.barriers = this.things.filter(({ kind }) => kind === 'barrier');
    this.rivers = this.things.filter(({ kind }) => kind === 'river');
    // The other riders in the race, lined up in front of the child, who starts last.
    this.rivalry = RIVALRY[rivalry] ?? RIVALRY.medium;
    this.rivals = (this.plan.rivals ?? []).map((rival, id) => ({ ...rival, id, s: rival.from, x: rival.lane, v: 0, vy: 0, height: 0, air: false, roll: 0, slowLeft: 0, next: 0, done: false, time: null }));
    this.place = this.rivals.length + 1;
    this.scooters = this.things.filter(({ kind }) => kind === 'scooter');
    for (const scooter of this.scooters) scooter.pos = scooter.from;
    this.blockers = this.things.filter(({ kind }) => kind === 'sheep' || kind === 'scooter');
    this.state = 'ready';
    this.s = 0;
    this.x = 0;
    this.v = 0;
    this.roll = 0; // How far over the bike is, in radians, the right side positive.
    this.height = 0; // Off the ground, in a jump.
    this.vy = 0; // How fast the bike is going up, in metres a second: with the ground, or by itself in the air.
    this.air = null; // In the air: { t, peak, lean, side }.
    this.wet = null; // The river the bike is wading through.
    this.flow = 0;
    this.boostLeft = 0;
    this.splashLeft = 0;
    this.elapsed = 0;
    this.away = 0;
    this.waiting = null; // 'away' with nobody in the picture, 'bend' stopped on the grass until the child leans.
    this.waited = 0;
    this.idle = 0;
    this.struggle = 0;
    this.offRoad = false;
    this.onBridge = false;
    this.riding = null; // The bend the bike is in: { bend, off }.
    this.nextBend = 0;
    this.nextThing = 0;
    this.leaning = null;
    this.leanFor = 0;
    this.stats = {
      seconds: 0,
      bends: this.plan.bends.length,
      clean: 0,
      stars: 0,
      snow: 0,
      splashes: 0,
      boosts: 0,
      jumps: 0,
      air: 0, // Seconds in the air, in all,
      bestAir: 0, // and in the longest jump.
      tricks: 0,
      crashes: 0, // Rows of bales gone through,
      cleared: 0, // and flown over.
      rivers: 0, // Rivers jumped,
      wades: 0, // and waded.
      riders: this.rivals.length + 1,
      place: null, // Where the child came in the race, once it's over.
      passed: 0,
      stops: 0,
      medal: false,
      cup: false,
      leans: { left: 0, right: 0 },
      leanSeconds: { left: 0, right: 0 },
      longest: 0,
      eased: { left: 0, right: 0 },
      tows: 0,
      vergeSeconds: 0,
      waitSeconds: 0,
    };
  }

  begin() {
    if (this.state !== 'ready') return;
    this.state = 'riding';
    this.onEvent({ type: 'go' });
  }

  /** The bend at a place, or null on a straight. */
  bendAt(s) {
    for (const bend of this.plan.bends) if (s > bend.from && s < bend.to) return bend;
    return null;
  }

  /** How much lean the road needs at a place, and which way: the right positive. */
  needAt(s) {
    const bend = this.bendAt(s);
    return bend ? bend.turn * bend.need * bendShare(bend, s) : 0;
  }

  /** How far the road has narrowed for a bridge at a place: 0 on the open road, 1 on the bridge. */
  narrowAt(s) {
    let most = 0;
    for (const { from, to } of this.bridges) {
      const into = Math.min(s - (from - ROAD.taper), to + ROAD.taper - s) / ROAD.taper;
      if (into > 0) most = Math.max(most, smooth(into));
    }
    return most;
  }

  /** From the middle of the road to the edge of the tarmac at a place, which is less on a bridge. */
  halfAt(s) {
    return ROAD.half + (ROAD.bridgeHalf - ROAD.half) * this.narrowAt(s);
  }

  /** The furthest the bike can be from the middle at a place: the far edge of the grass, or a bridge's railing. */
  edgeAt(s) {
    return this.halfAt(s) + ROAD.verge + (ROAD.rail - ROAD.verge) * this.narrowAt(s);
  }

  /** The bend the bike is in or coming to, for the arrow on the screen: null with none near. */
  get ahead() {
    const bend = this.riding?.bend ?? this.plan.bends[this.nextBend] ?? null;
    if (!bend) return null;
    return { index: bend.index, turn: bend.turn, need: bend.need, big: bend.big, in: Math.max(0, bend.from - this.s), through: clamp((this.s - bend.from) / (bend.to - bend.from), 0, 1) };
  }

  /** What to ask of the child, if anything: 'left' or 'right' for a lean, 'both' for nothing to do but wait. */
  get hint() {
    if (this.state !== 'riding' || this.waiting === 'away') return null;
    const bend = this.riding?.bend;
    const side = (turn) => (turn < 0 ? 'left' : 'right');
    if (this.waiting === 'bend' && bend) return side(bend.turn);
    // On the grass on the outside of a bend: lean into it.
    if (bend && this.offRoad && this.x * bend.turn < 0) return side(bend.turn);
    // Until the first lean of the ride, the first bend says which way.
    const first = this.plan.bends[0];
    if (this.stats.leans.left + this.stats.leans.right === 0 && this.s < first.to && first.from - this.s < HINT_BEFORE) return side(first.turn);
    return null;
  }

  get resting() {
    return this.waiting !== null;
  }

  /**
   * One frame. lean is the child's lean: { share, raw, seen }, as a Leaner has it. mates are the friends in a
   * ride together, each { s }, how far along the road they are.
   */
  update(dt, lean, mates = []) {
    if (this.state !== 'riding') return;
    const { stats } = this;
    this.elapsed += dt;
    const seen = Boolean(lean?.seen);
    const share = seen ? clamp(lean.share ?? 0, -LEAN.most, LEAN.most) : 0;
    this.away = seen ? 0 : this.away + dt;

    const bend = this.bendAt(this.s);
    const turn = bend?.turn ?? 0;
    // A bike being helped round a bend rides it as if it were straight.
    const need = this.towed ? 0 : this.needAt(this.s);
    const flying = this.air !== null;

    this.countLean(share, dt);
    this.decideWaiting(share, turn, dt);
    this.readTrying(lean, bend, dt);

    // How fast it wants to go: slower on the grass, in a puddle and behind something, faster with an arrow
    // and for bends ridden well.
    let wanted = this.cruise * (1 + BIKE.flowStep * this.flow);
    if (this.boostLeft > 0) wanted *= BIKE.boost;
    if (this.splashLeft > 0) wanted *= BIKE.splash;
    if (this.offRoad || this.towed) wanted *= BIKE.verge;
    // Slower up a hill and faster down one, and slow through a river.
    const hill = hillsAt(this.plan, this.s);
    wanted *= hill > 0 ? 1 - BIKE.climb * hill : 1 + BIKE.descend * -hill;
    if (this.wet) wanted *= BIKE.wade;
    wanted *= this.convoy(mates);
    if (this.waiting) wanted = 0;
    wanted = Math.min(wanted, this.blockedTo(dt));
    if (!flying) {
      const rate = wanted > this.v ? BIKE.speedUp : BIKE.brake;
      this.v += clamp(wanted - this.v, -rate * dt, rate * dt);
    }
    this.boostLeft = Math.max(0, this.boostLeft - dt);
    this.splashLeft = Math.max(0, this.splashLeft - dt);

    // Turning: the lean swings the bike's nose the way it leans, a bend swings it to the bend's outside by as
    // much as the lean it needs would swing it back, and the road draws it into line and towards the middle.
    // The bike then goes across the road as far as its nose points. One that's hardly moving hardly turns.
    const moving = clamp(this.v / 3, 0, 1);
    const steer = this.towed ? 0 : turnOf(share);
    if (!flying) {
      this.yaw += (this.gain * (steer - turnOf(need)) - STEER.centre * this.x) * moving * dt;
      this.yaw *= Math.exp(-STEER.align * dt);
      this.yaw = clamp(this.yaw, -STEER.yawMost, STEER.yawMost);
      this.x += this.v * Math.sin(this.yaw) * dt;
    }
    const edge = this.edgeAt(this.s);
    if (Math.abs(this.x) >= edge) {
      this.x = clamp(this.x, -edge, edge);
      // At the far edge of the grass, or a bridge's railing, the nose can't point any further out.
      if (this.yaw * this.x > 0) this.yaw = 0;
    }
    this.roll += (rollFor(share) - this.roll) * (1 - Math.exp(-BIKE.rollFollow * dt));

    const before = this.s;
    this.s = Math.min(this.plan.length, this.s + this.v * dt);
    this.rise(dt, share);

    // On or off the tarmac.
    const off = !flying && Math.abs(this.x) > this.halfAt(this.s) + 1e-6;
    if (off !== this.offRoad) {
      this.offRoad = off;
      if (off) {
        this.flow = 0;
        if (this.riding) this.riding.off = true;
      }
      this.onEvent({ type: off ? 'verge' : 'road', side: this.x < 0 ? 'left' : 'right' });
    }
    if (off) stats.vergeSeconds += dt;
    if (this.waiting) stats.waitSeconds += dt;

    this.passBends(before);
    this.passThings();
    this.moveScooters(dt);
    this.crossBridges();
    this.crossRivers();
    this.race(dt);

    if (this.s >= this.plan.length) this.finish();
  }

  /** Leans, counted and timed, for the numbers at the finish. */
  countLean(share, dt) {
    const { stats } = this;
    const size = Math.abs(share);
    const side = share < 0 ? 'left' : 'right';
    if (size >= COUNTS.share) stats.leanSeconds[side] += dt;
    if (this.leaning && (size < COUNTS.off || side !== this.leaning)) {
      this.leaning = null;
      this.leanFor = 0;
    }
    if (!this.leaning && size >= COUNTS.on) {
      this.leaning = side;
      this.leanFor = 0;
      stats.leans[side] += 1;
      this.onEvent({ type: 'lean', side });
    }
    if (this.leaning) {
      this.leanFor += dt;
      if (this.leanFor > stats.longest) stats.longest = this.leanFor;
    }
  }

  /**
   * Resting is never punished, and nothing is ever lost: with nobody in the picture the bike stops and waits,
   * and a bike left on the grass in a bend stops there until the child leans into the bend, even a little.
   */
  decideWaiting(share, turn, dt) {
    let waiting = null;
    if (this.away >= WAIT.away) waiting = 'away';
    else if (this.towed) this.idle = 0;
    else if (turn && this.offRoad) {
      // On the grass in a bend with no lean into it: that's the outside, where the bend carries a bike that
      // isn't leaning. A bike on the inside got there by leaning into the bend, and leaning is what keeps it going.
      const into = share * turn;
      this.idle = into >= WAIT.into ? 0 : this.idle + dt;
      if (this.idle >= WAIT.after) waiting = 'bend';
    } else {
      this.idle = 0;
    }
    if (waiting !== this.waiting) {
      this.waiting = waiting;
      this.waited = 0;
      this.onEvent({ type: waiting ? 'waiting' : 'going', why: waiting });
    }
    if (!waiting) return;
    const before = this.waited;
    this.waited += dt;
    if (before < WAIT.said && this.waited >= WAIT.said) this.onEvent({ type: 'resting' });
    // Nobody is left stuck: after a long wait in a bend, with the child there, the bike is helped round it.
    if (waiting === 'bend' && this.waited >= WAIT.tow && this.riding) {
      this.towed = this.riding.bend;
      this.waiting = null;
      this.idle = 0;
      this.stats.tows += 1;
      this.onEvent({ type: 'tow', bend: this.towed });
    }
  }

  /**
   * A child who's leaning the right way, on the outside of a bend all the same, is trying and not getting
   * there. After a few seconds of that, a whole lean to that side comes down to meet them.
   */
  readTrying(lean, bend, dt) {
    if (!bend || !this.leaner || !lean?.seen || !this.offRoad || this.x * bend.turn >= 0) {
      this.struggle = Math.max(0, this.struggle - dt);
      return;
    }
    const towards = (lean.raw ?? 0) * bend.turn;
    if (towards < TRY.angle * RAD) return;
    this.struggle += dt;
    if (this.struggle < TRY.seconds) return;
    this.struggle = 0;
    const side = bend.turn < 0 ? 'left' : 'right';
    if (this.leaner.ease(side)) {
      this.stats.eased[side] += 1;
      this.onEvent({ type: 'eased', side });
    }
  }

  /**
   * Riding together, friends stay in one convoy: whoever is a long way in front of the last of them eases off,
   * down to half speed, and whoever is a long way behind the first gets a tow. Nobody is ever stopped by it.
   */
  convoy(mates) {
    if (!this.team) return 1;
    const others = mates.filter((mate) => mate && Number.isFinite(mate.s));
    if (!others.length) return 1;
    const last = Math.min(...others.map(({ s }) => s));
    const first = Math.max(...others.map(({ s }) => s));
    const ahead = this.s - last;
    if (ahead > LEASH.ahead) return 1 - (1 - LEASH.slowest) * clamp((ahead - LEASH.ahead) / LEASH.slack, 0, 1);
    if (first - this.s > LEASH.behind) return LEASH.tow;
    return 1;
  }

  /**
   * The fastest the bike may go for what's in front of it: a sheep in its way, which it stops for, or a
   * scooter, which it follows. Neither can be hit. A sheep that's been waited for walks off, and a scooter
   * that's been followed for a while pulls over.
   */
  blockedTo(dt) {
    let most = Infinity;
    for (const thing of this.blockers) {
      if (thing.done) continue;
      const gap = (thing.kind === 'scooter' ? thing.pos : thing.at) - this.s;
      if (gap <= 0 || gap > SHEEP.seen) continue;
      const inWay = Math.abs(this.x - thing.x) < thing.reach && !thing.aside;
      if (thing.kind === 'sheep') {
        if (thing.going !== undefined) {
          // Walking off: the bike stays where it is until the road is clear.
          thing.going += dt;
          if (thing.going >= SHEEP.goes) thing.aside = true;
          if (!thing.aside) most = 0;
          continue;
        }
        if (!inWay) continue;
        most = Math.min(most, Math.sqrt(2 * BIKE.brake * Math.max(0, gap - SHEEP.stopAt)));
        if (gap < SHEEP.near && this.v < 0.8) {
          thing.waited = (thing.waited ?? 0) + dt;
          if (thing.waited >= SHEEP.waits) {
            thing.going = 0;
            thing.stopped = true;
            this.stats.stops += 1;
            this.onEvent({ type: 'sheep-goes', thing });
          }
        }
      } else if (thing.moving && inWay) {
        const own = this.cruise * SCOOTER.speed;
        most = Math.min(most, own + Math.sqrt(2 * BIKE.brake * Math.max(0, gap - SCOOTER.follows)));
        if (gap < SCOOTER.near) {
          thing.behind = (thing.behind ?? 0) + dt;
          if (thing.behind >= SCOOTER.patience) {
            thing.aside = true;
            thing.stopped = true;
            this.stats.stops += 1;
            this.onEvent({ type: 'scooter-aside', thing });
          }
        }
      }
    }
    return most;
  }

  /** A friend's scooter sets off when the bike comes near, and trundles along its side of the road. */
  moveScooters(dt) {
    for (const thing of this.scooters) {
      // Pulled over, it drifts to the edge of the grass and waits there, even once the bike has gone by.
      if (thing.aside) thing.over = Math.min(1, (thing.over ?? 0) + dt / SCOOTER.aside);
      if (thing.done) continue;
      if (!thing.moving && thing.from - this.s <= SCOOTER.starts) {
        thing.moving = true;
        this.onEvent({ type: 'scooter', thing });
      }
      if (!thing.moving) continue;
      if (thing.pos < thing.to) thing.pos = Math.min(thing.to, thing.pos + this.cruise * SCOOTER.speed * dt);
      else thing.aside = true;
      if (this.s > thing.pos + 2) {
        thing.done = true;
        if (!thing.stopped) {
          this.stats.passed += 1;
          this.onEvent({ type: 'pass', kind: 'scooter', thing });
        }
      }
    }
  }

  /**
   * Up and down. On the ground the bike goes up and down with the road. Over the top of a steep hill, or the
   * end of a ramp, the road drops away from under a bike that's going well faster than the bike can fall, and
   * then it flies, until it comes down to the road again. The faster it was going, the further it flies.
   */
  rise(dt, share) {
    const ground = this.v * slopeAt(this.plan, this.s);
    const { air, stats } = this;
    if (!air) {
      // How fast the road's climb is falling off under the bike, in metres a second, each second.
      const dropping = (this.vy - ground) / Math.max(dt, 1e-6);
      if (this.v >= BIKE.jumpLeast && dropping > BIKE.gravity * BIKE.takeOff) {
        const falling = this.vy - BIKE.gravity * dt;
        this.takeOff(falling, { crest: true });
        this.height = Math.max(0, (falling - ground) * dt);
      } else {
        this.vy = ground;
      }
      return;
    }
    air.t += dt;
    this.vy -= BIKE.gravity * dt;
    this.height += (this.vy - ground) * dt;
    if (this.height > air.peak) air.peak = this.height;
    // A lean held in the air is a trick: one to a jump.
    if (Math.abs(share) >= TRICK.share) {
      air.lean += dt;
      air.side = share < 0 ? 'left' : 'right';
    }
    if (this.height > 0) return;
    this.air = null;
    this.height = 0;
    this.vy = ground;
    stats.jumps += 1;
    stats.air += air.t;
    if (air.t > stats.bestAir) stats.bestAir = air.t;
    const trick = air.lean >= TRICK.seconds;
    if (trick) {
      stats.tricks += 1;
      this.boostLeft = Math.max(this.boostLeft, TRICK.boost);
    }
    this.onEvent({ type: 'land', seconds: air.t, peak: air.peak, trick, side: trick ? air.side : null });
  }

  /** Off the ground, going up this fast. */
  takeOff(up, more = {}) {
    this.vy = up;
    this.air = { t: 0, peak: 0, lean: 0, side: null };
    this.onEvent({ type: 'jump', ...more });
  }

  passBends(before) {
    const { stats } = this;
    const next = this.plan.bends[this.nextBend];
    if (next && before <= next.from && this.s > next.from) {
      this.riding = { bend: next, off: this.offRoad };
      this.nextBend += 1;
      this.onEvent({ type: 'bend', bend: next });
    }
    const { riding } = this;
    if (riding && this.s >= riding.bend.to) {
      this.riding = null;
      this.struggle = 0;
      this.towed = null;
      if (riding.off) {
        this.onEvent({ type: 'rough', bend: riding.bend });
        return;
      }
      stats.clean += 1;
      this.flow = Math.min(BIKE.flowMost, this.flow + 1);
      if (riding.bend.big) stats.medal = true;
      this.onEvent({ type: 'clean', bend: riding.bend, flow: this.flow });
    }
  }

  /** Whatever the bike has just gone past, and whether it was near enough across the road to matter. */
  passThings() {
    const { stats, passing } = this;
    while (this.nextThing < passing.length && passing[this.nextThing].at <= this.s) {
      const thing = passing[this.nextThing];
      this.nextThing += 1;
      thing.done = true;
      const near = Math.abs(this.x - thing.x);
      const grounded = this.air === null;
      if (thing.kind === 'star' && near <= BIKE.starReach && (!thing.air || !grounded)) {
        // A star in the air is for a bike that's flying.
        thing.taken = true;
        stats.stars += 1;
        this.onEvent({ type: 'star', thing });
      } else if (thing.kind === 'snow' && near <= BIKE.snowReach) {
        thing.taken = true;
        stats.snow += 1;
        this.onEvent({ type: 'snow', thing });
      } else if (thing.kind === 'puddle' && grounded && near <= thing.reach) {
        thing.taken = true;
        stats.splashes += 1;
        this.splashLeft = BIKE.splashSeconds;
        this.onEvent({ type: 'splash', thing });
      } else if (thing.kind === 'boost' && grounded && near <= thing.reach) {
        thing.taken = true;
        stats.boosts += 1;
        this.boostLeft = BIKE.boostSeconds;
        this.onEvent({ type: 'boost', thing });
      } else if (thing.kind === 'ramp' && grounded && near <= thing.reach && this.v >= BIKE.jumpLeast) {
        thing.taken = true;
        this.takeOff(Math.max(this.vy, this.v * BIKE.kick), { thing });
      } else if (thing.kind === 'barrier' && !thing.gone && near <= thing.reach) {
        // Hay bales: flown over, or gone through, which bursts them and costs most of the bike's speed.
        if (grounded) {
          thing.gone = true;
          thing.taken = true;
          this.v *= BIKE.crash;
          this.flow = 0;
          stats.crashes += 1;
          this.onEvent({ type: 'crash', thing });
        } else {
          stats.cleared += 1;
          this.onEvent({ type: 'clear', thing });
        }
      } else if (thing.kind === 'sheep' && !thing.stopped) {
        stats.passed += 1;
        this.onEvent({ type: 'pass', kind: 'sheep', thing });
      }
    }
  }

  crossBridges() {
    const on = this.bridges.some(({ from, to }) => this.s >= from && this.s <= to);
    if (on === this.onBridge) return;
    this.onBridge = on;
    this.onEvent({ type: on ? 'bridge' : 'bridge-end' });
  }

  /**
   * A river: a bike in the air goes over it, and one that comes down in it, or rolls into it, wades through
   * slowly. One that never touched the water has jumped it.
   */
  crossRivers() {
    const grounded = this.air === null;
    for (const river of this.rivers) {
      if (river.done) continue;
      if (this.s > river.to) {
        river.done = true;
        if (this.wet === river) this.wet = null;
        if (!river.waded) {
          this.stats.rivers += 1;
          this.onEvent({ type: 'river', thing: river });
        }
      } else if (grounded && this.s >= river.from && !river.waded) {
        river.waded = true;
        this.wet = river;
        this.flow = 0;
        this.stats.wades += 1;
        this.onEvent({ type: 'wade', thing: river });
      }
    }
  }

  /**
   * The other riders. Each keeps to their own line and their own speed, goes round what's in the way, unless
   * it's one they were always going to hit, and flies off the hills as the child's bike does. The race is kept
   * close: a rider a long way in front eases off, and one a long way behind tries harder. With nobody in the
   * picture, they wait too.
   */
  race(dt) {
    const { rivals, plan } = this;
    if (!rivals.length) return;
    if (this.waiting !== 'away') {
      for (const rival of rivals) {
        if (rival.done) continue;
        const hill = hillsAt(plan, rival.s);
        const band = 1 + clamp((this.s - rival.s) / RIVAL.far, -1, 1) * RIVAL.band;
        let wanted = this.cruise * rival.skill * this.rivalry * band * (hill > 0 ? 1 - BIKE.climb * hill : 1 + BIKE.descend * -hill);
        if (rival.slowLeft > 0) wanted *= BIKE.crash;
        if (this.rivers.some(({ from, to }) => !rival.air && rival.s >= from && rival.s <= to)) wanted *= BIKE.wade;
        rival.slowLeft = Math.max(0, rival.slowLeft - dt);
        if (!rival.air) rival.v += clamp(wanted - rival.v, -BIKE.brake * dt, BIKE.speedUp * dt);

        // What's next in the way, and which side of it to go.
        while (rival.next < this.barriers.length && this.barriers[rival.next].at < rival.s) rival.next += 1;
        const barrier = this.barriers[rival.next];
        let line = rival.lane;
        if (barrier && !barrier.gone && barrier.at - rival.s <= RIVAL.sees && !rival.slips[rival.next]) {
          if (barrier.wall) {
            // Bales right across: the ramp before them is the only way over.
            const ramp = this.things.find((thing) => thing.kind === 'ramp' && thing.at < barrier.at && barrier.at - thing.at < 30);
            if (ramp && rival.s < ramp.at) line = ramp.x;
          } else if (Math.abs(rival.lane - barrier.x) < barrier.reach + RIVAL.room) {
            const side = barrier.x > 0.1 ? -1 : barrier.x < -0.1 ? 1 : rival.lane < 0 ? -1 : 1;
            line = clamp(barrier.x + side * (barrier.reach + RIVAL.room), -(ROAD.half - 0.5), ROAD.half - 0.5);
          }
        }
        const across = clamp(line - rival.x, -RIVAL.across * dt, RIVAL.across * dt);
        if (!rival.air) rival.x += across;
        // Leaning into the bends, and into their own way across the road.
        const lean = this.needAt(rival.s) * 0.9 + clamp(across / Math.max(dt, 1e-6) / RIVAL.across, -1, 1) * 0.35;
        rival.roll += (rollFor(lean) - rival.roll) * (1 - Math.exp(-BIKE.rollFollow * dt));

        const from = rival.s;
        rival.s = Math.min(plan.length, rival.s + rival.v * dt);
        // Up and down, as the child's bike: see rise().
        const ground = rival.v * slopeAt(plan, rival.s);
        if (rival.air) {
          rival.vy -= BIKE.gravity * dt;
          rival.height += (rival.vy - ground) * dt;
          if (rival.height <= 0) {
            rival.air = false;
            rival.height = 0;
            rival.vy = ground;
          }
        } else if (rival.v >= BIKE.jumpLeast && (rival.vy - ground) / Math.max(dt, 1e-6) > BIKE.gravity * BIKE.takeOff) {
          rival.air = true;
          rival.vy -= BIKE.gravity * dt;
          rival.height = Math.max(0, (rival.vy - ground) * dt);
        } else {
          rival.vy = ground;
        }
        // Ramps and bales they come to.
        for (const thing of this.passing) {
          if (thing.at <= from || thing.at > rival.s) continue;
          const near = Math.abs(rival.x - thing.x);
          if (thing.kind === 'ramp' && !rival.air && near <= thing.reach && rival.v >= BIKE.jumpLeast) {
            rival.air = true;
            rival.vy = Math.max(rival.vy, rival.v * BIKE.kick);
          } else if (thing.kind === 'barrier' && !thing.gone && !rival.air && near <= thing.reach) {
            thing.gone = true;
            rival.v *= BIKE.crash;
            rival.slowLeft = RIVAL.slowed;
            this.onEvent({ type: 'rival-crash', thing, rival: rival.id });
          }
        }
        if (rival.s >= plan.length) {
          rival.done = true;
          rival.time = this.elapsed;
          this.onEvent({ type: 'rival-home', rival: rival.id });
        }
      }
    }
    const place = 1 + rivals.filter((rival) => rival.done || rival.s > this.s).length;
    if (place !== this.place) {
      const before = this.place;
      this.place = place;
      this.onEvent({ type: 'place', place, before });
    }
  }

  finish() {
    if (this.state !== 'riding') return;
    this.state = 'finished';
    this.stats.seconds = this.elapsed;
    this.stats.place = this.rivals.length ? 1 + this.rivals.filter((rival) => rival.done).length : null;
    this.air = null;
    this.height = 0;
    if (this.rules.cup) {
      this.stats.cup = true;
      this.onEvent({ type: 'cup' });
    }
    this.onEvent({ type: 'finished' });
  }
}
