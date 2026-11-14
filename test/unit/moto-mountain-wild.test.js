// Moto Mountain's wild ride, with no screen or camera: steep hills that throw a bike into the air at the top,
// ramps, hay bales in the way, a river to jump, and other riders to race. The riders are pretend children: see
// moto-rider.js.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BIKE, NEW_THINGS, NEW_THINGS_WILD, RIVAL, RIVALRY, ROAD, Ride, TRICK, layOut, newAt, rideLevel, thingsUpTo } from '../../games/moto-mountain/ride.js';
import { hillSlope, hillsAt, placeAt, shapeOf, slopeAt } from '../../games/moto-mountain/road.js';
import { STEP, looksAhead, measuredLeaner, planOf, ride, seeded } from './moto-rider.js';

const near = (actual, expected, within, message) => assert.ok(Math.abs(actual - expected) <= within, `${message ?? ''} expected about ${expected}, got ${actual}`);
const HILL = { at: 200, up: 30, down: 55, rise: 10.5, drop: 11, round: 5 };
/** A straight road with a hill on it, and whatever else. */
const hilly = (more = {}) => planOf({ hills: [HILL], length: 500, ...more });
/** A ride on a road, watched all the way: what the bike did at each moment. */
function watched(options, child = {}) {
  const seen = [];
  const out = ride(options, {
    lean: () => 0,
    ...child,
    until: (game, time) => {
      seen.push({ time, s: game.s, v: game.v, height: game.height, air: Boolean(game.air), place: game.place });
      return false;
    },
  });
  return { ...out, seen };
}

/* ------------------------------- hills ------------------------------- */

test('a hill is a way up, a top and a way down: the road climbs to it, and falls from it', () => {
  assert.equal(hillSlope(HILL, 150), 0, 'before it');
  near(hillSlope(HILL, 190), 10.5 / 30, 1e-9, 'on the way up');
  near(hillSlope(HILL, 220), -11 / 55, 1e-9, 'on the way down');
  assert.equal(hillSlope(HILL, 260), 0, 'past it');
  // Over the top it goes from the one to the other in a few metres, and never all at once.
  assert.ok(hillSlope(HILL, 199) > 0 && hillSlope(HILL, 201.5) < 0);
  for (let s = 150; s < 260; s += 0.1) assert.ok(Math.abs(hillSlope(HILL, s + 0.1) - hillSlope(HILL, s)) < 0.02, `at ${s}`);
  assert.equal(hillSlope(HILL, 169.9), 0);
  assert.equal(hillSlope(HILL, 255.1), 0);
  // The road itself goes up it and down again.
  const plain = shapeOf(planOf({ length: 500 }));
  const shape = shapeOf(hilly());
  const over = (s) => placeAt(shape, s).y - placeAt(plain, s).y;
  near(over(160), 0, 0.05, 'level with a road without it, before');
  assert.ok(over(200) > 8, `${over(200)} metres up at the top`);
  assert.ok(over(260) < over(200) - 8, `and down again after: ${over(260)}`);
  assert.equal(hillsAt(planOf({ length: 500 }), 200), 0, 'a road with no hills has none');
  assert.ok(slopeAt(hilly(), 190) > slopeAt(planOf({ length: 500 }), 190) + 0.2);
});

test('a slope with one side to it, as under a bend, comes on gently: no bike leaves the ground for it', () => {
  const plan = planOf({ hills: [{ at: 150, up: 12, rise: 0, down: 80, drop: 5, round: 24 }, { at: 400, up: 80, rise: 5, down: 12, drop: 0, round: 24 }], length: 600 });
  near(hillsAt(plan, 200), -5 / 80, 1e-9, 'downhill');
  near(hillsAt(plan, 360), 5 / 80, 1e-9, 'uphill');
  const { game, seen } = watched({ plan });
  assert.equal(game.stats.jumps, 0);
  assert.ok(seen.every(({ height }) => height === 0));
  // Faster down the one, and slower up the other, than on the level between them.
  const speedAt = (s) => seen.find((moment) => moment.s >= s).v;
  assert.ok(speedAt(215) > speedAt(280) * 1.03, `downhill ${speedAt(215)}, level ${speedAt(280)}`);
  assert.ok(speedAt(385) < speedAt(280) * 0.985, `uphill ${speedAt(385)}`);
});

