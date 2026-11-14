// Getting into Tank Patrol and playing it, with real photos going through the real tracker. The hand is
// moved by moving its photo in the fake camera's picture, until it's where the test wants it on screen.
import { expect, openGame, show, waitForScreen } from '../helpers.js';

const GAME = 'tank-patrol';

/** hash is anything after # in the address, as in a link from a friend to play with them. */
// How hard is Gentle unless a test says otherwise, the game as it always was, so the tests of its kind rules play it
// that way: the challenge, which is how it comes, has its own tests.
export const openPatrol = (page, settings = {}, hash = '') => openGame(page, { tankShells: 'gentle', ...settings }, GAME, hash);

export async function startPatrol(page, settings = {}, scene = [null, 'open', { scale: 0.7 }]) {
  await openPatrol(page, settings);
  await show(page, ...scene);
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
}

/**
 * Keeps the hand pointing at a place, which stays true as things move. where is { x, z } on the ground,
 * 'tank' for the first robot tank still rolling, or 'friend' for the friend's tank in a battle with them.
 * hand is which photo to show: open or fist.
 */
export async function pointAt(page, where, hand = 'open', side = 'right') {
  await page.evaluate(({ place, photo, handSide }) => {
    window.__point?.stop();
    const { field } = window.__game;
    let offsetX = window.__point?.offsetX ?? 0;
    let offsetY = window.__point?.offsetY ?? 0;
    const timer = setInterval(() => {
      const glove = field.gloves[handSide];
      const { patrol } = window.__game;
      const at = place === 'tank' ? patrol.rolling[0] : place === 'friend' ? patrol.friend : place;
      if (glove.visible && at) {
        const spot = field.project(at.x, at.y ?? 0, at.z);
        offsetX += ((spot.x - glove.x) / innerWidth) * 180;
        offsetY += ((spot.y - glove.y) / innerHeight) * 120;
      }
      const other = handSide === 'right' ? 'left' : 'right';
      window.__camera.show({ [other]: null, [handSide]: photo, scale: 0.7, [`${handSide}OffsetX`]: offsetX, [`${handSide}OffsetY`]: offsetY });
      window.__point.offsetX = offsetX;
      window.__point.offsetY = offsetY;
    }, 50);
    window.__point = { stop: () => clearInterval(timer), offsetX, offsetY };
  }, { place: where, photo: hand, handSide: side });
}

export const stopPointing = (page) => page.evaluate(() => window.__point?.stop());

/** Takes the hand away altogether, as if the child has put it down. */
export async function handGone(page) {
  await stopPointing(page);
  await show(page, null, null);
}

/** One robot tank, this far from the child's and waiting there, with nothing else about. */
export function oneTankAt(page, dx, dz, { hp = null, andOneMore = false } = {}) {
  return page.evaluate(([offsetX, offsetZ, health, oneMore]) => {
    const { patrol } = window.__game;
    const [enemy, ...others] = patrol.rolling;
    for (const other of others) {
      other.state = 'gone';
      patrol.emit('gone', { enemy: other });
    }
    patrol.queue = oneMore ? ['scout'] : [];
    patrol.total = patrol.stats.stopped + (oneMore ? 2 : 1);
    patrol.lobIn = 999;
    const spot = patrol.nav.nearestFree(patrol.tank.x + offsetX, patrol.tank.z + offsetZ);
    Object.assign(enemy, { x: spot.x, z: spot.z, goal: { x: spot.x, z: spot.z }, holdFor: 9999, speed: 0 });
    enemy.flow = patrol.nav.flowTo(spot.x, spot.z, enemy.flow);
    if (health) enemy.hp = enemy.maxHp = health;
    window.__enemy = enemy;
    return { x: spot.x, z: spot.z, kind: enemy.kind };
  }, [dx, dz, hp, andOneMore]);
}

/** Stops any more shells coming, unless a test asks for one. */
export const noShells = (page) => page.evaluate(() => {
  window.__game.patrol.lobIn = 9999;
});

export const patrolIs = (page) => page.evaluate(() => {
  const { patrol } = window.__game;
  const { tank, stats, hearts, resting, look, firing, state, stopped, left, shells } = patrol;
  return { x: tank.x, z: tank.z, speed: tank.speed, stats, hearts, resting, look, firing, state, stopped, left, shells: shells.length, hand: patrol.hand };
});

export const handIs = (page, wanted) => expect.poll(async () => (await patrolIs(page)).hand, { timeout: 15_000 }).toBe(wanted);

/** Measures the picture's brightness from one frame to the next, with the marks over it, while it's doing something. */
export function brightnessThrough(page, frames) {
  return page.evaluate(async (count) => {
    const { field } = window.__game;
    const small = document.createElement('canvas');
    small.width = 32;
    small.height = 18;
    const context = small.getContext('2d', { willReadFrequently: true });
    const reading = [];
    for (let i = 0; i < count; i += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      field.render();
      context.drawImage(field.canvas, 0, 0, 32, 18);
      context.drawImage(field.marks.canvas, 0, 0, 32, 18);
      const { data } = context.getImageData(0, 0, 32, 18);
      let total = 0;
      for (let j = 0; j < data.length; j += 4) total += (data[j] + data[j + 1] + data[j + 2]) / 3;
      reading.push(total / (32 * 18));
    }
    return reading;
  }, frames);
}

export const biggestStep = (values) => Math.max(...values.slice(1).map((value, index) => Math.abs(value - values[index])));
