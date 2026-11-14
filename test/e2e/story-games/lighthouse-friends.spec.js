// Playing The Lighthouse Keeper with friends: each on their own computer with their own camera, all wiping the
// same windows. Everyone has the host's ships in the plain storm, with the mud laid out the same from one seed,
// sees everyone else's glove on the glass, and each patch of mud is whoever's hand wiped it first, as the server
// decides, gone from every screen. Here they're separate browsers, talking through the race server on this
// computer (tools/race-server.mjs), with real photos of hands going through the real tracker.
import { expect, shot, show, test, waitForScreen } from '../helpers.js';
import { judgeBrightness, moveGloveTo, stopMoving, watchBrightness } from './helpers.js';
import { openGame } from './challenge-helpers.js';

const GAME = 'lighthouse';
const OPEN = [null, 'open', { scale: 0.7 }];
const LEFT_OPEN = ['open', null, { scale: 0.7 }];
const GLOVE = ['room', 'gloves', 'right'];
const CODE = /^[A-HJ-NP-Z2-9]{3}$/;
const GRID = { columns: 14, rows: 9 };

/** How it is on one child's screen. */
const view = (page) => page.evaluate(() => {
  const { game, storm, room } = window.__game;
  const { window: glass } = room;
  const share = (glove) => ({ x: (glove.x - glass.x) / glass.width, y: (glove.y - glass.y) / glass.height });
  const own = room.gloves[room.side];
  return {
    mode: game.mode,
    you: game.friends.room.you,
    seed: game.seed,
    ships: storm.ships.map(({ who }) => who),
    level: { ...storm.level },
    index: storm.index,
    home: storm.home,
    clean: storm.clean,
    ready: Boolean(room.mud) && !room.mudFading && room.sailing === 0,
    cells: storm.mud ? [...storm.mud.cells].join('') : '',
    tally: Object.fromEntries(game.tally),
    owners: Object.fromEntries([...game.patches].map(([w, patches]) => [w, Object.fromEntries(patches)])),
    waiting: game.unanswered.size + game.toClaim.size,
    glove: own.visible ? share(own) : null,
    friends: game.friendGloves.map(({ id, name, fade, glove }) => ({ id, name, fade, visible: glove.visible, ...share(glove) })),
    window: { x: glass.x / room.width, width: glass.width / room.width },
    ownLevel: window.__game.session.levels.current,
    settings: { ships: window.__game.session.settings.ships, reach: window.__game.session.settings.reach, hands: window.__game.session.settings.hands },
  };
});

/** The mud as it looks on the screen, small enough to compare. */
const mudLook = (page) => page.evaluate(() => {
  const { mud } = window.__game.room;
  const small = document.createElement('canvas');
  small.width = 56;
  small.height = 36;
  const ctx = small.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(mud, 0, 0, small.width, small.height);
  return [...ctx.getImageData(0, 0, small.width, small.height).data];
});

/** How many of these patches of the window are gone from the mud on the screen, right in their middle. */
const clearedOnScreen = (page, patches) => page.evaluate(({ cells, columns, rows }) => {
  const { mud } = window.__game.room;
  if (!mud) return 0;
  const ctx = mud.getContext('2d');
  return cells.filter((cell) => {
    const x = Math.floor((((cell % columns) + 0.5) * mud.width) / columns);
    const y = Math.floor(((Math.floor(cell / columns) + 0.5) * mud.height) / rows);
    return ctx.getImageData(x, y, 1, 1).data[3] === 0;
  }).length;
}, { cells: patches, ...GRID });

/**
 * Wipes the window there now through the room, as a hand does, a row at a time, so its mud goes on the screen
 * too, and each patch is claimed as the child's hand's would be.
 */
const wipeRows = (page, { top = 0, bottom = 1, left = 0, right = 1 } = {}) => page.evaluate((area) => {
  const { room, game } = window.__game;
  const { window: glass } = room;
  for (let y = area.top; y <= area.bottom + 1e-9; y += 0.1) {
    room.last = null;
    for (let x = area.left; x <= area.right + 1e-9; x += 0.04) room.wipeAt({ x: glass.x + x * glass.width, y: glass.y + y * glass.height }, game.wipe);
  }
  room.last = null;
}, { top, bottom, left, right });

const expectSoon = (read, options = {}) => expect.poll(read, { timeout: 30_000, intervals: [100], ...options });

