// The story and rules of Robot Rescue. Robots have caught the friends from the other games and locked
// them up all over town. The child rides a little tram from place to place. An open hand fires at
// whatever is in the crosshair, and a closed hand raises a shield and reloads. Clearing the robots
// from a place frees the friend who's locked up there. There's no screen in this file, so it runs in
// the unit tests.
//
// Everything is in metres: x to the right of the tram, z straight ahead of it and y up, all measured
// from where the tram stops at that place.
import { ramp, rampWhole, stepsAt } from '../../core/levels.js';

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const mix = (from, to, share) => from + (to - from) * share;
const between = (random, [low, high]) => low + random() * (high - low);

/**
 * What each level changes, from level 1, which is the game as it always was, up to level 10. The
 * numbers are shares of, or additions to, the speed and difficulty a grown-up chose, so a level never
 * changes those choices, the reach help, reloading, or Gentle being impossible to lose. Resting stops
 * everything new here, just as it stops the rest.
 */
export function levelPlan(level = 1) {
  return {
    walk: ramp(level, 1, 1.25), // Walkers walk faster, up to a quarter faster at level 10.
    shuffle: ramp(level, 1, 0.8), // They move on to another spot sooner.
    peek: ramp(level, 1, 0.78), // Peekers stay up for less long, though never under three quarters as long.
    throwEvery: ramp(level, 1, 0.7), // Goo is thrown more often.
    gooSeconds: ramp(level, 1, 0.82), // It flies a little quicker, never under 2 seconds unless it already was.
    // One more robot out at once from level 6. More than that crowds round the crosshair, which then
    // jumps about so much that the middle of the picture starts to flicker.
    atOnce: rampWhole(level, 0, 1),
    gooInAir: stepsAt(level, { 1: 0, 6: 1 }), // One more blob of goo can be in the air at once from level 6.
    swoop: level >= 3, // From level 3, drones swoop down towards the tram now and then, and back up.
    hop: level >= 4, // From level 4, peekers spring through the air from one cover to the next.
    rollers: stepsAt(level, { 1: 0, 5: 2, 9: 3 }), // From level 5, robots on one big wheel take the place of some walkers.
    doubleThrow: stepsAt(level, { 1: 0, 7: 0.35, 10: 0.5 }), // From level 7, some robots throw a second blob straight after the first.
    bigSteps: level >= 8, // From level 8, the big one steps from side to side, taking its weak spots with it.
    // Something new to see and play with at every level from 2, on top of all that: see NEWS below.
    bolts: level >= 2, // Robots that fall apart leave bolts, which fly over to the crosshair.
    spread: level >= 2, // Power-ups, starting with the triple shot: three balls at once.
    lids: stepsAt(level, { 1: 0, 3: 1, 8: 2 }), // Robots with a lid for a shield, in place of a walker or two.
    bubble: level >= 4, // The bubble shot, which traps a robot in a floating bubble.
    keyChest: level >= 5, // A golden robot with a key, which opens a treasure chest by the cage.
    gems: level >= 5, // Bigger robots leave a gem as well.
    splitters: level >= 6 ? 1 : 0, // A robot that comes apart into two little ones.
    guard: level >= 6, // The shield bubble, which stops goo by itself.
    boing: level >= 7, // The boing ball, big and slow, which bounces on to the next robot.
    heart: level >= 7, // A heart, but only once one has been lost.
    planes: level >= 8, // Paper planes, which find a robot by themselves.
    magnet: level >= 8, // The magnet, which pulls a bolt out of a robot with each hit.
    sunset: level >= 8, // The ride goes on into a warm evening, just as bright.
    carrier: level >= 9, // A drone carrying a friend in a little cage, who floats down when it's dropped.
    slow: level >= 9, // Slow motion: the robots and their goo go at half speed.
    king: level >= 10, // The big one is the robot king, and bits of him come off as he goes.
    treasure: level >= 10, // The king leaves his treasure: gold stars.
  };
}

/**
 * How much harder each level is again on Medium and Tough, where the goo can win, on top of levelPlan.
 * Gentle keeps the game exactly as it always was, so for Gentle every number here leaves things as they
 * are. Level 1 is the same on every setting, so a child who has never played can learn it. By level 10
 * goo comes about twice as often as at level 1 and takes a little over half as long to arrive, a third
 * blob can be in the air, the robots wait for the shield to come down before they throw, and there's no
 * quiet start at the first stop.
 */
export function challengePlan(level = 1, canLose = true) {
  if (!canLose) return { throwEvery: 1, gooSeconds: 1, gooLeast: GOO_LEAST_SECONDS, gooInAir: 0, waitForShield: false, firstHold: true };
  return {
    throwEvery: ramp(level, 1, 0.7), // With levelPlan's, goo comes about twice as often at level 10.
    gooSeconds: ramp(level, 1, 0.7), // With levelPlan's, it arrives in 57% of level 1's time.
    gooLeast: CHALLENGE_GOO_LEAST_SECONDS,
    gooInAir: stepsAt(level, { 1: 0, 8: 1 }), // One more blob of goo in the air from level 8.
    waitForShield: level >= 4, // From level 4 the robots hold on to their goo while the shield is up.
    firstHold: level === 1, // Only level 1 gives a quiet start at the first stop.
  };
}

/**
 * What each level brings that's new, shown on the title card, under the countdown, and on the finish
 * card as what's coming up. key is what levelPlan switches on from that level. The first time each of a
 * level's new things turns up in a game, its name floats over it for a moment.
 */
export const NEWS = {
  2: [{ key: 'bolts', mark: '🔩', name: 'Bolts', nameKa: 'ჭანჭიკები' }, { key: 'spread', mark: '🔱', name: 'Triple shot', nameKa: 'სამმაგი გასროლა' }],
  3: [{ key: 'swoop', mark: '🚁', name: 'Swooping drones', nameKa: 'მყვინთავი დრონები' }, { key: 'lids', mark: '🛡️', name: 'Lid robots', nameKa: 'ფარიანი რობოტები' }],
  4: [{ key: 'hop', mark: '🪀', name: 'Hopping robots', nameKa: 'მხტუნავი რობოტები' }, { key: 'bubble', mark: '🫧', name: 'Bubble shot', nameKa: 'ბუშტის გასროლა' }],
  5: [{ key: 'rollers', mark: '🛞', name: 'Rollers', nameKa: 'ბორბლიანი რობოტები' }, { key: 'keyChest', mark: '🗝️', name: 'Key and chest', nameKa: 'გასაღები და სკივრი' }, { key: 'gems', mark: '💎', name: 'Gems', nameKa: 'ძვირფასი ქვები' }],
  6: [{ key: 'splitters', mark: '🧩', name: 'Splitting robots', nameKa: 'ორად გაყოფადი რობოტები' }, { key: 'guard', mark: '🔵', name: 'Shield bubble', nameKa: 'დამცავი ბუშტი' }],
  7: [{ key: 'boing', mark: '🏀', name: 'Boing ball', nameKa: 'ხტუნია ბურთი' }, { key: 'heart', mark: '❤️', name: 'Hearts', nameKa: 'გულები' }],
  8: [{ key: 'planes', mark: '✈️', name: 'Paper planes', nameKa: 'ქაღალდის თვითმფრინავები' }, { key: 'magnet', mark: '🧲', name: 'Magnet', nameKa: 'მაგნიტი' }, { key: 'sunset', mark: '🌅', name: 'Sunset ride', nameKa: 'მზის ჩასვლა' }],
  9: [{ key: 'carrier', mark: '🪂', name: 'Flying cages', nameKa: 'მფრინავი გალიები' }, { key: 'slow', mark: '🐌', name: 'Slow motion', nameKa: 'ნელი მოძრაობა' }],
  10: [{ key: 'king', mark: '👑', name: 'Robot king', nameKa: 'რობოტების მეფე' }, { key: 'treasure', mark: '🌟', name: 'King’s treasure', nameKa: 'მეფის განძი' }],
};

export const newsAt = (level) => NEWS[level] ?? [];

/**
 * The power-ups. A robot that falls apart now and then leaves one, in a glass ball that flies over to
 * the crosshair like the bolts. The kinds of fire change what the blaster shoots, for a few seconds,
 * and firing stays the same: an open hand on something. Each waits while the child rests, and between
 * stops. A heart only comes once one has been lost.
 */
export const POWERS = {
  spread: { mark: '🔱', name: 'Triple shot', nameKa: 'სამმაგი გასროლა', seconds: 7, fire: true },
  bubble: { mark: '🫧', name: 'Bubble shot', nameKa: 'ბუშტის გასროლა', seconds: 7, fire: true },
  guard: { mark: '🔵', name: 'Shield bubble', nameKa: 'დამცავი ბუშტი', seconds: 8 },
  boing: { mark: '🏀', name: 'Boing ball', nameKa: 'ხტუნია ბურთი', seconds: 7, fire: true },
  heart: { mark: '❤️', name: 'Heart', nameKa: 'გული', seconds: 0 },
  planes: { mark: '✈️', name: 'Paper planes', nameKa: 'ქაღალდის თვითმფრინავები', seconds: 7, fire: true },
  magnet: { mark: '🧲', name: 'Magnet', nameKa: 'მაგნიტი', seconds: 8 },
  slow: { mark: '🐌', name: 'Slow motion', nameKa: 'ნელი მოძრაობა', seconds: 6 },
};

