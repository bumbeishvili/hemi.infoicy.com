// Playing Giraffe's Puzzles: an open hand over a loose piece picks it up, the piece goes with the hand while it stays
// open, and brought near its place it snaps in. A hand that closes, or goes, leaves the piece where it is. With real
// photos of a hand, open and closed, through the real tracker.
import { openGame, shot } from '../helpers.js';
import { expect, expectSoon, FIST, GAME, GENTLE, handNow, judge, leadHand, NO_HAND, OPEN, show, startPlaying, state, stopHand, test, waitForScreen, watchBrightness } from './helpers.js';

const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// Somewhere under the easel that's nobody's place, to take a piece to and put it down.
const SPARE = { x: 1, y: 0.9 };
const toSpare = `(puzzle, at) => (puzzle.held ? { x: ${SPARE.x}, y: ${SPARE.y} } : puzzle.wants(at))`;

test('an open hand picks a piece up and carries it to its place, and every piece in place ends the game', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, { puzzlePieces: 'fewer' });
  const start = await state(page);
  expect(start.total).toBe(6);
  expect(start.rounds).toBe(3);
  expect(start.pieces).toHaveLength(2);
  expect(start.pieces.every((piece) => piece.state !== 'placed')).toBe(true);
  await expect(page.locator('#story-line')).toHaveText('My picture fell and broke! Can you put it back together?');
  await expect(page.locator('#chip-pieces')).toHaveText('0 of 6');
  // The little film of what to do shows until the first piece is in.
  await expect(page.locator('.puzzle-film')).toBeVisible();
  expect(await page.locator('.film-carry').evaluate((node) => getComputedStyle(node).animationName)).toBe('film-carry');
  await page.waitForTimeout(400);
  await shot(page, 'puzzles-start');

  // The hand goes to a piece, and it's in the hand, going with it. It follows a moment behind, as a held thing does
  // (FOLLOW_RATE in puzzle.js), and this hand goes much faster than a child's, so it's a good way behind while it
  // moves: it's taken a little way along its own board, away from its place, and once the hand rests there it's
  // right under it.
  await leadHand(page);
  await expectSoon(async () => (await state(page)).held).not.toBe(null);
  await stopHand(page);
  const picked = await state(page);
  const from = picked.pieces.find(({ id }) => id === picked.held);
  const along = { x: from.x, y: from.y > 0.5 ? from.y - 0.25 : from.y + 0.25 };
  await leadHand(page, { target: `(puzzle) => (puzzle.held ? { x: ${along.x}, y: ${along.y} } : null)` });
  await expectSoon(async () => {
    const now = await state(page);
    const piece = now.pieces.find(({ id }) => id === picked.held);
    return now.held === picked.held && now.glove && gap(now.glove, along) < 0.05 && gap(piece, now.glove) < 0.04 && gap(piece, from) > 0.15;
  }, { timeout: 20_000 }).toBe(true);
  await shot(page, 'puzzles-carrying');
  await leadHand(page);
  // Brought to its place, it snaps in.
  await expectSoon(async () => (await state(page)).placed).toBeGreaterThanOrEqual(1);
  await expect(page.locator('#chip-pieces')).toHaveText(/^[1-6] of 6$/);
  await expect(page.locator('.puzzle-film')).toBeHidden();
  await page.waitForTimeout(300);
  await shot(page, 'puzzles-first-piece');

  // One picture after another, and the finish card comes.
  await waitForScreen(page, 'finish');
  await stopHand(page);
  const end = await state(page);
  expect(end.placed).toBe(6);
  expect(end.stats.pictures).toBe(3);
  expect(end.done).toBe(true);
  await expect(page.locator('#screen-finish h2')).toHaveText('The pictures are back together!');
  await expect(page.locator('#finish-hero')).toHaveText('6');
  await expect(page.locator('#sum-right-pieces')).toHaveText('6');
  await expect(page.locator('#sum-right-pictures')).toHaveText('3');
  await expect(page.locator('#level-done-text')).toHaveText('Level 1 done! Next: level 2');
  await page.waitForTimeout(600);
  await shot(page, 'puzzles-finish');
});

