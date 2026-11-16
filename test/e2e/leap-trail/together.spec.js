// Friends in Leap Trail, together, as the game comes: two children, each on their own computer, run the same trail
// as one pack on the same side. A runner far in front of the others eases off, everyone's stars add up, and nobody
// is placed. Here they're two separate browsers, talking through the race server on this computer
// (tools/race-server.mjs).
import { expect, openGame, test, waitForScreen } from '../helpers.js';
import { standInView } from './helpers.js';

const GAME = 'leap-trail';
const MADE_IT = 'You made it to the end of the trail!';
const plural = (count) => `${count} ${count === 1 ? 'star' : 'stars'}`;
// A line on the finish card that ends with this many stars, and not with a number that only ends the same way.
const endsWithStars = (count) => new RegExp(`\\b${plural(count)}$`);

/** Another player, in a browser of their own, with the same checks for errors. */
async function secondPlayer(browser) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`uncaught: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`logged: ${message.text()}`);
  });
  return { context, page, errors };
}

/** A long, slow trail, where a runner that isn't jumped for stumbles on, so both keep running while the tests look. */
async function openRun(page, settings = {}, hash = '') {
  await openGame(page, { onMissed: 'stumble', trailPace: 'slow', obstacles: 40, ...settings }, GAME, hash);
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'yes');
  await standInView(page);
}

/** A grown-up makes a run, with a name, and gets its code. */
async function makeRun(page, name) {
  await page.locator('#friends-toggle').click();
  await page.locator('#friends-make').click();
  await expect(page.locator('#friends-code-shown')).toHaveText(/^[A-HJ-NP-Z2-9]{3}$/);
  await page.locator('#friends-name').fill(name);
  await page.locator('#friends-name').dispatchEvent('change');
  return page.locator('#friends-code-shown').textContent();
}

async function join(browser, code, name, settings = {}) {
  const friend = await secondPlayer(browser);
  await openRun(friend.page, settings, `#run=${code}`);
  await friend.page.locator('#friends-name').fill(name);
  await friend.page.locator('#friends-name').dispatchEvent('change');
  return friend;
}

/** Chooses a runner and presses Let's run!, skipping the practice, to wait for the others. */
async function getReady(page) {
  await page.locator('#start').click();
  await waitForScreen(page, 'choose');
  await page.locator('#run-start').click();
  await waitForScreen(page, 'practice');
  await page.locator('#practice-skip').click();
}

async function bothRunning(page, other) {
  await getReady(page);
  await getReady(other);
  await waitForScreen(page, 'run');
  await waitForScreen(other, 'run');
}

/** From the finish card, both press Run again, standing in view, and run once both are ready. */
async function bothAgain(page, other) {
  for (const each of [page, other]) {
    await standInView(each);
    await each.locator('#run-again').click();
  }
  await waitForScreen(page, 'run');
  await waitForScreen(other, 'run');
}

const trailOf = (page) => page.evaluate(() => {
  const { run, mates, game } = window.__game;
  return {
    team: game.team,
    pack: run.pack,
    distance: run.distance,
    speed: run.speed,
    pace: run.settings.speed,
    total: run.starTotal,
    teamStars: game.teamStars,
    mateFar: mates.map(({ far }) => far ?? null),
    mateStars: mates.map(({ stars }) => stars),
    gone: mates.map(({ gone }) => gone),
    friends: run.friends,
    hearts: run.hearts,
    ownLevel: game.levels.current,
  };
});

/** Puts a runner this far along the trail, still running. */
const runTo = (page, far) => page.evaluate((metres) => {
  const { run } = window.__game;
  run.distance = metres;
  run.noteActivity();
}, far);

/** Puts a runner just short of the end, so that it finishes. */
const toTheEnd = (page) => page.evaluate(() => {
  const { run } = window.__game;
  run.distance = run.end - 3;
  run.noteActivity();
});

/** Keeps every child moving, so no runner stops for a rest, and says how far each ran in these seconds. */
async function ranIn(pages, seconds) {
  const start = await Promise.all(pages.map(async (each) => (await trailOf(each)).distance));
  for (let passed = 0; passed < seconds; passed += 0.5) {
    for (const each of pages) await each.evaluate(() => window.__game.run.noteActivity());
    await pages[0].waitForTimeout(500);
  }
  const end = await Promise.all(pages.map(async (each) => (await trailOf(each)).distance));
  return end.map((far, index) => far - start[index]);
}

