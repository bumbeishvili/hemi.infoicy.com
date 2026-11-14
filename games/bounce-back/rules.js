// Bounce Back's numbers and rules, with no screen in this file, so they can be tested on their own.
//
// The court is seen from the side. Along it, u goes from -1 at one end to 1 at the other, with the net at
// 0, and h is the height above the court, in the same units. Side A is the half where u is below 0, and
// side B the other half. On their own, the child is side A and the computer side B. With a friend, whoever
// made the game is side A. Each screen turns the court round so that the child's own half is on the side
// of the hand they play with: see Court in court.js.
//
// The ball is big, slow and floaty, like a beach ball. Every shot is worked out to go over the net, so
// the child only has to get an open hand to the ball, and the computer aims for wherever the child's hand
// is. Level 1 is the plain game, and every level from 2 brings something new: see NEWS.
import { clampLevel, ramp, rampWhole } from '../../core/levels.js';

export const COURT = {
  end: 1, // The baselines, at u = -1 and 1.
  net: 0.34, // How high the net is.
  netHalf: 0.018, // Half the net's thickness.
  ball: 0.075, // The ball's radius.
  top: 1.05, // The highest that's always on the screen.
};

export const SIDES = ['A', 'B'];
export const signOf = (side) => (side === 'A' ? -1 : 1);
export const otherSide = (side) => (side === 'A' ? 'B' : 'A');
export const sideAt = (u) => (u < 0 ? 'A' : 'B');
export const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// How long the ball takes to cross from one side to the other at level 1, in seconds. Even fast is slow:
// this is about reaching and opening the hand, not about being quick.
export const PACES = { slow: 2.7, medium: 2.25, fast: 1.85 };
// Gravity is this over the crossing time squared, so every crossing has the same gentle arc, rising a little
// less than the net's height above where it started and ended, whatever the speed.
const ARC = 2.3;
// A bounce keeps this much of the ball's speed, up and along. A beach ball is bouncy.
export const BOUNCE = { keep: 0.72, along: 0.86 };
const SETTLE_SPEED = 0.07; // Slower than this, a bounce is the ball coming to rest.
const ROLLING = 1.1; // How quickly a ball rolling on the court slows down.
const STEP = 1 / 120; // Physics in small steps, so that a bounce is never missed.
// How far over the net a shot always goes, above the tape, besides the ball's own size.
export const NET_MARGIN = 0.06;

// The racket is the child's open hand. Its size is in court units, and a grown-up's reach help makes it
// bigger and draws the ball towards it: pull is how strongly, in court units a second each second.
export const RACKET = { radius: 0.17, pullRange: 0.8 };
export const HELP = {
  none: { size: 1, pull: 0.35 },
  little: { size: 1.12, pull: 0.7 },
  lots: { size: 1.25, pull: 1.15 },
};
// How far from the child's hand the computer aims, in court units, on each setting of How hard, at level 1
// and at level 10: it aims further off as the levels go up. On Gentle it's always right at the hand.
export const AIM = { gentle: 0, medium: 0.2, tough: 0.3 };
export const AIM_TOP = { gentle: 0, medium: 0.7, tough: 0.85 };

/** How far off the hand the computer aims, on a setting of How hard, at a level. */
export const aimAtLevel = (hard, level = 1) => ramp(level, AIM[hard] ?? 0, AIM_TOP[hard] ?? 0);

// How much quicker the ball is at level 10 than at level 1: on Gentle as it always was, and on Medium and
// Tough quicker still, so that level 10 needs a quick hand.
export const TOP_SPEED = { gentle: 1.3, medium: 2, tough: 2.2 };

// The kinds of ball. slow is how much longer than usual each crossing takes, and prize what hitting it
// back gives.
export const BALLS = {
  beach: { slow: 1 },
  bubble: { slow: 1.3 },
  rainbow: { slow: 1, prize: 'star' },
  golden: { slow: 1, prize: 'gem' },
};
export const BALL_KINDS = Object.keys(BALLS);

// What the levels bring, from level 2. Each comes along now and then, and missing one never costs anything.
export const EXTRAS = {
  starEvery: 9, // Seconds between stars to catch, from level 2.
  starLife: 16,
  firstPowerAfter: 7, // The first power-up comes this soon, so it's met.
  powerEvery: 20,
  powerSeconds: 8, // How long the big racket lasts, in seconds of the hand being open.
  birdSeconds: 12, // And the bluebird.
  catchReach: 0.2, // How near the glove has to come to catch a star or a power-up, open or closed.
  flags: 8, // A flag for each hit, and a trophy for a full row.
  castles: [0.42, 0.78], // Where the sandcastles stand on the computer's side.
  castleReach: 0.13,
  castleBack: 14, // Seconds until a sandcastle is built again.
  castleAim: 0.65, // How often the child's shot goes for a sandcastle that's standing.
  breeze: 0.05, // How hard the breeze pushes, in court units a second each second.
  breezeRate: 0.22, // How slowly it turns, one way and then the other.
};

