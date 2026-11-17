// Mighty Lift with several lifting in front of one camera: a grown-up says how many on the chooser, each has a
// lifter of their own, side by side as they stand, with arms measured on their own, and they lift one big weight
// between them, by the rules friends lift one by. In place of the webcam there is footage of people side by
// side, read by the real tracker: see showPeople in test/e2e/fake-camera.js.
import { ARMS, expect, openLift, test, toChoosing, waitForScreen } from './helpers.js';

// The person in the lifting footage, held still with their arms down, and with the right arm right up.
const DOWN = { name: 'lifts', from: ARMS.down, playing: false };
const UP = { name: 'lifts', from: ARMS.up, playing: false };

const showPeople = (page, clips) => page.evaluate((list) => window.__camera.showPeople(list), clips);
const showPerson = (page, index, clip) => page.evaluate(([at, what]) => window.__camera.showPerson(at, what), [index, clip]);
const everyone = async (page, count, clip) => {
  for (let index = 0; index < count; index += 1) await showPerson(page, index, clip);
};

/** What the game makes of who's there, and where their lifters are across the screen, from 0 to 1. */
const group = (page) => page.evaluate(() => {
  const { game, lifting, world, crew } = window.__game;
  const across = (figure) => world.project(figure.body.root.position.x, 1, figure.body.root.position.z).x / innerWidth;
  return {
    screen: game.screen,
    players: game.players.length,
    looksFor: game.camera.people,
    seen: game.players.map(({ body }) => Boolean(body)),
    // Whether each one's reader of moves is happy with their top half, as the game is.
    upper: game.players.map(({ reader }) => reader.upperBodyOnly),
    cast: game.cast.map(({ name }) => name),
    lifts: crew.map((member) => game.liftsOf(member)),
    arms: crew.map(({ arms }) => arms.lift),
    measured: crew.map(({ measured }) => measured),
    best: crew.map(({ arms }) => arms[arms.sides[0]].best),
    figures: [world.lifter, ...world.mates].map((figure) => ({ who: figure.spec.name, across: across(figure), x: figure.body.root.position.x, hand: figure.pose.handLY })),
    beside: world.beside,
    team: lifting?.team?.size ?? null,
    plain: lifting?.plain ?? null,
    clock: lifting ? lifting.timeLeft !== null : null,
    phase: lifting?.phase ?? null,
    index: lifting?.index ?? null,
    freed: lifting?.stats.freed ?? 0,
    height: lifting?.height ?? 0,
    stuck: lifting?.rescues.map(({ friend }) => friend) ?? [],
    lost: game.bodyLost(),
    level: game.levels.current,
    today: game.liftsToday,
  };
});

/** From the title to the warm-up, with so many chosen to lift and that many people in view, arms down. */
async function reachWarmup(page, count, settings = {}) {
  await openLift(page, settings);
  await showPeople(page, Array.from({ length: Math.max(2, count) }, () => DOWN));
  await toChoosing(page);
  if (count > 1) await page.locator(`input[name="group-size"][value="${count}"]`).check({ force: true });
  await page.locator('#lift-start').click();
  await waitForScreen(page, 'warmup');
}

/**
 * And on to lifting, skipping the warm-up, so each arm's line is as high as its setting says. The level is named
 * under the countdown, as a game comes: levelShown says whether it should be.
 */
async function reachPlay(page, count, settings = {}, levelShown = false) {
  await reachWarmup(page, count, settings);
  await skipToPlay(page, levelShown);
}

async function skipToPlay(page, levelShown) {
  await page.locator('#warm-skip').click();
  await waitForScreen(page, 'countdown');
  if (levelShown) await expect(page.locator('#level-now')).toBeVisible({ timeout: 2000 });
  else await expect(page.locator('#level-now')).toBeHidden({ timeout: 2000 });
  await waitForScreen(page, 'playing');
}

