// Flap, Little Chick!'s ten levels: what each brings is on the title card and under the countdown, each new thing
// comes along and works in the real game, and nothing flashes, at level 1 or at level 10 with all of it about.
import { shot } from '../helpers.js';
import { DOWN, expect, expectSoon, flapHands, GAME, hands, judge, labelShown, openGame, startPlaying, state, stopHands, test, untilNear, UP, waitForScreen, watchBrightness } from './helpers.js';

const NEW_AT = {
  2: 'Corn to catch',
  3: 'Fences',
  4: 'The pond',
  5: 'The scarecrow',
  6: 'A gust of wind',
  7: 'Hay bales',
  8: 'The friendly duck',
  9: 'The tractor',
  10: 'The fox’s shortcut',
};
const GLIDE_HINT = 'Keep your hands up to glide!';
const UNDER_HINT = 'Hands down to go under!';
const atLevel = (level, more = {}) => ({ levels: { [GAME]: level }, ...more });

/** Starts a level with the hands down from the countdown on, so the chick runs up to the first thing and waits. */
async function startResting(page, level, more = {}) {
  await openGame(page, atLevel(level, more), GAME);
  await hands(page);
  await page.locator('#start').click();
  await waitForScreen(page, 'countdown');
  await hands(page, DOWN, DOWN);
  await waitForScreen(page, 'playing');
}

test('the title card says what each level brings, and level 1 is the plain game', async ({ page }) => {
  await openGame(page, {}, GAME);
  await expect(page.locator('#level-badge')).toHaveText('Level 1 of 10');
  await expect(page.locator('#level-new')).toBeEmpty();
  for (const [level, name] of Object.entries(NEW_AT)) {
    await page.locator('#open-panel').click();
    await page.locator('#level-choice label', { hasText: new RegExp(`^\\s*${level}\\s*$`) }).click();
    await page.locator('#close-panel').click();
    await expect(page.locator('#level-badge')).toHaveText(`Level ${level} of 10`);
    await expect(page.locator('#level-new')).toContainText(name);
  }
  await page.waitForTimeout(300);
  await shot(page, 'flap-title-level-10');
});

test('under the countdown it says what\'s new, in Georgian too', async ({ page }) => {
  await openGame(page, atLevel(6, { language: 'ka' }), GAME);
  await hands(page);
  await page.locator('#start').click();
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-new-now')).toContainText('ქარის ნაკადი');
  await expect(page.locator('#level-now')).toHaveText('დონე 6');
  // The wings follow the hands already, so the child can find them.
  await expectSoon(async () => (await state(page)).drawn.right, { timeout: 5000 }).toBeGreaterThan(0.8);
  await page.waitForTimeout(300);
  await shot(page, 'flap-countdown');
});

test('level 2: corn hangs in the air along the way a flap goes, the chick has what it flies through, and it\'s counted', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, atLevel(2));
  await expect(page.locator('#chip-corn-box')).toBeVisible();
  await expect(page.locator('#chip-corn')).toHaveText('0');
  const start = await state(page);
  expect(start.corn).toBeGreaterThanOrEqual(30);
  await flapHands(page);
  await expectSoon(async () => (await state(page)).stats.corn, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  await expect(page.locator('#chip-corn')).toHaveText(/^[1-9]/);
  expect(await labelShown(page, 'corn')).toBe(true);
  await shot(page, 'flap-corn');
  // Two logs' worth: a child who flaps on the painted stretch has most of it.
  await expectSoon(async () => (await state(page)).stats.cleared, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  expect((await state(page)).stats.corn).toBeGreaterThanOrEqual(4);
  await stopHands(page);
});

test('level 3: a fence is first, with its label, and both wings together take the chick cleanly over it', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, atLevel(3));
  const start = await state(page);
  expect(start.things[0]).toMatchObject({ kind: 'fence', wings: 2 });
  await flapHands(page);
  await expectSoon(() => labelShown(page, 'fence'), { timeout: 8000 }).toBe(true);
  await expectSoon(async () => (await state(page)).things[0].done, { timeout: 25_000 }).toBe(true);
  const over = await state(page);
  expect(over.things[0].clean).toBe(true);
  expect(over.stats.together).toBeGreaterThanOrEqual(1);
  expect(over.stats.tumbles).toBe(0);
  await stopHands(page);
});

