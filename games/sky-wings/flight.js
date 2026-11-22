// The rules of a dogfight over the island. No screen, camera or sound in this file, so it all runs in
// the unit tests.
//
// It's real flying, in all three directions. Both arms held out are the wings: tipping them banks the
// plane, which turns it, and raising or lowering both puts its nose up or down. There are limits, so
// nobody gets lost or flies into anything: a ceiling, the ground, an outer edge where the plane is
// turned back towards the island, and how steeply it can climb or how far it can bank.
//
// Sky pirates hunt the child, and the child hunts them. There's a ring in the middle of the view, and
// the guns fire by themselves at any plane inside it. Nobody gets hurt: a plane that's dropped falls
// away smoking, and its pilot comes down by parachute. A child who lowers their arms glides. On Gentle,
// after a while nobody shoots at them, however long they rest, and they can't be shot down. On Medium
// and Tough, the default, the pirates keep hunting a plane that's gliding, and five hits bring it down.
//
// Each level, from 1 to 10, is a little harder than the one before: see flightLevel.
import { ramp, stepsAt } from '../../core/levels.js';
import { WORLD, floorAt } from './island-map.js';

const degrees = (value) => (value * Math.PI) / 180;

// How fast the child's plane flies, in units a second.
export const PACES = {
  slow: { speed: 38 },
  medium: { speed: 48 },
  fast: { speed: 60 },
};

// aim is the ring's size, as the angle from its middle to its edge, enemyHits is how many hits it
// takes to drop a plane, and hitChance how many of their shots find the child. assist is how much the
// plane helps with lining up. canLose says whether running out of hearts ends the flight, and restSafe
// whether a child resting with arms down is left alone by the pirates. Gentle is the game as it was
// before it could be lost; Medium is the default.
export const LEVELS = {
  gentle: { aim: degrees(11), enemyHits: 14, hitChance: 0.2, huntEvery: [8, 12], burst: 3, healAfter: 5, assist: 1, canLose: false, restSafe: true },
  medium: { aim: degrees(9), enemyHits: 18, hitChance: 0.25, huntEvery: [6, 9], burst: 3, healAfter: 7, assist: 0.6, canLose: true, restSafe: false },
  tough: { aim: degrees(7.5), enemyHits: 24, hitChance: 0.35, huntEvery: [4.5, 7], burst: 4, healAfter: 10, assist: 0.3, canLose: true, restSafe: false },
};

export const HEARTS = 5;
// Where each ramp ends at level 10: on Medium and Tough, and on Gentle, which ramps as it always did.
const HARD_TOP = { enemySpeed: 0.94, enemyTurn: 1.2, huntEvery: 0.5, dodgeSeconds: 3.2, sharpness: 1.6 };
const GENTLE_TOP = { enemySpeed: 0.88, enemyTurn: 0.95, huntEvery: 0.8, dodgeSeconds: 2.4, sharpness: 1 };
export const MOST_AT_ONCE = 3; // At level 1. See flightLevel.
const CAPTAIN_HITS = 1.4; // The pirate captain takes this many times the hits of the others.
const WEAVE_RATE = 1.3; // How quickly a weaving pirate swings from side to side, in radians a second.

/**
 * What a level changes. Level 1 is the game as it always was. What a grown-up chose stays theirs: the
 * ring's size, the help with lining up, whether the child can be shot down, the speed and how many
 * planes there are to drop. Being hunted gives as long to turn as ever.
 *
 * On Medium and Tough the levels climb steeply, so level 10 takes real skill: the pirates are nearly as
 * fast as the child, turn half as sharply again, hunt twice as often and their shots find the plane
 * more often. On Gentle (gentle: true) they climb as gently as they always did, and shoot no better.
 *
 * Every level from 2 brings something new to see and play with, on top of the pirates getting a little
 * quicker: prizes, gift boxes with new kinds of fire in them, new kinds of pirate, and a new sky. Later
 * levels keep what came before. NEW_AT lists what arrives where, and the tests check each one is on.
 */
export function flightLevel(level = 1, { gentle = false } = {}) {
  const top = gentle ? GENTLE_TOP : HARD_TOP;
  return {
    // The pirates fly faster, as a share of the child's plane, but never as fast as it.
    enemySpeed: ramp(level, ENEMY.speed, top.enemySpeed),
    // And turn more sharply, in radians a second.
    enemyTurn: ramp(level, ENEMY.turn, top.enemyTurn),
    // One turns to hunt the child more often, as a share of the time between at level 1.
    huntEvery: ramp(level, 1, top.huntEvery),
    // A plane being shot at tries for longer to get out of the ring.
    dodgeSeconds: ramp(level, ENEMY.dodgeSeconds, top.dodgeSeconds),
    // How much more often their shots find the child, as a share of what the setting says.
    sharpness: ramp(level, 1, top.sharpness),
    // From level 3 the pirates weave from side to side as they cross, as far as this either way.
    weave: stepsAt(level, { 1: 0, 3: 0.15, 6: 0.22, 9: 0.3 }),
    // From level 5 they go higher and lower, by this much more, to be followed up and down.
    climbs: stepsAt(level, { 1: 1, 5: 1.2 }),
    // From level 9 there can be four in the air at once.
    atOnce: stepsAt(level, { 1: MOST_AT_ONCE, 9: 4 }),
    // From level 8 the last one is the pirate captain: a bigger plane with a flag, which takes more hits.
    captain: stepsAt(level, { 1: false, 8: true }),
    // From level 2 a pirate that's dropped leaves a prize, which flies to the child's plane by itself.
    prizes: level >= 2,
    // From level 3 gift boxes float in the sky, and flying through one gives a power for a few seconds.
    gifts: stepsAt(level, { 1: [], 3: ['triple'], 5: ['triple', 'bubble'], 7: ['triple', 'bubble', 'snow', 'shield'], 9: ['triple', 'bubble', 'snow', 'shield', 'helper'], 10: ['triple', 'bubble', 'snow', 'shield', 'helper', 'paper'] }),
    // New kinds of pirate, each with its own way of flying: see planPirates.
    kinds: stepsAt(level, { 1: [], 4: ['scout'], 6: ['scout', 'balloon'], 8: ['scout', 'pair', 'balloon'] }),
    // At level 10, the one before the captain is a big slow airship full of treasure.
    airship: level >= 10,
    // The sky: day, then a sunset from level 6, and light snow from level 9.
    sky: stepsAt(level, { 1: 'day', 6: 'sunset', 9: 'snow' }),
  };
}

/** The kinds of pirate a level brings that the level before didn't. */
export const freshKinds = (level) => {
  const before = level > 1 ? flightLevel(level - 1).kinds : [];
  return flightLevel(level).kinds.filter((kind) => !before.includes(kind));
};

/**
 * Which kind of pirate comes in which order. The captain is always last and the airship just before it,
 * and the rest take turns through the kinds this level has. A pair is a leader and a wingman, who come
 * together and fly side by side, and there's never half of one. fresh is the kinds new at this level:
 * with too few planes to drop for every kind, those come first, so what's new at a level always comes,
 * and the earlier kinds come as there's room.
 */
