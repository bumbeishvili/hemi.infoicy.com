// The rules of Cannon Bay. No screen, camera or sound in this file, so it all runs in the unit tests.
//
// Pirates have come for the island's treasure, and the child's ship drives them off. One hand does
// everything. Moving it from side to side turns the wheel. Opening it raises the sails, and the wider
// it's open the faster the ship goes, which is the sustained opening being practised. Closing it lowers
// them, and the ship slows and drifts, and that's never a failure.
//
// The cannons fire by themselves, at any pirate ship in the firing zone on either side, as ships fire
// from their sides. They only fire with the hand seen to be open, unless a grown-up has set them to
// fire always, and even then only with the hand in view. Pirates hunt the child's ship and turn side on
// to fire slow cannonballs in high arcs. Nobody gets hurt: a beaten ship lowers its sails and slowly
// sinks, and its crew rows away in a lifeboat. A hand that's gone or stays closed is a rest: the
// pirates stop firing and sail in circles, and nothing bad can happen.
import { ramp, stepsAt } from '../../core/levels.js';
import { WORLD } from '../sky-wings/island-map.js';
import { getChart } from './chart.js';

const degrees = (value) => (value * Math.PI) / 180;

/**
 * What each level changes, from level 1, which is the game as it always was, up to level 10. The
 * numbers are shares of, or additions to, the speed and difficulty a grown-up chose, so a level never
 * changes those choices, the number of ships, the firing zones, the help with lining up, the cannons
 * firing always, or Gentle being impossible to lose. Resting stops everything new here, just as it
 * stops the rest.
 */
export function levelPlan(level = 1) {
  return {
    fireEvery: ramp(level, 1, 0.7), // Pirates reload quicker.
    apart: ramp(level, 1, 0.7), // And broadsides come closer together.
    chase: ramp(level, 1, 1.15), // They sail up to 15% faster when chasing or running.
    side: ramp(level, 1, 0.75), // They stay alongside for less long before sailing off, never under three quarters as long.
    runEvery: ramp(level, 0.33, 0.22), // Being hit, they run for it more often: this is a share of their hits.
    weave: level >= 3, // From level 3, a pirate running for it zigzags, so it takes more steering to stay with.
    sloops: level >= 5, // From level 5, every third pirate sails a quick little sloop.
    atOnce: stepsAt(level, { 1: 0, 6: 1 }), // From level 6, four pirates at once rather than three.
    balls: stepsAt(level, { 1: 0, 7: 1 }), // From level 7, each broadside has one more ball.
    flagship: level >= 9, // From level 9, the last captain sails a big flagship.
    // Something new to see and play with at every level from 2, on top of the numbers above. NEWS below
    // names each of them for the cards. Prizes and power-ups only ever help, and missing one costs nothing.
    gems: level >= 2, // Beaten ships drop gems, which float over to the ship.
    triple: level >= 2, // A power-up: three balls at once.
    sailors: level >= 3, // A pirate tows a sailor in a cage, who floats free when it's beaten.
    hearts: level >= 3, // Some ships drop a heart, which can go two over the usual five.
    rafts: level >= 4, // Barrel rafts, which come apart into two little ones.
    shield: level >= 4, // A power-up: a bubble round the ship that balls bounce off.
    bubble: level >= 5, // A power-up: balls that trap a ship in a bubble for a moment.
    keys: level >= 6, // A pirate carries a key, and picking it up brings a treasure chest.
    magnet: level >= 6, // A power-up: prizes come from far away.
    smoke: level >= 7, // Smoke ships, which hide in a puff of smoke and slip away, twice.
    mist: level >= 7, // A light sea mist.
    subs: level >= 8, // Submarines, which dive and come up somewhere else.
    bounce: level >= 8, // A power-up: a big ball that bounces on to the next ship.
    snow: level >= 9, // A power-up: snowballs that slow a ship down.
    king: level >= 10, // The last is the pirate king's ship, whose sails come down one at a time.
    sunset: level >= 10, // The sun going down, with the light just as bright.
  };
}

/**
 * How much harder each level is again on Medium and Tough, where the pirates can sink the ship, on top of
 * levelPlan. Gentle keeps the game exactly as it always was, so for Gentle every number here leaves things as
 * they are. Level 1 is the same on every setting, so a child who has never played can learn it. By level 10
 * pirates reload about twice as quickly as at level 1, more than twice as many of their balls are aimed true,
 * the balls take 70% as long to come over, and hearts come back half as quickly.
 */
export function challengePlan(level = 1, canLose = true) {
  if (!canLose) return { fireEvery: 1, apart: 1, hitChance: 1, ballSeconds: 1, healAfter: 1 };
  return {
    fireEvery: ramp(level, 1, 0.75), // With levelPlan's, about twice as quick to reload at level 10.
    apart: ramp(level, 1, 0.75), // And broadsides come closer together.
    hitChance: ramp(level, 1, 2.2), // More of their balls are aimed true.
    ballSeconds: ramp(level, 1, 0.7), // The balls come over quicker, so there's less time to get out of the way.
    healAfter: ramp(level, 1, 2), // A heart takes up to twice as long to come back.
  };
}

/**
 * What each level brings that's new, for the title card, the countdown and the finish card. Each key is
 * switched on in levelPlan from that level on. Things that only get quicker or more frequent aren't here.
 */
export const NEWS = [
  { level: 2, key: 'gems', mark: '💎', name: 'Gems', nameKa: 'ძვირფასი ქვები' },
  { level: 2, key: 'triple', mark: '🍡', name: 'Triple shot', nameKa: 'სამმაგი გასროლა' },
  { level: 3, key: 'sailors', mark: '🛟', name: 'Sailors to rescue', nameKa: 'გადასარჩენი მეზღვაურები' },
  { level: 3, key: 'hearts', mark: '❤️', name: 'Extra hearts', nameKa: 'დამატებითი გულები' },
  { level: 4, key: 'rafts', mark: '🛶', name: 'Barrel rafts', nameKa: 'კასრების ტივები' },
  { level: 4, key: 'shield', mark: '🛡️', name: 'Shield bubble', nameKa: 'დამცავი ბუშტი' },
  { level: 5, key: 'sloops', mark: '⛵', name: 'Quick sloops', nameKa: 'სწრაფი ნავები' },
  { level: 5, key: 'bubble', mark: '🫧', name: 'Bubble shot', nameKa: 'ბუშტის გასროლა' },
  { level: 6, key: 'keys', mark: '🗝️', name: 'Key and chest', nameKa: 'გასაღები და სკივრი' },
  { level: 6, key: 'magnet', mark: '🧲', name: 'Magnet', nameKa: 'მაგნიტი' },
  { level: 7, key: 'smoke', mark: '💨', name: 'Smoke ships', nameKa: 'კვამლის გემები' },
  { level: 7, key: 'mist', mark: '☁️', name: 'Sea mist', nameKa: 'ზღვის ნისლი' },
  { level: 8, key: 'subs', mark: '🔭', name: 'Submarines', nameKa: 'წყალქვეშა ნავები' },
  { level: 8, key: 'bounce', mark: '🏐', name: 'Bouncing ball', nameKa: 'მხტუნავი ბურთი' },
  { level: 9, key: 'flagship', mark: '🚢', name: 'Big flagship', nameKa: 'დიდი ფლაგმანი' },
  { level: 9, key: 'snow', mark: '❄️', name: 'Snow shot', nameKa: 'თოვლის გასროლა' },
  { level: 10, key: 'king', mark: '👑', name: 'Pirate King', nameKa: 'მეკობრეების მეფე' },
  { level: 10, key: 'sunset', mark: '🌅', name: 'Sunset', nameKa: 'მზის ჩასვლა' },
];

/** What's new at this level, as the cards show it: [{ mark, name, nameKa, key }]. Nothing at level 1. */
export function newsAt(level) {
  return NEWS.filter((item) => item.level === level).map(({ key, mark, name, nameKa }) => ({ key, mark, name, nameKa }));
}

/** The name and picture of something new, by its key in levelPlan, for the little label the first time it's seen. */
export const newsFor = (key) => NEWS.find((item) => item.key === key) ?? null;

// The kinds of pirate ship: how many of the level's hits beat it, how fast it is, how big it looks, and
// how many more or fewer balls it fires each time. A raft comes apart into two little ones, which never
// fire. A submarine spends some of its time under the water, where it can't be fired at. The king's ship
// has four sails, which come down one at a time as it's hit.
export const SHIP_KINDS = {
  ship: { hits: 1, speed: 1, size: 1, balls: 0 },
  sloop: { hits: 0.6, speed: 1.2, size: 0.72, balls: 0 },
  flagship: { hits: 1.5, speed: 1, size: 1.3, balls: 1 },
  raft: { hits: 0.5, speed: 0.9, size: 1, balls: -1 },
  little: { hits: 0.22, speed: 1.1, size: 0.6, balls: 0, quiet: true },
  smoky: { hits: 0.9, speed: 1.05, size: 1, balls: 0 },
  sub: { hits: 0.7, speed: 1, size: 1, balls: -1 },
  king: { hits: 1.8, speed: 1, size: 1.38, balls: 1, parts: 4 },
};

// What the child's cannons can fire, for a few seconds, from a power-up floating on the water. Each is
// switched on by levelPlan under the same name. shield and magnet are the two that aren't cannonballs.
export const POWERS = {
  triple: { seconds: 10, fire: true },
  shield: { seconds: 10, fire: false },
  bubble: { seconds: 10, fire: true },
  magnet: { seconds: 12, fire: false },
  bounce: { seconds: 10, fire: true },
  snow: { seconds: 10, fire: true },
};
// The level each comes in, as the newest is dropped first. A heart takes its turn with them, from level 3.
const BONUS_FROM = { triple: 2, hearts: 3, shield: 4, bubble: 5, magnet: 6, bounce: 8, snow: 9 };

// How fast the child's ship can go, in units a second.
export const PACES = {
  slow: { speed: 24 },
  medium: { speed: 32 },
  fast: { speed: 42 },
};

