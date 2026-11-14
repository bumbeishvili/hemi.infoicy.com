// The story and rules of Tank Patrol. Robot tanks are rolling into Giraffe's valley, and he's riding in the
// child's tank to stop them. The hand is a pointer: a closed hand drives the tank to where it points,
// and an open hand swings the turret there, and the gun fires by itself at any robot tank under it that
// is in range. Closing to drive nearer and opening to fire is the exercise, and that's how it's won.
//
// A hand that's missing, out of the picture or can't be read does nothing at all: it doesn't fire and
// it doesn't drive. If it's gone for a moment or stays the same for a few seconds, that's a rest, and the
// robots stop and wait. There's no screen, sound or camera in this file, so it all runs in the unit tests.
import { ramp, stepsAt } from '../../core/levels.js';
import { PLAY, SPAWNS, START, TANK_RADIUS, clampToPlay, groundY, valleyNav } from './valley-map.js';

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const between = (random, [low, high]) => low + random() * (high - low);
const mix = (from, to, share) => from + (to - from) * share;
const damp = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));
/** The shortest way round from one direction to another. */
const turnBetween = (to, from) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
/** Which way it is from one place to another. Heading 0 is up the valley, away from the camera. */
export const headingTo = (dx, dz) => Math.atan2(dx, -dz);
const gapBetween = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * What each level changes, from level 1, which is the game as it always was, up to level 10. The
 * numbers are shares of, or additions to, the speed and difficulty a grown-up chose, so a level never
 * changes those choices, the number of tanks, the reach help, the tank driving itself, or Gentle being
 * impossible to lose. Resting stops everything new here, just as it stops the rest.
 */
export function levelPlan(level = 1) {
  return {
    enemy: ramp(level, 1, 1.3), // Robot tanks roll faster, up to 30% faster at level 10.
    hold: ramp(level, 1, 0.65), // They wait less long before moving on somewhere else.
    standoff: ramp(level, 0, 4), // They keep a little further off, so there's more driving to get them in range.
    lobEvery: ramp(level, 1, 0.65), // Shells come more often.
    shellSeconds: ramp(level, 1, 0.8), // They come over a little quicker, never under 80% as long.
    moreFirst: stepsAt(level, { 1: 0, 5: 1 }), // One more robot tank about from the start from level 5.
    moreMost: stepsAt(level, { 1: 0, 3: 1, 8: 2 }), // And up to one more at once from level 3, and two from level 8.
    inAir: stepsAt(level, { 1: 0, 6: 1 }), // One more shell can be on its way at once from level 6.
    dash: level >= 3, // From level 3, scouts dash from place to place.
    pairs: level >= 4, // From level 4, robot tanks come in pairs and keep together.
    lead: stepsAt(level, { 1: 0, 5: 0.15, 8: 0.3 }), // From level 5, shells allow for the tank driving along.
    retreat: level >= 6, // From level 6, a tank that's taken half its hits runs off out of range, once.
    doubleShell: stepsAt(level, { 1: 0, 7: 1, 9: 2 }), // Heavy tanks lob two shells at once, landing apart, from level 7, and bashers from level 9.
    // Something new to see and play with at every level from 2, on top of all that. See NEWS below.
    bolts: level >= 2, // Stopped tanks drop bolts, which roll over to the child's tank.
    spread: level >= 3, // Crates with a triple shot in them: three balls at once.
    shield: level >= 4, // Shield tanks, which have to be hit from the side, or until the shield gets tired.
    bubble: level >= 5, // Crates with bubble shots, which trap a robot tank in a floating bubble.
    gems: level >= 5, // Bigger tanks drop a gem as well.
    cage: level >= 6, // The robots have put a friend in a cage, and firing at it lets them out.
    digger: level >= 7, // Digger tanks, which dig down and pop up somewhere else.
    heart: level >= 7, // Crates with a heart in them, when one's been lost.
    boing: level >= 8, // Crates with a boing ball, a big slow ball that bounces on from tank to tank.
    magnet: level >= 8, // Crates with a magnet, which pulls everything to the tank at once.
    sunset: level >= 8, // The patrol goes on into the evening, in warm sunset light.
    splitter: level >= 9, // Splitting tanks, which come apart into two little ones.
    slow: level >= 9, // Crates with slow motion in them, for the robot tanks and their shells.
    boss: level >= 10, // The last tank is the big boss, whose parts come off one at a time.
    treasure: level >= 10, // And the boss leaves a treasure chest full of gold stars.
  };
}

/**
 * How much harder each level is again on Medium and Tough, where the shells can win, on top of levelPlan.
 * Gentle keeps the game exactly as it always was, so for Gentle every number here leaves things as they are.
 * Level 1 is the same on every setting, so a child who has never played can learn it. By level 10 shells come
 * about twice as often as at level 1 and take a little over half as long to come over, they allow more for
 * the tank driving along, and hearts come back half as quickly.
 */
export function challengePlan(level = 1, canLose = true) {
  if (!canLose) return { lobEvery: 1, shellSeconds: 1, lead: 0, healAfter: 1 };
  return {
    lobEvery: ramp(level, 1, 0.8), // With levelPlan's, shells come about twice as often at level 10.
    shellSeconds: ramp(level, 1, 0.75), // With levelPlan's, they come over in 60% of level 1's time.
    lead: ramp(level, 0, 0.35), // They aim further ahead of a tank on the move.
    healAfter: ramp(level, 1, 2), // A heart takes up to twice as long to come back.
  };
}

/**
 * What each level brings that's new, shown on the title card, under the countdown and as coming up next.
 * Each key is something levelPlan switches on at that level.
 */
export const NEWS = {
  2: [{ key: 'bolts', mark: '🔩', name: 'Bolts', nameKa: 'ჭანჭიკები' }],
  3: [{ key: 'spread', mark: '🔱', name: 'Triple shot', nameKa: 'სამმაგი გასროლა' }, { key: 'dash', mark: '⚡', name: 'Dashing scouts', nameKa: 'სწრაფი მზვერავები' }],
  4: [{ key: 'shield', mark: '🛡️', name: 'Shield tanks', nameKa: 'ფარიანი ტანკები' }, { key: 'pairs', mark: '🔗', name: 'Tanks in pairs', nameKa: 'წყვილი ტანკები' }],
  5: [{ key: 'bubble', mark: '🫧', name: 'Bubble shot', nameKa: 'ბუშტის გასროლა' }, { key: 'gems', mark: '💎', name: 'Gems', nameKa: 'ძვირფასი ქვები' }],
  6: [{ key: 'cage', mark: '🔓', name: 'Caged friend', nameKa: 'მეგობარი გალიაში' }, { key: 'retreat', mark: '💨', name: 'Runaway tanks', nameKa: 'გაქცეული ტანკები' }],
  7: [{ key: 'digger', mark: '🕳️', name: 'Digger tanks', nameKa: 'მთხრელი ტანკები' }, { key: 'heart', mark: '❤️', name: 'Extra hearts', nameKa: 'დამატებითი გული' }],
  8: [{ key: 'boing', mark: '🏀', name: 'Boing ball', nameKa: 'ხტუნია ბურთი' }, { key: 'magnet', mark: '🧲', name: 'Magnet', nameKa: 'მაგნიტი' }, { key: 'sunset', mark: '🌅', name: 'Sunset', nameKa: 'მზის ჩასვლა' }],
  9: [{ key: 'splitter', mark: '🧩', name: 'Splitting tanks', nameKa: 'ორად გაყოფადი ტანკები' }, { key: 'slow', mark: '🐌', name: 'Slow motion', nameKa: 'ნელი დრო' }],
  10: [{ key: 'boss', mark: '👑', name: 'Big boss tank', nameKa: 'დიდი უფროსი ტანკი' }, { key: 'treasure', mark: '🎁', name: 'Treasure chest', nameKa: 'განძის ზანდუკი' }],
};

/** What's new at a level, as the shared level cards want it. Level 1 has nothing new. */
export const newsAt = (level) => NEWS[level] ?? [];

// The power-ups that come in crates, and what each is called when it first turns up.
export const POWERS = {
  spread: { mark: '🔱', name: 'Triple shot', nameKa: 'სამმაგი გასროლა', fire: true, seconds: 10 },
  bubble: { mark: '🫧', name: 'Bubble shot', nameKa: 'ბუშტის გასროლა', fire: true, seconds: 10 },
  heart: { mark: '❤️', name: 'Extra heart', nameKa: 'დამატებითი გული', seconds: 0 },
  boing: { mark: '🏀', name: 'Boing ball', nameKa: 'ხტუნია ბურთი', fire: true, seconds: 10 },
  magnet: { mark: '🧲', name: 'Magnet', nameKa: 'მაგნიტი', seconds: 10 },
  slow: { mark: '🐌', name: 'Slow motion', nameKa: 'ნელი დრო', seconds: 8 },
};

// The prizes, which the levels bring in as they go.
export const PRIZES = {
  bolt: { mark: '🔩', name: 'Bolts', nameKa: 'ჭანჭიკები' },
  gem: { mark: '💎', name: 'Gems', nameKa: 'ძვირფასი ქვები' },
  star: { mark: '🌟', name: 'Gold stars', nameKa: 'ოქროს ვარსკვლავები' },
};

