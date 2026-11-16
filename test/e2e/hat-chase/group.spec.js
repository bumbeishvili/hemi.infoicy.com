// Hat Chase with several walking in front of one camera: a grown-up says how many on the chooser, each has a
// character on the path in the order they stand, everyone's steps take them all along by their share, and
// anyone's jump gets everyone past a thing in the way. In place of the webcam there is footage of real people side
// by side, read by the real tracker: see showPeople in test/e2e/fake-camera.js.
import { bringToTheEnd, expect, expectSoon, GENTLE, openChase, shot, test, waitForScreen } from './helpers.js';

// A person standing still, one lifting the right foot and then the left (see liftingEachFoot in helpers.js), and
// one doing three burpees, each ending in a real jump. Each clip is cut around where its person stands in it.
const STANDING = { name: 'strikes', from: 0.2, playing: false, at: 0.38 };
const LIFTING = { name: 'stands', from: 19.2, playing: true, at: 0.5 };
const JUMPING = { name: 'jumps', at: 0.38 };

const showPeople = (page, clips) => page.evaluate((list) => window.__camera.showPeople(list), clips);
const showPerson = (page, index, clip) => page.evaluate(([at, what]) => window.__camera.showPerson(at, what), [index, clip]);

/** What the game makes of who's there. */
const group = (page) => page.evaluate(() => {
  const { game, chase, view } = window.__game;
  return {
    screen: game.screen,
    players: game.players.length,
    looksFor: game.camera.people,
    seen: game.players.map(({ body }) => Boolean(body)),
    cast: game.cast.map(({ name }) => name),
    characters: view.arts.length,
    at: view.walkersAt.map((x) => Math.round(x)),
    front: Math.round(view.heroAt.x),
    metre: view.metre,
    width: view.width,
    frames: view.arts.map((_, index) => view.heroFrame(index)),
    walkers: chase?.walkers ?? null,
    marchers: game.walkers.length,
    by: chase ? [...chase.stats.by] : [],
    steps: chase?.stats.steps ?? 0,
    x: chase?.hero.x ?? 0,
    cleared: chase?.stats.cleared ?? 0,
    station: chase?.station?.kind ?? null,
    state: chase?.state ?? null,
    time: chase?.time ?? 0,
    lost: game.bodyLost(),
  };
});

/** From the title to the chooser, with so many chosen to walk. */
async function choose(page, count, settings = {}) {
  await openChase(page, { ...GENTLE, ...settings });
  await page.locator('#start').click();
  await waitForScreen(page, 'choose');
  if (count > 1) await page.locator(`input[name="group-size"][value="${count}"]`).check({ force: true });
}

/** And on to the game being played, with that many standing in view. */
async function play(page, count, settings = {}) {
  await choose(page, count, settings);
  await showPeople(page, Array.from({ length: count }, () => STANDING));
  await page.locator('#chase-start').click();
  await waitForScreen(page, 'playing');
}

/** Steps as a walker's marching would make them, from the rules in the page: so many, a little apart, by this walker. */
const stepsBy = (page, by, count, every = 450) => page.evaluate(async ([who, steps, gap]) => {
  const { chase } = window.__game;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let taken = 0;
  for (let n = 0; n < steps * 6 && taken < steps && chase.state === 'play' && !chase.station; n += 1) {
    if (chase.step(taken % 2 ? 'right' : 'left', who)) taken += 1;
    await wait(gap);
  }
  return taken;
}, [by, count, every]);

