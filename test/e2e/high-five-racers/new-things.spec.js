// What each level brings that's new, from level 2 to 10: that each thing really appears and works at the
// level where it arrives, what's picked up is counted, and the "New:" chips say the right things. See
// NEW_THINGS and racePlan in rules.js. The brightness of all of it is in safety.spec.js.
import { car, expect, openGame, reachRace, shot, show, test, waitForHand, waitForScreen, waitUntilMoving } from './helpers.js';

const atLevel = (level) => ({ levels: { 'high-five-racers': level } });

/** A race at a level with the hand open. The car steers itself, so a test can say where it goes. */
async function raceAt(page, level, settings = {}) {
  await openGame(page, { steering: 'auto', ...atLevel(level), ...settings });
  await show(page, null, 'open');
  await reachRace(page);
  await waitForHand(page, 'open');
  await waitUntilMoving(page);
}

/** Code that puts the car at a spot on this lap, or a later one, snapping the camera there. */
const placing = (along, lateral = null, lapsOn = 0) => `
  race.distance = ${along} + race.track.length * (Math.max(0, race.lapIndex) + ${lapsOn});
  race.previousDistance = race.distance;
  ${lateral === null ? '' : `race.lateral = ${lateral};`}
  race.snapCamera = true;`;

/** Puts the car at a spot on this lap. */
const goTo = (page, along, lateral = null) => page.evaluate((code) => new Function('race', code)(window.__game.race), placing(along, lateral));

/** Where the car steers itself to across the road, or null for where it would go anyway. */
const steerTo = (page, lane) => page.evaluate((across) => {
  const { race } = window.__game;
  if (across === null) delete race.autoLane;
  else race.autoLane = () => across;
}, lane);

/**
 * Waits, frame by frame, until code run on the race is true, for up to this many seconds of the race's own
 * time. On a busy computer the race's time goes slower than the clock's, so that's what's counted. first is
 * code to run before waiting, in the same step, so that nothing can go by in between.
 */
const until = (page, code, seconds = 12, first = '') => page.evaluate(async ([check, wait, before]) => {
  const test = new Function('race', `return (${check});`);
  const { race } = window.__game;
  if (before) new Function('race', before)(race);
  const end = race.time + wait;
  const giveUp = performance.now() + 120_000;
  while (race.time < end && performance.now() < giveUp) {
    if (test(race)) return true;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  return test(race);
}, [code, seconds, first]);

const read = (page, code) => page.evaluate((check) => new Function('race', `return (${check});`)(window.__game.race), code);

test('level 1 says nothing is new', async ({ page }) => {
  await openGame(page);
  await expect(page.locator('#level-badge')).toHaveText('Level 1 of 10');
  await page.waitForTimeout(300);
  await expect(page.locator('#level-new')).toBeHidden();
});

test('the cards say what a level brings that\'s new, as soon as the title shows, and what\'s coming up', async ({ page }) => {
  await openGame(page, atLevel(3));
  await expect(page.locator('#level-new')).toHaveText('New:🧲Magnet✋Hand pairs');
  await shot(page, 'high-five-racers-level3-new-title');
  await show(page, null, 'open');
  await page.locator('#start').click();
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-new-now')).toContainText('Magnet');
  await waitForScreen(page, 'playing');
  await page.evaluate(() => window.__game.session.finish());
  await expect(page.locator('#level-next-new')).toHaveText('Coming up:🚜Tractor🏎️Another car');
});

test('under the countdown, what\'s new is in Georgian when the voice is', async ({ page }) => {
  await openGame(page, { ...atLevel(9), language: 'ka' });
  await show(page, null, 'open');
  await page.locator('#start').click();
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-new-now')).toHaveText('ახალი:🌦️წვიმა🌈ცისარტყელას კვალი');
  await shot(page, 'high-five-racers-level9-new-countdown-ka');
});

test('level 2: a big hand slapped and a car passed spill coins, which are picked up and counted', async ({ page }) => {
  await raceAt(page, 2);
  // The others well ahead, so the first coins are the big hand's. Otherwise, as their pace swings with the
  // race's clock, which started before the hand check, a car can be passed just before the big hand, and
  // its coins are the first: picked up too quickly for the label over them to count as seen.
  await page.evaluate(() => {
    const { race } = window.__game;
    race.rivals.forEach((rival, index) => {
      rival.distance = race.distance + 200 + index * 30;
    });
  });
  await expect(page.locator('#chip-coins-box')).toBeVisible();
  await expect(page.locator('#chip-coins')).toHaveText('0');
  // Over to the first big hand, which is on the right.
  await steerTo(page, 4.4);
  // Three coins from the big hand, all at once.
  // The label goes up over them as they come out, in the same moment.
  expect(await until(page, 'race.fives > 0 && race.coins.items.length === 3 && race.callout?.id === "coins"', 20)).toBe(true);
  await shot(page, 'high-five-racers-level2-coins');
  expect(await until(page, 'race.coinTotal >= 3', 8)).toBe(true);
  await expect(page.locator('#chip-coins')).toHaveText(String(await read(page, 'race.coinTotal')));
  // The first time, a label says what they are.
  expect(await read(page, '[...race.calledOut]')).toContain('coins');

  // A car just ahead, passed: two more coins from it.
  const before = await read(page, 'race.prizes.coins');
  await steerTo(page, 0);
  await page.evaluate(() => {
    const { race } = window.__game;
    race.rivals.forEach((rival, index) => {
      rival.distance = race.distance + 200 + index * 30;
    });
    const rival = race.rivals[0];
    rival.distance = race.distance + 5;
    rival.lateral = -4;
    rival.lane = -4;
    rival.coinsAt = -Infinity;
    rival.speed = 2;
    rival.wasAhead = true;
    // It stays slow, so it's passed.
    race.plan = { ...race.plan, rivalPace: { ...race.plan.rivalPace, gains: -30 } };
  });
  expect(await until(page, 'race.prizes.coins >= ' + (before + 2), 10)).toBe(true);

  // On the finish card, under the stars.
  await page.evaluate(() => window.__game.session.finish());
  await expect(page.locator('#finish-prizes')).toContainText('🪙');
  await expect(page.locator('#finish-prizes')).toContainText(`${await read(page, 'race.coinTotal')} coins`);
});

test('level 1 has no coins, no counter for them and nothing on the finish card', async ({ page }) => {
  await raceAt(page, 1);
  await expect(page.locator('#chip-coins-box')).toBeHidden();
  await steerTo(page, 4.4);
  expect(await until(page, 'race.fives > 0', 20)).toBe(true);
  await page.waitForTimeout(800);
  expect(await read(page, 'race.coins.items.length + race.coinTotal + race.powerUps.tokens.length')).toBe(0);
  await page.evaluate(() => window.__game.session.finish());
  await expect(page.locator('#finish-prizes')).toBeHidden();
});

test('level 3: the magnet is picked up on the trail, and pulls in stars from right across the road', async ({ page }) => {
  await raceAt(page, 3);
  const token = await read(page, 'race.plan.powerUps.find((each) => each.kind === "magnet")');
  await steerTo(page, token.lateral);
  expect(await until(page, 'race.callout?.id === "magnet"', 8, placing(token.along - 130, 0))).toBe(true);
  await expect(page.locator('#new-label')).toHaveClass(/is-showing/);
  await expect(page.locator('#new-label')).toContainText('Magnet');
  await page.waitForTimeout(400);
  await shot(page, 'high-five-racers-level3-magnet-label');
  expect(await until(page, 'race.powers.has("magnet")', 8)).toBe(true);
  await expect(page.locator('.power[data-kind="magnet"]')).toBeVisible();

  // Far over on the left, while the stars lead off to the right: they come over anyway.
  await steerTo(page, -4.8);
  const stars = await read(page, 'race.starTotal');
  expect(await until(page, 'race.lateral < -4', 4)).toBe(true);
  const fromAcross = await page.evaluate(async () => {
    const { race } = window.__game;
    const before = race.starTotal;
    let widest = 0;
    const end = race.time + 2.5;
    while (race.time < end) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      for (const star of race.stars.stars) widest = Math.max(widest, Math.abs(star.lateral - star.pulled));
    }
    return { got: race.starTotal - before, widest, lateral: race.lateral };
  });
  console.log('magnet', JSON.stringify(fromAcross));
  expect(fromAcross.got).toBeGreaterThan(0);
  expect(fromAcross.widest).toBeGreaterThan(5);
  expect(await read(page, 'race.starTotal')).toBeGreaterThan(stars);
  await shot(page, 'high-five-racers-level3-magnet-on');
  // It runs out after its time, and the badge goes.
  expect(await until(page, '!race.powers.has("magnet")', 12)).toBe(true);
  await expect(page.locator('.power[data-kind="magnet"]')).toBeHidden();
});

