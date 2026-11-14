// Playing Giraffe's Goal: the glove at the ring saves the ball, and enough saves win the match. In a real match, as it
// comes, a kicker shoots on the clock and the other team can win; in the gentle match a kicker shoots once the hand is
// open and held up, and nothing is lost. An open hand with its wrist dropped, or hanging down, doesn't count, unless a
// grown-up says any open hand will do. With real photos of hands through the real tracker.
import { openGame, shot } from '../helpers.js';
import {
  DROPPED, expect, expectSoon, FIST, GAME, GENTLE, HANGING, judge, keeperHand, NO_HAND, PALM, show, startPlaying, state, stopHand, test, waitForScreen,
  watchBrightness,
} from './helpers.js';

const HOLD_UP = 'Hold your hand up, like a high five!';
const labelShown = (page, key) => page.evaluate((wanted) => window.__game.view.introduced.has(wanted), key);

test('the open hand held up brings the kicker, the glove at the ring saves the ball, and six saves win the match', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, { goalSaves: 6 });
  const start = await state(page);
  // The hand check saw the palm held up, so that's how wide this hand looks held flat.
  expect(start.checked).toBe(true);
  expect(start.flat).toBeGreaterThan(0.6);
  expect(start.target).toBe(6);
  expect(start.kickers).toEqual([{ who: 'truffle', state: expect.any(String) }]);
  await expect(page.locator('#story-line')).toHaveText('It’s penalties! Will you be our goalkeeper?');
  await expect(page.locator('#chip-saves')).toHaveText('0 of 6');
  await expect(page.locator('#chip-stars-box')).toBeHidden();
  // Held up, it's ready, and the kicker runs up and shoots.
  await expectSoon(async () => (await state(page)).ready, { timeout: 10_000 }).toBe(true);
  await expectSoon(async () => (await state(page)).stats.shots, { timeout: 10_000 }).toBe(1);
  expect(await page.evaluate(() => document.body.dataset.film)).toBe('on');
  await page.waitForTimeout(700);
  await shot(page, 'goal-first-shot');

  // Led to each ring in turn, the saves add up, and the finish card comes.
  await keeperHand(page);
  await expectSoon(async () => (await state(page)).shots.some((each) => each.covered), { timeout: 20_000 }).toBe(true);
  await shot(page, 'goal-ring-covered');
  await expectSoon(async () => (await state(page)).stats.saves, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  await expect(page.locator('#chip-saves')).toHaveText(/^[1-6] of 6$/);
  // The film of what to do goes once there's a save.
  await expectSoon(() => page.evaluate(() => document.body.dataset.film), { timeout: 5000 }).toBe('off');
  await page.waitForTimeout(300);
  await shot(page, 'goal-first-save');
  await waitForScreen(page, 'finish');
  await stopHand(page);
  const end = await state(page);
  expect(end.stats.saves).toBe(6);
  expect(end.stats.goals).toBe(0);
  expect(end.stats.across).toBeGreaterThanOrEqual(1);
  await expect(page.locator('#screen-finish h2')).toHaveText('We won! What a goalkeeper!');
  await expect(page.locator('#finish-hero')).toHaveText('6');
  await expect(page.locator('#sum-right-saves')).toHaveText('6 of 6');
  await expect(page.locator('#sum-right-across')).toHaveText(String(end.stats.across));
  await expect(page.locator('#level-done-text')).toHaveText('Level 1 done! Next: level 2');
  await page.waitForTimeout(600);
  await shot(page, 'goal-finish');
});

