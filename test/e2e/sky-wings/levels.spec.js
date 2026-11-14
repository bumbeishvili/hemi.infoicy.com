// Sky Wings' levels: what level 10 brings, that a dogfight there can still be won and is still safe
// to look at, and that winning moves on a level while being shot down doesn't.
import { expect, shot, test, waitForScreen } from '../helpers.js';
import { armsAre, dropPlanes, flightState, flyWell, holdPlaneInFront, letPlaneGo, reachFlight } from './helpers.js';

const at = (level, settings = {}) => ({ levels: { 'sky-wings': level }, ...settings });

/** The picture's overall brightness, frame by frame. */
const brightness = (page, frames) => page.evaluate(async (count) => {
  const { sky } = window.__game;
  const reading = [];
  const small = document.createElement('canvas');
  small.width = 32;
  small.height = 18;
  const context = small.getContext('2d', { willReadFrequently: true });
  for (let i = 0; i < count; i += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    sky.render();
    context.drawImage(sky.canvas, 0, 0, 32, 18);
    const { data } = context.getImageData(0, 0, 32, 18);
    let total = 0;
    for (let j = 0; j < data.length; j += 4) total += (data[j] + data[j + 1] + data[j + 2]) / 3;
    reading.push(total / (32 * 18));
  }
  return reading;
}, frames);

const biggestStep = (reading) => Math.max(...reading.slice(1).map((value, index) => Math.abs(value - reading[index])));

test('level 1 is the dogfight as it always was', async ({ page }) => {
  await reachFlight(page);
  const now = await page.evaluate(() => {
    const { flight } = window.__game;
    return { level: flight.levelNumber, atOnce: flight.flying.length, rules: flight.levelRules, captain: flight.enemies.some(({ captain }) => captain) };
  });
  expect(now.level).toBe(1);
  expect(now.atOnce).toBe(3);
  expect(now.captain).toBe(false);
  expect(now.rules).toEqual({ enemySpeed: 0.84, enemyTurn: 0.82, huntEvery: 1, dodgeSeconds: 2.2, sharpness: 1, weave: 0, climbs: 1, atOnce: 3, captain: false, prizes: false, gifts: [], kinds: [], airship: false, sky: 'day' });
  await expect(page.locator('.mark:not([data-where="none"])')).toHaveCount(3, { timeout: 5000 });
});

test('level 10: four pirates at once, weaving as they go, and the pirate captain last', async ({ page }) => {
  test.setTimeout(120_000);
  await reachFlight(page, at(10, { planes: 9 }));
  await expect(page.locator('#level-badge')).toHaveText('Level 10 of 10');
  expect((await flightState(page)).enemies.filter(({ state }) => state === 'flying')).toHaveLength(4);
  await expect(page.locator('.mark')).toHaveCount(4);
  await page.waitForTimeout(1500);
  await shot(page, 'sky-l10-four');

  // Crossing, they swing from side to side.
  const sides = await page.evaluate(async () => {
    const { flight } = window.__game;
    const [enemy] = flight.flying;
    const seen = new Set();
    for (let i = 0; i < 40; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (enemy.mode === 'cross' && enemy.dodgeLeft === 0 && Math.abs(enemy.roll) > 0.05) seen.add(Math.sign(enemy.roll));
    }
    return [...seen];
  });
  expect(sides.sort()).toEqual([-1, 1]);

  // Down to the last one, which is the captain: bigger, with a flag, and more hits to drop.
  await dropPlanes(page, 4);
  await page.waitForTimeout(1300);
  await dropPlanes(page, 4);
  await expect.poll(async () => (await flightState(page)).left, { timeout: 10_000 }).toBe(1);
  await expect.poll(async () => (await flightState(page)).enemies.filter(({ state }) => state === 'flying').length, { timeout: 10_000 }).toBe(1);
  const captain = await page.evaluate(() => {
    const { flight, sky } = window.__game;
    const [enemy] = flight.flying;
    const plane = sky.planeFor(enemy);
    return { captain: enemy.captain, hits: enemy.hitsTotal, usual: flight.enemyHits, flag: plane.flag.visible, size: plane.root.scale.x };
  });
  expect(captain.captain).toBe(true);
  expect(captain.hits).toBeGreaterThan(captain.usual);
  expect(captain.flag).toBe(true);
  expect(captain.size).toBeGreaterThan(1.8 * 1.3);
  await holdPlaneInFront(page, { ahead: 110, across: 12 });
  await expect(page.locator('.mark[data-captain="yes"]')).toHaveCount(1);
  await page.waitForTimeout(600);
  await shot(page, 'sky-l10-captain');
  await expect.poll(async () => (await flightState(page)).dropped, { timeout: 30_000 }).toBe(9);
  await letPlaneGo(page);
  await waitForScreen(page, 'finish');
  await expect(page.locator('#finish-title')).toHaveText('You dropped them all!');
});