test('a bike going well flies off the top of a steep hill, and comes down on the road further on', () => {
  const { game, seen, events } = watched({ plan: hilly() });
  assert.equal(game.stats.jumps, 1);
  const flight = seen.filter(({ air }) => air);
  // It leaves the ground at the top, not before, and is down again well before the end of the way down.
  assert.ok(flight[0].s > 197 && flight[0].s < 204, `off the ground at ${flight[0].s}`);
  assert.ok(flight.at(-1).s > 214 && flight.at(-1).s < 250, `down at ${flight.at(-1).s}`);
  const highest = Math.max(...flight.map(({ height }) => height));
  assert.ok(highest > 1.5 && highest < 6, `${highest} metres over the road`);
  assert.ok(flight.at(-1).time - flight[0].time > 1.3, 'well over a second of it');
  const land = events.find(({ type }) => type === 'land');
  near(land.seconds, flight.at(-1).time - flight[0].time, 0.1);
  near(land.peak, highest, 0.01);
  near(game.stats.air, land.seconds, 1e-9);
  near(game.stats.bestAir, land.seconds, 1e-9);
  assert.equal(game.height, 0);
  assert.deepEqual(events.filter(({ type }) => ['jump', 'land'].includes(type)).map(({ type }) => type), ['jump', 'land']);
  // In the air it neither speeds up nor slows down.
  near(flight[0].v, flight.at(-1).v, 0.01);
});

test('the faster the bike, the further it flies, and one that is crawling rolls over the top without leaving the ground', () => {
  const flown = (pace) => {
    const { seen, game } = watched({ plan: hilly(), pace });
    const flight = seen.filter(({ air }) => air);
    return { metres: flight.length ? flight.at(-1).s - flight[0].s : 0, jumps: game.stats.jumps, seconds: game.stats.air };
  };
  const [gentle, usual, quick] = ['gentle', 'usual', 'quick'].map(flown);
  assert.ok(usual.metres > gentle.metres + 2, `${gentle.metres}, then ${usual.metres}`);
  assert.ok(quick.metres > usual.metres + 2, `and ${quick.metres}`);
  assert.ok(quick.seconds > gentle.seconds);
  // On the grass all the way, at under half its speed: over the hill on its wheels.
  const slow = watched({ plan: hilly() }, { lean: () => 1.4 });
  assert.ok(slow.game.offRoad);
  assert.equal(slow.game.stats.jumps, 0);
  assert.ok(slow.seen.every(({ height }) => height === 0));
});

test('how a jump is timed does not depend on how often the game looks: 30 times a second or 120', () => {
  const flight = (step) => {
    const game = new Ride({ plan: hilly(), leaner: measuredLeaner() });
    game.begin();
    let seconds = 0;
    while (game.state === 'riding' && game.s < 300) {
      game.update(step, { share: 0, raw: 0, seen: true });
      if (game.air) seconds += step;
    }
    return { seconds, jumps: game.stats.jumps };
  };
  const [slow, fast] = [flight(1 / 30), flight(1 / 120)];
  assert.deepEqual([slow.jumps, fast.jumps], [1, 1]);
  near(slow.seconds, fast.seconds, 0.12);
});

test('a ramp throws the bike up as fast as it was going, and a faster bike goes higher and further', () => {
  const plan = () => planOf({ things: [{ kind: 'ramp', at: 150, x: 0, reach: 1.5 }], length: 400 });
  const jump = (pace) => {
    const { seen } = watched({ plan: plan(), pace });
    const flight = seen.filter(({ air }) => air);
    return { high: Math.max(...flight.map(({ height }) => height)), far: flight.at(-1).s - flight[0].s };
  };
  const [usual, quick] = [jump('usual'), jump('quick')];
  assert.ok(usual.high > 1.8 && usual.far > 15, JSON.stringify(usual));
  assert.ok(quick.high > usual.high * 1.2 && quick.far > usual.far * 1.2, JSON.stringify(quick));
});

/* ------------------------------- tricks ------------------------------- */

