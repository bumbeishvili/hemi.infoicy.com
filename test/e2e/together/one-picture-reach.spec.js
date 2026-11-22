// Two on one screen, in the hand games they play in one picture (see core/one-picture.js): the second player sees
// their glove only in the first player's game, across the whole screen, but what it touches is decided by their own
// game, going on under it in a window half as wide. Each test holds something still beside the second player's
// glove as the picture shows it, clear of it, and then right under it: only then does it happen.
import { expect, openTogether, test, waitForScreen } from './helpers.js';

/** Both seats' cameras show these hands: the first player's in the left half of the picture, the second's in the right. */
const showHands = (seats, hands) => Promise.all(seats.map((seat) => seat.evaluate((list) => window.__camera.showHands(list, { sameHand: true }), hands)));

const hand = (name, x, y = 0.5) => ({ name, side: 'right', x, y, scale: 0.75 });

/** Both start, and play in one picture, the first player's game across the whole screen. */
async function inOnePicture(page, game, hands, settings = {}) {
  const seats = await openTogether(page, game, 2, settings);
  await showHands(seats, hands);
  for (const seat of seats) await seat.locator('#start').click();
  for (const seat of seats) await waitForScreen(seat, 'playing');
  await expect(page.locator('#seats')).toHaveAttribute('data-view', 'one');
  const { width } = page.viewportSize();
  await expect.poll(async () => (await page.locator('iframe.seat').nth(0).boundingBox()).width, { timeout: 5000 }).toBe(width);
  return seats;
}

/* ---------- Balloon Pop ---------- */

for (const mode of ['together', 'against']) {
  test(`balloon-pop ${mode}: in one picture, the second player pops a balloon where the picture shows their glove on it, not beside it`, async ({ page }) => {
    test.setTimeout(180_000);
    const [left, right] = await inOnePicture(page, 'balloon-pop', [hand('open', 0.08), hand('open', 0.86)], { popFriends: mode });
    await expect.poll(() => left.evaluate(() => window.__game.game.friendsGloves[0]?.fade ?? 0), { timeout: 20_000 }).toBeGreaterThan(0.95);

    // One of the first player's balloons, held still by the second player's glove as the picture shows it: first a
    // little way beside it, well clear of touching, and then right on it.
    const id = await left.evaluate(() => {
      const field = window.__game.balloons;
      const balloon = field.balloons.find((each) => each.number === undefined && !each.kind && !each.star && !each.basket && !each.leaving && !field.gone.has(each.id));
      window.__held = { id: balloon.id, clear: 1.6 };
      const hold = () => {
        const it = field.balloons.find((each) => each.id === window.__held.id);
        const glove = field.friendsGloves[0]?.glove;
        if (!it || !glove?.visible) return;
        // Along the glove's middle, towards the middle of the screen, as far as leaves it this clear of the glove.
        let away = 0;
        while (away < field.width && glove.reachTo(glove.x - away, glove.y, field.palmSize) < it.r * window.__held.clear) away += 2;
        Object.assign(it, { pace: 0, drift: 0, sway: 0, push: 0, pushSpeed: 0, homeX: glove.x - away, x: glove.x - away, y: glove.y });
      };
      window.__holding = setInterval(hold, 16);
      return balloon.id;
    });
    const popped = () => right.evaluate((which) => window.__game.balloons.gone.has(which), id);
    await page.waitForTimeout(2500);
    expect(await popped(), 'popped while the picture shows the glove beside it').toBe(false);

    // Right on it, it pops, and it's the second player's.
    await left.evaluate(() => {
      window.__held.clear = 0;
    });
    await expect.poll(popped, { timeout: 10_000 }).toBe(true);
    await expect.poll(() => right.evaluate((which) => window.__game.game.myClaims.has(which), id)).toBe(true);
  });
}

/* ---------- Smoothie Stand ---------- */

test('smoothie-stand: in one picture, the second player slices a fruit where the picture shows their glove on it, not beside it', async ({ page }) => {
  test.setTimeout(180_000);
  const [left, right] = await inOnePicture(page, 'smoothie-stand', [hand('open', 0.08), hand('open', 0.86)], { slicing: 'touch' });
  await expect.poll(() => left.evaluate(() => window.__game.game.friendsGloves[0]?.fade ?? 0), { timeout: 20_000 }).toBeGreaterThan(0.95);
  // Nothing else in the air, and a fruit that hangs still, a little way beside the second player's glove as the picture
  // shows it, well clear of slicing it: further from its middle than a slice reaches, and from its fingers too.
  const beside = await left.evaluate(() => {
    const { field } = window.__game;
    field.throwing = false;
    field.fruit = [];
    const glove = field.friendsGloves[0].glove;
    const r = field.fruitSize;
    let away = (r + field.palmSize * 0.5) * 1.5;
    while (glove.reachTo(glove.x - away, glove.y, field.palmSize) < r * 1.5) away += 2;
    return field.throwShared('apple', { x: glove.x - away, y: glove.y }).id;
  });
  const sliced = (which) => right.evaluate((it) => window.__game.field.gone.has(it), which);
  await page.waitForTimeout(3000);
  expect(await sliced(beside), 'sliced while the picture shows the glove beside it').toBe(false);

  // One right under the glove is sliced, and it's the second player's.
  const under = await left.evaluate(() => {
    const { field } = window.__game;
    const glove = field.friendsGloves[0].glove;
    return field.throwShared('apple', { x: glove.x, y: glove.y }).id;
  });
  await expect.poll(() => sliced(under), { timeout: 10_000 }).toBe(true);
  await expect.poll(() => right.evaluate((it) => window.__game.game.myClaims.has(it), under)).toBe(true);
});

