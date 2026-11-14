// The Lighthouse Keeper's levels, with real photos going through the real tracker: what each level
// brings that's new, treasure picked up by a real open hand, crabs, power-ups, oysters, the gull and
// the treasure chest, and still every ship home at level 10, with nothing flashing.
import { expect, show, shot, test, waitForScreen } from '../helpers.js';
import { atLevel, judgeBrightness, moveGloveTo, stopMoving, storyIs, watchBrightness } from './helpers.js';
import { openGame, startPlaying } from './challenge-helpers.js';

const GAME = 'lighthouse';
const GLOVE = ['room', 'gloves', 'right'];
const storm = (page) => page.evaluate(() => {
  const { storm: rules, room } = window.__game;
  return {
    index: rules.index,
    home: rules.home,
    share: rules.mud?.share ?? 0,
    clean: rules.clean,
    stats: { ...rules.stats },
    treasure: rules.treasure,
    active: { ...rules.active },
    lumps: rules.lumps.map(({ kind, x, y, rubbed, needs }) => ({ kind, x, y, rubbed, needs })),
    prizes: rules.prizes.map(({ kind, x, y, hidden }) => ({ kind, x, y, hidden })),
    crabs: rules.crabs.map(({ x, y }) => ({ x, y })),
    powers: rules.powers.map(({ kind, x, y }) => ({ kind, x, y })),
    drawn: room.lumps.length,
    falling: room.falling.length,
    labels: room.labels.map(({ key }) => key),
    introduced: [...room.introduced],
    gull: Boolean(room.gull),
    wipeSize: room.wipeSize / room.height,
  };
});

/** Where a place on the glass, in shares of the window, is in shares of the screen. */
const onScreen = (page, thing) => page.evaluate(({ x, y }) => {
  const { window: glass, width, height } = window.__game.room;
  return { x: (glass.x + x * glass.width) / width, y: (glass.y + y * glass.height) / height };
}, thing);

/**
 * Wipes the window row by row through the room, as a hand does, so the mud on the screen goes too,
 * until as much is clean as asked. The hand counts as still each time: it wipes mud, but rubs nothing.
 */
const wipeMud = (page, upTo = 1) => page.evaluate((most) => {
  const { storm: rules, room } = window.__game;
  const { window: glass } = room;
  const stillWipe = (x, y, sizeX, sizeY) => rules.wipe(x, y, sizeX, sizeY, 0);
  for (let pass = 0; pass < 3 && room.mud && rules.mud.share < most; pass += 1) {
    for (let y = 0.04; y <= 1 && rules.mud.share < most; y += 0.12) {
      room.last = null;
      for (let x = 0; x <= 1 && room.mud && rules.mud.share < most; x += 0.04) room.wipeAt({ x: glass.x + x * glass.width, y: glass.y + y * glass.height }, stillWipe);
    }
  }
  room.last = null;
}, upTo);

/** The hand out of the picture, so the real hand doesn't wipe or pick anything up meanwhile. */
async function handAway(page) {
  await stopMoving(page);
  await page.evaluate(() => window.__camera.show({ left: null, right: null }));
  await expect.poll(() => page.evaluate(() => window.__game.room.gloves.right.visible), { timeout: 10_000 }).toBe(false);
}

/** Keeps a real open hand on something on the glass as it moves, until done() says so. */
async function chase(page, find, done, { timeout = 60_000, scene = {} } = {}) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const state = await storm(page);
    if (done(state)) return state;
    const thing = find(state);
    if (thing) await moveGloveTo(page, GLOVE, ...Object.values(await onScreen(page, thing)), scene);
    await page.waitForTimeout(400);
  }
  throw new Error('never got there');
}

/**
 * Wipes and rubs every window clean, a little at a time, as long as it's running, with a hand held
 * on anything that needs holding, and picking up whatever it passes.
 */
const keepWiping = (page) => page.evaluate(() => {
  let x = 0;
  let y = 0.05;
  window.__wiping = setInterval(() => {
    const { storm: rules } = window.__game;
    for (let i = 0; i < 6; i += 1) {
      rules.wipe(x, y, 0.08, 0.1, 0.4);
      x += 0.04;
      if (x > 1) {
        x = 0;
        y = y > 0.95 ? 0.05 : y + 0.08;
      }
    }
    const held = rules.lumps.find(({ kind }) => kind === 'clam' || kind === 'chest');
    rules.update(0.05, { hand: { x: held?.x ?? x, y: held?.y ?? y, sizeX: 0.08, sizeY: 0.1 } });
  }, 50);
});
const stopWiping = (page) => page.evaluate(() => clearInterval(window.__wiping));

