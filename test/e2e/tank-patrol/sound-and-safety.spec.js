// How Tank Patrol sounds, how it looks at other sizes, and what happens when the camera or the computer
// lets things down.
import { expect, hands, shot, show, test, waitForScreen } from '../helpers.js';
import { biggestStep, brightnessThrough, handGone, handIs, noShells, oneTankAt, openPatrol, patrolIs, pointAt, startPatrol, stopPointing } from './helpers.js';

const SOUNDS = ['engine', 'birds', 'shot-1', 'shot-2', 'hit-1', 'hit-2', 'hit-3', 'lob', 'land', 'rattle', 'splutter', 'hop', 'music', 'sparkle', 'bump'];

for (const language of ['en', 'ka']) {
  test(`every sound and every voice line loads and decodes, in ${language}`, async ({ page }) => {
    await openPatrol(page, { voice: true, sound: true, language });
    await show(page, null, 'open', { scale: 0.7 });
    await page.locator('#start').click();
    await waitForScreen(page, 'check');
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
      expect(duration, text).toBeGreaterThan(0.15);
      expect(duration, text).toBeLessThan(6);
    }
    for (const name of SOUNDS) expect(loaded.sounds[name], name).toBeGreaterThan(0.05);
    expect(loaded.sounds.engine).toBeGreaterThan(3);
  });
}

test('the engine, birds and music play all through and stop at the end, nothing clips, and no line gets cut off', async ({ page }) => {
  test.setTimeout(240_000);
  await startPatrol(page, { voice: true, sound: true, tanks: 6, pace: 'fast', tankShells: 'medium' });
  await page.evaluate(() => {
    const { sound } = window.__game;
    window.__voicesCutOff = 0;
    const realStop = sound.stopVoice.bind(sound);
    sound.stopVoice = () => {
      if (sound.currentVoice) window.__voicesCutOff += 1;
      realStop();
    };
    window.__tap = sound.context.createAnalyser();
    window.__tap.fftSize = 2048;
    sound.output.connect(window.__tap);
    window.__peak = 0;
    const samples = new Float32Array(2048);
    window.__peaks = setInterval(() => {
      window.__tap.getFloatTimeDomainData(samples);
      for (const sample of samples) window.__peak = Math.max(window.__peak, Math.abs(sample));
    }, 20);
    window.__said = [];
    const realSay = sound.say.bind(sound);
    sound.say = (text, options) => {
      window.__said.push(text);
      return realSay(text, options);
    };
  });
  expect(await page.evaluate(() => [...window.__game.sound.loops.keys()].sort())).toEqual(['birds', 'engine', 'music']);

  // The engine picks up with driving.
  const engine = () => page.evaluate(() => window.__game.sound.loops.get('engine').source.playbackRate.value);
  // It's a short quick drive at this speed, so the highest it gets to is kept.
  await page.evaluate(() => {
    window.__topRate = 0;
    window.__rates = setInterval(() => {
      window.__topRate = Math.max(window.__topRate, window.__game.sound.loops.get('engine').source.playbackRate.value);
    }, 20);
  });
  await pointAt(page, { x: 3, z: 6 }, 'fist');
  await expect.poll(() => page.evaluate(() => window.__topRate), { timeout: 8000 }).toBeGreaterThan(1);
  await page.evaluate(() => clearInterval(window.__rates));
  await pointAt(page, { x: 3, z: 6 }, 'open');
  await expect.poll(engine, { timeout: 8000 }).toBeLessThan(0.9);
  await stopPointing(page);

  await page.evaluate(() => {
    window.__playing = setInterval(() => {
      const { patrol, field } = window.__game;
      const [target] = patrol.rolling;
      if (!target) return;
      const glove = field.gloves.right;
      const spot = field.project(target.x, target.y, target.z);
      if (glove.visible) {
        window.__ox = (window.__ox ?? 0) + ((spot.x - glove.x) / innerWidth) * 180;
        window.__oy = (window.__oy ?? 0) + ((spot.y - glove.y) / innerHeight) * 120;
      }
      window.__camera.show({ left: null, right: patrol.inRange(target) ? 'open' : 'fist', scale: 0.7, rightOffsetX: window.__ox ?? 0, rightOffsetY: window.__oy ?? 0 });
    }, 50);
  });
  await waitForScreen(page, 'finish');
  await page.evaluate(() => clearInterval(window.__playing));
  const peak = await page.evaluate(() => window.__peak);
  console.log('loudest moment of the mix', peak);
  expect(peak).toBeGreaterThan(0.05);
  expect(peak).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => window.__voicesCutOff)).toBe(0);
  expect(await page.evaluate(() => window.__game.sound.loops.size)).toBe(0);
  // Nothing that's more than a few words, and the last word comes just after the finish.
  await expect.poll(() => page.evaluate(() => window.__said), { timeout: 3000 }).toContain('You saved the valley!');
  const said = [...new Set(await page.evaluate(() => window.__said))];
  console.log('what was said', JSON.stringify(said));
  for (const line of said) expect(line.split(/\s+/).length, line).toBeLessThan(11);
});

