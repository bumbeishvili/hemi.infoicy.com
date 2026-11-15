// Gobble and Grow, played in the real page: the mouth check, gobbling with a wide open mouth and munching as it
// shuts, what never counts, resting, the grown-ups' choices, and a whole world won, with the pull back to the next.
// The camera is a drawing of a face and the tracker a stand-in that reports it, as there are no photos of faces to
// show the real one: see ../fake-face.js. The real tracker is in tracker.spec.js.
import { atLevel, emptySoup, expect, expectSoon, face, openGobble, passCheck, playChild, putFood, SHUT, shot, startPlaying, state, stopChild, test, waitForScreen, WIDE } from './helpers.js';

test('the title card says what to do, and the check asks for a face and then for a wide open mouth', async ({ page }) => {
  await openGobble(page);
  await expect(page.locator('h1')).toHaveText('Gobble and Grow');
  await expect(page.locator('#tagline')).toContainText('Open your mouth wide');
  await expect(page.locator('#level-badge')).toHaveText('Level 1 of 10');
  await shot(page, 'gobble-title');

  // Nobody in the picture yet.
  await page.evaluate(() => window.__face.showNobody());
  await page.locator('#start').click();
  await waitForScreen(page, 'check');
  await expect(page.locator('#prompt-text')).toHaveText('Show me your face!');
  await expect(page.locator('.face-guide')).toBeVisible();
  // A little film shows the move: a mouth opening wide and shutting.
  await expect(page.locator('.mouth-demo')).toBeVisible();
  expect(await page.locator('.mouth-demo-mouth').evaluate((node) => getComputedStyle(node).animationName)).toBe('mouth-opens');
  expect(await page.evaluate(() => window.__game.session.mouthCheck.progress)).toBe(0);

  // A face, with its mouth shut: now it asks for the mouth, and waits.
  await face(page, { seen: true, open: SHUT });
  await expect(page.locator('#prompt-text')).toHaveText('Open your mouth as wide as you can!');
  await expect(page.locator('.face-guide')).toBeHidden();
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__game.screen)).toBe('check');
  expect(await page.evaluate(() => window.__game.session.mouthCheck.progress)).toBe(0);
  await expect(page.locator('#mouth-meter .meter-word')).toHaveText('Open wide');
  await shot(page, 'gobble-check-shut');

  // Open wide: the mirror's frame and the lips go green, the bar fills, and the countdown begins.
  await face(page, { open: 0.3 });
  await expect(page.locator('#mouth-meter .meter-word')).toHaveText('Open');
  await expect(page.locator('#camera-frame')).toHaveAttribute('data-ready', 'open');
  await shot(page, 'gobble-check-open');
  await waitForScreen(page, 'countdown');
  // The line is the child's own: 60% of the way from where the mouth rests to its widest.
  const { mouth } = await state(page);
  expect(mouth.checked).toBe(true);
  expect(mouth.best).toBeGreaterThan(0.27);
  expect(mouth.best).toBeLessThan(0.31);
  expect(mouth.line).toBeGreaterThan(0.16);
  expect(mouth.line).toBeLessThan(0.2);
  await face(page, { open: SHUT });
  await waitForScreen(page, 'playing');
  await expect(page.locator('#chip-bites')).toHaveText('0 of 12');
  await expect(page.locator('#chip-you')).toContainText('a bacterium');
});

test('a mouth that doesn\'t open in the check is asked once more, and then the game goes on anyway', async ({ page }) => {
  test.setTimeout(120_000);
  await openGobble(page);
  await face(page, { open: SHUT });
  await page.locator('#start').click();
  await waitForScreen(page, 'check');
  await expect(page.locator('#prompt-text')).toHaveText('One more try. Open your mouth as wide as you can!', { timeout: 20_000 });
  expect(await page.evaluate(() => window.__game.screen)).toBe('check');
  await waitForScreen(page, 'countdown');
  await waitForScreen(page, 'playing');
  // The line is where any mouth's is, and a shut mouth still doesn't count.
  const { mouth } = await state(page);
  expect(mouth.line).toBeGreaterThanOrEqual(0.12);
  expect(mouth.open).toBe(false);
});