// In the gentle match the kicker waits for a closed hand too. In a real match, only for a hand that isn't there.
for (const [name, scene, settings, match] of [['closed', FIST, GENTLE, 'in the gentle match'], ['missing', NO_HAND, {}, 'in a real match']]) {
  test(`${match}, with a ${name} hand the kicker waits, for as long as it takes, and shoots once the hand is held up`, async ({ page }) => {
    await openGame(page, settings, GAME);
    await show(page, ...PALM);
    await page.locator('#start').click();
    // From the countdown on, so nothing is kicked before the hand goes.
    await waitForScreen(page, 'countdown');
    await show(page, ...scene);
    await waitForScreen(page, 'playing');
    await page.waitForTimeout(5000);
    const resting = await state(page);
    expect(resting.ready).toBe(false);
    expect(resting.stats.shots).toBe(0);
    expect(resting.kickers[0].state).toBe('ready');
    await show(page, ...PALM);
    await expectSoon(async () => (await state(page)).stats.shots, { timeout: 10_000 }).toBe(1);
  });
}

for (const [name, scene, why] of [['its wrist dropped', DROPPED, 'tipped'], ['its fingers hanging down', HANGING, 'down']]) {
  test(`an open hand with ${name} is not ready: in the gentle match the kicker waits, the glove is yellow, and the child is shown how`, async ({ page }) => {
    test.setTimeout(120_000);
    await openGame(page, GENTLE, GAME);
    await show(page, ...PALM);
    await page.locator('#start').click();
    await waitForScreen(page, 'countdown');
    await show(page, ...scene);
    await waitForScreen(page, 'playing');
    // It's open, by the same measure as in every other game, and that isn't enough here.
    await expectSoon(() => page.evaluate(() => window.__game.monitor.snapshot.handOpen), { timeout: 10_000 }).toBe(true);
    await page.waitForTimeout(4000);
    const low = await state(page);
    expect(low.heldUp).toBe(false);
    expect(low.why).toBe(why);
    expect(low.ready).toBe(false);
    expect(low.stats.shots).toBe(0);
    expect(await page.evaluate(() => window.__game.gloves.right.status)).toBe('closed');
    // What to do is said, and the little film of it comes back.
    await expect(page.locator('#prompt-text')).toHaveText(HOLD_UP);
    expect(low.film).toBe('on');
    await page.waitForTimeout(300);
    await shot(page, `goal-hand-${why}`);
    // Held up, it's ready within a moment, the glove goes green, and the kicker shoots.
    await show(page, ...PALM);
    await expectSoon(async () => (await state(page)).ready, { timeout: 2000, intervals: [50] }).toBe(true);
    expect(await page.evaluate(() => window.__game.gloves.right.status)).toBe('open');
    await expectSoon(async () => (await state(page)).stats.shots, { timeout: 10_000 }).toBe(1);
    await expect(page.locator('#prompt-text')).not.toHaveText(HOLD_UP);
  });
}

test('a ball on its way is not saved by a hand whose wrist drops, and is saved by one held up at its ring', async ({ page }) => {
  test.setTimeout(120_000);
  // The gentle match, so the kicker waits for the hand after the first goes in.
  await startPlaying(page, GENTLE);
  // The first: the hand is led to the ring, but with its wrist dropped by the time the ball comes.
  await keeperHand(page);
  await expectSoon(async () => (await state(page)).shots[0]?.t ?? 0, { timeout: 20_000 }).toBeGreaterThan(0.4);
  await keeperHand(page, { shorten: 0.5 });
  await expectSoon(async () => (await state(page)).stats.goals, { timeout: 20_000 }).toBe(1);
  expect((await state(page)).stats.saves).toBe(0);
  // The kicker waits again. Held up, the next is saved.
  await page.waitForTimeout(2500);
  expect((await state(page)).stats.shots).toBe(1);
  await keeperHand(page);
  await expectSoon(async () => (await state(page)).stats.saves, { timeout: 30_000 }).toBe(1);
  await stopHand(page);
});

