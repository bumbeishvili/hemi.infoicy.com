// A fist and then an open hand with the other hand makes the car fly, with turbo, at any time. The hand in
// play still has to be open for the car to go. Real photos, real tracker.
import { car, expect, openGame, reachRace, shot, show, test, waitForHand, waitUntilStopped } from './helpers.js';

const state = (page) => page.evaluate(() => {
  const { race, monitor } = window.__game;
  return {
    other: monitor.snapshot.other.status,
    turboOn: race.turbo.active,
    level: race.turbo.level,
    flying: race.soaring,
    lift: race.lift,
    flames: race.player.flames.some((flame) => flame.visible),
  };
});

/** Driving with the right hand loosely open, and the left hand open too. */
async function raceWithBothHands(page) {
  await openGame(page, { strictness: { right: 0.5 } });
  await show(page, null, 'open');
  await reachRace(page);
  await show(page, 'open', 'relaxed');
  await waitForHand(page, 'open');
  await expect.poll(async () => (await state(page)).other, { timeout: 15_000 }).toBe('open');
  await expect.poll(async () => (await car(page)).speed, { timeout: 15_000 }).toBeGreaterThan(12);
}

async function fistThenOpen(page) {
  await show(page, 'fist', 'relaxed');
  await expect.poll(async () => (await state(page)).other, { timeout: 15_000 }).toBe('closed');
  await show(page, 'open', 'relaxed');
}

test('a fist and then an open hand with the other hand makes the car fly, with turbo', async ({ page }) => {
  await raceWithBothHands(page);
  // The highest the car gets, watched every frame, as a flight only lasts about three seconds.
  await page.evaluate(() => {
    window.__highest = 0;
    const watch = () => {
      window.__highest = Math.max(window.__highest, window.__game.race.lift);
      requestAnimationFrame(watch);
    };
    watch();
  });
  await fistThenOpen(page);

  await expect.poll(async () => (await state(page)).flying, { timeout: 10_000, intervals: [50] }).toBe(true);
  const up = await state(page);
  expect(up.turboOn).toBe(true);
  expect(up.flames).toBe(true);
  await expect(page.locator('#toast')).toHaveText('Fly!');
  await shot(page, 'r-second-hand-flying');
  await expect.poll(() => page.evaluate(() => window.__highest), { timeout: 5000 }).toBeGreaterThan(4);
  await expect.poll(async () => (await car(page)).speed, { timeout: 5000 }).toBeGreaterThan(22);

  // It lands, and it works again.
  await expect.poll(async () => (await state(page)).flying, { timeout: 10_000 }).toBe(false);
  expect((await state(page)).lift).toBeLessThan(0.5);
  await fistThenOpen(page);
  await expect.poll(async () => (await state(page)).flying, { timeout: 10_000, intervals: [50] }).toBe(true);
});

test('it works with turbo already going, but not while the hand in play is closed', async ({ page }) => {
  await raceWithBothHands(page);
  await expect.poll(async () => (await state(page)).turboOn, { timeout: 10_000, intervals: [50] }).toBe(true);
  await fistThenOpen(page);
  await expect.poll(async () => (await state(page)).flying, { timeout: 10_000, intervals: [50] }).toBe(true);
  await expect.poll(async () => (await state(page)).flying, { timeout: 10_000 }).toBe(false);

  // The car stopped, with the hand in play closed: no flight. As the pictures change, the tracker can mix
  // the two hands up for a moment, so this waits until the car has really stopped.
  await show(page, 'open', 'fist');
  await waitForHand(page, 'closed');
  await waitUntilStopped(page);
  await expect.poll(async () => (await state(page)).flying, { timeout: 10_000 }).toBe(false);
  await show(page, 'fist', 'fist');
  await expect.poll(async () => (await state(page)).other, { timeout: 15_000 }).toBe('closed');
  await show(page, 'open', 'fist');
  await expect.poll(async () => (await state(page)).other, { timeout: 15_000 }).toBe('open');
  await page.waitForTimeout(800);
  const after = await state(page);
  expect(after.flying).toBe(false);
  expect(after.turboOn).toBe(false);
});
