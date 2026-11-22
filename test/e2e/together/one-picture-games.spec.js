// Eight games two play on one screen in one picture (core/one-picture.js), each together or against each other: the
// first player's game across the whole screen, with the second in it as a friend. What a friend on another computer
// wouldn't see, the second player now couldn't either, so each game shows it in one picture. Each test plays one
// game against each other, through the game's own rules, and checks what both seats make of it, as both seats run
// the same code and must come to the same answers, and where each player's own things are.
import { fileURLToPath } from 'node:url';
import { expect, handsForAll, openTogether, seatsOf, test, waitForScreen } from './helpers.js';

const fakeFace = fileURLToPath(new URL('../fake-face.js', import.meta.url));

/** Two open hands for each player, a bow hand and a string hand, or two wings, in their own part of the camera's picture. */
const twoHandsForAll = (seats) => Promise.all(seats.map((seat) => seat.evaluate(() => window.__camera.showHands([
  { name: 'open', side: 'left', x: 0.08, y: 0.5, scale: 0.6 }, { name: 'open', side: 'right', x: 0.36, y: 0.5, scale: 0.6 },
  { name: 'open', side: 'left', x: 0.6, y: 0.4, scale: 0.6 }, { name: 'open', side: 'right', x: 0.9, y: 0.4, scale: 0.6 },
], { sameHand: false }))));

/** Both seats press their start button and play, and the first one's game is the picture. */
async function intoOnePicture(page, seats) {
  for (const seat of seats) await seat.locator('#start').click();
  for (const seat of seats) await waitForScreen(seat, 'playing', 90_000);
  await expect(page.locator('#seats')).toHaveAttribute('data-view', 'one');
  await expect.poll(() => seats[0].evaluate(() => document.documentElement.dataset.picture)).toBe('one');
}

/**
 * Each player's own things are in their own half of the screen, and none of them is over what both share in the first
 * player's game: shared is where that is, as selectors. Returns what's wrong, which is nothing when all is well.
 */
async function ownThingsApart(page, [left, right], shared) {
  const { width } = page.viewportSize();
  const boxesIn = (seat) => seat.evaluate((selectors) => {
    const seen = (element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      const shown = style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.02 && box.width > 2 && box.height > 2;
      return shown ? { x: box.left, y: box.top, w: box.width, h: box.height, what: element.id || element.className } : null;
    };
    return {
      own: [...document.querySelectorAll('.camera-frame, #prompt, .hands-bar .meter, [data-own]')].map(seen).filter(Boolean),
      shared: selectors.flatMap((selector) => [...document.querySelectorAll(selector)]).map(seen).filter(Boolean),
    };
  }, shared);
  const at = await page.locator('iframe.seat').nth(1).boundingBox();
  const mine = await boxesIn(left);
  const theirs = await boxesIn(right);
  const theirOwn = theirs.own.map((box) => ({ ...box, x: box.x + at.x, y: box.y + at.y }));
  const over = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 2 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 2;
  const wrong = [];
  for (const box of mine.own) if (box.x + box.w > width / 2 + 1) wrong.push(`Player 1's ${box.what} reaches into the right half`);
  for (const box of theirOwn) if (box.x < width / 2 - 1) wrong.push(`Player 2's ${box.what} reaches into the left half`);
  for (const box of [...mine.own, ...theirOwn]) {
    for (const hud of mine.shared) if (over(box, hud)) wrong.push(`${box.what} is over ${hud.what}`);
  }
  return wrong;
}

