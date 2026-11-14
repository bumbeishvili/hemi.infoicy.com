// Playing Giraffe's Paint Box: the open hand is the brush, paint goes down where it moves and never over the lines,
// dipping it in a pot takes that pot's paint, and every part painted ends the picture. With real photos of hands
// through the real tracker.
import { shot } from '../helpers.js';
import { dipIn, dotOf, expect, expectSoon, FIST, GAME, GENTLE, judge, leadHand, NO_HAND, paintAt, part, potOf, show, startPlaying, state, stopHand, test, waitForScreen, watchBrightness } from './helpers.js';

/** How far the brush is from a place on the sheet, or a long way if it can't be seen. */
const farFrom = async (page, where) => {
  const { at } = await state(page);
  return at ? Math.hypot(at.x - where.x, at.y - where.y) : 999;
};

/**
 * The squares of the sheet where the screen shows paint that the rules say can't be there: paper, or a part that
 * doesn't take this paint and has none, well inside it (its neighbours all the same), so the lines' soft edges
 * don't count. As [x, y] pairs.
 */
const spilt = (page, colour) => page.evaluate((paint) => {
  const { painting, view } = window.__game;
  const pixels = view.paint.getContext('2d').getImageData(0, 0, view.paint.width, view.paint.height);
  const { owner } = painting;
  const found = [];
  for (let y = 1; y < 99; y += 1) {
    for (let x = 1; x < 149; x += 1) {
      const cell = y * 150 + x;
      const here = owner[cell];
      if (painting.paint[cell]) continue;
      if (here >= 0 && painting.parts[here].colour === paint) continue;
      let inside = true;
      for (let j = -1; j <= 1 && inside; j += 1) for (let i = -1; i <= 1; i += 1) if (owner[cell + j * 150 + i] !== here) inside = false;
      if (!inside) continue;
      const px = Math.round((x + 0.5) * view.scale);
      const py = Math.round((y + 0.5) * view.scale);
      if (pixels.data[(py * pixels.width + px) * 4 + 3] > 0) found.push([x, y]);
    }
  }
  return found;
}, colour);

