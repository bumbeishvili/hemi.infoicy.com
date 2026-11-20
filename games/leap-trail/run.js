// The rules of a run. No screen, camera or sound in this file: moves come in and what happened
// comes out as events, so all of it runs in the unit tests.
//
// The trail is laid out ahead of time. Jumping is the only move asked for: there are no squats, so a
// child never has to wonder which move is wanted. There's a stretch of trail before each obstacle
// where a jump counts, and a jump anywhere in that stretch clears it, however early it is. The
// fighter just hangs in the air for longer. The trail has three lanes. Most obstacles go right across
// and need a jump, but some only fill one or two lanes, and those can be passed by stepping into a
// free lane as well as by jumping them, which is what makes moving across worth it. Lines of stars
// are in one lane or another, often the free one. Missing a jump either stops the fighter to wait for
// it, or costs a stumble, and a missed star costs nothing. Each stumble also costs a heart, and a run
// whose hearts are all gone is over there, unless a grown-up has chosen the gentle trail, where it
// always runs on to the finish as it once did. A runner set to wait never runs into anything.
//
// Each level, from 1 to 10, is a little harder than the one before: see trailLevel below.
//
// Running with friends, everyone runs the same trail, laid out from the same seed: the host's level, pace,
// length and lanes, with its obstacles and lines of stars, but none of the extras a level adds, which would
// each need sharing out. A star on the trail is only had by one runner: whoever the server says got to it
// first. The stars for clearing an obstacle are each runner's own.
import { clampLevel, ramp, stepsAt } from '../../core/levels.js';

export const PACES = {
  // speed is metres a second, every is seconds between obstacles, and early is how long before
  // an obstacle a move starts to count. The running is fast, but all the time a child gets is set in
  // seconds, so going faster doesn't ask them to move any sooner. It's generous on purpose: this is
  // about moving, not reaction time, and the camera adds a moment of delay to everything. A move as
  // soon as it's asked for sends the runner straight over, in a dash.
  slow: { speed: 14, every: [3, 3.9], early: 2 },
  medium: { speed: 18, every: [2.6, 3.3], early: 1.7 },
  fast: { speed: 24, every: [2.1, 2.7], early: 1.4 },
};

export const OBSTACLES = {
  log: { needs: 'jump', length: 0.9, height: 0.75 },
  hay: { needs: 'jump', length: 1.2, height: 1.05 },
  rocks: { needs: 'jump', length: 1.4, height: 0.7 },
  stream: { needs: 'jump', length: 2.4, height: 0.1 },
  // Later levels bring new things to jump, from the level given.
  fence: { needs: 'jump', length: 0.5, height: 1.1, from: 4 },
  bale: { needs: 'jump', length: 1.25, height: 1.2, from: 6 }, // Round bales, which roll in and stop.
  ducks: { needs: 'jump', length: 0.8, height: 0.75, from: 7 }, // A duck and her ducklings, waddling over into their lane.
  sheep: { needs: 'jump', length: 0.8, height: 0.95, from: 8 }, // A flock crossing the trail.
};

// Power-ups, which hang over a lane on the line of stars and are picked up by running through them
// in that lane, from the level given. They last this many seconds of running: standing still to rest
// or to wait never uses them up. A friend doesn't need a lane: they just come running up alongside.
export const POWERS = {
  magnet: { seconds: 6, from: 5 }, // Pulls in the stars from every lane.
  shield: { seconds: 15, from: 6 }, // A bubble: the next obstacle run into is floated over instead.
  friend: { seconds: 10, from: 9, anyLane: true }, // Runs alongside, and catches a star for every one caught.
};

export const ARCH_STARS = 5; // What the arch of stars over a trampoline is worth, bounced through.
export const CHEST_COINS = 8; // What's in a chest opened with a key.
export const GEM_COINS = 5; // What a gem at the top of a trampoline's arch is worth, from level 10.

/**
 * What each level brings that's new, which the cards show and the run marks the first time it comes
 * into view. Every level from 2 brings something. id is what the run and the world call it.
 */
export const NEW_THINGS = {
  2: [{ id: 'coins', mark: '🟡', name: 'Coins', nameKa: 'მონეტები' }],
  3: [{ id: 'gold', mark: '🌟', name: 'Golden stars', nameKa: 'ოქროს ვარსკვლავები' }],
  4: [{ id: 'fence', mark: '🪵', name: 'Fences', nameKa: 'ღობეები' }, { id: 'spring', mark: '🤸', name: 'Trampolines', nameKa: 'ბატუტები' }],
  5: [{ id: 'magnet', mark: '🧲', name: 'Magnet', nameKa: 'მაგნიტი' }, { id: 'zigzag', mark: '↔️', name: 'Stars change lanes', nameKa: 'ვარსკვლავები ზოლს იცვლის' }],
  6: [{ id: 'bale', mark: '🌾', name: 'Rolling bales', nameKa: 'მგორავი თივა' }, { id: 'shield', mark: '🫧', name: 'Bubble shield', nameKa: 'ბუშტის ფარი' }],
  7: [{ id: 'ducks', mark: '🦆', name: 'Ducks', nameKa: 'იხვები' }, { id: 'autumn', mark: '🍂', name: 'Autumn', nameKa: 'შემოდგომა' }],
  8: [{ id: 'sheep', mark: '🐑', name: 'Sheep', nameKa: 'ცხვრები' }, { id: 'key', mark: '🔑', name: 'Key and chest', nameKa: 'გასაღები და სკივრი' }],
  9: [{ id: 'friend', mark: '🤝', name: 'Running friend', nameKa: 'მეგობარი გვერდით' }],
  10: [{ id: 'sunset', mark: '🌅', name: 'Sunset', nameKa: 'მზის ჩასვლა' }, { id: 'gems', mark: '💎', name: 'Gems', nameKa: 'ძვირფასი ქვები' }],
};

