// Giraffe's Garden: plants that grow with water and flower, where the water lands, what each level brings, the sun
// drying the garden, and, in the gentle garden, that resting costs nothing. Everything here runs without a screen,
// with a pretend child moving the can and tipping it. The tests of the old kind rules play the gentle garden, as
// makeGarden does unless a test says otherwise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BASKET_Y, DRYING, EXTRAS, Garden, gardenLevel, gardenNewAt, GROUND, LABELS, NEWS, newsIsOn, PLANT_COUNTS, SPREAD_NAMES,
  SPREADS, STAGES, STREAM, TALL, TOUCH,
} from '../../games/giraffe-garden/garden.js';
import { cleanCan, MAX_RACERS, mostIn, RaceRoom } from '../../server/race-room.js';

const FRAME = 1 / 60;
const LEVELS = Array.from({ length: 10 }, (_, index) => index + 1);

function makeGarden(options = {}) {
  const log = [];
  const garden = new Garden({ random: () => 0.5, sun: 'gentle', onEvent: (event) => log.push(event), ...options });
  garden.log = log;
  return garden;
}

const said = (garden, type) => garden.log.filter((event) => event.type === type);

/** Holds the can still at a place, pouring this much. */
const pourAt = (at, flow = 1) => ({ can: at, water: { ...at, flow } });

/** Runs the garden for a while with the same input, or one worked out each frame. */
function run(garden, seconds, input) {
  for (let t = 0; t < seconds; t += FRAME) garden.update(FRAME, typeof input === 'function' ? input(t) : input);
}

/**
 * A pretend child: moves the can towards the next thirsty plant, at a hand's speed, and tips it once it's there. On
 * the way, the can goes by whatever's to touch, as a child would happen to.
 */
function gardener(garden, { speed = 0.8 } = {}) {
  const can = { x: 0.5, y: 0.5 };
  return () => {
    const plant = garden.nextPlant(can.x);
    if (!plant) return { can: { ...can }, water: null };
    const aim = garden.aimFor(plant);
    const gap = Math.hypot(aim.x - can.x, aim.y - can.y);
    const step = Math.min(gap, speed * FRAME);
    if (gap > 0) {
      can.x += ((aim.x - can.x) / gap) * step;
      can.y += ((aim.y - can.y) / gap) * step;
    }
    return { can: { ...can }, water: gap < 0.01 ? { ...can, flow: 1 } : null };
  };
}

function playThrough(garden, seconds = 300) {
  const child = gardener(garden);
  let t = 0;
  for (; t < seconds && !garden.done; t += FRAME) garden.update(FRAME, child());
  return t;
}

/* ---------- plants and water ---------- */

test('a plant grows with water on it, a step at a time, and flowers once it has had enough', () => {
  const garden = makeGarden({ plants: 4 });
  const [plant] = garden.plants;
  const above = garden.aimFor(plant);
  assert.ok(garden.heightOf(plant) < 0.08, 'a little shoot to start with');
  run(garden, plant.need * 0.5, pourAt(above));
  assert.ok(plant.water > plant.need * 0.45 && !plant.bloomed);
  assert.ok(garden.heightOf(plant) > 0.1, 'taller');
  run(garden, plant.need * 0.6, pourAt(above));
  assert.ok(plant.bloomed);
  assert.equal(plant.stage, STAGES);
  assert.deepEqual(said(garden, 'grow').map(({ stage }) => stage), [1, 2]);
  assert.equal(said(garden, 'bloom').length, 1);
  assert.ok(Math.abs(garden.heightOf(plant) - TALL.flower) < 1e-9);
  // Water on it after that does nothing more.
  run(garden, 2, pourAt(above));
  assert.equal(said(garden, 'bloom').length, 1);
  assert.equal(garden.stats.flowers, 1);
});

