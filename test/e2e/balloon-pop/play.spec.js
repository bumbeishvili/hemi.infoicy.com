// Balloon Pop, with real photos going through the real tracker. Balloons are placed exactly
// where the hand is, so each test is about one rule rather than waiting for chance.
import {
  expect,
  hands,
  openGame,
  screenName,
  shot,
  show,
  test,
  waitForHand,
  waitForScreen,
} from './helpers.js';

const GAME = 'balloon-pop';

async function startPlaying(page, settings = {}, scene = [null, 'open']) {
  await openGame(page, settings, GAME);
  await show(page, ...scene);
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
}

/** Puts a balloon that doesn't move right where the hand's glove is. */
function balloonOnHand(page, side = 'right') {
  return page.evaluate((which) => {
    const { balloons } = window.__game;
    const glove = balloons.gloves[which];
    balloons.spawnAt(glove.x, glove.y, { still: true });
  }, side);
}

const popped = (page) => page.evaluate(() => ({ ...window.__game.balloons.popped }));
const prompt = (page) => page.locator('#prompt');

async function gloveReady(page, side = 'right') {
  await expect.poll(() => page.evaluate((which) => window.__game.balloons.gloves[which].visible, side)).toBe(true);
}

test('the right hand is the default, with one glove and one meter', async ({ page }) => {
  await startPlaying(page);
  await waitForHand(page, 'open');
  await gloveReady(page);
  expect(await page.evaluate(() => window.__game.balloons.gloves.left.visible)).toBe(false);
  await expect(page.locator('#meter-right')).toBeVisible();
  await expect(page.locator('#meter-left')).toBeHidden();
  await page.waitForTimeout(300);
  await shot(page, 'b6-right-hand');
});

test('an open hand pops a balloon', async ({ page }) => {
  await startPlaying(page);
  await waitForHand(page, 'open');
  await gloveReady(page);

  await balloonOnHand(page);
  await expect.poll(() => popped(page).then(({ right }) => right), { timeout: 5000 }).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(150);
  await shot(page, 'b1-pop');
  await expect(page.locator('#chip-popped')).toContainText(String((await popped(page)).right));
});

test('a fist bumps a balloon instead of popping it, and is asked to open', async ({ page }) => {
  await startPlaying(page, { reach: 'none' }, [null, 'fist']);
  await waitForHand(page, 'closed');
  await gloveReady(page);
  await page.waitForTimeout(400);
  await shot(page, 'b2-fist-glove');

  const before = (await popped(page)).right;
  await balloonOnHand(page);
  await expect(prompt(page)).toHaveText(/Open your right hand to pop it!/, { timeout: 5000 });
  await shot(page, 'b3-fist-bump');
  await page.waitForTimeout(800);
  expect((await popped(page)).right).toBe(before);

  // The same hand opening pops it. The bump has moved the balloon, so bring it back.
  await show(page, null, 'open');
  await waitForHand(page, 'open');
  await balloonOnHand(page);
  await expect.poll(() => popped(page).then(({ right }) => right), { timeout: 5000 }).toBeGreaterThan(before);
});

test('no pose but an open hand pops a balloon', async ({ page }) => {
  await startPlaying(page, { reach: 'none' });
  await waitForHand(page, 'open');

  for (const pose of ['fist', 'pointing', 'victory', 'thumbs-up']) {
    await test.step(pose, async () => {
      await show(page, null, pose);
      await waitForHand(page, 'closed');
      const before = await popped(page);
      await balloonOnHand(page);
      await page.waitForTimeout(700);
      expect(await popped(page)).toEqual(before);
      await page.evaluate(() => {
        window.__game.balloons.balloons = [];
      });
    });
  }
});

