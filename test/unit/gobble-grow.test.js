// Gobble and Grow's rules: games/gobble-grow/rules.js and worlds.js, with a made-up player whose mouth opens and
// shuts, and whose face goes where each test says.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAST_LEVEL } from '../../core/levels.js';
import {
  AUTO_CHOMP_SECONDS, BITES, FIELD, foodPlace, foodPlan, gobbleNewAt, grewBy, HEAD, HEAD_NAMES, KIND_SIZE, kindsEdible, ladderFor, radiusAt, Soup,
  soupLevel, START_R, teamGoal, timesWords,
} from '../../games/gobble-grow/rules.js';
import { GROWTH, worldAt, WORLDS } from '../../games/gobble-grow/worlds.js';
import { DT, MIDDLE, playWell, run } from './gobble-player.js';

const LEVELS = Array.from({ length: LAST_LEVEL }, (_, index) => index + 1);
const near = (actual, expected, within, message) => assert.ok(Math.abs(actual - expected) <= within, `${message ?? 'value'}: ${actual} is not within ${within} of ${expected}`);

/** A soup that keeps a list of what happened in it. */
function makeSoup(options = {}) {
  const events = [];
  // The soup as it always was, where bigger things only nudge: test/unit/gobble-grow-caught.test.js has the default.
  const soup = new Soup({ seed: 7, gentle: true, ...options, onEvent: (event) => events.push(event) });
  const count = (type) => events.filter((event) => event.type === type).length;
  return { soup, events, count };
}

/** Puts a thing to eat right where the creature is, of a kind, staying put: for rules that need one in reach. */
function putFood(soup, kind = 0, at = null) {
  const { creature } = soup;
  const place = at ?? { x: creature.x + creature.r * 0.5, y: creature.y };
  const food = {
    id: 9000 + soup.foods.length,
    kind,
    r: START_R * KIND_SIZE[kind],
    born: soup.time,
    life: 1000,
    from: place,
    vel: { x: 0, y: 0 },
    across: { x: 0, y: 1 },
    sway: 0,
    beat: 0,
    phase: 0,
    state: 'drift',
    bumped: false,
    ...place,
  };
  soup.foods.push(food);
  return food;
}

/** A soup with nothing in it but what a test puts there. */
function emptySoup(options = {}) {
  const made = makeSoup(options);
  made.soup.foods = [];
  made.events.length = 0;
  // Nothing more arrives by itself.
  made.soup.next = Infinity;
  made.soup.spawnDue = () => {};
  return made;
}

/** One bite: the mouth opens for a moment, and shuts. */
function bite(soup, openFor = 0.4, shutFor = 0.3) {
  run(soup, openFor, () => ({ open: true }));
  run(soup, shutFor, () => ({ open: false }));
}

/* ---------- the ten worlds ---------- */

test('there are ten worlds, each with a bigger creature than the last, from a bacterium to a galaxy', () => {
  assert.equal(WORLDS.length, LAST_LEVEL);
  assert.equal(WORLDS[0].id, 'bacterium');
  assert.equal(WORLDS.at(-1).id, 'galaxy');
  assert.equal(new Set(WORLDS.map((world) => world.id)).size, LAST_LEVEL);
  WORLDS.forEach((world, index) => {
    assert.equal(worldAt(index + 1), world);
    if (index > 0) assert.ok(world.size > WORLDS[index - 1].size * GROWTH, `${world.id} begins bigger than ${WORLDS[index - 1].id} ends`);
    for (const key of ['mark', 'you', 'youKa', 'place', 'placeKa']) assert.ok(world[key], `${world.id} has ${key}`);
    assert.match(world.youKa, /[ა-ჰ]/, `${world.id}'s name in Georgian`);
  });
  assert.equal(worldAt(0), WORLDS[0]);
  assert.equal(worldAt(99), WORLDS.at(-1));
});

test('each world has three things of its own to eat, with a name in each language', () => {
  const names = new Set();
  for (const world of WORLDS) {
    assert.equal(world.foods.length, 3, world.id);
    for (const food of world.foods) {
      assert.ok(food.id && food.name && food.nameKa, `${world.id}: ${food.id}`);
      assert.match(food.nameKa, /[ა-ჰ]/);
      assert.ok(!names.has(food.id), `${food.id} is in one world only`);
      names.add(food.id);
    }
  }
  assert.equal(names.size, 30);
});

test('between each world and the next is an everyday thing that really is bigger than the child was and smaller than they\'ll be', () => {
  WORLDS.slice(0, -1).forEach((world, index) => {
    const { thing } = world;
    assert.ok(thing.name && thing.nameKa, world.id);
    assert.ok(thing.size > world.size * GROWTH, `${thing.id} is bigger than ${world.id} at its biggest`);
    assert.ok(thing.size < WORLDS[index + 1].size, `${thing.id} is smaller than ${WORLDS[index + 1].id}`);
  });
  assert.equal(WORLDS.at(-1).thing, null, 'after a galaxy there\'s only the sky');
});

