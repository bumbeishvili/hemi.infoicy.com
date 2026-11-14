// What each level of Tank Patrol brings that's new, seen working in the real game, with real photos going
// through the real tracker: new kinds of fire from crates, new kinds of robot tank, prizes to pick up and a
// friend in a cage. The rules are tested in test/unit/tank-patrol.test.js.
import { expect, shot, show, test, waitForScreen } from '../helpers.js';
import { biggestStep, brightnessThrough, handIs, openPatrol, patrolIs, pointAt, startPatrol, stopPointing } from './helpers.js';

const GAME = 'tank-patrol';
const atLevel = (level, settings = {}) => ({ levels: { [GAME]: level }, ...settings });

const NEW_AT = {
  2: ['Bolts'],
  3: ['Triple shot', 'Dashing scouts'],
  4: ['Shield tanks', 'Tanks in pairs'],
  5: ['Bubble shot', 'Gems'],
  6: ['Caged friend', 'Runaway tanks'],
  7: ['Digger tanks', 'Extra hearts'],
  8: ['Boing ball', 'Magnet', 'Sunset'],
  9: ['Splitting tanks', 'Slow motion'],
  10: ['Big boss tank', 'Treasure chest'],
};

/**
 * Clears the valley and puts robot tanks of the kinds wanted where they're asked for, as dx and dz from the
 * child's tank, waiting there. Nothing is lobbed unless a test asks, and the game only ends when they've
 * all been stopped if finish says so.
 */
const stage = (page, tanks, { finish = false } = {}) => page.evaluate(([wanted, ending]) => {
  const { patrol } = window.__game;
  for (const other of patrol.enemies) {
    other.state = 'gone';
    patrol.emit('gone', { enemy: other });
  }
  patrol.enemies = [];
  patrol.queue = [];
  patrol.lobIn = 9999;
  const placed = wanted.map(({ kind, dx, dz }) => {
    const spot = patrol.nav.nearestFree(patrol.tank.x + dx, patrol.tank.z + dz);
    const enemy = patrol.makeEnemy(kind, spot);
    Object.assign(enemy, { goal: { x: spot.x, z: spot.z }, holdFor: 9999, ranOff: true });
    enemy.flow = patrol.nav.flowTo(spot.x, spot.z, null);
    patrol.enemies.push(enemy);
    patrol.emit('spawn', { enemy });
    return enemy;
  });
  patrol.total = patrol.stats.stopped + placed.length + (ending ? 0 : 1);
  window.__staged = placed;
  // A hand held still for a while is a rest, which would stop everything being looked at here.
  clearInterval(window.__awake);
  window.__awake = setInterval(() => {
    patrol.stillFor = 0;
  }, 200);
  return placed.map(({ x, z, kind }) => ({ x, z, kind }));
}, [tanks, finish]);

/** Counts what the rules say is happening, from now on. */
const countEvents = (page) => page.evaluate(() => {
  const { patrol } = window.__game;
  window.__seen = {};
  const real = patrol.onEvent;
  patrol.onEvent = (event) => {
    window.__seen[event.type] = (window.__seen[event.type] ?? 0) + 1;
    real(event);
  };
});
const seen = (page, type) => page.evaluate((name) => window.__seen?.[name] ?? 0, type);
// Every name put up over something new so far this round.
const labels = (page) => page.evaluate(() => window.__game.field.named);
const haulChip = (page) => page.locator('#chip-haul');

// Other games' tests may be running on this computer at the same time, so there's plenty of time.
test.describe.configure({ timeout: 240_000 });

test('the title card says what\'s new at each level, and level 1 has nothing new', async ({ page }) => {
  await openPatrol(page);
  await expect(page.locator('#level-new')).toBeHidden();
  for (const [level, names] of Object.entries(NEW_AT)) {
    await page.locator('#open-panel').click();
    await page.locator('#level-choice label', { hasText: new RegExp(`^\\s*${level}$`) }).click();
    await page.locator('#close-panel').click();
    for (const name of names) await expect(page.locator('#level-new')).toContainText(name);
    await expect(page.locator('#level-new .level-new-chip')).toHaveCount(names.length);
  }
  await shot(page, 'tank-patrol-new-title-level10');
});