// zone is the firing zone on each side: how far round from the bow it starts and ends, and how far out
// it reaches. shipHits is how many hits beat a ship, hitChance how many of their cannonballs are aimed
// true, and fireEvery how long a pirate takes to reload, with apart the least time between any two
// broadsides. assist is how much the ship helps to keep a nearby pirate alongside. canLose says whether
// running out of hearts ends the battle.
export const LEVELS = {
  gentle: { zone: { from: degrees(20), to: degrees(135), reach: 172 }, shipHits: 30, hitChance: 0.12, fireEvery: [7, 10], balls: 2, apart: 4.5, healAfter: 6, assist: 1, canLose: false },
  medium: { zone: { from: degrees(26), to: degrees(125), reach: 155 }, shipHits: 36, hitChance: 0.14, fireEvery: [6, 9], balls: 2, apart: 3.6, healAfter: 8, assist: 0.6, canLose: true },
  tough: { zone: { from: degrees(38), to: degrees(115), reach: 135 }, shipHits: 44, hitChance: 0.14, fireEvery: [5, 7], balls: 3, apart: 3.6, healAfter: 10, assist: 0.3, canLose: true },
};

export const HEARTS = 5;
export const MOST_AT_ONCE = 3;
export const REST_AFTER = 4; // Seconds of the hand not being open before it counts as a rest.
export const HULL = { half: 17, beam: 6 }; // Half its length and half its width.
export const GUN_SPOTS = [9, 3, -3, -9]; // Along the side of a ship, forward of its middle.
export const GUN_HEIGHT = 5.5;

const START = { x: -120, z: 860, heading: 0 };

const SAIL = {
  raise: 2.2,
  lower: 1.4,
  lowest: 0.62, // How much of its speed a ship has with the hand only just open.
  driveFrom: 0.8, // snapshot.drive when the hand is only just open.
  drift: 0.09, // How much of its speed it keeps with the sails down.
  speedUp: 0.9,
  slowDown: 0.55,
  turn: 0.62, // Radians a second at full wheel.
  turnDrifting: 0.45, // How much of that it can do with hardly any way on.
  wheelEase: 7,
};
const COAST = { keep: 66, least: 30, lookBase: 24, lookSeconds: 1.7, turn: 2.2, tilt: 0.25, tiltMore: 0.5, push: 70 };
const EDGE = { turnBackFrom: WORLD.limit - 110, turn: 1.4, sayEvery: 18 };
const ASSIST = { from: 1.5, middle: degrees(78), most: 0.7, turn: 0.42, against: 0.65 };
const SHOT = { every: 0.45, speed: 170, shortest: 0.3, longest: 1.25, arc: 4, arcPerUnit: 0.09, height: 6.5, spread: 9 };
const BALL = { speed: 46, shortest: 2, longest: 3.2, arc: 30, arcPerUnit: 0.17, every: 0.24, near: 4, miss: [7, 26], missAlong: 26, hitWiden: 3 };
const PIRATE = {
  turn: 0.52,
  // How fast they go, as shares of how fast the child's ship can go, so that they can always catch up.
  chase: 1.12,
  catchUp: 1.35,
  keener: 0.04, // How much faster it goes for each second of the chase.
  keenestMore: 0.6,
  far: 260,
  closeEnough: 150,
  leaveRange: 235,
  alongside: 95, // How far out they sit when side on to the child.
  alongsideMore: 26, // A bit further for each one, so that they're not on top of each other.
  sideSeconds: [5, 8],
  awaySeconds: [4.5, 6.5],
  awayTo: { away: [150, 250], angle: [degrees(18), degrees(75)] }, // Out in front, to be chased.
  awayShare: 1,
  beamWithin: degrees(35),
  circle: 0.4,
  circleTurn: 0.22,
  relocateAway: 680,
  relocateUnhit: 40,
  stuckAfter: 5,
  stuckAway: 150,
  // With the child's ship going round and round, one that hasn't been hit for a while slows down to be
  // caught, and then tries coming closer again. Otherwise the two of them could go on chasing each
  // other's tails for ever.
  slowsEvery: 22,
  slowsFor: 10,
  slowsWithin: 230,
  slowsWhenTurning: 0.4,
  slowShare: 0.3,
  firstBroadside: 7,
  firstFire: [1.5, 4],
  afterRest: 1.8,
  sinkSeconds: 7,
  sailsDown: 0.7,
  nextIn: 1,
  apart: 46,
};
const WEAVE = { turn: 0.75, every: 1.4 }; // How far each way, in radians, and how quickly a weaving pirate turns.
const GIVE_WAY = { within: 82, cone: degrees(42), turn: 2.2 }; // The child's ship steers round a pirate right in front of it.
// Nobody sails into the place the child is watching from, behind their ship, and blocks the view.
export const VIEW_KEPT_CLEAR = { behind: 72, radius: 50 };
const SPAWN = { away: [270, 340], angle: [degrees(15), degrees(62)], room: 60, tries: 24 };
const ROW = { speed: 7, seconds: 13, startOut: 20, aside: 1.05 };
// What a beaten ship leaves floating: a line of gold leading from where it went down towards the child.
const GOLD = { coins: 6, from: 22, apart: 12, reach: 13, seconds: 26, least: 10 };
// Prizes from the higher levels float over to the ship by themselves from this near, and from much
// further with the magnet. They're picked up by the hull coming this close, and go after a while.
const PRIZE = { reach: 16, pull: 120, drift: 22, magnetPull: 520, magnetDrift: 70, seconds: 32, from: 30, spread: 26, gems: 3, chestGems: 6, chestAway: [110, 150], least: 12, fade: 1.2 };
export const MOST_HEARTS = HEARTS + 2;
const TRIPLE = { apart: 11 };
const BUBBLE = { seconds: 3.2 };
const FROST = { seconds: 5, speed: 0.5, reload: 0.4 };
const BOUNCE = { reach: 190 };
const SMOKE = { seconds: 3, every: 0.34 };
const SUB = { up: 8, under: 4.5 };
const TOW = 30; // How far behind its ship a sailor's cage is towed.
const WON_AFTER = 2.6;
const AFTER_WIN_WHEEL = 0.3;
// A friend's ship, in a duel: as many of its balls as are shown flying over at once, as many of its hits as can
// wait to be shown as one of them lands, and how long the child's ship wobbles for one, as a pirate's does.
const FRIEND_FIRE = { most: 4, mostDue: 6, wobble: 0.35 };

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const between = (random, [low, high]) => low + random() * (high - low);
const damp = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));
/** The shortest way round from one direction to another. */
const turnBetween = (to, from) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const headingTo = (dx, dz) => Math.atan2(dx, -dz);

/** Which way a ship is pointing. Heading 0 is north, along -z, and a turn to the right adds to it. */
export const forwardOf = (heading) => ({ x: Math.sin(heading), z: -Math.cos(heading) });
/** Its right-hand side. */
export const rightOf = (heading) => ({ x: Math.cos(heading), z: Math.sin(heading) });

/**
 * Turns anything on the water along the coast as it nears it, the nearer the more, so that it goes
 * round rather than hitting it, and back from the edge of the world. A ship has a little look ahead too,
 * further the faster it's going, so that it starts in good time.
 */
function steerRound(ship, dt) {
  const chart = getChart();
  const forward = forwardOf(ship.heading);
  const look = COAST.lookBase + ship.speed * COAST.lookSeconds;
  const roomHere = chart.room(ship.x, ship.z);
  let room = roomHere;
  let fromX = ship.x;
  let fromZ = ship.z;
  for (const share of [0.33, 0.66, 1]) {
    const x = ship.x + forward.x * look * share;
    const z = ship.z + forward.z * look * share;
    const there = chart.room(x, z);
    // Land further ahead doesn't matter as much yet.
    const counted = there + look * share * 0.5;
    if (counted < room) {
      room = counted;
      // With land close by already, what matters is getting away from that.
      if (there > 0 && roomHere > COAST.keep) {
        fromX = x;
        fromZ = z;
      }
    }
    if (there <= 0) break;
  }
  ship.coast = clamp((COAST.keep - room) / (COAST.keep - COAST.least), 0, 1);
  if (ship.coast > 0) {
    const out = chart.away(fromX, fromZ);
    const tilt = COAST.tilt + COAST.tiltMore * ship.coast;
    if (forward.x * out.x + forward.z * out.z < Math.sin(tilt)) {
      const outward = headingTo(out.x, out.z);
      const oneWay = turnBetween(outward + Math.PI / 2 - tilt, ship.heading);
      const otherWay = turnBetween(outward - Math.PI / 2 + tilt, ship.heading);
      const way = Math.abs(oneWay) < Math.abs(otherWay) ? oneWay : otherWay;
      ship.heading += clamp(way, -1, 1) * COAST.turn * ship.coast * dt;
    }
  }
  const fromMiddle = Math.hypot(ship.x, ship.z);
  ship.atLimit = clamp((fromMiddle - EDGE.turnBackFrom) / (WORLD.limit - EDGE.turnBackFrom), 0, 1);
  if (ship.atLimit > 0) ship.heading += turnBetween(headingTo(-ship.x, -ship.z), ship.heading) * ship.atLimit * EDGE.turn * dt;
}

/** However it got there, nothing can be closer to the land than this, or further out than the edge. */
function keepOnTheWater(ship, dt) {
  const chart = getChart();
  const room = chart.room(ship.x, ship.z);
  if (room < COAST.least) {
    const out = chart.away(ship.x, ship.z);
    const push = Math.min(COAST.least - room, COAST.push * dt);
    ship.x += out.x * push;
    ship.z += out.z * push;
  }
  const fromMiddle = Math.hypot(ship.x, ship.z);
  if (fromMiddle > WORLD.limit) {
    ship.x *= WORLD.limit / fromMiddle;
    ship.z *= WORLD.limit / fromMiddle;
  }
}

