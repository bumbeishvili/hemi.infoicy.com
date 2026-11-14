// Frost Arena played through the real page, with real photos of two hands going through the real tracker.
import { expect, openGame, shot, test } from '../helpers.js';
import { FIST, GAME, PER_PALM, REACH, THUMB, biggestStep, brightnessThrough, controlsAre, degrees, hands, inTheOpen, matchIs, someoneInFront, soon, startMatch, waitForScreen } from './helpers.js';

const OPEN = { photo: 'open' };

test('the title card says how it\'s played, and the match starts after the hand check with the controls drawn as on a phone', async ({ page }) => {
  await openGame(page, {}, GAME);
  await expect(page.locator('h1')).toHaveText('Frost Arena');
  await expect(page.locator('#tagline')).toHaveText('A team match, played like a shooter on a phone. Open your right hand and drag it to look round, thumb up to fire. Your other hand walks.');
  await expect(page.locator('#start')).toHaveText('Join the team');
  await shot(page, 'arena-title');
  await hands(page);
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
  const match = await matchIs(page);
  // Out of the box: the Kalashnikov, ten tags, and a match that can be lost.
  expect([match.state, match.score, match.goal, match.rounds, match.rifle, match.canLose, match.assist]).toEqual(['playing', [0, 0], 10, 30, 'ak', true, true]);
  // Giraffe is on the player's team, against two.
  expect(match.sides).toEqual([2, 2]);
  await expect(page.locator('#chip-blue')).toHaveText('0');
  await expect(page.locator('#chip-goal')).toHaveText('of 10');
  await expect(page.locator('#chip-red')).toHaveText('0');
  await expect(page.locator('#ammo-rounds')).toHaveText('30');
  await expect(page.locator('#ammo-name')).toHaveText('Kalashnikov');
  await expect(page.locator('#health-number')).toHaveText('100');
  await expect(page.locator('#chip-stars-box')).toBeHidden();
  await expect(page.locator('#story-line')).toHaveText('Tag the red team! I’m right beside you!');
  // The sights are in the middle of the screen.
  const sight = await page.locator('.sight-dot').boundingBox();
  const { width, height } = page.viewportSize();
  expect(Math.abs(sight.x + sight.width / 2 - width / 2)).toBeLessThan(2);
  expect(Math.abs(sight.y + sight.height / 2 - height / 2)).toBeLessThan(2);
  // Each hand is open, and so down: a pad for walking on the left with its knob, and one for looking round on the
  // right, each with its buttons, at the bottom of the screen where they'd be on a phone.
  await soon(async () => [(await controlsAre(page)).stick.on, (await controlsAre(page)).pad.on]).toEqual([true, true]);
  for (const id of ['stick', 'stick-knob', 'pad', 'pad-knob', 'button-fire', 'button-reload', 'button-sprint']) await expect(page.locator(`#${id}`)).toBeVisible();
  const [stick, pad, fire] = await Promise.all(['#stick', '#pad', '#button-fire'].map((each) => page.locator(each).boundingBox()));
  expect(stick.x).toBeLessThan(width * 0.2);
  expect(pad.x + pad.width).toBeGreaterThan(width * 0.8);
  expect(fire.x).toBeGreaterThan(width * 0.6);
  expect(stick.y + stick.height).toBeGreaterThan(height * 0.85);
  await expect(page.locator('#stick')).toHaveAttribute('data-state', 'on');
  await expect(page.locator('#pad')).toHaveAttribute('data-state', 'on');
  // The meters for how open the hands are, which the other games have, aren't in the way here.
  await expect(page.locator('.hands-bar')).toBeHidden();
  // And a card says what each hand does, until it's all been done.
  expect(match.how).toBe('on');
  await expect(page.locator('.how-side.is-move')).toContainText('open it, and drag: walk that way');
  await expect(page.locator('.how-side.is-move')).toContainText('close it: stop');
  await expect(page.locator('.how-side.is-move')).toContainText('right out forwards: sprint');
  await expect(page.locator('.how-side.is-move')).toContainText('thumb up: reload');
  await expect(page.locator('.how-side.is-aim')).toContainText('open it, and drag: look round');
  await expect(page.locator('.how-side.is-aim')).toContainText('close it: let go, to drag again');
  await expect(page.locator('.how-side.is-aim')).toContainText('thumb up: fire');
  expect(await page.evaluate(() => [getComputedStyle(document.querySelector('.how-side.is-move .how-hand'), '::after').content, getComputedStyle(document.querySelector('.how-side.is-aim .how-hand'), '::after').content])).toEqual(['"Left hand"', '"Right hand"']);
  await shot(page, 'arena-start');
});