// The computer misses a return once the child has hit the ball this many times in a point: somewhere
// between the two numbers, at level 1 and at level 10. Rallies grow as the levels go up, and on Gentle the
// computer is kind. On Medium and Tough it gets better as the levels go up, and misses much less at level 10.
export const RALLIES = {
  gentle: { first: [1, 3], last: [2, 5] },
  medium: { first: [2, 4], last: [4, 9] },
  tough: { first: [3, 6], last: [6, 13] },
};

/** What changes from level 1 to 10, on a setting of How hard. */
export function courtLevel(level, hard = 'gentle') {
  const at = clampLevel(level);
  return {
    // The ball goes quicker each level: at level 10, a crossing takes 62% of the time it did on Medium and
    // Tough, and 77% on Gentle.
    speed: ramp(at, 1, TOP_SPEED[hard] ?? TOP_SPEED.gentle),
    // From level 2, stars float down on the child's side, to catch with the glove.
    stars: at >= 2,
    // From level 3, now and then a bubble ball, which floats even more slowly.
    bubble: at >= 3,
    // From level 4, a row of flags behind the court: each hit colours one in, and a full row gives a trophy.
    flags: at >= 4 ? EXTRAS.flags : 0,
    // From level 5, a power-up that makes the racket bigger for a while.
    bigRacket: at >= 5,
    // From level 6, sandcastles on the computer's side. A shot that lands on one gives a shell.
    castles: at >= 6 ? EXTRAS.castles.length : 0,
    // From level 7, now and then a rainbow ball, and each hit with it gives a star.
    rainbow: at >= 7,
    // From level 8, a breeze that pushes the ball slowly one way and then the other.
    breeze: at >= 8 ? EXTRAS.breeze : 0,
    // From level 9, the bluebird: a power-up that bops a ball back up before it can bounce twice.
    bird: at >= 9,
    // At level 10, the golden ball, on the child's last point and now and then. Each hit gives a gem.
    golden: at >= 10,
    // The special balls of this level, newest first, which take turns on every third point.
    specials: [at >= 10 && 'golden', at >= 7 && 'rainbow', at >= 3 && 'bubble'].filter(Boolean),
  };
}

// What each level brings that's new, for the title card, the countdown and the finish card. key says which
// part of courtLevel turns it on, which the unit tests check.
export const NEWS = {
  2: [{ key: 'stars', mark: '⭐', name: 'Stars to catch', nameKa: 'ვარსკვლავები' }],
  3: [{ key: 'bubble', mark: '🫧', name: 'Bubble ball', nameKa: 'ბუშტის ბურთი' }],
  4: [
    { key: 'flags', mark: '🚩', name: 'A flag for each hit', nameKa: 'დროშები' },
    { key: 'trophy', mark: '🏆', name: 'Trophies', nameKa: 'თასები' },
  ],
  5: [{ key: 'bigRacket', mark: '🎾', name: 'Big racket', nameKa: 'დიდი ჩოგანი' }],
  6: [
    { key: 'castles', mark: '🏰', name: 'Sandcastles', nameKa: 'ქვიშის ციხესიმაგრეები' },
    { key: 'shell', mark: '🐚', name: 'Shells', nameKa: 'ნიჟარები' },
  ],
  7: [{ key: 'rainbow', mark: '🌈', name: 'Rainbow ball', nameKa: 'ცისარტყელა ბურთი' }],
  8: [{ key: 'breeze', mark: '🍃', name: 'Breeze', nameKa: 'ნიავი' }],
  9: [{ key: 'bird', mark: '🐦', name: 'Bluebird helper', nameKa: 'ლურჯი ჩიტი' }],
  10: [
    { key: 'golden', mark: '🌟', name: 'Golden ball', nameKa: 'ოქროს ბურთი' },
    { key: 'gem', mark: '💎', name: 'Gems', nameKa: 'ძვირფასი ქვები' },
  ],
};

