import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CAR_WIDTH,
  CHEST_REACH,
  CHEVRON_SPACING,
  closestAcross,
  COINS,
  CONVOY,
  convoyPace,
  FASTEST_SPEED,
  FistAndOpen,
  GATE_SPOTS,
  gateOutcome,
  HIGH_TEN_BEFORE_LINE,
  NEW_THINGS,
  newAt,
  picksUp,
  POWER,
  POWER_KINDS,
  POWER_REACH,
  PowerUps,
  racePlan,
  RAMP_SPOTS,
  REACH,
  ReachEasing,
  RIVAL_PACE,
  RIVAL_TURBO,
  rivalSpeed,
  sideChanges,
  SLAP,
  spillSpots,
  starSpots,
  TOP_SPEED,
  TRACTOR,
  tractorRun,
  trailFor,
  TURBO,
  TurboMeter,
  ownPace,
  rivalCruiseAt,
  RIVALS_RACE,
  wantedSpeed,
} from '../../games/high-five-racers/rules.js';
import { LANE_LIMIT, LAP_LENGTH, PLACES, ROAD_HALF, START_BEHIND_LINE } from '../../games/high-five-racers/track.js';

const CAR_WIDTH_HALF = 1.3;

const open = { status: 'open', reason: null };
const fist = { status: 'closed', reason: 'closed' };
const cutOff = { status: 'closed', reason: 'edge' };
const touching = { status: 'closed', reason: 'overlap' };
const missing = { status: 'missing', reason: 'missing' };

const run = (watch, hands) => hands.map((hand) => watch.update(hand));

test('the other hand counts as it opens after a fist, each time', () => {
  const watch = new FistAndOpen();
  assert.deepEqual(run(watch, [fist, fist, open, open]), [false, false, true, false]);
  assert.deepEqual(run(watch, [fist, open]), [false, true], 'and again');
  assert.deepEqual(run(new FistAndOpen(), [open, open]), [false, false], 'an open hand alone does nothing');
});

test('a hand cut off, too far away, touching the other hand or lost is not a fist', () => {
  for (const notAFist of [cutOff, touching, missing, null, undefined]) {
    assert.deepEqual(run(new FistAndOpen(), [notAFist, open]), [false, false], String(notAFist?.reason));
    assert.deepEqual(run(new FistAndOpen(), [fist, notAFist, open]), [false, false, false], `fist then ${notAFist?.reason}`);
  }
});

const drive = (meter, open, seconds, step = 0.05) => {
  for (let t = 0; t < seconds - 1e-9; t += step) meter.update(open, step);
};

test('keeping the hand open fills the meter, and then turbo goes by itself for a set time', () => {
  const meter = new TurboMeter();
  drive(meter, 1, TURBO.fillSeconds / 2);
  assert.ok(Math.abs(meter.level - 0.5) < 0.02, `half full after half the time: ${meter.level}`);
  assert.equal(meter.active, false);
  drive(meter, 1, TURBO.fillSeconds / 2 + 0.06);
  assert.equal(meter.active, true, 'full, so turbo');
  assert.ok(meter.bonus >= TURBO.bonus);

  let seconds = 0;
  while (meter.active && seconds < 10) {
    meter.update(1, 0.05);
    seconds += 0.05;
  }
  assert.ok(Math.abs(seconds - TURBO.seconds) < 0.11, `lasted ${seconds.toFixed(2)} s`);
  assert.equal(meter.level, 0, 'then it fills again from empty');
  drive(meter, 1, TURBO.fillSeconds + 0.06);
  assert.equal(meter.active, true, 'and goes again');
});

test('a closed hand pauses the meter and turbo, and takes nothing away', () => {
  const meter = new TurboMeter();
  drive(meter, 1, TURBO.fillSeconds / 2);
  const filled = meter.level;
  drive(meter, 0, 5);
  assert.equal(meter.level, filled, 'resting keeps what was filled');
  drive(meter, 1, TURBO.fillSeconds / 2 + 0.06);
  assert.equal(meter.active, true);

  drive(meter, 1, 1);
  const left = meter.left;
  drive(meter, 0, 2);
  assert.equal(meter.active, false, 'no turbo with the hand closed');
  assert.equal(meter.bonus, 0);
  assert.equal(meter.left, left);
  meter.update(1, 0.05);
  assert.equal(meter.active, true, 'it carries on when the hand opens');
});

test('flying gives turbo straight away, for its whole time', () => {
  const meter = new TurboMeter();
  meter.burst();
  assert.equal(meter.active, true);
  assert.equal(meter.level, 1);
  assert.equal(meter.left, TURBO.seconds);
});

/* ---------- levels ---------- */