test('every level from 2 to 10 brings a new world, named on the cards in both languages, and level 1 is the plain game', () => {
  assert.deepEqual(gobbleNewAt(1), []);
  const seen = new Set();
  for (const level of LEVELS.slice(1)) {
    const news = gobbleNewAt(level);
    assert.equal(news.length, 1, `level ${level}`);
    const [{ mark, name, nameKa }] = news;
    assert.equal(mark, worldAt(level).mark);
    assert.ok(name.toLowerCase().includes(worldAt(level).you), name);
    assert.match(nameKa, /[ა-ჰ]/);
    assert.match(name, /^[A-Z]/);
    seen.add(name);
  }
  assert.equal(seen.size, 9, 'a different one each time');
  assert.equal(gobbleNewAt(2)[0].name, 'A water flea in a drop of water');
});

/* ---------- what a level changes, and what it doesn't ---------- */

test('gentle: at level 10 there\'s still most of level 1\'s time to get to a thing, and not many more of them', () => {
  // The soup as it always was: test/unit/gobble-grow-caught.test.js has the steeper climb that comes by default.
  const [first, last] = [soupLevel(1, { gentle: true }), soupLevel(10, { gentle: true })];
  assert.ok(last.cross / first.cross >= 0.7, `${last.cross} of ${first.cross} seconds`);
  assert.ok(last.cross < first.cross);
  assert.ok(first.gap / last.gap <= 2, 'no more than twice as many a minute');
  for (const level of LEVELS) {
    const plan = soupLevel(level);
    assert.equal(plan.world, worldAt(level));
    // Half or more of what comes is the smallest kind, so there's always something to eat.
    assert.ok(plan.pattern.filter((kind) => kind === 0).length * 2 >= plan.pattern.length, `level ${level}`);
    assert.ok([0, 1, 2].every((kind) => plan.pattern.includes(kind)), `level ${level} has all three kinds`);
    // Eight or nine things in the soup at once, at every level.
    near(plan.cross / plan.gap, 8.5, 0.5, `things at once at level ${level}`);
  }
});

test('a level never changes how much there is to eat, or how far the head has to move: those are a grown-up\'s', () => {
  for (const level of LEVELS) {
    for (const bites of BITES) {
      const { soup } = makeSoup({ level, bites });
      assert.equal(soup.goal, bites);
    }
    for (const head of HEAD_NAMES) assert.deepEqual(new Soup({ level, head }).head, HEAD[head]);
  }
  assert.deepEqual(BITES, [8, 12, 16]);
  assert.equal(new Soup({ head: 'nonsense' }).head, HEAD.medium);
});

/* ---------- growing ---------- */

test('the creature is a little bigger with every bite, and ends each world more than twice the size it began', () => {
  near(radiusAt(0), START_R, 1e-9);
  near(radiusAt(1), START_R * GROWTH, 1e-9);
  assert.ok(GROWTH >= 2);
  let before = 0;
  for (let bites = 0; bites <= 12; bites += 1) {
    const radius = radiusAt(bites / 12);
    assert.ok(radius > before);
    before = radius;
  }
  near(radiusAt(5), START_R * GROWTH, 1e-9, 'and no more than that');
});

test('only the smallest kind can be eaten to begin with, the middle kind after a few bites, and the biggest later on', () => {
  assert.equal(kindsEdible(radiusAt(0)), 1);
  assert.equal(kindsEdible(radiusAt(1)), 3);
  for (const bites of BITES) {
    const firstBiteFor = (kinds) => Array.from({ length: bites + 1 }, (_, eaten) => eaten).find((eaten) => kindsEdible(radiusAt(eaten / bites)) >= kinds);
    const [middle, biggest] = [firstBiteFor(2), firstBiteFor(3)];
    assert.ok(middle >= 2 && middle <= bites * 0.4, `the middle kind after ${middle} of ${bites}`);
    assert.ok(biggest > middle + 1 && biggest <= bites * 0.75, `the biggest after ${biggest} of ${bites}`);
  }
  // Each kind is bigger than the creature is at first, apart from the smallest, and all are smaller than it ends.
  assert.ok(KIND_SIZE[0] < 1 && KIND_SIZE[1] > 1 && KIND_SIZE[2] > KIND_SIZE[1] && KIND_SIZE[2] < GROWTH);
});

/* ---------- the things to eat, and their paths ---------- */

test('the same seed lays out the same things on the same paths, and another seed lays out others', () => {
  const plan = soupLevel(3);
  for (let k = 0; k < 40; k += 1) {
    assert.deepEqual(foodPlan(1234, k, plan), foodPlan(1234, k, plan));
    assert.equal(foodPlan(1234, k, plan).kind, plan.pattern[k % plan.pattern.length]);
  }
  const differ = Array.from({ length: 40 }, (_, k) => foodPlan(1234, k, plan).from.y !== foodPlan(99, k, plan).from.y).filter(Boolean).length;
  assert.ok(differ > 35);
});

