// How turbo and flying are shown to a child who can't read well, with no talking. The meter shows an open
// hand and says to keep it open, and then it's turbo. When turbo runs out, a little film by the meter shows
// the other hand making a fist and opening, and the car taking off. Nothing in any of it flashes.
import { inflateSync } from 'node:zlib';
import { car, expect, openGame, reachRace, shot, show, test, waitForHand, waitUntilMoving } from './helpers.js';

const meter = (page) => page.evaluate(() => {
  const box = document.getElementById('turbo');
  const shown = (selector) => getComputedStyle(box.querySelector(selector)).display !== 'none';
  return { state: box.dataset.state, word: document.getElementById('turbo-word').textContent, hand: shown('.turbo-hand'), flame: shown('.turbo-flame') };
});

/** Driving with the hand in play loosely open, which counts as open. */
async function raceLoosely(page, settings = {}) {
  const side = settings.hands ?? 'right';
  await openGame(page, { strictness: { [side]: 0.5 }, ...settings });
  await show(page, ...(side === 'right' ? [null, 'open'] : ['open', null]));
  await reachRace(page);
  await show(page, ...(side === 'right' ? [null, 'relaxed'] : ['relaxed', null]));
  await waitForHand(page, 'open', side);
  await expect.poll(async () => (await car(page)).speed, { timeout: 15_000 }).toBeGreaterThan(12);
}

test('the meter says to keep the hand open, and then it\'s turbo', async ({ page }) => {
  await raceLoosely(page);
  await expect.poll(() => meter(page), { timeout: 8000, intervals: [20] }).toMatchObject({ state: 'filling', word: 'Keep your hand open!', hand: true });
  await shot(page, 'high-five-racers-turbo-filling');
  await expect.poll(() => meter(page), { timeout: 8000, intervals: [50] }).toEqual({ state: 'on', word: 'Turbo!', hand: false, flame: true });

  // With the hand closed it still says what to do.
  await show(page, null, 'fist');
  await waitForHand(page, 'closed');
  await expect.poll(() => meter(page), { timeout: 8000 }).toEqual({ state: 'idle', word: 'Keep your hand open!', hand: true, flame: false });
  await shot(page, 'high-five-racers-turbo-how-to');
});

test('the meter\'s words are in Georgian too', async ({ page }) => {
  await raceLoosely(page, { language: 'ka' });
  await expect.poll(async () => (await meter(page)).word, { timeout: 8000, intervals: [20] }).toBe('ხელი გაშლილი გეჭიროს!');
});

test('when turbo runs out, a film shows the other hand making a fist and opening, and the car flying', async ({ page }) => {
  await raceLoosely(page);
  const film = () => page.evaluate(() => ({
    side: document.body.dataset.flyFilm ?? null,
    shown: getComputedStyle(document.getElementById('fly-film')).display !== 'none',
    words: document.getElementById('fly-film-words').textContent,
  }));
  expect((await film()).shown).toBe(false);

  // Turbo comes by itself, and a few seconds later it runs out.
  await expect.poll(() => page.evaluate(() => window.__game.race.turbo.active), { timeout: 10_000 }).toBe(true);
  // The right hand is in play, so the other hand is on the left of the picture, as in a mirror.
  await expect.poll(film, { timeout: 8000, intervals: [50] }).toEqual({ side: 'left', shown: true, words: 'Other hand: fist, then open!' });
  await page.waitForTimeout(1300);
  await shot(page, 'high-five-racers-fly-film');
  // It goes after about four seconds.
  await expect.poll(async () => (await film()).shown, { timeout: 8000 }).toBe(false);

  // Doing it: the car flies, and the film goes at once.
  await page.evaluate(() => window.__game.game.turboRanOut());
  await expect.poll(async () => (await film()).shown).toBe(true);
  await show(page, 'open', 'relaxed');
  await expect.poll(() => page.evaluate(() => window.__game.monitor.snapshot.other.status), { timeout: 15_000 }).toBe('open');
  await show(page, 'fist', 'relaxed');
  await expect.poll(() => page.evaluate(() => window.__game.monitor.snapshot.other.status), { timeout: 15_000 }).toBe('closed');
  await show(page, 'open', 'relaxed');
  await expect.poll(() => page.evaluate(() => window.__game.race.soaring), { timeout: 10_000, intervals: [50] }).toBe(true);
  expect((await film()).shown).toBe(false);
});

test('the flying film shows the first three times, and after that only for a child who hasn\'t flown', async ({ page }) => {
  await raceLoosely(page);
  const shownEachTime = await page.evaluate(() => {
    const { game } = window.__game;
    const seen = [];
    const tryOnce = () => {
      game.flyFilmLeft = 0;
      game.turboRanOut();
      seen.push(game.flyFilmLeft > 0);
    };
    for (let i = 0; i < 5; i += 1) tryOnce();
    game.flights = 1;
    tryOnce();
    return seen;
  });
  expect(shownEachTime).toEqual([true, true, true, true, true, false]);
});

