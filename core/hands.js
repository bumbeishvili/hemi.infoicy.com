// Decides whether the hand being played with counts as open.
//
// No DOM and no camera in this file, so everything here runs against recorded hand
// data in test/unit/hands.test.js. The rule throughout is "fail closed": a hand that is
// missing, cut off by the frame, too far away or overlapping the other hand does not
// count as open, however open it looks. A grown-up can choose other hand shapes for a
// game's moves, like pointing: see core/shapes.js.
import { followHands, MOST_PLAYERS } from './hand-group.js';
import { DEFAULT_SHAPES, FINGERS_PROMPT, SHAPES, SHAPE_LOST, SHAPE_MADE, isShaped, shapeScore } from './shapes.js';

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const ramp = (value, low, high) => clamp01((value - low) / (high - low));
const smoothing = (dtMs, timeConstantMs) => 1 - Math.exp(-dtMs / timeConstantMs);
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
const minus = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

function degreesBetween(a, b) {
  const lengths = Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z);
  if (lengths === 0) return 0;
  const cosine = (a.x * b.x + a.y * b.y + a.z * b.z) / lengths;
  return (Math.acos(Math.min(1, Math.max(-1, cosine))) * 180) / Math.PI;
}

// MediaPipe hand landmark indices: [knuckle, middle joint, end joint, fingertip].
const FINGER_JOINTS = {
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
};
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_KNUCKLE = 5;
const MIDDLE_KNUCKLE = 9;
const PINKY_KNUCKLE = 17;

// Measured from real model output on photos of open hands, fists and partial poses.
// Straight fingers bend 26-103 degrees and reach 1.4-1.9 times the knuckle distance.
// Curled fingers bend 161-270 degrees and reach 0.7-1.05 times.
const BEND_STRAIGHT = 85;
const BEND_CURLED = 200;
const REACH_CURLED = 1.0;
const REACH_STRAIGHT = 1.6;
// Thumb tip to palm centre, in palm widths. A thumb across the palm or inside a fist
// measures 0.57-0.87; a relaxed thumb 1.0-1.3; a thumb held out 1.8 or more.
const THUMB_TUCKED = 0.9;
const THUMB_OUT = 1.7;

export const FINGER_NAMES = ['thumb', 'index', 'middle', 'ring', 'pinky'];

export const OPEN_RULES = {
  // The lowest target any hand can have, whatever the settings say. On real photos a
  // fist scores 0, pointing 0.08, a peace sign 0.17 and a thumbs up 0.23, while a relaxed
  // open hand scores 0.55-0.70, so this keeps all of the first group from ever passing.
  floor: 0.35,
  // Above this a wide-open hand could not stay reliably over the line.
  ceiling: 0.9,
  // A hand must reach this share of its own best opening from the hand check.
  defaultStrictness: 0.8,
  // Used until the first hand check has run.
  defaultBest: 0.95,
};

const HYSTERESIS = 0.06; // Once open, a hand has to drop this far below target to close.
const SMOOTH_MS = 90;
const OPEN_HOLD_MS = 120;
const CLOSE_HOLD_MS = 80;
// A hand going from one shape to another can pass through others on the way, as from open to pointing through
// three fingers and two, so a shape has to be held a little longer to count.
const SHAPE_HOLD_MS = 200;
const LOST_GRACE_MS = 250; // Rides out single dropped detections.

const DUPLICATE_GAP = 0.6; // Palm lengths. Closer than this is one hand detected twice.
const OVERLAP_GAP = 1.3; // Closer than this, one hand may be holding the other open.
const MIN_PALM_SIZE = 0.05; // Share of frame height. Smaller is too far away to trust.
const FRAME_MARGIN = 0.005;
const FRAME_CHECK_POINTS = [4, 8, 12, 16, 20, 5, 9, 13, 17];

