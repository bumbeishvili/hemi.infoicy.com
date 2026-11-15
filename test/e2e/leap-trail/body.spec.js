// How Leap Trail fits a child: what the camera has to see, and raising a hand instead of jumping.
import { expect, screenName, shot, test, waitForScreen } from '../helpers.js';
import { footage, nextObstacleIs, openTrail, reachPractice, reachRun, recordScreens, runState, screensSeen, standAcross, standInView, toChoosing } from './helpers.js';

const prompt = (page) => page.locator('#prompt');

test('a run won\'t start until the camera sees the whole body', async ({ page }) => {
  await openTrail(page);
  await page.evaluate(() => window.__camera.showNobody());
  await toChoosing(page);
  await page.locator('#run-start').click();
  await waitForScreen(page, 'bodycheck');
  await expect(prompt(page)).toContainText('Stand where I can see all of you');
  await page.waitForTimeout(1500);
  expect(await screenName(page)).toBe('bodycheck');

  await footage(page, 'strikes', { from: 0.2, playing: false, height: 1.6, shiftY: 0.15 });
  await expect(prompt(page)).toContainText('Step back until I can see all of you');
  await page.waitForTimeout(1200);
  expect(await screenName(page)).toBe('bodycheck');

  await standInView(page);
  await waitForScreen(page, 'practice');
});

test('the practice shows each move, sees real ones, says so, and then the run starts', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPractice(page);
  await expect(page.locator('#coach-text')).toHaveText('Jump as high as you can!');
  await expect(page.locator('#coach-demo')).toBeVisible();
  expect(await page.evaluate(() => window.__game.game.demo.playing.name)).toBe('jump');
  await expect(page.locator('#practice-count')).toHaveText('1 / 2');
  await expect(page.locator('#move-meter')).toBeVisible();
  await page.waitForTimeout(1200);
  await shot(page, 't19-practice');

  await footage(page, 'jumps');
  await expect(page.locator('.callout.is-seen').first()).toContainText('You jumped!', { timeout: 20_000 });
  // Still straight away, as the next step comes soon and this footage is still jumping.
  await standInView(page);
  await shot(page, 't20-practice-seen');
  expect(await page.evaluate(() => window.__game.world.runner.hopLeft)).toBeGreaterThan(0);

  // Then stepping to the side, which is the other thing the run needs.
  await expect(page.locator('#coach-text')).toHaveText('Step to the side!', { timeout: 8000 });
  expect(await page.evaluate(() => window.__game.game.demo.playing.name)).toBe('sideStep');
  await expect(page.locator('#practice-count')).toHaveText('2 / 2');
  await page.waitForTimeout(1000);
  await shot(page, 't20b-practice-side');

  await standAcross(page, -0.09);
  await expect(page.locator('.callout.is-seen').first()).toContainText('You moved across!', { timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => window.__game.world.runner.body.root.position.x), { timeout: 3000 }).toBeLessThan(-0.5);
  await shot(page, 't20c-practice-side-seen');
  await standInView(page);
  await waitForScreen(page, 'countdown');
  await waitForScreen(page, 'run');
  // Practising isn't part of the run's numbers.
  const { stats } = await runState(page);
  expect([stats.jumps, stats.cleared]).toEqual([0, 0]);
});

test('the meter and the bar under the coach follow a real body, and the meter only goes up', async ({ page }) => {
  test.setTimeout(120_000);
  await reachPractice(page);
  const dot = () => page.locator('#meter-dot').evaluate((node) => parseFloat(node.style.bottom));
  // Standing is the bottom of the meter.
  await expect.poll(dot, { timeout: 8000 }).toBeLessThan(25);
  expect(await dot()).toBeGreaterThanOrEqual(9);

  await page.evaluate(() => {
    window.__game.game.practice.succeed = () => {};
  });
  // Going down isn't a move here, so the meter has nowhere lower to go, though the runner still copies it.
  await footage(page, 'squat');
  await expect.poll(() => page.evaluate(() => window.__game.world.runner.live.hipDrop), { timeout: 15_000, intervals: [100] }).toBeGreaterThan(0.05);
  expect(await dot()).toBeGreaterThanOrEqual(9);
  await expect(page.locator('.meter-zone-down')).toHaveCount(0);
  await shot(page, 't21-meter-squat');

  await footage(page, 'jumps');
  await expect.poll(dot, { timeout: 15_000 }).toBeGreaterThan(70);
  const filled = () => page.locator('#coach-effort-fill').evaluate((node) => parseFloat(node.style.width));
  await expect.poll(filled, { timeout: 15_000 }).toBeGreaterThan(50);
});

test('the runner copies the child during the practice', async ({ page }) => {
  await reachPractice(page);
  await footage(page, 'star-jumps');
  await expect.poll(() => page.evaluate(() => window.__game.world.runner.pose.handLY), { timeout: 10_000 }).toBeGreaterThan(0);
  await shot(page, 't22-copying');
});