test('Bounce Back in one picture: the first player plays on the left half of the court and the second on the right, both with the right hand, each named', async ({ page }) => {
  const seats = await openTogether(page, 'bounce-back', 2, { bounceFriends: 'against' });
  await handsForAll(seats);
  await intoOnePicture(page, seats);
  const sides = await Promise.all(seats.map((seat) => seat.evaluate(() => {
    const { game } = window.__game;
    return { left: game.leftSide === game.mine, name: document.querySelector('#score-board .is-mine .score-name').textContent, own: game.court.players[game.mine].name };
  })));
  expect(sides).toEqual([{ left: true, name: 'Player 1', own: 'Player 1' }, { left: false, name: 'Player 2', own: 'Player 2' }]);
  // Each one's part of the camera's picture is across their own half: a hand in the middle of it is in the middle of that half.
  const glove = (seat) => seat.evaluate(() => {
    const { gloves, court } = window.__game;
    return gloves.right.visible ? Math.round((gloves.right.x / court.width) * 4) : null;
  });
  await expect.poll(() => glove(seats[0])).toBe(1);
  await expect.poll(() => glove(seats[1])).toBe(3);
  await expect.poll(() => ownThingsApart(page, seats, ['#score-board'])).toEqual([]);
});

test('Tank Patrol in one picture: the second player\'s crosshair is drawn in the first player\'s game, where theirs has it', async ({ page }) => {
  const seats = await openTogether(page, 'tank-patrol', 2, { tankFriends: 'against' });
  await handsForAll(seats);
  await intoOnePicture(page, seats);
  await expect.poll(async () => {
    const theirs = await seats[1].evaluate(() => {
      const { crosshair } = window.__game.patrol;
      return crosshair.seen ? { x: crosshair.x, z: crosshair.z } : null;
    });
    const shown = await seats[0].evaluate(() => window.__game.field.friendAim);
    return Boolean(theirs && shown && Math.hypot(theirs.x - shown.x, theirs.z - shown.z) < 1.5);
  }).toBe(true);
  expect(await seats[0].locator('#battle-me').textContent()).toBe('Player 1');
  expect(await seats[0].locator('#battle-name').textContent()).toBe('Player 2');
  await expect.poll(() => ownThingsApart(page, seats, ['.hud-top .chips'])).toEqual([]);
});

/** Each seat's bow held where its own game would aim at one of its targets, and let go when window.__loose is set. */
const holdBows = (seats) => Promise.all(seats.map((seat) => seat.evaluate(() => {
  const { game } = window.__game;
  game.bow.read = () => {
    const wants = game.meadow.wants() ?? { angle: 0.3, draw: 0.8 };
    const loosed = window.__loose ? { angle: wants.angle, draw: wants.draw } : null;
    window.__loose = false;
    return { bowSeen: true, stringSeen: true, both: true, nocked: !loosed, angle: wants.angle, draw: wants.draw, apart: 3, loosed, slack: false };
  };
})));

test('Arrow Meadow in one picture: the second player is an archer of their own, a step in front, each shooting from where they stand at a lane of their own', async ({ page }) => {
  const seats = await openTogether(page, 'arrow-meadow', 2, { arrowFriends: 'against' });
  await twoHandsForAll(seats);
  await intoOnePicture(page, seats);
  await holdBows(seats);
  const read = () => Promise.all(seats.map((seat) => seat.evaluate(() => {
    const { meadow, game } = window.__game;
    const targets = meadow.targets.filter(({ state }) => state === 'up').map(({ k, x, lane }) => ({ k, x: Math.round(x * 1000), theirs: Boolean(lane) }));
    return { stand: meadow.stand, hits: meadow.stats.hits, others: game.others.map(({ stand, art, driver }) => ({ stand, art: Boolean(art), driver })), targets };
  })));
  const [one, two] = await read();
  expect(one.stand).toBe(0);
  expect(two.stand).toBeCloseTo(0.3, 5);
  expect(one.others).toEqual([{ stand: two.stand, art: true, driver: 'truffle' }]);
  expect(two.others[0].stand).toBe(0);
  // Each lets an arrow go at their own target: it's a hit for each, and the next targets come, each further on than
  // the last by as far as its archer stands in front, the same in both games.
  for (const seat of seats) await seat.evaluate(() => { window.__loose = true; });
  await expect.poll(async () => (await read()).map(({ hits }) => hits)).toEqual([1, 1]);
  await expect.poll(async () => {
    const [first, second] = await read();
    const own = (state) => state.targets.find(({ theirs, k }) => !theirs && k === 1);
    const lane = (state) => state.targets.find(({ theirs, k }) => theirs && k === 1);
    return Boolean(own(first) && lane(first) && own(second) && lane(second))
      && lane(first).x === own(second).x && lane(second).x === own(first).x && own(second).x - own(first).x === 300;
  }).toBe(true);
  await expect.poll(() => ownThingsApart(page, seats, ['.arrow-hud'])).toEqual([]);
});

