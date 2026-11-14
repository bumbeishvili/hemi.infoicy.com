// The rules of Frost Arena. No screen, camera or sound in this file, so it all runs in the unit tests.
//
// A small snowy yard with crates and containers to fight round, a team at each end, and a match of tag with
// rifles: the player's team in blue, with Giraffe on it, against the computer's in red. It's seen through the
// player's own eyes, and played the way a shooter is played with two thumbs on a phone, with two hands in the air
// instead: one hand on a stick, to walk, sidestep, back away and sprint, and the other looking round, with its
// trigger. What the hands are asking for is worked out in controls.js. Here it's what a match makes of it.
//
// Shots go where the sights are, and nowhere else: each one is a line from the player's eye, a little way off
// the middle of the sights by how steady the rifle is. It's steadiest standing still with the first shot, and
// opens up with every shot after it, with walking, and most of all with sprinting, and the rifle kicks the view
// up as it fires. There are magazines without end, but each holds thirty rounds, and changing one takes a moment.
//
// Nobody gets hurt. A player who's been hit enough is tagged out: they sit down, and are back at their own end a
// few seconds later. The player's team wins with the number of tags chosen, and the other team, on Medium and
// Tough, by tagging the player that many times. With neither hand in the picture it's paused: everyone the
// computer plays stops and waits, and nothing can happen.
import { ramp, stepsAt } from '../../core/levels.js';

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const between = (random, [low, high]) => low + random() * (high - low);
/** The shortest way round from one direction to another. */
export const turnBetween = (to, from) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
/** Which way it is from one place to another. Heading 0 is up the yard, along -z, and turning right adds to it. */
export const headingTo = (dx, dz) => Math.atan2(dx, -dz);
export const forwardOf = (heading) => ({ x: Math.sin(heading), z: -Math.cos(heading) });
const gapBetween = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const degrees = (value) => (value * Math.PI) / 180;

/* ---------- the yard ---------- */

// The yard is 44 across and 30 from end to end, with a team's end at each: blue's is the near one, and red's the far.
export const YARD = { halfX: 22, halfZ: 15 };
export const BODY = 0.45; // How wide a player is, from the middle, to things in the way.

// What's in the way, as { x, z, w, d, h, kind }: where its middle is, how wide and deep it is, and how tall.
// One half of the yard is listed, and the other is the same turned half way round, so neither end has it
// easier. The long container in the middle is its own other half. Everything is taller than a player, so nobody
// behind something can be seen over it, or hit over it: what hides someone covers them.
const HALF_YARD = [
  { x: -10, z: 1.5, w: 2.6, d: 7, h: 2.6, kind: 'container' },
  { x: -5, z: -6, w: 2.4, d: 2.4, h: 2, kind: 'crate' },
  { x: -17, z: -6, w: 5, d: 1.2, h: 2.1, kind: 'wall' },
  { x: -15.5, z: 7, w: 3, d: 3, h: 2.4, kind: 'crates' },
  { x: -3.5, z: 10.4, w: 4, d: 1.2, h: 2, kind: 'wall' },
];
export const BLOCKS = [
  { x: 0, z: 0, w: 8, d: 2.6, h: 2.6, kind: 'container' },
  ...HALF_YARD,
  ...HALF_YARD.map((block) => ({ ...block, x: -block.x, z: -block.z })),
];

// Where each team comes in, and comes back to: places along its own end, facing the other. Three are enough for
// a match by oneself, and the rest are for friends: see team.js.
export const BASES = [
  { z: 13, heading: 0, spots: [0, -6, 6, -12, 12] },
  { z: -13, heading: Math.PI, spots: [0, 6, -6, 12, -12] },
];
// Places worth going to, for a player the computer plays: the middle, the alleys and each end.
const HAUNTS = [
  { x: 0, z: 4.5 }, { x: 0, z: -4.5 }, { x: -6.5, z: 0 }, { x: 6.5, z: 0 },
  { x: -20, z: 0 }, { x: 20, z: 0 }, { x: -13, z: -10 }, { x: 13, z: 10 },
  { x: -8, z: 9 }, { x: 8, z: -9 }, { x: 13, z: -2 }, { x: -13, z: 2 },
];

const inside = (block, x, z, grow) => Math.abs(x - block.x) < block.w / 2 + grow && Math.abs(z - block.z) < block.d / 2 + grow;

/** Whether a player can stand at a place: inside the yard, and clear of everything in the way. */
export function freeAt(x, z, body = BODY) {
  if (Math.abs(x) > YARD.halfX - body || Math.abs(z) > YARD.halfZ - body) return false;
  return !BLOCKS.some((block) => inside(block, x, z, body));
}

/** Whether there's a clear line between two places, with nothing in the way: what can be seen, and hit. */
export function clearLine(from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  for (const block of BLOCKS) {
    // Where along the line it goes into and comes out of the block's width, and its depth.
    let enter = 0;
    let leave = 1;
    let missed = false;
    for (const [start, step, middle, half] of [[from.x, dx, block.x, block.w / 2], [from.z, dz, block.z, block.d / 2]]) {
      if (Math.abs(step) < 1e-9) {
        if (Math.abs(start - middle) >= half) missed = true;
        continue;
      }
      const a = (middle - half - start) / step;
      const b = (middle + half - start) / step;
      enter = Math.max(enter, Math.min(a, b));
      leave = Math.min(leave, Math.max(a, b));
    }
    if (!missed && enter < leave) return false;
  }
  return true;
}

/** How far a shot goes along a heading before it meets something: a block, or the yard's fence. */
export function reachAlong(from, heading, most = 60) {
  const forward = forwardOf(heading);
  let near = most;
  const edges = [[forward.x, YARD.halfX - from.x, -YARD.halfX - from.x], [forward.z, YARD.halfZ - from.z, -YARD.halfZ - from.z]];
  for (const [step, high, low] of edges) {
    if (Math.abs(step) < 1e-9) continue;
    near = Math.min(near, (step > 0 ? high : low) / step);
  }
  for (let away = 0.5; away < near; away += 0.25) {
    const x = from.x + forward.x * away;
    const z = from.z + forward.z * away;
    if (BLOCKS.some((block) => inside(block, x, z, 0))) return away;
  }
  return Math.max(0, near);
}

/**
 * Where someone who has walked to a place really ends up: kept inside the fence, and pushed back out of anything
 * they've walked into, by the shortest way, so that walking into something at a slant slides along it. Clear of
 * something means what it means in freeAt: the same for the player as for those the computer plays.
 */
export function keptClear(x, z, body = BODY) {
  const fenced = (at) => ({ x: clamp(at.x, -YARD.halfX + body, YARD.halfX - body), z: clamp(at.z, -YARD.halfZ + body, YARD.halfZ - body) });
  let at = fenced({ x, z });
  // Twice round, for a corner between two things.
  for (let pass = 0; pass < 2; pass += 1) {
    for (const block of BLOCKS) {
      const dx = at.x - block.x;
      const dz = at.z - block.z;
      // How far into it they are, across and along: none, if they're clear of it.
      const inX = block.w / 2 + body - Math.abs(dx);
      const inZ = block.d / 2 + body - Math.abs(dz);
      if (inX <= 0 || inZ <= 0) continue;
      // Out through the nearer side.
      if (inX < inZ) at = { x: block.x + Math.sign(dx || 1) * (block.w / 2 + body), z: at.z };
      else at = { x: at.x, z: block.z + Math.sign(dz || 1) * (block.d / 2 + body) };
    }
    at = fenced(at);
  }
  return at;
}

