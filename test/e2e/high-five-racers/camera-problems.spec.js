// What a child and a grown-up see when the camera isn't available.
import { expect, openGame, shot, show, test, waitForScreen } from './helpers.js';

const CASES = [
  ['NotAllowedError', 'Can we use your camera?'],
  ['NotFoundError', 'We can’t find a camera'],
  ['NotReadableError', 'The camera is busy'],
  ['SomethingElseError', 'We can’t see the camera'],
];

for (const [errorName, title] of CASES) {
  test(`${errorName} explains itself and can be retried`, async ({ page }) => {
    await openGame(page);
    await show(page, null, 'open');
    await page.evaluate((name) => {
      window.__camera.failWith = name;
    }, errorName);

    await page.locator('#start').click();
    await waitForScreen(page, 'problem');
    await expect(page.locator('#problem-title')).toHaveText(title);
    await expect(page.locator('#problem-detail')).not.toBeEmpty();
    if (errorName === 'NotAllowedError') await shot(page, '50-camera-denied');

    await page.evaluate(() => {
      window.__camera.failWith = null;
    });
    await page.locator('#problem-retry').click();
    await waitForScreen(page, 'check');
  });
}
