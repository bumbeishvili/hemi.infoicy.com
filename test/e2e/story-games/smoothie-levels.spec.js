// Giraffe's Smoothie Stand's levels, with real photos going through the real tracker: what each level
// brings that's new, tip coins, golden fruit, watermelons, the bee and the power-ups, rotten fruit,
// fruit thrown across and tough fruit, and still the Golden Cup at the end, with nothing flashing.
import { expect, openGame, show, shot, test, waitForScreen } from '../helpers.js';
import { atLevel, judgeBrightness, moveGloveTo, startPlaying as startStand, stopMoving, storyIs, watchBrightness } from './helpers.js';

// These are the stand as it always was: customers who wait as long as it takes, the gentle choice under
// "Customers' patience", and the slow pace that was the default then. The customers who won't wait are in
// smoothie-patience.spec.js.
const AS_IT_WAS = { patience: 'gentle', pace: 'slow' };
const startPlaying = (page, game, settings = {}, ...rest) => startStand(page, game, { ...AS_IT_WAS, ...settings }, ...rest);

const GAME = 'smoothie-stand';
const GLOVE = ['field', 'gloves', 'right'];
const stand = (page) => page.evaluate(() => {
  const { stand: rules, field } = window.__game;
  return {
    index: rules.index,
    rotten: rules.rotten,
    stats: { ...rules.stats },
    coins: rules.coins,
    left: { ...rules.left },
    active: { ...rules.active },
    sliced: field.sliced,
    inTheAir: field.fruit.length,
    floating: field.coins.map(({ kind, x, y }) => ({ kind, x: x / innerWidth, y: y / innerHeight })),
    bubbles: field.bubbles.map(({ power, x, y }) => ({ power, x: x / innerWidth, y: y / innerHeight })),
    bee: field.bee ? { x: field.bee.x / innerWidth, y: field.bee.y / innerHeight, leaving: field.bee.leaving } : null,
    introduced: [...field.introduced],
  };
});

/** The hand going quickly from side to side, as a swipe does. */
/** The hand sweeping from side to side. rate is how fast, in turns a second: 7 is about once a second. */
const swiping = (page, on = true, rate = 7) => page.evaluate(([go, speed]) => {
  clearInterval(window.__swipe);
  if (!go) return;
  let t = 0;
  window.__swipe = setInterval(() => {
    t += 0.06;
    window.__camera.show({ left: null, right: 'open', scale: 0.7, rightOffsetX: Math.sin(t * speed) * 220 });
  }, 60);
}, [on, rate]);

/** Notes every throw from now on. */
const watchThrows = (page) => page.evaluate(() => {
  const { field } = window.__game;
  window.__throws = [];
  const real = field.throwFruit.bind(field);
  field.throwFruit = (kind, how = {}) => {
    window.__throws.push({ kind, ...how });
    return real(kind, how);
  };
});

const finishOrder = (page) => page.evaluate(() => {
  const { stand: rules } = window.__game;
  for (const kind of rules.wantedKinds) while (rules.left[kind] > 0) rules.slice(kind);
});

/** Nothing else flying, so a test can watch one thing. */
const quiet = (page) => page.evaluate(() => {
  const { field } = window.__game;
  field.throwing = false;
  field.fruit = [];
});

/** The hand out of the picture, so it doesn't pop or slice anything meanwhile. */
async function handAway(page) {
  await page.evaluate(() => {
    window.__move?.stop();
    window.__camera.show({ left: null, right: null });
  });
  await expect.poll(() => page.evaluate(() => window.__game.field.gloves.right.visible), { timeout: 15_000 }).toBe(false);
}

/** With the hand away, this customer's power-up bubble comes in half a second. */
const bubbleSoon = (page) => page.evaluate(() => {
  window.__game.stand.specialIn = 0.5;
});

