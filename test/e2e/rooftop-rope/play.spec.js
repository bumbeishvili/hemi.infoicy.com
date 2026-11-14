// Rooftop Rope, played in the real page. A person filmed standing, and lifting one foot and then the other, is
// in front of the real tracker. Where a test is about the rules and not the tracker, the child is played by a
// script whose feet go where the tracker's reading does.
import { childFeet, childWalks, expect, expectSoon, footBehind, footUp, heard, listen, openRope, putBefore, reachPlay, reachWarmup, readsAs, shot, standing, standsFrom, state, stopChild, test, toChoosing, waitForScreen } from './helpers.js';

const short = (settings = {}) => ({ ropeCount: 4, ropeHold: 'short', ...settings });

test('what to do is asked for and shown: a way back to all the games, a walker to choose, and a film of the lift', async ({ page }) => {
  await openRope(page);
  await expect(page.locator('h1')).toHaveText('Rooftop Rope');
  await expect(page.locator('#screen-welcome .all-games')).toHaveAttribute('href', '../../index.html');
  await expect(page.locator('#start')).toHaveText('Choose your walker');
  // Standing on one leg, a child can lose their balance, and the grown-up is told so before anything else.
  await expect(page.locator('#screen-welcome')).toContainText('put a steady chair or a wall within reach');
  // The walker is beside the title card, not behind it.
  expect((await state(page)).view).toBe('title');
  await standing(page);
  await toChoosing(page);
  await expect(page.locator('.fighter-card')).toHaveCount(10);
  await expect(page.locator('#chosen-name')).toHaveText('Giraffe');
  await page.locator('.fighter-card[data-fighter="kit"]').click();
  await expect(page.locator('#chosen-name')).toHaveText('Kit');
  expect(await page.evaluate(() => window.__game.world.walker.spec.id)).toBe('kit');
  await page.locator('#rope-start').click();
  await waitForScreen(page, 'warmup');
  // The warm-up asks for one foot, in words, with the character showing it, and which foot is marked.
  await expect(page.locator('#coach')).toHaveClass(/is-visible/);
  await expect(page.locator('#coach-text')).toHaveText(/Lift your (left|right) foot high, and hold it!/);
  const side = (await state(page)).warmSide;
  await expect(page.locator('#feet')).toHaveAttribute('data-ask', side);
  await expect(page.locator('#rope-meter')).toBeVisible();
  await expect(page.locator('#warm-skip')).toBeVisible();
  await shot(page, 'rope-warmup');
});

test('through the real tracker: a person lifting a foot is read as that foot up, by about how high it is', async ({ page }) => {
  await reachWarmup(page, { hands: 'left' });
  const dot = () => page.locator('#meter-dot').evaluate((mark) => parseFloat(mark.style.bottom));
  // The warm-up is asking for the left foot. The right one up is copied by the walker on the screen, and its
  // footprint is lit, but the meter, which is for the foot being asked for, stays down.
  expect((await state(page)).warmSide).toBe('left');
  await footUp(page, 'right', 30);
  await expectSoon(async () => (await state(page)).walker.right).toBeGreaterThan(0.15);
  expect((await state(page)).walker.left).toBeLessThan(0.02);
  await expect(page.locator('#feet')).toHaveAttribute('data-up', 'right');
  expect(await dot()).toBeLessThan(20);
  // The left one: the walker lifts its left, and the meter's dot goes up into the green.
  await footUp(page, 'left', 30);
  await expectSoon(async () => (await state(page)).walker.left).toBeGreaterThan(0.15);
  expect((await state(page)).walker.right).toBeLessThan(0.02);
  await expect(page.locator('#feet')).toHaveAttribute('data-up', 'left');
  await expectSoon(dot).toBeGreaterThan(60);
  await expect(page.locator('#rope-meter')).toHaveAttribute('data-zone', 'up');
  // From here the warm-up is held where it is, so that it doesn't move on while the feet are read.
  await page.evaluate(() => {
    window.__game.warmup.update = () => {};
  });
  const read = async (foot, centimetres) => {
    await footUp(page, foot, centimetres);
    await page.waitForTimeout(900);
    return (await state(page)).raw;
  };
  await standing(page);
  await page.waitForTimeout(900);
  expect(Math.abs((await state(page)).raw)).toBeLessThan(0.02);
  // The right foot higher is more than nothing, and the left less: each by about what this person's feet read as.
  for (const [foot, centimetres] of [['right', 15], ['right', 30], ['right', 42], ['left', 15], ['left', 30], ['left', 42]]) {
    const seen = await read(foot, centimetres);
    console.log(`the ${foot} foot ${centimetres} cm up was read as ${seen.toFixed(3)} of the body's height`);
    expect(Math.sign(seen)).toBe(foot === 'right' ? 1 : -1);
    expect(Math.abs(Math.abs(seen) - readsAs(centimetres))).toBeLessThan(0.035);
  }
});

