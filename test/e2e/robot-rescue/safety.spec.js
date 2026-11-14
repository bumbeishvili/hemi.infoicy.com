// How Robot Rescue sounds, and what happens when something lets it down. Nothing here may flash.
import { readFileSync } from 'node:fs';
import { expect, shot, show, test, waitForHand, waitForScreen } from '../helpers.js';
import { FIST, GAME, OPEN, clearHere, expectSoon, judge, reachRescue, rescue, startHunting, stayAwake, stopHunting, watchBrightness } from './helpers.js';
import { openGame } from '../helpers.js';

const OWN_LINES = JSON.parse(readFileSync(new URL('../../../games/robot-rescue/audio/voice/lines.json', import.meta.url)));
const WANTED_SOUNDS = ['shot-1', 'shot-2', 'shot-3', 'hit-1', 'hit-2', 'hit-3', 'clatter-1', 'clatter-2', 'crash', 'gooThrow', 'gooSplat', 'gooPop', 'shieldHit', 'reload', 'empty', 'unlock', 'boing', 'bell', 'tram', 'gulls', 'music', 'shieldUp', 'sparkle', 'boom'];

for (const language of ['en', 'ka']) {
  test(`every sound and every voice line loads and decodes, in ${language}`, async ({ page }) => {
    test.setTimeout(150_000);
    await reachRescue(page, { voice: true, sound: true, language });
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
    const durations = new Map(loaded.clips);
    for (const { text } of OWN_LINES) {
      const duration = durations.get(text);
      expect(duration, text).toBeGreaterThan(0.3);
      // Short enough that nobody's kept waiting.
      expect(duration, text).toBeLessThan(language === 'ka' ? 5 : 4);
    }
    for (const name of WANTED_SOUNDS) expect(loaded.sounds[name], name).toBeGreaterThan(0.05);
    expect(loaded.sounds.tram).toBeGreaterThan(3);
    expect(loaded.sounds.gulls).toBeGreaterThan(3);
  });
}

