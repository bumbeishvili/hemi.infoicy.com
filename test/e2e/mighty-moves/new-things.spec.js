// What each level of Mighty Moves brings that's new: that it's listed on the title card, turns up in the
// fight with a small label the first time, works, and that prizes are collected and counted. Also that
// nothing flashes with all of it on the screen at once, in a middle level and at level 10.
import { expect, shot, test, waitForScreen } from '../helpers.js';
import { askFor, doWhatIsAsked, fightState, footage, openMoves, reachFight, stopDoingIt } from './helpers.js';

const at = (level, settings = {}) => ({ levels: { 'mighty-moves': level }, ...settings });

/** Always moving, as far as resting goes, so the computer takes its turns. */
const keepMoving = (page) => page.evaluate(() => {
  window.__moving = setInterval(() => window.__game.fight?.noteActivity(0), 100);
});
const stopMoving = (page) => page.evaluate(() => clearInterval(window.__moving));

/** The test decides whether hands are up or the body is leaning, rather than the footage. */
const takeOverGuardAndLean = (page) => page.evaluate(() => {
  const { reader } = window.__game;
  reader.readGuardAndLean = () => {
    reader.guard = Boolean(window.__guard);
    reader.dodge = window.__lean ? 0.9 : 0;
  };
});

/** The computer's turn now, needing this way out of the way, with no second hit after it. */
const turnOf = (page, kind) => page.evaluate((wanted) => {
  const { coach } = window.__game;
  const ways = coach.level.defences.filter((way) => !coach.putAside.has(way));
  // They take turns from the way this level brings.
  const first = Math.max(0, ways.indexOf(coach.newWay));
  coach.defences = (ways.indexOf(wanted) - first + ways.length) % ways.length;
  coach.random = () => 0.99;
  coach.computerIn = 0;
}, kind);

/**
 * Waits for the computer's turn needing this way out, and holds it where it is in the same moment, so a picture
 * can be taken before the child moves. A turn is only a few seconds, the level's first may already be under way,
 * and its label can wait behind another, so anything checked first could find it over.
 */
const holdTurnOf = (page, kind) => page.waitForFunction((wanted) => {
  const { coach } = window.__game;
  if (coach.phase !== 'defending' || coach.defence?.kind !== wanted) return false;
  coach.defence.left = 60;
  coach.defence.then = null;
  return true;
}, kind, { timeout: 10_000, polling: 'raf' });

const coachPhase = (page) => page.evaluate(() => ({ phase: window.__game.coach.phase, kind: window.__game.coach.defence?.kind ?? null }));
const prizeShown = (page, kind) => page.locator(`#prize-${kind} strong`);
const newLabel = (page) => page.locator('#new-thing');

/** The next big move landed brings this power-up. */
const powerUpNext = (page, kind) => page.evaluate((wanted) => {
  const { fight } = window.__game;
  const { powerUps } = fight.levelRules;
  // They take turns from the newest this level has.
  fight.stats.powerUps = (powerUps.indexOf(wanted) + 1) % powerUps.length;
  fight.bigMovesLanded = 3;
  fight.npc.hp = 100;
}, kind);

/** Does one thing the coach asks for, a clap so that it hits, and waits for it to land. */
async function oneBigMove(page) {
  await expect.poll(async () => (await coachPhase(page)).phase, { timeout: 10_000 }).toBe('asking');
  const computerIn = await page.evaluate(() => window.__game.coach.computerIn);
  await askFor(page, 'clap');
  await page.evaluate((left) => {
    window.__game.coach.computerIn = left;
  }, computerIn);
  const before = (await fightState(page)).stats.damage;
  await page.evaluate(() => {
    const { coach, game } = window.__game;
    game.onMoves([{ move: coach.call.exercise.reads[0], side: coach.call.side, hand: 'open' }]);
  });
  // A move asked for twice needs the second time too.
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const { coach, game } = window.__game;
    if (coach.phase === 'asking' && coach.call?.done > 0) game.onMoves([{ move: coach.call.exercise.reads[0], side: coach.call.side, hand: 'open' }]);
  });
  await expect.poll(async () => (await fightState(page)).stats.damage, { timeout: 10_000 }).toBeGreaterThan(before);
}

