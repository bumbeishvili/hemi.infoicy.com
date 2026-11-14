// Cannon Bay's levels, with real photos going through the real tracker. What a level changes is in
// levelPlan in battle.js, and its numbers are checked in test/unit/cannon-bay.test.js.
import { expect, screenName, shot, show, test, waitForScreen } from '../helpers.js';
import { battleState, sailTowardsPirates, startPlaying, stopSailing } from './helpers.js';

const atLevel = (level, settings = {}) => ({ levels: { 'cannon-bay': level }, ...settings });

test('level 10: four pirates at once, a submarine, a smoke ship and the pirate king, bigger broadsides and prizes, and it can still be finished', async ({ page }) => {
  test.setTimeout(480_000);
  await startPlaying(page, atLevel(10, { bayShips: 4, bayPace: 'fast' }));
  await expect(page.locator('#level-badge')).toHaveText('Level 10 of 10');
  const start = await page.evaluate(() => {
    const { battle } = window.__game;
    return { level: battle.levelNumber, afloat: battle.afloat.map(({ kind }) => kind) };
  });
  expect(start.level).toBe(10);
  expect(start.afloat).toEqual(['sub', 'ship', 'smoky', 'king']);
  await page.evaluate(() => {
    window.__most = 0;
    window.__weaving = false;
    window.__watch = setInterval(() => {
      const { battle } = window.__game;
      for (const pirate of battle.pirates) window.__most = Math.max(window.__most, pirate.burstLeft);
      if (battle.afloat.some((pirate) => pirate.mode === 'away' && Math.abs(battle.weaving(pirate)) > 0.5)) window.__weaving = true;
    }, 30);
  });
  await page.waitForTimeout(1500);
  await shot(page, 'cannon-bay-level10-start');
  // Seen from the side: the king's ship bigger, with its crown.
  const king = await page.evaluate(() => {
    const { battle, bay } = window.__game;
    const ship = bay.shipFor(battle.afloat.find(({ kind }) => kind === 'king'));
    return { size: ship.root.scale.x, crown: Boolean(ship.crown?.visible) };
  });
  expect(king.size).toBeGreaterThan(1);
  expect(king.crown).toBe(true);
  await sailTowardsPirates(page);
  let shownFour = false;
  await expect.poll(async () => {
    const marks = await page.locator('.mark[data-where="on"]').count();
    if (marks >= 3 && !shownFour) {
      shownFour = true;
      await shot(page, 'cannon-bay-level10-busy');
    }
    return screenName(page);
  }, { timeout: 420_000, intervals: [250] }).toBe('finish');
  await stopSailing(page);
  const seen = await page.evaluate(() => ({ most: window.__most, weaving: window.__weaving }));
  console.log('at level 10', JSON.stringify(seen));
  expect(seen.most).toBeGreaterThanOrEqual(3);
  await expect(page.locator('#screen-finish h2')).toHaveText('You drove them all off! The treasure is safe!');
  await expect(page.locator('#level-done-text')).toHaveText('All 10 levels done!');
  // What was picked up is counted on the finish card, as it was along the top.
  const picked = await page.evaluate(() => window.__game.battle.stats);
  console.log('picked up at level 10', JSON.stringify({ gems: picked.gems, sailors: picked.sailors, chests: picked.chests, powers: picked.powers }));
  expect(picked.gems).toBeGreaterThan(0);
  await expect(page.locator('#sum-right-prizes')).toHaveText(`💎 ${picked.gems} · 🛟 ${picked.sailors} · 🧰 ${picked.chests} · ✨ ${picked.powers}`);
  await expect(page.locator('#sum-right-prizes')).toBeVisible();
  await expect(page.locator('tr:has(#sum-right-prizes) th')).toHaveText('Prizes: gems, sailors, chests, power-ups');
  await page.waitForTimeout(700);
  await shot(page, 'cannon-bay-level10-finish');
});

test('level 10: there\'s a mark for each of the four pirates, with their own health', async ({ page }) => {
  await startPlaying(page, atLevel(10, { bayShips: 6 }));
  // Enough for four, and the little rafts a raft comes apart into.
  await expect(page.locator('.mark')).toHaveCount(8);
  await expect.poll(() => page.locator('.mark:not([data-where="none"])').count(), { timeout: 10_000 }).toBe(4);
  await page.evaluate(() => {
    const { battle } = window.__game;
    const ship = battle.afloat.find(({ kind }) => kind === 'ship');
    battle.hit(ship, ship);
  });
  // The marks are drawn again on the next frame.
  const hurt = () => page.locator('.mark:not([data-where="none"]) .mark-fill').evaluateAll((nodes) => nodes.filter((node) => node.style.width !== '100%').length);
  await expect.poll(hurt, { timeout: 5000 }).toBe(1);
});

test('the cannons set to always still fire at level 10, with a closed hand', async ({ page }) => {
  await startPlaying(page, atLevel(10, { bayShips: 4, bayCannons: 'always' }), [null, 'fist', { scale: 0.7 }]);
  await page.evaluate(() => {
    window.__holding = setInterval(() => {
      const { battle } = window.__game;
      const [first] = battle.afloat;
      if (!first) return;
      const direction = battle.heading + Math.PI * 0.4;
      first.x = battle.x + Math.sin(direction) * 95;
      first.z = battle.z - Math.cos(direction) * 95;
      first.heading = battle.heading;
      first.mode = 'away';
      first.spot = { x: first.x, z: first.z };
      first.modeLeft = 5;
    }, 16);
  });
  await expect.poll(async () => (await battleState(page)).stats.shots, { timeout: 20_000 }).toBeGreaterThan(2);
  await page.evaluate(() => clearInterval(window.__holding));
});

test('being sunk on Medium tries the same level again', async ({ page }) => {
  await startPlaying(page, atLevel(5, { bayShips: 4, bayPirates: 'medium' }));
  await page.evaluate(() => {
    const { battle } = window.__game;
    for (let i = 0; i < 5; i += 1) battle.hurt({ to: { x: battle.x, z: battle.z } });
  });
  await waitForScreen(page, 'finish');
  await expect(page.locator('#level-done-text')).toHaveText('Let’s try level 5 again!');
  await expect(page.locator('#screen-finish h2')).toHaveText('The pirates got the treasure this time!');
  await expect(page.locator('#play-again')).toHaveText('Try again');
  await show(page, null, 'open', { scale: 0.7 });
  await page.locator('#play-again').click();
  await waitForScreen(page, 'playing');
  expect(await page.evaluate(() => window.__game.battle.levelNumber)).toBe(5);
});