test('an open hand dragged walks: up is forwards, to one side is a sidestep, right out is a sprint, and closing it stops', async ({ page }) => {
  await startMatch(page, { arenaHard: 'gentle' });
  await inTheOpen(page);
  const from = (await matchIs(page)).at;
  // Up: forwards, which is up the yard. Not the whole way out, so it's a walk.
  await hands(page, { move: { y: -REACH * 0.75 } });
  await soon(async () => (await matchIs(page)).at.z).toBeLessThan(from.z - 2);
  let controls = await controlsAre(page);
  expect(controls.moveY).toBeGreaterThan(0.5);
  expect(Math.abs(controls.moveX)).toBeLessThan(0.2);
  expect(controls.sprint).toBe(false);
  expect((await matchIs(page)).speed).toBeLessThan(4.6);
  // The knob on the screen is up from the middle of its pad.
  const [ring, knob] = await Promise.all(['#stick', '#stick-knob'].map((each) => page.locator(each).boundingBox()));
  expect(knob.y + knob.height / 2).toBeLessThan(ring.y + ring.height / 2 - 10);
  await expect(page.locator('#button-sprint')).toHaveAttribute('data-on', 'false');
  // Right out: a sprint, and its button lights.
  await hands(page, { move: { y: -REACH * 1.15 } });
  await soon(async () => (await matchIs(page)).sprinting).toBe(true);
  await soon(async () => (await matchIs(page)).speed).toBeGreaterThan(6);
  await expect(page.locator('#button-sprint')).toHaveAttribute('data-on', 'true');
  // Closed where it is: a stop, at once, with the pad let go of. Brought back closed, nothing happens.
  await hands(page, { move: { ...FIST, y: -REACH * 1.15 } });
  await soon(async () => (await matchIs(page)).speed).toBe(0);
  await expect(page.locator('#stick')).toHaveAttribute('data-state', 'seen');
  await expect(page.locator('#stick-knob')).toBeHidden();
  await hands(page, { move: FIST });
  await page.waitForTimeout(500);
  expect((await matchIs(page)).speed).toBe(0);
  // Opened there, it's down again where it is, and still.
  await hands(page);
  await expect(page.locator('#stick')).toHaveAttribute('data-state', 'on');
  await page.waitForTimeout(400);
  expect((await matchIs(page)).speed).toBe(0);
  const stopped = (await matchIs(page)).at;
  await page.waitForTimeout(700);
  expect((await matchIs(page)).at).toEqual(stopped);
  // To the right: a sidestep to the right, facing the same way.
  await hands(page, { move: { x: REACH * 0.8 } });
  await soon(async () => (await matchIs(page)).at.x).toBeGreaterThan(stopped.x + 1.5);
  const side = await matchIs(page);
  expect(Math.abs(side.at.z - stopped.z)).toBeLessThan(0.6);
  expect(Math.abs(degrees(side.heading))).toBeLessThan(2);
  // Down: backwards.
  await hands(page, { move: { y: REACH * 0.8 } });
  await soon(async () => (await matchIs(page)).at.z).toBeGreaterThan(side.at.z + 1);
  // The hand out of the picture: it's let go, and it stops.
  await hands(page, { move: null });
  await soon(async () => (await matchIs(page)).speed).toBe(0);
  await expect(page.locator('#stick')).toHaveAttribute('data-state', 'off');
  expect((await matchIs(page)).stats.walked).toBeGreaterThan(5);
});

test('the other hand, open and dragged, looks round: the view turns as far as it goes, and closing it lets go to drag again', async ({ page }) => {
  await startMatch(page, { arenaHard: 'gentle', arenaAssist: 'off' });
  await inTheOpen(page);
  const knobAcross = async () => {
    const [ring, knob] = await Promise.all(['#pad', '#pad-knob'].map((each) => page.locator(each).boundingBox()));
    return knob.x + knob.width / 2 - (ring.x + ring.width / 2);
  };
  const heading = async () => degrees((await matchIs(page)).heading);
  // Dragged a third of a palm length to the right: the view turns to the right, that far and no further, with
  // the knob to the right of the middle of its pad.
  await hands(page, { aim: { x: 0.3 } });
  await soon(heading).toBeGreaterThan(15);
  await soon(knobAcross).toBeGreaterThan(8);
  await page.waitForTimeout(500);
  const there = await heading();
  expect(Math.abs(there - 0.3 * PER_PALM)).toBeLessThan(3);
  // Held there, the view stays just where it is.
  await page.waitForTimeout(800);
  expect(Math.abs((await heading()) - there)).toBeLessThan(0.4);
  // Closed where it is, the view stays as it is, and the pad is let go of.
  await hands(page, { aim: { ...FIST, x: 0.3 } });
  await expect(page.locator('#pad')).toHaveAttribute('data-state', 'seen');
  await page.waitForTimeout(400);
  expect(Math.abs((await heading()) - there)).toBeLessThan(0.8);
  // Brought back closed, and opened where it began: still nothing has turned.
  await hands(page, { aim: FIST });
  await page.waitForTimeout(500);
  await hands(page);
  await expect(page.locator('#pad')).toHaveAttribute('data-state', 'on');
  await page.waitForTimeout(500);
  expect(Math.abs((await heading()) - there)).toBeLessThan(0.8);
  expect(Math.abs(await knobAcross())).toBeLessThan(3);
  // Dragged again from there, it turns on from where it was: twice as far round in two drags.
  await hands(page, { aim: { x: 0.3 } });
  await soon(heading).toBeGreaterThan(there + 15);
  await page.waitForTimeout(500);
  expect(Math.abs((await heading()) - 2 * 0.3 * PER_PALM)).toBeLessThan(5);
  // And back the other way with it open, the view comes back with it.
  await hands(page, { aim: { x: -0.2 } });
  await soon(heading).toBeLessThan(there - 10);
  await page.waitForTimeout(500);
  const left = await heading();
  expect(Math.abs(left - (0.6 - 0.5) * PER_PALM)).toBeLessThan(5);
  // Raised well above where it went down, nothing happens: only across counts, and the view stays level.
  await hands(page, { aim: { x: -0.2, y: -0.6 } });
  await page.waitForTimeout(700);
  expect(Math.abs((await heading()) - left)).toBeLessThan(1.5);
  expect(await page.evaluate(() => window.__game.yard.camera.rotation.x)).toBe(0);
  // A hand that isn't open doesn't drag, though it isn't closed either: pointing, its pad is let go of, and
  // the view stays where it was wherever the hand goes.
  await hands(page, { aim: { photo: 'pointing', x: -0.2, y: -0.6 } });
  await expect(page.locator('#pad')).toHaveAttribute('data-state', 'seen');
  await hands(page, { aim: { photo: 'pointing', x: 0.3, y: -0.6 } });
  await page.waitForTimeout(700);
  expect(Math.abs((await heading()) - left)).toBeLessThan(1.5);
  // A relaxed hand, its fingers a little curled, is open: it goes down where it is, and drags from there.
  await hands(page, { aim: { photo: 'relaxed', x: 0.3, y: -0.6 } });
  await expect(page.locator('#pad')).toHaveAttribute('data-state', 'on');
  await page.waitForTimeout(500);
  const relaxed = await heading();
  expect(Math.abs(relaxed - left)).toBeLessThan(2);
  await hands(page, { aim: { photo: 'relaxed', x: 0.5, y: -0.6 } });
  await soon(heading).toBeGreaterThan(relaxed + 9);
  // Walking had nothing to do with any of it.
  expect((await matchIs(page)).stats.walked).toBeLessThan(0.5);
});

