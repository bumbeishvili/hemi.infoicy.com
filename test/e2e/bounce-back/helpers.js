// Getting into Bounce Back, with real photos of hands going through the real tracker.
import { expect, openGame, show, waitForScreen } from '../helpers.js';

export const GAME = 'bounce-back';
export const OPEN = [null, 'open', { scale: 0.7 }];
export const FIST = [null, 'fist', { scale: 0.7 }];
export const NO_HAND = [null, null, { scale: 0.7 }];

/**
 * Gets through the hand check with an open hand, as anyone would, and on into play. Unless a test says, it's
 * the game as it was, on Gentle, where the computer can never score.
 */
export async function startPlaying(page, settings = {}, hash = '') {
  await openGame(page, { bounceHard: 'gentle', ...settings }, GAME, hash);
  await show(page, ...(settings.hands === 'left' ? ['open', null, { scale: 0.7 }] : OPEN));
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
}

/** What the rules say right now, on the game of whoever runs the ball. */
export const rally = (page) => page.evaluate(() => {
  const { rally: game, court } = window.__game;
  const { ball } = game;
  return {
    phase: game.phase,
    point: game.point,
    server: game.server,
    scores: { ...game.scores },
    winner: game.winner,
    hits: { ...game.stats.hits },
    longest: game.stats.longest,
    prizes: { ...game.stats.prizes },
    ball: { u: ball.u, h: ball.h, state: ball.state, side: ball.side, by: ball.by, kind: ball.kind, stroke: ball.stroke },
    racket: { ...game.players.A.racket },
    computer: { ...game.players.B.racket },
    items: game.items.map(({ kind, u, h }) => ({ kind, u, h })),
    power: game.power ? { ...game.power } : null,
    castles: game.castles.map(({ u, standing }) => ({ u, standing })),
    flagsLit: game.flagsLit,
    flip: court.flip,
  };
});

/**
 * Keeps the real hand's picture moving, in the page, so the glove goes where target() says on the court,
 * as { u, h }, or stays where it is for null. photo() says which photo: open, fist or none. Runs until
 * stopHand.
 */
export const steerHand = (page, { target = 'ball', photo = 'open', side = 'right', gain = 0.14 } = {}) => page.evaluate(({ target: aim, photo: picture, side: hand, gain: rate }) => {
  window.__steer?.stop();
  let x = window.__steer?.x ?? 0;
  let y = window.__steer?.y ?? 0;
  const timer = setInterval(() => {
    const { game, gloves, court } = window.__game;
    const glove = gloves[hand];
    const mine = game.mine;
    const s = mine === 'A' ? -1 : 1;
    const ball = game.mode === 'guest' ? game.guestBall : game.rally?.ball;
    let wanted = null;
    if (aim === 'ball') {
      // After the ball when it's on this side or coming, and back to the middle of the half when it isn't.
      wanted = ball && Math.sign(ball.u) === s ? { u: ball.u, h: ball.h } : { u: s * 0.6, h: 0.45 };
    } else if (aim === 'dodge') {
      // Trying, with the hand open, but away from a ball coming over the net: a miss. A ball waiting, or the
      // child's own serve, it goes to and hits.
      const coming = ball && ball.state === 'flying' && ball.by && ball.by !== mine;
      wanted = coming ? { u: s * 1.2, h: ball.h > 0.55 ? 0.12 : 1.05 } : ball && Math.sign(ball.u) === s ? { u: ball.u, h: ball.h } : { u: s * 0.6, h: 0.45 };
    } else if (aim) {
      wanted = aim;
    }
    if (glove.visible && wanted) {
      const at = court.at(wanted.u, wanted.h);
      x += ((at.x - glove.x) / innerWidth) * 1280 * rate;
      y += ((at.y - glove.y) / innerHeight) * 720 * rate;
      x = Math.max(-900, Math.min(300, x));
      y = Math.max(-300, Math.min(320, y));
    }
    const shown = picture === 'none' ? null : picture;
    window.__camera.show({ left: hand === 'left' ? shown : null, right: hand === 'right' ? shown : null, scale: 0.7, [`${hand}OffsetX`]: x, [`${hand}OffsetY`]: y });
    window.__steer.x = x;
    window.__steer.y = y;
  }, 33);
  window.__steer = { x, y, stop: () => clearInterval(timer) };
}, { target, photo, side, gain });

export const stopHand = (page) => page.evaluate(() => window.__steer?.stop());

/** Where the glove is on the court, or null when it can't be seen. */
export const gloveAt = (page, side = 'right') => page.evaluate((hand) => {
  const { gloves, court } = window.__game;
  const glove = gloves[hand];
  return glove.visible ? court.fromScreen(glove.x, glove.y) : null;
}, side);

export const expectSoon = (read, options = {}) => expect.poll(read, { timeout: 30_000, intervals: [100], ...options });

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
  // A flash is a big rise and a big fall in one part of the picture. More than 3 a second, over a big part
  // of the picture, is what can set off a seizure.
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
