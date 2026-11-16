// Swamp Splash's ten levels, in the real page: what each one brings is named on the title card and under the
// countdown, and it's really there in the game, and wasn't there the level before. A person stands in view in
// front of the real tracker; where a test is about what comes after a jump, it says what a tracked body would do
// by calling the rules in the page, and something slow to come may be brought forward. A real star jump and a real
// squat are real footage.
import {
  GOLD, GRID, LOOKS_MUDDY, MUD, atLevel, calloutsSeen, distance, expect, expectSoon, footage, heard, lands, listen, looksMuddy, muddyTo,
  nearMud, nobody, noteCallouts, openSwamp, pixels, playAgain, reachPlay, reopenWith, settled, shot, squareColours,
  standInView, starJumping, state, test, waitForScreen,
} from './helpers.js';

const GENTLE = { swampRain: 'gentle' };
const NEW = {
  2: 'Frogs that jump when you jump big',
  3: 'Bend your knees first for a super splash',
  4: 'A shower that washes a strip clean',
  5: 'Mud bubbles: land when one is big',
  6: 'The heron wipes the window: a jump scares it off',
  7: 'Three big jumps in a row: golden mud',
  8: 'A star jump throws mud to every corner',
  9: 'The wind dries the mud: keep jumping',
  10: 'The muddiest window of all wins the cup',
};
const coachText = (page) => page.locator('#coach-text');
const promptText = (page) => page.locator('#prompt-text');
const screenSize = (page) => page.evaluate(() => ({ w: window.__game.view.width, h: window.__game.view.height }));

/** Holds off something a level has that's slow to come, so that it doesn't get in the way of a test about something else. */
const holdOff = (page, ...things) => page.evaluate((names) => {
  const { swamp } = window.__game;
  for (const name of names) if (swamp[name]) swamp[name].in = 1e9;
}, things);

/** The same game, at another level: saved as chosen, and the page opened again. */
async function nowAtLevel(page, level, settings = GENTLE) {
  await reopenWith(page, atLevel(level, settings));
  await playAgain(page);
  expect((await state(page)).level).toBe(level);
}

/* ---------- what's new, in words ---------- */

test('the title card says what each level brings that is new, and level 1 has nothing new to say', async ({ page }) => {
  await openSwamp(page);
  await expect(page.locator('#level-badge')).toHaveText('Level 1 of 10');
  await expect(page.locator('#level-new')).toBeHidden();
  for (const [level, name] of Object.entries(NEW)) {
    await page.locator('#open-panel').click();
    await page.locator(`#level-choice input[value="${level}"]`).check();
    await page.locator('#close-panel').click();
    await expect(page.locator('#level-badge')).toHaveText(`Level ${level} of 10`);
    await expect(page.locator('#level-new .level-new-chip')).toHaveCount(1);
    await expect(page.locator('#level-new')).toContainText(name);
  }
});

test('the countdown says what each level brings that is new', async ({ page }) => {
  test.setTimeout(240_000);
  await reachPlay(page, GENTLE);
  await expect(page.locator('#level-new-now')).toBeHidden();
  for (const [level, name] of Object.entries(NEW)) {
    // Chosen in the middle of a game, which starts it again at that level.
    await page.locator('#open-panel').click();
    await page.locator(`#level-choice input[value="${level}"]`).check();
    await page.locator('#close-panel').click();
    await waitForScreen(page, 'countdown');
    await expect(page.locator('#level-new-now')).toBeVisible();
    await expect(page.locator('#level-new-now')).toContainText(name);
    await waitForScreen(page, 'playing');
    expect((await state(page)).level).toBe(Number(level));
  }
});

/* ---------- level 2 ---------- */