test('the sound of a game: loops run and stop, nothing clips, and no line gets cut off', async ({ page }) => {
  test.setTimeout(420_000);
  await reachRescue(page, { voice: true, sound: true, stops: 3, pace: 'fast', reach: 'lots' });
  await page.evaluate(() => {
    const { sound } = window.__game;
    window.__voicesCutOff = 0;
    const realStop = sound.stopVoice.bind(sound);
    sound.stopVoice = () => {
      if (sound.currentVoice) window.__voicesCutOff += 1;
      realStop();
    };
    window.__played = {};
    const realPlay = sound.play.bind(sound);
    sound.play = (name, options) => {
      window.__played[name] = (window.__played[name] ?? 0) + 1;
      return realPlay(name, options);
    };
    window.__said = [];
    const realSay = sound.say.bind(sound);
    sound.say = (text, options) => {
      const will = realSay(text, options);
      if (will) window.__said.push(text);
      return will;
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
  expect(await page.evaluate(() => [...window.__game.sound.loops.keys()].sort())).toEqual(['gulls', 'music', 'tram']);
  await startHunting(page);
  await page.evaluate(() => {
    window.__game.mission.holdThrows = 0;
  });
  await waitForScreen(page, 'finish');
  await stopHunting(page);
  const { peak, cutOff, loops, played, said } = await page.evaluate(() => ({
    peak: window.__peak,
    cutOff: window.__voicesCutOff,
    loops: window.__game.sound.loops.size,
    played: window.__played,
    said: window.__said,
  }));
  console.log('peak', peak, 'played', JSON.stringify(played), 'said', JSON.stringify(said));
  expect(peak).toBeGreaterThan(0.05);
  expect(peak).toBeLessThanOrEqual(1);
  expect(cutOff).toBe(0);
  expect(loops).toBe(0);
  expect(played['shot-1'] + played['shot-2'] + played['shot-3']).toBeGreaterThan(10);
  expect(played.reload).toBeGreaterThan(0);
  expect(played.unlock).toBeGreaterThan(1);
  expect(played.bell).toBeGreaterThan(0);
  expect(played.crash).toBe(1);
  // Little talk: nobody says the same thing over and over.
  expect(said.length).toBeLessThan(25);
});

test('the talk goes by while the game carries on: nothing waits for a line to finish', async ({ page }) => {
  test.setTimeout(150_000);
  await reachRescue(page, { voice: true, sound: true });
  await page.evaluate(() => window.__game.sound.ready);
  const before = await rescue(page);
  expect(before.phase).toBe('fighting');
  await page.waitForTimeout(300);
  await expect(page.locator('#story')).toHaveAttribute('data-who', 'giraffe');
  await expect(page.locator('#story-line')).toHaveText('Help! The robots caught all of us!');
  expect((await rescue(page)).phase).toBe('fighting');
  // Going by the game's own clock, the robots haven't stopped while Giraffe is speaking.
  const moved = await page.evaluate(async () => {
    const { mission } = window.__game;
    const from = mission.time;
    await new Promise((resolve) => setTimeout(resolve, 500));
    return mission.time - from;
  });
  expect(moved).toBeGreaterThan(0.2);
  await expect(page.locator('#story')).not.toHaveClass(/is-visible/, { timeout: 8000 });
});

test('Georgian: what\'s said and shown changes language', async ({ page }) => {
  test.setTimeout(150_000);
  await reachRescue(page, { language: 'ka' });
  await expect(page.locator('#story-line')).toHaveText('მიშველე! რობოტებმა ყველა დაგვიჭირეს!');
  await page.evaluate(() => {
    window.__game.mission.blaster.charge = 0;
  });
  await page.waitForTimeout(300);
  await expect(page.locator('#prompt-text')).toHaveText('მოკუმე ხელი, რომ დატენო!', { timeout: 15_000 });
  await shot(page, 'x-georgian');
});

test('the game makes no requests off this computer, and the page refuses to', async ({ page, baseURL, pageErrors }) => {
  test.setTimeout(150_000);
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await reachRescue(page);
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
  await openGame(page, {}, GAME);
  await show(page, ...OPEN);
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
  await waitForScreen(page, 'playing');
});

test('a frozen tracker counts as no hand: it stops firing, rather than going on and on', async ({ page }) => {
  test.setTimeout(150_000);
  await reachRescue(page, { reach: 'lots' });
  await startHunting(page);
  await expectSoon(async () => (await rescue(page)).firing).toBe(true);
  await stopHunting(page);
  await page.evaluate(() => {
    window.__game.camera.onResult = () => {};
    window.__game.camera.sendFrame = async () => {};
  });
  await expectSoon(async () => (await rescue(page)).seen, { timeout: 8000 }).toBe(false);
  await page.waitForTimeout(400);
  const before = await rescue(page);
  await page.waitForTimeout(1200);
  expect((await rescue(page)).stats.shots).toBe(before.stats.shots);
  expect(before.firing).toBe(false);
});

// The same at level 10, where there's the most going on at once: see levelPlan in rescue.js.
for (const level of [1, 10]) {
  const levels = level === 1 ? {} : { levels: { [GAME]: level } };
  const atLevel = level === 1 ? '' : ` at level ${level}`;

  test(`nothing flashes${atLevel}: the brightness stays steady through firing, falling apart and freeing`, async ({ page }) => {
    test.setTimeout(240_000);
    await reachRescue(page, { reach: 'lots', pace: 'fast', ...levels });
    await startHunting(page);
    await expectSoon(async () => (await rescue(page)).firing).toBe(true);
    const result = judge(await watchBrightness(page, 240));
    console.log(`level ${level}`, 'firing and falling apart', JSON.stringify(result));
    expect(result.biggestStep).toBeLessThan(6);
    expect(result.flickeringShare).toBeLessThan(0.02);
    await stopHunting(page);
  });

  test(`nothing flashes${atLevel}: a hand opening and closing as fast as it can doesn't flicker the shield`, async ({ page }) => {
    test.setTimeout(240_000);
    await reachRescue(page, levels);
    await waitForHand(page, 'open');
    // Quicker than any child, and quicker than the tracker can follow.
    await page.evaluate(() => {
      let open = true;
      window.__flip = setInterval(() => {
        open = !open;
        window.__camera.show({ left: null, right: open ? 'open' : 'fist', scale: 0.7 });
      }, 220);
    });
    const result = judge(await watchBrightness(page, 240));
    console.log(`level ${level}`, 'opening and closing', JSON.stringify(result));
    await page.evaluate(() => clearInterval(window.__flip));
    expect(result.biggestStep).toBeLessThan(6);
    expect(result.flickeringShare).toBeLessThan(0.05);
    // It really was being raised and lowered in that time.
    const shield = await page.evaluate(() => window.__game.stage.shieldLevel);
    expect(shield).toBeGreaterThanOrEqual(0);
  });

  test(`nothing flashes${atLevel}: the shield coming up, goo landing, and the tram moving off`, async ({ page }) => {
    test.setTimeout(240_000);
    await reachRescue(page, levels);
    await stayAwake(page);
    await page.evaluate(() => {
      const { mission } = window.__game;
      mission.holdThrows = 0;
      mission.level = { ...mission.level, throwEvery: 1.2, gooInAir: 3, gooSeconds: 1.6 };
      mission.throwIn = 0;
    });
    await show(page, ...FIST);
    await waitForHand(page, 'closed');
    const result = judge(await watchBrightness(page, 150));
    console.log(`level ${level}`, 'goo on the shield', JSON.stringify(result));
    expect(result.biggestStep).toBeLessThan(6);
    await clearHere(page);
    await show(page, ...OPEN);
    await expectSoon(async () => (await rescue(page)).phase).toBe('moving');
    const moving = judge(await watchBrightness(page, 90));
    console.log(`level ${level}`, 'the tram moving', JSON.stringify(moving));
    expect(moving.biggestStep).toBeLessThan(6);
    // A quarter of the picture is the most that can go on changing like this, by the usual measure.
    expect(moving.flickeringShare).toBeLessThan(0.25);
  });
}

test('with reduced motion, it all still works, with less going on', async ({ page }) => {
  test.setTimeout(240_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await reachRescue(page, { reach: 'lots', pace: 'fast' });
  expect(await page.evaluate(() => window.__game.stage.reducedMotion)).toBe(true);
  await startHunting(page);
  await expectSoon(async () => (await rescue(page)).stats.robots, { timeout: 60_000 }).toBeGreaterThan(0);
  await stopHunting(page);
  await shot(page, 'x-reduced-motion');
  const still = await page.evaluate(() => {
    const { stage } = window.__game;
    const before = stage.camera.position.y;
    return { spun: stage.sights.spin, before, panned: stage.panX };
  });
  expect(still.spun).toBe(0);
  expect(still.panned).toBe(0);
  const film = await page.locator('.film-hand').evaluate((node) => getComputedStyle(node).animationDuration);
  expect(film).toBe('12s');
});

test('a slow computer gives up sharpness, and keeps going', async ({ page }) => {
  test.setTimeout(150_000);
  await reachRescue(page);
  const level = await page.evaluate(() => {
    const { stage } = window.__game;
    stage.quality = 1;
    stage.frames = 0;
    stage.slowFrames = 0;
    for (let i = 0; i < 90; i += 1) stage.watchSpeed(0.05);
    return [stage.quality, stage.renderer.getPixelRatio()];
  });
  expect(level).toEqual([0, 1]);
  expect(await page.evaluate(() => window.__game.screen)).toBe('playing');
});

test('it fits smaller screens, with everything that matters in view', async ({ page }) => {
  test.setTimeout(240_000);
  await reachRescue(page);
  for (const [width, height] of [[1024, 600], [820, 1180], [390, 844], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(500);
    await shot(page, `x-screen-${width}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow, `${width}`).toBeLessThanOrEqual(0);
    for (const target of ['#chip-friends', '#chip-hearts', '#meter-right', '#open-panel']) {
      await expect(page.locator(target), `${target} at ${width}`).toBeInViewport();
    }
    const fitted = await page.evaluate(() => {
      const { stage } = window.__game;
      return { sights: stage.sights.canvas.clientWidth, game: stage.canvas.clientWidth };
    });
    expect(fitted.sights).toBe(width);
    expect(fitted.game).toBe(width);
  }
});

test('nothing flashes on Medium at level 10 as the goo gets through, heart after heart, and stops the tram', async ({ page }) => {
  test.setTimeout(240_000);
  await reachRescue(page, { rescueGoo: 'medium', levels: { [GAME]: 10 } });
  await stayAwake(page);
  await waitForHand(page, 'open');
  // Goo as thick and fast as level 10 on Medium makes it, and an open hand that never raises the shield.
  await page.evaluate(() => {
    const { mission } = window.__game;
    mission.holdThrows = 0;
    mission.throwIn = 0;
    mission.level = { ...mission.level, throwEvery: 0.8 };
  });
  const result = judge(await watchBrightness(page, 240));
  console.log('medium level 10 goo getting through', JSON.stringify(result));
  expect(result.biggestStep).toBeLessThan(6);
  expect(result.flickeringShare).toBeLessThan(0.05);
  expect((await rescue(page)).stats.gooHits).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.__game.screen), { timeout: 60_000 }).toBe('finish');
  await expect(page.locator('#screen-finish h2')).toHaveText('The goo stopped the tram!');
});