test('Giraffe\'s lines are in his own voice, and Georgian changes what\'s on the screen and what\'s said', async ({ page }) => {
  await startPatrol(page, { language: 'ka' });
  await expect(page.locator('#story-line')).toHaveText('რობოტი ტანკები ჩემს ხეობაშია! გავაჩეროთ ისინი!', { timeout: 5000 });
  await expect(page.locator('#story-name')).toHaveText('ჟირაფი');
  await page.waitForTimeout(400);
  await shot(page, 'k23-georgian');
});

test('the game makes no requests off this computer, and the page refuses to', async ({ page, baseURL, pageErrors }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await startPatrol(page, { sound: true, voice: true });
  await page.waitForTimeout(1000);
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
  await openPatrol(page);
  await show(page, null, 'open', { scale: 0.7 });
  await page.evaluate(() => {
    window.__camera.failWith = 'NotAllowedError';
  });
  await page.locator('#start').click();
  await waitForScreen(page, 'problem');
  await expect(page.locator('#problem-title')).toHaveText('Can we use your camera?');
  await page.evaluate(() => {
    window.__camera.failWith = null;
  });
  await page.locator('#problem-retry').click();
  await waitForScreen(page, 'check');
});

test('a frozen tracker counts as no hand: it stops firing and driving, rather than carrying on', async ({ page }) => {
  await startPatrol(page);
  await oneTankAt(page, 12, -14, { hp: 200 });
  await pointAt(page, 'tank', 'open');
  await expect.poll(async () => (await patrolIs(page)).stats.shots, { timeout: 15_000 }).toBeGreaterThan(0);
  await stopPointing(page);
  await page.evaluate(() => {
    window.__game.camera.onResult = () => {};
    window.__game.camera.sendFrame = async () => {};
  });
  await handIs(page, 'none');
  await page.waitForTimeout(800);
  const { stats, firing } = await patrolIs(page);
  expect(firing).toBe(false);
  await page.waitForTimeout(1000);
  expect((await patrolIs(page)).stats.shots).toBe(stats.shots);
});

