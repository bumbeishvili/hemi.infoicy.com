// Moto Mountain's wild ride, in the real page: a race against other riders, over steep hills that throw the
// bike into the air, with ramps, hay bales in the way and a river to jump. It's how the game comes. The child is
// played by a script, whose lean goes where the tracker's reading does and is never quite still.
import { childRides, expect, expectSoon, judge, labelShown, openMoto, putBefore, reachPlay, rivalsAt, shot, standing, state, stopChild, test, toChoosing, waitForScreen, watchBrightness } from './helpers.js';

const wild = (level = 1, settings = {}) => ({ motoRide: 'wild', levels: { 'moto-mountain': level }, ...settings });
// Roads that have what a test is about, by their numbers: see roadSeed in main.js. At level 1 with ten bends,
// road 2 has three rows of bales to steer round, two right across with their ramps, and six hills. With six
// bends, road 3 has four hills. At level 3 with six bends, road 11 has three hills and a wall. At level 7, road 2
// has two rivers, and bales, walls and hills. At level 10, road 1 has eight hills.
const ROADS = { busy: 2, short: 3, third: 11, rivers: 2, top: 1 };

/** What the page has heard happen in this ride, by name, in order. */
const listen = (page) => page.evaluate(() => {
  const { ride } = window.__game;
  window.__heard = [];
  const tell = ride.onEvent;
  ride.onEvent = (event) => {
    window.__heard.push(event.type);
    tell(event);
  };
});
const heard = (page) => page.evaluate(() => window.__heard);

/**
 * Puts the bike in the straight before the next row of bales that's right across the road, in line with the ramp
 * before them, so it's sure to take it. Returns where the bales are.
 */
async function beforeWall(page, back = 44) {
  const found = await page.evaluate(() => {
    const { ride } = window.__game;
    const wall = ride.things.find((thing) => thing.kind === 'barrier' && thing.wall && !thing.gone && thing.at > ride.s + 40);
    if (!wall) return null;
    return { at: wall.at, ramp: ride.things.find((thing) => thing.kind === 'ramp' && thing.at < wall.at && wall.at - thing.at < 30).x };
  });
  if (!found) return null;
  await putBefore(page, found.at, { before: back, x: found.ramp });
  return found.at;
}

test('the wild ride is how the game comes: a race, with the other riders lined up in front, and the child last on the start line', async ({ page }) => {
  // Nothing chosen: no setting for the ride at all. The title card says what it is.
  await openMoto(page, { motoRide: undefined });
  await expect(page.locator('#screen-welcome')).toContainText('beat the other riders to the top');
  await standing(page);
  await toChoosing(page);
  await page.locator('#moto-start').click();
  await waitForScreen(page, 'warmup');
  await page.locator('#warm-skip').click();
  await waitForScreen(page, 'playing');
  expect(await page.evaluate(() => window.__game.game.settings.motoRide)).toBe('wild');
  const now = await state(page);
  expect(now.rivals).toHaveLength(4);
  expect(now.riders).toBe(4);
  expect(now.place).toBe(5);
  await expect(page.locator('#place-chip')).toBeVisible();
  await expect(page.locator('#place')).toHaveText('5th');
  await expect(page.locator('#riders')).toHaveText('5');
  // Hills to fly off, and bends that go down hill and up.
  const kinds = now.hills.map(({ kind }) => kind);
  expect(kinds).toEqual(expect.arrayContaining(['down', 'up']));
  expect(kinds.filter((kind) => kind === 'top').length + now.plan.kinds.filter((kind) => kind === 'ramp').length).toBeGreaterThanOrEqual(1);
  // The other riders are on the road ahead, drawn, each on a bike.
  expect(await page.evaluate(() => window.__game.world.rivals.every((rider) => rider.root.visible && rider.root.parent !== null))).toBe(true);
  await shot(page, 'moto-wild-start');
});

