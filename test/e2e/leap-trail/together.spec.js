// Friends in Leap Trail, together, as the game comes: two children, each on their own computer, run the same trail
// as one pack on the same side. A runner far in front of the others eases off, everyone's stars add up, and nobody
// is placed. Here they're two separate browsers, talking through the race server on this computer
// (tools/race-server.mjs).
import { expect, openGame, test, waitForScreen } from '../helpers.js';
import { standInView } from './helpers.js';

const GAME = 'leap-trail';

/** Another player, in a browser of their own, with the same checks for errors. */
async function secondPlayer(browser) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`uncaught: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`logged: ${message.text()}`);
  });
  return { context, page, errors };
}

/** A long, slow trail, where a runner that isn't jumped for stumbles on, so both keep running while the tests look. */
async function openRun(page, settings = {}, hash = '') {
  await openGame(page, { onMissed: 'stumble', trailPace: 'slow', obstacles: 40, ...settings }, GAME, hash);
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'yes');
  await standInView(page);
}

/** A grown-up makes a run, with a name, and gets its code. */
async function makeRun(page, name) {
  await page.locator('#friends-toggle').click();
  await page.locator('#friends-make').click();
  await expect(page.locator('#friends-code-shown')).toHaveText(/^[A-HJ-NP-Z2-9]{3}$/);
  await page.locator('#friends-name').fill(name);
  await page.locator('#friends-name').dispatchEvent('change');
  return page.locator('#friends-code-shown').textContent();
}

async function join(browser, code, name, settings = {}) {
  const friend = await secondPlayer(browser);
  await openRun(friend.page, settings, `#run=${code}`);
  await friend.page.locator('#friends-name').fill(name);
  await friend.page.locator('#friends-name').dispatchEvent('change');
  return friend;
}

/** Chooses a runner and presses Let's run!, skipping the practice, to wait for the others. */
async function getReady(page) {
  await page.locator('#start').click();
  await waitForScreen(page, 'choose');
  await page.locator('#run-start').click();
  await waitForScreen(page, 'practice');
  await page.locator('#practice-skip').click();
}

async function bothRunning(page, other) {
  await getReady(page);
  await getReady(other);
  await waitForScreen(page, 'run');
  await waitForScreen(other, 'run');
}

const trailOf = (page) => page.evaluate(() => {
  const { run, mates, game } = window.__game;
  return {
    team: game.team,
    pack: run.pack,
    distance: run.distance,
    speed: run.speed,
    pace: run.settings.speed,
    total: run.starTotal,
    teamStars: game.teamStars,
    mateFar: mates.map(({ far }) => far ?? null),
    ownLevel: game.levels.current,
  };
});

/** Puts a runner this far along the trail, still running. */
const runTo = (page, far) => page.evaluate((metres) => {
  const { run } = window.__game;
  run.distance = metres;
  run.noteActivity();
}, far);

/** Keeps both children moving, so neither runner stops for a rest, and says how far each ran in these seconds. */
async function ranIn(page, other, seconds) {
  const start = [(await trailOf(page)).distance, (await trailOf(other)).distance];
  for (let passed = 0; passed < seconds; passed += 0.5) {
    for (const each of [page, other]) await each.evaluate(() => window.__game.run.noteActivity());
    await page.waitForTimeout(500);
  }
  const end = [(await trailOf(page)).distance, (await trailOf(other)).distance];
  return [end[0] - start[0], end[1] - start[1]];
}