test('the water only lands on what is under it: the plant beside it stays dry, and so does one the can is below', () => {
  const garden = makeGarden({ plants: 4, spread: 'wide' });
  const [first, second] = garden.plants;
  const between = { x: (first.x + second.x) / 2, y: 0.6 };
  run(garden, 1, pourAt(between));
  assert.deepEqual([first.water, second.water], [0, 0]);
  assert.equal(garden.splash.y, GROUND, 'it lands on the ground between them');
  // Just across from the first, it's caught.
  run(garden, 0.5, pourAt({ x: first.x + STREAM, y: 0.6 }));
  assert.ok(first.water > 0.4 && second.water === 0);
  // Water can't go up: a can held below a basket doesn't reach it.
  const high = makeGarden({ level: 8, plants: 6 });
  const basket = high.plants.find((plant) => plant.hanging);
  run(high, 1, pourAt({ x: basket.x, y: BASKET_Y + 0.1 }));
  assert.equal(basket.water, 0);
});

test('how much the can pours is how much grows: half tipped, half as much', () => {
  const full = makeGarden({ plants: 4 });
  const half = makeGarden({ plants: 4 });
  run(full, 0.5, pourAt(full.aimFor(full.plants[0]), 1));
  run(half, 0.5, pourAt(half.aimFor(half.plants[0]), 0.5));
  assert.ok(Math.abs(half.plants[0].water - full.plants[0].water / 2) < 0.02);
});

test('a pretend child waters every plant at every level, number and spread, and the garden finishes', () => {
  for (const level of LEVELS) {
    for (const plants of PLANT_COUNTS) {
      for (const spread of SPREAD_NAMES) {
        const garden = makeGarden({ level, plants, spread });
        const seconds = playThrough(garden);
        const where = `level ${level}, ${plants} plants, ${spread}`;
        assert.ok(garden.done, where);
        assert.equal(garden.stats.flowers, plants, where);
        assert.equal(said(garden, 'all-bloomed').length, 1, where);
        // Never so long that it drags, even at level 10 with eight plants far apart.
        assert.ok(seconds < 75, `${where}: ${seconds.toFixed(1)} s`);
      }
    }
  }
});

test('a resting child is never hurried: nothing in the garden dries out, goes away or can be missed', () => {
  const garden = makeGarden({ level: 10, plants: 6 });
  const plain = garden.plants.find((plant) => !garden.snails.some((snail) => snail.plant === plant));
  run(garden, 1, pourAt(garden.aimFor(plain)));
  assert.ok(plain.water > 0.9);
  const watered = garden.plants.map((plant) => plant.water);
  run(garden, 120, { can: null, water: null });
  assert.deepEqual(garden.plants.map((plant) => plant.water), watered, 'nothing dries out');
  assert.equal(garden.done, false);
  assert.equal(garden.sprinkler.taken, false, 'the sprinkler waits');
  assert.equal(garden.cloud.state, 'waiting', 'and the cloud');
  assert.equal(garden.hedgehog.drank, false, 'and the hedgehog');
  assert.ok(garden.snails.every((snail) => !snail.off), 'and the snails');
  // The bunny keeps popping up, so it's always there to splash again.
  assert.ok(said(garden, 'bunny-up').length > 5);
});

test('each pour is counted, as the can tips far enough, and the longest is kept', () => {
  const garden = makeGarden({ plants: 4 });
  const at = garden.aimFor(garden.plants[0]);
  for (let n = 0; n < 3; n += 1) {
    run(garden, 0.4, pourAt(at, 1));
    run(garden, 0.3, pourAt(at, 0.2));
  }
  run(garden, 0.9, pourAt(at, 1));
  assert.equal(garden.stats.pours, 4);
  assert.ok(Math.abs(garden.stats.longest - 0.9) < 0.05, `${garden.stats.longest}`);
});

/* ---------- the levels ---------- */

