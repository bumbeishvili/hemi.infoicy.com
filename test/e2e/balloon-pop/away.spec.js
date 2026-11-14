// What's at stake in Balloon Pop, by default: balloons that float off the top get away, and when too many
// have, the game ends kindly and that level comes round again. Not while the camera can't see the hand, and
// not on Gentle, which is the game as it was.
import { expect, openGame, shot, show, test, waitForHand, waitForScreen } from './helpers.js';

const GAME = 'balloon-pop';

async function startPlaying(page, settings = {}) {
  // away: undefined leaves the game's own default.
  await openGame(page, { away: undefined, reach: 'none', ...settings }, GAME);
  await show(page, null, 'open');
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
  await waitForHand(page, 'open');
}

/** Sends every balloon up there off the top of the sky, as if nobody had got to them, and says how many went. */
const sendAllOff = (page) => page.evaluate(async () => {
  const { balloons } = window.__game;
  await new Promise((resolve) => {
    const wait = () => (balloons.balloons.some(({ kind }) => kind !== 'power') ? resolve() : requestAnimationFrame(wait));
    wait();
  });
  const sent = balloons.balloons.filter(({ kind }) => kind !== 'power').length;
  for (const balloon of balloons.balloons) if (balloon.kind !== 'power') balloon.y = -balloon.r * 4;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return sent;
});

const away = (page) => page.evaluate(() => window.__game.balloons.away);

test('by default balloons that float away count, and the chip says how many can', async ({ page }) => {
  await startPlaying(page);
  expect(await page.evaluate(() => window.__game.session.settings.away)).toBe('count');
  await expect(page.locator('#chip-away-box')).toBeVisible();
  // At level 1, twice as many as there are to pop.
  await expect(page.locator('#chip-away')).toHaveText('0 of 40');
  const sent = await sendAllOff(page);
  expect(sent).toBeGreaterThan(0);
  await expect.poll(() => away(page)).toBe(sent);
  await expect(page.locator('#chip-away')).toHaveText(`${sent} of 40`);
  await shot(page, 'b-away-chip');
});

test('a balloon that floats away while the camera can\'t see the hand isn\'t counted', async ({ page }) => {
  await startPlaying(page);
  await show(page, null, null);
  await waitForHand(page, 'missing');
  const before = await away(page);
  await sendAllOff(page);
  await page.waitForTimeout(300);
  expect(await away(page)).toBe(before);
});

test('too many floating away ends the game kindly, and the same level comes round again', async ({ page }) => {
  test.setTimeout(90_000);
  await startPlaying(page, { levels: { [GAME]: 3 } });
  // Only a few can get away, so the test is quick.
  await page.evaluate(() => {
    window.__game.balloons.awayAllowed = 3;
  });
  const watching = page.evaluate(async () => {
    const { balloons } = window.__game;
    const small = document.createElement('canvas');
    small.width = 16;
    small.height = 9;
    const context = small.getContext('2d', { willReadFrequently: true });
    const whole = [];
    for (let frame = 0; frame < 150; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      context.drawImage(balloons.canvas, 0, 0, 16, 9);
      const { data } = context.getImageData(0, 0, 16, 9);
      let total = 0;
      for (let i = 0; i < data.length; i += 4) total += (data[i] + data[i + 1] + data[i + 2]) / 3;
      whole.push(total / 144);
    }
    return whole;
  });
  while ((await away(page)) < 3) await sendAllOff(page);
  await waitForScreen(page, 'finish');
  const whole = await watching;
  const step = Math.max(...whole.slice(1).map((value, index) => Math.abs(value - whole[index])));
  console.log('too many floated away: biggest brightness step', step.toFixed(2));
  expect(step).toBeLessThan(5);
  await expect(page.locator('#screen-finish h2')).toHaveText('The balloons floated away!');
  await expect(page.locator('#finish-story')).toContainText('floated off into the sky before 20 were popped');
  await expect(page.locator('#play-again')).toHaveText('Try again');
  await expect(page.locator('#level-done-text')).toHaveText('Let’s try level 3 again!');
  expect(await page.evaluate(() => window.__game.session.levels.current)).toBe(3);
  expect(await page.evaluate(() => window.__game.hud.confetti.running)).toBe(false);
  await page.waitForTimeout(800);
  await shot(page, 'b-away-lost');

  // Trying again starts from nothing floated away, and popping them all is the usual card again.
  await show(page, null, 'open');
  await page.locator('#play-again').click();
  await waitForScreen(page, 'playing');
  expect(await away(page)).toBe(0);
  await page.evaluate(() => window.__game.balloons.configure({ goal: 1 }));
  await page.evaluate(() => {
    const { balloons } = window.__game;
    const glove = balloons.gloves.right;
    balloons.spawnAt(glove.x, glove.y, { still: true });
  });
  await waitForScreen(page, 'finish');
  await expect(page.locator('#screen-finish h2')).toHaveText('You popped them all!');
  await expect(page.locator('#finish-story')).toBeHidden();
});

test('on Gentle, floating away costs nothing, as it always did', async ({ page }) => {
  await startPlaying(page, { away: 'gentle' });
  await expect(page.locator('#chip-away-box')).toBeHidden();
  await sendAllOff(page);
  await sendAllOff(page);
  expect(await away(page)).toBe(0);
  expect(await page.evaluate(() => window.__game.session.screen)).toBe('playing');
});

test('with the maths challenge on, answers wait and nothing is counted', async ({ page }) => {
  await startPlaying(page, { maths: 'add' });
  await expect(page.locator('#chip-away-box')).toBeHidden();
  expect(await page.evaluate(() => window.__game.balloons.awayAllowed)).toBe(Infinity);
});
