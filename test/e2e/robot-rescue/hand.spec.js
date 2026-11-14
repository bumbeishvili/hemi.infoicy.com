// What the hand does in Robot Rescue, with real photos going through the real tracker.
import { expect, hands, shot, show, test, waitForHand } from '../helpers.js';
import { moveGloveTo, stopMoving } from '../story-games/helpers.js';
import { FIST, NO_HAND, expectSoon, reachRescue, rescue, startHunting, stopHunting } from './helpers.js';

const GLOVE = ['stage', 'gloves', 'right'];

test('a real open hand on a robot fires at it, and drops it', async ({ page }) => {
  test.setTimeout(180_000);
  await reachRescue(page, { reach: 'lots' });
  await startHunting(page);
  await expectSoon(async () => (await rescue(page)).firing).toBe(true);
  await shot(page, 'x-firing');
  expect((await rescue(page)).locked).toBeTruthy();
  await expectSoon(async () => (await rescue(page)).stats.robots, { timeout: 60_000 }).toBeGreaterThan(0);
  const { stats } = await rescue(page);
  expect(stats.shots).toBeGreaterThan(2);
  await shot(page, 'x-dropped');
  await stopHunting(page);
});

test('a real closed hand doesn\'t fire: it raises the shield and reloads', async ({ page }) => {
  test.setTimeout(150_000);
  await reachRescue(page, { reach: 'lots' });
  await startHunting(page);
  await expectSoon(async () => (await rescue(page)).firing).toBe(true);
  await stopHunting(page);
  await page.evaluate(() => {
    window.__game.mission.blaster.charge = 0.2;
  });
  await show(page, ...FIST);
  await waitForHand(page, 'closed');
  await expectSoon(async () => (await rescue(page)).shield, { timeout: 10_000 }).toBe(true);
  // The meter says what a closed hand is doing here, rather than asking it to open.
  const word = () => page.locator('#meter-right .meter-word').evaluate((node) => getComputedStyle(node, '::after').content);
  await expect.poll(word, { timeout: 5000 }).toBe('"Shield"');
  const { stats: before } = await rescue(page);
  await expectSoon(async () => (await rescue(page)).charge, { timeout: 3000 }).toBe(1);
  const during = await rescue(page);
  // A shot already on its way when the hand closed is the only thing that might still land.
  await page.waitForTimeout(1500);
  const after = await rescue(page);
  expect(after.stats.shots).toBe(before.shots);
  expect(after.firing).toBe(false);
  expect(after.shieldLevel).toBe(1);
  expect(during.stats.reloads).toBe(1);
  await shot(page, 'x-shield-up');
});

test('reloading takes well under a second from when the hand reads as closed', async ({ page }) => {
  await reachRescue(page);
  const seconds = await page.evaluate(async () => {
    const { mission } = window.__game;
    mission.blaster.charge = 0;
    window.__camera.show({ left: null, right: 'fist', scale: 0.7 });
    await new Promise((resolve) => {
      const wait = setInterval(() => {
        if (window.__game.monitor.snapshot.right.reason === 'closed') {
          clearInterval(wait);
          resolve();
        }
      }, 10);
    });
    const from = performance.now();
    await new Promise((resolve) => {
      const wait = setInterval(() => {
        if (mission.blaster.charge >= 1) {
          clearInterval(wait);
          resolve();
        }
      }, 10);
    });
    return (performance.now() - from) / 1000;
  });
  expect(seconds).toBeLessThan(0.95);
});

test('a hand out of view does neither, and says so', async ({ page }) => {
  test.setTimeout(150_000);
  await reachRescue(page, { reach: 'lots' });
  await startHunting(page);
  await expectSoon(async () => (await rescue(page)).firing).toBe(true);
  await stopHunting(page);
  await page.evaluate(() => {
    window.__game.mission.blaster.charge = 0.5;
  });
  await show(page, ...NO_HAND);
  await waitForHand(page, 'missing');
  await page.waitForTimeout(400);
  const before = await rescue(page);
  await page.waitForTimeout(2000);
  const after = await rescue(page);
  expect(after.stats.shots).toBe(before.stats.shots);
  expect(after.firing).toBe(false);
  expect(after.shield).toBe(false);
  expect(after.charge).toBe(before.charge);
  expect(after.seen).toBe(false);
  await expect(page.locator('#prompt-text')).toContainText('right hand', { timeout: 10_000 });
  await shot(page, 'x-no-hand');
});

test('a hand half out of the picture does neither, however open it is', async ({ page }) => {
  test.setTimeout(150_000);
  await reachRescue(page, { reach: 'lots' });
  await page.evaluate(() => {
    window.__game.mission.blaster.charge = 0.5;
  });
  await show(page, null, 'open', { rightOffsetX: 290 });
  await expect.poll(async () => (await hands(page)).right.reason, { timeout: 15_000 }).toBe('edge');
  await page.waitForTimeout(300);
  const before = await rescue(page);
  await page.waitForTimeout(1500);
  const after = await rescue(page);
  expect(after.stats.shots).toBe(before.stats.shots);
  expect(after.shield).toBe(false);
  expect(after.charge).toBe(before.charge);
  await shot(page, 'x-edge');
});

