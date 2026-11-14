// What Cannon Bay's levels bring that's new, in the real game with real photos going through the real
// tracker: new kinds of fire, new kinds of pirate ship, prizes and power-ups, and the weather. What each
// level switches on is in levelPlan and NEWS in battle.js, and the rules are tested in
// test/unit/cannon-bay.test.js. This checks they really appear on the screen, work and are counted.
import { expect, openGame, shot, show, test, waitForScreen } from '../helpers.js';
import { battleState, expectSoon, holdPirate, letPirateGo, startPlaying } from './helpers.js';

const atLevel = (level, settings = {}) => ({ levels: { 'cannon-bay': level }, bayShips: 4, ...settings });

/** The pirate that matches, put this far off to the right of the child's ship and side on, for a test about it. */
const bringAlongside = (page, kind = null, { away = 80, off = Math.PI * 0.42 } = {}) => page.evaluate(([wanted, distance, bearing]) => {
  const { battle } = window.__game;
  const pirate = battle.afloat.find((each) => !wanted || each.kind === wanted || (wanted === 'key' && each.key) || (wanted === 'cage' && each.cage));
  if (!pirate) return null;
  clearInterval(window.__alongside);
  window.__alongside = setInterval(() => {
    if (pirate.state !== 'sailing') return;
    const direction = battle.heading + bearing;
    pirate.x = battle.x + Math.sin(direction) * distance;
    pirate.z = battle.z - Math.cos(direction) * distance;
    pirate.heading = battle.heading;
    pirate.mode = 'away';
    pirate.spot = { x: pirate.x, z: pirate.z };
    pirate.modeLeft = 5;
    pirate.runAt = -1;
    pirate.fireIn = 100;
    for (const other of battle.afloat) {
      if (other === pirate) continue;
      other.x = battle.x - Math.sin(battle.heading) * 640;
      other.z = battle.z + Math.cos(battle.heading) * 640;
      other.fireIn = 100;
    }
    battle.broadsideIn = 100;
  }, 16);
  return pirate.index;
}, [kind, away, off]);

const letGo = (page) => page.evaluate(() => clearInterval(window.__alongside));

/** Beats the one being held alongside, as the cannons would. */
const beatHeld = (page) => page.evaluate(() => {
  const { battle } = window.__game;
  const pirate = battle.afloat.find((each) => Math.hypot(each.x - battle.x, each.z - battle.z) < 200);
  while (pirate && pirate.state === 'sailing') battle.hit(pirate, pirate);
  return pirate?.kind ?? null;
});

/** A power-up floating right beside the ship, to be picked up. */
const dropPower = (page, power) => page.evaluate((kind) => {
  const { battle } = window.__game;
  const right = { x: Math.cos(battle.heading), z: Math.sin(battle.heading) };
  battle.addPrize('power', battle.x + right.x * 40, battle.z + right.z * 40, { power: kind });
}, power);

const labelShown = (page, key) => expect.poll(() => page.locator(`.bay-label[data-key="${key}"]`).evaluate((node) => Number(node.style.opacity)).catch(() => 0), { timeout: 8000, intervals: [100] }).toBeGreaterThan(0.5);

const stats = async (page) => (await battleState(page)).stats;

test('what each level brings is on the title card, and nothing at level 1', async ({ page }) => {
  const expected = {
    1: '',
    2: 'New:💎Gems🍡Triple shot',
    3: 'New:🛟Sailors to rescue❤️Extra hearts',
    4: 'New:🛶Barrel rafts🛡️Shield bubble',
    5: 'New:⛵Quick sloops🫧Bubble shot',
    6: 'New:🗝️Key and chest🧲Magnet',
    7: 'New:💨Smoke ships☁️Sea mist',
    8: 'New:🔭Submarines🏐Bouncing ball',
    9: 'New:🚢Big flagship❄️Snow shot',
    10: 'New:👑Pirate King🌅Sunset',
  };
  await openGame(page, atLevel(1), 'cannon-bay');
  for (const [level, text] of Object.entries(expected)) {
    await page.locator('#open-panel').click();
    await page.locator(`#level-choice input[value="${level}"]`).check();
    await page.locator('#close-panel').click();
    await expect(page.locator('#level-badge')).toHaveText(`Level ${level} of 10`);
    if (text) await expect(page.locator('#level-new')).toHaveText(text);
    else await expect(page.locator('#level-new')).toBeHidden();
  }
  await shot(page, 'cannon-bay-new-title');
});

