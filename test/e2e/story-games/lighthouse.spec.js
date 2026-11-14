// The Lighthouse Keeper, with real photos going through the real tracker.
import { expect, hands, shot, show, test, waitForScreen } from '../helpers.js';
import { moveGloveTo, stopMoving, storyIs } from './helpers.js';
import { startPlaying } from './challenge-helpers.js';

const GAME = 'lighthouse';
const storm = (page) => page.evaluate(() => {
  const { storm: rules } = window.__game;
  return { index: rules.index, home: rules.home, share: rules.mud?.share ?? 0, who: rules.ship?.who ?? null };
});
const GLOVE = ['room', 'gloves', 'right'];

/** Wipes back and forth across the window, lower each time, as a child would. */
async function wipeAcross(page, rows = 5) {
  const glass = await page.evaluate(() => {
    const { window: at, width, height } = window.__game.room;
    return { left: at.x / width, right: (at.x + at.width) / width, top: at.y / height, bottom: (at.y + at.height) / height };
  });
  for (let row = 0; row < rows; row += 1) {
    const y = glass.top + ((row + 0.5) / rows) * (glass.bottom - glass.top);
    await moveGloveTo(page, GLOVE, row % 2 ? glass.left + 0.05 : glass.right - 0.05, y);
    await page.waitForTimeout(1300);
    await moveGloveTo(page, GLOVE, row % 2 ? glass.right - 0.05 : glass.left + 0.05, y);
    await page.waitForTimeout(1300);
  }
  await stopMoving(page);
}

test('a real open hand wipes the window clean, and brings the ship home', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, { reach: 'none' });
  // There's nothing to wait for: the first ship is calling as soon as the game starts.
  await storyIs(page, 'frost');
  await expect(page.locator('#story-line')).toContainText('Frost');
  await page.waitForTimeout(1200);
  await shot(page, 'l2-first-ship');

  await wipeAcross(page, 3);
  const { share } = await storm(page);
  expect(share).toBeGreaterThan(0.2);
  await shot(page, 'l3-wiping');

  // The rest of it, wherever the mud is left.
  await page.evaluate(() => {
    const { storm: rules } = window.__game;
    const { mud } = rules;
    for (let x = 0; x < 1; x += 0.04) for (let y = 0; y < 0.8; y += 0.04) rules.wipe(x, y, 0.08, 0.08);
    return mud.share;
  });
  await expect(page.locator('#story-line')).toContainText('Safe');
  await expect.poll(() => page.evaluate(() => window.__game.room.beam), { timeout: 5000 }).toBeGreaterThan(0.3);
  await page.waitForTimeout(700);
  await shot(page, 'l4-beam');
  // The next one is calling only moments later.
  const clean = Date.now();
  await storyIs(page, 'kit');
  expect(Date.now() - clean).toBeLessThan(6000);
  await expect(page.locator('#chip-ships')).toHaveText('1 of 4');
  await expect.poll(async () => (await storm(page)).index, { timeout: 15_000 }).toBe(1);
});

test('a closed hand doesn\'t wipe anything, and the child is told to open it', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page, GAME, { reach: 'none' });
  await storyIs(page, 'frost');
  await show(page, null, 'fist', { scale: 0.7 });
  await expect.poll(async () => (await hands(page)).right.status, { timeout: 15_000 }).toBe('closed');
  await page.waitForTimeout(300);
  const before = (await storm(page)).share;
  await page.evaluate(() => {
    let x = -200;
    window.__fist = setInterval(() => {
      x = x > 200 ? -200 : x + 40;
      window.__camera.show({ left: null, right: 'fist', scale: 0.7, rightOffsetX: x });
    }, 60);
  });
  await page.waitForTimeout(3000);
  expect((await storm(page)).share).toBe(before);
  await expect(page.locator('#prompt-text')).toHaveText('Open your hand to wipe!', { timeout: 10_000 });
  await shot(page, 'l5-fist');
  await page.evaluate(() => clearInterval(window.__fist));
});

test('all the ships home ends in calm, and the finish', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, { ships: 2 });
  await storyIs(page, 'frost');
  const clean = () => page.evaluate(() => {
    const { storm: rules } = window.__game;
    for (let x = 0; x <= 1; x += 0.03) for (let y = 0; y <= 1; y += 0.03) rules.wipe(x, y, 0.08, 0.08);
  });
  await clean();
  await expect.poll(async () => (await storm(page)).home, { timeout: 20_000 }).toBe(1);
  await storyIs(page, 'bramble');
  await page.waitForTimeout(1000);
  await shot(page, 'l6-calmer');
  await clean();
  await expect.poll(async () => (await storm(page)).home, { timeout: 20_000 }).toBe(2);
  await waitForScreen(page, 'finish');
  await expect(page.locator('#screen-finish')).toContainText('You saved every ship!');
  await shot(page, 'l7-finish');
});

test('the window is on the side of the hand in play', async ({ page }) => {
  await startPlaying(page, GAME, { hands: 'left', reach: 'lots' }, ['open', null, { scale: 0.7 }]);
  const { left, right, width } = await page.evaluate(() => {
    const { window: at, width: wide } = window.__game.room;
    return { left: at.x, right: at.x + at.width, width: wide };
  });
  expect(left).toBeLessThan(width * 0.1);
  expect(right).toBeLessThan(width * 0.7);
});
