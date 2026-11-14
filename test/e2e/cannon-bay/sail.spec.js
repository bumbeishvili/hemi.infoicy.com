// Cannon Bay, with real photos of a hand going through the real tracker.
import { expect, hands, screenName, shot, show, test, waitForHand, waitForScreen } from '../helpers.js';
import { battleState, beatPirates, expectSoon, handAt, holdPirate, letPirateGo, sailTowardsPirates, startPlaying, stopSailing } from './helpers.js';

const SHIP_MOVED = 5;

test('an open hand raises the sails and the ship moves, and a closed one lowers them and slows it', async ({ page }) => {
  await startPlaying(page, { bayShips: 4 });
  await expectSoon(async () => (await battleState(page)).sails).toBeGreaterThan(0.6);
  await expectSoon(async () => (await battleState(page)).speed).toBeGreaterThan(10);
  const going = await battleState(page);
  await page.waitForTimeout(1200);
  const later = await battleState(page);
  expect(Math.hypot(later.x - going.x, later.z - going.z)).toBeGreaterThan(SHIP_MOVED);
  await shot(page, 'c-sails-up');

  await handAt(page, 0, 'fist');
  await waitForHand(page, 'closed');
  await expectSoon(async () => (await battleState(page)).sails).toBeLessThan(0.1);
  const { speed } = await battleState(page);
  await expectSoon(async () => (await battleState(page)).speed).toBeLessThan(later.speed * 0.45);
  expect(speed).toBeGreaterThan(0);
  await expect(page.locator('#prompt-text')).toHaveText('Open your hand to raise the sails!', { timeout: 10_000 });
  await shot(page, 'c-sails-down');
});

test('a wider hand goes faster than a hand only just open', async ({ page }) => {
  await startPlaying(page, { bayShips: 4, strictness: { left: 0.5, right: 0.5 } });
  await holdPirate(page, { off: Math.PI, away: 600 });
  await expectSoon(async () => (await battleState(page)).speed).toBeGreaterThan(14);
  await page.waitForTimeout(2500);
  const wide = (await hands(page)).drive;
  const wideSails = (await battleState(page)).sails;
  await handAt(page, 0, 'relaxed');
  await expectSoon(async () => (await hands(page)).drive).toBeLessThan(wide - 0.02);
  await expect.poll(async () => (await hands(page)).handOpen, { timeout: 10_000 }).toBe(true);
  await page.waitForTimeout(1500);
  const { sails } = await battleState(page);
  expect(sails).toBeLessThan(wideSails);
  expect(sails).toBeGreaterThan(0.4);
  await letPirateGo(page);
});

test('moving the hand side to side turns the wheel and the ship, each way', async ({ page }) => {
  await startPlaying(page, { bayShips: 4 });
  await holdPirate(page, { off: Math.PI, away: 600 });
  await page.waitForTimeout(800);
  // The child's right, and the mirror's right.
  await handAt(page, 170);
  await expectSoon(async () => (await hands(page)).steer).toBeGreaterThan(0.6);
  await expectSoon(async () => (await battleState(page)).wheel).toBeGreaterThan(0.6);
  const before = (await battleState(page)).heading;
  await page.waitForTimeout(1200);
  const right = await battleState(page);
  expect(right.heading).toBeGreaterThan(before + 0.2);
  const shown = await page.locator('#ship-wheel-turn').evaluate((node) => node.style.transform);
  expect(Number(shown.match(/-?\d+/)[0])).toBeGreaterThan(60);
  await shot(page, 'c-wheel-right');

  await handAt(page, -170);
  await expectSoon(async () => (await hands(page)).steer).toBeLessThan(-0.6);
  await expectSoon(async () => (await battleState(page)).wheel).toBeLessThan(-0.6);
  const middle = (await battleState(page)).heading;
  await page.waitForTimeout(1200);
  expect((await battleState(page)).heading).toBeLessThan(middle - 0.2);
  await shot(page, 'c-wheel-left');
  await letPirateGo(page);
});

test('a pirate in a firing zone gets fired at with an open hand, and that zone glows green', async ({ page }) => {
  await startPlaying(page, { bayShips: 4 });
  await holdPirate(page, { off: Math.PI * 0.4, away: 95 });
  await expectSoon(async () => (await battleState(page)).zones.right.firing).toBe(true);
  await expectSoon(async () => (await battleState(page)).stats.hits).toBeGreaterThan(2);
  const state = await battleState(page);
  expect(state.zones.left.firing).toBe(false);
  await expect.poll(() => page.evaluate(() => {
    const { r, g, b } = window.__game.bay.zones.right.colour;
    return g > r * 2 && g > b * 1.5;
  }), { timeout: 5000 }).toBe(true);
  await shot(page, 'c-firing-right');

  await holdPirate(page, { off: -Math.PI * 0.4, away: 95 });
  await expectSoon(async () => (await battleState(page)).zones.left.firing).toBe(true);
  await page.waitForTimeout(1500);
  await shot(page, 'c-firing-left');
  await letPirateGo(page);
});