test('the open hand is the brush: paint goes down where it moves and never over the lines, parts fill themselves in, and the last one ends the picture', async ({ page }) => {
  test.setTimeout(300_000);
  // The medium brush, as the places below where paint does and doesn't land were measured for it.
  await startPlaying(page, { paintBrush: 'medium' });
  const start = await state(page);
  expect([start.page, start.level, start.toPaint, start.rule]).toEqual(['giraffe', 1, 9, 'own']);
  expect(start.brush).toMatchObject({ tool: 'paint', colour: 'yellow' });
  expect(start.parts.every((each) => each.covered === 0 || each.kind === 'paper')).toBe(true);
  await expect(page.locator('#story-line')).toHaveText('I’m painting pictures for the party! Can you colour them in?');
  await expect(page.locator('#chip-parts')).toHaveText('0 of 9');
  await expect(page.locator('.paint-film')).toBeVisible();
  await page.waitForTimeout(500);
  await shot(page, 'paint-start');

  // The open hand over Giraffe's head: yellow goes down there, in the rules and on the screen.
  await leadHand(page, { target: { x: 62, y: 40 } });
  await expectSoon(async () => (await part(page, 'head')).covered, { timeout: 30_000 }).toBeGreaterThan(60);
  // Down across the face and over the muzzle, which asks for orange: not a drop lands on it.
  await leadHand(page, { target: { x: 62, y: 74 } });
  await expectSoon(() => farFrom(page, { x: 62, y: 74 }), { timeout: 30_000 }).toBeLessThan(4);
  await page.waitForTimeout(400);
  expect((await part(page, 'muzzle')).covered).toBe(0);
  const [onHead, onMuzzle, onPaper] = [await paintAt(page, 62, 46), await paintAt(page, 62, 70), await paintAt(page, 110, 80)];
  expect(onHead.paint).toBe('yellow');
  expect(onHead.drawn[3]).toBe(255);
  expect(onHead.drawn[0]).toBeGreaterThan(230);
  expect(onHead.drawn[2]).toBeLessThan(110);
  expect([onMuzzle.paint, onMuzzle.drawn[3]]).toEqual([null, 0]);
  // And all over the sheet, what's drawn on the screen is inside the lines too: nothing shows on paper, or on a part
  // that doesn't take yellow, away from the lines themselves.
  expect(await spilt(page, 'yellow')).toEqual([]);
  expect([onPaper.paint, onPaper.drawn[3]]).toEqual([null, 0]);
  await shot(page, 'paint-inside-the-lines');

  // Played on as a child would, to the pot for each paint and over the parts that ask for it, the picture is finished.
  await leadHand(page);
  await expectSoon(async () => (await state(page)).stats.parts, { timeout: 60_000 }).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.paint-film')).toBeHidden();
  await expectSoon(async () => (await state(page)).stats.parts, { timeout: 120_000 }).toBeGreaterThanOrEqual(6);
  await shot(page, 'paint-half-way');
  // Once the last part is in, the picture comes to life for a moment, and then the finish card comes.
  await expectSoon(async () => (await state(page)).alive, { timeout: 120_000 }).toBe(true);
  await page.waitForTimeout(1200);
  await shot(page, 'paint-comes-to-life');
  await waitForScreen(page, 'finish');
  await stopHand(page);
  const end = await state(page);
  expect(end.done).toBe(true);
  expect(end.parts.filter((each) => each.kind !== 'paper').every((each) => each.done && each.covered === each.cells)).toBe(true);
  expect(end.stats.parts).toBe(9);
  expect(end.stats.dips).toBeGreaterThanOrEqual(4);
  expect(end.stats.helped).toBe(0);
  // Every part is in the paint its dot asked for.
  for (const each of end.parts.filter((one) => one.kind === 'part')) expect((await paintAt(page, each.dot.x, each.dot.y)).paint).toBe(each.colour);
  await expect(page.locator('#screen-finish h2')).toHaveText('What a lovely picture!');
  await expect(page.locator('#finish-hero')).toHaveText('9');
  await expect(page.locator('#sum-right-parts')).toHaveText('9');
  await expect(page.locator('#level-done-text')).toHaveText('Level 1 done! Next: level 2');
  await expect(page.locator('#level-next-new')).toContainText('Rainbow paint');
  await page.waitForTimeout(600);
  await shot(page, 'paint-finish');
});

for (const [name, photo] of [['closed', 'fist'], ['missing', 'none']]) {
  test(`a ${name} hand is the brush lifted: it paints nothing, and the picture waits, for as long as it takes`, async ({ page }) => {
    test.setTimeout(150_000);
    await startPlaying(page);
    // The hand comes out of the hand check open: it closes where it is, before it goes anywhere, as the test is
    // about a hand that's closed. (A slow tracker can see it open for a moment after the photo changes.)
    await show(page, ...FIST);
    await expectSoon(() => page.evaluate(() => window.__game.monitor.snapshot.right.status), { timeout: 30_000 }).toBe('closed');
    const before = (await state(page)).parts.map((each) => each.covered);
    // Over the head, where an open hand would paint.
    await leadHand(page, { target: { x: 62, y: 40 }, photo: 'fist' });
    await expectSoon(() => farFrom(page, { x: 62, y: 40 }), { timeout: 30_000 }).toBeLessThan(5);
    if (photo === 'none') {
      await stopHand(page);
      await show(page, null, null);
    }
    await page.waitForTimeout(3200);
    const resting = await state(page);
    expect(resting.parts.map((each) => each.covered)).toEqual(before);
    expect(resting.brush.down).toBe(false);
    expect(resting.stats.dips).toBe(0);
    if (photo === 'fist') {
      // It asks for the hand to open, and moved all over the picture, closed, it still paints nothing.
      await expect(page.locator('#prompt-text')).toHaveText('Open your hand to paint!');
      await leadHand(page, { target: { x: 110, y: 30 }, photo: 'fist' });
      await expectSoon(() => farFrom(page, { x: 110, y: 30 }), { timeout: 30_000 }).toBeLessThan(6);
      expect((await state(page)).parts.map((each) => each.covered)).toEqual(before);
    }
    // Open again, it paints.
    await leadHand(page, { target: { x: 62, y: 40 } });
    await expectSoon(async () => (await part(page, 'head')).covered, { timeout: 30_000 }).toBeGreaterThan(40);
    await stopHand(page);
  });
}