test('a lean held in the air is a trick, one to a jump, and a twitch is not', () => {
  const plan = () => planOf({ things: [{ kind: 'ramp', at: 150, x: 0, reach: 1.5 }, { kind: 'ramp', at: 280, x: 0, reach: 1.5 }], length: 420 });
  // A deep lean to the left all through the first jump, and upright through the second.
  const held = ride({ plan: plan() }, { lean: (game) => (game.air && game.s < 250 ? -1 : 0), late: 0 });
  assert.equal(held.game.stats.jumps, 2);
  assert.equal(held.game.stats.tricks, 1);
  const lands = held.events.filter(({ type }) => type === 'land');
  assert.deepEqual(lands.map(({ trick, side }) => [trick, side]), [[true, 'left'], [false, null]]);
  // A lurch isn't one: a deep lean, but only for a moment.
  let leant = 0;
  let deepest = 0;
  let deepFor = 0;
  const twitch = ride({ plan: plan() }, {
    lean: (game) => {
      if (!game.air || leant > 0.45) return 0;
      leant += STEP;
      return 1;
    },
    late: 0,
    until: (game) => {
      if (!game.air) return false;
      deepest = Math.max(deepest, Math.abs(game.leaner.share));
      if (Math.abs(game.leaner.share) >= TRICK.share) deepFor += STEP;
      return false;
    },
  });
  assert.ok(deepest >= TRICK.share, `it was a deep lean: ${deepest}`);
  assert.ok(deepFor > 0.1 && deepFor < TRICK.seconds, `for ${deepFor} seconds`);
  assert.equal(twitch.game.stats.tricks, 0);
});

test('a trick landed is a burst of speed, which is how a race is won, and leaning in the air takes the bike nowhere', () => {
  const plan = () => planOf({ things: [{ kind: 'ramp', at: 150, x: 0, reach: 1.5 }], length: 420 });
  const after = (lean) => {
    const seen = [];
    const out = ride({ plan: plan() }, {
      lean,
      late: 0,
      until: (game) => {
        seen.push({ s: game.s, v: game.v, x: game.x, air: Boolean(game.air), boost: game.boostLeft });
        return false;
      },
    });
    const landed = seen.findIndex(({ air }, n) => !air && n > 0 && seen[n - 1].air);
    return { ...out, landed: seen[landed], fastest: Math.max(...seen.slice(landed).map(({ v }) => v)), across: Math.max(...seen.filter(({ air }) => air).map(({ x }) => Math.abs(x))) };
  };
  const trick = after((game) => (game.air && game.air.t < 0.7 ? 1 : 0));
  const plain = after(() => 0);
  assert.equal(trick.game.stats.tricks, 1);
  near(trick.landed.boost, TRICK.boost, 0.05, 'a burst of speed from the moment it lands');
  assert.equal(plain.landed.boost, 0);
  assert.ok(trick.fastest > plain.fastest * 1.15, `${trick.fastest} against ${plain.fastest}`);
  assert.ok(trick.time < plain.time - 0.3, 'and sooner to the end');
  // The lean in the air didn't move the bike across the road.
  assert.ok(trick.across < 0.05, `${trick.across} metres across`);
});

/* ------------------------------- hay bales ------------------------------- */

test('riding into a row of hay bales bursts it and costs most of the bike’s speed, and going round costs nothing', () => {
  const plan = () => planOf({ things: [{ kind: 'barrier', at: 200, x: 2.1, reach: 2 }], length: 400 });
  // Held over to the right, on the road, into the bales.
  const into = watched({ plan: plan() }, { lean: (game) => (game.x < 2 ? 0.2 : 0) });
  assert.equal(into.game.stats.crashes, 1);
  assert.ok(into.types.includes('crash'));
  const before = into.seen.filter(({ s }) => s < 199).at(-1).v;
  const after = into.seen.find(({ s }) => s > 200.5).v;
  near(after, before * BIKE.crash, 1, 'most of its speed gone');
  assert.equal(into.game.things.find(({ kind }) => kind === 'barrier').gone, true, 'and the bales are gone');
  assert.equal(into.game.state, 'finished', 'and on it goes');
  // Straight on, down the middle: the bales are to the right, and nothing happens.
  const round = watched({ plan: plan() });
  assert.equal(round.game.stats.crashes, 0);
  assert.ok(round.seen.find(({ s }) => s > 201).v > before * 0.95);
  assert.ok(into.time > round.time + 0.6, 'which is quicker');
});

