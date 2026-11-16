// Reads the child's whole body from the tracker, and turns what it's doing into moves. It's for
// any game played with the whole body, and each game decides what the moves mean.
//
// No screen or camera in this file, so all of it runs against what the real model reported
// for real videos, in test/unit/body.test.js. Sizes are measured against the child's own body,
// so it doesn't matter how far away they stand or how big they are, and a grown-up can set how
// big a movement has to be, because a small movement may be a big effort for this child.
//
// The tracker's picture isn't mirrored, so x is flipped here: everything below is as seen in
// the mirror, with the child's right hand on the right of the picture.
import { measureHand } from '../hands.js';
import { HIP_HEIGHT, makePose } from './characters.js';

// MediaPipe's numbers for the points on a body.
const P = {
  nose: 0,
  left: { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27 },
  right: { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28 },
};
const SIDES = ['left', 'right'];
const otherSide = (side) => (side === 'left' ? 'right' : 'left');

const MIN_VISIBLE = 0.5;
const EDGE = 0.012;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const hypot = Math.hypot;

const HISTORY_SECONDS = 0.7;
// Below is how far movements have to go, for a child set to "medium" movements. A setting
// multiplies all of them.
export const MOVE_SIZES = { tiny: 0.6, small: 0.8, medium: 1, big: 1.3 };

const STRIKE = {
  speed: 3.2, // Arm lengths a second, measured over the time below.
  window: 0.17,
  travel: 0.5, // Arm lengths moved in that time.
  reach: 0.66, // How far out the hand has to end up.
  rearm: 0.3, // Seconds before the same arm can strike again.
};
const LEG = {
  rise: 0.2, // Share of leg length the foot lifts.
  window: 0.3,
  rearm: 0.1,
};
// When a game is asking for a push, it doesn't have to be quick to be told from everything else,
// and a slow, careful one is just as good. See slowStrikes.
const SLOW_STRIKE = { speed: 0.85, window: 0.45, travel: 0.42, rearm: 0.6 };
const SQUAT = { sink: 0.2, rearm: 0.08 };
const JUMP = { rise: 0.075, window: 0.4, rearm: 0.035, footShare: 1.5, waitForStar: 0.18 };
const STAR = { armsAbove: 0.1, feetApart: 1.5, leastFeetApart: 1.15, handsApart: 1.9 };
const TOE_TOUCH = { torso: 0.62, rearm: 0.82 };
const SKY = { above: 0.28, hold: 0.28 };
// Two hands coming together, measured in shoulder widths. They have to have been apart first.
const CLAP = { apart: 0.95, leastApart: 0.8, together: 0.7 };
// A hand going round. Its path is kept for a few seconds, a point at a time, spaced by more than
// the tracker wobbles, in torso lengths. Most of a whole turn around the middle of that is a circle.
// A hand that leaps further than this at once is the tracker having lost it, so it starts again.
const CIRCLE = {
  step: 0.05,
  leap: 0.9,
  begun: 8,
  keep: 8,
  // A circle can take any time, and whatever the hand was doing before it shouldn't count against it.
  within: [8, 5.5, 4, 3, 2.2],
  still: 1.5,
  turn: Math.PI * 1.4, // Short of all the way round, as a hand in front of the body is often lost.
  leastRadius: 0.2,
  roundness: 0.1,
  oneWay: 0.65,
};
const GUARD = { near: 0.85, hold: 0.1 };
// Arms held out like wings. Hands this many shoulder widths apart counts as out, and arms hanging
// down come to about 1.4. Tipping steers, in radians, and arms high or low climb or dive, in torso
// lengths. A game can learn what's right for one child: see personal.
const WINGS = { out: 2.4, leastOut: 1.75, fullTilt: 0.6, fullClimb: 0.55, deadZone: 0.18 };
const LEAN = { dodge: 0.32 };
const HIGH_KNEES = { lifts: 3, within: 2.6 };
const DOUBLE_SECONDS = 0.2;
// Both arms swinging up or down together belong to a star jump or a reach, not to two strikes.
const BOTH_ARMS_TOGETHER = 0.45;
// Arms settle after an exercise, and that isn't a strike either.
const SETTLE_SECONDS = 0.55;
const MOVING_SPEED = 0.7;
const UPPER_BODY = { leastRoomAbove: 0.28, leastRoomForWings: 0.08, widthOfWings: 4, leastShoulders: 0.09 };
// How far above the shoulder counts as a hand held up, in lengths of the torso, and how far it
// has to come down again before it can count a second time.
const HAND_UP = { above: 0.34, comeDown: 0.26 };
const REST_FRAMES_SECONDS = 0.25;

/** Turns tracker output into points in the mirror, in units of the picture's height. */
function readPoints(body, aspect) {
  return body.image.map(({ x, y, visibility }) => ({ x: (1 - x) * aspect, y, seen: visibility ?? 1 }));
}

/** Tracker world points as the fighter's body would have them: left, up and forwards. */
function readWorld(body) {
  return body.world.map(({ x, y, z }) => ({ x, y: -y, z: -z }));
}

const between = (a, b) => hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
const newCircle = () => ({ points: [], turned: 0 });
const noWings = () => ({ seen: false, out: false, span: 0, tilt: 0, height: 0, bank: 0, climb: 0 });

