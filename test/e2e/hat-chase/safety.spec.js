// Hat Chase is safe to look at, keeps the camera picture on this computer, and fits the screen: nothing flashes as the
// land goes by or as the character leaps, ducks, tumbles, bounces or picks apples, nor as a game starts and ends; no
// request leaves the computer and the camera is let go at the end; and on a laptop's screen, a bigger one, and very
// narrow, wide or short windows, nothing on the screen hides the character, the magpie or what's in the way.
import {
  GENTLE, atLevel, boxes, bringToTheEnd, drawnBox, expect, expectSoon, judge, openChase, overlap, pathWith, reachPlay, shot,
  standInView, state, test, waitForScreen, walkUnderATree, walkUpTo, watchUntil,
} from './helpers.js';

/** Reads the picture until the game gets somewhere, and says whether anything flashed on the way. */
async function steady(page, name, until, { after = 60, most = 3000, each = null } = {}) {
  const { reading, reached } = await watchUntil(page, until, { after, most, each });
  const judged = judge(reading);
  // Where the biggest step was, and what the rules said then, to tell what made it.
  const mean = reading.map(({ cells }) => cells.reduce((sum, value) => sum + value, 0) / cells.length);
  const at = mean.slice(1).reduce((most, value, n) => (Math.abs(value - mean[n]) > Math.abs(mean[most + 1] - mean[most]) ? n : most), 0) + 1;
  const { screen, mode, x, state: then } = reading[at];
  console.log(name, JSON.stringify(judged), 'biggest step at frame', at, 'of', reading.length, JSON.stringify({ from: mean[at - 1], to: mean[at], screen, mode, x, state: then, screenBefore: reading[at - 1].screen }));
  expect(reached, `${name}: got there`).toBe(true);
  expect(judged.biggestStep, name).toBeLessThan(4);
  expect(judged.flickeringShare, name).toBeLessThan(0.01);
  return judged;
}

const LEVEL_10 = atLevel(10, { ...GENTLE, chaseLength: 18 });
const HAS = (kind) => `(chase) => chase.course.some(({ kind }) => kind === '${kind}')`;
// A path with one thing of a kind, and another of a second kind after it.
const THEN = (first, then) => `(chase) => {
  const at = chase.course.findIndex(${first});
  return at >= 0 && chase.course.some((thing) => thing.index > at && (${then})(thing));
}`;
const SQUAT = "({ needs }) => needs === 'squat'";
const COMES_AT = '({ fuse }) => fuse !== undefined';
const STREAM = "({ kind }) => kind === 'stream'";

/* ---------- nothing flashes, at level 10 ---------- */

test('nothing flashes as the land goes by under a child marching, at level 10', async ({ page }) => {
  await reachPlay(page, LEVEL_10);
  await steady(page, 'walking', '({ chase }) => chase.stats.steps >= 5 && chase.hero.mode === \'stand\'', {
    each: '(n, { chase }) => { if (n % 26 === 0) chase.step(n % 52 ? \'right\' : \'left\'); }',
  });
});

test('nothing flashes as the character leaps a stream with a big jump and catches the golden feather, at level 10', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, LEVEL_10);
  await pathWith(page, HAS('stream'));
  await walkUpTo(page, 'stream');
  await steady(page, 'a big leap', '({ chase }) => chase.stats.feathers >= 1 && chase.hero.mode === \'stand\'', {
    each: '(n, { chase }) => { if (n === 20) chase.jump(2.2); }',
  });
});

test('nothing flashes as the character ducks, and as it tumbles when something comes at it, at level 10', async ({ page }) => {
  test.setTimeout(180_000);
  await reachPlay(page, LEVEL_10);
  await pathWith(page, THEN(SQUAT, COMES_AT));
  await walkUpTo(page, `(${SQUAT})`);
  await steady(page, 'a duck', '({ chase }) => chase.stats.squats >= 1 && chase.hero.mode === \'stand\'', {
    each: '(n, { chase }) => { if (n === 20) chase.squat(); }',
    after: 40,
  });
  await walkUpTo(page, `(${COMES_AT})`);
  await steady(page, 'a tumble', '({ chase }) => chase.stats.tumbles >= 1 && chase.hero.mode === \'stand\'', { most: 1500 });
});