test('level 4: the tractor comes out of the farm on the shoulder, away from the next big hand, and passing it brings coins', async ({ page }) => {
  await raceAt(page, 4);
  await steerTo(page, null);
  expect(await until(page, 'race.farm.active', 8, placing(330, 0))).toBe(true);
  expect(await until(page, 'race.callout?.id === "tractor"', 8)).toBe(true);
  await shot(page, 'high-five-racers-level4-tractor');
  const pass = await page.evaluate(async () => {
    const { race } = window.__game;
    const { farm } = race;
    const next = race.gates.next(farm.distance).gate.side;
    const lanes = new Set();
    // The farmer's arm hangs down until the car goes past, and then it goes up to wave.
    const base = race.camera.position.clone();
    const tip = race.camera.position.clone();
    const armUp = () => race.tractor.arm.localToWorld(tip.set(0, 0.68, 0)).y - race.tractor.arm.getWorldPosition(base).y;
    const before = armUp();
    let waved = -Infinity;
    const end = race.time + 9;
    while (race.time < end && !(farm.passed && race.tractor.wave < 1.6)) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      lanes.add(farm.lateral);
      if (farm.passed) waved = Math.max(waved, armUp());
    }
    return { passed: farm.passed, side: farm.side, next, lanes: [...lanes], before, waved };
  });
  console.log('tractor', JSON.stringify(pass));
  expect(pass.passed).toBe(true);
  expect(pass.side).toBe(-pass.next);
  // Always on the shoulder, off the tarmac, which ends 6.5 m from the middle of the road.
  expect(pass.lanes).toEqual([pass.side * 7.9]);
  expect(pass.before).toBeLessThan(-0.4);
  expect(pass.waved).toBeGreaterThan(0.4);
  expect(await until(page, 'race.prizes.coins >= 2', 6)).toBe(true);
});

