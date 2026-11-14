// The big hands at the roadside, which have to be reached with an open hand. Real photos go through
// the real tracker, and the hand is moved in the fake camera's picture.
import {
  expect,
  hands,
  openGame,
  reachRace,
  shot,
  show,
  test,
  waitForHand,
  waitForScreen,
  waitUntilMoving,
} from './helpers.js';

const TOWARDS = { 1: 150, '-1': -220 };

async function raceWithOpenHand(page, settings = {}) {
  await openGame(page, settings);
  await show(page, null, 'open');
  await reachRace(page);
  await waitForHand(page, 'open');
  await waitUntilMoving(page);
}

const progress = (page) => page.evaluate(() => {
  const { race } = window.__game;
  return {
    fives: race.fives,
    left: race.fivesLeft,
    right: race.fivesRight,
    met: race.gatesMet,
    boost: race.boostLeft,
    speed: race.speed,
    lateral: race.lateral,
    streak: race.streak,
    distance: race.distance,
  };
});

/** Puts the car a little before a big hand on that side, and says which one. */
function beforeGate(page, side, metres = 70) {
  return page.evaluate(([wanted, gap]) => {
    const { race } = window.__game;
    const lap = race.track.length * Math.max(0, race.lapIndex);
    const gate = race.gates.gates.find((candidate) => candidate.side === wanted && candidate.along + lap - gap > race.distance);
    race.distance = gate.along + lap - gap;
    return { along: gate.along + lap, side: gate.side };
  }, [side, metres]);
}

/** Holds the hand over to one side until the car has got there. */
async function reachTowards(page, side) {
  await show(page, null, 'open', { rightOffsetX: TOWARDS[side] });
  await expect.poll(async () => (await progress(page)).lateral * side, { timeout: 20_000 }).toBeGreaterThan(3);
}

for (const [name, side, count] of [['right', 1, 'right'], ['left', -1, 'left']]) {
  test(`reaching ${name} with an open hand slaps the big hand on that side, for a boost`, async ({ page }) => {
    await raceWithOpenHand(page, { steering: 'help' });
    await reachTowards(page, side);
    const before = await progress(page);
    const gate = await beforeGate(page, side);

    await expect.poll(async () => (await progress(page)).fives, { timeout: 20_000, intervals: [30] }).toBe(before.fives + 1);
    const after = await progress(page);
    expect(after[count]).toBe(before[count] + 1);
    expect(after.boost).toBeGreaterThan(1);
    expect(after.met).toBe(before.met + 1);
    await shot(page, `r-slap-${name}`);

    // A burst of small shapes where it happened, and the hand swinging back on its arm.
    const seen = await page.evaluate((along) => {
      const { race } = window.__game;
      const gateNow = race.gates.gates.find((candidate) => Math.abs(candidate.along - (along % race.track.length)) < 1);
      return { shapes: race.particles.items.filter((item) => item.life > 0).length, swing: Math.abs(gateNow.swing) + Math.abs(gateNow.swingSpeed) };
    }, gate.along);
    expect(seen.shapes).toBeGreaterThan(10);
    expect(seen.swing).toBeGreaterThan(0.01);

    // The boost shows up as speed the hand couldn't get to by itself.
    await expect.poll(async () => (await progress(page)).speed, { timeout: 5000 }).toBeGreaterThan(30);
  });
}

test('the glove really does meet the big hand', async ({ page }) => {
  await raceWithOpenHand(page, { steering: 'help' });
  for (const side of [1, -1]) {
    await reachTowards(page, side);
    await beforeGate(page, side);
    const apart = await page.evaluate(() => new Promise((resolve) => {
      const { race } = window.__game;
      const onFive = race.events.onFive;
      race.events.onFive = (...args) => {
        race.events.onFive = onFive;
        onFive(...args);
        const gate = race.gates.gates.find((candidate) => Math.abs(candidate.swingSpeed) > 8);
        race.scene.updateMatrixWorld(true);
        const glove = race.camera.position.clone();
        race.driver[race.handSide].root.getWorldPosition(glove);
        const hand = glove.clone();
        gate.hand.getWorldPosition(hand);
        hand.y += 1.4; // From the wrist up to the middle of the palm.
        resolve(glove.distanceTo(hand));
      };
    }));
    expect(apart).toBeLessThan(2.5);
    await page.waitForTimeout(300);
  }
});

