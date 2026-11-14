// Playing Arrow Meadow in the tests, with real photos of two hands going through the real tracker. The hand in play
// is the string hand, the right one unless a test says otherwise: a fist holds the string and an open hand lets it
// go. The other is the bow hand, and how much higher it is than the string hand tilts the bow. A child is played by
// moving the two photos the fake camera shows, until the dotted line is on what the meadow wants hit, and then
// opening the string hand.
import { expect, openGame, show, test, waitForScreen } from '../helpers.js';

export { judge, watchBrightness } from '../giraffe-garden/helpers.js';

export const GAME = 'arrow-meadow';
// Big enough for the tracker to find a hand again after it has jumped from one place to another, as the tests' hands
// do and real ones don't, and small enough for one hand to be well above the other without leaving the picture.
export const SCALE = 0.62;
// How long a palm is in the fake camera's picture at that scale, in its own pixels, as the tracker measures it.
export const PALM = 106;
// How far the bow tilts for each palm length the bow hand is above the string hand, in degrees: see TILT in bow.js.
export const TILT = 24;
// One hand that opens and closes where it is, rather than a different photo somewhere else each time. The bow
// hand's photo is the smaller, so it's the one in front where the two photos' edges meet.
const sceneFor = (side) => ({ scale: SCALE, sameHand: true, leftOnTop: side === 'right' });

/**
 * Where the two hands are, and what they look like. apart is how far apart they are across the picture, in palm
 * lengths, and lift how much higher the bow hand is than the string hand. string and bow are the photos, or null
 * for a hand that's out of the picture. side is the hand in play, which is the string hand.
 */
export const hands = (page, { apart = 4, lift = 0, string = 'fist', bow = 'open', side = 'right', dx = 0, dy = 0 } = {}) => {
  // The fake camera's two places for hands are 620 of its pixels apart.
  const inwards = (620 - apart * PALM) / 2;
  const sign = side === 'right' ? 1 : -1;
  const other = side === 'right' ? 'left' : 'right';
  const scene = {
    ...sceneFor(side),
    [`${side}OffsetX`]: -sign * inwards + dx * PALM,
    [`${other}OffsetX`]: sign * inwards + dx * PALM,
    [`${side}OffsetY`]: (lift / 2 + dy) * PALM,
    [`${other}OffsetY`]: (-lift / 2 + dy) * PALM,
  };
  return side === 'right' ? show(page, bow, string, scene) : show(page, string, bow, scene);
};

/**
 * The contest as it always was, which these tests were written for: as many arrows as it takes and targets that wait,
 * the gentle choice under "Arrows in the quiver", with a little help with aiming, which was the default then. The
 * quiver, as the game comes, is in quiver.spec.js.
 */
export const AS_IT_WAS = { arrowQuiver: 'gentle', arrowHelp: 'little' };

/** Gets through the hand check, with the hand in play open, and on into play, with both hands up and nothing held. */
export async function startPlaying(page, settings = {}, { side = 'right', hash = '' } = {}) {
  await openGame(page, { ...AS_IT_WAS, ...settings }, GAME, hash);
  await hands(page, { string: 'open', side });
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
}

/** What the rules say right now, and what the hands are asking for. */
export const state = (page) => page.evaluate(() => {
  const { meadow, game } = window.__game;
  const { hands: bow, aim } = game;
  return {
    level: meadow.level,
    mode: meadow.mode,
    phase: meadow.phase,
    done: meadow.done,
    goal: meadow.goal,
    total: meadow.total,
    help: meadow.help,
    wind: meadow.wind,
    stats: { ...meadow.stats },
    targets: meadow.targets.map((target) => ({ id: target.id, k: target.k, kind: target.kind, slot: target.slot, state: target.state, r: target.r, ...meadow.whereAt(target) })),
    arrows: meadow.arrows.map(({ state: how, x, y, ghost }) => ({ state: how, x, y, ghost })),
    bird: meadow.bird ? { x: meadow.bird.x, given: meadow.bird.given } : null,
    bow: { nocked: bow.nocked, both: bow.both, bowSeen: bow.bowSeen, stringSeen: bow.stringSeen, angle: (bow.angle * 180) / Math.PI, draw: bow.draw, apart: bow.apart },
    aim: aim ? { angle: (aim.angle * 180) / Math.PI, target: aim.target?.kind ?? null, end: aim.end.what } : null,
    ready: game.ready,
    shots: game.shots,
    happened: { ...game.happened },
    labels: [...window.__game.view.introduced],
    film: document.body.dataset.film,
    flip: window.__game.view.flip,
  };
});