test('a closed hand picks nothing up, and one that closes on the way leaves the piece where it is, for as long as it takes', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, {});
  // The hand that was open for the hand check may have a piece already, if it was over one. It closes, and hasn't.
  await show(page, ...FIST);
  await expectSoon(async () => (await state(page)).held, { timeout: 5000 }).toBe(null);
  const before = (await state(page)).stats.picks;
  // A fist taken to a piece, and held on it: nothing.
  await leadHand(page, { target: '(puzzle, at) => ({ ...puzzle.wants(at), hand: "fist" })' });
  await page.waitForTimeout(3000);
  const fist = await state(page);
  const nearest = fist.pieces.reduce((best, piece) => (gap(piece, fist.glove) < gap(best, fist.glove) ? piece : best));
  expect(gap(nearest, fist.glove), 'the fist is on a piece').toBeLessThan(0.1);
  expect(fist.held).toBe(null);
  expect(fist.stats.picks).toBe(before);

  // Open, it picks the piece up, and carries it under the easel, where it's nobody's place.
  await leadHand(page, { target: toSpare });
  await expectSoon(async () => {
    const now = await state(page);
    return now.held !== null && gap(now.glove, SPARE) < 0.05;
  }).toBe(true);
  const which = (await state(page)).held;
  // The hand closes: the piece is put down, right there.
  await handNow(page, 'fist');
  await expectSoon(async () => (await state(page)).held, { timeout: 5000 }).toBe(null);
  const down = (await state(page)).pieces.find(({ id }) => id === which);
  expect(down.state).toBe('loose');
  expect(gap(down, SPARE)).toBeLessThan(0.08);
  await page.waitForTimeout(300);
  await shot(page, 'puzzles-put-down');
  // The closed hand goes off somewhere else, and then right out of the picture, and the piece waits.
  await leadHand(page, { target: '() => ({ x: 0.5, y: 0.4, hand: "fist" })' });
  await page.waitForTimeout(2500);
  await stopHand(page);
  await show(page, ...NO_HAND);
  await page.waitForTimeout(2500);
  const waited = (await state(page)).pieces.find(({ id }) => id === which);
  expect([waited.x, waited.y, waited.state]).toEqual([down.x, down.y, 'loose']);
  expect((await state(page)).placed).toBe(0);

  // Back, and open, the hand picks it up from where it lay, and takes it to its place.
  await show(page, ...OPEN);
  await leadHand(page);
  await expectSoon(async () => (await state(page)).pieces.find(({ id }) => id === which).state).toBe('placed');
  await stopHand(page);
});

test('a shaking hand that\'s read as closed now and then still puts every piece in', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, { puzzlePieces: 'fewer' });
  await leadHand(page, { wobble: 16, blink: 1.3 });
  await waitForScreen(page, 'finish');
  await stopHand(page);
  const end = await state(page);
  expect(end.placed).toBe(6);
  // Nothing was lost on the way: every piece that was picked up went in, however many times it took.
  expect(end.stats.picks).toBeGreaterThanOrEqual(6);
});

