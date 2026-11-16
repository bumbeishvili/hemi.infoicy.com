// Balloon Pop with several playing in front of one camera: a grown-up says how many on the title card, each has
// a glove of their own, and everyone pops into the one count. In place of the webcam there are photos of several
// people's hands, read by the real tracker: see showHands in test/e2e/fake-camera.js.
import { expect, openGame, shot, test, waitForScreen } from './helpers.js';

const GAME = 'balloon-pop';

/** A right hand, as everyone plays with while the right hand is in play: so far across the screen. */
const hand = (name, x, extra = {}) => ({ name, side: 'right', x, y: 0.5, scale: 0.75, ...extra });
const showHands = (page, hands) => page.evaluate((list) => window.__camera.showHands(list, { sameHand: true }), hands);
const choose = (page, count) => page.locator(`input[name="group-size"][value="${count}"]`).check({ force: true });

/** What the game makes of whose hands are there. */
const group = (page) => page.evaluate(() => {
  const { session, monitor, balloons } = window.__game;
  const across = (glove) => (glove.visible ? Math.round((glove.x / balloons.width) * 100) / 100 : null);
  return {
    players: session.players,
    looksFor: session.camera.people,
    handVisible: monitor.snapshot.handVisible,
    handOpen: monitor.snapshot.handOpen,
    guests: monitor.snapshot.guests.map(({ status }) => status),
    play: across(balloons.gloves[monitor.side]),
    others: balloons.guests.map(across),
    popped: balloons.total,
  };
});

/** Puts a balloon that doesn't move right on a glove: the hand in play's, or a guest's by its number. */
const balloonOn = (page, guest = null) => page.evaluate((which) => {
  const { balloons, monitor } = window.__game;
  const glove = which === null ? balloons.gloves[monitor.side] : balloons.guests[which];
  return balloons.spawnAt(glove.x, glove.y, { still: true }).id;
}, guest);
const there = (page, id) => page.evaluate((balloon) => window.__game.balloons.balloons.some((each) => each.id === balloon), id);

/** From the title card to play with so many chosen: the first hand passes the check alone, and then the rest come. */
async function play(page, count, hands) {
  await openGame(page, {}, GAME);
  if (count > 1) await choose(page, count);
  await showHands(page, hands.slice(0, 1));
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
  await showHands(page, hands);
}

test('the title card asks how many are playing: one as the game comes, and the tracker looks for as many people\'s hands as are chosen', async ({ page }) => {
  await openGame(page, {}, GAME);
  await expect(page.locator('#start')).toBeEnabled({ timeout: 60_000 });
  await expect(page.locator('.title-card .group-choice legend')).toHaveText('How many are playing?');
  await expect(page.locator('input[name="group-size"]')).toHaveCount(4);
  await expect(page.locator('input[name="group-size"][value="1"]')).toBeChecked();
  await expect(page.locator('body')).toHaveAttribute('data-players', '1');
  expect(await group(page)).toMatchObject({ players: 1, looksFor: 1, guests: [] });

  await choose(page, 3);
  expect(await group(page)).toMatchObject({ players: 3, looksFor: 3, guests: ['missing', 'missing'] });
  await expect(page.locator('body')).toHaveAttribute('data-players', '3');
  await shot(page, 'pop-group-title');
  await choose(page, 1);
  expect(await group(page)).toMatchObject({ players: 1, looksFor: 1, guests: [] });
});

