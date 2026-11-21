// Several playing each other on one screen, with one camera: together.html shows a copy of the game for each of
// them, side by side, each with its own part of the camera's picture, and they play each other through the
// game's own way of playing with friends, in a room kept in the page. See core/seat.js.
import { openGame } from '../helpers.js';
import { expect, handsForAll, openTogether, screenOf, seatState, seatsOf, test, waitForScreen } from './helpers.js';

const raceOf = (seat) => seat.evaluate(() => {
  const { race } = window.__game;
  return {
    distance: race.distance,
    laps: race.laps,
    friends: race.friends?.map((friend) => ({ name: friend.spec.name, distance: friend.distance })) ?? null,
  };
});

const handOpen = (seat) => seat.evaluate(() => window.__game.monitor.snapshot.handOpen);

test('under Play with friends, a game can be started on this computer for two, with the screen split between them', async ({ page }) => {
  await openGame(page);
  await page.locator('#friends-toggle').click();
  const links = page.locator('#friends-seats a');
  await expect(links).toHaveText(['2 players']);
  await expect(page.locator('#friends-seats .friends-or')).toHaveText('or on this computer');
  expect(await links.first().getAttribute('href')).toBe('/together.html?game=high-five-racers&players=2&debug');
  await page.screenshot({ path: 'test-results/screens/together-links.png' });

  // The link shows the game twice, side by side, and both are in one race.
  await links.first().click();
  await expect(page).toHaveURL(/\/together\.html\?game=high-five-racers&players=2/);
  const seats = await seatsOf(page, 2);
  for (const seat of seats) await expect(seat.locator('#friends-here li')).toHaveCount(2, { timeout: 90_000 });
  const boxes = await page.locator('iframe.seat').evaluateAll((frames) => frames.map((frame) => frame.getBoundingClientRect().toJSON()));
  expect(boxes[0].right).toBeLessThanOrEqual(boxes[1].left);
  expect(Math.abs(boxes[0].width - boxes[1].width)).toBeLessThan(2);
  expect(boxes[0].height).toBeGreaterThan(500);
  // Inside a seat there's no link to split the screen again.
  await expect(seats[0].locator('#friends-seats')).toHaveCount(0);

  // And so can a game played with the whole body.
  await page.goto('/games/mighty-moves/index.html?debug');
  await page.locator('#friends-toggle').click();
  await expect(page.locator('#friends-seats a')).toHaveText(['2 players']);
  expect(await page.locator('#friends-seats a').getAttribute('href')).toBe('/together.html?game=mighty-moves&players=2&debug');
});

