// The rules and stories of the games with a mission. Each one's screen is tested in test/e2e.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { GIFTS, Journey, NEW_THINGS as WALK_NEW_THINGS, Picking, STOPS, featuresAt, newAt as walkNew, stopsAt, walkAt, warm } from '../../games/giraffe-walk/journey.js';
import { DAY, FRUITS, GOLDEN_COINS, NEW_THINGS as SMOOTHIE_NEW_THINGS, POWER_SECONDS as SMOOTHIE_POWER_SECONDS, Stand, fairAt, nearestOnPath, newAt as smoothieNew } from '../../games/smoothie-stand/orders.js';
import { CLEAN_ENOUGH, LANTERN_SCALE, Mud, NEW_THINGS, POWER_SECONDS, SHIPS, Storm, newAt as lighthouseNew, stormAt } from '../../games/lighthouse/storm.js';

const eventsOf = () => {
  const events = [];
  return { events, onEvent: (event) => events.push(event), types: () => events.map(({ type }) => type) };
};

/* ---------- Giraffe's Smoothie Stand ---------- */

test('slicing what\'s on the order finishes it, and what isn\'t on it doesn\'t count', () => {
  const log = eventsOf();
  const stand = new Stand({ onEvent: log.onEvent });
  stand.nextCustomer();
  assert.deepEqual(stand.customer.order, { apple: 4 });
  assert.equal(stand.slice('orange'), 'extra');
  assert.equal(stand.left.apple, 4);
  for (let i = 0; i < 4; i += 1) assert.equal(stand.slice('apple'), 'wanted');
  assert.equal(stand.stats.smoothies, 1);
  assert.ok(log.types().includes('order-done'));
});

test('going through every customer ends the day, and each gets their smoothie', () => {
  const log = eventsOf();
  const stand = new Stand({ onEvent: log.onEvent });
  for (const { order } of DAY) {
    stand.nextCustomer();
    for (const [kind, count] of Object.entries(order)) {
      for (let i = 0; i < count; i += 1) stand.slice(kind);
    }
  }
  stand.nextCustomer();
  assert.ok(stand.over);
  assert.equal(stand.stats.smoothies, DAY.length);
  assert.equal(log.types().at(-1), 'day-over');
});

test('the short day has three customers, and still ends with the judge', () => {
  const stand = new Stand({ short: true });
  assert.equal(stand.customers.length, 3);
  assert.equal(stand.customers.at(-1).who, 'bramble');
});

test('something on the order is never far away, and only some customers bring rotten fruit', () => {
  let roll = 0;
  const random = () => {
    roll = (roll * 16807 + 11) % 2147483647 || 1;
    return (roll % 1000) / 1000;
  };
  const stand = new Stand({ random });
  for (const { order, rotten } of DAY) {
    stand.nextCustomer();
    let sinceWanted = 0;
    let sawRotten = false;
    for (let i = 0; i < 400; i += 1) {
      const kind = stand.nextFruit();
      if (kind === 'rotten') sawRotten = true;
      if (kind in order) sinceWanted = 0;
      else sinceWanted += 1;
      assert.ok(sinceWanted <= 2, 'too long without anything on the order');
      assert.ok(kind === 'rotten' || FRUITS.includes(kind));
    }
    assert.equal(sawRotten, Boolean(rotten));
    for (const [kind, count] of Object.entries(order)) {
      for (let i = 0; i < count; i += 1) stand.slice(kind);
    }
  }
});

test('a fast swipe counts along the whole of its path, not only where it ended', () => {
  assert.equal(nearestOnPath(0, 0, 100, 0, 50, 10), 10);
  assert.equal(nearestOnPath(0, 0, 100, 0, 150, 0), 50);
  assert.equal(nearestOnPath(5, 5, 5, 5, 5, 15), 10);
});

/* ---------- Giraffe's Long Walk Home ---------- */

test('feeding Giraffe at every stop brings him home', () => {
  const log = eventsOf();
  const journey = new Journey({ onEvent: log.onEvent });
  journey.nextStop();
  for (const { count } of STOPS) {
    assert.equal(journey.fed, 0);
    for (let i = 0; i < count; i += 1) journey.feed();
    assert.equal(log.types().at(-1), 'stop-done');
    journey.nextStop();
  }
  assert.ok(journey.over);
  assert.equal(log.types().at(-1), 'home');
  assert.equal(journey.progress, 1);
});

test('the way home only goes forward, and dropping fruit costs nothing', () => {
  const journey = new Journey();
  journey.nextStop();
  journey.feed();
  const before = journey.progress;
  journey.dropped();
  assert.equal(journey.progress, before);
  assert.equal(journey.stats.dropped, 1);
  assert.ok(journey.progress > 0);
});

test('a closed hand picks a fruit up, and an open hand lets it go', () => {
  const picking = new Picking();
  const fruit = { id: 1 };
  const step = (change) => picking.update(0.1, { closed: false, seen: true, near: null, onMouth: false, ...change });
  // An open hand can't pick, and a hand has to stay closed for a moment.
  assert.equal(step({ near: fruit }), null);
  assert.equal(step({ closed: true, near: fruit }), null);
  assert.equal(step({ closed: true, near: fruit }), 'picked');
  assert.equal(picking.held, fruit);
  assert.equal(step({ closed: true }), null);
  assert.equal(step({ onMouth: true }), 'fed');
  assert.equal(picking.held, null);
});

test('a fist kept closed after taking the basket or the feather has to open before it picks a fruit', () => {
  const picking = new Picking();
  const basket = { kind: 'basket' };
  const fruit = { kind: 'fig' };
  const step = (change) => picking.update(0.1, { closed: true, seen: true, near: fruit, onMouth: false, ...change });
  step({ near: basket });
  assert.equal(step({ near: basket }), 'picked');
  // The basket goes onto the hand rather than being carried.
  picking.used();
  assert.equal(picking.held, null);
  // Still closed, and on a fruit, it takes nothing, however long it stays.
  for (let i = 0; i < 30; i += 1) assert.equal(step(), null);
  // Nor if it goes out of the picture and comes back closed.
  assert.equal(step({ seen: false }), null);
  for (let i = 0; i < 5; i += 1) assert.equal(step(), null);
  // Opening and closing again does, as usual.
  assert.equal(step({ closed: false }), null);
  assert.equal(step(), null);
  assert.equal(step(), 'picked');
  assert.equal(picking.held, fruit);
});

test('letting go somewhere else drops it, and so does the hand leaving the picture', () => {
  const picking = new Picking();
  const fruit = { id: 1 };
  const holdIt = () => {
    picking.update(0.2, { closed: true, seen: true, near: fruit, onMouth: false });
    assert.equal(picking.held, fruit);
  };
  holdIt();
  assert.equal(picking.update(0.1, { closed: false, seen: true, near: null, onMouth: false }), 'dropped');
  holdIt();
  assert.equal(picking.update(0.1, { closed: false, seen: false, near: null, onMouth: false }), 'dropped');
  assert.equal(picking.held, null);
});

/* ---------- The Lighthouse Keeper ---------- */

test('wiping the same place twice cleans nothing new', () => {
  const mud = new Mud();
  const first = mud.wipe(0.5, 0.5, 0.2, 0.3);
  assert.ok(first > 0);
  assert.equal(mud.wipe(0.5, 0.5, 0.2, 0.3), 0);
  assert.equal(mud.share, first / mud.cells.length);
});

test('a window has to be wiped nearly all over before its ship can come in', () => {
  const log = eventsOf();
  const storm = new Storm({ onEvent: log.onEvent });
  storm.nextShip();
  // Only the left half of the window, however many times.
  for (let i = 0; i < 40; i += 1) storm.wipe((i % 10) / 20, (i % 7) / 7, 0.05, 0.15);
  assert.ok(storm.mud.share < CLEAN_ENOUGH);
  assert.ok(!log.types().includes('window-clean'));
  for (let x = 0; x <= 1; x += 0.05) {
    for (let y = 0; y <= 1; y += 0.1) storm.wipe(x, y, 0.1, 0.15);
  }
  assert.equal(log.types().filter((type) => type === 'window-clean').length, 1);
});