test('the other hand can\'t pop anything, even when it is open', async ({ page }) => {
  await startPlaying(page, { reach: 'none' }, ['open', 'open']);
  await waitForHand(page, 'open');
  await gloveReady(page);

  // A balloon where the other hand is stays put.
  const before = await popped(page);
  await page.evaluate(() => {
    const { balloons } = window.__game;
    balloons.spawnAt(balloons.width * 0.26, balloons.height * 0.5, { still: true });
  });
  await page.waitForTimeout(700);
  expect(await popped(page)).toEqual(before);

  await balloonOnHand(page);
  await expect.poll(() => popped(page).then(({ right }) => right), { timeout: 5000 }).toBeGreaterThan(before.right);
});

test('the left hand plays when it is chosen, and the right can\'t', async ({ page }) => {
  await startPlaying(page, { hands: 'left', reach: 'none' }, ['open', 'open']);
  await waitForHand(page, 'open', 'left');
  await gloveReady(page, 'left');
  expect(await page.evaluate(() => window.__game.balloons.gloves.right.visible)).toBe(false);
  await expect(page.locator('#meter-left')).toBeVisible();
  await expect(page.locator('#meter-right')).toBeHidden();

  await balloonOnHand(page, 'left');
  await expect.poll(() => popped(page).then(({ left }) => left), { timeout: 5000 }).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(200);
  await shot(page, 'b9-left-hand');
  expect((await popped(page)).right).toBe(0);
});

test('a closed hand nowhere near a balloon is not nagged', async ({ page }) => {
  await startPlaying(page, { reach: 'none' });
  await waitForHand(page, 'open');
  await show(page, null, 'fist');
  await waitForHand(page, 'closed');
  await page.evaluate(() => {
    window.__game.balloons.balloons = [];
  });
  await page.waitForTimeout(1200);
  await expect(prompt(page)).not.toHaveText(/Open your right hand/);
});

test('a missing hand is asked for', async ({ page }) => {
  await startPlaying(page);
  await waitForHand(page, 'open');
  await show(page, null, null);
  await waitForHand(page, 'missing');
  await expect(prompt(page)).toHaveText(/Show your right hand!/);
  await expect.poll(() => page.evaluate(() => window.__game.balloons.gloves.right.visible)).toBe(false);
});

test('the glove follows the hand, as a mirror', async ({ page }) => {
  await startPlaying(page);
  await waitForHand(page, 'open');
  await gloveReady(page);
  const where = () => page.evaluate(() => {
    const { x, y } = window.__game.balloons.gloves.right;
    return { x, y };
  });
  const start = await where();
  expect(start.x).toBeGreaterThan(640);

  // Towards the left of the mirror, and up.
  await show(page, null, 'open', { rightOffsetX: -150, rightOffsetY: -90 });
  await expect.poll(async () => (await where()).x).toBeLessThan(start.x - 80);
  await expect.poll(async () => (await where()).y).toBeLessThan(start.y - 40);
});

test('balloons appear by themselves and float up', async ({ page }) => {
  await startPlaying(page, { reach: 'none' });
  await show(page, null, null);
  await expect.poll(() => page.evaluate(() => window.__game.balloons.balloons.length), { timeout: 10_000 }).toBeGreaterThan(0);
  const heights = () => page.evaluate(() => window.__game.balloons.balloons.map(({ y }) => y));
  const [first] = await heights();
  await page.waitForTimeout(800);
  const [later] = await heights();
  expect(later).toBeLessThan(first);
  await page.waitForTimeout(3500);
  await shot(page, 'b4-balloons-rising');
  expect(await screenName(page)).toBe('playing');
});

test('balloons come up across the hand\'s reach, not out of it', async ({ page }) => {
  await startPlaying(page, { pace: 'fast' });
  const spots = await page.evaluate(() => {
    const { balloons } = window.__game;
    const seen = [];
    for (let i = 0; i < 60; i += 1) {
      balloons.balloons = [];
      balloons.spawn();
      seen.push(balloons.balloons[0].homeX / balloons.width);
    }
    return seen;
  });
  expect(Math.min(...spots)).toBeGreaterThanOrEqual(0.34);
  expect(Math.max(...spots)).toBeLessThanOrEqual(0.9);
});