test('each thing drifts in from outside one edge and out of another, slowly, swaying a little, and clear of the tally and the prompt', () => {
  for (const level of [1, 5, 10]) {
    const plan = soupLevel(level);
    let fromLeft = 0;
    let fromRight = 0;
    for (let k = 0; k < 300; k += 1) {
      const food = foodPlan(42, k, plan);
      const outside = ({ x, y }) => x < -food.r || x > FIELD.wide + food.r || y < -food.r || y > FIELD.tall + food.r;
      assert.ok(outside(foodPlace(food, food.born)), 'it begins out of sight');
      assert.ok(outside(foodPlace(food, food.born + food.life)), 'and ends out of sight');
      const middle = foodPlace(food, food.born + food.life / 2);
      assert.ok(!outside(middle));
      near(food.born, k * plan.gap, 1e-9);
      assert.ok(food.life <= plan.cross * 1.1 && food.life >= plan.cross * 0.5, `it takes ${food.life} s`);
      assert.ok(food.sway <= 0.07);
      if (food.from.x < 0) fromLeft += 1;
      if (food.from.x > FIELD.wide) fromRight += 1;
      // Those that cross from side to side stay below the tally and above the prompt.
      if (food.from.x < 0 || food.from.x > FIELD.wide) {
        for (let share = 0; share <= 1; share += 0.1) {
          const { y } = foodPlace(food, food.born + food.life * share);
          assert.ok(y > 0.17 && y < 0.93, `y ${y}`);
        }
      }
      // How fast it goes: never quicker than its level says.
      near(Math.hypot(food.vel.x, food.vel.y), (FIELD.wide + 0.3) / plan.cross, 1e-9);
    }
    assert.ok(fromLeft > 90 && fromRight > 90, 'from both sides');
  }
});

test('there\'s food about from the first moment, and it keeps coming for as long as it takes', () => {
  for (const level of LEVELS) {
    const { soup } = makeSoup({ level });
    const onScreen = () => soup.foods.filter(({ x, y }) => x > 0 && x < FIELD.wide && y > 0 && y < 1).length;
    assert.ok(onScreen() >= 3, `level ${level} begins with ${onScreen()} things in view`);
    // Five minutes of a child who does nothing at all.
    let least = Infinity;
    let leastSmall = Infinity;
    for (let second = 0; second < 300; second += 1) {
      run(soup, 1, () => ({ seen: false }));
      least = Math.min(least, onScreen());
      leastSmall = Math.min(leastSmall, soup.foods.filter((food) => food.kind === 0).length);
    }
    assert.ok(least >= 3, `never fewer than ${least} in view`);
    assert.ok(leastSmall >= 2, `always something small enough: ${leastSmall}`);
    assert.ok(soup.foods.length <= 12, 'and never a crowd');
    assert.equal(soup.total, 0);
    assert.equal(soup.phase, 'play');
  }
});

/* ---------- eating ---------- */

test('opening the mouth with something small in reach gobbles it, and it counts when the mouth shuts', () => {
  const { soup, events, count } = emptySoup();
  const food = putFood(soup);
  run(soup, 0.5);
  assert.equal(soup.target, food, 'in reach, and waiting');
  assert.equal(soup.eaten, 0);

  run(soup, 0.3, () => ({ open: true }));
  assert.equal(count('gulp'), 1);
  assert.equal(soup.creature.holding, food, 'it\'s in the mouth');
  assert.equal(soup.eaten, 0, 'but not eaten until the mouth shuts');
  assert.equal(count('chomp'), 0);

  run(soup, 0.1, () => ({ open: false }));
  assert.equal(count('chomp'), 1);
  assert.equal(soup.eaten, 1);
  assert.equal(soup.total, 1);
  assert.equal(soup.creature.holding, null);
  assert.ok(!soup.foods.includes(food));
  assert.ok(soup.creature.r > START_R, 'and the creature has grown');
  near(soup.creature.r, radiusAt(1 / 12), 1e-9);
  assert.deepEqual(events.map((event) => event.type), ['gulp', 'grew', 'chomp']);
  assert.equal(events.at(-1).still, false);
});

test('a shut mouth never eats, however long it sits on the food', () => {
  const { soup, count } = emptySoup();
  putFood(soup);
  run(soup, 30);
  assert.equal(count('gulp'), 0);
  assert.equal(soup.eaten, 0);
  assert.ok(soup.waitedFor > 29, 'the food has been waiting, which a prompt can go by');
});

