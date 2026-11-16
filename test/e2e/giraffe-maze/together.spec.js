// Friends in Giraffe's Maze, together, as the game comes: each on their own computer with their own camera, in the
// same mazes, on the same side. Everyone looks for the way out, and whoever finds it takes the others on to the next
// maze with them. Nobody is placed. Here they're separate browsers, talking through the race server on this
// computer (tools/race-server.mjs).
import { expect, openGame, shot, show, test, waitForScreen } from '../helpers.js';
import { allPlaying, expectSoon, FIST, GAME, joinGame, judge, leadHand, makeGame, OPEN, secondPlayer, stopHand, watchBrightness } from './helpers.js';

/** How it is on one child's screen. */
const view = (page) => page.evaluate(() => {
  const { game, run, session } = window.__game;
  return {
    team: game.team,
    race: run.race,
    index: run.index,
    phase: run.phase,
    out: run.stats.out,
    carried: run.stats.carried,
    fruit: run.stats.fruit,
    at: { ...run.position },
    board: [...document.querySelectorAll('#maze-race li')].map((row) => ({ name: row.querySelector('.maze-race-name').textContent, out: Number(row.dataset.out), face: !row.querySelector('img').hidden })),
    finishLine: session.finishLine,
    ownLevel: session.levels.current,
  };
});

/** Keeps everything the words at the top of the screen say, from now on. */
const keepPrompts = (page) => page.evaluate(() => {
  window.__prompts = [];
  const words = document.getElementById('prompt-text');
  new MutationObserver(() => window.__prompts.push(words.textContent)).observe(words, { childList: true, characterData: true, subtree: true });
});
const prompts = (page) => page.evaluate(() => window.__prompts);