const LEVELS = Array.from({ length: 10 }, (_, index) => index + 1);
const wrap = (value) => ((value % LAP_LENGTH) + LAP_LENGTH) % LAP_LENGTH;
// Things a big hand mustn't stand in or right next to, as [from, to] along the lap.
const NO_HANDS = [
  [PLACES.tunnel[0] - 20, PLACES.tunnel[1] + 12],
  [PLACES.bridge[0] - 8, PLACES.bridge[1] + 12],
  ...[680, 1182, 1290].map((footbridge) => [footbridge - 8, footbridge + 8]),
  [-12, 12], // The start gantry.
];

/** Each thing that can get harder, as a number where bigger is harder. */
function hardness(level) {
  const plan = racePlan(level);
  return {
    rivals: plan.rivals,
    gains: plan.rivalPace.gains,
    keepsUp: -plan.rivalPace.leftBehindBy,
    wishAhead: plan.rivalPace.wishAhead,
    comesBack: -plan.rivalPace.comesBackScale,
    turbo: plan.rivalTurboEvery === Infinity ? 0 : 1 / plan.rivalTurboEvery,
    hands: plan.gates.length,
    sideChanges: sideChanges(plan.gates),
    ramps: plan.ramps.length,
    sideRamps: plan.ramps.filter(({ lateral }) => lateral !== 0).length,
    // What's new comes in level by level, and stays.
    kinds: NEW_THINGS.filter((thing) => thing.from <= level).length,
    powerUps: plan.powerUps.length,
    powerKinds: new Set(plan.powerUps.map(({ kind }) => kind)).size,
    balloons: plan.balloons.length,
    chests: plan.chests.length,
  };
}

test('level 1 is the race as it always was', () => {
  const plan = racePlan(1);
  assert.equal(plan.rivals, 3);
  assert.deepEqual(plan.rivalPace, RIVAL_PACE);
  assert.deepEqual(RIVAL_PACE, { gains: 4.5, leftBehindBy: 7, wishAhead: 0, comesBackScale: 1 });
  assert.equal(plan.rivalTurboEvery, Infinity);
  assert.deepEqual(plan.gates, [
    [90, 1], [190, -1], [300, 1], [470, -1], [560, 1], [660, -1], [745, 1],
    [860, -1], [960, 1], [1060, -1], [1150, 1], [1250, -1], [1345, 1],
  ]);
  assert.deepEqual(GATE_SPOTS, plan.gates);
  assert.deepEqual(plan.ramps, [{ along: 610, lateral: 0 }, { along: 910, lateral: 0 }, { along: 1200, lateral: 0 }]);
  assert.deepEqual(RAMP_SPOTS, [610, 910, 1200]);
  // With level 1's pace, the others race exactly as before.
  const cases = [
    { gap: 5, wish: 20, playerSpeed: 20, resting: false, rushing: false, cruise: 21 },
    { gap: 40, wish: 9, playerSpeed: 20, resting: false, rushing: false, cruise: 21 },
    { gap: -5, wish: 20, playerSpeed: 34, resting: false, rushing: true, cruise: 21 },
  ];
  assert.deepEqual(cases.map((each) => rivalSpeed(each)), [24.5, 13, 27]);
  assert.deepEqual(cases.map((each) => rivalSpeed({ ...each, pace: plan.rivalPace })), [24.5, 13, 27]);
  // None of what later levels bring.
  assert.equal(plan.coins, false);
  assert.deepEqual(plan.powerUps, []);
  assert.deepEqual(plan.balloons, []);
  assert.deepEqual(plan.chests, []);
  assert.equal(plan.tractor, null);
  assert.equal(plan.rain, null);
  assert.equal(plan.sunset || plan.highTen || plan.goldenLap || plan.slalom, false);
  assert.deepEqual(newAt(1), []);
});

/** The stars as pickups.js laid them out before they were worked out in rules.js, to check nothing moved. */
function starsAsTheyWere(gateSpots, ramps) {
  const stars = [];
  const add = (along, lateral, lift = 0) => stars.push({ along, lateral, lift });
  const overSideRamp = (along) => ramps.some((ramp) => ramp.lateral !== 0 && along > ramp.along - 4 && along < ramp.along + 30);
  gateSpots.forEach(([along, side], index) => {
    const fromSide = index === 0 ? 0 : gateSpots[index - 1][1] * 1.2;
    const after = index === 0 ? -Infinity : gateSpots[index - 1][0] + 6;
    let count = 6;
    while (count > 2 && along - 12 - (count - 1) * 8.5 < after) count -= 1;
    for (let i = 0; i < count; i += 1) {
      const share = i / (count - 1);
      const eased = share * share * (3 - 2 * share);
      const at = along - 12 - (count - 1 - i) * 8.5;
      if (!overSideRamp(at)) add(at, fromSide + (side * 3.6 - fromSide) * eased);
    }
  });
  for (const ramp of ramps) {
    for (let i = 0; i < 5; i += 1) add(ramp.along + 7 + i * 5.2, ramp.lateral, 0.5 + 1.6 * Math.sin((i / 4) * Math.PI));
  }
  return stars;
}

