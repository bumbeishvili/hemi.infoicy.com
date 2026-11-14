// Playing Giraffe's Garden: the open hand holds the watering can, turning the hand over pours, and the plant under the
// water grows and flowers. With real photos of one right hand, its palm and its back, through the real tracker.
import { openGame, shot } from '../helpers.js';
import { BACK, expect, expectSoon, FIST, GAME, GENTLE, judge, NO_HAND, PALM, show, startPlaying, state, stopHand, test, waitForScreen, waterHand, watchBrightness } from './helpers.js';

test('the open palm holds the can, turning the hand over pours, the plant under it flowers, and every one in flower ends the garden', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, { plants: 4 });
  const start = await state(page);
  // The hand check saw the palm, so that's where turning starts from.
  expect(start.start).toMatchObject({ sign: 1, checked: true });
  expect(start.plants).toHaveLength(4);
  expect(start.flowers).toBe(0);
  await expectSoon(async () => (await state(page)).holding, { timeout: 10_000 }).toBe(true);
  const held = await state(page);
  expect(held.flow).toBe(0);
  expect(held.degrees).toBeLessThan(20);
  await expect(page.locator('#story-line')).toHaveText('My garden is so thirsty! Can you water it?');
  await expect(page.locator('#chip-flowers')).toHaveText('0 of 4');
  await page.waitForTimeout(500);
  await shot(page, 'garden-start');

  // Turned right over, the back of the hand to the camera: the can tips, and the water pours.
  await show(page, ...BACK);
  await expectSoon(async () => (await state(page)).flow, { timeout: 10_000 }).toBe(1);
  await expectSoon(async () => (await state(page)).degrees, { timeout: 5000 }).toBeGreaterThan(150);
  await expectSoon(async () => (await state(page)).tip, { timeout: 5000 }).toBeGreaterThan(0.9);
  await page.waitForTimeout(400);
  await shot(page, 'garden-pouring');

  // Led to each plant in turn and turned over there, the garden flowers, and the finish card comes.
  await waterHand(page);
  await expectSoon(async () => (await state(page)).flowers, { timeout: 60_000 }).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(300);
  await shot(page, 'garden-first-flower');
  await waitForScreen(page, 'finish');
  await stopHand(page);
  const end = await state(page);
  expect(end.flowers).toBe(4);
  expect(end.pours).toBeGreaterThanOrEqual(4);
  await expect(page.locator('#screen-finish h2')).toHaveText('The garden is in bloom!');
  await expect(page.locator('#finish-hero')).toHaveText('4');
  await expect(page.locator('#sum-right-flowers')).toHaveText('4');
  await page.waitForTimeout(600);
  await shot(page, 'garden-finish');
});

for (const [name, scene] of [['closed', FIST], ['missing', NO_HAND]]) {
  test(`a ${name} hand never pours, and the can waits, for as long as it takes`, async ({ page }) => {
    await startPlaying(page, { plants: 4 });
    await show(page, ...scene);
    await page.waitForTimeout(3000);
    const resting = await state(page);
    expect(resting.flow).toBe(0);
    expect(resting.plants.every((plant) => plant.water === 0)).toBe(true);
    // Back again, palm and then turned over, and it pours.
    await show(page, ...PALM);
    await expectSoon(async () => (await state(page)).holding, { timeout: 10_000 }).toBe(true);
    await show(page, ...BACK);
    await expectSoon(async () => (await state(page)).flow, { timeout: 10_000 }).toBe(1);
  });
}

