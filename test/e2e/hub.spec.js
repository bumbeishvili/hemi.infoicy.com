// The page for choosing a game, and getting back to it.
import { expect, openGame, shot, test } from './helpers.js';

const GAMES = [
  { name: 'High Five Racers', folder: 'high-five-racers', start: 'Let’s race!' },
  { name: 'Balloon Pop', folder: 'balloon-pop', start: 'Let’s pop!' },
  { name: 'Mighty Moves', folder: 'mighty-moves', start: 'Choose your fighter' },
  { name: 'Leap Trail', folder: 'leap-trail', start: 'Choose your runner' },
  { name: 'Sky Wings', folder: 'sky-wings', start: 'Choose your pilot' },
  { name: 'Robot Rescue', folder: 'robot-rescue', start: 'Ride to the rescue' },
  { name: 'Tank Patrol', folder: 'tank-patrol', start: 'Climb aboard' },
  { name: 'Cannon Bay', folder: 'cannon-bay', start: 'Set sail!' },
  { name: 'Giraffe’s Long Walk Home', folder: 'giraffe-walk', start: 'Help Giraffe' },
  { name: 'Spider Catcher', folder: 'spider-catcher', start: 'Catch the spiders' },
  { name: 'Giraffe’s Smoothie Stand', folder: 'smoothie-stand', start: 'Open the stand' },
  { name: 'The Lighthouse Keeper', folder: 'lighthouse', start: 'Climb the lighthouse' },
  { name: 'Bounce Back', folder: 'bounce-back', start: 'Let’s play!' },
  { name: 'Giraffe’s Maze', folder: 'giraffe-maze', start: 'Into the maze!' },
  { name: 'Giraffe’s Garden', folder: 'giraffe-garden', start: 'Water the garden' },
  { name: 'Giraffe’s Goal', folder: 'giraffe-goal', start: 'Go in goal' },
  { name: 'Frost Arena', folder: 'frost-arena', start: 'Join the team' },
  { name: 'Arrow Meadow', folder: 'arrow-meadow', start: 'Pick up the bow' },
  { name: 'Giraffe’s Puzzles', folder: 'giraffe-puzzles', start: 'Fix the picture' },
  { name: 'Flap, Little Chick!', folder: 'chick-flap', start: 'Flap home!' },
  { name: 'Mighty Lift', folder: 'mighty-lift', start: 'Choose your lifter' },
  { name: 'Gobble and Grow', folder: 'gobble-grow', start: 'Let’s eat!' },
  { name: 'Giraffe’s Paint Box', folder: 'giraffe-paint', start: 'Start painting' },
  { name: 'Moto Mountain', folder: 'moto-mountain', start: 'Choose your rider' },
  { name: 'Rooftop Rope', folder: 'rooftop-rope', start: 'Choose your walker' },
  { name: 'Giraffe’s World Tour', folder: 'world-tour', start: 'Start the tour' },
  { name: 'Swamp Splash', folder: 'swamp-splash', start: 'Choose your jumper' },
  { name: 'Hat Chase', folder: 'hat-chase', start: 'Choose your walker' },
  { name: 'Giraffe’s Riddle Doors', folder: 'riddle-doors', start: 'Open the doors' },
  { name: 'Left, Right, Pop!', folder: 'left-right-pop', start: 'Start popping' },
];

test('the hub offers every game, and each one opens and comes back', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Choose a game');
  await expect(page.locator('.game-card')).toHaveCount(GAMES.length);
  await page.waitForTimeout(200);
  await shot(page, 'h1-hub');

  for (const { name, folder, start } of GAMES) {
    await test.step(name, async () => {
      await page.locator('.game-card', { hasText: name }).click();
      await expect(page).toHaveURL(new RegExp(`/games/${folder}/`));
      await expect(page.locator('#start')).toHaveText(start);
      await expect(page.locator('h1')).toHaveText(name);
      await shot(page, `h2-${folder}-title`);

      await page.locator('#screen-welcome .all-games').click();
      await expect(page.locator('h1')).toHaveText('Choose a game');
    });
  }
});

for (const { name, folder } of GAMES) {
  test(`${name}'s settings have a way back to all the games`, async ({ page }) => {
    await openGame(page, {}, folder);
    await page.locator('#open-panel').click();
    const back = page.locator('#panel #panel-all-games');
    await expect(back).toBeVisible();
    await expect(back).toHaveText('All games');
    await shot(page, `h4-${folder}-panel`);
    await back.click();
    await expect(page.locator('h1')).toHaveText('Choose a game');
  });
}