/**
 * What these settings leave a power-up to do. A magnet pulls stars in from the other lanes, so it needs
 * the lanes, and a bubble floats the runner over what it would run into, which a runner set to stop and
 * wait never does. Ones with nothing to do aren't laid on the trail.
 */
export const powersFor = (rules, { lanes = true, whenMissed = 'stumble' } = {}) =>
  rules.powers.filter((kind) => (kind !== 'magnet' || lanes) && (kind !== 'shield' || whenMissed === 'stumble'));

/** Whether something new really comes with these settings: stars changing lanes need the lanes too. */
const comesWith = (id, settings) => {
  if (id === 'zigzag') return settings.lanes !== false;
  if (id in POWERS) return powersFor({ powers: [id] }, settings).length > 0;
  return true;
};

/**
 * What's new at a level, for the cards: nothing at level 1. settings are the run's lanes and whenMissed,
 * as the cards only promise what those settings really bring.
 */
export const newThingsAt = (level, settings = {}) => (NEW_THINGS[clampLevel(level)] ?? []).filter(({ id }) => comesWith(id, settings));
export const newAt = (level, settings = {}) => newThingsAt(level, settings).map(({ mark, name, nameKa }) => ({ mark, name, nameKa }));

// The lanes, from the child's left to their right as seen in the mirror. 0 is the middle.
export const LANES = [-1, 0, 1];
export const GOLD_STARS = 5; // What a golden star is worth.

// How each level 10 compares with level 1, on the trail as it comes and on the gentle trail, which is the
// game as it was before a run could be lost.
const TOP_LEVEL = {
  challenge: { speed: 1.3, gaps: 0.72, early: 0.7 },
  gentle: { speed: 1.12, gaps: 0.85, early: 0.85 },
};

/**
 * What a level changes. Level 1 is the game as it always was. The pace and the length a grown-up
 * chose stay theirs, and a level goes beyond that pace. All the time a child gets is still in seconds.
 * gentle is the gentle trail, which ramps as it always did and has no hearts to lose.
 */
export function trailLevel(level = 1, { gentle = false } = {}) {
  const top = TOP_LEVEL[gentle ? 'gentle' : 'challenge'];
  return {
    // Running faster, up to 30% by level 10 (12% on the gentle trail), which is most of what feels harder.
    speed: ramp(level, 1, top.speed),
    // Obstacles closer together in time, down to 72% of the pace's gaps by level 10 (85% when gentle).
    gaps: ramp(level, 1, top.gaps),
    // The stretch where a jump counts, in seconds, down to 70% of the pace's by level 10 (85% when gentle).
    early: ramp(level, 1, top.early),
    // How many stumbles a run has, as hearts: the last one gone and the run is over. Fewer as the levels
    // go up. None on the gentle trail, where a stumble only costs the streak.
    hearts: gentle ? null : stepsAt(level, { 1: 5, 3: 4, 6: 3, 9: 2 }),
    // How often a line of stars is in a different lane from the one before.
    laneMoves: ramp(level, 0.65, 0.85),
    // From level 3, a golden star over some obstacles, in one lane: jumping over in that lane catches
    // it, so it's a step and then a jump. Missing it costs nothing.
    gold: stepsAt(level, { 1: 0, 3: 0.25, 5: 0.35, 7: 0.45, 9: 0.5 }),
    // From level 5, some lines of stars cross into the next lane halfway along.
    zigzag: stepsAt(level, { 1: 0, 5: 0.2, 7: 0.3, 9: 0.4 }),
    // How many obstacles go right across, and how many fill only one lane. The rest fill two. At
    // level 1 most go across. A stream always does.
    full: ramp(level, 0.75, 0.3),
    single: ramp(level, 0, 0.35),
    // How often the free lane is on the other side from the last obstacle's, so it's a step each time.
    freeSwitch: ramp(level, 0.3, 0.85),
    // How often stars wait in the free lane beside an obstacle, for stepping round it.
    freeStars: ramp(level, 0.5, 0.9),
    // New obstacles: a fence from level 4, round bales rolling in from 6, ducks from 7 and sheep from 8.
    kinds: Object.keys(OBSTACLES).filter((kind) => (OBSTACLES[kind].from ?? 1) <= clampLevel(level)),
    // From level 2, clearing an obstacle, by jumping it or by stepping round, drops a coin, caught by itself.
    coins: clampLevel(level) >= 2,
    // From level 4, a trampoline in one lane in front of some obstacles. Jumping from its lane bounces
    // high, through an arch of stars. It's on the way the stars go, so it's never more than a step.
    spring: stepsAt(level, { 1: 0, 4: 0.25, 6: 0.3, 8: 0.35 }),
    // From level 10, a gem at the top of each trampoline's arch.
    gems: clampLevel(level) >= 10,
    // Power-ups: a magnet from level 5, a bubble shield from 6 and a friend from 9, one after every
    // so many obstacles, on the line of stars. Only those with something to do with the run's settings
    // are laid: see powersFor.
    powers: Object.keys(POWERS).filter((kind) => POWERS[kind].from <= clampLevel(level)),
    powerEvery: stepsAt(level, { 1: 0, 5: 6, 7: 5, 9: 4 }),
    // From level 8, a key on the line of stars, and a chest beside the trail a few obstacles later.
    keyEvery: stepsAt(level, { 1: 0, 8: 7 }),
    // Where and when: a summer's day, then autumn from level 7, and an autumn sunset at level 10.
    place: stepsAt(level, { 1: 'day', 7: 'autumn', 10: 'sunset' }),
  };
}