export function planPirates(total, rules, fresh = []) {
  const plan = Array(total).fill('pirate');
  if (rules.captain && total > 1) plan[total - 1] = 'captain';
  if (rules.airship && total >= 3) plan[total - 2] = 'airship';
  const groups = [];
  if (rules.kinds.includes('scout')) groups.push(['scout']);
  if (rules.kinds.includes('pair')) groups.push(['lead', 'wing']);
  if (rules.kinds.includes('balloon')) groups.push(['balloon']);
  if (groups.length) groups.push(['pirate']);
  const fill = (order) => {
    const filled = [...plan];
    let turn = 0;
    for (let i = 0; i < total && order.length; i += 1) {
      if (filled[i] !== 'pirate') continue;
      // Takes the next kind there's room for here: a pair needs two places together.
      for (let tries = 0; tries < order.length; tries += 1) {
        const group = order[turn % order.length];
        turn += 1;
        if (group.every((_, step) => plan[i + step] === 'pirate' && i + step < total)) {
          group.forEach((kind, step) => {
            filled[i + step] = kind;
          });
          i += group.length - 1;
          break;
        }
      }
    }
    return filled;
  };
  const named = (kind) => (kind === 'pair' ? 'lead' : kind);
  const regular = fill(groups);
  if (fresh.every((kind) => regular.includes(named(kind)))) return regular;
  const first = groups.filter(([kind]) => fresh.some((one) => named(one) === kind));
  return fill([...first, ...groups.filter((group) => !first.includes(group))]);
}

// Each kind of pirate: its hits as a share of the usual, how fast it crosses, whether it ever turns to
// hunt the child, whether it dodges when hit, and the prize it leaves.
export const KINDS = {
  pirate: { hits: 1, hunts: true, dodges: true, prize: 'coin' },
  lead: { hits: 1, hunts: true, dodges: true, prize: 'coin' },
  wing: { hits: 1, hunts: true, dodges: true, prize: 'coin' },
  // A little quick plane that zigzags, and needs fewer hits.
  scout: { hits: 0.6, faster: 0.07, weave: 0.42, weaveRate: 2.3, hunts: true, dodges: true, prize: 'gem' },
  // A hot-air balloon that drifts slowly, high up, and never shoots.
  balloon: { hits: 0.8, share: 0.42, weave: 0, high: [24, 52], hunts: false, dodges: false, prize: 'coin' },
  captain: { hits: CAPTAIN_HITS, hunts: true, dodges: true, prize: 'medal' },
  // A big slow airship that never shoots, and takes a lot of hits.
  airship: { hits: 2, share: 0.5, weave: 0, hunts: false, dodges: false, prize: 'chest' },
};

// The powers in a gift box, and how many seconds each lasts.
export const POWERS = {
  triple: 6, // Three shots at a time, in a fan.
  bubble: 6, // Bubbles, which wrap a pirate up so it floats gently down.
  snow: 7, // Snowflakes, which slow a pirate right down for a while.
  shield: 9, // A bubble round the child's plane, which their shots bounce off.
  helper: 10, // A friend flies alongside and helps.
  paper: 6, // Paper planes that find their own way to a pirate.
};

/**
 * What's new at each level, for the cards: thing is what it is in the rules, which the tests check is
 * really on from that level. The names are in English and Georgian.
 */
export const NEW_AT = {
  2: [{ thing: 'prize:coin', mark: '🟡', name: 'Gold coins', nameKa: 'ოქროს მონეტები' }],
  3: [
    { thing: 'weave', mark: '〰️', name: 'Weaving pirates', nameKa: 'კლაკნილი ფრენა' },
    { thing: 'gift:triple', mark: '🎁', name: 'Triple shot', nameKa: 'სამმაგი სროლა' },
  ],
  4: [
    { thing: 'kind:scout', mark: '🛩️', name: 'Scout pirates', nameKa: 'მზვერავი მეკობრეები' },
    { thing: 'prize:gem', mark: '💎', name: 'Gems', nameKa: 'ძვირფასი ქვები' },
  ],
  5: [
    { thing: 'climbs', mark: '⛰️', name: 'Higher and lower', nameKa: 'მაღლა და დაბლა' },
    { thing: 'gift:bubble', mark: '🫧', name: 'Bubble shot', nameKa: 'ბუშტების სროლა' },
  ],
  6: [
    { thing: 'kind:balloon', mark: '🎈', name: 'Balloon pirates', nameKa: 'ბუშტიანი მეკობრეები' },
    { thing: 'sky:sunset', mark: '🌅', name: 'Sunset', nameKa: 'მზის ჩასვლა' },
  ],
  7: [
    { thing: 'gift:snow', mark: '❄️', name: 'Snowflake shot', nameKa: 'ფიფქების სროლა' },
    { thing: 'gift:shield', mark: '🛡️', name: 'Shield bubble', nameKa: 'დამცავი ბუშტი' },
  ],
  8: [
    { thing: 'kind:captain', mark: '👑', name: 'Pirate captain', nameKa: 'მეკობრე კაპიტანი' },
    { thing: 'kind:pair', mark: '👥', name: 'Pirate pairs', nameKa: 'მეკობრეთა წყვილები' },
  ],
  9: [
    { thing: 'atOnce:4', mark: '4️⃣', name: 'Four at once', nameKa: 'ოთხი ერთად' },
    { thing: 'gift:helper', mark: '🦒', name: 'A friend helps', nameKa: 'მეგობარი გეხმარება' },
    { thing: 'sky:snow', mark: '🌨️', name: 'Light snow', nameKa: 'მსუბუქი თოვლი' },
  ],
  10: [
    { thing: 'kind:airship', mark: '💰', name: 'Treasure airship', nameKa: 'განძის საჰაერო ხომალდი' },
    { thing: 'gift:paper', mark: '📄', name: 'Paper planes', nameKa: 'ქაღალდის თვითმფრინავები' },
  ],
};

/**
 * Whether one of the things in NEW_AT is on at a level, with this many planes to drop: with only three,
 * there are never four in the air at once, and not every kind of pirate has room.
 */
export function isOn(thing, level, planes = 9) {
  const rules = flightLevel(level);
  const [what, which] = thing.split(':');
  const kinds = planPirates(planes, rules, freshKinds(level));
  switch (what) {
    case 'prize':
      return rules.prizes && Object.entries(KINDS).some(([kind, { prize }]) => prize === which && kinds.includes(kind));
    case 'gift':
      return rules.gifts.includes(which);
    case 'kind':
      return kinds.includes(which === 'pair' ? 'lead' : which);
    case 'sky':
      return rules.sky === which;
    case 'atOnce':
      return rules.atOnce === Number(which) && planes >= Number(which);
    case 'weave':
      return rules.weave > 0;
    case 'climbs':
      return rules.climbs > 1;
    default:
      return false;
  }
}

// The camera, from the plane: behind and above, looking the way the plane points. The ring is in the
// middle of its view, so what's in the ring on the screen is what the guns fire at.
export const CAMERA = { back: 15, up: 4.4 };
export const RANGE = 240;

const FLY = {
  turn: 1.05, // Radians a second, at a full bank.
  roll: degrees(58),
  pitch: degrees(48), // The steepest it can climb or dive.
  rollEase: 5,
  pitchEase: 2.6,
  deadZone: 0.1, // A little wobble in the arms doesn't steer.
  glide: 0.62, // How fast it goes with arms lowered, as a share of its speed.
  climbCost: 0.22, // How much slower it goes straight up, and how much faster straight down.
  restTurn: 0.14, // The gentle turn of a plane left to itself.
  restShare: 0.75, // How fast it goes then.
};
const LIMITS = { aheadLook: [1.2, 2.6], floorRoom: 60, ceilingRoom: 45, pullUp: degrees(42), pushDown: degrees(24), turnBack: 1.6 };
const ASSIST = { cone: 2.6, turn: 0.75, pitch: degrees(18), autoHeight: degrees(30) };
const REST_AFTER = 4; // Seconds of arms down before nobody shoots any more.

