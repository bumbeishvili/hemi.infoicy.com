// The rules of the race, with no screen or camera in them, so they can be tested on their own.
//
// The one rule underneath everything: only a hand that's really open counts. `drive` comes from
// core/hands.js and is 0 for a hand that's closed, missing, out of frame or can't be read, so
// nothing here can reward any of those. Nobody can crash. By default the other cars race at their own
// pace and the first over the line wins, so a race can be lost (see RIVALS_RACE). On Gentle, the race as it
// was, the others stay close, wait for a child who's resting and ease off at the end, so nobody loses.
//
// The levels are at the bottom: see racePlan. Nothing about the car itself changes from level to level,
// and never its top speed, which is tied to how fast things go past.
import { ramp, stepsAt } from '../../core/levels.js';

export const TOP_SPEED = 26; // At this hand's widest. At its target `drive` is 0.8.
// Anything repeating along the road is spaced so that it goes past fewer than three times a second, even at
// the fastest the car can go. In metres.
export const KERB_STRIPE = 6.8; // One colour, so a red and a white together are twice this.
export const CHEVRON_SPACING = 13.6;
// How close cars get before they touch, from the size of the cars themselves.
export const CAR_LENGTH = 4.4;
export const CAR_WIDTH = 2.6;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// Turbo fills up by itself while the hand in play stays open, and once the meter is full it goes by itself
// for a few seconds, with flames and more speed. Then the meter fills again. Closing the hand pauses it:
// turbo stops while the hand is closed, and nothing is taken away. There's nothing else to learn.
export const TURBO = {
  fillSeconds: 4, // Of driving with the hand open.
  seconds: 3, // How long turbo lasts.
  growSeconds: 1.2, // The flames grow over this, and the car gets a little faster.
  bonus: 0.2,
  heldBonus: 0.1,
};

export const SLAP = {
  boostSeconds: 2.2,
  bonus: 0.3,
  kick: 4, // Metres a second added at once, so the slap is felt straight away.
};

const MOST_BONUS = 0.45;
export const FASTEST_SPEED = TOP_SPEED * (1 + MOST_BONUS);

/** The meter on screen: it fills while the hand is open, and when it's full that's turbo. */
export class TurboMeter {
  constructor() {
    this.reset();
  }

  reset() {
    this.level = 0;
    this.active = false;
    this.heldFor = 0;
    this.left = 0; // Seconds of turbo still to come.
    this.everFull = false; // Whether there's been turbo yet this race.
  }

  /** Turbo straight away, for its whole time, as when the car takes off. */
  burst() {
    this.left = TURBO.seconds;
    this.level = 1;
    this.active = true;
    this.heldFor = 0;
    this.everFull = true;
  }

  /** How far into turbo it is, from 0 to 1, for the size of the flames. */
  get grown() {
    return this.active ? clamp(this.heldFor / TURBO.growSeconds, 0, 1) : 0;
  }

  /** open is more than 0 while the hand in play counts as open. */
  update(open, dt) {
    if (!(open > 0)) {
      this.active = false;
      return;
    }
    if (this.left > 0) {
      this.active = true;
      this.heldFor += dt;
      this.left = Math.max(0, this.left - dt);
      this.level = this.left / TURBO.seconds;
      if (this.left === 0) {
        this.active = false;
        this.heldFor = 0;
      }
      return;
    }
    this.level = Math.min(1, this.level + dt / TURBO.fillSeconds);
    if (this.level >= 1) this.burst();
  }

  get bonus() {
    return this.active ? TURBO.bonus + TURBO.heldBonus * this.grown : 0;
  }
}

/**
 * Watches the hand that isn't in play for a fist and then an open hand. update() is true once, as the
 * hand opens after a fist. The fist has to be a real one, in view and readable: a hand cut off by the
 * edge, too far away, touching the other hand or lost doesn't count as one.
 */
export class FistAndOpen {
  constructor() {
    this.reset();
  }

  reset() {
    this.sawFist = false;
  }

  update(hand) {
    if (hand?.status === 'open') {
      const done = this.sawFist;
      this.sawFist = false;
      return done;
    }
    this.sawFist = hand?.status === 'closed' && hand.reason === 'closed';
    return false;
  }
}

