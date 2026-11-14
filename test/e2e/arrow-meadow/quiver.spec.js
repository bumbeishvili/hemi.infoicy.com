// Arrow Meadow's quiver and targets that don't wait for ever, as the game comes, with photos of two hands going through
// the real tracker: every arrow takes one, an empty quiver before enough targets ends the contest at the same level,
// with Try again, and a target only stands for so long while the hands are in the picture. Gently, nothing is lost.
import { archer, expect, expectSoon, GAME, hands, judge, startPlaying, state, stopArcher, test, waitForScreen, watchBrightness } from './helpers.js';
import { shot } from '../helpers.js';

// The contest as it comes: only so many arrows, and no help with aiming.
const AS_IT_COMES = (level, more = {}) => ({ arrowQuiver: 'quiver', arrowHelp: 'off', levels: { [GAME]: level }, ...more });
// An arc that comes down in the grass, short of everything.
const INTO_THE_GRASS = '() => ({ angle: 1.36, draw: 0.3 })';
const quiver = (page) => page.evaluate(() => {
  const { meadow } = window.__game;
  return { left: meadow.arrowsLeft, full: meadow.quiver, gentle: meadow.gentle, phase: meadow.phase };
});

test('every arrow takes one from the quiver, and an empty quiver before enough targets ends the contest: Try again, at the same level', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, AS_IT_COMES(2, { arrowGoal: 6 }));
  const first = await quiver(page);
  // Six targets at level 2: two and a half arrows each, less a ninth of the way to 1.4.
  expect(first.full).toBe(Math.ceil(6 * (2.5 - 1.1 / 9)));
  await expect(page.locator('#chip-quiver-box')).toBeVisible();
  await expect(page.locator('#chip-quiver')).toHaveText(String(first.full));

  // Real hands, letting arrows go at what the meadow wants hit: each one takes an arrow, hit or miss.
  await archer(page, { every: 0.6 });
  await expectSoon(async () => (await state(page)).stats.shots, { timeout: 60_000 }).toBeGreaterThanOrEqual(2);
  await stopArcher(page);
  const { stats } = await state(page);
  await expectSoon(async () => (await quiver(page)).left).toBe(first.full - stats.shots);
  await expect(page.locator('#chip-quiver')).toHaveText(String(first.full - stats.shots));
  await shot(page, 'arrow-quiver');

  // The last two arrows, into the grass.
  await page.evaluate(() => {
    window.__game.meadow.arrowsLeft = 2;
  });
  await archer(page, { target: INTO_THE_GRASS, every: 0.6, within: 3 });
  await expectSoon(async () => (await quiver(page)).phase, { timeout: 60_000 }).toBe('lost');
  await stopArcher(page);
  expect((await quiver(page)).left).toBe(0);
  await waitForScreen(page, 'finish');
  await expect(page.locator('#screen-finish h2')).toHaveText('Out of arrows! So close!');
  await expect(page.locator('#play-again')).toHaveText('Try again');
  await expect(page.locator('#level-done-text')).toHaveText('Let’s try level 2 again!');
  expect(await page.evaluate(() => window.__game.session.levels.current)).toBe(2);
  await page.waitForTimeout(800);
  await shot(page, 'arrow-out-of-arrows');
});

test('a target only stands for so long while the hands are in the picture, and costs no arrow when it goes', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, AS_IT_COMES(1));
  const plain = () => page.evaluate(() => {
    const target = window.__game.meadow.live.find((each) => each.slot === 'plain');
    return target ? { id: target.id, stood: target.stood ?? 0 } : null;
  });
  // Both hands up, nothing held: the clock runs.
  await hands(page, { string: 'open' });
  await expectSoon(async () => (await plain(page))?.stood ?? 0, { timeout: 20_000 }).toBeGreaterThan(0.5);
  // The hands gone from the picture: it waits.
  await page.evaluate(() => window.__camera.show({ left: null, right: null }));
  await expectSoon(() => page.evaluate(() => window.__game.game.hands.both)).toBe(false);
  const away = await plain(page);
  await page.waitForTimeout(3000);
  expect((await plain(page)).stood).toBeCloseTo(away.stood, 5);
  // Back, and nearly time: it shrinks away, and another comes somewhere new.
  await hands(page, { string: 'open' });
  await expectSoon(() => page.evaluate(() => window.__game.game.hands.both)).toBe(true);
  await page.evaluate(() => {
    const target = window.__game.meadow.live.find((each) => each.slot === 'plain');
    target.stood = 19.5;
  });
  await expectSoon(async () => (await state(page)).happened.leave ?? 0, { timeout: 10_000 }).toBe(1);
  await expectSoon(async () => (await plain(page))?.id ?? away.id, { timeout: 10_000 }).not.toBe(away.id);
  expect((await quiver(page)).left).toBe((await quiver(page)).full);
});

test('gently, there are as many arrows as it takes, and no quiver to count', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, { arrowQuiver: 'gentle', levels: { [GAME]: 10 } });
  const now = await quiver(page);
  expect(now.gentle).toBe(true);
  expect(now.full).toBe(Infinity);
  await expect(page.locator('#chip-quiver-box')).toBeHidden();
  await page.waitForTimeout(2000);
  expect((await state(page)).happened.leave ?? 0).toBe(0);
});

test('nothing flashes as the last arrow lands and the targets go, at level 10', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, AS_IT_COMES(10));
  await page.evaluate(() => {
    window.__game.meadow.arrowsLeft = 1;
  });
  await archer(page, { target: INTO_THE_GRASS, every: 0.4, within: 3 });
  await expectSoon(async () => (await state(page)).stats.shots, { timeout: 60_000 }).toBe(1);
  const reading = judge(await watchBrightness(page, 150));
  await stopArcher(page);
  console.log('out of arrows', JSON.stringify(reading));
  expect((await quiver(page)).phase).toBe('lost');
  expect(reading.biggestStep).toBeLessThan(4);
  expect(reading.flickeringShare).toBeLessThan(0.01);
});