test('the crosshair goes where the hand goes, and more reach help pulls it further', async ({ page }) => {
  test.setTimeout(180_000);
  await reachRescue(page, { reach: 'none' });
  await page.evaluate(() => {
    const { mission } = window.__game;
    mission.queue = [];
    for (const robot of [...mission.robots]) if (robot.kind !== 'walker') mission.drop(robot);
    for (const robot of mission.robots.slice(1)) mission.drop(robot);
    mission.holdThrows = 9999;
  });
  // A long way from the only robot, nothing pulls it, and it doesn't fire.
  const robotAt = () => page.evaluate(() => {
    const [only] = window.__game.stage.targetsOnScreen ?? [];
    return only ? { x: only.x, y: only.y } : null;
  });
  await expectSoon(robotAt).not.toBeNull();
  const robot = await robotAt();
  const farX = robot.x > 640 ? 0.08 : 0.92;
  await moveGloveTo(page, GLOVE, farX, 0.72);
  await expectSoon(async () => Math.abs((await rescue(page)).aimX - farX * 1280), { timeout: 20_000 }).toBeLessThan(120);
  await stopMoving(page);
  const far = await rescue(page);
  expect(far.locked).toBeNull();
  expect(far.firing).toBe(false);
  // Move the setting right up, from the panel: now it's pulled onto it from further away.
  await page.evaluate(() => window.__game.session.changeSettings({ reach: 'lots' }));
  await page.evaluate(() => {
    window.__game.stage.help = { radius: 2, pull: 1 };
  });
  await expectSoon(async () => (await rescue(page)).locked, { timeout: 15_000 }).toBe('walker');
  await expectSoon(async () => (await rescue(page)).stats.shots, { timeout: 15_000 }).toBeGreaterThan(0);
});

test('the left hand works just the same, and the right hand does nothing', async ({ page }) => {
  test.setTimeout(180_000);
  await reachRescue(page, { hands: 'left', reach: 'lots' });
  await startHunting(page, 'left');
  await expectSoon(async () => (await rescue(page)).firing, { timeout: 45_000 }).toBe(true);
  await expectSoon(async () => (await rescue(page)).stats.robots, { timeout: 60_000 }).toBeGreaterThan(0);
  await shot(page, 'x-left-hand');
  await stopHunting(page);
  // Now only the other hand.
  await show(page, null, 'open', { scale: 0.7 });
  await expect.poll(async () => (await hands(page)).left.status, { timeout: 15_000 }).toBe('missing');
  await page.waitForTimeout(400);
  const before = await rescue(page);
  await page.waitForTimeout(1500);
  expect((await rescue(page)).stats.shots).toBe(before.stats.shots);
  await show(page, 'fist', null, { scale: 0.7 });
  await expect.poll(async () => (await rescue(page)).shield, { timeout: 15_000 }).toBe(true);
});

test('when it runs out, the child is told to close their hand, and the film comes back', async ({ page }) => {
  test.setTimeout(150_000);
  await reachRescue(page, { reach: 'lots' });
  await startHunting(page);
  await expectSoon(async () => (await rescue(page)).firing).toBe(true);
  await stopHunting(page);
  await page.evaluate(() => {
    window.__game.mission.blaster.charge = 0;
  });
  await expect(page.locator('#prompt-text')).toHaveText('Close your hand to reload!', { timeout: 15_000 });
  await shot(page, 'x-empty');
});

test('with reloading off it never runs out', async ({ page }) => {
  test.setTimeout(150_000);
  await reachRescue(page, { reach: 'lots', reloading: 'off' });
  await startHunting(page);
  await expectSoon(async () => (await rescue(page)).stats.shots, { timeout: 45_000 }).toBeGreaterThan(24);
  const { charge } = await rescue(page);
  expect(charge).toBe(1);
  await stopHunting(page);
});

test('the film shows what to do until the child has got the idea', async ({ page }) => {
  test.setTimeout(180_000);
  await reachRescue(page, { reach: 'lots' });
  await expect(page.locator('.film')).toBeVisible();
  await page.waitForTimeout(1400);
  await page.locator('.film').screenshot({ path: 'test-results/screens/x-film-1.png' });
  await page.waitForTimeout(1600);
  await page.locator('.film').screenshot({ path: 'test-results/screens/x-film-2.png' });
  await page.waitForTimeout(2000);
  await page.locator('.film').screenshot({ path: 'test-results/screens/x-film-3.png' });
  await page.waitForTimeout(800);
  await page.locator('.film').screenshot({ path: 'test-results/screens/x-film-4.png' });
  await startHunting(page);
  // It fires, runs out, closes and reloads, and then the film has done its job.
  await expectSoon(async () => (await rescue(page)).stats.reloads, { timeout: 60_000 }).toBeGreaterThan(0);
  await expect(page.locator('.film')).toBeHidden({ timeout: 10_000 });
  await stopHunting(page);
});

test('opening the panel stops everything, and has a way back to all the games', async ({ page }) => {
  await reachRescue(page);
  await page.locator('#open-panel').click();
  await expect(page.locator('#panel')).toBeVisible();
  await expect(page.locator('#panel-all-games')).toHaveAttribute('href', '../../index.html');
  for (const name of ['pace', 'reach', 'reloading', 'rescueGoo', 'stops']) {
    await expect(page.locator(`input[name="${name}"]:checked`), name).toHaveCount(1);
  }
  await page.locator('#panel').screenshot({ path: 'test-results/screens/x-panel.png' });
  const clock = () => page.evaluate(() => window.__game.mission.time);
  const before = await clock();
  await page.waitForTimeout(1200);
  expect(await clock()).toBe(before);
  await page.locator('input[name="reloading"][value="off"]').check();
  await page.locator('input[name="rescueGoo"][value="tough"]').check();
  await page.locator('#close-panel').click();
  const changed = await page.evaluate(() => {
    const { mission, session } = window.__game;
    return { reloading: mission.blaster.reloading, hearts: mission.level.hearts, saved: session.settings.rescueGoo };
  });
  expect(changed).toEqual({ reloading: false, hearts: 3, saved: 'tough' });
  await expect.poll(clock, { timeout: 5000 }).toBeGreaterThan(before);
});
