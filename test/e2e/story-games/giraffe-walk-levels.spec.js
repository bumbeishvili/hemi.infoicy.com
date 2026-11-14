// Giraffe's Long Walk Home's levels, with real photos going through the real tracker: what each level
// brings that's new, golden fruit, butterflies leaving flowers, green fruit, the basket, the monkey,
// the bridge, frosty fruit, fireflies and the parrot, and still all the way home, with nothing flashing.
import { expect, hands, show, shot, test, waitForScreen } from '../helpers.js';
import { atLevel, judgeBrightness, moveGloveTo, stopMoving, storyIs, watchBrightness } from './helpers.js';
import { openGame, startPlaying } from './challenge-helpers.js';

const GAME = 'giraffe-walk';
const GLOVE = ['walk', 'gloves', 'right'];
const CANVASES = ['backdrop', 'giraffe-stage', 'game'];
const tree = (page) => page.evaluate(() => {
  const { walk, journey } = window.__game;
  const share = (thing) => (thing ? { x: thing.x / walk.width, y: thing.y / walk.height } : null);
  return {
    index: journey.index,
    place: journey.stop?.place ?? null,
    count: journey.stop?.count ?? null,
    fed: journey.stats.fed,
    stats: { ...journey.stats },
    gifts: journey.gifts,
    holding: walk.holding?.kind ?? (walk.holding ? 'fruit' : null),
    extra: Boolean(walk.extra),
    basket: walk.basket,
    walking: walk.walking,
    fruit: walk.fruit.map((fruit) => ({
      ...share(fruit),
      homeX: fruit.homeX / walk.width,
      ripe: fruit.ripe,
      golden: fruit.golden,
      frost: fruit.frost,
      warmth: fruit.warmth ?? 0,
      state: fruit.state,
      wiggle: fruit.wiggle,
      pickable: walk.pickable(fruit),
    })),
    items: walk.items.map((item) => ({ kind: item.kind, state: item.state, ...share(item) })),
    gifted: walk.gifts.map((gift) => ({ kind: gift.kind, ...share(gift) })),
    flies: walk.flies.map((fly) => ({ caught: fly.caught, ...share(fly) })),
    butterfly: walk.butterfly ? { at: walk.fruit.indexOf(walk.butterfly.fruit), leaving: walk.butterfly.leaving } : null,
    monkey: walk.monkey ? { state: walk.monkey.state, at: walk.fruit.indexOf(walk.monkey.fruit) } : null,
    parrot: walk.parrot ? walk.parrot.state : null,
    bridge: walk.bridge ? { ...walk.bridge, gap: { x: walk.gap.x / walk.width, y: walk.gap.y / walk.height } } : null,
    mouth: { x: walk.mouth.x / walk.width, y: walk.mouth.y / walk.height },
    labels: walk.labels.map(({ key }) => key),
    introduced: [...walk.introduced],
  };
});

/** The real hand's picture, where it is now, open or closed. */
const handIs = (page, photo) => page.evaluate((which) => {
  window.__move?.stop();
  const { offsetX = 0, offsetY = 0 } = window.__move ?? {};
  window.__camera.show({ left: null, right: which, scale: 0.7, rightOffsetX: offsetX, rightOffsetY: offsetY });
}, photo);

/** Keeps the real open hand on something as it moves, until it's close enough to pick. */
async function reach(page, find, { timeout = 60_000 } = {}) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const state = await tree(page);
    const thing = find(state);
    if (!thing) throw new Error('nothing to reach');
    await moveGloveTo(page, GLOVE, thing.x, thing.y);
    await page.waitForTimeout(500);
    const near = await page.evaluate(({ x, y }) => {
      const { walk } = window.__game;
      const glove = walk.gloves.right;
      return glove.visible && Math.hypot(glove.x - x * walk.width, glove.y - y * walk.height) <= walk.palmSize * 0.9;
    }, find(await tree(page)));
    if (near) return;
  }
  throw new Error('never got there');
}

/** Closes the real hand where it is, carries what it has to a place, and opens it there. */
async function carryTo(page, at, isThere) {
  await moveGloveTo(page, GLOVE, at.x, at.y, { right: 'fist' });
  await expect.poll(() => page.evaluate(isThere), { timeout: 30_000 }).toBe(true);
  await handIs(page, 'open');
}

/** Picks a fruit with the real hand and feeds it to Giraffe. */
async function feedOne(page, find) {
  await reach(page, find);
  await handIs(page, 'fist');
  await expect.poll(async () => (await tree(page)).holding, { timeout: 15_000 }).not.toBeNull();
  const { mouth } = await tree(page);
  await carryTo(page, mouth, () => window.__game.walk.onMouth);
}