/** How fast the car wants to go. A closed hand wants to go nowhere, whatever else is happening. */
export function wantedSpeed(drive, turboBonus = 0, boostLeft = 0) {
  if (!(drive > 0)) return 0;
  const boost = boostLeft > 0 ? SLAP.bonus * Math.min(1, boostLeft / 0.6) : 0;
  return drive * TOP_SPEED * (1 + Math.min(MOST_BONUS, turboBonus + boost));
}

// How far across the road the car has to be for a high five, in metres from the middle. Full lock
// is 10 cm or so of hand movement, and the car's place on the road follows the hand, so "medium"
// takes about half of that. Grown-ups choose under the gear icon.
export const REACH = { small: 1.4, medium: 2.6, big: 4 };
export const LEAST_REACH = 0.9;

/**
 * What happens as the car goes past a big hand. side is -1 for a hand on the left of the road and
 * 1 for one on the right, and lateral is the car's place across the road, with right positive.
 */
export function gateOutcome({ handOpen, lateral, side, reach }) {
  if (lateral * side < reach) return 'passed';
  return handOpen === true ? 'slap' : 'closed';
}

/**
 * What counts comes down for a child who's trying. Going past a big hand with the hand open but the
 * car too far away makes that side's reach a little smaller, so a side that's hard to reach doesn't
 * stay out of reach, and a slap takes it gently back up. A closed hand isn't trying, so it's left out.
 */
export class ReachEasing {
  constructor(base = REACH.medium) {
    this.base = base;
    this.ease = { '-1': 1, 1: 1 };
  }

  setBase(base) {
    this.base = base;
    this.ease = { '-1': 1, 1: 1 };
  }

  reachFor(side) {
    return Math.max(LEAST_REACH, this.base * this.ease[side]);
  }

  record(side, outcome, handOpen) {
    if (outcome === 'slap') this.ease[side] = Math.min(1, this.ease[side] + 0.1);
    else if (outcome === 'passed' && handOpen) this.ease[side] = Math.max(0.25, this.ease[side] - 0.18);
  }

  /**
   * A big hand gone past, judged at this side's own reach, whatever made it easier at the time. A slap that
   * only came with the closer-hands power-up doesn't take the reach back up, so nothing gets harder after it.
   */
  recordPass(side, lateral, handOpen) {
    this.record(side, gateOutcome({ handOpen, lateral, side, reach: this.reachFor(side) }), handOpen);
  }
}

// How the others race at level 1. Higher levels change these: see racePlan.
export const RIVAL_PACE = {
  gains: 4.5, // The fastest a car catches up with where it wants to be, in metres a second.
  leftBehindBy: 7, // How fast the player pulls away from them during a slap's boost.
  wishAhead: 0, // Metres further ahead than usual that each one likes to be.
  comesBackScale: 1, // How far behind one gets before it comes past again, as a share of usual.
};

// The other cars race at the child's pace, whatever that is, so that there's always someone to see and
// to pass. Each one wants to be a little way ahead, by an amount that changes slowly. A slap's boost leaves
// them behind for as long as it lasts, which is what makes it feel fast and is most of the overtaking. They
// come back afterwards, and one that's fallen right out of sight comes past again, to be passed again.
const FALLS_BACK_AT_MOST = 7;
const COMES_BACK_BY = 8; // How fast one that's out of sight comes past.
const WAITS_WITHIN = 45;
const STOPS_BEHIND = 7;

export function rivalSpeed({ gap, wish, playerSpeed, resting, rushing, comingBack, cruise, pace = RIVAL_PACE }) {
  if (resting) {
    // Everyone waits for a child who's resting. Those in front go on a little way and stop, still in
    // view, and those behind stop before they get there, so resting never costs a place.
    if (gap >= 0) return cruise * clamp(1 - gap / WAITS_WITHIN, 0, 1);
    return clamp((-gap - STOPS_BEHIND) * 1.2, 0, cruise);
  }
  if (comingBack) return playerSpeed + COMES_BACK_BY;
  if (rushing) return Math.max(0, playerSpeed - pace.leftBehindBy);
  return Math.max(0, playerSpeed + clamp((wish - gap) * 0.35, -FALLS_BACK_AT_MOST, pace.gains));
}