// Friends running together, on the same side, stay in one pack. A runner more than ahead metres in front of the
// last of them eases off, down to slowest of the trail's pace over the next slack metres. Nobody is stopped by
// it. And nobody is hurried: a runner behind is never made faster, as that would leave less time for each move.
export const PACK = { ahead: 30, slack: 30, slowest: 0.5 };

/**
 * How much of the trail's pace a runner in a pack runs at. mine is how far it has run, and others how far each
 * friend who's still here has, in metres. With no friends left it's a runner on its own.
 */
export function packPace(mine, others) {
  const far = others.filter(Number.isFinite);
  if (!far.length) return 1;
  const ahead = mine - Math.min(...far);
  if (ahead <= PACK.ahead) return 1;
  return 1 - (1 - PACK.slowest) * Math.min(1, (ahead - PACK.ahead) / PACK.slack);
}

/** A level, run with friends: the same obstacles, places and coins, without the extras that would need sharing. */
// Nor hearts: running with friends is a race for stars, and everyone runs on to the finish.
export const withFriends = (rules) => ({ ...rules, gold: 0, spring: 0, gems: false, powers: [], powerEvery: 0, keyEvery: 0, hearts: null });

/** A pace, as a level plays it. At level 1 it's the pace itself. */
export function paceAt(pace, level = 1, { gentle = false } = {}) {
  const { speed, every, early } = PACES[pace];
  const rules = trailLevel(level, { gentle });
  return { speed: speed * rules.speed, every: every.map((seconds) => seconds * rules.gaps), early: early * rules.early };
}

const FIRST_OBSTACLE_SECONDS = 3;
const AFTER_LAST_SECONDS = 1.5;
const STOP_GAP = 1.5; // Metres short of an obstacle where the fighter stops to wait.
const SPEED_CHANGE = 2.2;
const SHORTEST_HOP = 0.62; // Seconds, for a move that isn't clearing anything.
const LOWEST_JUMP = 1.4;
const HIGHEST_JUMP = 3.2;
const FLIGHT_PAST = 1.22; // A jump lands this much further on than the far edge of what it clears.
const LONGEST_MOVE = 1.35; // Seconds. A move made early goes faster, to be over by then.
const STUMBLE_SECONDS = 0.7;
const STUMBLE_SPEED = 0.5;
const STARS_FOR_CLEARING = 3;
const REST_AFTER = 9; // A child who hasn't moved for this long is resting, and the fighter waits.
const BOUNCE = 1.35; // How much higher a jump from a trampoline goes, and at least a metre higher,
const BOUNCE_TOP = 4.2; // up to this high.
const SHIELD_SECONDS_BEFORE = 0.3; // A bubble floats the runner over what it would run into, this long before.
const CHEST_OPENS_BEFORE = 8; // Metres before a chest, so it's still in view as it opens.
// Lines of stars on the path, picked up just by running through them.
const STAR_LINE = { count: 6, spacing: 2.6, firstAfter: 0.5, afterObstacle: 0.45 };

const between = (random, [low, high]) => low + random() * (high - low);

/**
 * Which obstacle carries a level's new thing if chance hasn't brought it: the second, so a short trail
 * still has it, and it comes after the first has been seen.
 */
const sureIndex = (course) => Math.min(1, course.length - 1);

/**
 * A jump is an arc across the distance it travels. This makes the arc high enough to be well over
 * the obstacle at both its near and far edges, wherever in the arc those fall.
 */
function jumpHeight(obstacle, gap, travel) {
  const near = Math.max(0.1, gap / travel);
  const far = (gap + obstacle.length) / travel;
  const lowest = Math.min(near * (1 - near), far * (1 - far));
  const needed = (obstacle.height + 0.25) / (4 * lowest);
  return Math.min(HIGHEST_JUMP, Math.max(LOWEST_JUMP + travel * 0.06, needed));
}

/** Whether an obstacle fills this lane. One without lanes goes right across. */
export const fills = (obstacle, lane) => (obstacle.lanes ?? LANES).includes(lane);
const freeLanes = (obstacle) => LANES.filter((lane) => !fills(obstacle, lane));

/**
 * Which lanes each obstacle fills: all three, two or one. With the lanes on, the free lane is often on
 * the other side from the last one. With them off, the runner is always in the middle, so every
 * obstacle fills the middle lane and still needs its jump.
 */
function layWidths(course, lanes, random, rules) {
  let lastFree = null;
  for (const obstacle of course) {
    obstacle.lanes = [...LANES];
    if (obstacle.kind === 'stream') continue;
    const roll = random();
    if (roll < rules.full) continue;
    const width = roll < rules.full + rules.single ? 1 : 2;
    if (!lanes) {
      obstacle.lanes = width === 1 ? [0] : random() < 0.5 ? [-1, 0] : [0, 1];
      continue;
    }
    const pick = (options) => options[Math.floor(random() * options.length)];
    if (lastFree === null) lastFree = pick(LANES);
    // Whether the lane that was free last time is filled this time, so it's a step across.
    const switching = random() < rules.freeSwitch;
    obstacle.switched = switching;
    if (width === 2) {
      // The one free lane: across from the last free lane when it switches, and the same one if not.
      const free = !switching ? lastFree : lastFree === 0 ? pick([-1, 1]) : -lastFree;
      obstacle.lanes = LANES.filter((lane) => lane !== free);
      lastFree = free;
    } else {
      // The one lane filled: the lane that was free last time when it switches, and another if not.
      const filled = switching ? lastFree : pick(LANES.filter((lane) => lane !== lastFree));
      obstacle.lanes = [filled];
      lastFree = switching ? (filled === 0 ? pick([-1, 1]) : -filled) : lastFree;
    }
  }
}

