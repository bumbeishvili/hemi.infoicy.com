// Playing Giraffe's World Tour: an open hand held over the country that's asked for flies the plane there, the open
// hand paints its flag with the paint landing only where that colour goes, and lifted up it raises the flag. Three
// flags raised win the journey. With real photos of hands through the real tracker.
import { openGame, shot } from '../helpers.js';
import {
  choose, expect, expectSoon, FIST, flagPixels, GAME, GENTLE, gloveFrom, isPaper, leadHands, NO_HAND, OPEN, record, recorded, screenPixels,
  show, startPlaying, state, stopHands, test, waitForHand, waitForScreen, waitForState,
} from './helpers.js';

const atLevel = (level, more = {}) => ({ levels: { [GAME]: level }, ...more });
const prompt = (page) => page.locator('#prompt-text');
const emptyCans = (page) => page.locator('#chip-fuel .tour-can.is-empty');

/** Starts writing down which places on the flag the open hand has been over, in squares of 10 of its units. */
const trackBrush = (page) => page.evaluate(() => {
  window.__visited = new Set();
  const tick = () => {
    const { game, view, tour } = window.__game;
    const at = game.gloveOnScreen('play');
    if (tour.state !== 'paint' || !at || window.__game.monitor.snapshot.handOpen !== true) {
      requestAnimationFrame(tick);
      return;
    }
    const { x, y } = view.toFlag(at.x, at.y);
    if (x >= 0 && y >= 0 && x < tour.flag.wide && y < 100) window.__visited.add(`${Math.floor(x / 10)},${Math.floor(y / 10)}`);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
/** Whether the open hand has been over every square of 10 between those heights on the flag, right across it. */
const sweptOver = (page, top, bottom) => page.evaluate(([from, to]) => {
  const across = Math.floor(window.__game.tour.flag.wide / 10);
  for (let y = from; y <= to; y += 1) for (let x = 0; x < across; x += 1) if (!window.__visited.has(`${x},${y}`)) return false;
  return true;
}, [top, bottom]);

/**
 * Paints Ukraine's flag so that the hand is still up on the flag when it's done: the blue as a child would, and the
 * yellow along the upper rows of its stripe only, which is enough to fill it in. The hand ends nowhere near low enough
 * to take the rope, so the test says what it does next.
 */
async function paintEndingHigh(page, other = null) {
  await leadHands(page, { aim: 'play', other });
  await expectSoon(async () => (await state(page)).done?.[0], { timeout: 120_000 }).toBe(true);
  await leadHands(page, { aim: 'pot:yellow', other });
  await expectSoon(async () => (await state(page)).paint).toBe('yellow');
  await leadHands(page, { aim: 'sweep:56,85', other });
  await waitForState(page, 'raise', 120_000);
}

test('a journey: each country is found, flown to, painted and its flag raised, and three flags win it', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page);
  await waitForState(page, 'find');
  let now = await state(page);
  expect(now.target).toBe('UKR');
  expect([...now.choices].sort()).toEqual(['DEU', 'POL', 'UKR']);
  expect(now.cans).toBe(5);
  await page.waitForTimeout(1500);
  await shot(page, 'world-tour-find');

  await leadHands(page, { aim: 'play' });
  await waitForState(page, 'fly');
  await page.waitForTimeout(900);
  await shot(page, 'world-tour-fly');
  await waitForState(page, 'land');
  await page.waitForTimeout(1200);
  await shot(page, 'world-tour-land');
  await waitForState(page, 'paint');
  await expectSoon(async () => (await state(page)).progress).toBeGreaterThan(0.3);
  await shot(page, 'world-tour-paint');
  await waitForState(page, 'raise');
  await expectSoon(async () => (await state(page)).raisedTo).toBeGreaterThan(0.3);
  await shot(page, 'world-tour-raise');
  await waitForState(page, 'settle');
  await shot(page, 'world-tour-raised');
  await expectSoon(async () => (await state(page)).flown).toEqual(['UKR']);

  await expectSoon(async () => (await state(page)).flown.length, { timeout: 120_000 }).toBe(2);
  await waitForState(page, 'find');
  await page.waitForTimeout(1500);
  await shot(page, 'world-tour-find-third');
  await waitForScreen(page, 'finish');
  now = await state(page);
  expect(now.state).toBe('won');
  expect(now.flown).toEqual(['UKR', 'POL', 'DEU']);
  expect(now.cans).toBe(5);
  await stopHands(page);
  await expect(page.locator('#screen-finish h2')).toHaveText('What a journey!');
  await shot(page, 'world-tour-finish');
});

/* ---------- choosing the country ---------- */

test('a closed hand held over the country asked for never chooses it, and an open hand does after a moment, as the ring round its pin closes', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page);
  await waitForState(page, 'find');
  // The hand closes where it is, and then goes over Ukraine.
  await show(page, ...FIST);
  await waitForHand(page, 'closed');
  await leadHands(page, { aim: 'target', photo: 'fist' });
  await expectSoon(async () => (await state(page)).hover).toBe('UKR');
  await record(page);
  await expect(prompt(page)).toHaveText('Open your hand to choose!', { timeout: 15_000 });
  await page.waitForTimeout(1500);
  let frames = await recorded(page);
  // Over Ukraine all that while, and nothing chosen, nor even begun to be.
  expect(frames.length).toBeGreaterThan(60);
  expect(frames.filter((frame) => frame.hover === 'UKR').length).toBeGreaterThan(frames.length * 0.9);
  expect(frames.every((frame) => frame.state === 'find' && frame.over === null && frame.overFor === 0)).toBe(true);
  expect((await state(page)).stats.wrong).toBe(0);

  // Opened there, it chooses Ukraine: not at once, but once it has stayed open over it for a moment.
  await record(page);
  await leadHands(page, { aim: 'target' });
  await waitForState(page, 'fly');
  frames = await recorded(page);
  const flew = frames.findIndex((frame) => frame.state === 'fly');
  let first = flew;
  while (first > 0 && frames[first - 1].over === 'UKR' && frames[first - 1].overFor > 0) first -= 1;
  const dwell = frames.slice(first, flew);
  expect(dwell.length).toBeGreaterThan(10);
  // All that moment the ring was closing round Ukraine's pin, a little more each frame, until it was whole.
  expect(dwell.every((frame) => frame.hover === 'UKR' && frame.open)).toBe(true);
  for (let n = 1; n < dwell.length; n += 1) expect(dwell[n].overFor).toBeGreaterThan(dwell[n - 1].overFor);
  expect(dwell.at(-1).overFor).toBeGreaterThan(0.8);
  expect(frames[flew].t - dwell[0].t).toBeGreaterThan(800);
  const now = await state(page);
  expect([now.target, now.stats.wrong, now.cans]).toEqual(['UKR', 0, 5]);
  await stopHands(page);
});