test('Giraffe\'s Maze in one picture: racing, the two are in the same maze, the first out takes it and brings the other on, and the first out of the last maze wins', async ({ page }) => {
  const seats = await openTogether(page, 'giraffe-maze', 2, { mazeFriends: 'against', mazes: 2, mazeSize: 'easy' });
  await handsForAll(seats);
  await intoOnePicture(page, seats);
  await expect.poll(() => ownThingsApart(page, seats, ['.maze-hud'])).toEqual([]);
  // Each character goes along the way out of the maze numbered window.__lead in its seat, as the game's film leads it.
  for (const seat of seats) {
    await seat.evaluate(() => {
      const { game } = window.__game;
      const real = game.input.bind(game);
      game.input = (snapshot) => {
        if (window.__lead !== game.run.index || game.run.phase !== 'walking') return { ...real(snapshot), open: false };
        const to = game.run.wayAhead();
        return { target: to, glove: to, open: true, gloveSpeed: 0.3 };
      };
    });
  }
  const lead = (seat, maze) => seat.evaluate((value) => { window.__lead = value; }, maze);
  const read = () => Promise.all(seats.map((seat) => seat.evaluate(() => {
    const { game } = window.__game;
    const you = game.friends.room.you;
    const { out, carried } = game.run.stats;
    return { index: game.run.index, phase: game.run.phase, out, carried, taken: [...game.taken.entries()].map(([k, by]) => `${k}:${by === you ? 'me' : 'them'}`).join(',') };
  })));
  // The first player leads the way out of the first maze. The second, still in it, is brought on to the next.
  await lead(seats[0], 0);
  await expect.poll(async () => (await read()).map(({ index, phase }) => `${index} ${phase}`), { timeout: 60_000 }).toEqual(['1 walking', '1 walking']);
  const [first, second] = await read();
  expect([first.out, first.carried, first.taken]).toEqual([1, 0, '0:me']);
  expect([second.out, second.carried, second.taken]).toEqual([0, 1, '0:them']);
  // The second player leads the way out of the last maze.
  await lead(seats[1], 1);
  for (const seat of seats) await waitForScreen(seat, 'finish', 60_000);
  const [one, two] = await read();
  expect(one.taken).toBe('0:me,1:them');
  expect(two.taken).toBe('0:them,1:me');
  await expect(seats[0].locator('#screen-finish h2')).toHaveText('You made it out!');
  await expect(seats[1].locator('#screen-finish h2')).toHaveText('You were first out!');
  const places = (seat) => seat.locator('#screen-finish li').evaluateAll((rows) => rows.map((row) => row.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).map((row) => row.replace(/ \d+:\d+\.\d$/, '')));
  await expect.poll(() => places(seats[0])).toEqual(['1st Player 2', '2nd You']);
  await expect.poll(() => places(seats[1])).toEqual(['1st You', '2nd Player 1']);
});