/**
 * A line of stars to run through at the start, and another after each obstacle. The first is in the
 * middle lane, where the runner starts. After that, each is often in a different lane from the one
 * before, so there's a reason to move across, but never more than one lane's step away. A line before
 * an obstacle that leaves a lane free leads towards that lane, and stars often wait in it beside the
 * obstacle. On later levels a golden star over an obstacle is on that path too, and a line can cross
 * a lane halfway.
 */
function layStarLines(course, speed, lanes, random, rules) {
  const lines = [];
  let lane = 0;
  let crossed = false;
  let golden = false;
  const nextTo = () => {
    const options = LANES.filter((other) => Math.abs(other - lane) === 1);
    return options[Math.floor(random() * options.length)];
  };
  const lineFrom = (from, straight = false) => {
    // Once a level has lines that cross a lane, the first that can always does, so a short trail has one.
    const crosses = !straight && lanes && rules.zigzag > 0 && (random() < rules.zigzag || !crossed);
    if (crosses) crossed = true;
    const half = Math.ceil(STAR_LINE.count / 2);
    for (let i = 0; i < STAR_LINE.count; i += 1) {
      if (crosses && i === half) lane = nextTo();
      lines.push({ at: from + i * STAR_LINE.spacing, lane, taken: false, ...(crosses ? { crosses: true } : {}) });
    }
  };
  /** Before an obstacle that leaves a lane free: a step towards the nearest free lane. */
  const leadTowards = (obstacle) => {
    if (!lanes || !obstacle || obstacle.lanes.length === LANES.length) return false;
    const open = freeLanes(obstacle);
    if (!open.includes(lane)) {
      const nearest = open.reduce((best, other) => (Math.abs(other - lane) < Math.abs(best - lane) ? other : best));
      lane += Math.sign(nearest - lane);
    }
    return true;
  };
  lineFrom(speed * STAR_LINE.firstAfter, leadTowards(course[0]));
  course.forEach((obstacle, index) => {
    // Golden stars come by chance, and if chance hasn't brought one by the second obstacle, it has one.
    if (rules.gold > 0 && (random() < rules.gold || (!golden && index >= sureIndex(course)))) {
      // Over a lane the obstacle fills, in the lane the stars were in or one step from it.
      const near = lanes ? obstacle.lanes.filter((other) => Math.abs(other - lane) <= 1) : obstacle.lanes.filter((other) => other === 0);
      if (near.length) {
        lane = near[Math.floor(random() * near.length)];
        obstacle.gold = { lane, taken: false, missed: false };
        golden = true;
      }
    }
    const open = freeLanes(obstacle);
    if (!obstacle.gold && lanes && open.includes(lane) && random() < rules.freeStars) {
      // Stars beside the obstacle, in the free lane, for stepping round it.
      for (const at of [obstacle.at - 5, obstacle.at + obstacle.length / 2, obstacle.at + obstacle.length + 4]) lines.push({ at, lane, taken: false, beside: true });
    }
    if (index === course.length - 1) return;
    const leading = leadTowards(course[index + 1]);
    if (!leading && lanes && random() < rules.laneMoves) lane = nextTo();
    lineFrom(obstacle.at + obstacle.length + speed * STAR_LINE.afterObstacle, leading);
  });
  return lines.sort((a, b) => a.at - b.at);
}

/**
 * What later levels add to a trail that's already laid out: trampolines, power-ups, keys and chests.
 * It's done afterwards, so the obstacles and the stars are just where they'd be without them. Each goes
 * on the way the stars go, so following the stars never asks for more than a step at a time.
 */
function layExtras(course, starLines, lanes, random, rules) {
  const lined = starLines.filter(({ beside }) => !beside);
  const starBefore = (at) => lined.filter((star) => star.at < at).at(-1) ?? null;
  const starAfter = (at) => lined.find((star) => star.at > at) ?? null;
  // The line of stars after an obstacle, up to the next one.
  const lineAfter = (index) => {
    const from = course[index].at + course[index].length;
    const to = course[index + 1]?.at ?? Infinity;
    return lined.filter(({ at }) => at > from && at < to);
  };

  if (rules.spring > 0) {
    // Not where stars wait beside it in a free lane, as those are for going round.
    const besideStars = (obstacle) => !obstacle.gold && starLines.some(({ beside, at }) => beside && at >= obstacle.at - 6 && at <= obstacle.at + obstacle.length + 5);
    const putSpring = (obstacle) => {
      // Under a golden star, it's in that star's lane, so one bounce catches both.
      if (obstacle.gold) {
        obstacle.spring = { lane: obstacle.gold.lane, used: false, missed: false, gem: rules.gems };
        return;
      }
      const before = starBefore(obstacle.at)?.lane ?? 0;
      const after = starAfter(obstacle.at + obstacle.length)?.lane ?? before;
      const options = obstacle.lanes.filter((lane) => (lanes || lane === 0) && Math.abs(lane - before) <= 1 && Math.abs(lane - after) <= 1);
      if (!options.length) return;
      const lane = options.includes(before) ? before : options[0];
      obstacle.spring = { lane, used: false, missed: false, gem: rules.gems };
    };
    for (const obstacle of course) {
      if (besideStars(obstacle) || random() >= rules.spring) continue;
      putSpring(obstacle);
    }
    // Chance may not bring one on a short trail, and then the first from the second obstacle on that can have one does.
    for (const obstacle of course.slice(sureIndex(course))) {
      if (course.some(({ spring }) => spring)) break;
      if (!besideStars(obstacle)) putSpring(obstacle);
    }
  }

  const pickups = [];
  const chests = [];
  const used = new Set();
  /** Halfway between the second and third stars of a line, in the second one's lane. */
  const onLine = (index) => {
    const line = lineAfter(index);
    if (line.length < 3) return null;
    return { at: (line[1].at + line[2].at) / 2, lane: line[1].lane };
  };
  if (rules.keyEvery > 0) {
    for (let index = 3; index < course.length; index += rules.keyEvery) {
      const chestAt = index + 3;
      const spot = onLine(index);
      const chestLine = chestAt < course.length ? lineAfter(chestAt) : [];
      if (!spot || chestLine.length < 4) continue;
      pickups.push({ kind: 'key', ...spot, taken: false, missed: false });
      // Beside the trail, on the other side from the stars, so it never gets in the way.
      const side = chestLine[3].lane > 0 ? -1 : chestLine[3].lane < 0 ? 1 : random() < 0.5 ? -1 : 1;
      chests.push({ at: chestLine[3].at, side, opened: false, missed: false });
      used.add(index);
    }
  }
  if (rules.powerEvery > 0 && rules.powers.length) {
    // The newest kind comes first, so a new level shows what it brings early on, then they take turns.
    let turn = rules.powers.length - 1;
    for (let index = 2; index < course.length; index += rules.powerEvery) {
      const at = used.has(index) ? index + 1 : index;
      const spot = at < course.length ? onLine(at) : null;
      if (!spot) continue;
      const kind = rules.powers[turn % rules.powers.length];
      turn += 1;
      pickups.push({ kind, ...spot, lane: POWERS[kind].anyLane ? null : spot.lane, taken: false, missed: false });
    }
  }
  return { pickups: pickups.sort((a, b) => a.at - b.at), chests };
}

