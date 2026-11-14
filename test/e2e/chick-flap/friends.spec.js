// Flap, Little Chick! with friends: children each on their own computer with their own camera, flying home along
// the same track. Whoever makes the flock chooses whether they fly together, as one flock that waits for its
// slowest, or against each other, as a race. Here they're separate browsers, talking through the race server on
// this computer (tools/race-server.mjs), and only numbers go between them.
import { shot } from '../helpers.js';
import { allPlaying, DOWN, expect, expectSoon, flapHands, GAME, hands, joinFlock, labelShown, makeFlock, openGame, secondPlayer, state, stopHands, test, waitForScreen } from './helpers.js';

const ownLevel = (page) => page.evaluate(() => window.__game.session.levels.current);
const track = (game) => game.things.map((thing) => [thing.kind, Math.round(thing.x0 * 100)]);

test('two friends fly home together: the same track on both computers, the one ahead waits, the one waited for is carried up, and both are home at once', async ({ page, browser }) => {
  test.setTimeout(480_000);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  // Together is how it comes, without anyone choosing.
  await openGame(page, { flapWay: 'short', levels: { [GAME]: 4 } }, GAME);
  const code = await makeFlock(page, 'Ana');
  expect(page.url()).toContain(`#flock=${code}`);
  await expect(page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await expect(page.locator('input[name="friends-team"][value="together"]')).toBeEnabled();
  await expect(page.locator('#friends-how')).toContainText('fly home together as one flock');

  // The friend has their own level, length and choice, and flies the host's.
  const ben = await secondPlayer(browser);
  await openGame(ben.page, { flapWay: 'long', flapFriends: 'against', levels: { [GAME]: 9 } }, GAME, `#flock=${code}`);
  await ben.page.locator('#friends-name').fill('Ben');
  await ben.page.locator('#friends-name').dispatchEvent('change');
  await expect(page.locator('#friends-here')).toContainText('Ben');
  await expect(ben.page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await expect(ben.page.locator('input[name="friends-team"][value="against"]')).toBeDisabled();
  await expect(ben.page.locator('#friends-teams-whose')).toHaveText('Ana chose.');
  expect(await ben.page.evaluate(() => window.__game.session.settings.flapFriends)).toBe('against');
  await page.waitForTimeout(300);
  await shot(page, 'flap-friends-box');
  await allPlaying(page, ben.page);

  const [ana, his] = [await state(page), await state(ben.page)];
  expect([ana.together, his.together]).toEqual([true, true]);
  expect([ana.level, his.level]).toEqual([4, 4]);
  expect([ana.progress.of, his.progress.of]).toEqual([8, 8]);
  // One seed for both: the same things in the same places, and nothing that moves by a game's own clock.
  expect(track(his)).toEqual(track(ana));
  expect(ana.things.some((thing) => thing.kind === 'pond')).toBe(true);

  // Ben rests, and Ana flies on: her chick stops and waits for his, a little way ahead, and says so.
  await hands(ben.page, DOWN, DOWN);
  await flapHands(page);
  await expectSoon(async () => (await state(page)).chick.flockWait, { timeout: 60_000, intervals: [50] }).toBe(true);
  const waiting = await state(page);
  expect(waiting.fox.sitting).toBe(true);
  await expectSoon(() => labelShown(page, 'flock'), { timeout: 8000 }).toBe(true);
  // Each sees the other's chick where it is, give or take a moment, with its name over it.
  await expectSoon(async () => (await state(page)).friends[0]?.name, { timeout: 10_000 }).toBe('Ben');
  await expectSoon(async () => (await state(ben.page)).friends[0]?.name, { timeout: 10_000 }).toBe('Ana');
  const [here, there] = await Promise.all([state(page), state(ben.page)]);
  expect(Math.abs(here.friends[0].x - there.chick.x)).toBeLessThan(1.5);
  expect(Math.abs(there.friends[0].x - here.chick.x)).toBeLessThan(1.5);
  expect(here.chick.x - there.chick.x).toBeGreaterThan(3.4);
  await page.waitForTimeout(400);
  await shot(page, 'flap-friends-waiting');
  await ben.page.screenshot({ path: 'test-results/screens/flap-friends-behind.png' });

  // Ben's chick has been waited for: his mother hen carries it up to the flock, and off they both go.
  await expectSoon(async () => (await state(ben.page)).hen, { timeout: 30_000, intervals: [50] }).toEqual({ why: 'flock' });
  await expectSoon(async () => (await state(ben.page)).chick.state, { timeout: 15_000 }).toBe('run');
  const caught = await Promise.all([state(page), state(ben.page)]);
  expect(caught[0].chick.x - caught[1].chick.x).toBeLessThan(3.4);
  await flapHands(ben.page);

  // Home, and both games finish together, with nobody placed.
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  for (const each of [page, ben.page]) await stopHands(each);
  const ends = await Promise.all([state(page), state(ben.page)]);
  expect(Math.abs(ends[0].stats.seconds - ends[1].stats.seconds)).toBeLessThan(3);
  // The fox keeps his distance from a flock, whatever happened on the way.
  expect(ends[0].fox.gap).toBeGreaterThanOrEqual(3.4);
  expect(ends[1].fox.gap).toBeGreaterThanOrEqual(3.4);
  for (const each of [page, ben.page]) await expect(each.locator('#screen-finish h2')).toHaveText('Everyone is home!');
  await expect(page.locator('.friends-results li')).toHaveCount(2);
  await expect(page.locator('.friends-results')).toHaveClass(/is-team/);
  await expect(page.locator('.friends-results li.is-you')).toContainText(/You\s+\d+ flaps?/);
  await expect(ben.page.locator('.friends-results li.is-you')).toContainText(/You\s+\d+ flaps?/);
  await expect(page.locator('.friends-results li:not(.is-you)')).toContainText(/Ben\s+\d+ flaps?/);
  await page.waitForTimeout(600);
  await shot(page, 'flap-friends-finish');

  // Nobody's own level moves on, and the only connection was to the race server.
  expect(await ownLevel(page)).toBe(4);
  expect(await ownLevel(ben.page)).toBe(9);
  expect(sockets).toEqual([`ws://localhost:${Number(new URL(test.info().project.use.baseURL).port) + 1}/room/chick-flap/${code}?make=1`]);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('two friends race home: nobody waits for anybody, the first home wins, and each one\'s time is on both finish cards', async ({ page, browser }) => {
  test.setTimeout(480_000);
  // Whoever makes the flock has chosen against each other, under the gear icon.
  await openGame(page, { flapWay: 'short', flapFriends: 'against', levels: { [GAME]: 2 } }, GAME);
  const code = await makeFlock(page, 'Ana');
  await expect(page.locator('input[name="friends-team"][value="against"]')).toBeChecked();
  await expect(page.locator('#friends-how')).toContainText('race each other home');
  const ben = await secondPlayer(browser);
  await joinFlock(ben.page, code, { levels: { [GAME]: 7 } }, 'Ben');
  await expect(ben.page.locator('input[name="friends-team"][value="against"]')).toBeChecked();
  await allPlaying(page, ben.page);

  const [ana, his] = [await state(page), await state(ben.page)];
  expect([ana.together, his.together]).toEqual([false, false]);
  expect([ana.level, his.level]).toEqual([2, 2]);
  expect(track(his)).toEqual(track(ana));

  // Ben rests for a while, and Ana flies on: she's never held back.
  await hands(ben.page, DOWN, DOWN);
  await flapHands(page);
  await page.evaluate(() => {
    window.__held = 0;
    const look = () => {
      if (window.__game.farm.chick.flockWait) window.__held += 1;
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
  await expectSoon(async () => (await state(page)).chick.x - (await state(ben.page)).chick.x, { timeout: 60_000 }).toBeGreaterThan(12);
  expect(await page.evaluate(() => window.__held)).toBe(0);
  expect((await state(ben.page)).stats.hen).toBe(0);
  await flapHands(ben.page);

  // Ana is home first, with Ben still on his way.
  await waitForScreen(page, 'finish');
  await stopHands(page);
  await expect(page.locator('#screen-finish h2')).toHaveText('First home!');
  await expect(page.locator('.friends-results li').nth(0)).toContainText(/1st\s+You\s+\d:\d\d\.\d/);
  await page.waitForTimeout(600);
  await shot(page, 'flap-friends-race-finish');
  // Then Ben, second, and his time arrives on her card too.
  await waitForScreen(ben.page, 'finish');
  await stopHands(ben.page);
  await expect(ben.page.locator('#screen-finish h2')).toHaveText('Home safe! What a flyer!');
  await expect(ben.page.locator('.friends-results li').nth(0)).toContainText(/1st\s+Ana\s+\d:\d\d\.\d/);
  await expect(ben.page.locator('.friends-results li').nth(1)).toContainText(/2nd\s+You\s+\d:\d\d\.\d/);
  await expect(page.locator('.friends-results li').nth(1)).toContainText(/2nd\s+Ben\s+\d:\d\d\.\d/, { timeout: 15_000 });
  expect(await ownLevel(page)).toBe(2);
  expect(await ownLevel(ben.page)).toBe(7);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('together, a friend who goes in the middle isn\'t waited for: the one who\'s left flies home', async ({ page, browser }) => {
  test.setTimeout(360_000);
  await openGame(page, { flapWay: 'short' }, GAME);
  const code = await makeFlock(page, 'Ana');
  const ben = await secondPlayer(browser);
  await joinFlock(ben.page, code, {}, 'Ben');
  await allPlaying(page, ben.page);
  expect((await state(page)).together).toBe(true);
  // Ben's computer is gone.
  await ben.context.close();
  await flapHands(page);
  await waitForScreen(page, 'finish');
  await stopHands(page);
  const end = await state(page);
  expect(end.stats.cleared).toBe(8);
  await expect(page.locator('#screen-finish h2')).toHaveText('Everyone is home!');
  await expect(page.locator('.friends-results li')).toHaveCount(1);
});