test('the chooser asks how many are walking: one as the game comes, and each of several has a character, in the order they stand', async ({ page }) => {
  await choose(page, 1);
  await expect(page.locator('.group-choice legend')).toHaveText('How many are playing?');
  await expect(page.locator('input[name="group-size"]')).toHaveCount(4);
  await expect(page.locator('input[name="group-size"][value="1"]')).toBeChecked();
  expect(await group(page)).toMatchObject({ players: 1, looksFor: 1, characters: 1, cast: ['Giraffe'] });
  await expect(page.locator('body')).toHaveAttribute('data-players', '1');

  await page.locator('input[name="group-size"][value="3"]').check({ force: true });
  await expectSoon(async () => (await group(page)).characters).toBe(3);
  // The three settle into the middle of the screen together, left to right as they'll stand, a clear step apart.
  await page.waitForTimeout(2000);
  const now = await group(page);
  expect(now).toMatchObject({ players: 3, looksFor: 3, cast: ['Giraffe', 'Truffle', 'Kit'] });
  expect(now.at[1] - now.at[0]).toBeGreaterThan(now.metre * 0.8);
  expect(now.at[2] - now.at[1]).toBeGreaterThan(now.metre * 0.8);
  expect(Math.abs((now.at[0] + now.at[2]) / 2 - now.width / 2)).toBeLessThan(now.metre * 0.5);
  // The last of them is the one in front, where the path's rules have them all.
  expect(now.front).toBe(now.at[2]);
  await shot(page, 'hat-group-choose');

  // Another character chosen for the first, and the others are the ones after it.
  await page.locator('.fighter-card[data-fighter="mochi"]').click();
  await expectSoon(async () => (await group(page)).cast).toEqual(['Mochi', 'Widget', 'Frost']);
  expect((await group(page)).characters).toBe(3);

  await page.locator('input[name="group-size"][value="1"]').check({ force: true });
  await expectSoon(async () => (await group(page)).characters).toBe(1);
  expect(await group(page)).toMatchObject({ players: 1, looksFor: 1, cast: ['Mochi'] });
});

test('two walk together: each one\'s own step takes them both on by half a step, and shows on their own character', async ({ page }) => {
  test.setTimeout(300_000);
  await play(page, 2);
  await page.waitForTimeout(2000);
  let now = await group(page);
  expect(now).toMatchObject({ players: 2, walkers: 2, marchers: 2, seen: [true, true], by: [0, 0], x: 0, cast: ['Giraffe', 'Truffle'] });
  // On the path they're a step and a half apart, the second of them in front, and both on the screen.
  expect(now.at[1] - now.at[0]).toBeGreaterThan(now.metre * 1.3);
  expect(now.front).toBe(now.at[1]);
  expect(now.at[0]).toBeGreaterThan(now.metre * 0.5);
  await shot(page, 'hat-group-two');

  // The one on the right lifts a foot, for real. It's their step: half a step along for both, and their
  // character is the one that shows it.
  await showPerson(page, 1, LIFTING);
  const atStep = await page.evaluate(() => new Promise((resolve) => {
    const { chase, view } = window.__game;
    const look = () => {
      if (chase.stats.by[1] < 1) return requestAnimationFrame(look);
      return resolve({ by: [...chase.stats.by], frames: view.arts.map((_, index) => view.heroFrame(index)) });
    };
    look();
  }));
  expect(atStep.by).toEqual([0, 1]);
  expect(atStep.frames[0]).toBe('stand');
  expect(atStep.frames[1]).toMatch(/^step/);
  await expectSoon(async () => (await group(page)).x).toBeCloseTo(0.5, 2);
  // A second later the step has been shown, and the character stands again.
  await page.waitForTimeout(1200);
  expect((await group(page)).frames[1]).toBe('stand');

  // Now the one on the left, and the other stands: it's the first walker's step.
  await showPerson(page, 1, STANDING);
  await page.waitForTimeout(1500);
  const before = await group(page);
  await showPerson(page, 0, LIFTING);
  await expectSoon(async () => (await group(page)).by[0], { timeout: 60_000 }).toBeGreaterThanOrEqual(1);
  now = await group(page);
  expect(now.by[1]).toBe(before.by[1]);
  await expectSoon(async () => (await group(page)).x).toBeCloseTo((now.by[0] + now.by[1]) / 2, 2);
});