for (const { folder } of GAMES.slice(0, 2)) {
  test(`${folder} shows a film of a hand opening during the hand check`, async ({ page }) => {
    await openGame(page, {}, folder);
    await page.evaluate(() => window.__camera.show({ left: null, right: 'fist' }));
    await page.locator('#start').click();
    await expect.poll(() => page.evaluate(() => window.__game.screen), { timeout: 60_000 }).toBe('check');
    await expect(page.locator('.hand-demo')).toBeVisible();
    expect(await page.locator('.hand-demo-finger').first().evaluate((node) => getComputedStyle(node).animationName)).toBe('hand-opens');
    await page.waitForTimeout(900);
    await shot(page, `h5-${folder}-check`);
  });
}

/** A card's film: how far it's got, whether it's paused, and how fast it plays. */
const filmOf = (card) => card.locator('.game-film').evaluate((film) => ({ time: film.currentTime, paused: film.paused, rate: film.playbackRate }));

test('every game\'s card plays a film of it while it\'s on the screen, and pointing at it says what the game is about', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/');
  await expect(page.locator('.game-moves')).toHaveCount(0);
  for (const { name, folder } of GAMES) {
    await test.step(name, async () => {
      const card = page.locator('.game-card', { hasText: name });
      await card.scrollIntoViewIfNeeded();
      // Without being pointed at.
      await page.mouse.move(2, 2);
      await expect.poll(async () => (await filmOf(card)).time, { timeout: 10_000 }).toBeGreaterThan(0.3);
      await expect(card).toHaveClass(/is-playing/);
      expect(await card.locator('.game-film').getAttribute('src')).toBe(`demos/${folder}.webm`);
      // Just its film and its name, until it's pointed at.
      const about = card.locator('.game-art .game-about');
      await expect(about).toHaveCount(1);
      await expect(about).toHaveCSS('opacity', '0');
      await card.hover();
      await expect(about).toHaveCSS('opacity', '1');
      await shot(page, `h6-film-${folder}`);
    });
  }
});

test('a film off the screen is paused, and one that gets to its end goes round again', async ({ page }) => {
  await page.goto('/');
  const first = page.locator('.game-card').first();
  const last = page.locator('.game-card').last();
  await expect.poll(async () => (await filmOf(first)).time, { timeout: 10_000 }).toBeGreaterThan(0.3);
  await last.scrollIntoViewIfNeeded();
  await expect.poll(async () => (await filmOf(first)).paused, { timeout: 5000 }).toBe(true);
  await expect.poll(async () => (await filmOf(last)).time, { timeout: 10_000 }).toBeGreaterThan(0.3);
  await last.locator('.game-film').evaluate((film) => new Promise((done) => film.addEventListener('ended', done, { once: true })));
  await expect.poll(async () => (await filmOf(last)).time, { timeout: 5000 }).toBeLessThan(3);
  await expect.poll(async () => (await filmOf(last)).time, { timeout: 5000 }).toBeGreaterThan(0.2);
  expect((await filmOf(last)).paused).toBe(false);
});

test('with reduced motion, a film only plays, a little slower, while its card is pointed at or chosen', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const card = page.locator('.game-card').first();
  await page.waitForTimeout(1500);
  expect((await filmOf(card)).time).toBe(0);
  await card.hover();
  await expect.poll(async () => (await filmOf(card)).time, { timeout: 10_000 }).toBeGreaterThan(0.2);
  expect((await filmOf(card)).rate).toBe(0.7);
  await page.mouse.move(2, 2);
  await expect.poll(async () => (await filmOf(card)).paused, { timeout: 5000 }).toBe(true);
  await page.locator('.game-card').nth(1).focus();
  await expect.poll(async () => (await filmOf(page.locator('.game-card').nth(1))).time, { timeout: 10_000 }).toBeGreaterThan(0.2);
});

test('the hub fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await shot(page, 'h3-hub-phone');
  await page.locator('.game-card').last().scrollIntoViewIfNeeded();
  await expect(page.locator('.game-card').last()).toBeInViewport();
});