test('a hand that keeps being missed moves closer, one side at a time', async ({ page }) => {
  await raceWithOpenHand(page, { steering: 'help', reach: 'big' });
  await reachTowards(page, -1);
  const before = await page.evaluate(() => {
    const { race } = window.__game;
    const right = race.gates.gates.find((gate) => gate.side === 1);
    const left = race.gates.gates.find((gate) => gate.side === -1);
    return { needs: race.reach.reachFor(1), left: race.reach.reachFor(-1), right: right.wantedX, leftAt: left.wantedX };
  });
  const gate = await beforeGate(page, 1, 40);
  await expect.poll(async () => (await progress(page)).distance, { timeout: 10_000, intervals: [30] }).toBeGreaterThan(gate.along + 2);
  const after = await page.evaluate(() => {
    const { race } = window.__game;
    const right = race.gates.gates.find((candidate) => candidate.side === 1);
    return { needs: race.reach.reachFor(1), right: right.wantedX };
  });
  expect(after.needs).toBeLessThan(before.needs);
  expect(after.right).toBeLessThan(before.right);
});

test('a car on the other side of the road just goes by: no boost, and no telling off', async ({ page }) => {
  await raceWithOpenHand(page, { steering: 'help' });
  await reachTowards(page, -1);
  const before = await progress(page);
  const gate = await beforeGate(page, 1, 40);
  await expect.poll(async () => (await progress(page)).distance, { timeout: 10_000, intervals: [30] }).toBeGreaterThan(gate.along + 2);
  const after = await progress(page);
  expect(after.fives).toBe(before.fives);
  expect(after.boost).toBe(0);
  expect(after.met).toBe(before.met + 1);
  expect(after.speed).toBeGreaterThan(before.speed - 3);
});

for (const [name, pose] of [['closed', 'fist'], ['out of view', null]]) {
  test(`a ${name} hand doesn't slap, even with the car right there`, async ({ page }) => {
    await raceWithOpenHand(page, { steering: 'help' });
    await reachTowards(page, 1);
    await show(page, null, pose, { rightOffsetX: TOWARDS[1] });
    await expect.poll(async () => (await hands(page)).handOpen).toBe(false);
    expect((await hands(page)).drive).toBe(0);
    const before = await progress(page);
    // The car rolls past the hand on what speed it still has.
    const along = await page.evaluate(() => {
      const { race } = window.__game;
      const lap = race.track.length * Math.max(0, race.lapIndex);
      const gate = race.gates.gates.find((candidate) => candidate.side === 1 && candidate.along + lap - 14 > race.distance);
      race.distance = gate.along + lap - 14;
      race.speed = 22;
      return gate.along + lap;
    });
    await expect.poll(async () => (await progress(page)).distance, { timeout: 10_000, intervals: [30] }).toBeGreaterThan(along);
    const after = await progress(page);
    expect(after.fives).toBe(before.fives);
    expect(after.boost).toBe(0);
    expect(after.met).toBe(before.met + 1);
    if (pose === 'fist') await shot(page, 'r-closed-at-hand');
    // It carries on slowing, friendly as ever, and the hand is asked to open.
    await expect.poll(async () => (await progress(page)).speed, { timeout: 8000 }).toBe(0);
  });
}

test('with the car steering itself, an open hand is all it takes', async ({ page }) => {
  await raceWithOpenHand(page, { steering: 'auto' });
  await expect.poll(async () => (await progress(page)).fives, { timeout: 40_000 }).toBeGreaterThan(1);
  await shot(page, 'r-auto-steering');
});

