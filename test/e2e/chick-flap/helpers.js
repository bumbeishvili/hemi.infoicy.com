// Playing Flap, Little Chick! in the tests, with a real photo of a palm for each hand going through the real
// tracker: held up to the camera, like a high five, and made shorter, as a hand looks tipped forwards with its
// wrist dropped. Each hand has its own, so one can come up without the other (leftShorten and rightShorten in
// fake-camera.js). A child is played by changing how the two photos look, as the rules would have them: down
// while the chick runs, up for a flap in good time, kept up over water, and down again for the scarecrow.
import { expect, openGame as openAnyGame, show, test, waitForScreen } from '../helpers.js';

export { judge, watchBrightness } from '../giraffe-garden/helpers.js';

export const GAME = 'chick-flap';

/**
 * Opens a game. This one is opened with the fox who never catches the chick, unless a test says otherwise:
 * most of these tests are about the flight, and were written when that was the only fox there was. The fox who
 * can catch, which is how the game comes, has his own tests in fox.spec.js.
 */
export const openGame = (page, settings = {}, game = GAME, hash = '') => openAnyGame(page, game === GAME ? { flapFox: 'tumble', ...settings } : settings, game, hash);
// How a hand looks held up, and hanging forwards: the palm at half its height, as it looks tipped 60° to the camera.
export const UP = 1;
export const DOWN = 0.5;

/** Shows both hands, each as far up as it's given, from 1, held up, to 0.5, hanging forwards. null is no hand. */
export const hands = (page, left = UP, right = UP, extra = {}) => show(page, left === null ? null : 'palm', right === null ? null : 'palm', { scale: 0.62, leftShorten: left ?? 1, rightShorten: right ?? 1, ...extra });

/** Gets through the hand check with both hands held up to the camera, and on into play. */
export async function startPlaying(page, settings = {}, hash = '') {
  await openGame(page, settings, GAME, hash);
  await hands(page);
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
}

/** What the rules say right now, and how the hands are read. */
export const state = (page) => page.evaluate(() => {
  const { farm, wings, game, view } = window.__game;
  const { chick, fox, stats } = farm;
  const thing = (each) => each && { kind: each.kind, type: each.type, x0: each.x0, x1: each.x1, done: each.done, clean: each.clean, stopped: each.stopped, fails: each.fails, tries: each.tries, wings: each.wings, away: Boolean(each.away), waiting: Boolean(each.waiting), bonked: Boolean(each.bonked) };
  return {
    level: farm.level,
    done: farm.done,
    end: farm.end,
    together: farm.together,
    single: farm.single,
    gentle: farm.gentle,
    catches: farm.catches,
    lost: farm.lost,
    chick: { x: chick.x, h: chick.h, state: chick.state, air: chick.air, dizzy: chick.dizzy, waitFor: chick.waitFor, flockWait: chick.flockWait, waiting: thing(chick.waiting), behind: thing(chick.behind) },
    fox: { mode: fox.mode, gap: fox.gap, sitting: fox.sitting },
    hen: farm.hen && { why: farm.hen.why },
    next: thing(farm.next),
    things: farm.things.map(thing),
    progress: farm.progress,
    stats: { ...stats, flaps: { ...stats.flaps }, held: { ...stats.held } },
    corn: farm.corn.length,
    resting: farm.resting,
    restFor: farm.restFor,
    wings: {
      left: { rise: wings.left.rise, lift: wings.left.lift, up: wings.left.up, seen: wings.left.seen, flat: wings.left.flat, checked: wings.left.checked },
      right: { rise: wings.right.rise, lift: wings.right.lift, up: wings.right.up, seen: wings.right.seen, flat: wings.right.flat, checked: wings.right.checked },
    },
    drawn: { ...game.shown },
    friends: game.ghosts.map((ghost) => ghost.shown && { name: ghost.shown.name, x: ghost.shown.x, h: ghost.shown.h, state: ghost.shown.state, home: ghost.shown.home, gone: ghost.shown.gone }),
    labels: [...view.introduced],
    film: document.body.dataset.film,
  };
});

/**
 * Keeps the two hands going, in the page, as a child would who knows the game: down while the chick runs, up for a
 * flap in good time, kept up over water, and down again for the scarecrow, as the rules' own wants() says. most is
 * how many hands they use, 2, 1 (the right one) or 0. up and down are how far up each hand gets, and how far down.
 * wobble, from 0 to 1, makes them a real child's: never still, tipping a little to and fro, shaking, and lost by
 * the tracker for a frame now and then. policy is 'wants', or 'always', flapping all the time whatever is coming,
 * 'early', flapping well before the painted stretch, 'clumsy', too early and then only a quick hop at each thing,
 * 'hold', hands kept up, or 'hang', hands kept down. Runs until stopHands.
 */
