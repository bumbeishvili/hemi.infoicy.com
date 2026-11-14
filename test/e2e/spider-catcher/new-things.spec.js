// Spider Catcher's new things, level by level, with real photos going through the real tracker: berries
// left where a spider was caught, the ladybird and her flower, sleepy spiders, the butterfly, the basket
// for two, treasure chests, two webs, leaf boats and the golden spider, the berry tally and the "New:" chips.
import { expect, openGame, screenName, shot, show, test, waitForScreen } from '../helpers.js';
import { atLevel, moveGloveTo, stopMoving, storyIs } from '../story-games/helpers.js';
import { GAME, GLOVE, garden, handIs, holdStill, startPlaying } from './helpers.js';

const extras = (page) => page.evaluate(() => {
  const { garden: place } = window.__game;
  const { basket, chest, butterfly } = place.helpers;
  return {
    berries: place.berries.length,
    picked: place.berryTotal,
    ladybirds: place.ladybirds.left + place.ladybirds.right,
    basket: basket?.state ?? null,
    chest: chest?.state ?? null,
    butterfly: butterfly?.state ?? null,
    slow: place.slow,
    holds: place.catching.holds,
    carried: place.catching.carried.length,
    webs: place.webs.length,
    glow: place.webGlow?.index ?? null,
    labels: place.labels.map(({ key }) => key),
  };
});

/** On to the place at this index, by bringing everyone home at the places before it. */
async function goToPlace(page, index) {
  for (let at = 0; at < index; at += 1) {
    await expect.poll(async () => (await garden(page)).index, { timeout: 30_000 }).toBe(at);
    await page.evaluate(() => {
      const { gathering } = window.__game;
      while (gathering.home < gathering.place.count) gathering.spiderHome();
    });
  }
  await expect.poll(async () => (await garden(page)).index, { timeout: 30_000 }).toBe(index);
  await expect.poll(() => page.evaluate(() => window.__game.garden.moving), { timeout: 10_000 }).toBe(0);
}

/**
 * Where the spider a test wants is, by name, as the page's security policy doesn't let a test hand it
 * code to run: 'playing' is any out playing, 'single' one that isn't a twin, and the others by kind.
 */
const spiderAtNamed = (page, which) => page.evaluate((name) => {
  const { garden: place } = window.__game;
  const tests = {
    playing: (spider) => spider.state === 'playing' && !spider.sleepy,
    single: (spider) => spider.state === 'playing' && spider.pair === null,
    asleep: (spider) => spider.state === 'asleep',
    ladybird: (spider) => spider.kind === 'ladybird' && spider.state === 'playing',
    boat: (spider) => spider.kind === 'boat' && spider.state === 'playing',
    golden: (spider) => spider.golden && spider.state === 'playing',
  };
  const index = place.spiders.findIndex(tests[name]);
  if (index < 0) return null;
  const spider = place.spiders[index];
  const glove = place.gloves.right;
  return { index, x: spider.x, y: spider.y, width: place.width, height: place.height, gap: glove.visible ? Math.hypot(spider.x - glove.x, spider.y - glove.y) / place.catchReach : Infinity };
}, which);

/**
 * An open real hand onto the spider a test wants, held still. Nobody is shy, as that's tested elsewhere.
 * When it has to be that one, any others close by are moved a little way to the side, so it's the nearest.
 */
async function openOn(page, which) {
  await expect.poll(() => spiderAtNamed(page, which), { timeout: 15_000 }).not.toBeNull();
  await holdStill(page);
  // Held still, they jump to a new spot on the next frame, so that's where to go.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const exact = !['playing', 'single'].includes(which);
  // It may have just been caught, gone home or be landing, so it's asked for until there's one to go to.
  let found = null;
  await expect.poll(async () => {
    found = await spiderAtNamed(page, which);
    return found;
  }, { timeout: 15_000 }).not.toBeNull();
  const { index, x, y, width, height } = found;
  await page.evaluate(({ at, aside }) => {
    const { garden: place } = window.__game;
    const target = place.spiders[at];
    for (const spider of place.spiders) {
      spider.shy = false;
      if (!aside || spider === target || ['held', 'home', 'landing'].includes(spider.state)) continue;
      if (Math.hypot(spider.x - target.x, spider.y - target.y) < place.catchReach * 2.2) {
        spider.shift.x += (spider.x < target.x ? -0.14 : 0.14) * place.way;
      }
    }
  }, { at: index, aside: exact });
  await moveGloveTo(page, GLOVE, x / width, y / height);
  await expect.poll(() => page.evaluate(({ at, exact }) => {
    const { garden: place } = window.__game;
    const spider = place.spiders[at];
    const glove = place.gloves.right;
    return glove.visible && window.__game.monitor.snapshot.right.status === 'open'
      && Math.hypot(spider.x - glove.x, spider.y - glove.y) < place.catchReach * 0.8
      && (!exact || spider.state !== 'playing' || place.spiderNear(glove) === spider);
  }, { at: index, exact }), { timeout: 20_000 }).toBe(true);
  // The one to catch, for closeAndCatch.
  await page.evaluate((at) => {
    window.__target = at;
  }, index);
}