test('the wrong country is named, goes grey and can\'t be chosen again, a can of fuel goes, and the question is asked again', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page);
  await waitForState(page, 'find');
  await expect(page.locator('#story-line')).toHaveText('Where is Ukraine?');
  await expect(page.locator('#chip-fuel .tour-can')).toHaveCount(5);
  await expect(emptyCans(page)).toHaveCount(0);
  await choose(page, 'POL');
  const now = await state(page);
  expect([now.state, now.out, now.cans, now.stats.wrong]).toEqual(['find', ['POL'], 4, 1]);
  await expect(page.locator('#story-line')).toHaveText('This is Poland!');
  await expect(emptyCans(page)).toHaveCount(1);
  await expect(page.locator('#chip-fuel .tour-can')).toHaveCount(5);
  // The hand goes away from the globe, and Poland's pin is grey. The hand is over no country as soon as Poland
  // is grey, so it's the glove itself that's waited for: the dot in its palm would be over the pin.
  const pin = await page.evaluate(() => window.__game.view.onScreen(window.__game.tour.places.POL));
  await leadHands(page, { aim: { x: 0.88, y: 0.85 }, photo: 'fist' });
  await expectSoon(() => gloveFrom(page, pin), { timeout: 15_000 }).toBeGreaterThan(200);
  // On its way it passes Ukraine: it's waited for to be over nothing at all.
  await expectSoon(async () => (await state(page)).hover, { timeout: 15_000 }).toBe(null);
  const [grey] = await screenPixels(page, [pin]);
  expect(grey.map((value, n) => Math.abs(value - [200, 206, 214][n]) <= 6), `${grey}`).toEqual([true, true, true]);
  // And Giraffe asks again.
  await expect(page.locator('#story-line')).toHaveText('Where is Ukraine?', { timeout: 10_000 });
  // Over Poland again, it isn't Poland the hand is over: it can't be chosen.
  await leadHands(page, { aim: 'country:POL', photo: 'fist' });
  await expectSoon(() => gloveFrom(page, pin), { timeout: 15_000 }).toBeLessThan(20);
  await record(page);
  await page.waitForTimeout(1500);
  const frames = await recorded(page);
  expect(frames.some((frame) => frame.hover === 'POL' || frame.over === 'POL')).toBe(false);
  const after = await state(page);
  expect([after.state, after.out, after.cans, after.stats.wrong]).toEqual(['find', ['POL'], 4, 1]);
  await shot(page, 'world-tour-wrong');
  // Ukraine is still there to be chosen.
  await choose(page, 'UKR');
  expect((await state(page)).state).toBe('fly');
  await stopHands(page);
});

