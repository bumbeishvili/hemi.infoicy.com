// Playing Giraffe's Maze on their own, with real photos of hands going through the real tracker: an open hand leads
// the character along the paths, a closed or missing one never moves it, resting is never punished, and finding
// every friend ends the game.
import { expect, openGame, show, shot, test, waitForScreen } from '../helpers.js';
import { expectSoon, FIST, GAME, gloveAt, leadHand, NO_HAND, OPEN, startPlaying, state, stopHand } from './helpers.js';

const prompt = (page) => page.locator('#prompt-text');

test('an open hand leads the character along the paths to a lost friend, who follows it into the next maze', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, { mazes: 2 });
  const start = await state(page);
  expect(start.phase).toBe('walking');
  expect(start.index).toBe(0);
  expect(start.lost).toHaveLength(1);
  expect(start.lost[0].who).not.toBe('giraffe');
  // The friend calls out, with their face, and a little film shows what to do.
  await expect(page.locator('#story')).toBeVisible();
  await expect(page.locator('#story-name')).not.toBeEmpty();
  await expect(page.locator('.maze-film')).toBeVisible();
  await expect(page.locator('#maze-found li')).toHaveCount(2);
  await leadHand(page);
  await expectSoon(async () => (await state(page)).walked).toBeGreaterThan(3);
  await expect(page.locator('.maze-film')).toBeHidden();
  await shot(page, 'maze-leading');
  await expectSoon(async () => (await state(page)).found, { timeout: 90_000 }).toBe(1);
  await expect(page.locator('#maze-found li.is-found')).toHaveCount(1);
  expect((await state(page)).fruit).toBeGreaterThan(0);
  await expect(page.locator('#chip-fruit')).not.toHaveText('0');
  await page.waitForTimeout(400);
  await shot(page, 'maze-found-friend');
  // On into the next maze, with the friend found following along behind.
  await expectSoon(async () => (await state(page)).index).toBe(1);
  const next = await state(page);
  // In at the way in on the left, and already on its way again.
  expect(next.at.x).toBeLessThan(2);
  expect(await page.evaluate(() => window.__game.run.followers.length)).toBe(1);
  await page.waitForTimeout(1500);
  await shot(page, 'maze-second-maze');
  // And finding the last friend is the end of the game.
  await waitForScreen(page, 'finish');
  await stopHand(page);
  const done = await state(page);
  expect(done.found).toBe(2);
  await expect(page.locator('#screen-finish h2')).toHaveText('Everyone is found!');
  await expect(page.locator('#finish-hero')).toHaveText(String(done.fruit));
  await expect(page.locator('#finish-found img')).toHaveCount(2);
  await expect(page.locator('#sum-right-found')).toHaveText('2');
  await expect(page.locator('#level-done-text')).toHaveText('Level 1 done! Next: level 2');
  await expect(page.locator('#level-next-new')).toContainText('Butterflies to catch');
  await expect(page.locator('#play-again')).toHaveText('Next level');
  await page.waitForTimeout(700);
  await shot(page, 'maze-finish');
  expect(await page.evaluate(() => window.__game.session.levels.current)).toBe(2);
});

for (const [name, scene] of [['closed', FIST], ['missing', NO_HAND]]) {
  test(`a ${name} hand never moves the character: it waits, for as long as it takes, and nothing is lost`, async ({ page }) => {
    test.setTimeout(180_000);
    await startPlaying(page, { levels: { [GAME]: 4 } });
    await show(page, ...scene);
    await page.waitForTimeout(1000);
    const before = await state(page);
    await page.waitForTimeout(8000);
    const after = await state(page);
    expect(after.at).toEqual(before.at);
    expect(after.walked).toBe(before.walked);
    expect(after.phase).toBe('walking');
    expect(after.items.filter(({ gone }) => !gone)).toHaveLength(before.items.filter(({ gone }) => !gone).length);
    await expect(prompt(page)).toHaveText(name === 'closed' ? 'Open your right hand!' : /Show your right hand!|Hold your hand up closer to the camera/);
    await shot(page, `maze-waits-${name}`);
    // And then the hand opens, and off it goes.
    await leadHand(page);
    await expectSoon(async () => (await state(page)).walked).toBeGreaterThan(1);
    await stopHand(page);
  });
}

test('a hand resting closed for a while is told resting is fine, and the character is still there waiting', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page);
  await show(page, ...FIST);
  await expect(prompt(page)).toHaveText('Open your right hand!', { timeout: 20_000 });
  const before = await state(page);
  await page.evaluate(() => {
    window.__game.game.restFor = 20;
  });
  await expect(prompt(page)).toHaveText('Resting is OK. Open your hand when you’re ready.');
  await shot(page, 'maze-resting');
  const after = await state(page);
  expect(after.walked).toBe(before.walked);
  expect(after.at).toEqual(before.at);
});

