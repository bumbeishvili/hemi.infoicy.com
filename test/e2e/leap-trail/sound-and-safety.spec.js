// How Leap Trail sounds, what it sends where, and what it does when things go wrong.
import { expect, shot, test, waitForScreen } from '../helpers.js';
import { bodyDoes, footage, nextObstacleIs, openTrail, reachRun, runState, standInView, toChoosing } from './helpers.js';

for (const language of ['en', 'ka']) {
  test(`every sound and every voice line loads and decodes, in ${language}`, async ({ page }) => {
    await openTrail(page, { voice: true, sound: true, language });
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
    // The last four are other games' recordings, played for trampolines, power-ups, chests and the bubble.
    for (const name of ['step1', 'step2', 'step3', 'jump', 'land', 'slide', 'bump', 'music', 'boing', 'sparkle', 'unlock', 'bubble']) {
      expect(loaded.sounds[name], name).toBeGreaterThan(0.05);
    }
  });
}

test('music plays during a run and stops at the end, footsteps fall, and nothing clips', async ({ page }) => {
  test.setTimeout(180_000);
  await reachRun(page, { voice: true, sound: true, obstacles: 10, trailPace: 'fast' });
  await page.evaluate(() => {
    const { sound } = window.__game;
    window.__tap = sound.context.createAnalyser();
    window.__tap.fftSize = 2048;
    sound.output.connect(window.__tap);
    window.__peak = 0;
    window.__steps = 0;
    const samples = new Float32Array(2048);
    setInterval(() => {
      window.__tap.getFloatTimeDomainData(samples);
      for (const sample of samples) window.__peak = Math.max(window.__peak, Math.abs(sample));
    }, 20);
    const step = sound.step.bind(sound);
    sound.step = () => {
      window.__steps += 1;
      step();
    };
    const { run } = window.__game;
    setInterval(() => {
      const next = run.next;
      if (run.state !== 'running' || !next || !run.inReach(next) || next.state !== 'ahead') return;
      run.jump();
    }, 60);
  });
  expect(await page.evaluate(() => Boolean(window.__game.sound.music))).toBe(true);
  await waitForScreen(page, 'finishing');
  const { peak, steps } = await page.evaluate(() => ({ peak: window.__peak, steps: window.__steps }));
  console.log('trail mix', { peak, steps });
  expect(peak).toBeGreaterThan(0.05);
  expect(peak).toBeLessThanOrEqual(1);
  expect(steps).toBeGreaterThan(10);
  expect(await page.evaluate(() => Boolean(window.__game.sound.music))).toBe(false);
});

test('the panel silences everything, and closing it brings it back', async ({ page }) => {
  await reachRun(page, { voice: false, sound: true });
  await page.locator('#open-panel').click();
  await expect.poll(() => page.evaluate(() => window.__game.sound.master.gain.value), { timeout: 3000 }).toBeLessThan(0.02);
  await page.locator('#close-panel').click();
  await expect.poll(() => page.evaluate(() => window.__game.sound.master.gain.value), { timeout: 3000 }).toBeGreaterThan(0.8);
});

test('choosing a runner speaks in that character\'s voice', async ({ page }) => {
  await openTrail(page, { voice: true, sound: true });
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
});

test('Georgian: what the coach asks for changes language', async ({ page }) => {
  await reachRun(page, { language: 'ka' });
  await nextObstacleIs(page, 'log', 9);
  await expect(page.locator('#coach-text')).toHaveText('ახტი!', { timeout: 10_000 });
  await shot(page, 't17-georgian');
});

test('the game makes no requests off this computer, and the page refuses to', async ({ page, baseURL, pageErrors }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await reachRun(page);
  await footage(page, 'strikes', { from: 1 });
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
  await expect.poll(() => pageErrors.join('\n')).toContain("violates the following Content Security Policy directive: \"connect-src 'self'");
  pageErrors.length = 0;
});

test('a camera that isn\'t allowed explains itself and can be tried again', async ({ page }) => {
  await openTrail(page);
  await standInView(page);
  await page.evaluate(() => {
    window.__camera.failWith = 'NotAllowedError';
  });
  await toChoosing(page);
  await page.locator('#run-start').click();
  await waitForScreen(page, 'problem');
  await expect(page.locator('#problem-title')).toHaveText('Can we use your camera?');
  await page.evaluate(() => {
    window.__camera.failWith = null;
  });
  await page.locator('#problem-retry').click();
  await waitForScreen(page, 'bodycheck');
});