test('every level from 2 lists what\'s new on the title card, in the countdown, and as coming up', async ({ page }) => {
  test.setTimeout(180_000);
  const expected = {
    2: '💦Mud splats🐚Shells',
    3: '🦀Crab',
    4: '🌿Seaweed',
    5: '🏮Big lantern',
    6: '⭐Starfish',
    7: '🫧Bubble shield🌙Night sea',
    8: '🦪Oyster',
    9: '🐦Gull helper',
    10: '🪙Treasure chest',
  };
  await startPlaying(page, GAME, atLevel(GAME, 1));
  await expect(page.locator('#level-new')).toBeHidden();
  for (const [level, words] of Object.entries(expected)) {
    await page.evaluate((at) => {
      const { session } = window.__game;
      session.levels.choose(at);
      session.levelUi.refresh();
    }, Number(level));
    await expect(page.locator('#level-new')).toHaveText(`New:${words}`);
  }
  // Coming up next, after winning level 4.
  // Winning level 4, played at level 4.
  await page.evaluate(() => {
    const { session } = window.__game;
    session.levels.choose(4);
    session.level = 4;
    session.finish();
  });
  await expect(page.locator('#level-next-new')).toHaveText('Coming up:🏮Big lantern');
});

test('what\'s new shows under the countdown, in Georgian when that\'s the voice', async ({ page }) => {
  await openGame(page, atLevel(GAME, 8, { language: 'ka' }), GAME);
  await show(page, null, 'open', { scale: 0.7 });
  await page.locator('#start').click();
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-new-now')).toContainText('ხამანწკა');
  await shot(page, 'lh-new-countdown');
});

test('level 2: shells pop out of the mud, and a real open hand picks one up', async ({ page }) => {
  test.setTimeout(180_000);
  // The hand leaves the picture during the countdown, as an open hand wipes from the first moment of play,
  // and could uncover a shell before it's looked at.
  await openGame(page, atLevel(GAME, 2, { reach: 'none' }), GAME);
  await show(page, null, 'open', { scale: 0.7 });
  await page.locator('#start').click();
  await waitForScreen(page, 'countdown');
  await page.evaluate(() => window.__camera.show({ left: null, right: null }));
  await waitForScreen(page, 'playing');
  await storyIs(page, 'frost');
  await expect(page.locator('#chip-treasure-box')).toBeVisible();
  const { prizes } = await storm(page);
  expect(prizes.map(({ kind, hidden }) => `${kind} ${hidden}`)).toEqual(['shell true', 'shell true']);
  // Uncovering the first one, through the room, away from the hand.
  await page.evaluate(() => {
    const { storm: rules, room } = window.__game;
    const [shell] = rules.prizes;
    const { window: glass } = room;
    room.last = null;
    room.wipeAt({ x: glass.x + shell.x * glass.width, y: glass.y + shell.y * glass.height }, (x, y, sizeX, sizeY) => rules.wipe(x, y, sizeX, sizeY, 0));
    room.last = null;
  });
  const out = await storm(page);
  expect(out.prizes[0].hidden).toBe(false);
  await page.waitForTimeout(500);
  expect(out.labels).toContain('shells');
  await shot(page, 'lh-shell-out');
  await chase(page, (state) => state.prizes.find(({ hidden }) => !hidden), (state) => state.treasure >= 1);
  await stopMoving(page);
  await expect(page.locator('#chip-treasure')).toHaveText('🐚 1');
  expect((await storm(page)).stats.shells).toBe(1);
});