test('what to do is asked for in few words: to pick a piece up, to open a closed hand, and in the gentle puzzle that resting is fine', async ({ page }) => {
  test.setTimeout(120_000);
  await openGame(page, GENTLE, GAME);
  await show(page, ...OPEN);
  await page.locator('#start').click();
  // The hand closes once the hand check is done, so it has no piece as the game starts.
  await waitForScreen(page, 'countdown');
  await show(page, ...FIST);
  await waitForScreen(page, 'playing');
  const prompt = page.locator('#prompt-text');
  // A closed hand is asked to open, after a moment. While Giraffe's words are in the band, that goes just under it,
  // between the two boards, where it hides no piece.
  await leadHand(page, { target: `() => ({ x: ${SPARE.x}, y: ${SPARE.y}, hand: 'fist' })` });
  await expect(prompt).toHaveText('Open your hand to pick up a piece!', { timeout: 15_000 });
  const placed = () => page.evaluate(() => {
    const { view, puzzle } = window.__game;
    const [left, right] = puzzle.layout.boards;
    const box = document.getElementById('prompt').getBoundingClientRect();
    return {
      box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom },
      story: document.getElementById('story').classList.contains('is-visible'),
      boards: { leftEnds: view.at(left.x + left.width, 0).x, rightStarts: view.at(right.x, 0).x },
      band: { tally: document.querySelector('.puzzle-hud').getBoundingClientRect().right, meter: document.querySelector('.hands-bar').getBoundingClientRect().left, table: view.top },
    };
  });
  const early = await placed();
  if (early.story) {
    expect(early.box.left).toBeGreaterThan(early.boards.leftEnds - 4);
    expect(early.box.right).toBeLessThan(early.boards.rightStarts + 4);
    expect(early.box.top).toBeGreaterThanOrEqual(early.band.table);
  }
  // And after a good while of it, told that resting is fine. Nothing has been lost by it.
  await expect(prompt).toHaveText('Resting is OK. Open your hand when you’re ready.', { timeout: 25_000 });
  const rested = await state(page);
  expect(rested.stats.picks).toBe(0);
  expect(rested.pieces.every((piece) => piece.state === 'loose')).toBe(true);
  // An open hand that isn't on a piece is told how to pick one up.
  await leadHand(page, { target: `() => ({ x: ${SPARE.x}, y: ${SPARE.y} })` });
  await expect(prompt).toHaveText('Pick up a piece with your open hand!', { timeout: 15_000 });
  await page.waitForTimeout(300);
  await shot(page, 'puzzles-hint');
  // Once Giraffe's words have gone, what's asked is in the band, between the tally and the hand meter, and not over
  // the table at all.
  const later = await placed();
  expect(later.story).toBe(false);
  expect(later.box.left).toBeGreaterThan(later.band.tally);
  expect(later.box.right).toBeLessThan(later.band.meter);
  expect(later.box.bottom).toBeLessThanOrEqual(later.band.table + 2);
  // A hand out of the picture is asked for.
  await stopHand(page);
  await show(page, ...NO_HAND);
  await expect(prompt).toHaveText('Show your right hand!', { timeout: 10_000 });
  // With a piece in the hand that hasn't found its place for a while, it's said where to take it.
  await show(page, ...OPEN);
  await leadHand(page, { target: toSpare });
  await expect(prompt).toHaveText('Take it to its place in the picture!', { timeout: 20_000 });
  await stopHand(page);
});

test('the grown-ups\' settings: how many pieces, how near, reach help, and the left hand, which turns the table round', async ({ page }) => {
  test.setTimeout(180_000);
  await openGame(page, { hands: 'left', puzzlePieces: 'more', puzzleSnap: 'exact', puzzleReach: 'lots' }, GAME);
  await page.locator('#open-panel').click();
  for (const [name, value] of [['puzzlePieces', 'more'], ['puzzleSnap', 'exact'], ['puzzleReach', 'lots'], ['puzzleFriends', 'together']]) {
    await expect(page.locator(`input[name="${name}"][value="${value}"]`)).toBeChecked();
  }
  await page.locator('#panel fieldset', { hasText: 'How many pieces' }).scrollIntoViewIfNeeded();
  await shot(page, 'puzzles-panel');
  await page.locator('#close-panel').click();
  await show(page, 'open', null, { scale: 0.62, sameHand: true });
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
  const start = await state(page);
  // More pieces than level 1 usually has: 6 to a picture, not 4.
  expect(start.pieces).toHaveLength(6);
  const laid = await page.evaluate(() => {
    const { puzzle, game } = window.__game;
    return { snap: puzzle.snapRadius(), piece: puzzle.layout.piece, film: puzzle.layout.film.x, grab: puzzle.grab, offset: game.gloveOffset.x };
  });
  expect(laid.snap).toBeCloseTo(Math.min(laid.piece.width, laid.piece.height) * 0.22, 5);
  expect(laid.grab).toBe(0.06);
  // With the left hand, the little film is on the right, out of its way.
  expect(laid.film).toBeGreaterThan(1);
  // Reach help makes the glove go further than the hand: it's drawn from further out than the table's own edge.
  expect(laid.offset).toBeLessThan(await page.evaluate(() => window.__game.view.area.left) - 50);
  await leadHand(page, { side: 'left' });
  await expectSoon(async () => (await state(page)).placed, { timeout: 90_000 }).toBeGreaterThanOrEqual(2);
  await stopHand(page);
  await shot(page, 'puzzles-left-hand');
});

