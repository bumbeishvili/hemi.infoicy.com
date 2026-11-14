// Playing Flap, Little Chick!: each hand is a wing, a hand coming up from hanging forwards flaps it, and a flap in
// good time carries the chick over what's in the way, all the way home. A child who isn't flapping finds the chick
// waiting, one hand alone is only a hop, and the mother hen helps where a flap can't. With real photos of hands
// through the real tracker, each hand shown held up or tipped forwards on its own.
import { shot } from '../helpers.js';
import { DOWN, expect, expectSoon, flapHands, GAME, hands, labelShown, openGame, show, startPlaying, state, stopHands, test, untilNear, UP, waitForScreen } from './helpers.js';

const INTRO = 'Flap home, little chick! The fox is behind you!';
const FLAP_HINT = 'Lift your hands to flap!';
const BOTH_HINT = 'Flap both wings together!';
const RESTING = 'Resting is OK. Flap when you’re ready.';
const FINISH = 'Home safe! What a flyer!';
const atLevel = (level, more = {}) => ({ levels: { [GAME]: level }, ...more });

test('the title card shows the move in a little film, has the way back to all the games, and leaves the chick in sight', async ({ page }) => {
  await openGame(page, {}, GAME);
  await expect(page.locator('h1')).toHaveText('Flap, Little Chick!');
  await expect(page.locator('#start')).toHaveText('Flap home!');
  await expect(page.locator('#tagline')).toContainText('Your hands are the chick’s wings');
  const film = page.locator('.flap-film-title');
  await expect(film).toBeVisible();
  // A hand turning at the wrist, from hanging forwards to held up, and the chick's wing coming up with it.
  expect(await film.locator('.film-arm:not(.film-arm-far) .film-hand').evaluate((node) => getComputedStyle(node).animationName)).toBe('flap-film-wrist');
  expect(await film.locator('.film-wing').first().evaluate((node) => getComputedStyle(node).animationName)).toBe('flap-film-wing');
  await expect(page.locator('#screen-welcome .all-games')).toBeVisible();
  // On a wide screen the chick stands to the left of the card, where it can be seen. On a narrow one, where the card
  // fills the screen, it stays where it always is.
  const chickClear = () => page.evaluate(() => {
    const { view, farm } = window.__game;
    const card = document.querySelector('#screen-welcome .title-card').getBoundingClientRect();
    return view.x(farm.chick.x) + view.unit * 0.6 < card.left;
  });
  await expectSoon(chickClear, { timeout: 5000 }).toBe(true);
  await page.waitForTimeout(1300);
  await shot(page, 'flap-title');
  await page.setViewportSize({ width: 640, height: 720 });
  await expectSoon(() => page.evaluate(() => window.__game.view.chickX / window.innerWidth), { timeout: 5000 }).toBeCloseTo(0.3, 2);
});