/** How far a path has wound around its own middle, in radians, or 0 if it isn't round enough. */
function windingOf(points, leastRadius) {
  if (points.length < CIRCLE.begun) return 0;
  let cx = 0;
  let cy = 0;
  for (const { x, y } of points) {
    cx += x / points.length;
    cy += y / points.length;
  }
  let xx = 0;
  let yy = 0;
  let xy = 0;
  let radius = 0;
  for (const { x, y } of points) {
    xx += (x - cx) ** 2;
    yy += (y - cy) ** 2;
    xy += (x - cx) * (y - cy);
    radius += hypot(x - cx, y - cy) / points.length;
  }
  if (radius < leastRadius) return 0;
  // How the spread along its narrowest direction compares with its widest.
  const middle = (xx + yy) / 2;
  const spread = Math.sqrt(((xx - yy) / 2) ** 2 + xy ** 2);
  if ((middle - spread) / Math.max(1e-9, middle + spread) < CIRCLE.roundness) return 0;

  let total = 0;
  let travelled = 0;
  let previous = null;
  for (const { x, y, leapt } of points) {
    // Close to the middle, the angle means very little.
    if (hypot(x - cx, y - cy) < radius * 0.35) continue;
    const angle = Math.atan2(y - cy, x - cx);
    if (previous !== null && !leapt) {
      let turn = angle - previous;
      if (turn > Math.PI) turn -= Math.PI * 2;
      if (turn < -Math.PI) turn += Math.PI * 2;
      total += turn;
      travelled += Math.abs(turn);
    }
    previous = angle;
  }
  // Going round means going mostly one way. Tracker wobble goes every way, and adds up to little.
  return Math.abs(total) >= travelled * CIRCLE.oneWay ? Math.abs(total) : 0;
}
const middle = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z ?? 0) + (b.z ?? 0)) / 2 });

function angleAt(a, joint, b) {
  const ux = a.x - joint.x;
  const uy = a.y - joint.y;
  const uz = (a.z ?? 0) - (joint.z ?? 0);
  const vx = b.x - joint.x;
  const vy = b.y - joint.y;
  const vz = (b.z ?? 0) - (joint.z ?? 0);
  const lengths = hypot(ux, uy, uz) * hypot(vx, vy, vz);
  if (lengths === 0) return 180;
  return (Math.acos(clamp((ux * vx + uy * vy + uz * vz) / lengths, -1, 1)) * 180) / Math.PI;
}

/**
 * Whether the picture shows all of the child, and if not, what to tell them. The camera has to
 * see the whole body, because the legs and feet are half of the game.
 */
const GROUP_EDGE = 0.07; // How near the side of the picture one of several players may stand, as a share of its width.

export function viewProblem(body, aspect = 16 / 9, { upperBodyOnly = false, armsOut = false, group = false } = {}) {
  if (!body) return 'no-body';
  const points = readPoints(body, aspect);
  if (upperBodyOnly) return upperBodyProblem(points, aspect, armsOut);
  const needed = [P.nose, ...SIDES.flatMap((side) => [P[side].shoulder, P[side].hip, P[side].knee, P[side].ankle])];
  const nose = points[P.nose];
  const feetY = Math.max(points[P.left.ankle].y, points[P.right.ankle].y);
  const hips = middle(points[P.left.hip], points[P.right.hip]);
  const seen = needed.every((index) => points[index].seen >= MIN_VISIBLE);

  // A head near the top or feet near the bottom means too close, whatever else is going on.
  if (feetY > 1 - EDGE * 2 || nose.y < 0.03) return 'step-back';
  if (!seen) return feetY > 0.9 || points[P.left.knee].y > 0.9 ? 'step-back' : 'show-all';
  if (feetY - nose.y < 0.36) return 'come-closer';
  // One child stands in the middle. Several stand side by side, right across the picture, so each only has to
  // be clear of its edges.
  const side = group ? GROUP_EDGE : 0.24;
  if (hips.x < aspect * side) return 'move-right';
  if (hips.x > aspect * (1 - side)) return 'move-left';
  return null;
}

/**
 * For a child who plays sitting down, or closer to the camera: head, shoulders and arms. armsOut is
 * for a game with both arms held out, which needs room to the sides more than above the head.
 */
function upperBodyProblem(points, aspect, armsOut) {
  const nose = points[P.nose];
  const left = points[P.left.shoulder];
  const right = points[P.right.shoulder];
  if (nose.seen < MIN_VISIBLE || left.seen < MIN_VISIBLE || right.seen < MIN_VISIBLE) return 'show-all';
  // A raised hand needs room above the head.
  if (nose.y < (armsOut ? UPPER_BODY.leastRoomForWings : UPPER_BODY.leastRoomAbove)) return 'step-back';
  const shoulders = between(left, right);
  if (shoulders < UPPER_BODY.leastShoulders) return 'come-closer';
  if (armsOut && shoulders * UPPER_BODY.widthOfWings > aspect) return 'step-back';
  const middleX = (left.x + right.x) / 2;
  if (middleX < aspect * 0.2) return 'move-right';
  if (middleX > aspect * 0.8) return 'move-left';
  return null;
}

/** Where a close-up of each hand should be taken from, as shares of the whole picture. */
export function closeUpBoxes(body, aspect = 16 / 9) {
  if (!body) return [];
  const boxes = [];
  for (const side of SIDES) {
    const { elbow, wrist } = P[side];
    const a = body.image[elbow];
    const b = body.image[wrist];
    if ((b.visibility ?? 1) < 0.3) continue;
    const dx = (b.x - a.x) * aspect;
    const dy = b.y - a.y;
    const forearm = hypot(dx, dy);
    // Hands are about as long as three quarters of a forearm, and a forearm pointing at the
    // camera looks short, so this also goes by the distance between the shoulders.
    const shoulders = hypot((body.image[11].x - body.image[12].x) * aspect, body.image[11].y - body.image[12].y);
    const size = clamp(Math.max(forearm * 1.5, shoulders * 1.05), 0.08, 0.6);
    // Centred a little way past the wrist, where the hand is.
    const centreX = b.x + (b.x - a.x) * 0.32;
    const centreY = b.y + dy * 0.32;
    const width = size / aspect;
    boxes.push({
      side,
      x: clamp(centreX - width / 2, 0, 1 - width),
      y: clamp(centreY - size / 2, 0, 1 - size),
      width,
      height: size,
    });
  }
  return boxes;
}

