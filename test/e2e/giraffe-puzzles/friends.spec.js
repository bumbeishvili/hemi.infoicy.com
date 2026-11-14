// Giraffe's Puzzles with friends: each on their own computer with their own camera. Together, they all put the same
// puzzle back, each sees the others' gloves and the pieces in them, and a piece one child holds can't be taken by
// another. Against each other, each has a copy of the same puzzle, and the first to finish wins. Whoever makes the
// game chooses. Here they're separate browsers, talking through the race server on this computer
// (tools/race-server.mjs).
import { openGame, shot } from '../helpers.js';
import { expect, expectSoon, FIST, GAME, handNow, joinGame, leadHand, makeGame, OPEN, secondPlayer, show, state, stopHand, test, waitForScreen } from './helpers.js';

const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const SPARE = { x: 1, y: 0.9 };

/** How it is on one child's screen. */
const view = (page) => page.evaluate(() => {
  const { game, puzzle, session } = window.__game;
  return {
    mode: game.mode,
    level: puzzle.level,
    total: puzzle.total,
    plain: puzzle.rounds.every((round) => !round.peek && !round.magnet && round.pictures.length === 1 && round.pieces.every((piece) => !piece.golden && !piece.leaf && !piece.floating && piece.angle === 0)),
    pictures: puzzle.rounds.map((round) => round.pictures.map(({ name }) => name)),
    pieces: puzzle.pieces.map(({ id, x, y, state: how, holder }) => ({ id, x, y, state: how, holder })),
    laid: puzzle.rounds.map((round) => round.pieces.map(({ home }) => [home.x, home.y])),
    held: puzzle.held?.id ?? null,
    placed: puzzle.stats.placed,
    picks: puzzle.stats.picks,
    you: game.friends.room.you,
    tally: Object.fromEntries(puzzle.tally),
    friends: game.friendHands.map(({ name, fade, n, glove }) => ({ name, fade, n, seen: glove.visible })),
    ownLevel: session.levels.current,
    done: puzzle.done,
    shared: Boolean(puzzle.shared),
  };
});