/**
 * The server's answer about a star this runner reached just before the end, coming only after the finish: it's
 * theirs. It goes the way a late answer does, through what the game does with whatever comes from the room.
 */
const settleLate = (page) => page.evaluate(() => {
  const { run, friends, game } = window.__game;
  const open = run.starLines.filter(({ taken, gone }) => !taken && !gone);
  const star = open.find(({ lane }) => lane === run.lane) ?? open[0];
  star.asked = true;
  game.fromFriend(friends.room.you, { t: 'claimed', k: star.index, by: friends.room.you });
});

const saidAtTheEnd = (page) => page.evaluate(() => window.__game.game.sound.finished);

test('together, as the game comes: a runner far in front eases off for the pack, and the stars add up on both screens', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openRun(page, { levels: { [GAME]: 2 } });
  const code = await makeRun(page, 'Ana');
  // Whoever made the run chooses, and it comes as together.
  await expect(page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await expect(page.locator('#friends-how')).toContainText('one team');
  // Ben's own choice is against each other, but it's Ana's run: he's shown hers, and can't change it.
  const ben = await join(browser, code, 'Ben', { trailFriends: 'against', fighter: 'kit' });
  await expect(ben.page.locator('input[name="friends-team"][value="together"]')).toBeChecked();
  await expect(ben.page.locator('input[name="friends-team"][value="together"]')).toBeDisabled();
  await expect(ben.page.locator('#friends-teams-whose')).toHaveText('Ana chose.');

  await bothRunning(page, ben.page);
  for (const each of [page, ben.page]) expect((await trailOf(each)).team).toBe(true);
  // With friends there are no hearts to lose, together as against each other: everyone runs on to the finish.
  for (const each of [page, ben.page]) {
    expect((await trailOf(each)).hearts).toBe(null);
    await expect(each.locator('.hearts-chip')).toBeHidden();
  }
  // Each hears where the other is.
  await expect.poll(async () => (await trailOf(page)).mateFar[0], { timeout: 20_000 }).not.toBe(null);
  await expect.poll(async () => (await trailOf(ben.page)).mateFar[0], { timeout: 20_000 }).not.toBe(null);
  // Side by side, both run at the trail's pace, and nothing says otherwise.
  expect([(await trailOf(page)).pack, (await trailOf(ben.page)).pack]).toEqual([1, 1]);
  await expect(page.locator('#run-pack')).toBeHidden();

  // The board at the top: what the stars add up to, then the child's own, then their friend's, nobody ranked.
  await expect(page.locator('#run-scores li')).toHaveCount(3);
  await expect(page.locator('#run-scores li').nth(0)).toContainText('Together');
  await expect(page.locator('#run-scores li').nth(1)).toContainText('You');
  await expect(page.locator('#run-scores li').nth(2)).toContainText('Ben');

  // Side by side, they cover the same ground.
  const [herFirst, hisFirst] = await ranIn([page, ben.page], 4);
  expect(herFirst / hisFirst).toBeGreaterThan(0.8);
  expect(herFirst / hisFirst).toBeLessThan(1.25);

  // Ana gets 150 metres in front. Her runner eases off to half the pace, with a label saying why, and Ben,
  // behind, is neither slowed nor hurried.
  await runTo(page, (await trailOf(ben.page)).distance + 150);
  await expect.poll(async () => (await trailOf(page)).pack, { timeout: 15_000 }).toBe(0.5);
  await expect(page.locator('#run-pack')).toBeVisible();
  await expect(page.locator('#run-pack')).toHaveText('Waiting for your friends!');
  expect((await trailOf(ben.page)).pack).toBe(1);
  await expect(ben.page.locator('#run-pack')).toBeHidden();
  // And that's how they really run: she covers well under the ground he does.
  const [hers, his] = await ranIn([page, ben.page], 6);
  expect(his).toBeGreaterThan(40);
  expect(hers).toBeGreaterThan(15);
  expect(hers / his).toBeLessThan(0.75);
  await page.screenshot({ path: 'test-results/screens/trail-together-pack.png' });

  // Ben catches up, and she's back at the trail's pace, with the label gone.
  await runTo(ben.page, (await trailOf(page)).distance);
  await expect.poll(async () => (await trailOf(page)).pack, { timeout: 15_000 }).toBe(1);
  await expect(page.locator('#run-pack')).toBeHidden();

  // Stars: each one's count reaches the other, and both boards show what they add up to.
  await page.evaluate(() => {
    window.__game.run.stats.stars += 9;
  });
  await ben.page.evaluate(() => {
    window.__game.run.stats.stars += 4;
  });
  await expect.poll(async () => {
    const [hers, his] = [await trailOf(page), await trailOf(ben.page)];
    return [hers.teamStars - (hers.total + his.total), his.teamStars - (hers.total + his.total)];
  }, { timeout: 20_000 }).toEqual([0, 0]);
  expect((await trailOf(page)).teamStars).toBeGreaterThanOrEqual(13);
  await expect.poll(async () => {
    const shown = Number((await page.locator('#run-scores li').nth(0).textContent()).replace(/\D/g, ''));
    return Math.abs(shown - (await trailOf(page)).teamStars);
  }, { timeout: 10_000 }).toBeLessThanOrEqual(3);
  // Ana has more stars than Ben, and still each board has the child's own line straight under the team's: nobody
  // is ranked.
  expect((await trailOf(page)).total).toBeGreaterThan((await trailOf(ben.page)).total);
  for (const [each, names] of [[page, ['Together', 'You', 'Ben']], [ben.page, ['Together', 'You', 'Ana']]]) {
    for (const [index, name] of names.entries()) await expect(each.locator('#run-scores li').nth(index)).toContainText(name);
  }

  // Ana gets to the end first, far in front. Her card is the team's, with Ben still running, and the label that
  // was up as she came in has gone with the trail.
  await toTheEnd(page);
  await waitForScreen(page, 'finish');
  await expect(page.locator('#finish-title')).toHaveText('You ran it together!');
  await expect(page.locator('.friends-results')).toHaveClass(/is-team/);
  await expect(page.locator('.friends-results li').nth(1)).toContainText('still running');
  await expect(page.locator('#finish-team')).toBeVisible();
  await expect(page.locator('#run-pack')).toBeHidden();

  // Ben gets there too, and both cards say the same: what each brought, and what it comes to.
  await toTheEnd(ben.page);
  await waitForScreen(ben.page, 'finish');
  // A star reached just before the end may be settled just after it, so the cards are given a moment to agree.
  await expect.poll(async () => {
    const [a, b] = [(await trailOf(page)).total, (await trailOf(ben.page)).total];
    const said = await Promise.all([page, ben.page].map((each) => each.locator('#finish-team').textContent()));
    return said.map((text) => text === `Together you caught ${plural(a + b)}.`);
  }, { timeout: 30_000 }).toEqual([true, true]);
  const [herStars, hisStars] = [(await trailOf(page)).total, (await trailOf(ben.page)).total];
  for (const each of [page, ben.page]) {
    await expect(each.locator('#finish-title')).toHaveText('You ran it together!');
    await expect(each.locator('#finish-team')).toHaveText(`Together you caught ${plural(herStars + hisStars)}.`);
    await expect(each.locator('#finish-stars')).toHaveText(String(each === page ? herStars : hisStars));
    await expect(each.locator('.friends-results li')).toHaveCount(2);
    await expect(each.locator('.friends-results')).not.toContainText(/1st|2nd|still running/);
    // And the voice says so.
    expect(await saidAtTheEnd(each)).toEqual({ line: 'You did it together!', lost: false });
  }
  await expect(page.locator('.friends-results li.is-you')).toContainText(plural(herStars));
  await expect(ben.page.locator('.friends-results li.is-you')).toContainText(plural(hisStars));
  // And each one's line on the other's card is what they really finished with.
  await expect(page.locator('.friends-results li:not(.is-you)')).toContainText(plural(hisStars));
  await expect(ben.page.locator('.friends-results li:not(.is-you)')).toContainText(plural(herStars));
  await page.screenshot({ path: 'test-results/screens/trail-together-finish.png' });

  // A star Ana reached just before the end is only settled now, as hers. Her own card, her line on Ben's, and what
  // it all comes to on both, fill in with it.
  await settleLate(page);
  await expect(page.locator('#finish-stars')).toHaveText(String(herStars + 1));
  await expect(page.locator('.friends-results li.is-you')).toHaveText(endsWithStars(herStars + 1));
  await expect(ben.page.locator('.friends-results li:not(.is-you)')).toHaveText(endsWithStars(herStars + 1));
  for (const each of [page, ben.page]) await expect(each.locator('#finish-team')).toHaveText(`Together you caught ${plural(herStars + 1 + hisStars)}.`);
  // It was the host's trail, so nobody's own level moves on.
  expect([(await trailOf(page)).ownLevel, (await trailOf(ben.page)).ownLevel]).toEqual([2, 1]);
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('against each other, a grown-up\'s choice in the friends box, it\'s the contest it was: nobody eases off, and the most stars comes first', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openRun(page);
  const code = await makeRun(page, 'Ana');
  const ben = await join(browser, code, 'Ben');
  await page.locator('input[name="friends-team"][value="against"]').check();
  // The friend is shown at once, and it's kept with Ana's settings, in the grown-ups' panel too.
  await expect(ben.page.locator('input[name="friends-team"][value="against"]')).toBeChecked();
  expect(await page.evaluate(() => window.__game.game.settings.trailFriends)).toBe('against');
  await expect(page.locator('input[name="trailFriends"][value="against"]')).toBeChecked();
  expect(await ben.page.evaluate(() => window.__game.game.settings.trailFriends)).toBe('together');

  await bothRunning(page, ben.page);
  for (const each of [page, ben.page]) expect((await trailOf(each)).team).toBe(false);
  await expect.poll(async () => (await trailOf(page)).mateFar[0], { timeout: 20_000 }).not.toBe(null);
  // No line for the team on the board, only the two of them.
  await expect(page.locator('#run-scores li')).toHaveCount(2);
  // 150 metres in front, Ana runs on at the trail's pace: she covers the ground Ben does.
  await runTo(page, (await trailOf(ben.page)).distance + 150);
  const [hers, his] = await ranIn([page, ben.page], 6);
  expect((await trailOf(page)).pack).toBe(1);
  await expect(page.locator('#run-pack')).toBeHidden();
  expect(hers / his).toBeGreaterThan(0.8);

  for (const each of [page, ben.page]) await toTheEnd(each);
  await waitForScreen(page, 'finish');
  await waitForScreen(ben.page, 'finish');
  await expect(page.locator('.friends-results')).not.toHaveClass(/is-team/);
  await expect(page.locator('.friends-results')).toContainText('1st');
  await expect(page.locator('#finish-team')).toBeHidden();
  await expect(page.locator('#finish-title')).not.toHaveText('You ran it together!');
  for (const each of [page, ben.page]) expect(await saidAtTheEnd(each)).toEqual({ line: MADE_IT, lost: false });

  // Against each other too, a star Ana reached just before the end, settled only after it, fills in her card and
  // her line on Ben's.
  const herLine = ben.page.locator('.friends-results li', { hasText: 'Ana' });
  await expect.poll(async () => endsWithStars((await trailOf(page)).total).test((await herLine.textContent()).trim()), { timeout: 30_000 }).toBe(true);
  const herStars = (await trailOf(page)).total;
  await settleLate(page);
  await expect(page.locator('#finish-stars')).toHaveText(String(herStars + 1));
  await expect(herLine).toHaveText(endsWithStars(herStars + 1));
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('together, a friend who leaves in the middle no longer holds the pack back, and the stars they caught stay in the total', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openRun(page);
  const code = await makeRun(page, 'Ana');
  const ben = await join(browser, code, 'Ben');
  await bothRunning(page, ben.page);
  await expect.poll(async () => (await trailOf(page)).mateFar[0], { timeout: 20_000 }).not.toBe(null);

  // Ben catches some stars, and Ana hears about them. She's far in front, waiting for him.
  await ben.page.evaluate(() => {
    window.__game.run.stats.stars += 6;
  });
  await expect.poll(async () => (await trailOf(page)).mateStars[0], { timeout: 20_000 }).toBeGreaterThanOrEqual(6);
  await runTo(page, (await trailOf(ben.page)).distance + 150);
  await expect.poll(async () => (await trailOf(page)).pack, { timeout: 15_000 }).toBe(0.5);
  await expect(page.locator('#run-pack')).toBeVisible();

  // Ben closes his window in the middle of the run.
  expect(ben.errors).toEqual([]);
  await ben.context.close();
  // Once he has really gone, Ana's runner stops waiting for him: back at the trail's pace, with the label gone.
  await expect.poll(async () => (await trailOf(page)).gone[0], { timeout: 30_000 }).toBe(true);
  await expect.poll(async () => (await trailOf(page)).pack, { timeout: 10_000 }).toBe(1);
  await expect(page.locator('#run-pack')).toBeHidden();
  await ranIn([page], 3);
  expect((await trailOf(page)).pack).toBe(1);
  await expect(page.locator('#run-pack')).toBeHidden();

  // His line goes from the board, but what he caught stays in what they caught together.
  const left = await trailOf(page);
  const his = left.mateStars[0];
  expect(his).toBeGreaterThanOrEqual(6);
  expect(left.teamStars).toBe(left.total + his);
  await expect(page.locator('#run-scores li')).toHaveCount(2);
  await expect(page.locator('#run-scores li').nth(0)).toContainText('Together');
  await expect(page.locator('#run-scores li').nth(1)).toContainText('You');

  // Ana gets to the end. Ben isn't on her card, nor still running, and his stars are in the total.
  await toTheEnd(page);
  await waitForScreen(page, 'finish');
  await expect(page.locator('#finish-title')).toHaveText('You ran it together!');
  await expect(page.locator('.friends-results li')).toHaveCount(1);
  await expect(page.locator('.friends-results')).not.toContainText(/Ben|still running/);
  // A star reached just before the end may be settled just after it, so the line is given a moment.
  await expect.poll(async () => {
    const hers = (await trailOf(page)).total;
    return (await page.locator('#finish-team').textContent()) === `Together you caught ${plural(hers + his)}.`;
  }, { timeout: 20_000 }).toBe(true);
});

test('together, three runners: the two in front ease off for the last, who waits at an obstacle far behind, slowing but never stopping', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await openRun(page);
  const code = await makeRun(page, 'Ana');
  const ben = await join(browser, code, 'Ben');
  // Cleo's runner waits for each move, as her grown-up chose, and she doesn't make one.
  const cleo = await join(browser, code, 'Cleo', { onMissed: 'wait' });
  const all = [page, ben.page, cleo.page];
  for (const each of all) await getReady(each);
  for (const each of all) await waitForScreen(each, 'run');
  for (const each of all) await expect.poll(async () => (await trailOf(each)).mateFar.every((far) => far !== null), { timeout: 20_000 }).toBe(true);

  // Cleo's runner comes to the first obstacle, and waits there for her jump.
  await expect.poll(async () => {
    await cleo.page.evaluate(() => window.__game.run.noteActivity());
    return cleo.page.evaluate(() => window.__game.run.waiting);
  }, { timeout: 30_000 }).toBe(true);

  // Ana is 150 metres in front of her, and Ben 135: Ben is close to Ana, but it's Cleo, the last, they wait for.
  const behind = (await trailOf(cleo.page)).distance;
  await runTo(page, behind + 150);
  await runTo(ben.page, behind + 135);
  await expect.poll(async () => (await trailOf(page)).pack, { timeout: 15_000 }).toBe(0.5);
  await expect.poll(async () => (await trailOf(ben.page)).pack, { timeout: 15_000 }).toBe(0.5);
  for (const each of [page, ben.page]) await expect(each.locator('#run-pack')).toBeVisible();
  expect((await trailOf(cleo.page)).pack).toBe(1);
  await expect(cleo.page.locator('#run-pack')).toBeHidden();

  // The board has the team's line and all three, and the label sits under it, not over anyone's name.
  await expect(page.locator('#run-scores li')).toHaveCount(4);
  for (const [index, name] of ['Together', 'You', 'Ben', 'Cleo'].entries()) await expect(page.locator('#run-scores li').nth(index)).toContainText(name);
  await page.screenshot({ path: 'test-results/screens/trail-together-three.png' });
  const [board, label] = [await page.locator('#run-scores').boundingBox(), await page.locator('#run-pack').boundingBox()];
  expect(label.y).toBeGreaterThanOrEqual(board.y + board.height);

  // However long Cleo waits, the two in front keep running, at about half the trail's pace, and she stays put.
  const [hers, his, cleos] = await ranIn(all, 6);
  const { pace } = await trailOf(page);
  for (const ran of [hers, his]) {
    expect(ran).toBeGreaterThan(10);
    expect(ran).toBeLessThan(pace * 6 * 0.75);
  }
  expect(cleos).toBeLessThan(1);
  expect([(await trailOf(page)).pack, (await trailOf(ben.page)).pack]).toEqual([0.5, 0.5]);
  for (const friend of [ben, cleo]) {
    expect(friend.errors).toEqual([]);
    await friend.context.close();
  }
});

test('together, a runner far in front that stops to wait for a move is told to jump, not that it waits for friends', async ({ page, browser }) => {
  test.setTimeout(300_000);
  // Ana's runner waits for each move, as her grown-up chose.
  await openRun(page, { onMissed: 'wait' });
  const code = await makeRun(page, 'Ana');
  const ben = await join(browser, code, 'Ben');
  await bothRunning(page, ben.page);
  await expect.poll(async () => (await trailOf(page)).mateFar[0], { timeout: 20_000 }).not.toBe(null);

  // Ana gets well over 100 metres in front, past everything on the way as if she had jumped it, a little short of
  // the next obstacle. She eases off for Ben, and the label says why.
  await page.evaluate((metres) => {
    const { run } = window.__game;
    const next = run.course.find(({ at }) => at > metres);
    for (const obstacle of run.course) if (obstacle.at < next.at) obstacle.state = 'cleared';
    run.distance = next.at - 15;
    run.noteActivity();
  }, (await trailOf(ben.page)).distance + 150);
  await expect.poll(async () => (await trailOf(page)).pack, { timeout: 15_000 }).toBe(0.5);
  await expect(page.locator('#run-pack')).toBeVisible();

  // She doesn't jump, and her runner stops at the obstacle to wait for her. It's her move it waits for now, as the
  // words at the bottom say, so the label saying it waits for her friends goes.
  await expect.poll(async () => {
    await page.evaluate(() => window.__game.run.noteActivity());
    return page.evaluate(() => window.__game.run.waiting);
  }, { timeout: 30_000 }).toBe(true);
  await expect(page.locator('#prompt')).toContainText('Jump when you’re ready!');
  await expect(page.locator('#run-pack')).toBeHidden();
  await page.screenshot({ path: 'test-results/screens/trail-together-waiting.png' });

  // She jumps, gets over it, and runs on, still far in front, so the label is back.
  await page.evaluate(() => window.__game.run.jump());
  await expect.poll(() => page.evaluate(() => window.__game.run.stats.cleared), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  await expect(page.locator('#run-pack')).toBeVisible();
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});

test('after a run together: together again, then against each other, then alone, and nothing of the pack is left behind', async ({ page, browser }) => {
  test.setTimeout(480_000);
  await openRun(page);
  const code = await makeRun(page, 'Ana');
  const ben = await join(browser, code, 'Ben');
  await bothRunning(page, ben.page);
  for (const each of [page, ben.page]) await toTheEnd(each);
  for (const each of [page, ben.page]) await waitForScreen(each, 'finish');
  await expect(page.locator('#finish-title')).toHaveText('You ran it together!');

  // Together again: a pack of its own, whose stars add up from the start again.
  await bothAgain(page, ben.page);
  for (const each of [page, ben.page]) expect((await trailOf(each)).team).toBe(true);
  await expect.poll(async () => {
    const [hers, his] = [await trailOf(page), await trailOf(ben.page)];
    return hers.teamStars - (hers.total + his.total);
  }, { timeout: 20_000 }).toBe(0);
  await expect.poll(async () => (await trailOf(page)).mateFar[0], { timeout: 20_000 }).not.toBe(null);
  await runTo(page, (await trailOf(ben.page)).distance + 150);
  await expect.poll(async () => (await trailOf(page)).pack, { timeout: 15_000 }).toBe(0.5);
  for (const each of [page, ben.page]) await toTheEnd(each);
  for (const each of [page, ben.page]) await waitForScreen(each, 'finish');
  await expect.poll(async () => {
    const [a, b] = [(await trailOf(page)).total, (await trailOf(ben.page)).total];
    return page.locator('#finish-team').textContent().then((text) => text === `Together you caught ${plural(a + b)}.`);
  }, { timeout: 30_000 }).toBe(true);
  await expect(page.locator('.friends-results li')).toHaveCount(2);

  // Ana goes to choose another runner, and there her grown-up chooses against each other in the panel. Ben is
  // shown it at once, and they run again.
  await page.locator('#other-runner').click();
  await waitForScreen(page, 'choose');
  await page.locator('#open-panel').click();
  await page.locator('input[name="trailFriends"][value="against"]').check();
  await page.locator('#close-panel').click();
  await expect(ben.page.locator('input[name="friends-team"][value="against"]')).toBeChecked();
  await standInView(page);
  await page.locator('#run-start').click();
  await standInView(ben.page);
  await ben.page.locator('#run-again').click();
  await waitForScreen(page, 'run');
  await waitForScreen(ben.page, 'run');

  // Against each other: no team on the board, nobody waits, places on the card, and the usual voice.
  for (const each of [page, ben.page]) {
    expect((await trailOf(each)).team).toBe(false);
    await expect(each.locator('body')).not.toHaveAttribute('data-friends-team');
  }
  await expect.poll(async () => (await trailOf(page)).mateFar[0], { timeout: 20_000 }).not.toBe(null);
  await expect(page.locator('#run-scores li')).toHaveCount(2);
  await expect(page.locator('#run-scores')).not.toContainText('Together');
  await runTo(page, (await trailOf(ben.page)).distance + 150);
  await ranIn([page, ben.page], 3);
  expect((await trailOf(page)).pack).toBe(1);
  await expect(page.locator('#run-pack')).toBeHidden();
  for (const each of [page, ben.page]) await toTheEnd(each);
  for (const each of [page, ben.page]) await waitForScreen(each, 'finish');
  await expect(page.locator('.friends-results')).toContainText(/1st/);
  for (const each of [page, ben.page]) {
    await expect(each.locator('#finish-team')).toBeHidden();
    await expect(each.locator('#finish-title')).not.toHaveText('You ran it together!');
    expect(await saidAtTheEnd(each)).toEqual({ line: MADE_IT, lost: false });
  }

  // Then Ana runs on her own, as a run on its own always was: hearts, no board, no pack.
  await standInView(page);
  await page.locator('#run-again').click();
  await waitForScreen(page, 'waiting');
  await page.locator('#friends-alone').click();
  await waitForScreen(page, 'run');
  const alone = await trailOf(page);
  expect({ friends: alone.friends, team: alone.team, pack: alone.pack, mates: alone.mateFar.length }).toEqual({ friends: false, team: false, pack: 1, mates: 0 });
  expect(alone.hearts).toBeGreaterThan(0);
  await expect(page.locator('body')).toHaveAttribute('data-hearts', 'yes');
  await expect(page.locator('body')).not.toHaveAttribute('data-friends-team');
  await expect(page.locator('body')).not.toHaveAttribute('data-friends-race');
  await expect(page.locator('#run-scores')).toBeHidden();
  await ranIn([page], 2);
  expect((await trailOf(page)).pack).toBe(1);
  await expect(page.locator('#run-pack')).toBeHidden();
  await page.evaluate(() => {
    const { run } = window.__game;
    // As if every obstacle had been jumped, so no heart is lost on the way to the end.
    for (const obstacle of run.course) obstacle.state = 'cleared';
    run.distance = run.end - 3;
    run.noteActivity();
  });
  await waitForScreen(page, 'finish');
  await expect(page.locator('#finish-title')).toHaveText('You made it!');
  await expect(page.locator('#finish-team')).toBeHidden();
  await expect(page.locator('.friends-results')).toBeHidden();
  expect(await saidAtTheEnd(page)).toEqual({ line: MADE_IT, lost: false });
  expect(ben.errors).toEqual([]);
  await ben.context.close();
});
