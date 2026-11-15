// Mighty Lift, played in the real page: with footage of a person raising an arm as the webcam, read by the real
// tracker, and with a child played by a script where a test is about what comes after.
import { ARMS, armsAre, childLifts, expect, expectSoon, footage, openLift, playFrom, reachPlay, reachWarmup, shot, state, stopChild, test, toChoosing, waitForScreen } from './helpers.js';

const prompt = (page) => page.locator('#prompt');

test('a game won\'t start until the camera sees the child, with room above the shoulders for the arm to go up', async ({ page }) => {
  await openLift(page, { liftHeight: 'head' });
  await page.evaluate(() => window.__camera.showNobody());
  await toChoosing(page);
  await expect(page.locator('#chosen-name')).toHaveText('Giraffe');
  await page.locator('#lift-start').click();
  await waitForScreen(page, 'bodycheck');
  await expect(prompt(page)).toContainText('Stand where I can see all of you');
  await expect(prompt(page)).toBeVisible();
  await page.waitForTimeout(1500);
  expect((await state(page)).screen).toBe('bodycheck');
  await shot(page, 'lift-bodycheck');

  // So close that there's no room in the picture for an arm to go up above the head, which is what's been chosen.
  await footage(page, 'lifts', { from: ARMS.down, playing: false, height: 2.2, shiftY: 0.35 });
  await expect(prompt(page)).toContainText('Step back until I can see all of you');
  await page.waitForTimeout(1200);
  expect((await state(page)).screen).toBe('bodycheck');
  // With only shoulder height chosen, the same picture has room enough.
  expect(await page.evaluate(() => {
    const { game } = window.__game;
    game.settings.liftHeight = 'shoulder';
    const room = game.roomToLift();
    game.settings.liftHeight = 'head';
    return [room, game.roomToLift()];
  })).toEqual([true, false]);

  await armsAre(page, 'down');
  await waitForScreen(page, 'warmup');
});

test('the warm-up shows the move in a film, sees a real arm go right up, says so, and sets the arm\'s line from it', async ({ page }) => {
  test.setTimeout(150_000);
  await reachWarmup(page, { liftHeight: 'head' });
  await expect(page.locator('#coach-text')).toHaveText('Raise your arm as high as you can!');
  await expect(page.locator('#coach-demo')).toBeVisible();
  expect(await page.evaluate(() => window.__game.game.demo.playing.name)).toBe('lift');
  await expect(page.locator('#lift-meter')).toBeVisible();
  const dot = () => page.locator('#meter-dot').evaluate((node) => parseFloat(node.style.bottom));
  await expectSoon(dot, { timeout: 8000 }).toBeLessThan(25);
  await page.waitForTimeout(700);
  await shot(page, 'lift-warmup');
  expect((await state(page)).screen).toBe('warmup');

  // The arm goes up, in the footage, a second from here.
  await playFrom(page, 0.5);
  await expect(page.locator('.callout.is-seen').first()).toContainText('You lifted it!', { timeout: 20_000 });
  // Held still, straight away, so that what comes next has an arm that's up.
  await armsAre(page, 'up');
  const measured = await state(page);
  expect(measured.right.best).toBeGreaterThan(0.8);
  // Above the head was asked for and is within this arm's reach, so that's its line.
  expect(measured.right.line).toBeCloseTo(0.7, 5);
  await shot(page, 'lift-warmup-seen');
  await waitForScreen(page, 'countdown');
  await waitForScreen(page, 'playing');
  // The warm-up isn't part of the game's numbers.
  expect((await state(page)).stats.freed).toBe(0);
});

test('the lifter copies the child as a mirror would, and the meter follows the arm', async ({ page }) => {
  await reachWarmup(page);
  await page.evaluate(() => {
    window.__game.warmup.finish = () => {};
  });
  // The right arm up: on the right of the screen, which is the character's left hand.
  await armsAre(page, 'up');
  await expectSoon(async () => (await state(page)).lifterHands.right, { timeout: 15_000 }).toBeGreaterThan(0.5);
  expect((await state(page)).lifterHands.left).toBeLessThan(0);
  const dot = () => page.locator('#meter-dot').evaluate((node) => parseFloat(node.style.bottom));
  await expectSoon(dot, { timeout: 8000 }).toBeGreaterThan(80);
  await armsAre(page, 'leftUp');
  await expectSoon(async () => (await state(page)).lifterHands.left, { timeout: 15_000 }).toBeGreaterThan(0.5);
  await expectSoon(async () => (await state(page)).lifterHands.right, { timeout: 15_000 }).toBeLessThan(0);
  await expectSoon(dot, { timeout: 8000 }).toBeLessThan(25);
});