test('level 4: the chick stops at the pond\'s bank, a hop let go at once comes down in the water, and hands kept up carry it over the next one', async ({ page }) => {
  test.setTimeout(180_000);
  await startResting(page, 4);
  await expectSoon(async () => (await state(page)).chick.waiting?.kind, { timeout: 20_000 }).toBe('pond');
  expect(await labelShown(page, 'pond')).toBe(true);
  // One hand up, and down again straight away.
  await hands(page, DOWN, UP);
  await expectSoon(async () => (await state(page)).chick.air, { timeout: 4000, intervals: [50] }).toBe(true);
  await hands(page, DOWN, DOWN);
  await expectSoon(async () => (await state(page)).stats.splashes, { timeout: 8000, intervals: [50] }).toBe(1);
  await page.waitForTimeout(250);
  await shot(page, 'flap-splash');
  expect((await state(page)).chick.state).toBe('splash');
  // It flutters out onto the far bank, and runs on: nothing is done twice.
  await expectSoon(async () => (await state(page)).chick.state, { timeout: 5000 }).toBe('run');
  const out = await state(page);
  expect(out.things[0].done).toBe(true);
  expect(out.chick.x).toBeGreaterThan(out.things[0].x1);
  expect(out.fox.gap).toBeCloseTo(3.4 - 0.85, 5);
  // Played on: as the next pond comes, the child is told to keep their hands up, and with them up it's over.
  await flapHands(page);
  await untilNear(page, 'pond', 5);
  await expect(page.locator('#prompt-text')).toHaveText(GLIDE_HINT, { timeout: 5000 });
  await expectSoon(async () => (await state(page)).things[2].done, { timeout: 25_000 }).toBe(true);
  const over = await state(page);
  expect(over.things[2]).toMatchObject({ kind: 'pond', clean: true });
  expect(over.stats.splashes).toBe(1);
  await stopHands(page);
});

test('level 5: with the hands down the chick runs under the scarecrow, picking up the corn there', async ({ page }) => {
  test.setTimeout(150_000);
  await startResting(page, 5);
  expect((await state(page)).things[0].kind).toBe('scarecrow');
  await expectSoon(() => labelShown(page, 'scarecrow'), { timeout: 8000 }).toBe(true);
  await untilNear(page, 'scarecrow', 0.2);
  await shot(page, 'flap-scarecrow');
  await expectSoon(async () => (await state(page)).things[0].done, { timeout: 10_000 }).toBe(true);
  const under = await state(page);
  expect(under.things[0].clean).toBe(true);
  expect(under.stats.bonks).toBe(0);
  expect(under.stats.corn).toBeGreaterThanOrEqual(2);
  expect(under.stats.flaps).toEqual({ left: 0, right: 0 });
});

test('level 5: flying into the scarecrow\'s arm is a bump and a dizzy moment, and next time the child is told to keep their hands down', async ({ page }) => {
  test.setTimeout(180_000);
  await startResting(page, 5);
  // Both hands up just before him, and kept up.
  await untilNear(page, 'scarecrow', 2.4);
  await hands(page, UP, UP);
  await expectSoon(async () => (await state(page)).stats.bonks, { timeout: 8000, intervals: [50] }).toBe(1);
  const bumped = await state(page);
  expect(bumped.chick.dizzy).toBeGreaterThan(0);
  expect(bumped.things[0].bonked).toBe(true);
  expect(bumped.fox.gap).toBeCloseTo(3.4 - 0.85, 5);
  await page.waitForTimeout(200);
  await shot(page, 'flap-scarecrow-bump');
  // It drops, runs on under him, and is none the worse.
  await expectSoon(async () => (await state(page)).things[0].done, { timeout: 8000 }).toBe(true);
  expect((await state(page)).chick.state).toBe('run');
  expect(await page.evaluate(() => window.__game.game.hint)).toBe('under');
  // The level's other things come before the next scarecrow: it's brought nearer here, to see what's said as it comes.
  await page.evaluate(() => {
    const { farm } = window.__game;
    const at = farm.things.findIndex((thing) => thing.kind === 'scarecrow' && !thing.done);
    const removed = farm.things.splice(1, at - 1);
    const shift = farm.things[1].x0 - removed[0].x0;
    for (const thing of farm.things.slice(1)) {
      thing.x0 -= shift;
      thing.x1 -= shift;
    }
    for (const piece of farm.corn) piece.x -= piece.x > removed[0].x0 ? shift : 0;
    farm.end -= shift;
  });
  await hands(page, DOWN, DOWN);
  await untilNear(page, 'scarecrow', 5.5);
  await expect(page.locator('#prompt-text')).toHaveText(UNDER_HINT, { timeout: 5000 });
  await expectSoon(async () => (await state(page)).things[1].done, { timeout: 12_000 }).toBe(true);
  expect((await state(page)).things[1]).toMatchObject({ kind: 'scarecrow', clean: true });
  expect(await page.evaluate(() => window.__game.game.hint)).toBe(null);
});

