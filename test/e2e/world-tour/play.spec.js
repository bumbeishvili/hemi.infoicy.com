// Playing Giraffe's World Tour: an open hand held over the country that's asked for flies the plane there, the open
// hand paints its flag with the paint landing only where that colour goes, and lifted up it raises the flag. Three
// flags raised win the journey. With real photos of hands through the real tracker.
import { shot } from '../helpers.js';
import { expect, expectSoon, leadHands, startPlaying, state, stopHands, test, waitForScreen, waitForState } from './helpers.js';

test('a journey: each country is found, flown to, painted and its flag raised, and three flags win it', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page);
  await waitForState(page, 'find');
  let now = await state(page);
  expect(now.target).toBe('UKR');
  expect([...now.choices].sort()).toEqual(['DEU', 'POL', 'UKR']);
  expect(now.cans).toBe(5);
  await page.waitForTimeout(1500);
  await shot(page, 'world-tour-find');

  await leadHands(page, { aim: 'play' });
  await waitForState(page, 'fly');
  await page.waitForTimeout(900);
  await shot(page, 'world-tour-fly');
  await waitForState(page, 'land');
  await page.waitForTimeout(1200);
  await shot(page, 'world-tour-land');
  await waitForState(page, 'paint');
  await expectSoon(async () => (await state(page)).progress).toBeGreaterThan(0.3);
  await shot(page, 'world-tour-paint');
  await waitForState(page, 'raise');
  await expectSoon(async () => (await state(page)).raisedTo).toBeGreaterThan(0.3);
  await shot(page, 'world-tour-raise');
  await waitForState(page, 'settle');
  await shot(page, 'world-tour-raised');
  await expectSoon(async () => (await state(page)).flown).toEqual(['UKR']);

  await expectSoon(async () => (await state(page)).flown.length, { timeout: 120_000 }).toBe(2);
  await waitForState(page, 'find');
  await page.waitForTimeout(1500);
  await shot(page, 'world-tour-find-third');
  await waitForScreen(page, 'finish');
  now = await state(page);
  expect(now.state).toBe('won');
  expect(now.flown).toEqual(['UKR', 'POL', 'DEU']);
  expect(now.cans).toBe(5);
  await stopHands(page);
  await expect(page.locator('#screen-finish h2')).toHaveText('What a journey!');
  await shot(page, 'world-tour-finish');
});