test('the grown-ups can choose the gentle ride, the road alone: nobody to race and nothing in the way', async ({ page }) => {
  await reachPlay(page, wild(3));
  expect((await state(page)).rivals.length).toBe(4);
  await page.locator('#open-panel').click();
  await expect(page.locator('input[name="motoRide"][value="wild"]')).toBeChecked();
  await page.locator('input[name="motoRide"][value="gentle"]').check();
  await page.locator('#close-panel').click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('camera-games-settings')).motoRide)).toBe('gentle');
  // The next ride is the gentle one.
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'yes');
  await page.evaluate(() => window.__camera.showFootage('lifts', { from: 0.6, playing: false }));
  await page.locator('#start').click();
  await page.locator('#moto-start').click();
  await waitForScreen(page, 'warmup');
  await page.locator('#warm-skip').click();
  await waitForScreen(page, 'playing');
  const now = await state(page);
  expect([now.rivals.length, now.riders, now.hills.length, now.barriers.length]).toEqual([0, 0, 0, 0]);
  await expect(page.locator('#place-chip')).toBeHidden();
});

test('what level 7 brings is a river to jump on the wild ride, as there are jumps from the start, and a jump on the gentle one', async ({ page }) => {
  await openMoto(page, wild(7));
  await expect(page.locator('#level-new')).toContainText('A river to jump');
  await page.locator('#open-panel').click();
  await page.locator('input[name="motoRide"][value="gentle"]').check();
  await page.locator('#close-panel').click();
  await expect(page.locator('#level-new')).toContainText('A jump');
  await expect(page.locator('#level-new')).not.toContainText('river');
});

test('a bike going well flies off the top of a steep hill, with a lean for a trick asked for, and comes down further on', async ({ page }) => {
  await reachPlay(page, wild(1), ROADS.busy);
  await listen(page);
  await childRides(page, { looks: true });
  const top = await putBefore(page, 'crest', { before: 40 });
  expect(top).not.toBe(null);
  await rivalsAt(page, [30, 60, 90, 120]);
  await expectSoon(async () => (await state(page)).air, { timeout: 20_000 }).toBe(true);
  // In the air there's nothing to steer, and a lean is a trick: it's said.
  await expect(page.locator('#prompt-text')).toHaveText('Lean in the air for a trick!');
  await expectSoon(async () => (await state(page)).bikeUp, { timeout: 10_000 }).toBeGreaterThan(1.2);
  await shot(page, 'moto-wild-air');
  const flying = await state(page);
  expect(flying.s).toBeGreaterThan(top);
  expect(flying.height).toBeGreaterThan(1.2);
  await expectSoon(async () => (await state(page)).stats.jumps, { timeout: 10_000 }).toBe(1);
  const down = await state(page);
  expect([down.air, down.height, down.bikeUp < 0.05]).toEqual([false, 0, true]);
  expect(down.s).toBeGreaterThan(top + 14);
  expect(down.stats.air).toBeGreaterThan(1.1);
  expect(down.stats.tricks).toBe(0);
  expect(await heard(page)).toEqual(expect.arrayContaining(['jump', 'land']));
  await stopChild(page);
});

