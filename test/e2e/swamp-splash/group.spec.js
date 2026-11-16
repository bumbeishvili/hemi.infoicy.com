// Swamp Splash with several playing in front of one camera: a grown-up says how many on the chooser, each has a
// character of their own, side by side, each one's jumps are followed on their own, and all the mud lands on the
// one window. In place of the webcam there is footage of real people side by side, read by the real tracker:
// see showPeople in test/e2e/fake-camera.js.
import { expect, GAME, openSwamp, test, waitForScreen } from './helpers.js';

// A person standing still, and one doing three burpees over and over, each ending in a real jump. Each clip is
// cut around where its person stands in it.
const STANDING = { name: 'strikes', from: 0.2, playing: false, at: 0.38 };
const JUMPING = { name: 'jumps', at: 0.38 };

const showPeople = (page, clips) => page.evaluate((list) => window.__camera.showPeople(list), clips);
const showPerson = (page, index, clip) => page.evaluate(([at, what]) => window.__camera.showPerson(at, what), [index, clip]);

/** What the game makes of who's there. */
const group = (page) => page.evaluate(() => {
  const { game, swamp, view } = window.__game;
  return {
    screen: game.screen,
    players: game.players.length,
    looksFor: game.camera.people,
    seen: game.players.map(({ body }) => Boolean(body)),
    cast: game.cast.map(({ name }) => name),
    characters: view.arts.length,
    feet: view.arts.map((_, index) => view.feetOf(index).x),
    jumps: game.jumpers.map(({ jumps }) => jumps),
    all: swamp?.stats.jumps ?? 0,
    coverage: swamp?.coverage ?? 0,
    time: swamp?.time ?? 0,
    lost: game.bodyLost(),
  };
});

/** From the title to the chooser, with so many chosen to play. */
async function choose(page, count, settings = {}) {
  await openSwamp(page, { swampRain: 'gentle', ...settings });
  await page.locator('#start').click();
  await waitForScreen(page, 'choose');
  if (count > 1) await page.locator(`input[name="group-size"][value="${count}"]`).check({ force: true });
}

test('the chooser asks how many are playing: one as the game comes, and each of several has a character, side by side', async ({ page }) => {
  await choose(page, 1);
  await expect(page.locator('.group-choice legend')).toHaveText('How many are playing?');
  await expect(page.locator('input[name="group-size"]')).toHaveCount(4);
  await expect(page.locator('input[name="group-size"][value="1"]')).toBeChecked();
  expect(await group(page)).toMatchObject({ players: 1, looksFor: 1, characters: 1, cast: ['Giraffe'] });
  await expect(page.locator('body')).toHaveAttribute('data-players', '1');

  await page.locator('input[name="group-size"][value="3"]').check({ force: true });
  let now = await group(page);
  expect(now).toMatchObject({ players: 3, looksFor: 3, characters: 3, cast: ['Giraffe', 'Truffle', 'Kit'] });
  // Left to right across the screen, between the cards at either side.
  expect(now.feet[0]).toBeLessThan(now.feet[1]);
  expect(now.feet[1]).toBeLessThan(now.feet[2]);
  expect(now.feet[0]).toBeGreaterThan(0.33);
  expect(now.feet[2]).toBeLessThan(0.67);
  await page.screenshot({ path: 'test-results/screens/swamp-group-choose-3.png' });

  // Another character chosen is the first of them, and the others are the ones after it.
  await page.locator('.fighter-card[data-fighter="kit"]').click();
  expect((await group(page)).cast).toEqual(['Kit', 'Mochi', 'Widget']);
  // And one again is the game as it was.
  await page.locator('input[name="group-size"][value="1"]').check({ force: true });
  now = await group(page);
  expect(now).toMatchObject({ players: 1, looksFor: 1, characters: 1, cast: ['Kit'] });
  expect(now.feet[0]).toBe(0.5);
});