test('a second run doesn\'t ask to practise again, unless a grown-up wants it to', async ({ page }) => {
  test.setTimeout(150_000);
  await reachRun(page, { obstacles: 10, onMissed: 'stumble' });
  await page.evaluate(() => {
    const { run } = window.__game;
    run.distance = run.end - 2;
    run.noteActivity();
  });
  await waitForScreen(page, 'finish');
  await standInView(page);
  await page.locator('#run-again').click();
  await waitForScreen(page, 'bodycheck');
  await waitForScreen(page, 'countdown');

  await waitForScreen(page, 'run');
  await page.locator('#open-panel').click();
  await page.locator('#recheck').click();
  await waitForScreen(page, 'bodycheck');
  expect(await page.evaluate(() => window.__game.game.practised)).toBe(false);
});

test('lifting a knee can be the way over, for a child who can stand but not jump', async ({ page }) => {
  await reachPractice(page, { jumpWith: 'lift' });
  await expect(page.locator('#coach-text')).toHaveText('Lift your knee as high as you can!');
  expect(await page.evaluate(() => window.__game.game.demo.playing.name)).toBe('kneeLift');
  await page.locator('#practice-skip').click();
  await waitForScreen(page, 'run');
  await nextObstacleIs(page, 'log', 9);
  await expect(page.locator('#coach-text')).toHaveText('Lift your knee!', { timeout: 10_000 });
  // A knee or kick from the reader is the way over, and a jump isn't asked for.
  await page.evaluate(() => window.__game.game.onMoves([{ move: 'knee', side: 'right' }]));
  await expect(page.locator('.callout.is-seen').first()).toContainText('You lifted your knee!');
  await expect.poll(async () => (await runState(page)).stats.cleared, { timeout: 8000 }).toBe(1);
});

test('the grown-ups\' panel says what the camera is seeing, to help tell why a move is missed', async ({ page }) => {
  await reachRun(page);
  await page.locator('#open-panel').click();
  await expect(page.locator('#live-reading')).toContainText('The camera sees someone standing');
  await expect(page.locator('#live-reading')).toContainText('a jump needs the hips to rise');
  await page.evaluate(() => window.__camera.showNobody());
  await expect(page.locator('#live-reading')).toContainText('The camera sees nobody', { timeout: 10_000 });
});

test('stepping out of the picture pauses the run', async ({ page }) => {
  await reachRun(page, { onMissed: 'stumble' });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__camera.showNobody());
  await expect(prompt(page)).toContainText('Come back where I can see you', { timeout: 15_000 });
  const stopped = await runState(page);
  await page.waitForTimeout(2500);
  const later = await runState(page);
  expect(later.distance).toBe(stopped.distance);
  expect(later.stats.bumps).toBe(stopped.stats.bumps);

  await standInView(page);
  await expect(prompt(page)).not.toContainText('Come back where I can see you', { timeout: 15_000 });
  await expect.poll(async () => (await runState(page)).distance, { timeout: 8000 }).toBeGreaterThan(later.distance);
});

test('a frozen tracker counts as nobody there, rather than leaving the run going', async ({ page }) => {
  await reachRun(page);
  await page.evaluate(() => {
    window.__game.camera.onResult = () => {};
    window.__game.camera.sendFrame = async () => {};
  });
  await expect(prompt(page)).toContainText('Come back where I can see you', { timeout: 15_000 });
});

test('standing still is resting, and the runner waits even set to stumble', async ({ page }) => {
  test.setTimeout(120_000);
  await reachRun(page, { onMissed: 'stumble' });
  await nextObstacleIs(page, 'log', 200);
  await expect.poll(async () => (await runState(page)).resting, { timeout: 30_000 }).toBe(true);
  await expect.poll(async () => (await runState(page)).speed, { timeout: 8000 }).toBe(0);
  await shot(page, 't14-resting');
  const before = await runState(page);
  await page.waitForTimeout(2000);
  expect((await runState(page)).distance).toBe(before.distance);

  await footage(page, 'strikes', { from: 1 });
  await expect.poll(async () => (await runState(page)).speed, { timeout: 10_000 }).toBeGreaterThan(1);
});

/** Says what the hand close-ups are reading, so a test doesn't depend on a fist in the footage. */
const handReads = (page, state) => page.evaluate((reading) => {
  window.__game.reader.hands.stateOf = () => reading;
}, state);

test('raising an open hand is a jump, for a child who can\'t jump safely', async ({ page }) => {
  await reachRun(page, { jumpWith: 'reach' });
  await nextObstacleIs(page, 'log', 9);
  await expect(page.locator('#coach-text')).toHaveText('Raise your open right hand!', { timeout: 10_000 });
  await shot(page, 't15-raise-hand');
  await expect(page.locator('#coach-demo')).toBeVisible();
  expect(await page.evaluate(() => window.__game.game.demo.playing.name)).toBe('raise');

  // Star jumps have both arms going up, and only the hand reading decides what counts.
  await handReads(page, 'open');
  await footage(page, 'star-jumps');
  await expect.poll(async () => (await runState(page)).stats.cleared, { timeout: 15_000 }).toBe(1);
  const { stats } = await runState(page);
  expect(stats.hands.open).toBeGreaterThanOrEqual(1);
});