test('opening wide with something in reach gobbles it, and it counts when the mouth shuts', async ({ page }) => {
  await startPlaying(page);
  await emptySoup(page);
  const id = await putFood(page);
  await expectSoon(async () => (await state(page)).target).toBe(id);
  const before = await state(page);
  expect(before.eaten).toBe(0);

  await face(page, { open: WIDE });
  await expectSoon(async () => (await state(page)).creature.holding).toBe(id);
  // In the mouth, which is wide open, but not eaten until it shuts.
  await page.waitForTimeout(500);
  const held = await state(page);
  expect(held.eaten).toBe(0);
  expect(held.shownMouth).toBeGreaterThan(0.5);
  await expect(page.locator('#chip-bites')).toHaveText('0 of 12');
  await shot(page, 'gobble-in-the-mouth');

  await face(page, { open: SHUT });
  await expectSoon(async () => (await state(page)).eaten).toBe(1);
  const after = await state(page);
  expect(after.creature.holding).toBeNull();
  expect(after.creature.r).toBeGreaterThan(before.creature.r);
  expect(after.stats.autoChomps).toBe(0);
  await expect(page.locator('#chip-bites')).toHaveText('1 of 12');
  await expectSoon(async () => (await state(page)).shownMouth).toBeLessThan(0.1);
});

test('a shut mouth never eats, nor one that\'s only a little open, and after a while it\'s asked to open wide', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page);
  await emptySoup(page);
  await putFood(page);
  await expectSoon(async () => (await state(page)).target).not.toBeNull();
  // Shut, with something waiting in front of it: after a few seconds it's asked to open wide. It's looked for
  // as soon as it comes, as a mouth that goes on doing nothing is told later that resting is fine instead.
  await face(page, { open: SHUT });
  await expect(page.locator('#prompt-text')).toHaveText('Open wide to gobble it up!', { timeout: 12_000 });
  await shot(page, 'gobble-open-wide-prompt');
  // Shut, and then lips a little apart, as for talking, and then half way to the line.
  for (const open of [SHUT, 0.07, 0.15]) {
    await face(page, { open });
    await page.waitForTimeout(1800);
    const now = await state(page);
    expect(now.mouth.open).toBe(false);
    expect(now.eaten).toBe(0);
    expect(now.creature.holding).toBeNull();
  }
  // The creature's mouth opens a little with the child's, so they can see it's on its way.
  expect((await state(page)).shownMouth).toBeGreaterThan(0.05);
  expect((await state(page)).shownMouth).toBeLessThan(0.35);
  // Wide enough: in it goes.
  await face(page, { open: 0.3 });
  await expectSoon(async () => (await state(page)).stats.gulps).toBe(1);
});

test('a mouth held open takes one bite, is asked to shut, swallows after a while anyway, and takes no more until it has shut', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page);
  await emptySoup(page);
  for (const dy of [-0.4, 0, 0.4]) await putFood(page, 0, { dx: 0.6, dy });
  await face(page, { open: WIDE });
  await expectSoon(async () => (await state(page)).stats.gulps).toBe(1);
  await expect(page.locator('#prompt-text')).toHaveText('Close your mouth to munch!');
  await shot(page, 'gobble-shut-to-munch');
  await expectSoon(async () => (await state(page)).eaten, { timeout: 15_000 }).toBe(1);
  expect((await state(page)).stats.autoChomps).toBe(1);
  // Still open, with two more things right there: neither goes in.
  await page.waitForTimeout(2500);
  const still = await state(page);
  expect(still.stats.gulps).toBe(1);
  expect(still.foods.length).toBe(2);
  // It shuts, and once the game has seen it shut, opens again: the next one.
  await face(page, { open: SHUT });
  await expectSoon(async () => (await state(page)).mouth.open).toBe(false);
  await page.waitForTimeout(300);
  await face(page, { open: WIDE });
  await expectSoon(async () => (await state(page)).stats.gulps).toBe(2);
});

