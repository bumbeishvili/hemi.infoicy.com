// Hand shapes: a grown-up can choose what makes a game's active move, like pointing to drive. The passive move is
// always the closed hand. Real photos go through the real model, the real tracker and the real game.
import { expect, openGame, reachRace, shot, show, test, waitForHand, waitUntilMoving, waitUntilStopped } from './helpers.js';

const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('camera-games-settings')).shapes);

test('pointing can be chosen to drive, and then only pointing drives, and any other hand slows down', async ({ page }) => {
  await openGame(page);
  await expect(page.locator('#shape-note')).toBeHidden();
  await page.locator('#open-panel').click();
  await expect(page.locator('.shapes legend')).toHaveText('Hand shapes');
  // Only the active move has a choice: slowing down is always the closed hand.
  await expect(page.locator('.shape-move-name')).toHaveText(['Drive']);
  await expect(page.locator('.shapes-rest')).toHaveText('Slow down: any other hand, as when it rests.');
  await expect(page.locator('input[name="shape-open"][value="open"]')).toBeChecked();

  await page.locator('input[name="shape-open"][value="point"]').check();
  // How open counts as open is only for the open hand.
  await expect(page.locator('.panel-hand[data-side="right"] .strictness')).toBeHidden();
  await shot(page, 'shapes-01-panel-pointing-drives');
  await page.locator('#close-panel').click();
  await expect(page.locator('#shape-note')).toHaveText('Drive: Pointing');
  expect(await saved(page)).toEqual({ 'high-five-racers': { open: 'point' } });

  await show(page, null, 'pointing');
  await page.locator('#start').click();
  // The hand check asks for the shape, and shows it.
  await expect(page.locator('#prompt-text')).toHaveText('Point with one finger!');
  await expect(page.locator('.hand-demo')).toBeVisible();
  await expect(page.locator('.hand-demo [data-finger="index"]')).toHaveClass(/is-up/);
  await expect(page.locator('.hand-demo [data-finger="middle"]')).not.toHaveClass(/is-up/);
  await shot(page, 'shapes-02-check-asks-for-pointing');
  await expect.poll(() => page.evaluate(() => window.__game.screen), { timeout: 60_000 }).toBe('playing');
  await waitForHand(page, 'open');
  await waitUntilMoving(page);

  // A whole open hand is any other hand now: it slows down, and it's asked for the shape, which is shown too.
  await show(page, null, 'open');
  await waitForHand(page, 'closed');
  await waitUntilStopped(page);
  await expect(page.locator('#prompt-text')).toHaveText('Point with one finger!');
  await expect(page.locator('.hand-demo')).toBeVisible();
  await shot(page, 'shapes-03-open-hand-asked-to-point');

  await show(page, null, 'pointing');
  await waitUntilMoving(page);
  await expect(page.locator('.hand-demo')).toBeHidden();
  // And a fist slows down, as always.
  await show(page, null, 'fist');
  await waitUntilStopped(page);
});

test('a grown-up can choose the fingers, and that shape drives', async ({ page }) => {
  await openGame(page);
  await page.locator('#open-panel').click();
  await page.locator('input[name="shape-open"][value="fingers"]').check();
  const box = (finger) => page.locator(`.shape-fingers input[value="${finger}"]`);
  await expect(box('thumb')).toBeChecked();
  await expect(box('index')).toBeChecked();
  // The last finger can't be taken away: a shape needs one straight.
  await box('thumb').uncheck();
  await box('index').click();
  await expect(box('index')).toBeChecked();
  await box('middle').check();
  expect(await saved(page)).toEqual({ 'high-five-racers': { open: { fingers: ['index', 'middle'] } } });
  await shot(page, 'shapes-04-own-fingers');
  await page.locator('#close-panel').click();
  await expect(page.locator('#shape-note')).toHaveText('Drive: Index + Middle');

  await show(page, null, 'victory');
  await reachRace(page);
  await waitForHand(page, 'open');
  await waitUntilMoving(page);
  await show(page, null, 'pointing');
  await waitForHand(page, 'closed');
  await expect(page.locator('#prompt-text')).toHaveText('Show the fingers in the picture!');
});

test('shapes are for each game, and one whose closed hand does nothing says any other hand rests', async ({ page }) => {
  await openGame(page, { shapes: { 'high-five-racers': { open: 'thumb' } } }, 'balloon-pop');
  expect(await page.evaluate(() => window.__game.monitor.right.shapes.open.id)).toBe('open');
  await expect(page.locator('#shape-note')).toBeHidden();
  await page.locator('#open-panel').click();
  await expect(page.locator('.shape-move-name')).toHaveText(['Pop']);
  await expect(page.locator('.shapes-rest')).toHaveText('Any other hand rests.');
  await page.locator('input[name="shape-open"][value="two"]').check();
  expect(await saved(page)).toEqual({ 'high-five-racers': { open: 'thumb' }, 'balloon-pop': { open: 'two' } });
});