test('through the real tracker: the warm-up measures how high the child lifts each foot, each by itself', async ({ page }) => {
  await reachWarmup(page, { hands: 'left' });
  // The foot of the side being worked on comes first: here, the left. This child lifts the right less high.
  expect((await state(page)).warmSide).toBe('left');
  await expect(page.locator('#coach-text')).toHaveText('Lift your left foot high, and hold it!');
  await footUp(page, 'left', 36);
  await page.waitForTimeout(1700);
  await standing(page);
  await expectSoon(async () => (await state(page)).warmSide).toBe('right');
  await expect(page.locator('#coach-text')).toHaveText('Lift your right foot high, and hold it!');
  await footUp(page, 'right', 15);
  await page.waitForTimeout(1700);
  await standing(page);
  await waitForScreen(page, 'countdown');
  const { best, reach } = await state(page);
  console.log('the warm-up measured', JSON.stringify({ best, reach }));
  expect(Math.abs(best.left - readsAs(36))).toBeLessThan(0.035);
  expect(Math.abs(best.right - readsAs(15))).toBeLessThan(0.035);
  // A whole lift is most of what they managed, and no more than the setting: 11% of their height.
  expect(reach.left).toBeCloseTo(0.11, 5);
  expect(reach.right).toBeCloseTo(best.right * 0.85, 5);
  expect(reach.right).toBeLessThan(0.1);
});

test('through the real tracker, with the footage playing: each foot lifted and held is measured, and that is the warm-up done', async ({ page }) => {
  await reachWarmup(page, { hands: 'right' });
  expect((await state(page)).warmSide).toBe('right');
  // The right foot up and held, down, the left up and held, and down.
  await standsFrom(page, 20);
  await waitForScreen(page, 'countdown');
  const { best } = await state(page);
  console.log('the warm-up measured the holds as', JSON.stringify(best));
  for (const side of ['left', 'right']) expect(Math.abs(best[side] - readsAs(30))).toBeLessThan(0.035);
});

test('a kick in the warm-up measures nothing, and skipping it leaves a whole lift small', async ({ page }) => {
  await reachWarmup(page, { ropeLift: 'big' });
  const { warmSide } = await state(page);
  await footUp(page, warmSide, 36);
  await page.waitForTimeout(350);
  await standing(page);
  await page.waitForTimeout(1500);
  expect((await state(page)).warmSide).toBe(warmSide);
  expect((await state(page)).best[warmSide]).toBe(null);
  await page.locator('#warm-skip').click();
  await waitForScreen(page, 'countdown');
  const { reach, best } = await state(page);
  expect(best).toEqual({ left: null, right: null });
  // Not the 17% of the setting: 7%, as nobody knows how high this child's foot goes.
  expect(reach.left).toBeCloseTo(0.07, 5);
  expect(reach.right).toBeCloseTo(0.07, 5);
});