test('bending the wrists back flaps the wings: the chick hops over every log, leaves the fox behind, and gets home', async ({ page }) => {
  test.setTimeout(240_000);
  await startPlaying(page, { flapWay: 'short' });
  const start = await state(page);
  expect(start.level).toBe(1);
  expect(start.things.map((thing) => thing.kind)).toEqual(Array(8).fill('log'));
  // The hand check saw both hands held up, so each wing knows how its own hand looks held flat.
  expect([start.wings.left.checked, start.wings.right.checked]).toEqual([true, true]);
  expect(start.wings.left.flat).toBeGreaterThan(0.6);
  expect(start.wings.right.flat).toBeGreaterThan(0.6);
  await expect(page.locator('#story-line')).toHaveText(INTRO);
  await expect(page.locator('#chip-way')).toHaveText('0 of 8');
  await expect(page.locator('#chip-corn-box')).toBeHidden();
  expect(start.film).toBe('on');
  // Held up since the hand check, the wings are drawn up, and nothing has flapped: a flap is a hand coming up.
  await page.waitForTimeout(1200);
  const held = await state(page);
  expect(held.stats.flaps).toEqual({ left: 0, right: 0 });
  expect(held.drawn.left).toBeGreaterThan(0.8);
  expect(held.drawn.right).toBeGreaterThan(0.8);
  await expect(page.locator('#flap-wing-left')).toBeVisible();
  await expect(page.locator('#flap-wing-right')).toBeVisible();
  await expect(page.locator('.hands-bar')).toBeHidden();
  await shot(page, 'flap-wings-up');

  // Played as a child would: hands down while it runs, and up on the painted stretch before each log.
  await flapHands(page);
  await expectSoon(async () => (await state(page)).chick.air, { timeout: 20_000 }).toBe(true);
  await shot(page, 'flap-over-a-log');
  await expectSoon(async () => (await state(page)).stats.cleared, { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
  const first = await state(page);
  expect(first.stats.clean).toBe(first.stats.cleared);
  expect(first.stats.tumbles).toBe(0);
  await expect(page.locator('#chip-way')).toHaveText(/^[1-8] of 8$/);
  await expect(page.locator('#flap-count-right')).toHaveText(/^[1-9]/);
  // The film of what to do goes once the wings have flapped twice.
  await expectSoon(() => page.evaluate(() => document.body.dataset.film), { timeout: 30_000 }).toBe('off');

  await waitForScreen(page, 'finish');
  await stopHands(page);
  const end = await state(page);
  expect(end.stats.cleared).toBe(8);
  expect(end.stats.clean).toBe(8);
  expect(end.stats.tumbles + end.stats.hen).toBe(0);
  expect(end.stats.flaps.right).toBeGreaterThanOrEqual(8);
  expect(end.fox.gap).toBeGreaterThan(3.4);
  const total = end.stats.flaps.left + end.stats.flaps.right;
  await expect(page.locator('#screen-finish h2')).toHaveText(FINISH);
  await expect(page.locator('#finish-hero')).toHaveText(String(total));
  // Each hand has its own column, whichever is the hand in play.
  await expect(page.locator('#sum-left-flaps')).toBeVisible();
  await expect(page.locator('#sum-left-flaps')).toHaveText(String(end.stats.flaps.left));
  await expect(page.locator('#sum-right-flaps')).toHaveText(String(end.stats.flaps.right));
  await expect(page.locator('#sum-right-held')).toHaveText(`${Math.round(end.stats.held.right)} s`);
  await expect(page.locator('#finish-way')).toContainText('8 of 8 flown over without a stop');
  await expect(page.locator('#finish-open')).toBeHidden();
  await expect(page.locator('#level-done-text')).toHaveText('Level 1 done! Next: level 2');
  await expect(page.locator('#level-next-new')).toContainText('Corn to catch');
  await page.waitForTimeout(600);
  await shot(page, 'flap-finish');
});

for (const [name, scene, asked] of [['hanging forwards', [DOWN, DOWN], /^Lift your hands to flap!$/], ['out of the picture', [null, null], /^(Show your right hand!|Hold your hand up closer to the camera)$/]]) {
  test(`with the hands ${name} the chick waits at the log for as long as it takes, the fox sits down, and a flap whenever it comes carries it over`, async ({ page }) => {
    test.setTimeout(180_000);
    await openGame(page, {}, GAME);
    await hands(page);
    await page.locator('#start').click();
    // From the countdown on, so nothing flaps before the hands go.
    await waitForScreen(page, 'countdown');
    await hands(page, ...scene);
    await waitForScreen(page, 'playing');
    await expectSoon(async () => (await state(page)).chick.waiting?.kind, { timeout: 15_000 }).toBe('log');
    await page.waitForTimeout(7500);
    const resting = await state(page);
    expect(resting.stats.flaps).toEqual({ left: 0, right: 0 });
    expect(resting.stats.tumbles + resting.stats.hen).toBe(0);
    expect(resting.resting).toBe(true);
    expect(resting.fox.sitting).toBe(true);
    expect(resting.fox.gap).toBeCloseTo(3.4, 5);
    // What to do is said, and the little film of it comes back.
    await expect(page.locator('#prompt-text')).toHaveText(asked);
    expect(resting.film).toBe('on');
    await shot(page, `flap-waiting-${scene[0] === null ? 'no-hands' : 'hands-down'}`);
    if (scene[0] !== null) {
      // After a quarter of a minute it's said that resting is fine, and the chick is still just waiting.
      await expectSoon(async () => (await state(page)).restFor, { timeout: 30_000 }).toBeGreaterThan(15.5);
      await expect(page.locator('#prompt-text')).toHaveText(RESTING);
      const later = await state(page);
      expect(later.chick.waiting.kind).toBe('log');
      expect(later.stats.tumbles + later.stats.hen).toBe(0);
      expect(later.fox.gap).toBeCloseTo(3.4, 5);
    }
    // Both hands come up: one flap each, and over it goes.
    await hands(page, UP, UP);
    await expectSoon(async () => (await state(page)).things[0].done, { timeout: 10_000 }).toBe(true);
    const over = await state(page);
    expect(over.stats.flaps).toEqual({ left: 1, right: 1 });
    expect(over.stats.tumbles).toBe(0);
    await expect(page.locator('#prompt-text')).not.toHaveText(asked);
  });
}

test('each hand is its own wing: one hand alone is a hop, too small for a fence, and the chick tumbles over it with the fox coming nearer', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, atLevel(3, { flapWay: 'short' }));
  expect((await state(page)).things[0].kind).toBe('fence');
  await hands(page, DOWN, DOWN);
  // On the painted stretch before the fence, only the right hand comes up.
  await untilNear(page, 'fence', 2.6);
  await hands(page, DOWN, UP);
  await expectSoon(async () => (await state(page)).stats.flaps, { timeout: 4000, intervals: [50] }).toEqual({ left: 0, right: 1 });
  await expectSoon(async () => (await state(page)).drawn.right, { timeout: 3000, intervals: [50] }).toBeGreaterThan(0.7);
  const hop = await state(page);
  expect([hop.wings.left.up, hop.wings.right.up]).toEqual([false, true]);
  expect(hop.drawn.left).toBeLessThan(0.3);
  await expect(page.locator('#flap-count-right')).toHaveText('1');
  await expect(page.locator('#flap-count-left')).toHaveText('0');
  await expect(page.locator('#flap-wing-right')).toHaveAttribute('data-up', 'true');
  await expect(page.locator('#flap-wing-left')).toHaveAttribute('data-up', 'false');
  await shot(page, 'flap-one-wing');
  // A hop isn't over a fence: a tumble, with the fox a step nearer, and the chick on its feet beyond it.
  await expectSoon(async () => (await state(page)).stats.tumbles, { timeout: 10_000 }).toBe(1);
  expect((await state(page)).fox.gap).toBeCloseTo(3.4 - 0.85, 5);
  await expectSoon(async () => (await state(page)).things[0].done, { timeout: 5000 }).toBe(true);
  expect((await state(page)).things[0].clean).toBe(false);
  // Both hands together are a whole flap: over the log that's next, and then clean over the next fence.
  await flapHands(page);
  await expectSoon(async () => (await state(page)).things[2].done, { timeout: 40_000 }).toBe(true);
  const after = await state(page);
  expect(after.things[2]).toMatchObject({ kind: 'fence', clean: true });
  expect(after.stats.tumbles).toBe(1);
  expect(after.stats.flaps.left).toBeGreaterThanOrEqual(1);
  expect(after.stats.together).toBeGreaterThanOrEqual(1);
  await stopHands(page);
});

