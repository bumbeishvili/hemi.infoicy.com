// Swamp Splash, played in the real page, with footage of a real person going through the real tracker: jumping,
// standing still, lifting a foot, or nobody there. Where a test is about what comes after a jump, such as winning
// or losing, it says what a tracked body would do by calling the rules in the page.
import {
  GRID, asked, atLevel, calloutsSeen, characterSquares, distance, expect, expectSoon, footage, heard, jumping, lands, liftingAFoot, listen, looksMuddy,
  nearMud, nobody, noteAsked, noteCallouts, noteWhatIsSaid, onBothFeet, openSwamp, pixels, playAgain, reachPlay, reopenWith,
  said, settled, shot, squareColours, standInView, state, test, waitForScreen,
} from './helpers.js';

const LOST_TITLE = 'The rain got there first! Try again.';
const ALL = [...Array(GRID.wide * GRID.high).keys()];
const coach = (page) => page.locator('#coach');
const coachText = (page) => page.locator('#coach-text');
const promptText = (page) => page.locator('#prompt-text');
const screenSize = (page) => page.evaluate(() => ({ w: window.__game.view.width, h: window.__game.view.height }));
const mean = (list) => list.reduce((sum, value) => sum + value, 0) / list.length;

/** Where the rain cloud is drawn now, and the mark at the end of its way: its way is the game's own, read from it. */
const cloudPlaces = async (page) => {
  const { w, h } = await screenSize(page);
  const { cloud } = await state(page);
  const way = await page.evaluate(() => window.__game.view.way);
  // The sky is read above the mud meter's chip, well left of where the cloud starts.
  return { cloud: { x: w * (way.from + (way.to - way.from) * cloud), y: h * way.y }, end: { x: w * way.to, y: h * way.y }, sky: { x: w * (way.from - 0.12), y: h * way.y } };
};

/* ---------- a jump ---------- */

