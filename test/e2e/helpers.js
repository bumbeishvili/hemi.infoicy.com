import { test as base, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fakeCamera = fileURLToPath(new URL('./fake-camera.js', import.meta.url));

export { expect };

/** Every test also fails on an uncaught error or a logged error from the page. */
export const test = base.extend({
  pageErrors: [
    async ({ page }, use) => {
      const errors = [];
      page.on('pageerror', (error) => errors.push(`uncaught: ${error.message}`));
      page.on('console', (message) => {
        // The camera-problem tests fail the camera on purpose, and the app logs why.
        if (message.type() === 'error' && !message.text().includes('Simulated camera problem')) {
          errors.push(`logged: ${message.text()}`);
        }
      });
      await use(errors);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});

/**
 * Opens a game ready for testing, with sound and voice off unless a test turns them on. hash is anything
 * after # in the address, as in a link to race a friend. What a test saves is what it chose, so it's saved as
 * settled: see OLD_DEFAULTS in core/settings.js.
 */
export async function openGame(page, settings = {}, game = 'high-five-racers', hash = '') {
  await page.addInitScript({ path: fakeCamera });
  await page.addInitScript((saved) => {
    if (!localStorage.getItem('camera-games-settings')) {
      localStorage.setItem('camera-games-settings', JSON.stringify(saved));
    }
  }, { voice: false, sound: false, settled: true, ...settings });
  await page.goto(`/games/${game}/index.html?debug${hash}`);
  // A link to play with friends opens the friends box, which is all the title card shows.
  await expect(page.locator('#start:visible, #friends-box:visible').first()).toBeVisible();
}

/** Sets what the fake camera shows, in screen terms. null means that hand is out of view. */
export function show(page, left, right, extra = {}) {
  return page.evaluate((scene) => window.__camera.show(scene), { left, right, ...extra });
}

export function hands(page) {
  return page.evaluate(() => {
    const { left, right, handOpen, drive, steer, overlap } = window.__game.monitor.snapshot;
    const pick = ({ status, reason, openness, target, best, fingers }) => ({ status, reason, openness, target, best, fingers });
    return { left: pick(left), right: pick(right), handOpen, drive, steer, overlap };
  });
}

export function car(page) {
  return page.evaluate(() => {
    const { speed, distance, lateral, starTotal, place, finished } = window.__game.race;
    return { speed, distance, lateral, stars: starTotal, place, finished };
  });
}

export const screenName = (page) => page.evaluate(() => window.__game.screen);

export async function waitForScreen(page, name) {
  // Often, as some screens only last a moment.
  await expect.poll(() => screenName(page), { timeout: 60_000, intervals: [100] }).toBe(name);
}

/** Starts the game and gets through the hand check with the hand the camera is showing. */
export async function reachRace(page) {
  await page.locator('#start').click();
  await waitForScreen(page, 'check');
  await waitForScreen(page, 'countdown');
  await waitForScreen(page, 'playing');
}

/** Waits for the hand in play, which is the right hand unless a test chooses otherwise. */
export async function waitForHand(page, status, side = 'right') {
  await expect.poll(async () => (await hands(page))[side].status, { timeout: 30_000 }).toBe(status);
}

export async function waitUntilMoving(page) {
  await expect.poll(async () => (await car(page)).speed, { timeout: 30_000 }).toBeGreaterThan(12);
}

export async function waitUntilStopped(page) {
  await expect.poll(async () => (await car(page)).speed, { timeout: 30_000 }).toBe(0);
}

export const shot = (page, name) => page.screenshot({ path: `test-results/screens/${name}.png` });
