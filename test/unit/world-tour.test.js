// Giraffe's World Tour: the journeys, finding a country on the globe, the fuel that a wrong choice costs, painting
// a flag with the paint landing only where its colour goes, holding the flag against the wind, and raising it.
// Everything here runs without a screen, with a pretend child whose hand is said to be over this or that. The flags
// are little ones made up here, so that what's tested is the rules: the real flags have their own tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { apart, between, Globe } from '../../games/world-tour/globe.js';
import { COUNTRIES, choicesFor, JOURNEYS, MEMORY, NEW_THINGS, newAt, Painting, TOUR, Tour, tourLevel, WIND } from '../../games/world-tour/tour.js';

const FRAME = 1 / 60;
const LEVELS = Array.from({ length: 10 }, (_, index) => index + 1);
const world = JSON.parse(readFileSync(new URL('../../games/world-tour/world.json', import.meta.url), 'utf8'));
const PLACES = Object.fromEntries(world.countries.map((country) => [country.id, country.at]));

// Two stripes, as Ukraine's and Poland's are, and a flag with a little part on a big one, as Japan's is.
const STRIPES = {
  name: 'Stripes',
  wide: 150,
  colours: { blue: '#0057b7', yellow: '#ffd700' },
  parts: [
    { id: 'top', colour: 'blue', shapes: [{ type: 'rect', x: 0, y: 0, w: 150, h: 50 }] },
    { id: 'bottom', colour: 'yellow', shapes: [{ type: 'rect', x: 0, y: 50, w: 150, h: 50 }] },
  ],
};
const DISC = {
  name: 'Disc',
  wide: 150,
  colours: { white: '#ffffff', red: '#bc002d' },
  parts: [
    { id: 'field', colour: 'white', shapes: [{ type: 'rect', x: 0, y: 0, w: 150, h: 100 }] },
    { id: 'sun', colour: 'red', shapes: [{ type: 'circle', x: 75, y: 50, r: 30 }] },
  ],
};
const FLAGS = Object.fromEntries(COUNTRIES.map((id, index) => [id, index % 2 ? DISC : STRIPES]));

function makeTour(options = {}) {
  const log = [];
  const tour = new Tour({ flags: FLAGS, places: PLACES, random: () => 0.5, onEvent: (event) => log.push(event), ...options });
  tour.log = log;
  tour.count = (type) => log.filter((event) => event.type === type).length;
  return tour;
}

/** Runs the tour for some seconds with the hand as said. input can be a function of the tour, asked each frame. */
function run(tour, seconds, input = {}) {
  for (let frame = 0; frame < Math.round(seconds / FRAME); frame += 1) tour.update(FRAME, typeof input === 'function' ? input(tour) : input);
}

const HAND = { seen: true, open: true };
const choose = (tour, country = tour.target) => run(tour, TOUR.dwell + 0.1, { ...HAND, over: country });
/** Chooses the country asked for, and waits for the plane to get there and the flag to be put up to paint. */
function flyTo(tour) {
  choose(tour);
  run(tour, 12, (now) => (now.state === 'paint' ? {} : HAND));
  assert.equal(tour.state, 'paint');
}
const dip = (tour, paint) => run(tour, TOUR.dip + 0.1, { ...HAND, pot: paint, holding: true });
/** Sweeps the open hand over the whole flag, row by row, with the paint that's on it. */
function sweep(tour, { holding = true, open = true, rows = [10, 25, 40, 55, 70, 85, 95] } = {}) {
  for (const y of rows) {
    for (let x = 4; x <= tour.flag.wide - 4 && tour.state === 'paint'; x += 3) tour.update(FRAME, { seen: true, open, brush: { x, y }, holding });
  }
}
/** Paints the whole flag: each paint in turn, dipped and swept. */
function paintFlag(tour, options) {
  for (const paint of Object.keys(tour.flag.colours)) {
    if (tour.state !== 'paint') break;
    dip(tour, paint);
    sweep(tour, options);
  }
}
/** The open hand takes the rope low down and lifts it to the top. */
function raise(tour) {
  run(tour, 0.2, { ...HAND, lift: 0.1 });
  run(tour, 0.2, { ...HAND, lift: 0.5 });
  run(tour, 0.2, { ...HAND, lift: 0.98 });
}
function stop(tour) {
  flyTo(tour);
  paintFlag(tour);
  assert.equal(tour.state, 'raise');
  raise(tour);
  assert.equal(tour.state, 'settle');
  run(tour, TOUR.settle + 0.1, HAND);
}