test('two play in front of one camera: the one who jumps has the jumps, the one who stands has none, and all the mud is on the one window', async ({ page }) => {
  test.setTimeout(300_000);
  await choose(page, 2);
  await showPeople(page, [STANDING, STANDING]);
  await page.locator('#swamp-start').click();
  await waitForScreen(page, 'playing');
  let now = await group(page);
  expect(now).toMatchObject({ players: 2, looksFor: 2, seen: [true, true], cast: ['Giraffe', 'Truffle'], jumps: [0, 0], all: 0 });
  // Each stands on their own side of the screen, as they do in front of the camera.
  expect(now.feet[0]).toBeLessThan(0.5);
  expect(now.feet[1]).toBeGreaterThan(0.5);
  // Standing still, nobody jumps.
  await page.waitForTimeout(2500);
  expect((await group(page)).all).toBe(0);

  // The one on the right of the screen jumps. The jumps are theirs, and the mud is everyone's.
  await showPerson(page, 1, JUMPING);
  await expect.poll(async () => (await group(page)).jumps[1], { timeout: 60_000 }).toBeGreaterThanOrEqual(2);
  now = await group(page);
  expect(now.jumps[0]).toBe(0);
  expect(now.all).toBe(now.jumps[0] + now.jumps[1]);
  expect(now.coverage).toBeGreaterThan(0.05);
  await page.screenshot({ path: 'test-results/screens/swamp-group-two-playing.png' });

  // The window gets muddy enough, and the card says what they did between them, and each one's share.
  await waitForScreen(page, 'finish');
  now = await group(page);
  await expect(page.locator('#finish-line')).toContainText(`Together you jumped ${now.all} time`);
  await expect(page.locator('#finish-line')).toContainText(`Giraffe ${now.jumps[0]}, Truffle ${now.jumps[1]}.`);
  await page.screenshot({ path: 'test-results/screens/swamp-group-finish.png' });
});

test('the check waits until everyone playing is in the picture, and says to stand side by side', async ({ page }) => {
  test.setTimeout(240_000);
  await choose(page, 2);
  // Only one of the two is there.
  await showPeople(page, [STANDING, null]);
  await page.locator('#swamp-start').click();
  await waitForScreen(page, 'bodycheck');
  await expect(page.locator('#prompt-text')).toHaveText('Stand side by side, where I can see all of you');
  await page.waitForTimeout(5000);
  expect((await group(page)).screen).toBe('bodycheck');
  await page.screenshot({ path: 'test-results/screens/swamp-group-check-one-of-two.png' });
  // The other one comes and is found, and steps away again before the check is over: it goes on waiting for
  // them, and goes on saying so. They're taken away the moment both have a place, from inside the page, so the
  // check has no time to finish first.
  await showPerson(page, 1, STANDING);
  await page.evaluate(() => new Promise((resolve) => {
    const { game } = window.__game;
    const look = () => {
      if (!game.people.placed) return requestAnimationFrame(look);
      window.__camera.showPerson(1, null);
      return resolve();
    };
    look();
  }));
  await expect.poll(async () => (await group(page)).seen, { timeout: 15_000 }).toEqual([true, false]);
  await expect(page.locator('#prompt-text')).toHaveText('Stand side by side, where I can see all of you');
  await page.waitForTimeout(3000);
  expect((await group(page)).screen).toBe('bodycheck');
  // Back they come, and the game starts.
  await showPerson(page, 1, STANDING);
  await waitForScreen(page, 'playing');
  expect((await group(page)).seen).toEqual([true, true]);
});