test('level 3: a crab walks on the glass, and gives its pearl to a real open hand', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 3, { reach: 'none' }));
  await storyIs(page, 'frost');
  // The hand out of the way while the crab comes.
  await handAway(page);
  await wipeMud(page, 0.15);
  const { crabs } = await storm(page);
  expect(crabs).toHaveLength(1);
  await page.waitForTimeout(1200);
  const walked = await storm(page);
  expect(Math.abs(walked.crabs[0].x - crabs[0].x)).toBeGreaterThan(0.03);
  await expect.poll(async () => (await storm(page)).introduced, { timeout: 5000 }).toContain('crab');
  await shot(page, 'lh-crab');
  await chase(page, (state) => state.crabs[0], (state) => state.stats.crabs >= 1);
  await page.waitForTimeout(300);
  await shot(page, 'lh-crab-pearl');
  // The pearl it let go of is right by the hand, so it's picked up.
  await expect.poll(async () => (await storm(page)).stats.pearls, { timeout: 10_000 }).toBe(1);
  await stopMoving(page);
});

test('level 4: a real open hand has to rub the seaweed off, and it leaves a shell', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 4, { reach: 'none' }));
  await storyIs(page, 'frost');
  await handAway(page);
  await wipeMud(page);
  const wiped = await storm(page);
  expect(wiped.lumps.map(({ kind }) => kind)).toEqual(['weed']);
  expect(wiped.drawn).toBe(1);
  // Clean enough, but not clean while the seaweed is on it.
  expect(wiped.share).toBeGreaterThanOrEqual(0.88);
  expect(wiped.clean).toBe(false);
  await page.waitForTimeout(1200);
  await shot(page, 'lh-seaweed');

  // The real hand, open, going back and forth over it.
  const target = await onScreen(page, wiped.lumps[0]);
  for (let i = 0; i < 8 && !(await storm(page)).clean; i += 1) {
    await moveGloveTo(page, GLOVE, target.x + (i % 2 ? 0.12 : -0.12), target.y);
    await page.waitForTimeout(1300);
    if (i === 0) await shot(page, 'lh-rubbing');
  }
  await stopMoving(page);
  await expect.poll(async () => (await storm(page)).clean, { timeout: 15_000 }).toBe(true);
  await expect(page.locator('#story-line')).toContainText('Safe');
  const done = await storm(page);
  expect(done.stats.lumps).toBe(1);
  // Its shell, as well as the two from the mud, if they were out.
  expect(done.stats.shells).toBeGreaterThanOrEqual(1);
});

test('level 5: picking up the big lantern makes a real hand\'s wipe bigger for a while', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 5, { reach: 'none' }));
  await storyIs(page, 'frost');
  await handAway(page);
  const before = (await storm(page)).wipeSize;
  await wipeMud(page, 0.26);
  const { powers } = await storm(page);
  expect(powers.map(({ kind }) => kind)).toEqual(['lantern']);
  await page.waitForTimeout(900);
  await shot(page, 'lh-lantern-out');
  await chase(page, (state) => state.powers[0], (state) => state.active.lantern > 0);
  const lit = await storm(page);
  expect(lit.wipeSize).toBeCloseTo(before * 1.6, 5);
  await page.waitForTimeout(400);
  await shot(page, 'lh-lantern');
  // It runs out after six seconds of wiping.
  await expect.poll(async () => (await storm(page)).active.lantern, { timeout: 15_000 }).toBe(0);
  expect((await storm(page)).wipeSize).toBeCloseTo(before, 5);
  await stopMoving(page);
});

test('level 6: the first window has a starfish, which creeps about until it\'s rubbed off', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 6));
  await storyIs(page, 'frost');
  await handAway(page);
  await wipeMud(page);
  const before = await storm(page);
  expect(before.lumps.map(({ kind }) => kind)).toEqual(['star']);
  await page.waitForTimeout(2500);
  await shot(page, 'lh-starfish');
  const after = await storm(page);
  expect(Math.hypot(after.lumps[0].x - before.lumps[0].x, after.lumps[0].y - before.lumps[0].y)).toBeGreaterThan(0.02);
  await keepWiping(page);
  await expect.poll(async () => (await storm(page)).falling, { timeout: 20_000 }).toBeGreaterThan(0);
  await stopWiping(page);
  expect((await storm(page)).stats.pearls).toBeGreaterThanOrEqual(1);
});

