// A whole race from start to finish, including the summary a grown-up reads afterwards.
import {
  car,
  expect,
  openGame,
  reachRace,
  screenName,
  shot,
  show,
  test,
  waitForHand,
  waitForScreen,
  waitUntilMoving,
  waitUntilStopped,
} from './helpers.js';

test('a full one-lap race finishes, reports the hand and can be run again', async ({ page }) => {
  await openGame(page, { laps: 1, steering: 'auto' });
  await show(page, null, 'open');
  await reachRace(page);
  await waitForHand(page, 'open');
  await waitUntilMoving(page);

  await expect(page.locator('#chip-lap')).toHaveText('1 of 1');

  // Pass the rivals: the player starts last and should soon move up.
  await expect.poll(async () => (await car(page)).place, { timeout: 30_000 }).toBeLessThan(4);
  await shot(page, '30-mid-race');

  // One pause with the hand closed, so it shows up in the numbers.
  await show(page, null, 'fist');
  await waitForHand(page, 'closed');
  await waitUntilStopped(page);
  await page.waitForTimeout(4000);
  await shot(page, '31-resting-mid-race');
  await show(page, null, 'open');
  await waitForHand(page, 'open');

  await waitForScreen(page, 'finish');
  await expect(page.locator('#screen-finish h2')).toHaveText('You won the race!');
  await page.waitForTimeout(1200);
  await shot(page, '32-finish');

  const stars = Number(await page.locator('#finish-hero').textContent());
  console.log('stars', stars);
  expect(stars).toBeGreaterThan(20);

  const summary = await page.evaluate(() => {
    const { right, seconds, handOpenSeconds } = window.__game.stats;
    return { right, seconds, handOpenSeconds };
  });
  console.log(JSON.stringify(summary));
  expect(summary.right.openings).toBe(2);
  expect(summary.right.openSeconds).toBeLessThan(summary.seconds - 3);
  expect(summary.right.peak).toBeGreaterThan(0.8);

  await expect(page.locator('#sum-right-openings')).toHaveText('2');
  await expect(page.locator('#finish-open')).toContainText('Right hand open for');

  // The camera, and its light, go off as soon as the race is over.
  expect(await page.evaluate(() => window.__camera.activeTracks)).toBe(0);

  await page.locator('#play-again').click();
  await waitForScreen(page, 'countdown');
  expect(await page.evaluate(() => window.__camera.activeTracks)).toBe(1);
  await waitForScreen(page, 'playing');
  await waitUntilMoving(page);
  expect((await car(page)).stars).toBeLessThan(stars);
  expect(await screenName(page)).toBe('playing');
});
