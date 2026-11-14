// Playing Bounce Back against the computer, with real photos of hands going through the real tracker: an open
// hand hits the ball over the net, a closed or missing one never does, resting never loses a point, and the
// game ends at the points chosen.
import { expect, openGame, show, shot, test, waitForScreen } from '../helpers.js';
import { expectSoon, FIST, GAME, NO_HAND, OPEN, rally, startPlaying, steerHand, stopHand } from './helpers.js';

const prompt = (page) => page.locator('#prompt-text');

test('an open hand hits the ball back over the net, and a point won goes up on the score', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page);
  // The first serve is the child's, waiting by their hand, with a little film of what to do.
  const start = await rally(page);
  expect(start.ball.state).toBe('held');
  expect(start.server).toBe('A');
  await expect(page.locator('.bounce-film')).toBeVisible();
  await expect(page.locator('#score-board')).toBeVisible();
  await expect(page.locator('#score-goal')).toHaveText('First to 5');
  await steerHand(page);
  await expectSoon(async () => (await rally(page)).hits.A).toBeGreaterThanOrEqual(1);
  await expect(page.locator('.bounce-film')).toBeHidden();
  // Over the net to the computer, which sends it back to the child's hand.
  await expectSoon(async () => (await rally(page)).ball.side).toBe('B');
  await expectSoon(async () => (await rally(page)).hits.B).toBeGreaterThanOrEqual(1);
  await expectSoon(async () => (await rally(page)).hits.A, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  await shot(page, 'bounce-rally');
  // On Gentle the computer misses one after a few, and the child has a point.
  await expectSoon(async () => (await rally(page)).scores.A, { timeout: 120_000 }).toBeGreaterThanOrEqual(1);
  await expect(page.locator('.score-player.is-mine .score-value')).not.toHaveText('0');
  expect((await rally(page)).scores.B).toBe(0);
  await stopHand(page);
});

for (const [name, scene] of [['closed', FIST], ['missing', NO_HAND]]) {
  test(`a ${name} hand never hits the ball: it waits for as long as it takes, until an open hand comes to it`, async ({ page }) => {
    test.setTimeout(180_000);
    await startPlaying(page, { bounceHard: 'tough' });
    await show(page, ...scene);
    await page.waitForTimeout(9000);
    const waited = await rally(page);
    expect(waited.hits.A).toBe(0);
    expect(waited.ball.state).toBe('held');
    expect(waited.racket.open).toBe(false);
    expect(waited.scores).toEqual({ A: 0, B: 0 });
    await shot(page, `bounce-waits-${name}`);
    await steerHand(page);
    await expectSoon(async () => (await rally(page)).hits.A).toBe(1);
    await stopHand(page);
  });
}

test('on Gentle a child who tries and misses never loses a point: the ball floats back up and waits for them', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, { bounceHard: 'gentle' });
  await steerHand(page, { target: 'dodge' });
  await expectSoon(async () => (await rally(page)).ball.state, { timeout: 60_000 }).toBe('waiting');
  const waiting = await rally(page);
  expect(waiting.ball.side).toBe('A');
  expect(waiting.scores.B).toBe(0);
  await shot(page, 'bounce-gentle-waits');
  await page.waitForTimeout(20_000);
  expect((await rally(page)).scores.B).toBe(0);
  await stopHand(page);
});

test('on Medium a child who tries and misses gives the computer the point, and one who rests never does', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, { bounceHard: 'medium' });
  await steerHand(page, { target: 'dodge' });
  await expectSoon(async () => (await rally(page)).scores.B, { timeout: 90_000 }).toBeGreaterThanOrEqual(1);
  await expect(page.locator('.score-player:not(.is-mine) .score-value')).toHaveText(/^[1-9]/);
  await stopHand(page);
  // Resting: a closed hand, the whole time the ball is coming. It waits.
  const before = (await rally(page)).scores.B;
  await page.evaluate(() => {
    window.__rest = setInterval(() => {
      const { rally: game } = window.__game;
      // A hand that rests is closed: open only for its own serve, to start each point.
      const serve = game.ball.state !== 'flying' && game.ball.side === 'A';
      window.__camera.show({ left: null, right: serve ? 'open' : 'fist', scale: 0.7 });
    }, 100);
  });
  await expectSoon(async () => (await rally(page)).ball.state, { timeout: 90_000 }).toBe('waiting');
  expect((await rally(page)).scores.B).toBe(before);
  await page.evaluate(() => clearInterval(window.__rest));
});

