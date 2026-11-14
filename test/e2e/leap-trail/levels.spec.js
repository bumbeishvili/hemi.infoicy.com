// Leap Trail's levels: what level 10 brings, that it can still be finished and is still safe to look
// at, and that finishing a run moves on a level. Nobody can lose a run, so every finish is a win.
import { expect, shot, test, waitForScreen } from '../helpers.js';
import { bodyDoes, nextObstacleIs, openTrail, reachRun, runState, standAcross, standInView } from './helpers.js';

const TOP = { levels: { 'leap-trail': 10 } };

/** The next obstacle is this kind, with a golden star over this lane. */
async function nextWithGold(page, kind, gap, lane) {
  await nextObstacleIs(page, kind, gap);
  await page.evaluate((over) => {
    const { run, world } = window.__game;
    run.next.gold = { lane: over, taken: false, missed: false };
    world.retire(run.next); // So it comes back with its golden star.
  }, lane);
}

/** Takes away the trail's own golden stars, so that a test can count just the ones it puts there. */
const noGold = (page) => page.evaluate(() => {
  const { run, world } = window.__game;
  for (const obstacle of run.course) {
    if (!obstacle.gold) continue;
    delete obstacle.gold;
    world.retire(obstacle);
  }
});

/** Jumps whenever a jump counts, as a tracked body would, until it's stopped. */
const jumpWheneverAsked = (page) => page.evaluate(() => {
  window.__perfect = setInterval(() => {
    const { run } = window.__game;
    const next = run?.next;
    if (run?.state !== 'running' || !next || !run.inReach(next) || next.state !== 'ahead') return;
    run.jump();
  }, 50);
});

/**
 * The picture's overall brightness, frame by frame, while something happens: 'jumping' jumps whenever
 * a jump counts, and 'across' goes back and forth across all three lanes.
 */
const brightnessWhile = (page, frames, during = '') => page.evaluate(async ([count, doing]) => {
  const { world } = window.__game;
  const reading = [];
  const small = document.createElement('canvas');
  small.width = 32;
  small.height = 18;
  const context = small.getContext('2d', { willReadFrequently: true });
  for (let i = 0; i < count; i += 1) {
    const { run } = window.__game;
    if (doing === 'jumping' && run.next && run.inReach(run.next) && run.next.state === 'ahead') run.jump();
    if (doing === 'across') window.__lane = [0, 1, 0, -1][Math.floor(i / 15) % 4];
    await new Promise((resolve) => requestAnimationFrame(resolve));
    world.render();
    context.drawImage(world.renderer.domElement, 0, 0, 32, 18);
    const { data } = context.getImageData(0, 0, 32, 18);
    let total = 0;
    for (let j = 0; j < data.length; j += 4) total += (data[j] + data[j + 1] + data[j + 2]) / 3;
    reading.push(total / (32 * 18));
  }
  return reading;
}, [frames, during]);

const biggestStep = (reading) => Math.max(...reading.slice(1).map((value, index) => Math.abs(value - reading[index])));

test('level 1 keeps its pace and its first four obstacles, with no golden stars', async ({ page }) => {
  await reachRun(page);
  const run = await page.evaluate(() => {
    const { run: now } = window.__game;
    return { level: now.levelNumber, kinds: [...new Set(now.course.map(({ kind }) => kind))], gold: now.course.some(({ gold }) => gold), early: now.settings.early, speed: now.settings.speed };
  });
  expect(run.level).toBe(1);
  expect(run.gold).toBe(false);
  expect(['log', 'hay', 'rocks', 'stream']).toEqual(expect.arrayContaining(run.kinds));
  expect([run.early, run.speed]).toEqual([2, 14]);
});

