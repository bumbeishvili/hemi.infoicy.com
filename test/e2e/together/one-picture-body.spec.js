// Two playing a whole-body game on one screen, in one picture (core/one-picture.js): the first player's game across
// the whole screen, the second player in it as a friend, and each player's own things in their own half.
import { childLifts, stopChild } from '../mighty-lift/helpers.js';
import { expect, openTogether, test, waitForScreen } from './helpers.js';

/** A filmed person in each half of the camera's picture, in every seat's test camera. */
async function twoPeople(seats, clip) {
  for (const seat of seats) await seat.evaluate((each) => window.__camera.showPeople([each, each]), clip);
}

const view = (page) => page.locator('#seats');

test('Mighty Moves in one picture: two against two, the fighters told apart, each player with their own coach in their own half', async ({ page }) => {
  test.setTimeout(240_000);
  const seats = await openTogether(page, 'mighty-moves');
  const [left, right] = seats;
  await twoPeople(seats, { name: 'strikes', from: 0.2, playing: true, at: 0.38 });
  for (const seat of seats) await seat.locator('#start').click();
  for (const seat of seats) await waitForScreen(seat, 'choose');
  // The second player, who hasn't chosen, is someone other than the first.
  expect(await left.evaluate(() => window.__game.game.settings.fighter)).toBe('giraffe');
  expect(await right.evaluate(() => window.__game.game.settings.fighter)).toBe('truffle');
  for (const seat of seats) await seat.locator('.choose-side .big-button').click();
  await expect(view(page)).toHaveAttribute('data-view', 'one', { timeout: 90_000 });
  for (const seat of seats) await waitForScreen(seat, 'fight', 30_000);
  // Each player's coach is in their own half: the first player's in the left one, the second's showing through
  // from their own game in the right one.
  const { width } = page.viewportSize();
  await expect.poll(async () => {
    const own = await left.locator('#coach').boundingBox();
    return own && own.x + own.width <= width / 2;
  }).toBe(true);
  // (A box in a seat is where it is on the page.)
  await expect.poll(async () => {
    const theirs = await right.locator('#coach').boundingBox();
    return Boolean(theirs) && theirs.x >= width / 2;
  }).toBe(true);
  // A hole in the first player's game where the second player's coach is, which it shows through.
  const holeAtCoach = async () => {
    const coach = await right.locator('#coach').boundingBox();
    if (!coach) return false;
    const cut = await page.locator('iframe.seat').nth(0).evaluate((seat) => seat.style.clipPath);
    const starts = [...cut.matchAll(/M\s*([\d.]+)[\s,]+([\d.]+)/g)].map(([, x, y]) => ({ x: Number(x), y: Number(y) }));
    return starts.some(({ x, y }) => Math.abs(y - coach.y) < 1.5 && x >= coach.x - 1 && x <= coach.x + coach.width / 2);
  };
  await expect.poll(holeAtCoach).toBe(true);

  // Together it's two against two: a computer fighter for each, the same two in both games, the one facing the
  // second player in the first player's game being the second player's own.
  const sides = (seat) => seat.evaluate(() => ({ mine: window.__game.arena.npc.spec.id, theirs: window.__game.arena.foe?.spec.id ?? null }));
  const [one, two] = [await sides(left), await sides(right)];
  expect(one.theirs).toBe(two.mine);
  expect(two.theirs).toBe(one.mine);
  expect(one.mine).not.toBe(one.theirs);
  // When the second player's computer fighter takes its turn at them, which their own game runs, the first
  // player's game, which is the picture, shows it doing so.
  await expect.poll(() => left.evaluate(() => window.__game.game.shownFoe), { timeout: 90_000 }).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/screens/together-one-picture-fight.png' });
});

test('Leap Trail in one picture: the runners keep together, so the second player\'s runner is always in sight', async ({ page }) => {
  test.setTimeout(300_000);
  const seats = await openTogether(page, 'leap-trail', 2, { trailFriends: 'against' });
  const [left] = seats;
  await twoPeople(seats, { name: 'strikes', from: 0.2, playing: true, at: 0.38 });
  for (const seat of seats) await seat.locator('#start').click();
  for (const seat of seats) await waitForScreen(seat, 'choose');
  for (const seat of seats) await seat.locator('#run-start').click();
  for (const seat of seats) await waitForScreen(seat, 'practice', 90_000);
  for (const seat of seats) await seat.locator('#practice-skip').click();
  await expect(view(page)).toHaveAttribute('data-view', 'one', { timeout: 90_000 });
  for (const seat of seats) await waitForScreen(seat, 'run', 30_000);
  await expect.poll(() => left.evaluate(() => window.__game.run.distance), { timeout: 20_000 }).toBeGreaterThan(10);
  // Both read the stars, so the first player is Player 1 in them, not You.
  await expect(left.locator('#run-scores li.is-you')).toContainText('Player 1');

  // The second player steps out of the picture, so their runner waits for them. Even racing each other, the first
  // player's runner waits a few metres on, rather than leaving the other behind the camera.
  for (const seat of seats) await seat.evaluate(() => window.__camera.showPerson(1, null));
  await expect.poll(() => left.evaluate(() => window.__game.run.pack), { timeout: 30_000 }).toBe(0);
  const apart = await left.evaluate(() => window.__game.run.distance - window.__game.mates[0].far);
  expect(apart).toBeGreaterThan(1);
  // A few metres, with the time it takes to slow down from the trail's pace.
  expect(apart).toBeLessThan(6);
  await left.waitForTimeout(1500);
  expect(await left.evaluate(() => window.__game.world.mates[0].shown)).toBe(true);
  await expect(left.locator('#run-pack')).toBeVisible();

  // Back in the picture, they run on together.
  for (const seat of seats) await seat.evaluate(() => window.__camera.showPerson(1, { name: 'strikes', from: 0.2, playing: true, at: 0.38 }));
  await expect.poll(() => left.evaluate(() => window.__game.run.pack), { timeout: 30_000 }).toBe(1);
});