test('the levels: each from 2 brings something new, which is in its first garden, and level 1 is the plain garden', () => {
  assert.deepEqual(gardenNewAt(1), []);
  for (const level of LEVELS.slice(1)) {
    const news = gardenNewAt(level);
    assert.ok(news.length >= 1, `level ${level} brings something`);
    for (const { key, mark, name, nameKa } of news) {
      assert.ok(mark && name && nameKa, `${key} has its picture and names`);
      assert.ok(newsIsOn(key, level), `${key} is on at ${level}`);
      assert.ok(!newsIsOn(key, level - 1), `${key} isn't on before ${level}`);
      assert.ok(newsIsOn(key, 10), `${key} stays on after`);
    }
  }
  const plain = gardenLevel(1);
  assert.deepEqual([plain.bees, plain.snails, plain.sprinkler, plain.sunflower, plain.hedgehog, plain.bunny, plain.baskets, plain.cloud, plain.bean], [false, 0, false, false, false, false, 0, false, false]);
  assert.ok(gardenLevel(10).need > gardenLevel(1).need, 'each turn is held a little longer as the levels go up');
  for (const [en, ka] of Object.values(LABELS)) assert.ok(en && ka);
  assert.equal(Object.keys(NEWS).length, 9);
});

test('with friends, the plain garden: none of what the levels bring', () => {
  const garden = makeGarden({ level: 10, plain: true });
  assert.ok(garden.plants.every((plant) => plant.look === 'flower' && !plant.hanging));
  assert.deepEqual([garden.snails.length, garden.sprinkler, garden.cloud, garden.hedgehog, garden.bunny], [0, null, null, null, null]);
  assert.equal(garden.plants[0].need, gardenLevel(10).need);
});

test('level 2: a bee comes to each new flower, and its honey goes to the tally', () => {
  const garden = makeGarden({ level: 2, plants: 4 });
  playThrough(garden);
  assert.equal(said(garden, 'bee').length, 4);
  assert.equal(garden.stats.prizes.honey, 4);
  assert.equal(makeGarden({ level: 1 }).plan.bees, false);
});

test('level 3: a snail munching a plant keeps it from growing until a splash sends it sliding off', () => {
  const garden = makeGarden({ level: 3, plants: 6 });
  const [snail] = garden.snails;
  assert.equal(garden.snails.length, 1);
  const { plant } = snail;
  run(garden, EXTRAS.snailSplash * 0.8, pourAt(garden.aimFor(plant)));
  assert.equal(plant.water, 0, 'the snail has had the water');
  assert.equal(snail.off, false);
  run(garden, EXTRAS.snailSplash * 0.4, pourAt(garden.aimFor(plant)));
  assert.equal(snail.off, true);
  assert.equal(said(garden, 'snail-off').length, 1);
  run(garden, 0.5, pourAt(garden.aimFor(plant)));
  assert.ok(plant.water > 0.3, 'and now the plant grows');
  assert.equal(makeGarden({ level: 9 }).snails.length, 2);
});

test('level 4: the sprinkler, once the can touches it, waters a wide patch, and only runs down while the can pours', () => {
  const garden = makeGarden({ level: 4, plants: 8, spread: 'close' });
  const { sprinkler } = garden;
  run(garden, 1, { can: { x: sprinkler.x + 0.3, y: sprinkler.y }, water: null });
  assert.equal(sprinkler.taken, false);
  run(garden, 0.1, { can: { x: sprinkler.x, y: sprinkler.y + TOUCH * 0.5 }, water: null });
  assert.equal(sprinkler.taken, true);
  assert.equal(said(garden, 'sprinkler').length, 1);
  // Not pouring, it waits.
  run(garden, 5, { can: { x: 0.5, y: 0.5 }, water: null });
  assert.equal(sprinkler.left, EXTRAS.sprinklerSeconds);
  // Pouring between two plants, both get the water.
  const [a, b] = garden.plants.slice(5, 7);
  assert.ok(!garden.snails.some((snail) => snail.plant === a || snail.plant === b));
  run(garden, 1, pourAt({ x: (a.x + b.x) / 2, y: 0.6 }));
  assert.ok(a.water > 0.5 && b.water > 0.5, `${a.water} and ${b.water}`);
  run(garden, EXTRAS.sprinklerSeconds, pourAt({ x: 0.05, y: 0.6 }));
  assert.equal(sprinkler.left, 0);
  assert.equal(said(garden, 'sprinkler-done').length, 1);
  assert.equal(garden.streamWidth(), STREAM);
});