/** What's picked up, as it's counted on the screen and the finish card. */
export const PRIZES = {
  bolt: { mark: '🔩', stat: 'bolts' },
  gem: { mark: '💎', stat: 'gems' },
  star: { mark: '⭐', stat: 'stars' },
  pal: { mark: '🤗', stat: 'pals' },
};

/** The power-ups a level has, the level's own new ones first, then the newest of the rest. */
export function powerOrder(level) {
  const plan = levelPlan(level);
  const unlocked = Object.keys(POWERS).filter((key) => plan[key]);
  const fresh = newsAt(level).map(({ key }) => key).filter((key) => POWERS[key]);
  return [...fresh, ...unlocked.filter((key) => !fresh.includes(key)).reverse()];
}

// How fast things happen. walk is in metres a second, and atOnce is how many robots are out together.
export const PACES = {
  slow: { walk: 1.0, atOnce: 5, moveSeconds: 3, shuffleEvery: 7, peekSeconds: 4.2 },
  medium: { walk: 1.4, atOnce: 6, moveSeconds: 2.5, shuffleEvery: 5, peekSeconds: 3.4 },
  fast: { walk: 1.9, atOnce: 7, moveSeconds: 2, shuffleEvery: 3.6, peekSeconds: 2.8 },
};

// How hard the goo comes. On Gentle a child can't lose, as hearts stop at one.
export const LEVELS = {
  gentle: { hearts: 3, canLose: false, throwEvery: 4.6, gooSeconds: 3.3, gooInAir: 1, firstThrow: 5, bigSpots: 3 },
  medium: { hearts: 5, canLose: true, throwEvery: 3.4, gooSeconds: 2.8, gooInAir: 2, firstThrow: 3.5, bigSpots: 4 },
  tough: { hearts: 3, canLose: true, throwEvery: 2.5, gooSeconds: 2.3, gooInAir: 3, firstThrow: 2.5, bigSpots: 5 },
};

// How much the crosshair helps, as a share of the screen's height and of the way to the target.
// Even the least of these is generous, as precision isn't what this game is about.
export const AIM_HELP = {
  none: { radius: 0.17, pull: 0.75 },
  little: { radius: 0.3, pull: 0.92 },
  lots: { radius: 0.46, pull: 1 },
};

// How many hits each can take. The big one is different: it only takes hits in its weak spots. Rollers
// and everything after them only come on the higher levels.
export const ROBOT_KINDS = {
  walker: { hp: 5 },
  drone: { hp: 3 },
  peeker: { hp: 3 },
  roller: { hp: 3 },
  big: { hp: 0 },
  lid: { hp: 4 }, // Holds up a lid that shots bonk off, and lowers it to walk or throw.
  splitter: { hp: 4 }, // Comes apart into two little ones.
  mini: { hp: 2 }, // A little one, which walks about and never throws.
  keybot: { hp: 4 }, // A golden one, whose wind-up key opens the treasure chest.
  carrier: { hp: 4 }, // A drone with a friend in a little cage underneath, which never throws.
};

// Those that go about on foot, from post to post.
const ON_FOOT = new Set(['walker', 'lid', 'splitter', 'mini', 'keybot']);
// Those too busy to throw anything.
const NEVER_THROW = new Set(['roller', 'mini', 'carrier']);
// How many bolts each leaves, and which are big enough to leave a gem as well.
const BOLTS = { walker: 2, lid: 2, splitter: 2, keybot: 1, drone: 1, peeker: 1, roller: 1, mini: 1, carrier: 1, big: 0 };
const GEMS = new Set(['lid', 'splitter', 'keybot', 'carrier', 'roller']);
// The friends who are carried about at each stop, from level 9: everyone not already in a cage.
export const PALS = ['widget', 'bramble', 'nova', 'cinder', 'tur'];

// The weak spots of the big one, in the order they open, in metres from its feet.
export const BIG_SPOTS = [
  { id: 'chest', at: [0, 5.1, 1.75], hp: 12 },
  { id: 'shoulder-left', at: [-3.75, 6.35, 1.16], hp: 12 },
  { id: 'shoulder-right', at: [3.75, 6.35, 1.16], hp: 12 },
  { id: 'belly', at: [0, 3.25, 1.7], hp: 14 },
  { id: 'knee', at: [1.7, 1.5, 0.84], hp: 14 },
];

/*
 * Each place on the way, in order. Robots come out of the doors and walk to the posts. Peekers pop
 * up from behind the covers, and drones hover around the air spots. Giraffe comes last, because that's
 * where the story ends, and the short rescue still has him in it.
 */
export const PLACES = [
  {
    id: 'market',
    who: 'truffle',
    thanks: 'Oink! You saved me!',
    robots: ['walker', 'walker', 'walker', 'peeker', 'walker', 'peeker', 'walker', 'drone', 'walker', 'peeker', 'walker', 'drone'],
    doors: [[-14, 13.3], [14, 12.7], [-13, 21], [13, 20], [-3, 28], [4, 28]],
    posts: [[-3.6, 9.4], [3.6, 9.8], [-1, 12.2], [2.2, 14], [-6.4, 13.6], [6.4, 14.4], [-2.6, 17]],
    covers: [[-5, 8.4, 'stall'], [5.2, 8.2, 'stall'], [-7.8, 12, 'stall'], [7.6, 11.6, 'stall']],
    air: [[-5, 4.1, 13], [5, 4.4, 14], [0, 4.8, 17]],
    cage: [8.6, 18],
  },
  {
    id: 'canal',
    who: 'kit',
    thanks: 'Free at last! Thank you!',
    robots: ['drone', 'walker', 'drone', 'walker', 'peeker', 'drone', 'walker', 'peeker', 'drone', 'walker', 'walker', 'peeker'],
    doors: [[-13, 7], [13, 7], [-1.5, 32], [1.5, 32], [-2.4, 28], [2.4, 28]],
    posts: [[-3.6, 8.4], [3.8, 8.8], [-1.6, 13.4], [1.8, 15.6], [-1, 19.2], [1.6, 22.2]],
    covers: [[-5.4, 7.6, 'crates'], [5.6, 7.4, 'crates'], [7, 14.6, 'boat'], [-2.9, 12.2, 'crates'], [2.9, 18.4, 'crates']],
    air: [[-6.5, 3.8, 13], [6, 4.2, 14], [-2, 4.8, 17], [3, 4.4, 19]],
    cage: [-7.8, 16.6],
  },
  {
    id: 'harbour',
    who: 'frost',
    thanks: 'Thank you! That was cool!',
    robots: ['peeker', 'walker', 'peeker', 'walker', 'drone', 'peeker', 'walker', 'peeker', 'drone', 'walker', 'peeker', 'walker'],
    doors: [[14, 8], [14, 21], [13, 14], [3, 30], [-1, 30]],
    posts: [[3.2, 9.2], [-1, 10], [5.6, 13], [1.2, 13.4], [-3.6, 14.2], [4.6, 16.6], [0, 18.4]],
    covers: [[-3.4, 8.4, 'barrels'], [4.8, 8.2, 'crates'], [-6, 12.4, 'barrels'], [6.6, 11.8, 'crates'], [-1.6, 11.4, 'crates'], [2.4, 15, 'barrels']],
    air: [[-6, 4, 13], [4, 4.6, 14], [-2, 4.8, 17], [6.5, 4.2, 17]],
    cage: [-7.4, 17],
  },
  {
    id: 'farm',
    who: 'mochi',
    thanks: 'Hop hop! Thank you!',
    robots: ['walker', 'walker', 'peeker', 'drone', 'walker', 'peeker', 'walker', 'drone', 'peeker', 'walker', 'walker', 'drone'],
    doors: [[-15, 11], [15, 10], [-14, 18], [14, 19], [-5, 26], [5, 26]],
    posts: [[-3.4, 9.6], [3.2, 9.8], [-1, 12.4], [1.6, 13.6], [-6, 15], [5.8, 15.4], [0, 17.4]],
    covers: [[-5, 8.4, 'hay'], [4.8, 8.6, 'hay'], [-7.2, 12.2, 'hay'], [7, 12.4, 'hay'], [-2, 15, 'hay']],
    air: [[-5, 4.2, 13], [6, 4.4, 14], [0, 5, 17], [-7, 4.6, 18]],
    cage: [9, 17.4],
  },
  {
    id: 'tower',
    who: 'giraffe',
    thanks: 'Hooray! We’re all free!',
    robots: ['big', 'peeker', 'peeker', 'walker', 'drone', 'peeker', 'walker', 'peeker', 'drone', 'walker', 'peeker', 'drone', 'walker'],
    doors: [[-14, 14], [14, 14], [-14, 22], [14, 22], [-9, 28], [9, 28]],
    posts: [[-3.6, 9.6], [3.6, 9.6], [-6.4, 13.8], [6.8, 13.4], [-4.6, 15], [8.6, 15.4]],
    covers: [[-4.8, 8.4, 'planters'], [4.8, 8.4, 'planters'], [-7.4, 11.6, 'planters'], [7.4, 11.6, 'planters']],
    air: [[-6.6, 4.4, 13], [6.6, 4.4, 13], [-4.8, 5, 15], [4.8, 5, 15]],
    big: [0, 20],
    cage: [-10.4, 16.4],
  },
];

const SHORT_RESCUE = ['market', 'harbour', 'tower'];

