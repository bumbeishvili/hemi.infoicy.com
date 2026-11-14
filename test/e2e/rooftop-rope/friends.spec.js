// Rooftop Rope with friends: two children, each on their own computer with their own camera. Together, they
// cross side by side and wait for each other on every rooftop, and against each other it's a race to the last
// one. Here they're two separate browsers, talking through the race server on this computer
// (tools/race-server.mjs).
import { GAME, childFeet, childWalks, expect, expectSoon, getReady, joinCrossing, makeCrossing, openRope, secondPlayer, shot, state, stopChild, test, waitForScreen } from './helpers.js';

const team = (page) => page.evaluate(() => window.__game.game.team);
const mate = (page) => page.evaluate(() => {
  const { world, mates } = window.__game;
  const shown = world.mates[0];
  return { name: mates[0]?.friend.spec.name, gone: mates[0]?.gone, visible: shown?.root.visible, walker: shown?.spec.id, along: mates[0]?.along, x: shown?.root.position.x, z: shown?.root.position.z, onWheel: shown?.onWheel };
});
const scores = (page) => page.locator('#rope-scores li').evaluateAll((rows) => rows.map((row) => [row.querySelector('span').textContent, Number(row.querySelector('strong').textContent)]));
const rows = (page) => page.locator('.friends-results li').evaluateAll((list) => list.map((row) => row.textContent.replace(/\s+/g, ' ').trim()));