// How fast it all goes. drive and enemy are in units a second, and out is how many robot tanks are
// about at once, from the first to the most, as more come when others are stopped.
export const PACES = {
  slow: { drive: 10, enemy: 3.2, out: [3, 4] },
  medium: { drive: 13, enemy: 4.4, out: [3, 5] },
  fast: { drive: 17, enemy: 5.8, out: [4, 6] },
};

// How hard the shells come. On Gentle the child can't lose, as hearts stop at one. toughness multiplies
// how many hits a tank can take, and lead is how much a shell allows for the tank moving.
export const LEVELS = {
  gentle: { hearts: 5, canLose: false, lobEvery: [6, 9], shellSeconds: 3.8, blast: 5, inAir: 1, healAfter: 6, firstLob: 14, toughness: 1, lead: 0 },
  medium: { hearts: 4, canLose: true, lobEvery: [3.6, 6], shellSeconds: 3.1, blast: 5.5, inAir: 2, healAfter: 14, firstLob: 7, toughness: 1.25, lead: 0.25 },
  tough: { hearts: 3, canLose: true, lobEvery: [2.6, 4.5], shellSeconds: 2.6, blast: 6, inAir: 3, healAfter: 14, firstLob: 4, toughness: 1.5, lead: 0.5 },
};

// How much the crosshair is pulled onto a robot tank near it, in units beyond the tank's own size. Even
// the least of these is generous, as precision isn't what this game is about.
export const AIM_HELP = {
  none: { radius: 6, pull: 0.75 },
  little: { radius: 10, pull: 0.92 },
  lots: { radius: 16, pull: 1 },
};

export const GUN = { range: 21, every: 0.5, aligned: 0.32, turn: 6.5, shotSpeed: 62 };

export const KINDS = {
  scout: { hp: 4, size: 3.2, speed: 1.12 },
  basher: { hp: 6, size: 3.7, speed: 1 },
  heavy: { hp: 9, size: 4.6, speed: 0.82 },
  // The kinds the levels bring in.
  shield: { hp: 5, size: 3.7, speed: 0.95 },
  digger: { hp: 4, size: 3.4, speed: 1.05 },
  splitter: { hp: 4, size: 4.2, speed: 0.9 },
  mini: { hp: 2, size: 2.6, speed: 1 },
  boss: { hp: 12, size: 5.8, speed: 0.72 },
};

// Bolts each kind drops when it's stopped, from level 2, and which drop a gem too, from level 5.
const BOLTS = { scout: 3, basher: 4, heavy: 5, shield: 4, digger: 4, splitter: 3, mini: 2, boss: 6, cage: 3 };
const GEMS = { heavy: 1, shield: 1, digger: 1, splitter: 1, boss: 2 };
const STARS_IN_A_CHEST = 6;
const PRIZE_SETTLE = 0.9; // A prize bounces where it fell for this long, so it can be seen...
const PRIZE_SPEED = [8, 40]; // ...and then rolls over to the child's tank, faster as it goes.
const PRIZE_PICKED = 3.4; // How near the tank a prize has to be to be picked up.
const CRATE_SECONDS = 22; // A crate waits this long, drifting slowly over, before it goes. Missing it costs nothing.
const CRATE_DRIFT = 2.6;
const CRATE_DRIVE_NEAR = 9; // Driving this near a crate picks it up...
const CRATE_POINT_NEAR = 6; // ...and so does pointing at it, with either hand shape.
const CRATE_ZIP = 34;
const MAGNET_SHARE = 2.2; // With the magnet, everything comes over this much faster, and at once.
const SLOW_SHARE = 0.55; // In slow motion, robot tanks go at this share of their speed...
const SLOW_SHELLS = 0.6; // ...and shells and lobbing at this share.
const SPREAD_REACH = 16; // A triple shot's side balls go for other tanks this near the one aimed at.
const SPREAD_ANGLE = 0.32;
const BUBBLE_SECONDS = 4; // A tank trapped in a bubble floats there, doing nothing, for this long...
const BUBBLE_DAMAGE = 2; // ...and every hit on it counts this many times.
const BOING_BOUNCES = 2; // A boing ball goes on to this many more tanks...
const BOING_REACH = 24; // ...if they're this near the one it's just hit.
const SHIELD_COVER = 0.95; // A shot from within this angle of where the shield's facing bounces off it.
const SHIELD_TURN = 0.35; // How quickly the shield turns to face the child's tank: slower than driving round it.
const SHIELD_TIRES = 4; // After this many bounces the shield gets tired and drops.
export const DIG_SECONDS = { down: 1.1, under: 2.4, up: 0.8 };
const DIGS_AT_MOST = 3;
const CAGE = { hp: 5, size: 2.6, room: 1 }; // room is how much more room tanks leave round it than round a house.
// Free places for the cage, on the near side of the river, away from the start. Each has room round it,
// so that with the cage in the way, tanks can still get everywhere: see wallIn.
export const CAGE_SPOTS = [{ x: -30, z: 6 }, { x: 34, z: 7 }, { x: -22, z: 7 }, { x: 22, z: 3 }];
export const FRIENDS = ['mochi', 'kit', 'widget', 'frost', 'bramble', 'nova', 'truffle', 'cinder', 'tur'];
const CRATE_EVERY = 2; // Every other tank stopped drops a crate, starting with the first.
const CHEST_OPENS = 1.6; // The boss's treasure chest sits for a moment, and then opens.
const SHOT_SPEED = { bubble: 0.55, boing: 0.42 }; // Bubbles and boing balls are slow, so they can be watched.
const SOLO = ['digger', 'boss', 'mini']; // These don't come in pairs.

const CHILD = { turn: 3.2, accel: 26, brake: 42, arrive: 3.2, stopWithin: 0.9 };
const ROBOT = { turn: 1.5, accel: 8, brake: 12, turretTurn: 1.8, arrive: 2.5, reached: 2.2 };
export const STANDOFF = [GUN.range + 6, GUN.range + 14]; // Just out of the gun's reach, so that it takes driving.
const HOLD_SECONDS = [2.5, 5];
const TOO_NEAR = 10;
const THINK_AGAIN_SECONDS = 0.6; // Working out a new way to go takes a moment, so it isn't done too often.
const APART = 9.5; // How far apart robot tanks keep.
const STUN_SECONDS = 1; // A tank being fired on stays where it is, so there's no chasing it about.
const HIT_SECONDS = 0.28;
const RATTLE_SECONDS = 1.3; // It rattles to a halt.
const WAVE_SECONDS = 3.4; // Its crew climbs out and waves.
const FADE_SECONDS = 1.3; // And it fades away.
const NEXT_TANK_SECONDS = 0.9;
const DASH = 1.75; // How much faster a dashing scout goes than the others.
const PAIR_APART = 10; // How far apart a pair keeps, side by side.
const SECOND_SHELL_APART = 11; // How far the second of two shells lands from the first.
const LOBS_TWO = ['heavy', 'basher']; // In this order, as the levels go up: see levelPlan.
const WON_AFTER = 3.4; // Long enough to see the last crew climb out and wave.
const LOST_AFTER = 1;
const HURT_SECONDS = 0.8;
const SHELL_HEIGHT = 17;
const SCOOT_FROM = 0.2; // How far through a shell's flight a tank driving by itself gets out of the way.
const STOP_SHORT = 0.72; // Driving at a robot tank, it stops this far into its range and doesn't go right up to it.
const ON_A_TANK = 3; // How near the hand has to be to a robot tank to be driving at it, beyond its size.

const GONE_REST_SECONDS = 3; // With no hand, that's a rest.
const STILL_REST_SECONDS = 5; // With nothing changing, so is that.
const STILL_MOVES = 2.5; // Less movement than this, in units on the ground, is still keeping still.
const AFTER_REST_SECONDS = 2.5;

// A hand coming into view counts as closed until it has proved it's open, and so can one going past on its
// way to something else. So it has to stay closed this long before the tank goes anywhere.
const CLOSED_FOR_DRIVING = 0.22;

const FLOW_EVERY = 0.12; // How often the way to where the hand is pointing gets worked out again.
const ROUTE_EVERY = 0.1;
const STUCK_AFTER = 0.8; // Trying to move and not getting anywhere for this long...
const SLIP_SECONDS = 0.7; // ...and it goes straight through whatever's stopping it.

/** The hand in play, as this game needs it. Anything uncertain neither fires nor drives. */
export function readHand(snapshot) {
  const hand = snapshot[snapshot.side];
  if (snapshot.handOpen) return 'open';
  if (hand.status === 'closed' && hand.reason === 'closed' && !snapshot.overlap) return 'closed';
  return hand.status === 'missing' ? 'none' : 'unsure';
}

/** Which tanks come, in order: small ones to start with, and a big one to finish. None for a battle with a friend. */
export function tanksFor(total, plan = null) {
  if (!(total > 0)) return [];
  const mid = ['scout', 'scout', 'basher', 'scout', 'basher'];
  const line = [];
  for (let i = 0; i < total - 1; i += 1) {
    if (i >= mid.length && (i - mid.length) % 3 === 2) line.push('heavy');
    else line.push(mid[i % mid.length]);
  }
  line.push('heavy');
  if (!plan) return line;
  // The higher levels swap some of them for the new kinds, so the number of tanks stays the same.
  const swap = (from, to, first, every) => {
    let seen = 0;
    line.forEach((kind, index) => {
      if (kind !== from || index === line.length - 1) return;
      if (seen >= first && (seen - first) % every === 0) line[index] = to;
      seen += 1;
    });
  };
  if (plan.shield) swap('basher', 'shield', 0, 2);
  if (plan.digger) swap('scout', 'digger', 1, 3);
  if (plan.splitter) swap('basher', 'splitter', 0, 2);
  if (plan.boss) line[line.length - 1] = 'boss';
  return line;
}

