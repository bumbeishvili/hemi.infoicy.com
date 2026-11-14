// The other cars: who's driving them, bumps that are only ever friendly, overtaking, and waiting for a
// child who's resting.
import {
  car,
  expect,
  openGame,
  reachRace,
  shot,
  show,
  test,
  waitForHand,
  waitUntilMoving,
  waitUntilStopped,
} from './helpers.js';

async function raceWithOpenHand(page, settings = {}) {
  await openGame(page, settings);
  await show(page, null, 'open');
  await reachRace(page);
  await waitForHand(page, 'open');
  await waitUntilMoving(page);
}

test('Giraffe drives the child\'s car, with three other characters in the others', async ({ page }) => {
  await openGame(page);
  const cast = await page.evaluate(() => {
    const { race } = window.__game;
    return { you: race.player.spec.id, others: race.rivals.map((rival) => rival.spec.id) };
  });
  expect(cast).toEqual({ you: 'giraffe', others: ['truffle', 'kit', 'mochi'] });
});

test('whoever was chosen in the other games drives here too, and can be changed under the gear', async ({ page }) => {
  await openGame(page, { fighter: 'kit' });
  const cast = () => page.evaluate(() => {
    const { race } = window.__game;
    return { you: race.player.spec.id, others: race.rivals.map((rival) => rival.spec.id) };
  });
  expect(await cast()).toEqual({ you: 'kit', others: ['giraffe', 'truffle', 'mochi'] });

  await page.locator('#open-panel').click();
  await expect(page.locator('input[name="fighter"][value="kit"]')).toBeChecked();
  await page.locator('input[name="fighter"][value="tur"]').check();
  await page.locator('#close-panel').click();
  expect(await cast()).toEqual({ you: 'tur', others: ['giraffe', 'truffle', 'kit'] });
  await expect(page.locator('.order-row.is-you')).toHaveAttribute('data-who', 'tur');
});

test('any of the characters can drive, on either hand', async ({ page }) => {
  await openGame(page);
  const drivers = await page.locator('input[name="fighter"]').evaluateAll((inputs) => inputs.map((input) => input.value));
  expect(drivers).toHaveLength(10);
  expect(drivers[0]).toBe('giraffe');
  await page.locator('#open-panel').click();
  for (const [index, id] of drivers.entries()) {
    await page.locator(`input[name="fighter"][value="${id}"]`).check();
    if (index === 4) await page.locator('input[name="hands"][value="left"]').check();
    const driving = await page.evaluate(() => {
      const { race } = window.__game;
      race.update(1 / 60, {});
      race.render();
      return { id: race.player.spec.id, others: race.rivals.map((rival) => rival.spec.id) };
    });
    expect(driving.id).toBe(id);
    expect(driving.others).not.toContain(id);
    expect(new Set(driving.others).size).toBe(3);
  }
});

test('the order of the race shows everyone\'s face, and the child\'s car stands out', async ({ page }) => {
  await raceWithOpenHand(page);
  await expect(page.locator('.order-row')).toHaveCount(4);
  await expect(page.locator('.order-row.is-you')).toHaveAttribute('data-who', 'giraffe');
  const allHavePictures = await page.locator('.order-row img').evaluateAll((pictures) => pictures.every((picture) => picture.naturalWidth > 0));
  expect(allHavePictures).toBe(true);
});