test('each opening of the mouth is one bite: held open among food it takes one, swallows it after a while, and takes no more until it has shut', () => {
  const { soup, count } = emptySoup();
  for (let index = 0; index < 4; index += 1) putFood(soup, 0, { x: soup.creature.x + 0.02 * index, y: soup.creature.y + 0.03 });
  run(soup, AUTO_CHOMP_SECONDS - 0.5, () => ({ open: true }));
  assert.equal(count('gulp'), 1);
  assert.equal(soup.eaten, 0, 'still in the open mouth');
  run(soup, 1, () => ({ open: true }));
  assert.equal(soup.eaten, 1, 'swallowed anyway, so that nothing gets stuck');
  assert.equal(soup.stats.autoChomps, 1);
  // The mouth is still open, for ten seconds more: nothing else goes in.
  run(soup, 10, () => ({ open: true }));
  assert.equal(count('gulp'), 1);
  assert.equal(soup.eaten, 1);
  // It shuts, and opens again: the next one.
  run(soup, 0.3);
  bite(soup);
  assert.equal(soup.eaten, 2);
  bite(soup);
  bite(soup);
  assert.equal(soup.eaten, 4);
  assert.equal(soup.foods.length, 0);
});

test('a mouth that\'s already open gobbles the first thing to come in reach', () => {
  const { soup, count } = emptySoup();
  run(soup, 2, () => ({ open: true }));
  assert.equal(count('gulp'), 0, 'nothing there to eat');
  putFood(soup);
  run(soup, 0.1, () => ({ open: true }));
  assert.equal(count('gulp'), 1);
});

test('a thing has to be in reach: one across the field is left alone', () => {
  const { soup, count } = emptySoup();
  putFood(soup, 0, { x: soup.creature.x + 0.5, y: soup.creature.y });
  bite(soup);
  assert.equal(count('gulp'), 0);
  // Just inside the creature's reach, and just outside it.
  const edge = soup.creature.r * 1.45 + START_R * KIND_SIZE[0] * 0.6;
  soup.foods = [];
  putFood(soup, 0, { x: soup.creature.x + edge + 0.01, y: soup.creature.y });
  bite(soup);
  assert.equal(count('gulp'), 0);
  soup.foods = [];
  putFood(soup, 0, { x: soup.creature.x + edge - 0.01, y: soup.creature.y });
  bite(soup);
  assert.equal(count('gulp'), 1);
});

test('of two things in reach, the nearer goes in', () => {
  const { soup } = emptySoup();
  const far = putFood(soup, 0, { x: soup.creature.x + 0.07, y: soup.creature.y });
  const close = putFood(soup, 0, { x: soup.creature.x - 0.03, y: soup.creature.y });
  run(soup, 0.1, () => ({ open: true }));
  assert.equal(soup.creature.holding, close);
  assert.equal(far.state, 'drift');
});

test('a thing bigger than the creature can\'t be eaten yet: opening on it says so, and nothing is lost', () => {
  const { soup, events, count } = emptySoup();
  const big = putFood(soup, 1, { x: soup.creature.x + 0.11, y: soup.creature.y });
  assert.equal(soup.canEat(big), false);
  bite(soup);
  assert.equal(count('gulp'), 0);
  assert.equal(count('toobig'), 1);
  assert.equal(events.find((event) => event.type === 'toobig').food, big);
  assert.equal(soup.eaten, 0);
  assert.equal(big.state, 'drift', 'it drifts on');
  // Said again only after a moment, however often the mouth opens.
  bite(soup, 0.2, 0.2);
  bite(soup, 0.2, 0.2);
  assert.ok(count('toobig') <= 2);
});

test('a thing that\'s too big nudges the creature gently aside as it passes, and the creature drifts back', () => {
  const { soup, count } = emptySoup();
  const { creature } = soup;
  const start = { x: creature.x, y: creature.y };
  // A big thing, drifting straight through where the creature is.
  const big = putFood(soup, 2, { x: creature.x - 0.3, y: creature.y + 0.01 });
  big.vel = { x: 0.12, y: 0 };
  big.from = { x: big.x, y: big.y };
  let furthest = 0;
  let overlapped = 0;
  run(soup, 6, () => {
    furthest = Math.max(furthest, Math.hypot(creature.x - start.x, creature.y - start.y));
    const gap = Math.hypot(creature.x - big.x, creature.y - big.y);
    if (gap < (creature.r + big.r) * 0.6) overlapped += 1;
    return {};
  });
  assert.ok(count('bump') >= 1);
  assert.ok(furthest > 0.03, `it moved ${furthest} out of the way`);
  assert.ok(furthest <= 0.25, 'but only gently');
  assert.equal(overlapped, 0, 'and was never left sitting inside it');
  assert.equal(soup.eaten, 0);
  // With the big thing gone past, it comes back to where the face has it.
  run(soup, 4);
  near(creature.x, start.x, 0.01);
  near(creature.y, start.y, 0.01);
  // Nothing was lost by it, and it can still eat.
  putFood(soup);
  bite(soup);
  assert.equal(soup.eaten, 1);
});