test('the chips under the countdown are in Georgian with a Georgian voice, and the finish card says what\'s coming up', async ({ page }) => {
  await openGame(page, atLevel(7, { language: 'ka' }), 'cannon-bay');
  await show(page, null, 'open', { scale: 0.7 });
  await page.locator('#start').click();
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-new-now')).toContainText('კვამლის გემები');
  await expect(page.locator('#level-new-now')).toContainText('ზღვის ნისლი');
  await shot(page, 'cannon-bay-new-countdown-ka');
  await waitForScreen(page, 'playing');
  await page.evaluate(() => {
    const { battle } = window.__game;
    for (const pirate of [...battle.afloat]) while (pirate.state === 'sailing') battle.hit(pirate, pirate);
    battle.waiting = 0;
    battle.total = battle.stats.beaten;
    battle.wonIn = 0.1;
  });
  await waitForScreen(page, 'finish');
  await expect(page.locator('#level-next-new')).toHaveText('Coming up:🔭Submarines🏐Bouncing ball');
});

test('level 2: gems and a triple shot drop from a beaten ship, float over, and are picked up and counted', async ({ page }) => {
  await startPlaying(page, atLevel(2));
  await expect(page.locator('#bay-prizes .bay-prize[data-kind="gems"]')).toBeVisible();
  await expect(page.locator('#bay-prizes .bay-prize[data-kind="sailors"]')).toBeHidden();
  await bringAlongside(page);
  await page.waitForTimeout(500);
  await beatHeld(page);
  await letGo(page);
  await labelShown(page, 'gems');
  await labelShown(page, 'triple');
  await page.waitForTimeout(250);
  await shot(page, 'cannon-bay-level2-gems-drop');
  await expectSoon(async () => (await stats(page)).gems).toBe(3);
  await expect(page.locator('#bay-gems')).toHaveText('3');
  await expectSoon(async () => (await battleState(page)).stats.powers).toBe(1);
  await expect(page.locator('#bay-power')).toBeVisible();
  await expect(page.locator('#bay-power')).toContainText('Triple shot');
  // Three balls at a time now, at the next one alongside.
  await page.evaluate(() => {
    window.__most = 0;
    window.__mostTimer = setInterval(() => {
      const { battle } = window.__game;
      window.__most = Math.max(window.__most, battle.shots.filter(({ fire }) => fire === 'triple').length);
    }, 20);
  });
  await holdPirate(page, { off: Math.PI * 0.42, away: 90 });
  await expect.poll(() => page.evaluate(() => window.__most), { timeout: 10_000 }).toBeGreaterThanOrEqual(3);
  await page.waitForTimeout(200);
  await shot(page, 'cannon-bay-level2-triple-shot');
  await letPirateGo(page);
  // It runs out after a few seconds, and the bar goes down first. Nothing more is beaten meanwhile, so
  // that no other triple shot is picked up.
  const share = await page.locator('#bay-power-fill').evaluate((node) => parseFloat(node.style.width));
  expect(share).toBeLessThan(100);
  await page.evaluate(() => {
    const { battle } = window.__game;
    battle.prizes = [];
    for (const pirate of battle.afloat) pirate.hitsLeft = pirate.maxHits = 1e6;
  });
  await expect(page.locator('#bay-power')).toBeHidden({ timeout: 15_000 });
});