test('reaching the goal ends the game with the hand\'s numbers, and it can be replayed', async ({ page }) => {
  await startPlaying(page);
  await page.evaluate(() => window.__game.balloons.configure({ goal: 2 }));
  await waitForHand(page, 'open');
  await gloveReady(page);
  await expect(page.locator('#chip-popped')).toHaveText(/of/);

  await balloonOnHand(page);
  await expect.poll(() => popped(page).then(({ right }) => right), { timeout: 5000 }).toBeGreaterThanOrEqual(1);
  await balloonOnHand(page);

  await waitForScreen(page, 'finish');
  await expect(page.locator('#screen-finish h2')).toHaveText('You popped them all!');
  await page.waitForTimeout(900);
  await shot(page, 'b5-finish');
  const total = Number(await page.locator('#finish-hero').textContent());
  expect(total).toBeGreaterThanOrEqual(2);
  expect(Number(await page.locator('#sum-right-popped').textContent())).toBe(total);
  await expect(page.locator('.summary thead th', { hasText: 'Left hand' })).toBeHidden();
  await expect(page.locator('#finish-open')).toContainText('Right hand open for');
  expect(await page.evaluate(() => window.__camera.activeTracks)).toBe(0);

  await page.locator('#play-again').click();
  await waitForScreen(page, 'countdown');
  expect(await page.evaluate(() => window.__game.balloons.total)).toBe(0);
  await waitForScreen(page, 'playing');
});

test('prompts appear in Georgian, and the pop sound loads', async ({ page }) => {
  await startPlaying(page, { language: 'ka', voice: true, sound: true, reach: 'none' }, [null, 'fist']);
  await waitForHand(page, 'closed');
  await gloveReady(page);
  await balloonOnHand(page);
  await expect(prompt(page)).toHaveText(/გაშალე მარჯვენა ხელი, რომ გახეთქო!/, { timeout: 5000 });
  await shot(page, 'b7-georgian');

  const pop = await page.evaluate(() => window.__game.sound.buffers.get('pop')?.duration);
  expect(pop).toBeGreaterThan(0.2);
});

test('sound never clips with pops and voice together, and panel settings stick', async ({ page }) => {
  await startPlaying(page, { voice: true, sound: true });
  await waitForHand(page, 'open');
  await gloveReady(page);
  await page.evaluate(() => {
    const { sound } = window.__game;
    window.__tap = sound.context.createAnalyser();
    window.__tap.fftSize = 2048;
    sound.output.connect(window.__tap);
    window.__peak = 0;
    const samples = new Float32Array(2048);
    setInterval(() => {
      window.__tap.getFloatTimeDomainData(samples);
      for (const sample of samples) window.__peak = Math.max(window.__peak, Math.abs(sample));
    }, 15);
  });
  for (let i = 0; i < 8; i += 1) {
    await balloonOnHand(page);
    await page.waitForTimeout(120);
  }
  const peak = await page.evaluate(() => window.__peak);
  console.log('peak with pops', peak);
  expect(peak).toBeGreaterThan(0.05);
  expect(peak).toBeLessThanOrEqual(1);

  await page.locator('#open-panel').click();
  await page.locator('input[name="pace"][value="fast"]').check();
  await page.locator('input[name="balloons"][value="40"]').check();
  await shot(page, 'b8-panel');
  await page.locator('#close-panel').click();
  await page.reload();
  await expect(page.locator('#start')).toBeVisible();
  await page.locator('#open-panel').click();
  await expect(page.locator('input[name="pace"][value="fast"]')).toBeChecked();
  await expect(page.locator('input[name="balloons"][value="40"]')).toBeChecked();
});

/* ---------- the maths challenge ---------- */