test('every ship coming home calms the storm, and the last one ends it', () => {
  const log = eventsOf();
  const storm = new Storm({ onEvent: log.onEvent });
  storm.nextShip();
  for (let index = 0; index < SHIPS.length; index += 1) {
    assert.equal(storm.calm, index / SHIPS.length);
    storm.shipHome();
    storm.nextShip();
  }
  assert.ok(storm.over);
  assert.equal(storm.calm, 1);
  assert.equal(log.types().at(-1), 'all-home');
});

test('a shorter storm still has Bramble and the honey in it, last of all', () => {
  const storm = new Storm({ ships: 2 });
  assert.deepEqual(storm.ships.map(({ who }) => who), ['frost', 'bramble']);
});

/* ---------- all of them ---------- */

const MOST_WORDS = 11; // Children are here to move, and nobody's waiting for anyone to finish talking.

for (const game of ['smoothie-stand', 'giraffe-walk', 'lighthouse', 'robot-rescue']) {
  test(`${game} keeps its talking short, and everything it says has a voice in both languages`, () => {
    const folder = new URL(`../../games/${game}/audio/voice/`, import.meta.url);
    const lines = JSON.parse(readFileSync(new URL('lines.json', folder)));
    for (const { id, text, ka } of lines) {
      assert.ok(text.split(/\s+/).length <= MOST_WORDS, `too long: ${text}`);
      assert.match(ka, /[Ⴀ-ჿ]/, id);
      for (const language of ['en', 'ka']) assert.ok(existsSync(new URL(`${language}/${id}.ogg`, folder)), `${language}/${id}`);
    }
    const source = readFileSync(new URL(`../../games/${game}/main.js`, import.meta.url), 'utf8');
    const rules = readFileSync(new URL(`../../games/${game}/${{ 'smoothie-stand': 'orders', 'giraffe-walk': 'journey', lighthouse: 'storm', 'robot-rescue': 'rescue' }[game]}.js`, import.meta.url), 'utf8');
    for (const { text } of lines) assert.ok(source.includes(text) || rules.includes(text), `nothing says: ${text}`);
  });
}

test('nobody has anything to say between one fruit and the next, or one stop and the next', () => {
  // Only the last customer and the last stop have words to finish on.
  assert.deepEqual(DAY.filter(({ thanks }) => thanks).map(({ who }) => who), ['bramble']);
  assert.deepEqual(STOPS.filter(({ done }) => done).map(({ place }) => place), ['home']);
});

/* ---------- levels ---------- */

const LEVELS = Array.from({ length: 10 }, (_, index) => index + 1);

/** A seeded random, so that a test goes the same way every time. */
const seeded = (seed = 7) => {
  let roll = seed;
  return () => {
    roll = (roll * 16807) % 2147483647;
    return (roll - 1) / 2147483646;
  };
};

/**
 * Each level is the same or harder than the one before in every way, and harder in at least one.
 * harder gives each thing a number that's bigger when it's harder.
 */
function climbsEveryLevel(at, harder) {
  for (const level of LEVELS.slice(1)) {
    const [before, now] = [at(level - 1), at(level)];
    let harderIn = 0;
    for (const [key, score] of Object.entries(harder)) {
      const [a, b] = [score(before[key]), score(now[key])];
      assert.ok(b >= a - 1e-9, `level ${level} is easier in ${key}`);
      if (b > a + 1e-9) harderIn += 1;
    }
    assert.ok(harderIn > 0, `level ${level} is no harder than ${level - 1}`);
  }
  // Nothing about a level is left out of that.
  assert.deepEqual(Object.keys(at(1)).sort(), Object.keys(harder).sort());
}
const more = (value) => Number(value);
const less = (value) => -value;

/* The Lighthouse Keeper */

test('lighthouse: level 1 is the storm as it always was', () => {
  const level = stormAt(1);
  assert.equal(level.splats, 0);
  assert.deepEqual(level.lumps, []);
  assert.equal(level.swell, 1);
  assert.deepEqual([level.shells, level.crabs, level.powers.length, level.night, level.chest], [0, 0, 0, false, false]);
  const storm = new Storm({ level: 1 });
  storm.nextShip();
  assert.deepEqual(storm.coming, []);
  assert.deepEqual(storm.prizes, []);
  for (let x = 0; x <= 1; x += 0.05) for (let y = 0; y <= 1; y += 0.1) storm.wipe(x, y, 0.1, 0.15, 0.5);
  storm.update(0.1, { hand: { x: 0.5, y: 0.5, sizeX: 0.1, sizeY: 0.15 } });
  assert.equal(storm.stats.splats + storm.stats.lumps + storm.treasure, 0);
  assert.equal(storm.wipeScale, 1);
  assert.ok(storm.clean);
  assert.deepEqual(lighthouseNew(1), []);
});

test('lighthouse: each level is a little harder than the one before', () => {
  climbsEveryLevel(stormAt, {
    splats: more,
    splatFrom: less,
    splatSize: more,
    shells: more,
    crabs: more,
    crabSpeed: more,
    lumps: (kinds) => kinds.length,
    weedRub: more,
    starRub: more,
    creep: more,
    hold: more,
    powers: (kinds) => kinds.length,
    night: more,
    chest: more,
    swell: more,
  });
});

// Whether each new thing is switched on, in a level's numbers.
const LIGHTHOUSE_ON = {
  splats: (at) => at.splats > 0,
  shells: (at) => at.shells > 0,
  crab: (at) => at.crabs > 0,
  weed: (at) => at.lumps.includes('weed'),
  lantern: (at) => at.powers.includes('lantern'),
  star: (at) => at.lumps.includes('star'),
  bubble: (at) => at.powers.includes('bubble'),
  night: (at) => at.night,
  clam: (at) => at.lumps.includes('clam'),
  gull: (at) => at.powers.includes('gull'),
  chest: (at) => at.chest,
};
// What a storm brings onto the glass, by what newAt calls it.
const LIGHTHOUSE_SHOWS = { splats: 'splat', crab: 'crab', weed: 'weed', lantern: 'lantern', star: 'star', bubble: 'bubble', clam: 'clam', gull: 'gull', chest: 'chest' };

test('lighthouse: every level from 2 brings something new, switched on from that level and kept after it', () => {
  const seen = new Set();
  for (const level of LEVELS.slice(1)) {
    const news = lighthouseNew(level);
    assert.ok(news.length > 0, `nothing new at level ${level}`);
    for (const { key, mark, name, nameKa } of news) {
      assert.ok(mark && name && nameKa, key);
      assert.ok(name.split(' ').length <= 3, name);
      assert.match(nameKa, /[Ⴀ-ჿ]/, key);
      assert.ok(!seen.has(key), `${key} is new twice`);
      seen.add(key);
      assert.ok(LIGHTHOUSE_ON[key], `nothing checks ${key}`);
      assert.equal(LIGHTHOUSE_ON[key](stormAt(level - 1)), false, `${key} is already on before level ${level}`);
      for (const later of LEVELS.filter((at) => at >= level)) assert.equal(LIGHTHOUSE_ON[key](stormAt(later)), true, `${key} is off at level ${later}`);
      // And it really comes, on the first window, however many ships a grown-up chose.
      for (const ships of [2, 4]) {
        const storm = new Storm({ level, ships, random: seeded(level) });
        const planned = storm.ships.flatMap((_, index) => storm.plan(index).map(({ what }) => what));
        if (LIGHTHOUSE_SHOWS[key]) assert.ok(planned.includes(LIGHTHOUSE_SHOWS[key]), `${key} never comes at level ${level} with ${ships} ships`);
        if (key !== 'chest' && LIGHTHOUSE_SHOWS[key]) assert.ok(storm.plan(0).some(({ what }) => what === LIGHTHOUSE_SHOWS[key]), `${key} isn't on the first window at level ${level}`);
      }
    }
  }
  assert.deepEqual([...seen].sort(), Object.keys(NEW_THINGS).sort());
});