test('turned right over and back round, the water stops as soon as the palm is back, and the can follows the whole turn', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page, { plants: 4 });
  await expectSoon(async () => (await state(page)).holding, { timeout: 10_000 }).toBe(true);
  const turnTo = (photo, squeeze = 1) => page.evaluate(([right, narrow]) => window.__camera.show({ left: null, right, scale: 0.62, squeeze: narrow }), [photo, squeeze]);
  // A little way round, as much as is wanted: the can is tipped to pour, not all the way.
  await turnTo('palm', 0.78);
  await expectSoon(async () => (await state(page)).flow, { timeout: 10_000 }).toBeGreaterThan(0.5);
  const part = await state(page);
  expect(part.tip).toBeGreaterThan(0.5);
  expect(part.tip).toBeLessThan(0.92);
  // Right over: it tips on, as far as it goes.
  await show(page, ...BACK);
  await expectSoon(async () => (await state(page)).tip, { timeout: 10_000 }).toBeGreaterThan(0.95);
  // Back round through side-on, a moment of each, as a hand turns back, and the palm as it started.
  await page.evaluate(() => {
    window.__watch = [];
    const started = performance.now();
    const look = () => {
      const { game } = window.__game;
      window.__watch.push({ at: performance.now() - started, flow: game.flow, degrees: game.degrees, home: game.turn.sign === game.turn.start.sign });
      if (performance.now() - started < 4000) requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
  const shownAt = async () => page.evaluate(() => performance.now());
  const t0 = await shownAt();
  await turnTo('back', 0.45);
  await page.waitForTimeout(250);
  const side = await shownAt();
  await turnTo('palm', 0.45);
  await page.waitForTimeout(400);
  const palm = await shownAt();
  await turnTo('palm', 1);
  await page.waitForTimeout(1200);
  const watched = await page.evaluate(() => window.__watch);
  const since = (from) => watched.filter((each) => each.at >= from - t0);
  // The palm side, even narrow, is read as the palm side, not as still over: under side-on, not 180 less that.
  const narrowPalm = since(side + 250).filter((each) => each.at < palm - t0);
  expect(narrowPalm.length).toBeGreaterThan(3);
  expect(narrowPalm.every((each) => each.home && each.degrees < 90)).toBe(true);
  // And with the palm back, the water stops within a moment, and stays stopped.
  const stoppedAt = since(palm).find((each) => each.flow === 0);
  expect(stoppedAt, JSON.stringify(watched.slice(-20))).toBeTruthy();
  expect(stoppedAt.at - (palm - t0)).toBeLessThan(400);
  expect(since(palm).filter((each) => each.at > stoppedAt.at).every((each) => each.flow === 0)).toBe(true);
  expect((await state(page)).degrees).toBeLessThan(15);
});

test('a hand check that now and then saw the hand a little wider: the hand held as usual still doesn\'t pour, and turned over and back, it stops', async ({ page }) => {
  test.setTimeout(120_000);
  await openGame(page, { plants: 4 }, GAME);
  // A real hand in the check isn't still: here it looks a little wider for two fifths of the time.
  await page.evaluate(() => {
    const started = performance.now();
    window.__wobble = setInterval(() => {
      const wider = (performance.now() - started) % 300 < 120;
      window.__camera.show({ left: null, right: 'palm', scale: 0.62, squeeze: wider ? 1.15 : 1 });
    }, 20);
  });
  await page.locator('#start').click();
  await waitForScreen(page, 'countdown');
  await page.evaluate(() => clearInterval(window.__wobble));
  await show(page, ...PALM);
  await waitForScreen(page, 'playing');
  await expectSoon(async () => (await state(page)).holding, { timeout: 10_000 }).toBe(true);
  // Held as usual, it reads as not turned, and nothing pours, for as long as it's held so.
  const rest = [];
  for (let i = 0; i < 10; i += 1) {
    await page.waitForTimeout(200);
    rest.push(await state(page));
  }
  expect(Math.max(...rest.map((each) => each.degrees))).toBeLessThan(15);
  expect(rest.every((each) => each.flow === 0)).toBe(true);
  // Turned over it pours, and back, it stops.
  await show(page, ...BACK);
  await expectSoon(async () => (await state(page)).flow, { timeout: 10_000 }).toBe(1);
  await show(page, ...PALM);
  await expectSoon(async () => (await state(page)).flow, { timeout: 1000, intervals: [50] }).toBe(0);
  await page.waitForTimeout(1500);
  expect((await state(page)).flow).toBe(0);
});

/* ---------- the sun drying the garden ---------- */

test('the sun dries the plants while the hand is in the picture and not while it isn\'t, water puts one right, and one left too long wilts', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, { plants: 4 });
  expect((await state(page)).drying).toBe(true);
  // No hand: nothing dries.
  await show(page, ...NO_HAND);
  await page.waitForTimeout(1500);
  const away = (await state(page)).plants.map((plant) => plant.thirst);
  await page.waitForTimeout(3000);
  expect((await state(page)).plants.map((plant) => plant.thirst)).toEqual(away);
  // A hand in the picture, and they all get thirstier. Water on one puts it right.
  await show(page, ...PALM);
  await expectSoon(async () => (await state(page)).plants[0].thirst, { timeout: 10_000 }).toBeGreaterThan(away[0] + 0.02);
  await waterHand(page, { target: '(garden) => garden.aimFor(garden.plants[0])' });
  await expectSoon(async () => (await state(page)).plants[0].water, { timeout: 30_000 }).toBeGreaterThan(0.3);
  const watered = await state(page);
  expect(watered.plants[0].thirst).toBeLessThan(watered.plants[3].thirst);
  await stopHand(page);
  await show(page, ...PALM);
  // The last plant nearly dry: its drop goes orange, and then it wilts, and the garden is over. Nothing flashes.
  await page.evaluate(() => {
    window.__game.garden.plants[3].thirst = 0.97;
  });
  await page.waitForTimeout(400);
  await shot(page, 'garden-thirsty');
  const wilting = judge(await watchBrightness(page, 260));
  console.log('a plant wilting in the sun', JSON.stringify(wilting));
  expect(wilting.biggestStep).toBeLessThan(4);
  expect(wilting.flickeringShare).toBeLessThan(0.01);
  await waitForScreen(page, 'finish');
  const end = await state(page);
  expect([end.lost, end.wilted]).toEqual([true, 3]);
  await expect(page.locator('#screen-finish h2')).toHaveText('A plant wilted in the sun!');
  await expect(page.locator('#play-again')).toHaveText('Try again');
  await expect(page.locator('#level-done-text')).toHaveText('Let’s try level 1 again!');
  await page.waitForTimeout(800);
  await shot(page, 'garden-wilted');
});

test('in the gentle garden nothing dries out, and the grown-ups\' panel can choose it', async ({ page }) => {
  await startPlaying(page, GENTLE);
  await page.waitForTimeout(3000);
  const gentle = await state(page);
  expect(gentle.drying).toBe(false);
  expect(gentle.plants.every((plant) => plant.thirst === 0)).toBe(true);
  await page.locator('#open-panel').click();
  await expect(page.locator('input[name="gardenSun"][value="gentle"]')).toBeChecked();
});