test('level 10 brings fences, rolling bales, sheep and golden stars, and each can be cleared', async ({ page }) => {
  test.setTimeout(180_000);
  await reachRun(page, TOP);
  const laid = await page.evaluate(() => {
    const { run } = window.__game;
    let crossing = 0;
    for (let i = 0; i < run.starLines.length; i += 6) if (run.starLines[i].lane !== run.starLines[i + 5]?.lane) crossing += 1;
    return { level: run.levelNumber, kinds: run.levelRules.kinds, gold: run.course.filter(({ gold }) => gold).length, crossing, early: run.settings.early };
  });
  expect(laid.level).toBe(10);
  expect(laid.kinds).toEqual(['log', 'hay', 'rocks', 'stream', 'fence', 'bale', 'ducks', 'sheep']);
  expect(laid.gold).toBeGreaterThan(0);
  expect(laid.crossing).toBeGreaterThan(0);
  expect(laid.early).toBeCloseTo(1.7, 5);
  await expect(page.locator('#level-badge')).toHaveText('Level 10 of 10');
  await noGold(page);

  let cleared = 0;
  for (const kind of ['fence', 'bale', 'sheep']) {
    await nextObstacleIs(page, kind, kind === 'bale' ? 60 : 16);
    if (kind === 'bale') {
      // It rolls in from further off, and comes to rest before the painted stretch.
      await page.waitForTimeout(500);
      const rolling = await page.evaluate(() => {
        const { run, world } = window.__game;
        const item = world.items.get(run.next);
        return { shown: -item.model.position.z, really: run.next.at - run.distance, turned: item.model.userData.rolling.rotation.x };
      });
      expect(rolling.shown).toBeGreaterThan(rolling.really + 2);
      expect(rolling.turned).not.toBe(0);
      await shot(page, 'leap-l10-bale-rolling');
    }
    await expect.poll(async () => (await runState(page)).next?.inReach, { timeout: 10_000 }).toBe(true);
    if (kind === 'bale') {
      const resting = await page.evaluate(() => {
        const { run, world } = window.__game;
        return Math.abs(-world.items.get(run.next).model.position.z - (run.next.at - run.distance));
      });
      expect(resting).toBeLessThan(0.01);
    }
    await page.waitForTimeout(150);
    await shot(page, `leap-l10-${kind}-ask`);
    await bodyDoes(page);
    await page.waitForTimeout(450);
    await shot(page, `leap-l10-${kind}-jump`);
    cleared += 1;
    await expect.poll(async () => (await runState(page)).stats.cleared, { timeout: 8000 }).toBe(cleared);
  }

  // A golden star over the right-hand lane: a step across, and then the jump, catches it.
  await nextWithGold(page, 'log', 70, 1);
  await page.waitForTimeout(800);
  await shot(page, 'leap-l10-gold-ahead');
  await standAcross(page, 0.09);
  await expect.poll(async () => (await runState(page)).lane, { timeout: 10_000 }).toBe(1);
  await expect.poll(async () => (await runState(page)).next?.gap, { timeout: 10_000, intervals: [50] }).toBeLessThan(40);
  await shot(page, 'leap-l10-gold-near');
  await expect.poll(async () => (await runState(page)).next?.inReach, { timeout: 10_000 }).toBe(true);
  await bodyDoes(page);
  await page.waitForTimeout(250);
  await shot(page, 'leap-l10-gold-jump');
  await expect.poll(async () => (await runState(page)).stats.gold, { timeout: 8000 }).toBe(1);
  await expect(page.locator('.callout.is-number', { hasText: '+5' }).first()).toBeAttached();

  // One over the left lane, jumped from the right: it's missed, and that costs nothing.
  await nextWithGold(page, 'hay', 30, -1);
  await expect.poll(async () => (await runState(page)).next?.inReach, { timeout: 10_000 }).toBe(true);
  await bodyDoes(page);
  await expect.poll(async () => (await runState(page)).stats.cleared, { timeout: 8000 }).toBe(cleared + 2);
  const { stats } = await runState(page);
  expect([stats.gold, stats.bumps, stats.streak]).toEqual([1, 0, cleared + 2]);
  await standInView(page);
});

test('level 10 can be run to the end, and finishing it says every level is done', async ({ page }) => {
  test.setTimeout(240_000);
  await reachRun(page, { ...TOP, obstacles: 10, onMissed: 'stumble' });
  await page.waitForTimeout(2500);
  await shot(page, 'leap-l10-running');
  await jumpWheneverAsked(page);
  await waitForScreen(page, 'finishing');
  await waitForScreen(page, 'finish');
  await page.evaluate(() => clearInterval(window.__perfect));
  const { stats } = await runState(page);
  expect(stats.cleared).toBe(10);
  expect(stats.bumps).toBe(0);
  await expect(page.locator('#finish-line')).toContainText('cleared 10 of 10');
  await expect(page.locator('#level-done-text')).toHaveText('All 10 levels done!');
  await page.waitForTimeout(800);
  await shot(page, 'leap-l10-finish');
});

test('finishing a run moves on a level, and the next run is played at it', async ({ page }) => {
  test.setTimeout(240_000);
  await reachRun(page, { levels: { 'leap-trail': 3 }, obstacles: 10, trailPace: 'fast', onMissed: 'stumble' });
  expect(await page.evaluate(() => window.__game.run.levelNumber)).toBe(3);
  await page.evaluate(() => {
    const { run } = window.__game;
    run.distance = run.end - 2;
    run.noteActivity();
  });
  await waitForScreen(page, 'finish');
  await expect(page.locator('#level-done-text')).toHaveText('Level 3 done! Next: level 4');
  await expect(page.locator('#run-again')).toHaveText('Next level');
  await standInView(page);
  await page.locator('#run-again').click();
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-now')).toHaveText('Level 4');
  expect(await page.evaluate(() => window.__game.run.levelNumber)).toBe(4);
  await page.reload();
  await expect(page.locator('#level-badge')).toHaveText('Level 4 of 10');
});