test('a lean held in the air is a trick: a burst of speed on landing, said on the screen, and counted at the top', async ({ page }) => {
  test.setTimeout(240_000);
  await reachPlay(page, wild(1, { motoBends: 6 }), ROADS.short);
  await listen(page);
  await childRides(page, { looks: true, tricks: true });
  expect(await putBefore(page, 'crest', { before: 40 })).not.toBe(null);
  await rivalsAt(page, [-40, -60, -80, -100]);
  await expectSoon(async () => (await state(page)).stats.tricks, { timeout: 30_000 }).toBe(1);
  const landed = await state(page);
  expect(landed.boost).toBeGreaterThan(0.8);
  // Faster than the bike's steady speed, for a moment.
  await expectSoon(async () => (await state(page)).v / landed.cruise, { timeout: 5000 }).toBeGreaterThan(1.12);
  // Once one is landed, it isn't asked for again.
  expect(await putBefore(page, 'crest', { before: 40 })).not.toBe(null);
  await expectSoon(async () => (await state(page)).air, { timeout: 20_000 }).toBe(true);
  await expect(page.locator('#prompt-text')).not.toHaveText('Lean in the air for a trick!');
  await putBefore(page, 'top', { before: 60 });
  await waitForScreen(page, 'finish');
  const { stats } = await state(page);
  expect(stats.tricks).toBeGreaterThanOrEqual(1);
  const some = (count, one) => `${count} ${one}${count === 1 ? '' : 's'}`;
  await expect(page.locator('#finish-prizes')).toContainText(`did ${some(stats.tricks, 'trick')}`);
  await expect(page.locator('#finish-prizes')).toContainText(new RegExp(`made ${some(stats.jumps, 'jump')}, with ${Math.round(stats.air)} seconds in the air`, 'i'));
  await stopChild(page);
});

test('hay bales in the way: riding into them bursts them and costs most of the bike’s speed, and they can be steered round', async ({ page }) => {
  await reachPlay(page, wild(1), ROADS.busy);
  await listen(page);
  // Round them, looking where they're going.
  await childRides(page, { looks: true });
  const first = await putBefore(page, 'bales', { before: 60 });
  expect(first).not.toBe(null);
  await rivalsAt(page, [80, 100, 120, 140]);
  await expectSoon(async () => (await state(page)).s, { timeout: 20_000 }).toBeGreaterThan(first + 3);
  let now = await state(page);
  expect(now.stats.crashes).toBe(0);
  expect(now.v).toBeGreaterThan(now.cruise * 0.85);
  expect(now.barriers.find(({ at }) => at === first).gone).toBe(false);
  // Into the next ones, held in line with them.
  await stopChild(page);
  await childRides(page, { fixed: 0 });
  const next = await putBefore(page, 'bales', { before: 30, lane: true });
  expect(next).not.toBe(null);
  await rivalsAt(page, [80, 100, 120, 140]);
  await expectSoon(async () => (await state(page)).stats.crashes, { timeout: 20_000 }).toBe(1);
  now = await state(page);
  expect(now.v).toBeLessThan(now.cruise * 0.5);
  expect(now.barriers.find(({ at }) => at === next).gone).toBe(true);
  expect(await heard(page)).toContain('crash');
  // The bales on the screen shrink away, in a burst of straw.
  await expectSoon(async () => page.evaluate((at) => window.__game.world.items.find(({ thing }) => thing.kind === 'barrier' && thing.at === at).object.visible, next)).toBe(false);
  await shot(page, 'moto-wild-bales');
  // And the bike gets going again.
  await expectSoon(async () => (await state(page)).v / now.cruise, { timeout: 15_000 }).toBeGreaterThan(0.9);
  await stopChild(page);
});

test('bales right across the road: off the ramp before them the bike flies over, and beside the ramp it goes through', async ({ page }) => {
  await reachPlay(page, wild(1), ROADS.busy);
  await listen(page);
  await childRides(page, { looks: true });
  const wall = await beforeWall(page);
  expect(wall).not.toBe(null);
  await rivalsAt(page, [90, 110, 130, 150]);
  await expectSoon(async () => (await state(page)).stats.cleared, { timeout: 25_000 }).toBe(1);
  let now = await state(page);
  expect(now.stats.crashes).toBe(0);
  expect(now.air).toBe(true);
  expect(now.barriers.find(({ at }) => at === wall).gone).toBe(false);
  expect(await heard(page)).toContain('clear');
  await shot(page, 'moto-wild-over');
  await expectSoon(async () => (await state(page)).air, { timeout: 10_000 }).toBe(false);
  // The same wall again, on the far side of the road from its ramp.
  await stopChild(page);
  const ramp = await page.evaluate((at) => window.__game.ride.things.find((thing) => thing.kind === 'ramp' && thing.at < at && at - thing.at < 30).x, wall);
  await childRides(page, { fixed: 0 });
  await putBefore(page, wall, { before: 25, x: -ramp });
  await page.evaluate(() => {
    const { ride } = window.__game;
    for (const thing of ride.things) if (thing.kind === 'ramp') thing.done = false;
  });
  await expectSoon(async () => (await state(page)).stats.crashes, { timeout: 20_000 }).toBe(1);
  now = await state(page);
  expect(now.stats.cleared).toBe(1);
  expect(now.barriers.find(({ at }) => at === wall).gone).toBe(true);
  await stopChild(page);
});

