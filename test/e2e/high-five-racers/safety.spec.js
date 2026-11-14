// Seizures are more common in children with hemiplegia, so nothing may flash or flicker, whatever's
// going on. These read the picture itself, frame by frame, the same way as Sky Wings' test does.
import { expect, openGame, reachRace, shot, show, test, waitForHand, waitUntilMoving } from './helpers.js';

async function raceWithOpenHand(page, settings = {}) {
  await openGame(page, settings);
  await show(page, null, 'open');
  await reachRace(page);
  await waitForHand(page, 'open');
  await waitUntilMoving(page);
}

/** Reads how bright the whole picture is, and each part of it, for a number of frames. */
function watchPicture(page, frames, during = null) {
  return page.evaluate(async ([count, code]) => {
    const { race } = window.__game;
    const small = document.createElement('canvas');
    const across = 16;
    const down = 9;
    small.width = across;
    small.height = down;
    const context = small.getContext('2d', { willReadFrequently: true });
    const whole = [];
    const parts = Array.from({ length: across * down }, () => []);
    const distance = [];
    const started = performance.now();
    const step = code ? new Function('race', 'frame', code) : null;
    for (let frame = 0; frame < count; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (step?.(race, frame)) break;
      race.render();
      context.drawImage(race.renderer.domElement, 0, 0, across, down);
      const { data } = context.getImageData(0, 0, across, down);
      let total = 0;
      for (let cell = 0; cell < across * down; cell += 1) {
        const value = (data[cell * 4] + data[cell * 4 + 1] + data[cell * 4 + 2]) / 3;
        total += value;
        parts[cell].push(value);
      }
      whole.push(total / (across * down));
      distance.push(race.distance % race.track.length);
    }
    return { whole, parts, distance, seconds: (performance.now() - started) / 1000 };
  }, [frames, during]);
}

const biggestStep = (values) => Math.max(...values.slice(1).map((value, index) => Math.abs(value - values[index])));

/**
 * The way flashes are usually counted: a quarter or more of the picture getting brighter or darker by
 * a tenth of the range, all together, and then the opposite. Returns the most in any one second.
 */
function mostFlashesInASecond(parts, seconds) {
  const frames = parts[0].length;
  const perSecond = frames / seconds;
  const span = Math.max(2, Math.round(perSecond * 0.1));
  const turns = [];
  let direction = 0;
  for (let frame = span; frame < frames; frame += 1) {
    let brighter = 0;
    let darker = 0;
    for (const values of parts) {
      const change = values[frame] - values[frame - span];
      if (change >= 25.5) brighter += 1;
      else if (change <= -25.5) darker += 1;
    }
    const now = brighter >= parts.length / 4 ? 1 : darker >= parts.length / 4 ? -1 : 0;
    if (now && now !== direction) {
      direction = now;
      turns.push(frame);
    }
  }
  let most = 0;
  turns.forEach((from, index) => {
    const within = turns.slice(index).filter((frame) => frame - from < perSecond).length;
    most = Math.max(most, Math.floor(within / 2));
  });
  return most;
}

/**
 * Like watchPicture, at a finer grain of 32 by 18 parts, and for each frame also how much of the picture the
 * giant high ten covers: it's drawn again without them, and what changes by a tenth of the range or more is
 * theirs. during is code run each frame, which stops it by returning true.
 */