test('the stars are where they always were, at every level', () => {
  for (const level of LEVELS) {
    const { gates, ramps } = racePlan(level);
    assert.deepEqual(starSpots(gates, ramps), starsAsTheyWere(gates, ramps), `level ${level}`);
  }
});

/* ---------- what each level brings ---------- */

/** For each new thing, whether a level's plan really has it. */
const sameSideTwice = (spots) => spots.some(([, side], index) => index > 0 && spots[index - 1][1] === side);
const hasPower = (kind) => (plan) => plan.powerUps.some((each) => each.kind === kind);
const REALLY_ON = {
  coins: (plan) => plan.coins === true,
  magnet: hasPower('magnet'),
  pair: (plan) => sameSideTwice(plan.gates),
  tractor: (plan) => plan.tractor !== null,
  car4: (plan) => plan.rivals >= 4,
  sunset: (plan) => plan.sunset === true,
  rivalTurbo: (plan) => plan.rivalTurboEvery < Infinity,
  bubble: hasPower('bubble'),
  sideRamp: (plan) => plan.ramps.some(({ lateral }) => lateral !== 0),
  balloon: (plan) => plan.balloons.length > 0,
  slalom: (plan) => plan.slalom === true && plan.gates.slice(0, 5).every(([, side], index) => side === (index % 2 ? -1 : 1)),
  chest: (plan) => plan.chests.length > 0,
  wide: hasPower('wide'),
  car5: (plan) => plan.rivals >= 5,
  rain: (plan) => plan.rain !== null,
  rainbow: hasPower('rainbow'),
  highTen: (plan) => plan.highTen === true,
  goldenLap: (plan) => plan.goldenLap === true,
};

test('every level from 2 to 10 brings something new, and level 1 nothing', () => {
  assert.deepEqual(newAt(1), []);
  for (const level of LEVELS.slice(1)) {
    const news = newAt(level);
    assert.ok(news.length >= 1 && news.length <= 3, `level ${level} has ${news.length} new things`);
    for (const { id, mark, name, nameKa } of news) {
      assert.ok(typeof mark === 'string' && mark.length > 0 && mark.length <= 3, `${id}: one small picture`);
      assert.ok(name.split(' ').length <= 3, `${id}: "${name}" is a few words`);
      assert.ok(typeof nameKa === 'string' && nameKa.length > 1, `${id}: has a Georgian name`);
    }
  }
  assert.equal(new Set(NEW_THINGS.map(({ id }) => id)).size, NEW_THINGS.length);
});

test('each new thing listed is really there from its level on, and not before', () => {
  for (const { id, from } of NEW_THINGS) {
    const check = REALLY_ON[id];
    assert.ok(check, `${id} has a check`);
    assert.equal(check(racePlan(from - 1)), false, `${id} isn't at level ${from - 1}`);
    for (const level of LEVELS.filter((each) => each >= from)) assert.equal(check(racePlan(level)), true, `${id} at level ${level}`);
  }
  // Every kind of power-up is listed as new somewhere.
  for (const kind of POWER_KINDS) assert.ok(NEW_THINGS.some(({ id }) => id === kind), kind);
});

test('power-ups and balloons sit on the trails of stars, clear of each other and of the ramps', () => {
  for (const level of LEVELS) {
    const { gates, ramps, powerUps, balloons } = racePlan(level);
    const specials = [...powerUps, ...balloons];
    for (const { along, lateral } of specials) {
      // On the trail to the big hand after it: between two of its stars, and in the same place across.
      const index = gates.findIndex(([at]) => at > along);
      const trail = trailFor(gates, index);
      const before = trail.filter((star) => star.along < along).at(-1);
      const after = trail.find((star) => star.along > along);
      assert.ok(before && after, `level ${level}: ${along} is on a trail`);
      assert.ok(Math.abs(lateral - (before.lateral + after.lateral) / 2) < 1e-9);
      assert.ok(Math.abs(lateral) < LANE_LIMIT);
      for (const [from, to] of NO_HANDS) assert.ok(!(wrap(along - from) <= wrap(to - from)), `level ${level}: something at ${along}`);
      // Never on a ramp down the middle, or its arc of stars.
      for (const ramp of ramps) {
        if (ramp.lateral === 0) assert.ok(along < ramp.along - 4 || along > ramp.along + 30, `level ${level}: ${along} on a ramp`);
      }
    }
    specials.forEach((a, i) => specials.slice(i + 1).forEach((b) => assert.ok(Math.abs(a.along - b.along) >= 10, `level ${level}: ${a.along} and ${b.along}`)));
  }
});

