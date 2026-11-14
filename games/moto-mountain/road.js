// Where Moto Mountain's road goes, in the world: the rules know a ride as distances along the road, and this
// turns them into places, for drawing. A bend that needs more lean is a tighter one, so what a child sees
// coming is what they'll have to do. No screen in this file, so it runs in the unit tests.
//
// The world is in metres, with y up. The road sets off towards -z, and x is to the right of that.
export const STEP = 2; // Metres of road between one place worked out and the next.
// The bend that needs a whole lean is this tight: one over its radius in metres. Others are in proportion.
export const FULL_CURVE = 1 / 33;
// A bend comes on over this many metres, and goes off again over as many, unless it says otherwise: a tighter
// bend, or one on a faster road, takes longer over it, so there's as long to lean into it.
export const BEND_RAMP = 16;
const BEFORE = 80; // Road behind the start line,
const AFTER = 150; // and beyond the finish, where the bike rolls up to the hut.
const SLOPE = 0.055; // How steeply the road climbs, most of the time,
const SLOPE_WAVE = 0.35; // which varies by this share,
const SLOPE_EVERY = 85; // over about this many metres.
const HASH_CELL = 24;

const smooth = (share) => {
  const t = Math.min(1, Math.max(0, share));
  return t * t * (3 - 2 * t);
};

/** How much of a bend's lean is needed at a place in it: it comes on and goes off smoothly. */
export function bendShare(bend, s) {
  if (s <= bend.from || s >= bend.to) return 0;
  const ramp = bend.ramp ?? BEND_RAMP;
  return smooth((s - bend.from) / ramp) * smooth((bend.to - s) / ramp);
}

/** How sharply the road turns at a place: one over the radius in metres, with a turn to the right positive. */
export function curveAt(plan, s) {
  for (const bend of plan.bends) if (s > bend.from && s < bend.to) return bend.turn * bend.need * bendShare(bend, s) * FULL_CURVE;
  return 0;
}

const HILL_EASE = 10; // A hill's way up starts, and its way down ends, over this many metres.

/**
 * How steeply one hill has the road climbing at a place, or falling, which is less than nothing. A hill is
 * { at, up, down, rise, drop, round }: its top is at metres along the road, it's rise metres higher than where
 * its way up started, up metres before, and the road comes drop metres down again over the down metres after.
 * It goes over the top in round metres: the fewer, the sharper, and the sooner a bike leaves the ground there.
 */
export function hillSlope(hill, s) {
  const { at, up, down, rise, drop, round = 5 } = hill;
  if (s <= at - up || s >= at + down) return 0;
  // It goes over the top within itself, so that the road's climb never changes all at once.
  const half = Math.min(round / 2, up, down);
  // A short, sharp side, like a river's bank, eases in and out over less.
  if (s < at - half) return (rise / up) * smooth((s - (at - up)) / Math.min(HILL_EASE, up / 2));
  if (s > at + half) return -(drop / down) * smooth((at + down - s) / Math.min(HILL_EASE, down / 2));
  const over = (s - (at - half)) / (2 * half);
  return (rise / up) * (1 - over) - (drop / down) * over;
}

/** How steeply the hills have the road climbing at a place, apart from its steady climb up the mountain. */
export function hillsAt(plan, s) {
  let slope = 0;
  for (const hill of plan.hills ?? []) slope += hillSlope(hill, s);
  return slope;
}

/**
 * How steeply the road climbs at a place: steadily up the mountain, and up and down its hills. It's level
 * before the start and comes level again at the top.
 */
export function slopeAt(plan, s) {
  const into = Math.min(1, Math.max(0, s / 40)) * Math.min(1, Math.max(0, (plan.length + 30 - s) / 60));
  return SLOPE * (1 + SLOPE_WAVE * Math.sin(s / SLOPE_EVERY)) * into + hillsAt(plan, s);
}

/**
 * The road as a line of places, STEP metres apart, from a little behind the start to beyond the finish.
 * Each has where it is, which way the road is heading there, and how much lean the road needs.
 */
