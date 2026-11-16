// Swamp Splash is safe to look at and fits the screen: nothing flashes as the mud comes and goes, however much of
// it there is; on a laptop's screen and a bigger one nothing on the screen covers anything else; and it runs
// quickly enough with the window nearly all mud.
import { atLevel, expect, framesASecond, judge, lands, muddyTo, reachPlay, settled, shot, state, test, watchUntil } from './helpers.js';

const GENTLE = { swampRain: 'gentle' };
// Every square of the window showing what the rules say it is.
const SETTLED = '({ swamp, view }) => [...swamp.mud].every((mud, cell) => view.shown[cell] === (mud ? 1 : 0))';

/** Holds off what a level has that's slow to come, so that what's measured is only what the test brings. */
const holdOff = (page, ...things) => page.evaluate((names) => {
  const { swamp } = window.__game;
  for (const name of names) if (swamp[name]) swamp[name].in = 1e9;
}, things);

/** Reads the picture until the game gets somewhere, and says whether anything flashed on the way. */
async function steady(page, name, until, { after = 60, most = 3000, each = null } = {}) {
  const { reading, reached } = await watchUntil(page, until, { after, most, each });
  const judged = judge(reading);
  // Where the biggest step was, and what the rules said then, to tell what made it.
  const mean = reading.map(({ cells }) => cells.reduce((sum, value) => sum + value, 0) / cells.length);
  const at = mean.slice(1).reduce((most, value, n) => (Math.abs(value - mean[n]) > Math.abs(mean[most + 1] - mean[most]) ? n : most), 0) + 1;
  const { coverage, golden, state: then } = reading[at];
  console.log(name, JSON.stringify(judged), 'biggest step at frame', at, 'of', reading.length, JSON.stringify({ from: mean[at - 1], to: mean[at], coverage, golden, state: then, goldenBefore: reading[at - 1].golden, stateBefore: reading[at - 1].state }));
  expect(reached, `${name}: got there`).toBe(true);
  expect(judged.biggestStep, name).toBeLessThan(4);
  expect(judged.flickeringShare, name).toBeLessThan(0.01);
  return reading;
}

/* ---------- nothing flashes ---------- */

test('nothing flashes as the biggest jump there is lands on a clean window and its mud spreads', async ({ page }) => {
  await reachPlay(page, GENTLE);
  await steady(page, 'the biggest splash on a clean window', `(game) => game.swamp.stats.jumps >= 1 && (${SETTLED})(game)`, {
    each: '(n, { swamp }) => { if (n === 20) swamp.land(2.8); }',
  });
  expect((await state(page)).coverage).toBeGreaterThan(0.08);
});

test('nothing flashes through big jumps one after another, until the window is nearly all mud', async ({ page }) => {
  test.setTimeout(150_000);
  // Level 10, whose window has to be the muddiest: with its frogs and its golden mud.
  await reachPlay(page, atLevel(10, GENTLE));
  await holdOff(page, 'heron', 'shower', 'bubble', 'wind');
  const reading = await steady(page, 'big jumps until the window is nearly all mud', `(game) => game.swamp.coverage >= 0.78 && (${SETTLED})(game)`, {
    most: 4000,
    // A big jump every second, and small ones at the end, so as not to win.
    each: '(n, { swamp }) => { if (n % 60 === 30) swamp.land(swamp.coverage < 0.66 ? 2.8 : 1.2); }',
  });
  const end = await state(page);
  expect([end.state, end.stats.stars > 0]).toEqual(['play', true]);
  console.log('golden splashes on the way:', end.stats.stars, 'over', reading.length, 'frames');
  await shot(page, 'swamp-nearly-all-mud');
});

test('nothing flashes as a shower washes a strip of the window', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, atLevel(4, GENTLE));
  await holdOff(page, 'shower', 'bubble', 'heron');
  await muddyTo(page, 0.38);
  await settled(page);
  await page.evaluate(() => {
    window.__game.swamp.shower.in = 3.4;
  });
  await steady(page, 'a shower', `(game) => game.swamp.stats.showers >= 1 && !game.view.shower && (${SETTLED})(game)`);
});