test('level 7: a night sea, and a real hand picks up the bubble shield, which a mud splat bounces off', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 7, { reach: 'none' }));
  await storyIs(page, 'frost');
  expect(await page.evaluate(() => window.__game.room.night)).toBe(true);
  await handAway(page);
  await page.waitForTimeout(800);
  await shot(page, 'lh-night');
  await wipeMud(page, 0.26);
  expect((await storm(page)).powers.map(({ kind }) => kind)).toEqual(['bubble']);
  await chase(page, (state) => state.powers[0], (state) => state.active.bubble > 0);
  const share = (await storm(page)).share;
  await page.evaluate(() => window.__game.storm.splat());
  const bounced = await storm(page);
  expect(bounced.stats.bounced).toBe(1);
  expect(bounced.share).toBeGreaterThanOrEqual(share);
  await page.waitForTimeout(250);
  await shot(page, 'lh-bubble');
  await stopMoving(page);
});

test('level 8: an oyster opens for a real open hand held on it, and gives a pearl', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 8, { reach: 'none' }));
  await storyIs(page, 'frost');
  await handAway(page);
  await wipeMud(page);
  const { lumps, clean } = await storm(page);
  expect(lumps.map(({ kind }) => kind)).toEqual(['clam']);
  expect(clean).toBe(false);
  await page.waitForTimeout(1000);
  await shot(page, 'lh-oyster');
  await chase(page, (state) => state.lumps[0], (state) => (state.lumps[0]?.rubbed ?? 1) > 0.4);
  await shot(page, 'lh-oyster-opening');
  await chase(page, (state) => state.lumps[0], (state) => state.lumps.length === 0);
  await stopMoving(page);
  await expect.poll(async () => (await storm(page)).clean, { timeout: 15_000 }).toBe(true);
  expect((await storm(page)).stats.pearls).toBeGreaterThanOrEqual(1);
});

test('level 9: the gull helper flies across and wipes a wide stripe', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 9, { reach: 'none' }));
  await storyIs(page, 'frost');
  await handAway(page);
  await wipeMud(page, 0.26);
  expect((await storm(page)).powers.map(({ kind }) => kind)).toEqual(['gull']);
  const before = (await storm(page)).share;
  await chase(page, (state) => state.powers[0], (state) => state.gull);
  await handAway(page);
  await page.waitForTimeout(1100);
  await shot(page, 'lh-gull');
  await expect.poll(async () => (await storm(page)).gull, { timeout: 10_000 }).toBe(false);
  const after = await storm(page);
  console.log('gull wiped', (after.share - before).toFixed(2));
  expect(after.share - before).toBeGreaterThan(0.12);
  await stopMoving(page);
});

test('level 10: the last window has a treasure chest, which opens into coins, and every ship comes home', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, GAME, atLevel(GAME, 10, { ships: 2, reach: 'none' }));
  await storyIs(page, 'frost');
  await keepWiping(page);
  await expect.poll(async () => (await storm(page)).home, { timeout: 40_000 }).toBe(1);
  await stopWiping(page);
  await storyIs(page, 'bramble');
  await handAway(page);
  await wipeMud(page);
  const { lumps } = await storm(page);
  expect(lumps.map(({ kind }) => kind).sort()).toEqual(['chest', 'weed']);
  await page.waitForTimeout(1000);
  await shot(page, 'lh-chest');
  // The real hand held on the chest.
  await chase(page, (state) => state.lumps.find(({ kind }) => kind === 'chest'), (state) => !state.lumps.some(({ kind }) => kind === 'chest'));
  await page.waitForTimeout(250);
  await shot(page, 'lh-chest-open');
  await expect.poll(async () => (await storm(page)).stats.coins, { timeout: 10_000 }).toBe(5);
  await stopMoving(page);
  await keepWiping(page);
  await waitForScreen(page, 'finish');
  await stopWiping(page);
  await expect(page.locator('#screen-finish')).toContainText('You saved every ship!');
  await expect(page.locator('#level-done-text')).toHaveText('All 10 levels done!');
  const done = await storm(page);
  expect(done.home).toBe(2);
  expect(Number(await page.locator('#sum-right-treasure').textContent())).toBe(done.treasure);
  expect(done.treasure).toBeGreaterThanOrEqual(5);
  await page.waitForTimeout(600);
  await shot(page, 'lh-finish');
});

