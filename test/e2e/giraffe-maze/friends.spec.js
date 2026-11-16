// Racing friends in Giraffe's Maze: each on their own computer with their own camera, in the same mazes. Every game
// makes the host's mazes from the host's seed, everyone sees everyone else's character walking in the maze they're
// in, each has all the fruit in their own mazes, and whoever gets out of the last maze first comes first. Here
// they're separate browsers, talking through the race server on this computer (tools/race-server.mjs).
//
// These are the tests of the race, against each other, which a grown-up now has to choose: as the game comes,
// friends look for the way out together, and that's in together.spec.js.
import { expect, openGame as openAnyGame, shot, show, test, waitForScreen } from '../helpers.js';
import { allPlaying, expectSoon, FIST, GAME, joinGame, judge, leadHand, makeGame, OPEN, secondPlayer, state, stopHand, watchBrightness } from './helpers.js';

const openGame = (page, settings = {}, ...rest) => openAnyGame(page, { mazeFriends: 'against', ...settings }, ...rest);

/** How it is on one child's screen. */
const view = (page) => page.evaluate(() => {
  const { game, run } = window.__game;
  const friends = [...game.friendWalkers.values()].map((friend) => ({ name: friend.name, who: friend.spec.id, shown: Boolean(friend.shown), x: friend.at?.x ?? null, y: friend.at?.y ?? null, z: friend.at?.z ?? null }));
  return {
    mode: game.mode,
    race: run.race,
    seed: run.seed,
    size: run.size,
    level: run.level,
    mazes: run.mazes,
    index: run.index,
    phase: run.phase,
    out: run.stats.out,
    cells: [...run.layout.maze.cells].join(''),
    lost: run.layout.lost.length,
    items: run.layout.items.length,
    blockers: run.layout.blockers.length,
    itemsLeft: run.layout.items.filter((item) => !item.gone).length,
    you: game.friends.room.you,
    friends,
    standings: [...document.querySelectorAll('#maze-race li')].map((row) => ({ name: row.querySelector('.maze-race-name').textContent, out: Number(row.dataset.out), flag: Boolean(row.querySelector('.maze-race-flag')) })),
    wayOutLabel: window.__game.view.introduced.has('wayOut'),
    ownLevel: window.__game.session.levels.current,
    fruit: run.stats.fruit,
  };
});

const TIME = /^\d+:\d\d\.\d$/;

/** How many steps along the paths the character is from the way out, or -1 once it's on its way out. */
const stepsOut = (page) => page.evaluate(() => {
  const { run } = window.__game;
  if (run.phase !== 'walking') return -1;
  const { maze, goal } = run.layout;
  const steps = new Map([[goal, 0]]);
  for (const queue = [goal]; queue.length;) {
    const cell = queue.shift();
    for (let d = 0; d < 4; d += 1) {
      const next = maze.next(cell, d);
      if (maze.isOpen(cell, d) && !steps.has(next)) {
        steps.set(next, steps.get(cell) + 1);
        queue.push(next);
      }
    }
  }
  return steps.get(run.walker.a);
});