test('together, as the game comes: whoever finds the way out takes the other on to the next maze, and both finish at once', async ({ page, browser }) => {
  test.setTimeout(480_000);
  await openGame(page, { mazeReach: 'lots', mazes: 2, mazeSize: 'medium', levels: { [GAME]: 4 } }, GAME);
  const code = await makeGame(page, 'Ana');
  // Whoever made the game chooses, and it comes as together.
  await expect(page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await expect(page.locator('.friends-how')).toContainText('Look for the way out together');
  // Ben's own choice is a race, but it's Ana's game: he's shown hers, and can't change it.
  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, { mazeFriends: 'against', fighter: 'kit' }, 'Ben');
  await expect(ben.page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await expect(ben.page.locator('input[name="friends-team"][value="together"]')).toBeDisabled();
  await expect(ben.page.locator('#friends-teams-whose')).toHaveText('Ana chose.');
  await allPlaying(page, ben.page);

  for (const each of [page, ben.page]) {
    const now = await view(each);
    expect([now.team, now.race, now.index]).toEqual([true, true, 0]);
    // One line for all of them at the top, with a dot for each maze and no face.
    expect(now.board).toEqual([{ name: 'Together', out: 0, face: false }]);
    await expect(each.locator('#maze-race li').first().locator('.maze-race-dots i')).toHaveCount(2);
  }

  // Ben rests, with a closed hand, where he started. Ana leads her character to the way out.
  for (const each of [page, ben.page]) await keepPrompts(each);
  await show(ben.page, ...FIST);
  const benStart = (await view(ben.page)).at;
  await leadHand(page);
  // Nothing flashes on Ben's screen as she finds it and the next maze comes in for him too.
  await expectSoon(async () => (await view(page)).phase, { timeout: 150_000 }).toBe('out');
  const carriedAlong = judge(await watchBrightness(ben.page, 300));
  console.log('carried out of a maze by a friend', JSON.stringify(carriedAlong));
  expect(carriedAlong.flickeringShare).toBeLessThan(0.01);
  expect(carriedAlong.biggestStep).toBeLessThan(6);
  // Ben is in the second maze too, though he never moved: carried, not out by his own doing.
  await expectSoon(async () => (await view(ben.page)).index, { timeout: 20_000 }).toBe(1);
  await expectSoon(async () => (await view(page)).index, { timeout: 20_000 }).toBe(1);
  const [ana, his] = [await view(page), await view(ben.page)];
  expect([ana.out, ana.carried, his.out, his.carried]).toEqual([1, 0, 0, 1]);
  expect(Math.hypot(benStart.x - his.at.x, benStart.y - his.at.y)).toBeLessThan(0.5);
  for (const each of [page, ben.page]) expect((await view(each)).board).toEqual([{ name: 'Together', out: 1, face: false }]);
  await stopHand(page);
  await shot(ben.page, 'maze-together-second-maze');

  // Ben was told who found it, on the screen.
  expect(await prompts(ben.page)).toContain('Ana found the way out!');

  // In the last maze it's the other way round: Ana rests, and Ben finds the way out for both of them.
  await show(page, ...FIST);
  await show(ben.page, ...OPEN);
  await leadHand(ben.page);
  await expectSoon(async () => (await view(page)).carried, { timeout: 150_000 }).toBe(1);
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  await stopHand(ben.page);
  // And she was told it was him. Neither was told of a way out they found themselves.
  expect(await prompts(page)).toContain('Ben found the way out!');
  expect(await prompts(page)).not.toContain('Ana found the way out!');
  expect(await prompts(ben.page)).not.toContain('Ben found the way out!');

  // Both cards are the team's: nobody placed, what each ate, and what it comes to.
  const [anaEnd, benEnd] = [await view(page), await view(ben.page)];
  expect([anaEnd.out, anaEnd.carried, benEnd.out, benEnd.carried]).toEqual([1, 1, 1, 1]);
  for (const each of [page, ben.page]) {
    await expect(each.locator('#screen-finish h2')).toHaveText('You found the way out together!');
    await expect(each.locator('.friends-results')).toHaveClass(/is-team/);
    await expect(each.locator('.friends-results li')).toHaveCount(2);
    await expect(each.locator('.friends-results')).not.toContainText(/1st|2nd|still playing/);
    await expect(each.locator('#finish-team')).toHaveText(`Together you got out of 2 mazes and ate ${anaEnd.fruit + benEnd.fruit} fruit.`);
    expect((await view(each)).finishLine).toBe('You did it together!');
  }
  await expect(page.locator('.friends-results li.is-you')).toContainText(`${anaEnd.fruit} fruit`);
  await expect(page.locator('.friends-results li:not(.is-you)')).toContainText(`${benEnd.fruit} fruit`);
  await shot(page, 'maze-together-finish');
  // It was the host's level, so nobody's own moves on.
  expect([anaEnd.ownLevel, benEnd.ownLevel]).toEqual([4, 1]);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('against each other, a grown-up\'s choice in the friends box, it\'s the race it was: nobody is carried, and each is on the board', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openGame(page, { mazeReach: 'lots', mazes: 2, mazeSize: 'medium' }, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, {}, 'Ben');
  await page.locator('input[name="friends-team"][value="against"]').check();
  // The friend is shown at once, and it's kept with Ana's settings, in the grown-ups' panel too.
  await expect(ben.page.locator('input[name="friends-team"][value="against"]')).toBeChecked();
  await expect(ben.page.locator('.friends-how')).toContainText('the first one out of the last maze wins');
  expect(await page.evaluate(() => window.__game.session.settings.mazeFriends)).toBe('against');
  await expect(page.locator('input[name="mazeFriends"][value="against"]')).toBeChecked();
  expect(await ben.page.evaluate(() => window.__game.session.settings.mazeFriends)).toBe('together');

  await allPlaying(page, ben.page);
  for (const each of [page, ben.page]) expect((await view(each)).team).toBe(false);
  expect((await view(page)).board.map(({ name, face }) => [name, face])).toEqual([['You', true], ['Ben', true]]);

  // Ana gets out of the first maze. Ben, resting, stays in it.
  await show(ben.page, ...FIST);
  await leadHand(page);
  await expectSoon(async () => (await view(page)).index, { timeout: 150_000 }).toBe(1);
  await stopHand(page);
  await page.waitForTimeout(2500);
  const his = await view(ben.page);
  expect([his.index, his.phase, his.carried]).toEqual([0, 'walking', 0]);
  await expect(ben.page.locator('#prompt-text')).not.toHaveText(/found the way out/);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});