/** With the hand out of the way of where balloons wait, so that only a test puts one under it. */
async function startMaths(page, settings = {}) {
  await startPlaying(page, { maths: 'add', reach: 'none', ...settings }, [null, 'open']);
  await show(page, null, 'open', { rightOffsetX: -300, rightOffsetY: 150 });
  await waitForHand(page, 'open');
  await gloveReady(page);
  await expect.poll(() => page.evaluate(() => {
    const { balloons, question } = window.__game;
    const numbered = balloons.balloons.filter(({ number, leaving }) => number !== undefined && !leaving);
    return Boolean(question) && numbered.length > 0 && numbered.every(({ arrived, ready }) => arrived && ready);
  }), { timeout: 30_000 }).toBe(true);
}

/** Puts the balloon with the right answer on it, or a wrong one, under the hand. */
const answerWith = (page, which) => page.evaluate((kind) => {
  const { balloons, question } = window.__game;
  const balloon = balloons.balloons.find(({ number, leaving }) => number !== undefined && !leaving
    && (kind === 'right' ? number === question.answer : number !== question.answer));
  const glove = balloons.gloves.right;
  Object.assign(balloon, { homeX: glove.x, x: glove.x, hoverY: glove.y, y: glove.y, push: 0, pushSpeed: 0 });
  return balloon.number;
}, which);

const burnt = (page) => page.evaluate(() => window.__game.balloons.gloves.right.burnt);
const answers = (page) => page.evaluate(() => {
  const { balloons } = window.__game;
  return balloons.balloons.filter(({ number, leaving }) => number !== undefined && !leaving).map(({ number }) => number);
});

test('the maths challenge is off unless a grown-up turns it on', async ({ page }) => {
  await startPlaying(page, { reach: 'none' });
  await expect(page.locator('body')).toHaveAttribute('data-maths', 'off');
  await expect(page.locator('#maths-question')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__game.balloons.balloons.length), { timeout: 10_000 }).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__game.balloons.balloons.every(({ number }) => number === undefined))).toBe(true);
  await expect(page.locator('#chip-popped-label')).toHaveText('Popped');
});

test('a question is asked, with answers on balloons that wait, and the right one pops', async ({ page }) => {
  await startMaths(page);
  const { shown, answer, id } = await page.evaluate(() => window.__game.question);
  expect(id).toMatch(/^add-/);
  await expect(page.locator('#maths-question')).toHaveText(`${shown} = ?`);
  await expect(page.locator('#chip-popped-label')).toHaveText('Right answers');
  await expect(page.locator('#chip-popped')).toHaveText('0 of 10');
  const numbers = await answers(page);
  expect(numbers).toHaveLength(3);
  expect(numbers).toContain(answer);
  await page.waitForTimeout(200);
  await shot(page, 'b10-maths-question');

  // They stay until they're answered, rather than floating away.
  const heights = () => page.evaluate(() => window.__game.balloons.balloons.map(({ y }) => y));
  const before = await heights();
  await page.waitForTimeout(1500);
  (await heights()).forEach((y, index) => expect(Math.abs(y - before[index])).toBeLessThan(30));

  await answerWith(page, 'right');
  await expect.poll(() => popped(page).then(({ right }) => right), { timeout: 5000 }).toBe(1);
  await expect(page.locator('#maths-question')).toHaveText(`${shown} = ${answer} ✓`);
  await expect(page.locator('#chip-popped')).toHaveText('1 of 10');
  await page.waitForTimeout(100);
  await shot(page, 'b11-maths-right');
  // There's a new question straight away, and what was left floats off and can't be popped.
  await expect.poll(() => page.evaluate(() => window.__game.question?.id), { timeout: 3000 }).not.toBe(id);
  await expect(page.locator('#maths-question')).toHaveText(/= \?$/);
  const { answers: waiting } = await page.evaluate(() => window.__game.question);
  expect([...await answers(page)].sort()).toEqual([...waiting].sort());
  expect(await page.evaluate(() => window.__game.balloons.wrong.right)).toBe(0);
});