test('once the creature has grown, what was too big can be eaten: the middle kind, and then the biggest', () => {
  const { soup, events } = emptySoup({ bites: 12 });
  const eatSmall = () => {
    putFood(soup, 0);
    bite(soup);
  };
  const tryKind = (kind) => {
    const food = putFood(soup, kind);
    const before = soup.eaten;
    bite(soup);
    soup.foods = soup.foods.filter((each) => each !== food);
    return soup.eaten > before;
  };
  // Eats small things until the creature can eat this many kinds, and no more than a world's worth of them.
  const growUntil = (kinds) => {
    for (let bite = 0; bite < 12 && kindsEdible(soup.creature.r) < kinds; bite += 1) eatSmall();
    assert.equal(kindsEdible(soup.creature.r), kinds, `${kinds} kinds can be eaten after ${soup.eaten} bites`);
  };
  assert.equal(tryKind(1), false);
  assert.equal(tryKind(2), false);
  growUntil(2);
  const unlocks = () => events.filter((event) => event.type === 'unlock').map((event) => event.kind);
  assert.deepEqual(unlocks(), [1], 'it says so, once');
  assert.equal(tryKind(2), false, 'the biggest is still too big');
  assert.equal(tryKind(1), true);
  growUntil(3);
  assert.deepEqual(unlocks(), [1, 2]);
  assert.equal(tryKind(2), true);
  assert.ok(soup.eaten < 12, 'with bites still to go');
});

test('a world is won once everything there is to eat is eaten, and nothing more goes in after', () => {
  for (const bites of BITES) {
    const { soup, count } = emptySoup({ bites });
    for (let index = 0; index < bites; index += 1) {
      assert.equal(soup.phase, 'play');
      putFood(soup);
      bite(soup);
    }
    assert.equal(soup.eaten, bites);
    assert.equal(soup.phase, 'won');
    assert.equal(soup.won, true);
    assert.equal(count('won'), 1);
    near(soup.creature.r, START_R * GROWTH, 1e-9, 'at its biggest');
    putFood(soup);
    bite(soup);
    assert.equal(soup.eaten, bites);
    assert.equal(count('won'), 1);
  }
});

test('resting never costs anything: a minute of doing nothing, and then it\'s as it was', () => {
  const { soup, count } = makeSoup({ bites: 16 });
  playWell(soup, 7);
  // Whatever was in the mouth is swallowed as it shuts.
  run(soup, 0.5);
  const { eaten, total } = soup;
  const radius = soup.creature.r;
  assert.ok(eaten >= 2 && eaten < 16, `ate ${eaten} to begin with`);
  // Mouth shut for half a minute, and then gone from the picture for another half.
  run(soup, 30);
  run(soup, 30, () => ({ seen: false }));
  assert.equal(soup.eaten, eaten);
  assert.equal(soup.total, total);
  assert.equal(soup.creature.r, radius);
  assert.equal(soup.phase, 'play');
  assert.ok(soup.foods.length >= 3, 'and there\'s still food about');
  playWell(soup, 60);
  assert.equal(soup.phase, 'won');
  assert.equal(count('won'), 1);
});

/* ---------- steering with the face ---------- */

test('the creature goes where the face goes, and a small movement of the head covers the whole field', () => {
  for (const head of HEAD_NAMES) {
    const { soup } = emptySoup({ head });
    const { creature } = soup;
    run(soup, 2, () => ({ steer: { x: HEAD[head].x * 0.5, y: 0 } }));
    near(creature.x, MIDDLE.x + FIELD.wide / 4, 0.01, `${head}: half the movement is half the way`);
    run(soup, 2, () => ({ steer: { x: -HEAD[head].x * 0.5, y: -HEAD[head].y * 0.4 } }));
    near(creature.x, MIDDLE.x - FIELD.wide / 4, 0.01);
    near(creature.y, MIDDLE.y - 0.2, 0.01, 'and up');
    // Further than the edge, it stops at the edge, in the field.
    run(soup, 2, () => ({ steer: { x: 1, y: 1 } }));
    assert.ok(creature.x < FIELD.wide - 0.05 && creature.x > FIELD.wide - 0.2);
    assert.ok(creature.y < 0.95 && creature.y > 0.8);
    run(soup, 2, () => ({ steer: { x: -1, y: -1 } }));
    assert.ok(creature.x > 0.05 && creature.x < 0.2);
    assert.ok(creature.y > 0.17, 'below the tally');
  }
  // The same movement of the head goes further when a grown-up chose a small one.
  const reach = (head) => {
    const { soup } = emptySoup({ head });
    run(soup, 2, () => ({ steer: { x: 0.03, y: 0 } }));
    return soup.creature.x - MIDDLE.x;
  };
  assert.ok(reach('small') > reach('medium') && reach('medium') > reach('big'));
});

test('with no face to go by, the creature stays where it is', () => {
  const { soup } = emptySoup();
  run(soup, 2, () => ({ steer: { x: 0.05, y: 0.02 } }));
  const at = { x: soup.creature.x, y: soup.creature.y };
  run(soup, 5, () => ({ seen: false, steer: { x: 0, y: 0 } }));
  near(soup.creature.x, at.x, 1e-6);
  near(soup.creature.y, at.y, 1e-6);
});

