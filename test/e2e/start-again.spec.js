// What a grown-up changes in the panel in the middle of a game either goes on to that game at once, or starts it
// again when the panel is closed, so that what they chose is what's played. A grown-up who had played the games
// asked for it: a level, or the maths challenge, chosen in the middle of a game used to wait for the next one, and
// looked as though nothing had happened. These check the part every game shares, in two hand games, a body game
// and the mouth game.
import { expect, openGame, show, test, waitForScreen } from './helpers.js';
import { reachRun } from './leap-trail/helpers.js';
import { startPlaying as startGobbling } from './gobble-grow/helpers.js';
import { reachFight } from './mighty-moves/helpers.js';
import { reachFlight } from './sky-wings/helpers.js';
import { reachPlay as reachLifting } from './mighty-lift/helpers.js';
import { reachPlay as reachRiding } from './moto-mountain/helpers.js';
import { reachPlay as reachCrossing } from './rooftop-rope/helpers.js';
import { reachPlay as reachSplashing } from './swamp-splash/helpers.js';

const screen = (page) => page.evaluate(() => window.__game.screen);
const closePanel = async (page) => {
  await page.locator('#close-panel').click();
  await expect(page.locator('#panel')).toBeHidden();
};

/**
 * Hat Chase, from the title to the path, with a real person standing still in full view (strikes.webm, held
 * still). The magpie waits, so nothing is lost while the level is changed.
 */
async function reachChasing(page) {
  await openGame(page, { chaseMagpie: 'waits' }, 'hat-chase');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'yes');
  await page.evaluate(() => window.__camera.showFootage('strikes', { from: 0.2, playing: false }));
  await page.locator('#start').click();
  await waitForScreen(page, 'choose');
  await page.locator('#chase-start').click();
  await waitForScreen(page, 'playing');
}

test('a level chosen in the middle of a hand game starts the game again at that level, once the panel is closed', async ({ page }) => {
  await openGame(page, { levels: { lighthouse: 3 }, storm: 'gentle' }, 'lighthouse');
  await show(page, null, 'open');
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
  await page.locator('#open-panel').click();
  await page.locator('#level-choice label', { hasText: '7' }).click();
  // With the panel still open nothing has started again: a grown-up may be changing more than one thing.
  expect(await page.evaluate(() => [window.__game.screen, window.__game.session.level])).toEqual(['playing', 3]);
  await closePanel(page);
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-now')).toHaveText('Level 7');
  await waitForScreen(page, 'playing');
  expect(await page.evaluate(() => window.__game.session.level)).toBe(7);
  // It's the level that's played, and the one the card counts.
  await page.evaluate(() => window.__game.session.finish());
  await expect(page.locator('#level-done-text')).toHaveText('Level 7 done! Next: level 8');
});

test('on the title card, before a game, a level or a setting chosen starts nothing: the next game has it', async ({ page }) => {
  await openGame(page, { away: 'gentle' }, 'balloon-pop');
  await page.locator('#open-panel').click();
  await page.locator('#level-choice label', { hasText: '4' }).click();
  await page.locator('input[name="maths"][value="add"]').check();
  await closePanel(page);
  await page.waitForTimeout(600);
  expect(await screen(page)).toBe('welcome');
  await expect(page.locator('#level-badge')).toHaveText('Level 4 of 10');
});

test('in Balloon Pop, reach help goes on to the game at once, and the maths challenge starts it again with sums', async ({ page }) => {
  await openGame(page, { away: 'gentle' }, 'balloon-pop');
  await show(page, null, 'open');
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
  await expect(page.locator('body')).toHaveAttribute('data-maths', 'off');
  await page.waitForTimeout(1500);
  // Reach help tunes how the hand is helped: the game that's going carries on with it.
  await page.locator('#open-panel').click();
  await page.locator('input[name="reach"][value="lots"]').check();
  await closePanel(page);
  await page.waitForTimeout(700);
  expect(await screen(page)).toBe('playing');
  const played = await page.evaluate(() => window.__game.session.playSeconds);
  expect(played).toBeGreaterThan(1.5);
  expect(await page.evaluate(() => window.__game.session.settings.reach)).toBe('lots');
  // The maths challenge changes what the game is: it starts again, with sums.
  await page.locator('#open-panel').click();
  await page.locator('input[name="maths"][value="add"]').check();
  await closePanel(page);
  await waitForScreen(page, 'countdown');
  await waitForScreen(page, 'playing');
  await expect(page.locator('body')).toHaveAttribute('data-maths', 'on');
  expect(await page.evaluate(() => window.__game.session.playSeconds)).toBeLessThan(played);
  // Closing the panel with nothing changed starts nothing.
  await page.waitForTimeout(1200);
  const before = await page.evaluate(() => window.__game.session.playSeconds);
  await page.locator('#open-panel').click();
  await closePanel(page);
  await page.waitForTimeout(700);
  expect(await screen(page)).toBe('playing');
  expect(await page.evaluate(() => window.__game.session.playSeconds)).toBeGreaterThan(before);
});