// The same at level 10, where there's the most going on at once: see levelPlan in patrol.js.
for (const level of [1, 10]) {
  const levels = level === 1 ? {} : { levels: { 'tank-patrol': level } };
  const atLevel = level === 1 ? '' : ` at level ${level}`;

  test(`nothing flashes${atLevel}: the picture's brightness stays steady through firing, stopping a tank and shells landing`, async ({ page }) => {
    test.setTimeout(120_000);
    await startPatrol(page, { tankShells: 'tough', ...levels });
    const { x, z } = await oneTankAt(page, 10, -13, { hp: 12 });
    await pointAt(page, 'tank', 'open');
    await expect.poll(async () => (await patrolIs(page)).firing, { timeout: 15_000 }).toBe(true);
    const firing = await brightnessThrough(page, 90);
    console.log(`level ${level}: biggest brightness step while firing`, biggestStep(firing));
    expect(biggestStep(firing)).toBeLessThan(6);
    expect((await patrolIs(page)).stats.shots).toBeGreaterThan(1);

    // Right as it's stopped, with its smoke, its bolts and its stars.
    const stopping = page.evaluate(() => {
      const enemy = window.__enemy;
      enemy.hp = 1;
    }).then(() => brightnessThrough(page, 150));
    const stopped = await stopping;
    console.log(`level ${level}: biggest brightness step as a tank stops`, biggestStep(stopped));
    expect(biggestStep(stopped)).toBeLessThan(6);
    expect((await patrolIs(page)).stopped).toBe(1);

    // A shell landing right on the tank.
    await stopPointing(page);
    await page.evaluate(([tx, tz]) => {
      const { patrol } = window.__game;
      const { tank } = patrol;
      patrol.shells.push({ id: -1, share: 0.75, seconds: 1, blast: 5, from: { x: tx, y: 6, z: tz }, to: { x: tank.x, y: tank.y, z: tank.z } });
    }, [x, z]);
    const landing = await brightnessThrough(page, 90);
    console.log(`level ${level}: biggest brightness step as a shell lands`, biggestStep(landing));
    expect(biggestStep(landing)).toBeLessThan(6);
    // And there's nothing like a big white circle where the gun is.
    const overall = Math.max(...landing) - Math.min(...landing);
    expect(overall).toBeLessThan(12);
  });
}

test('with reduced motion it all still works, with less going on and nothing bobbing about', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startPatrol(page);
  expect(await page.evaluate(() => window.__game.field.reducedMotion)).toBe(true);
  await oneTankAt(page, 12, -14);
  await pointAt(page, 'tank', 'open');
  await expect.poll(async () => (await patrolIs(page)).stats.shots, { timeout: 15_000 }).toBeGreaterThan(1);
  const spinning = await page.evaluate(async () => {
    const { marks } = window.__game.field;
    const before = marks.spin;
    await new Promise((resolve) => setTimeout(resolve, 300));
    return marks.spin - before;
  });
  expect(spinning).toBe(0);
  const film = await page.evaluate(() => getComputedStyle(document.querySelector('.film-tank')).animationDuration);
  expect(film).toBe('13.5s');
  await expect.poll(async () => (await patrolIs(page)).stopped, { timeout: 30_000 }).toBe(1);
  await stopPointing(page);
});

test('a slow computer gives up sharpness and then some of the trees, and keeps going', async ({ page }) => {
  await startPatrol(page);
  const level = await page.evaluate(() => {
    const { field } = window.__game;
    const trees = field.valley.manyOf[0].count;
    field.quality = 2;
    field.frames = 0;
    field.slowFrames = 0;
    for (let i = 0; i < 90; i += 1) field.watchSpeed(0.05);
    const first = [field.quality, field.renderer.getPixelRatio(), field.marks.ratio];
    for (let i = 0; i < 90; i += 1) field.watchSpeed(0.05);
    return { first, second: field.quality, fewer: field.valley.manyOf[0].count < trees };
  });
  expect(level).toEqual({ first: [1, 1, 1], second: 0, fewer: true });
  expect(await page.evaluate(() => window.__game.screen)).toBe('playing');
});

