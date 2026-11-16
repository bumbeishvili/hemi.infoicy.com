// Playing Balloon Pop with friends: two children, each on their own computer with their own camera, play one
// game. The host's game runs the balloons and the sums, and everyone sees the same ones: whoever's
// hand gets to a balloon first has it, and it's gone for everyone. Together, as the game comes, every pop counts
// for the team, which has so many to pop between them before the time is up. Against each other, a grown-up's
// choice, whoever pops the most in the time comes first. Here they're two separate browsers, talking through
// the race server on this computer (tools/race-server.mjs).
import { expect, openGame, show, test, waitForScreen } from './helpers.js';

const GAME = 'balloon-pop';

const popOf = (page) => page.evaluate(() => {
  const { game, balloons, deck } = window.__game;
  return {
    timed: game.timed ? { ...game.timed } : null,
    team: game.team ? { ...game.team, total: game.teamTotal } : null,
    lost: game.lost,
    total: balloons.total,
    asking: Boolean(deck),
    mathsOn: game.mathsOn,
    host: game.shared?.host ?? null,
    ids: balloons.balloons.map(({ id }) => id),
    ownLevel: window.__game.session.levels.current,
    question: document.querySelector('#maths-question').textContent,
  };
});

/** Where each balloon is, by id, across and down the screen. */
const balloonsOf = (page) => page.evaluate(() => {
  const { balloons } = window.__game;
  return Object.fromEntries(balloons.balloons.map(({ id, x, y, number }) => [id, { x: x / balloons.width, y: y / balloons.height, number }]));
});

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

/** Both get through the hand check and wait for each other, and then both play, hands out of view. */
async function bothPlaying(page, other) {
  for (const each of [page, other]) {
    await show(each, null, 'open');
    await each.locator('#start').click();
  }
  await waitForScreen(page, 'playing');
  await waitForScreen(other, 'playing');
  for (const each of [page, other]) {
    await show(each, null, null);
    await expect.poll(() => each.evaluate(() => window.__game.balloons.gloves.right.visible)).toBe(false);
  }
}

const gloveAt = (page) => page.evaluate(() => {
  const { balloons } = window.__game;
  const glove = balloons.gloves.right;
  return glove.visible ? { x: glove.x / balloons.width, y: glove.y / balloons.height } : null;
});

/** On the host's game, a balloon that stays still, there, across and down the screen. Returns its id. */
const balloonOnHost = (host, { x, y }) => host.evaluate(([across, down]) => {
  const { balloons } = window.__game;
  return balloons.spawnAt(across * balloons.width, down * balloons.height, { still: true }).id;
}, [x, y]);

/** The time runs out, for both. */
async function timeUp(page, other) {
  for (const each of [page, other]) {
    await each.evaluate(() => {
      window.__game.game.timed.left = 0.5;
    });
  }
  await waitForScreen(page, 'finish');
  await waitForScreen(other, 'finish');
}