test('level 7: a bike going well flies the river from its bank, and one on the grass wades through it slowly', async ({ page }) => {
  await reachPlay(page, wild(7), ROADS.rivers);
  await listen(page);
  await childRides(page, { looks: true });
  const river = await putBefore(page, 'river', { before: 50 });
  expect(river).not.toBe(null);
  await rivalsAt(page, [90, 110, 130, 150, 170]);
  await expectSoon(async () => (await state(page)).stats.rivers, { timeout: 25_000 }).toBe(1);
  // It's the level's own new thing, and was named as it came into view.
  expect(await labelShown(page, 'river')).toBe(true);
  let now = await state(page);
  expect(now.stats.wades).toBe(0);
  expect(await heard(page)).toEqual(expect.arrayContaining(['jump', 'river']));
  expect(await heard(page)).not.toContain('wade');
  // The water is drawn, across the road and well out to each side, in a bed in the ground.
  const water = await page.evaluate(() => {
    const { world, ride } = window.__game;
    const thing = ride.things.find(({ kind }) => kind === 'river');
    const item = world.items.find((one) => one.thing === thing);
    const middle = window.__game.roadY((thing.from + thing.to) / 2);
    const far = item.object.position;
    return { visible: item.object.visible, overRoad: far.y - window.__game.roadY(thing.to), bed: far.y - world.land.ground(far.x, far.z), middle };
  });
  expect(water.visible).toBe(true);
  expect(water.overRoad).toBeCloseTo(0.12, 2);
  expect(water.bed).toBeGreaterThan(0.4);
  await shot(page, 'moto-wild-river');
  // The next river, on the grass, at under half the speed: into the water.
  await stopChild(page);
  await childRides(page, { fixed: 1.4 });
  const next = await putBefore(page, 'river', { before: 60, x: 6 });
  expect(next).not.toBe(null);
  await expectSoon(async () => (await state(page)).stats.wades, { timeout: 40_000 }).toBe(1);
  now = await state(page);
  expect(now.wet).toBe(true);
  expect(await heard(page)).toContain('wade');
  await expectSoon(async () => (await state(page)).v / now.cruise, { timeout: 10_000 }).toBeLessThan(0.25);
  // And out the other side: nobody is left in it.
  await expectSoon(async () => (await state(page)).wet, { timeout: 30_000 }).toBe(false);
  expect((await state(page)).stats.rivers).toBe(1);
  await stopChild(page);
});

test('the race: passing a rider is a place gained, said big, and the card at the top says where the child came', async ({ page }) => {
  test.setTimeout(240_000);
  await reachPlay(page, wild(1, { motoBends: 6 }), ROADS.short);
  await listen(page);
  await childRides(page, { looks: true });
  // One rider just in front, and slow: the rest far off behind.
  await page.evaluate(() => {
    const { ride } = window.__game;
    ride.rivals[3].skill = 0.5;
  });
  await rivalsAt(page, [-300, -320, -340, 12]);
  await expect(page.locator('#place')).toHaveText('2nd');
  await expectSoon(async () => (await state(page)).place, { timeout: 30_000 }).toBe(1);
  await expect(page.locator('#place')).toHaveText('1st');
  expect(await heard(page)).toContain('place');
  await expect(page.locator('.callout.is-number').filter({ hasText: '1st' }).first()).toBeVisible();
  // On to the top, in front.
  await putBefore(page, 'top', { before: 60 });
  await rivalsAt(page, [-300, -320, -340, -30]);
  await waitForScreen(page, 'finish');
  const { stats } = await state(page);
  expect([stats.place, stats.riders]).toEqual([1, 5]);
  await expect(page.locator('#finish-title')).toHaveText('You won the race!');
  await expect(page.locator('#finish-clean')).toHaveText('1st of 5');
  await expect(page.locator('#finish-what')).toHaveText('in the race');
  await expect(page.locator('#finish-line')).toContainText(`${stats.clean} of 6 bends were ridden all on the road.`);
  await shot(page, 'moto-wild-finish');
  await stopChild(page);
});

