// Friends in Giraffe's Maze, together, as the game comes: each on their own computer with their own camera, in the
// same mazes, on the same side. Everyone looks for the way out, and whoever finds it takes the others on to the next
// maze with them. Nobody is placed. Here they're separate browsers, talking through the race server on this
// computer (tools/race-server.mjs).
import { expect, openGame, shot, show, test, waitForScreen } from '../helpers.js';
import { allPlaying, expectSoon, FIST, GAME, joinGame, judge, leadHand, makeGame, OPEN, secondPlayer, state, stopHand, watchBrightness } from './helpers.js';

/** How it is on one child's screen. */
const view = (page) => page.evaluate(() => {
  const { game, run, session } = window.__game;
  return {
    team: game.team,
    race: run.race,
    index: run.index,
    phase: run.phase,
    out: run.stats.out,
    carried: run.stats.carried,
    fruit: run.stats.fruit,
    at: { ...run.position },
    board: [...document.querySelectorAll('#maze-race li')].map((row) => ({ name: row.querySelector('.maze-race-name').textContent, out: Number(row.dataset.out), face: !row.querySelector('img').hidden })),
    finishLine: session.finishLine,
    ownLevel: session.levels.current,
  };
});

/** Keeps everything the words at the top of the screen say, from now on. */
const keepPrompts = (page) => page.evaluate(() => {
  window.__prompts = [];
  const words = document.getElementById('prompt-text');
  new MutationObserver(() => window.__prompts.push(words.textContent)).observe(words, { childList: true, characterData: true, subtree: true });
});
const prompts = (page) => page.evaluate(() => window.__prompts);

/**
 * Keeps what the rules say, frame by frame, from now on: the phase, the maze, and where the character is. Only a
 * frame where any of that changes is kept. A phase that lasts a second is easily missed by asking now and then.
 */
const keepPhases = (page) => page.evaluate(() => {
  window.__phases = [];
  const look = () => {
    const { run } = window.__game;
    const { x, y } = run.position;
    const last = window.__phases.at(-1);
    if (!last || last.phase !== run.phase || last.index !== run.index || Math.hypot(last.x - x, last.y - y) > 0.001) {
      window.__phases.push({ phase: run.phase, index: run.index, x, y, at: Date.now() });
    }
    requestAnimationFrame(look);
  };
  requestAnimationFrame(look);
});
const phases = (page) => page.evaluate(() => window.__phases);

/** Each time the character went into this phase, as the first frame of it. */
const into = (kept, phase) => kept.filter((each, at) => each.phase === phase && kept[at - 1]?.phase !== phase);

/** Waits until this child's game sees the hand closed and the character has stopped where it is. */
const resting = (page) => expectSoon(() => page.evaluate(() => window.__game.monitor.snapshot.handOpen === false && !window.__game.run.moving), { timeout: 20_000 }).toBe(true);

/** Where the way into the maze being walked is. */
const wayIn = (page) => page.evaluate(() => {
  const { layout } = window.__game.run;
  return layout.maze.centre(layout.start);
});

/** Keeps each board shown at the top, from now on, as [name, mazes out of] for each line on it. */
const keepBoards = (page) => page.evaluate(() => {
  window.__boards = [];
  const list = document.getElementById('maze-race');
  const read = () => [...list.querySelectorAll('li')].map((row) => [row.querySelector('.maze-race-name').textContent, Number(row.dataset.out)]);
  new MutationObserver(() => window.__boards.push(read())).observe(list, { childList: true });
});
const boardsSeen = (page) => page.evaluate(() => window.__boards);

/** How many steps along the paths the character is from the way out, or -1 once it isn't walking the maze. */
const stepsOut = (page) => page.evaluate(() => {
  const { run } = window.__game;
  if (run.phase !== 'walking') return -1;
  const { maze, goal } = run.layout;
  const steps = new Map([[goal, 0]]);
  for (const queue = [goal]; queue.length;) {
    const cell = queue.shift();
    for (let d = 0; d < 4; d += 1) {
      const next = maze.next(cell, d);
      if (maze.isOpen(cell, d) && !steps.has(next)) {
        steps.set(next, steps.get(cell) + 1);
        queue.push(next);
      }
    }
  }
  return steps.get(run.walker.a);
});