test('set to wait, the chick stops at the fence, the child is told to flap both wings, and after three hops that don\'t get over it the mother hen carries it over', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, atLevel(3, { flapFox: 'wait', flapWay: 'short' }));
  expect((await state(page)).gentle).toBe(true);
  // A child who only ever flaps one hand.
  await flapHands(page, { most: 1 });
  await expectSoon(async () => (await state(page)).chick.waiting?.kind, { timeout: 20_000 }).toBe('fence');
  await expectSoon(async () => (await state(page)).things[0].fails, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  await expect(page.locator('#prompt-text')).toHaveText(BOTH_HINT);
  await shot(page, 'flap-both-wings-asked');
  await expectSoon(async () => (await state(page)).chick.state, { timeout: 25_000 }).toBe('carried');
  expect((await state(page)).hen).toEqual({ why: 'help' });
  await expectSoon(() => labelShown(page, 'hen'), { timeout: 8000 }).toBe(true);
  await page.waitForTimeout(700);
  await shot(page, 'flap-mother-hen');
  await expectSoon(async () => (await state(page)).things[0].done, { timeout: 15_000 }).toBe(true);
  await expectSoon(async () => (await state(page)).chick.state, { timeout: 10_000 }).toBe('run');
  const after = await state(page);
  expect(after.stats.hen).toBe(1);
  expect(after.stats.tumbles).toBe(0);
  expect(after.stats.flaps.left).toBe(0);
  expect(after.fox.gap).toBeGreaterThanOrEqual(3.4);
  await stopHands(page);
});