test('level 3: a sailor in a cage is towed behind a pirate, floats free, and is rescued; a heart goes over five', async ({ page }) => {
  await startPlaying(page, atLevel(3));
  await expect.poll(() => page.evaluate(() => window.__game.battle.afloat.some(({ cage }) => cage)), { timeout: 10_000 }).toBe(true);
  await bringAlongside(page, 'cage', { away: 90, off: Math.PI * 0.32 });
  await labelShown(page, 'sailors');
  await page.waitForTimeout(300);
  await shot(page, 'cannon-bay-level3-cage-towed');
  await expect(page.locator('.mark:not([data-where="none"]) .mark-badge', { hasText: '🛟' }).first()).toBeVisible();
  await beatHeld(page);
  await letGo(page);
  await expectSoon(async () => (await stats(page)).sailors).toBe(1);
  await expect(page.locator('#bay-sailors')).toHaveText('1');
  // And there they are, on deck with Giraffe's crew.
  expect(await page.evaluate(() => window.__game.bay.hero.rescued.map(({ visible }) => visible))).toEqual([true, false, false, false]);
  // The heart is the newest thing here, so it's what the first ship beaten drops.
  await expectSoon(async () => (await stats(page)).hearts).toBe(1);
  await expect(page.locator('#hearts')).toHaveText('♥♥♥♥♥♥');
  await shot(page, 'cannon-bay-level3-rescued');
});

test('level 4: a barrel raft comes apart into two little rafts, and the shield bubble keeps a ball off', async ({ page }) => {
  await startPlaying(page, atLevel(4, { bayPirates: 'medium' }));
  expect(await page.evaluate(() => window.__game.battle.afloat[0].kind)).toBe('raft');
  // Its name waits until it can be seen.
  await bringAlongside(page, 'raft', { away: 85 });
  await labelShown(page, 'rafts');
  await page.waitForTimeout(600);
  await shot(page, 'cannon-bay-level4-raft');
  // Nobody is on a raft, so nobody is heard rowing away, or said to be.
  await page.evaluate(() => {
    const { sound, game } = window.__game;
    window.__played = [];
    window.__said = [];
    const play = sound.play.bind(sound);
    sound.play = (name, options) => {
      window.__played.push(name);
      return play(name, options);
    };
    const say = game.say.bind(game);
    game.say = (who, text, options) => {
      window.__said.push({ who, text });
      return say(who, text, options);
    };
    game.storyLeft = 0;
    game.saidBye = 0;
  });
  await beatHeld(page);
  await letGo(page);
  expect(await page.evaluate(() => window.__played)).toContain('down');
  expect(await page.evaluate(() => window.__played)).not.toContain('row');
  expect(await page.evaluate(() => window.__said.map(({ text }) => text))).not.toContain('Bye bye! They’re rowing home!');
  // The shield is the newest power-up here, so it's what the raft drops.
  await labelShown(page, 'shield');
  const littles = await page.evaluate(() => window.__game.battle.afloat.filter(({ little }) => little).length);
  expect(littles).toBe(2);
  // The little rafts are the same captain's, who doesn't say their line again when they come near.
  const repeated = await page.evaluate(async () => {
    const { battle, game } = window.__game;
    const raftCaptain = game.order[battle.afloat.find(({ little }) => little).index % game.order.length];
    window.__said = [];
    for (let i = 0; i < 20; i += 1) {
      game.nextCaptainIn = 0;
      game.storyLeft = 0;
      for (const pirate of battle.afloat) {
        const direction = battle.heading + (pirate.little ? Math.PI / 2 : Math.PI);
        const away = pirate.little ? 120 : 600;
        pirate.x = battle.x + Math.sin(direction) * away;
        pirate.z = battle.z - Math.cos(direction) * away;
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return window.__said.filter(({ who }) => who === raftCaptain).length;
  });
  expect(repeated).toBe(0);
  expect((await battleState(page)).left).toBe(5);
  await expect(page.locator('#bay-left')).toHaveText('5');
  await page.waitForTimeout(900);
  await shot(page, 'cannon-bay-level4-little-rafts');
  await expect.poll(() => page.locator('.mark[data-kind="little"]:not([data-where="none"])').count(), { timeout: 5000 }).toBe(2);

  await dropPower(page, 'shield');
  await expectSoon(async () => page.evaluate(() => window.__game.battle.power?.kind)).toBe('shield');
  const hearts = (await battleState(page)).hearts;
  await page.evaluate(() => {
    const { battle } = window.__game;
    battle.balls.push({ from: { x: battle.x, y: 5, z: battle.z }, to: { x: battle.x, z: battle.z }, t: 0.98, seconds: 2, arc: 30, x: battle.x, y: 1, z: battle.z, harmless: false, pirate: null });
  });
  await expectSoon(async () => (await stats(page)).blocked).toBe(1);
  expect((await battleState(page)).hearts).toBe(hearts);
  await page.waitForTimeout(400);
  await shot(page, 'cannon-bay-level4-shield');
  expect(await page.evaluate(() => window.__game.bay.shield.visible)).toBe(true);
});

test('level 5: the bubble shot traps a pirate ship in a bubble, and it stops', async ({ page }) => {
  await startPlaying(page, atLevel(5));
  // The newest kind of ship is the first one out.
  expect(await page.evaluate(() => window.__game.battle.afloat[0].kind)).toBe('sloop');
  await bringAlongside(page, 'sloop', { away: 90 });
  await labelShown(page, 'sloops');
  await letGo(page);
  await dropPower(page, 'bubble');
  await expectSoon(async () => page.evaluate(() => window.__game.battle.power?.kind)).toBe('bubble');
  await labelShown(page, 'bubble');
  await holdPirate(page, { off: Math.PI * 0.42, away: 90 });
  await expect.poll(() => page.evaluate(() => window.__game.battle.afloat.some(({ bubbled }) => bubbled > 0)), { timeout: 10_000 }).toBe(true);
  await letPirateGo(page);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__game.bay.bubbles.some(({ visible }) => visible))).toBe(true);
  await shot(page, 'cannon-bay-level5-bubble');
});

