// Giraffe's Puzzles' ten levels: what each brings is on the title card and under the countdown, each new thing comes
// along and works in the real game, and nothing flashes, at level 1 or at level 10 with all of it about.
import { openGame, shot } from '../helpers.js';
import { expect, expectSoon, FIST, GAME, handNow, judge, labelShown, leadHand, OPEN, show, startPlaying, state, stopHand, test, waitForScreen, watchBrightness } from './helpers.js';

const NEW_AT = {
  2: ['A golden piece'],
  3: ['A peek at the picture'],
  4: ['A piece to turn'],
  5: ['A piece under a leaf'],
  6: ['Jigsaw pieces'],
  7: ['A piece in a bubble'],
  8: ['The magnet'],
  9: ['Two pictures at once'],
  10: ['A picture that comes to life'],
};
// The levels' own number of pieces, as the levels table says, rather than the more pieces a game has as it comes.
const atLevel = (level, more = {}) => ({ levels: { [GAME]: level }, puzzlePieces: 'usual', ...more });

// Where a pretend child takes the hand, to try one thing a level brings: with a piece in the hand, to its place,
// and otherwise to whatever this finds on the table, or nowhere once there's none.
const after = (find) => `(puzzle, at) => {
  if (puzzle.held) return { x: puzzle.held.home.x, y: puzzle.held.home.y };
  const found = (${find})(puzzle, at);
  return found ? { x: found.x, y: found.y } : null;
}`;
const pieceThat = (fits) => after(`(puzzle) => puzzle.pieces.find((piece) => piece.state === 'loose' && (${fits})(piece))`);

test('the title card says what each level brings, and level 1 is the plain puzzle', async ({ page }) => {
  await openGame(page, {}, GAME);
  await expect(page.locator('#level-badge')).toHaveText('Level 1 of 10');
  await expect(page.locator('#level-new')).toBeEmpty();
  for (const [level, names] of Object.entries(NEW_AT)) {
    await page.locator('#open-panel').click();
    await page.locator('#level-choice label', { hasText: new RegExp(`^\\s*${level}\\s*$`) }).click();
    await page.locator('#close-panel').click();
    await expect(page.locator('#level-badge')).toHaveText(`Level ${level} of 10`);
    for (const name of names) await expect(page.locator('#level-new')).toContainText(name);
  }
  await shot(page, 'puzzles-title-level-10');
});

test('under the countdown it says what\'s new, in Georgian too', async ({ page }) => {
  await openGame(page, { language: 'ka', ...atLevel(6) }, GAME);
  await show(page, ...OPEN);
  await page.locator('#start').click();
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-new-now')).toContainText('ფაზლის ნაწილები');
  await expect(page.locator('#level-now')).toHaveText('დონე 6');
  await waitForScreen(page, 'playing');
  await expect(page.locator('#story-line')).toHaveText(/[Ⴀ-ჿ]/);
  // What's new on the table is named in Georgian too.
  await expectSoon(() => page.evaluate(() => window.__game.view.labels[0]?.text ?? ''), { timeout: 10_000 }).toMatch(/[Ⴀ-ჿ]/);
});

test('level 2: the golden piece gives a star, which goes up to the prizes', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, atLevel(2));
  await expect(page.locator('#chip-prizes-box')).toBeVisible();
  const golden = (await state(page)).pieces.filter((piece) => piece.golden);
  expect(golden).toHaveLength(1);
  await expectSoon(() => labelShown(page, 'golden'), { timeout: 8000 }).toBe(true);
  await leadHand(page, { target: pieceThat('(piece) => piece.golden') });
  await expectSoon(async () => (await state(page)).pieces.find(({ id }) => id === golden[0].id).state).toBe('placed');
  await stopHand(page);
  expect((await state(page)).stats.prizes.star).toBe(1);
  await page.waitForTimeout(250);
  await shot(page, 'puzzles-golden');
  await expect(page.locator('#chip-prizes')).toHaveText('1', { timeout: 8000 });
});

