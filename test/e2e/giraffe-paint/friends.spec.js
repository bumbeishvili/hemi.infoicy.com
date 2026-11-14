// Painting with friends in Giraffe's Paint Box: each on their own computer with their own camera, either all
// painting one sheet together, or each their own copy, to see who finishes first, as whoever makes the game chooses.
// Here they're separate browsers, talking through the race server on this computer (tools/race-server.mjs).
import { openGame, shot } from '../helpers.js';
import { allPlaying, dipIn, expect, expectSoon, GAME, joinGame, leadHand, makeGame, paintAt, part, secondPlayer, state, stopHand, test, waitForScreen } from './helpers.js';

/** How the game with friends is on one child's screen. */
const view = (page) => page.evaluate(() => {
  const { game, painting, session } = window.__game;
  return {
    mode: game.mode,
    you: game.friends.room.you,
    tally: Object.fromEntries(painting.tally),
    friends: game.friendBrushes.map(({ name, fade, at }) => ({ name, fade, at: at && { x: at.x, y: at.y } })),
    scores: Object.fromEntries(game.scores),
    plain: painting.pots.every((pot) => pot.kind === 'colour' && pot.ready && pot.colour !== 'rainbow') && !painting.roller && !painting.friend,
    ownLevel: session.levels.current,
    clock: game.clock,
  };
});

/** What's still to paint of a part, as a target for leadHand. */
const restOf = (id) => `(painting) => { const part = painting.parts.find((each) => each.id === '${id}'); return part.done ? null : painting.emptiest(part); }`;