test('a face that\'s turned away, too far off, half out of the picture or gone never eats, however wide its mouth, and says why', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page);
  await emptySoup(page);
  await putFood(page);
  await expectSoon(async () => (await state(page)).target).not.toBeNull();
  const cases = [
    [{ yaw: 60 }, 'turned', 'Look at the screen!', 'Look here'],
    [{ size: 0.05 }, 'small', 'Come a little closer', 'Too far away'],
    [{ y: 0.86 }, 'edge', 'Show me your face!', 'Too far out'],
    [{ seen: false }, 'missing', 'Show me your face!', 'Can’t see'],
  ];
  for (const [change, reason, prompt, word] of cases) {
    await test.step(reason, async () => {
      await face(page, { ...change, open: WIDE });
      await expectSoon(async () => (await state(page)).mouth.reason).toBe(reason);
      await expect(page.locator('#prompt-text')).toHaveText(prompt);
      await expect(page.locator('#mouth-meter .meter-word')).toHaveText(word);
      await page.waitForTimeout(1200);
      const now = await state(page);
      expect(now.mouth.open).toBe(false);
      expect(now.stats.gulps).toBe(0);
      expect(now.shownMouth).toBeLessThan(0.35);
      if (reason === 'turned') await shot(page, 'gobble-turned-away');
      // Back as it should be, with the mouth shut, nothing has been eaten.
      await face(page, { seen: true, yaw: 0, size: 0.2, y: 0.42, open: SHUT });
      await expectSoon(async () => (await state(page)).mouth.reason).toBe('closed');
    });
  }
  expect((await state(page)).eaten).toBe(0);
  // And straight on, in view, it eats.
  await face(page, { open: WIDE });
  await expectSoon(async () => (await state(page)).stats.gulps).toBe(1);
});

test('a tracker that stops answering looks like nobody there, not a mouth stuck open', async ({ page }) => {
  await startPlaying(page);
  await emptySoup(page);
  await face(page, { open: WIDE });
  await expectSoon(async () => (await state(page)).mouth.open).toBe(true);
  await face(page, { stalled: true });
  await expectSoon(async () => (await state(page)).mouth.status, { timeout: 15_000 }).toBe('missing');
  await putFood(page);
  await page.waitForTimeout(1500);
  const now = await state(page);
  expect(now.mouth.open).toBe(false);
  expect(now.stats.gulps).toBe(0);
  await expect(page.locator('#prompt-text')).toHaveText('Show me your face!');
});

test('the creature goes where the face goes, like a mirror, and a small move of the head goes a long way', async ({ page }) => {
  await startPlaying(page);
  await emptySoup(page);
  const middle = (await state(page)).creature;
  // The face goes a little to the left of the mirror, and up: so does the creature, much further.
  await face(page, { x: 0.45, y: 0.385 });
  await expectSoon(async () => (await state(page)).creature.x).toBeLessThan(middle.x - 0.35);
  const left = (await state(page)).creature;
  expect(left.y).toBeLessThan(middle.y - 0.15);
  expect(left.facing).toBe(-1);
  await face(page, { x: 0.55, y: 0.455 });
  await expectSoon(async () => (await state(page)).creature.x).toBeGreaterThan(middle.x + 0.35);
  expect((await state(page)).creature.y).toBeGreaterThan(middle.y + 0.15);
  await shot(page, 'gobble-steered-right');
  // Right off to one side, it stops at the edge of the field.
  await face(page, { x: 0.8, y: 0.42 });
  await page.waitForTimeout(1500);
  const edge = (await state(page)).creature;
  expect(edge.x).toBeLessThan(16 / 9);
  expect(edge.x).toBeGreaterThan(1.5);
});

test('a thing that\'s too big can\'t be eaten: it nudges the creature aside, a label says so, and nothing is lost', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page);
  await emptySoup(page);
  const start = (await state(page)).creature;
  await putFood(page, 2, { dx: 1.2, dy: 0.1 });
  await expectSoon(async () => (await state(page)).stats.bumps).toBeGreaterThanOrEqual(1);
  await expectSoon(async () => (await state(page)).labels).toContain('Too big for now!');
  await shot(page, 'gobble-too-big');
  // Opening on it does nothing but say so again.
  await face(page, { open: WIDE });
  await page.waitForTimeout(1000);
  await face(page, { open: SHUT });
  const now = await state(page);
  expect(now.stats.gulps).toBe(0);
  expect(now.eaten).toBe(0);
  expect(now.foods.length).toBe(1);
  // Pushed out of its way, gently.
  expect(Math.hypot(now.creature.x - start.x, now.creature.y - start.y)).toBeGreaterThan(0.02);
  expect(Math.hypot(now.creature.x - start.x, now.creature.y - start.y)).toBeLessThan(0.25);
});

