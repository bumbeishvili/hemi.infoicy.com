// Leap Trail, with real footage going through the real tracker.
import { expect, screenName, shot, test, waitForScreen } from '../helpers.js';
import { bodyDoes, footage, nextObstacleIs, openTrail, reachRun, runState, standAcross, standInView, toChoosing } from './helpers.js';

const prompt = (page) => page.locator('#prompt');

test('a look at every obstacle, each one cleared', async ({ page }) => {
  await openTrail(page);
  await shot(page, 't1-welcome');
  await toChoosing(page);
  await page.waitForTimeout(700);
  await shot(page, 't2-choose');
  await standInView(page);
  await page.locator('#run-start').click();
  await waitForScreen(page, 'bodycheck');
  await waitForScreen(page, 'practice');
  await page.locator('#practice-skip').click();
  await waitForScreen(page, 'countdown');
  await page.waitForTimeout(1200);
  await shot(page, 't3-countdown');
  await waitForScreen(page, 'run');
  await page.waitForTimeout(1800);
  await shot(page, 't4-running');

  let cleared = 0;
  for (const kind of ['log', 'hay', 'rocks', 'stream']) {
    await nextObstacleIs(page, kind, 14);
    await expect.poll(async () => (await runState(page)).next?.inReach, { timeout: 8000 }).toBe(true);
    await page.waitForTimeout(150);
    await shot(page, `t5-${kind}-ask`);
    await bodyDoes(page);
    await page.waitForTimeout(500);
    await shot(page, `t6-${kind}-move`);
    cleared += 1;
    await expect.poll(async () => (await runState(page)).stats.cleared, { timeout: 8000 }).toBe(cleared);
    await page.waitForTimeout(700);
  }
  expect(await screenName(page)).toBe('run');
});

test('there are no keyboard controls: only the body moves the runner', async ({ page }) => {
  await reachRun(page);
  await nextObstacleIs(page, 'log', 9);
  await expect.poll(async () => (await runState(page)).next?.inReach, { timeout: 10_000 }).toBe(true);
  for (const key of ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'KeyW', 'KeyA', 'KeyS', 'KeyD']) await page.keyboard.press(key);
  await page.waitForTimeout(400);
  const { stats, lane } = await runState(page);
  expect([stats.jumps, stats.cleared, stats.laneMoves, lane]).toEqual([0, 0, 0, 0]);
});