test('level 4: nothing runs into the tractor, wherever the car or the others go, flying or not, and it waits for a child who rests', async ({ page }) => {
  // Three of its laps, each with its own tractor.
  await raceAt(page, 4, { laps: 4 });
  expect(await until(page, 'race.farm.active', 8, placing(330, 0))).toBe(true);
  // Right over at the edge of the road on the tractor's side, all the way past it, and up in the air for part
  // of it. The other cars are far behind.
  const touches = `
    const { farm } = race;
    const touching = (distance, lateral) => Math.abs(farm.distance - 1.3 - distance) < (4.4 + 7.4) / 2 && Math.abs(farm.lateral - lateral) < (2.6 + 2.7) / 2;`;
  const child = await page.evaluate(async (code) => {
    const { race } = window.__game;
    const { touching, farm } = new Function('race', `${code} return { touching, farm };`)(race);
    for (const rival of race.rivals) Object.assign(rival, { distance: race.distance - 300, wasAhead: false });
    race.autoLane = () => farm.side * 5;
    let bumps = 0;
    const onBump = race.events.onBump;
    race.events.onBump = () => {
      bumps += 1;
      onBump?.();
    };
    let touched = 0;
    let shoved = 0;
    let flew = false;
    let closest = Infinity;
    const end = race.time + 12;
    while (race.time < end && !(farm.passed && race.distance > farm.distance + 20)) {
      if (!flew && farm.distance - race.distance < 30) {
        race.turbo.burst();
        race.takeOff();
        flew = true;
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (touching(race.distance, race.lateral)) touched += 1;
      shoved = Math.max(shoved, Math.abs(race.shove));
      if (Math.abs(farm.distance - 1.3 - race.distance) < 6) closest = Math.min(closest, Math.abs(farm.lateral - race.lateral));
    }
    race.events.onBump = onBump;
    delete race.autoLane;
    return { bumps, touched, shoved, flew, closest, passed: farm.passed, speed: race.speed };
  }, touches);
  console.log('past the tractor', JSON.stringify(child));
  expect(child.passed).toBe(true);
  expect(child.flew).toBe(true);
  expect(child.closest).toBeGreaterThan((2.6 + 2.7) / 2);
  expect(child).toMatchObject({ bumps: 0, touched: 0 });
  expect(child.shoved).toBeLessThan(0.05);
  expect(child.speed).toBeGreaterThan(12);

  // Next lap's tractor, with one of the others right over at the edge on its side as it goes past.
  expect(await until(page, 'race.farm.active && race.farm.distance - race.distance > 50', 8, placing(380, 0, 1))).toBe(true);
  const others = await page.evaluate(async (code) => {
    const { race } = window.__game;
    const { touching, farm } = new Function('race', `${code} return { touching, farm };`)(race);
    race.autoLane = () => -farm.side * 2;
    race.rivals.forEach((rival, index) => {
      Object.assign(rival, { distance: race.distance - 300 - index * 20, wasAhead: false });
    });
    const rival = race.rivals[0];
    rival.distance = race.distance + 12;
    rival.lateral = farm.side * 5;
    let touched = 0;
    let past = false;
    const end = race.time + 12;
    while (race.time < end && !past) {
      rival.lane = farm.side * 6.5;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (touching(rival.distance, rival.lateral)) touched += 1;
      past = rival.distance > farm.distance + 10;
    }
    delete race.autoLane;
    return { touched, past };
  }, touches);
  console.log('another car past the tractor', JSON.stringify(others));
  expect(others).toEqual({ touched: 0, past: true });

  // A third lap's tractor, and a child who rests behind it: it stops and waits.
  expect(await until(page, 'race.farm.active && race.farm.distance - race.distance > 20', 8, placing(380, null, 1))).toBe(true);
  await show(page, null, 'fist');
  await waitForHand(page, 'closed');
  expect(await until(page, 'race.speed === 0 && race.farm.speed < 0.2', 30)).toBe(true);
  const waiting = await read(page, 'race.farm.distance - race.distance');
  await page.waitForTimeout(2000);
  expect(await read(page, 'race.farm.distance - race.distance')).toBeCloseTo(waiting, 0);
});

test('level 9: the tractor keeps to the other side, and stops short of the big hand on its side', async ({ page }) => {
  await raceAt(page, 9);
  // Resting far behind it, so it goes on as far as it goes.
  expect(await until(page, 'race.farm.active', 8, placing(370, 0))).toBe(true);
  await show(page, null, 'fist');
  const stopped = await page.evaluate(async () => {
    const { race } = window.__game;
    const { farm } = race;
    // The race waits for a resting child, and the tractor with it: let it carry on, to see where it stops.
    farm.speed = 8;
    const end = race.time + 30;
    let front = 0;
    while (race.time < end) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      farm.speed = farm.distance < farm.end ? 8 : farm.speed;
      front = Math.max(front, farm.distance % race.track.length + 1.9);
      if (farm.distance >= farm.end && farm.speed < 0.05) break;
    }
    const posts = race.gates.gates.filter((gate) => gate.side === farm.side).map((gate) => gate.along);
    return { side: farm.side, front, posts, end: farm.end % race.track.length };
  });
  console.log('level 9 tractor', JSON.stringify(stopped));
  expect(stopped.side).toBe(1);
  // The big hand at 565 is the first on its side.
  expect(stopped.posts).toContain(565);
  expect(stopped.front).toBeLessThan(565 - 2);
  expect(stopped.front).toBeGreaterThan(520);
});

test('level 5: the light goes golden slowly over the race, about as bright as the day', async ({ page }) => {
  await raceAt(page, 5);
  // Early on it's still day.
  expect(await read(page, 'race.weather.sunset')).toBe(0);
  const brightness = await page.evaluate(async () => {
    const { race } = window.__game;
    const small = document.createElement('canvas');
    small.width = 32;
    small.height = 18;
    const context = small.getContext('2d', { willReadFrequently: true });
    const mean = () => {
      race.render();
      context.drawImage(race.renderer.domElement, 0, 0, 32, 18);
      const { data } = context.getImageData(0, 0, 32, 18);
      let total = 0;
      for (let i = 0; i < data.length; i += 4) total += (data[i] + data[i + 1] + data[i + 2]) / 3;
      return total / (data.length / 4);
    };
    const { weather } = race;
    const update = weather.update;
    weather.update = () => {};
    const seen = [];
    for (const along of [120, 640, 1000, 1240]) {
      race.distance = race.track.length * Math.max(0, race.lapIndex) + along;
      race.snapCamera = true;
      for (const rival of race.rivals) rival.distance = race.distance - 300;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      weather.sunset = 0;
      weather.apply();
      const day = mean();
      weather.sunset = 1;
      weather.apply();
      const sunset = mean();
      seen.push({ along, day, sunset });
    }
    weather.update = update;
    return seen;
  });
  console.log('sunset brightness', JSON.stringify(brightness.map(({ along, day, sunset }) => [along, day.toFixed(1), sunset.toFixed(1)])));
  for (const { day, sunset } of brightness) expect(Math.abs(day - sunset)).toBeLessThan(12);

  // Past a quarter of the race it comes on, and never faster than its set rate.
  await goTo(page, 0.45 * (await read(page, 'race.raceDistance')) - 44);
  const rising = await page.evaluate(async () => {
    const { race } = window.__game;
    let fastest = 0;
    let last = race.weather.sunset;
    let lastAt = race.time;
    const end = race.time + 3;
    while (race.time < end) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const now = race.time;
      if (now - lastAt < 1e-6) continue;
      fastest = Math.max(fastest, (race.weather.sunset - last) / (now - lastAt));
      last = race.weather.sunset;
      lastAt = now;
    }
    return { sunset: race.weather.sunset, fastest };
  });
  console.log('sunset rising', JSON.stringify(rising));
  expect(rising.sunset).toBeGreaterThan(0.15);
  expect(rising.fastest).toBeLessThan(0.3);
  expect(await until(page, 'race.calledOut.has("sunset")', 8)).toBe(true);
  await page.evaluate(() => {
    const { weather } = window.__game.race;
    weather.sunset = 0.9;
  });
  await goTo(page, 1100, 0);
  await page.waitForTimeout(600);
  await shot(page, 'high-five-racers-level5-sunset');
});

