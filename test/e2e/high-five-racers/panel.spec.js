// The grown-ups' panel: pausing, adjusting the hand's line, and remembering settings.
import {
  car,
  expect,
  hands,
  openGame,
  reachRace,
  shot,
  show,
  test,
  waitForHand,
  waitForScreen,
  waitUntilMoving,
  waitUntilStopped,
} from './helpers.js';

const rightSlider = (page) => page.locator('.panel-hand[data-side="right"] .strictness input');

function setSlider(locator, value) {
  return locator.evaluate((input, next) => {
    input.value = next;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, String(value));
}

async function raceWithOpenHand(page, settings = {}) {
  await openGame(page, settings);
  await show(page, null, 'open');
  await reachRace(page);
  await waitForHand(page, 'open');
  await waitUntilMoving(page);
}

test('opening the panel pauses the race and closing it carries on', async ({ page }) => {
  await raceWithOpenHand(page);

  await page.locator('#open-panel').click();
  await expect(page.locator('#panel')).toBeVisible();
  const { distance } = await car(page);
  await page.waitForTimeout(600);
  expect((await car(page)).distance).toBe(distance);
  await expect(page.locator('.panel-hand[data-side="right"] .panel-state')).toHaveText('✓ Open');
  await expect(page.locator('.panel-hand[data-side="right"] .live-numbers')).toContainText('best today');
  await shot(page, '40-panel');

  await page.locator('#close-panel').click();
  await expect.poll(async () => (await car(page)).distance).toBeGreaterThan(distance);
});

test('Escape closes the panel and resumes the race', async ({ page }) => {
  await raceWithOpenHand(page);
  await page.locator('#open-panel').click();
  const { distance } = await car(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#panel')).toBeHidden();
  await expect.poll(async () => (await car(page)).distance).toBeGreaterThan(distance);
});

test('moving the hand\'s line changes what counts as open', async ({ page }) => {
  // Starts strict enough that the loosely open "relaxed" photo doesn't pass.
  await openGame(page, { strictness: { right: 0.95 } });
  await show(page, null, 'open');
  await reachRace(page);
  await waitForHand(page, 'open');

  await show(page, null, 'relaxed');
  await waitForHand(page, 'closed');
  await waitUntilStopped(page);

  const before = await hands(page);
  await page.locator('#open-panel').click();
  await setSlider(rightSlider(page), 50);
  await expect(page.locator('.panel-hand[data-side="right"] .strictness output')).toHaveText('50% of best');
  await page.locator('#close-panel').click();

  await expect.poll(async () => (await hands(page)).right.target).toBeLessThan(before.right.target);

  // The relaxed hand now clears the lower line.
  await waitForHand(page, 'open');
  await waitUntilMoving(page);

  // A fist still does not.
  await show(page, null, 'fist');
  await waitForHand(page, 'closed');
  await waitUntilStopped(page);
});

test('settings are remembered, and nothing about the child is stored', async ({ page }) => {
  await openGame(page);
  await page.locator('#open-panel').click();
  await setSlider(rightSlider(page), 65);
  await page.locator('input[name="steering"][value="auto"]').check();
  await page.locator('input[name="laps"][value="4"]').check();
  await page.locator('#setting-sound').check();
  await page.locator('#close-panel').click();

  await page.reload();
  await expect(page.locator('#start')).toBeVisible();
  await page.locator('#open-panel').click();
  await expect(rightSlider(page)).toHaveValue('65');
  await expect(page.locator('input[name="steering"][value="auto"]')).toBeChecked();
  await expect(page.locator('input[name="laps"][value="4"]')).toBeChecked();
  await expect(page.locator('#setting-sound')).toBeChecked();

  const stored = await page.evaluate(() => ({ ...localStorage }));
  expect(Object.keys(stored)).toEqual(['camera-games-settings']);
  expect(Object.keys(JSON.parse(stored['camera-games-settings'])).sort()).toEqual(
    ['fighter', 'hands', 'language', 'laps', 'reach', 'rivals', 'sound', 'steering', 'strictness', 'voice'],
  );
});

test('a saved setting that is no longer a choice doesn\'t stop the game loading', async ({ page }) => {
  await openGame(page, { laps: 3, language: 'fr' });
  await expect(page.locator('#start')).toBeVisible();
  await page.locator('#open-panel').click();
  await expect(page.locator('input[name="hands"][value="right"]')).toBeChecked();
});

test('checking the hand again mid-race returns to the same race', async ({ page }) => {
  await raceWithOpenHand(page);
  const { distance } = await car(page);

  await page.locator('#open-panel').click();
  await page.locator('#recheck').click();
  await waitForScreen(page, 'check');
  await waitForScreen(page, 'playing');
  expect((await car(page)).distance).toBeGreaterThanOrEqual(distance);
  await expect.poll(async () => (await car(page)).speed).toBeGreaterThan(5);
});