test('a treasure chest is on the way to the big hand after it, and leaves as long to get across as the big hands do', () => {
  const first = closestAcross(racePlan(1).gates, LAP_LENGTH);
  for (const level of LEVELS) {
    const { gates, chests } = racePlan(level);
    for (const { along, side } of chests) {
      const next = gates.find(([at]) => at > along);
      assert.equal(next[1], side, `level ${level}: the big hand after the chest is on its side`);
      assert.ok(next[0] - along < 40);
      // Counting the chest as one more thing to reach for, it changes nothing about how often or how soon.
      const withChests = [...gates, [along, side]].sort((a, b) => a[0] - b[0]);
      assert.ok(closestAcross(withChests, LAP_LENGTH) >= 0.7 * first, `level ${level}`);
      assert.equal(sideChanges(withChests), sideChanges(gates));
    }
  }
});

test('a treasure chest asks for no more of a reach than the big hand after it', () => {
  assert.ok(CHEST_REACH > 0.5 && CHEST_REACH <= 1);
});

test('the tractor is slow and short, so passing it is quick, and its stretch and the shower are clear of the tunnel', () => {
  assert.ok(TRACTOR.speed < 0.4 * TOP_SPEED);
  // It keeps to the shoulder, off the tarmac, where no car can touch it however far over it goes, and inside
  // the marker posts further out.
  assert.ok(TRACTOR.out - TRACTOR.width / 2 > LANE_LIMIT + CAR_WIDTH / 2, 'no car can touch it');
  assert.ok(TRACTOR.out - TRACTOR.width / 2 >= ROAD_HALF, 'it is off the tarmac');
  assert.ok(TRACTOR.out + TRACTOR.width / 2 < ROAD_HALF + 3 - 0.2, 'it is inside the marker posts');
  for (const level of LEVELS) {
    const { tractor, rain } = racePlan(level);
    for (const stretch of [tractor, rain].filter(Boolean)) {
      assert.ok(stretch.from > PLACES.tunnel[1] && stretch.to < PLACES.bridge[0], `level ${level}: ${stretch.from}-${stretch.to}`);
    }
  }
  assert.ok(HIGH_TEN_BEFORE_LINE > 0 && HIGH_TEN_BEFORE_LINE < 12);
  // The high ten is past the last big hand of the lap.
  assert.ok(LAP_LENGTH - HIGH_TEN_BEFORE_LINE > racePlan(10).gates.at(-1)[0] + 8);
});

test('the tractor keeps to the side away from the next big hand, and stops short of the next one on its side', () => {
  // Its front is about 2 m ahead of where it is, and it rolls on a little as it stops.
  const rollsOn = TRACTOR.speed / TRACTOR.slows + 2;
  for (const level of LEVELS) {
    const plan = racePlan(level);
    const run = tractorRun(plan, LAP_LENGTH);
    if (!plan.tractor) {
      assert.equal(run, null, `level ${level}`);
      continue;
    }
    const next = plan.gates.find(([along]) => along >= run.from);
    assert.equal(run.side, -next[1], `level ${level}: away from the next big hand`);
    // The post of a big hand on its side is never where the tractor is, from its back as it comes out to its
    // front where it stops.
    for (const [along, side] of plan.gates) {
      if (side === run.side) assert.ok(along < run.from - TRACTOR.length || along > run.to + rollsOn + 1, `level ${level}: the big hand at ${along}`);
    }
    assert.ok(run.to - run.from > 60, `level ${level}: it still has a good way to go`);
  }
});

/* ---------- prizes and power-ups ---------- */

test('coins spill out ahead of the car, spaced so they go past slowly enough, where the car is', () => {
  const spots = spillSpots(300, -2, 3);
  assert.equal(spots.length, 3);
  spots.forEach((spot, index) => {
    assert.equal(spot.lateral, -2);
    assert.ok(spot.distance > 300 + 10);
    if (index > 0) assert.ok(spot.distance - spots[index - 1].distance >= CHEVRON_SPACING);
  });
  // With nothing else on the road, they land where they always did.
  assert.deepEqual(spillSpots(300, -2, 3, -Infinity), spots);
  // A car passed just after a slap: its coins land past the slap's, which are still on the road, and every
  // coin is as far from the next as ever, so they're still picked up one at a time.
  const after = spillSpots(305, 1, 2, spots.at(-1).distance);
  const all = [...spots, ...after].map(({ distance }) => distance).sort((a, b) => a - b);
  all.forEach((at, index) => {
    if (index > 0) assert.ok(at - all[index - 1] >= COINS.spacing, `${all[index - 1]} and ${at}`);
  });
  // Far behind the car, coins already on the road don't hold new ones back.
  assert.equal(spillSpots(900, 0, 1, 343)[0].distance, 900 + COINS.firstAhead);
  // Even at the car's fastest, fewer than three go past a second.
  assert.ok(FASTEST_SPEED / COINS.spacing < 3);
  assert.ok(COINS.perFive > 0 && COINS.perPass > 0 && COINS.perTractor > 0);
  assert.ok(COINS.gem > 1 && COINS.chest > COINS.gem && COINS.highTen > 1);
});

