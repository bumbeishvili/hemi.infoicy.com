// Two on one screen, in the hand games they play in one picture (see core/one-picture.js): the second player is in
// the first player's game as a friend on another computer is, but right there playing too, so their glove is solid
// and in a blue of its own, over the first player's, and each player's own things keep clear of the other's and of
// what both of them share.
import { expect, handsForAll, openTogether, test, waitForScreen } from './helpers.js';

// What both players share in each game, seen in the first player's game across the screen: counts, scores, what's
// said, the sum, the ticket, the dots, and the little film where it's the same for both.
const SHARED = {
  'balloon-pop': ['.hud-top .chip', '#pop-scores li', '.maths-question'],
  lighthouse: ['.hud-top .chip', '#light-scores li', '#story', '.film'],
  'smoothie-stand': ['.hud-top .chip', '#stand-scores li', '#story', '.order-item'],
  'spider-catcher': ['.hud-top .chip', '#spider-scores li', '#story', '.spider-dots'],
  'giraffe-garden': ['.garden-hud .chip', '#garden-scores li', '#story', '.film'],
  'giraffe-puzzles': ['.puzzle-hud .chip', '#puzzle-scores li', '#story', '.film'],
  'giraffe-paint': ['.paint-hud .chip', '#paint-scores li', '#story', '.film'],
  'riddle-doors': ['.doors-hud .chip', '#door-scores li', '#story', '.film'],
};

// The games whose friends' gloves are open or closed as their hands are: in the others a friend's glove only ever holds
// something, the can or the brush.
const SHOWS_CLOSED = new Set(['balloon-pop', 'lighthouse', 'smoothie-stand', 'spider-catcher', 'giraffe-puzzles', 'riddle-doors']);

// A player's own things, as core/one-picture.js has them, with the hand meters one by one.
const OWN = ['.camera-frame', '#prompt', '#coach', '.tally', '.hands-bar .meter', '[data-own]'];

/** Where each of these is seen in a seat, as boxes on the page: at = where the seat is on the page. */
const boxesIn = (seat, selectors, at) => seat.evaluate(([list, { x, y }]) => list.flatMap((selector) => [...document.querySelectorAll(selector)].flatMap((element) => {
  const style = getComputedStyle(element);
  const box = element.getBoundingClientRect();
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.02 || box.width < 2 || box.height < 2) return [];
  return [{ what: `${selector} ${element.textContent.trim().slice(0, 30)}`, x: box.left + x, y: box.top + y, w: box.width, h: box.height }];
})), [selectors, at]);

const overlap = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1;

/** Pairs of boxes from the two lists that sit on each other. */
const clashes = (some, others) => some.flatMap((a) => others.filter((b) => overlap(a, b)).map((b) => `${a.what} on ${b.what}`));

/**
 * In the first player's game: where the second player's glove is drawn and how far it has faded in, and the colour of
 * the picture at its palm, between its middle and its wrist, so clear of anything it holds there.
 */
const secondGlove = (seat, game) => seat.evaluate((name) => {
  const { game: it } = window.__game;
  const find = {
    'balloon-pop': () => ({ view: it.field, each: it.friendsGloves[0] }),
    lighthouse: () => ({ view: it.room, each: it.friendGloves[0] }),
    'smoothie-stand': () => ({ view: it.field, each: it.friendsGloves[0] }),
    'spider-catcher': () => ({ view: it.garden, each: it.garden.friendsGloves[0] }),
    'giraffe-garden': () => ({ view: it.view, each: it.friendCans[0] }),
    'giraffe-puzzles': () => ({ view: it.view, each: it.friendHands[0] }),
    'giraffe-paint': () => ({ view: it.view, each: it.friendBrushes[0], at: (each) => it.view.at(each.at.x, each.at.y) }),
    'riddle-doors': () => ({ view: it.view, each: it.friendHands[0] }),
  }[name]();
  const { view, each } = find;
  if (!each?.glove.visible) return null;
  const { glove } = each;
  const at = find.at ? find.at(each) : { x: glove.x, y: glove.y };
  const wrist = glove.points[0];
  const x = at.x + wrist.x * 0.45;
  const y = at.y + wrist.y * 0.45;
  const [r, g, b] = view.ctx.getImageData(Math.round(x * view.ratio), Math.round(y * view.ratio), 1, 1).data;
  return { fade: each.fade, open: glove.status === 'open', colour: [r, g, b] };
}, game);

/** Whether a colour is the second player's blue, open or not: never the first player's green or yellow, or grey. */
const isBlue = ([r, g, b]) => b >= 200 && b - r >= 80 && b - g >= 70;

/**
 * In the first player's game, for a moment: the order the gloves are drawn in, 'own' for the first player's and
 * 'second' for the second player's.
 */
