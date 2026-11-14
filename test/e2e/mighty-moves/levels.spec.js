// Mighty Moves' levels: what level 10 brings, that a fight there can still be won and is still safe
// to look at, and that winning moves on a level while losing doesn't. Levels are a whole fight each;
// the rounds inside a fight are something else.
import { expect, screenName, shot, test, waitForScreen } from '../helpers.js';
import { askFor, coachState, doWhatIsAsked, fightState, footage, reachFight, stopDoingIt } from './helpers.js';

const at = (level, settings = {}) => ({ levels: { 'mighty-moves': level }, ...settings });

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

/** Always moving, as far as resting goes, so the computer takes its turns. */
const keepMoving = (page) => page.evaluate(() => {
  window.__moving = setInterval(() => window.__game.fight?.noteActivity(0), 100);
});

test('level 1 is the fight as it always was', async ({ page }) => {
  await reachFight(page);
  const now = await page.evaluate(() => {
    const { fight, coach } = window.__game;
    return { level: fight.levelNumber, every: coach.level.every, warning: coach.level.warning, defences: coach.level.defences, mixed: coach.rules.mixed };
  });
  expect(now).toEqual({ level: 1, every: 10, warning: 4, defences: ['block'], mixed: false });
  await expect(page.locator('#coach-text')).toHaveText('Clap your hands!');
});

test('level 10: some moves are asked for twice, with a dot for each, and only the second makes the big move', async ({ page }) => {
  await reachFight(page, at(10));
  expect(await page.evaluate(() => window.__game.fight.levelNumber)).toBe(10);
  await page.evaluate(() => {
    window.__game.coach.random = () => 0;
  });
  await askFor(page, 'squat');
  expect((await coachState(page)).name).toBe('squat');
  await expect(page.locator('#coach-text')).toHaveText('Squat down! ○○');
  await page.waitForTimeout(600);
  await shot(page, 'mighty-l10-twice-asked');

  await page.evaluate(() => window.__game.game.onMoves([{ move: 'stomp' }]));
  await expect(page.locator('#coach-text')).toHaveText('Squat down! ●○');
  await expect(page.locator('.callout.is-seen').first()).toContainText('You squatted!');
  expect((await fightState(page)).stats.exercises.squat).toBe(0);
  await page.waitForTimeout(250);
  await shot(page, 'mighty-l10-twice-one-done');

  await page.waitForTimeout(400);
  await page.evaluate(() => window.__game.game.onMoves([{ move: 'stomp' }]));
  await expect.poll(async () => (await fightState(page)).stats.exercises.squat).toBe(1);
  await expect(page.locator('.callout.is-big').first()).toContainText('Earthquake Stomp');
  // Twice the work makes a stronger move, so a round isn't longer for it.
  await expect.poll(async () => (await fightState(page)).npc.hp, { timeout: 5000 }).toBeLessThan(100 - 14 * 1.6);
});

test('level 10: the computer can hit twice in a row, once to block and once to lean from, each with its warning', async ({ page }) => {
  test.setTimeout(120_000);
  await reachFight(page, at(10, { fightStrength: 'medium' }));
  await footage(page, 'strikes', { from: 1 });
  await page.evaluate(() => {
    const { reader, coach } = window.__game;
    // The person in this clip keeps their hands up, which would be a block, so the test decides.
    reader.readGuardAndLean = () => {
      reader.guard = Boolean(window.__guard);
      reader.dodge = window.__lean ? 0.9 : 0;
    };
    coach.random = () => 0;
    coach.computerIn = 0;
  });
  await keepMoving(page);
  await expect(page.locator('#coach-text')).toHaveText('Hands up! Block!', { timeout: 10_000 });
  await shot(page, 'mighty-l10-double-block');
  await page.evaluate(() => {
    window.__guard = true;
  });
  await expect(page.locator('.callout.is-seen').first()).toContainText('You blocked!', { timeout: 10_000 });
  await page.evaluate(() => {
    window.__guard = false;
  });
  await expect(page.locator('#coach-text')).toHaveText('Lean to the side!', { timeout: 10_000 });
  const second = await page.evaluate(() => ({ ...window.__game.coach.defence, warning: window.__game.coach.level.warning }));
  expect(second.second).toBe(true);
  expect(second.left).toBeGreaterThan(second.warning - 0.5);
  expect(await page.evaluate(() => window.__game.arena.warningMark.visible)).toBe(true);
  await page.waitForTimeout(300);
  await shot(page, 'mighty-l10-double-lean');
  await page.evaluate(() => {
    window.__lean = true;
  });
  await expect(page.locator('.callout.is-seen').first()).toContainText('You leaned!', { timeout: 10_000 });
  await expect.poll(async () => (await coachState(page)).phase, { timeout: 10_000 }).toBe('asking');
  expect((await fightState(page)).player.hp).toBe(100);
  await page.evaluate(() => clearInterval(window.__moving));
});

test('level 10: the moves come in a mixed-up order, and leaning, ducking and catching come in even on Gentle', async ({ page }) => {
  await reachFight(page, at(10));
  const order = await page.evaluate(() => {
    const { coach } = window.__game;
    coach.queue = [];
    return { asked: Array.from({ length: 22 }, () => coach.nextExercise()), defences: coach.level.defences, moves: coach.level.moves };
  });
  const { ORDER } = await import('../../../games/mighty-moves/moves.js');
  expect([...order.asked.slice(0, 11)].sort()).toEqual([...ORDER].sort());
  expect(order.asked.slice(0, 11).join() === ORDER.join() && order.asked.slice(11).join() === ORDER.join()).toBe(false);
  expect(order.defences).toEqual(['block', 'lean', 'duck', 'catch']);
  expect(order.moves).toEqual(expect.arrayContaining(['palm', 'kick', 'uppercut', 'knee', 'chop', 'stomp', 'flying']));
});

