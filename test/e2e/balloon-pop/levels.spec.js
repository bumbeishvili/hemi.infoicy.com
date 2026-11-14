// Balloon Pop's levels: at level 10 there are more balloons, a little faster, star balloons that need the
// open hand held on them for a moment, pairs tied together, a breeze, and more answers in the maths
// challenge. It can still be finished, and nothing flashes. Level 1 is checked by play.spec.js.
import { expect, openGame, shot, show, test, waitForHand, waitForScreen } from './helpers.js';

const GAME = 'balloon-pop';
const AT_10 = { levels: { [GAME]: 10 } };

async function startPlaying(page, settings = {}, scene = [null, 'open']) {
  await openGame(page, { ...AT_10, ...settings }, GAME);
  await show(page, ...scene);
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
}

async function gloveReady(page) {
  await waitForHand(page, 'open');
  await expect.poll(() => page.evaluate(() => window.__game.balloons.gloves.right.visible)).toBe(true);
}

const popped = (page) => page.evaluate(() => window.__game.balloons.total);

test('level 10 has more balloons, a little faster, with star balloons, pairs and a breeze', async ({ page }) => {
  await startPlaying(page, { reach: 'none' });
  await show(page, null, null);
  const plan = await page.evaluate(() => {
    const { balloons, session } = window.__game;
    return { level: session.level, plan: balloons.plan, pace: balloons.pace };
  });
  expect(plan.level).toBe(10);
  expect(plan.plan.stars).toBeGreaterThan(0);
  expect(plan.pace.most).toBe(10);
  expect(plan.pace.rise).toBeCloseTo(0.085 * 1.35, 4);

  // Lets the sky fill by itself, with the hand away, and keeps a note of what came up. It's timed by the
  // game's own clock, so a busy computer can't cut it short, and as which kinds come up is chance, it
  // watches on until a star balloon and a pair have both come, for up to 40 seconds of play.
  const seen = await page.evaluate(async () => {
    const { balloons } = window.__game;
    const kinds = { stars: 0, pairs: 0, plain: 0 };
    const counted = new Set();
    let most = 0;
    let breezeLeast = Infinity;
    let breezeMost = -Infinity;
    const end = balloons.time + 14;
    const longest = balloons.time + 40;
    while (balloons.time < end || ((!kinds.stars || !kinds.pairs) && balloons.time < longest)) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      most = Math.max(most, balloons.balloons.length);
      breezeLeast = Math.min(breezeLeast, balloons.breezeAt);
      breezeMost = Math.max(breezeMost, balloons.breezeAt);
      for (const balloon of balloons.balloons) {
        if (counted.has(balloon)) continue;
        counted.add(balloon);
        if (balloon.star) kinds.stars += 1;
        else if (balloon.tie) kinds.pairs += 1;
        else kinds.plain += 1;
      }
    }
    return { kinds, most, breeze: (breezeMost - breezeLeast) / balloons.width };
  });
  console.log('level 10 sky', JSON.stringify(seen));
  expect(seen.kinds.stars).toBeGreaterThan(0);
  expect(seen.kinds.pairs).toBeGreaterThan(0);
  expect(seen.most).toBeGreaterThan(7);
  expect(seen.most).toBeLessThanOrEqual(10);
  expect(seen.breeze).toBeGreaterThan(0.02);
  // Make sure the picture shows a pair and a star balloon, in the hand's reach.
  await page.evaluate(() => {
    const { balloons } = window.__game;
    balloons.addPair(balloons.width * 0.5, balloons.height * 0.62);
    const star = balloons.addBalloon({ x: balloons.width * 0.78, y: balloons.height * 0.45, star: true });
    star.choosing = 0.2;
  });
  await page.waitForTimeout(400);
  await shot(page, 'balloon-pop-level10-sky');
});