/** Feeds Giraffe through the rules, and mends any bridge, until he's at a stop. */
async function skipTo(page, index) {
  for (;;) {
    const state = await tree(page);
    if (state.index === index && state.walking === 0) break;
    await page.evaluate((target) => {
      const { journey, walk } = window.__game;
      // Never the stop it's going to, however late this runs.
      if (!journey.stop || journey.index >= target || walk.walking > 0 || !walk.fruit.length) return;
      if (walk.bridge) walk.bridge.fixed = true;
      journey.fixBridge();
      while (journey.wanted) journey.feed();
    }, index);
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(600);
}

test('every level from 2 lists what\'s new on the title card, and as coming up', async ({ page }) => {
  const expected = {
    2: '🌟Golden fruit',
    3: '🍃Windy branches🦋Butterflies',
    4: '🍏Green fruit',
    5: '🧺Basket',
    6: '🐒Cheeky monkey',
    7: '🌉Broken bridge',
    8: '❄️Frosty fruit',
    9: '✨Fireflies',
    10: '🦜Parrot helper',
  };
  await startPlaying(page, GAME, atLevel(GAME, 1));
  await expect(page.locator('#chip-gifts-box')).toBeHidden();
  for (const [level, words] of Object.entries(expected)) {
    await page.evaluate((at) => {
      const { session } = window.__game;
      session.levels.choose(at);
      session.levelUi.refresh();
    }, Number(level));
    await expect(page.locator('#level-new')).toHaveText(`New:${words}`);
  }
  // Winning level 6, played at level 6.
  await page.evaluate(() => {
    const { session } = window.__game;
    session.levels.choose(6);
    session.level = 6;
    session.finish();
  });
  await expect(page.locator('#level-next-new')).toHaveText('Coming up:🌉Broken bridge');
});

test('what\'s new shows under the countdown, in Georgian when that\'s the voice', async ({ page }) => {
  await openGame(page, atLevel(GAME, 6, { language: 'ka' }), GAME);
  await show(page, null, 'open', { scale: 0.7 });
  await page.locator('#start').click();
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-new-now')).toContainText('ცელქი მაიმუნი');
});

test('level 2: a real hand feeds Giraffe the golden fruit, and it\'s a gift for his family', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 2));
  await storyIs(page, 'giraffe');
  await expect(page.locator('#chip-gifts-box')).toBeVisible();
  const { fruit, introduced } = await tree(page);
  expect(fruit.filter(({ golden }) => golden)).toHaveLength(1);
  expect(introduced).toContain('golden');
  await page.waitForTimeout(800);
  await shot(page, 'jw-golden');
  await feedOne(page, (state) => state.fruit.find(({ golden, state: at }) => golden && at === 'hanging'));
  await expect.poll(async () => (await tree(page)).stats.golden, { timeout: 15_000 }).toBe(1);
  await expect(page.locator('#chip-gifts')).toHaveText('🎁 1');
  expect((await tree(page)).fed).toBe(1);
  await stopMoving(page);
});

test('level 3: a butterfly shooed off a fruit by a real open hand leaves a flower', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 3));
  await storyIs(page, 'giraffe');
  // Somewhere out of the way, so it lands.
  await moveGloveTo(page, GLOVE, 0.5, 0.85);
  await expect.poll(async () => (await tree(page)).butterfly, { timeout: 30_000 }).not.toBeNull();
  const { butterfly, fruit } = await tree(page);
  expect(fruit[butterfly.at].pickable).toBe(false);
  // There's always another ripe one free.
  expect(fruit.filter(({ pickable }) => pickable).length).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(900);
  await shot(page, 'jw-butterfly');
  await moveGloveTo(page, GLOVE, fruit[butterfly.at].homeX, fruit[butterfly.at].y);
  await expect.poll(async () => (await tree(page)).stats.flower, { timeout: 20_000 }).toBe(1);
  await stopMoving(page);
});

test('level 4: a real fist on green fruit only wiggles it until it ripens', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 4));
  await storyIs(page, 'giraffe');
  const first = await tree(page);
  // Four ripe, one more than he needs, and one green, which may already have ripened by itself on a
  // busy computer.
  expect(first.fruit).toHaveLength(5);
  expect(await page.evaluate(() => window.__game.walk.level.unripe)).toBe(1);
  // Only a green one is left on the tree, so the fist can't pick a ripe one beside it.
  const green = Math.max(0, first.fruit.findIndex(({ ripe }) => !ripe));
  await page.evaluate((at) => {
    const { walk } = window.__game;
    walk.fruit.forEach((fruit, index) => {
      if (index !== at) fruit.state = 'gone';
    });
    Object.assign(walk.fruit[at], { ripe: false, ripening: 0 });
  }, green);
  await moveGloveTo(page, GLOVE, first.fruit[green].homeX, first.fruit[green].y, { right: 'fist' });
  await expect.poll(async () => (await hands(page)).right.status, { timeout: 15_000 }).toBe('closed');
  await expect.poll(() => page.evaluate((at) => {
    const { walk } = window.__game;
    return walk.isNear(walk.fruit[at], walk.gloves.right);
  }, green), { timeout: 20_000 }).toBe(true);
  await stopMoving(page);
  expect((await tree(page)).fruit[green].ripe).toBe(false);
  await expect.poll(async () => (await tree(page)).fruit[green].wiggle, { timeout: 5000 }).toBeGreaterThan(0);
  await page.waitForTimeout(400);
  await shot(page, 'jw-green');
  expect((await tree(page)).holding).toBeNull();
  // It ripens by itself, and then the same fist picks it.
  await expect.poll(async () => (await tree(page)).fruit[green].ripe, { timeout: 15_000 }).toBe(true);
  await expect.poll(async () => (await tree(page)).holding, { timeout: 15_000 }).not.toBeNull();
});