test('a thumb up fires where the sights are, and nowhere else: on someone it hits them, and off them it doesn\'t', async ({ page }) => {
  await startMatch(page, { arenaHard: 'gentle', arenaAssist: 'off' });
  const who = await someoneInFront(page, 9, { health: 10_000 });
  // The sights are on them: they turn red, and nothing fires until the thumb goes up. A closed hand isn't it.
  await soon(async () => (await matchIs(page)).aimed).toBe(who);
  expect((await matchIs(page)).sight).toBe('on');
  await page.waitForTimeout(600);
  await hands(page, { aim: FIST });
  await page.waitForTimeout(600);
  expect((await matchIs(page)).stats.shots).toBe(0);
  await expect(page.locator('#button-fire')).toHaveAttribute('data-on', 'false');
  await expect(page.locator('#button-fire .button-mark')).toHaveText('👍');
  await hands(page, { aim: THUMB });
  await soon(async () => (await matchIs(page)).stats.hits).toBeGreaterThan(3);
  await expect(page.locator('#button-fire')).toHaveAttribute('data-on', 'true');
  const firing = await matchIs(page);
  expect(firing.firing).toBe(true);
  expect(firing.hit).toBe('on');
  expect(firing.rounds).toBeLessThan(30);
  await expect(page.locator('.sight-hit')).toHaveCSS('opacity', '1');
  // Pulling the trigger didn't pull the aim off them.
  expect(Math.abs(degrees(firing.heading))).toBeLessThan(1.5);
  await shot(page, 'arena-firing');
  // The thumb down, and the hand open again, stops it at once.
  await hands(page);
  await soon(async () => (await matchIs(page)).firing).toBe(false);
  const shots = (await matchIs(page)).stats.shots;
  await page.waitForTimeout(500);
  expect((await matchIs(page)).stats.shots).toBe(shots);
  await expect(page.locator('#button-fire')).toHaveAttribute('data-on', 'false');
  // With the sights dragged off them, the shots go by: fired, and none of them a hit.
  await hands(page, { aim: { x: 0.25 } });
  await soon(async () => (await matchIs(page)).aimed).toBe(null);
  await page.waitForTimeout(400);
  const before = await matchIs(page);
  expect(before.sight).toBe('ready');
  await hands(page, { aim: { ...THUMB, x: 0.25 } });
  await soon(async () => (await matchIs(page)).stats.shots).toBeGreaterThan(before.stats.shots + 3);
  expect((await matchIs(page)).stats.hits).toBe(before.stats.hits);
  // And the view turns while it fires: dragged back with the thumb still up, the sights come back onto them
  // and the shots land again.
  await hands(page, { aim: THUMB });
  await soon(async () => (await matchIs(page)).stats.hits).toBeGreaterThan(before.stats.hits + 2);
  expect((await matchIs(page)).firing).toBe(true);
});

test('a tag is a point, with who tagged whom said at the side, and the fifth wins the match on Easy, which can\'t be lost', async ({ page }) => {
  await startMatch(page, { arenaHard: 'gentle', arenaWin: 5 });
  const who = await someoneInFront(page, 9);
  // Four tags already, and the last one made by hand.
  await page.evaluate(() => {
    const { match } = window.__game;
    match.score[0] = 4;
    match.stats.tags = 4;
  });
  expect((await matchIs(page)).canLose).toBe(false);
  await hands(page, { aim: THUMB });
  await expect(page.locator('#feed li')).toHaveCount(1);
  await expect(page.locator('#feed li')).toContainText('You');
  await waitForScreen(page, 'finish');
  const match = await matchIs(page);
  expect([match.state, match.score, match.stats.tags, match.stats.out]).toEqual(['won', [5, 0], 5, 0]);
  expect(who).toBeTruthy();
  expect(match.stats.hits).toBeGreaterThanOrEqual(4);
  await expect(page.locator('#screen-finish h2')).toHaveText('We won the match!');
  await expect(page.locator('#finish-hero')).toHaveText('5');
  await expect(page.locator('.finish-hero')).toContainText('tags');
  await expect(page.locator('#sum-right-score')).toHaveText('5 : 0');
  await expect(page.locator('#sum-right-accuracy')).toContainText('%');
  await expect(page.locator('#sum-right-out')).toHaveText('0');
  await expect(page.locator('#sum-right-walked')).toContainText(' m');
  await expect(page.locator('#sum-right-magazines')).toHaveText('0');
  await expect(page.locator('#sum-right-prizes')).toBeHidden();
  // What the other games say about how long the hand was open isn't said here.
  await expect(page.locator('#finish-open')).toBeHidden();
  await expect(page.locator('#sum-right-openings')).toBeHidden();
  await shot(page, 'arena-finish');
  // The next level is ready, and says what it brings.
  await expect(page.locator('#screen-finish')).toContainText('Gold stars');
});

