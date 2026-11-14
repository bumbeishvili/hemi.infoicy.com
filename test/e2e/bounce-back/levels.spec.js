// Bounce Back's ten levels: what each brings is on the title card and under the countdown, each new thing
// comes along and works in the real game, and nothing flashes, at level 1 or at level 10 with all of it about.
import { expect, openGame, show, shot, test, waitForScreen } from '../helpers.js';
import { expectSoon, FIST, GAME, judge, OPEN, rally, startPlaying, steerHand, stopHand, watchBrightness } from './helpers.js';

const NEW_AT = {
  2: ['Stars to catch'],
  3: ['Bubble ball'],
  4: ['A flag for each hit', 'Trophies'],
  5: ['Big racket'],
  6: ['Sandcastles', 'Shells'],
  7: ['Rainbow ball'],
  8: ['Breeze'],
  9: ['Bluebird helper'],
  10: ['Golden ball', 'Gems'],
};
const atLevel = (level) => ({ levels: { [GAME]: level } });

test('the title card says what each level brings, and level 1 is the plain game', async ({ page }) => {
  await openGame(page, {}, GAME);
  await expect(page.locator('#level-badge')).toHaveText('Level 1 of 10');
  await expect(page.locator('#level-new')).toBeEmpty();
  for (const [level, names] of Object.entries(NEW_AT)) {
    await page.locator('#open-panel').click();
    await page.locator('#level-choice label', { hasText: new RegExp(`^\\s*${level}\\s*$`) }).click();
    await page.locator('#close-panel').click();
    await expect(page.locator('#level-badge')).toHaveText(`Level ${level} of 10`);
    for (const name of names) await expect(page.locator('#level-new')).toContainText(name);
  }
  await shot(page, 'bounce-title-level-10');
});

test('under the countdown it says what\'s new, in Georgian too', async ({ page }) => {
  await openGame(page, { language: 'ka', ...atLevel(6) }, GAME);
  await show(page, ...OPEN);
  await page.locator('#start').click();
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-new-now')).toContainText('ქვიშის ციხესიმაგრეები');
  await expect(page.locator('#level-now')).toHaveText('დონე 6');
});

test('level 2: stars float down on the child\'s side, and the glove catches one just by coming near, open or closed', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, atLevel(2));
  await expect(page.locator('.chip-prizes')).toBeVisible();
  await page.evaluate(() => {
    window.__game.rally.starIn = 0;
  });
  await expectSoon(async () => (await rally(page)).items.length).toBe(1);
  const [star] = (await rally(page)).items;
  expect(star.kind).toBe('star');
  expect(star.u).toBeLessThan(0);
  await steerHand(page, { target: { u: star.u, h: star.h }, photo: 'fist' });
  await expectSoon(async () => (await rally(page)).prizes.star).toBe(1);
  await expect(page.locator('#chip-prizes')).toHaveText('1', { timeout: 5000 });
  await stopHand(page);
});

test('level 3: every third point has the bubble ball, which floats more slowly', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, atLevel(3));
  await page.evaluate(() => {
    const { rally: game } = window.__game;
    game.point = 2;
    game.startPoint();
  });
  expect((await rally(page)).ball.kind).toBe('bubble');
  const speeds = await page.evaluate(() => {
    const { rally: game } = window.__game;
    return { bubble: game.envFor('bubble').gravity, beach: game.envFor('beach').gravity };
  });
  expect(speeds.bubble).toBeLessThan(speeds.beach);
  await steerHand(page);
  await expectSoon(async () => (await rally(page)).hits.A).toBeGreaterThanOrEqual(1);
  await shot(page, 'bounce-bubble-ball');
  await stopHand(page);
});

test('level 4: each hit colours in a flag, and a full row gives a trophy', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, atLevel(4));
  expect(await page.evaluate(() => window.__game.court.flags.count)).toBe(8);
  await page.evaluate(() => {
    window.__game.rally.flagsLit = 7;
  });
  await steerHand(page);
  await expectSoon(async () => (await rally(page)).prizes.trophy).toBe(1);
  expect((await rally(page)).flagsLit).toBe(0);
  await stopHand(page);
});

test('level 5: the big racket comes in a bubble, and makes the racket bigger while the hand is open', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, atLevel(5));
  const before = (await rally(page)).racket.radius;
  await page.evaluate(() => {
    window.__game.rally.powerIn = 0;
  });
  await expectSoon(async () => (await rally(page)).items.some(({ kind }) => kind === 'big')).toBe(true);
  const bubble = (await rally(page)).items.find(({ kind }) => kind === 'big');
  await steerHand(page, { target: { u: bubble.u, h: bubble.h } });
  await expectSoon(async () => (await rally(page)).power?.kind).toBe('big');
  await expectSoon(async () => (await rally(page)).racket.radius).toBeGreaterThan(before * 1.3);
  await shot(page, 'bounce-big-racket');
  await stopHand(page);
});

test('level 6: a shot that lands on a sandcastle knocks it over gently, for a shell', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, atLevel(6));
  expect((await rally(page)).castles.length).toBe(2);
  await steerHand(page);
  await expectSoon(async () => (await rally(page)).prizes.shell, { timeout: 120_000 }).toBeGreaterThanOrEqual(1);
  expect((await rally(page)).castles.some(({ standing }) => !standing)).toBe(true);
  await page.waitForTimeout(400);
  await shot(page, 'bounce-sandcastle');
  await stopHand(page);
});