const HAND_OPEN = 0.45;
const HAND_CLOSED = 0.28;
const HAND_FRESH_SECONDS = 0.55;
// A hand has to be read as open twice in a row, as a lucky frame shouldn't earn the bonus.
const HAND_AGREE = 2;

/**
 * What each hand was last seen doing. Anything unclear counts as not known, which never earns
 * the open-hand bonus. A fist can't count as open here, just as in the hand games.
 */
export class HandWatcher {
  constructor() {
    this.left = { state: null, at: -Infinity, run: 0, last: null };
    this.right = { state: null, at: -Infinity, run: 0, last: null };
  }

  add(reading, now) {
    const hand = this[reading.side];
    if (!reading.found) {
      hand.run = 0;
      hand.last = null;
      return;
    }
    const { openness } = measureHand(reading.world);
    const read = openness >= HAND_OPEN ? 'open' : openness <= HAND_CLOSED ? 'closed' : null;
    hand.run = read && read === hand.last ? hand.run + 1 : 1;
    hand.last = read;
    hand.openness = openness;
    if (read && hand.run >= HAND_AGREE) {
      hand.state = read;
      hand.at = now;
    }
  }

  /** 'open', 'closed' or null, for the hand as it was just now. */
  stateOf(side, now) {
    const hand = this[side];
    return now - hand.at <= HAND_FRESH_SECONDS ? hand.state : null;
  }
}

/** Follows one body from frame to frame, and says which moves it just made. */
export class BodyReader {
  constructor({ size = 'medium' } = {}) {
    this.setSize(size);
    this.history = [];
    this.floor = { left: null, right: null };
    this.standing = null; // How far the hips are above the floor, standing up.
    this.torsoSize = null;
    this.armLength = 0.6;
    this.legLength = 0.8;
    this.arm = {
      left: { lastAt: -Infinity, lastSlowAt: -Infinity, wasUp: false },
      right: { lastAt: -Infinity, lastSlowAt: -Infinity, wasUp: false },
    };
    this.leg = {
      left: { up: false, pending: null },
      right: { up: false, pending: null },
    };
    this.lastStrikeAt = -Infinity;
    this.lastStrikeSide = null;
    this.armsSettleAt = -Infinity;
    this.lifts = [];
    this.handsUp = { left: false, right: false };
    this.handHeight = { left: -1, right: -1 };
    this.handsWereApart = true;
    this.clapShare = 0;
    this.circle = { left: newCircle(), right: newCircle() };
    this.wings = noWings();
    this.footRises = { left: 0, right: 0 };
    this.armForward = { left: 0, right: 0 };
    this.starShare = 0;
    this.skyShare = 0;
    this.bendShare = 0;
    this.slowStrikes = false; // Set by a game that asks for a push, and takes one however slow.
    this.upperBodyOnly = false;
    // What this child's own moves have been measured to be, in place of the general sizes.
    this.personal = { jump: null, squat: null, leg: null, hand: null };
    this.jumpEffort = 0;
    this.footHeight = 0;
    this.jumpWaitingSince = null;
    this.squatting = false;
    this.inAir = false;
    this.inStar = false;
    this.bent = false;
    this.skySince = null;
    this.skyDone = false;
    this.guardSince = null;
    this.guard = false;
    this.dodge = 0;
    this.moving = false;
    this.seen = false;
    this.lastSeenAt = -Infinity;
    this.hands = new HandWatcher();
    this.pose = makePose();
    this.hasPose = false;
    this.offset = 0;
    this.centre = null;
  }

  setSize(name) {
    this.size = MOVE_SIZES[name] ?? 1;
    this.sizeName = name;
  }

  /** How much of a jump counts, as a share of leg length. */
  get jumpNeeded() {
    return this.personal.jump ?? JUMP.rise * this.size;
  }

  /** How far the hips have to sink to count as a squat, as a share of leg length. */
  get squatNeeded() {
    return this.personal.squat ?? SQUAT.sink * this.size;
  }

  /** How far apart the hands have to be to count as wings, in shoulder widths. */
  get wingsNeeded() {
    return this.personal.wings ?? Math.max(WINGS.leastOut, WINGS.out * this.size);
  }

  /** How far a foot has to lift to count, as a share of leg length. */
  get legNeeded() {
    return this.personal.leg ?? LEG.rise * this.size;
  }

  /** How high a hand has to go to count as up, in torso lengths above the shoulder. */
  get handNeeded() {
    return this.personal.hand ?? HAND_UP.above * this.size;
  }

  /**
   * Where the body is right now, in this child's own terms: -1 is a full squat, 1 is a full jump,
   * and 0 is standing. It's for showing the child how their movement is being seen.
   */
  get meter() {
    const down = (this.sink ?? 0) / this.squatNeeded;
    const up = this.jumpEffort / this.jumpNeeded;
    return clamp(up > Math.max(down, 0.08) ? up : -Math.max(down, 0), -1.25, 1.25);
  }

  /** The child stepped away or the camera restarted. Nothing carries over. */
  forget() {
    this.history = [];
    this.floor = { left: null, right: null };
    this.squatting = false;
    this.inAir = false;
    this.inStar = false;
    this.bent = false;
    this.skySince = null;
    this.skyDone = false;
    this.guardSince = null;
    this.guard = false;
    this.dodge = 0;
    this.seen = false;
    this.moving = false;
    this.hasPose = false;
    this.lifts = [];
    this.handsUp = { left: false, right: false };
    this.handsWereApart = true;
    this.clapShare = 0;
    this.circle = { left: newCircle(), right: newCircle() };
    this.wings = noWings();
    this.jumpEffort = 0;
    this.footHeight = 0;
    this.jumpWaitingSince = null;
  }

