// Giraffe's Riddle Doors with friends: each on their own computer with their own camera. Together, they all work on the
// same door, each sees the others' gloves and the pieces in them, a piece one child holds can't be taken by another,
// and a piece one tried that didn't fit is greyed for everyone. Against each other, each has a copy of the same doors,
// and the first to open them all wins. Here they're separate browsers, talking through the race server on this
// computer (tools/race-server.mjs).
import { openGame, shot } from '../helpers.js';
import { expect, expectSoon, FIST, GAME, joinGame, leadHand, makeGame, OPEN, secondPlayer, show, state, stopHand, test, waitForScreen } from './helpers.js';

/** How it is on one child's screen. */
const view = (page) => page.evaluate(() => {
  const { game, doors, session } = window.__game;
  return {
    mode: game.mode,
    level: doors.level,
    total: doors.total,
    index: doors.index,
    candles: doors.candles,
    riddles: doors.doors.map(({ riddle }) => JSON.stringify(riddle)),
    tiles: doors.tiles.map(({ id, x, y, state: how, holder }) => ({ id, x, y, state: how, holder })),
    held: doors.held?.id ?? null,
    opened: doors.stats.opened,
    wrong: doors.stats.wrong,
    you: game.friends.room.you,
    tally: Object.fromEntries(doors.tally),
    friends: game.friendHands.map(({ name, fade, n, glove }) => ({ name, fade, n, seen: glove.visible })),
    ownLevel: session.levels.current,
    done: doors.done,
    shared: Boolean(doors.shared),
  };
});

/**
 * Everyone gets through the hand check and waits for each other. As the countdown starts their hands close, so nobody
 * has a piece as the game begins, and what happens next is what the test does.
 */
async function allPlayingWithHandsClosed(...pages) {
  for (const each of pages) {
    await show(each, ...OPEN);
    await each.locator('#start').click();
  }
  for (const each of pages) await waitForScreen(each, 'countdown');
  for (const each of pages) await show(each, ...FIST);
  for (const each of pages) await waitForScreen(each, 'playing');
}

