// Hat Chase, played in the real page, with footage of a real person going through the real tracker: standing still,
// lifting each foot, jumping, squatting, a star jump, arms up, or nobody there. Where a test is about what comes after
// a move, it says what a tracked body would do by calling the rules in the page, or by saying how high each foot is,
// as the body reader would, so that the marching goes through the game's own reading of it.
import {
  GENTLE, armsDown, armsUp, asked, atLevel, calloutsSeen, drawnBox, expect, expectSoon, feetAt, getPast, heard, hold, jumping,
  liftFoot, liftingEachFoot, listen, marchToNext, middle, nobody, noteAsked, noteCallouts, noteWhatIsSaid, onBothFeet, openChase,
  overlap, partWay, pathWith, readyToJump, readyToSquat, readyToStarJump, reachPlay, said, shot, squatting, standInView, standsAt, starJumping,
  state, test, waitForScreen, walkUnderATree, walkUpTo,
} from './helpers.js';

const LOST_TITLE = 'The magpie got away! Try again.';
const coach = (page) => page.locator('#coach');
const coachText = (page) => page.locator('#coach-text');
const promptText = (page) => page.locator('#prompt-text');

/** The film and the words the character shows while the child is asked for something. */
const asking = async (page) => {
  const now = await state(page);
  return { film: now.film, coach: now.coach, words: now.coachText, prompt: now.prompt };
};

/* ---------- getting in ---------- */

test('the title card names the game and the mission, says the camera picture stays here, and All games goes back to every game', async ({ page }) => {
  await openChase(page);
  await expect(page.locator('#screen-welcome h1')).toHaveText('Hat Chase');
  await expect(page.locator('.tagline')).toHaveText('The magpie took the hat! March on the spot to walk after it, and jump, duck and reach on the way.');
  await expect(page.locator('#start')).toHaveText('Choose your walker');
  await expect(page.locator('#level-badge')).toHaveText('Level 1 of 10');
  await expect(page.locator('#level-new')).toBeHidden();
  const words = page.locator('#screen-welcome .small-print');
  await expect(words).toContainText('the camera picture stays on this computer. It is never saved or sent anywhere.');
  await expect(words).toContainText('Marching and jumping, a child can slip or land badly: please clear some space on a floor that isn’t slippery, and stay close by.');
  // The way back to all the games, which opens them.
  const back = page.locator('#screen-welcome .all-games');
  await expect(back).toHaveText('All games');
  await back.click();
  await expect(page).toHaveURL(/\/index\.html$/);
  await expect(page.locator('a[href*="games/"]').first()).toBeVisible();
});

test('on the title card the character and the magpie with the hat can both be seen, clear of the card', async ({ page }) => {
  await openChase(page);
  await expectSoon(() => page.evaluate(() => Boolean(window.__game.view.art))).toBe(true);
  const card = await page.locator('#screen-welcome .card').boundingBox();
  const cardBox = { left: card.x, right: card.x + card.width, top: card.y, bottom: card.y + card.height };
  const hero = await drawnBox(page, 'drawHero');
  const magpie = await drawnBox(page, 'drawMagpie');
  console.log('the title card', JSON.stringify(cardBox), 'the character', JSON.stringify(hero), 'the magpie', JSON.stringify(magpie));
  expect(hero.count).toBeGreaterThan(2000);
  expect(overlap(hero, cardBox), 'the character is behind the title card').toBe(false);
  expect(magpie.count).toBeGreaterThan(300);
  expect(overlap(magpie, cardBox), 'the magpie is behind the title card').toBe(false);
  await shot(page, 'hat-title');
});

test('the chooser asks who is going after the hat: Giraffe stands in the middle with the magpie ahead, both clear of the cards, and another walker can be chosen', async ({ page }) => {
  await openChase(page);
  await page.locator('#start').click();
  await waitForScreen(page, 'choose');
  await expect(page.locator('#screen-choose h2')).toHaveText('Who’s going after the hat today?');
  await expect(page.locator('#chosen-name')).toHaveText('Giraffe');
  await expect(page.locator('.choose-tip')).toContainText('a step for each knee you lift');
  await expect(page.locator('#chase-start')).toHaveText('Let’s go!');
  await expect(page.locator('#screen-choose .all-games')).toHaveAttribute('href', '../../index.html');
  // Over to the middle, a little at a time.
  await expectSoon(() => page.evaluate(() => window.__game.view.place)).toBe(0.5);
  const cards = {};
  for (const [name, selector] of [['heading', '#screen-choose h2'], ['the chosen card', '.chosen'], ['the card with the button', '.choose-side'], ['the walkers', '#fighter-grid'], ['all games', '#screen-choose .all-games']]) {
    const box = await page.locator(selector).boundingBox();
    cards[name] = { left: box.x, right: box.x + box.width, top: box.y, bottom: box.y + box.height };
  }
  const check = async () => {
    const hero = await drawnBox(page, 'drawHero');
    const magpie = await drawnBox(page, 'drawMagpie');
    const { heroAt, metre, width } = await state(page);
    expect(hero.count).toBeGreaterThan(2000);
    expect(heroAt.x).toBeCloseTo(width / 2, 0);
    expect(standsAt(hero, heroAt, metre), `the character drawn at ${JSON.stringify(hero)}, its feet at ${JSON.stringify(heroAt)}`).toBe(true);
    expect(magpie.count).toBeGreaterThan(300);
    expect(middle(magpie).x).toBeGreaterThan(middle(hero).x);
    const covered = Object.entries(cards).flatMap(([name, box]) => [overlap(hero, box) && `the character is behind ${name}`, overlap(magpie, box) && `the magpie is behind ${name}`]).filter(Boolean);
    console.log('on the chooser: the character', JSON.stringify(hero), 'the magpie', JSON.stringify(magpie), 'the cards', JSON.stringify(cards));
    expect(covered).toEqual([]);
  };
  await check();
  await shot(page, 'hat-chooser');
  // Another walker: its own name, and its own picture, drawn where Giraffe was.
  await page.evaluate(() => {
    window.__art = window.__game.view.art;
  });
  await page.locator('.fighter-card').nth(3).click();
  await expect(page.locator('#chosen-name')).not.toHaveText('Giraffe');
  expect(await page.evaluate(() => window.__game.view.art !== window.__art && Boolean(window.__game.view.art))).toBe(true);
  await check();
});

