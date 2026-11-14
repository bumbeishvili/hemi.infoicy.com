// Getting through Rooftop Rope in the tests. In place of the webcam there is footage of a person standing, and
// lifting one foot and then the other (test/fixtures/body/stands.webm), read by the real tracker. Or the child is
// played by a script, whose foot goes where the rope asks, a moment late and never quite still, as a real one's.
import { expect, openGame, test, waitForScreen } from '../helpers.js';

export { judge } from '../giraffe-garden/helpers.js';
export { test, expect, waitForScreen };

export const GAME = 'rooftop-rope';

/**
 * Opens the game with a walker that always goes back up from the net, unless a test says otherwise: most of
 * these tests were written when it always did. The crossing that can be lost, which is how the game comes, has
 * its own tests in play.spec.js.
 */
export async function openRope(page, settings = {}, hash = '') {
  await openGame(page, { ropeDrops: 'any', ...settings }, GAME, hash);
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'yes');
}

/** A person standing on both feet in front of the camera. */
export const standing = (page) => page.evaluate(() => window.__camera.showFootage('stands', { from: 0.5, playing: false }));

/**
 * The person with one foot so many centimetres off the floor. It's a moment in the footage, where the right
 * foot goes up evenly, 6 centimetres a second, from 1 to 9 seconds, and the left from 10 to 18.
 */
export const footUp = (page, foot, centimetres) => page.evaluate(({ side, by }) => window.__camera.showFootage('stands', { from: (side === 'right' ? 1 : 10) + by / 6, playing: false }), { side: foot, by: centimetres });

/**
 * The same footage playing on from a moment in it: from 20 seconds, the right foot 30 centimetres up and held
 * from 21 to 24.5 seconds, both feet down, the left foot the same from 27.5 to 31, and down again.
 */
export const standsFrom = (page, seconds) => page.evaluate((from) => window.__camera.showFootage('stands', { from, playing: true }), seconds);

/**
 * The same person with both feet on the floor, and one of them so many centimetres behind the other: a moment
 * in test/fixtures/body/staggers.webm, where the right foot slides back evenly, 10 centimetres a second, from 1
 * to 5 seconds, and the left from 7 to 11.
 */
export const footBehind = (page, foot, centimetres) => page.evaluate(({ side, by }) => window.__camera.showFootage('staggers', { from: (side === 'right' ? 1 : 7) + by / 10, playing: false }), { side: foot, by: centimetres });

/** What the tracker reads a foot so many centimetres up as, on this person: a share of their height. */
export const readsAs = (centimetres) => 0.8 * (centimetres / 100) - 0.03;

export async function toChoosing(page) {
  await page.locator('#start').click();
  await waitForScreen(page, 'choose');
}

/** From the title to the warm-up, with a person standing in view. */
export async function reachWarmup(page, settings = {}, hash = '') {
  await openRope(page, settings, hash);
  await standing(page);
  await toChoosing(page);
  await page.locator('#rope-start').click();
  await waitForScreen(page, 'warmup');
}

/** From the title to the first rooftop, skipping the warm-up, so a whole lift is a small one. */
export async function reachPlay(page, settings = {}) {
  await reachWarmup(page, settings);
  await page.locator('#warm-skip').click();
  await waitForScreen(page, 'countdown');
  await waitForScreen(page, 'playing');
}