test('settings carry from one game to the other, but each game keeps its own', async ({ page }) => {
  await openGame(page, { hands: 'left', language: 'ka' });
  await page.locator('#open-panel').click();
  await page.locator('input[name="laps"][value="4"]').check();
  await page.locator('#close-panel').click();

  await page.goto('/games/balloon-pop/index.html?debug');
  await expect(page.locator('#start')).toBeVisible();
  const shared = await page.evaluate(() => {
    const { settings } = window.__game.session;
    return { hands: settings.hands, language: settings.language, balloons: settings.balloons };
  });
  expect(shared).toEqual({ hands: 'left', language: 'ka', balloons: 20 });
  await page.locator('#open-panel').click();
  await page.locator('input[name="balloons"][value="60"]').check();
  await page.locator('#close-panel').click();

  await page.goto('/games/high-five-racers/index.html?debug');
  await expect(page.locator('#start')).toBeVisible();
  expect(await page.evaluate(() => window.__game.session.settings.laps)).toBe(4);
});

test('the hub makes no requests off this computer', async ({ page, baseURL }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/');
  await page.waitForTimeout(300);
  const offsite = requests.filter((url) => !url.startsWith(baseURL) && !url.startsWith('data:'));
  expect(offsite).toEqual([]);
});

// ---------- the search, and its filters ----------

/** The names of the games whose cards are showing, in the order they're in. */
const showing = (page) => page.locator('.game-card:not([hidden]) h2').allTextContents();
const filterNamed = (page, name) => page.locator('#hub-filters').getByLabel(name, { exact: true });
const total = (page) => page.locator('.game-card').count();

/** Waits until every game in wanted is showing and none in unwanted is. */
async function expectGames(page, wanted, unwanted = []) {
  await expect.poll(async () => {
    const names = await showing(page);
    return { missing: wanted.filter((name) => !names.includes(name)), shouldnt: unwanted.filter((name) => names.includes(name)) };
  }, { timeout: 5000 }).toEqual({ missing: [], shouldnt: [] });
}

/** Waits for exactly these games to be showing. */
const expectOnly = (page, names) => expect.poll(() => showing(page), { timeout: 5000 }).toEqual(names);

const noSidewaysScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

test('typing in the search finds games by their name, what they\'re about and what kind they are', async ({ page }) => {
  await page.goto('/');
  const all = await total(page);
  await expect(page.locator('#hub-found')).toHaveText('All games');
  await expect(page.locator('.hub-found-line .hub-show-all')).toBeHidden();
  await shot(page, 'h7-search');

  const box = page.locator('#hub-search');
  const cases = [
    // A kind of game, and the start of one.
    ['shoot', ['Sky Wings', 'Robot Rescue', 'Tank Patrol', 'Cannon Bay', 'Frost Arena']],
    ['racing', ['High Five Racers', 'Leap Trail', 'Sky Wings', 'Flap, Little Chick!', 'Moto Mountain']],
    // The game's own words.
    ['tennis', ['Bounce Back']],
    ['maths', ['Balloon Pop']],
    // What it's about, and its name.
    ['pirates', ['Sky Wings', 'Cannon Bay']],
    ['fruit', ['Giraffe’s Long Walk Home', 'Giraffe’s Smoothie Stand']],
    ['lighthouse', ['The Lighthouse Keeper']],
    ['flowers', ['Giraffe’s Garden']],
    ['penalty', ['Giraffe’s Goal']],
    ['rifle', ['Frost Arena']],
    ['jigsaw', ['Giraffe’s Puzzles']],
    ['galaxy', ['Gobble and Grow']],
    ['globe', ['Giraffe’s World Tour']],
    ['frogs', ['Swamp Splash']],
    ['magpie', ['Hat Chase']],
    // Capitals, accents and apostrophes don't matter, and every word has to fit.
    ['TÉNNIS', ['Bounce Back']],
    ['giraffe\'s smoothie', ['Giraffe’s Smoothie Stand']],
    ['  Spider   catcher ', ['Spider Catcher']],
    // A plural finds what it's a plural of: Bounce Back's ball and Giraffe's Goal's, and Balloon Pop's balloons.
    ['balls', ['Balloon Pop', 'Bounce Back', 'Giraffe’s Goal']],
  ];
  for (const [typed, names] of cases) {
    await test.step(typed, async () => {
      await box.fill(typed);
      await expectOnly(page, names);
      await expect(page.locator('#hub-found')).toHaveText(`${names.length} of ${all} games`);
      await expect(page.locator('.hub-found-line .hub-show-all')).toBeVisible();
    });
  }
  // Every game that can be played sitting down, which is all but Mighty Moves, Rooftop Rope, Swamp Splash and Hat Chase.
  await box.fill('wheelchair');
  await expectGames(page, ['Balloon Pop', 'Sky Wings', 'Tank Patrol', 'Bounce Back', 'Leap Trail'], ['Mighty Moves', 'Rooftop Rope', 'Swamp Splash', 'Hat Chase']);
  await box.fill('');
  await expect.poll(() => showing(page)).toHaveLength(all);
  await expect(page.locator('#hub-found')).toHaveText('All games');
});