test('Let’s go checks that the child can be seen, counts down, and the chase begins with the character on the path asking for marching', async ({ page }) => {
  await openChase(page);
  await standInView(page);
  await page.locator('#start').click();
  await waitForScreen(page, 'choose');
  await page.locator('#chase-start').click();
  await waitForScreen(page, 'bodycheck');
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-now')).toHaveText('Level 1');
  await expect(page.locator('#count')).toHaveText(/^[123]$/);
  // The stars, the magpie and the path along the top, from the countdown on.
  await expect(page.locator('#chase-top')).toBeVisible();
  await waitForScreen(page, 'playing');
  // Marching is shown and asked for straight away.
  await expect(coachText(page)).toHaveText('March on the spot to walk!', { timeout: 1500 });
  await expect(promptText(page)).toHaveText('March on the spot to walk!', { timeout: 1500 });
  const now = await state(page);
  expect([now.state, now.hero.x, now.stats.steps, now.stats.stars]).toEqual(['play', 0, 0, 0]);
  expect(now.course).toHaveLength(12);
  expect(now.course.every(({ kind }) => kind === 'stream')).toBe(true);
  expect(now.lead).toBeGreaterThanOrEqual(8);
  await expect(coach(page)).toHaveClass(/is-visible/);
  await expect(coachText(page)).toHaveText('March on the spot to walk!');
  expect((await state(page)).film).toBe('highKnees');
  await expect(promptText(page)).toHaveText('March on the spot to walk!');
  await expect(page.locator('#stars')).toHaveText('0');
  await expect(page.locator('#magpie-words')).toHaveText('Close');
  expect(await page.locator('#path-fill').evaluate((fill) => fill.style.width)).toBe('0%');
  // The character on the path, a quarter of the way across, where the rules and the view say.
  await expectSoon(async () => (await state(page)).place).toBe(0.24);
  const hero = await drawnBox(page, 'drawHero');
  const { heroAt, metre, ground, width } = await state(page);
  expect(heroAt.y).toBe(ground);
  expect(Math.abs(heroAt.x - width * 0.24)).toBeLessThan(1);
  expect(standsAt(hero, heroAt, metre), `the character drawn at ${JSON.stringify(hero)}, its feet at ${JSON.stringify(heroAt)}`).toBe(true);
  await shot(page, 'hat-start');
});

/* ---------- marching ---------- */

test('a person standing still in front of the camera takes no step, however long, and the character shows how to march', async ({ page }) => {
  test.setTimeout(120_000);
  await reachPlay(page, GENTLE);
  for (let n = 0; n < 12; n += 1) {
    await page.waitForTimeout(1000);
    const now = await state(page);
    expect([now.stats.steps, now.hero.x, now.stats.jumps, now.stats.squats, now.hero.mode, now.screen]).toEqual([0, 0, 0, 0, 'stand', 'playing']);
  }
  expect(await asking(page)).toEqual({ film: 'highKnees', coach: true, words: 'March on the spot to walk!', prompt: 'March on the spot to walk!' });
});

