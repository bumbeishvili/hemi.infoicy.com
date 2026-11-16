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

/** How many times these little words came up. */
const timesSaid = async (page, words) => (await toasts(page)).filter((each) => each === words).length;

/** Puts a car on the finish line, so it crosses it on its next frame, whether or not its hand is open. */
const toTheLine = (page) => page.evaluate(() => {
  const { race } = window.__game;
  race.distance = race.raceDistance;
});

/** Shows a closed hand, a rest, and waits for that car to stop. */
async function rest(page) {
  await show(page, null, 'fist');
  await expect.poll(async () => (await raceOf(page)).speed, { timeout: 30_000 }).toBe(0);
}

test('together, a friend resting with a closed hand from the start: the car in front eases to half its speed but never stops, and is told once, not over and over', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openGame(page, { laps: 1 });
  const code = await makeRace(page, 'Ana');
  const ben = await join(browser, code, 'Ben');
  await bothRacing(page, ben.page);
  await keepToasts(page);
  // Ben rests his hand as soon as it starts, and his car stays near the grid.
  await rest(ben.page);
  const benAt = (await raceOf(ben.page)).distance;

  // Ana is far in front of him. She's told why she has eased off, once.
  const session = () => page.evaluate(() => window.__game.session.playSeconds);
  await driveTo(page, benAt + 150);
  await expect.poll(async () => (await raceOf(page)).convoy).toBe(0.5);
  await expect.poll(() => toasts(page), { timeout: 5000 }).toContain('Waiting for your friends!');
  const toldAt = await session();
  // Ana keeps the lowest speed her car goes at from now on.
  await page.evaluate(() => {
    window.__slowest = Infinity;
    const watch = () => {
      window.__slowest = Math.min(window.__slowest, window.__game.race.speed);
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
  // Close to him and far in front again, a few times in a moment, as when a gap hovers about where easing begins:
  // the words don't come up again and again.
  for (let again = 0; again < 3; again += 1) {
    await driveTo(page, benAt + 20);
    await expect.poll(async () => (await raceOf(page)).convoy, { timeout: 2000 }).toBe(1);
    await driveTo(page, benAt + 150);
    await expect.poll(async () => (await raceOf(page)).convoy, { timeout: 2000 }).toBe(0.5);
  }
  // Nor do they come back while she stays eased off, long after the few seconds between two of them.
  await expect.poll(session, { timeout: 30_000 }).toBeGreaterThan(toldAt + 8);
  expect(await timesSaid(page, 'Waiting for your friends!')).toBe(1);
  // All that time her car went on at half its speed, and never stopped.
  expect((await raceOf(page)).convoy).toBe(0.5);
  expect(await page.evaluate(() => window.__slowest)).toBeGreaterThan(5);
  // And Ben's resting car wasn't moved by the tow he gets.
  const his = await raceOf(ben.page);
  expect(his.convoy).toBe(1.2);
  expect([his.speed, his.distance]).toEqual([0, benAt]);

  // Ana gets to the line. Ben, left on the road far behind her, is never held back, and gets there too.
  await toTheLine(page);
  await waitForScreen(page, 'finish');
  await show(ben.page, null, 'open');
  await expect.poll(async () => (await raceOf(ben.page)).speed, { timeout: 30_000 }).toBeGreaterThan(12);
  expect((await raceOf(ben.page)).convoy).toBeGreaterThanOrEqual(1);
  await toTheLine(ben.page);
  await waitForScreen(ben.page, 'finish');
  for (const each of [page, ben.page]) {
    await expect(each.locator('#screen-finish h2')).toHaveText('You raced together!');
    await expect(each.locator('.friends-results li')).toHaveCount(2);
    await expect(each.locator('.friends-results')).not.toContainText(/1st|2nd|still racing/);
  }
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('together, a friend who leaves in the middle isn\'t waited for any more, and the stars they caught stay in the total', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openGame(page, { laps: 1 });
  const code = await makeRace(page, 'Ana');
  const ben = await join(browser, code, 'Ben');
  await bothRacing(page, ben.page);
  // Ben catches 5 stars, rests, and Ana's game has heard how many he has.
  await rest(ben.page);
  await ben.page.evaluate(() => {
    window.__game.race.starTotal += 5;
  });
  const his = (await raceOf(ben.page)).stars;
  await expect.poll(async () => {
    const hers = await raceOf(page);
    return hers.teamStars - hers.stars;
  }, { timeout: 15_000 }).toBe(his);
  // Ana is far in front, waiting for him.
  await driveTo(page, (await raceOf(ben.page)).distance + 150);
  await expect.poll(async () => (await raceOf(page)).convoy).toBe(0.5);

  // Ben closes his game. Soon his car has gone, and Ana goes at her own speed again.
  expect(ben.errors).toEqual([]);
  await ben.context.close();
  await expect.poll(async () => (await raceOf(page)).friends.length, { timeout: 15_000 }).toBe(0);
  await expect.poll(async () => (await raceOf(page)).convoy, { timeout: 5000 }).toBe(1);
  // His stars are still in the total, at the top and on her finish card, where he isn't listed.
  const after = await raceOf(page);
  expect(after.teamStars - after.stars).toBe(his);
  await expect.poll(async () => Number(await page.locator('#chip-team').textContent()) - (await raceOf(page)).stars).toBe(his);
  await toTheLine(page);
  await waitForScreen(page, 'finish');
  const hers = (await raceOf(page)).stars;
  await expect(page.locator('#screen-finish h2')).toHaveText('You raced together!');
  await expect(page.locator('.friends-results li')).toHaveCount(1);
  await expect(page.locator('#finish-story')).toHaveText(`Together you caught ${hers + his} stars.`);
});

test('together, three cars: the one in front waits for the last, not the nearest, the one in the middle is towed, and all their stars add up', async ({ page, browser }) => {
  test.setTimeout(360_000);
  await openGame(page, { laps: 1 });
  const code = await makeRace(page, 'Ana');
  const ben = await join(browser, code, 'Ben');
  const cat = await join(browser, code, 'Cat');
  await expect(page.locator('#friends-here li')).toHaveCount(3);
  const all = [page, ben.page, cat.page];
  for (const each of all) {
    await show(each, null, 'open');
    await each.locator('#start').click();
  }
  for (const each of all) await waitForScreen(each, 'playing');
  for (const each of all) {
    expect((await raceOf(each)).friends).toHaveLength(2);
    await expect(each.locator('#chip-place-box')).toBeHidden();
    await expect(each.locator('#chip-team-box')).toBeVisible();
    await expect(each.locator('#race-order .order-row')).toHaveCount(3);
  }
  // All three rest, so their cars stay where they're put.
  for (const each of all) await rest(each);
  const benAt = (await raceOf(ben.page)).distance;
  const seenBy = async (where, name) => (await raceOf(where)).friends.find((friend) => friend.name === name).distance;

  // Cat is far in front of Ben, and Ana a little in front of Cat. Ana waits for Ben, the last, though Cat is near.
  await driveTo(cat.page, benAt + 120);
  await expect.poll(() => seenBy(page, 'Cat'), { timeout: 10_000 }).toBeGreaterThan(benAt + 110);
  await driveTo(page, benAt + 150);
  await expect.poll(async () => (await raceOf(page)).convoy, { timeout: 10_000 }).toBe(0.5);
  // Cat, in the middle, waits for Ben too, rather than being towed after Ana. Ben is towed.
  await expect.poll(async () => (await raceOf(cat.page)).convoy, { timeout: 10_000 }).toBe(0.5);
  await expect.poll(async () => (await raceOf(ben.page)).convoy, { timeout: 10_000 }).toBe(1.2);
  // Cat drops back near Ben: now she's far behind Ana, the first, and towed.
  await driveTo(cat.page, benAt + 20);
  await expect.poll(async () => (await raceOf(cat.page)).convoy, { timeout: 10_000 }).toBe(1.2);
  expect((await raceOf(page)).convoy).toBe(0.5);

  // Stars: each one's count reaches both the others.
  for (const [each, more] of [[page, 3], [ben.page, 4], [cat.page, 5]]) {
    await each.evaluate((n) => {
      window.__game.race.starTotal += n;
    }, more);
  }
  const everyone = async () => {
    let total = 0;
    for (const each of all) total += (await raceOf(each)).stars;
    return total;
  };
  const total = await everyone();
  expect(total).toBeGreaterThanOrEqual(12);
  await expect.poll(async () => {
    const seen = [];
    for (const each of all) seen.push((await raceOf(each)).teamStars);
    return seen;
  }, { timeout: 15_000 }).toEqual([total, total, total]);

  // All three get to the line, and each card has all three, nobody placed, and what they come to.
  for (const each of all) {
    await toTheLine(each);
    await waitForScreen(each, 'finish');
  }
  for (const each of all) {
    await expect(each.locator('#screen-finish h2')).toHaveText('You raced together!');
    await expect(each.locator('.friends-results li')).toHaveCount(3);
    await expect(each.locator('.friends-results')).not.toContainText(/1st|2nd|3rd|still racing/);
    await expect(each.locator('#finish-story')).toHaveText(`Together you caught ${total} stars.`);
  }
  for (const each of [ben, cat]) {
    expect(each.errors).toEqual([]);
    await each.context.close();
  }
});

test('after a together race, racing again starts the stars and the little words afresh, and the grown-ups\' panel makes the next one a race', async ({ page, browser }) => {
  test.setTimeout(360_000);
  await openGame(page, { laps: 1 });
  const code = await makeRace(page, 'Ana');
  const ben = await join(browser, code, 'Ben');
  await bothRacing(page, ben.page);
  await keepToasts(page);
  // Ben catches 5 stars. Ana, far in front, is told she's waiting, and crosses the line still waiting.
  await ben.page.evaluate(() => {
    window.__game.race.starTotal += 5;
  });
  await expect.poll(async () => {
    const hers = await raceOf(page);
    return hers.teamStars - hers.stars;
  }, { timeout: 15_000 }).toBeGreaterThanOrEqual(5);
  await driveTo(page, (await raceOf(ben.page)).distance + 150);
  await expect.poll(() => toasts(page), { timeout: 5000 }).toContain('Waiting for your friends!');
  for (const each of [page, ben.page]) {
    await toTheLine(each);
    await waitForScreen(each, 'finish');
  }

  // They race again, together. Nobody has any stars yet: Ben's from the last race aren't counted again.
  await page.locator('#play-again').click();
  await ben.page.locator('#play-again').click();
  await waitForScreen(page, 'playing');
  await waitForScreen(ben.page, 'playing');
  for (const each of [page, ben.page]) {
    expect((await raceOf(each)).team).toBe(true);
    expect((await raceOf(each)).teamStars).toBe(0);
    await expect(each.locator('#chip-team')).toHaveText('0');
  }
  // Ben rests, and Ana, far in front of him, is told she's waiting, as it begins, as in the first race.
  await page.evaluate(() => {
    window.__toasts.length = 0;
  });
  await rest(ben.page);
  await driveTo(page, (await raceOf(ben.page)).distance + 150);
  await expect.poll(async () => (await raceOf(page)).convoy).toBe(0.5);
  await expect.poll(() => toasts(page), { timeout: 5000 }).toContain('Waiting for your friends!');
  await show(ben.page, null, 'open');
  for (const each of [page, ben.page]) {
    await toTheLine(each);
    await waitForScreen(each, 'finish');
  }

  // Ana races again, and while she waits for Ben, her grown-up chooses a race against each other in the panel.
  // (On the finish card the gear can't be pressed: the card is over it.) Both friends boxes say so at once.
  await page.locator('#play-again').click();
  await waitForScreen(page, 'waiting');
  await page.locator('#open-panel').click();
  await page.locator('input[name="raceFriends"][value="against"]').check();
  await page.locator('#close-panel').click();
  await expect(page.locator('input[name="friends-team"][value="against"]')).toBeChecked();
  await expect(ben.page.locator('input[name="friends-team"][value="against"]')).toBeChecked();

  // The next race is the race it was: places, no convoy, no stars together, and a winner.
  await ben.page.locator('#play-again').click();
  await waitForScreen(page, 'playing');
  await waitForScreen(ben.page, 'playing');
  for (const each of [page, ben.page]) {
    expect((await raceOf(each)).team).toBe(false);
    await expect(each.locator('#chip-place-box')).toBeVisible();
    await expect(each.locator('#chip-team-box')).toBeHidden();
    await expect(each.locator('#race-order .order-number').first()).toBeVisible();
  }
  await driveTo(page, (await raceOf(ben.page)).distance + 150);
  expect((await raceOf(page)).convoy).toBe(1);
  await toTheLine(page);
  await waitForScreen(page, 'finish');
  await expect(page.locator('#screen-finish h2')).toHaveText('You won the race!');
  await expect(page.locator('.friends-results li').nth(0)).toContainText(/1st You \d:\d\d\.\d/);
  await expect(page.locator('#finish-story')).toBeHidden();
  expect((await raceOf(page)).finishLine).toBe('You did it! Great racing!');
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('a race alone straight after a together race has nothing of the team left: a place, the numbers, and the race\'s own words', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openGame(page, { laps: 1 });
  const code = await makeRace(page, 'Ana');
  const ben = await join(browser, code, 'Ben');
  await bothRacing(page, ben.page);
  for (const each of [page, ben.page]) {
    await toTheLine(each);
    await waitForScreen(each, 'finish');
  }
  await expect(page.locator('#finish-story')).toBeVisible();

  // Ana races again, and while she waits for Ben, races on her own instead, against the usual cars.
  await page.locator('#play-again').click();
  await waitForScreen(page, 'waiting');
  await page.locator('#friends-alone').click();
  await waitForScreen(page, 'playing');
  const alone = await raceOf(page);
  expect([alone.team, alone.friends, alone.convoy]).toEqual([false, null, 1]);
  await expect(page.locator('#chip-place-box')).toBeVisible();
  await expect(page.locator('#chip-team-box')).toBeHidden();
  expect(await page.evaluate(() => document.body.hasAttribute('data-friends-team'))).toBe(false);
  await expect(page.locator('#race-order .order-number').first()).toBeVisible();

  await toTheLine(page);
  await waitForScreen(page, 'finish');
  await expect(page.locator('#screen-finish h2')).toHaveText('You won the race!');
  await expect(page.locator('#finish-story')).toBeHidden();
  await expect(page.locator('.friends-results')).toBeHidden();
  expect((await raceOf(page)).finishLine).toBe('You did it! Great racing!');
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});