test('an open hand left on a country that was wrong chooses nothing more: no other country, and no more fuel', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page);
  await waitForState(page, 'find');
  await choose(page, 'POL');
  // Opened again on Poland, and held there, as a child who's listening to its name might.
  await leadHands(page, { aim: 'country:POL' });
  await page.waitForTimeout(5000);
  const now = await state(page);
  expect([now.state, now.out, now.cans, now.stats.wrong]).toEqual(['find', ['POL'], 4, 1]);
  await stopHands(page);
});

test('out of fuel, the journey is lost: the card says so, nothing cheers, the big button says Try again, and the level stays where it was', async ({ page }) => {
  test.setTimeout(180_000);
  // Level 8 sets off with three cans.
  await startPlaying(page, atLevel(8));
  await waitForState(page, 'find');
  const { target, choices, cans } = await state(page);
  expect(cans).toBe(3);
  const wrong = choices.filter((id) => id !== target);
  expect(wrong.length).toBeGreaterThanOrEqual(3);
  for (const id of wrong.slice(0, 2)) await choose(page, id);
  expect((await state(page)).cans).toBe(1);
  await expect(emptyCans(page)).toHaveCount(2);
  await choose(page, wrong[2]);
  expect((await state(page)).state).toBe('lost');
  await expect(emptyCans(page)).toHaveCount(3);
  await waitForScreen(page, 'finish');
  await stopHands(page);
  await expect(page.locator('#screen-finish h2')).toHaveText('Out of fuel!');
  await expect(page.locator('#play-again')).toHaveText('Try again');
  await expect(page.locator('#level-done-text')).toHaveText('Let’s try level 8 again!');
  expect(await page.evaluate(() => window.__game.session.levels.current)).toBe(8);
  expect(await page.evaluate(() => window.__game.sound.finished)).toEqual({ line: 'So close! Try again!', lost: true });
  expect(await page.evaluate(() => window.__game.hud.confetti.running)).toBe(false);
  await page.waitForTimeout(600);
  await shot(page, 'world-tour-out-of-fuel');
  // Trying again is the same journey from the start, with a full tank.
  await show(page, ...OPEN);
  await page.locator('#play-again').click();
  await waitForScreen(page, 'playing');
  const again = await state(page);
  expect([again.level, again.cans, again.flown, again.stats.wrong]).toEqual([8, 3, [], 0]);
});