test('bales right across the road can only be flown over: off the ramp before them it’s a clear jump, and beside the ramp it’s through them', () => {
  const plan = () => planOf({ things: [{ kind: 'ramp', at: 150, x: 1.7, reach: 1.5 }, { kind: 'barrier', at: 163, x: 0, reach: ROAD.half + ROAD.verge, wall: true }], length: 400 });
  const over = ride({ plan: plan() }, { lean: (game) => (game.s < 150 && game.x < 1.6 ? 0.12 : 0) });
  assert.deepEqual([over.game.stats.jumps, over.game.stats.cleared, over.game.stats.crashes], [1, 1, 0]);
  assert.ok(over.types.includes('clear'));
  assert.equal(over.game.things.find(({ kind }) => kind === 'barrier').gone, undefined, 'the bales are still there');
  const through = ride({ plan: plan() }, { lean: (game) => (game.s < 150 && game.x > -1.6 ? -0.12 : 0) });
  assert.deepEqual([through.game.stats.jumps, through.game.stats.cleared, through.game.stats.crashes], [0, 0, 1]);
  // Anywhere across the road, and on the grass too: there's no way round.
  for (const lean of [0, 0.6, -0.6]) assert.equal(ride({ plan: plan() }, { lean: (game) => (game.s > 152 ? lean : 0), late: 0 }).game.stats.crashes, 1, `leaning ${lean}`);
});

test('a star in the air is for a bike that’s flying, and one on the road for any bike', () => {
  const plan = () => planOf({ things: [{ kind: 'ramp', at: 150, x: 0, reach: 1.5 }, { kind: 'star', at: 158, x: 0, air: true }, { kind: 'star', at: 300, x: 0, air: true }, { kind: 'star', at: 320, x: 0 }], length: 400 });
  const { game } = ride({ plan: plan() }, { lean: () => 0 });
  // The one over the jump, and the one on the road: not the one in the air where the bike was on its wheels.
  assert.equal(game.stats.stars, 2);
  assert.deepEqual(game.things.filter(({ kind }) => kind === 'star').map(({ taken }) => Boolean(taken)), [true, false, true]);
});

/* ------------------------------- the river ------------------------------- */

const RIVER = { hills: [{ at: 200, up: 9, down: 4.5, rise: 3, drop: 3, round: 1.2, bank: true }], things: [{ kind: 'river', at: 203, from: 203, to: 214 }], length: 420 };

test('a bike going well flies the river from its bank, and one that is slow wades through it', () => {
  const over = watched({ plan: planOf(RIVER) });
  assert.deepEqual([over.game.stats.rivers, over.game.stats.wades], [1, 0]);
  assert.ok(over.types.includes('river') && !over.types.includes('wade'));
  // In the air from the bank to past the far side of the water.
  const flight = over.seen.filter(({ air }) => air);
  assert.ok(flight[0].s < 203.5 && flight.at(-1).s > 214, `from ${flight[0].s} to ${flight.at(-1).s}`);
  // On the grass, at under half the speed: down the bank and into the water, slower still, and out the other side.
  const slow = watched({ plan: planOf(RIVER) }, { lean: () => 1.4 });
  assert.deepEqual([slow.game.stats.rivers, slow.game.stats.wades], [0, 1]);
  assert.ok(slow.types.includes('wade') && !slow.types.includes('river'));
  const inWater = slow.seen.filter(({ s }) => s > 207 && s < 213.5);
  const before = slow.seen.filter(({ s }) => s > 150 && s < 180);
  const mean = (list) => list.reduce((sum, { v }) => sum + v, 0) / list.length;
  assert.ok(mean(inWater) < mean(before) * 0.6, `${mean(inWater)} in the water, ${mean(before)} before`);
  assert.equal(slow.game.state, 'finished', 'and nobody is left in it');
  assert.equal(slow.game.wet, null);
});

test('a bike that comes down in the water has not jumped the river', () => {
  // Slowed by bales just before the bank: off the top of it all the same, or over it on its wheels, but not far enough.
  const plan = planOf({ ...RIVER, things: [{ kind: 'barrier', at: 192, x: 0, reach: 1.5 }, ...RIVER.things] });
  const { game } = ride({ plan }, { lean: () => 0 });
  assert.equal(game.stats.crashes, 1);
  assert.deepEqual([game.stats.rivers, game.stats.wades], [0, 1]);
});

/* ------------------------------- the race ------------------------------- */