// The same at level 10, where there's the most going on at once: see levelPlan in patrol.js.
for (const level of [1, 10]) {
  const levels = level === 1 ? {} : { levels: { 'tank-patrol': level } };
  const atLevel = level === 1 ? '' : ` at level ${level}`;

  test(`it keeps up${atLevel}: at least about 30 frames a second with the real tracker running and everything going on`, async ({ page }) => {
    test.setTimeout(120_000);
    await startPatrol(page, { pace: 'fast', tanks: 15, ...levels });
    await oneTankAt(page, 12, -14, { hp: 50 }).catch(() => {});
    await page.evaluate(() => {
      const { patrol } = window.__game;
      patrol.queue = ['scout', 'basher', 'heavy', 'scout'];
      patrol.total = 8;
      patrol.lobIn = 0;
    });
    await pointAt(page, 'tank', 'open');
    await expect.poll(async () => (await patrolIs(page)).firing, { timeout: 15_000 }).toBe(true);
    const measured = await page.evaluate(() => new Promise((done) => {
      const { field } = window.__game;
      const gaps = [];
      let last = performance.now();
      const tick = (now) => {
        gaps.push(now - last);
        last = now;
        if (gaps.length < 240) requestAnimationFrame(tick);
        else {
          const sorted = [...gaps].sort((a, b) => a - b);
          done({
            fps: 1000 / (gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length),
            slowest: sorted[Math.floor(sorted.length * 0.95)],
            quality: field.quality,
            calls: field.renderer.info.render.calls,
            triangles: field.renderer.info.render.triangles,
          });
        }
      };
      requestAnimationFrame(tick);
    }));
    console.log(`level ${level}: frame rate`, JSON.stringify(measured));
    expect(measured.fps).toBeGreaterThan(28);
    await stopPointing(page);
  });
}

const SIZES = [[1280, 720], [1920, 1080], [1024, 768], [1024, 600], [820, 1180], [390, 844]];

test('the whole of the valley fits the window at every size, with the fort and the tank in view', async ({ page }) => {
  await openPatrol(page);
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(120);
    const corners = await page.evaluate(async () => {
      const { PLAY } = await import('/games/tank-patrol/valley-map.js');
      const { field } = window.__game;
      return [[PLAY.left, PLAY.far], [PLAY.right, PLAY.far], [PLAY.left, PLAY.near], [PLAY.right, PLAY.near]].map(([x, z]) => field.project(x, 0, z));
    });
    for (const { x, y } of corners) {
      expect(x, `${width}x${height}`).toBeGreaterThanOrEqual(-1);
      expect(x, `${width}x${height}`).toBeLessThanOrEqual(width + 1);
      expect(y, `${width}x${height}`).toBeGreaterThanOrEqual(-1);
      expect(y, `${width}x${height}`).toBeLessThanOrEqual(height + 1);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow, `${width}`).toBeLessThanOrEqual(0);
    await page.locator('#start').scrollIntoViewIfNeeded();
    await expect(page.locator('#start'), `${width}`).toBeInViewport();
    await shot(page, `k24-title-${width}`);
  }
});

test('the screen\'s corner to corner: a hand anywhere on screen gives a place on the ground in the play area', async ({ page }) => {
  await startPatrol(page);
  await handGone(page);
  const places = await page.evaluate(async () => {
    const { PLAY, clampToPlay } = await import('/games/tank-patrol/valley-map.js');
    const { field } = window.__game;
    const out = [];
    for (let x = 0; x <= 1; x += 0.25) {
      for (let y = 0; y <= 1; y += 0.25) {
        const at = field.groundAt(x * innerWidth, y * innerHeight);
        const place = clampToPlay(at.x, at.z);
        out.push({ ok: Number.isFinite(place.x) && Number.isFinite(place.z) && place.x >= PLAY.left && place.x <= PLAY.right && place.z >= PLAY.far && place.z <= PLAY.near });
      }
    }
    return out;
  });
  for (const { ok } of places) expect(ok).toBe(true);
  // What the hand points at really is what the crosshair ends up on.
  await pointAt(page, { x: -10, z: 12 }, 'open');
  await expect.poll(() => page.evaluate(() => {
    const { crosshair, pointer } = window.__game.patrol;
    return pointer ? Math.hypot(crosshair.x + 10, crosshair.z - 12) : 99;
  }), { timeout: 15_000 }).toBeLessThan(3);
  await stopPointing(page);
  await noShells(page);
  await page.waitForTimeout(100);
  expect((await hands(page)).right.status).toBe('open');
});
