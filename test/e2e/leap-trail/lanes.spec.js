// Obstacles that fill one, two or all three lanes: one that leaves a lane free can be gone round by
// stepping into that lane, or jumped. One right across still needs a jump.
import { expect, shot, test, waitForScreen } from '../helpers.js';
import { nextObstacleIs, reachRun, runState, standAcross, standInView } from './helpers.js';

const coachShowing = (page) => page.evaluate(() => document.getElementById('coach').classList.contains('is-visible'));

test('stepping into a free lane goes round a one-lane obstacle, with no jump asked for or made', async ({ page }) => {
  test.setTimeout(120_000);
  await reachRun(page, { onMissed: 'stumble' });
  await nextObstacleIs(page, 'hay', 75, [0]);
  await page.waitForTimeout(700);
  await shot(page, 't40-one-lane-ahead');
  await standAcross(page, 0.09);
  await expect.poll(async () => (await runState(page)).lane, { timeout: 10_000 }).toBe(1);
  await expect.poll(async () => (await runState(page)).next?.gap ?? 0, { timeout: 15_000, intervals: [50] }).toBeLessThan(12);
  expect(await coachShowing(page)).toBe(false);
  expect(await page.evaluate(() => window.__game.world.cue.visible)).toBe(false);
  await shot(page, 't41-going-round');
  await expect.poll(async () => (await runState(page)).stats.cleared, { timeout: 10_000 }).toBe(1);
  const { stats } = await runState(page);
  expect([stats.stepped, stats.jumps, stats.bumps, stats.streak]).toEqual([1, 0, 0, 1]);
  await standInView(page);
});

test('in a lane the obstacle fills, a jump is asked for, and stepping out of its way puts that away', async ({ page }) => {
  test.setTimeout(120_000);
  await reachRun(page, { onMissed: 'stumble' });
  await nextObstacleIs(page, 'fence', 30, [0, 1]);
  await expect.poll(async () => (await runState(page)).next?.mustJump, { timeout: 10_000 }).toBe(true);
  await expect(page.locator('#coach-text')).toHaveText('Jump!');
  await shot(page, 't42-two-lanes-jump-asked');
  await standAcross(page, -0.09);
  await expect.poll(async () => (await runState(page)).lane, { timeout: 10_000 }).toBe(-1);
  await expect.poll(() => coachShowing(page), { timeout: 5000 }).toBe(false);
  await expect.poll(async () => (await runState(page)).stats.cleared, { timeout: 10_000 }).toBe(1);
  const { stats } = await runState(page);
  expect([stats.stepped, stats.bumps]).toEqual([1, 0]);
  await standInView(page);
});

test('one right across can\'t be gone round: in a side lane it still needs a jump', async ({ page }) => {
  test.setTimeout(120_000);
  await reachRun(page, { onMissed: 'stumble' });
  await nextObstacleIs(page, 'log', 60);
  await standAcross(page, 0.09);
  await expect.poll(async () => (await runState(page)).lane, { timeout: 10_000 }).toBe(1);
  await expect.poll(async () => (await runState(page)).next?.mustJump, { timeout: 10_000 }).toBe(true);
  await expect(page.locator('#coach-text')).toHaveText('Jump!');
  await expect.poll(async () => (await runState(page)).stats.bumps, { timeout: 10_000 }).toBe(1);
  expect((await runState(page)).stats.stepped).toBe(0);
  await standInView(page);
});

test('a jump still goes over one that leaves a lane free, from any lane', async ({ page }) => {
  await reachRun(page, { onMissed: 'stumble' });
  await nextObstacleIs(page, 'rocks', 20, [1]);
  await expect.poll(async () => (await runState(page)).next?.inReach, { timeout: 10_000 }).toBe(true);
  expect(await page.evaluate(() => window.__game.run.jump())).toBe(true);
  await expect.poll(async () => (await runState(page)).stats.cleared, { timeout: 8000 }).toBe(1);
  expect((await runState(page)).stats.stepped).toBe(0);
});

test('set to wait, the runner only waits at an obstacle in its own lane', async ({ page }) => {
  test.setTimeout(120_000);
  await reachRun(page, { onMissed: 'wait' });
  await nextObstacleIs(page, 'hay', 30, [-1]);
  await expect.poll(async () => (await runState(page)).stats.cleared, { timeout: 15_000 }).toBe(1);
  const { stats, waiting } = await runState(page);
  expect([stats.stepped, stats.bumps, waiting]).toEqual([1, 0, false]);
});