const STEER_SMOOTH_MS = 110;
const STEER_RELEASE_MS = 250;
// Moving the hand side to side steers. In frame heights: at a typical distance, full lock
// is about 10 cm of movement.
const REACH_DEAD_ZONE = 0.02;
const REACH_FULL_LOCK = 0.2;

// How sure the tracker must be which hand it sees when a hand is alone in the picture.
const MIN_LABEL_SCORE = 0.7;

const DRIVE_BASE = 0.8; // Speed at the target. Opening wider adds the rest.

function fingerExtension(world, [knuckle, middle, end, tip]) {
  const wrist = world[WRIST];
  const bend =
    degreesBetween(minus(world[knuckle], wrist), minus(world[middle], world[knuckle])) +
    degreesBetween(minus(world[middle], world[knuckle]), minus(world[end], world[middle])) +
    degreesBetween(minus(world[end], world[middle]), minus(world[tip], world[end]));
  const reach = gap(world[tip], wrist) / gap(world[knuckle], wrist);
  // Both signs have to agree: either one alone can be fooled by a finger pointing
  // towards the camera.
  return Math.min(1 - ramp(bend, BEND_STRAIGHT, BEND_CURLED), ramp(reach, REACH_CURLED, REACH_STRAIGHT));
}

/**
 * Scores one hand from its 3D world landmarks.
 * Returns each finger from 0 (curled) to 1 (straight), and an overall openness.
 */
export function measureHand(world) {
  const fingers = {};
  for (const [name, joints] of Object.entries(FINGER_JOINTS)) {
    fingers[name] = fingerExtension(world, joints);
  }

  const palmWidth = gap(world[INDEX_KNUCKLE], world[PINKY_KNUCKLE]);
  const palmCentre = {
    x: (world[WRIST].x + world[INDEX_KNUCKLE].x + world[PINKY_KNUCKLE].x) / 3,
    y: (world[WRIST].y + world[INDEX_KNUCKLE].y + world[PINKY_KNUCKLE].y) / 3,
    z: (world[WRIST].z + world[INDEX_KNUCKLE].z + world[PINKY_KNUCKLE].z) / 3,
  };
  fingers.thumb = ramp(gap(world[THUMB_TIP], palmCentre) / palmWidth, THUMB_TUCKED, THUMB_OUT);

  // The weakest finger counts as much as the average, so one curled finger pulls the
  // score down clearly. The thumb gets a full third because a thumb tucked into the
  // palm is a hand that has not opened, even with four straight fingers.
  const four = [fingers.index, fingers.middle, fingers.ring, fingers.pinky];
  const average = four.reduce((sum, value) => sum + value, 0) / four.length;
  const weakest = Math.min(...four);
  const openness = (2 / 3) * (0.5 * average + 0.5 * weakest) + (1 / 3) * fingers.thumb;

  return { fingers, openness };
}

export function targetFor(best, strictness) {
  return Math.max(OPEN_RULES.floor, Math.min(OPEN_RULES.ceiling, best * strictness));
}

/**
 * Turns raw tracker output into a hand in screen terms. The picture on screen is a
 * mirror, so x is flipped here and the child's left hand is on the left of the screen.
 * centre and size are in units of frame height, so distances are true on any camera.
 */
function readCandidate(raw, aspect) {
  const image = raw.image.map(({ x, y, z }) => ({ x: 1 - x, y, z }));
  const palmPoints = [0, 5, 9, 13, 17];
  const centre = { x: 0, y: 0 };
  for (const index of palmPoints) {
    centre.x += (image[index].x * aspect) / palmPoints.length;
    centre.y += image[index].y / palmPoints.length;
  }
  const size = Math.hypot(
    (image[WRIST].x - image[MIDDLE_KNUCKLE].x) * aspect,
    image[WRIST].y - image[MIDDLE_KNUCKLE].y,
  );
  const inFrame = FRAME_CHECK_POINTS.every(
    (index) =>
      image[index].x >= FRAME_MARGIN &&
      image[index].x <= 1 - FRAME_MARGIN &&
      image[index].y >= FRAME_MARGIN &&
      image[index].y <= 1 - FRAME_MARGIN,
  );
  return {
    image,
    centre,
    size,
    inFrame,
    tooSmall: size < MIN_PALM_SIZE,
    score: raw.score,
    // The tracker's 3D points, in metres round the middle of the hand, unmirrored: for how it's turned (core/turn.js).
    world: raw.world,
    // On a webcam's unmirrored picture the tracker's label names the real hand. Checked
    // on a photo with known anatomy, despite what its documentation suggests.
    side: raw.label ? raw.label.toLowerCase() : null,
    ...measureHand(raw.world),
  };
}

