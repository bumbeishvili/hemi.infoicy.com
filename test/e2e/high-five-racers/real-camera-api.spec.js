// Everywhere else the camera is replaced by a canvas. This one goes through the browser's
// real getUserMedia, using Chrome's built-in test camera, to prove that path works.
import { expect, test, waitForScreen } from './helpers.js';

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

test('the real camera path opens the camera and runs the tracker', async ({ page }) => {
  await page.goto('/games/high-five-racers/index.html?debug');
  await page.locator('#start').click();
  await waitForScreen(page, 'check');

  const video = page.locator('#camera');
  await expect.poll(() => video.evaluate((el) => el.videoWidth)).toBeGreaterThan(0);
  expect(await video.evaluate((el) => el.paused)).toBe(false);
  await expect(page.locator('#prompt')).toHaveText(/Show your right hand!/);

  // The test camera shows no hands, so the tracker must be answering and finding none.
  const answering = await page.evaluate(async () => {
    const { camera } = window.__game;
    const before = camera.lastResultAt;
    await new Promise((resolve) => setTimeout(resolve, 800));
    return camera.lastResultAt > before;
  });
  expect(answering).toBe(true);
});
