// Flying with friends: two children, each on their own computer with their own camera, fly over the island
// together. Here they're two separate browsers, talking through the race server on this computer
// (tools/race-server.mjs), which has the same rules as the one on Cloudflare.
import { expect, openGame, test, waitForScreen } from '../helpers.js';
import { armsAre, dropPlanes } from './helpers.js';

const skyOf = (page) => page.evaluate(() => {
  const { game, flight, mates } = window.__game;
  return {
    screen: game.screen,
    level: flight?.levelNumber ?? null,
    total: flight?.total ?? null,
    left: flight?.left ?? null,
    at: flight ? { x: flight.x, y: flight.y, z: flight.z } : null,
    mates: mates.map(({ friend, live, seen, x, y, z }) => ({ name: friend.spec.name, live, seen, x, y, z })),
    pirates: (game.pirates ?? []).map(({ id }) => id),
    ownLevel: game.levels.current,
  };
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

async function openFlight(page, settings = {}, hash = '') {
  await openGame(page, { level: 'gentle', ...settings }, 'sky-wings', hash);
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'yes');
  await armsAre(page, 'level');
}

/** Chooses a pilot and gets through the body check, skipping the lesson, to wait for the others. */
async function getReady(page) {
  await page.locator('#start').click();
  await waitForScreen(page, 'choose');
  await page.locator('#fly-start').click();
  await waitForScreen(page, 'lesson');
  await page.locator('#lesson-skip').click();
}

/** Drops every pirate, as they come, until the flight is won. */
async function dropThemAll(page) {
  await expect.poll(async () => {
    await dropPlanes(page, 4);
    return (await skyOf(page)).left;
  }, { timeout: 60_000, intervals: [300] }).toBe(0);
}

test('two friends fly together from their own computers, on the host\'s level, and see each other\'s planes', async ({ page, browser }) => {
  test.setTimeout(300_000);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openFlight(page, { planes: 3, levels: { 'sky-wings': 4 } });
  await page.locator('#friends-toggle').click();
  await page.locator('#friends-make').click();
  await expect(page.locator('#friends-code-shown')).toHaveText(/^[A-HJ-NP-Z2-9]{3}$/);
  await page.locator('#friends-name').fill('Ana');
  await page.locator('#friends-name').dispatchEvent('change');
  const code = await page.locator('#friends-code-shown').textContent();
  expect(page.url()).toContain(`#fly=${code}`);
  await expect(page.locator('#friends-toggle')).toHaveText('Fly with a friend');

  // The friend opens the link, with settings of their own.
  const ben = await secondPlayer(browser);
  await openFlight(ben.page, { planes: 9, fighter: 'kit' }, `#fly=${code}`);
  await expect(ben.page.locator('#friends-code-shown')).toHaveText(code);
  for (const each of [page, ben.page]) await expect(each.locator('#friends-here li')).toHaveCount(2);

  await getReady(page);
  await waitForScreen(page, 'waiting');
  await expect(page.locator('#friends-waiting')).toContainText('Ready');
  await page.screenshot({ path: 'test-results/screens/sky-friends-waiting.png' });
  await getReady(ben.page);

  // Both count down together, on the host's level and number of planes.
  await waitForScreen(page, 'fly');
  await waitForScreen(ben.page, 'fly');
  const host = await skyOf(page);
  const guest = await skyOf(ben.page);
  expect([host.level, host.total, guest.level, guest.total]).toEqual([4, 3, 4, 3]);
  expect(host.mates.map(({ name }) => name)).toEqual(['Kit']);
  expect(guest.mates.map(({ name }) => name)).toEqual(['Ana']);
  // A friend's character is never one of the pirates too.
  expect(host.pirates).not.toContain('kit');
  expect(guest.pirates).not.toContain('giraffe');

  // Each sees the other's plane where it really is, a moment ago.
  await expect.poll(async () => (await skyOf(page)).mates[0].seen, { timeout: 15_000 }).toBe(true);
  await page.waitForTimeout(2000);
  const [seen, own] = await Promise.all([skyOf(page), skyOf(ben.page)]);
  const apart = Math.hypot(seen.mates[0].x - own.at.x, seen.mates[0].y - own.at.y, seen.mates[0].z - own.at.z);
  expect(apart).toBeLessThan(25);
  await page.screenshot({ path: 'test-results/screens/sky-friends-flying.png' });

  // Ana drops all of hers first, and Ben is still flying; then he gets his.
  await dropThemAll(page);
  await waitForScreen(page, 'finish');
  await expect(page.locator('#finish-title')).toHaveText('You dropped them all!');
  await expect(page.locator('.friends-results li')).toHaveCount(2);
  await expect(page.locator('.friends-results li').nth(0)).toContainText('1st You all 3 in');
  await expect(page.locator('.friends-results li').nth(1)).toContainText('still flying');
  await dropThemAll(ben.page);
  await waitForScreen(ben.page, 'finish');
  await expect(ben.page.locator('.friends-results li').nth(0)).toContainText('1st Ana all 3 in');
  await expect(ben.page.locator('.friends-results li').nth(1)).toContainText('2nd You all 3 in');
  await expect(page.locator('.friends-results li').nth(1)).toContainText('2nd Kit all 3 in');
  await page.screenshot({ path: 'test-results/screens/sky-friends-finish.png' });

  // Flying with friends doesn't move anyone's own level on, and the only connection was to the race server.
  expect((await skyOf(page)).ownLevel).toBe(4);
  expect((await skyOf(ben.page)).ownLevel).toBe(1);
  expect(sockets).toEqual([`ws://localhost:${Number(new URL(test.info().project.use.baseURL).port) + 1}/room/sky-wings/${code}?make=1`]);

  // Flying again waits for both again.
  await page.locator('#fly-again').click();
  await waitForScreen(page, 'waiting');
  await ben.page.locator('#fly-again').click();
  await waitForScreen(page, 'fly');
  await waitForScreen(ben.page, 'fly');
  expect(ben.errors).toEqual([]);
  await ben.context.close();
  // Ben has gone, and his plane with him, soon after.
  await expect.poll(async () => (await skyOf(page)).mates[0].live, { timeout: 15_000 }).toBe(false);
});

test('a race code and a flight code are kept apart, and a flight can still be flown alone', async ({ page, browser }) => {
  test.setTimeout(180_000);
  await openFlight(page);
  await page.locator('#friends-toggle').click();
  await page.locator('#friends-make').click();
  await expect(page.locator('#friends-code-shown')).toHaveText(/^[A-HJ-NP-Z2-9]{3}$/);
  const code = await page.locator('#friends-code-shown').textContent();

  // Someone with the same code in High Five Racers is told there's no race with it, and isn't in this flight.
  const racer = await secondPlayer(browser);
  await openGame(racer.page, {}, 'high-five-racers', `#race=${code}`);
  await expect(racer.page.locator('#friends-status')).toHaveText('There’s no game with that code just now. Check it with your friend.');
  await expect(racer.page.locator('#friends-here li')).toHaveCount(0);
  await expect(page.locator('#friends-here li')).toHaveCount(1);
  await racer.context.close();

  await getReady(page);
  await waitForScreen(page, 'waiting');
  await expect(page.locator('#friends-wait-status')).toContainText('Nobody else is here yet');
  await page.locator('#friends-alone').click();
  await waitForScreen(page, 'fly');
  expect((await skyOf(page)).mates).toEqual([]);
  expect(await page.evaluate(() => location.hash)).toBe('');
});