test('a real arm raised and held lifts the basket and frees a friend, and lowering it brings the next', async ({ page }) => {
  test.setTimeout(180_000);
  await reachPlay(page);
  const start = await state(page);
  expect([start.phase, start.index, start.kind, start.planned]).toEqual(['lifting', 0, 'basket', 8]);
  expect(start.thing).toBe('basket');
  expect(start.thingY).toBeLessThan(0.05);
  await expect(page.locator('#lifts-all')).toHaveText('8');
  // The film of the move is there from the start, with what to do.
  await expect(page.locator('#coach-text')).toHaveText('Lift it up!');
  expect(await page.evaluate(() => window.__game.game.demo.playing.name)).toBe('lift');
  await shot(page, 'lift-start');

  // Right up at 1.5 seconds, held to 5.2, and down by 6.4.
  await playFrom(page, 0.5);
  await expectSoon(async () => (await state(page)).up, { timeout: 20_000 }).toBe(true);
  await expect(page.locator('.callout.is-seen').first()).toContainText('You lifted it!');
  // The basket really is up in the air, over the line, and the film has gone.
  await expectSoon(async () => (await state(page)).thingY, { timeout: 5000 }).toBeGreaterThan(1.15);
  await expect(page.locator('#coach')).not.toHaveClass(/is-visible/);
  await shot(page, 'lift-up');
  await expectSoon(async () => (await state(page)).stats.freed, { timeout: 15_000 }).toBe(1);
  await expect(page.locator('#freed-row li')).toHaveCount(1);
  await expect(page.locator('#lifts-done')).toHaveText('1');
  await expect(page.locator('#lifts-today')).toHaveText('1');
  await shot(page, 'lift-freed');

  // Down it comes with the arm, and the next friend is there. A raise to the shoulder, at 7.6, frees them too.
  await expectSoon(async () => (await state(page)).index, { timeout: 20_000 }).toBe(1);
  await expectSoon(async () => (await state(page)).stats.freed, { timeout: 25_000 }).toBe(2);
  const after = await state(page);
  expect(after.stats.lifts).toBe(2);
  expect(after.friends[0]).not.toBe(after.friends[1]);
  await expect(page.locator('#freed-row li')).toHaveCount(2);
});

test('a raise that doesn\'t reach the line lifts the weight part of the way and frees nobody, and "a little" asks for less', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, { liftHeight: 'shoulder' });
  // A small raise, to about the tummy, held there.
  await armsAre(page, 'small');
  await expectSoon(async () => (await state(page)).lift, { timeout: 15_000 }).toBeGreaterThan(0.25);
  await page.waitForTimeout(3200);
  const short = await state(page);
  expect(short.lift).toBeLessThan(0.8);
  expect(short.up).toBe(false);
  expect(short.stats.freed).toBe(0);
  expect(short.thingY).toBeGreaterThan(0.2);
  expect(short.thingY).toBeLessThan(1.1);
  // After a while it's asked to go a little higher, in words and with the film.
  await expect(prompt(page)).toContainText('A little higher!', { timeout: 6000 });
  await shot(page, 'lift-higher');

  // With "a little" chosen, the same raise is over the line, and frees the friend.
  await page.locator('#open-panel').click();
  await page.locator('input[name="liftHeight"][value="little"]').check();
  await page.locator('#close-panel').click();
  await expectSoon(async () => (await state(page)).stats.freed, { timeout: 20_000 }).toBe(1);
});

test('an arm that shakes still lifts and frees, and a wobble at the line doesn\'t drop the weight', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page);
  // Held up from 23.4 seconds but shaking, a tenth of a metre up and down, twice a second.
  await playFrom(page, 22.6);
  await expectSoon(async () => (await state(page)).stats.freed, { timeout: 25_000 }).toBe(1);
  expect((await state(page)).stats.lifts).toBe(1);
});

