// Several playing each other on one screen, in the tests: together.html with the test camera in every seat. Each
// seat is a frame of the page, which takes what a page takes: locator, evaluate, waitForTimeout.
import { fileURLToPath } from 'node:url';
import { expect, test } from '../helpers.js';

export { expect, test };

const fakeCamera = fileURLToPath(new URL('../fake-camera.js', import.meta.url));

/** The games that can be played with friends, and so on a split screen, by their folders. */
export const GAMES = ['high-five-racers', 'sky-wings', 'balloon-pop', 'mighty-moves', 'bounce-back', 'leap-trail', 'giraffe-maze', 'lighthouse', 'smoothie-stand', 'cannon-bay', 'spider-catcher', 'tank-patrol', 'giraffe-garden', 'frost-arena', 'arrow-meadow', 'giraffe-puzzles', 'chick-flap', 'mighty-lift', 'gobble-grow', 'giraffe-paint', 'moto-mountain', 'rooftop-rope'];
export const FOR_TWO = ['mighty-moves', 'bounce-back', 'cannon-bay', 'tank-patrol'];

/** The seats of the page, left to right, once there are so many. */
export async function seatsOf(page, players) {
  await expect(page.locator('iframe.seat')).toHaveCount(players);
  const seats = [];
  for (let index = 0; index < players; index += 1) {
    const frame = await (await page.locator('iframe.seat').nth(index).elementHandle()).contentFrame();
    seats.push(frame);
  }
  return seats;
}

/**
 * Opens a game on a split screen for so many, with sound and voice off unless a test turns them on, and waits
 * until every seat is in the room they share. Returns the seats, left to right.
 */
export async function openTogether(page, game, players = 2, settings = {}) {
  await page.addInitScript({ path: fakeCamera });
  await page.addInitScript((saved) => {
    if (!localStorage.getItem('camera-games-settings')) localStorage.setItem('camera-games-settings', JSON.stringify(saved));
  }, { voice: false, sound: false, settled: true, ...settings });
  await page.goto(`/together.html?game=${game}&players=${players}&debug`);
  const seats = await seatsOf(page, players);
  for (const seat of seats) await expect(seat.locator('#friends-here li')).toHaveCount(players, { timeout: 90_000 });
  return seats;
}

/** One open hand for each player, each in the middle of their own part of the camera's picture. */
export async function handsForAll(seats, name = 'open') {
  const count = seats.length;
  const hands = Array.from({ length: count }, (_, index) => ({ name, side: 'right', x: (index + 0.5) / count, y: 0.5, scale: count > 2 ? 0.6 : 0.75 }));
  for (const seat of seats) await seat.evaluate((list) => window.__camera.showHands(list, { sameHand: true }), hands);
}

export const screenOf = (seat) => seat.evaluate(() => document.body.dataset.screen);

export async function waitForScreen(seat, name, timeout = 60_000) {
  await expect.poll(() => screenOf(seat), { timeout, intervals: [100] }).toBe(name);
}

/** What a seat says about itself and its room. */
export const seatState = (seat) => seat.evaluate(() => {
  const video = document.querySelector('video');
  return {
    seat: document.documentElement.dataset.seat,
    of: document.documentElement.dataset.seats,
    screen: document.body.dataset.screen,
    banner: document.getElementById('seat-banner')?.textContent ?? '',
    here: [...document.querySelectorAll('#friends-here li .friends-who')].map((who) => who.textContent.trim()),
    // The seat's part of the camera: how wide it is for its height, and how far across its mirror slides to show it.
    picture: video?.videoWidth ? { aspect: Math.round(Number(getComputedStyle(document.documentElement).getPropertyValue('--camera-aspect')) * 1000) / 1000, slides: video.style.objectPosition } : null,
  };
});