test('through the real tracker, lifting the right foot and then the left are a step each, with that leg, and the character walks a metre for each', async ({ page }) => {
  test.setTimeout(120_000);
  await reachPlay(page, GENTLE, onBothFeet);
  await listen(page);
  await liftingEachFoot(page);
  await expectSoon(async () => (await state(page)).stats.steps, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  // The first, walked, before the second foot goes up.
  await expectSoon(async () => (await state(page)).hero.mode, { timeout: 5000 }).toBe('stand');
  let now = await state(page);
  expect([now.stats.steps, now.stats.right, now.stats.left]).toEqual([1, 1, 0]);
  expect(now.hero.x).toBeCloseTo(1, 6);
  await expectSoon(async () => (await state(page)).stats.steps, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  // Both feet down to the end of the footage's lifts, and nothing more.
  await page.waitForTimeout(5000);
  now = await state(page);
  expect([now.stats.steps, now.stats.right, now.stats.left, now.stats.jumps]).toEqual([2, 1, 1, 0]);
  expect(now.hero.x).toBeCloseTo(2, 6);
  expect((await heard(page, 'step')).map(({ side }) => side)).toEqual(['right', 'left']);
  // Along the top, how far along the path that is.
  expect(await page.locator('#path-fill').evaluate((fill) => fill.style.width)).toBe(`${Math.round((2 / now.end) * 100)}%`);
  // The land has gone by, and the character is drawn where it is, a quarter of the way across.
  await expectSoon(async () => (await state(page)).camera, { timeout: 5000 }).toBeCloseTo(2, 2);
  const hero = await drawnBox(page, 'drawHero');
  const { heroAt, metre, width } = await state(page);
  expect(Math.abs(heroAt.x - width * 0.24)).toBeLessThan(2);
  expect(standsAt(hero, heroAt, metre), `the character drawn at ${JSON.stringify(hero)}, its feet at ${JSON.stringify(heroAt)}`).toBe(true);
  await shot(page, 'hat-real-steps');
});

test('the game reads a step from each knee lifted: a lift held up is one step, a foot not up to the line is none, and both feet up together is none', async ({ page }) => {
  await reachPlay(page, GENTLE);
  await feetAt(page, { left: 0.02, right: 0.02 });
  await listen(page);
  // A knee lifted, by the line, as Medium has it: 11% of leg length.
  await liftFoot(page, 'left', { height: 0.14 });
  await expectSoon(async () => (await state(page)).stats.steps).toBe(1);
  // Held up for two seconds: still one step.
  await liftFoot(page, 'right', { height: 0.14, hold: 2000 });
  await expectSoon(async () => (await state(page)).stats.steps).toBe(2);
  // Once the child is marching, the character stops asking.
  await expect(coach(page)).not.toHaveClass(/is-visible/);
  // Not up to the line.
  await liftFoot(page, 'left', { height: 0.09 });
  await liftFoot(page, 'right', { height: 0.09 });
  // Both up at once.
  await feetAt(page, { left: 0.2, right: 0.2 });
  await page.waitForTimeout(500);
  await feetAt(page, { left: 0.02, right: 0.02 });
  await page.waitForTimeout(800);
  const now = await state(page);
  expect([now.stats.steps, now.stats.left, now.stats.right]).toEqual([2, 1, 1]);
  expect(now.hero.x).toBeCloseTo(2, 6);
  expect((await heard(page, 'step')).map(({ side }) => side)).toEqual(['left', 'right']);
});

test('marching quicker than the character walks: it is never more than two steps ahead of itself, and stops soon after the marching does', async ({ page }) => {
  await reachPlay(page, GENTLE);
  await feetAt(page, { left: 0.02, right: 0.02 });
  await page.evaluate(() => {
    const { chase } = window.__game;
    window.__ahead = 0;
    window.__watching = setInterval(() => {
      window.__ahead = Math.max(window.__ahead, chase.hero.walkTo - chase.hero.x);
    }, 5);
  });
  for (let n = 0; n < 8; n += 1) await liftFoot(page, n % 2 ? 'right' : 'left', { height: 0.2, hold: 110, rest: 110 });
  const stopped = await state(page);
  await expectSoon(async () => (await state(page)).hero.mode).toBe('stand');
  const now = await state(page);
  const ahead = await page.evaluate(() => {
    clearInterval(window.__watching);
    return window.__ahead;
  });
  console.log('eight quick lifts:', now.stats.steps, 'steps,', now.hero.x.toFixed(2), 'metres, at most', ahead.toFixed(2), 'metres still to walk');
  expect(now.stats.steps).toBeGreaterThanOrEqual(3);
  expect(ahead).toBeLessThanOrEqual(2 + 1e-6);
  expect(now.hero.x - stopped.hero.x).toBeLessThanOrEqual(2 + 1e-6);
  // Never more than a metre for each step.
  expect(now.hero.x).toBeLessThanOrEqual(now.stats.steps + 1e-6);
});

test('marching does nothing while the character is sat after a tumble or getting past something, and walks on after', async ({ page }) => {
  await reachPlay(page, atLevel(4, GENTLE));
  await feetAt(page, { left: 0.02, right: 0.02 });
  const index = await walkUpTo(page, 'hedgehog');
  expect(index).not.toBe(null);
  // Left to roll in: sat down, a lift is no step.
  await expectSoon(async () => (await state(page)).hero.mode, { timeout: 15_000, intervals: [20] }).toBe('tumble');
  let now = await state(page);
  const [steps, sat] = [now.stats.steps, now.hero.x];
  await liftFoot(page, 'left', { hold: 200, rest: 200 });
  now = await state(page);
  expect([now.hero.mode, now.stats.steps, now.hero.x]).toEqual(['tumble', steps, sat]);
  await expectSoon(async () => (await state(page)).hero.mode).toBe('stand');
  // Up again: a lift is a step.
  await liftFoot(page, 'right');
  await expectSoon(async () => (await state(page)).stats.steps).toBe(steps + 1);
  await expectSoon(async () => (await state(page)).hero.x).toBeGreaterThan(sat + 0.99);
  // At the next thing, getting past it, in the air or ducked down: a lift is no step, and it ends where the move takes it.
  await marchToNext(page);
  now = await state(page);
  const counted = now.stats.steps;
  const thing = now.station;
  await page.evaluate(() => {
    const { chase } = window.__game;
    if (chase.station.needs === 'jump') chase.jump(1);
    else chase.squat();
  });
  await liftFoot(page, 'left', { hold: 150, rest: 150 });
  await expectSoon(async () => (await state(page)).hero.mode).toBe('stand');
  now = await state(page);
  expect(now.stats.steps).toBe(counted);
  expect(now.hero.x).toBeCloseTo(thing.at + thing.wide + 0.6, 6);
});

/* ---------- a jump at a stream ---------- */

test('the character stops by itself just before a stream, and the film and the words ask for a jump', async ({ page }) => {
  await reachPlay(page, GENTLE);
  await listen(page);
  const index = await marchToNext(page);
  expect(index).toBe(0);
  const now = await state(page);
  const stream = now.course[0];
  expect(now.station.kind).toBe('stream');
  expect(now.hero.x).toBeCloseTo(stream.at - 0.6, 6);
  expect((await heard(page, 'arrive')).map(({ kind }) => kind)).toEqual(['stream']);
  await expect(coachText(page)).toHaveText('Jump!');
  await expect(promptText(page)).toHaveText('Jump!');
  expect((await state(page)).film).toBe('jump');
  // Drawn where the rules have it: the water from the stream's near bank to its far one, just ahead of the character.
  await hold(page);
  const water = await drawnBox(page, 'drawThing', 0);
  const hero = await drawnBox(page, 'drawHero');
  const { heroAt, metre, magpieAt, width } = await state(page);
  console.log('the stream drawn at', JSON.stringify(water), 'the character at', JSON.stringify(hero), 'a metre is', metre);
  expect(Math.abs(water.left - (heroAt.x + 0.6 * metre))).toBeLessThan(metre * 0.2);
  expect(Math.abs(water.right - (heroAt.x + (0.6 + stream.wide) * metre))).toBeLessThan(metre * 0.2);
  expect(Math.abs(middle(hero).x - heroAt.x)).toBeLessThan(metre * 0.5);
  // And the magpie, ahead, on the screen.
  const magpie = await drawnBox(page, 'drawMagpie');
  expect(magpieAt.seen).toBe(true);
  expect(Math.abs(middle(magpie).x - magpieAt.x)).toBeLessThan(metre * 0.6);
  expect(magpie.right).toBeLessThanOrEqual(width);
  await hold(page, false);
  await shot(page, 'hat-at-stream');
});

test('at a stream, steps, bent knees and arms up do nothing; a jump takes the character over, it is said Over!, and the star for it is added', async ({ page }) => {
  await reachPlay(page, GENTLE);
  await listen(page);
  await noteCallouts(page);
  await marchToNext(page);
  const before = await state(page);
  await page.evaluate(() => {
    const { chase } = window.__game;
    chase.step('left');
    chase.squat();
    chase.reach();
  });
  await page.waitForTimeout(1500);
  let now = await state(page);
  expect([now.hero.x, now.station?.index, now.stats.stars, now.stats.cleared, now.hero.mode]).toEqual([before.hero.x, 0, before.stats.stars, 0, 'stand']);
  await expect(coachText(page)).toHaveText('Jump!');
  // A small jump: over, and one star, with the star above the stream left where it is.
  await page.evaluate(() => window.__game.chase.jump(1.1));
  now = await state(page);
  expect([now.hero.mode, now.hero.move.kind, now.station]).toEqual(['move', 'leap', null]);
  // In the air, half way over, drawn up off the path, in the picture of a jump.
  const air = await partWay(page, 0.45);
  expect(air).not.toBe(null);
  expect([air.kind, air.frame]).toEqual(['leap', 'hop']);
  expect(air.y).toBeLessThan(air.ground - air.metre * 0.7);
  await expectSoon(async () => (await state(page)).hero.mode).toBe('stand');
  now = await state(page);
  const stream = now.course[0];
  expect(stream.state).toBe('cleared');
  expect(now.hero.x).toBeCloseTo(stream.at + stream.wide + 0.6, 6);
  expect(now.stats.stars).toBe(before.stats.stars + 1);
  expect(stream.high.taken).toBe(false);
  expect(await calloutsSeen(page)).toEqual(['✓ Over!']);
  await expect(page.locator('#stars')).toHaveText(String(now.stats.stars));
  // The next one, with a big jump: the star above it is caught too.
  await marchToNext(page);
  const second = (await state(page)).stats.stars;
  await page.evaluate(() => window.__game.chase.jump(1.8));
  await expectSoon(async () => (await state(page)).course[1].state).toBe('cleared');
  now = await state(page);
  expect(now.course[1].high.taken).toBe(true);
  expect(now.stats.stars).toBe(second + 2);
  expect((await heard(page, 'jump')).map(({ big }) => big)).toEqual([false, true]);
});

test('through the real tracker, a real jump at a stream takes the character over it', async ({ page }) => {
  test.setTimeout(120_000);
  // The person of the jumping footage, standing, from the check on, so that only their own jumps are read.
  await reachPlay(page, GENTLE, readyToJump);
  await listen(page);
  await noteCallouts(page);
  await marchToNext(page);
  const before = await state(page);
  expect(before.station.kind).toBe('stream');
  expect(before.stats.jumps).toBe(0);
  await jumping(page);
  await expectSoon(async () => (await state(page)).course[0].state, { timeout: 30_000 }).toBe('cleared');
  const now = await state(page);
  console.log('a real jump at a stream:', JSON.stringify(await heard(page, 'jump')));
  expect(now.hero.x).toBeGreaterThan(before.course[0].at + before.course[0].wide);
  expect(now.stats.cleared).toBe(1);
  expect(now.stats.stars).toBeGreaterThanOrEqual(before.stats.stars + 1);
  expect(await calloutsSeen(page)).toContain('✓ Over!');
  await shot(page, 'hat-real-jump');
});

test('a jump made as the character walks its last bit up to a stream does not leave it standing short of the stream', async ({ page }) => {
  await reachPlay(page, GENTLE);
  await feetAt(page, { left: 0.02, right: 0.02 });
  await listen(page);
  // Marching up to the first stream, until the last step that takes the character to it.
  let side = 'left';
  for (let n = 0; n < 12; n += 1) {
    const { hero, course } = await state(page);
    if (course[0].at - 0.6 - hero.x <= 1) break;
    await liftFoot(page, side, { hold: 250, rest: 250 });
    side = side === 'left' ? 'right' : 'left';
  }
  // The last step, which walks it the rest of the way, and a jump with a little of that still to go.
  await page.evaluate(async (foot) => {
    const { chase, reader } = window.__game;
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    reader.__feet = { left: 0.02, right: 0.02, [foot]: 0.2 };
    for (let n = 0; n < 500 && chase.hero.mode !== 'walk'; n += 1) await wait(2);
    reader.__feet = { left: 0.02, right: 0.02 };
    for (let n = 0; n < 300 && chase.hero.mode === 'walk' && chase.stopAt - chase.hero.x > 0.2; n += 1) await wait(2);
    window.__early = { short: chase.stopAt - chase.hero.x, walking: chase.hero.mode, jumped: chase.jump(1) };
  }, side);
  console.log('a jump this far short of the stream:', JSON.stringify(await page.evaluate(() => window.__early)));
  await page.waitForTimeout(2500);
  const now = await state(page);
  console.log('then:', JSON.stringify({ x: now.hero.x, stop: now.course[0].at - 0.6, station: now.station?.kind ?? null, stream: now.course[0].state, film: now.film, prompt: now.prompt }));
  // Over the stream, or stood at it with a jump asked for: anything but short of it, with the jump gone for nothing.
  const over = now.course[0].state === 'cleared';
  const waiting = now.station?.index === 0 && now.film === 'jump';
  expect(over || waiting, `the character is at ${now.hero.x.toFixed(2)}, the stream's stop at ${(now.course[0].at - 0.6).toFixed(2)}, with the film ${now.film}`).toBe(true);
});

/* ---------- bent knees, a star jump and arms up, through the real tracker ---------- */

/**
 * The person of another clip, held still, put in front of the camera before anything is in the way: the squat and
 * the star jumps are filmed so that their people can't pass the check that the child can be seen on their own. A
 * change of person can be read as a move, so this waits until the reader has settled on them, standing, and says how
 * many moves it read on the way, which, with nothing in the way, do nothing. measure, for a person who is a different
 * size in the picture, has the reader take them standing, as the check that the child can be seen does.
 */
const settleOn = async (page, person, { measure = false } = {}) => {
  await person(page);
  await page.waitForTimeout(1500);
  if (measure) {
    await page.evaluate(() => {
      const { game, reader } = window.__game;
      reader.setStanding(game.latestBody, game.aspect);
    });
  }
  await expectSoon(() => page.evaluate(() => {
    const { reader } = window.__game;
    return !reader.squatting && !reader.inAir && !window.__game.game.air;
  }), { timeout: 20_000 }).toBe(true);
  await page.waitForTimeout(1000);
  return (await state(page)).stats;
};

test('through the real tracker, a real squat at a branch, at level 2, ducks the character under it, and it is said Under!', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, atLevel(2, GENTLE));
  const settled = await settleOn(page, readyToSquat, { measure: true });
  console.log('read while the squatting person was put in front of the camera:', JSON.stringify({ squats: settled.squats, jumps: settled.jumps }));
  await listen(page);
  await noteCallouts(page);
  const index = await walkUpTo(page, 'branch');
  expect(index).not.toBe(null);
  await expect(coachText(page)).toHaveText('Bend your knees!');
  await expect(promptText(page)).toHaveText('Bend your knees!');
  expect((await state(page)).film).toBe('squat');
  const before = await state(page);
  await page.waitForTimeout(1000);
  // Standing still in front of the branch, nothing gets the character under it.
  expect((await state(page)).station?.index).toBe(index);
  await squatting(page);
  // Not before the person in the footage has begun to go down, which is half a second in.
  await page.waitForTimeout(350);
  expect((await state(page)).course[index].state).toBe('at');
  await expectSoon(async () => (await state(page)).course[index].state, { timeout: 30_000 }).toBe('cleared');
  const now = await state(page);
  expect(now.stats.squats).toBeGreaterThan(before.stats.squats);
  expect(now.stats.stars).toBe(before.stats.stars + 1);
  expect(now.hero.x).toBeCloseTo(before.station.at + before.station.wide + 0.6, 6);
  expect(await calloutsSeen(page)).toContain('✓ Under!');
  expect((await heard(page, 'cleared')).at(-1).how).toBe('duck');
  await shot(page, 'hat-real-squat');
});