test('a closed hand doesn\'t fire', async ({ page }) => {
  await startPlaying(page, { bayShips: 4 });
  await handAt(page, 0, 'fist');
  await waitForHand(page, 'closed');
  await holdPirate(page, { off: Math.PI * 0.4, away: 95 });
  await page.waitForTimeout(400);
  const { shots } = (await battleState(page)).stats;
  await page.waitForTimeout(2500);
  const state = await battleState(page);
  expect(state.stats.shots).toBe(shots);
  expect(state.zones.right.inside).toBe(true);
  expect(state.zones.right.firing).toBe(false);
  await shot(page, 'c-closed-no-fire');
  await letPirateGo(page);
});

test('set to always, a closed hand fires, but a hand out of view doesn\'t', async ({ page }) => {
  await startPlaying(page, { bayShips: 4, bayCannons: 'always' });
  await handAt(page, 0, 'fist');
  await waitForHand(page, 'closed');
  await holdPirate(page, { off: Math.PI * 0.4, away: 95 });
  await expectSoon(async () => (await battleState(page)).stats.shots).toBeGreaterThan(2);
  await page.evaluate(() => window.__camera.show({ left: null, right: null }));
  await waitForHand(page, 'missing');
  await page.waitForTimeout(400);
  const { shots } = (await battleState(page)).stats;
  await page.waitForTimeout(2000);
  expect((await battleState(page)).stats.shots).toBe(shots);
  await letPirateGo(page);
});

test('a hand out of view does nothing: no sails, no wheel and no cannons', async ({ page }) => {
  await startPlaying(page, { bayShips: 4 });
  await holdPirate(page, { off: Math.PI * 0.4, away: 95 });
  await expectSoon(async () => (await battleState(page)).stats.shots).toBeGreaterThan(0);
  await page.evaluate(() => window.__camera.show({ left: null, right: null }));
  await waitForHand(page, 'missing');
  await expectSoon(async () => (await battleState(page)).sails).toBeLessThan(0.1);
  const { shots } = (await battleState(page)).stats;
  await page.waitForTimeout(1500);
  const state = await battleState(page);
  expect(state.stats.shots).toBe(shots);
  expect(Math.abs(state.wheel)).toBeLessThan(0.05);
  await expect(page.locator('#prompt-text')).toHaveText('Show your right hand!', { timeout: 10_000 });
  await shot(page, 'c-hand-gone');
  await letPirateGo(page);
});

test('a hand half out of the picture or too far away can\'t fire either', async ({ page }) => {
  await startPlaying(page, { bayShips: 4, bayCannons: 'always' });
  await holdPirate(page, { off: Math.PI * 0.4, away: 95 });
  await expectSoon(async () => (await battleState(page)).stats.shots).toBeGreaterThan(0);
  await show(page, null, 'open', { rightOffsetX: 290 });
  await expect.poll(async () => (await hands(page)).right.reason, { timeout: 15_000 }).toBe('edge');
  await page.waitForTimeout(400);
  const { shots } = (await battleState(page)).stats;
  await page.waitForTimeout(1500);
  expect((await battleState(page)).stats.shots).toBe(shots);
  await letPirateGo(page);
});

test('a cannonball that lands on the ship costs a heart, which shows, and comes back', async ({ page }) => {
  await startPlaying(page, { bayShips: 4 });
  await holdPirate(page, { off: Math.PI, away: 600 });
  const { hearts } = await battleState(page);
  expect(hearts).toBe(5);
  await page.evaluate(() => {
    const { battle } = window.__game;
    battle.balls.push({ from: { x: battle.x, y: 6, z: battle.z }, to: { x: battle.x, z: battle.z }, t: 0.98, seconds: 3, arc: 30, x: battle.x, y: 5, z: battle.z, harmless: false, pirate: null });
  });
  await expectSoon(async () => (await battleState(page)).hearts).toBe(4);
  await expect(page.locator('#hearts')).toHaveText('♥♥♥♥♡');
  await shot(page, 'c-hurt');
  await expect.poll(async () => (await battleState(page)).hearts, { timeout: 15_000 }).toBe(5);
  await expect(page.locator('#hearts')).toHaveText('♥♥♥♥♥');
  await letPirateGo(page);
});

