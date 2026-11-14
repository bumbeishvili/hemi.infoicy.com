// Moving the hand side to side moves the car across the road.
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
  waitUntilMoving,
} from './helpers.js';

async function raceWithOpenHand(page, settings = {}) {
  await openGame(page, settings);
  await show(page, null, 'open');
  await reachRace(page);
  await waitForHand(page, 'open');
  await waitUntilMoving(page);
}

test('moving the hand steers the matching way, measured from where it started', async ({ page }) => {
  await raceWithOpenHand(page, { steering: 'help' });
  expect((await hands(page)).steer).toBe(0);
  expect(Math.abs((await car(page)).lateral)).toBeLessThan(0.5);

  // To the right of the mirror, so the car goes right.
  await show(page, null, 'open', { rightOffsetX: 120 });
  await expect.poll(async () => (await hands(page)).steer).toBeGreaterThan(0.5);
  await expect.poll(async () => (await car(page)).lateral).toBeGreaterThan(3);
  await shot(page, '20-steering-right');

  await show(page, null, 'open', { rightOffsetX: -200 });
  await expect.poll(async () => (await hands(page)).steer).toBeLessThan(-0.5);
  await expect.poll(async () => (await car(page)).lateral).toBeLessThan(-3);
  await shot(page, '21-steering-left');

  // Coming back brings the car gently towards the middle with "a little help".
  await show(page, null, 'open');
  await expect.poll(async () => (await hands(page)).steer).toBe(0);
  await expect.poll(async () => Math.abs((await car(page)).lateral), { timeout: 30_000 }).toBeLessThan(1.2);
});

test('wherever the hand starts counts as straight on', async ({ page }) => {
  await openGame(page, { steering: 'help' });
  // An arm that's most comfortable well towards the middle.
  await show(page, null, 'open', { rightOffsetX: -180 });
  await reachRace(page);
  await waitForHand(page, 'open');
  await waitUntilMoving(page);
  expect((await hands(page)).steer).toBe(0);
});

test('with the car steering itself, the child only has to keep the hand open', async ({ page }) => {
  await raceWithOpenHand(page, { steering: 'auto' });
  // Moving makes no difference in this mode and stars are still caught.
  await show(page, null, 'open', { rightOffsetX: 120 });
  await expect.poll(async () => (await car(page)).stars, { timeout: 30_000 }).toBeGreaterThan(3);
  await shot(page, '22-stars');
});

test('a car that stops does not keep sliding sideways', async ({ page }) => {
  await raceWithOpenHand(page, { steering: 'help' });
  await show(page, null, 'fist', { rightOffsetX: 120 });
  await expect.poll(async () => (await car(page)).speed).toBe(0);
  const { lateral } = await car(page);
  await page.waitForTimeout(800);
  expect((await car(page)).lateral).toBe(lateral);
});
