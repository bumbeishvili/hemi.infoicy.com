// Tank Patrol being played, with real photos going through the real tracker.
import { expect, hands, shot, show, test, waitForScreen } from '../helpers.js';
import { handGone, handIs, noShells, oneTankAt, openPatrol, patrolIs, pointAt, startPatrol, stopPointing } from './helpers.js';

const MIDDLE = { x: 3, z: 6 };

test('the title, then straight into it: tanks are already rolling, and Giraffe says what\'s wrong', async ({ page }) => {
  await openPatrol(page);
  await expect(page.locator('h1')).toHaveText('Tank Patrol');
  await expect(page.locator('#tagline')).toContainText('Close your right hand to drive');
  await page.waitForTimeout(400);
  await shot(page, 'k1-title');
  // Robot tanks moving about behind the title, which nobody has to wait for.
  const before = await page.evaluate(() => window.__game.patrol.enemies.map(({ x, z }) => [x, z]));
  expect(before.length).toBeGreaterThan(0);
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__game.patrol.enemies.map(({ x, z }) => [x, z]))).not.toEqual(before);

  await show(page, null, 'open', { scale: 0.7 });
  await page.locator('#start').click();
  await waitForScreen(page, 'check');
  await shot(page, 'k2-check');
  await waitForScreen(page, 'countdown');
  const started = Date.now();
  await page.waitForTimeout(700);
  await shot(page, 'k3-countdown');
  await waitForScreen(page, 'playing');
  expect(Date.now() - started).toBeLessThan(6000);
  await expect(page.locator('#story')).toHaveAttribute('data-who', 'giraffe');
  await expect(page.locator('#story-line')).toHaveText('Robot tanks in my valley! Let’s stop them!');
  await expect(page.locator('body')).toHaveAttribute('data-film', 'on');
  await page.waitForTimeout(1000);
  await shot(page, 'k4-first-moments');
  const { rolling } = await page.evaluate(() => ({ rolling: window.__game.patrol.rolling.length }));
  expect(rolling).toBeGreaterThanOrEqual(2);
});

test('a closed hand drives the tank to where it points, showing the way', async ({ page }) => {
  await startPatrol(page);
  await noShells(page);
  await pointAt(page, MIDDLE, 'fist');
  await handIs(page, 'closed');
  await expect.poll(async () => (await patrolIs(page)).look).toBe('go');
  await expect.poll(async () => {
    const { x, z } = await patrolIs(page);
    return Math.hypot(x - MIDDLE.x, z - MIDDLE.z);
  }, { timeout: 20_000 }).toBeLessThan(2.5);
  await shot(page, 'k5-arrived');
  // Further, so as to see it going, and over the bridge to the far bank.
  await pointAt(page, { x: 4, z: -18 }, 'fist');
  await expect.poll(async () => (await patrolIs(page)).speed, { timeout: 5000 }).toBeGreaterThan(3);
  await page.waitForTimeout(700);
  await shot(page, 'k6-driving');
  expect(await page.evaluate(() => window.__game.patrol.route.length)).toBeGreaterThan(1);
  await expect.poll(async () => (await patrolIs(page)).z, { timeout: 20_000 }).toBeLessThan(-14);
  expect((await patrolIs(page)).stats.shots).toBe(0);
  await stopPointing(page);
});

test('an open hand on a robot tank in range fires by itself, and stops it', async ({ page }) => {
  test.setTimeout(120_000);
  await startPatrol(page);
  await oneTankAt(page, 12, -14, { andOneMore: true });
  await pointAt(page, 'tank', 'open');
  await handIs(page, 'open');
  await expect.poll(async () => (await patrolIs(page)).look, { timeout: 15_000 }).toBe('firing');
  await expect.poll(async () => (await patrolIs(page)).stats.shots, { timeout: 15_000 }).toBeGreaterThan(1);
  await page.waitForTimeout(250);
  await shot(page, 'k7-firing');
  await expect.poll(async () => (await patrolIs(page)).stopped, { timeout: 30_000 }).toBe(1);
  await stopPointing(page);
  await show(page, null, 'open', { scale: 0.7, rightOffsetX: 200, rightOffsetY: 150 });
  const { state } = await page.evaluate(() => ({ state: window.__enemy.state }));
  expect(state).toBe('rattling');
  await page.waitForTimeout(600);
  await shot(page, 'k8-rattling');
  await expect.poll(() => page.evaluate(() => window.__enemy.state), { timeout: 5000 }).toBe('waving');
  await page.waitForTimeout(1500);
  await shot(page, 'k9-waving');
  await expect(page.locator('#story-line')).toHaveText('Look! The little robot’s waving!');
});