test('what\'s new is under the countdown, and the finish card says what the next level brings', async ({ page }) => {
  await openPatrol(page, atLevel(4));
  await show(page, null, 'open', { scale: 0.7 });
  await page.locator('#start').click();
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-new-now')).toContainText('Shield tanks');
  await expect(page.locator('#level-new-now')).toContainText('Tanks in pairs');
  await shot(page, 'tank-patrol-new-countdown-level4');
  await waitForScreen(page, 'playing');
  const [enemy] = await stage(page, [{ kind: 'scout', dx: 0, dz: -15 }], { finish: true });
  await pointAt(page, enemy, 'open');
  await waitForScreen(page, 'finish');
  await stopPointing(page);
  await expect(page.locator('#level-done-text')).toHaveText('Level 4 done! Next: level 5');
  await expect(page.locator('#level-next-new')).toHaveText('Coming up:🫧Bubble shot💎Gems');
  await expect(page.locator('#sum-right-prizes')).toContainText('🔩 3');
  await expect(page.locator('#sum-right-friends')).toBeHidden();
  await page.waitForTimeout(500);
  await shot(page, 'tank-patrol-new-finish-coming-up');
});

test('level 2: a stopped tank drops bolts, which roll over to the tank and are counted at the top', async ({ page }) => {
  await startPatrol(page, atLevel(2));
  await expect(haulChip(page)).toBeVisible();
  await expect(haulChip(page)).toContainText('0');
  const [enemy] = await stage(page, [{ kind: 'scout', dx: 0, dz: -15 }]);
  await countEvents(page);
  await pointAt(page, enemy, 'open');
  await expect.poll(() => seen(page, 'prizes'), { timeout: 60_000 }).toBe(1);
  await stopPointing(page);
  await show(page, null, 'fist', { scale: 0.7 });
  await page.waitForTimeout(500);
  expect(await labels(page)).toContain('Bolts');
  await shot(page, 'tank-patrol-new-bolts');
  await expect.poll(async () => (await patrolIs(page)).stats.bolts, { timeout: 20_000 }).toBe(3);
  await expect(haulChip(page).locator('[data-haul="bolts"] .haul-count')).toHaveText('3');
});

test('level 3: the first tank stopped leaves a crate, pointing at it brings it over, and the gun fires three at once', async ({ page }) => {
  await startPatrol(page, atLevel(3));
  const [enemy] = await stage(page, [{ kind: 'scout', dx: 0, dz: -15 }, { kind: 'basher', dx: 12, dz: -16 }, { kind: 'scout', dx: -12, dz: -16 }]);
  await countEvents(page);
  await pointAt(page, enemy, 'open');
  await expect.poll(() => seen(page, 'crate'), { timeout: 60_000 }).toBe(1);
  // The hand's still pointing where the tank was, so the crate comes straight over, and its name with it.
  await expect.poll(() => seen(page, 'crate-got'), { timeout: 30_000 }).toBe(1);
  expect(await labels(page)).toContain('Triple shot');
  // Another, somewhere else, waits to be pointed at.
  await pointAt(page, { x: 3, z: 24 }, 'open');
  const crate = await page.evaluate(() => {
    const { patrol } = window.__game;
    const one = patrol.dropCrate({ x: patrol.tank.x - 16, z: patrol.tank.z - 14 });
    return { x: one.x, z: one.z };
  });
  await page.waitForTimeout(700);
  await shot(page, 'tank-patrol-new-crate');
  await pointAt(page, crate, 'open');
  await expect.poll(() => seen(page, 'crate-got'), { timeout: 30_000 }).toBe(2);
  expect(await page.evaluate(() => window.__game.patrol.fireKind)).toBe('spread');
  await expect(page.locator('#chip-power')).toBeVisible();
  await expect(page.locator('#chip-power')).toContainText('Triple shot');
  // Three balls at once at a tank with another beside it, and the side ones go for that one too.
  const [middle] = await stage(page, [{ kind: 'basher', dx: 0, dz: -15 }, { kind: 'scout', dx: 9, dz: -17 }]);
  await page.evaluate(() => {
    for (const enemy of window.__staged) enemy.hp = enemy.maxHp = 40;
    window.__game.patrol.powerUp('spread');
  });
  await pointAt(page, middle, 'open');
  await expect.poll(() => page.evaluate(() => window.__game.patrol.shots.length), { timeout: 30_000 }).toBeGreaterThanOrEqual(3);
  await shot(page, 'tank-patrol-new-triple-shot');
  await expect.poll(() => page.evaluate(() => window.__staged[1].hp), { timeout: 30_000 }).toBeLessThan(40);
  await stopPointing(page);
});