/** Wipes the whole window, row by row, the way a child sweeps across it. */
const sweep = (storm, moved = 0.3) => {
  for (let y = 0.05; y <= 1; y += 0.1) for (let x = 0; x <= 1; x += 0.03) storm.wipe(x, y, 0.1, 0.15, moved);
};
const HAND = { sizeX: 0.1, sizeY: 0.15 };
const handAt = (thing) => ({ ...HAND, x: thing.x, y: thing.y });

test('lighthouse: shells hidden in the mud pop out as it\'s wiped, and an open hand nearby picks them up', () => {
  const log = eventsOf();
  const storm = new Storm({ level: 2, random: seeded(5), onEvent: log.onEvent });
  storm.nextShip();
  assert.equal(storm.prizes.length, 2);
  assert.ok(storm.prizes.every(({ hidden, kind }) => hidden && kind === 'shell'));
  const [shell] = storm.prizes;
  // A hand on it doesn't find it while it's under the mud.
  storm.update(1, { hand: handAt(shell) });
  assert.equal(storm.treasure, 0);
  storm.wipe(shell.x, shell.y, 0.05, 0.05);
  assert.equal(shell.hidden, false);
  assert.ok(log.types().includes('prize-out'));
  // It pops out for a moment first, then a hand nearby, not right on it, draws it in and picks it up.
  storm.update(0.1, { hand: { ...HAND, x: shell.x + 0.4, y: shell.y } });
  assert.equal(storm.treasure, 0);
  const from = shell.x;
  for (let i = 0; i < 10; i += 1) storm.update(0.1, { hand: { ...HAND, x: from + 0.32, y: shell.y } });
  assert.ok(shell.x > from, 'it drifted towards the hand');
  for (let i = 0; i < 20 && storm.treasure === 0; i += 1) storm.update(0.1, { hand: { ...HAND, x: from + 0.32, y: shell.y } });
  assert.equal(storm.treasure, 1);
  assert.equal(storm.stats.shells, 1);
  assert.equal(log.events.filter(({ type }) => type === 'prize').length, 1);
  // No hand, or a far-off one, picks nothing up.
  const [other] = storm.prizes;
  storm.wipe(other.x, other.y, 0.05, 0.05);
  storm.update(2, {});
  storm.update(2, { hand: { ...HAND, x: other.x > 0.5 ? 0 : 1, y: 0 } });
  assert.equal(storm.treasure, 1);
});

test('lighthouse: when a window comes clean, everything on it is kept, even a shell still under the mud', () => {
  const storm = new Storm({ level: 2, random: seeded(9) });
  storm.nextShip();
  const [first] = storm.prizes;
  storm.wipe(first.x, first.y, 0.05, 0.05);
  // Everything else, but around the other shell.
  const [, second] = storm.prizes;
  for (let y = 0.05; y <= 1; y += 0.05) {
    for (let x = 0; x <= 1; x += 0.03) if (Math.hypot(x - second.x, y - second.y) > 0.16) storm.wipe(x, y, 0.04, 0.05);
  }
  assert.ok(storm.clean);
  assert.equal(storm.treasure, 2, 'the shell still under the last of the mud is found too');
  assert.deepEqual(storm.prizes, []);
});

test('lighthouse: a crab that was never touched still gives up its pearl when its window comes clean', () => {
  const storm = new Storm({ level: 3, random: seeded(2) });
  storm.nextShip();
  for (let y = 0.05; y <= 0.3; y += 0.1) for (let x = 0; x <= 1; x += 0.03) storm.wipe(x, y, 0.1, 0.15);
  assert.equal(storm.crabs.length, 1);
  const before = storm.treasure;
  for (let y = 0.05; y <= 1; y += 0.05) for (let x = 0; x <= 1; x += 0.03) storm.wipe(x, y, 0.04, 0.05);
  // Anything else stuck on the glass has to come off too: rubbed, as a hand would.
  for (let i = 0; i < 400 && !storm.clean; i += 1) storm.update(1 / 30, { x: 0.5, y: 0.5, sizeX: 0.6, sizeY: 0.6 });
  assert.ok(storm.clean);
  assert.equal(storm.crabs.length, 0);
  assert.ok(storm.treasure >= before + 1, `treasure ${storm.treasure} from ${before}`);
  assert.equal(storm.stats.pearls >= 1, true);
});

test('lighthouse: from level 3, a crab walks back and forth with a pearl, and lets go of it for an open hand', () => {
  const log = eventsOf();
  const storm = new Storm({ level: 3, random: seeded(2), onEvent: log.onEvent });
  storm.nextShip();
  for (let y = 0.05; y <= 0.3; y += 0.1) for (let x = 0; x <= 1; x += 0.03) storm.wipe(x, y, 0.1, 0.15);
  assert.equal(storm.crabs.length, 1);
  assert.ok(!storm.clean);
  const [crab] = storm.crabs;
  // It walks, and turns back at the edge of the middle, however long nobody comes.
  const xs = [];
  for (let i = 0; i < 1200; i += 1) {
    storm.update(0.05);
    xs.push(crab.x);
  }
  assert.ok(Math.max(...xs) - Math.min(...xs) > 0.5);
  assert.ok(xs.every((x) => x >= 0.14 && x <= 0.86));
  assert.equal(storm.crabs.length, 1);
  storm.update(0.05, { hand: handAt(crab) });
  assert.equal(storm.crabs.length, 0);
  assert.equal(storm.stats.crabs, 1);
  const pearl = storm.prizes.find(({ kind }) => kind === 'pearl');
  assert.ok(pearl && !pearl.hidden);
  for (let i = 0; i < 10; i += 1) storm.update(0.1, { hand: handAt(pearl) });
  assert.equal(storm.stats.pearls, 1);
});

test('lighthouse: a crab let go of as its window comes clean walks off, rather than vanishing', () => {
  const log = eventsOf();
  const storm = new Storm({ level: 3, random: seeded(4), onEvent: log.onEvent });
  storm.nextShip();
  for (let y = 0.05; y <= 0.3; y += 0.1) for (let x = 0; x <= 1; x += 0.03) storm.wipe(x, y, 0.1, 0.15);
  const [crab] = storm.crabs;
  assert.ok(crab);
  sweep(storm);
  assert.ok(storm.clean);
  // The screen is told, so it can show the crab going, and the crab wasn't counted as touched.
  const off = log.events.filter(({ type }) => type === 'crab-off');
  assert.deepEqual(off.map((event) => event.crab), [crab]);
  assert.equal(storm.stats.crabs, 0);
  assert.ok(log.types().indexOf('crab-off') < log.types().indexOf('window-clean'));
});

test('lighthouse: the gull\'s wipe isn\'t the hand, so a splat it sets off still lands away from the hand', () => {
  const log = eventsOf();
  const storm = new Storm({ level: 2, random: seeded(3), onEvent: log.onEvent });
  storm.nextShip();
  const { at } = storm.coming.find(({ what }) => what === 'splat');
  // The hand wipes the left of the window, up to just before the splat, ending at the left edge.
  for (let x = 0.02; x <= 0.5 && storm.mud.share < at - 0.08; x += 0.04) for (let y = 0.05; y <= 1 && storm.mud.share < at - 0.08; y += 0.1) storm.wipe(x, y, 0.06, 0.1);
  storm.wipe(0.1, 0.5, 0.06, 0.1);
  const hand = { ...storm.lastWipe };
  assert.deepEqual(log.types().filter((type) => type === 'splat'), []);
  // The gull goes across the right of the window, which sets the splat off.
  for (let x = 0.98; x >= 0.5 && !log.types().includes('splat'); x -= 0.02) storm.wipe(x, 0.5, 0.1, 0.2, 0, { byHand: false });
  assert.deepEqual(storm.lastWipe, hand, 'the gull doesn\'t move where the hand is');
  const splat = log.events.find(({ type }) => type === 'splat');
  assert.ok(splat, 'the gull set it off');
  assert.ok(Math.hypot(splat.x - hand.x, splat.y - hand.y) >= 0.3, `the splat landed by the hand, at ${splat.x}, ${splat.y}`);
});