  /**
   * How close the body is to a move right now, from nothing to all of it, for showing the child
   * that it's being seen. side is for the moves made with one arm or leg.
   */
  effortFor(name, side = 'right') {
    const share = (value, needed) => clamp(value / needed, 0, 1);
    const shares = {
      squat: () => share(this.sink ?? 0, this.squatNeeded),
      jump: () => share(this.jumpEffort, this.jumpNeeded),
      starJump: () => this.starShare,
      clap: () => this.clapShare,
      handCircle: () => share(this.circle[side].turned, CIRCLE.turn),
      kneeLift: () => share(this.footRises[side], this.legNeeded),
      kick: () => share(this.footRises[side], this.legNeeded),
      push: () => share(this.armForward[side], STRIKE.reach),
      raise: () => share(this.handHeight[side] + 0.9, this.handNeeded + 0.9),
      skyReach: () => this.skyShare,
      toeTouch: () => this.bendShare,
      highKnees: () => share(this.lifts.length, HIGH_KNEES.lifts),
      block: () => (this.guard ? 1 : this.guardSince === null ? 0 : 0.5),
      lean: () => share(Math.abs(this.dodge), 0.5),
      wings: () => share(this.wings.span, this.wingsNeeded),
    };
    return shares[name]?.() ?? 0;
  }

  /** Uses a standing body as the measure for everything after. Called by the body check. */
  setStanding(body, aspect) {
    const frame = this.readFrame(body, aspect);
    if (!frame) return;
    this.floor = { left: frame.left.ankle.y, right: frame.right.ankle.y };
    this.standing = (this.floor.left + this.floor.right) / 2 - frame.hips.y;
    this.torsoSize = frame.torso;
    this.centre = frame.hips.x;
  }

  readFrame(body, aspect) {
    const image = readPoints(body, aspect);
    const world = readWorld(body);
    const side = (name) => {
      const at = P[name];
      return {
        shoulder: image[at.shoulder],
        elbow: image[at.elbow],
        wrist: image[at.wrist],
        hip: image[at.hip],
        knee: image[at.knee],
        ankle: image[at.ankle],
        world: {
          shoulder: world[at.shoulder],
          elbow: world[at.elbow],
          wrist: world[at.wrist],
          hip: world[at.hip],
          knee: world[at.knee],
          ankle: world[at.ankle],
        },
        armSeen: image[at.shoulder].seen >= MIN_VISIBLE && image[at.wrist].seen >= MIN_VISIBLE,
        legSeen: image[at.hip].seen >= MIN_VISIBLE && image[at.ankle].seen >= MIN_VISIBLE,
      };
    };
    const left = side('left');
    const right = side('right');
    const shoulders = middle(left.shoulder, right.shoulder);
    const hips = middle(left.hip, right.hip);
    return {
      left,
      right,
      nose: image[P.nose],
      shoulders,
      hips,
      torso: between(shoulders, hips),
      shoulderWidth: between(left.shoulder, right.shoulder),
      worldShoulders: middle(left.world.shoulder, right.world.shoulder),
      worldHips: middle(left.world.hip, right.world.hip),
      // Sitting at a table, the hips may be hidden, which is fine for a game about raising a hand.
      coreSeen: image[P.left.shoulder].seen >= MIN_VISIBLE && image[P.right.shoulder].seen >= MIN_VISIBLE
        && (this.upperBodyOnly || (image[P.left.hip].seen >= MIN_VISIBLE && image[P.right.hip].seen >= MIN_VISIBLE)),
    };
  }

  /** The frame nearest to a time ago, or null if there's no history that far back. */
  framesAgo(now, seconds) {
    let found = null;
    for (let i = this.history.length - 1; i >= 0; i -= 1) {
      if (now - this.history[i].t >= seconds) {
        found = this.history[i];
        break;
      }
    }
    return found;
  }

  /**
   * One tracker result. now is in seconds. Returns the moves made in this frame, as a list of
   * { move, side, hand, exercise }, most of the time empty.
   */
  update(body, now, aspect = 16 / 9) {
    if (!body) {
      this.moving = false;
      if (now - this.lastSeenAt > 0.5) this.forget();
      return [];
    }
    const frame = this.readFrame(body, aspect);
    if (!frame.coreSeen || !Number.isFinite(frame.torso)) {
      if (now - this.lastSeenAt > 0.5) this.forget();
      return [];
    }
    frame.t = now;
    this.lastSeenAt = now;
    this.seen = true;

    this.measure(frame, now);
    this.history.push(frame);
    while (this.history.length > 2 && now - this.history[0].t > HISTORY_SECONDS) this.history.shift();

    const moves = [];
    const add = (move) => moves.push(move);
    if (this.history.length >= 3) {
      this.readStanding(frame, now, (move) => {
        this.armsSettleAt = now + SETTLE_SECONDS;
        add(move);
      });
      for (const side of SIDES) {
        this.readArm(frame, side, now, add);
        this.readLeg(frame, side, now, add);
        this.readCircle(frame, side, now, add);
      }
      this.readClap(frame, add);
      this.readGuardAndLean(frame, now);
      this.readWings(frame);
      this.readMoving(frame, now);
      this.readHandsUp(frame);
    }
    this.updatePose(frame);
    return moves;
  }