test('with the hand in play alone working both wings, one hand gets over a fence, the other is left alone, and only that hand is counted', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, atLevel(3, { flapWings: 'one', flapWay: 'short' }));
  expect((await state(page)).single).toBe('right');
  await expect(page.locator('#flap-wing-left')).toBeHidden();
  await expect(page.locator('#flap-wing-right')).toBeVisible();
  await hands(page, DOWN, DOWN);
  // The other hand coming up does nothing.
  await untilNear(page, 'fence', 3.8);
  await hands(page, UP, DOWN);
  await page.waitForTimeout(450);
  const other = await state(page);
  expect(other.stats.flaps).toEqual({ left: 0, right: 0 });
  expect(other.chick.air).toBe(false);
  // The hand in play coming up is both wings' flap: over the fence, cleanly.
  await hands(page, UP, UP);
  await expectSoon(async () => (await state(page)).stats.flaps, { timeout: 4000, intervals: [50] }).toEqual({ left: 0, right: 1 });
  const both = await state(page);
  expect(Math.abs(both.drawn.left - both.drawn.right)).toBeLessThan(0.01);
  await expectSoon(async () => (await state(page)).things[0].done, { timeout: 10_000 }).toBe(true);
  expect((await state(page)).things[0].clean).toBe(true);
  // The finish card has only that hand's column.
  await page.evaluate(() => window.__game.session.finish());
  await waitForScreen(page, 'finish');
  await expect(page.locator('#sum-right-flaps')).toHaveText('1');
  await expect(page.locator('#sum-left-flaps')).toBeHidden();
  await expect(page.locator('#sum-right-together')).toBeHidden();
});

test('how far a hand has to come up to flap is the grown-ups\' choice: a small rise flaps on a little, and not on a lot', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page, { flapRise: 'little' });
  // From tipped 53° to tipped 37°, with both hands.
  await hands(page, 0.6, 0.6);
  await page.waitForTimeout(900);
  await hands(page, 0.8, 0.8);
  await expectSoon(async () => (await state(page)).stats.flaps, { timeout: 4000, intervals: [50] }).toEqual({ left: 1, right: 1 });
  const little = await state(page);
  expect(little.wings.right.rise).toBeGreaterThan(0.7);
  expect(little.wings.right.rise).toBeLessThan(0.92);
  // A lot: the same rise isn't a flap any more, and all the way up from hanging forwards is.
  await page.locator('#open-panel').click();
  await expect(page.locator('input[name="flapRise"]')).toHaveCount(3);
  await page.locator('input[name="flapRise"][value="lots"]').check();
  await page.locator('#close-panel').click();
  await hands(page, 0.6, 0.6);
  await page.waitForTimeout(900);
  await hands(page, 0.8, 0.8);
  await page.waitForTimeout(1500);
  expect((await state(page)).stats.flaps).toEqual({ left: 1, right: 1 });
  await hands(page, DOWN, DOWN);
  await page.waitForTimeout(900);
  await hands(page, UP, UP);
  await expectSoon(async () => (await state(page)).stats.flaps, { timeout: 4000, intervals: [50] }).toEqual({ left: 2, right: 2 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('camera-games-settings')).flapRise)).toBe('lots');
});