test('the first to the points chosen wins, and the finish card has the score, the hits and the next level', async ({ page }) => {
  test.setTimeout(300_000);
  await startPlaying(page, { bouncePoints: 5 });
  await page.evaluate(() => {
    window.__game.rally.scores.A = 4;
  });
  await steerHand(page);
  await waitForScreen(page, 'finish');
  await stopHand(page);
  const done = await rally(page);
  expect(done.winner).toBe('A');
  expect(done.scores.A).toBe(5);
  await expect(page.locator('#screen-finish h2')).toHaveText('You won!');
  await expect(page.locator('#finish-score')).toHaveText(`5 : ${done.scores.B}`);
  await expect(page.locator('#finish-hero')).toHaveText(String(done.hits.A));
  await expect(page.locator('#sum-right-points')).toHaveText('5');
  await expect(page.locator('#sum-right-rally')).toHaveText(String(done.longest));
  await expect(page.locator('#level-done-text')).toHaveText('Level 1 done! Next: level 2');
  await expect(page.locator('#level-next-new')).toContainText('Stars to catch');
  await expect(page.locator('#play-again')).toHaveText('Next level');
  await page.waitForTimeout(700);
  await shot(page, 'bounce-finish');
  expect(await page.evaluate(() => window.__game.session.levels.current)).toBe(2);
});

test('a game lost on Medium is "So close!", and the same level comes round again', async ({ page }) => {
  test.setTimeout(300_000);
  await startPlaying(page, { bounceHard: 'medium', levels: { [GAME]: 3 } });
  await page.evaluate(() => {
    window.__game.rally.scores.B = 4;
  });
  await steerHand(page, { target: 'dodge' });
  await waitForScreen(page, 'finish');
  await stopHand(page);
  await expect(page.locator('#screen-finish h2')).toHaveText('So close!');
  await expect(page.locator('#level-done-text')).toHaveText('Let’s try level 3 again!');
  // The computer's player won this one, and the big button is Try again, with no confetti.
  const them = await page.evaluate(() => window.__game.game.opponent.name);
  await expect(page.locator('#finish-lost')).toHaveText(new RegExp(`^${them} won this one, 5 to \\d+\\. Have another go!$`));
  await expect(page.locator('#play-again')).toHaveText('Try again');
  await expect.poll(() => page.evaluate(() => window.__game.session.hud.confetti.running)).toBe(false);
  // Nothing is cheered, and the voice says what it says after any game that was lost and has no line of its own.
  expect(await page.evaluate(() => window.__game.sound.finished)).toEqual({ line: 'So close! Try again!', lost: true });
  expect(await page.evaluate(() => window.__game.session.levels.current)).toBe(3);
  await page.waitForTimeout(500);
  await shot(page, 'bounce-so-close');
  // Trying again is the same level, and a game won after it has no word of losing.
  await show(page, ...OPEN);
  await page.locator('#play-again').click();
  await waitForScreen(page, 'playing');
  expect(await page.evaluate(() => window.__game.rally.level)).toBe(3);
  await expect(page.locator('#finish-lost')).toBeHidden();
});

test('the child is asked to open their hand only when the ball is theirs to hit, and told that resting is fine', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page);
  // An open hand up at the back: the ball floats over to it, and meanwhile a written hint says what to do.
  await steerHand(page, { target: { u: -1.05, h: 0.85 } });
  await expect(prompt(page)).toHaveText('Hit the ball with your open hand!');
  await expectSoon(async () => (await rally(page)).hits.A).toBe(1);
  await stopHand(page);
  // The ball comes back to a closed hand, and waits: then it's time to open it.
  await show(page, ...FIST);
  await expectSoon(async () => (await rally(page)).ball.state, { timeout: 60_000 }).toBe('waiting');
  await expect(prompt(page)).toHaveText('Open your right hand!');
  await page.evaluate(() => {
    window.__game.game.restFor = 20;
  });
  await expect(prompt(page)).toHaveText('Resting is OK. Open your hand when you’re ready.');
  await shot(page, 'bounce-resting');
});

