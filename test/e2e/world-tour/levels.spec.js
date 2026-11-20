// Giraffe's World Tour's ten levels: what each brings is on the title card and under the countdown, and each new
// thing is really there in the game, and wasn't at the level before. With real photos of hands through the real
// tracker.
import { openGame, shot } from '../helpers.js';
import {
  choose, expect, expectSoon, flagPixels, GAME, GENTLE, gloveFrom, isPaper, leadHands, NO_HAND, ONE_HAND, record, recorded,
  screenPixels, show, skipTo, startPlaying, state, stopHands, test, waitForHand, waitForScreen, waitForState,
} from './helpers.js';

const NEW_AT = {
  2: 'The roller, for long stripes',
  3: 'A stamp from every country',
  4: 'Four countries to choose from',
  5: 'The wind: hold the flag with your other hand',
  6: 'A fuel can to catch on the way',
  7: 'Paint the flag from memory',
  8: 'Five countries to choose from',
  9: 'No lights: find the country yourself',
  10: 'Four stops, and the cup',
};
const ONE_HAND_WIND = 'The wind: keep your open hand on the flag';
const HOLD = { aim: 'hold' };
const atLevel = (level, more = {}) => ({ levels: { [GAME]: level }, ...more });
const prompt = (page) => page.locator('#prompt-text');

/** In the grown-ups' panel: another level, and any of the game's own choices, as { tourHold: 'never' }. */
async function inPanel(page, { level = null, ...choices } = {}) {
  await page.locator('#open-panel').click();
  if (level !== null) await page.locator('#level-choice label', { hasText: new RegExp(`^\\s*${level}\\s*$`) }).click();
  for (const [name, value] of Object.entries(choices)) await page.locator(`input[name="${name}"][value="${value}"]`).check();
  await page.locator('#close-panel').click();
  await expect(page.locator('#panel')).toBeHidden();
}

/** Another level chosen in the middle of a journey: the journey starts again at that level. */
async function onToLevel(page, level, more = {}) {
  await inPanel(page, { level, ...more });
  await expectSoon(async () => {
    const now = await state(page);
    return now.level === level && now.screen === 'playing' && now.state === 'find';
  }, { timeout: 60_000 }).toBe(true);
}

/** Flies to the country asked for and waits for its flag on the board, with the other hand holding where that's wanted. */
async function toBoard(page, other = null) {
  await waitForState(page, 'find');
  await leadHands(page, { aim: 'target', other });
  await waitForState(page, 'paint');
  await expectSoon(() => page.evaluate(() => window.__game.view.boardFor)).toBe(1);
}

/** Each country lit to choose from, with the colour it's lit in and the colour its pin's middle is on the screen. */
const pins = async (page) => {
  const lit = await page.evaluate(() => {
    const { tour, view } = window.__game;
    return tour.choices.map((id) => ({ id, ...view.onScreen(tour.places[id]), colour: view.colours.get(id) }));
  });
  const drawn = await screenPixels(page, lit);
  return lit.map((pin, n) => ({ ...pin, drawn: drawn[n] }));
};
const hex = (colour) => [1, 3, 5].map((at) => parseInt(colour.slice(at, at + 2), 16));
const near = (one, other, by = 10) => one.every((value, n) => Math.abs(value - other[n]) <= by);
/** Whether a pin is shown lit, in the colour its country was given. */
const shownLit = (pin) => near(pin.drawn, hex(pin.colour));

/** The glove's ring, as big as the brush: its radius on the screen as it was last drawn. */
const watchRing = (page) => page.evaluate(() => {
  const { view } = window.__game;
  const draw = view.drawGlove.bind(view);
  window.__ring = 0;
  view.drawGlove = (glove) => {
    if (!glove.look && view.board) window.__ring = glove.reach * view.board.unit;
    return draw(glove);
  };
});
const ring = (page) => page.evaluate(() => window.__ring);