test('a real jump in front of the camera is a splash: it is counted, mud lands on the window, the meter at the top says how much, and the splash is named', async ({ page }) => {
  await reachPlay(page, { swampRain: 'gentle' });
  await listen(page);
  await noteCallouts(page);
  await expect(page.locator('#mud-now')).toHaveText('0%');
  // The mark on the meter is where the window is muddy enough: 40% at level 1.
  expect(await page.locator('#mud-target').evaluate((mark) => mark.style.left)).toBe('40%');
  await jumping(page);
  await expectSoon(async () => (await state(page)).stats.jumps, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  // Standing still again, so that what's on the screen can be read.
  await standInView(page);
  await expectSoon(async () => (await state(page)).air).toBe(false);
  await settled(page);
  const now = await state(page);
  expect(now.muddy).toBeGreaterThan(0);
  const percent = Math.round(now.coverage * 100);
  expect(percent).toBeGreaterThan(0);
  await expect(page.locator('#mud-now')).toHaveText(`${percent}%`);
  await expect(page.locator('#mud-meter')).toHaveAttribute('aria-valuenow', String(percent));
  expect(await page.locator('#mud-fill').evaluate((fill) => fill.style.width)).toBe(`${percent}%`);
  // The mud is on the window: the squares the rules call muddy show it.
  const muddy = ALL.filter((cell) => now.mud[cell]);
  const colours = await squareColours(page, muddy);
  expect(colours.filter((colour) => looksMuddy(colour)).length).toBe(muddy.length);
  // In words, the moment each one lands: a big splash for a big jump.
  const landed = await heard(page, 'land');
  expect((await calloutsSeen(page)).slice(0, landed.length)).toEqual(landed.map(({ big }) => (big ? '✓ Big splash!' : '✓ Splash!')));
  await shot(page, 'swamp-real-jump');
});

test('a person standing still in front of the camera makes no splash, however long', async ({ page }) => {
  await reachPlay(page, { swampRain: 'gentle' });
  await noteCallouts(page);
  for (let n = 0; n < 12; n += 1) {
    await page.waitForTimeout(1000);
    const now = await state(page);
    expect([now.stats.jumps, now.muddy, now.air, now.screen]).toEqual([0, 0, false, 'playing']);
  }
  await expect(page.locator('#mud-now')).toHaveText('0%');
  expect(await calloutsSeen(page)).toEqual([]);
  // A jump is still what's asked for.
  await expect(coachText(page)).toHaveText('Jump!');
});

test('a bigger jump makes a bigger splash: the same real jumps count for more when a big jump is set low than when it is set high', async ({ page }) => {
  test.setTimeout(240_000);
  const firstThree = async () => {
    await listen(page);
    await jumping(page);
    await expectSoon(async () => (await heard(page, 'land')).length, { timeout: 40_000 }).toBeGreaterThanOrEqual(3);
    await standInView(page);
    return (await heard(page, 'land')).slice(0, 3).map(({ size }) => size);
  };
  await reachPlay(page, { swampHigh: 'low', swampRain: 'gentle' });
  const low = await firstThree();
  await reopenWith(page, { swampHigh: 'high' });
  await playAgain(page);
  expect((await state(page)).high).toBe(0.2);
  const high = await firstThree();
  console.log('the same three real jumps, set low:', JSON.stringify(low), 'and set high:', JSON.stringify(high));
  expect(mean(low)).toBeGreaterThan(mean(high) + 0.2);
});

test('in the rules, a bigger jump muddies more of the window than a small one', async ({ page }) => {
  await reachPlay(page, { swampRain: 'gentle' });
  await listen(page);
  await lands(page, 1.1);
  const small = (await state(page)).muddy;
  await lands(page, 2.2);
  const big = (await state(page)).muddy - small;
  const splats = await heard(page, 'splat');
  console.log('squares muddied by a small jump and a big one:', small, big, 'in their splats:', splats.map(({ cells }) => cells));
  expect(small).toBeGreaterThan(0);
  expect(big).toBeGreaterThan(small * 2);
  expect(splats[1].cells).toBeGreaterThan(splats[0].cells * 2);
});

test('the character on the screen goes up while the child is in the air, and stays down while they stand', async ({ page }) => {
  await reachPlay(page, { swampRain: 'gentle' });
  await page.evaluate(() => {
    window.__highest = 0;
    window.__watching = setInterval(() => {
      window.__highest = Math.max(window.__highest, window.__game.view.jump);
    }, 16);
  });
  await page.waitForTimeout(3000);
  expect(await page.evaluate(() => window.__highest)).toBeLessThan(0.02);
  await listen(page);
  await jumping(page);
  await expectSoon(async () => (await heard(page, 'land')).length, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  expect(await page.evaluate(() => window.__highest)).toBeGreaterThan(0.5);
  // Down again with the child.
  await standInView(page);
  await expectSoon(async () => (await state(page)).jump, { timeout: 15_000 }).toBeLessThan(0.02);
  await page.evaluate(() => clearInterval(window.__watching));
});

/* ---------- the window ---------- */

test('what is on the screen is what the rules say: every muddy square shows mud, and squares away from the mud show none', async ({ page }) => {
  await reachPlay(page, { swampRain: 'gentle' });
  const clean = await squareColours(page, ALL);
  // Three jumps of different sizes, as a tracked body's would land, and time for the mud to come.
  await lands(page, 2.2, 1.2, 1.8);
  await settled(page);
  const { mud, coverage } = await state(page);
  const now = await squareColours(page, ALL);
  // A square's mud is a blob a little bigger than itself, which can reach the middle of the square beside it. The
  // character is brown in places too, and moves a little as the child's knees are read: over it, a clean square is
  // one with no mud drawn.
  const near = nearMud(mud, 1);
  const over = new Set(await characterSquares(page));
  const shown = await page.evaluate(() => [...window.__game.view.shown]);
  const wrong = [];
  for (const cell of ALL) {
    if (mud[cell] && !looksMuddy(now[cell])) wrong.push(`square ${cell} is muddy, and shows ${now[cell]}`);
    if (near.has(cell)) continue;
    if (over.has(cell) ? shown[cell] > 0 : looksMuddy(now[cell]) && distance(now[cell], clean[cell]) > 12) wrong.push(`square ${cell} is clean, and shows mud: ${now[cell]}`);
  }
  expect(wrong).toEqual([]);
  expect(mud.filter(Boolean).length).toBeGreaterThan(60);
  await expect(page.locator('#mud-now')).toHaveText(`${Math.round(coverage * 100)}%`);
  await shot(page, 'swamp-window');
});

/* ---------- winning and losing ---------- */

test('a window muddy enough wins there and then: the card says how muddy, the level moves on, and it is cheered', async ({ page }) => {
  await reachPlay(page);
  // Small jumps, one at a time, until the window is muddy enough.
  const end = await page.evaluate(() => {
    const { swamp, game } = window.__game;
    let before = 0;
    while (swamp.state === 'play') {
      before = swamp.coverage;
      swamp.land(1.1);
    }
    return { before, after: swamp.coverage, target: swamp.rules.target, state: swamp.state, screen: game.screen };
  });
  expect(end.before).toBeLessThan(end.target);
  expect(end.after).toBeGreaterThanOrEqual(end.target);
  expect([end.state, end.screen]).toEqual(['won', 'finishing']);
  await waitForScreen(page, 'finish');
  await expect(page.locator('#finish-title')).toHaveText('What a muddy window!');
  await expect(page.locator('#finish-muddy')).toHaveText(`${Math.round(end.after * 100)}% muddy`);
  await expect(page.locator('#level-done-text')).toHaveText('Level 1 done! Next: level 2');
  await expect(page.locator('#jump-again')).toHaveText('Next level');
  expect(await page.evaluate(() => [window.__game.game.levels.current, window.__game.game.confetti.running])).toEqual([2, true]);
  expect(await page.evaluate(() => window.__game.sound.finished)).toEqual({ line: 'What a muddy window!', lost: false });
  // The camera is let go at the end.
  expect(await page.evaluate(() => window.__camera.activeTracks)).toBe(0);
  await shot(page, 'swamp-won');
  // Again: the next level, on a clean window.
  await standInView(page);
  await page.locator('#jump-again').click();
  await waitForScreen(page, 'playing');
  const again = await state(page);
  expect([again.level, again.muddy, again.stats.jumps]).toEqual([2, 0, 0]);
});

test('the rain cloud wins if it gets there first: the window is washed, the card says so, nothing cheers, and the level stays', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, { voice: true, sound: true });
  await noteWhatIsSaid(page);
  await page.evaluate(() => {
    const { sound } = window.__game;
    window.__cheers = 0;
    const cheer = sound.cheer.bind(sound);
    sound.cheer = () => {
      window.__cheers += 1;
      cheer();
    };
  });
  // The cloud is there, at the start of its way along the top, and the mark at the end of it.
  let places = await cloudPlaces(page);
  let [cloud, end, sky] = await pixels(page, [places.cloud, places.end, places.sky]);
  expect(distance(cloud, [184, 196, 210])).toBeLessThan(10);
  expect(distance(end, [18, 48, 77])).toBeLessThan(10);
  // The window as it is, clean, to tell mud from the swamp behind it.
  const clean = await squareColours(page, ALL);
  // Some mud, for the rain to wash.
  await lands(page, 2.2, 2.2);
  await settled(page);
  const before = await state(page);
  expect(before.coverage).toBeGreaterThan(0.1);
  // The cloud brought nearly there. The person in front of the camera stands still, and doesn't jump.
  await page.evaluate(() => {
    const { swamp } = window.__game;
    swamp.time = swamp.rules.seconds - 2;
  });
  await expectSoon(async () => (await state(page)).state, { timeout: 15_000 }).toBe('lost');
  expect((await state(page)).cloud).toBe(1);
  await waitForScreen(page, 'finish');
  await settled(page);
  const after = await state(page);
  expect(after.muddy).toBe(0);
  expect(after.stats.jumps).toBe(2);
  // Not a square of mud is left on the screen. Along the top the cloud is now somewhere else, and the character,
  // brown in places, stands a little differently once the game is over: the squares over it have no mud drawn.
  const over = new Set(await characterSquares(page));
  expect(await page.evaluate((cells) => cells.every((cell) => window.__game.view.shown[cell] === 0), [...over])).toBe(true);
  const now = await squareColours(page, ALL);
  const wrong = ALL.filter((cell) => !over.has(cell) && looksMuddy(now[cell]) && (cell < GRID.wide * 3 || distance(now[cell], clean[cell]) > 12));
  expect(wrong.map((cell) => `square ${cell}: ${now[cell]}`)).toEqual([]);
  // The cloud is at the end of its way.
  places = await cloudPlaces(page);
  [cloud] = await pixels(page, [places.end]);
  [sky] = await pixels(page, [places.sky]);
  expect(distance(cloud, sky)).toBeGreaterThan(20);
  // The card, with no cheering: what's said is the rain's line.
  await expect(page.locator('#finish-title')).toHaveText(LOST_TITLE);
  await expect(page.locator('#finish-muddy')).toHaveText('40% was the mark');
  await expect(page.locator('#jump-again')).toHaveText('Try again');
  await expect(page.locator('#level-done-text')).toHaveText('Let’s try level 1 again!');
  expect(await page.evaluate(() => [window.__game.game.levels.current, window.__game.game.confetti.running, window.__cheers])).toEqual([1, false, 0]);
  expect(await page.evaluate(() => window.__game.sound.finished)).toEqual({ line: 'The rain got there first! Try again!', lost: true });
  await expectSoon(async () => (await said(page)).map(({ text }) => text)).toContain('The rain got there first! Try again!');
  await shot(page, 'swamp-lost');
  // Again: the same level, on a clean window, with the cloud back at the start.
  await page.locator('#jump-again').click();
  await waitForScreen(page, 'playing');
  const again = await state(page);
  expect([again.level, again.muddy, again.stats.jumps]).toEqual([1, 0, 0]);
  expect(again.cloud).toBeLessThan(0.1);
});