test('level 6: with the bubble on, other cars bounce softly off it and the child\'s car isn\'t moved', async ({ page }) => {
  await raceAt(page, 6);
  const token = await read(page, 'race.plan.powerUps.find((each) => each.kind === "bubble")');
  await steerTo(page, token.lateral);
  expect(await until(page, 'race.callout?.id === "bubble"', 8, placing(token.along - 130, token.lateral))).toBe(true);
  await page.waitForTimeout(300);
  await shot(page, 'high-five-racers-level6-bubble-label');
  expect(await until(page, 'race.powers.has("bubble")', 8)).toBe(true);
  await steerTo(page, -1.5);
  await page.waitForTimeout(700);
  const bounce = await page.evaluate(async () => {
    const { race } = window.__game;
    let bounces = 0;
    race.events.onBounce = () => {
      bounces += 1;
    };
    race.rivals.forEach((rival, index) => {
      rival.distance = race.distance + 250 + index * 30;
    });
    const rival = race.rivals[0];
    rival.distance = race.distance + 1;
    rival.lateral = race.lateral + 1.6;
    rival.lane = rival.lateral;
    rival.bumpWait = 0;
    const lateral = race.lateral;
    let mostMoved = 0;
    let widest = 0;
    const end = race.time + 1.5;
    while (race.time < end) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      mostMoved = Math.max(mostMoved, Math.abs(race.shove));
      widest = Math.max(widest, Math.abs(rival.lateral - race.lateral));
    }
    return { bounces, mostMoved, widest, drift: Math.abs(race.lateral - lateral) };
  });
  console.log('bubble', JSON.stringify(bounce));
  expect(bounce.bounces).toBeGreaterThan(0);
  expect(bounce.widest).toBeGreaterThan(3.5);
  expect(bounce.mostMoved).toBeLessThan(0.5);
  await shot(page, 'high-five-racers-level6-bubble-on');
});

test('level 7: a balloon lets a gem down on the trail, and it\'s picked up and counted', async ({ page }) => {
  await raceAt(page, 7);
  const spot = await read(page, 'race.plan.balloons[0]');
  await steerTo(page, spot.lateral);
  expect(await until(page, 'race.callout?.id === "balloon"', 8, placing(spot.along - 150, 0))).toBe(true);
  await page.waitForTimeout(250);
  await shot(page, 'high-five-racers-level7-balloon');
  const coins = await read(page, 'race.coinTotal');
  expect(await until(page, 'race.prizes.gems === 1', 8)).toBe(true);
  expect(await read(page, 'race.coinTotal')).toBeGreaterThanOrEqual(coins + 5);
  await page.evaluate(() => window.__game.session.finish());
  await expect(page.locator('#finish-prizes')).toContainText('💎 1 gem');
});

test('level 8: reaching over to the treasure chest opens it, and closer hands bring the big hands in', async ({ page }) => {
  await raceAt(page, 8);
  const chest = await read(page, 'race.plan.chests[0]');
  await steerTo(page, chest.side * 4.8);
  expect(await until(page, 'race.callout?.id === "chest"', 8, placing(chest.along - 140, 0))).toBe(true);
  await page.waitForTimeout(300);
  await shot(page, 'high-five-racers-level8-chest');
  const coins = await read(page, 'race.coinTotal');
  expect(await until(page, 'race.prizes.chests === 1', 8)).toBe(true);
  expect(await read(page, 'race.coinTotal')).toBeGreaterThanOrEqual(coins + 10);
  await page.waitForTimeout(250);
  await shot(page, 'high-five-racers-level8-chest-open');

  // Closer hands, at the start of the next lap.
  const token = await read(page, 'race.plan.powerUps.find((each) => each.kind === "wide")');
  await steerTo(page, token.lateral);
  const before = await read(page, '({ reach: race.reachNow(1), handX: race.gates.gates[0].wantedX })');
  expect(await until(page, 'race.powers.has("wide")', 8, placing(token.along - 60, token.lateral, 1))).toBe(true);
  const after = await read(page, '({ reach: race.reachNow(1), handX: race.gates.gates[0].wantedX, base: race.reach.reachFor(1) })');
  console.log('closer hands', JSON.stringify({ before, after }));
  expect(after.reach).toBeLessThan(before.reach);
  expect(after.reach).toBeCloseTo(Math.max(0.9, after.base * 0.6), 5);
  expect(after.handX).toBeLessThan(before.handX);
  await steerTo(page, null);
  await page.waitForTimeout(1200);
  await shot(page, 'high-five-racers-level8-closer-hands');
});