/** How tall a stroke along the flag is, in its units, between two heights of it: the middle of how tall each column is. */
const strokeHeight = (page, top, bottom, [from, to]) => page.evaluate(([high, low, left, right]) => {
  const { painting } = window.__game.tour;
  const heights = [];
  for (let x = left; x <= right; x += 1) {
    let count = 0;
    for (let y = high; y < low; y += 1) count += painting.painted[y * painting.wide + x];
    heights.push(count);
  }
  heights.sort((a, b) => a - b);
  return heights[Math.floor(heights.length / 2)];
}, [top, bottom, from, to]);

/** The closed hand goes to a place on the flag, opens there for a moment, and closes again before it moves on. */
async function dab(page, x, y, other = null) {
  const where = await page.evaluate(([fx, fy]) => {
    const { board } = window.__game.view;
    return { x: board.x + fx * board.unit, y: board.y + fy * board.unit };
  }, [x, y]);
  await leadHands(page, { aim: `flag:${x},${y}`, photo: 'fist', other });
  await expectSoon(() => gloveFrom(page, where)).toBeLessThan(6);
  const before = (await state(page)).progress;
  await leadHands(page, { aim: `flag:${x},${y}`, other });
  await expectSoon(async () => (await state(page)).progress).toBeGreaterThan(before);
  await page.waitForTimeout(1000);
  await leadHands(page, { aim: `flag:${x},${y}`, photo: 'fist', other });
  await waitForHand(page, 'closed');
}

/** The closed hand goes to just off the flag's left edge, and opens, and goes once along it at that height. */
async function stroke(page, y) {
  const start = await page.evaluate((at) => {
    const { board } = window.__game.view;
    return { x: board.x - 6 * board.unit, y: board.y + at * board.unit };
  }, y);
  await leadHands(page, { aim: `flag:-6,${y}`, photo: 'fist' });
  await expectSoon(() => gloveFrom(page, start)).toBeLessThan(6);
  const before = (await state(page)).progress;
  await leadHands(page, { aim: `sweep:${y},${y}` });
  await expectSoon(async () => (await state(page)).progress).toBeGreaterThan(before);
  // Past the middle of the blue stripe, and closed again.
  await expectSoon(async () => {
    const at = (await state(page)).at;
    return at ? page.evaluate(({ x }) => window.__game.view.toFlag(x, 0).x, at) : 0;
  }).toBeGreaterThan(60);
  await leadHands(page, { aim: `flag:70,${y}`, photo: 'fist' });
  await waitForHand(page, 'closed');
}

/** The open hand takes the paint of a pot, or the roller, and closes again in it. */
async function dip(page, paint, other = null) {
  await leadHands(page, { aim: `pot:${paint}`, other });
  if (paint === 'roller') await expectSoon(async () => (await state(page)).rollerOn).toBe(true);
  else await expectSoon(async () => (await state(page)).paint).toBe(paint);
  await leadHands(page, { aim: `pot:${paint}`, photo: 'fist', other });
  await waitForHand(page, 'closed');
}

/* ---------- what each level brings, on the cards ---------- */

test('the title card says what each level from 2 to 10 brings, and nothing at level 1', async ({ page }) => {
  test.setTimeout(120_000);
  await openGame(page, {}, GAME);
  await expect(page.locator('#level-badge')).toHaveText('Level 1 of 10');
  await expect(page.locator('#level-new')).toBeEmpty();
  for (const [level, name] of Object.entries(NEW_AT)) {
    await inPanel(page, { level: Number(level) });
    await expect(page.locator('#level-badge')).toHaveText(`Level ${level} of 10`);
    await expect(page.locator('#level-new')).toContainText(name);
  }
  // With one hand doing it all, from the start, level 5 has its own words for the wind.
  await inPanel(page, { level: 4, tourHold: 'never' });
  await inPanel(page, { level: 5 });
  await expect(page.locator('#level-new')).toContainText(ONE_HAND_WIND);
  await expect(page.locator('#level-new')).not.toContainText('other hand');
  await shot(page, 'world-tour-title-level-5-one-hand');
});