  /** Keeps the measures of this child's body up to date as they move about the room. */
  measure(frame, now) {
    const previous = this.history.at(-1);
    const dt = previous ? Math.max(0.001, now - previous.t) : 0;

    for (const side of SIDES) {
      const ankle = frame[side].ankle.y;
      if (frame[side].legSeen) {
        if (this.floor[side] === null) this.floor[side] = ankle;
        // The floor follows a foot down at once, but only drifts up, so a lifted foot doesn't
        // drag it along. A child stepping back from the camera takes it with them over time.
        const rate = ankle > this.floor[side] ? 12 : 0.28;
        this.floor[side] += (ankle - this.floor[side]) * (1 - Math.exp(-rate * dt));
      }
    }

    const floor = ((this.floor.left ?? frame.left.ankle.y) + (this.floor.right ?? frame.right.ankle.y)) / 2;
    const height = floor - frame.hips.y;
    if (this.standing === null) this.standing = height;
    // Standing height is the tallest the hips have been, slowly forgotten.
    if (height > this.standing) this.standing += (height - this.standing) * (1 - Math.exp(-6 * dt));
    else this.standing += (height - this.standing) * (1 - Math.exp(-0.09 * dt));
    this.height = height;
    this.floorY = floor;

    if (this.torsoSize === null) this.torsoSize = frame.torso;
    // Torso size follows the upright body, not one that's bending over.
    if (frame.torso > this.torsoSize) this.torsoSize += (frame.torso - this.torsoSize) * (1 - Math.exp(-3 * dt));
    else this.torsoSize += (frame.torso - this.torsoSize) * (1 - Math.exp(-0.15 * dt));

    const arm = (side) => {
      const w = frame[side].world;
      return between(w.shoulder, w.elbow) + between(w.elbow, w.wrist);
    };
    const armLength = Math.max(arm('left'), arm('right'));
    if (Number.isFinite(armLength) && armLength > 0.1) {
      this.armLength += (armLength - this.armLength) * (1 - Math.exp(-2 * dt));
    }
    if (this.centre === null) this.centre = frame.hips.x;
    this.centre += (frame.hips.x - this.centre) * (1 - Math.exp(-0.05 * dt));
  }

  /** A foot's height off the floor, as a share of leg length. */
  footRise(frame, side) {
    if (!frame[side].legSeen || this.floor[side] === null) return 0;
    return (this.floor[side] - frame[side].ankle.y) / Math.max(0.05, this.standing);
  }

  readStanding(frame, now, add) {
    const size = this.size;
    const sink = 1 - this.height / Math.max(0.05, this.standing);
    const riseLeft = this.footRise(frame, 'left');
    const riseRight = this.footRise(frame, 'right');
    const bothDown = riseLeft < 0.1 && riseRight < 0.1;
    const legsSeen = frame.left.legSeen && frame.right.legSeen;
    const bent = frame.torso / Math.max(0.05, this.torsoSize);
    this.sink = sink;
    this.bend = bent;

    // A jump is the hips going up quickly with the feet leaving the floor. Going by the higher
    // foot means a child with an affected leg doesn't need both to lift the same. The hips have
    // to rise too, so standing up out of a squat, with the feet down, isn't a jump.
    const highest = Math.max(riseLeft, riseRight);
    const lowest = Math.min(riseLeft, riseRight);
    this.footHeight = highest;
    this.footRises = { left: Math.max(0, riseLeft), right: Math.max(0, riseRight) };
    const before = this.framesAgo(now, JUMP.window);
    const hipsRose = before && legsSeen ? (before.hips.y - frame.hips.y) / Math.max(0.05, this.standing) : 0;
    this.jumpEffort = legsSeen ? Math.max(0, Math.min(hipsRose, highest * JUMP.footShare)) : 0;
    const neededJump = this.jumpNeeded;
    const armsUp = frame.left.wrist.y < frame.left.shoulder.y - STAR.armsAbove * this.torsoSize
      && frame.right.wrist.y < frame.right.shoulder.y - STAR.armsAbove * this.torsoSize;
    if (this.inAir) {
      const feetDown = highest < Math.min(JUMP.rearm * size, neededJump * 0.7);
      if (feetDown && this.jumpEffort < neededJump * 0.5) this.inAir = false;
    } else if (before && this.jumpEffort >= neededJump && highest <= lowest * 2.5 + 0.05) {
      // That last part is both feet coming up about the same. One much higher is a kick.
      this.inAir = true;
      // Arms going up as well may be a star jump, which is one move and not two, so wait and see.
      if (armsUp) this.jumpWaitingSince = now;
      else add({ move: 'flying', exercise: 'jump' });
    }

    // Arms up and out with the feet apart. Children who can't jump can still step into this.
    const shoulderWidth = Math.max(frame.shoulderWidth, this.torsoSize * 0.5);
    // Never as little as an ordinary stance, or reaching up could never be told from this.
    const feetApart = legsSeen && Math.abs(frame.left.ankle.x - frame.right.ankle.x) >= Math.max(STAR.leastFeetApart, STAR.feetApart * size) * shoulderWidth;
    const handsApart = Math.abs(frame.left.wrist.x - frame.right.wrist.x) >= STAR.handsApart * shoulderWidth * Math.min(1, size);
    const star = armsUp && feetApart && handsApart && frame.left.armSeen && frame.right.armSeen;
    this.starShare = ((armsUp ? 1 : 0) + (feetApart ? 1 : 0)) / 2;
    if (star && !this.inStar) {
      this.inStar = true;
      this.jumpWaitingSince = null;
      add({ move: 'starBurst', exercise: 'starJump' });
    } else if (!armsUp || !feetApart) {
      this.inStar = false;
    }
    if (this.jumpWaitingSince !== null && now - this.jumpWaitingSince >= JUMP.waitForStar) {
      this.jumpWaitingSince = null;
      add({ move: 'flying', exercise: 'jump' });
    }

    // Reaching down: the top of the body folds over and the hands go below the knees.
    const handsLow = SIDES.filter((side) => frame[side].armSeen && frame[side].wrist.y > frame[side].knee.y - this.torsoSize * 0.1);
    const foldedOver = bent <= TOE_TOUCH.torso + (1 - size) * 0.3;
    this.bendShare = clamp((1 - bent) / Math.max(0.05, 1 - (TOE_TOUCH.torso + (1 - size) * 0.3)), 0, 1);
    if (!this.bent && foldedOver && handsLow.length >= (size < 1 ? 1 : 2)) {
      this.bent = true;
      add({ move: 'sweep', exercise: 'toeTouch' });
    } else if (this.bent && bent >= TOE_TOUCH.rearm) {
      this.bent = false;
    }

    // Sinking with both feet on the floor. A body folding forward is a toe touch, not a squat.
    const neededSquat = this.squatNeeded;
    if (!this.squatting && legsSeen && bothDown && !this.bent && bent > TOE_TOUCH.torso && sink >= neededSquat) {
      this.squatting = true;
      add({ move: 'stomp', exercise: 'squat' });
    } else if (this.squatting && sink < Math.min(SQUAT.rearm * size, neededSquat * 0.5)) {
      this.squatting = false;
    }

    // Reaching up high, held for a moment.
    const handsHigh = SIDES.filter((side) => frame[side].armSeen && frame[side].wrist.y < frame.nose.y - SKY.above * this.torsoSize);
    const reachingUp = handsHigh.length >= (size < 1 ? 1 : 2) && !feetApart;
    const topHand = Math.min(frame.left.wrist.y, frame.right.wrist.y);
    this.skyShare = clamp((frame.shoulders.y - topHand) / Math.max(0.05, this.torsoSize * (1 + SKY.above)), 0, 1);
    if (reachingUp) {
      if (this.skySince === null) this.skySince = now;
      if (!this.skyDone && now - this.skySince >= SKY.hold) {
        this.skyDone = true;
        add({ move: 'skyCharge', exercise: 'skyReach' });
      }
    } else {
      this.skySince = null;
      if (handsHigh.length === 0) this.skyDone = false;
    }
  }