test('level 5: a sunflower needs twice the water, grows twice as tall, and catches water from beside it', () => {
  const garden = makeGarden({ level: 5, plants: 6 });
  const sunflower = garden.plants.find((plant) => plant.look === 'sunflower');
  assert.equal(sunflower.need, gardenLevel(5).need * EXTRAS.sunflowerNeeds);
  run(garden, sunflower.need + 0.2, (t) => pourAt({ x: sunflower.x, y: 0.62 }));
  assert.ok(sunflower.bloomed);
  assert.ok(garden.heightOf(sunflower) > TALL.flower * 1.8);
});

test('level 6: the hedgehog\'s bowl fills with water, and it drinks and leaves an apple', () => {
  const garden = makeGarden({ level: 6, plants: 6 });
  const { hedgehog } = garden;
  run(garden, EXTRAS.bowlNeeds + 0.1, pourAt({ x: hedgehog.x, y: 0.62 }));
  assert.equal(hedgehog.drank, true);
  assert.equal(garden.stats.prizes.apple, 1);
  run(garden, 2, pourAt({ x: hedgehog.x, y: 0.62 }));
  assert.equal(garden.stats.prizes.apple, 1, 'only once');
});

test('level 7: the bunny pops up now and then, and a splash while it\'s up makes it giggle and give a carrot, three at most', () => {
  const garden = makeGarden({ level: 7, plants: 6 });
  const { bunny } = garden;
  const over = pourAt({ x: bunny.x, y: 0.62 });
  // Down its hole, the water lands on the ground.
  assert.equal(bunny.up, false);
  run(garden, 0.5, over);
  assert.equal(garden.stats.prizes.carrot, 0);
  for (let n = 0; n < 5; n += 1) {
    let waited = 0;
    for (; !bunny.up && waited < EXTRAS.bunnyDown + 1; waited += FRAME) garden.update(FRAME, { can: null, water: null });
    assert.equal(bunny.up, true, 'it pops up again');
    assert.ok(waited <= EXTRAS.bunnyDown + 0.1);
    run(garden, EXTRAS.bunnySplash + 0.1, over);
    assert.equal(bunny.up, false, 'a giggle, and back down');
  }
  assert.equal(said(garden, 'bunny-giggle').length, 5);
  assert.equal(garden.stats.prizes.carrot, EXTRAS.bunnyGifts);
});

test('level 8: two plants hang in baskets up high, and only a can reached up above them waters them', () => {
  const garden = makeGarden({ level: 8, plants: 6 });
  const baskets = garden.plants.filter((plant) => plant.hanging);
  assert.equal(baskets.length, 2);
  // However few plants there are, both baskets come, even with the sunflower in one of their places.
  for (const plants of PLANT_COUNTS) assert.equal(makeGarden({ level: 8, plants }).plants.filter((plant) => plant.hanging).length, 2, `${plants} plants`);
  for (const basket of baskets) {
    assert.equal(basket.y, BASKET_Y);
    const aim = garden.aimFor(basket);
    assert.ok(aim.y < BASKET_Y - TALL.hanging, 'the can has to go up above it');
    run(garden, basket.need + 0.1, pourAt(aim));
    assert.ok(basket.bloomed);
  }
  // In flower, a basket still catches the water, so the ground under it stays dry.
  run(garden, 0.5, pourAt(garden.aimFor(baskets[0])));
  assert.ok(garden.splash.y < GROUND - 0.2);
});

test('level 9: the rain cloud, once the can touches it, rains across the garden for a while, and goes', () => {
  const garden = makeGarden({ level: 9, plants: 6 });
  const { cloud } = garden;
  run(garden, 0.1, { can: { x: cloud.x, y: cloud.y }, water: null });
  assert.equal(cloud.state, 'raining');
  run(garden, EXTRAS.cloudSeconds + 0.1, { can: null, water: null });
  assert.equal(cloud.state, 'gone');
  assert.equal(said(garden, 'cloud-done').length, 1);
  const wet = garden.plants.filter((plant) => plant.water > 0 || plant.bloomed);
  assert.ok(wet.length >= 2, `it rained on ${wet.length} plants`);
});

