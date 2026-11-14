// Moto Mountain with friends: two children, each on their own computer with their own camera. Together, they
// ride up as one convoy, and against each other it's a race to the top. Here they're two separate browsers,
// talking through the race server on this computer (tools/race-server.mjs).
import { GAME, childHolds, childRides, expect, expectSoon, getReady, joinRide, makeRide, openMoto, secondPlayer, shot, state, stopChild, test, waitForScreen } from './helpers.js';

const team = (page) => page.evaluate(() => window.__game.game.team);
const mate = (page) => page.evaluate(() => {
  const { world, mates } = window.__game;
  const shown = world.mates[0];
  return { name: mates[0]?.friend.spec.name, gone: mates[0]?.gone, visible: shown?.root.visible, roll: shown?.roll, rider: shown?.spec.id, s: mates[0]?.s };
});
const scores = (page) => page.locator('#moto-scores li').evaluateAll((rows) => rows.map((row) => [row.querySelector('span').textContent, Number(row.querySelector('strong').textContent)]));
const rows = (page) => page.locator('.friends-results li').evaluateAll((list) => list.map((row) => row.textContent.replace(/\s+/g, ' ').trim()));

test('two friends ride up the mountain together from their own computers, as one convoy on the same road', async ({ page, browser }) => {
  test.setTimeout(400_000);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  // The host is at level 9, whose own road has puddles, sheep, a bridge, a jump, the big bend and a scooter.
  // And she has the wild ride chosen, which is how the game comes: a race against other riders, over hills.
  await openMoto(page, { motoBends: 6, motoPace: 'quick', motoRide: 'wild', levels: { [GAME]: 9 } });
  const code = await makeRide(page, 'Ana');
  expect(page.url()).toContain(`#ride=${code}`);
  // Together is how it comes, and whoever made the ride can change it.
  await expect(page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await expect(page.locator('input[name="friends-team"][value="against"]')).toBeEnabled();
  await expect(page.locator('#friends-how')).toContainText('ride up the mountain together');

  // The friend has settings of their own, and rides the host's road with their own lean.
  const ben = await secondPlayer(browser);
  await joinRide(ben.page, code, { motoBends: 14, motoPace: 'gentle', motoLean: 'tiny', motoWay: 'more', fighter: 'kit' }, 'Ben');
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
  // The host's road on both: six bends, at her quick pace, the same bends one after another, and only stars
  // and speed arrows on it, whatever the level.
  expect(his.plan.bends).toEqual(hers.plan.bends);
  expect(hers.plan.bends.length).toBe(6);
  expect(his.cruise).toBeCloseTo(hers.cruise, 5);
  expect(hers.cruise).toBeGreaterThan(17);
  for (const kind of hers.plan.kinds) expect(['star', 'boost']).toContain(kind);
  expect(hers.plan.kinds).toContain('star');
  expect(hers.plan.bends.some(({ big }) => big)).toBe(false);
  // With friends it's the road alone, whatever ride is chosen: no other riders, no hills, nothing in the way.
  // Friends are each other's race.
  for (const each of [hers, his]) expect([each.rivals.length, each.riders, each.hills.length, each.barriers.length]).toEqual([0, 0, 0, 0]);
  await expect(page.locator('#place-chip')).toBeHidden();
  // Each keeps their own lean: a little for Ben, 7 degrees, and for Ana the 8 of a child who skipped the warm-up.
  expect([Math.round(hers.reach.left), Math.round(his.reach.left)]).toEqual([8, 7]);

  // Each sees the other's bike beside their own on the start line, with their name over it.
  await expectSoon(async () => (await mate(page)).visible, { timeout: 15_000 }).toBe(true);
  expect((await mate(page)).name).toBe('Ben');
  expect((await mate(page)).rider).toBe('kit');
  await expect(page.locator('.rider-mark-name')).toHaveText('Ben');
  await expect(ben.page.locator('.rider-mark-name')).toHaveText('Ana');
  await expect(page.locator('#moto-scores')).toBeVisible();

  // Ana rides and Ben doesn't lean: his bike waits in the first bend, and hers eases off for him, far in front.
  await childRides(ben.page, { fixed: 0 });
  await childRides(page, { goFor: true });
  await expectSoon(async () => (await state(ben.page)).waiting, { timeout: 40_000 }).toBe('bend');
  await expectSoon(async () => {
    const now = await state(page);
    return !now.offRoad && now.s - (await state(ben.page)).s > 80 ? now.v / now.cruise : 1;
  }, { timeout: 40_000 }).toBeLessThan(0.75);
  expect((await state(page)).v).toBeGreaterThan(5);
  // On Ben's screen, her bike is up the road.
  await expectSoon(async () => (await mate(ben.page)).s, { timeout: 15_000 }).toBeGreaterThan((await state(ben.page)).s + 40);
  await shot(page, 'moto-friends-ahead');

  // Ben rides too, with a tow to catch up, and they get to the top one after the other.
  await childHolds(ben.page, null);
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  await stopChild(page);
  await stopChild(ben.page);
  const [her, him] = [await state(page), await state(ben.page)];
  for (const each of [page, ben.page]) {
    await expect(each.locator('#finish-title')).toHaveText('You rode to the top together!');
    await expect(each.locator('.friends-results li')).toHaveCount(2);
    await expect(each.locator('.friends-results')).toHaveClass(/is-team/);
    await expect(each.locator('.friends-results')).toContainText('star');
  }
  // Each one's stars are on the other's card.
  expect((await rows(page)).join(' ')).toContain(`Ben ${him.stats.stars} star`);
  expect((await rows(ben.page)).join(' ')).toContain(`Ana ${her.stats.stars} star`);
  await page.waitForTimeout(500);
  await shot(page, 'moto-friends-finish');
  // Nobody's own level moves on, and nobody's settings change.
  expect(await page.evaluate(() => window.__game.game.levels.current)).toBe(9);
  expect(await ben.page.evaluate(() => [window.__game.game.levels.current, window.__game.game.settings.motoBends, window.__game.game.settings.motoPace])).toEqual([1, 14, 'gentle']);
  // Only the race server on this computer was talked to.
  expect(sockets.length).toBeGreaterThanOrEqual(1);
  for (const url of sockets) expect(url).toMatch(/^ws:\/\/localhost:\d+\/room\/moto-mountain\//);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('against each other it\'s a race to the top: nobody is held back, and everyone rides on to the finish', async ({ page, browser }) => {
  test.setTimeout(400_000);
  await openMoto(page, { motoBends: 6, motoPace: 'quick' });
  const code = await makeRide(page, 'Ana');
  await page.locator('input[name="friends-team"][value="against"]').check();
  await expect(page.locator('#friends-how')).toContainText('race to the top');
  // The choice is kept with the grown-ups' settings.
  expect(await page.evaluate(() => window.__game.game.settings.motoFriends)).toBe('against');

  const ben = await secondPlayer(browser);
  await joinRide(ben.page, code, { fighter: 'bramble' }, 'Ben');
  await expect(ben.page.locator('input[name="friends-team"][value="against"]')).toBeChecked();
  await expect(ben.page.locator('input[name="friends-team"][value="against"]')).toBeDisabled();
  // Ben's own choice, for the rides he makes himself, stays as it was.
  expect(await ben.page.evaluate(() => window.__game.game.settings.motoFriends)).toBe('together');

  await getReady(page);
  await getReady(ben.page);
  await waitForScreen(page, 'playing');
  await waitForScreen(ben.page, 'playing');
  expect([await team(page), await team(ben.page)]).toEqual([false, false]);

  // Ana rides, and Ben waits in the first bend: she's never slowed for him.
  await childRides(ben.page, { fixed: 0 });
  await childRides(page);
  await expectSoon(async () => (await state(ben.page)).waiting, { timeout: 40_000 }).toBe('bend');
  await expectSoon(async () => (await state(page)).s - (await state(ben.page)).s, { timeout: 40_000 }).toBeGreaterThan(120);
  const ahead = await state(page);
  if (!ahead.offRoad) expect(ahead.v).toBeGreaterThan(ahead.cruise * 0.95);
  // Who's in front is at the top of each screen.
  await expectSoon(() => scores(page), { timeout: 10_000 }).toEqual([['You', 1], ['Ben', 2]]);
  await expectSoon(() => scores(ben.page), { timeout: 10_000 }).toEqual([['Ana', 1], ['You', 2]]);
  await shot(ben.page, 'moto-friends-against');

  // She gets to the top first, and her card says he's still riding.
  await waitForScreen(page, 'finish');
  await expect(page.locator('#finish-title')).toHaveText('First to the top!');
  expect((await rows(page))[0]).toMatch(/^1st You \d:\d\d\.\d$/);
  expect((await rows(page))[1]).toBe('… Ben still riding');
  // He rides on, and gets there too.
  await childHolds(ben.page, null);
  await waitForScreen(ben.page, 'finish');
  await stopChild(page);
  await stopChild(ben.page);
  await expect(ben.page.locator('#finish-title')).toHaveText('You made it to the top!');
  expect((await rows(ben.page))[0]).toMatch(/^1st Ana \d:\d\d\.\d$/);
  expect((await rows(ben.page))[1]).toMatch(/^2nd You \d:\d\d\.\d$/);
  await expectSoon(async () => (await rows(page))[1], { timeout: 15_000 }).toMatch(/^2nd Ben \d:\d\d\.\d$/);
  await ben.page.waitForTimeout(500);
  await shot(ben.page, 'moto-friends-against-finish');
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('together, a friend who goes in the middle leaves the other to ride on at full speed', async ({ page, browser }) => {
  test.setTimeout(400_000);
  await openMoto(page, { motoBends: 6, motoPace: 'quick' });
  const code = await makeRide(page, 'Ana');
  const ben = await secondPlayer(browser);
  await joinRide(ben.page, code, {}, 'Ben');
  await getReady(page);
  await getReady(ben.page);
  await waitForScreen(page, 'playing');
  await waitForScreen(ben.page, 'playing');
  await childRides(ben.page, { fixed: 0 });
  await childRides(page);
  // Far in front of Ben, who's waiting, Ana is eased off.
  await expectSoon(async () => {
    const now = await state(page);
    return !now.offRoad && now.s - (await state(ben.page)).s > 80 ? now.v / now.cruise : 1;
  }, { timeout: 60_000 }).toBeLessThan(0.75);
  // Ben closes the page. His bike goes, and she's back to full speed.
  await ben.context.close();
  await expectSoon(async () => (await mate(page)).gone, { timeout: 20_000 }).toBe(true);
  await expectSoon(async () => (await mate(page)).visible).toBe(false);
  await expectSoon(async () => {
    const now = await state(page);
    return now.offRoad ? 0 : now.v / now.cruise;
  }, { timeout: 30_000 }).toBeGreaterThan(0.95);
  await expect(page.locator('#moto-scores li')).toHaveCount(2);
  await waitForScreen(page, 'finish');
  await stopChild(page);
  await expect(page.locator('#finish-title')).toHaveText('You rode to the top together!');
});