function dropDuplicate(candidates) {
  if (candidates.length < 2) return candidates;
  const [a, b] = candidates;
  if (gap(a.centre, b.centre) < DUPLICATE_GAP * Math.max(a.size, b.size)) {
    return [a.score >= b.score ? a : b];
  }
  return candidates;
}

/** The same for any number of hands, with several playing: each is kept unless a surer one is in the same place. */
function dropDuplicates(candidates) {
  const kept = [];
  for (const hand of [...candidates].sort((a, b) => b.score - a.score)) {
    if (kept.every((other) => gap(hand.centre, other.centre) >= DUPLICATE_GAP * Math.max(hand.size, other.size))) kept.push(hand);
  }
  return kept;
}

class HandSide {
  constructor(side, strictness) {
    this.side = side;
    this.strictness = strictness;
    this.best = OPEN_RULES.defaultBest;
    this.checked = false;
    this.status = 'missing';
    this.reason = 'missing';
    this.openness = 0;
    this.fingers = Object.fromEntries(FINGER_NAMES.map((name) => [name, 0]));
    this.image = null;
    this.world = null;
    this.centre = null;
    this.lastSeen = null;
    this.lastUpdate = null;
    this.pendingSince = null;
    // The shapes for the moves (see core/shapes.js), and how sure it is the hand is making the open move's shape.
    this.shapes = DEFAULT_SHAPES;
    this.shapeLevel = 0;
  }

  get target() {
    return targetFor(this.best, this.strictness);
  }

  /** The shapes for the open and closed moves, from shapesFor in core/shapes.js. The hand has to make the open move again. */
  setShapes(shapes) {
    this.shapes = shapes;
    this.pendingSince = null;
    if (this.status !== 'missing') {
      this.status = 'closed';
      this.reason = 'closed';
    }
  }

  forget() {
    this.status = 'missing';
    this.reason = 'missing';
    this.openness = 0;
    for (const name of FINGER_NAMES) this.fingers[name] = 0;
    this.image = null;
    this.world = null;
    this.centre = null;
    this.lastSeen = null;
    this.lastUpdate = null;
    this.pendingSince = null;
  }