test('level 10: the magic bean needs a lot of water, grows up into the sky, and has a golden egg at the top', () => {
  const garden = makeGarden({ level: 10, plants: 6 });
  const bean = garden.plants.find((plant) => plant.look === 'bean');
  assert.equal(bean.need, gardenLevel(10).need * EXTRAS.beanNeeds);
  run(garden, bean.need + 0.2, pourAt(garden.aimFor(bean)));
  assert.ok(bean.bloomed);
  assert.equal(garden.stats.prizes.egg, 1);
  assert.ok(bean.y - garden.heightOf(bean) < 0.3, 'its top is up in the sky');
});

test('the newest things are in easy reach, and a plant\'s place across is the same each time', () => {
  for (const spread of SPREAD_NAMES) {
    const [from, to] = SPREADS[spread];
    const garden = makeGarden({ level: 10, plants: 6, spread });
    assert.ok(garden.plants.every((plant) => plant.x >= from - 1e-9 && plant.x <= to + 1e-9));
    const bean = garden.plants.find((plant) => plant.look === 'bean');
    assert.ok(Math.abs(bean.x - (from + to) / 2) < (to - from) / 4, 'the bean near the middle');
  }
  const again = makeGarden({ level: 10, plants: 6 }).plants.map(({ x, kind }) => [x, kind]);
  assert.deepEqual(makeGarden({ level: 10, plants: 6 }).plants.map(({ x, kind }) => [x, kind]), again);
});

/* ---------- watering with friends ---------- */

/**
 * Friends' games, watering the same garden, with a pretend server between them: the first claim of each sip has it,
 * and everyone is told. hold keeps the answers back, as a slow connection would, until let go.
 */
function friendsGarden(players = ['aaaa', 'bbbb'], { level = 3, plants = 4 } = {}) {
  const claims = new Map();
  const gardens = {};
  const held = [];
  let holding = false;
  const tell = (k, by) => {
    for (const id of players) gardens[id].claimed(k, by);
  };
  const claim = (by) => (k) => {
    if (claims.has(k)) return;
    claims.set(k, by);
    if (holding) held.push([k, by]);
    else tell(k, by);
  };
  for (const id of players) gardens[id] = makeGarden({ level, plants, plain: true, shared: { claim: claim(id) }, me: id });
  return {
    gardens,
    claims,
    hold: () => {
      holding = true;
    },
    letGo: () => {
      holding = false;
      for (const [k, by] of held.splice(0)) tell(k, by);
    },
  };
}

test('with friends, everyone waters the same plain garden: a plant grows by everyone\'s sips, the same on every computer', () => {
  const { gardens, claims } = friendsGarden();
  const { aaaa: ana, bbbb: ben } = gardens;
  assert.ok(ana.plants.every((plant) => plant.look === 'flower') && !ana.snails.length && !ana.sprinkler);
  const [plant] = ana.plants;
  run(ana, 1, pourAt(ana.aimFor(plant)));
  run(ben, 1, { can: null, water: null });
  // Only what was claimed counts, a sip at a time, and Ben's game has the same.
  assert.ok(Math.abs(plant.water - ben.plants[0].water) < 1e-9);
  assert.ok(plant.water >= 0.8 && plant.water <= 1, `${plant.water}`);
  assert.ok([...claims.values()].every((by) => by === 'aaaa'));
  assert.equal(ana.tally.get('aaaa'), ben.tally.get('aaaa'));
  // Ben pours on it too, and it flowers on both at once.
  for (let t = 0; t < 3 && !plant.bloomed; t += FRAME) {
    ana.update(FRAME, pourAt(ana.aimFor(plant)));
    ben.update(FRAME, pourAt(ben.aimFor(ben.plants[0])));
  }
  assert.ok(plant.bloomed && ben.plants[0].bloomed);
  assert.ok(ben.tally.get('bbbb') > 0, 'Ben gave some of it');
  assert.equal(said(ana, 'bloom').length, 1);
  assert.equal(said(ben, 'bloom').length, 1);
});