test('an open hand on a tank out of range doesn\'t fire, and shows it', async ({ page }) => {
  await startPatrol(page);
  await oneTankAt(page, 0, -34);
  await pointAt(page, 'tank', 'open');
  await handIs(page, 'open');
  await expect.poll(async () => (await patrolIs(page)).look, { timeout: 15_000 }).toBe('far');
  await page.waitForTimeout(1200);
  const { stats, firing } = await patrolIs(page);
  expect(stats.shots).toBe(0);
  expect(firing).toBe(false);
  await expect(page.locator('#prompt-text')).toHaveText('Too far! Close your hand and drive closer!', { timeout: 10_000 });
  await shot(page, 'k10-too-far');
  // Which is what to do, and then it can fire.
  await pointAt(page, 'tank', 'fist');
  await handIs(page, 'closed');
  await expect.poll(() => page.evaluate(() => window.__game.patrol.inRange(window.__enemy)), { timeout: 20_000 }).toBe(true);
  await pointAt(page, 'tank', 'open');
  await expect.poll(async () => (await patrolIs(page)).stats.shots, { timeout: 15_000 }).toBeGreaterThan(0);
  await stopPointing(page);
});

test('a closed hand on a tank doesn\'t fire', async ({ page }) => {
  await startPatrol(page);
  await oneTankAt(page, 12, -14);
  await pointAt(page, 'tank', 'fist');
  await handIs(page, 'closed');
  await page.waitForTimeout(2500);
  const { stats, firing, look } = await patrolIs(page);
  expect(stats.shots).toBe(0);
  expect(firing).toBe(false);
  expect(look).toBe('go');
  await stopPointing(page);
});