const drawOrder = (seat, game) => seat.evaluate(async (name) => {
  const { game: it } = window.__game;
  const pairs = {
    'balloon-pop': () => [it.field.gloves.right, it.friendsGloves[0].glove],
    lighthouse: () => [it.room.gloves.right, it.friendGloves[0].glove],
    'smoothie-stand': () => [it.field.gloves.right, it.friendsGloves[0].glove],
    'spider-catcher': () => [it.garden.gloves.right, it.garden.friendsGloves[0].glove],
    'giraffe-garden': () => [it.gloves.right, it.friendCans[0].glove],
    'giraffe-puzzles': () => [it.gloves.right, it.friendHands[0].glove],
    'giraffe-paint': () => [it.gloves.right, it.friendBrushes[0].glove],
    'riddle-doors': () => [it.gloves.right, it.friendHands[0].glove],
  };
  const [own, second] = pairs[name]();
  const order = [];
  const spy = (glove, label) => {
    const draw = glove.draw;
    glove.draw = function drawn(...args) {
      order.push(label);
      return draw.apply(this, args);
    };
    return () => {
      glove.draw = draw;
    };
  };
  const undo = [spy(own, 'own'), spy(second, 'second')];
  await new Promise((resolve) => setTimeout(resolve, 400));
  for (const each of undo) each();
  return order;
}, game);

/** A hand for each player, in the middle of their own part of the camera's picture, open or not. */
async function hands(seats, [first, second]) {
  const list = [{ name: first, side: 'right', x: 0.25, y: 0.5, scale: 0.75 }, { name: second, side: 'right', x: 0.75, y: 0.5, scale: 0.75 }];
  for (const seat of seats) await seat.evaluate((all) => window.__camera.showHands(all, { sameHand: true }), list);
}

for (const game of Object.keys(SHARED)) {
  test(`${game}: in one picture, the second player's glove is solid and blue, over the first's, and each one's own things keep clear`, async ({ page }) => {
    test.setTimeout(240_000);
    const [left, right] = await openTogether(page, game);
    const [first, second] = [page.locator('iframe.seat').nth(0), page.locator('iframe.seat').nth(1)];
    await handsForAll([left, right]);
    await left.locator('#start').click();
    await right.locator('#start').click();
    await waitForScreen(left, 'playing');
    await waitForScreen(right, 'playing');
    await expect(page.locator('#seats')).toHaveAttribute('data-view', 'one');
    await expect.poll(() => left.evaluate(() => document.documentElement.dataset.picture)).toBe('one');
    await expect.poll(() => right.evaluate(() => document.documentElement.dataset.picture)).toBe('under');
    const { width } = page.viewportSize();
    await expect.poll(async () => (await first.boundingBox()).width, { timeout: 5000 }).toBe(width);

    // The second player's glove is in the first player's game, solid, in their blue, open, and drawn after the first
    // player's, so it's over it wherever the two meet.
    await expect.poll(async () => (await secondGlove(left, game))?.fade ?? 0, { timeout: 20_000 }).toBeGreaterThan(0.95);
    await expect.poll(async () => {
      const seen = await secondGlove(left, game);
      return Boolean(seen?.open && isBlue(seen.colour));
    }, { timeout: 10_000 }).toBe(true);
    const order = await drawOrder(left, game);
    expect(order).toContain('own');
    expect(order.at(-1)).toBe('second');
    // Both read the scores, so the first player is Player 1 in them, not You.
    await expect(left.locator(`${SHARED[game][1]}.is-you`)).toContainText('Player 1');

    // Each player's own things keep off the other's, and off what both share, while they play.
    const theirs = await second.boundingBox();
    const check = async () => {
      const mine = await boxesIn(left, OWN, { x: 0, y: 0 });
      const others = await boxesIn(right, OWN, theirs);
      const shared = await boxesIn(left, SHARED[game], { x: 0, y: 0 });
      expect(mine.length).toBeGreaterThan(1);
      expect(others.length).toBeGreaterThan(1);
      // The first player's in the left half, the second player's in the right.
      for (const box of mine) expect(box.x + box.w, box.what).toBeLessThanOrEqual(width / 2 + 1);
      for (const box of others) expect(box.x, box.what).toBeGreaterThanOrEqual(width / 2 - 1);
      expect([...clashes(mine, others), ...clashes(mine, shared), ...clashes(others, shared)]).toEqual([]);
    };
    await check();
    await page.screenshot({ path: `test-results/screens/one-picture-${game}.png` });

    // With a hand closed, what each one is asked shows, and still keeps clear; the second player's glove is a deeper
    // blue, as the first player's is yellow then.
    await hands([left, right], ['fist', 'fist']);
    if (SHOWS_CLOSED.has(game)) {
      await expect.poll(async () => {
        const seen = await secondGlove(left, game);
        return Boolean(seen && !seen.open && isBlue(seen.colour));
      }, { timeout: 10_000 }).toBe(true);
    }
    await page.waitForTimeout(3500);
    await check();
    await page.screenshot({ path: `test-results/screens/one-picture-${game}-closed.png` });
  });
}

/* ---------- Spider Catcher: home at the web each player sees ---------- */

/**
 * Each player's hand, as both seats' cameras show it, open or a fist. Given somewhere to go, it's moved a little each
 * moment until the player's glove is there in their own game: by a spider, given its index, or at 'web', where the
 * web they see in the one picture is in their game. Each hand stays in its own player's half of the picture.
 */