test('on the gentle tour wrong countries never end the journey, and the fuel chip shows ∞', async ({ page }) => {
  test.setTimeout(180_000);
  // Level 8, where three wrong countries would otherwise use up all the fuel.
  await startPlaying(page, atLevel(8, GENTLE));
  await waitForState(page, 'find');
  await expect(page.locator('#chip-fuel')).toHaveText('∞');
  await expect(page.locator('#chip-fuel .tour-can')).toHaveCount(0);
  const { target, choices } = await state(page);
  const wrong = choices.filter((id) => id !== target);
  for (const id of wrong) await choose(page, id);
  const now = await state(page);
  expect([now.state, now.cans, now.stats.wrong]).toEqual(['find', Infinity, wrong.length]);
  expect(wrong.length).toBeGreaterThanOrEqual(3);
  await expect(page.locator('#chip-fuel')).toHaveText('∞');
  await choose(page, target);
  expect((await state(page)).state).toBe('fly');
  await stopHands(page);
});

test('with nobody in the picture nothing happens: the question waits, and no fuel goes, for 20 seconds', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page);
  await waitForState(page, 'find');
  await show(page, ...NO_HAND);
  await expectSoon(async () => (await state(page)).at).toBe(null);
  const before = await state(page);
  await page.waitForTimeout(20_000);
  const after = await state(page);
  expect([after.state, after.target, after.cans, after.out, after.stats.wrong]).toEqual(['find', 'UKR', 5, [], 0]);
  // The tour's clock stopped too.
  expect(after.stats.seconds).toBe(before.stats.seconds);
  await expect(page.locator('#story-line')).toHaveText('Where is Ukraine?');
});

test('at level 5, with nobody in the picture no gust comes while the flag waits to be painted', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, atLevel(5));
  await waitForState(page, 'find');
  await leadHands(page, { aim: 'target', other: { aim: 'hold' } });
  await waitForState(page, 'paint');
  await stopHands(page);
  await show(page, ...NO_HAND);
  await expectSoon(async () => (await state(page)).at).toBe(null);
  const before = await state(page);
  expect(before.gustIn).toBeGreaterThan(5);
  await page.waitForTimeout(20_000);
  const after = await state(page);
  expect([after.state, after.gustIn, after.stats.gusts, after.cans, after.gustShare]).toEqual(['paint', before.gustIn, 0, 4, 0]);
});

/* ---------- painting the flag ---------- */

test('paint lands only where its colour goes: blue swept over the whole of Ukraine\'s flag leaves the yellow stripe bare, in the rules and on the screen', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page);
  await waitForState(page, 'find');
  await leadHands(page, { aim: 'target' });
  await waitForState(page, 'paint');
  await leadHands(page, { aim: 'pot:blue' });
  await expectSoon(async () => (await state(page)).paint).toBe('blue');
  await trackBrush(page);
  await leadHands(page, { aim: 'sweep' });
  // The blue stripe fills itself in, and over the yellow the stripe asks for its own pot.
  await expectSoon(async () => (await state(page)).done?.[0], { timeout: 120_000 }).toBe(true);
  await expectSoon(async () => (await state(page)).hint?.paint ?? null, { timeout: 60_000 }).toBe('yellow');
  // Right across the yellow stripe, from top to bottom.
  await expectSoon(() => sweptOver(page, 5, 9), { timeout: 120_000 }).toBe(true);
  await stopHands(page);
  const now = await state(page);
  expect(now.parts.map((part) => part.colour)).toEqual(['blue', 'yellow']);
  expect(now.counts[1]).toBe(0);
  expect(now.done).toEqual([true, false]);
  expect(now.state).toBe('paint');
  // On the screen, the yellow stripe is still bare paper all over, and the blue one is blue.
  const places = (top, bottom) => {
    const list = [];
    for (let y = top; y <= bottom; y += 6) for (let x = 6; x <= 144; x += 9) list.push({ x, y });
    return list;
  };
  const yellow = await flagPixels(page, places(56, 95));
  const notBare = yellow.filter((colour) => !isPaper(colour));
  expect(notBare, `${notBare.slice(0, 5).join(' / ')}`).toEqual([]);
  const blue = await flagPixels(page, places(6, 44));
  expect(blue.every(([r, g, b]) => r < 40 && b > 150 && b > g + 60), `${blue.slice(0, 3).join(' / ')}`).toBe(true);
  await shot(page, 'world-tour-blue-only');
});