test('level 10 can be won by doing as the coach says, and that\'s every level done', async ({ page }) => {
  test.setTimeout(300_000);
  await reachFight(page, at(10, { rounds: 1 }));
  await page.waitForTimeout(1500);
  await shot(page, 'mighty-l10-fight');
  await doWhatIsAsked(page);
  await waitForScreen(page, 'finish');
  await stopDoingIt(page);
  await expect(page.locator('#finish-title')).toHaveText('You win!');
  await expect(page.locator('#level-done-text')).toHaveText('All 10 levels done!');
  await page.waitForTimeout(900);
  await shot(page, 'mighty-l10-finish');
});

test('winning a fight moves on a level, and the next fight is played at it', async ({ page }) => {
  test.setTimeout(240_000);
  await reachFight(page, at(4, { rounds: 1 }));
  expect(await page.evaluate(() => window.__game.fight.levelNumber)).toBe(4);
  await page.evaluate(() => {
    window.__game.fight.npc.hp = 1;
  });
  await doWhatIsAsked(page);
  await waitForScreen(page, 'finish');
  await stopDoingIt(page);
  await expect(page.locator('#level-done-text')).toHaveText('Level 4 done! Next: level 5');
  await expect(page.locator('#fight-again')).toHaveText('Next level');
  await footage(page, 'strikes', { from: 0.2, playing: false });
  await page.locator('#fight-again').click();
  await waitForScreen(page, 'fight');
  expect(await page.evaluate(() => window.__game.fight.levelNumber)).toBe(5);
});

test('losing a fight stays on the same level', async ({ page }) => {
  test.setTimeout(240_000);
  await reachFight(page, at(6, { rounds: 1, fightStrength: 'medium' }));
  await page.evaluate(() => {
    const { fight } = window.__game;
    window.__beating = setInterval(() => {
      if (fight.state === 'fighting') fight.perform('npc', 'flying');
    }, 300);
  });
  await waitForScreen(page, 'finish');
  await page.evaluate(() => clearInterval(window.__beating));
  await expect(page.locator('#finish-title')).toHaveText('So close! What a fight!');
  await expect(page.locator('#level-done-text')).toHaveText('Let’s try level 6 again!');
  // The other fighter won this one, and the big button is Try again.
  const rival = await page.evaluate(() => window.__game.game.rivalSpec.name);
  await expect(page.locator('#finish-line')).toContainText(`${rival} won this fight.`);
  await expect(page.locator('#fight-again')).toHaveText('Try again');
  await page.waitForTimeout(800);
  await shot(page, 'mighty-l6-lost');
  expect(await page.evaluate(() => window.__game.game.levels.current)).toBe(6);
});

test('level 10: a child standing still is still left alone, even at the toughest', async ({ page }) => {
  test.setTimeout(120_000);
  await reachFight(page, at(10, { fightStrength: 'tough' }));
  await footage(page, 'strikes', { from: 0.2, playing: false });
  await expect.poll(async () => (await fightState(page)).resting, { timeout: 30_000 }).toBe(true);
  await page.waitForTimeout(9000);
  const { player } = await fightState(page);
  expect(player.hp).toBe(100);
  expect(await screenName(page)).toBe('fight');
});

test('level 10: nothing flashes through big moves and the computer\'s double hits', async ({ page }) => {
  test.setTimeout(120_000);
  await reachFight(page, at(10, { fightStrength: 'tough' }));
  await page.evaluate(() => {
    const { reader, coach } = window.__game;
    reader.readGuardAndLean = () => {
      reader.guard = false;
      reader.dodge = 0;
    };
    coach.random = () => 0;
  });
  await keepMoving(page);
  await doWhatIsAsked(page);
  await expect.poll(() => page.evaluate(() => window.__game.fight.stats.damage), { timeout: 15_000 }).toBeGreaterThan(0);
  // Straight into the computer's turn: two big hits, neither got out of the way of.
  await page.evaluate(() => {
    window.__game.coach.computerIn = 0;
  });
  const reading = await brightness(page, 420);
  await stopDoingIt(page);
  await page.evaluate(() => clearInterval(window.__moving));
  const { stats, player } = await fightState(page);
  expect(stats.damage).toBeGreaterThan(0);
  expect(player.hp).toBeLessThan(100);
  console.log('level 10: biggest brightness step', biggestStep(reading));
  expect(biggestStep(reading)).toBeLessThan(25);
});

test('level 10 with reduced motion: no shaking, and the fight still works', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await reachFight(page, at(10));
  await doWhatIsAsked(page);
  await expect.poll(() => page.evaluate(() => window.__game.fight.stats.damage), { timeout: 15_000 }).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__game.arena.shake)).toBe(0);
  await stopDoingIt(page);
});

test('level 10: a slow computer still gives up sharpness and then shadows, and keeps playing', async ({ page }) => {
  await reachFight(page, at(10));
  const levels = await page.evaluate(() => {
    const { arena } = window.__game;
    arena.quality = 2;
    arena.renderer.shadowMap.enabled = true;
    arena.frames = 0;
    arena.slowFrames = 0;
    const slowFor = () => {
      for (let i = 0; i < 90; i += 1) arena.watchSpeed(0.05);
    };
    slowFor();
    const first = [arena.quality, arena.renderer.getPixelRatio(), arena.renderer.shadowMap.enabled];
    slowFor();
    return [first, [arena.quality, arena.renderer.getPixelRatio(), arena.renderer.shadowMap.enabled]];
  });
  expect(levels).toEqual([[1, 1, true], [0, 1, false]]);
  expect(await page.evaluate(() => window.__game.screen)).toBe('fight');
});