test('level 7: the rainbow ball leaves a soft trail, and each hit with it gives a star', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, atLevel(7));
  await page.evaluate(() => {
    const { rally: game } = window.__game;
    game.point = 2;
    game.startPoint();
  });
  expect((await rally(page)).ball.kind).toBe('rainbow');
  await steerHand(page);
  await expectSoon(async () => (await rally(page)).prizes.star).toBeGreaterThanOrEqual(1);
  await expectSoon(() => page.evaluate(() => window.__game.court.trail.length)).toBeGreaterThan(2);
  await shot(page, 'bounce-rainbow-ball');
  await stopHand(page);
});

test('level 8: a breeze blows the ball gently one way and then the other, and the windsock shows which', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, atLevel(8));
  expect(await page.evaluate(() => window.__game.court.breeze)).toBe(true);
  const winds = [];
  for (let i = 0; i < 4; i += 1) {
    winds.push(await page.evaluate(() => window.__game.rally.wind));
    await page.evaluate(() => {
      window.__game.rally.time += 7;
    });
    await page.waitForTimeout(100);
  }
  expect(Math.max(...winds)).toBeGreaterThan(0);
  expect(Math.min(...winds)).toBeLessThan(0);
  await steerHand(page);
  await expectSoon(async () => (await rally(page)).hits.A).toBeGreaterThanOrEqual(1);
  await stopHand(page);
});

test('level 9: the bluebird comes in a bubble, and bops a ball that would bounce twice back up to the hand', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, { ...atLevel(9), bounceHard: 'medium' });
  await page.evaluate(() => {
    window.__game.rally.powerIn = 0;
  });
  await expectSoon(async () => (await rally(page)).items.some(({ kind }) => kind === 'bird')).toBe(true);
  const bubble = (await rally(page)).items.find(({ kind }) => kind === 'bird');
  await steerHand(page, { target: { u: bubble.u, h: bubble.h } });
  await expectSoon(async () => (await rally(page)).power?.kind).toBe('bird');
  await expectSoon(() => page.evaluate(() => Boolean(window.__game.court.bird))).toBe(true);
  await page.evaluate(() => {
    window.__game.rally.power.left = 60;
  });
  // Now the child tries and misses, and the bird saves it.
  await steerHand(page, { target: 'dodge' });
  await expectSoon(() => page.evaluate(() => window.__game.rally.stats.saves), { timeout: 90_000 }).toBeGreaterThanOrEqual(1);
  expect((await rally(page)).scores.B).toBe(0);
  await shot(page, 'bounce-bluebird');
  await stopHand(page);
});

test('level 10: the child\'s last point is the golden ball, and hitting it gives a gem', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, { ...atLevel(10), bouncePoints: 5 });
  await page.evaluate(() => {
    const { rally: game } = window.__game;
    game.scores.A = 4;
    game.startPoint();
  });
  expect((await rally(page)).ball.kind).toBe('golden');
  await steerHand(page);
  await expectSoon(async () => (await rally(page)).prizes.gem).toBeGreaterThanOrEqual(1);
  await shot(page, 'bounce-golden-ball');
  await stopHand(page);
});

// Nothing flashes: the whole picture's brightness, frame by frame, through serves, hits, bounces and points,
// and at level 10 with stars, a power-up, flags, falling sandcastles, the breeze and a special ball about.
for (const level of [1, 10]) {
  test(`nothing flashes at level ${level}: the brightness stays steady through play`, async ({ page }) => {
    test.setTimeout(300_000);
    await startPlaying(page, { ...atLevel(level), bouncePace: 'fast', bounceHelp: 'lots' });
    await steerHand(page);
    await expectSoon(async () => (await rally(page)).hits.A).toBeGreaterThanOrEqual(1);
    if (level === 10) {
      await page.evaluate(() => {
        const { rally: game } = window.__game;
        game.starIn = 0;
        game.powerIn = 0;
        game.flagsLit = 5;
        game.point = 2;
      });
    }
    const result = judge(await watchBrightness(page, 300));
    console.log(`level ${level}`, 'playing', JSON.stringify(result));
    expect(result.biggestStep).toBeLessThan(4);
    expect(result.flickeringShare).toBeLessThan(0.01);
    expect(result.brightness).toBeGreaterThan(120);
    if (level === 10) {
      const seen = await rally(page);
      expect(seen.hits.A).toBeGreaterThanOrEqual(2);
    }
    await stopHand(page);
  });

  test(`nothing flashes at level ${level}: a hand opening and closing as fast as it can doesn't flicker the racket`, async ({ page }) => {
    test.setTimeout(240_000);
    await startPlaying(page, atLevel(level));
    // Quicker than any child, and quicker than the tracker can follow.
    await page.evaluate(() => {
      let open = true;
      window.__flip = setInterval(() => {
        open = !open;
        window.__camera.show({ left: null, right: open ? 'open' : 'fist', scale: 0.7 });
      }, 220);
    });
    const result = judge(await watchBrightness(page, 240));
    console.log(`level ${level}`, 'opening and closing', JSON.stringify(result));
    await page.evaluate(() => clearInterval(window.__flip));
    expect(result.biggestStep).toBeLessThan(4);
    // What changes is the glove copying the hand, its fingers out and then in, four times a second. The
    // strings come and go at a steady rate, and the character doesn't step for every little move of the hand.
    expect(result.flickeringShare).toBeLessThan(0.04);
  });
}

test('a resting child keeps the stars and power-ups: a power-up\'s time only runs while the hand is open', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, atLevel(5));
  await page.evaluate(() => {
    window.__game.rally.power = { kind: 'big', left: 8, seconds: 8 };
  });
  await show(page, ...FIST);
  await expectSoon(async () => (await rally(page)).racket.open).toBe(false);
  const left = (await rally(page)).power.left;
  expect(left).toBeGreaterThan(7);
  await page.waitForTimeout(4000);
  expect((await rally(page)).power?.left).toBe(left);
});
