// What's at stake in the Lighthouse Keeper, by default: a ship only waits so long for its window. It drifts
// while the window is muddy and the camera can see the hand, and if it drifts away, the game ends kindly and
// that level comes round again. On Gentle the ships wait as long as it takes, as they always did.
import { expect, show, shot, test, waitForScreen } from '../helpers.js';
import { atLevel, judgeBrightness, watchBrightness } from './helpers.js';
import { startPlaying } from './challenge-helpers.js';

const GAME = 'lighthouse';

const ship = (page) => page.evaluate(() => {
  const { storm } = window.__game.game;
  return { index: storm.index, total: storm.waitTotal, left: storm.waitLeft, drifted: storm.drifted };
});

test('by default a ship can only wait so long, and the chip shows how long is left', async ({ page }) => {
  // storm: undefined leaves the game's own default.
  await startPlaying(page, GAME, { storm: undefined });
  expect(await page.evaluate(() => window.__game.session.settings.storm)).toBe('drift');
  await expect(page.locator('#chip-wait-box')).toBeVisible();
  await expect.poll(async () => (await ship(page)).index).toBe(0);
  const start = await ship(page);
  expect(start.total).toBe(50);
  await page.waitForTimeout(2000);
  expect((await ship(page)).left).toBeLessThan(start.left - 1);
  await shot(page, 'light-ship-waiting');
});

test('a ship waits for a child the camera can\'t see', async ({ page }) => {
  await startPlaying(page, GAME, { storm: undefined });
  await expect.poll(async () => (await ship(page)).index).toBe(0);
  await show(page, null, null);
  await expect.poll(() => page.evaluate(() => window.__game.monitor.snapshot.right.status)).toBe('missing');
  const before = await ship(page);
  await page.waitForTimeout(2000);
  expect((await ship(page)).left).toBe(before.left);
});

test('a ship that drifts away ends the game kindly, on the same level', async ({ page }) => {
  test.setTimeout(90_000);
  await startPlaying(page, GAME, atLevel(GAME, 4, { storm: undefined }));
  await expect.poll(async () => (await ship(page)).index).toBe(0);
  // Nearly out of time already, so the test is quick.
  await page.evaluate(() => {
    window.__game.game.storm.waitLeft = 1.2;
  });
  const reading = watchBrightness(page, 150);
  await waitForScreen(page, 'finish');
  const result = judgeBrightness(await reading);
  console.log('drifted:', JSON.stringify(result));
  expect(result.biggestStep).toBeLessThan(5);
  expect(result.flickeringShare).toBeLessThan(0.02);
  await expect(page.locator('#screen-finish h2')).toHaveText('A ship drifted away!');
  await expect(page.locator('#finish-story')).toContainText('Frost’s boat drifted off into the storm');
  // The big button's words and the lack of cheering on a lost game come from the shared code.
  await expect(page.locator('#level-done-text')).toHaveText('Let’s try level 4 again!');
  expect(await page.evaluate(() => window.__game.session.levels.current)).toBe(4);
  await page.waitForTimeout(800);
  await shot(page, 'light-drifted');

  await show(page, null, 'open', { scale: 0.7 });
  await page.locator('#screen-finish .finish-actions .big-button').click();
  await waitForScreen(page, 'playing');
  await expect.poll(async () => (await ship(page)).index).toBe(0);
  const fresh = await ship(page);
  expect(fresh.drifted).toBe(false);
  expect(fresh.left).toBeGreaterThan(fresh.total - 3);
});

test('on Gentle the ships wait as long as it takes, as they always did', async ({ page }) => {
  await startPlaying(page, GAME, { storm: 'gentle' });
  await expect(page.locator('#chip-wait-box')).toBeHidden();
  await expect.poll(async () => (await ship(page)).index).toBe(0);
  expect((await ship(page)).total).toBe(Infinity);
});