test('the first big hands are explained, with a film and an arrow to that side, and then it stops', async ({ page }) => {
  await raceWithOpenHand(page, { steering: 'help' });
  const gate = await beforeGate(page, 1, 58);
  await expect(page.locator('#prompt')).toHaveText(/High five the big hand!/, { timeout: 5000 });
  await expect(page.locator('#prompt-arrow-right')).toBeVisible();
  await expect(page.locator('.five-film')).toBeVisible();
  await shot(page, 'r-hint');
  expect(gate.side).toBe(1);

  await reachTowards(page, 1);
  await expect.poll(async () => (await progress(page)).fives, { timeout: 20_000 }).toBe(1);
  await reachTowards(page, -1);
  await beforeGate(page, -1, 58);
  await expect(page.locator('#prompt-arrow-left')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-five-film', 'left');
  await expect.poll(async () => (await progress(page)).fives, { timeout: 20_000 }).toBe(2);

  await beforeGate(page, 1, 58);
  await page.waitForTimeout(400);
  await expect(page.locator('#prompt')).not.toHaveText(/High five/);
  await expect(page.locator('.five-film')).toBeHidden();
});

test('how far to reach can be set, and a hand stands where that says', async ({ page }) => {
  await openGame(page, { reach: 'small' });
  const small = await page.evaluate(() => {
    const { race } = window.__game;
    return { needed: race.reach.reachFor(1), handAt: race.gates.gates.find((gate) => gate.side === 1).handX };
  });
  await page.locator('#open-panel').click();
  await page.locator('input[name="reach"][value="big"]').check();
  await page.locator('#close-panel').click();
  const big = await page.evaluate(() => {
    const { race } = window.__game;
    return { needed: race.reach.reachFor(1), handAt: race.gates.gates.find((gate) => gate.side === 1).handX };
  });
  expect(big.needed).toBeGreaterThan(small.needed);
  expect(big.handAt).toBeGreaterThan(small.handAt);
});

test('the summary says how many high fives there were, and to each side', async ({ page }) => {
  await raceWithOpenHand(page, { steering: 'help', laps: 1 });
  await reachTowards(page, 1);
  await beforeGate(page, 1);
  await expect.poll(async () => (await progress(page)).fives, { timeout: 20_000 }).toBe(1);
  await page.evaluate(() => {
    const { race } = window.__game;
    race.distance = race.raceDistance - 5;
  });
  await waitForScreen(page, 'finish');
  await expect(page.locator('#sum-right-fives')).toHaveText(/^1 of \d+$/);
  await expect(page.locator('#sum-right-sides')).toHaveText('Left 0, right 1');
  await page.waitForTimeout(600);
  await shot(page, 'r-summary');
});

test('the first big hand\'s hint is said aloud once, and after that only shown', async ({ page }) => {
  await openGame(page, { steering: 'help', voice: true, sound: true });
  await page.evaluate(() => {
    const { sound } = window.__game;
    const say = sound.say.bind(sound);
    window.__spoken = [];
    sound.say = (...args) => {
      const playing = say(...args);
      if (playing) window.__spoken.push(args[0]);
      return playing;
    };
  });
  await show(page, null, 'open');
  await reachRace(page);
  await waitForHand(page, 'open');
  await waitUntilMoving(page);
  const said = () => page.evaluate(() => window.__spoken.filter((line) => line === 'High five the big hand!').length);
  await beforeGate(page, 1, 58);
  await expect(page.locator('#prompt')).toHaveText(/High five the big hand!/, { timeout: 5000 });
  await expect.poll(said, { timeout: 8000 }).toBe(1);
  // The next big hand, missed on purpose so the hint stays: shown, and not said again.
  await page.evaluate(() => {
    window.__game.race.fives = 0;
  });
  await beforeGate(page, -1, 58);
  await expect(page.locator('#prompt')).toHaveText(/High five the big hand!/, { timeout: 5000 });
  await page.waitForTimeout(2500);
  expect(await said()).toBe(1);
});