test('on Medium the other team\'s tags count too, a hit says where it came from, and their tenth is the match', async ({ page }) => {
  await startMatch(page);
  await someoneInFront(page, null);
  expect((await matchIs(page)).canLose).toBe(true);
  // One of the other team, off to the right, lands one on the player.
  await page.evaluate(() => {
    const { match } = window.__game;
    const other = match.troopers.find(({ team }) => team === 1);
    Object.assign(other, { x: -10, z: 13 });
    match.hit(match.child, 30, other);
  });
  // A mark on the right of the sights, where it came from, for a moment.
  expect(await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return [...document.querySelectorAll('#from i[data-on="true"]')].map((mark) => mark.style.transform);
  })).toEqual([expect.stringMatching(/rotate\((8\d|9\d)deg\)/)]);
  expect((await matchIs(page)).health).toBe(70);
  await expect(page.locator('#health-number')).toHaveText('70');
  // Tagged out: a point to them, and the player is back at their own end a few seconds later.
  await page.evaluate(() => {
    const { match } = window.__game;
    const other = match.troopers.find(({ team }) => team === 1);
    match.score[1] = 8;
    match.hit(match.child, 100, other);
  });
  await soon(async () => (await matchIs(page)).score).toEqual([0, 9]);
  await soon(async () => (await matchIs(page)).sight).toBe('none');
  await expect(page.locator('#chip-red')).toHaveText('9');
  await soon(async () => (await matchIs(page)).health).toBe(100);
  // And once more is the match.
  await page.evaluate(() => {
    const { match } = window.__game;
    const other = match.troopers.find(({ team }) => team === 1);
    Object.assign(match.child, { safeLeft: 0 });
    match.hit(match.child, 100, other);
  });
  await waitForScreen(page, 'finish');
  expect((await matchIs(page)).state).toBe('lost');
  await expect(page.locator('#screen-finish h2')).toHaveText('So close!');
  await expect(page.locator('#sum-right-out')).toHaveText('2');
});

test('a thumb up on the walking hand changes the magazine with the walking carrying on, and an empty rifle changes its own', async ({ page }) => {
  await startMatch(page, { arenaHard: 'gentle' });
  await someoneInFront(page, 9, { health: 10_000 });
  await page.evaluate(() => {
    window.__game.match.child.rounds = 12;
  });
  await expect(page.locator('#ammo-rounds')).toHaveText('12');
  // Walking, the thumb of that hand goes up: a new magazine goes in, and the walking carries on as it was.
  await hands(page, { move: { y: -REACH * 0.7 } });
  await soon(async () => (await matchIs(page)).speed).toBeGreaterThan(2);
  const walking = (await matchIs(page)).speed;
  await hands(page, { move: { ...THUMB, y: -REACH * 0.7 } });
  await soon(async () => (await matchIs(page)).changing).toBe(true);
  await expect(page.locator('#button-reload .button-mark')).toHaveText('👍');
  await expect(page.locator('#button-reload')).toHaveAttribute('data-on', 'true');
  await expect(page.locator('#ammo')).toHaveAttribute('data-state', 'changing');
  expect((await matchIs(page)).sight).toBe('changing');
  expect(Math.abs((await matchIs(page)).speed - walking)).toBeLessThan(0.8);
  // The ring round the button fills as it goes in.
  await soon(async () => Number(await page.evaluate(() => getComputedStyle(document.getElementById('button-reload')).getPropertyValue('--through')))).toBeGreaterThan(0.3);
  await soon(async () => (await matchIs(page)).rounds).toBe(30);
  let match = await matchIs(page);
  expect([match.stats.reloads, match.stats.byHand]).toEqual([1, 1]);
  // Held up, it isn't changed again.
  await page.evaluate(() => {
    window.__game.match.child.rounds = 20;
  });
  await page.waitForTimeout(700);
  expect((await matchIs(page)).stats.reloads).toBe(1);
  // An empty one changes itself: the last round fired, and a new magazine is on its way in.
  await hands(page);
  await someoneInFront(page, 9, { health: 10_000 });
  await page.evaluate(() => {
    window.__game.match.child.rounds = 3;
  });
  await hands(page, { aim: THUMB });
  await soon(async () => (await matchIs(page)).changing).toBe(true);
  match = await matchIs(page);
  expect([match.stats.reloads, match.stats.byHand, match.firing]).toEqual([2, 1, false]);
});

test('with neither hand in the picture it\'s paused: everyone waits, nothing happens, and a hand coming back carries it on', async ({ page }) => {
  await startMatch(page, { arenaHard: 'tough' });
  await page.waitForTimeout(1500);
  await hands(page, { aim: null, move: null });
  await soon(async () => (await matchIs(page)).resting).toBe(true);
  await expect(page.locator('.prompt')).toContainText('Paused. Show your hands to play!');
  expect((await matchIs(page)).sight).toBe('none');
  const places = () => page.evaluate(() => window.__game.match.troopers.map(({ x, z }) => [x, z]));
  // A moment for anyone who was walking to come to a stop.
  await page.waitForTimeout(900);
  const [at, before] = [await places(), await matchIs(page)];
  await page.waitForTimeout(3000);
  expect(await places()).toEqual(at);
  const after = await matchIs(page);
  expect([after.health, after.score, after.state]).toEqual([before.health, before.score, 'playing']);
  await shot(page, 'arena-paused');
  // One hand back is enough.
  await hands(page, { move: null });
  await soon(async () => (await matchIs(page)).resting).toBe(false);
  await soon(async () => JSON.stringify(await places()) !== JSON.stringify(at)).toBe(true);
  // With only the hand that looks round, the other is asked for.
  await expect(page.locator('.prompt')).toContainText('Show your other hand to walk!', { timeout: 15_000 });
});