test('at the start, the friend calls out and a hint says to lead the way, and both go once the character walks', async ({ page }) => {
  test.setTimeout(180_000);
  await openGame(page, { mazeReach: 'lots', voice: true }, GAME);
  // The hand over on the left, by the way in, and then held on the character, so it doesn't set off yet.
  await show(page, null, 'open', { scale: 0.62, rightOffsetX: -560, rightOffsetY: 30 });
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
  await page.evaluate(() => {
    window.__lead = { x: -560, y: 30, stop() {} };
  });
  await leadHand(page, { target: '(game) => game.run.position', gain: 0.2 });
  // After "Go!", the friend's call is said, and the hint waits for it to finish, rather than cutting it off.
  const voices = page.evaluate(() => new Promise((done) => {
    const heard = [];
    const timer = setInterval(() => {
      const text = window.__game.sound.currentVoice?.text;
      if (text && heard.at(-1) !== text) heard.push(text);
      if (heard.length >= 3) {
        clearInterval(timer);
        done(heard);
      }
    }, 20);
    setTimeout(() => {
      clearInterval(timer);
      done(heard);
    }, 15_000);
  }));
  await expect(prompt(page)).toHaveText('Lead the way with your open hand!', { timeout: 15_000 });
  const heard = await voices;
  expect(heard[0]).toBe('Go!');
  expect(heard[1]).toMatch(/lost|find|here|Which way/i);
  expect(heard[2]).toBe('Lead the way with your open hand!');
  expect((await state(page)).walked).toBeLessThan(2);
  await leadHand(page);
  await expectSoon(async () => (await state(page)).walked).toBeGreaterThan(2.5);
  await expect(prompt(page)).toBeHidden();
  await stopHand(page);
});

test('the character can\'t walk through a hedge: on the other side of one from the hand, it waits, puzzled', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page);
  // The hand held still far over on the right, which can't be got to along the paths from the way in.
  await leadHand(page, { target: '(game) => ({ x: game.run.layout.cols - 0.5, y: game.run.layout.lost[0].y })' });
  // Wherever it is, frame by frame, it's on a path between two cells that are joined.
  const offPath = page.evaluate(() => new Promise((done) => {
    const { run } = window.__game;
    const { maze } = run.layout;
    let off = 0;
    const timer = setInterval(() => {
      const { x, y } = run.position;
      const c = Math.floor(x);
      const r = Math.floor(y);
      const acrossCell = Math.abs(x - c - 0.5) > 1e-6;
      const downCell = Math.abs(y - r - 0.5) > 1e-6;
      if (acrossCell && downCell) off += 1;
      else if (acrossCell) {
        const left = Math.floor(x - 0.5);
        if (!maze.isOpen(maze.id(left, r), 1)) off += 1;
      } else if (downCell) {
        const top = Math.floor(y - 0.5);
        if (!maze.isOpen(maze.id(c, top), 2)) off += 1;
      }
    }, 20);
    setTimeout(() => {
      clearInterval(timer);
      done(off);
    }, 8000);
  }));
  await expectSoon(async () => (await state(page)).stuck, { timeout: 30_000 }).toBe(true);
  expect(await offPath).toBe(0);
  // It has stopped short of the hand, with the hand still open and well away from it: that's what stuck is,
  // and it only ever stops for a hedge. It may have come past the lost friend on its way, if the paths led
  // that way: in some mazes they do, and this test used to say they never did, which failed about three
  // times in eight.
  const stopped = await page.evaluate(() => {
    const { run } = window.__game;
    const { cols, lost } = run.layout;
    return Math.hypot(cols - 0.5 - run.position.x, lost[0].y - run.position.y);
  });
  expect(stopped).toBeGreaterThan(0.6);
  await shot(page, 'maze-puzzled');
  await stopHand(page);
});

test('with the left hand, it plays the same, and the glove follows the left hand', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, { hands: 'left', mazes: 2 });
  await leadHand(page, { side: 'left' });
  await expectSoon(async () => (await state(page)).found, { timeout: 90_000 }).toBe(1);
  expect(await page.evaluate(() => window.__game.gloves.left.visible)).toBe(true);
  expect(await page.evaluate(() => window.__game.gloves.right.visible)).toBe(false);
  await shot(page, 'maze-left-hand');
  await stopHand(page);
});

test('reach help takes the glove further for the same movement of the hand', async ({ page }) => {
  test.setTimeout(180_000);
  await openGame(page, { mazeReach: 'none' }, GAME);
  await show(page, ...OPEN);
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
  const spread = async () => {
    const where = [];
    for (const offset of [-160, 160]) {
      await show(page, null, 'open', { scale: 0.62, rightOffsetX: offset });
      await page.waitForTimeout(900);
      where.push(await gloveAt(page));
    }
    return where[1].x - where[0].x;
  };
  const none = await spread();
  await page.locator('#open-panel').click();
  await page.locator('input[name="mazeReach"][value="lots"]').check();
  await page.locator('#close-panel').click();
  const lots = await spread();
  expect(lots / none).toBeGreaterThan(1.4);
});

test('finding the way: the character finds its own way to the hand, round the corners', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, { mazeWays: 'find', mazes: 2 });
  // The hand held still on the friend, a long way round from the way in.
  await leadHand(page, { target: '(game) => game.run.layout.lost.find((lost) => !lost.found) ?? null' });
  await expectSoon(async () => (await state(page)).found, { timeout: 90_000 }).toBe(1);
  await stopHand(page);
});