for (const level of [1, 6, 10]) {
  test(`nothing flashes at level ${level}: splats, everything on the glass, the gull, the beam and the ships sailing home`, async ({ page }) => {
    test.setTimeout(240_000);
    await startPlaying(page, GAME, atLevel(GAME, level, { ships: 2 }));
    await storyIs(page, 'frost');
    await keepWiping(page);
    const result = judgeBrightness(await watchBrightness(page, 360));
    const { stats, home } = await storm(page);
    await stopWiping(page);
    console.log(`level ${level}`, JSON.stringify(result), JSON.stringify(stats), home);
    // It really was going on: a ship came home in that time, and at the higher levels, the storm
    // threw things and there was treasure.
    expect(home).toBeGreaterThanOrEqual(1);
    if (level > 1) expect(stats.splats + stats.lumps + stats.crabs + stats.prizes).toBeGreaterThanOrEqual(4);
    expect(result.biggestStep).toBeLessThan(4);
    expect(result.flickeringShare).toBeLessThan(0.02);
  });
}

test('nothing flashes at level 9 while the gull flies across and treasure flies up', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 9));
  await storyIs(page, 'frost');
  await page.evaluate(() => {
    const { storm: rules, room } = window.__game;
    for (const prize of rules.prizes) {
      prize.hidden = false;
      prize.age = 1;
    }
    room.sendGull(0.5);
    setTimeout(() => [...rules.prizes].forEach((prize) => {
      room.prizeFlies(prize);
      rules.collect(prize);
    }), 600);
  });
  const result = judgeBrightness(await watchBrightness(page, 180));
  console.log('gull', JSON.stringify(result));
  expect(result.biggestStep).toBeLessThan(4);
  expect(result.flickeringShare).toBeLessThan(0.02);
});

test('level 10 with reduced motion: the starfish keeps still, crabs walk slower, and there are no drips', async ({ page }) => {
  test.setTimeout(150_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startPlaying(page, GAME, atLevel(GAME, 10));
  await storyIs(page, 'frost');
  const still = await page.evaluate(async () => {
    const { storm: rules, room } = window.__game;
    rules.addLump('star');
    rules.addCrab();
    rules.splat();
    const star = rules.lumps.at(-1);
    const [crab] = rules.crabs;
    const from = { x: star.x, y: star.y, crab: crab.x };
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return {
      moved: Math.hypot(star.x - from.x, star.y - from.y),
      crab: Math.abs(crab.x - from.crab) / 1.5 / crab.speed,
      drops: room.drops.length,
      reduced: room.reducedMotion,
    };
  });
  expect(still.moved).toBe(0);
  // Half speed, in game time, which can be a little behind on a busy computer.
  expect(still.crab).toBeGreaterThan(0);
  expect(still.crab).toBeLessThan(0.7);
  expect(still.drops).toBe(0);
  expect(still.reduced).toBe(true);
});

/** Notes the words drawn on the room from now on, such as the names of new things. */
const watchWords = (page) => page.evaluate(() => {
  const { ctx } = window.__game.room;
  const fillText = ctx.fillText.bind(ctx);
  window.__drawn = new Set();
  ctx.fillText = (text, ...rest) => {
    window.__drawn.add(text);
    return fillText(text, ...rest);
  };
});
const drawn = (page, words) => page.evaluate((wanted) => [...window.__drawn].some((text) => text.includes(wanted)), words);

test('level 5: the big lantern is named even when it\'s picked up while another name shows, in the voice\'s language', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, GAME, atLevel(GAME, 5, { reach: 'none' }));
  await storyIs(page, 'frost');
  await handAway(page);
  await watchWords(page);
  await page.evaluate(() => window.__game.storm.addCrab());
  await expect.poll(() => drawn(page, 'Crab'), { timeout: 5000, intervals: [100] }).toBe(true);
  // The lantern comes, and is picked up while the crab's name is still showing.
  await page.evaluate(() => {
    const { storm: rules } = window.__game;
    rules.addPower('lantern');
    const power = rules.powers.at(-1);
    power.age = 1;
    rules.update(0.05, { hand: { x: power.x, y: power.y, sizeX: 0.08, sizeY: 0.1 } });
  });
  expect(await page.evaluate(() => window.__game.storm.active.lantern)).toBeGreaterThan(0);
  // It's named beside its badge instead.
  await expect.poll(() => drawn(page, 'Big lantern'), { timeout: 8000, intervals: [100] }).toBe(true);
  await shot(page, 'lh-lantern-named');
  // A grown-up changes the voice to Georgian while it shows, and the name changes with it.
  await page.evaluate(() => window.__game.session.changeSettings({ language: 'ka' }));
  await expect.poll(() => drawn(page, 'დიდი ფარანი'), { timeout: 3000, intervals: [100] }).toBe(true);
});