test('a hand out of view neither drives nor fires, and neither does one going out of the picture', async ({ page }) => {
  await startPatrol(page);
  await oneTankAt(page, 12, -14);
  await pointAt(page, 'tank', 'open');
  await expect.poll(async () => (await patrolIs(page)).stats.shots, { timeout: 15_000 }).toBeGreaterThan(0);
  await handGone(page);
  await expect.poll(async () => (await hands(page)).right.status, { timeout: 10_000 }).toBe('missing');
  await handIs(page, 'none');
  await page.waitForTimeout(800); // What's in the air lands.
  const { x, z, stats, look } = await patrolIs(page);
  expect(look).toBe('lost');
  await page.waitForTimeout(1600);
  const after = await patrolIs(page);
  expect(after.stats.shots).toBe(stats.shots);
  expect([after.x, after.z]).toEqual([x, z]);
  await expect(page.locator('#prompt-text')).toContainText(/right hand|closer/, { timeout: 10_000 });
  await shot(page, 'k11-no-hand');

  // Half out of the picture: it can't be read, and doesn't count as open or closed.
  const slideOut = (photo, to) => page.evaluate(async ([name, far]) => {
    for (let offset = 0; offset <= far; offset += 15) {
      window.__camera.show({ left: null, right: name, scale: 0.7, rightOffsetX: offset });
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }, [photo, to]);
  await show(page, null, 'open', { scale: 0.7 });
  await handIs(page, 'open');
  await slideOut('open', 270);
  await expect.poll(async () => (await hands(page)).right.reason, { timeout: 15_000 }).toBe('edge');
  await handIs(page, 'unsure');
  const firstShots = (await patrolIs(page)).stats.shots;
  await page.waitForTimeout(800);
  expect((await patrolIs(page)).stats.shots).toBe(firstShots);
  expect((await patrolIs(page)).speed).toBe(0);
  await show(page, null, 'fist', { scale: 0.7 });
  await handIs(page, 'closed');
  await slideOut('fist', 300);
  await expect.poll(async () => (await hands(page)).right.reason, { timeout: 15_000 }).toBe('edge');
  await handIs(page, 'unsure');
  await page.waitForTimeout(800);
  expect((await patrolIs(page)).speed).toBe(0);
});

test('a shell costs a heart if the tank stays put, and nothing if it\'s driven away', async ({ page }) => {
  test.setTimeout(120_000);
  await startPatrol(page);
  await oneTankAt(page, 0, -30);
  const lob = () => page.evaluate(() => {
    const { patrol } = window.__game;
    patrol.lobIn = 0;
  });
  await pointAt(page, { x: 3, z: 26 }, 'open');
  await page.waitForTimeout(800);
  await lob();
  await expect.poll(async () => (await patrolIs(page)).shells, { timeout: 5000 }).toBe(1);
  await page.evaluate(() => {
    window.__game.patrol.lobIn = 999;
  });
  await expect(page.locator('#prompt-text')).toHaveText('Look out! Drive away from the ring!', { timeout: 3000 });
  await page.waitForTimeout(1100);
  await shot(page, 'k12-shell-coming');
  await expect.poll(async () => (await patrolIs(page)).stats.hurts, { timeout: 6000 }).toBe(1);
  expect((await patrolIs(page)).hearts).toBe(4);
  await expect(page.locator('#chip-hearts .heart.is-gone')).toHaveCount(1);
  await page.waitForTimeout(300);
  await shot(page, 'k13-shell-landed');

  // A hand that has stayed still all this time is resting, so it moves, and then there's another.
  await pointAt(page, { x: 14, z: 24 }, 'open');
  await expect.poll(async () => (await patrolIs(page)).resting, { timeout: 5000 }).toBe(false);
  await lob();
  await expect.poll(async () => (await patrolIs(page)).shells, { timeout: 5000 }).toBe(1);
  await page.evaluate(() => {
    window.__game.patrol.lobIn = 999;
  });
  const hurts = (await patrolIs(page)).stats.hurts;
  const { x, z } = await patrolIs(page);
  await pointAt(page, { x: x + 16, z: z - 4 }, 'fist');
  await expect.poll(async () => (await patrolIs(page)).shells, { timeout: 8000 }).toBe(0);
  const after = await patrolIs(page);
  expect(after.stats.hurts).toBe(hurts);
  expect(after.stats.dodged).toBe(1);
  await stopPointing(page);
});

test('on Gentle a child can\'t lose, however many shells land', async ({ page }) => {
  await startPatrol(page, { tankShells: 'gentle' });
  await oneTankAt(page, 0, -30);
  await pointAt(page, { x: 3, z: 26 }, 'open');
  await handIs(page, 'open');
  const hits = await page.evaluate(() => {
    const { patrol } = window.__game;
    for (let i = 0; i < 12; i += 1) patrol.hurt();
    return patrol.hearts;
  });
  expect(hits).toBe(1);
  await page.waitForTimeout(1500);
  const { state, hearts } = await patrolIs(page);
  expect(state).toBe('playing');
  expect(hearts).toBeGreaterThanOrEqual(1);
  await expect(page.locator('#chip-hearts .heart.is-gone')).toHaveCount(4);
  expect(await page.evaluate(() => window.__game.screen)).toBe('playing');
  await stopPointing(page);
});

test('on Tough, running out ends it kindly, and they can go again straight away', async ({ page }) => {
  test.setTimeout(120_000);
  await startPatrol(page, { tankShells: 'tough' });
  await oneTankAt(page, 0, -30);
  await pointAt(page, { x: 3, z: 26 }, 'open');
  await handIs(page, 'open');
  await page.evaluate(() => {
    const { patrol } = window.__game;
    patrol.hurt();
    patrol.hurt();
    patrol.hurt();
  });
  await stopPointing(page);
  await waitForScreen(page, 'finish');
  // The card says what happened in the story, and the big button is to try again, at the same level.
  await expect(page.locator('#screen-finish h2')).toHaveText('The robot tanks got the better of you!');
  await expect(page.locator('#play-again')).toHaveText('Try again');
  await expect(page.locator('#level-done-text')).toHaveText('Let’s try level 1 again!');
  await page.waitForTimeout(300);
  await shot(page, 'k14-so-close');
  await show(page, null, 'open', { scale: 0.7 });
  await page.locator('#play-again').click();
  await waitForScreen(page, 'countdown');
  await waitForScreen(page, 'playing');
  const { hearts, state, stopped } = await patrolIs(page);
  expect(hearts).toBe(3);
  expect(state).toBe('playing');
  expect(stopped).toBe(0);
});

test('as it comes, the shells can win: four hits end the patrol at level 3, and level 3 comes round again', async ({ page }) => {
  test.setTimeout(120_000);
  await startPatrol(page, { tankShells: undefined, levels: { 'tank-patrol': 3 } });
  expect(await page.evaluate(() => [window.__game.session.settings.tankShells, window.__game.patrol.level.canLose, window.__game.patrol.hearts])).toEqual(['medium', true, 4]);
  await oneTankAt(page, 0, -30);
  await pointAt(page, { x: 3, z: 26 }, 'open');
  await handIs(page, 'open');
  // A child who keeps playing, so a hand held still for 5 seconds isn't a rest, which would let the shells fizzle.
  await page.evaluate(() => {
    window.__awake = setInterval(() => {
      window.__game.patrol.stillFor = 0;
    }, 25);
  });
  // Real shells, coming down on the tank where it stands.
  for (let i = 0; i < 4; i += 1) {
    await page.evaluate(() => {
      const { patrol } = window.__game;
      patrol.lobIn = 9999; // Only these.
      patrol.lob(patrol.rolling[0], { x: patrol.tank.x, z: patrol.tank.z }, 0.6, false);
    });
    await expect.poll(async () => (await patrolIs(page)).stats.hurts, { timeout: 8000 }).toBe(i + 1);
  }
  await stopPointing(page);
  await waitForScreen(page, 'finish');
  await expect(page.locator('#screen-finish h2')).toHaveText('The robot tanks got the better of you!');
  await expect(page.locator('#play-again')).toHaveText('Try again');
  await expect(page.locator('#level-done-text')).toHaveText('Let’s try level 3 again!');
  await page.waitForTimeout(400);
  await shot(page, 'k14-shells-won');
  // No confetti for losing.
  expect(await page.evaluate(() => window.__game.session.hud.confetti.running)).toBe(false);
  await show(page, null, 'open', { scale: 0.7 });
  await page.locator('#play-again').click();
  await waitForScreen(page, 'playing');
  expect(await page.evaluate(() => window.__game.patrol.levelNumber)).toBe(3);
});

test('resting: with the hand gone or staying the same, the robots stop and wait, and nothing bad happens', async ({ page }) => {
  test.setTimeout(120_000);
  await startPatrol(page);
  await oneTankAt(page, 0, -30);
  await pointAt(page, { x: 3, z: 26 }, 'open');
  await handIs(page, 'open');
  await page.evaluate(() => {
    window.__game.patrol.lobIn = 0;
  });
  await expect.poll(async () => (await patrolIs(page)).shells, { timeout: 5000 }).toBe(1);
  await page.evaluate(() => {
    window.__game.patrol.lobIn = 0.2;
  });
  await handGone(page);
  await expect.poll(async () => (await patrolIs(page)).resting, { timeout: 8000 }).toBe(true);
  expect((await patrolIs(page)).shells).toBe(0);
  const { hearts, stats } = await patrolIs(page);
  await page.waitForTimeout(800);
  await shot(page, 'k15-resting');
  await page.waitForTimeout(5000);
  const later = await patrolIs(page);
  expect(later.hearts).toBeGreaterThanOrEqual(hearts);
  expect(later.stats.hurts).toBe(stats.hurts);
  expect(later.shells).toBe(0);
  // The hand coming back ends it, and the robots carry on.
  await show(page, null, 'open', { scale: 0.7 });
  await expect.poll(async () => (await patrolIs(page)).resting, { timeout: 8000 }).toBe(false);
  // Held dead still, it's a rest again. An open hand doesn't need telling anything.
  await expect.poll(async () => (await patrolIs(page)).resting, { timeout: 12_000 }).toBe(true);
  await show(page, null, 'open', { scale: 0.7, rightOffsetX: -150 });
  await expect.poll(async () => (await patrolIs(page)).resting, { timeout: 8000 }).toBe(false);
  // A fist held still gets told that's fine, and asked to open when ready.
  await show(page, null, 'fist', { scale: 0.7 });
  await expect.poll(async () => (await patrolIs(page)).speed, { timeout: 8000 }).toBeGreaterThan(0);
  await expect.poll(async () => (await patrolIs(page)).resting, { timeout: 25_000 }).toBe(true);
  await expect(page.locator('#prompt-text')).toHaveText('Resting is OK. Open your hand when you’re ready.', { timeout: 5000 });
});

test('the Driving setting: by itself, an open hand on a tank out of range drives nearer and fires', async ({ page }) => {
  test.setTimeout(120_000);
  await startPatrol(page, { driving: 'auto' });
  await oneTankAt(page, 0, -34);
  const start = await patrolIs(page);
  await pointAt(page, 'tank', 'open');
  await handIs(page, 'open');
  await expect.poll(async () => (await patrolIs(page)).speed, { timeout: 15_000 }).toBeGreaterThan(2);
  await page.waitForTimeout(400);
  await shot(page, 'k16-driving-itself');
  await expect.poll(async () => (await patrolIs(page)).stats.shots, { timeout: 20_000 }).toBeGreaterThan(0);
  const after = await patrolIs(page);
  expect(Math.hypot(after.x - start.x, after.z - start.z)).toBeGreaterThan(6);
  expect(after.stats.driven).toBeGreaterThan(6);
  // With no hand it stops, however it's been set.
  await handGone(page);
  await handIs(page, 'none');
  await page.waitForTimeout(600);
  expect((await patrolIs(page)).speed).toBe(0);
});

test('the whole game can be played to the finish, with the numbers a grown-up wants', async ({ page }) => {
  test.setTimeout(240_000);
  await startPatrol(page, { tanks: 6, pace: 'fast' });
  await noShells(page);
  // A child who closes to drive at the next tank and opens to fire at it, again and again.
  await page.evaluate(() => {
    window.__playing = setInterval(() => {
      const { patrol, field } = window.__game;
      const [target] = patrol.rolling;
      if (!target) return;
      const glove = field.gloves.right;
      const near = patrol.inRange(target);
      const spot = field.project(target.x, target.y, target.z);
      if (glove.visible) {
        window.__ox = (window.__ox ?? 0) + ((spot.x - glove.x) / innerWidth) * 180;
        window.__oy = (window.__oy ?? 0) + ((spot.y - glove.y) / innerHeight) * 120;
      }
      window.__camera.show({ left: null, right: near ? 'open' : 'fist', scale: 0.7, rightOffsetX: window.__ox ?? 0, rightOffsetY: window.__oy ?? 0 });
    }, 50);
  });
  await page.waitForTimeout(6000);
  await shot(page, 'k17-mid-game');
  await waitForScreen(page, 'finish');
  await page.evaluate(() => clearInterval(window.__playing));
  await expect(page.locator('#screen-finish h2')).toHaveText('You saved the valley!');
  await expect(page.locator('#finish-hero')).toHaveText('6');
  await expect(page.locator('#sum-right-tanks')).toHaveText('6');
  expect(Number(await page.locator('#sum-right-openings').textContent())).toBeGreaterThan(0);
  await expect(page.locator('#sum-right-open')).not.toHaveText('0:00 (0%)');
  await expect(page.locator('#finish-open')).toContainText('Right hand open for');
  await page.waitForTimeout(400);
  await shot(page, 'k18-finish');
  // The camera has gone off, and there's a way back.
  expect(await page.evaluate(() => window.__camera.activeTracks)).toBe(0);
  await expect(page.locator('#screen-finish .all-games')).toHaveAttribute('href', '../../index.html');
});

test('the left hand works, and the right one then does nothing', async ({ page }) => {
  await startPatrol(page, { hands: 'left' }, ['open', null, { scale: 0.7 }]);
  await expect(page.locator('#tagline')).toContainText('left hand');
  await oneTankAt(page, -10, -14);
  await pointAt(page, 'tank', 'open', 'left');
  await expect.poll(async () => (await patrolIs(page)).stats.shots, { timeout: 20_000 }).toBeGreaterThan(0);
  await shot(page, 'k19-left-hand');
  await pointAt(page, { x: -6, z: 8 }, 'fist', 'left');
  await expect.poll(async () => (await patrolIs(page)).speed, { timeout: 15_000 }).toBeGreaterThan(1);
  await stopPointing(page);
  // Only the right hand now: it's ignored.
  await show(page, null, 'open', { scale: 0.7 });
  await handIs(page, 'none');
  const { stats } = await patrolIs(page);
  await page.waitForTimeout(1000);
  expect((await patrolIs(page)).stats.shots).toBe(stats.shots);
  expect((await patrolIs(page)).speed).toBe(0);
});

test('the film shows what to do until the child has got the idea, and comes back if they seem stuck', async ({ page }) => {
  test.setTimeout(120_000);
  await startPatrol(page);
  await oneTankAt(page, 12, -14, { hp: 30 });
  const film = page.locator('body');
  await expect(film).toHaveAttribute('data-film', 'on');
  await page.waitForTimeout(3100);
  await shot(page, 'k20-film-closed');
  await page.waitForTimeout(2600);
  await shot(page, 'k21-film-open');
  await pointAt(page, { x: 3, z: 7 }, 'fist');
  await expect.poll(async () => (await patrolIs(page)).stats.driven, { timeout: 15_000 }).toBeGreaterThan(8);
  await pointAt(page, 'tank', 'open');
  await expect.poll(async () => (await patrolIs(page)).stats.shots, { timeout: 15_000 }).toBeGreaterThan(2);
  await expect(film).toHaveAttribute('data-film', 'off', { timeout: 5000 });
  // Wandering about with an open hand, doing nothing.
  await page.evaluate(() => {
    window.__enemy.hp = 200;
  });
  await pointAt(page, { x: -10, z: 24 }, 'open');
  await expect.poll(async () => (await patrolIs(page)).firing, { timeout: 10_000 }).toBe(false);
  await expect(film).toHaveAttribute('data-film', 'off');
  await page.evaluate(() => {
    window.__game.game.sinceAction = 10.5;
  });
  await expect(film).toHaveAttribute('data-film', 'on', { timeout: 5000 });
  await stopPointing(page);
  // With the hand gone it isn't shown, as the first thing is asking for the hand.
  await show(page, null, null);
  await expect(film).toHaveAttribute('data-film', 'off', { timeout: 5000 });
});

test('the grown-ups\' panel has every setting, the way back to all the games, and pauses the game', async ({ page }) => {
  // As it comes, without the test helpers' Gentle.
  await startPatrol(page, { tankShells: undefined });
  await page.locator('#open-panel').click();
  await expect(page.locator('#panel')).toBeVisible();
  await expect(page.locator('#panel-all-games')).toHaveAttribute('href', '../../index.html');
  for (const name of ['pace', 'reach', 'driving', 'tankShells', 'tanks']) {
    const options = await page.locator(`input[name="${name}"]`).count();
    expect(options, name).toBeGreaterThanOrEqual(2);
    expect(await page.locator(`input[name="${name}"]:checked`).count(), name).toBe(1);
  }
  await expect(page.locator('input[name="tankShells"][value="medium"]')).toBeChecked();
  await expect(page.locator('input[name="driving"][value="closed"]')).toBeChecked();
  await expect(page.locator('input[name="pace"][value="slow"]')).toBeChecked();
  await expect(page.locator('input[name="tanks"][value="6"]')).toBeChecked();
  await page.locator('input[name="reach"][value="lots"]').check();
  await page.locator('input[name="driving"][value="auto"]').check();
  await page.locator('input[name="pace"][value="fast"]').check();
  await page.locator('input[name="tankShells"][value="tough"]').check();
  await shot(page, 'k22-panel');
  const set = await page.evaluate(async () => {
    const { AIM_HELP, LEVELS, PACES } = await import('/games/tank-patrol/patrol.js');
    const { patrol } = window.__game;
    return { help: patrol.help === AIM_HELP.lots, auto: patrol.autoDrive, pace: patrol.pace === PACES.fast, level: patrol.level === LEVELS.tough, hearts: patrol.hearts };
  });
  expect(set).toEqual({ help: true, auto: true, pace: true, level: true, hearts: 3 });
  await expect(page.locator('#chip-hearts .heart')).toHaveCount(3);
  await page.locator('#close-panel').click();
  await expect(page.locator('#panel')).toBeHidden();
});