test('level 4: a shield tank\'s shots bounce off its shield until it\'s hit from the side, or the shield gets tired', async ({ page }) => {
  await startPatrol(page, atLevel(4));
  const [enemy] = await stage(page, [{ kind: 'shield', dx: 0, dz: -15 }]);
  await page.waitForTimeout(500);
  expect(await labels(page)).toContain('Shield tank');
  await shot(page, 'tank-patrol-new-shield-tank');
  await countEvents(page);
  await pointAt(page, enemy, 'open');
  await expect.poll(() => seen(page, 'bonk'), { timeout: 45_000 }).toBeGreaterThan(0);
  await expect.poll(() => seen(page, 'shield-down'), { timeout: 60_000 }).toBe(1);
  await page.waitForTimeout(600);
  await shot(page, 'tank-patrol-new-shield-down');
  await expect.poll(async () => (await patrolIs(page)).stopped, { timeout: 60_000 }).toBe(1);
  await stopPointing(page);
});

test('level 5: a bubble shot traps a tank in a floating bubble, and a heavy drops a gem', async ({ page }) => {
  await startPatrol(page, atLevel(5));
  const [enemy] = await stage(page, [{ kind: 'heavy', dx: 0, dz: -15 }]);
  await page.evaluate(() => window.__game.patrol.powerUp('bubble'));
  await countEvents(page);
  await pointAt(page, enemy, 'open');
  await expect.poll(() => seen(page, 'bubbled'), { timeout: 45_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(900);
  await shot(page, 'tank-patrol-new-bubble');
  await expect.poll(async () => (await patrolIs(page)).stopped, { timeout: 60_000 }).toBe(1);
  await stopPointing(page);
  await show(page, null, 'fist', { scale: 0.7 });
  await expect.poll(async () => (await patrolIs(page)).stats.gems, { timeout: 20_000 }).toBe(1);
  await expect(haulChip(page).locator('[data-haul="gems"]')).toBeVisible();
  await expect(haulChip(page).locator('[data-haul="gems"] .haul-count')).toHaveText('1');
});

test('level 6: firing at the cage lets the friend out, who hops over, and it\'s counted', async ({ page }) => {
  await startPatrol(page, atLevel(6));
  // Its name is over it as the game starts.
  expect(await labels(page)).toContain('Caged friend');
  await stage(page, [{ kind: 'scout', dx: 30, dz: -40 }]);
  const cage = await page.evaluate(() => {
    const { patrol } = window.__game;
    const [one] = patrol.cages;
    // Next to the child's tank, to get on with it.
    const spot = patrol.nav.nearestFree(patrol.tank.x - 12, patrol.tank.z - 10);
    Object.assign(one, { x: spot.x, z: spot.z });
    window.__game.field.cageViews.get(one).root.position.set(spot.x, one.y, spot.z);
    return { x: one.x, z: one.z, friend: one.friend };
  });
  await page.waitForTimeout(300);
  await shot(page, 'tank-patrol-new-cage');
  await countEvents(page);
  await pointAt(page, cage, 'open');
  await expect.poll(() => seen(page, 'freed'), { timeout: 60_000 }).toBe(1);
  await stopPointing(page);
  await page.waitForTimeout(1600);
  await shot(page, 'tank-patrol-new-friend-freed');
  expect((await patrolIs(page)).stats.friends).toBe(1);
  await expect(haulChip(page).locator('[data-haul="friends"] .haul-count')).toHaveText('1');
});

test('level 7: a digger goes underground and pops up nearer, and a heart crate gives a heart back', async ({ page }) => {
  await startPatrol(page, atLevel(7, { tankShells: 'medium' }));
  await stage(page, [{ kind: 'digger', dx: 22, dz: -14 }]);
  await countEvents(page);
  await show(page, null, 'fist', { scale: 0.7 });
  await page.evaluate(() => {
    const [digger] = window.__staged;
    digger.holdFor = 0.5;
  });
  await expect.poll(() => seen(page, 'dig'), { timeout: 30_000 }).toBe(1);
  await page.waitForTimeout(1600);
  expect(await page.evaluate(() => window.__game.patrol.hidden(window.__staged[0]))).toBe(true);
  await shot(page, 'tank-patrol-new-digger-under');
  await expect.poll(() => seen(page, 'pop-up'), { timeout: 20_000 }).toBe(1);
  await page.waitForTimeout(700);
  await shot(page, 'tank-patrol-new-digger-up');

  await page.evaluate(() => {
    const { patrol } = window.__game;
    patrol.hurt();
    patrol.cratesDropped = patrol.powerOrder.indexOf('heart');
    patrol.dropCrate({ x: patrol.tank.x + 6, z: patrol.tank.z - 12 });
  });
  const hearts = (await patrolIs(page)).hearts;
  await page.waitForTimeout(500);
  await shot(page, 'tank-patrol-new-heart-crate');
  await expect.poll(async () => (await patrolIs(page)).hearts, { timeout: 30_000 }).toBe(hearts + 1);
});

test('level 8: in the sunset, a boing ball bounces from tank to tank, and the magnet brings everything over', async ({ page }) => {
  await startPatrol(page, atLevel(8));
  expect(await page.evaluate(() => window.__game.field.sunset)).toBe(true);
  const [first] = await stage(page, [{ kind: 'scout', dx: 0, dz: -15 }, { kind: 'scout', dx: 11, dz: -20 }, { kind: 'scout', dx: -11, dz: -20 }]);
  await page.evaluate(() => window.__game.patrol.powerUp('boing'));
  await countEvents(page);
  await pointAt(page, first, 'open');
  await expect.poll(() => seen(page, 'bounce'), { timeout: 45_000 }).toBeGreaterThan(0);
  await shot(page, 'tank-patrol-new-boing');
  await expect.poll(() => seen(page, 'stopped'), { timeout: 60_000 }).toBeGreaterThan(0);
  await stopPointing(page);
  await show(page, null, 'fist', { scale: 0.7 });
  await page.evaluate(() => {
    const { patrol } = window.__game;
    patrol.dropPrizes({ x: patrol.tank.x + 40, z: patrol.tank.z - 40 }, 'heavy');
    patrol.dropCrate({ x: patrol.tank.x - 40, z: patrol.tank.z - 40 });
    patrol.powerUp('magnet');
  });
  await page.waitForTimeout(400);
  await shot(page, 'tank-patrol-new-magnet');
  await expect.poll(() => page.evaluate(() => window.__game.patrol.prizes.length + window.__game.patrol.crates.length), { timeout: 20_000 }).toBe(0);
});

test('level 9: a splitting tank comes apart into two little ones, and slow motion slows everything', async ({ page }) => {
  await startPatrol(page, atLevel(9));
  const [enemy] = await stage(page, [{ kind: 'splitter', dx: 0, dz: -15 }]);
  await page.waitForTimeout(400);
  expect(await labels(page)).toContain('Splitting tank');
  await countEvents(page);
  await pointAt(page, enemy, 'open');
  await expect.poll(() => seen(page, 'split'), { timeout: 60_000 }).toBe(1);
  await stopPointing(page);
  await show(page, null, 'fist', { scale: 0.7 });
  await page.waitForTimeout(500);
  await shot(page, 'tank-patrol-new-split');
  expect(await page.evaluate(() => window.__game.patrol.enemies.filter(({ kind }) => kind === 'mini').length)).toBe(2);
  // Each half in turn.
  for (let i = 0; i < 2; i += 1) {
    const half = await page.evaluate(() => {
      const one = window.__game.patrol.rolling.find(({ kind }) => kind === 'mini');
      window.__half = one ?? null;
      return one ? { x: one.x, z: one.z } : null;
    });
    if (!half) break;
    await pointAt(page, half, 'open');
    await expect.poll(() => page.evaluate(() => window.__half.state !== 'rolling'), { timeout: 60_000 }).toBe(true);
  }
  await expect.poll(async () => (await patrolIs(page)).stopped, { timeout: 20_000 }).toBe(1);
  await stopPointing(page);
  const speeds = await page.evaluate(() => {
    const { patrol } = window.__game;
    patrol.powerUp('slow');
    return [patrol.pace.enemy * patrol.plan.enemy, patrol.enemySpeed];
  });
  expect(speeds[1]).toBeLessThan(speeds[0] * 0.6);
  await expect(page.locator('#chip-power')).toContainText('Slow motion');
});

test('level 10: the big boss loses its cannons and crown, and leaves a treasure chest whose gold stars are counted on the finish card', async ({ page }) => {
  test.setTimeout(240_000);
  await startPatrol(page, atLevel(10));
  const [boss] = await stage(page, [{ kind: 'boss', dx: 0, dz: -16 }], { finish: true });
  await page.waitForTimeout(500);
  expect(await labels(page)).toContain('Big boss tank');
  await shot(page, 'tank-patrol-new-boss');
  await countEvents(page);
  await pointAt(page, boss, 'open');
  await expect.poll(() => seen(page, 'part-off'), { timeout: 60_000 }).toBe(1);
  await page.waitForTimeout(500);
  await shot(page, 'tank-patrol-new-boss-part-off');
  await expect.poll(async () => (await patrolIs(page)).stopped, { timeout: 60_000 }).toBe(1);
  await stopPointing(page);
  await show(page, null, 'fist', { scale: 0.7 });
  await expect.poll(() => seen(page, 'chest-open'), { timeout: 20_000 }).toBe(1);
  await shot(page, 'tank-patrol-new-treasure');
  await waitForScreen(page, 'finish');
  const stars = await page.evaluate(() => window.__game.patrol.stats.stars);
  expect(stars).toBe(6);
  await expect(page.locator('#sum-right-prizes')).toContainText('🌟 6');
  await expect(page.locator('#sum-right-prizes')).toContainText('🔩');
  await page.waitForTimeout(500);
  await shot(page, 'tank-patrol-new-finish-prizes');
});

/**
 * Everything new at once: every new kind of tank, every new kind of fire flying, prizes rolling over,
 * crates, a cage, labels and a digger going under, while the brightness is measured.
 */
async function everythingAtOnce(page) {
  await stage(page, [
    { kind: 'shield', dx: -10, dz: -14 },
    { kind: 'boss', dx: 6, dz: -16 },
    { kind: 'splitter', dx: 18, dz: -8 },
    { kind: 'digger', dx: -20, dz: -6 },
    { kind: 'heavy', dx: 0, dz: -26 },
  ]);
  await page.evaluate(() => {
    const { patrol } = window.__game;
    const [shield, boss, splitter, digger] = window.__staged;
    for (const enemy of window.__staged) enemy.hp = enemy.maxHp = 400;
    patrol.startDig(digger);
    patrol.dropPrizes({ x: patrol.tank.x + 8, z: patrol.tank.z - 8 }, 'boss');
    for (let i = 0; i < 3; i += 1) patrol.dropCrate({ x: patrol.tank.x - 14 + i * 9, z: patrol.tank.z - 22 });
    window.__kinds = setInterval(() => {
      // Each kind of fire in turn, all the time this is going on.
      const kinds = ['spread', 'bubble', 'boing'];
      patrol.powerUp(kinds[Math.floor(performance.now() / 1200) % 3]);
      patrol.lobIn = 0.5;
    }, 300);
    window.__boss = boss;
    window.__shield = shield;
    window.__splitter = splitter;
  });
  await pointAt(page, await page.evaluate(() => ({ x: window.__boss.x, z: window.__boss.z })), 'open');
  await expect.poll(() => page.evaluate(() => window.__game.patrol.shots.length), { timeout: 45_000 }).toBeGreaterThan(0);
}

for (const level of [6, 10]) {
  test(`nothing flashes at level ${level}, with every new kind of tank and fire, prizes and crates about`, async ({ page }) => {
    test.setTimeout(240_000);
    await startPatrol(page, atLevel(level));
    await everythingAtOnce(page);
    await page.waitForTimeout(800);
    await shot(page, `tank-patrol-new-everything-level${level}`);
    const reading = await brightnessThrough(page, 240);
    console.log(`level ${level}: biggest brightness step with everything new about`, biggestStep(reading).toFixed(2), 'range', (Math.max(...reading) - Math.min(...reading)).toFixed(2));
    expect(biggestStep(reading)).toBeLessThan(6);
    expect(Math.max(...reading) - Math.min(...reading)).toBeLessThan(12);
    const happened = await page.evaluate(() => ({ shots: window.__game.patrol.stats.shots, kinds: window.__game.patrol.shots.map(({ kind }) => kind) }));
    expect(happened.shots).toBeGreaterThan(3);
    await page.evaluate(() => clearInterval(window.__kinds));
    await stopPointing(page);
  });
}

test('with reduced motion the new things still work, and nothing bobs about', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startPatrol(page, atLevel(10));
  await everythingAtOnce(page);
  await page.waitForTimeout(600);
  const reading = await brightnessThrough(page, 120);
  expect(biggestStep(reading)).toBeLessThan(6);
  expect(await page.evaluate(() => window.__game.field.loot.reducedMotion)).toBe(true);
  await page.evaluate(() => clearInterval(window.__kinds));
  await stopPointing(page);
});

test('in Georgian, the names of new things are in Georgian too', async ({ page }) => {
  await startPatrol(page, atLevel(4, { language: 'ka' }));
  await stage(page, [{ kind: 'shield', dx: 0, dz: -15 }]);
  await page.waitForTimeout(400);
  expect(await labels(page)).toContain('ფარიანი ტანკი');
  await shot(page, 'tank-patrol-new-georgian-label');
});

for (const [width, height] of [[1024, 640], [800, 600], [390, 844]]) {
  test(`at ${width} by ${height}, with every prize and three power-ups, the chips stay clear of the mirror and Giraffe's box`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await startPatrol(page, atLevel(10));
    await page.evaluate(() => {
      const { patrol, game } = window.__game;
      Object.assign(patrol.stats, { bolts: 24, gems: 3, stars: 6, friends: 1 });
      for (const name of ['boing', 'magnet', 'slow']) patrol.powerUp(name);
      game.showHaul();
      game.sayAsGiraffe('One more tank!');
    });
    await page.waitForTimeout(700);
    const box = (selector) => page.locator(selector).boundingBox();
    const apart = (a, b) => a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
    const mirror = await box('#camera-frame');
    const story = await box('.story');
    const gear = await box('#open-panel');
    const prompt = await page.locator('#prompt').isVisible() ? await box('#prompt') : null;
    // Each of the new chips, which have a row of their own under the progress bar.
    for (const selector of ['#chip-haul', '#chip-power']) {
      const chip = await box(selector);
      expect(apart(chip, mirror), `${selector} and mirror`).toBe(true);
      expect(apart(chip, gear), `${selector} and gear`).toBe(true);
      expect(apart(chip, story), `${selector} and Giraffe`).toBe(true);
      if (prompt) expect(apart(chip, prompt), `${selector} and the prompt`).toBe(true);
      expect(chip.x + chip.width).toBeLessThanOrEqual(width);
      expect(chip.y).toBeGreaterThan((await box('.race-progress')).y);
    }
    // The row along the top is where it is at level 1.
    expect((await box('#chip-left')).y).toBeLessThan(40);
    await shot(page, `tank-patrol-new-chips-${width}`);
  });
}