test('with the wrong paint a part shows the pot it wants, and the open hand dipped in that pot takes its paint', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page);
  // Yellow on the red balloon: nothing lands, and the balloon points at the red pot.
  await leadHand(page, { target: dotOf('balloon') });
  await expectSoon(async () => (await state(page)).hint?.colour ?? null, { timeout: 30_000 }).toBe('red');
  const hinted = await state(page);
  expect(hinted.parts.find((each) => each.id === 'balloon').covered).toBe(0);
  expect(hinted.pots[hinted.hint.pots[0]].colour).toBe('red');
  await expect(page.locator('#prompt-text')).toHaveText('Dip your hand in that pot!', { timeout: 10_000 });
  await page.waitForTimeout(300);
  await shot(page, 'paint-which-pot');
  // A closed hand in the pot takes nothing.
  await leadHand(page, { target: potOf('red'), photo: 'fist' });
  const red = hinted.pots.find((each) => each.colour === 'red');
  await expectSoon(() => farFrom(page, red), { timeout: 30_000 }).toBeLessThan(4);
  await page.waitForTimeout(1200);
  expect((await state(page)).brush.colour).toBe('yellow');
  expect((await state(page)).stats.dips).toBe(0);
  // The open hand does, and the balloon stops asking.
  await dipIn(page, 'red');
  await page.waitForTimeout(250);
  await shot(page, 'paint-dipped');
  const dipped = await state(page);
  expect(dipped.stats.dips).toBe(1);
  expect(dipped.hint).toBe(null);
  // Now it paints the balloon, red, and red goes nowhere else on the way there.
  await leadHand(page, { target: dotOf('balloon') });
  await expectSoon(async () => (await part(page, 'balloon')).covered, { timeout: 30_000 }).toBeGreaterThan(150);
  const balloon = await part(page, 'balloon');
  const drawn = await paintAt(page, balloon.dot.x, balloon.dot.y);
  expect(drawn.paint).toBe('red');
  expect(drawn.drawn[0]).toBeGreaterThan(200);
  expect(drawn.drawn[1]).toBeLessThan(130);
  // On the way from the pot, across parts that ask for other paints, the red went nowhere else.
  const after = await state(page);
  for (const each of after.parts.filter((one) => one.colour !== 'red')) expect(each.covered, each.id).toBe(dipped.parts.find((one) => one.id === each.id).covered);
  await stopHand(page);
});

test('in the gentle picture, a child who keeps the wrong paint on a part is given the right one after a while, so nobody is stuck', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page, GENTLE);
  await leadHand(page, { target: dotOf('balloon') });
  await expectSoon(async () => (await state(page)).stats.helped, { timeout: 40_000 }).toBe(1);
  expect((await state(page)).brush.colour).toBe('red');
  await expectSoon(async () => (await part(page, 'balloon')).covered, { timeout: 20_000 }).toBeGreaterThan(50);
  expect((await state(page)).stats.dips).toBe(0);
  await stopHand(page);
});

test('free painting, as a grown-up can choose: any colour goes anywhere, and still stays inside the part the brush is in', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, { paintColours: 'free' });
  expect((await state(page)).rule).toBe('free');
  // Yellow on the muzzle, which asks for orange: it lands, and none of it on the head round it.
  await leadHand(page, { target: { x: 63, y: 72 } });
  await expectSoon(async () => (await part(page, 'muzzle')).covered, { timeout: 30_000 }).toBeGreaterThan(80);
  await leadHand(page, { target: { x: 63, y: 60 }, wobble: 2 });
  await page.waitForTimeout(1500);
  const now = await state(page);
  expect(now.hint).toBe(null);
  expect(now.parts.find((each) => each.id === 'head').covered).toBe(0);
  expect((await paintAt(page, 63, 72)).paint).toBe('yellow');
  await page.waitForTimeout(200);
  await shot(page, 'paint-free');
  await stopHand(page);
});