test('level 3: an open hand held on the peek button shows the finished picture for a few seconds', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, atLevel(3));
  const { peek } = await state(page);
  expect(peek).toBeTruthy();
  await leadHand(page, { target: after('(puzzle) => puzzle.round.peek') });
  await expectSoon(async () => (await state(page)).peek.showing).toBeGreaterThan(3);
  await expectSoon(() => page.evaluate(() => window.__game.view.peekFade), { timeout: 5000 }).toBeGreaterThan(0.9);
  expect((await state(page)).stats.peeks).toBe(1);
  expect(await labelShown(page, 'peek')).toBe(true);
  await page.waitForTimeout(300);
  await shot(page, 'puzzles-peek');
  // The hand goes away, closed, and after a few seconds the picture has gone again. Nothing has been put in for it.
  await leadHand(page, { target: '() => ({ x: 1, y: 0.1, hand: "fist" })' });
  await expectSoon(async () => (await state(page)).peek.showing, { timeout: 15_000 }).toBe(0);
  await expectSoon(() => page.evaluate(() => window.__game.view.peekFade), { timeout: 5000 }).toBe(0);
  await stopHand(page);
});

test('level 4: a piece the wrong way up turns the right way up while it\'s held, and then goes in', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, atLevel(4));
  const turned = (await state(page)).pieces.filter((piece) => piece.angle !== 0);
  expect(turned).toHaveLength(1);
  const [{ id, angle }] = turned;
  const now = async () => (await state(page)).pieces.find((piece) => piece.id === id);
  await expectSoon(() => labelShown(page, 'turned'), { timeout: 8000 }).toBe(true);
  // A fist on it doesn't turn it.
  await leadHand(page, { target: `(puzzle) => ({ ...puzzle.piece(${id}), hand: 'fist' })` });
  await page.waitForTimeout(2500);
  expect((await now()).angle).toBe(angle);
  // Held by the open hand, away from its place, it turns.
  await leadHand(page, { target: `(puzzle, at) => (puzzle.held && puzzle.held.id !== ${id} ? puzzle.wants(at) : puzzle.held ? { x: 1, y: 0.9 } : puzzle.piece(${id}))` });
  await expectSoon(async () => Math.abs((await now()).angle)).toBeLessThan(Math.abs(angle));
  await shot(page, 'puzzles-turning');
  await expectSoon(async () => (await now()).angle).toBe(0);
  expect((await now()).state).not.toBe('placed');
  // And the right way up, it goes in.
  await leadHand(page);
  await expectSoon(async () => (await now()).state).toBe('placed');
  await stopHand(page);
});

test('level 5: an open hand brushes the leaf off a piece, and then picks the piece up', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, atLevel(5));
  const under = (await state(page)).pieces.filter((piece) => piece.leaf !== null);
  expect(under).toHaveLength(1);
  const [{ id }] = under;
  const now = async () => (await state(page)).pieces.find((piece) => piece.id === id);
  await expectSoon(() => labelShown(page, 'leaf'), { timeout: 8000 }).toBe(true);
  await page.waitForTimeout(300);
  await shot(page, 'puzzles-leaf');
  // A fist rubbing at it does nothing. The hand closes where it is first, and is read as closed, so it isn't still
  // open on its way to the leaf: the tracker takes a moment to see a hand close, longer on a busy computer.
  await handNow(page, 'fist');
  await expectSoon(async () => (await state(page)).open, { timeout: 10_000 }).toBe(false);
  const rub = (hand) => `(puzzle, at) => (puzzle.held ? puzzle.wants(at) : { x: puzzle.piece(${id}).x + Math.sin(performance.now() / 160) * 0.06, y: puzzle.piece(${id}).y${hand} })`;
  await leadHand(page, { target: rub(', hand: "fist"'), gain: 0.2 });
  await page.waitForTimeout(3000);
  const before = (await now()).leaf;
  expect(before).not.toBe(null);
  // The open hand going to and fro over it brushes it off.
  await leadHand(page, { target: rub(''), gain: 0.2 });
  await expectSoon(async () => (await now()).leaf, { timeout: 30_000 }).toBe(null);
  // And then the piece comes up in the hand, and goes to its place.
  await leadHand(page, { target: pieceThat(`(piece) => piece.id === ${id}`) });
  await expectSoon(async () => (await now()).state).toBe('placed');
  await stopHand(page);
});

test('level 6: the pieces are jigsaw pieces, with knobs and holes that fit', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, atLevel(6));
  const { pieces } = await state(page);
  expect(pieces).toHaveLength(8);
  // Every piece has at least two sides that aren't straight, and none along the picture's edge.
  for (const piece of pieces) {
    expect(Object.values(piece.sides).filter((way) => way !== 0).length).toBeGreaterThanOrEqual(2);
    if (piece.row === 0) expect(piece.sides.top).toBe(0);
    if (piece.col === 0) expect(piece.sides.left).toBe(0);
  }
  await expectSoon(() => labelShown(page, 'jigsaw'), { timeout: 12_000 }).toBe(true);
  await leadHand(page);
  await expectSoon(async () => (await state(page)).placed, { timeout: 90_000 }).toBeGreaterThanOrEqual(3);
  await stopHand(page);
  await page.waitForTimeout(300);
  await shot(page, 'puzzles-jigsaw');
});

