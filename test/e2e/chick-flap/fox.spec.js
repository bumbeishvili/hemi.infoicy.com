// Flap, Little Chick!, with the fox who can catch the chick, which is how the game comes. A grown-up who
// played the first version, where he never could, asked for it: "make sure fox can catch, right now it just
// stops". The other tests of this game are played with the fox who never catches anyone.
import { shot } from '../helpers.js';
import { DOWN, expect, expectSoon, flapHands, GAME, hands, judge, openGame, state, stopHands, test, waitForScreen, watchBrightness } from './helpers.js';

const atLevel = (level, more = {}) => ({ levels: { [GAME]: level }, flapFox: 'catch', flapWay: 'short', ...more });

/** From the title into a flight, with both hands in the picture, hanging forwards. */
async function begin(page, settings) {
  await openGame(page, settings, GAME);
  await hands(page, DOWN, DOWN);
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
}

test('the fox can catch the chick, as the game comes: left standing at a log, it is caught, the card says so, and the level stays where it was', async ({ page }) => {
  test.setTimeout(180_000);
  // Nothing chosen for the fox at all.
  await begin(page, { levels: { [GAME]: 1 }, flapWay: 'short', flapFox: undefined });
  expect(await page.evaluate(() => window.__game.game.settings.flapFox)).toBe('catch');
  expect((await state(page)).catches).toBe(true);
  // The chick runs up to the first log and stands there, with the child's hands down.
  await expectSoon(async () => (await state(page)).chick.waiting?.kind).toBe('log');
  const first = (await state(page)).fox.gap;
  // He sits for a moment, and then he's up and coming.
  await expectSoon(async () => (await state(page)).fox.gap, { timeout: 20_000 }).toBeLessThan(first - 0.3);
  expect((await state(page)).fox.sitting).toBe(false);
  // Nobody says resting is fine: it isn't.
  await expect(page.locator('#prompt-text')).not.toHaveText('Resting is OK. Flap when you’re ready.');
  await expectSoon(async () => (await state(page)).chick.state, { timeout: 40_000 }).toBe('caught');
  await shot(page, 'flap-caught');
  // And that flight is over: the card says what happened, the button is to try again, and it's still level 1.
  await waitForScreen(page, 'finish');
  expect((await state(page)).lost).toBe(true);
  await expect(page.locator('#screen-finish h2')).toHaveText('The fox caught the little chick!');
  await expect(page.locator('#play-again')).toHaveText('Try again');
  await expect(page.locator('#level-done-text')).toHaveText('Let’s try level 1 again!');
  expect(await page.evaluate(() => window.__game.game.session.levels.current)).toBe(1);
  // What's said aloud at the end is that he caught it. And all that time standing at the log, the child was
  // never told that resting is fine, as they are where he can't catch.
  expect(await page.evaluate(() => window.__game.sound.finished)).toEqual({ line: 'The fox caught the chick! Try again!', lost: true });
  // Nothing is cheered: no confetti comes down on a chick the fox has.
  expect(await page.evaluate(() => window.__game.hud.confetti.running)).toBe(false);
  expect(await page.evaluate(() => [...window.__game.game.spokenTimes.keys()])).not.toContain('resting');
  await shot(page, 'flap-caught-card');
  // Trying again is a new flight, with the fox as far back as he starts.
  await page.locator('#play-again').click();
  await waitForScreen(page, 'playing', 60_000);
  const again = await state(page);
  expect([again.lost, again.chick.state]).toEqual([false, 'run']);
  expect(again.fox.gap).toBeGreaterThan(3);
});

test('a flap in time gets the chick away from him, and a child who flaps all the way home is never caught', async ({ page }) => {
  test.setTimeout(240_000);
  await begin(page, atLevel(1));
  await expectSoon(async () => (await state(page)).chick.waiting?.kind).toBe('log');
  // He's coming: and now the hands go up, and the chick is over the log and away.
  await expectSoon(async () => (await state(page)).fox.sitting, { timeout: 20_000 }).toBe(false);
  await flapHands(page);
  await waitForScreen(page, 'finish');
  await stopHands(page);
  const end = await state(page);
  expect(end.lost).toBe(false);
  expect(end.stats.cleared).toBe(8);
  await expect(page.locator('#screen-finish h2')).toHaveText('Home safe! What a flyer!');
  await expect(page.locator('#play-again')).toHaveText('Next level');
  // Home is cheered, as it always was.
  expect(await page.evaluate(() => window.__game.sound.finished)).toEqual({ line: 'Home safe! What a flyer!', lost: false });
  expect(await page.evaluate(() => window.__game.hud.confetti.running)).toBe(true);
  // Home, and on to the next level.
  expect(await page.evaluate(() => window.__game.game.session.levels.current)).toBe(2);
});

test('with no hands in the picture the fox waits too: a child who has gone away isn\'t caught', async ({ page }) => {
  await begin(page, atLevel(1));
  await expectSoon(async () => (await state(page)).chick.waiting?.kind).toBe('log');
  await hands(page, null, null);
  const before = (await state(page)).fox.gap;
  await page.waitForTimeout(9000);
  const now = await state(page);
  expect(now.chick.state).toBe('run');
  expect(now.fox.gap).toBeGreaterThan(before - 0.8);
  expect(now.lost).toBe(false);
});

test('the grown-ups can have the fox as he was: set to never catch, the mother hen is always there first', async ({ page }) => {
  await begin(page, atLevel(1, { flapFox: 'tumble' }));
  expect((await state(page)).catches).toBe(false);
  await expectSoon(async () => (await state(page)).chick.waiting?.kind).toBe('log');
  const before = (await state(page)).fox.gap;
  await page.waitForTimeout(8000);
  const now = await state(page);
  expect([now.fox.gap, now.fox.sitting, now.chick.state]).toEqual([before, true, 'run']);
  // Here resting is fine, and after a while the child is told so.
  await expectSoon(async () => page.evaluate(() => [...window.__game.game.spokenTimes.keys()]), { timeout: 30_000 }).toContain('resting');
  await expect(page.locator('#prompt-text')).toHaveText('Resting is OK. Flap when you’re ready.');
  // And the panel has all three foxes, with the one who can catch first.
  await page.locator('#open-panel').click();
  await expect(page.locator('input[name="flapFox"]')).toHaveCount(3);
  await expect(page.locator('input[name="flapFox"][value="tumble"]')).toBeChecked();
  await expect(page.locator('#panel')).toContainText('He can catch the chick');
});

test('nothing flashes when the fox comes on and catches the chick', async ({ page }) => {
  test.setTimeout(180_000);
  await begin(page, atLevel(1));
  await expectSoon(async () => (await state(page)).chick.waiting?.kind).toBe('log');
  await expectSoon(async () => (await state(page)).fox.gap, { timeout: 30_000 }).toBeLessThan(1.6);
  // The last of his coming, the catch, and the card.
  const reading = judge(await watchBrightness(page, 420));
  console.log('the fox catches the chick', JSON.stringify(reading));
  expect(reading.biggestStep).toBeLessThan(4);
  expect(reading.flickeringShare).toBeLessThan(0.01);
  expect((await state(page)).lost).toBe(true);
});