test('a grown-up can say that any open hand saves: then the hand with its wrist dropped brings the kicker and saves', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page, { goalWrist: 'any' });
  await keeperHand(page, { shorten: 0.5 });
  await expectSoon(async () => (await state(page)).stats.saves, { timeout: 40_000 }).toBeGreaterThanOrEqual(1);
  const now = await state(page);
  expect(now.ready).toBe(true);
  expect(now.tip).toBeGreaterThan(45);
  await stopHand(page);
  // And in the panel it's one of four choices, kept for next time.
  await page.locator('#open-panel').click();
  await expect(page.locator('input[name="goalWrist"]')).toHaveCount(4);
  await expect(page.locator('input[name="goalWrist"][value="any"]')).toBeChecked();
  await page.locator('input[name="goalWrist"][value="upright"]').check();
  await page.locator('#close-panel').click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('camera-games-settings')).goalWrist)).toBe('upright');
});

test('how far the hand has to be held up is the grown-ups\' choice: tipped a little saves with a little, and not with right up', async ({ page }) => {
  test.setTimeout(150_000);
  // The palm at 80% of its height, as a hand tipped 37° looks.
  await startPlaying(page, { goalWrist: 'little' });
  await show(page, null, 'palm', { scale: 0.62, shorten: 0.8 });
  await page.waitForTimeout(1500);
  const little = await state(page);
  expect(little.tip).toBeGreaterThan(25);
  expect(little.tip).toBeLessThan(45);
  expect(little.ready).toBe(true);
  // Right up: the same hand isn't held up enough, and flat to the camera it is.
  await page.locator('#open-panel').click();
  await page.locator('input[name="goalWrist"][value="upright"]').check();
  await page.locator('#close-panel').click();
  await page.waitForTimeout(1500);
  const upright = await state(page);
  expect(upright.ready).toBe(false);
  expect(upright.why).toBe('tipped');
  await show(page, ...PALM);
  await expectSoon(async () => (await state(page)).ready, { timeout: 3000 }).toBe(true);
});