test('lighthouse: for less motion, crabs walk at half speed', () => {
  const storm = new Storm({ level: 3, random: seeded(2) });
  storm.nextShip();
  storm.addCrab();
  const [crab] = storm.crabs;
  crab.x = 0.5;
  storm.update(1, {});
  const full = Math.abs(crab.x - 0.5);
  crab.x = 0.5;
  storm.update(1, { still: true });
  assert.ok(Math.abs(Math.abs(crab.x - 0.5) - full / 2) < 1e-9);
});

test('lighthouse: a crab doesn\'t keep a window from being clean', () => {
  const storm = new Storm({ level: 3, random: seeded(4) });
  storm.nextShip();
  sweep(storm);
  assert.ok(storm.clean);
  // And its pearl is kept for the child, as nothing on a window is missed.
  assert.equal(storm.crabs.length, 0);
  assert.ok(storm.stats.pearls >= 1);
});

test('lighthouse: at level 10, mud lands back on clean glass, and the oyster opens for a hand held open on it', () => {
  const log = eventsOf();
  const storm = new Storm({ level: 10, random: seeded(), onEvent: log.onEvent });
  storm.nextShip();
  // Wiping with a hand that's still each time it touches: it wipes mud, but rubs nothing off.
  for (let i = 0; i < 3; i += 1) sweep(storm, 0);
  const splats = log.events.filter(({ type }) => type === 'splat');
  assert.equal(splats.length, 2);
  // Each landed on glass that had been wiped, so there was mud to wipe again.
  for (const { covered } of splats) assert.ok(covered > 0);
  assert.deepEqual(storm.lumps.map(({ kind }) => kind), ['clam']);
  assert.ok(storm.mud.share >= CLEAN_ENOUGH);
  assert.ok(!storm.clean, 'the oyster is still on it');
  // Rubbing doesn't open it: a hand held on it does, adding up however it comes and goes.
  sweep(storm, 1);
  assert.equal(storm.lumps.length, 1);
  const [clam] = storm.lumps;
  storm.update(0.5, { hand: handAt(clam) });
  storm.update(3, {});
  storm.update(0.5, { hand: { ...HAND, x: 0.02, y: 0.02 } });
  assert.equal(storm.lumps.length, 1);
  assert.ok(Math.abs(clam.rubbed - 0.5) < 1e-9);
  for (let i = 0; i < 20 && storm.lumps.length; i += 1) storm.update(0.1, { hand: handAt(clam) });
  assert.ok(storm.clean);
  assert.deepEqual(log.types().filter((type) => ['lump-off', 'window-clean'].includes(type)), ['lump-off', 'window-clean']);
  // It left its pearl, which was out on the glass, so it was kept.
  assert.ok(storm.stats.pearls >= 1);
});

test('lighthouse: seaweed and starfish take a rub, and each leaves treasure', () => {
  for (const [level, index, kind, leaves] of [[4, 0, 'weed', 'shell'], [6, 0, 'star', 'pearl'], [6, 1, 'weed', 'shell']]) {
    const log = eventsOf();
    const storm = new Storm({ level, random: seeded(level), onEvent: log.onEvent });
    storm.nextShip();
    for (let i = 0; i < index; i += 1) {
      storm.shipHome();
      storm.nextShip();
    }
    for (let i = 0; i < 3; i += 1) sweep(storm, 0);
    assert.deepEqual(storm.lumps.map((lump) => lump.kind), [kind]);
    sweep(storm);
    assert.ok(storm.clean);
    const off = log.types().lastIndexOf('lump-off');
    assert.ok(off >= 0);
    assert.equal(log.events[off + 1].type, 'prize-out');
    assert.equal(log.events[off + 1].prize.kind, leaves, `${kind} at level ${level}`);
    // And it was kept, being out on the glass when the window came clean.
    assert.ok(log.events.some(({ type, prize }) => type === 'prize' && prize === log.events[off + 1].prize));
  }
});

test('lighthouse: from level 6, starfish creep about but never leave the middle, and keep still for less motion', () => {
  const storm = new Storm({ level: 6, random: seeded(3) });
  storm.nextShip();
  assert.deepEqual(storm.coming.map(({ what }) => what).filter((what) => ['weed', 'star', 'clam'].includes(what)), ['star']);
  storm.addLump('star');
  const [star] = storm.lumps;
  const from = { x: star.x, y: star.y };
  for (let i = 0; i < 600; i += 1) storm.update(1 / 30);
  assert.ok(Math.hypot(star.x - from.x, star.y - from.y) > 0.01);
  assert.ok(star.x >= 0.14 && star.x <= 0.86 && star.y >= 0.18 && star.y <= 0.82);
  // It stays until it's rubbed off, however long that takes: nothing on the glass has a time limit.
  assert.equal(storm.lumps.length, 1);
  const still = { x: star.x, y: star.y };
  storm.update(5, { still: true });
  assert.deepEqual({ x: star.x, y: star.y }, still);
});

test('lighthouse: the big lantern makes wiping bigger for a while, counting down only while a hand wipes', () => {
  const log = eventsOf();
  const storm = new Storm({ level: 5, random: seeded(6), onEvent: log.onEvent });
  storm.nextShip();
  for (let y = 0.05; y <= 0.5; y += 0.1) for (let x = 0; x <= 1; x += 0.03) storm.wipe(x, y, 0.1, 0.15);
  assert.deepEqual(storm.powers.map(({ kind }) => kind), ['lantern']);
  const [lantern] = storm.powers;
  // It pops out for a moment first, so it's seen.
  storm.update(0.1, { hand: handAt(lantern) });
  assert.equal(storm.powers.length, 1);
  storm.update(1, {});
  storm.update(0.1, { hand: handAt(lantern) });
  assert.equal(storm.powers.length, 0);
  assert.equal(storm.wipeScale, LANTERN_SCALE);
  assert.ok(log.types().includes('power'));
  // Resting doesn't use it up.
  storm.update(30, {});
  assert.equal(storm.active.lantern, POWER_SECONDS.lantern);
  for (let i = 0; i < 70; i += 1) storm.update(0.1, { hand: { ...HAND, x: 0.5, y: 0.9 } });
  assert.equal(storm.wipeScale, 1);
});

test('lighthouse: mud splats bounce off the bubble shield', () => {
  const log = eventsOf();
  const storm = new Storm({ level: 7, random: seeded(8), onEvent: log.onEvent });
  storm.nextShip();
  // Up to just before the first splat, then the bubble.
  const firstSplat = storm.coming.find(({ what }) => what === 'splat').at;
  for (let y = 0.05; y <= 1 && storm.mud.share < firstSplat - 0.06; y += 0.1) for (let x = 0; x <= 1 && storm.mud.share < firstSplat - 0.06; x += 0.03) storm.wipe(x, y, 0.1, 0.15);
  assert.deepEqual(storm.powers.map(({ kind }) => kind), ['bubble']);
  storm.update(1, {});
  storm.update(0.1, { hand: handAt(storm.powers[0]) });
  assert.ok(storm.active.bubble > 0);
  const share = storm.mud.share;
  storm.splat();
  assert.equal(storm.mud.share, share);
  assert.equal(storm.stats.bounced, 1);
  assert.ok(log.types().includes('splat-bounced'));
  // Without it, the next one lands.
  storm.active.bubble = 0;
  storm.splat();
  assert.ok(storm.mud.share < share);
});

