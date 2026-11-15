// The racer's levels. Level 10 has five other cars, who race harder and use turbo now and then, more big
// hands with two in a row on one side and a slalom, and ramps to one side of the road that jump straight
// into a high five, as well as everything new that each level brings (new-things.spec.js). It can still be
// finished, the child still wins, and flying still works. Level 1 is what the rest of this folder's tests
// check, and safety.spec.js runs its checks at level 1, 6 and 10.
import {
  car,
  expect,
  openGame,
  reachRace,
  shot,
  show,
  test,
  waitForHand,
  waitForScreen,
  waitUntilMoving,
} from './helpers.js';

const AT_10 = { levels: { 'high-five-racers': 10 } };

async function raceWithOpenHand(page, settings = {}) {
  await openGame(page, { ...AT_10, ...settings });
  await show(page, null, 'open');
  await reachRace(page);
  await waitForHand(page, 'open');
  await waitUntilMoving(page);
}

/** Puts the car a little before a spot on the lap, snapping the camera there. */
const goTo = (page, along, lateral = null) => page.evaluate(([where, across]) => {
  const { race } = window.__game;
  const lap = race.track.length * Math.max(0, race.lapIndex);
  race.distance = where + lap;
  if (across !== null) race.lateral = across;
  race.snapCamera = true;
}, [along, lateral]);

test('level 10 has five other cars, more big hands and ramps, and the order shows everyone', async ({ page }) => {
  await openGame(page, AT_10);
  // The title screen already shows this level's race.
  const before = await page.evaluate(() => window.__game.race.rivals.length);
  expect(before).toBe(5);
  await show(page, null, 'open');
  await reachRace(page);
  const seen = await page.evaluate(() => {
    const { race } = window.__game;
    const gates = race.gates.gates.map(({ along, side, root }) => ({ along, side, shown: root.visible }));
    return {
      level: race.level,
      rivals: race.rivals.map((rival) => rival.spec.id),
      shownCars: race.garage.filter((rival) => rival.car.group.visible).length,
      gates,
      hiddenGates: race.gates.pool.filter((gate) => !gate.root.visible).length,
      ramps: race.ramps.layout,
      shownRamps: race.ramps.pool.filter((mesh) => mesh.visible).length,
      stars: race.stars.stars.length,
      starsDrawn: race.stars.mesh.count,
      place: race.place,
    };
  });
  expect(seen.level).toBe(10);
  expect(seen.rivals).toHaveLength(5);
  expect(new Set(seen.rivals).size).toBe(5);
  expect(seen.rivals).not.toContain('giraffe');
  expect(seen.shownCars).toBe(5);
  expect(seen.place).toBe(6);
  expect(seen.gates).toHaveLength(19);
  expect(seen.gates.every(({ shown }) => shown)).toBe(true);
  expect(seen.hiddenGates).toBe(0);
  // Two in a row on one side, and the slalom at the start of the lap.
  expect(seen.gates.some(({ side }, index) => index > 0 && seen.gates[index - 1].side === side)).toBe(true);
  expect(seen.gates.slice(0, 5).map(({ side }) => side)).toEqual([1, -1, 1, -1, 1]);
  expect(seen.ramps.filter(({ lateral }) => lateral !== 0)).toHaveLength(2);
  expect(seen.shownRamps).toBe(5);
  expect(seen.starsDrawn).toBe(seen.stars);
  expect(seen.stars).toBeGreaterThan(100);
  await expect(page.locator('.order-row')).toHaveCount(6);
  await expect(page.locator('#chip-place')).toHaveText('6th');

  // The slalom through the village, seen from the car, once "Go!" has gone.
  await page.waitForTimeout(1500);
  await goTo(page, 70, 0);
  await page.waitForTimeout(500);
  await shot(page, 'high-five-racers-level10-slalom');
});

test('the stars lead over to each big hand at level 10, even two close together', async ({ page }) => {
  await openGame(page, AT_10);
  const plan = await page.evaluate(() => {
    const { race } = window.__game;
    return race.gates.gates.map((gate, index) => {
      const previous = race.gates.gates[index - 1]?.along ?? -Infinity;
      // Before a ramp to one side, the stars over the ramp are the end of the trail.
      const trail = race.stars.stars.filter((star) => star.along > Math.max(previous, gate.along - 60) && star.along < gate.along)
        .sort((a, b) => a.along - b.along);
      return { along: gate.along, side: gate.side, count: trail.length, last: trail.at(-1)?.lateral ?? 0 };
    });
  });
  for (const { along, side, count, last } of plan) {
    expect(count, `stars before the big hand at ${along}`).toBeGreaterThan(1);
    expect(last * side, `the last star before ${along}`).toBeGreaterThan(2.5);
  }
});