test('the creature glides after the face rather than jumping, and a tracker\'s tremble hardly moves it', () => {
  const { soup } = emptySoup();
  const { creature } = soup;
  // A sudden move of the head: it's most of the way there in a third of a second, and wasn't there at once.
  soup.update(DT, { open: false, seen: true, steer: { x: 0.05, y: 0 } });
  assert.ok(creature.x - MIDDLE.x < 0.08, 'not at once');
  run(soup, 0.35, () => ({ steer: { x: 0.05, y: 0 } }));
  const wanted = MIDDLE.x + (0.05 / HEAD.medium.x) * (FIELD.wide / 2);
  assert.ok(creature.x > MIDDLE.x + (wanted - MIDDLE.x) * 0.85);
  run(soup, 2, () => ({ steer: { x: 0.05, y: 0 } }));
  // A tremble of a thousandth of the picture, from frame to frame.
  let low = Infinity;
  let high = -Infinity;
  let frame = 0;
  run(soup, 3, () => {
    frame += 1;
    low = Math.min(low, creature.x);
    high = Math.max(high, creature.x);
    return { steer: { x: 0.05 + (frame % 2 ? 0.001 : -0.001), y: 0 } };
  });
  assert.ok(high - low < 0.004, `it trembled by ${high - low}`);
});

test('the creature looks at what it\'s about to eat', () => {
  const { soup } = emptySoup();
  putFood(soup, 0, { x: soup.creature.x - 0.07, y: soup.creature.y });
  run(soup, 0.3);
  assert.equal(soup.creature.facing, -1);
  soup.foods = [];
  putFood(soup, 0, { x: soup.creature.x + 0.07, y: soup.creature.y });
  run(soup, 0.3);
  assert.equal(soup.creature.facing, 1);
});

/* ---------- playing with the mouth alone ---------- */

test('with the mouth alone, the creature swims to the food by itself and waits beside it for the mouth to open', () => {
  const { soup, count } = makeSoup({ auto: true, bites: 8 });
  // The face is nowhere near, and never moves: it makes no difference.
  const still = { seen: true, steer: { x: -0.2, y: 0.2 } };
  // Half a minute of a mouth that stays shut: it's beside something to eat nearly all of that time, and waits.
  let beside = 0;
  let frames = 0;
  run(soup, 30, () => {
    frames += 1;
    if (soup.target) beside += 1;
    return still;
  });
  assert.ok(beside / frames > 0.7, `beside something ${Math.round((beside / frames) * 100)}% of the time`);
  assert.equal(soup.eaten, 0, 'and it waits');
  let opens = 0;
  for (let round = 0; round < 400 && soup.phase === 'play'; round += 1) {
    // The mouth opens whenever there's something there, and that's all the child does.
    if (!soup.target) {
      run(soup, 0.25, () => still);
      continue;
    }
    opens += 1;
    run(soup, 0.4, () => ({ ...still, open: true }));
    run(soup, 0.3, () => still);
  }
  assert.equal(soup.phase, 'won');
  assert.equal(soup.eaten, 8);
  assert.equal(count('gulp'), 8);
  assert.equal(opens, 8, 'every opening was a bite');
});

test('swimming by itself, it never has long to wait for something to eat, at any level', () => {
  for (const level of [1, 5, 10]) {
    const { soup } = makeSoup({ auto: true, level, bites: 16 });
    let longest = 0;
    let waiting = 0;
    run(soup, 90, () => {
      waiting = soup.target || soup.creature.holding || soup.won ? 0 : waiting + DT;
      longest = Math.max(longest, waiting);
      return { open: Boolean(soup.target) && Math.floor(soup.time * 2) % 2 === 0 };
    });
    assert.ok(longest < 6, `level ${level}: ${longest.toFixed(1)} s with nothing in reach`);
    assert.equal(soup.phase, 'won', `level ${level}`);
  }
});

test('with its mouth full, a creature that swims by itself stays put until it has swallowed', () => {
  const { soup } = makeSoup({ auto: true });
  for (let tries = 0; tries < 200 && !soup.target; tries += 1) run(soup, 0.1);
  run(soup, 0.3, () => ({ open: true }));
  assert.ok(soup.creature.holding);
  const at = { ...soup.home };
  run(soup, 1.5, () => ({ open: true }));
  near(soup.home.x, at.x, 1e-9);
  near(soup.home.y, at.y, 1e-9);
});

/* ---------- a whole world, played ---------- */

test('a child who goes after the food and opens wide for it wins every world, in about a minute', () => {
  for (const level of LEVELS) {
    const { soup, count } = makeSoup({ level, bites: 12, seed: 100 + level });
    playWell(soup, 150);
    assert.equal(soup.phase, 'won', `level ${level}`);
    assert.equal(soup.eaten, 12);
    assert.ok(soup.stats.seconds >= 150 - 1);
    assert.equal(count('unlock'), 2, 'both of the bigger kinds came into reach on the way');
  }
  // How long it takes: a child playing well, at level 1 and at level 10.
  for (const level of [1, 10]) {
    const { soup } = makeSoup({ level, bites: 12, seed: 5 });
    let seconds = 0;
    while (soup.phase === 'play' && seconds < 300) {
      playWell(soup, 1);
      seconds += 1;
    }
    // A made-up child who never hesitates: a real one takes a good deal longer over each bite.
    assert.ok(seconds >= 8 && seconds <= 110, `level ${level} took ${seconds} s`);
  }
});

