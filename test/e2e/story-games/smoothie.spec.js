// Giraffe's Smoothie Stand, with real photos going through the real tracker.
import { expect, hands, shot, show, test, waitForScreen } from '../helpers.js';
import { startPlaying as startStand, storyIs } from './helpers.js';

// These are the stand as it always was: customers who wait as long as it takes, the gentle choice under
// "Customers' patience", and the slow pace that was the default then. The customers who won't wait are in
// smoothie-patience.spec.js.
const AS_IT_WAS = { patience: 'gentle', smoothiePace: 'slow' };
const startPlaying = (page, game, settings = {}, ...rest) => startStand(page, game, { ...AS_IT_WAS, ...settings }, ...rest);

const GAME = 'smoothie-stand';
const stand = (page) => page.evaluate(() => {
  const { stand: rules, field } = window.__game;
  return { index: rules.index, left: rules.left, stats: rules.stats, sliced: field.sliced, sticky: field.gloves.right.sticky };
});

/** A still fruit right where the glove is. */
const fruitOnGlove = (page, kind) => page.evaluate((which) => {
  const { field } = window.__game;
  const { x, y } = field.gloves.right;
  field.throwFruit(which, { x, y });
}, kind);

/** Clears the air, for a test about one fruit at a time. */
const noMoreFruit = (page) => page.evaluate(() => {
  const { field } = window.__game;
  field.throwing = false;
  field.fruit = [];
});

/** The hand going quickly from side to side, as a swipe does. */
const swiping = (page, on = true) => page.evaluate((go) => {
  clearInterval(window.__swipe);
  if (!go) return;
  let t = 0;
  window.__swipe = setInterval(() => {
    t += 0.06;
    window.__camera.show({ left: null, right: 'open', scale: 0.7, rightOffsetX: Math.sin(t * 7) * 220 });
  }, 60);
}, on);

test('fruit flies from the very start, plenty of it, and it doesn\'t stop for anyone talking', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page, GAME);
  // The first order is up as soon as the game starts.
  await storyIs(page, 'truffle');
  await expect(page.locator('.order-item[data-fruit="apple"] .order-count')).toHaveText('0 / 4');
  await expect.poll(() => page.evaluate(() => window.__game.field.fruit.length), { timeout: 4000 }).toBeGreaterThanOrEqual(3);
  await page.waitForTimeout(1500);
  await shot(page, 'f1-plenty');

  const inTheAir = [];
  for (let i = 0; i < 12; i += 1) {
    inTheAir.push(await page.evaluate(() => window.__game.field.fruit.length));
    await page.waitForTimeout(250);
  }
  expect(Math.min(...inTheAir)).toBeGreaterThanOrEqual(2);
  expect(Math.max(...inTheAir)).toBeGreaterThanOrEqual(4);

  // On to the next customer, with the fruit still flying all the while.
  await page.evaluate(() => {
    const { stand: rules } = window.__game;
    while (rules.left.apple > 0) rules.slice('apple');
  });
  expect(await page.evaluate(() => window.__game.field.throwing)).toBe(true);
  expect(await page.evaluate(() => window.__game.field.fruit.length)).toBeGreaterThan(0);
  await storyIs(page, 'mochi');
  await expect(page.locator('#chip-smoothies')).toHaveText('1 of 6');
  expect(await page.evaluate(() => window.__game.field.throwing)).toBe(true);
});