/* ---------- The Lighthouse ---------- */

test('lighthouse: in one picture, the second player wipes the glass under their glove, as the picture shows it, and no wider', async ({ page }) => {
  test.setTimeout(180_000);
  // The first player's hand is off the glass, at the far side of the screen. The second player's is in the middle of
  // their window, closed, so it wipes nothing until they play in one picture.
  const seats = await openTogether(page, 'lighthouse');
  const [left, right] = seats;
  const middle = await right.evaluate(() => {
    const { room } = window.__game;
    const { window: glass, width, height } = room;
    const across = (glass.x + glass.width / 2) / width;
    const down = (glass.y + glass.height / 2) / height;
    return { x: 0.5 + 0.5 * (0.1 + 0.8 * across), y: 0.1 + 0.78 * down };
  });
  await showHands(seats, [hand('open', 0.08), hand('fist', middle.x, middle.y)]);
  for (const seat of seats) await seat.locator('#start').click();
  for (const seat of seats) await waitForScreen(seat, 'playing');
  await expect(page.locator('#seats')).toHaveAttribute('data-view', 'one');
  const { width } = page.viewportSize();
  await expect.poll(async () => (await page.locator('iframe.seat').nth(0).boundingBox()).width, { timeout: 5000 }).toBe(width);
  await page.waitForTimeout(1000);
  // What they had wiped before, if anything, which isn't counted.
  const second = await right.evaluate(() => window.__game.game.friends.room.you);
  const before = await left.evaluate((who) => {
    const { game } = window.__game;
    return [...game.patches].flatMap(([pane, owners]) => [...owners].filter(([, by]) => by === who).map(([patch]) => `${pane}:${patch}`));
  }, second);
  await showHands(seats, [hand('open', 0.08), hand('open', middle.x, middle.y)]);

  // What the second player has wiped since, in the first player's game, against their glove there and the size of a
  // wipe.
  const wiped = () => left.evaluate(([who, old]) => {
    const { room, storm, game } = window.__game;
    const glove = game.friendGloves[0]?.glove;
    const mine = [...(game.patches.get(storm.index) ?? new Map())].filter(([patch, by]) => by === who && !old.includes(`${storm.index}:${patch}`)).map(([patch]) => patch);
    if (!glove?.visible || !mine.length) return null;
    const { window: glass } = room;
    const at = { x: (glove.x - glass.x) / glass.width, y: (glove.y - glass.y) / glass.height };
    const size = { x: room.wipeSize / glass.width, y: room.wipeSize / glass.height };
    const [columns, rows] = [14, 9];
    // How far each patch is from the glove, in wipes: 1 at the edge of one.
    const far = mine.map((patch) => Math.hypot((((patch % columns) + 0.5) / columns - at.x) / size.x, ((Math.floor(patch / columns) + 0.5) / rows - at.y) / size.y));
    return { count: mine.length, furthest: Math.max(...far) };
  }, [second, before]);
  await expect.poll(async () => (await wiped())?.count ?? 0, { timeout: 60_000 }).toBeGreaterThan(3);
  await page.waitForTimeout(2000);
  const seen = await wiped();
  // A patch's middle can be half a patch outside a wipe that touches it.
  expect(seen.furthest, 'wiped further from the glove than the picture shows').toBeLessThan(1.35);
});

/* ---------- Giraffe's Garden ---------- */

test('giraffe-garden: in one picture, the second player\'s water lands where the picture shows it falling', async ({ page }) => {
  test.setTimeout(180_000);
  // The palm holds the can, as in the garden's own tests.
  const palm = (name, x, y) => ({ ...hand(name, x, y), scale: 0.62 });
  const [left, right] = await inOnePicture(page, 'giraffe-garden', [palm('palm', 0.25, 0.5), palm('palm', 0.8, 0.4)]);
  await expect.poll(() => left.evaluate(() => window.__game.game.friendCans[0]?.fade ?? 0), { timeout: 20_000 }).toBeGreaterThan(0.95);
  // The second player turns their hand over, and pours.
  await showHands([left, right], [palm('palm', 0.25, 0.5), palm('back', 0.8, 0.4)]);
  await expect.poll(() => right.evaluate(() => window.__game.game.flow), { timeout: 15_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1000);
  // Where their own game pours it, and where the picture shows it falling, across the screen.
  const pours = await right.evaluate(() => window.__game.garden.splash?.x ?? null);
  const shown = await left.evaluate(() => {
    const { view, game } = window.__game;
    const can = game.friendCans[0];
    return view.waterAt(can.x, can.y, can.side).x / view.width;
  });
  expect(pours).not.toBe(null);
  expect(Math.abs(pours - shown), `pours at ${pours}, shown at ${shown}`).toBeLessThan(0.01);
});