test('with the left hand in play, the film shows the other hand on the right', async ({ page }) => {
  await raceLoosely(page, { hands: 'left' });
  // Turbo from the other hand runs out by itself after a few seconds.
  await page.evaluate(() => window.__game.race.turbo.burst());
  await expect.poll(() => page.evaluate(() => document.body.dataset.flyFilm ?? null), { timeout: 10_000, intervals: [50] }).toBe('right');
  const turned = await page.locator('#fly-film svg').evaluate((svg) => getComputedStyle(svg).transform);
  expect(turned).toMatch(/^matrix\(-1,/);
  await page.waitForTimeout(1200);
  await shot(page, 'high-five-racers-fly-film-left-hand');
});

/* ---------- nothing flashes ---------- */

/** The colours of a PNG, decoded here, as screenshots only come back as files. */
function decodePng(buffer) {
  let at = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const data = [];
  while (at < buffer.length) {
    const length = buffer.readUInt32BE(at);
    const type = buffer.toString('ascii', at + 4, at + 8);
    const body = buffer.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      channels = { 2: 3, 6: 4 }[body[9]];
    } else if (type === 'IDAT') data.push(body);
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const value = raw[y * (stride + 1) + 1 + x];
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const corner = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - corner;
        const [a, b, c] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - corner)];
        predicted = a <= b && a <= c ? left : b <= c ? up : corner;
      }
      pixels[y * stride + x] = (value + predicted) & 255;
    }
  }
  return { width, height, channels, pixels };
}

/** How bright each of 16 by 9 parts of the picture is. */
function brightnessOf(buffer) {
  const { width, height, channels, pixels } = decodePng(buffer);
  const cells = new Array(16 * 9).fill(0);
  const counts = new Array(16 * 9).fill(0);
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const index = (y * width + x) * channels;
      const cell = Math.floor((y / height) * 9) * 16 + Math.floor((x / width) * 16);
      cells[cell] += (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
      counts[cell] += 1;
    }
  }
  return cells.map((total, cell) => total / counts[cell]);
}

test('the hints and the film move gently: nothing in them changes brightness or blinks', async ({ page }) => {
  await raceLoosely(page);
  await page.evaluate(() => {
    const { game } = window.__game;
    game.race.fives = 5;
    game.turboRanOut();
    game.flyFilmLeft = 60;
  });
  await expect(page.locator('#fly-film')).toBeVisible();

  // Everything the hints animate only moves or turns: no colour, light or fading in and out.
  const animated = await page.evaluate(() => {
    const properties = new Set();
    for (const animation of document.getAnimations()) {
      const target = animation.effect?.target;
      if (!target?.closest?.('#turbo, #fly-film')) continue;
      for (const frame of animation.effect.getKeyframes()) {
        for (const key of Object.keys(frame)) if (!['offset', 'computedOffset', 'easing', 'composite'].includes(key)) properties.add(key);
      }
    }
    return [...properties];
  });
  expect(animated.length).toBeGreaterThan(0);
  expect(animated.every((property) => property === 'transform')).toBe(true);

  // And the whole screen, read picture by picture, as the race goes on behind them.
  const pictures = [];
  const started = Date.now();
  while (Date.now() - started < 5000) pictures.push(brightnessOf(await page.screenshot()));
  const whole = pictures.map((cells) => cells.reduce((sum, value) => sum + value, 0) / cells.length);
  const biggest = Math.max(...whole.slice(1).map((value, index) => Math.abs(value - whole[index])));
  const flips = pictures.slice(1).filter((cells, index) => cells.filter((value, cell) => Math.abs(value - pictures[index][cell]) >= 25.5).length >= cells.length / 4).length;
  console.log('with the hints showing:', pictures.length, 'pictures, biggest brightness step', biggest.toFixed(2), 'big changes', flips);
  expect(pictures.length).toBeGreaterThan(10);
  expect(biggest).toBeLessThan(10);
  expect(flips).toBe(0);
  await shot(page, 'high-five-racers-turbo-hints-together');
});

test('with reduced motion the meter\'s hand holds still, spread wide', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await raceLoosely(page);
  const fingers = await page.locator('.turbo-finger').first().evaluate((finger) => getComputedStyle(finger).animationName);
  expect(fingers).toBe('none');
  await page.evaluate(() => window.__game.game.turboRanOut());
  await expect(page.locator('#fly-film')).toBeVisible();
});

for (const { name, width, height } of [{ name: 'phone-landscape', width: 844, height: 390 }, { name: 'phone-portrait', width: 390, height: 844 }]) {
  test(`the film and the meter fit a ${name} screen`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await raceLoosely(page);
    await page.evaluate(() => {
      window.__game.game.turboRanOut();
      window.__game.game.flyFilmLeft = 60;
    });
    await expect(page.locator('#fly-film')).toBeVisible();
    const boxes = await page.evaluate(() => {
      const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
      const film = rect('#fly-film');
      // The prompt too, which a hint may be showing at the same time.
      const others = ['#turbo', '.camera-frame', '#meter-right', '#prompt'].map(rect);
      return {
        inside: film.left >= 0 && film.top >= 0 && film.right <= innerWidth && film.bottom <= innerHeight,
        overlaps: others.some((box) => film.left < box.right && film.right > box.left && film.top < box.bottom && film.bottom > box.top),
      };
    });
    expect(boxes).toEqual({ inside: true, overlaps: false });
    await page.waitForTimeout(800);
    await shot(page, `high-five-racers-fly-film-${name}`);
  });
}

test('it all still works while the car steers itself', async ({ page }) => {
  await raceLoosely(page, { steering: 'auto' });
  await waitUntilMoving(page);
  expect(['Keep your hand open!', 'Turbo!']).toContain((await meter(page)).word);
});
