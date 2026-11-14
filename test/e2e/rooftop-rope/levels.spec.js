// Rooftop Rope's ten levels, in the real page: what each one brings is named on the title card and under the
// countdown, comes along and works in the real game, and nothing flashes, at level 1 or at level 10 with all of
// it about. The child is played by a script, whose foot goes where the rope asks and is never quite still.
import { childFeet, childWalks, expect, expectSoon, heard, judge, labelShown, listen, openRope, putBefore, reachPlay, reachWarmup, shot, state, stopChild, test, waitForScreen, watchBrightness } from './helpers.js';

const atLevel = (level, settings = {}) => ({ levels: { 'rooftop-rope': level }, ropeCount: 4, ropeHold: 'short', ...settings });
const other = (leg) => (leg === 'left' ? 'right' : 'left');

const NEW = {
  2: 'Gold stars',
  3: 'Balloons: lift higher to pop them',
  4: 'A little bird to carry across',
  5: 'A change of legs half way',
  6: 'A crossing light: rest on red',
  7: 'A rope that climbs',
  8: 'The long rope, with a post to rest on',
  9: 'Gusts of wind',
  10: 'The cup, on the last rooftop',
};

/** How far along its rope the walker gets in so many seconds, as a share of the rope. */
const glidesIn = async (page, seconds) => {
  const from = (await state(page)).progress;
  await page.waitForTimeout(seconds * 1000);
  return (await state(page)).progress - from;
};