/** The picture's overall brightness, frame by frame. */
const brightness = (page, frames) => page.evaluate(async (count) => {
  const { arena } = window.__game;
  const reading = [];
  const small = document.createElement('canvas');
  small.width = 32;
  small.height = 18;
  const context = small.getContext('2d', { willReadFrequently: true });
  for (let i = 0; i < count; i += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    arena.render();
    context.drawImage(arena.canvas, 0, 0, 32, 18);
    const { data } = context.getImageData(0, 0, 32, 18);
    let total = 0;
    for (let j = 0; j < data.length; j += 4) total += (data[j] + data[j + 1] + data[j + 2]) / 3;
    reading.push(total / (32 * 18));
  }
  return reading;
}, frames);
const biggestStep = (reading) => Math.max(...reading.slice(1).map((value, index) => Math.abs(value - reading[index])));

test('the title card says what each level brings, in its own words, and level 1 nothing', async ({ page }) => {
  await openMoves(page);
  const expected = {
    1: '',
    2: 'New:🪙Coins',
    3: 'New:↔️Lean away💎Gems🌇Sunset',
    4: 'New:🫧Shield bubble',
    5: 'New:👊Two hits🏅Medals',
    6: 'New:⬇️Duck down🔀Mixed order🍂Autumn',
    7: 'New:✌️Do it twice⚡Super glow',
    8: 'New:🏐Catch the ball',
    9: 'New:🤝Helper friend❄️Snow',
    10: 'New:👑Champion🏆Trophy',
  };
  for (const [level, words] of Object.entries(expected)) {
    await page.evaluate((chosen) => {
      const { game } = window.__game;
      game.levels.choose(chosen);
      game.levelUi.refresh();
    }, Number(level));
    if (words) await expect(page.locator('#level-new'), `level ${level}`).toHaveText(words);
    else await expect(page.locator('#level-new'), 'level 1').toBeEmpty();
  }
  await shot(page, 'mighty-moves-new-title-l10');
});

test('level 2: every big move that lands drops a coin, which flies to its counter, and the first says "Coins"', async ({ page }) => {
  await reachFight(page, at(2));
  await expect(page.locator('#prize-coin')).toBeVisible();
  await expect(page.locator('#prize-gem')).toBeHidden();
  await expect(page.locator('.powerup:visible')).toHaveCount(0);
  await oneBigMove(page);
  await expect(newLabel(page)).toHaveText('Coins');
  await expect(newLabel(page).locator('.coin-mark')).toHaveCount(1);
  await expect(newLabel(page)).toBeVisible();
  await page.waitForTimeout(250);
  await shot(page, 'mighty-moves-l2-coin');
  await expect(prizeShown(page, 'coin')).toHaveText('1');
  await oneBigMove(page);
  await expect(prizeShown(page, 'coin')).toHaveText('2');
  expect((await fightState(page)).stats.prizes.coin).toBe(2);
  expect(await page.evaluate(() => window.__game.arena.theme)).toBe('day');
});

test('level 3: leaning comes in, in the sunset, and getting out of the way earns a gem', async ({ page }) => {
  await reachFight(page, at(3));
  expect(await page.evaluate(() => window.__game.arena.theme)).toBe('sunset');
  await takeOverGuardAndLean(page);
  await keepMoving(page);
  await turnOf(page, 'lean');
  await holdTurnOf(page, 'lean');
  await expect(page.locator('#coach-text')).toHaveText('Lean to the side!', { timeout: 10_000 });
  await expect(newLabel(page)).toContainText('Lean away');
  await page.waitForTimeout(300);
  await shot(page, 'mighty-moves-l3-lean-sunset');
  await page.evaluate(() => {
    window.__lean = true;
  });
  await expect(page.locator('.callout.is-seen').first()).toContainText('You leaned!', { timeout: 10_000 });
  await expect(prizeShown(page, 'gem')).toHaveText('1', { timeout: 10_000 });
  await page.evaluate(() => {
    window.__lean = false;
  });
  expect((await fightState(page)).player.hp).toBe(100);
  await stopMoving(page);
});

