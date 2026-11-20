// Everywhere else the camera is replaced by a canvas. This goes through the browser's real getUserMedia, with
// Chrome's built-in test camera, to prove that two seats on one screen can both open the one camera from inside
// their frames, each shows its own half of it, and each one's tracker runs.
import { expect, seatsOf, test, waitForScreen } from './helpers.js';

test.use({
  launchOptions: {
    args: [
      '--enable-gpu',
      '--ignore-gpu-blocklist',
      ...(process.platform === 'darwin' ? ['--use-angle=metal'] : []),
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  },
});

test('two seats both open the real camera, each with its own half of the picture, and both trackers run', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/together.html?game=high-five-racers&players=2&debug');
  const seats = await seatsOf(page, 2);
  for (const seat of seats) await expect(seat.locator('#friends-here li')).toHaveCount(2, { timeout: 90_000 });
  for (const seat of seats) await seat.locator('#start').click();
  for (const seat of seats) await waitForScreen(seat, 'check');

  const cameras = [];
  for (const seat of seats) {
    const video = seat.locator('#camera');
    await expect.poll(() => video.evaluate((el) => el.videoWidth), { timeout: 60_000 }).toBeGreaterThan(0);
    expect(await video.evaluate((el) => el.paused)).toBe(false);
    cameras.push(await seat.evaluate(() => {
      const { camera } = window.__game;
      const { videoWidth, videoHeight } = camera.video;
      return { videoWidth, videoHeight, region: camera.region, aspect: camera.aspect, slides: camera.video.style.objectPosition };
    }));
  }
  const [left, right] = cameras;
  // The same camera, whole, in both, and each seat's part of it is half as wide: the left seat's the right half
  // of the camera's own picture, as a mirror shows it, and the right seat's the left.
  expect([left.videoWidth, left.videoHeight]).toEqual([right.videoWidth, right.videoHeight]);
  expect(left.region).toEqual({ left: left.videoWidth / 2, width: left.videoWidth / 2, height: left.videoHeight });
  expect(right.region).toEqual({ left: 0, width: right.videoWidth / 2, height: right.videoHeight });
  expect(left.aspect).toBeCloseTo(left.videoWidth / 2 / left.videoHeight, 5);
  expect([left.slides, right.slides]).toEqual(['100% 50%', '0% 50%']);

  // The test camera shows no hands, so each tracker must be answering and finding none.
  for (const seat of seats) {
    await expect(seat.locator('#prompt')).toHaveText(/Show your right hand!/);
    const answering = await seat.evaluate(async () => {
      const { camera } = window.__game;
      const before = camera.lastResultAt;
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return camera.lastResultAt > before;
    });
    expect(answering).toBe(true);
  }
});