test('lighthouse: from level 9, the gull power-up sends the gull across the muddiest part', () => {
  const log = eventsOf();
  const storm = new Storm({ level: 9, random: seeded(1), onEvent: log.onEvent });
  storm.nextShip();
  // The top half wiped, so the mud is lower down.
  for (let y = 0.05; y <= 0.45; y += 0.05) for (let x = 0; x <= 1; x += 0.03) storm.wipe(x, y, 0.05, 0.08);
  assert.deepEqual(storm.powers.map(({ kind }) => kind), ['gull']);
  storm.update(1, {});
  storm.update(0.1, { hand: handAt(storm.powers[0]) });
  const gull = log.events.find(({ type }) => type === 'gull');
  assert.ok(gull);
  assert.ok(gull.y > 0.5, `${gull.y}`);
});

test('lighthouse: at level 10, the last window has a treasure chest, which opens into five coins', () => {
  for (const ships of [2, 4]) {
    const storm = new Storm({ level: 10, ships, random: seeded(ships) });
    for (let index = 0; index < ships; index += 1) {
      storm.nextShip();
      const chest = storm.coming.some(({ what }) => what === 'chest');
      assert.equal(chest, index === ships - 1, `window ${index} of ${ships}`);
      storm.shipHome();
    }
  }
  const log = eventsOf();
  const storm = new Storm({ level: 10, ships: 2, random: seeded(12), onEvent: log.onEvent });
  storm.nextShip();
  storm.shipHome();
  storm.nextShip();
  for (let i = 0; i < 2; i += 1) sweep(storm, 0);
  const chest = storm.lumps.find(({ kind }) => kind === 'chest');
  assert.ok(chest);
  for (let i = 0; i < 20 && storm.lumps.includes(chest); i += 1) storm.update(0.1, { hand: handAt(chest) });
  assert.ok(!storm.lumps.includes(chest));
  const coins = storm.prizes.filter(({ kind }) => kind === 'coin');
  assert.equal(coins.length, 5);
  for (let i = 0; i < 30; i += 1) storm.update(0.1, { hand: handAt(chest) });
  assert.equal(storm.stats.coins, 5);
});

test('lighthouse: nothing new comes while resting, as it all comes from wiping', () => {
  const log = eventsOf();
  const storm = new Storm({ level: 10, onEvent: log.onEvent });
  storm.nextShip();
  for (let i = 0; i < 1000; i += 1) storm.update(0.1);
  assert.deepEqual(log.types(), ['ship']);
});

// What a window takes, roughly, to check the limits on a level. These are guesses about a child, and
// only the comparison between levels matters: wiping a whole window takes about 18 seconds in about 11
// sweeps, a splat takes one more sweep of about 1.5 seconds, rubbing goes at about two lengths of a
// wipe a second, after about a second to reach it, and an oyster or chest takes a second to reach and
// then its hold. A crab or a power-up takes about half a second to reach, the lantern and the gull
// each save about 3 seconds, and the bubble shield saves the splats after it. Treasure is picked up
// on the way, or comes to the hand.
const WINDOW = { seconds: 18, sweeps: 11, between: 2.4 + 0.4, end: 1.6 };
function lighthouseLoad(level, ships = 4) {
  const at = stormAt(level);
  let seconds = 0;
  let sweeps = 0;
  for (let index = 0; index < ships; index += 1) {
    const plan = new Storm({ level, ships }).plan(index);
    seconds += WINDOW.seconds + WINDOW.between;
    sweeps += WINDOW.sweeps;
    let shield = false;
    for (const { what } of plan) {
      if (what === 'splat') {
        if (!shield) {
          seconds += 1.5;
          sweeps += 1;
        }
      } else if (what === 'weed' || what === 'star') {
        const rub = what === 'weed' ? at.weedRub : at.starRub;
        seconds += 1 + rub / 2;
        sweeps += rub / 2;
      } else if (what === 'clam' || what === 'chest') {
        seconds += 1 + at.hold;
        sweeps += 1;
      } else if (what === 'crab') {
        seconds += 0.5;
        sweeps += 0.5;
      } else {
        seconds += 0.5 - (what === 'bubble' ? 0 : 3);
        sweeps += 0.5;
        shield = what === 'bubble';
      }
    }
  }
  seconds += WINDOW.end;
  return { seconds, perMinute: (sweeps / seconds) * 60, reactSeconds: Infinity };
}

test('lighthouse: level 10 is still within reach: at most a third longer, and not twice the moves', () => {
  for (const ships of [2, 4]) {
    const [first, last] = [lighthouseLoad(1, ships), lighthouseLoad(10, ships)];
    console.log(`lighthouse, ${ships} ships: ${first.seconds.toFixed(1)}s at level 1, ${last.seconds.toFixed(1)}s at level 10`);
    assert.ok(last.seconds <= first.seconds * 1.34, `${ships} ships: ${last.seconds} against ${first.seconds}`);
    assert.ok(last.perMinute <= first.perMinute * 2);
    assert.ok(last.reactSeconds >= first.reactSeconds * 0.7);
    // No level in between is longer than that either.
    for (const level of LEVELS) assert.ok(lighthouseLoad(level, ships).seconds <= first.seconds * 1.34, `level ${level}`);
  }
});

/* Giraffe's Long Walk Home */

test('giraffe walk: level 1 is the walk as it always was', () => {
  assert.deepEqual(stopsAt(1), STOPS);
  const level = walkAt(1);
  assert.equal(level.walkSeconds, 2.8);
  assert.equal(level.sway, 0);
  assert.equal(level.unripe, 0);
  assert.equal(level.butterflies, false);
  assert.deepEqual([level.golden, level.baskets, level.monkey, level.bridge, level.frost, level.fireflies, level.parrot], [0, [], false, false, 0, 0, false]);
  for (let index = 0; index < STOPS.length; index += 1) {
    const features = featuresAt(1, index);
    assert.ok(Object.values(features).every((value) => !value), `stop ${index}`);
  }
  assert.deepEqual(new Journey({ level: 1 }).stops, STOPS);
  assert.deepEqual(walkNew(1), []);
});

test('giraffe walk: each level is a little harder than the one before', () => {
  climbsEveryLevel(walkAt, {
    hungrier: more,
    walkSeconds: less,
    golden: more,
    sway: more,
    swayRate: more,
    butterflies: more,
    butterflyEvery: less,
    butterflyStays: more,
    unripe: more,
    ripenSeconds: more,
    baskets: (stops) => stops.length,
    monkey: more,
    monkeyEvery: less,
    monkeyStays: more,
    bridge: more,
    frost: more,
    thawSeconds: more,
    fireflies: more,
    parrot: more,
  });
});

const WALK_ON = {
  golden: (at, stop) => at.golden > 0 && stop.golden > 0,
  wind: (at) => at.sway > 0,
  butterflies: (at) => at.butterflies,
  green: (at) => at.unripe > 0,
  basket: (at, stop) => at.baskets.length > 0 && stop.basket,
  monkey: (at, stop) => at.monkey && stop.monkey,
  bridge: (at, stop) => at.bridge && stop.bridge,
  frost: (at, stop) => at.frost > 0 && stop.frost > 0 && stop.snowy,
  fireflies: (at, stop) => at.fireflies > 0 && stop.fireflies > 0 && stop.evening,
  parrot: (at, stop) => at.parrot && stop.parrot,
};
const onAnyStop = (key, level) => STOPS.some((_, index) => WALK_ON[key](walkAt(level), featuresAt(level, index)));

