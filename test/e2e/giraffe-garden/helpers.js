// Playing Giraffe's Garden in the tests, with real photos of one right hand going through the real tracker: its palm
// to hold the can, and its back, the same hand turned over, to pour. A child is played by moving the photo of the
// hand that the fake camera shows, until the water would land on a thirsty plant, and turning it over there.
import { expect, openGame, show, test, waitForScreen } from '../helpers.js';

export const GAME = 'giraffe-garden';
export const PALM = [null, 'palm', { scale: 0.62 }];
export const BACK = [null, 'back', { scale: 0.62 }];
export const FIST = [null, 'fist', { scale: 0.62 }];
export const NO_HAND = [null, null, { scale: 0.62 }];
// The gentle garden, which is the game as it always was: nothing dries out, and nobody can lose.
export const GENTLE = { gardenSun: 'gentle' };

/** Gets through the hand check with the palm to the camera, as a child would hold it up, and on into play. */
export async function startPlaying(page, settings = {}, hash = '') {
  await openGame(page, settings, GAME, hash);
  await show(page, ...PALM);
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
}

/** What the rules say right now, and how the can is. */
export const state = (page) => page.evaluate(() => {
  const { garden, game, turn } = window.__game;
  return {
    level: garden.level,
    done: garden.done,
    plants: garden.plants.map(({ id, look, kind, x, y, water, need, bloomed, hanging, thirst }) => ({ id, look, kind, x, y, water, need, bloomed, hanging, thirst })),
    drying: garden.drying,
    lost: garden.lost,
    wilted: garden.wilted?.id ?? null,
    flowers: garden.stats.flowers,
    pours: garden.stats.pours,
    prizes: { ...garden.stats.prizes },
    snails: garden.snails.map(({ off, splash }) => ({ off, splash })),
    sprinkler: garden.sprinkler && { taken: garden.sprinkler.taken, left: garden.sprinkler.left },
    cloud: garden.cloud && { state: garden.cloud.state },
    hedgehog: garden.hedgehog && { drank: garden.hedgehog.drank, bowl: garden.hedgehog.bowl },
    bunny: garden.bunny && { up: garden.bunny.up, gifts: garden.bunny.gifts },
    tip: game.tip,
    flow: game.flow,
    degrees: game.degrees ?? 0,
    holding: Boolean(game.holding),
    start: { ...turn.start },
    splash: garden.splash,
  };
});

/**
 * Keeps the real hand's photo moving, in the page, so the can's water would land where target says, in the garden:
 * 'next', the thirsty plant nearest it, or a function of the garden and the game, as a string. Once it's there, the
 * hand turns over, showing its back, and pours; elsewhere it shows its palm. turned: 'back' turns it right over, or
 * a share of its width, as 0.6, turns it part of the way, the palm squeezed narrower. by 'can' brings the can itself
 * there, palm on, to touch something, rather than its water. Runs until stopHand.
 */
export const waterHand = (page, { target = 'next', turned = 'back', gain = 0.12, near = 0.05, by = 'rose' } = {}) => page.evaluate(({ aim, turn, rate, close, bring }) => {
  window.__lead?.stop();
  let x = window.__lead?.x ?? 0;
  let y = window.__lead?.y ?? 0;
  const pick = aim === 'next' ? null : new Function('garden', 'game', `return (${aim})(garden, game);`);
  const timer = setInterval(() => {
    const { game, garden, view, gloves } = window.__game;
    const glove = gloves.right;
    let wanted = null;
    if (pick) wanted = pick(garden, game);
    else {
      const plant = garden.nextPlant(glove.visible ? glove.x / innerWidth : 0.5);
      if (plant) wanted = garden.aimFor(plant);
    }
    let pouring = false;
    if (glove.visible && wanted) {
      const to = view.at(wanted.x, wanted.y);
      const from = bring === 'can' ? { x: glove.x, y: glove.y } : view.waterAt(glove.x, glove.y, game.spoutSide);
      x += ((to.x - from.x) / innerWidth) * 1280 * rate;
      y += ((to.y - from.y) / innerHeight) * 720 * rate;
      // Once turned over, it stays turned while it's anywhere near, as a child holds it and moves it a little, rather
      // than turning back and forth.
      pouring = bring !== 'can' && Math.hypot(to.x - from.x, to.y - from.y) < close * innerHeight * (window.__lead?.pouring ? 4 : 1);
    } else if (!glove.visible) {
      // Lost, as a hand right at the edge of the picture can be: back towards the middle, as anyone would.
      x *= 0.95;
      y *= 0.95;
    }
    x = Math.max(-780, Math.min(220, x));
    y = Math.max(-300, Math.min(260, y));
    const photo = pouring ? (turn === 'back' ? 'back' : 'palm') : 'palm';
    const squeeze = pouring && turn !== 'back' ? turn : 1;
    window.__camera.show({ left: null, right: photo, scale: 0.62, squeeze, rightOffsetX: x, rightOffsetY: y });
    window.__lead.x = x;
    window.__lead.y = y;
    window.__lead.pouring = pouring;
  }, 33);
  window.__lead = { x, y, pouring: false, stop: () => clearInterval(timer) };
}, { aim: target, turn: turned, rate: gain, close: near, bring: by });