test('through the real tracker: lifting the foot the rope asks for glides the walker along it, and putting it down stops it there, wobbling', async ({ page }) => {
  await reachPlay(page, short({ ropeFall: 'later' }));
  let now = await state(page);
  expect([now.state, now.index, now.progress]).toEqual(['roof', 0, 0]);
  const asked = now.asked;
  // What to do is asked for, with the film of it, and the footprint to lift is the bright one.
  await expect(page.locator('#prompt-text')).toHaveText(`Lift your ${asked} foot!`);
  await expect(page.locator('#coach')).toHaveClass(/is-visible/);
  await expect(page.locator('#feet')).toHaveAttribute('data-ask', asked);
  // On the rooftop it's on its own two feet: its wheel is put away.
  expect([now.walker.wheelSeen, now.walker.up]).toEqual([false, 0]);
  await footUp(page, asked, 30);
  await expectSoon(async () => (await state(page)).state).toBe('rope');
  await expectSoon(async () => (await state(page)).progress).toBeGreaterThan(0.25);
  now = await state(page);
  expect(now.gliding).toBe(true);
  expect(now.foot).toBe(asked);
  expect(now.wobble).toBe(0);
  // On the rope it's up on its one wheel, which has turned as far as it has come: forwards, about a turn for
  // every two metres.
  expect(now.walker.wheelSeen).toBe(true);
  expect(now.walker.onWheel).toBeGreaterThan(0.95);
  expect(now.walker.up).toBeCloseTo(0.8, 1);
  expect(now.walker.rolled).toBeLessThan(-12);
  const turned = now.walker.rolled;
  await expectSoon(async () => (await state(page)).walker.rolled).toBeLessThan(turned - 3);
  await expect(page.locator('#feet')).toHaveAttribute('data-up', asked);
  await expect(page.locator('#rope-meter')).toHaveAttribute('data-zone', 'up');
  // Nothing is asked of a child who's doing it.
  await expect(page.locator('#prompt')).not.toHaveClass(/is-visible/);
  await shot(page, 'rope-gliding');
  // Both feet down: the walker stops where it is, and starts to wobble, and the bar along the top fills.
  await standing(page);
  await expectSoon(async () => (await state(page)).gliding).toBe(false);
  const stopped = (await state(page)).progress;
  await expectSoon(async () => (await state(page)).wobble).toBeGreaterThan(0.2);
  expect((await state(page)).progress).toBeCloseTo(stopped, 3);
  // Its wheel rocks from side to side under it, and turns no further along the rope.
  const still = (await state(page)).walker.rolled;
  await expectSoon(async () => Math.abs((await state(page)).walker.tip)).toBeGreaterThan(0.01);
  expect((await state(page)).walker.rolled).toBeCloseTo(still, 2);
  await expect(page.locator('#wobble')).toHaveAttribute('data-wobbling', 'true');
  expect(await page.locator('#wobble-fill').evaluate((fill) => parseFloat(fill.style.width))).toBeGreaterThan(15);
  await expect(page.locator('#prompt-text')).toHaveText(`Lift your ${asked} foot!`);
  // Up again: steady again, and on to the rooftop, where the rope is counted.
  await footUp(page, asked, 30);
  await expectSoon(async () => (await state(page)).wobble).toBe(0);
  await expectSoon(async () => (await state(page)).stats.crossed).toBe(1);
  await expect(page.locator('#ropes-done')).toHaveText('1');
  await expect(page.locator('#ropes-all')).toHaveText('4');
  expect((await state(page)).stats.falls).toBe(0);
  // Off the rope, the walker walks across the rooftop by itself to where the next rope starts, foot up or not.
  await standing(page);
  await expectSoon(async () => (await state(page)).state).toBe('roof');
  const spot = await page.evaluate(() => {
    const { world } = window.__game;
    const { x, y, z } = world.spotOn(1);
    return { x, y, z, end: world.place.ropes[0].to.z };
  });
  await expectSoon(async () => Math.abs((await state(page)).walker.z - spot.z)).toBeLessThan(0.3);
  // That's the far side of the rooftop from where the first rope came in.
  expect(spot.end - spot.z).toBeGreaterThan(4);
  // And off its wheel, which is put away again.
  await expectSoon(async () => (await state(page)).walker.wheelSeen).toBe(false);
  expect((await state(page)).walker.up).toBeLessThan(0.05);
});

