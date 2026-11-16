// Hat Chase's ten levels, in the real page: what each one brings is named on the title card and under the
// countdown, and it's really there in the game, drawn where the rules have it, and wasn't there the level before. A
// person stands in view in front of the real tracker; what a tracked body would do is said by calling the rules in
// the page.
import {
  GENTLE, atLevel, bringToTheEnd, calloutsSeen, colourIn, drawnBox, expect, expectSoon, getPast, heard, hold, listen, marchToNext,
  middle, noteCallouts, openChase, partWay, pathWith, playAgain, reachPlay, reopenWith, shot, state, test, waitForScreen, walkUnderATree,
  walkUpTo,
} from './helpers.js';

const NEW = {
  2: 'Low branches: bend your knees to duck under',
  3: 'Apple trees: reach up high to pick the apples',
  4: 'Hedgehogs: jump before one rolls into you',
  5: 'Stepping stones: three jumps across the pond',
  6: 'A springboard: a star jump catches the stars above',
  7: 'Bees: bend your knees before they fly over',
  8: 'Golden feathers over the streams, for a big jump',
  9: 'Two things in a row, one straight after the other',
  10: 'The cup is in the magpie’s tree',
};
const coachText = (page) => page.locator('#coach-text');
const promptText = (page) => page.locator('#prompt-text');

/** The same game, at another level: saved as chosen, and the page opened again. */
async function nowAtLevel(page, level, settings = GENTLE) {
  await reopenWith(page, atLevel(level, settings));
  await playAgain(page);
  expect((await state(page)).level).toBe(level);
}

/** The kinds of thing in the way on the path, and whether there are apple trees. */
const kinds = async (page) => {
  const { course, trees } = await state(page);
  return { kinds: [...new Set(course.map(({ kind }) => kind))], trees: trees.length };
};

/** Where on the screen a place on the path is, across, as the view has it now. */
const across = (page, x) => page.evaluate((at) => window.__game.view.across(at), x);

/** The film and the words while the character stands at something. */
const askedFor = async (page, film, words) => {
  await expect(coachText(page)).toHaveText(words);
  await expect(promptText(page)).toHaveText(words);
  expect((await state(page)).film).toBe(film);
};

/* ---------- what's new, in words ---------- */

