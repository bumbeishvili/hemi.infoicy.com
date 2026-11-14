// The rule that matters most: the car moves only while the chosen hand is really open.
// Real photos go through the real model, the real tracker and the real game.
import {
  car,
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
  waitUntilStopped,
} from './helpers.js';

async function raceWithOpenHand(page, settings = {}) {
  await openGame(page, settings);
  await show(page, null, 'open');
  await reachRace(page);
  await waitForHand(page, 'open');
  await waitUntilMoving(page);
}

async function expectCarStaysStopped(page) {
  await waitUntilStopped(page);
  const { distance } = await car(page);
  await page.waitForTimeout(700);
  expect((await car(page)).distance).toBe(distance);
}

const prompt = (page) => page.locator('#prompt');

test('the right hand is the default, and left is the only other choice', async ({ page }) => {
  await openGame(page);
  expect(await page.evaluate(() => window.__game.monitor.side)).toBe('right');
  await expect(page.locator('#tagline')).toHaveText('Open your right hand to make your car go!');

  await page.locator('#open-panel').click();
  const options = await page.locator('input[name="hands"]').evaluateAll((inputs) => inputs.map((input) => input.value));
  expect(options).toEqual(['left', 'right']);
  await expect(page.locator('input[name="hands"][value="right"]')).toBeChecked();
  await expect(page.locator('.panel-hand[data-side="left"]')).toBeHidden();
  await expect(page.locator('.panel-hand[data-side="right"]')).toBeVisible();

  await page.locator('input[name="hands"][value="left"]').check();
  await page.waitForTimeout(100);
  await shot(page, '94-panel-left-hand-chosen');
  await expect(page.locator('.panel-hand[data-side="right"]')).toBeHidden();
  await expect(page.locator('.panel-hand[data-side="left"]')).toBeVisible();
  await page.locator('#close-panel').click();
  await expect(page.locator('#tagline')).toHaveText('Open your left hand to make your car go!');

  await page.reload();
  await expect(page.locator('#start')).toBeVisible();
  expect(await page.evaluate(() => window.__game.monitor.side)).toBe('left');
});

test('a saved "both hands" from before falls back to the right hand', async ({ page }) => {
  await openGame(page, { hands: 'both' });
  expect(await page.evaluate(() => window.__game.monitor.side)).toBe('right');
  await page.locator('#open-panel').click();
  await expect(page.locator('input[name="hands"][value="right"]')).toBeChecked();
});

test('the hand can play the whole game alone, with only its meter and glove showing', async ({ page }) => {
  await raceWithOpenHand(page);
  await page.waitForTimeout(600);
  await shot(page, '90-right-hand-driving');
  await expect(page.locator('#meter-right')).toBeVisible();
  await expect(page.locator('#meter-left')).toBeHidden();
  const gloves = await page.evaluate(() => {
    const { left, right } = window.__game.race.driver;
    return { left: left.root.visible, right: right.root.visible };
  });
  expect(gloves).toEqual({ left: false, right: true });
});

test('the car stops for every pose that is not an open hand', async ({ page }) => {
  await raceWithOpenHand(page);

  for (const pose of ['fist', 'pointing', 'victory', 'thumbs-up']) {
    await test.step(pose, async () => {
      await show(page, null, pose);
      await waitForHand(page, 'closed');
      await expectCarStaysStopped(page);
      expect((await hands(page)).drive).toBe(0);
      await expect(prompt(page)).toHaveText(/Open your right hand!/);
      if (pose === 'fist') await shot(page, '91-right-hand-fist');

      await show(page, null, 'open');
      await waitForHand(page, 'open');
      await waitUntilMoving(page);
    });
  }
});

test('a hand out of view stops the car and is asked for by name', async ({ page }) => {
  await raceWithOpenHand(page);

  await show(page, null, null);
  await waitForHand(page, 'missing');
  await expectCarStaysStopped(page);
  await expect(prompt(page)).toHaveText(/Show your right hand!/);

  await show(page, null, 'open');
  await waitForHand(page, 'open');
  await waitUntilMoving(page);
  await expect(prompt(page)).not.toHaveText(/Show/);
});

test('the hand still counts when it is on the other side of the picture', async ({ page }) => {
  await raceWithOpenHand(page);
  await show(page, null, 'open', { rightOffsetX: -620 });
  await page.waitForTimeout(1500);
  expect((await hands(page)).right.status).toBe('open');
  expect((await car(page)).speed).toBeGreaterThan(12);
});