test('a real jump in front of the camera clears what\'s coming', async ({ page }) => {
  await reachRun(page);
  await nextObstacleIs(page, 'log', 9);
  await expect.poll(async () => (await runState(page)).next?.inReach, { timeout: 10_000 }).toBe(true);
  await expect(page.locator('#coach-text')).toHaveText('Jump!');
  await expect(page.locator('#coach-demo')).toBeVisible();
  expect(await page.evaluate(() => window.__game.game.demo.playing.name)).toBe('jump');

  // Three burpees in this footage, each ending in a real jump.
  await footage(page, 'jumps');
  await expect.poll(async () => (await runState(page)).stats.jumps, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  await expect(page.locator('.callout.is-seen').first()).toContainText('You jumped!');
  await page.waitForTimeout(150);
  await shot(page, 't7-real-jump');
  await expect.poll(async () => (await runState(page)).stats.cleared, { timeout: 8000 }).toBe(1);
  const { stats } = await runState(page);
  expect(stats.bumps).toBe(0);
  expect(stats.stars).toBe(3);
  await expect(page.locator('#coach')).toBeHidden();
});

test('there are no squats: going down is never asked for, never taken for a move, and never said', async ({ page }) => {
  await reachRun(page);
  await page.evaluate(() => {
    window.__said = [];
    const { sound } = window.__game;
    const real = sound.say.bind(sound);
    sound.say = (text, options) => {
      window.__said.push(text);
      return real(text, options);
    };
  });
  const kinds = await page.evaluate(() => window.__game.run.course.map(({ needs }) => needs));
  expect(new Set(kinds)).toEqual(new Set(['jump']));
  await nextObstacleIs(page, 'log', 9);
  await expect.poll(async () => (await runState(page)).next?.inReach, { timeout: 10_000 }).toBe(true);
  await expect(page.locator('#coach-text')).toHaveText('Jump!');

  // Real squats, over and over, in front of the camera.
  await footage(page, 'squat');
  await page.waitForTimeout(6000);
  await shot(page, 't8-squats-ignored');
  const said = await page.evaluate(() => window.__said);
  expect(said.filter((text) => /squat/i.test(text))).toEqual([]);
  expect(await page.locator('.callout').allTextContents()).not.toContain(expect.stringMatching(/squat/i));
  await expect(page.locator('#coach-text')).not.toHaveText(/squat/i);
  expect(await page.locator('body').textContent()).not.toMatch(/squat/i);
});

test('stepping to the side moves the runner into that lane, and catches the stars there', async ({ page }) => {
  test.setTimeout(120_000);
  await reachRun(page, { onMissed: 'stumble' });
  await nextObstacleIs(page, 'log', 400);
  const runnerX = () => page.evaluate(() => window.__game.world.runner.body.root.position.x);

  // A step to the child's right is to the right of the mirror, and the runner goes right too.
  await standAcross(page, 0.09);
  await expect.poll(async () => (await runState(page)).lane, { timeout: 10_000 }).toBe(1);
  await expect.poll(runnerX, { timeout: 3000 }).toBeGreaterThan(1.6);
  await page.waitForTimeout(300);
  await shot(page, 't8b-right-lane');

  // The next line of stars is put in this lane, and running through it picks them up.
  const before = (await runState(page)).stats.linedStars;
  await page.evaluate(() => {
    const { run } = window.__game;
    const at = run.distance + 25;
    for (let i = 0; i < 6; i += 1) run.starLines.splice(run.nextStar + i, 0, { at: at + i * 2.6, lane: 1, taken: false });
  });
  await expect.poll(async () => (await runState(page)).stats.linedStars, { timeout: 10_000 }).toBeGreaterThanOrEqual(before + 6);

  await standAcross(page, -0.09);
  await expect.poll(async () => (await runState(page)).lane, { timeout: 10_000 }).toBe(-1);
  await expect.poll(runnerX, { timeout: 3000 }).toBeLessThan(-1.6);
  await page.waitForTimeout(300);
  await shot(page, 't8c-left-lane');

  await standInView(page);
  await expect.poll(async () => (await runState(page)).lane, { timeout: 10_000 }).toBe(0);
  const { stats } = await runState(page);
  expect(stats.laneMoves).toBeGreaterThanOrEqual(3);
  expect(stats.bumps).toBe(0);
});

test('standing still in front of the camera stays in the middle lane', async ({ page }) => {
  await reachRun(page);
  await nextObstacleIs(page, 'log', 400);
  await footage(page, 'strikes', { from: 1 });
  await page.waitForTimeout(6000);
  const { lane, stats } = await runState(page);
  expect([lane, stats.laneMoves]).toEqual([0, 0]);
});

test('set to wait, the runner stops at an obstacle and waits, however long it takes', async ({ page }) => {
  test.setTimeout(120_000);
  await reachRun(page);
  await nextObstacleIs(page, 'hay', 8);
  await expect.poll(async () => (await runState(page)).waiting, { timeout: 15_000 }).toBe(true);
  await expect(prompt(page)).toContainText('Jump when you’re ready!');
  await shot(page, 't9-waiting');

  const stopped = await runState(page);
  expect(stopped.speed).toBe(0);
  expect(stopped.stats.bumps).toBe(0);
  await page.waitForTimeout(4000);
  const later = await runState(page);
  expect(later.distance).toBe(stopped.distance);
  expect(later.next.kind).toBe('hay');

  await footage(page, 'jumps');
  await expect.poll(async () => (await runState(page)).stats.cleared, { timeout: 20_000 }).toBe(1);
  await expect.poll(async () => (await runState(page)).speed).toBeGreaterThan(1);
});

test('set to stumble, a missed obstacle is knocked aside and the run goes on', async ({ page }) => {
  await reachRun(page, { onMissed: 'stumble' });
  await footage(page, 'strikes', { from: 1 });
  await nextObstacleIs(page, 'log', 6);
  await expect.poll(async () => (await runState(page)).stats.bumps, { timeout: 15_000 }).toBe(1);
  await page.waitForTimeout(200);
  await shot(page, 't10-stumble');
  const { stats } = await runState(page);
  expect(stats.streak).toBe(0);
  expect(stats.cleared).toBe(0);
  await expect.poll(async () => (await runState(page)).speed, { timeout: 8000 }).toBeGreaterThan(3);
  expect(await screenName(page)).toBe('run');
});

test('a whole trail: finish, numbers, the camera going off, and running again', async ({ page }) => {
  test.setTimeout(240_000);
  // With the lanes off, every line of stars is in the middle, so the count is always the same.
  await reachRun(page, { obstacles: 10, trailPace: 'fast', trailLanes: 'no' });
  await expect(page.locator('#obstacles-left')).toHaveText('10');

  // Doing whatever's asked, at the moment it counts.
  await page.evaluate(() => {
    const { run } = window.__game;
    window.__perfect = setInterval(() => {
      const next = run.next;
      if (run.state !== 'running' || !next || !run.inReach(next) || next.state !== 'ahead') return;
      run.jump();
    }, 50);
  });
  await waitForScreen(page, 'finishing');
  await page.waitForTimeout(900);
  await shot(page, 't11-finishing');
  await waitForScreen(page, 'finish');
  await page.evaluate(() => clearInterval(window.__perfect));

  // Three for each obstacle cleared, and the lines of stars on the path.
  await expect(page.locator('#finish-stars')).toHaveText('90');
  await expect(page.locator('#finish-line')).toContainText('cleared 10 of 10');
  // Jumps and the longest streak. Steps across only count with the lanes on.
  await expect(page.locator('.finish-tally .tally-card')).toHaveCount(2);
  await expect(page.locator('.tally-card[data-exercise="streak"] strong')).toHaveText('10');
  await page.waitForTimeout(800);
  await shot(page, 't12-finish');
  expect(await page.evaluate(() => window.__camera.activeTracks)).toBe(0);

  await standInView(page);
  await page.locator('#run-again').click();
  await waitForScreen(page, 'bodycheck');
  expect(await page.evaluate(() => window.__camera.activeTracks)).toBe(1);
  await waitForScreen(page, 'run');
  expect(await page.evaluate(() => window.__game.game.practised)).toBe(true);
  expect((await runState(page)).stats.cleared).toBe(0);
  await expect(page.locator('#stars')).toHaveText('0');
});

test('another runner can be chosen after a run', async ({ page }) => {
  test.setTimeout(240_000);
  await reachRun(page, { obstacles: 10, trailPace: 'fast', onMissed: 'stumble' });
  await page.evaluate(() => {
    const { run } = window.__game;
    run.distance = run.end - 5;
    run.noteActivity();
  });
  await waitForScreen(page, 'finish');
  await page.locator('#other-runner').click();
  await waitForScreen(page, 'choose');
  await page.locator('.fighter-card[data-fighter="tur"]').click();
  expect(await page.evaluate(() => window.__game.world.runner.spec.id)).toBe('tur');
  await page.waitForTimeout(700);
  await shot(page, 't13-choose-again');
});

test('every character can run and jump, in every lane', async ({ page }) => {
  await reachRun(page);
  const ids = await page.evaluate(async () => {
    const { ROSTER } = await import('/core/body/roster.js');
    return ROSTER.map(({ id }) => id);
  });
  expect(ids).toHaveLength(10);
  for (const id of ids) {
    const posed = await page.evaluate(async (which) => {
      const { byId } = await import('/core/body/roster.js');
      const { world, run } = window.__game;
      world.setRunner(byId(which));
      const samples = [];
      for (const lane of [-1, 0, 1]) {
        world.setLane(lane);
        run.startMove('jump');
        for (let i = 0; i < 20; i += 1) world.update(0.03);
        samples.push(world.runner.body.root.position.x, world.runner.pose.up, world.runner.pose.hipDrop);
      }
      return samples;
    }, id);
    expect(posed.every(Number.isFinite), id).toBe(true);
  }
});

test('out of the box it\'s fast, at a medium pace, and a missed move is a stumble that costs a heart', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => localStorage.clear());
  // The pace and hearts as they come, rather than the gentle trail most of these tests run.
  await reachRun(page, { onMissed: 'stumble', trailPace: undefined, trailHearts: undefined });
  expect(await page.evaluate(() => [window.__game.game.settings.trailPace, window.__game.game.settings.trailHearts])).toEqual(['medium', 'yes']);
  await expect(page.locator('.hearts-chip')).toBeVisible();
  await expect(page.locator('#hearts')).toHaveText('♥♥♥♥♥');
  await expect.poll(async () => (await runState(page)).speed, { timeout: 8000 }).toBeGreaterThan(16);
  await expect.poll(() => page.evaluate(() => window.__game.run.stats.linedStars), { timeout: 4000 }).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  await shot(page, 't30-fast');
  await expect(page.locator('#stars')).not.toHaveText('0');
  const paint = await page.evaluate(() => window.__game.world.streakLines.material.opacity);
  expect(paint).toBeGreaterThan(0.05);
  // Nobody moves, and it keeps on going through what's in the way, a heart less each time.
  await expect.poll(() => page.evaluate(() => window.__game.run.stats.bumps), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  await expect.poll(async () => (await runState(page)).speed, { timeout: 4000 }).toBeGreaterThan(10);
  await expect(page.locator('#hearts')).toHaveText(/^♥{0,4}♡+$/);
  await shot(page, 't31-carried-on');
});
