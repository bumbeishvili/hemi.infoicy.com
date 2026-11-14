// Gobble and Grow's bigger things, which can catch the creature unless a grown-up chooses the gentle soup: the rules
// with no screen in them. The screen is tested in test/e2e/gobble-grow/caught.spec.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIELD, LIVES, SAFE_SECONDS, Soup, START_R, KIND_SIZE, soupLevel } from '../../games/gobble-grow/rules.js';
import { DT, MIDDLE, goodPlayer, run, steerTo } from './gobble-player.js';

const LEVELS = Array.from({ length: 10 }, (_, index) => index + 1);

function makeSoup(options = {}) {
  const events = [];
  const soup = new Soup({ seed: 7, ...options, onEvent: (event) => events.push(event) });
  const count = (type) => events.filter((event) => event.type === type).length;
  return { soup, events, count };
}

/** Nothing else in the soup, and nothing more coming. */
function emptySoup(options = {}) {
  const made = makeSoup(options);
  made.soup.foods = [];
  made.soup.spawnDue = () => {};
  return made;
}

/** A thing of a kind, staying where it's put: by default right on the creature. */
function putFood(soup, kind = 2, at = null) {
  const { creature } = soup;
  const place = at ?? { x: creature.x, y: creature.y };
  const food = {
    id: 9000 + soup.foods.length,
    kind,
    r: START_R * KIND_SIZE[kind],
    born: soup.time,
    life: 1000,
    from: { ...place },
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

const still = () => ({ seen: true, steer: { x: 0, y: 0 } });

test('gobble and grow: a bigger thing right on the creature catches it, once, after the first moments, and three catches gobble it up', () => {
  const { soup, count, events } = emptySoup();
  assert.equal(soup.danger, true);
  assert.equal(soup.lives, LIVES);
  const first = putFood(soup);
  // Nothing catches it in the first moments.
  run(soup, SAFE_SECONDS - 0.3, still);
  assert.equal(count('caught'), 0);
  run(soup, 0.5, still);
  assert.equal(count('caught'), 1);
  assert.equal(soup.lives, 2);
  // It's bounced away, and that thing can't catch it again however long it stays.
  run(soup, 6, still);
  assert.equal(count('caught'), 1);
  assert.ok(first.caughtYou);
  // Two more, a while apart: the second catches it, and the third gobbles it up.
  putFood(soup);
  run(soup, 0.2, still);
  assert.equal(count('caught'), 2);
  run(soup, SAFE_SECONDS + 0.2, still);
  const last = putFood(soup);
  run(soup, 0.2, still);
  assert.equal(count('eaten'), 1);
  assert.equal(soup.phase, 'eaten');
  assert.equal(soup.gobbled, true);
  assert.equal(soup.eatenBy, last);
  assert.equal(events.find(({ type }) => type === 'eaten').food, last);
  // Nothing more is eaten after.
  putFood(soup, 0);
  run(soup, 2, () => ({ ...still(), open: true }));
  assert.equal(count('gulp'), 0);
});

test('gobble and grow: a face that has gone, or that the tracker lost, is never caught, nor just after it comes back', () => {
  const { soup, count } = emptySoup();
  run(soup, SAFE_SECONDS + 1, still);
  putFood(soup);
  run(soup, 20, () => ({ seen: false }));
  assert.equal(count('caught'), 0);
  run(soup, 1.2, still);
  assert.equal(count('caught'), 0);
  run(soup, 0.6, still);
  assert.equal(count('caught'), 1);
});

test('gobble and grow: a thing the creature can eat never catches it, and a bigger thing only catches when it overlaps', () => {
  const { soup, count } = emptySoup();
  run(soup, SAFE_SECONDS + 1, still);
  putFood(soup, 0);
  run(soup, 3, still);
  assert.equal(count('caught'), 0);
  soup.foods = [];
  // Beside the creature, touching, but not over it.
  const { creature } = soup;
  putFood(soup, 2, { x: creature.x + (creature.r + START_R * KIND_SIZE[2]) * 0.95, y: creature.y });
  run(soup, 3, still);
  assert.equal(count('caught'), 0);
});

test('gobble and grow: gently, swimming by itself, and with friends, bigger things only nudge, and nothing is lost', () => {
  for (const options of [{ gentle: true }, { auto: true }, { team: 2 }]) {
    const { soup, count } = emptySoup(options);
    assert.equal(soup.danger, false, JSON.stringify(options));
    assert.equal(soup.plan.hunt, 0);
    run(soup, SAFE_SECONDS + 1, still);
    putFood(soup);
    run(soup, 10, still);
    assert.equal(count('caught'), 0);
    assert.equal(soup.phase, 'play');
    assert.ok(count('bump') >= 1, 'it nudged the creature aside');
  }
});

test('gobble and grow: from level 2, a bigger thing nearby comes after the creature, more at each level', () => {
  assert.equal(soupLevel(1).hunt, 0);
  assert.ok(Math.abs(soupLevel(10).hunt - 0.07) < 1e-9);
  for (const level of LEVELS.slice(1)) assert.ok(soupLevel(level).hunt > soupLevel(level - 1).hunt);
  for (const level of [1, 10]) {
    const { soup } = emptySoup({ level });
    run(soup, SAFE_SECONDS + 0.5, still);
    const { creature } = soup;
    const food = putFood(soup, 2, { x: creature.x + 0.4, y: creature.y });
    run(soup, 2, still);
    const moved = food.x - (creature.x + 0.4);
    if (level === 1) assert.equal(moved, 0);
    else assert.ok(moved < -0.1, `it came ${moved} nearer`);
  }
  // Not from further off.
  const { soup } = emptySoup({ level: 10 });
  run(soup, SAFE_SECONDS + 0.5, still);
  const far = putFood(soup, 2, { x: soup.creature.x + 0.7, y: soup.creature.y });
  run(soup, 2, still);
  assert.equal(far.chase, undefined);
});

test('gobble and grow: the gentle soup climbs as it always did, and the default climbs further', () => {
  assert.deepEqual([soupLevel(10, { gentle: true }).cross, soupLevel(10, { gentle: true }).gap], [11.5, 1.4]);
  assert.deepEqual([soupLevel(10).cross, soupLevel(10).gap], [10, 1.2]);
  for (const level of LEVELS) {
    const plan = soupLevel(level);
    // Eight or nine in the soup at once, and two thirds of level 1's time to get to one, at worst.
    assert.ok(Math.abs(plan.cross / plan.gap - 8.5) <= 0.5);
    assert.ok(plan.cross >= soupLevel(1).cross * 0.66);
  }
});

/**
 * A child who keeps out of the way of bigger things: they go for the nearest thing they can eat, unless a bigger
 * one is near, when they steer away from it first.
 */
function carefulPlayer(soup) {
  const eat = goodPlayer(soup);
  const aim = { ...MIDDLE };
  return () => {
    const wanted = eat();
    const { creature } = soup;
    let threat = null;
    for (const food of soup.foods) {
      if (food.state !== 'drift' || soup.canEat(food)) continue;
      const gap = Math.hypot(food.x - creature.x, food.y - creature.y) - creature.r - food.r;
      if (gap < 0.12 && (!threat || gap < threat.gap)) threat = { food, gap };
    }
    if (!threat) {
      aim.x = creature.x;
      aim.y = creature.y;
      return wanted;
    }
    // Away from it, but not into the edge.
    const away = { x: creature.x - threat.food.x, y: creature.y - threat.food.y };
    const far = Math.hypot(away.x, away.y) || 1;
    let to = { x: creature.x + (away.x / far) * 0.3, y: creature.y + (away.y / far) * 0.3 };
    if (to.x < 0.2 || to.x > FIELD.wide - 0.2 || to.y < 0.25 || to.y > 0.85) to = { x: creature.x - (away.y / far) * 0.3, y: creature.y + (away.x / far) * 0.3 };
    aim.x += (to.x - aim.x) * 0.2;
    aim.y += (to.y - aim.y) * 0.2;
    return { ...wanted, open: false, steer: steerTo(soup, aim) };
  };
}

test('gobble and grow: a child who keeps away from bigger things wins every world, one who doesn\'t look is sometimes gobbled up, and one who sits still always is', () => {
  let careless = 0;
  for (const level of LEVELS) {
    for (const seed of [3, 11]) {
      const { soup } = makeSoup({ level, seed, bites: 12 });
      run(soup, 240, carefulPlayer(soup));
      assert.equal(soup.phase, 'won', `level ${level}, seed ${seed}: ${soup.phase}, ${soup.eaten} eaten, caught ${soup.stats.caught}`);
    }
    // One who only goes for the food, never minding what's bigger.
    if (level >= 5) {
      for (const seed of [3, 11, 21, 40]) {
        const { soup } = makeSoup({ level, seed, bites: 12 });
        run(soup, 240, goodPlayer(soup));
        if (soup.phase === 'eaten') careless += 1;
      }
    }
    // One who sits still, face in the picture, is caught three times within two minutes, even at level 1.
    const { soup } = makeSoup({ level, seed: 5, bites: 12 });
    run(soup, 120, still);
    assert.equal(soup.phase, 'eaten', `level ${level}: caught ${soup.stats.caught}`);
  }
  assert.ok(careless >= 2, `only ${careless} of 24 careless children were caught three times`);
  void DT;
});