test('with the lanes off, every obstacle fills the middle, and a whole trail is jumped to the end', async ({ page }) => {
  test.setTimeout(240_000);
  await reachRun(page, { levels: { 'leap-trail': 10 }, obstacles: 10, trailLanes: 'no', onMissed: 'stumble' });
  const lanes = await page.evaluate(() => window.__game.run.course.map(({ lanes: filled }) => filled));
  expect(lanes.every((filled) => filled.includes(0))).toBe(true);
  expect(lanes.some((filled) => filled.length < 3)).toBe(true);
  await page.evaluate(() => {
    window.__perfect = setInterval(() => {
      const { run } = window.__game;
      if (run?.state === 'running' && run.mustJump) run.jump();
    }, 50);
  });
  await page.waitForTimeout(3000);
  await shot(page, 't43-lanes-off-narrow');
  await waitForScreen(page, 'finish');
  await page.evaluate(() => clearInterval(window.__perfect));
  const { stats } = await runState(page);
  expect([stats.cleared, stats.jumps, stats.stepped, stats.bumps]).toEqual([10, 10, 0, 0]);
  await expect(page.locator('#finish-line')).toContainText('cleared 10 of 10');
});

test('a run with some gone round says so on the finish card, and the count is still of all of them', async ({ page }) => {
  test.setTimeout(240_000);
  await reachRun(page, { obstacles: 10, trailPace: 'fast', onMissed: 'stumble' });
  // Every obstacle leaves the right lane free, and the child stands in it the whole way.
  await page.evaluate(() => {
    const { run, world } = window.__game;
    for (const obstacle of run.course) {
      obstacle.lanes = obstacle.kind === 'stream' ? [-1, 0, 1] : [-1, 0];
      world.retire(obstacle);
    }
    window.__perfect = setInterval(() => {
      // Moving about in that lane, rather than standing still, which would be resting.
      run.noteActivity();
      if (run.state === 'running' && run.mustJump) run.jump();
    }, 50);
  });
  await standAcross(page, 0.09);
  await page.waitForTimeout(6000);
  await shot(page, 't44-narrow-trail');
  await waitForScreen(page, 'finish');
  await page.evaluate(() => clearInterval(window.__perfect));
  const { stats } = await runState(page);
  expect(stats.cleared).toBe(10);
  expect(stats.stepped).toBeGreaterThan(0);
  await expect(page.locator('#finish-line')).toContainText(`cleared 10 of 10 obstacles, ${stats.stepped} of them by stepping round`);
  await page.waitForTimeout(800);
  await shot(page, 't45-finish-stepped');
});

test('level 10: a mix of widths, and nothing flashes stepping round them', async ({ page }) => {
  test.setTimeout(120_000);
  await reachRun(page, { levels: { 'leap-trail': 10 }, onMissed: 'stumble' });
  const widths = await page.evaluate(() => window.__game.run.course.map(({ lanes }) => lanes.length));
  expect(new Set(widths).size).toBeGreaterThan(1);
  await nextObstacleIs(page, 'sheep', 45, [-1, 0]);
  await page.waitForTimeout(500);
  await shot(page, 't46-level10-two-lane-sheep');
  await page.evaluate(() => {
    const { world, game } = window.__game;
    window.__lane = 0;
    game.readLane = () => {
      world.setLane(window.__lane);
      return window.__lane;
    };
  });
  const reading = await page.evaluate(async () => {
    const { world } = window.__game;
    const out = [];
    const small = document.createElement('canvas');
    small.width = 32;
    small.height = 18;
    const context = small.getContext('2d', { willReadFrequently: true });
    for (let i = 0; i < 220; i += 1) {
      if (i === 20) window.__lane = 1;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      world.render();
      context.drawImage(world.renderer.domElement, 0, 0, 32, 18);
      const { data } = context.getImageData(0, 0, 32, 18);
      let total = 0;
      for (let j = 0; j < data.length; j += 4) total += (data[j] + data[j + 1] + data[j + 2]) / 3;
      out.push(total / (32 * 18));
    }
    return out;
  });
  const biggest = Math.max(...reading.slice(1).map((value, index) => Math.abs(value - reading[index])));
  console.log('stepping round at level 10: biggest brightness step', biggest);
  expect(biggest).toBeLessThan(25);
  expect((await runState(page)).stats.stepped).toBeGreaterThanOrEqual(1);
});