test('level 7: a piece floats about in a bubble, and an open hand pops it and has the piece', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, atLevel(7));
  const floating = (await state(page)).pieces.filter((piece) => piece.floating);
  expect(floating).toHaveLength(1);
  const [{ id, x, y }] = floating;
  const now = async () => (await state(page)).pieces.find((piece) => piece.id === id);
  // It floats, slowly, with the hand closed and out of its way.
  await leadHand(page, { target: '() => ({ x: 0.3, y: 0.9, hand: "fist" })' });
  await page.waitForTimeout(2500);
  const drifted = await now();
  expect(drifted.floating).toBe(true);
  expect(Math.hypot(drifted.x - x, drifted.y - y)).toBeGreaterThan(0.05);
  await shot(page, 'puzzles-bubble');
  // The open hand goes to it, and it pops: the piece is in the hand, or straight into its place, if the bubble had
  // floated over it.
  await page.evaluate((which) => {
    window.__popped = null;
    const { puzzle } = window.__game;
    const heard = puzzle.onEvent;
    puzzle.onEvent = (event) => {
      if (event.type === 'pop' && event.piece.id === which) window.__popped = { held: puzzle.held?.id ?? null };
      heard(event);
    };
  }, id);
  await leadHand(page, { target: `(puzzle, at) => (puzzle.held && puzzle.held.id !== ${id} ? puzzle.wants(at) : puzzle.held ? { x: 1, y: 0.9 } : puzzle.piece(${id}))`, gain: 0.14 });
  await expectSoon(async () => (await now()).floating).toBe(false);
  expect(await page.evaluate(() => window.__popped)).toEqual({ held: id });
  expect(['held', 'placed']).toContain((await now()).state);
  expect(await labelShown(page, 'bubble')).toBe(true);
  await leadHand(page);
  await expectSoon(async () => (await now()).state).toBe('placed');
  await stopHand(page);
});

test('level 8: the magnet draws pieces to the open hand, and only runs down while the hand is open', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, atLevel(8));
  expect((await state(page)).magnet.state).toBe('waiting');
  await leadHand(page, { target: after('(puzzle) => (puzzle.round.magnet.state === "waiting" ? puzzle.round.magnet : null)'), gain: 0.14 });
  await expectSoon(async () => (await state(page)).magnet.state).toBe('on');
  expect(await labelShown(page, 'magnet')).toBe(true);
  // Resting with it, closed, it waits.
  await handNow(page, 'fist');
  await expectSoon(async () => (await state(page)).open, { timeout: 5000 }).toBe(false);
  const left = (await state(page)).magnet.left;
  expect(left).toBeGreaterThan(6.5);
  await page.waitForTimeout(3000);
  expect((await state(page)).magnet.left).toBe(left);
  // Open again, from the middle of the table, a piece from a board comes to the hand, though the hand isn't on it.
  const before = (await state(page)).stats.picks;
  await leadHand(page, { target: '(puzzle, at) => { const next = puzzle.wants(at); return !next || puzzle.held ? { x: at.x, y: at.y } : { x: next.x < 1 ? 0.72 : 1.28, y: next.y }; }' });
  await expectSoon(async () => (await state(page)).stats.picks, { timeout: 20_000 }).toBeGreaterThan(before);
  await page.waitForTimeout(200);
  await shot(page, 'puzzles-magnet');
  expect((await state(page)).magnet.left).toBeLessThan(left);
  await stopHand(page);
});

test('level 9: two pictures at once, side by side, with their pieces on both boards', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, atLevel(9));
  const start = await state(page);
  expect(start.pictures).toHaveLength(2);
  expect(new Set(start.pictures).size).toBe(2);
  expect(start.pieces).toHaveLength(12);
  expect(start.rounds).toBe(1);
  await expectSoon(() => labelShown(page, 'pair'), { timeout: 20_000 }).toBe(true);
  await leadHand(page);
  // Pieces of both pictures go in.
  await expectSoon(async () => new Set((await state(page)).pieces.filter((piece) => piece.state === 'placed').map((piece) => piece.frame)).size, { timeout: 120_000 }).toBe(2);
  await stopHand(page);
  await page.waitForTimeout(300);
  await shot(page, 'puzzles-two-pictures');
});