const RIVALS = (skills, more = {}) => skills.map((skill, n) => ({ skill, lane: [-2.2, 2.2, -1.1, 1.1][n % 4], from: (skills.length - n) * RIVAL.grid, slips: [], ...more }));

test('the other riders line up in front of the child, who starts last, and each rides at their own speed', () => {
  const game = new Ride({ plan: planOf({ rivals: RIVALS([0.9, 1, 1.1]), length: 1200 }), leaner: measuredLeaner() });
  assert.deepEqual(game.rivals.map(({ s }) => s), [21, 14, 7]);
  assert.equal(game.place, 4);
  assert.equal(game.stats.riders, 4);
  game.begin();
  for (let time = 0; time < 20; time += STEP) game.update(STEP, { share: 0, raw: 0, seen: true });
  // The better the rider, the further they've got in the time, whatever the order they set off in.
  const [slow, steady, quick] = game.rivals.map(({ s, from }) => s - from);
  assert.ok(slow < steady && steady < quick, `${slow}, ${steady}, ${quick}`);
  assert.ok(game.rivals.every(({ v }) => v > 10));
});

test('where the child is in the race is how many riders are in front, and it’s said when it changes', () => {
  // Two slow riders, who are passed, and one who's fast and stays in front.
  const { game, events } = ride({ plan: planOf({ rivals: RIVALS([0.7, 0.72, 1.3]), length: 900 }) }, { lean: () => 0 });
  const places = events.filter(({ type }) => type === 'place').map(({ place }) => place);
  assert.deepEqual(places, [3, 2]);
  assert.equal(game.place, 2);
  assert.equal(game.stats.place, 2, 'second home');
  assert.ok(events.some(({ type, rival }) => type === 'rival-home' && rival === 2));
  // With nobody to race, there's no place to come.
  assert.equal(ride({ plan: planOf({ length: 300 }) }, { lean: () => 0 }).game.stats.place, null);
});

test('the race is kept close: a rider a long way in front eases off, and one a long way behind tries harder', () => {
  const speedOf = (ahead) => {
    const game = new Ride({ plan: planOf({ rivals: RIVALS([1]), length: 3000 }), leaner: measuredLeaner() });
    game.begin();
    for (let time = 0; time < 8; time += STEP) game.update(STEP, { share: 0, raw: 0, seen: true });
    // The child's bike is put where the test wants it, and the rider is given a few seconds to settle.
    for (let time = 0; time < 5; time += STEP) {
      game.s = game.rivals[0].s - ahead;
      game.update(STEP, { share: 0, raw: 0, seen: true });
    }
    return game.rivals[0].v / game.cruise;
  };
  const [level, inFront, behind, far] = [speedOf(0), speedOf(RIVAL.far), speedOf(-RIVAL.far), speedOf(RIVAL.far * 3)];
  const own = RIVALRY.medium;
  near(level, own, 0.02, 'beside the child, their own speed');
  near(inFront, own * (1 - RIVAL.band), 0.02, 'well in front, eased off');
  near(behind, own * (1 + RIVAL.band), 0.02, 'well behind, trying harder');
  near(far, inFront, 0.01, 'and no more than that, however far');
});

test('how good the other riders are is the grown-ups’ setting', () => {
  const speed = (rivalry) => {
    const game = new Ride({ plan: planOf({ rivals: RIVALS([1]), length: 3000 }), leaner: measuredLeaner(), rivalry });
    game.begin();
    for (let time = 0; time < 10; time += STEP) {
      game.s = game.rivals[0].s;
      game.update(STEP, { share: 0, raw: 0, seen: true });
    }
    return game.rivals[0].v / game.cruise;
  };
  near(speed('easy'), RIVALRY.easy, 0.02);
  near(speed('medium'), RIVALRY.medium, 0.02);
  near(speed('hard'), RIVALRY.hard, 0.02);
  assert.ok(RIVALRY.easy < RIVALRY.medium && RIVALRY.medium < RIVALRY.hard);
  // Something that isn't one of the three is a fair race.
  near(speed('whatever'), RIVALRY.medium, 0.02);
});