for (const [width, height] of [[1280, 720], [1024, 768], [1180, 820], [1920, 1080]]) {
  test(`fits ${width}×${height}: the band at the top holds what's found, the friend's call, the meter and the mirror, all above the maze`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height });
    await startPlaying(page, { levels: { [GAME]: 4 } });
    await page.waitForTimeout(800);
    const boxes = {};
    for (const id of ['camera-frame', 'open-panel', 'story', 'meter-right']) boxes[id] = await page.locator(`#${id}`).boundingBox();
    boxes.hud = await page.locator('.maze-hud').boundingBox();
    const apart = (a, b) => a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
    const names = Object.keys(boxes);
    for (const a of names) for (const b of names) if (a < b) expect(apart(boxes[a], boxes[b]), `${a} and ${b}`).toBe(true);
    const area = await page.evaluate(() => window.__game.view.area);
    for (const name of names) expect(boxes[name].y + boxes[name].height, name).toBeLessThanOrEqual(area.top - 4);
    expect(area.left).toBeGreaterThanOrEqual(0);
    expect(area.left + area.width).toBeLessThanOrEqual(width);
    expect(area.top + area.height).toBeLessThanOrEqual(height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await shot(page, `maze-${width}x${height}`);
  });
}

test('on their own, nothing connects anywhere, and the page may only reach the server for friends', async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  const sockets = [];
  const requests = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  page.on('request', (request) => requests.push(request.url()));
  await startPlaying(page);
  await leadHand(page);
  await expectSoon(async () => (await state(page)).walked).toBeGreaterThan(2);
  await stopHand(page);
  expect(sockets).toEqual([]);
  expect(requests.filter((url) => !url.startsWith(baseURL) && !url.startsWith('data:') && !url.startsWith('blob:'))).toEqual([]);
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  // Then only Google's, for counting visits, which test/unit/pages.test.js checks on every page.
  expect(policy).toMatch(/connect-src 'self' wss:\/\/hemi-race\.infoicy\.com ws:\/\/localhost:\*[ ;]/);
  expect(policy).toContain("default-src 'self'");
});

test('with reduced motion, nothing in the maze bobs, sways or waves by itself, and it all still plays', async ({ page }) => {
  test.setTimeout(240_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startPlaying(page, { mazes: 2 });
  expect(await page.evaluate(() => window.__game.view.reducedMotion)).toBe(true);
  // No hand in the picture, so the character waits: two looks at the maze a moment apart are the same.
  await show(page, ...NO_HAND);
  await page.waitForTimeout(1500);
  const changed = await page.evaluate(async () => {
    const canvas = document.getElementById('game');
    const grab = () => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const first = grab();
    await new Promise((resolve) => setTimeout(resolve, 900));
    const second = grab();
    let differ = 0;
    for (let i = 0; i < first.length; i += 4) if (Math.abs(first[i] - second[i]) + Math.abs(first[i + 1] - second[i + 1]) + Math.abs(first[i + 2] - second[i + 2]) > 6) differ += 1;
    return differ / (first.length / 4);
  });
  expect(changed).toBe(0);
  await leadHand(page);
  await expectSoon(async () => (await state(page)).phase, { timeout: 90_000 }).toBe('sliding');
  await page.waitForTimeout(800);
  await shot(page, 'maze-fade-in');
  await expectSoon(async () => (await state(page)).index).toBe(1);
  await stopHand(page);
});

test('the grown-ups\' panel has how hard, reach help, finding the way, the friends to find and who plays, and a way back', async ({ page }) => {
  await openGame(page, {}, GAME);
  await page.locator('#open-panel').click();
  await expect(page.locator('input[name="mazeSize"][value="medium"]')).toBeChecked();
  await expect(page.locator('input[name="mazeReach"][value="little"]')).toBeChecked();
  await expect(page.locator('input[name="mazeWays"][value="lead"]')).toBeChecked();
  await expect(page.locator('input[name="mazes"][value="3"]')).toBeChecked();
  await expect(page.locator('input[name="fighter"][value="giraffe"]')).toBeChecked();
  await expect(page.locator('#panel-all-games')).toBeVisible();
  await shot(page, 'maze-panel');
  // A smaller maze, a different character and fewer friends start with the next game, and show on the title now.
  await page.locator('input[name="mazeSize"][value="easy"]').check();
  await page.locator('input[name="fighter"][value="mochi"]').check();
  await page.locator('input[name="mazes"][value="2"]').check();
  await page.locator('#close-panel').click();
  const chosen = await page.evaluate(() => ({ me: window.__game.game.myCharacter().id, cast: window.__game.run.cast.flat(), cols: window.__game.run.layout.cols }));
  expect(chosen.me).toBe('mochi');
  expect(chosen.cast).toHaveLength(2);
  expect(chosen.cast).not.toContain('mochi');
  expect(chosen.cols).toBe(5);
  await show(page, ...OPEN);
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
  const playing = await state(page);
  expect([playing.cols, playing.rows, playing.mazes]).toEqual([5, 3, 2]);
  await shot(page, 'maze-easy');
});