test('Gobble and Grow in one picture: against each other there\'s one soup, what one eats is gone for both, and each grows by their own bites', async ({ page }) => {
  test.setTimeout(300_000);
  await page.addInitScript({ path: fakeFace });
  await page.addInitScript((saved) => localStorage.setItem('camera-games-settings', JSON.stringify(saved)), { voice: false, sound: false, settled: true, gobbleFriends: 'against', gobbleMove: 'mouth', gobbleBites: 8 });
  await page.goto('/together.html?game=gobble-grow&players=2&debug');
  const seats = await seatsOf(page, 2);
  for (const seat of seats) await expect(seat.locator('#friends-here li')).toHaveCount(2, { timeout: 90_000 });
  for (const seat of seats) await seat.locator('#start').click();
  // The mouth check: open wide, and shut.
  await page.waitForTimeout(2500);
  for (const seat of seats) await seat.evaluate(() => window.__face.show({ open: 0.4 }));
  await page.waitForTimeout(1500);
  for (const seat of seats) await seat.evaluate(() => window.__face.show({ open: 0.01 }));
  for (const seat of seats) await waitForScreen(seat, 'playing', 90_000);
  await expect(page.locator('#seats')).toHaveAttribute('data-view', 'one');
  const read = () => Promise.all(seats.map((seat) => seat.evaluate(() => {
    const { soup, game } = window.__game;
    return { shared: soup.shared, eaten: soup.eaten, goal: soup.goal, r: soup.creature.r, counted: [...(soup.counted ?? [])].sort((a, b) => a - b).join(','), friend: game.friendsShown()[0] ?? null };
  })));
  const [first] = await read();
  expect(first.shared).toBe(true);
  expect(first.goal).toBe(8);
  // Both creatures swim to their food by themselves, and both mouths open and shut, until each has had a few bites.
  for (let turn = 0; turn < 60; turn += 1) {
    for (const seat of seats) await seat.evaluate(() => window.__face.show({ open: 0.4 }));
    await page.waitForTimeout(700);
    for (const seat of seats) await seat.evaluate(() => window.__face.show({ open: 0.01 }));
    await page.waitForTimeout(500);
    const now = await read();
    if (now.every(({ eaten }) => eaten >= 2)) break;
  }
  // The room says whose each thing was, so both games have the same things eaten, each by one of them only.
  await expect.poll(async () => {
    const [one, two] = await read();
    return one.counted === two.counted && one.counted.split(',').length === one.eaten + two.eaten && one.eaten >= 2 && two.eaten >= 2;
  }).toBe(true);
  // Each is as big as their own bites make them, the other's as solid as their own, with their name.
  await expect.poll(async () => {
    const [one, two] = await read();
    return one.friend.solid && Math.abs(one.friend.r - two.r) < 0.0005 && Math.abs(two.friend.r - one.r) < 0.0005 && /^Player 2 \d+$/.test(one.friend.name);
  }).toBe(true);
  await expect.poll(() => ownThingsApart(page, seats, ['.gobble-hud'])).toEqual([]);
});

test('Flap, Little Chick! in one picture: the second player\'s chick is blue, on the far side of the track, and racing, the two are kept within sight of each other', async ({ page }) => {
  const seats = await openTogether(page, 'chick-flap', 2, { flapFriends: 'against', flapWay: 'short', flapFox: 'tumble' });
  await twoHandsForAll(seats);
  await intoOnePicture(page, seats);
  // Each seat's wings flap whenever its own game says a flap is wanted, while window.__flap is on there.
  for (const seat of seats) {
    await seat.evaluate(() => {
      const { game } = window.__game;
      let last = 0;
      game.readWings = () => {
        if (!window.__flap) return [];
        const want = game.farm.wants();
        if (want.wings < 1 || game.farm.chick.air || performance.now() - last < 450) return [];
        last = performance.now();
        return want.wings >= 2 ? ['left', 'right'] : ['left'];
      };
    });
  }
  const look = await seats[0].evaluate(() => {
    const [ghost] = window.__game.game.ghosts;
    return { body: ghost.look.body, back: ghost.back, name: window.__game.game.name };
  });
  expect(look).toEqual({ body: '#9ad8f5', back: 1, name: 'Player 1' });
  // Only the second player flaps: their chick gets over what's in the way and goes on ahead, and waits on the ground
  // once it's as far ahead as a flock lets one be, so both are on the screen.
  await seats[1].evaluate(() => { window.__flap = true; });
  const read = () => Promise.all(seats.map((seat) => seat.evaluate(() => {
    const { chick } = window.__game.farm;
    return { x: chick.x, flockWait: chick.flockWait };
  })));
  await expect.poll(async () => (await read())[1].flockWait, { timeout: 60_000 }).toBe(true);
  const [one, two] = await read();
  expect(two.x - one.x).toBeGreaterThan(3);
  expect(two.x - one.x).toBeLessThan(3.6);
  await expect.poll(() => ownThingsApart(page, seats, ['.story.is-visible'])).toEqual([]);
});