test('riders who get to the top first are counted in front, and wait there, off the road, as the bike comes in', async ({ page }) => {
  test.setTimeout(240_000);
  await reachPlay(page, wild(1, { motoBends: 6 }), ROADS.short);
  await childRides(page, { looks: true });
  await putBefore(page, 'top', { before: 110 });
  // Three of them about to get there, and one behind.
  await rivalsAt(page, [70, 80, 90, -60]);
  await waitForScreen(page, 'finishing');
  const done = await state(page);
  expect(done.rivals.filter((rival) => rival.done)).toHaveLength(3);
  expect(done.stats.place).toBe(4);
  // Each waits past where the child's bike stops, on the grass.
  const parked = await page.evaluate(() => {
    const { world, ride } = window.__game;
    return world.rivals.map((rider, n) => ({ done: ride.rivals[n].done, visible: rider.root.visible, x: rider.lastX })).filter((rider) => rider.done);
  });
  expect(parked.every(({ visible, x }) => visible && x > 4.5)).toBe(true);
  await waitForScreen(page, 'finish');
  await expect(page.locator('#finish-clean')).toHaveText('4th of 5');
  await expect(page.locator('#finish-title')).toHaveText('You made it to the top!');
  await stopChild(page);
});

test('a whole wild ride, by a child who looks where they’re going and does tricks: jumps, a race to the end, and nothing lost', async ({ page }) => {
  test.setTimeout(400_000);
  await reachPlay(page, wild(3, { motoBends: 6 }), ROADS.third);
  await childRides(page, { looks: true, tricks: true });
  await expectSoon(async () => (await state(page)).screen, { timeout: 240_000 }).toBe('finish');
  const { stats } = await state(page);
  console.log('a wild ride', JSON.stringify({ place: `${stats.place}/${stats.riders}`, seconds: Math.round(stats.seconds), jumps: stats.jumps, air: Math.round(stats.air), tricks: stats.tricks, crashes: stats.crashes, cleared: stats.cleared, clean: stats.clean }));
  expect(stats.jumps).toBeGreaterThanOrEqual(3);
  expect(stats.tricks).toBeGreaterThanOrEqual(1);
  expect(stats.place).toBeGreaterThanOrEqual(1);
  expect(stats.place).toBeLessThanOrEqual(4);
  expect(stats.tows).toBe(0);
  // The level moves on, as after any ride.
  await expect(page.locator('#level-done-text')).toContainText('Level 3 done');
  await stopChild(page);
});