const SHOT = { every: 0.11, speed: 640, reach: 10, life: 1.2 };
const ENEMY = {
  turn: 0.82,
  pitch: degrees(32),
  speed: 0.84, // As a share of the child's plane.
  catchUp: 1.3, // When it's a long way behind.
  huntSpeed: 1.04,
  aim: degrees(16),
  shotSpeed: 360,
  shotEvery: 0.16,
  miss: 13,
  reached: 45,
  ahead: [95, 180],
  across: [35, 105],
  upDown: [-30, 42],
  spawnAway: [260, 340],
  spawnAngle: [0.5, 1.25], // To one side or the other, rather than straight into the ring.
  dodgeAhead: [50, 120],
  dodgeAcross: [120, 190],
  dodgeSpeed: 1.14,
  dodgeSeconds: 2.2,
  huntSeconds: 8,
  passed: 42,
  restAfterBurst: 1.5,
  fallSeconds: 5.5,
  nextIn: 1,
};
// What a dropped pirate leaves: it waits a moment, then flies to the child's plane, quicker and quicker.
const PRIZE = { wait: 0.5, speed: 30, speedUp: 80, most: 260, reach: 9 };
// Gift boxes: when the first comes, how often more come, where they float, and how close is close enough.
// Near one, it comes to the plane, so it doesn't take careful flying to get.
const GIFT = { firstIn: 5, every: [14, 18], ahead: 220, across: [-24, 24], up: [-8, 8], drift: 16, pull: 140, pullSpeed: 45, reach: 20, life: 16 };
const TRIPLE_FAN = 8; // How far apart the three shots start.
const BUBBLE = { every: 0.4, speed: 300, life: 2, bigHits: 4 }; // A captain or airship is too big to wrap up.
const SLOW = { seconds: 4, share: 0.55, turn: 0.6 }; // A pirate hit by a snowflake.
const PAPER = { every: 0.6, speed: 110, life: 6, hits: 3, cone: degrees(80), reach: 320 };
// On the left, a little ahead and above, so it's in view and not behind the coach's card on the right.
const HELPER = { every: 0.22, cone: degrees(30), side: -11, back: -4, up: 3 };
// Where a wingman flies, from its leader. Further than join from that spot, it flies there like any
// pirate, and nearer, it eases into it no faster than ease, as a share of the child's speed.
const PAIR = { side: 22, back: 8, join: 30, ease: 0.25 };
const DRIFT_ASIDE = 18; // How fast something going down gently moves out of the child's way.
const BEHIND_EVERY = 14; // Seconds at the least between being told a plane is behind.
const WON_AFTER = 0.9;
// Against friends, a dogfight in the same sky, with no pirates: so many hits put a friend's plane out of the fight
// for a few seconds, trailing smoke, when it can't shoot or be shot. Nobody falls and nobody is hurt. Whoever puts
// the others out as many times as the host's number of planes first wins. See main.js for what goes between games.
export const DOGFIGHT = { hits: 6, outSeconds: 4 };
export const MOST_AT_ONCE_EVER = flightLevel(10).atOnce; // For the marks on the screen.

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const between = (random, [low, high]) => low + random() * (high - low);
const damp = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));
/** The shortest way round from one direction to another. */
const turnBetween = (to, from) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/** Which way a plane is pointing. Heading 0 is north, along -z, and a turn to the right adds to it. */
export function forwardOf(heading, pitch) {
  const flat = Math.cos(pitch);
  return { x: Math.sin(heading) * flat, y: Math.sin(pitch), z: -Math.cos(heading) * flat };
}

const headingTo = (dx, dz) => Math.atan2(dx, -dz);

/** Keeps a plane inside the limits, wherever it's been pushed. */
function keepInside(plane) {
  const away = Math.hypot(plane.x, plane.z);
  if (away > WORLD.limit) {
    plane.x *= WORLD.limit / away;
    plane.z *= WORLD.limit / away;
  }
  plane.y = clamp(plane.y, floorAt(plane.x, plane.z), WORLD.ceiling);
}

export class Flight {
  /**
   * planes is how many there are to drop, pace and level are from PACES and LEVELS, and climbing says
   * whether the child's arms control how high they go. If not, the plane does that by itself.
   * levelNumber is the level, from 1 to 10: see flightLevel.
   */
  constructor({ planes = 6, pace = 'slow', level = 'gentle', levelNumber = 1, climbing = true, dogfight = false, random = Math.random, onEvent = () => {} } = {}) {
    this.pace = PACES[pace];
    this.level = LEVELS[level];
    this.levelNumber = levelNumber;
    this.levelRules = flightLevel(levelNumber, { gentle: !this.level.canLose });
    this.atOnce = this.levelRules.atOnce;
    this.plan = planPirates(planes, this.levelRules, freshKinds(levelNumber));
    this.enemyHits = this.level.enemyHits;
    this.climbing = climbing;
    this.random = random;
    this.onEvent = onEvent;
    this.total = planes;

    this.state = 'ready'; // ready, flying, won, lost
    this.time = 0;
    this.x = 0;
    this.y = 95;
    this.z = 770;
    this.heading = 0;
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.hearts = HEARTS;
    this.sinceHurt = 0;
    this.hurtLeft = 0;
    this.downFor = 0;
    this.resting = false;
    this.atLimit = 0;

    // Against friends: no pirates, and the friends' planes are what's shot at. See DOGFIGHT.
    this.dogfight = Boolean(dogfight);
    this.outLeft = 0; // How much longer this child's own plane is out of a dogfight.

    this.enemies = [];
    this.waiting = this.dogfight ? 0 : planes; // Still to come.
    this.spawnIn = 0;
    this.nextPilot = 0;
    this.shots = [];
    this.shotIn = 0;
    this.locked = null;
    this.firing = false;
    this.huntIn = 4 + between(random, this.huntEvery);
    this.hunted = null;
    this.saidBehindAt = -Infinity;
    this.wonIn = null;

    // Prizes on their way to the child's plane, the gift box in the sky, and the power it gave.
    this.prizes = [];
    this.gift = null;
    this.giftIn = this.dogfight ? Infinity : GIFT.firstIn;
    const { gifts } = this.levelRules;
    const before = levelNumber > 1 ? flightLevel(levelNumber - 1).gifts : [];
    // The first gift box is this level's new power, and then they take turns.
    this.giftTurn = Math.max(0, gifts.findIndex((kind) => !before.includes(kind)));
    this.power = null;
    this.helper = null;
    this.paperIn = 0;
    // Friends flying on their own computers, whose planes are here where they really are: see mateFires.
    // Each is { x, y, z, heading, pitch, roll, live }, kept up to date by main.js.
    this.mates = [];

    this.stats = {
      dropped: 0,
      shots: 0,
      hits: 0,
      hurts: 0,
      seconds: 0,
      wingsSeconds: 0,
      prizes: { coin: 0, gem: 0, chest: 0, medal: 0 },
      gifts: 0,
      blocked: 0,
    };
  }

  emit(type, details = {}) {
    this.onEvent({ type, ...details });
  }

  begin() {
    this.state = 'flying';
    this.speed = this.pace.speed;
    this.fill();
  }

  /** Seconds between hunts, as this level plays them. */
  get huntEvery() {
    return this.level.huntEvery.map((seconds) => seconds * this.levelRules.huntEvery);
  }

  /** Resting that the pirates respect: on Gentle only. On the harder settings they keep hunting. */
  get safeResting() {
    return this.resting && this.level.restSafe;
  }

  get dropped() {
    return this.stats.dropped;
  }

  get left() {
    return this.total - this.stats.dropped;
  }

  get flying() {
    return this.enemies.filter(({ state }) => state === 'flying');
  }

  get forward() {
    return forwardOf(this.heading, this.pitch);
  }

