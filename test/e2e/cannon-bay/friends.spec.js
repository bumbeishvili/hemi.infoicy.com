// Playing Cannon Bay with a friend: two children, each on their own computer with their own camera. Against each
// other it's ship against ship, with no pirates. Together, both ships drive off the pirates, which the game of
// whoever made the battle runs for both. Either way each game sails its own ship, decides its own hits and sends
// them, and shows the friend's ship where it really is. Here they're two separate browsers, talking through the
// race server on this computer (tools/race-server.mjs).
import { expect, openGame as openAnyGame, show, shot, test, waitForScreen } from '../helpers.js';
import { expectSoon, HAND_SCALE } from './helpers.js';

const GAME = 'cannon-bay';
// How hard is Gentle unless a test says otherwise, the game as it always was, so the tests of its kind rules play it
// that way: the challenge, which is how it comes, has its own tests.
const openGame = (page, settings = {}, ...rest) => openAnyGame(page, { bayPirates: 'gentle', ...settings }, ...rest);
const OPEN = [null, 'open', { scale: HAND_SCALE }];
const FIST = [null, 'fist', { scale: HAND_SCALE }];
const NO_HAND = [null, null, { scale: HAND_SCALE }];

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
  if (name) await nameIs(page, name);
  return page.locator('#friends-code-shown').textContent();
}

async function nameIs(page, name) {
  await page.locator('#friends-name').fill(name);
  await page.locator('#friends-name').dispatchEvent('change');
}

const screenOf = (page) => page.evaluate(() => window.__game.screen);

/**
 * Both get through the hand check and wait for each other, and then both play. after is what each camera shows
 * once its hand check is done, from waiting for the other onwards.
 */
async function bothPlaying(page, other, after = [OPEN, OPEN]) {
  for (const each of [page, other]) {
    await show(each, ...OPEN);
    await each.locator('#start').click();
  }
  for (const [index, each] of [page, other].entries()) {
    await expect.poll(() => screenOf(each), { timeout: 60_000, intervals: [50] }).toMatch(/^(waiting|countdown|playing)$/);
    await show(each, ...after[index]);
  }
  await waitForScreen(page, 'playing');
  await waitForScreen(other, 'playing');
}

/** How it is on one child's screen. */
const view = (page) => page.evaluate(() => {
  const { battle, duel, bay } = window.__game;
  const { friend } = battle;
  const ship = friend ? bay.shipFor(friend) : null;
  return {
    duel: duel ? { seconds: duel.seconds, left: duel.left, mine: duel.mine, theirs: duel.theirs, slot: duel.slot } : null,
    me: { x: battle.x, z: battle.z, sails: battle.sails },
    friend: friend ? { x: friend.x, z: friend.z, sails: friend.sails, state: friend.state, captain: ship?.spec.id ?? null, seen: Boolean(ship?.root.visible), hull: ship?.look.hull } : null,
    hull: bay.hero.look.hull,
    pirates: battle.afloat.filter((each) => !each.friend).length,
    level: battle.levelNumber,
    pace: battle.pace.speed,
    reach: battle.level.zone.reach,
    prizes: battle.plan.gems,
    hearts: battle.hearts,
    hits: battle.stats.hits,
    shots: battle.stats.shots,
    struck: battle.stats.struck,
    theirBalls: battle.balls.filter(({ homing }) => homing).length,
    state: battle.state,
    ownLevel: window.__game.session.levels.current,
  };
});

/**
 * Keeps this child's ship beside their friend's, as it's seen here: this far round from the friend's bow and this
 * far away, going the same way, as if the child had sailed there. Their game sees it there too, a moment later.
 * Runs until it's let go.
 */
const holdBeside = (page, { off = Math.PI / 2, away = 100 } = {}) => page.evaluate(([bearing, distance]) => {
  clearInterval(window.__beside);
  window.__beside = setInterval(() => {
    const { battle } = window.__game;
    const { friend } = battle;
    if (!friend || battle.state !== 'sailing') return;
    const direction = friend.heading + bearing;
    battle.x = friend.x + Math.sin(direction) * distance;
    battle.z = friend.z - Math.cos(direction) * distance;
    battle.heading = friend.heading;
  }, 16);
}, [off, away]);

const letGo = (page) => page.evaluate(() => clearInterval(window.__beside));

/** How bright the whole picture is, frame by frame, as in sound-and-safety.spec.js. */
const brightnessOverFrames = (page, frames) => page.evaluate(async (count) => {
  const { bay } = window.__game;
  const reading = [];
  const small = document.createElement('canvas');
  small.width = 32;
  small.height = 18;
  const context = small.getContext('2d', { willReadFrequently: true });
  for (let i = 0; i < count; i += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    bay.render();
    context.drawImage(bay.canvas, 0, 0, 32, 18);
    const { data } = context.getImageData(0, 0, 32, 18);
    let total = 0;
    for (let j = 0; j < data.length; j += 4) total += (data[j] + data[j + 1] + data[j + 2]) / 3;
    reading.push(total / (32 * 18));
  }
  return reading;
}, frames);