test('friends together: one door for everyone, a piece one tried that didn\'t fit is greyed for both, and every door opened on both screens at once', async ({ page, browser }) => {
  test.setTimeout(420_000);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openGame(page, { levels: { [GAME]: 6 } }, GAME);
  const code = await makeGame(page, 'Ana');
  expect(page.url()).toContain(`#doors=${code}`);
  await expect(page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  // The friend would have chosen against, and has a level of their own, but plays the host's game.
  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, { doorFriends: 'against', doorCandles: 'five' }, 'Ben');
  await expect(page.locator('#friends-here')).toContainText('Ben');
  await expect(ben.page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await expect(ben.page.locator('input[name="friends-team"][value="together"]')).toBeDisabled();
  await allPlayingWithHandsClosed(page, ben.page);

  const [ana, his] = [await view(page), await view(ben.page)];
  expect([ana.mode, his.mode]).toEqual(['together', 'together']);
  expect([ana.level, his.level]).toEqual([6, 6]);
  // With friends there are no candles: nobody can lose.
  expect([ana.candles, his.candles]).toEqual([null, null]);
  await expect(page.locator('#chip-candles-box')).toBeHidden();
  // The same riddles, and their pieces where they are, on both screens.
  expect(his.riddles).toEqual(ana.riddles);
  expect(his.tiles).toEqual(ana.tiles);
  await expect(page.locator('#door-scores li')).toHaveCount(2);

  // Ana tries a piece that doesn't fit. On Ben's screen it was in her hand, and now it's greyed on its shelf.
  await leadHand(page, { target: '(doors, at) => doors.wants(at, { right: false })' });
  await expectSoon(async () => (await view(page)).held).not.toBe(null);
  const which = (await view(page)).held;
  await expectSoon(async () => (await view(ben.page)).tiles.find(({ id }) => id === which).holder).toBe(ana.you);
  await expectSoon(async () => (await view(ben.page)).friends[0].fade, { timeout: 15_000 }).toBeGreaterThan(0.5);
  await ben.page.waitForTimeout(300);
  await ben.page.screenshot({ path: 'test-results/screens/doors-friends-held-by-friend.png' });
  await expectSoon(async () => (await view(page)).wrong).toBe(1);
  await stopHand(page);
  await show(page, ...FIST);
  await expectSoon(async () => (await view(ben.page)).tiles.find(({ id }) => id === which).state, { timeout: 15_000 }).toBe('tried');

  // They open the doors between them, and it ends on both screens, with how many each opened on the finish card.
  await leadHand(page, { gain: 0.07 });
  await leadHand(ben.page, { gain: 0.07 });
  await waitForScreen(page, 'finish', 300_000);
  await waitForScreen(ben.page, 'finish', 60_000);
  for (const each of [page, ben.page]) await stopHand(each);
  const [aEnd, bEnd] = [await view(page), await view(ben.page)];
  expect(aEnd.tally).toEqual(bEnd.tally);
  expect(Object.values(aEnd.tally).reduce((sum, count) => sum + count, 0)).toBe(6);
  expect(aEnd.opened).toBe(aEnd.tally[aEnd.you] ?? 0);
  await expect(page.locator('#screen-finish h2')).toHaveText('You did it together!');
  await expect(ben.page.locator('#screen-finish h2')).toHaveText('You did it together!');
  await expect(page.locator('.friends-results li')).toHaveCount(2);
  await expect(page.locator('.friends-results')).toContainText(/\d+ doors?/);
  await page.waitForTimeout(600);
  await shot(page, 'doors-friends-finish');

  // Nobody's own level moves on, nobody's settings change, and the only connection was to the race server.
  expect(aEnd.ownLevel).toBe(6);
  expect(bEnd.ownLevel).toBe(1);
  expect(await ben.page.evaluate(() => [window.__game.session.settings.doorFriends, window.__game.session.settings.doorCandles])).toEqual(['against', 'five']);
  const port = Number(new URL(test.info().project.use.baseURL).port) + 1;
  expect(sockets).toEqual([`ws://localhost:${port}/room/riddle-doors/${code}?make=1`]);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('friends against each other: the same doors each, how far each has got along the top, and the first to open them all wins', async ({ page, browser }) => {
  test.setTimeout(420_000);
  await openGame(page, { doorFriends: 'against', levels: { [GAME]: 3 } }, GAME);
  const code = await makeGame(page, 'Ana');
  await expect(page.locator('input[name="friends-team"][value="against"]')).toBeChecked();
  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, { doorFriends: 'together' }, 'Ben');
  await expect(ben.page.locator('input[name="friends-team"][value="against"]')).toBeChecked();
  await allPlayingWithHandsClosed(page, ben.page);

  const [ana, his] = [await view(page), await view(ben.page)];
  expect([ana.mode, his.mode]).toEqual(['against', 'against']);
  expect([ana.shared, his.shared]).toEqual([false, false]);
  expect(his.riddles).toEqual(ana.riddles);

  // Ana gets on with hers, and Ben's stays as it was: but he sees how far she has got.
  await leadHand(page);
  await expectSoon(async () => (await view(page)).opened, { timeout: 90_000 }).toBeGreaterThanOrEqual(2);
  await expectSoon(async () => (await view(ben.page)).friends[0].n, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
  const waiting = await view(ben.page);
  expect(waiting.opened).toBe(0);
  expect(waiting.index).toBe(0);
  expect(waiting.friends[0].seen).toBe(false);
  await expect(ben.page.locator('#door-scores li').first()).toContainText('Ana');
  await expect(ben.page.locator('#door-scores li').first()).toContainText(/[2-6]\/6/);
  await ben.page.screenshot({ path: 'test-results/screens/doors-friends-against.png' });

  // Ana finishes first, and her card says so, with Ben still playing. Ben carries on and finishes too.
  await waitForScreen(page, 'finish', 240_000);
  await stopHand(page);
  await expect(page.locator('#screen-finish h2')).toHaveText('You finished first!');
  await expect(page.locator('.friends-results li.is-racing')).toContainText('still playing');
  await leadHand(ben.page);
  await waitForScreen(ben.page, 'finish', 240_000);
  await stopHand(ben.page);
  await expect(ben.page.locator('#screen-finish h2')).toHaveText('You did it!');
  await expect(ben.page.locator('.friends-results li.is-you')).toContainText('2nd');
  const [aEnd, bEnd] = [await view(page), await view(ben.page)];
  expect([aEnd.opened, bEnd.opened]).toEqual([6, 6]);
  expect([aEnd.ownLevel, bEnd.ownLevel]).toEqual([3, 1]);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});