  /** Where the camera is and where it's looking, in the picture and in deciding what's in the ring. */
  get view() {
    const forward = this.forward;
    const size = Math.hypot(-forward.x * forward.y, 1 - forward.y * forward.y, -forward.z * forward.y) || 1;
    const up = { x: (-forward.x * forward.y) / size, y: (1 - forward.y * forward.y) / size, z: (-forward.z * forward.y) / size };
    return {
      forward,
      up,
      eye: {
        x: this.x - forward.x * CAMERA.back + up.x * CAMERA.up,
        y: this.y - forward.y * CAMERA.back + up.y * CAMERA.up,
        z: this.z - forward.z * CAMERA.back + up.z * CAMERA.up,
      },
    };
  }

  /** How far off the middle of the view something is, as an angle, and how far away. */
  offAim(thing, view = this.view) {
    const dx = thing.x - view.eye.x;
    const dy = thing.y - view.eye.y;
    const dz = thing.z - view.eye.z;
    const away = Math.hypot(dx, dy, dz) || 1;
    const along = (dx * view.forward.x + dy * view.forward.y + dz * view.forward.z) / away;
    return { angle: Math.acos(clamp(along, -1, 1)), away };
  }

  /* ---------- other planes ---------- */

  fill() {
    while (this.waiting > 0 && this.flying.length < this.atOnce) this.spawn();
  }

  spawn() {
    const { random } = this;
    this.waiting -= 1;
    const away = between(random, ENEMY.spawnAway);
    const side = between(random, ENEMY.spawnAngle) * (random() < 0.5 ? -1 : 1);
    const direction = this.heading + side;
    const x = this.x + Math.sin(direction) * away;
    const z = this.z - Math.cos(direction) * away;
    const { climbs, weave, enemySpeed } = this.levelRules;
    const kind = this.plan[this.nextPilot] ?? 'pirate';
    const isCaptain = kind === 'captain';
    const hits = Math.max(1, Math.round(this.enemyHits * KINDS[kind].hits));
    const enemy = {
      index: this.nextPilot,
      kind,
      x,
      z,
      y: this.y + between(random, ENEMY.upDown.map((height) => height * climbs)),
      heading: this.heading + Math.PI + (random() - 0.5),
      pitch: 0,
      roll: 0,
      speed: this.pace.speed * enemySpeed,
      state: 'flying',
      captain: isCaptain,
      weavePhase: weave > 0 ? random() * Math.PI * 2 : 0,
      hitsTotal: hits,
      hitsLeft: hits,
      hitLeft: 0,
      mode: 'cross',
      modeLeft: 0,
      way: null,
      burstLeft: 0,
      shotIn: 0,
      fireIn: 0.8,
      dodgeLeft: 0,
      fallLeft: 0,
      slowLeft: 0,
      bubbled: false,
      leader: null,
    };
    if (kind === 'balloon') enemy.y = this.y + between(random, KINDS.balloon.high);
    if (kind === 'lead') this.lastLead = enemy;
    // A wingman flies beside its leader, if it's still flying. Coming along with a leader that's still far
    // off, it comes beside it. With its leader already near, it comes from the distance like any pirate,
    // and flies over to join it, rather than appearing out of nowhere.
    if (kind === 'wing' && this.lastLead?.state === 'flying') {
      const { lastLead: leader } = this;
      enemy.leader = leader;
      if (Math.hypot(leader.x - this.x, leader.z - this.z) >= ENEMY.spawnAway[0]) Object.assign(enemy, this.wingSpot(leader), { heading: leader.heading });
    }
    keepInside(enemy);
    if (kind === 'balloon') enemy.y = Math.min(enemy.y, WORLD.ceiling - 30);
    this.nextPilot += 1;
    this.enemies.push(enemy);
    this.emit('spawn', { enemy });
  }

  /** Somewhere for a plane to fly to, out in front of the child, so it's there to be hunted. */
  pickWay(enemy, { dodging = false } = {}) {
    const { random, forward } = this;
    const ahead = between(random, dodging ? ENEMY.dodgeAhead : ENEMY.ahead);
    const across = between(random, dodging ? ENEMY.dodgeAcross : ENEMY.across) * (random() < 0.5 ? -1 : 1);
    const x = this.x + forward.x * ahead + forward.z * across;
    const z = this.z + forward.z * ahead - forward.x * across;
    const upDown = enemy.kind === 'balloon' ? KINDS.balloon.high : ENEMY.upDown.map((height) => height * this.levelRules.climbs);
    const way = { x, z, y: this.y + forward.y * ahead + between(random, upDown) };
    keepInside(way);
    way.y = Math.max(way.y, floorAt(way.x, way.z) + 14);
    if (enemy.kind === 'balloon') way.y = Math.min(way.y, WORLD.ceiling - 30);
    enemy.way = way;
    enemy.modeLeft = 7;
  }

  /** Where a wingman flies: beside its leader and a little behind. */
  wingSpot(leader) {
    const forward = forwardOf(leader.heading, 0);
    return {
      x: leader.x - forward.z * PAIR.side - forward.x * PAIR.back,
      y: leader.y,
      z: leader.z + forward.x * PAIR.side - forward.z * PAIR.back,
    };
  }

  /** weave turns it from side to side on the way, by up to that much either way. */
  flyEnemyTowards(enemy, target, share, dt, weave = 0) {
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const dz = target.z - enemy.z;
    const rate = KINDS[enemy.kind]?.weaveRate ?? WEAVE_RATE;
    const wanted = headingTo(dx, dz) + (weave ? Math.sin(this.time * rate + enemy.weavePhase) * weave : 0);
    // A pirate hit by a snowflake is slow, and slow to turn, for a while.
    const slowed = enemy.slowLeft > 0;
    const most = this.levelRules.enemyTurn * dt * (slowed ? SLOW.turn : 1);
    const turn = clamp(turnBetween(wanted, enemy.heading), -most, most);
    enemy.heading += turn;
    enemy.pitch = damp(enemy.pitch, clamp(Math.atan2(dy, Math.hypot(dx, dz) || 1), -ENEMY.pitch, ENEMY.pitch), 2, dt);
    const sharpness = dt > 0 ? clamp(turn / most, -1, 1) : 0;
    enemy.roll = damp(enemy.roll, sharpness * FLY.roll * 0.85, 4, dt);
    const forward = forwardOf(enemy.heading, enemy.pitch);
    enemy.share = share;
    const speed = this.pace.speed * share * (slowed ? SLOW.share : 1);
    enemy.step = { x: forward.x * speed * dt, y: forward.y * speed * dt, z: forward.z * speed * dt };
    enemy.x += enemy.step.x;
    enemy.y += enemy.step.y;
    enemy.z += enemy.step.z;
    keepInside(enemy);
  }

  shootAtChild(enemy) {
    const { random } = this;
    const hit = random() < Math.min(0.9, this.level.hitChance * this.levelRules.sharpness);
    const miss = hit ? 0 : ENEMY.miss;
    const to = {
      x: this.x + (random() - 0.5) * miss * 2 + (hit ? 0 : Math.sign(random() - 0.5) * miss * 0.5),
      y: this.y + (random() - 0.5) * miss * 2,
      z: this.z + (random() - 0.5) * miss * 2,
    };
    const away = Math.hypot(to.x - enemy.x, to.y - enemy.y, to.z - enemy.z) || 1;
    this.shots.push({
      mine: false,
      x: enemy.x,
      y: enemy.y,
      z: enemy.z,
      dx: (to.x - enemy.x) / away,
      dy: (to.y - enemy.y) / away,
      dz: (to.z - enemy.z) / away,
      left: away / ENEMY.shotSpeed,
      hit,
    });
    this.emit('enemy-shot', { enemy });
  }

