// Getting through Mighty Lift in the tests, with footage of a person raising an arm in place of the webcam
// (test/fixtures/body/lifts.webm, read by the real tracker), or with a child played by a script, whose arm goes
// where the game needs it, wobbling as a real one does.
import { expect, openGame, test, waitForScreen } from '../helpers.js';

export { judge } from '../giraffe-garden/helpers.js';
export { test, expect, waitForScreen };

export const GAME = 'mighty-lift';

// Moments in the footage, in seconds, for what the arms are doing then. Between them: the right arm goes right up
// from 1.5, is held to 5.2 and is down gently by 6.4; goes to the shoulder from 7.6, is held to 10.5 and dropped;
// the left is up from 12 to 16; both from 17 to 21.5; the right is held up but shaking from 23.4 to 26; a small
// raise from 28 to 31.3; and both, the left only to the shoulder, from 32.3 to 36.2.
export const ARMS = { down: 0.6, up: 4, shoulder: 9.6, leftUp: 14, bothUp: 19.5, shaking: 24.5, small: 29.8, uneven: 34.5 };

/** Unless a test says, it's the gentle game, as it was, with no clock before sunset. */
export async function openLift(page, settings = {}, hash = '') {
  await openGame(page, { liftClock: 'no', ...settings }, GAME, hash);
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'yes');
}

export const footage = (page, name, options = {}) =>
  page.evaluate(([clip, settings]) => window.__camera.showFootage(clip, settings), [name, options]);

/** The person in the footage, held still at one of the moments above. */
export const armsAre = (page, what) => footage(page, 'lifts', { from: ARMS[what], playing: false });

/** The footage playing on from a moment in it. */
export const playFrom = (page, seconds) => footage(page, 'lifts', { from: seconds, playing: true });

export async function toChoosing(page) {
  await page.locator('#start').click();
  await waitForScreen(page, 'choose');
}

/** From the title to the warm-up, with a person standing in view, arms down. */
export async function reachWarmup(page, settings = {}, hash = '') {
  await openLift(page, settings, hash);
  await armsAre(page, 'down');
  await toChoosing(page);
  await page.locator('#lift-start').click();
  await waitForScreen(page, 'warmup');
}

/** From the title to lifting, skipping the warm-up, so each arm's line is as high as its setting says. */
export async function reachPlay(page, settings = {}) {
  await reachWarmup(page, settings);
  await page.locator('#warm-skip').click();
  await waitForScreen(page, 'countdown');
  await waitForScreen(page, 'playing');
}

/** What the rules say right now, how the arms are read, and what the yard shows. */
export const state = (page) => page.evaluate(() => {
  const { lifting, arms, world, game } = window.__game;
  const arm = (side) => ({ lift: arms[side].lift, seen: arms[side].seen, rest: arms[side].rest, line: arms[side].line, best: arms[side].best, eased: arms[side].eased });
  return {
    screen: game.screen,
    level: lifting?.levelNumber,
    state: lifting?.state,
    phase: lifting?.phase,
    index: lifting?.index,
    kind: lifting?.rescue?.kind,
    rescue: lifting?.rescue && { ...lifting.rescue },
    kinds: lifting?.rescues.map(({ kind }) => kind),
    friends: lifting?.rescues.map(({ friend }) => friend),
    height: lifting?.height,
    thingHeight: lifting?.thingHeight,
    up: lifting?.up,
    out: lifting?.out,
    pulls: lifting?.pulls,
    parts: lifting?.parts,
    mustLower: lifting?.mustLower,
    balloons: lifting?.balloons,
    helping: lifting?.helping,
    honey: lifting?.honey,
    hint: lifting?.hint,
    resting: lifting?.resting,
    hold: lifting?.holdSeconds,
    planned: lifting?.liftsPlanned,
    done: lifting?.liftsDone,
    stats: lifting && { ...lifting.stats },
    lift: arms.lift,
    sides: arms.sides,
    left: arm('left'),
    right: arm('right'),
    thingY: world.thingY,
    thing: world.thing?.kind ?? null,
    friendOut: world.friend?.out ?? null,
    lifterHands: world.lifter && { left: world.lifter.pose.handRY, right: world.lifter.pose.handLY },
    today: game.liftsToday,
  };
});