/** Which way a shot goes, as a step of length one: yaw is the heading, and pitch how far up. */
export const aimOf = (yaw, pitch = 0) => ({ x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) });

/**
 * How far a shot from a place, going a way, gets before it meets something that isn't a player: a block, the
 * snow, the fence, or as far as a shot goes at all. Returns how far, and what it met.
 */
export function shotReach(from, way, most = RANGE) {
  let far = most;
  let what = 'sky';
  // The snow.
  if (way.y < -1e-9 && -from.y / way.y < far) {
    far = -from.y / way.y;
    what = 'snow';
  }
  // The fence, if the shot is still below the top of it when it gets there. Over it, it carries on.
  for (const [start, step, edge] of [[from.x, way.x, YARD.halfX], [from.z, way.z, YARD.halfZ]]) {
    if (Math.abs(step) < 1e-9) continue;
    const reach = ((step > 0 ? edge : -edge) - start) / step;
    if (reach > 0 && reach < far && from.y + way.y * reach <= FENCE) {
      far = reach;
      what = 'fence';
    }
  }
  // Anything in the way: where the shot goes into its width, its depth and its height, and comes out.
  for (const block of BLOCKS) {
    let enter = 0;
    let leave = far;
    let missed = false;
    for (const [start, step, low, high] of [[from.x, way.x, block.x - block.w / 2, block.x + block.w / 2], [from.y, way.y, 0, block.h], [from.z, way.z, block.z - block.d / 2, block.z + block.d / 2]]) {
      if (Math.abs(step) < 1e-9) {
        if (start <= low || start >= high) missed = true;
        continue;
      }
      const a = (low - start) / step;
      const b = (high - start) / step;
      enter = Math.max(enter, Math.min(a, b));
      leave = Math.min(leave, Math.max(a, b));
    }
    if (!missed && enter < leave && enter < far) {
      far = enter;
      what = block.kind;
    }
  }
  return { far, what };
}

/** How far along a shot it meets a player, as tall and as wide as players are, or null if it goes by. */
export function shotMeets(from, way, trooper) {
  const dx = from.x - trooper.x;
  const dz = from.z - trooper.z;
  const a = way.x * way.x + way.z * way.z;
  if (a < 1e-9) return null;
  const b = dx * way.x + dz * way.z;
  const c = dx * dx + dz * dz - WIDE * WIDE;
  const inside = b * b - a * c;
  if (inside < 0) return null;
  const far = (-b - Math.sqrt(inside)) / a;
  if (far <= 0) return null;
  const high = from.y + way.y * far;
  return high >= 0 && high <= TALL ? far : null;
}

// The yard as squares a pace across, for finding the way round things.
const CELL = 1;
const COLS = Math.round((YARD.halfX * 2) / CELL);
const ROWS = Math.round((YARD.halfZ * 2) / CELL);
const colOf = (x) => clamp(Math.floor((x + YARD.halfX) / CELL), 0, COLS - 1);
const rowOf = (z) => clamp(Math.floor((z + YARD.halfZ) / CELL), 0, ROWS - 1);
const centreOf = (index) => ({ x: ((index % COLS) + 0.5) * CELL - YARD.halfX, z: (Math.floor(index / COLS) + 0.5) * CELL - YARD.halfZ });
const OPEN_CELLS = Array.from({ length: COLS * ROWS }, (_, index) => {
  const { x, z } = centreOf(index);
  return freeAt(x, z, BODY + 0.15);
});

/** The nearest square a player can stand in to a place. */
function nearestOpen(x, z) {
  const start = rowOf(z) * COLS + colOf(x);
  if (OPEN_CELLS[start]) return start;
  let best = start;
  let least = Infinity;
  OPEN_CELLS.forEach((open, index) => {
    if (!open) return;
    const at = centreOf(index);
    const away = Math.hypot(at.x - x, at.z - z);
    if (away < least) {
      least = away;
      best = index;
    }
  });
  return best;
}

/** How many squares it is from everywhere to a place, going round what's in the way: walking downhill gets there. */
export function wayTo(x, z) {
  const far = new Int16Array(COLS * ROWS).fill(-1);
  const goal = nearestOpen(x, z);
  far[goal] = 0;
  const queue = [goal];
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head];
    const col = index % COLS;
    const row = Math.floor(index / COLS);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = col + dc;
      const r = row + dr;
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
      const next = r * COLS + c;
      if (!OPEN_CELLS[next] || far[next] >= 0) continue;
      far[next] = far[index] + 1;
      queue.push(next);
    }
  }
  return { far, goal: centreOf(goal) };
}

/** The next place to walk to on the way somewhere: the middle of the neighbouring square that's nearest to it. */
export function stepTowards(way, x, z) {
  const here = nearestOpen(x, z);
  const col = here % COLS;
  const row = Math.floor(here / COLS);
  let best = here;
  let least = way.far[here] < 0 ? Infinity : way.far[here];
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const c = col + dc;
    const r = row + dr;
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
    const next = r * COLS + c;
    // Across a corner only if both squares beside it are open, so nobody cuts through the corner of a crate.
    if (dc !== 0 && dr !== 0 && !(OPEN_CELLS[row * COLS + c] && OPEN_CELLS[r * COLS + col])) continue;
    if (way.far[next] >= 0 && way.far[next] < least) {
      least = way.far[next];
      best = next;
    }
  }
  return best === here ? way.goal : centreOf(best);
}

/* ---------- the rifles, and what can be chosen ---------- */

// Two rifles. every is the time between shots, hit how much each takes off, and reload how long a new magazine
// takes. spread is how far off the middle of the sights a shot can go, in radians, from a rifle held still:
// bloom is how much that opens with each shot, up to bloomMost, and it closes again in about settle seconds.
// kick is how hard each shot throws the view up, and kickSide how far it can throw it to either side. The
// Kalashnikov hits harder, and kicks and opens up more. The M4 is quicker, lighter and steadier.
export const RIFLES = {
  ak: { name: 'Kalashnikov', nameKa: 'კალაშნიკოვი', every: 0.1, hit: 26, reload: 2.3, spread: 0.012, bloom: 0.0042, bloomMost: 0.045, settle: 0.14, kick: 0.17, kickSide: 0.09 },
  m4: { name: 'M4', nameKa: 'M4', every: 0.08, hit: 21, reload: 2.1, spread: 0.01, bloom: 0.003, bloomMost: 0.036, settle: 0.16, kick: 0.095, kickSide: 0.055 },
};
export const MAGAZINE = 30;

