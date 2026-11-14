// Spider Catcher at the higher levels, with real photos going through the real tracker: spiders on the
// move, a swaying web, shy spiders and twins, and nothing flashing at level 1 or level 10.
import { expect, shot, test, waitForScreen } from '../helpers.js';
import { atLevel, judgeBrightness, moveGloveTo, stopMoving, storyIs, watchBrightness } from '../story-games/helpers.js';
import { GAME, GLOVE, garden, handIs, openOnSpider, startPlaying } from './helpers.js';
const CANVASES = ['backdrop', 'giraffe-stage', 'game'];

/**
 * Keeps the hand's photo going after a spider that won't keep still, or the web, in the page, until it's
 * stopped. It's how a real hand would follow one. window.__photo says whether the hand is open or a fist.
 */
const chase = (page, what) => page.evaluate((target) => {
  window.__chase?.();
  let x = window.__move?.offsetX ?? 0;
  let y = window.__move?.offsetY ?? 0;
  const timer = setInterval(() => {
    const { garden: place } = window.__game;
    const glove = place.gloves.right;
    // At two webs, the one the spider being carried lives in.
    const wanted = target === 'web' ? place.webOf(place.holding ?? {}) : place.spiders.find((spider) => place.catchable(spider));
    if (glove.visible && wanted) {
      x += ((wanted.x - glove.x) / innerWidth) * 1280 * 0.12;
      y += ((wanted.y - glove.y) / innerHeight) * 720 * 0.12;
    }
    window.__move = { offsetX: x, offsetY: y, stop: () => clearInterval(timer) };
    window.__camera.show({ left: null, right: window.__photo ?? 'open', scale: 0.7, rightOffsetX: x, rightOffsetY: y });
  }, 33);
  window.__chase = () => clearInterval(timer);
}, what);

test('level 10: more spiders out at once, twins, quicker and twistier, and a web that sways', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, GAME, atLevel(GAME, 10));
  await storyIs(page, 'giraffe');
  expect(await page.evaluate(() => window.__game.gathering.places.map(({ count }) => count))).toEqual([3, 3, 5, 5, 3]);
  await page.waitForTimeout(600);
  const first = await garden(page);
  // All three at the first place are out at once, and two of them are twins.
  expect(first.spiders).toHaveLength(3);
  expect(first.spiders.filter(({ pair }) => pair !== null)).toHaveLength(2);
  // Measured on the screen: never faster than the level allows.
  // Measured on the screen, by the game's own clock: never faster than the level allows.
  const { fastest, webMoved } = await page.evaluate(async () => {
    const { garden: place } = window.__game;
    const webStart = place.web;
    const look = () => ({ t: place.time, at: place.spiders.map(({ x, y, state }) => ({ x, y, state })) });
    let top = 0;
    let last = look();
    for (let i = 0; i < 40; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const now = look();
      const seconds = now.t - last.t;
      now.at.forEach((spider, index) => {
        const before = last.at[index];
        if (seconds <= 0 || !before || spider.state !== 'playing' || before.state !== 'playing') return;
        top = Math.max(top, Math.hypot(spider.x - before.x, spider.y - before.y) / place.height / seconds);
      });
      last = now;
    }
    return { fastest: top, webMoved: Math.abs(place.web.x - webStart.x) / place.height };
  });
  expect(fastest).toBeGreaterThan(0.03);
  expect(fastest).toBeLessThanOrEqual(0.094 * 1.05);
  expect(webMoved).toBeGreaterThan(0.002);
  expect(webMoved).toBeLessThanOrEqual(0.0601 * 2);
  await shot(page, 'spider-l10-garden');
});

test('level 10: a real hand follows a moving spider, catches it, and puts it in the swaying web', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 10));
  await storyIs(page, 'giraffe');
  // Nobody shy for this one: only the moving.
  await page.evaluate(() => {
    for (const spider of window.__game.garden.spiders) spider.shy = false;
  });
  await chase(page, 'spider');
  await expect.poll(() => page.evaluate(() => {
    const { garden: place } = window.__game;
    return place.spiderNear(place.gloves.right) !== null && window.__game.monitor.snapshot.right.status === 'open';
  }), { timeout: 30_000 }).toBe(true);
  await page.evaluate(() => {
    window.__photo = 'fist';
  });
  await expect.poll(async () => (await garden(page)).holding, { timeout: 15_000 }).toBe(true);
  await shot(page, 'spider-l10-caught');
  await chase(page, 'web');
  await expect.poll(() => page.evaluate(() => window.__game.garden.onWeb), { timeout: 30_000 }).toBe(true);
  await page.evaluate(() => {
    window.__photo = 'open';
  });
  await expect.poll(async () => (await garden(page)).home, { timeout: 15_000 }).toBe(1);
  await page.evaluate(() => window.__chase?.());
  expect((await garden(page)).letGo).toBe(0);
});

