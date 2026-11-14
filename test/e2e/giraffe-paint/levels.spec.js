// Giraffe's Paint Box's ten levels: each is its own picture, what each brings is on the title card and under the
// countdown, each new thing comes along and works in the real game, and nothing flashes, at level 1 or at level 10
// with all of it about.
import { openGame, shot } from '../helpers.js';
import { dipIn, dotOf, expect, expectSoon, GAME, judge, leadHand, OPEN, paintAt, part, potOf, show, startPlaying, state, stopHand, test, waitForScreen, watchBrightness } from './helpers.js';

const NEW_AT = {
  2: 'Rainbow paint',
  3: 'The star stamp',
  4: 'The big brush',
  5: 'A hidden friend',
  6: 'Mirror painting',
  7: 'The mixing dish',
  8: 'Colour by numbers',
  9: 'Paint balloons',
  10: 'A space to draw in',
};
const PICTURES = ['giraffe', 'balloons', 'cake', 'lighthouse', 'garden', 'butterfly', 'car', 'robot', 'ship', 'party'];
const atLevel = (level, more = {}) => ({ levels: { [GAME]: level }, ...more });
const labelShown = (page, key) => page.evaluate((wanted) => window.__game.view.introduced.has(wanted), key);
/** What's still to paint of a part, as a target for leadHand: somewhere in the middle of it, until it's done. */
const restOf = (id) => `(painting) => { const part = painting.parts.find((each) => each.id === '${id}'); return part.done ? null : painting.emptiest(part); }`;
const farFrom = async (page, where) => {
  const { at } = await state(page);
  return at ? Math.hypot(at.x - where.x, at.y - where.y) : 999;
};

test('the title card says what each level brings, each level is its own picture, and level 1 is the plain game', async ({ page }) => {
  test.setTimeout(120_000);
  await openGame(page, {}, GAME);
  await expect(page.locator('#level-badge')).toHaveText('Level 1 of 10');
  await expect(page.locator('#level-new')).toBeEmpty();
  expect((await state(page)).page).toBe('giraffe');
  let parts = (await state(page)).toPaint;
  for (const [level, name] of Object.entries(NEW_AT)) {
    await page.locator('#open-panel').click();
    await page.locator('#level-choice label', { hasText: new RegExp(`^\\s*${level}\\s*$`) }).click();
    await page.locator('#close-panel').click();
    await expect(page.locator('#level-badge')).toHaveText(`Level ${level} of 10`);
    await expect(page.locator('#level-new')).toContainText(name);
    // The picture behind the title card is that level's, with more parts than the one before.
    await expectSoon(async () => (await state(page)).page, { timeout: 5000 }).toBe(PICTURES[level - 1]);
    const now = await state(page);
    expect(now.toPaint).toBeGreaterThan(parts);
    parts = now.toPaint;
  }
  await shot(page, 'paint-title-level-10');
});

test('under the countdown it says what\'s new, in Georgian too', async ({ page }) => {
  test.setTimeout(120_000);
  await openGame(page, { language: 'ka', ...atLevel(5) }, GAME);
  await show(page, ...OPEN);
  await page.locator('#start').click();
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-new-now')).toContainText('დამალული მეგობარი');
  await expect(page.locator('#level-now')).toHaveText('დონე 5');
  await waitForScreen(page, 'playing');
  await expect(page.locator('#story-line')).toHaveText(/[Ⴀ-ჿ]/);
  // The new thing's label is in Georgian too.
  await expectSoon(() => page.evaluate(() => window.__game.view.labels[0]?.text ?? ''), { timeout: 15_000 }).toMatch(/[Ⴀ-ჿ]/);
});