test('Mighty Lift in one picture: the lifters stand as the players do, the first on the left', async ({ page }) => {
  test.setTimeout(300_000);
  const seats = await openTogether(page, 'mighty-lift', 2, { liftClock: 'no' });
  const [left] = seats;
  await twoPeople(seats, { name: 'lifts', from: 0.6, playing: false });
  for (const seat of seats) await seat.locator('#start').click();
  for (const seat of seats) await waitForScreen(seat, 'choose');
  for (const seat of seats) await seat.locator('#lift-start').click();
  for (const seat of seats) await waitForScreen(seat, 'warmup', 90_000);
  for (const seat of seats) await seat.locator('#warm-skip').click();
  await expect(view(page)).toHaveAttribute('data-view', 'one', { timeout: 90_000 });
  const places = await left.evaluate(() => {
    const { world } = window.__game.game;
    return { mine: world.lifter.body.root.position.x, theirs: world.mates.map((mate) => mate.body.root.position.x) };
  });
  expect(places.theirs).toHaveLength(1);
  expect(places.mine).toBeLessThan(places.theirs[0]);
  // And the second player's lifter is there all along, lifting.
  for (const seat of seats) await waitForScreen(seat, 'playing', 30_000);
  const seen = [];
  for (let look = 0; look < 10; look += 1) {
    seen.push(await left.evaluate(() => window.__game.game.world.mates[0].body.root.visible));
    await left.waitForTimeout(200);
  }
  expect(seen).toEqual(Array(10).fill(true));
});

test('Mighty Lift in one picture against each other: the second player has a rig of their own beside the first one\'s, and sees their friend get out as they lift', async ({ page }) => {
  test.setTimeout(300_000);
  const seats = await openTogether(page, 'mighty-lift', 2, { liftClock: 'no', liftFriends: 'against', lifts: 5 });
  const [left, right] = seats;
  await twoPeople(seats, { name: 'lifts', from: 0.6, playing: false });
  for (const seat of seats) await seat.locator('#start').click();
  for (const seat of seats) await waitForScreen(seat, 'choose');
  for (const seat of seats) await seat.locator('#lift-start').click();
  for (const seat of seats) await waitForScreen(seat, 'warmup', 90_000);
  for (const seat of seats) await seat.locator('#warm-skip').click();
  for (const seat of seats) await waitForScreen(seat, 'playing', 90_000);
  await expect(view(page)).toHaveAttribute('data-view', 'one', { timeout: 30_000 });
  // In the first player's game, the picture: the second player's rig, their basket and the friend under it, and how
  // far through their lifts they are, and the first player's own, as on their own.
  const rigs = () => left.evaluate(() => {
    const { world, mates, lifting } = window.__game.game;
    const { second } = world;
    if (!second) return null;
    const [theirs] = world.mates;
    return {
      roped: theirs.roped && theirs.ringAt === second.ring,
      apart: theirs.body.root.position.x - world.lifter.body.root.position.x,
      height: second.thingY,
      out: second.friend?.out ?? 0,
      rescue: second.rescue?.index ?? -1,
      freed: mates[0].freed,
      count: document.querySelector('.lifter-mark-count')?.textContent ?? '',
      mine: { freed: lifting.stats.freed, height: world.thingY },
    };
  });
  const start = await rigs();
  expect(start).not.toBe(null);
  expect(start.roped).toBe(true);
  expect(start.apart).toBeGreaterThan(3);
  expect(start.count).toBe('Lifts 0 / 5');
  await expect(left.locator('#lift-scores li.is-you')).toContainText('Player 1');

  // The first player rests, and the second lifts: their basket goes up on their rig, their friend gets out, and once
  // their game has freed them, the count over them says so. The first player's own rig waits for them.
  await childLifts(left, { lifts: false });
  await childLifts(right);
  await expect.poll(async () => {
    const now = await rigs();
    return now.height > 1.1 && now.out > 0.2;
  }, { timeout: 60_000 }).toBe(true);
  await page.screenshot({ path: 'test-results/screens/together-one-picture-lift-against.png' });
  await expect.poll(async () => {
    const now = await rigs();
    return now.freed >= 1 && now.count === `Lifts ${Math.min(now.freed, 5)} / 5`;
  }, { timeout: 60_000 }).toBe(true);
  await expect.poll(async () => (await rigs()).rescue, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  const end = await rigs();
  expect(end.mine.freed).toBe(0);
  expect(end.mine.height).toBeLessThan(0.1);
  for (const seat of seats) await stopChild(seat);
});
