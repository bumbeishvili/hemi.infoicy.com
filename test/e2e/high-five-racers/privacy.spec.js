// These are children's camera pictures: nothing may leave the computer.
import {
  expect,
  openGame,
  reachRace,
  show,
  test,
  waitForHand,
  waitUntilMoving,
} from './helpers.js';

test('the game makes no requests off this computer, and the page refuses to', async ({ page, baseURL, pageErrors }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  // Racing friends is the only thing that connects anywhere, and only once a grown-up makes or joins a race.
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));

  await openGame(page);
  await show(page, null, 'open');
  await reachRace(page);
  await waitForHand(page, 'open');
  await waitUntilMoving(page);
  await page.waitForTimeout(1500);

  const offsite = requests.filter((url) => !url.startsWith(baseURL) && !url.startsWith('data:') && !url.startsWith('blob:'));
  expect(offsite).toEqual([]);
  expect(sockets).toEqual([]);
  expect(requests.length).toBeGreaterThan(5);

  const blocked = await page.evaluate(async () => {
    try {
      await fetch('https://example.com/upload', { method: 'POST', body: 'picture' });
      return false;
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);

  // A failed fetch alone could just be a network problem. This has to be the page's own
  // policy doing the blocking. These are the only errors this test expects, so they are
  // cleared here rather than failing it.
  // The only other place it may connect to is the race server for racing friends, which it only does when
  // a grown-up makes or joins a race.
  await expect.poll(() => pageErrors.join('\n')).toContain("violates the following Content Security Policy directive: \"connect-src 'self'");
  pageErrors.length = 0;
});