test('nothing flashes as the character bounces off a springboard in a star jump and the arc of stars goes, at level 10', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, LEVEL_10);
  await pathWith(page, HAS('spring'));
  await walkUpTo(page, 'spring');
  await steady(page, 'a springboard bounce', '({ chase }) => chase.stats.starJumps >= 1 && chase.hero.mode === \'stand\'', {
    each: '(n, { chase }) => { if (n === 20) chase.jump(1.6, { star: true }); }',
  });
});

test('nothing flashes as the apples come down, at level 10', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, LEVEL_10);
  await pathWith(page, '(chase) => chase.trees.length > 0');
  expect(await walkUnderATree(page)).not.toBe(null);
  await steady(page, 'apples coming down', '({ chase, view }) => chase.stats.apples >= 3 && view.effects.length === 0', {
    each: '(n, { chase }) => { if (n === 20) chase.reach(); }',
  });
});

test('nothing flashes from the chooser, through the check and the countdown, to the chase, at level 10', async ({ page }) => {
  test.setTimeout(150_000);
  await openChase(page, LEVEL_10);
  await standInView(page);
  await page.locator('#start').click();
  await waitForScreen(page, 'choose');
  await expectSoon(() => page.evaluate(() => window.__game.view.place)).toBe(0.5);
  await steady(page, 'the chooser to the chase', '({ game, view }) => game.screen === \'playing\' && view.place === 0.24', {
    each: '(n) => { if (n === 10) document.getElementById(\'chase-start\').click(); }',
    most: 4000,
  });
});

test('nothing flashes as the hat comes down at the end and the card comes, at level 10', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, atLevel(10, { chaseLength: 8 }));
  await bringToTheEnd(page, 1.5);
  await steady(page, 'the hat coming down', '({ game, view }) => game.screen === \'finish\' && view.place === 0.12', {
    each: '(n, { chase }) => { if (n === 10 || n === 20) chase.step(n === 10 ? \'left\' : \'right\'); }',
    most: 4000,
  });
  expect((await state(page)).stats.cup).toBe(true);
  await shot(page, 'hat-end-10');
});

test('nothing flashes as the magpie gets away and the card says so, at level 10', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, atLevel(10));
  await steady(page, 'the magpie getting away', '({ game }) => game.screen === \'finish\'', {
    each: '(n, { chase }) => { if (n === 10) chase.magpie.x = chase.hero.x + 23.8; }',
    most: 4000,
  });
  expect((await state(page)).state).toBe('lost');
});