/**
 * Closes the real hand where it is, and waits for whatever's there to be caught into the hand. The photo
 * of a fist puts the glove a little way from where the open hand's did, as a real hand closing wouldn't,
 * so the spider openOn went to is kept under the glove while it closes, and it's the one caught.
 */
async function closeAndCatch(page) {
  await page.evaluate(() => {
    clearInterval(window.__keep);
    const at = window.__target;
    window.__target = null;
    if (at === null || at === undefined) return;
    window.__keep = setInterval(() => {
      const { garden: place } = window.__game;
      const spider = place.spiders[at];
      const glove = place.gloves.right;
      if (!spider || place.catching.held) {
        clearInterval(window.__keep);
        return;
      }
      if (spider.state !== 'playing' || !glove.visible) return;
      // In path terms, which are mirrored for the left hand.
      spider.shift.x += (place.way * (glove.x - spider.x)) / place.height;
      spider.shift.y += (glove.y - spider.y) / place.height;
    }, 16);
  });
  await handIs(page, 'fist');
  await expect.poll(() => page.evaluate(() => Boolean(window.__game.garden.catching.held)), { timeout: 15_000 }).toBe(true);
  await page.evaluate(() => clearInterval(window.__keep));
}

/**
 * Carries what's held, in a closed real hand, to where it goes: 'home' is its own web or the ladybird's
 * flower, and 'other' the other of two webs. The hand keeps following it, as a web can sway, and opens
 * once it's there.
 */
async function carryTo(page, where, { open = true } = {}) {
  await page.evaluate((target) => {
    window.__move?.stop();
    window.__steadySince = null;
    window.__spot = null;
    let x = window.__move?.offsetX ?? 0;
    let y = window.__move?.offsetY ?? 0;
    const timer = setInterval(() => {
      const { garden: place } = window.__game;
      const glove = place.gloves.right;
      const carried = place.holding;
      if (glove.visible && carried) {
        const own = carried.kind === 'ladybird' ? place.flower : place.webOf(carried);
        const spot = target === 'other' ? place.webs.find((web) => web.index !== own.index) : own;
        // Gently, so it doesn't swing past.
        x += ((spot.x - glove.x) / innerWidth) * 1280 * 0.05;
        y += ((spot.y - glove.y) / innerHeight) * 720 * 0.05;
        window.__spot = spot;
        const there = Math.hypot(glove.x - spot.x, glove.y - spot.y) < spot.reach * 0.5;
        window.__steadySince = there ? (window.__steadySince ?? performance.now()) : null;
      }
      window.__move = { offsetX: x, offsetY: y, stop: () => clearInterval(timer) };
      window.__camera.show({ left: null, right: 'fist', scale: 0.7, rightOffsetX: x, rightOffsetY: y });
    }, 33);
    window.__move = { offsetX: x, offsetY: y, stop: () => clearInterval(timer) };
  }, where);
  // There, and staying there for a moment, as a hand that's still on its way would open past it.
  await expect.poll(() => page.evaluate(() => Boolean(window.__game.garden.holding && window.__steadySince
    && performance.now() - window.__steadySince > 700)), { timeout: 40_000 }).toBe(true);
  if (open) await handIs(page, 'open');
}

/* ---------- the chips ---------- */

test('level 1\'s title card has nothing new on it', async ({ page }) => {
  await openGame(page, atLevel(GAME, 1), GAME);
  await expect(page.locator('#level-new')).toBeEmpty();
});

for (const [level, words] of [[2, ['Berries']], [5, ['Butterfly', 'Shy spiders']], [8, ['Two webs']], [10, ['Golden spider']]]) {
  test(`level ${level}'s title card and countdown show what's new`, async ({ page }) => {
    await openGame(page, atLevel(GAME, level), GAME);
    for (const word of words) await expect(page.locator('#level-new')).toContainText(word);
    if (level === 5) await shot(page, 'spider-new-title-5');
    await show(page, null, 'open', { scale: 0.7 });
    await page.locator('#start').click();
    // The countdown is over in a moment, so its chips are read as soon as it has started, or after.
    await expect.poll(() => screenName(page), { timeout: 60_000, intervals: [100] }).toMatch(/countdown|playing/);
    for (const word of words) await expect(page.locator('#level-new-now')).toContainText(word);
  });
}

/* ---------- level by level ---------- */