test('giraffe walk: every level from 2 brings something new, switched on from that level and kept after it', () => {
  const seen = new Set();
  for (const level of LEVELS.slice(1)) {
    const news = walkNew(level);
    assert.ok(news.length > 0, `nothing new at level ${level}`);
    for (const { key, mark, name, nameKa } of news) {
      assert.ok(mark && name && nameKa, key);
      assert.ok(name.split(' ').length <= 3, name);
      assert.match(nameKa, /[Ⴀ-ჿ]/, key);
      assert.ok(!seen.has(key), `${key} is new twice`);
      seen.add(key);
      assert.ok(WALK_ON[key], `nothing checks ${key}`);
      assert.equal(onAnyStop(key, level - 1), false, `${key} is already on before level ${level}`);
      for (const later of LEVELS.filter((at) => at >= level)) assert.ok(onAnyStop(key, later), `${key} is off at level ${later}`);
    }
  }
  assert.deepEqual([...seen].sort(), Object.keys(WALK_NEW_THINGS).sort());
});

test('giraffe walk: what each stop has, at the levels where it comes', () => {
  // The basket at the second stop, and the fourth too from level 9.
  assert.deepEqual(STOPS.map((_, index) => featuresAt(5, index).basket), [false, true, false, false, false]);
  assert.deepEqual(STOPS.map((_, index) => featuresAt(9, index).basket), [false, true, false, true, false]);
  // The monkey from the second stop on, the bridge at the river, and frost and snow on the hill.
  assert.deepEqual(STOPS.map((_, index) => featuresAt(6, index).monkey), [false, true, true, true, true]);
  assert.deepEqual(STOPS.map((_, index) => featuresAt(7, index).bridge), [false, false, true, false, false]);
  assert.deepEqual(STOPS.map((_, index) => featuresAt(8, index).frost), [0, 0, 0, 2, 0]);
  // Evening and fireflies from the hill on, and the parrot's feather on the first tree.
  assert.deepEqual(STOPS.map((_, index) => featuresAt(9, index).evening), [false, false, false, true, true]);
  assert.deepEqual(STOPS.map((_, index) => featuresAt(10, index).parrot), [true, false, false, false, false]);
});

test('giraffe walk: feeding Giraffe a golden fruit is a gift for his family too, and two at once from a basket', () => {
  const log = eventsOf();
  const journey = new Journey({ level: 5, onEvent: log.onEvent });
  journey.nextStop();
  journey.feed(1, { golden: 1 });
  assert.equal(journey.gifts, 1);
  assert.equal(journey.stats.golden, 1);
  journey.feed(2);
  assert.equal(journey.fed, 3);
  assert.deepEqual(log.types().filter((type) => type === 'stop-done'), ['stop-done']);
  // He never eats more than he wants at a stop, and it's only done once.
  journey.feed(2);
  assert.equal(journey.stats.fed, 3);
  assert.equal(log.types().filter((type) => type === 'stop-done').length, 1);
  // But a golden fruit eaten after he's had enough is still a gift, as the child sees it go to the count.
  journey.feed(1, { golden: 1 });
  assert.equal(journey.gifts, 2);
  assert.equal(journey.stats.fed, 3);
  journey.nextStop();
  assert.equal(journey.wanted, 3);
  journey.feed(1);
  journey.feed(2);
  assert.equal(journey.fed, 3);
});

test('giraffe walk: from level 7, the river stop isn\'t done until the bridge is mended', () => {
  const log = eventsOf();
  const journey = new Journey({ level: 7, onEvent: log.onEvent });
  for (let index = 0; index < 3; index += 1) {
    journey.nextStop();
    if (index < 2) {
      while (journey.wanted) journey.feed();
    }
  }
  assert.equal(journey.stop.place, 'river');
  assert.equal(journey.bridgeFixed, false);
  while (journey.wanted) journey.feed();
  assert.equal(log.types().filter((type) => type === 'stop-done').length, 2);
  journey.fixBridge();
  assert.equal(log.types().filter((type) => type === 'stop-done').length, 3);
  assert.deepEqual(log.types().slice(-2), ['bridge-fixed', 'stop-done']);
  // The other way round too: mended first, then fed.
  const again = new Journey({ level: 7 });
  for (let index = 0; index < 3; index += 1) {
    again.nextStop();
    if (index < 2) while (again.wanted) again.feed();
  }
  again.fixBridge();
  assert.ok(again.bridgeFixed);
  // Before level 7 there's nothing to mend.
  const before = new Journey({ level: 6 });
  for (let index = 0; index < 3; index += 1) before.nextStop();
  assert.ok(before.bridgeFixed);
});

test('giraffe walk: a closed hand warms frosty fruit, and the warmth adds up however it comes and goes', () => {
  const fruit = { frost: true };
  assert.equal(warm(fruit, 0.4, 1), false);
  // Coming and going loses nothing.
  assert.equal(warm(fruit, 0.4, 1), false);
  assert.equal(warm(fruit, 0.3, 1), true);
  assert.equal(fruit.frost, false);
  assert.ok(warm({ frost: false }, 0, 1));
});

test('giraffe walk: gifts are counted, each kind on its own', () => {
  const log = eventsOf();
  const journey = new Journey({ level: 10, onEvent: log.onEvent });
  journey.nextStop();
  for (const kind of GIFTS) journey.gift(kind);
  assert.equal(journey.gifts, GIFTS.length);
  for (const kind of GIFTS) assert.equal(journey.stats[kind], 1);
  assert.equal(log.types().filter((type) => type === 'gift').length, GIFTS.length);
});

test('giraffe walk: at level 10, Giraffe is hungrier at two stops, and it still ends at home', () => {
  const stops = stopsAt(10);
  assert.deepEqual(stops.map(({ count }) => count), [3, 3, 5, 5, 3]);
  const log = eventsOf();
  const journey = new Journey({ level: 10, onEvent: log.onEvent });
  journey.nextStop();
  while (!journey.over) {
    while (journey.fed < journey.stop.count) journey.feed();
    journey.fixBridge();
    journey.nextStop();
  }
  assert.equal(log.types().at(-1), 'home');
  assert.equal(journey.stats.fed, 19);
});

// A fruit takes about 4 seconds to pick, carry and give him. Fruit swaying, green fruit to pass over,
// butterflies and the monkey to go round each add a little, by these guesses. A basket or the parrot
// saves a carry, less about 1.5 seconds to pick it up, the plank is one more carry, frosty fruit takes
// its warming, and a child is likely to go after each firefly, for about 0.8 seconds each.
function walkLoad(level) {
  const at = walkAt(level);
  const fruitSeconds = 4 + 0.3 * (at.sway / 0.022) + 0.15 * at.unripe + (at.butterflies ? 0.2 : 0) + (at.monkey ? 0.1 : 0);
  const fruit = stopsAt(level).reduce((sum, { count }) => sum + count, 0);
  let seconds = fruit * fruitSeconds + (STOPS.length - 1) * at.walkSeconds + 2.4;
  for (let index = 0; index < STOPS.length; index += 1) {
    const stop = featuresAt(level, index);
    if (stop.basket) seconds -= fruitSeconds - 1.5;
    if (stop.parrot) seconds -= fruitSeconds - 1.5;
    if (stop.bridge) seconds += fruitSeconds;
    seconds += stop.frost * at.thawSeconds + stop.fireflies * 0.8;
  }
  // Each carry is a move. A basket takes one away, the parrot's feather swaps one for a pick, and the
  // plank and each firefly add one.
  const moves = fruit + (at.bridge ? 1 : 0) - at.baskets.length + at.fireflies * 2;
  return { seconds, perMinute: (moves / seconds) * 60, reactSeconds: Infinity };
}