test('level 9: a shower over the lake, then the rainbow trail makes each star count twice', async ({ page }) => {
  await raceAt(page, 9);
  expect(await until(page, 'race.weather.rain > 0.8', 8, placing(500, 0))).toBe(true);
  expect(await read(page, 'race.particles.items.filter((item) => item.life > 0).length')).toBeGreaterThan(30);
  await shot(page, 'high-five-racers-level9-rain');
  // The rainbow trail comes just after the shower. On the next lap, so that it's still to come.
  const token = await read(page, 'race.plan.powerUps.find((each) => each.kind === "rainbow")');
  await steerTo(page, token.lateral);
  expect(await until(page, 'race.powers.has("rainbow")', 10, placing(token.along - 80, token.lateral, 1))).toBe(true);
  const counted = await page.evaluate(async () => {
    const { race } = window.__game;
    delete race.autoLane;
    const steps = [];
    let last = race.starTotal;
    const end = race.time + 5;
    while (race.time < end && race.powers.has('rainbow')) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (race.starTotal !== last) steps.push(race.starTotal - last);
      last = race.starTotal;
    }
    return steps;
  });
  console.log('rainbow stars', JSON.stringify(counted));
  expect(counted.length).toBeGreaterThan(0);
  expect(counted.every((step) => step % 2 === 0)).toBe(true);
  expect(await until(page, 'race.weather.rainbow > 0.4', 10)).toBe(true);
  await shot(page, 'high-five-racers-level9-rainbow');
});

test('level 10: the last lap is golden, and a giant high ten waits at the finish', async ({ page }) => {
  await raceAt(page, 10, { laps: 1 });
  // A one-lap race is all last lap.
  expect(await read(page, 'race.goldenLapNow')).toBe(true);
  expect(await until(page, 'race.stars.golden === 1', 4)).toBe(true);
  const step = await page.evaluate(async () => {
    const { race } = window.__game;
    let last = race.starTotal;
    const end = race.time + 8;
    while (race.time < end) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (race.starTotal !== last && !race.powers.has('rainbow')) return race.starTotal - last;
      last = race.starTotal;
    }
    return 0;
  });
  expect(step).toBe(2);
  expect(await until(page, 'race.callout?.id === "highTen"', 10, 'race.distance = race.raceDistance - 220; race.previousDistance = race.distance; race.lateral = 0; race.snapCamera = true;')).toBe(true);
  expect(await until(page, 'race.raceDistance - race.distance < 30', 6)).toBe(true);
  await shot(page, 'high-five-racers-level10-high-ten');
  await waitForScreen(page, 'finish');
  expect(await read(page, 'race.prizes.highTens')).toBe(1);
  await expect(page.locator('#finish-prizes')).toContainText('🙌 High ten!');
  await expect(page.locator('#screen-finish h2')).toHaveText('You won the race!');
  await page.waitForTimeout(800);
  await shot(page, 'high-five-racers-level10-prizes-finish');
});