test('prizes are picked up generously, and from anywhere across the road with the magnet', () => {
  const car = { distance: 500, lateral: 0 };
  assert.equal(picksUp({ distance: 501, lateral: 2.5 }, car), true, 'a car width or more to the side');
  assert.equal(picksUp({ distance: 501, lateral: 4.5 }, car), false);
  assert.equal(picksUp({ distance: 501, lateral: 4.5 }, car, true), true, 'with the magnet');
  assert.equal(picksUp({ distance: 510, lateral: 0 }, car, true), false, 'only once the car is there');
  assert.ok(POWER.magnet.across >= 2 * LANE_LIMIT, 'the magnet reaches right across the road');
  assert.ok(COINS.across > CAR_WIDTH_HALF * 2 && POWER_REACH.across > CAR_WIDTH_HALF * 2);
  assert.ok(COINS.drift > 1, 'coins drift over to the car');
});

test('a power-up lasts its time while the hand is open, waits while it rests, and then ends', () => {
  const powers = new PowerUps();
  assert.equal(powers.has('magnet'), false);
  powers.take('magnet');
  powers.take('bubble');
  assert.equal(powers.has('magnet'), true);
  assert.equal(powers.share('magnet'), 1);
  for (let t = 0; t < 3; t += 0.1) assert.deepEqual(powers.update(0, 0.1), [], 'resting takes nothing away');
  assert.equal(powers.share('magnet'), 1);
  let ended = [];
  let seconds = 0;
  while (!ended.includes('magnet') && seconds < 20) {
    ended = powers.update(1, 0.05);
    seconds += 0.05;
  }
  assert.ok(Math.abs(seconds - POWER.magnet.seconds) < 0.11, `lasted ${seconds.toFixed(2)} s`);
  assert.equal(powers.has('magnet'), false);
  assert.equal(powers.has('bubble'), true, 'each has its own time');
  powers.take('magnet');
  assert.equal(powers.share('magnet'), 1, 'taking one again starts it over');
  powers.reset();
  assert.ok(POWER_KINDS.every((kind) => !powers.has(kind)));
  for (const kind of POWER_KINDS) assert.ok(POWER[kind].seconds >= 5 && POWER[kind].seconds <= 12, kind);
  // Closer hands only ever make reaching easier, and stars only ever count for more.
  assert.ok(POWER.wide.reach > 0 && POWER.wide.reach < 1);
  assert.ok(POWER.rainbow.starsEach > 1);
});

test('a high five that only came with closer hands doesn\'t make reaching harder afterwards', () => {
  // A side that's been missed, so that its reach has come down.
  const easing = new ReachEasing(REACH.medium);
  easing.recordPass(1, 0, true);
  easing.recordPass(1, 0, true);
  const eased = easing.reachFor(1);
  assert.ok(eased < REACH.medium);
  // With closer hands, the car only had to be this far over, and was, but not as far as without them.
  const assisted = eased * POWER.wide.reach + 0.1;
  assert.equal(gateOutcome({ handOpen: true, lateral: assisted, side: 1, reach: eased * POWER.wide.reach }), 'slap');
  easing.recordPass(1, assisted, true);
  assert.ok(easing.reachFor(1) <= eased, 'it isn\'t taken back up');
  // A slap at the side's own reach takes it back up, as it always did, and the other side is left alone.
  const now = easing.reachFor(1);
  easing.recordPass(1, now + 0.1, true);
  assert.ok(easing.reachFor(1) > now);
  assert.equal(easing.reachFor(-1), REACH.medium);
  // Without a power-up, it's exactly what was recorded before.
  for (const [lateral, handOpen] of [[0, true], [3, true], [3, false], [-3, true], [1, false]]) {
    const before = new ReachEasing(REACH.medium);
    before.record(1, gateOutcome({ handOpen, lateral, side: 1, reach: before.reachFor(1) }), handOpen);
    const after = new ReachEasing(REACH.medium);
    after.recordPass(1, lateral, handOpen);
    assert.deepEqual(after.ease, before.ease, `${lateral} ${handOpen}`);
  }
});

test('each level is the same or harder than the one before in every way, and harder in at least one', () => {
  for (const level of LEVELS.slice(1)) {
    const before = hardness(level - 1);
    const now = hardness(level);
    let harder = 0;
    for (const key of Object.keys(now)) {
      assert.ok(now[key] >= before[key] - 1e-9, `level ${level}: ${key} got easier`);
      if (now[key] > before[key] + 1e-9) harder += 1;
    }
    assert.ok(harder > 0, `level ${level} is no harder than level ${level - 1}`);
  }
});