for (const level of [1, 10]) {
  test(`nothing flashes on the wild ride at level ${level}: over the hills, in the air, past the other riders, the brightness stays steady`, async ({ page }) => {
    test.setTimeout(400_000);
    await reachPlay(page, wild(level), level === 1 ? ROADS.busy : ROADS.top);
    await childRides(page, { looks: true, tricks: true });
    // From the start line, in among the other riders.
    const start = judge(await watchBrightness(page, 300));
    console.log(`wild level ${level} setting off`, JSON.stringify(start));
    expect(start.biggestStep).toBeLessThan(4);
    expect(start.flickeringShare).toBeLessThan(0.01);
    // Up a hill, off the top of it, and down again, with riders round the bike.
    expect(await putBefore(page, 'crest', { before: 60 })).not.toBe(null);
    await rivalsAt(page, [14, -6, 26, -16, 40]);
    await page.waitForTimeout(400);
    const hill = judge(await watchBrightness(page, 540));
    console.log(`wild level ${level} over a hill`, JSON.stringify(hill));
    expect(hill.biggestStep).toBeLessThan(4);
    expect(hill.flickeringShare).toBeLessThan(0.01);
    expect((await state(page)).stats.jumps).toBeGreaterThanOrEqual(1);
    // And twenty seconds of whatever comes.
    const reading = judge(await watchBrightness(page, 1200));
    console.log(`wild level ${level} on the road`, JSON.stringify(reading));
    expect(reading.biggestStep).toBeLessThan(4);
    expect(reading.flickeringShare).toBeLessThan(0.01);
    await stopChild(page);
  });
}

test('nothing flashes going through hay bales, over a wall of them, over a river or wading through one', async ({ page }) => {
  test.setTimeout(400_000);
  await reachPlay(page, wild(7), ROADS.rivers);
  // Through a row of bales, with the straw flying.
  await childRides(page, { fixed: 0 });
  expect(await putBefore(page, 'bales', { before: 30, lane: true })).not.toBe(null);
  await rivalsAt(page, [60, 80, 100, 120, 140]);
  await page.waitForTimeout(300);
  const bales = judge(await watchBrightness(page, 300));
  console.log('through the bales', JSON.stringify(bales));
  expect(bales.biggestStep).toBeLessThan(4);
  expect(bales.flickeringShare).toBeLessThan(0.01);
  // Through that row, and, riding straight on for the rest of the reading, perhaps into what came next too.
  expect((await state(page)).stats.crashes).toBeGreaterThanOrEqual(1);
  // Over a wall, off its ramp.
  await stopChild(page);
  await childRides(page, { looks: true });
  expect(await beforeWall(page)).not.toBe(null);
  await rivalsAt(page, [60, 80, 100, 120, 140]);
  await page.waitForTimeout(300);
  const over = judge(await watchBrightness(page, 420));
  console.log('over a wall', JSON.stringify(over));
  expect(over.biggestStep).toBeLessThan(4);
  expect(over.flickeringShare).toBeLessThan(0.01);
  expect((await state(page)).stats.cleared).toBeGreaterThanOrEqual(1);
  // Over a river: the first one on the road, which the bike is put back before.
  const backToStart = () => page.evaluate(() => {
    const { ride } = window.__game;
    for (const water of ride.rivers) Object.assign(water, { done: false, waded: false });
    ride.s = 0;
    ride.stats.rivers = 0;
    ride.stats.wades = 0;
  });
  await backToStart();
  expect(await putBefore(page, 'river', { before: 60 })).not.toBe(null);
  await rivalsAt(page, [60, 80, 100, 120, 140]);
  await page.waitForTimeout(300);
  const river = judge(await watchBrightness(page, 300));
  console.log('over the river', JSON.stringify(river));
  expect(river.biggestStep).toBeLessThan(4);
  expect(river.flickeringShare).toBeLessThan(0.01);
  expect((await state(page)).stats.rivers).toBeGreaterThanOrEqual(1);
  // And into the first one again, on the grass, at under half the speed.
  await stopChild(page);
  await childRides(page, { fixed: 1.4 });
  await backToStart();
  expect(await putBefore(page, 'river', { before: 50, x: 6 })).not.toBe(null);
  await page.waitForTimeout(300);
  const wade = judge(await watchBrightness(page, 900));
  console.log('wading the river', JSON.stringify(wade));
  expect(wade.biggestStep).toBeLessThan(4);
  expect(wade.flickeringShare).toBeLessThan(0.01);
  expect((await state(page)).stats.wades).toBeGreaterThanOrEqual(1);
  await stopChild(page);
});