test('real hands wobble: trembling, held up or hanging forwards, they never flap by themselves, and trembling all the way they still fly the chick home', async ({ page }) => {
  test.setTimeout(300_000);
  await openGame(page, atLevel(3, { flapWay: 'short' }), GAME);
  // In the hand check too: never still, tipping a little to and fro, turning and shaking, and lost for a frame now and then.
  await flapHands(page, { policy: 'hold', wobble: 1 });
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
  await page.waitForTimeout(3500);
  const held = await state(page);
  expect(held.stats.flaps).toEqual({ left: 0, right: 0 });
  expect(held.drawn.left).toBeGreaterThan(0.7);
  expect(held.drawn.right).toBeGreaterThan(0.7);
  await flapHands(page, { policy: 'hang', wobble: 1 });
  await page.waitForTimeout(3500);
  const hanging = await state(page);
  expect(hanging.stats.flaps).toEqual({ left: 0, right: 0 });
  expect(hanging.drawn.left).toBeLessThan(0.3);
  expect(hanging.drawn.right).toBeLessThan(0.3);
  // And played, trembling all the way: fences with both hands, logs with one.
  await flapHands(page, { wobble: 1 });
  await waitForScreen(page, 'finish');
  await stopHands(page);
  const end = await state(page);
  console.log('wobbling hands', JSON.stringify({ flaps: end.stats.flaps, clean: end.stats.clean, tumbles: end.stats.tumbles, hen: end.stats.hen, seconds: Math.round(end.stats.seconds) }));
  expect(end.stats.cleared).toBe(8);
  expect(end.stats.hen).toBe(0);
  expect(end.stats.tumbles).toBeLessThanOrEqual(1);
  // No flaps the hands didn't make: one for each thing, a few more if one had to be tried again, and no more.
  expect(end.stats.flaps.right).toBeGreaterThanOrEqual(8);
  expect(end.stats.flaps.right).toBeLessThanOrEqual(12);
  expect(end.stats.flaps.left).toBeGreaterThanOrEqual(4);
  expect(end.stats.flaps.left).toBeLessThanOrEqual(8);
});

test('it\'s the wrist that flaps, whatever the fingers do: a closed hand coming up flaps its wing, and only the open hand\'s flap is the stronger one', async ({ page }) => {
  test.setTimeout(150_000);
  await openGame(page, {}, GAME);
  // A fist for the left hand and an open palm for the right, both held up, a little nearer the camera.
  await show(page, 'fist', 'palm', { scale: 0.8 });
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
  await show(page, 'fist', 'palm', { scale: 0.8, shorten: 0.6 });
  await page.waitForTimeout(1000);
  expect((await state(page)).stats.flaps).toEqual({ left: 0, right: 0 });
  await show(page, 'fist', 'palm', { scale: 0.8 });
  await expectSoon(async () => (await state(page)).stats.flaps, { timeout: 5000, intervals: [50] }).toEqual({ left: 1, right: 1 });
  const flapped = await state(page);
  expect(flapped.stats.open).toBe(1);
  expect(flapped.wings.left.up).toBe(true);
  // The first open flap has its label.
  await expectSoon(() => labelShown(page, 'open'), { timeout: 10_000 }).toBe(true);
});

test('with the left hand as the hand in play, both hands are still wings, and the left one does the hops', async ({ page }) => {
  test.setTimeout(180_000);
  await startPlaying(page, atLevel(3, { hands: 'left', flapWay: 'short' }));
  const start = await state(page);
  expect([start.wings.left.checked, start.wings.right.checked]).toEqual([true, true]);
  expect(await page.evaluate(() => document.body.dataset.hands)).toBe('left');
  await expect(page.locator('#flap-wing-left')).toBeVisible();
  await expect(page.locator('#flap-wing-right')).toBeVisible();
  await flapHands(page, { hand: 'left' });
  // A fence, with both, and then a log, with the left hand alone.
  await expectSoon(async () => (await state(page)).things[1].done, { timeout: 40_000 }).toBe(true);
  await stopHands(page);
  const after = await state(page);
  expect(after.things.slice(0, 2).map((thing) => [thing.kind, thing.clean])).toEqual([['fence', true], ['log', true]]);
  expect(after.stats.flaps.left).toBe(2);
  expect(after.stats.flaps.right).toBe(1);
});

