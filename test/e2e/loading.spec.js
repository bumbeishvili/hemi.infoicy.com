// A bar fills while a game gets ready (core/loading.js), in every game: while the page itself is opening, until
// the start button can be pressed, and after it, while the camera opens and the tracker and the sounds load. The
// tests slow the loading down, as a slow connection would, so that the waits are long enough to be looked at.
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, show, test, waitForScreen } from './helpers.js';

const fakeCamera = fileURLToPath(new URL('./fake-camera.js', import.meta.url));
const GAMES = readdirSync(new URL('../../games/', import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
// The games played with the whole body have a character to choose first, and their own button after that.
const BODY_START = {
  'leap-trail': '#run-start',
  'mighty-lift': '#lift-start',
  'mighty-moves': '#fight-start',
  'moto-mountain': '#moto-start',
  'rooftop-rope': '#rope-start',
  'sky-wings': '#fly-start',
};

/** A game's page, with the pretend camera and the tests' settings, and nothing waited for. */
async function open(page, game) {
  await page.addInitScript({ path: fakeCamera });
  await page.addInitScript(() => {
    if (!localStorage.getItem('camera-games-settings')) localStorage.setItem('camera-games-settings', JSON.stringify({ voice: false, sound: false, settled: true }));
  });
  await page.goto(`/games/${game}/index.html?debug`, { waitUntil: 'commit' });
}

/** Holds back what a pattern matches for a while, as a slow connection would. wait is in ms, or a function giving it. */
const slow = (page, pattern, wait) => page.route(pattern, async (route) => {
  await new Promise((resolve) => setTimeout(resolve, typeof wait === 'function' ? wait() : wait));
  await route.continue().catch(() => {});
});

/** The bar the style sheet draws by itself, before any code: how wide its track and its fill are, or null. */
const sheetBar = (page) => page.evaluate(() => {
  if (!document.body) return null;
  const [track, fill] = [getComputedStyle(document.body, '::before'), getComputedStyle(document.body, '::after')];
  if (track.content === 'none' || fill.content === 'none') return null;
  return { track: parseFloat(track.width), fill: parseFloat(fill.width), moving: fill.animationName };
}).catch(() => null);

test('there are 26 games, and each has a test of its bar here', () => {
  expect(GAMES.length).toBe(26);
  for (const game of Object.keys(BODY_START)) expect(GAMES).toContain(game);
});

for (const game of GAMES) {
  test(`${game}: a bar fills while the page opens, and the start button waits for it`, async ({ page }) => {
    // The game's own code comes late, and then its words.
    await slow(page, `**/games/${game}/main.js`, 1500);
    await slow(page, '**/lines.json', 500);
    await open(page, game);

    // Before any of the game's code has run: the bar the style sheet draws, creeping along, in the middle.
    await expect.poll(() => sheetBar(page), { timeout: 10_000, intervals: [50] }).not.toBe(null);
    const before = await sheetBar(page);
    expect(before.track).toBe(360);
    expect(before.fill).toBeGreaterThan(360 * 0.02);
    expect(before.fill).toBeLessThanOrEqual(360 * 0.3 + 0.5);
    expect(before.moving).toBe('opening-creep');
    expect(await page.locator('.title-card').count()).toBe(0);

    // The title card comes: the bar is now on it, under a start button that can't be pressed yet, and has got
    // as far as the card being up. The style sheet's own bar is gone.
    const start = page.locator('#start');
    await expect(start).toBeVisible();
    await expect(start).toBeDisabled();
    const bar = page.locator('#screen-welcome .opening-bar');
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute('role', 'progressbar');
    await expect(bar).toHaveAttribute('aria-valuenow', '30');
    expect(await sheetBar(page)).toBe(null);
    const dim = await start.evaluate((button) => Number(getComputedStyle(button).opacity));
    expect(dim).toBeLessThan(0.8);

    // And when everything is in, the button can be pressed and the bar is taken away.
    await expect(start).toBeEnabled();
    expect(await page.locator('.opening-bar').count()).toBe(0);
    expect(await start.evaluate((button) => Number(getComputedStyle(button).opacity))).toBe(1);
  });

  test(`${game}: after the start button, a bar fills as the camera, the tracker and the sounds load, and never goes back`, async ({ page }) => {
    // Every sound comes late, each a little later than the last, so the bar has something to show.
    let count = 0;
    await slow(page, '**/*.ogg', () => 300 + (count++ % 12) * 110);
    await open(page, game);
    const start = page.locator('#start');
    await expect(start).toBeEnabled();

    // Everything the bar on the loading card says, and whether it's there to be seen while that card is up.
    await page.evaluate(() => {
      const bar = document.querySelector('#screen-loading .loading-bar');
      const seen = { values: [], widths: [], shown: false, loading: false };
      window.__loading = seen;
      const look = () => {
        if (document.body.dataset.screen !== 'loading') return;
        seen.loading = true;
        const box = bar.getBoundingClientRect();
        const fill = bar.querySelector('.loading-fill').getBoundingClientRect();
        if (box.width > 200 && box.height >= 10 && fill.height >= 10) seen.shown = true;
        seen.values.push(Number(bar.getAttribute('aria-valuenow')));
        seen.widths.push(bar.querySelector('.loading-fill').style.width);
      };
      new MutationObserver(look).observe(bar, { attributes: true });
      new MutationObserver(look).observe(document.body, { attributes: true, attributeFilter: ['data-screen'] });
    });

    await start.click();
    if (BODY_START[game]) await page.locator(BODY_START[game]).click();
    await page.waitForFunction(() => window.__loading.loading && document.body.dataset.screen !== 'loading', null, { timeout: 120_000 });
    expect(await page.evaluate(() => document.body.dataset.screen)).not.toBe('problem');

    const { values, widths, shown } = await page.evaluate(() => window.__loading);
    expect(shown, 'the bar was there to be seen').toBe(true);
    // What it says to a screen reader is what it shows: its fill is as wide as that, every time.
    expect(widths).toEqual(values.map((value) => `${value}%`));
    // It started low, went up in many steps as the sounds came in one by one, never went back, and got to the end.
    expect(values[0]).toBeLessThan(50);
    expect(new Set(values).size).toBeGreaterThanOrEqual(12);
    expect(values.every((value, index) => index === 0 || value >= values[index - 1]), `${values}`).toBe(true);
    expect(values.at(-1)).toBe(100);
  });
}

test('the page for choosing a game, which shares the style sheet, has no such bar', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('a[href*="games/"]').first()).toBeVisible();
  expect(await sheetBar(page)).toBe(null);
});

test('a second go finds the tracker and the sounds still loaded, so the bar starts most of the way along', async ({ page }) => {
  await open(page, 'balloon-pop');
  const start = page.locator('#start');
  await expect(start).toBeEnabled();
  await show(page, null, 'open');
  await start.click();
  await waitForScreen(page, 'playing');
  // The game ends, and is played again: only the camera has to open again.
  await page.evaluate(() => window.__game.session.finish());
  await expect(page.locator('#play-again')).toBeVisible();
  await page.evaluate(() => {
    const bar = document.querySelector('#screen-loading .loading-bar');
    window.__again = [];
    new MutationObserver(() => window.__again.push(Number(bar.getAttribute('aria-valuenow')))).observe(bar, { attributes: true });
  });
  await page.locator('#play-again').click();
  await page.waitForFunction(() => window.__again.includes(100), null, { timeout: 60_000 });
  const values = await page.evaluate(() => window.__again);
  // The tracker and the sounds are 85% of the bar, and they're there already.
  expect(values.filter((value) => value > 0)[0]).toBeGreaterThanOrEqual(85);
  expect(values.at(-1)).toBe(100);
});