test('with the mouth alone, the creature swims to the food by itself, and opening and shutting is all there is to do', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, { gobbleMove: 'mouth', gobbleBites: 8 });
  expect((await state(page)).auto).toBe(true);
  // The face stays just where it is.
  await playChild(page, { steer: false });
  await expectSoon(async () => (await state(page)).eaten, { timeout: 60_000 }).toBeGreaterThanOrEqual(3);
  await shot(page, 'gobble-mouth-only');
  await expectSoon(async () => (await state(page)).won, { timeout: 150_000 }).toBe(true);
  await stopChild(page);
  expect(await page.evaluate(() => window.__child.x)).toBeCloseTo(0.5, 2);
});

test('a whole world, eaten: the view pulls back to the next, the card shows how much the child grew, and the level moves on', async ({ page }) => {
  test.setTimeout(300_000);
  await startPlaying(page, { gobbleBites: 8 });
  await expect(page.locator('body')).toHaveAttribute('data-film', 'on');
  await playChild(page);
  // The first three things are named, one after another, and the film goes once the child has the idea.
  await expectSoon(async () => (await state(page)).eaten, { timeout: 60_000 }).toBeGreaterThanOrEqual(1);
  await expect(page.locator('body')).toHaveAttribute('data-film', 'off');
  await expectSoon(async () => (await state(page)).named).toEqual(expect.arrayContaining(['food-0', 'food-1', 'food-2']));
  await expectSoon(async () => (await state(page)).eaten, { timeout: 90_000 }).toBeGreaterThanOrEqual(5);
  await shot(page, 'gobble-growing');
  await expectSoon(async () => (await state(page)).won, { timeout: 150_000 }).toBe(true);
  await stopChild(page);
  const won = await state(page);
  expect(won.eaten).toBe(8);
  // The bigger kinds came into reach on the way, and one of them was pointed out as it did. Which of them was
  // in view to be pointed at is the soup's chance, so it isn't asked that it was the middle kind.
  expect(won.named.filter((key) => key.startsWith('can-eat-')).length).toBeGreaterThanOrEqual(1);

  // The pull back, with the game still on the playing screen and nothing more to do.
  await expectSoon(async () => (await state(page)).pulling).toBe(true);
  await page.waitForTimeout(2600);
  await shot(page, 'gobble-pull-back');
  await waitForScreen(page, 'finish');
  await expect(page.locator('#screen-finish h2')).toHaveText('You grew!');
  await expect(page.locator('#finish-hero')).toHaveText('8');
  await expect(page.locator('#level-done-text')).toHaveText('Level 1 done! Next: level 2');
  await expect(page.locator('#level-next-new')).toHaveText('Coming up:🦐A water flea in a drop of water');
  // The picture of how much they grew is on the card, and has been drawn.
  const ladder = page.locator('#finish-ladder');
  await expect(ladder).toBeVisible();
  await expectSoon(() => ladder.evaluate((canvas) => {
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const colours = new Set();
    for (let index = 0; index < data.length; index += 4 * 97) colours.add(`${data[index] >> 4},${data[index + 1] >> 4},${data[index + 2] >> 4}`);
    return colours.size;
  })).toBeGreaterThan(8);
  await page.waitForTimeout(700);
  await shot(page, 'gobble-finish');
  // The camera is off, and nothing about the mouth counts any more.
  expect(await page.evaluate(() => window.__face.activeTracks)).toBe(0);
  expect((await state(page)).mouth.status).toBe('missing');

  // On to the next world: a water flea, in a drop of water.
  await expect(page.locator('#play-again')).toHaveText('Next level');
  await page.locator('#play-again').click();
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-now')).toHaveText('Level 2');
  await expect(page.locator('#level-new-now')).toContainText('A water flea in a drop of water');
  await face(page, { open: SHUT });
  await waitForScreen(page, 'playing');
  const next = await state(page);
  expect(next.level).toBe(2);
  expect(next.world).toBe('flea');
  expect(next.eaten).toBe(0);
  expect(next.pulling).toBe(false);
  await expect(page.locator('#chip-you')).toContainText('a water flea');
  await shot(page, 'gobble-next-world');
});