  /** The hunter's guns, in short bursts, whenever the child is in front of them. */
  huntWithGuns(enemy, away, dt) {
    if (enemy.burstLeft > 0) {
      enemy.shotIn -= dt;
      if (enemy.shotIn <= 0) {
        enemy.burstLeft -= 1;
        enemy.shotIn = ENEMY.shotEvery;
        this.shootAtChild(enemy);
        if (enemy.burstLeft === 0) enemy.fireIn = ENEMY.restAfterBurst;
      }
      return;
    }
    enemy.fireIn -= dt;
    if (enemy.fireIn > 0 || away > RANGE) return;
    const forward = forwardOf(enemy.heading, enemy.pitch);
    const along = ((this.x - enemy.x) * forward.x + (this.y - enemy.y) * forward.y + (this.z - enemy.z) * forward.z) / (away || 1);
    if (Math.acos(clamp(along, -1, 1)) <= ENEMY.aim) enemy.burstLeft = this.level.burst;
  }

  moveEnemies(dt) {
    const { forward } = this;
    for (const enemy of this.enemies) {
      enemy.hitLeft = Math.max(0, enemy.hitLeft - dt);
      enemy.dodgeLeft = Math.max(0, enemy.dodgeLeft - dt);
      enemy.slowLeft = Math.max(0, enemy.slowLeft - dt);
      if (enemy.state === 'falling' && (enemy.bubbled || !KINDS[enemy.kind].dodges)) {
        // Wrapped in a bubble, or a balloon or an airship, it sinks gently rather than falling, and
        // drifts aside, out of the child's way, so their plane never flies into it.
        enemy.fallLeft -= dt;
        enemy.pitch = damp(enemy.pitch, 0, 2, dt);
        enemy.roll = damp(enemy.roll, 0, 2, dt);
        enemy.y = Math.max(enemy.y - 7 * dt, 0);
        const side = Math.sign((enemy.x - this.x) * -forward.z + (enemy.z - this.z) * forward.x) || 1;
        enemy.x += -forward.z * side * DRIFT_ASIDE * dt;
        enemy.z += forward.x * side * DRIFT_ASIDE * dt;
        if (enemy.fallLeft <= 0) enemy.state = 'gone';
        continue;
      }
      if (enemy.state === 'falling') {
        enemy.fallLeft -= dt;
        enemy.pitch = damp(enemy.pitch, -1, 1.2, dt);
        enemy.roll += dt * 2.4;
        enemy.heading += dt * 0.5;
        const fall = forwardOf(enemy.heading, enemy.pitch);
        const speed = this.pace.speed * 0.8;
        enemy.x += fall.x * speed * dt;
        enemy.y = Math.max(enemy.y + fall.y * speed * dt, 0);
        enemy.z += fall.z * speed * dt;
        if (enemy.fallLeft <= 0) enemy.state = 'gone';
        continue;
      }
      if (enemy.state !== 'flying') continue;

      const away = Math.hypot(this.x - enemy.x, this.y - enemy.y, this.z - enemy.z);
      const behindChild = (enemy.x - this.x) * forward.x + (enemy.y - this.y) * forward.y + (enemy.z - this.z) * forward.z < 0;

      if (enemy.mode === 'hunt') {
        enemy.modeLeft -= dt;
        if (this.safeResting || enemy.modeLeft <= 0 || away < ENEMY.passed) {
          enemy.mode = 'cross';
          enemy.way = null;
        } else {
          const lead = this.speed * 0.5;
          this.flyEnemyTowards(enemy, { x: this.x + forward.x * lead, y: this.y + forward.y * lead, z: this.z + forward.z * lead }, ENEMY.huntSpeed, dt);
          this.huntWithGuns(enemy, away, dt);
          continue;
        }
      }

      enemy.modeLeft -= dt;
      const kind = KINDS[enemy.kind];
      const { leader } = enemy;
      if (leader && leader.state === 'flying' && enemy.dodgeLeft === 0 && enemy.slowLeft === 0) {
        const spot = this.wingSpot(leader);
        if (Math.hypot(spot.x - enemy.x, spot.y - enemy.y, spot.z - enemy.z) > PAIR.join) {
          // Still on its way to its leader, after a dodge or coming from the distance: it flies there
          // as a pirate getting out of the ring does, or catching up from behind, turning as it goes.
          this.flyEnemyTowards(enemy, spot, behindChild && away > 90 ? ENEMY.catchUp : ENEMY.dodgeSpeed, dt);
          continue;
        }
        // A wingman goes where its leader goes, easing into its spot beside it, and never sliding
        // across faster than a pirate can fly.
        const step = leader.step ?? { x: 0, y: 0, z: 0 };
        const pull = 1 - Math.exp(-1.5 * dt);
        const ease = { x: (spot.x - enemy.x) * pull, y: (spot.y - enemy.y) * pull, z: (spot.z - enemy.z) * pull };
        const most = this.pace.speed * PAIR.ease * dt;
        const size = Math.hypot(ease.x, ease.y, ease.z);
        const share = size > most ? most / size : 1;
        enemy.x += step.x + ease.x * share;
        enemy.y += step.y + ease.y * share;
        enemy.z += step.z + ease.z * share;
        enemy.heading += turnBetween(leader.heading, enemy.heading) * pull * 2;
        enemy.pitch = leader.pitch;
        enemy.roll = damp(enemy.roll, leader.roll, 4, dt);
        enemy.share = leader.share;
        keepInside(enemy);
        continue;
      }
      if (!enemy.way || enemy.modeLeft <= 0 || Math.hypot(enemy.x - enemy.way.x, enemy.y - enemy.way.y, enemy.z - enemy.way.z) < ENEMY.reached) this.pickWay(enemy);
      const crossing = kind.share ?? Math.min(0.95, this.levelRules.enemySpeed + (kind.faster ?? 0));
      const catchUp = kind.share ? 0.9 : ENEMY.catchUp; // A balloon or the airship is carried along by the wind.
      const share = enemy.dodgeLeft > 0 ? ENEMY.dodgeSpeed : behindChild && away > 90 ? catchUp : crossing;
      const weave = enemy.dodgeLeft > 0 ? 0 : kind.weave ?? this.levelRules.weave;
      this.flyEnemyTowards(enemy, enemy.way, share, dt, weave);
    }
    this.enemies = this.enemies.filter(({ state }) => state !== 'gone');
  }

  /** Every so often one of them turns and comes after the child. */
  startHunts(dt) {
    if (this.safeResting) return;
    this.huntIn -= dt;
    if (this.huntIn > 0) return;
    this.huntIn = between(this.random, this.huntEvery);
    const hunting = this.flying.some(({ mode }) => mode === 'hunt');
    if (hunting) return;
    // Balloons and the airship never hunt, and a wingman only comes along with its leader.
    const free = this.flying.filter((enemy) => enemy !== this.locked && KINDS[enemy.kind].hunts && enemy.leader?.state !== 'flying');
    if (!free.length) return;
    const hunter = free[Math.floor(this.random() * free.length)];
    hunter.mode = 'hunt';
    hunter.modeLeft = ENEMY.huntSeconds;
    hunter.fireIn = 0.5;
    hunter.burstLeft = 0;
  }

  /** Which plane, if any, is hunting from where the child can't see it. */
  watchBehind() {
    const { forward } = this;
    const hunter = this.flying.find(({ mode }) => mode === 'hunt') ?? null;
    this.hunted = hunter;
    if (!hunter || this.time - this.saidBehindAt < BEHIND_EVERY) return;
    const dx = hunter.x - this.x;
    const dy = hunter.y - this.y;
    const dz = hunter.z - this.z;
    if (dx * forward.x + dy * forward.y + dz * forward.z < 0 && Math.hypot(dx, dy, dz) < 170) {
      this.saidBehindAt = this.time;
      this.emit('behind', { enemy: hunter });
    }
  }