test('level 2: the rainbow pot gives rainbow paint, which only the part that asks for it takes', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, atLevel(2));
  const start = await state(page);
  expect(start.pots.at(-1)).toMatchObject({ kind: 'colour', colour: 'rainbow' });
  expect(start.parts.find((each) => each.id === 'balloon-rainbow').colour).toBe('rainbow');
  await expectSoon(() => labelShown(page, 'rainbow'), { timeout: 10_000 }).toBe(true);
  await dipIn(page, 'rainbow');
  const before = await state(page);
  await leadHand(page, { target: restOf('balloon-rainbow') });
  await expectSoon(async () => (await part(page, 'balloon-rainbow')).done, { timeout: 60_000 }).toBe(true);
  await stopHand(page);
  await page.waitForTimeout(900);
  // Nothing else took any of it, and what's on the balloon is more than one colour.
  const after = await state(page);
  for (const each of after.parts.filter((one) => one.id !== 'balloon-rainbow')) expect(each.covered, each.id).toBe(before.parts.find((one) => one.id === each.id).covered);
  const [left, right] = [await paintAt(page, 66, 20), await paintAt(page, 84, 20)];
  expect([left.paint, right.paint]).toEqual(['rainbow', 'rainbow']);
  expect([left.drawn[3], right.drawn[3]]).toEqual([255, 255]);
  expect(Math.max(...[0, 1, 2].map((channel) => Math.abs(left.drawn[channel] - right.drawn[channel])))).toBeGreaterThan(40);
  await shot(page, 'paint-rainbow');
});

test('level 3: with the star stamp, the hand held still prints a star, and moving on prints another', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, atLevel(3));
  expect((await state(page)).pots.at(-1).kind).toBe('stamp');
  await dipIn(page, 'stamp');
  const before = await state(page);
  expect(before.brush.tool).toBe('stamp');
  await leadHand(page, { target: { x: 30, y: 30 } });
  await expectSoon(async () => (await state(page)).stamps.length, { timeout: 30_000 }).toBe(1);
  // Held on there, no more come.
  await page.waitForTimeout(1500);
  expect((await state(page)).stamps.length).toBe(1);
  await leadHand(page, { target: { x: 120, y: 40 } });
  await expectSoon(async () => (await state(page)).stamps.length, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  await page.waitForTimeout(400);
  await shot(page, 'paint-stamp');
  // The stamp lays no paint, and a paint pot puts the brush back.
  const after = await state(page);
  for (const each of after.parts) expect(each.covered, each.id).toBe(before.parts.find((one) => one.id === each.id).covered);
  expect(Math.hypot(after.stamps[0].x - 30, after.stamps[0].y - 30)).toBeLessThan(8);
  await dipIn(page, 'pink');
  expect((await state(page)).brush.tool).toBe('paint');
  await stopHand(page);
});

test('level 4: the big brush lying on the sheet makes the brush much bigger, and only runs down while it paints', async ({ page }) => {
  test.setTimeout(180_000);
  // The medium brush, so the big brush's size is easy to see in numbers.
  await startPlaying(page, atLevel(4, { paintBrush: 'medium' }));
  const start = await state(page);
  expect(start.roller.taken).toBe(false);
  expect(start.radius).toBe(6.5);
  await expectSoon(() => labelShown(page, 'roller'), { timeout: 15_000 }).toBe(true);
  await page.waitForTimeout(300);
  await shot(page, 'paint-big-brush-waiting');
  await leadHand(page, { target: '(painting) => painting.roller' });
  await expectSoon(async () => (await state(page)).roller.taken, { timeout: 30_000 }).toBe(true);
  expect((await state(page)).radius).toBe(14.3);
  // Resting with it, it waits.
  await leadHand(page, { target: { x: 30, y: 50 }, photo: 'fist' });
  await expectSoon(async () => (await state(page)).brush.down, { timeout: 10_000 }).toBe(false);
  const { left } = (await state(page)).roller;
  expect(left).toBeGreaterThan(9);
  await page.waitForTimeout(2500);
  expect((await state(page)).roller.left).toBe(left);
  // Painting the sea with it goes quickly, and now it runs down.
  await dipIn(page, 'blue');
  await leadHand(page, { target: restOf('sea') });
  await expectSoon(async () => (await part(page, 'sea')).covered, { timeout: 30_000 }).toBeGreaterThan(900);
  await shot(page, 'paint-big-brush');
  await expectSoon(async () => (await state(page)).roller.left, { timeout: 30_000 }).toBeLessThan(left - 0.5);
  await stopHand(page);
});