export class Battle {
  /**
   * ships is how many there are to beat. pace, level and cannons are the grown-ups' settings. start is where
   * the child's ship starts, as { x, z, heading }: with a friend, see duel.js, there are no ships to beat, and
   * the friend's ship is added with addFriend.
   */
  constructor({ ships = 6, pace = 'slow', level = 'medium', levelNumber = 1, cannons = 'open', start = START, random = Math.random, onEvent = () => {} } = {}) {
    this.random = random;
    this.onEvent = onEvent;
    this.total = ships;
    // The level being played, from 1 to 10, which makes it harder within the grown-up's choices.
    this.levelNumber = levelNumber;
    this.plan = levelPlan(levelNumber);
    this.setPace(pace);
    this.setLevel(level);
    this.cannons = cannons;

    this.state = 'ready'; // ready, sailing, won, lost
    this.time = 0;
    this.x = start.x;
    this.z = start.z;
    this.heading = start.heading ?? 0;
    this.speed = 0;
    this.sails = 0;
    this.wheel = 0;
    this.turning = 0;
    this.coast = 0;
    this.atLimit = 0;
    this.saidLimitAt = -Infinity;

    this.hearts = HEARTS;
    this.sinceHurt = 0;
    this.hurtLeft = 0;
    this.notOpenFor = 0;
    this.resting = false;
    this.open = false;
    this.wasOpen = false;
    this.canFire = false;

    this.pirates = [];
    this.waiting = ships; // Still to come.
    this.nextPirate = 0;
    this.spawnIn = 0;
    this.broadsideIn = PIRATE.firstBroadside;
    this.ballsFired = 0; // Each of the pirates' cannonballs has a number, for a friend's game to know it by.
    this.zones = { left: this.emptyZone(), right: this.emptyZone() };
    this.shots = []; // The child's.
    this.balls = []; // The pirates'.
    this.boats = [];
    this.coins = [];
    this.prizes = []; // Gems, hearts, keys, chests, sailors in cages and power-ups, from level 2.
    this.power = null; // The power-up going, as { kind, left, total }.
    this.wonIn = null;
    this.roles = this.planRoles();
    this.bonuses = this.bonusOrder();
    this.nextBonus = 0;
    this.friend = null; // With a friend, their ship: see addFriend.
    this.strikesDue = 0; // Their hits on the child's ship still to be shown: see struck.

    this.stats = { beaten: 0, shots: 0, hits: 0, hurts: 0, seconds: 0, openSeconds: 0, openings: 0, crewsAway: 0, gold: 0, gems: 0, hearts: 0, keys: 0, chests: 0, sailors: 0, powers: 0, littles: 0, blocked: 0, struck: 0 };
  }

  emptyZone() {
    return { target: null, inside: false, firing: false, reload: 0, nextGun: 0 };
  }

  setPace(pace) {
    this.pace = PACES[pace] ?? PACES.slow;
  }

  setLevel(level) {
    this.level = LEVELS[level] ?? LEVELS.medium;
    this.challenge = challengePlan(this.levelNumber, this.level.canLose);
  }

  emit(type, details = {}) {
    this.onEvent({ type, ...details });
  }

  begin() {
    this.state = 'sailing';
    this.fill();
  }

  get beaten() {
    return this.stats.beaten;
  }

  /** Ships still to beat, with any little rafts still afloat. */
  get left() {
    return this.total - this.stats.beaten + this.pirates.filter((pirate) => pirate.little && pirate.state === 'sailing').length;
  }

  get afloat() {
    return this.pirates.filter(({ state }) => state === 'sailing');
  }

  /** What the cannons can fire at: afloat, and not hidden under the water or in smoke, or a friend's ship on the child's side. */
  canTarget(pirate) {
    return pirate.state === 'sailing' && !pirate.under && !(pirate.smoke > 0) && !pirate.ally;
  }

  /**
   * The ship a pirate is after: the child's. With a friend's ship on the child's side, it's one of the two: see
   * team.js. Whichever it is has a place, a heading, a speed and how hard it's turning.
   */
  preyOf() {
    return this;
  }

  /** Whether the pirates wait, sailing in circles: while the child rests. */
  get paused() {
    return this.resting;
  }

  get targets() {
    return this.pirates.filter((pirate) => this.canTarget(pirate));
  }

  /** The kind of fire the cannons have right now: a power-up's, or the usual. */
  get fireKind() {
    return this.power && POWERS[this.power.kind].fire ? this.power.kind : 'ball';
  }

  get firing() {
    return this.zones.left.firing || this.zones.right.firing;
  }

  /* ---------- pirates ---------- */

  /** How many pirates there are about at once. */
  get mostAtOnce() {
    return MOST_AT_ONCE + this.plan.atOnce;
  }

  fill() {
    while (this.waiting > 0 && this.afloat.filter((pirate) => !pirate.little && !pirate.friend).length < this.mostAtOnce) this.spawn();
  }

  /**
   * What sort of ship each pirate sails, on the higher levels: the last is the flagship, or the pirate
   * king's. The others take turns at the kinds the level has, the newest first so that it's seen straight
   * away, with a plain ship between each.
   */
  kindFor(index) {
    const { plan } = this;
    if (index === this.total - 1 && plan.king) return 'king';
    if (index === this.total - 1 && plan.flagship) return 'flagship';
    const kinds = [['subs', 'sub'], ['smoke', 'smoky'], ['sloops', 'sloop'], ['rafts', 'raft']].filter(([key]) => plan[key]).map(([, kind]) => kind);
    if (kinds.length === 0) return 'ship';
    const turns = kinds.flatMap((kind) => [kind, 'ship']);
    return turns[index % turns.length];
  }

  /** Each pirate's kind, and which of them tow a sailor in a cage and which carry the key, at this level. */
  planRoles() {
    const roles = Array.from({ length: this.total }, (_, index) => ({ kind: this.kindFor(index), cage: false, key: false }));
    const last = this.total - 1;
    if (this.plan.sailors) {
      // The second pirate, so a rescue comes early, and another later on in a long battle.
      const towing = (from) => roles.findIndex((role, index) => index >= from && index < last && !role.cage && ['ship', 'sloop', 'smoky'].includes(role.kind));
      const first = towing(1);
      if (first >= 0) roles[first].cage = true;
      const second = this.total >= 6 ? towing(Math.max(4, first + 2)) : -1;
      if (second >= 0) roles[second].cage = true;
    }
    if (this.plan.keys) {
      // The chest the key brings up has to be sailed to before the battle ends, so it's never the last,
      // and it's a plain ship or a sloop, which are soon beaten: not one that hides, dives or comes apart.
      // In a battle of four they're all out at once, so it can be the first, or one towing a sailor too.
      const quick = (role) => role.kind === 'ship' || role.kind === 'sloop';
      const choices = [
        (role, index) => index >= 2 && quick(role) && !role.cage,
        (role) => quick(role) && !role.cage,
        (role) => quick(role),
        (role) => !['raft', 'smoky', 'sub'].includes(role.kind),
        () => true,
      ];
      let carrier = -1;
      for (const fits of choices) {
        carrier = roles.findIndex((role, index) => index < last && fits(role, index));
        if (carrier >= 0) break;
      }
      roles[Math.max(0, carrier)].key = true;
    }
    return roles;
  }

  /** The power-ups and hearts that beaten ships drop, one each, in turn: the level's newest first. */
  bonusOrder() {
    return Object.entries(BONUS_FROM)
      .filter(([key]) => this.plan[key])
      .sort(([, a], [, b]) => b - a)
      .map(([key]) => (key === 'hearts' ? { kind: 'heart' } : { kind: 'power', power: key }));
  }

  /** Somewhere for a ship to come from, out in front of the ship it's after, the child's, if there's water there. */
  findOpenWater(prey = this) {
    const chart = getChart();
    const { random } = this;
    const fits = (x, z) => chart.room(x, z) >= SPAWN.room && Math.hypot(x, z) < WORLD.limit - 40;
    for (let attempt = 0; attempt < SPAWN.tries; attempt += 1) {
      // Out in front to begin with, and anywhere at all if that's all land.
      const spread = attempt < SPAWN.tries / 2 ? between(random, SPAWN.angle) : random() * Math.PI;
      const direction = prey.heading + spread * (random() < 0.5 ? -1 : 1);
      const away = between(random, SPAWN.away);
      const x = prey.x + Math.sin(direction) * away;
      const z = prey.z - Math.cos(direction) * away;
      if (fits(x, z)) return { x, z };
    }
    const forward = forwardOf(prey.heading);
    return { x: prey.x + forward.x * SPAWN.away[0], z: prey.z + forward.z * SPAWN.away[0] };
  }

  spawn() {
    this.waiting -= 1;
    const prey = this.preyOf({ index: this.nextPirate });
    const { x, z } = this.findOpenWater(prey);
    const role = this.roles[this.nextPirate] ?? { kind: this.kindFor(this.nextPirate) };
    const pirate = this.makePirate(role.kind, x, z, this.nextPirate, prey);
    pirate.cage = Boolean(role.cage);
    pirate.key = Boolean(role.key);
    this.nextPirate += 1;
    this.pirates.push(pirate);
    this.emit('spawn', { pirate });
  }

  /** A pirate ship of a kind, at a place, pointing more or less at the ship it's after. */
  makePirate(kind, x, z, index, prey = this) {
    const { random } = this;
    const hits = Math.max(3, Math.round(this.level.shipHits * SHIP_KINDS[kind].hits));
    return {
      index,
      kind,
      maxHits: hits,
      x,
      z,
      heading: headingTo(prey.x - x, prey.z - z) + (random() - 0.5),
      speed: this.pace.speed * PIRATE.chase,
      state: 'sailing',
      hitsLeft: hits,
      hitLeft: 0,
      mode: 'chase',
      modeLeft: 0,
      spot: null,
      runAt: hits * 0.66,
      childSide: random() < 0.5 ? -1 : 1, // Which side of the child's ship it comes up on.
      way: random() < 0.5 ? -1 : 1,
      fireIn: between(random, PIRATE.firstFire),
      chasing: 0,
      sinceHit: 0,
      pressed: 0,
      burstLeft: 0,
      burstIn: 0,
      burstSide: 1,
      sink: 0,
      sails: 1,
      turning: 0,
      coast: 0,
      atLimit: 0,
      little: kind === 'little',
      cage: false,
      key: false,
      bubbled: 0, // Seconds left in a bubble, from the bubble shot.
      frosted: 0, // Seconds left slowed down, from a snowball.
      smoke: 0, // Seconds left hidden in its own smoke, for a smoke ship.
      smokeAt: hits * 0.66,
      under: false, // A submarine under the water.
      diveIn: SUB.up,
      partsLeft: SHIP_KINDS[kind].parts ?? 0, // The king's sails.
    };
  }

  /** How much faster than usual this pirate sails when chasing or running for it: see levelPlan and SHIP_KINDS. */
  quicker(pirate) {
    return this.plan.chase * SHIP_KINDS[pirate.kind].speed * (pirate.frosted > 0 ? FROST.speed : 1);
  }