/* ---------- the journeys ---------- */

test('ten journeys of three countries, four in the last, no country twice, and each one on the map', () => {
  assert.deepEqual(Object.keys(JOURNEYS).map(Number), LEVELS);
  for (const level of LEVELS) assert.equal(JOURNEYS[level].length, level === 10 ? 4 : 3, `level ${level}`);
  assert.equal(new Set(COUNTRIES).size, COUNTRIES.length);
  assert.equal(COUNTRIES.length, 31);
  for (const id of COUNTRIES) assert.ok(PLACES[id], `${id} is on the map`);
});

test('the map draws borders as the United Nations recognises them', () => {
  const ids = new Set(world.countries.map((country) => country.id));
  // What some maps draw apart isn't apart here.
  for (const id of ['KOS', 'CYN', 'SOL', 'TWN']) assert.ok(!ids.has(id), `${id} isn't a country of its own`);
  const inside = (ring, x, y) => {
    let hit = false;
    for (let n = 0, last = ring.length - 2; n < ring.length; last = n, n += 2) {
      const [ax, ay, bx, by] = [ring[n], ring[n + 1], ring[last], ring[last + 1]];
      if ((ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) hit = !hit;
    }
    return hit;
  };
  const owners = (x, y) => world.countries.filter((country) => country.rings.some((ring) => inside(ring, x, y))).map((country) => country.id);
  assert.deepEqual(owners(34.1, 45.2), ['UKR'], 'the Crimea');
  assert.deepEqual(owners(41.0, 43.0), ['GEO'], 'Abkhazia');
  assert.deepEqual(owners(44.0, 42.3), ['GEO'], 'South Ossetia');
  assert.deepEqual(owners(20.9, 42.6), ['SRB'], 'Kosovo');
  assert.deepEqual(owners(33.6, 35.3), ['CYP'], 'the north of Cyprus');
  assert.deepEqual(owners(121, 23.7), ['CHN'], 'Taiwan');
});

test('the globe: a place faced is in the middle, east is to the right and north is up, and the far side is known', () => {
  const globe = new Globe(world.countries);
  globe.face(20, 50);
  const middle = globe.project(20, 50);
  assert.ok(Math.abs(middle.x) < 1e-9 && Math.abs(middle.y) < 1e-9 && middle.front);
  assert.ok(globe.project(30, 50).x > 0, 'east is to the right');
  assert.ok(globe.project(20, 60).y < 0, 'north is up');
  assert.equal(globe.project(-160, -50).front, false);
  assert.ok(Math.abs(apart([0, 0], [90, 0]) - 90) < 1e-9);
  const half = between([0, 0], [90, 0], 0.5);
  assert.ok(Math.abs(half[0] - 45) < 1e-9 && Math.abs(half[1]) < 1e-9);
  assert.ok(globe.where('GEO').front === false || globe.where('GEO').front === true);
  assert.equal(globe.where('XXX'), null);
});

/* ---------- what each level is ---------- */

test('every level from 2 brings something new, with a name in both languages', () => {
  for (const level of LEVELS.slice(1)) {
    for (const hold of ['later', 'always', 'never']) {
      const things = newAt(level, { hold });
      assert.ok(things.length > 0, `level ${level}, ${hold}`);
      for (const thing of things) assert.ok(thing.mark && thing.name && thing.nameKa, `level ${level}`);
    }
  }
  assert.deepEqual(newAt(1), []);
  assert.notEqual(newAt(5, { hold: 'never' })[0].name, NEW_THINGS[5][0].name, 'one hand has its own words for the wind');
});

test('what a level brings is really in it, from that level on and not before', () => {
  const first = (has) => LEVELS.find((level) => has(tourLevel(level)));
  assert.equal(first((rules) => rules.roller), 2);
  assert.equal(first((rules) => rules.stamps), 3);
  assert.equal(first((rules) => rules.choices === 4), 4);
  assert.equal(first((rules) => rules.wind), WIND.from);
  assert.equal(first((rules) => rules.holding), WIND.from);
  assert.equal(first((rules) => rules.can), 6);
  assert.equal(first((rules) => rules.memory !== null), MEMORY.from);
  assert.equal(first((rules) => rules.choices === 5), 8);
  assert.equal(first((rules) => !rules.lights), 9);
  assert.equal(first((rules) => rules.cup), 10);
  assert.equal(first((rules) => rules.stops.length === 4), 10);
  for (const level of LEVELS) {
    const rules = tourLevel(level);
    assert.ok(rules.cans >= 3 && rules.cans <= 5, `level ${level} has fuel that can run out`);
    assert.equal(tourLevel(level, { gentle: true }).cans, Infinity);
  }
  assert.ok(tourLevel(10).cans < tourLevel(1).cans, 'less fuel to spare as the levels go up');
  assert.ok(tourLevel(10).wind.every < tourLevel(5).wind.every, 'the wind comes oftener');
  assert.ok(tourLevel(10).memory < tourLevel(7).memory, 'the flag is shown for less long');
});

test('a grown-up can have the flag held from the first level, or never', () => {
  assert.equal(tourLevel(1, { hold: 'always' }).holding, true);
  assert.equal(tourLevel(1, { hold: 'always' }).wind, null, 'the wind still waits for level 5');
  assert.equal(tourLevel(8, { hold: 'never' }).holding, false);
  assert.ok(tourLevel(8, { hold: 'never' }).wind, 'and still blows for one hand');
});

/* ---------- finding the country ---------- */

test('the countries lit are the one asked for and its neighbours in the game, as many as the level says', () => {
  for (const level of LEVELS) {
    const rules = tourLevel(level);
    for (const target of rules.stops) {
      const lit = choicesFor(target, { count: rules.choices, stops: rules.stops, flown: [], places: PLACES });
      assert.ok(lit.includes(target), `${target} is among them`);
      assert.equal(new Set(lit).size, lit.length);
      assert.ok(lit.length >= 3 && lit.length <= rules.choices, `${target}: ${lit}`);
      for (const id of lit) assert.ok(apart(PLACES[target], PLACES[id]) < 80, `${id} is in view with ${target}`);
    }
  }
});

test('the others of the journey come first, and the answer isn’t always in the same place', () => {
  const lit = choicesFor('UKR', { count: 3, stops: JOURNEYS[1], flown: [], places: PLACES });
  assert.deepEqual([...lit].sort(), ['DEU', 'POL', 'UKR']);
  const places = new Set();
  for (let n = 0; n < 40; n += 1) places.add(choicesFor('UKR', { count: 3, stops: JOURNEYS[1], flown: [], places: PLACES }).indexOf('UKR'));
  assert.ok(places.size > 1);
  // A country whose flag is up already isn't lit while there are others near.
  const third = choicesFor('DEU', { count: 3, stops: JOURNEYS[1], flown: ['UKR', 'POL'], places: PLACES });
  assert.ok(!third.includes('POL') && !third.includes('UKR'), `${third}`);
  assert.equal(third.length, 3);
});

test('an open hand held over the right country sends the plane there', () => {
  const tour = makeTour();
  tour.begin();
  assert.equal(tour.state, 'find');
  assert.equal(tour.target, 'UKR');
  run(tour, TOUR.dwell - 0.2, { ...HAND, over: 'UKR' });
  assert.equal(tour.state, 'find', 'not before the hand has stayed a moment');
  run(tour, 0.3, { ...HAND, over: 'UKR' });
  assert.equal(tour.state, 'fly');
  assert.equal(tour.count('right'), 1);
  assert.equal(tour.cans, tourLevel(1).cans, 'and it cost no fuel');
});

test('a closed hand chooses nothing, however long it stays, and nor does a hand that keeps moving on', () => {
  const tour = makeTour();
  tour.begin();
  run(tour, 5, { seen: true, open: false, over: 'UKR' });
  assert.equal(tour.state, 'find');
  // Over one country and then another, never long enough on either.
  for (let n = 0; n < 12; n += 1) run(tour, TOUR.dwell * 0.6, { ...HAND, over: n % 2 ? 'UKR' : 'POL' });
  assert.equal(tour.state, 'find');
  assert.equal(tour.stats.wrong, 0);
  // Nor a country that isn't lit.
  run(tour, 3, { ...HAND, over: 'JPN' });
  assert.equal(tour.state, 'find');
});

test('the wrong country is named, goes out, and costs a can of fuel', () => {
  const tour = makeTour();
  tour.begin();
  const full = tour.cans;
  choose(tour, 'POL');
  assert.equal(tour.state, 'find');
  assert.equal(tour.cans, full - 1);
  assert.deepEqual(tour.log.find((event) => event.type === 'wrong'), { type: 'wrong', country: 'POL', target: 'UKR' });
  // It can't be chosen again, and nothing else can for a moment, while it's named.
  run(tour, 3, { ...HAND, over: 'POL' });
  assert.equal(tour.cans, full - 1);
  assert.equal(tour.stats.wrong, 1);
  choose(tour, 'UKR');
  assert.equal(tour.state, 'fly');
});

test('with no fuel left the journey is lost, and nothing more happens', () => {
  const tour = makeTour({ level: 8 });
  tour.begin();
  assert.equal(tour.cans, 3);
  const wrong = tour.choices.filter((id) => id !== tour.target);
  for (const country of wrong.slice(0, 3)) {
    run(tour, TOUR.wrongRest + 0.1, HAND);
    choose(tour, country);
  }
  assert.equal(tour.state, 'lost');
  assert.equal(tour.count('lost'), 1);
  run(tour, 5, { ...HAND, over: tour.target });
  assert.equal(tour.state, 'lost');
});

test('on the gentle tour there is always fuel', () => {
  const tour = makeTour({ level: 8, gentle: true });
  tour.begin();
  for (const country of tour.choices.filter((id) => id !== tour.target)) {
    run(tour, TOUR.wrongRest + 0.1, HAND);
    choose(tour, country);
  }
  assert.equal(tour.state, 'find');
  assert.equal(tour.cans, Infinity);
  run(tour, TOUR.wrongRest + 0.1, HAND);
  choose(tour);
  assert.equal(tour.state, 'fly');
});

test('nothing happens to a child who has gone away: the question waits, and the clock stops', () => {
  const tour = makeTour();
  tour.begin();
  run(tour, 60, {});
  assert.equal(tour.state, 'find');
  assert.equal(tour.cans, tourLevel(1).cans);
  assert.equal(tour.stats.seconds, 0);
});

/* ---------- painting the flag ---------- */

test('the plane flies there and lands, and the flag stands ready to paint', () => {
  const tour = makeTour();
  tour.begin();
  assert.equal(tour.flightShare, 0);
  choose(tour);
  assert.ok(tour.flightShare < 0.1);
  run(tour, TOUR.fly / 2, HAND);
  assert.ok(tour.flightShare > 0.3 && tour.flightShare < 0.7);
  run(tour, TOUR.fly, HAND);
  assert.equal(tour.state, 'land');
  run(tour, TOUR.land + 0.1, HAND);
  assert.equal(tour.state, 'paint');
  assert.equal(tour.painting.progress, 0);
  assert.deepEqual(tour.log.filter((event) => ['fly', 'landed', 'easel'].includes(event.type)).map((event) => event.type), ['fly', 'landed', 'easel']);
});

test('a hand with no paint on it paints nothing, and the pots are pointed out', () => {
  const tour = makeTour();
  tour.begin();
  flyTo(tour);
  sweep(tour);
  assert.equal(tour.painting.progress, 0);
  tour.update(FRAME, { ...HAND, brush: { x: 30, y: 20 } });
  assert.deepEqual(tour.hint, { part: 0, paint: 'blue' });
});

test('an open hand that stays in a pot takes its paint, and a closed one or a passing one doesn’t', () => {
  const tour = makeTour();
  tour.begin();
  flyTo(tour);
  run(tour, 2, { seen: true, open: false, pot: 'blue' });
  assert.equal(tour.paint, null);
  run(tour, TOUR.dip / 2, { ...HAND, pot: 'blue' });
  assert.equal(tour.paint, null);
  run(tour, TOUR.dip, { ...HAND, pot: 'blue' });
  assert.equal(tour.paint, 'blue');
  assert.equal(tour.stats.dips, 1);
  // Staying there is one dip, not many.
  run(tour, 2, { ...HAND, pot: 'blue' });
  assert.equal(tour.stats.dips, 1);
});

test('paint lands only on the parts that are its colour, wherever the hand goes', () => {
  const tour = makeTour();
  tour.begin();
  flyTo(tour);
  dip(tour, 'blue');
  sweep(tour);
  const { painting } = tour;
  assert.equal(painting.done[0], true, 'the blue stripe is painted');
  assert.equal(painting.counts[1], 0, 'and not a drop on the yellow one');
  assert.equal(tour.state, 'paint');
  // With the blue still on the hand, the yellow stripe shows which pot it wants.
  tour.update(FRAME, { ...HAND, brush: { x: 60, y: 80 } });
  assert.deepEqual(tour.hint, { part: 1, paint: 'yellow' });
});

test('a little part on a big one takes its own paint from a brush that only comes near it', () => {
  const tour = makeTour();
  tour.begin();
  tour.stop = 1; // Poland here has the flag with the disc.
  tour.ask();
  flyTo(tour);
  assert.equal(tour.flag, DISC);
  dip(tour, 'red');
  // Just outside the disc: the middle of the brush is on the white field, and red still lands on the disc.
  tour.update(FRAME, { ...HAND, brush: { x: 75 + 33, y: 50 } });
  assert.ok(tour.painting.counts[1] > 0);
  assert.equal(tour.painting.counts[0], 0);
});

test('a part that is mostly painted fills itself in, and with every part done the flag is ready to raise', () => {
  const tour = makeTour();
  tour.begin();
  flyTo(tour);
  dip(tour, 'blue');
  // Half of the top stripe isn't enough.
  for (let x = 4; x <= 70; x += 3) for (const y of [10, 25, 40]) tour.update(FRAME, { ...HAND, brush: { x, y } });
  assert.equal(tour.painting.done[0], false);
  assert.ok(tour.painting.share(0) > 0.3 && tour.painting.share(0) < TOUR.done);
  sweep(tour);
  assert.equal(tour.painting.done[0], true);
  assert.equal(tour.painting.share(0), 1);
  dip(tour, 'yellow');
  sweep(tour);
  assert.equal(tour.state, 'raise');
  assert.equal(tour.stats.parts, 2);
  assert.equal(tour.count('painted'), 1);
});

test('a closed hand paints nothing', () => {
  const tour = makeTour();
  tour.begin();
  flyTo(tour);
  dip(tour, 'blue');
  sweep(tour, { open: false });
  assert.equal(tour.painting.progress, 0);
});

test('level 2: the roller paints wider than the hand, and has to be picked up', () => {
  const plain = makeTour({ level: 2 });
  plain.begin();
  flyTo(plain);
  // The paint of the flag's biggest part, a long way from its edges.
  const paint = plain.flag.parts[0].colour;
  dip(plain, paint);
  plain.update(FRAME, { ...HAND, brush: { x: 20, y: 20 } });
  const narrow = plain.painting.counts.reduce((sum, count) => sum + count, 0);
  assert.ok(narrow > 0);

  const tour = makeTour({ level: 2 });
  tour.begin();
  flyTo(tour);
  dip(tour, paint);
  run(tour, TOUR.dip + 0.1, { ...HAND, pot: 'roller' });
  assert.equal(tour.rollerOn, true);
  assert.equal(tour.paint, paint, 'the paint stays on');
  tour.update(FRAME, { ...HAND, brush: { x: 20, y: 20 } });
  assert.ok(tour.painting.counts.reduce((sum, count) => sum + count, 0) > narrow * 2);

  // At level 1 there's no roller to pick up.
  const first = makeTour({ level: 1 });
  first.begin();
  flyTo(first);
  run(first, 1, { ...HAND, pot: 'roller' });
  assert.equal(first.rollerOn, false);
});

/* ---------- the wind, and holding the flag ---------- */

test('before level 5 nothing has to be held, and no wind blows', () => {
  const tour = makeTour({ level: 4 });
  tour.begin();
  flyTo(tour);
  paintFlag(tour, { holding: false });
  assert.equal(tour.state, 'raise');
  assert.equal(tour.stats.gusts, 0);
});

test('level 5: paint only goes on a flag the other hand is holding', () => {
  const tour = makeTour({ level: 5 });
  tour.begin();
  flyTo(tour);
  dip(tour, tour.flag.parts[0].colour);
  // The other hand lets go, and then the painting hand comes to the flag.
  run(tour, WIND.loose + 0.1, { seen: true, open: false, holding: false });
  run(tour, 1, { ...HAND, brush: { x: 30, y: 20 }, holding: false });
  assert.equal(tour.painting.progress, 0);
  assert.deepEqual(tour.hint, { hold: true });
  tour.update(FRAME, { ...HAND, brush: { x: 30, y: 20 }, holding: true });
  assert.ok(tour.painting.progress > 0);
});

test('a holding hand that the camera loses for a moment is still holding', () => {
  const tour = makeTour({ level: 5 });
  tour.begin();
  flyTo(tour);
  dip(tour, Object.keys(tour.flag.colours)[0]);
  tour.update(FRAME, { ...HAND, brush: { x: 30, y: 20 }, holding: true });
  const before = tour.painting.progress;
  run(tour, WIND.loose * 0.6, (now) => ({ ...HAND, brush: { x: 60 + now.painting.progress * 400, y: 20 }, holding: false }));
  assert.ok(tour.painting.progress > before);
});

test('a gust is seen coming, and a flag that is held keeps its paint and costs nothing', () => {
  const tour = makeTour({ level: 5 });
  tour.begin();
  flyTo(tour);
  const full = tour.cans;
  dip(tour, Object.keys(tour.flag.colours)[0]);
  tour.update(FRAME, { ...HAND, brush: { x: 30, y: 20 }, holding: true });
  const painted = tour.painting.progress;
  assert.equal(tour.gustShare, 0);
  run(tour, tourLevel(5).wind.every + 0.5, { seen: true, open: false, holding: true });
  assert.equal(tour.count('gust-coming'), 1);
  assert.equal(tour.stats.gusts, 1);
  assert.equal(tour.stats.held, 1);
  assert.equal(tour.cans, full);
  assert.equal(tour.painting.progress, painted);
  const coming = tour.log.findIndex((event) => event.type === 'gust-coming');
  const gust = tour.log.findIndex((event) => event.type === 'gust');
  assert.ok(coming >= 0 && coming < gust, 'the warning comes first');
});

test('a gust that finds the flag let go takes the wet paint and a can of fuel', () => {
  const tour = makeTour({ level: 5 });
  tour.begin();
  flyTo(tour);
  const full = tour.cans;
  dip(tour, Object.keys(tour.flag.colours)[0]);
  for (let x = 10; x < 60; x += 3) tour.update(FRAME, { ...HAND, brush: { x, y: 20 }, holding: true });
  assert.ok(tour.painting.progress > 0);
  run(tour, tourLevel(5).wind.every + 0.5, { seen: true, open: false, holding: false });
  assert.equal(tour.stats.lost, 1);
  assert.equal(tour.cans, full - 1);
  assert.equal(tour.painting.progress, 0, 'the part that was being painted is bare again');
  assert.deepEqual(tour.log.find((event) => event.type === 'gust'), { type: 'gust', held: false, part: tour.log.find((event) => event.type === 'stroke').parts.at(-1) });
});

test('a part that is finished is safe from the wind', () => {
  const tour = makeTour({ level: 5 });
  tour.begin();
  flyTo(tour);
  const first = Object.keys(tour.flag.colours)[0];
  dip(tour, first);
  sweep(tour);
  const done = tour.painting.done.filter(Boolean).length;
  assert.ok(done >= 1);
  const painted = tour.painting.progress;
  run(tour, tourLevel(5).wind.every + 0.5, { seen: true, open: false, holding: false });
  assert.equal(tour.stats.lost, 1);
  assert.equal(tour.painting.progress, painted);
});

test('the wind waits for a child who has gone away', () => {
  const tour = makeTour({ level: 5 });
  tour.begin();
  flyTo(tour);
  run(tour, 120, {});
  assert.equal(tour.stats.gusts, 0);
  assert.equal(tour.cans, tourLevel(5).cans);
});

test('the wind can end the journey', () => {
  const tour = makeTour({ level: 10 });
  tour.begin();
  flyTo(tour);
  run(tour, tourLevel(10).wind.every * 3 + 1, { seen: true, open: false, holding: false });
  assert.equal(tour.state, 'lost');
});

test('painting with one hand, a gust is met by that hand open on the flag', () => {
  const safe = makeTour({ level: 5, hold: 'never' });
  safe.begin();
  flyTo(safe);
  dip(safe, Object.keys(safe.flag.colours)[0]);
  // No other hand, and the paint goes on.
  safe.update(FRAME, { ...HAND, brush: { x: 30, y: 20 }, holding: false });
  assert.ok(safe.painting.progress > 0);
  run(safe, tourLevel(5).wind.every + 0.5, { ...HAND, brush: { x: 30, y: 20 }, holding: false });
  assert.equal(safe.stats.held, 1);
  assert.equal(safe.cans, tourLevel(5).cans);

  const caught = makeTour({ level: 5, hold: 'never' });
  caught.begin();
  flyTo(caught);
  run(caught, tourLevel(5).wind.every + 0.5, { seen: true, open: false, brush: { x: 30, y: 20 } });
  assert.equal(caught.stats.lost, 1);
  assert.equal(caught.cans, tourLevel(5).cans - 1);
});

/* ---------- painting from memory ---------- */

test('level 7: the finished flag is shown, and then hidden', () => {
  const tour = makeTour({ level: 7, hold: 'never' });
  tour.begin();
  flyTo(tour);
  assert.equal(tour.shown, true);
  run(tour, tourLevel(7).memory - 0.5, { seen: true, open: false });
  assert.equal(tour.shown, true);
  run(tour, 1, { seen: true, open: false });
  assert.equal(tour.shown, false);
  assert.equal(tour.count('hidden'), 1);
});

test('the wrong paint held on a part shows the flag again for a moment, and the right paint never does', () => {
  const tour = makeTour({ level: 7, hold: 'never' });
  tour.begin();
  flyTo(tour);
  run(tour, tourLevel(7).memory + 0.2, { seen: true, open: false });
  const [first, second] = Object.keys(tour.flag.colours);
  const wants = (paint) => tour.flag.parts.findIndex((part) => part.colour === paint);
  const spot = (paint) => (tour.flag === STRIPES ? { x: 30, y: wants(paint) === 0 ? 20 : 80 } : { x: paint === 'red' ? 75 : 10, y: paint === 'red' ? 50 : 10 });
  dip(tour, first);
  run(tour, 1.5, { ...HAND, brush: spot(first) });
  assert.equal(tour.stats.peeks, 0);
  assert.equal(tour.shown, false);
  // Passing over the wrong part is nothing.
  run(tour, TOUR.wrong * 0.5, { ...HAND, brush: spot(second) });
  assert.equal(tour.shown, false);
  run(tour, TOUR.wrong, { ...HAND, brush: spot(second) });
  assert.equal(tour.shown, true);
  assert.equal(tour.stats.peeks, 1);
  run(tour, TOUR.peek + 0.2, { seen: true, open: false });
  assert.equal(tour.shown, false);
});

/* ---------- raising the flag ---------- */

test('the flag goes up with an open hand that takes the rope low down and lifts it, and never comes back down', () => {
  const tour = makeTour();
  tour.begin();
  flyTo(tour);
  paintFlag(tour);
  assert.equal(tour.state, 'raise');
  // A hand that's already high hasn't taken the rope.
  run(tour, 1, { ...HAND, lift: 0.95 });
  assert.equal(tour.state, 'raise');
  assert.equal(tour.raisedTo, 0);
  // A closed hand lifts nothing.
  run(tour, 1, { seen: true, open: false, lift: 0.1 });
  run(tour, 1, { seen: true, open: false, lift: 0.95 });
  assert.equal(tour.raisedTo, 0);
  run(tour, 0.2, { ...HAND, lift: 0.1 });
  run(tour, 0.2, { ...HAND, lift: 0.6 });
  assert.ok(Math.abs(tour.raisedTo - 0.6) < 1e-9);
  run(tour, 0.2, { ...HAND, lift: 0.3 });
  assert.ok(Math.abs(tour.raisedTo - 0.6) < 1e-9, 'it stays where it got to');
  run(tour, 0.2, { ...HAND, lift: 0.95 });
  assert.equal(tour.state, 'settle');
  assert.equal(tour.raisedTo, 1);
  assert.deepEqual(tour.flown, ['UKR']);
  assert.equal(tour.count('raised'), 1);
});

test('level 3: every flag raised is a stamp', () => {
  const tour = makeTour({ level: 3, hold: 'never' });
  tour.begin();
  stop(tour);
  assert.equal(tour.stats.stamps, 1);
  assert.equal(tour.count('stamp'), 1);
  const before = makeTour({ level: 2 });
  before.begin();
  stop(before);
  assert.equal(before.stats.stamps, 0);
});

/* ---------- the whole journey ---------- */

test('three flags raised win the journey, with fuel to spare', () => {
  const tour = makeTour();
  tour.begin();
  for (const country of JOURNEYS[1]) {
    assert.equal(tour.target, country);
    stop(tour);
  }
  assert.equal(tour.state, 'won');
  assert.equal(tour.count('won'), 1);
  assert.deepEqual(tour.flown, JOURNEYS[1]);
  assert.equal(tour.stats.stops, 3);
  assert.equal(tour.cans, tourLevel(1).cans);
  assert.equal(tour.stats.cup, false);
});

test('level 10 is four stops, and the cup', () => {
  const tour = makeTour({ level: 10, hold: 'never', gentle: true });
  tour.begin();
  for (let n = 0; n < 4; n += 1) stop(tour);
  assert.equal(tour.state, 'won');
  assert.equal(tour.stats.stops, 4);
  assert.equal(tour.stats.cup, true);
  assert.equal(tour.count('cup'), 1);
});

test('level 6: a fuel can on the way tops the tank up by one, and never past full', () => {
  const tour = makeTour({ level: 6, hold: 'never' });
  tour.begin();
  const full = tour.cans;
  choose(tour, tour.choices.find((id) => id !== tour.target));
  run(tour, TOUR.wrongRest + 0.1, HAND);
  assert.equal(tour.cans, full - 1);
  choose(tour);
  assert.ok(tour.can && !tour.can.taken);
  // A closed hand on the can takes nothing.
  run(tour, 0.3, { seen: true, open: false, onCan: true });
  assert.equal(tour.cans, full - 1);
  run(tour, 0.1, { ...HAND, onCan: true });
  assert.equal(tour.cans, full);
  assert.equal(tour.stats.cans, 1);
  run(tour, 0.5, { ...HAND, onCan: true });
  assert.equal(tour.stats.cans, 1, 'one can is one can');

  // With a full tank it stays full.
  const brimming = makeTour({ level: 6, hold: 'never' });
  brimming.begin();
  choose(brimming);
  run(brimming, 0.1, { ...HAND, onCan: true });
  assert.equal(brimming.cans, full);

  // Before level 6 there's no can, and none on the gentle tour, where fuel isn't counted.
  const early = makeTour({ level: 5, hold: 'never' });
  early.begin();
  choose(early);
  assert.equal(early.can, null);
  const gentle = makeTour({ level: 6, gentle: true });
  gentle.begin();
  choose(gentle);
  assert.equal(gentle.can, null);
});

test('a flag with a part nothing shows of can still be finished', () => {
  const hidden = { ...STRIPES, parts: [{ id: 'under', colour: 'yellow', shapes: [{ type: 'rect', x: 0, y: 0, w: 150, h: 50 }] }, ...STRIPES.parts] };
  const painting = new Painting(hidden);
  assert.equal(painting.done[0], true);
  assert.equal(painting.allDone, false);
  painting.fill(1);
  painting.fill(2);
  assert.equal(painting.allDone, true);
});