/** Throws one fruit right where the swiping hand is, once it's moving. */
const throwOnce = (page, kind, how = {}) => page.evaluate(({ what, extra }) => new Promise((resolve) => {
  const timer = setInterval(() => {
    const { field } = window.__game;
    const { x, y, speed } = field.gloves.right;
    if (speed <= 0.3) return;
    clearInterval(timer);
    window.__thrown = field.throwFruit(what, { x, y, ...extra });
    resolve();
  }, 100);
}), { what: kind, extra: how });

/**
 * Holds the power-up bubble still where it is, in the middle of the reach, so a hand that's slow on a
 * busy computer can still get to it. In play it floats up and back down, and missing it costs nothing.
 */
const holdBubble = (page) => page.evaluate(() => {
  const [bubble] = window.__game.field.bubbles;
  Object.assign(bubble, { vx: 0, vy: 0, gravity: 0, y: Math.min(bubble.y, innerHeight * 0.55) });
});

/** Keeps the real open hand on something that floats, until done() says so. */
async function chase(page, find, done, { timeout = 60_000 } = {}) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const state = await stand(page);
    if (done(state)) return state;
    const thing = find(state);
    if (thing) await moveGloveTo(page, GLOVE, thing.x, Math.min(0.8, thing.y));
    await page.waitForTimeout(300);
  }
  throw new Error('never got there');
}

test('every level from 2 lists what\'s new on the title card, and as coming up', async ({ page }) => {
  const expected = {
    2: '🪙Tip coins',
    3: '🌟Golden fruit',
    4: '↔️Thrown across',
    5: '🧲Magnet',
    6: '🍉Watermelon🪰Rotten neighbours',
    7: '🐝Honeybee',
    8: '🥥Tough fruit',
    9: '🧤Big glove',
    10: '🌀Turbo blender',
  };
  await startPlaying(page, GAME, atLevel(GAME, 1));
  await expect(page.locator('#chip-coins-box')).toBeHidden();
  for (const [level, words] of Object.entries(expected)) {
    await page.evaluate((at) => {
      const { session } = window.__game;
      session.levels.choose(at);
      session.levelUi.refresh();
    }, Number(level));
    await expect(page.locator('#level-new')).toHaveText(`New:${words}`);
  }
  // Winning level 8, played at level 8.
  await page.evaluate(() => {
    const { session } = window.__game;
    session.levels.choose(8);
    session.level = 8;
    session.finish();
  });
  await expect(page.locator('#level-next-new')).toHaveText('Coming up:🧤Big glove');
});

test('what\'s new shows under the countdown, in Georgian when that\'s the voice', async ({ page }) => {
  await openGame(page, atLevel(GAME, 7, { language: 'ka' }), GAME);
  await show(page, null, 'open', { scale: 0.7 });
  await page.locator('#start').click();
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-new-now')).toContainText('ფუტკარი');
  await shot(page, 'sm-new-countdown');
});

test('level 2: a smoothie made leaves tip coins, and a real open hand touches them', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 2));
  await storyIs(page, 'truffle');
  await expect(page.locator('#chip-coins-box')).toBeVisible();
  await quiet(page);
  await moveGloveTo(page, GLOVE, 0.62, 0.5);
  await page.waitForTimeout(2500);
  await finishOrder(page);
  await expect.poll(async () => (await stand(page)).floating.length + (await stand(page)).stats.tips, { timeout: 5000 }).toBe(2);
  await page.waitForTimeout(700);
  await shot(page, 'sm-tips');
  // They float up near the hand: a little reach to each.
  await chase(page, (state) => state.floating[0], (state) => state.stats.tips === 2 || state.floating.length === 0);
  await stopMoving(page);
  const after = await stand(page);
  expect(after.stats.tips).toBeGreaterThanOrEqual(1);
  await expect(page.locator('#chip-coins')).toHaveText(`🪙 ${after.coins}`);
});