test('with reduced motion nothing flashes either, walking, leaping, tumbling or at the end, and the chase still works', async ({ page }) => {
  test.setTimeout(240_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await reachPlay(page, LEVEL_10);
  expect(await page.evaluate(() => window.__game.view.reducedMotion)).toBe(true);
  await pathWith(page, THEN(STREAM, COMES_AT));
  await steady(page, 'walking, with reduced motion', '({ chase }) => chase.station !== null', {
    each: '(n, { chase }) => { if (n % 26 === 0) chase.step(n % 52 ? \'right\' : \'left\'); }',
  });
  await walkUpTo(page, 'stream');
  await steady(page, 'a big leap, with reduced motion', '({ chase }) => chase.stats.big >= 1 && chase.hero.mode === \'stand\'', {
    each: '(n, { chase }) => { if (n === 20) chase.jump(2.2); }',
  });
  await walkUpTo(page, `(${COMES_AT})`);
  await steady(page, 'a tumble, with reduced motion', '({ chase }) => chase.stats.tumbles >= 1 && chase.hero.mode === \'stand\'', { most: 1500 });
  await bringToTheEnd(page, 1.5);
  await steady(page, 'the end, with reduced motion', '({ game, view }) => game.screen === \'finish\' && view.place === 0.12', {
    each: '(n, { chase }) => { if (n === 10 || n === 20) chase.step(n === 10 ? \'left\' : \'right\'); }',
    most: 4000,
  });
});

/* ---------- the camera picture stays here ---------- */

test('the game makes no requests off this computer, and the page refuses to', async ({ page, baseURL, pageErrors }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await reachPlay(page, GENTLE);
  await page.evaluate(() => window.__game.chase.step('left'));
  await page.waitForTimeout(1500);
  const offsite = requests.filter((url) => !url.startsWith(baseURL) && !url.startsWith('data:') && !url.startsWith('blob:'));
  expect(offsite).toEqual([]);
  const blocked = await page.evaluate(async () => {
    try {
      await fetch('https://example.com/upload', { method: 'POST', body: 'picture' });
      return false;
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);
  await expect.poll(() => pageErrors.join('\n')).toContain("violates the following Content Security Policy directive: \"connect-src 'self'");
  pageErrors.length = 0;
});

test('the camera is let go when a chase ends, won or lost, and the panel says what to keep the child safe', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, atLevel(1, { chaseLength: 8 }));
  // The grown-ups' panel: room to move, a floor that isn't slippery, someone close by, and not a medical device.
  await page.locator('#open-panel').click();
  await expect(page.locator('.panel-lead')).toContainText('Marching and jumping need room: clear the floor, and stay close by.');
  await expect(page.locator('#panel .small-print')).toContainText('These games are not medical devices');
  await expect(page.locator('#panel .small-print')).toContainText('Stop if anything hurts, or if balance is a worry.');
  await page.locator('#close-panel').click();
  await expect(page.locator('#panel')).toBeHidden();
  expect(await page.evaluate(() => window.__camera.activeTracks)).toBeGreaterThan(0);
  await page.evaluate(() => {
    window.__game.chase.magpie.x = window.__game.chase.hero.x + 23.9;
  });
  await waitForScreen(page, 'finishing');
  expect(await page.evaluate(() => window.__camera.activeTracks)).toBe(0);
  await waitForScreen(page, 'finish');
  await page.locator('#chase-again').click();
  await waitForScreen(page, 'playing');
  expect(await page.evaluate(() => window.__camera.activeTracks)).toBeGreaterThan(0);
  await bringToTheEnd(page, 0.5);
  await page.evaluate(() => window.__game.chase.step('left'));
  await waitForScreen(page, 'finishing');
  expect(await page.evaluate(() => window.__camera.activeTracks)).toBe(0);
  await waitForScreen(page, 'finish');
  expect(await page.evaluate(() => window.__camera.activeTracks)).toBe(0);
});

/* ---------- it fits ---------- */

/**
 * Where the character, the magpie and the thing the character stands at are drawn on the canvas: only what's on and
 * above the path of the thing, as water running on down the screen is only more of it.
 */
const drawn = (page) => page.evaluate(() => window.__game.chase?.station?.index ?? null).then(async (station) => {
  const found = { character: await drawnBox(page, 'drawHero'), magpie: await drawnBox(page, 'drawMagpie') };
  if (station !== null) {
    const { ground, metre } = await state(page);
    const parts = [await drawnBox(page, 'drawThing', station), await drawnBox(page, 'drawInFront', station)].filter(Boolean);
    if (parts.length) {
      found['the thing in the way'] = {
        left: Math.min(...parts.map(({ left }) => left)),
        right: Math.max(...parts.map(({ right }) => right)),
        top: Math.min(...parts.map(({ top }) => top)),
        bottom: Math.min(ground + metre * 0.2, Math.max(...parts.map(({ bottom }) => bottom))),
      };
    }
  }
  return found;
});

/** Everything that hides something else: a piece on top covering what's drawn, pieces on top of each other, or off the screen. */
async function hidden(page, when) {
  const pieces = await boxes(page);
  const things = await drawn(page);
  const { width, height } = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const wrong = [];
  for (const [name, box] of Object.entries({ ...pieces, ...things })) {
    if (!box) {
      wrong.push(`${when}: the ${name} isn't drawn`);
      continue;
    }
    if (box.left < -1 || box.top < -1 || box.right > width + 1 || box.bottom > height + 1) wrong.push(`${when}: the ${name} is off the screen: ${JSON.stringify(box)}`);
  }
  const names = Object.keys(pieces);
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) if (overlap(pieces[names[i]], pieces[names[j]])) wrong.push(`${when}: the ${names[i]} and the ${names[j]} overlap`);
  }
  for (const [name, box] of Object.entries(things)) {
    for (const [piece, over] of Object.entries(pieces)) if (box && overlap(box, over)) wrong.push(`${when}: the ${piece} covers the ${name}: ${JSON.stringify(over)} over ${JSON.stringify(box)}`);
  }
  return wrong;
}