test('level 2: a spider caught leaves a berry, picked up when the hand comes back by it, and counted', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 2));
  await storyIs(page, 'giraffe');
  await expect(page.locator('.chip-berries')).toBeVisible();
  await openOn(page, 'playing');
  await closeAndCatch(page);
  await expect.poll(async () => (await extras(page)).berries, { timeout: 5000 }).toBe(1);
  // Not picked up by the hand that's still there.
  await page.waitForTimeout(800);
  expect((await extras(page)).picked).toBe(0);
  await page.waitForTimeout(400);
  await shot(page, 'spider-new-berry');
  const berry = await page.evaluate(() => ({ x: window.__game.garden.berries[0].x, y: window.__game.garden.berries[0].y }));
  // Off to the web with the spider, and back by the berry.
  await carryTo(page, 'home');
  await expect.poll(async () => (await garden(page)).home, { timeout: 15_000 }).toBe(1);
  const { width, height } = await garden(page);
  await moveGloveTo(page, GLOVE, berry.x / width, berry.y / height);
  await expect.poll(async () => (await extras(page)).picked, { timeout: 30_000 }).toBe(1);
  await stopMoving(page);
  await expect(page.locator('#chip-berries')).toHaveText('1');
  await page.evaluate(() => {
    const { gathering } = window.__game;
    while (!gathering.over) {
      while (gathering.home < gathering.place.count) gathering.spiderHome();
      gathering.nextPlace();
    }
  });
  await waitForScreen(page, 'finish');
  await expect(page.locator('#sum-right-berries')).toHaveText('1');
  await expect(page.locator('#finish-prizes')).toContainText('🍓 1');
  await expect(page.locator('#level-next-new')).toContainText('Ladybird');
  await page.waitForTimeout(700);
  await shot(page, 'spider-new-finish');
});

test('level 3: a ladybird plays at the carrots, and goes home to her flower, not the web', async ({ page }) => {
  test.setTimeout(200_000);
  await startPlaying(page, GAME, atLevel(GAME, 3));
  await goToPlace(page, 1);
  await storyIs(page, 'mochi');
  await expect.poll(() => page.evaluate(() => window.__game.garden.spiders.some(({ kind }) => kind === 'ladybird')), { timeout: 15_000 }).toBe(true);
  await page.waitForTimeout(500);
  await shot(page, 'spider-new-ladybird');
  await openOn(page, 'ladybird');
  await closeAndCatch(page);
  expect(await page.evaluate(() => window.__game.garden.holding.kind)).toBe('ladybird');
  // Opened at the web, she just goes back to playing.
  const web = await page.evaluate(() => window.__game.garden.web);
  const size = await garden(page);
  await moveGloveTo(page, GLOVE, web.x / size.width, web.y / size.height, { right: 'fist' });
  await expect.poll(() => page.evaluate(() => {
    const { garden: place } = window.__game;
    return place.atHome(place.web);
  }), { timeout: 30_000 }).toBe(true);
  await handIs(page, 'open');
  await expect.poll(async () => (await garden(page)).letGo, { timeout: 15_000 }).toBe(1);
  expect((await extras(page)).ladybirds).toBe(0);
  // Caught again, and opened at her flower, she's home.
  await openOn(page, 'ladybird');
  await closeAndCatch(page);
  await carryTo(page, 'home', { open: false });
  await shot(page, 'spider-new-ladybird-flower');
  await handIs(page, 'open');
  await expect.poll(async () => (await extras(page)).ladybirds, { timeout: 15_000 }).toBe(1);
  expect((await garden(page)).home).toBeGreaterThanOrEqual(4);
});

test('level 4: a sleepy spider can\'t be caught until an open hand held by it wakes it', async ({ page }) => {
  test.setTimeout(200_000);
  await startPlaying(page, GAME, atLevel(GAME, 4));
  await storyIs(page, 'giraffe');
  // The hand down out of the way, and the second one out asleep, the way the level brings them.
  await moveGloveTo(page, GLOVE, 0.3, 0.9);
  await expect.poll(() => page.evaluate(() => {
    const { garden: place } = window.__game;
    return place.gloves.right.visible && place.gloves.right.y > place.height * 0.8 && place.spiders.length > 1;
  }), { timeout: 20_000 }).toBe(true);
  await page.evaluate(() => {
    const { garden: place } = window.__game;
    place.spiders.forEach((spider, index) => Object.assign(spider, index === 1
      ? { state: 'asleep', asleepFor: -60, waking: 0, sleepy: true, shy: false }
      : { state: spider.state === 'asleep' ? 'playing' : spider.state, sleepy: false }));
  });
  await page.waitForTimeout(600);
  await shot(page, 'spider-new-sleepy');
  expect(await page.evaluate(() => window.__game.garden.catchable(window.__game.garden.spiders[1]))).toBe(false);
  await openOn(page, 'asleep');
  // Woken, it plays on from where it is, so the hand that woke it can close on it straight away.
  await expect.poll(() => page.evaluate(() => window.__game.garden.spiders[1].state), { timeout: 10_000 }).toBe('playing');
  await closeAndCatch(page);
  expect(await page.evaluate(() => window.__game.garden.spiders.indexOf(window.__game.garden.catching.held))).toBe(1);
  // And one left alone wakes by itself.
  await page.evaluate(() => {
    const spider = window.__game.garden.spiders[0];
    Object.assign(spider, { state: 'asleep', asleepFor: 11.5, waking: 0 });
  });
  await expect.poll(() => page.evaluate(() => window.__game.garden.spiders[0].state), { timeout: 5000 }).not.toBe('asleep');
});