test('the other hand can\'t stand in for it, wherever it is', async ({ page }) => {
  await raceWithOpenHand(page);

  for (const [where, leftOffsetX] of [['on its own side', 0], ['on the right of the picture', 620]]) {
    await test.step(where, async () => {
      await show(page, 'open', null, { leftOffsetX });
      await waitForHand(page, 'missing');
      await expectCarStaysStopped(page);
      await expect(prompt(page)).toHaveText(/Show your right hand!/);
      expect(await page.evaluate(() => window.__game.monitor.snapshot.otherHandSeen)).toBe(true);

      await show(page, null, 'open');
      await waitUntilMoving(page);
    });
  }
});

test('the panel says when it only sees the other hand', async ({ page }) => {
  await raceWithOpenHand(page);
  await show(page, 'open', null);
  await waitForHand(page, 'missing');
  await page.locator('#open-panel').click();
  await expect(page.locator('.panel-hand[data-side="right"] .panel-state')).toHaveText('? Only sees the other hand');
});

test('the other hand can rest however it likes', async ({ page }) => {
  await raceWithOpenHand(page);

  for (const pose of ['fist', 'open', 'victory']) {
    await show(page, pose, 'open');
    await page.waitForTimeout(700);
    expect((await hands(page)).handOpen, `other hand showing ${pose}`).toBe(true);
    expect((await car(page)).speed).toBeGreaterThan(12);
  }

  // Being open itself doesn't help if the hand in play isn't.
  await show(page, 'open', 'fist');
  await waitForHand(page, 'closed');
  await waitUntilStopped(page);
});

test('overlapping hands, or the hand off the edge or too far away, don\'t drive', async ({ page }) => {
  await raceWithOpenHand(page);

  const notDriving = async () => {
    await expect.poll(async () => (await hands(page)).handOpen, { timeout: 20_000 }).toBe(false);
    await expectCarStaysStopped(page);
  };

  await test.step('the other hand over this one', async () => {
    await show(page, 'open', 'open', { rightOffsetX: -500, leftOnTop: true });
    await notDriving();
  });

  await show(page, null, 'open');
  await waitForHand(page, 'open');
  await waitUntilMoving(page);

  await test.step('half out of the picture', async () => {
    await show(page, null, 'open', { rightOffsetX: 290 });
    await notDriving();
  });

  await show(page, null, 'open');
  await waitForHand(page, 'open');
  await waitUntilMoving(page);

  await test.step('very far from the camera', async () => {
    await show(page, null, 'open', { scale: 0.16 });
    await notDriving();
  });
});

test('a frozen tracker stops the car rather than leaving it driving', async ({ page }) => {
  await raceWithOpenHand(page);
  // Simulates the tracker hanging: results stop arriving but the camera keeps running.
  await page.evaluate(() => {
    window.__game.camera.onResult = () => {};
    window.__game.camera.sendFrame = async () => {};
  });
  await waitForHand(page, 'missing');
  await expectCarStaysStopped(page);
});

test('the left hand works the same way when it is chosen', async ({ page }) => {
  await openGame(page, { hands: 'left' });
  await show(page, 'open', null);
  await reachRace(page);
  await waitForHand(page, 'open', 'left');
  await waitUntilMoving(page);
  await expect(page.locator('#meter-left')).toBeVisible();
  await expect(page.locator('#meter-right')).toBeHidden();

  await show(page, 'fist', null);
  await waitForHand(page, 'closed', 'left');
  await waitUntilStopped(page);
  await expect(prompt(page)).toHaveText(/Open your left hand!/);

  await show(page, null, 'open');
  await waitForHand(page, 'missing', 'left');
  await expectCarStaysStopped(page);
  await expect(prompt(page)).toHaveText(/Show your left hand!/);
});

test('the summary only reports the hand that played', async ({ page }) => {
  await raceWithOpenHand(page);
  await page.evaluate(() => {
    const { race } = window.__game;
    race.distance = race.raceDistance - 5;
    for (const rival of race.rivals) rival.distance = Math.min(rival.distance, race.raceDistance - 30);
  });
  await waitForScreen(page, 'finish');
  await expect(page.locator('#finish-open')).toContainText('Right hand open for');
  await expect(page.locator('.summary thead th', { hasText: 'Right hand' })).toBeVisible();
  await expect(page.locator('.summary thead th', { hasText: 'Left hand' })).toBeHidden();
  await page.waitForTimeout(600);
  await shot(page, '93-right-hand-summary');
});
