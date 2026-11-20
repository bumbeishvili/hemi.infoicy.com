// Several playing each other on one screen, with one camera. This page shows a copy of a game for each of them,
// side by side, and keeps the room they play each other in: together.html?game=mighty-moves&players=2. Each copy
// is a seat, which is the whole game with its own part of the camera's picture: see core/seat.js for what a seat
// is, and core/local-room.js for the room. A game's title card has the links that come here, under Play with
// friends: see core/friends-ui.js.
import { mostIn } from '../server/race-room.js';
import { newCode } from './friends.js';
import { LocalRooms } from './local-room.js';
import { MOST_SEATS, placeOf, seatName } from './seat.js';

const params = new URLSearchParams(location.search);
const game = params.get('game') ?? '';
// A game's folder, and nothing that could be anywhere else.
const known = /^[a-z][a-z-]{1,40}$/.test(game);
const most = Math.min(MOST_SEATS, mostIn(game));
const players = Math.min(most, Math.max(2, Math.round(Number(params.get('players'))) || 2));

const rooms = new LocalRooms();
// What every seat shares, which each finds as parent.sameScreen: the code of their room, the room itself, who's
// speaking, and hosted, which is over once the first seat is in the room, when the others go in.
window.sameScreen = {
  code: newCode(),
  rooms,
  voice: { by: -1, until: 0 },
  hosted: new Promise((resolve) => {
    rooms.onArrive = resolve;
  }),
};

const seats = document.getElementById('seats');
if (!known) {
  document.getElementById('no-game').hidden = false;
} else {
  seats.dataset.players = String(players);
  const debug = params.has('debug') ? '&debug' : '';
  for (let index = 0; index < players; index += 1) {
    const seat = document.createElement('iframe');
    seat.className = 'seat';
    seat.title = `${seatName(index)}, ${placeOf(index)}`;
    seat.allow = 'camera; autoplay; fullscreen';
    seat.src = `games/${game}/index.html?seat=${index}&seats=${players}${debug}`;
    seats.append(seat);
  }
}