export const FIRE_RATE = 5.5; // Shots a second.
export const DRAIN_SECONDS = 3.6; // How long a full blaster lasts.
export const REFILL_SECONDS = 0.55; // How long a closed hand takes to fill an empty one.
export const FILLS_ITSELF_AFTER = 6; // So a child who can't close yet isn't stuck for good.
const FILLS_ITSELF_SECONDS = 3;
const WORTH_RELOADING = 0.9; // Fuller than this and a closed hand isn't really a reload.

export const REST_AFTER_SECONDS = 4; // A hand gone or closed for this long means someone's resting.
const THROW_AGAIN_AFTER_REST = 1.6;
const FIRST_STOP_HOLD_SECONDS = 14; // At the first stop, nothing's thrown until a robot has been dropped.

export const EYE_HEIGHT = 1.9; // How high the child's view is, riding on the tram.
const SHOT_SECONDS = 0.2;
const GOO_HP = 1;
const WINDUP_SECONDS = 0.75;
const FREE_SECONDS = 1.1; // From a friend being freed to the tram moving off.
const LONGEST_MOVE_SECONDS = 3;
const WIN_SECONDS = 3;
const LOST_SECONDS = 1.1;
const BETWEEN_ROBOTS_SECONDS = 0.35;
const BIG_NEXT_SPOT_SECONDS = 0.7;
const DRONE_ENTER_SECONDS = 1.4;
const PEEK_RISE_SECONDS = 0.32;
const PEEK_HIDDEN_SECONDS = 0.7;
const AHEAD_START = 0.6; // How far along their way the first robots already are.
export const GOO_STOPS_AT = 2.4; // Metres in front of the tram, where the shield is.
const GOO_FROM_EYE = 0.1; // How far below the eye it arrives.
const GOO_LOB = 1.5; // How high its arc goes above a straight line.
export const GOO_LEAST_SECONDS = 2; // However high the level, goo takes at least this long to arrive on Gentle.
export const CHALLENGE_GOO_LEAST_SECONDS = 1.25; // And this long on Medium and Tough.

// What the higher levels bring: see levelPlan.
// Swoops and hops are slow and low, as the crosshair follows what it's on, and a quick bob up and
// down would make it flicker.
export const SWOOP = { seconds: 3.4, every: [5, 9], down: 2.3, nearer: 3.8, across: 2.2 };
export const HOP = { seconds: 1.5, height: 1.8, share: 0.6 }; // share is how often a peeker hops rather than ducks.
// Rollers keep going, but not quickly, and stop for a moment at each spot: the crosshair goes with
// whatever it's on, and one dashing to and fro made the middle of the picture flicker.
const ROLL_SPEED = 1.5; // Metres a second at the slow pace, before the level's own speeding up.
const ROLL_FASTEST = 2.2; // Metres a second, however fast everything else is.
const ROLL_PAUSE_SECONDS = 1; // At each spot, to turn round.
const SECOND_THROW_SECONDS = 0.5; // The wind up for a second blob, straight after the first.
export const BIG_STEP = { across: 2.4, speed: 0.55 }; // Metres each way, and how quickly it goes from side to side.

// Prizes take this long from a robot falling apart to reaching the crosshair, a little after each other.
export const PRIZE_SECONDS = 1.3;
const PRIZE_STAGGER_SECONDS = 0.18; // Not too close together, as a stream of them flickered.
export const POWER_EVERY = 8; // Every eighth robot to fall apart leaves a power-up, from the second.
const POWER_FIRST = 2;
export const BUBBLE_SECONDS = 4; // How long a robot floats in a bubble, where every hit counts twice.
export const LID_BONKS = 8; // After this many shots have bonked off it, the lid falls off.
export const KEY_SECONDS = 1.4; // How long the key takes to fly over to the chest.
const CHEST_PRIZES = { gem: 4, star: 2 };
const TREASURE = { star: 6, gem: 2 };
export const SLOW = { robots: 0.55, goo: 0.6 }; // How fast things go in slow motion.
const MAGNET_EVERY_SECONDS = 0.8; // The magnet pulls a bolt out of a robot no more often than this.
const SPREAD_REACH = 9; // Metres: the triple shot's other balls go for anything this near what's aimed at.
export const BOING = { flight: 0.45, hop: 0.5, bounces: 1, damage: 2, reach: 10 };
const BUBBLE_SHOT_SECONDS = 0.3;
const PLANE_SECONDS = 0.6;
// The other kinds of fire come less often than paint, as each does more, and a lot of them going all
// over the place at once flickered.
const FIRE_RATES = { spread: FIRE_RATE / 2.5, bubble: FIRE_RATE / 2, boing: FIRE_RATE / 3, planes: FIRE_RATE / 3 };
// The drone with a friend under it goes slowly to and fro, in front of everything.
export const CARRIER = { across: 6.5, speed: 0.15, height: 5.4, z: 15 };

/** Whether a lid robot is holding its lid up: not while it walks, throws or floats in a bubble. */
export function lidIsUp(robot) {
  return robot.kind === 'lid' && !robot.lidOff && robot.state === 'ready' && !(robot.throwing > 0) && !(robot.bubbled > 0);
}

const AIM_FOLLOW = 11; // How quickly the crosshair catches up with where it's going, a share a second.

/** The hand in play, as this game needs it. Anything uncertain neither fires nor raises the shield. */
export function readHand(snapshot) {
  const hand = snapshot[snapshot.side];
  if (snapshot.handOpen) return 'open';
  if (hand.status === 'closed' && hand.reason === 'closed' && !snapshot.overlap) return 'closed';
  return hand.status === 'missing' ? 'none' : 'unsure';
}

/** The charge in the blaster. It drains while firing, and a closed hand fills it again. */
export class Blaster {
  /** reloading off means it never runs out, for a child who can't close their hand easily. */
  constructor({ reloading = true } = {}) {
    this.reloading = reloading;
    this.charge = 1;
    this.firing = false;
    this.cooldown = 0;
    this.emptyFor = 0;
    this.fillingItself = false;
    this.lowest = 1; // How low it has been since it was last full.
  }

  get empty() {
    return this.charge <= 0 && !this.fillingItself;
  }

  /**
   * One frame. aiming says something is in the crosshair. Returns what happened, as shots fired, and
   * whether it has just run out or just been filled. rate is how many shots a second, which some kinds
   * of fire have fewer of.
   */
  update(dt, { hand, aiming, rate = FIRE_RATE }) {
    const result = { shots: 0, ranOut: false, filled: false };
    const before = this.charge;
    this.firing = hand === 'open' && aiming && this.charge > 0 && !this.fillingItself;
    if (this.firing) {
      if (this.reloading) this.charge = Math.max(0, this.charge - dt / DRAIN_SECONDS);
      this.cooldown -= dt;
      while (this.cooldown <= 0) {
        result.shots += 1;
        this.cooldown += 1 / rate;
      }
      if (this.charge === 0 && before > 0) result.ranOut = true;
    } else {
      this.cooldown = Math.max(0, this.cooldown - dt);
    }

    if (hand === 'closed') {
      this.emptyFor = 0;
      this.fillingItself = false;
      this.charge = Math.min(1, this.charge + dt / REFILL_SECONDS);
    } else if (this.fillingItself) {
      this.charge = Math.min(1, this.charge + dt / FILLS_ITSELF_SECONDS);
      if (this.charge === 1) this.fillingItself = false;
    } else if (this.charge === 0) {
      this.emptyFor += dt;
      if (this.emptyFor > FILLS_ITSELF_AFTER) {
        this.emptyFor = 0;
        this.fillingItself = true;
      }
    }

    // A closed hand that was nearly full anyway isn't worth making a noise about.
    this.lowest = Math.min(this.lowest, this.charge);
    if (this.charge === 1) {
      result.filled = this.lowest < WORTH_RELOADING;
      this.lowest = 1;
    }
    return result;
  }
}

/**
 * Takes the wobble out of a hand, and pulls the crosshair onto whatever is nearest. Targets are given
 * in pixels, as { ref, x, y, size }, and height is the screen's height in pixels.
 */