test('resting is never punished: the friend waits, the weight waits, and after a while it\'s only told that\'s fine', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, { voice: true, sound: true });
  await page.evaluate(async () => {
    const { sound } = window.__game;
    await sound.ready;
    window.__said = [];
    const real = sound.say.bind(sound);
    sound.say = (text, options) => {
      const heard = real(text, options);
      if (heard) window.__said.push(text);
      return heard;
    };
  });
  // Asked to lift, with the film, once the arm has been down a while.
  await expect(prompt(page)).toContainText('Lift it up!', { timeout: 15_000 });
  await expect(page.locator('#coach')).toHaveClass(/is-visible/);
  await expectSoon(async () => (await state(page)).resting, { timeout: 30_000 }).toBe(true);
  await expect(prompt(page)).toBeHidden();
  await page.waitForTimeout(3000);
  const rested = await state(page);
  expect([rested.index, rested.phase, rested.stats.freed, rested.state]).toEqual([0, 'lifting', 0, 'playing']);
  const said = await page.evaluate(() => window.__said);
  expect(said).toContain('Take your time. I’ll wait for you.');
  // Each thing is said twice at most.
  for (const line of new Set(said)) expect(said.filter((each) => each === line).length, line).toBeLessThanOrEqual(2);
  await shot(page, 'lift-resting');
  // And then the arm goes up, and it all carries on.
  await armsAre(page, 'up');
  await expectSoon(async () => (await state(page)).stats.freed, { timeout: 20_000 }).toBe(1);
});

test('stepping out of the picture lets the weight down gently, and nothing is lost', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, { liftHold: 'long' });
  await armsAre(page, 'up');
  await expectSoon(async () => (await state(page)).out, { timeout: 20_000 }).toBeGreaterThan(0.1);
  await page.evaluate(() => window.__camera.showNobody());
  await expect(prompt(page)).toContainText('Come back where I can see you', { timeout: 15_000 });
  await expectSoon(async () => (await state(page)).height, { timeout: 10_000 }).toBeLessThan(0.05);
  const gone = await state(page);
  expect(gone.out).toBeGreaterThan(0.1);
  expect(gone.stats.freed).toBe(0);
  expect(gone.index).toBe(0);
  // Back again, with the arm up, and the friend gets out from where they'd got to.
  await armsAre(page, 'up');
  await expectSoon(async () => (await state(page)).stats.freed, { timeout: 25_000 }).toBe(1);
});

test('both arms with a bar: one arm alone lifts nothing, and the two together do', async ({ page }) => {
  test.setTimeout(150_000);
  await reachWarmup(page, { liftWith: 'both' });
  await expect(page.locator('#coach-text')).toHaveText('Raise both arms as high as you can!');
  expect(await page.evaluate(() => window.__game.game.demo.playing.name)).toBe('liftBoth');
  await page.locator('#warm-skip').click();
  await waitForScreen(page, 'playing');
  expect((await state(page)).sides).toEqual(['left', 'right']);
  await armsAre(page, 'up');
  await expectSoon(async () => (await state(page)).right.lift, { timeout: 15_000 }).toBeGreaterThan(1);
  await page.waitForTimeout(3000);
  const one = await state(page);
  expect(one.lift).toBeLessThan(0.3);
  expect(one.stats.freed).toBe(0);
  await expect(prompt(page)).toContainText('Lift with both arms!', { timeout: 6000 });
  await shot(page, 'lift-one-arm-of-two');
  await armsAre(page, 'bothUp');
  await expectSoon(async () => (await state(page)).stats.freed, { timeout: 20_000 }).toBe(1);
  await shot(page, 'lift-both-arms');
});

test('the other arm can be the one that lifts, and then the arm being worked on lifts nothing', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, { hands: 'right', liftWith: 'other' });
  expect((await state(page)).sides).toEqual(['left']);
  await armsAre(page, 'up');
  await page.waitForTimeout(3500);
  expect((await state(page)).stats.freed).toBe(0);
  await armsAre(page, 'leftUp');
  await expectSoon(async () => (await state(page)).stats.freed, { timeout: 20_000 }).toBe(1);
});