  /* ---------- the guns ---------- */

  /** The plane in the ring that's nearest the middle of it, if there is one. */
  /** What can be shot at: the pirates, or in a dogfight, friends' planes that are in it. */
  get targets() {
    if (!this.dogfight) return this.flying;
    if (this.outLeft > 0) return [];
    return this.mates.filter((mate) => mate.live && mate.seen && !(mate.outLeft > 0));
  }

  findTarget() {
    const view = this.view;
    let found = null;
    let nearest = Infinity;
    for (const enemy of this.targets) {
      const { angle, away } = this.offAim(enemy, view);
      if (away <= RANGE && angle <= this.level.aim && angle < nearest) {
        found = enemy;
        nearest = angle;
      }
    }
    return found;
  }

  shoot(target) {
    const kind = this.power && ['triple', 'bubble', 'snow'].includes(this.power.kind) ? this.power.kind : null;
    const side = this.stats.shots % 2 ? 1 : -1;
    const { forward } = this;
    const from = (across) => ({
      x: this.x + forward.z * across * -1,
      y: this.y,
      z: this.z + forward.x * across,
    });
    const fire = (across, extra = {}) => {
      this.shots.push({ mine: true, ...from(across), dx: forward.x, dy: forward.y, dz: forward.z, left: SHOT.life, target, ...extra });
      this.stats.shots += 1;
    };
    if (kind === 'bubble') {
      fire(0, { kind, speed: BUBBLE.speed, left: BUBBLE.life });
      this.shotIn = BUBBLE.every;
      return;
    }
    if (kind === 'triple') {
      // Three at once, in a fan, from the middle and from each wing.
      for (const across of [-TRIPLE_FAN, 0, TRIPLE_FAN]) fire(across, { kind });
    } else {
      fire(side * 3, kind ? { kind } : {});
    }
    this.shotIn = SHOT.every;
  }

  /** Something that flies after its target and does something when it gets there. */
  arrives(shot) {
    const { target, kind } = shot;
    if (target.friend) {
      this.hitMate(target);
      return;
    }
    if (kind === 'bubble') this.wrap(target);
    else if (kind === 'paper') {
      for (let i = 0; i < PAPER.hits; i += 1) this.hit(target);
    } else {
      this.hit(target);
      if (kind === 'snow' && target.state === 'flying') {
        if (!target.slowLeft) this.emit('slowed', { enemy: target });
        target.slowLeft = SLOW.seconds;
      }
    }
  }

  /** A bubble wraps a pirate up, and it floats gently down. A captain or an airship is too big for that. */
  wrap(enemy) {
    if (enemy.state !== 'flying') return;
    if (enemy.kind === 'captain' || enemy.kind === 'airship') {
      for (let i = 0; i < BUBBLE.bigHits; i += 1) this.hit(enemy);
      return;
    }
    this.stats.hits += 1;
    enemy.bubbled = true;
    enemy.hitsLeft = 0;
    this.emit('bubbled', { enemy });
    this.drop(enemy);
  }

  drop(enemy) {
    enemy.state = 'falling';
    enemy.mode = 'falling';
    enemy.fallLeft = ENEMY.fallSeconds;
    this.stats.dropped += 1;
    if (this.levelRules.prizes) {
      const prize = { kind: KINDS[enemy.kind].prize, x: enemy.x, y: enemy.y, z: enemy.z, age: 0, from: enemy };
      this.prizes.push(prize);
      this.emit('prize-dropped', { prize });
    }
    this.emit('down', { enemy, dropped: this.stats.dropped, left: this.left });
    if (this.left === 0) this.wonIn = WON_AFTER;
    this.spawnIn = ENEMY.nextIn;
  }

  hit(enemy) {
    if (enemy.state !== 'flying') return;
    enemy.hitsLeft -= 1;
    enemy.hitLeft = 0.25;
    this.stats.hits += 1;
    this.emit('hit', { enemy });
    if (enemy.hitsLeft <= 0) {
      this.drop(enemy);
      return;
    }
    // Being shot at, it stops hunting and tries to get out of the ring, so it has to be chased. A pair gets out
    // of the way together: a wingman's leader goes, and the wingman stays beside it, rather than each going its
    // own way.
    const going = enemy.leader?.state === 'flying' ? enemy.leader : enemy;
    if (going.dodgeLeft === 0 && KINDS[going.kind].dodges) {
      going.mode = 'cross';
      going.dodgeLeft = this.levelRules.dodgeSeconds;
      this.pickWay(going, { dodging: true });
    }
  }

  /* ---------- a dogfight with friends ---------- */

  /** A shot from this child's plane has got to a friend's. */
  hitMate(mate) {
    if (!this.dogfight || this.state !== 'flying' || !mate.live || mate.outLeft > 0) return;
    mate.hitsTaken = (mate.hitsTaken ?? 0) + 1;
    mate.hitLeft = 0.25;
    this.stats.hits += 1;
    this.emit('mate-hit', { mate });
    if (mate.hitsTaken >= DOGFIGHT.hits) this.mateOut(mate, { mine: true });
  }

  /**
   * A friend's plane is out of the fight for a moment: put out by this child's, mine, or by another friend's, as
   * that friend's game says. Each child's own game counts what it does to the others.
   */
  mateOut(mate, { mine = false } = {}) {
    if (!this.dogfight || mate.outLeft > 0) return;
    mate.outLeft = DOGFIGHT.outSeconds;
    mate.hitsTaken = 0;
    if (mine) this.stats.dropped += 1;
    this.emit('mate-out', { mate, mine, dropped: this.stats.dropped });
    if (mine && this.left <= 0 && this.wonIn === null) this.wonIn = WON_AFTER;
  }

  /** A friend's game says it put this child's plane out: it trails smoke, and can't shoot or be shot, for a moment. */
  knockedOut() {
    if (!this.dogfight || this.state !== 'flying' || this.outLeft > 0) return;
    this.outLeft = DOGFIGHT.outSeconds;
    this.stats.hurts += 1;
    this.shots = this.shots.filter(({ mine }) => !mine);
    this.emit('out', {});
  }

  /** A friend got there first: the dogfight is over, and it's theirs. */
  beaten() {
    if (!this.dogfight || this.state !== 'flying') return;
    this.lose();
  }

  /** Everyone else has gone: there's nobody left to fight, and the dogfight is this child's. */
  walkover() {
    if (!this.dogfight || this.state !== 'flying') return;
    this.finish('won');
    this.emit('won', { dropped: this.stats.dropped, walkover: true });
  }

  hurt() {
    this.stats.hurts += 1;
    this.hearts -= 1;
    this.sinceHurt = 0;
    this.hurtLeft = 0.8;
    this.emit('hurt', { hearts: this.hearts });
    if (this.hearts > 0) return;
    if (this.level.canLose) this.lose();
    else this.hearts = 1;
  }

  lose() {
    this.finish('lost');
    this.emit('lost', { dropped: this.stats.dropped });
  }

  /**
   * It's all over, won or lost. Prizes still on their way arrive at once, so every one is counted, the
   * gift box floats off, and a power ends, so a friend doesn't go on firing.
   */
  finish(state) {
    for (const prize of this.prizes) this.collect(prize);
    this.prizes = [];
    this.gift = null;
    if (this.power) this.endPower();
    this.state = state;
    this.locked = null;
    this.setFiring(false);
  }