// Friends racing together, on the same side, stay in one convoy, as in Moto Mountain. A car more than ahead
// metres in front of the last of them eases off, down to slowest of its speed over the next slack metres, and
// one more than behind metres behind the first gets a tow, that much faster. Nobody is ever stopped by it.
export const CONVOY = { ahead: 60, slack: 40, slowest: 0.5, behind: 35, tow: 1.2 };

/**
 * How much of its own speed a car in a convoy goes at. mine is how far it has driven, and others how far each
 * friend who's still here has, in metres. With no friends left it's a car on its own.
 */
export function convoyPace(mine, others) {
  const far = others.filter(Number.isFinite);
  if (!far.length) return 1;
  const ahead = mine - Math.min(...far);
  if (ahead > CONVOY.ahead) return 1 - (1 - CONVOY.slowest) * clamp((ahead - CONVOY.ahead) / CONVOY.slack, 0, 1);
  if (Math.max(...far) - mine > CONVOY.behind) return CONVOY.tow;
  return 1;
}

// Racing to win, the default: each of the others drives at its own pace, whatever the child does, and the
// first car over the line wins. pace is the quickest one's speed, as a share of TOP_SPEED, at level 1 and at
// level 10: at level 1 a child keeping the hand only just open is quicker, with time to spare for rests, and at
// level 10 it takes a hand held wide open, turbo and the high fives to stay ahead. each is how quick each car
// is next to the quickest, and swing how much its pace goes up and down as it drives. The pace climbs slowly
// over the first levels and faster later on, by the power curve, so a child learning has longer to learn.
export const RIVALS_RACE = { pace: [0.6, 1.1], curve: 1.5, each: [1, 0.96, 0.93, 0.98, 0.95], swing: 0.03 };

/** How fast the quickest of the others drives at a level, racing to win, in metres a second. */
export function rivalCruiseAt(level) {
  const share = (clamp(Math.round(level), 1, 10) - 1) / 9;
  const [first, last] = RIVALS_RACE.pace;
  return (first + (last - first) * share ** RIVALS_RACE.curve) * TOP_SPEED;
}

/**
 * How fast one of the others drives when it's racing to win: its own pace, going a little up and down, and
 * never anything to do with how fast the child is going. index is which car it is, and cruise the quickest
 * one's pace at this level, from racePlan.
 */
export function ownPace({ cruise, index, time = 0, phase = 0 }) {
  const each = RIVALS_RACE.each[index] ?? RIVALS_RACE.each.at(-1);
  return cruise * each * (1 + RIVALS_RACE.swing * Math.sin(time * (0.17 + index * 0.04) + phase));
}

/** Whether two cars are touching. Each is { distance, lateral }. */
export function touching(a, b) {
  return Math.abs(a.distance - b.distance) < CAR_LENGTH && Math.abs(a.lateral - b.lateral) < CAR_WIDTH;
}

/* ---------- levels ---------- */

/** The big hands at level 1, on alternating sides: -1 is the left of the road and 1 the right. In metres along a lap. */
export const GATE_SPOTS = [
  [90, 1], [190, -1], [300, 1], [470, -1], [560, 1], [660, -1], [745, 1],
  [860, -1], [960, 1], [1060, -1], [1150, 1], [1250, -1], [1345, 1],
];

/** Ramps down the middle of the road at level 1. Taking one is up to the child, and it's always safe. */
export const RAMP_SPOTS = [610, 910, 1200];
export const SIDE_RAMP = 3.2; // How far over a ramp to one side of the road is, from the middle.

// The start of the lap as a slalom, from level 7: five big hands, left and right, each a little over 60 m
// from the last, through the village. That's as close as two on opposite sides ever get, which leaves at
// least 70% of the time to get across that the closest two at level 1 do (85 m).
const SLALOM = [[55, 1], [117, -1], [180, 1], [243, -1], [305, 1]];

/** Where the big hands are at a level, in order along the lap. */
export function gatesFor(level) {
  let spots = GATE_SPOTS.map(([along, side]) => [along, side]);
  const add = (from, spot) => {
    if (level >= from) spots.push(spot);
  };
  // From level 3, now and then two big hands in a row on the same side, 35 m apart.
  add(3, [995, 1]);
  add(5, [1380, 1]);
  add(6, [825, -1]);
  // From level 7, a slalom at the start of the lap.
  if (level >= 7) spots = [...SLALOM, ...spots.filter(([along]) => along > 320)];
  // From level 9, two on the left after the tunnel, and the farm's hand a little further on to leave room.
  if (level >= 9) {
    spots = spots.map(([along, side]) => [along === 470 ? 465 : along === 560 ? 565 : along, side]);
    spots.push([500, -1]);
  }
  return spots.sort((a, b) => a[0] - b[0]);
}