const biggestStep = (reading) => Math.max(...reading.slice(1).map((value, index) => Math.abs(value - reading[index])));

/** The time runs out, for both. */
async function timeUp(page, other) {
  for (const each of [page, other]) {
    await each.evaluate(() => {
      window.__game.duel.left = 0.5;
    });
  }
  await waitForScreen(page, 'finish');
  await waitForScreen(other, 'finish');
  // Both finish cards fill in, once each has heard how the other did.
  for (const each of [page, other]) await expect(each.locator('.friends-results li')).toHaveCount(2);
  for (const each of [page, other]) await expect(each.locator('.friends-results li.is-racing')).toHaveCount(0);
}

test('two friends battle ship against ship: each one\'s ship where it really is on both screens, and each one\'s hits counting for them on both', async ({ page, browser }) => {
  test.setTimeout(420_000);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openGame(page, { bayShips: 4, bayPace: 'slow', bayPirates: 'gentle', bayFriends: 'against', sound: true, levels: { [GAME]: 3 } }, GAME);
  const code = await makeGame(page, 'Ana');
  expect(page.url()).toContain(`#bay=${code}`);
  await expect(page.locator('input[name="friends-team"][value="against"]')).toBeChecked();

  // The friend has their own speed, how hard and ships to beat, and is someone else in the other games.
  const ben = await secondPlayer(browser);
  await openGame(ben.page, { bayShips: 9, bayPace: 'fast', bayPirates: 'tough', fighter: 'kit' }, GAME, `#bay=${code}`);
  await nameIs(ben.page, 'Ben');
  await expect(page.locator('#friends-here')).toContainText('Ben');
  await expect(ben.page.locator('#friends-here')).toContainText('Ana');
  // Ben's hand closes once his hand check is done, so for now only Ana's cannons fire.
  await bothPlaying(page, ben.page, [OPEN, FIST]);

  const [ana, his] = [await view(page), await view(ben.page)];
  // Two minutes, from the host's 4 ships, and the plain game for both, with no pirates and nothing from the levels.
  expect([ana.duel.seconds, his.duel.seconds]).toEqual([120, 120]);
  expect([ana.duel.slot, his.duel.slot]).toEqual([0, 1]);
  expect([ana.pirates, his.pirates]).toEqual([0, 0]);
  expect([ana.level, his.level]).toEqual([1, 1]);
  expect([ana.prizes, his.prizes]).toEqual([false, false]);
  // Each sails at their own speed, with their own firing zones.
  expect([ana.pace, his.pace]).toEqual([24, 42]);
  expect([ana.reach, his.reach]).toEqual([172, 135]);
  // Ana sees Kit's ship, Ben's character in the other games, and Ben sees Giraffe's, as Ana has nobody else,
  // painted so that it can't be taken for his own.
  expect([ana.friend.captain, his.friend.captain]).toEqual(['kit', 'giraffe']);
  expect(his.friend.hull).not.toBe(his.hull);
  await expect(page.locator('#duel-their-name')).toHaveText('Ben');
  await expect(ben.page.locator('#duel-their-name')).toHaveText('Ana');
  await expect(page.locator('#duel-time')).toHaveText(/^[12]:\d\d$/);
  await expect(page.locator('#bay-left')).toBeHidden();
  await expect(page.locator('#hearts')).toBeHidden();

  // Ben's ship beside Ana's: her cannons fire, and his don't, with his hand closed.
  await holdBeside(ben.page);
  await expectSoon(async () => (await view(ben.page)).me.sails, 15_000).toBeLessThan(0.1);
  await ben.page.waitForTimeout(1500);
  const benBefore = (await view(ben.page)).hits;
  await expectSoon(async () => (await view(page)).hits, 30_000).toBeGreaterThanOrEqual(5);
  // Each of Ana's hits counts for her on both screens, and shows on Ben's ship as her balls come over.
  const anaNow = await view(page);
  const anaHits = anaNow.duel.mine;
  expect(anaHits).toBe(anaNow.hits);
  await expectSoon(async () => (await view(ben.page)).duel.theirs, 10_000).toBeGreaterThanOrEqual(anaHits);
  await expectSoon(async () => (await view(ben.page)).struck, 10_000).toBeGreaterThan(0);
  await expectSoon(async () => (await view(ben.page)).theirBalls, 10_000).toBeGreaterThan(0);
  expect((await view(ben.page)).hits).toBe(benBefore);
  expect((await view(page)).duel.theirs).toBe(benBefore);
  // Nothing is lost by being hit: there are no hearts to lose, and the ship's still there.
  expect((await view(ben.page)).hearts).toBe(5);
  expect((await view(page)).friend.state).toBe('sailing');
  await expect(page.locator('#duel-mine')).not.toHaveText('0');
  // Each ship where it really is on the other screen, a moment ago, with its sails as they are.
  await expectSoon(async () => {
    const [here, there] = await Promise.all([view(page), view(ben.page)]);
    return Math.max(Math.hypot(here.me.x - there.friend.x, here.me.z - there.friend.z), Math.hypot(there.me.x - here.friend.x, there.me.z - here.friend.z));
  }, 15_000).toBeLessThan(30);
  expect((await view(page)).friend.sails).toBeLessThan(0.15);
  expect((await view(ben.page)).friend.sails).toBeGreaterThan(0.5);
  // With Ben's name over his ship, and the ship to be seen.
  await expect(page.locator('.mark[data-friend="yes"][data-where="on"] .mark-name')).toHaveText('Ben', { timeout: 15_000 });
  expect((await view(page)).friend.seen).toBe(true);
  await page.waitForTimeout(300);
  await shot(page, 'cannon-bay-friends-host');
  await ben.page.screenshot({ path: 'test-results/screens/cannon-bay-friends-guest.png' });

  // Now the other way round: Ana's hand closes, Ben's opens, and Ana's ship is beside his.
  await letGo(ben.page);
  await show(page, ...FIST);
  await show(ben.page, ...OPEN);
  await holdBeside(page);
  await page.waitForTimeout(1500);
  const anaBefore = (await view(page)).hits;
  await expectSoon(async () => (await view(ben.page)).hits, 30_000).toBeGreaterThanOrEqual(benBefore + 4);
  const benHits = (await view(ben.page)).duel.mine;
  await expectSoon(async () => (await view(page)).duel.theirs, 10_000).toBeGreaterThanOrEqual(benHits);
  await expectSoon(async () => (await view(page)).struck, 10_000).toBeGreaterThan(0);
  expect((await view(page)).hits).toBe(anaBefore);
  expect((await view(page)).hearts).toBe(5);
  await expect(ben.page.locator('.mark[data-friend="yes"] .mark-name')).toHaveText('Ana');
  await ben.page.screenshot({ path: 'test-results/screens/cannon-bay-friends-guest-firing.png' });

  // Both firing at each other side by side, with all their balls and hits: nothing flashes on either screen.
  await page.evaluate(() => {
    const { sound } = window.__game;
    window.__tap = sound.context.createAnalyser();
    window.__tap.fftSize = 2048;
    sound.output.connect(window.__tap);
    window.__peak = 0;
    const samples = new Float32Array(2048);
    window.__listening = setInterval(() => {
      window.__tap.getFloatTimeDomainData(samples);
      for (const sample of samples) window.__peak = Math.max(window.__peak, Math.abs(sample));
    }, 20);
  });
  await show(page, ...OPEN);
  await expectSoon(async () => (await view(page)).hits, 20_000).toBeGreaterThan(anaBefore + 2);
  const [hostSteps, guestSteps] = [biggestStep(await brightnessOverFrames(page, 120)), biggestStep(await brightnessOverFrames(ben.page, 120))];
  console.log('biggest brightness step with both firing: host', hostSteps, 'guest', guestSteps);
  expect(hostSteps).toBeLessThan(6);
  expect(guestSteps).toBeLessThan(6);
  const peak = await page.evaluate(() => window.__peak);
  console.log('loudest moment with both firing', peak);
  expect(peak).toBeGreaterThan(0.02);
  expect(peak).toBeLessThanOrEqual(1);
  await letGo(page);

  // The time is up: both finish cards say who won, with both scores.
  await timeUp(page, ben.page);
  const [anaFinal, benFinal] = [(await view(page)).duel.mine, (await view(ben.page)).duel.mine];
  console.log('final hits', anaFinal, benFinal);
  const titleFor = (mine, theirs, name) => (mine === theirs ? 'You both won!' : mine > theirs ? 'You won!' : `${name} won!`);
  await expect(page.locator('#screen-finish h2')).toHaveText(titleFor(anaFinal, benFinal, 'Ben'));
  await expect(ben.page.locator('#screen-finish h2')).toHaveText(titleFor(benFinal, anaFinal, 'Ana'));
  await expect(page.locator('.friends-results')).toContainText(new RegExp(`You\\s+${anaFinal} hits`));
  await expect(page.locator('.friends-results')).toContainText(new RegExp(`Ben\\s+${benFinal} hits`));
  await expect(ben.page.locator('.friends-results')).toContainText(new RegExp(`Ana\\s+${anaFinal} hits`));
  await expect(ben.page.locator('.friends-results')).toContainText(new RegExp(`You\\s+${benFinal} hits`));
  await expect(page.locator('#finish-hero')).toHaveText(String(anaFinal));
  await expect(page.locator('.finish-hero')).toContainText('hits');
  await page.waitForTimeout(600);
  await shot(page, 'cannon-bay-friends-finish');
  await ben.page.screenshot({ path: 'test-results/screens/cannon-bay-friends-finish-guest.png' });

  // Nobody's own level moves on, nobody's settings change, and the only connection was to the race server.
  expect((await view(page)).ownLevel).toBe(3);
  expect((await view(ben.page)).ownLevel).toBe(1);
  const benSettings = await ben.page.evaluate(() => window.__game.session.settings);
  expect([benSettings.bayShips, benSettings.bayPace, benSettings.bayPirates]).toEqual([9, 'fast', 'tough']);
  expect(sockets).toEqual([`ws://localhost:${Number(new URL(test.info().project.use.baseURL).port) + 1}/room/cannon-bay/${code}?make=1`]);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

/** How a battle together is on one child's screen. */
const teamView = (page) => page.evaluate(() => {
  const { battle, game, bay, session } = window.__game;
  const { friend } = battle;
  const ship = friend ? bay.shipFor(friend) : null;
  return {
    team: Boolean(game.team),
    duel: Boolean(game.duel),
    runs: battle.runs ?? null,
    slot: battle.slot ?? null,
    total: battle.total,
    left: battle.left,
    beaten: battle.stats.beaten,
    by: battle.beatenBy ?? null,
    waiting: battle.waiting,
    pace: battle.pace.speed,
    reach: battle.level.zone.reach,
    canLose: battle.level.canLose,
    level: battle.levelNumber,
    hearts: battle.hearts,
    hits: battle.stats.hits,
    resting: battle.resting,
    paused: battle.paused,
    state: battle.state,
    me: { x: battle.x, z: battle.z },
    friend: friend ? { x: friend.x, z: friend.z, ally: Boolean(friend.ally), resting: Boolean(friend.resting), captain: ship?.spec.id ?? null, seen: Boolean(ship?.root.visible), hull: ship?.look.hull } : null,
    hull: bay.hero.look.hull,
    pirates: battle.afloat.filter((each) => !each.friend).map(({ index, x, z, hitsLeft, maxHits }) => ({ index, x, z, hitsLeft, maxHits })),
    balls: battle.balls.filter(({ homing }) => !homing).map(({ id, prey }) => ({ id, mine: prey === battle })),
    captains: game.captains,
    ownLevel: session.levels.current,
  };
});

/**
 * In the game that runs the pirates: its first one stays beside one of the two ships, with a few hits to go, and
 * the others far away, none of them firing, so a test is about one thing. Runs until it's let go.
 */
const holdPirateBeside = (page, whose, hits = 6) => page.evaluate(([who, left]) => {
  clearInterval(window.__holding);
  const { battle } = window.__game;
  const pirate = battle.afloat.find((each) => !each.friend);
  pirate.hitsLeft = pirate.maxHits = left;
  window.__held = pirate.index;
  window.__holding = setInterval(() => {
    const ship = who === 'friend' ? battle.friend : battle;
    if (!ship) return;
    const direction = ship.heading + Math.PI / 2;
    for (const each of battle.afloat) {
      if (each.friend) continue;
      const away = each === pirate ? 95 : -640;
      const way = each === pirate ? direction : ship.heading;
      Object.assign(each, { x: ship.x + Math.sin(way) * away, z: ship.z - Math.cos(way) * away, mode: 'away', spot: { x: each.x, z: each.z }, modeLeft: 5, runAt: -1, fireIn: 100, burstLeft: 0 });
      if (each === pirate) each.heading = ship.heading;
    }
  }, 16);
  return pirate.index;
}, [whose, hits]);

test('two friends sail together against the pirates: the same pirate ships on both screens, each one\'s hits counting, and both winning together', async ({ page, browser }) => {
  test.setTimeout(480_000);
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  // Together is how it comes. Ana's own battles are on Tough, at level 3: a battle together leaves the level alone.
  await openGame(page, { bayShips: 4, bayPace: 'slow', bayPirates: 'tough', levels: { [GAME]: 3 } }, GAME);
  const code = await makeGame(page, 'Ana');
  await expect(page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await expect(page.locator('#friends-how')).toContainText('drive the pirates off together');

  // The friend has chosen against each other for the games they make, has their own speed and ships to beat, and
  // is someone else in the other games. They play the host's game, together.
  const ben = await secondPlayer(browser);
  await openGame(ben.page, { bayShips: 9, bayPace: 'fast', bayPirates: 'gentle', fighter: 'kit', bayFriends: 'against' }, GAME, `#bay=${code}`);
  await nameIs(ben.page, 'Ben');
  await expect(page.locator('#friends-here')).toContainText('Ben');
  await expect(ben.page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await expect(ben.page.locator('input[name="friends-team"][value="against"]')).toBeDisabled();
  await expect(ben.page.locator('#friends-teams-whose')).toHaveText('Ana chose.');
  // Both close their hands once the hand check is done, so for now nobody fires.
  await bothPlaying(page, ben.page, [FIST, FIST]);

  // Ana's battle for both: her 4 pirate ships, each taking twice the hits, at her speed, with nothing from the
  // levels. The pirates are as on Gentle for both, and each has their own firing zones. Her game runs the pirates.
  const [ana, his] = [await teamView(page), await teamView(ben.page)];
  expect([ana.team, his.team, ana.duel, his.duel]).toEqual([true, true, false, false]);
  expect([ana.runs, his.runs, ana.slot, his.slot]).toEqual([true, false, 0, 1]);
  expect([ana.total, his.total, ana.level, his.level]).toEqual([4, 4, 1, 1]);
  expect([ana.pace, his.pace]).toEqual([24, 24]);
  // Each child's own How hard says whether their ship can be sunk: Ana's Tough can, and Ben's Gentle can't.
  expect([ana.canLose, his.canLose]).toEqual([true, false]);
  expect(his.reach).toBeGreaterThan(ana.reach);
  // The same captains, in the same order, on both screens, and four faces in the row along the top.
  expect(ana.captains).toHaveLength(4);
  expect(his.captains).toEqual(ana.captains);
  for (const each of [page, ben.page]) {
    await expect(each.locator('#bay-captains .captain-face')).toHaveCount(4);
    await expect(each.locator('#bay-left')).toBeVisible();
    await expect(each.locator('#bay-left')).toHaveText('4');
    await expect(each.locator('#hearts')).toBeVisible();
    await expect(each.locator('#duel-time')).toBeHidden();
    await expect(each.locator('#story-line')).not.toHaveText('');
  }
  // Each has the other's ship beside their own, on their side: a blue one of its own, not a pirate captain's,
  // with the friend's character at the helm, and their name over it.
  for (const [here, there, captain] of [[ana, his, 'kit'], [his, ana, 'giraffe']]) {
    expect(here.friend.ally).toBe(true);
    expect([here.friend.seen, here.friend.captain]).toEqual([true, captain]);
    expect(here.friend.hull).toBe('#2f6fed');
    expect(here.friend.hull).not.toBe(here.hull);
    expect(Math.hypot(here.friend.x - there.me.x, here.friend.z - there.me.z)).toBeLessThan(30);
  }
  await expect(page.locator('.mark[data-friend="yes"] .mark-name')).toHaveText('Ben');
  await expect(ben.page.locator('.mark[data-friend="yes"] .mark-name')).toHaveText('Ana');
  // The same pirate ships on both screens, each taking twice the hits, where Ana's game has them.
  await expectSoon(async () => (await teamView(ben.page)).pirates.length, 10_000).toBeGreaterThan(0);
  await expectSoon(async () => {
    const [here, there] = await Promise.all([teamView(page), teamView(ben.page)]);
    if (here.pirates.length !== there.pirates.length) return 9999;
    return Math.max(...here.pirates.map((pirate, index) => (there.pirates[index].index === pirate.index && there.pirates[index].maxHits === pirate.maxHits ? Math.hypot(there.pirates[index].x - pirate.x, there.pirates[index].z - pirate.z) : 9999)));
  }, 10_000).toBeLessThan(40);
  expect(ana.pirates.every(({ maxHits }) => maxHits === 60)).toBe(true);
  await shot(page, 'bay-together-start');
  await ben.page.screenshot({ path: 'test-results/screens/bay-together-start-ben.png' });

  // One pirate ship stays beside Ben's ship. He opens his hand, and his cannons fire by themselves: each hit shows
  // on his screen, and counts on Ana's, where the pirate ship really is. His balls are seen flying at it on hers.
  const first = await holdPirateBeside(page, 'friend');
  await page.evaluate(() => {
    const { battle } = window.__game;
    const shown = battle.friendFired.bind(battle);
    window.__friendFired = 0;
    battle.friendFired = (count) => {
      window.__friendFired += count;
      shown(count);
    };
  });
  await expectSoon(async () => (await teamView(ben.page)).pirates.find(({ index }) => index === first)?.maxHits).toBe(6);
  await show(ben.page, ...OPEN);
  await expectSoon(async () => (await teamView(ben.page)).hits, 30_000).toBeGreaterThanOrEqual(1);
  await expectSoon(async () => {
    const pirate = (await teamView(page)).pirates.find(({ index }) => index === first);
    return pirate ? pirate.maxHits - pirate.hitsLeft : 99;
  }, 5000).toBeGreaterThanOrEqual(1);
  await expectSoon(() => page.evaluate(() => window.__friendFired), 10_000).toBeGreaterThan(0);
  await ben.page.screenshot({ path: 'test-results/screens/bay-together-ben-fires.png' });
  await shot(page, 'bay-together-ben-fires-ana');
  // He beats it: it goes down on both screens, and it's his on both.
  await expectSoon(async () => (await teamView(page)).beaten, 30_000).toBe(1);
  await expectSoon(async () => (await teamView(ben.page)).beaten, 5000).toBe(1);
  expect([(await teamView(page)).by, (await teamView(ben.page)).by]).toEqual([{ mine: 0, theirs: 1 }, { mine: 1, theirs: 0 }]);
  expect((await teamView(page)).hits).toBe(0);
  for (const each of [page, ben.page]) await expect(each.locator('#bay-left')).toHaveText('3');
  await show(ben.page, ...FIST);

  // Ana beats one too, which shows on Ben's screen as hers.
  const second = await holdPirateBeside(page, 'mine');
  await show(page, ...OPEN);
  await expectSoon(async () => (await teamView(page)).beaten, 40_000).toBe(2);
  await expectSoon(async () => (await teamView(ben.page)).by, 5000).toEqual({ mine: 1, theirs: 1 });
  expect((await teamView(ben.page)).pirates.some(({ index }) => index === second)).toBe(false);
  await show(page, ...FIST);
  await page.evaluate(() => clearInterval(window.__holding));

  // A pirate's cannonball aimed true at Ben's ship shows on both screens, and costs him a heart he can't run out
  // of, on his screen only.
  await show(ben.page, ...OPEN);
  await page.waitForTimeout(600);
  const before = [(await teamView(page)).hearts, (await teamView(ben.page)).hearts];
  const fired = await page.evaluate(() => {
    const { battle } = window.__game;
    battle.level = { ...battle.level, hitChance: 1 };
    const pirate = battle.afloat.find((each) => !each.friend);
    const { friend } = battle;
    Object.assign(pirate, { x: friend.x + 95, z: friend.z, burstSide: -1, fireIn: 100, burstLeft: 0 });
    // Whichever ship this pirate would go for, this ball is for the friend's.
    const prey = battle.preyOf.bind(battle);
    battle.preyOf = () => friend;
    battle.fireBall(pirate);
    battle.preyOf = prey;
    battle.level = { ...battle.level, hitChance: 0 };
    return battle.balls.at(-1).id;
  });
  await expectSoon(async () => (await teamView(ben.page)).balls.find(({ id }) => id === fired)?.mine, 5000).toBe(true);
  expect((await teamView(page)).balls.find(({ id }) => id === fired)?.mine).toBe(false);
  await expectSoon(async () => (await teamView(ben.page)).hearts, 10_000).toBe(before[1] - 1);
  expect((await teamView(page)).hearts).toBe(before[0]);

  // Through it all, nothing flashes on either screen.
  for (const each of [page, ben.page]) {
    const reading = await brightnessOverFrames(each, 150);
    console.log('biggest brightness step through a battle together', biggestStep(reading));
    expect(biggestStep(reading)).toBeLessThan(6);
  }

  // Ben closes his hand, and after a few seconds he's resting: every pirate goes for Ana's ship, and they keep
  // going for her. When she rests too, they sail in circles and wait, on both screens.
  await show(ben.page, ...FIST);
  await show(page, ...OPEN);
  await expectSoon(async () => (await teamView(ben.page)).resting, 15_000).toBe(true);
  await expectSoon(async () => (await teamView(page)).friend.resting, 5000).toBe(true);
  expect([(await teamView(page)).paused, (await teamView(ben.page)).paused]).toEqual([false, false]);
  await show(page, ...FIST);
  await expectSoon(async () => (await teamView(page)).paused, 15_000).toBe(true);
  await expectSoon(async () => (await teamView(ben.page)).paused, 5000).toBe(true);

  // The pirates that are left are beaten, one after another, in Ana's game: both win, together.
  await show(page, ...OPEN);
  await show(ben.page, ...OPEN);
  await page.evaluate(() => {
    window.__beating = setInterval(() => {
      const { battle } = window.__game;
      const pirate = battle.afloat.find((each) => !each.friend);
      if (pirate && battle.state === 'sailing') battle.beat(pirate);
    }, 700);
  });
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  await page.evaluate(() => clearInterval(window.__beating));
  for (const each of [page, ben.page]) await expect(each.locator('.friends-results li.is-racing')).toHaveCount(0);
  const [hers, ours] = [await teamView(page), await teamView(ben.page)];
  expect([hers.state, ours.state, hers.left, ours.left]).toEqual(['won', 'won', 0, 0]);
  expect([hers.beaten, ours.beaten]).toEqual([4, 4]);
  expect(hers.by.mine + hers.by.theirs).toBe(4);
  expect(ours.by).toEqual({ mine: hers.by.theirs, theirs: hers.by.mine });
  const ships = (count) => `${count} ${count === 1 ? 'ship' : 'ships'} beaten`;
  for (const [each, mine, theirs, friend] of [[page, hers.by.mine, hers.by.theirs, 'Ben'], [ben.page, ours.by.mine, ours.by.theirs, 'Ana']]) {
    await expect(each.locator('#screen-finish h2')).toHaveText('You saved the treasure together!');
    await expect(each.locator('#finish-hero')).toHaveText('4');
    await expect(each.locator('.finish-hero')).toContainText('beaten together');
    await expect(each.locator('.friends-results li')).toHaveCount(2);
    await expect(each.locator('.friends-results li.is-you')).toContainText(`You ${ships(mine)}`);
    await expect(each.locator('.friends-results li:not(.is-you)')).toContainText(`${friend} ${ships(theirs)}`);
    // Nobody is first or second: they're on the same side.
    await expect(each.locator('.friends-results .friends-place').first()).toBeHidden();
  }
  await page.waitForTimeout(500);
  await shot(page, 'bay-together-finish');
  await ben.page.screenshot({ path: 'test-results/screens/bay-together-finish-ben.png' });

  // Nobody's own level moves on, nobody's settings change, and the only connection was to the race server.
  expect(hers.ownLevel).toBe(3);
  expect(ours.ownLevel).toBe(1);
  expect(await ben.page.evaluate(() => [window.__game.session.settings.bayShips, window.__game.session.settings.bayPace, window.__game.session.settings.bayFriends])).toEqual([9, 'fast', 'against']);
  expect(await page.evaluate(() => window.__game.session.settings.bayPirates)).toBe('tough');
  expect(sockets).toEqual([`ws://localhost:${Number(new URL(test.info().project.use.baseURL).port) + 1}/room/cannon-bay/${code}?make=1`]);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('together, a friend who goes leaves whoever made the battle to finish it, with half the hits still to make', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openGame(page, { bayShips: 4 }, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await openGame(ben.page, {}, GAME, `#bay=${code}`);
  await bothPlaying(page, ben.page);
  await expectSoon(async () => (await teamView(ben.page)).pirates.length, 10_000).toBeGreaterThan(0);
  const before = await teamView(page);
  expect(before.friend.ally).toBe(true);
  expect(before.pirates.every(({ maxHits }) => maxHits === 60)).toBe(true);
  await ben.context.close();
  await expectSoon(async () => (await teamView(page)).friend, 20_000).toBe(null);
  const alone = await teamView(page);
  expect([alone.state, alone.total, alone.runs]).toEqual(['sailing', 4, true]);
  expect(alone.pirates.every(({ maxHits }) => maxHits <= 30)).toBe(true);
  await expect(page.locator('.mark[data-friend="yes"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__game.session.screen)).toBe('playing');
});

test('together on Medium, as it comes, the two can lose together: when the friend\'s ship is sunk, it ends on both screens', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openGame(page, { bayShips: 4, bayPirates: undefined }, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await openGame(ben.page, { bayPirates: undefined }, GAME, `#bay=${code}`);
  await bothPlaying(page, ben.page);
  expect(await ben.page.evaluate(() => window.__game.battle.level.canLose)).toBe(true);
  // Ben's ship is hit five times over, on his own screen, which is where that's decided.
  await ben.page.evaluate(() => {
    const { battle } = window.__game;
    for (let i = 0; i < 5; i += 1) battle.hurt({ to: { x: battle.x, z: battle.z } });
  });
  await waitForScreen(ben.page, 'finish');
  await waitForScreen(page, 'finish');
  for (const each of [page, ben.page]) {
    await expect(each.locator('#screen-finish h2')).toHaveText('The pirates got the treasure this time!');
    await expect(each.locator('#play-again')).toHaveText('Try again');
    expect(await each.evaluate(() => window.__game.session.levels.current)).toBe(1);
  }
  await page.waitForTimeout(400);
  await shot(page, 'c-lost-together');
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('together, if whoever made the battle goes, their friend\'s game takes the pirates over as they are, and they carry on', async ({ page, browser }) => {
  test.setTimeout(300_000);
  // Ben makes it this time, in the other browser, and the child here is the friend.
  const ben = await secondPlayer(browser);
  await openGame(ben.page, { bayShips: 4 }, GAME);
  const code = await makeGame(ben.page, 'Ben');
  await openGame(page, {}, GAME, `#bay=${code}`);
  await bothPlaying(ben.page, page);
  await expectSoon(async () => (await teamView(page)).pirates.length, 10_000).toBeGreaterThan(0);
  const before = await teamView(page);
  expect([before.runs, before.total, before.waiting]).toEqual([false, 4, 0]);
  await ben.context.close();
  await expectSoon(async () => (await teamView(page)).runs, 20_000).toBe(true);
  const mine = await teamView(page);
  expect([mine.state, mine.friend, mine.total]).toEqual(['sailing', null, 4]);
  // The pirate ships that were there are still there, now this game's to run, and the rest are still to come.
  expect(mine.pirates.map(({ index }) => index)).toEqual(expect.arrayContaining(before.pirates.map(({ index }) => index)));
  expect(mine.pirates.length + mine.waiting + mine.beaten).toBe(4);
  // And they go on sailing about, after this ship now.
  await expectSoon(async () => {
    const now = await teamView(page);
    return Math.max(...now.pirates.map((pirate) => {
      const was = mine.pirates.find(({ index }) => index === pirate.index);
      return was ? Math.hypot(pirate.x - was.x, pirate.z - was.z) : 0;
    }));
  }, 20_000).toBeGreaterThan(40);
  expect(await page.evaluate(() => window.__game.session.screen)).toBe('playing');
});

test('a game is for two: a third friend is told it already has two players', async ({ page, browser }) => {
  await openGame(page, {}, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await openGame(ben.page, {}, GAME, `#bay=${code}`);
  await expect(page.locator('#friends-here li')).toHaveCount(2);
  const cara = await secondPlayer(browser);
  await openGame(cara.page, {}, GAME, `#bay=${code}`);
  await expect(cara.page.locator('#friends-status')).toHaveText('That game already has 2 players.');
  await expect(page.locator('#friends-here li')).toHaveCount(2);
  for (const each of [ben, cara]) {
    expect(each.errors).toEqual([]);
    await each.context.close();
  }
});

test('resting is never punished: with both hands resting nobody fires, nothing is lost, and equal points share the win', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openGame(page, { bayShips: 6, bayFriends: 'against' }, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await openGame(ben.page, {}, GAME, `#bay=${code}`);
  await nameIs(ben.page, 'Ben');
  // Each hand goes out of view once its hand check is done, and stays out.
  await bothPlaying(page, ben.page, [NO_HAND, NO_HAND]);
  expect((await view(page)).duel.seconds).toBe(180);
  await page.waitForTimeout(6000);
  const [ana, his] = [await view(page), await view(ben.page)];
  // A hand that can't be seen never fires, the sails stay down, and both ships are still there.
  expect([ana.shots, his.shots]).toEqual([0, 0]);
  expect([ana.duel.mine, ana.duel.theirs, his.duel.mine, his.duel.theirs]).toEqual([0, 0, 0, 0]);
  expect(ana.me.sails).toBeLessThan(0.05);
  expect([ana.friend.state, his.friend.state]).toEqual(['sailing', 'sailing']);
  expect([ana.state, his.state]).toEqual(['sailing', 'sailing']);
  await timeUp(page, ben.page);
  await expect(page.locator('#screen-finish h2')).toHaveText('You both won!');
  await expect(ben.page.locator('#screen-finish h2')).toHaveText('You both won!');
  await expect(page.locator('.friends-results li').nth(0)).toContainText(/1st\s+You\s+0 hits/);
  await expect(page.locator('.friends-results li').nth(1)).toContainText(/1st\s+Ben\s+0 hits/);
  await expect(ben.page.locator('.friends-results li').nth(1)).toContainText(/1st\s+Ana\s+0 hits/);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('a friend who goes in the middle ends the battle for the other, who can play on their own again', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openGame(page, { bayFriends: 'against' }, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await openGame(ben.page, {}, GAME, `#bay=${code}`);
  await bothPlaying(page, ben.page);
  await ben.context.close();
  await waitForScreen(page, 'finish');
  await expect(page.locator('.friends-results')).toBeVisible();
  await expect(page.locator('#screen-finish h2')).toHaveText('You won!');
  expect((await view(page)).friend).toBe(null);
  // On their own again: pirates, and nothing more sent.
  await page.locator('#friends-leave').evaluate((button) => button.click());
  await show(page, ...OPEN);
  await page.locator('#play-again').click();
  await waitForScreen(page, 'playing');
  const alone = await view(page);
  expect(alone.duel).toBe(null);
  expect(alone.pirates).toBeGreaterThan(0);
  await expect(page.locator('#bay-left')).toBeVisible();
  await expect(page.locator('#duel-mine-chip')).toBeHidden();
});

test('on their own, it\'s the battle with the pirates as always, and nothing connects anywhere', async ({ page }) => {
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await openGame(page, { bayShips: 4 }, GAME);
  await expect(page.locator('#friends-toggle')).toHaveText('Play with a friend');
  await show(page, ...OPEN);
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
  const alone = await view(page);
  expect(alone.duel).toBe(null);
  expect(alone.friend).toBe(null);
  expect(alone.pirates).toBeGreaterThan(0);
  await expect(page.locator('#bay-left')).toBeVisible();
  await expect(page.locator('#hearts')).toBeVisible();
  for (const chip of ['#duel-mine-chip', '#duel-theirs-chip', '#duel-time']) await expect(page.locator(chip)).toBeHidden();
  await expect(page.locator('#story-line')).toContainText('Pirates want our treasure');
  expect(sockets).toEqual([]);
});