test('two lift one big weight at one camera: either one\'s arm frees the friend, each one\'s lifts are their own, and the card says what they did between them', async ({ page }) => {
  test.setTimeout(420_000);
  // The clock before sunset is on, as the game comes: several play the plain game, which has none. A long hold,
  // so that there's time to see a lift counted before the friend is out.
  await reachPlay(page, 2, { liftClock: 'yes', lifts: 5, liftHold: 'long' });
  let now = await group(page);
  expect(now).toMatchObject({ players: 2, looksFor: 2, seen: [true, true], upper: [true, true], cast: ['Giraffe', 'Truffle'], beside: true, team: 2, plain: true, clock: false, lifts: [0, 0] });
  // Each has a lifter, left to right as they stand, and neither of them is stuck under anything.
  expect(now.figures.map(({ who }) => who)).toEqual(['Giraffe', 'Truffle']);
  expect(now.figures[0].across).toBeLessThan(now.figures[1].across);
  expect(now.stuck).toHaveLength(5);
  for (const friend of now.stuck) expect(['giraffe', 'truffle']).not.toContain(friend);
  await expect(page.locator('#lift-scores li')).toHaveText(['Giraffe0', 'Truffle0']);
  await expect(page.locator('#sunset-chip')).toBeHidden();

  // The one on the right lifts and holds. Their lifter's arm goes up, the lift is theirs, and the friend gets out.
  await showPerson(page, 1, UP);
  // The lift is on the board as soon as their arm is up, before the friend is out.
  await expect(page.locator('#lift-scores li')).toHaveText(['Giraffe0', 'Truffle1'], { timeout: 30_000 });
  expect((await group(page)).freed).toBe(0);
  await expect.poll(async () => (await group(page)).freed, { timeout: 30_000 }).toBe(1);
  now = await group(page);
  expect(now.lifts).toEqual([0, 1]);
  expect(now.figures[1].hand).toBeGreaterThan(0.3);
  expect(now.figures[0].hand).toBeLessThan(-0.3);
  await page.screenshot({ path: 'test-results/screens/lift-group-one-lifting.png' });

  // Arms down, the next friend comes, and both lift: the weight goes right up.
  await showPerson(page, 1, DOWN);
  await expect.poll(async () => {
    const { index, phase, arms } = await group(page);
    return index === 1 && phase === 'lifting' && Math.max(...arms) < 0.3;
  }, { timeout: 30_000 }).toBe(true);
  expect((await group(page)).height).toBeLessThan(0.3);
  await everyone(page, 2, UP);
  await expect.poll(async () => (await group(page)).height, { timeout: 30_000 }).toBeGreaterThan(1);
  await expect.poll(async () => (await group(page)).freed, { timeout: 30_000 }).toBe(2);
  expect((await group(page)).lifts).toEqual([1, 2]);
  await page.screenshot({ path: 'test-results/screens/lift-group-both-lifting.png' });

  // Up and down together until everyone's free.
  for (let round = 0; round < 8 && (await group(page)).screen === 'playing'; round += 1) {
    const { freed } = await group(page);
    await everyone(page, 2, DOWN);
    await expect.poll(async () => {
      const { screen, phase, arms } = await group(page);
      return screen !== 'playing' || (phase === 'lifting' && Math.max(...arms) < 0.3);
    }, { timeout: 30_000 }).toBe(true);
    await everyone(page, 2, UP);
    await expect.poll(async () => {
      const after = await group(page);
      return after.screen !== 'playing' || after.freed > freed;
    }, { timeout: 30_000 }).toBe(true);
  }
  await waitForScreen(page, 'finish');
  now = await group(page);
  expect(now.freed).toBe(5);
  const all = now.lifts[0] + now.lifts[1];
  expect(now.lifts[0]).toBeGreaterThanOrEqual(4);
  expect(now.lifts[1]).toBeGreaterThanOrEqual(5);
  expect(now.today).toBe(all);
  await expect(page.locator('#finish-title')).toHaveText('You lifted it together!');
  await expect(page.locator('#finish-lifts')).toHaveText(`${all} lifts`);
  await expect(page.locator('#finish-line')).toContainText(`Together you made ${all} lifts: Giraffe ${now.lifts[0]}, Truffle ${now.lifts[1]}.`);
  // The plain game moves no level on, and shows none. It's over, so a change in the panel now starts nothing again.
  await expect(page.locator('#level-done')).toBeHidden();
  expect(now.level).toBe(1);
  expect(await page.evaluate(() => window.__game.game.levelUnderway)).toBe(false);
  await page.screenshot({ path: 'test-results/screens/lift-group-finish.png' });
});