// How fast the player goes, in paces a second: with the stick right out, and sprinting. ease is how quickly
// they get up to speed, and stop. Walking opens the rifle's spread by up to walking times, and sprinting by more.
export const PLAYER = { run: 4.4, sprint: 6.4, ease: 14, walking: 1.6, sprinting: 2.6 };

// How hard the other team is. aim is how many of their shots at the player land, on someone standing still up
// close, hit how much each takes off, react how long they take to start firing once they see someone, and
// canLose whether the player can be tagged out and the match lost. On Easy the player's health stops just above
// nothing, and red can't win.
export const LEVELS = {
  gentle: { aim: 0.35, hit: 10, react: 1, burst: [3, 5], rest: [1, 1.6], canLose: false },
  medium: { aim: 0.68, hit: 17, react: 0.6, burst: [4, 7], rest: [0.45, 0.8], canLose: true },
  tough: { aim: 0.82, hit: 20, react: 0.4, burst: [5, 8], rest: [0.3, 0.6], canLose: true },
};
// However the level and how hard it is add up, a shot of theirs never lands more often than this.
export const MOST_LANDS = 0.95;

// The help with aiming, for those who want it: with the sights on someone, or nearly, the view turns less for
// the hand, so it's easier to stay on them. It never moves the sights for anyone. within is how many times
// someone's own width from the middle of them it starts, and slow how much less the view turns right on them.
export const AIM_ASSIST = { within: 2.4, slow: 0.55 };

export const TAGS_TO_WIN = [5, 10, 15];
export const HEALTH = 100;
export const AWAY_AFTER = 1.2; // Seconds with neither hand in the picture before it's paused.
const SIGHT = 34; // How far anyone can see, on a clear day.
const RANGE = 60; // How far a shot goes.
export const EYES = 1.55; // How high the player's eyes are, and so where their shots start from.
export const TALL = 1.9; // How tall a player is, to a shot.
export const WIDE = 0.42; // And how wide, from the middle.
const FENCE = 2.3; // How high the fence round the yard is.
export const OUT_SECONDS = 3; // How long a player who's been tagged out sits before they're back at their own end.
const SAFE_SECONDS = 2; // Just back, nobody can be hit for a moment.
const HEAL_AFTER = 3.5; // Health comes back once nothing has hit for this long...
const HEAL_RATE = 30; // ...this much a second.
export const WON_AFTER = 1.6;
const STEP_UP = 9; // How quickly anyone the computer plays gets up to speed, and stops.
// The view's kick: a spring that throws it up with each shot and brings it back. See punch in update.
const PUNCH = { stiff: 120, damp: 16 };
// For a player the computer plays: how fast it walks and turns, how well lined up it has to be to fire, how long
// between its shots, how near somewhere counts as there, how often it works out the way again, how long not
// getting anywhere means it's stuck, how near someone has to be for it to stop and fire, and how long it goes
// after someone who has hit it from further off than that. From further off it carries on its way, so nobody
// just stands at their own end firing down the yard. hits is how much its shots take off another of the
// computer's players, and lands how many of those shots land: the same for both teams, so Giraffe is worth as
// much as any one of the other team, and it's what the player does that decides it.
export const BOT = { walk: 3.3, turn: 3.2, aimWithin: degrees(9), every: 0.2, reach: 1.2, thinkEvery: 0.5, stuckAfter: 1.2, fightWithin: 15, angryFor: 4, hits: 9, lands: 0.55 };
// Their shots at the player land less often on one who's moving, less still sprinting, and less from far off.
const DODGING = { walking: 0.65, sprinting: 0.45, near: 8, far: 22, atFar: 0.5 };
// Something in the way of one of them: these turns to either side are tried, the least first.
const SLIDES = [0.35, 0.7, 1.05, 1.4, 1.75];
const HUNT_SECONDS = 4; // How lately the other team must have seen the player to go after them.
const HUNT_MOVED = 3; // How far the player must have gone from where a hunter was going for it to think again.

/**
 * What each level changes, from level 1, the plain match, up to level 10. The numbers are shares of what was
 * chosen, so a level never changes those choices: how hard, how many tags, the rifle, the help with aiming, or
 * Easy being impossible to lose.
 */
export function levelPlan(level = 1) {
  return {
    aim: ramp(level, 1, 1.5), // The other team's shots land a little more often.
    react: ramp(level, 1, 0.6), // And they start firing sooner.
    health: ramp(level, 1, 1.3), // Each of them takes more hits.
    reds: stepsAt(level, { 1: 2, 4: 3 }), // Two on the other team, and three from level 4.
    blues: stepsAt(level, { 1: 1, 4: 2 }), // Giraffe on the player's, and one more friend from level 4.
    // Something new to see and play with at every level from 2, on top of all that. See NEWS below.
    stars: level >= 2, // Each tag of the player's is a gold star, counted along the top.
    shield: level >= 3, // One of the other team carries a shield, which the first shots bounce off.
    three: level >= 4, // Three a side.
    runner: level >= 5, // One of the other team is a runner: quick, and never still.
    power: level >= 6, // A crate of double shots turns up in the yard: each shot counts twice for a while.
    snow: level >= 7, // It's snowing, and nobody can see as far.
    captain: level >= 8, // The other team's captain takes twice the hits, and is worth two tags.
    boots: level >= 9, // A crate of snow boots turns up too: walking is quicker for a while.
    champions: level >= 10, // The other team are the champions, in gold helmets, and all take more hits.
    trophy: level >= 10, // And beating them wins the trophy.
  };
}

/**
 * How much more dangerous and cleverer the other team is on Medium and Tough, level by level, on top of levelPlan.
 * Easy is left just as it always was. Level 1 is the plain match on every setting. hit is how much more each of
 * their shots takes off the player. lead is how much of the help moving gives the player they take away, by
 * firing where the player is going. From level 3 they all go for the player first when they can see them, rather
 * than whoever is nearest. From level 5 they hunt: with nobody in sight, they go where their team last saw the
 * player, in the last few seconds. From level 7 they all side-step while firing, as a runner does.
 */
export function challengePlan(level = 1, canLose = true) {
  if (!canLose) return { aim: 1, react: 1, health: 1, hit: 1, lead: 0, focus: false, hunt: false, strafe: false };
  return {
    aim: ramp(level, 1, 1.12), // With levelPlan's, their shots land two thirds more often at level 10 than at level 1.
    react: ramp(level, 1, 0.8), // With levelPlan's, they start firing in under half of level 1's time.
    health: ramp(level, 1, 1.1), // With levelPlan's, each takes 43% more hits.
    hit: ramp(level, 1, 1.15), // Each of their shots takes 15% more off the player.
    lead: ramp(level, 0, 0.5), // Moving helps the player only half as much by level 10.
    focus: level >= 3,
    hunt: level >= 5,
    strafe: level >= 7,
  };
}

/**
 * What each level brings that's new, shown on the title card, under the countdown and as coming up next. Each
 * key is something levelPlan switches on at that level.
 */