test('missing everything costs nothing: no place, no stars and nothing taken away', async ({ page }) => {
  await raceAt(page, 10, { steering: 'help' });
  // Down the middle, past power-ups, coins, the chest and the balloon, with nothing collected.
  const missed = await page.evaluate(async () => {
    const { race } = window.__game;
    // On an empty road, so that they land where a big hand's would, close ahead.
    race.coins.reset();
    race.coins.spill(race.player.group.position.clone(), race.distance, 4.8, 3);
    const before = { stars: race.starTotal, coins: race.coinTotal, fives: race.fives };
    race.lateral = -4.8;
    const end = race.time + 3;
    while (race.time < end) {
      race.lateral = -4.8;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return { before, after: { stars: race.starTotal, coins: race.coinTotal, fives: race.fives }, left: race.coins.items.length };
  });
  expect(missed.after.stars).toBeGreaterThanOrEqual(missed.before.stars);
  expect(missed.after.coins).toBeGreaterThanOrEqual(missed.before.coins);
  expect(missed.left).toBe(0);
  expect((await car(page)).speed).toBeGreaterThan(12);
});

const frame = 'await new Promise((resolve) => requestAnimationFrame(resolve));';

test('level 2: coins from a big hand and from a car passed straight after still come one at a time', async ({ page }) => {
  await raceAt(page, 2);
  await steerTo(page, 0);
  const coins = await page.evaluate(async (next) => {
    const { race } = window.__game;
    const wait = new Function(`return (async () => { ${next} })();`);
    race.coins.reset();
    for (const rival of race.rivals) Object.assign(rival, { distance: race.distance - 300, wasAhead: false, coinsAt: race.time });
    const at = race.player.group.position.clone().setY(4);
    // Three from a big hand, and two more from a car passed a moment later.
    race.coins.spill(at, race.distance, race.lateral, 3);
    const end = race.time + 0.25;
    while (race.time < end) await wait();
    race.coins.spill(at, race.distance, race.lateral, 2);
    const spots = race.coins.items.map(({ distance }) => distance).sort((a, b) => a - b);
    const times = [];
    const onCoin = race.events.onCoin;
    race.events.onCoin = (total, kind) => {
      times.push(race.time);
      onCoin?.(total, kind);
    };
    const until = race.time + 8;
    while (race.time < until && race.coins.items.length) await wait();
    race.events.onCoin = onCoin;
    return { spots, times };
  }, frame);
  const gaps = (values) => values.slice(1).map((value, index) => value - values[index]);
  console.log('coins one at a time', JSON.stringify({ spots: coins.spots.map(Math.round), apart: gaps(coins.times).map((each) => each.toFixed(2)) }));
  expect(coins.spots).toHaveLength(5);
  expect(Math.min(...gaps(coins.spots))).toBeGreaterThanOrEqual(13.6);
  expect(coins.times).toHaveLength(5);
  // Fewer than three a second.
  expect(Math.min(...gaps(coins.times))).toBeGreaterThan(1 / 3);
});

test('a hand check in the middle of a race takes nothing away: power-ups wait, coins stay, and so does the tractor', async ({ page }) => {
  await raceAt(page, 4);
  await steerTo(page, 0);
  expect(await until(page, 'race.farm.active', 8, placing(340, 0))).toBe(true);
  const before = await page.evaluate(() => {
    const { race, session } = window.__game;
    race.powers.take('magnet');
    race.powers.take('bubble');
    race.coins.spill(race.player.group.position.clone(), race.distance + 40, race.lateral, 3);
    const now = { magnet: race.powers.left.magnet, bubble: race.powers.left.bubble, coins: race.coins.items.length, lap: race.farm.lap, farm: race.farm.distance };
    // What "Check hands again" in the grown-ups' panel does.
    session.recheckHands();
    return now;
  });
  await waitForScreen(page, 'check');
  const during = await read(page, '({ mode: race.mode, magnet: race.powers.left.magnet, coins: race.coins.items.length, tractor: race.farm.active && race.tractor.group.visible })');
  await waitForScreen(page, 'playing');
  const after = await read(page, '({ mode: race.mode, magnet: race.powers.left.magnet, bubble: race.powers.left.bubble, coins: race.coins.items.length, active: race.farm.active, lap: race.farm.lap, farm: race.farm.distance, shown: race.tractor.group.visible })');
  console.log('hand check', JSON.stringify({ before, during, after }));
  expect(during.mode).toBe('grid');
  expect(during.magnet).toBeCloseTo(before.magnet, 1);
  expect(during.coins).toBe(before.coins);
  expect(during.tractor).toBe(true);
  expect(after.mode).toBe('race');
  expect(after.magnet).toBeGreaterThan(before.magnet - 1);
  expect(after.bubble).toBeGreaterThan(before.bubble - 1);
  expect(after.coins).toBe(before.coins);
  expect(after).toMatchObject({ active: true, lap: before.lap, shown: true });
  expect(after.farm).toBeGreaterThanOrEqual(before.farm);
});

test('level 6: with the bubble on, a car at the edge of the road beside the car never goes through it', async ({ page }) => {
  await raceAt(page, 6);
  const pinned = await page.evaluate(async (next) => {
    const { race } = window.__game;
    const wait = new Function(`return (async () => { ${next} })();`);
    race.powers.take('bubble');
    race.rivals.forEach((rival, index) => {
      rival.distance = race.distance + 250 + index * 30;
    });
    // One at the right-hand edge of the road, right beside the car, which steers over to that edge.
    const rival = race.rivals[0];
    rival.distance = race.distance + 0.5;
    rival.lateral = 5;
    rival.speed = race.speed;
    race.lateral = 1.5;
    race.autoLane = () => 5;
    let most = 0;
    let beside = 0;
    let jump = 0;
    let last = race.lateral;
    const end = race.time + 2;
    while (race.time < end) {
      rival.lane = 6.5;
      await wait();
      const across = 2.6 - Math.abs(rival.lateral - race.lateral);
      const along = 4.4 - Math.abs(rival.distance - race.distance);
      if (along > 0) beside += 1;
      if (across > 0 && along > 0) most = Math.max(most, Math.min(across, along));
      jump = Math.max(jump, Math.abs(race.lateral - last));
      last = race.lateral;
    }
    delete race.autoLane;
    return { most, beside, jump };
  }, frame);
  console.log('pinned beside the bubble', JSON.stringify(pinned));
  expect(pinned.beside).toBeGreaterThan(10);
  expect(pinned.most).toBeLessThan(0.01);
  // The child's car is held off, not thrown about.
  expect(pinned.jump).toBeLessThan(0.3);
});

test('level 3: when the magnet runs out, the stars it pulled over stay where they are until the car has gone by', async ({ page }) => {
  await raceAt(page, 3);
  await steerTo(page, -4.8);
  // Over on the left, just before a trail of stars over to the right, with the magnet pulling them over.
  const jumps = await page.evaluate(async ([next, code]) => {
    const { race } = window.__game;
    const wait = new Function(`return (async () => { ${next} })();`);
    new Function('race', code)(race);
    race.powers.take('magnet');
    let end = race.time + 0.6;
    while (race.time < end) await wait();
    const { length } = race.track;
    const ahead = (star) => ((star.along - race.distance) % length + length) % length;
    const pulled = race.stars.stars.filter((star) => Math.abs(star.pulled - star.lateral) > 1 && ahead(star) < 60).length;
    // It runs out.
    race.powers.left.magnet = 1e-6;
    const last = new Map(race.stars.stars.map((star) => [star, star.pulled]));
    let most = 0;
    end = race.time + 1.5;
    while (race.time < end) {
      await wait();
      for (const star of race.stars.stars) {
        if (ahead(star) < 60) most = Math.max(most, Math.abs(star.pulled - last.get(star)));
        last.set(star, star.pulled);
      }
    }
    return { pulled, most, on: race.powers.has('magnet') };
  }, [frame, placing(478, -4.8)]);
  console.log('magnet ran out', JSON.stringify(jumps));
  expect(jumps.on).toBe(false);
  expect(jumps.pulled).toBeGreaterThan(0);
  expect(jumps.most).toBeLessThan(0.3);
});

test('a new thing\'s label stays on the screen and clear of the camera\'s picture and the prompt, in the voice\'s language', async ({ page }) => {
  await raceAt(page, 4, { steering: 'help' });
  // The fourth car just ahead, and a big hand coming up, so its hint is in the prompt. Its label came up at the
  // start, as the fourth car was ahead on the grid, so this starts it again as if for the first time.
  const seen = await page.evaluate(async (next) => {
    const { race, game, session } = window.__game;
    const wait = new Function(`return (async () => { ${next} })();`);
    race.callout = null;
    race.calledOut.clear();
    race.calloutAgainAt.clear();
    const lap = race.track.length * Math.max(0, race.lapIndex);
    race.distance = 225 + lap;
    race.previousDistance = race.distance;
    race.snapCamera = true;
    race.rivals.forEach((rival, index) => {
      Object.assign(rival, { distance: race.distance - 200 - index * 20, wasAhead: false });
    });
    const rival = race.rivals[3];
    rival.distance = race.distance + 28;
    rival.lateral = 0;
    rival.speed = race.speed;
    const label = document.querySelector('#new-label');
    const prompt = document.querySelector('#prompt');
    const camera = document.querySelector('#camera-frame');
    const box = (element) => element.getBoundingClientRect();
    const overlap = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
    const frames = [];
    let switched = false;
    const end = race.time + 3.5;
    while (race.time < end) {
      rival.distance = Math.max(rival.distance, race.distance + 20);
      await wait();
      if (race.callout?.id !== 'car4') continue;
      const showing = label.classList.contains('is-showing');
      const at = box(label);
      frames.push({
        t: race.time,
        showing,
        onPrompt: showing && prompt.classList.contains('is-visible') && overlap(at, box(prompt)),
        onCamera: showing && overlap(at, box(camera)),
        offScreen: showing && (at.left < 0 || at.right > innerWidth || at.top < 0 || at.bottom > innerHeight),
        counted: race.calledOut.has('car4'),
        prompt: prompt.classList.contains('is-visible'),
        name: document.querySelector('#new-label-name').textContent,
      });
      // Half way through, the voice is changed to Georgian.
      if (!switched && frames.length > 60) {
        session.changeSettings({ language: 'ka' });
        switched = true;
      }
    }
    session.changeSettings({ language: 'en' });
    // However near the edge something is, its label is all on the screen.
    const edge = game.labelSpot(0, 400, 260, 36);
    return { frames, edge, width: innerWidth };
  }, frame);
  const { frames } = seen;
  const shown = frames.filter((each) => each.showing).length;
  const countedAt = frames.findIndex((each) => each.counted);
  console.log('car4 label', JSON.stringify({ frames: frames.length, shown, withPrompt: frames.filter((each) => each.prompt).length, countedAt, edge: seen.edge }));
  expect(frames.length).toBeGreaterThan(60);
  expect(shown).toBeGreaterThan(frames.length * 0.6);
  expect(frames.filter((each) => each.prompt).length).toBeGreaterThan(0);
  expect(frames.filter((each) => each.onPrompt || each.onCamera || each.offScreen)).toEqual([]);
  // It only counts as shown once it has been up for a while.
  expect(countedAt).toBeGreaterThan(0);
  expect(frames[countedAt].t - frames.find((each) => each.showing).t).toBeGreaterThan(0.9);
  expect(frames[10].name).toBe('Another car');
  expect(frames.at(-1).name).toBe('კიდევ ერთი მანქანა');
  expect(seen.edge.x - 130).toBeGreaterThanOrEqual(0);
});

test('a label that couldn\'t be seen comes again, and isn\'t counted as shown', async ({ page }) => {
  await raceAt(page, 4);
  const result = await page.evaluate(async (next) => {
    const { race } = window.__game;
    const wait = new Function(`return (async () => { ${next} })();`);
    // As if for the first time: the fourth car's label came up at the start, with it ahead on the grid.
    race.callout = null;
    race.calledOut.clear();
    race.calloutAgainAt.clear();
    race.rivals.forEach((rival, index) => {
      Object.assign(rival, { distance: race.distance - 200 - index * 20, wasAhead: false });
    });
    const rival = race.rivals[3];
    rival.distance = race.distance + 30;
    rival.speed = race.speed;
    // The label goes up, and then whatever it's for can't be seen, as if behind something, for a while.
    let end = race.time + 2;
    while (race.time < end && race.callout?.id !== 'car4') await wait();
    const up = race.callout?.id === 'car4';
    const callout = race.callout;
    end = race.time + 6;
    while (race.time < end && race.callout === callout) {
      callout.at = null;
      callout.follow = () => race.camera.position.clone().setY(race.camera.position.y - 1000);
      await wait();
    }
    const gone = race.callout !== callout;
    const counted = race.calledOut.has('car4');
    // Later, in sight again, it comes back.
    end = race.time + 8;
    while (race.time < end && race.callout?.id !== 'car4') {
      rival.distance = Math.max(rival.distance, race.distance + 30);
      await wait();
    }
    return { up, gone, counted, again: race.callout?.id === 'car4' };
  }, frame);
  expect(result).toEqual({ up: true, gone: true, counted: false, again: true });
});

test('the high ten\'s word at the finish doesn\'t come back at the start of the next race', async ({ page }) => {
  await raceAt(page, 1, { laps: 1 });
  await page.evaluate(async () => {
    const { game, session } = window.__game;
    game.toast(game.words.highTen);
    // The finish comes while the word is still up.
    await new Promise((resolve) => setTimeout(resolve, 300));
    session.finish();
  });
  await waitForScreen(page, 'finish');
  await page.locator('#play-again').click();
  await waitForScreen(page, 'playing');
  const again = await page.evaluate(async () => {
    const box = document.querySelector('#toast');
    const end = performance.now() + 1600;
    let seen = false;
    while (performance.now() < end) {
      if (box.textContent.includes('High ten!') && Number(getComputedStyle(box).opacity) > 0.05) seen = true;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return seen;
  });
  expect(again).toBe(false);
});

test('level 5: the others\' turbo is only labelled once the car using it is in the picture', async ({ page }) => {
  await raceAt(page, 5);
  const seen = await page.evaluate(() => {
    const { race } = window.__game;
    for (const rival of race.rivals) rival.turboLeft = 0;
    const rival = race.rivals[0];
    rival.turboLeft = 2;
    const at = (gap) => {
      rival.distance = race.distance + gap;
      return race.inSight('rivalTurbo') !== undefined;
    };
    const result = { behindCamera: at(-30), justBehind: at(-15), beside: at(0), ahead: at(25) };
    rival.turboLeft = 0;
    return result;
  });
  expect(seen).toEqual({ behindCamera: false, justBehind: false, beside: true, ahead: true });
});

test('level 5: the sunset\'s label waits for this race\'s sunset, not the last one\'s fading at the start', async ({ page }) => {
  await raceAt(page, 5);
  const early = await page.evaluate(async (next) => {
    const { race } = window.__game;
    const wait = new Function(`return (async () => { ${next} })();`);
    // As at the start of a race straight after one that ended at sunset: it's still fading back to day.
    race.weather.sunset = 1;
    let labelled = false;
    const end = race.time + 1.5;
    while (race.time < end) {
      await wait();
      if (race.callout?.id === 'sunset' || race.calledOut.has('sunset')) labelled = true;
    }
    return { labelled, sunset: race.weather.sunset };
  }, frame);
  expect(early.sunset).toBeGreaterThan(0.5);
  expect(early.labelled).toBe(false);
});

test('level 10: the first star past the line onto the golden lap counts twice too', async ({ page }) => {
  await raceAt(page, 10, { laps: 2 });
  await steerTo(page, 0);
  const step = await page.evaluate(async (next) => {
    const { race } = window.__game;
    const wait = new Function(`return (async () => { ${next} })();`);
    race.distance = race.track.length - 30;
    race.previousDistance = race.distance;
    race.lateral = 0;
    race.snapCamera = true;
    for (const rival of race.rivals) Object.assign(rival, { distance: race.distance - 200, wasAhead: false });
    let last = race.starTotal;
    const end = race.time + 3;
    while (race.time < end) {
      await wait();
      if (race.starTotal !== last) return { step: race.starTotal - last, past: race.distance - race.track.length };
      last = race.starTotal;
    }
    return { step: 0 };
  }, frame);
  console.log('first golden star', JSON.stringify(step));
  expect(step.past).toBeGreaterThanOrEqual(0);
  expect(step.step).toBe(2);
});

test('level 8: a high five that only came with closer hands doesn\'t make that side\'s reach harder afterwards', async ({ page }) => {
  await raceAt(page, 8);
  const result = await page.evaluate(async (next) => {
    const { race } = window.__game;
    const wait = new Function(`return (async () => { ${next} })();`);
    for (const rival of race.rivals) Object.assign(rival, { distance: race.distance - 300, wasAhead: false });
    // The right has been missed a few times, so its big hands have come in, and closer hands are on.
    race.reach.ease[1] = 0.6;
    race.powers.take('wide');
    race.gates.applyReach();
    // Over far enough for the closer hands, but not as far as without them.
    const lateral = (race.reachNow(1) + race.reach.reachFor(1)) / 2;
    race.autoLane = () => lateral;
    const lap = race.track.length * Math.max(0, race.lapIndex);
    race.distance = 920 + lap;
    race.previousDistance = race.distance;
    race.lateral = lateral;
    race.snapCamera = true;
    const before = race.reach.ease[1];
    const fives = race.fives;
    const end = race.time + 4;
    while (race.time < end && race.fives === fives) await wait();
    delete race.autoLane;
    return { slapped: race.fives > fives, before, after: race.reach.ease[1], lateral };
  }, frame);
  console.log('closer hands and easing', JSON.stringify(result));
  expect(result.slapped).toBe(true);
  expect(result.after).toBeLessThanOrEqual(result.before);
});

test('level 8: the treasure chest faces the car coming, turned a little towards the road', async ({ page }) => {
  await openGame(page, atLevel(8));
  await page.waitForTimeout(300);
  const facing = await page.evaluate(() => {
    const { race } = window.__game;
    const chest = race.chests.chests[0];
    chest.group.updateMatrixWorld(true);
    const at = chest.group.getWorldPosition(race.camera.position.clone());
    const front = chest.group.localToWorld(race.camera.position.clone().set(0, 0, 1)).sub(at).setY(0).normalize();
    const road = race.track.pointAt(chest.along, 0, race.camera.position.clone()).sub(at).setY(0).normalize();
    const heading = race.track.headingAt(chest.along);
    return { towardsRoad: front.x * road.x + front.z * road.z, towardsCar: -(front.x * Math.sin(heading) + front.z * Math.cos(heading)) };
  });
  expect(facing.towardsRoad).toBeGreaterThan(0.3);
  expect(facing.towardsCar).toBeGreaterThan(0.7);
});

test('level 10: the high ten\'s posts are off the road, and its gloves lean in over it, high enough to go under', async ({ page }) => {
  await openGame(page, atLevel(10));
  await page.waitForTimeout(300);
  const hands = await page.evaluate(() => {
    const { race } = window.__game;
    const { root, hands } = race.highTen;
    root.updateMatrixWorld(true);
    const local = (object, x = 0, y = 0, z = 0) => root.worldToLocal(object.localToWorld(race.camera.position.clone().set(x, y, z)));
    return hands.map(({ side, stand, pivot, hand }) => ({ side, post: local(stand).x, wrist: local(pivot).x, palm: local(hand, 0, 0.68, 0.272).x, cuff: local(hand, 0, -0.12, 0).y }));
  });
  console.log('high ten', JSON.stringify(hands));
  expect(hands).toHaveLength(2);
  for (const { side, post, wrist, palm, cuff } of hands) {
    // The road's edge is 6.5 m from its middle, and a car right over at the edge reaches 6.3 m.
    expect(post * side).toBeGreaterThanOrEqual(7.8 - 1e-6);
    expect(wrist * side).toBeLessThanOrEqual(6.5);
    expect(palm * side).toBeLessThan(wrist * side);
    expect(cuff).toBeGreaterThan(2.9);
  }
});

test('getting ready for another race at the same level doesn\'t get everything ready all over again', async ({ page }) => {
  await openGame(page, atLevel(3));
  const compiles = await page.evaluate(() => {
    const { race } = window.__game;
    const { renderer } = race;
    const compile = renderer.compile.bind(renderer);
    let count = 0;
    renderer.compile = (...args) => {
      count += 1;
      return compile(...args);
    };
    race.setLevel(3);
    const same = count;
    race.setLevel(4);
    const other = count - same;
    race.setLevel(3);
    renderer.compile = compile;
    return { same, other };
  });
  expect(compiles.same).toBe(0);
  expect(compiles.other).toBeGreaterThan(0);
});