test('a swipe of an open hand slices what\'s on the order, and the ticket counts it', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page, GAME);
  await noMoreFruit(page);
  await swiping(page);
  await expect.poll(() => page.evaluate(() => window.__game.field.gloves.right.speed), { timeout: 15_000 }).toBeGreaterThan(0.3);
  await page.evaluate(() => {
    window.__onHand = setInterval(() => {
      const { field } = window.__game;
      const { x, y, speed } = field.gloves.right;
      if (speed > 0.3 && field.fruit.length === 0) field.throwFruit('apple', { x, y });
    }, 200);
  });
  await expect.poll(async () => (await stand(page)).stats.wanted, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(120);
  await shot(page, 'f3-sliced');
  await expect.poll(async () => (await stand(page)).stats.smoothies, { timeout: 15_000 }).toBe(1);
  await page.evaluate(() => clearInterval(window.__onHand));
  await swiping(page, false);
  await expect(page.locator('#chip-smoothies')).toHaveText('1 of 6');
  await storyIs(page, 'mochi');
});

test('a hand that isn\'t moving doesn\'t slice, unless a grown-up has said touching is enough', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page, GAME);
  await noMoreFruit(page);
  await expect.poll(() => page.evaluate(() => window.__game.field.gloves.right.visible)).toBe(true);
  await page.waitForTimeout(800);
  await fruitOnGlove(page, 'apple');
  await page.waitForTimeout(1500);
  expect((await stand(page)).stats.wanted).toBe(0);

  await page.evaluate(() => window.__game.session.changeSettings({ slicing: 'touch' }));
  await expect.poll(async () => (await stand(page)).stats.wanted, { timeout: 5000 }).toBe(1);
});

test('a closed hand only bumps the fruit, and is told to open', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page, GAME, { slicing: 'touch' });
  await noMoreFruit(page);
  await show(page, null, 'fist', { scale: 0.7 });
  await expect.poll(async () => (await hands(page)).right.status, { timeout: 15_000 }).toBe('closed');
  await page.waitForTimeout(300);
  await fruitOnGlove(page, 'apple');
  await expect(page.locator('#prompt-text')).toHaveText('Open your right hand to slice!', { timeout: 10_000 });
  expect((await stand(page)).stats.wanted).toBe(0);
  await shot(page, 'f4-fist');
});

test('rotten fruit makes the glove sticky for a moment, and costs nothing else', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page, GAME, { slicing: 'touch' });
  await noMoreFruit(page);
  await expect.poll(() => page.evaluate(() => window.__game.field.gloves.right.visible)).toBe(true);
  await page.waitForTimeout(300);
  await fruitOnGlove(page, 'rotten');
  await expect.poll(async () => (await stand(page)).sticky, { timeout: 5000 }).toBeGreaterThan(0);
  await expect.poll(async () => (await stand(page)).stats.rotten).toBe(1);
  await shot(page, 'f5-sticky');
  // It can't slice meanwhile, and it's soon over. It's made to last for the first part of this.
  await page.evaluate(() => {
    window.__game.field.gloves.right.sticky = 30;
  });
  await fruitOnGlove(page, 'apple');
  await page.waitForTimeout(500);
  expect((await stand(page)).stats.wanted).toBe(0);
  await page.evaluate(() => {
    window.__game.field.gloves.right.sticky = 1.2;
  });
  await expect.poll(async () => (await stand(page)).sticky, { timeout: 4000 }).toBe(0);
  await expect.poll(async () => (await stand(page)).stats.wanted, { timeout: 5000 }).toBe(1);
});

test('the last customer ends the day with the Golden Cup', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, GAME, { customers: 3 });
  await storyIs(page, 'truffle');
  const finishOrder = () => page.evaluate(() => {
    const { stand: rules } = window.__game;
    for (const kind of rules.wantedKinds) while (rules.left[kind] > 0) rules.slice(kind);
  });
  await finishOrder();
  await storyIs(page, 'kit');
  await finishOrder();
  await storyIs(page, 'bramble');
  await page.waitForTimeout(300);
  await finishOrder();
  await expect(page.locator('#story-line')).toContainText('Golden Cup');
  await expect(page.locator('#chip-smoothies')).toHaveText('3 of 3');
  await waitForScreen(page, 'finish');
  await expect(page.locator('#screen-finish')).toContainText('You won the Golden Cup!');
  await shot(page, 'f6-finish');
});