  moveShots(dt) {
    for (const shot of this.shots) {
      shot.left -= dt;
      if (shot.mine) {
        const { target } = shot;
        // Tracers bend towards what they're fired at, as lining up exactly isn't the point.
        const dx = target.x - shot.x;
        const dy = target.y - shot.y;
        const dz = target.z - shot.z;
        const away = Math.hypot(dx, dy, dz) || 1;
        shot.dx = dx / away;
        shot.dy = dy / away;
        shot.dz = dz / away;
        const step = (shot.speed ?? SHOT.speed) * dt;
        shot.x += shot.dx * step;
        shot.y += shot.dy * step;
        shot.z += shot.dz * step;
        if (away <= SHOT.reach + step) {
          shot.left = 0;
          this.arrives(shot);
        }
      } else {
        const step = ENEMY.shotSpeed * dt;
        shot.x += shot.dx * step;
        shot.y += shot.dy * step;
        shot.z += shot.dz * step;
        if (shot.left <= 0 && shot.hit && !this.safeResting && this.state === 'flying') {
          // The shield bubble: their shots bounce off it.
          if (this.power?.kind === 'shield') {
            this.stats.blocked += 1;
            this.emit('shielded');
          } else this.hurt();
        }
      }
    }
    this.shots = this.shots.filter(({ left }) => left > 0);
  }

  setFiring(on) {
    if (on === this.firing) return;
    this.firing = on;
    this.emit('firing', { on });
  }

  /* ---------- prizes, gift boxes and powers ---------- */

  /** Prizes wait a moment where a pirate was dropped, then fly to the child's plane by themselves. */
  movePrizes(dt) {
    for (const prize of this.prizes) {
      prize.age += dt;
      if (prize.age < PRIZE.wait) continue;
      const dx = this.x - prize.x;
      const dy = this.y - prize.y;
      const dz = this.z - prize.z;
      const away = Math.hypot(dx, dy, dz) || 1;
      const step = Math.min(PRIZE.most, PRIZE.speed + (prize.age - PRIZE.wait) * PRIZE.speedUp) * dt;
      if (away <= PRIZE.reach + step) {
        this.collect(prize);
        continue;
      }
      prize.x += (dx / away) * step;
      prize.y += (dy / away) * step;
      prize.z += (dz / away) * step;
    }
    this.prizes = this.prizes.filter(({ caught }) => !caught);
  }

  collect(prize) {
    prize.caught = true;
    this.stats.prizes[prize.kind] += 1;
    this.emit('prize', { prize });
  }

  /** Every so often a gift box floats out in front, and flying through it gives a power. */
  moveGift(dt) {
    const { gifts } = this.levelRules;
    if (!gifts.length) return;
    const { gift } = this;
    if (!gift) {
      if (this.resting || this.wonIn !== null) return;
      this.giftIn -= dt;
      if (this.giftIn <= 0) this.placeGift(gifts[this.giftTurn % gifts.length]);
      return;
    }
    gift.age += dt;
    const dx = this.x - gift.x;
    const dy = this.y - gift.y;
    const dz = this.z - gift.z;
    const away = Math.hypot(dx, dy, dz) || 1;
    if (away <= GIFT.reach) {
      this.gift = null;
      this.giftIn = between(this.random, GIFT.every);
      this.giftTurn += 1;
      this.startPower(gift.kind);
      return;
    }
    // It drifts towards the plane all the time, and near it, comes to it.
    const step = Math.min(away, (away < GIFT.pull ? GIFT.pullSpeed : GIFT.drift) * dt);
    gift.x += (dx / away) * step;
    gift.y += (dy / away) * step;
    gift.z += (dz / away) * step;
    if (gift.age > GIFT.life) {
      // Missed: it floats away, costing nothing, and another comes along.
      this.gift = null;
      this.giftIn = between(this.random, GIFT.every);
      this.giftTurn += 1;
      this.emit('gift-gone', { gift });
    }
  }

  placeGift(kind) {
    const { random, forward } = this;
    const across = between(random, GIFT.across);
    const up = this.climbing ? between(random, GIFT.up) : 0;
    const gift = {
      kind,
      x: this.x + forward.x * GIFT.ahead - forward.z * across,
      y: this.y + forward.y * GIFT.ahead + up,
      z: this.z + forward.z * GIFT.ahead + forward.x * across,
      age: 0,
    };
    keepInside(gift);
    gift.y = Math.max(gift.y, floorAt(gift.x, gift.z) + 20);
    this.gift = gift;
    this.emit('gift', { gift });
  }

  startPower(kind) {
    if (this.power) this.emit('power', { kind: this.power.kind, on: false });
    this.power = { kind, left: POWERS[kind], total: POWERS[kind] };
    this.stats.gifts += 1;
    // The friend flies in from behind, and stays beside the plane, wherever it goes.
    this.helper = kind === 'helper' ? { side: HELPER.side * 2, back: 40, x: this.x, y: this.y, z: this.z, shotIn: 0.8 } : null;
    this.paperIn = 0.3;
    this.emit('power', { kind, on: true });
  }

  endPower() {
    const { kind } = this.power;
    this.power = null;
    this.helper = null;
    this.emit('power', { kind, on: false });
  }

  /** A power lasts a few seconds of flying. Resting doesn't use it up, and nothing fires while resting. */
  usePower(dt) {
    if (!this.power) return;
    if (!this.resting) this.power.left -= dt;
    if (this.power.left <= 0) {
      this.endPower();
      return;
    }
    if (this.power.kind === 'helper') this.flyHelper(dt);
    if (this.power.kind === 'paper' && !this.resting) {
      this.paperIn -= dt;
      if (this.paperIn <= 0) {
        this.paperIn = PAPER.every;
        const target = this.nearestWithin(this, PAPER.cone, PAPER.reach);
        if (target) {
          const { forward } = this;
          // From just ahead of the plane, so it isn't right in front of the camera.
          this.shots.push({ mine: true, kind: 'paper', x: this.x + forward.x * 8, y: this.y + forward.y * 8 + 1, z: this.z + forward.z * 8, dx: forward.x, dy: forward.y, dz: forward.z, left: PAPER.life, speed: PAPER.speed, target });
          this.emit('paper', { target });
        }
      }
    }
  }

  /** The flying pirate nearest the way a plane points, the child's unless said, from somewhere, within a cone. */
  nearestWithin(from, cone, reach, forward = this.forward) {
    let found = null;
    let nearest = Infinity;
    for (const enemy of this.flying) {
      const dx = enemy.x - from.x;
      const dy = enemy.y - from.y;
      const dz = enemy.z - from.z;
      const away = Math.hypot(dx, dy, dz) || 1;
      const angle = Math.acos(clamp((dx * forward.x + dy * forward.y + dz * forward.z) / away, -1, 1));
      if (away <= reach && angle <= cone && angle < nearest) {
        found = enemy;
        nearest = angle;
      }
    }
    return found;
  }

  /** A friend flies beside the child's plane and fires at a pirate ahead of it. */
  flyHelper(dt) {
    const { helper, forward } = this;
    helper.side = damp(helper.side, HELPER.side, 2, dt);
    helper.back = damp(helper.back, HELPER.back, 2, dt);
    helper.x = this.x - forward.z * helper.side - forward.x * helper.back;
    helper.y = this.y + HELPER.up;
    helper.z = this.z + forward.x * helper.side - forward.z * helper.back;
    if (this.resting) return;
    helper.shotIn -= dt;
    if (helper.shotIn > 0) return;
    const target = this.nearestWithin(helper, HELPER.cone, RANGE);
    if (!target) return;
    helper.shotIn = HELPER.every;
    this.shots.push({ mine: true, kind: 'helper', x: helper.x, y: helper.y, z: helper.z, dx: forward.x, dy: forward.y, dz: forward.z, left: SHOT.life, target });
  }