test('new kinds of thing come in from about level 3, and level 10 has them all', () => {
  assert.ok(!sameSideTwice(racePlan(2).gates));
  assert.ok(sameSideTwice(racePlan(3).gates), 'two big hands on one side');
  assert.ok(racePlan(4).rivals > 3, 'another car');
  assert.ok(racePlan(5).rivalTurboEvery < Infinity, 'the others use turbo');
  assert.ok(racePlan(6).ramps.some(({ lateral }) => lateral !== 0), 'a ramp to one side');
  assert.ok(sideChanges(racePlan(7).gates) > sideChanges(racePlan(6).gates), 'a slalom');
  const top = hardness(10);
  assert.ok(top.rivals === 5 && top.turbo > 0 && top.sideRamps === 2 && top.hands > 13);
  // Level 10 has every new thing there is, and every kind of power-up.
  const plan = racePlan(10);
  for (const { id } of NEW_THINGS) assert.ok(REALLY_ON[id](plan), id);
  assert.equal(top.powerKinds, POWER_KINDS.length);
});

test('even level 10 leaves time to get across, and asks for no more than twice as many moves', () => {
  const levelOne = racePlan(1).gates;
  const first = closestAcross(levelOne, LAP_LENGTH);
  assert.equal(first, 85);
  for (const level of LEVELS) {
    const { gates } = racePlan(level);
    // Two big hands on opposite sides are never so close that there's less than 70% of the time to get across.
    assert.ok(closestAcross(gates, LAP_LENGTH) >= 0.7 * first, `level ${level}: ${closestAcross(gates, LAP_LENGTH)} m`);
    // Moving across for a big hand, and high fives, at most twice as often as at level 1.
    assert.ok(sideChanges(gates) <= 2 * sideChanges(levelOne), `level ${level}`);
    assert.ok(gates.length <= 2 * levelOne.length, `level ${level}`);
    // The first big hand of the race comes no sooner than 70% of the way it does at level 1.
    assert.ok(gates[0][0] + START_BEHIND_LINE >= 0.7 * (levelOne[0][0] + START_BEHIND_LINE));
  }
  // The race is as many laps as a grown-up chose, and nothing in a level slows the car, so it's never
  // longer. The fastest the car goes never changes: what goes past at speed is spaced for it.
  assert.equal(FASTEST_SPEED, TOP_SPEED * 1.45);
});

test('big hands and ramps keep clear of the tunnel, the bridges and each other at every level', () => {
  for (const level of LEVELS) {
    const { gates, ramps } = racePlan(level);
    gates.forEach(([along, side], index) => {
      assert.ok(side === 1 || side === -1);
      for (const [from, to] of NO_HANDS) assert.ok(!(wrap(along - from) <= wrap(to - from)), `level ${level}: a big hand at ${along}`);
      if (index > 0) assert.ok(along - gates[index - 1][0] >= 30, `level ${level}: big hands at ${gates[index - 1][0]} and ${along}`);
      // A big hand is never right by a ramp down the middle, where the car would have to be in two places.
      for (const ramp of ramps) {
        if (ramp.lateral === 0) assert.ok(Math.abs(along - ramp.along) >= 40, `level ${level}: big hand at ${along} by a ramp`);
        // A ramp to one side is on the way to the big hand after it, on that same side.
        else if (along > ramp.along && along - ramp.along < 40) assert.equal(Math.sign(ramp.lateral), side);
      }
    });
    for (const ramp of ramps) {
      for (const [from, to] of NO_HANDS) assert.ok(!(wrap(ramp.along - from) <= wrap(to - from)), `level ${level}: a ramp at ${ramp.along}`);
      // A ramp to one side stays on the road.
      assert.ok(Math.abs(ramp.lateral) + 2.9 <= LANE_LIMIT + 1.5);
    }
  }
});

test('the others still ease off at the end, and still wait for a child who is resting, at level 10', () => {
  const pace = racePlan(10).rivalPace;
  const cruise = 21;
  // On the last stretch they want to be behind, and they drop back.
  assert.ok(rivalSpeed({ gap: 10, wish: -10, playerSpeed: 20, resting: false, rushing: false, cruise, pace }) < 20);
  // Resting: those behind stop behind, those in front stop a little way on.
  assert.equal(rivalSpeed({ gap: -5, wish: 30, playerSpeed: 0, resting: true, rushing: false, comingBack: true, cruise, pace }), 0);
  assert.equal(rivalSpeed({ gap: 50, wish: 30, playerSpeed: 0, resting: true, rushing: false, cruise, pace }), 0);
  // A boost still leaves them behind, a little less quickly than at level 1.
  assert.ok(rivalSpeed({ gap: -5, wish: 20, playerSpeed: 34, resting: false, rushing: true, cruise, pace }) < 34);
  assert.ok(RIVAL_TURBO.seconds < 3 && RIVAL_TURBO.gain < SLAP.kick * 2);
});

/* ---------- racing to win, the default ---------- */