test('level 5: a real fist takes the basket, and then picks two fruit at once for Giraffe', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, GAME, atLevel(GAME, 5));
  await skipTo(page, 1);
  await storyIs(page, 'mochi');
  // No butterflies or green fruit for this one.
  await page.evaluate(() => {
    const { walk } = window.__game;
    walk.level = { ...walk.level, butterflies: false };
    walk.fruit = walk.fruit.filter(({ ripe }) => ripe);
  });
  const { items } = await tree(page);
  expect(items.map(({ kind }) => kind)).toEqual(['basket']);
  await page.waitForTimeout(600);
  await shot(page, 'jw-basket');
  await reach(page, (state) => state.items[0]);
  await handIs(page, 'fist');
  await expect.poll(async () => (await tree(page)).basket, { timeout: 15_000 }).toBe(true);
  // The same fist, kept closed and taken onto a fruit, doesn't pick it: the hand opens first, and it's
  // asked to, if it stays closed.
  const { fruit } = await tree(page);
  const near = fruit.find(({ pickable }) => pickable);
  await moveGloveTo(page, GLOVE, near.x, near.y, { right: 'fist' });
  await expect(page.locator('#prompt-text')).toHaveText('Open your right hand!', { timeout: 15_000 });
  expect((await tree(page)).holding).toBeNull();
  await handIs(page, 'open');
  // Only the two fruit furthest apart left, so the second comes a long way to the basket. Where it is
  // the moment it's taken is noted: still by its branch, as it comes to the hand rather than jumping.
  await page.evaluate(() => {
    const { walk } = window.__game;
    const free = walk.fruit.filter((one) => walk.pickable(one));
    const apart = ([a, b]) => Math.hypot(a.homeX - b.homeX, a.homeY - b.homeY);
    let pair = [free[0], free[1]];
    for (const a of free) for (const b of free) if (apart([a, b]) > apart(pair)) pair = [a, b];
    for (const fruit of walk.fruit) if (!pair.includes(fruit)) fruit.state = 'gone';
    window.__second = null;
    const look = () => {
      const { extra } = walk;
      if (extra) window.__second = { fromBranch: Math.hypot(extra.x - extra.homeX, extra.y - extra.homeY) / walk.height, apart: apart(pair) / walk.height };
      else requestAnimationFrame(look);
    };
    look();
  });
  await page.waitForTimeout(600);
  await feedOne(page, (state) => state.fruit.find(({ pickable }) => pickable));
  await expect.poll(async () => (await tree(page)).fed, { timeout: 15_000 }).toBeGreaterThanOrEqual(3 + 2);
  expect((await tree(page)).basket).toBe(false);
  const second = await page.evaluate(() => window.__second);
  console.log('second fruit', JSON.stringify(second));
  expect(second.apart).toBeGreaterThan(0.2);
  expect(second.fromBranch).toBeLessThan(second.apart * 0.3);
  await stopMoving(page);
});

test('level 6: the cheeky monkey takes a fruit, a real fist takes it back, and he throws a coconut', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, GAME, atLevel(GAME, 6));
  await skipTo(page, 1);
  await moveGloveTo(page, GLOVE, 0.5, 0.85);
  // No butterflies, and no basket, which a fist near it takes first, and then has to open again.
  await page.evaluate(() => {
    const { walk } = window.__game;
    walk.level = { ...walk.level, butterflies: false, monkeyStays: 60 };
    walk.items = [];
    walk.monkeyIn = 0;
  });
  await expect.poll(async () => (await tree(page)).monkey?.state, { timeout: 15_000 }).toBe('holding');
  await page.waitForTimeout(1200);
  await shot(page, 'jw-monkey');
  const { monkey } = await tree(page);
  // His name is shown, first of anything still waiting, as he's what's new at this level.
  await expect.poll(async () => (await tree(page)).introduced, { timeout: 5000 }).toContain('monkey');
  await reach(page, (state) => state.fruit[monkey.at]);
  await handIs(page, 'fist');
  await expect.poll(async () => (await tree(page)).holding, { timeout: 15_000 }).not.toBeNull();
  // The coconut comes down to the hand.
  await expect.poll(async () => (await tree(page)).stats.coconut, { timeout: 15_000 }).toBe(1);
  await shot(page, 'jw-monkey-coconut');
  await stopMoving(page);
});