export const NEWS = {
  2: [{ key: 'stars', mark: '🌟', name: 'Gold stars', nameKa: 'ოქროს ვარსკვლავები' }],
  3: [{ key: 'shield', mark: '🛡️', name: 'Shield carrier', nameKa: 'ფარიანი მოთამაშე' }],
  4: [{ key: 'three', mark: '🤝', name: 'Three a side', nameKa: 'სამი სამზე' }],
  5: [{ key: 'runner', mark: '💨', name: 'Runner', nameKa: 'მორბენალი' }],
  6: [{ key: 'power', mark: '⚡', name: 'Double shots', nameKa: 'ორმაგი გასროლა' }],
  7: [{ key: 'snow', mark: '🌨️', name: 'Snowfall', nameKa: 'თოვა' }],
  8: [{ key: 'captain', mark: '🎖️', name: 'Captain', nameKa: 'კაპიტანი' }],
  9: [{ key: 'boots', mark: '🥾', name: 'Snow boots', nameKa: 'თოვლის ჩექმები' }],
  10: [{ key: 'champions', mark: '👑', name: 'Champions', nameKa: 'ჩემპიონები' }, { key: 'trophy', mark: '🏆', name: 'Trophy', nameKa: 'თასი' }],
};

/** What's new at a level, as the shared level cards want it. Level 1 has nothing new. */
export const newsAt = (level) => NEWS[level] ?? [];

// What comes in crates, from the levels that have them: how long each lasts.
export const POWERS = {
  double: { mark: '⚡', name: 'Double shots', nameKa: 'ორმაგი გასროლა', seconds: 10 },
  boots: { mark: '🥾', name: 'Snow boots', nameKa: 'თოვლის ჩექმები', seconds: 12 },
};
// Where a crate turns up: out in the open, either side of the middle, the same distance from both ends.
export const CRATE_SPOTS = [{ x: -6.5, z: 0 }, { x: 6.5, z: 0 }, { x: -20, z: 0 }, { x: 20, z: 0 }];
const CRATE = { first: 8, every: 18, reach: 1.3, seconds: 40 };
const SHIELD_HITS = 6; // A shield takes this many shots, each time its carrier comes back, and then it's down.
const RUNNER = { speed: 1.45, health: 0.6 };
const CAPTAIN = { health: 2, tags: 2 };
const CHAMPION_HEALTH = 1.25;
const BOOTS_SPEED = 1.4;
const SNOW_SIGHT = 22; // How far anyone can see when it's snowing.

// Who plays for each team, from the roster of characters: Giraffe is always on the player's.
export const BLUES = ['giraffe', 'mochi', 'kit'];
export const REDS = ['bramble', 'frost', 'cinder', 'nova', 'tur', 'truffle', 'widget'];

let nextId = 1;

export class Match {
  /**
   * tags is how many win it. level is from LEVELS. rifle is the player's, from RIFLES. assist says whether the
   * view turns less for the hand while the sights are on someone: see AIM_ASSIST.
   */
  constructor({ tags = 10, level = 'medium', levelNumber = 1, rifle = 'ak', assist = true, random = Math.random, onEvent = () => {}, ...more } = {}) {
    this.random = random;
    this.onEvent = onEvent;
    this.goal = tags;
    this.levelNumber = levelNumber;
    this.plan = levelPlan(levelNumber);
    this.configure({ level, assist });
    this.state = 'ready'; // ready, playing, won or lost.
    this.time = 0;
    this.score = [0, 0];
    this.endIn = null;
    this.resting = false; // Paused, with neither hand in the picture.
    this.awayFor = 0;

    this.troopers = [];
    this.enlist({ rifle, ...more });

    // What the levels bring: stars for the player's tags, and crates with something in them for a while.
    this.crate = null;
    this.crateIn = CRATE.first;
    this.cratesOut = 0;
    this.power = { doubleLeft: 0, bootsLeft: 0 };

    this.aimed = null; // Who the middle of the sights is on, if anyone.
    this.stats = { tags: 0, shots: 0, hits: 0, reloads: 0, byHand: 0, walked: 0, seconds: 0, firingSeconds: 0, walkingSeconds: 0, sprintSeconds: 0, out: 0, stars: 0, crates: 0, trophy: 0 };
  }

  /**
   * Who's in it: the player, Giraffe and the rest of their team, and the other team, all played by the computer.
   * With friends it's whoever is playing: see squad.js.
   */
  enlist({ rifle }) {
    const { plan, random } = this;
    this.child = this.join(0, 'child', rifle, false);
    for (let i = 0; i < plan.blues; i += 1) this.join(0, BLUES[i % BLUES.length], i % 2 ? 'ak' : 'm4', true);
    const first = Math.floor(random() * REDS.length);
    for (let i = 0; i < plan.reds; i += 1) this.join(1, REDS[(first + i) % REDS.length], i % 2 ? 'm4' : 'ak', true);
    this.castReds();
  }

  /** How hard it is, and the help with aiming, can change at any time, from the panel. */
  configure({ level, assist }) {
    if (level !== undefined) {
      this.level = LEVELS[level] ?? LEVELS.gentle;
      this.challenge = challengePlan(this.levelNumber, this.level.canLose);
    }
    if (assist !== undefined) this.assist = Boolean(assist);
  }

  emit(type, details = {}) {
    this.onEvent({ type, ...details });
  }

  /**
   * Someone joins a team, at the next place along its end, which is their home: where they come back to. With
   * friends, each has a number, the same in every friend's game, a name, and a home that may be somewhere else:
   * see squad.js.
   */
  join(team, who, rifle, bot, { home = null, number = null, name = '' } = {}) {
    const slot = this.troopers.filter((each) => each.team === team).length;
    const base = BASES[team] ?? BASES[0];
    const place = home ?? { x: base.spots[slot % base.spots.length], z: base.z, heading: base.heading };
    const trooper = {
      id: nextId,
      number: number ?? this.troopers.length,
      name,
      team,
      who,
      bot,
      slot,
      home: place,
      rifle: RIFLES[rifle] ? rifle : 'ak',
      x: place.x,
      z: place.z,
      heading: place.heading,
      speed: 0,
      turning: 0,
      // For the player: how fast they're going each way, how far the rifle has opened up with firing, how far
      // each shot can go off the middle of the sights just now, and the view's kick.
      vx: 0,
      vz: 0,
      sprinting: false,
      bloom: 0,
      spread: 0,
      punch: { pitch: 0, yaw: 0 },
      punchSpeed: { pitch: 0, yaw: 0 },
      health: HEALTH,
      most: HEALTH,
      state: 'in', // in, or out for a few seconds after being tagged. With friends, one who has left is gone.
      resting: false, // A child whose hands have both been still for a while: nothing fires at them.
      tags: 0, // How many of the other side they've tagged out.
      outLeft: 0,
      safeLeft: 0,
      sinceHit: Infinity,
      hitLeft: 0,
      rounds: MAGAZINE,
      reloadLeft: 0,
      fireIn: 0,
      firing: false,
      // For one the computer plays.
      way: null,
      wayIn: 0,
      haunt: null,
      seen: null,
      seenFor: 0,
      burstLeft: 0,
      restLeft: 0,
      stuckFor: 0,
      angryAt: null, // Someone who has hit it from further off than it would otherwise fight...
      angryLeft: 0, // ...and how much longer it goes after them.
      part: null, // On the higher levels, one of the other team can be the captain, a shield carrier or a runner.
      shield: 0, // How many more shots a shield carrier's shield takes.
      champion: false,
      round: 0, // Which side it last went round something in its way...
      aside: 0, // ...and how far round from the way it faces it's going, while it does.
    };
    nextId += 1;
    this.troopers.push(trooper);
    return trooper;
  }