test('with the left hand, the child plays on the left half, and the mirror and the meter move with them', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, { hands: 'left' });
  const state = await rally(page);
  expect(state.flip).toBe(1);
  expect(await page.evaluate(() => document.body.dataset.side)).toBe('left');
  await expect(page.locator('#score-left')).toHaveClass(/is-mine/);
  const { width } = page.viewportSize();
  const camera = await page.locator('#camera-frame').boundingBox();
  expect(camera.x).toBeGreaterThan(width / 2);
  const meter = await page.locator('#meter-left').boundingBox();
  expect(meter.x).toBeLessThan(width / 4);
  await steerHand(page, { side: 'left' });
  await expectSoon(async () => (await rally(page)).hits.A).toBeGreaterThanOrEqual(1);
  const glove = await page.evaluate(() => window.__game.gloves.left.x);
  expect(glove).toBeLessThan(width / 2);
  await shot(page, 'bounce-left-hand');
  await stopHand(page);
});

for (const [width, height] of [[1280, 720], [1024, 768], [1180, 820], [1920, 1080]]) {
  test(`fits ${width}×${height}: the score, the mirror and the gear don't cover each other, and both players are on the screen`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height });
    await startPlaying(page, { levels: { [GAME]: 6 } });
    await steerHand(page);
    await expectSoon(async () => (await rally(page)).hits.A).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(1500);
    const boxes = {};
    for (const id of ['score-board', 'camera-frame', 'open-panel']) boxes[id] = await page.locator(`#${id}`).boundingBox();
    const apart = (a, b) => a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
    expect(apart(boxes['score-board'], boxes['camera-frame'])).toBe(true);
    expect(apart(boxes['score-board'], boxes['open-panel'])).toBe(true);
    expect(apart(boxes['camera-frame'], boxes['open-panel'])).toBe(true);
    const placed = await page.evaluate(() => {
      const { court } = window.__game;
      return ['A', 'B'].map((side) => court.pose(side).feet.x);
    });
    for (const x of placed) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await shot(page, `bounce-${width}x${height}`);
    await stopHand(page);
  });
}

test('on their own, nothing connects anywhere, and the page may only reach the server for friends', async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  const sockets = [];
  const requests = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  page.on('request', (request) => requests.push(request.url()));
  await startPlaying(page);
  await steerHand(page);
  await expectSoon(async () => (await rally(page)).hits.A).toBeGreaterThanOrEqual(1);
  await stopHand(page);
  expect(sockets).toEqual([]);
  expect(requests.filter((url) => !url.startsWith(baseURL) && !url.startsWith('data:') && !url.startsWith('blob:'))).toEqual([]);
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  // Then only Google's, for counting visits, which test/unit/pages.test.js checks on every page.
  expect(policy).toMatch(/connect-src 'self' wss:\/\/hemi-race\.infoicy\.com ws:\/\/localhost:\*[ ;]/);
  expect(policy).toContain("default-src 'self'");
});

test('with reduced motion, the clouds keep still and the ball still plays', async ({ page }) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startPlaying(page);
  expect(await page.evaluate(() => window.__game.court.reducedMotion)).toBe(true);
  const clouds = () => page.evaluate(() => window.__game.court.clouds.map(({ at }) => at));
  const before = await clouds();
  await steerHand(page);
  await expectSoon(async () => (await rally(page)).hits.A).toBeGreaterThanOrEqual(1);
  expect(await clouds()).toEqual(before);
  await stopHand(page);
});

test('the grown-ups\' panel has how hard, the ball speed, reach help, the points and who plays, and a way back', async ({ page }) => {
  await openGame(page, {}, GAME);
  await page.locator('#open-panel').click();
  // Medium is how it comes, so the computer can win: Gentle is the game as it was.
  await expect(page.locator('input[name="bounceHard"][value="medium"]')).toBeChecked();
  await expect(page.locator('input[name="bouncePace"][value="slow"]')).toBeChecked();
  await expect(page.locator('input[name="bounceHelp"][value="little"]')).toBeChecked();
  await expect(page.locator('input[name="bouncePoints"][value="5"]')).toBeChecked();
  await expect(page.locator('input[name="fighter"][value="giraffe"]')).toBeChecked();
  await expect(page.locator('#panel-all-games')).toBeVisible();
  // Who plays is the child's character, there and on the score.
  await page.locator('input[name="fighter"][value="mochi"]').check();
  await page.locator('input[name="bouncePoints"][value="7"]').check();
  await page.locator('#close-panel').click();
  const chosen = await page.evaluate(() => ({ me: window.__game.game.myCharacter().id, them: window.__game.game.opponent.id }));
  expect(chosen.me).toBe('mochi');
  expect(chosen.them).not.toBe('mochi');
  await show(page, ...OPEN);
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
  await expect(page.locator('#score-goal')).toHaveText('First to 7');
});