test('level 5: someone is hiding in the bush, and comes out once it\'s painted', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, atLevel(5));
  const start = await state(page);
  expect(start.friend).toEqual({ mark: '🐰', found: false });
  await expect(page.locator('#chip-friend-box')).toBeVisible();
  await expect(page.locator('#chip-friend')).toHaveText('?');
  await expectSoon(() => labelShown(page, 'friend'), { timeout: 20_000 }).toBe(true);
  expect(start.brush.colour).toBe('green');
  await leadHand(page, { target: restOf('bush') });
  await expectSoon(async () => (await state(page)).friend.found, { timeout: 90_000 }).toBe(true);
  await stopHand(page);
  await expect(page.locator('#chip-friend')).toHaveText('🐰');
  expect((await state(page)).stats.friends).toBe(1);
  await expectSoon(() => page.evaluate(() => window.__game.view.friendShown), { timeout: 5000 }).toBeGreaterThan(0.9);
  await page.waitForTimeout(500);
  await shot(page, 'paint-hidden-friend');
});

test('level 6: on the butterfly, what\'s painted on one wing is painted on the other', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, atLevel(6));
  expect((await state(page)).mirror).toBe(true);
  await expectSoon(() => labelShown(page, 'mirror'), { timeout: 15_000 }).toBe(true);
  await leadHand(page, { target: { x: 24, y: 24 } });
  await expectSoon(async () => (await part(page, 'wing-top-left')).covered, { timeout: 30_000 }).toBeGreaterThan(150);
  await expectSoon(() => farFrom(page, { x: 24, y: 24 }), { timeout: 30_000 }).toBeLessThan(2.5);
  await page.waitForTimeout(300);
  const [left, right] = [await part(page, 'wing-top-left'), await part(page, 'wing-top-right')];
  expect(Math.abs(left.covered - right.covered)).toBeLessThanOrEqual(left.covered * 0.05 + 3);
  // On the screen too: the other wing has the same paint in the same place, mirrored.
  const [here, there] = [await paintAt(page, 21, 21), await paintAt(page, 128, 21)];
  expect([here.paint, there.paint]).toEqual(['blue', 'blue']);
  expect([here.drawn[3], there.drawn[3]]).toEqual([255, 255]);
  await shot(page, 'paint-mirror');
  await stopHand(page);
});

test('level 7: two paints dipped into the mixing dish make a new one, with a pot of its own from then on', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, atLevel(7));
  const start = await state(page);
  expect(start.pots.map((pot) => (pot.kind === 'colour' ? `${pot.colour}:${pot.ready}` : pot.kind))).toEqual(['red:true', 'yellow:true', 'blue:true', 'orange:false', 'green:false', 'dish', 'stamp']);
  expect(start.brush.colour).toBe('red');
  // Red on the grass, which asks for green: it shows the two pots to mix and the dish, and the words say so.
  await leadHand(page, { target: { x: 20, y: 96 } });
  await expectSoon(async () => (await state(page)).hint?.colour ?? null, { timeout: 30_000 }).toBe('green');
  const { hint, pots } = await state(page);
  expect(hint.pots.map((index) => (pots[index].kind === 'dish' ? 'dish' : pots[index].colour)).sort()).toEqual(['blue', 'dish', 'yellow']);
  await expect(page.locator('#prompt-text')).toHaveText('Mix those two paints in the dish!', { timeout: 10_000 });
  await page.waitForTimeout(200);
  await shot(page, 'paint-mix-hint');
  // Blue into the dish, then yellow: green, on the brush and in a pot of its own.
  await dipIn(page, 'blue');
  await leadHand(page, { target: potOf('dish') });
  await expectSoon(async () => (await state(page)).pots.find((pot) => pot.kind === 'dish').holds, { timeout: 30_000 }).toBe('blue');
  await dipIn(page, 'yellow');
  await leadHand(page, { target: potOf('dish') });
  await expectSoon(async () => (await state(page)).brush.colour, { timeout: 30_000 }).toBe('green');
  const mixed = await state(page);
  expect(mixed.pots.find((pot) => pot.colour === 'green').ready).toBe(true);
  expect(mixed.pots.find((pot) => pot.kind === 'dish').holds).toBe(null);
  expect(mixed.stats.mixes).toBe(1);
  // And it paints the grass.
  await leadHand(page, { target: { x: 20, y: 96 } });
  await expectSoon(async () => (await part(page, 'grass')).covered, { timeout: 30_000 }).toBeGreaterThan(100);
  expect((await paintAt(page, 20, 96)).paint).toBe('green');
  await page.waitForTimeout(200);
  await shot(page, 'paint-mixed');
  // The new pot works like any other.
  await dipIn(page, 'red');
  await dipIn(page, 'green');
  await stopHand(page);
});

