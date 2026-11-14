// Playing Giraffe's Paint Box in the tests, with real photos of hands going through the real tracker. A child is
// played by moving the photo of the hand that the fake camera shows, so that the glove, which is the brush, goes
// where a child's would: to the pot for the paint that's needed, and over the part that asks for it.
import { expect, openGame, show, test, waitForScreen } from '../helpers.js';

export { judge, watchBrightness } from '../giraffe-garden/helpers.js';

export const GAME = 'giraffe-paint';
export const OPEN = [null, 'open', { scale: 0.62 }];
export const FIST = [null, 'fist', { scale: 0.62 }];
export const NO_HAND = [null, null, { scale: 0.62 }];
// The gentle picture, which is the game as it always was: nobody to beat, and nobody can lose.
export const GENTLE = { paintRival: 'gentle' };

/** Gets through the hand check with an open hand, as anyone would, and on into play. */
export async function startPlaying(page, settings = {}, hash = '') {
  await openGame(page, settings, GAME, hash);
  await show(page, ...(settings.hands === 'left' ? ['open', null, { scale: 0.62 }] : OPEN));
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
}

/** What the rules say right now, and where the brush is. */
export const state = (page) => page.evaluate(() => {
  const { painting, game, view } = window.__game;
  return {
    level: painting.level,
    page: painting.page.id,
    done: painting.done,
    lost: painting.lost,
    rival: painting.rival ? { ...painting.rival } : null,
    progress: painting.progress,
    rule: painting.rule,
    parts: painting.parts.map(({ id, kind, colour, cells, covered, done, magic, dot }) => ({ id, kind, colour, cells, covered, done, magic, dot })),
    toPaint: painting.toPaint.length,
    stats: { ...painting.stats },
    brush: { tool: painting.brush.tool, colour: painting.brush.colour, down: painting.brush.down },
    radius: painting.radius,
    pots: painting.pots.map(({ kind, colour, ready, number, holds, x, y, r }) => ({ kind, colour, ready, number, holds, x, y, r })),
    hint: painting.hint && { ...painting.hint },
    roller: painting.roller && { ...painting.roller },
    friend: painting.friend && { mark: painting.friend.mark, found: painting.friend.found },
    stamps: painting.stamps.map(({ x, y }) => ({ x, y })),
    balloons: painting.balloons.map(({ x, y, part, popped }) => ({ x, y, part, popped })),
    mirror: painting.mirror,
    numbers: painting.numbers,
    at: game.brushOnSheet(),
    mode: game.mode,
    alive: Boolean(view.life),
  };
});

/** One of the picture's parts, as the rules have it. */
export const part = async (page, id) => (await state(page)).parts.find((each) => each.id === id);

/**
 * The paint at a place on the sheet: what the rules say is there, and what's really drawn on the screen's picture
 * of the paint, as { paint, drawn: [red, green, blue, alpha] }.
 */
export const paintAt = (page, x, y) => page.evaluate(([px, py]) => {
  const { painting, view } = window.__game;
  const code = painting.paint[Math.floor(py) * 150 + Math.floor(px)];
  const names = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'brown', 'rainbow'];
  const drawn = [...view.paint.getContext('2d').getImageData(Math.round(px * view.scale), Math.round(py * view.scale), 1, 1).data];
  return { paint: code ? names[code - 1] : null, drawn };
}, [x, y]);

/**
 * Keeps the real hand's picture moving, in the page, so the glove goes where target says, on the sheet: 'guide'
 * takes it wherever a child would go next (see guide in paint.js), a { x, y } stays there, and a function of the
 * painting and the game, as a string, says each time. photo is open, fist or none, and wobble how far the hand
 * wanders round where it's going, as a hand that isn't steady does. Runs until stopHand.
 */
export const leadHand = (page, { target = 'guide', photo = 'open', side = 'right', gain = 0.1, wobble = 0 } = {}) => page.evaluate(({ aim, picture, hand, rate, shake }) => {
  window.__lead?.stop();
  let x = window.__lead?.x ?? 0;
  let y = window.__lead?.y ?? 0;
  const pick = typeof aim === 'string' && aim !== 'guide' ? new Function('painting', 'game', `return (${aim})(painting, game);`) : null;
  const started = performance.now();
  const timer = setInterval(() => {
    const { game, painting, view } = window.__game;
    const at = game.brushOnSheet(hand);
    let wanted = null;
    if (aim === 'guide') wanted = painting.guide(at ?? undefined);
    else if (pick) wanted = pick(painting, game);
    else wanted = aim;
    if (at && wanted) {
      const t = (performance.now() - started) / 1000;
      const [wx, wy] = [Math.sin(t * 5.1) * shake, Math.cos(t * 3.7) * shake];
      x += (((wanted.x + wx - at.x) * view.unit) / innerWidth) * 1280 * rate;
      y += (((wanted.y + wy - at.y) * view.unit) / innerHeight) * 720 * rate;
    } else if (!at && picture !== 'none') {
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
}, { aim: target, picture: photo, hand: side, rate: gain, shake: wobble });

export const stopHand = (page) => page.evaluate(() => window.__lead?.stop());

/** A pot's place, as a target for leadHand: the pot of a paint, or the dish or the stamp. */
export const potOf = (which) => `(painting) => painting.pots.find((pot) => (pot.kind === 'colour' ? pot.colour : pot.kind) === '${which}')`;

/** A part's dot, as a target for leadHand. */
export const dotOf = (id) => `(painting) => painting.parts.find((part) => part.id === '${id}').dot`;

/** Leads the open hand to a pot and waits there until the brush has its paint, or the stamp. */
export async function dipIn(page, which) {
  await leadHand(page, { target: potOf(which) });
  await expectSoon(async () => {
    const { brush } = await state(page);
    return brush.tool === 'stamp' ? 'stamp' : brush.colour;
  }, { timeout: 30_000 }).toBe(which);
}

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

/** A grown-up makes a game, choosing together or against each other, and gets its code. */
export async function makeGame(page, name = 'Ana', how = null) {
  await page.locator('#friends-toggle').click();
  await page.locator('#friends-make').click();
  await expect(page.locator('#friends-code-shown')).toHaveText(/^[A-HJ-NP-Z2-9]{3}$/);
  await giveName(page, name);
  if (how) await page.locator(`input[name="friends-team"][value="${how}"]`).check();
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
    await show(each, ...OPEN);
    await each.locator('#start').click();
  }
  for (const each of pages) await waitForScreen(each, 'playing');
}