test('the picture can be saved to this computer, from the panel and from the finish card, and nothing goes anywhere else', async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await startPlaying(page);
  await leadHand(page, { target: { x: 62, y: 40 } });
  await expectSoon(async () => (await part(page, 'head')).covered, { timeout: 30_000 }).toBeGreaterThan(80);
  await stopHand(page);
  // From the grown-ups' panel, as it is so far.
  await page.locator('#open-panel').click();
  const [first] = await Promise.all([page.waitForEvent('download'), page.locator('#save-picture-now').click()]);
  expect(first.suggestedFilename()).toBe('giraffe-paint-box-giraffe.png');
  const saved = await first.path();
  const { readFileSync } = await import('node:fs');
  const bytes = readFileSync(saved);
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  expect(bytes.length).toBeGreaterThan(8000);
  await page.locator('#close-panel').click();
  // And from the finish card, once it's done.
  await leadHand(page);
  await waitForScreen(page, 'finish');
  await stopHand(page);
  await expect(page.locator('#save-picture')).toBeVisible();
  const [second] = await Promise.all([page.waitForEvent('download'), page.locator('#save-picture').click()]);
  expect(second.suggestedFilename()).toBe('giraffe-paint-box-giraffe.png');
  expect(readFileSync(await second.path()).length).toBeGreaterThan(bytes.length);
  // The picture never left the page: everything asked for came from this computer.
  const elsewhere = requests.filter((url) => !url.startsWith(baseURL) && !url.startsWith('data:') && !url.startsWith('blob:'));
  expect(elsewhere).toEqual([]);
});

test('a grown-up\'s choices: a bigger brush, how much of a part is enough, and reach help, which makes a smaller movement go further', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, { paintBrush: 'big', paintDone: 'some' });
  const chosen = await page.evaluate(() => {
    const { painting } = window.__game;
    return { radius: painting.radius, need: painting.parts.find((each) => each.id === 'head').need };
  });
  expect(chosen).toEqual({ radius: 8.5, need: 0.65 });
  // A smaller brush takes effect at once, in the middle of a picture.
  await page.locator('#open-panel').click();
  await page.locator('input[name="paintBrush"][value="small"]').check();
  await page.locator('#close-panel').click();
  expect((await state(page)).radius).toBe(5);
  // The same hand, in the same place off to one side, is further across the sheet with more reach help.
  const across = async (reach) => {
    await page.locator('#open-panel').click();
    await page.locator(`input[name="paintReach"][value="${reach}"]`).check();
    await page.locator('#close-panel').click();
    await page.evaluate(() => window.__camera.show({ left: null, right: 'open', scale: 0.62, rightOffsetX: -480, rightOffsetY: -90 }));
    await page.waitForTimeout(1500);
    const { at } = await state(page);
    return { x: at.x - 75, y: at.y - 61 };
  };
  const [none, little, lots] = [await across('none'), await across('little'), await across('lots')];
  expect(Math.abs(little.x)).toBeGreaterThan(Math.abs(none.x) * 1.15);
  expect(Math.abs(lots.x)).toBeGreaterThan(Math.abs(little.x) * 1.15);
  expect(Math.abs(lots.y)).toBeGreaterThan(Math.abs(none.y) * 1.3);
  // The level, and a rest, change none of it.
  expect(await page.evaluate(() => window.__game.session.settings.paintDone)).toBe('some');
});

for (const reach of ['none', 'lots']) {
  test(`the whole desk is in reach with reach help ${reach}: an open hand gets to every corner of the sheet and the pots at each end, still whole in the camera's picture`, async ({ page }) => {
    test.setTimeout(180_000);
    // Level 9 has the longest row of pots.
    await startPlaying(page, { paintReach: reach, levels: { [GAME]: 9 } });
    const { pots } = await state(page);
    expect(pots.length).toBe(9);
    const places = [{ x: 3, y: 3 }, { x: 147, y: 3 }, { x: 147, y: 97 }, { x: 3, y: 97 }, { x: pots[0].x, y: pots[0].y }, { x: pots.at(-1).x, y: pots.at(-1).y }];
    for (const where of places) {
      await leadHand(page, { target: where });
      await expectSoon(() => farFrom(page, where), { timeout: 40_000 }).toBeLessThan(3);
      await page.waitForTimeout(400);
      // All of the hand is in the picture there: it's seen, and it's open, so it paints and dips.
      const hand = await page.evaluate(() => {
        const { right } = window.__game.monitor.snapshot;
        return { status: right.status, reason: right.reason ?? null };
      });
      expect(hand, `at ${where.x}, ${where.y}`).toEqual({ status: 'open', reason: null });
    }
    await shot(page, `paint-reach-${reach}`);
    await stopHand(page);
  });
}