test('level 8: the robot is coloured by numbers, and the words say to find the pot with the same number', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, atLevel(8));
  const start = await state(page);
  expect(start.numbers).toBe(true);
  expect(start.pots.filter((pot) => pot.kind === 'colour').map((pot) => pot.number)).toEqual([1, 2, 3, 4, 5, 6]);
  await page.waitForTimeout(500);
  await shot(page, 'paint-numbers');
  // The head is a 5, and the brush starts with the body's paint, a 4: nothing lands, and it points at pot 5.
  expect(start.brush.colour).toBe('green');
  await leadHand(page, { target: dotOf('head') });
  await expectSoon(async () => (await state(page)).hint?.colour ?? null, { timeout: 30_000 }).toBe('blue');
  await expect(page.locator('#prompt-text')).toHaveText('Find the pot with the same number!', { timeout: 10_000 });
  expect((await part(page, 'head')).covered).toBe(0);
  await dipIn(page, 'blue');
  await leadHand(page, { target: dotOf('head') });
  await expectSoon(async () => (await part(page, 'head')).covered, { timeout: 30_000 }).toBeGreaterThan(60);
  await stopHand(page);
});

test('level 9: a paint balloon bursts when the hand comes to it, and splashes its paint over its part', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, atLevel(9));
  await expectSoon(async () => (await state(page)).balloons.length, { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
  await expectSoon(() => labelShown(page, 'balloon'), { timeout: 25_000 }).toBe(true);
  await page.waitForTimeout(300);
  await shot(page, 'paint-balloons');
  const before = await state(page);
  const [balloon] = before.balloons;
  const over = before.parts[balloon.part];
  // A closed hand does it too, as catching a prize does in the other games.
  await leadHand(page, { target: { x: balloon.x, y: balloon.y }, photo: 'fist' });
  await expectSoon(async () => (await state(page)).balloons[0].popped, { timeout: 30_000 }).toBe(true);
  await stopHand(page);
  const after = await state(page);
  expect(after.parts[balloon.part].covered).toBeGreaterThan(over.covered + 200);
  // Another may have been in its way: each one the hand came to is burst.
  expect(after.stats.balloons).toBe(after.balloons.filter((each) => each.popped).length);
  expect(after.stats.balloons).toBeGreaterThanOrEqual(1);
  const splashed = await paintAt(page, balloon.x, balloon.y);
  expect(splashed.paint).toBe(over.colour);
  expect(splashed.drawn[3]).toBe(255);
  await page.waitForTimeout(250);
  await shot(page, 'paint-balloon-burst');
});