test('the wrong answer burns the glove, which can\'t pop until it has been held open to cool', async ({ page }) => {
  await startMaths(page);
  const { id } = await page.evaluate(() => window.__game.question);
  const wrongNumber = await answerWith(page, 'wrong');
  await expect.poll(() => burnt(page), { timeout: 5000 }).toBeGreaterThan(0);
  await expect(prompt(page)).toHaveText(/Hold your hand open to cool it down!/);
  await page.waitForTimeout(250);
  await shot(page, 'b12-maths-burnt');
  expect(await answers(page)).not.toContain(wrongNumber);
  expect(await page.evaluate(() => window.__game.balloons.wrong.right)).toBe(1);
  expect((await popped(page)).right).toBe(0);
  expect(await page.evaluate(() => window.__game.question.id)).toBe(id);

  // Burnt, it can't pop even the right one. A real burn is over so soon that this one lasts longer.
  await page.evaluate(() => {
    window.__game.balloons.gloves.right.burnt = 30;
  });
  await answerWith(page, 'right');
  await page.waitForTimeout(700);
  expect((await popped(page)).right).toBe(0);

  // A fist doesn't cool it.
  await show(page, null, 'fist', { rightOffsetX: -300, rightOffsetY: 150 });
  await waitForHand(page, 'closed');
  const closedAt = await burnt(page);
  await page.waitForTimeout(1000);
  expect(await burnt(page)).toBeCloseTo(closedAt, 1);
  await expect(prompt(page)).toHaveText(/Hold your hand open to cool it down!/);

  // Holding it open does, and then the right answer works.
  await page.evaluate(() => {
    window.__game.balloons.gloves.right.burnt = 1;
  });
  await show(page, null, 'open', { rightOffsetX: -300, rightOffsetY: 150 });
  await waitForHand(page, 'open');
  await expect.poll(() => burnt(page), { timeout: 8000 }).toBe(0);
  await expect.poll(() => popped(page).then(({ right }) => right), { timeout: 5000 }).toBe(1);
});

test('an open hand passing over a balloon doesn\'t choose it, as it has to stay for a moment', async ({ page }) => {
  await startMaths(page);
  const wrongNumber = await answerWith(page, 'wrong');
  await page.waitForTimeout(120);
  // On its way past. The balloon is moved rather than the hand, to be exact about the time.
  await page.evaluate(() => {
    const { balloons } = window.__game;
    for (const balloon of balloons.balloons) {
      if (balloon.y > balloons.height * 0.75) Object.assign(balloon, { homeX: balloons.width * 0.5, hoverY: balloons.height * 0.2, y: balloons.height * 0.2 });
    }
  });
  await page.waitForTimeout(800);
  expect(await burnt(page)).toBe(0);
  expect(await answers(page)).toContain(wrongNumber);
});

test('a hand that was already there when a balloon arrived hasn\'t chosen it', async ({ page }) => {
  await startMaths(page);
  await page.evaluate(() => {
    const { balloons, question } = window.__game;
    const balloon = balloons.balloons.find(({ number, leaving }) => number === question.answer && !leaving);
    const glove = balloons.gloves.right;
    Object.assign(balloon, { homeX: glove.x, x: glove.x, hoverY: glove.y, y: glove.y, ready: false });
  });
  await page.waitForTimeout(1200);
  expect((await popped(page)).right).toBe(0);
});

test('a fist can\'t answer: it bumps the balloon and is asked to open', async ({ page }) => {
  await startMaths(page);
  await show(page, null, 'fist', { rightOffsetX: -300, rightOffsetY: 150 });
  await waitForHand(page, 'closed');
  await answerWith(page, 'right');
  await expect(prompt(page)).toHaveText(/Open your right hand to pop it!/, { timeout: 5000 });
  await page.waitForTimeout(600);
  expect((await popped(page)).right).toBe(0);
  expect(await burnt(page)).toBe(0);
});