test('a ramp to one side sends the car up and straight into a high five', async ({ page }) => {
  await raceWithOpenHand(page, { steering: 'help' });
  // Over to the right, where the ramp is.
  await show(page, null, 'open', { rightOffsetX: 150 });
  await expect.poll(async () => (await car(page)).lateral, { timeout: 20_000 }).toBeGreaterThan(3);
  const result = await page.evaluate(async () => {
    const { race } = window.__game;
    const ramp = race.ramps.layout.find((candidate) => candidate.lateral > 0
      && race.gates.gates.some((gate) => gate.side === 1 && gate.along > candidate.along && gate.along - candidate.along < 40));
    const lap = race.track.length * Math.max(0, race.lapIndex);
    race.distance = ramp.along + lap - 30;
    race.snapCamera = true;
    const fivesBefore = race.fives;
    let highest = 0;
    const end = performance.now() + 6000;
    while (race.fives === fivesBefore && performance.now() < end) {
      highest = Math.max(highest, race.lift);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return { highest, fives: race.fives - fivesBefore, ramp: ramp.along };
  });
  expect(result.highest).toBeGreaterThan(1.5);
  expect(result.fives).toBe(1);
  await page.waitForTimeout(120);
  await shot(page, 'high-five-racers-level10-side-ramp-five');
});

test('the others use turbo now and then, with flames, and get passed again', async ({ page }) => {
  // A loosely open hand, which drives without turbo: the others hold back while the child is boosting.
  await openGame(page, { ...AT_10, steering: 'help', strictness: { right: 0.5 } });
  await show(page, null, 'open');
  await reachRace(page);
  await show(page, null, 'relaxed');
  await waitForHand(page, 'open');
  await waitUntilMoving(page);
  const seen = await page.evaluate(async () => {
    const { race } = window.__game;
    // The child's own turbo comes by itself, and the others hold back during it, so it's kept off here.
    const ownTurbo = race.turbo.update;
    race.turbo.reset();
    race.turbo.update = () => {};
    // One just behind, ready to go.
    race.rivals.forEach((rival, index) => {
      rival.distance = race.distance + 120 + index * 30;
      rival.turboIn = 999;
    });
    const rival = race.rivals[0];
    rival.distance = race.distance - 15;
    rival.lateral = -4;
    rival.turboIn = 0;
    let flames = false;
    let passedUs = false;
    let turbos = 0;
    const onRivalTurbo = race.events.onRivalTurbo;
    race.events.onRivalTurbo = (...args) => {
      turbos += 1;
      onRivalTurbo?.(...args);
    };
    const end = performance.now() + 5000;
    while (performance.now() < end) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      flames = flames || rival.car.flames.some((flame) => flame.visible);
      passedUs = passedUs || rival.distance > race.distance + 3;
      if (passedUs && flames && rival.turboLeft === 0) break;
    }
    race.turbo.update = ownTurbo;
    return { turbos, flames, passedUs, fastest: rival.speed };
  });
  expect(seen.turbos).toBe(1);
  expect(seen.flames).toBe(true);
  expect(seen.passedUs).toBe(true);
  await shot(page, 'high-five-racers-level10-rival-turbo');
  // A slap's boost carries the child past it again.
  const gained = await page.evaluate(async () => {
    const { race } = window.__game;
    const rival = race.rivals[0];
    const before = rival.distance - race.distance;
    race.boostLeft = 2.2;
    const started = performance.now();
    while (performance.now() - started < 1800) await new Promise((resolve) => requestAnimationFrame(resolve));
    return before - (rival.distance - race.distance);
  });
  expect(gained).toBeGreaterThan(3);
});

test('nobody uses turbo while a child rests, and resting still costs no places', async ({ page }) => {
  await raceWithOpenHand(page, { steering: 'help' });
  await page.evaluate(() => {
    const { race } = window.__game;
    race.rivals.forEach((rival, index) => {
      rival.distance = race.distance - 40 - index * 12;
      rival.turboIn = 0;
    });
  });
  await show(page, null, 'fist');
  await waitForHand(page, 'closed');
  await expect.poll(async () => (await car(page)).speed, { timeout: 30_000 }).toBe(0);
  const place = (await car(page)).place;
  await page.waitForTimeout(5000);
  const waiting = await page.evaluate(() => {
    const { race } = window.__game;
    return { place: race.place, turbo: race.rivals.some((rival) => rival.turboLeft > 0), behind: race.rivals.every((rival) => rival.distance < race.distance) };
  });
  expect(waiting).toEqual({ place, turbo: false, behind: true });
});

