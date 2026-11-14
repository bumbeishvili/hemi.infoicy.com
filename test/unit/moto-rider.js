// A pretend child for Moto Mountain's tests: a body that leans as the road asks, a moment late and with a
// wobble, read by the game's own Leaner. Nothing here is the game's: it only does what a child would.
import { LEAN, Leaner, Ride } from '../../games/moto-mountain/ride.js';

export const RAD = Math.PI / 180;
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
 * What the tracker would report for a body leaning to its right by so many degrees: 33 points, of which
 * the shoulders and hips are where a body's would be. whole leans all in a piece, as from the feet, and
 * otherwise it bends at the waist, which tips the shoulders twice as far as the line from the hips.
 */
export function bodyLeaning(degrees, { hips = true, whole = true, shoulders = true, aspect = 16 / 9, middle = 0.5 } = {}) {
  const lean = degrees * RAD;
  const trunk = whole ? lean : lean * (2 / 3);
  const tip = whole ? lean : lean * (4 / 3);
  const torso = 0.26;
  const halfWidth = 0.075;
  const hip = { x: middle * aspect, y: 0.66 };
  const top = { x: hip.x + Math.sin(trunk) * torso, y: hip.y - Math.cos(trunk) * torso };
  // In the mirror, the child's right is on the right. The tracker's picture is the other way round.
  const point = (x, y, visibility = 0.99) => ({ x: 1 - x / aspect, y, z: 0, visibility });
  const image = Array.from({ length: 33 }, () => point(hip.x, 0.5, 0.1));
  const sure = shoulders ? 0.99 : 0.2;
  image[11] = point(top.x - Math.cos(tip) * halfWidth, top.y - Math.sin(tip) * halfWidth, sure);
  image[12] = point(top.x + Math.cos(tip) * halfWidth, top.y + Math.sin(tip) * halfWidth, sure);
  // Hips the tracker can't see are a guess, and here a wrong one: off to one side of where they are.
  const guess = hips ? 0 : 0.09;
  image[23] = point(hip.x - 0.05 + guess, hip.y, hips ? 0.95 : 0.2);
  image[24] = point(hip.x + 0.05 + guess, hip.y, hips ? 0.95 : 0.2);
  return { image, world: image.map(() => ({ x: 0, y: 0, z: 0 })) };
}

/** A Leaner for a child who leaned so many degrees to each side in the warm-up, or skipped it. */
export function measuredLeaner(size = 'medium', best = 30) {
  const leaner = new Leaner({ size });
  if (best !== null) for (const side of ['left', 'right']) leaner.measured(side, best * RAD);
  return leaner;
}

/** How far a body has to lean, in radians, for the Leaner to read a share of a whole lean. */
export function angleFor(leaner, share) {
  if (!share) return leaner.zero;
  const reach = leaner.reachOf(share < 0 ? 'left' : 'right');
  const dead = Math.min(0.5, Math.max(LEAN.dead, (LEAN.deadLeast * RAD) / reach));
  return leaner.zero + Math.sign(share) * (dead + Math.abs(share) * (1 - dead)) * reach;
}

/**
 * Rides a game with a pretend child. lean(game, time) says what share of a whole lean they're trying for,
 * and without it they lean as the road needs, skill times as far. late is how long they take to react, and
 * wobble how many degrees their body shakes by. best is how far they leaned to each side in the warm-up, in
 * degrees, or null for a child who skipped it. Returns what happened.
 */
export function ride(options = {}, { lean = null, skill = 1, late = 0.35, wobble = 0.6, size = 'medium', best = 30, seconds = 900, until = null, seen = () => true, mates = () => [], seed = 5 } = {}) {
  const events = [];
  const leaner = options.leaner ?? measuredLeaner(size, best);
  const game = new Ride({ ...options, leaner, onEvent: (event) => events.push(event) });
  const noise = seeded(seed + 1000);
  const wanted = [];
  let body = leaner.zero;
  let time = 0;
  game.begin();
  while (game.state === 'riding' && time < seconds && !(until && until(game, time, events))) {
    wanted.push(lean ? lean(game, time) : game.needAt(game.s + game.v * 0.25) * skill);
    const share = wanted[Math.max(0, wanted.length - 1 - Math.round(late / STEP))] ?? 0;
    const target = angleFor(leaner, Math.max(-LEAN.most, Math.min(LEAN.most, share)));
    body += (target - body) * (1 - Math.exp(-5 * STEP));
    const shown = seen(game, time) ? body + (noise() - 0.5) * wobble * RAD : null;
    leaner.update(shown, STEP);
    game.update(STEP, leaner, mates(game, time));
    time += STEP;
  }
  return { game, leaner, events, time, types: events.map(({ type }) => type) };
}

/**
 * How a child who's looking where they're going leans on the wild ride: as the road needs, and across it to go
 * round the bales that are in the way, or to line up with the ramp before a row of them right across.
 */
export function looksAhead(game, { skill = 1, sees = 55, tricks = false } = {}) {
  // A trick: a deep lean for the first part of a jump, and upright again in time to land.
  if (tricks && game.air && game.air.t < 0.75) return 1;
  let want = game.needAt(game.s + game.v * 0.25) * skill;
  const ahead = (thing) => thing.at > game.s && thing.at - game.s < sees && !thing.gone && !thing.taken;
  const wall = game.things.find((thing) => thing.kind === 'barrier' && thing.wall && ahead(thing));
  const ramp = wall ? game.things.find((thing) => thing.kind === 'ramp' && thing.at < wall.at && wall.at - thing.at < 30 && thing.at > game.s) : null;
  const bales = game.things.find((thing) => thing.kind === 'barrier' && !thing.wall && ahead(thing));
  // A sheep or a scooter in the way, which the bike would stop for, or slow down behind.
  const where = (thing) => thing.pos ?? thing.at;
  const block = game.blockers.find((thing) => !thing.done && !thing.aside && where(thing) > game.s && where(thing) - game.s < sees && Math.abs(game.x - thing.x) < thing.reach + 0.6);
  let to = null;
  if (ramp) to = ramp.x;
  else if (bales && Math.abs(game.x - bales.x) < bales.reach + 0.7) to = bales.x + (bales.x > 0.1 ? -1 : bales.x < -0.1 ? 1 : game.x < 0 ? -1 : 1) * (bales.reach + 1);
  else if (block) to = block.x + (block.x > 0 ? -1 : 1) * (block.reach + 1);
  if (to !== null && !game.air) want += Math.max(-0.35, Math.min(0.35, (to - game.x) * 0.14));
  return want;
}

/** A ride laid out by hand: bends and things as given, on a road that's straight between them. */
export function planOf({ bends = [], things = [], hills = [], rivals = [], length = 400, rules = {} } = {}) {
  return {
    rules: { level: 1, cruise: 15, need: [0.5, 0.58], ...rules },
    bends: bends.map((bend, index) => ({ index, big: false, ...bend })),
    things: things.map((thing) => ({ ...thing })).sort((a, b) => a.at - b.at),
    hills: hills.map((hill) => ({ ...hill })),
    rivals: rivals.map((rival) => ({ skill: 1, lane: 0, from: 7, slips: [], ...rival })),
    length,
    snowFrom: null,
    stars: things.filter(({ kind }) => kind === 'star').length,
    snows: things.filter(({ kind }) => kind === 'snow').length,
  };
}
