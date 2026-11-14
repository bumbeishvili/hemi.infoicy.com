// Running Leap Trail with friends: two children, each on their own computer with their own camera, run the same
// trail. Each sees the other's runner on it, copying them, and a star on the trail is had by whoever gets to it
// first. Here they're two separate browsers, talking through the race server on this computer
// (tools/race-server.mjs).
import { expect, openGame, test, waitForScreen } from '../helpers.js';
import { footage, standInView } from './helpers.js';

const GAME = 'leap-trail';

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

async function openRun(page, settings = {}, hash = '') {
  await openGame(page, { onMissed: 'stumble', pace: 'slow', ...settings }, GAME, hash);
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'yes');
  await standInView(page);
}

/** A grown-up makes a run, and gets its code. */
async function makeRun(page, name) {
  await page.locator('#friends-toggle').click();
  await page.locator('#friends-make').click();
  await expect(page.locator('#friends-code-shown')).toHaveText(/^[A-HJ-NP-Z2-9]{3}$/);
  if (name) {
    await page.locator('#friends-name').fill(name);
    await page.locator('#friends-name').dispatchEvent('change');
  }
  return page.locator('#friends-code-shown').textContent();
}

/** Chooses a runner and presses Let's run!, skipping the practice, to wait for the others. */
async function getReady(page) {
  await page.locator('#start').click();
  await waitForScreen(page, 'choose');
  await page.locator('#run-start').click();
  await waitForScreen(page, 'practice');
  await page.locator('#practice-skip').click();
}

const trailOf = (page) => page.evaluate(() => {
  const { run, world, mates, game } = window.__game;
  return {
    friends: run.friends,
    obstacles: run.course.length,
    speed: run.settings.speed,
    layout: JSON.stringify({ course: run.course.map(({ kind, at, lanes }) => [kind, Math.round(at * 100), lanes]), stars: run.starLines.map(({ at, lane }) => [Math.round(at * 100), lane]) }),
    lined: run.stats.linedStars,
    total: run.starTotal,
    mates: mates.map(({ friend }) => friend.spec.name),
    mateShown: world.mates.map(({ shown }) => shown),
    ownLevel: game.levels.current,
  };
});

test('two friends run the same trail from their own computers, see each other, and a star is had by only one', async ({ page, browser }) => {
  test.setTimeout(300_000);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openRun(page, { obstacles: 10, pace: 'slow', levels: { [GAME]: 4 } });
  const code = await makeRun(page, 'Ana');
  expect(page.url()).toContain(`#run=${code}`);

  // The friend has settings of their own, and runs the host's trail.
  const ben = await secondPlayer(browser);
  await openRun(ben.page, { obstacles: 40, pace: 'fast', fighter: 'kit' }, `#run=${code}`);
  await ben.page.locator('#friends-name').fill('Ben');
  await ben.page.locator('#friends-name').dispatchEvent('change');
  await expect(page.locator('#friends-here')).toContainText('Ben');

  await getReady(page);
  await getReady(ben.page);
  await waitForScreen(page, 'run');
  await waitForScreen(ben.page, 'run');
  const [ana, his] = [await trailOf(page), await trailOf(ben.page)];
  expect([ana.friends, his.friends]).toEqual([true, true]);
  expect([ana.obstacles, his.obstacles]).toEqual([10, 10]);
  expect(his.speed).toBe(ana.speed);
  expect(his.layout).toBe(ana.layout);
  expect([ana.mates, his.mates]).toEqual([['Ben'], ['Ana']]);

  // Each sees the other's runner on the trail, with their name over it.
  await expect.poll(async () => (await trailOf(page)).mateShown[0], { timeout: 15_000 }).toBe(true);
  await expect(page.locator('.runner-mark[data-where="on"]')).toHaveCount(1);
  await expect(page.locator('.runner-mark-name')).toHaveText('Ben');
  await page.screenshot({ path: 'test-results/screens/trail-friends-running.png' });

  // Ben's arms go up, and so do his runner's, on Ana's screen.
  await footage(ben.page, 'star-jumps', { from: 2.5, playing: false });
  await expect.poll(() => page.evaluate(() => window.__game.world.mates[0].runner.live?.handLY ?? -1), { timeout: 10_000 }).toBeGreaterThan(0.15);
  await standInView(ben.page);

  // A star ahead that Ana gets to first is hers, and gone from Ben's trail.
  const star = await page.evaluate(() => {
    const { run } = window.__game;
    return run.starLines.find(({ at, asked }) => at > run.distance + 40 && !asked).index;
  });
  const before = (await trailOf(page)).lined;
  await page.evaluate((index) => window.__game.friends.claim(index), star);
  await expect.poll(async () => (await trailOf(page)).lined - before, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
  expect(await page.evaluate((index) => window.__game.run.starLines[index].taken, star)).toBe(true);
  await expect.poll(() => ben.page.evaluate((index) => window.__game.run.starLines[index].gone === true, star), { timeout: 10_000 }).toBe(true);
  // And her stars are on Ben's scoreboard.
  await expect(ben.page.locator('#run-scores')).toContainText(new RegExp(`Ana\\s*${(await trailOf(page)).total}`));

  // Both get to the end: the finish card ranks the stars, the most first.
  for (const each of [page, ben.page]) {
    await each.evaluate(() => {
      const { run } = window.__game;
      run.distance = run.end - 3;
      run.noteActivity();
    });
  }
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  const [anaEnd, benEnd] = [await trailOf(page), await trailOf(ben.page)];
  const anaFirst = anaEnd.total >= benEnd.total;
  await expect(page.locator('.friends-results li')).toHaveCount(2);
  await expect(page.locator('.friends-results li').nth(0)).toContainText(anaFirst ? 'You' : 'Ben');
  await expect(page.locator('#finish-title')).toHaveText(anaFirst ? 'You caught the most stars!' : 'Great running!');
  // On a tie, each child's own card lists them first, and both are 1st.
  const place = anaEnd.total >= benEnd.total ? '1st' : '2nd';
  await expect(ben.page.locator('.friends-results li', { hasText: 'Ana' })).toContainText(place);
  await page.screenshot({ path: 'test-results/screens/trail-friends-finish.png' });

  // Nobody's own level moves on, nobody's settings change, and the only connection was to the race server.
  expect(anaEnd.ownLevel).toBe(4);
  expect(benEnd.ownLevel).toBe(1);
  expect(await ben.page.evaluate(() => window.__game.game.settings.obstacles)).toBe(40);
  expect(sockets).toEqual([`ws://localhost:${Number(new URL(test.info().project.use.baseURL).port) + 1}/room/leap-trail/${code}?make=1`]);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('on their own, a run is as it always was, with every extra, and nothing connects anywhere', async ({ page }) => {
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openRun(page, { obstacles: 10, levels: { [GAME]: 9 } });
  await getReady(page);
  await waitForScreen(page, 'run');
  const run = await page.evaluate(() => ({ friends: window.__game.run.friends, powers: window.__game.run.pickups.length, mates: window.__game.mates.length }));
  expect(run).toEqual({ friends: false, powers: run.powers, mates: 0 });
  expect(run.powers).toBeGreaterThan(0);
  await expect(page.locator('#run-scores')).toBeHidden();
  expect(sockets).toEqual([]);
});