/** Until every patch wiped on these screens has been claimed and answered, and they all agree on whose each is. */
async function settled(...pages) {
  await expectSoon(async () => {
    const views = await Promise.all(pages.map(view));
    const tally = JSON.stringify(views[0].tally);
    return views.every((each) => each.waiting === 0 && JSON.stringify(each.tally) === tally);
  }).toBe(true);
}

/** Wipes a whole window, once it's there, unless it's clean already, and its ship comes home on every screen. */
async function cleanWindow(page, index, everyone) {
  await expectSoon(async () => {
    const now = await view(page);
    return now.index > index || (now.index === index && (now.clean || now.ready));
  }).toBe(true);
  const now = await view(page);
  if (now.index === index && !now.clean) await wipeRows(page);
  for (const each of everyone) await expectSoon(async () => (await view(each)).home, { timeout: 45_000 }).toBeGreaterThanOrEqual(index + 1);
}

/** How many patches each one had, counted from whose each patch is, as one screen has heard it. */
const counted = ({ owners, tally }) => {
  const counts = Object.fromEntries(Object.keys(tally).map((id) => [id, 0]));
  for (const patches of Object.values(owners)) for (const by of Object.values(patches)) counts[by] = (counts[by] ?? 0) + 1;
  return counts;
};

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