  /**
   * On the higher levels, some of the other team are something special: the captain first, then the shield
   * carrier, then the runner, and with only two of them, the newest of those.
   */
  castReds() {
    const { plan } = this;
    const reds = this.troopers.filter(({ team }) => team === 1);
    const parts = [plan.captain && 'captain', plan.shield && 'shield', plan.runner && 'runner'].filter(Boolean).slice(0, reds.length);
    reds.forEach((trooper, index) => {
      const part = parts[index] ?? null;
      trooper.part = part;
      let health = HEALTH * plan.health * this.challenge.health * (plan.champions ? CHAMPION_HEALTH : 1);
      if (part === 'captain') health *= CAPTAIN.health;
      if (part === 'runner') health *= RUNNER.health;
      trooper.most = trooper.health = Math.round(health);
      trooper.shield = part === 'shield' ? SHIELD_HITS : 0;
      trooper.champion = Boolean(plan.champions);
    });
  }

  begin() {
    this.state = 'playing';
  }

  get left() {
    return Math.max(0, this.goal - this.score[0]);
  }

  /** Those still in, on a team. */
  inPlay(team) {
    return this.troopers.filter((each) => each.team === team && each.state === 'in');
  }

  /**
   * Who someone is up against: everyone still in who isn't on their team, apart from one this child has just
   * tagged out, before their own game has said so, and one whose hands are out of the picture.
   */
  foesOf(trooper) {
    return this.troopers.filter((each) => each.team !== trooper.team && each.state === 'in' && each.health > 0 && !each.resting);
  }

  /** Whether this game decides what happens to someone: it always does, playing by oneself. See squad.js. */
  decides() {
    return true;
  }

  /** Whether everyone the computer plays is waiting: while it's paused. */
  get paused() {
    return this.resting;
  }

  /** How far anyone can see: not as far when it's snowing. */
  get sight() {
    return this.plan.snow ? SNOW_SIGHT : SIGHT;
  }

  /** Whether one player can see another: in play, near enough, and with nothing in the way. */
  sees(from, target) {
    return target.state === 'in' && gapBetween(from, target) <= this.sight && clearLine(from, target);
  }

  /* ---------- the player ---------- */

  /**
   * Walks the player the way the stick says, to the way they're looking: forwards and back, and to either side.
   * They get up to speed and stop quickly rather than at once, and something in the way never stops them dead:
   * they slide along it. Returns how far they went.
   */
  stride(dt, moveX, moveY, sprint) {
    const { child } = this;
    const push = Math.min(1, Math.hypot(moveX, moveY));
    const [across, forwards] = push > 0 ? [moveX / Math.hypot(moveX, moveY), moveY / Math.hypot(moveX, moveY)] : [0, 0];
    child.sprinting = Boolean(sprint) && forwards > 0 && push > 0;
    const most = (child.sprinting ? PLAYER.sprint : PLAYER.run) * (this.power.bootsLeft > 0 ? BOOTS_SPEED : 1) * push;
    const ahead = forwardOf(child.heading);
    // To the right of the way they face.
    const right = { x: -ahead.z, z: ahead.x };
    const wanted = { x: (right.x * across + ahead.x * forwards) * most, z: (right.z * across + ahead.z * forwards) * most };
    const share = 1 - Math.exp(-PLAYER.ease * dt);
    child.vx += (wanted.x - child.vx) * share;
    child.vz += (wanted.z - child.vz) * share;
    if (Math.hypot(child.vx, child.vz) < 0.02 && push === 0) [child.vx, child.vz] = [0, 0];
    const to = keptClear(child.x + child.vx * dt, child.z + child.vz * dt);
    const moved = Math.hypot(to.x - child.x, to.z - child.z);
    // What's in the way takes the speed that was going into it, so there's no sticking to a wall on the way off it.
    if (dt > 0) [child.vx, child.vz] = [(to.x - child.x) / dt, (to.z - child.z) / dt];
    [child.x, child.z] = [to.x, to.z];
    child.speed = dt > 0 ? moved / dt : 0;
    return moved;
  }

  /** Walks someone the computer plays the way they face. Something in the way never stops them: they go along it. */
  walk(trooper, wanted, dt) {
    trooper.speed += clamp(wanted - trooper.speed, -STEP_UP * dt, STEP_UP * dt);
    if (trooper.speed <= 0.01) return 0;
    const step = trooper.speed * dt;
    const [fromX, fromZ] = [trooper.x, trooper.z];
    const go = (heading) => {
      const forward = forwardOf(heading);
      const x = trooper.x + forward.x * step;
      const z = trooper.z + forward.z * step;
      if (!freeAt(x, z)) return false;
      trooper.x = x;
      trooper.z = z;
      return true;
    };
    if (go(trooper.heading)) {
      trooper.round = 0;
      return step;
    }
    // The side it went round last time first, so it doesn't dither between the two.
    const first = trooper.round || 1;
    for (const turn of SLIDES) {
      if (go(trooper.heading + first * turn)) {
        trooper.round = first;
        break;
      }
      if (go(trooper.heading - first * turn)) {
        trooper.round = -first;
        break;
      }
    }
    return Math.hypot(trooper.x - fromX, trooper.z - fromZ);
  }

  /** Which way the player's eye is looking: the way they face, level, with the kick of the rifle in it. */
  get view() {
    const { child } = this;
    return { yaw: child.heading + child.punch.yaw, pitch: child.punch.pitch };
  }

  /**
   * What a shot from the player's eye meets, going this way: one of the others, if they're nearer than whatever
   * else is in the way, or whatever that is. Their own side isn't in the way of it.
   */
  cast(yaw, pitch) {
    const { child } = this;
    const from = { x: child.x, y: EYES, z: child.z };
    const way = aimOf(yaw, pitch);
    let { far, what } = shotReach(from, way);
    let trooper = null;
    for (const other of this.troopers) {
      if (other === child || other.team === child.team || other.state !== 'in') continue;
      const meets = shotMeets(from, way, other);
      if (meets !== null && meets < far) {
        far = meets;
        trooper = other;
        what = 'player';
      }
    }
    return { trooper, what, far, to: { x: from.x + way.x * far, y: from.y + way.y * far, z: from.z + way.z * far } };
  }

  /** How far off the middle of the sights a shot can go just now: more with firing, walking and sprinting. */
  spreadNow() {
    const { child } = this;
    const rifle = RIFLES[child.rifle];
    const going = clamp(child.speed / PLAYER.run, 0, 1);
    const moving = child.sprinting ? PLAYER.sprinting : 1 + (PLAYER.walking - 1) * going;
    return (rifle.spread + child.bloom) * moving;
  }