export const stopHand = (page) => page.evaluate(() => window.__lead?.stop());

export const expectSoon = (read, options = {}) => expect.poll(read, { timeout: 45_000, intervals: [100], ...options });

/** Reads how bright each part of the picture is, frame by frame, as the child sees it. */
export const watchBrightness = (page, frames) => page.evaluate(async (count) => {
  const [wide, high] = [32, 18];
  const small = document.createElement('canvas');
  small.width = wide;
  small.height = high;
  const context = small.getContext('2d', { willReadFrequently: true });
  const canvas = document.getElementById('game');
  const reading = [];
  for (let i = 0; i < count; i += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    context.drawImage(canvas, 0, 0, wide, high);
    const { data } = context.getImageData(0, 0, wide, high);
    const cells = new Array(wide * high);
    for (let j = 0; j < cells.length; j += 1) cells[j] = (data[j * 4] + data[j * 4 + 1] + data[j * 4 + 2]) / 3;
    reading.push({ at: performance.now(), cells });
  }
  return reading;
}, frames);

/** The biggest change of the whole picture between frames, and how much of it is flickering. */
export function judge(reading) {
  const averages = reading.map(({ cells }) => cells.reduce((sum, value) => sum + value, 0) / cells.length);
  const biggestStep = Math.max(...averages.slice(1).map((value, index) => Math.abs(value - averages[index])));
  const seconds = (reading.at(-1).at - reading[0].at) / 1000;
  // A flash is a big rise and a big fall in one part of the picture. More than 3 a second, over a big part of the
  // picture, is what can set off a seizure.
  const SWING = 40; // Out of 255.
  const cellCount = reading[0].cells.length;
  let flickering = 0;
  for (let cell = 0; cell < cellCount; cell += 1) {
    let low = reading[0].cells[cell];
    let high = low;
    let going = 0;
    let swings = 0;
    for (const { cells } of reading) {
      const value = cells[cell];
      low = Math.min(low, value);
      high = Math.max(high, value);
      if (going >= 0 && high - value >= SWING) {
        swings += 1;
        going = -1;
        low = value;
        high = value;
      } else if (going <= 0 && value - low >= SWING) {
        swings += 1;
        going = 1;
        low = value;
        high = value;
      }
    }
    if (swings / 2 / seconds > 3) flickering += 1;
  }
  const brightness = averages.reduce((sum, value) => sum + value, 0) / averages.length;
  return { biggestStep, flickeringShare: flickering / cellCount, brightness, seconds, frames: reading.length };
}

export { test, expect, show, waitForScreen };

/* ---------- with friends: kept small, so they're quick to change if the way of joining does ---------- */

/** Another player, in a browser of their own, with the same checks for errors. */
export async function secondPlayer(browser) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`uncaught: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`logged: ${message.text()}`);
  });
  return { context, page, errors };
}

async function giveName(page, name) {
  if (!name) return;
  await page.locator('#friends-name').fill(name);
  await page.locator('#friends-name').dispatchEvent('change');
}

/** A grown-up makes a game, and gets its code. */
export async function makeGame(page, name = 'Ana') {
  await page.locator('#friends-toggle').click();
  await page.locator('#friends-make').click();
  await expect(page.locator('#friends-code-shown')).toHaveText(/^[A-HJ-NP-Z2-9]{3}$/);
  await giveName(page, name);
  return page.locator('#friends-code-shown').textContent();
}

/** A friend opens the game with their own settings, and joins with the code, which joins as soon as it's typed. */
export async function joinGame(page, code, settings = {}, name = '') {
  await openGame(page, settings, GAME);
  await page.locator('#friends-toggle').click();
  await page.locator('#friends-code').fill(code);
  await expect(page.locator('#friends-code-shown')).toHaveText(code);
  await giveName(page, name);
}

/** Everyone gets through the hand check, palm to the camera, waits for each other, and then they all play. */
export async function allPlaying(...pages) {
  for (const each of pages) {
    await show(each, ...PALM);
    await each.locator('#start').click();
  }
  for (const each of pages) await waitForScreen(each, 'playing');
}
