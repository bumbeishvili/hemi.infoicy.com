// Getting into Cannon Bay, with real photos going through the real tracker.
import { expect, openGame, show, waitForScreen } from '../helpers.js';

export const HAND_SCALE = 0.7;

/**
 * How hard is Gentle unless a test says otherwise, the game as it always was, so the tests of its kind rules play it
 * that way: the challenge, which is how it comes, has its own tests.
 */
export async function startPlaying(page, settings = {}, scene = [null, 'open', { scale: HAND_SCALE }]) {
  await openGame(page, { bayPirates: 'gentle', ...settings }, 'cannon-bay');
  await show(page, ...scene);
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
}

export const battleState = (page) => page.evaluate(() => {
  const { battle } = window.__game;
  return {
    state: battle.state,
    x: battle.x,
    z: battle.z,
    heading: battle.heading,
    speed: battle.speed,
    sails: battle.sails,
    wheel: battle.wheel,
    hearts: battle.hearts,
    left: battle.left,
    beaten: battle.beaten,
    resting: battle.resting,
    canFire: battle.canFire,
    firing: battle.firing,
    atLimit: battle.atLimit,
    coast: battle.coast,
    stats: { ...battle.stats },
    zones: {
      left: { firing: battle.zones.left.firing, inside: battle.zones.left.inside },
      right: { firing: battle.zones.right.firing, inside: battle.zones.right.inside },
    },
    pirates: battle.afloat.map(({ index, x, z, mode, hitsLeft }) => ({ index, x, z, mode, hitsLeft })),
    boats: battle.boats.length,
    balls: battle.balls.length,
  };
});

/**
 * Keeps one pirate ship this far off the bow and this far away, and sends the others a long way off, so
 * that a test can be about one thing. off is in radians, with right positive. Runs until it's let go.
 */
export const holdPirate = (page, { off = Math.PI / 2, away = 95, quiet = true } = {}) => page.evaluate(([bearing, distance, holdFire]) => {
  clearInterval(window.__holding);
  window.__holding = setInterval(() => {
    const { battle } = window.__game;
    const [first, ...others] = battle.afloat;
    if (!first) return;
    const direction = battle.heading + bearing;
    first.x = battle.x + Math.sin(direction) * distance;
    first.z = battle.z - Math.cos(direction) * distance;
    first.heading = battle.heading;
    first.mode = 'away';
    first.spot = { x: first.x, z: first.z };
    first.modeLeft = 5;
    first.runAt = -1;
    for (const other of others) {
      other.x = battle.x - Math.sin(battle.heading) * 620;
      other.z = battle.z + Math.cos(battle.heading) * 620;
      other.mode = 'away';
      other.spot = { x: other.x, z: other.z };
      other.modeLeft = 5;
      other.fireIn = 100;
    }
    if (holdFire) {
      first.fireIn = 100;
      first.burstLeft = 0;
      battle.broadsideIn = 100;
    }
  }, 16);
}, [off, away, quiet]);

export const letPirateGo = (page) => page.evaluate(() => clearInterval(window.__holding));

/** The hand moved this far across the picture, as if the child had moved it, from the middle. */
export const handAt = (page, offsetX, pose = 'open', side = 'right') => page.evaluate(([x, name, hand]) => {
  const scene = { left: null, right: null, scale: 0.7 };
  scene[hand] = name;
  scene[`${hand}OffsetX`] = x;
  window.__camera.show(scene);
}, [offsetX, pose, side]);

/** A child steering for the nearest pirate, with the real hand on the camera. */
export const sailTowardsPirates = (page, side = 'right') => page.evaluate((hand) => {
  clearInterval(window.__sailing);
  let offset = 0;
  window.__sailing = setInterval(() => {
    const { battle, monitor } = window.__game;
    if (!battle) return;
    const [nearest] = battle.afloat.slice().sort((a, b) => Math.hypot(a.x - battle.x, a.z - battle.z) - Math.hypot(b.x - battle.x, b.z - battle.z));
    let wanted = 0;
    if (nearest) {
      const heading = Math.atan2(nearest.x - battle.x, -(nearest.z - battle.z));
      wanted = Math.max(-1, Math.min(1, Math.atan2(Math.sin(heading - battle.heading), Math.cos(heading - battle.heading)) * 2));
    }
    // As far across the picture as full lock takes, a bit at a time.
    offset += (wanted * 170 - offset) * 0.1;
    const scene = { left: null, right: null, scale: 0.7 };
    scene[hand] = 'open';
    scene[`${hand}OffsetX`] = offset;
    window.__camera.show(scene);
    void monitor;
  }, 33);
}, side);

export const stopSailing = (page) => page.evaluate(() => clearInterval(window.__sailing));

/** Takes hits off every pirate ship near enough, so a test about the end of a battle doesn't take long. */
export const beatPirates = (page, count = 1) => page.evaluate((how) => {
  const { battle } = window.__game;
  battle.afloat.slice(0, how).forEach((pirate) => {
    while (pirate.state === 'sailing') battle.hit(pirate, pirate);
  });
}, count);

export const expectSoon = (fn, timeout = 20_000) => expect.poll(fn, { timeout, intervals: [100] });
export { waitForScreen };
