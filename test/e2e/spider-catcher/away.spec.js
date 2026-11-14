// Spider Catcher's spiders getting away, with real photos going through the real tracker: left alone too long, one
// heads for the edge of the garden, one that gets there has got away, and three getting away ends the game at the same
// level, with Try again. Catching one settles them, a hand out of the picture keeps them where they are, and in the
// gentle garden nobody gets away.
import { expect, shot, test, waitForScreen } from '../helpers.js';
import { atLevel, judgeBrightness, startPlaying as startGarden, storyIs, watchBrightness } from '../story-games/helpers.js';
import { GAME, garden, handIs, openOnSpider } from './helpers.js';

const CANVASES = ['backdrop', 'giraffe-stage', 'game'];
const away = (page) => page.evaluate(() => {
  const { garden: place } = window.__game;
  const { wandering } = place;
  return {
    on: wandering.on,
    since: wandering.since,
    after: wandering.after,
    away: wandering.away,
    states: place.spiders.map(({ state }) => state),
    labels: place.labels.map(({ key }) => key),
  };
});

/** Nobody has played with the spiders for nearly long enough, and the one that goes is quick about it. */
const almostTime = (page, run = 0.8) => page.evaluate((seconds) => {
  const { garden: place } = window.__game;
  place.level.awayRun = seconds;
  place.wandering.since = place.wandering.after - 0.3;
}, run);

test('left alone too long, a spider heads off and gets away, and the third to get away ends the game: Try again, at the same level', async ({ page }) => {
  test.setTimeout(150_000);
  await startGarden(page, GAME, atLevel(GAME, 2));
  await storyIs(page, 'giraffe');
  await expect(page.locator('#chip-away')).toHaveText('0 of 3');
  await expect(page.locator('#chip-away-box')).toBeVisible();
  const first = await away(page);
  expect(first.on).toBe(true);
  expect(first.after).toBeCloseTo(24 - 12 / 9, 5);
  // The hand is in the picture, so the clock is running.
  await expect.poll(async () => (await away(page)).since, { timeout: 10_000 }).toBeGreaterThan(0.5);

  // One heads off, slowly enough to see, with a label the first time.
  await almostTime(page, 3);
  await expect.poll(async () => (await away(page)).states.includes('leaving'), { timeout: 10_000 }).toBe(true);
  expect((await away(page)).labels).toContain('away');
  await page.waitForTimeout(1200);
  await shot(page, 'spider-heading-off');
  await expect(page.locator('#chip-away')).toHaveText('1 of 3', { timeout: 10_000 });
  // Out of sight for a moment, and then back to playing.
  await expect.poll(async () => (await away(page)).states.includes('away'), { timeout: 5000 }).toBe(false);
  expect((await away(page)).states.filter((state) => state === 'playing').length).toBeGreaterThan(0);

  // Two more, and that's the game.
  for (const count of ['2 of 3', '3 of 3']) {
    await almostTime(page);
    await expect(page.locator('#chip-away')).toHaveText(count, { timeout: 15_000 });
  }
  await waitForScreen(page, 'finish');
  await expect(page.locator('#screen-finish h2')).toHaveText('Three little spiders got away!');
  await expect(page.locator('#play-again')).toHaveText('Try again');
  await expect(page.locator('#level-done-text')).toHaveText('Let’s try level 2 again!');
  expect(await page.evaluate(() => window.__game.session.levels.current)).toBe(2);
  await page.waitForTimeout(800);
  await shot(page, 'spider-got-away');

  // Trying again: nobody has got away yet.
  await page.locator('#play-again').click();
  await waitForScreen(page, 'playing');
  await expect(page.locator('#chip-away')).toHaveText('0 of 3');
  expect((await away(page)).away).toBe(0);
});

test('a real hand catching a spider settles them, and with the hand out of the picture nobody wanders off', async ({ page }) => {
  test.setTimeout(150_000);
  await startGarden(page, GAME);
  await storyIs(page, 'giraffe');
  await page.evaluate(() => {
    window.__game.garden.wandering.since = 15;
  });
  await openOnSpider(page);
  await handIs(page, 'fist');
  await expect.poll(async () => (await garden(page)).holding, { timeout: 15_000 }).toBe(true);
  expect((await away(page)).since).toBeLessThan(3);

  // The hand gone from the picture: the clock waits.
  await page.evaluate(() => {
    window.__move?.stop();
    window.__camera.show({ left: null, right: null });
  });
  await expect.poll(() => page.evaluate(() => window.__game.garden.gloves.right.visible), { timeout: 15_000 }).toBe(false);
  const before = (await away(page)).since;
  await page.waitForTimeout(4000);
  const after = await away(page);
  expect(after.since).toBe(before);
  expect(after.states).not.toContain('leaving');
});

test('gentle: the spiders play for as long as it takes, and nobody gets away', async ({ page }) => {
  test.setTimeout(150_000);
  await startGarden(page, GAME, atLevel(GAME, 10, { spiderAway: 'gentle' }));
  await storyIs(page, 'giraffe');
  await page.waitForTimeout(3000);
  const now = await away(page);
  expect(now.on).toBe(false);
  expect(now.since).toBe(0);
  await expect(page.locator('#chip-away-box')).toBeHidden();
  // The gentle garden climbs as it always did.
  expect(await page.evaluate(() => window.__game.garden.level.speed)).toBeCloseTo(0.094, 5);
});

test('nothing flashes as a spider heads off, gets away and comes back, at level 10', async ({ page }) => {
  test.setTimeout(150_000);
  await startGarden(page, GAME, atLevel(GAME, 10));
  await storyIs(page, 'giraffe');
  expect(await page.evaluate(() => window.__game.garden.level.speed)).toBeCloseTo(0.12, 5);
  await page.waitForTimeout(1000);
  // On a busy computer one may have gone by itself already, as a level 10 spider is only left alone for 12 seconds.
  const before = (await away(page)).away;
  await almostTime(page, 1.5);
  const result = judgeBrightness(await watchBrightness(page, 300, CANVASES));
  console.log('getting away', JSON.stringify(result));
  expect((await away(page)).away).toBeGreaterThan(before);
  expect(result.biggestStep).toBeLessThan(3);
  expect(result.flickeringShare).toBeLessThan(0.05);
});