test('level 10 with the lanes off: everything stays in the middle, and golden stars are caught by jumping', async ({ page }) => {
  test.setTimeout(240_000);
  await reachRun(page, { ...TOP, obstacles: 10, trailLanes: 'no', onMissed: 'stumble' });
  const laid = await page.evaluate(() => {
    const { run } = window.__game;
    return { lanes: [...new Set(run.starLines.map(({ lane }) => lane))], gold: run.course.filter(({ gold }) => gold).map(({ gold }) => gold.lane) };
  });
  expect(laid.lanes).toEqual([0]);
  expect(laid.gold.every((lane) => lane === 0)).toBe(true);
  await jumpWheneverAsked(page);
  await waitForScreen(page, 'finish');
  await page.evaluate(() => clearInterval(window.__perfect));
  const { stats } = await runState(page);
  expect(stats.gold).toBe(laid.gold.length);
  expect(stats.laneMoves).toBe(0);
  await expect(page.locator('.finish-tally .tally-card')).toHaveCount(2);
});

test('level 10: nothing flashes through rolling bales, sheep, golden stars and jumps', async ({ page }) => {
  test.setTimeout(150_000);
  await reachRun(page, TOP);
  await noGold(page);
  await nextWithGold(page, 'bale', 70, 0);
  // From the bale rolling in, through the jump that catches the golden star, to the landing.
  const reading = await brightnessWhile(page, 330, 'jumping');
  expect(await page.evaluate(() => window.__game.run.stats.gold)).toBe(1);
  console.log('level 10: biggest brightness step through a bale and a golden star', biggestStep(reading));
  expect(biggestStep(reading)).toBeLessThan(25);

  await nextObstacleIs(page, 'sheep', 30);
  const sheep = await brightnessWhile(page, 150, 'jumping');
  console.log('level 10: biggest brightness step through sheep', biggestStep(sheep));
  expect(biggestStep(sheep)).toBeLessThan(25);
});

test('level 10: nothing flashes moving across as fast as a child could, at the faster speed', async ({ page }) => {
  await reachRun(page, { ...TOP, trailPace: 'fast', onMissed: 'stumble' });
  await nextObstacleIs(page, 'fence', 400);
  await page.evaluate(() => {
    const { world, game } = window.__game;
    window.__lane = 0;
    game.readLane = () => {
      world.setLane(window.__lane);
      return window.__lane;
    };
  });
  const reading = await brightnessWhile(page, 120, 'across');
  console.log('level 10: biggest brightness step moving across', biggestStep(reading));
  expect(biggestStep(reading)).toBeLessThan(25);
});

test('level 10 with reduced motion: bales don\'t roll in, sheep stand still, and the run still works', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await reachRun(page, TOP);
  await nextObstacleIs(page, 'bale', 60);
  await page.waitForTimeout(400);
  const still = await page.evaluate(() => {
    const { run, world } = window.__game;
    const item = world.items.get(run.next);
    return { off: Math.abs(-item.model.position.z - (run.next.at - run.distance)), turned: item.model.userData.rolling.rotation.x };
  });
  expect(still.off).toBeLessThan(0.01);
  expect(still.turned).toBe(-0);
  await expect.poll(async () => (await runState(page)).next?.inReach, { timeout: 8000 }).toBe(true);
  await bodyDoes(page);
  await expect.poll(async () => (await runState(page)).stats.cleared, { timeout: 8000 }).toBe(1);
  await nextObstacleIs(page, 'sheep', 40);
  await page.waitForTimeout(400);
  const flock = await page.evaluate(() => {
    const { run, world } = window.__game;
    const { model } = world.items.get(run.next);
    return [model.position.x, ...model.userData.sheep.map((one) => one.position.y)];
  });
  expect(flock.every((value) => value === 0)).toBe(true);
});

test('level 10: a slow computer still gives up sharpness and then shadows, and keeps running', async ({ page }) => {
  await reachRun(page, TOP);
  const levels = await page.evaluate(() => {
    const { world } = window.__game;
    world.quality = 2;
    world.renderer.shadowMap.enabled = true;
    world.frames = 0;
    world.slowFrames = 0;
    const slowFor = () => {
      for (let i = 0; i < 90; i += 1) world.watchSpeed(0.05);
    };
    slowFor();
    const first = [world.quality, world.renderer.getPixelRatio(), world.renderer.shadowMap.enabled];
    slowFor();
    return [first, [world.quality, world.renderer.getPixelRatio(), world.renderer.shadowMap.enabled]];
  });
  expect(levels).toEqual([[1, 1, true], [0, 1, false]]);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__game.screen)).toBe('run');
});
