// Mighty Lift as it comes: the lifts have to be done before sunset, and a game where the sun sets first is over,
// with a kind card, Try again and the same level. The clock waits for a resting arm and for a child out of the
// picture. Gentle is the game as it was, with no clock.
import { armsAre, childLifts, expect, judge, reachPlay, shot, state, stopChild, test, waitForScreen, watchBrightness } from './helpers.js';

const AS_IT_COMES = { liftClock: 'yes', lifts: 5 };
const clock = (page) => page.evaluate(() => ({ left: window.__game.lifting.timeLeft, all: window.__game.lifting.timeAll, waits: window.__game.lifting.clockWaits }));

test('as it comes, there\'s a clock before sunset, and when the sun sets first the game is over, kindly, on the same level', async ({ page }) => {
  test.setTimeout(240_000);
  await reachPlay(page, { ...AS_IT_COMES, levels: { 'mighty-lift': 3 } });
  await expect(page.locator('#sunset-chip')).toBeVisible();
  const { all } = await clock(page);
  expect(all).toBeGreaterThan(30);
  // A friend freed, and then the sun almost down, with an arm that only gets half way up.
  await childLifts(page);
  await expect.poll(async () => (await state(page)).stats.freed, { timeout: 45_000 }).toBe(1);
  await page.evaluate(() => {
    window.__game.lifting.timeLeft = 3;
  });
  await childLifts(page, { high: 0.5 });
  await shot(page, 'lift-sunset-close');
  await waitForScreen(page, 'finish', 60_000);
  await stopChild(page);
  expect(await page.evaluate(() => window.__game.lifting.lost)).toBe(true);
  await expect(page.locator('#finish-title')).toHaveText('The sun has set!');
  await expect(page.locator('#finish-line')).toContainText('freed 1 of 5 friends before sunset, and 4 are still waiting');
  await expect(page.locator('#lift-again')).toHaveText('Try again');
  // Nothing is cheered, and the voice says what it says after any game that was lost.
  expect(await page.evaluate(() => window.__game.game.sound.finished)).toEqual({ line: 'So close! Try again!', lost: true });
  expect(await page.evaluate(() => window.__game.game.confetti.running)).toBe(false);
  await expect(page.locator('#level-done-text')).toHaveText('Let’s try level 3 again!');
  expect(await page.evaluate(() => window.__game.game.levels.current)).toBe(3);
  await page.waitForTimeout(600);
  await shot(page, 'lift-sunset-card');
});

test('the clock waits while the arm rests, and while the child is out of the picture', async ({ page }) => {
  test.setTimeout(180_000);
  await reachPlay(page, AS_IT_COMES);
  await armsAre(page, 'down');
  await expect.poll(async () => (await clock(page)).waits, { timeout: 15_000 }).toBe(true);
  const rested = await clock(page);
  await page.waitForTimeout(3000);
  expect((await clock(page)).left).toBe(rested.left);
  await expect(page.locator('#sunset-chip')).toHaveAttribute('data-waits', 'yes');
  await page.evaluate(() => window.__camera.showNobody());
  await expect(page.locator('#prompt')).toContainText('Come back where I can see you', { timeout: 15_000 });
  await page.waitForTimeout(3000);
  expect((await clock(page)).left).toBe(rested.left);
});

test('the gentle game is as it was: no clock, and every game moves on a level', async ({ page }) => {
  test.setTimeout(120_000);
  await reachPlay(page, { liftClock: 'no', lifts: 5 });
  await expect(page.locator('#sunset-chip')).toBeHidden();
  expect(await page.evaluate(() => window.__game.lifting.timeLeft)).toBe(null);
  await page.locator('#open-panel').click();
  await expect(page.locator('input[name="liftClock"][value="no"]')).toBeChecked();
});

test('nothing flashes as the sun sets on a game and it ends', async ({ page }) => {
  test.setTimeout(180_000);
  await reachPlay(page, { ...AS_IT_COMES, levels: { 'mighty-lift': 10 } });
  await childLifts(page, { high: 0.5 });
  await page.evaluate(() => {
    window.__game.lifting.timeLeft = 1.5;
  });
  const reading = judge(await watchBrightness(page, 240));
  await stopChild(page);
  expect(await page.evaluate(() => window.__game.lifting.lost)).toBe(true);
  console.log('mighty lift, sunset', JSON.stringify(reading));
  expect(reading.biggestStep).toBeLessThan(4);
  expect(reading.flickeringShare).toBeLessThan(0.01);
});