test('on the title card at level 5, choosing one hand for everything changes what it says about the wind at once', async ({ page }) => {
  await openGame(page, atLevel(5), GAME);
  await expect(page.locator('#level-new')).toContainText(NEW_AT[5]);
  await inPanel(page, { tourHold: 'never' });
  await expect(page.locator('#level-new')).toContainText(ONE_HAND_WIND);
  await expect(page.locator('#level-new')).not.toContainText('other hand');
});

test('under the countdown it says what\'s new at each level, as the levels are chosen one after another in the middle of a journey', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, atLevel(1, ONE_HAND));
  for (const [level, name] of Object.entries(NEW_AT)) {
    await inPanel(page, { level: Number(level) });
    await waitForScreen(page, 'countdown');
    await expect(page.locator('#level-now')).toHaveText(`Level ${level}`);
    await expect(page.locator('#level-new-now')).toContainText(Number(level) === 5 ? ONE_HAND_WIND : name);
    await waitForScreen(page, 'playing');
  }
});

/* ---------- each level's new thing, in the game ---------- */

test('level 2: the roller\'s tray is among the pots, where at level 1 it isn\'t, and dipping in it makes the brush\'s ring bigger and paints wider', async ({ page }) => {
  test.setTimeout(300_000);
  await startPlaying(page);
  await toBoard(page);
  expect(await page.evaluate(() => window.__game.view.pots.map((pot) => pot.paint))).toEqual(['blue', 'yellow']);
  await onToLevel(page, 2);
  await expect(page.locator('#chip-stamps-box')).toBeHidden();
  await toBoard(page);
  const { target, colours } = await state(page);
  expect(target).toBe('FRA');
  expect(await page.evaluate(() => window.__game.view.pots.map((pot) => pot.paint))).toEqual([...Object.keys(colours), 'roller']);
  await shot(page, 'world-tour-roller-tray');
  await watchRing(page);
  // Blue on the hand, and one stroke along France's blue stripe, from just off its left edge.
  await dip(page, 'blue');
  const brush = await ring(page);
  await stroke(page, 25);
  const narrow = await strokeHeight(page, 0, 50, [20, 44]);
  // The roller from its tray, and the same stroke lower down the stripe.
  await dip(page, 'roller');
  expect((await state(page)).paint).toBe('blue');
  const roller = await ring(page);
  await stroke(page, 75);
  const wide = await strokeHeight(page, 50, 100, [20, 44]);
  await shot(page, 'world-tour-roller');
  await stopHands(page);
  expect(roller).toBeGreaterThan(brush * 1.6);
  expect(narrow).toBeGreaterThan(10);
  expect(narrow).toBeLessThan(18);
  expect(wide).toBeGreaterThan(narrow * 1.5);
});

test('level 3: a flag raised gives a stamp, and the stamps chip counts it, where at level 2 there is no such chip', async ({ page }) => {
  test.setTimeout(300_000);
  await startPlaying(page, atLevel(2));
  await waitForState(page, 'find');
  await expect(page.locator('#chip-stamps-box')).toBeHidden();
  await onToLevel(page, 3);
  await expect(page.locator('#chip-stamps-box')).toBeVisible();
  await expect(page.locator('#chip-stamps')).toHaveText('0');
  // On to Armenia, whose flag is three stripes.
  await skipTo(page, 1);
  expect((await state(page)).target).toBe('ARM');
  await leadHands(page, { aim: 'play' });
  await waitForState(page, 'settle', 200_000);
  await stopHands(page);
  const now = await state(page);
  expect([now.flown.at(-1), now.stats.stamps]).toEqual(['ARM', 1]);
  await expect(page.locator('#chip-stamps')).toHaveText('1');
  await page.waitForTimeout(500);
  await shot(page, 'world-tour-stamp');
});

