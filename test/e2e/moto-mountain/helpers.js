// Getting through Moto Mountain in the tests. In place of the webcam there is footage of a person standing
// still (test/fixtures/body/lifts.webm), read by the real tracker, which the test camera tips over to make them
// lean: see tiltFootage in fake-camera.js. Or the child is played by a script, whose lean goes where the road
// needs it, a moment late and with a wobble, as a real one does.
import { expect, openGame, test, waitForScreen } from '../helpers.js';

export { judge } from '../giraffe-garden/helpers.js';
export { test, expect, waitForScreen };

export const GAME = 'moto-mountain';

/**
 * Opens the game on the gentle ride, the road alone, which is what most of these tests are about: the wild
 * ride, which is how the game comes, has its own in wild.spec.js, and asks for it with motoRide: 'wild'.
 */
export async function openMoto(page, settings = {}, hash = '') {
  await openGame(page, { motoRide: 'gentle', ...settings }, GAME, hash);
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'yes');
}

/** A person standing upright in front of the camera, arms down. */
export const standing = (page) => page.evaluate(() => window.__camera.showFootage('lifts', { from: 0.6, playing: false }));

/**
 * A person bending sideways at the waist, by so many degrees at the top of their spine, to their right: less than
 * 0 is to their left. It's a moment in test/fixtures/body/leans.webm, where the bend goes evenly from 20 degrees
 * one way to 20 the other between 1 and 11 seconds.
 */
export const bending = (page, degrees) => page.evaluate((by) => window.__camera.showFootage('leans', { from: 6 + by / 4, playing: false }), degrees);

/** The same footage playing on from a moment in it: from 13 seconds, a lean to the right and held, upright, to the left and held, and upright. */
export const leansFrom = (page, seconds) => page.evaluate((from) => window.__camera.showFootage('leans', { from, playing: true }), seconds);

/** The person leaning so many degrees to their right, as they see it in the mirror: less than 0 is to their left. */
export const lean = (page, degrees) => page.evaluate((by) => window.__camera.tiltFootage(by), degrees);

export async function toChoosing(page) {
  await page.locator('#start').click();
  await waitForScreen(page, 'choose');
}

/** From the title to the warm-up, with a person standing in view. */
export async function reachWarmup(page, settings = {}, hash = '') {
  await openMoto(page, settings, hash);
  await standing(page);
  await toChoosing(page);
  await page.locator('#moto-start').click();
  await waitForScreen(page, 'warmup');
}

/**
 * From the title to riding, skipping the warm-up, so a whole lean is what the setting says. road is the number
 * of a road to ride, the same one every time, for a test that's about something only some roads have.
 */
export async function reachPlay(page, settings = {}, road = null) {
  await reachWarmup(page, settings);
  if (road !== null) {
    await page.evaluate((seed) => {
      window.__game.game.roadSeed = seed;
    }, road);
  }
  await page.locator('#warm-skip').click();
  await waitForScreen(page, 'countdown');
  await waitForScreen(page, 'playing');
}