test('level 7: a real hand carries the plank to the gap and mends the bridge, with hints about the plank, not fruit', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, GAME, atLevel(GAME, 7));
  await skipTo(page, 0);
  // Up to the river, feeding through the rules.
  await page.evaluate(() => {
    window.__skip = setInterval(() => {
      const { journey, walk } = window.__game;
      if (journey.index < 2 && journey.stop && walk.walking === 0 && walk.fruit.length) while (journey.wanted) journey.feed();
    }, 300);
  });
  await expect.poll(async () => (await tree(page)).place, { timeout: 30_000 }).toBe('river');
  await page.evaluate(() => clearInterval(window.__skip));
  await storyIs(page, 'bramble');
  await page.evaluate(() => {
    const { walk } = window.__game;
    walk.level = { ...walk.level, butterflies: false };
    walk.monkey = null;
    walk.monkeyIn = 1000;
  });
  const { items, bridge } = await tree(page);
  expect(items.map(({ kind }) => kind)).toEqual(['plank']);
  expect(bridge.fixed).toBe(false);
  // The bridge stays where it is while Giraffe chews, rather than going with his mouth.
  const gaps = await page.evaluate(async () => {
    const { walk, session } = window.__game;
    session.game.eatingUntil = performance.now() + 2200;
    session.game.giraffeDoes('munch');
    const at = [];
    for (let i = 0; i < 60; i += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      at.push(walk.gap.x / walk.width);
    }
    return at;
  });
  expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(0.0005);
  expect(gaps[0]).toBeCloseTo(bridge.gap.x, 4);
  await page.waitForTimeout(800);
  await shot(page, 'jw-bridge');
  // He's had enough here and every fruit has gone, but the bridge isn't mended: the hint is the plank.
  await moveGloveTo(page, GLOVE, 0.5, 0.85);
  await page.evaluate(() => {
    const { journey, walk } = window.__game;
    while (journey.wanted) journey.feed();
    for (const fruit of walk.fruit) fruit.state = 'gone';
  });
  await expect(page.locator('#prompt-text')).toHaveText('Close your hand on the plank!', { timeout: 15_000 });
  expect((await tree(page)).place).toBe('river');
  // And carrying the plank, the hint is the bridge, not Giraffe.
  await reach(page, (state) => state.items[0]);
  await handIs(page, 'fist');
  await expect.poll(async () => (await tree(page)).holding, { timeout: 15_000 }).toBe('plank');
  await expect(page.locator('#prompt-text')).toHaveText('Bring it to the bridge, and open your hand!', { timeout: 10_000 });
  // Noted as it happens, as he walks on straight away, and the bridge goes with the river.
  await page.evaluate(() => {
    window.__mended = false;
    const look = () => {
      if (window.__game.walk.bridge?.fixed) window.__mended = true;
      else requestAnimationFrame(look);
    };
    look();
  });
  // Opened once the fist has settled just above the gap, as the photo of an open hand has its middle
  // lower down than the fist's, as a real hand's moves a little as it opens.
  const above = { x: bridge.gap.x, y: bridge.gap.y - 0.1 };
  await moveGloveTo(page, GLOVE, above.x, above.y, { right: 'fist' });
  await expect.poll(() => page.evaluate(({ x, y }) => {
    const { walk } = window.__game;
    const glove = walk.gloves.right;
    return glove.visible && Math.hypot(glove.x - x * walk.width, glove.y - y * walk.height) <= walk.height * 0.04;
  }, above), { timeout: 30_000 }).toBe(true);
  expect(await page.evaluate(() => window.__game.walk.onGap)).toBe(true);
  await handIs(page, 'open');
  await expect.poll(() => page.evaluate(() => window.__mended), { timeout: 15_000 }).toBe(true);
  expect(await page.evaluate(() => window.__game.journey.bridgeFixed)).toBe(true);
  await shot(page, 'jw-bridge-mended');
  // He'd had enough, so off he goes over it.
  await expect.poll(async () => (await tree(page)).place, { timeout: 30_000 }).toBe('hill');
  await stopMoving(page);
});

test('level 8: on the snowy hill, a real fist held on frosty fruit warms it, and then picks it', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, GAME, atLevel(GAME, 8));
  await skipTo(page, 3);
  await storyIs(page, 'tur');
  const { fruit } = await tree(page);
  expect(fruit.filter(({ frost }) => frost)).toHaveLength(2);
  expect(await page.evaluate(() => window.__game.walk.snow.length)).toBeGreaterThan(0);
  await page.waitForTimeout(800);
  await shot(page, 'jw-frost');
  // Only one frosty one left on the tree, so the fist can't pick another.
  const frosty = fruit.findIndex(({ frost }) => frost);
  await page.evaluate((at) => {
    const { walk } = window.__game;
    walk.level = { ...walk.level, butterflies: false };
    walk.monkey = null;
    walk.monkeyIn = 1000;
    walk.fruit.forEach((one, index) => {
      if (index !== at) one.state = 'gone';
    });
  }, frosty);
  await reach(page, (state) => state.fruit[frosty]);
  await handIs(page, 'fist');
  await expect.poll(async () => (await tree(page)).fruit[frosty].warmth, { timeout: 15_000 }).toBeGreaterThan(0.2);
  await shot(page, 'jw-frost-warming');
  await expect.poll(async () => (await tree(page)).fruit[frosty].frost, { timeout: 15_000 }).toBe(false);
  await expect.poll(async () => (await tree(page)).holding, { timeout: 15_000 }).not.toBeNull();
});