test('a closed hand takes no paint from a pot, and paints nothing', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page);
  await waitForState(page, 'find');
  await leadHands(page, { aim: 'target' });
  await waitForState(page, 'paint');
  // Closed, into the blue pot, and kept there.
  await leadHands(page, { aim: 'pot:blue', photo: 'fist' });
  await waitForHand(page, 'closed');
  const pot = await page.evaluate(() => window.__game.view.pots.find((each) => each.paint === 'blue'));
  await expectSoon(() => gloveFrom(page, pot)).toBeLessThan(pot.r * 0.5);
  await page.waitForTimeout(2000);
  let now = await state(page);
  expect([now.paint, now.stats.dips]).toEqual([null, 0]);
  await expect(prompt(page)).toHaveText('Open your hand to paint!', { timeout: 10_000 });
  // Open in the pot, it takes the blue.
  await leadHands(page, { aim: 'pot:blue' });
  await expectSoon(async () => (await state(page)).paint).toBe('blue');
  expect((await state(page)).stats.dips).toBe(1);
  // Closed again where it is, and then right across the blue stripe and back: nothing goes on.
  await leadHands(page, { aim: 'pot:blue', photo: 'fist' });
  await waitForHand(page, 'closed');
  await trackBrush(page);
  await leadHands(page, { aim: 'sweep:10,40', photo: 'fist' });
  await expectSoon(async () => {
    const at = (await state(page)).at;
    const flag = at && await page.evaluate(({ x, y }) => window.__game.view.toFlag(x, y), at);
    return flag ? flag.y < 40 && flag.x > 120 : false;
  }, { timeout: 30_000 }).toBe(true);
  await page.waitForTimeout(4000);
  now = await state(page);
  expect(now.counts).toEqual([0, 0]);
  expect(now.paint).toBe('blue');
  // Opened, the same sweep paints.
  await leadHands(page, { aim: 'sweep:10,40' });
  await expectSoon(async () => (await state(page)).counts[0], { timeout: 30_000 }).toBeGreaterThan(100);
  expect((await state(page)).counts[1]).toBe(0);
  await stopHands(page);
});

/* ---------- raising the flag ---------- */

test('raising: an open hand that starts high doesn\'t raise the flag, and is told to reach down; a closed one doesn\'t either; from low to high an open hand does', async ({ page }) => {
  test.setTimeout(300_000);
  await startPlaying(page);
  await waitForState(page, 'find');
  await paintEndingHigh(page);
  let now = await state(page);
  expect([now.gripped, now.raisedTo]).toEqual([false, 0]);
  // Up high, open, and kept there.
  await leadHands(page, { aim: 'high' });
  await expect(prompt(page)).toHaveText('Reach down low first, then lift!', { timeout: 15_000 });
  now = await state(page);
  expect([now.state, now.gripped, now.raisedTo]).toEqual(['raise', false, 0]);
  expect(await page.evaluate((y) => window.__game.view.liftOf(y), now.at.y)).toBeGreaterThan(0.85);
  // Closed, from low down to high up: nothing.
  await leadHands(page, { aim: 'high', photo: 'fist' });
  await waitForHand(page, 'closed');
  await leadHands(page, { aim: 'low', photo: 'fist' });
  await expectSoon(async () => page.evaluate((y) => window.__game.view.liftOf(y), (await state(page)).at?.y ?? 0)).toBeLessThan(0.15);
  await page.waitForTimeout(800);
  await leadHands(page, { aim: 'high', photo: 'fist' });
  await expectSoon(async () => page.evaluate((y) => window.__game.view.liftOf(y), (await state(page)).at?.y ?? 0)).toBeGreaterThan(0.85);
  await page.waitForTimeout(800);
  now = await state(page);
  expect([now.state, now.gripped, now.raisedTo]).toEqual(['raise', false, 0]);
  // Open, from low down: it takes the rope, and up it goes.
  await leadHands(page, { aim: 'low', photo: 'fist' });
  await expectSoon(async () => page.evaluate((y) => window.__game.view.liftOf(y), (await state(page)).at?.y ?? 0)).toBeLessThan(0.15);
  await leadHands(page, { aim: 'low' });
  await expectSoon(async () => (await state(page)).gripped).toBe(true);
  await leadHands(page, { aim: 'high' });
  await waitForState(page, 'settle');
  now = await state(page);
  expect([now.raisedTo, now.flown]).toEqual([1, ['UKR']]);
  await stopHands(page);
});