test('nothing flashes as the heron flies in and wipes the window', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, atLevel(6, GENTLE));
  await holdOff(page, 'shower', 'bubble', 'heron');
  await muddyTo(page, 0.4);
  await settled(page);
  await page.evaluate(() => {
    window.__game.swamp.heron.in = 0;
  });
  await steady(page, 'the heron\'s wipe', `(game) => game.swamp.stats.wiped > 0 && !game.view.heron && (${SETTLED})(game)`, { most: 4000 });
});

test('nothing flashes as the window is won, and the card comes', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page);
  await muddyTo(page, 0.33, 1.1);
  await settled(page);
  await steady(page, 'winning', '(game) => game.screen === \'finish\'', {
    after: 90,
    each: '(n, { swamp }) => { if (n === 20) while (swamp.state === \'play\') swamp.land(2.2); }',
  });
});

test('nothing flashes as the rain cloud gets there and washes a window of plain mud, at level 1', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page);
  await muddyTo(page, 0.33, 1.1);
  await settled(page);
  await page.evaluate(() => {
    const { swamp } = window.__game;
    swamp.time = swamp.rules.seconds - 1;
  });
  await steady(page, 'the rain washing a window of plain mud', '(game) => game.screen === \'finish\'', { after: 60, most: 4000 });
  expect((await state(page)).muddy).toBe(0);
});

test('nothing flashes as the rain cloud gets there and washes a window that is nearly all mud', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, atLevel(10));
  await holdOff(page, 'heron', 'shower', 'bubble', 'wind');
  await muddyTo(page, 0.6, 2.2);
  await muddyTo(page, 0.78, 1.1);
  await settled(page);
  expect((await state(page)).coverage).toBeGreaterThan(0.76);
  await page.evaluate(() => {
    const { swamp } = window.__game;
    swamp.time = swamp.rules.seconds - 1;
  });
  await steady(page, 'the rain washing the window', '(game) => game.screen === \'finish\'', { after: 60, most: 4000 });
  expect((await state(page)).muddy).toBe(0);
});

/* ---------- it fits ---------- */

/** Where the pieces on top of the game are, as { name: { left, top, right, bottom } }, for those that are showing. */
const boxes = (page) => page.evaluate(() => {
  const found = {};
  const take = (name, selector) => {
    const element = document.querySelector(selector);
    const box = element?.getBoundingClientRect();
    if (box && box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== 'hidden') found[name] = { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
  };
  take('mud meter', '.chip-mud');
  take('golden chip', '#stars-chip');
  take('camera', '#camera-frame');
  take('film', '#coach');
  take('prompt', '#prompt');
  take('gear', '#open-panel');
  return { found, width: innerWidth, height: innerHeight };
});

/** Every pair of the boxes that overlap, and every box that isn't all on the screen. */
function clashes({ found, width, height }) {
  const names = Object.keys(found);
  const wrong = [];
  for (const name of names) {
    const box = found[name];
    if (box.left < 0 || box.top < 0 || box.right > width || box.bottom > height) wrong.push(`${name} is off the screen: ${JSON.stringify(box)}`);
  }
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      const [a, b] = [found[names[i]], found[names[j]]];
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) wrong.push(`${names[i]} and ${names[j]} overlap`);
    }
  }
  return wrong;
}

/**
 * The rounds the rain cloud is drawn as, as view.js draws them, with its outline, when it has come so far along its
 * way: from 0 at the start to 1 at the end.
 */
const cloudRounds = (page, along) => page.evaluate((share) => {
  const { width: w, height: h } = window.__game.view;
  const [x, y, size] = [w * (0.34 + (0.93 - 0.34) * share), h * 0.085, h * 0.045];
  const outline = Math.max(2, h * 0.004) / 2;
  return [[-0.9, 0.15, 0.62], [0, -0.22, 0.85], [0.95, 0.12, 0.66], [0.1, 0.3, 0.7]].map(([dx, dy, r]) => ({ x: x + dx * size, y: y + dy * size, r: r * size + outline }));
}, along);

/** Whether a round and a box share any of the screen. */
const touches = ({ x, y, r }, box) => Math.hypot(x - Math.max(box.left, Math.min(x, box.right)), y - Math.max(box.top, Math.min(y, box.bottom))) < r;