test('a child who keeps trying and can\'t reach the line has it come down to meet them', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page, { liftHeight: 'head' });
  const before = (await state(page)).right.line;
  expect(before).toBeCloseTo(0.7, 5);
  // Only as high as the shoulder, held there: well short of above the head.
  await armsAre(page, 'shoulder');
  await expectSoon(async () => (await state(page)).right.eased !== null, { timeout: 20_000 }).toBe(true);
  const eased = await state(page);
  expect(eased.right.line).toBeLessThan(before);
  expect(eased.right.line).toBeGreaterThanOrEqual(eased.right.rest + 0.3 - 1e-6);
  await expectSoon(async () => (await state(page)).stats.freed, { timeout: 20_000 }).toBe(1);
  expect((await state(page)).stats.eased).toBeGreaterThanOrEqual(1);
});

test('a whole game: every friend freed, the finish card, and the next one a level on without the warm-up again', async ({ page }) => {
  test.setTimeout(240_000);
  await reachPlay(page, { lifts: 5 });
  await childLifts(page);
  await waitForScreen(page, 'finishing');
  await stopChild(page);
  await waitForScreen(page, 'finish');
  await expect(page.locator('#finish-title')).toHaveText('You set them all free!');
  await expect(page.locator('#finish-freed')).toHaveText('5 friends');
  await expect(page.locator('#finish-lifts')).toHaveText('5 lifts');
  await expect(page.locator('#finish-faces li')).toHaveCount(5);
  await expect(page.locator('#finish-line')).toContainText('held it up for');
  await expect(page.locator('#level-done-text')).toHaveText('Level 1 done! Next: level 2');
  await expect(page.locator('#level-next-new')).toContainText('Gold stars');
  await expect(page.locator('#lift-again')).toHaveText('Next level');
  await expect(page.locator('#finish-tally .tally-card')).toHaveCount(3);
  await page.waitForTimeout(700);
  await shot(page, 'lift-finish');
  // The camera is off once a game ends.
  expect(await page.evaluate(() => window.__camera.activeTracks)).toBe(0);

  await armsAre(page, 'down');
  await page.locator('#lift-again').click();
  await waitForScreen(page, 'bodycheck');
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-now')).toHaveText('Level 2');
  await expect(page.locator('#level-new-now')).toContainText('Gold stars');
  await waitForScreen(page, 'playing');
  const next = await state(page);
  expect(next.level).toBe(2);
  expect(next.today).toBe(5);
  await expect(page.locator('#lifts-today')).toHaveText('5');
});

test('the grown-ups\' panel pauses the game, says what the camera sees, and changing the arm brings the warm-up back', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPlay(page);
  await armsAre(page, 'shoulder');
  await expectSoon(async () => (await state(page)).lift, { timeout: 15_000 }).toBeGreaterThan(0.9);
  await page.locator('#open-panel').click();
  await expect(page.locator('#live-reading')).toContainText('The camera sees someone');
  await expect(page.locator('#live-reading')).toContainText('The right arm is');
  await expect(page.locator('#live-reading')).toContainText('of the way up to its line');
  // This game's own settings are there, and the setting the other body games share isn't.
  for (const name of ['liftWith', 'liftHeight', 'liftHold', 'lifts', 'liftFriends']) await expect(page.locator(`input[name="${name}"]`).first()).toBeVisible();
  await expect(page.locator('input[name="moveSize"]').first()).toBeHidden();
  await expect(page.locator('input[name="liftHeight"][value="shoulder"]')).toBeChecked();
  await expect(page.locator('input[name="lifts"][value="8"]')).toBeChecked();
  await page.locator('#panel').evaluate((panel) => panel.scrollTo(0, 0));
  await shot(page, 'lift-panel');
  // Paused: nothing moves on while it's open.
  const paused = await state(page);
  await page.waitForTimeout(2500);
  expect((await state(page)).out).toBe(paused.out);
  expect(await page.evaluate(() => window.__game.game.practised)).toBe(true);
  await page.locator('input[name="hands"][value="left"]').check();
  expect(await page.evaluate(() => window.__game.game.practised)).toBe(false);
  expect((await state(page)).sides).toEqual(['left']);
  await page.locator('#close-panel').click();
  await expect(page.locator('#panel')).toBeHidden();
});