test('level 6: a key brings a treasure chest, which opens when the ship sails over it; the magnet brings prizes over', async ({ page }) => {
  await startPlaying(page, atLevel(6));
  await expect(page.locator('.mark:not([data-where="none"]) .mark-badge', { hasText: '🗝️' })).toBeVisible({ timeout: 10_000 });
  await bringAlongside(page, 'key');
  await page.waitForTimeout(300);
  // The magnet is the first thing it drops here, as the newest. It's taken away straight away, as it would
  // bring the chest over too.
  await page.evaluate(() => {
    const { battle } = window.__game;
    const pirate = battle.afloat.find(({ key }) => key);
    while (pirate.state === 'sailing') battle.hit(pirate, pirate);
    battle.prizes = battle.prizes.filter(({ kind }) => kind !== 'power');
    if (battle.power?.kind === 'magnet') battle.power = null;
  });
  await letGo(page);
  // Straight over the key, as floating over is tested at level 2.
  await page.evaluate(() => {
    const { battle } = window.__game;
    battle.prizes = battle.prizes.filter(({ kind }) => kind !== 'power');
    if (battle.power?.kind === 'magnet') battle.power = null;
    // It may already have floated over.
    const key = battle.prizes.find(({ kind }) => kind === 'key');
    if (key) {
      battle.x = key.x;
      battle.z = key.z;
    }
  });
  await expectSoon(async () => (await stats(page)).keys).toBe(1);
  await labelShown(page, 'chest');
  await page.waitForTimeout(500);
  await shot(page, 'cannon-bay-level6-chest');
  await page.evaluate(() => {
    const { battle } = window.__game;
    const chest = battle.prizes.find(({ kind }) => kind === 'chest');
    battle.x = chest.x;
    battle.z = chest.z;
  });
  await expectSoon(async () => (await stats(page)).chests).toBe(1);
  await expect(page.locator('#bay-chests')).toHaveText('1');
  await expectSoon(async () => (await stats(page)).gems, 40_000).toBeGreaterThanOrEqual(6);

  await page.evaluate(() => {
    const { battle } = window.__game;
    const ahead = { x: Math.sin(battle.heading), z: -Math.cos(battle.heading) };
    for (let i = 0; i < 4; i += 1) battle.addPrize('gem', battle.x + ahead.x * (250 + i * 20), battle.z + ahead.z * (250 + i * 20), { colour: i });
  });
  const gems = (await stats(page)).gems;
  await dropPower(page, 'magnet');
  await expectSoon(async () => (await stats(page)).gems, 40_000).toBeGreaterThanOrEqual(gems + 4);
});