  /** Sails a pirate towards a direction, and round anything in the way. */
  sailPirate(pirate, wanted, share, dt) {
    const before = pirate.heading;
    pirate.heading += clamp(turnBetween(wanted, pirate.heading), -PIRATE.turn * dt, PIRATE.turn * dt);
    pirate.speed = damp(pirate.speed, this.pace.speed * share, 1.1, dt);
    steerRound(pirate, dt);
    const forward = forwardOf(pirate.heading);
    pirate.x += forward.x * pirate.speed * dt;
    pirate.z += forward.z * pirate.speed * dt;
    keepOnTheWater(pirate, dt);
    if (dt > 0) pirate.turning = damp(pirate.turning, clamp(turnBetween(pirate.heading, before) / (PIRATE.turn * dt), -1, 1), 3, dt);
  }

  /** Where a pirate wants to be, level with the ship it's after, the child's, and out to one side of it. */
  stationFor(pirate) {
    const chart = getChart();
    const prey = this.preyOf(pirate);
    const across = rightOf(prey.heading);
    const out = Math.min(PIRATE.alongside + (pirate.index % this.mostAtOnce) * PIRATE.alongsideMore, this.level.zone.reach * 0.85);
    const spot = (side) => ({ x: prey.x + across.x * side * out, z: prey.z + across.z * side * out });
    // With the child's ship turning hard, it can only keep up on the inside of the turn.
    if (Math.abs(prey.turning) > 0.5) pirate.childSide = prey.turning > 0 ? 1 : -1;
    const wanted = spot(pirate.childSide);
    if (chart.room(wanted.x, wanted.z) > 30) return wanted;
    pirate.childSide = -pirate.childSide;
    return spot(pirate.childSide);
  }

  /** Somewhere out in front of the child's ship, to sail to and be chased. */
  sendAway(pirate, seconds = between(this.random, PIRATE.awaySeconds)) {
    const { random } = this;
    const prey = this.preyOf(pirate);
    const direction = prey.heading + between(random, PIRATE.awayTo.angle) * (random() < 0.5 ? -1 : 1);
    const away = between(random, PIRATE.awayTo.away);
    pirate.spot = { x: prey.x + Math.sin(direction) * away, z: prey.z - Math.cos(direction) * away };
    pirate.mode = 'away';
    pirate.modeLeft = seconds;
  }

  movePirate(pirate, dt) {
    pirate.hitLeft = Math.max(0, pirate.hitLeft - dt);
    // A friend's ship is sailed by their own game, and only put where it says: see placeFriend.
    if (pirate.friend) return;
    if (pirate.state === 'sinking') {
      this.sinkPirate(pirate, dt);
      return;
    }
    // A snowball's frost and a bubble wait while the child rests, like the power-ups, so resting never
    // uses them up.
    const waiting = this.resting && this.state === 'sailing';
    if (!waiting) pirate.frosted = Math.max(0, pirate.frosted - dt);
    pirate.smoke = Math.max(0, pirate.smoke - dt);
    // Trapped in a bubble, it bobs where it is for a moment, and can't fire.
    if (pirate.bubbled > 0) {
      if (!waiting) pirate.bubbled = Math.max(0, pirate.bubbled - dt);
      pirate.burstLeft = 0;
      pirate.speed = damp(pirate.speed, 0, 2.5, dt);
      const forward = forwardOf(pirate.heading);
      pirate.x += forward.x * pirate.speed * dt;
      pirate.z += forward.z * pirate.speed * dt;
      keepOnTheWater(pirate, dt);
      if (pirate.bubbled === 0) this.emit('unbubbled', { pirate });
      return;
    }
    // The ship it's after: the child's, or with a friend on the child's side, one of the two.
    const prey = this.preyOf(pirate);
    const dx = prey.x - pirate.x;
    const dz = prey.z - pirate.z;
    const away = Math.hypot(dx, dz);

    // Round the far side of the island is too far to wait for anyone, so it comes from somewhere nearer.
    pirate.pressed = pirate.coast > 0.25 ? pirate.pressed + dt : 0;
    pirate.sinceHit += dt;
    const stuck = pirate.pressed > PIRATE.stuckAfter && away > PIRATE.stuckAway;
    if (away > PIRATE.relocateAway || stuck || (pirate.sinceHit > PIRATE.relocateUnhit && away > PIRATE.closeEnough)) {
      const { x, z } = this.findOpenWater(prey);
      Object.assign(pirate, { x, z, heading: headingTo(prey.x - x, prey.z - z), mode: 'chase', pressed: 0, chasing: 0, sinceHit: 0 });
      return;
    }
    if (this.paused) {
      pirate.mode = 'circle';
      this.sailPirate(pirate, pirate.heading + pirate.way * PIRATE.circleTurn, PIRATE.circle, dt);
      return;
    }
    if (pirate.mode === 'circle') pirate.mode = 'chase';
    if (pirate.kind === 'sub' && this.diveOrSurface(pirate, dt)) return;

    // Slowed by a snowball, it takes longer to reload too.
    pirate.fireIn -= dt * (pirate.frosted > 0 ? FROST.reload : 1);
    pirate.modeLeft -= dt;
    if (pirate.sinceHit % PIRATE.slowsEvery > PIRATE.slowsEvery - PIRATE.slowsFor && away < PIRATE.slowsWithin && Math.abs(prey.turning) > PIRATE.slowsWhenTurning) {
      this.sailPirate(pirate, pirate.heading, PIRATE.slowShare, dt);
      const off = turnBetween(headingTo(dx, dz), pirate.heading);
      this.fireWhenSideOn(pirate, away, off, off >= 0 ? 1 : -1);
      this.carryOnFiring(pirate, dt);
      return;
    }
    if (pirate.mode === 'away') {
      const toX = pirate.spot.x - pirate.x;
      const toZ = pirate.spot.z - pirate.z;
      if (pirate.modeLeft <= 0 || Math.hypot(toX, toZ) < 30) pirate.mode = 'chase';
      else this.sailPirate(pirate, headingTo(toX, toZ) + this.weaving(pirate), PIRATE.awayShare * this.quicker(pirate), dt);
    }
    if (pirate.mode === 'chase') {
      if (away < PIRATE.closeEnough) {
        pirate.mode = 'side';
        pirate.chasing = 0;
        pirate.modeLeft = between(this.random, PIRATE.sideSeconds) * this.plan.side;
        // The side it's on already, rather than crossing the child's bows to get to the other.
        const across = rightOf(prey.heading);
        pirate.childSide = -dx * across.x - dz * across.z >= 0 ? 1 : -1;
      } else {
        // Straight for the child, and for a place beside them from further off, a little faster the
        // longer it goes on, so that nobody can be left going round and round out of reach.
        pirate.chasing += dt;
        const station = away > PIRATE.far ? this.stationFor(pirate) : prey;
        const share = ((away > PIRATE.far ? PIRATE.catchUp : PIRATE.chase) + Math.min(PIRATE.keenestMore, pirate.chasing * PIRATE.keener)) * this.quicker(pirate);
        this.sailPirate(pirate, headingTo(station.x - pirate.x, station.z - pirate.z), share, dt);
      }
    }
    if (pirate.mode === 'side') {
      if (away > PIRATE.leaveRange) {
        pirate.mode = 'chase';
      } else if (pirate.modeLeft <= 0) {
        this.sendAway(pirate);
      } else {
        this.sailAlongside(pirate, dt);
      }
    }
    this.carryOnFiring(pirate, dt);
  }

  /**
   * A submarine comes up for a while and then dives, and under the water it can't be fired at and
   * doesn't fire, and goes to come up again beside the child. Says whether it's under.
   */
  diveOrSurface(pirate, dt) {
    pirate.diveIn -= dt;
    if (pirate.diveIn <= 0) {
      pirate.under = !pirate.under;
      pirate.diveIn = pirate.under ? SUB.under : SUB.up;
      pirate.burstLeft = 0;
      if (!pirate.under) pirate.fireIn = Math.max(pirate.fireIn, PIRATE.afterRest);
      this.emit(pirate.under ? 'dive' : 'surface', { pirate });
    }
    if (!pirate.under) return false;
    const station = this.stationFor(pirate);
    this.sailPirate(pirate, headingTo(station.x - pirate.x, station.z - pirate.z), PIRATE.catchUp * this.quicker(pirate), dt);
    return true;
  }

  /** On the higher levels, a pirate running for it zigzags from side to side. */
  weaving(pirate) {
    return this.plan.weave ? Math.sin(this.time * WEAVE.every + pirate.index * 1.7) * WEAVE.turn : 0;
  }

  /** Side on to the child and going the same way, as ships really did, and firing when it's ready. */
  sailAlongside(pirate, dt) {
    const prey = this.preyOf(pirate);
    const station = this.stationFor(pirate);
    const toX = station.x - pirate.x;
    const toZ = station.z - pirate.z;
    const gap = Math.hypot(toX, toZ);
    const keepUp = prey.speed / this.pace.speed;
    const forward = forwardOf(pirate.heading);
    const ahead = toX * forward.x + toZ * forward.z;
    // Well off its station it heads for it, and on it it goes the same way as the child's ship.
    const share = Math.max(0.2, Math.min(PIRATE.catchUp, keepUp + ahead * 0.012));
    const onStation = clamp(gap / 40, 0, 1);
    const wanted = prey.heading + turnBetween(headingTo(toX, toZ), prey.heading) * onStation;
    this.sailPirate(pirate, wanted, share, dt);
    const dx = prey.x - pirate.x;
    const dz = prey.z - pirate.z;
    const off = turnBetween(headingTo(dx, dz), pirate.heading);
    this.fireWhenSideOn(pirate, Math.hypot(dx, dz), off, off >= 0 ? 1 : -1);
  }

  fireWhenSideOn(pirate, away, off, facing) {
    // Broadsides at any one ship come a while apart, so each child has as many as on their own.
    const prey = this.preyOf(pirate);
    if (pirate.burstLeft > 0 || pirate.fireIn > 0 || prey.broadsideIn > 0 || away > PIRATE.leaveRange) return;
    if (SHIP_KINDS[pirate.kind].quiet || pirate.under || pirate.smoke > 0) return;
    if (Math.abs(Math.abs(off) - Math.PI / 2) > PIRATE.beamWithin) return;
    pirate.burstLeft = Math.max(1, this.level.balls + this.plan.balls + SHIP_KINDS[pirate.kind].balls);
    pirate.burstIn = 0;
    pirate.burstSide = facing;
    pirate.fireIn = between(this.random, this.level.fireEvery) * this.plan.fireEvery * this.challenge.fireEvery;
    prey.broadsideIn = this.level.apart * this.plan.apart * this.challenge.apart;
  }