test('through the real tracker: a foot put down on the floor behind the other is not a lifted foot, and the walker stays on its rooftop', async ({ page }) => {
  await reachPlay(page, short());
  // Further off, the camera sees that foot a little higher in the picture. It isn't off the floor.
  for (const side of ['right', 'left']) {
    for (const centimetres of [20, 25]) {
      await footBehind(page, side, centimetres);
      await page.waitForTimeout(1600);
      const now = await state(page);
      console.log(`the ${side} foot ${centimetres} cm behind was read as ${now.raw.toFixed(3)} of the body's height, past level`);
      expect(now.gliding).toBe(false);
      expect([now.state, now.progress, now.foot]).toEqual(['roof', 0, null]);
      expect(Math.abs(now.raw)).toBeLessThan(0.035);
    }
    await standing(page);
    await page.waitForTimeout(900);
  }
  // The foot the rope asks for, lifted, still goes: nothing about level has been lost.
  const { asked } = await state(page);
  await footUp(page, asked, 30);
  await expectSoon(async () => (await state(page)).progress).toBeGreaterThan(0.2);
});

test('with both feet down on the rope for too long, the walker drops slowly into the net and starts that rope again, with the stars it had', async ({ page }) => {
  await reachPlay(page, short({ ropeFall: 'soon', levels: { 'rooftop-rope': 2 } }));
  await listen(page);
  // A foot held half way up, so the walker goes slowly, and a child who's quick to put it down: on a busy
  // computer the walker would otherwise be past the third star before the foot was seen to be down.
  await childWalks(page, { share: 0.5, late: 0.1 });
  // Two of this rope's three stars, and then both feet down.
  await expectSoon(async () => (await state(page)).stats.stars).toBe(2);
  await childFeet(page, null);
  const before = await state(page);
  expect(before.stats.stars).toBe(2);
  expect(before.progress).toBeLessThan(0.7);
  await expectSoon(async () => (await state(page)).state, { timeout: 20_000 }).toBe('falling');
  // The camera looks down after it, and the walker is on its way down to the net, not gone: well below the
  // rope, whole, and without the wheel it was up on. Looked for all the way down, as a busy computer can be
  // late for any one moment of it.
  expect(before.walker.onWheel).toBeGreaterThan(0.95);
  let falling = null;
  await expectSoon(async () => {
    falling = await state(page);
    return falling.state === 'falling' && falling.walker.y < before.walker.y - 3 && falling.walker.size > 0.9;
  }, { timeout: 10_000 }).toBe(true);
  expect(falling.walker.wheelSeen).toBe(false);
  await shot(page, 'rope-net');
  // Back on the rooftop that rope starts from, with nothing lost but the way along it.
  await expectSoon(async () => (await state(page)).state).toBe('roof');
  const back = await state(page);
  expect([back.index, back.progress, back.stats.falls, back.stats.stars, back.stats.crossed]).toEqual([0, 0, 1, 2, 0]);
  expect(await heard(page)).toEqual(expect.arrayContaining(['fall', 'back']));
  // Across it this time. The two stars already caught aren't there to be caught twice.
  await childFeet(page, 'follow');
  await expectSoon(async () => (await state(page)).stats.crossed).toBe(1);
  expect((await state(page)).stats.stars).toBe(3);
  await stopChild(page);
});

test('resting on a rooftop costs nothing, for as long as the child likes, and the child is told so once', async ({ page }) => {
  await reachPlay(page, short({ ropeFall: 'soon', sound: true, voice: true }));
  await listen(page);
  await childWalks(page, { fixed: null });
  // Longer than a walker on a rope would have: 5 seconds with this setting.
  await page.waitForTimeout(8000);
  const now = await state(page);
  expect([now.state, now.wobble, now.stats.falls]).toEqual(['roof', 0, 0]);
  await expect(page.locator('#wobble')).toHaveAttribute('data-wobbling', 'false');
  expect((await heard(page)).filter((type) => type === 'resting')).toHaveLength(1);
  await stopChild(page);
});