test('a star balloon only pops once the open hand has stayed on it a moment', async ({ page }) => {
  await startPlaying(page, { reach: 'none' });
  await gloveReady(page);
  // Timed by the game's own clock, from the moment it's on the hand, so a busy computer can't fool it.
  const held = await page.evaluate(() => new Promise((resolve) => {
    const { balloons } = window.__game;
    // From nothing, with no more coming, as the open hand may have popped a few while it was being found.
    balloons.balloons = [];
    balloons.spawnTimer = 999;
    balloons.resetCounts();
    const glove = balloons.gloves.right;
    const star = balloons.addBalloon({ x: glove.x, y: glove.y, still: true, star: true });
    window.__star = star;
    const from = balloons.time;
    let ringSeen = false;
    const watch = () => {
      if (star.choosing > 0) ringSeen = true;
      if (balloons.total > 0) {
        resolve({ after: balloons.time - from, ringSeen, total: balloons.total });
        return;
      }
      if (balloons.time - from > 10) {
        resolve({ after: Infinity, ringSeen, total: balloons.total });
        return;
      }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  }));
  expect(held.ringSeen).toBe(true);
  expect(held.total).toBe(1);
  expect(held.after).toBeGreaterThanOrEqual(0.3);
  expect(held.after).toBeLessThan(3);
  await page.evaluate(() => {
    const { balloons } = window.__game;
    const glove = balloons.gloves.right;
    balloons.addBalloon({ x: glove.x, y: glove.y, still: true, star: true });
  });
  await page.waitForTimeout(150);
  await shot(page, 'balloon-pop-level10-star-held');
  await page.evaluate(() => {
    const { balloons } = window.__game;
    balloons.balloons = [];
    balloons.resetCounts();
  });

  // A fist on one only bumps it, and the ring goes back down.
  await show(page, null, 'fist');
  await waitForHand(page, 'closed');
  await page.evaluate(() => {
    const { balloons } = window.__game;
    const glove = balloons.gloves.right;
    window.__star = balloons.addBalloon({ x: glove.x, y: glove.y, still: true, star: true });
  });
  await page.waitForTimeout(900);
  expect(await popped(page)).toBe(0);
  expect(await page.evaluate(() => window.__star.choosing)).toBe(0);
});

test('a pair goes up together, and the other one floats on when one pops', async ({ page }) => {
  await startPlaying(page, { reach: 'none' });
  await gloveReady(page);
  const result = await page.evaluate(async () => {
    const { balloons } = window.__game;
    balloons.balloons = [];
    const glove = balloons.gloves.right;
    const tie = balloons.addPair(glove.x, balloons.height + 200);
    const [first, second] = tie.members;
    const together = first.pace === second.pace && first.sway === second.sway;
    // The first one comes to the hand.
    Object.assign(first, { homeX: glove.x, x: glove.x, y: glove.y, still: true, pace: 0, sway: 0 });
    const end = performance.now() + 3000;
    while (balloons.total === 0 && performance.now() < end) await new Promise((resolve) => requestAnimationFrame(resolve));
    return { together, total: balloons.total, left: tie.members.length, stillUp: balloons.balloons.includes(second) };
  });
  expect(result).toEqual({ together: true, total: 1, left: 1, stillUp: true });
});

test('with reduced motion the breeze is gentler, and the balloons still go up', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startPlaying(page, { reach: 'none' });
  await show(page, null, null);
  const most = await page.evaluate(async () => {
    const { balloons } = window.__game;
    let biggest = 0;
    const end = performance.now() + 6000;
    while (performance.now() < end) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      biggest = Math.max(biggest, Math.abs(balloons.breezeAt) / balloons.width);
    }
    return biggest;
  });
  expect(most).toBeLessThanOrEqual(0.045 * 0.4 + 1e-6);
  expect(await page.evaluate(() => window.__game.balloons.balloons.length)).toBeGreaterThan(0);
});

test('level 10 can be finished, and says all ten levels are done', async ({ page }) => {
  await startPlaying(page, { reach: 'none' });
  await gloveReady(page);
  await page.evaluate(() => window.__game.balloons.configure({ goal: 3 }));
  for (let i = 1; i <= 3; i += 1) {
    await page.evaluate(() => {
      const { balloons } = window.__game;
      const glove = balloons.gloves.right;
      balloons.addBalloon({ x: glove.x, y: glove.y, still: true, star: true });
    });
    if (i < 3) await expect.poll(() => popped(page), { timeout: 4000 }).toBe(i);
  }
  await waitForScreen(page, 'finish');
  await expect(page.locator('#level-done-text')).toHaveText('All 10 levels done!');
  await page.waitForTimeout(700);
  await shot(page, 'balloon-pop-level10-finish');
});