/** The ramps at a level: { along, lateral }, where lateral is 0 for the middle of the road. */
export function rampsFor(level) {
  const ramps = RAMP_SPOTS.map((along) => ({ along, lateral: 0 }));
  // From level 6, a ramp to one side, on the way over to a big hand: a jump straight into a high five.
  if (level >= 6) ramps.push({ along: 1310, lateral: SIDE_RAMP });
  if (level >= 9) ramps.push({ along: 712, lateral: SIDE_RAMP });
  return ramps.sort((a, b) => a.along - b.along);
}

/** How many times a lap the car has to go from one side of the road to the other, for the big hands. */
export function sideChanges(spots) {
  return spots.filter(([, side], index) => side !== spots[(index + 1) % spots.length][1]).length;
}

/** The closest two big hands on opposite sides get, in metres, going round and round the lap. */
export function closestAcross(spots, lapLength) {
  let closest = Infinity;
  spots.forEach(([along, side], index) => {
    const [nextAlong, nextSide] = spots[(index + 1) % spots.length];
    if (nextSide !== side) closest = Math.min(closest, ((nextAlong - along) % lapLength + lapLength) % lapLength);
  });
  return closest;
}

/* ---------- the stars, and what sits on their trails ---------- */

// Trails of stars lead over to each big hand, so following them gets you there. In metres.
export const STAR_TRAIL = { count: 6, spacing: 8.5, before: 12, edge: 3.6, fromSide: 1.2 };

/**
 * The trail of stars to the big hand at index in a list of [along, side], as { along, lateral } for each
 * star, nearest the start first. Two big hands close together have a shorter trail, which starts after the first.
 */
export function trailFor(gateSpots, index) {
  const [along, side] = gateSpots[index];
  const { spacing, before, edge, fromSide } = STAR_TRAIL;
  const from = index === 0 ? 0 : gateSpots[index - 1][1] * fromSide;
  const after = index === 0 ? -Infinity : gateSpots[index - 1][0] + 6;
  let count = STAR_TRAIL.count;
  while (count > 2 && along - before - (count - 1) * spacing < after) count -= 1;
  return Array.from({ length: count }, (_, i) => {
    const share = i / (count - 1);
    const eased = share * share * (3 - 2 * share);
    return { along: along - before - (count - 1 - i) * spacing, lateral: from + (side * edge - from) * eased };
  });
}

/** Every star at a level: the trails, less any over a ramp to one side, and an arc over each ramp. */
export function starSpots(gateSpots, ramps) {
  const spots = [];
  // A ramp to one side has its own stars, so a trail doesn't go through them.
  const overSideRamp = (along) => ramps.some((ramp) => ramp.lateral !== 0 && along > ramp.along - 4 && along < ramp.along + 30);
  gateSpots.forEach((_, index) => {
    for (const star of trailFor(gateSpots, index)) if (!overSideRamp(star.along)) spots.push({ ...star, lift: 0 });
  });
  // An arc of stars over each ramp, in the air where a jump goes.
  for (const ramp of ramps) {
    for (let i = 0; i < 5; i += 1) spots.push({ along: ramp.along + 7 + i * 5.2, lateral: ramp.lateral, lift: 0.5 + 1.6 * Math.sin((i / 4) * Math.PI) });
  }
  return spots;
}

/**
 * A spot on the trail to the big hand near gateAlong, halfway between two of its stars (gap 0 is between
 * the first and second), so whatever is put there is on the way and nothing extra to steer to.
 */
export function onTrail(gateSpots, gateAlong, gap) {
  const index = gateSpots.findIndex(([along]) => Math.abs(along - gateAlong) <= 6);
  if (index === -1) throw new Error(`No big hand near ${gateAlong}`);
  const trail = trailFor(gateSpots, index);
  if (gap + 1 >= trail.length) throw new Error(`The trail to ${gateAlong} is too short`);
  const [a, b] = [trail[gap], trail[gap + 1]];
  return { along: (a.along + b.along) / 2, lateral: (a.lateral + b.lateral) / 2 };
}