test('each filter narrows the games to the ones it\'s about', async ({ page }) => {
  await page.goto('/');
  const all = await total(page);
  const toggle = page.locator('#hub-filters-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#hub-filters')).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#hub-filters')).toBeVisible();
  await page.waitForTimeout(200);
  await shot(page, 'h8-filters');

  // Some of the games each one finds, and some it mustn't.
  const FILTERS = [
    ['Shooting', ['Robot Rescue', 'Tank Patrol', 'Cannon Bay', 'Sky Wings', 'Frost Arena'], ['Balloon Pop', 'Bounce Back', 'Mighty Moves', 'Spider Catcher']],
    ['Racing, running and flying', ['High Five Racers', 'Leap Trail', 'Sky Wings'], ['Tank Patrol', 'Bounce Back', 'Balloon Pop']],
    ['Sports', ['Bounce Back', 'Giraffe’s Goal'], ['High Five Racers', 'Mighty Moves', 'Balloon Pop']],
    ['Fighting', ['Mighty Moves'], ['Robot Rescue', 'Bounce Back', 'Tank Patrol']],
    ['Puzzles and thinking', ['Balloon Pop', 'Giraffe’s Puzzles'], ['Spider Catcher', 'Tank Patrol', 'Mighty Moves']],
    ['Stories and missions', ['Giraffe’s Long Walk Home', 'The Lighthouse Keeper', 'Spider Catcher', 'Giraffe’s Smoothie Stand', 'Robot Rescue'],
      ['Balloon Pop', 'Bounce Back', 'Mighty Moves', 'High Five Racers']],
    ['Catching and popping', ['Balloon Pop', 'Spider Catcher', 'Giraffe’s Smoothie Stand', 'Giraffe’s Long Walk Home'], ['The Lighthouse Keeper', 'Tank Patrol', 'Sky Wings']],
    ['One hand', ['Balloon Pop', 'Tank Patrol', 'Bounce Back', 'High Five Racers', 'Giraffe’s World Tour'], ['Sky Wings', 'Mighty Moves', 'Leap Trail', 'Frost Arena']],
    // Giraffe's World Tour is both: one hand to begin with, and the other holding the flag from level 5.
    ['Both hands', ['Frost Arena', 'Giraffe’s World Tour'], ['Balloon Pop', 'Tank Patrol', 'Sky Wings', 'Mighty Moves']],
    ['Both arms', ['Sky Wings'], ['Balloon Pop', 'Mighty Moves', 'Leap Trail']],
    ['Whole body', ['Mighty Moves', 'Leap Trail', 'Rooftop Rope', 'Swamp Splash', 'Hat Chase'], ['Sky Wings', 'Balloon Pop', 'Bounce Back']],
    ['Mouth', ['Gobble and Grow'], ['Balloon Pop', 'Sky Wings', 'Mighty Moves', 'Frost Arena']],
    ['Sitting down', ['Balloon Pop', 'Sky Wings', 'Tank Patrol', 'Bounce Back'], ['Mighty Moves', 'Rooftop Rope', 'Swamp Splash', 'Hat Chase']],
  ];
  for (const [name, wanted, unwanted] of FILTERS) {
    await test.step(name, async () => {
      const filter = filterNamed(page, name);
      await filter.check();
      await expectGames(page, wanted, unwanted);
      await expect(page.locator('#hub-filters-count')).toHaveText('1');
      await expect(page.locator('#hub-found')).toHaveText(`${(await showing(page)).length} of ${all} games`);
      await filter.uncheck();
      await expect.poll(() => showing(page)).toHaveLength(all);
      await expect(page.locator('.hub-filters-on')).toBeHidden();
    });
  }

  await test.step('With friends: just the cards with the friends badge', async () => {
    const withBadge = await page.locator('.game-card:has(.game-friends) h2').allTextContents();
    expect(withBadge).toEqual(expect.arrayContaining(['High Five Racers', 'Balloon Pop', 'Mighty Moves', 'Sky Wings', 'Bounce Back', 'Tank Patrol']));
    await filterNamed(page, 'With friends').check();
    await expectOnly(page, withBadge);
    await filterNamed(page, 'With friends').uncheck();
  });
});