test('level 4: a shield bubble comes after a few big moves, and catches a hit that wasn\'t blocked', async ({ page }) => {
  await reachFight(page, at(4, { fightStrength: 'medium' }));
  await takeOverGuardAndLean(page);
  await powerUpNext(page, 'shield');
  await oneBigMove(page);
  await expect(page.locator('.powerup[data-kind="shield"]')).toBeVisible();
  await expect(newLabel(page)).toContainText('Shield bubble');
  await expect.poll(() => page.evaluate(() => window.__game.arena.bubble.visible)).toBe(true);
  await page.waitForTimeout(700);
  await shot(page, 'mighty-moves-l4-shield');
  // The computer's turn, and nobody blocks: the bubble catches it.
  await keepMoving(page);
  await turnOf(page, 'block');
  await expect(page.locator('#coach-text')).toHaveText('Hands up! Block!', { timeout: 10_000 });
  await expect(page.locator('.callout').filter({ hasText: 'Bubble!' })).toHaveCount(1, { timeout: 15_000 });
  await page.waitForTimeout(150);
  await shot(page, 'mighty-moves-l4-bubble-pops');
  expect((await fightState(page)).player.hp).toBe(100);
  await expect(page.locator('.powerup[data-kind="shield"]')).toBeHidden();
  expect(await page.evaluate(() => window.__game.fight.player.shield)).toBe(false);
  await stopMoving(page);
});

test('level 5: a round won is a medal, and some of the computer\'s turns are two hits', async ({ page }) => {
  test.setTimeout(180_000);
  await reachFight(page, at(5, { rounds: 3 }));
  await takeOverGuardAndLean(page);
  await keepMoving(page);
  await page.evaluate(() => {
    const { coach } = window.__game;
    coach.defences = 0;
    coach.random = () => 0;
    coach.computerIn = 0;
  });
  await expect(page.locator('#coach-text')).toHaveText('Hands up! Block!', { timeout: 10_000 });
  await page.evaluate(() => {
    window.__guard = true;
  });
  await expect(page.locator('#coach-text')).toHaveText('Lean to the side!', { timeout: 10_000 });
  await page.evaluate(() => {
    window.__guard = false;
    window.__lean = true;
  });
  await expect(newLabel(page)).toContainText('Two hits');
  await expect.poll(async () => (await coachPhase(page)).phase, { timeout: 10_000 }).toBe('asking');
  await page.evaluate(() => {
    window.__lean = false;
    window.__game.coach.random = () => 0.99;
  });
  await stopMoving(page);
  // Win the round.
  await page.evaluate(() => {
    window.__game.fight.npc.hp = 1;
  });
  await oneBigMove(page);
  await expect(prizeShown(page, 'medal')).toHaveText('1', { timeout: 10_000 });
  await expect(page.locator('#new-thing')).toContainText('Medals');
  await shot(page, 'mighty-moves-l5-medal');
  expect((await fightState(page)).stats.prizes.medal).toBe(1);
});