/* ---------- prizes ---------- */

// Coins spill out of a big hand that's slapped, and out of a car or the tractor that's passed, onto the road
// ahead, where the car is. They drift over towards it as it comes, so they're hard to miss, and missing one
// costs nothing. A gem from a balloon is worth five, and a treasure chest ten. In metres and seconds.
export const COINS = {
  perFive: 3,
  perPass: 2,
  perTractor: 3,
  // Each one is further on than the last by at least the spacing that keeps anything repeating along the
  // road going past fewer than three times a second, counting coins from everywhere that are still about.
  spacing: CHEVRON_SPACING + 0.4,
  firstAhead: 15,
  across: 3, // How far to the side of the car one is still picked up.
  along: 3.4,
  drift: 1.8, // How fast one moves over towards the car.
  gem: 5,
  chest: 10,
  highTen: 10,
  passAgainAfter: 8, // Seconds before passing the same car spills coins again.
};

// A treasure chest opens for a car that's this much of the way over that a big hand needs: it's on the verge,
// and a prize, so it's a little more generous.
export const CHEST_REACH = 0.8;

/**
 * Where spilled coins land: on the road ahead of a car at a distance and a place across the road. after is the
 * furthest on of any coins already on the road, from a slap, a car or the tractor a moment before, and these
 * land past it, so they still come one at a time however many spill out together.
 */
export function spillSpots(distance, lateral, count, after = -Infinity) {
  const first = Math.max(distance + COINS.firstAhead, after + COINS.spacing);
  return Array.from({ length: count }, (_, i) => ({ distance: first + i * COINS.spacing, lateral }));
}

/** Whether a prize on the road is picked up by the car. Within reach of the magnet, anything across the road is. */
export function picksUp(prize, car, magnet = false) {
  const across = magnet ? POWER.magnet.across : COINS.across;
  return Math.abs(prize.distance - car.distance) < COINS.along && Math.abs(prize.lateral - car.lateral) < across;
}

/* ---------- power-ups ---------- */

// Driven through, each lasts a few seconds of driving. Like turbo, resting pauses them and takes nothing away.
export const POWER = {
  // Pulls stars and coins in from anywhere across the road, a little way ahead.
  magnet: { seconds: 7, across: 12, ahead: 34 },
  // Other cars and the tractor bounce softly off it, and the child's car isn't pushed at all.
  bubble: { seconds: 8 },
  // The big hands come in closer: how far to reach is this much of what it was.
  wide: { seconds: 10, reach: 0.6 },
  // A rainbow behind the car, and each star counts twice.
  rainbow: { seconds: 8, starsEach: 2 },
};
export const POWER_KINDS = Object.keys(POWER);
export const POWER_REACH = { along: 3.6, across: 3.2 }; // How close to drive to one to pick it up.

/** Which power-ups are on and for how long. It runs down only while the hand in play is open. */
export class PowerUps {
  constructor() {
    this.reset();
  }

  reset() {
    this.left = Object.fromEntries(POWER_KINDS.map((kind) => [kind, 0]));
  }

  take(kind) {
    this.left[kind] = POWER[kind].seconds;
  }

  has(kind) {
    return this.left[kind] > 0;
  }

  /** How much is left, from 1 just taken to 0. */
  share(kind) {
    return this.left[kind] / POWER[kind].seconds;
  }

  /** Returns the kinds that have just run out. */
  update(open, dt) {
    if (!(open > 0)) return [];
    const ended = [];
    for (const kind of POWER_KINDS) {
      if (this.left[kind] <= 0) continue;
      this.left[kind] = Math.max(0, this.left[kind] - dt);
      if (this.left[kind] === 0) ended.push(kind);
    }
    return ended;
  }
}

/* ---------- levels ---------- */

/**
 * What each level brings that's new, in order, as shown on the title card, under the countdown and on the
 * finish card. mark is a small picture, and the Georgian names need a native speaker's check.
 */
