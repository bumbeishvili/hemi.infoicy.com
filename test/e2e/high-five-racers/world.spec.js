// The world the race goes through: what's in it, and how the start and the ramps behave.
import { car, expect, openGame, reachRace, shot, show, test, waitForHand, waitForScreen, waitUntilMoving } from './helpers.js';

test('the lights over the start line come on one by one, and go green for the off', async ({ page }) => {
  await openGame(page);
  await show(page, null, 'open');
  await page.evaluate(() => {
    const { race, session } = window.__game;
    window.__lights = [];
    const lights = race.world.places.startLights;
    const watch = () => {
      if (window.__lights.at(-1) !== lights.showing) window.__lights.push(lights.showing);
      if (session.screen !== 'playing') requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
  await page.locator('#start').click();
  await waitForScreen(page, 'countdown');
  await shot(page, 'r-start-lights');
  await waitForScreen(page, 'playing');
  await expect.poll(() => page.evaluate(() => window.__lights.at(-1))).toBe('green');
  const seen = await page.evaluate(() => window.__lights);
  expect(seen).toEqual(['dark', '1 red', '2 red', '3 red', 'green']);
  // Out of the way once the race is on, as they'd otherwise go just over the camera.
  expect(await page.evaluate(() => window.__game.race.world.places.startLights.lifted)).toBe(true);
});

test('taking a ramp at speed sends the car into the air, and it lands softly and carries on', async ({ page }) => {
  await openGame(page, { steering: 'help' });
  await show(page, null, 'open');
  await reachRace(page);
  await waitForHand(page, 'open');
  await waitUntilMoving(page);
  const before = await car(page);
  const flight = await page.evaluate(async () => {
    const { race } = window.__game;
    let landed = 0;
    const onLanded = race.events.onLanded;
    race.events.onLanded = () => {
      landed += 1;
      onLanded?.();
    };
    const [ramp] = race.ramps.spots;
    race.distance = ramp - 30;
    race.lateral = 0;
    race.snapCamera = true;
    let highest = 0;
    let shown = 0;
    const end = performance.now() + 6000;
    while (landed === 0 && performance.now() < end) {
      highest = Math.max(highest, race.lift);
      shown = Math.max(shown, race.player.group.position.y - race.track.heightAt(race.distance));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return { highest, shown, landed, flying: race.flying };
  });
  expect(flight.landed).toBe(1);
  expect(flight.flying).toBe(false);
  expect(flight.highest).toBeGreaterThan(1.5);
  expect(flight.shown).toBeGreaterThan(1.4);
  const after = await car(page);
  expect(after.speed).toBeGreaterThanOrEqual(before.speed - 1);
});

test('a ramp is only for a car going over it, and a car beside it stays on the road', async ({ page }) => {
  await openGame(page, { steering: 'help' });
  await show(page, null, 'open');
  await reachRace(page);
  await waitForHand(page, 'open');
  await waitUntilMoving(page);
  const flew = await page.evaluate(async () => {
    const { race } = window.__game;
    const [ramp] = race.ramps.spots;
    race.distance = ramp - 25;
    race.snapCamera = true;
    let flying = false;
    while (race.distance < ramp + 15) {
      // Held out at the side of the road, wherever the hand is.
      race.lateral = 4.5;
      flying = flying || race.flying;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return flying;
  });
  expect(flew).toBe(false);
});

test('there\'s plenty along the road, and the world is drawn in pieces so most of it can be skipped', async ({ page }) => {
  await openGame(page);
  const seen = await page.evaluate(() => {
    const { race } = window.__game;
    let instanced = 0;
    let people = 0;
    let meshes = 0;
    race.scene.traverse((node) => {
      if (node.isInstancedMesh) instanced += node.count;
      if (node.isMesh) meshes += 1;
    });
    for (const crowd of race.world.places.crowd) people += crowd.count;
    return { instanced, people: people / 2, meshes, gates: race.gates.gates.length, ramps: race.ramps.spots.length, stars: race.stars.stars.length };
  });
  console.log(JSON.stringify(seen));
  expect(seen.instanced).toBeGreaterThan(5000);
  expect(seen.people).toBeGreaterThan(700);
  expect(seen.gates).toBeGreaterThan(10);
  expect(seen.ramps).toBe(3);
  expect(seen.stars).toBeGreaterThan(60);
});

test('big hands alternate sides, and the stars lead over to each one', async ({ page }) => {
  await openGame(page);
  const plan = await page.evaluate(() => {
    const { race } = window.__game;
    return race.gates.gates.map((gate) => {
      const trail = race.stars.stars.filter((star) => star.along > gate.along - 20 && star.along < gate.along);
      return { along: gate.along, side: gate.side, last: trail.at(-1)?.lateral ?? 0 };
    });
  });
  plan.forEach(({ side, last }, index) => {
    if (index > 0) expect(side).toBe(-plan[index - 1].side);
    expect(last * side).toBeGreaterThan(2.5);
  });
});