test('in Georgian, Giraffe\'s words, the labels and what the child is told are in Georgian, and every line has its voice', async ({ page }) => {
  test.setTimeout(150_000);
  await openGame(page, atLevel(3, { language: 'ka', voice: true, sound: true }), GAME);
  await hands(page);
  await page.locator('#start').click();
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-new-now')).toContainText('ღობეები');
  await hands(page, DOWN, DOWN);
  await waitForScreen(page, 'playing');
  await expect(page.locator('#story-line')).toHaveText('სახლისკენ იფრინე, პატარა წიწილო! მელია მოგდევს!');
  await expect(page.locator('#story-name')).toHaveText('ჟირაფი');
  // The fence's label, as it comes.
  await expectSoon(() => page.evaluate(() => window.__game.view.labels[0]?.text ?? ''), { timeout: 8000 }).toBe('ღობეს ორივე ფრთა უნდა!');
  await expectSoon(async () => (await state(page)).chick.waiting?.kind, { timeout: 20_000 }).toBe('fence');
  await expect(page.locator('#prompt-text')).toHaveText('ასწიე ხელები და დაიქნიე ფრთები!', { timeout: 10_000 });
  // Every line the game has is loaded, in Georgian, and its sounds are too.
  const loaded = await page.evaluate(async () => {
    const lines = await (await fetch('audio/voice/lines.json')).json();
    const { sound } = window.__game;
    return { lines: lines.length, voices: lines.filter(({ text }) => sound.voiceClips.has(text)).length, sounds: ['flap', 'flap-both', 'land', 'bump', 'boing', 'splash', 'wind', 'engine', 'hen', 'cheer', 'birds', 'music', 'swish'].filter((name) => sound.buffers.has(name)).length };
  });
  expect(loaded.lines).toBeGreaterThanOrEqual(8);
  expect(loaded.voices).toBe(loaded.lines);
  expect(loaded.sounds).toBe(13);
});

test('a hand that comes up is a flap within a third of a second, and the wing is down again as soon after it drops', async ({ page }) => {
  test.setTimeout(150_000);
  await startPlaying(page);
  /** Shows the hands, and says how many milliseconds later what's waited for is so, or null if it never is. */
  const delay = (left, right, until) => page.evaluate(([l, r, check]) => new Promise((resolve) => {
    const { farm, wings } = window.__game;
    const before = farm.stats.flaps.left + farm.stats.flaps.right;
    const from = performance.now();
    window.__camera.show({ left: 'palm', right: 'palm', scale: 0.62, leftShorten: l, rightShorten: r });
    const look = () => {
      const so = check === 'flap' ? farm.stats.flaps.left + farm.stats.flaps.right >= before + 2 : !wings.left.up && !wings.right.up;
      if (so) resolve(performance.now() - from);
      else if (performance.now() - from > 3000) resolve(null);
      else requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  }), [left, right, until]);
  const up = [];
  const down = [];
  for (let n = 0; n < 6; n += 1) {
    down.push(await delay(DOWN, DOWN, 'down'));
    await page.waitForTimeout(700);
    up.push(await delay(UP, UP, 'flap'));
    await page.waitForTimeout(700);
  }
  console.log('a flap after the hands come up', JSON.stringify(up.map(Math.round)), 'and the wings down after they drop', JSON.stringify(down.slice(1).map(Math.round)));
  for (const ms of up) {
    expect(ms).not.toBeNull();
    expect(ms).toBeLessThan(350);
  }
  // The first drop is from hands that had never flapped, so there's no wing to come down: the rest are.
  for (const ms of down.slice(1)) {
    expect(ms).not.toBeNull();
    expect(ms).toBeLessThan(350);
  }
  expect((await state(page)).stats.flaps).toEqual({ left: 6, right: 6 });
});
