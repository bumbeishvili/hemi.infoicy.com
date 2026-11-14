// Turbo comes by itself: keeping the hand open fills the meter, and when it's full there are flames, more
// speed and a wider view for a few seconds. Then it fills again. A closed hand pauses it.
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
  waitUntilStopped,
} from './helpers.js';

const turbo = (page) => page.evaluate(() => {
  const { race } = window.__game;
  return {
    on: race.turbo.active,
    level: race.turbo.level,
    flames: race.player.flames.some((flame) => flame.visible),
    fov: race.camera.fov,
    state: document.getElementById('turbo').dataset.state,
  };
});

/** A relaxed hand counts as open with a lower line. Turbo doesn't care how wide it is, only that it's open. */
async function raceRelaxed(page) {
  await openGame(page, { strictness: { right: 0.5 } });
  await show(page, null, 'open');
  await reachRace(page);
  await show(page, null, 'relaxed');
  await waitForHand(page, 'open');
}

test('keeping the hand open fills the meter, turbo goes by itself, and then it fills again', async ({ page }) => {
  await raceRelaxed(page);
  const before = await turbo(page);
  await expect.poll(async () => (await turbo(page)).level, { timeout: 8000, intervals: [50] }).toBeGreaterThan(0.2);
  await expect.poll(async () => (await turbo(page)).on, { timeout: 8000, intervals: [50] }).toBe(true);
  await expect.poll(async () => (await car(page)).speed, { timeout: 8000 }).toBeGreaterThan(27);
  const on = await turbo(page);
  expect(on.flames).toBe(true);
  expect(on.state).toBe('on');
  await expect.poll(async () => (await turbo(page)).fov, { timeout: 8000 }).toBeGreaterThan(before.fov + 4);
  await shot(page, 'r-turbo-on');

  // A few seconds later it's over, and the meter starts filling again.
  await expect.poll(async () => (await turbo(page)).on, { timeout: 8000 }).toBe(false);
  await expect.poll(async () => (await turbo(page)).flames, { timeout: 3000 }).toBe(false);
  await expect.poll(async () => (await turbo(page)).level, { timeout: 8000 }).toBeGreaterThan(0.1);
});

test('a hand that can\'t open far gets turbo too', async ({ page }) => {
  await openGame(page);
  await show(page, null, 'relaxed');
  await reachRace(page);
  const { right } = await hands(page);
  expect(right.best).toBeLessThan(0.9);
  await expect.poll(async () => (await turbo(page)).on, { timeout: 15_000 }).toBe(true);
});

for (const [name, pose] of [['a fist', 'fist'], ['pointing', 'pointing'], ['no hand', null]]) {
  test(`${name} stops turbo at once, and pauses the meter`, async ({ page }) => {
    await openGame(page);
    await show(page, null, 'open');
    await reachRace(page);
    await expect.poll(async () => (await turbo(page)).on, { timeout: 15_000 }).toBe(true);

    await show(page, null, pose);
    await expect.poll(async () => (await hands(page)).handOpen).toBe(false);
    // As soon as the hand no longer counts as open, turbo has stopped.
    const stopped = await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const { race } = window.__game;
        resolve({ on: race.turbo.active, wanted: race.drive });
      }));
    }));
    expect(stopped).toEqual({ on: false, wanted: 0 });
    await waitUntilStopped(page);
    const lowest = await turbo(page);
    expect(lowest.on).toBe(false);
    expect(lowest.flames).toBe(false);
    expect(lowest.state).toBe('idle');
    // Resting takes nothing away, and fills nothing either.
    await page.waitForTimeout(1500);
    expect((await turbo(page)).level).toBe(lowest.level);
  });
}

test('closing the hand reads clearly: brake lights, the nose going down, slowing, and it\'s friendly', async ({ page }) => {
  await openGame(page);
  await show(page, null, 'open');
  await reachRace(page);
  await waitForHand(page, 'open');
  await expect.poll(async () => (await car(page)).speed, { timeout: 15_000 }).toBeGreaterThan(20);
  const lamps = () => page.evaluate(() => window.__game.race.player.braking);
  expect(await lamps()).toBeLessThan(0.05);

  await show(page, null, 'fist');
  await waitForHand(page, 'closed');
  await expect.poll(lamps, { timeout: 3000 }).toBeGreaterThan(0.8);
  await shot(page, 'r-braking');
  await waitUntilStopped(page);
  await expect(page.locator('#prompt')).toHaveText(/Open your right hand!/);
  expect((await car(page)).place).toBeGreaterThan(0);

  await show(page, null, 'open');
  await waitForHand(page, 'open');
  await expect.poll(lamps, { timeout: 3000 }).toBeLessThan(0.2);
});