test('level 10: a shy spider scuttles off once as the hand comes near, and then it can be caught', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 10));
  await storyIs(page, 'giraffe');
  await expect.poll(async () => (await garden(page)).spiders.some(({ catchable }) => catchable), { timeout: 10_000 }).toBe(true);
  // The hand out of the way first, and then one spider, standing still, and shy.
  await moveGloveTo(page, GLOVE, 0.5, 0.9);
  await expect.poll(() => page.evaluate(() => {
    const { garden: place } = window.__game;
    return place.gloves.right.visible && place.gloves.right.y > place.height * 0.82;
  }), { timeout: 20_000 }).toBe(true);
  await page.evaluate(() => {
    const { garden: place } = window.__game;
    const [spider] = place.spiders;
    place.spiders = [spider];
    place.waiting = [];
    Object.assign(spider, { shy: true, dashed: false, state: 'playing', dash: null, alpha: 1 });
    spider.shift = { x: 0, y: 0 };
    spider.path.rate = 0;
  });
  const dashed = () => page.evaluate(() => window.__game.garden.spiders[0].dashed);
  expect(await dashed()).toBe(false);
  const { spiders, width, height } = await garden(page);
  const before = spiders[0];
  // Straight at it.
  await moveGloveTo(page, GLOVE, before.x / width, before.y / height);
  await expect.poll(dashed, { timeout: 20_000 }).toBe(true);
  await stopMoving(page);
  await page.waitForTimeout(300);
  await shot(page, 'spider-l10-shy');
  await expect.poll(async () => (await garden(page)).spiders[0].state, { timeout: 5000 }).toBe('playing');
  const after = (await garden(page)).spiders[0];
  expect(Math.hypot(after.x - before.x, after.y - before.y) / height).toBeGreaterThan(0.05);
  // Only once: now an open hand right on it doesn't send it off again, and closing catches it.
  await openOnSpider(page);
  expect((await garden(page)).spiders[0].state).toBe('playing');
  await handIs(page, 'fist');
  await expect.poll(async () => (await garden(page)).holding, { timeout: 15_000 }).toBe(true);
});

test('level 10: every place done still ends with everyone home', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 10));
  for (const [who, index] of [['giraffe', 0], ['mochi', 1], ['bramble', 2], ['frost', 3], ['giraffe', 4]]) {
    await expect.poll(async () => (await garden(page)).index, { timeout: 30_000 }).toBe(index);
    await storyIs(page, who);
    if (index === 2) {
      await page.waitForTimeout(800);
      await shot(page, 'spider-l10-honey');
    }
    await page.evaluate(() => {
      const { gathering } = window.__game;
      while (gathering.home < gathering.place.count) gathering.spiderHome();
    });
  }
  await waitForScreen(page, 'finish');
  await expect(page.locator('#screen-finish')).toContainText('Every spider is home!');
  await expect(page.locator('#level-done-text')).toHaveText('All 10 levels done!');
  expect((await garden(page)).home).toBe(19);
});

for (const level of [1, 6, 10]) {
  test(`nothing flashes at level ${level}: spiders moving, landing in webs, Giraffe clapping, and moving between places${level > 1 ? ', with berries, helpers and visitors' : ''}`, async ({ page }) => {
    test.setTimeout(240_000);
    await startPlaying(page, GAME, atLevel(GAME, level));
    await storyIs(page, 'giraffe');
    // A spider home every so often, the real way into the web, so the places go by meanwhile. From
    // level 2, berries hop out and are picked up, and the butterfly, basket and chest come and go.
    await page.evaluate((more) => {
      let turn = 0;
      window.__bringing = setInterval(() => {
        const { garden: place } = window.__game;
        const spider = place.moving === 0 && place.spiders.find((one) => place.catchable(one) || one.state === 'asleep');
        if (spider) place.bringHome(spider);
        if (!more || place.moving) return;
        turn += 1;
        const glove = place.gloves.right;
        for (let i = 0; i < 3; i += 1) place.dropBerry(place.width * (0.55 + i * 0.1), place.height * 0.6, { armed: true, spread: i - 1 });
        if (glove.visible && place.berries[0]) place.pickBerry(place.berries.shift());
        const { butterfly } = place.helpers;
        if (butterfly?.state === 'resting') Object.assign(butterfly, { state: 'helping', left: 6, from: { x: butterfly.x, y: butterfly.y }, flown: 0 });
        if (turn % 3 === 0) place.webGlow = { index: 0, life: 1.6 };
      }, 700);
    }, level > 1);
    const result = judgeBrightness(await watchBrightness(page, 420, CANVASES));
    const { index } = await garden(page);
    await page.evaluate(() => clearInterval(window.__bringing));
    console.log(`level ${level}`, JSON.stringify(result), 'place', index);
    if (level > 1) await shot(page, `spider-l${level}-busy`);
    expect(index).toBeGreaterThanOrEqual(1);
    expect(result.biggestStep).toBeLessThan(3);
    expect(result.flickeringShare).toBeLessThan(0.02);
  });
}

test('the garden is bright and friendly, not dark: the picture is light on average at every place', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, GAME, atLevel(GAME, 10));
  await storyIs(page, 'giraffe');
  const brightness = await page.evaluate(async () => {
    const { garden: place } = window.__game;
    const small = document.createElement('canvas');
    small.width = 32;
    small.height = 18;
    const context = small.getContext('2d', { willReadFrequently: true });
    const out = [];
    for (const name of ['gate', 'carrots', 'honey', 'pond', 'house']) {
      context.drawImage(place.sceneFor(name), 0, 0, 32, 18);
      const { data } = context.getImageData(0, 0, 32, 18);
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
      out.push(sum / (data.length / 4));
    }
    return out;
  });
  console.log('brightness', brightness.map(Math.round).join(', '));
  for (const value of brightness) expect(value).toBeGreaterThan(150);
});

test('level 10 with reduced motion: the web sways half as far', async ({ page }) => {
  test.setTimeout(150_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startPlaying(page, GAME, atLevel(GAME, 10));
  await storyIs(page, 'giraffe');
  const furthest = await page.evaluate(async () => {
    const { garden: place } = window.__game;
    const middle = place.across(0.38);
    let most = 0;
    for (let i = 0; i < 120; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      most = Math.max(most, Math.abs(place.web.x - middle) / place.height);
    }
    return most;
  });
  expect(furthest).toBeGreaterThan(0.003);
  expect(furthest).toBeLessThanOrEqual(0.0301);
  expect(await page.evaluate(() => window.__game.garden.reducedMotion)).toBe(true);
});
