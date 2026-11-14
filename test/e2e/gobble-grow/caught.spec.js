// Gobble and Grow's bigger things, which can catch the creature as the game comes: a bigger thing right on it
// catches it, three catches gobble it up, and that ends the world at the same level, with Try again. A face that has
// gone is never caught, and in the gentle soup they only nudge. The drawn face and the stand-in tracker play the child.
import { atLevel, emptySoup, expect, expectSoon, face, judge, putFood, shot, startPlaying, state, test, waitForScreen, watchBrightness } from './helpers.js';

const CATCH = { gobbleBig: 'catch' };
const lives = (page) => page.evaluate(() => {
  const { soup } = window.__game;
  return { danger: soup.danger, lives: soup.lives, caught: soup.stats.caught, phase: soup.phase, safe: soup.safeFor };
});

/** Waits for the creature to be safe no longer, and puts the biggest kind of thing right on it. */
async function bigOnIt(page) {
  await expectSoon(async () => (await lives(page)).safe, { timeout: 15_000 }).toBe(0);
  await putFood(page, 2, { dx: 0, dy: 0 });
}

test('a bigger thing right on the creature catches it, three catches gobble it up, and it\'s Try again at the same level', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, { ...atLevel(2), ...CATCH });
  await emptySoup(page);
  await expect(page.locator('#chip-lives-box')).toBeVisible();
  await expect(page.locator('#chip-lives')).toHaveText('💛💛💛');
  expect((await lives(page)).danger).toBe(true);

  await bigOnIt(page);
  await expectSoon(async () => (await lives(page)).caught, { timeout: 10_000 }).toBe(1);
  await expect(page.locator('#chip-lives')).toHaveText('💛💛🤍');
  await page.waitForTimeout(300);
  await shot(page, 'gobble-caught');
  await bigOnIt(page);
  await expectSoon(async () => (await lives(page)).caught, { timeout: 10_000 }).toBe(2);
  await bigOnIt(page);
  await expectSoon(async () => (await lives(page)).phase, { timeout: 10_000 }).toBe('eaten');
  await page.waitForTimeout(500);
  await shot(page, 'gobble-gobbled');
  await waitForScreen(page, 'finish');
  // Level 2's biggest thing is an amoeba.
  await expect(page.locator('#screen-finish h2')).toHaveText('An amoeba gobbled you up!');
  await expect(page.locator('#play-again')).toHaveText('Try again');
  await expect(page.locator('#level-done-text')).toHaveText('Let’s try level 2 again!');
  expect((await state(page)).ownLevel).toBe(2);
  await page.waitForTimeout(800);
  await shot(page, 'gobble-gobbled-card');
});

test('a face that has gone is never caught, and a bigger thing near the creature says to keep away', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, { ...atLevel(1), ...CATCH });
  await emptySoup(page);
  await expectSoon(async () => (await lives(page)).safe, { timeout: 15_000 }).toBe(0);
  await face(page, { seen: false });
  await expectSoon(async () => (await state(page)).mouth.status, { timeout: 10_000 }).toBe('missing');
  await putFood(page, 2, { dx: 0, dy: 0 });
  await page.waitForTimeout(4000);
  expect((await lives(page)).caught).toBe(0);
  // Back again, it's safe for a moment, so it can get out of the way, and then it's caught.
  await face(page, { seen: true });
  await page.waitForTimeout(600);
  expect((await lives(page)).caught).toBe(0);
  await expectSoon(async () => (await lives(page)).caught, { timeout: 10_000 }).toBe(1);
  expect((await state(page)).named).toContain('keep-away');
});

test('gentle: bigger things only nudge, nothing is lost, and there are no lives', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, { ...atLevel(10), gobbleBig: 'gentle' });
  await emptySoup(page);
  await expect(page.locator('#chip-lives-box')).toBeHidden();
  await page.waitForTimeout(3000);
  await putFood(page, 2, { dx: 0, dy: 0 });
  await page.waitForTimeout(3000);
  const now = await lives(page);
  expect(now.danger).toBe(false);
  expect(now.caught).toBe(0);
  expect(now.phase).toBe('play');
  expect((await state(page)).stats.bumps).toBeGreaterThanOrEqual(1);
  // The gentle soup climbs as it always did.
  expect(await page.evaluate(() => window.__game.soup.plan.cross)).toBeCloseTo(11.5, 5);
});

test('nothing flashes as the creature is caught and gobbled up, at level 10', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, { ...atLevel(10), ...CATCH });
  expect(await page.evaluate(() => window.__game.soup.plan.cross)).toBeCloseTo(10, 5);
  await page.evaluate(() => {
    window.__game.soup.lives = 2;
  });
  await expectSoon(async () => (await lives(page)).safe, { timeout: 15_000 }).toBe(0);
  const watching = watchBrightness(page, 240);
  await putFood(page, 2, { dx: 0, dy: 0 });
  await page.waitForTimeout(3000);
  await putFood(page, 2, { dx: 0, dy: 0 });
  const result = judge(await watching);
  console.log('caught and gobbled', JSON.stringify(result));
  expect((await lives(page)).phase).toBe('eaten');
  expect(result.biggestStep).toBeLessThan(4);
  expect(result.flickeringShare).toBeLessThan(0.01);
});