test('level 10: the space to draw in takes any paint, and is done once there\'s something drawn in it', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, atLevel(10));
  const start = await state(page);
  const canvas = start.parts.find((each) => each.id === 'canvas');
  expect(canvas.kind).toBe('free');
  await expectSoon(() => labelShown(page, 'free'), { timeout: 15_000 }).toBe(true);
  // A wavy line right across it, in blue, which the yellow frame round it doesn't take. (The brush starts with
  // yellow, and a yellow brush near the edge of the space, or on its way to the pot, rightly paints the frame too.)
  await dipIn(page, 'blue');
  const frameBefore = (await part(page, 'frame')).covered;
  await page.evaluate(() => {
    window.__wave = performance.now();
  });
  await leadHand(page, { target: '() => { const t = (performance.now() - window.__wave) / 1000; return { x: 48 + ((t * 9) % 56), y: 54 + Math.sin(t * 2.2) * 12 }; }' });
  await expectSoon(async () => (await part(page, 'canvas')).done, { timeout: 90_000 }).toBe(true);
  await stopHand(page);
  const done = await part(page, 'canvas');
  // It's as it was drawn: not filled in.
  expect(done.covered).toBeLessThan(done.cells * 0.7);
  expect((await state(page)).hint).toBe(null);
  // Not a drop of it went over the space's edge onto the frame, though the brush went right up to it.
  expect((await part(page, 'frame')).covered).toBe(frameBefore);
  // And what's drawn in the space is the blue.
  const blue = await page.evaluate(() => {
    const { painting } = window.__game;
    const space = painting.parts.find((each) => each.id === 'canvas').index;
    const code = ['red', 'orange', 'yellow', 'green', 'blue'].indexOf('blue') + 1;
    return painting.owner.reduce((sum, owner, cell) => sum + (owner === space && painting.paint[cell] === code ? 1 : 0), 0);
  });
  expect(blue).toBeGreaterThan(done.cells * 0.2);
  await page.waitForTimeout(300);
  await shot(page, 'paint-draw-your-own');
});

for (const level of [1, 10]) {
  test(`nothing flashes at level ${level}: painting, parts filling in and the picture coming to life, the brightness stays steady`, async ({ page }) => {
    test.setTimeout(300_000);
    await startPlaying(page, atLevel(level));
    await leadHand(page);
    await expectSoon(async () => (await state(page)).stats.cells, { timeout: 30_000 }).toBeGreaterThan(100);
    const painting = judge(await watchBrightness(page, 420));
    console.log(`level ${level} painting`, JSON.stringify(painting));
    expect(painting.biggestStep).toBeLessThan(4);
    expect(painting.flickeringShare).toBeLessThan(0.01);
    // Through the last parts filling in and the finished picture coming to life.
    await expectSoon(async () => {
      const now = await state(page);
      return now.toPaint - now.stats.parts;
    }, { timeout: 200_000 }).toBeLessThanOrEqual(1);
    const ending = judge(await watchBrightness(page, 480));
    console.log(`level ${level} ending`, JSON.stringify(ending));
    expect(ending.biggestStep).toBeLessThan(4);
    expect(ending.flickeringShare).toBeLessThan(0.01);
    await stopHand(page);
  });
}

test('a hand opening and closing far quicker than any child, over the picture, makes nothing flicker but the glove', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page);
  await leadHand(page, { target: { x: 62, y: 40 } });
  await expectSoon(() => farFrom(page, { x: 62, y: 40 }), { timeout: 30_000 }).toBeLessThan(5);
  await stopHand(page);
  // Four times a second, open and closed, where it is.
  await page.evaluate(() => {
    const { x, y } = window.__lead;
    const started = performance.now();
    window.__flap = setInterval(() => {
      const open = Math.floor((performance.now() - started) / 125) % 2 === 0;
      window.__camera.show({ left: null, right: open ? 'open' : 'fist', scale: 0.62, rightOffsetX: x, rightOffsetY: y });
    }, 20);
  });
  const reading = judge(await watchBrightness(page, 360));
  await page.evaluate(() => clearInterval(window.__flap));
  console.log('opening and closing', JSON.stringify(reading));
  expect(reading.biggestStep).toBeLessThan(4);
  expect(reading.flickeringShare).toBeLessThan(0.03);
});