test('the maths challenge at level 10 has more answers to choose from, and the right one still pops', async ({ page }) => {
  await startPlaying(page, { maths: 'add', reach: 'none' });
  // The hand out of the picture while they come up, so that none of them starts out under it.
  await show(page, null, null);
  const waiting = () => page.evaluate(() => {
    const { balloons, question } = window.__game;
    const numbered = balloons.balloons.filter(({ number, leaving }) => number !== undefined && !leaving);
    return Boolean(question) && numbered.length > 0 && numbered.every(({ arrived, ready }) => arrived && ready) ? numbered.length : 0;
  });
  await expect.poll(waiting, { timeout: 30_000 }).toBe(5);
  // No two of them overlap.
  const closest = await page.evaluate(() => {
    const numbered = window.__game.balloons.balloons.filter(({ number, leaving }) => number !== undefined && !leaving);
    let least = Infinity;
    for (const a of numbered) for (const b of numbered) if (a !== b) least = Math.min(least, Math.hypot(a.x - b.x, a.hoverY - b.hoverY) / (a.r + b.r));
    return least;
  });
  expect(closest).toBeGreaterThan(1);
  await shot(page, 'balloon-pop-level10-maths');
  await show(page, null, 'open', { rightOffsetX: -300, rightOffsetY: 150 });
  await gloveReady(page);
  await page.evaluate(() => {
    const { balloons, question } = window.__game;
    const glove = balloons.gloves.right;
    for (const balloon of balloons.balloons) {
      if (balloon.number === undefined || balloon.leaving) continue;
      const right = balloon.number === question.answer;
      const spot = right ? { x: glove.x, y: glove.y } : { x: balloons.width * 0.5, y: balloons.height * 0.15 };
      Object.assign(balloon, { homeX: spot.x, x: spot.x, hoverY: spot.y, y: spot.y, push: 0, pushSpeed: 0 });
    }
  });
  await expect.poll(() => popped(page), { timeout: 5000 }).toBe(1);
});

/* ---------- nothing flashes, at level 1 or level 10 ---------- */

/**
 * Reads how bright the picture is, overall and in each part, while balloons come up and get popped. With
 * extras, the new things are on the screen too: power-ups one after another, prizes falling and caught,
 * friends' baskets, rainbow balloons' spreading pops and big balloons popping into three.
 */
function watchPicture(page, seconds, extras = false) {
  return page.evaluate(async ({ length, more }) => {
    const { balloons } = window.__game;
    const small = document.createElement('canvas');
    const across = 16;
    const down = 9;
    small.width = across;
    small.height = down;
    const context = small.getContext('2d', { willReadFrequently: true });
    const whole = [];
    const parts = Array.from({ length: across * down }, () => []);
    const started = performance.now();
    let frame = 0;
    let pops = 0;
    const before = balloons.total;
    while (performance.now() - started < length * 1000) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      frame += 1;
      // A balloon on the hand every so often, a star one now and then, so pops keep happening.
      const glove = balloons.gloves.right;
      if (frame % 12 === 0) {
        const kinds = more ? [null, 'present', 'rainbow', 'big'] : [null];
        balloons.addBalloon({ x: glove.x, y: glove.y, still: true, star: frame % 36 === 0, kind: kinds[(frame / 12) % kinds.length] });
      }
      if (more) {
        if (!balloons.power) balloons.startPower(['bubble', 'magnet', 'bird'][Math.floor(frame / 120) % 3], glove);
        if (frame % 20 === 0) balloons.dropPrize(['star', 'gem', 'heart'][(frame / 20) % 3], glove.x - balloons.height * 0.3, glove.y - balloons.height * 0.2);
        if (!balloons.baskets.length) balloons.addBasket(balloons.width * 0.55, balloons.height * 0.9);
        // Balloons all round the hand, for rainbows to spread to and the bluebird to pop.
        if (frame % 6 === 0) balloons.addBalloon({ x: glove.x + (Math.random() - 0.5) * balloons.height * 0.5, y: glove.y + (Math.random() - 0.5) * balloons.height * 0.4 });
      }
      context.drawImage(balloons.canvas, 0, 0, across, down);
      const { data } = context.getImageData(0, 0, across, down);
      let total = 0;
      for (let cell = 0; cell < across * down; cell += 1) {
        const value = (data[cell * 4] + data[cell * 4 + 1] + data[cell * 4 + 2]) / 3;
        total += value;
        parts[cell].push(value);
      }
      whole.push(total / (across * down));
    }
    pops = balloons.total - before;
    return { whole, parts, seconds: (performance.now() - started) / 1000, pops, prizes: balloons.prizeTotal };
  }, { length: seconds, more: extras });
}