function watchCloser(page, frames, during) {
  return page.evaluate(async ([count, code]) => {
    const { race } = window.__game;
    const W = 160;
    const H = 90;
    const CELL = 5;
    const small = document.createElement('canvas');
    small.width = W;
    small.height = H;
    const context = small.getContext('2d', { willReadFrequently: true });
    const grab = () => {
      race.render();
      context.drawImage(race.renderer.domElement, 0, 0, W, H);
      return context.getImageData(0, 0, W, H).data;
    };
    const bright = (data, i) => (data[i] + data[i + 1] + data[i + 2]) / 3;
    const step = new Function('race', 'frame', code);
    const palm = race.camera.position.clone();
    // Where the high ten stands, in metres along the race.
    const highTenAt = race.raceDistance - (race.track.length - race.highTen.along);
    const across = W / CELL;
    const parts = Array.from({ length: across * (H / CELL) }, () => []);
    const seen = [];
    const started = performance.now();
    for (let frame = 0; frame < count; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const stop = step(race, frame);
      const shown = race.highTen.root.visible;
      const picture = grab();
      let share = 0;
      if (shown) {
        race.highTen.root.visible = false;
        const without = grab();
        race.highTen.root.visible = true;
        let changed = 0;
        for (let i = 0; i < picture.length; i += 4) if (Math.abs(bright(picture, i) - bright(without, i)) >= 25.5) changed += 1;
        share = changed / (W * H);
        race.render();
      }
      parts.forEach((values, cell) => {
        const left = (cell % across) * CELL;
        const top = Math.floor(cell / across) * CELL;
        let total = 0;
        for (let y = top; y < top + CELL; y += 1) for (let x = left; x < left + CELL; x += 1) total += bright(picture, (y * W + x) * 4);
        values.push(total / (CELL * CELL));
      });
      // How near the lens the nearest of the gloves is.
      let near = Infinity;
      if (shown) for (const { hand } of race.highTen.hands) near = Math.min(near, hand.localToWorld(palm.set(0, 0.68, 0.272)).distanceTo(race.camera.position));
      seen.push({ share, shown, near, mode: race.mode, distance: race.distance, ahead: highTenAt - race.distance });
      if (stop) break;
    }
    return { seen, parts, across, seconds: (performance.now() - started) / 1000 };
  }, [frames, during]);
}

/** How bright the whole picture is, frame by frame, from its parts. */
const wholeOf = (parts) => parts[0].map((_, frame) => parts.reduce((total, values) => total + values[frame], 0) / parts.length);

/** The share of the parts that get brighter or darker by a tenth of the range from one frame to the next. */
const changedBetween = (parts, frame) => parts.filter((values) => Math.abs(values[frame] - values[frame - 1]) >= 25.5).length / parts.length;

// Each of these at level 1, at level 6, in the middle, and again at level 10, which has the most going on:
// more cars, big hands and ramps, the others using turbo, and everything new that the levels bring.
const levelSettings = (level) => (level === 1 ? {} : { levels: { 'high-five-racers': level } });
const atLevel = (level) => (level === 1 ? '' : `, at level ${level}`);