test('a new kind of tank in the opening wave is named too, and names wait behind the countdown until "GO!" has gone', async ({ page }) => {
  await openPatrol(page, atLevel(4));
  await show(page, null, 'open', { scale: 0.7 });
  await page.locator('#start').click();
  await waitForScreen(page, 'countdown');
  const counting = await page.evaluate(() => {
    const { field, patrol } = window.__game;
    return { kinds: patrol.enemies.map(({ kind }) => kind), named: [...field.named] };
  });
  expect(counting.kinds).toContain('shield');
  expect(counting.named).toContain('Shield tank');
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.__game.field.labels.every(({ age }) => age === 0))).toBe(true);
  await waitForScreen(page, 'playing');
  await expect.poll(() => page.evaluate(() => window.__game.field.labels[0]?.age ?? 0), { timeout: 10_000 }).toBeGreaterThan(0.6);
  expect(await page.evaluate(() => window.__game.session.playSeconds)).toBeGreaterThan(1.3);
  await shot(page, 'tank-patrol-new-opening-wave-named');
  // And at level 7, with the six tanks a grown-up might choose, the digger in the opening wave.
  await page.evaluate((saved) => localStorage.setItem('camera-games-settings', JSON.stringify(saved)), { voice: false, sound: false, levels: { [GAME]: 7 } });
  await page.reload();
  await show(page, null, 'open', { scale: 0.7 });
  await page.locator('#start').click();
  await waitForScreen(page, 'countdown');
  expect(await page.evaluate(() => window.__game.patrol.enemies.map(({ kind }) => kind))).toContain('digger');
  expect(await labels(page)).toContain('Digger tank');
});