test('filters in one group add games, the groups narrow each other, and the search narrows them too', async ({ page }) => {
  await page.goto('/');
  const all = await total(page);
  await page.locator('#hub-filters-toggle').click();

  // Either kind.
  await filterNamed(page, 'Shooting').check();
  await filterNamed(page, 'Sports').check();
  await expectGames(page, ['Bounce Back', 'Tank Patrol', 'Sky Wings'], ['Mighty Moves', 'Balloon Pop']);
  await expect(page.locator('#hub-filters-count')).toHaveText('2');
  // Played with both arms, of those.
  await filterNamed(page, 'Both arms').check();
  await expectOnly(page, ['Sky Wings']);
  await page.locator('#hub-filters-clear').click();
  await expect.poll(() => showing(page)).toHaveLength(all);
  await expect(page.locator('#hub-filters-clear')).toBeHidden();

  // Both of these, not either.
  await filterNamed(page, 'Sitting down').check();
  await filterNamed(page, 'With friends').check();
  await expectGames(page, ['Balloon Pop', 'Bounce Back', 'Cannon Bay', 'Giraffe’s Smoothie Stand', 'High Five Racers', 'Sky Wings', 'Spider Catcher', 'Tank Patrol', 'The Lighthouse Keeper'], ['Mighty Moves', 'Rooftop Rope', 'Giraffe’s World Tour', 'Swamp Splash', 'Hat Chase']);
  await page.locator('#hub-filters-clear').click();

  // The search and a filter together.
  await page.locator('#hub-search').fill('ships');
  await expectOnly(page, ['Cannon Bay', 'The Lighthouse Keeper']);
  await filterNamed(page, 'Shooting').check();
  await expectOnly(page, ['Cannon Bay']);
  await expect(page.locator('#hub-found')).toHaveText(`1 of ${all} games`);
  await page.locator('#hub-filters-done').click();
  await page.waitForTimeout(300);
  await shot(page, 'h9-filtered');
  // Another kind brings back its games that fit the search.
  await page.locator('#hub-filters-toggle').click();
  await filterNamed(page, 'Stories and missions').check();
  await expectOnly(page, ['Cannon Bay', 'The Lighthouse Keeper']);
  // They're in the address, for going back to.
  await expect.poll(() => new URL(page.url()).search).toBe('?search=ships&filter=shooting&filter=stories');
});

test('when no game matches, it says so, and one press shows them all again', async ({ page }) => {
  await page.goto('/');
  const all = await total(page);
  const none = page.locator('#hub-none');
  await expect(none).toBeHidden();

  await page.locator('#hub-search').fill('zebra');
  await expect(none).toBeVisible();
  await expect(none).toContainText('No games match');
  await expect.poll(() => showing(page)).toEqual([]);
  // The line above the cards says it too, for a screen reader, and only the box shows.
  await expect(page.locator('#hub-found')).toHaveText('No games match');
  await expect(page.locator('#hub-found')).toHaveClass(/visually-hidden/);
  await expect(page.locator('.hub-found-line .hub-show-all')).toBeHidden();
  await shot(page, 'h9-no-match');
  await none.getByRole('button', { name: 'Show all games' }).click();
  await expect.poll(() => showing(page)).toHaveLength(all);
  await expect(none).toBeHidden();
  await expect(page.locator('#hub-search')).toHaveValue('');
  await expect(page.locator('#hub-found')).toHaveText('All games');
  await expect.poll(() => new URL(page.url()).search).toBe('');

  // Filters that nothing fits: Mighty Moves can't be played sitting down.
  await page.locator('#hub-filters-toggle').click();
  await filterNamed(page, 'Fighting').check();
  await filterNamed(page, 'Sitting down').check();
  await expect(none).toBeVisible();
  await page.locator('#hub-filters-clear').click();
  await expect(none).toBeHidden();
  await expect.poll(() => showing(page)).toHaveLength(all);
  await expect(filterNamed(page, 'Fighting')).not.toBeChecked();

  // And from the line above the cards, which clears the search and the filters together.
  await filterNamed(page, 'Sports').check();
  await page.locator('#hub-search').fill('ball');
  await expectOnly(page, ['Bounce Back', 'Giraffe’s Goal']);
  await page.locator('.hub-found-line .hub-show-all').click();
  await expect.poll(() => showing(page)).toHaveLength(all);
  await expect(filterNamed(page, 'Sports')).not.toBeChecked();
  await expect(page.locator('#hub-search')).toHaveValue('');
});

