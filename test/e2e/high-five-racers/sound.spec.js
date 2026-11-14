// The sounds themselves can't be judged by a test, but everything around them can: that
// they all load in Chrome, that the car responds to the hands, and that nothing clips.
import {
  car,
  expect,
  openGame,
  reachRace,
  show,
  test,
  waitForHand,
  waitForScreen,
  waitUntilMoving,
  waitUntilStopped,
} from './helpers.js';

/** Listens to the game's final output. */
function tapOutput(page) {
  return page.evaluate(() => {
    const { sound } = window.__game;
    const analyser = sound.context.createAnalyser();
    analyser.fftSize = 2048;
    sound.output.connect(analyser);
    window.__tap = analyser;
  });
}

/** Loudness and peak of the output over a stretch of time. */
function listen(page, seconds = 0.8) {
  return page.evaluate(async (duration) => {
    const samples = new Float32Array(window.__tap.fftSize);
    const end = performance.now() + duration * 1000;
    let total = 0;
    let count = 0;
    let peak = 0;
    while (performance.now() < end) {
      window.__tap.getFloatTimeDomainData(samples);
      for (const sample of samples) {
        total += sample * sample;
        peak = Math.max(peak, Math.abs(sample));
      }
      count += samples.length;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return { rms: Math.sqrt(total / count), peak };
  }, seconds);
}

const engineState = (page) => page.evaluate(() => {
  const { sound } = window.__game;
  return {
    on: sound.engineOn,
    rate: sound.engineSource?.playbackRate.value ?? 0,
    level: sound.engineLevel.gain.value,
    tone: sound.engineTone.frequency.value,
    road: sound.roadLevel.gain.value,
    gear: sound.gear,
    carBus: sound.backgroundBus.gain.value,
  };
});

test('every sound and voice line loads and decodes in Chrome', async ({ page }) => {
  await openGame(page, { voice: true, sound: true });
  await show(page, null, 'open');
  await page.locator('#start').click();
  await waitForScreen(page, 'check');

  const loaded = await page.evaluate(async () => {
    const { sound } = window.__game;
    await sound.ready;
    return {
      lines: sound.lines.length,
      clips: [...sound.voiceClips.entries()].map(([text, clip]) => [text, clip.duration]),
      sounds: Object.fromEntries([...sound.buffers.entries()].map(([name, clip]) => [name, clip.duration])),
    };
  });
  expect(loaded.clips).toHaveLength(loaded.lines);
  for (const [text, duration] of loaded.clips) {
    expect(duration, text).toBeGreaterThan(0.3);
    expect(duration, text).toBeLessThan(5);
  }
  expect(Object.keys(loaded.sounds).sort()).toEqual(
    ['applause', 'bell', 'boing', 'bump', 'cheer', 'clap', 'engineLoop', 'engineStart', 'go', 'handsOpen', 'harp', 'landed', 'lap', 'passBy', 'rush', 'slap', 'sparkle', 'star', 'tick', 'unlock', 'whoosh', 'win'],
  );
  // The engine has to come back the exact length it was written, or its loop would click.
  expect(loaded.sounds.engineLoop).toBeCloseTo(4, 3);
});

test('the car sound follows the hands: revs under power, falls away, then idles', async ({ page }) => {
  await openGame(page, { voice: false, sound: true });
  await show(page, null, 'open');
  await reachRace(page);
  await tapOutput(page);
  await waitForHand(page, 'open');
  await waitUntilMoving(page);

  // At top speed, under power.
  await expect.poll(async () => (await car(page)).speed, { timeout: 20_000 }).toBeGreaterThan(24);
  const driving = await engineState(page);
  await page.waitForTimeout(500);
  const drivingSound = await listen(page);
  console.log('driving', JSON.stringify(driving), JSON.stringify(drivingSound));
  expect(driving.on).toBe(true);
  expect(driving.rate).toBeGreaterThan(1.5);
  expect(driving.gear).toBe(2);

  // Hands closed: the car coasts to a stop and the engine settles to a quiet idle.
  await show(page, null, 'fist');
  await waitForHand(page, 'closed');
  await waitUntilStopped(page);
  await page.waitForTimeout(1500);
  const idling = await engineState(page);
  const idleSound = await listen(page);
  console.log('idling', JSON.stringify(idling), JSON.stringify(idleSound));
  expect(idling.rate).toBeLessThan(0.75);
  expect(idling.level).toBeLessThan(driving.level);
  expect(idling.tone).toBeLessThan(driving.tone);
  expect(idling.road).toBeLessThan(0.01);
  expect(idleSound.rms).toBeGreaterThan(0.001);
  expect(idleSound.rms).toBeLessThan(drivingSound.rms);

  // Opening the hands revs the engine right away, as the reward for opening them.
  await show(page, null, 'open');
  await waitForHand(page, 'open');
  await expect.poll(async () => (await engineState(page)).rate, { timeout: 5_000 }).toBeGreaterThan(0.82);
});

test('nothing clips, with the car, stars and voice all playing at once', async ({ page }) => {
  await openGame(page, { voice: true, sound: true, steering: 'auto' });
  await show(page, null, 'open');
  await reachRace(page);
  await tapOutput(page);
  await waitUntilMoving(page);

  // Long enough to pass all the rivals and collect a row of stars.
  const { peak, rms } = await listen(page, 9);
  console.log('full mix', JSON.stringify({ peak, rms }), 'stars', (await car(page)).stars);
  expect((await car(page)).stars).toBeGreaterThan(0);
  expect(peak).toBeLessThanOrEqual(1);
  expect(rms).toBeGreaterThan(0.01);
});

test('the car drops back while the voice is speaking', async ({ page }) => {
  await openGame(page, { voice: true, sound: true });
  await show(page, null, 'open');
  await reachRace(page);
  await waitForHand(page, 'open');
  await waitUntilMoving(page);
  await page.waitForTimeout(3000);

  await page.evaluate(() => {
    window.__game.sound.stopVoice();
    window.__game.sound.say('You did it! Great racing!');
  });
  await expect.poll(async () => (await engineState(page)).carBus, { timeout: 2_000 }).toBeLessThan(0.35);
  await expect.poll(async () => (await engineState(page)).carBus, { timeout: 6_000 }).toBeGreaterThan(0.6);
});

test('turning sound off silences the car and effects but keeps the voice', async ({ page }) => {
  await openGame(page, { voice: true, sound: false });
  await show(page, null, 'open');
  await reachRace(page);
  await tapOutput(page);
  await waitUntilMoving(page);
  await page.waitForTimeout(1000);

  const state = await page.evaluate(() => {
    const { sound } = window.__game;
    return { car: sound.backgroundBus.gain.value, effects: sound.effectsBus.gain.value, speaks: sound.say('Great job!') };
  });
  expect(state).toEqual({ car: 0, effects: 0, speaks: true });
  const { peak } = await listen(page, 0.4);
  expect(peak).toBeGreaterThan(0.01);
});

test('opening the panel silences everything and closing it brings it back', async ({ page }) => {
  await openGame(page, { voice: false, sound: true });
  await show(page, null, 'open');
  await reachRace(page);
  await tapOutput(page);
  await waitUntilMoving(page);
  await page.waitForTimeout(800);
  expect((await listen(page, 0.3)).rms).toBeGreaterThan(0.005);

  await page.locator('#open-panel').click();
  await page.waitForTimeout(400);
  expect((await listen(page, 0.3)).rms).toBeLessThan(0.001);

  await page.locator('#close-panel').click();
  await page.waitForTimeout(600);
  expect((await listen(page, 0.3)).rms).toBeGreaterThan(0.005);
});

test('the engine stops at the finish and the celebration plays', async ({ page }) => {
  await openGame(page, { voice: true, sound: true, steering: 'auto' });
  await show(page, null, 'open');
  await reachRace(page);
  await tapOutput(page);
  await waitUntilMoving(page);

  // Jumps to the end of the race, so this doesn't take a full minute of driving.
  await page.evaluate(() => {
    const { race } = window.__game;
    race.distance = race.raceDistance - 5;
    for (const rival of race.rivals) rival.distance = Math.min(rival.distance, race.raceDistance - 30);
  });
  await waitForScreen(page, 'finish');
  expect((await engineState(page)).on).toBe(false);
  const celebrating = await listen(page, 1);
  expect(celebrating.rms).toBeGreaterThan(0.01);
  await expect.poll(() => page.evaluate(() => window.__game.sound.currentVoice?.source.buffer.duration ?? 0), { timeout: 3000 }).toBeGreaterThan(1);
});

test('a high five, a bump and turbo each have their real sound, nothing clips, and no line gets cut off', async ({ page }) => {
  test.setTimeout(120_000);
  await openGame(page, { voice: true, sound: true, steering: 'auto' });
  await show(page, null, 'open');
  await reachRace(page);
  await tapOutput(page);
  await page.evaluate(() => {
    const { sound } = window.__game;
    window.__played = [];
    window.__cutOff = 0;
    const realPlay = sound.play.bind(sound);
    sound.play = (name, options) => {
      window.__played.push(name);
      realPlay(name, options);
    };
    const realStop = sound.stopVoice.bind(sound);
    sound.stopVoice = () => {
      if (sound.currentVoice) window.__cutOff += 1;
      realStop();
    };
    window.__peak = 0;
    const samples = new Float32Array(window.__tap.fftSize);
    setInterval(() => {
      window.__tap.getFloatTimeDomainData(samples);
      for (const sample of samples) window.__peak = Math.max(window.__peak, Math.abs(sample));
    }, 20);
  });
  await expect.poll(() => page.evaluate(() => window.__game.race.fives), { timeout: 45_000 }).toBeGreaterThan(2);
  await page.evaluate(() => {
    const { race } = window.__game;
    const rival = race.rivals[0];
    rival.distance = race.distance + 8;
    rival.lateral = race.lateral;
    rival.speed = 5;
  });
  await expect.poll(() => page.evaluate(() => window.__played.includes('bump')), { timeout: 10_000 }).toBe(true);
  const heard = await page.evaluate(() => ({ played: window.__played, peak: window.__peak, cutOff: window.__cutOff, turbo: window.__game.race.turbo.everFull }));
  console.log('with high fives, peak', heard.peak);
  for (const name of ['slap', 'sparkle', 'rush', 'bump']) expect(heard.played).toContain(name);
  expect(heard.turbo).toBe(true);
  expect(heard.peak).toBeGreaterThan(0.05);
  expect(heard.peak).toBeLessThanOrEqual(1);
  expect(heard.cutOff).toBe(0);
});