test('together, as the game comes: a runner far in front eases off for the pack, and the stars add up on both screens', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openRun(page, { levels: { [GAME]: 2 } });
  const code = await makeRun(page, 'Ana');
  // Whoever made the run chooses, and it comes as together.
  await expect(page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await expect(page.locator('#friends-how')).toContainText('one team');
  // Ben's own choice is against each other, but it's Ana's run: he's shown hers, and can't change it.
  const ben = await join(browser, code, 'Ben', { trailFriends: 'against', fighter: 'kit' });
  await expect(ben.page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await expect(ben.page.locator('input[name="friends-team"][value="together"]')).toBeDisabled();
  await expect(ben.page.locator('#friends-teams-whose')).toHaveText('Ana chose.');

  await bothRunning(page, ben.page);
  for (const each of [page, ben.page]) expect((await trailOf(each)).team).toBe(true);
  // Each hears where the other is.
  await expect.poll(async () => (await trailOf(page)).mateFar[0], { timeout: 20_000 }).not.toBe(null);
  await expect.poll(async () => (await trailOf(ben.page)).mateFar[0], { timeout: 20_000 }).not.toBe(null);
  // Side by side, both run at the trail's pace, and nothing says otherwise.
  expect([(await trailOf(page)).pack, (await trailOf(ben.page)).pack]).toEqual([1, 1]);
  await expect(page.locator('#run-pack')).toBeHidden();

  // The board at the top: what the stars add up to, then the child's own, then their friend's, nobody ranked.
  await expect(page.locator('#run-scores li')).toHaveCount(3);
  await expect(page.locator('#run-scores li').nth(0)).toContainText('Together');
  await expect(page.locator('#run-scores li').nth(1)).toContainText('You');
  await expect(page.locator('#run-scores li').nth(2)).toContainText('Ben');

  // Side by side, they cover the same ground.
  const [herFirst, hisFirst] = await ranIn(page, ben.page, 4);
  expect(herFirst / hisFirst).toBeGreaterThan(0.8);
  expect(herFirst / hisFirst).toBeLessThan(1.25);

  // Ana gets 150 metres in front. Her runner eases off to half the pace, with a label saying why, and Ben,
  // behind, is neither slowed nor hurried.
  await runTo(page, (await trailOf(ben.page)).distance + 150);
  await expect.poll(async () => (await trailOf(page)).pack, { timeout: 15_000 }).toBe(0.5);
  await expect(page.locator('#run-pack')).toBeVisible();
  await expect(page.locator('#run-pack')).toHaveText('Waiting for your friends!');
  expect((await trailOf(ben.page)).pack).toBe(1);
  await expect(ben.page.locator('#run-pack')).toBeHidden();
  // And that's how they really run: she covers well under the ground he does.
  const [hers, his] = await ranIn(page, ben.page, 6);
  expect(his).toBeGreaterThan(40);
  expect(hers).toBeGreaterThan(15);
  expect(hers / his).toBeLessThan(0.75);
  await page.screenshot({ path: 'test-results/screens/trail-together-pack.png' });

  // Ben catches up, and she's back at the trail's pace, with the label gone.
  await runTo(ben.page, (await trailOf(page)).distance);
  await expect.poll(async () => (await trailOf(page)).pack, { timeout: 15_000 }).toBe(1);
  await expect(page.locator('#run-pack')).toBeHidden();

  // Stars: each one's count reaches the other, and both boards show what they add up to.
  await page.evaluate(() => {
    window.__game.run.stats.stars += 9;
  });
  await ben.page.evaluate(() => {
    window.__game.run.stats.stars += 4;
  });
  await expect.poll(async () => {
    const [hers, his] = [await trailOf(page), await trailOf(ben.page)];
    return [hers.teamStars - (hers.total + his.total), his.teamStars - (hers.total + his.total)];
  }, { timeout: 20_000 }).toEqual([0, 0]);
  expect((await trailOf(page)).teamStars).toBeGreaterThanOrEqual(13);
  await expect.poll(async () => {
    const shown = Number((await page.locator('#run-scores li').nth(0).textContent()).replace(/\D/g, ''));
    return Math.abs(shown - (await trailOf(page)).teamStars);
  }, { timeout: 10_000 }).toBeLessThanOrEqual(3);

  // Ana gets to the end first. Her card is the team's, with Ben still running.
  await page.evaluate(() => {
    const { run } = window.__game;
    run.distance = run.end - 3;
    run.noteActivity();
  });
  await waitForScreen(page, 'finish');
  await expect(page.locator('#finish-title')).toHaveText('You ran it together!');
  await expect(page.locator('.friends-results')).toHaveClass(/is-team/);
  await expect(page.locator('.friends-results li').nth(1)).toContainText('still running');
  await expect(page.locator('#finish-team')).toBeVisible();

  // Ben gets there too, and both cards say the same: what each brought, and what it comes to.
  await ben.page.evaluate(() => {
    const { run } = window.__game;
    run.distance = run.end - 3;
    run.noteActivity();
  });
  await waitForScreen(ben.page, 'finish');
  const plural = (count) => `${count} ${count === 1 ? 'star' : 'stars'}`;
  // A star reached just before the end may be settled just after it, so the cards are given a moment to agree.
  await expect.poll(async () => {
    const [a, b] = [(await trailOf(page)).total, (await trailOf(ben.page)).total];
    const said = await Promise.all([page, ben.page].map((each) => each.locator('#finish-team').textContent()));
    return said.map((text) => text === `Together you caught ${plural(a + b)}.`);
  }, { timeout: 30_000 }).toEqual([true, true]);
  const [herStars, hisStars] = [(await trailOf(page)).total, (await trailOf(ben.page)).total];
  for (const each of [page, ben.page]) {
    await expect(each.locator('#finish-title')).toHaveText('You ran it together!');
    await expect(each.locator('#finish-team')).toHaveText(`Together you caught ${plural(herStars + hisStars)}.`);
    await expect(each.locator('#finish-stars')).toHaveText(String(each === page ? herStars : hisStars));
    await expect(each.locator('.friends-results li')).toHaveCount(2);
    await expect(each.locator('.friends-results')).not.toContainText(/1st|2nd|still running/);
  }
  await expect(page.locator('.friends-results li.is-you')).toContainText(plural(herStars));
  await expect(ben.page.locator('.friends-results li.is-you')).toContainText(plural(hisStars));
  // And each one's line on the other's card is what they really finished with.
  await expect(page.locator('.friends-results li:not(.is-you)')).toContainText(plural(hisStars));
  await expect(ben.page.locator('.friends-results li:not(.is-you)')).toContainText(plural(herStars));
  await page.screenshot({ path: 'test-results/screens/trail-together-finish.png' });
  // It was the host's trail, so nobody's own level moves on.
  expect([(await trailOf(page)).ownLevel, (await trailOf(ben.page)).ownLevel]).toEqual([2, 1]);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('against each other, a grown-up\'s choice in the friends box, it\'s the contest it was: nobody eases off, and the most stars comes first', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openRun(page);
  const code = await makeRun(page, 'Ana');
  const ben = await join(browser, code, 'Ben');
  await page.locator('input[name="friends-team"][value="against"]').check();
  // The friend is shown at once, and it's kept with Ana's settings, in the grown-ups' panel too.
  await expect(ben.page.locator('input[name="friends-team"][value="against"]')).toBeChecked();
  expect(await page.evaluate(() => window.__game.game.settings.trailFriends)).toBe('against');
  await expect(page.locator('input[name="trailFriends"][value="against"]')).toBeChecked();
  expect(await ben.page.evaluate(() => window.__game.game.settings.trailFriends)).toBe('together');

  await bothRunning(page, ben.page);
  for (const each of [page, ben.page]) expect((await trailOf(each)).team).toBe(false);
  await expect.poll(async () => (await trailOf(page)).mateFar[0], { timeout: 20_000 }).not.toBe(null);
  // No line for the team on the board, only the two of them.
  await expect(page.locator('#run-scores li')).toHaveCount(2);
  // 150 metres in front, Ana runs on at the trail's pace: she covers the ground Ben does.
  await runTo(page, (await trailOf(ben.page)).distance + 150);
  const [hers, his] = await ranIn(page, ben.page, 6);
  expect((await trailOf(page)).pack).toBe(1);
  await expect(page.locator('#run-pack')).toBeHidden();
  expect(hers / his).toBeGreaterThan(0.8);

  for (const each of [page, ben.page]) {
    await each.evaluate(() => {
      const { run } = window.__game;
      run.distance = run.end - 3;
      run.noteActivity();
    });
  }
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  await expect(page.locator('.friends-results')).not.toHaveClass(/is-team/);
  await expect(page.locator('.friends-results')).toContainText('1st');
  await expect(page.locator('#finish-team')).toBeHidden();
  await expect(page.locator('#finish-title')).not.toHaveText('You ran it together!');
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});