/**
 * A two-lap race in numbers alone: a child's car, as the game drives it from the hand, against the others at
 * their own pace, turbo and all. openShare is how much of each 12 seconds the hand is open, and slaps how many of
 * the big hands it high fives. Says who got to the line first.
 */
function raceInNumbers({ level, drive, openShare = 1, slaps = 0, laps = 2, seed = 7 }) {
  let state = seed;
  const random = () => (state = (state * 16807) % 2147483647) / 2147483647;
  const plan = racePlan(level);
  const dt = 1 / 30;
  const turbo = new TurboMeter();
  let distance = -START_BEHIND_LINE;
  let speed = 0;
  let boost = 0;
  let time = 0;
  const rivals = Array.from({ length: plan.rivals }, (_, index) => ({
    distance: -START_BEHIND_LINE + 11 * [1, 2, 3, 2, 1][index], speed: 0, turboIn: plan.rivalTurboEvery * (0.5 + index * 0.37), turboLeft: 0,
  }));
  const gates = plan.gates.map(([along]) => along);
  let nextGate = 0;
  let gateLap = 0;
  const end = laps * LAP_LENGTH;
  while (time < 600) {
    time += dt;
    const open = time % 12 < 12 * openShare;
    turbo.update(open ? 1 : 0, dt);
    boost = open ? Math.max(0, boost - dt) : 0;
    if (distance >= gateLap * LAP_LENGTH + gates[nextGate]) {
      if (open && random() < slaps) {
        boost = SLAP.boostSeconds;
        speed += SLAP.kick;
      }
      nextGate = (nextGate + 1) % gates.length;
      if (nextGate === 0) gateLap += 1;
    }
    const target = wantedSpeed(open ? drive : 0, turbo.bonus, boost);
    speed = target > speed ? Math.min(target, speed + 10 * dt) : Math.max(target, speed - (open ? 7 : 13) * dt);
    distance += speed * dt;
    if (distance >= end) return { won: true, seconds: time };
    rivals.forEach((rival, index) => {
      let wanted = ownPace({ cruise: plan.rivalCruise, index, time, phase: index * 1.9 });
      rival.turboIn -= dt;
      if (rival.turboIn <= 0 && !rivals.some((other) => other.turboLeft > 0)) {
        rival.turboLeft = RIVAL_TURBO.seconds;
        rival.turboIn = plan.rivalTurboEvery;
      }
      if (rival.turboLeft > 0) {
        rival.turboLeft -= dt;
        wanted += RIVAL_TURBO.gain;
      }
      rival.speed += (wanted - rival.speed) * (1 - Math.exp(-2.2 * dt));
      rival.distance += rival.speed * dt;
    });
    if (rivals.some((rival) => rival.distance >= end)) return { won: false, seconds: time };
  }
  return { won: false, seconds: time };
}

test('racing to win, the others drive at their own pace, whatever the child does', () => {
  const plan = racePlan(6);
  const at = (time) => ownPace({ cruise: plan.rivalCruise, index: 1, time, phase: 2 });
  for (const time of [0, 3, 10, 40]) {
    const pace = at(time);
    assert.ok(pace > plan.rivalCruise * RIVALS_RACE.each[1] * (1 - RIVALS_RACE.swing) - 1e-9);
    assert.ok(pace < plan.rivalCruise * RIVALS_RACE.each[1] * (1 + RIVALS_RACE.swing) + 1e-9);
  }
  // It takes only its own car and the level: nothing about the child goes into it.
  assert.equal(ownPace.length, 1);
});

test('racing to win, the levels ramp: slowly at first, and at level 10 the quickest is faster than the car\'s top speed', () => {
  assert.ok(Math.abs(racePlan(1).rivalCruise - 0.6 * TOP_SPEED) < 1e-9);
  assert.ok(Math.abs(racePlan(10).rivalCruise - 1.1 * TOP_SPEED) < 1e-9);
  assert.equal(rivalCruiseAt(10), racePlan(10).rivalCruise);
  for (let level = 2; level <= 10; level += 1) assert.ok(racePlan(level).rivalCruise > racePlan(level - 1).rivalCruise, `level ${level}`);
  // Slowly at first: by level 3 it has risen only about a tenth of the way, where an even ramp would be at two ninths.
  assert.ok(racePlan(3).rivalCruise < 0.6 * TOP_SPEED + 0.12 * 0.5 * TOP_SPEED);
  // Still slower than a car going flat out with turbo, so it can always be beaten.
  assert.ok(racePlan(10).rivalCruise * (1 + RIVALS_RACE.swing) + RIVAL_TURBO.gain < FASTEST_SPEED);
});

test('racing to win at level 1, a child new to it wins, even with the hand closed a quarter of the time', () => {
  assert.equal(raceInNumbers({ level: 1, drive: 0.8, openShare: 0.75 }).won, true);
  assert.equal(raceInNumbers({ level: 1, drive: 0.8 }).won, true);
});