/**
 * Lays out a trail, at a level. Exported so the tests can look at one. whenMissed is the runner's, as a
 * power-up with nothing to do with these settings isn't laid: see powersFor.
 */
export function layCourse({ obstacles, pace, lanes = true, whenMissed = 'stumble', random = Math.random, levelNumber = 1, friends = false, gentle = false }) {
  // With friends, everyone's trail is laid the same, so it's always the trail as it comes.
  const kind = { gentle: gentle && !friends };
  const rules = friends ? withFriends(trailLevel(levelNumber)) : trailLevel(levelNumber, kind);
  const { speed, every } = paceAt(pace, levelNumber, kind);
  const course = [];
  let at = speed * FIRST_OBSTACLE_SECONDS;
  for (let i = 0; i < obstacles; i += 1) {
    const kind = rules.kinds[Math.floor(random() * rules.kinds.length)];
    const { needs, length, height } = OBSTACLES[kind];
    course.push({ index: i, kind, needs, length, height, at, state: 'ahead' });
    at += length + speed * between(random, every);
  }
  // A new kind of obstacle always comes at its level: if chance hasn't brought one, the second obstacle
  // is one, and everything after it moves along by the difference in length.
  for (const kind of rules.kinds.filter((one) => OBSTACLES[one].from === clampLevel(levelNumber))) {
    if (!course.length || course.some((obstacle) => obstacle.kind === kind)) continue;
    const swapped = course[sureIndex(course)];
    const { needs, length, height } = OBSTACLES[kind];
    const longer = length - swapped.length;
    Object.assign(swapped, { kind, needs, length, height });
    for (const later of course.slice(swapped.index + 1)) later.at += longer;
    at += longer;
  }
  const end = at - speed * between(random, every) + speed * AFTER_LAST_SECONDS;
  layWidths(course, lanes, random, rules);
  const starLines = layStarLines(course, speed, lanes, random, rules);
  starLines.forEach((star, index) => {
    star.index = index;
  });
  return { course, starLines, end, ...layExtras(course, starLines, lanes, random, { ...rules, powers: powersFor(rules, { lanes, whenMissed }) }) };
}

const emptyStats = () => ({
  jumps: 0,
  cleared: 0,
  bumps: 0,
  stars: 0,
  linedStars: 0,
  gold: 0,
  stepped: 0, // Obstacles passed by stepping into a free lane, which counts as clearing them.
  coins: 0, // From level 2: one for each obstacle cleared, and more from chests and gems.
  bounces: 0, // Jumps from a trampoline, through its arch of stars.
  gems: 0,
  keys: 0,
  chests: 0,
  powers: 0, // Power-ups picked up.
  floated: 0, // Obstacles a bubble shield floated the runner over.
  friendStars: 0, // Stars a friend caught, alongside.
  laneMoves: 0,
  streak: 0,
  bestStreak: 0,
  seconds: 0,
  movingSeconds: 0,
  hands: { open: 0 },
});

