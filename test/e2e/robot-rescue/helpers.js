// Getting into Robot Rescue, with real photos going through the real tracker.
import { expect, openGame, show, waitForScreen } from '../helpers.js';

export const GAME = 'robot-rescue';
export const OPEN = [null, 'open', { scale: 0.7 }];
export const FIST = [null, 'fist', { scale: 0.7 }];
export const NO_HAND = [null, null, { scale: 0.7 }];

/**
 * Gets through the hand check with an open hand, as anyone would, and then does what scene says. The
 * goo is Gentle unless a test says otherwise, the game as it always was, so that the tests of its kind
 * rules play it that way: the challenge, which is how it comes, has its own tests.
 */
export async function reachRescue(page, settings = {}, scene = null) {
  await openGame(page, { rescueGoo: 'gentle', ...settings }, GAME);
  await show(page, ...(settings.hands === 'left' ? ['open', null, { scale: 0.7 }] : OPEN));
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
  if (scene) await show(page, ...scene);
}

/** What the rules say right now. */
export const rescue = (page) => page.evaluate(() => {
  const { mission, stage } = window.__game;
  return {
    phase: mission.phase,
    place: mission.place?.id ?? null,
    index: mission.index,
    robots: mission.robots.length,
    left: mission.leftHere,
    goo: mission.goo.length,
    shield: mission.shield,
    shieldLevel: stage.shieldLevel,
    resting: mission.resting,
    hearts: mission.hearts,
    charge: mission.blaster.charge,
    firing: mission.blaster.firing,
    locked: stage.aim.locked?.kind ?? null,
    seen: stage.aim.seen,
    freed: mission.freed,
    stats: { ...mission.stats },
    aimX: stage.aim.x,
    aimY: stage.aim.y,
  };
});

/**
 * Keeps the real hand's picture on whatever's nearest, opening it to fire and closing it to reload,
 * as a child would. Runs in the page until it's stopped.
 */
export const startHunting = (page, side = 'right') => page.evaluate((handSide) => {
  const { stage } = window.__game;
  const slot = handSide === 'right' ? 'rightOffset' : 'leftOffset';
  const home = handSide === 'right' ? [-830, 210] : [-210, 830];
  let x = 0;
  let y = 0;
  let closing = false;
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const timer = setInterval(() => {
    const { mission } = window.__game;
    const glove = stage.gloves[handSide];
    let best = null;
    let bestGap = Infinity;
    for (const target of stage.targetsOnScreen ?? []) {
      const gap = Math.hypot(target.x - glove.x, target.y - glove.y);
      if (gap < bestGap) {
        best = target;
        bestGap = gap;
      }
    }
    if (glove.visible && best) {
      x = clamp(x + ((best.x - glove.x) / innerWidth) * 1280 * 0.1, home[0], home[1]);
      y = clamp(y + ((best.y - glove.y) / innerHeight) * 720 * 0.1, -190, 190);
    }
    if (mission.blaster.charge <= 0) closing = true;
    if (mission.blaster.charge >= 1) closing = false;
    const photo = closing ? 'fist' : 'open';
    window.__camera.show({ left: handSide === 'left' ? photo : null, right: handSide === 'right' ? photo : null, scale: 0.7, [`${slot}X`]: x, [`${slot}Y`]: y });
  }, 33);
  window.__stopHunting = () => clearInterval(timer);
}, side);

export const stopHunting = (page) => page.evaluate(() => window.__stopHunting?.());

/** Clears everything at this place, for a test that's about what comes after. A robot that comes apart
 * leaves two little ones, so it goes round until there's nobody left. */
export const clearHere = (page) => page.evaluate(() => {
  const { mission } = window.__game;
  mission.queue = [];
  for (let round = 0; round < 4 && mission.robots.length; round += 1) {
    for (const robot of [...mission.robots]) mission.drop(robot);
  }
});

/** Stays awake for as long as a test needs, whatever the hand is doing. */
export const stayAwake = (page) => page.evaluate(() => {
  window.__awake = setInterval(() => {
    window.__game.mission.restFor = 0;
  }, 25);
});

/** One goo on its way, and nothing else thrown until it gets here. */
export const throwOneGoo = (page) => page.evaluate(() => {
  const { mission } = window.__game;
  mission.holdThrows = 9999;
  const robot = mission.robots.find(({ kind }) => kind === 'walker') ?? mission.robots[0];
  mission.throwGoo(robot);
  return mission.goo.at(-1).seconds;
});

export const expectSoon = (read, options = {}) => expect.poll(read, { timeout: 30_000, intervals: [100], ...options });

/**
 * Reads how bright each part of the picture is, frame by frame, with the crosshair and shield drawn
 * over the town, as the child sees it. Runs for a while, doing what's asked meanwhile.
 */
export const watchBrightness = (page, frames) => page.evaluate(async (count) => {
  const { stage } = window.__game;
  const [wide, high] = [32, 18];
  const small = document.createElement('canvas');
  small.width = wide;
  small.height = high;
  const context = small.getContext('2d', { willReadFrequently: true });
  const reading = [];
  for (let i = 0; i < count; i += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    stage.render();
    context.drawImage(stage.canvas, 0, 0, wide, high);
    context.drawImage(stage.sights.canvas, 0, 0, wide, high);
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
  // A flash is a big rise and a big fall in one part of the picture. Too many of them, over a big part
  // of the picture, is what can set off a seizure: more than 3 a second, over more than a quarter.
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
  return { biggestStep, flickeringShare: flickering / cellCount, seconds, frames: reading.length };
}