test('dashing scouts, tanks in pairs, runaway tanks and the sunset are named too, the first time each turns up', async ({ page }) => {
  await startPatrol(page, atLevel(8));
  await expect.poll(() => labels(page), { timeout: 10_000 }).toEqual(expect.arrayContaining(['Sunset', 'Tanks in pairs']));
  await page.evaluate(() => {
    const { patrol } = window.__game;
    const scout = patrol.rolling.find(({ kind }) => kind === 'scout');
    patrol.chooseGoal(scout);
    const other = patrol.rolling.find((enemy) => enemy !== scout && enemy.kind !== 'digger');
    patrol.runOff(other);
  });
  await expect.poll(() => labels(page), { timeout: 10_000 }).toEqual(expect.arrayContaining(['Dashing scouts', 'Runaway tanks']));
  await expect.poll(() => page.evaluate(() => window.__game.field.labels[0]?.age ?? 0), { timeout: 20_000 }).toBeGreaterThan(0.8);
  await shot(page, 'tank-patrol-new-names-up');
});

test('coaching goes by what the gun can fire at: the cage in reach, and never a digger under the ground', async ({ page }) => {
  await startPatrol(page, atLevel(7));
  await stage(page, []);
  // Only the cage, in reach, with an open hand: the gun's firing at it, so nobody's asked to drive.
  const asked = await page.evaluate(() => {
    const { patrol, game, monitor } = window.__game;
    const [cage] = patrol.cages;
    const spot = patrol.nav.nearestFree(cage.x + 12, cage.z + 6);
    Object.assign(patrol.tank, { x: spot.x, z: spot.z });
    game.openFor = 6;
    game.closedFor = 0;
    game.farFor = 0;
    return game.prompt(monitor.snapshot, 0)?.text ?? null;
  });
  expect(asked).not.toBe('Close your hand to drive!');
  // Only a digger, under the ground and in reach, with a closed hand: there's nothing to fire at.
  await show(page, null, 'fist', { scale: 0.7 });
  await handIs(page, 'closed');
  const told = await page.evaluate(() => {
    const { patrol, game, monitor } = window.__game;
    for (const cage of patrol.cages) patrol.openCage(cage, false);
    const spot = patrol.nav.nearestFree(patrol.tank.x, patrol.tank.z - 14);
    const digger = patrol.makeEnemy('digger', spot);
    digger.dig = { phase: 'under', left: 2, from: { x: spot.x, z: spot.z }, to: { x: spot.x, z: spot.z } };
    patrol.enemies.push(digger);
    patrol.emit('spawn', { enemy: digger });
    game.closedFor = 3;
    game.openFor = 0;
    game.farFor = 0;
    patrol.driving = false;
    return { prompt: game.prompt(monitor.snapshot, 0)?.text ?? null, inReach: patrol.inRange(digger) };
  });
  expect(told.inReach).toBe(true);
  expect(told.prompt).not.toBe('Open your hand to fire!');
});