  carryOnFiring(pirate, dt) {
    if (pirate.burstLeft <= 0) return;
    pirate.burstIn -= dt;
    if (pirate.burstIn > 0) return;
    pirate.burstLeft -= 1;
    pirate.burstIn = BALL.every;
    this.fireBall(pirate);
  }

  /** A slow ball in a high arc, to where the ship it's after, the child's, looks like being when it lands. */
  fireBall(pirate) {
    const { random } = this;
    const prey = this.preyOf(pirate);
    const side = rightOf(pirate.heading);
    const forward = forwardOf(pirate.heading);
    const along = GUN_SPOTS[pirate.burstLeft % GUN_SPOTS.length];
    const from = {
      x: pirate.x + forward.x * along + side.x * pirate.burstSide * HULL.beam,
      y: GUN_HEIGHT,
      z: pirate.z + forward.z * along + side.z * pirate.burstSide * HULL.beam,
    };
    const dx = prey.x - from.x;
    const dz = prey.z - from.z;
    const away = Math.hypot(dx, dz);
    const seconds = clamp(away / BALL.speed, BALL.shortest, BALL.longest) * this.challenge.ballSeconds;
    // Most land just beside the ship, near enough to see, and only some are aimed true.
    const mine = forwardOf(prey.heading);
    const across = rightOf(prey.heading);
    const aimedTrue = random() < this.level.hitChance * this.challenge.hitChance;
    const out = aimedTrue ? (random() - 0.5) * BALL.near : (HULL.beam + BALL.hitWiden + between(random, BALL.miss)) * (random() < 0.5 ? -1 : 1);
    const ahead = (random() - 0.5) * (aimedTrue ? BALL.near : BALL.missAlong) + prey.speed * seconds;
    const to = {
      x: prey.x + mine.x * ahead + across.x * out,
      z: prey.z + mine.z * ahead + across.z * out,
    };
    this.ballsFired += 1;
    const ball = { id: this.ballsFired, from, to, t: 0, seconds, arc: BALL.arc + away * BALL.arcPerUnit, x: from.x, y: from.y, z: from.z, harmless: this.resting, pirate, prey };
    this.balls.push(ball);
    this.emit('pirate-fire', { pirate, ball });
  }

  sinkPirate(pirate, dt) {
    pirate.sink = Math.min(1, pirate.sink + dt / PIRATE.sinkSeconds);
    pirate.sails = Math.max(0, pirate.sails - dt / PIRATE.sailsDown);
    pirate.speed = damp(pirate.speed, 0, 0.8, dt);
    const forward = forwardOf(pirate.heading);
    pirate.x += forward.x * pirate.speed * dt;
    pirate.z += forward.z * pirate.speed * dt;
    if (pirate.sink >= 1) pirate.state = 'gone';
  }

  /* ---------- a friend's ship, sailed by them on their own computer: see duel.js ---------- */

  /**
   * The friend's ship, at { x, z, heading }. It's fired at like a pirate ship, but it never sinks, as a hit
   * on it is only a point, its captain never calls out as a pirate does, and it never fires here: their game
   * does that, and says so. With ally, it's on the child's side instead, against the pirates, and the cannons
   * never fire at it: see team.js.
   */
  addFriend({ x, z, heading = 0 }, { ally = false } = {}) {
    const friend = this.makePirate('ship', x, z, 0);
    Object.assign(friend, { friend: true, ally, heading, speed: 0, sails: 0, mode: 'friend', maxHits: Infinity, hitsLeft: Infinity, fireIn: Infinity, spoke: true, gun: 0, resting: false, broadsideIn: PIRATE.firstBroadside });
    this.friend = friend;
    this.pirates.push(friend);
    return friend;
  }

  /** Where the friend's game says their ship is now, as { x, z, heading, speed, sails }, and whether their child is resting. */
  placeFriend({ x, z, heading, speed, sails, resting = false }, dt = 0) {
    const { friend } = this;
    if (!friend) return;
    const before = friend.heading;
    // As for the child's own ship, there's a moment after a rest before any pirate fires at it.
    if (friend.resting && !resting) friend.broadsideIn = Math.max(friend.broadsideIn, PIRATE.afterRest);
    Object.assign(friend, { x, z, heading, speed, sails, resting: Boolean(resting) });
    if (dt > 0) friend.turning = damp(friend.turning, clamp(turnBetween(heading, before) / (SAIL.turn * dt), -1, 1), 3, dt);
  }

  /**
   * The friend's cannons fired this many balls at the child's ship, as their game says. Their game decides
   * what they hit, so these are only to be seen: they fly over and land on the child's ship, harmlessly, and
   * a hit their game says it made shows as one of them lands: see struck.
   */
  friendFired(count) {
    const { friend } = this;
    if (!friend || this.state !== 'sailing') return;
    // On the child's side, they're firing at a pirate: the nearest one to them that their cannons could reach.
    let at = null;
    if (friend.ally) {
      let least = this.level.zone.reach * 1.15;
      for (const pirate of this.targets) {
        const away = Math.hypot(pirate.x - friend.x, pirate.z - friend.z);
        if (away < least) {
          least = away;
          at = pirate;
        }
      }
      if (!at) return;
    }
    const aim = at ?? this;
    const forward = forwardOf(friend.heading);
    const across = rightOf(friend.heading);
    // From the side of their ship that faces what they're firing at: the child's, in a duel.
    const side = (aim.x - friend.x) * across.x + (aim.z - friend.z) * across.z >= 0 ? 1 : -1;
    friend.burstSide = side;
    for (let i = 0; i < Math.min(count, FRIEND_FIRE.most); i += 1) {
      friend.gun = (friend.gun + 1) % GUN_SPOTS.length;
      const along = GUN_SPOTS[friend.gun];
      const from = {
        x: friend.x + forward.x * along + across.x * side * HULL.beam,
        y: GUN_HEIGHT,
        z: friend.z + forward.z * along + across.z * side * HULL.beam,
      };
      const away = Math.hypot(aim.x - from.x, aim.z - from.z);
      // As quick and as low as the child's own, rather than a pirate's high arcs, as that's what they are.
      const ball = { from, to: { x: aim.x, z: aim.z }, lands: SHOT.height, t: 0, seconds: clamp(away / SHOT.speed, SHOT.shortest, SHOT.longest), arc: SHOT.arc + away * SHOT.arcPerUnit, x: from.x, y: from.y, z: from.z, harmless: true, homing: true, at, pirate: friend };
      this.balls.push(ball);
      this.emit('pirate-fire', { pirate: friend, ball });
    }
  }

  /**
   * The friend's game says this many of its balls hit the child's ship: a point each for them. Each shows as
   * one of their balls lands, or at once if none is on its way. Nothing is lost, as there's nothing to lose.
   */
  struck(count = 1) {
    if (!this.friend || this.state !== 'sailing') return;
    this.strikesDue = Math.min(FRIEND_FIRE.mostDue, this.strikesDue + count);
  }

  /** One of the friend's hits, shown where it landed on the child's ship. */
  strike(at) {
    this.strikesDue = Math.max(0, this.strikesDue - 1);
    this.stats.struck += 1;
    this.hurtLeft = Math.max(this.hurtLeft, FRIEND_FIRE.wobble);
    this.emit('struck', { x: at.x, z: at.z });
  }

  /** The side of the child's ship facing something, where a ball from it lands. */
  sideFacing(x, z) {
    const across = rightOf(this.heading);
    const facing = (x - this.x) * across.x + (z - this.z) * across.z >= 0 ? 1 : -1;
    return { x: this.x + across.x * facing * HULL.beam, z: this.z + across.z * facing * HULL.beam };
  }

  /** The friend has gone, and their ship and its balls with them. */
  removeFriend() {
    const { friend } = this;
    if (!friend) return;
    friend.state = 'gone';
    this.pirates = this.pirates.filter((pirate) => pirate !== friend);
    this.balls = this.balls.filter(({ homing }) => !homing);
    this.strikesDue = 0;
    this.friend = null;
  }

  /** It's over at once, as a duel is when its time is up. Whatever's still in the air lands on nothing. */
  stop() {
    if (this.state !== 'sailing') return;
    this.state = 'won';
    this.strikesDue = 0;
    this.quietCannons();
    this.emit('won', { beaten: this.stats.beaten });
  }

  /**
   * Nobody ever bumps: ships only slide apart, with the pirates doing most of the moving. A friend's ship and
   * the child's make half the room each, as the friend's game does the same.
   */
  keepApart() {
    const ships = this.pirates.filter(({ state }) => state !== 'gone');
    const mine = forwardOf(this.heading);
    const viewX = this.x - mine.x * VIEW_KEPT_CLEAR.behind;
    const viewZ = this.z - mine.z * VIEW_KEPT_CLEAR.behind;
    for (let i = 0; i < ships.length; i += 1) {
      const pirate = ships[i];
      const fromView = Math.hypot(pirate.x - viewX, pirate.z - viewZ) || 1;
      if (fromView < VIEW_KEPT_CLEAR.radius) {
        const push = VIEW_KEPT_CLEAR.radius - fromView;
        pirate.x += ((pirate.x - viewX) / fromView) * push;
        pirate.z += ((pirate.z - viewZ) / fromView) * push;
      }
      const dx = pirate.x - this.x;
      const dz = pirate.z - this.z;
      const away = Math.hypot(dx, dz) || 1;
      if (away < PIRATE.apart) {
        const push = PIRATE.apart - away;
        const theirs = pirate.friend ? 0.5 : 0.8;
        pirate.x += (dx / away) * push * theirs;
        pirate.z += (dz / away) * push * theirs;
        this.x -= (dx / away) * push * (1 - theirs);
        this.z -= (dz / away) * push * (1 - theirs);
      }
      for (let j = i + 1; j < ships.length; j += 1) {
        const other = ships[j];
        const ox = other.x - pirate.x;
        const oz = other.z - pirate.z;
        const gap = Math.hypot(ox, oz) || 1;
        if (gap < PIRATE.apart) {
          const push = (PIRATE.apart - gap) / 2;
          other.x += (ox / gap) * push;
          other.z += (oz / gap) * push;
          pirate.x -= (ox / gap) * push;
          pirate.z -= (oz / gap) * push;
        }
      }
    }
  }

  /* ---------- the cannons ---------- */