test('on Gentle the child can\'t lose: hearts stop at one', async ({ page }) => {
  await startPlaying(page, { bayShips: 4, bayLevel: 'gentle' });
  await page.evaluate(() => {
    const { battle } = window.__game;
    for (let i = 0; i < 8; i += 1) battle.hurt({ to: { x: battle.x, z: battle.z } });
  });
  const state = await battleState(page);
  expect(state.hearts).toBe(1);
  expect(state.state).toBe('sailing');
  expect(await page.evaluate(() => window.__game.screen)).toBe('playing');
});

test('on the harder settings it ends kindly, with a way to go again straight away', async ({ page }) => {
  await startPlaying(page, { bayShips: 4, bayLevel: 'medium' });
  await page.evaluate(() => {
    const { battle } = window.__game;
    for (let i = 0; i < 5; i += 1) battle.hurt({ to: { x: battle.x, z: battle.z } });
  });
  await waitForScreen(page, 'finish');
  await expect(page.locator('#screen-finish h2')).toHaveText('So close! Sail again!');
  await expect(page.locator('#play-again')).toHaveText('Try again');
  await page.waitForTimeout(500);
  await shot(page, 'c-so-close');
  await page.locator('#play-again').click();
  await waitForScreen(page, 'playing');
  const state = await battleState(page);
  expect(state.hearts).toBe(5);
  expect(state.state).toBe('sailing');
});

test('resting stops the firing: with a hand gone, or closed for a few seconds, the pirates sail in circles', async ({ page }) => {
  await startPlaying(page, { bayShips: 4 });
  await expectSoon(async () => (await battleState(page)).pirates.length).toBe(3);
  await page.evaluate(() => {
    const { battle } = window.__game;
    window.__ballsFired = 0;
    const real = battle.onEvent;
    battle.onEvent = (event) => {
      if (event.type === 'pirate-fire') window.__ballsFired += 1;
      real(event);
    };
    // Something in the air, right on the ship, when the rest begins.
    battle.balls.push({ from: { x: battle.x, y: 6, z: battle.z }, to: { x: battle.x, z: battle.z }, t: 0, seconds: 100, arc: 30, x: battle.x, y: 5, z: battle.z, harmless: false, pirate: null });
  });
  await handAt(page, 0, 'fist');
  await waitForHand(page, 'closed');
  await expect.poll(async () => (await battleState(page)).resting, { timeout: 10_000 }).toBe(true);
  await page.evaluate(() => {
    const { battle } = window.__game;
    battle.balls.forEach((ball) => {
      ball.t = 0.99;
    });
    window.__ballsFired = 0;
  });
  await expect.poll(async () => (await battleState(page)).pirates.every(({ mode }) => mode === 'circle'), { timeout: 5000 }).toBe(true);
  const { hearts } = await battleState(page);
  await page.waitForTimeout(6000);
  const state = await battleState(page);
  expect(await page.evaluate(() => window.__ballsFired)).toBe(0);
  expect(state.hearts).toBeGreaterThanOrEqual(hearts);
  await shot(page, 'c-resting');

  // And the same with the hand gone altogether, and then back they come.
  await page.evaluate(() => window.__camera.show({ left: null, right: null }));
  await waitForHand(page, 'missing');
  await page.waitForTimeout(1500);
  expect((await battleState(page)).resting).toBe(true);
  await handAt(page, 0, 'open');
  await expect.poll(async () => (await battleState(page)).resting, { timeout: 15_000 }).toBe(false);
  await expect.poll(async () => (await battleState(page)).pirates.some(({ mode }) => mode !== 'circle'), { timeout: 5000 }).toBe(true);
});

test('the ship can\'t hit the land or leave the world, however it\'s steered', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, { bayShips: 4, bayPace: 'fast' });
  await holdPirate(page, { off: Math.PI, away: 600 });
  // Straight at the coast from nearby, with the hand held right over towards it.
  await page.evaluate(() => {
    const { battle } = window.__game;
    battle.x = 120;
    battle.z = -620;
    battle.heading = Math.PI;
    window.__leastRoom = Infinity;
    window.__furthest = 0;
    window.__watch = setInterval(() => {
      const { battle: now, bay } = window.__game;
      window.__leastRoom = Math.min(window.__leastRoom, bay.chart.room(now.x, now.z));
      window.__furthest = Math.max(window.__furthest, Math.hypot(now.x, now.z));
    }, 30);
  });
  await page.waitForTimeout(9000);
  await shot(page, 'c-along-the-coast');
  // Then right out to the edge of the world, pointing straight out.
  await page.evaluate(() => {
    const { battle } = window.__game;
    battle.x = -1000;
    battle.z = -100;
    battle.heading = -Math.PI / 2;
  });
  await expect(page.locator('#prompt-text')).toHaveText('Back to the island!', { timeout: 15_000 });
  await page.waitForTimeout(800);
  await shot(page, 'c-edge-of-the-world');
  await page.waitForTimeout(4000);
  const { room, furthest } = await page.evaluate(() => ({ room: window.__leastRoom, furthest: window.__furthest }));
  expect(room).toBeGreaterThan(25);
  expect(furthest).toBeLessThanOrEqual(1050.5);
  await letPirateGo(page);
});