test('the title card says what each level brings that is new, and level 1 has nothing new to say', async ({ page }) => {
  await openChase(page);
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

test('level 2: a low branch across the path at head height; the character stops before it and asks for bent knees, a jump is only a hop, and bent knees duck under it; level 1 has none', async ({ page }) => {
  await reachPlay(page, atLevel(1, GENTLE));
  expect(await kinds(page)).toEqual({ kinds: ['stream'], trees: 0 });
  await nowAtLevel(page, 2);
  expect((await kinds(page)).kinds.sort()).toEqual(['branch', 'stream']);
  await listen(page);
  await noteCallouts(page);
  const index = await walkUpTo(page, 'branch');
  let now = await state(page);
  const branch = now.station;
  expect(branch.kind).toBe('branch');
  expect(now.hero.x).toBeCloseTo(branch.at - 0.6, 6);
  await askedFor(page, 'squat', 'Bend your knees!');
  // Drawn where it is, reaching over the path at the height of the character's head.
  await hold(page);
  const drawn = await drawnBox(page, 'drawInFront', index);
  const { ground, height, metre } = await state(page);
  const head = ground - height * 0.25 * 0.72;
  console.log('the branch drawn at', JSON.stringify(drawn), 'head height', head);
  expect(Math.abs(drawn.left - (await across(page, branch.at - 0.2))) - metre * 0.4).toBeLessThan(0);
  expect(drawn.right).toBeGreaterThan(await across(page, branch.at + branch.wide));
  expect(drawn.top).toBeLessThan(head);
  expect(drawn.bottom).toBeGreaterThan(head);
  expect(drawn.bottom).toBeLessThan(ground - height * 0.25 * 0.4);
  await hold(page, false);
  await shot(page, 'hat-branch');
  // A jump: a hop on the spot, and still in front of the branch.
  const stars = now.stats.stars;
  await page.evaluate(() => window.__game.chase.jump(1.5));
  expect((await state(page)).hero.move.kind).toBe('hop');
  await expectSoon(async () => (await state(page)).hero.mode).toBe('stand');
  now = await state(page);
  expect([now.station?.index, now.hero.x, now.stats.stars]).toEqual([index, branch.at - 0.6, stars]);
  // Bent knees: under, ducked down on the way.
  await page.evaluate(() => window.__game.chase.squat());
  const under = await partWay(page, 0.5);
  expect([under.kind, under.frame]).toEqual(['duck', 'duck']);
  await expectSoon(async () => (await state(page)).course[index].state).toBe('cleared');
  now = await state(page);
  expect(now.hero.x).toBeCloseTo(branch.at + branch.wide + 0.6, 6);
  expect(now.stats.stars).toBe(stars + 1);
  expect(await calloutsSeen(page)).toContain('✓ Under!');
});

/* ---------- level 3 ---------- */

test('level 3: apple trees beside the path; reaching up anywhere else brings nothing, and under one brings its apples down once; level 2 has none', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, atLevel(2, GENTLE));
  expect((await kinds(page)).trees).toBe(0);
  expect(await drawnBox(page, 'drawAppleTree')).toBe(null);
  await nowAtLevel(page, 3);
  expect((await kinds(page)).trees).toBeGreaterThanOrEqual(1);
  await listen(page);
  await noteCallouts(page);
  // Reaching up away from the trees.
  await page.evaluate(() => window.__game.chase.reach());
  expect((await state(page)).stats.apples).toBe(0);
  const index = await walkUnderATree(page);
  expect(index).not.toBe(null);
  let now = await state(page);
  const tree = now.trees[index];
  expect(now.hero.x).toBeGreaterThanOrEqual(tree.at);
  expect(now.hero.x).toBeLessThanOrEqual(tree.at + tree.wide);
  await askedFor(page, 'skyReach', 'Reach up high!');
  // Drawn behind the character, with its apples on it.
  await hold(page);
  const drawn = await drawnBox(page, 'drawAppleTree', index);
  const trunk = await across(page, tree.at + tree.wide / 2);
  console.log('the apple tree drawn at', JSON.stringify(drawn), 'its trunk at', trunk);
  expect(Math.abs(middle(drawn).x - trunk)).toBeLessThan(now.metre * 0.5);
  expect(Math.abs(drawn.bottom - now.ground)).toBeLessThan(now.metre * 0.3);
  const APPLE = [226, 72, 61];
  const before = await colourIn(page, drawn, APPLE, { without: ['drawHero', 'drawMagpie', 'drawEffects'] });
  expect(before).toBeGreaterThan(50);
  await hold(page, false);
  const stars = now.stats.stars;
  expect(await page.evaluate(() => window.__game.chase.reach())).toBe(true);
  now = await state(page);
  expect([now.stats.apples, now.stats.stars, now.trees[index].picked]).toEqual([3, stars + 3, true]);
  expect(await calloutsSeen(page)).toContain('✓ Apples!');
  // Once only.
  expect(await page.evaluate(() => window.__game.chase.reach())).toBe(false);
  expect((await state(page)).stats.stars).toBe(stars + 3);
  // Three apples fall, and then the tree has none left on it, on the screen.
  expect(await page.evaluate(() => window.__game.view.effects.filter(({ kind }) => kind === 'apple').length)).toBe(3);
  await expectSoon(() => page.evaluate(() => window.__game.view.effects.filter(({ kind }) => kind === 'apple').length), { timeout: 5000 }).toBe(0);
  await hold(page);
  expect(await colourIn(page, drawn, APPLE, { without: ['drawHero', 'drawMagpie', 'drawEffects'] })).toBe(0);
  await hold(page, false);
  await expectSoon(async () => (await state(page)).film).not.toBe('skyReach');
});

/* ---------- level 4 ---------- */