test('the gentle swamp has no rain cloud: nothing is lost however long nobody jumps, and no cloud is drawn', async ({ page }) => {
  await reachPlay(page, { swampRain: 'gentle' });
  expect((await state(page)).seconds).toBe(Infinity);
  for (let n = 0; n < 10; n += 1) {
    await page.waitForTimeout(1000);
    const now = await state(page);
    expect([now.cloud, now.state, now.screen]).toEqual([0, 'play', 'playing']);
  }
  // As long as a whole game, many times over.
  await page.evaluate(() => {
    window.__game.swamp.time = 10_000;
  });
  await page.waitForTimeout(1500);
  const later = await state(page);
  expect([later.cloud, later.state, later.screen]).toEqual([0, 'play', 'playing']);
  // Only the sky where the cloud and the end of its way would be.
  const places = await cloudPlaces(page);
  const [start, end, sky] = await pixels(page, [places.cloud, places.end, places.sky]);
  expect(distance(start, sky)).toBeLessThan(8);
  expect(distance(end, sky)).toBeLessThan(8);
});

test('with nobody in the picture everything waits: the rain cloud does not move, for 15 seconds', async ({ page }) => {
  test.setTimeout(120_000);
  await reachPlay(page);
  await expectSoon(async () => (await state(page)).cloud).toBeGreaterThan(0);
  await nobody(page);
  await expect(promptText(page)).toHaveText('Come back where I can see you', { timeout: 15_000 });
  const stopped = await state(page);
  for (let n = 0; n < 15; n += 1) {
    await page.waitForTimeout(1000);
    const now = await state(page);
    expect([now.time, now.cloud, now.state]).toEqual([stopped.time, stopped.cloud, 'play']);
  }
  // Back in the picture, it comes on again.
  await standInView(page);
  await expectSoon(async () => (await state(page)).time, { timeout: 15_000 }).toBeGreaterThan(stopped.time);
});

