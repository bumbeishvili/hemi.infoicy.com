// Layout on other screen sizes, and the fallback for slower computers.
import {
  car,
  expect,
  openGame,
  reachRace,
  shot,
  show,
  test,
  waitForHand,
  waitUntilMoving,
  waitUntilStopped,
} from './helpers.js';

/** Nothing on screen may stick out past the window. */
async function expectNothingCutOff(page) {
  const cutOff = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    };
    return [...document.querySelectorAll('.prompt, .camera-frame, .meter, .wheel, .chip, .gear, .turbo, .race-order, .five-film')]
      .filter(visible)
      .filter((element) => {
        const box = element.getBoundingClientRect();
        // Meters breathe a little when closed, so allow them a few pixels.
        return box.left < -8 || box.top < -8 || box.right > innerWidth + 8 || box.bottom > innerHeight + 8;
      })
      .map((element) => element.className || element.id);
  });
  expect(cutOff).toEqual([]);
}

/** The chips and the camera's picture both have to be seen. */
async function expectChipsClearOfCamera(page) {
  const overlapping = await page.evaluate(() => {
    const frame = document.querySelector('.camera-frame').getBoundingClientRect();
    return [...document.querySelectorAll('.chip')].filter((chip) => {
      const box = chip.getBoundingClientRect();
      return box.left < frame.right && box.right > frame.left && box.top < frame.bottom && box.bottom > frame.top;
    }).length;
  });
  expect(overlapping).toBe(0);
}

const SCREENS = [
  { name: 'tablet-landscape', width: 1024, height: 768 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'phone-landscape', width: 844, height: 390 },
  { name: 'phone-portrait', width: 390, height: 844 },
  { name: 'laptop-large', width: 1920, height: 1080 },
];

for (const { name, width, height } of SCREENS) {
  test(`fits a ${name} screen`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openGame(page);
    await page.waitForTimeout(400);
    await shot(page, `70-${name}-welcome`);

    await show(page, null, 'open');
    await page.locator('#start').click();
    await expect(page.locator('#prompt')).toHaveText(/Open your hand as wide as you can!/, { timeout: 30_000 });
    await expectNothingCutOff(page);
    await shot(page, `71-${name}-check`);

    await expect(page.locator('#chip-place')).toBeVisible({ timeout: 30_000 });
    await waitForHand(page, 'open');
    await waitUntilMoving(page);
    await show(page, null, 'fist');
    await waitForHand(page, 'closed');
    await waitUntilStopped(page);
    await expect(page.locator('#prompt')).toHaveText(/Open your right hand!/);
    await expectNothingCutOff(page);
    await expectChipsClearOfCamera(page);
    await shot(page, `72-${name}-race`);
  });
}

// From level 2 there's a fifth chip, for the coins, which has to keep clear of the camera's picture too.
for (const { name, width, height } of [
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'narrow-tablet', width: 701, height: 900 },
  { name: 'wide-tablet', width: 905, height: 1200 },
  { name: 'small-laptop', width: 980, height: 600 },
  { name: 'phone-landscape', width: 844, height: 390 },
  { name: 'small-phone-landscape', width: 812, height: 375 },
  { name: 'phone-portrait', width: 390, height: 844 },
]) {
  test(`with the coins from level 2, the chips stay clear of the camera's picture on a ${name} screen`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openGame(page, { levels: { 'high-five-racers': 10 } });
    await show(page, null, 'open');
    await reachRace(page);
    await expect(page.locator('#chip-coins-box')).toBeVisible();
    await expectNothingCutOff(page);
    await expectChipsClearOfCamera(page);
    const layout = await page.evaluate(() => {
      const box = (selector) => document.querySelector(selector).getBoundingClientRect();
      const overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const frame = box('.camera-frame');
      // The film of a high five in the corner, as it shows for the first big hands.
      document.body.dataset.fiveFilm = 'right';
      const film = box('.five-film');
      delete document.body.dataset.fiveFilm;
      const rows = new Set([...document.querySelectorAll('.chip')].map((chip) => Math.round(chip.getBoundingClientRect().top))).size;
      return { hudOnCamera: overlap(box('.hud-top'), frame), progressOnCamera: overlap(box('.race-progress'), frame), orderOnFilm: overlap(box('.race-order'), film), rows };
    });
    console.log(name, JSON.stringify(layout));
    expect(layout).toMatchObject({ hudOnCamera: false, progressOnCamera: false, orderOnFilm: false });
    // On a phone held sideways there's no room for a second row.
    if (height < 560) expect(layout.rows).toBe(1);
    await shot(page, `74-${name}-level10-chips`);
  });
}

for (const language of ['en', 'ka']) {
  test(`the turbo meter's words fit inside it on a phone held upright${language === 'ka' ? ', in Georgian' : ''}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openGame(page, { language });
    await show(page, null, 'open');
    await reachRace(page);
    // With the hand closed, the meter says to keep it open.
    await show(page, null, 'fist');
    await expect(page.locator('#turbo-word')).toHaveText(language === 'ka' ? 'ხელი გაშლილი გეჭიროს!' : 'Keep your hand open!');
    const fits = await page.evaluate(() => {
      const meter = document.querySelector('#turbo').getBoundingClientRect();
      // The words themselves, which could run out of their box.
      const words = document.createRange();
      words.selectNodeContents(document.querySelector('#turbo-word'));
      const text = words.getBoundingClientRect();
      const speed = document.querySelector('.turbo-speed').getBoundingClientRect();
      return {
        inMeter: text.left >= meter.left && text.right <= meter.right && text.bottom <= meter.bottom,
        onScreen: meter.right <= innerWidth && text.right <= innerWidth,
        clearOfSpeed: text.right <= speed.left || text.bottom <= speed.top || text.top >= speed.bottom,
      };
    });
    expect(fits).toEqual({ inMeter: true, onScreen: true, clearOfSpeed: true });
    await shot(page, `75-phone-portrait-turbo-${language}`);
  });
}

test('with reduced motion the camera stops zooming and there is no confetti', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGame(page, { laps: 1, steering: 'auto' });
  await show(page, null, 'open');
  await reachRace(page);
  await waitUntilMoving(page);
  const fieldOfView = () => page.evaluate(() => window.__game.race.camera.fov);
  const before = await fieldOfView();
  await page.waitForTimeout(1500);
  expect(await fieldOfView()).toBe(before);
  // Animations that only exist to catch the eye are off.
  await show(page, null, 'fist');
  await waitForHand(page, 'closed');
  const breathing = await page.locator('#meter-right').evaluate((el) => getComputedStyle(el).animationName);
  expect(breathing).toBe('none');
});

test('a slow computer drops sharpness and then shadows, and keeps playing', async ({ page }) => {
  await openGame(page);
  await show(page, null, 'open');
  await reachRace(page);
  await waitUntilMoving(page);

  const levels = await page.evaluate(() => {
    const { race } = window.__game;
    const slowFor = () => {
      race.quality.frames = 40;
      race.quality.seconds = 4;
      race.watchFrameRate(0);
    };
    slowFor();
    const first = [race.quality.level, race.renderer.getPixelRatio(), race.renderer.shadowMap.enabled];
    slowFor();
    return [first, [race.quality.level, race.renderer.getPixelRatio(), race.renderer.shadowMap.enabled]];
  });
  expect(levels).toEqual([[1, 1, true], [2, 1, false]]);

  const { distance } = await car(page);
  await expect.poll(async () => (await car(page)).distance).toBeGreaterThan(distance + 10);
  await shot(page, '73-low-quality');
});