export const NEW_THINGS = [
  { id: 'coins', from: 2, mark: '🪙', name: 'Coins', nameKa: 'მონეტები' },
  { id: 'magnet', from: 3, mark: '🧲', name: 'Magnet', nameKa: 'მაგნიტი' },
  { id: 'pair', from: 3, mark: '✋', name: 'Hand pairs', nameKa: 'ხელების წყვილი' },
  { id: 'tractor', from: 4, mark: '🚜', name: 'Tractor', nameKa: 'ტრაქტორი' },
  { id: 'car4', from: 4, mark: '🏎️', name: 'Another car', nameKa: 'კიდევ ერთი მანქანა' },
  { id: 'sunset', from: 5, mark: '🌇', name: 'Sunset', nameKa: 'მზის ჩასვლა' },
  { id: 'rivalTurbo', from: 5, mark: '🔥', name: 'Racers’ turbo', nameKa: 'მეტოქეების ტურბო' },
  { id: 'bubble', from: 6, mark: '🫧', name: 'Bubble shield', nameKa: 'ბუშტის ფარი' },
  { id: 'sideRamp', from: 6, mark: '🛹', name: 'Side ramp', nameKa: 'გვერდითი ტრამპლინი' },
  { id: 'balloon', from: 7, mark: '🎈', name: 'Balloon gems', nameKa: 'ბუშტის ძვირფასი ქვები' },
  { id: 'slalom', from: 7, mark: '〰️', name: 'Slalom', nameKa: 'სლალომი' },
  { id: 'chest', from: 8, mark: '🎁', name: 'Treasure chest', nameKa: 'განძის ყუთი' },
  { id: 'wide', from: 8, mark: '🖐️', name: 'Closer hands', nameKa: 'ახლო ხელები' },
  { id: 'car5', from: 8, mark: '🏎️', name: 'Another car', nameKa: 'კიდევ ერთი მანქანა' },
  { id: 'rain', from: 9, mark: '🌦️', name: 'Rain shower', nameKa: 'წვიმა' },
  { id: 'rainbow', from: 9, mark: '🌈', name: 'Rainbow trail', nameKa: 'ცისარტყელას კვალი' },
  { id: 'highTen', from: 10, mark: '🙌', name: 'High ten', nameKa: 'ორმაგი ხუთი' },
  { id: 'goldenLap', from: 10, mark: '⭐', name: 'Golden lap', nameKa: 'ოქროს წრე' },
];

/** What a level brings that's new, as [{ id, mark, name, nameKa }]. Level 1 is the race as it always was. */
export function newAt(level) {
  return NEW_THINGS.filter((thing) => thing.from === level).map(({ id, mark, name, nameKa }) => ({ id, mark, name, nameKa }));
}

// Where the things on the trails are: on the trail to the big hand near `gate`, in the gap after star `gap`.
const POWER_SPOTS = [
  { kind: 'magnet', from: 3, gate: 560, gap: 2 },
  { kind: 'magnet', from: 3, gate: 1150, gap: 2 },
  { kind: 'bubble', from: 6, gate: 1345, gap: 1 },
  { kind: 'wide', from: 8, gate: 55, gap: 3 },
  { kind: 'rainbow', from: 9, gate: 745, gap: 1 },
];
const BALLOON_SPOTS = [{ gate: 1060, gap: 3 }];
// A treasure chest at the roadside at the fair, on the way to the big hand after it, on the same side, and as
// far from the big hand before it, on the other side, as any two big hands on opposite sides ever are.
const CHEST_SPOTS = [{ along: 1135, side: 1 }];
// The tractor: slow, so it's passed. It comes out of the farm and trundles along its stretch on the shoulder of
// the road, out this far from the middle, on the side away from the next big hand. That's off the tarmac, so it's
// never in anyone's way and no car can touch it, wherever the child steers. It stops this far before the next
// big hand on its side, whose post is on the shoulder too. In metres and metres a second, and slows is how
// quickly it slows to a stop. The shower is over the lake.
export const TRACTOR = { speed: 8, length: 7.4, width: 2.7, out: 7.9, stopsBefore: 12, slows: 1.5 };
const TRACTOR_STRETCH = { from: 478, to: 660 };
const RAIN_STRETCH = { from: 540, to: 705 };
// The giant hands of the high ten stand this far before the finish line, on the last lap, so that they're the
// finish. The camera following the car is never much nearer them than it is to the car, as the race is over
// as soon as the car is through. Further back, the camera would come right up to them, and they're big enough
// that going past at speed they'd sweep across much of the picture at once.
export const HIGH_TEN_BEFORE_LINE = 2.5;