test('level 6: in the autumn leaves, the computer swings high and a squat ducks under it', async ({ page }) => {
  await reachFight(page, at(6, { fightStrength: 'medium' }));
  const weather = await page.evaluate(() => ({ theme: window.__game.arena.theme, bits: window.__game.arena.weather.length }));
  expect(weather).toEqual({ theme: 'autumn', bits: 40 });
  await takeOverGuardAndLean(page);
  await keepMoving(page);
  await turnOf(page, 'duck');
  // Held straight away: its label can wait behind the autumn leaves' for up to 2.4 seconds, and the turn
  // itself is only 2.7 seconds at medium.
  await holdTurnOf(page, 'duck');
  await expect(page.locator('#coach-text')).toHaveText('Squat down!', { timeout: 10_000 });
  await expect(newLabel(page)).toContainText('Duck down');
  expect(await coachPhase(page)).toEqual({ phase: 'defending', kind: 'duck' });
  await page.waitForTimeout(400);
  await shot(page, 'mighty-moves-l6-duck-asked');
  await page.evaluate(() => window.__game.game.onMoves([{ move: 'stomp' }]));
  await expect(page.locator('.callout.is-seen').first()).toContainText('You ducked!', { timeout: 10_000 });
  await expect.poll(() => page.evaluate(() => window.__game.arena.player.duckMix), { timeout: 5000 }).toBeGreaterThan(0.6);
  await shot(page, 'mighty-moves-l6-ducked');
  await expect.poll(async () => (await coachPhase(page)).phase, { timeout: 10_000 }).toBe('asking');
  const { player, stats } = await fightState(page);
  expect(player.hp).toBe(100);
  expect(stats.prizes.gem).toBe(1);
  await stopMoving(page);
});

test('level 7: a super glow makes the next two big moves stronger, shown on the fighter and the badge', async ({ page }) => {
  await reachFight(page, at(7));
  await powerUpNext(page, 'glow');
  await oneBigMove(page);
  await expect(page.locator('.powerup[data-kind="glow"]')).toBeVisible();
  await expect(page.locator('.powerup[data-kind="glow"]')).toHaveText('⚡2');
  await expect(newLabel(page)).toContainText('Super glow');
  await expect.poll(() => page.evaluate(() => window.__game.arena.glowRing.visible)).toBe(true);
  await page.waitForTimeout(600);
  await shot(page, 'mighty-moves-l7-glow');
  await oneBigMove(page);
  await expect(page.locator('.powerup[data-kind="glow"]')).toHaveText('⚡');
  await oneBigMove(page);
  await expect(page.locator('.powerup[data-kind="glow"]')).toBeHidden();
  const reasons = await page.evaluate(() => window.__game.fight.player.glow);
  expect(reasons).toBe(0);
});

test('level 8: the computer throws a soft ball, and a clap catches it and throws it back', async ({ page }) => {
  await reachFight(page, at(8, { fightStrength: 'medium' }));
  await takeOverGuardAndLean(page);
  await keepMoving(page);
  await turnOf(page, 'catch');
  await holdTurnOf(page, 'catch');
  await expect(page.locator('#coach-text')).toHaveText('Clap your hands!', { timeout: 10_000 });
  await expect(newLabel(page)).toContainText('Catch the ball');
  expect(await page.evaluate(() => ({ visible: window.__game.arena.ball.visible, state: window.__game.arena.ball.userData.state }))).toEqual({ visible: true, state: 'held' });
  await page.waitForTimeout(500);
  await shot(page, 'mighty-moves-l8-ball-ready');
  const npcBefore = (await fightState(page)).npc.hp;
  await page.evaluate(() => window.__game.game.onMoves([{ move: 'clap' }]));
  await expect(page.locator('.callout.is-seen').first()).toContainText('You caught it!', { timeout: 10_000 });
  await expect.poll(() => page.evaluate(() => window.__game.arena.ball.userData.state), { timeout: 5000, intervals: [50] }).toBe('caught');
  await shot(page, 'mighty-moves-l8-ball-caught');
  await expect(page.locator('.callout.is-big').filter({ hasText: 'Ball Return' })).toHaveCount(1, { timeout: 10_000 });
  await expect.poll(async () => (await fightState(page)).npc.hp, { timeout: 5000 }).toBeLessThan(npcBefore);
  const { player, stats } = await fightState(page);
  expect(player.hp).toBe(100);
  expect(stats.prizes.gem).toBe(1);
  await expect(prizeShown(page, 'gem')).toHaveText('1');
  await stopMoving(page);
});