for (const language of ['en', 'ka']) {
  test(`every sound and every voice line loads and decodes, in ${language}`, async ({ page }) => {
    await openLift(page, { voice: true, sound: true, language });
    await toChoosing(page);
    const loaded = await page.evaluate(async () => {
      const { sound } = window.__game;
      await sound.ready;
      return {
        wanted: new Set(sound.lines.map(({ text }) => text)).size,
        clips: [...sound.voiceClips.entries()].map(([text, clip]) => [text, clip.duration]),
        sounds: Object.fromEntries([...sound.buffers.entries()].map(([name, clip]) => [name, clip.duration])),
      };
    });
    expect(loaded.clips.length).toBe(loaded.wanted);
    for (const [text, duration] of loaded.clips) {
      expect(duration, text).toBeGreaterThan(0.2);
      expect(duration, text).toBeLessThan(6);
    }
    // All of them are other games' recordings.
    for (const name of ['creak', 'thud', 'land', 'cheer', 'home', 'sparkle', 'unlock', 'boing', 'bell', 'whoosh', 'birds', 'music']) {
      expect(loaded.sounds[name], name).toBeGreaterThan(0.05);
    }
  });
}

test('a game\'s sound: the mission is said once, each friend says thank you in their own voice, and nothing clips', async ({ page }) => {
  test.setTimeout(240_000);
  await reachWarmup(page, { voice: true, sound: true, lifts: 5 });
  await page.evaluate(async () => {
    const { sound } = window.__game;
    await sound.ready;
    window.__said = [];
    const real = sound.say.bind(sound);
    sound.say = (text, options) => {
      const heard = real(text, options);
      if (heard) window.__said.push(text);
      return heard;
    };
    window.__tap = sound.context.createAnalyser();
    window.__tap.fftSize = 2048;
    sound.output.connect(window.__tap);
    window.__peak = 0;
    const samples = new Float32Array(2048);
    setInterval(() => {
      window.__tap.getFloatTimeDomainData(samples);
      for (const sample of samples) window.__peak = Math.max(window.__peak, Math.abs(sample));
    }, 20);
  });
  await page.locator('#warm-skip').click();
  await waitForScreen(page, 'playing');
  expect(await page.evaluate(() => window.__game.sound.loops.has('music'))).toBe(true);
  await childLifts(page);
  await waitForScreen(page, 'finishing');
  await stopChild(page);
  const { said, peak, friends } = await page.evaluate(() => ({ said: window.__said, peak: window.__peak, friends: window.__game.lifting.rescues.map(({ friend }) => friend) }));
  console.log('lift mix', { peak, said });
  expect(peak).toBeGreaterThan(0.05);
  expect(peak).toBeLessThanOrEqual(1);
  // The mission is one short line, said once, as the game starts.
  expect(said.filter((line) => line === 'Lift it up and set them free!')).toHaveLength(1);
  expect(said.indexOf('Go!')).toBeLessThan(said.indexOf('Lift it up and set them free!'));
  // Thanks from some of them, as a line is never cut off and these come quickly, each in the voice of who was freed.
  const thanks = said.filter((line) => /Thank you|free|hop again|heavy|star|Phew/.test(line));
  expect(thanks.length).toBeGreaterThanOrEqual(2);
  expect(new Set(thanks).size).toBe(thanks.length);
  expect(friends).not.toContain('giraffe');
  expect(said).not.toContain('Thank you! You’re so strong!');
  for (const line of new Set(said)) expect(said.filter((each) => each === line).length, line).toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => window.__game.sound.loops.has('music'))).toBe(false);
});

test('the panel silences everything, and closing it brings it back', async ({ page }) => {
  await reachPlay(page, { voice: false, sound: true });
  await page.locator('#open-panel').click();
  await expectSoon(() => page.evaluate(() => window.__game.sound.master.gain.value), { timeout: 3000 }).toBeLessThan(0.02);
  await page.locator('#close-panel').click();
  await expectSoon(() => page.evaluate(() => window.__game.sound.master.gain.value), { timeout: 3000 }).toBeGreaterThan(0.8);
});

