// Getting through Leap Trail, with footage of a real person in place of the webcam.
import { expect, openGame, waitForScreen } from '../helpers.js';

/**
 * Most tests are about one obstacle at a time, so the runner waits for the move unless they say. They're
 * about the game as it was, unless they say: the gentle trail, with no hearts to lose, at a slow pace.
 */
export async function openTrail(page, settings = {}) {
  await openGame(page, { onMissed: 'wait', trailHearts: 'no', pace: 'slow', ...settings }, 'leap-trail');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'yes');
}

export const footage = (page, name, options = {}) =>
  page.evaluate(([clip, settings]) => window.__camera.showFootage(clip, settings), [name, options]);

/** A person standing still, in full view, is what the body check wants. */
export const standInView = (page) => footage(page, 'strikes', { from: 0.2, playing: false });

export async function toChoosing(page) {
  await page.locator('#start').click();
  await waitForScreen(page, 'choose');
}

/** From the title to the practice, with a person standing in view. */
export async function reachPractice(page, settings = {}) {
  await openTrail(page, settings);
  await standInView(page);
  await toChoosing(page);
  await page.locator('#run-start').click();
  await waitForScreen(page, 'practice');
}

/** From the title to running, skipping the practice. */
export async function reachRun(page, settings = {}) {
  await reachPractice(page, settings);
  await page.locator('#practice-skip').click();
  await waitForScreen(page, 'countdown');
  await waitForScreen(page, 'run');
}

/** What a tracked body would do, for tests that are about what comes after. Jumping is all there is. */
export function bodyDoes(page) {
  return page.evaluate(() => window.__game.run.jump());
}

/** Moves the person in the footage across, as a share of the picture, towards the right of the mirror. */
export const standAcross = (page, shiftX) => footage(page, 'strikes', { from: 0.2, playing: false, shiftX });

export const runState = (page) => page.evaluate(() => {
  const { run } = window.__game;
  const next = run.next;
  return {
    state: run.state,
    distance: run.distance,
    speed: run.speed,
    waiting: run.waiting,
    resting: run.resting,
    stats: run.stats,
    lane: run.lane,
    next: next ? { kind: next.kind, needs: next.needs, gap: run.gapTo(next), inReach: run.inReach(next), lanes: next.lanes, mustJump: run.mustJump } : null,
  };
});

/**
 * Makes the next obstacle this one, close by, so a test needn't wait for chance to bring it. Unless a
 * test says which lanes it fills, it goes right across, as every obstacle once did.
 */
export function nextObstacleIs(page, kind, gap = 18, lanes = [-1, 0, 1]) {
  return page.evaluate(async ([chosen, ahead, filled]) => {
    const { OBSTACLES } = await import('/games/leap-trail/run.js');
    const { run, world } = window.__game;
    const next = run.next;
    world.retire(next);
    Object.assign(next, OBSTACLES[chosen], { kind: chosen, at: run.distance + ahead, lanes: filled });
    delete next.spring; // A trampoline, from level 4, only where a test puts one.
    if (next.gold && !filled.includes(next.gold.lane)) delete next.gold;
    run.announced = null; // It may have been asked for already, as something else.
    for (let i = next.index + 1; i < run.course.length; i += 1) {
      world.retire(run.course[i]);
      run.course[i].at = Math.max(run.course[i].at, next.at + 25 * (i - next.index));
    }
    run.end = Math.max(run.end, run.course.at(-1).at + 15);
  }, [kind, gap, lanes]);
}

/**
 * Steps the run and the world at exactly 60 frames a second, whatever this computer manages, so what's
 * measured doesn't depend on how busy it is. Keeps the runner in lane, if one is given, and jumps
 * whenever a jump counts, unless jump is false, and calls window.__eachFrame(frame), if a test has set
 * it, before each step. Says, from each frame to the
 * next, how much the overall brightness changed and what share of the picture changed by more than
 * 20 out of 255, and how near the camera's lens anything left behind on the trail came while showing:
 * a trampoline's arch, a golden star, a power-up or key, or a falling leaf.
 */
export const steppedPicture = (page, frames, { jump = true, lane = null } = {}) => page.evaluate(async ([count, jumping, where]) => {
  const { world, game, run } = window.__game;
  const small = document.createElement('canvas');
  small.width = 64;
  small.height = 36;
  const context = small.getContext('2d', { willReadFrequently: true });
  const showing = (sprite) => sprite.visible && sprite.material.opacity > 0.01;
  const nearest = () => {
    const sprites = [...world.pickupSprites.values(), ...world.leaves];
    for (const { arch, gold } of world.items.values()) {
      if (arch) sprites.push(...arch.sprites, ...(arch.gem ? [arch.gem] : []));
      if (gold) sprites.push(gold.sprite);
    }
    return Math.min(Infinity, ...sprites.filter(showing).map((sprite) => sprite.position.distanceTo(world.camera.position)));
  };
  const changes = [];
  let closest = Infinity;
  let last = null;
  game.paused = true;
  // In this lane the whole time, as the camera isn't read while it steps.
  if (where !== null) {
    run.setLane(where);
    world.setLane(where);
  }
  try {
    for (let i = 0; i < count && run.state === 'running'; i += 1) {
      if (jumping && run.next && run.inReach(run.next) && run.next.state === 'ahead') run.jump();
      window.__eachFrame?.(i);
      run.noteActivity();
      run.update(1 / 60);
      world.update(1 / 60);
      world.render();
      closest = Math.min(closest, nearest());
      context.drawImage(world.renderer.domElement, 0, 0, 64, 36);
      const { data } = context.getImageData(0, 0, 64, 36);
      let mean = 0;
      for (let j = 0; j < data.length; j += 4) mean += (data[j] + data[j + 1] + data[j + 2]) / 3;
      mean /= 64 * 36;
      if (last) {
        let changed = 0;
        for (let j = 0; j < data.length; j += 4) {
          if ((Math.abs(data[j] - last.data[j]) + Math.abs(data[j + 1] - last.data[j + 1]) + Math.abs(data[j + 2] - last.data[j + 2])) / 3 > 20) changed += 1;
        }
        changes.push({ step: Math.abs(mean - last.mean), share: changed / (64 * 36) });
      }
      last = { data: new Uint8ClampedArray(data), mean };
    }
  } finally {
    game.paused = false;
    window.__eachFrame = null;
  }
  return {
    step: Math.max(0, ...changes.map(({ step }) => step)),
    share: Math.max(0, ...changes.map(({ share }) => share)),
    closest,
    frames: changes.length,
  };
}, [frames, jump, lane]);

/**
 * Notes every screen the page shows from now on. A screen that only lasts a moment, like the body
 * check when the child is already in view, can come and go between two looks at a busy computer.
 */
export const recordScreens = (page) => page.evaluate(() => {
  window.__screensSeen = [];
  new MutationObserver(() => window.__screensSeen.push(document.body.dataset.screen))
    .observe(document.body, { attributes: true, attributeFilter: ['data-screen'] });
});

export const screensSeen = (page) => page.evaluate(() => window.__screensSeen ?? []);