/* ---------- hands as they really are ---------- */

test('a hand that wobbles as it goes still gets through a whole stop, with no wrong country', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page);
  await waitForState(page, 'find');
  await leadHands(page, { aim: 'play', wobble: 0.03 });
  await waitForState(page, 'settle', 180_000);
  await stopHands(page);
  const now = await state(page);
  expect([now.flown, now.stats.wrong, now.cans]).toEqual([['UKR'], 0, 5]);
});

test('a hand the tracker loses for a moment while it\'s choosing, and finds again over the country next door, doesn\'t choose the wrong country', async ({ page }) => {
  test.setTimeout(150_000);
  const hover = async () => (await state(page)).hover;
  await startPlaying(page);
  await waitForState(page, 'find');
  await show(page, ...FIST);
  await waitForHand(page, 'closed');
  // Where the hand is in the camera's picture when its glove is over Poland.
  const poland = await page.evaluate(() => window.__game.view.onScreen(window.__game.tour.places.POL));
  await leadHands(page, { aim: 'country:POL', photo: 'fist', wobble: 0.03 });
  await expectSoon(() => gloveFrom(page, poland)).toBeLessThan(25);
  const there = await page.evaluate(() => ({ ...window.__lead.at.play }));
  // Closed over Ukraine, and then open there, choosing it.
  await leadHands(page, { aim: 'target', photo: 'fist', wobble: 0.03 });
  await expectSoon(hover).toBe('UKR');
  await record(page);
  await leadHands(page, { aim: 'target', wobble: 0.03 });
  await expectSoon(async () => (await state(page)).overFor).toBeGreaterThan(0.35);
  // Lost for a moment, and while it's lost the hand drifts over Poland, where it's found again, open, and goes
  // straight back to Ukraine.
  await leadHands(page, { aim: 'target', photo: 'none', wobble: 0.03 });
  await expectSoon(async () => (await state(page)).at, { timeout: 5000 }).toBe(null);
  await page.evaluate((to) => Object.assign(window.__lead.at.play, to), there);
  await leadHands(page, { aim: 'country:POL', wobble: 0.03 });
  await expectSoon(hover, { timeout: 5000 }).toBe('POL');
  await leadHands(page, { aim: 'target', wobble: 0.03 });
  await waitForState(page, 'fly');
  const frames = await recorded(page);
  expect(frames.some((frame) => frame.state === 'find' && !frame.at)).toBe(true);
  expect(frames.some((frame) => frame.state === 'find' && frame.hover === 'POL' && frame.open)).toBe(true);
  expect(frames.every((frame) => frame.wrong === 0 && frame.out.length === 0)).toBe(true);
  const now = await state(page);
  expect([now.target, now.stats.wrong, now.cans]).toEqual(['UKR', 0, 5]);
  await stopHands(page);
});

/* ---------- what the child is shown and told ---------- */

test('the little films: choosing shows until a country is chosen, painting until a part is painted, and raising until the rope is taken', async ({ page }) => {
  test.setTimeout(300_000);
  await startPlaying(page);
  await waitForState(page, 'find');
  expect((await state(page)).film).toBe('find');
  await expect(page.locator('.tour-film .film-find')).toBeVisible();
  await leadHands(page, { aim: 'target' });
  await waitForState(page, 'fly');
  expect((await state(page)).film).toBe(null);
  await expect(page.locator('.tour-film')).toBeHidden();
  await waitForState(page, 'paint');
  await expectSoon(async () => (await state(page)).film).toBe('paint');
  await expect(page.locator('.tour-film .film-paint')).toBeVisible();
  await record(page);
  await paintEndingHigh(page);
  const frames = await recorded(page);
  // The painting film went once the first part was painted, and not before.
  const painting = frames.filter((frame) => frame.state === 'paint');
  expect(painting.filter((frame) => frame.parts === 0).every((frame) => frame.film === 'paint')).toBe(true);
  expect(painting.filter((frame) => frame.parts >= 1).every((frame) => frame.film === null)).toBe(true);
  expect(painting.some((frame) => frame.parts >= 1)).toBe(true);
  // The raising film shows until the hand takes the rope.
  await expectSoon(async () => (await state(page)).film).toBe('raise');
  await expect(page.locator('.tour-film .film-raise')).toBeVisible();
  await leadHands(page, { aim: 'low' });
  await expectSoon(async () => (await state(page)).gripped).toBe(true);
  expect((await state(page)).film).toBe(null);
  await expect(page.locator('.tour-film')).toBeHidden();
  await stopHands(page);
});