  /** Which firing zone any part of a ship is in, as what's seen in the zone is what gets fired at. */
  zoneOf(pirate) {
    const { from, to, reach } = this.level.zone;
    const forward = forwardOf(pirate.heading);
    for (const along of [0, HULL.half, -HULL.half]) {
      const dx = pirate.x + forward.x * along - this.x;
      const dz = pirate.z + forward.z * along - this.z;
      if (Math.hypot(dx, dz) > reach) continue;
      const off = turnBetween(headingTo(dx, dz), this.heading);
      if (Math.abs(off) >= from && Math.abs(off) <= to) return off > 0 ? 'right' : 'left';
    }
    return null;
  }

  aimCannons(dt) {
    const nearest = { left: null, right: null };
    const distance = { left: Infinity, right: Infinity };
    for (const pirate of this.targets) {
      const side = this.zoneOf(pirate);
      if (!side) continue;
      const away = Math.hypot(pirate.x - this.x, pirate.z - this.z);
      if (away < distance[side]) {
        distance[side] = away;
        nearest[side] = pirate;
      }
    }
    for (const side of ['left', 'right']) {
      const zone = this.zones[side];
      zone.target = nearest[side];
      zone.inside = Boolean(zone.target);
      const firing = zone.inside && this.canFire;
      if (firing !== zone.firing) {
        zone.firing = firing;
        this.emit('firing', { side, on: firing });
      }
      zone.reload = Math.max(0, zone.reload - dt);
      if (firing && zone.reload === 0) this.fire(side);
    }
  }

  fire(side) {
    const zone = this.zones[side];
    const { target } = zone;
    const sign = side === 'right' ? 1 : -1;
    const forward = forwardOf(this.heading);
    const across = rightOf(this.heading);
    const gun = zone.nextGun;
    zone.nextGun = (gun + 1) % GUN_SPOTS.length;
    zone.reload = SHOT.every;
    const along = GUN_SPOTS[gun];
    const from = {
      x: this.x + forward.x * along + across.x * sign * HULL.beam,
      y: GUN_HEIGHT,
      z: this.z + forward.z * along + across.z * sign * HULL.beam,
    };
    const kind = this.fireKind;
    const aim = (this.random() - 0.5) * SHOT.spread * 2;
    // A triple shot is three balls side by side, along the target.
    const alongs = kind === 'triple' ? [aim - TRIPLE.apart, aim, aim + TRIPLE.apart] : [aim];
    let shot = null;
    for (const spot of alongs) {
      shot = this.launch(from, target, { side, gun, along: spot, fire: kind === 'ball' ? null : kind });
      this.stats.shots += 1;
    }
    this.emit('fire', { side, gun, shot, from, kind });
  }

  /** A ball from the child's ship, or bounced on from a ship it hit, on its way to target. */
  launch(from, target, { side = null, gun = 0, along = 0, fire = null, bounced = false } = {}) {
    const away = Math.hypot(target.x - from.x, target.z - from.z);
    const shot = {
      from: { ...from },
      target,
      side,
      gun,
      fire,
      bounced,
      t: 0,
      seconds: clamp(away / SHOT.speed, SHOT.shortest, SHOT.longest),
      arc: SHOT.arc + away * SHOT.arcPerUnit,
      along,
      x: from.x,
      y: from.y,
      z: from.z,
    };
    this.shots.push(shot);
    return shot;
  }

  /** Each shot goes to wherever its target has got to, as lining up exactly isn't the point. */
  moveShots(dt) {
    for (const shot of this.shots) {
      shot.t = Math.min(1, shot.t + dt / shot.seconds);
      const { target, from, t } = shot;
      const forward = forwardOf(target.heading);
      const toX = target.x + forward.x * shot.along;
      const toZ = target.z + forward.z * shot.along;
      shot.x = from.x + (toX - from.x) * t;
      shot.z = from.z + (toZ - from.z) * t;
      shot.y = from.y + (SHOT.height - from.y) * t + 4 * shot.arc * t * (1 - t);
      if (t >= 1) {
        // After the end, one still on its way just splashes down.
        if (this.state === 'sailing' && this.canTarget(target)) this.hit(target, shot);
        else this.emit('splash', { x: shot.x, z: shot.z, size: 0.5, mine: true });
      }
    }
    this.shots = this.shots.filter(({ t }) => t < 1);
  }

  hit(pirate, shot) {
    // A friend's ship never sinks and never runs: a hit on it is a point for the child, and that's all.
    if (pirate.friend) {
      pirate.hitLeft = 0.35;
      this.stats.hits += 1;
      this.emit('hit', { pirate, x: shot.x, y: shot.y, z: shot.z, fire: null, friend: true });
      return;
    }
    pirate.hitsLeft -= 1;
    pirate.hitLeft = 0.35;
    pirate.sinceHit = 0;
    // A hit by a friend on the child's side, which their game tells this one about, is theirs: see team.js.
    if (!shot.theirs) this.stats.hits += 1;
    this.emit('hit', { pirate, x: shot.x, y: shot.y, z: shot.z, fire: shot.fire ?? null, theirs: Boolean(shot.theirs) });
    this.knockSails(pirate, shot);
    if (pirate.hitsLeft <= 0) {
      this.beat(pirate, shot);
      return;
    }
    this.fireDoes(pirate, shot);
    // A smoke ship hides in its own smoke and slips away, twice.
    if (pirate.kind === 'smoky' && pirate.hitsLeft <= pirate.smokeAt) {
      pirate.smokeAt -= pirate.maxHits * SMOKE.every;
      pirate.smoke = SMOKE.seconds;
      pirate.burstLeft = 0;
      this.sendAway(pirate);
      this.emit('smoke', { pirate });
      return;
    }
    // Being fired at, it runs for it now and then, and has to be chased.
    if (pirate.hitsLeft <= pirate.runAt) {
      pirate.runAt -= pirate.maxHits * this.plan.runEvery;
      this.sendAway(pirate);
    }
  }

  /** The king's ship has a sail for each quarter of its hits, and they come down one at a time. */
  knockSails(pirate, shot) {
    const parts = SHIP_KINDS[pirate.kind].parts;
    if (!parts) return;
    const left = Math.max(0, Math.ceil((pirate.hitsLeft / pirate.maxHits) * parts - 1e-9));
    while (pirate.partsLeft > left) {
      pirate.partsLeft -= 1;
      this.emit('sail-down', { pirate, partsLeft: pirate.partsLeft, x: shot.x, z: shot.z });
    }
  }

  /** What a power-up's ball does, besides the hit. */
  fireDoes(pirate, shot) {
    if (shot.fire === 'bubble') {
      if (pirate.bubbled <= 0) this.emit('bubbled', { pirate });
      pirate.bubbled = BUBBLE.seconds;
    } else if (shot.fire === 'snow') {
      if (pirate.frosted <= 0) this.emit('frosted', { pirate });
      pirate.frosted = FROST.seconds;
    } else if (shot.fire === 'bounce' && !shot.bounced) {
      // The big ball bounces on to the next ship near enough, once.
      let next = null;
      let least = BOUNCE.reach;
      for (const other of this.targets) {
        const away = Math.hypot(other.x - pirate.x, other.z - pirate.z);
        if (other !== pirate && away < least) {
          least = away;
          next = other;
        }
      }
      if (next) {
        const bounce = this.launch({ x: shot.x, y: shot.y, z: shot.z }, next, { fire: 'bounce', bounced: true, along: 0 });
        this.emit('bounce', { from: pirate, to: next, shot: bounce });
      }
    }
  }

  /** Its sails come down and it slowly sinks, and its crew has already got away in the lifeboat. shot is the one that did it. */
  beat(pirate, shot = {}) {
    pirate.state = 'sinking';
    pirate.mode = 'sinking';
    pirate.burstLeft = 0;
    pirate.bubbled = 0;
    pirate.smoke = 0;
    if (pirate.little) {
      // One half of a raft, which nobody was on, and which comes apart and goes down.
      this.stats.littles += 1;
      this.dropPrizes(pirate);
      this.emit('little-beaten', { pirate, left: this.left });
      if (this.left === 0) this.allBeaten();
      return;
    }
    this.stats.beaten += 1;
    // A raft has nobody on it, and comes apart into two little ones.
    const boat = pirate.kind === 'raft' ? null : this.launchBoat(pirate);
    if (pirate.kind === 'raft') this.split(pirate);
    this.dropGold(pirate);
    this.dropPrizes(pirate);
    this.emit('beaten', { pirate, boat, beaten: this.stats.beaten, left: this.left, theirs: Boolean(shot.theirs) });
    if (this.left === 0) this.allBeaten();
    else this.spawnIn = PIRATE.nextIn;
  }

  /** Every pirate ship is beaten: the battle is won, once the last one has had a moment to start going down. */
  allBeaten() {
    if (this.wonIn === null) this.wonIn = WON_AFTER;
  }

  /** A raft coming apart: two little rafts go off either way, to be chased. */
  split(raft) {
    const across = rightOf(raft.heading);
    const littles = [-1, 1].map((side) => {
      const little = this.makePirate('little', raft.x + across.x * side * 14, raft.z + across.z * side * 14, raft.index);
      little.heading = raft.heading + side * 0.9;
      little.speed = raft.speed;
      little.fireIn = Infinity;
      keepOnTheWater(little, 1);
      this.sendAway(little, 2.5);
      this.pirates.push(little);
      return little;
    });
    this.emit('split', { pirate: raft, littles });
  }

  /** Off to the side of its ship, so that it's easy to see, and away from the child's. */
  launchBoat(pirate) {
    const away = headingTo(pirate.x - this.x, pirate.z - this.z);
    const mine = forwardOf(this.heading);
    const oneWay = forwardOf(away + ROW.aside);
    const otherWay = forwardOf(away - ROW.aside);
    const inFront = (way) => way.x * mine.x + way.z * mine.z;
    const heading = away + (inFront(oneWay) > inFront(otherWay) ? ROW.aside : -ROW.aside);
    const forward = forwardOf(heading);
    const boat = {
      index: pirate.index,
      x: pirate.x + forward.x * ROW.startOut,
      z: pirate.z + forward.z * ROW.startOut,
      heading,
      speed: ROW.speed,
      left: ROW.seconds,
      coast: 0,
      atLimit: 0,
    };
    keepOnTheWater(boat, 1);
    this.boats.push(boat);
    return boat;
  }