/** Where a shell is now, going over in a high slow arc. */
export function shellPoint(shell) {
  const { share, from, to } = shell;
  return {
    x: mix(from.x, to.x, share),
    y: mix(from.y, to.y, share) + 4 * SHELL_HEIGHT * share * (1 - share),
    z: mix(from.z, to.z, share),
  };
}

let nextId = 1;

export class Patrol {
  /**
   * tanks is how many there are to stop, pace and level are from PACES and LEVELS, help is from
   * AIM_HELP, and driving is 'closed' for a closed hand or 'auto' for the tank driving itself towards
   * whatever's out of range, for a child who can't close easily.
   */
  constructor({ tanks = 6, pace = 'slow', level = 'medium', levelNumber = 1, help = 'little', driving = 'closed', random = Math.random, onEvent = () => {} } = {}) {
    // Where a tank can drive. Each patrol has its own copy of what's in the way, as a closed cage is too,
    // and that mustn't touch any other patrol.
    const valley = valleyNav();
    this.nav = Object.create(valley);
    this.nav.blocked = valley.blocked.slice();
    this.random = random;
    this.onEvent = onEvent;
    this.total = tanks;
    // The level being played, from 1 to 10, which makes it harder within the grown-up's choices.
    this.levelNumber = levelNumber;
    this.plan = levelPlan(levelNumber);
    this.configure({ pace, level, help, driving });
    this.hearts = this.level.hearts;

    this.state = 'ready'; // ready, playing, won or lost.
    this.time = 0;
    this.playSeconds = 0;
    this.tank = { x: START.x, z: START.z, y: groundY(START.x, START.z), heading: 0, turret: 0, speed: 0, turnRate: 0, stuckFor: 0, slipFor: 0 };
    this.hurtLeft = 0;
    this.sinceHurt = 0;

    this.enemies = [];
    this.queue = tanksFor(tanks, this.plan);
    this.shots = [];
    this.shells = [];
    this.nextSpawn = 0;
    this.spawnIn = 0;
    this.lobIn = this.level.firstLob;
    this.gunIn = 0;
    this.firstLobbed = false;
    this.endIn = null;

    this.hand = 'none';
    this.closedFor = 0;
    this.pointer = null;
    this.locked = null;
    this.firing = false;
    this.crosshair = { x: START.x, z: START.z - 10, seen: false };

    this.goal = null;
    this.flow = null;
    this.flowIn = 0;
    this.routeIn = 0;
    this.route = [];
    this.driving = false;

    this.resting = false;
    this.goneFor = 0;
    this.stillFor = 0;
    this.stillAt = null;
    this.lastHand = 'none';

    this.stats = { stopped: 0, shots: 0, hits: 0, dodged: 0, hurts: 0, driven: 0, seconds: 0, firingSeconds: 0 };
    // What the levels bring: prizes to pick up, crates with power-ups in them, and a friend in a cage.
    this.prizes = [];
    this.crates = [];
    this.cages = [];
    this.power = { fire: null, fireLeft: 0, magnetLeft: 0, slowLeft: 0 };
    Object.assign(this.stats, { bolts: 0, gems: 0, stars: 0, chests: 0, friends: 0, powerUps: 0, bonks: 0 });
    // The crates bring this level's new power-up first, and then the others in turn, newest first.
    const powers = Object.keys(POWERS).filter((name) => this.plan[name]);
    const fresh = newsAt(levelNumber).map(({ key }) => key).filter((key) => POWERS[key]);
    this.powerOrder = [...fresh, ...powers.filter((name) => !fresh.includes(name)).reverse()];
    this.cratesDropped = 0;
    this.heartOwed = false; // A heart's turn came with every heart there: see nextPower.
    if (this.plan.cage) this.placeCage();
    this.fill();
  }

  /** Speed, difficulty, help with aiming and how it's driven can change at any time, from the panel. */
  configure({ pace, level, help, driving }) {
    if (pace !== undefined) this.pace = PACES[pace] ?? PACES.slow;
    if (level !== undefined) {
      this.level = LEVELS[level] ?? LEVELS.medium;
      this.challenge = challengePlan(this.levelNumber, this.level.canLose);
      if (this.hearts !== undefined) this.hearts = clamp(this.hearts, 1, this.level.hearts);
    }
    if (help !== undefined) this.help = AIM_HELP[help] ?? AIM_HELP.little;
    if (driving !== undefined) this.autoDrive = driving === 'auto';
  }

  emit(type, details = {}) {
    this.onEvent({ type, ...details });
  }

  begin() {
    this.state = 'playing';
  }

  get stopped() {
    return this.stats.stopped;
  }

  get left() {
    return this.total - this.stats.stopped;
  }

  /** The robot tanks that are still rolling. */
  get rolling() {
    return this.enemies.filter(({ state }) => state === 'rolling');
  }

  /** What the crosshair should look like. */
  get look() {
    if (!this.crosshair.seen) return 'lost';
    if (this.hand === 'closed') return this.closedFor >= CLOSED_FOR_DRIVING ? 'go' : 'ready';
    if (this.hand !== 'open') return 'lost';
    if (!this.locked) return 'ready';
    return this.inRange(this.locked) ? 'firing' : 'far';
  }

  inRange(enemy) {
    return gapBetween(this.tank, enemy) <= GUN.range + enemy.size * 0.5;
  }

  /** Whether a shell is coming down on the tank where it is now. */
  get underShell() {
    return this.shells.some(({ to, blast }) => gapBetween(this.tank, to) <= blast);
  }

  /* ---------- whose tank the robots go by: on a patrol, the child's. With a friend there are two: see team.js ---------- */

  /** The child's tank a robot tank goes by: where it keeps its distance from, and what its turret follows. */
  tankFor() {
    return this.tank;
  }

  /** The tanks the robot tanks keep out of the way of. */
  get childTanks() {
    return [this.tank];
  }

  /** The tank the next shell is for, or null for none just now, as while the hand has gone. */
  lobTarget() {
    return this.goneFor > 0 ? null : this.tank;
  }

  /** Whether the robot tanks wait: while the child rests. */
  get paused() {
    return this.resting;
  }

  /* ---------- robot tanks rolling in ---------- */

  get mostOut() {
    const [first, most] = this.pace.out;
    return Math.min(most + this.plan.moreMost, first + this.plan.moreFirst + Math.floor(this.stats.stopped / 2));
  }

  /* ---------- the numbers in play: the grown-up's choices, made harder by the level ---------- */

  get enemySpeed() {
    return this.pace.enemy * this.plan.enemy * (this.slowing ? SLOW_SHARE : 1);
  }

  /** Whether slow motion, from a crate, is on. */
  get slowing() {
    return this.power.slowLeft > 0;
  }

  /** The kind of fire a crate has given the gun for now, or null for its usual balls. */
  get fireKind() {
    return this.power.fireLeft > 0 ? this.power.fire : null;
  }

  /** A digger that's gone underground can't be seen, or fired at, until it pops up again. */
  hidden(enemy) {
    return Boolean(enemy.dig && enemy.dig.phase !== 'up');
  }

  /** What the gun can fire at: robot tanks that can be seen, and a cage with a friend in it. */
  get targets() {
    const tanks = this.rolling.filter((enemy) => !this.hidden(enemy));
    return this.cages.length ? [...tanks, ...this.cages.filter(({ state }) => state === 'closed')] : tanks;
  }

  get shellSeconds() {
    return this.level.shellSeconds * this.plan.shellSeconds * this.challenge.shellSeconds;
  }

  /** How long a shell waits after the last, from the setting's range, made shorter by the level. */
  lobGap(random = this.random) {
    return between(random, this.level.lobEvery) * this.plan.lobEvery * this.challenge.lobEvery;
  }

  get inAir() {
    return this.level.inAir + this.plan.inAir;
  }

  get lead() {
    return this.level.lead + this.plan.lead + this.challenge.lead;
  }

  fill() {
    while (this.queue.length && this.rolling.length < this.mostOut) {
      if (!this.spawn()) return;
    }
  }

  spawn() {
    // Not on top of one that's only just come in.
    const place = [0, 1, 2].map((i) => SPAWNS[(this.nextSpawn + i) % SPAWNS.length]).find((spot) => this.enemies.every((other) => other.state === 'gone' || gapBetween(other, spot) > 11));
    if (!place) {
      this.spawnIn = 0.4;
      return false;
    }
    this.nextSpawn = (SPAWNS.indexOf(place) + 1) % SPAWNS.length;
    const kind = this.queue.shift();
    const enemy = this.makeEnemy(kind, place);
    // On the higher levels, every other one comes in as the partner of the one before, if it's still about.
    // Diggers and the big boss go about on their own.
    const alone = (other) => other.leader?.state !== 'rolling' && other.partner?.state !== 'rolling' && !SOLO.includes(other.kind);
    const last = this.rolling.filter(alone).at(-1);
    if (this.plan.pairs && last && !SOLO.includes(kind)) {
      enemy.leader = last;
      last.partner = enemy;
    }
    this.enemies.push(enemy);
    this.emit('spawn', { enemy });
    return true;
  }

