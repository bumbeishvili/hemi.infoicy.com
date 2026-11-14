// Giraffe's Smoothie Stand's customers, who won't wait forever, with real photos going through the real tracker:
// how long they wait shows under the ticket, it only runs down while the hand is in the picture, and a customer
// who runs out goes home, which ends the fair at the same level, with Try again. Gentle customers wait.
import { expect, shot, show, test, waitForScreen } from '../helpers.js';
import { atLevel, judgeBrightness, startPlaying, storyIs, watchBrightness } from './helpers.js';

const GAME = 'smoothie-stand';
const patience = (page) => page.evaluate(() => {
  const { stand } = window.__game;
  return { left: stand.patience, full: stand.patienceFull, share: stand.patienceShare, walkedOff: stand.walkedOff?.who ?? null, waits: stand.waits };
});

test('a customer waits as long as the bar shows, and one who runs out goes home: Try again, at the same level', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page, GAME, atLevel(GAME, 3));
  await storyIs(page, 'truffle');
  await expect(page.locator('#patience')).toBeVisible();
  const first = await patience(page);
  expect(first.waits).toBe(false);
  // Four apples at level 3: two ninths of the way from level 1 to level 10, from 14 seconds and 4 for each to 7 and 2.
  expect(first.full).toBeCloseTo(14 - (7 * 2) / 9 + (4 - (2 * 2) / 9) * 4, 5);
  // The hand is in the picture, so the customer waits a little less every moment.
  await expect.poll(async () => (await patience(page)).left, { timeout: 10_000 }).toBeLessThan(first.full - 1);
  const width = await page.locator('#patience-fill').evaluate((fill) => parseFloat(fill.style.width));
  expect(width).toBeLessThan(100);
  expect(width).toBeGreaterThan(50);
  await shot(page, 'sm-patience');

  // Nearly out of patience: the bar turns orange, and then Truffle goes home.
  await page.evaluate(() => {
    window.__game.stand.patience = 2.5;
  });
  await expect(page.locator('#patience')).toHaveAttribute('data-low', 'yes');
  await expect.poll(async () => (await patience(page)).walkedOff, { timeout: 10_000 }).toBe('truffle');
  expect(await page.evaluate(() => window.__game.field.throwing)).toBe(false);
  await waitForScreen(page, 'finish');
  await expect(page.locator('#screen-finish h2')).toHaveText('Truffle couldn’t wait, and went home!');
  await expect(page.locator('#play-again')).toHaveText('Try again');
  await expect(page.locator('#level-done-text')).toHaveText('Let’s try level 3 again!');
  expect(await page.evaluate(() => window.__game.session.levels.current)).toBe(3);
  await expect(page.locator('#finish-hero')).toHaveText('0');
  await page.waitForTimeout(800);
  await shot(page, 'sm-walked-off');

  // Trying again starts the same level with a fresh customer, and winning it says so as it always did.
  await page.locator('#play-again').click();
  await waitForScreen(page, 'playing');
  await storyIs(page, 'truffle');
  const again = await patience(page);
  expect(again.walkedOff).toBe(null);
  expect(again.left).toBeGreaterThan(again.full - 3);
  await expect(page.locator('#order')).not.toHaveClass(/is-gone/);
});

test('with the hand out of the picture the customer keeps waiting, and a made order goes on to the next', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page, GAME, { customers: 3 });
  await storyIs(page, 'truffle');
  await page.evaluate(() => window.__camera.show({ left: null, right: null }));
  await expect.poll(() => page.evaluate(() => window.__game.field.gloves.right.visible), { timeout: 15_000 }).toBe(false);
  const before = (await patience(page)).left;
  await page.waitForTimeout(4000);
  expect((await patience(page)).left).toBe(before);
  // Back in the picture, it runs down again.
  await show(page, null, 'open', { scale: 0.7 });
  await expect.poll(async () => (await patience(page)).left, { timeout: 15_000 }).toBeLessThan(before - 0.5);
  // An order made in time: the next customer has all their patience.
  await page.evaluate(() => {
    const { stand } = window.__game;
    for (const kind of stand.wantedKinds) while (stand.left[kind] > 0) stand.slice(kind);
  });
  await storyIs(page, 'kit');
  const kit = await patience(page);
  expect(kit.left).toBeGreaterThan(kit.full - 2);
  expect(kit.walkedOff).toBe(null);
});

test('gentle: customers wait as long as it takes, with no bar, and the fair goes on', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page, GAME, atLevel(GAME, 10, { patience: 'gentle' }));
  await storyIs(page, 'truffle');
  await page.waitForTimeout(3000);
  const now = await patience(page);
  expect(now.waits).toBe(true);
  expect(now.share).toBe(1);
  await expect(page.locator('#patience')).toBeHidden();
  // Slicing rotten fruit costs nothing either.
  await page.evaluate(() => {
    for (let i = 0; i < 20; i += 1) window.__game.stand.slice('rotten');
  });
  expect((await patience(page)).walkedOff).toBe(null);
  expect(await page.evaluate(() => window.__game.field.throwing)).toBe(true);
  // The gentle fair climbs as it always did.
  expect(await page.evaluate(() => window.__game.field.pace.gravity)).toBeCloseTo(0.5 * 1.3, 5);
});

test('the new default pace is medium, and level 10 climbs further than it did', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page, GAME, atLevel(GAME, 10));
  await storyIs(page, 'truffle');
  const pace = await page.evaluate(() => ({ name: window.__game.field.paceName, gravity: window.__game.field.pace.gravity }));
  expect(pace.name).toBe('medium');
  expect(pace.gravity).toBeCloseTo(0.5 * 1.45, 5);
  expect((await patience(page)).full).toBeCloseTo(15, 5);
});

test('nothing flashes as a customer goes home and the card comes up', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page, GAME, atLevel(GAME, 10, { pace: 'fast' }));
  await storyIs(page, 'truffle');
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    window.__game.stand.patience = 1;
  });
  const result = judgeBrightness(await watchBrightness(page, 300));
  console.log('walking off', JSON.stringify(result));
  expect((await patience(page)).walkedOff).toBe('truffle');
  expect(result.biggestStep).toBeLessThan(3);
  expect(result.flickeringShare).toBeLessThan(0.05);
});