test('level 4: four countries are lit to choose from, where level 3 had three', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, atLevel(3));
  await waitForState(page, 'find');
  await show(page, ...NO_HAND);
  await expectSoon(async () => (await pins(page)).filter(shownLit).length).toBe(3);
  expect((await state(page)).choices.length).toBe(3);
  await onToLevel(page, 4);
  await show(page, ...NO_HAND);
  const now = await state(page);
  expect([now.target, now.choices.length]).toEqual(['SWE', 4]);
  await expectSoon(async () => (await pins(page)).filter(shownLit).length).toBe(4);
  for (const pin of await pins(page)) expect(pin.x > 0 && pin.x < 1280 && pin.y > 0 && pin.y < 720 && pin.front, pin.id).toBe(true);
  await shot(page, 'world-tour-four');
});

test('level 8: five countries are lit to choose from, where level 7 had four', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, atLevel(7));
  await waitForState(page, 'find');
  await show(page, ...NO_HAND);
  await expectSoon(async () => (await pins(page)).filter(shownLit).length).toBe(4);
  await onToLevel(page, 8);
  await show(page, ...NO_HAND);
  expect((await state(page)).choices.length).toBe(5);
  await expectSoon(async () => (await pins(page)).filter(shownLit).length).toBe(5);
});

test('level 5: the board is nearer the painting hand, with the spot to hold it on the other side, and paint only lands while the other hand holds it, where at level 4 one hand painted alone', async ({ page }) => {
  test.setTimeout(300_000);
  await startPlaying(page, atLevel(4));
  await toBoard(page);
  const layout = () => page.evaluate(() => {
    const { view } = window.__game;
    return { middle: view.board.x + view.board.wide / 2, board: { ...view.board }, hold: view.hold && { ...view.hold }, copy: view.copy && { ...view.copy }, width: view.width };
  });
  const four = await layout();
  expect(four.hold).toBe(null);
  expect(Math.abs(four.middle - four.width / 2)).toBeLessThan(1);
  const first = (await state(page)).parts[0].colour;
  await dip(page, first);
  await dab(page, 30, 15);
  expect((await state(page)).progress).toBeGreaterThan(0);

  await onToLevel(page, 5);
  const level = await state(page);
  expect(level.rules.holding).toBe(true);
  await leadHands(page, { aim: 'target' });
  // No fuel can on the way yet: that's level 6.
  await waitForState(page, 'fly');
  expect((await state(page)).can).toBe(null);
  await waitForState(page, 'paint');
  await expectSoon(() => page.evaluate(() => window.__game.view.boardFor)).toBe(1);
  const five = await layout();
  // The right hand paints: the board is over to the right, and the spot is on the left, with the flag to copy over it.
  expect(five.middle).toBeGreaterThan(five.width / 2 + five.width * 0.04);
  expect(five.hold.x + five.hold.r).toBeLessThan(five.board.x);
  expect(five.hold.x - five.hold.r).toBeGreaterThan(0);
  expect(five.copy.x + five.copy.wide).toBeLessThan(five.board.x);
  expect(five.copy.y + five.copy.high).toBeLessThan(five.hold.y - five.hold.r);
  await shot(page, 'world-tour-hold-spot');
  // With nothing on the spot no paint lands, and the child is told to hold the flag.
  const paint = (await state(page)).parts[0].colour;
  await leadHands(page, { aim: `pot:${paint}` });
  await expectSoon(async () => (await state(page)).paint).toBe(paint);
  await leadHands(page, { aim: 'flag:40,16' });
  await expectSoon(async () => (await state(page)).hint).toEqual({ hold: true });
  await expect(prompt(page)).toHaveText('Hold the flag with your other hand!', { timeout: 15_000 });
  await page.waitForTimeout(1000);
  let now = await state(page);
  expect([now.progress, now.held]).toEqual([0, false]);
  // The other hand on the spot, and the paint goes on.
  await leadHands(page, { aim: 'flag:40,16', other: HOLD });
  await expectSoon(async () => (await state(page)).progress).toBeGreaterThan(0);
  now = await state(page);
  expect(now.held).toBe(true);
  expect(await page.evaluate(() => window.__game.view.onHold(...Object.values(window.__game.game.gloveOnScreen('other'))))).toBe(true);
  await shot(page, 'world-tour-held');
  await stopHands(page);
});