/** What the rules say right now, how the feet are read, and what the screen shows. */
export const state = (page) => page.evaluate(() => {
  const { walk, lifter, world, game, warmup } = window.__game;
  const walker = world.walker;
  return {
    screen: game.screen,
    level: walk?.levelNumber,
    state: walk?.state,
    index: walk?.index,
    progress: walk?.progress,
    leg: walk?.leg,
    asked: walk?.asked,
    foot: walk?.foot ?? null,
    lift: walk?.lift,
    gliding: walk?.gliding,
    wobble: walk?.wobble,
    hint: walk?.hint ?? null,
    wrongFoot: Boolean(walk?.wrongFoot),
    idle: walk?.idle,
    light: walk?.light ? { left: walk.light.left, rested: walk.light.rested } : null,
    bird: walk?.bird ? { on: walk.bird.on, lost: walk.bird.lost } : null,
    inGust: walk ? walk.inGust() : false,
    atPost: Boolean(walk?.atPost),
    stats: walk && JSON.parse(JSON.stringify(walk.stats)),
    // The drops into the net that end the crossing, and how many of them are left: null where it's any number.
    dropsMost: walk && Number.isFinite(walk.dropsMost) ? walk.dropsMost : null,
    dropsLeft: walk && Number.isFinite(walk.dropsLeft) ? walk.dropsLeft : null,
    plan: walk && {
      ropes: walk.plan.ropes.map(({ leg, seconds, long, climb, things }) => ({ leg, seconds, long, climb, kinds: things.map(({ kind }) => kind) })),
      stars: walk.plan.stars,
      balloons: walk.plan.balloons,
      birds: walk.plan.birds,
      lights: walk.plan.lights,
    },
    raw: lifter.raw,
    seen: lifter.seen,
    up: { ...lifter.up },
    zero: lifter.zero,
    reach: lifter.reach,
    best: { ...lifter.best },
    eased: { ...lifter.eased },
    warmSide: warmup?.side ?? null,
    view: world.view,
    // Where the walker on the screen is, and how high it's drawn holding each foot.
    // And how far up on its wheel it is, from 0 to 1, how far over the rope that puts it, how far the wheel
    // has turned, and whether the wheel is to be seen.
    walker: walker && { x: walker.root.position.x, y: walker.root.position.y, z: walker.root.position.z, left: walker.pose.footLY ?? 0, right: walker.pose.footRY ?? 0, size: walker.size, onWheel: walker.onWheel, up: walker.seat.position.y, rolled: walker.rolled, wheelSeen: walker.wheel.root.visible, tip: walker.wheel.root.rotation.z },
    camera: { x: world.camera.position.x, y: world.camera.position.y, z: world.camera.position.z },
    mates: window.__game.mates.map((mate) => ({ along: mate.along, stars: mate.stars, crossed: mate.crossed, done: mate.done, gone: mate.gone, heard: mate.heard })),
  };
});

export const expectSoon = (read, options = {}) => expect.poll(read, { timeout: 45_000, intervals: [100], ...options });

/**
 * A child played by a script, in place of the camera's reading: how much higher one foot is than the other
 * goes into the game where the tracker's does, 30 times a second. The person in the footage stays standing in
 * view. Left to themselves they lift the foot the rope asks for, after a rest on every rooftop, and put it down
 * at a red light.
 *   share     how high they lift, as a share of a whole lift with that foot
 *   late      seconds they take to react
 *   wobble    how much their feet shake by, as a share of their height
 *   rest      seconds they rest on every rooftop
 *   fixed     what their feet do whatever the rope asks: null for both down, or { foot, share } or { foot, height }
 * Runs until stopChild.
 */
export const childWalks = (page, { share = 1.05, late = 0.3, wobble = 0.004, rest = 0.6, fixed } = {}) => page.evaluate((child) => {
  clearInterval(window.__child);
  const { game, lifter } = window.__game;
  game.onMoves = () => {};
  const wanted = [];
  let value = lifter.zero;
  let last = performance.now();
  let frame = 0;
  window.__childFeet = child.follow ? undefined : child.fixed;
  window.__child = setInterval(() => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    frame += 1;
    const { walk } = window.__game;
    let want = null;
    if (window.__childFeet !== undefined) want = window.__childFeet;
    else if (walk && (walk.state === 'roof' || walk.state === 'rope')) {
      const resting = walk.light && walk.light.left > 0;
      want = resting || (walk.state === 'roof' && walk.idle < child.rest) ? null : { foot: walk.asked, share: child.share };
    }
    wanted.push(want);
    const then = wanted[Math.max(0, wanted.length - 1 - Math.round(child.late / 0.033))] ?? null;
    let target = lifter.zero;
    if (then) {
      const height = then.height ?? 0.012 + then.share * (lifter.reachOf(then.foot) - 0.012);
      target += then.foot === 'right' ? height : -height;
    }
    value += (target - value) * (1 - Math.exp(-6 * dt));
    // Never quite still: the tracker's own jitter, and the child's.
    const shake = (Math.sin(frame * 1.7) * 0.6 + Math.sin(frame * 0.53) * 0.4) * child.wobble;
    lifter.update(value + shake, dt);
  }, 33);
}, { share, late, wobble, rest, fixed: fixed ?? null, follow: fixed === undefined });

/**
 * What the child's feet do from now on, whatever the rope asks: null for both feet down, { foot, share } for a
 * foot held so many whole lifts up, or { foot, height } for one a share of their height up. 'follow' has them
 * do what the rope asks again.
 */
export const childFeet = (page, feet) => page.evaluate((value) => {
  window.__childFeet = value === 'follow' ? undefined : value;
}, feet);

export const stopChild = (page) => page.evaluate(() => clearInterval(window.__child));