test('giraffe walk: level 10 is still within reach: at most a third longer, and not twice the moves', () => {
  const first = walkLoad(1);
  for (const level of LEVELS) {
    const now = walkLoad(level);
    assert.ok(now.seconds <= first.seconds * 1.34, `level ${level}: ${now.seconds} against ${first.seconds}`);
    assert.ok(now.perMinute <= first.perMinute * 2, `level ${level}`);
  }
  console.log(`giraffe walk: ${first.seconds.toFixed(1)}s at level 1, ${walkLoad(10).seconds.toFixed(1)}s at level 10`);
  // Nothing in the walk has a time limit: green fruit ripens, butterflies fly off and the monkey gives
  // his fruit back by themselves, and frosty fruit only needs a short warming.
  assert.ok(walkAt(10).butterflyStays <= 5);
  assert.ok(walkAt(10).ripenSeconds <= 10);
  assert.ok(walkAt(10).monkeyStays <= 8);
  assert.ok(walkAt(10).thawSeconds <= 1.2);
});

/* Giraffe's Smoothie Stand */

test('smoothie stand: level 1 is the fair as it always was', () => {
  const level = fairAt(1);
  assert.deepEqual([level.gravity, level.every, level.volley, level.most, level.wantedShare, level.rottenShare], [1, 1, 0, 0, 0.6, 0.14]);
  assert.deepEqual([level.across, level.pairs, level.tough], [0, 0, 0]);
  assert.deepEqual([level.tips, level.bonus, level.powers, level.bee], [0, [], [], false]);
  // Rotten fruit only with the customers who always had it, on the long day and the short.
  for (const short of [false, true]) {
    const stand = new Stand({ short });
    const withRotten = [];
    for (let i = 0; i < stand.customers.length; i += 1) {
      stand.nextCustomer();
      if (stand.rotten) withRotten.push(stand.customer.who);
      assert.equal(stand.special, null);
    }
    assert.deepEqual(withRotten, stand.customers.filter(({ rotten }) => rotten).map(({ who }) => who));
  }
  const stand = new Stand({ random: seeded() });
  const log = eventsOf();
  stand.onEvent = log.onEvent;
  stand.nextCustomer();
  for (let i = 0; i < 100; i += 1) {
    const { kind, across, tough, withRotten } = stand.nextThrow();
    assert.ok(!across && !tough && !withRotten);
    assert.ok(kind === 'rotten' || FRUITS.includes(kind), kind);
  }
  for (let i = 0; i < 100; i += 1) stand.tick(0.5);
  assert.ok(!log.types().some((type) => type === 'power-out' || type === 'bee'));
  assert.deepEqual(smoothieNew(1), []);
});

test('smoothie stand: each level is a little harder than the one before', () => {
  climbsEveryLevel(fairAt, {
    gravity: more,
    every: less,
    volley: more,
    most: more,
    wantedShare: less,
    rottenLast: more,
    rottenShare: more,
    across: more,
    pairs: more,
    tough: more,
    tips: more,
    bonus: (kinds) => kinds.length,
    powers: (kinds) => kinds.length,
    bee: more,
  });
});

const SMOOTHIE_ON = {
  tips: (at) => at.tips > 0,
  golden: (at) => at.bonus.includes('golden'),
  across: (at) => at.across > 0,
  magnet: (at) => at.powers.includes('magnet'),
  melon: (at) => at.bonus.includes('melon'),
  pairs: (at) => at.pairs > 0,
  bee: (at) => at.bee,
  tough: (at) => at.tough > 0,
  glove: (at) => at.powers.includes('glove'),
  turbo: (at) => at.powers.includes('turbo'),
};

test('smoothie stand: every level from 2 brings something new, switched on from that level and kept after it', () => {
  const seen = new Set();
  for (const level of LEVELS.slice(1)) {
    const news = smoothieNew(level);
    assert.ok(news.length > 0, `nothing new at level ${level}`);
    for (const { key, mark, name, nameKa } of news) {
      assert.ok(mark && name && nameKa, key);
      assert.ok(name.split(' ').length <= 3, name);
      assert.match(nameKa, /[Ⴀ-ჿ]/, key);
      assert.ok(!seen.has(key), `${key} is new twice`);
      seen.add(key);
      assert.ok(SMOOTHIE_ON[key], `nothing checks ${key}`);
      assert.equal(SMOOTHIE_ON[key](fairAt(level - 1)), false, `${key} is already on before level ${level}`);
      for (const later of LEVELS.filter((at) => at >= level)) assert.ok(SMOOTHIE_ON[key](fairAt(later)), `${key} is off at level ${later}`);
    }
    // And it really comes in a day at that level, with the first customers, on the short day too.
    for (const short of [false, true]) {
      const stand = new Stand({ level, short, random: seeded(level) });
      const came = new Set();
      stand.onEvent = ({ type, kind }) => {
        if (type === 'power-out') came.add(kind);
        if (type === 'bee') came.add('bee');
      };
      for (let customer = 0; customer < stand.customers.length; customer += 1) {
        stand.nextCustomer();
        for (let i = 0; i < 400; i += 1) {
          const throwing = stand.nextThrow();
          if (throwing.kind === 'golden' || throwing.kind === 'melon') came.add(throwing.kind);
          if (throwing.across) came.add('across');
          if (throwing.tough) came.add('tough');
          if (throwing.withRotten) came.add('pairs');
        }
        for (let i = 0; i < 10; i += 1) stand.tick(0.5);
      }
      if (fairAt(level).tips) came.add('tips');
      for (const { key } of news) assert.ok(came.has(key), `${key} never comes at level ${level}${short ? ' on the short day' : ''}`);
    }
  }
  assert.deepEqual([...seen].sort(), Object.keys(SMOOTHIE_NEW_THINGS).sort());
});

test('smoothie stand: one golden fruit or watermelon with each customer, instead of something that isn\'t on the order', () => {
  const stand = new Stand({ level: 10, random: seeded(4) });
  const each = [];
  for (let customer = 0; customer < stand.customers.length; customer += 1) {
    stand.nextCustomer();
    let sinceWanted = 0;
    const kinds = [];
    for (let i = 0; i < 400; i += 1) {
      const { kind } = stand.nextThrow();
      if (kind === 'golden' || kind === 'melon') kinds.push(kind);
      sinceWanted = kind in stand.customer.order ? 0 : sinceWanted + 1;
      assert.ok(sinceWanted <= 2, 'too long without anything on the order');
    }
    each.push(kinds.join());
  }
  assert.deepEqual(each, ['melon', 'golden', 'melon', 'golden', 'melon', 'golden']);
  // And only golden ones before level 6.
  assert.deepEqual(new Stand({ level: 5 }).level.bonus, ['golden']);
});

test('smoothie stand: coins come from tips, golden fruit and watermelon wedges, and are counted', () => {
  const log = eventsOf();
  const stand = new Stand({ level: 6, onEvent: log.onEvent });
  stand.nextCustomer();
  assert.equal(stand.slice('golden'), 'golden');
  assert.equal(stand.coins, GOLDEN_COINS);
  assert.equal(stand.slice('melon'), 'melon');
  assert.ok(log.types().includes('melon'));
  for (let i = 0; i < 3; i += 1) assert.equal(stand.slice('wedge'), 'wedge');
  stand.addCoins(1, 'tip');
  stand.addCoins(1, 'tip');
  assert.equal(stand.coins, GOLDEN_COINS + 3 + 2);
  assert.deepEqual([stand.stats.golden, stand.stats.melons, stand.stats.wedges, stand.stats.tips], [1, 1, 3, 2]);
  // None of it counts against the order, or as fruit that wasn't wanted.
  assert.equal(stand.stats.extra, 0);
  assert.deepEqual(stand.left, stand.customer.order);
});