test('racing to win, the others can win: a child who rests a lot loses at level 5, and one who only just opens the hand loses at level 8', () => {
  assert.equal(raceInNumbers({ level: 5, drive: 0.8, openShare: 0.75 }).won, false);
  assert.equal(raceInNumbers({ level: 5, drive: 0.8 }).won, true);
  assert.equal(raceInNumbers({ level: 8, drive: 0.8 }).won, false);
  assert.equal(raceInNumbers({ level: 8, drive: 0.8, slaps: 0.8 }).won, true);
});

test('racing to win at level 10 takes real skill: the hand wide open and the high fives', () => {
  assert.equal(raceInNumbers({ level: 10, drive: 0.8, slaps: 0.8 }).won, false, 'only just open, even with high fives');
  assert.equal(raceInNumbers({ level: 10, drive: 1 }).won, false, 'wide open, but missing the high fives');
  assert.equal(raceInNumbers({ level: 10, drive: 1, slaps: 0.9 }).won, true, 'wide open and high fiving');
});

/* ---------- friends, together: one convoy ---------- */

test('in a convoy, a car beside its friends goes at its own speed, and so does a car with no friends left', () => {
  assert.equal(convoyPace(300, [300]), 1);
  assert.equal(convoyPace(300, [300 - CONVOY.ahead]), 1);
  assert.equal(convoyPace(300, [300 + CONVOY.behind]), 1);
  assert.equal(convoyPace(300, [280, 320, 310]), 1);
  assert.equal(convoyPace(300, []), 1);
  // A friend whose place hasn't come yet doesn't count.
  assert.equal(convoyPace(300, [NaN, undefined]), 1);
});

test('the car far in front of the last of its friends eases off, evenly, down to half its speed and no further', () => {
  const lastAt = 100;
  const at = (ahead) => convoyPace(lastAt + ahead, [lastAt, lastAt + 20]);
  assert.equal(at(CONVOY.ahead), 1);
  assert.ok(at(CONVOY.ahead + 1) < 1);
  assert.ok(Math.abs(at(CONVOY.ahead + CONVOY.slack / 2) - (1 + CONVOY.slowest) / 2) < 1e-9);
  assert.equal(at(CONVOY.ahead + CONVOY.slack), CONVOY.slowest);
  assert.equal(at(CONVOY.ahead + CONVOY.slack + 5000), CONVOY.slowest);
  // Further in front, never faster.
  let before = 1;
  for (let ahead = 0; ahead <= 200; ahead += 5) {
    assert.ok(at(ahead) <= before, `${ahead} metres in front`);
    before = at(ahead);
  }
  // It's the last of them that's waited for, not the nearest.
  assert.equal(convoyPace(400, [395, 250]), CONVOY.slowest);
  // Nobody is ever stopped by it: half speed is the least.
  assert.equal(CONVOY.slowest, 0.5);
});

test('the car far behind the first of its friends gets a tow, a fifth faster, and not before', () => {
  assert.equal(convoyPace(100, [100 + CONVOY.behind + 1]), CONVOY.tow);
  assert.equal(convoyPace(100, [100 + CONVOY.behind]), 1);
  assert.equal(convoyPace(100, [120, 400]), CONVOY.tow);
  assert.equal(CONVOY.tow, 1.2);
  // Even with turbo, a towed car's speed is one the server passes on to friends: see cleanCar in server/race-room.js.
  assert.ok(FASTEST_SPEED * CONVOY.tow < 100);
  // A car in the middle, far in front of one and far behind another, waits for the one behind.
  assert.equal(convoyPace(300, [100, 500]), CONVOY.slowest);
  // Two cars easing and towing come back together: the one in front at half speed and the one behind at 1.2
  // close a gap of 150 metres within a lap's driving, at the speed a hand held just open gives.
  let [front, back] = [150, 0];
  const speed = TOP_SPEED * 0.8;
  for (let second = 0; second < 40; second += 1) {
    const [a, b] = [convoyPace(front, [back]), convoyPace(back, [front])];
    front += speed * a;
    back += speed * b;
  }
  assert.ok(front - back <= CONVOY.ahead, `${Math.round(front - back)} metres apart after 40 seconds`);
  assert.ok(front - back >= 0);
});

test('High Five Racers comes as a race friends drive together, and whoever made it can choose a race', () => {
  const source = readFileSync(new URL('../../games/high-five-racers/main.js', import.meta.url), 'utf8');
  assert.match(source, /defaults: \{[^}]*raceFriends: 'together'/);
  assert.match(source, /choices: \{[^}]*raceFriends: String/);
  for (const value of ['together', 'against']) assert.ok(source.includes(`name="raceFriends" value="${value}"`), value);
  // The convoy's little words are there in both languages.
  for (const word of ['easeOff', 'tow']) assert.equal(source.split(`    ${word}: '`).length - 1, 2, word);
});