for (const level of [1, 6, 10]) {
  test(`the picture's brightness stays steady through high fives and turbo${atLevel(level)}`, async ({ page }) => {
    await raceWithOpenHand(page, { steering: 'auto', ...levelSettings(level) });
    // Right up to a big hand, with the hand wide open, so that a slap and turbo both happen.
    await page.evaluate(() => {
      const { race } = window.__game;
      const { gate } = race.gates.next(race.distance + 40);
      const lap = race.track.length * Math.max(0, race.lapIndex);
      race.distance = gate.along + lap - 45;
      race.lateral = gate.side * 4;
      race.snapCamera = true;
    });
    const fivesBefore = await page.evaluate(() => window.__game.race.fives);
    const { whole } = await watchPicture(page, 120);
    const step = biggestStep(whole);
    console.log(`level ${level}:`, 'biggest brightness step through a slap', step.toFixed(2));
    expect(step).toBeLessThan(15);
    expect(await page.evaluate(() => window.__game.race.fives)).toBeGreaterThan(fivesBefore);
    expect(await page.evaluate(() => window.__game.race.turbo.active)).toBe(true);
  });

  test(`going through the tunnel doesn't change how bright the picture is${atLevel(level)}`, async ({ page }) => {
    await raceWithOpenHand(page, { steering: 'help', ...levelSettings(level) });
    await page.evaluate(() => {
      const { race } = window.__game;
      const lap = race.track.length * Math.max(0, race.lapIndex);
      race.distance = 340 + lap - 50;
      race.snapCamera = true;
      for (const rival of race.rivals) rival.distance = race.distance - 200;
    });
    await page.waitForTimeout(150);
    // Long enough to go in and be well inside, at the speed the car's going.
    const { whole, parts, distance, seconds } = await watchPicture(page, 600, 'if (race.distance % race.track.length > 432) return true;');
    await shot(page, level === 1 ? 'r-tunnel-inside' : `high-five-racers-level${level}-tunnel`);
    const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
    // The camera is about 12 metres behind the car.
    const outside = mean(whole.filter((_, frame) => distance[frame] < 335));
    const inside = mean(whole.filter((_, frame) => distance[frame] > 362 && distance[frame] < 430));
    const step = biggestStep(whole);
    const flashes = mostFlashesInASecond(parts, seconds);
    console.log(`level ${level}:`, 'tunnel: outside', outside.toFixed(1), 'inside', inside.toFixed(1), 'biggest step', step.toFixed(2), 'most flashes in a second', flashes);
    expect(inside).toBeGreaterThan(0);
    expect(Math.abs(inside - outside)).toBeLessThan(15);
    expect(step).toBeLessThan(15);
    expect(flashes).toBeLessThanOrEqual(1);
  });

  test(`flying from the other hand's turbo doesn't change how bright the picture is${atLevel(level)}`, async ({ page }) => {
    await raceWithOpenHand(page, { steering: 'help', ...levelSettings(level) });
    await page.evaluate(() => {
      window.__highest = 0;
    });
    const { whole, parts, seconds } = await watchPicture(page, 300, `
      if (frame === 5) { race.turbo.burst(); race.takeOff(); }
      window.__highest = Math.max(window.__highest, race.lift);
    `);
    const highest = await page.evaluate(() => window.__highest);
    const step = biggestStep(whole);
    const flashes = mostFlashesInASecond(parts, seconds);
    console.log(`level ${level}:`, 'flight: highest', highest.toFixed(1), 'biggest step', step.toFixed(2), 'most flashes in a second', flashes);
    expect(highest).toBeGreaterThan(4);
    expect(step).toBeLessThan(15);
    expect(flashes).toBeLessThanOrEqual(1);
  });

  test(`a whole lap at full speed never flashes more than once in a second${atLevel(level)}`, async ({ page }) => {
    test.setTimeout(180_000);
    await raceWithOpenHand(page, { steering: 'auto', laps: 2, ...levelSettings(level) });
    const { whole, parts, seconds } = await watchPicture(page, 1500);
    const step = biggestStep(whole);
    const flashes = mostFlashesInASecond(parts, seconds);
    console.log(`level ${level}:`, 'lap: seconds', seconds.toFixed(1), 'biggest step', step.toFixed(2), 'most flashes in a second', flashes);
    expect(step).toBeLessThan(15);
    expect(flashes).toBeLessThanOrEqual(1);
  });

  test(`closing the hand doesn't change the brightness either${atLevel(level)}`, async ({ page }) => {
    await raceWithOpenHand(page, { steering: 'help', ...levelSettings(level) });
    const reading = watchPicture(page, 90);
    await show(page, null, 'fist');
    const { whole } = await reading;
    const step = biggestStep(whole);
    console.log(`level ${level}:`, 'braking step', step.toFixed(2));
    expect(step).toBeLessThan(15);
  });

  test(`with reduced motion there are no speed lines or moving flames, and it still all works${atLevel(level)}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await raceWithOpenHand(page, { steering: 'auto', ...levelSettings(level) });
    await expect.poll(() => page.evaluate(() => window.__game.race.fives), { timeout: 40_000 }).toBeGreaterThan(0);
    const state = await page.evaluate(() => {
      const { race } = window.__game;
      return {
        lines: race.speedLines.mesh.visible,
        time: race.world.time.value,
        animation: getComputedStyle(document.querySelector('#turbo .turbo-flame')).animationName,
        fov: race.camera.fov,
      };
    });
    expect(state.lines).toBe(false);
    expect(state.time).toBe(0);
    expect(state.animation).toBe('none');
    expect(state.fov).toBe(60);
    await shot(page, level === 1 ? 'r-reduced-motion' : `high-five-racers-level${level}-reduced-motion`);
  });

  test(`a slow computer drops the small things last of all, and keeps playing${atLevel(level)}`, async ({ page }) => {
    await raceWithOpenHand(page, levelSettings(level));
    const levels = await page.evaluate(() => {
      const { race } = window.__game;
      const slowFor = () => {
        race.quality.frames = 40;
        race.quality.seconds = 4;
        race.watchFrameRate(0);
      };
      const read = () => ({
        level: race.quality.level,
        sharp: race.renderer.getPixelRatio(),
        shadows: race.renderer.shadowMap.enabled,
        small: race.world.small.visible,
        medium: race.world.medium.visible,
        ink: race.player.inkLines.visible,
      });
      const seen = [];
      for (let i = 0; i < 6; i += 1) {
        slowFor();
        seen.push(read());
      }
      return seen;
    });
    expect(levels[0]).toMatchObject({ level: 1, sharp: 1, shadows: true, small: true, medium: true, ink: true });
    expect(levels[1]).toMatchObject({ level: 2, shadows: false, small: true, medium: true, ink: true });
    expect(levels[2]).toMatchObject({ level: 3, small: false, medium: true, ink: false });
    expect(levels[3]).toMatchObject({ level: 4, small: false, medium: false });
    // It stops there, and the race goes on.
    expect(levels[5].level).toBe(4);
    const { distance, speed } = await page.evaluate(() => ({ distance: window.__game.race.distance, speed: window.__game.race.speed }));
    expect(speed).toBeGreaterThan(5);
    await expect.poll(() => page.evaluate(() => window.__game.race.distance)).toBeGreaterThan(distance + 10);
    await shot(page, level === 1 ? 'r-lowest-quality' : `high-five-racers-level${level}-lowest-quality`);
  });
}

test('the sunset changes the colour of the picture, not how bright it is, as it comes on', async ({ page }) => {
  test.setTimeout(180_000);
  await raceWithOpenHand(page, { steering: 'auto', ...levelSettings(10) });
  // Far enough into the race that the whole sunset is wanted, so it comes on at its own pace from the day.
  await page.evaluate(() => {
    const { race } = window.__game;
    race.distance = 0.62 * race.raceDistance;
    race.snapCamera = true;
    race.weather.sunset = 0;
  });
  await page.waitForTimeout(200);
  const { whole, parts, seconds } = await watchPicture(page, 700);
  const sunset = await page.evaluate(() => window.__game.race.weather.sunset);
  const step = biggestStep(whole);
  const flashes = mostFlashesInASecond(parts, seconds);
  console.log('sunset: came to', sunset.toFixed(2), 'in', seconds.toFixed(1), 's, biggest step', step.toFixed(2), 'most flashes in a second', flashes);
  expect(sunset).toBeGreaterThan(0.6);
  expect(step).toBeLessThan(15);
  expect(flashes).toBeLessThanOrEqual(1);
});

test('the shower and the rainbow after it don\'t flash', async ({ page }) => {
  test.setTimeout(180_000);
  await raceWithOpenHand(page, { steering: 'auto', ...levelSettings(9) });
  await page.evaluate(() => {
    const { race } = window.__game;
    const lap = race.track.length * Math.max(0, race.lapIndex);
    race.distance = 500 + lap;
    race.snapCamera = true;
  });
  await page.waitForTimeout(200);
  const { whole, parts, seconds } = await watchPicture(page, 900, 'if (race.distance % race.track.length > 900) return true;');
  const weather = await page.evaluate(() => ({ rainbow: window.__game.race.weather.rainbow, took: window.__game.race.powers.has('rainbow') }));
  const step = biggestStep(whole);
  const flashes = mostFlashesInASecond(parts, seconds);
  console.log('shower: rainbow', weather.rainbow.toFixed(2), 'seconds', seconds.toFixed(1), 'biggest step', step.toFixed(2), 'most flashes in a second', flashes);
  expect(weather.rainbow).toBeGreaterThan(0.3);
  expect(step).toBeLessThan(15);
  expect(flashes).toBeLessThanOrEqual(1);
  await shot(page, 'high-five-racers-level9-after-the-shower');
});

test('power-ups, coins and the giant high ten at the finish don\'t flash', async ({ page }) => {
  await raceWithOpenHand(page, { steering: 'auto', laps: 1, ...levelSettings(10) });
  await page.evaluate(() => {
    const { race } = window.__game;
    race.distance = race.raceDistance - 150;
    race.snapCamera = true;
  });
  await page.waitForTimeout(200);
  // The bubble, the magnet and the rainbow all on at once, a big hand slapped and coins spilling.
  const { whole, parts, seconds } = await watchPicture(page, 400, `
    if (frame === 3) { race.powers.take('bubble'); race.powers.take('magnet'); race.powers.take('rainbow'); }
    if (frame === 6) race.coins.spill(race.player.group.position.clone().setY(race.player.group.position.y + 4), race.distance, race.lateral, 3);
    if (race.finished) return true;
  `);
  const done = await page.evaluate(() => ({ highTens: window.__game.race.prizes.highTens, coins: window.__game.race.coinTotal }));
  const step = biggestStep(whole);
  const flashes = mostFlashesInASecond(parts, seconds);
  console.log('power-ups and high ten:', JSON.stringify(done), 'biggest step', step.toFixed(2), 'most flashes in a second', flashes);
  expect(done.highTens).toBe(1);
  expect(step).toBeLessThan(15);
  expect(flashes).toBeLessThanOrEqual(1);
});

test('the giant high ten doesn\'t appear near the camera as the car crosses onto the last lap', async ({ page }) => {
  await raceWithOpenHand(page, { steering: 'auto', laps: 2, ...levelSettings(10) });
  // Near the edge of the road, where the gloves would be biggest, from before the line onto the last lap, across
  // it and on, at the car's own pace.
  await page.evaluate(() => {
    const { race } = window.__game;
    race.autoLane = () => 4.5;
    race.distance = race.track.length - 60;
    race.previousDistance = race.distance;
    race.lateral = 4.5;
    race.snapCamera = true;
    for (const rival of race.rivals) Object.assign(rival, { distance: race.distance - 150, wasAhead: false });
  });
  await page.waitForTimeout(200);
  const { seen, parts, seconds } = await watchCloser(page, 600, 'return race.distance > race.track.length + 40;');
  const most = Math.max(...seen.map(({ share }) => share));
  const changed = Math.max(...parts[0].slice(1).map((_, index) => changedBetween(parts, index + 1)));
  const flashes = mostFlashesInASecond(parts, seconds);
  console.log('onto the last lap: most of the picture the high ten covers', most.toFixed(4), 'most of the picture changing at once', changed.toFixed(3), 'flashes', flashes);
  expect(seen.at(-1).distance).toBeGreaterThan(await page.evaluate(() => window.__game.race.track.length + 40));
  expect(most).toBeLessThan(0.002);
  expect(flashes).toBeLessThanOrEqual(1);
});

test('the giant high ten fades in far ahead, and isn\'t left in the view of the finish', async ({ page }) => {
  await raceWithOpenHand(page, { steering: 'auto', laps: 1, ...levelSettings(10) });
  // A little before it starts to come, near the edge of the road, and on to the finish and a little after.
  await page.evaluate(() => {
    const { race } = window.__game;
    race.autoLane = () => 4.5;
    race.distance = race.raceDistance - 330;
    race.previousDistance = race.distance;
    race.lateral = 4.5;
    race.snapCamera = true;
    for (const rival of race.rivals) Object.assign(rival, { distance: race.distance - 150, wasAhead: false });
  });
  await page.waitForTimeout(200);
  const { seen, parts, seconds } = await watchCloser(page, 1500, `
    if (race.mode !== 'finished') return false;
    race.framesAfter = (race.framesAfter ?? 0) + 1;
    return race.framesAfter > 8;
  `);
  const first = seen.findIndex(({ share }) => share > 0);
  const finish = seen.findIndex(({ mode }) => mode === 'finished');
  const jumps = seen.slice(1, finish).map(({ share }, index) => share - seen[index].share);
  const racing = parts.map((values) => values.slice(0, finish));
  const whole = wholeOf(racing);
  const afterFinish = Math.max(...[1, 2, 3].map((frame) => changedBetween(parts, finish + frame)));
  const nearest = Math.min(...seen.slice(0, finish).map(({ near }) => near));
  const most = Math.max(...seen.slice(0, finish).map(({ share }) => share));
  console.log('high ten: first seen', seen[first]?.ahead.toFixed(0), 'm ahead, covering', seen[first]?.share.toFixed(4),
    'biggest jump', Math.max(...jumps).toFixed(3), 'at most covering', most.toFixed(3), 'nearest the lens', nearest.toFixed(1), 'm',
    'at the finish', seen[finish]?.share, 'after it', afterFinish.toFixed(3),
    'biggest step', biggestStep(whole).toFixed(2), 'flashes', mostFlashesInASecond(racing, seconds * (finish / seen.length)));
  // It comes far ahead, a few pixels at first, and grows as the car gets nearer.
  expect(first).toBeGreaterThan(0);
  expect(seen[first].ahead).toBeGreaterThan(200);
  expect(seen[first].share).toBeLessThan(0.005);
  expect(Math.max(...jumps)).toBeLessThan(0.15);
  // The gloves are big, so they're never near the lens, and never more than a little of the picture, as the
  // car goes through: at the finish the camera following the car is still well short of them. Going on past
  // them at speed, they'd sweep across a good part of the picture.
  // Standing 9 m before the line, they came to 7 m from it and covered 14% of the picture at the end, and the
  // finish then flashed now and then.
  expect(nearest).toBeGreaterThan(9);
  expect(most).toBeLessThan(0.12);
  // On the frame the race finishes, the view goes round to the finish, and the gloves aren't in it.
  expect(finish).toBeGreaterThan(first);
  expect(seen[finish].shown).toBe(false);
  expect(seen[finish].share).toBe(0);
  expect(afterFinish).toBeLessThan(0.2);
  expect(biggestStep(whole)).toBeLessThan(15);
  expect(mostFlashesInASecond(racing, seconds * (finish / seen.length))).toBeLessThanOrEqual(1);
});

/**
 * Each frame, the picture is drawn again without the rainbow trail's dots, and wherever that changes a part of
 * the picture by a tenth of the range or more, the trail lights it. Returns, for the part lit most often, how many
 * times a second it lights up, and how far in front of the camera any dot gets, along the way it's looking.
 */
function watchTrail(page, frames) {
  return page.evaluate(async (count) => {
    const { race } = window.__game;
    const { particles } = race;
    const W = 160;
    const H = 90;
    const CELL = 5;
    const small = document.createElement('canvas');
    small.width = W;
    small.height = H;
    const context = small.getContext('2d', { willReadFrequently: true });
    const grab = () => {
      race.render();
      context.drawImage(race.renderer.domElement, 0, 0, W, H);
      return context.getImageData(0, 0, W, H).data;
    };
    const bright = (data, i) => (data[i] + data[i + 1] + data[i + 2]) / 3;
    const alphas = particles.colours;
    const colour = particles.points.geometry.attributes.aColour;
    const forward = race.camera.position.clone();
    const cells = (W / CELL) * (H / CELL);
    const lit = new Array(cells).fill(false);
    const lightings = new Array(cells).fill(0);
    let nearest = Infinity;
    const started = race.time;
    for (let frame = 0; frame < count; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const slots = [...window.__trail.live.keys()].filter((slot) => particles.items[slot].life > 0);
      const camera = race.camera.position;
      race.camera.getWorldDirection(forward).setY(0).normalize();
      for (const slot of slots) {
        const at = particles.positions;
        nearest = Math.min(nearest, (at[slot * 3] - camera.x) * forward.x + (at[slot * 3 + 2] - camera.z) * forward.z);
      }
      const picture = grab();
      const saved = slots.map((slot) => [slot, alphas[slot * 4 + 3]]);
      for (const [slot] of saved) alphas[slot * 4 + 3] = 0;
      colour.needsUpdate = true;
      const without = grab();
      for (const [slot, alpha] of saved) alphas[slot * 4 + 3] = alpha;
      colour.needsUpdate = true;
      race.render();
      for (let cell = 0; cell < cells; cell += 1) {
        const left = (cell % (W / CELL)) * CELL;
        const top = Math.floor(cell / (W / CELL)) * CELL;
        let changed = 0;
        for (let y = top; y < top + CELL; y += 1) {
          for (let x = left; x < left + CELL; x += 1) {
            const i = (y * W + x) * 4;
            if (Math.abs(bright(picture, i) - bright(without, i)) >= 25.5) changed += 1;
          }
        }
        const now = changed >= (CELL * CELL) / 4;
        if (now && !lit[cell]) lightings[cell] += 1;
        lit[cell] = now;
      }
    }
    const seconds = race.time - started;
    return { mostLightings: Math.max(...lightings) / seconds, lit: lightings.filter(Boolean).length, nearest, seconds };
  }, frames);
}

test('the rainbow trail leaves a few little rainbows a second, gone before they reach the camera, and none at rest', async ({ page }) => {
  await raceWithOpenHand(page, { steering: 'auto', ...levelSettings(9) });
  // Down the middle of the road past the fair with the rainbow on, with no stars picked up, nothing in the air and
  // the other cars far behind.
  await page.evaluate(() => {
    const { race } = window.__game;
    race.autoLane = () => 0;
    race.stars.collect = () => {};
    race.emitAir = () => {};
    const lap = race.track.length * Math.max(0, race.lapIndex);
    race.distance = 1000 + lap;
    race.previousDistance = race.distance;
    race.lateral = 0;
    race.snapCamera = true;
    for (const rival of race.rivals) Object.assign(rival, { distance: race.distance - 250, wasAhead: false });
    race.powers.take('rainbow');
    // Each of the trail's dots: when each little rainbow was left, and which of them are still about.
    const colours = new Set(['#ff5a4f', '#ff9f45', '#ffd23f', '#3ddc84', '#5ccfff', '#a855f7']);
    const { particles } = race;
    const emit = particles.emit.bind(particles);
    window.__trail = { times: [], live: new Map() };
    particles.emit = (options) => {
      const slot = particles.next;
      if (options.shape === 'dot' && colours.has(options.colour)) {
        window.__trail.times.push(race.time);
        window.__trail.live.set(slot, race.time);
      } else {
        window.__trail.live.delete(slot);
      }
      emit(options);
    };
  });
  await page.waitForTimeout(300);
  const seen = await watchTrail(page, 150);
  const trail = await page.evaluate(() => {
    const { times } = window.__trail;
    return { dots: times.length, rows: new Set(times).size, from: times[0], to: times.at(-1) };
  });
  // By the race's own clock, from the first little rainbow to the last.
  const rowsASecond = (trail.rows - 1) / (trail.to - trail.from);
  console.log('rainbow trail:', JSON.stringify(trail), 'rows a second', rowsASecond.toFixed(2), 'in the picture', JSON.stringify(seen));
  expect(trail.rows).toBeGreaterThan(4);
  expect(rowsASecond).toBeLessThan(3);
  // Nothing streams past the camera: every dot is gone before it gets there. They used to go on 15 m past it.
  expect(seen.nearest).toBeGreaterThan(0);
  // No part of the picture is lit up by it three times a second or more.
  expect(seen.lit).toBeGreaterThan(0);
  expect(seen.mostLightings).toBeLessThan(3);

  // Resting: the car stops, and nothing more is left behind, with the rainbow still on and waiting.
  await show(page, null, 'fist');
  await expect.poll(() => page.evaluate(() => window.__game.race.speed)).toBe(0);
  const resting = await page.evaluate(async () => {
    const { race } = window.__game;
    const before = window.__trail.times.length;
    const left = race.powers.left.rainbow;
    const end = race.time + 2;
    while (race.time < end) await new Promise((resolve) => requestAnimationFrame(resolve));
    return { dots: window.__trail.times.length - before, kept: race.powers.left.rainbow === left };
  });
  expect(resting).toEqual({ dots: 0, kept: true });

  // On a slow computer that has dropped the small things, there's no trail at all.
  await show(page, null, 'open');
  await expect.poll(() => page.evaluate(() => window.__game.race.speed)).toBeGreaterThan(12);
  const slow = await page.evaluate(async () => {
    const { race } = window.__game;
    race.particles.budget = 0.3;
    const before = window.__trail.times.length;
    const end = race.time + 1.5;
    while (race.time < end) await new Promise((resolve) => requestAnimationFrame(resolve));
    return window.__trail.times.length - before;
  });
  expect(slow).toBe(0);
});

test('with reduced motion there\'s no rainbow trail', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await raceWithOpenHand(page, { steering: 'auto', ...levelSettings(9) });
  const dots = await page.evaluate(async () => {
    const { race } = window.__game;
    race.powers.take('rainbow');
    const colours = new Set(['#ff5a4f', '#ff9f45', '#ffd23f', '#3ddc84', '#5ccfff', '#a855f7']);
    const emit = race.particles.emit.bind(race.particles);
    let count = 0;
    race.particles.emit = (options) => {
      if (options.shape === 'dot' && colours.has(options.colour)) count += 1;
      emit(options);
    };
    const end = race.time + 2;
    while (race.time < end) await new Promise((resolve) => requestAnimationFrame(resolve));
    return { count, on: race.powers.has('rainbow'), speed: race.speed };
  });
  expect(dots.on).toBe(true);
  expect(dots.speed).toBeGreaterThan(12);
  expect(dots.count).toBe(0);
});

test('a word from the last race doesn\'t come back at the start of the next', async ({ page }) => {
  await raceWithOpenHand(page, { laps: 1, steering: 'auto' });
  await page.evaluate(() => window.__game.game.toast('High five!'));
  await expect(page.locator('#toast')).toHaveClass(/is-showing/);
  // Turbo and passing a rival bring up words of their own, so it's this word that has to go.
  await expect.poll(() => page.evaluate(() => {
    const box = document.querySelector('#toast');
    return box.classList.contains('is-showing') && box.textContent.includes('High five!');
  }), { timeout: 4000 }).toBe(false);
});

test('a good computer doesn\'t lose anything, and the first moments don\'t count against it', async ({ page }) => {
  await openGame(page);
  const before = await page.evaluate(() => {
    const { race } = window.__game;
    // A slow title screen doesn't count. Only a race does.
    race.quality.frames = 10;
    race.quality.seconds = 4;
    race.watchFrameRate(0);
    return race.quality.level;
  });
  expect(before).toBe(0);
});