test('nothing flashes: the picture\'s brightness stays steady through jumps and landings', async ({ page }) => {
  await reachRun(page);
  await nextObstacleIs(page, 'hay', 9);
  await expect.poll(async () => (await runState(page)).next?.inReach, { timeout: 8000 }).toBe(true);
  await bodyDoes(page);
  const brightness = await page.evaluate(async () => {
    const { world } = window.__game;
    const reading = [];
    const small = document.createElement('canvas');
    small.width = 32;
    small.height = 18;
    const context = small.getContext('2d', { willReadFrequently: true });
    for (let i = 0; i < 50; i += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      world.render();
      context.drawImage(world.renderer.domElement, 0, 0, 32, 18);
      const { data } = context.getImageData(0, 0, 32, 18);
      let total = 0;
      for (let j = 0; j < data.length; j += 4) total += (data[j] + data[j + 1] + data[j + 2]) / 3;
      reading.push(total / (32 * 18));
    }
    return reading;
  });
  const biggestStep = Math.max(...brightness.slice(1).map((value, index) => Math.abs(value - brightness[index])));
  console.log('biggest brightness step', biggestStep);
  expect(biggestStep).toBeLessThan(25);
});

test('nothing flashes moving across: the brightness stays steady as the runner changes lanes', async ({ page }) => {
  await reachRun(page, { onMissed: 'stumble' });
  await nextObstacleIs(page, 'log', 400);
  const brightness = await page.evaluate(async () => {
    const { world, game } = window.__game;
    let lane = 0;
    // Back and forth across all three lanes, as fast as a child could.
    game.readLane = () => {
      world.setLane(lane);
      return lane;
    };
    const reading = [];
    const small = document.createElement('canvas');
    small.width = 32;
    small.height = 18;
    const context = small.getContext('2d', { willReadFrequently: true });
    for (let i = 0; i < 120; i += 1) {
      lane = [0, 1, 0, -1][Math.floor(i / 15) % 4];
      await new Promise((resolve) => requestAnimationFrame(resolve));
      world.render();
      context.drawImage(world.renderer.domElement, 0, 0, 32, 18);
      const { data } = context.getImageData(0, 0, 32, 18);
      let total = 0;
      for (let j = 0; j < data.length; j += 4) total += (data[j] + data[j + 1] + data[j + 2]) / 3;
      reading.push(total / (32 * 18));
    }
    return reading;
  });
  const biggestStep = Math.max(...brightness.slice(1).map((value, index) => Math.abs(value - brightness[index])));
  console.log('biggest brightness step moving across', biggestStep);
  expect(biggestStep).toBeLessThan(25);
});

test('with reduced motion the run still works', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await reachRun(page);
  await nextObstacleIs(page, 'log', 9);
  await expect.poll(async () => (await runState(page)).next?.inReach, { timeout: 8000 }).toBe(true);
  await bodyDoes(page);
  await expect.poll(async () => (await runState(page)).stats.cleared, { timeout: 8000 }).toBe(1);
});

test('a slow computer gives up sharpness and then shadows, and keeps running', async ({ page }) => {
  await reachRun(page);
  const levels = await page.evaluate(() => {
    const { world } = window.__game;
    world.quality = 2;
    world.renderer.shadowMap.enabled = true;
    world.frames = 0;
    world.slowFrames = 0;
    const slowFor = () => {
      for (let i = 0; i < 90; i += 1) world.watchSpeed(0.05);
    };
    slowFor();
    const first = [world.quality, world.renderer.getPixelRatio(), world.renderer.shadowMap.enabled];
    slowFor();
    return [first, [world.quality, world.renderer.getPixelRatio(), world.renderer.shadowMap.enabled]];
  });
  expect(levels).toEqual([[1, 1, true], [0, 1, false]]);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__game.screen)).toBe('run');
});

test('the choosing screen fits smaller screens, with everything reachable', async ({ page }) => {
  for (const [width, height] of [[1024, 600], [820, 1180], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/games/leap-trail/index.html?debug');
    await expect(page.locator('body')).toHaveAttribute('data-ready', 'yes');
    await toChoosing(page);
    await page.waitForTimeout(200);
    await shot(page, `t18-choose-${width}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow, `${width}`).toBeLessThanOrEqual(0);
    for (const target of ['#run-start', '.fighter-card[data-fighter="tur"]']) {
      await page.locator(target).scrollIntoViewIfNeeded();
      await expect(page.locator(target), `${target} at ${width}`).toBeInViewport();
    }
  }
});