test('level 2: a frog sits on its lily pad, and a big jump sends it hopping with mud of its own, but a small jump does not; level 1 has no frog', async ({ page }) => {
  const padColour = async () => {
    const { w, h } = await screenSize(page);
    return (await pixels(page, [{ x: 0.24 * w, y: 0.74 * h }]))[0];
  };
  const LILY_PAD = [112, 189, 106];
  const FROG = [63, 163, 77];
  await reachPlay(page, atLevel(1, GENTLE));
  expect((await state(page)).rules.frogs).toBe(0);
  expect(distance(await padColour(), LILY_PAD)).toBeLessThan(10);
  await lands(page, 2.4);
  expect((await state(page)).stats.frogs).toBe(0);
  await nowAtLevel(page, 2);
  expect((await state(page)).rules.frogs).toBe(1);
  expect(distance(await padColour(), FROG)).toBeLessThan(10);
  await listen(page);
  await lands(page, 1.2);
  expect((await state(page)).stats.frogs).toBe(0);
  expect((await heard(page, 'splat')).map(({ kind }) => kind)).toEqual(['jump']);
  await lands(page, 2.2);
  expect((await state(page)).stats.frogs).toBe(1);
  expect((await heard(page, 'splat')).map(({ kind }) => kind)).toEqual(['jump', 'jump', 'frog']);
  // Up off its pad, on the screen.
  expect(await page.evaluate(() => window.__game.view.frogHops[0])).toBeGreaterThan(0.5);
  await shot(page, 'swamp-level-2');
});

/* ---------- level 3 ---------- */

test('level 3: knees bent in front of the camera, and then a jump, is a super splash; level 2 has none', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, atLevel(2, GENTLE));
  await listen(page);
  await page.evaluate(() => {
    const { swamp } = window.__game;
    swamp.squat();
    swamp.land(2);
  });
  expect((await state(page)).stats.supers).toBe(0);
  expect((await heard(page, 'land'))[0].bent).toBe(false);
  await nowAtLevel(page, 3);
  await listen(page);
  await noteCallouts(page);
  // A plain jump, for how big its splat is.
  await lands(page, 2);
  // A real squat, slowly down and up, in front of the camera. The jump lands soon after it.
  await footage(page, 'squat');
  const landed = await page.evaluate(() => new Promise((done) => {
    const { swamp } = window.__game;
    const timer = setInterval(() => {
      if (swamp.bent > 0.5) return;
      clearInterval(timer);
      swamp.land(2);
      done(true);
    }, 20);
    setTimeout(() => {
      clearInterval(timer);
      done(false);
    }, 25_000);
  }));
  expect(landed, 'the squat was seen').toBe(true);
  await standInView(page);
  const now = await state(page);
  expect(now.stats.supers).toBe(1);
  const [plain, bent] = await heard(page, 'land');
  expect([plain.bent, bent.bent]).toEqual([false, true]);
  const [first, second] = (await heard(page, 'splat')).filter(({ kind }) => kind === 'jump');
  expect(second.cells).toBeGreaterThan(first.cells * 1.3);
  expect(await calloutsSeen(page)).toContain('✓ Super splash!');
});

test('level 3: after two jumps the character asks for bent knees, until a super splash is done; at level 2 it never does', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, atLevel(2, GENTLE));
  await lands(page, 1.4, 1.4, 1.4);
  await page.waitForTimeout(1200);
  expect((await state(page)).film).not.toBe('squat');
  await nowAtLevel(page, 3);
  await lands(page, 1.4);
  await page.waitForTimeout(1200);
  expect((await state(page)).film).not.toBe('squat');
  await lands(page, 1.4);
  await expectSoon(async () => (await state(page)).film).toBe('squat');
  await expect(coachText(page)).toHaveText('Bend your knees, then jump!');
  await expect(promptText(page)).toHaveText('Bend your knees, then jump!');
  // Done once, and it isn't asked for again.
  await page.evaluate(() => {
    const { swamp } = window.__game;
    swamp.squat();
    swamp.land(1.8);
  });
  expect((await state(page)).stats.supers).toBe(1);
  await expectSoon(async () => (await state(page)).film).not.toBe('squat');
  await lands(page, 1.4, 1.4);
  await page.waitForTimeout(1200);
  expect((await state(page)).film).not.toBe('squat');
  await expect(promptText(page)).not.toHaveText('Bend your knees, then jump!');
});