export class Run {
  /**
   * obstacles is how many there are, pace is one of PACES. lanes says whether the lines of stars
   * move between lanes, or all stay in the middle. whenMissed is 'wait' to stop and wait for the
   * move, or 'stumble' to run into it. levelNumber is the level, from 1 to 10: see trailLevel. friends is
   * running with friends, on a trail from their shared random, where a star reached is asked for: see
   * settleStar. gentle is the gentle trail, the game as it was: no hearts, and the levels' old pace.
   */
  constructor({
    obstacles = 20,
    pace = 'slow',
    lanes = true,
    whenMissed = 'wait',
    levelNumber = 1,
    random = Math.random,
    friends = false,
    gentle = false,
    onEvent = () => {},
  } = {}) {
    this.levelNumber = levelNumber;
    this.friends = friends;
    // Running together with friends, how much of the trail's pace this runner runs at: see packPace.
    this.pack = 1;
    const kind = { gentle: gentle && !friends };
    this.levelRules = friends ? withFriends(trailLevel(levelNumber)) : trailLevel(levelNumber, kind);
    this.settings = paceAt(pace, levelNumber, kind);
    this.whenMissed = whenMissed;
    this.onEvent = onEvent;
    // Hearts left, or null when a run can't be lost: gentle, with friends, or waiting for every move.
    this.hearts = whenMissed === 'stumble' ? this.levelRules.hearts : null;
    this.lost = false; // Whether the hearts ran out before the finish.
    const { course, starLines, end, pickups, chests } = layCourse({ obstacles, pace, lanes, whenMissed, random, levelNumber, friends, gentle });
    this.course = course;
    this.starLines = starLines;
    this.pickups = pickups; // Power-ups and keys, on the line of stars.
    this.chests = chests; // Beside the trail: one opens if there's a key to open it.
    this.nextPickup = 0;
    this.power = Object.fromEntries(Object.keys(POWERS).map((kind) => [kind, 0])); // Seconds left of each.
    this.keys = 0; // Keys carried, for the next chest.
    this.nextStar = 0;
    this.lane = 0; // Which of LANES the runner is in.
    this.end = end;
    this.distance = 0;
    this.speed = 0;
    this.time = 0;
    this.state = 'ready'; // ready, running, finished
    this.move = null; // What the fighter is doing: { kind, startedAt, lasts, height }.
    this.stumbleLeft = 0;
    this.waiting = false;
    this.idleSeconds = 0;
    this.stats = emptyStats();
    this.announced = null;
  }

  emit(type, details = {}) {
    this.onEvent({ type, ...details });
  }

  begin() {
    this.state = 'running';
    this.emit('begin');
  }

  /** The next obstacle not yet dealt with, if any. */
  get next() {
    return this.course.find(({ state }) => state === 'ahead') ?? null;
  }

  /** How far ahead an obstacle's near edge is. */
  gapTo(obstacle) {
    return obstacle.at - this.distance;
  }

  /** Whether this obstacle is in the runner's lane, so it has to be jumped rather than gone round. */
  blocks(obstacle) {
    return obstacle !== null && fills(obstacle, this.lane);
  }

  /** Whether a jump is wanted right now: the next obstacle is close and in the runner's lane. */
  get mustJump() {
    const { next } = this;
    return Boolean(next) && next.state === 'ahead' && this.inReach(next) && this.blocks(next);
  }

  /** Whether a move right now would count for this obstacle. */
  inReach(obstacle) {
    return obstacle !== null && this.gapTo(obstacle) <= this.reachDistance;
  }

  /** How long before an obstacle a move counts, in metres. */
  get reachDistance() {
    return this.settings.speed * this.settings.early;
  }

  get resting() {
    return this.idleSeconds > REST_AFTER;
  }

  /** The child moved. The fighter only stops and waits for a child who has stopped. */
  noteActivity(dt = 0) {
    this.idleSeconds = 0;
    this.stats.movingSeconds += dt;
  }

  /** The child jumped. details can say how: { hand: 'open' } for a raised open hand. */
  jump({ hand = null } = {}) {
    if (this.state !== 'running') return false;
    this.noteActivity();
    if (this.floating) return this.ownJump(hand);
    if (this.move?.obstacle) return false; // Already on the way over something.
    this.stats.jumps += 1;
    if (hand === 'open') this.stats.hands.open += 1;
    return this.startMove('jump');
  }

  /** Whether a bubble has started to float the runner over something, and hasn't reached it yet. */
  get floating() {
    return Boolean(this.move?.float && !this.move.popped);
  }

  /**
   * A jump just as the bubble starts to float the runner over: it was still in time, so it's the child's
   * own jump that clears it, and the bubble is kept for the next thing.
   */
  ownJump(hand) {
    const { move } = this;
    move.float = false;
    this.stats.jumps += 1;
    if (hand === 'open') this.stats.hands.open += 1;
    this.emit('move', { kind: 'jump', counts: true, lasts: move.lasts, height: move.height, bounce: false, float: false });
    return true;
  }

  /** The child moved across into a lane, which is one of LANES. That's always allowed, even mid-jump. */
  setLane(lane) {
    if (!LANES.includes(lane) || lane === this.lane) return;
    const from = this.lane;
    this.lane = lane;
    if (this.state !== 'running') return;
    this.noteActivity();
    this.stats.laneMoves += 1;
    this.emit('lane', { lane, from });
  }

  /**
   * Starts the fighter's move. If an obstacle wanting this move is close enough, the move lasts
   * until the fighter is past it, so it clears whenever it was started, even from a standstill.
   * Otherwise it's a short one for the fun of it, and costs nothing. Doing a move while one's
   * going starts it over.
   */
  startMove(kind, { float = false } = {}) {
    const obstacle = this.next;
    const counts = obstacle && obstacle.needs === kind && this.inReach(obstacle);
    const move = { kind, startedAt: this.time, from: this.distance, lasts: SHORTEST_HOP, travel: null, height: LOWEST_JUMP, obstacle: null };
    if (counts) {
      // Never from past its near edge, as a bubble can start to float the runner over from just there:
      // the move always goes forward, and always lands.
      const gap = Math.max(0, this.gapTo(obstacle));
      const reach = gap + obstacle.length;
      move.travel = reach * FLIGHT_PAST + 0.3;
      move.height = jumpHeight(obstacle, gap, move.travel);
      move.obstacle = obstacle;
      move.pace = Math.max(this.settings.speed, move.travel / LONGEST_MOVE);
      move.lasts = move.travel / move.pace;
      const { spring } = obstacle;
      if (spring && kind === 'jump' && !float && spring.lane === this.lane) {
        // From the trampoline: the same jump, only higher, through the arch of stars.
        spring.used = true;
        move.bounce = true;
        move.height = Math.min(BOUNCE_TOP, Math.max(move.height * BOUNCE, move.height + 1));
      } else if (spring) spring.missed = true;
      if (float) move.float = true;
      // Everything's now decided, so a slow moment on this computer can't turn it into a bump.
      obstacle.state = 'passing';
      this.speed = Math.max(this.speed, move.pace * 0.9);
    } else if (obstacle && this.inReach(obstacle)) {
      this.emit('wrong-move', { kind, needs: obstacle.needs });
    }
    this.move = move;
    if (counts) this.waiting = false;
    this.emit('move', { kind, counts: Boolean(counts), lasts: move.lasts, height: move.height, bounce: Boolean(move.bounce), float });
    return Boolean(counts);
  }