test('through the real tracker, a real star jump at a springboard, at level 6, bounces the character over and catches the arc of five stars', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, atLevel(6, GENTLE));
  const settled = await settleOn(page, readyToStarJump);
  console.log('read while the star-jumping person was put in front of the camera:', JSON.stringify({ jumps: settled.jumps, starJumps: settled.starJumps }));
  await listen(page);
  await noteCallouts(page);
  const index = await walkUpTo(page, 'spring');
  expect(index).not.toBe(null);
  await expect(coachText(page)).toHaveText('Do a star jump!');
  await expect(promptText(page)).toHaveText('Do a star jump!');
  expect((await state(page)).film).toBe('starJump');
  await page.waitForTimeout(1000);
  const before = await state(page);
  expect(before.station?.index).toBe(index);
  await starJumping(page);
  await expectSoon(async () => (await state(page)).course[index].state, { timeout: 30_000 }).toBe('cleared');
  const now = await state(page);
  console.log('a real star jump at a springboard:', JSON.stringify((await heard(page)).filter(({ type }) => ['jump', 'stars', 'cleared'].includes(type))));
  expect(now.stats.starJumps).toBeGreaterThan(before.stats.starJumps);
  expect(now.stats.stars).toBe(before.stats.stars + 1 + 5);
  expect(await calloutsSeen(page)).toContain('✓ Star jump!');
  expect(await page.evaluate((at) => window.__game.view.gone.has(`arc-${at}`), index)).toBe(true);
  await shot(page, 'hat-real-star-jump');
});