test('with sound and voice on, a stop is said as it goes, and every line said has its recording', async ({ page }) => {
  test.setTimeout(240_000);
  await openGame(page, { voice: true, sound: true }, GAME);
  await expectSoon(() => page.evaluate(() => Boolean(window.__game?.sound))).toBe(true);
  await page.evaluate(() => {
    const { sound } = window.__game;
    window.__said = [];
    const say = sound.say.bind(sound);
    sound.say = (text, options) => {
      window.__said.push({ text, clip: sound.voiceClips.has(text), loaded: Boolean(sound.linesLoaded) });
      return say(text, options);
    };
  });
  await show(page, ...OPEN);
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
  await waitForState(page, 'find');
  await choose(page, 'POL');
  await expect(page.locator('#story-line')).toHaveText('Where is Ukraine?', { timeout: 10_000 });
  await leadHands(page, { aim: 'play' });
  await waitForState(page, 'settle', 180_000);
  await waitForState(page, 'find');
  await stopHands(page);
  const said = await page.evaluate(() => window.__said);
  const story = said.map(({ text }) => text).filter((text) => /^(Where is|This is)/.test(text));
  expect(story).toEqual(['Where is Ukraine?', 'This is Poland!', 'Where is Ukraine?', 'This is Ukraine!', 'Where is Poland?']);
  // Each was said with its own recording, as was everything else.
  expect(said.filter(({ loaded }) => loaded).every(({ clip }) => clip), JSON.stringify(said)).toBe(true);
  expect(said.filter(({ loaded }) => loaded).length).toBeGreaterThanOrEqual(story.length);
  expect(await page.evaluate(() => window.__game.sound.linesLoaded)).toBe(true);
});

test('in Georgian, Giraffe asks in Georgian, and the countries\' name tags are in Georgian letters', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, { language: 'ka' });
  await waitForState(page, 'find');
  await expect(page.locator('#story-line')).toHaveText('სად არის უკრაინა?');
  await expect(page.locator('#story-name')).toHaveText(/[Ⴀ-ჿ]/);
  await page.evaluate(() => {
    const { ctx } = window.__game.view;
    window.__texts = new Set();
    const fill = ctx.fillText.bind(ctx);
    ctx.fillText = (text, ...rest) => {
      window.__texts.add(String(text));
      return fill(text, ...rest);
    };
  });
  // A closed hand is asked to open, in Georgian.
  await leadHands(page, { aim: 'country:POL', photo: 'fist' });
  await expect(prompt(page)).toHaveText('გაშალე ხელი და აირჩიე!', { timeout: 15_000 });
  await choose(page, 'POL');
  await expect(page.locator('#story-line')).toHaveText('ეს არის პოლონეთი!');
  await expectSoon(() => page.evaluate(() => [...window.__texts])).toContain('პოლონეთი');
  await choose(page, 'UKR');
  await waitForState(page, 'land');
  await expect(page.locator('#story-line')).toHaveText('ეს არის უკრაინა!');
  await expectSoon(() => page.evaluate(() => [...window.__texts])).toContain('უკრაინა');
  await page.waitForTimeout(800);
  await shot(page, 'world-tour-georgian');
  // Nothing on the globe is in English.
  const drawn = await page.evaluate(() => [...window.__texts]);
  expect(drawn.filter((text) => /[A-Za-z]/.test(text))).toEqual([]);
  await stopHands(page);
});
