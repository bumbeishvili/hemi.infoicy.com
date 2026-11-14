// Racing to win, the default: the others drive at their own pace and can get to the line first. A hand that's
// closed in plain view doesn't stop them, a hand the camera can't see does, and a race one of them wins ends
// kindly, on the same level. On Gentle it's the race as it was (see rivals.spec.js).
import { car, expect, openGame, reachRace, shot, show, test, waitForHand, waitForScreen, waitUntilMoving, waitUntilStopped } from './helpers.js';

async function raceToWin(page, settings = {}) {
  // rivals: undefined leaves the game's own default.
  await openGame(page, { rivals: undefined, steering: 'help', ...settings });
  await show(page, null, 'open');
  await reachRace(page);
  await waitForHand(page, 'open');
  await waitUntilMoving(page);
}

const rivals = (page) => page.evaluate(() => {
  const { race } = window.__game;
  return { gentle: race.gentle, place: race.place, gaps: race.rivals.map((rival) => rival.distance - race.distance), speeds: race.rivals.map((rival) => rival.speed) };
});

/** How bright the race's picture is, frame by frame, while the race ends. */
const watchBrightness = (page, frames) => page.evaluate(async (count) => {
  const { race } = window.__game;
  const small = document.createElement('canvas');
  small.width = 16;
  small.height = 9;
  const context = small.getContext('2d', { willReadFrequently: true });
  const whole = [];
  for (let frame = 0; frame < count; frame += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    race.render();
    context.drawImage(race.renderer.domElement, 0, 0, 16, 9);
    const { data } = context.getImageData(0, 0, 16, 9);
    let total = 0;
    for (let i = 0; i < data.length; i += 4) total += (data[i] + data[i + 1] + data[i + 2]) / 3;
    whole.push(total / 144);
  }
  return whole;
}, frames);
const biggestStep = (values) => Math.max(...values.slice(1).map((value, index) => Math.abs(value - values[index])));

test('by default the others race to win: a hand closed in view doesn\'t stop them, and they go past', async ({ page }) => {
  test.setTimeout(120_000);
  await raceToWin(page);
  expect(await page.evaluate(() => window.__game.session.settings.rivals)).toBe('race');
  await page.evaluate(() => {
    const { race } = window.__game;
    race.rivals.forEach((rival, index) => {
      rival.distance = race.distance - 25 - index * 12;
    });
  });
  await show(page, null, 'fist');
  await waitForHand(page, 'closed');
  await waitUntilStopped(page);
  await page.waitForTimeout(4000);
  const resting = await rivals(page);
  expect(resting.gentle).toBe(false);
  // Everyone has gone past the stopped car, still driving.
  for (const gap of resting.gaps) expect(gap).toBeGreaterThan(0);
  for (const speed of resting.speeds) expect(speed).toBeGreaterThan(10);
  expect(resting.place).toBe(resting.gaps.length + 1);
  // And the closed hand is still asked to open, rather than told resting is fine.
  await shot(page, 'r-race-to-win-resting');
});

test('racing to win, a hand the camera can\'t see is waited for, and nobody gets away', async ({ page }) => {
  test.setTimeout(120_000);
  await raceToWin(page);
  await page.evaluate(() => {
    const { race } = window.__game;
    race.rivals.forEach((rival, index) => {
      rival.distance = race.distance - 40 - index * 12;
    });
  });
  await show(page, null, null);
  await waitForHand(page, 'missing');
  await waitUntilStopped(page);
  await page.waitForTimeout(5000);
  const waiting = await rivals(page);
  for (const gap of waiting.gaps) expect(gap).toBeLessThan(0);
  for (const speed of waiting.speeds) expect(speed).toBeLessThan(2);
  expect(waiting.place).toBe(1);
});

test('racing to win, one of the others getting to the line first ends the race kindly, on the same level', async ({ page }) => {
  test.setTimeout(120_000);
  await raceToWin(page, { laps: 1, levels: { 'high-five-racers': 4 } });
  const level = await page.evaluate(() => window.__game.session.levels.current);
  expect(level).toBe(4);
  await page.evaluate(() => {
    const { race } = window.__game;
    race.distance = race.raceDistance - 220;
    race.snapCamera = true;
    race.rivals.forEach((rival, index) => {
      rival.distance = race.raceDistance - 40 + index * 6;
      rival.speed = 20;
    });
  });
  await show(page, null, 'fist');
  const reading = watchBrightness(page, 150);
  await waitForScreen(page, 'finish');
  const whole = await reading;
  console.log('a race lost: biggest brightness step', biggestStep(whole).toFixed(2));
  expect(biggestStep(whole)).toBeLessThan(15);
  const winner = await page.evaluate(() => window.__game.race.lostTo.name);
  await expect(page.locator('#screen-finish h2')).toHaveText(`${winner} won the race!`);
  await expect(page.locator('#finish-story')).toContainText(`${winner} got to the finish line first`);
  await expect(page.locator('#screen-finish .finish-actions .big-button')).toHaveText('Try again');
  await expect(page.locator('#level-done-text')).toHaveText('Let’s try level 4 again!');
  expect(await page.evaluate(() => window.__game.session.levels.current)).toBe(4);
  expect(await page.evaluate(() => window.__game.hud.confetti.running)).toBe(false);
  await page.waitForTimeout(800);
  await shot(page, 'r-race-lost');

  // Trying again, and winning this time: the card is the winner's again.
  await show(page, null, 'open');
  await page.locator('#screen-finish .finish-actions .big-button').click();
  await waitForScreen(page, 'playing');
  await waitUntilMoving(page);
  await page.evaluate(() => {
    const { race } = window.__game;
    race.distance = race.raceDistance - 30;
    race.rivals.forEach((rival) => {
      rival.distance = race.raceDistance - 300;
    });
  });
  await waitForScreen(page, 'finish');
  await expect(page.locator('#screen-finish h2')).toHaveText('You won the race!');
  await expect(page.locator('#finish-story')).toBeHidden();
  await expect(page.locator('#screen-finish .finish-actions .big-button')).toHaveText('Next level');
  expect(await page.evaluate(() => window.__game.session.levels.current)).toBe(5);
});

test('on Gentle the same closed hand is waited for, as the race always was', async ({ page }) => {
  test.setTimeout(120_000);
  await raceToWin(page, { rivals: 'gentle' });
  await page.evaluate(() => {
    const { race } = window.__game;
    race.rivals.forEach((rival, index) => {
      rival.distance = race.distance - 40 - index * 12;
    });
  });
  await show(page, null, 'fist');
  await waitForHand(page, 'closed');
  await waitUntilStopped(page);
  await page.waitForTimeout(4000);
  const waiting = await rivals(page);
  expect(waiting.gentle).toBe(true);
  for (const gap of waiting.gaps) expect(gap).toBeLessThan(0);
  expect((await car(page)).place).toBe(1);
});
