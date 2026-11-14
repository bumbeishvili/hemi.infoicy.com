// What each of Robot Rescue's levels brings that's new, in the real game with photos going through the
// real tracker: the "New:" chips, each new kind of robot, fire, prize and power-up, their names the
// first time they turn up, what's counted, and that none of it flickers. The rules are checked in
// test/unit/robot-rescue.test.js, and the list of what's new is NEWS in rescue.js.
import { readFileSync } from 'node:fs';
import { expect, openGame, shot, show, test, waitForScreen } from '../helpers.js';
import { GAME, NO_HAND, OPEN, clearHere, expectSoon, judge, reachRescue, rescue, startHunting, stayAwake, stopHunting, watchBrightness } from './helpers.js';

const atLevel = (level, settings = {}) => ({ levels: { [GAME]: level }, ...settings });

// What's new at each level, read from the rules, so this keeps up with them.
const RULES = readFileSync(new URL('../../../games/robot-rescue/rescue.js', import.meta.url), 'utf8');
const NEWS = Object.fromEntries([...RULES.matchAll(/^ {2}(\d+): \[(.*)\],$/gm)].map(([, level, list]) => [level, [...list.matchAll(/mark: '([^']+)', name: '([^']+)', nameKa: '([^']+)'/g)].map(([, mark, name, nameKa]) => ({ mark, name, nameKa }))]));
const chips = (level) => NEWS[level].map(({ mark, name }) => `${mark}${name}`).join('');

/**
 * The game again with other settings. They're written straight in, as the settings a page was first
 * opened with are put back each time it loads if there are none.
 */
async function reopen(page, settings) {
  await page.evaluate((saved) => localStorage.setItem('camera-games-settings', JSON.stringify(saved)), { voice: false, sound: false, ...settings });
  await page.reload();
  await expect(page.locator('#start')).toBeVisible();
}

/** What the game knows about what's new and what's been picked up. */
const haul = (page) => page.evaluate(() => {
  const { mission, stage } = window.__game;
  const { bolts, gems, stars, pals, powers, chests, bonks } = mission.stats;
  return { bolts, gems, stars, pals, powers, chests, bonks, named: [...stage.named], label: stage.labels[0]?.words ?? null, on: mission.powersOn, prizes: mission.prizes.length };
});

/** Waits for a name to be up over the thing it names, and takes a picture of it. */
async function shotWithLabel(page, words, name) {
  await expectSoon(() => page.evaluate(() => {
    const [label] = window.__game.stage.labels;
    return label && label.age > 0.5 && label.age < 2 ? label.words : null;
  }), { timeout: 45_000 }).toBe(words);
  await shot(page, name);
}

/** Gets to the next stop, and on until this one. */
async function rideTo(page, place) {
  for (let i = 0; i < 6; i += 1) {
    if ((await rescue(page)).place === place && (await rescue(page)).phase === 'fighting') return;
    await clearHere(page);
    await expectSoon(async () => {
      const now = await rescue(page);
      return now.phase === 'fighting' && now.left > 0;
    }, { timeout: 30_000 }).toBe(true);
  }
  expect((await rescue(page)).place).toBe(place);
}

test('what\'s new is on the title card at every level, under the countdown in Georgian too, and coming up on the finish card', async ({ page }) => {
  test.setTimeout(200_000);
  await openGame(page, atLevel(2), GAME);
  await expect(page.locator('#level-new')).toHaveText(`New:${chips(2)}`);
  for (const level of [3, 4, 5, 6, 7, 8, 9, 10]) {
    await page.locator('#open-panel').click();
    await page.locator('#level-choice label', { hasText: String(level) }).first().click();
    await page.locator('#close-panel').click();
    await expect(page.locator('#level-badge')).toHaveText(`Level ${level} of 10`);
    await expect(page.locator('#level-new')).toHaveText(`New:${chips(level)}`);
    if (level === 5) await shot(page, 'robot-rescue-new-title-level5');
  }
  // Level 1 has nothing new.
  await page.locator('#open-panel').click();
  await page.locator('#level-choice label', { hasText: '1' }).first().click();
  await page.locator('#close-panel').click();
  await expect(page.locator('#level-new')).toBeHidden();

  // Under the countdown, in the language the voice speaks.
  await reopen(page, atLevel(6, { language: 'ka' }));
  await show(page, ...OPEN);
  await page.locator('#start').click();
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-new-now')).toContainText('ახალი:');
  for (const { nameKa } of NEWS[6]) await expect(page.locator('#level-new-now')).toContainText(nameKa);
  await shot(page, 'robot-rescue-new-countdown-ka');
  await waitForScreen(page, 'playing');

  // Winning a level says what the next one brings.
  await reopen(page, atLevel(3, { stops: 3 }));
  await show(page, ...OPEN);
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
  for (const next of ['harbour', 'tower', null]) {
    await clearHere(page);
    if (next) await expectSoon(async () => (await rescue(page)).place, { timeout: 30_000 }).toBe(next);
    if (next) await expectSoon(async () => (await rescue(page)).phase, { timeout: 30_000 }).toBe('fighting');
  }
  await waitForScreen(page, 'finish');
  await expect(page.locator('#level-next-new')).toHaveText(`Coming up:${chips(4)}`);
  await page.waitForTimeout(700);
  await shot(page, 'robot-rescue-new-finish-coming-up');
});

test('level 2: robots leave bolts that fly to the crosshair and are counted, and the triple shot fires three at once', async ({ page }) => {
  test.setTimeout(240_000);
  await reachRescue(page, atLevel(2, { reach: 'lots' }));
  await expect(page.locator('#chip-haul')).toBeVisible();
  await startHunting(page);
  await expectSoon(() => page.evaluate(() => window.__game.mission.prizes.some(({ kind, t }) => kind === 'bolt' && t > 0.35 && t < 0.7)), { timeout: 60_000 }).toBe(true);
  await shot(page, 'robot-rescue-new-bolts');
  await expectSoon(async () => (await haul(page)).named, { timeout: 30_000 }).toContain('bolts');
  await expectSoon(async () => (await haul(page)).bolts, { timeout: 30_000 }).toBeGreaterThan(2);
  // The chip says what the rules counted.
  await expectSoon(async () => {
    const now = await haul(page);
    const shown = await page.locator('#chip-haul [data-haul="bolt"] .haul-count').textContent();
    return Number(shown) === now.bolts;
  }).toBe(true);
  // The second robot to fall apart leaves the triple shot, which comes over to the crosshair.
  await expectSoon(async () => (await haul(page)).on, { timeout: 90_000 }).toContain('spread');
  await expect(page.locator('#chip-power')).toBeVisible();
  await expect(page.locator('#chip-power .chip-label')).toHaveText('Triple shot');
  await expectSoon(() => page.evaluate(() => window.__game.mission.shots.filter(({ side }) => side).length), { timeout: 30_000 }).toBeGreaterThan(1);
  await shot(page, 'robot-rescue-new-triple-shot');
  // A name counts once it has really come up, which may be under the power-ups at the top, while it's on.
  await expectSoon(async () => (await haul(page)).named, { timeout: 20_000 }).toEqual(expect.arrayContaining(['bolts', 'spread']));
  await stopHunting(page);
});

test('level 3: lid robots bonk shots off their lids until it falls off, and their name shows the first time', async ({ page }) => {
  test.setTimeout(240_000);
  await reachRescue(page, atLevel(3, { reach: 'lots' }), NO_HAND);
  await stayAwake(page);
  await shotWithLabel(page, 'Lid robots', 'robot-rescue-new-lid-robot');
  await startHunting(page);
  await expectSoon(async () => (await haul(page)).bonks, { timeout: 60_000 }).toBeGreaterThan(0);
  await shot(page, 'robot-rescue-new-lid-bonk');
  // Every lid robot goes in the end, lid and all.
  await expectSoon(() => page.evaluate(() => window.__game.mission.stats.robots), { timeout: 90_000 }).toBeGreaterThan(4);
  await stopHunting(page);
});

test('level 4: the bubble shot traps a robot in a floating bubble, which then shrinks away', async ({ page }) => {
  test.setTimeout(240_000);
  await reachRescue(page, atLevel(4, { reach: 'lots' }));
  await startHunting(page);
  await expectSoon(async () => (await haul(page)).on, { timeout: 90_000 }).toContain('bubble');
  await expect(page.locator('#chip-power .chip-label')).toHaveText('Bubble shot');
  await expectSoon(() => page.evaluate(() => [...window.__game.stage.bubbles.values()].some(({ share }) => share > 0.95)), { timeout: 30_000 }).toBe(true);
  await shot(page, 'robot-rescue-new-bubble');
  await expectSoon(async () => (await haul(page)).named, { timeout: 20_000 }).toContain('bubble');
  // Hopping robots are named too, the first time one hops.
  await expectSoon(async () => (await haul(page)).named, { timeout: 60_000 }).toContain('hop');
  await stopHunting(page);
});

test('level 5: the golden robot\'s key flies to the chest, which opens with gems and stars', async ({ page }) => {
  test.setTimeout(240_000);
  await reachRescue(page, atLevel(5, { reach: 'lots' }), NO_HAND);
  await stayAwake(page);
  await page.evaluate(() => {
    const { mission } = window.__game;
    window.__golden = mission.robots.find(({ kind }) => kind === 'keybot') ?? mission.spawn('keybot', 0.9);
  });
  // Its name comes up over it, the first time.
  await shotWithLabel(page, 'Key and chest', 'robot-rescue-new-key-robot');
  await shot(page, 'robot-rescue-new-chest-locked');
  await page.evaluate(() => window.__game.mission.drop(window.__golden));
  await expectSoon(() => page.evaluate(() => window.__game.stage.keys.length)).toBe(1);
  await page.waitForTimeout(500);
  await shot(page, 'robot-rescue-new-key');
  await expectSoon(async () => (await haul(page)).chests, { timeout: 10_000 }).toBe(1);
  await page.waitForTimeout(700);
  await shot(page, 'robot-rescue-new-chest-open');
  await expectSoon(async () => (await haul(page)).stars, { timeout: 10_000 }).toBe(2);
  expect((await haul(page)).gems).toBeGreaterThanOrEqual(4);
  await expect(page.locator('#chip-haul [data-haul="gem"]')).toBeVisible();
  await expect(page.locator('#chip-haul [data-haul="star"] .haul-count')).toHaveText('2');
  expect((await haul(page)).named).toContain('keyChest');
});

test('level 6: a splitting robot comes apart into two little ones, and the shield bubble stops goo with the hand open', async ({ page }) => {
  test.setTimeout(240_000);
  await reachRescue(page, atLevel(6, { reach: 'lots' }), NO_HAND);
  await stayAwake(page);
  await shotWithLabel(page, 'Splitting robots', 'robot-rescue-new-splitter');
  await show(page, ...OPEN);
  await page.evaluate(() => {
    const { mission } = window.__game;
    const splitter = mission.robots.find(({ kind }) => kind === 'splitter') ?? mission.spawn('splitter', 0.9);
    mission.drop(splitter);
  });
  await expectSoon(() => page.evaluate(() => window.__game.mission.robots.filter(({ kind }) => kind === 'mini').length)).toBe(2);
  await page.waitForTimeout(600);
  await shot(page, 'robot-rescue-new-little-ones');
  // The hand out of view, so the goo isn't simply shot down on its way.
  await show(page, ...NO_HAND);
  await page.evaluate(() => {
    const { mission } = window.__game;
    mission.startPower('guard');
    mission.throwIn = 9999;
    mission.throwGoo(mission.robots.find(({ kind }) => kind !== 'big'));
  });
  await page.waitForTimeout(1200);
  await shot(page, 'robot-rescue-new-shield-bubble');
  await expectSoon(() => page.evaluate(() => window.__game.mission.stats.gooBubbled), { timeout: 10_000 }).toBe(1);
  const after = await rescue(page);
  expect(after.hearts).toBe(3);
  expect(after.shield).toBe(false);
  expect(after.stats.gooBlocked).toBe(0);
});

test('level 7: the boing ball bounces from robot to robot, and a heart comes once one has been lost', async ({ page }) => {
  test.setTimeout(240_000);
  await reachRescue(page, atLevel(7, { reach: 'lots', rescueGoo: 'medium' }));
  await startHunting(page);
  await page.evaluate(() => window.__game.mission.startPower('boing'));
  await expectSoon(() => page.evaluate(() => window.__game.mission.shots.some(({ kind, from }) => kind === 'boing' && from)), { timeout: 30_000 }).toBe(true);
  await shot(page, 'robot-rescue-new-boing-ball');
  await stopHunting(page);
  // A heart's only left once one has gone, and it comes over like the bolts.
  await page.evaluate(() => {
    const { mission } = window.__game;
    mission.hearts -= 1;
    mission.addPrize('power', mission.robots.find(({ kind }) => kind !== 'big'), 0, { power: 'heart' });
  });
  await expectSoon(() => page.evaluate(() => window.__game.mission.hearts), { timeout: 10_000 }).toBe(5);
  await expect(page.locator('#chip-hearts .heart.is-gone')).toHaveCount(0);
});

test('level 8: paper planes find robots by themselves, the magnet pulls bolts out, and it\'s a sunset ride', async ({ page }) => {
  test.setTimeout(240_000);
  await reachRescue(page, atLevel(8, { reach: 'lots' }));
  await shotWithLabel(page, 'Sunset ride', 'robot-rescue-new-sunset');
  await page.evaluate(() => {
    const { mission } = window.__game;
    // Counted as they come out: a bolt is only on its way for a moment, and the magnet only lasts 8
    // seconds, which can be over by the time the planes have been found and the picture taken.
    window.__pulled = 0;
    const real = mission.onEvent;
    mission.onEvent = (event) => {
      if (event.type === 'prize-out' && event.prize.pulled) window.__pulled += 1;
      real(event);
    };
    mission.startPower('planes');
    mission.startPower('magnet');
  });
  await expectSoon(() => page.evaluate(() => window.__game.mission.shots.filter(({ kind }) => kind === 'plane').length), { timeout: 30_000 }).toBeGreaterThan(1);
  await page.waitForTimeout(300);
  await shot(page, 'robot-rescue-new-paper-planes');
  await expect(page.locator('#chip-power')).toContainText('Power-ups');
  await expectSoon(() => page.evaluate(() => window.__pulled), { timeout: 30_000 }).toBeGreaterThan(0);
  await shot(page, 'robot-rescue-new-magnet');
});

test('level 9: a drone carries a friend in a little cage, who floats down when it falls and is counted, and slow motion slows the robots', async ({ page }) => {
  test.setTimeout(240_000);
  await reachRescue(page, atLevel(9, { reach: 'lots' }), NO_HAND);
  await stayAwake(page);
  await shotWithLabel(page, 'Flying cages', 'robot-rescue-new-flying-cage');
  await page.evaluate(() => {
    const { mission } = window.__game;
    mission.startPower('slow');
    mission.drop(mission.robots.find(({ kind }) => kind === 'carrier'));
  });
  // It comes down onto the street, and stays on it.
  const lowest = await page.evaluate(async () => {
    const [floating] = window.__game.stage.floating;
    let least = Infinity;
    for (let i = 0; i < 90; i += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      least = Math.min(least, floating.root.position.y - floating.land.y);
    }
    return least;
  });
  expect(lowest).toBeGreaterThan(-0.08);
  await shot(page, 'robot-rescue-new-friend-floats-down');
  expect((await haul(page)).pals).toBe(1);
  await expect(page.locator('#chip-haul [data-haul="pal"] .haul-count')).toHaveText('1');
  expect(await page.evaluate(() => window.__game.stage.floating.length)).toBe(1);
  await expect(page.locator('#chip-power .chip-label')).toHaveText('Slow motion');
  // It shrinks away after a few seconds, and nothing is left behind.
  await expectSoon(() => page.evaluate(() => window.__game.stage.floating.length), { timeout: 10_000 }).toBe(0);
});

test('level 10: the robot king loses a bit of his finery with each weak spot, and leaves his treasure, counted on the finish card', async ({ page }) => {
  test.setTimeout(300_000);
  await reachRescue(page, atLevel(10, { reach: 'lots', stops: 3 }), NO_HAND);
  await stayAwake(page);
  await rideTo(page, 'tower');
  await show(page, ...OPEN);
  await shotWithLabel(page, 'Robot king', 'robot-rescue-new-robot-king');
  const parts = () => page.evaluate(() => [...window.__game.stage.views.values()].find((view) => view.robot.kind === 'big')?.kingParts.length ?? null);
  const before = await parts();
  expect(before).toBe(4);
  await page.evaluate(() => {
    const big = window.__game.mission.robots.find(({ kind }) => kind === 'big');
    const [spot] = big.spots;
    spot.open = true;
    spot.hp = 1;
    window.__game.mission.land({ target: spot, kind: 'paint' });
  });
  expect(await parts()).toBe(3);
  await page.waitForTimeout(250);
  await shot(page, 'robot-rescue-new-king-part-off');
  await page.evaluate(() => {
    const { mission } = window.__game;
    const big = mission.robots.find(({ kind }) => kind === 'big');
    for (const spot of big.spots.filter(({ done }) => !done)) {
      spot.open = true;
      spot.hp = 1;
      mission.land({ target: spot, kind: 'paint' });
    }
  });
  await page.waitForTimeout(700);
  await shot(page, 'robot-rescue-new-kings-treasure');
  await waitForScreen(page, 'finish');
  const counted = await haul(page);
  expect(counted.stars).toBeGreaterThanOrEqual(6);
  await expect(page.locator('#sum-right-prizes')).toContainText(`⭐ ${counted.stars}`);
  await expect(page.locator('#sum-right-prizes')).toContainText(`🔩 ${counted.bolts}`);
  await page.waitForTimeout(600);
  await shot(page, 'robot-rescue-new-finish-prizes');
});

// Each new kind of fire, with the level's own robots: at this stop at level 10 a golden robot, a drone
// with a friend, a splitting robot and two lid robots, and a roller with them, and prizes on their way.
// Measured just as the check of firing in safety.spec.js is: the same hand, pace and reach help, from
// the moment the blaster starts firing.
for (const [level, fire] of [[6, 'spread'], [6, 'bubble'], [10, 'spread'], [10, 'bubble'], [10, 'boing'], [10, 'planes']]) {
  test(`nothing flashes at level ${level} with the ${fire} kind of fire and the new robots about`, async ({ page }) => {
    test.setTimeout(240_000);
    await reachRescue(page, atLevel(level, { reach: 'lots', pace: 'fast' }));
    const out = await page.evaluate((kind) => {
      const { mission } = window.__game;
      // A roller in place of one of the plain ones, as they come later at this stop.
      const plain = mission.robots.find(({ kind: what }) => what === 'walker' || what === 'peeker');
      if (plain) mission.drop(plain, { withBig: true });
      mission.spawn('roller', 0.85);
      mission.startPower(kind);
      if (kind === 'spread') mission.startPower('guard');
      const robot = mission.robots.find(({ kind: what }) => what !== 'big');
      mission.addPrize('bolt', robot, 0);
      mission.addPrize('power', robot, 1, { power: 'magnet' });
      return mission.robots.map(({ kind: what }) => what);
    }, fire);
    for (const kind of level === 10 ? ['lid', 'keybot', 'splitter', 'carrier', 'roller'] : ['lid', 'keybot', 'splitter', 'roller']) expect(out, kind).toContain(kind);
    await startHunting(page);
    await expectSoon(async () => (await rescue(page)).firing).toBe(true);
    const result = judge(await watchBrightness(page, 240));
    console.log(`level ${level} ${fire}`, JSON.stringify(result));
    await shot(page, `robot-rescue-new-everything-level${level}-${fire}`);
    await stopHunting(page);
    expect(result.biggestStep).toBeLessThan(6);
    expect(result.flickeringShare).toBeLessThan(0.02);
  });
}

test('with reduced motion the new things still work, and the bubbles, lids and floating friends don\'t wobble', async ({ page }) => {
  test.setTimeout(240_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await reachRescue(page, atLevel(9, { reach: 'lots' }));
  await stayAwake(page);
  await page.evaluate(() => {
    const { mission } = window.__game;
    mission.startPower('guard');
    const lid = mission.spawn('lid', 0.9);
    lid.state = 'ready';
    mission.trap(mission.robots.find(({ kind }) => kind === 'walker' || kind === 'lid' || kind === 'splitter'));
    mission.bonk(lid);
    mission.drop(mission.robots.find(({ kind }) => kind === 'carrier'));
  });
  await page.waitForTimeout(800);
  const still = await page.evaluate(async () => {
    const { stage } = window.__game;
    let lidTurn = 0;
    let sway = 0;
    let wobble = 0;
    for (let i = 0; i < 40; i += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      for (const view of stage.views.values()) if (view.lid) lidTurn = Math.max(lidTurn, Math.abs(view.lid.rotation.x));
      // (The lid only tips back when it's bonked, and not at all with reduced motion.)
      for (const floating of stage.floating) sway = Math.max(sway, Math.abs(floating.root.rotation.z));
      for (const bubble of stage.bubbles.values()) wobble = Math.max(wobble, Math.abs(bubble.mesh.scale.x - bubble.mesh.scale.y));
    }
    return { lidTurn, sway, wobble, floating: stage.floating.length, bubbles: stage.bubbles.size };
  });
  expect(still).toEqual({ lidTurn: 0, sway: 0, wobble: 0, floating: 1, bubbles: 1 });
  await shot(page, 'robot-rescue-new-reduced-motion');
});

test('each prize flies to its own counter, a power-up to its own place among the power-ups, and a heart to the hearts', async ({ page }) => {
  test.setTimeout(240_000);
  await reachRescue(page, atLevel(7, { reach: 'lots', rescueGoo: 'medium' }), NO_HAND);
  await stayAwake(page);
  const landed = await page.evaluate(async () => {
    const { mission, stage } = window.__game;
    mission.holdThrows = 9999;
    mission.hearts -= 1;
    window.__game.game.showHearts();
    const robot = mission.robots.find(({ kind }) => kind !== 'big');
    // The first gem, star and power-ups of the game, all at once, with nothing counted yet.
    const prizes = [mission.addPrize('gem', robot, 0), mission.addPrize('star', robot, 1), mission.addPrize('power', robot, 2, { power: 'boing' }), mission.addPrize('power', robot, 3, { power: 'heart' })];
    const homeOf = (prize) => {
      const selector = { gem: "#chip-haul [data-haul='gem'] [aria-hidden]", star: "#chip-haul [data-haul='star'] [aria-hidden]" }[prize.kind]
        ?? (prize.power === 'heart' ? '#chip-hearts .heart.is-gone' : `#chip-power [data-power='${prize.power}'] .power-mark`);
      const box = document.querySelector(selector)?.getBoundingClientRect();
      return box?.width ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null;
    };
    const ends = {};
    while (prizes.some((prize) => mission.prizes.includes(prize))) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      for (const prize of prizes) {
        const look = stage.prizeLooks.get(prize);
        const key = prize.power ?? prize.kind;
        if (look?.screen && prize.t > 0.93 && !ends[key]) {
          const home = homeOf(prize);
          ends[key] = home ? Math.round(Math.hypot(look.screen.x - home.x, look.screen.y - home.y)) : null;
        }
      }
    }
    return ends;
  });
  console.log('how far from its own counter each prize got', JSON.stringify(landed));
  for (const kind of ['gem', 'star', 'boing', 'heart']) {
    expect(landed[kind], kind).not.toBeNull();
    expect(landed[kind], kind).toBeLessThan(40);
  }
});

test('prizes still on their way when the tram moves on keep flying over, and are counted when they get there', async ({ page }) => {
  test.setTimeout(240_000);
  await reachRescue(page, atLevel(5, { reach: 'lots' }), NO_HAND);
  await stayAwake(page);
  await clearHere(page);
  const seen = await page.evaluate(async () => {
    const { mission, stage } = window.__game;
    while (mission.phase !== 'moving') await new Promise((resolve) => requestAnimationFrame(resolve));
    const atStart = mission.prizes.filter(({ t }) => t >= 0).length;
    let gaps = 0;
    while (mission.phase === 'moving') {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const flying = mission.prizes.filter(({ t }) => t >= 0 && t < 1).length;
      if (stage.placePrizes(0).length !== flying) gaps += 1;
    }
    return { atStart, gaps, left: mission.prizes.filter(({ place }) => place === 'market').length };
  });
  expect(seen.atStart).toBeGreaterThan(0);
  expect(seen.gaps).toBe(0);
  expect(seen.left).toBe(0);
});

test('the progress bar never goes back: not at the next stop, and not when a robot comes apart into two', async ({ page }) => {
  test.setTimeout(240_000);
  await reachRescue(page, atLevel(6, { stops: 3 }), NO_HAND);
  await stayAwake(page);
  const widths = await page.evaluate(async () => {
    const { mission } = window.__game;
    const bar = document.querySelector('#race-progress-fill');
    const seen = [parseFloat(bar.style.width) || 0];
    for (let i = 0; i < 600 && mission.index < 2; i += 1) {
      if (mission.phase === 'fighting') {
        const robot = mission.robots.find(({ kind }) => kind === 'splitter') ?? mission.robots.find(({ kind }) => kind !== 'big') ?? mission.robots[0];
        if (robot) mission.drop(robot);
      }
      seen.push(parseFloat(bar.style.width) || 0);
      await new Promise((resolve) => setTimeout(resolve, 40));
      seen.push(parseFloat(bar.style.width) || 0);
    }
    return seen;
  });
  expect(widths.at(-1)).toBeGreaterThan(widths[0]);
  const back = widths.filter((width, index) => index > 0 && width < widths[index - 1]);
  expect(back).toEqual([]);
});

test('a power-up\'s name follows the voice\'s language when a grown-up changes it in the middle of a game', async ({ page }) => {
  await reachRescue(page, atLevel(4, { reach: 'lots' }), NO_HAND);
  await stayAwake(page);
  await page.evaluate(() => window.__game.mission.startPower('bubble'));
  await expect(page.locator('#chip-power .chip-label')).toHaveText('Bubble shot');
  await page.locator('#open-panel').click();
  await page.locator('input[name="language"][value="ka"]').check();
  await page.locator('#close-panel').click();
  await expect(page.locator('#chip-power .chip-label')).toHaveText('ბუშტის გასროლა');
});

test('the new robots on foot have a shadow under them, as walkers do', async ({ page }) => {
  await reachRescue(page, atLevel(6, { reach: 'lots' }), NO_HAND);
  await stayAwake(page);
  const shadows = await page.evaluate(() => {
    const { mission, stage } = window.__game;
    for (const kind of ['lid', 'splitter', 'mini', 'keybot', 'walker']) mission.spawn(kind, 0.9);
    const out = {};
    for (const [robot, view] of stage.views) {
      if (out[robot.kind] !== undefined) continue;
      out[robot.kind] = view.root.children.some((child) => child.material === stage.shadowPaint);
    }
    return out;
  });
  for (const kind of ['lid', 'splitter', 'mini', 'keybot', 'walker']) expect(shadows[kind], kind).toBe(true);
  await page.waitForTimeout(600);
  await shot(page, 'robot-rescue-new-shadows');
});