test('with friends, two watering a plant together grow it twice as fast, and neither\'s water is lost', () => {
  const alone = friendsGarden();
  const together = friendsGarden();
  const time = (setup, both) => {
    const { aaaa: ana, bbbb: ben } = setup.gardens;
    let t = 0;
    for (; t < 10 && !ana.plants[0].bloomed; t += FRAME) {
      ana.update(FRAME, pourAt(ana.aimFor(ana.plants[0])));
      ben.update(FRAME, both ? pourAt(ben.aimFor(ben.plants[0])) : { can: null, water: null });
    }
    return t;
  };
  const one = time(alone, false);
  const two = time(together, true);
  assert.ok(two < one * 0.62, `${two.toFixed(2)} s together, ${one.toFixed(2)} s alone`);
  // Each one's sips add up to what the plant had: when both claimed the same sip, the one who didn't get it gave the
  // water as another.
  const { aaaa: ana } = together.gardens;
  const given = [...ana.tally.values()].reduce((sum, n) => sum + n, 0);
  assert.equal(given, ana.plants[0].sips.size);
});

test('with friends, a sip with no answer is claimed again, and answers that come late still count once', () => {
  const setup = friendsGarden(['aaaa', 'bbbb']);
  const { aaaa: ana } = setup.gardens;
  const [plant] = ana.plants;
  setup.hold();
  run(ana, 1, pourAt(ana.aimFor(plant)));
  assert.equal(plant.water, 0, 'nothing grows until the server says');
  const asked = plant.asked.size;
  assert.ok(asked >= 4);
  // Nothing back for a while: given up, and claimed again as new sips.
  run(ana, 2.2, { can: null, water: null });
  assert.equal(plant.asked.size, 0);
  assert.ok(plant.pending >= asked * 0.2 - 1e-9);
  setup.letGo();
  // The late answers count, each once.
  assert.equal(plant.sips.size, asked);
  assert.ok(Math.abs(plant.water - asked * 0.2) < 1e-9);
});

test('every line the game says has its English and Georgian voice files, and the game says each one', () => {
  const folder = new URL('../../games/giraffe-garden/audio/voice/', import.meta.url);
  const lines = JSON.parse(readFileSync(new URL('lines.json', folder), 'utf8'));
  assert.ok(lines.length >= 4);
  for (const { id, ka } of lines) {
    assert.ok(ka, `${id} has Georgian`);
    for (const language of ['en', 'ka']) assert.ok(readFileSync(new URL(`${language}/${id}.ogg`, folder)).length > 1000, `${language}/${id}.ogg`);
  }
  const source = readFileSync(new URL('../../games/giraffe-garden/main.js', import.meta.url), 'utf8');
  for (const { text } of lines) assert.ok(source.includes(text), `"${text}" is said by the game`);
});

