// Playing Giraffe's Riddle Doors: an open hand over a piece picks it up, the piece goes with the hand while it stays
// open, and held in the gap in the door for a moment it's tried there. The piece that fits opens the door, and one
// that doesn't goes back to its shelf, greyed, and blows a candle out. A hand that closes, or goes, leaves the piece
// where it is. With real photos of a hand, open and closed, through the real tracker.
import { shot } from '../helpers.js';
import { expect, expectSoon, FIST, GENTLE, handNow, leadHand, NO_HAND, show, startPlaying, state, stopHand, test, waitForScreen } from './helpers.js';

const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// The pretend child takes a piece that doesn't fit to the gap, as a guess would.
const guess = '(doors, at) => doors.wants(at, { right: false })';

test('an open hand carries the piece that fits to the gap, held there it opens the door, and every door open ends the game', async ({ page }) => {
  test.setTimeout(300_000);
  await startPlaying(page);
  const start = await state(page);
  expect(start.total).toBe(6);
  expect(start.kinds).toEqual(Array(6).fill('rows'));
  expect(start.size).toBe(2);
  expect(start.tiles).toHaveLength(3);
  expect(start.tiles.filter((tile) => tile.right)).toHaveLength(1);
  expect(start.candles).toEqual({ left: 3, total: 3 });
  await expect(page.locator('#story-line')).toHaveText('Each door is missing a piece. Which one fits?');
  await expect(page.locator('#chip-doors')).toHaveText('0 of 6');
  await expect(page.locator('#chip-candles .candle:not(.is-out)')).toHaveCount(3);
  // The little film of what to do shows until the first door opens.
  await expect(page.locator('.doors-film')).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, 'doors-start');

  // The hand goes to the piece that fits, and it's in the hand, going with it.
  await leadHand(page);
  await expectSoon(async () => (await state(page)).held).not.toBe(null);
  const picked = await state(page);
  expect(picked.tiles.find(({ id }) => id === picked.held).right).toBe(true);
  // Held in the gap, a ring fills round it, and the piece goes in: the door opens.
  await expectSoon(async () => (await state(page)).trying, { timeout: 20_000 }).toBeGreaterThan(0.2);
  await shot(page, 'doors-trying');
  await expectSoon(async () => (await state(page)).phase).toBe('open');
  await page.waitForTimeout(1100);
  await shot(page, 'doors-opening');
  const opened = await state(page);
  expect(opened.opened).toBe(1);
  expect(opened.stats.firstTry).toBe(1);
  expect(opened.stats.prizes.star).toBe(1);
  await expect(page.locator('#chip-doors')).toHaveText('1 of 6');
  await expect(page.locator('.doors-film')).toBeHidden();

  // One door after another, and the finish card comes.
  await waitForScreen(page, 'finish', 240_000);
  await stopHand(page);
  const end = await state(page);
  expect(end.opened).toBe(6);
  expect(end.done).toBe(true);
  expect(end.lost).toBe(false);
  // A hand on its way to the piece that fits passes over others without picking them up, so none was tried.
  expect(end.stats.wrong).toBe(0);
  await expect(page.locator('#screen-finish h2')).toHaveText('Every door is open!');
  await expect(page.locator('#finish-prizes')).toHaveText('⭐ 6');
  await expect(page.locator('#play-again')).not.toHaveText('Try again');
  await shot(page, 'doors-finish');
});