test('level 5: the butterfly comes, and touched, the spiders slow right down to watch it for a while', async ({ page }) => {
  test.setTimeout(200_000);
  await startPlaying(page, GAME, atLevel(GAME, 5));
  await storyIs(page, 'giraffe');
  await moveGloveTo(page, GLOVE, 0.5, 0.3);
  await expect.poll(async () => (await extras(page)).butterfly, { timeout: 15_000 }).toBe('resting');
  await stopMoving(page);
  await page.waitForTimeout(300);
  await shot(page, 'spider-new-butterfly-resting');
  const spot = await page.evaluate(() => {
    const { garden: place } = window.__game;
    return { x: place.helpers.butterfly.x / place.width, y: place.helpers.butterfly.y / place.height };
  });
  await moveGloveTo(page, GLOVE, spot.x, spot.y);
  await expect.poll(async () => (await extras(page)).butterfly, { timeout: 30_000 }).toBe('helping');
  await stopMoving(page);
  const rate = await page.evaluate(async () => {
    const { garden: place } = window.__game;
    const [time, play] = [place.time, place.playTime];
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return (place.playTime - play) / (place.time - time);
  });
  expect(rate).toBeCloseTo(0.45, 2);
  await page.waitForTimeout(800);
  await shot(page, 'spider-new-butterfly-helping');
  // It flies off after a while, and the spiders go back to their speed.
  await page.evaluate(() => {
    const { butterfly } = window.__game.garden.helpers;
    if (butterfly?.state === 'helping') butterfly.left = 0.2;
  });
  await expect.poll(async () => (await extras(page)).slow, { timeout: 15_000 }).toBe(1);
});

test('level 6: the basket carries two at once, and both go into the web together', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, GAME, atLevel(GAME, 6));
  await storyIs(page, 'giraffe');
  await expect.poll(async () => (await extras(page)).basket, { timeout: 10_000 }).toBe('waiting');
  await page.waitForTimeout(300);
  await shot(page, 'spider-new-basket');
  const at = await page.evaluate(() => {
    const { garden: place } = window.__game;
    return { x: place.helpers.basket.x / place.width, y: place.helpers.basket.y / place.height };
  });
  await moveGloveTo(page, GLOVE, at.x, at.y);
  await expect.poll(async () => (await extras(page)).basket, { timeout: 30_000 }).toBe('carried');
  expect((await extras(page)).holds).toBe(2);
  await openOn(page, 'playing');
  await closeAndCatch(page);
  // Opened away from the web, it goes in the basket.
  await handIs(page, 'open');
  await expect.poll(async () => (await extras(page)).carried, { timeout: 10_000 }).toBe(1);
  expect((await garden(page)).letGo).toBe(0);
  await openOn(page, 'playing');
  await closeAndCatch(page);
  expect((await extras(page)).carried).toBe(2);
  await shot(page, 'spider-new-basket-two');
  await carryTo(page, 'home');
  await expect.poll(async () => (await garden(page)).home, { timeout: 15_000 }).toBe(2);
  expect((await garden(page)).letGo).toBe(0);
});

test('level 7: a treasure chest at the carrots opens under an open hand held on it, and its berries are picked up', async ({ page }) => {
  test.setTimeout(200_000);
  await startPlaying(page, GAME, atLevel(GAME, 7));
  await goToPlace(page, 1);
  await expect.poll(async () => (await extras(page)).chest, { timeout: 10_000 }).toBe('waiting');
  await page.waitForTimeout(400);
  await shot(page, 'spider-new-chest');
  const at = await page.evaluate(() => {
    const { garden: place } = window.__game;
    return { x: place.helpers.chest.x / place.width, y: place.helpers.chest.y / place.height };
  });
  await moveGloveTo(page, GLOVE, at.x, at.y - 0.03);
  await expect.poll(async () => (await extras(page)).chest, { timeout: 30_000 }).toBe('open');
  await page.waitForTimeout(250);
  await shot(page, 'spider-new-chest-open');
  await expect.poll(async () => (await extras(page)).picked, { timeout: 15_000 }).toBe(4);
});

test('level 8: two webs, and each spider goes to the web of its colour; the wrong one just lets it go', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, GAME, atLevel(GAME, 8));
  await storyIs(page, 'giraffe');
  expect((await extras(page)).webs).toBe(2);
  await page.waitForTimeout(500);
  await shot(page, 'spider-new-two-webs');
  await openOn(page, 'single');
  await closeAndCatch(page);
  const right = await page.evaluate(() => window.__game.garden.webOf(window.__game.garden.holding));
  await carryTo(page, 'other');
  // The hand is moved there a little at a time, which a busy computer slows down.
  await expect.poll(async () => (await garden(page)).letGo, { timeout: 30_000 }).toBe(1);
  expect((await extras(page)).glow).toBe(right.index);
  await shot(page, 'spider-new-wrong-web');
  expect((await garden(page)).home).toBe(0);
  await openOn(page, 'single');
  await closeAndCatch(page);
  await carryTo(page, 'home');
  await expect.poll(async () => (await garden(page)).home, { timeout: 15_000 }).toBe(1);
});

test('level 9: a spider sails about on a leaf boat, and can be caught off it', async ({ page }) => {
  test.setTimeout(200_000);
  await startPlaying(page, GAME, atLevel(GAME, 9));
  await storyIs(page, 'giraffe');
  await expect.poll(() => page.evaluate(() => window.__game.garden.spiders.some(({ kind }) => kind === 'boat')), { timeout: 15_000 }).toBe(true);
  await page.waitForTimeout(600);
  await shot(page, 'spider-new-boat');
  await page.evaluate(() => {
    for (const spider of window.__game.garden.spiders) spider.shy = false;
  });
  await openOn(page, 'boat');
  await closeAndCatch(page);
  expect(await page.evaluate(() => window.__game.garden.holding.kind)).toBe('boat');
});

