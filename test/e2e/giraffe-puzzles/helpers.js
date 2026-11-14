// Playing Giraffe's Puzzles in the tests, with real photos of a hand going through the real tracker: open to pick a
// piece up and carry it, and a fist for a hand that closes. A child is played by moving the photo of the hand that
// the fake camera shows, until the glove is where a child would take it: to a loose piece, and then to its place.
import { expect, openGame, show, test, waitForScreen } from '../helpers.js';

export { judge, watchBrightness } from '../giraffe-garden/helpers.js';

export const GAME = 'giraffe-puzzles';
// The same hand in the same place, open or closed, as one hand looks that opens and closes where it is.
export const OPEN = [null, 'open', { scale: 0.62, sameHand: true }];
export const FIST = [null, 'fist', { scale: 0.62, sameHand: true }];
export const NO_HAND = [null, null, { scale: 0.62 }];
// The gentle puzzle, which is the game as it always was: no clock, and nobody can lose.
export const GENTLE = { puzzleClock: 'gentle' };

/** Gets through the hand check with an open hand, and on into play. */
export async function startPlaying(page, settings = {}, hash = '') {
  await openGame(page, settings, GAME, hash);
  await show(page, ...OPEN);
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
}

/** What the rules say right now, and where the glove is on the table. */
export const state = (page) => page.evaluate(() => {
  const { puzzle, game } = window.__game;
  const { round } = puzzle;
  const side = window.__game.session.settings.hands;
  return {
    level: puzzle.level,
    phase: puzzle.phase,
    timed: puzzle.timed,
    lost: puzzle.lost,
    clock: puzzle.clock ? { ...puzzle.clock } : null,
    index: puzzle.index,
    rounds: puzzle.rounds.length,
    done: puzzle.done,
    total: puzzle.total,
    held: puzzle.held?.id ?? null,
    pictures: round.pictures.map(({ name }) => name),
    pieces: round.pieces.map(({ id, frame, col, row, x, y, home, angle, state: how, holder, golden, leaf, floating, hint, sides }) => ({ id, frame, col, row, x, y, home, angle, state: how, holder, golden, leaf: leaf ? leaf.brushed : null, floating: Boolean(floating), hint, sides })),
    placed: puzzle.stats.placed,
    stats: JSON.parse(JSON.stringify(puzzle.stats)),
    peek: round.peek && { x: round.peek.x, y: round.peek.y, hold: round.peek.hold, showing: round.peek.showing },
    magnet: round.magnet && { x: round.magnet.x, y: round.magnet.y, state: round.magnet.state, left: round.magnet.left },
    alive: round.alive,
    glove: game.gloveOnTable(side),
    open: window.__game.monitor.snapshot.handOpen,
    mode: game.mode,
  };
});

/**
 * Keeps the real hand's photo moving, in the page, so the glove goes where target says, on the table: 'wants',
 * wherever the puzzle says a child would take it, or a function of the puzzle and where the glove is, as a string,
 * which gives { x, y } and, if it likes, hand: 'fist' or null for no hand. wobble shakes the hand as it goes, in
 * camera pixels, and blink shows a fist for a moment every so many seconds, as a tracker can read an open hand.
 * side is the hand in play. Runs until stopHand.
 */
export const leadHand = (page, { target = 'wants', gain = 0.1, wobble = 0, blink = 0, side = 'right' } = {}) => page.evaluate(({ aim, rate, shake, every, hand }) => {
  window.__lead?.stop();
  let x = window.__lead?.x ?? 0;
  let y = window.__lead?.y ?? 0;
  const pick = aim === 'wants' ? null : new Function('puzzle', 'at', 'game', `return (${aim})(puzzle, at, game);`);
  const started = performance.now();
  const timer = setInterval(() => {
    const { game, puzzle, view, gloves } = window.__game;
    const glove = gloves[hand];
    const at = game.gloveOnTable(hand);
    const wanted = at ? (pick ? pick(puzzle, at, game) : puzzle.wants(at)) : null;
    if (glove.visible && at && wanted) {
      const to = view.at(wanted.x, wanted.y);
      const from = view.at(at.x, at.y);
      x += ((to.x - from.x) / innerWidth) * 1280 * rate;
      y += ((to.y - from.y) / innerHeight) * 720 * rate;
    } else if (!glove.visible) {
      // Lost, as a hand right at the edge of the picture can be: back towards the middle, as anyone would.
      x *= 0.95;
      y *= 0.95;
    }
    const [low, high] = hand === 'right' ? [-780, 240] : [-240, 780];
    x = Math.max(low, Math.min(high, x));
    y = Math.max(-300, Math.min(260, y));
    const t = (performance.now() - started) / 1000;
    const blinking = every > 0 && t % every < 0.12;
    const photo = wanted && 'hand' in wanted ? wanted.hand : blinking ? 'fist' : 'open';
    const [dx, dy] = [Math.sin(t * 19) * shake, Math.cos(t * 13) * shake];
    const scene = { left: null, right: null, scale: 0.62, sameHand: true };
    scene[hand] = photo;
    scene[`${hand}OffsetX`] = x + dx;
    scene[`${hand}OffsetY`] = y + dy;
    window.__camera.show(scene);
    window.__lead.x = x;
    window.__lead.y = y;
  }, 33);
  window.__lead = { x, y, stop: () => clearInterval(timer) };
}, { aim: target, rate: gain, shake: wobble, every: blink, hand: side });

export const stopHand = (page) => page.evaluate(() => window.__lead?.stop());

/** Shows a photo of the hand where the pretend child last had it. */
export const handNow = (page, photo, side = 'right') => page.evaluate(([which, hand]) => {
  window.__lead?.stop();
  const scene = { left: null, right: null, scale: 0.62, sameHand: true };
  scene[hand] = which;
  scene[`${hand}OffsetX`] = window.__lead?.x ?? 0;
  scene[`${hand}OffsetY`] = window.__lead?.y ?? 0;
  window.__camera.show(scene);
}, [photo, side]);

export const expectSoon = (read, options = {}) => expect.poll(read, { timeout: 45_000, intervals: [100], ...options });

/** Whether a new thing's label has been shown in this game. */
export const labelShown = (page, key) => page.evaluate((wanted) => window.__game.view.introduced.has(wanted), key);

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

/** Everyone gets through the hand check, with an open hand, waits for each other, and then they all play. */
export async function allPlaying(...pages) {
  for (const each of pages) {
    await show(each, ...OPEN);
    await each.locator('#start').click();
  }
  for (const each of pages) await waitForScreen(each, 'playing');
}
