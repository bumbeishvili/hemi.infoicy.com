// Several playing each other on one screen, with one camera. This page shows a copy of a game for each of them,
// side by side, and keeps the room they play each other in: together.html?game=mighty-moves&players=2. Each copy
// is a seat, which is the whole game with its own part of the camera's picture: see core/seat.js for what a seat
// is, and core/local-room.js for the room. A game's title card has the links that come here, under Play with
// friends: see core/friends-ui.js.
import { mostIn } from '../server/race-room.js';
import { newCode } from './friends.js';
import { LocalRooms } from './local-room.js';
import { keepOwnThings } from './one-picture.js';
import { MOST_SEATS, OWN_VIEW, placeOf, seatName } from './seat.js';

const params = new URLSearchParams(location.search);
const game = params.get('game') ?? '';
// A game's folder, and nothing that could be anywhere else.
const known = /^[a-z][a-z-]{1,40}$/.test(game);
const most = Math.min(MOST_SEATS, mostIn(game));
const players = Math.min(most, Math.max(2, Math.round(Number(params.get('players'))) || 2));
// Whether they play in one picture, the left player's game across the screen, or each in their own: see OWN_VIEW.
const onePicture = known && !OWN_VIEW.has(game);

const rooms = new LocalRooms();
// What every seat shares, which each finds as parent.sameScreen: the code of their room, the room itself, who's
// speaking, whether they play in one picture, and hosted, which is over once the first seat is in the room, when
// the others go in.
window.sameScreen = {
  code: newCode(),
  rooms,
  onePicture,
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
  seats.dataset.view = 'split';
  // In one picture, the first seat's game takes the whole screen while they play, and the others play on under it,
  // each still watching its own player and sending what they do, which the first one shows.
  if (onePicture) {
    setInterval(() => {
      const counting = seats.children[0]?.contentDocument?.body?.dataset.screen === 'countdown';
      const view = rooms.view(seats.dataset.view, { counting });
      if (view === seats.dataset.view) return;
      seats.dataset.view = view;
      for (const seat of [...seats.children].slice(1)) seat.inert = view === 'one';
    }, 150);
    keepOwnThings([...seats.children], () => seats.dataset.view === 'one');
  }
}