test('the other foot up on a rope that is for this one neither glides nor wobbles, and the other foot is asked for', async ({ page }) => {
  await reachPlay(page, short({ ropeFall: 'soon' }));
  await childWalks(page);
  await expectSoon(async () => (await state(page)).progress).toBeGreaterThan(0.3);
  const { leg } = await state(page);
  const other = leg === 'left' ? 'right' : 'left';
  await childFeet(page, { foot: other, share: 1.2 });
  await expectSoon(async () => (await state(page)).wrongFoot).toBe(true);
  const at = (await state(page)).progress;
  await expect(page.locator('#prompt-text')).toHaveText('Now the other foot!');
  await page.waitForTimeout(6500);
  const now = await state(page);
  // Balancing, but not what was asked: nothing moves, and nothing is lost.
  expect(now.progress).toBeCloseTo(at, 3);
  expect(now.wobble).toBe(0);
  expect(now.stats.falls).toBe(0);
  expect(now.hint).toBe('other');
  await childFeet(page, 'follow');
  await expectSoon(async () => (await state(page)).stats.crossed).toBe(1);
  await stopChild(page);
});

test('with never chosen, the walker waits on the rope for as long as it takes', async ({ page }) => {
  await reachPlay(page, short({ ropeFall: 'never' }));
  await childWalks(page);
  await expectSoon(async () => (await state(page)).progress).toBeGreaterThan(0.3);
  await childFeet(page, null);
  await page.waitForTimeout(11_000);
  const now = await state(page);
  expect([now.state, now.wobble, now.stats.falls]).toEqual(['rope', 0, 0]);
  await expect(page.locator('#wobble')).toHaveAttribute('data-wobbling', 'false');
  await stopChild(page);
});

test('with nobody in the picture everything waits: the walker neither goes on nor wobbles, and the child is asked back', async ({ page }) => {
  await reachPlay(page, short({ ropeFall: 'soon' }));
  const { asked } = await state(page);
  await footUp(page, asked, 30);
  await expectSoon(async () => (await state(page)).progress).toBeGreaterThan(0.2);
  await page.evaluate(() => window.__camera.showNobody());
  await expect(page.locator('#prompt-text')).toHaveText('Come back where I can see you', { timeout: 15_000 });
  const at = (await state(page)).progress;
  await page.waitForTimeout(7000);
  const now = await state(page);
  expect(now.progress).toBeCloseTo(at, 2);
  expect(now.stats.falls).toBe(0);
  expect(now.wobble).toBeLessThan(0.25);
  // Back in the picture, on both feet, the game goes on from where it was.
  await standing(page);
  await expect(page.locator('#prompt-text')).toHaveText(`Lift your ${asked} foot!`, { timeout: 15_000 });
  await footUp(page, asked, 30);
  await expectSoon(async () => (await state(page)).stats.crossed).toBe(1);
});

test('with the child there but their feet out of the picture, they are asked to step back, and the walker waits without wobbling', async ({ page }) => {
  await reachPlay(page, short({ ropeFall: 'soon' }));
  const { asked } = await state(page);
  await footUp(page, asked, 30);
  await expectSoon(async () => (await state(page)).progress).toBeGreaterThan(0.2);
  // Too near the camera: the same person from the hips up.
  await page.evaluate(() => window.__camera.showFootage('stands', { from: 0.5, playing: false, height: 1.7, shiftY: 0.3 }));
  await expect(page.locator('#prompt-text')).toHaveText('Step back so I can see your feet', { timeout: 15_000 });
  await expect(page.locator('#coach')).not.toHaveClass(/is-visible/);
  const at = (await state(page)).progress;
  await page.waitForTimeout(7000);
  const now = await state(page);
  expect(now.seen).toBe(false);
  expect(now.progress).toBeCloseTo(at, 2);
  expect(now.stats.falls).toBe(0);
  expect(now.wobble).toBeLessThan(0.25);
  // Back where all of them can be seen, the foot is asked for again.
  await standing(page);
  await expect(page.locator('#prompt-text')).toHaveText(`Lift your ${asked} foot!`, { timeout: 15_000 });
});