  update(reading, now, blocked) {
    const dt = this.lastUpdate === null ? 0 : now - this.lastUpdate;
    this.lastUpdate = now;
    const blend = smoothing(dt, SMOOTH_MS);

    // Unusable numbers count as no hand. A NaN would never cross a threshold, so it could
    // otherwise leave a hand stuck on open.
    const candidate = Number.isFinite(reading?.openness) ? reading : null;
    if (!candidate) {
      this.image = null;
      this.world = null;
      if (this.lastSeen === null || now - this.lastSeen > LOST_GRACE_MS) {
        this.status = 'missing';
        this.reason = 'missing';
        this.pendingSince = null;
        this.openness -= this.openness * blend;
        for (const name of FINGER_NAMES) this.fingers[name] -= this.fingers[name] * blend;
      }
      return;
    }

    this.lastSeen = now;
    this.image = candidate.image;
    this.world = candidate.world ?? null;
    this.centre = candidate.centre;
    this.openness += (candidate.openness - this.openness) * blend;
    for (const name of FINGER_NAMES) {
      this.fingers[name] += (candidate.fingers[name] - this.fingers[name]) * blend;
    }
    if (isShaped(this.shapes)) this.shapeLevel = shapeScore(this.fingers, this.shapes.open);

    // Problems with the view close the hand at once, without waiting out a hold time.
    const problem = blocked
      ? 'overlap'
      : !candidate.inFrame
        ? 'edge'
        : candidate.tooSmall
          ? 'small'
          : null;
    if (problem) {
      this.status = 'closed';
      this.reason = problem;
      this.pendingSince = null;
      return;
    }

    // A hand in view is never "missing". It starts as not open until it has proved it is.
    if (this.status === 'missing') this.status = 'closed';

    // With a shape chosen for the open move, it's that shape rather than how open the hand is, and it has to be
    // held a little longer, as a hand on its way to one shape can pass through others. Any other hand is closed.
    let wanted = this.status;
    if (isShaped(this.shapes)) {
      if (this.shapeLevel >= SHAPE_MADE) wanted = 'open';
      else if (this.shapeLevel < SHAPE_LOST) wanted = 'closed';
    } else if (this.openness >= this.target) wanted = 'open';
    else if (this.openness < this.target - HYSTERESIS) wanted = 'closed';

    if (wanted === this.status) {
      this.pendingSince = null;
    } else {
      if (this.pendingSince === null) this.pendingSince = now;
      const hold = wanted === 'open' ? (isShaped(this.shapes) ? SHAPE_HOLD_MS : OPEN_HOLD_MS) : CLOSE_HOLD_MS;
      if (now - this.pendingSince >= hold) {
        this.status = wanted;
        this.pendingSince = null;
      }
    }
    this.reason = this.status === 'open' ? null : 'closed';
  }

  view() {
    const shape = this.shapes.open;
    return {
      side: this.side,
      status: this.status,
      reason: this.reason,
      openness: this.openness,
      fingers: { ...this.fingers },
      target: this.target,
      best: this.best,
      checked: this.checked,
      strictness: this.strictness,
      image: this.image,
      world: this.world,
      // How far past the target towards this hand's best. Drives the speed bonus. For a shape, how sure it is.
      excess: shape.fingers ? ramp(this.shapeLevel, SHAPE_MADE, 1) : ramp(this.openness, this.target, Math.max(this.best, this.target + 0.01)),
      // The open move's shape, by name (see core/shapes.js).
      shape: shape.id,
      // How far the hand is towards the open move, and where it counts: its opening and its line for the open
      // hand, or for a shape how sure it is of it.
      level: shape.fingers ? this.shapeLevel : this.openness,
      line: shape.fingers ? SHAPE_MADE : this.target,
    };
  }
}

export class HandMonitor {
  /** side is the hand being played with. The other one can rest, whatever it is doing. */
  constructor({ left = OPEN_RULES.defaultStrictness, right = OPEN_RULES.defaultStrictness } = {}, side = 'right') {
    this.left = new HandSide('left', left);
    this.right = new HandSide('right', right);
    this.side = side;
    this.other = this.watchOther();
    // How many are playing at this camera, and the hands of all but the first of them: see setPlayers.
    this.players = 1;
    this.guests = [];
    this.shapes = null;
    // Straight on is wherever the hand starts.
    this.neutralSteer = null;
    this.steerInput = null;
    this.steer = 0;
    this.lastUpdate = null;
    this.snapshot = this.buildSnapshot(false);
  }

  /**
   * Several playing at one camera, each with a hand of their own: count is how many, one as a game comes.
   * Everyone plays with the same hand, right or left, the side in play. The first hand to come is the hand in
   * play, as ever, and the others are the snapshot's guests, each open or closed by the same rules. Which hand
   * in the picture is whose is in core/hand-group.js.
   */
  setPlayers(count) {
    const players = Math.min(MOST_PLAYERS, Math.max(1, Math.round(count) || 1));
    if (players === this.players) return;
    this.players = players;
    this.guests = this.makeGuests();
    this.snapshot = this.buildSnapshot(this.snapshot.overlap);
  }