/**
 * Everyone gets through the hand check and waits for each other. As the countdown starts their hands close, so
 * nobody has a piece as the game begins, and what happens next is what the test does.
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

test('friends together: one puzzle for everyone, a piece one holds can\'t be taken by another, and it\'s finished on every screen at once', async ({ page, browser }) => {
  test.setTimeout(420_000);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openGame(page, { puzzlePieces: 'usual', levels: { [GAME]: 5 } }, GAME);
  const code = await makeGame(page, 'Ana');
  expect(page.url()).toContain(`#puzzle=${code}`);
  // Together is how it comes, and whoever made the game can change it.
  await expect(page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await expect(page.locator('input[name="friends-team"][value="together"]')).toBeEnabled();
  // The friend has their own number of pieces, and would have chosen against, but plays the host's game.
  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, { puzzlePieces: 'more', puzzleFriends: 'against' }, 'Ben');
  await expect(page.locator('#friends-here')).toContainText('Ben');
  await expect(ben.page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await expect(ben.page.locator('input[name="friends-team"][value="together"]')).toBeDisabled();
  await expect(ben.page.locator('#friends-teams-whose')).toHaveText('Ana chose.');
  await shot(page, 'puzzles-friends-box');
  await allPlayingWithHandsClosed(page, ben.page);

  const [ana, his] = [await view(page), await view(ben.page)];
  expect([ana.mode, his.mode]).toEqual(['together', 'together']);
  expect([ana.level, his.level]).toEqual([5, 5]);
  // The host's number of pieces, in the plain puzzle: none of what the levels bring.
  expect([ana.total, his.total]).toEqual([12, 12]);
  expect([ana.plain, his.plain]).toEqual([true, true]);
  // The same pictures, cut and scattered the same way, on both screens.
  expect(his.pictures).toEqual(ana.pictures);
  expect(his.pieces).toEqual(ana.pieces);
  await expect(page.locator('#puzzle-scores li')).toHaveCount(2);
  await expect(ben.page.locator('#puzzle-scores li')).toHaveCount(2);

  // Ana picks a piece up and takes it under the easel. On Ben's screen it's in her hand, going where her glove goes.
  await leadHand(page, { target: `(puzzle, at) => (puzzle.held ? { x: ${SPARE.x}, y: ${SPARE.y} } : puzzle.wants(at))` });
  await expectSoon(async () => {
    const now = await state(page);
    return now.held !== null && gap(now.glove, SPARE) < 0.05;
  }).toBe(true);
  const which = (await view(page)).held;
  await expectSoon(async () => (await view(ben.page)).pieces.find(({ id }) => id === which).holder).toBe(ana.you);
  await expectSoon(async () => gap((await view(ben.page)).pieces.find(({ id }) => id === which), SPARE), { timeout: 15_000 }).toBeLessThan(0.08);
  await expectSoon(async () => (await view(ben.page)).friends[0].fade, { timeout: 15_000 }).toBeGreaterThan(0.5);
  await ben.page.waitForTimeout(300);
  await ben.page.screenshot({ path: 'test-results/screens/puzzles-friends-held-by-friend.png' });

  // Ben's hand goes to it, and opens on it: it stays in Ana's hand.
  await leadHand(ben.page, { target: `(puzzle) => ({ x: puzzle.piece(${which}).x, y: puzzle.piece(${which}).y, hand: 'fist' })` });
  await expectSoon(async () => gap((await state(ben.page)).glove ?? { x: 9, y: 9 }, SPARE), { timeout: 20_000 }).toBeLessThan(0.07);
  await handNow(ben.page, 'open');
  await ben.page.waitForTimeout(2500);
  const tried = await view(ben.page);
  expect(tried.held).toBe(null);
  expect(tried.picks).toBe(0);
  expect((await view(page)).held).toBe(which);

  // Ana lets go. It lies in the same place on both screens, and now Ben's open hand, still there, has it.
  await handNow(page, 'fist');
  await expectSoon(async () => (await view(page)).held, { timeout: 5000 }).toBe(null);
  await expectSoon(async () => (await view(ben.page)).held, { timeout: 15_000 }).toBe(which);
  await expectSoon(async () => (await view(page)).pieces.find(({ id }) => id === which).holder, { timeout: 15_000 }).toBe(his.you);
  await page.waitForTimeout(300);
  await shot(page, 'puzzles-friends-host');

  // They finish it between them, and it ends on both screens, with everyone's pieces on the finish card.
  await leadHand(page, { gain: 0.07 });
  await leadHand(ben.page, { gain: 0.07 });
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  for (const each of [page, ben.page]) await stopHand(each);
  const [aEnd, bEnd] = [await view(page), await view(ben.page)];
  expect(aEnd.tally).toEqual(bEnd.tally);
  expect(Object.values(aEnd.tally).reduce((sum, count) => sum + count, 0)).toBe(12);
  expect(aEnd.tally[bEnd.you] ?? 0).toBeGreaterThan(0);
  expect(aEnd.placed).toBe(aEnd.tally[aEnd.you] ?? 0);
  await expect(page.locator('#screen-finish h2')).toHaveText('You did it together!');
  await expect(ben.page.locator('#screen-finish h2')).toHaveText('You did it together!');
  await expect(page.locator('.friends-results li')).toHaveCount(2);
  await expect(page.locator('.friends-results')).toContainText(/\d+ pieces?/);
  // Nobody is placed first or second: they did it together.
  await expect(page.locator('.friends-results .friends-place').first()).toHaveText('');
  await page.waitForTimeout(600);
  await shot(page, 'puzzles-friends-finish');

  // Nobody's own level moves on, nobody's settings change, and the only connection was to the race server.
  expect(aEnd.ownLevel).toBe(5);
  expect(bEnd.ownLevel).toBe(1);
  expect(await ben.page.evaluate(() => [window.__game.session.settings.puzzlePieces, window.__game.session.settings.puzzleFriends])).toEqual(['more', 'against']);
  const port = Number(new URL(test.info().project.use.baseURL).port) + 1;
  expect(sockets).toEqual([`ws://localhost:${port}/room/giraffe-puzzles/${code}?make=1`]);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('friends against each other: the same puzzle each, how far each has got along the top, and the first to finish wins', async ({ page, browser }) => {
  test.setTimeout(420_000);
  // Whoever makes the game has chosen against each other, under the gear icon.
  await openGame(page, { puzzleFriends: 'against', puzzlePieces: 'fewer', levels: { [GAME]: 3 } }, GAME);
  const code = await makeGame(page, 'Ana');
  await expect(page.locator('input[name="friends-team"][value="against"]')).toBeChecked();
  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, { puzzleFriends: 'together' }, 'Ben');
  await expect(ben.page.locator('input[name="friends-team"][value="against"]')).toBeChecked();
  await expect(ben.page.locator('input[name="friends-team"][value="against"]')).toBeDisabled();
  await allPlayingWithHandsClosed(page, ben.page);

  const [ana, his] = [await view(page), await view(ben.page)];
  expect([ana.mode, his.mode]).toEqual(['against', 'against']);
  expect([ana.shared, his.shared]).toEqual([false, false]);
  // A copy each of the host's puzzle: fewer pieces than level 3 usually has, in the plain puzzle.
  expect([ana.total, his.total]).toEqual([8, 8]);
  expect([ana.plain, his.plain]).toEqual([true, true]);
  expect(his.pictures).toEqual(ana.pictures);
  expect(his.pieces).toEqual(ana.pieces);

  // Ana gets on with hers, and Ben's stays as it was: but he sees how far she has got.
  await leadHand(page);
  await expectSoon(async () => (await view(page)).placed, { timeout: 60_000 }).toBeGreaterThanOrEqual(2);
  await expectSoon(async () => (await view(ben.page)).friends[0].n, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
  const waiting = await view(ben.page);
  expect(waiting.placed).toBe(0);
  expect(waiting.pieces.every((piece) => piece.state === 'loose')).toBe(true);
  // No gloves but his own on his table: each has their own.
  expect(waiting.friends[0].seen).toBe(false);
  await expect(ben.page.locator('#puzzle-scores li').first()).toContainText('Ana');
  await expect(ben.page.locator('#puzzle-scores li').first()).toContainText(/[2-8]\/8/);
  await ben.page.screenshot({ path: 'test-results/screens/puzzles-friends-against.png' });

  // Ana finishes first, and her card says so, with Ben still playing.
  await waitForScreen(page, 'finish');
  await stopHand(page);
  await expect(page.locator('#screen-finish h2')).toHaveText('You finished first!');
  await expect(page.locator('.friends-results li')).toHaveCount(2);
  await expect(page.locator('.friends-results li.is-racing')).toContainText('still playing');
  // Ben carries on, for as long as it takes, and finishes too: second, and that's fine.
  await expect(ben.page.locator('#puzzle-scores li').first()).toContainText('🏁');
  await leadHand(ben.page);
  await waitForScreen(ben.page, 'finish');
  await stopHand(ben.page);
  await expect(ben.page.locator('#screen-finish h2')).toHaveText('You did it!');
  await expect(ben.page.locator('.friends-results li')).toHaveCount(2);
  await expect(ben.page.locator('.friends-results li').first()).toContainText('1st');
  await expect(ben.page.locator('.friends-results li').first()).toContainText('Ana');
  await expect(ben.page.locator('.friends-results li.is-you')).toContainText('2nd');
  await expect(page.locator('.friends-results li.is-racing')).toHaveCount(0);
  await page.waitForTimeout(400);
  await shot(page, 'puzzles-friends-against-finish');
  const [aEnd, bEnd] = [await view(page), await view(ben.page)];
  expect([aEnd.placed, bEnd.placed]).toEqual([8, 8]);
  expect([aEnd.ownLevel, bEnd.ownLevel]).toEqual([3, 1]);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('together, a friend who goes in the middle leaves what they held lying where it was, and the other finishes it', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openGame(page, {}, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, {}, 'Ben');
  await allPlayingWithHandsClosed(page, ben.page);
  // Ben has a piece in his hand, under the easel, when he goes.
  await leadHand(ben.page, { target: `(puzzle, at) => (puzzle.held ? { x: ${SPARE.x}, y: ${SPARE.y} } : puzzle.wants(at))` });
  await expectSoon(async () => {
    const now = await state(ben.page);
    return now.held !== null && gap(now.glove, SPARE) < 0.05;
  }).toBe(true);
  const which = (await view(ben.page)).held;
  await expectSoon(async () => (await view(page)).pieces.find(({ id }) => id === which).state).toBe('held');
  await ben.context.close();
  // His glove goes, and the piece lies where it was, for Ana.
  await expectSoon(async () => (await view(page)).friends.length, { timeout: 30_000 }).toBe(0);
  const left = (await view(page)).pieces.find(({ id }) => id === which);
  expect(left.state).toBe('loose');
  expect(gap(left, SPARE)).toBeLessThan(0.1);
  await show(page, ...OPEN);
  await leadHand(page);
  await waitForScreen(page, 'finish');
  await stopHand(page);
  expect((await view(page)).done).toBe(true);
  await expect(page.locator('.friends-results')).toBeVisible();
});