export class Aim {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.steadyX = 0;
    this.steadyY = 0;
    this.seen = false;
    this.target = null; // What it's being pulled towards.
    this.locked = null; // What it's actually on.
  }

  /** The hand has gone, so it isn't aiming at anything. */
  lose() {
    this.seen = false;
    this.target = null;
    this.locked = null;
  }

  /** The nearest target, sticking with the one it has unless another is clearly nearer. */
  choose(targets, radius) {
    let best = null;
    let bestGap = Infinity;
    let currentGap = Infinity;
    for (const target of targets) {
      const gap = Math.max(0, Math.hypot(target.x - this.steadyX, target.y - this.steadyY) - target.size);
      if (target.ref === this.target?.ref) currentGap = gap;
      if (gap < bestGap) {
        best = target;
        bestGap = gap;
      }
    }
    if (currentGap <= radius * 1.25 && bestGap >= currentGap * 0.6) {
      return targets.find(({ ref }) => ref === this.target.ref);
    }
    return bestGap <= radius ? best : null;
  }

  update(dt, handX, handY, targets, { radius, pull }, height) {
    if (!this.seen) {
      this.steadyX = handX;
      this.steadyY = handY;
      this.x = handX;
      this.y = handY;
      this.seen = true;
    }
    // Slow movement is mostly wobble, so it's steadied hard. Quick movement is meant, so it isn't.
    const speed = Math.hypot(handX - this.steadyX, handY - this.steadyY) / height / Math.max(dt, 0.001);
    const rate = mix(7, 34, clamp(speed / 1.1, 0, 1));
    const share = 1 - Math.exp(-rate * dt);
    this.steadyX += (handX - this.steadyX) * share;
    this.steadyY += (handY - this.steadyY) * share;

    const reach = radius * height;
    this.target = this.choose(targets, reach);
    let aimX = this.steadyX;
    let aimY = this.steadyY;
    if (this.target) {
      const gap = Math.max(0, Math.hypot(this.target.x - aimX, this.target.y - aimY) - this.target.size);
      // All the way on over most of the reach, and fading out towards the edge of it.
      const closeness = clamp((reach - gap) / (reach * 0.3), 0, 1);
      const amount = pull * closeness * closeness * (3 - 2 * closeness);
      aimX += (this.target.x - aimX) * amount;
      aimY += (this.target.y - aimY) * amount;
    }
    // It glides onto what it's pulled to, rather than jumping: with robots falling apart quickly, it
    // jumping from one to the next flickered.
    const follow = 1 - Math.exp(-dt * AIM_FOLLOW);
    this.x += (aimX - this.x) * follow;
    this.y += (aimY - this.y) * follow;

    this.locked = null;
    if (this.target) {
      const onIt = Math.hypot(this.target.x - this.x, this.target.y - this.y) - this.target.size;
      if (onIt <= height * 0.035) this.locked = this.target.ref;
    }
    return this.locked;
  }
}

let nextId = 1;
let nextShot = 1; // Shots are counted on their own, so robots are numbered just as they always were.

/**
 * A place's robots in the order they come out. On the higher levels rollers take the place of the last
 * few walkers, and lid robots and a splitting one take the place of the first. A drone carrying a friend
 * comes out second, and a golden robot with a key third. plan is what levelPlan says.
 */
export function lineUp(place, rollers = 0, { lids = 0, splitters = 0, keyChest = false, carrier = false } = {}) {
  const line = [...place.robots];
  let left = rollers;
  const walkers = [];
  for (let i = line.length - 1; i >= 0; i -= 1) {
    if (line[i] !== 'walker') continue;
    if (left > 0) {
      line[i] = 'roller';
      left -= 1;
    } else {
      walkers.unshift(i);
    }
  }
  const kinds = [];
  for (let i = 0; i < Math.max(lids, splitters); i += 1) {
    if (i < lids) kinds.push('lid');
    if (i < splitters) kinds.push('splitter');
  }
  kinds.forEach((kind, k) => {
    if (k < walkers.length) line[walkers[k]] = kind;
  });
  const drone = line.indexOf('drone');
  if (carrier && drone >= 0) {
    line.splice(drone, 1);
    line.splice(Math.min(1, line.length), 0, 'carrier');
  }
  if (keyChest) line.splice(Math.min(2, line.length), 0, 'keybot');
  return line;
}

export class Mission {
  /**
   * pace and level are the grown-up's choices from PACES and LEVELS, and levelNumber is the level being
   * played, from 1 to 10, which makes it harder within those choices: see levelPlan.
   */
  constructor({ stops = PLACES.length, pace = 'slow', level = 'medium', levelNumber = 1, reloading = true, random = Math.random, onEvent = () => {} } = {}) {
    this.stops = stops >= PLACES.length ? PLACES : PLACES.filter(({ id }) => SHORT_RESCUE.includes(id));
    this.random = random;
    this.onEvent = onEvent;
    this.blaster = new Blaster({ reloading });
    this.levelNumber = levelNumber;
    this.plan = levelPlan(levelNumber);
    this.configure({ pace, level });
    this.hearts = this.level.hearts;
    this.index = -1;
    this.phase = 'ready'; // ready, fighting, freeing, moving, won or lost.
    this.phaseLeft = 0;
    this.moveSeconds = 0;
    this.robots = [];
    this.queue = [];
    this.goo = [];
    this.shots = [];
    this.spawnIn = 0;
    this.throwIn = 0;
    this.holdThrows = 0;
    this.restFor = 0;
    this.resting = false;
    this.shield = false;
    this.time = 0;
    this.clock = 0; // The robots' own time, which goes slower in slow motion.
    this.freed = 0;
    this.prizes = []; // What's on its way to the crosshair: bolts, gems, stars and power-ups.
    this.fire = null; // A kind of fire from a power-up, as { kind, left }.
    this.timed = { guard: 0, magnet: 0, slow: 0 }; // How long the other power-ups have left.
    this.powers = powerOrder(levelNumber);
    this.powerTurn = 0;
    this.heartOwed = false; // A heart's turn came with every heart there: see nextPower.
    this.dropped = 0; // Robots that have fallen apart, as every so often one leaves a power-up.
    this.planeTurn = 0;
    this.chest = null; // This stop's treasure chest, from level 5.
    this.leavingChest = null; // The last stop's, if its key was still on its way when the tram set off.
    this.toDealWith = 0; // How many robots there are at this stop altogether, little ones and all.
    this.stats = { robots: 0, friends: 0, shots: 0, gooBlocked: 0, gooShot: 0, gooHits: 0, reloads: 0, bolts: 0, gems: 0, stars: 0, pals: 0, powers: 0, chests: 0, bonks: 0, gooBubbled: 0 };
  }

  /** Speed and difficulty can change in the middle of a game, from the panel. */
  configure({ pace, level, reloading }) {
    if (pace !== undefined) this.pace = PACES[pace] ?? PACES.slow;
    if (level !== undefined) {
      this.level = LEVELS[level] ?? LEVELS.medium;
      this.challenge = challengePlan(this.levelNumber, this.level.canLose);
    }
    if (reloading !== undefined) {
      this.blaster.reloading = reloading;
      if (!reloading) {
        this.blaster.charge = 1;
        this.blaster.fillingItself = false;
      }
    }
    if (this.hearts !== undefined) this.hearts = clamp(this.hearts, 1, this.level.hearts);
  }

  /* ---------- the numbers in play: the grown-up's choices, made harder by the level ---------- */

  get walkSpeed() {
    return this.pace.walk * this.plan.walk;
  }

  get shuffleEvery() {
    return this.pace.shuffleEvery * this.plan.shuffle;
  }

  get peekSeconds() {
    return this.pace.peekSeconds * this.plan.peek;
  }

  get atOnce() {
    return this.pace.atOnce + this.plan.atOnce;
  }

  get throwEvery() {
    return this.level.throwEvery * this.plan.throwEvery * this.challenge.throwEvery;
  }

  get gooSeconds() {
    const { gooSeconds } = this.level;
    return Math.max(gooSeconds * this.plan.gooSeconds * this.challenge.gooSeconds, Math.min(gooSeconds, this.challenge.gooLeast));
  }

  get gooInAir() {
    return this.level.gooInAir + this.plan.gooInAir + this.challenge.gooInAir;
  }

  /* ---------- power-ups ---------- */

  /** The kind of fire the blaster has right now: null for the usual paint. */
  get fireKind() {
    return this.fire?.kind ?? null;
  }

  get guarded() {
    return this.timed.guard > 0;
  }

  get slowing() {
    return this.timed.slow > 0;
  }

  get magnetOn() {
    return this.timed.magnet > 0;
  }

  /** How long a power-up has left, and how long it lasts, for the bar on the screen. */
  powerLeft(kind) {
    const left = POWERS[kind]?.fire ? (this.fire?.kind === kind ? this.fire.left : 0) : this.timed[kind] ?? 0;
    return { left, seconds: POWERS[kind]?.seconds ?? 1 };
  }

  /** The power-ups on at the moment, by name. */
  get powersOn() {
    return [this.fireKind, ...Object.keys(this.timed).filter((kind) => this.timed[kind] > 0)].filter(Boolean);
  }

  /**
   * The next power-up to leave behind, going round those this level has. A heart only comes once one has
   * gone: when its turn comes with every heart there, it waits, and comes as soon as one has gone, so
   * that it isn't missed.
   */
  nextPower() {
    if (this.heartOwed && this.hearts < this.level.hearts) {
      this.heartOwed = false;
      return 'heart';
    }
    for (let tries = 0; tries < this.powers.length; tries += 1) {
      const kind = this.powers[this.powerTurn % this.powers.length];
      this.powerTurn += 1;
      if (kind === 'heart' && this.hearts >= this.level.hearts) {
        this.heartOwed = true;
        continue;
      }
      if (kind === 'heart') this.heartOwed = false;
      return kind;
    }
    return null;
  }

  startPower(kind) {
    this.stats.powers += 1;
    if (kind === 'heart') {
      // Once the last heart has gone, the game's lost, and no heart comes back.
      if (this.hearts <= 0) return;
      this.hearts = Math.min(this.level.hearts, this.hearts + 1);
      this.emit('heart-up', { hearts: this.hearts });
      return;
    }
    const { seconds, fire } = POWERS[kind];
    if (fire) this.fire = { kind, left: seconds };
    else this.timed[kind] = seconds;
    this.emit('power', { kind });
  }

  /** Power-ups run down only while there's fighting going on, and wait while the child rests. */
  updatePowers(dt) {
    if (this.resting || this.phase !== 'fighting') return;
    if (this.fire) {
      this.fire.left -= dt;
      if (this.fire.left <= 0) {
        const { kind } = this.fire;
        this.fire = null;
        this.emit('power-end', { kind });
      }
    }
    for (const kind of Object.keys(this.timed)) {
      if (this.timed[kind] <= 0) continue;
      this.timed[kind] = Math.max(0, this.timed[kind] - dt);
      if (this.timed[kind] === 0) this.emit('power-end', { kind });
    }
  }