test('a whole race at level 10 can be finished, and the child still wins', async ({ page }) => {
  test.setTimeout(240_000);
  await raceWithOpenHand(page, { laps: 1, steering: 'auto' });
  const first = await car(page);
  expect(first.place).toBeGreaterThan(1);
  await waitForScreen(page, 'finish');
  await expect(page.locator('#screen-finish h2')).toHaveText('You won the race!');
  await expect(page.locator('#level-done-text')).toHaveText('All 10 levels done!');
  const done = await page.evaluate(() => {
    const { race } = window.__game;
    return { place: race.place, fives: race.fives, met: race.gatesMet, stars: race.starTotal, coins: race.coinTotal, prizes: race.prizes };
  });
  console.log('level 10 race', JSON.stringify(done));
  expect(done.place).toBe(1);
  expect(done.met).toBeGreaterThanOrEqual(19);
  expect(done.fives).toBeGreaterThan(10);
  expect(done.stars).toBeGreaterThan(20);
  // With the car steering itself, it picks up coins, the treasure chest and the high ten on the way.
  expect(done.coins).toBeGreaterThan(30);
  expect(done.prizes.chests).toBe(1);
  expect(done.prizes.highTens).toBe(1);
  await expect(page.locator('#finish-prizes')).toContainText(`🪙 ${done.coins} coins`);
  await page.waitForTimeout(1000);
  await shot(page, 'high-five-racers-level10-finish');
});

test('on the last stretch at level 10 the others still ease off, and the child goes through first', async ({ page }) => {
  await raceWithOpenHand(page, { steering: 'help', laps: 1 });
  await page.evaluate(() => {
    const { race } = window.__game;
    race.distance = race.raceDistance - 165;
    race.snapCamera = true;
    race.rivals.forEach((rival, index) => {
      rival.distance = race.distance + 10 + index * 8;
      rival.lateral = [-4, 4, 0, -2, 2][index];
      rival.lane = rival.lateral;
      rival.turboIn = 0;
    });
  });
  await expect.poll(async () => (await car(page)).place, { timeout: 20_000, intervals: [50] }).toBe(1);
  expect(await page.evaluate(() => window.__game.race.rivals.some((rival) => rival.turboLeft > 0))).toBe(false);
});

test('flying with the other hand still works at level 10, and stays under the footbridge', async ({ page }) => {
  await openGame(page, { ...AT_10, strictness: { right: 0.5 } });
  await show(page, null, 'open');
  await reachRace(page);
  await show(page, 'open', 'relaxed');
  await waitForHand(page, 'open');
  const otherHand = () => page.evaluate(() => window.__game.monitor.snapshot.other.status);
  await expect.poll(otherHand, { timeout: 15_000 }).toBe('open');
  await expect.poll(async () => (await car(page)).speed, { timeout: 15_000 }).toBeGreaterThan(12);
  // Just before the footbridge by the lake, which a big hand and a ramp to one side are near at this level.
  await goTo(page, 640);
  // Watched from before the fist is made, as the car is up the moment the hand is seen to open after it, which
  // can be before the test has shown it open. Started after, the watch saw only what was left of the flight on
  // its way down, anything from 3.4 to 5.8 metres, and failed when it was late.
  const watch = page.evaluate(async () => {
    const { race } = window.__game;
    let highest = 0;
    let flew = false;
    const end = performance.now() + 40_000;
    while (performance.now() < end) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      flew = flew || race.soaring;
      highest = Math.max(highest, race.lift);
      if (flew && !race.soaring) break;
    }
    return { flew, highest };
  });
  await show(page, 'fist', 'relaxed');
  await expect.poll(otherHand, { timeout: 15_000 }).toBe('closed');
  await show(page, 'open', 'relaxed');
  const flight = await watch;
  expect(flight.flew).toBe(true);
  expect(flight.highest).toBeGreaterThan(4);
  // The car's roof is about 1.6 m above where it is, and the footbridge's deck is at 10.6 m.
  expect(flight.highest).toBeLessThan(7.5);
});

/** Nothing on screen may stick out past the window, with six faces in the race's order. */
for (const { name, width, height } of [{ name: 'phone-landscape', width: 844, height: 390 }, { name: 'phone-portrait', width: 390, height: 844 }, { name: 'laptop', width: 1280, height: 720 }]) {
  test(`six cars in the order fit a ${name} screen`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await raceWithOpenHand(page, { steering: 'help' });
    await expect(page.locator('.order-row')).toHaveCount(6);
    const cutOff = await page.evaluate(() => {
      const visible = (element) => {
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
      };
      const boxes = [...document.querySelectorAll('.prompt, .camera-frame, .meter, .wheel, .chip, .gear, .turbo, .race-order, .order-row, .five-film')].filter(visible);
      const out = boxes.filter((element) => {
        const box = element.getBoundingClientRect();
        return box.left < -8 || box.top < -8 || box.right > innerWidth + 8 || box.bottom > innerHeight + 8;
      }).map((element) => element.className || element.id);
      // The order mustn't run into the hand meters or the little film at the bottom either, when it's showing.
      const order = document.querySelector('.race-order').getBoundingClientRect();
      const meters = [...document.querySelectorAll('.meter, .hand-demo')].map((meter) => meter.getBoundingClientRect());
      const onMeters = meters.some((meter) => order.left < meter.right && order.right > meter.left && order.top < meter.bottom && order.bottom > meter.top);
      return { out, onMeters };
    });
    expect(cutOff).toEqual({ out: [], onMeters: false });
    await shot(page, `high-five-racers-level10-${name}`);
  });
}