test('level 10: the golden spider brings a shower of berries home, which are picked up at the web', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, GAME, atLevel(GAME, 10));
  await storyIs(page, 'giraffe');
  await expect.poll(() => page.evaluate(() => window.__game.garden.spiders.some(({ golden }) => golden)), { timeout: 15_000 }).toBe(true);
  await page.evaluate(() => {
    for (const spider of window.__game.garden.spiders) Object.assign(spider, { shy: false });
    const golden = window.__game.garden.spiders.find(({ golden: gold }) => gold);
    if (golden.state === 'asleep') golden.state = 'playing';
  });
  await page.waitForTimeout(500);
  await shot(page, 'spider-new-golden');
  await openOn(page, 'golden');
  await closeAndCatch(page);
  await carryTo(page, 'home');
  await expect.poll(async () => (await garden(page)).home, { timeout: 15_000 }).toBe(1);
  await page.waitForTimeout(250);
  await shot(page, 'spider-new-golden-home');
  // Its berries, and the one the catch left behind if the hand passes it.
  await expect.poll(async () => (await extras(page)).picked, { timeout: 15_000 }).toBeGreaterThanOrEqual(5);
});

test('berries nobody picks up fade when Giraffe moves on, and cost nothing', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, GAME, atLevel(GAME, 2));
  await storyIs(page, 'giraffe');
  await show(page, null, null);
  await page.evaluate(() => {
    const { garden: place } = window.__game;
    place.dropBerry(place.width * 0.7, place.height * 0.6, { armed: true });
  });
  await page.evaluate(() => {
    const { gathering } = window.__game;
    while (gathering.home < gathering.place.count) gathering.spiderHome();
  });
  await expect.poll(async () => (await extras(page)).berries, { timeout: 10_000 }).toBe(0);
  expect((await extras(page)).picked).toBe(0);
  expect((await garden(page)).home).toBe(3);
});

/* ---------- fixes found in review ---------- */

const handStatus = (page) => page.evaluate(() => window.__game.monitor.snapshot.right.status);

test('level 8: with the basket, opening at one web only lets in the spider that lives there, and the other stays in the basket', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, GAME, atLevel(GAME, 8));
  await storyIs(page, 'giraffe');
  const ready = () => page.evaluate(() => {
    const { garden: place } = window.__game;
    const free = place.spiders.filter((spider) => spider.state === 'playing' && spider.kind !== 'ladybird' && spider.kind !== 'boat' && !spider.golden);
    return [0, 1].every((web) => free.some((spider) => spider.web === web));
  });
  await expect.poll(ready, { timeout: 15_000 }).toBe(true);
  // Nobody shy, as that's tested elsewhere.
  await page.evaluate(() => {
    for (const spider of window.__game.garden.spiders) spider.shy = false;
  });
  // A closed hand, carrying a pink spider in the basket and a blue one in the hand. It leaves the picture
  // first, so the fist hasn't just been open and can't catch anything by itself.
  await handIs(page, null);
  await expect.poll(() => handStatus(page), { timeout: 20_000 }).toBe('missing');
  await handIs(page, 'fist');
  await expect.poll(() => handStatus(page), { timeout: 20_000 }).toBe('closed');
  await expect.poll(() => page.evaluate(() => {
    const { garden: place } = window.__game;
    const pick = (web) => place.spiders.find((spider) => ['playing', 'dashing'].includes(spider.state) && spider.web === web && spider.kind !== 'ladybird' && spider.kind !== 'boat' && !spider.golden);
    const [pink, blue] = [pick(0), pick(1)];
    if (!pink || !blue) return false;
    for (const spider of [pink, blue]) Object.assign(spider, { state: 'held', dash: null });
    Object.assign(place.catching, { holds: 2, stash: [pink], held: blue });
    if (place.helpers.basket) place.helpers.basket.state = 'carried';
    window.__pair = { pink, blue };
    return true;
  }), { timeout: 15_000 }).toBe(true);
  // To the blue web, and open there.
  await carryTo(page, 'home', { open: false });
  await shot(page, 'spider-fix-basket-two-webs');
  await handIs(page, 'open');
  await expect.poll(async () => (await garden(page)).home, { timeout: 15_000 }).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__pair.blue.state), { timeout: 5000 }).toBe('home');
  const after = await page.evaluate(() => {
    const { garden: place } = window.__game;
    return {
      letGo: window.__game.gathering.stats.letGo,
      glow: place.webGlow?.index ?? null,
      carried: place.catching.carried.map((spider) => (spider === window.__pair.pink ? 'pink' : 'another')),
      pink: window.__pair.pink.state,
    };
  });
  // The pink one wasn't let go, and its web didn't glow: it's still in the basket.
  expect(after).toEqual({ letGo: 0, glow: null, carried: ['pink'], pink: 'held' });
  // Then the open hand takes the basket to the pink web, and it goes home too.
  const pinkWeb = await page.evaluate(() => {
    const { garden: place } = window.__game;
    return { x: place.webs[0].x / place.width, y: place.webs[0].y / place.height };
  });
  await moveGloveTo(page, GLOVE, pinkWeb.x, pinkWeb.y);
  await expect.poll(async () => (await garden(page)).home, { timeout: 30_000 }).toBe(2);
  await stopMoving(page);
  expect((await garden(page)).letGo).toBe(0);
});