  /* ---------- prizes ---------- */

  /**
   * Something to pick up, on its way from where it came from to the crosshair. source is the robot, the
   * weak spot or 'chest' it came out of. order puts those that come out together a little apart.
   */
  addPrize(kind, source, order = 0, extra = {}) {
    const at = source?.kind === 'spot' ? { x: source.big.x + source.at[0], y: source.at[1], z: source.big.z } : source;
    const prize = {
      id: nextId,
      kind,
      source,
      from: { x: at?.x ?? 0, y: (at?.y ?? 0) + 1.4, z: at?.z ?? 8 },
      place: this.place?.id ?? null,
      t: -(order * PRIZE_STAGGER_SECONDS) / PRIZE_SECONDS,
      seconds: PRIZE_SECONDS,
      ...extra,
    };
    nextId += 1;
    this.prizes.push(prize);
    this.emit('prize-out', { prize });
    return prize;
  }

  /** What a robot leaves when it falls apart: bolts, a gem from a bigger one, and now and then a power-up. */
  leaveBehind(robot) {
    if (!this.plan.bolts) return;
    let order = 0;
    for (let i = 0; i < (BOLTS[robot.kind] ?? 2); i += 1) this.addPrize('bolt', robot, order++);
    if (this.plan.gems && GEMS.has(robot.kind)) this.addPrize('gem', robot, order++);
    if (robot.kind === 'big' && robot.king && this.plan.treasure) {
      for (const [kind, count] of Object.entries(TREASURE)) {
        for (let i = 0; i < count; i += 1) this.addPrize(kind, robot, order++, { treasure: true });
      }
    }
    this.dropped += 1;
    if (robot.kind !== 'big' && this.dropped % POWER_EVERY === POWER_FIRST % POWER_EVERY) {
      const power = this.nextPower();
      if (power) this.addPrize('power', robot, order++, { power });
    }
  }

  updatePrizes(dt) {
    for (const prize of [...this.prizes]) {
      prize.t += dt / prize.seconds;
      if (prize.t >= 1) this.collect(prize);
    }
  }

  collect(prize) {
    if (!this.prizes.includes(prize)) return;
    this.prizes = this.prizes.filter((other) => other !== prize);
    if (prize.kind === 'power') this.startPower(prize.power);
    else this.stats[PRIZES[prize.kind].stat] += 1;
    this.emit('prize', { prize });
  }

  /** Everything still on its way counts when the game ends. */
  collectAll() {
    this.openChestNow();
    for (const prize of [...this.prizes]) this.collect(prize);
  }

  /* ---------- the chest, and a friend who's carried about ---------- */

  /** The golden robot has fallen apart, and its key flies over to the chest. */
  keyFlies(robot) {
    if (!this.chest || this.chest.keyIn > 0 || this.chest.open) return;
    this.chest.keyIn = KEY_SECONDS;
    this.emit('key', { robot });
  }

  /** A key still on its way gets there, to this stop's chest or, as the tram goes, to the last stop's. */
  updateChest(dt) {
    for (const chest of [this.leavingChest, this.chest]) {
      if (!chest || !(chest.keyIn > 0)) continue;
      chest.keyIn = Math.max(0, chest.keyIn - dt);
      if (chest.keyIn === 0) this.openChest(chest);
    }
  }

  openChestNow() {
    for (const chest of [this.leavingChest, this.chest]) if (chest?.keyIn > 0) this.openChest(chest);
  }

  /** It opens where it is, at its own stop, and its gems and stars come out of it. */
  openChest(chest) {
    chest.keyIn = 0;
    chest.open = true;
    if (chest === this.leavingChest) this.leavingChest = null;
    this.stats.chests += 1;
    this.emit('chest-open', { place: chest.place });
    let order = 0;
    for (const [kind, count] of Object.entries(CHEST_PRIZES)) {
      for (let i = 0; i < count; i += 1) this.addPrize(kind, 'chest', order++, { place: chest.place.id });
    }
  }

  freePal(robot) {
    this.stats.pals += 1;
    this.emit('pal-freed', { robot, who: robot.pal });
  }

  /* ---------- what each kind of fire does ---------- */

  /** What can be shot at, apart from goo. */
  robotTargets() {
    return this.targets().filter(({ kind }) => kind !== 'goo');
  }

  /** Where something that can be aimed at is, near enough, in the place's metres. */
  whereIs(thing) {
    if (thing.kind === 'spot') return { x: thing.big.x + thing.at[0], z: thing.big.z };
    return thing;
  }

  /** The nearest things to aim at next to this one, for the triple shot's other balls and the boing ball. */
  nearestTo(thing, count, reach, { robotsOnly = false } = {}) {
    const from = this.whereIs(thing);
    return (robotsOnly ? this.robotTargets() : this.targets())
      .filter((other) => other !== thing)
      .map((other) => {
        const at = this.whereIs(other);
        return { other, gap: Math.hypot(at.x - from.x, at.z - from.z) };
      })
      .filter(({ gap }) => gap <= reach)
      .sort((a, b) => a.gap - b.gap)
      .slice(0, count)
      .map(({ other }) => other);
  }

  /**
   * Paper planes go for what's in the crosshair, and every other one for something else that can be
   * seen from the tram: not one still coming in from the side.
   */
  planeTarget(target) {
    const all = this.robotTargets().filter((thing) => {
      const at = this.whereIs(thing);
      return Math.abs(at.x) <= at.z * 0.8;
    });
    this.planeTurn += 1;
    if (target && this.planeTurn % 2 === 1) return target;
    return all[this.planeTurn % all.length] ?? target;
  }

  makeShot(target, kind = 'paint', extra = {}) {
    const flight = { bubble: BUBBLE_SHOT_SECONDS, boing: BOING.flight, plane: PLANE_SECONDS }[kind] ?? SHOT_SECONDS;
    const shot = { id: nextShot, target, left: flight, flight, colour: this.stats.shots % 4, kind, ...extra };
    nextShot += 1;
    if (kind === 'boing') shot.bounces = BOING.bounces;
    return shot;
  }

  /** A shot that bounces on, if it's a boing ball and there's something near enough to bounce to. */
  bounceOn(shot, next) {
    if (shot.kind !== 'boing' || !(shot.bounces > 0)) return;
    const [onTo] = this.nearestTo(shot.target, 1, BOING.reach, { robotsOnly: true });
    if (!onTo) return;
    const bounce = { ...this.makeShot(onTo, 'boing'), bounces: shot.bounces - 1, from: shot, left: BOING.hop, flight: BOING.hop };
    next.push(bounce);
    this.emit('bounce', { shot: bounce });
  }

  /** The robot floats in a bubble for a while, and can't move or throw. Every hit on it counts twice. */
  trap(robot) {
    robot.bubbled = BUBBLE_SECONDS;
    robot.throwing = 0;
    robot.secondThrow = false;
    this.emit('bubbled', { robot });
  }

  bonk(robot) {
    robot.bonks = (robot.bonks ?? 0) + 1;
    robot.shakeFor = 0.12;
    this.stats.bonks += 1;
    this.emit('bonk', { robot });
    if (robot.bonks >= LID_BONKS) {
      robot.lidOff = true;
      this.emit('lid-off', { robot });
    }
  }

  /** The magnet pulls a bolt out of a robot that's hit, now and then. */
  pullBolt(robot) {
    if (this.time - (robot.pulledAt ?? -Infinity) < MAGNET_EVERY_SECONDS) return;
    robot.pulledAt = this.time;
    this.addPrize('bolt', robot, 0, { pulled: true });
  }

  /** It comes apart into two little ones, one each side of where it was. */
  split(robot) {
    this.toDealWith += 2;
    for (const side of [-1, 1]) this.spawn('mini', 0, { x: robot.x + side * 0.75, z: robot.z, paint: robot.paint, state: 'walking' });
    this.emit('split', { robot });
  }

  get place() {
    return this.stops[this.index] ?? null;
  }

  get isLastStop() {
    return this.index === this.stops.length - 1;
  }

  /** How many robots are still to be dealt with here. */
  get leftHere() {
    return this.queue.length + this.robots.length;
  }

  /** How far the way the tram has come between stops, from 0 to 1. */
  get moved() {
    return this.phase === 'moving' ? 1 - this.phaseLeft / this.moveSeconds : 1;
  }

  emit(type, details = {}) {
    this.onEvent({ type, ...details });
  }

  /* ---------- where the story has got to ---------- */

  /** Robots moving about before anything counts: behind the title, and during the countdown. */
  warmUp(dt) {
    if (this.phase !== 'fighting') return;
    this.time += dt;
    this.clock += dt;
    this.updateRobots(dt, false);
  }

  /** The first place, with the robots already on their way. */
  start() {
    this.index = 0;
    this.beginPlace();
    this.phase = 'fighting';
    this.emit('arrived', { place: this.place, index: 0 });
  }