  makeGuests() {
    return Array.from({ length: this.players - 1 }, () => {
      const guest = new HandSide(this.side, this[this.side].strictness);
      if (this.shapes) guest.setShapes(this.shapes);
      return guest;
    });
  }

  /**
   * The hand not in play, judged on its own. It never affects the hand in play, and the left and
   * right views still only ever show the hand in play. A game can use it for something extra, and the
   * same rules apply: missing, cut off, too small or touching the other hand is never open.
   */
  watchOther() {
    const side = this.side === 'left' ? 'right' : 'left';
    return new HandSide(side, this[side].strictness);
  }

  setSide(side) {
    this.side = side;
    this.other = this.watchOther();
    this.guests = this.makeGuests();
    this.neutralSteer = null;
    this.steerInput = null;
    this.steer = 0;
    this.snapshot = this.buildSnapshot(this.snapshot.overlap);
  }

  setStrictness(side, value) {
    this[side].strictness = value;
    if (this.other.side === side) this.other.strictness = value;
    for (const guest of this.guests) if (guest.side === side) guest.strictness = value;
    this.snapshot = this.buildSnapshot(this.snapshot.overlap);
  }

  /**
   * The hand shapes for the game's moves, from shapesFor in core/shapes.js. They're for the hand in play: the
   * other hand, which some games use for something extra, is always just open or closed.
   */
  setShapes(shapes) {
    this.shapes = shapes;
    this.left.setShapes(shapes);
    this.right.setShapes(shapes);
    for (const guest of this.guests) guest.setShapes(shapes);
    this.snapshot = this.buildSnapshot(this.snapshot.overlap);
  }

  /** The camera is off. Hands seen before that must not still count as open later. */
  forgetHands() {
    this.left.forget();
    this.right.forget();
    this.other.forget();
    for (const guest of this.guests) guest.forget();
    this.steerInput = null;
    this.steer = 0;
    this.lastUpdate = null;
    this.snapshot = this.buildSnapshot(false);
  }

  /** best is null from a check of a shape, rather than of how far the hand opens, and leaves the hand's best as it was. */
  applyCheck({ best, neutralSteer }) {
    const hand = this[this.side];
    if (best !== null) hand.best = best;
    hand.checked = true;
    this.neutralSteer = neutralSteer;
  }

  /**
   * Finds the hand being played with. A hand alone is named by the tracker's label, as
   * it could be anywhere in the picture. If the tracker isn't sure, which could well happen
   * with an affected hand, its side of the mirror decides, so a child doesn't get stuck
   * being asked for a hand they're showing. Whether it's open is measured separately either
   * way. Of two hands, labels that disagree settle it, even with arms crossed.
   */
  pickHand(candidates) {
    const wanted = this.side;
    if (candidates.length === 1) {
      const [only] = candidates;
      if (only.side && only.score >= MIN_LABEL_SCORE) return only.side === wanted ? only : null;
      return only.image[MIDDLE_KNUCKLE].x < 0.5 === (wanted === 'left') ? only : null;
    }
    if (candidates.length === 2) {
      const [a, b] = candidates;
      if (a.side && b.side && a.side !== b.side) return a.side === wanted ? a : b;
      const [onLeft, onRight] = a.centre.x <= b.centre.x ? [a, b] : [b, a];
      return wanted === 'left' ? onLeft : onRight;
    }
    return null;
  }