test('level 4: a hedgehog waits further along the path, and a jump before it rolls in gets over it for two stars; level 3 has none', async ({ page }) => {
  await reachPlay(page, atLevel(3, GENTLE));
  expect((await kinds(page)).kinds).not.toContain('hedgehog');
  await nowAtLevel(page, 4);
  await listen(page);
  await noteCallouts(page);
  const index = await walkUpTo(page, 'hedgehog');
  let now = await state(page);
  const hedgehog = now.station;
  expect(now.hero.x).toBeCloseTo(hedgehog.at - 0.6, 6);
  expect(hedgehog.fuse).toBe(5);
  expect(hedgehog.left).toBeGreaterThan(4);
  await askedFor(page, 'jump', 'Jump!');
  // Drawn further along, on the path, ahead of the character.
  await hold(page);
  now = await state(page);
  const drawn = await drawnBox(page, 'drawInFront', index);
  expect(drawn.left).toBeGreaterThan(now.heroAt.x);
  expect(drawn.bottom).toBeGreaterThan(now.ground - now.metre * 0.2);
  expect(drawn.bottom).toBeLessThan(now.ground + now.metre * 0.3);
  await hold(page, false);
  await page.waitForTimeout(1500);
  const stars = (await state(page)).stats.stars;
  await page.evaluate(() => window.__game.chase.jump(1.2));
  await expectSoon(async () => (await state(page)).course[index].state).toBe('cleared');
  await expectSoon(async () => (await state(page)).hero.mode).toBe('stand');
  now = await state(page);
  expect([now.stats.stars, now.stats.tumbles, now.course[index].missed]).toEqual([stars + 2, 0, false]);
  expect(now.hero.x).toBeCloseTo(hedgehog.at + hedgehog.wide + 0.6, 6);
  expect(await calloutsSeen(page)).toContain('✓ Over!');
  // Jumped, it stays where it had got to, behind the character now.
  await hold(page);
  now = await state(page);
  const behind = await drawnBox(page, 'drawInFront', index);
  expect(behind.right).toBeLessThan(now.heroAt.x);
  await hold(page, false);
});

/* ---------- level 5 ---------- */

test('level 5: stepping stones across a pond take three jumps, a stone each, marching on a stone goes nowhere, and the third lands on the far bank for three stars; level 4 has none', async ({ page }) => {
  await reachPlay(page, atLevel(4, GENTLE));
  expect((await kinds(page)).kinds).not.toContain('stones');
  await nowAtLevel(page, 5);
  await listen(page);
  const index = await walkUpTo(page, 'stones');
  let now = await state(page);
  const stones = now.station;
  expect(now.hero.x).toBeCloseTo(stones.at - 0.6, 6);
  await askedFor(page, 'jump', 'Jump!');
  // The pond and its stones, drawn from one bank to the other.
  await hold(page);
  const drawn = await drawnBox(page, 'drawThing', index);
  expect(Math.abs(drawn.left - (await across(page, stones.at)))).toBeLessThan(now.metre * 0.2);
  expect(Math.abs(drawn.right - (await across(page, stones.at + stones.wide)))).toBeLessThan(now.metre * 0.2);
  await hold(page, false);
  const stars = now.stats.stars;
  for (const stone of [1, 2]) {
    await page.evaluate(() => window.__game.chase.jump(1));
    await expectSoon(async () => (await state(page)).hero.mode).toBe('stand');
    now = await state(page);
    expect([now.station?.index, now.course[index].done, now.stats.stars]).toEqual([index, stone, stars]);
    expect(now.hero.x).toBeCloseTo(stones.at + (stones.wide * stone) / 3, 6);
    // Stood on the stone, on the screen, and still asked for a jump.
    await hold(page);
    const feet = (await state(page)).heroAt.x;
    expect(Math.abs(feet - (await across(page, stones.at + (stones.wide * stone) / 3)))).toBeLessThan(1);
    await hold(page, false);
    await askedFor(page, 'jump', 'Jump!');
    // Marching on a stone goes nowhere.
    expect(await page.evaluate(() => window.__game.chase.step('left'))).toBe(false);
    expect(await page.evaluate(() => window.__game.chase.squat())).toBe(false);
  }
  await page.evaluate(() => window.__game.chase.jump(1));
  await expectSoon(async () => (await state(page)).course[index].state).toBe('cleared');
  now = await state(page);
  expect(now.hero.x).toBeCloseTo(stones.at + stones.wide + 0.6, 6);
  expect(now.stats.stars).toBe(stars + 3);
  expect((await heard(page, 'cleared')).at(-1).how).toBe('stone');
  await shot(page, 'hat-stones');
});

/* ---------- level 6 ---------- */

