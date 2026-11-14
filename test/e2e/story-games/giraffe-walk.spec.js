// Giraffe's Long Walk Home, with real photos going through the real tracker.
import { expect, hands, shot, show, test, waitForScreen } from '../helpers.js';
import { moveGloveTo, stopMoving, storyIs } from './helpers.js';
import { startPlaying } from './challenge-helpers.js';

const GAME = 'giraffe-walk';
const GLOVE = ['walk', 'gloves', 'right'];
const journey = (page) => page.evaluate(() => {
  const { journey: rules, walk } = window.__game;
  return { index: rules.index, fed: rules.fed, stats: rules.stats, holding: Boolean(walk.holding), hanging: walk.fruit.filter(({ state }) => state === 'hanging').length };
});

test('closing a real hand on a fruit picks it, and opening it at Giraffe\'s mouth feeds him', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, GAME);
  // The fruit is there as soon as the game starts.
  await storyIs(page, 'giraffe');
  await expect.poll(async () => (await journey(page)).hanging, { timeout: 1000 }).toBeGreaterThan(0);
  await page.waitForTimeout(800);
  await shot(page, 'w1-first-stop');

  const fruit = await page.evaluate(() => {
    const { walk } = window.__game;
    const [first] = walk.fruit;
    return { x: first.x / walk.width, y: first.y / walk.height };
  });
  await moveGloveTo(page, GLOVE, fruit.x, fruit.y);
  await expect.poll(() => page.evaluate(() => {
    const { walk } = window.__game;
    return walk.fruitNear(walk.gloves.right) !== null;
  }), { timeout: 20_000 }).toBe(true);
  await shot(page, 'w2-on-the-fruit');

  // Now the same place with a fist.
  await stopMoving(page);
  await page.evaluate(() => {
    const { offsetX, offsetY } = window.__move;
    window.__camera.show({ left: null, right: 'fist', scale: 0.7, rightOffsetX: offsetX, rightOffsetY: offsetY });
  });
  await expect.poll(async () => (await journey(page)).holding, { timeout: 15_000 }).toBe(true);
  await shot(page, 'w3-picked');
  await expect(page.locator('#prompt-text')).toHaveText('Bring it to the giraffe, and open your hand!', { timeout: 10_000 });

  // Across to his mouth, still holding on.
  const mouth = await page.evaluate(() => {
    const { walk } = window.__game;
    return { x: walk.mouth.x / walk.width, y: walk.mouth.y / walk.height };
  });
  expect(mouth.x).toBeGreaterThan(0);
  await moveGloveTo(page, GLOVE, mouth.x, mouth.y, { right: 'fist' });
  await expect.poll(() => page.evaluate(() => window.__game.walk.onMouth), { timeout: 30_000 }).toBe(true);
  await shot(page, 'w4-at-his-mouth');
  await stopMoving(page);
  await page.evaluate(() => {
    const { offsetX, offsetY } = window.__move;
    window.__camera.show({ left: null, right: 'open', scale: 0.7, rightOffsetX: offsetX, rightOffsetY: offsetY });
  });
  await expect.poll(async () => (await journey(page)).stats.fed, { timeout: 15_000 }).toBe(1);
  await page.waitForTimeout(300);
  await shot(page, 'w5-fed');
});

test('opening a hand anywhere else lets go of the fruit, and it goes back on the tree', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page, GAME);
  await expect.poll(async () => (await journey(page)).hanging, { timeout: 20_000 }).toBeGreaterThan(0);
  await page.evaluate(() => {
    const { walk } = window.__game;
    const [fruit] = walk.fruit;
    fruit.state = 'held';
    walk.picking.held = fruit;
  });
  await expect.poll(async () => (await journey(page)).stats.dropped, { timeout: 10_000 }).toBe(1);
  const { fed } = await journey(page);
  expect(fed).toBe(0);
  await expect.poll(async () => (await journey(page)).hanging, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
});

test('every stop fed brings Giraffe along the road, and home at last', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME);
  const feedThisStop = () => page.evaluate(() => {
    const { journey: rules } = window.__game;
    while (rules.fed < rules.stop.count) rules.feed();
  });
  await expect.poll(async () => (await journey(page)).hanging, { timeout: 20_000 }).toBeGreaterThan(0);
  await feedThisStop();
  // Straight off to the next tree.
  await expect.poll(() => page.evaluate(() => window.__game.walk.walking), { timeout: 2000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1000);
  await shot(page, 'w6-walking');
  for (const [who, index] of [['mochi', 1], ['bramble', 2], ['tur', 3], ['giraffe', 4]]) {
    await expect.poll(async () => (await journey(page)).index, { timeout: 30_000 }).toBe(index);
    await storyIs(page, who);
    await expect.poll(async () => (await journey(page)).hanging, { timeout: 1000 }).toBeGreaterThan(0);
    await page.waitForTimeout(500);
    await shot(page, `w7-stop-${index}`);
    await feedThisStop();
  }
  await expect(page.locator('#story-line')).toContainText('Thank you');
  await waitForScreen(page, 'finish');
  await expect(page.locator('#screen-finish')).toContainText('The giraffe is home!');
  await shot(page, 'w8-finish');
});

test('the left hand has its tree on the left, with Giraffe across from it', async ({ page }) => {
  await startPlaying(page, GAME, { hands: 'left' }, ['open', null, { scale: 0.7 }]);
  await expect.poll(async () => (await journey(page)).hanging, { timeout: 20_000 }).toBeGreaterThan(0);
  const { fruitX, mouthX, width } = await page.evaluate(() => {
    const { walk } = window.__game;
    return { fruitX: walk.fruit[0].x, mouthX: walk.mouth.x, width: walk.width };
  });
  expect(fruitX).toBeLessThan(width / 2);
  expect(mouthX).toBeGreaterThan(width / 2);
  await page.waitForTimeout(300);
  await shot(page, 'w9-left-hand');
  expect((await hands(page)).left.status).not.toBe('missing');
  await show(page, 'open', null, { scale: 0.7 });
});