test('level 3: a real swipe through a golden fruit gives three coins', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, GAME, atLevel(GAME, 3));
  await quiet(page);
  // After the countdown's "Go!" has gone.
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__game.field.throwFruit('golden', { x: innerWidth * 0.55, y: innerHeight * 0.35 }));
  await page.waitForTimeout(300);
  await shot(page, 'sm-golden');
  await quiet(page);
  await swiping(page);
  await throwOnce(page, 'golden');
  await expect.poll(async () => (await stand(page)).stats.golden, { timeout: 15_000 }).toBe(1);
  await swiping(page, false);
  const after = await stand(page);
  expect(after.coins).toBe(3);
  expect(after.stats.extra).toBe(0);
  // And a golden fruit really comes along with an order, by itself.
  await watchThrows(page);
  await page.evaluate(() => {
    const { field, stand: rules } = window.__game;
    rules.bonusThrown = false;
    rules.others = 0;
    field.throwing = true;
  });
  await expect.poll(() => page.evaluate(() => window.__throws.some(({ kind }) => kind === 'golden')), { timeout: 20_000 }).toBe(true);
});

test('level 4: some fruit is thrown across, from one side to the other, and still within reach', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, GAME, atLevel(GAME, 4));
  await storyIs(page, 'truffle');
  await watchThrows(page);
  await expect.poll(() => page.evaluate(() => window.__throws.filter(({ across }) => across).length), { timeout: 30_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(700);
  const across = await page.evaluate(() => window.__game.field.fruit.filter(({ across: going }) => going).map(({ vx }) => vx / innerWidth));
  for (const vx of across) expect(Math.abs(vx)).toBeGreaterThan(0.06);
  // Its name is shown, first of anything waiting, as it's what's new at this level.
  await expect.poll(async () => (await stand(page)).introduced, { timeout: 5000 }).toContain('across');
  await shot(page, 'sm-across');
});

test('level 5: a real open hand pops the magnet bubble, and the magnet draws coins to it', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 5));
  await storyIs(page, 'truffle');
  await handAway(page);
  await bubbleSoon(page);
  await expect.poll(async () => (await stand(page)).bubbles.length, { timeout: 20_000 }).toBe(1);
  await quiet(page);
  expect((await stand(page)).bubbles[0].power).toBe('magnet');
  await holdBubble(page);
  await page.waitForTimeout(1200);
  await shot(page, 'sm-magnet-bubble');
  await chase(page, (state) => state.bubbles[0], (state) => state.active.magnet > 0);
  // It lasts 8 seconds of an open hand. A busy computer can take longer than that over the rest of
  // this, so it's given longer, now the real hand has picked it up.
  await page.evaluate(() => {
    window.__game.stand.active.magnet = 60;
  });
  // A coin a little way off comes to the hand.
  await page.evaluate(() => {
    const { field } = window.__game;
    const { x, y } = field.gloves.right;
    field.coins.push({ kind: 'coin', x: x + innerHeight * 0.3, y, vx: 0, vy: 0, gravity: 0, r: field.fruitSize * 0.55, age: 1, why: 'tip' });
  });
  await page.waitForTimeout(250);
  await shot(page, 'sm-magnet');
  await expect.poll(async () => (await stand(page)).coins, { timeout: 5000 }).toBe(1);
  await stopMoving(page);
});

test('level 6: a real swipe splits a watermelon into wedges, each a coin for a touch', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, GAME, atLevel(GAME, 6));
  await quiet(page);
  // After the countdown's "Go!" has gone.
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__game.field.throwFruit('melon', { x: innerWidth * 0.55, y: innerHeight * 0.35 }));
  await page.waitForTimeout(300);
  await shot(page, 'sm-melon');
  await quiet(page);
  await swiping(page);
  await throwOnce(page, 'melon');
  await expect.poll(async () => (await stand(page)).stats.melons, { timeout: 15_000 }).toBe(1);
  await page.waitForTimeout(150);
  await shot(page, 'sm-wedges');
  // The swiping hand goes through the wedges as they float up.
  await expect.poll(async () => (await stand(page)).stats.wedges, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
  await swiping(page, false);
});

