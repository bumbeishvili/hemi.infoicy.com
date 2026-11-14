// Playing Giraffe's Smoothie Stand with friends: each child on their own computer with their own camera, all at the
// same stand, slicing from the same fruit for the same customers. The host's game runs the stand, and every game
// works out where each fruit is from how it was thrown, so it's in the same place on every screen. Whoever's glove
// slices a fruit first has it, as the server decides, and it's gone for everyone. Here they're separate browsers,
// talking through the race server on this computer (tools/race-server.mjs).
import { expect, openGame as openPage, shot, show, test, waitForScreen } from '../helpers.js';
import { judgeBrightness, storyIs, watchBrightness } from './helpers.js';

const GAME = 'smoothie-stand';
// The slow pace that was the default when these were written, unless a test says. With friends, customers always wait.
const openGame = (page, settings = {}, ...rest) => openPage(page, { smoothiePace: 'slow', ...settings }, ...rest);
const CODE = /^[A-HJ-NP-Z2-9]{3}$/;

/** How the stand is on one child's screen. Fruit that hasn't been thrown yet is still below the screen. */
const standOf = (page) => page.evaluate(() => {
  const { game, field, stand } = window.__game;
  const now = game.friendly ? game.clock() : 0;
  return {
    friendly: Boolean(game.friendly),
    runner: game.isRunner,
    runnerId: game.runnerId,
    you: game.friends.room.you,
    clock: now,
    shared: Boolean(field.shared),
    pace: field.paceName,
    slicing: field.slicing,
    gravity: field.sharedGravity,
    throwing: field.throwing,
    fruit: field.fruit.filter((fruit) => !fruit.anchor || now >= fruit.anchor.t).map(({ id, kind, x, y, anchor }) => ({ id, kind, x: x / field.width, y: y / field.height, anchor: anchor ? { ...anchor } : null })),
    customers: stand.customers.length,
    index: stand.index,
    left: { ...stand.left },
    smoothies: stand.stats.smoothies,
    points: game.points,
    scores: Object.fromEntries(game.scores),
    gloves: game.friendsGloves.map(({ name, glove, fade }) => ({ name, visible: glove.visible, fade, x: glove.x / field.width, y: glove.y / field.height })),
    ownLevel: window.__game.session.levels.current,
  };
});

