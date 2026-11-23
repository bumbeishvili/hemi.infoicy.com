// Giraffe's Riddle Doors' ten levels: what each brings is on the title card and under the countdown, each level's new
// kind of riddle comes first, with its label, and opens with the piece that fits, and nothing flashes, at level 1 or at
// level 10, through a door opening, a piece that doesn't fit and the last candle going out.
import { openGame, shot } from '../helpers.js';
import { expect, expectSoon, GAME, judge, labelShown, leadHand, OPEN, show, startPlaying, state, stopHand, test, waitForScreen, watchBrightness } from './helpers.js';

const NEW_AT = {
  2: ['Two things change', 'two', 4],
  3: ['Counting', 'count', 4],
  4: ['Bigger and smaller', 'grow', 4],
  5: ['Turning arrows', 'turn', 4],
  6: ['Each one once in a row', 'once', 5],
  7: ['Putting together', 'add', 5],
  8: ['Taking away', 'take', 5],
  9: ['Two rules at once', 'double', 6],
  10: ['Inside and outside', 'inside', 6],
};
const atLevel = (level, more = {}) => ({ levels: { [GAME]: level }, ...more });
const guess = '(doors, at) => doors.wants(at, { right: false })';

test('the title card says what each level brings, and level 1 is the plain riddles', async ({ page }) => {
  await openGame(page, {}, GAME);
  await expect(page.locator('#level-badge')).toHaveText('Level 1 of 10');
  await expect(page.locator('#level-new')).toBeEmpty();
  for (const [level, [name]] of Object.entries(NEW_AT)) {
    await page.locator('#open-panel').click();
    await page.locator('#level-choice label', { hasText: new RegExp(`^\\s*${level}\\s*$`) }).click();
    await page.locator('#close-panel').click();
    await expect(page.locator('#level-badge')).toHaveText(`Level ${level} of 10`);
    await expect(page.locator('#level-new')).toContainText(name);
  }
  await shot(page, 'doors-title-level-10');
});

test('under the countdown it says what\'s new, in Georgian too, and the riddle\'s label is Georgian', async ({ page }) => {
  await openGame(page, { language: 'ka', ...atLevel(7) }, GAME);
  await show(page, ...OPEN);
  await page.locator('#start').click();
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-new-now')).toContainText('შეერთება');
  await waitForScreen(page, 'playing');
  await expect(page.locator('#story-line')).toHaveText(/[Ⴀ-ჿ]/);
  await expectSoon(() => page.evaluate(() => window.__game.view.labels[0]?.text ?? ''), { timeout: 10_000 }).toMatch(/[Ⴀ-ჿ]/);
});

for (const [level, [, kind, choices]] of Object.entries(NEW_AT)) {
  test(`level ${level}: the first door is the new kind of riddle, ${kind}, with ${choices} pieces and its label, and the piece that fits opens it`, async ({ page }) => {
    test.setTimeout(120_000);
    await startPlaying(page, atLevel(Number(level)));
    const start = await state(page);
    expect(start.kind).toBe(kind);
    expect(start.kinds[Math.floor(start.total / 2)]).toBe(kind);
    expect(start.size).toBe(level === '2' ? 2 : 3);
    expect(start.tiles).toHaveLength(choices);
    await expectSoon(() => labelShown(page, kind), { timeout: 8000 }).toBe(true);
    await page.waitForTimeout(1500);
    await shot(page, `doors-level-${level}-${kind}`);
    await leadHand(page);
    await expectSoon(async () => (await state(page)).phase).toBe('open');
    await stopHand(page);
  });
}

test('a child who has been on a door a while sees the row with the gap lit up, so nobody is stuck', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page, atLevel(3));
  // The hand stays in the picture, over the door, and doesn't pick anything up.
  await leadHand(page, { target: '() => ({ x: 1, y: 0.95 })' });
  await page.waitForTimeout(5000);
  expect((await state(page)).look).toBe(0);
  await expectSoon(async () => (await state(page)).look, { timeout: 40_000 }).toBeGreaterThan(0.9);
  await shot(page, 'doors-look');
  // It's still the child who chooses: nothing has been picked up or tried for them.
  const now = await state(page);
  expect(now.stats.picks).toBe(0);
  expect(now.phase).toBe('play');
  await stopHand(page);
});

for (const level of [1, 10]) {
  test(`nothing flashes at level ${level}: carrying, a piece tried, a door opening and the next one coming, the brightness stays steady`, async ({ page }) => {
    test.setTimeout(240_000);
    await startPlaying(page, atLevel(level));
    // A piece that doesn't fit first, with its little shake of the door, then the one that does.
    await leadHand(page, { target: `(doors, at) => (doors.stats.wrong ? doors.wants(at) : doors.wants(at, { right: false }))` });
    await expectSoon(async () => (await state(page)).held, { timeout: 20_000 }).not.toBe(null);
    const playing = judge(await watchBrightness(page, 360));
    console.log(`level ${level} playing`, JSON.stringify(playing));
    expect(playing.biggestStep).toBeLessThan(4);
    expect(playing.flickeringShare).toBeLessThan(0.01);
    expect((await state(page)).stats.wrong).toBe(1);
    await expectSoon(async () => (await state(page)).phase, { timeout: 60_000 }).toBe('open');
    const opening = judge(await watchBrightness(page, 300));
    console.log(`level ${level} a door opening`, JSON.stringify(opening));
    expect(opening.biggestStep).toBeLessThan(4);
    expect(opening.flickeringShare).toBeLessThan(0.01);
    await stopHand(page);
  });
}

test('nothing flashes as the last candle goes out: the hall dims slowly', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, atLevel(10));
  await leadHand(page, { target: guess });
  await expectSoon(async () => (await state(page)).stats.wrong, { timeout: 90_000 }).toBe(2);
  // The third, and the hall dimming, watched all the way through.
  const result = judge(await watchBrightness(page, 480));
  console.log('the last candle going out', JSON.stringify(result));
  await expectSoon(async () => (await state(page)).lost, { timeout: 20_000 }).toBe(true);
  expect(result.biggestStep).toBeLessThan(4);
  expect(result.flickeringShare).toBeLessThan(0.01);
  await stopHand(page);
});