// The little label each new thing has beside it the first time it comes in a game, in English and Georgian.
// Nothing new is said out loud.
export const LABELS = {
  star: ['Catch the star!', 'დაიჭირე ვარსკვლავი!'],
  bubble: ['Bubble ball!', 'ბუშტის ბურთი!'],
  flags: ['A flag for each hit!', 'ყოველ დარტყმაზე დროშა!'],
  big: ['Big racket!', 'დიდი ჩოგანი!'],
  castle: ['Hit the sandcastle!', 'ქვიშის ციხეს მოარტყი!'],
  rainbow: ['Rainbow ball!', 'ცისარტყელა ბურთი!'],
  breeze: ['A breeze!', 'ნიავი!'],
  bird: ['Bluebird!', 'ლურჯი ჩიტი!'],
  golden: ['Golden ball!', 'ოქროს ბურთი!'],
};

/** What's new at a level, as [{ key, mark, name, nameKa }]. Nothing at level 1. */
export const bounceNewAt = (level) => NEWS[clampLevel(level)] ?? [];

/** Whether the part of a level that a piece of news names is on. */
export function newsIsOn(key, level) {
  const plan = courtLevel(level);
  const on = {
    stars: plan.stars,
    bubble: plan.specials.includes('bubble'),
    flags: plan.flags > 0,
    trophy: plan.flags > 0,
    bigRacket: plan.bigRacket,
    castles: plan.castles > 0,
    shell: plan.castles > 0,
    rainbow: plan.specials.includes('rainbow'),
    breeze: plan.breeze > 0,
    bird: plan.bird,
    golden: plan.golden && plan.specials.includes('golden'),
    gem: plan.golden,
  };
  return Boolean(on[key]);
}

/**
 * The ball for a point. point counts from 1. Every third point has a special ball, taking turns, the newest
 * first. At level 10 the child's last point, when one more would win, is always golden. With friends,
 * extras is false and it's always the beach ball, the same for both.
 */
export function ballFor(level, point, { lastPoint = false, extras = true } = {}) {
  if (!extras) return 'beach';
  const plan = courtLevel(level);
  if (plan.golden && lastPoint) return 'golden';
  if (!plan.specials.length || point % 3 !== 0) return 'beach';
  return plan.specials[(point / 3 - 1) % plan.specials.length];
}

/** How many of the child's hits the computer returns in a point before it misses: [fewest, most]. */
export function missAfterRange(hard, level) {
  const rally = RALLIES[hard] ?? RALLIES.gentle;
  return [rampWhole(level, rally.first[0], rally.last[0]), rampWhole(level, rally.first[1], rally.last[1])];
}

/** Seconds for one crossing, at a speed, level, kind of ball and How hard. */
export function crossingSeconds(pace, level, kind = 'beach', hard = 'gentle') {
  return ((PACES[pace] ?? PACES.slow) / courtLevel(level, hard).speed) * (BALLS[kind]?.slow ?? 1);
}

export const gravityFor = (crossing) => ARC / (crossing * crossing);

/** Seconds a shot takes from one place to another: a long shot takes a little longer than a short one. */
export const shotSeconds = (from, to, crossing) => crossing * clamp(Math.sqrt(Math.abs(to.u - from.u) / 1.3), 0.75, 1.2);

/**
 * Moves the ball on by dt seconds, under gravity and the breeze, bouncing off the court and the net.
 * env is { gravity, wind }. Returns what happened on the way, in order: { type: 'bounce', u, speed }, with
 * settled for the last bounce of a ball coming to rest, { type: 'net' }, and { type: 'cross', to }.
 */
export function advanceBall(ball, dt, env, events = []) {
  let left = Math.max(0, dt);
  while (left > 1e-9) {
    const step = Math.min(left, STEP);
    left -= step;
    const was = sideAt(ball.u);
    if (ball.rolling) {
      ball.vu *= Math.exp(-ROLLING * step);
      ball.u += ball.vu * step;
      ball.h = COURT.ball;
    } else {
      ball.vh -= env.gravity * step;
      ball.vu += (env.wind ?? 0) * step;
      ball.u += ball.vu * step;
      ball.h += ball.vh * step;
    }
    hitNet(ball, was, events);
    if (!ball.rolling && ball.h < COURT.ball && ball.vh < 0) {
      const speed = -ball.vh;
      ball.vu *= BOUNCE.along;
      if (speed * BOUNCE.keep < SETTLE_SPEED) {
        ball.h = COURT.ball;
        ball.vh = 0;
        ball.rolling = true;
        events.push({ type: 'bounce', u: ball.u, speed, settled: true });
      } else {
        ball.h = COURT.ball + (COURT.ball - ball.h) * BOUNCE.keep;
        ball.vh = speed * BOUNCE.keep;
        events.push({ type: 'bounce', u: ball.u, speed });
      }
    }
    const now = sideAt(ball.u);
    if (now !== was) events.push({ type: 'cross', to: now });
  }
  return events;
}