  /**
   * A friend flying on their own computer. Like the friend who helps, their plane fires at a pirate ahead of
   * it: these pirates are only on this computer, but here the friend is flying with the child, and helps.
   * Nothing fires while the child rests.
   */
  mateFires(mate, dt) {
    if (!mate.live || this.resting) return;
    mate.shotIn = (mate.shotIn ?? HELPER.every) - dt;
    if (mate.shotIn > 0) return;
    const forward = forwardOf(mate.heading, mate.pitch);
    const target = this.nearestWithin(mate, HELPER.cone, RANGE, forward);
    if (!target) return;
    mate.shotIn = HELPER.every;
    this.shots.push({ mine: true, kind: 'helper', x: mate.x, y: mate.y, z: mate.z, dx: forward.x, dy: forward.y, dz: forward.z, left: SHOT.life, target });
  }

  /* ---------- the child's plane ---------- */

  /** The plane nearest to being lined up, for the help with aiming. */
  nearestAhead() {
    const view = this.view;
    let found = null;
    let nearest = Infinity;
    for (const enemy of this.targets) {
      const { angle, away } = this.offAim(enemy, view);
      if (away <= RANGE * 1.3 && angle < nearest) {
        found = enemy;
        nearest = angle;
      }
    }
    return found ? { enemy: found, angle: nearest } : null;
  }

  /** Where it's pointing, from the arms, with the limits and the help with aiming on top. */
  steer(dt, { out, bank, climb }) {
    const { level, resting } = this;
    const steering = out && Math.abs(bank) > FLY.deadZone ? bank : 0;
    const wantedRoll = resting ? FLY.restTurn * FLY.roll * 2 : steering * FLY.roll;
    this.roll = damp(this.roll, wantedRoll, FLY.rollEase, dt);
    this.heading += (this.roll / FLY.roll) * FLY.turn * dt;

    const target = this.nearestAhead();
    let wantedPitch = this.climbing && out && !resting ? climb * FLY.pitch : 0;
    if (target) {
      const dx = target.enemy.x - this.x;
      const dz = target.enemy.z - this.z;
      const elevation = Math.atan2(target.enemy.y - this.y, Math.hypot(dx, dz) || 1);
      const close = target.angle <= level.aim * ASSIST.cone;
      if (!this.climbing && !resting) wantedPitch = clamp(elevation, -ASSIST.autoHeight, ASSIST.autoHeight);
      else if (close && !resting) wantedPitch += clamp(elevation - this.pitch, -ASSIST.pitch, ASSIST.pitch) * level.assist;
      if (close && !resting) this.heading += clamp(turnBetween(headingTo(dx, dz), this.heading), -0.5, 0.5) * ASSIST.turn * level.assist * dt;
    }

    // The ground, a little ahead as well as here, so that a hill is climbed in good time.
    const forward = this.forward;
    let floor = floorAt(this.x, this.z);
    for (const seconds of LIMITS.aheadLook) {
      const ahead = this.pace.speed * seconds;
      floor = Math.max(floor, floorAt(this.x + forward.x * ahead, this.z + forward.z * ahead));
    }
    const aboveFloor = this.y - floor;
    if (aboveFloor < LIMITS.floorRoom) wantedPitch = Math.max(wantedPitch, LIMITS.pullUp * (1 - Math.max(0, aboveFloor) / LIMITS.floorRoom));
    const belowCeiling = WORLD.ceiling - this.y;
    if (belowCeiling < LIMITS.ceilingRoom) wantedPitch = Math.min(wantedPitch, -LIMITS.pushDown * (1 - belowCeiling / LIMITS.ceilingRoom));
    wantedPitch = clamp(wantedPitch, -FLY.pitch, FLY.pitch);
    this.pitch = damp(this.pitch, wantedPitch, FLY.pitchEase, dt);

    // The outer edge: the nearer it gets, the more the plane turns itself back towards the island.
    const fromMiddle = Math.hypot(this.x, this.z);
    this.atLimit = clamp((fromMiddle - WORLD.turnBackFrom) / (WORLD.limit - WORLD.turnBackFrom), 0, 1);
    if (this.atLimit > 0) {
      this.heading += turnBetween(headingTo(-this.x, -this.z), this.heading) * this.atLimit * LIMITS.turnBack * dt;
    }
  }

  moveChild(dt, out) {
    const { resting } = this;
    const share = (out ? 1 : resting ? FLY.restShare : FLY.glide) * (1 - Math.sin(this.pitch) * FLY.climbCost);
    this.speed = damp(this.speed, this.pace.speed * share, 2, dt);
    const forward = this.forward;
    this.x += forward.x * this.speed * dt;
    this.y += forward.y * this.speed * dt;
    this.z += forward.z * this.speed * dt;
    keepInside(this);
  }

  /** One frame. out is both arms being held out, bank which way they tip and climb how high they are. */
  update(dt, { out = false, bank = 0, climb = 0 } = {}) {
    this.time += dt;
    if (this.state === 'ready') return;
    if (this.state !== 'flying') {
      // It carries on flying, in a big gentle circle, once it's all over.
      this.steer(dt, { out: true, bank: 0.3, climb: 0 });
      this.moveChild(dt, true);
      this.moveEnemies(dt);
      this.moveShotsAfter(dt);
      if (this.helper) this.flyHelper(dt);
      return;
    }

    this.downFor = out ? 0 : this.downFor + dt;
    const resting = this.downFor > REST_AFTER;
    if (resting !== this.resting) {
      this.resting = resting;
      if (resting && this.level.restSafe) this.shots = this.shots.filter(({ mine }) => mine);
      this.emit('resting', { on: resting });
    }

    this.stats.seconds += dt;
    if (out) this.stats.wingsSeconds += dt;
    this.hurtLeft = Math.max(0, this.hurtLeft - dt);
    this.sinceHurt += dt;
    if (this.hearts < HEARTS && this.sinceHurt >= this.level.healAfter) {
      this.hearts += 1;
      this.sinceHurt = 0;
      this.emit('healed', { hearts: this.hearts });
    }

    this.steer(dt, { out, bank, climb });
    this.moveChild(dt, out);

    if (this.spawnIn > 0) {
      this.spawnIn -= dt;
      if (this.spawnIn <= 0) this.fill();
    }
    this.moveEnemies(dt);
    this.startHunts(dt);
    this.watchBehind();
    this.moveGift(dt);
    this.usePower(dt);
    if (this.dogfight) this.countOut(dt);
    else for (const mate of this.mates) this.mateFires(mate, dt);

    this.locked = resting ? null : this.findTarget();
    this.setFiring(Boolean(this.locked));
    this.shotIn = Math.max(0, this.shotIn - dt);
    if (this.locked && this.shotIn === 0) this.shoot(this.locked);
    this.moveShots(dt);
    this.movePrizes(dt);
    if (this.state !== 'flying') return;

    if (this.wonIn !== null) {
      this.wonIn -= dt;
      if (this.wonIn <= 0) {
        this.finish('won');
        this.emit('won', { dropped: this.stats.dropped });
      }
    }
  }

  /** A dogfight: planes that are out come back into it. */
  countOut(dt) {
    if (this.outLeft > 0) {
      this.outLeft = Math.max(0, this.outLeft - dt);
      if (this.outLeft === 0) this.emit('back', {});
    }
    for (const mate of this.mates) if (mate.outLeft > 0) mate.outLeft = Math.max(0, mate.outLeft - dt);
  }

  /** What's already in the air when it's all over just carries on, and harms nobody. */
  moveShotsAfter(dt) {
    for (const shot of this.shots) {
      shot.left -= dt;
      const step = (shot.mine ? shot.speed ?? SHOT.speed : ENEMY.shotSpeed) * dt;
      shot.x += shot.dx * step;
      shot.y += shot.dy * step;
      shot.z += shot.dz * step;
    }
    this.shots = this.shots.filter(({ left }) => left > 0);
  }
}
