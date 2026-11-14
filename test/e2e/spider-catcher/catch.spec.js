// Spider Catcher, with real photos going through the real tracker: catching a spider, carrying it,
// and letting it into its web, and what doesn't count.
import { expect, hands, shot, show, test, waitForScreen } from '../helpers.js';
import { moveGloveTo, stopMoving, storyIs } from '../story-games/helpers.js';
import { GAME, GLOVE, garden, handIs, holdStill, openOnSpider, startPlaying } from './helpers.js';

async function webPoint(page) {
  const { web, width, height } = await garden(page);
  return { x: web.x / width, y: web.y / height };
}

test('a real hand opens by a spider and closes on it, carries it to the web, and opens to put it home', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, GAME);
  // The spiders are out playing as soon as the game starts.
  await storyIs(page, 'giraffe');
  await expect.poll(async () => (await garden(page)).spiders.length, { timeout: 1000 }).toBeGreaterThan(0);
  await page.waitForTimeout(800);
  await shot(page, 'spider-1-first-place');

  await openOnSpider(page);
  await shot(page, 'spider-2-open-by-one');
  await handIs(page, 'fist');
  await expect.poll(async () => (await garden(page)).holding, { timeout: 15_000 }).toBe(true);
  await shot(page, 'spider-3-caught');
  await expect(page.locator('#prompt-text')).toHaveText('Bring it to the web, and open your hand!', { timeout: 10_000 });

  const web = await webPoint(page);
  await moveGloveTo(page, GLOVE, web.x, web.y, { right: 'fist' });
  await expect.poll(() => page.evaluate(() => window.__game.garden.onWeb), { timeout: 30_000 }).toBe(true);
  // Still held all the way across.
  expect((await garden(page)).holding).toBe(true);
  await shot(page, 'spider-4-at-the-web');
  await handIs(page, 'open');
  await expect.poll(async () => (await garden(page)).home, { timeout: 15_000 }).toBe(1);
  await page.waitForTimeout(600);
  const after = await garden(page);
  expect(after.spiders.filter(({ state }) => state === 'home')).toHaveLength(1);
  expect(after.letGo).toBe(0);
  expect(await page.evaluate(() => window.__game.garden.fill)).toBeGreaterThan(0.2);
  await shot(page, 'spider-5-home');
});

test('a fist that comes along closed doesn\'t catch: the hand has to open and close on a spider', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, GAME);
  await storyIs(page, 'giraffe');
  await holdStill(page);
  // Closed well away from the spiders, down on Giraffe's side, for longer than a catch lasts.
  await moveGloveTo(page, GLOVE, 0.3, 0.88);
  await page.waitForTimeout(1500);
  await handIs(page, 'fist');
  await expect.poll(async () => (await hands(page)).right.status, { timeout: 10_000 }).toBe('closed');
  await page.waitForTimeout(1600);
  expect((await garden(page)).holding).toBe(false);
  const { spiders, width, height } = await garden(page);
  const spider = spiders.find(({ catchable }) => catchable);
  await moveGloveTo(page, GLOVE, spider.x / width, spider.y / height, { right: 'fist' });
  await expect.poll(() => page.evaluate(() => {
    const { garden: place } = window.__game;
    return place.spiderNear(place.gloves.right) !== null;
  }), { timeout: 20_000 }).toBe(true);
  await stopMoving(page);
  await page.waitForTimeout(1500);
  expect((await garden(page)).holding).toBe(false);
  // Opening there and closing again does catch it.
  await handIs(page, 'open');
  await expect.poll(async () => (await hands(page)).right.status, { timeout: 10_000 }).toBe('open');
  await handIs(page, 'fist');
  await expect.poll(async () => (await garden(page)).holding, { timeout: 15_000 }).toBe(true);
});