test('level 7: the second customer brings a bee, and a real open hand gets its honey, which slows everything', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 7));
  await storyIs(page, 'truffle');
  await moveGloveTo(page, GLOVE, 0.62, 0.85);
  await finishOrder(page);
  await storyIs(page, 'mochi');
  await expect.poll(async () => (await stand(page)).bee, { timeout: 10_000 }).not.toBeNull();
  await page.waitForTimeout(1500);
  await shot(page, 'sm-bee');
  await chase(page, (state) => (state.bee && !state.bee.leaving ? state.bee : null), (state) => state.active.honey > 0);
  await page.waitForTimeout(200);
  await shot(page, 'sm-honey');
  // Fruit really goes slower: a still fruit let go falls half as far in the same time.
  const fell = await page.evaluate(async () => {
    const { field } = window.__game;
    field.throwing = false;
    field.fruit = [];
    const fruit = field.throwFruit('pear', { x: 10, y: 10 });
    fruit.still = false;
    const from = performance.now();
    await new Promise((resolve) => setTimeout(resolve, 500));
    const seconds = (performance.now() - from) / 1000;
    return { fell: fruit.y - 10, full: 0.5 * field.gravityNow * seconds * seconds };
  });
  expect(fell.fell).toBeLessThan(fell.full * 0.7);
  await stopMoving(page);
});

test('level 8: a tough fruit takes two real swipes, the first cracking it', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, GAME, atLevel(GAME, 8));
  await page.evaluate(() => {
    const { field } = window.__game;
    field.throwing = false;
    field.fruit = [];
    // How a tough one looks, and a cracked one, out of the hand's way.
    field.throwFruit('pear', { x: innerWidth * 0.45, y: innerHeight * 0.35, tough: true });
    field.throwFruit('apple', { x: innerWidth * 0.6, y: innerHeight * 0.35, tough: true }).cracked = true;
  });
  await page.waitForTimeout(300);
  await shot(page, 'sm-tough');
  await quiet(page);
  // What was counted at the moment it cracked.
  await page.evaluate(() => {
    const { field, stand: rules } = window.__game;
    const crack = field.crack.bind(field);
    window.__cracks = [];
    field.crack = (fruit, glove) => {
      window.__cracks.push(rules.stats.wanted);
      return crack(fruit, glove);
    };
  });
  await swiping(page);
  await throwOnce(page, 'apple', { tough: true });
  await expect.poll(() => page.evaluate(() => window.__cracks.length), { timeout: 15_000 }).toBe(1);
  expect(await page.evaluate(() => window.__cracks[0])).toBe(0);
  await expect.poll(async () => (await stand(page)).stats.wanted, { timeout: 15_000 }).toBe(1);
  // One swipe cracked it, and the next sliced it.
  expect(await page.evaluate(() => window.__cracks.length)).toBe(1);
  await swiping(page, false);
});

test('level 9: the big glove bubble lets a real swipe slice from further away', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 9));
  await storyIs(page, 'truffle');
  await handAway(page);
  await bubbleSoon(page);
  await expect.poll(async () => (await stand(page)).bubbles.length, { timeout: 20_000 }).toBe(1);
  await quiet(page);
  expect((await stand(page)).bubbles[0].power).toBe('glove');
  await holdBubble(page);
  await chase(page, (state) => state.bubbles[0], (state) => state.active.glove > 0);
  await stopMoving(page);
  // Longer than its 8 seconds, for a busy computer, now the real hand has picked it up.
  await page.evaluate(() => {
    window.__game.stand.active.glove = 60;
  });
  await swiping(page);
  await expect.poll(() => page.evaluate(() => window.__game.field.gloves.right.speed), { timeout: 15_000 }).toBeGreaterThan(0.4);
  await page.waitForTimeout(400);
  await shot(page, 'sm-big-glove');
  // A fruit just past the usual reach of the moving hand is sliced with the big glove, and not without.
  const reach = await page.evaluate(() => {
    const { field } = window.__game;
    const glove = field.gloves.right;
    const away = field.fruitSize + field.palmSize * 0.5 * 1.4;
    const at = (on) => {
      // Below the palm, on the wrist's side, so the fingertips don't reach it either way.
      const fruit = { kind: 'pear', x: glove.x, y: glove.y + away, r: field.fruitSize, rest: 0 };
      const was = field.powerOn;
      if (!on) field.powerOn = () => false;
      const real = { last: [glove.lastX, glove.lastY] };
      glove.lastX = glove.x;
      glove.lastY = glove.y;
      field.events.onSliceWas = field.events.onSlice;
      field.events.onSlice = () => 'extra';
      const sliced = field.touchGloves(fruit);
      field.events.onSlice = field.events.onSliceWas;
      [glove.lastX, glove.lastY] = real.last;
      field.powerOn = was;
      return sliced;
    };
    return { withIt: at(true), without: at(false), speed: glove.speed };
  });
  expect(reach.withIt).toBe(true);
  expect(reach.without).toBe(false);
  await swiping(page, false);
});

