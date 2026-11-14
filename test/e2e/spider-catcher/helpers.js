// Getting at Spider Catcher in the tests: what's in the garden, and a real hand onto a spider.
import { expect, hands } from '../helpers.js';
import { moveGloveTo, startPlaying as startGarden } from '../story-games/helpers.js';

export const GAME = 'spider-catcher';
export const GLOVE = ['garden', 'gloves', 'right'];

/**
 * Starts the garden as it always was, where nobody gets away: the gentle choice under "Spiders getting away". The
 * spiders that do get away are in away.spec.js, which starts the game as it comes.
 */
export const AS_IT_WAS = { spiderAway: 'gentle' };
export const startPlaying = (page, game, settings = {}, ...rest) => startGarden(page, game, { ...AS_IT_WAS, ...settings }, ...rest);

export const garden = (page) => page.evaluate(() => {
  const { gathering, garden: place } = window.__game;
  return {
    index: gathering.index,
    home: gathering.stats.home,
    letGo: gathering.stats.letGo,
    holding: Boolean(place.holding),
    width: place.width,
    height: place.height,
    web: place.web,
    spiders: place.spiders.map((spider) => ({ x: spider.x, y: spider.y, state: spider.state, catchable: place.catchable(spider), shy: spider.shy, pair: spider.pair })),
  };
});

/** Keeps the spiders where they are, so a hand can be put on one with the same photo every time. */
export const holdStill = (page) => page.evaluate(() => {
  for (const spider of window.__game.garden.spiders) spider.path.rate = 0;
});

/** The real hand's picture, where it is now, open or closed. */
export const handIs = (page, photo) => page.evaluate((which) => {
  window.__move?.stop();
  const { offsetX = 0, offsetY = 0 } = window.__move ?? {};
  window.__camera.show({ left: null, right: which, scale: 0.7, rightOffsetX: offsetX, rightOffsetY: offsetY });
}, photo);

/** An open hand onto the first spider that can be caught, held still. */
export async function openOnSpider(page) {
  // They take half a second to come out.
  await expect.poll(async () => (await garden(page)).spiders.some(({ catchable }) => catchable), { timeout: 10_000 }).toBe(true);
  await holdStill(page);
  const { spiders, width, height } = await garden(page);
  const spider = spiders.find(({ catchable }) => catchable);
  await moveGloveTo(page, GLOVE, spider.x / width, spider.y / height);
  await expect.poll(() => page.evaluate(() => {
    const { garden: place } = window.__game;
    return place.spiderNear(place.gloves.right) !== null;
  }), { timeout: 20_000 }).toBe(true);
  await expect.poll(async () => (await hands(page)).right.status, { timeout: 10_000 }).toBe('open');
}