test('with the left hand, the game is played the same, and Giraffe stands on the other side', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, { hands: 'left' });
  await leadHand(page, { target: { x: 62, y: 40 }, side: 'left' });
  await expectSoon(async () => (await part(page, 'head')).covered, { timeout: 30_000 }).toBeGreaterThan(60);
  await page.waitForTimeout(300);
  await shot(page, 'paint-left-hand');
  // To the far side of the sheet and back, which the right hand's side of the camera would never see.
  await leadHand(page, { target: potOf('brown'), side: 'left' });
  await expectSoon(async () => (await state(page)).brush.colour, { timeout: 30_000 }).toBe('brown');
  await stopHand(page);
});

test('in Georgian, Giraffe and the prompts speak Georgian', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page, { language: 'ka' });
  await expect(page.locator('#story-line')).toHaveText('წვეულებისთვის ნახატებს ვხატავ! გამიფერადებ?');
  await leadHand(page, { target: { x: 62, y: 40 }, photo: 'fist' });
  await expect(page.locator('#prompt-text')).toHaveText('გაშალე ხელი და ხატე!', { timeout: 30_000 });
  await leadHand(page, { target: dotOf('balloon') });
  await expect(page.locator('#prompt-text')).toHaveText('ხელი იმ ქილაში ჩააწე!', { timeout: 30_000 });
  await stopHand(page);
});

test('a hand that wobbles a good deal as it goes still paints the whole picture', async ({ page }) => {
  test.setTimeout(300_000);
  await startPlaying(page);
  await leadHand(page, { wobble: 4 });
  await waitForScreen(page, 'finish');
  await stopHand(page);
  const end = await state(page);
  expect(end.done).toBe(true);
  expect(end.stats.helped).toBe(0);
  expect(GAME).toBe('giraffe-paint');
});

/* ---------- the other painter ---------- */

test('the other painter paints while the hand is in the picture and waits while it isn\'t, and finishing first wins the contest', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page);
  await expect(page.locator('#chip-rival-box')).toBeVisible();
  await expect(page.locator('#rival-name')).toHaveText('Truffle');
  const start = await state(page);
  expect(start.rival.who).toBe('truffle');
  await show(page, ...NO_HAND);
  await page.waitForTimeout(1500);
  const away = (await state(page)).rival.progress;
  await page.waitForTimeout(3000);
  expect((await state(page)).rival.progress).toBe(away);
  await show(page, ...FIST);
  await expectSoon(async () => (await state(page)).rival.progress, { timeout: 10_000 }).toBeGreaterThan(away + 0.005);
  await page.evaluate(() => {
    window.__game.painting.rival.progress = 0.98;
  });
  await expect(page.locator('#chip-rival-box')).toHaveClass(/is-near/);
  await shot(page, 'paint-rival-near');
  const beaten = judge(await watchBrightness(page, 300));
  console.log('the other painter finishing first', JSON.stringify(beaten));
  expect(beaten.biggestStep).toBeLessThan(4);
  expect(beaten.flickeringShare).toBeLessThan(0.01);
  await waitForScreen(page, 'finish');
  expect((await state(page)).lost).toBe(true);
  await expect(page.locator('#screen-finish h2')).toHaveText('Truffle finished painting first!');
  await expect(page.locator('#play-again')).toHaveText('Try again');
  await expect(page.locator('#level-done-text')).toHaveText('Let’s try level 1 again!');
  await page.waitForTimeout(800);
  await shot(page, 'paint-beaten');
});

test('in the gentle picture there is nobody to beat, and the panel has the contest and the small brush as they come', async ({ page }) => {
  await startPlaying(page, GENTLE);
  await expect(page.locator('#chip-rival-box')).toBeHidden();
  expect((await state(page)).rival).toBe(null);
  await page.locator('#open-panel').click();
  await expect(page.locator('input[name="paintRival"][value="gentle"]')).toBeChecked();
  await expect(page.locator('input[name="paintBrush"][value="small"]')).toBeChecked();
});