test('level 9: in the snow, a helper friend comes to join in with one big move', async ({ page }) => {
  await reachFight(page, at(9));
  expect(await page.evaluate(() => window.__game.arena.theme)).toBe('snow');
  await powerUpNext(page, 'helper');
  await oneBigMove(page);
  await expect(newLabel(page)).toContainText('Helper friend');
  await expect(page.locator('.powerup[data-kind="helper"]')).toBeVisible();
  // Giraffe comes to help, unless Giraffe is the child's fighter or the opponent.
  const helper = await page.evaluate(() => ({ id: window.__game.arena.helper?.spec.id, player: window.__game.game.chosen.id, npc: window.__game.game.opponent.id }));
  expect(helper.id).toBeTruthy();
  expect([helper.player, helper.npc]).not.toContain(helper.id);
  if (helper.player !== 'giraffe' && helper.npc !== 'giraffe') expect(helper.id).toBe('giraffe');
  await page.waitForTimeout(700);
  await shot(page, 'mighty-moves-l9-helper-snow');
  await oneBigMove(page);
  await expect(page.locator('.callout').filter({ hasText: 'Team move!' })).toHaveCount(1, { timeout: 10_000 });
  await page.waitForTimeout(350);
  await shot(page, 'mighty-moves-l9-team-move');
  await expect(page.locator('.powerup[data-kind="helper"]')).toBeHidden();
  await expect.poll(() => page.evaluate(() => Boolean(window.__game.arena.helper)), { timeout: 8000 }).toBe(false);
});

test('level 10: the champion wears a crown, and beating it wins the trophy, counted on the finish card', async ({ page }) => {
  test.setTimeout(300_000);
  await reachFight(page, at(10, { rounds: 1 }));
  await expect(page.locator('#npc-name')).toContainText('👑');
  expect(await page.evaluate(() => ({ crown: window.__game.arena.crown.visible, scale: window.__game.arena.npc.body.root.scale.x }))).toEqual({ crown: true, scale: 1.14 });
  await expect(newLabel(page)).toContainText('Champion');
  await page.waitForTimeout(400);
  await shot(page, 'mighty-moves-l10-champion');
  await doWhatIsAsked(page);
  await waitForScreen(page, 'finish');
  await stopDoingIt(page);
  await expect(page.locator('#finish-title')).toHaveText('You win!');
  const { stats } = await fightState(page);
  expect(stats.prizes.trophy).toBe(1);
  expect(stats.prizes.coin).toBeGreaterThan(3);
  await expect(page.locator('#finish-prizes')).toContainText('🏆 1 trophy');
  await expect(page.locator('#finish-prizes')).toContainText(`${stats.prizes.coin} coins`);
  await expect(page.locator('#level-done-text')).toHaveText('All 10 levels done!');
  await page.waitForTimeout(900);
  await shot(page, 'mighty-moves-l10-finish-prizes');
});

test('the finish card says what\'s coming up at the next level', async ({ page }) => {
  test.setTimeout(240_000);
  await reachFight(page, at(5, { rounds: 1 }));
  await page.evaluate(() => {
    window.__game.fight.npc.hp = 1;
  });
  await doWhatIsAsked(page);
  await waitForScreen(page, 'finish');
  await stopDoingIt(page);
  await expect(page.locator('#level-next-new')).toHaveText('Coming up:⬇️Duck down🔀Mixed order🍂Autumn');
  await expect(page.locator('#finish-prizes')).toContainText('🏅 1 medal');
  await page.waitForTimeout(800);
  await shot(page, 'mighty-moves-l5-finish-coming-up');
});

/** Everything a level can bring, on the screen at once: power-ups, the helper, the ball held up. */
const everythingOnScreen = (page) => page.evaluate(() => {
  const { fight, game, arena } = window.__game;
  const { powerUps } = fight.levelRules;
  for (const kind of powerUps) fight.givePowerUp(kind);
  game.showPowerUpBadges();
  if (fight.levelRules.defences.includes('catch')) arena.ballReady();
  return { powerUps, weather: arena.weather.length, crown: arena.crown.visible, helper: Boolean(arena.helper), ball: arena.ball.visible };
});

