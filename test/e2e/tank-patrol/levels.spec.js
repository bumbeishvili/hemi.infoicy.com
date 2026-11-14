// Tank Patrol's levels, with real photos going through the real tracker. What a level changes is in
// levelPlan in patrol.js, and its numbers are checked in test/unit/tank-patrol.test.js.
import { expect, shot, show, test, waitForScreen } from '../helpers.js';
import { biggestStep, brightnessThrough, oneTankAt, patrolIs, pointAt, startPatrol, stopPointing } from './helpers.js';

const GAME = 'tank-patrol';
const atLevel = (level, settings = {}) => ({ levels: { [GAME]: level }, ...settings });

/** Counts what the rules say is happening, from now on. */
const countEvents = (page) => page.evaluate(() => {
  const { patrol } = window.__game;
  window.__seen = {};
  const real = patrol.onEvent;
  patrol.onEvent = (event) => {
    const name = event.type === 'spawn' && event.enemy.leader ? 'pair' : event.type === 'lob' && event.second ? 'second-shell' : event.type;
    window.__seen[name] = (window.__seen[name] ?? 0) + 1;
    real(event);
  };
});

/** A child who closes to drive at the nearest tank and opens to fire at it, again and again. */
const playLikeAChild = (page) => page.evaluate(() => {
  window.__playing = setInterval(() => {
    const { patrol, field } = window.__game;
    const { tank } = patrol;
    const [target] = patrol.rolling.slice().sort((a, b) => Math.hypot(a.x - tank.x, a.z - tank.z) - Math.hypot(b.x - tank.x, b.z - tank.z));
    if (!target) return;
    const glove = field.gloves.right;
    const spot = field.project(target.x, target.y, target.z);
    if (glove.visible) {
      window.__ox = (window.__ox ?? 0) + ((spot.x - glove.x) / innerWidth) * 180;
      window.__oy = (window.__oy ?? 0) + ((spot.y - glove.y) / innerHeight) * 120;
    }
    window.__camera.show({ left: null, right: patrol.inRange(target) ? 'open' : 'fist', scale: 0.7, rightOffsetX: window.__ox ?? 0, rightOffsetY: window.__oy ?? 0 });
  }, 50);
});

test('level 10: scouts dash, tanks come in pairs and run off, shells come two at a time, and it can still be finished', async ({ page }) => {
  test.setTimeout(360_000);
  await startPatrol(page, atLevel(10, { tanks: 6, pace: 'fast' }));
  await expect(page.locator('#level-badge')).toHaveText('Level 10 of 10');
  expect(await page.evaluate(() => window.__game.patrol.levelNumber)).toBe(10);
  // The pair that came in at the start, before anything was counted.
  expect(await page.evaluate(() => window.__game.patrol.enemies.some(({ leader }) => leader))).toBe(true);
  await countEvents(page);
  await playLikeAChild(page);
  let twoRings = false;
  await expect.poll(async () => {
    const state = await page.evaluate(() => ({ screen: window.__game.screen, shells: window.__game.patrol.shells.length }));
    if (state.shells >= 2 && !twoRings) {
      twoRings = true;
      await page.waitForTimeout(400);
      await shot(page, 'tank-patrol-level10-two-shells');
    }
    return state.screen;
  }, { timeout: 330_000, intervals: [200] }).toBe('finish');
  await page.evaluate(() => clearInterval(window.__playing));
  const seen = await page.evaluate(() => window.__seen);
  console.log('what happened at level 10', JSON.stringify(seen));
  expect(seen.dash).toBeGreaterThan(0);
  expect(seen['run-off']).toBeGreaterThan(0);
  await expect(page.locator('#screen-finish h2')).toHaveText('You saved the valley!');
  await expect(page.locator('#finish-hero')).toHaveText('6');
  await expect(page.locator('#level-done-text')).toHaveText('All 10 levels done!');
  await page.waitForTimeout(400);
  await shot(page, 'tank-patrol-level10-finish');
});

test('level 10: a heavy lobs two shells at once, with a ring for each, and nothing flashes as they land', async ({ page }) => {
  test.setTimeout(120_000);
  await startPatrol(page, atLevel(10));
  await page.evaluate(() => {
    const { patrol } = window.__game;
    const [enemy, ...others] = patrol.rolling;
    for (const other of others) {
      other.state = 'gone';
      patrol.emit('gone', { enemy: other });
    }
    enemy.kind = 'heavy';
    patrol.queue = [];
    patrol.total = patrol.stats.stopped + 1;
    patrol.lobIn = 0;
  });
  await pointAt(page, { x: 3, z: 26 }, 'open');
  await expect.poll(async () => (await patrolIs(page)).shells, { timeout: 8000 }).toBe(2);
  await page.evaluate(() => {
    window.__game.patrol.lobIn = 999;
  });
  await page.waitForTimeout(900);
  await shot(page, 'tank-patrol-level10-two-rings');
  const landing = await brightnessThrough(page, 180);
  console.log('level 10: biggest brightness step as two shells land', biggestStep(landing));
  expect(biggestStep(landing)).toBeLessThan(6);
  expect(Math.max(...landing) - Math.min(...landing)).toBeLessThan(12);
  expect((await patrolIs(page)).shells).toBe(0);
  await stopPointing(page);
});

test('level 10 driving by itself: an open hand still chases a tank down and stops it, even one that runs off', async ({ page }) => {
  test.setTimeout(150_000);
  await startPatrol(page, atLevel(10, { driving: 'auto' }));
  await oneTankAt(page, 0, -34, { hp: 10 });
  await countEvents(page);
  await pointAt(page, 'tank', 'open');
  await expect.poll(async () => (await patrolIs(page)).stats.shots, { timeout: 30_000 }).toBeGreaterThan(0);
  await expect.poll(async () => (await patrolIs(page)).stopped, { timeout: 90_000 }).toBe(1);
  expect(await page.evaluate(() => window.__seen['run-off'] ?? 0)).toBe(1);
  await stopPointing(page);
});

test('running out of hearts on Tough tries the same level again', async ({ page }) => {
  await startPatrol(page, atLevel(7, { tankShells: 'tough' }));
  await page.evaluate(() => {
    const { patrol } = window.__game;
    for (let i = 0; i < 3; i += 1) patrol.hurt();
  });
  await waitForScreen(page, 'finish');
  await expect(page.locator('#screen-finish h2')).toHaveText('The robot tanks got the better of you!');
  await expect(page.locator('#play-again')).toHaveText('Try again');
  await expect(page.locator('#level-done-text')).toHaveText('Let’s try level 7 again!');
  await show(page, null, 'open', { scale: 0.7 });
  await page.locator('#play-again').click();
  await waitForScreen(page, 'playing');
  expect(await page.evaluate(() => window.__game.patrol.levelNumber)).toBe(7);
});