test('bumping another car makes a few sparks and shoves it aside, and nobody loses anything', async ({ page }) => {
  await raceWithOpenHand(page, { steering: 'help' });
  const result = await page.evaluate(async () => {
    const { race } = window.__game;
    let bumps = 0;
    let sparks = 0;
    const onBump = race.events.onBump;
    race.events.onBump = () => {
      bumps += 1;
      sparks = race.particles.items.filter((item) => item.life > 0).length;
      onBump?.();
    };
    const rival = race.rivals[0];
    rival.distance = race.distance + 9;
    rival.lateral = race.lateral;
    rival.speed = 8;
    const speedBefore = race.speed;
    const end = performance.now() + 5000;
    while (bumps === 0 && performance.now() < end) {
      rival.lateral = race.lateral;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return { bumps, sparks, speedBefore, speedAfter: race.speed, apart: Math.abs(rival.lateral - race.lateral) };
  });
  expect(result.bumps).toBeGreaterThan(0);
  expect(result.sparks).toBeGreaterThan(3);
  expect(result.speedAfter).toBeGreaterThan(result.speedBefore * 0.85);
  await shot(page, 'r-bump');
  // Moments later they've moved apart, and the car hasn't gone through the other one.
  await expect.poll(() => page.evaluate(() => {
    const { race } = window.__game;
    return Math.abs(race.rivals[0].lateral - race.lateral);
  }), { timeout: 4000 }).toBeGreaterThan(1.5);
  expect((await car(page)).speed).toBeGreaterThan(12);
});

test('cars don\'t go through each other, whichever way they meet', async ({ page }) => {
  await raceWithOpenHand(page, { steering: 'help' });
  const worst = await page.evaluate(async () => {
    const { race } = window.__game;
    const rival = race.rivals[0];
    race.rivals[1].distance = race.distance + 300;
    race.rivals[2].distance = race.distance + 330;
    let most = 0;
    let bumps = 0;
    const onBump = race.events.onBump;
    race.events.onBump = () => {
      bumps += 1;
      onBump?.();
    };
    const started = performance.now();
    let placed = 0;
    while (performance.now() - started < 7000) {
      // Keeps getting in the way, from in front and from the side, every so often whatever's happened.
      if (performance.now() - started >= placed * 1200) {
        placed += 1;
        rival.distance = race.distance + 9;
        rival.lateral = race.lateral + (placed % 2 ? 0 : 1.5);
        rival.speed = 6;
        rival.bumpWait = 0;
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const overlap = Math.min(4.4 - Math.abs(rival.distance - race.distance), 2.6 - Math.abs(rival.lateral - race.lateral));
      most = Math.max(most, overlap);
    }
    return { most, bumps };
  });
  expect(worst.bumps).toBeGreaterThan(2);
  // A frame's worth at most, which is a bump, and not going through.
  expect(worst.most).toBeLessThan(1);
});

test('two cars side by side don\'t keep swapping places on the list', async ({ page }) => {
  await raceWithOpenHand(page, { steering: 'help' });
  const seen = await page.evaluate(async () => {
    const { race } = window.__game;
    const rival = race.rivals[0];
    race.rivals[1].distance = race.distance + 300;
    race.rivals[2].distance = race.distance + 330;
    rival.wasAhead = true;
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const place = (offset) => {
      // The car moves on a little before this is looked at, so this allows for that.
      rival.distance = race.distance + race.speed / 60 + offset;
      rival.lateral = -5;
      race.lateral = 3;
    };
    place(0.5);
    await nextFrame();
    await nextFrame();
    const before = race.place;
    let changes = 0;
    let crossings = 0;
    let side = 1;
    for (let frame = 0; frame < 120; frame += 1) {
      place(Math.sin(frame * 0.5) * 1.2);
      await nextFrame();
      const now = Math.sign(rival.distance - race.distance);
      if (now !== side) crossings += 1;
      side = now;
      if (race.place !== before) changes += 1;
    }
    return { changes, crossings };
  });
  // They really were swapping back and forth, and the place didn't change.
  expect(seen.crossings).toBeGreaterThan(5);
  expect(seen.changes).toBe(0);
});

test('overtaking is plain to see: who was passed, a wave, and the order changes', async ({ page }) => {
  await raceWithOpenHand(page, { steering: 'help' });
  await page.evaluate(() => {
    const { race } = window.__game;
    race.rivals.forEach((rival, index) => {
      rival.distance = race.distance + 200 + index * 30;
      rival.lateral = -4;
    });
    const rival = race.rivals[0];
    rival.distance = race.distance + 6;
    rival.lateral = -4.5;
    rival.speed = 5;
  });
  await expect.poll(() => page.evaluate(() => window.__game.race.rivals[0].wasAhead), { timeout: 15_000 }).toBe(true);
  await expect(page.locator('#toast')).toHaveText('You passed Truffle!', { timeout: 15_000 });
  await expect(page.locator('#toast')).toHaveClass(/is-showing/);
  await shot(page, 'r-overtake');
  const waving = await page.evaluate(() => window.__game.race.rivals[0].car.wave);
  expect(waving).toBeGreaterThan(0);
});

test('a slap\'s boost carries the child past the cars ahead', async ({ page }) => {
  await raceWithOpenHand(page, { steering: 'auto' });
  const gained = await page.evaluate(async () => {
    const { race } = window.__game;
    const rival = race.rivals[0];
    const before = rival.distance - race.distance;
    race.boostLeft = 2.2;
    const started = performance.now();
    while (performance.now() - started < 1800) await new Promise((resolve) => requestAnimationFrame(resolve));
    return before - (rival.distance - race.distance);
  });
  expect(gained).toBeGreaterThan(6);
});

test('driving with the hand open all race long, turbo and all, still leaves someone to race', async ({ page }) => {
  test.setTimeout(120_000);
  await raceWithOpenHand(page, { steering: 'help', laps: 4 });
  // Over half a minute of open-handed driving, with turbo coming and going and nothing being slapped.
  const seen = await page.evaluate(async () => {
    const { race } = window.__game;
    let framesWithCarAhead = 0;
    let frames = 0;
    let passes = 0;
    const onOvertake = race.events.onOvertake;
    race.events.onOvertake = (...args) => {
      passes += 1;
      onOvertake?.(...args);
    };
    const end = performance.now() + 30_000;
    while (performance.now() < end) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      frames += 1;
      if (race.rivals.some((rival) => rival.distance > race.distance && rival.distance - race.distance < 60)) framesWithCarAhead += 1;
    }
    return { share: framesWithCarAhead / frames, turbo: race.turbo.everFull };
  });
  console.log('a car in view ahead for', seen.share.toFixed(2), 'of the time');
  expect(seen.turbo).toBe(true);
  expect(seen.share).toBeGreaterThan(0.5);
});

test('on the last stretch the others ease off, and the child goes through the line first', async ({ page }) => {
  await raceWithOpenHand(page, { steering: 'help', laps: 1 });
  await page.evaluate(() => {
    const { race } = window.__game;
    race.distance = race.raceDistance - 165;
    race.snapCamera = true;
    race.rivals.forEach((rival, index) => {
      rival.distance = race.distance + 10 + index * 8;
      rival.lateral = [-4, 4, 0][index];
      rival.lane = [-4, 4, 0][index];
    });
  });
  await expect.poll(async () => (await car(page)).place, { timeout: 20_000, intervals: [50] }).toBe(1);
  const before = await page.evaluate(() => {
    const { race } = window.__game;
    return race.raceDistance - race.distance;
  });
  expect(before).toBeGreaterThan(5);
  await shot(page, 'r-last-stretch');
});

test('resting costs no places: everyone waits, and the cars behind stay behind', async ({ page }) => {
  await raceWithOpenHand(page, { steering: 'help' });
  await page.evaluate(() => {
    const { race } = window.__game;
    race.rivals[0].distance = race.distance - 60;
    race.rivals[1].distance = race.distance - 30;
    race.rivals[2].distance = race.distance + 25;
  });
  await show(page, null, 'fist');
  await waitForHand(page, 'closed');
  await waitUntilStopped(page);
  const place = (await car(page)).place;
  expect(place).toBe(2);
  await page.waitForTimeout(6000);
  await shot(page, 'r-resting');
  const waiting = await page.evaluate(() => {
    const { race } = window.__game;
    return {
      place: race.place,
      gaps: race.rivals.map((rival) => rival.distance - race.distance),
      speeds: race.rivals.map((rival) => rival.speed),
    };
  });
  expect(waiting.place).toBe(place);
  expect(waiting.gaps[0]).toBeLessThan(0);
  expect(waiting.gaps[1]).toBeLessThan(0);
  expect(waiting.gaps[2]).toBeGreaterThan(0);
  expect(waiting.gaps[2]).toBeLessThan(60);
  for (const speed of waiting.speeds) expect(speed).toBeLessThan(2);

  // Opening again carries on, as if nothing had happened.
  await show(page, null, 'open');
  await waitForHand(page, 'open');
  await waitUntilMoving(page);
});