test('smoothie stand: a power-up bubble floats up with each order, lasts a while, and only counts down with the hand in sight', () => {
  const log = eventsOf();
  const stand = new Stand({ level: 5, onEvent: log.onEvent });
  stand.nextCustomer();
  stand.tick(2.9);
  assert.ok(!log.types().includes('power-out'));
  stand.tick(0.2);
  assert.deepEqual(log.events.filter(({ type }) => type === 'power-out').map(({ kind }) => kind), ['magnet']);
  // Only one each customer.
  for (let i = 0; i < 20; i += 1) stand.tick(1);
  assert.equal(log.types().filter((type) => type === 'power-out').length, 1);
  stand.power('magnet');
  assert.ok(stand.isOn('magnet'));
  stand.tick(30, { seen: false });
  assert.equal(stand.active.magnet, SMOOTHIE_POWER_SECONDS.magnet);
  stand.tick(SMOOTHIE_POWER_SECONDS.magnet, { seen: true });
  assert.ok(!stand.isOn('magnet'));
});

test('smoothie stand: from level 7 every other customer brings the bee, and at level 10 the power-ups take turns', () => {
  const specials = (level) => {
    const stand = new Stand({ level });
    return stand.customers.map(() => {
      stand.nextCustomer();
      return stand.special;
    });
  };
  assert.deepEqual(specials(6), Array(6).fill('magnet'));
  assert.deepEqual(specials(7), ['magnet', 'bee', 'magnet', 'bee', 'magnet', 'bee']);
  assert.deepEqual(specials(10), ['turbo', 'bee', 'glove', 'bee', 'magnet', 'bee']);
  // The short day still has the newest first, and the bee.
  const short = new Stand({ level: 10, short: true });
  const shortSpecials = short.customers.map(() => {
    short.nextCustomer();
    return short.special;
  });
  assert.deepEqual(shortSpecials, ['turbo', 'bee', 'glove']);
});

test('smoothie stand: with the turbo blender, what\'s on the order counts twice, but never more than is left', () => {
  const stand = new Stand({ level: 10 });
  stand.nextCustomer();
  assert.deepEqual(stand.customer.order, { apple: 4 });
  stand.power('turbo');
  assert.equal(stand.slice('apple'), 'wanted');
  assert.equal(stand.left.apple, 2);
  stand.slice('apple');
  assert.equal(stand.left.apple, 0);
  assert.equal(stand.stats.smoothies, 1);
  stand.nextCustomer();
  stand.active.turbo = 0;
  stand.slice('orange');
  assert.equal(stand.left.orange, 4);
});

test('smoothie stand: at level 10 there\'s rotten fruit from the first customer, thrown across, beside wanted fruit, and tough fruit', () => {
  const stand = new Stand({ level: 10, random: seeded(11) });
  stand.nextCustomer();
  assert.ok(stand.rotten);
  const seen = { rotten: 0, across: 0, tough: 0, withRotten: 0 };
  let sinceWanted = 0;
  for (let i = 0; i < 600; i += 1) {
    const { kind, across, tough, withRotten } = stand.nextThrow();
    if (kind === 'rotten') seen.rotten += 1;
    seen.across += across;
    seen.tough += tough;
    seen.withRotten += withRotten;
    // Tough fruit and pairs are only ever what's on the order.
    if (tough || withRotten) assert.ok(stand.left[kind] > 0);
    sinceWanted = kind in stand.customer.order ? 0 : sinceWanted + 1;
    assert.ok(sinceWanted <= 2, 'too long without anything on the order');
  }
  for (const [what, count] of Object.entries(seen)) assert.ok(count > 10, what);
});

// How the fair goes, roughly, at a grown-up's pace: how much on the order comes up a second, how long
// a fruit is up to be sliced, and how long a day takes for a child who swipes about every 2 seconds
// and catches a rotten one about a third of the time it's up beside what they want. The extras from
// the higher levels are guesses too: a child goes after each golden fruit, watermelon, wedge, tip
// coin, bubble and bee, for about half a second each, as they come between the fruit on the order,
// and the turbo blender saves about three swipes.
const PACES = {
  slow: { gravity: 0.38, every: 0.85, volley: [1, 2], most: 8 },
  medium: { gravity: 0.5, every: 0.7, volley: [1, 3], most: 10 },
  fast: { gravity: 0.68, every: 0.55, volley: [2, 3], most: 12 },
};
// gentle is the fair as it always was, which these limits are for: see test/unit/smoothie-stand.test.js for the
// customers who won't wait, and the steeper climb that comes with them.
function fairLoad(level, paceName, { gentle = true } = {}) {
  const at = fairAt(level, { gentle });
  const pace = PACES[paceName];
  const gravity = pace.gravity * at.gravity;
  const upSeconds = 2 * Math.sqrt((2 * 0.52) / gravity); // A throw up to halfway, and back down.
  // As in field.js: a level adds no more than the fastest pace has, at once or in a throw.
  const volley = Math.max(pace.volley[1], Math.min(3, pace.volley[1] + at.volley));
  const most = Math.max(pace.most, Math.min(12, pace.most + at.most));
  const thrown = Math.min((pace.volley[0] + volley) / 2 / (pace.every * at.every), most / upSeconds);
  const wantedPerSecond = thrown * at.wantedShare;
  const wanted = DAY.reduce((sum, { order }) => sum + Object.values(order).reduce((a, b) => a + b, 0), 0);
  const withRotten = DAY.slice(DAY.length - at.rottenLast).reduce((sum, { order }) => sum + Object.values(order).reduce((a, b) => a + b, 0), 0);
  const turbo = new Stand({ level }).customers.filter((_, index) => {
    const stand = new Stand({ level });
    for (let i = 0; i <= index; i += 1) stand.nextCustomer();
    return stand.special === 'turbo';
  }).length;
  const swipes = wanted * (1 + at.tough) - turbo * 3;
  const rottenHit = withRotten * ((at.rottenShare / at.wantedShare) + at.pairs) * 0.3;
  let seconds = swipes * 2 + rottenHit * 1.2 + (DAY.length - 1) + 2.8;
  // The extras, with each customer: tip coins and watermelon wedges float up near the hand, for about
  // a quarter of a second each, and a golden fruit, a watermelon, a bubble or the bee take about half.
  const stand = new Stand({ level });
  let extras = 0;
  for (let index = 0; index < DAY.length; index += 1) {
    stand.nextCustomer();
    const melon = stand.bonus === 'melon';
    seconds += at.tips * 0.25 + (stand.bonus ? 0.5 : 0) + (melon ? 3 * 0.25 : 0) + (stand.special ? 0.5 : 0);
    extras += at.tips + (stand.bonus ? 1 : 0) + (melon ? 3 : 0) + (stand.special ? 1 : 0);
  }
  return { seconds, perMinute: (wantedPerSecond * (1 + at.tough) + extras / seconds) * 60, wantedPerSecond, reactSeconds: upSeconds };
}

test('smoothie stand, gentle: level 10 is still within reach, at every pace a grown-up can choose', () => {
  for (const pace of Object.keys(PACES)) {
    const first = fairLoad(1, pace);
    for (const level of LEVELS) {
      const last = fairLoad(level, pace);
      assert.ok(last.reactSeconds >= first.reactSeconds * 0.7, `${pace}, level ${level}: fruit is up too short a time`);
      assert.ok(last.perMinute <= first.perMinute * 2, `${pace}, level ${level}: too many moves, ${last.perMinute} against ${first.perMinute}`);
      assert.ok(last.seconds <= first.seconds * 1.34, `${pace}, level ${level}: ${last.seconds} against ${first.seconds}`);
      // What's on the order comes up at least as often, so nobody waits longer for it.
      assert.ok(last.wantedPerSecond >= first.wantedPerSecond * 0.99, `${pace}: ${last.wantedPerSecond} against ${first.wantedPerSecond}`);
    }
    console.log(`smoothie stand, ${pace}: ${first.seconds.toFixed(1)}s at level 1, ${fairLoad(10, pace).seconds.toFixed(1)}s at level 10, ${first.perMinute.toFixed(0)} against ${fairLoad(10, pace).perMinute.toFixed(0)} moves a minute`);
  }
});