/* ---------- level 4 ---------- */

test('level 4: a little cloud is seen over a strip of the window, and then that strip is washed on the screen, from the top down; level 3 has no shower', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, atLevel(3, GENTLE));
  expect([(await state(page)).rules.shower, (await state(page)).shower]).toEqual([null, null]);
  await nowAtLevel(page, 4);
  await holdOff(page, 'shower', 'bubble', 'heron');
  await listen(page);
  await muddyTo(page, 0.38);
  await settled(page);
  // Brought forward: the little cloud comes 3 seconds before it rains.
  await page.evaluate(() => {
    window.__game.swamp.shower.in = 3.1;
  });
  await expectSoon(async () => (await heard(page, 'shower-coming')).length, { timeout: 10_000 }).toBe(1);
  const from = (await state(page)).shower.at;
  const { w, h } = await screenSize(page);
  await expectSoon(async () => distance((await pixels(page, [{ x: ((from + 2.5) / GRID.wide) * w, y: 0.19 * h }]))[0], [223, 230, 238]), { timeout: 10_000 }).toBeLessThan(8);
  await shot(page, 'swamp-shower-coming');
  // Each frame from the moment it rains: when each square in the middle of the strip last showed mud. Under the
  // little cloud the mud can't be seen, and at the strip's sides the mud beside it can reach in.
  const watched = await page.evaluate(async ({ start, wide, high, look, test }) => {
    const { view, swamp } = window.__game;
    const looks = new Function(`return (${test});`)();
    const muddy = (colour) => looks(colour, look);
    const cells = [];
    for (let y = 0; y < high; y += 1) if (y < 2 || y > 4) for (let x = start + 1; x < start + 4; x += 1) cells.push(y * wide + x);
    const read = (cell) => {
      const x = ((cell % wide) + 0.5) * (view.width / wide);
      const y = (Math.floor(cell / wide) + 0.5) * (view.height / high);
      return [...view.ctx.getImageData(Math.round(x * view.ratio), Math.round(y * view.ratio), 1, 1).data].slice(0, 3);
    };
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    while (!swamp.stats.showers) await frame();
    const rained = performance.now();
    const had = cells.filter((cell) => muddy(read(cell)));
    const last = new Map(had.map((cell) => [cell, 0]));
    for (let n = 0; n < 150; n += 1) {
      await frame();
      for (const cell of had) if (muddy(read(cell))) last.set(cell, performance.now() - rained);
    }
    return { had, last: [...last.entries()], still: had.filter((cell) => muddy(read(cell))) };
  }, { start: from, wide: GRID.wide, high: GRID.high, look: MUD, test: LOOKS_MUDDY });
  // What the rules washed is that strip, and only that.
  const washed = (await heard(page, 'clean')).filter(({ why }) => why === 'shower');
  expect(washed).toHaveLength(1);
  expect(washed[0].list.every((cell) => cell % GRID.wide >= from && cell % GRID.wide < from + 5)).toBe(true);
  // All of it washed on the screen, the top first.
  expect(watched.had.length).toBeGreaterThan(8);
  expect(watched.still).toEqual([]);
  const when = (rows) => watched.last.filter(([cell]) => rows.includes(Math.floor(cell / GRID.wide))).map(([, ms]) => ms);
  const top = when([0, 1, 5, 6]);
  const bottom = when([13, 14, 15, 16, 17]);
  console.log('the top of the strip washed after', JSON.stringify(top.map(Math.round)), 'ms, and the bottom after', JSON.stringify(bottom.map(Math.round)));
  expect(top.length).toBeGreaterThan(0);
  expect(bottom.length).toBeGreaterThan(0);
  expect(Math.max(...top)).toBeLessThan(Math.min(...bottom));
});