const steering = (page) => page.evaluate(() => {
  const seats = () => [...document.querySelectorAll('iframe.seat')].map((seat) => seat.contentWindow);
  const hands = [0.25, 0.75].map((x) => ({ name: 'open', side: 'right', x, y: 0.5, scale: 0.75 }));
  const show = () => {
    for (const seat of seats()) seat.__camera.showHands(hands.map((hand) => ({ ...hand })), { sameHand: true });
  };
  let timer = 0;
  window.__hand = (player, name, to = null) => {
    clearInterval(timer);
    hands[player].name = name;
    show();
    if (to === null) return;
    timer = setInterval(() => {
      const own = seats()[player].__game.garden;
      const glove = own.gloves[own.side];
      const shown = seats()[0].__game.garden;
      const web = shown.toCommon(shown.web.x, shown.web.y);
      const target = to === 'web' ? own.fromCommon(web.x, web.y) : own.spiders.find((spider) => spider.index === to);
      if (glove.visible && target) {
        const [from, upTo] = player ? [0.5, 1] : [0, 0.5];
        hands[player].x = Math.min(upTo, Math.max(from, hands[player].x + ((target.x - glove.x) / own.width) * 0.12));
        hands[player].y += ((target.y - glove.y) / own.height) * 0.25;
      }
      show();
    }, 70);
  };
  show();
});

const handIs = (page, player, name, to = null) => page.evaluate(([who, shape, where]) => window.__hand(who, shape, where), [player, name, to]);

/** In a seat's game: which spider the glove holds, how many its player has brought home, and how one spider is. */
const caught = (seat, index) => seat.evaluate((which) => {
  const { garden } = window.__game;
  return { holding: garden.holding?.index ?? null, mine: garden.mine, state: garden.spiders.find((spider) => spider.index === which)?.state ?? 'gone' };
}, index);

/** How far from the web a player's glove is in the one picture, the first player's game, in the web's reach. */
const offWeb = (left, player) => left.evaluate((which) => {
  const { garden } = window.__game;
  const glove = which ? garden.friendsGloves[0]?.glove : garden.gloves[garden.side];
  return glove?.visible ? Math.hypot(glove.x - garden.web.x, glove.y - garden.web.y) / garden.web.reach : 99;
}, player);

test('spider-catcher: in one picture, each player catches a spider and opens their hand at the web they see, and it goes home', async ({ page }) => {
  test.setTimeout(240_000);
  const seats = await openTogether(page, 'spider-catcher');
  const [left] = seats;
  await steering(page);
  for (const seat of seats) await seat.locator('#start').click();
  for (const seat of seats) await waitForScreen(seat, 'playing');
  await expect(page.locator('#seats')).toHaveAttribute('data-view', 'one');
  const { width } = page.viewportSize();
  await expect.poll(async () => (await page.locator('iframe.seat').nth(0).boundingBox()).width, { timeout: 5000 }).toBe(width);

  for (const [player, own] of seats.entries()) {
    // The spiders held still, in the same places in both games, so a hand can be put on one.
    await expect.poll(() => own.evaluate(() => window.__game.garden.spiders.some((spider) => window.__game.garden.catchable(spider))), { timeout: 15_000 }).toBe(true);
    for (const seat of seats) await seat.evaluate(() => window.__game.garden.spiders.forEach((spider) => { spider.path.rate = 0; }));
    const spider = await own.evaluate(() => window.__game.garden.spiders.find((each) => window.__game.garden.catchable(each)).index);

    // An open hand onto it, which closes.
    await handIs(page, player, 'open', spider);
    await expect.poll(() => own.evaluate((index) => {
      const { garden } = window.__game;
      const glove = garden.gloves[garden.side];
      const it = garden.spiders.find((each) => each.index === index);
      return glove.visible && Math.hypot(glove.x - it.x, glove.y - it.y) < 20;
    }, spider), { timeout: 30_000 }).toBe(true);
    await page.waitForTimeout(400);
    await handIs(page, player, 'fist', spider);
    await expect.poll(async () => (await caught(own, spider)).holding, { timeout: 15_000 }).toBe(spider);

    // To the web, as the player sees it: their glove is on it in the one picture, the second player's in blue.
    await handIs(page, player, 'fist', 'web');
    await expect.poll(() => offWeb(left, player), { timeout: 20_000 }).toBeLessThan(0.5);
    await page.waitForTimeout(600);
    expect(await offWeb(left, player)).toBeLessThan(0.5);

    // Opening the hand there lets the spider into the web, and it's that player's. The other game hears of it as the
    // next word from this one comes.
    await handIs(page, player, 'open');
    await expect.poll(async () => (await caught(own, spider)).mine, { timeout: 10_000 }).toBe(1);
    for (const seat of seats) await expect.poll(async () => ['landing', 'home'].includes((await caught(seat, spider)).state), { timeout: 5000 }).toBe(true);
  }
  // One each, in the scores both read.
  await expect.poll(() => left.evaluate(() => [window.__game.garden.mine, window.__game.game.friendsGloves[0]?.n])).toEqual([1, 1]);
  await page.screenshot({ path: 'test-results/screens/one-picture-spider-catcher-home.png' });
});
