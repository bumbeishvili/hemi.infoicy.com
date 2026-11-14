// A child's affected hand may never open fully. The hand check sets that hand's own line,
// and a fist must never pass it.
import {
  car,
  expect,
  hands,
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

test('a partly open hand can drive once the check knows it is that hand\'s best', async ({ page }) => {
  await openGame(page);
  await show(page, null, 'relaxed');
  await reachRace(page);

  const { right } = await hands(page);
  console.log(`best ${right.best.toFixed(2)}, target ${right.target.toFixed(2)}`);
  expect(right.best).toBeLessThan(0.9);
  expect(right.target).toBeLessThan(0.76);

  await waitForHand(page, 'open');
  await waitUntilMoving(page);
  await shot(page, '10-partly-open-hand-driving');

  // That same hand as a fist still stops the car.
  await show(page, null, 'fist');
  await waitForHand(page, 'closed');
  await waitUntilStopped(page);
  await shot(page, '11-partly-open-hand-fist');
});

test('a hand asked to reach close to its best cannot get by on a looser opening', async ({ page }) => {
  // This hand opens fully in the check and is held to 95% of that. The "relaxed" photo
  // is a loosely open hand with curved fingers, which passes at the default 80%.
  await openGame(page, { strictness: { right: 0.95 } });
  await show(page, null, 'open');
  await reachRace(page);
  await waitForHand(page, 'open');

  await show(page, null, 'relaxed');
  await waitForHand(page, 'closed');
  await waitUntilStopped(page);
  expect((await hands(page)).drive).toBe(0);
});

test('the check waits for the hand and never counts time without it', async ({ page }) => {
  await openGame(page);
  await show(page, null, null);
  await page.locator('#start').click();
  await waitForScreen(page, 'check');
  await expect(page.locator('#prompt')).toHaveText(/Show your right hand!/, { timeout: 20_000 });
  await page.waitForTimeout(1500);
  expect(await screenName(page)).toBe('check');
  expect(await page.locator('#check-progress-fill').evaluate((el) => el.style.width)).toBe('0%');

  await show(page, null, 'open');
  await expect(page.locator('#prompt')).toHaveText(/Open your hand as wide as you can!/);
  await waitForScreen(page, 'countdown');
});

test('the other hand showing doesn\'t count towards the check', async ({ page }) => {
  await openGame(page);
  await show(page, 'open', null);
  await page.locator('#start').click();
  await waitForScreen(page, 'check');
  await expect(page.locator('#prompt')).toHaveText(/Show your right hand!/, { timeout: 20_000 });
  await page.waitForTimeout(1200);
  expect(await page.locator('#check-progress-fill').evaluate((el) => el.style.width)).toBe('0%');
});

test('a fist in the check gets a second try, then the floor still protects the rule', async ({ page }) => {
  await openGame(page);
  await show(page, null, 'fist');
  await page.locator('#start').click();
  await waitForScreen(page, 'check');
  await expect(page.locator('#prompt')).toHaveText(/One more try/, { timeout: 30_000 });
  await waitForScreen(page, 'countdown');
  await waitForScreen(page, 'playing');

  const { right } = await hands(page);
  expect(right.best).toBeLessThan(0.35);
  expect(right.target).toBe(0.35);

  await page.waitForTimeout(1500);
  expect((await hands(page)).right.status).toBe('closed');
  expect((await car(page)).speed).toBe(0);

  await page.locator('#open-panel').click();
  await expect(page.locator('.panel-note.is-visible')).toContainText('so that a fist can never count as open');
  await shot(page, '12-panel-below-floor');
  await page.locator('#close-panel').click();

  await show(page, null, 'open');
  await waitForHand(page, 'open');
  await waitUntilMoving(page);
});