test('through the real tracker, arms up high under an apple tree, at level 3, bring the apples down', async ({ page }) => {
  test.setTimeout(120_000);
  await reachPlay(page, atLevel(3, GENTLE), armsDown);
  await listen(page);
  await noteCallouts(page);
  const tree = await walkUnderATree(page);
  expect(tree).not.toBe(null);
  await expect(coachText(page)).toHaveText('Reach up high!');
  await expect(promptText(page)).toHaveText('Reach up high!');
  expect((await state(page)).film).toBe('skyReach');
  const before = await state(page);
  await armsUp(page);
  await expectSoon(async () => (await state(page)).stats.apples, { timeout: 20_000 }).toBe(3);
  const now = await state(page);
  expect(now.trees[tree].picked).toBe(true);
  expect(now.stats.stars).toBe(before.stats.stars + 3);
  expect(await calloutsSeen(page)).toContain('✓ Apples!');
  // The apples fall, on the screen, from where the tree is.
  const apples = await page.evaluate(() => window.__game.view.effects.filter(({ kind }) => kind === 'apple').map(({ x }) => x));
  expect(apples).toHaveLength(3);
  for (const x of apples) expect(x).toBeGreaterThanOrEqual(now.trees[tree].at);
  await expectSoon(async () => (await state(page)).film, { timeout: 5000 }).not.toBe('skyReach');
  await shot(page, 'hat-real-apples');
});

test('through the real tracker, for a child who jumps by reaching up, arms up high at a stream take the character over it', async ({ page }) => {
  test.setTimeout(120_000);
  await reachPlay(page, { ...GENTLE, chaseJump: 'arms' }, armsDown);
  await noteAsked(page);
  await marchToNext(page);
  await expect(coachText(page)).toHaveText('Arms up high to jump!');
  await expect(promptText(page)).toHaveText('Arms up high to jump!');
  expect((await state(page)).film).toBe('skyReach');
  await armsUp(page);
  await expectSoon(async () => (await state(page)).course[0].state, { timeout: 20_000 }).toBe('cleared');
  expect((await state(page)).stats.jumps).toBe(1);
  // A jump is never asked for in words.
  const words = (await asked(page)).filter(({ text }) => text).map(({ text }) => text);
  expect(words.filter((text) => /^Jump/.test(text))).toEqual([]);
});

/* ---------- things that come at the character ---------- */

test('a hedgehog left too long rolls in: it comes nearer on the screen, then a tumble, Bump!, no stars for it, and the walk goes on', async ({ page }) => {
  await reachPlay(page, atLevel(4, GENTLE));
  const index = await walkUpTo(page, 'hedgehog');
  expect(index).not.toBe(null);
  const arrived = await page.evaluate(() => performance.now());
  await listen(page);
  await noteCallouts(page);
  const cleared = (await state(page)).stats.cleared;
  await expect(coachText(page)).toHaveText('Jump!');
  // It rolls nearer as its time runs down: drawn further left a second later.
  const first = await drawnBox(page, 'drawInFront', index);
  await page.waitForTimeout(1500);
  const later = await drawnBox(page, 'drawInFront', index);
  console.log('the hedgehog drawn at', JSON.stringify(first), 'and then', JSON.stringify(later));
  expect(later.left).toBeLessThan(first.left - 10);
  const stars = (await state(page)).stats.stars;
  await expectSoon(async () => (await state(page)).hero.mode, { timeout: 10_000, intervals: [20] }).toBe('tumble');
  const tumbled = (await heard(page, 'tumble'))[0];
  // At level 4 it takes five seconds to roll in.
  console.log('the hedgehog rolled in after', Math.round(tumbled.at - arrived), 'ms');
  expect(tumbled.at - arrived).toBeGreaterThan(4300);
  expect(tumbled.at - arrived).toBeLessThan(6500);
  let now = await state(page);
  expect(now.frame).toBe('sit');
  expect([now.stats.tumbles, now.stats.stars, now.stats.cleared, now.course[index].missed, now.station]).toEqual([1, stars, cleared, true, null]);
  expect(await calloutsSeen(page)).toEqual(['✓ Bump!']);
  // It has rolled on by, and isn't drawn.
  expect(await drawnBox(page, 'drawInFront', index)).toBe(null);
  await shot(page, 'hat-tumble');
  // Up again, and on.
  await expectSoon(async () => (await state(page)).hero.mode, { timeout: 5000 }).toBe('stand');
  await marchToNext(page);
  now = await state(page);
  expect(now.hero.x).toBeGreaterThan(now.course[index].at + now.course[index].wide);
});

test('with nobody in the picture the hedgehog and the magpie wait where they are, and the child is asked back; back in view, they come on again', async ({ page }) => {
  test.setTimeout(120_000);
  await reachPlay(page, atLevel(4));
  const index = await walkUpTo(page, 'hedgehog', 300);
  expect(index).not.toBe(null);
  await nobody(page);
  await expect(promptText(page)).toHaveText('Come back where I can see you', { timeout: 15_000 });
  const stopped = await state(page);
  expect(stopped.state).toBe('play');
  expect(stopped.station.left).toBeGreaterThan(0);
  for (let n = 0; n < 8; n += 1) {
    await page.waitForTimeout(1000);
    const now = await state(page);
    expect([now.station?.left, now.lead, now.time, now.state, now.hero.mode]).toEqual([stopped.station.left, stopped.lead, stopped.time, 'play', 'stand']);
  }
  // The film asking for a jump is put away while there's nobody to see it.
  await expect(coach(page)).not.toHaveClass(/is-visible/);
  await standInView(page);
  await expectSoon(async () => (await state(page)).time, { timeout: 15_000 }).toBeGreaterThan(stopped.time);
  await expectSoon(async () => (await state(page)).station?.left ?? 0, { timeout: 15_000 }).toBeLessThan(stopped.station.left);
});

/* ---------- nobody is stuck ---------- */

test('nobody is stuck: after 12 seconds at a stream the character shows marching, and a step then climbs over it, slowly and for no stars', async ({ page }) => {
  test.setTimeout(120_000);
  await reachPlay(page);
  await feetAt(page, { left: 0.02, right: 0.02 });
  await noteAsked(page);
  await listen(page);
  await marchToNext(page);
  const arrived = await page.evaluate(() => performance.now());
  const stars = (await state(page)).stats.stars;
  // Marching on the spot before then goes nowhere, and a jump is still what's asked for.
  await page.waitForTimeout(6000);
  await liftFoot(page, 'left');
  let now = await state(page);
  expect([now.station?.index, now.hero.mode, now.film]).toEqual([0, 'stand', 'jump']);
  // Then marching is what's shown.
  await expectSoon(async () => (await state(page)).film, { timeout: 15_000 }).toBe('highKnees');
  const changed = (await asked(page)).find(({ at, what, text }) => at > arrived && what === 'film' && text === 'March on the spot to walk!');
  console.log('marching was shown', Math.round(changed.at - arrived), 'ms after the character stopped at the stream');
  expect(changed.at - arrived).toBeGreaterThan(11_500);
  expect(changed.at - arrived).toBeLessThan(14_000);
  await expect(coachText(page)).toHaveText('March on the spot to walk!');
  await expect(promptText(page)).toHaveText('March on the spot to walk!');
  // All this while the magpie flew on, and hasn't got away.
  expect((await state(page)).state).toBe('play');
  await liftFoot(page, 'right');
  now = await state(page);
  expect(now.hero.move?.kind).toBe('clamber');
  await expectSoon(async () => (await state(page)).course[0].state, { timeout: 10_000 }).toBe('cleared');
  const climbed = await heard(page, 'cleared');
  expect(climbed.map(({ how }) => how)).toEqual(['clamber']);
  expect(climbed[0].at - (await heard(page, 'helped'))[0].at).toBeGreaterThan(2000);
  now = await state(page);
  expect([now.stats.helped, now.stats.cleared, now.stats.stars]).toEqual([1, 0, stars]);
});