test('level 9: in the evening, a real fist catches a firefly as a gift', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, GAME, atLevel(GAME, 9));
  await skipTo(page, 3);
  await storyIs(page, 'tur');
  await page.evaluate(() => {
    const { walk } = window.__game;
    walk.level = { ...walk.level, butterflies: false };
    walk.monkey = null;
    walk.monkeyIn = 1000;
  });
  const { flies } = await tree(page);
  expect(flies).toHaveLength(2);
  await page.waitForTimeout(800);
  await shot(page, 'jw-fireflies');
  // A fist following it about, as it goes round slowly.
  const until = Date.now() + 40_000;
  while ((await tree(page)).stats.firefly === 0 && Date.now() < until) {
    const fly = (await tree(page)).flies.find(({ caught }) => !caught);
    await moveGloveTo(page, GLOVE, fly.x, fly.y, { right: 'fist' });
    await page.waitForTimeout(500);
  }
  expect((await tree(page)).stats.firefly).toBeGreaterThanOrEqual(1);
  await stopMoving(page);
});

test('level 10: a real fist on the feather brings the parrot, who feeds Giraffe a fruit by himself', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 10));
  await storyIs(page, 'giraffe');
  await page.evaluate(() => {
    const { walk } = window.__game;
    walk.level = { ...walk.level, butterflies: false };
  });
  const { items } = await tree(page);
  expect(items.map(({ kind }) => kind)).toEqual(['feather']);
  await reach(page, (state) => state.items[0]);
  await handIs(page, 'fist');
  await expect.poll(async () => (await tree(page)).parrot, { timeout: 15_000 }).not.toBeNull();
  await handIs(page, 'open');
  await moveGloveTo(page, GLOVE, 0.5, 0.85);
  await expect.poll(async () => (await tree(page)).parrot, { timeout: 15_000 }).toBe('to-mouth');
  await page.waitForTimeout(500);
  await shot(page, 'jw-parrot');
  await expect.poll(async () => (await tree(page)).fed, { timeout: 15_000 }).toBe(1);
  await stopMoving(page);
});

test('level 10: every stop fed still brings Giraffe home, with the gifts on the finish card', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 10));
  const feedThisStop = () => page.evaluate(() => {
    const { journey: rules, walk } = window.__game;
    rules.gift('flower');
    if (walk.bridge) walk.bridge.fixed = true;
    rules.fixBridge();
    while (rules.fed < rules.stop.count) rules.feed();
  });
  for (const [who, index] of [['giraffe', 0], ['mochi', 1], ['bramble', 2], ['tur', 3], ['giraffe', 4]]) {
    await expect.poll(async () => (await tree(page)).index, { timeout: 30_000 }).toBe(index);
    await storyIs(page, who);
    await page.waitForTimeout(300);
    if (index === 2) await shot(page, 'jw-l10-river');
    if (index === 4) await shot(page, 'jw-l10-home');
    await feedThisStop();
    if (index === 0) {
      expect(await page.evaluate(() => window.__game.walk.walkLasts)).toBeCloseTo(2.2, 5);
    }
  }
  await waitForScreen(page, 'finish');
  await expect(page.locator('#screen-finish')).toContainText('The giraffe is home!');
  await expect(page.locator('#level-done-text')).toHaveText('All 10 levels done!');
  expect((await tree(page)).fed).toBe(19);
  await expect(page.locator('#sum-right-gifts')).toHaveText(String((await tree(page)).gifts));
  await page.waitForTimeout(600);
  await shot(page, 'jw-finish');
});

for (const level of [1, 6, 10]) {
  test(`nothing flashes at level ${level}: fruit, butterflies, the monkey, gifts, feeding and walking on`, async ({ page }) => {
    test.setTimeout(240_000);
    await startPlaying(page, GAME, atLevel(GAME, level));
    await storyIs(page, 'giraffe');
    // Feeding him a fruit every so often, so he walks on to the next tree in the meantime, with gifts.
    await page.evaluate(() => {
      window.__feeding = setInterval(() => {
        const { journey: rules, walk } = window.__game;
        if (!rules.stop || walk.walking > 0 || !walk.fruit.length || rules.fed >= rules.stop.count) return;
        if (walk.bridge) walk.bridge.fixed = true;
        rules.fixBridge();
        if (rules.level.golden) walk.addGift('flower', walk.width * 0.6, walk.height * 0.4);
        rules.feed();
      }, 700);
    });
    const result = judgeBrightness(await watchBrightness(page, 420, CANVASES));
    const { index } = await tree(page);
    await page.evaluate(() => clearInterval(window.__feeding));
    console.log(`level ${level}`, JSON.stringify(result), 'stop', index);
    expect(index).toBeGreaterThanOrEqual(1);
    expect(result.biggestStep).toBeLessThan(3);
    expect(result.flickeringShare).toBeLessThan(0.02);
  });
}

