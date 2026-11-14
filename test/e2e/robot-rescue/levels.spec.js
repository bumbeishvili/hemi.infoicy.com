// Robot Rescue's levels, with real photos going through the real tracker. What a level changes is in
// levelPlan in rescue.js, and its numbers are checked in test/unit/robot-rescue.test.js.
import { expect, shot, show, test, waitForScreen } from '../helpers.js';
import { GAME, NO_HAND, OPEN, clearHere, expectSoon, reachRescue, rescue, startHunting, stayAwake, stopHunting } from './helpers.js';

const atLevel = (level, settings = {}) => ({ levels: { [GAME]: level }, ...settings });

/** Counts what the rules say is happening, from now on. */
const countEvents = (page) => page.evaluate(() => {
  const { mission } = window.__game;
  window.__seen = {};
  const real = mission.onEvent;
  mission.onEvent = (event) => {
    const name = event.type === 'robot' ? `robot-${event.robot.kind}` : event.type === 'windup' && event.again ? 'second-throw' : event.type;
    window.__seen[name] = (window.__seen[name] ?? 0) + 1;
    real(event);
  };
});
const seen = (page) => page.evaluate(() => window.__seen);

test('level 10: drones swoop, peekers hop, rollers roll, every new kind of robot comes out, and it can still be finished', async ({ page }) => {
  test.setTimeout(420_000);
  await reachRescue(page, atLevel(10, { stops: 3, reach: 'lots', pace: 'fast' }));
  await expect(page.locator('#level-badge')).toHaveText('Level 10 of 10');
  expect(await page.evaluate(() => window.__game.mission.levelNumber)).toBe(10);
  await countEvents(page);
  await startHunting(page);
  let shown = { swoop: false, roller: false, hop: false, big: false };
  const bigAt = [];
  await expect.poll(async () => {
    const state = await page.evaluate(() => {
      const { mission, stage } = window.__game;
      const views = [...stage.views.values()];
      return {
        screen: window.__game.screen,
        place: mission.place?.id,
        swooping: mission.robots.some(({ kind, dive }) => kind === 'drone' && dive > 0.6),
        hopping: mission.robots.some(({ state, hop }) => state === 'hopping' && hop > 0.3 && hop < 0.7),
        roller: views.some((view) => view.robot.kind === 'roller' && view.holder && view.root.parent),
        big: mission.robots.find(({ kind }) => kind === 'big')?.x ?? null,
      };
    });
    for (const [name, now] of [['swoop', state.swooping], ['hop', state.hopping], ['roller', state.roller]]) {
      if (now && !shown[name]) {
        shown[name] = true;
        await shot(page, `robot-rescue-level10-${name}`);
      }
    }
    if (state.big !== null) bigAt.push(state.big);
    if (state.place === 'tower' && !shown.big && bigAt.length > 20) {
      shown.big = true;
      await shot(page, 'robot-rescue-level10-big-one');
    }
    return state.screen;
  }, { timeout: 390_000, intervals: [250] }).toBe('finish');
  await stopHunting(page);
  const events = await seen(page);
  console.log('what happened at level 10', JSON.stringify(events), 'big one between', Math.min(...bigAt), Math.max(...bigAt));
  expect(events.swoop).toBeGreaterThan(0);
  expect(events.hop).toBeGreaterThan(0);
  expect(events['robot-roller']).toBeGreaterThan(0);
  expect(events['second-throw'] ?? 0).toBeGreaterThan(0);
  expect(Math.max(...bigAt) - Math.min(...bigAt)).toBeGreaterThan(0.5);
  expect(shown.roller).toBe(true);
  // What the higher levels brought, all in the one game.
  for (const kind of ['lid', 'splitter', 'mini', 'keybot', 'carrier']) expect(events[`robot-${kind}`] ?? 0, kind).toBeGreaterThan(0);
  for (const type of ['prize', 'power', 'chest-open', 'pal-freed']) expect(events[type] ?? 0, type).toBeGreaterThan(0);
  await expect(page.locator('#screen-finish h2')).toHaveText('You saved everyone!');
  await expect(page.locator('#level-done-text')).toHaveText('All 10 levels done!');
  const stats = await page.evaluate(() => window.__game.mission.stats);
  await expect(page.locator('#sum-right-prizes')).toContainText(`🔩 ${stats.bolts}`);
  await expect(page.locator('#sum-right-prizes')).toContainText(`🤗 ${stats.pals}`);
  await page.waitForTimeout(700);
  await shot(page, 'robot-rescue-level10-finish');
});

