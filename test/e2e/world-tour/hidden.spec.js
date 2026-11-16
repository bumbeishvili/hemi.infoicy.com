// Giraffe's World Tour with the finished flag hidden: a grown-up's choice, for a child who's to paint each flag
// from what they know. The card beside the board never shows the flag, no pot is pointed out, the wrong paint just
// doesn't land, and from level 7 there's a pot of paint the flag doesn't have. With real photos of hands through
// the real tracker.
import { shot } from '../helpers.js';
import { expect, expectSoon, GAME, leadHands, ONE_HAND, screenPixels, startPlaying, state, stopHands, test, waitForScreen, waitForState } from './helpers.js';
import { openGame } from '../helpers.js';

const HIDDEN = { tourCopy: 'hidden' };
/** From the title to the board, with the flag standing in outline and the board fully there. */
async function reachBoard(page, settings = {}) {
  await startPlaying(page, settings);
  await waitForState(page, 'find');
  await leadHands(page, { aim: 'target' });
  await waitForState(page, 'paint');
  await expectSoon(() => page.evaluate(() => window.__game.view.boardFor)).toBe(1);
}
/** Two places on the card beside the board: near its top left, and near its bottom left, clear of what's in its middle. */
const cardPlaces = (page) => page.evaluate(() => {
  const { copy } = window.__game.view;
  return [{ x: copy.x + copy.wide * 0.12, y: copy.y + copy.high * 0.2 }, { x: copy.x + copy.wide * 0.12, y: copy.y + copy.high * 0.8 }];
});
const near = (pixel, wanted, by = 12) => pixel.every((value, index) => Math.abs(value - wanted[index]) <= by);
const GREY = [230, 235, 242]; // The card that hides the flag.

test('as the game comes, the finished flag is beside the board to copy from', async ({ page }) => {
  await reachBoard(page);
  expect((await state(page)).shown).toBe(true);
  const [top, bottom] = await screenPixels(page, await cardPlaces(page));
  // Ukraine's flag: blue over yellow.
  expect(near(top, [0, 87, 183]), `${top}`).toBe(true);
  expect(near(bottom, [255, 215, 0]), `${bottom}`).toBe(true);
  await stopHands(page);
});

test('with the flag hidden, the card shows a question mark from the start, the wrong paint lands nowhere and no pot is pointed out, and the right paint still paints', async ({ page }) => {
  test.setTimeout(180_000);
  await reachBoard(page, HIDDEN);
  let now = await state(page);
  expect(now.shown).toBe(false);
  expect(await page.evaluate(() => window.__game.tour.helps)).toBe(false);
  // The card is the plain grey one, top and bottom, and the country's name is still under it.
  const places = await cardPlaces(page);
  for (const pixel of await screenPixels(page, places)) expect(near(pixel, GREY), `${pixel}`).toBe(true);
  await shot(page, 'world-tour-hidden');

  // The wrong paint, yellow, held on the blue stripe: nothing lands, nothing is shown, and the words never say
  // which pot to go to.
  await leadHands(page, { aim: 'pot:yellow' });
  await expectSoon(async () => (await state(page)).paint).toBe('yellow');
  await leadHands(page, { aim: 'flag:60,22' });
  await expectSoon(() => page.evaluate(() => window.__game.tour.stats.mistakes), { timeout: 30_000 }).toBe(1);
  const said = [];
  for (let n = 0; n < 12; n += 1) {
    said.push(await page.locator('#prompt-text').textContent());
    await page.waitForTimeout(250);
  }
  expect(said.filter((text) => text?.includes('that pot'))).toEqual([]);
  // Nor is the pot the stripe wants pointed out on the screen.
  expect(await page.evaluate(() => window.__game.view.pointed)).toBe(null);
  now = await state(page);
  // The blue stripe has none of the yellow on it. (The yellow one may have some, from the hand's way up from its pot.)
  expect([now.shares[0], now.shown, now.stats.peeks]).toEqual([0, false, 0]);
  for (const pixel of await screenPixels(page, places)) expect(near(pixel, GREY), `${pixel}`).toBe(true);

  // The right paint paints, and the flag is finished as ever.
  await leadHands(page, { aim: 'paint' });
  await waitForState(page, 'raise', 150_000);
  await stopHands(page);
  expect(await page.evaluate(() => window.__game.tour.stats.mistakes)).toBeGreaterThanOrEqual(1);
});

test('with the flag shown, the same wrong paint has its pot pointed out, in words too', async ({ page }) => {
  await reachBoard(page);
  await leadHands(page, { aim: 'pot:yellow' });
  await expectSoon(async () => (await state(page)).paint).toBe('yellow');
  await leadHands(page, { aim: 'flag:60,22' });
  await expect(page.locator('#prompt-text')).toHaveText('Dip your hand in that pot!', { timeout: 30_000 });
  expect(await page.evaluate(() => window.__game.tour.helps)).toBe(true);
  // And on the screen, the pot the stripe wants is the one pointed out.
  await expectSoon(() => page.evaluate(() => window.__game.view.pointed)).toBe('blue');
  await stopHands(page);
});

