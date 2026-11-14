// Leap Trail's hearts: as it comes, each stumble costs one, and a run whose hearts are all gone is over
// there, with a kind card, Try again, and the same level. The gentle trail is the game as it was.
import { expect, shot, test, waitForScreen } from '../helpers.js';
import { reachRun, runState, standInView } from './helpers.js';

const CHALLENGE = { onMissed: 'stumble', trailHearts: 'yes', obstacles: 20 };

/** Keeps the child moving about, so the runner never stops for a rest, but never jumping. */
const keepMovingNoJumps = (page) => page.evaluate(() => {
  window.__moving = setInterval(() => window.__game.run?.noteActivity(), 100);
});

/** Brings the next obstacle that fills the runner's lane close, so a test needn't wait for chance. */
const nextInTheWay = (page) => page.evaluate(() => {
  const { run, world } = window.__game;
  for (const obstacle of run.course) {
    if (obstacle.state !== 'ahead') continue;
    world.retire(obstacle);
    obstacle.lanes = [-1, 0, 1];
  }
});

test('out of hearts, the run is over there: a kind card, Try again, and the same level', async ({ page }) => {
  test.setTimeout(150_000);
  await reachRun(page, { ...CHALLENGE, levels: { 'leap-trail': 3 } });
  await expect(page.locator('#hearts')).toHaveText('♥♥♥♥');
  await nextInTheWay(page);
  await keepMovingNoJumps(page);
  await expect.poll(async () => (await runState(page)).stats.bumps, { timeout: 30_000 }).toBe(1);
  await expect(page.locator('#hearts')).toHaveText('♥♥♥♡');
  await shot(page, 'leap-hearts-one-gone');
  await waitForScreen(page, 'finishing', 60_000);
  const run = await page.evaluate(() => ({ lost: window.__game.run.lost, hearts: window.__game.run.hearts, bumps: window.__game.run.stats.bumps }));
  expect(run).toEqual({ lost: true, hearts: 0, bumps: 4 });
  await page.waitForTimeout(600);
  await shot(page, 'leap-hearts-out');
  await waitForScreen(page, 'finish');
  await page.evaluate(() => clearInterval(window.__moving));
  await expect(page.locator('#finish-title')).toHaveText('Out of hearts!');
  await expect(page.locator('#finish-line')).toContainText('tripped 4 times');
  await expect(page.locator('#run-again')).toHaveText('Try again');
  await expect(page.locator('#level-done-text')).toHaveText('Let’s try level 3 again!');
  expect(await page.evaluate(() => window.__game.game.confetti.running ?? false)).toBeFalsy();
  await page.waitForTimeout(500);
  await shot(page, 'leap-hearts-lost-card');
  // Trying again is the same level, with all its hearts back.
  await standInView(page);
  await page.locator('#run-again').click();
  await waitForScreen(page, 'countdown');
  expect(await page.evaluate(() => [window.__game.run.levelNumber, window.__game.run.hearts])).toEqual([3, 4]);
  await expect(page.locator('#level-now')).toHaveText('Level 3');
});

test('getting to the finish with hearts left is a win, and moves on a level', async ({ page }) => {
  test.setTimeout(120_000);
  await reachRun(page, { ...CHALLENGE, levels: { 'leap-trail': 2 } });
  // Past every obstacle, with a stumble on the way, and nearly at the end.
  await page.evaluate(() => {
    const { run } = window.__game;
    run.hearts -= 1;
    for (const obstacle of run.course) obstacle.state = 'cleared';
    run.distance = run.end - 2;
    run.noteActivity();
  });
  await waitForScreen(page, 'finish');
  await expect(page.locator('#finish-title')).toHaveText('You made it!');
  await expect(page.locator('#level-done-text')).toHaveText('Level 2 done! Next: level 3');
  await expect(page.locator('#run-again')).toHaveText('Next level');
});

test('the gentle trail is the game as it was: no hearts, and it runs on through every stumble', async ({ page }) => {
  test.setTimeout(150_000);
  await reachRun(page, { ...CHALLENGE, trailHearts: 'no', obstacles: 10, levels: { 'leap-trail': 9 } });
  await expect(page.locator('.hearts-chip')).toBeHidden();
  expect(await page.evaluate(() => window.__game.run.hearts)).toBe(null);
  await nextInTheWay(page);
  await keepMovingNoJumps(page);
  await waitForScreen(page, 'finish', 120_000);
  await page.evaluate(() => clearInterval(window.__moving));
  const { stats } = await runState(page);
  expect(stats.bumps).toBe(10);
  await expect(page.locator('#finish-title')).toHaveText('You made it!');
  await expect(page.locator('#level-done-text')).toHaveText('Level 9 done! Next: level 10');
});