test('anyone\'s jump gets everyone past a stream: the second walker jumps, and both are over', async ({ page }) => {
  test.setTimeout(300_000);
  await play(page, 2);
  // Both march up to the first thing in the way, each a step in turn.
  for (let n = 0; n < 40 && !(await group(page)).station; n += 1) {
    await stepsBy(page, 0, 1);
    await stepsBy(page, 1, 1);
  }
  let now = await group(page);
  expect(now.station).toBe('stream');
  expect(now.cleared).toBe(0);
  // Each took their share of the steps, and each step was half a step along: all but the last, which stops short
  // at the stream.
  expect(Math.abs(now.by[0] - now.by[1])).toBeLessThanOrEqual(1);
  expect(now.x).toBeLessThanOrEqual(now.steps / 2 + 0.01);
  expect(now.x).toBeGreaterThan(now.steps / 2 - 0.5);
  // The one on the right jumps, for real, while the other stands.
  await showPerson(page, 1, JUMPING);
  await expectSoon(async () => (await group(page)).cleared, { timeout: 90_000 }).toBe(1);
  now = await group(page);
  expect(now.state).toBe('play');
  await shot(page, 'hat-group-over-the-stream');
});

test('one of two steps out and the other walks on, and with nobody there everything waits', async ({ page }) => {
  test.setTimeout(240_000);
  await play(page, 2);
  // The first one goes. The game doesn't wait for them: its clock runs on, and nobody is asked to come back.
  await showPerson(page, 0, null);
  await expectSoon(async () => (await group(page)).seen, { timeout: 15_000 }).toEqual([false, true]);
  const before = (await group(page)).time;
  await page.waitForTimeout(3000);
  let now = await group(page);
  expect(now.lost).toBe(false);
  expect(now.time - before).toBeGreaterThan(2);
  await expect(page.locator('#prompt-text')).not.toHaveText('Come back where I can see you');
  // The one who's left can still walk them on.
  expect(await stepsBy(page, 1, 2)).toBe(2);
  // The other goes too: now it waits.
  await showPerson(page, 1, null);
  await expectSoon(async () => (await group(page)).lost, { timeout: 15_000 }).toBe(true);
  await expect(page.locator('#prompt-text')).toHaveText('Come back where I can see you');
  const waiting = (await group(page)).time;
  await page.waitForTimeout(2000);
  expect((await group(page)).time).toBe(waiting);
  // Back again, each is who they were.
  await showPeople(page, [STANDING, STANDING]);
  await expectSoon(async () => (await group(page)).seen, { timeout: 20_000 }).toEqual([true, true]);
  now = await group(page);
  expect(now.lost).toBe(false);
});