test('level 7: a smoke ship hides in its smoke and can\'t be fired at, in a sea mist', async ({ page }) => {
  await startPlaying(page, atLevel(7));
  expect(await page.evaluate(() => window.__game.bay.weather)).toBe('mist');
  await labelShown(page, 'mist');
  await shot(page, 'cannon-bay-level7-mist');
  await bringAlongside(page, 'smoky', { away: 95 });
  await page.evaluate(() => {
    const { battle } = window.__game;
    const smoky = battle.afloat.find(({ kind }) => kind === 'smoky');
    while (smoky.smoke <= 0) battle.hit(smoky, smoky);
  });
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__game.battle.zones.right.inside || window.__game.battle.zones.left.inside)).toBe(false);
  await expect(page.locator('.mark[data-kind="smoky"]')).toHaveAttribute('data-state', 'hidden');
  await page.waitForTimeout(500);
  await shot(page, 'cannon-bay-level7-smoke');
  await expect.poll(() => page.evaluate(() => window.__game.battle.zones.right.inside || window.__game.battle.zones.left.inside), { timeout: 8000 }).toBe(true);
  await letGo(page);
});

test('level 8: a submarine comes up, dives with only its periscope showing, and the bouncing ball goes on to the next ship', async ({ page }) => {
  await startPlaying(page, atLevel(8));
  expect(await page.evaluate(() => window.__game.battle.afloat[0].kind)).toBe('sub');
  await bringAlongside(page, 'sub', { away: 85 });
  await labelShown(page, 'subs');
  // What came in at the levels before isn't named again, so there are never many names at once.
  expect(await page.evaluate(() => window.__game.battle.afloat.map(({ kind }) => kind))).toContain('smoky');
  await expect(page.locator('.bay-label[data-key="smoke"], .bay-label[data-key="sailors"]')).toHaveCount(0);
  await page.waitForTimeout(700);
  await shot(page, 'cannon-bay-level8-sub');
  await page.evaluate(() => {
    const sub = window.__game.battle.afloat.find(({ kind }) => kind === 'sub');
    sub.diveIn = 0;
  });
  await expect.poll(() => page.evaluate(() => window.__game.battle.afloat.find(({ kind }) => kind === 'sub').under), { timeout: 3000 }).toBe(true);
  await page.waitForTimeout(1500);
  await shot(page, 'cannon-bay-level8-sub-under');
  expect(await page.evaluate(() => window.__game.battle.targets.some(({ kind }) => kind === 'sub'))).toBe(false);
  await letGo(page);

  // Two ships side by side, and the big ball bounces from one to the other.
  await dropPower(page, 'bounce');
  await expectSoon(async () => page.evaluate(() => window.__game.battle.power?.kind)).toBe('bounce');
  await page.evaluate(() => {
    window.__bounces = 0;
    const { game } = window.__game;
    const before = game.onBattle.bind(game);
    game.battle.onEvent = (event) => {
      if (event.type === 'bounce') window.__bounces += 1;
      before(event);
    };
    window.__pair = setInterval(() => {
      const { battle } = window.__game;
      const ships = battle.afloat.filter(({ kind }) => kind !== 'sub').slice(0, 2);
      ships.forEach((pirate, index) => {
        const direction = battle.heading + Math.PI * (0.36 + index * 0.14);
        pirate.x = battle.x + Math.sin(direction) * (95 + index * 20);
        pirate.z = battle.z - Math.cos(direction) * (95 + index * 20);
        pirate.heading = battle.heading;
        pirate.mode = 'away';
        pirate.spot = { x: pirate.x, z: pirate.z };
        pirate.modeLeft = 5;
        pirate.fireIn = 100;
        pirate.runAt = -1;
      });
    }, 16);
  });
  await expect.poll(() => page.evaluate(() => window.__bounces), { timeout: 10_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  await shot(page, 'cannon-bay-level8-bounce');
  await page.evaluate(() => clearInterval(window.__pair));
});

test('level 9: the snow shot slows a ship down, with pale sails and snowflakes, and the flagship is last', async ({ page }) => {
  await startPlaying(page, atLevel(9));
  expect(await page.evaluate(() => window.__game.battle.roles.at(-1).kind)).toBe('flagship');
  await dropPower(page, 'snow');
  await expectSoon(async () => page.evaluate(() => window.__game.battle.power?.kind)).toBe('snow');
  await labelShown(page, 'snow');
  await holdPirate(page, { off: Math.PI * 0.42, away: 90 });
  await expect.poll(() => page.evaluate(() => window.__game.battle.afloat.some(({ frosted }) => frosted > 0)), { timeout: 10_000 }).toBe(true);
  await page.waitForTimeout(1200);
  await shot(page, 'cannon-bay-level9-snow');
  await letPirateGo(page);
});

test('level 10: the pirate king\'s sails come down one at a time, at sunset', async ({ page }) => {
  await startPlaying(page, atLevel(10));
  expect(await page.evaluate(() => window.__game.bay.weather)).toBe('sunset');
  await labelShown(page, 'sunset');
  await shot(page, 'cannon-bay-level10-sunset');
  // With four ships, the king is out from the start, as the last of them. The others are beaten.
  expect(await page.evaluate(() => window.__game.battle.afloat.map(({ kind }) => kind))).toEqual(['sub', 'ship', 'smoky', 'king']);
  await page.evaluate(() => {
    const { battle } = window.__game;
    for (const pirate of battle.afloat.filter(({ kind }) => kind !== 'king')) while (pirate.state === 'sailing') battle.hit(pirate, pirate);
  });
  await bringAlongside(page, 'king', { away: 150, off: Math.PI * 0.2 });
  await labelShown(page, 'king');
  await expect(page.locator('.mark:not([data-where="none"]) .mark-badge', { hasText: '👑' })).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, 'cannon-bay-level10-king');
  await page.evaluate(() => {
    const { battle } = window.__game;
    const king = battle.afloat.find(({ kind }) => kind === 'king');
    while (king.partsLeft > 2) battle.hit(king, king);
  });
  await page.waitForTimeout(1800);
  const shares = await page.evaluate(() => {
    const { battle, bay } = window.__game;
    const king = battle.afloat.find(({ kind }) => kind === 'king');
    return bay.shipFor(king).sailShares.map((share) => Math.round(share * 100) / 100);
  });
  expect(shares.filter((share) => share < 0.1).length).toBe(2);
  await shot(page, 'cannon-bay-level10-king-two-sails');
  await letGo(page);
});

test('with reduced motion, the new things move more calmly too: prizes bob less, and there are fewer shapes', async ({ page, pageErrors }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startPlaying(page, atLevel(8));
  expect(await page.evaluate(() => window.__game.bay.prizeDrawing.calm)).toBeLessThan(0.5);
  await bringAlongside(page, 'sub', { away: 85 });
  await page.waitForTimeout(300);
  await beatHeld(page);
  await letGo(page);
  await dropPower(page, 'bounce');
  await expectSoon(async () => (await stats(page)).gems).toBeGreaterThan(0);
  await page.waitForTimeout(600);
  await shot(page, 'cannon-bay-level8-reduced-motion');
  expect(pageErrors).toEqual([]);
});

for (const [width, height, name] of [[1024, 600, 'laptop'], [820, 1180, 'tablet']]) {
  test(`the prizes and a power-up along the top fit on a ${name} screen, beside the camera picture`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await startPlaying(page, atLevel(10));
    await page.evaluate(() => window.__game.battle.startPower('bounce'));
    await expect(page.locator('#bay-power')).toBeVisible();
    const boxes = await page.evaluate(() => {
      const box = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
      return { prizes: box('#bay-prizes'), power: box('#bay-power'), camera: box('#camera-frame'), overflow: document.documentElement.scrollWidth - innerWidth };
    });
    expect(boxes.overflow).toBeLessThanOrEqual(0);
    // All on one line, clear of the camera picture.
    expect(boxes.power.top).toBeLessThan(boxes.prizes.top + 10);
    expect(boxes.prizes.right).toBeLessThanOrEqual(boxes.camera.left);
    await page.waitForTimeout(300);
    await shot(page, `cannon-bay-fits-${name}-level10`);
  });
}