test('a real hand wobbles: tipping to and fro, turning and shaking, it stays ready, and saves ball after ball', async ({ page }) => {
  test.setTimeout(240_000);
  // Held up more is asked for, a limit of 40°, and the hand tips to and fro between flat and 39°.
  await openGame(page, { goalSaves: 6, goalWrist: 'more' }, GAME);
  // In the hand check too: it tips a little to and fro, and turns a little, all the while.
  await page.evaluate(() => {
    let frame = 0;
    window.__wobble = setInterval(() => {
      frame += 1;
      window.__camera.show({ left: null, right: 'palm', scale: 0.62, shorten: 1 - 0.1 * (0.5 + 0.5 * Math.sin(frame * 0.9)), rotate: 8 * Math.sin(frame * 0.37) });
    }, 33);
  });
  await page.locator('#start').click();
  await waitForScreen(page, 'countdown');
  await page.evaluate(() => clearInterval(window.__wobble));
  await keeperHand(page, { wobble: 1 });
  await waitForScreen(page, 'playing');
  // Watched every frame for as long as it plays: how often the hand that's in the picture isn't ready.
  await page.evaluate(() => {
    window.__watch = { frames: 0, unready: 0, longest: 0, run: 0 };
    const look = () => {
      const { game, gloves } = window.__game;
      if (window.__game.screen === 'playing' && gloves.right.visible) {
        const watch = window.__watch;
        watch.frames += 1;
        watch.run = game.ready ? 0 : watch.run + 1;
        watch.unready += game.ready ? 0 : 1;
        watch.longest = Math.max(watch.longest, watch.run);
      }
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
  await waitForScreen(page, 'finish');
  await stopHand(page);
  const end = await state(page);
  const watch = await page.evaluate(() => window.__watch);
  console.log('wobbling hand', JSON.stringify({ ...watch, saves: end.stats.saves, goals: end.stats.goals, flat: end.flat }));
  expect(end.stats.saves).toBe(6);
  expect(end.stats.goals).toBeLessThanOrEqual(1);
  expect(watch.frames).toBeGreaterThan(600);
  // Ready all but a moment of the time, and never unready for as long as a third of a second.
  expect(watch.unready / watch.frames).toBeLessThan(0.03);
  expect(watch.longest).toBeLessThan(20);
});

test('a hand check made with the wrist dropped is not believed: that hand still has to come up to play', async ({ page }) => {
  test.setTimeout(120_000);
  // The gentle match, whose kicker waits for a hand that's ready.
  await openGame(page, GENTLE, GAME);
  await show(page, ...DROPPED);
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
  await page.waitForTimeout(4000);
  const low = await state(page);
  expect(low.checked).toBe(false);
  expect(low.ready).toBe(false);
  expect(low.stats.shots).toBe(0);
  await show(page, ...PALM);
  await expectSoon(async () => (await state(page)).stats.shots, { timeout: 10_000 }).toBe(1);
});

test('the glove is bigger the further the thumb is out of the palm, and says so the first time', async ({ page }) => {
  test.setTimeout(120_000);
  // The hand check is of the open hand whose thumb is right out.
  await openGame(page, {}, GAME);
  await show(page, null, 'open', { scale: 0.62 });
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
  await expectSoon(async () => (await state(page)).big, { timeout: 10_000 }).toBeGreaterThan(0.95);
  // The glove is at its biggest, about a third bigger than its smallest, and a label says so.
  await page.waitForTimeout(800);
  const wide = await state(page);
  expect(wide.ready).toBe(true);
  expect(wide.palm / wide.palmSize).toBeGreaterThan(1.28);
  expect(wide.palm / wide.palmSize).toBeLessThan(1.34);
  await expectSoon(() => labelShown(page, 'big'), { timeout: 10_000 }).toBe(true);
  await page.waitForTimeout(400);
  await shot(page, 'goal-big-glove');
  // The palm photo's thumb is only part of the way out: the glove is smaller, and still bigger than plain.
  await show(page, ...PALM);
  await expectSoon(async () => (await state(page)).big, { timeout: 10_000 }).toBeLessThan(0.8);
  await page.waitForTimeout(1200);
  const part = await state(page);
  expect(part.big).toBeGreaterThan(0.25);
  expect(part.palm).toBeLessThan(wide.palm * 0.95);
  expect(part.palm).toBeGreaterThan(part.palmSize * 1.05);
  // A fist has the plain glove.
  await show(page, ...FIST);
  await expectSoon(async () => (await state(page)).big, { timeout: 10_000 }).toBeLessThan(0.05);
  expect((await state(page)).palm / (await state(page)).palmSize).toBeLessThan(1.03);
});

test('a hand tipped a little keeps its glove full length, and one tipped right over has a short glove, not a wide one', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page);
  await expectSoon(async () => (await state(page)).ready, { timeout: 10_000 }).toBe(true);
  await page.waitForTimeout(1000);
  const flat = await state(page);
  // Tipped about 25 degrees: no shorter.
  await show(page, null, 'palm', { scale: 0.62, shorten: 0.9 });
  await page.waitForTimeout(1200);
  const little = await state(page);
  expect(Math.abs(little.palm - flat.palm) / flat.palm).toBeLessThan(0.03);
  // Tipped about 60 degrees: the glove is about half as long, so it's as wide as it was.
  await show(page, ...DROPPED);
  await page.waitForTimeout(1200);
  const dropped = await state(page);
  expect(dropped.palm / flat.palm).toBeGreaterThan(0.44);
  expect(dropped.palm / flat.palm).toBeLessThan(0.7);
});

test('with the left hand, the balls go out to the left and across to the right, and Giraffe stands on the right', async ({ page }) => {
  test.setTimeout(180_000);
  await openGame(page, { hands: 'left', goalSaves: 6 }, GAME);
  await show(page, 'palm', null, { scale: 0.62 });
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
  expect((await state(page)).sign).toBe(-1);
  await keeperHand(page, { side: 'left' });
  // The first is near the hand, on its own side: left of the middle.
  await expectSoon(async () => (await state(page)).shots[0]?.to.x ?? 1, { timeout: 15_000 }).toBeLessThan(0.5);
  await waitForScreen(page, 'finish');
  await stopHand(page);
  const end = await state(page);
  expect(end.stats.saves).toBe(6);
  expect(end.stats.across).toBeGreaterThanOrEqual(1);
  await expect(page.locator('#sum-left-saves')).toHaveText(/^6 of \d+$/);
  await expect(page.locator('#sum-right-saves')).toHaveText('');
});

/* ---------- a real match, which the other team can win ---------- */

test('in a real match the kicker shoots at a closed hand too, the goals count, and enough of them lose the match kindly', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, { goalSaves: 6 });
  await expect(page.locator('#chip-goals-box')).toBeVisible();
  await expect(page.locator('#chip-goals')).toHaveText('0 of 4');
  // A closed hand: nobody waits for it. The first ball comes, and goes in.
  await show(page, ...FIST);
  await expectSoon(async () => (await state(page)).stats.shots, { timeout: 10_000 }).toBe(1);
  await expectSoon(async () => (await state(page)).stats.goals, { timeout: 10_000 }).toBe(1);
  await expect(page.locator('#chip-goals')).toHaveText('1 of 4');
  // Three more, and the other team has won. Nothing flashes as the last goes in and they cheer.
  await expectSoon(async () => (await state(page)).stats.goals, { timeout: 40_000 }).toBe(3);
  const reading = judge(await watchBrightness(page, 400));
  console.log('the last goal and the other team cheering', JSON.stringify(reading));
  expect(reading.biggestStep).toBeLessThan(4);
  expect(reading.flickeringShare).toBeLessThan(0.01);
  await waitForScreen(page, 'finish');
  const end = await state(page);
  expect(end.phase).toBe('lost');
  expect(end.stats.goals).toBe(4);
  expect(end.stats.saves).toBe(0);
  await expect(page.locator('#screen-finish h2')).toHaveText('The other team won the shoot-out!');
  await expect(page.locator('#play-again')).toHaveText('Try again');
  // Nothing is cheered, and the voice says what it says after any game that was lost.
  expect(await page.evaluate(() => window.__game.sound.finished)).toEqual({ line: 'So close! Try again!', lost: true });
  expect(await page.evaluate(() => window.__game.hud.confetti.running)).toBe(false);
  await expect(page.locator('#level-done-text')).toHaveText('Let’s try level 1 again!');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('camera-games-settings')).levels?.['giraffe-goal'] ?? 1)).toBe(1);
  await page.waitForTimeout(800);
  await shot(page, 'goal-lost');
  // Trying again is the same level, and the same real match.
  await show(page, ...PALM);
  await page.locator('#play-again').click();
  await waitForScreen(page, 'playing');
  expect((await state(page)).level).toBe(1);
  await expect(page.locator('#chip-goals')).toHaveText('0 of 4');
});

test('in a real match a ball on its way stops where it is while the hand is out of the picture, and goes on when it is back', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page);
  await expectSoon(async () => (await state(page)).shots[0]?.t ?? 0, { timeout: 15_000 }).toBeGreaterThan(0.2);
  await show(page, ...NO_HAND);
  await page.waitForTimeout(1000);
  const away = (await state(page)).shots[0];
  await page.waitForTimeout(4000);
  const later = await state(page);
  expect(later.shots[0].t).toBe(away.t);
  expect(later.stats.goals).toBe(0);
  // Back, and the glove at its ring saves it.
  await show(page, ...PALM);
  await keeperHand(page);
  await expectSoon(async () => (await state(page)).stats.saves, { timeout: 20_000 }).toBe(1);
  await stopHand(page);
});

test('the gentle match can be chosen under the gear icon: no goals are counted, and the kicker waits', async ({ page }) => {
  await startPlaying(page, GENTLE);
  await expect(page.locator('#chip-goals-box')).toBeHidden();
  await show(page, ...FIST);
  await page.waitForTimeout(5000);
  expect((await state(page)).stats.shots).toBe(0);
  await page.locator('#open-panel').click();
  await expect(page.locator('input[name="goalStakes"][value="gentle"]')).toBeChecked();
});