test('level 6: one flap by one hand in the gust of wind, and the chick is carried up and over what\'s in it', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, atLevel(6));
  const start = await state(page);
  expect(start.things[0].kind).toBe('gust');
  expect(['pond', 'fence']).toContain(start.things[1].kind);
  await flapHands(page, { most: 1 });
  await expectSoon(async () => (await state(page)).chick.h, { timeout: 25_000, intervals: [50] }).toBeGreaterThan(2.6);
  await shot(page, 'flap-gust');
  expect(await labelShown(page, 'gust')).toBe(true);
  await expectSoon(async () => (await state(page)).things[1].done, { timeout: 15_000 }).toBe(true);
  const over = await state(page);
  expect(over.things[1].clean).toBe(true);
  expect(over.stats.splashes + over.stats.tumbles).toBe(0);
  expect(over.stats.flaps.left).toBe(0);
  await stopHands(page);
});

test('level 7: hay bales come in a row of three, and the chick gets along it, hop by hop', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, atLevel(7));
  const start = await state(page);
  expect(start.things.slice(0, 3).map((thing) => thing.kind)).toEqual(['hay', 'hay', 'hay']);
  await flapHands(page);
  await expectSoon(() => labelShown(page, 'hay'), { timeout: 8000 }).toBe(true);
  await expectSoon(async () => (await state(page)).things[0].done, { timeout: 25_000 }).toBe(true);
  await shot(page, 'flap-hay');
  await expectSoon(async () => (await state(page)).things[2].done, { timeout: 25_000 }).toBe(true);
  const along = await state(page);
  // A whole row is one thing got past, and nothing was tumbled over.
  expect(along.progress.past).toBe(1);
  expect(along.stats.tumbles + along.stats.hen).toBe(0);
  await stopHands(page);
});

test('level 8: a hop that would be a splash comes down on the friendly duck, and she gives the chick a ride to the bank', async ({ page }) => {
  test.setTimeout(180_000);
  await startResting(page, 8);
  await expectSoon(async () => (await state(page)).chick.waiting?.kind, { timeout: 20_000 }).toBe('duckpond');
  expect(await labelShown(page, 'duckpond')).toBe(true);
  // One hand up, and down again straight away: in a plain pond that's a splash.
  await hands(page, DOWN, UP);
  await expectSoon(async () => (await state(page)).chick.air, { timeout: 4000, intervals: [50] }).toBe(true);
  await hands(page, DOWN, DOWN);
  await expectSoon(async () => (await state(page)).chick.state, { timeout: 8000, intervals: [50] }).toBe('ride');
  await page.waitForTimeout(500);
  await shot(page, 'flap-duck-ride');
  const riding = await state(page);
  expect(riding.stats.rides).toBe(1);
  expect(riding.stats.splashes).toBe(0);
  // She swims it across, it hops off onto the bank, and runs on.
  await expectSoon(async () => (await state(page)).things[0].done, { timeout: 15_000 }).toBe(true);
  const across = await state(page);
  expect(across.chick.state).toBe('run');
  expect(across.fox.gap).toBeGreaterThanOrEqual(3.4);
});

test('level 9: on the ground the chick trots along behind the tractor, with no tumble, and both wings take it over the hay', async ({ page }) => {
  test.setTimeout(180_000);
  await startResting(page, 9);
  expect((await state(page)).things[0].kind).toBe('tractor');
  await expectSoon(async () => (await state(page)).chick.behind?.kind, { timeout: 20_000 }).toBe('tractor');
  expect(await labelShown(page, 'tractor')).toBe(true);
  await page.waitForTimeout(1500);
  const behind = await state(page);
  expect(behind.stats.tumbles).toBe(0);
  expect(behind.chick.waiting).toBe(null);
  expect(Math.abs(behind.chick.x - (behind.things[0].x0 - 0.36))).toBeLessThan(0.05);
  await shot(page, 'flap-behind-the-tractor');
  // Both hands up, and kept up: over it, with the corn off the top of the hay.
  await hands(page, UP, UP);
  await expectSoon(async () => (await state(page)).things[0].done, { timeout: 15_000 }).toBe(true);
  const over = await state(page);
  expect(over.things[0].away).toBe(false);
  expect(over.chick.x).toBeGreaterThan(over.things[0].x1);
  expect(over.stats.corn).toBeGreaterThanOrEqual(1);
});