/* ---------- level 5 ---------- */

test('level 5: a mud bubble comes up and grows, the child is told to land on it while it is big, and landing then bursts it for a double splash; level 4 has none', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, atLevel(4, GENTLE));
  expect([(await state(page)).rules.bubble, (await state(page)).bubble]).toEqual([false, null]);
  await nowAtLevel(page, 5);
  await holdOff(page, 'bubble', 'shower');
  await listen(page);
  await noteCallouts(page);
  const { w, h } = await screenSize(page);
  // The top of the dome, where it is when it's whole.
  const dome = { x: 0.64 * w, y: 0.86 * h - 0.4 * 0.055 * h };
  const domeColour = async () => (await pixels(page, [dome]))[0];
  expect(distance(await domeColour(), MUD.fill)).toBeGreaterThan(20);
  // Brought forward. It comes up, and grows.
  await page.evaluate(() => {
    window.__game.swamp.bubble.in = 0;
  });
  await expectSoon(async () => (await heard(page, 'bubble')).length, { timeout: 10_000 }).toBe(1);
  await expectSoon(() => page.evaluate(() => window.__game.view.bubble.size), { timeout: 10_000 }).toBeGreaterThan(0.3);
  expect((await state(page)).bubbleBig).toBe(false);
  await expect(promptText(page)).not.toHaveText('Now! Land on the bubble!');
  await expectSoon(async () => (await state(page)).bubbleBig, { timeout: 10_000 }).toBe(true);
  expect(distance(await domeColour(), MUD.fill)).toBeLessThan(8);
  await expect(promptText(page)).toHaveText('Now! Land on the bubble!');
  await shot(page, 'swamp-bubble');
  // Landed on while it's big: it bursts, and there's twice the mud.
  await lands(page, 1.5);
  let now = await state(page);
  expect([now.stats.bubbles, now.bubbleBig]).toEqual([1, false]);
  expect(await heard(page, 'pop')).toHaveLength(1);
  const [popped] = await heard(page, 'splat');
  await expect(promptText(page)).not.toHaveText('Now! Land on the bubble!');
  // The next one, landed beside while it's still growing: it doesn't burst, and the splash is an ordinary one.
  await page.evaluate(() => {
    window.__game.swamp.bubble.in = 0;
  });
  await expectSoon(async () => (await heard(page, 'bubble')).length, { timeout: 10_000 }).toBe(2);
  await lands(page, 1.5);
  now = await state(page);
  expect(now.stats.bubbles).toBe(1);
  expect(now.bubble.age).not.toBe(null);
  const ordinary = (await heard(page, 'splat'))[1];
  console.log('squares in a splash on the bubble, and beside it:', popped.cells, ordinary.cells);
  expect(popped.cells).toBeGreaterThan(ordinary.cells * 1.7);
});

/* ---------- level 6 ---------- */

/** Where the heron is drawn, and the colour of the screen at the middle of its body. */
const heronSeen = (page) => page.evaluate(async () => {
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const { view } = window.__game;
  const { heron } = view;
  if (!heron) return null;
  const smooth = (share) => share * share * (3 - 2 * share);
  const coming = smooth(Math.min(1, Math.max(0, heron.age / heron.takes)));
  const x = heron.from.x + (heron.to.x - heron.from.x) * coming;
  const y = heron.from.y + (heron.to.y - 0.06 - heron.from.y) * coming;
  const colour = [...view.ctx.getImageData(Math.round(x * view.width * view.ratio), Math.round(y * view.height * view.ratio), 1, 1).data].slice(0, 3);
  return { x, y, age: heron.age, colour, leaving: heron.leaving };
});