for (const level of [6, 10]) {
  test(`level ${level}: nothing flashes with every new thing on the screen, through big moves, prizes and the computer's hits`, async ({ page }) => {
    test.setTimeout(150_000);
    await reachFight(page, at(level, { fightStrength: 'tough' }));
    await page.evaluate(() => {
      const { reader, coach } = window.__game;
      reader.readGuardAndLean = () => {
        reader.guard = false;
        reader.dodge = 0;
      };
      coach.random = () => 0;
    });
    const shown = await everythingOnScreen(page);
    expect(shown.weather).toBeGreaterThan(0);
    if (level === 10) expect(shown).toMatchObject({ crown: true, helper: true, ball: true, powerUps: ['shield', 'glow', 'helper'] });
    else expect(shown.powerUps).toEqual(['shield']);
    await page.waitForTimeout(800);
    await shot(page, `mighty-moves-l${level}-everything`);
    await keepMoving(page);
    await doWhatIsAsked(page);
    await expect.poll(() => page.evaluate(() => window.__game.fight.stats.damage), { timeout: 15_000 }).toBeGreaterThan(0);
    await page.evaluate(() => {
      window.__game.coach.computerIn = 0;
    });
    const reading = await brightness(page, 420);
    await stopDoingIt(page);
    await stopMoving(page);
    const { stats } = await fightState(page);
    expect(stats.prizes.coin).toBeGreaterThan(0);
    console.log(`level ${level} with everything: biggest brightness step`, biggestStep(reading));
    expect(biggestStep(reading)).toBeLessThan(25);
  });
}

test('level 10 with reduced motion: less weather, no prize flying about, and it all still works', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await reachFight(page, at(10));
  expect(await page.evaluate(() => window.__game.arena.weather.length)).toBe(18);
  await everythingOnScreen(page);
  await oneBigMove(page);
  await expect(prizeShown(page, 'coin')).not.toHaveText('0');
  await expect(page.locator('.prize-fly')).toHaveCount(0);
  expect(await page.evaluate(() => window.__game.arena.shake)).toBe(0);
});

test('in Georgian, the label for something new is in Georgian', async ({ page }) => {
  await reachFight(page, at(2, { language: 'ka' }));
  await oneBigMove(page);
  await expect(newLabel(page)).toHaveText('მონეტები');
  await footage(page, 'strikes', { from: 0.2, playing: false });
});

/* ---------- what review found ---------- */

test('on Medium or Tough, leaning isn\'t called new at level 3, as it\'s been asked for from level 1', async ({ page }) => {
  await openMoves(page, at(3, { fightStrength: 'medium' }));
  await expect(page.locator('#level-new')).toHaveText('New:💎Gems🌇Sunset');
  await page.locator('#open-panel').click();
  await page.locator('input[name="fightStrength"][value="gentle"]').check();
  await page.locator('#close-panel').click();
  await expect(page.locator('#level-new')).toHaveText('New:↔️Lean away💎Gems🌇Sunset');
});

for (const language of ['en', 'ka']) {
  test(`a ball thrown back as the fighter's own finishing move shows that move's name, as it's said, in ${language}`, async ({ page }) => {
    await reachFight(page, at(8, { language }));
    await takeOverGuardAndLean(page);
    await keepMoving(page);
    await page.evaluate(() => {
      window.__game.fight.player.power = 100;
    });
    await turnOf(page, 'catch');
    await expect.poll(async () => (await coachPhase(page)).kind, { timeout: 10_000 }).toBe('catch');
    await page.evaluate(() => window.__game.game.onMoves([{ move: 'clap' }]));
    const name = await page.evaluate((ka) => (ka ? window.__game.game.chosen.signatureKa : window.__game.game.chosen.signature), language === 'ka');
    await expect(page.locator('.callout.is-big').filter({ hasText: name })).toHaveCount(1, { timeout: 10_000 });
    await expect(page.locator('.callout.is-big').filter({ hasText: language === 'ka' ? 'ბურთის დაბრუნება' : 'Ball Return' })).toHaveCount(0);
    expect((await fightState(page)).stats.signatures).toBe(1);
    await stopMoving(page);
  });
}