/**
 * Leads a seat's open hand, in its own half of the camera's picture, through the real tracker, to wherever a child
 * would go next: in Giraffe's Paint Box to paint (see guide in games/giraffe-paint/paint.js), and in Giraffe's
 * Puzzles to a loose piece, or with one to its place (see wants in games/giraffe-puzzles/puzzle.js).
 */
const leadHand = (seat, index) => seat.evaluate((i) => {
  clearInterval(window.__lead);
  let [x, y] = [i === 0 ? 0.25 : 0.75, 0.5];
  window.__lead = setInterval(() => {
    const { game, painting, puzzle } = window.__game;
    // Where the hand is and where it's going, and how far across the camera's picture a step on the sheet or the
    // table is: the sheet is 150 by 100, the table 2 by 1.
    const at = painting ? game.brushOnSheet() : game.gloveOnTable();
    const wanted = at && (painting ? painting.guide(at) : puzzle.wants(at));
    const [across, down] = painting ? [0.0004, 0.0006] : [0.025, 0.04];
    if (wanted) {
      x += (wanted.x - at.x) * across;
      y += (wanted.y - at.y) * down;
    }
    x = i === 0 ? Math.max(0.04, Math.min(0.46, x)) : Math.max(0.54, Math.min(0.96, x));
    y = Math.max(0.2, Math.min(0.88, y));
    window.__camera.showHands([{ name: 'open', side: 'right', x, y, scale: 0.75 }], { sameHand: true });
  }, 33);
}, index);

/** Player 1 rests, with a closed hand in the middle of their part of the camera's picture. */
const firstRests = (seats) => seats[0].evaluate(() => window.__camera.showHands([{ name: 'fist', side: 'right', x: 0.25, y: 0.5, scale: 0.75 }], { sameHand: true }));

test('Giraffe\'s Paint Box in one picture: against each other the two paint one sheet, each sees the other\'s strokes, and whoever paints the most parts is first', async ({ page }) => {
  test.setTimeout(300_000);
  const seats = await openTogether(page, 'giraffe-paint', 2, { paintFriends: 'against' });
  await handsForAll(seats);
  await intoOnePicture(page, seats);
  const read = () => Promise.all(seats.map((seat) => seat.evaluate(() => {
    const { game, painting } = window.__game;
    const you = game.friends.room.you;
    const tally = Object.fromEntries([...painting.tally].map(([id, n]) => [id === you ? 'me' : 'them', n]));
    return {
      mode: game.mode,
      covered: painting.toPaint.reduce((sum, part) => sum + part.covered, 0),
      own: painting.stats.cells,
      done: painting.done,
      toPaint: painting.toPaint.length,
      tally,
      seen: game.friendBrushes[0]?.fade ?? 0,
    };
  })));
  expect((await read()).map(({ mode }) => mode)).toEqual(['against', 'against']);
  await expect(seats[0].locator('#chip-time-box')).toBeVisible();
  // Player 1 rests, with the brush lifted, and Player 2 paints: their glove and their strokes are on the sheet both
  // see, which is Player 1's.
  await firstRests(seats);
  await page.waitForTimeout(1000);
  const [resting] = await read();
  await leadHand(seats[1], 1);
  await expect.poll(async () => {
    const [one] = await read();
    return one.covered > resting.covered + 150 && one.own === resting.own && one.seen > 0.5;
  }, { timeout: 60_000 }).toBe(true);
  await expect.poll(() => ownThingsApart(page, seats, ['.paint-hud .chip', '#paint-scores li'])).toEqual([]);
  // Then both paint, and between them the picture is done on both sheets, each part whoever's stroke finished it.
  await leadHand(seats[0], 0);
  for (const seat of seats) await waitForScreen(seat, 'finish', 120_000);
  for (const seat of seats) await seat.evaluate(() => clearInterval(window.__lead));
  const [one, two] = await read();
  expect(one.done && two.done).toBe(true);
  expect(one.tally).toEqual({ me: two.tally.them, them: two.tally.me });
  expect((one.tally.me ?? 0) + (one.tally.them ?? 0)).toBe(one.toPaint);
  expect(one.tally.them).toBeGreaterThan(0);
  // Each is placed by how many parts they painted, the most first, on their own card in their own half.
  const [best, other] = (one.tally.me ?? 0) > (one.tally.them ?? 0) ? [seats[0], seats[1]] : [seats[1], seats[0]];
  await expect(best.locator('#screen-finish h2')).toHaveText('You painted the most!');
  await expect(other.locator('#screen-finish h2')).toHaveText('Lovely painting!');
  for (const seat of seats) {
    const rows = seat.locator('.friends-results li');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText(/1st.*\d+ parts?/);
    await expect(rows.nth(1)).toContainText(/2nd.*\d+ parts?/);
  }
  await expect(best.locator('.friends-results li').first()).toContainText('You');
});