  clear(obstacle) {
    const { stats } = this;
    obstacle.state = 'cleared';
    stats.cleared += 1;
    stats.streak += 1;
    stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
    stats.stars += STARS_FOR_CLEARING;
    const coin = this.levelRules.coins;
    if (coin) stats.coins += 1;
    this.emit('cleared', { obstacle, streak: stats.streak, stars: stats.stars, coin });
    if (obstacle.gold) this.reachGold(obstacle);
    if (obstacle.spring?.used) this.bounced(obstacle);
  }

  /** Over the middle of an obstacle, bounced from its trampoline: the arch of stars, and a gem at its top. */
  bounced(obstacle) {
    const { stats } = this;
    stats.bounces += 1;
    stats.stars += ARCH_STARS;
    if (obstacle.spring.gem) {
      stats.gems += 1;
      stats.coins += GEM_COINS;
    }
    this.emit('bounce', { obstacle, gem: obstacle.spring.gem });
  }

  /** Over the middle of an obstacle with a golden star: it's caught in its own lane, and only there. */
  reachGold(obstacle) {
    const { gold } = obstacle;
    if (gold.lane !== this.lane) {
      gold.missed = true;
      return;
    }
    gold.taken = true;
    this.stats.gold += 1;
    this.stats.stars += GOLD_STARS;
    this.emit('gold', { obstacle, stars: this.stats.stars });
  }

  /** Gone round, in a free lane: that clears it, as a jump would. */
  passBy(obstacle) {
    obstacle.state = 'passing';
    if (obstacle.spring) obstacle.spring.missed = true;
    obstacle.steppedRound = true;
    this.stats.stepped += 1;
    this.emit('passed-by', { obstacle });
  }

  bump(obstacle) {
    const { stats } = this;
    obstacle.state = 'bumped';
    if (obstacle.gold) obstacle.gold.missed = true;
    if (obstacle.spring) obstacle.spring.missed = true;
    stats.bumps += 1;
    stats.streak = 0;
    this.stumbleLeft = STUMBLE_SECONDS;
    if (this.hearts !== null) this.hearts = Math.max(0, this.hearts - 1);
    this.emit('bump', { obstacle, hearts: this.hearts });
  }

  /** How far through its move the fighter is, from 0 to 1. */
  get through() {
    const { move } = this;
    if (!move) return 0;
    const share = move.travel ? (this.distance - move.from) / move.travel : (this.time - move.startedAt) / move.lasts;
    return Math.min(1, share);
  }

  /** How high the fighter is off the ground, and how far through its jump, right now. */
  get air() {
    if (this.move?.kind !== 'jump') return { height: 0, through: 0 };
    const { through } = this;
    return { height: this.move.height * 4 * through * (1 - through), through };
  }

  wantedSpeed(next) {
    const { speed } = this.settings;
    if (this.move?.obstacle) return this.move.pace;
    if (this.stumbleLeft > 0) return speed * STUMBLE_SPEED;
    if (this.resting && !this.move) return 0;
    // A move that wasn't what was wanted doesn't carry the runner into what it's waiting at. Only
    // something in the runner's lane is waited at: one with a free lane can be gone round.
    if (this.whenMissed === 'wait' && next && !this.move?.obstacle && this.blocks(next)) {
      const left = this.gapTo(next) - STOP_GAP;
      const stoppingFrom = speed * 0.9;
      if (left <= 0) return 0;
      // Easing off for the pack, it comes up to it no faster than it was going.
      if (left < stoppingFrom) return Math.min(speed * this.pack, speed * (left / stoppingFrom) * 0.9 + 0.3);
    }
    return speed * this.pack;
  }

  /** Running through a star in the same lane picks it up, whatever the runner is doing. */
  collectStars() {
    const { starLines, stats } = this;
    while (this.nextStar < starLines.length && this.distance >= starLines[this.nextStar].at) {
      const star = starLines[this.nextStar];
      this.nextStar += 1;
      // A magnet pulls them in from the other lanes.
      if (star.lane !== this.lane && !(this.power.magnet > 0)) {
        star.missed = true;
        continue;
      }
      // With friends, one a friend got to first is gone, and one reached is asked for.
      if (this.friends) {
        if (star.gone) continue;
        star.asked = true;
        this.emit('star-asked', { star });
        continue;
      }
      this.takeStar(star);
    }
  }

  takeStar(star) {
    const { stats } = this;
    star.taken = true;
    star.pulled = star.lane !== this.lane;
    stats.linedStars += 1;
    const friend = this.power.friend > 0;
    if (friend) stats.friendStars += 1;
    this.emit('star-line', { star, pulled: star.pulled, friend });
  }