test('friends race out of the host\'s mazes: each sees the others, each has all their own fruit, and the first out of the last maze comes first', async ({ page, browser }) => {
  test.setTimeout(480_000);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openGame(page, { mazeReach: 'lots', mazes: 2, mazeSize: 'medium', levels: { [GAME]: 6 } }, GAME);
  const code = await makeGame(page, 'Ana');
  expect(page.url()).toContain(`#maze=${code}`);
  await expect(page.locator('.friends-how')).toContainText('the first one out of the last maze wins');

  // The friend has their own size, number of mazes and character, but races in the host's.
  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, { mazes: 5, mazeSize: 'hard', fighter: 'kit' }, 'Ben');
  await expect(page.locator('#friends-here')).toContainText('Ben');
  await allPlaying(page, ben.page);

  const [ana, his] = [await view(page), await view(ben.page)];
  expect([ana.mode, his.mode]).toEqual(['friends', 'friends']);
  expect([ana.race, his.race]).toEqual([true, true]);
  expect(his.seed).toBe(ana.seed);
  expect(his.cells).toBe(ana.cells);
  expect([ana.size, his.size]).toEqual(['medium', 'medium']);
  expect([ana.mazes, his.mazes]).toEqual([2, 2]);
  expect([ana.level, his.level]).toEqual([6, 6]);
  // Nobody is lost in a race, and it's the plain maze with its fruit.
  expect([ana.lost, his.lost]).toEqual([0, 0]);
  expect([ana.blockers, his.blockers]).toEqual([0, 0]);
  expect(his.items).toBe(ana.items);
  // Both are at the top, neither out of a maze yet, and the way out is named.
  expect(ana.standings.map(({ name, out }) => [name, out])).toEqual([['You', 0], ['Ben', 0]]);
  expect(his.standings.map(({ name, out }) => [name, out])).toEqual([['You', 0], ['Ana', 0]]);
  await expect(page.locator('#maze-race li').first().locator('.maze-race-dots i')).toHaveCount(2);
  await expectSoon(async () => (await view(page)).wayOutLabel, { timeout: 10_000 }).toBe(true);
  expect((await view(ben.page)).wayOutLabel).toBe(true);

  // Both lead the way. Each sees the other walking, with their name over them.
  await leadHand(page);
  await leadHand(ben.page);
  await expectSoon(async () => (await view(page)).friends[0]?.shown, { timeout: 30_000 }).toBe(true);
  await expectSoon(async () => (await view(ben.page)).friends[0]?.shown, { timeout: 30_000 }).toBe(true);
  expect((await view(page)).friends[0]).toMatchObject({ name: 'Ben', who: 'kit' });
  expect((await view(ben.page)).friends[0]).toMatchObject({ name: 'Ana', who: 'giraffe' });
  // Where Ben's character is on Ana's screen is where it is on his, a moment ago.
  await page.waitForTimeout(1500);
  const [there, here] = await Promise.all([state(ben.page), view(page)]);
  expect(Math.hypot(there.at.x - here.friends[0].x, there.at.y - here.friends[0].y)).toBeLessThan(1.2);
  await shot(page, 'maze-friends-host');
  await ben.page.screenshot({ path: 'test-results/screens/maze-friends-guest.png' });

  // Ben rests, with a closed hand, and Ana races on. Out of the first maze, she's a dot on, on Ben's screen too.
  await stopHand(ben.page);
  await show(ben.page, ...FIST);
  // Nothing flashes on her screen as she gets near the way out, walks out of it and the next maze comes in.
  await expectSoon(() => stepsOut(page), { timeout: 120_000 }).toBeLessThanOrEqual(3);
  const gettingOut = judge(await watchBrightness(page, 300));
  console.log('getting out of a maze in a race', JSON.stringify(gettingOut));
  expect(gettingOut.flickeringShare).toBeLessThan(0.01);
  expect(gettingOut.biggestStep).toBeLessThan(6);
  await expectSoon(async () => (await view(page)).out, { timeout: 120_000 }).toBe(1);
  await expectSoon(async () => (await view(ben.page)).standings[0], { timeout: 10_000 }).toEqual({ name: 'Ana', out: 1, flag: false });
  // Ana is in the second maze and Ben still in the first, so he doesn't see her any more.
  await expectSoon(async () => (await view(page)).index, { timeout: 10_000 }).toBe(1);
  await expectSoon(async () => (await view(ben.page)).friends[0].shown, { timeout: 5000 }).toBe(false);
  expect((await view(ben.page)).index).toBe(0);

  // Out of the last maze, Ana has finished first, while Ben is still in the race.
  await waitForScreen(page, 'finish');
  await stopHand(page);
  await expect(page.locator('#screen-finish h2')).toHaveText('You were first out!');
  await expect(page.locator('.friends-results li')).toHaveCount(2);
  await expect(page.locator('.friends-results li').nth(0)).toContainText('1st');
  await expect(page.locator('.friends-results li').nth(0)).toContainText('You');
  await expect(page.locator('.friends-results li').nth(0).locator('.friends-time')).toHaveText(TIME);
  await expect(page.locator('.friends-results li').nth(1)).toContainText('Ben');
  await expect(page.locator('.friends-results li').nth(1)).toContainText('still playing');
  // The card has the fruit and the times, and nothing about friends found or prizes.
  await expect(page.locator('#sum-left-found').locator('xpath=..')).toBeHidden();
  await expect(page.locator('#sum-left-prizes').locator('xpath=..')).toBeHidden();
  await expectSoon(async () => (await view(ben.page)).standings[0], { timeout: 10_000 }).toEqual({ name: 'Ana', out: 2, flag: true });
  await ben.page.screenshot({ path: 'test-results/screens/maze-friends-guest-behind.png' });
  // Ana ate fruit all the way, and Ben's maze still has all of its own, but for what he ate himself at the start.
  expect((await view(page)).out).toBe(2);
  expect((await view(page)).fruit).toBeGreaterThan(2);
  const behind = await view(ben.page);
  expect(behind.itemsLeft + behind.fruit).toBe(behind.items);
  expect(behind.itemsLeft).toBeGreaterThan(behind.items / 2);

  // Now Ben goes, all the way out, and comes second.
  await show(ben.page, ...OPEN);
  await leadHand(ben.page);
  await waitForScreen(ben.page, 'finish');
  await stopHand(ben.page);
  await expect(ben.page.locator('#screen-finish h2')).toHaveText('You made it out!');
  await expect(ben.page.locator('.friends-results li').nth(0)).toContainText('Ana');
  await expect(ben.page.locator('.friends-results li').nth(1)).toContainText('2nd');
  await expect(ben.page.locator('.friends-results li').nth(1)).toContainText('You');
  await expect(ben.page.locator('.friends-results li').nth(1).locator('.friends-time')).toHaveText(TIME);
  // And Ana's card has his time too, after hers.
  await expect(page.locator('.friends-results li').nth(1)).toContainText('2nd');
  await expect(page.locator('.friends-results li').nth(1).locator('.friends-time')).toHaveText(TIME);
  const [anaTime, benTime] = [await page.locator('.friends-results li').nth(0).locator('.friends-time').textContent(), await page.locator('.friends-results li').nth(1).locator('.friends-time').textContent()];
  const seconds = (text) => Number(text.split(':')[0]) * 60 + Number(text.split(':')[1]);
  expect(seconds(benTime)).toBeGreaterThan(seconds(anaTime));
  await page.waitForTimeout(600);
  await shot(page, 'maze-friends-finish');

  // Both got to the end of the same mazes, each with fruit of their own.
  const [aEnd, bEnd] = [await view(page), await view(ben.page)];
  expect([aEnd.index, bEnd.index, aEnd.out, bEnd.out]).toEqual([1, 1, 2, 2]);
  expect(bEnd.fruit).toBeGreaterThan(2);

  // Nobody's own level moves on, nobody's settings change, and the only connection was to the race server.
  expect(aEnd.ownLevel).toBe(6);
  expect(bEnd.ownLevel).toBe(1);
  expect(await ben.page.evaluate(() => window.__game.session.settings.mazes)).toBe(5);
  expect(await ben.page.evaluate(() => window.__game.session.settings.mazeSize)).toBe('hard');
  const port = Number(new URL(test.info().project.use.baseURL).port) + 1;
  expect(sockets).toEqual([`ws://localhost:${port}/room/giraffe-maze/${code}?make=1`]);
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
  await shot(page, 'maze-friends-four');
  for (const each of [...others, eve]) {
    expect(each.errors).toEqual([]);
    await each.context.close();
  }
});