for (const viewport of [{ width: 1180, height: 820 }, { width: 1440, height: 900 }]) {
  test.describe(`at ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });

    test(`the mud meter, the camera's picture, the film and the prompt are all on the screen and cover nothing else, at ${viewport.width}×${viewport.height}`, async ({ page }) => {
      await reachPlay(page);
      await expect(page.locator('#coach')).toHaveClass(/is-visible/);
      await expect(page.locator('#prompt')).toHaveClass(/is-visible/);
      const first = await boxes(page);
      expect(Object.keys(first.found)).toEqual(expect.arrayContaining(['mud meter', 'camera', 'film', 'prompt', 'gear']));
      expect(clashes(first)).toEqual([]);
      await shot(page, `swamp-fit-${viewport.width}`);
    });

    test(`with the longest things asked, and the golden chip, nothing covers anything else either, at ${viewport.width}×${viewport.height}`, async ({ page }) => {
      await reachPlay(page, atLevel(7, GENTLE));
      await page.evaluate(() => {
        const { swamp } = window.__game;
        swamp.shower.in = 1e9;
        swamp.bubble.in = 1e9;
      });
      // The heron coming: the longest prompt there is.
      await lands(page, 1.2);
      await page.evaluate(() => {
        window.__game.swamp.heron.in = 0;
      });
      await expect(page.locator('#prompt-text')).toHaveText('Jump, and scare the heron away!', { timeout: 15_000 });
      const heron = await boxes(page);
      expect(Object.keys(heron.found)).toEqual(expect.arrayContaining(['mud meter', 'golden chip', 'camera', 'prompt', 'gear']));
      expect(clashes(heron)).toEqual([]);
      // And the film, with the longest words it says, after two jumps with knees that weren't bent.
      await lands(page, 1.2);
      await expect(page.locator('#coach-text')).toHaveText('Bend your knees, then jump!', { timeout: 15_000 });
      const knees = await boxes(page);
      expect(Object.keys(knees.found)).toEqual(expect.arrayContaining(['film', 'prompt']));
      expect(clashes(knees)).toEqual([]);
      await shot(page, `swamp-fit-long-${viewport.width}`);
    });

    test(`the rain cloud starts its way clear of the mud meter, at ${viewport.width}×${viewport.height}`, async ({ page }) => {
      await reachPlay(page);
      expect((await state(page)).cloud).toBeLessThan(0.05);
      const { found } = await boxes(page);
      const rounds = await cloudRounds(page, 0);
      expect(rounds.filter((round) => touches(round, found['mud meter']))).toEqual([]);
    });

    test(`the rain cloud starts its way clear of the golden chip too, from the level that brings it, at ${viewport.width}×${viewport.height}`, async ({ page }) => {
      await reachPlay(page, atLevel(7));
      const { found } = await boxes(page);
      expect(found['golden chip']).toBeTruthy();
      const rounds = await cloudRounds(page, 0);
      for (const name of ['mud meter', 'golden chip']) expect(rounds.filter((round) => touches(round, found[name])), name).toEqual([]);
    });

    test(`the rain cloud's way ends clear of the gear, at ${viewport.width}×${viewport.height}`, async ({ page }) => {
      await reachPlay(page);
      const { found } = await boxes(page);
      for (const along of [0.9, 0.95, 1]) {
        const rounds = await cloudRounds(page, along);
        expect(rounds.filter((round) => touches(round, found.gear)), `the cloud ${along} of the way along`).toEqual([]);
      }
    });
  });
}

/* ---------- quick enough ---------- */

test('it runs quickly enough with the window nearly all mud', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, atLevel(10, GENTLE));
  await holdOff(page, 'heron', 'shower', 'bubble');
  await muddyTo(page, 0.6, 2.2);
  await muddyTo(page, 0.78, 1.1);
  await settled(page);
  const { coverage } = await state(page);
  expect(coverage).toBeGreaterThan(0.76);
  await page.waitForTimeout(1000);
  const rate = await framesASecond(page, 4);
  console.log('frames a second with the window', Math.round(coverage * 100), '% mud:', rate);
  expect(rate).toBeGreaterThan(28);
  expect((await state(page)).screen).toBe('playing');
});