test('a hit the shield bubble catches has the bubble\'s soft sound, once, and no block thud as well', async ({ page }) => {
  await reachFight(page, at(4, { sound: true, voice: false }));
  await page.evaluate(async () => {
    const { sound, fight, game } = window.__game;
    await sound.ready;
    window.__played = [];
    const real = sound.play.bind(sound);
    sound.play = (name, options) => {
      window.__played.push(name);
      return real(name, options);
    };
    fight.givePowerUp('shield');
    game.showPowerUpBadges();
    fight.setGuard('player', false);
    fight.setDodge('player', 0);
    fight.perform('npc', 'kick');
  });
  await expect.poll(() => page.evaluate(() => window.__game.fight.player.shield), { timeout: 5000 }).toBe(false);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__played.filter((name) => name === 'block').length)).toBe(1);
  expect((await fightState(page)).player.hp).toBe(100);
});

test('a bubble and a glow left at the end of a fight fade away, and aren\'t on the finish card or the next fighter', async ({ page }) => {
  await reachFight(page, at(7, { rounds: 1 }));
  await page.evaluate(() => {
    const { fight, game } = window.__game;
    fight.givePowerUp('shield');
    fight.givePowerUp('glow');
    game.showPowerUpBadges();
  });
  await expect.poll(() => page.evaluate(() => [window.__game.arena.bubble.visible, window.__game.arena.glowRing.visible])).toEqual([true, true]);
  await page.evaluate(() => window.__game.fight.endRound('player'));
  await expect.poll(() => page.evaluate(() => [window.__game.arena.bubble.visible, window.__game.arena.glowRing.visible]), { timeout: 3000 }).toEqual([false, false]);
  await waitForScreen(page, 'finish');
  expect(await page.evaluate(() => [window.__game.arena.bubble.visible, window.__game.arena.glowRing.visible])).toEqual([false, false]);
  await page.locator('#other-fighter').click();
  await waitForScreen(page, 'choose');
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => [window.__game.arena.bubble.visible, window.__game.arena.glowRing.visible])).toEqual([false, false]);
});

test('level 8: once the ball is thrown, the opponent\'s hands come down from holding it up', async ({ page }) => {
  await reachFight(page, at(8, { fightStrength: 'medium' }));
  await takeOverGuardAndLean(page);
  await keepMoving(page);
  await turnOf(page, 'catch');
  await expect.poll(async () => (await coachPhase(page)).kind, { timeout: 10_000 }).toBe('catch');
  expect(await page.evaluate(() => window.__game.arena.npc.warningPose)).toBe('ballUp');
  // Not caught: it's thrown.
  await expect.poll(() => page.evaluate(() => window.__game.arena.ball.userData.state), { timeout: 10_000, intervals: [30] }).not.toBe('held');
  expect(await page.evaluate(() => window.__game.arena.npc.warningPose)).toBe('lookOut');
  await stopMoving(page);
});

test('the friend who comes to help is kept for the next time, rather than made again', async ({ page }) => {
  await reachFight(page, at(9));
  const same = await page.evaluate(async () => {
    const { ROSTER } = await import('/core/body/roster.js');
    const { arena } = window.__game;
    const [one, other] = ROSTER;
    arena.showHelper(one);
    const first = arena.helper;
    arena.hideHelper();
    arena.showHelper(one);
    const again = arena.helper;
    const whole = again.body.root.children.length > 0;
    arena.showHelper(other);
    const changed = arena.helper !== first;
    arena.hideHelper();
    return { kept: first === again, whole, changed };
  });
  expect(same).toEqual({ kept: true, whole: true, changed: true });
});