test('a rider goes round the bales in their way, unless it’s one they were always going to hit, which bursts them and slows the rider', () => {
  const plan = (slips) => planOf({ rivals: [{ skill: 1, lane: 2.2, from: 7, slips }], things: [{ kind: 'barrier', at: 300, x: 2.1, reach: 2 }], length: 700 });
  let widest = 0;
  const careful = ride({ plan: plan([false]) }, {
    lean: () => 0,
    until: (game) => {
      const rider = game.rivals[0];
      if (Math.abs(rider.s - 300) < 1) widest = rider.x;
      return false;
    },
  });
  assert.ok(widest < 0.1 - 0.5, `out of the way of them: ${widest}`);
  assert.ok(!careful.types.includes('rival-crash'));
  assert.equal(careful.game.things[0].gone, undefined);
  // The one who doesn't get out of the way: through them, and slower for a while, with the bales gone for whoever comes next.
  const speeds = [];
  const careless = ride({ plan: plan([true]) }, {
    lean: () => 0,
    until: (game) => {
      const rider = game.rivals[0];
      if (rider.s > 300 && rider.s < 312) speeds.push(rider.v);
      return false;
    },
  });
  assert.ok(careless.events.some(({ type, rival }) => type === 'rival-crash' && rival === 0));
  assert.ok(Math.min(...speeds) < careless.game.cruise * 0.5, `slowed to ${Math.min(...speeds)}`);
  assert.equal(careless.game.things[0].gone, true);
  assert.equal(careless.game.stats.crashes, 0, 'not the child’s doing');
  // And back on their own line afterwards.
  near(careful.game.rivals[0].x, 2.2, 0.05);
});

test('a rider takes the ramp before bales right across the road, and flies over them', () => {
  const plan = planOf({ rivals: [{ skill: 1, lane: -2.2, from: 7, slips: [false] }], things: [{ kind: 'ramp', at: 300, x: 1.7, reach: 1.5 }, { kind: 'barrier', at: 313, x: 0, reach: ROAD.half + ROAD.verge, wall: true }], length: 700 });
  let flew = 0;
  const { game, types: seen } = ride({ plan }, {
    lean: () => -0.6,
    until: (race) => {
      const rider = race.rivals[0];
      if (rider.s > 305 && rider.s < 315) flew = Math.max(flew, rider.height);
      return false;
    },
  });
  assert.ok(flew > 1, `${flew} metres up over the bales`);
  assert.ok(!seen.includes('rival-crash'));
  assert.equal(game.rivals[0].done, true);
});

test('riders fly off the hills as the child’s bike does, and are slower up them and faster down', () => {
  const plan = planOf({ rivals: [{ skill: 1, lane: 0, from: 7, slips: [] }], hills: [HILL], length: 600 });
  let highest = 0;
  ride({ plan }, {
    lean: () => 0,
    until: (game) => {
      highest = Math.max(highest, game.rivals[0].height);
      return false;
    },
  });
  assert.ok(highest > 1, `${highest} metres up`);
});

test('with nobody in the picture the race waits: the other riders stop where they are, and go on when the child is back', () => {
  const plan = planOf({ rivals: RIVALS([1, 1.05]), length: 2000 });
  const { game } = ride({ plan }, { lean: () => 0, seen: (race, time) => time < 6 || time > 16, until: (race, time) => time > 22 });
  const moved = [];
  const again = ride({ plan: planOf({ rivals: RIVALS([1, 1.05]), length: 2000 }) }, {
    lean: () => 0,
    seen: (race, time) => time < 6 || time > 16,
    until: (race, time) => {
      if (time > 8 && time < 15) moved.push(race.rivals[0].s);
      return time > 22;
    },
  });
  assert.ok(Math.max(...moved) - Math.min(...moved) < 0.01, 'stopped while the child was away');
  assert.ok(again.game.rivals[0].s > Math.max(...moved) + 30, 'and off again');
  // Nobody got away: they're where they would have been next to the child's bike.
  assert.ok(Math.abs(game.rivals[1].s - game.s) < 60, `${game.rivals[1].s - game.s} metres apart`);
});

/* ------------------------------- the road laid out ------------------------------- */

