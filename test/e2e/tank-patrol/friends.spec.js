// Playing Tank Patrol with a friend: two children, each on their own computer with their own camera, and each
// one of the two tanks. Against each other there are no robot tanks. Together, both stop the robot tanks, which
// the game of whoever made the patrol runs for both. Either way each game drives its own tank, the friend's is
// where their game says, and a hit is decided by the game of the tank that fired it, which tells the other. Here
// they're two separate browsers, talking through the race server on this computer (tools/race-server.mjs).
import { expect, shot, show, test, waitForScreen } from '../helpers.js';
import { biggestStep, brightnessThrough, handGone, openPatrol, pointAt, startPatrol, stopPointing } from './helpers.js';

const OPEN = [null, 'open', { scale: 0.7 }];

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

/** Both get through the hand check and wait for each other, and then both play. */
async function bothPlaying(page, other) {
  for (const each of [page, other]) {
    await show(each, ...OPEN);
    await each.locator('#start').click();
  }
  await waitForScreen(page, 'playing');
  await waitForScreen(other, 'playing');
}

/** How the battle is on one child's screen. */
const battleOf = (page) => page.evaluate(() => {
  const { game, patrol, field, session } = window.__game;
  const { tank, friend } = patrol;
  return {
    battle: Boolean(game.battle),
    seconds: game.battle?.seconds ?? null,
    drive: patrol.pace.drive,
    help: patrol.help.radius,
    robots: patrol.enemies.length + patrol.queue.length,
    slot: patrol.slot ?? null,
    mine: patrol.score?.mine ?? null,
    theirs: patrol.score?.theirs ?? null,
    shots: patrol.stats.shots,
    resting: patrol.resting,
    tank: { x: tank.x, z: tank.z, heading: tank.heading, turret: tank.turret },
    friend: friend ? { x: friend.x, z: friend.z, heading: friend.heading, turret: friend.turret, resting: friend.resting } : null,
    friendShown: Boolean(field.friendTank?.visible),
    friendName: field.friendName,
    ownLevel: session.levels.current,
  };
});

const inRange = (page) => page.evaluate(() => {
  const { patrol } = window.__game;
  return patrol.inRange(patrol.friend);
});

const turnOff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const titleFor = (mine, theirs) => (mine > theirs ? 'You won!' : mine === theirs ? 'You both won!' : 'Great game!');