/**
 * Puts the walker on a rope a little before something, so a test needn't cross all the ropes to it. what is a
 * kind of thing, 'climb' or 'long' for a rope of that kind, 'last' for the last rope, or a rope's number. Returns
 * which rope, and where on it the thing is.
 */
export const putBefore = (page, what, { before = 0.12, at = null } = {}) => page.evaluate(({ kind, back, place }) => {
  const { walk, world } = window.__game;
  const { ropes } = walk.plan;
  const has = (rope) => (kind === 'climb' ? rope.climb : kind === 'long' ? rope.long : rope.things.some((thing) => thing.kind === kind));
  const found = typeof kind === 'number' ? kind : kind === 'last' ? ropes.length - 1 : ropes.findIndex((rope, n) => n >= walk.index && has(rope));
  if (found < 0 || found >= ropes.length) return null;
  const thing = ropes[found].things.find((one) => one.kind === (kind === 'long' ? 'post' : kind));
  const where = place ?? thing?.at ?? (kind === 'last' ? 1 : 0.3);
  walk.state = 'rope';
  walk.setRope(found);
  walk.progress = Math.max(0, where - back);
  walk.wobble = 0;
  walk.gliding = false;
  walk.foot = null;
  walk.idle = 0;
  // The walker and the camera go with it at once: flying there isn't part of the game.
  world.walkerAt.copy(world.onRope(world.place.ropes[found], walk.progress));
  world.snapNext = true;
  return { index: found, at: where };
}, { kind: what, back: before, place: at });

/** What the page has heard happen in this game, by name, in order. */
export const listen = (page) => page.evaluate(() => {
  const { walk } = window.__game;
  window.__heard = [];
  const tell = walk.onEvent;
  walk.onEvent = (event) => {
    window.__heard.push(event.type);
    tell(event);
  };
});
export const heard = (page) => page.evaluate(() => window.__heard);

/** Whether the small label that names something new has shown it, in this game. */
export const labelShown = (page, id) => page.evaluate((thing) => window.__game.game.newShown.has(thing), id);

/**
 * Reads how bright each part of the picture is, frame by frame, as the child sees it. The city is drawn again
 * just before each reading, as a 3D picture can only be read in the moment it's drawn. It's made small in two
 * steps, each smoothing, so that each part's reading is the average of all of it: made small in one step, each
 * part is only a few of its pixels, and a camera gliding past fine detail reads as flicker that isn't there.
 */
export const watchBrightness = (page, frames) => page.evaluate(async (count) => {
  const [wide, high] = [32, 18];
  const canvas = (across, down) => {
    const made = document.createElement('canvas');
    made.width = across;
    made.height = down;
    const drawing = made.getContext('2d', { willReadFrequently: true });
    drawing.imageSmoothingQuality = 'high';
    return drawing;
  };
  const middle = canvas(wide * 8, high * 8);
  const context = canvas(wide, high);
  const { world } = window.__game;
  const reading = [];
  for (let i = 0; i < count; i += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    world.render();
    middle.drawImage(world.renderer.domElement, 0, 0, wide * 8, high * 8);
    context.drawImage(middle.canvas, 0, 0, wide, high);
    const { data } = context.getImageData(0, 0, wide, high);
    const cells = new Array(wide * high);
    for (let j = 0; j < cells.length; j += 1) cells[j] = (data[j * 4] + data[j * 4 + 1] + data[j * 4 + 2]) / 3;
    reading.push({ at: performance.now(), cells });
  }
  return reading;
}, frames);

export const shot = (page, name) => page.screenshot({ path: `test-results/screens/${name}.png` });

/* ---------- with friends ---------- */

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

/** A grown-up makes a crossing, and gets its code. */
export async function makeCrossing(page, name = 'Ana') {
  await page.locator('#friends-toggle').click();
  await page.locator('#friends-make').click();
  await expect(page.locator('#friends-code-shown')).toHaveText(/^[A-HJ-NP-Z2-9]{3}$/);
  await giveName(page, name);
  return page.locator('#friends-code-shown').textContent();
}

/** A friend opens the game with their own settings, from the link, which goes straight in. */
export async function joinCrossing(page, code, settings = {}, name = '') {
  await openRope(page, settings, `#rope=${code}`);
  await expect(page.locator('#friends-code-shown')).toHaveText(code);
  await giveName(page, name);
}

/** Chooses a walker and presses Let's cross!, skipping the warm-up, to wait for the others. */
export async function getReady(page) {
  await standing(page);
  await page.locator('#start').click();
  await waitForScreen(page, 'choose');
  await page.locator('#rope-start').click();
  await waitForScreen(page, 'warmup');
  await page.locator('#warm-skip').click();
}
