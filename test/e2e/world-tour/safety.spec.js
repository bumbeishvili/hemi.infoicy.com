// Giraffe's World Tour is safe to look at and fits the screen: nothing flashes through a whole stop, in a gust or as
// the journey is lost; on a laptop's screen and a bigger one, with either hand and with the flag held, nothing on the
// screen covers anything else; and the grown-ups' panel starts a journey again only for what changes how it's played.
import { shot } from '../helpers.js';
import {
  choose, expect, expectSoon, GAME, judge, leadHands, startPlaying, state, stopHands, test, waitForHand, waitForScreen, waitForState,
  watchUntil,
} from './helpers.js';

const HOLD = { aim: 'hold' };
const atLevel = (level, more = {}) => ({ levels: { [GAME]: level }, ...more });

/** Reads the picture until the tour gets somewhere, and says whether anything flashed on the way. */
async function steady(page, name, until, after = 90) {
  const { reading, reached } = await watchUntil(page, until, { after, most: 9000 });
  const judged = judge(reading);
  console.log(name, JSON.stringify(judged));
  expect(reached, `${name}: got there`).toBe(true);
  expect(judged.biggestStep, name).toBeLessThan(4);
  expect(judged.flickeringShare, name).toBeLessThan(0.01);
}

/* ---------- nothing flashes ---------- */

test('nothing flashes through a whole stop: choosing, flying, landing, the board coming up, painting, a part filling in, raising and the flag flying', async ({ page }) => {
  test.setTimeout(300_000);
  await startPlaying(page);
  await waitForState(page, 'find');
  await leadHands(page, { aim: 'play' });
  // One reading of the whole stop, judged a part at a time, each with the frame before it, so a change from one
  // part to the next is in it. Flicker is how often a place flashes in a second, so it's judged over a second either
  // side of the part as well, as a part can be shorter than a second. Every part is judged, whatever an earlier one
  // showed.
  const { reading, reached } = await watchUntil(page, { state: 'settle' }, { after: 80, most: 12_000 });
  await stopHands(page);
  expect(reached).toBe(true);
  const parts = [
    ['choosing, flying and landing', (frame) => ['find', 'fly', 'land'].includes(frame.state)],
    ['the board coming up', (frame) => frame.state === 'paint' && frame.board < 1],
    ['painting, and the parts filling in', (frame) => frame.state === 'paint' && frame.board === 1],
    ['the painted flag going to its pole, and raised', (frame) => frame.state === 'raise'],
    ['the flag flying', (frame) => frame.state === 'settle'],
  ];
  for (const [name, inIt] of parts) {
    const first = reading.findIndex(inIt);
    const last = reading.findLastIndex(inIt);
    expect.soft(first, `${name}: in the reading`).toBeGreaterThanOrEqual(0);
    if (first < 0) continue;
    const judged = judge(reading.slice(Math.max(0, first - 1), last + 1));
    const around = judge(reading.slice(Math.max(0, first - 60), last + 61));
    console.log(name, JSON.stringify({ ...judged, flickeringAround: around.flickeringShare }));
    expect.soft(judged.biggestStep, name).toBeLessThan(4);
    expect.soft(around.flickeringShare, name).toBeLessThan(0.01);
  }
});

test('nothing flashes as the flag that\'s flying makes way for the globe and the next question', async ({ page }) => {
  test.setTimeout(300_000);
  await startPlaying(page);
  await waitForState(page, 'find');
  await leadHands(page, { aim: 'play' });
  await waitForState(page, 'raise', 200_000);
  await steady(page, 'the flag flying, and the globe back for the next country', { stops: 1, state: 'find' }, 90);
  await stopHands(page);
});

test('nothing flashes as a gust comes at level 5, with the flag held and with it let go', async ({ page }) => {
  test.setTimeout(300_000);
  await startPlaying(page, atLevel(5));
  await waitForState(page, 'find');
  await leadHands(page, { aim: 'target', other: HOLD });
  await waitForState(page, 'paint');
  await leadHands(page, { aim: 'pot:red', other: HOLD });
  await expectSoon(async () => (await state(page)).paint).toBe('red');
  await leadHands(page, { aim: 'flag:40,16', other: HOLD });
  await expectSoon(async () => (await state(page)).counts[0]).toBeGreaterThan(80);
  await leadHands(page, { aim: 'flag:40,16', photo: 'fist', other: HOLD });
  await waitForHand(page, 'closed');
  await steady(page, 'a gust, with the flag held', { gusts: 1 });
  expect((await state(page)).stats.held).toBe(1);
  await leadHands(page, { aim: 'flag:40,16', photo: 'fist' });
  await steady(page, 'a gust, with the flag let go, taking the paint', { gusts: 2 });
  expect((await state(page)).stats.lost).toBe(1);
  await stopHands(page);
});