test('level 10: the fox runs round behind the hedge and waits on the track, and leaps and misses as the chick flies over him', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, atLevel(10));
  const start = await state(page);
  const at = start.things.findIndex((thing) => thing.kind === 'fox');
  expect(at).toBeGreaterThan(0);
  expect(start.fox.mode).toBe('chase');
  await flapHands(page);
  await expectSoon(async () => (await state(page)).fox.mode, { timeout: 60_000, intervals: [50] }).toBe('dash');
  await page.waitForTimeout(700);
  await shot(page, 'flap-fox-shortcut');
  await expectSoon(async () => (await state(page)).fox.mode, { timeout: 10_000, intervals: [50] }).toBe('ahead');
  expect((await state(page)).things[at].waiting).toBe(true);
  await expectSoon(() => labelShown(page, 'fox'), { timeout: 15_000 }).toBe(true);
  await shot(page, 'flap-fox-ahead');
  await expectSoon(async () => (await state(page)).things[at].done, { timeout: 30_000 }).toBe(true);
  const over = await state(page);
  expect(over.things[at].clean).toBe(true);
  expect(over.fox.mode).toBe('chase');
  expect(over.fox.gap).toBeGreaterThanOrEqual(3.6);
  expect(over.stats.hen).toBe(0);
  await stopHands(page);
});

test('level 10: a chick that comes down in front of the fox is whisked on by the mother hen, and the fox sits down', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, atLevel(10));
  // The things before the fox are taken away, so he's first, and a child who only flaps one hand meets him.
  await page.evaluate(() => {
    const { farm } = window.__game;
    const at = farm.things.findIndex((thing) => thing.kind === 'fox');
    const shift = farm.things[at].x0 - 16;
    farm.things.splice(0, at);
    for (const thing of farm.things) {
      thing.x0 -= shift;
      thing.x1 -= shift;
      if (thing.duck) thing.duck.x -= shift;
    }
    farm.corn = farm.corn.filter((piece) => piece.x > shift + 16).map((piece) => Object.assign(piece, { x: piece.x - shift }));
    farm.end -= shift;
  });
  await flapHands(page, { most: 1 });
  await expectSoon(async () => (await state(page)).hen, { timeout: 60_000, intervals: [50] }).toEqual({ why: 'fox' });
  await page.waitForTimeout(900);
  await shot(page, 'flap-hen-and-fox');
  await expectSoon(async () => (await state(page)).chick.state, { timeout: 15_000 }).toBe('run');
  const after = await state(page);
  expect(after.things[0]).toMatchObject({ kind: 'fox', done: true });
  expect(after.chick.x).toBeGreaterThan(after.things[0].x1);
  expect(after.fox.mode).toBe('chase');
  expect(after.fox.gap).toBeGreaterThanOrEqual(3.6);
  expect(after.stats.hen).toBe(1);
  await stopHands(page);
});

for (const level of [1, 10]) {
  test(`nothing flashes at level ${level}: flaps, landings and everything going by, the brightness stays steady`, async ({ page }) => {
    test.setTimeout(180_000);
    await startPlaying(page, atLevel(level));
    await flapHands(page);
    await expectSoon(async () => (await state(page)).stats.flaps.right, { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
    const reading = judge(await watchBrightness(page, 540));
    console.log(`level ${level} on the farm`, JSON.stringify(reading));
    expect(reading.biggestStep).toBeLessThan(4);
    expect(reading.flickeringShare).toBeLessThan(0.01);
    expect((await state(page)).stats.cleared).toBeGreaterThanOrEqual(1);
    await stopHands(page);
  });
}

test('nothing flashes through a tumble either', async ({ page }) => {
  test.setTimeout(240_000);
  // A fence first: flapped at too early, with one hand, it's a tumble.
  await startPlaying(page, atLevel(3));
  await flapHands(page, { policy: 'early', most: 1 });
  await expectSoon(async () => (await state(page)).chick.x, { timeout: 20_000 }).toBeGreaterThan(4);
  const tumble = judge(await watchBrightness(page, 420));
  const tumbled = await state(page);
  console.log('a tumble', JSON.stringify({ ...tumble, tumbles: tumbled.stats.tumbles }));
  expect(tumbled.stats.tumbles).toBeGreaterThanOrEqual(1);
  expect(tumble.biggestStep).toBeLessThan(4);
  expect(tumble.flickeringShare).toBeLessThan(0.01);
  await stopHands(page);
});

test('nothing flashes through a splash and the mother hen\'s help', async ({ page }) => {
  test.setTimeout(240_000);
  // A pond first, and then a fence: a quick hop with one hand at each is a splash, and then three hops and the hen.
  await startPlaying(page, atLevel(4));
  await flapHands(page, { policy: 'clumsy', most: 1 });
  await expectSoon(async () => (await state(page)).chick.waiting?.kind, { timeout: 30_000 }).toBe('pond');
  const reading = judge(await watchBrightness(page, 1200));
  const after = await state(page);
  console.log('a splash and the hen', JSON.stringify({ ...reading, splashes: after.stats.splashes, hen: after.stats.hen }));
  expect(after.stats.splashes).toBeGreaterThanOrEqual(1);
  expect(after.stats.hen).toBeGreaterThanOrEqual(1);
  expect(reading.biggestStep).toBeLessThan(4);
  expect(reading.flickeringShare).toBeLessThan(0.01);
  await stopHands(page);
});