test('level 6: the heron is seen coming to wipe the window, the child is told to scare it off, and a jump does, with nothing wiped; level 5 has no heron', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, atLevel(5, GENTLE));
  expect([(await state(page)).rules.heron, (await state(page)).heron]).toEqual([false, null]);
  await nowAtLevel(page, 6);
  await holdOff(page, 'heron', 'shower', 'bubble');
  await listen(page);
  await noteCallouts(page);
  await muddyTo(page, 0.3);
  await settled(page);
  const muddy = (await state(page)).muddy;
  await page.evaluate(() => {
    window.__game.swamp.heron.in = 0;
  });
  await expectSoon(async () => (await heard(page, 'heron')).length, { timeout: 10_000 }).toBe(1);
  // On its way, white, and coming nearer to where it's going.
  await expectSoon(async () => (await heronSeen(page)).age, { timeout: 10_000 }).toBeGreaterThan(1.6);
  const earlier = await heronSeen(page);
  await expectSoon(async () => (await heronSeen(page)).age, { timeout: 10_000 }).toBeGreaterThan(2.6);
  const later = await heronSeen(page);
  const to = (await heard(page, 'heron'))[0];
  for (const seen of [earlier, later]) expect(distance(seen.colour, [244, 246, 248])).toBeLessThan(12);
  expect(Math.abs(later.x - to.x)).toBeLessThan(Math.abs(earlier.x - to.x));
  await expect(promptText(page)).toHaveText('Jump, and scare the heron away!');
  await shot(page, 'swamp-heron');
  // A jump before it gets there: off it goes, and nothing is wiped.
  const scared = await page.evaluate(() => {
    const { swamp } = window.__game;
    if (swamp.heron.coming === null) return false;
    swamp.land(1.3);
    return true;
  });
  expect(scared, 'landed before the heron got there').toBe(true);
  expect(await heard(page, 'scared')).toHaveLength(1);
  expect(await calloutsSeen(page)).toContain('✓ Off it goes!');
  await expectSoon(() => page.evaluate(() => window.__game.view.heron), { timeout: 10_000 }).toBe(null);
  const now = await state(page);
  expect([now.stats.herons, now.stats.wiped]).toEqual([1, 0]);
  expect(now.muddy).toBeGreaterThanOrEqual(muddy);
  expect(await heard(page, 'wiped')).toEqual([]);
});

test('level 6: with no jump, the heron wipes a patch of the window clean, and the screen shows it clean', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, atLevel(6, GENTLE));
  await holdOff(page, 'heron', 'shower', 'bubble');
  await listen(page);
  await muddyTo(page, 0.35);
  await settled(page);
  const before = await state(page);
  await page.evaluate(() => {
    window.__game.swamp.heron.in = 0;
  });
  await expectSoon(async () => (await heard(page, 'wiped')).length, { timeout: 15_000 }).toBe(1);
  const wiped = (await heard(page, 'clean')).find(({ why }) => why === 'heron').list;
  const now = await state(page);
  expect(now.stats.wiped).toBe(wiped.length);
  expect(now.muddy).toBe(before.muddy - wiped.length);
  expect(wiped.length).toBeGreaterThan(5);
  // Once it has gone and the mud has settled, that patch shows no mud, but where mud beside it reaches in.
  await expectSoon(() => page.evaluate(() => window.__game.view.heron), { timeout: 10_000 }).toBe(null);
  await settled(page);
  const near = nearMud((await state(page)).mud, 1);
  const open = wiped.filter((cell) => !near.has(cell));
  expect(open.length).toBeGreaterThan(0);
  const colours = await squareColours(page, open);
  expect(open.map((cell, n) => [cell, colours[n]]).filter(([, colour]) => looksMuddy(colour)).map(([cell, colour]) => `square ${cell}: ${colour}`)).toEqual([]);
  await shot(page, 'swamp-heron-wiped');
});

/* ---------- level 7 ---------- */