test('nothing flashes as the plane runs out of fuel and the journey ends', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, atLevel(8));
  await waitForState(page, 'find');
  const { target, choices } = await state(page);
  const wrong = choices.filter((id) => id !== target);
  for (const id of wrong.slice(0, 2)) await choose(page, id);
  // Over the third, closed, and then opened: the last can goes, the plane comes down, and the card comes.
  await leadHands(page, { aim: `country:${wrong[2]}`, photo: 'fist' });
  await expectSoon(async () => (await state(page)).hover).toBe(wrong[2]);
  await leadHands(page, { aim: `country:${wrong[2]}` });
  await steady(page, 'out of fuel, and the end of the journey', { screen: 'finish' });
  expect((await state(page)).state).toBe('lost');
  await stopHands(page);
});

/* ---------- it fits ---------- */

/** Where everything is: the page's own boxes, and what's drawn for the board, as { name: { left, top, right, bottom } }. */
const boxes = (page) => page.evaluate(() => {
  const { view, tour } = window.__game;
  const found = {};
  const take = (name, selector) => {
    const element = document.querySelector(selector);
    const box = element?.getBoundingClientRect();
    if (box && box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== 'hidden') found[name] = { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
  };
  take('chips', '.tour-hud');
  take('story', '#story');
  take('mirror', '#camera-frame');
  take('meter', '.hands-bar');
  take('gear', '#open-panel');
  take('film', '.tour-film');
  take('prompt', '#prompt');
  const h = view.height;
  const square = (x, y, reach) => ({ left: x - reach, top: y - reach, right: x + reach, bottom: y + reach });
  const frame = h * 0.014;
  const { board } = view;
  found.board = { left: board.x - frame, top: board.y - frame, right: board.x + board.wide + frame, bottom: board.y + board.high + frame * 1.9 };
  // A pot, with its ring, and as high as it bobs when it's the one wanted.
  view.pots.forEach((pot, n) => {
    found[`pot ${n + 1} (${pot.paint})`] = { left: pot.x - pot.r * 1.3, top: pot.y - pot.r * 1.52, right: pot.x + pot.r * 1.3, bottom: pot.y + pot.r * 1.3 };
  });
  if (view.copy) {
    const { x, y, wide, high } = view.copy;
    found.copy = { left: x - h * 0.014, top: y - h * 0.014, right: x + wide + h * 0.014, bottom: y + high + h * 0.014 };
    // Its name tag, sized as view.js sizes it.
    const size = Math.min(30, Math.max(16, h * 0.03)) * 0.9;
    const ctx = view.ctx;
    ctx.save();
    ctx.font = `800 ${size}px system-ui, sans-serif`;
    const tag = ctx.measureText(view.nameOf(tour.target)).width + size * 1.2;
    ctx.restore();
    const middle = Math.min(Math.max(x + wide / 2, tag / 2 + 6), view.width - tag / 2 - 6);
    const at = y + high + h * 0.05;
    found['copy name'] = { left: middle - tag / 2, top: at - size * 0.8, right: middle + tag / 2, bottom: at + size * 0.8 };
  }
  if (view.hold) found['holding spot'] = square(view.hold.x, view.hold.y, view.hold.r * 1.12);
  return { found, width: innerWidth, height: innerHeight };
});

/** Every pair of the boxes that overlap, and every box that isn't all on the screen. */
function clashes({ found, width, height }) {
  const names = Object.keys(found);
  const wrong = [];
  for (const name of names) {
    const box = found[name];
    if (box.left < 0 || box.top < 0 || box.right > width || box.bottom > height) wrong.push(`${name} is off the screen: ${JSON.stringify(box)}`);
  }
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      const [a, b] = [found[names[i]], found[names[j]]];
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) wrong.push(`${names[i]} and ${names[j]} overlap`);
    }
  }
  return wrong;
}

const LAYOUTS = [
  ['the right hand', {}, null, 'right'],
  ['the right hand, with the flag held', atLevel(5), HOLD, 'right'],
  ['the left hand', { hands: 'left' }, null, 'left'],
  ['the left hand, with the flag held', atLevel(5, { hands: 'left' }), HOLD, 'left'],
];