test('level 4: a sleepy spider wakes on its own loop however long it slept, and moves across when the hand is switched', async ({ page }) => {
  test.setTimeout(200_000);
  await startPlaying(page, GAME, atLevel(GAME, 4));
  await storyIs(page, 'giraffe');
  // The hand away, so nothing wakes or catches it.
  await show(page, null, null);
  await expect.poll(() => page.evaluate(() => window.__game.garden.spiders.filter(({ state }) => state === 'playing').length), { timeout: 15_000 }).toBeGreaterThan(1);
  // One falls asleep where it is, and sleeps for three seconds while its loop would have carried on.
  const slept = await page.evaluate(async () => {
    const { garden: place } = window.__game;
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const spider = place.spiders.find((one) => one.state === 'playing' && one.pair === null && one.kind !== 'ladybird');
    Object.assign(spider, { state: 'asleep', asleepFor: 0, waking: 0, sleepy: true, shy: false });
    window.__sleeper = spider;
    await frame();
    await frame();
    const at = { x: spider.x, y: spider.y };
    const from = place.playTime;
    while (place.playTime - from < 3) await frame();
    return { at, now: { x: spider.x, y: spider.y }, width: place.width };
  });
  expect(Math.hypot(slept.now.x - slept.at.x, slept.now.y - slept.at.y)).toBeLessThan(0.5);
  await shot(page, 'spider-fix-sleeper-right');
  // Switched to the left hand, it goes across with the rest of the garden, and back again.
  const where = () => page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { x: window.__sleeper.x, y: window.__sleeper.y, state: window.__sleeper.state };
  });
  await page.evaluate(() => window.__game.session.changeSettings({ hands: 'left' }));
  const left = await where();
  expect(left.state).toBe('asleep');
  expect(Math.abs(left.x - (slept.width - slept.at.x))).toBeLessThan(1);
  expect(Math.abs(left.y - slept.at.y)).toBeLessThan(1);
  await shot(page, 'spider-fix-sleeper-left');
  await page.evaluate(() => window.__game.session.changeSettings({ hands: 'right' }));
  const back = await where();
  expect(Math.hypot(back.x - slept.at.x, back.y - slept.at.y)).toBeLessThan(1);
  // It wakes by itself, right where it is, and plays on round its own loop, in its own part of the garden.
  const woken = await page.evaluate(async () => {
    const { garden: place } = window.__game;
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const spider = window.__sleeper;
    const before = { x: spider.x, y: spider.y };
    spider.asleepFor = 1e6;
    while (spider.state === 'asleep') await frame();
    const first = { x: spider.x, y: spider.y };
    let offPath = 0;
    let furthest = 0;
    const end = place.playTime + 4;
    while (place.playTime < end && spider.state === 'playing') {
      await frame();
      const on = place.pathPoint(spider);
      const middle = place.gardenMiddle;
      offPath = Math.max(offPath, Math.hypot(spider.x - on.x, spider.y - on.y));
      furthest = Math.max(furthest, Math.hypot((spider.x - middle.x) / place.height, (spider.y - middle.y) / place.height));
    }
    // The furthest its own loop ever goes from the middle of the garden, in screen heights.
    const { path } = spider;
    const loop = Math.hypot(Math.abs(path.cx) + path.ax, Math.abs(path.cy) + path.ay);
    return { jump: Math.hypot(first.x - before.x, first.y - before.y) / place.height, shift: spider.shift, offPath, furthest, loop, state: spider.state };
  });
  expect(woken.state).toBe('playing');
  expect(woken.shift).toEqual({ x: 0, y: 0 });
  expect(woken.jump).toBeLessThan(0.01);
  expect(woken.offPath).toBeLessThan(1);
  expect(woken.furthest).toBeLessThanOrEqual(woken.loop + 0.001);
});

test('level 6: the basket, and its label, only come during play, never behind the countdown', async ({ page }) => {
  test.setTimeout(150_000);
  await openGame(page, atLevel(GAME, 6), GAME);
  await show(page, null, 'open', { scale: 0.7 });
  await page.locator('#start').click();
  const countdown = await page.evaluate(async () => {
    const seen = { frames: 0, basket: new Set(), labels: new Set() };
    const end = performance.now() + 60_000;
    while (window.__game.screen !== 'playing' && performance.now() < end) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (window.__game.screen !== 'countdown') continue;
      const { garden: place } = window.__game;
      seen.frames += 1;
      seen.basket.add(place.helpers.basket?.state ?? 'none');
      for (const { key } of place.labels) seen.labels.add(key);
    }
    return { frames: seen.frames, basket: [...seen.basket], labels: [...seen.labels], screen: window.__game.screen };
  });
  expect(countdown.screen).toBe('playing');
  expect(countdown.frames).toBeGreaterThan(20);
  expect(countdown.basket).toEqual(['coming']);
  expect(countdown.labels).toEqual([]);
  // In play, the basket comes, with its label on it.
  await expect.poll(() => page.evaluate(() => {
    const { garden: place } = window.__game;
    const label = place.labels.find(({ key }) => key === 'basket');
    return Boolean(label && label.target === place.helpers.basket && place.helpers.basket.state === 'waiting');
  }), { timeout: 15_000, intervals: [100] }).toBe(true);
  await shot(page, 'spider-fix-basket-label');
});