test('a friend who goes in the middle takes their character with them, and the other plays on to the end', async ({ page, browser }) => {
  test.setTimeout(360_000);
  await openGame(page, { mazeReach: 'lots', mazes: 2 }, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, {}, 'Ben');
  await allPlaying(page, ben.page);
  await leadHand(ben.page);
  await expectSoon(async () => (await view(page)).friends[0]?.shown, { timeout: 30_000 }).toBe(true);
  await ben.context.close();
  await expectSoon(async () => (await view(page)).friends.length, { timeout: 30_000 }).toBe(0);
  // Nobody runs the maze but the rules, so it carries on without the host or anyone else.
  await leadHand(page);
  await waitForScreen(page, 'finish');
  await stopHand(page);
  const end = await view(page);
  expect(end.out).toBe(2);
  await expect(page.locator('.friends-results')).toBeVisible();
  await expect(page.locator('.friends-results li')).toHaveCount(1);
  await expect(page.locator('#screen-finish h2')).toHaveText('You were first out!');
  // On their own again: their own maze, and nothing more sent.
  await page.locator('#friends-leave').evaluate((button) => button.click());
  await page.evaluate(() => window.__camera.show({ left: null, right: 'open', scale: 0.62 }));
  await page.locator('#play-again').click();
  await waitForScreen(page, 'playing');
  expect((await view(page)).mode).toBe('solo');
});