test('the grown-ups\' panel has the gentle trail, and remembers it', async ({ page }) => {
  await reachRun(page, CHALLENGE);
  await page.locator('#open-panel').click();
  await expect(page.locator('input[name="trailHearts"][value="yes"]')).toBeChecked();
  await page.locator('input[name="trailHearts"][value="no"]').check();
  await page.locator('#close-panel').click();
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'yes');
  await page.locator('#open-panel').click();
  await expect(page.locator('input[name="trailHearts"][value="no"]')).toBeChecked();
});

test('stepping out of the picture costs no hearts, however long it lasts', async ({ page }) => {
  test.setTimeout(120_000);
  await reachRun(page, CHALLENGE);
  await nextInTheWay(page);
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__camera.showNobody());
  await expect(page.locator('#prompt')).toContainText('Come back where I can see you', { timeout: 15_000 });
  const stopped = await page.evaluate(() => ({ distance: window.__game.run.distance, hearts: window.__game.run.hearts }));
  await page.waitForTimeout(6000);
  expect(await page.evaluate(() => ({ distance: window.__game.run.distance, hearts: window.__game.run.hearts }))).toEqual(stopped);
});

/**
 * The run with its last heart left and the next obstacle just ahead, played on five seconds with no jump: the
 * biggest change in the whole picture's brightness from one frame to the next, and how it ended.
 */
const throughTheLastStumble = async (page) => {
  await page.evaluate(() => {
    const { run } = window.__game;
    run.hearts = 1;
    run.next.at = run.distance + 40;
  });
  return page.evaluate(async () => {
    const { world, game, run } = window.__game;
    const small = document.createElement('canvas');
    small.width = 64;
    small.height = 36;
    const context = small.getContext('2d', { willReadFrequently: true });
    const steps = [];
    let last = null;
    let flicker = 0;
    game.paused = true;
    try {
      for (let i = 0; i < 300; i += 1) {
        run.noteActivity();
        run.update(1 / 60);
        world.update(1 / 60);
        world.render();
        context.drawImage(world.renderer.domElement, 0, 0, 64, 36);
        const { data } = context.getImageData(0, 0, 64, 36);
        let mean = 0;
        for (let j = 0; j < data.length; j += 4) mean += (data[j] + data[j + 1] + data[j + 2]) / 3;
        mean /= 64 * 36;
        if (last) {
          let changed = 0;
          for (let j = 0; j < data.length; j += 4) {
            if ((Math.abs(data[j] - last.data[j]) + Math.abs(data[j + 1] - last.data[j + 1]) + Math.abs(data[j + 2] - last.data[j + 2])) / 3 > 20) changed += 1;
          }
          steps.push(Math.abs(mean - last.mean));
          flicker = Math.max(flicker, changed / (64 * 36));
        }
        last = { data: new Uint8ClampedArray(data), mean };
      }
    } finally {
      game.paused = false;
    }
    return { step: Math.max(...steps), flicker, lost: run.lost, speed: run.speed };
  });
};

test('nothing flashes as the last heart goes and the runner slows to a stop', async ({ page }) => {
  test.setTimeout(150_000);
  await reachRun(page, { ...CHALLENGE, levels: { 'leap-trail': 10 } });
  await nextInTheWay(page);
  const reading = await throughTheLastStumble(page);
  console.log('leap trail, out of hearts: biggest brightness step', reading.step.toFixed(2), 'flicker share', reading.flicker.toFixed(3));
  expect(reading.lost).toBe(true);
  expect(reading.speed).toBeLessThan(1);
  expect(reading.step).toBeLessThan(4);
});

test('nothing flashes when the runner stumbles through a stream: the water stays where it is', async ({ page }) => {
  test.setTimeout(150_000);
  await reachRun(page, { ...CHALLENGE, levels: { 'leap-trail': 10 } });
  // Every obstacle ahead is a stream. Knocked aside like a log, a stream stood up in front of the camera and
  // darkened the picture by 8 to 12 in one frame: it happened once in fourteen runs of the test above.
  await page.evaluate(() => {
    const { run, world } = window.__game;
    for (const obstacle of run.course) {
      if (obstacle.state !== 'ahead') continue;
      world.retire(obstacle);
      obstacle.lanes = [-1, 0, 1];
      obstacle.kind = 'stream';
    }
  });
  const reading = await throughTheLastStumble(page);
  console.log('leap trail, through a stream: biggest brightness step', reading.step.toFixed(2), 'flicker share', reading.flicker.toFixed(3));
  expect(reading.lost).toBe(true);
  expect(reading.step).toBeLessThan(4);
});