test('the search and filters work from the keyboard', async ({ page }) => {
  await page.goto('/');
  const all = await total(page);
  const toggle = page.locator('#hub-filters-toggle');

  await page.keyboard.press('Tab');
  await expect(page.locator('.hub-github')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#hub-search')).toBeFocused();
  await page.keyboard.type('ball');
  await expectOnly(page, ['Balloon Pop', 'Bounce Back', 'Giraffe’s Goal']);
  // Escape empties the search box.
  await page.keyboard.press('Escape');
  await expect.poll(() => showing(page)).toHaveLength(all);
  await page.keyboard.type('ball');
  await expectOnly(page, ['Balloon Pop', 'Bounce Back', 'Giraffe’s Goal']);

  await page.keyboard.press('Tab');
  await expect(toggle).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Tab');
  await expect(filterNamed(page, 'Shooting')).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(filterNamed(page, 'Sports')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(filterNamed(page, 'Sports')).toBeChecked();
  await expectOnly(page, ['Bounce Back', 'Giraffe’s Goal']);
  // Enter chooses one too.
  await page.keyboard.press('Tab');
  await expect(filterNamed(page, 'Fighting')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(filterNamed(page, 'Fighting')).toBeChecked();
  await expect(page.locator('#hub-filters-count')).toHaveText('2');
  await page.keyboard.press('Enter');
  await expect(filterNamed(page, 'Fighting')).not.toBeChecked();
  await shot(page, 'h8-filters-keyboard');

  // Escape closes the filters and goes back to their button.
  await page.keyboard.press('Escape');
  await expect(page.locator('#hub-filters')).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAccessibleName('Filters 1 chosen');

  // After the button, past the closed filters, comes "Show all games", and then the games themselves.
  await page.keyboard.press('Tab');
  await expect(page.locator('.hub-found-line .hub-show-all')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => showing(page)).toHaveLength(all);
  await expect(page.locator('#hub-search')).toBeFocused();
  await expect(filterNamed(page, 'Sports')).not.toBeChecked();

  // A hidden game can't be reached with Tab.
  await page.keyboard.type('tennis');
  await expectOnly(page, ['Bounce Back']);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.locator('.game-card[data-game="bounce-back"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/games\/bounce-back\//);
});

test('the search and its filters fit a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const row = page.locator('.hub-search-row');
  const height = (await row.boundingBox()).height;
  expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0);

  await page.locator('#hub-filters-toggle').click();
  await expect(page.locator('#hub-filters')).toBeVisible();
  expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0);
  await shot(page, 'h8-filters-phone');
  await filterNamed(page, 'One hand').check();
  await filterNamed(page, 'With friends').check();
  // The count on the button doesn't push anything onto another line.
  expect((await row.boundingBox()).height).toBe(height);
  expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0);
  await page.locator('#hub-filters-done').click();
  await expect(page.locator('#hub-filters')).toBeHidden();
  await expectGames(page, ['High Five Racers', 'Balloon Pop', 'Bounce Back'], ['Sky Wings', 'Mighty Moves']);
  await shot(page, 'h9-filtered-phone');

  await page.locator('#hub-search').fill('zebra');
  await expect(page.locator('#hub-none')).toBeVisible();
  expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0);
  await shot(page, 'h9-no-match-phone');
});

