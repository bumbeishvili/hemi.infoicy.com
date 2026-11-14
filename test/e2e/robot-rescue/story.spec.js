// The goo, the friends and the whole of the rescue, with real photos going through the real tracker.
import { expect, openGame, shot, show, test, waitForHand, waitForScreen } from '../helpers.js';
import { FIST, NO_HAND, OPEN, clearHere, expectSoon, reachRescue, rescue, startHunting, stayAwake, stopHunting, throwOneGoo } from './helpers.js';

test('a real closed hand stops the goo, and it costs nothing', async ({ page }) => {
  test.setTimeout(150_000);
  await reachRescue(page, {}, FIST);
  await waitForHand(page, 'closed');
  await stayAwake(page);
  const { hearts } = await rescue(page);
  const seconds = await throwOneGoo(page);
  await page.waitForTimeout(seconds * 600);
  await shot(page, 'x-goo-coming-shield');
  await expectSoon(async () => (await rescue(page)).stats.gooBlocked, { timeout: 15_000 }).toBe(1);
  await page.waitForTimeout(150);
  await shot(page, 'x-goo-on-shield');
  const after = await rescue(page);
  expect(after.hearts).toBe(hearts);
  expect(after.stats.gooHits).toBe(0);
});

test('with no shield up the goo costs a heart, and leaves a splat in the corner', async ({ page }) => {
  test.setTimeout(150_000);
  await reachRescue(page, {}, NO_HAND);
  await stayAwake(page);
  const { hearts } = await rescue(page);
  const seconds = await throwOneGoo(page);
  await page.waitForTimeout(seconds * 700);
  await shot(page, 'x-goo-coming');
  await expectSoon(async () => (await rescue(page)).stats.gooHits, { timeout: 15_000 }).toBe(1);
  await page.waitForTimeout(200);
  await shot(page, 'x-goo-splat');
  expect((await rescue(page)).hearts).toBe(hearts - 1);
  await expect(page.locator('#chip-hearts .heart.is-gone')).toHaveCount(1);
  const corners = await page.evaluate(() => window.__game.stage.sights.corners.map(({ x, y, size }) => ({ x, y, size })));
  expect(corners.length).toBe(1);
  // Small, and well away from the middle of the view.
  expect(corners[0].size).toBeLessThan(0.1);
  expect(Math.max(Math.abs(corners[0].x - 0.5), Math.abs(corners[0].y - 0.5))).toBeGreaterThan(0.2);
});

test('goo can be shot out of the air by a real open hand', async ({ page }) => {
  test.setTimeout(150_000);
  await reachRescue(page, { reach: 'lots' });
  await page.evaluate(() => {
    const { mission } = window.__game;
    mission.holdThrows = 9999;
    mission.queue = [];
    // Everyone stays where they are, far from where the goo will come through.
    for (const robot of [...mission.robots].slice(1)) mission.drop(robot);
    mission.robots[0].hp = 999;
    mission.robots[0].maxHp = 999;
  });
  await throwOneGoo(page);
  await page.evaluate(() => {
    // Only the goo counts for now, so that this is about the goo.
    const { mission } = window.__game;
    const real = mission.targets.bind(mission);
    mission.targets = () => real().filter(({ kind }) => kind === 'goo');
  });
  await startHunting(page);
  await expectSoon(async () => (await rescue(page)).stats.gooShot, { timeout: 15_000 }).toBe(1);
  await stopHunting(page);
  const { stats } = await rescue(page);
  expect(stats.gooHits).toBe(0);
});

test('on Gentle a child can\'t lose, however much goo lands', async ({ page }) => {
  test.setTimeout(240_000);
  await reachRescue(page, {}, NO_HAND);
  await stayAwake(page);
  for (let i = 0; i < 5; i += 1) {
    const before = (await rescue(page)).stats.gooHits;
    await page.evaluate(() => {
      const { mission } = window.__game;
      mission.goo.forEach((goo) => {
        goo.t = 0.99;
      });
    });
    await throwOneGoo(page);
    await page.evaluate(() => {
      window.__game.mission.goo.forEach((goo) => {
        goo.t = 0.99;
      });
    });
    await expectSoon(async () => (await rescue(page)).stats.gooHits, { timeout: 15_000 }).toBeGreaterThan(before);
  }
  const after = await rescue(page);
  expect(after.hearts).toBe(1);
  expect(after.phase).not.toBe('lost');
  expect(await page.evaluate(() => window.__game.screen)).toBe('playing');
  await expect(page.locator('#chip-hearts .heart:not(.is-gone)')).toHaveCount(1);
});