const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 620, height: 820 },
  { width: 2400, height: 800 },
  { width: 1100, height: 520 },
];

for (const viewport of VIEWPORTS) {
  test.describe(`at ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });

    test(`at ${viewport.width}×${viewport.height}, the stars, the magpie chip, the path bar, the camera's picture, the film and the prompt cover nothing, and nothing covers the character, the magpie or what's in the way`, async ({ page }) => {
      test.setTimeout(180_000);
      await reachPlay(page, atLevel(6, GENTLE));
      await expect(page.locator('#coach')).toHaveClass(/is-visible/);
      await expect(page.locator('#prompt')).toHaveClass(/is-visible/);
      await expectSoon(async () => (await state(page)).place).toBe(0.24);
      const wrong = await hidden(page, 'at the start');
      // The gentle magpie gone on to where it waits, with marching still asked for, in the longest words the film has.
      await expectSoon(async () => (await state(page)).lead, { timeout: 20_000 }).toBeGreaterThan(11.99);
      await expect(page.locator('#coach-text')).toHaveText('March on the spot to walk!');
      wrong.push(...(await hidden(page, 'the gentle magpie waiting')));
      await shot(page, `hat-fit-waiting-${viewport.width}`);
      // At the springboard, the longest thing in the way, with the film asking for a star jump.
      await walkUpTo(page, 'spring');
      await expect(page.locator('#coach-text')).toHaveText('Do a star jump!');
      await expect(page.locator('#prompt-text')).toHaveText('Do a star jump!');
      await expectSoon(async () => {
        const { camera, hero } = await state(page);
        return Math.abs(camera - hero.x);
      }).toBeLessThan(0.01);
      wrong.push(...(await hidden(page, 'at a springboard')));
      await shot(page, `hat-fit-spring-${viewport.width}`);
      // The magpie as far ahead as it ever is, with the film showing.
      await page.evaluate(() => {
        const { chase } = window.__game;
        chase.magpie.x = chase.hero.x + 23;
        window.__game.game.paused = true;
      });
      await page.waitForTimeout(200);
      wrong.push(...(await hidden(page, 'the magpie 23 metres ahead')));
      await shot(page, `hat-fit-far-${viewport.width}`);
      console.log(`at ${viewport.width}×${viewport.height}:`, JSON.stringify(await boxes(page)));
      expect(wrong).toEqual([]);
    });
  });
}

/* ---------- quick enough ---------- */

test('it runs quickly enough on a big screen at level 10, marching along with things in the way', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await reachPlay(page, LEVEL_10);
  const rate = await page.evaluate(() => new Promise((done) => {
    const { chase } = window.__game;
    let frames = 0;
    const started = performance.now();
    const timer = setInterval(() => chase.step('left'), 430);
    const count = () => {
      frames += 1;
      if (performance.now() - started > 4000) {
        clearInterval(timer);
        done(frames / 4);
      } else requestAnimationFrame(count);
    };
    requestAnimationFrame(count);
  }));
  console.log('frames a second, marching at level 10 on a 1920×1080 screen:', rate);
  expect(rate).toBeGreaterThan(28);
});