test('a number chosen while the game is still getting ready is the number that plays', async ({ page }) => {
  // The page is held before its game is made, the row is already on the card, and someone presses 2.
  await page.route('**/core/audio/voice/lines.json', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await openGame(page, {}, GAME);
  expect(await page.evaluate(() => Boolean(window.__game))).toBe(false);
  await choose(page, 2);
  await expect(page.locator('#start')).toBeEnabled({ timeout: 60_000 });
  await expect(page.locator('input[name="group-size"][value="2"]')).toBeChecked();
  expect(await group(page)).toMatchObject({ players: 2, looksFor: 2 });
});

test('with two playing, each hand has a glove of its own and each pops, and a closed one only bumps', async ({ page }) => {
  test.setTimeout(180_000);
  await play(page, 2, [hand('open', 0.75), hand('open', 0.25)]);
  await expect.poll(async () => (await group(page)).guests, { timeout: 20_000 }).toEqual(['open']);
  let now = await group(page);
  // The first hand to come is on the right of the screen, and the one that joined on the left.
  expect(now.handOpen).toBe(true);
  expect(now.play).toBeGreaterThan(0.6);
  expect(now.others).toHaveLength(1);
  expect(now.others[0]).toBeLessThan(0.4);
  await shot(page, 'pop-group-two');

  // A balloon on the second hand's glove pops, and so does one on the first's: all into the one count.
  const before = now.popped;
  const onGuest = await balloonOn(page, 0);
  await expect.poll(() => there(page, onGuest), { timeout: 5000 }).toBe(false);
  const onPlay = await balloonOn(page);
  await expect.poll(() => there(page, onPlay), { timeout: 5000 }).toBe(false);
  expect((await group(page)).popped).toBeGreaterThanOrEqual(before + 2);

  // The second hand closes. A balloon on it stays, and is only knocked aside.
  await showHands(page, [hand('open', 0.75), hand('fist', 0.25)]);
  await expect.poll(async () => (await group(page)).guests, { timeout: 20_000 }).toEqual(['closed']);
  const bumped = await balloonOn(page, 0);
  await page.waitForTimeout(1500);
  expect(await there(page, bumped)).toBe(true);
  expect(await page.evaluate((id) => window.__game.balloons.balloons.find((each) => each.id === id).bumpedAt > 0, bumped)).toBe(true);
  now = await group(page);
  expect(now.handOpen).toBe(true);
  // It opens again, and pops it.
  await showHands(page, [hand('open', 0.75), hand('open', 0.25)]);
  await expect.poll(() => there(page, bumped), { timeout: 20_000 }).toBe(false);
});

test('when the first hand goes, the other is the hand in play, and the game only asks for a hand when there are none', async ({ page }) => {
  test.setTimeout(180_000);
  await play(page, 2, [hand('open', 0.75), hand('open', 0.25)]);
  await expect.poll(async () => (await group(page)).guests, { timeout: 20_000 }).toEqual(['open']);
  // What the top of the screen says from now on.
  await page.evaluate(() => {
    window.__said = [];
    const text = document.getElementById('prompt-text');
    new MutationObserver(() => window.__said.push(text.textContent)).observe(text, { childList: true, characterData: true, subtree: true });
  });
  // The first hand goes. The one that's left is the hand in play: its glove is where the guest's was.
  await showHands(page, [hand('open', 0.25)]);
  await expect.poll(async () => (await group(page)).play, { timeout: 20_000 }).toBeLessThan(0.4);
  await page.waitForTimeout(3000);
  let now = await group(page);
  expect(now).toMatchObject({ handVisible: true, handOpen: true, guests: ['missing'], others: [null] });
  expect(await page.evaluate(() => window.__said.filter((words) => /Show|closer/i.test(words)))).toEqual([]);
  // And it pops.
  const balloon = await balloonOn(page);
  await expect.poll(() => there(page, balloon), { timeout: 5000 }).toBe(false);

  // With no hands at all, it asks for one, as ever.
  await showHands(page, []);
  await expect(page.locator('#prompt-text')).toHaveText('Show your right hand!', { timeout: 20_000 });
  now = await group(page);
  expect(now).toMatchObject({ handVisible: false, play: null, others: [null] });
});

test('as the game comes, one plays: a second right hand in the picture has no glove and pops nothing', async ({ page }) => {
  test.setTimeout(180_000);
  await play(page, 1, [hand('open', 0.75), hand('open', 0.25)]);
  await expect.poll(async () => (await group(page)).play, { timeout: 20_000 }).toBeGreaterThan(0.6);
  const now = await group(page);
  expect(now).toMatchObject({ players: 1, looksFor: 1, guests: [], others: [] });
  // The tracker is only asked for one person's hands, so that's all it reports.
  const found = await page.evaluate(() => new Promise((resolve) => {
    const { camera } = window.__game;
    const result = camera.onResult;
    camera.onResult = (data) => {
      camera.onResult = result;
      result(data);
      resolve(data.hands.length);
    };
  }));
  expect(found).toBeLessThanOrEqual(2);
  // A balloon where the other hand is stays there.
  const id = await page.evaluate(() => {
    const { balloons } = window.__game;
    return balloons.spawnAt(balloons.width * 0.19, balloons.height * 0.52, { still: true }).id;
  });
  await page.waitForTimeout(2000);
  expect(await there(page, id)).toBe(true);
});

test('everyone plays with the same hand: with right hands in play, a left hand has no glove', async ({ page }) => {
  test.setTimeout(180_000);
  await play(page, 2, [hand('open', 0.75), hand('open', 0.25, { side: 'left' })]);
  await expect.poll(async () => (await group(page)).play, { timeout: 20_000 }).toBeGreaterThan(0.6);
  await page.waitForTimeout(2500);
  expect(await group(page)).toMatchObject({ guests: ['missing'], others: [null] });
  // A right hand in its place has one.
  await showHands(page, [hand('open', 0.75), hand('open', 0.25)]);
  await expect.poll(async () => (await group(page)).guests, { timeout: 20_000 }).toEqual(['open']);
});

test('four play, each with a glove, and each pops', async ({ page }) => {
  test.setTimeout(240_000);
  const xs = [0.875, 0.625, 0.375, 0.125];
  await play(page, 4, xs.map((x) => hand('open', x, { scale: 0.8 })));
  await expect.poll(async () => (await group(page)).guests, { timeout: 30_000 }).toEqual(['open', 'open', 'open']);
  const now = await group(page);
  expect(now).toMatchObject({ players: 4, looksFor: 4, handOpen: true });
  // Four gloves, each somewhere of its own across the screen.
  const places = [now.play, ...now.others].sort((a, b) => a - b);
  for (let index = 1; index < places.length; index += 1) expect(places[index] - places[index - 1]).toBeGreaterThan(0.15);
  await shot(page, 'pop-group-four');
  for (const guest of [0, 1, 2, null]) {
    const id = await balloonOn(page, guest);
    await expect.poll(() => there(page, id), { timeout: 5000 }).toBe(false);
  }
});

test('the number can change once the tracker is loaded and looking: it goes on to look for that many people\'s hands', async ({ page }) => {
  test.setTimeout(240_000);
  // A game for one is being played, and the tracker is looking for one child's two hands.
  const xs = [0.875, 0.625, 0.375, 0.125];
  const four = xs.map((x) => hand('open', x, { scale: 0.8 }));
  await play(page, 1, four);
  await expect.poll(async () => (await group(page)).handOpen, { timeout: 20_000 }).toBe(true);
  expect(await group(page)).toMatchObject({ players: 1, looksFor: 1, guests: [] });
  // Four are playing now, as a game that asks between rounds would say.
  await page.evaluate(() => window.__game.session.setPlayers(4));
  await expect.poll(async () => (await group(page)).guests, { timeout: 30_000 }).toEqual(['open', 'open', 'open']);
  expect(await group(page)).toMatchObject({ players: 4, looksFor: 4 });
  await expect(page.locator('input[name="group-size"][value="4"]')).toBeChecked();
  // And back to one: the others have no gloves, and the tracker reports no more than one child's two hands.
  await page.evaluate(() => window.__game.session.setPlayers(1));
  expect(await group(page)).toMatchObject({ players: 1, looksFor: 1, guests: [] });
  // Their gloves go with the next picture drawn.
  await expect.poll(async () => (await group(page)).others).toEqual([]);
  await page.waitForTimeout(1500);
  const found = await page.evaluate(() => new Promise((resolve) => {
    const { camera } = window.__game;
    const result = camera.onResult;
    camera.onResult = (data) => {
      camera.onResult = result;
      result(data);
      resolve(data.hands.length);
    };
  }));
  expect(found).toBeLessThanOrEqual(2);
});

test('with friends on their own computers, one plays at each: making a game puts it back to one', async ({ page }) => {
  await openGame(page, {}, GAME);
  await expect(page.locator('#start')).toBeEnabled({ timeout: 60_000 });
  await choose(page, 2);
  expect(await group(page)).toMatchObject({ players: 2, looksFor: 2 });
  await page.locator('#friends-toggle').click();
  // The friends box is all the card shows while it's open.
  await expect(page.locator('.group-choice')).toBeHidden();
  await page.locator('#friends-make').click();
  await expect(page.locator('#friends-code-shown')).toHaveText(/^[A-HJ-NP-Z2-9]{3}$/);
  await expect.poll(async () => (await group(page)).players).toBe(1);
  expect(await group(page)).toMatchObject({ looksFor: 1, guests: [] });
  await expect(page.locator('input[name="group-size"][value="1"]')).toBeChecked();
  await expect(page.locator('body')).toHaveAttribute('data-players', '1');
});