test('the whole game can be played through to the finish, with the real hand steering', async ({ page }) => {
  test.setTimeout(420_000);
  await startPlaying(page, { bayShips: 4, bayPace: 'fast' });
  await sailTowardsPirates(page);
  await expect.poll(async () => (await battleState(page)).beaten, { timeout: 180_000 }).toBeGreaterThan(0);
  await shot(page, 'c-first-beaten');
  await expect.poll(async () => (await battleState(page)).boats, { timeout: 10_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  await shot(page, 'c-lifeboat');
  await expect.poll(() => screenName(page), { timeout: 300_000, intervals: [200] }).toBe('finish');
  await stopSailing(page);
  await expect(page.locator('#screen-finish h2')).toHaveText('You drove them all off! The treasure is safe!');
  await expect(page.locator('#finish-hero')).toHaveText('4');
  await expect(page.locator('#sum-right-beaten')).toHaveText('4');
  // The numbers: seconds with the hand open, and how many times it opened.
  const open = await page.locator('#sum-right-open').textContent();
  expect(open).toMatch(/\d+:\d\d/);
  expect(Number(await page.locator('#sum-right-openings').textContent())).toBeGreaterThan(0);
  // Level 1 is as it always was: no prizes but the gold, along the top or on the card.
  await expect(page.locator('#sum-right-prizes')).toBeHidden();
  await page.waitForTimeout(700);
  await shot(page, 'c-finish');
});

test('another pirate comes along as soon as one is beaten, with no waiting', async ({ page }) => {
  await startPlaying(page, { bayShips: 6 });
  await expectSoon(async () => (await battleState(page)).pirates.length).toBe(3);
  const started = Date.now();
  await beatPirates(page, 1);
  await expect.poll(async () => (await battleState(page)).pirates.length, { timeout: 5000, intervals: [50] }).toBe(2);
  await expect.poll(async () => (await battleState(page)).pirates.length, { timeout: 5000, intervals: [50] }).toBe(3);
  expect(Date.now() - started).toBeLessThan(3000);
  await expect(page.locator('#bay-left')).toHaveText('5');
  expect(await page.locator('.captain-face[data-state="beaten"]').count()).toBe(1);
  expect(await page.locator('.captain-face[data-state="here"]').count()).toBe(3);
});

test('a beaten ship leaves gold, which sailing through picks up, and a lifeboat with its crew', async ({ page }) => {
  await startPlaying(page, { bayShips: 4 });
  await holdPirate(page, { off: 0.5, away: 110 });
  await page.waitForTimeout(300);
  await letPirateGo(page);
  await beatPirates(page, 1);
  const left = await page.evaluate(() => {
    const { battle, bay } = window.__game;
    const [boat] = battle.boats;
    const lifeboat = bay.fleet.get(window.__game.game.order[boat.index]).lifeboat;
    return { coins: battle.coins.length, boatShown: lifeboat.captain !== null };
  });
  expect(left.coins).toBeGreaterThan(2);
  expect(left.boatShown).toBe(true);
  await page.waitForTimeout(600);
  await shot(page, 'c-gold');
  await page.evaluate(() => {
    const { battle } = window.__game;
    const [coin] = battle.coins;
    battle.x = coin.x;
    battle.z = coin.z;
  });
  await expect.poll(async () => Number(await page.locator('#bay-gold').textContent()), { timeout: 5000 }).toBeGreaterThan(0);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__game.battle.stats.crewsAway)).toBe(0);
});

