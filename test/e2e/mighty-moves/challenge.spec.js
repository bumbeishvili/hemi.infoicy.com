// Mighty Moves as it comes: the computer's strength is Medium, and its fighter can knock the child's out and
// win the fight. A lost fight is a short, kind card with Try again, on the same level. Gentle is the game as it was.
import { expect, shot, test, waitForScreen } from '../helpers.js';
import { openMoves, reachFight } from './helpers.js';

const AS_IT_COMES = { fightStrength: undefined, rounds: 1 };

/** The computer's fighter lands its moves on the child's, as if they never got out of the way. */
const beatTheChild = (page) => page.evaluate(() => {
  window.__beating = setInterval(() => {
    const { fight } = window.__game;
    if (fight?.state === 'fighting') fight.perform('npc', 'kick');
  }, 250);
});

/** The picture's overall brightness, frame by frame, as the last hit lands and the fight ends. */
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

test('as it comes, the computer\'s strength is Medium, and Gentle is the other choice', async ({ page }) => {
  await openMoves(page, { fightStrength: undefined });
  expect(await page.evaluate(() => window.__game.game.settings.fightStrength)).toBe('medium');
  await page.locator('#open-panel').click();
  await expect(page.locator('input[name="fightStrength"][value="medium"]')).toBeChecked();
  await expect(page.locator('input[name="fightStrength"][value="gentle"]')).toBeAttached();
});

test('as it comes, the computer can knock the child out: a kind card, Try again, and the same level', async ({ page }) => {
  test.setTimeout(180_000);
  await reachFight(page, { ...AS_IT_COMES, levels: { 'mighty-moves': 2 } });
  await beatTheChild(page);
  await waitForScreen(page, 'finish');
  await page.evaluate(() => clearInterval(window.__beating));
  expect(await page.evaluate(() => [window.__game.fight.winner, window.__game.fight.player.hp])).toEqual(['npc', 0]);
  await expect(page.locator('#finish-title')).toHaveText('So close! What a fight!');
  const rival = await page.evaluate(() => window.__game.game.rivalSpec.name);
  await expect(page.locator('#finish-line')).toContainText(`${rival} won this fight.`);
  await expect(page.locator('#fight-again')).toHaveText('Try again');
  await expect(page.locator('#level-done-text')).toHaveText('Let’s try level 2 again!');
  expect(await page.evaluate(() => window.__game.game.levels.current)).toBe(2);
  await page.waitForTimeout(800);
  await shot(page, 'mighty-lost-card');
});

test('on Gentle, the game as it was, the computer still can\'t knock a child out', async ({ page }) => {
  test.setTimeout(120_000);
  await reachFight(page, { fightStrength: 'gentle', rounds: 1 });
  await beatTheChild(page);
  await page.waitForTimeout(8000);
  await page.evaluate(() => clearInterval(window.__beating));
  const { hp, state } = await page.evaluate(() => ({ hp: window.__game.fight.player.hp, state: window.__game.fight.state }));
  expect(hp).toBeGreaterThan(0);
  expect(state).toBe('fighting');
});

test('nothing flashes as the computer\'s last hit lands and the child\'s fighter goes down', async ({ page }) => {
  test.setTimeout(120_000);
  await reachFight(page, AS_IT_COMES);
  // One hit from the end.
  await page.evaluate(() => {
    window.__game.fight.player.hp = 5;
  });
  const reading = brightness(page, 150);
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__game.fight.perform('npc', 'kick'));
  const steps = await reading;
  expect(await page.evaluate(() => window.__game.fight.winner)).toBe('npc');
  const biggest = Math.max(...steps.slice(1).map((value, index) => Math.abs(value - steps[index])));
  console.log('mighty moves, the child knocked out: biggest brightness step', biggest.toFixed(2));
  expect(biggest).toBeLessThan(25);
});