test('two friends play with the same balloons, and whoever\'s hand gets to one first has it, and it\'s gone for both', async ({ page, browser }) => {
  test.setTimeout(300_000);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openGame(page, { balloons: 20, maths: 'off', popFriends: 'against', levels: { 'balloon-pop': 2 } }, GAME);
  const code = await makeGame(page, 'Ana');
  expect(page.url()).toContain(`#pop=${code}`);

  // The friend has 60 balloons and times tables of their own, but plays the host's game.
  const ben = await secondPlayer(browser);
  await openGame(ben.page, { balloons: 60, maths: 'times' }, GAME, `#pop=${code}`);
  // Typed straight away, as the link is opened, even before the connection is up.
  await ben.page.locator('#friends-name').fill('Ben');
  await ben.page.locator('#friends-name').dispatchEvent('change');
  await expect(page.locator('#friends-here')).toContainText('Ben');

  await bothPlaying(page, ben.page);
  const ana = await popOf(page);
  const his = await popOf(ben.page);
  expect([ana.host, his.host]).toEqual([true, false]);
  expect([ana.timed.seconds, his.timed.seconds]).toEqual([60, 60]);
  expect([ana.mathsOn, his.mathsOn]).toEqual([false, false]);

  // Ben sees the very balloons Ana's game has, where they are on hers.
  await expect.poll(async () => (await popOf(ben.page)).ids.length, { timeout: 15_000 }).toBeGreaterThan(1);
  await page.waitForTimeout(500);
  const [hers, seen] = await Promise.all([balloonsOf(page), balloonsOf(ben.page)]);
  const shared = Object.keys(seen).filter((id) => hers[id]);
  expect(shared.length).toBeGreaterThan(1);
  expect(shared.length).toBe(Object.keys(seen).length);
  for (const id of shared) expect(Math.abs(hers[id].y - seen[id].y)).toBeLessThan(0.08);
  await ben.page.screenshot({ path: 'test-results/screens/pop-friends-same-balloons.png' });

  // A still balloon on Ben's hand, on Ana's game: Ben pops it on his, it counts for him, and it's gone from hers.
  await show(ben.page, null, 'open');
  await expect.poll(() => gloveAt(ben.page)).not.toBe(null);
  const forBen = await balloonOnHost(page, await gloveAt(ben.page));
  await expect.poll(async () => (await popOf(ben.page)).total, { timeout: 15_000 }).toBe(1);
  await expect.poll(async () => (await popOf(page)).ids.includes(forBen), { timeout: 5000 }).toBe(false);
  expect((await popOf(page)).total).toBe(0);
  await show(ben.page, null, null);

  // Both hands on the same balloon: only one of them gets it.
  for (const each of [page, ben.page]) await show(each, null, 'open');
  await expect.poll(() => gloveAt(page)).not.toBe(null);
  await expect.poll(() => gloveAt(ben.page)).not.toBe(null);
  const before = (await popOf(page)).total + (await popOf(ben.page)).total;
  const both = await balloonOnHost(page, await gloveAt(page));
  await expect.poll(async () => (await popOf(page)).ids.includes(both) || (await popOf(ben.page)).ids.includes(both), { timeout: 15_000 }).toBe(false);
  await page.waitForTimeout(1500);
  for (const each of [page, ben.page]) await show(each, null, null);
  // Anything else a hand touched in that moment counts too, so it's this balloon that's checked: one point.
  const claims = await Promise.all([page, ben.page].map((each) => each.evaluate((id) => window.__game.game.myClaims.has(id), both)));
  expect(claims.some(Boolean)).toBe(true);
  const after = (await popOf(page)).total + (await popOf(ben.page)).total;
  expect(after).toBeGreaterThan(before);

  // Scores on both screens, and the finish card ranks by them.
  const [anaScore, benScore] = [(await popOf(page)).total, (await popOf(ben.page)).total];
  await expect(page.locator('#pop-scores')).toContainText(new RegExp(`Ben\\s*${benScore}`));
  await expect(ben.page.locator('#pop-scores')).toContainText(new RegExp(`Ana\\s*${anaScore}`));
  await timeUp(page, ben.page);
  const top = anaScore >= benScore ? 'You' : 'Ben';
  await expect(page.locator('.friends-results li').nth(0)).toContainText(top);
  await page.screenshot({ path: 'test-results/screens/pop-friends-finish.png' });

  // Nobody's own level moves on, nobody's settings change, and the only connection was to the race server.
  expect((await popOf(page)).ownLevel).toBe(2);
  expect(await ben.page.evaluate(() => window.__game.session.settings.maths)).toBe('times');
  expect(sockets).toEqual([`ws://localhost:${Number(new URL(test.info().project.use.baseURL).port) + 1}/room/balloon-pop/${code}?make=1`]);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('everyone answers the same sum, the first right answer counts for whoever got it, and then everyone gets the next', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openGame(page, { balloons: 40, maths: 'add', popFriends: 'against' }, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await openGame(ben.page, { maths: 'off' }, GAME, `#pop=${code}`);
  await bothPlaying(page, ben.page);
  const [ana, his] = [await popOf(page), await popOf(ben.page)];
  expect([ana.team, his.team]).toEqual([null, null]);
  expect([ana.timed.seconds, his.timed.seconds]).toEqual([120, 120]);
  // Only the host asks the sums, and Ben, with maths off himself, does them too.
  expect([ana.asking, his.asking]).toEqual([true, false]);
  await expect(ben.page.locator('#chip-popped-label')).toHaveText('Right answers');

  // The same sum on both screens, and the same answers on the balloons.
  await expect.poll(async () => (await popOf(page)).question, { timeout: 15_000 }).toMatch(/= \?$/);
  const sum = (await popOf(page)).question;
  await expect.poll(async () => (await popOf(ben.page)).question, { timeout: 10_000 }).toBe(sum);
  const answers = async (each) => Object.values(await balloonsOf(each)).filter(({ number }) => number !== undefined).map(({ number }) => number).sort((a, b) => a - b);
  await expect.poll(async () => (await answers(ben.page)).join(','), { timeout: 10_000 }).toBe((await answers(page)).join(','));
  await ben.page.screenshot({ path: 'test-results/screens/pop-friends-same-sum.png' });

  // Ben gets the right one: it counts for him, not Ana, and both move on to the next sum.
  await ben.page.evaluate(() => {
    const { balloons, game } = window.__game;
    const right = balloons.balloons.find(({ number }) => number === balloons.rightNumber);
    balloons.removeShared(right.id);
    game.claimBalloon(right, 'right', true);
  });
  await expect.poll(async () => (await popOf(ben.page)).total, { timeout: 10_000 }).toBe(1);
  expect((await popOf(page)).total).toBe(0);
  await expect.poll(async () => (await popOf(page)).question, { timeout: 15_000 }).not.toBe(sum);
  await expect.poll(async () => (await popOf(page)).question, { timeout: 15_000 }).toMatch(/= \?$/);
  const next = (await popOf(page)).question;
  await expect.poll(async () => (await popOf(ben.page)).question, { timeout: 10_000 }).toBe(next);

  await timeUp(page, ben.page);
  await expect(ben.page.locator('#screen-finish h2')).toHaveText('You got the most right!');
  await expect(ben.page.locator('.friends-results li').nth(0)).toContainText('1st You 1 right');
  await expect(page.locator('.friends-results li').nth(0)).toContainText('1 right');
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('on their own, a game goes to its usual goal, and nothing connects anywhere', async ({ page }) => {
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openGame(page, { balloons: 20 }, GAME);
  await show(page, null, 'open');
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
  expect((await popOf(page)).timed).toBe(null);
  await expect(page.locator('#chip-popped')).toHaveText('0 of 20');
  await expect(page.locator('#chip-time-box')).toBeHidden();
  await expect(page.locator('#pop-scores')).toBeHidden();
  expect(sockets).toEqual([]);
});

/* ---------- together ---------- */

/** As many as this popped already, on one child's game, as if they had: their friends hear the score. */
const poppedAlready = (page, count) => page.evaluate((n) => {
  window.__game.balloons.popped.right = n;
}, count);

/** What was said at the end and whether it was cheered: the voice's line, whether it was lost, and the confetti. */
const howItEnded = (page) => page.evaluate(() => ({ ...window.__game.sound.finished, confetti: window.__game.hud.confetti.running }));

/** Ana makes a game and Ben joins it, each with their name, and both play, hands out of view. Returns Ben's player. */
async function anaAndBen(page, browser) {
  await openGame(page, { balloons: 20, maths: 'off', away: 'count' }, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await openGame(ben.page, { away: 'count' }, GAME, `#pop=${code}`);
  await ben.page.locator('#friends-name').fill('Ben');
  await ben.page.locator('#friends-name').dispatchEvent('change');
  await expect(page.locator('#friends-here')).toContainText('Ben');
  await bothPlaying(page, ben.page);
  return ben;
}

/**
 * A child's connection goes, as when the wifi drops, and their game can't get back in until connectionBack: it
 * keeps trying, and gets nowhere.
 */
const loseConnection = (page) => page.evaluate(() => {
  const { room } = window.__game.game.friends;
  room.connect = () => {};
  room.socket.close();
});

/** The wifi is back: the game gets back in, as the same player. */
async function connectionBack(page) {
  await page.evaluate(() => {
    const { room } = window.__game.game.friends;
    delete room.connect;
    room.connect();
  });
  await expect.poll(() => page.evaluate(() => window.__game.game.friends.room.status)).toBe('in');
}

test('together, as the game comes: every pop counts for the team on both screens, and the game is won for both as soon as they have enough between them', async ({ page, browser }) => {
  test.setTimeout(300_000);
  // The clock is on unless a grown-up chose Gentle, which these tests' games otherwise are.
  await openGame(page, { balloons: 20, maths: 'off', away: 'count', levels: { 'balloon-pop': 3 } }, GAME);
  const code = await makeGame(page, 'Ana');
  // Whoever made the game chooses, and it comes as together.
  await expect(page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await expect(page.locator('input[name="friends-team"][value="together"]')).toBeEnabled();
  await expect(page.locator('#friends-how')).toContainText('every pop counts for your team');

  // Ben's own choice is against each other, with 40 balloons, but it's Ana's game: he's shown her choice, and can't
  // change it, and it's her 20 the team's goal goes by.
  const ben = await secondPlayer(browser);
  await openGame(ben.page, { popFriends: 'against', away: 'count', balloons: 40 }, GAME, `#pop=${code}`);
  await ben.page.locator('#friends-name').fill('Ben');
  await ben.page.locator('#friends-name').dispatchEvent('change');
  await expect(page.locator('#friends-here')).toContainText('Ben');
  await expect(ben.page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await expect(ben.page.locator('input[name="friends-team"][value="together"]')).toBeDisabled();
  await expect(ben.page.locator('#friends-teams-whose')).toHaveText('Ana chose.');

  await bothPlaying(page, ben.page);
  const [ana, his] = [await popOf(page), await popOf(ben.page)];
  // 30 between them, in the minute a game of 20 lasts.
  expect([ana.team.goal, his.team.goal]).toEqual([30, 30]);
  expect([ana.timed.seconds, his.timed.seconds, ana.timed.endless, his.timed.endless]).toEqual([60, 60, false, false]);
  for (const each of [page, ben.page]) {
    await expect(each.locator('#chip-popped-label')).toHaveText('Popped together');
    await expect(each.locator('#chip-popped')).toHaveText('0 of 30');
    await expect(each.locator('#chip-time-box')).toBeVisible();
  }

  // Ben pops one: it's one for the team, on both screens, and one against his own name.
  await show(ben.page, null, 'open');
  await expect.poll(() => gloveAt(ben.page)).not.toBe(null);
  await balloonOnHost(page, await gloveAt(ben.page));
  await expect.poll(async () => (await popOf(ben.page)).total, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  await show(ben.page, null, null);
  await page.waitForTimeout(600);
  const benPopped = (await popOf(ben.page)).total;
  await expect(page.locator('#chip-popped')).toHaveText(`${benPopped} of 30`);
  await expect(ben.page.locator('#chip-popped')).toHaveText(`${benPopped} of 30`);
  await expect(page.locator('#pop-scores')).toContainText(new RegExp(`You\\s*0\\s*Ben\\s*${benPopped}`));
  expect((await popOf(page)).total).toBe(0);
  await ben.page.screenshot({ path: 'test-results/screens/pop-together-playing.png' });

  // Ana has popped most of the rest. The bar is how far the team has got, not the clock.
  await poppedAlready(page, 28 - benPopped);
  await expect(ben.page.locator('#chip-popped')).toHaveText('28 of 30');
  const bar = await ben.page.evaluate(() => parseFloat(document.getElementById('race-progress-fill').style.width));
  expect(bar).toBe(93);
  for (const each of [page, ben.page]) expect(await each.evaluate(() => window.__game.session.screen)).toBe('playing');

  // Two more from Ana and that's 30: both games end at once, won, with the team's card.
  await poppedAlready(page, 30 - benPopped);
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  for (const each of [page, ben.page]) {
    await expect(each.locator('#screen-finish h2')).toHaveText('You popped them together!');
    await expect(each.locator('#finish-story')).toHaveText('You popped 30 balloons together!');
    await expect(each.locator('#finish-story')).toBeVisible();
    await expect(each.locator('#finish-hero')).toHaveText('30');
    await expect(each.locator('.friends-results')).toHaveClass(/is-team/);
    await expect(each.locator('.friends-results li')).toHaveCount(2);
    // Nobody is placed: there's no 1st or 2nd on a team.
    await expect(each.locator('.friends-results')).not.toContainText(/1st|2nd/);
    expect(await each.evaluate(() => [window.__game.game.lost, window.__game.session.finishLine])).toEqual([false, 'You did it together!']);
    expect(await howItEnded(each)).toEqual({ line: 'You did it together!', lost: false, confetti: true });
    await expect(each.locator('#screen-finish .finish-actions .big-button').first()).toHaveText('Play again');
  }
  await expect(page.locator('.friends-results')).toContainText(`${30 - benPopped} popped`);
  await expect(page.locator('.friends-results')).toContainText(`${benPopped} popped`);
  await page.screenshot({ path: 'test-results/screens/pop-together-won.png' });
  // It was the host's level, so nobody's own moves on.
  expect((await popOf(page)).ownLevel).toBe(3);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('together, when the time is up before the team has enough it ends for both, kindly, to be tried again', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openGame(page, { balloons: 20, maths: 'off', away: 'count' }, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await openGame(ben.page, { away: 'count' }, GAME, `#pop=${code}`);
  await bothPlaying(page, ben.page);
  await poppedAlready(page, 12);
  await expect(ben.page.locator('#chip-popped')).toHaveText('12 of 30');
  // Only Ana's clock is run down here: Ben's game hears that hers has ended, and ends the same way.
  await page.evaluate(() => {
    window.__game.game.timed.endsAt = performance.now() + 300;
  });
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  for (const each of [page, ben.page]) {
    await expect(each.locator('#screen-finish h2')).toHaveText('Time’s up!');
    await expect(each.locator('#finish-story')).toHaveText('You popped 12 of 30 together.');
    await expect(each.locator('#finish-story')).toBeVisible();
    await expect(each.locator('#screen-finish .finish-actions .big-button').first()).toHaveText('Try again');
    expect(await each.evaluate(() => [window.__game.game.lost, window.__game.session.finishLine])).toEqual([true, 'So close! Try again!']);
    // Nothing is cheered: no fanfare, no clapping and no confetti.
    expect(await howItEnded(each)).toEqual({ line: 'So close! Try again!', lost: true, confetti: false });
  }
  expect((await popOf(ben.page)).timed.left).toBeGreaterThan(30);
  await page.screenshot({ path: 'test-results/screens/pop-together-time-up.png' });
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('together with the host\'s game on Gentle there is no clock, and with the maths challenge the team\'s right answers add up', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openGame(page, { balloons: 20, maths: 'add', away: 'gentle' }, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  // Ben's own game has its clock and no sums, but it's Ana's that's played.
  await openGame(ben.page, { maths: 'off', away: 'count' }, GAME, `#pop=${code}`);
  await bothPlaying(page, ben.page);
  const [ana, his] = [await popOf(page), await popOf(ben.page)];
  expect([ana.timed.endless, his.timed.endless]).toEqual([true, true]);
  expect([ana.team.goal, his.team.goal]).toEqual([7, 7]);
  for (const each of [page, ben.page]) {
    await expect(each.locator('#chip-time-box')).toBeHidden();
    await expect(each.locator('#chip-popped-label')).toHaveText('Right together');
    await expect(each.locator('#chip-popped')).toHaveText('0 of 7');
  }
  // No time goes by on either.
  await page.waitForTimeout(1500);
  expect([(await popOf(page)).timed.left, (await popOf(ben.page)).timed.left]).toEqual([60, 60]);

  // Ben gets a sum right: one for the team.
  await expect.poll(async () => (await popOf(ben.page)).question, { timeout: 20_000 }).toMatch(/= \?$/);
  await expect.poll(() => ben.page.evaluate(() => window.__game.balloons.balloons.some(({ number }) => number === window.__game.balloons.rightNumber)), { timeout: 20_000 }).toBe(true);
  await ben.page.evaluate(() => {
    const { balloons, game } = window.__game;
    const right = balloons.balloons.find(({ number }) => number === balloons.rightNumber);
    balloons.removeShared(right.id);
    game.claimBalloon(right, 'right', true);
  });
  await expect(page.locator('#chip-popped')).toHaveText('1 of 7');
  await expect(ben.page.locator('#chip-popped')).toHaveText('1 of 7');
  // Six more from Ana, and the team has its seven.
  await poppedAlready(page, 6);
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  for (const each of [page, ben.page]) {
    await expect(each.locator('#screen-finish h2')).toHaveText('You did the sums together!');
    await expect(each.locator('#finish-story')).toHaveText('You got 7 right together!');
  }
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('whoever made the game can change to against each other in the friends box: it\'s kept with the grown-ups\' settings, and the friend is shown at once', async ({ page, browser }) => {
  await openGame(page, { balloons: 20 }, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await openGame(ben.page, {}, GAME, `#pop=${code}`);
  await expect(ben.page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await page.locator('input[name="friends-team"][value="against"]').check();
  await expect(ben.page.locator('input[name="friends-team"][value="against"]')).toBeChecked();
  await expect(ben.page.locator('#friends-how')).not.toContainText('every pop counts');
  expect(await page.evaluate(() => window.__game.session.settings.popFriends)).toBe('against');
  await expect(page.locator('input[name="popFriends"][value="against"]')).toBeChecked();
  // Ben's own choice is left as it was.
  expect(await ben.page.evaluate(() => window.__game.session.settings.popFriends)).toBe('together');
  // And back, from the grown-ups' panel this time.
  await page.locator('#open-panel').click();
  await page.locator('input[name="popFriends"][value="together"]').check();
  await page.locator('#close-panel').click();
  await expect(ben.page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await expect(page.locator('input[name="friends-team"][value="together"]')).toBeChecked();

  // Against each other it's the game it was: no team, the time, and places on the card.
  await page.locator('input[name="friends-team"][value="against"]').check();
  await expect(ben.page.locator('input[name="friends-team"][value="against"]')).toBeChecked();
  await bothPlaying(page, ben.page);
  expect([(await popOf(page)).team, (await popOf(ben.page)).team]).toEqual([null, null]);
  await expect(page.locator('#chip-popped-label')).toHaveText('Popped');
  await timeUp(page, ben.page);
  await expect(page.locator('.friends-results')).not.toHaveClass(/is-team/);
  await expect(page.locator('.friends-results li').nth(0)).toContainText('1st');
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('together, a friend who leaves in the middle keeps what they popped in the team\'s total, and the others play on', async ({ page, browser }) => {
  test.setTimeout(300_000);
  const ben = await anaAndBen(page, browser);
  await poppedAlready(ben.page, 5);
  await expect(page.locator('#chip-popped')).toHaveText('5 of 30');
  expect(ben.errors).toEqual([]);
  await ben.context.close();
  // After a few seconds Ana's game takes it that Ben has gone: his name goes from the scores, and his pops stay.
  await expect(page.locator('#pop-scores')).not.toContainText('Ben', { timeout: 15_000 });
  await expect(page.locator('#chip-popped')).toHaveText('5 of 30');
  expect(await page.evaluate(() => window.__game.session.screen)).toBe('playing');
  // Ana pops the rest on her own, and the team has won.
  await poppedAlready(page, 25);
  await waitForScreen(page, 'finish');
  await expect(page.locator('#screen-finish h2')).toHaveText('You popped them together!');
  await expect(page.locator('#finish-story')).toHaveText('You popped 30 balloons together!');
  await expect(page.locator('#finish-hero')).toHaveText('30');
});

test('together, if whoever made the game leaves in the middle, it\'s over for the others, short of the goal, kindly', async ({ page, browser }) => {
  test.setTimeout(300_000);
  // Ben makes the game this time, with the maths challenge, and Ana joins it.
  const ben = await secondPlayer(browser);
  await openGame(ben.page, { balloons: 20, maths: 'add', away: 'count' }, GAME);
  const code = await makeGame(ben.page, 'Ben');
  await openGame(page, { away: 'count' }, GAME, `#pop=${code}`);
  await expect(ben.page.locator('#friends-here li')).toHaveCount(2);
  await bothPlaying(page, ben.page);
  expect((await popOf(page)).host).toBe(false);
  await poppedAlready(page, 3);
  await expect(ben.page.locator('#chip-popped')).toHaveText('3 of 7');
  expect(ben.errors).toEqual([]);
  await ben.context.close();
  // There are no more balloons or sums without Ben's game, so a few seconds later Ana's is over, short of 7.
  await waitForScreen(page, 'finish');
  await expect(page.locator('#finish-story')).toHaveText('You got 3 of 7 right together.');
  await expect(page.locator('#finish-story')).toBeVisible();
  await expect(page.locator('#screen-finish .finish-actions .big-button').first()).toHaveText('Try again');
  expect(await page.evaluate(() => window.__game.game.lost)).toBe(true);
  expect(await howItEnded(page)).toEqual({ line: 'So close! Try again!', lost: true, confetti: false });
  // Most of the minute was still to go.
  expect((await popOf(page)).timed.left).toBeGreaterThan(30);
});

test('together, a pop on a friend\'s computer in the moment after the time is up on this one still counts, and wins it for both', async ({ page, browser }) => {
  test.setTimeout(300_000);
  const ben = await anaAndBen(page, browser);
  await poppedAlready(page, 29);
  await expect(ben.page.locator('#chip-popped')).toHaveText('29 of 30');
  // Ana's time is up a moment before Ben's: her game waits that moment for the last pops from his.
  await page.evaluate(() => {
    window.__game.game.timed.endsAt = performance.now() + 10;
  });
  await expect.poll(() => page.evaluate(() => window.__game.game.team.closing)).not.toBe(null);
  await poppedAlready(ben.page, 1);
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  for (const each of [page, ben.page]) {
    await expect(each.locator('#screen-finish h2')).toHaveText('You popped them together!');
    await expect(each.locator('#finish-story')).toHaveText('You popped 30 balloons together!');
    expect(await howItEnded(each)).toEqual({ line: 'You did it together!', lost: false, confetti: true });
  }
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('together, a friend who loses the connection for a while and comes back is counted once: what they popped before stays the team\'s, and what they pop after adds to it', async ({ page, browser }) => {
  test.setTimeout(300_000);
  const ben = await anaAndBen(page, browser);
  await poppedAlready(ben.page, 5);
  await expect(page.locator('#chip-popped')).toHaveText('5 of 30');
  // Ben's wifi goes for longer than a moment: Ana's game takes it that he has gone, and keeps what he popped.
  await loseConnection(ben.page);
  await expect(page.locator('#pop-scores')).not.toContainText('Ben', { timeout: 15_000 });
  await expect(page.locator('#chip-popped')).toHaveText('5 of 30');
  // He's back, as the same player, and pops one more: that's 6 for the team, and not his 5 twice and then one.
  await connectionBack(ben.page);
  await poppedAlready(ben.page, 6);
  await expect(ben.page.locator('#chip-popped')).toHaveText('6 of 30');
  await expect(page.locator('#chip-popped')).toHaveText('6 of 30');
  // And the team wins at 30 between them, not before.
  await poppedAlready(page, 23);
  await expect(ben.page.locator('#chip-popped')).toHaveText('29 of 30');
  expect(await page.evaluate(() => window.__game.session.screen)).toBe('playing');
  await poppedAlready(page, 24);
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  await expect(page.locator('#finish-story')).toHaveText('You popped 30 balloons together!');
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('together, playing again after a team game starts afresh, and a change to against each other in the middle of one waits for the next', async ({ page, browser }) => {
  test.setTimeout(300_000);
  const ben = await anaAndBen(page, browser);
  // The first game: the time is up with 4 of 30.
  await poppedAlready(page, 4);
  await expect(ben.page.locator('#chip-popped')).toHaveText('4 of 30');
  await timeUp(page, ben.page);
  await expect(ben.page.locator('#screen-finish h2')).toHaveText('Time’s up!');

  // Both try again: a new game, from nothing, which the last one's ending doesn't end.
  for (const each of [page, ben.page]) await each.locator('#play-again').click();
  await waitForScreen(page, 'playing');
  await waitForScreen(ben.page, 'playing');
  for (const each of [page, ben.page]) {
    await expect(each.locator('#chip-popped')).toHaveText('0 of 30');
    expect(await each.evaluate(() => {
      const { game } = window.__game;
      return { lost: game.lost, closing: game.team.closing, total: game.teamTotal, results: game.friends.results.size, line: game.session.finishLine };
    })).toEqual({ lost: false, closing: null, total: 0, results: 0, line: 'You popped them all!' });
    expect((await popOf(each)).timed.left).toBeGreaterThan(50);
  }

  // In the middle of it, a grown-up at Ana's chooses against each other. It's for the next game: this one goes on as it was.
  await page.locator('#open-panel').click();
  await page.locator('input[name="popFriends"][value="against"]').check();
  await page.locator('#close-panel').click();
  await expect.poll(() => ben.page.evaluate(() => window.__game.game.friends.room.team)).toBe(false);
  for (const each of [page, ben.page]) {
    expect(await each.evaluate(() => window.__game.session.screen)).toBe('playing');
    await expect(each.locator('#chip-popped-label')).toHaveText('Popped together');
  }
  // This time they get there, and it's won for both, and cheered.
  await poppedAlready(page, 30);
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  for (const each of [page, ben.page]) {
    await expect(each.locator('#screen-finish h2')).toHaveText('You popped them together!');
    await expect(each.locator('#finish-story')).toHaveText('You popped 30 balloons together!');
    await expect(each.locator('#screen-finish .finish-actions .big-button').first()).toHaveText('Play again');
    expect(await howItEnded(each)).toEqual({ line: 'You did it together!', lost: false, confetti: true });
  }

  // The next game is against each other.
  for (const each of [page, ben.page]) await each.locator('#play-again').click();
  await waitForScreen(page, 'playing');
  await waitForScreen(ben.page, 'playing');
  for (const each of [page, ben.page]) {
    expect((await popOf(each)).team).toBe(null);
    await expect(each.locator('#chip-popped-label')).toHaveText('Popped');
    await expect(each.locator('#chip-popped')).toHaveText('0');
  }
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('on their own straight after a team game, nothing of the team\'s is left: the count, the clock, the scores and the card are their own', async ({ page, browser }) => {
  test.setTimeout(300_000);
  const ben = await anaAndBen(page, browser);
  await poppedAlready(page, 30);
  await waitForScreen(page, 'finish');
  await expect(page.locator('#finish-story')).toHaveText('You popped 30 balloons together!');

  // Ana plays again, and then on her own rather than wait for Ben.
  await page.locator('#play-again').click();
  await waitForScreen(page, 'waiting');
  await page.locator('#friends-alone').click();
  await waitForScreen(page, 'playing');
  expect([(await popOf(page)).team, (await popOf(page)).timed]).toEqual([null, null]);
  await expect(page.locator('#chip-popped-label')).toHaveText('Popped');
  await expect(page.locator('#chip-popped')).toHaveText('0 of 20');
  await expect(page.locator('#chip-time-box')).toBeHidden();
  await expect(page.locator('#pop-scores')).toBeHidden();
  expect(await page.evaluate(() => [document.body.hasAttribute('data-friends-team'), document.body.hasAttribute('data-friends-race')])).toEqual([false, false]);

  // Her own 20, and the card is the usual one: no team, no story, nobody else.
  await poppedAlready(page, 20);
  await waitForScreen(page, 'finish');
  await expect(page.locator('#screen-finish h2')).toHaveText('You popped them all!');
  await expect(page.locator('#finish-story')).toBeHidden();
  await expect(page.locator('#finish-hero')).toHaveText('20');
  await expect(page.locator('.friends-results')).toBeHidden();
  expect(await howItEnded(page)).toEqual({ line: 'You popped them all!', lost: false, confetti: true });
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

/* ---------- together: every computer ends the same way ---------- */

// The race server passes a game's ending on only to those connected at that moment, and nothing says it again to
// someone who comes back. So a friend whose wifi went for a second just as the team won never hears how it ended.
// Their game sees, from who's still playing, that their friend's game is over with time still on the clock, which
// can only be because the team had enough.
test('together, a friend whose connection goes for a moment just as the team wins hears of it when it\'s back, and it ends won for them too', async ({ page, browser }) => {
  test.setTimeout(300_000);
  const ben = await anaAndBen(page, browser);
  await poppedAlready(page, 25);
  await expect(ben.page.locator('#chip-popped')).toHaveText('25 of 30');
  // Ben's wifi goes for a moment, and in it Ana pops the last five.
  await loseConnection(ben.page);
  await poppedAlready(page, 30);
  await waitForScreen(page, 'finish');
  await expect(page.locator('#screen-finish h2')).toHaveText('You popped them together!');
  // It's back a moment later, well before anyone counts as gone.
  await connectionBack(ben.page);
  await expect.poll(() => ben.page.evaluate(() => window.__game.session.screen), { timeout: 15_000 }).toBe('finish');
  await expect(ben.page.locator('#screen-finish h2')).toHaveText('You popped them together!');
  // His card is a win like hers: cheered, with what the team had to pop, and Ana on it as finished.
  expect(await howItEnded(ben.page)).toEqual({ line: 'You did it together!', lost: false, confetti: true });
  await expect(ben.page.locator('#finish-story')).toHaveText('You popped 30 balloons together!');
  await expect(ben.page.locator('.friends-results')).not.toContainText('still playing');
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

// Each computer decides for itself, and tells the others after. When one's time is up, and its moment for late pops
// has gone, it ends lost. A pop on another computer, landing before it hears that, wins it there. So that one
// child isn't left with "Time's up!" while the other is cheered, a win on any computer is a win for all: the card
// that said the time was up says it was won after all, as soon as it hears. (The team's clock goes by the clock on
// the wall, the same on every computer, so this takes a slow connection as well.)
test('together, when one computer\'s time is up just as the team\'s last pop lands on another, both end the same way', async ({ page, browser }) => {
  test.setTimeout(300_000);
  const ben = await anaAndBen(page, browser);
  await poppedAlready(page, 29);
  await expect(ben.page.locator('#chip-popped')).toHaveText('29 of 30');
  // What comes to Ben's game is slow just now: a second and a half on the way.
  await ben.page.evaluate(() => {
    const { room } = window.__game.game.friends;
    const hear = room.hear.bind(room);
    room.hear = (text) => setTimeout(() => hear(text), 1500);
  });
  // Ana's time is up, and after its moment for late pops her game is over. Ben's clock still has time, and he
  // pops the last one before he hears that hers is over.
  await page.evaluate(() => {
    window.__game.game.timed.endsAt = performance.now() + 10;
  });
  await waitForScreen(page, 'finish');
  await poppedAlready(ben.page, 1);
  await waitForScreen(ben.page, 'finish');
  await expect(ben.page.locator('#screen-finish h2')).toHaveText('You popped them together!');
  // Ana's card said the time was up, and now says what Ben's does, with the cheer it didn't have and its usual button.
  await expect(page.locator('#screen-finish h2')).toHaveText('You popped them together!');
  await expect(page.locator('#finish-story')).toHaveText('You popped 30 balloons together!');
  await expect(page.locator('#finish-hero')).toHaveText('30');
  await expect(page.locator('#screen-finish .finish-actions .big-button').first()).toHaveText('Play again');
  expect(await page.evaluate(() => window.__game.hud.confetti.running)).toBe(true);
  const titles = await Promise.all([page, ben.page].map((each) => each.locator('#screen-finish h2').textContent()));
  expect(titles[1]).toBe(titles[0]);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});