test('a child whose foot is off the floor, but never high enough, has a whole lift come down to meet them', async ({ page }) => {
  await reachPlay(page, short({ ropeFall: 'never' }));
  await listen(page);
  const { asked, reach } = await state(page);
  await childWalks(page, { fixed: { foot: asked, share: 0.3 } });
  await expectSoon(async () => (await state(page)).stats.eased[asked], { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
  expect((await state(page)).reach[asked]).toBeLessThan(reach[asked]);
  expect(await heard(page)).toContain('eased');
  // And in a little while their own lift is enough, with nothing said about it.
  await expectSoon(async () => (await state(page)).gliding, { timeout: 30_000 }).toBe(true);
  await expectSoon(async () => (await state(page)).progress, { timeout: 30_000 }).toBeGreaterThan(0.1);
  await stopChild(page);
});

test('a whole game: every rope crossed, a leg at a time, and a card at the end with what the legs did', async ({ page }) => {
  test.setTimeout(240_000);
  await reachPlay(page, short());
  await listen(page);
  const { plan } = await state(page);
  // Taking turns: one rope on each leg.
  expect(plan.ropes.map(({ leg }) => leg)).toEqual(plan.ropes[0].leg === 'left' ? ['left', 'right', 'left', 'right'] : ['right', 'left', 'right', 'left']);
  await childWalks(page);
  await expectSoon(async () => (await state(page)).screen, { timeout: 120_000 }).toBe('finishing');
  const done = await state(page);
  expect(done.state).toBe('finished');
  expect(done.stats.crossed).toBe(4);
  expect(done.stats.holds.left).toBeGreaterThanOrEqual(2);
  expect(done.stats.holds.right).toBeGreaterThanOrEqual(2);
  // The walker is on the last rooftop, past the last rope, cheering, and is seen from behind and to one side.
  expect(done.view).toBe('finish');
  await expectSoon(async () => page.evaluate(() => {
    const { world } = window.__game;
    return world.walker.root.position.z - world.place.ropes.at(-1).to.z;
  })).toBeLessThan(-1);
  expect(await heard(page)).toEqual(expect.arrayContaining(['off', 'up', 'down', 'crossed', 'finished']));
  await waitForScreen(page, 'finish');
  await expect(page.locator('#finish-title')).toHaveText('You crossed them all!');
  await expect(page.locator('#finish-crossed')).toHaveText('4 ropes');
  // Standing on the left leg is the right foot held up, and the other way round.
  const seconds = (value) => `${Math.round(value)} second${Math.round(value) === 1 ? '' : 's'}`;
  await expect(page.locator('#finish-line')).toContainText(`stood on the left leg for ${seconds(done.stats.holdSeconds.right)} and on the right leg for ${seconds(done.stats.holdSeconds.left)}`);
  await expect(page.locator('#finish-line')).toContainText(`and the longest stand was ${Math.round(done.stats.longest * 10) / 10} seconds`);
  expect(done.stats.holdSeconds.left).toBeGreaterThan(4);
  expect(done.stats.holdSeconds.right).toBeGreaterThan(4);
  const tally = await page.locator('#finish-tally .tally-card').evaluateAll((cards) => cards.map((card) => card.textContent.replace(/\s+/g, ' ').trim()));
  expect(tally[0]).toContain(`${done.stats.holds.right}`);
  expect(tally[0]).toContain('Stands on the left leg');
  expect(tally[1]).toContain(`${done.stats.holds.left}`);
  expect(tally[1]).toContain('Stands on the right leg');
  await expect(page.locator('#finish-line')).not.toContainText('net');
  await expect(page.locator('#finish-tally .tally-card')).toHaveCount(3);
  await expect(page.locator('#finish-prizes')).toBeHidden();
  // The level moves on, and says what the next one brings.
  await expect(page.locator('#level-next-new')).toContainText('Gold stars');
  await shot(page, 'rope-finish');
  // The camera is let go at the end.
  expect(await page.evaluate(() => window.__camera.activeTracks)).toBe(0);
  // Again, without a second warm-up: straight to the countdown, at level 2.
  await page.locator('#cross-again').click();
  await waitForScreen(page, 'countdown', 60_000);
  expect((await state(page)).level).toBe(2);
});

test('one leg all game, with a drop into the net on the way: the card says how long on that leg, and that the walker went back up', async ({ page }) => {
  test.setTimeout(240_000);
  // Always lifting the foot of the side being worked on, the right: that's standing on the left leg.
  await reachPlay(page, short({ ropeLeg: 'lift', hands: 'right', ropeFall: 'soon' }));
  await childWalks(page);
  await expectSoon(async () => (await state(page)).progress).toBeGreaterThan(0.4);
  await childFeet(page, null);
  await expectSoon(async () => (await state(page)).stats.falls, { timeout: 20_000 }).toBe(1);
  await childFeet(page, 'follow');
  await waitForScreen(page, 'finish');
  const { stats } = await state(page);
  expect(stats.crossed).toBe(4);
  expect(stats.holdSeconds.left).toBe(0);
  expect(stats.holdSeconds.right).toBeGreaterThan(10);
  const seconds = Math.round(stats.holdSeconds.right);
  await expect(page.locator('#finish-line')).toContainText(`stood on the left leg for ${seconds} seconds and on the right leg for 0 seconds`);
  await expect(page.locator('#finish-line')).toContainText('The walker dropped into the net 1 time, and went back up.');
  const tally = await page.locator('#finish-tally .tally-card').evaluateAll((cards) => cards.map((card) => card.textContent.replace(/\s+/g, ' ').trim()));
  expect(tally[0]).toBe(`${stats.holds.right}Stands on the left leg`);
  expect(tally[1]).toBe('0Stands on the right leg');
  expect(stats.holds.right).toBeGreaterThanOrEqual(5);
  await stopChild(page);
});

test('the grown-ups choose which foot lifts, how many ropes, how long a rope takes and how high a lift is', async ({ page }) => {
  await reachPlay(page, { ropeLeg: 'stand', hands: 'left', ropeCount: 8, ropeHold: 'long', ropeLift: 'tiny' });
  let now = await state(page);
  // Standing on the leg being worked on, the left, is lifting the right foot, on every rope.
  expect(now.plan.ropes).toHaveLength(8);
  expect(now.plan.ropes.every(({ leg }) => leg === 'right')).toBe(true);
  expect(now.plan.ropes.every(({ seconds }) => seconds === 8)).toBe(true);
  expect(now.reach.left).toBeCloseTo(0.04, 5);
  await expect(page.locator('#ropes-all')).toHaveText('8');
  // The panel says what the camera sees, and what a whole lift is.
  await page.locator('#open-panel').click();
  await expect(page.locator('#live-reading')).toContainText('A whole lift is 4% of their height with the left foot and 4% with the right');
  // Changed in the panel, how high a lift is changes at once.
  await page.locator('input[name="ropeLift"][value="small"]').check();
  await page.locator('#close-panel').click();
  now = await state(page);
  expect(now.reach.left).toBeCloseTo(0.07, 5);
  // The setting the other body games share, for how big a move is, isn't offered: this game has its own.
  await page.locator('#open-panel').click();
  await expect(page.locator('input[name="moveSize"]').first()).toBeHidden();
  await expect(page.locator('#panel')).toContainText('standing up with their feet side by side');
  await expect(page.locator('#panel')).toContainText('Keep something steady within reach, and stay close by.');
});

test('always lifting the foot of the leg being worked on, or whichever foot the child likes', async ({ page }) => {
  await reachPlay(page, short({ ropeLeg: 'lift', hands: 'right' }));
  expect((await state(page)).plan.ropes.every(({ leg }) => leg === 'right')).toBe(true);
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('camera-games-settings'));
    localStorage.setItem('camera-games-settings', JSON.stringify({ ...saved, ropeLeg: 'any' }));
  });
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'yes');
  await standing(page);
  await toChoosing(page);
  await page.locator('#rope-start').click();
  await waitForScreen(page, 'warmup');
  await page.locator('#warm-skip').click();
  await waitForScreen(page, 'playing');
  expect((await state(page)).plan.ropes.every(({ leg }) => leg === 'any')).toBe(true);
  // Either foot crosses a rope that takes either: a foot is asked for, not one of them, and both footprints are bright.
  await expect(page.locator('#prompt-text')).toHaveText('Lift one foot!');
  await expect(page.locator('#coach-text')).toHaveText('Lift one foot!');
  await expect(page.locator('#feet')).toHaveAttribute('data-ask', 'any');
  await childWalks(page, { fixed: { foot: 'left', share: 1.1 } });
  await expectSoon(async () => (await state(page)).stats.crossed).toBe(1);
  await childFeet(page, null);
  await expectSoon(async () => (await state(page)).state).toBe('roof');
  await childFeet(page, { foot: 'right', share: 1.1 });
  await expectSoon(async () => (await state(page)).stats.crossed).toBe(2);
  const { stats } = await state(page);
  expect(stats.holds.left).toBeGreaterThanOrEqual(1);
  expect(stats.holds.right).toBeGreaterThanOrEqual(1);
  await stopChild(page);
});