test.describe('on a big sharp screen', () => {
  test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

  test('Giraffe and the pictures are drawn as big as they\'re shown, so they\'re sharp, and he looks over his easel', async ({ page }) => {
    test.setTimeout(120_000);
    await startPlaying(page, {});
    const sizes = await page.evaluate(() => {
      const { view, puzzle } = window.__game;
      const [picture] = view.pictures;
      return {
        giraffe: { drawn: view.giraffe.tall, shown: view.scale * 0.4 * view.ratio, frames: Object.keys(view.giraffe.frames) },
        picture: { drawn: picture.canvas.width, shown: puzzle.layout.frames[0].width * view.scale * view.ratio },
      };
    });
    expect(sizes.giraffe.frames).toEqual(['stand', 'cheer', 'wave']);
    expect(sizes.giraffe.drawn).toBeGreaterThanOrEqual(sizes.giraffe.shown * 0.99);
    expect(sizes.picture.drawn).toBeGreaterThanOrEqual(sizes.picture.shown * 0.99);
    await leadHand(page);
    await expectSoon(async () => (await state(page)).placed).toBeGreaterThanOrEqual(2);
    await page.waitForTimeout(300);
    await shot(page, 'puzzles-big-screen');
    await stopHand(page);
  });
});

/* ---------- the clock on the wall ---------- */

test('the clock goes round while the hand is in the picture and waits while it isn\'t, and running out ends the game kindly', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page);
  await expect(page.locator('#chip-clock-box')).toBeVisible();
  const start = await state(page);
  expect(start.timed).toBe(true);
  expect(start.clock.total).toBeGreaterThan(30);
  await show(page, ...NO_HAND);
  await page.waitForTimeout(1500);
  const away = (await state(page)).clock.left;
  await page.waitForTimeout(3000);
  expect((await state(page)).clock.left).toBe(away);
  await show(page, ...FIST);
  await expectSoon(async () => (await state(page)).clock.left, { timeout: 10_000 }).toBeLessThan(away - 1);
  await page.evaluate(() => {
    window.__game.puzzle.clock.left = 3;
  });
  await expect(page.locator('#chip-clock-box')).toHaveClass(/is-low/);
  const running = judge(await watchBrightness(page, 300));
  console.log('the clock running out', JSON.stringify(running));
  expect(running.biggestStep).toBeLessThan(4);
  expect(running.flickeringShare).toBeLessThan(0.01);
  await waitForScreen(page, 'finish');
  expect((await state(page)).lost).toBe(true);
  await expect(page.locator('#screen-finish h2')).toHaveText('The clock ran out before the picture was mended!');
  await expect(page.locator('#play-again')).toHaveText('Try again');
  await expect(page.locator('#level-done-text')).toHaveText('Let’s try level 1 again!');
  await page.waitForTimeout(800);
  await shot(page, 'puzzle-time-up');
});

test('in the gentle puzzle there is no clock, and the panel has the clock, more pieces and a closer snap as they come', async ({ page }) => {
  await startPlaying(page, GENTLE);
  await expect(page.locator('#chip-clock-box')).toBeHidden();
  expect((await state(page)).clock).toBe(null);
  await page.locator('#open-panel').click();
  await expect(page.locator('input[name="puzzleClock"][value="gentle"]')).toBeChecked();
  await expect(page.locator('input[name="puzzlePieces"][value="more"]')).toBeChecked();
  await expect(page.locator('input[name="puzzleSnap"][value="closer"]')).toBeChecked();
});