test('a child whose head wobbles, and whose face the tracker loses now and then, still wins', () => {
  for (const level of [1, 10]) {
    const { soup } = makeSoup({ level, bites: 12, seed: 31 });
    playWell(soup, 200, { wobble: 0.004, lostEvery: 47 });
    assert.equal(soup.phase, 'won', `level ${level}`);
  }
});

/* ---------- with friends ---------- */

test('together, there\'s as much to eat as each would have alone, all added up', () => {
  assert.equal(teamGoal(12, 2), 24);
  assert.equal(teamGoal(8, 4), 32);
  assert.equal(teamGoal(16, 1), 16);
  assert.equal(new Soup({ bites: 12, team: 3 }).goal, 36);
  assert.equal(new Soup({ bites: 12, team: 0 }).goal, 12);
});

test('friends\' soups, from the same seed and the same clock, have the same things in the same places', () => {
  const [mine, theirs] = [new Soup({ level: 4, seed: 777, team: 2 }), new Soup({ level: 4, seed: 777, team: 2, auto: true })];
  for (let second = 0; second < 40; second += 0.5) {
    // Each game has its own frames, and goes by how long it is since "GO!".
    mine.update(0.016, { open: false, seen: true, steer: { x: 0.02, y: 0 } }, second);
    theirs.update(0.05, { open: false, seen: false, steer: { x: 0, y: 0 } }, second);
    const places = (soup) => soup.foods.map(({ id, kind, x, y }) => [id, kind, Math.round(x * 1e6), Math.round(y * 1e6)]);
    assert.deepEqual(places(mine), places(theirs));
    assert.ok(mine.foods.length >= 3);
  }
});

test('together, a bite counts for everyone once the server says whose it was, and everyone\'s creature grows as one', () => {
  const made = emptySoup({ bites: 8, team: 2 });
  const { soup, count } = made;
  assert.equal(soup.goal, 16);
  const food = putFood(soup);
  bite(soup);
  assert.equal(count('chomp'), 1, 'the mouth shuts on it');
  assert.equal(soup.total, 0, 'but it isn\'t a bite until the server has said so');
  soup.claimed(food.id, true);
  assert.equal(soup.eaten, 1);
  assert.equal(soup.total, 1);
  // A friend's bite, of something that isn't even on this screen any more.
  soup.claimed(4321, false);
  assert.equal(soup.eaten, 1, 'not this child\'s');
  assert.equal(soup.total, 2, 'but one more for the creature they share');
  near(soup.creature.r, radiusAt(2 / 16), 1e-9);
  // Said twice, it counts once.
  soup.claimed(4321, false);
  soup.claimed(food.id, true);
  assert.equal(soup.total, 2);
  assert.equal(soup.eaten, 1);
});

test('two against each other on one screen in one picture share one soup: what one eats is gone for both, and each grows by their own bites', () => {
  const made = emptySoup({ bites: 8, shared: true, centre: -FIELD.wide / 8 });
  const { soup, count } = made;
  assert.equal(soup.goal, 8, 'their own share');
  near(soup.creature.x, FIELD.wide / 2 - FIELD.wide / 8, 1e-9, 'a little to the first player\'s side');
  const food = putFood(soup);
  bite(soup);
  assert.equal(count('chomp'), 1);
  assert.equal(soup.total, 0, 'not a bite until the server has said whose it was');
  soup.claimed(food.id, true);
  assert.deepEqual([soup.eaten, soup.total], [1, 1]);
  near(soup.creature.r, radiusAt(1 / 8), 1e-9);
  // The other player's bite is gone from this soup, and this creature is no bigger for it.
  soup.claimed(4321, false);
  assert.deepEqual([soup.eaten, soup.total], [1, 1]);
  assert.ok(soup.gone.has(4321));
  near(soup.creature.r, radiusAt(1 / 8), 1e-9);
  // Their own share eaten, they've grown up.
  for (let id = 1; id < 8; id += 1) soup.claimed(9000 + id, true);
  assert.equal(soup.won, true);
  // Together it's as it was, and on their own nothing is claimed.
  assert.equal(emptySoup({ bites: 8, team: 2, shared: true }).soup.shared, false);
  assert.equal(emptySoup({ bites: 8 }).soup.shared, false);
});

