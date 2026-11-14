// Racing friends: two children, each on their own computer with their own camera, race each other. Here
// they're two separate browsers, talking through the race server on this computer (tools/race-server.mjs),
// which has the same rules as the one on Cloudflare.
import { expect, openGame, screenName, show, test, waitForScreen } from './helpers.js';
import { CODE_LETTERS } from '../../../server/race-room.js';

const raceOf = (page) => page.evaluate(() => {
  const { race, session } = window.__game;
  return {
    distance: race.distance,
    level: race.level,
    laps: race.laps,
    friends: race.friends?.map((friend) => ({ name: friend.spec.name, distance: friend.distance })) ?? null,
    rivals: race.rivals.length,
    ownLevel: session.levels.current,
  };
});

/** A second player, in a browser of their own, with the same checks for errors as the first. */
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

/** Another player, opening the link to a race on their own computer, with their own settings. */
async function joiner(browser, code, settings = {}) {
  const player = await secondPlayer(browser);
  await openGame(player.page, settings, 'high-five-racers', `#race=${code}`);
  await expect(player.page.locator('#friends-code-shown')).toHaveText(code);
  return player;
}

/** Shows an open hand and presses Let's race!, as each child does on their own computer. */
async function getReady(page) {
  await show(page, null, 'open');
  await page.locator('#start').click();
}

/** Puts the car this far before the line, so that it gets there in a moment. */
const nearlyThere = (page, metres) => page.evaluate((left) => {
  const { race } = window.__game;
  race.distance = race.raceDistance - left;
}, metres);

/** The race room, as this player's game sees it. */
const roomOf = (page) => page.evaluate(() => {
  const { room } = window.__game.game.friends;
  return { you: room.you, hosting: room.hosting, status: room.status, members: room.members.map(({ name, ready, racing, host }) => ({ name, ready, racing, host })) };
});