  /**
   * A hand moving fast, away from the shoulder or up or down, is a strike. With slowStrikes on, a
   * slow one is read as well and marked as slow, for a game that has asked for exactly that move.
   */
  readArm(frame, side, now, add) {
    const arm = frame[side];
    const state = this.arm[side];
    this.armForward[side] = arm.armSeen && arm.wrist.y < arm.hip.y
      ? Math.max(0, (arm.world.wrist.z - arm.world.shoulder.z) / this.armLength)
      : 0;
    if (!arm.armSeen || now < this.armsSettleAt) return;

    const kind = now - state.lastAt >= STRIKE.rearm ? this.readStrike(frame, side, now, STRIKE) : null;
    if (kind) {
      state.lastAt = now;
      const hand = this.hands.stateOf(side, now);
      if (now - this.lastStrikeAt <= DOUBLE_SECONDS && this.lastStrikeSide === otherSide(side) && kind === 'palm') {
        add({ move: 'doublePush', side, hand });
      } else if (kind === 'palm') {
        // A closed hand makes a punch, and an open one a palm strike, which is the stronger.
        add({ move: hand === 'closed' ? 'punch' : 'palm', side, hand });
      } else {
        add({ move: kind, side, hand });
      }
      this.lastStrikeAt = now;
      this.lastStrikeSide = side;
      return;
    }
    if (!this.slowStrikes || now - state.lastSlowAt < SLOW_STRIKE.rearm) return;
    const slowKind = this.readStrike(frame, side, now, SLOW_STRIKE);
    if (slowKind !== 'palm') return;
    state.lastSlowAt = now;
    const hand = this.hands.stateOf(side, now);
    add({ move: hand === 'closed' ? 'punch' : 'palm', side, hand, slow: true });
  }

  /** What kind of strike the arm has just made, going by these rules of how quick it has to be. */
  readStrike(frame, side, now, rules) {
    const arm = frame[side];
    const before = this.framesAgo(now, rules.window);
    if (!before) return null;

    const size = this.size;
    const earlier = before[side].world;
    const seconds = now - before.t;
    const move = {
      x: arm.world.wrist.x - earlier.wrist.x,
      y: arm.world.wrist.y - earlier.wrist.y,
      z: arm.world.wrist.z - earlier.wrist.z,
    };
    const travel = hypot(move.x, move.y, move.z) / this.armLength;
    const speed = travel / seconds;
    if (travel < rules.travel * size || speed < rules.speed * size) return null;

    const reachNow = between(arm.world.wrist, arm.world.shoulder) / this.armLength;
    const reachBefore = between(earlier.wrist, earlier.shoulder) / this.armLength;
    const up = move.y / (travel * this.armLength);
    if (Math.abs(up) > 0.5 && this.otherArmMatches(frame, side, before, up)) return null;
    const startedHigh = before[side].wrist.y < before[side].shoulder.y;
    const endsHigh = arm.wrist.y < arm.shoulder.y;
    // A hand pulled back to the hip straightens the arm too, so it has to end above the hip.
    const endsAboveHip = arm.wrist.y < arm.hip.y - this.torsoSize * 0.08;

    if (up > 0.7 && endsHigh) return 'uppercut';
    if (up < -0.7 && startedHigh) return 'chop';
    if (up > -0.4 && endsAboveHip && reachNow >= STRIKE.reach * Math.min(1, size + 0.15) && reachNow > reachBefore + 0.06) return 'palm';
    return null;
  }

  /** Two hands that were apart coming together. One hand can do all of the moving. */
  readClap(frame, add) {
    const { left, right } = frame;
    if (!left.armSeen || !right.armSeen) return;
    const width = Math.max(frame.shoulderWidth, this.torsoSize * 0.5);
    const gap = between(left.wrist, right.wrist) / width;
    const apart = clamp(CLAP.apart * this.size, CLAP.leastApart, CLAP.apart);
    this.clapShare = clamp((apart - gap) / Math.max(0.05, apart - CLAP.together), 0, 1);
    if (gap >= apart) {
      this.handsWereApart = true;
    } else if (this.handsWereApart && gap <= CLAP.together) {
      this.handsWereApart = false;
      add({ move: 'clap' });
    }
  }