test('nothing flashes at level 9 on the snowy evening hill, with fireflies and snow', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, GAME, atLevel(GAME, 9));
  await skipTo(page, 3);
  await page.evaluate(() => {
    const { walk } = window.__game;
    walk.monkeyIn = 0;
    setTimeout(() => walk.addGift('coconut', walk.width * 0.6, walk.height * 0.4), 500);
  });
  const result = judgeBrightness(await watchBrightness(page, 300, CANVASES));
  console.log('hill', JSON.stringify(result));
  expect(result.biggestStep).toBeLessThan(3);
  expect(result.flickeringShare).toBeLessThan(0.02);
});

test('level 10 with reduced motion: the fruit sways half as far, and no snow falls', async ({ page }) => {
  test.setTimeout(150_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startPlaying(page, GAME, atLevel(GAME, 10));
  await storyIs(page, 'giraffe');
  const furthest = await page.evaluate(async () => {
    const { walk } = window.__game;
    let most = 0;
    for (let i = 0; i < 60; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      for (const fruit of walk.fruit) if (fruit.state === 'hanging') most = Math.max(most, Math.abs(fruit.x - fruit.homeX) / walk.width);
    }
    return most;
  });
  expect(furthest).toBeGreaterThan(0.002);
  expect(furthest).toBeLessThanOrEqual(0.0111);
  await skipTo(page, 3);
  expect(await page.evaluate(() => window.__game.walk.snow.length)).toBe(0);
});

test('level 7: a plank dropped away from the gap goes back on the tree, so the bridge can still be mended', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page, GAME, atLevel(GAME, 7));
  await skipTo(page, 0);
  await page.evaluate(() => {
    window.__skip = setInterval(() => {
      const { journey, walk } = window.__game;
      if (journey.index < 2 && journey.stop && walk.walking === 0 && walk.fruit.length) while (journey.wanted) journey.feed();
    }, 300);
  });
  await expect.poll(async () => (await tree(page)).place, { timeout: 30_000 }).toBe('river');
  await page.evaluate(() => clearInterval(window.__skip));
  // Dropped the way an opening hand away from the gap drops it.
  await page.evaluate(() => {
    const plank = window.__game.walk.items.find(({ kind }) => kind === 'plank');
    plank.state = 'falling';
    plank.vy = 0;
  });
  const plankState = () => page.evaluate(() => window.__game.walk.items.find(({ kind }) => kind === 'plank')?.state);
  await expect.poll(plankState, { timeout: 15_000 }).toBe('hanging');
});

/** Notes the words drawn on a canvas from now on, such as the names of new things. */
const watchWords = (page, scene) => page.evaluate((name) => {
  const { ctx } = window.__game[name];
  const fillText = ctx.fillText.bind(ctx);
  window.__drawn = new Set();
  ctx.fillText = (text, ...rest) => {
    window.__drawn.add(text);
    return fillText(text, ...rest);
  };
}, scene);
const drawn = (page, words) => page.evaluate((wanted) => [...window.__drawn].some((text) => text.includes(wanted)), words);

test('level 10: the finish card counts the fruit the child fed, in all and by hand, and not the parrot\'s', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, GAME, atLevel(GAME, 10));
  await storyIs(page, 'giraffe');
  // The parrot feeds Giraffe a fruit that isn't the golden one, as if the feather had been taken.
  await page.evaluate(() => {
    const { walk } = window.__game;
    walk.level = { ...walk.level, butterflies: false };
    walk.items.find(({ kind }) => kind === 'feather').state = 'gone';
    const fruit = walk.fruit.find((one) => walk.pickable(one) && !one.golden);
    const fromX = walk.width * 1.05;
    const fromY = walk.height * 0.45;
    walk.parrot = { fruit, t: 0, state: 'to-fruit', x: fromX, y: fromY, fromX, fromY };
  });
  await expect.poll(async () => (await tree(page)).fed, { timeout: 15_000 }).toBe(1);
  // An open hand held at his mouth, with a fruit put in it: that's a fruit the hand fed him.
  const { mouth } = await tree(page);
  await moveGloveTo(page, GLOVE, mouth.x, mouth.y);
  await expect.poll(() => page.evaluate(() => window.__game.walk.onMouth), { timeout: 30_000 }).toBe(true);
  const feedByHand = (golden) => page.evaluate((wanted) => {
    const { walk } = window.__game;
    const fruit = walk.fruit.find((one) => walk.pickable(one) && one.golden === wanted);
    fruit.state = 'held';
    walk.picking.held = fruit;
  }, golden);
  await feedByHand(false);
  await expect.poll(async () => (await tree(page)).fed, { timeout: 10_000 }).toBe(2);
  // The golden fig is the last he needs here, so he walks on to the mangoes as it goes up to the count,
  // and it goes up as a golden fig.
  await page.evaluate(() => {
    const { walk } = window.__game;
    window.__golden = null;
    const look = () => {
      const flier = walk.flying.find(({ kind }) => kind === 'golden');
      if (flier) window.__golden = `${walk.place} ${flier.fruit}`;
      else requestAnimationFrame(look);
    };
    look();
  });
  await feedByHand(true);
  await expect.poll(() => page.evaluate(() => window.__golden), { timeout: 10_000 }).toBe('grass fig');
  // The rest of the way through the rules, which isn't the child's hand.
  await page.evaluate(() => {
    window.__skip = setInterval(() => {
      const { journey, walk } = window.__game;
      if (!journey.stop || walk.walking > 0 || !walk.fruit.length) return;
      if (walk.bridge) walk.bridge.fixed = true;
      journey.fixBridge();
      while (journey.wanted) journey.feed();
    }, 300);
  });
  await waitForScreen(page, 'finish');
  await page.evaluate(() => clearInterval(window.__skip));
  expect((await tree(page)).fed).toBe(19);
  // Two fed by the hand: the big number and the rows agree.
  await expect(page.locator('#finish-hero')).toHaveText('2');
  await expect(page.locator('#sum-right-fed')).toHaveText('2');
  await expect(page.locator('#sum-left-fed')).toHaveText('0');
});