test('together: friends paint one sheet, each sees the other\'s strokes arrive, each part is whoever\'s stroke finished it, and it\'s done for everyone', async ({ page, browser }) => {
  test.setTimeout(480_000);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openGame(page, { levels: { [GAME]: 4 } }, GAME);
  const code = await makeGame(page, 'Ana');
  expect(page.url()).toContain(`#paint=${code}`);
  // Together is how it comes, and the friend is shown that, and can't change it.
  await expect(page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, { paintBrush: 'big', paintColours: 'free', paintFriends: 'against' }, 'Ben');
  await expect(page.locator('#friends-here')).toContainText('Ben');
  await expect(ben.page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await expect(ben.page.locator('input[name="friends-team"][value="together"]')).toBeDisabled();
  await expect(ben.page.locator('#friends-teams-whose')).toHaveText('Ana chose.');
  await shot(page, 'paint-friends-box');
  await allPlaying(page, ben.page);

  const [ana, his] = [await view(page), await view(ben.page)];
  expect([ana.mode, his.mode]).toEqual(['together', 'together']);
  // The host's picture and rule for the paints, without what the levels bring, and each child's own brush.
  const [hers, theirs] = [await state(page), await state(ben.page)];
  expect([hers.page, theirs.page, hers.level, theirs.level]).toEqual(['lighthouse', 'lighthouse', 4, 4]);
  expect([ana.plain, his.plain]).toEqual([true, true]);
  expect([hers.rule, theirs.rule]).toEqual(['own', 'own']);
  expect([hers.radius, theirs.radius]).toEqual([5, 8.5]); // Each their own brush: Ana's the small one, as it comes.
  await expect(page.locator('#paint-scores li')).toHaveCount(2);

  // Ana paints the sea. Ben, who is resting, sees her glove over the same place and her paint on his own sheet.
  await dipIn(page, 'blue');
  await leadHand(page, { target: restOf('sea') });
  await expectSoon(async () => (await part(ben.page, 'sea')).covered, { timeout: 60_000 }).toBeGreaterThan(400);
  await expectSoon(async () => (await view(ben.page)).friends[0]?.fade ?? 0, { timeout: 30_000 }).toBeGreaterThan(0.5);
  const where = (await state(page)).at;
  const seen = (await view(ben.page)).friends[0];
  expect(seen.name).toBe('Ana');
  expect(Math.hypot(seen.at.x - where.x, seen.at.y - where.y)).toBeLessThan(40);
  await shot(page, 'paint-friends-host');
  await ben.page.screenshot({ path: 'test-results/screens/paint-friends-guest.png' });
  expect((await state(ben.page)).stats.cells).toBe(0);
  // The sea is finished by Ana's strokes, on both sheets, and it's hers on both.
  await expectSoon(async () => (await part(ben.page, 'sea')).done, { timeout: 90_000 }).toBe(true);
  await expectSoon(async () => (await view(ben.page)).tally[ana.you] ?? 0, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  // Once it has filled in, all of it is blue on Ben's screen.
  await ben.page.waitForTimeout(1000);
  const drawn = await paintAt(ben.page, 20, 95);
  expect(drawn.paint).toBe('blue');
  expect(drawn.drawn[3]).toBe(255);
  expect(drawn.drawn[2]).toBeGreaterThan(200);

  // Ben paints too, and between them the picture is finished, on both screens.
  await leadHand(ben.page);
  await leadHand(page);
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  for (const each of [page, ben.page]) await stopHand(each);
  const [aEnd, bEnd] = [await view(page), await view(ben.page)];
  const [aState, bState] = [await state(page), await state(ben.page)];
  expect(aState.done && bState.done).toBe(true);
  // Every part is somebody's, the same on both screens, and each of them finished some.
  expect(aEnd.tally).toEqual(bEnd.tally);
  expect((aEnd.tally[aEnd.you] ?? 0) + (aEnd.tally[bEnd.you] ?? 0)).toBe(aState.toPaint);
  expect(aEnd.tally[aEnd.you]).toBeGreaterThan(0);
  expect(aEnd.tally[bEnd.you]).toBeGreaterThan(0);
  // Nobody is placed: they did it together.
  for (const each of [page, ben.page]) {
    await expect(each.locator('#screen-finish h2')).toHaveText('You painted it together!');
    await expect(each.locator('.friends-results li')).toHaveCount(2);
    await expect(each.locator('.friends-results')).toHaveClass(/is-team/);
    await expect(each.locator('.friends-results li').first()).toContainText(/\d+ parts?/);
  }
  await page.waitForTimeout(600);
  await shot(page, 'paint-friends-finish');

  // Nobody's own level moves on, nobody's settings change, and the only connection was to the race server.
  expect([aEnd.ownLevel, bEnd.ownLevel]).toEqual([4, 1]);
  expect(await ben.page.evaluate(() => [window.__game.session.settings.paintBrush, window.__game.session.settings.paintColours, window.__game.session.settings.paintFriends])).toEqual(['big', 'free', 'against']);
  const port = Number(new URL(test.info().project.use.baseURL).port) + 1;
  expect(sockets).toEqual([`ws://localhost:${port}/room/giraffe-paint/${code}?make=1`]);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('against each other: each paints their own copy of the host\'s picture, sees how far the other has got, and the first to finish is first', async ({ page, browser }) => {
  test.setTimeout(480_000);
  await openGame(page, { levels: { [GAME]: 2 } }, GAME);
  const code = await makeGame(page, 'Ana', 'against');
  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, {}, 'Ben');
  await expect(ben.page.locator('input[name="friends-team"][value="against"]')).toBeChecked();
  await expect(ben.page.locator('#friends-how')).toContainText('who finishes their own picture first');
  await allPlaying(page, ben.page);
  const [ana, his] = [await view(page), await view(ben.page)];
  expect([ana.mode, his.mode]).toEqual(['against', 'against']);
  expect([(await state(page)).page, (await state(ben.page)).page]).toEqual(['balloons', 'balloons']);
  expect([ana.plain, his.plain]).toEqual([true, true]);
  await expect(page.locator('#chip-time-box')).toBeVisible();

  // Ana paints, and Ben rests: none of it lands on Ben's sheet, which is his own, but he sees how far she has got.
  await leadHand(page);
  await expectSoon(async () => (await view(ben.page)).scores[ana.you] ?? 0, { timeout: 90_000 }).toBeGreaterThan(20);
  expect((await state(ben.page)).parts.every((each) => each.covered === 0 || each.kind === 'paper')).toBe(true);
  await expect(ben.page.locator('#paint-scores li').first()).toContainText('Ana');
  await expect(ben.page.locator('#paint-scores li').first()).toContainText('%');
  await page.waitForTimeout(300);
  await ben.page.screenshot({ path: 'test-results/screens/paint-against-guest.png' });
  // Ana rests and Ben paints a little: now she sees how far he has got. Then he rests, and nothing of his is lost.
  await stopHand(page);
  await leadHand(ben.page);
  await expectSoon(async () => (await view(page)).scores[his.you] ?? 0, { timeout: 90_000 }).toBeGreaterThan(10);
  await stopHand(ben.page);
  const bens = (await view(page)).scores[his.you];
  // Ana paints on and finishes first, and her card says so, with Ben's picture still part done.
  await leadHand(page);
  await waitForScreen(page, 'finish');
  await stopHand(page);
  await expect(page.locator('#screen-finish h2')).toHaveText('You finished first!');
  await expect(page.locator('.friends-results li').first()).toContainText('1st');
  await expect(page.locator('.friends-results li').first()).toContainText('You');
  await shot(page, 'paint-against-finish');
  // Ben's time runs out before he's done: his picture is as far as it got, and he's second.
  expect((await state(ben.page)).done).toBe(false);
  expect((await view(page)).scores[his.you]).toBeGreaterThanOrEqual(bens);
  await ben.page.evaluate(() => {
    window.__game.game.goAt -= 179_000;
  });
  await waitForScreen(ben.page, 'finish');
  await expect(ben.page.locator('#screen-finish h2')).toHaveText('Lovely painting!');
  const rows = ben.page.locator('.friends-results li');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('1st');
  await expect(rows.nth(0)).toContainText('Ana');
  await expect(rows.nth(1)).toContainText('2nd');
  await expect(rows.nth(1)).toContainText('% painted');
  // And Ana's card now has him too.
  await expect(page.locator('.friends-results li').nth(1)).toContainText('% painted', { timeout: 20_000 });
  expect([(await view(page)).ownLevel, (await view(ben.page)).ownLevel]).toEqual([2, 1]);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('a friend who goes in the middle takes their glove with them, and the other paints on to the end', async ({ page, browser }) => {
  test.setTimeout(360_000);
  await openGame(page, {}, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, {}, 'Ben');
  await allPlaying(page, ben.page);
  await leadHand(ben.page, { target: { x: 62, y: 40 } });
  await expectSoon(async () => (await view(page)).friends[0]?.fade ?? 0, { timeout: 30_000 }).toBeGreaterThan(0.5);
  await expectSoon(async () => (await part(page, 'head')).covered, { timeout: 30_000 }).toBeGreaterThan(50);
  await ben.context.close();
  await expectSoon(async () => (await view(page)).friends.length, { timeout: 30_000 }).toBe(0);
  // What Ben painted stays painted.
  expect((await part(page, 'head')).covered).toBeGreaterThan(50);
  await leadHand(page);
  await waitForScreen(page, 'finish');
  await stopHand(page);
  expect((await state(page)).done).toBe(true);
  await expect(page.locator('.friends-results')).toBeVisible();
});