test('a level chosen in the middle of a body game starts it again, from the check that the child can be seen', async ({ page }) => {
  test.setTimeout(240_000);
  await reachRun(page, { obstacles: 10 });
  expect(await page.evaluate(() => window.__game.game.level)).toBe(1);
  await page.locator('#open-panel').click();
  await page.locator('#level-choice label', { hasText: '5' }).click();
  expect(await screen(page)).toBe('run');
  await closePanel(page);
  // Seen again, and counted in again. The practice may come round first, and is skipped as before.
  await expect.poll(() => screen(page), { timeout: 30_000 }).not.toBe('run');
  await expect.poll(async () => {
    const now = await screen(page);
    if (now === 'practice') await page.locator('#practice-skip').click();
    return now;
  }, { timeout: 60_000, intervals: [300] }).toBe('countdown');
  await expect(page.locator('#level-now')).toHaveText('Level 5');
  await waitForScreen(page, 'run');
  expect(await page.evaluate(() => [window.__game.game.level, window.__game.run.levelNumber])).toEqual([5, 5]);
});

test('in a body game, how a jump is made goes on at once, and how many obstacles there are starts the run again', async ({ page }) => {
  test.setTimeout(240_000);
  await reachRun(page, { obstacles: 10 });
  const first = await page.evaluate(() => window.__game.run.course.length);
  expect(first).toBe(10);
  await page.locator('#open-panel').click();
  await page.locator('input[name="jumpWith"][value="reach"]').check();
  await closePanel(page);
  await page.waitForTimeout(800);
  expect(await screen(page)).toBe('run');
  await page.locator('#open-panel').click();
  await page.locator('input[name="obstacles"][value="20"]').check();
  await closePanel(page);
  await expect.poll(() => screen(page), { timeout: 30_000 }).not.toBe('run');
  await expect.poll(async () => {
    const now = await screen(page);
    if (now === 'practice') await page.locator('#practice-skip').click();
    return now;
  }, { timeout: 60_000, intervals: [300] }).toBe('countdown');
  await waitForScreen(page, 'run');
  expect(await page.evaluate(() => window.__game.run.course.length)).toBe(20);
});

// Every other hand game, started the same way: both hands shown open, so the games played with two are in it too.
const HAND_GAMES = ['arrow-meadow', 'bounce-back', 'cannon-bay', 'chick-flap', 'frost-arena', 'giraffe-garden', 'giraffe-goal', 'giraffe-maze', 'giraffe-paint', 'giraffe-puzzles', 'giraffe-walk', 'high-five-racers', 'robot-rescue', 'smoothie-stand', 'spider-catcher', 'tank-patrol', 'world-tour'];
for (const game of HAND_GAMES) {
  test(`a level chosen in the middle of ${game} starts it again at that level, and it plays on`, async ({ page }) => {
    test.setTimeout(240_000);
    await openGame(page, {}, game);
    await show(page, 'open', 'open');
    await page.locator('#start').click();
    await waitForScreen(page, 'playing');
    await page.waitForTimeout(1500);
    await page.locator('#open-panel').click();
    await page.locator('#level-choice label', { hasText: '2' }).click();
    await closePanel(page);
    await waitForScreen(page, 'countdown');
    await waitForScreen(page, 'playing');
    expect(await page.evaluate(() => window.__game.session.level)).toBe(2);
    // The new round is a round like any other: its clock runs.
    const from = await page.evaluate(() => window.__game.session.playSeconds);
    await expect.poll(() => page.evaluate(() => window.__game.session.playSeconds), { timeout: 20_000 }).toBeGreaterThan(from + 1);
    expect(await screen(page)).toBe('playing');
  });
}

// The other body games, each with its own way in and its own name for the screen it's played on. After the check
// that the child can be seen, a warm-up or a lesson may come round again, and is skipped as it was the first time.
const BODY_GAMES = [
  ['Mighty Moves', (page) => reachFight(page), 'fight'],
  ['Sky Wings', (page) => reachFlight(page), 'fly'],
  ['Mighty Lift', (page) => reachLifting(page), 'playing'],
  ['Moto Mountain', (page) => reachRiding(page), 'playing'],
  ['Rooftop Rope', (page) => reachCrossing(page), 'playing'],
  ['Swamp Splash', (page) => reachSplashing(page), 'playing'],
  ['Hat Chase', (page) => reachChasing(page), 'playing'],
];
for (const [name, reach, playing] of BODY_GAMES) {
  test(`a level chosen in the middle of ${name} starts it again at that level`, async ({ page }) => {
    test.setTimeout(300_000);
    await reach(page);
    expect(await screen(page)).toBe(playing);
    expect(await page.evaluate(() => window.__game.game.level)).toBe(1);
    await page.locator('#open-panel').click();
    await page.locator('#level-choice label', { hasText: '4' }).click();
    await closePanel(page);
    await expect.poll(() => screen(page), { timeout: 30_000 }).not.toBe(playing);
    await expect.poll(async () => {
      for (const skip of ['#warm-skip', '#lesson-skip', '#practice-skip']) {
        const button = page.locator(skip);
        if (await button.count() && await button.isVisible()) await button.click();
      }
      return page.evaluate(() => [window.__game.screen, window.__game.game.level]);
    }, { timeout: 120_000, intervals: [400] }).toEqual([playing, 4]);
    await expect(page.locator('#level-badge')).toHaveText('Level 4 of 10');
  });
}

test('a level chosen in the middle of the mouth game starts it again at that level', async ({ page }) => {
  test.setTimeout(180_000);
  await startGobbling(page, { gobbleBig: 'gentle' });
  expect(await page.evaluate(() => window.__game.session.level)).toBe(1);
  await page.locator('#open-panel').click();
  await page.locator('#level-choice label', { hasText: '3' }).click();
  await closePanel(page);
  await waitForScreen(page, 'countdown');
  await waitForScreen(page, 'playing');
  expect(await page.evaluate(() => window.__game.session.level)).toBe(3);
});