test('a higher level on Gentle still can\'t be lost, and winning it moves on to the next', async ({ page }) => {
  test.setTimeout(150_000);
  await reachRescue(page, atLevel(4), NO_HAND);
  await stayAwake(page);
  for (let i = 0; i < 5; i += 1) {
    await page.evaluate(() => {
      const { mission } = window.__game;
      const robot = mission.robots.find(({ kind }) => kind !== 'big');
      mission.throwGoo(robot);
      mission.goo.forEach((goo) => {
        goo.t = 0.99;
      });
    });
    await page.waitForTimeout(150);
  }
  expect((await rescue(page)).hearts).toBe(1);
  expect(await page.evaluate(() => window.__game.screen)).toBe('playing');
  await show(page, ...OPEN);
  for (const place of ['canal', 'harbour', 'farm', 'tower']) {
    await clearHere(page);
    await expectSoon(async () => (await rescue(page)).place).toBe(place);
  }
  await clearHere(page);
  await waitForScreen(page, 'finish');
  await expect(page.locator('#level-done-text')).toHaveText('Level 4 done! Next: level 5');
  await expect(page.locator('#play-again')).toHaveText('Next level');
});

test('running out of hearts on Tough tries the same level again', async ({ page }) => {
  test.setTimeout(150_000);
  await reachRescue(page, atLevel(6, { rescueGoo: 'tough' }), NO_HAND);
  await stayAwake(page);
  await page.evaluate(() => {
    const { mission } = window.__game;
    for (let i = 0; i < 3; i += 1) {
      mission.throwGoo(mission.robots.find(({ kind }) => kind !== 'big'));
    }
    mission.goo.forEach((goo) => {
      goo.t = 0.99;
    });
  });
  await waitForScreen(page, 'finish');
  await expect(page.locator('#screen-finish h2')).toHaveText('The goo stopped the tram!');
  await expect(page.locator('#play-again')).toHaveText('Try again');
  await expect(page.locator('#level-done-text')).toHaveText('Let’s try level 6 again!');
  await page.waitForTimeout(600);
  await shot(page, 'robot-rescue-level6-so-close');
  await show(page, ...OPEN);
  await page.locator('#play-again').click();
  await waitForScreen(page, 'playing');
  expect(await page.evaluate(() => window.__game.mission.levelNumber)).toBe(6);
});

test('level 10 with reduced motion still works, and the level\'s new movers don\'t bob or sway', async ({ page }) => {
  test.setTimeout(240_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await reachRescue(page, atLevel(10, { reach: 'lots', pace: 'fast' }));
  const roller = await page.evaluate(() => {
    const { mission, stage } = window.__game;
    const robot = mission.spawn('roller');
    return [...stage.views.values()].some((view) => view.robot === robot);
  });
  expect(roller).toBe(true);
  await startHunting(page);
  await expectSoon(async () => (await rescue(page)).stats.robots, { timeout: 60_000 }).toBeGreaterThan(0);
  const still = await page.evaluate(async () => {
    const { stage } = window.__game;
    let most = 0;
    for (let i = 0; i < 60; i += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      for (const view of stage.views.values()) if (view.robot.kind === 'roller') most = Math.max(most, Math.abs(view.lift.position.y));
    }
    return { most, panned: stage.panX };
  });
  await stopHunting(page);
  expect(still.most).toBe(0);
  expect(still.panned).toBe(0);
  await shot(page, 'robot-rescue-level10-reduced-motion');
});