test('level 10: the turbo blender bubble makes a real slice count twice', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 10));
  await storyIs(page, 'truffle');
  await handAway(page);
  await bubbleSoon(page);
  await expect.poll(async () => (await stand(page)).bubbles.length, { timeout: 20_000 }).toBe(1);
  await quiet(page);
  expect((await stand(page)).bubbles[0].power).toBe('turbo');
  await holdBubble(page);
  await chase(page, (state) => state.bubbles[0], (state) => state.active.turbo > 0);
  await stopMoving(page);
  // Longer than its 6 seconds, for a busy computer, now the real hand has picked it up.
  await page.evaluate(() => {
    window.__game.stand.active.turbo = 60;
  });
  await shot(page, 'sm-turbo');
  await swiping(page);
  await throwOnce(page, 'apple');
  await expect.poll(async () => (await stand(page)).stats.wanted, { timeout: 15_000 }).toBeGreaterThan(0);
  await swiping(page, false);
  const after = await stand(page);
  // Each apple sliced while it lasted counted twice.
  expect(after.stats.wanted).toBe(2 * after.sliced.right);
});

test('level 10: rotten fruit from the first customer, fruit thrown across, rotten beside wanted, and tough fruit', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 10));
  await storyIs(page, 'truffle');
  expect((await stand(page)).rotten).toBe(true);
  const pace = await page.evaluate(() => window.__game.field.pace);
  expect(pace.gravity).toBeCloseTo(0.38 * 1.3, 5);
  expect(pace.most).toBe(11);
  await watchThrows(page);
  // Through the first two customers, as everything comes along in its own time.
  await page.waitForTimeout(9000);
  await finishOrder(page);
  await storyIs(page, 'mochi');
  await page.waitForTimeout(9000);
  const throws = await page.evaluate(() => window.__throws);
  const count = (test) => throws.filter(test).length;
  console.log('throws', throws.length, 'rotten', count(({ kind }) => kind === 'rotten'), 'across', count(({ across }) => across), 'pairs', count(({ withRotten }) => withRotten), 'tough', count(({ tough }) => tough));
  expect(count(({ kind }) => kind === 'rotten')).toBeGreaterThan(0);
  expect(count(({ across }) => across)).toBeGreaterThan(0);
  expect(count(({ withRotten }) => withRotten)).toBeGreaterThan(0);
  expect(count(({ tough }) => tough)).toBeGreaterThan(0);
  // One watermelon with the first customer, and a golden fruit with the second.
  expect(count(({ kind }) => kind === 'melon')).toBe(1);
  expect(count(({ kind }) => kind === 'golden')).toBe(1);
  await shot(page, 'sm-l10-busy');
});

test('level 10: the day still ends with the Golden Cup, with the coins on the finish card', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 10));
  for (const who of ['truffle', 'mochi', 'frost', 'widget', 'kit', 'bramble']) {
    await storyIs(page, who);
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__game.stand.addCoins(2, 'tip'));
    await finishOrder(page);
  }
  await expect(page.locator('#story-line')).toContainText('Golden Cup');
  await waitForScreen(page, 'finish');
  await expect(page.locator('#screen-finish')).toContainText('You won the Golden Cup!');
  await expect(page.locator('#level-done-text')).toHaveText('All 10 levels done!');
  const { coins } = await stand(page);
  expect(coins).toBeGreaterThanOrEqual(12);
  await expect(page.locator('#sum-right-coins')).toHaveText(String(coins));
  await page.waitForTimeout(600);
  await shot(page, 'sm-finish');
});