test('both hands are drawn on the camera\'s picture as the tracker sees them, whichever is doing what', async ({ page }) => {
  await startMatch(page, { arenaHard: 'gentle' });
  await inTheOpen(page);
  // How much is drawn over each half of the mirror: the left hand is on the left of it, and the right on the right.
  const drawn = () => page.evaluate(() => {
    const canvas = document.getElementById('skeleton');
    const { data, width } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const halves = [0, 0];
    for (let index = 3; index < data.length; index += 4) if (data[index] > 0) halves[((index >> 2) % width) < width / 2 ? 0 : 1] += 1;
    return halves;
  });
  await soon(async () => (await drawn()).every((pixels) => pixels > 150)).toBe(true);
  expect(await page.evaluate(() => document.body.dataset.seen)).toBe('2');
  await expect(page.locator('#camera-frame')).toHaveCSS('border-top-color', 'rgb(12, 163, 12)');
  await shot(page, 'arena-both-hands');
  // The hand on the stick taken away: only the other is drawn, and the frame says one is missing.
  await hands(page, { move: null });
  await soon(async () => (await drawn())[0]).toBe(0);
  expect((await drawn())[1]).toBeGreaterThan(150);
  await soon(() => page.evaluate(() => document.body.dataset.seen)).toBe('1');
  await expect(page.locator('#camera-frame')).toHaveCSS('border-top-color', 'rgb(255, 183, 3)');
  // And the other way round.
  await hands(page, { aim: null });
  await soon(async () => (await drawn())[1]).toBe(0);
  expect((await drawn())[0]).toBeGreaterThan(150);
  // Both again, closed: still both drawn.
  await hands(page, { aim: FIST, move: FIST });
  await soon(async () => (await drawn()).every((pixels) => pixels > 100)).toBe(true);
  // A pinch that has been given something to do is joined with a bright line while it's made: here, the thumb
  // and first finger of the hand that looks round, as the game would say for one.
  const joined = () => page.evaluate(() => {
    const canvas = document.getElementById('skeleton');
    const { data, width } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const halves = [0, 0];
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] > 250 && Math.abs(data[index + 1] - 210) < 6 && Math.abs(data[index + 2] - 63) < 10 && data[index + 3] > 240) halves[((index >> 2) % width) < width / 2 ? 0 : 1] += 1;
    }
    return halves;
  });
  await hands(page);
  await soon(async () => (await drawn()).every((pixels) => pixels > 150)).toBe(true);
  // Next to none of that colour to begin with: only where the edges of two other lines happen to blend to it.
  const before = await joined();
  expect(Math.max(...before)).toBeLessThan(12);
  await page.evaluate(() => {
    window.__game.game.handLinks = () => ({ play: [[4, 8]], other: [] });
  });
  await soon(async () => (await joined())[1]).toBeGreaterThan(before[1] + 40);
  expect((await joined())[0]).toBeLessThan(12);
});