export const expectSoon = (read, options = {}) => expect.poll(read, { timeout: 45_000, intervals: [100], ...options });

/**
 * A child played by a script, in place of the camera: their arm goes up when there's something to lift, is held
 * until the friend is out, and comes down again, and it's never quite still. It goes into the game where the
 * camera's readings do, as how high each wrist is above its shoulder, 30 times a second.
 *   high      how far up the arm goes, as a share of the way to its line: 1.12 is a little over it
 *   wait      seconds before lifting, once there's something to lift
 *   shake     how much the arm shakes while it's up, in torso lengths
 *   drop      true lets the arm fall, rather than lowering it with care
 *   lifts     false leaves the arm down, for a child who rests
 *   both      true moves both arms
 * Runs until stopChild.
 */
export const childLifts = (page, { high = 1.12, wait = 0.4, shake = 0, drop = false, lifts = true, both = false } = {}) => page.evaluate((child) => {
  clearInterval(window.__child);
  const { game, arms } = window.__game;
  game.onMoves = () => {};
  const REST = -0.92;
  let height = REST;
  let last = performance.now();
  let frame = 0;
  window.__child = setInterval(() => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    frame += 1;
    const { lifting } = window.__game;
    const side = arms.sides[0];
    const arm = arms[side];
    const wanted = child.lifts && lifting?.state === 'playing' && lifting.phase === 'lifting' && !lifting.mustLower && lifting.phaseFor >= child.wait;
    const target = wanted ? arm.rest + arm.span * child.high : REST;
    // Up at an arm's pace, and down with care, or let fall.
    const speed = target > height ? 2.6 : child.drop ? 9 : 1;
    height += Math.max(-speed * dt, Math.min(speed * dt, target - height));
    // Never quite still: the tracker's own jitter, and a tired arm's shake while it's held up.
    const jitter = Math.sin(frame * 1.7) * 0.012 + Math.sin(frame * 0.53) * 0.01;
    const shaking = wanted ? Math.sin(frame * 0.5) * child.shake : 0;
    const read = height + jitter + shaking;
    const other = child.both ? read - 0.03 : REST + jitter;
    const heights = { left: side === 'left' ? read : other, right: side === 'right' ? read : other };
    if (game.screen === 'warmup' && game.warmup) game.warmup.update(heights, dt);
    else arms.update(heights, dt);
  }, 33);
}, { high, wait, shake, drop, lifts, both });

export const stopChild = (page) => page.evaluate(() => clearInterval(window.__child));

/** Whether the small label that names something new has shown it, in this game. */
export const labelShown = (page, id) => page.evaluate((thing) => window.__game.game.newShown.has(thing), id);

/**
 * Reads how bright each part of the picture is, frame by frame, as the child sees it. The yard is drawn again
 * just before each reading, as a 3D picture can only be read in the moment it's drawn. It's made small in two
 * steps, each smoothing, so that each part's reading is the average of all of it: made small in one step, each
 * part is only a few of its pixels, and a camera gliding over the yard's fine detail reads as flicker that isn't there.
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

/** A grown-up makes a game, and gets its code. */
export async function makeGame(page, name = 'Ana') {
  await page.locator('#friends-toggle').click();
  await page.locator('#friends-make').click();
  await expect(page.locator('#friends-code-shown')).toHaveText(/^[A-HJ-NP-Z2-9]{3}$/);
  await giveName(page, name);
  return page.locator('#friends-code-shown').textContent();
}

/** A friend opens the game with their own settings, from the link, which goes straight in. */
export async function joinGame(page, code, settings = {}, name = '') {
  await openLift(page, settings, `#lift=${code}`);
  await expect(page.locator('#friends-code-shown')).toHaveText(code);
  await giveName(page, name);
}

/** Chooses a lifter and presses Let's lift!, skipping the warm-up, to wait for the others. */
export async function getReady(page) {
  await armsAre(page, 'down');
  await page.locator('#start').click();
  await waitForScreen(page, 'choose');
  await page.locator('#lift-start').click();
  await waitForScreen(page, 'warmup');
  await page.locator('#warm-skip').click();
}