/** Where the child's own glove is, across and down the screen, or null. */
const gloveAt = (page) => page.evaluate(() => {
  const { field } = window.__game;
  const glove = field.gloves[field.side];
  return glove.visible ? { x: glove.x / field.width, y: glove.y / field.height } : null;
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

async function giveName(page, name) {
  await page.locator('#friends-name').fill(name);
  await page.locator('#friends-name').dispatchEvent('change');
}

/** A grown-up makes a game, and gets its code. */
async function makeGame(page, name) {
  await page.locator('#friends-toggle').click();
  await page.locator('#friends-make').click();
  await expect(page.locator('#friends-code-shown')).toHaveText(CODE);
  await giveName(page, name);
  return page.locator('#friends-code-shown').textContent();
}

/** A friend opens the game with their own settings, and joins by typing the code, which joins as soon as it's typed. */
async function joinGame(page, code, settings, name) {
  await openGame(page, settings, GAME);
  await page.locator('#friends-toggle').click();
  await page.locator('#friends-code').fill(code);
  await expect(page.locator('#friends-code-shown')).toHaveText(code);
  await giveName(page, name);
}

/** Everyone gets through the hand check and waits for each other, and then they all play, hands out of view. */
async function allPlaying(...pages) {
  for (const each of pages) {
    await show(each, null, 'open', { scale: 0.7 });
    await each.locator('#start').click();
  }
  for (const each of pages) await waitForScreen(each, 'playing');
  for (const each of pages) {
    await show(each, null, null);
    await expect.poll(() => gloveAt(each)).toBe(null);
  }
}

/** On the game running the stand, nothing more thrown, and nothing in the air, for a test about one fruit at a time. */
const clearTheAir = (page) => page.evaluate(() => {
  const { field } = window.__game;
  field.throwing = false;
  field.fruit = [];
});

/** On the game running the stand, a fruit that hangs still, there, across and down the screen. Returns its id. */
const fruitAt = (page, kind, { x, y }) => page.evaluate(([what, across, down]) => {
  const { field } = window.__game;
  return field.throwShared(what, { x: across * field.width, y: down * field.height }).id;
}, [kind, x, y]);

/** On the game running the stand, every order made as if friends had sliced it all. */
const finishOrder = (page) => page.evaluate(() => {
  const { stand } = window.__game;
  for (const kind of stand.wantedKinds) while (stand.left[kind] > 0) stand.slice(kind);
});

/** Each customer gets their smoothie, one after another, on the game running the stand, and the day ends. */
async function finishTheDay(runner, everyone) {
  for (const who of ['truffle', 'kit', 'bramble']) {
    for (const each of everyone) await storyIs(each, who);
    await finishOrder(runner);
  }
  for (const each of everyone) await waitForScreen(each, 'finish');
}

const raceServer = () => `ws://localhost:${Number(new URL(test.info().project.use.baseURL).port) + 1}`;

test('friends play at the host\'s stand: the same fruit, where it really is, on both screens, and each other\'s gloves', async ({ page, browser }) => {
  test.setTimeout(300_000);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openGame(page, { customers: 3, smoothiePace: 'slow', levels: { [GAME]: 4 } }, GAME);
  const code = await makeGame(page, 'Ana');
  expect(page.url()).toContain(`#stand=${code}`);

  // The friend has their own customers, pace and way of slicing, and opens the link.
  const ben = await secondPlayer(browser);
  await openGame(ben.page, { customers: 6, smoothiePace: 'fast', slicing: 'touch' }, GAME, `#stand=${code}`);
  await giveName(ben.page, 'Ben');
  await expect(page.locator('#friends-here')).toContainText('Ben');
  await allPlaying(page, ben.page);

  const [ana, his] = [await standOf(page), await standOf(ben.page)];
  expect([ana.friendly, his.friendly]).toEqual([true, true]);
  expect([ana.runner, his.runner]).toEqual([true, false]);
  expect(his.runnerId).toBe(ana.you);
  // The host's stand: three customers, at the host's pace, and each child slices their own way.
  expect([ana.customers, his.customers]).toEqual([3, 3]);
  expect([ana.pace, his.pace]).toEqual(['slow', 'slow']);
  expect([ana.slicing, his.slicing]).toEqual(['swipe', 'touch']);
  await storyIs(page, 'truffle');
  await storyIs(ben.page, 'truffle');
  await expect(ben.page.locator('.order-item[data-fruit="apple"] .order-count')).toHaveText('0 / 4');
  await expect(ben.page.locator('#chip-smoothies')).toHaveText('0 of 3');
  await expect(ben.page.locator('#stand-scores li')).toHaveCount(2);

  // Ben has the very fruit Ana's game threw, where it is on hers, at the same moment, and it falls the same.
  await expect.poll(async () => (await standOf(ben.page)).fruit.length, { timeout: 15_000 }).toBeGreaterThan(1);
  await page.waitForTimeout(600);
  const [hers, seen] = await Promise.all([standOf(page), standOf(ben.page)]);
  expect(seen.gravity).toBe(hers.gravity);
  // Both clocks count from hearing "GO!", which comes to both at once.
  expect(Math.abs(hers.clock - seen.clock)).toBeLessThan(150);
  const theirs = new Map(hers.fruit.map((fruit) => [fruit.id, fruit]));
  const both = seen.fruit.filter(({ id }) => theirs.has(id));
  expect(both.length).toBeGreaterThan(1);
  for (const fruit of both) {
    const there = theirs.get(fruit.id);
    expect(fruit.kind).toBe(there.kind);
    expect(fruit.anchor).toEqual(there.anchor);
    // Where it is on each screen, allowing for the moment between reading one and the other.
    const lag = Math.abs(hers.clock - seen.clock) / 1000;
    expect(Math.abs(fruit.x - there.x)).toBeLessThan(0.01 + lag * 0.1);
    expect(Math.abs(fruit.y - there.y)).toBeLessThan(0.02 + lag * 1.2);
  }
  await ben.page.screenshot({ path: 'test-results/screens/smoothie-friends-same-fruit.png' });

  // Ben's hand comes into view: his glove is on Ana's screen, in grey with his name, where it is on his.
  await show(ben.page, null, 'open', { scale: 0.7, rightOffsetX: -120 });
  await expect.poll(() => gloveAt(ben.page)).not.toBe(null);
  await expect.poll(async () => (await standOf(page)).gloves[0]?.visible, { timeout: 10_000 }).toBe(true);
  await page.waitForTimeout(800);
  const [onHers, his2] = [(await standOf(page)).gloves[0], await gloveAt(ben.page)];
  expect(onHers.name).toBe('Ben');
  expect(Math.abs(onHers.x - his2.x)).toBeLessThan(0.05);
  expect(Math.abs(onHers.y - his2.y)).toBeLessThan(0.05);
  await shot(page, 'smoothie-friends-glove');

  // Nothing flashes on a friend's screen, with the fruit and a friend's glove going by.
  await show(page, null, 'open', { scale: 0.7 });
  const result = judgeBrightness(await watchBrightness(ben.page, 400));
  console.log('with a friend', JSON.stringify(result));
  expect(result.biggestStep).toBeLessThan(3);
  expect(result.flickeringShare).toBeLessThan(0.05);

  // Nobody's own level or settings change, and the only connection was to the race server.
  expect((await standOf(page)).ownLevel).toBe(4);
  expect(await ben.page.evaluate(() => window.__game.session.settings.customers)).toBe(6);
  expect(await ben.page.evaluate(() => window.__game.session.settings.smoothiePace)).toBe('fast');
  expect(sockets).toEqual([`${raceServer()}/room/${GAME}/${code}?make=1`]);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('a fruit goes to whoever slices it first, it\'s gone for both, and the finish card has both scores', async ({ page, browser }) => {
  test.setTimeout(360_000);
  await openGame(page, { customers: 3, slicing: 'touch' }, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, { slicing: 'touch' }, 'Ben');
  await allPlaying(page, ben.page);
  await clearTheAir(page);
  await expect.poll(async () => (await standOf(ben.page)).fruit.length, { timeout: 10_000 }).toBe(0);

  // An apple, which Truffle ordered, hanging still on Ben's hand: Ben slices it, it's his, and it's gone from Ana's.
  await show(ben.page, null, 'open', { scale: 0.7 });
  await expect.poll(() => gloveAt(ben.page)).not.toBe(null);
  await ben.page.waitForTimeout(500);
  const apple = await fruitAt(page, 'apple', await gloveAt(ben.page));
  await expect.poll(async () => (await standOf(ben.page)).points, { timeout: 15_000 }).toBe(2);
  await expect.poll(async () => (await standOf(page)).fruit.some(({ id }) => id === apple), { timeout: 5000 }).toBe(false);
  expect((await standOf(page)).points).toBe(0);
  // It's on the order for everyone, and his points are on both screens.
  await expect.poll(async () => (await standOf(page)).left.apple, { timeout: 5000 }).toBe(3);
  await expect(ben.page.locator('.order-item[data-fruit="apple"] .order-count')).toHaveText('1 / 4');
  await expect(page.locator('#stand-scores')).toContainText(/Ben\s*2/);
  await show(ben.page, null, null);
  await expect.poll(() => gloveAt(ben.page)).toBe(null);

  // An orange, which isn't on the order, on Ana's hand: one point for her.
  await show(page, null, 'open', { scale: 0.7 });
  await expect.poll(() => gloveAt(page)).not.toBe(null);
  await page.waitForTimeout(500);
  const orange = await fruitAt(page, 'orange', await gloveAt(page));
  await expect.poll(async () => (await standOf(page)).points, { timeout: 15_000 }).toBe(1);
  await expect.poll(async () => (await standOf(ben.page)).scores, { timeout: 5000 }).toEqual({ [(await standOf(page)).you]: 1 });
  expect((await standOf(ben.page)).fruit.some(({ id }) => id === orange)).toBe(false);

  // Both hands on the same apple as it comes: both slice it, and only one of them has it.
  await show(ben.page, null, 'open', { scale: 0.7 });
  await expect.poll(() => gloveAt(ben.page)).not.toBe(null);
  await page.waitForTimeout(500);
  const spot = await gloveAt(page);
  expect(Math.hypot(spot.x - (await gloveAt(ben.page)).x, spot.y - (await gloveAt(ben.page)).y)).toBeLessThan(0.03);
  const before = (await standOf(page)).points + (await standOf(ben.page)).points;
  const shared = await fruitAt(page, 'apple', spot);
  await expect.poll(async () => (await standOf(page)).fruit.some(({ id }) => id === shared) || (await standOf(ben.page)).fruit.some(({ id }) => id === shared), { timeout: 15_000 }).toBe(false);
  await page.waitForTimeout(1500);
  for (const each of [page, ben.page]) await show(each, null, null);
  const after = (await standOf(page)).points + (await standOf(ben.page)).points;
  expect(after - before).toBe(2);
  const sliced = await Promise.all([page, ben.page].map((each) => each.evaluate((id) => window.__game.game.myClaims.has(id), shared)));
  console.log('both sliced it', JSON.stringify(sliced));
  expect(sliced.some(Boolean)).toBe(true);
  await expect.poll(async () => (await standOf(page)).left.apple, { timeout: 5000 }).toBe(2);
  await expect.poll(async () => (await standOf(ben.page)).left.apple, { timeout: 5000 }).toBe(2);

  // The rest of the day, and both finish together, with both scores on both cards, the most first.
  const [anaPoints, benPoints] = [(await standOf(page)).points, (await standOf(ben.page)).points];
  await finishTheDay(page, [page, ben.page]);
  await expect(page.locator('#screen-finish h2')).toHaveText('You won the Golden Cup!');
  for (const [each, mine, friend, name] of [[page, anaPoints, benPoints, 'Ben'], [ben.page, benPoints, anaPoints, 'Ana']]) {
    const rows = each.locator('.friends-results li');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText(mine >= friend ? 'You' : name);
    await expect(each.locator('.friends-results')).toContainText(new RegExp(`You\\s*${mine} point`));
    await expect(each.locator('.friends-results')).toContainText(new RegExp(`${name}\\s*${friend} point`));
    await expect(each.locator('#finish-hero')).toHaveText('3');
  }
  await page.waitForTimeout(400);
  await shot(page, 'smoothie-friends-finish');
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('a friend who goes takes their glove with them, and the host plays on to the end', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openGame(page, { customers: 3 }, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, {}, 'Ben');
  await allPlaying(page, ben.page);
  await show(ben.page, null, 'open', { scale: 0.7 });
  await expect.poll(async () => (await standOf(page)).gloves[0]?.visible, { timeout: 15_000 }).toBe(true);
  await ben.context.close();
  await expect.poll(async () => (await standOf(page)).gloves.length, { timeout: 15_000 }).toBe(0);
  await expect(page.locator('#stand-scores li')).toHaveCount(1);
  // The stand carries on: still throwing, for the one still here.
  const now = await standOf(page);
  expect(now.runner).toBe(true);
  expect(now.throwing).toBe(true);
  await expect.poll(async () => (await standOf(page)).fruit.length, { timeout: 10_000 }).toBeGreaterThan(0);
  await finishTheDay(page, [page]);
  await expect(page.locator('.friends-results li')).toHaveCount(1);
  await expect(page.locator('.friends-results li').nth(0)).toContainText('1st You');
});

test('when the host goes, the next one runs the stand, from where it was, and plays on to the end', async ({ page, browser }) => {
  test.setTimeout(300_000);
  // Ana makes the game, in a browser of her own, and Ben, on this one, joins it.
  const ana = await secondPlayer(browser);
  await openGame(ana.page, { customers: 3, slicing: 'touch' }, GAME);
  const code = await makeGame(ana.page, 'Ana');
  await joinGame(page, code, { slicing: 'touch' }, 'Ben');
  await allPlaying(ana.page, page);
  await clearTheAir(ana.page);

  // Ben slices an apple first, so the order has moved on.
  await show(page, null, 'open', { scale: 0.7 });
  await expect.poll(() => gloveAt(page)).not.toBe(null);
  await page.waitForTimeout(500);
  await fruitAt(ana.page, 'apple', await gloveAt(page));
  await expect.poll(async () => (await standOf(page)).points, { timeout: 15_000 }).toBe(2);
  await expect.poll(async () => (await standOf(page)).left.apple, { timeout: 5000 }).toBe(3);
  await show(page, null, null);
  await expect.poll(() => gloveAt(page)).toBe(null);
  await ana.page.evaluate(() => {
    window.__game.field.throwing = true;
  });
  await expect.poll(async () => (await standOf(page)).fruit.length, { timeout: 10_000 }).toBeGreaterThan(0);
  expect(ana.errors).toEqual([]);

  // The host goes. Ben's game runs the stand from then on, with the same customer and what's left of the order.
  await ana.context.close();
  await expect.poll(async () => (await standOf(page)).runner, { timeout: 20_000 }).toBe(true);
  const after = await standOf(page);
  expect(after.index).toBe(0);
  expect(after.left.apple).toBe(3);
  expect(after.throwing).toBe(true);
  // New fruit, from Ben's own numbers: he was second in the game.
  await expect.poll(async () => (await standOf(page)).fruit.filter(({ id }) => Math.floor(id / 8 / 25_000) === 1).length, { timeout: 10_000 }).toBeGreaterThan(0);
  await expect(page.locator('#stand-scores li')).toHaveCount(1);
  await shot(page, 'smoothie-friends-took-over');

  // His own slices still count, now that his game counts them for the order.
  await show(page, null, 'open', { scale: 0.7 });
  await expect.poll(() => gloveAt(page)).not.toBe(null);
  await clearTheAir(page);
  await page.waitForTimeout(300);
  await fruitAt(page, 'apple', await gloveAt(page));
  await expect.poll(async () => (await standOf(page)).points, { timeout: 15_000 }).toBe(4);
  await expect.poll(async () => (await standOf(page)).left.apple, { timeout: 5000 }).toBe(2);
  await show(page, null, null);

  // The rest of the day, on his own now.
  await finishOrder(page);
  await storyIs(page, 'kit');
  await finishOrder(page);
  await storyIs(page, 'bramble');
  await finishOrder(page);
  await waitForScreen(page, 'finish');
  await expect(page.locator('.friends-results li')).toHaveCount(1);
  await expect(page.locator('.friends-results li').nth(0)).toContainText('1st You 4 points');
});

test('on their own, the stand is as it always was, and nothing connects anywhere', async ({ page }) => {
  test.setTimeout(120_000);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openGame(page, { customers: 6 }, GAME);
  await show(page, null, 'open', { scale: 0.7 });
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
  await storyIs(page, 'truffle');
  const alone = await standOf(page);
  expect([alone.friendly, alone.shared]).toEqual([false, false]);
  expect(alone.throwing).toBe(true);
  await expect(page.locator('#chip-smoothies')).toHaveText('0 of 6');
  await expect(page.locator('#stand-scores')).toBeHidden();
  await expect.poll(async () => (await standOf(page)).fruit.length, { timeout: 5000 }).toBeGreaterThan(1);
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(policy).toMatch(/connect-src 'self' wss:\/\/hemi-race\.infoicy\.com ws:\/\/localhost:\*[ ;]/);
  expect(sockets).toEqual([]);
});