test('level 7: three big jumps in a row throw golden mud, which the Golden chip counts; level 6 has none', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, atLevel(6, GENTLE));
  await holdOff(page, 'heron', 'shower', 'bubble');
  await lands(page, 2.2, 2.2, 2.2);
  let now = await state(page);
  expect([now.stats.stars, now.mud.filter((mud) => mud === 2).length]).toEqual([0, 0]);
  await expect(page.locator('#stars-chip')).toBeHidden();
  await nowAtLevel(page, 7);
  await holdOff(page, 'heron', 'shower', 'bubble');
  await listen(page);
  await noteCallouts(page);
  await expect(page.locator('#stars-chip')).toBeVisible();
  await expect(page.locator('#stars')).toHaveText('0');
  // Two big ones and a small one start the count again.
  await lands(page, 2.2, 2.2, 1.2, 2.2, 2.2);
  expect((await state(page)).stats.stars).toBe(0);
  await lands(page, 2.2);
  now = await state(page);
  expect(now.stats.stars).toBe(1);
  await expect(page.locator('#stars')).toHaveText('1');
  expect(await calloutsSeen(page)).toContain('✓ Golden mud!');
  const golden = [...now.mud.keys()].filter((cell) => now.mud[cell] === 2);
  expect(golden.length).toBeGreaterThan(20);
  // Golden on the screen, once it has come and the little stars have gone.
  await settled(page);
  await expectSoon(() => page.evaluate(() => window.__game.view.effects.length)).toBe(0);
  const colours = await squareColours(page, golden);
  expect(golden.map((cell, n) => [cell, colours[n]]).filter(([, colour]) => !looksMuddy(colour, GOLD)).map(([cell, colour]) => `square ${cell}: ${colour}`)).toEqual([]);
  await shot(page, 'swamp-golden');
});

/* ---------- level 8 ---------- */

test('level 8: a real star jump in front of the camera throws mud to all four corners of the window; at level 7 it does not', async ({ page }) => {
  test.setTimeout(180_000);
  await reachPlay(page, atLevel(7, GENTLE));
  await holdOff(page, 'heron', 'shower', 'bubble');
  await listen(page);
  await starJumping(page);
  await expectSoon(async () => (await heard(page, 'land')).length, { timeout: 30_000 }).toBeGreaterThanOrEqual(3);
  expect((await state(page)).stats.starJumps).toBe(0);
  expect((await heard(page, 'splat')).filter(({ kind }) => kind === 'corner')).toEqual([]);
  await nowAtLevel(page, 8);
  await holdOff(page, 'heron', 'shower', 'bubble');
  await listen(page);
  await starJumping(page);
  await expectSoon(async () => (await state(page)).stats.starJumps, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  await standInView(page);
  await expectSoon(async () => (await state(page)).air).toBe(false);
  expect((await heard(page, 'land')).some(({ star }) => star)).toBe(true);
  expect((await heard(page, 'splat')).filter(({ kind }) => kind === 'corner').length).toBeGreaterThanOrEqual(4);
  await settled(page);
  const corners = [0, GRID.wide - 1, GRID.wide * (GRID.high - 1), GRID.wide * GRID.high - 1];
  const colours = await squareColours(page, corners);
  expect(colours.map((colour) => looksMuddy(colour))).toEqual([true, true, true, true]);
  await shot(page, 'swamp-star-jump');
});

test('level 8: after a jump the character asks for a star jump, until one is done; at level 7 it never does', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, atLevel(7, GENTLE));
  await lands(page, 1.4);
  await page.waitForTimeout(1200);
  expect((await state(page)).film).not.toBe('starJump');
  await nowAtLevel(page, 8);
  await holdOff(page, 'heron', 'shower', 'bubble');
  await lands(page, 1.4);
  await expectSoon(async () => (await state(page)).film).toBe('starJump');
  await expect(coachText(page)).toHaveText('Do a star jump!');
  await page.evaluate(() => window.__game.swamp.land(1.6, { star: true }));
  await expectSoon(async () => (await state(page)).film).not.toBe('starJump');
  await lands(page, 1.4);
  await page.waitForTimeout(1200);
  expect((await state(page)).film).not.toBe('starJump');
});