test('in the warm-up each of them is measured on their own: the first to reach up doesn\'t end it, and the others have a few seconds more', async ({ page }) => {
  test.setTimeout(300_000);
  await reachWarmup(page, 2);
  let now = await group(page);
  expect(now).toMatchObject({ screen: 'warmup', seen: [true, true], beside: true, measured: [false, false] });
  // Both lifters are in sight, to the right of the players' picture and of the film, which are on the left.
  await page.waitForTimeout(2500);
  const covered = await page.evaluate(() => Math.max(...['#camera-frame', '#coach'].map((id) => document.querySelector(id).getBoundingClientRect().right)) / innerWidth);
  now = await group(page);
  expect(covered).toBeLessThan(0.5);
  for (const { across } of now.figures) {
    expect(across).toBeGreaterThan(covered + 0.08);
    expect(across).toBeLessThan(0.92);
  }
  await page.screenshot({ path: 'test-results/screens/lift-group-warmup.png' });

  // The one on the right reaches up: they're measured, and the warm-up goes on for the other.
  await showPerson(page, 1, UP);
  await expect.poll(async () => (await group(page)).measured, { timeout: 30_000 }).toEqual([false, true]);
  now = await group(page);
  expect(now.screen).toBe('warmup');
  expect(now.figures[1].hand).toBeGreaterThan(0.3);
  expect(now.figures[0].hand).toBeLessThan(-0.3);
  await page.waitForTimeout(3000);
  expect((await group(page)).screen).toBe('warmup');
  // The other never does, and a few seconds on the game starts all the same, with their line as a grown-up chose.
  await waitForScreen(page, 'countdown');
  now = await group(page);
  expect(now.best[0]).toBe(null);
  expect(now.best[1]).toBeGreaterThan(0.5);
});

test('one of two steps out and the other lifts on, and with nobody there everything waits', async ({ page }) => {
  test.setTimeout(300_000);
  // Twelve lifts, which is more than there are friends to free: so everyone who can be stuck is, and neither
  // of the two who are lifting is among them.
  await reachPlay(page, 2, { lifts: 12 });
  const { stuck } = await group(page);
  expect(stuck).toHaveLength(12);
  expect(new Set(stuck).size).toBe(8);
  for (const friend of stuck) expect(['giraffe', 'truffle']).not.toContain(friend);
  await showPerson(page, 0, null);
  await expect.poll(async () => (await group(page)).seen, { timeout: 15_000 }).toEqual([false, true]);
  // The game doesn't wait for them: the one who's there frees the friend, and nobody is asked to come back.
  await showPerson(page, 1, UP);
  await expect.poll(async () => (await group(page)).freed, { timeout: 30_000 }).toBe(1);
  let now = await group(page);
  expect(now.lost).toBe(false);
  expect(now.lifts).toEqual([0, 1]);
  await expect(page.locator('#prompt-text')).not.toHaveText('Come back where I can see you');
  // The other goes too: now it waits, and says so.
  await showPerson(page, 1, null);
  await expect.poll(async () => (await group(page)).lost, { timeout: 15_000 }).toBe(true);
  await expect(page.locator('#prompt-text')).toHaveText('Come back where I can see you');
  // Back again, each is who they were, left to right.
  await showPeople(page, [DOWN, DOWN]);
  await expect.poll(async () => (await group(page)).seen, { timeout: 20_000 }).toEqual([true, true]);
  now = await group(page);
  expect(now.lost).toBe(false);
});

test('after a game for two, one again is the game as it comes: one lifter where it always stood, with its level and its clock', async ({ page }) => {
  test.setTimeout(300_000);
  await reachPlay(page, 2, { liftClock: 'yes' });
  expect(await group(page)).toMatchObject({ players: 2, beside: true, team: 2, clock: false });
  await page.evaluate(() => window.__game.lifting.finish());
  await waitForScreen(page, 'finish');

  // Back at the chooser, the other lifter has gone, and the child's is back where it's chosen.
  await page.locator('#other-lifter').click();
  await waitForScreen(page, 'choose');
  let now = await group(page);
  expect(now.beside).toBe(false);
  expect(now.figures).toHaveLength(1);
  expect(now.figures[0]).toMatchObject({ who: 'Giraffe', x: -1 });
  await page.locator('input[name="group-size"][value="1"]').check({ force: true });
  expect(await group(page)).toMatchObject({ players: 1, looksFor: 1 });

  // One lifts, and someone else in the picture is nobody: the game with its level, and the clock before sunset.
  await page.locator('#lift-start').click();
  await waitForScreen(page, 'warmup');
  await skipToPlay(page, true);
  now = await group(page);
  expect(now).toMatchObject({ players: 1, looksFor: 1, beside: false, team: null, plain: false, clock: true, cast: ['Giraffe'] });
  expect(now.figures).toHaveLength(1);
  expect(now.figures[0].x).toBe(-1);
  await expect(page.locator('#lift-scores')).toBeHidden();
  await expect(page.locator('#sunset-chip')).toBeVisible();
});