test('getting all the answers ends the game, with the numbers for a grown-up', async ({ page }) => {
  await startMaths(page, { balloons: 20 });
  await page.evaluate(() => window.__game.balloons.configure({ goal: 2 }));
  await answerWith(page, 'wrong');
  await expect.poll(() => burnt(page), { timeout: 5000 }).toBeGreaterThan(0);
  await expect.poll(() => burnt(page), { timeout: 8000 }).toBe(0);
  await page.waitForTimeout(200);
  await answerWith(page, 'right');
  await expect.poll(() => popped(page).then(({ right }) => right), { timeout: 5000 }).toBe(1);
  await expect.poll(() => page.evaluate(() => {
    const { balloons, question } = window.__game;
    return Boolean(question) && balloons.balloons.filter(({ number, leaving }) => number !== undefined && !leaving).every(({ arrived, ready }) => arrived && ready);
  }), { timeout: 15_000 }).toBe(true);
  await answerWith(page, 'right');
  await waitForScreen(page, 'finish');
  expect(await page.locator('#finish-hero').textContent()).toBe('2');
  await expect(page.locator('#sum-right-wrong')).toHaveText('1');
  await expect(page.locator('#sum-right-wrong')).toBeVisible();
  await page.waitForTimeout(600);
  await shot(page, 'b13-maths-finish');
});

test('the wrong-answers row isn\'t there when the maths challenge is off', async ({ page }) => {
  await startPlaying(page);
  await page.evaluate(() => window.__game.balloons.configure({ goal: 1 }));
  await waitForHand(page, 'open');
  await gloveReady(page);
  await balloonOnHand(page);
  await waitForScreen(page, 'finish');
  await expect(page.locator('#sum-right-wrong')).toBeHidden();
});

test('a grown-up can turn it on and off in the middle of a game', async ({ page }) => {
  await startPlaying(page, { reach: 'none' });
  await page.locator('#open-panel').click();
  await page.locator('input[name="maths"][value="times"]').check();
  await page.locator('#close-panel').click();
  await expect(page.locator('#maths-question')).toHaveText(/^\d+ × \d+ = \?$/, { timeout: 8000 });
  await expect.poll(() => answers(page)).toHaveLength(4);

  await page.locator('#open-panel').click();
  await page.locator('input[name="maths"][value="off"]').check();
  await page.locator('#close-panel').click();
  await expect(page.locator('#maths-question')).toBeHidden();
  expect(await answers(page)).toEqual([]);
  await expect.poll(() => page.evaluate(() => window.__game.balloons.balloons.some(({ number }) => number === undefined)), { timeout: 10_000 }).toBe(true);

  await page.reload();
  await expect(page.locator('#start')).toBeVisible();
  await page.locator('#open-panel').click();
  await expect(page.locator('input[name="maths"][value="off"]')).toBeChecked();
});

test('each new question gets the one spoken line, which has a file in both languages', async ({ page }) => {
  await openGame(page, { maths: 'add', reach: 'none', voice: true, sound: true, language: 'ka' }, GAME);
  await show(page, null, 'open');
  await page.locator('#start').click();
  await waitForScreen(page, 'countdown');
  await page.evaluate(() => {
    const { sound } = window.__game;
    window.__said = [];
    const real = sound.say.bind(sound);
    sound.say = (text, options) => {
      window.__said.push(text);
      return real(text, options);
    };
  });
  await expect.poll(() => page.evaluate(() => window.__said), { timeout: 20_000 }).toContain('Pop the right answer!');
  expect(await page.evaluate(() => window.__game.sound.voiceClips.has('Pop the right answer!'))).toBe(true);
});

test('a little film shows what to do, until the first balloon has been popped', async ({ page }) => {
  await startPlaying(page, { reach: 'none' });
  await waitForHand(page, 'open');
  await expect(page.locator('.pop-demo')).toBeVisible();
  const moving = await page.locator('.demo-hand').evaluate((node) => getComputedStyle(node).animationName);
  expect(moving).toBe('demo-hand');
  await page.waitForTimeout(1500);
  await shot(page, 'b14-pop-demo');
  await gloveReady(page);
  await balloonOnHand(page);
  await expect(page.locator('.pop-demo')).toBeHidden({ timeout: 5000 });
});