/**
 * Plays the archer, in the page, until stopArcher: the bow hand goes up or down until the dotted line is on what
 * the meadow wants hit, and the string hand, a fist on the string, opens to let go, and closes again for the next
 * arrow. target can be a function of the meadow and the game instead, as a string, that says what to hit, as
 * { angle, draw }. every is the least seconds between arrows. wobble, from 0 to 1, makes them real hands: never
 * still, shaking from frame to frame, and lost by the tracker for a frame now and then. shoot: false only aims.
 * side is the hand in play.
 */
export const archer = (page, { target = null, every = 1.2, wobble = 0, shoot = true, side = 'right', within = 2 } = {}) => page.evaluate(({ aim, least, shake, lets, hand, near, scene, tilt }) => {
  window.__archer?.stop();
  const pick = aim ? new Function('meadow', 'game', `return (${aim})(meadow, game);`) : null;
  const sign = hand === 'right' ? 1 : -1;
  const other = hand === 'right' ? 'left' : 'right';
  let lift = window.__archer?.lift ?? 0; // How much higher the bow hand is than the string hand, in the camera's pixels.
  let apart = window.__archer?.apart ?? 420; // And how far apart they are across.
  let frame = 0;
  let phase = 'hold';
  let since = 0;
  let steady = 0;
  let wanted = null;
  const timer = setInterval(() => {
    frame += 1;
    since += 33;
    const { meadow, game } = window.__game;
    const palm = (game.bow.palm || 0.147) * 720;
    // What to hit is looked at afresh a few times a second, as a child looks.
    if (frame % 5 === 1) wanted = pick ? pick(meadow, game) : meadow.wants();
    if (wanted) {
      const full = game.bow.full;
      // As far apart as the draw asks, and a little more for a bow drawn right back.
      const palms = 1.6 + wanted.draw * (full - 1.6) + (wanted.draw >= 1 ? 0.5 : 0);
      apart += (palms * palm - apart) * 0.2;
      // What the game makes of the bow just now says how much further up or down the bow hand has to go.
      const aimed = game.hands.nocked ? game.hands.angle : (lift / palm) * tilt;
      lift += ((wanted.angle - aimed) / tilt) * palm * 0.3;
      lift = Math.max(-0.6 * palm, Math.min(3.4 * palm, lift));
      const shown = game.aim?.angle ?? game.hands.angle;
      const onIt = game.ready && Math.abs(shown - wanted.angle) < (near * Math.PI) / 180 && game.hands.draw >= Math.min(0.97, wanted.draw) - 0.06;
      steady = onIt ? steady + 1 : 0;
    } else {
      steady = 0;
    }
    if (phase === 'hold' && lets && steady >= 4 && since > least * 1000) [phase, since] = ['open', 0];
    else if (phase === 'open' && since > 520) [phase, since, steady] = ['hold', 0, 0];
    const lost = shake > 0 && frame % 40 === 0;
    const jitter = () => shake * 5 * Math.sin(frame * (1.3 + Math.random()));
    const inwards = (620 - apart) / 2;
    const string = lost ? null : phase === 'open' ? 'open' : 'fist';
    const bow = lost ? null : 'open';
    window.__camera.show({
      ...scene,
      [hand]: string,
      [other]: bow,
      [`${hand}OffsetX`]: -sign * inwards + jitter(),
      [`${other}OffsetX`]: sign * inwards + jitter(),
      [`${hand}OffsetY`]: lift / 2 + jitter(),
      [`${other}OffsetY`]: -lift / 2 + jitter(),
    });
    window.__archer.lift = lift;
    window.__archer.apart = apart;
    window.__archer.phase = phase;
  }, 33);
  window.__archer = { lift, apart, phase, stop: () => clearInterval(timer) };
}, { aim: target, least: every, shake: wobble, lets: shoot, hand: side, near: within, scene: sceneFor(side), tilt: (TILT * Math.PI) / 180 });

export const stopArcher = (page) => page.evaluate(() => window.__archer?.stop());

export const expectSoon = (read, options = {}) => expect.poll(read, { timeout: 45_000, intervals: [100], ...options });

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

/** Everyone gets through the hand check, waits for each other, and then they all play. */
export async function allPlaying(...pages) {
  for (const each of pages) {
    await hands(each, { string: 'open' });
    await each.locator('#start').click();
  }
  for (const each of pages) await waitForScreen(each, 'playing');
}