  /** The gold it stole, floating in a line, which is a reason to steer that way. */
  dropGold(pirate) {
    const chart = getChart();
    const way = forwardOf(headingTo(this.x - pirate.x, this.z - pirate.z));
    for (let i = 0; i < GOLD.coins; i += 1) {
      const out = GOLD.from + i * GOLD.apart;
      const x = pirate.x + way.x * out;
      const z = pirate.z + way.z * out;
      if (chart.room(x, z) >= GOLD.least) this.coins.push({ x, z, left: GOLD.seconds, phase: i * 0.9 });
    }
  }

  /** Sailing near it picks it up. Missing it costs nothing, and it's gone after a while. */
  moveCoins(dt) {
    for (const coin of this.coins) {
      coin.left -= dt;
      if (this.distanceFromHull(coin.x, coin.z) <= GOLD.reach) {
        coin.left = 0;
        this.stats.gold += 1;
        this.emit('gold', { x: coin.x, z: coin.z, gold: this.stats.gold });
      }
    }
    this.coins = this.coins.filter(({ left }) => left > 0);
  }

  /* ---------- prizes and power-ups, from level 2 ---------- */

  /** Something floating on the water to pick up. Out of the way of the land, and never on it. */
  addPrize(kind, x, z, details = {}) {
    const chart = getChart();
    if (chart.room(x, z) < PRIZE.least) {
      const out = chart.away(x, z);
      const push = PRIZE.least - chart.room(x, z) + 4;
      x += out.x * push;
      z += out.z * push;
    }
    const prize = { kind, x, z, left: kind === 'chest' ? Infinity : PRIZE.seconds, phase: this.random() * 6, ...details };
    this.prizes.push(prize);
    this.emit('drop', { prize });
    return prize;
  }

  /** Somewhere between where a ship went down and the child's ship, a little to one side or the other. */
  nearWreck(pirate, out = PRIZE.from) {
    const way = forwardOf(headingTo(this.x - pirate.x, this.z - pirate.z));
    const aside = (this.random() - 0.5) * PRIZE.spread;
    return { x: pirate.x + way.x * out - way.z * aside, z: pirate.z + way.z * out + way.x * aside };
  }

  /**
   * On the higher levels, what a beaten ship leaves besides its gold: gems, a sailor it was towing, the
   * key it carried, and a power-up or a heart, one each in turn. A little raft leaves one gem.
   */
  dropPrizes(pirate) {
    if (!this.plan.gems) return;
    const gems = pirate.little ? 1 : PRIZE.gems;
    for (let i = 0; i < gems; i += 1) {
      const { x, z } = this.nearWreck(pirate, PRIZE.from + i * 8);
      this.addPrize('gem', x, z, { colour: Math.floor(this.random() * 3) });
    }
    if (pirate.little) return;
    if (pirate.cage) {
      const back = forwardOf(pirate.heading);
      this.addPrize('cage', pirate.x - back.x * TOW, pirate.z - back.z * TOW, { index: pirate.index });
    }
    if (pirate.key) {
      const { x, z } = this.nearWreck(pirate, PRIZE.from + 12);
      this.addPrize('key', x, z);
    }
    const bonus = this.bonuses[this.nextBonus % Math.max(1, this.bonuses.length)];
    if (bonus) {
      this.nextBonus += 1;
      const { x, z } = this.nearWreck(pirate, PRIZE.from + 20);
      this.addPrize(bonus.kind, x, z, bonus.power ? { power: bonus.power } : {});
    }
  }

  /** Whether a prize floats over to the ship by itself: from near enough, or from far with the magnet. */
  comesOver(prize, gap = this.distanceFromHull(prize.x, prize.z)) {
    const magnet = this.power?.kind === 'magnet';
    // A treasure chest has to be sailed to, unless the magnet's on.
    return gap < (magnet ? PRIZE.magnetPull : PRIZE.pull) && (prize.kind !== 'chest' || magnet);
  }

  /** Prizes float over to the ship, and the hull coming near picks them up. The magnet brings them from far. */
  movePrizes(dt) {
    const magnet = this.power?.kind === 'magnet';
    const drift = Math.max(magnet ? PRIZE.magnetDrift : PRIZE.drift, this.speed * 1.2);
    for (const prize of this.prizes) {
      // Nothing goes while the child rests. Once the battle's over and counted, what's left shrinks away.
      if (!this.resting || this.state !== 'sailing' || prize.fading) prize.left -= dt;
      if (prize.fading) continue;
      const gap = this.distanceFromHull(prize.x, prize.z);
      if (gap <= PRIZE.reach) {
        prize.left = 0;
        prize.taken = true;
        this.collect(prize);
        continue;
      }
      if (this.comesOver(prize, gap)) {
        const dx = this.x - prize.x;
        const dz = this.z - prize.z;
        const away = Math.hypot(dx, dz) || 1;
        const step = Math.min(away, drift * dt);
        prize.x += (dx / away) * step;
        prize.z += (dz / away) * step;
      }
    }
    // The magnet brings the gold over too.
    if (magnet) {
      for (const coin of this.coins) {
        const dx = this.x - coin.x;
        const dz = this.z - coin.z;
        const away = Math.hypot(dx, dz) || 1;
        if (away > PRIZE.magnetPull) continue;
        const step = Math.min(away, drift * dt);
        coin.x += (dx / away) * step;
        coin.z += (dz / away) * step;
      }
    }
    this.prizes = this.prizes.filter(({ left }) => left > 0);
  }

  /** What a prize adds to what's been picked up. */
  count(prize) {
    const { stats } = this;
    if (prize.kind === 'gem') stats.gems += 1;
    if (prize.kind === 'heart') stats.hearts += 1;
    if (prize.kind === 'cage') stats.sailors += 1;
    if (prize.kind === 'key') stats.keys += 1;
    if (prize.kind === 'chest') stats.chests += 1;
    if (prize.kind === 'power') stats.powers += 1;
  }

  collect(prize) {
    this.count(prize);
    // Once the battle's over, what's picked up only counts: nothing new starts, there's no chest to sail
    // to, and once the last heart has gone, no heart comes back.
    if (this.state === 'sailing') {
      if (prize.kind === 'heart') this.hearts = Math.min(MOST_HEARTS, this.hearts + 1);
      if (prize.kind === 'key') this.showChest();
      if (prize.kind === 'power') this.startPower(prize.power);
    }
    if (prize.kind === 'chest') this.openChest(prize);
    this.emit('prize', { prize, hearts: this.hearts });
  }

  /**
   * When the finish card comes up, whatever's still on its way to the ship counts, as it does in the
   * other games, and everything else on the water shrinks away. A chest coming over counts with its gems.
   */
  collectAll() {
    for (const prize of this.prizes) {
      if (prize.fading) continue;
      if (this.comesOver(prize)) {
        this.count(prize);
        if (prize.kind === 'chest') this.stats.gems += PRIZE.chestGems;
      }
      prize.fading = true;
      prize.left = Math.min(prize.left, PRIZE.fade);
    }
  }