test('the name of something new waits until "GO!" has gone, and only then starts counting down', async ({ page }) => {
  await startPlaying(page, atLevel(10));
  const early = await page.evaluate(() => {
    const { session, game } = window.__game;
    const label = game.labels.find(({ key }) => key === 'sunset');
    return { seconds: session.playSeconds, left: label?.left, opacity: Number(label?.root.style.opacity || 0) };
  });
  expect(early.left).toBeDefined();
  if (early.seconds < 1.2) {
    expect(early.left).toBe(2.8);
    expect(early.opacity).toBe(0);
  }
  await labelShown(page, 'sunset');
  expect(await page.evaluate(() => window.__game.session.playSeconds)).toBeGreaterThan(1.3);
});

test('whatever is still floating over to the ship when the battle is won is counted on the finish card', async ({ page }) => {
  await startPlaying(page, atLevel(2));
  // Every pirate beaten alongside, the last far enough off that its gems are still on their way at the end.
  const dropped = await page.evaluate(() => {
    const { battle } = window.__game;
    window.__dropped = 0;
    battle.onEvent = ((before) => (event) => {
      if (event.type === 'drop' && event.prize.kind === 'gem') window.__dropped += 1;
      before(event);
    })(battle.onEvent);
    const right = { x: Math.cos(battle.heading), z: Math.sin(battle.heading) };
    for (let i = 0; i < 4; i += 1) {
      battle.fill();
      const pirate = battle.afloat[0];
      const away = i === 3 ? 140 : 60;
      pirate.x = battle.x + right.x * away;
      pirate.z = battle.z + right.z * away;
      pirate.heading = battle.heading;
      while (pirate.state === 'sailing') battle.hit(pirate, pirate);
    }
    // Nothing else to pick up, so this is about the gems.
    battle.prizes = battle.prizes.filter(({ kind }) => kind === 'gem');
    battle.power = null;
    return window.__dropped;
  });
  expect(dropped).toBe(12);
  await waitForScreen(page, 'finish');
  const counted = await page.evaluate(() => window.__game.battle.stats.gems);
  expect(counted).toBe(12);
  await expect(page.locator('#sum-right-prizes')).toContainText('💎 12');
});