  beginPlace() {
    // Prizes still on their way from the last stop carry on, and are counted when they get there. A key
    // still on its way there opens that stop's chest, not this one's.
    if (this.leavingChest?.keyIn > 0) this.openChest(this.leavingChest);
    this.leavingChest = this.chest?.keyIn > 0 ? this.chest : null;
    this.chest = this.plan.keyChest ? { keyIn: 0, open: false, place: this.place } : null;
    this.queue = lineUp(this.place, this.plan.rollers, this.plan);
    this.toDealWith = this.queue.length;
    this.robots = [];
    this.goo = [];
    this.shots = [];
    this.spawnIn = 0;
    this.throwIn = this.level.firstThrow;
    this.holdThrows = this.index === 0 && this.challenge.firstHold ? FIRST_STOP_HOLD_SECONDS : 0;
    this.emit('place', { place: this.place, index: this.index, total: this.stops.length });
    this.spawnSome(AHEAD_START);
  }

  spawnSome(ahead = 0) {
    const out = this.robots.filter(({ kind }) => kind !== 'big').length;
    let room = this.atOnce - out;
    // The big one doesn't count towards how many are out, and always comes first.
    while (this.queue.length && (room > 0 || this.queue[0] === 'big')) {
      const kind = this.queue.shift();
      if (kind !== 'big') room -= 1;
      this.spawn(kind, ahead);
    }
  }

  /** A robot comes out. at puts it somewhere in particular, as for the little ones from a splitting one. */
  spawn(kind, ahead = 0, at = null) {
    const robot = {
      id: nextId,
      kind,
      hp: ROBOT_KINDS[kind].hp,
      maxHp: ROBOT_KINDS[kind].hp,
      x: 0,
      y: 0,
      z: 0,
      state: 'walking',
      stateFor: 0,
      phase: this.random() * Math.PI * 2,
      paint: Math.floor(this.random() * 1000),
      rise: 1,
      shakeFor: 0,
      throwing: 0,
    };
    nextId += 1;
    const placed = {
      walker: () => this.placeWalker(robot, ahead),
      roller: () => this.placeRoller(robot, ahead),
      drone: () => this.placeDrone(robot, ahead),
      peeker: () => this.placePeeker(robot),
      big: () => this.placeBig(robot),
      lid: () => this.placeWalker(robot, ahead),
      splitter: () => this.placeWalker(robot, ahead),
      mini: () => this.placeWalker(robot, ahead),
      keybot: () => this.placeWalker(robot, ahead),
      carrier: () => this.placeCarrier(robot, ahead),
    };
    placed[kind]();
    if (at) Object.assign(robot, at);
    this.robots.push(robot);
    this.emit('robot', { robot });
    return robot;
  }

  /** A place that nobody else is using, or any of them if they're all taken. */
  freeSpot(spots, inUse) {
    const taken = new Set(this.robots.map(inUse));
    const free = spots.map((_, index) => index).filter((index) => !taken.has(index));
    const choices = free.length ? free : spots.map((_, index) => index);
    return choices[Math.floor(this.random() * choices.length)];
  }

  placeWalker(robot, ahead) {
    const { doors, posts } = this.place;
    const door = doors[Math.floor(this.random() * doors.length)];
    robot.post = this.freeSpot(posts, ({ post }) => post);
    const [x, z] = posts[robot.post];
    robot.x = mix(door[0], x, ahead);
    robot.z = mix(door[1], z, ahead);
    robot.shuffleIn = this.shuffleEvery * (0.7 + this.random() * 0.6);
  }

  /** It comes out of a door like a walker, and then never stops for long. */
  placeRoller(robot, ahead) {
    this.placeWalker(robot, ahead);
  }

  placeDrone(robot, ahead) {
    const { air } = this.place;
    robot.spot = this.freeSpot(air, ({ spot }) => spot);
    robot.enter = ahead;
    robot.fromX = (robot.spot % 2 ? 1 : -1) * 22;
    robot.swoopFor = 0;
    robot.swoopSide = 1;
    robot.dive = 0;
    if (this.plan.swoop) robot.swoopIn = between(this.random, SWOOP.every);
    this.moveDrone(robot, 0);
  }

  /** It comes in from one side like a drone, and then goes slowly to and fro in front of everything. */
  placeCarrier(robot, ahead) {
    robot.enter = ahead;
    robot.fromX = (this.random() < 0.5 ? -1 : 1) * 22;
    robot.drift = 0;
    robot.pal = PALS[this.index % PALS.length];
    this.moveCarrier(robot, 0);
  }

  placePeeker(robot) {
    robot.cover = this.freeSpot(this.place.covers, ({ cover }) => cover);
    robot.state = 'rising';
    robot.rise = 0;
    this.setAtCover(robot);
    this.emit('peek', { robot });
  }

  setAtCover(robot) {
    const [x, z] = this.place.covers[robot.cover];
    robot.x = x;
    robot.z = z + 0.5; // Just behind what it's hiding behind.
  }

  placeBig(robot) {
    const [x, z] = this.place.big;
    robot.x = x;
    robot.z = z;
    robot.state = 'ready';
    robot.spots = BIG_SPOTS.slice(0, this.level.bigSpots).map((spot) => ({ ...spot, kind: 'spot', big: robot, maxHp: spot.hp, open: false, done: false }));
    robot.spotIn = 0.4;
    robot.king = this.plan.king;
  }

  /* ---------- what can be aimed at ---------- */

  /** Everything the crosshair can be pulled onto right now. */
  targets() {
    const found = [];
    for (const robot of this.robots) {
      if (robot.kind === 'big') {
        for (const spot of robot.spots) if (spot.open) found.push(spot);
      } else if (robot.kind !== 'peeker' || robot.rise > 0.55) {
        found.push(robot);
      }
    }
    return found.concat(this.goo);
  }

  isTarget(thing) {
    return this.targets().includes(thing);
  }

  /* ---------- every frame ---------- */

  /** hand is what readHand says, and target is what's in the crosshair, if anything. */
  update(dt, { hand = 'none', target = null } = {}) {
    if (this.phase === 'ready' || this.phase === 'won' || this.phase === 'lost') return;
    this.time += dt;
    // In slow motion the robots and their goo go slower, and the child's blaster doesn't.
    const robotsDt = this.slowing ? dt * SLOW.robots : dt;
    this.clock += robotsDt;
    this.shield = hand === 'closed';
    this.updateRest(dt, hand);
    this.updatePowers(dt);
    this.updateBlaster(dt, hand, target);
    this.updateShots(dt);
    this.updateRobots(robotsDt);
    this.updateGoo(this.slowing ? dt * SLOW.goo : dt);
    this.updatePrizes(dt);
    this.updateChest(dt);
    this.updatePhase(dt);
  }

  updateRest(dt, hand) {
    this.restFor = hand === 'open' ? 0 : this.restFor + dt;
    const resting = this.restFor >= REST_AFTER_SECONDS;
    if (resting === this.resting) return;
    this.resting = resting;
    if (resting) {
      // Nothing bad happens to someone who's resting, so what's in the air goes too.
      for (const goo of this.goo) this.emit('goo-gone', { goo });
      this.goo = [];
      for (const robot of this.robots) {
        robot.throwing = 0;
        robot.secondThrow = false;
      }
      this.emit('rest');
    } else {
      this.throwIn = Math.max(this.throwIn, THROW_AGAIN_AFTER_REST);
      this.emit('rest-over');
    }
  }

  updateBlaster(dt, hand, target) {
    const aimed = Boolean(target) && this.isTarget(target);
    const fire = this.fireKind;
    // Paper planes find a robot by themselves, so an open hand fires them whatever it's on.
    const aiming = aimed || (fire === 'planes' && hand === 'open' && this.robotTargets().length > 0);
    const { shots, ranOut, filled } = this.blaster.update(dt, { hand, aiming, rate: FIRE_RATES[fire] ?? FIRE_RATE });
    for (let i = 0; i < shots; i += 1) this.fireOne(aimed ? target : null, fire);
    if (ranOut) this.emit('empty');
    if (filled) {
      this.stats.reloads += 1;
      this.emit('reloaded');
    }
  }

  /** One shot, of whatever kind the blaster has. The triple shot sends two more balls at what's near. */
  fireOne(target, fire) {
    const kind = { bubble: 'bubble', boing: 'boing', planes: 'plane' }[fire] ?? 'paint';
    const shot = this.makeShot(kind === 'plane' ? this.planeTarget(target) : target, kind);
    this.shots.push(shot);
    this.stats.shots += 1;
    const sides = [];
    if (fire === 'spread' && target) {
      // The other two balls go for whatever's near enough. With nothing near, there's just the one.
      this.nearestTo(target, 2, SPREAD_REACH).forEach((other, index) => {
        const side = this.makeShot(other, 'paint', { side: true, aimedAt: target, colour: (shot.colour + 1 + index) % 4 });
        sides.push(side);
        this.shots.push(side);
      });
    }
    this.emit('shot', { shot, sides });
  }

  updateShots(dt) {
    const next = [];
    for (const shot of this.shots) {
      shot.left -= dt;
      if (shot.left <= 0) this.land(shot, next);
    }
    this.shots = this.shots.filter(({ left }) => left > 0).concat(next);
  }