test('a piece that doesn’t fit goes back to its shelf greyed and blows a candle out, and with all three out the game is lost, kindly', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, { levels: { 'riddle-doors': 3 } });
  const first = await state(page);
  expect(first.kind).toBe('count');
  expect(first.size).toBe(3);
  expect(first.tiles).toHaveLength(4);
  await leadHand(page, { target: guess });
  await expectSoon(async () => (await state(page)).stats.wrong).toBe(1);
  const once = await state(page);
  const tried = once.tiles.find((tile) => tile.state === 'tried');
  expect(tried.right).toBe(false);
  expect(once.candles.left).toBe(2);
  expect(once.phase).toBe('play');
  await expect(page.locator('#chip-candles .candle.is-out')).toHaveCount(1);
  // It goes back where it lay, and can't be picked up again: the next guess is another piece.
  await expectSoon(async () => {
    const now = await state(page);
    const back = now.tiles.find(({ id }) => id === tried.id);
    return gap(back, back.home) < 0.001 && back.state === 'tried';
  }).toBe(true);
  await page.waitForTimeout(250);
  await shot(page, 'doors-wrong');
  await expectSoon(async () => (await state(page)).stats.wrong).toBe(2);
  // The second wrong piece of a door of four leaves only the one that fits, so the third is on the next door.
  await leadHand(page);
  await expectSoon(async () => (await state(page)).index).toBe(1);
  await leadHand(page, { target: guess });
  await expectSoon(async () => (await state(page)).phase).toBe('dark');
  await page.waitForTimeout(1200);
  await shot(page, 'doors-dark');
  await waitForScreen(page, 'finish');
  await stopHand(page);
  const end = await state(page);
  expect(end.lost).toBe(true);
  expect(end.candles.left).toBe(0);
  await expect(page.locator('#screen-finish h2')).toHaveText('The candles went out before every door was open!');
  await expect(page.locator('#play-again')).toHaveText('Try again');
  // The level stays where it was.
  expect(await page.evaluate(() => window.__game.session.levels.current)).toBe(3);
});

test('in the gentle game the candles never go out: every piece can be tried, and every door opens in the end', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, { ...GENTLE, levels: { 'riddle-doors': 2 } });
  const start = await state(page);
  expect(start.candles).toBe(null);
  await expect(page.locator('#chip-candles-box')).toBeHidden();
  // Every piece that doesn't fit, on door after door, and the game goes on.
  await leadHand(page, { target: `(doors, at) => doors.wants(at, { right: false }) ?? doors.wants(at)` });
  await expectSoon(async () => (await state(page)).stats.wrong, { timeout: 90_000 }).toBeGreaterThanOrEqual(5);
  expect((await state(page)).phase).not.toBe('dark');
  await waitForScreen(page, 'finish', 200_000);
  await stopHand(page);
  const end = await state(page);
  expect(end.lost).toBe(false);
  expect(end.opened).toBe(6);
  await expect(page.locator('#screen-finish h2')).toHaveText('Every door is open!');
});

test('a hand that closes, or goes, leaves the piece where it is, and a wobbly hand that blinks shut still plays', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, { levels: { 'riddle-doors': 4 } });
  // Take a piece some way across, and close the hand on the way: it's put down there.
  await leadHand(page, { target: `(doors, at) => (doors.held ? { x: 1, y: 0.93 } : doors.wants(at))` });
  await expectSoon(async () => {
    const now = await state(page);
    return now.held !== null && now.glove && gap(now.glove, { x: 1, y: 0.93 }) < 0.06;
  }, { timeout: 30_000 }).toBe(true);
  const held = (await state(page)).held;
  await handNow(page, 'fist');
  await expectSoon(async () => (await state(page)).held).toBe(null);
  const dropped = (await state(page)).tiles.find(({ id }) => id === held);
  expect(dropped.state).toBe('loose');
  expect(gap(dropped, dropped.home)).toBeGreaterThan(0.2);
  await show(page, ...NO_HAND);
  await page.waitForTimeout(800);
  expect((await state(page)).tiles.find(({ id }) => id === held).state).toBe('loose');
  await show(page, ...FIST);
  await page.waitForTimeout(400);
  // A child's hand isn't still, and the tracker reads an open hand as closed now and then: it still opens the door.
  await leadHand(page, { wobble: 14, blink: 1.3 });
  await expectSoon(async () => (await state(page)).opened, { timeout: 60_000 }).toBe(1);
  await stopHand(page);
});