/** A grown-up makes a race, and gets its code. */
async function makeRace(page, name) {
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

test('two friends race each other from their own computers, on the host\'s course, and see each other go', async ({ page, browser }) => {
  test.setTimeout(240_000);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openGame(page, { laps: 1, fighter: 'kit', levels: { 'high-five-racers': 3 } });
  const code = await makeRace(page, 'Dato');
  expect(page.url()).toContain(`#race=${code}`);
  await expect(page.locator('#friends-here li')).toHaveCount(1);

  // The friend opens the link on their own computer, at a level of their own.
  const friend = await secondPlayer(browser);
  await openGame(friend.page, { laps: 4, fighter: 'giraffe' }, 'high-five-racers', `#race=${code}`);
  await expect(friend.page.locator('#friends-code-shown')).toHaveText(code);
  for (const each of [page, friend.page]) {
    await expect(each.locator('#friends-here li')).toHaveCount(2);
    await expect(each.locator('#friends-here')).toContainText('Dato');
    await expect(each.locator('#friends-here')).toContainText('Giraffe');
  }
  await expect(page.locator('#friends-here')).toContainText('Dato (you)');

  // The host is ready first, and waits for the friend.
  await show(page, null, 'open');
  await show(friend.page, null, 'open');
  await page.locator('#start').click();
  await waitForScreen(page, 'waiting');
  await expect(page.locator('#friends-waiting')).toContainText('Ready');
  await expect(page.locator('#friends-now')).toBeVisible();
  await page.screenshot({ path: 'test-results/screens/racers-friends-waiting.png' });
  await friend.page.locator('#start').click();
  await expect(friend.page.locator('#friends-now')).toBeHidden();

  // Once both are ready, both count down together, on the host's course: level 3, one lap.
  await waitForScreen(page, 'playing');
  await waitForScreen(friend.page, 'playing');
  const host = await raceOf(page);
  const guest = await raceOf(friend.page);
  expect([host.level, host.laps, guest.level, guest.laps]).toEqual([3, 1, 3, 1]);
  expect(host.friends.map(({ name }) => name)).toEqual(['Giraffe']);
  expect(guest.friends.map(({ name }) => name)).toEqual(['Dato']);

  // Each sees the other's car where it really is, a moment ago.
  await expect.poll(async () => (await raceOf(friend.page)).distance, { timeout: 30_000 }).toBeGreaterThan(60);
  const [seen, own] = await Promise.all([raceOf(page), raceOf(friend.page)]);
  expect(seen.friends[0].distance).toBeGreaterThan(40);
  expect(Math.abs(seen.friends[0].distance - own.distance)).toBeLessThan(15);
  await page.screenshot({ path: 'test-results/screens/racers-friends-racing.png' });

  // The host crosses the line first, and the friend after.
  await page.evaluate(() => {
    const { race } = window.__game;
    race.distance = race.raceDistance - 8;
  });
  await friend.page.evaluate(() => {
    const { race } = window.__game;
    race.distance = race.raceDistance - 70;
  });
  await waitForScreen(page, 'finish');
  await expect(page.locator('#screen-finish h2')).toHaveText('You won the race!');
  await expect(page.locator('.friends-results li')).toHaveCount(2);
  await expect(page.locator('.friends-results li').nth(1)).toContainText('still racing');
  await waitForScreen(friend.page, 'finish');
  await expect(friend.page.locator('#screen-finish h2')).toHaveText('Great racing!');
  await expect(friend.page.locator('.friends-results li').nth(0)).toContainText('1st Dato');
  await expect(friend.page.locator('.friends-results li').nth(1)).toContainText('2nd You');
  // The host's card fills in as the friend gets there.
  await expect(page.locator('.friends-results li').nth(1)).toContainText('2nd Giraffe');
  await page.screenshot({ path: 'test-results/screens/racers-friends-finish.png' });

  // Racing friends doesn't move anyone's own level on.
  expect((await raceOf(page)).ownLevel).toBe(3);
  expect((await raceOf(friend.page)).ownLevel).toBe(1);
  // The only connection off the page was to the race server.
  expect(sockets).toEqual([`ws://localhost:${Number(new URL(test.info().project.use.baseURL).port) + 1}/room/${code}?make=1`]);

  // Racing again waits for both again.
  await page.locator('#play-again').click();
  await waitForScreen(page, 'waiting');
  await friend.page.locator('#play-again').click();
  await waitForScreen(page, 'countdown');
  await waitForScreen(friend.page, 'countdown');

  expect(friend.errors).toEqual([]);
  await friend.context.close();
  // The friend has gone, mid-race, and their car with them.
  await expect.poll(async () => (await raceOf(page)).friends?.length, { timeout: 15_000 }).toBe(0);
});

test('a race with nobody else in it can still be raced alone, against the usual cars', async ({ page }) => {
  test.setTimeout(120_000);
  await openGame(page);
  await makeRace(page, '');
  await show(page, null, 'open');
  await page.locator('#start').click();
  await waitForScreen(page, 'waiting');
  await expect(page.locator('#friends-wait-status')).toContainText('Nobody else is here yet');
  await page.locator('#friends-alone').click();
  await waitForScreen(page, 'playing');
  const race = await raceOf(page);
  expect(race.friends).toBe(null);
  expect(race.rivals).toBeGreaterThanOrEqual(3);
  expect(await page.evaluate(() => location.hash)).toBe('');
});

test('making or joining a race, the title card shows only that, with Let\'s race! under who\'s here', async ({ page, browser }) => {
  test.setTimeout(120_000);
  await openGame(page);
  const usual = ['#tagline', '.title-card > .all-games', '#friends-toggle'];
  const start = page.locator('#start');
  const showing = async (each) => Promise.all(usual.map((selector) => each.locator(selector).isVisible()));

  // Opened, only the box: the game's name, what it's for, a name, and making or joining.
  await page.locator('#friends-toggle').click();
  expect(await showing(page)).toEqual([false, false, false]);
  await expect(start).toBeHidden();
  await expect(page.locator('.friends-title')).toHaveText('Race a friend');
  await expect(page.locator('#screen-welcome h1')).toBeVisible();
  await expect(page.locator('#friends-code')).toBeFocused();
  expect(await page.locator('#screen-welcome').evaluate((node) => getComputedStyle(node).backdropFilter)).toBe('blur(6px)');
  await page.screenshot({ path: 'test-results/screens/race-friends-box.png' });

  // Back is the usual title card again.
  await page.locator('#friends-back').click();
  expect(await showing(page)).toEqual([true, true, true]);
  await expect(start).toBeVisible();
  await expect(page.locator('#friends-box')).toBeHidden();
  await expect(page.locator('#friends-toggle')).toBeFocused();

  // In a race, Let's race! is in the box, under who's here, with a word while nobody else has come.
  const code = await makeRace(page, 'Ana');
  await expect(page.locator('#friends-start #start')).toBeVisible();
  await expect(page.locator('#friends-lonely')).toBeVisible();
  expect(await showing(page)).toEqual([false, false, false]);

  // A friend who opens the link sees only the race too.
  const ben = await secondPlayer(browser);
  await openGame(ben.page, {}, 'high-five-racers', `#race=${code}`);
  await expect(ben.page.locator('#friends-start #start')).toBeVisible();
  expect(await showing(ben.page)).toEqual([false, false, false]);
  await expect(page.locator('#friends-lonely')).toBeHidden();
  await expect(ben.page.locator('#friends-lonely')).toBeHidden();
  await page.screenshot({ path: 'test-results/screens/race-friends-in.png' });

  // Leaving is making or joining again, and Back the usual title card, with Let's race! where it was.
  await page.locator('#friends-leave').click();
  await expect(page.locator('#friends-out')).toBeVisible();
  await expect(start).toBeHidden();
  await page.locator('#friends-back').click();
  expect(await showing(page)).toEqual([true, true, true]);
  await expect(page.locator('#screen-welcome .title-card > #start')).toBeVisible();
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('typing a friend\'s code joins at once, and a new race never lands in someone else\'s', async ({ page, browser }) => {
  test.setTimeout(120_000);
  await openGame(page);
  const code = await makeRace(page, 'Ana');

  // Ben types the code, in small letters, and he's in, with nothing to press.
  const ben = await secondPlayer(browser);
  await openGame(ben.page);
  await ben.page.locator('#friends-toggle').click();
  await ben.page.locator('#friends-code').pressSequentially(code.toLowerCase(), { delay: 80 });
  await expect(ben.page.locator('#friends-code-shown')).toHaveText(code);
  await expect(page.locator('#friends-here li')).toHaveCount(2);
  await ben.page.screenshot({ path: 'test-results/screens/race-friends-typed.png' });

  // Cat makes a race, and the first code her game picks happens to be Ana's. It's in use, so she gets another,
  // on her own, and Ana's race still has just Ana and Ben.
  const cat = await secondPlayer(browser);
  await openGame(cat.page);
  await cat.page.locator('#friends-toggle').click();
  await cat.page.evaluate(([taken, letters]) => {
    const real = crypto.getRandomValues.bind(crypto);
    const queue = [...taken].map((letter) => letters.indexOf(letter));
    crypto.getRandomValues = (array) => {
      if (queue.length && array.length === 1) {
        array[0] = queue.shift();
        return array;
      }
      return real(array);
    };
  }, [code, CODE_LETTERS]);
  await cat.page.locator('#friends-make').click();
  await expect(cat.page.locator('#friends-code-shown')).toHaveText(/^[A-HJ-NP-Z2-9]{3}$/);
  await expect(cat.page.locator('#friends-code-shown')).not.toHaveText(code);
  await expect(cat.page.locator('#friends-here li')).toHaveCount(1);
  const hers = await cat.page.locator('#friends-code-shown').textContent();
  expect(cat.page.url()).toContain(`#race=${hers}`);
  await expect(page.locator('#friends-here li')).toHaveCount(2);
  for (const each of [ben, cat]) {
    expect(each.errors).toEqual([]);
    await each.context.close();
  }
});

test('a wrong code is caught before anything is sent, and the race server can be left', async ({ page }) => {
  await openGame(page);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await page.locator('#friends-toggle').click();
  // Typed in full, a code that can't be one is caught; nothing more is needed to join.
  await page.locator('#friends-code').fill('hl0');
  await expect(page.locator('#friends-status')).toHaveText('A race code is 3 letters and numbers.');
  expect(sockets).toEqual([]);
  // A code nobody has made a race with is told so, rather than waiting on its own.
  await page.locator('#friends-code').fill('zzz');
  await expect(page.locator('#friends-status')).toHaveText('There’s no game with that code just now. Check it with your friend.');
  await expect(page.locator('#friends-out')).toBeVisible();
  await page.locator('#friends-make').click();
  await expect(page.locator('#friends-code-shown')).toHaveText(/^[A-HJ-NP-Z2-9]{3}$/);
  await page.locator('#friends-leave').click();
  await expect(page.locator('#friends-out')).toBeVisible();
  expect(await screenName(page)).toBe('welcome');
});

/** The connection can't be made for this long, as when the wifi has dropped. */
const offlineFor = (page, ms) => page.evaluate((forMs) => {
  const Real = window.WebSocket;
  const until = Date.now() + forMs;
  window.WebSocket = class extends Real {
    constructor(...args) {
      if (Date.now() < until) throw new Error('offline');
      super(...args);
    }
  };
}, ms);

test('the connection dropping on the finish card, just as Race again is pressed, still races together again', async ({ page, browser }) => {
  test.setTimeout(240_000);
  await openGame(page, { laps: 1 });
  const code = await makeRace(page, 'Ana');
  const ben = await joiner(browser, code);
  await getReady(page);
  await getReady(ben.page);
  await waitForScreen(page, 'playing');
  await waitForScreen(ben.page, 'playing');
  for (const each of [page, ben.page]) await nearlyThere(each, 4);
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  const was = (await roomOf(ben.page)).you;

  // Ben's wifi drops for a few seconds, just as he presses Race again. His game waits for it to come back,
  // still with his friend, rather than racing on its own, and says so.
  await offlineFor(ben.page, 3000);
  await ben.page.evaluate(() => window.__game.game.friends.room.socket.close());
  await ben.page.locator('#play-again').click();
  await waitForScreen(ben.page, 'waiting');
  await expect(ben.page.locator('#friends-wait-status')).toHaveText('Reconnecting…');
  await expect.poll(async () => (await roomOf(ben.page)).status, { timeout: 20_000 }).toBe('in');
  expect((await roomOf(ben.page)).you).toBe(was);

  // Back, and ready: as soon as Ana presses Race again too, they race each other.
  await page.locator('#play-again').click();
  await waitForScreen(page, 'playing');
  await waitForScreen(ben.page, 'playing');
  expect((await raceOf(ben.page)).friends.map(({ name }) => name)).toEqual(['Ana']);
  expect((await raceOf(page)).friends).toHaveLength(1);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('the host can start without a friend who isn\'t ready, who then races the next one, three together', async ({ page, browser }) => {
  test.setTimeout(360_000);
  await openGame(page, { laps: 1 });
  const code = await makeRace(page, 'Ana');
  const ben = await joiner(browser, code, { fighter: 'kit' });
  const cat = await joiner(browser, code, { fighter: 'mochi' });
  await expect(page.locator('#friends-here li')).toHaveCount(3);

  await getReady(page);
  await getReady(ben.page);
  await waitForScreen(page, 'waiting');
  await waitForScreen(ben.page, 'waiting');
  await expect(page.locator('#friends-waiting')).toContainText('Not ready yet');
  await page.locator('#friends-now').click();
  await waitForScreen(page, 'playing');
  await waitForScreen(ben.page, 'playing');
  expect((await raceOf(page)).friends.map(({ name }) => name)).toEqual(['Kit']);
  expect(await screenName(cat.page)).toBe('welcome');

  // Cat gets ready while they race, and waits on the grid, seeing them racing.
  await getReady(cat.page);
  await waitForScreen(cat.page, 'waiting');
  await expect(cat.page.locator('#friends-waiting')).toContainText('Racing');
  await expect(cat.page.locator('#friends-now')).toBeHidden();
  await nearlyThere(page, 8);
  await nearlyThere(ben.page, 40);
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  await expect(page.locator('.friends-results li')).toHaveCount(2);
  expect(await screenName(cat.page)).toBe('waiting');

  // They both race again, and now all three are on the grid, so off they go.
  await page.locator('#play-again').click();
  await ben.page.locator('#play-again').click();
  for (const each of [page, ben.page, cat.page]) await waitForScreen(each, 'playing');
  for (const each of [page, ben.page, cat.page]) expect((await raceOf(each)).friends).toHaveLength(2);
  expect((await raceOf(cat.page)).friends.map(({ name }) => name)).toEqual(['Ana', 'Kit']);
  await expect(page.locator('#race-order li')).toHaveCount(3);
  await page.screenshot({ path: 'test-results/screens/racers-friends-three.png' });

  for (const each of [ben, cat]) {
    expect(each.errors).toEqual([]);
    await each.context.close();
  }
});

test('a friend who loses the connection for a moment carries on in the same car, and their finish counts', async ({ page, browser }) => {
  test.setTimeout(240_000);
  await openGame(page, { laps: 1 });
  const code = await makeRace(page, 'Ana');
  const ben = await joiner(browser, code);
  await getReady(page);
  await getReady(ben.page);
  await waitForScreen(page, 'playing');
  await waitForScreen(ben.page, 'playing');
  const { you } = await roomOf(ben.page);

  await ben.page.evaluate(() => window.__game.game.friends.room.socket.close());
  // Longer than a friend who has really gone is waited for.
  await page.waitForTimeout(6000);
  expect(await roomOf(ben.page)).toMatchObject({ you, status: 'in' });
  const first = (await raceOf(page)).friends;
  expect(first).toHaveLength(1);
  await page.waitForTimeout(1000);
  const [seen, own] = await Promise.all([raceOf(page), raceOf(ben.page)]);
  expect(seen.friends[0].distance).toBeGreaterThan(first[0].distance + 10);
  expect(Math.abs(seen.friends[0].distance - own.distance)).toBeLessThan(15);

  await nearlyThere(ben.page, 8);
  await waitForScreen(ben.page, 'finish');
  await nearlyThere(page, 40);
  await waitForScreen(page, 'finish');
  await expect(page.locator('.friends-results li').nth(0)).toContainText('1st Giraffe');
  await expect(page.locator('.friends-results li').nth(1)).toContainText('2nd You');
  await expect(page.locator('#screen-finish h2')).toHaveText('Great racing!');
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('a connection that goes quiet without closing, as when the wifi drops, comes back by itself, in the same car and still hosting', async ({ page, browser }) => {
  test.setTimeout(240_000);
  await openGame(page, { laps: 1 });
  const code = await makeRace(page, 'Ana');
  const ben = await joiner(browser, code);
  await getReady(page);
  await getReady(ben.page);
  await waitForScreen(page, 'playing');
  await waitForScreen(ben.page, 'playing');
  const { you } = await roomOf(page);

  // Nothing more gets through to the host on her connection, though it's still open: only on a new one.
  await page.evaluate(() => {
    const { room } = window.__game.game.friends;
    const hear = room.hear.bind(room);
    const old = room.socket;
    room.hear = (text) => {
      if (room.socket !== old) hear(text);
    };
  });
  await page.waitForTimeout(10_000);
  expect(await roomOf(page)).toMatchObject({ you, status: 'in', hosting: true });
  // Ben typed no name, so his game shows his driver's.
  expect((await roomOf(ben.page)).members.map(({ name, host }) => [name, host])).toEqual([['Ana', true], ['', false]]);
  // Ben never lost Ana's car, and it's where she really is.
  const [seen, own] = await Promise.all([raceOf(ben.page), raceOf(page)]);
  expect(seen.friends).toHaveLength(1);
  expect(Math.abs(seen.friends[0].distance - own.distance)).toBeLessThan(15);
  // And Ana sees Ben's car again.
  const [hers, his] = await Promise.all([raceOf(page), raceOf(ben.page)]);
  expect(Math.abs(hers.friends[0].distance - his.distance)).toBeLessThan(15);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('a friend who leaves in the middle of a race takes their car away, and isn\'t waited for at the finish', async ({ page, browser }) => {
  test.setTimeout(240_000);
  await openGame(page, { laps: 1 });
  const code = await makeRace(page, 'Ana');
  const ben = await joiner(browser, code);
  await getReady(page);
  await getReady(ben.page);
  await waitForScreen(page, 'playing');
  await waitForScreen(ben.page, 'playing');
  await expect(page.locator('#race-order li')).toHaveCount(2);
  expect(ben.errors).toEqual([]);
  await ben.context.close();

  // Not at once, in case they're only losing the connection for a moment, but soon.
  await page.waitForTimeout(1500);
  expect((await raceOf(page)).friends).toHaveLength(1);
  await expect.poll(async () => (await raceOf(page)).friends.length, { timeout: 15_000 }).toBe(0);
  await expect(page.locator('#race-order li')).toHaveCount(1);
  await nearlyThere(page, 8);
  await waitForScreen(page, 'finish');
  await expect(page.locator('.friends-results li')).toHaveCount(1);
  await expect(page.locator('#screen-finish h2')).toHaveText('You won the race!');
});

test('a race holds four, can be joined by its code or the copied link, comes back after a reload, and passes on its host', async ({ page, browser }) => {
  test.setTimeout(240_000);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await openGame(page);
  const code = await makeRace(page, 'Ana');
  await page.locator('#friends-copy').click();
  await expect(page.locator('#friends-status')).toHaveText('Link copied. Send it to a friend.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${test.info().project.use.baseURL}/games/high-five-racers/index.html#race=${code}`);

  // One types the code, in small letters.
  const ben = await secondPlayer(browser);
  await openGame(ben.page);
  await ben.page.locator('#friends-toggle').click();
  await ben.page.locator('#friends-code').fill(code.toLowerCase());
  await expect(ben.page.locator('#friends-in')).toBeVisible();
  await ben.page.locator('#friends-name').fill('Ben');
  await ben.page.locator('#friends-name').dispatchEvent('change');
  await expect(ben.page.locator('#friends-here li')).toHaveCount(2);
  const cat = await joiner(browser, code);
  const dan = await joiner(browser, code);
  await expect(page.locator('#friends-here li')).toHaveCount(4);

  // A fifth is told the race is full.
  const eve = await secondPlayer(browser);
  await openGame(eve.page, {}, 'high-five-racers', `#race=${code}`);
  await expect(eve.page.locator('#friends-status')).toHaveText('That race already has 4 cars.');
  await expect(eve.page.locator('#friends-out')).toBeVisible();

  // Reloading the page goes back into the same race as the same player, with the name and place kept.
  const ben1 = (await roomOf(ben.page)).you;
  await ben.page.reload();
  await expect(ben.page.locator('#friends-code-shown')).toHaveText(code);
  await expect(ben.page.locator('#friends-here li')).toHaveCount(4);
  await expect(page.locator('#friends-here')).toContainText('Ben');
  expect((await roomOf(ben.page)).you).toBe(ben1);

  // The host goes, and whoever has been there longest hosts instead: Ben, who kept his place through the reload.
  await page.locator('#friends-leave').click();
  await expect.poll(async () => (await roomOf(ben.page)).hosting, { timeout: 10_000 }).toBe(true);
  expect((await roomOf(cat.page)).members.map(({ host }) => host)).toEqual([true, false, false]);
  for (const each of [ben, cat, dan, eve]) {
    expect(each.errors).toEqual([]);
    await each.context.close();
  }
});