for (const level of [1, 6, 10]) {
  test(`nothing flashes at level ${level}: the fruit flying, at the fastest pace a grown-up can choose`, async ({ page }) => {
    test.setTimeout(240_000);
    await startPlaying(page, GAME, atLevel(GAME, level, { pace: 'fast' }));
    await storyIs(page, 'truffle');
    // The hand out of the picture, so it's only the fruit, and whatever else floats up.
    await page.evaluate(() => window.__camera.show({ left: null, right: null }));
    await page.waitForTimeout(1500);
    // Over twenty seconds. What changes here is fruit going up and back down through the same places,
    // low in the middle of the reach, and it comes in bursts, so a burst mustn't decide it: over ten
    // seconds the same level measured anything from under a hundredth to over a twentieth.
    const result = judgeBrightness(await watchBrightness(page, 1200));
    const { inTheAir } = await stand(page);
    console.log(`level ${level}, fruit`, JSON.stringify(result), 'in the air', inTheAir);
    expect(inTheAir).toBeGreaterThan(4);
    expect(inTheAir).toBeLessThanOrEqual(12);
    expect(result.biggestStep).toBeLessThan(3);
    // What counts here is small fruit going past a place quickly, rather than anything lighting up. The
    // usual measure for a flash is a quarter of the picture, and this keeps well under a twentieth.
    expect(result.flickeringShare).toBeLessThan(0.05);
  });

  test(`nothing flashes at level ${level}: slicing, cracking, sticky gloves, coins and power-ups`, async ({ page }) => {
    test.setTimeout(240_000);
    await startPlaying(page, GAME, atLevel(GAME, level, { slicing: 'touch' }));
    await storyIs(page, 'truffle');
    // At a child's pace, about one sweep across and back every second and a half. Sweeping faster than a
    // child would makes the glove itself, which is the child's own hand, flicker past the places it crosses.
    await swiping(page, true, 4);
    if (level > 1) {
      // Coins and a bubble floating up, and the bee, while the hand swipes.
      await page.evaluate(() => {
        const { field } = window.__game;
        field.tossTips(2);
        field.throwBubble('magnet');
        field.startBee();
      });
    }
    const result = judgeBrightness(await watchBrightness(page, 600));
    await swiping(page, false);
    const { sliced, stats } = await stand(page);
    console.log(`level ${level}, slicing`, JSON.stringify(result), JSON.stringify(sliced), JSON.stringify(stats));
    // It really was going on.
    expect(sliced.right).toBeGreaterThan(3);
    if (level > 1) expect(stats.tips + stats.powers).toBeGreaterThan(0);
    expect(result.biggestStep).toBeLessThan(3);
    expect(result.flickeringShare).toBeLessThan(0.06);
  });
}