test('level 6: the monkey climbs up with a fruit, and when he gives it back it goes back to its branch, without jumping', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 6));
  await skipTo(page, 1);
  await moveGloveTo(page, GLOVE, 0.5, 0.85);
  const moves = await page.evaluate(async () => {
    const { walk } = window.__game;
    walk.level = { ...walk.level, butterflies: false, monkeyStays: 2.5 };
    walk.monkeyIn = 1000;
    // He comes for the lowest fruit, as far as can be from the treetop he climbs to.
    const fruit = walk.fruit.filter((one) => walk.pickable(one)).reduce((low, one) => (one.homeY > low.homeY ? one : low));
    const homeX = walk.treeAcross * walk.width;
    const homeY = 0.08 * walk.height;
    walk.monkey = { state: 'coming', fruit, t: 0, x: homeX, y: homeY, fromX: homeX, fromY: homeY, homeX, homeY };
    const states = new Set();
    let monkeyAt = null;
    let fruitAt = null;
    let monkeyStep = 0;
    let fruitStep = 0;
    const until = performance.now() + 6000;
    while (performance.now() < until) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const { monkey } = walk;
      if (monkey) {
        states.add(monkey.state);
        if (monkeyAt) monkeyStep = Math.max(monkeyStep, Math.hypot(monkey.x - monkeyAt.x, monkey.y - monkeyAt.y) / walk.height);
        monkeyAt = { x: monkey.x, y: monkey.y };
      }
      if (fruitAt) fruitStep = Math.max(fruitStep, Math.hypot(fruit.x - fruitAt.x, fruit.y - fruitAt.y) / walk.height);
      fruitAt = { x: fruit.x, y: fruit.y };
    }
    return { states: [...states], monkeyStep, fruitStep, state: fruit.state, fromHome: Math.hypot(fruit.x - fruit.homeX, fruit.y - fruit.homeY) / walk.height };
  });
  console.log('monkey', JSON.stringify(moves));
  expect(moves.states).toEqual(['coming', 'holding', 'going']);
  // At most a little each frame, even on a busy computer.
  expect(moves.monkeyStep).toBeLessThan(0.05);
  expect(moves.fruitStep).toBeLessThan(0.05);
  // And the fruit is back on its branch.
  expect(moves.state).toBe('hanging');
  expect(moves.fromHome).toBeLessThan(0.05);
});

test('level 9: at the end of the walk a butterfly flies off, and fireflies that have faded can\'t be caught', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, GAME, atLevel(GAME, 9));
  await skipTo(page, 4);
  await storyIs(page, 'giraffe');
  // The open hand on a firefly's loop, where a fist would catch it.
  const fly = await page.evaluate(() => {
    const { walk } = window.__game;
    walk.monkey = null;
    walk.monkeyIn = 1000;
    const [one] = walk.flies;
    return { x: one.cx / walk.width, y: one.cy / walk.height };
  });
  await moveGloveTo(page, GLOVE, fly.x, fly.y);
  await expect.poll(() => page.evaluate(() => window.__game.walk.gloves.right.visible), { timeout: 15_000 }).toBe(true);
  // A butterfly on a fruit.
  await page.evaluate(() => {
    window.__game.walk.butterflyIn = 0;
  });
  await expect.poll(() => page.evaluate(() => window.__game.walk.butterfly?.t ?? 0), { timeout: 10_000 }).toBeGreaterThan(0.9);
  // Giraffe has had enough, and his thank-you lasts a good while for this.
  const leaving = await page.evaluate(() => {
    const { journey, walk, session } = window.__game;
    while (journey.wanted) journey.feed();
    session.game.timer = 60;
    return walk.butterfly?.leaving;
  });
  expect(leaving).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__game.walk.butterfly), { timeout: 5000 }).toBeNull();
  await shot(page, 'jw-home-thanks');
  // A fist where the fireflies were catches nothing now.
  await handIs(page, 'fist');
  await expect.poll(async () => (await hands(page)).right.status, { timeout: 10_000 }).toBe('closed');
  await page.waitForTimeout(1500);
  expect((await tree(page)).stats.firefly).toBe(0);
  await page.evaluate(() => {
    window.__game.session.game.timer = 0;
  });
  await waitForScreen(page, 'finish');
});