test('a child whose head is never still, whose mouth trembles and whose face is lost now and then still eats a whole world', async ({ page }) => {
  test.setTimeout(300_000);
  await startPlaying(page, { gobbleBites: 8 });
  await playChild(page, { wobble: 1 });
  await expectSoon(async () => (await state(page)).won, { timeout: 200_000 }).toBe(true);
  await stopChild(page);
  const won = await state(page);
  expect(won.eaten).toBe(8);
  // Every bite was a real opening: none were swallowed for a mouth left open.
  expect(won.stats.autoChomps).toBe(0);
});

test('resting never costs anything: half a minute of doing nothing, and it says resting is fine', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, { gobbleBites: 16 });
  await playChild(page);
  await expectSoon(async () => (await state(page)).eaten, { timeout: 60_000 }).toBeGreaterThanOrEqual(2);
  await stopChild(page);
  await face(page, { open: SHUT });
  await page.waitForTimeout(800);
  const before = await state(page);
  await expect(page.locator('#prompt-text')).toHaveText('Resting is OK. Open your mouth when you’re ready.', { timeout: 40_000 });
  await shot(page, 'gobble-resting');
  const after = await state(page);
  expect(after.eaten).toBe(before.eaten);
  expect(after.creature.r).toBe(before.creature.r);
  expect(after.phase).toBe('play');
  expect(after.foods.length).toBeGreaterThanOrEqual(3);
  // And it carries on as it was.
  await playChild(page);
  await expectSoon(async () => (await state(page)).eaten, { timeout: 60_000 }).toBeGreaterThan(before.eaten);
  await stopChild(page);
});

test('a grown-up can set how wide the mouth has to open, and see it live, with the game paused', async ({ page }) => {
  await startPlaying(page);
  await emptySoup(page);
  // Three quarters of its widest, which is over the line of 60%.
  await face(page, { open: 0.3 });
  await expectSoon(async () => (await state(page)).mouth.open).toBe(true);
  await page.locator('#open-panel').click();
  await expect(page.locator('#panel .panel-state')).toHaveText('✓ Open');
  await expect(page.locator('#panel .live-numbers')).toContainText('needs 60%');
  await shot(page, 'gobble-panel');
  // All of its widest: what was wide enough isn't any more.
  await page.locator('#mouth-strictness').fill('100');
  await expect(page.locator('#panel .strictness output')).toHaveText('100% of its widest');
  await expect(page.locator('#panel .panel-state')).toHaveText('Not open');
  expect(await page.evaluate(() => window.__game.session.settings.mouthStrictness)).toBe(1);
  // And a little of it: it is again, though never lips only just apart.
  await page.locator('#mouth-strictness').fill('30');
  await expect(page.locator('#panel .panel-state')).toHaveText('✓ Open');
  await face(page, { open: 0.07 });
  await expect(page.locator('#panel .panel-state')).toHaveText('Not open');
  // Nothing moves while the panel is open.
  const paused = await state(page);
  await page.waitForTimeout(600);
  expect((await state(page)).playSeconds).toBe(paused.playSeconds);
  await page.locator('#close-panel').click();
  // It's kept for next time.
  await page.reload();
  await expect(page.locator('#start')).toBeVisible();
  expect(await page.evaluate(() => window.__game.session.settings.mouthStrictness)).toBe(0.3);
});

test('a grown-up\'s other choices: how much to eat, how far the head has to move, and checking the mouth again', async ({ page }) => {
  test.setTimeout(120_000);
  await openGobble(page);
  await page.locator('#open-panel').click();
  await expect(page.locator('input[name="gobbleBites"][value="12"]')).toBeChecked();
  await expect(page.locator('input[name="gobbleMove"][value="face"]')).toBeChecked();
  await expect(page.locator('input[name="gobbleHead"][value="medium"]')).toBeChecked();
  await expect(page.locator('input[name="gobbleFriends"][value="together"]')).toBeChecked();
  await page.locator('input[name="gobbleBites"][value="16"]').check();
  await page.locator('input[name="gobbleHead"][value="big"]').check();
  await page.locator('#close-panel').click();
  expect((await state(page)).goal).toBe(16);

  await face(page, { open: SHUT });
  await page.locator('#start').click();
  await passCheck(page);
  await waitForScreen(page, 'playing');
  await expect(page.locator('#chip-bites')).toHaveText('0 of 16');
  await emptySoup(page);
  // The same move of the head as takes the creature most of the way across on medium goes a little way on big.
  const middle = (await state(page)).creature.x;
  await face(page, { x: 0.55 });
  // It's waited for to get there, however long this computer takes, and then to have stopped there.
  await expectSoon(async () => (await state(page)).creature.x - middle, { timeout: 15_000 }).toBeGreaterThan(0.2);
  await page.waitForTimeout(1200);
  const moved = (await state(page)).creature.x - middle;
  expect(moved).toBeGreaterThan(0.2);
  expect(moved).toBeLessThan(0.35);

  // The mouth is checked again in the middle, with a wider mouth this time, and the game carries on.
  await face(page, { x: 0.5 });
  await page.locator('#open-panel').click();
  await page.locator('#recheck').click();
  await passCheck(page, 0.5);
  await waitForScreen(page, 'playing');
  expect((await state(page)).mouth.best).toBeGreaterThan(0.45);
  expect((await state(page)).goal).toBe(16);
});