test('a raised fist isn\'t a jump: it\'s asked to open, and nothing else happens', async ({ page }) => {
  await reachRun(page, { jumpWith: 'reach' });
  await nextObstacleIs(page, 'log', 9);
  await expect.poll(async () => (await runState(page)).waiting, { timeout: 15_000 }).toBe(true);
  await handReads(page, 'closed');
  await footage(page, 'star-jumps');
  await expect(prompt(page)).toContainText('Open your right hand!', { timeout: 15_000 });
  await page.waitForTimeout(1500);
  const { stats, next } = await runState(page);
  expect(stats.jumps).toBe(0);
  expect(next.kind).toBe('log');
});

test('a hand that can\'t be read doesn\'t count either', async ({ page }) => {
  await reachRun(page, { jumpWith: 'reach' });
  await nextObstacleIs(page, 'log', 9);
  await handReads(page, null);
  await footage(page, 'star-jumps');
  await page.waitForTimeout(3000);
  expect((await runState(page)).stats.jumps).toBe(0);
});

test('raising a hand only asks for the top half of the child, and leaning moves across', async ({ page }) => {
  await openTrail(page, { jumpWith: 'reach' });
  // Feet out of the picture, as they would be sitting down.
  await footage(page, 'strikes', { from: 0.2, playing: false, height: 1.6, shiftY: 0.15 });
  await toChoosing(page);
  await recordScreens(page);
  await page.locator('#run-start').click();
  // The body check passes in a moment, as the top half is all it wants, so it's looked for afterwards.
  await waitForScreen(page, 'practice');
  expect(await screensSeen(page)).toContain('bodycheck');
  await expect(page.locator('#coach-text')).toHaveText('Raise your open hand as high as you can!');
  await expect(page.locator('#practice-count')).toHaveText('1 / 2');
  await page.evaluate(() => window.__game.game.practice.succeed());
  await expect(page.locator('#coach-text')).toHaveText('Lean to the side!', { timeout: 8000 });
  await page.locator('#practice-skip').click();
  await waitForScreen(page, 'run');
  const needs = await page.evaluate(() => window.__game.run.course.map(({ needs: need }) => need));
  expect(new Set(needs)).toEqual(new Set(['jump']));
});

test('the grown-ups\' panel pauses the run and remembers what it\'s told', async ({ page }) => {
  await reachRun(page);
  await page.locator('#open-panel').click();
  await expect(page.locator('#panel')).toBeVisible();
  await shot(page, 't16-panel');
  const paused = await runState(page);
  await page.waitForTimeout(600);
  expect((await runState(page)).distance).toBe(paused.distance);

  // How a jump is made, how big a move has to be and which side is worked on go on to the run at once: it
  // carries on from where it was.
  await page.locator('input[name="jumpWith"][value="reach"]').check();
  await expect(page.locator('body')).toHaveAttribute('data-jump-with', 'reach');
  await page.locator('input[name="moveSize"][value="tiny"]').check();
  await page.locator('input[name="hands"][value="left"]').check();
  await page.locator('#close-panel').click();
  await expect.poll(async () => (await runState(page)).distance).toBeGreaterThan(paused.distance);
  expect(await page.evaluate(() => window.__game.screen)).toBe('run');
  // The pace, the length, what a missed move does and the lanes change what the run is: it starts again, from
  // the check that the child can be seen. See start-again.spec.js.
  await page.locator('#open-panel').click();
  await page.locator('input[name="trailPace"][value="fast"]').check();
  await page.locator('input[name="obstacles"][value="40"]').check();
  await page.locator('input[name="onMissed"][value="stumble"]').check();
  await page.locator('input[name="trailLanes"][value="no"]').check();
  await page.locator('#close-panel').click();
  await expect.poll(() => page.evaluate(() => window.__game.screen)).not.toBe('run');

  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'yes');
  await page.locator('#open-panel').click();
  for (const [name, value] of [['jumpWith', 'reach'], ['trailPace', 'fast'], ['obstacles', '40'], ['onMissed', 'stumble'], ['trailLanes', 'no'], ['moveSize', 'tiny'], ['hands', 'left']]) {
    await expect(page.locator(`input[name="${name}"][value="${value}"]`)).toBeChecked();
  }
});

test('settings shared with the other games carry across', async ({ page }) => {
  await openTrail(page, { hands: 'left', language: 'ka', fighter: 'kit', moveSize: 'medium' });
  await expect(page.locator('#chosen-name')).toHaveText('Kit');
  await page.goto('/games/mighty-moves/index.html?debug');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'yes');
  await expect(page.locator('#chosen-name')).toHaveText('Kit');
  expect(await page.evaluate(() => {
    const { settings } = window.__game.game;
    return [settings.hands, settings.language, settings.moveSize];
  })).toEqual(['left', 'ka', 'medium']);
});