test('together, a thing a friend got to first goes to them, even out of this child\'s mouth, and is nobody\'s twice', () => {
  const { soup, events, count } = emptySoup({ bites: 8, team: 2 });
  const food = putFood(soup);
  const other = putFood(soup, 0, { x: soup.creature.x + 0.4, y: soup.creature.y });
  run(soup, 0.2, () => ({ open: true }));
  assert.equal(soup.creature.holding, food);
  // The server says the friend's mouth was there first.
  soup.claimed(food.id, false, { x: 0.3, y: 0.4 });
  assert.equal(soup.creature.holding, null);
  assert.equal(food.state, 'taken');
  assert.deepEqual(food.takenTo, { x: 0.3, y: 0.4 });
  assert.equal(soup.eaten, 0);
  assert.equal(soup.total, 1);
  assert.equal(count('taken'), 1);
  run(soup, 1, () => ({ open: true }));
  assert.ok(!soup.foods.includes(food), 'and it\'s gone from here');
  assert.equal(count('chomp'), 0);
  // One across the field that a friend eats goes too.
  soup.claimed(other.id, false);
  run(soup, 1);
  assert.equal(soup.foods.length, 0);
  assert.equal(events.filter((event) => event.type === 'taken').length, 2);
  assert.equal(soup.total, 2);
});

test('together, the world is won for everyone once all of them together have eaten it all', () => {
  const { soup, count } = emptySoup({ bites: 8, team: 2 });
  for (let k = 0; k < 15; k += 1) soup.claimed(100 + k, k % 3 === 0);
  assert.equal(soup.phase, 'play');
  assert.equal(soup.total, 15);
  soup.claimed(200, false);
  assert.equal(soup.phase, 'won');
  assert.equal(count('won'), 1);
  assert.equal(soup.eaten, 5, 'this child\'s share of it');
  soup.claimed(201, true);
  assert.equal(count('won'), 1);
});

test('against each other, each has their own soup with the same things in it, and what one eats is still there for the other', () => {
  // With friends it's the gentle soup, whatever each grown-up chose, so both soups are the same.
  const [mine, theirs] = [new Soup({ level: 2, seed: 4242, bites: 8, gentle: true }), new Soup({ level: 2, seed: 4242, bites: 8, gentle: true })];
  const ids = (soup) => soup.foods.map((food) => food.id).sort((a, b) => a - b);
  assert.deepEqual(ids(mine), ids(theirs));
  playWell(mine, 20);
  run(theirs, 20);
  assert.ok(mine.eaten >= 3);
  assert.equal(theirs.eaten, 0);
  // Nothing a server says about claims changes a soup that isn't shared.
  theirs.claimed(3, false);
  assert.equal(theirs.total, 0);
  const eatenByMe = [...mine.gone];
  assert.ok(eatenByMe.length >= 3);
  assert.ok(theirs.gone.size === 0);
  // The other one catches up, on the same things.
  playWell(theirs, 150);
  assert.equal(theirs.phase, 'won');
});

/* ---------- how much the child grew ---------- */

test('how many times bigger is said in round numbers, in English and Georgian', () => {
  assert.equal(timesWords(3.8), '4 times bigger!');
  assert.equal(timesWords(13.6), '14 times bigger!');
  assert.equal(timesWords(227), '230 times bigger!');
  assert.equal(timesWords(4200), '4.2 thousand times bigger!');
  assert.equal(timesWords(3.1e6), '3.1 million times bigger!');
  assert.equal(timesWords(2.6e11), '260 billion times bigger!');
  assert.equal(timesWords(227, 'ka'), '230-ჯერ უფრო დიდი!');
  assert.equal(timesWords(2.6e11, 'ka'), '260 მილიარდჯერ უფრო დიდი!');
});

test('the picture of how much the child grew has what they were, an everyday thing, and what they are now, each bigger than the last', () => {
  for (const level of LEVELS.slice(0, -1)) {
    const ladder = ladderFor(level);
    assert.equal(ladder.old, worldAt(level));
    assert.equal(ladder.next, worldAt(level + 1));
    assert.equal(ladder.thing, worldAt(level).thing);
    near(ladder.ratio, worldAt(level + 1).size / (worldAt(level).size * GROWTH), 1e-9 * ladder.ratio);
    assert.equal(ladder.ratio, grewBy(level));
    assert.ok(ladder.ratio > 3, `level ${level}: ${ladder.ratio} times bigger`);
    const { old, thing, next } = ladder.sizes;
    assert.ok(old < thing && thing < next, `level ${level}: ${old} < ${thing} < ${next}`);
    assert.equal(next, 1);
    // What they were can still be seen beside what they are, even when it's really hundreds of times smaller.
    assert.ok(old >= 1 / 40, `level ${level}: drawn ${old}`);
    assert.ok(thing / old >= 1.3 && next / thing >= 1.2, `level ${level}: a clear step each time`);
  }
  // Up to a few times bigger, it's drawn as it really is.
  near(ladderFor(5).sizes.old, 1 / grewBy(5), 1e-9);
  // After the last world there's nothing more to be.
  const last = ladderFor(10);
  assert.equal(last.next, null);
  assert.equal(last.thing, null);
  assert.equal(grewBy(10), null);
});
