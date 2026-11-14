// What's at stake on Giraffe's Long Walk Home, by default: the sun going down. It only goes down while he waits
// at a tree and the camera can see the hand, and if it's dark before he's home, the walk ends kindly and that
// level comes round again. On Gentle it stays light, as the walk always was.
import { expect, show, shot, test, waitForScreen } from '../helpers.js';
import { atLevel, judgeBrightness, watchBrightness } from './helpers.js';
import { startPlaying } from './challenge-helpers.js';

const GAME = 'giraffe-walk';
const CANVASES = ['backdrop', 'giraffe-stage', 'game'];

const day = (page) => page.evaluate(() => {
  const { journey } = window.__game;
  return { total: journey.daylight, left: journey.dayLeft, dark: journey.dark, index: journey.index };
});

test('by default the sun goes down while Giraffe waits at a tree, and the chip shows how much day is left', async ({ page }) => {
  // daylight: undefined leaves the game's own default.
  await startPlaying(page, GAME, { daylight: undefined });
  expect(await page.evaluate(() => window.__game.session.settings.daylight)).toBe('sets');
  await expect(page.locator('#chip-sun-box')).toBeVisible();
  await expect.poll(async () => (await day(page)).index).toBe(0);
  const start = await day(page);
  expect(start.total).toBe(17 * 14);
  await page.waitForTimeout(2000);
  const later = await day(page);
  expect(later.left).toBeLessThan(start.left - 1);
  await shot(page, 'walk-daylight');
});

test('the sun waits for a child the camera can\'t see', async ({ page }) => {
  await startPlaying(page, GAME, { daylight: undefined });
  await expect.poll(async () => (await day(page)).index).toBe(0);
  await show(page, null, null);
  await expect.poll(() => page.evaluate(() => window.__game.monitor.snapshot.right.status)).toBe('missing');
  const before = await day(page);
  await page.waitForTimeout(2000);
  expect((await day(page)).left).toBe(before.left);
});

test('when it gets dark before Giraffe is home, the walk ends kindly, on the same level', async ({ page }) => {
  test.setTimeout(90_000);
  await startPlaying(page, GAME, atLevel(GAME, 3, { daylight: undefined }));
  await expect.poll(async () => (await day(page)).index).toBe(0);
  // Nearly dark already, so the test is quick.
  await page.evaluate(() => {
    window.__game.journey.dayLeft = 1.2;
  });
  const reading = watchBrightness(page, 150, CANVASES);
  await waitForScreen(page, 'finish');
  const result = judgeBrightness(await reading);
  console.log('dark:', JSON.stringify(result));
  expect(result.biggestStep).toBeLessThan(5);
  expect(result.flickeringShare).toBeLessThan(0.02);
  await expect(page.locator('#screen-finish h2')).toHaveText('The sun went down!');
  await expect(page.locator('#finish-story')).toContainText('his family came to find him');
  await expect(page.locator('#screen-finish .finish-actions .big-button')).toHaveText('Try again');
  await expect(page.locator('#level-done-text')).toHaveText('Let’s try level 3 again!');
  expect(await page.evaluate(() => window.__game.session.levels.current)).toBe(3);
  expect(await page.evaluate(() => window.__game.hud.confetti.running)).toBe(false);
  await page.waitForTimeout(800);
  await shot(page, 'walk-dark');

  // Trying again starts with a whole day.
  await show(page, null, 'open', { scale: 0.7 });
  await page.locator('#screen-finish .finish-actions .big-button').click();
  await waitForScreen(page, 'playing');
  const fresh = await day(page);
  expect(fresh.dark).toBe(false);
  expect(fresh.left).toBeGreaterThan(fresh.total - 3);
});

test('on Gentle it stays light, as the walk always was', async ({ page }) => {
  await startPlaying(page, GAME, { daylight: 'gentle' });
  await expect(page.locator('#chip-sun-box')).toBeHidden();
  await expect.poll(async () => (await day(page)).index).toBe(0);
  expect((await day(page)).total).toBe(Infinity);
});
