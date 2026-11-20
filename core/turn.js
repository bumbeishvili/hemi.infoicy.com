// How far the hand in play is turned over, for a game played by turning the hand, as Giraffe's Garden is: from the
// palm facing the camera round to the back of the hand, which for a hand held up is turning the forearm, the
// movement that's hardest of all with hemiplegia.
//
// It's measured from how the hand starts, as it's shown in the hand check: turning it away from that, whichever way
// round it was, is turning it over, so a hand that rests the other way round still has to turn to play. Two things
// in the tracker's points say how far it has gone. How wide the knuckles look, for how long the palm is, which
// narrows as the hand turns side-on and widens again as the other side comes round. And which side of the hand
// faces the camera, from which way round the first and little fingers' knuckles are from the wrist, which swaps as
// it passes side-on. The tracker names the hand rightly from either side.
//
// Turning back always counts at once. Turned over is what pours, so the reading is slow to say a hand has gone
// past side-on and quick to say it has come back: back on its starting side, a fainter look is enough, and the
// tracker's own 3D points, if they clearly face the camera the way the hand started, overrule a hand that only looks
// the other way round.
//
// No DOM and no camera here, so it runs against real hands from photos in test/unit/turn.test.js.

export const TURN = {
  // Past side-on only counts beyond this, and once it has lasted flipMs. A hand nearly side-on can look like
  // either: a palm squeezed to 30% of its width read as its back at 0.30, while the back itself, at 45% of its width,
  // was 0.35.
  sure: 0.33,
  flipMs: 100,
  // Back on the side it started, this much is enough, at once.
  backSure: 0.12,
  // The tracker's 3D points facing the camera this nearly the way the hand started (as the cosine of the angle,
  // about 50°) say it's on that side, whatever its look. On photos facing the camera they read 14° to 41° off.
  worldSure: 0.64,
  smoothMs: 60,
  // How wide a hand facing the camera looks, for the length of its palm, until one has been seen in a hand check.
  // Real ones measured 0.66 to 0.84. One from a check is kept in this range, so a check made with the hand side-on
  // can't make a turn impossible.
  defaultWide: 0.7,
  wideLow: 0.5,
  wideHigh: 0.95,
  // A hand back after this long out of sight is read afresh, whichever side it shows.
  freshAfterMs: 400,
};

// How far the hand has to turn to pour, in degrees, as a grown-up chooses: a little, which narrows the palm to about
// four fifths of its width, more, to half way to side-on and beyond, or right over, past side-on until the back of
// the hand shows. On photos a palm squeezed to 80% of its width read as 35°, to 60% as 50°, and the back of the hand
// at 45% of its width as 120°.
export const TURN_TARGETS = { little: 35, more: 50, over: 110 };
// A little water comes from this share of the turn that's wanted, and all of it there. Below it, none at all, so a
// hand turned back stops it.
const TRICKLE_FROM = 0.85;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/**
 * The two measures, from one hand's points in the mirror picture, as the hand monitor gives them (x and y as shares
 * of the picture's width and height), and the picture's aspect: side, from -1 to 1, which way round the hand is,
 * and wide, how wide its knuckles look for the length of its palm.
 */
export function handFacing(image, aspect) {
  const at = (index) => ({ x: image[index].x * aspect, y: image[index].y });
  const [wrist, index, middle, little] = [at(0), at(5), at(9), at(17)];
  const u = { x: index.x - wrist.x, y: index.y - wrist.y };
  const v = { x: little.x - wrist.x, y: little.y - wrist.y };
  const lengths = Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y);
  const palm = Math.hypot(middle.x - wrist.x, middle.y - wrist.y);
  return {
    side: lengths > 0 ? (u.x * v.y - u.y * v.x) / lengths : 0,
    wide: palm > 0 ? Math.hypot(index.x - little.x, index.y - little.y) / palm : 0,
  };
}

/**
 * Which way the palm faces, from the tracker's 3D points: the cosine of the angle between the palm and the camera,
 * from -1 to 1, its sign saying which side faces it, or null without them.
 */
export function worldFacing(world) {
  if (!world?.[17]) return null;
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
  const u = sub(world[5], world[0]);
  const v = sub(world[17], world[0]);
  const n = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
  const length = Math.hypot(n.x, n.y, n.z);
  return length > 0 ? n.z / length : null;
}

