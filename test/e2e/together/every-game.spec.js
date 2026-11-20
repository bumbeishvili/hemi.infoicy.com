// Every game that can be played with friends on their own computers can be played by two on one screen: each
// opens with a copy of itself for each player, both in the room they share, ready to start.
import { GAMES, expect, openTogether, seatState, test } from './helpers.js';

for (const game of GAMES) {
  test(`${game} opens on a split screen, with both players in one game and a start button each`, async ({ page }) => {
    const sockets = [];
    page.on('websocket', (socket) => sockets.push(socket.url()));
    const [left, right] = await openTogether(page, game);
    expect(await seatState(left)).toMatchObject({ seat: '1', banner: 'Player 1, on the left', here: ['Player 1 (you)', 'Player 2'] });
    expect(await seatState(right)).toMatchObject({ seat: '2', banner: 'Player 2, on the right', here: ['Player 1', 'Player 2 (you)'] });
    for (const seat of [left, right]) {
      await expect(seat.locator('#start')).toBeVisible();
      await expect(seat.locator('#start')).toBeEnabled();
      // Nothing about a code, a link or a name, which are for friends on their own computers.
      await expect(seat.locator('#friends-code-shown')).toBeHidden();
      await expect(seat.locator('#friends-name')).toBeHidden();
    }
    // The room is in the page: nothing is sent to the server for friends.
    expect(sockets).toEqual([]);
  });
}