/* ---------- the magpie ---------- */

/** The magpie put so many metres ahead of the character, from where it flies on. */
const magpieAhead = (page, metres) => page.evaluate((lead) => {
  const { chase } = window.__game;
  chase.magpie.x = chase.hero.x + lead;
}, metres);

test('the magpie chip says how far ahead the magpie is, in words and a bar, getting away is said once, and caught up a good way it can be said again', async ({ page }) => {
  test.setTimeout(120_000);
  await reachPlay(page);
  await noteWhatIsSaid(page);
  const chip = async () => ({
    words: await page.locator('#magpie-words').textContent(),
    far: await page.locator('#magpie-chip').getAttribute('data-danger'),
    bar: await page.locator('#magpie-fill').evaluate((fill) => parseFloat(fill.style.width)),
    value: Number(await page.locator('#magpie-meter').getAttribute('aria-valuenow')),
    danger: Math.round((await state(page)).danger * 100),
  });
  await expect(page.locator('#magpie-meter')).toBeVisible();
  for (const [lead, words, far] of [[8, 'Close', 'near'], [13, 'Ahead', 'near'], [19.5, 'Getting away!', 'far']]) {
    await magpieAhead(page, lead);
    await expect(page.locator('#magpie-words')).toHaveText(words);
    const now = await chip();
    expect(now.far).toBe(far);
    expect(Math.abs(now.bar - now.danger)).toBeLessThanOrEqual(1);
    expect(Math.abs(now.value - now.danger)).toBeLessThanOrEqual(1);
    expect(Math.abs(now.danger - Math.round(((lead - 6) / 18) * 100))).toBeLessThanOrEqual(4);
  }
  // Out of the picture at this width: a sign at the right edge stands for it.
  const { magpieAt, width, metre } = await state(page);
  expect(magpieAt.seen).toBe(false);
  const sign = await drawnBox(page, 'drawMagpie');
  expect(Math.abs(middle(sign).x - (width - metre * 0.75))).toBeLessThan(metre * 0.3);
  expect(sign.right).toBeLessThanOrEqual(width);
  await shot(page, 'hat-magpie-far');
  // Said once, however long it stays far ahead.
  await page.waitForTimeout(2500);
  const away = () => said(page).then((lines) => lines.filter(({ text }) => text === 'The magpie is getting away! March!').length);
  expect(await away()).toBe(1);
  // Caught up a good way, and away again: said again.
  await magpieAhead(page, 9);
  await page.waitForTimeout(300);
  await magpieAhead(page, 18);
  await expectSoon(away).toBe(2);
  expect((await state(page)).state).toBe('play');
});

test('24 metres ahead the magpie has got away: the card says so kindly, nothing cheers, the level stays, and Try again starts that level afresh', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, atLevel(2, { voice: true, sound: true }));
  await noteWhatIsSaid(page);
  await page.evaluate(() => {
    const { sound } = window.__game;
    window.__cheers = 0;
    const cheer = sound.cheer.bind(sound);
    sound.cheer = () => {
      window.__cheers += 1;
      cheer();
    };
  });
  await listen(page);
  // Some way along first, so that the card has something to count.
  await marchToNext(page);
  await getPast(page);
  await magpieAhead(page, 23.6);
  await expectSoon(async () => (await state(page)).state, { timeout: 10_000 }).toBe('lost');
  const end = await state(page);
  expect(end.lead).toBeGreaterThanOrEqual(24);
  expect(end.lead).toBeLessThan(24.2);
  expect(end.screen).toBe('finishing');
  // The camera is let go at once.
  expect(await page.evaluate(() => window.__camera.activeTracks)).toBe(0);
  await waitForScreen(page, 'finish');
  await expect(page.locator('#finish-title')).toHaveText(LOST_TITLE);
  await expect(page.locator('#chase-again')).toHaveText('Try again');
  await expect(page.locator('#level-done-text')).toHaveText('Let’s try level 2 again!');
  await expect(page.locator('#finish-stars')).toHaveText(String(end.stats.stars));
  await expect(page.locator('#finish-line')).toHaveText(`Giraffe took ${end.stats.steps} steps, ${end.stats.left} with the left leg and ${end.stats.right} with the right, and got past 1 of the 12 things in the way.`);
  expect(await page.evaluate(() => [window.__game.game.levels.current, window.__game.game.confetti.running, window.__cheers])).toEqual([2, false, 0]);
  expect(await page.evaluate(() => window.__game.sound.finished)).toEqual({ line: 'The magpie got away! Try again!', lost: true });
  await expectSoon(async () => (await said(page)).map(({ text }) => text)).toContain('The magpie got away! Try again!');
  // The character is drawn beside the card, and not behind it.
  await shot(page, 'hat-lost');
  // Again: the same level, a new path, the magpie back where it starts, and the chase going.
  await standInView(page);
  await page.locator('#chase-again').click();
  await waitForScreen(page, 'playing');
  const again = await state(page);
  expect([again.level, again.current, again.state, again.hero.x, again.stats.steps, again.stats.stars, again.hat]).toEqual([2, 2, 'play', 0, 0, 0, null]);
  expect(again.lead).toBeGreaterThanOrEqual(8);
  expect(again.lead).toBeLessThan(10);
  await expect(page.locator('#magpie-words')).toHaveText('Close');
  await expect(coachText(page)).toHaveText('March on the spot to walk!');
  await expectSoon(async () => (await state(page)).place).toBe(0.24);
  await listen(page);
  await marchToNext(page);
  await getPast(page);
  expect((await state(page)).stats.cleared).toBe(1);
});