test('in Georgian, the foot is asked for in Georgian', async ({ page }) => {
  await reachPlay(page, short({ language: 'ka' }));
  await expect(page.locator('#prompt-text')).toHaveText(/ასწიე (მარცხენა|მარჯვენა) ფეხი!/);
});

test('if the tracker stops answering in the middle of a rope, the lifted foot is let go, and the walker is not carried on', async ({ page }) => {
  await reachPlay(page, short({ ropeFall: 'never' }));
  const { asked } = await state(page);
  await footUp(page, asked, 30);
  await expectSoon(async () => (await state(page)).progress).toBeGreaterThan(0.15);
  // No more readings come, as when the tracker is busy or broken: the foot isn't taken as still up.
  await page.evaluate(() => {
    window.__game.game.onMoves = () => {};
    window.__game.game.bodyLost = () => true;
  });
  await page.waitForTimeout(1500);
  const at = (await state(page)).progress;
  await page.waitForTimeout(2500);
  const now = await state(page);
  expect(now.gliding).toBe(false);
  expect(now.progress).toBeCloseTo(at, 3);
  expect(Math.abs(now.raw)).toBeLessThan(0.01);
});

test('a way out in the middle: the panel pauses the game, and the walker is where it was when it is closed', async ({ page }) => {
  await reachPlay(page, short({ ropeFall: 'soon' }));
  await childWalks(page);
  await expectSoon(async () => (await state(page)).progress).toBeGreaterThan(0.3);
  await childFeet(page, null);
  await page.locator('#open-panel').click();
  const at = await state(page);
  await page.waitForTimeout(7000);
  const later = await state(page);
  // Longer than it takes to fall, and nothing has moved: not the walker, and not the wobble.
  expect(later.state).toBe('rope');
  expect(later.progress).toBeCloseTo(at.progress, 3);
  expect(later.wobble).toBeCloseTo(at.wobble, 2);
  await expect(page.locator('#panel .all-games, #panel a[href="../../index.html"]').first()).toBeVisible();
  await page.locator('#close-panel').click();
  await childFeet(page, 'follow');
  await expectSoon(async () => (await state(page)).stats.crossed).toBe(1);
  await stopChild(page);
});

test('putBefore, which these tests use to get to a thing, puts the walker on the rope and the camera with it', async ({ page }) => {
  await reachPlay(page, short());
  const put = await putBefore(page, 'last', { at: 0.5, before: 0 });
  expect(put).toEqual({ index: 3, at: 0.5 });
  await page.waitForTimeout(300);
  const now = await state(page);
  expect([now.state, now.index]).toEqual(['rope', 3]);
  expect(now.progress).toBeCloseTo(0.5, 5);
  // The camera is behind the walker, a few metres back, and nowhere near the first rooftop.
  expect(now.camera.z - now.walker.z).toBeGreaterThan(4);
  expect(now.camera.z - now.walker.z).toBeLessThan(9);
});