test('level 5: the butterfly\'s time only runs while the hand is open, so resting never wastes it', async ({ page }) => {
  test.setTimeout(200_000);
  await startPlaying(page, GAME, atLevel(GAME, 5));
  await storyIs(page, 'giraffe');
  await expect.poll(async () => (await extras(page)).butterfly, { timeout: 15_000 }).toBe('resting');
  // Sent off to help, as touching it does.
  await page.evaluate(() => {
    const { garden: place } = window.__game;
    const { butterfly } = place.helpers;
    Object.assign(butterfly, { state: 'helping', left: 8, from: { x: butterfly.x, y: butterfly.y }, flown: 0 });
    place.slow = 0.45;
  });
  const left = () => page.evaluate(() => window.__game.garden.helpers.butterfly?.left ?? null);
  // A closed hand, and then no hand at all: its time stands still, and the spiders stay slow.
  for (const [photo, status] of [['fist', 'closed'], [null, 'missing']]) {
    await handIs(page, photo);
    await expect.poll(() => handStatus(page), { timeout: 20_000 }).toBe(status);
    const from = await left();
    await page.waitForTimeout(1500);
    expect(await left()).toBeCloseTo(from, 5);
    expect((await extras(page)).slow).toBe(0.45);
  }
  // Open, its time runs.
  await handIs(page, 'open');
  await expect.poll(() => handStatus(page), { timeout: 20_000 }).toBe('open');
  const from = await left();
  await expect.poll(left, { timeout: 5000 }).toBeLessThan(from - 0.5);
});

test('a treasure chest\'s lid opens upwards for either hand', async ({ page }) => {
  test.setTimeout(200_000);
  await startPlaying(page, GAME, atLevel(GAME, 7));
  await storyIs(page, 'giraffe');
  const lid = await page.evaluate(() => {
    const { garden: place } = window.__game;
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const r = 50;
    const chest = { x: 200, y: 220, r, alpha: 1, state: 'open', openFor: 1, hold: 0 };
    const side = place.side;
    const solid = (x, y) => ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data[3] > 200;
    const out = {};
    for (const hand of ['right', 'left']) {
      place.side = hand;
      ctx.clearRect(0, 0, 400, 400);
      place.drawChest(ctx, chest);
      const way = hand === 'right' ? 1 : -1;
      out[hand] = {
        // Standing up above its hinge, on Giraffe's side of the chest.
        up: solid(chest.x - way * r * 1.25, chest.y - r * 1.6),
        // And nothing hanging down below the chest.
        down: [-0.6, 0, 0.6].some((share) => solid(chest.x + share * r, chest.y + r * 1.2)),
      };
    }
    place.side = side;
    return out;
  });
  expect(lid).toEqual({ right: { up: true, down: false }, left: { up: true, down: false } });
  // In the garden with the left hand, at the carrots.
  await goToPlace(page, 1);
  await page.evaluate(() => window.__game.session.changeSettings({ hands: 'left' }));
  await expect.poll(async () => (await extras(page)).chest, { timeout: 10_000 }).toBe('waiting');
  await page.evaluate(() => Object.assign(window.__game.garden.helpers.chest, { state: 'open', openFor: 0 }));
  await page.waitForTimeout(600);
  await shot(page, 'spider-fix-chest-left');
});

test('level 2: a berry under a hand held above it comes up to the hand smoothly, without bobbing', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, GAME, atLevel(GAME, 2));
  await storyIs(page, 'giraffe');
  await moveGloveTo(page, GLOVE, 0.5, 0.35);
  await expect.poll(() => page.evaluate(() => {
    const { garden: place } = window.__game;
    const glove = place.gloves.right;
    return glove.visible && Math.hypot(glove.x / place.width - 0.5, glove.y / place.height - 0.35) < 0.03;
  }), { timeout: 20_000 }).toBe(true);
  await stopMoving(page);
  await page.waitForTimeout(600);
  const watched = await page.evaluate(async () => {
    const { garden: place } = window.__game;
    const glove = place.gloves.right;
    // Resting in the grass right under the hand: out of its reach, but near enough to be drawn to it.
    const berry = place.dropBerry(glove.x, glove.y + place.height * 0.2, { armed: true });
    Object.assign(berry, { vy: 0, vx: 0, rest: berry.y, age: 1 });
    const heights = [];
    const from = place.time;
    while (place.berries.includes(berry) && place.time - from < 3) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      heights.push(berry.y);
    }
    // How many times it turned between going up and coming down.
    let turns = 0;
    let going = 0;
    for (let i = 1; i < heights.length; i += 1) {
      const step = Math.sign(Math.round((heights[i] - heights[i - 1]) * 100));
      if (step && going && step !== going) turns += 1;
      if (step) going = step;
    }
    return { picked: !place.berries.includes(berry), turns, total: place.berryTotal };
  });
  expect(watched).toEqual({ picked: true, turns: 0, total: 1 });
});