  /** With friends: whose star this is, as the server says. Theirs, and it's gone from the trail. */
  settleStar(index, mine) {
    const star = this.starLines[index];
    if (!star || star.taken || star.gone) return;
    if (mine) this.takeStar(star);
    else {
      star.gone = true;
      this.emit('star-gone', { star });
    }
  }

  /** Running through a power-up or a key in its lane picks it up. A friend just joins. */
  collectPickups() {
    const { pickups, stats } = this;
    while (this.nextPickup < pickups.length && this.distance >= pickups[this.nextPickup].at) {
      const pickup = pickups[this.nextPickup];
      this.nextPickup += 1;
      if (pickup.lane !== null && pickup.lane !== this.lane) {
        pickup.missed = true;
        continue;
      }
      pickup.taken = true;
      if (pickup.kind === 'key') {
        this.keys += 1;
        stats.keys += 1;
        this.emit('key', { pickup });
        continue;
      }
      this.power[pickup.kind] = POWERS[pickup.kind].seconds;
      stats.powers += 1;
      this.emit('power', { kind: pickup.kind, pickup, seconds: POWERS[pickup.kind].seconds });
    }
    for (const chest of this.chests) {
      if (chest.opened || chest.missed || this.distance < chest.at - CHEST_OPENS_BEFORE) continue;
      if (this.keys > 0) {
        this.keys -= 1;
        chest.opened = true;
        stats.chests += 1;
        stats.coins += CHEST_COINS;
        this.emit('chest', { chest, coins: CHEST_COINS });
      } else chest.missed = true;
    }
  }

  /**
   * Power-ups only run down while the runner is going, so stopping to rest, or to wait for a move,
   * never uses them up.
   */
  runDownPowers(dt) {
    if (this.speed <= 0.05) return;
    for (const kind of Object.keys(this.power)) {
      // A bubble on its way over something is kept until it gets there.
      if (this.power[kind] <= 0 || (kind === 'shield' && this.floating)) continue;
      this.power[kind] = Math.max(0, this.power[kind] - dt);
      if (this.power[kind] === 0) this.emit('power-end', { kind });
    }
  }

  /**
   * A bubble shield starts to float the runner over what it was about to run into, keeping the streak.
   * It isn't used up until the runner gets there, so a jump in that moment is still the child's own.
   */
  floatOver() {
    this.startMove('jump', { float: true });
  }

  /** The bubble reaches what it's floating the runner over, and pops. */
  popBubble() {
    this.move.popped = true;
    this.power.shield = 0;
    this.stats.floated += 1;
    this.emit('power-end', { kind: 'shield', used: true });
  }

  /** The total of stars, every kind, as the top of the screen shows it. */
  get starTotal() {
    const { stats } = this;
    return stats.stars + stats.linedStars + stats.friendStars;
  }

  update(dt) {
    if (this.state !== 'running' && this.state !== 'finished') return;
    this.time += dt;
    if (this.state === 'finished') {
      this.speed = Math.max(0, this.speed - dt * this.settings.speed * 0.8);
      this.distance += this.speed * dt;
      return;
    }
    const { stats } = this;
    stats.seconds += dt;
    this.idleSeconds += dt;

    if (this.stumbleLeft > 0) this.stumbleLeft = Math.max(0, this.stumbleLeft - dt);

    const next = this.next;
    const wanted = this.wantedSpeed(next);
    const rate = wanted < this.speed ? SPEED_CHANGE * 2 : SPEED_CHANGE;
    this.speed += (wanted - this.speed) * Math.min(1, dt * rate);
    if (wanted === 0 && this.speed < 0.08) this.speed = 0;
    this.distance += this.speed * dt;
    this.collectStars();
    this.collectPickups();
    this.runDownPowers(dt);
    if (this.floating && this.distance >= this.move.obstacle.at) this.popBubble();

    if (this.move && this.through >= 1) {
      const finished = this.move;
      this.move = null;
      this.emit('landed', { kind: finished.kind });
    }

    for (const obstacle of this.course) {
      if (obstacle.state === 'passing' && this.distance >= obstacle.at + obstacle.length * 0.5) this.clear(obstacle);
    }

    if (next && next.state === 'ahead') {
      // Time to ask for the move, once it would count.
      if (this.announced !== next.index && this.inReach(next) && this.blocks(next)) {
        this.announced = next.index;
        this.emit('ask', { needs: next.needs, obstacle: next });
      }
      const isWaiting = this.speed === 0 && this.gapTo(next) <= STOP_GAP + 0.2 && !this.move?.obstacle && this.blocks(next);
      if (isWaiting !== this.waiting) {
        this.waiting = isWaiting;
        if (isWaiting) this.emit('waiting', { needs: next.needs, obstacle: next });
      }
      if (this.power.shield > 0 && this.whenMissed === 'stumble' && !this.move?.obstacle && this.blocks(next)
        && this.gapTo(next) <= this.settings.speed * SHIELD_SECONDS_BEFORE) this.floatOver();
      if (next.state === 'ahead' && this.gapTo(next) <= 0) {
        if (!this.blocks(next)) this.passBy(next);
        else if (this.whenMissed === 'wait') {
          // Stepped into its lane at the last moment: it waits right here, rather than running into it.
          this.distance = next.at - 0.01;
          this.speed = 0;
        } else this.bump(next);
      }
    }

    // The last heart gone, the run is over there: the runner stumbles and slows to a stop.
    if (this.hearts === 0) {
      this.lost = true;
      this.state = 'finished';
      this.move = null;
      this.emit('finished', { stats, lost: true });
      return;
    }
    if (this.distance >= this.end) {
      this.state = 'finished';
      this.move = null;
      this.emit('finished', { stats, lost: false });
    }
  }
}
