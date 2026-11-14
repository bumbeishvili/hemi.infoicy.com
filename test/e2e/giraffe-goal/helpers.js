// Playing Giraffe's Goal in the tests, with real photos of hands going through the real tracker: the palm held up to
// save, the same palm made shorter, as a hand looks tipped towards the camera with its wrist dropped, and turned, for
// fingers that hang down. A child is played by moving the photo of the hand that the fake camera shows, until the
// glove is where the match wants it.
import { expect, openGame, show, test, waitForScreen } from '../helpers.js';

export { judge, watchBrightness } from '../giraffe-garden/helpers.js';

export const GAME = 'giraffe-goal';
// The gentle match, which is the game as it always was: the kicker waits for a hand that's ready, and nothing is lost.
export const GENTLE = { goalStakes: 'gentle' };
export const PALM = [null, 'palm', { scale: 0.62 }];
export const FIST = [null, 'fist', { scale: 0.62 }];
export const NO_HAND = [null, null, { scale: 0.62 }];
// The palm at half its height, which is how a hand looks tipped 60° towards the camera: an open hand, wrist dropped.
export const DROPPED = [null, 'palm', { scale: 0.62, shorten: 0.5 }];
// The palm upside down: an open hand hanging down from the wrist.
export const HANGING = [null, 'palm', { scale: 0.62, rotate: 180 }];

/** Gets through the hand check with the palm held up to the camera, and on into play. */
export async function startPlaying(page, settings = {}, hash = '') {
  await openGame(page, settings, GAME, hash);
  await show(page, ...PALM);
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
}

/** What the rules say right now, and how the hand is read. */
export const state = (page) => page.evaluate(() => {
  const { goal, game, upright, view } = window.__game;
  return {
    level: goal.level,
    phase: goal.phase,
    real: goal.real,
    toLose: goal.toLose,
    done: goal.done,
    target: goal.target,
    sign: goal.sign,
    stats: { ...goal.stats },
    shots: goal.shots.map(({ kind, state: how, t, to, covered, pushed, hopped, bounces }) => ({ kind, state: how, t, to: { ...to }, covered, pushed, hopped, bounces })),
    live: goal.live.length,
    stars: goal.stars.length,
    bubbles: goal.bubbles.length,
    cup: goal.cup && { state: goal.cup.state, y: goal.cup.y, byHand: goal.cup.byHand },
    kickers: goal.kickers.map(({ who, state: how }) => ({ who, state: how })),
    ready: game.ready,
    heldUp: game.heldUp,
    big: game.big,
    palm: game.palm,
    palmSize: view.palmSize,
    tip: upright.tip,
    up: upright.up,
    why: upright.why,
    flat: upright.flat,
    checked: upright.checked,
    film: document.body.dataset.film,
  };
});

/**
 * Keeps the real hand's photo moving, in the page, so the glove goes where the match wants it: to the ball that
 * arrives first, then a bubble, a star or the cup. target can be a function of the match and the game instead, as a
 * string, that says where. photo, shorten and rotate are how the hand is shown. wobble, from 0 to 1, makes it a real
 * hand's: never still, tipping to and fro by up to 39°, turning 12° either way and shaking, from frame to frame, and
 * lost by the tracker for a frame now and then. side is the hand in play. Runs until stopHand.
 */
export const keeperHand = (page, { photo = 'palm', shorten = 1, rotate = 0, wobble = 0, gain = 0.16, target = null, side = 'right' } = {}) => page.evaluate(({ name, short, turn, shake, rate, aim, hand }) => {
  window.__lead?.stop();
  let x = window.__lead?.x ?? 0;
  let y = window.__lead?.y ?? 0;
  let frame = 0;
  const pick = aim ? new Function('goal', 'game', `return (${aim})(goal, game);`) : null;
  // How far the photo can go from its own place in the camera's picture and still be all in it.
  const [low, high] = hand === 'right' ? [-780, 220] : [-220, 780];
  const timer = setInterval(() => {
    const { goal, game, gloves } = window.__game;
    const glove = gloves[hand];
    const wanted = pick ? pick(goal, game) : goal.wants();
    if (glove.visible && wanted) {
      x += (wanted.x - glove.x / innerWidth) * 1280 * rate;
      y += (wanted.y - glove.y / innerHeight) * 720 * rate;
    } else if (!glove.visible) {
      // Lost, as a hand right at the edge of the picture can be: back towards the middle, as anyone would.
      x *= 0.95;
      y *= 0.95;
    }
    x = Math.max(low, Math.min(high, x));
    y = Math.max(-300, Math.min(260, y));
    frame += 1;
    // Wobbling, the picture has no hand in it for one frame in every forty.
    const lost = shake > 0 && frame % 40 === 0;
    window.__camera.show({
      left: hand === 'left' && !lost ? name : null,
      right: hand === 'right' && !lost ? name : null,
      scale: 0.62,
      shorten: short * (1 - shake * 0.22 * (0.5 + 0.5 * Math.sin(frame * 0.9))),
      rotate: turn + shake * 12 * Math.sin(frame * 0.37),
      [`${hand}OffsetX`]: x + shake * 9 * Math.sin(frame * 1.7),
      [`${hand}OffsetY`]: y + shake * 9 * Math.cos(frame * 1.3),
    });
    window.__lead.x = x;
    window.__lead.y = y;
  }, 33);
  window.__lead = { x, y, stop: () => clearInterval(timer) };
}, { name: photo, short: shorten, turn: rotate, shake: wobble, rate: gain, aim: target, hand: side });

export const stopHand = (page) => page.evaluate(() => window.__lead?.stop());

export const expectSoon = (read, options = {}) => expect.poll(read, { timeout: 45_000, intervals: [100], ...options });

export { test, expect, show, waitForScreen };