  /**
   * A shot has got there. What it was aimed at may have gone by now, and that's fine. A ball that went
   * wide lands on nothing. next is where a boing ball bouncing on goes.
   */
  land(shot, next = []) {
    const { target } = shot;
    if (!target || !this.isTarget(target)) return;
    const damage = shot.kind === 'boing' ? BOING.damage : 1;
    if (target.kind === 'goo') {
      this.gooShot(target);
    } else if (target.kind === 'spot') {
      this.hitSpot(target, damage);
    } else if (lidIsUp(target) && shot.kind !== 'plane') {
      // Paper planes fly round the side of a lid.
      this.bonk(target);
    } else {
      const trapped = target.bubbled > 0;
      if (shot.kind === 'bubble' && !trapped && target.kind !== 'big') this.trap(target);
      target.hp -= trapped ? damage * 2 : damage;
      target.shakeFor = 0.22;
      this.emit('robot-hit', { robot: target, shot });
      if (this.magnetOn && this.plan.bolts) this.pullBolt(target);
      if (target.hp <= 0) this.drop(target);
    }
    this.bounceOn(shot, next);
  }

  gooShot(goo) {
    goo.hp -= 1;
    if (goo.hp > 0) return;
    this.goo = this.goo.filter((other) => other !== goo);
    this.stats.gooShot += 1;
    this.emit('goo-shot', { goo });
  }

  hitSpot(spot, damage = 1) {
    spot.hp -= damage;
    spot.big.shakeFor = 0.22;
    this.emit('spot-hit', { spot, robot: spot.big });
    if (spot.hp > 0) return;
    spot.open = false;
    spot.done = true;
    const big = spot.big;
    big.spotIn = BIG_NEXT_SPOT_SECONDS;
    this.emit('spot-done', { spot, robot: big, left: big.spots.filter(({ done }) => !done).length });
    if (this.plan.bolts) {
      this.addPrize('bolt', spot, 0);
      this.addPrize('bolt', spot, 1);
      if (this.plan.gems) this.addPrize('gem', spot, 2);
    }
    if (big.spots.every(({ done }) => done)) {
      // All the helpers fall down with it, which is the big moment of the whole game.
      this.queue = [];
      this.drop(big);
      for (const robot of [...this.robots]) this.drop(robot, { withBig: true });
    }
  }

  /**
   * A robot falls apart. What it leaves comes out first, while it can still be seen where it was. Those
   * falling down with the big one don't leave anything or come apart, but a key still opens the chest
   * and a friend being carried still floats down.
   */
  drop(robot, { withBig = false } = {}) {
    if (!withBig) this.leaveBehind(robot);
    if (robot.kind === 'keybot') this.keyFlies(robot);
    if (robot.kind === 'carrier') this.freePal(robot);
    this.robots = this.robots.filter((other) => other !== robot);
    this.stats.robots += 1;
    this.holdThrows = 0;
    this.spawnIn = Math.max(this.spawnIn, BETWEEN_ROBOTS_SECONDS);
    this.emit('robot-dropped', { robot, left: this.leftHere });
    if (robot.kind === 'splitter' && !withBig) this.split(robot);
  }

  updateRobots(dt, throwing = true) {
    const fighting = this.phase === 'fighting';
    this.spawnIn -= dt;
    if (this.spawnIn <= 0 && this.queue.length && (fighting || this.phase === 'moving')) {
      const before = this.queue.length;
      this.spawnOne();
      if (this.queue.length < before) this.spawnIn = BETWEEN_ROBOTS_SECONDS;
    }
    for (const robot of this.robots) {
      robot.shakeFor = Math.max(0, robot.shakeFor - dt);
      // One floating in a bubble stays where it is, and can't throw. Its own time waits too, so that it
      // carries on from where it was, rather than landing a hop or ducking all at once.
      if (robot.bubbled > 0) {
        robot.bubbled = Math.max(0, robot.bubbled - dt);
        robot.bubbleTime = (robot.bubbleTime ?? 0) + dt;
        if (robot.bubbled === 0) this.emit('unbubbled', { robot });
        continue;
      }
      robot.stateFor += dt;
      if (ON_FOOT.has(robot.kind)) this.updateWalker(robot, dt);
      else if (robot.kind === 'roller') this.updateRoller(robot, dt);
      else if (robot.kind === 'drone') this.moveDrone(robot, dt);
      else if (robot.kind === 'carrier') this.moveCarrier(robot, dt);
      else if (robot.kind === 'peeker') this.updatePeeker(robot);
      else this.updateBig(robot, dt);
      if (robot.throwing > 0) this.updateThrow(robot, dt);
    }
    if (fighting && throwing) this.updateThrowing(dt);
  }

  spawnOne() {
    const out = this.robots.filter(({ kind }) => kind !== 'big').length;
    if (out < this.atOnce || this.queue[0] === 'big') this.spawn(this.queue.shift());
  }

  setState(robot, state) {
    robot.state = state;
    robot.stateFor = 0;
  }

  updateWalker(robot, dt) {
    if (this.resting) return; // They've stopped to wave.
    const [x, z] = this.place.posts[robot.post];
    if (robot.state === 'walking') {
      const gapX = x - robot.x;
      const gapZ = z - robot.z;
      const gap = Math.hypot(gapX, gapZ);
      const step = this.walkSpeed * dt;
      if (gap <= step) {
        robot.x = x;
        robot.z = z;
        this.setState(robot, 'ready');
      } else {
        robot.x += (gapX / gap) * step;
        robot.z += (gapZ / gap) * step;
      }
      return;
    }
    // They don't stand about for long, so there's always something moving.
    robot.shuffleIn -= dt;
    if (robot.shuffleIn <= 0 && robot.throwing === 0) {
      robot.post = this.freeSpot(this.place.posts, ({ post }) => post);
      robot.shuffleIn = this.shuffleEvery * (0.7 + this.random() * 0.6);
      this.setState(robot, 'walking');
    }
  }

  /** A roller is always on the move, from spot to spot, with only a moment at each to turn round. */
  updateRoller(robot, dt) {
    if (this.resting) return; // It's stopped to wave, like everyone else.
    if (robot.state === 'ready') {
      if (robot.stateFor < ROLL_PAUSE_SECONDS) return;
      robot.post = this.freeSpot(this.place.posts, ({ post }) => post);
      this.setState(robot, 'walking');
    }
    const [x, z] = this.place.posts[robot.post];
    const gapX = x - robot.x;
    const gapZ = z - robot.z;
    const gap = Math.hypot(gapX, gapZ);
    // Quicker on the faster paces, but never so quick that it's hard to follow.
    const step = Math.min(ROLL_FASTEST, ROLL_SPEED * this.plan.walk * (this.pace.walk / PACES.slow.walk)) * dt;
    if (gap <= step) {
      robot.x = x;
      robot.z = z;
      this.setState(robot, 'ready');
    } else {
      robot.x += (gapX / gap) * step;
      robot.z += (gapZ / gap) * step;
    }
  }

  moveDrone(robot, dt) {
    const [x, y, z] = this.place.air[robot.spot];
    robot.enter = Math.min(1, robot.enter + dt / DRONE_ENTER_SECONDS);
    if (robot.enter === 1 && robot.state === 'walking') this.setState(robot, 'ready');
    // Its own time, which waited while it was in a bubble.
    const time = this.clock - (robot.bubbleTime ?? 0) + robot.phase;
    let hoverX = x + Math.sin(time * 0.62) * 2.2;
    let hoverY = y + Math.sin(time * 1.15) * 0.45;
    let hoverZ = z + Math.cos(time * 0.47) * 1.1;
    if (this.plan.swoop) {
      robot.dive = this.updateSwoop(robot, dt);
      hoverX += robot.dive * robot.swoopSide * SWOOP.across;
      hoverY -= robot.dive * SWOOP.down;
      hoverZ -= robot.dive * SWOOP.nearer;
    }
    const smooth = robot.enter * robot.enter * (3 - 2 * robot.enter);
    robot.x = mix(robot.fromX, hoverX, smooth);
    robot.y = mix(8, hoverY, smooth);
    robot.z = mix(z + 7, hoverZ, smooth);
  }

  /** Slowly to and fro across the place, and still while the child rests. */
  moveCarrier(robot, dt) {
    robot.enter = Math.min(1, robot.enter + dt / DRONE_ENTER_SECONDS);
    if (robot.enter === 1 && robot.state === 'walking') this.setState(robot, 'ready');
    if (!this.resting) robot.drift += dt;
    const turn = robot.drift * CARRIER.speed + robot.phase;
    const x = Math.sin(turn) * CARRIER.across;
    const y = CARRIER.height + Math.sin(robot.drift * 0.9) * 0.3;
    const z = CARRIER.z + Math.cos(turn * 0.5) * 1.2;
    const smooth = robot.enter * robot.enter * (3 - 2 * robot.enter);
    robot.x = mix(robot.fromX, x, smooth);
    robot.y = mix(8, y, smooth);
    robot.z = mix(z + 7, z, smooth);
  }

  /** How far down into a swoop a drone is, as a smooth dip from 0 to 1 and back up. */
  updateSwoop(robot, dt) {
    if (robot.swoopFor > 0) {
      robot.swoopFor = Math.max(0, robot.swoopFor - dt);
      return Math.sin((1 - robot.swoopFor / SWOOP.seconds) * Math.PI) ** 2;
    }
    robot.swoopIn -= dt;
    // Not while it's throwing, and never while the child is resting.
    if (robot.swoopIn > 0 || robot.state !== 'ready' || robot.throwing > 0 || this.resting || this.phase !== 'fighting') return 0;
    robot.swoopFor = SWOOP.seconds;
    robot.swoopSide = this.random() < 0.5 ? -1 : 1;
    robot.swoopIn = between(this.random, SWOOP.every);
    this.emit('swoop', { robot });
    return 0;
  }