/** What the rules say right now, how the lean is read, and what the screen shows. */
export const state = (page) => page.evaluate(() => {
  const { ride, leaner, world, game, warmup } = window.__game;
  const degrees = (radians) => (radians === null || radians === undefined ? null : (radians * 180) / Math.PI);
  const bend = ride?.riding?.bend ?? null;
  return {
    screen: game.screen,
    level: ride?.levelNumber,
    state: ride?.state,
    s: ride?.s,
    x: ride?.x,
    v: ride?.v,
    cruise: ride?.cruise,
    roll: ride?.roll,
    yaw: ride?.yaw,
    height: ride?.height,
    offRoad: ride?.offRoad,
    waiting: ride?.waiting,
    towed: Boolean(ride?.towed),
    hint: ride?.hint,
    need: ride ? ride.needAt(ride.s) : 0,
    bend: bend && { index: bend.index, turn: bend.turn, need: bend.need, big: bend.big },
    ahead: ride?.ahead ?? null,
    flow: ride?.flow,
    onBridge: ride?.onBridge,
    stats: ride && JSON.parse(JSON.stringify(ride.stats)),
    // The wild ride: in the air, in a river, the race, and what's in the way.
    air: Boolean(ride?.air),
    wet: Boolean(ride?.wet),
    boost: ride?.boostLeft ?? 0,
    place: ride?.place ?? null,
    rivals: (ride?.rivals ?? []).map(({ s, x, v, height, done }) => ({ ahead: s - ride.s, x, v, height, done })),
    hills: (ride?.plan.hills ?? []).map(({ at, slope, bank }) => ({ at, kind: slope ?? (bank ? 'bank' : 'top') })),
    barriers: (ride?.things ?? []).filter(({ kind }) => kind === 'barrier').map(({ at, x, reach, wall, gone }) => ({ at, x, reach, wall: Boolean(wall), gone: Boolean(gone) })),
    // How high the bike on the screen is over the road, and how many other riders are drawn.
    bikeUp: world.rider && world.shape && ride ? world.rider.root.position.y - 0.06 - window.__game.roadY(ride.s, ride.x) : 0,
    riders: world.rivals.length,
    plan: ride && { length: ride.plan.length, bends: ride.plan.bends.map(({ turn, need, big, from, to }) => ({ turn, need, big, from, to })), kinds: [...new Set(ride.plan.things.map(({ kind }) => kind))], stars: ride.plan.stars, snows: ride.plan.snows, snowFrom: ride.plan.snowFrom },
    share: leaner.share,
    seen: leaner.seen,
    angle: degrees(leaner.angle),
    raw: degrees(leaner.raw),
    zero: degrees(leaner.zero),
    reach: { left: degrees(leaner.reach.left), right: degrees(leaner.reach.right) },
    best: { left: degrees(leaner.best.left), right: degrees(leaner.best.right) },
    warmSide: warmup?.side ?? null,
    // How far over the bike on the screen is drawn, the right side positive.
    bikeRoll: world.rider?.bike.lean.rotation.z ?? 0,
    // And how far its nose is drawn pointing away from the way the road goes, the right positive.
    bikeYaw: world.rider?.drift ?? 0,
    view: world.view,
    cameraTip: world.cameraTip,
    mates: window.__game.mates.map((mate) => ({ s: mate.s, stars: mate.stars, done: mate.done, gone: mate.gone, heard: mate.heard })),
  };
});

export const expectSoon = (read, options = {}) => expect.poll(read, { timeout: 45_000, intervals: [100], ...options });

/**
 * A person in front of the real tracker, who leans as far as the road needs, a moment ahead of it: the footage
 * is tipped over 20 times a second. skill is how much of the lean the road needs they manage. Runs until stopChild.
 */
export const personRides = (page, { skill = 1 } = {}) => page.evaluate((child) => {
  clearInterval(window.__child);
  window.__child = setInterval(() => {
    const { ride, leaner } = window.__game;
    if (!ride || ride.state !== 'riding') return;
    const want = ride.needAt(ride.s + ride.v * 0.5) * child.skill;
    const reach = leaner.reachOf(want < 0 ? 'left' : 'right');
    const angle = want === 0 ? 0 : Math.sign(want) * (0.14 + Math.abs(want) * 0.86) * reach;
    window.__camera.tiltFootage(((angle + leaner.zero) * 180) / Math.PI);
  }, 50);
}, { skill });

/**
 * A child played by a script, in place of the camera's reading: their lean goes into the game where the
 * tracker's does, as an angle, 30 times a second. The person in the footage stays standing in view.
 *   skill     how much of the lean the road needs they manage
 *   late      seconds they take to react
 *   wobble    degrees their body shakes by
 *   fixed     a share of a whole lean to hold whatever the road does, or null to follow the road
 *   goFor     true has them lean towards the stars, arrows, ramps and heaps of snow in the straights
 *   avoid     true has them lean round sheep and scooters
 * Runs until stopChild.
 */