test('two friends cross the rooftops together from their own computers, side by side, waiting for each other on every rooftop', async ({ page, browser }) => {
  test.setTimeout(400_000);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  // The host is at level 9, whose own ropes have balloons, birds, lights, a climb, the long rope and gusts.
  await openRope(page, { ropeCount: 4, ropeHold: 'short', levels: { [GAME]: 9 } });
  const code = await makeCrossing(page, 'Ana');
  expect(page.url()).toContain(`#rope=${code}`);
  // Together is how it comes, and whoever made the crossing can change it.
  await expect(page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await expect(page.locator('input[name="friends-team"][value="against"]')).toBeEnabled();
  await expect(page.locator('#friends-how')).toContainText('cross the rooftops together');

  // The friend has settings of their own, and crosses the host's ropes with their own lift and their own legs.
  const ben = await secondPlayer(browser);
  await joinCrossing(ben.page, code, { ropeCount: 8, ropeHold: 'long', ropeLift: 'tiny', ropeLeg: 'any', fighter: 'kit' }, 'Ben');
  await expect(page.locator('#friends-here')).toContainText('Ben');
  await expect(ben.page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await expect(ben.page.locator('input[name="friends-team"][value="together"]')).toBeDisabled();
  await expect(ben.page.locator('#friends-teams-whose')).toHaveText('Ana chose.');

  await getReady(page);
  await waitForScreen(page, 'waiting');
  await getReady(ben.page);
  await waitForScreen(page, 'playing');
  await waitForScreen(ben.page, 'playing');
  const [hers, his] = [await state(page), await state(ben.page)];
  expect([await team(page), await team(ben.page)]).toEqual([true, true]);
  // The host's ropes on both: four of them, each as long, with their stars and nothing else, whatever the level.
  expect(hers.plan.ropes).toHaveLength(4);
  expect(his.plan.ropes.map(({ seconds, kinds, long, climb }) => ({ seconds, kinds, long, climb }))).toEqual(hers.plan.ropes.map(({ seconds, kinds, long, climb }) => ({ seconds, kinds, long, climb })));
  expect(hers.plan.ropes.every(({ kinds, long, climb }) => kinds.join() === 'star,star,star' && !long && !climb)).toBe(true);
  expect(hers.plan.ropes[0].seconds).toBeGreaterThan(3);
  expect(hers.plan.ropes[0].seconds).toBeLessThan(4);
  // Each keeps their own lift and their own legs: just off the floor and either foot for Ben, and for Ana one
  // leg a rope and the lift of a child who skipped the warm-up.
  expect([hers.reach.left, his.reach.left].map((reach) => Math.round(reach * 100))).toEqual([7, 4]);
  expect(his.plan.ropes.every(({ leg }) => leg === 'any')).toBe(true);
  expect(hers.plan.ropes.every(({ leg }) => leg === 'left' || leg === 'right')).toBe(true);

  // Each sees the other's walker beside their own on the first rooftop, with their name over it.
  await expectSoon(async () => (await mate(page)).visible, { timeout: 15_000 }).toBe(true);
  expect((await mate(page)).name).toBe('Ben');
  expect((await mate(page)).walker).toBe('kit');
  expect(Math.abs((await mate(page)).x)).toBeGreaterThan(2);
  await expect(page.locator('.walker-mark-name')).toHaveText('Ben');
  await expect(ben.page.locator('.walker-mark-name')).toHaveText('Ana');
  await expect(page.locator('#rope-scores')).toBeVisible();

  // Ana crosses and Ben doesn't lift a foot: she gets to the next rooftop, and waits for him there, foot up or
  // not, and is told why.
  await childWalks(ben.page, { fixed: null });
  await childWalks(page, { rest: 0.3 });
  // On Ben's screen, while she's on the rope, her walker is up on a wheel too.
  await expectSoon(async () => (await mate(ben.page)).onWheel, { timeout: 40_000 }).toBeGreaterThan(0.9);
  await expectSoon(async () => (await state(page)).index, { timeout: 40_000 }).toBe(1);
  await expectSoon(async () => (await state(page)).hint, { timeout: 15_000 }).toBe('wait');
  await expect(page.locator('#prompt-text')).toHaveText('Wait here for your friends!');
  await expect(page.locator('#feet')).toHaveAttribute('data-ask', 'none');
  await page.waitForTimeout(4000);
  const waiting = await state(page);
  expect([waiting.state, waiting.index, waiting.progress, waiting.stats.falls]).toEqual(['roof', 1, 0, 0]);
  // On Ben's screen, her walker is a rooftop in front.
  await expectSoon(async () => (await mate(ben.page)).along, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  expect((await mate(ben.page)).z).toBeLessThan((await state(ben.page)).walker.z - 15);
  // And off its wheel, on the rooftop.
  await expectSoon(async () => (await mate(ben.page)).onWheel, { timeout: 15_000 }).toBeLessThan(0.1);
  await shot(ben.page, 'rope-friends-ahead');

  // Ben crosses too, and they get to the last rooftop one after the other.
  await childFeet(ben.page, 'follow');
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  await stopChild(page);
  await stopChild(ben.page);
  const [her, him] = [await state(page), await state(ben.page)];
  for (const each of [page, ben.page]) {
    await expect(each.locator('#finish-title')).toHaveText('You crossed them all together!');
    await expect(each.locator('.friends-results li')).toHaveCount(2);
    await expect(each.locator('.friends-results')).toHaveClass(/is-team/);
    await expect(each.locator('.friends-results')).toContainText('star');
  }
  expect([her.stats.stars, him.stats.stars]).toEqual([12, 12]);
  // Each one's stars are on the other's card.
  expect((await rows(page)).join(' ')).toContain(`Ben ${him.stats.stars} star`);
  expect((await rows(ben.page)).join(' ')).toContain(`Ana ${her.stats.stars} star`);
  await page.waitForTimeout(500);
  await shot(page, 'rope-friends-finish');
  // Nobody's own level moves on, and nobody's settings change.
  expect(await page.evaluate(() => window.__game.game.levels.current)).toBe(9);
  expect(await ben.page.evaluate(() => [window.__game.game.levels.current, window.__game.game.settings.ropeCount, window.__game.game.settings.ropeHold])).toEqual([1, 8, 'long']);
  // Only the race server on this computer was talked to.
  expect(sockets.length).toBeGreaterThanOrEqual(1);
  for (const url of sockets) expect(url).toMatch(/^ws:\/\/localhost:\d+\/room\/rooftop-rope\//);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('against each other it\'s a race to the last rooftop: nobody waits for anybody, and everyone walks on to the end', async ({ page, browser }) => {
  test.setTimeout(400_000);
  await openRope(page, { ropeCount: 4, ropeHold: 'short' });
  const code = await makeCrossing(page, 'Ana');
  await page.locator('input[name="friends-team"][value="against"]').check();
  await expect(page.locator('#friends-how')).toContainText('race to the last rooftop');
  // The choice is kept with the grown-ups' settings.
  expect(await page.evaluate(() => window.__game.game.settings.ropeFriends)).toBe('against');

  const ben = await secondPlayer(browser);
  await joinCrossing(ben.page, code, { fighter: 'bramble', ropeFall: 'never' }, 'Ben');
  await expect(ben.page.locator('input[name="friends-team"][value="against"]')).toBeChecked();
  await expect(ben.page.locator('input[name="friends-team"][value="against"]')).toBeDisabled();
  // Ben's own choice, for the crossings he makes himself, stays as it was.
  expect(await ben.page.evaluate(() => window.__game.game.settings.ropeFriends)).toBe('together');

  await getReady(page);
  await getReady(ben.page);
  await waitForScreen(page, 'playing');
  await waitForScreen(ben.page, 'playing');
  expect([await team(page), await team(ben.page)]).toEqual([false, false]);

  // Ana crosses, and Ben stays on the first rooftop: she's never held up for him.
  await childWalks(ben.page, { fixed: null });
  await childWalks(page, { rest: 0.3 });
  await expectSoon(async () => (await state(page)).index, { timeout: 60_000 }).toBeGreaterThanOrEqual(2);
  expect((await state(ben.page)).index).toBe(0);
  expect((await state(page)).hint).not.toBe('wait');
  // Who's in front is at the top of each screen.
  await expectSoon(() => scores(page), { timeout: 10_000 }).toEqual([['You', 1], ['Ben', 2]]);
  await expectSoon(() => scores(ben.page), { timeout: 10_000 }).toEqual([['Ana', 1], ['You', 2]]);
  await shot(ben.page, 'rope-friends-against');

  // She gets to the last rooftop first, and her card says he's still crossing.
  await waitForScreen(page, 'finish');
  await expect(page.locator('#finish-title')).toHaveText('First to the last rooftop!');
  expect((await rows(page))[0]).toMatch(/^1st You \d:\d\d\.\d$/);
  expect((await rows(page))[1]).toBe('… Ben still crossing');
  // He walks on, and gets there too.
  await childFeet(ben.page, 'follow');
  await waitForScreen(ben.page, 'finish');
  await stopChild(page);
  await stopChild(ben.page);
  await expect(ben.page.locator('#finish-title')).toHaveText('You crossed them all!');
  expect((await rows(ben.page))[0]).toMatch(/^1st Ana \d:\d\d\.\d$/);
  expect((await rows(ben.page))[1]).toMatch(/^2nd You \d:\d\d\.\d$/);
  await expectSoon(async () => (await rows(page))[1], { timeout: 15_000 }).toMatch(/^2nd Ben \d:\d\d\.\d$/);
  await ben.page.waitForTimeout(500);
  await shot(ben.page, 'rope-friends-against-finish');
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('together, a friend who goes in the middle leaves the other to cross on without waiting', async ({ page, browser }) => {
  test.setTimeout(400_000);
  await openRope(page, { ropeCount: 4, ropeHold: 'short' });
  const code = await makeCrossing(page, 'Ana');
  const ben = await secondPlayer(browser);
  await joinCrossing(ben.page, code, {}, 'Ben');
  await getReady(page);
  await getReady(ben.page);
  await waitForScreen(page, 'playing');
  await waitForScreen(ben.page, 'playing');
  await childWalks(ben.page, { fixed: null });
  await childWalks(page, { rest: 0.3 });
  // A rooftop in front of Ben, who hasn't moved, Ana waits.
  await expectSoon(async () => (await state(page)).hint, { timeout: 60_000 }).toBe('wait');
  // Ben closes the page. His walker goes, and she's asked for her foot again.
  await ben.context.close();
  await expectSoon(async () => (await mate(page)).gone, { timeout: 20_000 }).toBe(true);
  await expectSoon(async () => (await mate(page)).visible).toBe(false);
  await expectSoon(async () => (await state(page)).index, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  await expect(page.locator('#rope-scores li')).toHaveCount(2);
  await waitForScreen(page, 'finish');
  await stopChild(page);
  await expect(page.locator('#finish-title')).toHaveText('You crossed them all together!');
});