test('the finish card says how many steps they took between them and each one\'s share, and a game for one after is for one', async ({ page }) => {
  test.setTimeout(300_000);
  await play(page, 2);
  expect(await stepsBy(page, 0, 2)).toBe(2);
  expect(await stepsBy(page, 1, 3)).toBe(3);
  await bringToTheEnd(page);
  // The last stretch, a step each in turn, to the magpie's tree.
  for (let n = 0; n < 30 && (await group(page)).state === 'play'; n += 1) {
    await stepsBy(page, n % 2, 1, 250);
  }
  const end = await group(page);
  expect(end.state).toBe('won');
  expect(end.by[0] + end.by[1]).toBe(end.steps);
  expect(end.by[0]).toBeGreaterThanOrEqual(2);
  expect(end.by[1]).toBeGreaterThanOrEqual(3);
  await waitForScreen(page, 'finish');
  await expect(page.locator('#finish-line')).toHaveText(`Together you took ${end.steps} steps: Giraffe ${end.by[0]}, Truffle ${end.by[1]}. You got past all 12 things in the way.`);
  await page.waitForTimeout(800);
  await shot(page, 'hat-group-finish');
  // Beside the card both characters are in sight, and neither is under it.
  const card = await page.locator('#screen-finish .card').boundingBox();
  const now = await group(page);
  expect(now.at[0]).toBeGreaterThan(now.metre * 0.4);
  expect(now.at[1]).toBeLessThan(card.x);

  // Four beside the same card stand closer still, and none of them is under it either.
  await page.evaluate(() => {
    const { game, view } = window.__game;
    const first = game.cast[0];
    view.setWalkers([first, first, first, first]);
  });
  await page.waitForTimeout(2500);
  const four = await group(page);
  expect(four.at).toHaveLength(4);
  expect(four.at[0]).toBeGreaterThan(four.metre * 0.4);
  expect(four.at[3]).toBeLessThan(card.x - four.metre * 0.6);
  for (let index = 1; index < 4; index += 1) expect(four.at[index] - four.at[index - 1]).toBeGreaterThan(four.metre * 0.6);
  await shot(page, 'hat-group-finish-four');

  // Back at the chooser, one walks now: one character, one marcher, and a step is a whole step.
  await page.locator('#other-walker').click();
  await waitForScreen(page, 'choose');
  await page.locator('input[name="group-size"][value="1"]').check({ force: true });
  await showPeople(page, [STANDING, STANDING]);
  await page.locator('#chase-start').click();
  await waitForScreen(page, 'playing');
  expect(await group(page)).toMatchObject({ players: 1, looksFor: 1, characters: 1, walkers: 1, marchers: 1, by: [0] });
  expect(await stepsBy(page, 0, 1)).toBe(1);
  await expectSoon(async () => (await group(page)).x).toBeCloseTo(1, 2);
});

test('four walkers are all on the screen while they walk and beside the finish card, in the order they stand', async ({ page }) => {
  await choose(page, 4);
  await expectSoon(async () => (await group(page)).characters).toBe(4);
  const settle = async (view) => {
    await page.evaluate((name) => window.__game.view.setView(name), view);
    await page.waitForTimeout(2500);
    return group(page);
  };
  // While they walk: a step and a half apart, the last of them in front, the first still well on the screen.
  let now = await settle('play');
  for (let index = 1; index < 4; index += 1) expect(now.at[index] - now.at[index - 1]).toBeGreaterThan(now.metre * 1.3);
  expect(now.front).toBe(now.at[3]);
  expect(now.at[0]).toBeGreaterThan(now.metre * 0.8);
  // And with room ahead of the one in front for what's coming: at least half the screen.
  expect(now.front).toBeLessThan(now.width * 0.5);
  await shot(page, 'hat-group-four');
  // Beside a card they stand closer, and all four are still in sight.
  now = await settle('finish');
  for (let index = 1; index < 4; index += 1) expect(now.at[index] - now.at[index - 1]).toBeGreaterThan(now.metre * 0.6);
  expect(now.at[0]).toBeGreaterThan(now.metre * 0.8);
  // One alone is where one child's character always was.
  await page.locator('input[name="group-size"][value="1"]').check({ force: true });
  now = await settle('play');
  expect(now.at).toEqual([Math.round(now.width * 0.24)]);
});

test('what a grown-up changes about the marching goes to every walker, in the game that\'s being played', async ({ page }) => {
  test.setTimeout(240_000);
  await play(page, 2);
  const lines = () => page.evaluate(() => window.__game.game.walkers.map(({ marcher }) => [marcher.line.left, marcher.line.right, marcher.turns]));
  expect(await lines()).toEqual([[0.11, 0.11, false], [0.11, 0.11, false]]);
  await page.locator('#open-panel').click();
  await page.locator('input[name="chaseLift"][value="high"]').check();
  await page.locator('input[name="chaseLegs"][value="turns"]').check();
  await page.locator('#close-panel').click();
  await expect(page.locator('#panel')).toBeHidden();
  expect(await lines()).toEqual([[0.16, 0.16, true], [0.16, 0.16, true]]);
  // The game goes on as it was, with both of them.
  expect(await group(page)).toMatchObject({ screen: 'playing', walkers: 2, marchers: 2 });
});