test('level 5: a gust that finds the flag held costs nothing, and one that finds it let go takes the wet paint and a can of fuel', async ({ page }) => {
  test.setTimeout(300_000);
  await startPlaying(page, atLevel(5));
  await toBoard(page, HOLD);
  const full = (await state(page)).cans;
  // Red on Austria's top stripe, with the flag held, and then the painting hand closes where it is.
  await dip(page, 'red', HOLD);
  await dab(page, 40, 16, HOLD);
  const wet = (await state(page)).counts[0];
  expect(wet).toBeGreaterThan(80);
  expect((await state(page)).held).toBe(true);
  await expectSoon(async () => (await state(page)).stats.gusts, { timeout: 30_000 }).toBe(1);
  let now = await state(page);
  expect([now.stats.held, now.stats.lost, now.cans, now.counts[0]]).toEqual([1, 0, full, wet]);
  // The other hand lets go: as the next gust comes the child is told to hold the flag, and it takes the paint.
  await leadHands(page, { aim: 'flag:40,16', photo: 'fist' });
  await expectSoon(async () => (await state(page)).held).toBe(false);
  await expect(prompt(page)).toHaveText('Hold the flag with your other hand!', { timeout: 30_000 });
  await expectSoon(async () => (await state(page)).stats.gusts, { timeout: 30_000 }).toBe(2);
  now = await state(page);
  expect([now.stats.held, now.stats.lost, now.cans, now.counts[0]]).toEqual([1, 1, full - 1, 0]);
  await expect(page.locator('#chip-fuel .tour-can.is-empty')).toHaveCount(1);
  // On the screen it's bare again.
  const [colour] = await flagPixels(page, [{ x: 40, y: 16 }]);
  expect(isPaper(colour), `${colour}`).toBe(true);
  await stopHands(page);
});

test('level 5 with one hand doing it all: nothing has to be held, and an open hand on the flag meets the gust', async ({ page }) => {
  test.setTimeout(300_000);
  await startPlaying(page, atLevel(5, ONE_HAND));
  await toBoard(page);
  const layout = await page.evaluate(() => {
    const { view } = window.__game;
    return { middle: view.board.x + view.board.wide / 2, width: view.width, hold: view.hold };
  });
  expect(layout.hold).toBe(null);
  expect(Math.abs(layout.middle - layout.width / 2)).toBeLessThan(1);
  const full = (await state(page)).cans;
  await dip(page, 'red');
  // One hand, and the paint goes on.
  await leadHands(page, { aim: 'flag:40,16' });
  await expectSoon(async () => (await state(page)).counts[0]).toBeGreaterThan(80);
  // Kept open on the flag, the gust is met: the child is told to as it comes.
  await expect(prompt(page)).toHaveText('Here comes the wind! Keep your open hand on the flag!', { timeout: 30_000 });
  await expectSoon(async () => (await state(page)).stats.gusts, { timeout: 30_000 }).toBe(1);
  let now = await state(page);
  expect([now.stats.held, now.stats.lost, now.cans]).toEqual([1, 0, full]);
  expect(now.counts[0]).toBeGreaterThan(80);
  // Closed, it isn't.
  await leadHands(page, { aim: 'flag:40,16', photo: 'fist' });
  await expectSoon(async () => (await state(page)).stats.gusts, { timeout: 30_000 }).toBe(2);
  now = await state(page);
  expect([now.stats.held, now.stats.lost, now.cans]).toEqual([1, 1, full - 1]);
  await stopHands(page);
});