export function shapeOf(plan) {
  const count = Math.ceil((BEFORE + plan.length + AFTER) / STEP) + 1;
  const xs = new Float64Array(count);
  const ys = new Float64Array(count);
  const zs = new Float64Array(count);
  const headings = new Float64Array(count);
  // Worked out forwards from the start line, and backwards from it for the road behind.
  const first = Math.round(BEFORE / STEP);
  let heading = 0;
  for (let i = first + 1; i < count; i += 1) {
    const s = (i - first) * STEP;
    const turnOver = curveAt(plan, s - STEP / 2) * STEP;
    const middle = heading + turnOver / 2;
    xs[i] = xs[i - 1] + Math.sin(middle) * STEP;
    zs[i] = zs[i - 1] - Math.cos(middle) * STEP;
    ys[i] = ys[i - 1] + slopeAt(plan, s - STEP / 2) * STEP;
    heading += turnOver;
    headings[i] = heading;
  }
  for (let i = first - 1; i >= 0; i -= 1) {
    xs[i] = xs[i + 1];
    zs[i] = zs[i + 1] + STEP;
    ys[i] = 0;
  }
  const shape = { plan, count, first, from: -first * STEP, to: (count - 1 - first) * STEP, xs, ys, zs, headings, length: plan.length };
  shape.hash = hashOf(shape);
  return shape;
}

/** Where a place on the road is: s metres along it and across metres to the right of its middle. */
export function placeAt(shape, s, across = 0, out = {}) {
  const at = Math.min(shape.count - 1.0001, Math.max(0, (s - shape.from) / STEP));
  const i = Math.floor(at);
  const t = at - i;
  const heading = shape.headings[i] + (shape.headings[i + 1] - shape.headings[i]) * t;
  out.x = shape.xs[i] + (shape.xs[i + 1] - shape.xs[i]) * t + Math.cos(heading) * across;
  out.y = shape.ys[i] + (shape.ys[i + 1] - shape.ys[i]) * t;
  out.z = shape.zs[i] + (shape.zs[i + 1] - shape.zs[i]) * t + Math.sin(heading) * across;
  out.heading = heading;
  out.slope = (shape.ys[i + 1] - shape.ys[i]) / STEP;
  return out;
}

const cellOf = (x, z) => `${Math.floor(x / HASH_CELL)},${Math.floor(z / HASH_CELL)}`;

/** The road's places sorted into squares of ground, for finding the nearest one to anywhere quickly. */
function hashOf(shape) {
  const cells = new Map();
  for (let i = 0; i < shape.count; i += 1) {
    const key = cellOf(shape.xs[i], shape.zs[i]);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(i);
  }
  return cells;
}

/**
 * The nearest place on the road to a spot on the ground, looking no further than reach metres: its number
 * along the road and how far away it is, or null with no road that near.
 */
export function nearestTo(shape, x, z, reach = 96) {
  const span = Math.ceil(reach / HASH_CELL);
  const cx = Math.floor(x / HASH_CELL);
  const cz = Math.floor(z / HASH_CELL);
  let best = -1;
  let least = reach * reach;
  for (let dx = -span; dx <= span; dx += 1) {
    for (let dz = -span; dz <= span; dz += 1) {
      const list = shape.hash.get(`${cx + dx},${cz + dz}`);
      if (!list) continue;
      for (const i of list) {
        const far = (shape.xs[i] - x) ** 2 + (shape.zs[i] - z) ** 2;
        if (far < least) {
          least = far;
          best = i;
        }
      }
    }
  }
  if (best < 0) return null;
  return { index: best, s: shape.from + best * STEP, distance: Math.sqrt(least), y: shape.ys[best] };
}

/**
 * The nearest the road comes to itself, between places more than apart metres from each other along it. A
 * road that never comes close to itself can't cross itself, and leaves room for the hillside between.
 */
export function nearestApproach(shape, apart = 150) {
  let least = Infinity;
  const skip = Math.round(apart / STEP);
  for (let i = 0; i < shape.count; i += 4) {
    for (let j = i + skip; j < shape.count; j += 4) {
      const far = Math.hypot(shape.xs[i] - shape.xs[j], shape.zs[i] - shape.zs[j]);
      if (far < least) least = far;
    }
  }
  return least;
}
