// Playing Balloon Pop with friends: two children, each on their own computer with their own camera, play one
// game together. The host's game runs the balloons and the sums, and everyone sees the same ones: whoever's
// hand gets to a balloon first has it, and it's gone for everyone. Here they're two separate browsers,
// talking through the race server on this computer (tools/race-server.mjs).
import { expect, openGame, show, test, waitForScreen } from './helpers.js';

const GAME = 'balloon-pop';

const popOf = (page) => page.evaluate(() => {
  const { game, balloons, deck } = window.__game;
  return {
    timed: game.timed ? { ...game.timed } : null,
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
  await openGame(page, { balloons: 20, maths: 'off', levels: { 'balloon-pop': 2 } }, GAME);
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
  await openGame(page, { balloons: 40, maths: 'add' }, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await openGame(ben.page, { maths: 'off' }, GAME, `#pop=${code}`);
  await bothPlaying(page, ben.page);
  const [ana, his] = [await popOf(page), await popOf(ben.page)];
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
