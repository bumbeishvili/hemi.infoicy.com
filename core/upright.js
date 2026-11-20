// Whether the hand in play is held up, as for a high five, for a game played by showing the hand to something, as
// Giraffe's Goal is: its fingers up, or out to the side, rather than hanging down, and the hand not tipped over
// towards the camera. With hemiplegia the wrist drops as the fingers open, and many children can only open the hand
// that way. A hand that's open and held up like this has its wrist straight, or bent back, which no other game asks
// for.
//
// Two things in the tracker's points say so, both from the picture. Which way the palm points, from the wrist to the
// middle finger's knuckle. And how wide the knuckles look for how long the palm is: a hand tipped towards the
// camera, or away from it, looks shorter and just as wide. Hands held flat to the camera measured 0.66 to 0.77, and
// a photo of one squeezed to 70% of its height, as a hand tipped 46° looks, read as tipped 40° to 48°. The reading
// stops rising at about 60°, so a limit has to be well under that. The tracker's 3D points are no use for this: for
// the same flat hands they read anything from 5° to 40° of tip.
//
// How flat is flat is the hand's own, from how it's shown in the hand check, if that's in the range real hands have.
// A child whose wrist drops will often make the hand check that way too, and that looks wider than any flat hand
// does, so then it's the usual hand's, and the wrist still has to come up. A dropped hand reads 54° to 61° then,
// which is as far as the reading goes, so a little held up has to be well under that. A check made with the hand
// turned side-on looks narrower than any flat hand, and that's the usual hand's too.
//
// No DOM and no camera here, so it runs against real hands from photos in test/unit/upright.test.js.

export const UPRIGHT = {
  // Which way the fingers point, as the cosine of the angle from straight up: 1 is up, 0 out to the side, -1 down.
  // A hand reaching far out to the side points out, and one reaching across the body can point a little down, so
  // anything from up to 10° below level counts. Once it's held up it has to hang 17° below level to stop.
  lowest: -0.17,
  lowestHeld: -0.3,
  // Once it's held up, the hand can tip this many degrees more before it isn't.
  slack: 5,
  // It's held up after this long of looking it, and not after this long of not: quick to say yes, slower to say no,
  // so a wobble doesn't lose a save.
  heldMs: 90,
  lostMs: 220,
  smoothMs: 70,
  // How wide a hand held flat to the camera looks, for the length of its palm, until one has been seen in a hand
  // check, and the range one from a check has to be in to be believed. Real ones measured 0.66 to 0.77, on adults,
  // and a child's palm is a little wider for its length, so there's room above that.
  defaultWide: 0.72,
  wideLow: 0.6,
  wideHigh: 0.86,
  // A hand the tracker loses for a moment is still held up for this long, as the hand monitor keeps it open, and one
  // back after freshAfterMs out of sight is read afresh.
  graceMs: 250,
  freshAfterMs: 400,
};

// How far the hand can be tipped towards the camera and still count as held up, in degrees, as a grown-up chooses:
// a little asks only that the wrist isn't right down, and right up asks for a hand held flat to the camera.
export const TIP_LIMITS = { little: 50, more: 40, upright: 30 };

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/**
 * The two measures, from one hand's points in the mirror picture, as the hand monitor gives them (x and y as shares
 * of the picture's width and height), and the picture's aspect: up, from -1 to 1, which way the fingers point, and
 * wide, how wide the knuckles look for the length of the palm.
 */
export function handPosture(image, aspect) {
  const at = (index) => ({ x: image[index].x * aspect, y: image[index].y });
  const [wrist, index, middle, little] = [at(0), at(5), at(9), at(17)];
  const palm = Math.hypot(middle.x - wrist.x, middle.y - wrist.y);
  if (!(palm > 0)) return { up: 0, wide: 0 };
  return {
    up: (wrist.y - middle.y) / palm,
    wide: Math.hypot(index.x - little.x, index.y - little.y) / palm,
  };
}

/** How far a hand that looks this wide is tipped, in degrees, when it looks flat wide held flat to the camera. */
export function tipFor(wide, flat) {
  if (!(wide > flat)) return 0;
  return (Math.acos(clamp(flat / wide, 0, 1)) * 180) / Math.PI;
}

export class UprightReader {
  constructor() {
    this.flat = UPRIGHT.defaultWide;
    this.checked = false;
    this.samples = [];
    this.reset();
  }

  /** A new round, or the hand back: nothing is known of how it's held. */
  reset() {
    this.up = null;
    this.wide = null;
    this.tip = 0;
    this.held = false;
    this.why = 'missing';
    this.pendingSince = null;
    this.lastAt = null;
  }

  /** In the hand check: how the hand looks, held up to the camera. */
  sample(image, aspect) {
    if (!image) return;
    const { wide } = handPosture(image, aspect);
    if (wide > 0) this.samples.push(wide);
  }

  /** After the hand check: how wide this hand looks held flat is the middle of what was seen, if that's a hand's. */
  calibrate() {
    const { samples } = this;
    if (samples.length >= 5) {
      const sorted = [...samples].sort((a, b) => a - b);
      const middle = sorted[Math.floor(sorted.length / 2)];
      const believed = middle >= UPRIGHT.wideLow && middle <= UPRIGHT.wideHigh;
      this.flat = believed ? middle : UPRIGHT.defaultWide;
      this.checked = believed;
    }
    this.samples = [];
    this.reset();
  }

  /**
   * One frame: the hand's points, or null when it can't be seen, the picture's aspect, the time now in milliseconds
   * and how far it can be tipped, in degrees (see TIP_LIMITS). Returns this, with held, whether it's held up, up and
   * tip, and why not: 'missing', 'down' for fingers hanging down, 'tipped' for a hand tipped over, or null.
   */
  update(image, aspect, now, limit = TIP_LIMITS.little) {
    if (!image) {
      const gone = this.lastAt === null ? Infinity : now - this.lastAt;
      if (gone > UPRIGHT.freshAfterMs) this.reset();
      else if (gone > UPRIGHT.graceMs) {
        this.held = false;
        this.why = 'missing';
        this.pendingSince = null;
      }
      return this;
    }
    const { up, wide } = handPosture(image, aspect);
    const dt = this.lastAt === null ? Infinity : now - this.lastAt;
    this.lastAt = now;
    const blend = this.up === null ? 1 : 1 - Math.exp(-dt / UPRIGHT.smoothMs);
    this.up = this.up === null ? up : this.up + (up - this.up) * blend;
    this.wide = this.wide === null ? wide : this.wide + (wide - this.wide) * blend;
    this.tip = tipFor(this.wide, this.flat);

    const pointing = this.up >= (this.held ? UPRIGHT.lowestHeld : UPRIGHT.lowest);
    const flat = this.tip <= limit + (this.held ? UPRIGHT.slack : 0);
    const looks = pointing && flat;
    this.why = !pointing ? 'down' : !flat ? 'tipped' : null;
    if (looks === this.held) {
      this.pendingSince = null;
    } else {
      if (this.pendingSince === null) this.pendingSince = now;
      if (now - this.pendingSince >= (looks ? UPRIGHT.heldMs : UPRIGHT.lostMs)) {
        this.held = looks;
        this.pendingSince = null;
      }
    }
    return this;
  }
}