/**
 * Where a level's tractor goes: on the side of the road away from the next big hand after it comes out, and on
 * along its stretch until it's stopsBefore short of the first big hand on that side. Returns { side, from, to },
 * in metres along the lap, or null at a level without it.
 */
export function tractorRun(plan, lapLength) {
  if (!plan.tractor) return null;
  const { from, to } = plan.tractor;
  const ahead = (along) => (((along - from) % lapLength) + lapLength) % lapLength;
  const next = plan.gates.reduce((best, spot) => (ahead(spot[0]) < ahead(best[0]) ? spot : best));
  const side = -next[1];
  const post = Math.min(...plan.gates.filter(([, each]) => each === side).map(([along]) => ahead(along)));
  return { side, from, to: from + Math.max(0, Math.min(to - from, post - TRACTOR.stopsBefore)) };
}

/**
 * What each level changes, from level 1 (the race as it always was) to 10. The laps, how far to reach, the
 * steering help, the hand and how open it has to be are a grown-up's, and never change. Neither does the
 * car. On Gentle the others always ease off at the end so that the child wins; racing to win, they drive
 * faster level by level, from rivalCruise. Each level from 2 brings
 * something new, listed in NEW_THINGS, and keeps everything before it.
 */
export function racePlan(level) {
  const keen = ramp(level, 0, 1);
  const on = (id) => level >= NEW_THINGS.find((thing) => thing.id === id).from;
  const gates = gatesFor(level);
  const ramps = rampsFor(level);
  return {
    // More cars to race: a fourth from level 4, and a fifth from level 8.
    rivals: stepsAt(level, { 1: 3, 4: 4, 8: 5 }),
    // Racing to win, the quickest of the others drives this fast, in metres a second: see RIVALS_RACE.
    rivalCruise: rivalCruiseAt(level),
    // Level by level the others race harder: they like to be further ahead, catch up faster, keep up
    // better with a boost, and come back past sooner. They still ease off on the last stretch.
    rivalPace: {
      gains: RIVAL_PACE.gains + 1.5 * keen,
      leftBehindBy: RIVAL_PACE.leftBehindBy - 2 * keen,
      wishAhead: RIVAL_PACE.wishAhead + 6 * keen,
      comesBackScale: RIVAL_PACE.comesBackScale - 0.25 * keen,
    },
    // From level 5 they use turbo too, one at a time, every this many seconds, and the child passes back.
    rivalTurboEvery: stepsAt(level, { 1: Infinity, 5: 26, 9: 18 }),
    // More big hands, two in a row on one side from level 3, and a slalom from level 7.
    gates,
    slalom: on('slalom'),
    // A ramp to one side of the road from level 6, and another from level 9.
    ramps,
    // From level 2, coins spill out of each big hand slapped and each car passed.
    coins: on('coins'),
    // Power-ups on the trails of stars: a magnet from level 3, a bubble from 6, closer hands from 8 and a
    // rainbow from 9.
    powerUps: POWER_SPOTS.filter((spot) => level >= spot.from).map(({ kind, gate, gap }) => ({ kind, ...onTrail(gates, gate, gap) })),
    // From level 4 a tractor beside the farm's stretch of road, to pass.
    tractor: on('tractor') ? { ...TRACTOR_STRETCH } : null,
    // From level 5 the light goes golden over the race, from about a quarter of the way to over half.
    sunset: on('sunset'),
    // From level 7 a hot-air balloon lowers a gem onto a trail.
    balloons: on('balloon') ? BALLOON_SPOTS.map(({ gate, gap }) => onTrail(gates, gate, gap)) : [],
    // From level 8 a treasure chest at the roadside, opened by reaching over to it like a big hand.
    chests: on('chest') ? CHEST_SPOTS.map((spot) => ({ ...spot })) : [],
    // From level 9 a light shower over the lake, and a rainbow after it.
    rain: on('rain') ? { ...RAIN_STRETCH } : null,
    // At level 10, a giant high ten at the finish, and the last lap's stars are golden and count twice.
    highTen: on('highTen'),
    goldenLap: on('goldenLap'),
  };
}

export const RIVAL_TURBO = { seconds: 2.4, gain: 6 }; // How long a rival's turbo lasts, and how much faster it goes.