test('an arrow at the edge of the screen says which way to steer for a ship out of sight', async ({ page }) => {
  await startPlaying(page, { bayShips: 4 });
  // Round to the right, and a little behind.
  await holdPirate(page, { off: 2, away: 150 });
  const mark = page.locator('.mark').first();
  await expect(mark).toHaveAttribute('data-where', 'off', { timeout: 10_000 });
  const box = await mark.boundingBox();
  expect(box.x).toBeGreaterThan(1280 / 2);
  expect(box.x).toBeLessThanOrEqual(1280);
  await page.waitForTimeout(300);
  await shot(page, 'c-arrow-right');
  await holdPirate(page, { off: -2, away: 150 });
  await expect.poll(async () => (await mark.boundingBox()).x, { timeout: 10_000 }).toBeLessThan(1280 / 2);
  // In front, the mark is over the ship itself.
  await holdPirate(page, { off: 0.5, away: 150 });
  await expect(mark).toHaveAttribute('data-where', 'on', { timeout: 10_000 });
  await page.waitForTimeout(300);
  await shot(page, 'c-mark-on-ship');
  await letPirateGo(page);
});

test('the left hand works just the same, and the right hand does nothing then', async ({ page }) => {
  await startPlaying(page, { hands: 'left', bayShips: 4 }, ['open', null, { scale: 0.7 }]);
  await expectSoon(async () => (await battleState(page)).sails).toBeGreaterThan(0.6);
  await holdPirate(page, { off: Math.PI * 0.4, away: 95 });
  await expectSoon(async () => (await battleState(page)).stats.shots).toBeGreaterThan(1);
  await handAt(page, 170, 'open', 'left');
  await expectSoon(async () => (await hands(page)).steer).toBeGreaterThan(0.5);
  await expectSoon(async () => (await battleState(page)).wheel).toBeGreaterThan(0.5);
  await page.waitForTimeout(300);
  await shot(page, 'c-left-hand');

  // Only the other hand in view: that doesn't count, however open it is.
  await page.evaluate(() => window.__camera.show({ left: null, right: 'open', scale: 0.7 }));
  await waitForHand(page, 'missing', 'left');
  await expectSoon(async () => (await battleState(page)).sails).toBeLessThan(0.1);
  await letPirateGo(page);
});

test('the film shows what to do, goes when it\'s been done, and comes back when the child seems stuck', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page, { bayShips: 4 });
  await holdPirate(page, { off: Math.PI, away: 600 });
  await expect(page.locator('.film')).toBeVisible();
  // The sails first, while the hand hasn't been open for long, and then the wheel.
  await expect(page.locator('body')).toHaveAttribute('data-film-part', 'wheel', { timeout: 10_000 });
  expect(await page.locator('.film-hand').evaluate((node) => getComputedStyle(node).animationName)).toBe('film-hand-steers');
  expect(await page.locator('.film-small-wheel').evaluate((node) => getComputedStyle(node).animationName)).toBe('film-wheel-turns');
  await page.waitForTimeout(500);
  await shot(page, 'c-film-wheel');
  await handAt(page, 170);
  await expect(page.locator('body')).toHaveAttribute('data-film', 'off', { timeout: 15_000 });
  await expect(page.locator('.film')).toBeHidden();

  // A hand closed for a long time brings it back.
  await handAt(page, 0, 'fist');
  await expect(page.locator('body')).toHaveAttribute('data-film-part', 'sails', { timeout: 15_000 });
  await expect(page.locator('.film')).toBeVisible();
  expect(await page.locator('.film-sail').evaluate((node) => getComputedStyle(node).animationName)).toBe('film-sail-up');
  await page.waitForTimeout(800);
  await shot(page, 'c-film-sails');
  await letPirateGo(page);
});

test('the grown-ups\' panel has speed, cannons, how hard and how many ships, and a way back', async ({ page }) => {
  await startPlaying(page, { bayShips: 4 });
  await page.locator('#open-panel').click();
  await expect(page.locator('#panel')).toBeVisible();
  for (const name of ['bayPace', 'bayCannons', 'bayLevel', 'bayShips']) {
    await expect(page.locator(`input[name="${name}"]:checked`)).toHaveCount(1);
  }
  await expect(page.locator('#panel-all-games')).toHaveText('All games');
  await page.waitForTimeout(200);
  await shot(page, 'c-panel');
  await page.locator('input[name="bayCannons"][value="always"]').check();
  await page.locator('input[name="bayLevel"][value="tough"]').check();
  await page.locator('input[name="bayPace"][value="fast"]').check();
  await page.locator('#close-panel').click();
  const set = await page.evaluate(() => {
    const { battle } = window.__game;
    return { cannons: battle.cannons, reach: battle.level.zone.reach, speed: battle.pace.speed };
  });
  expect(set).toEqual({ cannons: 'always', reach: 135, speed: 42 });
  // The zones on the water follow the setting, so they still show exactly where the cannons fire.
  const far = await page.evaluate(() => Math.max(...window.__game.bay.zones.right.mesh.geometry.attributes.aShape.array.filter((_, index) => index % 4 === 3)));
  expect(far).toBeCloseTo(135, 3);
});
