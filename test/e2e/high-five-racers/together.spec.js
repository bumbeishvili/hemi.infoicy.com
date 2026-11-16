// Friends in High Five Racers, together, as the game comes: two children, each on their own computer, drive round
// as one convoy on the same side. Whoever is far in front eases off, whoever is far behind gets a tow, the stars
// they catch add up, and nobody is placed. Here they're two separate browsers, talking through the race server on
// this computer (tools/race-server.mjs).
import { expect, openGame, show, test, waitForScreen } from './helpers.js';

const raceOf = (page) => page.evaluate(() => {
  const { race, game, session } = window.__game;
  return {
    distance: race.distance,
    speed: race.speed,
    team: race.team,
    convoy: race.convoy,
    stars: race.info.stars,
    teamStars: game.teamStars,
    friends: race.friends?.map((friend) => ({ name: friend.spec.name, distance: friend.distance })) ?? null,
    finishLine: session.finishLine,
    ownLevel: session.levels.current,
  };
});

/** A second player, in a browser of their own, with the same checks for errors as the first. */
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

/** A grown-up makes a race, with a name, and gets its code. */
async function makeRace(page, name) {
  await page.locator('#friends-toggle').click();
  await page.locator('#friends-make').click();
  await expect(page.locator('#friends-code-shown')).toHaveText(/^[A-HJ-NP-Z2-9]{3}$/);
  await page.locator('#friends-name').fill(name);
  await page.locator('#friends-name').dispatchEvent('change');
  return page.locator('#friends-code-shown').textContent();
}

/** A friend opens the link on their own computer, with a name. */
async function join(browser, code, name, settings = {}) {
  const friend = await secondPlayer(browser);
  await openGame(friend.page, settings, 'high-five-racers', `#race=${code}`);
  await expect(friend.page.locator('#friends-code-shown')).toHaveText(code);
  await friend.page.locator('#friends-name').fill(name);
  await friend.page.locator('#friends-name').dispatchEvent('change');
  return friend;
}

/** Both show an open hand and press Let's race!, and both are racing. */
async function bothRacing(page, other) {
  for (const each of [page, other]) {
    await show(each, null, 'open');
    await each.locator('#start').click();
  }
  await waitForScreen(page, 'playing');
  await waitForScreen(other, 'playing');
}

/** Keeps every one of the little words that come up beside the action, from now on. */
const keepToasts = (page) => page.evaluate(() => {
  window.__toasts = [];
  const words = document.getElementById('toast-text');
  new MutationObserver(() => window.__toasts.push(words.textContent)).observe(words, { childList: true, characterData: true, subtree: true });
});
const toasts = (page) => page.evaluate(() => window.__toasts);

/** Puts a car this far along the road. */
const driveTo = (page, metres) => page.evaluate((far) => {
  window.__game.race.distance = far;
}, metres);