test('in Georgian, what\'s asked for and the labels are in Georgian', async ({ page }) => {
  await openGobble(page, { language: 'ka' });
  await face(page, { open: SHUT });
  await page.locator('#start').click();
  await waitForScreen(page, 'check');
  await expect(page.locator('#prompt-text')).toHaveText('გააღე პირი, რაც შეგიძლია ფართოდ!');
  await passCheck(page);
  await waitForScreen(page, 'playing');
  await emptySoup(page);
  await putFood(page, 2, { dx: 1.2 });
  await expectSoon(() => page.evaluate(() => window.__game.view.labels.map((label) => label.words[1]))).toContain('ჯერ ძალიან დიდია!');
  await shot(page, 'gobble-georgian');
});

test('with the sound and the voice on, every line and sound it plays is there', async ({ page }) => {
  test.setTimeout(240_000);
  // Any line or sound that's missing is logged as an error, which fails the test.
  await startPlaying(page, { voice: true, sound: true, gobbleBites: 8 });
  expect(await page.evaluate(() => window.__game.sound.voiceClips.size)).toBeGreaterThan(40);
  expect(await page.evaluate(() => ['gulp', 'chomp', 'bump', 'boing', 'sparkle', 'whoosh', 'cheer', 'water', 'garden', 'country', 'wind'].filter((name) => !window.__game.sound.buffers.has(name)))).toEqual([]);
  await playChild(page);
  await expectSoon(async () => (await state(page)).won, { timeout: 150_000 }).toBe(true);
  await stopChild(page);
  await waitForScreen(page, 'finish');
  await page.waitForTimeout(2500);
});

test('the game makes no requests off this computer', async ({ page, baseURL }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await startPlaying(page, { voice: true, sound: true });
  await page.waitForTimeout(500);
  const offsite = requests.filter((url) => !url.startsWith(baseURL) && !url.startsWith('data:') && !url.startsWith('blob:'));
  expect(offsite).toEqual([]);
  // The tracker's model and the voices came from this folder.
  expect(requests.some((url) => url.endsWith('/core/face/voice/en/mouth-wide.ogg'))).toBe(true);
  expect(requests.some((url) => url.endsWith('/games/gobble-grow/audio/voice/en/mission.ogg'))).toBe(true);
});

test('a camera that can\'t be used says so, and the game can be tried again', async ({ page }) => {
  await openGobble(page);
  await page.evaluate(() => {
    window.__face.failWith = 'NotAllowedError';
  });
  await page.locator('#start').click();
  await waitForScreen(page, 'problem');
  await expect(page.locator('#problem-title')).toHaveText('Can we use your camera?');
  await expect(page.locator('#problem-detail')).toContainText('needs to see your face');
  await page.evaluate(() => {
    window.__face.failWith = null;
  });
  await page.locator('#problem-retry').click();
  await waitForScreen(page, 'check');
});

test('at level 4 the world behind the title card is the garden, and choosing another level changes it', async ({ page }) => {
  await openGobble(page, atLevel(4));
  expect((await state(page)).world).toBe('cat');
  await expect(page.locator('#level-new')).toHaveText('New:🐱A cat in a garden');
  await page.locator('#open-panel').click();
  await page.locator('#level-choice label', { hasText: '7' }).click();
  await page.locator('#close-panel').click();
  expect((await state(page)).world).toBe('cloud');
  await expect(page.locator('#level-new')).toHaveText('New:☁️A cloud giant in the sky');
});