test('level 5: with the big lantern, rubbing takes no more moving than without it', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page, GAME, atLevel(GAME, 5, { reach: 'none' }));
  await storyIs(page, 'frost');
  await handAway(page);
  // The same stroke across the glass, with the lantern and without, as the room tells the rules.
  const rubbed = await page.evaluate(() => {
    const { room, storm: rules } = window.__game;
    const { window: glass } = room;
    const stroke = (lantern) => {
      rules.active.lantern = lantern ? 6 : 0;
      let moved = 0;
      let size = 0;
      room.last = null;
      for (let i = 0; i <= 20; i += 1) {
        room.wipeAt({ x: glass.x + glass.width * (0.2 + i * 0.03), y: glass.y + glass.height * 0.5 }, (x, y, sizeX, sizeY, step) => {
          moved += step;
          size = sizeX;
          return 0;
        });
      }
      room.last = null;
      return { moved, size };
    };
    const without = stroke(false);
    const withIt = stroke(true);
    rules.active.lantern = 0;
    return { without, withIt };
  });
  console.log('rubbed', JSON.stringify(rubbed));
  expect(rubbed.without.moved).toBeGreaterThan(3);
  expect(rubbed.withIt.moved).toBeCloseTo(rubbed.without.moved, 5);
  // And the lantern's wipe is still the bigger one.
  expect(rubbed.withIt.size).toBeCloseTo(rubbed.without.size * 1.6, 5);
});

test('level 9: a gull in flight waits while the hands are checked again mid-round, and its wipe counts after', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, GAME, atLevel(GAME, 9, { reach: 'none' }));
  await storyIs(page, 'frost');
  await handAway(page);
  const mudNow = () => page.evaluate(() => {
    const { room, storm: rules } = window.__game;
    const { data } = room.mud.getContext('2d').getImageData(0, 0, room.mud.width, room.mud.height);
    let mud = 0;
    for (let i = 3; i < data.length; i += 64) mud += data[i];
    return { t: room.gull?.t ?? null, share: rules.mud.share, mud };
  });
  // The gull sets off, and a grown-up asks for the hands to be checked again straight away.
  await page.evaluate(() => {
    const { room, session } = window.__game;
    room.sendGull(0.5);
    session.recheckHands();
  });
  await waitForScreen(page, 'check');
  const before = await mudNow();
  await page.waitForTimeout(3000);
  // Nothing has wiped the picture that the rules don't know about: the gull waited.
  expect(await mudNow()).toEqual(before);
  expect(before.t).not.toBeNull();
  // The hand comes back for the check, and then goes, and the gull flies on, wiping as it goes.
  await show(page, null, 'open', { scale: 0.7 });
  await waitForScreen(page, 'playing');
  await handAway(page);
  await expect.poll(async () => (await mudNow()).t, { timeout: 10_000 }).toBeNull();
  const after = await mudNow();
  console.log('gull after the check', (after.share - before.share).toFixed(2));
  expect(after.share - before.share).toBeGreaterThan(0.1);
});

test('level 3: a crab nobody touched walks off the glass as its window comes clean', async ({ page }) => {
  test.setTimeout(120_000);
  await startPlaying(page, GAME, atLevel(GAME, 3, { reach: 'none' }));
  await storyIs(page, 'frost');
  await handAway(page);
  await wipeMud(page, 0.15);
  expect((await storm(page)).crabs).toHaveLength(1);
  await wipeMud(page);
  const off = await page.evaluate(() => {
    const { room, storm: rules } = window.__game;
    return { clean: rules.clean, crabs: rules.crabs.length, leaving: room.leaving.length };
  });
  expect(off).toEqual({ clean: true, crabs: 0, leaving: 1 });
  await page.waitForTimeout(400);
  await shot(page, 'lh-crab-walks-off');
  // And its pearl was kept.
  expect((await storm(page)).stats.pearls).toBeGreaterThanOrEqual(1);
});