  /**
   * The player's rifle. With the trigger held it fires as fast as it can, each shot from the eye to wherever the
   * sights are, a little way off the middle of them. An empty one changes its own magazine.
   */
  shoot(dt, held) {
    const { child } = this;
    const rifle = RIFLES[child.rifle];
    child.fireIn -= dt;
    const ready = child.state === 'in' && child.reloadLeft === 0;
    child.firing = held && ready && child.rounds > 0;
    if (!child.firing) child.fireIn = Math.max(0, child.fireIn);
    // The rifle steadies again when it isn't firing, and a little between one shot and the next.
    child.bloom *= Math.exp(-dt / (child.firing ? rifle.settle * 4 : rifle.settle));
    child.spread = this.spreadNow();
    if (!child.firing) return;
    this.stats.firingSeconds += dt;
    if (child.fireIn > 1e-9) return;
    // The next one is due this long after this one was, not after the frame it was fired in, so the rifle keeps
    // its own time whatever the frames are doing.
    child.fireIn = Math.max(child.fireIn, -dt) + rifle.every;
    child.rounds -= 1;
    this.stats.shots += 1;
    // Somewhere within the spread, evenly over it.
    const off = Math.sqrt(this.random()) * child.spread;
    const round = this.random() * Math.PI * 2;
    const { yaw, pitch } = this.view;
    const shot = this.cast(yaw + Math.cos(round) * off, pitch + Math.sin(round) * off);
    if (shot.trooper) this.stats.hits += 1;
    this.emit('shot', { by: child, at: shot.trooper, to: shot.to, what: shot.what, hit: Boolean(shot.trooper) });
    // With double shots from a crate, each one counts twice.
    if (shot.trooper) this.hit(shot.trooper, rifle.hit * (this.power.doubleLeft > 0 ? 2 : 1), child);
    // Each shot opens the rifle up a little more, and kicks the view up and a little to one side.
    child.bloom = Math.min(rifle.bloomMost, child.bloom + rifle.bloom);
    child.punchSpeed.pitch += rifle.kick;
    child.punchSpeed.yaw += (this.random() - 0.5) * 2 * rifle.kickSide;
    if (child.rounds === 0) {
      this.emit('empty', { trooper: child });
      this.reload(child, false);
    }
  }

  /** The view's kick: thrown up by each shot, and brought back as by a spring. */
  punch(dt) {
    const { punch, punchSpeed } = this.child;
    for (const key of ['pitch', 'yaw']) {
      punchSpeed[key] += (-punch[key] * PUNCH.stiff - punchSpeed[key] * PUNCH.damp) * dt;
      punch[key] += punchSpeed[key] * dt;
      if (Math.abs(punch[key]) < 1e-5 && Math.abs(punchSpeed[key]) < 1e-4) [punch[key], punchSpeed[key]] = [0, 0];
    }
  }

  /**
   * How much less the view turns for the hand just now, with the help with aiming: less the nearer the middle
   * of the sights is to someone they can see, and not at all less with nobody near them, or with the help off.
   */
  aimSlow() {
    if (!this.assist) return 1;
    const { child } = this;
    let nearest = Infinity;
    for (const other of this.foesOf(child)) {
      if (!this.sees(child, other)) continue;
      const away = gapBetween(child, other);
      const off = Math.abs(turnBetween(headingTo(other.x - child.x, other.z - child.z), child.heading));
      nearest = Math.min(nearest, off / Math.atan2(WIDE, away));
    }
    const out = clamp((nearest - 1) / (AIM_ASSIST.within - 1), 0, 1);
    return AIM_ASSIST.slow + (1 - AIM_ASSIST.slow) * out;
  }

  /**
   * A new magazine: it takes a moment, and the rifle can't fire until it's in. byHand says the player asked for
   * it, rather than the rifle having run out.
   */
  reload(trooper, byHand) {
    if (trooper.reloadLeft > 0 || trooper.rounds >= MAGAZINE || trooper.state !== 'in') return false;
    trooper.reloadLeft = RIFLES[trooper.rifle].reload;
    if (trooper === this.child) {
      this.stats.reloads += 1;
      if (byHand) this.stats.byHand += 1;
    }
    this.emit('reload', { trooper, byHand });
    return true;
  }

  finishReloads(dt) {
    for (const trooper of this.troopers) {
      if (trooper.reloadLeft === 0) continue;
      trooper.reloadLeft = Math.max(0, trooper.reloadLeft - dt);
      if (trooper.reloadLeft === 0) {
        trooper.rounds = MAGAZINE;
        this.emit('loaded', { trooper });
      }
    }
  }

  /* ---------- hits, and being tagged out ---------- */

  hit(trooper, amount, by) {
    // Once it's decided nothing more lands, so the tags on the finish card are the tags that won it.
    if (trooper.state !== 'in' || trooper.safeLeft > 0 || this.state !== 'playing' || this.endIn !== null) return;
    trooper.sinceHit = 0;
    trooper.hitLeft = 0.3;
    // A shield takes the first few shots, with a bonk, and then it's down until its carrier is back.
    if (trooper.shield > 0) {
      trooper.shield -= 1;
      this.emit('bonk', { trooper, by, down: trooper.shield === 0 });
      return;
    }
    trooper.health -= amount;
    // One of the computer's players who's been hit goes after whoever did it for a while, from however far off.
    if (trooper.bot && by && by.team !== trooper.team) Object.assign(trooper, { angryAt: by, angryLeft: BOT.angryFor });
    // On Easy the player is never tagged out: their health stops just above nothing.
    if (trooper === this.child && !this.level.canLose) trooper.health = Math.max(1, trooper.health);
    this.emit('hit', { trooper, by, health: trooper.health });
    if (trooper.health > 0) return;
    trooper.health = 0;
    trooper.state = 'out';
    trooper.outLeft = OUT_SECONDS;
    // A player tagged out isn't there to be hunted any more: see hunt in challengePlan.
    if (!trooper.bot) this.spotted = null;
    trooper.firing = false;
    trooper.burstLeft = 0;
    trooper.speed = 0;
    // Every tag is a point for the team that made it, and the other team's captain is worth two: a match is the
    // first team to the tags. On Easy, which can't be lost, the other team's tags count for nothing.
    const worth = trooper.part === 'captain' ? CAPTAIN.tags : 1;
    if (by.team === 0 || this.level.canLose) this.score[by.team] += worth;
    by.tags += 1;
    if (by === this.child) {
      this.stats.tags += 1;
      // From level 2, each of the player's tags is a gold star, and the captain is two.
      if (this.plan.stars) {
        this.stats.stars += worth;
        this.emit('star', { trooper, stars: this.stats.stars, worth });
      }
    }
    if (trooper === this.child) this.stats.out += 1;
    if (this.aimed === trooper) this.aimed = null;
    this.emit('tagged', { trooper, by, score: [...this.score] });
    this.checkEnd();
  }