test('level 10 with reduced motion: fruit barely spins, and the day still goes on', async ({ page }) => {
  test.setTimeout(150_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startPlaying(page, GAME, atLevel(GAME, 10));
  await storyIs(page, 'truffle');
  await expect.poll(() => page.evaluate(() => window.__game.field.fruit.length), { timeout: 5000 }).toBeGreaterThan(2);
  const spins = await page.evaluate(() => window.__game.field.fruit.map(({ spin }) => spin));
  for (const spin of spins) expect(spin).toBe(0.3);
  await finishOrder(page);
  await storyIs(page, 'mochi');
});

/** Notes the words drawn on the fair from now on, such as the names of new things. */
const watchWords = (page) => page.evaluate(() => {
  const { ctx } = window.__game.field;
  const fillText = ctx.fillText.bind(ctx);
  window.__drawn = new Set();
  ctx.fillText = (text, ...rest) => {
    window.__drawn.add(text);
    return fillText(text, ...rest);
  };
});
const drawn = (page, words) => page.evaluate((wanted) => [...window.__drawn].some((text) => text.includes(wanted)), words);

test('level 5: the magnet is named, though its bubble starts below the screen while another name shows, in the voice\'s language', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, GAME, atLevel(GAME, 5));
  await storyIs(page, 'truffle');
  await quiet(page);
  await handAway(page);
  await watchWords(page);
  // Only the bubble this test throws, and a tip coin's name showing first.
  await page.evaluate(() => {
    const { field, stand: rules } = window.__game;
    rules.specialIn = Infinity;
    field.tossTips(1);
  });
  await expect.poll(() => drawn(page, 'Tip coins'), { timeout: 5000, intervals: [100] }).toBe(true);
  await page.evaluate(() => window.__game.field.throwBubble('magnet'));
  await expect.poll(() => drawn(page, 'Magnet'), { timeout: 8000, intervals: [100] }).toBe(true);
  await shot(page, 'sm-magnet-named');
  // A grown-up changes the voice to Georgian while it shows, and the name changes with it.
  await page.evaluate(() => window.__game.session.changeSettings({ language: 'ka' }));
  await expect.poll(() => drawn(page, 'მაგნიტი'), { timeout: 3000, intervals: [100] }).toBe(true);
});

test('level 7: watermelon wedges stay within reach, and the honey slows coins, bubbles and the bee as well as fruit', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, GAME, atLevel(GAME, 7));
  await storyIs(page, 'truffle');
  await quiet(page);
  await handAway(page);
  // A watermelon sliced near the edge of the reach, which is from 0.38 to 0.9 of the way across.
  const spread = await page.evaluate(async () => {
    const { field } = window.__game;
    field.slice({ kind: 'melon', x: innerWidth * 0.86, y: innerHeight * 0.5, vx: 0, vy: 0, r: field.fruitSize * 1.35 }, field.gloves.right);
    let low = Infinity;
    let high = -Infinity;
    const until = performance.now() + 5000;
    while (performance.now() < until && field.coins.some(({ kind }) => kind === 'wedge')) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      for (const { kind, x } of field.coins) {
        if (kind !== 'wedge') continue;
        low = Math.min(low, x / innerWidth);
        high = Math.max(high, x / innerWidth);
      }
    }
    return { low, high };
  });
  console.log('wedges', JSON.stringify(spread));
  expect(spread.low).toBeGreaterThanOrEqual(0.38);
  expect(spread.high).toBeLessThanOrEqual(0.9);
  // The same moment of floating, with the honey and without.
  const floated = await page.evaluate(() => {
    const { field } = window.__game;
    const was = field.powerOn;
    const step = (honey) => {
      field.powerOn = (kind) => honey && kind === 'honey';
      const from = innerHeight * 0.7;
      const coin = { kind: 'coin', x: innerWidth * 0.6, y: from, vx: 0, vy: -innerHeight * 0.3, gravity: 0, r: 20, age: 1 };
      const bubble = { power: 'magnet', x: innerWidth * 0.6, y: from, vx: 0, vy: -innerHeight * 0.3, gravity: 0, r: 20, age: 1 };
      field.coins = [coin];
      field.bubbles = [bubble];
      field.bee = { from: innerWidth * 0.4, to: innerWidth * 0.8, t: 1, x: 0, y: 0, leaving: false, honey: true, way: 1 };
      field.updateExtras(0.2, false);
      return { coin: from - coin.y, bubble: from - bubble.y, bee: field.bee.t - 1 };
    };
    const without = step(false);
    const withHoney = step(true);
    field.powerOn = was;
    field.coins = [];
    field.bubbles = [];
    field.bee = null;
    return { without, withHoney };
  });
  for (const thing of ['coin', 'bubble', 'bee']) {
    expect(floated.without[thing]).toBeGreaterThan(0);
    expect(floated.withHoney[thing]).toBeCloseTo(floated.without[thing] / 2, 5);
  }
});