test('how many lifts make a game, changed in the middle of a game for two, starts it again for the two of them', async ({ page }) => {
  test.setTimeout(300_000);
  await reachPlay(page, 2, { lifts: 5 });
  expect(await group(page)).toMatchObject({ players: 2, team: 2 });
  expect((await group(page)).stuck).toHaveLength(5);
  // One of them has lifted, so there's something to start again from.
  await showPerson(page, 1, UP);
  await expect.poll(async () => (await group(page)).lifts, { timeout: 30_000 }).toEqual([0, 1]);
  await showPerson(page, 1, DOWN);

  await page.locator('#open-panel').click();
  await page.locator('input[name="lifts"][value="12"]').check();
  await page.locator('#close-panel').click();
  await expect(page.locator('#panel')).toBeHidden();
  // From the check that both can be seen, with no warm-up again, to a new game of twelve lifts for two.
  await expect.poll(async () => (await group(page)).screen, { timeout: 15_000 }).toMatch(/bodycheck|countdown/);
  await waitForScreen(page, 'playing');
  const now = await group(page);
  expect(now).toMatchObject({ players: 2, seen: [true, true], beside: true, team: 2, lifts: [0, 0], freed: 0 });
  expect(now.stuck).toHaveLength(12);
});

test('three and four stand left to right, all in sight and nobody behind anybody, in the warm-up and in a game', async ({ page }) => {
  await openLift(page);
  await toChoosing(page);
  for (const count of [3, 4]) {
    await page.locator(`input[name="group-size"][value="${count}"]`).check({ force: true });
    const names = await page.evaluate(() => window.__game.game.cast.map(({ name }) => name));
    expect(names).toEqual(['Giraffe', 'Truffle', 'Kit', 'Mochi'].slice(0, count));
    for (const view of ['warmup', 'play']) {
      await page.evaluate((name) => {
        const { game, world } = window.__game;
        game.standCrew(1);
        world.setView(name, { snap: true });
      }, view);
      await page.waitForTimeout(400);
      const { figures, beside } = await group(page);
      expect(beside).toBe(true);
      expect(figures.map(({ who }) => who)).toEqual(names);
      // In the warm-up the left of the screen is the players' picture and the film.
      // And in a game nobody is at the very edge, where an arm held out would be cut off.
      expect(figures[0].across).toBeGreaterThan(view === 'warmup' ? 0.44 : 0.095);
      expect(figures.at(-1).across).toBeLessThan(view === 'warmup' ? 0.9 : 0.5);
      for (let index = 1; index < count; index += 1) expect(figures[index].across - figures[index - 1].across).toBeGreaterThan(0.085);
      await page.screenshot({ path: `test-results/screens/lift-group-${count}-${view}.png` });
    }
  }
  // And one again has the yard as it was.
  await page.locator('input[name="group-size"][value="1"]').check({ force: true });
  await page.evaluate(() => window.__game.game.standCrew(1));
  const { figures, beside } = await group(page);
  expect(beside).toBe(false);
  expect(figures).toHaveLength(1);
  expect(figures[0].x).toBe(-1);
});

test('with friends, each on their own computer, it\'s one at each camera: the chooser doesn\'t ask how many', async ({ page }) => {
  await openLift(page);
  await toChoosing(page);
  await expect(page.locator('.group-choice')).toBeVisible();
  await page.locator('input[name="group-size"][value="2"]').check({ force: true });
  expect(await group(page)).toMatchObject({ players: 2, looksFor: 2 });
  // A game with friends is made, as it can be from a link that's slow to join: it's back to one, and stays so.
  await page.evaluate(() => {
    document.getElementById('friends-toggle').click();
    document.getElementById('friends-make').click();
  });
  await expect(page.locator('body')).toHaveAttribute('data-friends-room', '');
  await expect(page.locator('.group-choice')).toBeHidden();
  expect(await group(page)).toMatchObject({ players: 1, looksFor: 1 });
  await expect(page.locator('input[name="group-size"][value="1"]')).toBeChecked();
  // Leaving it, the chooser asks again.
  await page.evaluate(() => document.getElementById('friends-leave').click());
  await expect(page.locator('body')).not.toHaveAttribute('data-friends-room', '');
  await expect(page.locator('.group-choice')).toBeVisible();
});