test('level 6: a springboard with an arc of stars over it: any jump bounces the character over, high, and only a star jump catches the arc; level 5 has none', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, atLevel(5, GENTLE));
  expect((await kinds(page)).kinds).not.toContain('spring');
  await nowAtLevel(page, 6);
  await listen(page);
  let index = await walkUpTo(page, 'spring');
  let now = await state(page);
  let spring = now.station;
  expect(now.hero.x).toBeCloseTo(spring.at - 0.6, 6);
  await askedFor(page, 'starJump', 'Do a star jump!');
  // The springboard on the near bank, and the arc of stars high over the water beyond it.
  await hold(page);
  const drawn = await drawnBox(page, 'drawThing', index);
  expect(Math.abs(drawn.left - (await across(page, spring.at)))).toBeLessThan(now.metre * 0.2);
  expect(drawn.top).toBeLessThan(now.ground - now.metre * 3);
  await hold(page, false);
  // An ordinary jump: over, high, and one star, and the arc is still there.
  let stars = now.stats.stars;
  await page.evaluate(() => window.__game.chase.jump(1.2));
  const plain = await partWay(page, 0.5);
  expect(plain.kind).toBe('bounce');
  expect(plain.y).toBeLessThan(plain.ground - plain.metre * 2);
  await expectSoon(async () => (await state(page)).course[index].state).toBe('cleared');
  expect((await state(page)).stats.stars).toBe(stars + 1);
  expect(await page.evaluate((at) => window.__game.view.gone.has(`arc-${at}`), index)).toBe(false);
  // A star jump at a springboard on another path: higher still, in a star, and the five stars of the arc as well.
  await reopenWith(page, atLevel(6, GENTLE));
  await playAgain(page);
  await listen(page);
  await noteCallouts(page);
  index = await walkUpTo(page, 'spring');
  now = await state(page);
  spring = now.station;
  stars = now.stats.stars;
  await page.evaluate(() => window.__game.chase.jump(1.4, { star: true }));
  const starry = await partWay(page, 0.5);
  expect([starry.kind, starry.frame]).toEqual(['bounce', 'star']);
  expect(starry.y).toBeLessThan(starry.ground - starry.metre * 2.8);
  await expectSoon(async () => (await state(page)).course[index].state).toBe('cleared');
  now = await state(page);
  expect([now.stats.stars, now.stats.starJumps]).toEqual([stars + 6, 1]);
  expect(await calloutsSeen(page)).toContain('✓ Star jump!');
  // The arc fades away on the screen.
  await page.waitForTimeout(600);
  const after = await drawnBox(page, 'drawThing', index);
  expect(after.top).toBeGreaterThan(now.ground - now.metre * 1.2);
});

/* ---------- level 7 ---------- */

test('level 7: bees come out of their hive at head height; bent knees duck them for two stars, a jump does not help, and left too long they sting: a tumble; level 6 has none', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, atLevel(6, GENTLE));
  expect((await kinds(page)).kinds).not.toContain('bees');
  await nowAtLevel(page, 7);
  await listen(page);
  await noteCallouts(page);
  let index = await walkUpTo(page, 'bees');
  let now = await state(page);
  const bees = now.station;
  expect(now.hero.x).toBeCloseTo(bees.at - 0.6, 6);
  expect(bees.fuse).toBe(5);
  await askedFor(page, 'squat', 'Bend your knees!');
  // They come nearer, at the height of the character's head.
  const first = await drawnBox(page, 'drawInFront', index);
  await page.waitForTimeout(1200);
  const later = await drawnBox(page, 'drawInFront', index);
  const head = now.ground - now.height * 0.25 * 0.8;
  console.log('the bees drawn at', JSON.stringify(first), 'and then', JSON.stringify(later));
  expect(later.left).toBeLessThan(first.left - 10);
  expect(later.top).toBeLessThan(head);
  expect(later.bottom).toBeGreaterThan(head);
  // A jump is a hop, and doesn't get past them.
  await page.evaluate(() => window.__game.chase.jump(1.5));
  await expectSoon(async () => (await state(page)).hero.mode).toBe('stand');
  expect((await state(page)).station?.index).toBe(index);
  const stars = (await state(page)).stats.stars;
  await page.evaluate(() => window.__game.chase.squat());
  await expectSoon(async () => (await state(page)).course[index].state).toBe('cleared');
  await expectSoon(async () => (await state(page)).hero.mode).toBe('stand');
  now = await state(page);
  expect([now.stats.stars, now.stats.tumbles]).toEqual([stars + 2, 0]);
  expect(now.hero.x).toBeCloseTo(bees.at + bees.wide + 0.6, 6);
  expect(await calloutsSeen(page)).toContain('✓ Under!');
  // Gone once they're past.
  expect(await drawnBox(page, 'drawInFront', index)).toBe(null);
  // On another path, left too long: they sting.
  await reopenWith(page, atLevel(7, GENTLE));
  await playAgain(page);
  await listen(page);
  await noteCallouts(page);
  index = await walkUpTo(page, 'bees');
  const before = await state(page);
  await expectSoon(async () => (await state(page)).hero.mode, { timeout: 10_000, intervals: [20] }).toBe('tumble');
  now = await state(page);
  expect([now.stats.tumbles, now.stats.stars, now.course[index].missed, now.frame]).toEqual([1, before.stats.stars, true, 'sit']);
  expect(await calloutsSeen(page)).toContain('✓ Bump!');
  await expectSoon(async () => (await state(page)).hero.mode, { timeout: 5000 }).toBe('stand');
  await marchToNext(page);
  expect((await state(page)).hero.x).toBeGreaterThan(before.station.at + before.station.wide);
});