  /** The first team to the tags wins. On Easy only the player's team can. */
  checkEnd() {
    if (this.endIn !== null) return;
    if (this.score[0] >= this.goal) this.ending = 'won';
    else if (this.score[1] >= this.goal && this.level.canLose) this.ending = 'lost';
    else return;
    this.endIn = WON_AFTER;
  }

  /** Those tagged out come back at their own end, and health comes back with time. */
  recover(dt) {
    for (const trooper of this.troopers) {
      trooper.hitLeft = Math.max(0, trooper.hitLeft - dt);
      trooper.safeLeft = Math.max(0, trooper.safeLeft - dt);
      if (trooper.state === 'out') {
        trooper.outLeft -= dt;
        // With friends, each game brings back only those it decides for: see squad.js.
        if (trooper.outLeft > 0 || !this.decides(trooper)) continue;
        this.bringBack(trooper);
        continue;
      }
      if (trooper.state !== 'in' || !this.decides(trooper)) continue;
      trooper.sinceHit += dt;
      if (trooper.health < trooper.most && trooper.sinceHit >= HEAL_AFTER) trooper.health = Math.min(trooper.most, trooper.health + HEAL_RATE * dt);
    }
  }

  /** Someone who was tagged out is back at their home, as good as new, and safe for a moment. */
  bringBack(trooper) {
    const { home } = trooper;
    Object.assign(trooper, { state: 'in', x: home.x, z: home.z, heading: home.heading, health: trooper.most, rounds: MAGAZINE, reloadLeft: 0, safeLeft: SAFE_SECONDS, sinceHit: Infinity, way: null, haunt: null, seen: null, burstLeft: 0, speed: 0, vx: 0, vz: 0, bloom: 0, angryAt: null, angryLeft: 0, shield: trooper.part === 'shield' ? SHIELD_HITS : 0 });
    this.emit('back', { trooper });
  }

  /* ---------- the players the computer plays ---------- */

  think(bot, dt) {
    if (bot.state !== 'in') return;
    bot.fireIn = Math.max(0, bot.fireIn - dt);
    bot.restLeft = Math.max(0, bot.restLeft - dt);
    bot.angryLeft = Math.max(0, bot.angryLeft - dt);
    if (bot.angryLeft === 0) bot.angryAt = null;
    // Whoever it can see of the other team that's near enough to fire at, nearest first, sticking with the one it
    // has while it can still see them. Someone who has just hit it counts from however far off.
    const others = this.foesOf(bot).filter((other) => (gapBetween(bot, other) <= BOT.fightWithin || other === bot.angryAt) && this.sees(bot, other));
    // From level 3 on Medium and Tough, the player is who they go for first, whenever they can see them.
    const player = this.challenge.focus ? others.find((other) => !other.bot) : null;
    const seen = player ?? (others.includes(bot.seen) ? bot.seen : others.sort((a, b) => gapBetween(bot, a) - gapBetween(bot, b))[0] ?? null);
    if (seen && !seen.bot && bot.team === 1) this.spotted = { x: seen.x, z: seen.z, at: this.time };
    bot.seenFor = seen && seen === bot.seen ? bot.seenFor + dt : 0;
    bot.seen = seen;
    bot.firing = false;
    if (seen) {
      // It stops, turns to them, and fires a few at a time once it has had a moment to take aim.
      const off = turnBetween(headingTo(seen.x - bot.x, seen.z - bot.z), bot.heading);
      bot.heading += clamp(off, -BOT.turn * dt, BOT.turn * dt);
      // A runner never stands still: it keeps on the move, from side to side, while it fires, and from level 7 on
      // Medium and Tough so does everyone but the shield carrier.
      if (bot.part === 'runner' || (this.challenge.strafe && bot.part !== 'shield')) this.dodge(bot, dt);
      else this.walk(bot, 0, dt);
      const aimed = Math.abs(off) <= BOT.aimWithin && bot.seenFor >= this.level.react * this.plan.react * this.challenge.react;
      if (!aimed || bot.reloadLeft > 0 || bot.restLeft > 0) return;
      if (bot.rounds === 0) {
        this.reload(bot, false);
        return;
      }
      if (bot.burstLeft === 0) bot.burstLeft = Math.round(between(this.random, this.level.burst));
      bot.firing = true;
      if (bot.fireIn > 0) return;
      bot.fireIn = BOT.every;
      bot.rounds -= 1;
      bot.burstLeft -= 1;
      if (bot.burstLeft === 0) bot.restLeft = between(this.random, this.level.rest);
      // The other team's shots at the player land only some of the time. Everyone else's mostly do.
      const landed = this.random() < this.chanceOn(seen, bot);
      this.emit('shot', { by: bot, at: seen, hit: landed });
      if (landed) this.hit(seen, this.botHit(bot, seen), bot);
      return;
    }
    // Nobody in sight: it goes somewhere worth going, by the way round, and then somewhere else.
    bot.burstLeft = 0;
    bot.wayIn -= dt;
    // From level 5 on Medium and Tough, they hunt: they go where their team last saw the player, if that was lately.
    const lead = this.challenge.hunt && bot.team === 1 && this.spotted && this.time - this.spotted.at <= HUNT_SECONDS ? this.spotted : null;
    if (lead && gapBetween(bot, lead) >= BOT.reach && !(bot.hunting && bot.haunt && gapBetween(bot.haunt, lead) < HUNT_MOVED)) {
      bot.haunt = { x: lead.x, z: lead.z };
      bot.hunting = true;
      bot.way = null;
      bot.stuckFor = 0;
    } else if (!bot.haunt || gapBetween(bot, bot.haunt) < BOT.reach || bot.stuckFor > BOT.stuckAfter) {
      bot.haunt = HAUNTS[Math.floor(this.random() * HAUNTS.length)];
      bot.hunting = false;
      bot.way = null;
      bot.stuckFor = 0;
    }
    if (!bot.way || bot.wayIn <= 0) {
      bot.way = wayTo(bot.haunt.x, bot.haunt.z);
      bot.wayIn = BOT.thinkEvery;
    }
    const next = stepTowards(bot.way, bot.x, bot.z);
    const off = turnBetween(headingTo(next.x - bot.x, next.z - bot.z), bot.heading);
    bot.heading += clamp(off, -BOT.turn * dt, BOT.turn * dt);
    const pace = BOT.walk * (bot.part === 'runner' ? RUNNER.speed : 1);
    const moved = this.walk(bot, Math.abs(off) < 1 ? pace : 0, dt);
    bot.stuckFor = moved < pace * dt * 0.3 ? bot.stuckFor + dt : 0;
  }