test('the gentle magpie waits a little way ahead for as long as it takes: the chip says so with no bar, and nothing is lost', async ({ page }) => {
  test.setTimeout(120_000);
  await reachPlay(page, atLevel(10, GENTLE));
  await expect(page.locator('#magpie-words')).toHaveText('Waiting for you');
  await expect(page.locator('#magpie-meter')).toBeHidden();
  for (let n = 0; n < 15; n += 1) {
    await page.waitForTimeout(1000);
    const now = await state(page);
    expect([now.state, now.screen, now.danger]).toEqual(['play', 'playing', 0]);
    expect(now.lead).toBeLessThanOrEqual(12 + 1e-6);
  }
  expect((await state(page)).lead).toBeCloseTo(12, 6);
  // And on the screen, waiting where it can be seen.
  const { magpieAt, metre } = await state(page);
  expect(magpieAt.seen).toBe(true);
  const magpie = await drawnBox(page, 'drawMagpie');
  expect(Math.abs(middle(magpie).x - magpieAt.x)).toBeLessThan(metre * 0.6);
  await expect(page.locator('#magpie-words')).toHaveText('Waiting for you');
});

/* ---------- winning ---------- */

test('marching the whole path, over every stream, catches the magpie up at its tree: the hat comes down, the card says what was done, and the level moves on', async ({ page }) => {
  test.setTimeout(240_000);
  await reachPlay(page, { chaseLength: 8 });
  await listen(page);
  // Brisk marching, a jump at each stream as soon as the character stops at it.
  await page.evaluate(async () => {
    const { chase } = window.__game;
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let side = 'left';
    while (chase.state === 'play') {
      if (chase.station && !chase.busy) chase.jump(1.2);
      else if (!chase.station && chase.step(side)) side = side === 'left' ? 'right' : 'left';
      await wait(chase.station ? 100 : 430);
    }
  });
  const end = await state(page);
  expect(end.state).toBe('won');
  expect(end.screen).toBe('finishing');
  expect([end.stats.cleared, end.stats.tumbles, end.stats.helped]).toEqual([8, 0, 0]);
  expect(end.hero.x).toBeCloseTo(end.end, 6);
  // The hat comes down onto the character's head, and the magpie is home, on its nest. The path along the top is
  // all walked.
  expect(end.hat).not.toBe(null);
  expect(await page.locator('#path-fill').evaluate((fill) => fill.style.width)).toBe('100%');
  expect(await page.evaluate(() => window.__camera.activeTracks)).toBe(0);
  await expectSoon(async () => (await state(page)).hat?.age ?? 0, { timeout: 5000 }).toBeGreaterThan(1.2);
  await shot(page, 'hat-won-hat');
  await waitForScreen(page, 'finish');
  const stars = end.stats.stars;
  // Every star on the path walked past, and one for each stream.
  expect(stars).toBe(end.stars.filter(({ taken }) => taken).length + 8);
  await expect(page.locator('#finish-title')).toHaveText('You got the hat back!');
  await expect(page.locator('#finish-stars')).toHaveText(String(stars));
  await expect(page.locator('#finish-line')).toHaveText(`Giraffe took ${end.stats.steps} steps, ${end.stats.left} with the left leg and ${end.stats.right} with the right, and got past all 8 things in the way.`);
  expect(end.stats.left + end.stats.right).toBe(end.stats.steps);
  expect(Math.abs(end.stats.left - end.stats.right)).toBeLessThanOrEqual(1);
  await expect(page.locator('#finish-tally [data-exercise="steps"] strong')).toHaveText(String(end.stats.steps));
  await expect(page.locator('#finish-tally [data-exercise="jumps"] strong')).toHaveText('8');
  await expect(page.locator('#level-done-text')).toHaveText('Level 1 done! Next: level 2');
  await expect(page.locator('#level-next-new')).toContainText('Low branches: bend your knees to duck under');
  await expect(page.locator('#chase-again')).toHaveText('Next level');
  expect(await page.evaluate(() => [window.__game.game.levels.current, window.__game.game.confetti.running])).toEqual([2, true]);
  expect(await page.evaluate(() => window.__game.sound.finished)).toEqual({ line: 'You got the hat back!', lost: false });
  // The character cheers beside the card, with the hat on, and isn't behind the card.
  await expectSoon(async () => (await state(page)).place).toBe(0.12);
  const card = await page.locator('#screen-finish .finish-card').boundingBox();
  const hero = await drawnBox(page, 'drawHero');
  expect((await state(page)).frame).toBe('cheer');
  expect(overlap(hero, { left: card.x, right: card.x + card.width, top: card.y, bottom: card.y + card.height }), `the character ${JSON.stringify(hero)} is behind the card ${JSON.stringify(card)}`).toBe(false);
  await shot(page, 'hat-won');
  // On to the next level, from the card.
  await standInView(page);
  await page.locator('#chase-again').click();
  await waitForScreen(page, 'playing');
  const next = await state(page);
  expect([next.level, next.hero.x, next.stats.steps, next.hat]).toEqual([2, 0, 0, null]);
  expect(next.course.map(({ kind }) => kind)).toContain('branch');
});

test('choosing another walker from the finish card goes back to the chooser, and the next chase is that walker’s', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, { ...GENTLE, chaseLength: 8 });
  await page.evaluate(() => {
    const { chase } = window.__game;
    for (const thing of chase.course) thing.state = 'cleared';
    chase.hero.x = chase.end - 0.5;
    chase.hero.walkTo = chase.hero.x;
    chase.step('left');
  });
  await waitForScreen(page, 'finish');
  await page.locator('#other-walker').click();
  await waitForScreen(page, 'choose');
  await page.locator('.fighter-card').nth(2).click();
  const name = await page.locator('#chosen-name').textContent();
  expect(name).not.toBe('Giraffe');
  await expectSoon(() => page.evaluate(() => window.__game.view.place)).toBe(0.5);
  expect(await drawnBox(page, 'drawHero')).not.toBe(null);
  await standInView(page);
  await page.locator('#chase-start').click();
  await waitForScreen(page, 'playing');
  expect((await state(page)).level).toBe(2);
  expect(await page.evaluate(() => window.__game.game.chosen.name)).toBe(name);
});

/* ---------- words ---------- */

test('in Georgian, what the child is asked, the words for each move seen, and what the level brings are in Georgian letters', async ({ page }) => {
  await openChase(page, atLevel(2, { language: 'ka', ...GENTLE }));
  await standInView(page);
  await page.locator('#start').click();
  await waitForScreen(page, 'choose');
  await page.locator('#chase-start').click();
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-new-now')).toContainText('ახალი:');
  await expect(page.locator('#level-new-now')).toContainText('დაბალი ტოტები: მუხლები მოხარე და ქვეშ გაძვერი');
  await expect(page.locator('#level-now')).toHaveText('დონე 2');
  await waitForScreen(page, 'playing');
  await expect(promptText(page)).toHaveText('ადგილზე იარე, მუხლები მაღლა!');
  await expect(coachText(page)).toHaveText('ადგილზე იარე, მუხლები მაღლა!');
  // A path with a stream first: the second thing is a low branch, as level 2 brings.
  await pathWith(page, "(chase) => chase.course[0].kind === 'stream'");
  const texts = [await promptText(page).textContent()];
  await noteCallouts(page);
  const words = { stream: ['ახტი!', '✓ გადახტი!'], branch: ['მუხლები მოხარე!', '✓ გაძვერი!'] };
  const seen = [];
  for (const index of [0, 1]) {
    expect(await marchToNext(page)).toBe(index);
    const { kind } = (await state(page)).station;
    if (index === 1) expect(kind).toBe('branch');
    await expect(promptText(page)).toHaveText(words[kind][0]);
    await expect(coachText(page)).toHaveText(words[kind][0]);
    texts.push(await promptText(page).textContent());
    seen.push(words[kind][1]);
    await getPast(page);
  }
  expect(await calloutsSeen(page)).toEqual(seen);
  for (const text of [...texts, ...(await calloutsSeen(page))]) {
    expect(text).toMatch(/[ა-ჿ]/);
    expect(text).not.toMatch(/[A-Za-z]/);
  }
  // Asked back, in Georgian too.
  await nobody(page);
  await expect(promptText(page)).toHaveText('დაბრუნდი, რომ დაგინახო', { timeout: 15_000 });
});