test('level 10 can be won by flying for the planes, and that\'s every level done', async ({ page }) => {
  test.setTimeout(300_000);
  await reachFlight(page, at(10, { planes: 3, pace: 'fast' }));
  await flyWell(page);
  await page.waitForTimeout(2500);
  await shot(page, 'sky-l10-flying');
  await waitForScreen(page, 'finish');
  await expect(page.locator('#finish-place')).toHaveText('3 / 3');
  await expect(page.locator('#level-done-text')).toHaveText('All 10 levels done!');
  await page.waitForTimeout(800);
  await shot(page, 'sky-l10-finish');
});

test('dropping them all moves on a level, and the next dogfight is flown at it', async ({ page }) => {
  test.setTimeout(240_000);
  await reachFlight(page, at(2, { planes: 3 }));
  expect(await page.evaluate(() => window.__game.flight.levelNumber)).toBe(2);
  await dropPlanes(page, 3);
  await waitForScreen(page, 'finish');
  await expect(page.locator('#level-done-text')).toHaveText('Level 2 done! Next: level 3');
  await expect(page.locator('#fly-again')).toHaveText('Next level');
  await armsAre(page, 'level');
  await page.locator('#fly-again').click();
  await waitForScreen(page, 'fly');
  expect(await page.evaluate(() => window.__game.flight.levelNumber)).toBe(3);
});

test('being shot down, on a harder setting, stays on the same level', async ({ page }) => {
  test.setTimeout(120_000);
  await reachFlight(page, at(4, { level: 'medium', planes: 3 }));
  await page.evaluate(() => {
    for (let i = 0; i < 5; i += 1) window.__game.flight.hurt();
  });
  await waitForScreen(page, 'finish');
  await expect(page.locator('#finish-title')).toHaveText('So close! Fly again!');
  await expect(page.locator('#level-done-text')).toHaveText('Let’s try level 4 again!');
  await expect(page.locator('#fly-again')).toHaveText('Try again');
  await expect(page.locator('#finish-line')).toContainText('The sky pirates got');
  expect(await page.evaluate(() => window.__game.game.levels.current)).toBe(4);
  await page.waitForTimeout(800);
  await shot(page, 'sky-l4-lost');
});

test('level 10: nothing flashes through firing at the captain and dropping it', async ({ page }) => {
  test.setTimeout(120_000);
  await reachFlight(page, at(10, { planes: 1 }));
  await page.evaluate(() => {
    // One plane to drop is never the captain, so this makes it one, to look at its flag and size.
    const [enemy] = window.__game.flight.flying;
    enemy.captain = true;
    enemy.hitsTotal = 20;
    enemy.hitsLeft = 20;
  });
  await holdPlaneInFront(page, { ahead: 70 });
  const reading = await brightness(page, 150);
  await letPlaneGo(page);
  const { stats } = await flightState(page);
  expect(stats.hits).toBeGreaterThan(5);
  console.log('level 10: biggest brightness step', biggestStep(reading));
  expect(biggestStep(reading)).toBeLessThan(25);
});