/* ---------- level 8 ---------- */

test('level 8: a golden feather over a stream, caught by a big jump for five stars more, and left by a small one; at level 7 a big jump catches a star there', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, atLevel(7, GENTLE));
  await pathWith(page, "(chase) => chase.course.some(({ kind }) => kind === 'stream')");
  let index = await walkUpTo(page, 'stream');
  let now = await state(page);
  expect(now.station.high.feather).toBe(false);
  expect(await drawnBox(page, 'drawFeather')).toBe(null);
  let stars = now.stats.stars;
  await page.evaluate(() => window.__game.chase.jump(1.8));
  await expectSoon(async () => (await state(page)).course[index].state).toBe('cleared');
  now = await state(page);
  expect([now.stats.stars, now.stats.feathers]).toEqual([stars + 2, 0]);
  await nowAtLevel(page, 8);
  await pathWith(page, "(chase) => chase.course.filter(({ kind }) => kind === 'stream').length >= 2");
  await listen(page);
  await noteCallouts(page);
  index = await walkUpTo(page, 'stream');
  now = await state(page);
  const stream = now.station;
  expect(stream.high.feather).toBe(true);
  // Drawn above the middle of the stream.
  await hold(page);
  const feather = await drawnBox(page, 'drawFeather');
  const over = await across(page, stream.at + stream.wide / 2);
  console.log('the feather drawn at', JSON.stringify(feather), 'over the middle of the stream at', over);
  expect(Math.abs(middle(feather).x - over)).toBeLessThan(now.metre * 0.3);
  expect(Math.abs(middle(feather).y - (now.ground - now.metre * 1.75))).toBeLessThan(now.metre * 0.3);
  await hold(page, false);
  await shot(page, 'hat-feather');
  // A small jump leaves it.
  stars = now.stats.stars;
  await page.evaluate(() => window.__game.chase.jump(1.1));
  await expectSoon(async () => (await state(page)).course[index].state).toBe('cleared');
  now = await state(page);
  expect([now.stats.stars, now.stats.feathers, now.course[index].high.taken]).toEqual([stars + 1, 0, false]);
  // A big one at the next stream catches it.
  index = await walkUpTo(page, 'stream');
  expect(index).not.toBe(null);
  stars = (await state(page)).stats.stars;
  await page.evaluate(() => window.__game.chase.jump(2));
  await expectSoon(async () => (await state(page)).course[index].state).toBe('cleared');
  now = await state(page);
  expect([now.stats.stars, now.stats.feathers, now.stats.big]).toEqual([stars + 6, 1, 1]);
  expect(await calloutsSeen(page)).toContain('✓ A golden feather!');
  expect((await heard(page, 'high')).length).toBe(1);
});

/* ---------- level 9 ---------- */