test('one of two steps out and the other plays on, and with nobody there everything waits', async ({ page }) => {
  test.setTimeout(240_000);
  await choose(page, 2);
  await showPeople(page, [STANDING, STANDING]);
  await page.locator('#swamp-start').click();
  await waitForScreen(page, 'playing');
  // The first one goes. The game doesn't wait for them: the swamp's clock runs on, and nobody is asked to come back.
  await showPerson(page, 0, null);
  await expect.poll(async () => (await group(page)).seen, { timeout: 15_000 }).toEqual([false, true]);
  const before = (await group(page)).time;
  await page.waitForTimeout(3000);
  let now = await group(page);
  expect(now.lost).toBe(false);
  expect(now.time - before).toBeGreaterThan(2);
  await expect(page.locator('#prompt-text')).not.toHaveText('Come back where I can see you');
  // The other goes too: now it waits.
  await showPerson(page, 1, null);
  await expect.poll(async () => (await group(page)).lost, { timeout: 15_000 }).toBe(true);
  await expect(page.locator('#prompt-text')).toHaveText('Come back where I can see you');
  const waiting = (await group(page)).time;
  await page.waitForTimeout(2000);
  expect((await group(page)).time).toBe(waiting);
  // Back again, each is who they were: left to right.
  await showPeople(page, [STANDING, STANDING]);
  await expect.poll(async () => (await group(page)).seen, { timeout: 20_000 }).toEqual([true, true]);
  now = await group(page);
  expect(now.lost).toBe(false);
});

test('as the game comes, one plays, and someone else in the picture is not a player', async ({ page }) => {
  test.setTimeout(240_000);
  await choose(page, 1);
  await showPeople(page, [STANDING, STANDING]);
  await page.locator('#swamp-start').click();
  await waitForScreen(page, 'playing');
  const now = await group(page);
  expect(now).toMatchObject({ players: 1, looksFor: 1, characters: 1, jumps: [0] });
  // The tracker is only asked for one body, so that's all it reports.
  const found = await page.evaluate(() => new Promise((resolve) => {
    const { camera } = window.__game.game;
    const result = camera.onResult;
    camera.onResult = (data) => {
      camera.onResult = result;
      result(data);
      resolve(data.bodies.length);
    };
  }));
  expect(found).toBe(1);
});

test('after a game for one, a second player can be added for the next: the tracker that was looking for one looks for two', async ({ page }) => {
  test.setTimeout(300_000);
  await choose(page, 1);
  await showPeople(page, [STANDING, STANDING]);
  await page.locator('#swamp-start').click();
  await waitForScreen(page, 'playing');
  expect(await group(page)).toMatchObject({ players: 1, looksFor: 1 });
  // That game is won, as jumps would win it.
  await page.evaluate(() => {
    const { swamp } = window.__game;
    for (let jump = 0; jump < 40 && swamp.state === 'play'; jump += 1) swamp.land(2.5);
  });
  await waitForScreen(page, 'finish');

  // Back at the chooser, two are playing now.
  await page.locator('#other-jumper').click();
  await waitForScreen(page, 'choose');
  await page.locator('input[name="group-size"][value="2"]').check({ force: true });
  expect(await group(page)).toMatchObject({ players: 2, looksFor: 2, characters: 2 });
  await page.locator('#swamp-start').click();
  // The check finds them both, which it only can if the tracker now reports two bodies.
  await waitForScreen(page, 'playing');
  const now = await group(page);
  expect(now).toMatchObject({ players: 2, seen: [true, true], jumps: [0, 0] });
  // And back to one again for the game after: the second person is nobody once more.
  await page.evaluate(() => {
    const { swamp } = window.__game;
    for (let jump = 0; jump < 40 && swamp.state === 'play'; jump += 1) swamp.land(2.5, { by: jump % 2 });
  });
  await waitForScreen(page, 'finish');
  await page.locator('#other-jumper').click();
  await waitForScreen(page, 'choose');
  await page.locator('input[name="group-size"][value="1"]').check({ force: true });
  await page.locator('#swamp-start').click();
  await waitForScreen(page, 'playing');
  expect(await group(page)).toMatchObject({ players: 1, looksFor: 1, characters: 1 });
  const found = await page.evaluate(() => new Promise((resolve) => {
    const { camera } = window.__game.game;
    const result = camera.onResult;
    camera.onResult = (data) => {
      camera.onResult = result;
      result(data);
      resolve(data.bodies.length);
    };
  }));
  expect(found).toBe(1);
});