test('together, as the game comes: the car far in front eases off, the one far behind gets a tow, and the stars add up on both screens', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openGame(page, { laps: 1, fighter: 'kit', levels: { 'high-five-racers': 2 } });
  const code = await makeRace(page, 'Ana');
  // Whoever made the race chooses, and it comes as together.
  await expect(page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await expect(page.locator('#friends-how')).toContainText('one team');
  // Ben's own choice is a race, but it's Ana's: he's shown hers, and can't change it.
  const ben = await join(browser, code, 'Ben', { raceFriends: 'against', laps: 4 });
  await expect(ben.page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await expect(ben.page.locator('input[name="friends-team"][value="together"]')).toBeDisabled();
  await expect(ben.page.locator('#friends-teams-whose')).toHaveText('Ana chose.');

  await bothRacing(page, ben.page);
  for (const each of [page, ben.page]) {
    expect((await raceOf(each)).team).toBe(true);
    // No place on a team: the stars together are there instead.
    await expect(each.locator('#chip-place-box')).toBeHidden();
    await expect(each.locator('#chip-team-box')).toBeVisible();
    // The faces down the side still show who's in front on the road, without the numbers.
    await expect(each.locator('#race-order .order-row')).toHaveCount(2);
    await expect(each.locator('#race-order .order-number').first()).toBeHidden();
    await keepToasts(each);
  }

  // Side by side, both drive at their own speed.
  await expect.poll(async () => (await raceOf(ben.page)).distance, { timeout: 30_000 }).toBeGreaterThan(40);
  expect([(await raceOf(page)).convoy, (await raceOf(ben.page)).convoy]).toEqual([1, 1]);

  // Ana gets 150 metres in front. Her car eases off to half its speed, and Ben's gets a tow, a fifth faster.
  await driveTo(page, (await raceOf(ben.page)).distance + 150);
  await expect.poll(async () => (await raceOf(page)).convoy, { timeout: 15_000 }).toBe(0.5);
  await expect.poll(async () => (await raceOf(ben.page)).convoy, { timeout: 15_000 }).toBe(1.2);
  // And that's how they really go: hers at well under his, with the same open hand.
  await expect.poll(async () => {
    const [hers, his] = [await raceOf(page), await raceOf(ben.page)];
    return hers.speed / his.speed;
  }, { timeout: 30_000 }).toBeLessThan(0.6);
  expect((await raceOf(page)).speed).toBeGreaterThan(5);
  // Each is told why, in little words, as it begins.
  await expect.poll(() => toasts(page)).toContain('Waiting for your friends!');
  await expect.poll(() => toasts(ben.page)).toContain('Catching up!');
  expect(await toasts(page)).not.toContain('Catching up!');
  await page.screenshot({ path: 'test-results/screens/racers-together-convoy.png' });

  // Back side by side, nobody is held or towed.
  await driveTo(ben.page, (await raceOf(page)).distance);
  await expect.poll(async () => (await raceOf(page)).convoy, { timeout: 15_000 }).toBe(1);
  await expect.poll(async () => (await raceOf(ben.page)).convoy, { timeout: 15_000 }).toBe(1);

  // Stars: each one's count reaches the other, and both screens show what they add up to.
  await page.evaluate(() => {
    window.__game.race.starTotal += 7;
  });
  await ben.page.evaluate(() => {
    window.__game.race.starTotal += 5;
  });
  await expect.poll(async () => {
    const [hers, his] = [await raceOf(page), await raceOf(ben.page)];
    return [hers.teamStars - (hers.stars + his.stars), his.teamStars - (hers.stars + his.stars)];
  }, { timeout: 15_000 }).toEqual([0, 0]);
  expect((await raceOf(page)).teamStars).toBeGreaterThanOrEqual(12);
  for (const each of [page, ben.page]) {
    const shown = Number(await each.locator('#chip-team').textContent());
    const now = (await raceOf(each)).teamStars;
    expect(Math.abs(shown - now)).toBeLessThanOrEqual(3);
  }

  // Ana crosses the line first. Her card is the team's: nobody placed, and Ben still racing.
  await page.evaluate(() => {
    const { race } = window.__game;
    race.distance = race.raceDistance - 8;
  });
  await waitForScreen(page, 'finish');
  await expect(page.locator('#screen-finish h2')).toHaveText('You raced together!');
  expect((await raceOf(page)).finishLine).toBe('You did it together!');
  await expect(page.locator('.friends-results')).toHaveClass(/is-team/);
  await expect(page.locator('.friends-results li').nth(1)).toContainText('still racing');
  await expect(page.locator('#finish-story')).toBeVisible();

  // Ben gets there too, and both cards say the same: what each brought, and what it comes to.
  await ben.page.evaluate(() => {
    const { race } = window.__game;
    race.distance = race.raceDistance - 8;
  });
  await waitForScreen(ben.page, 'finish');
  const [hers, his] = [(await raceOf(page)).stars, (await raceOf(ben.page)).stars];
  const plural = (count) => `${count} ${count === 1 ? 'star' : 'stars'}`;
  for (const each of [page, ben.page]) {
    await expect(each.locator('#screen-finish h2')).toHaveText('You raced together!');
    await expect(each.locator('#finish-story')).toHaveText(`Together you caught ${plural(hers + his)}.`);
    await expect(each.locator('.friends-results li')).toHaveCount(2);
    await expect(each.locator('.friends-results')).not.toContainText(/1st|2nd|still racing/);
  }
  await expect(page.locator('.friends-results li.is-you')).toContainText(plural(hers));
  await expect(ben.page.locator('.friends-results li.is-you')).toContainText(plural(his));
  await expect(page.locator('.friends-results')).toContainText(new RegExp(`Ben\\s*${plural(his)}`));
  await page.screenshot({ path: 'test-results/screens/racers-together-finish.png' });
  // It was the host's course, so nobody's own level moves on.
  expect([(await raceOf(page)).ownLevel, (await raceOf(ben.page)).ownLevel]).toEqual([2, 1]);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('against each other, a grown-up\'s choice in the friends box, it\'s the race it was: nobody eased or towed, places and times', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openGame(page, { laps: 1 });
  const code = await makeRace(page, 'Ana');
  const ben = await join(browser, code, 'Ben');
  await page.locator('input[name="friends-team"][value="against"]').check();
  // The friend is shown at once, and it's kept with Ana's settings, in the grown-ups' panel too.
  await expect(ben.page.locator('input[name="friends-team"][value="against"]')).toBeChecked();
  expect(await page.evaluate(() => window.__game.session.settings.raceFriends)).toBe('against');
  await expect(page.locator('input[name="raceFriends"][value="against"]')).toBeChecked();
  expect(await ben.page.evaluate(() => window.__game.session.settings.raceFriends)).toBe('together');

  await bothRacing(page, ben.page);
  for (const each of [page, ben.page]) {
    expect((await raceOf(each)).team).toBe(false);
    await expect(each.locator('#chip-place-box')).toBeVisible();
    await expect(each.locator('#chip-team-box')).toBeHidden();
    await expect(each.locator('#race-order .order-number').first()).toBeVisible();
    await keepToasts(each);
  }
  await expect.poll(async () => (await raceOf(ben.page)).distance, { timeout: 30_000 }).toBeGreaterThan(40);
  await driveTo(page, (await raceOf(ben.page)).distance + 150);
  await page.waitForTimeout(1500);
  expect([(await raceOf(page)).convoy, (await raceOf(ben.page)).convoy]).toEqual([1, 1]);
  for (const each of [page, ben.page]) {
    expect((await toasts(each)).filter((text) => /Waiting for your friends|Catching up/.test(text))).toEqual([]);
  }

  await page.evaluate(() => {
    const { race } = window.__game;
    race.distance = race.raceDistance - 8;
  });
  await waitForScreen(page, 'finish');
  await expect(page.locator('#screen-finish h2')).toHaveText('You won the race!');
  await expect(page.locator('.friends-results')).not.toHaveClass(/is-team/);
  await expect(page.locator('.friends-results li').nth(0)).toContainText(/1st You \d:\d\d\.\d/);
  await expect(page.locator('#finish-story')).toBeHidden();
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});