for (const viewport of [{ width: 1180, height: 820 }, { width: 1440, height: 900 }]) {
  test.describe(`at ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });
    for (const [name, settings, other, side] of LAYOUTS) {
      test(`everything fits on the screen and nothing covers anything else, at ${viewport.width}×${viewport.height}, with ${name}`, async ({ page }) => {
        test.setTimeout(180_000);
        await startPlaying(page, settings);
        await waitForState(page, 'find');
        await leadHands(page, { aim: 'target', other, side });
        await waitForState(page, 'paint');
        await expectSoon(() => page.evaluate(() => window.__game.view.boardFor)).toBe(1);
        // The first board: the country's name is up beside it, and the little film of painting.
        const first = await boxes(page);
        expect(Object.keys(first.found)).toEqual(expect.arrayContaining(['chips', 'story', 'mirror', 'film', 'board', 'copy']));
        expect(clashes(first)).toEqual([]);
        await shot(page, `world-tour-fit-${viewport.width}-${name.replace(/\W+/g, '-')}`);
        // The hand closed, and what it's told along the bottom.
        await leadHands(page, { aim: 'pot:roller', photo: 'fist', other, side });
        await expect(page.locator('#prompt-text')).toHaveText(/./, { timeout: 15_000 });
        const prompted = await boxes(page);
        expect(prompted.found.prompt).toBeTruthy();
        expect(clashes(prompted)).toEqual([]);
        if (other) {
          // Let go, as a gust comes: the longest thing it's told here.
          await leadHands(page, { aim: 'pot:roller', photo: 'fist', side });
          await expect(page.locator('#prompt-text')).toHaveText('Hold the flag with your other hand!', { timeout: 30_000 });
          const letGo = await boxes(page);
          expect(clashes(letGo)).toEqual([]);
        }
        await stopHands(page);
      });
    }
  });
}

/* ---------- the grown-ups' panel ---------- */

async function inPanel(page, choices) {
  await page.locator('#open-panel').click();
  for (const [name, value] of Object.entries(choices)) await page.locator(`input[name="${name}"][value="${value}"]`).check();
  await page.locator('#close-panel').click();
  await expect(page.locator('#panel')).toBeHidden();
}

test('reach help changed in the middle of a journey goes on at once, and the journey carries on as it was', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page);
  await waitForState(page, 'find');
  await choose(page, 'POL');
  // The closed hand held still off to one side: where its glove is with a little reach help, and with a lot.
  await stopHands(page);
  await page.evaluate(() => window.__camera.show({ left: null, right: 'fist', scale: 0.62, rightOffsetX: -480, rightOffsetY: -90 }));
  const settled = async () => {
    await page.waitForTimeout(1200);
    await expectSoon(async () => (await state(page)).at, { timeout: 10_000 }).not.toBe(null);
    const { at } = await state(page);
    const desk = await page.evaluate(() => window.__game.view.desk);
    return { x: at.x - (desk.left + desk.width / 2), y: at.y - (desk.top + desk.height / 2) };
  };
  const little = await settled();
  const before = await page.evaluate(() => window.__game.session.playSeconds);
  await inPanel(page, { tourReach: 'lots' });
  // It isn't started again: no countdown, and the country that was wrong is still out, with the can gone.
  for (let n = 0; n < 15; n += 1) {
    expect((await state(page)).screen).toBe('playing');
    await page.waitForTimeout(100);
  }
  const lots = await settled();
  const now = await state(page);
  expect([now.out, now.cans, now.stats.wrong, now.target]).toEqual([['POL'], 4, 1, 'UKR']);
  expect(await page.evaluate(() => window.__game.session.playSeconds)).toBeGreaterThan(before);
  expect(Math.abs(little.x)).toBeGreaterThan(40);
  expect(Math.hypot(lots.x, lots.y)).toBeGreaterThan(Math.hypot(little.x, little.y) * 1.15);
});

test('the fuel or the holding changed in the middle of a journey starts it again, with that, when the panel closes', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page);
  await waitForState(page, 'find');
  await choose(page, 'POL');
  await stopHands(page);
  expect((await state(page)).cans).toBe(4);
  // The gentle tour: the journey starts again, with fuel that never runs out.
  await page.locator('#open-panel').click();
  await page.locator('input[name="tourFuel"][value="gentle"]').check();
  // Nothing starts again while the panel is open.
  expect((await state(page)).screen).toBe('playing');
  await page.locator('#close-panel').click();
  await waitForScreen(page, 'countdown');
  await waitForScreen(page, 'playing');
  let now = await state(page);
  expect([now.cans, now.out, now.stats.wrong, now.state]).toEqual([Infinity, [], 0, 'find']);
  await expect(page.locator('#chip-fuel')).toHaveText('∞');
  // The flag held from the first level: started again, and now it has to be held.
  expect(now.rules.holding).toBe(false);
  await inPanel(page, { tourHold: 'always' });
  await waitForScreen(page, 'countdown');
  await waitForScreen(page, 'playing');
  now = await state(page);
  expect([now.rules.holding, now.level, now.cans]).toEqual([true, 1, Infinity]);
});