/** How much water a turn of this many degrees gives, from 0 to 1, when a turn of target is wanted. */
export function flowFor(degrees, target) {
  if (degrees >= target) return 1;
  return clamp((degrees - target * TRICKLE_FROM) / (target * (1 - TRICKLE_FROM)), 0, 1);
}

export class TurnReader {
  constructor() {
    this.start = { sign: 1, wide: TURN.defaultWide, world: 0, checked: false };
    this.samples = [];
    this.reset();
  }

  /** A new round, or the hand back: the turn starts again from how the hand starts. */
  reset() {
    this.sign = this.start.sign;
    this.flipSince = null;
    this.degrees = 0;
    this.lastAt = null;
    this.seenAt = null;
  }

  /** In the hand check: how the hand is held, to learn how it starts. world is its 3D points, if there are any. */
  sample(image, aspect, world = null) {
    if (image) this.samples.push({ ...handFacing(image, aspect), world: worldFacing(world) });
  }

  /**
   * After the hand check: the side the hand showed the camera most, and how wide it usually looked then, are where
   * turning starts from. The usual width, not the widest, so a hand held as it usually is reads as not turned. With
   * too little seen, as with no check, it stays as it was.
   */
  calibrate() {
    const sure = this.samples.filter(({ side }) => Math.abs(side) >= TURN.sure);
    this.samples = [];
    if (sure.length >= 5) {
      const sign = sure.filter(({ side }) => side > 0).length * 2 >= sure.length ? 1 : -1;
      const mine = sure.filter(({ side }) => Math.sign(side) === sign);
      const widths = mine.map(({ wide }) => wide).sort((a, b) => a - b);
      // Which way the 3D points face on that side, which the tracker gives the same way each time for one hand.
      const worlds = mine.map(({ world }) => world).filter((value) => value !== null);
      const world = worlds.length ? Math.sign(worlds.reduce((sum, value) => sum + value, 0)) : 0;
      this.start = { sign, wide: clamp(widths[Math.floor(widths.length / 2)], TURN.wideLow, TURN.wideHigh), world, checked: true };
    }
    this.reset();
  }

  /**
   * One frame. image is the hand's points in the mirror picture, or null with no new reading of it, world its 3D
   * points if there are any, and now the time in milliseconds. Returns how far it's turned, in degrees: 0 as it
   * started, 90 side-on, 180 right over.
   */
  update(image, aspect, now, world = null) {
    if (!image) return this.degrees;
    const fresh = this.seenAt === null || now - this.seenAt > TURN.freshAfterMs;
    this.seenAt = now;
    const { side, wide } = handFacing(image, aspect);
    const home = this.start.sign;
    const onHome = side * home;
    // The 3D points clearly facing the camera the way the hand started.
    const facing = worldFacing(world);
    const worldHome = this.start.world !== 0 && facing !== null && facing * this.start.world >= TURN.worldSure;
    if (fresh) {
      // Back after a while, it's whichever it clearly is now, and otherwise as it started.
      this.sign = onHome <= -TURN.sure && !worldHome ? -home : home;
      this.flipSince = null;
    } else if (this.sign !== home) {
      // Past side-on: back on its starting side counts at once, from a fainter look, or from the 3D points.
      if (onHome >= TURN.backSure || worldHome) this.sign = home;
    } else if (onHome <= -TURN.sure && !worldHome) {
      // On its starting side: past side-on only once it's clear, and has lasted a moment.
      this.flipSince ??= now;
      if (now - this.flipSince >= TURN.flipMs) {
        this.sign = -home;
        this.flipSince = null;
      }
    } else {
      this.flipSince = null;
    }
    const angle = (Math.acos(clamp(wide / this.start.wide, 0, 1)) * 180) / Math.PI;
    const turned = this.sign === home ? angle : 180 - angle;
    const dt = this.lastAt === null || fresh ? null : now - this.lastAt;
    this.lastAt = now;
    this.degrees = dt === null ? turned : this.degrees + (turned - this.degrees) * (1 - Math.exp(-dt / TURN.smoothMs));
    return this.degrees;
  }
}