  /**
   * A hand going round, read from how far it has wound around the middle of its own path. That
   * stays steady when the tracker jitters, works for a small circle or a big one, and comes to
   * nothing for a hand going back and forth, which unwinds again.
   */
  readCircle(frame, side, now, add) {
    const arm = frame[side];
    const circle = this.circle[side];
    // Being unsure where the hand is for a moment doesn't matter. The circle picks up from there.
    if (!arm.armSeen) return;
    const torso = Math.max(0.05, this.torsoSize);
    const { x, y } = arm.wrist;
    const last = circle.points.at(-1);
    const moved = last ? hypot(x - last.x, y - last.y) / torso : 0;
    // A hand that seems to jump may just be the tracker, which often does that as a hand crosses in
    // front of the body. That shouldn't cost a child a circle that's well on the way, so it only
    // starts again from a circle that has hardly begun. The jump itself never counts as going round.
    const leapt = moved > CIRCLE.leap;
    // A hand that has stopped, or gone unseen for a while, starts again from where it is now.
    if (last && (now - last.t > CIRCLE.still || (leapt && circle.points.length < CIRCLE.begun))) {
      this.circle[side] = { points: [{ x, y, t: now }], turned: 0 };
      return;
    }
    if (last && moved < CIRCLE.step) return;
    circle.points.push({ x, y, t: now, leapt });
    while (now - circle.points[0].t > CIRCLE.keep) circle.points.shift();
    const leastRadius = CIRCLE.leastRadius * this.size * torso;
    circle.turned = Math.max(...CIRCLE.within.map((seconds) => windingOf(circle.points.filter(({ t }) => now - t <= seconds), leastRadius)));
    if (circle.turned >= CIRCLE.turn) {
      this.circle[side] = newCircle();
      add({ move: 'circle', side, hand: this.hands.stateOf(side, now) });
    }
  }

  /** Whether the other arm is sweeping the same way at the same time. */
  otherArmMatches(frame, side, before, up) {
    const other = otherSide(side);
    if (!frame[other].armSeen) return false;
    const rise = (frame[other].world.wrist.y - before[other].world.wrist.y) / this.armLength;
    return Math.sign(rise) === Math.sign(up) && Math.abs(rise) >= BOTH_ARMS_TOGETHER * this.size;
  }

  /** One foot off the floor: a kick if the leg is out, a knee if it's folded under. */
  readLeg(frame, side, now, add) {
    const leg = frame[side];
    const state = this.leg[side];
    if (!leg.legSeen) return;
    const size = this.size;
    const rise = this.footRise(frame, side);
    const otherRise = this.footRise(frame, otherSide(side));
    const needed = this.legNeeded;

    if (state.up) {
      if (rise < Math.min(LEG.rearm * size, needed * 0.5)) state.up = false;
      return;
    }
    if (rise < needed || otherRise > needed * 0.6 || this.inAir) return;

    const before = this.framesAgo(now, LEG.window);
    if (!before) return;
    const riseBefore = (this.floor[side] - before[side].ankle.y) / Math.max(0.05, this.standing);
    if (riseBefore > needed * 0.75) return;

    state.up = true;
    // A knee has the foot hanging under it. A kick has the foot out in front or up by the knee.
    const shin = between(leg.knee, leg.ankle);
    const thigh = Math.max(between(leg.hip, leg.knee), this.standing * 0.35);
    const footUnderKnee = leg.ankle.y - leg.knee.y;
    const kneeUp = 1 - (leg.knee.y - leg.hip.y) / thigh;
    const isKnee = kneeUp > 0.35 && footUnderKnee > shin * 0.55 && angleAt(leg.world.hip, leg.world.knee, leg.world.ankle) < 125;
    add({ move: isKnee ? 'knee' : 'kick', side });

    // Quick lifts of alternate legs are high knees.
    this.lifts.push({ side, at: now });
    this.lifts = this.lifts.filter(({ at }) => now - at <= HIGH_KNEES.within);
    const recent = this.lifts.slice(-HIGH_KNEES.lifts);
    const alternating = recent.length === HIGH_KNEES.lifts
      && recent.every((lift, index) => index === 0 || lift.side !== recent[index - 1].side);
    if (alternating) {
      add({ move: 'turbo', exercise: 'highKnees' });
      this.lifts = [];
    }
  }

  /** Hands up by the face is a guard. Leaning to the side gets out of the way. */
  readGuardAndLean(frame, now) {
    const near = SIDES.filter((side) => frame[side].armSeen
      && between(frame[side].wrist, frame.nose) <= GUARD.near * this.torsoSize
      && angleAt(frame[side].shoulder, frame[side].elbow, frame[side].wrist) < 110);
    const guarding = near.length >= (this.size < 1 ? 1 : 2);
    if (guarding) {
      if (this.guardSince === null) this.guardSince = now;
      this.guard = now - this.guardSince >= GUARD.hold;
    } else {
      this.guardSince = null;
      this.guard = false;
    }

    const lean = (frame.shoulders.x - frame.hips.x) / Math.max(0.05, this.torsoSize);
    const needed = LEAN.dodge * this.size;
    // 0.5 is the point at which the fight counts a lean as getting out of the way.
    this.dodge = clamp((lean / needed) * 0.5, -1, 1);
    if (Math.abs(this.dodge) < 0.15) this.dodge = 0;
    if (this.bent) this.dodge = 0;
  }

  /**
   * Both arms as wings. Going by the line between the hands means leaning counts as well, which
   * helps a child whose arm doesn't go up as far as the other one. The picture is a mirror, so the
   * right hand lower than the left is tipping to the right, and that comes out positive.
   */
  readWings(frame) {
    const { left, right } = frame;
    if (!left.armSeen || !right.armSeen) {
      this.wings = noWings();
      return;
    }
    const { personal } = this;
    const width = Math.max(frame.shoulderWidth, this.torsoSize * 0.5);
    const across = right.wrist.x - left.wrist.x;
    const down = right.wrist.y - left.wrist.y;
    const span = hypot(across, down) / width;
    const tilt = Math.atan2(down, Math.max(0.01, across));
    const height = (frame.shoulders.y - (left.wrist.y + right.wrist.y) / 2) / Math.max(0.05, this.torsoSize);
    const tipped = tilt - (personal.tiltZero ?? 0);
    const fullTip = (tipped > 0 ? personal.tiltRight : personal.tiltLeft) ?? WINGS.fullTilt;
    const raised = (height - (personal.heightZero ?? 0)) / WINGS.fullClimb;
    this.wings = {
      seen: true,
      out: span >= this.wingsNeeded,
      span,
      tilt,
      height,
      bank: clamp(tipped / Math.max(0.05, fullTip), -1, 1),
      climb: Math.abs(raised) < WINGS.deadZone ? 0 : clamp(raised, -1, 1),
    };
  }