test('a friends\' garden holds four, and each one\'s can goes to the others, cleaned, keeping its kind', () => {
  assert.equal(mostIn('giraffe-garden'), MAX_RACERS);
  const players = [];
  let clock = 1000;
  const rules = new RaceRoom({ players: () => players }, () => clock);
  const join = (id) => {
    const player = { meta: null, heard: [], setMeta(meta) { this.meta = meta; }, send(message) { this.heard.push(message); }, close() {} };
    players.push(player);
    clock += 10;
    return rules.arrive(player, id, null, { most: mostIn('giraffe-garden'), making: players.length === 1 }) ? player : null;
  };
  const [ana, ben] = ['aaaaaaaa', 'bbbbbbbb'].map(join);
  for (const player of [ana, ben]) rules.hear(player, JSON.stringify({ t: 'ready' }));
  const points = Array.from({ length: 42 }, (_, i) => (i % 2 ? 0.123456 : -9));
  rules.hear(ana, JSON.stringify({ t: 'can', ms: 1500.4, u: 0.33333, y: 9, v: 1, tip: 0.876, f: 2, p: points, picture: 'not this' }));
  const heard = ben.heard.filter(({ t }) => t === 'can').at(-1);
  assert.deepEqual(Object.keys(heard), ['t', 'from', 'ms', 'u', 'y', 'v', 'tip', 'f', 'p']);
  assert.deepEqual([heard.t, heard.from, heard.u, heard.y, heard.tip, heard.f], ['can', 'aaaaaaaa', 0.333, 1.5, 0.88, 1]);
  assert.deepEqual(heard.p.slice(0, 2), [-4, 0.12]);
  // A can that can't be seen pours nothing and has no glove.
  assert.deepEqual(cleanCan({ v: 0, tip: 1, f: 1, p: points }), { ms: 0, u: 0, y: 0, v: 0, tip: 0, f: 0, p: [] });
  // Sips are claimed as balloons are: the first to claim each has it, and everyone hears whose.
  rules.hear(ana, JSON.stringify({ t: 'claim', k: 203 }));
  rules.hear(ben, JSON.stringify({ t: 'claim', k: 203 }));
  assert.deepEqual(ben.heard.filter(({ t }) => t === 'claimed'), [{ t: 'claimed', k: 203, by: 'aaaaaaaa' }]);
  const biggest = JSON.stringify({ t: 'can', from: 'abcdefghijkl', ...cleanCan({ ms: 3_599_999, u: 1.4, y: 1.4, v: 1, tip: 1, f: 1, p: Array(42).fill(-3.99) }) });
  assert.ok(biggest.length < 400, `${biggest.length} characters at most`);
});

test('the garden\'s rooms are known to both servers, and a friend\'s can is passed on to the game', () => {
  for (const file of ['../../server/worker.js', '../../tools/race-server.mjs']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /const GAMES = \[[^\]]*'giraffe-garden'/, file);
  }
  const friends = readFileSync(new URL('../../core/friends.js', import.meta.url), 'utf8');
  assert.match(friends, /'can'[^\]]*\]\.includes\(message\.t\)/);
});

/* ---------- the sun drying the garden ---------- */

const sunny = (options = {}) => makeGarden({ sun: 'dries', ...options });

/**
 * A pretend child for a garden the sun dries: moves the can at speed screens a second, takes settle seconds to turn
 * the hand over once it's there, and, minding the plants, first goes to splash one that's getting too thirsty.
 */
function carer(garden, { speed = 1.5, settle = 0.3, mindful = true } = {}) {
  const can = { x: 0.5, y: 0.5 };
  let there = 0;
  let target = null;
  let topUp = false;
  return () => {
    if (!target || target.bloomed || (topUp && target.thirst < 0.05)) {
      const parched = mindful ? garden.thirsty.filter((plant) => plant.thirst > 0.75).sort((a, b) => b.thirst - a.thirst)[0] : null;
      topUp = Boolean(parched);
      target = parched ?? garden.nextPlant(can.x);
    }
    if (!target) return { can: { ...can }, water: null };
    const aim = garden.aimFor(target);
    const gap = Math.hypot(aim.x - can.x, aim.y - can.y);
    const step = Math.min(gap, speed * FRAME);
    if (gap > 0) {
      can.x += ((aim.x - can.x) / gap) * step;
      can.y += ((aim.y - can.y) / gap) * step;
    }
    there = gap < 0.01 ? there + FRAME : 0;
    return { can: { ...can }, water: there > settle ? { ...can, flow: 1 } : null };
  };
}

function careFor(garden, options = {}, seconds = 300) {
  const child = carer(garden, options);
  let t = 0;
  for (; t < seconds && !garden.done; t += FRAME) garden.update(FRAME, child());
  return t;
}