test('a grown-up can have the flag held from level 1: no paint lands until the other hand holds it, and no wind blows', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, { tourHold: 'always' });
  await toBoard(page);
  const layout = await page.evaluate(() => {
    const { view } = window.__game;
    return { middle: view.board.x + view.board.wide / 2, width: view.width, board: { ...view.board }, hold: view.hold && { ...view.hold } };
  });
  expect(layout.middle).toBeGreaterThan(layout.width / 2 + layout.width * 0.04);
  expect(layout.hold.x).toBeLessThan(layout.board.x);
  await leadHands(page, { aim: 'pot:blue' });
  await expectSoon(async () => (await state(page)).paint).toBe('blue');
  await leadHands(page, { aim: 'flag:40,20' });
  await expect(prompt(page)).toHaveText('Hold the flag with your other hand!', { timeout: 15_000 });
  let now = await state(page);
  expect([now.progress, now.hint]).toEqual([0, { hold: true }]);
  await leadHands(page, { aim: 'flag:40,20', other: HOLD });
  await expectSoon(async () => (await state(page)).progress).toBeGreaterThan(0);
  now = await state(page);
  expect([now.held, now.rules.wind, now.gustShare]).toEqual([true, null, null]);
  await stopHands(page);
});

test('level 6: a fuel can on the way tops the tank up after a wrong country when an open hand takes it, and not a closed one', async ({ page }) => {
  test.setTimeout(300_000);
  await startPlaying(page, atLevel(6));
  await waitForState(page, 'find');
  let now = await state(page);
  const full = now.cans;
  await choose(page, now.choices.find((id) => id !== now.target));
  expect((await state(page)).cans).toBe(full - 1);
  // The closed hand goes to the can as the plane flies, and stays on it.
  await record(page);
  await choose(page, now.target);
  await leadHands(page, { aim: 'can', photo: 'fist' });
  await waitForState(page, 'land');
  let frames = await recorded(page);
  expect(frames.filter((frame) => frame.state === 'fly' && frame.onCan && !frame.open).length).toBeGreaterThan(5);
  expect(frames.some((frame) => frame.taken)).toBe(false);
  expect((await state(page)).cans).toBe(full - 1);
  // On to the next stop: another wrong country, and this time the open hand takes the can.
  await waitForState(page, 'paint');
  await skipTo(page, 1);
  now = await state(page);
  await choose(page, now.choices.find((id) => id !== now.target && !now.flown.includes(id)));
  expect((await state(page)).cans).toBe(full - 2);
  await record(page);
  await choose(page, now.target);
  await leadHands(page, { aim: 'can' });
  await expectSoon(async () => (await state(page)).cans, { timeout: 15_000 }).toBe(full - 1);
  frames = await recorded(page);
  expect(frames.find((frame) => frame.taken)?.state).toBe('fly');
  now = await state(page);
  expect([now.stats.cans, now.can?.taken]).toEqual([1, true]);
  await expect(page.locator('#chip-fuel .tour-can.is-empty')).toHaveCount(1);
  await waitForState(page, 'land');
  await stopHands(page);
});

test('level 7: the finished flag beside the board is hidden after a while, and the wrong paint held on a part shows it again for a moment, where at level 6 it stays', async ({ page }) => {
  test.setTimeout(300_000);
  const copied = async () => {
    const copy = await page.evaluate(() => window.__game.view.copy);
    const [colour] = await screenPixels(page, [{ x: copy.x + copy.wide * 0.12, y: copy.y + copy.high * 0.5 }]);
    return colour;
  };
  await startPlaying(page, atLevel(6));
  await toBoard(page, HOLD);
  await leadHands(page, { aim: 'flag:75,50', photo: 'fist', other: HOLD });
  await page.waitForTimeout(8000);
  expect((await state(page)).shown).toBe(true);
  await onToLevel(page, 7);
  await toBoard(page, HOLD);
  const { target, colours } = await state(page);
  expect(target).toBe('NGA');
  // Nigeria's flag, green at its left end, to copy from.
  expect(near(await copied(), hex(colours.green), 16), `${await copied()}`).toBe(true);
  await leadHands(page, { aim: 'flag:100,50', photo: 'fist', other: HOLD });
  await expectSoon(async () => (await state(page)).shown, { timeout: 20_000 }).toBe(false);
  expect(near(await copied(), [230, 235, 242], 16), `${await copied()}`).toBe(true);
  await shot(page, 'world-tour-memory');
  // Green on the hand, held on the white middle, which wants white: the flag shows again, and hides again.
  await dip(page, 'green', HOLD);
  await leadHands(page, { aim: 'flag:100,50', other: HOLD });
  await expectSoon(async () => (await state(page)).shown, { timeout: 20_000 }).toBe(true);
  const now = await state(page);
  expect(now.stats.peeks).toBe(1);
  expect(now.counts[1]).toBe(0);
  expect(near(await copied(), hex(colours.green), 16), `${await copied()}`).toBe(true);
  await leadHands(page, { aim: 'flag:100,50', photo: 'fist', other: HOLD });
  await expectSoon(async () => (await state(page)).shown, { timeout: 20_000 }).toBe(false);
  await stopHands(page);
});