/**
 * This child's connection goes for a moment, as wifi can: for this long nothing from the friends gets here, and then
 * the connection is made again, as the same player, as it is after any break.
 */
const loseConnection = (page, ms) => page.evaluate((gap) => {
  const { room } = window.__game.game.friends;
  room.hear = () => {};
  setTimeout(() => {
    delete room.hear;
    room.socket?.close();
  }, gap);
}, ms);

/** What each game is, for whether anything of a game before is still there. */
const kind = (page) => page.evaluate(() => {
  const { game, run, session } = window.__game;
  return {
    mode: game.mode,
    team: game.team,
    race: run.race,
    timed: run.timed,
    lost: run.layout.lost.length,
    finishLine: session.finishLine,
    teamMark: document.body.hasAttribute('data-friends-team'),
    raceMark: document.body.hasAttribute('data-friends-race'),
  };
});

test('together, as the game comes: whoever finds the way out takes the other on to the next maze, and both finish at once', async ({ page, browser }) => {
  test.setTimeout(480_000);
  await openGame(page, { mazeReach: 'lots', mazes: 2, mazeSize: 'medium', levels: { [GAME]: 4 } }, GAME);
  const code = await makeGame(page, 'Ana');
  // Whoever made the game chooses, and it comes as together.
  await expect(page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await expect(page.locator('.friends-how')).toContainText('Look for the way out together');
  // Ben's own choice is a race, but it's Ana's game: he's shown hers, and can't change it.
  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, { mazeFriends: 'against', fighter: 'kit' }, 'Ben');
  await expect(ben.page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await expect(ben.page.locator('input[name="friends-team"][value="together"]')).toBeDisabled();
  await expect(ben.page.locator('#friends-teams-whose')).toHaveText('Ana chose.');
  await keepBoards(page);
  await allPlaying(page, ben.page);

  for (const each of [page, ben.page]) {
    const now = await view(each);
    expect([now.team, now.race, now.index]).toEqual([true, true, 0]);
    // One line for all of them at the top, with a dot for each maze and no face.
    expect(now.board).toEqual([{ name: 'Together', out: 0, face: false }]);
    await expect(each.locator('#maze-race li').first().locator('.maze-race-dots i')).toHaveCount(2);
  }
  // It was the same from the countdown on: none of the mazes done yet.
  expect((await boardsSeen(page))[0]).toEqual([['Together', 0]]);

  // Ben rests, with a closed hand, where he started. Ana leads her character to the way out.
  for (const each of [page, ben.page]) await keepPrompts(each);
  await show(ben.page, ...FIST);
  // His hand was open as the game began, so his character may have walked a little first. Where it stops, once his
  // game sees the hand closed, is where he rests.
  await resting(ben.page);
  const benStart = (await view(ben.page)).at;
  for (const each of [page, ben.page]) await keepPhases(each);
  await leadHand(page);
  // Nothing flashes on Ben's screen as she finds it and the next maze comes in for him too.
  await expectSoon(async () => (await view(page)).phase, { timeout: 150_000 }).toBe('out');
  // Out of the first maze, she rests too, so she isn't out of the second as well before what follows is looked at.
  await stopHand(page);
  await show(page, ...FIST);
  const carriedAlong = judge(await watchBrightness(ben.page, 300));
  console.log('carried out of a maze by a friend', JSON.stringify(carriedAlong));
  expect(carriedAlong.flickeringShare).toBeLessThan(0.01);
  expect(carriedAlong.biggestStep).toBeLessThan(6);
  // Ben is in the second maze too, though he never moved: carried, not out by his own doing.
  await expectSoon(async () => (await view(ben.page)).index, { timeout: 20_000 }).toBe(1);
  await expectSoon(async () => (await view(page)).index, { timeout: 20_000 }).toBe(1);
  const [ana, his] = [await view(page), await view(ben.page)];
  expect([ana.out, ana.carried, his.out, his.carried]).toEqual([1, 0, 0, 1]);
  // While Ana's way out was cheered, his character stood where he had left it, and the next maze has it at the way in.
  const carriedFrames = (await phases(ben.page)).filter(({ phase }) => phase === 'carried');
  expect(carriedFrames.length).toBeGreaterThan(0);
  for (const { x, y } of carriedFrames) expect(Math.hypot(x - benStart.x, y - benStart.y)).toBeLessThan(0.01);
  const benWayIn = await wayIn(ben.page);
  expect(Math.hypot(his.at.x - benWayIn.x, his.at.y - benWayIn.y)).toBeLessThan(0.01);
  // He was carried on as soon as Ana's character went out through the way out on his screen, not a while after,
  // once she was in the next maze. Both pages are on this computer, so their clocks are the same.
  const [anaOut] = into(await phases(page), 'out');
  const [benCarried] = into(await phases(ben.page), 'carried');
  console.log('carried this long after the friend got out', benCarried.at - anaOut.at, 'ms');
  expect(benCarried.at - anaOut.at).toBeLessThan(1500);
  for (const each of [page, ben.page]) expect((await view(each)).board).toEqual([{ name: 'Together', out: 1, face: false }]);
  await stopHand(page);
  await shot(ben.page, 'maze-together-second-maze');

  // Ben was told who found it, on the screen.
  expect(await prompts(ben.page)).toContain('Ana found the way out!');

  // In the last maze it's the other way round: Ana rests, and Ben finds the way out for both of them.
  await show(page, ...FIST);
  await show(ben.page, ...OPEN);
  await leadHand(ben.page);
  await expectSoon(async () => (await view(page)).carried, { timeout: 150_000 }).toBe(1);
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  await stopHand(ben.page);
  // And she was told it was him. Neither was told of a way out they found themselves.
  expect(await prompts(page)).toContain('Ben found the way out!');
  expect(await prompts(page)).not.toContain('Ana found the way out!');
  expect(await prompts(ben.page)).not.toContain('Ben found the way out!');

  // Both cards are the team's: nobody placed, what each ate, and what it comes to.
  const [anaEnd, benEnd] = [await view(page), await view(ben.page)];
  expect([anaEnd.out, anaEnd.carried, benEnd.out, benEnd.carried]).toEqual([1, 1, 1, 1]);
  for (const each of [page, ben.page]) {
    await expect(each.locator('#screen-finish h2')).toHaveText('You found the way out together!');
    await expect(each.locator('.friends-results')).toHaveClass(/is-team/);
    await expect(each.locator('.friends-results li')).toHaveCount(2);
    await expect(each.locator('.friends-results')).not.toContainText(/1st|2nd|still playing/);
    await expect(each.locator('#finish-team')).toHaveText(`Together you got out of 2 mazes and ate ${anaEnd.fruit + benEnd.fruit} fruit.`);
    await expect(each.locator('#finish-team')).toBeVisible();
    expect((await view(each)).finishLine).toBe('You did it together!');
  }
  await expect(page.locator('.friends-results li.is-you')).toContainText(`${anaEnd.fruit} fruit`);
  await expect(page.locator('.friends-results li:not(.is-you)')).toContainText(`${benEnd.fruit} fruit`);
  await shot(page, 'maze-together-finish');
  // It was the host's level, so nobody's own moves on.
  expect([anaEnd.ownLevel, benEnd.ownLevel]).toEqual([4, 1]);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('against each other, a grown-up\'s choice in the friends box, it\'s the race it was: nobody is carried, and each is on the board', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openGame(page, { mazeReach: 'lots', mazes: 2, mazeSize: 'medium' }, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, {}, 'Ben');
  await page.locator('input[name="friends-team"][value="against"]').check();
  // The friend is shown at once, and it's kept with Ana's settings, in the grown-ups' panel too.
  await expect(ben.page.locator('input[name="friends-team"][value="against"]')).toBeChecked();
  await expect(ben.page.locator('.friends-how')).toContainText('the first one out of the last maze wins');
  expect(await page.evaluate(() => window.__game.session.settings.mazeFriends)).toBe('against');
  await expect(page.locator('input[name="mazeFriends"][value="against"]')).toBeChecked();
  expect(await ben.page.evaluate(() => window.__game.session.settings.mazeFriends)).toBe('together');

  await keepBoards(page);
  await allPlaying(page, ben.page);
  for (const each of [page, ben.page]) expect((await view(each)).team).toBe(false);
  expect((await view(page)).board.map(({ name, face }) => [name, face])).toEqual([['You', true], ['Ben', true]]);
  // From the countdown on, both are at the start, with Ana first on her own screen, as nobody is ahead yet.
  const boards = await boardsSeen(page);
  expect(boards[0]).toEqual([['You', 0], ['Ben', 0]]);
  expect(boards.flat().filter(([, out]) => out < 0)).toEqual([]);

  // Ana gets out of the first maze. Ben, resting, stays in it.
  await show(ben.page, ...FIST);
  await leadHand(page);
  await expectSoon(async () => (await view(page)).index, { timeout: 150_000 }).toBe(1);
  await stopHand(page);
  await page.waitForTimeout(2500);
  const his = await view(ben.page);
  expect([his.index, his.phase, his.carried]).toEqual([0, 'walking', 0]);
  await expect(ben.page.locator('#prompt-text')).not.toHaveText(/found the way out/);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('together, three friends: whoever finds the way out takes both the others on, each once, and one on the move stops where it is', async ({ page, browser }) => {
  test.setTimeout(480_000);
  await openGame(page, { mazeReach: 'lots', mazes: 2, mazeSize: 'medium' }, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, { fighter: 'kit' }, 'Ben');
  const cara = await secondPlayer(browser);
  await joinGame(cara.page, code, { fighter: 'mochi' }, 'Cara');
  await expect(page.locator('#friends-here li')).toHaveCount(3);
  await allPlaying(page, ben.page, cara.page);
  const everyone = [page, ben.page, cara.page];

  // Ben and Cara rest, and Ana leads the way.
  for (const each of [ben.page, cara.page]) await show(each, ...FIST);
  for (const each of [ben.page, cara.page]) await resting(each);
  for (const each of everyone) {
    await keepPrompts(each);
    await keepPhases(each);
  }
  await leadHand(page);
  // As Ana nears the way out, Cara opens her hand and leads the way too, so her character is on the move as Ana gets
  // out. Ana is well ahead of her on the same way, so Cara can't get there first.
  await expectSoon(() => stepsOut(page), { timeout: 150_000 }).toBeLessThanOrEqual(4);
  await leadHand(cara.page);
  await expectSoon(async () => (await view(page)).phase, { timeout: 60_000 }).toBe('out');
  await stopHand(page);
  await show(page, ...FIST);
  // Nothing flashes on Cara's screen as she's stopped where she is and taken on.
  const carriedOn = judge(await watchBrightness(cara.page, 240));
  console.log('carried out of a maze while walking', JSON.stringify(carriedOn));
  expect(carriedOn.flickeringShare).toBeLessThan(0.01);
  expect(carriedOn.biggestStep).toBeLessThan(6);
  for (const each of everyone) await expectSoon(async () => (await view(each)).index, { timeout: 20_000 }).toBe(1);

  // Ben and Cara were each carried on once, by Ana, and told it was her.
  const [ana, his, hers] = [await view(page), await view(ben.page), await view(cara.page)];
  expect([ana.out, ana.carried, his.out, his.carried, hers.out, hers.carried]).toEqual([1, 0, 0, 1, 0, 1]);
  for (const each of [ben.page, cara.page]) {
    expect(into(await phases(each), 'carried').map(({ index }) => index)).toEqual([0]);
    expect(await prompts(each)).toContain('Ana found the way out!');
  }
  // Cara's character was walking right up to then, and from then on stood where it was until the next maze came.
  const caraKept = await phases(cara.page);
  const carriedAt = caraKept.findIndex(({ phase }) => phase === 'carried');
  const there = caraKept[carriedAt];
  const justBefore = caraKept.slice(0, carriedAt).filter(({ at }) => at > there.at - 500);
  expect(justBefore.some(({ x, y }) => Math.hypot(x - there.x, y - there.y) > 0.05)).toBe(true);
  for (const { x, y } of caraKept.filter(({ phase }) => phase === 'carried')) expect(Math.hypot(x - there.x, y - there.y)).toBeLessThan(0.01);

  // In the last maze Cara, still leading, finds the way out, and takes Ana and Ben on with her to the end.
  await expectSoon(async () => (await view(page)).carried, { timeout: 150_000 }).toBe(1);
  for (const each of everyone) await waitForScreen(each, 'finish');
  await stopHand(cara.page);
  const [anaEnd, benEnd, caraEnd] = [await view(page), await view(ben.page), await view(cara.page)];
  expect([anaEnd.out, anaEnd.carried, benEnd.out, benEnd.carried, caraEnd.out, caraEnd.carried]).toEqual([1, 1, 0, 2, 1, 1]);
  expect(into(await phases(page), 'carried').map(({ index }) => index)).toEqual([1]);
  expect(into(await phases(ben.page), 'carried').map(({ index }) => index)).toEqual([0, 1]);
  expect(into(await phases(cara.page), 'carried').map(({ index }) => index)).toEqual([0]);
  for (const each of [page, ben.page]) expect(await prompts(each)).toContain('Cara found the way out!');
  expect(await prompts(page)).not.toContain('Ana found the way out!');
  expect(await prompts(cara.page)).not.toContain('Cara found the way out!');
  // All three games ended within a moment of each other.
  const ends = [];
  for (const each of everyone) ends.push(into(await phases(each), 'over')[0].at);
  console.log('the three games ended this far apart', Math.max(...ends) - Math.min(...ends), 'ms');
  expect(Math.max(...ends) - Math.min(...ends)).toBeLessThan(2500);
  // Each card is the team's, with all three on it, nobody placed, and all the fruit they ate.
  const fruit = anaEnd.fruit + benEnd.fruit + caraEnd.fruit;
  for (const each of everyone) {
    await expect(each.locator('#screen-finish h2')).toHaveText('You found the way out together!');
    await expect(each.locator('.friends-results li')).toHaveCount(3);
    await expect(each.locator('.friends-results')).not.toContainText(/1st|2nd|3rd|still playing/);
    await expect(each.locator('#finish-team')).toBeVisible();
    await expect(each.locator('#finish-team')).toHaveText(`Together you got out of 2 mazes and ate ${fruit} fruit.`);
  }
  for (const each of [ben, cara]) {
    expect(each.errors).toEqual([]);
    await each.context.close();
  }
});

test('together, when whoever made the game goes in the middle, they take nobody on: the friend finds the way out alone, and on their own after, nothing of it is left', async ({ page, browser }) => {
  test.setTimeout(480_000);
  const ana = await secondPlayer(browser);
  await openGame(ana.page, { mazeReach: 'lots', mazes: 2, mazeSize: 'medium' }, GAME);
  const code = await makeGame(ana.page, 'Ana');
  // Ben's own game, for later on his own, is 2 mazes, with the sun going down as it comes.
  await joinGame(page, code, { mazes: 2 }, 'Ben');
  await allPlaying(ana.page, page);
  expect((await view(page)).team).toBe(true);
  await show(page, ...FIST);
  await resting(page);
  await keepPhases(page);
  await keepPrompts(page);

  // Ana leads the way nearly out of the maze, stops there, and goes before she gets out. (Her page goes on for a
  // moment as it closes, so she rests first: otherwise she might get out on the way, and rightly take him on.)
  await leadHand(ana.page);
  await expectSoon(() => stepsOut(ana.page), { timeout: 150_000 }).toBeLessThanOrEqual(4);
  await stopHand(ana.page);
  await show(ana.page, ...FIST);
  await resting(ana.page);
  expect(await stepsOut(ana.page)).toBeGreaterThan(0);
  await ana.context.close();
  // Her character goes from Ben's maze, and his goes nowhere with it.
  await expectSoon(() => page.evaluate(() => window.__game.game.friendWalkers.size), { timeout: 15_000 }).toBe(0);
  await page.waitForTimeout(1000);
  expect(into(await phases(page), 'carried')).toEqual([]);
  expect(await view(page)).toMatchObject({ index: 0, phase: 'walking', carried: 0 });

  // He finds the way out of both mazes himself. The card is still the team's, with what he ate.
  await show(page, ...OPEN);
  await leadHand(page);
  await expectSoon(async () => (await view(page)).out, { timeout: 240_000 }).toBe(2);
  await waitForScreen(page, 'finish');
  await stopHand(page);
  const end = await view(page);
  expect([end.out, end.carried]).toEqual([2, 0]);
  expect(into(await phases(page), 'carried')).toEqual([]);
  expect(await prompts(page)).not.toContain('Ana found the way out!');
  await expect(page.locator('#screen-finish h2')).toHaveText('You found the way out together!');
  await expect(page.locator('.friends-results li')).toHaveCount(1);
  await expect(page.locator('#finish-team')).toBeVisible();
  await expect(page.locator('#finish-team')).toHaveText(`Together you got out of 2 mazes and ate ${end.fruit} fruit.`);

  // On his own after: his own mazes, with friends lost in them and the sun going down, and nothing of together.
  await page.locator('#friends-leave').evaluate((button) => button.click());
  await show(page, ...OPEN);
  await page.locator('#play-again').click();
  await waitForScreen(page, 'playing');
  expect(await kind(page)).toEqual({ mode: 'solo', team: false, race: false, timed: true, lost: 1, finishLine: 'Everyone is found!', teamMark: false, raceMark: false });
  await expect(page.locator('#maze-race')).toBeHidden();
  await expect(page.locator('#maze-found li')).toHaveCount(2);
  await expect(page.locator('#chip-sun-box')).toBeVisible();
  await leadHand(page);
  await expectSoon(async () => (await state(page)).found, { timeout: 240_000 }).toBe(2);
  await waitForScreen(page, 'finish');
  await stopHand(page);
  await expect(page.locator('#screen-finish h2')).toHaveText('Everyone is found!');
  await expect(page.locator('#finish-found img')).toHaveCount(2);
  await expect(page.locator('#finish-team')).toBeHidden();
  await expect(page.locator('.friends-results')).toBeHidden();
  expect(await view(page)).toMatchObject({ out: 0, carried: 0 });
});

test('together, a friend whose connection goes for a moment while the other gets out and on into the next maze catches up with them there', async ({ page, browser }) => {
  test.setTimeout(420_000);
  await openGame(page, { mazeReach: 'lots', mazes: 2, mazeSize: 'medium' }, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, {}, 'Ben');
  await allPlaying(page, ben.page);
  await show(ben.page, ...FIST);
  await resting(ben.page);
  for (const each of [page, ben.page]) await keepPhases(each);
  await keepPrompts(ben.page);

  // Just before Ana gets out, nothing from her reaches Ben for 5 seconds, and then his game connects again.
  await leadHand(page);
  await expectSoon(() => stepsOut(page), { timeout: 150_000 }).toBeLessThanOrEqual(2);
  await loseConnection(ben.page, 5000);
  await expectSoon(async () => (await view(page)).index, { timeout: 30_000 }).toBe(1);
  await stopHand(page);
  await show(page, ...FIST);
  // Once he hears from her again, she's in the next maze, and he goes on into it too.
  await expectSoon(async () => (await view(ben.page)).index, { timeout: 30_000 }).toBe(1);
  const anaInNext = (await phases(page)).find(({ index, phase }) => index === 1 && phase === 'walking');
  const [benCarried] = into(await phases(ben.page), 'carried');
  expect(benCarried.index).toBe(0);
  expect(benCarried.at).toBeGreaterThan(anaInNext.at);
  expect(await view(ben.page)).toMatchObject({ out: 0, carried: 1 });
  expect(await prompts(ben.page)).toContain('Ana found the way out!');
  // Ana's game kept him all the while: he was back well before a friend counts as gone.
  expect(await page.evaluate(() => window.__game.game.friends.current.friends.map(({ gone }) => Boolean(gone)))).toEqual([false]);
  expect(await page.evaluate(() => window.__game.game.friendWalkers.size)).toBe(1);

  // And out of the last maze together, as before.
  await show(page, ...OPEN);
  await leadHand(page);
  await expectSoon(async () => (await view(ben.page)).carried, { timeout: 150_000 }).toBe(2);
  for (const each of [page, ben.page]) await waitForScreen(each, 'finish');
  await stopHand(page);
  const [anaEnd, benEnd] = [await view(page), await view(ben.page)];
  expect([anaEnd.out, anaEnd.carried, benEnd.out, benEnd.carried]).toEqual([2, 0, 0, 2]);
  for (const each of [page, ben.page]) {
    await expect(each.locator('.friends-results li')).toHaveCount(2);
    await expect(each.locator('.friends-results')).not.toContainText('still playing');
    await expect(each.locator('#finish-team')).toHaveText(`Together you got out of 2 mazes and ate ${anaEnd.fruit + benEnd.fruit} fruit.`);
  }
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('together, both getting to the way out at nearly the same moment each go on once, by themselves or taken by the other, and finish together', async ({ page, browser }) => {
  test.setTimeout(420_000);
  await openGame(page, { mazeReach: 'lots', mazes: 2, mazeSize: 'medium' }, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, {}, 'Ben');
  await allPlaying(page, ben.page);
  for (const each of [page, ben.page]) {
    await keepPrompts(each);
    await keepPhases(each);
  }
  // Both lead the way from the start, at the same pace, along the same way, through both mazes.
  await leadHand(page);
  await leadHand(ben.page);
  for (const each of [page, ben.page]) await expectSoon(async () => (await view(each)).index, { timeout: 150_000 }).toBe(1);
  for (const each of [page, ben.page]) await expectSoon(async () => (await view(each)).phase, { timeout: 150_000 }).toBe('over');
  for (const each of [page, ben.page]) await waitForScreen(each, 'finish');
  for (const each of [page, ben.page]) await stopHand(each);

  // Out of each maze, each went on once: by getting out, or carried by the other, and never both.
  const names = { Ana: page, Ben: ben.page };
  for (const [name, each] of Object.entries(names)) {
    const kept = await phases(each);
    const ways = [0, 1].map((maze) => [...into(kept, 'out'), ...into(kept, 'carried')].filter(({ index }) => index === maze).map(({ phase }) => phase));
    console.log(`${name} went on from each maze by`, JSON.stringify(ways));
    expect(ways.map((way) => way.length)).toEqual([1, 1]);
    const now = await view(each);
    expect(now.out + now.carried).toBe(2);
    // Told of a way out only by the other's name, and only when carried.
    const told = await prompts(each);
    expect(told).not.toContain(`${name} found the way out!`);
    if (now.carried === 0) expect(told.filter((text) => text.includes('found the way out'))).toEqual([]);
  }
  const outs = [];
  for (const each of [page, ben.page]) outs.push(into(await phases(each), 'out').find(({ index }) => index === 0)?.at ?? null);
  console.log('out of the first maze by themselves at', JSON.stringify(outs));
  for (const each of [page, ben.page]) {
    await expect(each.locator('#screen-finish h2')).toHaveText('You found the way out together!');
    await expect(each.locator('.friends-results li')).toHaveCount(2);
    await expect(each.locator('.friends-results')).not.toContainText(/1st|2nd|still playing/);
  }
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('during a game together, whoever made it chooses against each other in the grown-ups\' panel: the friend is told, that game goes on together, and playing again it is the race, with nothing of together left', async ({ page, browser }) => {
  test.setTimeout(600_000);
  await openGame(page, { mazeReach: 'lots', mazes: 2, mazeSize: 'medium' }, GAME);
  const code = await makeGame(page, 'Ana');
  const ben = await secondPlayer(browser);
  await joinGame(ben.page, code, {}, 'Ben');
  await allPlaying(page, ben.page);
  // Together, as it comes: Ana leads the way out of the first maze, and takes Ben on with her.
  await show(ben.page, ...FIST);
  await leadHand(page);
  await expectSoon(async () => (await view(page)).phase, { timeout: 150_000 }).toBe('out');
  await stopHand(page);
  await show(page, ...FIST);
  for (const each of [page, ben.page]) await expectSoon(async () => (await view(each)).index, { timeout: 20_000 }).toBe(1);

  // In the second maze, Ana chooses against each other in the grown-ups' panel. Ben is told at once. The game being
  // played is friends' too, so it goes on as it was, together, and the choice is for the next one.
  await page.locator('#open-panel').click();
  await page.locator('input[name="mazeFriends"][value="against"]').check();
  await page.locator('#close-panel').click();
  await expect(page.locator('input[name="friends-team"][value="against"]')).toBeChecked();
  await expect(ben.page.locator('input[name="friends-team"][value="against"]')).toBeChecked();
  for (const each of [page, ben.page]) expect(await view(each)).toMatchObject({ team: true, index: 1 });
  await show(page, ...OPEN);
  await leadHand(page);
  await expectSoon(async () => (await view(ben.page)).carried, { timeout: 150_000 }).toBe(2);
  for (const each of [page, ben.page]) await waitForScreen(each, 'finish');
  await stopHand(page);
  for (const each of [page, ben.page]) await expect(each.locator('#screen-finish h2')).toHaveText('You found the way out together!');
  await expect(page.locator('#finish-team')).toBeVisible();

  // Both play again: it's the race as it was, with nothing of together left over.
  await keepBoards(page);
  for (const each of [page, ben.page]) await each.locator('#play-again').click();
  for (const each of [page, ben.page]) await waitForScreen(each, 'playing');
  for (const each of [page, ben.page]) {
    expect(await kind(each)).toMatchObject({ mode: 'friends', team: false, race: true, finishLine: 'You did it! Great racing!', teamMark: false, raceMark: true });
    expect(await view(each)).toMatchObject({ index: 0, out: 0, carried: 0 });
  }
  expect((await view(page)).board.map(({ name, face }) => [name, face])).toEqual([['You', true], ['Ben', true]]);
  expect((await boardsSeen(page)).flat().filter(([name]) => name === 'Together')).toEqual([]);
  for (const each of [page, ben.page]) {
    await keepPrompts(each);
    await keepPhases(each);
  }
  // Ana gets out of both mazes, and Ben, resting, is left where he is in the first.
  await show(page, ...OPEN);
  await leadHand(page);
  await expectSoon(async () => (await view(page)).out, { timeout: 240_000 }).toBe(2);
  await waitForScreen(page, 'finish');
  await stopHand(page);
  expect(await view(ben.page)).toMatchObject({ index: 0, phase: 'walking', carried: 0 });
  expect(into(await phases(ben.page), 'carried')).toEqual([]);
  expect(await prompts(ben.page)).not.toContain('Ana found the way out!');
  await expect(page.locator('#screen-finish h2')).toHaveText('You were first out!');
  await expect(page.locator('.friends-results li').nth(0)).toContainText('1st');
  await expect(page.locator('.friends-results')).not.toHaveClass(/is-team/);
  await expect(page.locator('#finish-team')).toBeHidden();
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});