const biggestStep = (values) => Math.max(...values.slice(1).map((value, index) => Math.abs(value - values[index])));

/** A quarter or more of the picture getting brighter or darker by a tenth, and back: the most in a second. */
function mostFlashesInASecond(parts, seconds) {
  const frames = parts[0].length;
  const perSecond = frames / seconds;
  const span = Math.max(2, Math.round(perSecond * 0.1));
  const turns = [];
  let direction = 0;
  for (let frame = span; frame < frames; frame += 1) {
    let brighter = 0;
    let darker = 0;
    for (const values of parts) {
      const change = values[frame] - values[frame - span];
      if (change >= 25.5) brighter += 1;
      else if (change <= -25.5) darker += 1;
    }
    const now = brighter >= parts.length / 4 ? 1 : darker >= parts.length / 4 ? -1 : 0;
    if (now && now !== direction) {
      direction = now;
      turns.push(frame);
    }
  }
  let most = 0;
  turns.forEach((from, index) => {
    const within = turns.slice(index).filter((frame) => frame - from < perSecond).length;
    most = Math.max(most, Math.floor(within / 2));
  });
  return most;
}

for (const level of [1, 6, 10]) {
  test(`at level ${level}, the picture's brightness stays steady through lots of pops${level > 1 ? ', prizes and power-ups' : ''}`, async ({ page }) => {
    await openGame(page, { levels: { [GAME]: level }, reach: 'little', balloons: 60 }, GAME);
    await show(page, null, 'open');
    await page.locator('#start').click();
    await waitForScreen(page, 'playing');
    await gloveReady(page);
    // So that the whole time is play, however many pop.
    await page.evaluate(() => window.__game.balloons.configure({ goal: 1000 }));
    const { whole, parts, seconds, pops, prizes } = await watchPicture(page, 8, level > 1);
    const step = biggestStep(whole);
    const flashes = mostFlashesInASecond(parts, seconds);
    console.log(`level ${level}: pops ${pops}, prizes ${prizes}, biggest brightness step ${step.toFixed(2)}, most flashes in a second ${flashes}`);
    expect(pops).toBeGreaterThan(10);
    if (level > 1) expect(prizes).toBeGreaterThan(5);
    expect(step).toBeLessThan(5);
    expect(flashes).toBe(0);
    if (level > 1) await shot(page, `balloon-pop-level${level}-busy`);
  });
}

test('at level 10, with everything on the screen at once, it still runs smoothly', async ({ page }) => {
  await openGame(page, { levels: { [GAME]: 10 }, reach: 'little', balloons: 60 }, GAME);
  await show(page, null, 'open');
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
  await gloveReady(page);
  const frames = await page.evaluate(async () => {
    const { balloons } = window.__game;
    const glove = balloons.gloves.right;
    balloons.startPower('bird', glove);
    balloons.addBasket(balloons.width * 0.5, balloons.height * 0.8);
    for (let i = 0; i < 8; i += 1) balloons.dropPrize('star', balloons.width * (0.2 + i * 0.08), balloons.height * 0.2);
    const times = [];
    let last = performance.now();
    const end = last + 4000;
    while (performance.now() < end) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const now = performance.now();
      times.push(now - last);
      last = now;
    }
    times.sort((a, b) => a - b);
    return { median: times[Math.floor(times.length / 2)], count: times.length };
  });
  console.log('level 10 busy frames', JSON.stringify(frames));
  // At least about 30 frames a second, with everything going at once.
  expect(frames.median).toBeLessThan(34);
});