/* ---------- the grown-ups' panel ---------- */

test('how high a knee has to come, changed in the middle of a game, goes on at once: a foot 13% of leg length up is a step at Medium, and not at High', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, GENTLE);
  await feetAt(page, { left: 0.02, right: 0.02 });
  await page.locator('#open-panel').click();
  await expect(page.locator('label', { hasText: 'Medium: 11%' })).toBeVisible();
  await expect(page.locator('label', { hasText: 'Low: 8%' })).toBeVisible();
  await expect(page.locator('label', { hasText: 'High: 16%' })).toBeVisible();
  await expect(page.locator('#live-reading')).toContainText('A step is a foot 11% up on the left and 11% on the right');
  await page.locator('#close-panel').click();
  await liftFoot(page, 'left', { height: 0.13 });
  await expectSoon(async () => (await state(page)).stats.steps).toBe(1);
  const time = (await state(page)).time;
  await page.locator('#open-panel').click();
  await page.locator('input[name="chaseLift"][value="high"]').check();
  await expect(page.locator('#live-reading')).toContainText('A step is a foot 16% up on the left and 16% on the right');
  await page.locator('#close-panel').click();
  await expect(page.locator('#panel')).toBeHidden();
  // Not started again: no countdown, and the step is still there.
  for (let n = 0; n < 10; n += 1) {
    expect((await state(page)).screen).toBe('playing');
    await page.waitForTimeout(100);
  }
  await liftFoot(page, 'right', { height: 0.13 });
  await liftFoot(page, 'left', { height: 0.13 });
  let now = await state(page);
  expect([now.stats.steps, now.line.left, now.line.right]).toEqual([1, 0.16, 0.16]);
  expect(now.time).toBeGreaterThan(time);
  await liftFoot(page, 'right', { height: 0.18 });
  await expectSoon(async () => (await state(page)).stats.steps).toBe(2);
  // Low: a foot 9% up is a step.
  await page.locator('#open-panel').click();
  await page.locator('input[name="chaseLift"][value="low"]').check();
  await page.locator('#close-panel').click();
  await liftFoot(page, 'left', { height: 0.09 });
  await expectSoon(async () => (await state(page)).stats.steps).toBe(3);
  now = await state(page);
  expect([now.screen, now.line.left]).toEqual(['playing', 0.08]);
});

test('the legs taking turns, changed in the middle of a game, goes on at once: the same leg twice is no step, and the character asks for the other leg', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, GENTLE);
  await feetAt(page, { left: 0.02, right: 0.02 });
  await liftFoot(page, 'left');
  await liftFoot(page, 'left');
  await expectSoon(async () => (await state(page)).stats.steps).toBe(2);
  await page.locator('#open-panel').click();
  await expect(page.locator('label', { hasText: 'The legs take turns' })).toBeVisible();
  await page.locator('input[name="chaseLegs"][value="turns"]').check();
  await page.locator('#close-panel').click();
  await expect(page.locator('#panel')).toBeHidden();
  await page.waitForTimeout(600);
  expect((await state(page)).screen).toBe('playing');
  expect((await state(page)).turns).toBe(true);
  await liftFoot(page, 'right');
  await expectSoon(async () => (await state(page)).stats.steps).toBe(3);
  // The same leg again, straight after: no step, and the other one is asked for.
  await liftFoot(page, 'right');
  await page.waitForTimeout(400);
  let now = await state(page);
  expect([now.stats.steps, now.stats.left, now.stats.right]).toEqual([3, 2, 1]);
  await expect(coachText(page)).toHaveText('Now the other leg!');
  expect((await state(page)).film).toBe('highKnees');
  await expect(promptText(page)).toHaveText('Now the other leg!');
  await liftFoot(page, 'left');
  await expectSoon(async () => (await state(page)).stats.steps).toBe(4);
  await expect(coachText(page)).not.toHaveText('Now the other leg!');
  // Either again: the same leg twice is two steps.
  await page.locator('#open-panel').click();
  await page.locator('input[name="chaseLegs"][value="either"]').check();
  await page.locator('#close-panel').click();
  await liftFoot(page, 'right');
  await liftFoot(page, 'right');
  await expectSoon(async () => (await state(page)).stats.steps, { timeout: 5000 }).toBe(6);
  now = await state(page);
  expect([now.screen, now.turns]).toEqual(['playing', false]);
});

test('the magpie, how the child jumps and the length of the path, each changed in the middle of a game, start it again when the panel closes, with what was chosen', async ({ page }) => {
  test.setTimeout(240_000);
  await reachPlay(page);
  await marchToNext(page);
  const startAgain = async (name, value) => {
    await page.locator('#open-panel').click();
    await page.locator(`input[name="${name}"][value="${value}"]`).check();
    // Nothing starts again until the panel is closed.
    expect((await state(page)).screen).toBe('playing');
    await page.locator('#close-panel').click();
    await waitForScreen(page, 'countdown');
    await waitForScreen(page, 'playing');
    const now = await state(page);
    expect([now.hero.x, now.stats.steps]).toEqual([0, 0]);
    return now;
  };
  let now = await startAgain('chaseMagpie', 'waits');
  expect(now.rules.gentle).toBe(true);
  await expect(page.locator('#magpie-words')).toHaveText('Waiting for you');
  await expect(page.locator('#magpie-meter')).toBeHidden();
  now = await startAgain('chaseJump', 'arms');
  await marchToNext(page);
  await expect(coachText(page)).toHaveText('Arms up high to jump!');
  expect((await state(page)).film).toBe('skyReach');
  now = await startAgain('chaseLength', '8');
  expect(now.course).toHaveLength(8);
  now = await startAgain('chaseLength', '18');
  expect(now.course).toHaveLength(18);
  // And the level.
  await page.locator('#open-panel').click();
  await page.locator('#level-choice input[value="5"]').check();
  await page.locator('#close-panel').click();
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-now')).toHaveText('Level 5');
  await waitForScreen(page, 'playing');
  now = await state(page);
  expect([now.level, now.course.length, now.rules.gentle]).toEqual([5, 18, true]);
});
