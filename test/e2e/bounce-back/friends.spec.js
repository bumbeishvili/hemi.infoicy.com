// Playing Bounce Back with a friend: two children, each on their own computer with their own camera, on one
// court. The host's game runs the ball, and each game decides its own hits and sends them, so hitting feels
// immediate for both. Each child sees themselves on their own side. Whoever makes the game chooses whether it's
// played together, keeping one rally going as a team, or against each other. Here they're two separate browsers,
// talking through the race server on this computer (tools/race-server.mjs).
import { expect, openGame, show, shot, test, waitForScreen } from '../helpers.js';
import { expectSoon, GAME, OPEN, steerHand, stopHand } from './helpers.js';

/** Another player, in a browser of their own, with the same checks for errors. */
async function secondPlayer(browser) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`uncaught: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`logged: ${message.text()}`);
  });
  return { context, page, errors };
}

/** A grown-up makes a game, and gets its code. */
async function makeGame(page, name) {
  await page.locator('#friends-toggle').click();
  await page.locator('#friends-make').click();
  await expect(page.locator('#friends-code-shown')).toHaveText(/^[A-HJ-NP-Z2-9]{3}$/);
  // A name, if they'd like one, once they're in.
  if (name) {
    await page.locator('#friends-name').fill(name);
    await page.locator('#friends-name').dispatchEvent('change');
  }
  return page.locator('#friends-code-shown').textContent();
}

/** Both get through the hand check and wait for each other, and then both play. */
async function bothPlaying(page, other) {
  for (const each of [page, other]) {
    await show(each, ...OPEN);
    await each.locator('#start').click();
  }
  await waitForScreen(page, 'playing');
  await waitForScreen(other, 'playing');
}

/** How it is on one child's screen. */
const view = (page) => page.evaluate(() => {
  const { game, court } = window.__game;
  const other = game.mine === 'A' ? 'B' : 'A';
  const ball = game.mode === 'guest' ? game.guestBall : game.rally.ball;
  return {
    mode: game.mode,
    mine: game.mine,
    flip: court.flip,
    mineOnRight: court.at(game.mine === 'A' ? -0.5 : 0.5, 0).x > court.cx,
    goal: game.goal,
    hard: game.hard,
    level: game.playLevel,
    scores: game.scores(),
    team: game.team,
    hits: game.stats.hits,
    friendSeen: court.players[other].racket.visible,
    friendName: court.players[other].name,
    friendCharacter: court.players[other].spec.id,
    ball: ball ? { u: ball.u, h: ball.h, state: ball.state, stroke: ball.stroke } : null,
    ownLevel: window.__game.session.levels.current,
    flags: court.flags.count,
  };
});

test('two friends play against each other: the host\'s ball, each on their own side, and either one\'s hit counts for both', async ({ page, browser }) => {
  test.setTimeout(420_000);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  // Whoever makes the game has chosen against each other, under the gear icon.
  await openGame(page, { bouncePoints: 5, bounceHard: 'gentle', bounceFriends: 'against', levels: { [GAME]: 4 } }, GAME);
  const code = await makeGame(page, 'Ana');
  expect(page.url()).toContain(`#bounce=${code}`);
  await expect(page.locator('input[name="friends-team"][value="against"]')).toBeChecked();
  await expect(page.locator('input[name="friends-team"][value="against"]')).toBeEnabled();

  // The friend has their own points, how hard and character, but plays the host's game.
  const ben = await secondPlayer(browser);
  await openGame(ben.page, { bouncePoints: 11, bounceHard: 'tough', fighter: 'kit' }, GAME, `#bounce=${code}`);
  await ben.page.locator('#friends-name').fill('Ben');
  await ben.page.locator('#friends-name').dispatchEvent('change');
  await expect(page.locator('#friends-here')).toContainText('Ben');
  // The friend's own choice is together, and it's the host's that counts: he's shown it, and can't change it.
  expect(await ben.page.evaluate(() => window.__game.session.settings.bounceFriends)).toBe('together');
  await expect(ben.page.locator('input[name="friends-team"][value="against"]')).toBeChecked();
  await expect(ben.page.locator('input[name="friends-team"][value="together"]')).toBeDisabled();
  await expect(ben.page.locator('#friends-teams-whose')).toHaveText('Ana chose.');
  await bothPlaying(page, ben.page);

  const [ana, his] = [await view(page), await view(ben.page)];
  expect([ana.mode, his.mode]).toEqual(['host', 'guest']);
  expect([ana.team, his.team]).toEqual([false, false]);
  expect([ana.goal, his.goal]).toEqual([5, 5]);
  expect([ana.hard, his.hard]).toEqual(['gentle', 'gentle']);
  expect([ana.level, his.level]).toEqual([4, 4]);
  // The plain game with a friend: no flags, though it's the host's level 4.
  expect([ana.flags, his.flags]).toEqual([0, 0]);
  // Both play with the right hand, so each is on the right of their own screen, which is turned round for the friend.
  expect([ana.mineOnRight, his.mineOnRight]).toEqual([true, true]);
  expect(ana.flip).toBe(-his.flip);
  expect([ana.friendName, his.friendName]).toEqual(['Ben', 'Ana']);
  expect([ana.friendCharacter, his.friendCharacter]).toEqual(['kit', 'giraffe']);
  await expect(page.locator('#score-goal')).toHaveText('First to 5');
  await expect(ben.page.locator('.score-player:not(.is-mine) .score-name')).toHaveText('Ana');

  // Both after the ball. The host serves first, then Ben hits it back, on his own game, and it counts on Ana's.
  await steerHand(page);
  await steerHand(ben.page);
  await expectSoon(async () => (await view(ben.page)).hits, { timeout: 90_000 }).toBeGreaterThanOrEqual(1);
  await expectSoon(() => page.evaluate(() => window.__game.rally.stats.hits.B), { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
  // Each sees the other's racket where it is, and the same ball in the same place, give or take a moment.
  await expectSoon(async () => (await view(page)).friendSeen).toBe(true);
  await expectSoon(async () => (await view(ben.page)).friendSeen).toBe(true);
  const [here, there] = await Promise.all([view(page), view(ben.page)]);
  expect(Math.abs(here.ball.u - there.ball.u)).toBeLessThan(0.3);
  expect(Math.abs(here.ball.h - there.ball.h)).toBeLessThan(0.3);
  await shot(page, 'bounce-friends-host');
  await ben.page.screenshot({ path: 'test-results/screens/bounce-friends-guest.png' });

  // Near the end, Ben tries and misses: the point is Ana's, and the game is over for both.
  await page.evaluate(() => {
    window.__game.rally.scores.A = 4;
  });
  await steerHand(ben.page, { target: 'dodge' });
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  for (const each of [page, ben.page]) await stopHand(each);
  await expect(page.locator('#screen-finish h2')).toHaveText('You won!');
  await expect(ben.page.locator('#screen-finish h2')).toHaveText('Great game!');
  await expect(page.locator('.friends-results li').nth(0)).toContainText(/1st\s+You\s+5 points/);
  await expect(ben.page.locator('.friends-results li').nth(0)).toContainText(/1st\s+Ana\s+5 points/);
  await expect(ben.page.locator('#finish-score')).toContainText(':');
  await page.waitForTimeout(600);
  await shot(page, 'bounce-friends-finish');

  // Nobody's own level moves on, nobody's settings change, and the only connection was to the race server.
  expect((await view(page)).ownLevel).toBe(4);
  expect((await view(ben.page)).ownLevel).toBe(1);
  expect(await ben.page.evaluate(() => window.__game.session.settings.bouncePoints)).toBe(11);
  expect(await ben.page.evaluate(() => window.__game.session.settings.bounceHard)).toBe('tough');
  expect(sockets).toEqual([`ws://localhost:${Number(new URL(test.info().project.use.baseURL).port) + 1}/room/bounce-back/${code}?make=1`]);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('two friends play together: one rally between them, every hit is the team\'s, a miss costs nothing, and both win', async ({ page, browser }) => {
  test.setTimeout(420_000);
  // Together is how it comes, unless a grown-up chooses otherwise.
  await openGame(page, { bouncePoints: 5, bounceHard: 'tough' }, GAME);
  const code = await makeGame(page, 'Ana');
  await expect(page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await expect(page.locator('#friends-how')).toContainText('keep the ball going between you');

  // The friend has chosen against each other for their own games, and plays the host's, together.
  const ben = await secondPlayer(browser);
  await openGame(ben.page, { bounceFriends: 'against', fighter: 'kit' }, GAME, `#bounce=${code}`);
  await ben.page.locator('#friends-name').fill('Ben');
  await ben.page.locator('#friends-name').dispatchEvent('change');
  await expect(page.locator('#friends-here')).toContainText('Ben');
  await expect(ben.page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await expect(ben.page.locator('input[name="friends-team"][value="against"]')).toBeDisabled();
  await expect(ben.page.locator('#friends-how')).toContainText('keep the ball going between you');
  await ben.page.screenshot({ path: 'test-results/screens/bounce-together-box.png' });

  // The host changes their mind, and back: the friend sees each at once.
  await page.locator('input[name="friends-team"][value="against"]').check();
  await expect(ben.page.locator('input[name="friends-team"][value="against"]')).toBeChecked();
  expect(await page.evaluate(() => window.__game.session.settings.bounceFriends)).toBe('against');
  await expect(page.locator('input[name="bounceFriends"][value="against"]')).toBeChecked();
  await page.locator('input[name="friends-team"][value="together"]').check();
  await expect(ben.page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  expect(await page.evaluate(() => window.__game.session.settings.bounceFriends)).toBe('together');

  await bothPlaying(page, ben.page);
  const [ana, his] = [await view(page), await view(ben.page)];
  expect([ana.mode, his.mode]).toEqual(['host', 'guest']);
  expect([ana.team, his.team]).toEqual([true, true]);
  // The host's 5 points to win are 20 hits between them.
  expect([ana.goal, his.goal]).toEqual([20, 20]);
  await expect(page.locator('#score-goal')).toHaveText('0 of 20 together');
  await expect(ben.page.locator('#score-goal')).toHaveText('0 of 20 together');

  // Ben tries and misses what comes over the net: on Tough against each other that's Ana's point every time.
  // Together, nothing is lost: the ball floats back up and waits for him, and he hits that.
  await steerHand(page);
  await steerHand(ben.page, { target: 'dodge' });
  await expectSoon(() => page.evaluate(() => window.__game.rally.ball.state === 'waiting' && window.__game.rally.ball.side === 'B'), { timeout: 60_000, intervals: [50] }).toBe(true);
  await expectSoon(async () => (await view(ben.page)).hits, { timeout: 60_000 }).toBeGreaterThanOrEqual(1);
  const missed = await page.evaluate(() => {
    const { rally } = window.__game;
    return { scores: { ...rally.scores }, hits: { ...rally.stats.hits }, winner: rally.winner, screen: window.__game.session.screen };
  });
  // Every hit that was made is the team's, there are no points, and nobody has won or lost anything.
  expect(missed.scores).toEqual(missed.hits);
  expect(missed.winner).toBe(null);
  expect(missed.screen).toBe('playing');
  await expect(page.locator('#score-goal')).toHaveText(/^\d+ of 20 together$/);
  await expect(ben.page.locator('#score-goal')).toHaveText(/^\d+ of 20 together$/);

  // Both after the ball: the hits add up on both screens, each one's own beside their name.
  await steerHand(ben.page);
  await expectSoon(async () => (await view(ben.page)).hits, { timeout: 90_000 }).toBeGreaterThanOrEqual(2);
  await expectSoon(async () => { const { scores } = await view(page); return scores.A + scores.B; }, { timeout: 60_000 }).toBeGreaterThanOrEqual(5);
  const [here, there] = await Promise.all([view(page), view(ben.page)]);
  expect(Math.abs(here.scores.A + here.scores.B - (there.scores.A + there.scores.B))).toBeLessThanOrEqual(1);
  await shot(page, 'bounce-together-host');
  await ben.page.screenshot({ path: 'test-results/screens/bounce-together-guest.png' });

  // Nearly there: a few more hits, and it's over for both, and won by both.
  await page.evaluate(() => {
    const { scores } = window.__game.rally;
    scores.A = Math.max(scores.A, 9);
    scores.B = Math.max(scores.B, 9);
  });
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  for (const each of [page, ben.page]) await stopHand(each);
  await expect(page.locator('#screen-finish h2')).toHaveText('You did it together!');
  await expect(ben.page.locator('#screen-finish h2')).toHaveText('You did it together!');
  // Nobody is placed, and each one's hits are beside their name, adding up to the team's.
  for (const each of [page, ben.page]) {
    await expect(each.locator('.friends-results li')).toHaveCount(2);
    await expect(each.locator('.friends-results .friends-place').first()).toBeHidden();
    await expect(each.locator('.friends-results')).toContainText(/\d+ hits/);
    await expect(each.locator('#finish-score')).toContainText(/^\d+ \+ \d+ = 2\d$/);
  }
  await page.waitForTimeout(600);
  await shot(page, 'bounce-together-finish');
  // Nobody's own level moves on, and the friend's own choice is still theirs.
  expect((await view(page)).ownLevel).toBe(1);
  expect(await ben.page.evaluate(() => window.__game.session.settings.bounceFriends)).toBe('against');
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('a game is for two: a third friend is told it already has two players', async ({ page, browser }) => {
  await openGame(page, {}, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await openGame(ben.page, {}, GAME, `#bounce=${code}`);
  await expect(page.locator('#friends-here li')).toHaveCount(2);
  const cara = await secondPlayer(browser);
  await openGame(cara.page, {}, GAME, `#bounce=${code}`);
  await expect(cara.page.locator('#friends-status')).toHaveText('That game already has 2 players.');
  await expect(page.locator('#friends-here li')).toHaveCount(2);
  for (const each of [ben, cara]) {
    expect(each.errors).toEqual([]);
    await each.context.close();
  }
});

test('a friend who goes in the middle ends the game for the other, who can play on their own again', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openGame(page, {}, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await openGame(ben.page, {}, GAME, `#bounce=${code}`);
  await bothPlaying(page, ben.page);
  await ben.context.close();
  await waitForScreen(page, 'finish');
  await expect(page.locator('.friends-results')).toBeVisible();
  // On their own again: the computer, and nothing more sent.
  await page.locator('#friends-leave').evaluate((button) => button.click());
  await show(page, ...OPEN);
  await page.locator('#play-again').click();
  await waitForScreen(page, 'playing');
  expect((await view(page)).mode).toBe('solo');
});