test('what each hand does is chosen with the same picture chips as every game\'s hand shapes: what fires, reloads and sprints, on either hand, and what each hand drags with', async ({ page }) => {
  // Kept from before: two fingers on the walking hand changes the magazine, and there's no sprinting.
  await startMatch(page, { arenaHard: 'gentle', arenaAssist: 'off', shapes: { 'frost-arena': { reload: { hand: 'move', is: 'two' }, sprint: 'off' } } });
  await someoneInFront(page, 9, { health: 10_000 });
  const chip = (row, value) => page.locator(`input[name="shape-${row}"][value="${value}"]`);
  const handOf = (row, hand) => page.locator(`input[name="shape-${row}-hand"][value="${hand}"]`);
  await expect(chip('reload', 'two')).toBeChecked();
  await expect(handOf('reload', 'move')).toBeChecked();
  await expect(chip('sprint', 'off')).toBeChecked();
  await expect(page.locator('.how-side.is-move')).toContainText('show two fingers: reload');
  await expect(page.locator('.how-side.is-move')).not.toContainText('sprint');
  await expect(page.locator('#button-sprint')).toBeHidden();
  await expect(page.locator('#button-reload .button-mark')).toHaveText('✌️');
  // One picker for all of it, in the panel's place for hand shapes: a row each, with a picture on every chip, and
  // no drop-downs. A closed hand isn't something anything can be given to: it's a hand lifted.
  await expect(page.locator('#panel-shapes .shape-move')).toHaveCount(5);
  expect(await page.locator('#panel-shapes .shape-move-name').allTextContents()).toEqual(['Look round', 'Walk', 'Fire', 'Reload', 'Sprint']);
  expect(await page.locator('#panel-shapes .shape-option').count()).toBe(await page.locator('#panel-shapes .shape-option svg.shape-icon').count());
  await expect(page.locator('#panel select')).toHaveCount(0);
  await expect(page.locator('input[name="shape-fire"][value="fist"], input[name="shape-fire"][value="closed"], input[name="shape-fire"][value="off"]')).toHaveCount(0);
  await page.evaluate(() => {
    window.__game.match.child.rounds = 12;
  });
  // A thumb up there does nothing now.
  await hands(page, { move: THUMB });
  await page.waitForTimeout(800);
  expect((await matchIs(page)).changing).toBe(false);
  // Two fingers does it, and that hand is still down while it's making them.
  await hands(page, { move: { photo: 'victory' } });
  await soon(async () => (await matchIs(page)).changing).toBe(true);
  await expect(page.locator('#button-reload')).toHaveAttribute('data-on', 'true');
  await expect(page.locator('#stick')).toHaveAttribute('data-state', 'on');
  expect((await matchIs(page)).stats.byHand).toBe(1);
  // And dragged right out is a walk, not a sprint.
  await hands(page);
  await page.waitForTimeout(500);
  await hands(page, { move: { y: -REACH * 1.15 } });
  await soon(async () => (await matchIs(page)).speed).toBeGreaterThan(3.5);
  expect((await matchIs(page)).sprinting).toBe(false);
  await hands(page);

  // Changed in the middle of a match. The magazine goes to the walking hand's thumb. Then firing goes over to
  // that hand: its thumb is taken there now, so it's given the first thing that's free, pointing, and from there
  // to two fingers. The fire button goes over to that side, the card says so, and it's that hand that fires.
  await page.locator('#open-panel').click();
  // The panel says how the game is running on this computer, so a grown-up can tell a slow game from a slow computer.
  await expect(page.locator('#panel-pace')).toHaveText(/^This computer is drawing \d+ pictures a second and reading the hands \d+ times a second\./, { timeout: 5000 });
  const pace = await page.evaluate(() => ({ ...window.__game.session.pace }));
  expect(pace.frames).toBeGreaterThan(20);
  expect(pace.frames).toBeLessThan(70);
  expect(pace.looks).toBeGreaterThan(8);
  expect(pace.looks).toBeLessThan(35);
  // Under about 45 pictures a second it says so, and what can help. With the camera off there are no hands to read.
  await page.evaluate(() => window.__game.hud.showPace({ frames: 31, looks: 12 }, true));
  await expect(page.locator('#panel-pace')).toHaveText('This computer is drawing 31 pictures a second and reading the hands 12 times a second. That’s slow for these games: closing other tabs and programs, and plugging the computer in, can help.');
  await page.evaluate(() => window.__game.hud.showPace({ frames: 60, looks: 0 }, false));
  await expect(page.locator('#panel-pace')).toHaveText('This computer is drawing 60 pictures a second.');
  await chip('reload', 'thumb').check({ force: true });
  await handOf('fire', 'move').check({ force: true });
  await expect(chip('fire', 'point')).toBeChecked();
  await expect(chip('fire', 'thumb')).toBeDisabled();
  await chip('fire', 'two').check({ force: true });
  await chip('sprint', 'stick').check({ force: true });
  // What one thing has on a hand, nothing else on that hand can be given: the chip is there, and can't be chosen.
  await expect(chip('reload', 'two')).toBeDisabled();
  await expect(page.locator('label.shape-option:has(input[name="shape-reload"][value="two"])')).toHaveAttribute('title', 'Already given to Fire on this hand');
  await expect(chip('walk', 'two')).toBeDisabled();
  await expect(chip('open', 'two')).toBeEnabled();
  await page.locator('#close-panel').click();
  await expect(page.locator('#side-move #button-fire')).toBeVisible();
  await expect(page.locator('#side-aim #button-fire')).toHaveCount(0);
  await expect(page.locator('#button-sprint')).toBeVisible();
  await expect(page.locator('.how-side.is-move')).toContainText('show two fingers: fire');
  await expect(page.locator('.how-side.is-move')).toContainText('right out forwards: sprint');
  await expect(page.locator('.how-side.is-aim')).not.toContainText('fire');
  await someoneInFront(page, 9, { health: 10_000 });
  const before = (await matchIs(page)).stats.shots;
  await hands(page, { aim: THUMB });
  await page.waitForTimeout(800);
  expect((await matchIs(page)).stats.shots).toBe(before);
  await hands(page, { move: { photo: 'victory' } });
  await soon(async () => (await matchIs(page)).stats.hits).toBeGreaterThan(2);
  await expect(page.locator('#button-fire')).toHaveAttribute('data-on', 'true');
  await hands(page);
  // It's kept for next time, with the game's hand shapes.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('camera-games-settings')).shapes['frost-arena'])).toEqual({ reload: { hand: 'move', is: 'thumb' }, sprint: 'stick', fire: { hand: 'move', is: 'two' } });

  // What a hand drags with is a row like any other. Looking round by pointing: an open hand is let go of, and
  // a pointing one is down, and drags the view. Nothing else on that hand can be given to pointing then.
  await page.locator('#open-panel').click();
  await chip('open', 'point').check({ force: true });
  await page.locator('#close-panel').click();
  // It's so at once, with nothing else changed: the card says pointing, and the open hand that was down is let go of.
  await expect(page.locator('.how-side.is-aim')).toContainText('point, and drag: look round');
  await expect(page.locator('.how-side.is-aim')).toContainText('any other hand: let go, to drag again');
  expect(await page.evaluate(() => window.__game.controls.aim.drag)).toBe('point');
  await page.locator('#open-panel').click();
  await handOf('reload', 'aim').check({ force: true });
  await expect(chip('reload', 'point')).toBeDisabled();
  await handOf('reload', 'move').check({ force: true });
  await page.locator('#close-panel').click();
  await expect(page.locator('#pad')).toHaveAttribute('data-state', 'seen');
  const from = degrees((await matchIs(page)).heading);
  await hands(page, { aim: { x: 0.3 } });
  await page.waitForTimeout(600);
  expect(Math.abs(degrees((await matchIs(page)).heading) - from)).toBeLessThan(0.8);
  // Brought back open, and then pointing where it is: it goes down there, and nothing has turned.
  await hands(page);
  await page.waitForTimeout(400);
  await hands(page, { aim: { photo: 'pointing' } });
  await expect(page.locator('#pad')).toHaveAttribute('data-state', 'on');
  await page.waitForTimeout(500);
  const down = degrees((await matchIs(page)).heading);
  expect(Math.abs(down - from)).toBeLessThan(1.5);
  await hands(page, { aim: { photo: 'pointing', x: 0.25 } });
  await soon(async () => degrees((await matchIs(page)).heading)).toBeGreaterThan(down + 12);

  // And something kept from when these were drop-downs, or from when a closed hand fired, isn't taken for a
  // choice made now.
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('camera-games-settings'));
    localStorage.setItem('camera-games-settings', JSON.stringify({ arenaHard: 'gentle', voice: false, sound: false, arenaFire: 'aim:close', arenaTrigger: 'move:two', arenaMagazine: 'move:fist', arenaRun: 'off', shapes: { 'frost-arena': { fire: 'aim:two', reload: { hand: 'move', is: 'fist' } } }, levels: saved.levels }));
  });
  await page.reload();
  await expect(page.locator('#start')).toBeVisible();
  expect(await page.evaluate(() => window.__game.controls.bindings)).toEqual({ fire: { hand: 'aim', gesture: 'thumb' }, reload: { hand: 'move', gesture: 'thumb' }, sprint: 'stick' });
  expect(await page.evaluate(() => [window.__game.controls.aim.drag, window.__game.controls.move.drag])).toEqual(['open', 'open']);
  await expect(chip('fire', 'thumb')).toBeChecked();
  await expect(chip('open', 'open')).toBeChecked();
});