test('the wild ride is laid out with hills, bales, ramps and riders, and the gentle one is the road alone', () => {
  for (const level of [1, 4, 7, 10]) {
    for (const seed of [1, 2, 3, 4, 5]) {
      const plan = layOut({ level, wild: true, random: seeded(seed) });
      const kinds = plan.things.map(({ kind }) => kind);
      const tops = plan.hills.filter(({ slope, bank }) => !slope && !bank);
      assert.ok(plan.rules.wild);
      assert.equal(plan.rivals.length, level < 6 ? 4 : 5, `riders at level ${level}`);
      assert.ok(tops.length + kinds.filter((kind) => kind === 'ramp').length >= 4, `level ${level}, road ${seed}: ${tops.length} hills to fly off and ${kinds.filter((kind) => kind === 'ramp').length} ramps`);
      assert.ok(plan.hills.some(({ slope }) => slope === 'down') && plan.hills.some(({ slope }) => slope === 'up'), 'bends that go downhill, and uphill');
      // Every row of bales right across the road has a ramp a little before it.
      for (const wall of plan.things.filter(({ wall: across }) => across)) {
        assert.ok(plan.things.some(({ kind, at }) => kind === 'ramp' && wall.at - at > 8 && wall.at - at < 20), 'a ramp before the bales');
        assert.ok(wall.reach >= ROAD.half + ROAD.verge, 'right across, grass and all');
      }
      // Nothing is hidden just over the top of a hill: no bales for 60 metres past one.
      for (const top of tops) assert.ok(!plan.things.some(({ kind, at }) => kind === 'barrier' && at > top.at && at < top.at + 60), 'no bales where a bike comes down');
      // Hills are on the straights, where a bike in the air comes down on the road.
      for (const top of tops) assert.ok(!plan.bends.some(({ from, to }) => top.at > from && top.at + 30 < to), 'the top of a hill is not in a bend');
    }
  }
  const gentle = layOut({ level: 10, random: seeded(2) });
  assert.equal(gentle.rules.wild, false);
  assert.deepEqual([gentle.hills.length, gentle.rivals.length], [0, 0]);
  assert.ok(!gentle.things.some(({ kind }) => kind === 'barrier' || kind === 'river'));
  // With friends it's the road alone too, whatever was asked for: they are each other's race.
  const friends = layOut({ level: 10, wild: true, plain: true, random: seeded(2) });
  assert.deepEqual([friends.rules.wild, friends.hills.length, friends.rivals.length], [false, 0, 0]);
});

test('the levels of the wild ride bring more jumps: more of the straights have a second one after the first', () => {
  const jumps = (level) => [1, 2, 3, 4, 5, 6, 7, 8].reduce((sum, seed) => {
    const plan = layOut({ level, wild: true, random: seeded(seed) });
    return sum + plan.hills.filter(({ slope }) => !slope).length + plan.things.filter(({ kind }) => kind === 'ramp').length;
  }, 0) / 8;
  const [first, last] = [jumps(1), jumps(10)];
  assert.ok(first >= 5, `${first} jumps a road at level 1`);
  assert.ok(last > first + 2, `and ${last} at level 10`);
  assert.ok(rideLevel(10, false, true).doubles > rideLevel(1, false, true).doubles);
  assert.equal(rideLevel(10).doubles, 0);
});

test('the riders are each a little better than the last, with the best of them nearest the child on the start line', () => {
  const plan = layOut({ level: 10, wild: true, random: seeded(4) });
  const skills = plan.rivals.map(({ skill }) => skill);
  assert.deepEqual(skills, [...skills].sort((a, b) => a - b));
  assert.deepEqual(plan.rivals.map(({ from }) => from), [35, 28, 21, 14, 7]);
  assert.equal(new Set(plan.rivals.map(({ lane }) => lane)).size, 5, 'each on their own line');
  // Each has something they'll hit, somewhere, on most roads: that's where they're caught.
  const bales = plan.things.filter(({ kind }) => kind === 'barrier').length;
  assert.ok(plan.rivals.every(({ slips }) => slips.length === bales));
});