test('two seats are in one room, which is in the page: nothing goes to a server, and the first seat\'s choices count', async ({ page }) => {
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  const [left, right] = await openTogether(page, 'high-five-racers');
  expect(await seatState(left)).toMatchObject({ seat: '1', of: '2', banner: 'Player 1, on the left', here: ['Player 1 (you)', 'Player 2'] });
  expect(await seatState(right)).toMatchObject({ seat: '2', of: '2', banner: 'Player 2, on the right', here: ['Player 1', 'Player 2 (you)'] });
  // The code, the link, the name and leaving are for friends on their own computers, and aren't shown.
  for (const seat of [left, right]) {
    await expect(seat.locator('#seat-banner')).toBeVisible();
    for (const id of ['friends-code-shown', 'friends-copy', 'friends-name', 'friends-leave']) await expect(seat.locator(`#${id}`)).toBeHidden();
    await expect(seat.locator('#friends-how')).toContainText('Stand in your own part of the camera’s picture');
    await expect(seat.locator('#start')).toBeVisible();
  }
  // Together or against each other is the first seat's to choose, and the second is shown what they chose.
  await expect(left.locator('input[name="friends-team"][value="against"]')).toBeEnabled();
  await expect(right.locator('input[name="friends-team"][value="against"]')).toBeDisabled();
  await expect(right.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await left.locator('input[name="friends-team"][value="against"]').check();
  await expect(right.locator('input[name="friends-team"][value="against"]')).toBeChecked();
  await expect(right.locator('#friends-teams-whose')).toHaveText('Player 1 chose.');
  await page.screenshot({ path: 'test-results/screens/together-title.png' });
  expect(sockets).toEqual([]);
  // A seat's name is its player's number, and isn't kept as the name for playing with friends.
  expect(await left.evaluate(() => localStorage.getItem('camera-games-race-name'))).toBe(null);
});

test('each seat has its own half of the camera\'s picture: a hand on the left is the left seat\'s, and nobody\'s on the right', async ({ page }) => {
  test.setTimeout(240_000);
  const [left, right] = await openTogether(page, 'high-five-racers');
  const handAt = async (x) => {
    for (const seat of [left, right]) await seat.evaluate((across) => window.__camera.showHands([{ name: 'open', side: 'right', x: across, y: 0.5, scale: 0.75 }], { sameHand: true }), x);
  };
  // One open hand, in the left half of the picture as the players see it.
  await handAt(0.25);
  await left.locator('#start').click();
  await right.locator('#start').click();
  // Each seat's camera is half as wide as the real one, and as tall: its mirror shows its own half, the left
  // seat's the right of the camera's own picture, as a mirror does.
  await expect.poll(async () => (await seatState(left)).picture, { timeout: 60_000 }).toEqual({ aspect: 0.889, slides: '100% 50%' });
  await expect.poll(async () => (await seatState(right)).picture, { timeout: 60_000 }).toEqual({ aspect: 0.889, slides: '0% 50%' });
  // The left seat's check sees an open hand and passes, and it waits for the other. The right seat sees none.
  await waitForScreen(left, 'waiting');
  expect(await screenOf(right)).toBe('check');
  expect(await handOpen(right)).toBe(false);
  await right.waitForTimeout(3000);
  expect(await screenOf(right)).toBe('check');
  await page.screenshot({ path: 'test-results/screens/together-one-hand.png' });

  // The hand goes to the right half: now it's the right seat's, which passes its check, and the race starts.
  await handAt(0.75);
  await waitForScreen(right, 'playing');
  await waitForScreen(left, 'playing');
  await expect.poll(() => handOpen(right), { timeout: 20_000 }).toBe(true);
  await expect.poll(() => handOpen(left), { timeout: 20_000 }).toBe(false);
});

test('a race for two on one screen: they count down together, each drives their own car and sees the other\'s, and the finish cards place them', async ({ page }) => {
  test.setTimeout(300_000);
  const [left, right] = await openTogether(page, 'high-five-racers', 2, { laps: 1, raceFriends: 'against' });
  await handsForAll([left, right]);
  await left.locator('#start').click();
  await waitForScreen(left, 'waiting');
  await expect(left.locator('#screen-friends h2')).toHaveText('Waiting for the others');
  // Nothing starts until the other is ready too.
  await left.waitForTimeout(1500);
  expect(await screenOf(left)).toBe('waiting');
  await right.locator('#start').click();
  await waitForScreen(left, 'playing');
  await waitForScreen(right, 'playing');

  // Each has their own car, going, and sees the other's where it is.
  await expect.poll(async () => (await raceOf(right)).distance, { timeout: 30_000 }).toBeGreaterThan(60);
  const [mine, theirs] = await Promise.all([raceOf(left), raceOf(right)]);
  expect(mine.laps).toBe(1);
  expect(mine.friends.map(({ name }) => name)).toEqual(['Player 2']);
  expect(theirs.friends.map(({ name }) => name)).toEqual(['Player 1']);
  expect(mine.friends[0].distance).toBeGreaterThan(40);
  expect(Math.abs(mine.friends[0].distance - theirs.distance)).toBeLessThan(15);
  await page.screenshot({ path: 'test-results/screens/together-racing.png' });

  // The left seat crosses the line first, and the right after.
  await left.evaluate(() => {
    const { race } = window.__game;
    race.distance = race.raceDistance - 8;
  });
  await right.evaluate(() => {
    const { race } = window.__game;
    race.distance = race.raceDistance - 70;
  });
  await waitForScreen(left, 'finish');
  await waitForScreen(right, 'finish');
  await expect(left.locator('#screen-finish h2')).toHaveText('You won the race!');
  await expect(right.locator('#screen-finish h2')).toHaveText('Great racing!');
  await expect(left.locator('.friends-results li .friends-who')).toHaveText(['You', 'Player 2']);
  await expect(right.locator('.friends-results li .friends-who')).toHaveText(['Player 1', 'You']);
  await page.screenshot({ path: 'test-results/screens/together-finish.png' });

  // The level moves on for both, as it does for one child, and the next race is on it.
  for (const seat of [left, right]) {
    await expect(seat.locator('#level-done-text')).toBeVisible();
    await expect(seat.locator('#level-done-text')).toHaveText('Level 1 done! Next: level 2');
    await expect(seat.locator('#play-again')).toHaveText('Next level');
  }
  for (const seat of [left, right]) await seat.locator('#play-again').click();
  await waitForScreen(left, 'playing');
  await waitForScreen(right, 'playing');
  for (const seat of [left, right]) expect(await seat.evaluate(() => window.__game.race.level)).toBe(2);
  // Both finish again, and the cards say level 2 is done.
  for (const seat of [left, right]) {
    await seat.evaluate(() => {
      const { race } = window.__game;
      race.distance = race.raceDistance - 8;
    });
  }
  await waitForScreen(left, 'finish');
  await waitForScreen(right, 'finish');
  for (const seat of [left, right]) await expect(seat.locator('#level-done-text')).toHaveText('Level 2 done! Next: level 3');

  // All games, in one seat, takes the whole page there, not just that seat.
  await left.locator('#screen-finish a.all-games, #screen-finish a[href$="index.html"]').first().click();
  await expect(page).toHaveURL(/\/index\.html$/);
  await expect(page.locator('iframe.seat')).toHaveCount(0);
});

test('the second player\'s settings are their own: the hand they play with can be the other one, and the child\'s stay as they were', async ({ page }) => {
  test.setTimeout(240_000);
  let [left, right] = await openTogether(page, 'high-five-racers', 2, { hands: 'right' });
  const sideOf = (seat) => seat.evaluate(() => window.__game.monitor.side);
  expect([await sideOf(left), await sideOf(right)]).toEqual(['right', 'right']);
  // In the right seat's panel, the left hand is chosen.
  await right.locator('#open-panel').click();
  await right.locator('input[name="hands"][value="left"]').check();
  await right.locator('#close-panel').click();
  expect(await sideOf(right)).toBe('left');
  const saved = () => page.evaluate(() => [localStorage.getItem('camera-games-settings'), localStorage.getItem('camera-games-settings:player-2')].map((text) => JSON.parse(text ?? 'null')?.hands ?? null));
  expect(await saved()).toEqual(['right', 'left']);
  // The next time, each has their own again.
  await page.reload();
  [left, right] = await seatsOf(page, 2);
  for (const seat of [left, right]) await expect(seat.locator('#friends-here li')).toHaveCount(2, { timeout: 90_000 });
  expect([await sideOf(left), await sideOf(right)]).toEqual(['right', 'left']);
  // And the child playing on their own has theirs.
  await page.goto('/games/high-five-racers/index.html?debug');
  await expect(page.locator('#start')).toBeVisible();
  expect(await page.evaluate(() => window.__game.monitor.side)).toBe('right');
});

test('in a whole-body game on a split screen too, a game played to its end moves the level on for both', async ({ page }) => {
  test.setTimeout(300_000);
  const seats = await openTogether(page, 'mighty-lift', 2, { liftClock: 'no' });
  // A filmed person in each half of the camera's picture, arms down.
  for (const seat of seats) await seat.evaluate(() => window.__camera.showPeople([{ name: 'lifts', from: 0.6, playing: false }, { name: 'lifts', from: 0.6, playing: false }]));
  for (const seat of seats) await seat.locator('#start').click();
  for (const seat of seats) await waitForScreen(seat, 'choose');
  for (const seat of seats) await seat.locator('#lift-start').click();
  for (const seat of seats) await waitForScreen(seat, 'warmup', 90_000);
  for (const seat of seats) await seat.locator('#warm-skip').click();
  for (const seat of seats) await waitForScreen(seat, 'playing', 90_000);
  for (const seat of seats) await seat.evaluate(() => window.__game.lifting.finish());
  for (const seat of seats) {
    await waitForScreen(seat, 'finish');
    await expect(seat.locator('#level-done-text')).toHaveText('Level 1 done! Next: level 2');
    expect(await seat.evaluate(() => window.__game.game.levels.current)).toBe(2);
  }
});

test('only one seat speaks at a time, so their voices never talk over each other', async ({ page }) => {
  test.setTimeout(240_000);
  const [left, right] = await openTogether(page, 'high-five-racers', 2, { voice: true, sound: true });
  await handsForAll([left, right], 'fist');
  await left.locator('#start').click();
  await right.locator('#start').click();
  await waitForScreen(left, 'check');
  await waitForScreen(right, 'check');
  // Both checks ask for an open hand, in the same words at the same moment. Whenever one is speaking, the other isn't.
  const speaking = (seat) => seat.evaluate(() => Boolean(window.__game.sound.currentVoice));
  let [heard, together] = [0, 0];
  for (let look = 0; look < 80; look += 1) {
    const [one, two] = await Promise.all([speaking(left), speaking(right)]);
    if (one || two) heard += 1;
    if (one && two) together += 1;
    await page.waitForTimeout(100);
  }
  expect(heard).toBeGreaterThan(5);
  expect(together).toBe(0);
});

test('however many are asked for, two play: the screen is split in two', async ({ page }) => {
  for (const players of ['4', '1', '0', 'lots', '']) {
    await page.goto(`/together.html?game=tank-patrol&players=${players}&debug`);
    await expect(page.locator('iframe.seat')).toHaveCount(2);
  }
});

test('an address for something that isn\'t a game shows nothing from anywhere else, and the way back to the games', async ({ page }) => {
  for (const game of ['', '../core', 'https://example.com/x', 'Racers!']) {
    await page.goto(`/together.html?game=${encodeURIComponent(game)}&players=2`);
    await expect(page.locator('#no-game')).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(page.locator('#no-game a')).toHaveAttribute('href', 'index.html');
  }
});