  /** Feed one tracker result. rawHands is what tracker.worker.js sends. */
  update(rawHands, now, aspect = 16 / 9) {
    const dt = this.lastUpdate === null ? 0 : now - this.lastUpdate;
    this.lastUpdate = now;
    if (this.players > 1) return this.updateGroup(rawHands, now, aspect, dt);

    const candidates = dropDuplicate(rawHands.slice(0, 2).map((raw) => readCandidate(raw, aspect)));
    const overlap =
      candidates.length === 2 &&
      gap(candidates[0].centre, candidates[1].centre) <
        OVERLAP_GAP * Math.max(candidates[0].size, candidates[1].size);
    const hand = this.pickHand(candidates);

    this.left.update(this.side === 'left' ? hand : null, now, overlap);
    this.right.update(this.side === 'right' ? hand : null, now, overlap);
    // Of two hands, the other is the one that isn't in play. A hand alone that isn't the one in play is it.
    const otherHand = candidates.length === 2 ? candidates.find((candidate) => candidate !== hand) ?? null : hand ? null : candidates[0] ?? null;
    this.other.update(otherHand, now, overlap);
    // Worth knowing: a hand is in view, but it isn't the one being played with.
    this.otherHandSeen = candidates.length > 0 && !hand;

    this.steerWith(hand, overlap, dt);
    this.snapshot = this.buildSnapshot(overlap);
    return this.snapshot;
  }

  /**
   * One look with several playing. Every hand that may play is followed from look to look by where it is: the
   * first is the hand in play, and the rest are the guests. A hand the tracker is sure is the other one, left
   * for right, is left out, as a child's other hand is. A hand touching any other is never open, whoever's
   * they are.
   */
  updateGroup(rawHands, now, aspect, dt) {
    const found = dropDuplicates(rawHands.map((raw) => readCandidate(raw, aspect)));
    const touching = (hand) => found.some((other) => other !== hand && gap(hand.centre, other.centre) < OVERLAP_GAP * Math.max(hand.size, other.size));
    const playing = found.filter((hand) => !(hand.side && hand.side !== this.side && hand.score >= MIN_LABEL_SCORE));
    const { to, heir } = followHands([this[this.side], ...this.guests], playing, now);
    const [hand, ...guests] = to.map((index) => playing[index] ?? null);
    // A guest whose hand has become the hand in play starts again, for whoever comes next.
    if (heir > 0) this.guests[heir - 1].forget();
    const overlap = Boolean(hand && touching(hand));

    this.left.update(this.side === 'left' ? hand : null, now, overlap);
    this.right.update(this.side === 'right' ? hand : null, now, overlap);
    this.guests.forEach((guest, index) => guest.update(guests[index], now, Boolean(guests[index] && touching(guests[index]))));
    // The other hand has no part here: with several playing, a hand of that side could be anyone's.
    this.other.update(null, now, false);
    this.otherHandSeen = found.length > 0 && !hand;

    this.steerWith(hand, overlap, dt);
    this.snapshot = this.buildSnapshot(overlap);
    return this.snapshot;
  }

  /** Moving the hand in play side to side steers, from wherever it started. */
  steerWith(hand, overlap, dt) {
    if (hand && !overlap) {
      const input = hand.centre.x;
      this.steerInput = this.steerInput === null ? input : this.steerInput + (input - this.steerInput) * smoothing(dt, STEER_SMOOTH_MS);
      if (this.neutralSteer === null) this.neutralSteer = this.steerInput;
      this.steer = steerFromReach(this.steerInput - this.neutralSteer);
    } else {
      this.steerInput = null;
      this.steer -= this.steer * smoothing(dt, STEER_RELEASE_MS);
      if (Math.abs(this.steer) < 0.01) this.steer = 0;
    }
  }

  buildSnapshot(overlap) {
    const views = { left: this.left.view(), right: this.right.view() };
    const hand = views[this.side];
    const handOpen = hand.status === 'open' && !overlap;
    return {
      ...views,
      side: this.side,
      overlap,
      handOpen,
      handVisible: hand.status !== 'missing',
      otherHandSeen: this.otherHandSeen ?? false,
      other: this.other.view(),
      // With several playing, the hands of all but the first: each as a hand's view is, with which place it has.
      players: this.players,
      guests: this.guests.map((guest, index) => ({ ...guest.view(), place: index + 1 })),
      steerInput: this.steerInput,
      steer: this.steer,
      drive: handOpen ? DRIVE_BASE + (1 - DRIVE_BASE) * hand.excess : 0,
    };
  }
}