test('for a child who lifts a knee, the films for a star jump and for bent knees ask in words for lifting', async ({ page }) => {
  await reachPlay(page, atLevel(8, { ...GENTLE, swampJump: 'lift' }));
  await holdOff(page, 'heron', 'shower', 'bubble');
  await lands(page, 1.4);
  await expectSoon(async () => (await state(page)).film).toBe('starJump');
  await expect(coachText(page)).toHaveText('Arms up and feet apart, like a star!');
  await page.evaluate(() => window.__game.swamp.land(1.6, { star: true }));
  await expectSoon(async () => (await state(page)).film).toBe('squat');
  await expect(coachText(page)).toHaveText('Bend your knees, then lift!');
});

/* ---------- level 9 ---------- */

test('level 9: with the child in view the wind dries the mud and it flakes off, and with nobody there it does not; level 8 has no wind', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, atLevel(8, GENTLE));
  await holdOff(page, 'heron', 'shower', 'bubble');
  await listen(page);
  await muddyTo(page, 0.3);
  const still = (await state(page)).muddy;
  await page.waitForTimeout(6000);
  expect((await state(page)).muddy).toBe(still);
  expect(await heard(page, 'clean')).toEqual([]);
  await nowAtLevel(page, 9);
  await holdOff(page, 'heron', 'shower', 'bubble');
  await listen(page);
  await muddyTo(page, 0.3);
  const before = (await state(page)).muddy;
  // Standing in view: a few squares at a time, every so often.
  await expectSoon(async () => (await heard(page, 'clean')).filter(({ why }) => why === 'wind').length, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
  const dried = (await heard(page, 'clean')).filter(({ why }) => why === 'wind').flatMap(({ list }) => list);
  expect((await state(page)).muddy).toBeLessThan(before);
  // Gone from the screen too.
  await expectSoon(() => page.evaluate((cells) => cells.every((cell) => window.__game.view.shown[cell] === 0 || window.__game.swamp.mud[cell]), dried)).toBe(true);
  // Nobody there: it waits.
  await nobody(page);
  await expect(promptText(page)).toHaveText('Come back where I can see you', { timeout: 15_000 });
  const waiting = (await state(page)).muddy;
  await page.waitForTimeout(6000);
  expect((await state(page)).muddy).toBe(waiting);
});

/* ---------- level 10 ---------- */

test('level 10: the cup, when it is won, and the card says so; winning level 9 does not win it', async ({ page }) => {
  test.setTimeout(150_000);
  const win = async () => {
    await page.evaluate(() => {
      const { swamp } = window.__game;
      window.__cups = 0;
      while (swamp.state === 'play') swamp.land(2.6);
    });
    await waitForScreen(page, 'finish');
    return { ...(await state(page)), cups: await page.evaluate(() => window.__cups) };
  };
  await reachPlay(page, atLevel(9, GENTLE));
  // The cup's sound, counted.
  await page.evaluate(() => {
    const { sound } = window.__game;
    const cup = sound.cup.bind(sound);
    sound.cup = () => {
      window.__cups += 1;
      cup();
    };
  });
  let end = await win();
  expect([end.stats.cup, end.cups]).toEqual([false, 0]);
  await expect(page.locator('#finish-prizes')).not.toContainText('cup');
  // On to level 10, from the card.
  await expect(page.locator('#jump-again')).toHaveText('Next level');
  await standInView(page);
  await page.locator('#jump-again').click();
  await waitForScreen(page, 'playing');
  expect((await state(page)).level).toBe(10);
  await listen(page);
  end = await win();
  expect([end.stats.cup, end.cups]).toEqual([true, 1]);
  expect((await heard(page)).map(({ type }) => type).slice(-2)).toEqual(['cup', 'won']);
  await expect(page.locator('#finish-prizes')).toContainText('the cup is won');
  await expect(page.locator('#level-done-text')).toHaveText('All 10 levels done!');
  await shot(page, 'swamp-cup');
});