test('every level of the wild ride brings one new thing, and at level 7 it’s the river, as there are jumps from the start', () => {
  assert.deepEqual(newAt(1, true), []);
  for (let level = 2; level <= 10; level += 1) assert.equal(newAt(level, true).length, 1, `level ${level}`);
  assert.equal(NEW_THINGS_WILD[7][0].id, 'river');
  assert.equal(NEW_THINGS[7][0].id, 'ramp');
  assert.equal(newAt(7, true)[0].name, 'A river to jump');
  assert.equal(newAt(7)[0].name, 'A jump');
  assert.ok(thingsUpTo(10, true).some(({ id }) => id === 'river') && !thingsUpTo(10, true).some(({ id }) => id === 'ramp'));
  // What a level has: ramps from level 1 on the wild ride, and a river from level 7.
  assert.deepEqual([rideLevel(1, false, true).ramp, rideLevel(1).ramp, rideLevel(6, false, true).river, rideLevel(7, false, true).river, rideLevel(7).river], [true, false, false, true, false]);
  // The level's own new thing is on the road, early on.
  for (const seed of [1, 2, 3]) {
    const plan = layOut({ level: 7, wild: true, random: seeded(seed) });
    const rivers = plan.things.filter(({ kind }) => kind === 'river');
    assert.ok(rivers.length >= 1 && rivers[0].at < plan.length * 0.35, 'a river, early on');
    // And its near bank is a ramp right across the road.
    assert.ok(plan.hills.some(({ bank, at }) => bank && rivers[0].from - at > 0 && rivers[0].from - at < 6));
  }
});

/* ------------------------------- whole rides ------------------------------- */

test('a child who looks where they’re going gets round the wild ride at every level, flying, and in the race to the end', () => {
  const places = [];
  for (let level = 1; level <= 10; level += 1) {
    const { game, time } = ride({ level, wild: true, random: seeded(level + 20) }, { lean: (race) => looksAhead(race), seed: level });
    const { stats } = game;
    assert.equal(game.state, 'finished', `level ${level}`);
    assert.ok(stats.jumps >= 3, `level ${level}: ${stats.jumps} jumps`);
    assert.ok(stats.air > 3, `level ${level}: ${stats.air} seconds in the air`);
    assert.ok(stats.place >= 1 && stats.place <= stats.riders, `level ${level}: ${stats.place} of ${stats.riders}`);
    places.push(stats.place);
    assert.equal(stats.tows, 0);
    assert.ok(time < 200, `level ${level} took ${time} seconds`);
    assert.ok(Number.isFinite(game.s) && Number.isFinite(game.x) && Number.isFinite(game.v));
  }
  // Riding well, without a trick: about third, and never last.
  const mean = places.reduce((sum, place) => sum + place, 0) / places.length;
  assert.ok(mean >= 1.5 && mean <= 3.6, `places: ${places}`);
  assert.ok(places.every((place) => place <= 5), `places: ${places}`);
});

test('riding well wins against easy riders, is on the podium in a fair race, and against hard ones it’s a place in the middle', () => {
  const places = (rivalry, child = {}) => [1, 2, 3, 4, 5, 6].map((seed) => ride({ level: 1, wild: true, rivalry, random: seeded(seed) }, { lean: (race) => looksAhead(race, child), seed }).game.stats.place);
  const sum = (list) => list.reduce((total, place) => total + place, 0);
  const [easy, fair, hard] = [places('easy'), places('medium'), places('hard')];
  assert.ok(easy.every((place) => place <= 2) && easy.filter((place) => place === 1).length >= 3, `against easy riders: ${easy}`);
  assert.ok(sum(easy) < sum(fair), `easy: ${easy}, fair: ${fair}`);
  // About third of five, riding well with no tricks.
  assert.ok(fair.every((place) => place >= 2 && place <= 4), `in a fair race: ${fair}`);
  assert.ok(sum(fair) / fair.length <= 3.2, `in a fair race: ${fair}`);
  assert.ok(sum(hard) >= sum(fair) && sum(hard) > sum(easy) + 6, `against hard ones: ${hard}`);
  // Tricks in the air are what wins a fair race: better placed with them than without, on the same roads.
  const tricky = places('medium', { tricks: true });
  assert.ok(sum(tricky) < sum(fair), `with tricks: ${tricky}, without: ${fair}`);
  assert.ok(tricky.filter((place) => place <= 2).length >= 4, `with tricks: ${tricky}`);
  // A child whose lean is a little over half what the bends need, and slow to come, is further back.
  const sloppy = places('medium', { skill: 0.6 });
  assert.ok(sum(sloppy) >= sum(fair), `leaning less: ${sloppy}`);
});

test('a child who never leans still gets to the top of the wild ride, last, with nothing lost but the race', () => {
  const { game } = ride({ level: 5, wild: true, random: seeded(9) }, { lean: () => 0 });
  assert.equal(game.state, 'finished');
  assert.equal(game.stats.place, game.stats.riders);
  assert.ok(game.stats.tows >= 5, 'helped round the bends');
});