  /**
   * How likely a shot from a player the computer plays is to land on someone. On another of the computer's, more
   * often than not. On the player, as often as how hard it is says, for one standing still up close: less on one
   * who's walking, less still sprinting, and less from far off, so moving and keeping a distance are worth it.
   */
  chanceOn(target, from = null) {
    if (target.bot) return BOT.lands;
    const going = clamp(target.speed / PLAYER.run, 0, 1);
    const dodged = target.sprinting ? DODGING.sprinting : 1 - (1 - DODGING.walking) * going;
    // On Medium and Tough they lead a player on the move more, the higher the level.
    const moving = dodged + (1 - dodged) * this.challenge.lead;
    const away = from ? gapBetween(from, target) : DODGING.near;
    const far = 1 - (1 - DODGING.atFar) * clamp((away - DODGING.near) / (DODGING.far - DODGING.near), 0, 1);
    return Math.min(MOST_LANDS, this.level.aim * this.plan.aim * this.challenge.aim * moving * far);
  }

  /** How much a shot from a player the computer plays takes off someone: the player, as much as how hard it is says. */
  botHit(bot, target) {
    return target.bot ? BOT.hits : this.level.hit * this.challenge.hit;
  }

  /** A runner's side-step: a few paces one way, and then the other, still facing whoever it's firing at. */
  dodge(bot, dt) {
    bot.dodgeIn = (bot.dodgeIn ?? 0) - dt;
    if (bot.dodgeIn <= 0) {
      bot.dodgeIn = 0.9;
      bot.dodgeWay = bot.dodgeWay === 1 ? -1 : 1;
    }
    const side = forwardOf(bot.heading + (Math.PI / 2) * bot.dodgeWay);
    const step = BOT.walk * RUNNER.speed * 0.6 * dt;
    const x = bot.x + side.x * step;
    const z = bot.z + side.z * step;
    if (freeAt(x, z)) Object.assign(bot, { x, z, speed: step / dt });
    else bot.dodgeIn = 0;
  }

  /* ---------- crates, from the levels that have them ---------- */

  /** Which kinds of crate this level has: double shots from level 6, and snow boots too from level 9. */
  get crateKinds() {
    return [this.plan.power && 'double', this.plan.boots && 'boots'].filter(Boolean);
  }

  /**
   * A crate turns up in the open every so often, one at a time, the newest kind first. Walking over it picks
   * it up. Missing it costs nothing: it goes after a while, and another comes. All of it waits while it's paused.
   */
  crates(dt) {
    const kinds = this.crateKinds;
    const { child, power } = this;
    for (const key of ['doubleLeft', 'bootsLeft']) {
      if (power[key] <= 0) continue;
      power[key] = Math.max(0, power[key] - dt);
      if (power[key] === 0) this.emit('power-off', { kind: key === 'doubleLeft' ? 'double' : 'boots' });
    }
    if (!kinds.length) return;
    if (!this.crate) {
      this.crateIn -= dt;
      if (this.crateIn > 0) return;
      // The newest kind first, and then turn about, at the place furthest from the player, so it's a walk.
      const kind = kinds[(kinds.length - 1 + this.cratesOut) % kinds.length];
      const spot = CRATE_SPOTS.slice().sort((a, b) => gapBetween(b, child) - gapBetween(a, child))[this.cratesOut % 2];
      this.crate = { kind, x: spot.x, z: spot.z, left: CRATE.seconds };
      this.cratesOut += 1;
      this.emit('crate', { crate: this.crate });
      return;
    }
    const { crate } = this;
    crate.left -= dt;
    if (child.state === 'in' && gapBetween(crate, child) <= CRATE.reach) {
      power[`${crate.kind}Left`] = POWERS[crate.kind].seconds;
      this.stats.crates += 1;
      this.emit('crate-got', { crate });
    } else if (crate.left <= 0) {
      this.emit('crate-gone', { crate });
    } else {
      return;
    }
    this.crate = null;
    this.crateIn = CRATE.every;
  }

  /* ---------- every frame ---------- */

  /**
   * One frame, with what the hands are asking for, from controls.js. moveX and moveY are the stick, to the right
   * and forwards, each from -1 to 1, and sprint says it's pushed right out. turn is how far the view turns this
   * frame, in radians, to the right. fire is the trigger, held, and reload is true in the frame the magazine is
   * to be changed. hands is how many hands are in the picture.
   */
  update(dt, { moveX = 0, moveY = 0, sprint = false, turn = 0, fire = false, reload = false, hands = 2 } = {}) {
    this.time += dt;
    const { child } = this;
    const number = (value) => (Number.isFinite(value) ? value : 0);
    if (this.state !== 'playing') {
      child.firing = false;
      this.stride(dt, 0, 0, false);
      this.punch(dt);
      this.finishReloads(dt);
      for (const trooper of this.troopers) {
        trooper.hitLeft = Math.max(0, trooper.hitLeft - dt);
        if (trooper.bot) {
          trooper.firing = false;
          this.walk(trooper, 0, dt);
        }
      }
      return;
    }
    this.stats.seconds += dt;
    this.watchHands(dt, hands > 0);

    if (child.state === 'in' && !this.resting) {
      // The view turns as far as the hand has moved it.
      child.heading += clamp(number(turn), -1, 1);
      const moved = this.stride(dt, clamp(number(moveX), -1, 1), clamp(number(moveY), -1, 1), sprint === true);
      this.stats.walked += moved;
      if (moved > 0.001) this.stats.walkingSeconds += dt;
      if (child.sprinting) this.stats.sprintSeconds += dt;
      if (reload === true) this.reload(child, true);
    } else {
      this.stride(dt, 0, 0, false);
    }
    this.shoot(dt, fire === true && !this.resting);
    this.punch(dt);
    this.finishReloads(dt);
    // Who the middle of the sights is on, for the sights to say so.
    this.aimed = child.state === 'in' ? this.cast(child.heading, 0).trooper : null;
    if (!this.resting && this.endIn === null) this.crates(dt);

    this.runBots(dt);
    // Paused, nobody comes back and nobody gets their health back: it all waits.
    if (!this.paused) this.recover(dt);

    if (this.endIn !== null) {
      this.endIn -= dt;
      if (this.endIn <= 0) {
        this.state = this.ending;
        this.aimed = null;
        child.firing = false;
        // Beating the champions, at level 10, wins the trophy.
        if (this.ending === 'won' && this.plan.trophy) this.stats.trophy = 1;
        this.emit(this.ending, { score: [...this.score], trophy: this.stats.trophy === 1 });
      }
    }
  }

  /** While it's paused, and once it's decided, everyone the computer plays stops where they are and waits. */
  runBots(dt) {
    const waiting = this.paused || this.endIn !== null;
    for (const trooper of this.troopers) {
      if (!trooper.bot) continue;
      if (!waiting) {
        this.think(trooper, dt);
        continue;
      }
      trooper.firing = false;
      trooper.burstLeft = 0;
      this.walk(trooper, 0, dt);
    }
  }

  /**
   * With neither hand in the picture for a moment there's nothing to play with, as with a controller put down:
   * it's paused, everyone the computer plays stops and waits, and it carries on as soon as a hand is back.
   */
  watchHands(dt, seen) {
    this.awayFor = seen ? 0 : this.awayFor + dt;
    const resting = this.awayFor >= AWAY_AFTER;
    if (resting === this.resting) return;
    this.resting = resting;
    this.child.resting = resting;
    this.emit('resting', { on: resting });
  }
}