test('level 10: the finished pictures come to life, and each gives a gem', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, atLevel(10, { puzzlePieces: 'fewer' }));
  expect((await state(page)).total).toBe(8);
  await leadHand(page);
  await expectSoon(async () => (await state(page)).alive, { timeout: 150_000 }).toBe(true);
  await stopHand(page);
  expect((await state(page)).stats.prizes.gem).toBe(2);
  // It moves: what's drawn in the frame changes from one moment to the next, and nothing else has to.
  const frames = await page.evaluate(async () => {
    const { view, puzzle } = window.__game;
    const canvas = document.getElementById('game');
    const [frame] = puzzle.layout.frames;
    const corner = view.at(frame.x, frame.y);
    const grab = () => {
      const small = document.createElement('canvas');
      small.width = 80;
      small.height = 60;
      small.getContext('2d').drawImage(canvas, corner.x * view.ratio, corner.y * view.ratio, frame.width * view.scale * view.ratio, frame.height * view.scale * view.ratio, 0, 0, 80, 60);
      return small.getContext('2d').getImageData(0, 0, 80, 60).data;
    };
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const first = grab();
    await new Promise((resolve) => setTimeout(resolve, 500));
    const second = grab();
    let changed = 0;
    for (let i = 0; i < first.length; i += 4) if (Math.abs(first[i] - second[i]) + Math.abs(first[i + 1] - second[i + 1]) + Math.abs(first[i + 2] - second[i + 2]) > 24) changed += 1;
    return { changed, cells: first.length / 4 };
  });
  expect(frames.changed).toBeGreaterThan(10);
  expect(frames.changed).toBeLessThan(frames.cells * 0.5);
  expect(await labelShown(page, 'alive')).toBe(true);
  await shot(page, 'puzzles-alive');
  await waitForScreen(page, 'finish');
  await expect(page.locator('#finish-prizes')).toContainText('💎 2');
});

for (const level of [1, 10]) {
  test(`nothing flashes at level ${level}: picking up, carrying, pieces going in and a picture finished, the brightness stays steady`, async ({ page }) => {
    test.setTimeout(240_000);
    await startPlaying(page, atLevel(level, level === 1 ? {} : { puzzlePieces: 'fewer' }));
    await leadHand(page);
    await expectSoon(async () => (await state(page)).held, { timeout: 20_000 }).not.toBe(null);
    const playing = judge(await watchBrightness(page, 420));
    console.log(`level ${level} playing`, JSON.stringify(playing));
    expect(playing.biggestStep).toBeLessThan(4);
    expect(playing.flickeringShare).toBeLessThan(0.01);
    expect((await state(page)).placed + (await state(page)).index * 4).toBeGreaterThan(0);
    // On through a picture being finished, looked at, and the next one coming, or the game ending.
    await expectSoon(async () => (await state(page)).phase, { timeout: 120_000 }).not.toBe('play');
    const finished = judge(await watchBrightness(page, 300));
    console.log(`level ${level} a picture finished`, JSON.stringify(finished));
    expect(finished.biggestStep).toBeLessThan(4);
    expect(finished.flickeringShare).toBeLessThan(0.01);
    await stopHand(page);
  });
}

test('nothing flashes: a hand opening and closing as fast as it can, with a piece in it, doesn\'t flicker anything', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, atLevel(1));
  await leadHand(page, { target: '(puzzle, at) => (puzzle.held ? { x: 1, y: 0.9 } : puzzle.wants(at))' });
  await expectSoon(async () => (await state(page)).held).not.toBe(null);
  await page.waitForTimeout(1500);
  await stopHand(page);
  // Quicker than any child, and quicker than the tracker can follow.
  await page.evaluate(() => {
    let open = true;
    const { x, y } = window.__lead;
    window.__flip = setInterval(() => {
      open = !open;
      window.__camera.show({ left: null, right: open ? 'open' : 'fist', scale: 0.62, sameHand: true, rightOffsetX: x, rightOffsetY: y });
    }, 220);
  });
  const result = judge(await watchBrightness(page, 240));
  console.log('opening and closing', JSON.stringify(result));
  await page.evaluate(() => clearInterval(window.__flip));
  expect(result.biggestStep).toBeLessThan(4);
  // What changes is the glove copying the hand, its fingers out and then in.
  expect(result.flickeringShare).toBeLessThan(0.04);
  await show(page, ...FIST);
});