/** A name, if they'd like one, typed once they're in a game. */
async function giveName(page, name) {
  if (!name) return;
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

/** A friend opens the game with their own settings, and joins with the code, which joins as soon as it's typed. */
async function joinGame(page, code, settings, name) {
  await openGame(page, settings, GAME);
  await page.locator('#friends-toggle').click();
  await page.locator('#friends-code').fill(code);
  await expect(page.locator('#friends-code-shown')).toHaveText(code);
  await giveName(page, name);
}

/**
 * Everyone gets through the hand check and waits for each other, and then they all play. Each hand goes out of
 * the picture once its check is done, so nothing is wiped until a test says.
 */
async function allPlaying(...players) {
  for (const { page, hand = OPEN } of players) {
    await show(page, ...hand);
    await page.locator('#start').click();
    await expectSoon(() => page.evaluate(() => window.__game.screen), { timeout: 60_000 }).toMatch(/^(waiting|countdown|playing)$/);
    await show(page, null, null);
  }
  for (const { page } of players) await waitForScreen(page, 'playing');
}

test('friends keep one lighthouse: the same mud, each other\'s gloves, and each patch is whoever wiped it first, the same on every screen', async ({ page, browser }) => {
  test.setTimeout(480_000);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openGame(page, { ships: 4, reach: 'little', levels: { [GAME]: 3 } }, GAME);
  const code = await makeGame(page, 'Ana');
  expect(page.url()).toContain(`#light=${code}`);

  // The friend has their own number of ships and their own level, but plays the host's storm.
  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, { ships: 2, reach: 'little', levels: { [GAME]: 8 } }, 'Ben');
  await expect(page.locator('#friends-here')).toContainText('Ben');
  await expect(ben.page.locator('#friends-here')).toContainText('Ana');
  await shot(page, 'light-friends-joined');
  await allPlaying({ page }, { page: ben.page });

  // The host's four ships, in the plain storm: at level 3 there'd be a crab on their own, and here there's none.
  const [ana, his] = [await view(page), await view(ben.page)];
  expect([ana.mode, his.mode]).toEqual(['friends', 'friends']);
  expect(ana.ships).toEqual(['frost', 'kit', 'widget', 'bramble']);
  expect(his.ships).toEqual(ana.ships);
  for (const each of [ana, his]) expect([each.level.crabs, each.level.splats, each.level.shells, each.level.night]).toEqual([0, 0, 0, false]);
  expect(his.seed).toBe(ana.seed);
  // The same mud on both screens: nothing wiped yet, and laid out the same.
  expect(his.cells).toBe(ana.cells);
  const [look, hisLook] = [await mudLook(page), await mudLook(ben.page)];
  expect(look.reduce((most, value, index) => Math.max(most, Math.abs(value - hisLook[index])), 0)).toBeLessThanOrEqual(2);
  await expect(page.locator('#light-scores li')).toHaveCount(2);
  await expect(ben.page.locator('#light-scores li')).toHaveCount(2);
  await expect(page.locator('#light-scores')).toContainText('Ben0%');

  // Ben's real hand on his window, closed, so it wipes nothing: on Ana's screen his glove is there in grey, with
  // his name, where it is on his.
  await moveGloveTo(ben.page, GLOVE, 0.4, 0.3, { right: 'fist' });
  await expectSoon(async () => (await view(page)).friends[0]?.visible).toBe(true);
  await ben.page.waitForTimeout(1500);
  const [hisGlove, seen] = [(await view(ben.page)).glove, (await view(page)).friends[0]];
  expect(seen.name).toBe('Ben');
  expect(hisGlove).not.toBe(null);
  expect(Math.hypot(hisGlove.x - seen.x, hisGlove.y - seen.y)).toBeLessThan(0.08);
  expect((await view(ben.page)).tally[his.you]).toBe(0);
  expect((await view(page)).cells).toBe(ana.cells);
  await shot(page, 'light-friends-glove');

  // He opens it, and wipes across the top of the window, as a child would. Ana sees it go, and nothing flashes.
  await moveGloveTo(ben.page, GLOVE, 0.4, 0.3);
  const watching = watchBrightness(page, 180);
  for (const [x, y] of [[0.85, 0.3], [0.5, 0.3]]) {
    await moveGloveTo(ben.page, GLOVE, x, y);
    await ben.page.waitForTimeout(1400);
  }
  const brightness = judgeBrightness(await watching);
  await stopMoving(ben.page);
  await show(ben.page, null, null);
  console.log('a friend wiping', JSON.stringify(brightness));
  expect(brightness.biggestStep).toBeLessThan(4);
  expect(brightness.flickeringShare).toBeLessThan(0.02);
  await page.waitForTimeout(400);
  await settled(page, ben.page);
  const afterBen = await view(page);
  const bens = Object.entries(afterBen.owners[0] ?? {}).filter(([, by]) => by === his.you).map(([patch]) => Number(patch));
  expect(bens.length).toBeGreaterThan(8);
  expect(afterBen.tally[ana.you]).toBe(0);
  // His patches are clean in Ana's game, and gone from the mud on her screen.
  for (const patch of bens) expect(afterBen.cells[patch]).toBe('1');
  expect(await clearedOnScreen(page, bens)).toBe(bens.length);
  expect(afterBen.cells).toBe((await view(ben.page)).cells);
  await shot(page, 'light-friends-wiped');
  await ben.page.screenshot({ path: 'test-results/screens/light-friends-wiped-his.png' });

  // Both wipe the same part of the window at the same moment. Each game claims all it wiped at once, so whichever
  // claim gets to the server first has the lot, and each patch goes to one of them, the same on both screens.
  const area = { top: 0.85, bottom: 0.85, left: 0, right: 0.5 };
  await Promise.all([wipeRows(page, area), wipeRows(ben.page, area)]);
  await settled(page, ben.page);
  const [a1, b1] = [await view(page), await view(ben.page)];
  expect([a1.clean, b1.clean]).toEqual([false, false]);
  expect(Object.keys(a1.owners[0]).length).toBeGreaterThan(bens.length);
  expect(b1.owners).toEqual(a1.owners);
  expect(b1.tally).toEqual(a1.tally);
  expect(a1.tally).toEqual(counted(a1));
  expect(a1.tally[ana.you] + a1.tally[his.you]).toBe(Object.keys(a1.owners[0]).length);
  console.log('both at once', JSON.stringify({ ana: a1.tally[ana.you], ben: a1.tally[his.you] - bens.length }));
  // Only what's been had is clean, and what's clean has been had, on both.
  expect(a1.cells).toBe(b1.cells);
  expect([...a1.cells].filter((cell) => cell === '1').length).toBe(Object.keys(a1.owners[0]).length);
  // Each one's share of the glass is on both screens, the same.
  const shareOf = (patches) => Math.round((100 * patches) / (4 * 126));
  await expect(page.locator('#light-scores')).toContainText(`Ben${shareOf(a1.tally[his.you])}%`);
  await expect(ben.page.locator('#light-scores')).toContainText(`Ana${shareOf(a1.tally[ana.you])}%`);
  await expect(page.locator('#light-scores li.is-you')).toContainText(`You${shareOf(a1.tally[ana.you])}%`);

  // The rest of the windows, some by one and some by the other: each ship comes home on both screens together.
  await cleanWindow(page, 0, [page, ben.page]);
  await cleanWindow(ben.page, 1, [page, ben.page]);
  await cleanWindow(page, 2, [page, ben.page]);
  await cleanWindow(ben.page, 3, [page, ben.page]);
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  const [aEnd, bEnd] = [await view(page), await view(ben.page)];
  expect([aEnd.home, bEnd.home]).toEqual([4, 4]);
  expect(bEnd.tally).toEqual(aEnd.tally);
  expect(aEnd.tally).toEqual(counted(aEnd));
  expect(Object.keys(aEnd.owners).sort()).toEqual(['0', '1', '2', '3']);

  // The finish card on both: how much of the glass each one cleaned, the most first, and the same on both.
  const [anaShare, benShare] = [shareOf(aEnd.tally[ana.you]), shareOf(aEnd.tally[his.you])];
  for (const each of [page, ben.page]) await expect(each.locator('.friends-results li')).toHaveCount(2);
  await expect(page.locator('.friends-results li.is-you')).toContainText(`You ${anaShare}% cleaned`);
  await expect(page.locator('.friends-results li:not(.is-you)')).toContainText(`Ben ${benShare}% cleaned`);
  await expect(ben.page.locator('.friends-results li.is-you')).toContainText(`You ${benShare}% cleaned`);
  await expect(ben.page.locator('.friends-results li:not(.is-you)')).toContainText(`Ana ${anaShare}% cleaned`);
  await expect(page.locator('.friends-results li').nth(0)).toContainText(anaShare >= benShare ? 'You' : 'Ben');
  await expect(ben.page.locator('.friends-results li').nth(0)).toContainText(benShare >= anaShare ? 'You' : 'Ana');
  await expect(page.locator('#screen-finish h2')).toHaveText(anaShare >= benShare ? 'You cleaned the most!' : 'Great wiping!');
  await expect(ben.page.locator('#screen-finish h2')).toHaveText(benShare >= anaShare ? 'You cleaned the most!' : 'Great wiping!');
  if (anaShare === benShare) await expect(page.locator('.friends-results .friends-place')).toHaveText(['1st', '1st']);
  await expect(page.locator('#finish-hero')).toHaveText('4');
  await page.waitForTimeout(600);
  await shot(page, 'light-friends-finish');

  // Nobody's own level moves on, nobody's settings change, and the only connection was to the race server.
  expect(aEnd.ownLevel).toBe(3);
  expect(bEnd.ownLevel).toBe(8);
  expect(bEnd.settings).toEqual({ ships: 2, reach: 'little', hands: 'right' });
  const port = Number(new URL(test.info().project.use.baseURL).port) + 1;
  expect(sockets).toEqual([`ws://localhost:${port}/room/lighthouse/${code}?make=1`]);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('a game holds four: a fifth friend is told it already has four players', async ({ page, browser }) => {
  test.setTimeout(180_000);
  await openGame(page, {}, GAME);
  const code = await makeGame(page, 'Ana');
  const others = [];
  for (const name of ['Ben', 'Cara', 'Dan']) {
    const friend = await secondPlayer(browser);
    await joinGame(friend.page, code, {}, name);
    others.push(friend);
  }
  await expect(page.locator('#friends-here li')).toHaveCount(4);
  const eve = await secondPlayer(browser);
  await openGame(eve.page, {}, GAME);
  await eve.page.locator('#friends-toggle').click();
  await eve.page.locator('#friends-code').fill(code);
  await expect(eve.page.locator('#friends-status')).toHaveText('That game already has 4 players.');
  await expect(page.locator('#friends-here li')).toHaveCount(4);
  await shot(page, 'light-friends-four');
  for (const each of [...others, eve]) {
    expect(each.errors).toEqual([]);
    await each.context.close();
  }
});

test('a friend who goes takes their glove with them, then the host goes too, and the last one plays on to the end', async ({ page, browser }) => {
  test.setTimeout(480_000);
  await openGame(page, { ships: 2 }, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, { ships: 4 }, 'Ben');
  // Cara plays with her left hand, with the smallest window: her window is on the other side, and smaller.
  const cara = await secondPlayer(browser);
  await joinGame(cara.page, code, { hands: 'left', reach: 'lots' }, 'Cara');
  await expect(page.locator('#friends-here li')).toHaveCount(3);
  await allPlaying({ page }, { page: ben.page }, { page: cara.page, hand: LEFT_OPEN });
  const [ana, his, hers] = [await view(page), await view(ben.page), await view(cara.page)];
  expect([ana.ships.length, his.ships.length, hers.ships.length]).toEqual([2, 2, 2]);
  expect(hers.window.x).toBeLessThan(0.1);
  expect(hers.window.width).toBeLessThan(ana.window.width * 0.9);

  // Ana wipes the top of the window: on Cara's smaller window, on the other side, the same patches come off.
  await wipeRows(page, { top: 0, bottom: 0.2 });
  await settled(page, ben.page, cara.page);
  await expectSoon(async () => (await view(cara.page)).cells).toBe((await view(page)).cells);
  const anas = Object.keys((await view(page)).owners[0]).map(Number);
  expect(anas.length).toBeGreaterThan(10);
  expect(await clearedOnScreen(cara.page, anas)).toBe(anas.length);
  await cara.page.screenshot({ path: 'test-results/screens/light-friends-left-hand.png' });

  // Cara's left hand on her window: her glove is on the others' screens, on the same part of the glass.
  await show(cara.page, 'open', null, { scale: 0.7, leftOffsetX: 80 });
  await expectSoon(async () => (await view(page)).friends.find(({ name }) => name === 'Cara')?.visible, { timeout: 30_000 }).toBe(true);
  await page.waitForTimeout(1200);
  const herGlove = (await view(cara.page)).glove;
  const seenHers = (await view(page)).friends.find(({ name }) => name === 'Cara');
  expect(Math.hypot(herGlove.x - seenHers.x, herGlove.y - seenHers.y)).toBeLessThan(0.1);
  await shot(page, 'light-friends-three');

  // Cara goes. Her glove goes with her, and the others play on, with what she wiped still wiped and hers.
  const caraId = hers.you;
  await cara.context.close();
  await expectSoon(async () => (await view(page)).friends.map(({ name }) => name), { timeout: 30_000 }).toEqual(['Ben']);
  await expectSoon(async () => (await view(ben.page)).friends.map(({ name }) => name), { timeout: 30_000 }).toEqual(['Ana']);
  await expect(page.locator('#light-scores li')).toHaveCount(2);
  expect(await page.evaluate(() => window.__game.screen)).toBe('playing');
  expect((await view(page)).tally[caraId]).toBe((await view(ben.page)).tally[caraId]);

  // Then the host goes. Nobody's game runs the storm for the others, so Ben's carries on as it was.
  await show(page, ...OPEN);
  await expectSoon(async () => (await view(ben.page)).friends[0]?.visible, { timeout: 30_000 }).toBe(true);
  const before = await view(ben.page);
  await page.close();
  await expectSoon(async () => (await view(ben.page)).friends.length, { timeout: 30_000 }).toBe(0);
  await expect(ben.page.locator('#light-scores li')).toHaveCount(1);
  expect(await ben.page.evaluate(() => window.__game.screen)).toBe('playing');
  // The window as it was, with everything wiped still wiped.
  const alone = await view(ben.page);
  expect(alone.index).toBe(before.index);
  expect([...before.cells].every((cell, patch) => cell === '0' || alone.cells[patch] === '1')).toBe(true);

  // He wipes the rest himself, with his real hand for a while, and both ships come home.
  await moveGloveTo(ben.page, GLOVE, 0.4, 0.5);
  await ben.page.waitForTimeout(1500);
  await expectSoon(async () => (await view(ben.page)).tally[his.you] ?? 0).toBeGreaterThan(0);
  await stopMoving(ben.page);
  await show(ben.page, null, null);
  await cleanWindow(ben.page, 0, [ben.page]);
  await cleanWindow(ben.page, 1, [ben.page]);
  await waitForScreen(ben.page, 'finish');
  // On the finish card, only who was still there at the end.
  await expect(ben.page.locator('.friends-results li')).toHaveCount(1);
  await expect(ben.page.locator('.friends-results li')).toContainText('You');
  await expect(ben.page.locator('#screen-finish h2')).toHaveText('You cleaned the most!');
  await ben.page.waitForTimeout(600);
  await ben.page.screenshot({ path: 'test-results/screens/light-friends-alone-finish.png' });

  // On his own again: his own storm, his own ships and level, and nothing more sent.
  await ben.page.locator('#friends-leave').evaluate((button) => button.click());
  await show(ben.page, ...OPEN);
  await ben.page.locator('#play-again').click();
  await waitForScreen(ben.page, 'playing');
  const solo = await view(ben.page);
  expect(solo.mode).toBe('solo');
  expect(solo.ships).toHaveLength(4);
  await expect(ben.page.locator('#light-scores')).toBeHidden();
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('on their own, the storm is the level\'s as it always was, and nothing connects anywhere', async ({ page }) => {
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openGame(page, { levels: { [GAME]: 3 } }, GAME);
  await expect(page.locator('#friends-toggle')).toHaveText('Play with friends');
  await show(page, ...OPEN);
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
  const solo = await view(page);
  expect(solo.mode).toBe('solo');
  expect(solo.level.crabs).toBe(1);
  expect(solo.friends).toEqual([]);
  await expect(page.locator('#light-scores')).toBeHidden();
  await page.waitForTimeout(1500);
  expect((await view(page)).tally).toEqual({});
  expect(sockets).toEqual([]);
});