test('level 9: two things in a row: landing from the first is standing at the second, with no step, and the second move is asked for at once; level 8 has none', async ({ page }) => {
  await reachPlay(page, atLevel(8, GENTLE));
  expect((await state(page)).course.some(({ paired }) => paired)).toBe(false);
  await nowAtLevel(page, 9);
  await listen(page);
  let now = await state(page);
  const pair = now.course.findIndex(({ paired }) => paired);
  expect(pair).toBeGreaterThanOrEqual(0);
  const [first, second] = [now.course[pair], now.course[pair + 1]];
  expect(second.at - (first.at + first.wide)).toBeCloseTo(1.2, 6);
  await walkUpTo(page, `(thing) => thing.index === ${pair}`);
  // Both on the screen at once.
  const drawn = [await drawnBox(page, 'drawThing', pair) ?? await drawnBox(page, 'drawInFront', pair), await drawnBox(page, 'drawThing', pair + 1) ?? await drawnBox(page, 'drawInFront', pair + 1)];
  expect(drawn.every(Boolean)).toBe(true);
  expect(drawn[1].left).toBeGreaterThan(drawn[0].left);
  const steps = (await state(page)).stats.steps;
  await getPast(page);
  now = await state(page);
  expect(now.station?.index).toBe(pair + 1);
  expect(now.hero.x).toBeCloseTo(second.at - 0.6, 6);
  expect(now.stats.steps).toBe(steps);
  const wanted = second.needs === 'squat' ? ['squat', 'Bend your knees!'] : second.kind === 'spring' ? ['starJump', 'Do a star jump!'] : ['jump', 'Jump!'];
  await expect(coachText(page)).toHaveText(wanted[1]);
  expect((await state(page)).film).toBe(wanted[0]);
  // A hedgehog or the bees start coming as soon as the character is there.
  if (second.fuse !== undefined) expect(now.station.left).toBeLessThanOrEqual(second.fuse);
  await getPast(page);
  expect((await state(page)).course[pair + 1].state).toBe('cleared');
});

/* ---------- level 10 ---------- */

/** The gold drawn about the magpie's tree, at the end of the path, with only the land and what's in the tree. */
const goldInTheTree = async (page) => {
  const { end, metre, ground } = await state(page);
  const x = await across(page, end + 1.6);
  return colourIn(page, { left: x - metre * 2.5, right: x + metre * 2.5, top: ground - metre * 5.5, bottom: ground }, [255, 210, 63], {
    near: 45,
    without: ['drawHero', 'drawMagpie', 'drawEffects', 'drawPathStar', 'drawThing', 'drawInFront', 'drawAppleTree'],
  });
};

/** Taken on to the end of the path, as marching would: the magpie is caught up at its tree. */
const winHere = async (page) => {
  await bringToTheEnd(page, 1.5);
  await page.evaluate(() => {
    const { chase } = window.__game;
    chase.step('left');
    chase.step('right');
  });
  await waitForScreen(page, 'finish');
  return { ...(await state(page)), cups: await page.evaluate(() => window.__cups ?? 0) };
};

test('level 10: catching the magpie up at its tree wins the cup, and the card says so, with all ten levels done; winning level 9 does not', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, atLevel(9, { ...GENTLE, chaseLength: 8 }));
  await page.evaluate(() => {
    const { sound } = window.__game;
    window.__cups = 0;
    const cup = sound.cup.bind(sound);
    sound.cup = () => {
      window.__cups += 1;
      cup();
    };
  });
  let end = await winHere(page);
  expect([end.stats.cup, end.cups]).toEqual([false, 0]);
  await expect(page.locator('#finish-prizes')).not.toContainText(/cup/i);
  await expect(page.locator('#level-next-new')).toContainText('The cup is in the magpie’s tree');
  await expect(page.locator('#chase-again')).toHaveText('Next level');
  await page.locator('#chase-again').click();
  await waitForScreen(page, 'playing');
  expect((await state(page)).level).toBe(10);
  await listen(page);
  end = await winHere(page);
  expect([end.stats.cup, end.cups]).toEqual([true, 1]);
  expect((await heard(page)).map(({ type }) => type).slice(-2)).toEqual(['cup', 'won']);
  await expect(page.locator('#finish-prizes')).toContainText(/the cup is won/i);
  await expect(page.locator('#level-done-text')).toHaveText('All 10 levels done!');
  await shot(page, 'hat-cup');
});

test('level 10: the cup is drawn in the magpie’s tree, where the card says it is; at level 9 there is none', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, atLevel(9, { ...GENTLE, chaseLength: 8 }));
  await bringToTheEnd(page, 1.5);
  const nine = await goldInTheTree(page);
  await reopenWith(page, atLevel(10, { ...GENTLE, chaseLength: 8 }));
  await playAgain(page);
  expect((await state(page)).level).toBe(10);
  await bringToTheEnd(page, 1.5);
  const ten = await goldInTheTree(page);
  await shot(page, 'hat-cup-tree');
  console.log('gold drawn about the magpie’s tree: at level 9', nine, 'and at level 10', ten);
  expect(nine).toBeLessThan(5);
  expect(ten, 'the cup is drawn in the magpie’s tree at level 10').toBeGreaterThan(40);
});