test('level 7 with the flag hidden: a pot of paint the flag doesn’t have stands among the others, can be taken, and lands nowhere', async ({ page }) => {
  test.setTimeout(180_000);
  await reachBoard(page, { ...HIDDEN, ...ONE_HAND, levels: { [GAME]: 7 } });
  const pots = await page.evaluate(() => window.__game.view.pots.map(({ paint, colour, x, y }) => ({ paint, colour, x, y })));
  const now = await state(page);
  const own = Object.keys(now.colours);
  const odd = pots.filter((pot) => pot.paint !== 'roller' && !own.includes(pot.paint));
  expect(odd.length).toBe(1);
  expect(Object.values(now.colours)).not.toContain(odd[0].colour);
  // It's a pot like the others, in the row, in its own colour on the screen.
  expect(new Set(pots.map((pot) => Math.round(pot.y))).size).toBe(1);
  const paintOn = async (pot) => (await screenPixels(page, [{ x: pot.x, y: pot.y - 0.5 * (await page.evaluate(() => window.__game.view.pots[0].r)) }]))[0];
  const hex = (colour) => [1, 3, 5].map((at) => parseInt(colour.slice(at, at + 2), 16));
  expect(near(await paintOn(odd[0]), hex(odd[0].colour), 10)).toBe(true);
  await shot(page, 'world-tour-odd-pot');

  // Taken, it's on the hand, and swept over the flag it lands nowhere.
  await leadHands(page, { aim: `pot:${odd[0].paint}` });
  await expectSoon(async () => (await state(page)).paint, { timeout: 30_000 }).toBe(odd[0].paint);
  await leadHands(page, { aim: 'flag:40,30' });
  await expectSoon(() => page.evaluate(() => window.__game.tour.stats.mistakes), { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  expect((await state(page)).progress).toBe(0);
  // On the hand it's the odd paint's own colour, in the palm of the glove.
  expect(await page.evaluate(() => window.__game.tour.colourOf(window.__game.tour.paint))).toBe(odd[0].colour);
  const palm = (await state(page)).at;
  expect(near((await screenPixels(page, [palm]))[0], hex(odd[0].colour), 10)).toBe(true);
  await stopHands(page);
});

test('at level 7 with the flag shown, and at level 6 with it hidden, there is no such pot', async ({ page }) => {
  test.setTimeout(180_000);
  for (const settings of [{ ...ONE_HAND, levels: { [GAME]: 7 } }, { ...HIDDEN, ...ONE_HAND, levels: { [GAME]: 6 } }]) {
    await page.evaluate(() => localStorage.clear()).catch(() => {});
    await reachBoard(page, settings);
    const pots = await page.evaluate(() => window.__game.view.pots.map(({ paint }) => paint).filter((paint) => paint !== 'roller'));
    expect(pots).toEqual(Object.keys((await state(page)).colours));
    await stopHands(page);
  }
});

test('the grown-ups’ panel has the choice: shown as the game comes, and hidden changes what level 7 brings, there and then', async ({ page }) => {
  await openGame(page, { levels: { [GAME]: 7 } }, GAME);
  await expect(page.locator('#level-new')).toContainText('Paint the flag from memory');
  await page.locator('#open-panel').click();
  await expect(page.locator('input[name="tourCopy"][value="shown"]')).toBeChecked();
  await page.locator('input[name="tourCopy"][value="hidden"]').check();
  await page.locator('#close-panel').click();
  await expect(page.locator('#level-new')).toContainText('A pot of paint the flag doesn’t have');
  await expect(page.locator('#level-new')).not.toContainText('from memory');
  expect(await page.evaluate(() => window.__game.session.settings.tourCopy)).toBe('hidden');
});

test('the flag hidden in the middle of a journey starts it again, hidden, and the finish card then counts the wrong paints tried', async ({ page }) => {
  await reachBoard(page);
  // As the game comes at level 1, the card has no such row.
  expect(await page.evaluate(() => document.getElementById('sum-left-mistakes').closest('tr').hidden)).toBe(true);
  await page.locator('#open-panel').click();
  await page.locator('input[name="tourCopy"][value="hidden"]').check();
  await page.locator('#close-panel').click();
  await waitForScreen(page, 'countdown');
  await waitForScreen(page, 'playing');
  expect((await state(page)).state).toBe('find');
  expect(await page.evaluate(() => window.__game.tour.rules.copy)).toBe('never');
  expect(await page.evaluate(() => document.getElementById('sum-left-mistakes').closest('tr').hidden)).toBe(false);
  await stopHands(page);
});