test('on Tough, running out of hearts ends it kindly, and they can go again straight away', async ({ page }) => {
  test.setTimeout(240_000);
  await reachRescue(page, { rescueGoo: 'tough' }, NO_HAND);
  await stayAwake(page);
  for (let i = 0; i < 3; i += 1) {
    await throwOneGoo(page);
    const before = (await rescue(page)).hearts;
    await page.evaluate(() => {
      window.__game.mission.goo.forEach((goo) => {
        goo.t = 0.99;
      });
    });
    await expectSoon(async () => (await rescue(page)).hearts, { timeout: 15_000 }).toBe(before - 1);
  }
  await waitForScreen(page, 'finish');
  // The card says what happened in the story, and the big button is to try again.
  await expect(page.locator('#screen-finish h2')).toHaveText('The goo stopped the tram!');
  await expect(page.locator('#play-again')).toHaveText('Try again');
  await expect(page.locator('#level-done-text')).toHaveText('Let’s try level 1 again!');
  // What's counted is what was done, not what wasn't.
  await expect(page.locator('.finish-hero')).toContainText(/robots? dropped/);
  await page.waitForTimeout(600);
  await shot(page, 'x-so-close');
  await show(page, ...OPEN);
  await page.locator('#play-again').click();
  await waitForScreen(page, 'playing');
  const again = await rescue(page);
  expect(again.hearts).toBe(3);
  expect(again.index).toBe(0);
  expect(again.robots).toBeGreaterThan(0);
  expect(again.stats.robots).toBe(0);
});

test('as it comes, the goo can win: five hits stop the tram at level 3, and level 3 comes round again', async ({ page }) => {
  test.setTimeout(240_000);
  // Without the test helpers' Gentle, as a child would find it.
  await openGame(page, { levels: { 'robot-rescue': 3 } }, 'robot-rescue');
  await show(page, ...OPEN);
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
  await show(page, ...NO_HAND);
  expect(await page.evaluate(() => [window.__game.session.settings.rescueGoo, window.__game.mission.level.canLose])).toEqual(['medium', true]);
  await stayAwake(page);
  for (let i = 0; i < 5; i += 1) {
    await throwOneGoo(page);
    const before = (await rescue(page)).hearts;
    await page.evaluate(() => window.__game.mission.goo.forEach((goo) => { goo.t = 0.99; }));
    await expectSoon(async () => (await rescue(page)).hearts, { timeout: 15_000 }).toBe(before - 1);
  }
  await waitForScreen(page, 'finish');
  await expect(page.locator('#screen-finish h2')).toHaveText('The goo stopped the tram!');
  await expect(page.locator('#play-again')).toHaveText('Try again');
  await expect(page.locator('#level-done-text')).toHaveText('Let’s try level 3 again!');
  await page.waitForTimeout(600);
  await shot(page, 'x-goo-won');
  // No confetti for losing.
  expect(await page.evaluate(() => window.__game.session.hud.confetti.running)).toBe(false);
  await show(page, ...OPEN);
  await page.locator('#play-again').click();
  await waitForScreen(page, 'playing');
  expect(await page.evaluate(() => window.__game.mission.levelNumber)).toBe(3);
});

test('resting stops the throwing, and the robots wave', async ({ page }) => {
  test.setTimeout(150_000);
  await reachRescue(page, { rescueGoo: 'tough' }, NO_HAND);
  await page.evaluate(() => {
    const { mission } = window.__game;
    mission.holdThrows = 0;
  });
  await expectSoon(async () => (await rescue(page)).resting, { timeout: 15_000 }).toBe(true);
  const before = await rescue(page);
  await page.waitForTimeout(800);
  await shot(page, 'x-resting');
  const waving = await page.evaluate(() => [...window.__game.stage.views.values()].filter((view) => view.robot.kind === 'walker').map((view) => view.waving));
  expect(Math.max(...waving, 1)).toBeGreaterThan(0.5);
  await page.waitForTimeout(5000);
  const after = await rescue(page);
  expect(after.goo).toBe(0);
  expect(after.hearts).toBe(before.hearts);
  expect(after.stats.gooHits).toBe(before.stats.gooHits);
  expect(after.phase).toBe('fighting');
  // And a hand that's come back ends it at once.
  await show(page, ...OPEN);
  await waitForHand(page, 'open');
  await expectSoon(async () => (await rescue(page)).resting, { timeout: 5000 }).toBe(false);
});

test('a closed hand held for a while is a rest too, and it\'s told so', async ({ page }) => {
  test.setTimeout(150_000);
  await reachRescue(page, {}, FIST);
  await waitForHand(page, 'closed');
  await expectSoon(async () => (await rescue(page)).resting, { timeout: 15_000 }).toBe(true);
  await expect(page.locator('#prompt-text')).toContainText('Resting is OK', { timeout: 10_000 });
  await shot(page, 'x-resting-closed');
});