/** A ball touching the net comes back off it softly, on the side it came from. */
function hitNet(ball, was, events) {
  const reach = COURT.ball + COURT.netHalf;
  if (ball.h <= COURT.net) {
    if (Math.abs(ball.u) >= reach) return;
    ball.u = signOf(was) * reach;
    ball.vu = -ball.vu * 0.35;
    events.push({ type: 'net' });
    return;
  }
  // Over the tape at the top: it rolls off it, one way or the other.
  const du = ball.u;
  const dh = ball.h - COURT.net;
  const gap = Math.hypot(du, dh);
  if (gap >= reach || gap === 0) return;
  const [nu, nh] = [du / gap, dh / gap];
  const along = ball.vu * nu + ball.vh * nh;
  if (along < 0) {
    ball.vu -= 1.4 * along * nu;
    ball.vh -= 1.4 * along * nh;
    events.push({ type: 'net' });
  }
  ball.u = nu * reach;
  ball.h = COURT.net + nh * reach;
}

/** The time a shot gets to the net, or null if it doesn't get there before it arrives. */
function timeToNet(from, { vu, seconds = Infinity }, wind) {
  let t = null;
  if (Math.abs(wind) < 1e-9) {
    if (Math.abs(vu) > 1e-9 && -from.u / vu > 0) t = -from.u / vu;
  } else {
    // from.u + vu t + wind t² / 2 = 0, the first time after now.
    const a = wind / 2;
    const disc = vu * vu - 4 * a * from.u;
    if (disc >= 0) {
      const roots = [(-vu - Math.sqrt(disc)) / (2 * a), (-vu + Math.sqrt(disc)) / (2 * a)].filter((root) => root > 1e-6);
      if (roots.length) t = Math.min(...roots);
    }
  }
  return t !== null && t <= seconds ? t : null;
}

/** How high a shot is as it goes over the net, or Infinity if it doesn't go over it. */
export function heightAtNet(from, shot, env) {
  const t = timeToNet(from, shot, env.wind ?? 0);
  if (t === null) return Infinity;
  return from.h + shot.vh * t - (env.gravity * t * t) / 2;
}

export const NET_CLEARANCE = COURT.net + COURT.ball + NET_MARGIN;
// The highest a shot goes, so that it stays below the score at the top of the screen.
export const APEX = 0.85;

/** How high a shot goes. */
export const apexOf = (from, { vh }, env) => from.h + (vh > 0 ? (vh * vh) / (2 * env.gravity) : 0);

/**
 * Whether a shot clears the net with room to spare: high enough as it goes over, and never touching it, even
 * coming down steeply just past it. It's flown to see, by the same rules as the ball itself.
 */
export function clearsNet(from, shot, env) {
  if (heightAtNet(from, shot, env) < NET_CLEARANCE) return false;
  const ball = { ...from, vu: shot.vu, vh: shot.vh, rolling: false };
  return !advanceBall(ball, shot.seconds, env).some(({ type }) => type === 'net');
}

/**
 * The shot from one place to another in about this many seconds: { vu, vh, seconds }. If that would touch
 * the net, it goes higher and takes a little longer until it clears it. If it would go up behind the score,
 * it goes a little quicker and lower instead, as long as it still clears the net.
 */
export function solveShot(from, to, seconds, env) {
  const wind = env.wind ?? 0;
  const make = (time) => ({
    vu: (to.u - from.u - (wind * time * time) / 2) / time,
    vh: (to.h - from.h + (env.gravity * time * time) / 2) / time,
    seconds: time,
  });
  let shot = make(seconds);
  for (let tries = 0; tries < 14 && !clearsNet(from, shot, env); tries += 1) shot = make(shot.seconds * 1.12);
  const highest = Math.max(APEX, from.h + 0.04, to.h + 0.04);
  for (let tries = 0; tries < 10 && apexOf(from, shot, env) > highest; tries += 1) {
    const quicker = make(shot.seconds * 0.93);
    if (quicker.seconds < seconds * 0.6 || !clearsNet(from, quicker, env)) break;
    shot = quicker;
  }
  return shot;
}

/** Whether an open racket is touching the ball. A racket that isn't seen, or isn't open, never is. */
export function touches(ball, racket) {
  if (!racket?.visible || !racket.open) return false;
  return Math.hypot(ball.u - racket.u, ball.h - racket.h) <= racket.radius + COURT.ball;
}