test('level 6: moving on to the next place, the basket left behind fades away rather than vanishing', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, GAME, atLevel(GAME, 6));
  await storyIs(page, 'giraffe');
  // The hand away, so the basket stays in the grass.
  await show(page, null, null);
  await expect.poll(async () => (await extras(page)).basket, { timeout: 15_000 }).toBe('waiting');
  await expect.poll(() => page.evaluate(() => window.__game.garden.helpers.basket.alpha), { timeout: 5000 }).toBe(1);
  const seen = await page.evaluate(async () => {
    const { garden: place, gathering } = window.__game;
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const { basket } = place.helpers;
    const ctx = place.canvas.getContext('2d');
    // The most solid the picture is over the middle of the basket.
    const look = () => {
      const half = basket.r * 0.5 * place.ratio;
      const { data } = ctx.getImageData(Math.round(basket.x * place.ratio - half), Math.round(basket.y * place.ratio - half), Math.round(half * 2), Math.round(half * 2));
      let most = 0;
      for (let i = 3; i < data.length; i += 4) most = Math.max(most, data[i]);
      return most / 255;
    };
    place.berries = [];
    await frame();
    const before = look();
    while (gathering.home < gathering.place.count) gathering.spiderHome();
    while (place.moving === 0) await frame();
    const during = [];
    while (place.moving > 0) {
      await frame();
      during.push({ left: 1 - place.fade, seen: look() });
    }
    await frame();
    return { before, during, after: look() };
  });
  expect(seen.before).toBeGreaterThan(0.9);
  // Early in the move it's still there, fading as the place does, and by the end it's gone.
  const early = seen.during.filter(({ left }) => left > 0.4 && left < 0.9);
  expect(early.length).toBeGreaterThan(0);
  for (const { left, seen: shown } of early) expect(shown).toBeGreaterThan(left * 0.6);
  expect(seen.after).toBeLessThan(0.05);
});

test('level 9: a leaf boat stays on its stream, all the way along', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, GAME, atLevel(GAME, 9));
  await storyIs(page, 'giraffe');
  await show(page, null, null);
  await expect.poll(() => page.evaluate(() => window.__game.garden.spiders.some(({ kind, state }) => kind === 'boat' && state === 'playing')), { timeout: 15_000 }).toBe(true);
  const along = await page.evaluate(async () => {
    const { garden: place } = window.__game;
    const boat = place.spiders.find(({ kind }) => kind === 'boat');
    // Once along its whole way and back in three seconds, for the test.
    boat.path.rate = (Math.PI * 2) / 3;
    let past = -Infinity;
    let wet = 0;
    let frames = 0;
    const from = place.time;
    while (place.time - from < 3.2 && boat.state === 'playing') {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const { stream } = place;
      // The leaf reaches this far either side of the spider.
      const leaf = place.spiderSize * 1.9;
      past = Math.max(past, Math.abs(boat.x - stream.x) + leaf - stream.half);
      wet = Math.max(wet, Math.abs(boat.y + place.spiderSize * 0.75 - stream.y));
      frames += 1;
    }
    return { past: past / place.height, wet: wet / place.height, frames };
  });
  expect(along.frames).toBeGreaterThan(20);
  // Never past the end of the stream, and always on the water.
  expect(along.past).toBeLessThan(0);
  expect(along.wet).toBeLessThan(0.03);
  await shot(page, 'spider-fix-boat-stream');
  // Moving on, the stream fades with its place, and the next one comes in with its boat.
  const moving = await page.evaluate(async () => {
    const { garden: place, gathering } = window.__game;
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const ctx = place.canvas.getContext('2d');
    // How solid the picture is in the middle of a stream.
    const look = (stream) => ctx.getImageData(Math.round(stream.x * place.ratio), Math.round(stream.y * place.ratio), 1, 1).data[3] / 255;
    // Nothing else in the way: no helpers, berries or spiders over it.
    place.helpers = { basket: null, chest: null, butterfly: null };
    place.berries = [];
    const old = place.stream;
    while (gathering.home < gathering.place.count) gathering.spiderHome();
    while (place.moving === 0) await frame();
    const during = [];
    while (place.moving > 0) {
      await frame();
      during.push({ left: 1 - place.fade, seen: look(old) });
    }
    // The next place's boat comes out, and its stream with it.
    const coming = [];
    for (let i = 0; i < 40 && coming.at(-1)?.alpha !== 1; i += 1) {
      await frame();
      if (place.stream) coming.push({ alpha: place.stream.alpha });
    }
    return { during, coming };
  });
  const early = moving.during.filter(({ left }) => left > 0.4 && left < 0.9);
  expect(early.length).toBeGreaterThan(0);
  for (const { seen } of early) expect(seen).toBeGreaterThan(0.1);
  expect(moving.coming[0].alpha).toBeLessThan(0.5);
  expect(moving.coming.at(-1).alpha).toBe(1);
});