test('level 9: no country is lit until the hand comes near it, where at level 8 they all were', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, atLevel(8));
  await waitForState(page, 'find');
  await show(page, ...NO_HAND);
  await expectSoon(async () => (await pins(page)).every(shownLit)).toBe(true);
  await onToLevel(page, 9);
  // What the globe is drawn with lit, each time it's drawn again.
  await page.evaluate(() => {
    const { globe } = window.__game.view;
    const draw = globe.draw.bind(globe);
    window.__lit = null;
    globe.draw = (ctx, x, y, r, look) => {
      window.__lit = [...look.lit.keys()];
      return draw(ctx, x, y, r, look);
    };
  });
  const lit = () => page.evaluate(() => window.__lit);
  await show(page, ...NO_HAND);
  await expectSoon(async () => (await state(page)).at).toBe(null);
  await page.evaluate(() => {
    window.__game.view.backKey = '';
  });
  await expectSoon(lit).toEqual([]);
  expect((await pins(page)).filter(shownLit)).toEqual([]);
  await shot(page, 'world-tour-dark');
  const { choices, target } = await state(page);
  expect(choices.length).toBe(5);
  // The closed hand, which chooses nothing, over one country and then another: each is lit, and only it.
  for (const id of [target, choices.find((each) => each !== target)]) {
    await leadHands(page, { aim: `country:${id}`, photo: 'fist' });
    await expectSoon(async () => (await state(page)).hover).toBe(id);
    await expectSoon(lit).toEqual([id]);
  }
  await shot(page, 'world-tour-dark-near');
  await stopHands(page);
});

test('level 10: four stops, and the cup when the last flag is up', async ({ page }) => {
  test.setTimeout(400_000);
  await startPlaying(page, atLevel(10, GENTLE));
  await waitForState(page, 'find');
  expect((await state(page)).stops.length).toBe(4);
  await expect(page.locator('#chip-flags')).toHaveText('0 of 4');
  await page.evaluate(() => {
    const { ctx } = window.__game.view;
    window.__texts = new Set();
    const fill = ctx.fillText.bind(ctx);
    ctx.fillText = (text, ...rest) => {
      window.__texts.add(String(text));
      return fill(text, ...rest);
    };
  });
  await skipTo(page, 3);
  expect((await state(page)).target).toBe('GBR');
  await expect(page.locator('#chip-flags')).toHaveText('3 of 4');
  await leadHands(page, { aim: 'play', other: HOLD });
  await waitForState(page, 'settle', 360_000);
  await expect(page.locator('#chip-flags')).toHaveText('4 of 4');
  await waitForState(page, 'won');
  expect((await state(page)).stats.cup).toBe(true);
  expect(await page.evaluate(() => [...window.__texts])).toContain('🏆');
  await shot(page, 'world-tour-cup');
  await waitForScreen(page, 'finish');
  await stopHands(page);
  await expect(page.locator('#screen-finish h2')).toHaveText('What a journey!');
});