  updatePeeker(robot) {
    const { stateFor, state } = robot;
    if (state === 'rising') {
      robot.rise = Math.min(1, stateFor / PEEK_RISE_SECONDS);
      if (robot.rise === 1) this.setState(robot, 'ready');
    } else if (state === 'ready') {
      if (this.resting || robot.throwing > 0) return; // Stay up to wave, or to finish throwing.
      if (stateFor <= this.peekSeconds) return;
      if (this.plan.hop && this.random() < HOP.share) this.startHop(robot);
      else this.setState(robot, 'ducking');
    } else if (state === 'hopping') {
      this.updateHop(robot);
    } else if (state === 'ducking') {
      robot.rise = Math.max(0, 1 - stateFor / PEEK_RISE_SECONDS);
      if (robot.rise === 0) this.setState(robot, 'hidden');
    } else if (stateFor > PEEK_HIDDEN_SECONDS) {
      // Up again somewhere else.
      robot.cover = this.freeSpot(this.place.covers, ({ cover }) => cover);
      this.setAtCover(robot);
      this.setState(robot, 'rising');
      this.emit('peek', { robot });
    }
  }

  /** Out over the top of its cover and through the air to another, and it can be hit on the way. */
  startHop(robot) {
    robot.hopFrom = robot.cover;
    robot.cover = this.freeSpot(this.place.covers, ({ cover }) => cover);
    robot.hop = 0;
    robot.lift = 0;
    this.setState(robot, 'hopping');
    this.emit('hop', { robot });
  }

  updateHop(robot) {
    const [fromX, fromZ] = this.place.covers[robot.hopFrom];
    const [toX, toZ] = this.place.covers[robot.cover];
    robot.hop = Math.min(1, robot.stateFor / HOP.seconds);
    robot.x = mix(fromX, toX, robot.hop);
    robot.z = mix(fromZ, toZ, robot.hop) + 0.5;
    robot.lift = 4 * HOP.height * robot.hop * (1 - robot.hop);
    if (robot.hop === 1) {
      robot.lift = 0;
      this.setState(robot, 'ready');
    }
  }

  updateBig(robot, dt) {
    // From side to side on the higher levels, and still while the child rests.
    if (this.plan.bigSteps && this.phase === 'fighting' && !this.resting) {
      robot.stepTime = (robot.stepTime ?? 0) + dt;
      robot.x = this.place.big[0] + Math.sin(robot.stepTime * BIG_STEP.speed) * BIG_STEP.across;
    }
    // Nothing opens until the tram has got here, so that it can be seen happening.
    if (this.phase !== 'fighting' || robot.spots.some(({ open }) => open)) return;
    const next = robot.spots.find(({ done }) => !done);
    if (!next) return;
    robot.spotIn -= dt;
    if (robot.spotIn <= 0) {
      next.open = true;
      this.emit('spot-open', { spot: next, robot });
    }
  }

  /* ---------- goo ---------- */

  updateThrowing(dt) {
    if (this.resting) return;
    if (this.holdThrows > 0) {
      this.holdThrows -= dt;
      return;
    }
    this.throwIn -= dt;
    if (this.throwIn > 0) return;
    if (this.goo.length + this.inHand >= this.gooInAir) return;
    // On Medium and Tough, from level 4, they wait for the shield to come down, and throw as it does.
    if (this.challenge.waitForShield && this.shield) return;
    // Rollers are too busy rolling to throw anything, and so are little ones and drones carrying a friend.
    // A robot floating in a bubble can't.
    const able = this.robots.filter((robot) => robot.state === 'ready' && robot.throwing === 0 && !NEVER_THROW.has(robot.kind) && !(robot.bubbled > 0) && (robot.kind !== 'peeker' || robot.rise === 1));
    if (!able.length) return;
    const thrower = able[Math.floor(this.random() * able.length)];
    thrower.throwing = WINDUP_SECONDS;
    this.throwIn = this.throwEvery * (0.8 + this.random() * 0.4);
    this.emit('windup', { robot: thrower });
  }

  /** How many robots have goo in their hands, ready to throw. */
  get inHand() {
    return this.robots.filter(({ throwing }) => throwing > 0).length;
  }

  updateThrow(robot, dt) {
    robot.throwing -= dt;
    if (robot.throwing > 0) return;
    robot.throwing = 0;
    if (this.resting || this.phase !== 'fighting') return;
    this.throwGoo(robot);
    if (robot.secondThrow) {
      robot.secondThrow = false;
      return;
    }
    // On the higher levels, now and then another straight after it, if there's room for one more.
    const { doubleThrow } = this.plan;
    if (doubleThrow > 0 && robot.kind !== 'big' && this.goo.length + this.inHand < this.gooInAir && this.random() < doubleThrow) {
      robot.secondThrow = true;
      robot.throwing = SECOND_THROW_SECONDS;
      this.emit('windup', { robot, again: true });
    }
  }

  throwGoo(robot) {
    const heights = { walker: 2.5, lid: 2.5, splitter: 2.5, keybot: 2.5, drone: robot.y - 0.5, peeker: 1.9, big: 7.6 };
    const side = this.random() < 0.5 ? -1 : 1;
    const goo = {
      id: nextId,
      kind: 'goo',
      hp: GOO_HP,
      fromX: robot.x + (robot.kind === 'big' ? side * 4.5 : 0.4),
      fromY: heights[robot.kind],
      fromZ: robot.z,
      toX: side * (0.3 + this.random() * 0.5),
      x: 0,
      y: 0,
      z: 0,
      t: 0,
      seconds: this.gooSeconds,
      big: robot.kind === 'big',
    };
    nextId += 1;
    this.placeGoo(goo);
    this.goo.push(goo);
    this.emit('goo', { goo, robot });
  }

  placeGoo(goo) {
    const { t } = goo;
    goo.x = mix(goo.fromX, goo.toX, t);
    goo.z = mix(goo.fromZ, GOO_STOPS_AT, t);
    goo.y = mix(goo.fromY, EYE_HEIGHT - GOO_FROM_EYE, t) + GOO_LOB * 4 * t * (1 - t);
  }

  updateGoo(dt) {
    for (const goo of [...this.goo]) {
      goo.t = Math.min(1, goo.t + dt / goo.seconds);
      this.placeGoo(goo);
      if (goo.t === 1) this.gooArrives(goo);
    }
  }

  gooArrives(goo) {
    this.goo = this.goo.filter((other) => other !== goo);
    if (this.shield) {
      this.stats.gooBlocked += 1;
      this.emit('goo-blocked', { goo });
      return;
    }
    // The shield bubble from a power-up stops it too, as long as it lasts.
    if (this.guarded) {
      this.stats.gooBubbled += 1;
      this.emit('goo-blocked', { goo, bubble: true });
      return;
    }
    this.stats.gooHits += 1;
    this.hearts = Math.max(this.level.canLose ? 0 : 1, this.hearts - 1);
    this.emit('goo-hit', { goo, hearts: this.hearts });
    if (this.hearts === 0) {
      // The last of the goo goes, as one heart is all it takes.
      this.goo.forEach((other) => this.emit('goo-gone', { goo: other }));
      this.goo = [];
      this.setPhase('lost-soon', LOST_SECONDS);
    }
  }

  /** How close the nearest goo is to arriving, from 0 to 1. */
  get gooClose() {
    return this.goo.reduce((most, { t }) => Math.max(most, t), 0);
  }

  /* ---------- from place to place ---------- */

  setPhase(phase, seconds = 0) {
    this.phase = phase;
    this.phaseLeft = seconds;
  }

  updatePhase(dt) {
    if (this.phase === 'fighting') {
      if (this.leftHere === 0) this.free();
      return;
    }
    this.phaseLeft -= dt;
    if (this.phaseLeft > 0) return;
    if (this.phase === 'freeing') this.afterFreeing();
    else if (this.phase === 'moving') this.arrive();
    else if (this.phase === 'lost-soon') this.lose();
  }

  free() {
    const { place } = this;
    this.goo.forEach((goo) => this.emit('goo-gone', { goo }));
    this.goo = [];
    this.shots = [];
    this.freed += 1;
    this.stats.friends += 1;
    this.hearts = Math.min(this.level.hearts, this.hearts + 1); // A friend's thanks gives one back.
    this.setPhase('freeing', this.isLastStop ? WIN_SECONDS : FREE_SECONDS);
    this.emit('freed', { place, index: this.index, last: this.isLastStop, hearts: this.hearts });
  }

  afterFreeing() {
    if (this.isLastStop) {
      this.collectAll();
      this.phase = 'won';
      this.emit('won');
      return;
    }
    const from = this.place;
    this.index += 1;
    // The short rescue has further to go between stops, though never more than the longest move.
    this.moveSeconds = this.stops === PLACES ? this.pace.moveSeconds : Math.min(LONGEST_MOVE_SECONDS, this.pace.moveSeconds * 1.3);
    this.setPhase('moving', this.moveSeconds);
    this.beginPlace();
    this.emit('moving', { from, to: this.place, seconds: this.moveSeconds });
  }

  arrive() {
    this.setPhase('fighting');
    this.emit('arrived', { place: this.place, index: this.index });
  }

  lose() {
    this.collectAll();
    this.phase = 'lost';
    this.emit('lost');
  }
}