test('what\'s chosen is kept: the M4, fifteen tags, the sensitivity, no help with aiming, and the left hand to look round', async ({ page }) => {
  await startMatch(page, { arenaRifle: 'm4', arenaWin: 15, arenaSens: 'high', arenaAssist: 'off', arenaHard: 'gentle', hands: 'left' }, 'left');
  await inTheOpen(page);
  const match = await matchIs(page);
  expect([match.rifle, match.goal, match.assist, match.canLose]).toEqual(['m4', 15, false, false]);
  await expect(page.locator('#chip-goal')).toHaveText('of 15');
  await expect(page.locator('#ammo-name')).toHaveText('M4');
  // The pad that looks round is on the left now, and the one that walks on the right, and the card says so.
  const [stick, pad] = await Promise.all(['#stick', '#pad'].map((each) => page.locator(each).boundingBox()));
  expect(pad.x).toBeLessThan(stick.x);
  expect(await page.evaluate(() => [getComputedStyle(document.querySelector('.how-side.is-move .how-hand'), '::after').content, getComputedStyle(document.querySelector('.how-side.is-aim .how-hand'), '::after').content])).toEqual(['"Right hand"', '"Left hand"']);
  // The left hand looks round, further for the same move at the higher sensitivity, and the right one walks.
  await hands(page, { aim: { x: 0.25 }, side: 'left' });
  await soon(async () => degrees((await matchIs(page)).heading)).toBeGreaterThan(18);
  await page.waitForTimeout(400);
  // A quarter of a palm length at the usual sensitivity would be 17 degrees: at the higher one it's 24.
  expect(degrees((await matchIs(page)).heading)).toBeGreaterThan(0.25 * PER_PALM + 3);
  expect((await matchIs(page)).stats.walked).toBeLessThan(0.3);
  await hands(page, { aim: { x: 0.25 }, move: { y: -REACH * 0.8 }, side: 'left' });
  await soon(async () => (await matchIs(page)).stats.walked).toBeGreaterThan(2);
  // And the left hand's thumb fires.
  await hands(page, { aim: { ...THUMB, x: 0.25 }, side: 'left' });
  await soon(async () => (await matchIs(page)).stats.shots).toBeGreaterThan(2);
  // Changing a setting in the middle of a match applies at once.
  await page.locator('#open-panel').click();
  await page.locator('input[name="arenaAssist"][value="on"]').check();
  await page.locator('input[name="arenaSens"][value="low"]').check();
  await page.locator('#close-panel').click();
  expect((await matchIs(page)).assist).toBe(true);
  expect(await page.evaluate(() => window.__game.controls.gain)).toBeLessThan(1);
});

for (const level of [1, 10]) {
  test(`level ${level}: nothing flashes, through firing, hits, a tag, a magazine change and walking`, async ({ page }) => {
    test.setTimeout(180_000);
    await startMatch(page, { levels: { [GAME]: level }, arenaWin: 15, arenaHard: 'gentle' });
    await someoneInFront(page, 9, { health: 10_000 });
    await hands(page, { aim: THUMB });
    await soon(async () => (await matchIs(page)).stats.hits).toBeGreaterThan(1);
    const firing = await brightnessThrough(page, 200);
    // On through a tag, and then a magazine change and a walk up the yard.
    await someoneInFront(page, 9, { health: 60 });
    const tagging = await brightnessThrough(page, 120);
    expect((await matchIs(page)).stats.tags).toBeGreaterThan(0);
    await page.evaluate(() => {
      window.__game.match.child.rounds = 9;
    });
    await hands(page, { aim: OPEN, move: THUMB });
    const changing = await brightnessThrough(page, 120);
    await someoneInFront(page, null);
    await hands(page, { move: { y: -REACH * 0.8 } });
    const walking = await brightnessThrough(page, 150);
    // Standing still, firing and changing the magazine, the picture's brightness hardly moves. Walking, the view
    // itself goes up the yard, which is the picture changing and not a flash: the same allowance as Cannon Bay
    // has, whose view moves too.
    for (const [name, reading, most] of [['firing', firing, 4], ['tagging', tagging, 4], ['changing', changing, 4], ['walking', walking, 6]]) {
      console.log(`level ${level}, ${name}: biggest brightness step`, biggestStep(reading));
      expect(biggestStep(reading), name).toBeLessThan(most);
    }
    expect((await matchIs(page)).snowing).toBe(level === 10);
  });
}

test('level 10 on Medium: nothing flashes with the other team side-stepping as they fire, tagging the player out, or the player coming back', async ({ page }) => {
  test.setTimeout(180_000);
  await startMatch(page, { levels: { [GAME]: 10 }, arenaWin: 15, arenaHard: 'medium' });
  // The player in the alley down one side, and the other team, played by the computer, coming up it at them.
  await page.evaluate(() => {
    const { match } = window.__game;
    Object.assign(match.child, { x: -21, z: 13, heading: 0, vx: 0, vz: 0 });
    match.troopers.filter(({ team }) => team === 1).forEach((red, index) => Object.assign(red, { x: -21 + (index - 1) * 0.9, z: 4, heading: Math.PI, safeLeft: 0, haunt: null, way: null }));
    for (const mate of match.troopers.filter(({ team, bot }) => team === 0 && bot)) Object.assign(mate, { bot: false, x: 200, z: 200 });
    window.__strafed = 0;
    window.__hurt = 0;
    let health = match.child.health;
    window.__watch = setInterval(() => {
      if (match.child.health < health) window.__hurt += 1;
      health = match.child.health;
      for (const red of match.troopers.filter(({ team, part }) => team === 1 && part !== 'runner')) if (red.firing && red.speed > 0.5) window.__strafed += 1;
    }, 50);
  });
  await hands(page, { aim: THUMB });
  const fight = await brightnessThrough(page, 300);
  console.log('level 10 on Medium, fighting: biggest brightness step', biggestStep(fight));
  expect(biggestStep(fight)).toBeLessThan(4);
  // They really were side-stepping while they fired, and hitting the player, who was tagged out and came back
  // behind the veil.
  expect(await page.evaluate(() => window.__strafed)).toBeGreaterThan(0);
  expect((await matchIs(page)).canLose).toBe(true);
  expect(await page.evaluate(() => window.__hurt)).toBeGreaterThan(0);
  expect((await matchIs(page)).stats.out).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__game.match.child.state)).toBe('in');
});