/** Keeps a racket on its own side, clear of the net, and above the court. */
export function keepOnSide(side, u, h) {
  const along = clamp(Number.isFinite(u) ? u * signOf(side) : 0.6, 0.08, 1.25);
  return { u: along * signOf(side), h: clamp(Number.isFinite(h) ? h : 0.45, COURT.ball, 1.6) };
}

/**
 * Where to send the ball to a player on this side, at their racket, or a little way off it by spread, or
 * where they stand if their hand can't be seen. random is a function from 0 to 1.
 */
export function aimAt(side, racket, spread = 0, random = Math.random) {
  const s = signOf(side);
  const base = racket?.visible ? { u: racket.u, h: racket.h } : { u: s * 0.6, h: 0.45 };
  const off = spread > 0 ? (random() < 0.5 ? -1 : 1) * spread * (0.6 + 0.4 * random()) : 0;
  return { u: s * clamp(Math.abs(base.u) + off, 0.28, 1), h: clamp(base.h - off * 0.4, 0.3, 0.72) };
}

// With a friend, once a rally is this long, each shot goes a little further from the other's hand, so that a
// long rally ends sometime: the computer misses on purpose instead.
export const RALLY_GROWS_AFTER = 6;

/**
 * How far off a shot goes from the other player's hand: How hard's own at this level, and more in a long rally
 * with a friend.
 */
export function spreadFor(hard, rally = 0, friends = false, level = 1) {
  const growing = friends ? clamp((rally - RALLY_GROWS_AFTER) * 0.03, 0, 0.25) : 0;
  return aimAtLevel(hard, level) + growing;
}

/** Where the child's shot lands on the computer's side: on a sandcastle that's standing, now and then. */
export function landingOn(side, castles = [], random = Math.random) {
  const s = signOf(side);
  const standing = castles.filter((castle) => castle.standing);
  if (standing.length && random() < EXTRAS.castleAim) {
    return { u: standing[Math.floor(random() * standing.length)].u, h: COURT.ball, castle: true };
  }
  return { u: s * (0.45 + 0.4 * random()), h: COURT.ball };
}

// A ball is always hit from at least this far from the net, so it can't start off touching it, and from
// further back the lower it is, so it doesn't have to go straight up to get over.
export const OFF_THE_NET = COURT.ball + COURT.netHalf + 0.04;
const LOW_BY_THE_NET = 0.6;

/** A shot from where the ball is to target, in about one crossing. */
export function shotTo(ball, target, crossing, env) {
  const s = Math.sign(ball.u) || -Math.sign(target.u) || 1;
  const h = Math.max(ball.h, COURT.ball);
  const room = OFF_THE_NET + Math.max(0, NET_CLEARANCE - h) * LOW_BY_THE_NET;
  const from = { u: s * Math.max(Math.abs(ball.u), room), h };
  return { from, ...solveShot(from, target, shotSeconds(from, target, crossing), env) };
}

// A grown-up's choices: how hard, how quick, and how many points win.
export const HARD = ['gentle', 'medium', 'tough'];
export const PACE_NAMES = ['slow', 'medium', 'fast'];
export const POINTS = [5, 7, 11];
// Playing together with a friend, how many hits the two of them make between them, from the host's points to win.
export const TEAM_HITS = { 5: 20, 7: 30, 11: 40 };
export const teamHits = (points) => TEAM_HITS[points] ?? TEAM_HITS[5];
const capital = (word) => word.charAt(0).toUpperCase() + word.slice(1);

/** How hard and how quick, together in one word for a friend's game, as in gentleSlow or toughFast. */
export const modeWord = (hard, pace) => `${HARD.includes(hard) ? hard : 'gentle'}${capital(PACE_NAMES.includes(pace) ? pace : 'slow')}`;

/** The same, read back: anything else is Gentle and slow. */
export function readMode(word = '') {
  const hard = HARD.find((each) => String(word).startsWith(each)) ?? 'gentle';
  const pace = String(word).slice(hard.length).toLowerCase();
  return { hard, pace: PACE_NAMES.includes(pace) ? pace : 'slow' };
}

// What goes between friends' games, as small numbers: see server/race-room.js.
export const STATES = ['held', 'flying', 'waiting', 'dead'];
export const codeOf = (side) => (side === 'A' ? 1 : side === 'B' ? 2 : 0);
export const sideOf = (code) => (code === 1 ? 'A' : code === 2 ? 'B' : null);