test('a triple shot makes one gun sound, not three', async ({ page }) => {
  await startPatrol(page, atLevel(3));
  const [middle] = await stage(page, [{ kind: 'basher', dx: 0, dz: -15 }, { kind: 'scout', dx: 9, dz: -17 }]);
  await page.evaluate(() => {
    const { patrol, sound } = window.__game;
    for (const enemy of window.__staged) enemy.hp = enemy.maxHp = 40;
    patrol.powerUp('spread');
    window.__volleys = patrol.stats.shots;
    window.__heard = 0;
    const play = sound.play.bind(sound);
    sound.play = (name, options) => {
      if (name.startsWith('shot')) window.__heard += 1;
      return play(name, options);
    };
  });
  await countEvents(page);
  await pointAt(page, middle, 'open');
  await expect.poll(() => seen(page, 'shot'), { timeout: 30_000 }).toBeGreaterThanOrEqual(6);
  await stopPointing(page);
  const heard = await page.evaluate(() => ({ heard: window.__heard, volleys: window.__game.patrol.stats.shots - window.__volleys }));
  expect(heard.volleys).toBeGreaterThanOrEqual(2);
  expect(heard.heard).toBe(heard.volleys);
});

test('a power-up\'s name follows the voice\'s language when a grown-up changes it in the middle of a round', async ({ page }) => {
  await startPatrol(page, atLevel(3));
  await page.evaluate(() => window.__game.patrol.powerUp('spread'));
  await expect(page.locator('#chip-power .chip-label')).toHaveText('Triple shot');
  await page.locator('#open-panel').click();
  await page.locator('input[name="language"][value="ka"]').check();
  await page.locator('#close-panel').click();
  await expect(page.locator('#chip-power .chip-label')).toHaveText('სამმაგი გასროლა');
});

test('a digger stopped on its way up comes the rest of the way out of the ground, and its heap of earth goes', async ({ page }) => {
  await startPatrol(page, atLevel(7));
  await stage(page, [{ kind: 'digger', dx: 0, dz: -15 }]);
  await page.evaluate(() => {
    const { patrol } = window.__game;
    const [digger] = window.__staged;
    digger.dig = { phase: 'up', left: 0.4 };
    digger.hp = 1;
    patrol.hit(digger, { kind: 'ball' });
  });
  await page.waitForTimeout(1200);
  const look = await page.evaluate(() => {
    const view = window.__game.field.robots.get(window.__staged[0]);
    return { sink: view.sink, mound: view.mound.visible, shown: view.root.visible };
  });
  expect(look).toEqual({ sink: 0, mound: false, shown: true });
  await shot(page, 'tank-patrol-new-digger-stopped-coming-up');
});