export const childRides = (page, { skill = 1, late = 0.3, wobble = 0.8, fixed = null, goFor = false, avoid = false, looks = false, tricks = false } = {}) => page.evaluate((child) => {
  clearInterval(window.__child);
  const { game, leaner } = window.__game;
  game.onMoves = () => {};
  const wanted = [];
  let body = leaner.zero;
  let last = performance.now();
  let frame = 0;
  window.__childLean = child.fixed;
  window.__child = setInterval(() => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    frame += 1;
    const { ride } = window.__game;
    let want = 0;
    if (window.__childLean !== null && window.__childLean !== undefined) want = window.__childLean;
    else if (ride?.state === 'riding') {
      want = ride.needAt(ride.s + ride.v * 0.25) * child.skill;
      if (!ride.bendAt(ride.s)) {
        const near = (thing) => (thing.pos ?? thing.at) > ride.s && (thing.pos ?? thing.at) - ride.s < 45 && !thing.done;
        const prize = child.goFor ? ride.passing.find((thing) => near(thing) && ['star', 'snow', 'boost', 'ramp'].includes(thing.kind)) : null;
        const block = child.avoid ? ride.blockers.find((thing) => near(thing) && !thing.aside) : null;
        if (block) want += block.x > 0 ? -0.15 : 0.15;
        else if (prize) want += Math.max(-0.25, Math.min(0.25, (prize.x - ride.x) * 0.1));
      }
      // On the wild ride, a child who looks where they're going: round the bales that are in the way, and
      // lined up with the ramp before a row of them right across the road.
      if (child.looks && !ride.air) {
        const ahead = (thing) => thing.at > ride.s && thing.at - ride.s < 55 && !thing.gone && !thing.taken;
        const wall = ride.things.find((thing) => thing.kind === 'barrier' && thing.wall && ahead(thing));
        const ramp = wall ? ride.things.find((thing) => thing.kind === 'ramp' && thing.at < wall.at && wall.at - thing.at < 30 && thing.at > ride.s) : null;
        const bales = ride.things.find((thing) => thing.kind === 'barrier' && !thing.wall && ahead(thing));
        let to = null;
        if (ramp) to = ramp.x;
        else if (bales && Math.abs(ride.x - bales.x) < bales.reach + 0.7) to = bales.x + (bales.x > 0.1 ? -1 : bales.x < -0.1 ? 1 : ride.x < 0 ? -1 : 1) * (bales.reach + 1);
        if (to !== null) want += Math.max(-0.35, Math.min(0.35, (to - ride.x) * 0.14));
      }
      // A trick: a deep lean for the first part of a jump, and upright again in time to land.
      if (child.tricks && ride.air && ride.air.t < 0.75) want = 1;
    }
    wanted.push(want);
    const share = Math.max(-1, Math.min(1, wanted[Math.max(0, wanted.length - 1 - Math.round(child.late / 0.033))] ?? 0));
    const reach = leaner.reachOf(share < 0 ? 'left' : 'right');
    const target = share === 0 ? leaner.zero : leaner.zero + Math.sign(share) * (0.14 + Math.abs(share) * 0.86) * reach;
    body += (target - body) * (1 - Math.exp(-5 * dt));
    // Never quite still: the tracker's own jitter, and the child's.
    const shake = ((Math.sin(frame * 1.7) * 0.6 + Math.sin(frame * 0.53) * 0.4) * child.wobble * Math.PI) / 180 / 2;
    leaner.update(body + shake, dt);
  }, 33);
}, { skill, late, wobble, fixed, goFor, avoid, looks, tricks });

/** The child holds a lean, as a share of a whole one, whatever the road does. null lets them follow the road again. */
export const childHolds = (page, share) => page.evaluate((value) => {
  window.__childLean = value;
}, share);

export const stopChild = (page) => page.evaluate(() => clearInterval(window.__child));

/**
 * Puts the bike down on the road a little before something, at full speed in the middle, so a test needn't
 * ride all the way to it. what is a kind of thing, 'big' for the big bend, 'top' for the last of the road, or a
 * distance along the road in metres. Returns where the thing is.
 */
