// Every game goes up a level each time it's won, up to level 10, and remembers where it got to. A
// grown-up can choose the level. These check the part all games share, in a hand game and a body game.
// Each game's own tests check what its levels change.
import { expect, openGame, shot, show, test, waitForScreen } from './helpers.js';
import { openTrail } from './leap-trail/helpers.js';

const badge = (page) => page.locator('#level-badge');

test('a hand game shows its level, moves on when it\'s won, and remembers it', async ({ page }) => {
  await openGame(page, {}, 'lighthouse');
  await expect(badge(page)).toHaveText('Level 1 of 10');
  await shot(page, 'levels-title');
  await show(page, null, 'open');
  await page.locator('#start').click();
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-now')).toHaveText('Level 1');
  await expect(page.locator('#level-now')).toBeVisible();
  await shot(page, 'levels-countdown');
  await waitForScreen(page, 'playing');
  await expect(page.locator('#level-now')).toBeHidden();
  expect(await page.evaluate(() => window.__game.session.level)).toBe(1);

  await page.evaluate(() => window.__game.session.finish());
  await waitForScreen(page, 'finish');
  await expect(page.locator('#level-done-text')).toHaveText('Level 1 done! Next: level 2');
  await expect(page.locator('#play-again')).toHaveText('Next level');
  await expect(page.locator('#level-pips li.is-done')).toHaveCount(1);
  await expect(page.locator('#level-pips li.is-next')).toHaveAttribute('data-level', '2');
  await page.waitForTimeout(600);
  await shot(page, 'levels-finish');

  await page.locator('#play-again').click();
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-now')).toHaveText('Level 2');
  expect(await page.evaluate(() => window.__game.session.level)).toBe(2);

  await page.reload();
  await expect(badge(page)).toHaveText('Level 2 of 10');
});

test('a grown-up can choose the level, and the last one is 10', async ({ page }) => {
  await openGame(page, { language: 'ka' }, 'lighthouse');
  await page.locator('#open-panel').click();
  await expect(page.locator('#level-choice input[value="1"]')).toBeChecked();
  await page.locator('#level-choice').scrollIntoViewIfNeeded();
  await shot(page, 'levels-panel');
  await page.locator('#level-choice label', { hasText: '10' }).click();
  await page.locator('#close-panel').click();
  await expect(badge(page)).toHaveText('Level 10 of 10');

  await show(page, null, 'open');
  await page.locator('#start').click();
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-now')).toHaveText('დონე 10');
  await waitForScreen(page, 'playing');
  await page.evaluate(() => window.__game.session.finish());
  await expect(page.locator('#level-done-text')).toHaveText('All 10 levels done!');
  await page.waitForTimeout(600);
  await shot(page, 'levels-all-done');
  await expect(page.locator('#level-pips li.is-done')).toHaveCount(10);
  await expect(page.locator('#play-again')).not.toHaveText('Next level');
  expect(await page.evaluate(() => window.__game.session.levels.current)).toBe(10);
});

test('a body game has the same levels, and losing doesn\'t move on', async ({ page }) => {
  await openTrail(page);
  await expect(badge(page)).toHaveText('Level 1 of 10');
  await shot(page, 'levels-body-title');
  await expect(page.locator('#level-choice input')).toHaveCount(10);

  const after = (won) => page.evaluate((result) => {
    const { game } = window.__game;
    game.startLevel();
    game.finishLevel(result);
    return { level: game.levels.current, words: document.getElementById('level-done-text').textContent };
  }, won);
  expect(await after(false)).toEqual({ level: 1, words: 'Let’s try level 1 again!' });
  expect(await after(true)).toEqual({ level: 2, words: 'Level 1 done! Next: level 2' });
  await page.reload();
  await expect(badge(page)).toHaveText('Level 2 of 10');
});

test('what a level brings is shown on the title card, under the countdown, and as coming up next', async ({ page }) => {
  await openGame(page, {}, 'lighthouse');
  await page.evaluate(() => {
    const { session } = window.__game;
    session.game.newAt = (level) => (level === 4 ? [{ mark: '🌊', name: 'Big waves' }] : level === 5 ? [{ mark: '⭐', name: 'Starfish', nameKa: 'ზღვის ვარსკვლავი' }] : []);
  });
  await page.locator('#open-panel').click();
  await page.locator('#level-choice label', { hasText: '4' }).click();
  await page.locator('#close-panel').click();
  await expect(page.locator('#level-new')).toHaveText('New:🌊Big waves');

  await show(page, null, 'open');
  await page.locator('#start').click();
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-new-now')).toBeVisible();
  await expect(page.locator('#level-new-now')).toContainText('Big waves');
  await shot(page, 'levels-new-countdown');
  await waitForScreen(page, 'playing');
  await expect(page.locator('#level-new-now')).toBeHidden();

  await page.evaluate(() => window.__game.session.finish());
  await expect(page.locator('#level-next-new')).toHaveText('Coming up:⭐Starfish');
  await page.waitForTimeout(600);
  await shot(page, 'levels-new-finish');
});

test('level 1 has nothing new to show', async ({ page }) => {
  await openGame(page, {}, 'lighthouse');
  await page.evaluate(() => {
    window.__game.session.game.newAt = () => [{ mark: '🌊', name: 'Big waves' }];
    window.__game.session.levelUi.refresh();
  });
  await expect(page.locator('#level-new')).toBeHidden();
});

// A level chosen in the middle of a game starts the game again at it: see start-again.spec.js. It used to wait
// for the next game, which looked as though nothing had happened.