test('the higher levels bring what they say: a shield carrier, three a side, a crate, snow and the champions, each named on the title card', async ({ page }) => {
  await openGame(page, { levels: { [GAME]: 10 }, arenaHard: 'gentle' }, GAME);
  await expect(page.locator('#screen-welcome')).toContainText('Champions');
  await expect(page.locator('#screen-welcome')).toContainText('Trophy');
  await hands(page);
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
  const match = await matchIs(page);
  expect(match.sides).toEqual([3, 3]);
  expect(match.parts.slice().sort()).toEqual(['captain', 'runner', 'shield']);
  expect(match.snowing).toBe(true);
  await expect(page.locator('#chip-stars-box')).toBeVisible();
  // Each of the other team has a badge that says what they are.
  const badges = await page.evaluate(() => [...document.querySelectorAll('.arena-mark[data-team="red"] .arena-mark-badge')].map((badge) => badge.textContent).sort());
  expect(badges).toEqual(['🎖️', '💨', '🛡️'].sort());
  // A crate turns up, and walking over it gives what's in it, with a bar that runs down.
  await page.evaluate(() => {
    window.__game.match.crateIn = 0;
  });
  await soon(async () => (await matchIs(page)).crate?.kind).toBe('boots');
  await page.evaluate(() => {
    const { match } = window.__game;
    Object.assign(match.child, { x: match.crate.x, z: match.crate.z + 2, heading: 0, vx: 0, vz: 0 });
  });
  await hands(page, { move: { y: -REACH * 0.8 } });
  await soon(async () => (await matchIs(page)).power.bootsLeft).toBeGreaterThan(5);
  await expect(page.locator('#chip-power-box')).toBeVisible();
  await expect(page.locator('#chip-power-name')).toHaveText('Snow boots');
  await shot(page, 'arena-level-10');
  // The captain tagged is two points and two stars, and winning brings the trophy.
  await page.evaluate(() => {
    const { match } = window.__game;
    const captain = match.troopers.find(({ part }) => part === 'captain');
    match.score[0] = match.goal - 2;
    Object.assign(captain, { health: 1, safeLeft: 0, state: 'in' });
    match.hit(captain, 5, match.child);
  });
  await waitForScreen(page, 'finish');
  const end = await matchIs(page);
  expect([end.state, end.stats.trophy, end.stats.stars]).toEqual(['won', 1, 2]);
  await expect(page.locator('#sum-right-prizes')).toContainText('🏆');
});

test('on a big, sharp screen the yard draws no more pixels than it takes to look sharp, so it stays smooth', async ({ browser }) => {
  // A laptop's own screen, at two pixels for each of the page's: six million of them, drawn sixty times a second
  // or more, is what makes a game like this run slowly.
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 1512, height: 982 }, deviceScaleFactor: 2 });
  const big = await context.newPage();
  await openGame(big, {}, GAME);
  const drawn = () => big.evaluate(() => {
    const { yard } = window.__game;
    const canvas = yard.renderer.domElement;
    return { width: canvas.width, height: canvas.height, sharp: yard.renderer.getPixelRatio(), shown: [canvas.clientWidth, canvas.clientHeight], quality: yard.quality };
  });
  const full = await drawn();
  expect(full.shown).toEqual([1512, 982]);
  // Sharper than one for one, and no more than about three million in all.
  expect(full.sharp).toBeGreaterThan(1.3);
  expect(full.sharp).toBeLessThan(1.6);
  expect(full.width * full.height).toBeLessThan(3_300_000);
  expect(full.width * full.height).toBeGreaterThan(2_900_000);
  // It still fills the screen, in the right shape.
  expect(Math.abs(full.width / full.height - 1512 / 982)).toBeLessThan(0.01);
  // A computer that turns out slow gives up sharpness first, and then its real shadows.
  const slow = () => big.evaluate(() => {
    const { yard } = window.__game;
    for (let i = 0; i < 95; i += 1) yard.watchSpeed(1 / 30);
    return yard.quality;
  });
  expect(await slow()).toBe(1);
  expect((await drawn()).sharp).toBe(1);
  expect((await drawn()).width).toBe(1512);
  expect(await slow()).toBe(0);
  expect(await big.evaluate(() => window.__game.yard.renderer.shadowMap.enabled)).toBe(false);
  // One that keeps up is left alone: a frame in time, sixty times a second, never counts as slow.
  await big.reload();
  await expect(big.locator('#start')).toBeVisible();
  expect(await big.evaluate(() => {
    const { yard } = window.__game;
    for (let i = 0; i < 400; i += 1) yard.watchSpeed(1 / 60);
    return yard.quality;
  })).toBe(2);
  await context.close();
  // A small window, at one for one, is drawn as it is.
  const small = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 1280, height: 720 } });
  const page = await small.newPage();
  await openGame(page, {}, GAME);
  expect(await page.evaluate(() => [window.__game.yard.renderer.domElement.width, window.__game.yard.renderer.domElement.height])).toEqual([1280, 720]);
  await small.close();
});

test('the match makes no requests off this computer, and the page refuses to', async ({ page, pageErrors }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await startMatch(page, { arenaHard: 'gentle' });
  await someoneInFront(page, 9, { health: 10_000 });
  await hands(page, { aim: THUMB, move: { y: -REACH * 0.5 } });
  await soon(async () => (await matchIs(page)).stats.shots).toBeGreaterThan(2);
  const away = requests.filter((url) => !url.startsWith(new URL(page.url()).origin) && !url.startsWith('data:') && !url.startsWith('blob:'));
  expect(away).toEqual([]);
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(policy).toContain("default-src 'self'");
  const blocked = await page.evaluate(() => fetch('https://example.com/upload', { method: 'POST', body: 'picture' }).then(() => 'sent', () => 'refused'));
  expect(blocked).toBe('refused');
  await expect.poll(() => pageErrors.join('\n')).toContain("violates the following Content Security Policy directive: \"connect-src 'self'");
  pageErrors.length = 0;
});