  /** Which hands are held up high, for games played by raising a hand instead of jumping. */
  readHandsUp(frame) {
    for (const side of SIDES) {
      const arm = frame[side];
      const height = arm.armSeen ? (arm.shoulder.y - arm.wrist.y) / Math.max(0.05, this.torsoSize) : -1;
      this.handHeight[side] = height;
      const needed = this.handNeeded;
      if (height >= needed) this.handsUp[side] = true;
      else if (height <= needed - HAND_UP.comeDown) this.handsUp[side] = false;
    }
  }

  /** Whether the child is moving at all, which decides whether they're resting. */
  readMoving(frame, now) {
    const before = this.framesAgo(now, REST_FRAMES_SECONDS);
    if (!before) return;
    const seconds = now - before.t;
    let fastest = 0;
    for (const side of SIDES) {
      const w = frame[side].world;
      const was = before[side].world;
      fastest = Math.max(fastest, between(w.wrist, was.wrist), between(w.ankle, was.ankle));
    }
    this.moving = fastest / this.armLength / seconds >= MOVING_SPEED * this.size;
  }

  /** Copies the child's body onto the fighter, as a pose. */
  updatePose(frame) {
    const { pose } = this;
    const target = this.targetPose ?? (this.targetPose = makePose());
    const armReach = this.armLength;

    for (const [side, key] of [['left', 'L'], ['right', 'R']]) {
      const w = frame[side].world;
      let x = (w.wrist.x - w.shoulder.x) / armReach;
      let y = (w.wrist.y - w.shoulder.y) / armReach;
      let z = (w.wrist.z - w.shoulder.z) / armReach;
      // The fighter's arm is seen better a little out from the body.
      const length = hypot(x, y, z);
      if (length > 1) {
        x /= length;
        y /= length;
        z /= length;
      }
      if (!frame[side].armSeen) {
        x = key === 'L' ? 0.42 : -0.42;
        y = -0.82;
        z = 0.12;
      }
      target[`hand${key}X`] = x;
      target[`hand${key}Y`] = y;
      target[`hand${key}Z`] = z;
      // A raised or forward hand has its palm towards the opponent.
      const forwardOrUp = clamp((y + 0.3) * 1.6 + z * 0.9, 0, 1);
      target[`wrist${key}`] = -1.3 * forwardOrUp;
      const state = this.hands.stateOf(side, frame.t);
      target[`open${key}`] = state === 'closed' ? 0.15 : 1;

      // Feet follow the ankles, measured from the hips, in the fighter's own leg length.
      const legScale = (HIP_HEIGHT - 0.1) / Math.max(0.2, between(w.hip, w.knee) + between(w.knee, w.ankle));
      const rise = clamp(this.footRise(frame, side), 0, 1);
      target[`foot${key}X`] = clamp((w.ankle.x) * legScale, -0.7, 0.7);
      target[`foot${key}Y`] = frame[side].legSeen ? rise * HIP_HEIGHT * 1.3 : 0;
      target[`foot${key}Z`] = frame[side].legSeen ? clamp((w.ankle.z - frame.worldHips.z) * legScale, -0.6, 1) : 0;
    }

    const sink = clamp(this.sink ?? 0, -0.3, 0.8);
    target.hipDrop = clamp(sink, 0, 0.8) * HIP_HEIGHT * 0.9;
    // Jumps look bigger on the fighter than they are in the room, which is the fun of it.
    const hipsUp = clamp(-sink, 0, 0.3);
    const feetUp = Math.min(this.footRise(frame, 'left'), this.footRise(frame, 'right'));
    target.up = this.inAir ? clamp(Math.max(hipsUp, feetUp), 0, 0.5) * HIP_HEIGHT * 2.2 : 0;

    const up = {
      x: frame.worldShoulders.x - frame.worldHips.x,
      y: frame.worldShoulders.y - frame.worldHips.y,
      z: frame.worldShoulders.z - frame.worldHips.z,
    };
    target.pitch = clamp(Math.atan2(up.z, Math.max(0.05, up.y)), -0.5, 1.1);
    target.roll = clamp(Math.atan2(up.x, Math.max(0.05, up.y)), -0.6, 0.6);
    const shoulderLine = { x: frame.left.world.shoulder.x - frame.right.world.shoulder.x, z: frame.left.world.shoulder.z - frame.right.world.shoulder.z };
    target.twist = clamp(Math.atan2(shoulderLine.z, Math.max(0.05, shoulderLine.x)) * -1, -0.7, 0.7);

    // Smooth enough to hide tracker jitter, quick enough to feel like a mirror.
    const previousT = this.poseAt ?? frame.t - 0.033;
    const blend = 1 - Math.exp(-(frame.t - previousT) * 26);
    this.poseAt = frame.t;
    if (!this.hasPose) {
      Object.assign(pose, target);
      this.hasPose = true;
    } else {
      for (const key of Object.keys(pose)) pose[key] += (target[key] - pose[key]) * blend;
    }

    // Moving across the room moves the fighter on the mat.
    if (this.centre !== null && this.torsoSize > 0) {
      this.offset = clamp((frame.hips.x - this.centre) / this.torsoSize, -2, 2);
    }
  }
}