/* ---------- lifting a knee in place of jumping ---------- */

test('lifting a knee in place of jumping: a foot lifted in front of the camera is a splash, and a jump is never asked for', async ({ page }) => {
  await reachPlay(page, { swampJump: 'lift', swampRain: 'gentle' }, onBothFeet);
  await listen(page);
  await noteCallouts(page);
  await noteAsked(page);
  await expect(coach(page)).toHaveClass(/is-visible/);
  await expect(coachText(page)).toHaveText('Lift your knee up high!');
  expect((await state(page)).film).toBe('kneeLift');
  await expect(promptText(page)).toHaveText('Lift your knee up high!');
  await liftingAFoot(page);
  await expectSoon(async () => (await state(page)).stats.jumps, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  expect((await state(page)).muddy).toBeGreaterThan(0);
  expect((await calloutsSeen(page))[0]).toMatch(/^✓ (Big splash|Splash)!$/);
  await expect(coach(page)).not.toHaveClass(/is-visible/);
  // Both feet down for a while: the character shows the knee lift again, not a jump.
  await onBothFeet(page);
  await expect(coach(page)).toHaveClass(/is-visible/, { timeout: 25_000 });
  await expect(coachText(page)).toHaveText('Lift your knee up high!');
  expect((await state(page)).film).toBe('kneeLift');
  const words = (await asked(page)).filter(({ text }) => text).map(({ text }) => text);
  expect(words.filter((text) => /jump/i.test(text))).toEqual([]);
});

test('a slow lift is followed to its highest: a foot coming up slowly, a long way, is one big splash', async ({ page }) => {
  await reachPlay(page, { swampJump: 'lift', swampRain: 'gentle' }, onBothFeet);
  await listen(page);
  await page.evaluate(() => {
    window.__foot = [];
    window.__footWatch = setInterval(() => window.__foot.push(window.__game.reader.footHeight ?? 0), 30);
  });
  // The right foot coming up evenly, 6 centimetres a second, for 8 seconds, to 48 centimetres, and down again.
  await footage(page, 'stands', { from: 1, playing: true });
  await page.waitForTimeout(9500);
  await onBothFeet(page);
  await expectSoon(async () => (await state(page)).air).toBe(false);
  const highest = await page.evaluate(() => {
    clearInterval(window.__footWatch);
    return Math.max(...window.__foot);
  });
  const measured = await page.evaluate(() => window.__game.game.highest);
  const landed = await heard(page, 'land');
  console.log('the foot went up to', highest, 'of leg length; the game measured', measured, 'and the splash was', landed.map(({ size }) => size));
  expect(landed).toHaveLength(1);
  expect(measured).toBeGreaterThan(highest * 0.85);
  expect(landed[0].big).toBe(true);
});

test('for a child who lifts, a real star jump in front of the camera is a splash, and a star one', async ({ page }) => {
  await reachPlay(page, { swampJump: 'lift', swampRain: 'gentle' }, onBothFeet);
  await listen(page);
  await footage(page, 'star-jumps');
  await expectSoon(async () => (await heard(page, 'land')).filter(({ star }) => star).length, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  expect((await state(page)).muddy).toBeGreaterThan(0);
});

test('lifting a foot is not a jump: unless the grown-ups choose lifting, it makes no splash', async ({ page }) => {
  await reachPlay(page, { swampRain: 'gentle' }, onBothFeet);
  await liftingAFoot(page);
  // Each foot is lifted and held in this time, one after the other.
  await page.waitForTimeout(12_000);
  const now = await state(page);
  expect([now.stats.jumps, now.muddy]).toEqual([0, 0]);
});

/* ---------- the character showing how ---------- */

test('the character shows how when the child seems to need it: a jump at the start, gone once they jump, and back after 7 seconds with no jump', async ({ page }) => {
  test.setTimeout(120_000);
  await reachPlay(page, { swampRain: 'gentle' });
  await listen(page);
  await noteAsked(page);
  await expect(coach(page)).toHaveClass(/is-visible/);
  await expect(coachText(page)).toHaveText('Jump!');
  expect((await state(page)).film).toBe('jump');
  await expect(promptText(page)).toHaveText('Jump!');
  await jumping(page);
  await expectSoon(async () => (await state(page)).stats.jumps, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  await expect(coach(page)).not.toHaveClass(/is-visible/);
  expect((await state(page)).film).toBe(null);
  // Standing still from now on.
  await standInView(page);
  await expect(coach(page)).toHaveClass(/is-visible/, { timeout: 25_000 });
  await expect(coachText(page)).toHaveText('Jump as high as you can!');
  expect((await state(page)).film).toBe('jump');
  // It came back 7 seconds after the last jump landed, and not before.
  const landedAt = (await heard(page, 'land')).at(-1).at;
  const shownAt = (await asked(page)).find(({ at, what }) => what === 'shown' && at > landedAt).at;
  console.log('the film came back', Math.round(shownAt - landedAt), 'ms after the last landing');
  expect(shownAt - landedAt).toBeGreaterThan(6900);
  expect(shownAt - landedAt).toBeLessThan(20_000);
});

/* ---------- sound and words ---------- */

test('with sound and voice on, a whole game is said and heard, and nothing is missing', async ({ page }) => {
  test.setTimeout(150_000);
  await openSwamp(page, atLevel(8, { voice: true, sound: true }));
  await noteWhatIsSaid(page);
  await standInView(page);
  await page.locator('#start').click();
  await waitForScreen(page, 'choose');
  await page.locator('#swamp-start').click();
  await waitForScreen(page, 'playing');
  await expectSoon(async () => (await said(page)).map(({ text }) => text)).toContain('Jump in the swamp! Cover the window in mud before the rain comes!');
  expect((await said(page)).find(({ text }) => text.startsWith('Jump in the swamp!')).heard).toBe(true);
  // A real jump, and what comes after it at this level: a star jump asked for, a mud bubble, and the heron.
  await jumping(page);
  await expectSoon(async () => (await state(page)).stats.jumps, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  await standInView(page);
  await page.evaluate(() => {
    window.__game.swamp.bubble.in = 0;
  });
  await expect(promptText(page)).toHaveText('Now! Land on the bubble!', { timeout: 15_000 });
  await lands(page, 1.2);
  await page.evaluate(() => {
    window.__game.swamp.heron.in = 0;
  });
  await expect(promptText(page)).toHaveText('Jump, and scare the heron away!', { timeout: 15_000 });
  await page.waitForTimeout(1500);
  await lands(page, 1.2);
  await page.evaluate(() => {
    const { swamp } = window.__game;
    while (swamp.state === 'play') swamp.land(2.4);
  });
  await waitForScreen(page, 'finish');
  await expectSoon(async () => (await said(page)).map(({ text }) => text)).toContain('What a muddy window!');
  console.log('said:', JSON.stringify((await said(page)).map(({ text, heard: was }) => `${text}${was ? '' : ' (not heard)'}`)));
});

test('in Georgian, what the child is asked, what a splash is called, and what the level brings are in Georgian letters', async ({ page }) => {
  await openSwamp(page, atLevel(5, { language: 'ka', swampRain: 'gentle' }));
  await standInView(page);
  await page.locator('#start').click();
  await waitForScreen(page, 'choose');
  await page.locator('#swamp-start').click();
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-new-now')).toContainText('ახალი:');
  await expect(page.locator('#level-new-now')).toContainText('ტალახის ბუშტები: დიდზე დახტი');
  await waitForScreen(page, 'playing');
  await expect(promptText(page)).toHaveText('ახტი!');
  await expect(coachText(page)).toHaveText('ახტი!');
  const prompt = await promptText(page).textContent();
  await noteCallouts(page);
  await lands(page, 1.2, 2.4);
  expect(await calloutsSeen(page)).toEqual(['✓ ჭყაპ!', '✓ დიდი ჭყაპი!']);
  for (const text of [prompt, ...(await calloutsSeen(page))]) {
    expect(text).toMatch(/[ა-ჿ]/);
    expect(text).not.toMatch(/[A-Za-z]/);
  }
});

/* ---------- the grown-ups' panel ---------- */

test('how high a big jump is, changed in the middle of a game, goes on at once and the game carries on; the rain cloud changed starts it again', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page);
  await lands(page, 2.2);
  const before = await state(page);
  expect(before.high).toBe(0.15);
  await page.locator('#open-panel').click();
  await expect(page.locator('#live-reading')).toContainText('one of 15% is the biggest splash');
  await page.locator('input[name="swampHigh"][value="low"]').check();
  await expect(page.locator('#live-reading')).toContainText('one of 10% is the biggest splash');
  await page.locator('#close-panel').click();
  await expect(page.locator('#panel')).toBeHidden();
  // Not started again: no countdown, and the mud and the jump are still there.
  for (let n = 0; n < 15; n += 1) {
    expect((await state(page)).screen).toBe('playing');
    await page.waitForTimeout(100);
  }
  const after = await state(page);
  expect(after.high).toBe(0.1);
  expect([after.stats.jumps, after.muddy]).toEqual([1, before.muddy]);
  expect(after.time).toBeGreaterThan(before.time);
  // The gentle swamp: started again when the panel closes, and not before, with no cloud.
  await page.locator('#open-panel').click();
  await page.locator('input[name="swampRain"][value="gentle"]').check();
  expect((await state(page)).screen).toBe('playing');
  await page.locator('#close-panel').click();
  await waitForScreen(page, 'countdown');
  await waitForScreen(page, 'playing');
  const again = await state(page);
  expect([again.seconds, again.muddy, again.stats.jumps, again.high]).toEqual([Infinity, 0, 0, 0.1]);
});