test('two friends battle from their own computers: each tank where it really is on both screens, and each hit counting for whoever made it on both', async ({ page, browser }) => {
  test.setTimeout(420_000);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openPatrol(page, { tanks: 6, pace: 'fast', tankFriends: 'against', levels: { 'tank-patrol': 4 } });
  const code = await makeGame(page, 'Ana');
  expect(page.url()).toContain(`#tanks=${code}`);
  await expect(page.locator('input[name="friends-team"][value="against"]')).toBeChecked();

  // The friend has their own number of tanks, speed and reach help, and would play together, but plays the host's battle.
  const ben = await secondPlayer(browser);
  await openPatrol(ben.page, { tanks: 15, pace: 'slow', reach: 'lots' }, `#tanks=${code}`);
  await expect(ben.page.locator('input[name="friends-team"][value="against"]')).toBeChecked();
  await expect(ben.page.locator('#friends-teams-whose')).toHaveText('Ana chose.');
  await ben.page.locator('#friends-name').fill('Ben');
  await ben.page.locator('#friends-name').dispatchEvent('change');
  await expect(page.locator('#friends-here')).toContainText('Ben');
  await expect(ben.page.locator('#friends-here')).toContainText('Ana');
  await bothPlaying(page, ben.page);

  // Ana's battle for both: 2 minutes, from her 6 tanks, at her speed, with no robot tanks, and each their own reach help.
  const [ana, his] = [await battleOf(page), await battleOf(ben.page)];
  expect([ana.battle, his.battle]).toEqual([true, true]);
  expect([ana.seconds, his.seconds]).toEqual([120, 120]);
  expect([ana.drive, his.drive]).toEqual([17, 17]);
  expect([ana.robots, his.robots]).toEqual([0, 0]);
  expect([ana.slot, his.slot]).toEqual([0, 1]);
  expect(his.help).toBeGreaterThan(ana.help);
  expect([ana.friendName, his.friendName]).toEqual(['Ben', 'Ana']);
  expect([ana.friendShown, his.friendShown]).toEqual([true, true]);
  // Each one's tank is where the other's game shows the friend's, and the two start apart.
  for (const [here, there] of [[ana, his], [his, ana]]) expect(Math.hypot(here.friend.x - there.tank.x, here.friend.z - there.tank.z)).toBeLessThan(0.5);
  await expect(page.locator('#battle-name')).toHaveText('Ben');
  await expect(ben.page.locator('#battle-name')).toHaveText('Ana');
  await expect(page.locator('#chip-time')).toHaveText(/^(2:00|1:[0-5]\d)$/);
  await expect(page.locator('#chip-left')).toBeHidden();
  await expect(page.locator('#chip-hearts')).toBeHidden();
  await expect(page.locator('#story-line')).toHaveText('A friendly battle! Hit your friend’s tank!');
  await shot(page, 'tanks-friends-start');

  // Ben drives off with his closed hand. Ana's screen shows his tank where his game has it, turned the way it's going.
  await pointAt(ben.page, { x: 24, z: 4 }, 'fist');
  await expect.poll(async () => (await battleOf(ben.page)).tank.z, { timeout: 30_000 }).toBeLessThan(9);
  await expect.poll(async () => {
    const [here, there] = await Promise.all([battleOf(page), battleOf(ben.page)]);
    return Math.hypot(here.friend.x - there.tank.x, here.friend.z - there.tank.z) < 4 && turnOff(here.friend.heading, there.tank.heading) < 0.6;
  }, { timeout: 10_000 }).toBe(true);
  await page.waitForTimeout(300);
  await shot(page, 'tanks-friends-driving');

  // Both drive at each other with closed hands, which never fire, and stop within reach of each other's guns.
  await pointAt(page, 'friend', 'fist');
  await pointAt(ben.page, 'friend', 'fist');
  await expect.poll(() => inRange(page), { timeout: 30_000 }).toBe(true);
  await expect.poll(() => inRange(ben.page), { timeout: 30_000 }).toBe(true);
  expect([(await battleOf(page)).shots, (await battleOf(ben.page)).shots]).toEqual([0, 0]);

  // Both open their hands on each other's tanks, and each gun fires by itself. A child who's firing is playing,
  // so neither is resting, as one holding a closed hand still for long would be.
  for (const each of [page, ben.page]) {
    await each.evaluate(() => {
      const { field } = window.__game;
      const shown = field.friendFired.bind(field);
      window.__friendShots = 0;
      field.friendFired = (count) => {
        window.__friendShots += count;
        shown(count);
      };
    });
  }
  await pointAt(page, 'friend', 'open');
  await pointAt(ben.page, 'friend', 'open');
  await expect.poll(async () => (await battleOf(page)).mine, { timeout: 30_000, intervals: [50] }).toBeGreaterThanOrEqual(1);
  // Each hit has a +1 go up beside the tank it hit, for a moment.
  await expect.poll(() => page.evaluate(() => window.__game.field.points.length), { timeout: 15_000, intervals: [20] }).toBeGreaterThan(0);
  await page.waitForTimeout(250);
  await shot(page, 'tanks-friends-ana-hits');
  await expect.poll(async () => (await battleOf(ben.page)).mine, { timeout: 30_000, intervals: [50] }).toBeGreaterThanOrEqual(1);
  await ben.page.screenshot({ path: 'test-results/screens/tanks-friends-ben-hits.png' });
  // Each one's shots come over on the other's screen too, from their tank's gun, no more than they've fired.
  for (const [here, there] of [[page, ben.page], [ben.page, page]]) {
    await expect.poll(() => here.evaluate(() => window.__friendShots), { timeout: 10_000 }).toBeGreaterThan(0);
    const seen = await here.evaluate(() => window.__game.patrol.friend.shots);
    expect(seen).toBeLessThanOrEqual((await battleOf(there)).shots);
  }
  await expect(page.locator('#battle-mine')).not.toHaveText('0');
  await expect(ben.page.locator('#battle-theirs')).not.toHaveText('0');
  // Through it all, nothing flashes on either screen.
  for (const each of [page, ben.page]) {
    const reading = await brightnessThrough(each, 150);
    console.log('biggest brightness step through a battle', biggestStep(reading));
    expect(biggestStep(reading)).toBeLessThan(6);
  }
  // Each one's turret, as the other sees it, points the way it really does.
  await expect.poll(async () => {
    const [here, there] = await Promise.all([battleOf(page), battleOf(ben.page)]);
    return Math.max(turnOff(here.friend.turret, there.tank.turret), turnOff(there.friend.turret, here.tank.turret));
  }, { timeout: 10_000 }).toBeLessThan(0.5);
  await shot(page, 'tanks-friends-both-firing');

  // Both close their hands, and once the last shots have landed, each one's hits are theirs on both screens.
  await pointAt(page, 'friend', 'fist');
  await pointAt(ben.page, 'friend', 'fist');
  await expect.poll(async () => {
    const [here, there] = await Promise.all([battleOf(page), battleOf(ben.page)]);
    return here.mine === there.theirs && here.theirs === there.mine;
  }, { timeout: 10_000 }).toBe(true);
  // Each child's hits were decided by their own game, from their own shots.
  for (const each of [page, ben.page]) {
    const { mine, hits } = await each.evaluate(() => ({ mine: window.__game.patrol.score.mine, hits: window.__game.patrol.stats.hits }));
    expect(hits).toBe(mine);
  }

  // Ben puts his hand down, and after a few seconds he's resting, with little z's over his tank on Ana's screen.
  // His tank can still be hit: Ana's gun fires at it, and each hit counts for her on both screens.
  await handGone(ben.page);
  await expect.poll(async () => (await battleOf(ben.page)).resting, { timeout: 15_000 }).toBe(true);
  await expect.poll(async () => (await battleOf(page)).friend.resting, { timeout: 5000 }).toBe(true);
  const beforeRest = (await battleOf(page)).mine;
  await pointAt(page, 'friend', 'open');
  await expect.poll(async () => (await battleOf(page)).mine, { timeout: 15_000, intervals: [50] }).toBeGreaterThan(beforeRest);
  expect((await battleOf(page)).friend.resting).toBe(true);
  await page.waitForTimeout(400);
  await shot(page, 'tanks-friends-hit-resting');
  await pointAt(page, 'friend', 'fist');
  await expect.poll(async () => {
    const [here, there] = await Promise.all([battleOf(page), battleOf(ben.page)]);
    return here.mine === there.theirs && there.theirs > beforeRest && there.resting;
  }, { timeout: 10_000 }).toBe(true);

  // The time runs out for both together, and the finish card says who won, with both scores.
  for (const each of [page, ben.page]) {
    await each.evaluate(() => {
      const { game } = window.__game;
      game.battle.seconds = game.sinceGo / 1000 + 1;
    });
  }
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  for (const each of [page, ben.page]) await stopPointing(each);
  const [hers, ours] = [await battleOf(page), await battleOf(ben.page)];
  expect([hers.mine, hers.theirs]).toEqual([ours.theirs, ours.mine]);
  await expect(page.locator('#screen-finish h2')).toHaveText(titleFor(hers.mine, hers.theirs));
  await expect(ben.page.locator('#screen-finish h2')).toHaveText(titleFor(ours.mine, ours.theirs));
  await expect(page.locator('#finish-score')).toHaveText(new RegExp(`^You\\s*${hers.mine}\\s*:\\s*${hers.theirs}\\s*Ben$`));
  await expect(ben.page.locator('#finish-score')).toHaveText(new RegExp(`^You\\s*${ours.mine}\\s*:\\s*${ours.theirs}\\s*Ana$`));
  await expect(page.locator('#finish-hero')).toHaveText(String(hers.mine));
  const hits = (count) => `${count} ${count === 1 ? 'hit' : 'hits'}`;
  await expect(page.locator('.friends-results li.is-you')).toContainText(`You ${hits(hers.mine)}`);
  await expect(page.locator('.friends-results li:not(.is-you)')).toContainText(`Ben ${hits(hers.theirs)}`);
  await expect(page.locator('.friends-results li').first()).toContainText('1st');
  await expect(page.locator('#sum-right-hits')).toHaveText(String(hers.mine));
  await expect(page.locator('#sum-right-tanks')).toBeHidden();
  await page.waitForTimeout(500);
  await shot(page, 'tanks-friends-finish');
  await ben.page.screenshot({ path: 'test-results/screens/tanks-friends-finish-ben.png' });

  // Nobody's own level moves on, nobody's settings change, and the only connection was to the race server.
  expect((await battleOf(page)).ownLevel).toBe(4);
  expect((await battleOf(ben.page)).ownLevel).toBe(1);
  expect(await ben.page.evaluate(() => [window.__game.session.settings.tanks, window.__game.session.settings.pace])).toEqual([15, 'slow']);
  expect(sockets).toEqual([`ws://localhost:${Number(new URL(test.info().project.use.baseURL).port) + 1}/room/tank-patrol/${code}?make=1`]);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

/** How a patrol together is on one child's screen. */
const teamOf = (page) => page.evaluate(() => {
  const { game, patrol, field, session } = window.__game;
  const { tank, friend } = patrol;
  return {
    team: Boolean(game.team),
    battle: Boolean(game.battle),
    runs: patrol.runs ?? null,
    together: patrol.together ?? null,
    slot: patrol.slot ?? null,
    drive: patrol.pace.drive,
    help: patrol.help.radius,
    canLose: patrol.level.canLose,
    level: patrol.levelNumber,
    total: patrol.total,
    left: patrol.left,
    stopped: patrol.stats.stopped,
    by: patrol.stoppedBy ?? null,
    hits: patrol.stats.hits,
    shots: patrol.stats.shots,
    hearts: patrol.hearts,
    resting: patrol.resting,
    paused: patrol.paused,
    state: patrol.state,
    queue: patrol.queue.length,
    robots: patrol.rolling.map(({ id, kind, x, z, hp, maxHp }) => ({ id, kind, x, z, hp, maxHp })),
    shells: patrol.shells.map(({ id, share, target }) => ({ id, share, mine: target === tank })),
    tank: { x: tank.x, z: tank.z, heading: tank.heading, turret: tank.turret },
    friend: friend ? { x: friend.x, z: friend.z, resting: friend.resting, state: friend.state } : null,
    friendShown: Boolean(field.friendTank?.visible),
    friendName: field.friendName,
    robotsShown: field.robots.size,
    ownLevel: session.levels.current,
  };
});

/** In the game that runs the robot tanks: its first one waits somewhere, and no shells come until a test asks. */
const robotWaitsAt = (page, where) => page.evaluate((near) => {
  const { patrol } = window.__game;
  const [enemy] = patrol.rolling;
  const by = near === 'friend' ? patrol.friend : patrol.tank;
  const spot = patrol.nav.nearestFree(by.x, by.z - 16);
  Object.assign(enemy, { x: spot.x, z: spot.z, goal: { x: spot.x, z: spot.z }, holdFor: 9999, speed: 0 });
  enemy.flow = patrol.nav.flowTo(spot.x, spot.z, enemy.flow);
  patrol.lobIn = 9999;
  return enemy.id;
}, where);

test('two friends patrol together from their own computers: the same robot tanks on both screens, each one\'s hits counting, and both winning together', async ({ page, browser }) => {
  test.setTimeout(480_000);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  // Together is how it comes. Ana's own patrols are at level 4, which a patrol together leaves alone. Both are on
  // Gentle, the game as it was, so nobody can lose: losing together has its own test.
  await openPatrol(page, { tanks: 6, pace: 'fast', tankShells: 'gentle', levels: { 'tank-patrol': 4 } });
  const code = await makeGame(page, 'Ana');
  await expect(page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await expect(page.locator('#friends-how')).toContainText('stop the robot tanks together');

  // The friend has chosen against each other for the games they make, and plays the host's, together.
  const ben = await secondPlayer(browser);
  await openPatrol(ben.page, { tanks: 15, pace: 'slow', reach: 'lots', tankFriends: 'against' }, `#tanks=${code}`);
  await ben.page.locator('#friends-name').fill('Ben');
  await ben.page.locator('#friends-name').dispatchEvent('change');
  await expect(page.locator('#friends-here')).toContainText('Ben');
  await expect(ben.page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await expect(ben.page.locator('input[name="friends-team"][value="against"]')).toBeDisabled();
  await expect(ben.page.locator('#friends-teams-whose')).toHaveText('Ana chose.');
  await bothPlaying(page, ben.page);

  // Ana's patrol for both: twice her 6 robot tanks, at her speed, the plain patrol on Gentle, each with their own
  // reach help. Her game runs the robot tanks, and his shows them.
  const [ana, his] = [await teamOf(page), await teamOf(ben.page)];
  expect([ana.team, his.team, ana.battle, his.battle]).toEqual([true, true, false, false]);
  expect([ana.runs, his.runs]).toEqual([true, false]);
  expect([ana.total, his.total]).toEqual([12, 12]);
  expect([ana.drive, his.drive]).toEqual([17, 17]);
  expect([ana.canLose, his.canLose, ana.level, his.level]).toEqual([false, false, 1, 1]);
  expect([ana.slot, his.slot]).toEqual([0, 1]);
  expect(his.help).toBeGreaterThan(ana.help);
  expect([ana.friendName, his.friendName]).toEqual(['Ben', 'Ana']);
  expect([ana.friendShown, his.friendShown]).toEqual([true, true]);
  for (const [here, there] of [[ana, his], [his, ana]]) expect(Math.hypot(here.friend.x - there.tank.x, here.friend.z - there.tank.z)).toBeLessThan(0.5);
  for (const each of [page, ben.page]) {
    await expect(each.locator('#chip-left')).toHaveText('12');
    await expect(each.locator('#chip-stopped-label')).toHaveText('Stopped together');
    await expect(each.locator('#chip-hearts')).toBeVisible();
    for (const chip of ['#chip-mine', '#chip-theirs', '#chip-time-box']) await expect(each.locator(chip)).toBeHidden();
    await expect(each.locator('#story-line')).toHaveText('Robot tanks in my valley! Let’s stop them!');
  }
  // The same robot tanks on both screens, each drawn, and where Ana's game has them.
  await expect.poll(async () => (await teamOf(ben.page)).robots.length, { timeout: 10_000 }).toBeGreaterThan(0);
  await expect.poll(async () => {
    const [here, there] = await Promise.all([teamOf(page), teamOf(ben.page)]);
    if (here.robots.length !== there.robots.length || there.robotsShown < there.robots.length) return 99;
    return Math.max(...here.robots.map((robot, index) => (there.robots[index].id === robot.id && there.robots[index].kind === robot.kind ? Math.hypot(there.robots[index].x - robot.x, there.robots[index].z - robot.z) : 99)));
  }, { timeout: 10_000 }).toBeLessThan(2.5);
  await shot(page, 'tanks-together-start');
  await ben.page.screenshot({ path: 'test-results/screens/tanks-together-start-ben.png' });

  // One robot tank waits within reach of Ben's gun. He opens his hand on it, and his gun fires by itself: each hit
  // shows on his screen, and counts on Ana's, where the robot tank really is.
  const first = await robotWaitsAt(page, 'friend');
  for (const each of [page, ben.page]) {
    await each.evaluate(() => {
      const { field } = window.__game;
      const shown = field.friendFired.bind(field);
      window.__friendShots = [];
      field.friendFired = (count, to) => {
        window.__friendShots.push({ count, id: to?.id ?? null });
        shown(count, to);
      };
    });
  }
  await expect.poll(async () => (await teamOf(ben.page)).robots[0]?.id, { timeout: 5000 }).toBe(first);
  await pointAt(ben.page, 'tank', 'open');
  await expect.poll(async () => (await teamOf(ben.page)).hits, { timeout: 30_000, intervals: [50] }).toBeGreaterThanOrEqual(1);
  await expect.poll(async () => {
    const robot = (await teamOf(page)).robots.find(({ id }) => id === first);
    return robot ? robot.maxHp - robot.hp : 99;
  }, { timeout: 5000, intervals: [50] }).toBeGreaterThanOrEqual(1);
  await ben.page.screenshot({ path: 'test-results/screens/tanks-together-ben-fires.png' });
  // His shots come over on Ana's screen, from his tank's gun, at that robot tank.
  await expect.poll(() => page.evaluate(() => window.__friendShots.length), { timeout: 10_000 }).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__friendShots.at(-1).id)).toBe(first);
  await shot(page, 'tanks-together-ben-fires-ana');
  // He stops it: it's stopped on both screens, and it's his on both.
  await expect.poll(async () => (await teamOf(page)).stopped, { timeout: 30_000 }).toBe(1);
  await expect.poll(async () => (await teamOf(ben.page)).stopped, { timeout: 5000 }).toBe(1);
  expect([(await teamOf(page)).by, (await teamOf(ben.page)).by]).toEqual([{ mine: 0, theirs: 1 }, { mine: 1, theirs: 0 }]);
  expect((await teamOf(page)).hits).toBe(0);
  for (const each of [page, ben.page]) {
    await expect(each.locator('#chip-stopped')).toHaveText('1');
    await expect(each.locator('#chip-left')).toHaveText('11');
  }
  await stopPointing(ben.page);

  // Ana stops one too, which shows on Ben's screen as hers.
  const second = await robotWaitsAt(page, 'mine');
  await pointAt(page, 'tank', 'open');
  await expect.poll(async () => (await teamOf(page)).stopped, { timeout: 40_000 }).toBe(2);
  await expect.poll(async () => (await teamOf(ben.page)).by, { timeout: 5000 }).toEqual({ mine: 1, theirs: 1 });
  expect((await teamOf(ben.page)).robots.some(({ id }) => id === second)).toBe(false);
  expect(await ben.page.evaluate(() => window.__friendShots.length)).toBeGreaterThan(0);
  await stopPointing(page);

  // A shell for Ben's tank shows on both screens, with its ring under his tank. He stays, and it costs him a heart
  // he can't run out of, on his screen only.
  await show(ben.page, ...OPEN);
  await show(page, ...OPEN);
  await page.evaluate(() => Object.assign(window.__game.patrol, { lobTurn: 1, lobIn: 0 }));
  await expect.poll(async () => (await teamOf(ben.page)).shells.length, { timeout: 10_000, intervals: [50] }).toBe(1);
  await page.evaluate(() => {
    window.__game.patrol.lobIn = 9999;
  });
  expect((await teamOf(ben.page)).shells[0].mine).toBe(true);
  expect((await teamOf(page)).shells[0].mine).toBe(false);
  await ben.page.waitForTimeout(1200);
  await ben.page.screenshot({ path: 'test-results/screens/tanks-together-shell-ben.png' });
  await expect.poll(async () => (await teamOf(ben.page)).hearts, { timeout: 10_000 }).toBe(4);
  await expect(ben.page.locator('#chip-hearts .heart.is-gone')).toHaveCount(1);
  expect((await teamOf(page)).hearts).toBe(5);

  // Through it all, nothing flashes on either screen.
  await pointAt(page, 'tank', 'fist');
  await pointAt(ben.page, 'tank', 'fist');
  for (const each of [page, ben.page]) {
    const reading = await brightnessThrough(each, 150);
    console.log('biggest brightness step through a patrol together', biggestStep(reading));
    expect(biggestStep(reading)).toBeLessThan(6);
  }

  // Ben puts his hand down, and is resting: little z's over his tank on Ana's screen, while the robot tanks keep
  // going for her. When she rests too, they wait, on both screens.
  await handGone(ben.page);
  await expect.poll(async () => (await teamOf(ben.page)).resting, { timeout: 15_000 }).toBe(true);
  await expect.poll(async () => (await teamOf(page)).friend.resting, { timeout: 5000 }).toBe(true);
  expect([(await teamOf(page)).paused, (await teamOf(ben.page)).paused]).toEqual([false, false]);
  await page.waitForTimeout(300);
  await shot(page, 'tanks-together-ben-resting');
  await handGone(page);
  await expect.poll(async () => (await teamOf(page)).paused, { timeout: 15_000 }).toBe(true);
  await expect.poll(async () => (await teamOf(ben.page)).paused, { timeout: 5000 }).toBe(true);

  // What's left waits within reach of Ana's gun, each with a hit to go. She stops them all, and the valley is
  // saved for both, together.
  await page.evaluate(() => {
    const { patrol } = window.__game;
    patrol.queue = [];
    patrol.total = patrol.stats.stopped + patrol.rolling.length;
    // In an arc in front of her tank, each of them within reach, however many are left.
    patrol.rolling.forEach((enemy, index) => {
      const angle = -1 + index * 0.4;
      const spot = patrol.nav.nearestFree(patrol.tank.x + Math.sin(angle) * 15, patrol.tank.z - Math.cos(angle) * 15);
      Object.assign(enemy, { x: spot.x, z: spot.z, goal: { x: spot.x, z: spot.z }, holdFor: 9999, speed: 0, hp: 1 });
      enemy.flow = patrol.nav.flowTo(spot.x, spot.z, enemy.flow);
    });
  });
  await pointAt(page, 'tank', 'open');
  await show(ben.page, ...OPEN);
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  for (const each of [page, ben.page]) await stopPointing(each);
  const [hers, ours] = [await teamOf(page), await teamOf(ben.page)];
  expect([hers.state, ours.state, hers.left, ours.left]).toEqual(['won', 'won', 0, 0]);
  expect(hers.stopped).toBe(ours.stopped);
  expect(hers.by.mine + hers.by.theirs).toBe(hers.stopped);
  expect(ours.by).toEqual({ mine: hers.by.theirs, theirs: hers.by.mine });
  for (const [each, mine, theirs, friend] of [[page, hers.by.mine, hers.by.theirs, 'Ben'], [ben.page, ours.by.mine, ours.by.theirs, 'Ana']]) {
    await expect(each.locator('#screen-finish h2')).toHaveText('You saved the valley together!');
    await expect(each.locator('#finish-hero')).toHaveText(String(hers.stopped));
    await expect(each.locator('.finish-hero')).toContainText('stopped together');
    await expect(each.locator('.friends-results li')).toHaveCount(2);
    await expect(each.locator('.friends-results li.is-you')).toContainText(`You ${mine} stopped`);
    await expect(each.locator('.friends-results li:not(.is-you)')).toContainText(`${friend} ${theirs} stopped`);
    // Nobody is first or second: they're on the same side.
    await expect(each.locator('.friends-results .friends-place').first()).toBeHidden();
    await expect(each.locator('#sum-right-tanks')).toHaveText(String(mine));
    await expect(each.locator('#finish-score')).toBeHidden();
  }
  await page.waitForTimeout(500);
  await shot(page, 'tanks-together-finish');
  await ben.page.screenshot({ path: 'test-results/screens/tanks-together-finish-ben.png' });

  // Nobody's own level moves on, nobody's settings change, and the only connection was to the race server.
  expect(hers.ownLevel).toBe(4);
  expect(ours.ownLevel).toBe(1);
  expect(await ben.page.evaluate(() => [window.__game.session.settings.tanks, window.__game.session.settings.pace, window.__game.session.settings.tankFriends])).toEqual([15, 'slow', 'against']);
  expect(await page.evaluate(() => window.__game.session.settings.tankShells)).toBe('gentle');
  expect(sockets).toEqual([`ws://localhost:${Number(new URL(test.info().project.use.baseURL).port) + 1}/room/tank-patrol/${code}?make=1`]);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('together, a friend who goes leaves whoever made the patrol to finish it, with half of what was left', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openPatrol(page);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await openPatrol(ben.page, {}, `#tanks=${code}`);
  await bothPlaying(page, ben.page);
  await expect.poll(async () => (await teamOf(ben.page)).robots.length, { timeout: 10_000 }).toBeGreaterThan(0);
  const before = await teamOf(page);
  expect([before.total, before.together]).toEqual([12, true]);
  await ben.context.close();
  await expect.poll(async () => (await teamOf(page)).together, { timeout: 20_000 }).toBe(false);
  const alone = await teamOf(page);
  expect([alone.state, alone.friendShown, alone.total]).toEqual(['playing', false, 6]);
  expect(alone.robots.length + alone.queue).toBe(6);
  await expect(page.locator('#chip-left')).toHaveText('6');
  await expect(page.locator('#chip-stopped-label')).toHaveText('Stopped');
  expect(await page.evaluate(() => window.__game.session.screen)).toBe('playing');
});

test('together on Medium, as it comes, the two can lose together: when the friend\'s hearts run out, it ends on both screens', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openPatrol(page, { tankShells: undefined });
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await openPatrol(ben.page, { tankShells: undefined }, `#tanks=${code}`);
  await bothPlaying(page, ben.page);
  expect(await ben.page.evaluate(() => [window.__game.patrol.level.canLose, window.__game.patrol.hearts])).toEqual([true, 4]);
  // Ben's tank is hit four times over, on his own screen, which is where that's decided.
  await ben.page.evaluate(() => {
    const { patrol } = window.__game;
    for (let i = 0; i < 4; i += 1) patrol.hurt();
  });
  await waitForScreen(ben.page, 'finish');
  await waitForScreen(page, 'finish');
  for (const each of [page, ben.page]) {
    await expect(each.locator('#screen-finish h2')).toHaveText('The robot tanks got the better of you both!');
    await expect(each.locator('#play-again')).toHaveText('Try again');
    expect(await each.evaluate(() => window.__game.session.levels.current)).toBe(1);
  }
  await page.waitForTimeout(400);
  await shot(page, 'k30-lost-together');
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('together, if whoever made the patrol goes, their friend\'s game takes the robot tanks over as they are, and they carry on', async ({ page, browser }) => {
  test.setTimeout(300_000);
  // Ben makes it this time, in the other browser, and the child here is the friend.
  const ben = await secondPlayer(browser);
  await openPatrol(ben.page, { pace: 'fast' });
  const code = await makeGame(ben.page, 'Ben');
  await openPatrol(page, {}, `#tanks=${code}`);
  await bothPlaying(ben.page, page);
  await expect.poll(async () => (await teamOf(page)).robots.length, { timeout: 10_000 }).toBeGreaterThan(0);
  await pointAt(page, { x: 14, z: 12 }, 'fist');
  const before = await teamOf(page);
  expect([before.runs, before.total, before.queue]).toEqual([false, 12, 0]);
  await ben.context.close();
  await expect.poll(async () => (await teamOf(page)).runs, { timeout: 20_000 }).toBe(true);
  const mine = await teamOf(page);
  expect([mine.state, mine.together, mine.friendShown, mine.total]).toEqual(['playing', false, false, 6]);
  // The robot tanks that were there are still there, now this game's to run, with more on their way: six in all
  // to stop, half of the twelve. And they go on driving about.
  expect(mine.robots.map(({ id }) => id)).toEqual(expect.arrayContaining(before.robots.map(({ id }) => id)));
  expect(mine.robots.length + mine.queue).toBe(6);
  // The child drives after one, so they aren't resting, which would have the robot tanks wait for them.
  await pointAt(page, 'tank', 'fist');
  await expect.poll(async () => (await teamOf(page)).paused, { timeout: 10_000 }).toBe(false);
  await expect.poll(async () => {
    const now = await teamOf(page);
    return Math.max(...now.robots.map((robot) => {
      const was = mine.robots.find(({ id }) => id === robot.id);
      return was ? Math.hypot(robot.x - was.x, robot.z - was.z) : 0;
    }));
  }, { timeout: 20_000 }).toBeGreaterThan(3);
  expect(await page.evaluate(() => window.__game.session.screen)).toBe('playing');
  await expect(page.locator('#chip-left')).toHaveText('6');
  await stopPointing(page);
});

test('a battle is for two: a third friend is told it already has two players', async ({ page, browser }) => {
  await openPatrol(page);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await openPatrol(ben.page, {}, `#tanks=${code}`);
  await expect(page.locator('#friends-here li')).toHaveCount(2);
  const cara = await secondPlayer(browser);
  await openPatrol(cara.page, {}, `#tanks=${code}`);
  await expect(cara.page.locator('#friends-status')).toHaveText('That game already has 2 players.');
  await expect(cara.page.locator('#friends-out')).toBeVisible();
  await expect(page.locator('#friends-here li')).toHaveCount(2);
  for (const each of [ben, cara]) {
    expect(each.errors).toEqual([]);
    await each.context.close();
  }
});

test('a friend who goes in the middle ends the battle for the other, who can go back to patrolling on their own', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openPatrol(page, { tankFriends: 'against' });
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await openPatrol(ben.page, {}, `#tanks=${code}`);
  await bothPlaying(page, ben.page);
  await ben.context.close();
  await waitForScreen(page, 'finish');
  await expect(page.locator('#finish-score')).toBeVisible();
  expect((await battleOf(page)).friendShown).toBe(false);
  // On their own again: robot tanks, and nothing more sent.
  await page.locator('#friends-leave').evaluate((button) => button.click());
  await show(page, ...OPEN);
  await page.locator('#play-again').click();
  await waitForScreen(page, 'playing');
  const solo = await battleOf(page);
  expect([solo.battle, solo.friendShown]).toEqual([false, false]);
  expect(solo.robots).toBeGreaterThan(0);
  await expect(page.locator('#chip-left')).toBeVisible();
  await expect(page.locator('#chip-mine')).toBeHidden();
});

test('on their own, it\'s the patrol with its robot tanks, as ever, and nothing connects anywhere', async ({ page }) => {
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await startPatrol(page);
  const solo = await battleOf(page);
  expect([solo.battle, solo.friend, solo.friendShown]).toEqual([false, null, false]);
  expect(solo.robots).toBeGreaterThan(0);
  for (const chip of ['#chip-left', '#chip-stopped', '#chip-hearts']) await expect(page.locator(chip)).toBeVisible();
  for (const chip of ['#chip-mine', '#chip-theirs', '#chip-time-box']) await expect(page.locator(chip)).toBeHidden();
  await expect(page.locator('#story-line')).toHaveText('Robot tanks in my valley! Let’s stop them!');
  await expect(page.locator('#friends-toggle')).toHaveText('Play with a friend');
  expect(sockets).toEqual([]);
});