test('a power-up\'s name follows the voice\'s language when a grown-up changes it in the middle of a battle', async ({ page }) => {
  await startPlaying(page, atLevel(2));
  await page.evaluate(() => window.__game.battle.startPower('triple'));
  await expect(page.locator('#bay-power-name')).toHaveText('Triple shot');
  await page.locator('#open-panel').click();
  await page.locator('input[name="language"][value="ka"]').check();
  await page.locator('#close-panel').click();
  await expect(page.locator('#bay-power-name')).toHaveText('სამმაგი გასროლა');
});

test('the story box goes under the prizes along the top, even when they need a second row, in Georgian', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 760 });
  await startPlaying(page, atLevel(10, { language: 'ka' }));
  await page.evaluate(() => {
    const { battle, game } = window.__game;
    battle.startPower('bounce');
    game.say('giraffe', 'Pirates want our treasure! Help me drive them off!');
  });
  await expect(page.locator('#bay-power')).toBeVisible();
  await expect(page.locator('.story')).toBeVisible();
  await page.waitForTimeout(800);
  const boxes = await page.evaluate(() => {
    const box = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
    return { prizes: box('#bay-prizes'), power: box('#bay-power'), story: box('.story') };
  });
  console.log('story under the prizes', JSON.stringify({ prizesBottom: boxes.prizes.bottom, powerBottom: boxes.power.bottom, storyTop: boxes.story.top }));
  expect(boxes.story.top).toBeGreaterThanOrEqual(Math.max(boxes.prizes.bottom, boxes.power.bottom));
  await shot(page, 'cannon-bay-story-under-prizes-ka');
});