export const putBefore = (page, what, { before = 34, x = 0, lane = false } = {}) => page.evaluate(({ kind, back, across, inLane }) => {
  const { ride } = window.__game;
  const thing = typeof kind === 'number' ? { at: kind }
    : kind === 'big' ? ride.plan.bends.find((bend) => bend.big)
      // The top of a steep hill, which a bike flies off, or the bank of a river.
      : kind === 'crest' ? ride.plan.hills.find((hill) => !hill.slope && !hill.bank && hill.at > ride.s + back)
        : kind === 'wall' ? ride.things.find((one) => one.kind === 'barrier' && one.wall && !one.gone && one.at > ride.s + back)
          : kind === 'bales' ? ride.things.find((one) => one.kind === 'barrier' && !one.wall && !one.gone && one.at > ride.s + back)
      : kind === 'top' ? { at: ride.plan.length }
        : kind === 'bend' ? ride.plan.bends.find((bend) => bend.from > ride.s + back)
          : ride.things.find((one) => one.kind === kind && !one.done && (one.from ?? one.at) > ride.s + back);
  if (!thing) return null;
  const at = thing.at ?? thing.from;
  ride.s = Math.max(0, at - back);
  // In the middle of the road, or in line with the thing, for a test that's about riding over it.
  ride.x = inLane ? thing.x ?? across : across;
  ride.yaw = 0;
  ride.v = ride.cruise;
  ride.offRoad = false;
  ride.waiting = null;
  ride.idle = 0;
  ride.riding = null;
  ride.towed = null;
  ride.air = null;
  ride.height = 0;
  ride.vy = 0;
  ride.wet = null;
  ride.boostLeft = 0;
  ride.nextBend = ride.plan.bends.findIndex((bend) => bend.from > ride.s);
  if (ride.nextBend < 0) ride.nextBend = ride.plan.bends.length;
  ride.nextThing = ride.passing.findIndex((one) => one.at > ride.s);
  if (ride.nextThing < 0) ride.nextThing = ride.passing.length;
  // The camera goes with it at once: flying there isn't part of the game.
  window.__game.world.snapNext = true;
  return at;
}, { kind: what, back: before, across: x, inLane: lane });

/**
 * Puts the other riders in the race where a test wants them: each so many metres in front of the child's bike,
 * or behind it with less than nothing, going at the bike's own steady speed, in the order they line up in.
 */
export const rivalsAt = (page, offsets) => page.evaluate((list) => {
  const { ride } = window.__game;
  ride.rivals.forEach((rival, n) => {
    if (list[n] === undefined || rival.done) return;
    rival.s = ride.s + list[n];
    rival.v = ride.cruise;
    rival.air = false;
    rival.height = 0;
    rival.vy = 0;
    rival.slowLeft = 0;
    rival.next = 0;
  });
}, offsets);

/** The bike has stopped in a bend to wait for a lean, and is staying there. */
export const waitingInBend = async (page) => {
  const now = await state(page);
  return now.waiting === 'bend' && now.v === 0 && now.bend !== null;
};

/** Whether the small label that names something new has shown it, in this ride. */
export const labelShown = (page, id) => page.evaluate((thing) => window.__game.game.newShown.has(thing), id);

/**
 * Reads how bright each part of the picture is, frame by frame, as the child sees it. The mountain is drawn again
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

/** A grown-up makes a ride, and gets its code. */
export async function makeRide(page, name = 'Ana') {
  await page.locator('#friends-toggle').click();
  await page.locator('#friends-make').click();
  await expect(page.locator('#friends-code-shown')).toHaveText(/^[A-HJ-NP-Z2-9]{3}$/);
  await giveName(page, name);
  return page.locator('#friends-code-shown').textContent();
}

/** A friend opens the game with their own settings, from the link, which goes straight in. */
export async function joinRide(page, code, settings = {}, name = '') {
  await openMoto(page, settings, `#ride=${code}`);
  await expect(page.locator('#friends-code-shown')).toHaveText(code);
  await giveName(page, name);
}

/** Chooses a rider and presses Let's ride!, skipping the warm-up, to wait for the others. */
export async function getReady(page) {
  await standing(page);
  await page.locator('#start').click();
  await waitForScreen(page, 'choose');
  await page.locator('#moto-start').click();
  await waitForScreen(page, 'warmup');
  await page.locator('#warm-skip').click();
}