test('level 10 with reduced motion: the horizon doesn\'t tip, and the dogfight still works', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await reachFlight(page, at(10));
  await flyWell(page);
  await page.evaluate(() => {
    window.__game.flight.roll = 0.6;
  });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  const up = await page.evaluate(() => {
    const { sky, flight } = window.__game;
    const { up: straight } = flight.view;
    const { up: camera } = sky.camera;
    return Math.hypot(camera.x - straight.x, camera.y - straight.y, camera.z - straight.z);
  });
  expect(up).toBeLessThan(0.1);
  await expect.poll(() => page.evaluate(() => window.__game.flight.stats.shots), { timeout: 30_000 }).toBeGreaterThan(0);
});

test('level 10: a slow computer still gives up sharpness and then some of the trees, and keeps flying', async ({ page }) => {
  await reachFlight(page, at(10, { planes: 9 }));
  const level = await page.evaluate(() => {
    const { sky } = window.__game;
    const trees = sky.island.manyOf[0].count;
    sky.quality = 2;
    sky.frames = 0;
    sky.slowFrames = 0;
    for (let i = 0; i < 90; i += 1) sky.watchSpeed(0.05);
    const first = [sky.quality, sky.renderer.getPixelRatio()];
    for (let i = 0; i < 90; i += 1) sky.watchSpeed(0.05);
    return { first, second: sky.quality, fewer: sky.island.manyOf[0].count < trees };
  });
  expect(level).toEqual({ first: [1, 1], second: 0, fewer: true });
  expect(await page.evaluate(() => window.__game.screen)).toBe('fly');
});

test('by default the pirates can bring the plane down, even with arms down, and the card says so kindly', async ({ page }) => {
  test.setTimeout(150_000);
  // No level given: the game's own default, Medium.
  await reachFlight(page, at(3, { level: undefined, planes: 3 }));
  expect(await page.evaluate(() => window.__game.game.settings.level)).toBe('medium');
  expect(await page.evaluate(() => window.__game.flight.level.canLose)).toBe(true);
  await armsAre(page, 'down');
  await expect.poll(async () => (await flightState(page)).resting, { timeout: 15_000 }).toBe(true);
  // The pirates don't stop for the rest, so the coach keeps asking for the wings.
  await expect(page.locator('#prompt')).toContainText('Hold your arms out like wings!');
  // Every pirate comes hunting, and their shots find the gliding plane.
  await expect.poll(async () => page.evaluate(() => {
    for (const enemy of window.__game.flight.flying) {
      if (enemy.mode !== 'hunt' && enemy.kind !== 'balloon') {
        enemy.mode = 'hunt';
        enemy.modeLeft = 100;
      }
    }
    return window.__game.flight.stats.hurts;
  }), { timeout: 60_000, intervals: [500] }).toBeGreaterThan(0);
  // The last hearts go, and the picture doesn't flash as the flight ends.
  const watching = brightness(page, 120);
  await page.evaluate(() => {
    const { flight } = window.__game;
    while (flight.state === 'flying') flight.hurt();
  });
  const reading = await watching;
  console.log('shot down: biggest brightness step', biggestStep(reading));
  expect(biggestStep(reading)).toBeLessThan(25);
  await waitForScreen(page, 'finish');
  await expect(page.locator('#finish-title')).toHaveText('So close! Fly again!');
  await expect(page.locator('#finish-line')).toContainText('The sky pirates got');
  await expect(page.locator('#fly-again')).toHaveText('Try again');
  await expect(page.locator('#level-done-text')).toHaveText('Let’s try level 3 again!');
  expect(await page.evaluate(() => window.__game.game.levels.current)).toBe(3);
  await page.waitForTimeout(800);
  await shot(page, 'sky-shot-down');
});

test('on Gentle, the old game: the same rest is left alone and the plane can\'t be brought down', async ({ page }) => {
  test.setTimeout(120_000);
  await reachFlight(page, at(10, { level: 'gentle', planes: 3 }));
  await armsAre(page, 'down');
  await expect.poll(async () => (await flightState(page)).resting, { timeout: 15_000 }).toBe(true);
  await page.evaluate(() => {
    for (let i = 0; i < 12; i += 1) window.__game.flight.hurt();
  });
  expect((await flightState(page)).state).toBe('flying');
  expect((await flightState(page)).hearts).toBe(1);
});