export function steerFromReach(offset) {
  const size = ramp(Math.abs(offset), REACH_DEAD_ZONE, REACH_FULL_LOCK);
  return size === 0 ? 0 : Math.sign(offset) * size;
}

const percentile = (values, share) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];
};

/**
 * The hand check: measures the hand's best opening and where it naturally rests, because an
 * affected arm is often held off to one side and "straight" should still mean straight. It
 * deliberately never asks for a fist.
 */
export class HandCheck {
  constructor({ seconds = 2 } = {}) {
    this.seconds = seconds;
    this.elapsed = 0;
    this.samples = [];
    this.steerInputs = [];
  }

  /** Only time with the hand properly in view counts. Returns whether it counted. */
  add(snapshot, dtSeconds) {
    const { status, reason, openness } = snapshot[snapshot.side];
    const usable = status !== 'missing' && reason !== 'edge' && reason !== 'small';
    if (snapshot.overlap || !usable) return false;
    this.elapsed += dtSeconds;
    this.samples.push(openness);
    if (snapshot.steerInput !== null) this.steerInputs.push(snapshot.steerInput);
    return true;
  }

  get progress() {
    return clamp01(this.elapsed / this.seconds);
  }

  get done() {
    return this.elapsed >= this.seconds;
  }

  result() {
    return {
      // The 90th percentile rather than the peak, so one lucky frame can't set the bar.
      best: percentile(this.samples, 0.9),
      neutralSteer: percentile(this.steerInputs, 0.5),
    };
  }
}

/**
 * What to tell the child right now, or null when the hand is doing the right thing. A hand that isn't making the
 * open move is asked to: to open, or to make the shape chosen for it, and then move says to show that shape in
 * the picture. Its key starts with 'closed' either way, which is how games know it.
 */
export function promptFor(snapshot) {
  if (snapshot.overlap) return { key: 'apart', text: 'Keep your hands apart', side: null };

  const { side } = snapshot;
  const { reason, shape = 'open' } = snapshot[side];
  if (reason === 'closed' && shape !== 'open') {
    return { key: `closed-${side}-${shape}`, text: SHAPES[shape]?.prompt ?? FINGERS_PROMPT, side, move: 'open' };
  }
  const text = {
    missing: `Show your ${side} hand!`,
    edge: `Move your ${side} hand into the picture`,
    small: 'Come a little closer',
    closed: `Open your ${side} hand!`,
  }[reason];
  return text ? { key: `${reason}-${side}`, text, side } : null;
}

const emptyHandStats = () => ({
  openSeconds: 0,
  openings: 0,
  longestHold: 0,
  peak: 0,
  currentHold: 0,
  wasOpen: false,
});

/** Per-hand numbers for the summary at the end of a game. Kept in memory only. */
export class PlayStats {
  constructor() {
    this.seconds = 0;
    this.handOpenSeconds = 0;
    this.left = emptyHandStats();
    this.right = emptyHandStats();
  }

  update(snapshot, dtSeconds) {
    this.seconds += dtSeconds;
    if (snapshot.handOpen) this.handOpenSeconds += dtSeconds;
    for (const side of ['left', 'right']) {
      const hand = snapshot[side];
      const stats = this[side];
      const isOpen = hand.status === 'open';
      if (isOpen) {
        if (!stats.wasOpen) stats.openings += 1;
        stats.openSeconds += dtSeconds;
        stats.currentHold += dtSeconds;
        stats.longestHold = Math.max(stats.longestHold, stats.currentHold);
      } else {
        stats.currentHold = 0;
      }
      stats.wasOpen = isOpen;
      if (hand.status !== 'missing') stats.peak = Math.max(stats.peak, hand.openness);
    }
  }
}