export const flapHands = (page, { most = 2, up = UP, down = DOWN, wobble = 0, policy = 'wants', hand = 'right' } = {}) => page.evaluate(({ hands: count, high, low, shake, way, first }) => {
  clearInterval(window.__flapping);
  let upFor = 0;
  let rest = 0;
  let frame = 0;
  let raised = { left: false, right: false };
  const other = first === 'right' ? 'left' : 'right';
  window.__flapping = setInterval(() => {
    const { farm } = window.__game;
    frame += 1;
    let want = farm.wants();
    if (way === 'hold' || way === 'hang') {
      want = { wings: way === 'hold' ? 2 : 0, keep: false };
      upFor = 0;
    } else if (way === 'always') {
      want = { wings: Math.floor(frame / 14) % 2 ? 2 : 0, keep: false };
    } else if (way === 'early') {
      const { next, chick } = farm;
      const gap = next ? next.x0 - chick.x : Infinity;
      want = { wings: chick.waiting ? 2 : gap < 7.2 && gap > 6 && !chick.air ? 2 : 0, keep: false };
    } else if (way === 'clumsy') {
      // Too early on the way to each thing, and, once the chick has stopped at it, up for a moment and down again.
      const { next, chick } = farm;
      const gap = next ? next.x0 - chick.x : Infinity;
      const hop = chick.waiting && !chick.air && frame % 45 < 9;
      want = { wings: hop || (!chick.waiting && gap < 7.2 && gap > 6 && !chick.air) ? 2 : 0, keep: false };
      upFor = 0;
    }
    // Hands that have been up a while with the chick still on the ground come down, to flap again.
    if (rest > 0) {
      rest -= 0.033;
      want = { wings: 0, keep: false };
    } else if (want.wings > 0 && !farm.chick.air && farm.chick.state === 'run' && upFor > 0.8) {
      rest = 0.45;
      want = { wings: 0, keep: false };
    }
    const wings = Math.min(count, want.wings);
    if (!want.keep) raised = { [first]: wings >= 1, [other]: wings >= 2 };
    upFor = raised.left || raised.right ? upFor + 0.033 : 0;
    const tremble = (seed) => shake * 0.06 * Math.sin(frame * 0.9 + seed);
    // Wobbling, the picture has no hands in it for one frame in every forty.
    const lost = shake > 0 && frame % 40 === 0;
    window.__camera.show({
      left: lost ? null : 'palm',
      right: lost ? null : 'palm',
      scale: 0.62,
      leftShorten: (raised.left ? high : low) * (1 - Math.abs(tremble(1))),
      rightShorten: (raised.right ? high : low) * (1 - Math.abs(tremble(2.3))),
      rotate: shake * 8 * Math.sin(frame * 0.37),
      leftOffsetX: shake * 9 * Math.sin(frame * 1.7),
      leftOffsetY: shake * 9 * Math.cos(frame * 1.3),
      rightOffsetX: shake * 9 * Math.sin(frame * 1.1),
      rightOffsetY: shake * 9 * Math.cos(frame * 1.9),
    });
  }, 33);
}, { hands: most, high: up, low: down, shake: wobble, way: policy, first: hand });

export const stopHands = (page) => page.evaluate(() => clearInterval(window.__flapping));

/** Waits for the chick to be so near the front of the next thing of a kind, or past it. */
export const untilNear = (page, kind, within = 3) => page.waitForFunction(([wanted, gap]) => {
  const { farm } = window.__game;
  const thing = farm.things.find((each) => !each.done && each.kind === wanted);
  return thing && thing.x0 - farm.chick.x < gap;
}, [kind, within], { timeout: 120_000, polling: 30 });

export const labelShown = (page, key) => page.evaluate((wanted) => window.__game.view.introduced.has(wanted), key);

export const expectSoon = (read, options = {}) => expect.poll(read, { timeout: 45_000, intervals: [100], ...options });

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

/** A grown-up makes a flock, and gets its code. */
export async function makeFlock(page, name = 'Ana') {
  await page.locator('#friends-toggle').click();
  await page.locator('#friends-make').click();
  await expect(page.locator('#friends-code-shown')).toHaveText(/^[A-HJ-NP-Z2-9]{3}$/);
  await giveName(page, name);
  return page.locator('#friends-code-shown').textContent();
}

/** A friend opens the game with their own settings, and joins with the code, which joins as soon as it's typed. */
export async function joinFlock(page, code, settings = {}, name = '') {
  await openGame(page, settings, GAME);
  await page.locator('#friends-toggle').click();
  await page.locator('#friends-code').fill(code);
  await expect(page.locator('#friends-code-shown')).toHaveText(code);
  await giveName(page, name);
}

/** Everyone gets through the hand check, both hands held up, waits for each other, and then they all play. */
export async function allPlaying(...pages) {
  for (const each of pages) {
    await hands(each);
    await each.locator('#start').click();
  }
  for (const each of pages) await waitForScreen(each, 'playing');
}

export { test, expect, show, waitForScreen };
