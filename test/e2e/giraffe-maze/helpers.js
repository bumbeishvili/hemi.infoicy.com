// Getting into Giraffe's Maze, with real photos of hands going through the real tracker, and leading the
// character the way a child would, by moving the photo of the hand that the fake camera shows.
import { expect, openGame, show, test, waitForScreen } from '../helpers.js';

export const GAME = 'giraffe-maze';
export const OPEN = [null, 'open', { scale: 0.62 }];
export const FIST = [null, 'fist', { scale: 0.62 }];
export const NO_HAND = [null, null, { scale: 0.62 }];
// Reach help a lot, so the photo of the hand never has to go so near the edge of the picture that it's cut off.
export const EASY_REACH = { mazeReach: 'lots' };
// The gentle maze, which is the game as it always was: no sun, and nobody can lose.
export const GENTLE = { mazeSun: 'gentle' };

/** Gets through the hand check with an open hand, as anyone would, and on into play. */
export async function startPlaying(page, settings = {}, hash = '') {
  await openGame(page, { ...EASY_REACH, ...settings }, GAME, hash);
  await show(page, ...(settings.hands === 'left' ? ['open', null, { scale: 0.62 }] : OPEN));
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
}

/** What the rules say right now. */
export const state = (page) => page.evaluate(() => {
  const { run } = window.__game;
  const at = run.position;
  return {
    phase: run.phase,
    timed: run.timed,
    sunset: run.lost,
    sun: run.sun ? { ...run.sun } : null,
    index: run.index,
    mazes: run.mazes,
    at: { x: at.x, y: at.y },
    cell: run.walker.a,
    moving: run.moving,
    walked: run.stats.walked,
    fruit: run.stats.fruit,
    found: run.stats.found,
    prizes: { ...run.stats.prizes },
    hasKey: run.hasKey,
    power: run.power ? { ...run.power } : null,
    lost: run.layout.lost.map(({ who, cell, found, x, y }) => ({ who, cell, found, x, y })),
    blockers: run.layout.blockers.map(({ kind, open, progress, x, y }) => ({ kind, open, progress, x, y })),
    items: run.layout.items.map(({ kind, gone, opened, x, y, cell }) => ({ kind, gone: Boolean(gone), opened: Boolean(opened), x, y, cell })),
    butterflies: run.butterflies.length,
    stuck: run.stuck,
    size: run.size,
    level: run.level,
    seed: run.seed,
    cols: run.layout.cols,
    rows: run.layout.rows,
  };
});

/**
 * Keeps the real hand's picture moving, in the page, so the glove goes where target says, in the maze's cells:
 * 'way' leads the character along the way to whatever it needs next, a { x, y } stays there, and a function of the
 * game, as a string, says each time. photo is open, fist or none. Runs until stopHand.
 */
export const leadHand = (page, { target = 'way', photo = 'open', side = 'right', gain = 0.12, ahead = 1.3 } = {}) => page.evaluate(({ target: aim, photo: picture, side: hand, gain: rate, ahead: lead }) => {
  window.__lead?.stop();
  let x = window.__lead?.x ?? 0;
  let y = window.__lead?.y ?? 0;
  const pick = typeof aim === 'string' && aim !== 'way' ? new Function('game', `return (${aim})(game);`) : null;
  const timer = setInterval(() => {
    const { game, gloves, view, run } = window.__game;
    const glove = gloves[hand];
    let wanted = null;
    if (aim === 'way') wanted = run.phase === 'walking' ? run.wayAhead(run.nextCell(), lead) : null;
    else if (pick) wanted = pick(game);
    else wanted = aim;
    if (glove.visible && wanted) {
      const at = view.at(wanted.x, wanted.y);
      const screen = { x: glove.x + game.gloveOffset.x, y: glove.y + game.gloveOffset.y };
      x += ((at.x - screen.x) / innerWidth) * 1280 * rate;
      y += ((at.y - screen.y) / innerHeight) * 720 * rate;
    } else if (!glove.visible && picture !== 'none') {
      // Lost, as a hand right at the edge of the picture can be: back towards the middle, as anyone would.
      x *= 0.95;
      y *= 0.95;
    }
    // Each hand's photo starts on its own side of the picture, and can go right across it, but stays in it.
    x = hand === 'left' ? Math.max(-220, Math.min(780, x)) : Math.max(-780, Math.min(220, x));
    y = Math.max(-260, Math.min(240, y));
    const shown = picture === 'none' ? null : picture;
    window.__camera.show({ left: hand === 'left' ? shown : null, right: hand === 'right' ? shown : null, scale: 0.62, [`${hand}OffsetX`]: x, [`${hand}OffsetY`]: y });
    window.__lead.x = x;
    window.__lead.y = y;
  }, 33);
  window.__lead = { x, y, stop: () => clearInterval(timer) };
}, { target, photo, side, gain, ahead });

export const stopHand = (page) => page.evaluate(() => window.__lead?.stop());

/** Where the glove is in the maze, in cells, or null when it can't be seen. */
export const gloveAt = (page) => page.evaluate(() => window.__game.game.gloveInMaze());

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

export const CODE = /^[A-HJ-NP-Z2-9]{3}$/;

/** A name, if they'd like one, typed once they're in a game. */
async function giveName(page, name) {
  if (!name) return;
  await page.locator('#friends-name').fill(name);
  await page.locator('#friends-name').dispatchEvent('change');
}

/** A grown-up makes a game, and gets its code. */
export async function makeGame(page, name = 'Ana') {
  await page.locator('#friends-toggle').click();
  await page.locator('#friends-make').click();
  await expect(page.locator('#friends-code-shown')).toHaveText(CODE);
  await giveName(page, name);
  return page.locator('#friends-code-shown').textContent();
}

/** A friend opens the game with their own settings, and joins with the code, which joins as soon as it's typed. */
export async function joinGame(page, code, settings = {}, name = '') {
  await openGame(page, { ...EASY_REACH, ...settings }, GAME);
  await page.locator('#friends-toggle').click();
  await page.locator('#friends-code').fill(code);
  await expect(page.locator('#friends-code-shown')).toHaveText(code);
  await giveName(page, name);
}

/** Everyone gets through the hand check and waits for each other, and then they all play. */
export async function allPlaying(...pages) {
  for (const each of pages) {
    await show(each, ...OPEN);
    await each.locator('#start').click();
  }
  for (const each of pages) await waitForScreen(each, 'playing');
}
