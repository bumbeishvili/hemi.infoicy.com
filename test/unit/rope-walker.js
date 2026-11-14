// A pretend child for Rooftop Rope's tests: feet that go where the test says, a moment late and with a wobble,
// read by the game's own Lifter. Nothing here is the game's: it only does what a child would.
import { LIFT, Lifter, Walk } from '../../games/rooftop-rope/walk.js';

export const STEP = 1 / 30;

/** Random numbers that come out the same every time, so a test that passes keeps passing. */
export function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * What the tracker would report for a body standing in the picture with one foot lifted: 33 points, of which
 * the nose and the ankles are where a body's would be. right and left are how high each foot is off the floor,
 * as a share of the body's height. tall is how much of the picture the body takes up.
 */
export function bodyStanding({ left = 0, right = 0, tall = 0.7, feet = true, nose = true, forward = 0 } = {}) {
  const floor = 0.9;
  const point = (x, y, visibility = 0.99) => ({ x, y, z: 0, visibility });
  const image = Array.from({ length: 33 }, () => point(0.5, 0.5, 0.1));
  image[0] = point(0.5, floor - tall, nose ? 0.99 : 0.2);
  // A foot that's a little in front of the other is a little lower in the picture.
  image[27] = point(0.53, floor - left * tall, feet ? 0.95 : 0.2);
  image[28] = point(0.47, floor - right * tall + forward * tall, feet ? 0.95 : 0.2);
  return { image, world: image.map(() => ({ x: 0, y: 0, z: 0 })) };
}

/** A Lifter for a child who lifted each foot so high in the warm-up, as a share of their height, or skipped it. */
export function measuredLifter(size = 'medium', best = 0.3) {
  const lifter = new Lifter({ size });
  if (best !== null) for (const side of ['left', 'right']) lifter.measured(side, best);
  return lifter;
}

/** How much higher the right foot has to be than the left for the Lifter to read a share of a whole lift with a foot. */
export function valueFor(lifter, side, share) {
  if (!share) return lifter.zero;
  const height = LIFT.dead + share * (lifter.reachOf(side) - LIFT.dead);
  return lifter.zero + (side === 'right' ? height : -height);
}

/**
 * Plays a game with a pretend child. feet(game, time) says what they're trying for: { foot, share }, the foot
 * and how high as a share of a whole lift with it, or { foot, height }, how high as a share of their own height,
 * whatever a whole lift is, or null for both feet down. Without it they lift the foot
 * the rope asks for, to height times a whole lift, and rest a second on every rooftop. late is how long they
 * take to react, and wobble how much their feet shake by, as a share of their height. Returns what happened.
 */
export function walk(options = {}, { feet = null, height = 1.05, late = 0.3, wobble = 0.004, size = 'medium', best = 0.3, seconds = 900, until = null, seen = () => true, mates = () => [], seed = 5 } = {}) {
  const events = [];
  const lifter = options.lifter ?? measuredLifter(size, best);
  const game = new Walk({ ...options, lifter, onEvent: (event) => events.push(event) });
  const noise = seeded(seed + 1000);
  const wanted = [];
  let value = lifter.zero;
  let time = 0;
  game.begin();
  while (game.state !== 'finished' && game.state !== 'lost' && time < seconds && !(until && until(game, time, events))) {
    let want = null;
    if (feet) want = feet(game, time);
    else if (game.state === 'roof' || game.state === 'rope') {
      const resting = game.light && game.light.left > 0;
      want = resting || (game.state === 'roof' && game.idle < 1) ? null : { foot: game.asked, share: height };
    }
    wanted.push(want);
    const now = wanted[Math.max(0, wanted.length - 1 - Math.round(late / STEP))] ?? null;
    const target = !now ? lifter.zero : now.height === undefined ? valueFor(lifter, now.foot, now.share) : lifter.zero + (now.foot === 'right' ? now.height : -now.height);
    value += (target - value) * (1 - Math.exp(-6 * STEP));
    lifter.update(seen(game, time) ? value + (noise() - 0.5) * wobble : null, STEP);
    game.update(STEP, lifter, mates(game, time));
    time += STEP;
  }
  return { game, lifter, events, time, types: events.map(({ type }) => type) };
}

/** A game laid out by hand: ropes as given, each crossed in so many seconds on the foot it says. */
export function planOf(ropes = [{}], rules = {}) {
  const list = ropes.map((rope, index) => ({ index, leg: 'right', seconds: 4, long: false, climb: false, things: [], ...rope }));
  const tally = (kind) => list.reduce((sum, rope) => sum + rope.things.filter((thing) => thing.kind === kind).length, 0);
  return { rules: { level: 1, hold: 1, ...rules }, ropes: list, stars: tally('star'), balloons: tally('balloon'), birds: tally('bird'), lights: tally('light') };
}