  /** The key brings up a treasure chest out in front, a little to one side, to sail to. */
  showChest() {
    const chart = getChart();
    // In open water, and well inside the edge of the world, where the ship can sail to it.
    const fits = (x, z) => chart.room(x, z) >= 30 && Math.hypot(x, z) < EDGE.turnBackFrom - 20;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const turn = attempt < 8 ? 0.35 + this.random() * 0.4 : attempt < 16 ? (0.35 + this.random() * 0.4) * 3 : this.random() * Math.PI;
      const direction = this.heading + turn * (this.random() < 0.5 ? -1 : 1);
      const away = between(this.random, PRIZE.chestAway);
      const x = this.x + Math.sin(direction) * away;
      const z = this.z - Math.cos(direction) * away;
      if (fits(x, z)) return this.addPrize('chest', x, z);
    }
    // Towards the middle of the world, if nothing else would do.
    const inward = forwardOf(headingTo(-this.x, -this.z));
    return this.addPrize('chest', this.x + inward.x * PRIZE.chestAway[0], this.z + inward.z * PRIZE.chestAway[0]);
  }

  /** Gems spill out, and a power-up, all coming straight over. */
  openChest(chest) {
    for (let i = 0; i < PRIZE.chestGems; i += 1) {
      const angle = (i / PRIZE.chestGems) * Math.PI * 2;
      this.addPrize('gem', chest.x + Math.cos(angle) * 22, chest.z + Math.sin(angle) * 22, { colour: i % 3 });
    }
    const powers = this.bonuses.filter(({ kind }) => kind === 'power');
    if (powers.length) this.addPrize('power', chest.x, chest.z + 18, { power: powers[Math.floor(this.random() * powers.length)].power });
  }

  /** A power-up lasts a few seconds. A new one takes over from the one before. It waits while the child rests. */
  startPower(kind) {
    const { seconds } = POWERS[kind];
    this.power = { kind, left: seconds, total: seconds };
    this.emit('power', { kind });
  }

  updatePower(dt) {
    if (!this.power || this.resting) return;
    this.power.left -= dt;
    if (this.power.left > 0) return;
    const { kind } = this.power;
    this.power = null;
    this.emit('power-end', { kind });
  }

  moveBoats(dt) {
    for (const boat of this.boats) {
      boat.left -= dt;
      const wanted = headingTo(boat.x - this.x, boat.z - this.z);
      boat.heading += clamp(turnBetween(wanted, boat.heading), -0.12 * dt, 0.12 * dt);
      steerRound(boat, dt);
      const forward = forwardOf(boat.heading);
      boat.x += forward.x * boat.speed * dt;
      boat.z += forward.z * boat.speed * dt;
      keepOnTheWater(boat, dt);
      if (boat.left <= 0) this.stats.crewsAway += 1;
    }
    this.boats = this.boats.filter(({ left }) => left > 0);
  }

  /* ---------- their cannonballs ---------- */

  moveBalls(dt) {
    for (const ball of this.balls) {
      ball.t = Math.min(1, ball.t + dt / ball.seconds);
      // A friend's goes to wherever the child's ship has got to, as their game's balls go to where it is there,
      // or to the pirate they're firing at, with them on the child's side.
      if (ball.homing) Object.assign(ball.to, ball.at ? { x: ball.at.x, z: ball.at.z } : this.sideFacing(ball.from.x, ball.from.z));
      const { from, to, t } = ball;
      ball.x = from.x + (to.x - from.x) * t;
      ball.z = from.z + (to.z - from.z) * t;
      ball.y = from.y + ((ball.lands ?? 0) - from.y) * t + 4 * ball.arc * t * (1 - t);
      if (t >= 1) this.landBall(ball);
    }
    this.balls = this.balls.filter(({ t }) => t < 1);
    // A hit the friend's game has said it made, with none of their balls still on the way, shows now.
    if (this.strikesDue > 0 && this.state === 'sailing' && this.friend && !this.balls.some(({ homing }) => homing)) this.strike(this.sideFacing(this.friend.x, this.friend.z));
  }

  /** How far a place on the water is from the child's hull, which is long and thin. */
  distanceFromHull(x, z) {
    const forward = forwardOf(this.heading);
    const dx = x - this.x;
    const dz = z - this.z;
    const along = clamp(dx * forward.x + dz * forward.z, -HULL.half, HULL.half);
    return Math.hypot(dx - forward.x * along, dz - forward.z * along);
  }

  landBall(ball) {
    // One of a friend's, which only their game decides: a hit it has said it made shows as this one lands.
    if (ball.homing) {
      // One at a pirate only shows where they're firing: the hit itself shows as the game that runs the pirate counts it.
      if (!ball.at && this.strikesDue > 0 && this.state === 'sailing') this.strike(ball.to);
      return;
    }
    const onHull = !ball.harmless && !this.resting && this.state === 'sailing' && this.distanceFromHull(ball.to.x, ball.to.z) <= HULL.beam + BALL.hitWiden;
    if (onHull && this.power?.kind === 'shield') {
      // The shield bubble: it bounces off, and nothing's lost.
      this.stats.blocked += 1;
      this.emit('blocked', { x: ball.to.x, z: ball.to.z });
      this.emit('splash', { x: ball.to.x, z: ball.to.z, size: 0.6 });
    } else if (onHull) this.hurt(ball);
    else this.emit('splash', { x: ball.to.x, z: ball.to.z, size: 1 });
  }

  hurt(ball) {
    this.stats.hurts += 1;
    this.hearts -= 1;
    this.sinceHurt = 0;
    this.hurtLeft = 0.9;
    this.emit('hurt', { hearts: this.hearts, x: ball.to.x, z: ball.to.z });
    if (this.hearts > 0) return;
    if (this.level.canLose) this.lose();
    else this.hearts = 1;
  }

  lose() {
    this.state = 'lost';
    this.quietCannons();
    this.emit('lost', { beaten: this.stats.beaten });
  }

  quietCannons() {
    for (const side of ['left', 'right']) {
      const zone = this.zones[side];
      zone.target = null;
      zone.inside = false;
      if (zone.firing) {
        zone.firing = false;
        this.emit('firing', { side, on: false });
      }
    }
  }

  /* ---------- the child's ship ---------- */

  /** The wheel and the sails follow the hand at once, even before the battle has begun. */
  readHand(dt, steer, drive, open) {
    const wantedWheel = Number.isFinite(steer) ? clamp(steer, -1, 1) : 0;
    this.wheel = damp(this.wheel, wantedWheel, SAIL.wheelEase, dt);
    const width = Number.isFinite(drive) ? clamp((drive - SAIL.driveFrom) / (1 - SAIL.driveFrom), 0, 1) : 0;
    const wanted = open ? SAIL.lowest + (1 - SAIL.lowest) * width : 0;
    this.sails = damp(this.sails, wanted, wanted > this.sails ? SAIL.raise : SAIL.lower, dt);
  }

  /** Helps to keep the nearest pirate alongside, in the middle of a firing zone. */
  helpAlongside(dt) {
    const { reach } = this.level.zone;
    let nearest = null;
    let least = reach * ASSIST.from;
    for (const pirate of this.targets) {
      const away = Math.hypot(pirate.x - this.x, pirate.z - this.z);
      if (away < least) {
        least = away;
        nearest = pirate;
      }
    }
    if (!nearest) return;
    const off = turnBetween(headingTo(nearest.x - this.x, nearest.z - this.z), this.heading);
    const wanted = off - (off >= 0 ? 1 : -1) * ASSIST.middle;
    const help = clamp(wanted, -ASSIST.most, ASSIST.most) * ASSIST.turn * this.level.assist;
    // A child steering hard the other way gets their way.
    const against = this.wheel * help < 0 ? 1 - ASSIST.against * Math.abs(this.wheel) : 1;
    this.heading += help * against * dt;
  }

  /** Nobody ever bumps: with a pirate right in front, it goes past, which brings it alongside. */
  giveWay(dt) {
    let nearest = null;
    let least = GIVE_WAY.within;
    for (const pirate of this.pirates) {
      if (pirate.state === 'gone') continue;
      const away = Math.hypot(pirate.x - this.x, pirate.z - this.z);
      if (away < least) {
        least = away;
        nearest = pirate;
      }
    }
    if (!nearest) return;
    const off = turnBetween(headingTo(nearest.x - this.x, nearest.z - this.z), this.heading);
    if (Math.abs(off) < GIVE_WAY.cone) this.heading -= (off >= 0 ? 1 : -1) * GIVE_WAY.turn * (1 - least / GIVE_WAY.within) * dt;
  }

  sail(dt) {
    const before = this.heading;
    const wanted = this.pace.speed * Math.max(SAIL.drift, this.sails);
    this.speed = damp(this.speed, wanted, wanted > this.speed ? SAIL.speedUp : SAIL.slowDown, dt);
    const way = this.speed / this.pace.speed;
    this.heading += this.wheel * SAIL.turn * (SAIL.turnDrifting + (1 - SAIL.turnDrifting) * Math.min(1, way)) * dt;
    if (this.canFire && !this.resting) this.helpAlongside(dt);
    this.giveWay(dt);
    steerRound(this, dt);
    const forward = forwardOf(this.heading);
    this.x += forward.x * this.speed * dt;
    this.z += forward.z * this.speed * dt;
    keepOnTheWater(this, dt);
    if (dt > 0) this.turning = damp(this.turning, clamp(turnBetween(this.heading, before) / (SAIL.turn * dt), -1, 1), 3, dt);
    if (this.atLimit > 0.2 && this.time - this.saidLimitAt > EDGE.sayEvery) {
      this.saidLimitAt = this.time;
      this.emit('limit');
    }
  }

  /** Resting is never punished: whatever's in the air lands harmlessly, and they all stop firing. */
  watchForRest(dt, open) {
    this.notOpenFor = open ? 0 : this.notOpenFor + dt;
    const resting = this.notOpenFor > REST_AFTER;
    if (resting === this.resting) return;
    this.resting = resting;
    if (resting) {
      for (const ball of this.balls) ball.harmless = true;
      for (const pirate of this.pirates) {
        pirate.burstLeft = 0;
        // Nothing stays hidden while the child rests, so it's all there when they come back.
        if (pirate.under) {
          pirate.under = false;
          pirate.diveIn = SUB.up;
          this.emit('surface', { pirate });
        }
      }
    } else {
      for (const pirate of this.afloat) pirate.fireIn = Math.max(pirate.fireIn, PIRATE.afterRest);
      this.broadsideIn = Math.max(this.broadsideIn, PIRATE.afterRest);
    }
    this.emit('resting', { on: resting });
  }

  /**
   * One frame. steer and drive are from the hand, as in snapshot.steer and snapshot.drive. open says the
   * hand counts as open, and seen that it's in view and can be read. Anything else fails closed.
   */
  update(dt, { steer = 0, drive = 0, open = false, seen = false } = {}) {
    this.time += dt;
    if (this.state === 'won' || this.state === 'lost') {
      this.afterTheEnd(dt);
      return;
    }
    this.open = open === true;
    this.canFire = this.open || (this.cannons === 'always' && seen === true);
    this.readHand(dt, steer, drive, this.open);
    if (this.state === 'ready') return;

    this.watchForRest(dt, this.open);
    this.stats.seconds += dt;
    if (this.open) {
      this.stats.openSeconds += dt;
      if (!this.wasOpen) this.stats.openings += 1;
    }
    this.wasOpen = this.open;
    this.hurtLeft = Math.max(0, this.hurtLeft - dt);
    this.sinceHurt += dt;
    if (this.hearts < HEARTS && this.sinceHurt >= this.level.healAfter * this.challenge.healAfter) {
      this.hearts += 1;
      this.sinceHurt = 0;
      this.emit('healed', { hearts: this.hearts });
    }

    this.sail(dt);
    if (this.spawnIn > 0) {
      this.spawnIn -= dt;
      if (this.spawnIn <= 0) this.fill();
    }
    this.broadsideIn = Math.max(0, this.broadsideIn - dt);
    if (this.friend) this.friend.broadsideIn = Math.max(0, this.friend.broadsideIn - dt);
    for (const pirate of this.pirates) this.movePirate(pirate, dt);
    this.pirates = this.pirates.filter(({ state }) => state !== 'gone');
    this.keepApart();
    keepOnTheWater(this, dt);
    for (const pirate of this.afloat) keepOnTheWater(pirate, dt);

    this.aimCannons(dt);
    this.moveShots(dt);
    this.moveBalls(dt);
    this.moveBoats(dt);
    this.moveCoins(dt);
    this.movePrizes(dt);
    this.updatePower(dt);
    if (this.state !== 'sailing') return;

    if (this.wonIn !== null) {
      this.wonIn -= dt;
      if (this.wonIn <= 0) {
        this.state = 'won';
        this.quietCannons();
        this.emit('won', { beaten: this.stats.beaten });
      }
    }
  }

  /**
   * It's all over: what's left carries on quietly and harms nobody, and a winner takes a lap of honour.
   * Prizes still floating over carry on coming, and are picked up as they reach the ship.
   */
  afterTheEnd(dt) {
    const won = this.state === 'won';
    this.open = false;
    this.canFire = false;
    this.readHand(dt, won ? AFTER_WIN_WHEEL : 0, won ? 1 : 0, won);
    this.resting = true;
    for (const ball of this.balls) ball.harmless = true;
    this.sail(dt);
    for (const pirate of this.pirates) this.movePirate(pirate, dt);
    this.pirates = this.pirates.filter(({ state }) => state !== 'gone');
    this.keepApart();
    keepOnTheWater(this, dt);
    this.moveShots(dt);
    this.moveBalls(dt);
    this.moveBoats(dt);
    this.movePrizes(dt);
  }
}