test('freeing a friend thanks the child, and moves on to the next place, where robots are waiting', async ({ page }) => {
  test.setTimeout(150_000);
  await reachRescue(page);
  await clearHere(page);
  await expect(page.locator('#story-line')).toHaveText('Oink! You saved me!', { timeout: 10_000 });
  await expect(page.locator('#story')).toHaveAttribute('data-who', 'truffle');
  await expect(page.locator('#chip-friends')).toHaveText('1 of 5');
  await expectSoon(async () => (await rescue(page)).freed).toBe(1);
  await page.waitForTimeout(350);
  await shot(page, 'x-freed');
  const start = await page.evaluate(() => window.__game.stage.rig.position.z);
  const cleared = Date.now();
  await expectSoon(async () => (await rescue(page)).phase).toBe('moving');
  expect(Date.now() - cleared).toBeLessThan(3000);
  // The next robots are already on their way, while the tram is still going.
  const moving = await rescue(page);
  expect(moving.place).toBe('canal');
  expect(moving.robots).toBeGreaterThan(2);
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => window.__game.stage.rig.position.z)).toBeLessThan(start);
  await shot(page, 'x-moving');
  await expectSoon(async () => (await rescue(page)).phase).toBe('fighting');
  expect(Date.now() - cleared).toBeLessThan(6500);
  await page.waitForTimeout(500);
  await shot(page, 'x-canal');
});

test('the whole rescue can be finished with a real hand, opening to fire and closing to reload', async ({ page }) => {
  test.setTimeout(420_000);
  await reachRescue(page, { stops: 3, reach: 'lots', pace: 'fast' });
  await startHunting(page);
  await expect(page.locator('#story-line')).toHaveText(/Help/, { timeout: 5000 });
  let seenBig = false;
  await expect.poll(async () => {
    const state = await rescue(page);
    if (state.place === 'tower' && state.phase === 'fighting' && !seenBig) {
      seenBig = true;
      await page.waitForTimeout(2500);
      await shot(page, 'x-big-one');
    }
    return page.evaluate(() => window.__game.screen);
  }, { timeout: 390_000, intervals: [500] }).toBe('finish');
  await stopHunting(page);
  await expect(page.locator('#screen-finish h2')).toHaveText('You saved everyone!');
  await expect(page.locator('#finish-hero')).toHaveText('3');
  await expect(page.locator('#sum-right-friends')).toHaveText('3');
  const robots = Number(await page.locator('#sum-right-robots').textContent());
  expect(robots).toBeGreaterThan(15);
  const openings = Number(await page.locator('#sum-right-openings').textContent());
  expect(openings).toBeGreaterThan(1);
  await expect(page.locator('#sum-right-open')).toHaveText(/^\d:\d\d/);
  await page.waitForTimeout(800);
  await shot(page, 'x-finish');
});

test('the big one only takes hits in a weak spot that has opened, and takes its helpers with it', async ({ page }) => {
  test.setTimeout(240_000);
  await reachRescue(page, { stops: 3, reach: 'lots' });
  for (const place of ['harbour', 'tower']) {
    await clearHere(page);
    await expectSoon(async () => (await rescue(page)).place).toBe(place);
    await expectSoon(async () => (await rescue(page)).phase).toBe('fighting');
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(1000);
  await shot(page, 'x-big-first-spot');
  const seen = await page.evaluate(() => {
    const { mission, stage } = window.__game;
    const big = mission.robots.find(({ kind }) => kind === 'big');
    return {
      open: big.spots.filter(({ open }) => open).length,
      total: big.spots.length,
      canAimAt: mission.targets().includes(big),
      onScreen: (stage.targetsOnScreen ?? []).filter(({ ref }) => ref.kind === 'spot').length,
    };
  });
  expect(seen.open).toBe(1);
  expect(seen.total).toBe(3);
  expect(seen.canAimAt).toBe(false);
  // Finished off from here, so that this is about what comes next.
  await page.evaluate(() => {
    const { mission } = window.__game;
    const big = mission.robots.find(({ kind }) => kind === 'big');
    mission.pace = { ...mission.pace, atOnce: 5 };
    for (const spot of big.spots.slice(0, -1)) {
      spot.open = true;
      spot.hp = 1;
      mission.hitSpot(spot);
    }
  });
  await page.waitForTimeout(300);
  await shot(page, 'x-big-damaged');
  await page.evaluate(() => {
    const { mission } = window.__game;
    const big = mission.robots.find(({ kind }) => kind === 'big');
    const last = big.spots.at(-1);
    last.open = true;
    last.hp = 1;
    mission.hitSpot(last);
  });
  await page.waitForTimeout(180);
  await shot(page, 'x-big-falling');
  const after = await rescue(page);
  expect(after.robots).toBe(0);
  await expect(page.locator('#story-line')).toHaveText('Hooray! We’re all free!', { timeout: 5000 });
  await page.waitForTimeout(1200);
  await shot(page, 'x-party');
  await waitForScreen(page, 'finish');
});