test('a card the search hides stops its film, and doesn\'t fetch it, until it comes back', async ({ page }) => {
  // Slow enough that the first films are still on their way when their cards are hidden.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: 60_000, uploadThroughput: 60_000 });
  await page.goto('/');
  const card = (game) => page.locator(`.game-card[data-game="${game}"]`);
  const film = (game) => card(game).evaluate((each) => {
    const video = each.querySelector('.game-film');
    return { src: video.getAttribute('src'), loading: video.networkState === video.NETWORK_LOADING, paused: video.paused, time: video.currentTime };
  });
  await expect.poll(async () => (await film('high-five-racers')).loading, { timeout: 10_000 }).toBe(true);

  await page.locator('#hub-search').fill('tennis');
  await expectOnly(page, ['Bounce Back']);
  // Stopped, and no longer fetching, with its picture showing again.
  await expect.poll(() => film('high-five-racers')).toEqual({ src: null, loading: false, paused: true, time: 0 });
  await expect(card('high-five-racers')).not.toHaveClass(/is-playing/);
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  // The one left, now at the top, plays. One that was never on the screen never fetches its film, even with
  // the page scrolled to where it was.
  await expect.poll(async () => (await film('bounce-back')).time, { timeout: 10_000 }).toBeGreaterThan(0.3);
  await page.mouse.wheel(0, 3000);
  await page.waitForTimeout(800);
  expect((await film('lighthouse')).src).toBeNull();
  expect((await film('high-five-racers')).src).toBeNull();

  // Back again, the first one plays once more, and one off the screen still waits.
  await page.locator('.hub-found-line .hub-show-all').click();
  await page.evaluate(() => scrollTo(0, 0));
  await expect.poll(async () => (await film('high-five-racers')).time, { timeout: 10_000 }).toBeGreaterThan(0.3);
  await expect(card('high-five-racers')).toHaveClass(/is-playing/);
  expect((await film('lighthouse')).src).toBeNull();
});

test('going back to the hub brings the search back, and "All games" in a game shows them all', async ({ page }) => {
  await page.goto('/');
  await page.locator('#hub-search').fill('tennis');
  await page.locator('#hub-filters-toggle').click();
  await filterNamed(page, 'Sitting down').check();
  await expect.poll(() => new URL(page.url()).search).toBe('?search=tennis&filter=sitting');

  await page.locator('.game-card', { hasText: 'Bounce Back' }).click();
  await expect(page).toHaveURL(/\/games\/bounce-back\//);
  await page.goBack();
  await expect(page.locator('h1')).toHaveText('Choose a game');
  await expect(page.locator('#hub-search')).toHaveValue('tennis');
  await expect(filterNamed(page, 'Sitting down')).toBeChecked();
  await expectOnly(page, ['Bounce Back']);

  // A link with a search in it opens with it.
  await page.goto('/?search=pirates&filter=arms');
  await expectOnly(page, ['Sky Wings']);
  await expect(page.locator('#hub-filters-count')).toHaveText('1');

  await page.locator('.game-card', { hasText: 'Sky Wings' }).click();
  await page.locator('#screen-welcome .all-games').click();
  await expect(page.locator('h1')).toHaveText('Choose a game');
  await expect(page.locator('#hub-search')).toHaveValue('');
  await expect.poll(() => showing(page)).toHaveLength(await total(page));
});

test('every card has tags the filters know: a kind of game, and what it\'s played with', async ({ page }) => {
  await page.goto('/');
  const groups = await page.locator('#hub-filters fieldset').evaluateAll((sets) => Object.fromEntries(sets.map((set) => [
    set.querySelector('legend').textContent, [...set.querySelectorAll('input')].map((input) => input.value)])));
  const known = Object.values(groups).flat();
  const cards = await page.locator('.game-card').evaluateAll((all) => all.map((card) => ({
    game: card.dataset.game, tags: (card.dataset.tags ?? '').split(/\s+/).filter(Boolean),
  })));
  for (const { game, tags } of cards) {
    expect(tags.filter((tag) => !known.includes(tag)), `${game}'s tags that no filter has`).toEqual([]);
    expect(tags.some((tag) => groups['Kind of game'].includes(tag)), `${game} has a kind of game`).toBe(true);
    expect(tags.some((tag) => groups['Played with'].includes(tag)), `${game} says what it's played with`).toBe(true);
    // The friends badge says that, so the tag isn't needed, and could disagree with the badge.
    expect(tags, `${game}'s badge says whether it's played with friends`).not.toContain('friends');
  }
});