test('Giraffe\'s Puzzles in one picture: against each other the two mend one puzzle, each sees the other\'s glove and pieces, and whoever puts in the most is first', async ({ page }) => {
  test.setTimeout(300_000);
  const seats = await openTogether(page, 'giraffe-puzzles', 2, { puzzleFriends: 'against' });
  await handsForAll(seats);
  await intoOnePicture(page, seats);
  const read = () => Promise.all(seats.map((seat) => seat.evaluate(() => {
    const { game, puzzle } = window.__game;
    const you = game.friends.room.you;
    const tally = Object.fromEntries([...puzzle.tally].map(([id, n]) => [id === you ? 'me' : 'them', n]));
    return { mode: game.mode, own: puzzle.stats.placed, done: puzzle.done, total: puzzle.total, tally, seen: game.friendHands[0]?.fade ?? 0, chip: document.getElementById('chip-pieces').textContent };
  })));
  expect((await read()).map(({ mode }) => mode)).toEqual(['against', 'against']);
  // Player 1 rests, and Player 2 puts pieces in: their glove, and their pieces going in, are on the table both see,
  // which is Player 1's.
  await firstRests(seats);
  await page.waitForTimeout(1000);
  const [resting] = await read();
  await leadHand(seats[1], 1);
  await expect.poll(async () => {
    const [one, two] = await read();
    return one.own === resting.own && two.own >= 2 && (one.tally.them ?? 0) === two.own && one.seen > 0.5 && one.chip.startsWith(`${one.own + two.own} of`);
  }, { timeout: 60_000 }).toBe(true);
  await expect.poll(() => ownThingsApart(page, seats, ['.puzzle-hud .chip', '#puzzle-scores li'])).toEqual([]);
  // Then both play, and between them the puzzle is done in both games, each piece whoever put it in.
  await leadHand(seats[0], 0);
  for (const seat of seats) await waitForScreen(seat, 'finish', 120_000);
  for (const seat of seats) await seat.evaluate(() => clearInterval(window.__lead));
  const [one, two] = await read();
  expect(one.done && two.done).toBe(true);
  expect(one.tally).toEqual({ me: two.tally.them, them: two.tally.me });
  expect([one.tally.me, one.tally.them]).toEqual([one.own, two.own]);
  expect(one.own + two.own).toBe(one.total);
  // Each is placed by how many pieces they put in, the most first, on their own card in their own half.
  if (one.own === two.own) {
    for (const seat of seats) await expect(seat.locator('#screen-finish h2')).toHaveText('You did it!');
    return;
  }
  const [best, other] = one.own > two.own ? [seats[0], seats[1]] : [seats[1], seats[0]];
  await expect(best.locator('#screen-finish h2')).toHaveText('You put in the most pieces!');
  await expect(other.locator('#screen-finish h2')).toHaveText('You did it!');
  for (const seat of seats) {
    const rows = seat.locator('.friends-results li');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText(/1st.*\d+ pieces?/);
    await expect(rows.nth(1)).toContainText(/2nd.*\d+ pieces?/);
  }
  await expect(best.locator('.friends-results li').first()).toContainText('You');
});