test('opening anywhere but the web lets the spider go back to playing, at no cost', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, GAME);
  await storyIs(page, 'giraffe');
  await openOnSpider(page);
  await handIs(page, 'fist');
  await expect.poll(async () => (await garden(page)).holding, { timeout: 15_000 }).toBe(true);
  await handIs(page, 'open');
  await expect.poll(async () => (await garden(page)).letGo, { timeout: 15_000 }).toBe(1);
  const after = await garden(page);
  expect(after.home).toBe(0);
  expect(after.holding).toBe(false);
  expect(after.spiders.some(({ state }) => state === 'returning')).toBe(true);
  await shot(page, 'spider-6-let-go');
  await expect.poll(async () => (await garden(page)).spiders.every(({ state }) => state === 'playing'), { timeout: 5000 }).toBe(true);
});

test('a hand that can\'t be read never lets a spider in, and a hand that has gone lets it go', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, GAME);
  await storyIs(page, 'giraffe');
  await openOnSpider(page);
  await handIs(page, 'fist');
  await expect.poll(async () => (await garden(page)).holding, { timeout: 15_000 }).toBe(true);
  // Slid half out of the picture, still closed, and then opened there. A hand cut off by the edge can't
  // be read, so it's neither open nor closed, and it keeps holding.
  const edge = await page.evaluate(async () => {
    const { offsetX = 0, offsetY = 0 } = window.__move ?? {};
    for (let offset = offsetX; offset <= 700; offset += 15) {
      window.__camera.show({ left: null, right: 'fist', scale: 0.7, rightOffsetX: offset, rightOffsetY: offsetY });
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (window.__game.monitor.snapshot.right.reason === 'edge') return { offset, offsetY };
    }
    return null;
  });
  expect(edge).not.toBeNull();
  await page.evaluate(({ offset, offsetY }) => {
    window.__camera.show({ left: null, right: 'open', scale: 0.7, rightOffsetX: offset, rightOffsetY: offsetY });
  }, edge);
  await page.waitForTimeout(1200);
  expect((await hands(page)).right.reason).toBe('edge');
  expect(await garden(page)).toMatchObject({ holding: true, home: 0, letGo: 0 });
  // Gone from the picture: let go, and nothing goes into the web.
  await show(page, null, null);
  await expect.poll(async () => (await garden(page)).letGo, { timeout: 15_000 }).toBe(1);
  expect((await garden(page)).home).toBe(0);
});

test('every spider home goes from place to place, with each friend, and ends with everyone home', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME);
  const bringAllHome = () => page.evaluate(() => {
    const { gathering } = window.__game;
    while (gathering.home < gathering.place.count) gathering.spiderHome();
  });
  for (const [who, index] of [['giraffe', 0], ['mochi', 1], ['bramble', 2], ['frost', 3], ['giraffe', 4]]) {
    await expect.poll(async () => (await garden(page)).index, { timeout: 30_000 }).toBe(index);
    await storyIs(page, who);
    await expect.poll(async () => (await garden(page)).spiders.length, { timeout: 1000 }).toBeGreaterThan(0);
    await page.waitForTimeout(700);
    await shot(page, `spider-7-place-${index}`);
    await bringAllHome();
    if (index === 0) {
      // Straight on to the next place.
      await expect.poll(() => page.evaluate(() => window.__game.garden.moving), { timeout: 2000 }).toBeGreaterThan(0);
      await page.waitForTimeout(600);
      await shot(page, 'spider-8-moving-on');
    }
  }
  await expect(page.locator('#story-line')).toContainText('Thank you');
  await waitForScreen(page, 'finish');
  await expect(page.locator('#screen-finish')).toContainText('Every spider is home!');
  await shot(page, 'spider-9-finish');
});

test('with the left hand, the spiders play on the left and their web is across on the right', async ({ page }) => {
  await startPlaying(page, GAME, { hands: 'left' }, ['open', null, { scale: 0.7 }]);
  await storyIs(page, 'giraffe');
  const { spiders, web, width } = await garden(page);
  for (const { x } of spiders) expect(x).toBeLessThan(width / 2);
  expect(web.x).toBeGreaterThan(width / 2);
  await page.waitForTimeout(400);
  await shot(page, 'spider-10-left-hand');
});