test('the title card says what each level brings that\'s new, and level 1 has nothing new to say', async ({ page }) => {
  await openRope(page);
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

test('what a level brings is named under the countdown, in Georgian too, and the sky changes as the levels go up', async ({ page }) => {
  await reachWarmup(page, atLevel(5, { language: 'ka' }));
  await page.locator('#warm-skip').click();
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-new-now')).toContainText('ფეხის შეცვლა შუა გზაზე');
  await expect(page.locator('#level-new-now')).toContainText('ახალი:');
  // Morning at the bottom of the levels, the middle of the day here, and sunset at the top.
  const skies = await page.evaluate(() => [1, 5, 8, 10].map((level) => window.__game.world.skyFor(level).sky.low));
  expect(new Set(skies).size).toBe(4);
});

test('level 1 is the plain rope: nothing on it, and no prizes to count', async ({ page }) => {
  await reachPlay(page, atLevel(1));
  const { plan, level } = await state(page);
  expect(level).toBe(1);
  expect(plan.ropes).toHaveLength(4);
  expect(plan.ropes.every(({ kinds, long, climb }) => kinds.length === 0 && !long && !climb)).toBe(true);
  await expect(page.locator('#prizes-chip')).toBeHidden();
});

test('level 2: gold stars along every rope, caught as the walker glides past and counted at the end', async ({ page }) => {
  test.setTimeout(180_000);
  await reachPlay(page, atLevel(2));
  await listen(page);
  const { plan } = await state(page);
  expect(plan.stars).toBe(12);
  expect(plan.ropes.every(({ kinds }) => kinds.join() === 'star,star,star')).toBe(true);
  await childWalks(page);
  await expectSoon(async () => (await state(page)).stats.stars).toBeGreaterThanOrEqual(1);
  expect(await labelShown(page, 'star')).toBe(true);
  await expect(page.locator('#prizes-chip')).toBeVisible();
  await expect(page.locator('#prizes')).toContainText('⭐ 1');
  // The star that was caught is no longer on the rope.
  expect(await page.evaluate(() => window.__game.world.items.filter(({ thing, gone }) => thing.kind === 'star' && gone).length)).toBeGreaterThanOrEqual(1);
  await shot(page, 'rope-level-2');
  await waitForScreen(page, 'finish');
  expect(await heard(page)).toContain('star');
  await expect(page.locator('#finish-prizes')).toHaveText('Caught 12 of 12 stars.');
  await stopChild(page);
});

test('level 3: a balloon pops for a foot held higher than a whole lift, and one that is missed costs nothing', async ({ page }) => {
  // Long ropes, so that there's time between one balloon and the next to lift higher.
  await reachPlay(page, atLevel(3, { ropeHold: 'long' }));
  await listen(page);
  const { plan, asked } = await state(page);
  expect(plan.ropes[0].kinds).toContain('balloon');
  expect(plan.balloons).toBeGreaterThanOrEqual(2);
  // A whole lift, and no more: the first balloon goes by overhead. "Higher!" is asked for as it comes.
  await childWalks(page, { fixed: { foot: asked, share: 1 } });
  await putBefore(page, 'balloon', { before: 0.1 });
  await expect(page.locator('#prompt-text')).toHaveText('Higher!');
  await expectSoon(async () => (await heard(page)).includes('missed')).toBe(true);
  expect((await state(page)).stats.balloons).toBe(0);
  expect(await labelShown(page, 'balloon')).toBe(true);
  // Higher for the next one, and it pops.
  await childFeet(page, { foot: asked, share: 1.5 });
  await expectSoon(async () => (await state(page)).stats.balloons).toBe(1);
  expect(await heard(page)).toContain('pop');
  await expect(page.locator('#prizes')).toContainText('🎈 1');
  await shot(page, 'rope-level-3');
  // Missing one cost nothing: no wobble, no fall, and the walker went on.
  const now = await state(page);
  expect([now.stats.falls, now.wobble]).toEqual([0, 0]);
  await stopChild(page);
});

test('level 4: a little bird rides across for as long as the foot stays up, and leaves a feather at the end', async ({ page }) => {
  await reachPlay(page, atLevel(4, { ropeFall: 'never' }));
  await listen(page);
  const { plan, asked } = await state(page);
  expect(plan.ropes[0].kinds).toContain('bird');
  await childWalks(page, { fixed: { foot: asked, share: 1.05 } });
  await expectSoon(async () => (await state(page)).bird?.on).toBe(true);
  expect(await labelShown(page, 'bird')).toBe(true);
  // The bird is on the walker's head.
  await expectSoon(async () => page.evaluate(() => {
    const { world } = window.__game;
    const bird = world.items.find(({ thing }) => thing.kind === 'bird');
    return bird.riding === true && Math.abs(bird.object.position.z - world.walker.root.position.z) < 0.6;
  })).toBe(true);
  await shot(page, 'rope-level-4');
  // The foot put down for a moment: the bird flies off, and there's no feather for this rope.
  await childFeet(page, null);
  await expectSoon(async () => (await heard(page)).includes('bird-off')).toBe(true);
  expect((await state(page)).bird).toEqual({ on: false, lost: true });
  await childFeet(page, { foot: asked, share: 1.05 });
  await expectSoon(async () => (await state(page)).stats.crossed).toBe(1);
  expect((await state(page)).stats.feathers).toBe(0);
  // On the next rope with a bird, the foot stays up all the way, and the bird leaves its feather.
  await childFeet(page, 'follow');
  const put = await putBefore(page, 'bird', { before: 0.1 });
  expect(put).not.toBe(null);
  await expectSoon(async () => (await state(page)).stats.feathers, { timeout: 30_000 }).toBe(1);
  expect(await heard(page)).toContain('feather');
  await expect(page.locator('#prizes')).toContainText('🪶 1');
  await stopChild(page);
});

test('level 5: half way along, a flag where the legs change, and the walker waits there for the other foot', async ({ page }) => {
  await reachPlay(page, atLevel(5, { ropeFall: 'never' }));
  await listen(page);
  const first = await state(page);
  expect(first.plan.ropes[0].kinds).toContain('swap');
  const foot = first.asked;
  await childWalks(page, { fixed: { foot, share: 1.05 } });
  await expectSoon(async () => (await heard(page)).includes('swap')).toBe(true);
  expect(await labelShown(page, 'swap')).toBe(true);
  // The foot that got it here is still up, and it's the other one that's wanted now.
  await page.waitForTimeout(1500);
  let now = await state(page);
  expect(now.progress).toBeCloseTo(0.5, 5);
  expect(now.leg).toBe(other(foot));
  expect(now.hint).toBe('other');
  await expect(page.locator('#prompt-text')).toHaveText('Now the other foot!');
  await expect(page.locator('#feet')).toHaveAttribute('data-ask', other(foot));
  await shot(page, 'rope-level-5');
  await childFeet(page, { foot: other(foot), share: 1.05 });
  await expectSoon(async () => (await state(page)).stats.crossed).toBe(1);
  now = await state(page);
  expect(now.stats.holds[foot]).toBeGreaterThanOrEqual(1);
  expect(now.stats.holds[other(foot)]).toBeGreaterThanOrEqual(1);
  await stopChild(page);
});

test('level 6: at a red light the walker waits, standing there does not wobble, and a foot put down is a rest well taken', async ({ page }) => {
  await reachPlay(page, atLevel(6, { ropeFall: 'soon' }));
  await listen(page);
  const { plan, asked } = await state(page);
  expect(plan.ropes[0].kinds).toContain('light');
  // Held up all the way: the walker still stops at the light, and waits for green with the foot up.
  await childWalks(page, { fixed: { foot: asked, share: 1.05 } });
  await expectSoon(async () => (await heard(page)).includes('red')).toBe(true);
  expect(await labelShown(page, 'light')).toBe(true);
  let now = await state(page);
  expect(now.progress).toBeCloseTo(0.5, 5);
  expect(now.hint).toBe('rest');
  expect(now.stats.rests).toBe(0);
  // The foot comes down: that's the rest, and it's counted. Nothing wobbles while the light is red.
  await childFeet(page, null);
  await expect(page.locator('#prompt-text')).toHaveText('Foot down, and have a rest.');
  await expect(page.locator('#feet')).toHaveAttribute('data-ask', 'none');
  // The lamp that's lit is the red one.
  expect(await page.evaluate(() => window.__game.world.items.find(({ thing }) => thing.kind === 'light').red)).toBe(true);
  await expectSoon(async () => (await state(page)).stats.rests).toBe(1);
  expect(await heard(page)).toContain('rested');
  now = await state(page);
  expect(now.wobble).toBe(0);
  await shot(page, 'rope-level-6');
  await expectSoon(async () => (await heard(page)).includes('green')).toBe(true);
  expect(await page.evaluate(() => window.__game.world.items.find(({ thing }) => thing.kind === 'light').red)).toBe(false);
  // Green: the foot is asked for again, and on the walker goes.
  await expect(page.locator('#prompt-text')).toHaveText(`Lift your ${asked} foot!`);
  await childFeet(page, { foot: asked, share: 1.05 });
  await expectSoon(async () => (await state(page)).stats.crossed).toBe(1);
  expect((await state(page)).stats.falls).toBe(0);
  await stopChild(page);
});

test('level 7: a rope that climbs to a much higher rooftop, where a foot only just up hardly moves the walker', async ({ page }) => {
  await reachPlay(page, atLevel(7, { ropeFall: 'never' }));
  const { plan, asked } = await state(page);
  expect(plan.ropes[0].climb).toBe(true);
  const flat = plan.ropes.findIndex(({ climb, long }) => !climb && !long);
  expect(flat).toBeGreaterThan(0);
  // It climbs: several metres up to the next rooftop, against a metre or so for the others.
  const rise = await page.evaluate((level) => {
    const { ropes } = window.__game.world.place;
    return { climb: ropes[0].to.y - ropes[0].from.y, flat: ropes[level].to.y - ropes[level].from.y };
  }, flat);
  expect(rise.climb).toBeGreaterThan(5);
  expect(rise.flat).toBeLessThan(2.5);
  // A foot only just up, on the climb and then on a level rope.
  await childWalks(page, { fixed: { foot: asked, share: 0.55 } });
  await expectSoon(async () => (await state(page)).gliding).toBe(true);
  expect(await labelShown(page, 'climb')).toBe(true);
  const slow = await glidesIn(page, 2);
  await shot(page, 'rope-level-7');
  // A whole lift takes the climb at the same pace as any rope.
  await childFeet(page, { foot: asked, share: 1.05 });
  await page.waitForTimeout(700);
  const quick = await glidesIn(page, 1.5);
  const level = plan.ropes[flat];
  await putBefore(page, flat, { at: 0.05, before: 0 });
  await childFeet(page, { foot: level.leg, share: 0.55 });
  await expectSoon(async () => (await state(page)).gliding).toBe(true);
  const onLevel = await glidesIn(page, 2);
  console.log(`a foot just up: ${slow.toFixed(3)} of the climb in 2 seconds, ${onLevel.toFixed(3)} of a level rope. A whole lift: ${quick.toFixed(3)} of the climb in 1.5`);
  expect(slow).toBeGreaterThan(0.02);
  expect(slow).toBeLessThan(onLevel * 0.7);
  expect(quick / 1.5).toBeGreaterThan((slow / 2) * 2.2);
  await stopChild(page);
});

test('level 8: the long rope takes twice as long, and its post half way is somewhere to put the foot down', async ({ page }) => {
  await reachPlay(page, atLevel(8, { ropeFall: 'soon' }));
  await listen(page);
  const { plan } = await state(page);
  // The one before last, so there's a short one after it to finish on.
  expect(plan.ropes.map(({ long }) => long)).toEqual([false, false, true, false]);
  expect(plan.ropes[2].seconds).toBeCloseTo(plan.ropes[1].seconds * 2, 5);
  expect(plan.ropes[2].kinds).toContain('post');
  await childWalks(page);
  await putBefore(page, 'long', { before: 0.08 });
  await expectSoon(async () => (await heard(page)).includes('post')).toBe(true);
  expect(await labelShown(page, 'long')).toBe(true);
  // Foot down at the post: longer than a walker on the rope would have, and nothing wobbles.
  await childFeet(page, null);
  await page.waitForTimeout(7000);
  const now = await state(page);
  expect(now.atPost).toBe(true);
  expect(now.progress).toBeCloseTo(0.5, 2);
  expect([now.state, now.wobble, now.stats.falls]).toEqual(['rope', 0, 0]);
  await shot(page, 'rope-level-8');
  // And on from there, with its four stars.
  await childFeet(page, 'follow');
  await expectSoon(async () => (await state(page)).index, { timeout: 30_000 }).toBe(3);
  await stopChild(page);
});

test('level 9: in a gust of wind the walker is slowed to a third, so the foot is held for longer', async ({ page }) => {
  await reachPlay(page, atLevel(9, { ropeFall: 'never' }));
  await listen(page);
  const { plan, asked } = await state(page);
  expect(plan.ropes[0].kinds).toContain('gust');
  await childWalks(page, { fixed: { foot: asked, share: 1.05 } });
  await expectSoon(async () => (await state(page)).progress).toBeGreaterThan(0.08);
  const before = await glidesIn(page, 0.6);
  await expectSoon(async () => (await state(page)).inGust).toBe(true);
  expect(await heard(page)).toContain('gust');
  expect(await labelShown(page, 'gust')).toBe(true);
  const inWind = await glidesIn(page, 1.2);
  await shot(page, 'rope-level-9');
  console.log(`out of the wind ${(before / 0.6).toFixed(3)} of the rope a second, in it ${(inWind / 1.2).toFixed(3)}`);
  expect(inWind / 1.2).toBeLessThan((before / 0.6) * 0.5);
  expect(inWind / 1.2).toBeGreaterThan((before / 0.6) * 0.15);
  // Through it, and across.
  await expectSoon(async () => (await state(page)).stats.crossed, { timeout: 30_000 }).toBe(1);
  await stopChild(page);
});

test('level 10: the cup is on the last rooftop, and is won by getting there', async ({ page }) => {
  await reachPlay(page, atLevel(10));
  await listen(page);
  expect(await page.evaluate(() => Boolean(window.__game.world.cup))).toBe(true);
  await childWalks(page);
  await putBefore(page, 'last', { at: 0.7, before: 0 });
  await expectSoon(async () => (await state(page)).progress).toBeGreaterThan(0.75);
  expect(await labelShown(page, 'cup')).toBe(true);
  await shot(page, 'rope-level-10');
  await waitForScreen(page, 'finishing');
  expect(await heard(page)).toEqual(expect.arrayContaining(['cup', 'finished']));
  await waitForScreen(page, 'finish');
  expect((await state(page)).stats.cup).toBe(true);
  await expect(page.locator('#finish-prizes')).toContainText('won the cup');
  // The last level: there's nothing more to come.
  await expect(page.locator('#level-next-new')).toBeEmpty();
  await stopChild(page);
});

test('a level makes a rope take a little longer, and nothing quicker: there is as long to get the foot up at level 10 as at level 1', async ({ page }) => {
  await openRope(page);
  const rules = (level) => page.evaluate((at) => import('./walk.js').then(({ layOut, WALK, WOBBLES }) => {
    const plan = layOut({ level: at, ropes: 6, hold: 'medium' });
    return { seconds: Math.min(...plan.ropes.map(({ seconds }) => seconds)), on: WALK.on, falls: WOBBLES.later };
  }), level);
  const [first, last] = [await rules(1), await rules(10)];
  expect(first.seconds).toBe(5);
  expect(last.seconds).toBeCloseTo(6.5, 5);
  expect([last.on, last.falls]).toEqual([first.on, first.falls]);
});

for (const level of [1, 10]) {
  test(`nothing flashes at level ${level}: gliding along the ropes, over the rooftops and past whatever is on them, the brightness stays steady`, async ({ page }) => {
    test.setTimeout(300_000);
    await reachPlay(page, atLevel(level, { ropeCount: 6 }));
    await childWalks(page);
    // From the first rooftop: setting off, and onto the rope.
    const start = judge(await watchBrightness(page, 300));
    console.log(`level ${level} setting off`, JSON.stringify(start));
    expect(start.biggestStep).toBeLessThan(4);
    expect(start.flickeringShare).toBeLessThan(0.01);
    // Fifteen seconds or more of it: along a rope, onto a rooftop, across it and onto the next.
    const reading = judge(await watchBrightness(page, 900));
    console.log(`level ${level} on the ropes`, JSON.stringify(reading));
    expect(reading.biggestStep).toBeLessThan(4);
    expect(reading.flickeringShare).toBeLessThan(0.01);
    expect((await state(page)).stats.crossed).toBeGreaterThanOrEqual(1);
    await stopChild(page);
  });
}

test('nothing flashes when the walker drops into the net for the last time, stays there, and the card comes', async ({ page }) => {
  test.setTimeout(300_000);
  await reachPlay(page, atLevel(10, { ropeFall: 'soon', ropeDrops: 'three' }));
  await childWalks(page);
  await expectSoon(async () => (await state(page)).progress).toBeGreaterThan(0.4);
  // Two drops already had, so this is the one it doesn't come back up from.
  await page.evaluate(() => {
    window.__game.walk.stats.falls = 2;
  });
  await childFeet(page, null);
  await expectSoon(async () => (await state(page)).wobble, { timeout: 20_000 }).toBeGreaterThan(0.7);
  // The wobble, the drop, the bounce, sitting in the net, and the camera coming down to it as the card comes.
  const last = judge(await watchBrightness(page, 600));
  console.log('into the net for the last time', JSON.stringify(last));
  expect(last.biggestStep).toBeLessThan(4);
  expect(last.flickeringShare).toBeLessThan(0.01);
  const now = await state(page);
  expect([now.state, now.screen, now.stats.falls]).toEqual(['lost', 'finish', 3]);
  await stopChild(page);
});

test('nothing flashes when the walker drops into the net and comes back, or at the last rooftop', async ({ page }) => {
  test.setTimeout(300_000);
  await reachPlay(page, atLevel(10, { ropeFall: 'soon' }));
  await childWalks(page);
  await expectSoon(async () => (await state(page)).progress).toBeGreaterThan(0.4);
  // Both feet down: the wobble, the drop into the net, the bounce, and back up on the rooftop.
  await childFeet(page, null);
  await expectSoon(async () => (await state(page)).wobble, { timeout: 20_000 }).toBeGreaterThan(0.7);
  const fall = judge(await watchBrightness(page, 420));
  console.log('into the net and back', JSON.stringify(fall));
  expect(fall.biggestStep).toBeLessThan(4);
  expect(fall.flickeringShare).toBeLessThan(0.01);
  expect((await state(page)).stats.falls).toBe(1);
  // The last rope, the cup, the cheering, and the card.
  await childFeet(page, 'follow');
  await putBefore(page, 'last', { at: 0.55, before: 0 });
  await page.waitForTimeout(400);
  const top = judge(await watchBrightness(page, 480));
  console.log('the last rooftop', JSON.stringify(top));
  expect(top.biggestStep).toBeLessThan(4);
  expect(top.flickeringShare).toBeLessThan(0.01);
  expect(['finishing', 'finish']).toContain((await state(page)).screen);
  await stopChild(page);
});