test('Georgian: what\'s asked for, what\'s seen and what\'s new change language', async ({ page }) => {
  test.setTimeout(150_000);
  await reachWarmup(page, { language: 'ka', levels: { 'mighty-lift': 2 } });
  await expect(page.locator('#coach-text')).toHaveText('ასწიე ხელი, რაც შეგიძლია მაღლა!');
  await page.locator('#warm-skip').click();
  await waitForScreen(page, 'countdown');
  await expect(page.locator('#level-now')).toHaveText('დონე 2');
  await expect(page.locator('#level-new-now')).toContainText('ოქროს ვარსკვლავები');
  await waitForScreen(page, 'playing');
  await expect(page.locator('#coach-text')).toHaveText('ასწიე მაღლა!');
  await expect(page.locator('#lift-new')).toContainText('ოქროს ვარსკვლავები');
  await shot(page, 'lift-georgian');
  await armsAre(page, 'up');
  await expect(page.locator('.callout.is-seen').first()).toContainText('ასწიე!', { timeout: 20_000 });
  await expectSoon(async () => (await state(page)).stats.freed, { timeout: 20_000 }).toBe(1);
});

test('the game makes no requests off this computer, and the page refuses to', async ({ page, baseURL, pageErrors }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await reachPlay(page);
  await armsAre(page, 'up');
  await page.waitForTimeout(1500);
  const offsite = requests.filter((url) => !url.startsWith(baseURL) && !url.startsWith('data:') && !url.startsWith('blob:'));
  expect(offsite).toEqual([]);

  const blocked = await page.evaluate(async () => {
    try {
      await fetch('https://example.com/upload', { method: 'POST', body: 'picture' });
      return false;
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);
  await expectSoon(() => pageErrors.join('\n')).toContain("violates the following Content Security Policy directive: \"connect-src 'self'");
  pageErrors.length = 0;
});

test('a camera that isn\'t allowed explains itself and can be tried again', async ({ page }) => {
  await openLift(page);
  await armsAre(page, 'down');
  await page.evaluate(() => {
    window.__camera.failWith = 'NotAllowedError';
  });
  await toChoosing(page);
  await page.locator('#lift-start').click();
  await waitForScreen(page, 'problem');
  await expect(page.locator('#problem-title')).toHaveText('Can we use your camera?');
  await page.evaluate(() => {
    window.__camera.failWith = null;
  });
  await page.locator('#problem-retry').click();
  await waitForScreen(page, 'bodycheck');
});

test('choosing a lifter speaks in that character\'s voice, and they\'re not among the friends to free', async ({ page }) => {
  test.setTimeout(150_000);
  await openLift(page, { voice: true, sound: true });
  await armsAre(page, 'down');
  await toChoosing(page);
  await page.evaluate(async () => {
    const { sound } = window.__game;
    await sound.ready;
    window.__said = [];
    const real = sound.say.bind(sound);
    sound.say = (text, options) => {
      window.__said.push(text);
      return real(text, options);
    };
  });
  await page.locator('.fighter-card[data-fighter="truffle"]').click();
  expect(await page.evaluate(() => window.__said)).toEqual(['Oink oink! Here I come!']);
  await page.waitForTimeout(700);
  await shot(page, 'lift-choose');
  await page.locator('#lift-start').click();
  await waitForScreen(page, 'warmup');
  await page.locator('#warm-skip').click();
  await waitForScreen(page, 'playing');
  const playing = await state(page);
  expect(playing.friends).not.toContain('truffle');
  // The friends to free are the others, starting from any one of them and none twice. With eight to free out
  // of nine others, Giraffe is among them most games and not every one, so that isn't asked for.
  expect(playing.friends.length).toBeGreaterThan(0);
  expect(new Set(playing.friends).size).toBe(playing.friends.length);
});

test('with reduced motion the game still works', async ({ page }) => {
  test.setTimeout(150_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await reachPlay(page);
  await armsAre(page, 'up');
  await expectSoon(async () => (await state(page)).stats.freed, { timeout: 20_000 }).toBe(1);
  await shot(page, 'lift-reduced-motion');
});