  /** A robot tank of a kind, at a place. */
  makeEnemy(kind, place) {
    const shape = KINDS[kind];
    const hp = Math.round(shape.hp * this.level.toughness);
    const enemy = {
      id: nextId,
      kind,
      x: place.x,
      z: place.z,
      y: groundY(place.x, place.z),
      heading: Math.PI,
      turret: Math.PI,
      speed: 0,
      turnRate: 0,
      hp,
      maxHp: hp,
      size: shape.size,
      top: shape.speed,
      state: 'rolling',
      stateLeft: 0,
      goal: null,
      flow: null,
      thinkIn: 0,
      holdFor: 0,
      stun: 0,
      hitLeft: 0,
      stuckFor: 0,
      slipFor: 0,
    };
    nextId += 1;
    if (kind === 'shield') Object.assign(enemy, { shieldUp: true, shieldFacing: Math.PI, bonks: 0 });
    if (kind === 'digger') Object.assign(enemy, { dig: null, digs: 0 });
    if (kind === 'boss') enemy.partsOff = 0;
    return enemy;
  }

  /**
   * Somewhere for a tank to go next: out of the gun's reach, on the side of the child it's on already. With a
   * friend's tank on the child's side as well, out of that gun's reach too.
   */
  chooseGoal(enemy) {
    const { random, nav } = this;
    const tank = this.tankFor(enemy);
    if (enemy.leader?.state === 'rolling' && enemy.leader.goal) {
      this.followLeader(enemy);
      return;
    }
    const standoff = STANDOFF.map((far) => far + this.plan.standoff);
    let spot = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const angle = Math.atan2(enemy.x - tank.x, enemy.z - tank.z) + between(random, [-0.9, 0.9]);
      const away = between(random, standoff);
      const place = clampToPlay(tank.x + Math.sin(angle) * away, tank.z + Math.cos(angle) * away);
      spot = nav.nearestFree(clamp(place.x, PLAY.left + 3, PLAY.right - 3), clamp(place.z, PLAY.far + 2, PLAY.near - 2));
      const roomy = this.enemies.every((other) => other === enemy || !other.goal || gapBetween(other.goal, spot) > APART);
      if (roomy && this.childTanks.every((each) => gapBetween(spot, each) > GUN.range * 0.8)) break;
    }
    enemy.goal = spot;
    enemy.flow = nav.flowTo(spot.x, spot.z, enemy.flow);
    enemy.holdFor = between(random, HOLD_SECONDS) * this.plan.hold;
    enemy.thinkIn = THINK_AGAIN_SECONDS;
    // A scout on the higher levels dashes to wherever it's going next.
    enemy.dashing = this.plan.dash && enemy.kind === 'scout';
    if (enemy.dashing) this.emit('dash', { enemy });
  }

  /** The second of a pair goes where the first is going, beside it, on the side away from the child's tank. */
  followLeader(enemy) {
    const { leader } = enemy;
    const { nav } = this;
    const tank = this.tankFor(enemy);
    const dx = leader.goal.x - tank.x;
    const dz = leader.goal.z - tank.z;
    const far = Math.hypot(dx, dz) || 1;
    const side = enemy.id % 2 ? 1 : -1;
    const beside = clampToPlay(leader.goal.x - (dz / far) * PAIR_APART * side, leader.goal.z + (dx / far) * PAIR_APART * side);
    const spot = nav.nearestFree(beside.x, beside.z);
    enemy.goal = spot;
    enemy.flow = nav.flowTo(spot.x, spot.z, enemy.flow);
    enemy.holdFor = leader.holdFor;
    enemy.thinkIn = THINK_AGAIN_SECONDS;
    enemy.dashing = leader.dashing;
  }

  /**
   * Moves a tank towards a place, turning as it goes, and on the spot if it's facing well away from it.
   * It can't drive into anything, and if it somehow can't get anywhere, it goes straight on until it can.
   */
  roll(tank, to, top, { turn, accel, brake, arrive }, dt) {
    const dx = to.x - tank.x;
    const dz = to.z - tank.z;
    const away = Math.hypot(dx, dz);
    const off = turnBetween(headingTo(dx, dz), tank.heading);
    const turned = clamp(off, -turn * dt, turn * dt);
    tank.heading += turned;
    tank.turnRate = dt > 0 ? turned / dt : 0;
    const wanted = top * clamp(1.15 - Math.abs(off) / 1.1, 0, 1) * clamp(away / arrive, 0.12, 1);
    tank.speed += clamp(wanted - tank.speed, -brake * dt, accel * dt);
    this.advance(tank, top, wanted, dt);
  }

  /** Slows a tank to a stop. */
  coast(tank, { brake }, dt) {
    tank.turnRate = 0;
    tank.speed = Math.max(0, tank.speed - brake * dt);
    tank.stuckFor = 0;
    this.advance(tank, 1, 0, dt);
  }

  advance(tank, top, wanted, dt) {
    const { nav } = this;
    const step = tank.speed * dt;
    const nx = tank.x + Math.sin(tank.heading) * step;
    const nz = tank.z - Math.cos(tank.heading) * step;
    const [fromX, fromZ] = [tank.x, tank.z];
    tank.slipFor = Math.max(0, tank.slipFor - dt);
    if (tank.slipFor > 0 || nav.isFree(nx, nz)) {
      tank.x = nx;
      tank.z = nz;
    } else if (nav.isFree(nx, tank.z)) {
      tank.x = nx;
    } else if (nav.isFree(tank.x, nz)) {
      tank.z = nz;
    }
    const moved = Math.hypot(tank.x - fromX, tank.z - fromZ);
    const trying = wanted > top * 0.3 || (wanted > 0.5 && tank.speed > 0.5);
    tank.stuckFor = trying && moved < step * 0.4 ? tank.stuckFor + dt : 0;
    if (tank.stuckFor > STUCK_AFTER) {
      tank.stuckFor = 0;
      tank.slipFor = SLIP_SECONDS;
    }
    tank.y = groundY(tank.x, tank.z);
    return moved;
  }

  moveEnemies(dt, moving) {
    const { nav } = this;
    const top = this.enemySpeed;
    for (const enemy of this.enemies) {
      enemy.hitLeft = Math.max(0, enemy.hitLeft - dt);
      if (enemy.state !== 'rolling') {
        this.settleEnemy(enemy, dt);
        continue;
      }
      const tank = this.tankFor(enemy);
      enemy.stun = Math.max(0, enemy.stun - dt);
      // A bubble waits while the child rests, like the power-ups, so resting never uses it up.
      if (enemy.bubbled && !(this.resting && this.state === 'playing')) enemy.bubbled = Math.max(0, enemy.bubbled - dt);
      const wait = enemy.stun > 0 || enemy.bubbled > 0 || !moving;
      if (enemy.dig) {
        if (moving) this.digging(enemy, dt);
      } else if (wait) {
        this.coast(enemy, ROBOT, dt);
      } else {
        enemy.thinkIn = Math.max(0, enemy.thinkIn - dt);
        // A child's tank is right on top of it, and of where it's going: somewhere else, then.
        const crowded = enemy.goal && this.childTanks.some((each) => gapBetween(enemy, each) < TOO_NEAR && gapBetween(enemy.goal, each) < TOO_NEAR);
        // The second of a pair sets off again when the first does.
        const leaderMoved = enemy.leader?.state === 'rolling' && enemy.leader.goal && enemy.followed !== enemy.leader.goal;
        if (!enemy.goal || (crowded && enemy.thinkIn === 0) || leaderMoved) {
          this.chooseGoal(enemy);
          if (enemy.leader) enemy.followed = enemy.leader.goal;
        }
        const there = gapBetween(enemy, enemy.goal) < ROBOT.reached;
        if (there) {
          this.coast(enemy, ROBOT, dt);
          enemy.dashing = false;
          enemy.running = false;
          enemy.holdFor -= dt;
          if (enemy.holdFor <= 0 && !(enemy.leader?.state === 'rolling')) {
            if (this.canDig(enemy)) this.startDig(enemy);
            else this.chooseGoal(enemy);
          }
        } else {
          const speed = top * enemy.top * (enemy.dashing ? DASH : 1);
          this.roll(enemy, nav.waypoint(enemy.flow, enemy.x, enemy.z, enemy.goal), speed, ROBOT, dt);
        }
      }
      const toChild = headingTo(tank.x - enemy.x, tank.z - enemy.z);
      enemy.turret += clamp(turnBetween(toChild, enemy.turret), -ROBOT.turretTurn * dt, ROBOT.turretTurn * dt);
      // A shield turns slowly to face the child's tank, and not at all while it's being fired on.
      if (enemy.shieldUp && !wait) enemy.shieldFacing += clamp(turnBetween(toChild, enemy.shieldFacing), -SHIELD_TURN * dt, SHIELD_TURN * dt);
    }
    this.keepApart(dt);
    this.enemies = this.enemies.filter(({ state }) => state !== 'gone');
  }

  settleEnemy(enemy, dt) {
    if (enemy.state === 'rattling') enemy.speed = Math.max(0, enemy.speed - 5 * dt);
    if (enemy.state === 'rattling' && enemy.speed > 0) {
      enemy.x += Math.sin(enemy.heading) * enemy.speed * dt;
      enemy.z -= Math.cos(enemy.heading) * enemy.speed * dt;
    }
    enemy.stateLeft -= dt;
    if (enemy.stateLeft > 0) return;
    const next = { rattling: ['waving', WAVE_SECONDS], waving: ['fading', FADE_SECONDS], fading: ['gone', 0] }[enemy.state];
    if (!next) return;
    [enemy.state, enemy.stateLeft] = next;
    if (next[0] === 'waving') this.emit('crew', { enemy });
    if (next[0] === 'gone') this.emit('gone', { enemy });
  }

  /** Robot tanks keep out of each other's way and out of the child's, who is never held up by them. */
  keepApart(dt) {
    const { nav } = this;
    const rolling = this.rolling.filter((enemy) => !this.hidden(enemy));
    const push = (enemy, from, gap, wanted) => {
      if (gap >= wanted || gap < 0.01) return;
      const amount = (wanted - gap) * 2.4 * dt;
      const x = enemy.x + ((enemy.x - from.x) / gap) * amount;
      const z = enemy.z + ((enemy.z - from.z) / gap) * amount;
      if (nav.isFree(x, z)) {
        enemy.x = x;
        enemy.z = z;
        enemy.y = groundY(x, z);
      }
    };
    for (let a = 0; a < rolling.length; a += 1) {
      for (const tank of this.childTanks) push(rolling[a], tank, gapBetween(rolling[a], tank), 8);
      for (let b = a + 1; b < rolling.length; b += 1) {
        const gap = gapBetween(rolling[a], rolling[b]);
        push(rolling[a], rolling[b], gap, APART);
        push(rolling[b], rolling[a], gap, APART);
      }
    }
  }

  /* ---------- shells coming over ---------- */

  lobbing(dt) {
    const { random } = this;
    this.lobIn -= dt * (this.slowing ? SLOW_SHELLS : 1);
    // Nothing new while the hand has gone, as there'd be no way of getting out from under it.
    const tank = this.lobTarget();
    if (this.lobIn > 0 || !tank || this.shells.length >= this.inAir) return;
    // Not from one that's in a bubble or under the ground.
    const able = this.rolling.filter(({ stun, bubbled, dig }) => stun === 0 && !(bubbled > 0) && !dig);
    if (!able.length) return;
    const enemy = able[Math.floor(random() * able.length)];
    this.lobIn = this.lobGap(random);
    const seconds = this.shellSeconds;
    const lead = tank.speed * seconds * this.lead;
    const toX = tank.x + Math.sin(tank.heading) * lead;
    const toZ = tank.z - Math.cos(tank.heading) * lead;
    const first = !this.firstLobbed;
    this.lob(enemy, this.nav.nearestFree(toX, toZ), seconds, first, false, tank);
    // On the higher levels a heavy lobs two, the second landing off to one side of the first.
    const lobsTwo = LOBS_TWO.slice(0, this.plan.doubleShell).includes(enemy.kind) || (enemy.kind === 'boss' && this.plan.doubleShell > 0 && enemy.partsOff === 0);
    if (lobsTwo && this.shells.length < this.inAir) {
      const side = random() < 0.5 ? -1 : 1;
      const across = { x: Math.cos(tank.heading) * side, z: Math.sin(tank.heading) * side };
      const spot = clampToPlay(toX + across.x * SECOND_SHELL_APART, toZ + across.z * SECOND_SHELL_APART);
      this.lob(enemy, this.nav.nearestFree(spot.x, spot.z), seconds, false, true, tank);
    }
  }

  /** target is the tank it's for: the child's, or with a friend on the same side, one of the two. */
  lob(enemy, landing, seconds, first, second = false, target = this.tank) {
    const shell = {
      id: nextId,
      share: 0,
      seconds,
      blast: this.level.blast,
      from: { x: enemy.x, y: enemy.y + 4, z: enemy.z },
      to: { x: landing.x, y: groundY(landing.x, landing.z), z: landing.z },
      target,
      by: enemy.id,
    };
    nextId += 1;
    this.shells.push(shell);
    enemy.lobbedAt = this.time;
    this.emit('lob', { enemy, shell, first, second });
    this.firstLobbed = true;
  }

  moveShells(dt) {
    const pace = this.slowing ? SLOW_SHELLS : 1;
    for (const shell of this.shells) shell.share += (dt * pace) / shell.seconds;
    const landed = this.shells.filter(({ share }) => share >= 1);
    if (!landed.length) return;
    this.shells = this.shells.filter(({ share }) => share < 1);
    for (const shell of landed) {
      const hit = this.struckBy(shell);
      this.emit('land', { shell, hit });
      if (hit) this.hurt();
      else this.stats.dodged += 1;
    }
  }

  /** Whether a shell coming down lands on the child's tank. */
  struckBy(shell) {
    return gapBetween(this.tank, shell.to) <= shell.blast;
  }

  /**
   * Anything on its way when a rest begins goes up in a puff. Nothing bad happens while resting. of is the tank
   * whose shells go, or none for all of them, as at the end.
   */
  fizzleShells(of = null) {
    const going = of ? this.shells.filter(({ target }) => target === of) : this.shells;
    for (const shell of going) this.emit('fizzle', { shell });
    this.shells = this.shells.filter((shell) => !going.includes(shell));
  }

  hurt() {
    const { level } = this;
    this.stats.hurts += 1;
    this.sinceHurt = 0;
    this.hurtLeft = HURT_SECONDS;
    this.hearts = level.canLose ? this.hearts - 1 : Math.max(1, this.hearts - 1);
    this.emit('hurt', { hearts: this.hearts });
    if (this.hearts <= 0 && this.endIn === null) {
      this.ending = 'lost';
      this.endIn = LOST_AFTER;
      this.fizzleShells();
    }
  }

  heal(dt) {
    this.hurtLeft = Math.max(0, this.hurtLeft - dt);
    if (this.hearts >= this.level.hearts || this.hearts <= 0) return;
    this.sinceHurt += dt;
    if (this.sinceHurt >= this.level.healAfter * this.challenge.healAfter) {
      this.sinceHurt = 0;
      this.hearts += 1;
      this.emit('healed', { hearts: this.hearts });
    }
  }

  /* ---------- the hand ---------- */

  /** Whether the child is resting: no hand, or nothing changing, with nothing going on. */
  watchRest(dt, hand, pointer) {
    const gone = hand === 'none' || hand === 'unsure';
    this.goneFor = gone ? this.goneFor + dt : 0;
    let changed = hand !== this.lastHand;
    this.lastHand = hand;
    if (pointer && (!this.stillAt || gapBetween(pointer, this.stillAt) > STILL_MOVES)) {
      this.stillAt = { x: pointer.x, z: pointer.z };
      changed = true;
    }
    const busy = this.firing || this.tank.speed > 0.6;
    this.stillFor = changed || busy || gone ? 0 : this.stillFor + dt;
    const resting = this.goneFor >= GONE_REST_SECONDS || this.stillFor >= STILL_REST_SECONDS;
    if (resting === this.resting) return;
    this.resting = resting;
    if (resting) this.fizzleShells(this.tank);
    else this.lobIn = Math.max(this.lobIn, AFTER_REST_SECONDS);
    this.emit('resting', { on: resting });
  }

  /** The robot tank nearest the hand, sticking with the one it has unless another is clearly nearer. */
  chooseTarget(pointer) {
    const { radius } = this.help;
    let best = null;
    let bestGap = Infinity;
    let currentGap = Infinity;
    for (const enemy of this.targets) {
      const gap = Math.max(0, gapBetween(enemy, pointer) - enemy.size);
      if (enemy === this.locked) currentGap = gap;
      if (gap < bestGap) {
        best = enemy;
        bestGap = gap;
      }
    }
    if (currentGap <= radius * 1.3 && bestGap >= currentGap * 0.6) return this.locked;
    return bestGap <= radius ? best : null;
  }

  /** Where the crosshair is: where the hand is pointing, and pulled onto a tank if it's aiming at one. */
  aim(dt, hand, pointer) {
    this.pointer = pointer;
    const { crosshair } = this;
    crosshair.seen = Boolean(pointer);
    if (!pointer) {
      this.locked = null;
      return;
    }
    this.locked = hand === 'open' ? this.chooseTarget(pointer) : null;
    let { x, z } = pointer;
    if (this.locked) {
      const { radius, pull } = this.help;
      const gap = Math.max(0, gapBetween(this.locked, pointer) - this.locked.size);
      const closeness = clamp((radius - gap) / (radius * 0.5), 0, 1);
      const amount = pull * closeness * closeness * (3 - 2 * closeness);
      x += (this.locked.x - x) * amount;
      z += (this.locked.z - z) * amount;
    }
    crosshair.x = damp(crosshair.x, x, 20, dt);
    crosshair.z = damp(crosshair.z, z, 20, dt);
  }

  /** Where a tank that drives itself goes: towards a target out of range, or out from under a shell. */
  scootGoal() {
    const { tank, locked, shells } = this;
    const shell = shells.find(({ share, to, blast }) => share > SCOOT_FROM && gapBetween(tank, to) <= blast + 0.5);
    if (shell) {
      const dx = tank.x - shell.to.x;
      const dz = tank.z - shell.to.z;
      const gap = Math.hypot(dx, dz);
      // Straight along the way it's pointing, if it's right on top of the place.
      const [wayX, wayZ] = gap < 1 ? [Math.sin(tank.heading), -Math.cos(tank.heading)] : [dx / gap, dz / gap];
      const away = clampToPlay(shell.to.x + wayX * (shell.blast + 4), shell.to.z + wayZ * (shell.blast + 4));
      // With two shells coming down side by side, somewhere clear of both of them.
      return this.plan.doubleShell > 0 ? this.clearOfShells(away, shell) : away;
    }
    return locked && !this.inRange(locked) ? { x: locked.x, z: locked.z } : null;
  }

  /** A place clear of every shell on its way, as near as can be to the one first thought of. */
  clearOfShells(wanted, shell) {
    const clear = (spot) => this.shells.every(({ to, blast }) => gapBetween(spot, to) > blast + 1);
    if (clear(wanted)) return wanted;
    const reach = shell.blast + 4;
    let best = wanted;
    let bestGap = Infinity;
    for (let i = 0; i < 16; i += 1) {
      for (const far of [reach, reach * 1.6]) {
        const angle = (i / 16) * Math.PI * 2;
        const spot = clampToPlay(this.tank.x + Math.sin(angle) * far, this.tank.z - Math.cos(angle) * far);
        const gap = gapBetween(spot, wanted);
        if (clear(spot) && gap < bestGap) {
          best = spot;
          bestGap = gap;
        }
      }
    }
    return best;
  }

  /** The way to where the hand is pointing, worked out again when that's changed. */
  driveTowards(goal, dt) {
    const { nav } = this;
    this.flowIn -= dt;
    const place = nav.nearestFree(goal.x, goal.z);
    if (!this.flow || (this.flowIn <= 0 && (!this.goal || gapBetween(place, this.goal) > nav.cell * 0.75))) {
      this.goal = place;
      this.flow = nav.flowTo(place.x, place.z, this.flow);
      this.flowIn = FLOW_EVERY;
      this.routeIn = 0;
    }
  }

  /** The tank goes where the hand says, if the hand can be read. */
  driveChild(dt, hand, pointer) {
    const { tank, nav } = this;
    let goal = null;
    let stopShort = 0;
    if (pointer && hand === 'closed' && this.closedFor >= CLOSED_FOR_DRIVING) {
      goal = clampToPlay(pointer.x, pointer.z);
      if (this.targets.some((enemy) => gapBetween(enemy, pointer) <= enemy.size + ON_A_TANK)) stopShort = GUN.range * STOP_SHORT;
    } else if (pointer && hand === 'open' && this.autoDrive) {
      goal = this.scootGoal();
      if (goal && this.locked && goal.x === this.locked.x && goal.z === this.locked.z) stopShort = GUN.range - 2;
    }
    this.driving = false;
    if (!goal) {
      this.coast(tank, CHILD, dt);
      this.route = [];
      return;
    }
    this.driveTowards(goal, dt);
    const away = gapBetween(tank, this.goal);
    if (away <= CHILD.stopWithin + stopShort) {
      this.coast(tank, CHILD, dt);
    } else {
      this.driving = true;
      const before = { x: tank.x, z: tank.z };
      const to = nav.waypoint(this.flow, tank.x, tank.z, this.goal);
      this.roll(tank, to, this.pace.drive, CHILD, dt);
      this.stats.driven += gapBetween(before, tank);
    }
    this.routeIn -= dt;
    if (this.routeIn <= 0) {
      this.routeIn = ROUTE_EVERY;
      this.route = nav.route(this.flow, tank.x, tank.z, this.goal);
    }
    this.roundCages();
  }

  /** The tank goes round a cage rather than through it, without ever being held up by it. */
  roundCages() {
    const { tank, nav } = this;
    for (const cage of this.cages) {
      if (cage.state !== 'closed') continue;
      const wanted = cage.size + TANK_RADIUS;
      const gap = gapBetween(tank, cage);
      if (gap >= wanted || gap < 0.01) continue;
      const x = cage.x + ((tank.x - cage.x) / gap) * wanted;
      const z = cage.z + ((tank.z - cage.z) / gap) * wanted;
      if (!nav.isFree(x, z)) continue;
      tank.x = x;
      tank.z = z;
      tank.y = groundY(x, z);
    }
  }

  /** An open hand swings the turret to the crosshair, and it fires at whatever's there and in range. */
  gunnery(dt, hand) {
    const { tank, crosshair, locked } = this;
    this.gunIn = Math.max(0, this.gunIn - dt);
    let wanted = null;
    if (hand === 'open' && crosshair.seen) wanted = locked ? headingTo(locked.x - tank.x, locked.z - tank.z) : headingTo(crosshair.x - tank.x, crosshair.z - tank.z);
    else if (hand === 'closed' && this.driving) wanted = tank.heading;
    if (wanted !== null) {
      const off = turnBetween(wanted, tank.turret);
      tank.turret += clamp(off, -GUN.turn * dt, GUN.turn * dt);
    }
    this.firing = hand === 'open' && Boolean(locked) && this.inRange(locked);
    if (this.firing) {
      this.stats.firingSeconds += dt;
      const aligned = Math.abs(turnBetween(headingTo(locked.x - tank.x, locked.z - tank.z), tank.turret)) <= GUN.aligned;
      if (aligned && this.gunIn === 0) this.fire(locked);
    }
  }

  fire(target) {
    const { tank } = this;
    const kind = this.fireKind;
    this.gunIn = GUN.every * (kind === 'boing' ? 1.5 : 1);
    this.stats.shots += 1;
    const speed = GUN.shotSpeed * (SHOT_SPEED[kind] ?? 1);
    const make = (aim, extra = {}) => {
      const seconds = Math.max(0.12, gapBetween(tank, aim) / speed);
      const shot = { target: aim, share: 0, seconds, kind: kind ?? 'ball', origin: { x: tank.x, z: tank.z }, ...extra };
      this.shots.push(shot);
      return shot;
    };
    const shot = make(target, kind === 'boing' ? { bounces: BOING_BOUNCES, chain: [target] } : {});
    this.emit('shot', { shot, target });
    if (kind !== 'spread') return;
    // A triple shot: two more balls, at whatever else is near the one aimed at, or off to each side of it.
    const others = this.targets
      .filter((other) => other !== target && this.inRange(other) && gapBetween(other, target) <= SPREAD_REACH)
      .sort((a, b) => gapBetween(a, target) - gapBetween(b, target));
    const ahead = headingTo(target.x - tank.x, target.z - tank.z);
    const away = gapBetween(tank, target);
    for (const side of [-1, 1]) {
      let aim = others.shift();
      if (!aim) {
        const angle = ahead + side * SPREAD_ANGLE;
        const x = tank.x + Math.sin(angle) * away;
        const z = tank.z - Math.cos(angle) * away;
        aim = { x, z, y: groundY(x, z), miss: true };
      }
      this.emit('shot', { shot: make(aim, { side: true }), target: aim, side: true });
    }
  }

  moveShots(dt) {
    const born = [];
    for (const shot of this.shots) {
      shot.share += dt / shot.seconds;
      // Once it's over and counted, one still on its way lands on nothing.
      if (shot.share >= 1 && this.state === 'playing') this.hit(shot.target, shot, born);
    }
    this.shots = this.shots.filter(({ share }) => share < 1).concat(born);
  }

  /** A boing ball goes on to the nearest other tank, if there's one near enough. */
  bounce(from, shot, born) {
    if (!(shot.bounces > 0)) return;
    const next = this.targets
      .filter((other) => other.kind !== 'cage' && !shot.chain.includes(other) && gapBetween(other, from) <= BOING_REACH)
      .sort((a, b) => gapBetween(a, from) - gapBetween(b, from))[0];
    if (!next) return;
    const seconds = Math.max(0.3, gapBetween(from, next) / (GUN.shotSpeed * SHOT_SPEED.boing));
    const onward = { target: next, share: 0, seconds, kind: 'boing', bounces: shot.bounces - 1, chain: [...shot.chain, next], origin: { x: from.x, z: from.z }, from: { x: from.x, y: from.y + 2.8, z: from.z } };
    born.push(onward);
    this.emit('bounce', { shot: onward, from, target: next });
  }

  hit(enemy, shot = {}, born = []) {
    if (enemy.kind === 'cage') {
      this.hitCage(enemy);
      return;
    }
    if (enemy.state !== 'rolling' || this.hidden(enemy)) return;
    this.bounce(enemy, shot, born);
    // A shot at the front of a shield bounces off, and after a few of those the shield gets tired.
    if (enemy.shieldUp && shot.kind !== 'bubble' && !(enemy.bubbled > 0)) {
      const from = shot.origin ?? this.tank;
      const off = Math.abs(turnBetween(headingTo(from.x - enemy.x, from.z - enemy.z), enemy.shieldFacing));
      if (off <= SHIELD_COVER) {
        enemy.bonks += 1;
        enemy.stun = STUN_SECONDS;
        enemy.hitLeft = HIT_SECONDS;
        this.stats.bonks += 1;
        this.emit('bonk', { enemy });
        if (enemy.bonks >= SHIELD_TIRES) {
          enemy.shieldUp = false;
          this.emit('shield-down', { enemy });
        }
        return;
      }
    }
    enemy.hp -= enemy.bubbled > 0 ? BUBBLE_DAMAGE : 1;
    enemy.hitLeft = HIT_SECONDS;
    // One running for it doesn't stop to be fired at, until it's got where it's going.
    enemy.stun = enemy.running ? 0 : STUN_SECONDS;
    // A friend's hit, which their game tells this one about, is theirs and not this child's: see team.js.
    if (!shot.friend) this.stats.hits += 1;
    this.emit('hit', { enemy, kind: shot.kind, friend: Boolean(shot.friend) });
    if (enemy.hp <= 0) {
      this.stop(enemy, shot);
      return;
    }
    if (enemy.kind === 'boss') this.knockParts(enemy);
    // A bubble shot traps it in a floating bubble for a while, where every hit counts double. Another
    // bubble shot keeps it in there longer, without making a fuss of it again.
    if (shot.kind === 'bubble') {
      const fresh = !(enemy.bubbled > 0);
      enemy.bubbled = BUBBLE_SECONDS;
      enemy.speed = 0;
      if (fresh) this.emit('bubbled', { enemy });
      return;
    }
    // On the higher levels, once it's taken half its hits it runs for it, out of range, and has to be chased.
    if (this.plan.retreat && !enemy.ranOff && !(enemy.bubbled > 0) && enemy.kind !== 'mini' && enemy.hp <= enemy.maxHp / 2) this.runOff(enemy);
  }

  /** The big boss loses a part with each third of its hits: one cannon, then the other. Its crown comes off last. */
  knockParts(enemy) {
    const wanted = Math.min(2, Math.floor((enemy.maxHp - enemy.hp) / (enemy.maxHp / 3)));
    while (enemy.partsOff < wanted) {
      enemy.partsOff += 1;
      this.emit('part-off', { enemy, part: enemy.partsOff });
      this.dropPrizes(enemy, 'cage');
      this.dropCrate(enemy);
    }
  }

  runOff(enemy) {
    const { nav } = this;
    const tank = this.tankFor(enemy);
    enemy.ranOff = true;
    enemy.stun = 0;
    enemy.leader = null;
    const dx = enemy.x - tank.x;
    const dz = enemy.z - tank.z;
    const far = Math.hypot(dx, dz) || 1;
    const away = STANDOFF[1] + this.plan.standoff;
    const place = clampToPlay(tank.x + (dx / far) * away, tank.z + (dz / far) * away);
    const spot = nav.nearestFree(clamp(place.x, PLAY.left + 3, PLAY.right - 3), clamp(place.z, PLAY.far + 2, PLAY.near - 2));
    enemy.goal = spot;
    enemy.flow = nav.flowTo(spot.x, spot.z, enemy.flow);
    enemy.holdFor = between(this.random, HOLD_SECONDS) * this.plan.hold;
    enemy.thinkIn = THINK_AGAIN_SECONDS * 3;
    enemy.dashing = true;
    enemy.running = true;
    this.emit('run-off', { enemy });
  }

  /** It doesn't blow up. It rattles to a halt, and its crew climbs out and waves. shot is the one that did it. */
  stop(enemy, shot = {}) {
    if (enemy.kind === 'splitter') {
      this.split(enemy);
      return;
    }
    enemy.state = 'rattling';
    enemy.stateLeft = RATTLE_SECONDS;
    enemy.goal = null;
    enemy.flow = null;
    enemy.bubbled = 0;
    // A digger stopped on its way up comes the rest of the way out of the ground.
    enemy.dig = null;
    if (this.locked === enemy) this.locked = null;
    // The first of a split tank's two little halves doesn't count yet: the tank's stopped when both are.
    const part = enemy.sibling?.state === 'rolling';
    if (!part) {
      this.stats.stopped += 1;
      this.spawnIn = NEXT_TANK_SECONDS;
    }
    this.dropPrizes(enemy, enemy.kind);
    if (!part && (this.stats.stopped - 1) % CRATE_EVERY === 0) this.dropCrate(enemy);
    this.emit('stopped', { enemy, stopped: this.stats.stopped, left: this.left, part, friend: Boolean(shot.friend) });
    if (this.left === 0) this.allStopped();
  }

  /** Every robot tank is stopped: the valley's safe, once the last crew has had time to climb out and wave. */
  allStopped() {
    if (this.endIn !== null) return;
    this.ending = 'won';
    this.endIn = WON_AFTER;
    this.fizzleShells();
    // The robots give up, and let any friend still in a cage go.
    for (const cage of this.cages) if (cage.state === 'closed') this.openCage(cage, false);
  }

  /** A splitting tank comes apart into two little ones, which are stopped one after the other. */
  split(enemy) {
    const { nav } = this;
    enemy.state = 'gone';
    if (this.locked === enemy) this.locked = null;
    const across = { x: Math.cos(enemy.heading), z: Math.sin(enemy.heading) };
    const halves = [-1, 1].map((side) => {
      const spot = nav.nearestFree(enemy.x + across.x * 3.4 * side, enemy.z + across.z * 3.4 * side);
      const half = this.makeEnemy('mini', spot);
      Object.assign(half, { heading: enemy.heading, turret: enemy.turret, stun: 0.8, from: { x: enemy.x, z: enemy.z } });
      return half;
    });
    [halves[0].sibling, halves[1].sibling] = [halves[1], halves[0]];
    this.dropPrizes(enemy, enemy.kind);
    this.emit('split', { enemy, halves });
    for (const half of halves) {
      this.enemies.push(half);
      this.emit('spawn', { enemy: half, split: true });
    }
  }

  /* ---------- diggers ---------- */

  canDig(enemy) {
    return enemy.kind === 'digger' && enemy.digs < DIGS_AT_MOST && enemy.stun === 0 && !(enemy.bubbled > 0);
  }

  startDig(enemy) {
    enemy.dig = { phase: 'down', left: DIG_SECONDS.down };
    enemy.speed = 0;
    if (this.locked === enemy) this.locked = null;
    this.emit('dig', { enemy });
  }

  /** Down into the ground, along underneath it, and up again, nearer the child's tank. */
  digging(enemy, dt) {
    const { dig } = enemy;
    const { tank, nav, random } = this;
    dig.left -= dt;
    if (dig.phase === 'under') {
      const share = clamp(1 - dig.left / DIG_SECONDS.under, 0, 1);
      enemy.x = mix(dig.from.x, dig.to.x, share);
      enemy.z = mix(dig.from.z, dig.to.z, share);
      enemy.y = groundY(enemy.x, enemy.z);
    }
    if (dig.left > 0) return;
    if (dig.phase === 'down') {
      let spot = null;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const angle = between(random, [0, Math.PI * 2]);
        const away = between(random, [14, GUN.range - 3]);
        const place = clampToPlay(tank.x + Math.sin(angle) * away, tank.z + Math.cos(angle) * away);
        spot = nav.nearestFree(clamp(place.x, PLAY.left + 3, PLAY.right - 3), clamp(place.z, PLAY.far + 2, PLAY.near - 2));
        if (this.enemies.every((other) => other === enemy || other.state !== 'rolling' || gapBetween(other, spot) > APART)) break;
      }
      Object.assign(dig, { phase: 'under', left: DIG_SECONDS.under, from: { x: enemy.x, z: enemy.z }, to: spot });
    } else if (dig.phase === 'under') {
      Object.assign(dig, { phase: 'up', left: DIG_SECONDS.up });
      enemy.heading = headingTo(tank.x - enemy.x, tank.z - enemy.z);
      this.emit('pop-up', { enemy });
    } else {
      enemy.dig = null;
      enemy.digs += 1;
      // Hit hard on its way up, it's already been told where to run off to, now that it's out.
      if (enemy.running) return;
      enemy.goal = { x: enemy.x, z: enemy.z };
      enemy.flow = nav.flowTo(enemy.x, enemy.z, enemy.flow);
      enemy.holdFor = between(random, HOLD_SECONDS) * this.plan.hold;
    }
  }

  /* ---------- the friend in a cage ---------- */

  placeCage() {
    const where = CAGE_SPOTS[Math.floor(this.random() * CAGE_SPOTS.length)];
    const spot = this.nav.nearestFree(where.x, where.z);
    const cage = { id: nextId, kind: 'cage', x: spot.x, z: spot.z, y: groundY(spot.x, spot.z), size: CAGE.size, hp: CAGE.hp, maxHp: CAGE.hp, state: 'closed', hitLeft: 0, friend: FRIENDS[(this.levelNumber - 1) % FRIENDS.length] };
    nextId += 1;
    this.cages.push(cage);
    this.wallIn(cage, true);
  }

  /**
   * A closed cage is in the way of every tank, as a house is: robot tanks go round it, never stop inside
   * it, and so never hide it from the gun. Once it's open, the way is clear again.
   */
  wallIn(cage, closed) {
    const { nav } = this;
    const valley = valleyNav().blocked;
    const reach = cage.size + TANK_RADIUS + CAGE.room;
    for (let row = nav.rowOf(cage.z - reach); row <= nav.rowOf(cage.z + reach); row += 1) {
      for (let col = nav.colOf(cage.x - reach); col <= nav.colOf(cage.x + reach); col += 1) {
        if (col < 0 || row < 0 || col >= nav.cols || row >= nav.rows) continue;
        const index = row * nav.cols + col;
        if (Math.hypot(nav.centreX(index) - cage.x, nav.centreZ(index) - cage.z) > reach) continue;
        nav.blocked[index] = closed ? 1 : valley[index];
      }
    }
  }

  hitCage(cage) {
    if (cage.state !== 'closed') return;
    cage.hp -= 1;
    cage.hitLeft = HIT_SECONDS;
    this.stats.hits += 1;
    this.emit('cage-hit', { cage });
    if (cage.hp <= 0) this.openCage(cage, true);
  }

  /** The cage opens and the friend hops out. It only counts if the child did it. */
  openCage(cage, byChild) {
    cage.state = 'open';
    cage.hp = 0;
    this.wallIn(cage, false);
    if (this.locked === cage) this.locked = null;
    if (byChild) {
      this.stats.friends += 1;
      this.dropPrizes(cage, 'cage');
    }
    this.emit('freed', { cage, byChild });
  }

  /* ---------- prizes and power-ups ---------- */

  /** What a stopped tank leaves behind, from level 2: bolts, a gem from the bigger ones, and the boss's treasure chest. */
  dropPrizes(at, kind) {
    if (!this.plan.bolts) return;
    const dropped = [];
    const add = (type, count) => {
      for (let i = 0; i < count; i += 1) {
        const angle = ((dropped.length + 0.5) / 7) * Math.PI * 2 + at.x;
        const push = type === 'chest' ? 0 : 9 + (dropped.length % 3) * 2;
        const prize = { id: nextId, type, x: at.x, z: at.z, y: groundY(at.x, at.z), age: 0, vx: Math.sin(angle) * push, vz: Math.cos(angle) * push };
        nextId += 1;
        dropped.push(prize);
      }
    };
    add('bolt', BOLTS[kind] ?? 3);
    if (this.plan.gems) add('gem', GEMS[kind] ?? 0);
    if (kind === 'boss' && this.plan.treasure) add('chest', 1);
    this.prizes.push(...dropped);
    this.emit('prizes', { prizes: dropped, kind });
  }

  /** Every other tank stopped leaves a crate with a power-up in it, this level's new one first. */
  dropCrate(at) {
    const power = this.nextPower();
    if (!power) return null;
    const crate = { id: nextId, power, x: at.x, z: at.z, y: groundY(at.x, at.z), age: 0, zip: false, state: 'waiting' };
    nextId += 1;
    this.crates.push(crate);
    this.emit('crate', { crate });
    return crate;
  }

  /**
   * The power-up for the next crate, going round those this level has. A heart only comes when one's been
   * lost: when its turn comes with every heart there, it waits, and comes in the first crate after one has
   * gone, so that it isn't missed.
   */
  nextPower() {
    if (this.heartOwed && this.hearts < this.level.hearts) {
      this.heartOwed = false;
      return 'heart';
    }
    const order = this.powerOrder;
    for (let i = 0; i < order.length; i += 1) {
      const power = order[(this.cratesDropped + i) % order.length];
      if (power === 'heart' && this.hearts >= this.level.hearts) {
        this.heartOwed = true;
        continue;
      }
      if (power === 'heart') this.heartOwed = false;
      this.cratesDropped += i + 1;
      return power;
    }
    return null;
  }

  /** Prizes roll over to the tank by themselves. Crates drift over slowly, and come at once when driven near or pointed at. */
  moveLoot(dt) {
    const { tank } = this;
    const magnet = this.power.magnetLeft > 0;
    const towards = (thing, speed) => {
      const gap = gapBetween(thing, tank);
      const step = Math.min(gap, speed * dt);
      if (gap > 0.01) {
        thing.x += ((tank.x - thing.x) / gap) * step;
        thing.z += ((tank.z - thing.z) / gap) * step;
      }
      thing.y = groundY(thing.x, thing.z);
      return gap - step <= PRIZE_PICKED;
    };
    const opened = [];
    for (const prize of this.prizes) {
      prize.age += dt;
      if (prize.type === 'chest') {
        if (prize.age >= CHEST_OPENS) {
          prize.done = true;
          this.stats.chests += 1;
          for (let i = 0; i < STARS_IN_A_CHEST; i += 1) {
            const angle = (i / STARS_IN_A_CHEST) * Math.PI * 2;
            opened.push({ id: nextId, type: 'star', x: prize.x, z: prize.z, y: prize.y, age: 0, vx: Math.sin(angle) * 6, vz: Math.cos(angle) * 6 });
            nextId += 1;
          }
          this.emit('chest-open', { prize });
        }
        continue;
      }
      const settle = PRIZE_SETTLE * (magnet ? 0.4 : 1);
      if (prize.age < settle) {
        prize.x += prize.vx * dt;
        prize.z += prize.vz * dt;
        prize.vx *= 1 - Math.min(1, dt * 3);
        prize.vz *= 1 - Math.min(1, dt * 3);
        const inside = clampToPlay(prize.x, prize.z);
        [prize.x, prize.z] = [inside.x, inside.z];
        prize.y = groundY(prize.x, prize.z);
        continue;
      }
      const speed = Math.min(PRIZE_SPEED[1], PRIZE_SPEED[0] + (prize.age - settle) * 14) * (magnet ? MAGNET_SHARE : 1);
      if (towards(prize, speed)) {
        prize.done = true;
        this.stats[`${prize.type}s`] += 1;
        this.emit('prize', { prize });
      }
    }
    this.prizes = this.prizes.filter(({ done }) => !done).concat(opened);
    if (opened.length) this.emit('prizes', { prizes: opened, kind: 'chest' });

    for (const crate of this.crates) {
      // A rest stops the clock on a crate, so it's still there afterwards.
      if (!this.resting) crate.age += dt;
      const pointed = this.pointer && gapBetween(this.pointer, crate) <= CRATE_POINT_NEAR;
      if (!crate.zip && (magnet || pointed || gapBetween(tank, crate) <= CRATE_DRIVE_NEAR)) crate.zip = true;
      const speed = crate.zip ? CRATE_ZIP * (magnet ? MAGNET_SHARE : 1) : crate.age > 1.2 ? CRATE_DRIFT : 0;
      if (towards(crate, speed)) {
        crate.state = 'got';
        this.powerUp(crate.power);
        this.emit('crate-got', { crate });
      } else if (!crate.zip && crate.age >= CRATE_SECONDS) {
        crate.state = 'gone';
        this.emit('crate-gone', { crate });
      }
    }
    this.crates = this.crates.filter(({ state }) => state === 'waiting');
  }

  /** A power-up from a crate: a new kind of fire for a while, a heart back, a magnet or slow motion. */
  powerUp(name) {
    const power = POWERS[name];
    this.stats.powerUps += 1;
    if (name === 'heart') {
      // Once the last heart has gone, the round is over, and no heart comes back.
      if (this.hearts > 0) {
        this.hearts = Math.min(this.level.hearts, this.hearts + 1);
        this.sinceHurt = 0;
        this.emit('healed', { hearts: this.hearts });
      }
    } else if (power.fire) {
      this.power.fire = name;
      this.power.fireLeft = power.seconds;
    } else {
      this.power[`${name}Left`] = power.seconds;
    }
    this.emit('power', { name });
  }

  /** Power-ups run down while playing, and wait while resting. */
  tickPowers(dt) {
    if (this.resting) return;
    const { power } = this;
    for (const key of ['fireLeft', 'magnetLeft', 'slowLeft']) {
      if (power[key] <= 0) continue;
      power[key] = Math.max(0, power[key] - dt);
      if (power[key] === 0) this.emit('power-off', { name: key === 'fireLeft' ? power.fire : key.replace('Left', '') });
    }
  }

  /** At the end, whatever's still on its way counts, as it was the child's. */
  collectAll() {
    for (const prize of this.prizes) {
      if (prize.type === 'chest') {
        this.stats.chests += 1;
        this.stats.stars += STARS_IN_A_CHEST;
      } else {
        this.stats[`${prize.type}s`] += 1;
      }
    }
    this.prizes = [];
    this.crates = [];
  }

  /** Everything picked up, by kind, for the numbers on the screen. */
  get haul() {
    const { bolts, gems, stars, friends } = this.stats;
    return { bolts, gems, stars, friends };
  }

  /* ---------- every frame ---------- */

  /** Robot tanks rolling in before anything counts: behind the title, and during the countdown. */
  warmUp(dt) {
    this.time += dt;
    this.moveEnemies(dt, true);
  }

  /** One frame. hand is what readHand said, and pointer is where it's pointing on the ground, or null. */
  update(dt, { hand = 'none', pointer = null } = {}) {
    this.time += dt;
    this.hand = hand;
    this.closedFor = hand === 'closed' ? this.closedFor + dt : 0;
    if (this.state === 'ready') return;
    if (this.state !== 'playing') {
      this.locked = null;
      this.firing = false;
      this.coast(this.tank, CHILD, dt);
      this.moveShots(dt);
      this.moveEnemies(dt, false);
      return;
    }

    this.playSeconds += dt;
    this.stats.seconds += dt;
    this.watchRest(dt, hand, pointer);
    this.aim(dt, hand, pointer);
    this.driveChild(dt, hand, pointer);
    this.gunnery(dt, hand);
    this.moveShots(dt);
    this.moveLoot(dt);
    this.tickPowers(dt);
    if (this.state !== 'playing') return;
    this.heal(dt);

    const ended = this.endIn !== null;
    if (!this.paused && !ended) {
      if (this.spawnIn > 0) {
        this.spawnIn -= dt;
        if (this.spawnIn <= 0) this.fill();
      } else if (this.rolling.length < this.mostOut) {
        this.fill();
      }
      this.lobbing(dt);
    }
    this.moveEnemies(dt, !this.paused && !ended);
    this.moveShells(dt);

    if (this.endIn !== null) {
      this.endIn -= dt;
      if (this.endIn <= 0) this.finish();
    }
  }

  finish() {
    this.collectAll();
    this.state = this.ending;
    this.locked = null;
    this.firing = false;
    this.emit(this.ending, { stopped: this.stats.stopped });
  }
}