test('on their own the sun dries every plant not in flower, while the hand is in the picture, and a splash puts it right', () => {
  const garden = sunny({ plants: 4 });
  assert.equal(garden.drying, true);
  const [first, second] = garden.plants;
  // No hand: nothing dries, however long it's away.
  run(garden, 120, { can: null, water: null });
  assert.ok(garden.plants.every((plant) => plant.thirst === 0));
  // A hand in the picture, holding the can or not: they all get thirstier.
  run(garden, 10, { can: { x: 0.5, y: 0.5 }, water: null });
  for (const plant of garden.plants) assert.ok(Math.abs(plant.thirst - 10 / gardenLevel(1).wilt) < 0.01, `${plant.thirst}`);
  // Water on one puts it right, quickly, and the others go on drying.
  run(garden, DRYING.fresh, pourAt(garden.aimFor(first)));
  assert.ok(first.thirst < 0.001, `${first.thirst}`);
  assert.ok(second.thirst > 10 / gardenLevel(1).wilt);
  // A plant in flower is safe from the sun.
  run(garden, first.need, pourAt(garden.aimFor(first)));
  assert.ok(first.bloomed);
  const flowered = first.thirst;
  run(garden, 5, { can: { x: 0.5, y: 0.5 }, water: null });
  assert.equal(first.thirst, flowered);
});

test('a plant left too long wilts, and a moment later the garden is over, lost', () => {
  const garden = sunny({ plants: 4 });
  const wilt = gardenLevel(1).wilt;
  let t = 0;
  for (; t < 200 && !garden.wilted; t += FRAME) garden.update(FRAME, { can: { x: 0.5, y: 0.5 }, water: null });
  assert.ok(Math.abs(t - wilt) < 0.05, `wilted after ${t} s`);
  assert.equal(said(garden, 'wilted').length, 1);
  assert.equal(said(garden, 'wilted')[0].plant, garden.wilted);
  assert.deepEqual([garden.lost, garden.done], [true, false]);
  // Nothing more grows, and then it's over.
  run(garden, DRYING.wiltedSeconds - 0.1, pourAt(garden.aimFor(garden.plants[1])));
  assert.equal(garden.plants[1].water, 0);
  run(garden, 0.2, { can: null, water: null });
  assert.equal(garden.done, true);
  assert.equal(said(garden, 'all-bloomed').length, 0);
});

test('a quick child who minds the plants grows every one at every level, and one who only goes along loses the highest levels', () => {
  for (const level of LEVELS) {
    const garden = sunny({ level });
    careFor(garden);
    assert.ok(garden.done && !garden.lost, `level ${level}: ${garden.lost ? 'a plant wilted' : 'not over'}`);
  }
  // A slow child who waters them one after another, and pays no mind to the others drying.
  const slowly = { speed: 0.15, settle: 1.5, mindful: false };
  const first = sunny({ level: 1 });
  careFor(first, slowly);
  assert.ok(first.done && !first.lost, 'level 1, slowly');
  const last = sunny({ level: 10 });
  careFor(last, slowly);
  assert.equal(last.lost, true, 'level 10, slowly');
  const along = sunny({ level: 10 });
  careFor(along, { mindful: false });
  assert.equal(along.lost, true, 'level 10, quickly, but only going along');
  // The sun is quicker each level, and at level 10 takes about a third of level 1's time.
  for (const level of LEVELS.slice(1)) assert.ok(gardenLevel(level).wilt < gardenLevel(level - 1).wilt);
  assert.deepEqual([gardenLevel(1).wilt, gardenLevel(10).wilt], DRYING.wilt);
});

test('the gentle garden, and the garden with friends, never dry out', () => {
  const gentle = makeGarden({ sun: 'gentle' });
  run(gentle, 300, { can: { x: 0.5, y: 0.5 }, water: null });
  assert.deepEqual([gentle.drying, gentle.lost, gentle.done], [false, false, false]);
  assert.ok(gentle.plants.every((plant) => plant.thirst === 0));
  const friends = new Garden({ sun: 'dries', plain: true, shared: { claim: () => {} }, me: 'a' });
  assert.equal(friends.drying, false);
});

test('the grown-ups\' settings: the sun drying the garden comes first, and the gentle garden can be chosen', () => {
  const source = readFileSync(new URL('../../games/giraffe-garden/main.js', import.meta.url), 'utf8');
  assert.match(source, /defaults: \{ turn: 'little', spread: 'middle', plants: 6, gardenSun: 'dries' \}/);
  assert.match(source, /choice\('gardenSun', 'gentle', 'Gentle: /);
});