test('level 10: the parrot\'s name is shown even when the feather is taken while another name shows, in the voice\'s language', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, GAME, atLevel(GAME, 10));
  await storyIs(page, 'giraffe');
  await moveGloveTo(page, GLOVE, 0.5, 0.85);
  await watchWords(page, 'walk');
  // Nothing has been named yet, and the golden fruit's name is showing.
  await page.evaluate(() => {
    const { walk } = window.__game;
    walk.level = { ...walk.level, butterflies: false };
    walk.labels = [];
    walk.introduced = new Set();
    const golden = walk.fruit.find((one) => one.golden);
    walk.introduce('golden', () => (golden.state === 'hanging' ? golden : null));
  });
  await expect.poll(() => drawn(page, 'Golden fruit'), { timeout: 5000, intervals: [100] }).toBe(true);
  // The feather is taken before its name's turn.
  await page.evaluate(() => {
    const { walk } = window.__game;
    const feather = walk.items.find(({ kind }) => kind === 'feather');
    walk.introduce('parrot', () => (feather.state === 'hanging' ? feather : null));
    feather.state = 'gone';
    walk.sendParrot();
  });
  // It's named beside the parrot instead.
  await expect.poll(() => drawn(page, 'Parrot helper'), { timeout: 8000, intervals: [100] }).toBe(true);
  // A grown-up changes the voice to Georgian while it shows, and the name changes with it.
  await page.evaluate(() => window.__game.session.changeSettings({ language: 'ka' }));
  await expect.poll(() => drawn(page, 'თუთიყუში მეგობარი'), { timeout: 3000, intervals: [100] }).toBe(true);
});

test('level 8: the snow fades away as Giraffe walks home from the hill, rather than all going at once', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 8));
  await skipTo(page, 3);
  await storyIs(page, 'tur');
  const shown = await page.evaluate(async () => {
    const { walk, journey } = window.__game;
    // How much snow can be seen: none once it's gone, and otherwise as much as shows.
    const snow = () => (walk.snow.length ? walk.snowShown ?? 1 : 0);
    const seen = [snow()];
    while (journey.wanted) journey.feed();
    while (walk.walking > 0 || seen.length < 10) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      seen.push(snow());
    }
    for (let i = 0; i < 10; i += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      seen.push(snow());
    }
    return seen;
  });
  expect(shown[0]).toBe(1);
  expect(shown.at(-1)).toBe(0);
  const drops = shown.slice(1).map((value, index) => shown[index] - value);
  expect(Math.max(...drops)).toBeLessThan(0.1);
});

test('the pictures of the places are kept from one walk to the next, and only drawn again when a place looks different', async ({ page }) => {
  await startPlaying(page, GAME, atLevel(GAME, 8));
  await storyIs(page, 'giraffe');
  const kept = await page.evaluate(() => {
    const { walk } = window.__game;
    const baobab = walk.sceneFor('baobab');
    const hill = walk.sceneFor('hill');
    // Another walk at the same level.
    walk.setLevel(8);
    const again = walk.sceneFor('baobab') === baobab && walk.sceneFor('hill') === hill;
    // And at level 9, where the hill is in the evening as well as snowy.
    walk.setLevel(9);
    return { again, baobab: walk.sceneFor('baobab') === baobab, hill: walk.sceneFor('hill') === hill };
  });
  expect(kept).toEqual({ again: true, baobab: true, hill: false });
});

test('level 3: the names of what was on a tree go with it, rather than showing as Giraffe walks on', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page, GAME, atLevel(GAME, 3));
  await storyIs(page, 'giraffe');
  await watchWords(page, 'walk');
  // He's had enough at the first tree straight away, with a name showing and another waiting its turn.
  const walked = await page.evaluate(async () => {
    const { walk, journey } = window.__game;
    const names = walk.labels.length;
    while (journey.wanted) journey.feed();
    // Past the moment a name already showing takes to fade out, and up to the frame before he gets to
    // the next tree, whose own names can come as he arrives.
    await new Promise((resolve) => setTimeout(resolve, 700));
    window.__drawn.clear();
    let drawn = [];
    while (walk.walking > 0) {
      drawn = [...window.__drawn];
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return { names, drawn };
  });
  expect(walked.names).toBeGreaterThanOrEqual(2);
  expect(walked.drawn).toEqual([]);
});
