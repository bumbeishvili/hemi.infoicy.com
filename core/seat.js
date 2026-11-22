// Several playing each other on one screen, with one camera. The page together.html shows a copy of the game
// for each of them, side by side, and each copy is a seat: this file is what a game knows about being one.
//
// A seat is the whole game, as a friend on their own computer has it, and the seats play each other through the
// game's own way of playing with friends. Three things are different for a seat:
//   - its camera is its own part of the one camera's picture, a strip from top to bottom: the seat on the left of
//     the screen has the left of the picture as the players see it, like a mirror, and so on across. Whoever is
//     in that part is that seat's player, and nothing else tells them apart. The strip is cut straight from the
//     camera's picture as each frame goes to the tracker: see cut in core/camera.js
//   - its room is in the page that holds the seats (core/local-room.js), not on the server, so nothing leaves
//     this computer
//   - only one seat speaks at a time, so that their voices never talk over each other
// Anywhere else, SEAT is null and none of this does anything.

function readSeat() {
  const here = globalThis.location;
  if (!here || globalThis.parent === globalThis) return null;
  let host = null;
  try {
    host = globalThis.parent.sameScreen ?? null;
  } catch {
    // Inside some other site's page: not a seat.
    return null;
  }
  if (!host) return null;
  const params = new URLSearchParams(here.search);
  const [index, count] = [Number(params.get('seat')), Number(params.get('seats'))];
  if (!Number.isInteger(index) || !Number.isInteger(count) || count < 2 || count > MOST_SEATS || index < 0 || index >= count) return null;
  return { index, count, code: host.code, host, onePicture: Boolean(host.onePicture) };
}

// Two, for now: each seat runs its own tracker, and three or four of those together are too slow to play with.
export const MOST_SEATS = 2;

/**
 * The games where each player needs a picture of their own, so the screen stays split while they play. In these
 * the picture follows the player as they steer, at their own speed or their own way, through a world bigger than
 * the screen: a car, a bike, a plane, a ship, their own eyes in a yard, a walker as fast as their foot is high. Two
 * players are soon in different places, and one picture can't show both.
 *
 * Every other game happens in one place they can both see: a ring, a court, a garden, a valley seen from above, a
 * picture on an easel, or a trail that runs at the game's own pace. There both play in one picture while they play,
 * the left player's game across the whole screen with the other in it as a friend is, and the screen is split only
 * while each gets ready, for their own camera check, and at the end, for their own finish card: see together.js.
 */
export const OWN_VIEW = new Set(['high-five-racers', 'moto-mountain', 'sky-wings', 'frost-arena', 'cannon-bay', 'rooftop-rope']);

/**
 * This copy of the game's seat, { index, count, code, host, onePicture }, counting from 0 at the left of the
 * screen, or null. onePicture is whether its game is one both play in one picture: see OWN_VIEW.
 */
export const SEAT = readSeat();

/**
 * Which part of the camera's own picture a seat has, as shares of its width from its left. The screen shows the
 * picture as a mirror does, so the seat on the left of the screen has the right of the picture.
 */
export function sliceOf(index, count) {
  return { from: (count - 1 - index) / count, to: (count - index) / count };
}

/**
 * How big the picture this game's player sees themselves in is: its own window, except in a seat whose game goes on
 * under the one picture two share on one screen (see core/one-picture.js), where they're in the first seat's game,
 * as big as that is, which is the whole page once it has spread over it. A game that works out where things are from
 * the size of its screen can lay them out at that size, so its player's hand is where the other game shows it.
 */
export function pictureSize() {
  const under = SEAT && globalThis.document?.documentElement.dataset.picture === 'under';
  const shown = (under && globalThis.parent.document.querySelector('iframe.seat')?.contentWindow) || globalThis;
  return { width: shown.innerWidth, height: shown.innerHeight };
}

/** Where a seat's player stands, in words. */
export const placeOf = (index) => ['on the left', 'on the right'][index] ?? '';

export const seatName = (index) => `Player ${index + 1}`;

/**
 * A seat's connection to its room, which a game uses as it would a WebSocket to the server: just as much of one
 * as core/friends.js needs. What the room says comes a moment later, never in the middle of what the game is
 * doing, as it would from a server.
 */
export class SeatSocket {
  constructor(url, { host } = SEAT) {
    const address = new URL(url);
    this.readyState = 0; // As a WebSocket's: 0 connecting, 1 open, 3 closed.
    this.listeners = { open: [], message: [], close: [] };
    this.later(() => {
      if (this.readyState !== 0) return;
      this.readyState = 1;
      this.tell('open', {});
    });
    this.link = host.rooms.connect(address.pathname, address.searchParams.get('was'), {
      hear: (text) => this.later(() => {
        if (this.readyState === 1) this.tell('message', { data: text });
      }),
      closed: () => this.later(() => this.shut()),
    });
    // A seat that's reloaded or sent elsewhere leaves its room, as a closing page closes its WebSocket.
    globalThis.addEventListener?.('pagehide', () => this.close(), { once: true });
  }

  later(run) {
    setTimeout(run, 0);
  }

  tell(type, event) {
    for (const listener of this.listeners[type] ?? []) listener(event);
  }

  addEventListener(type, listener) {
    this.listeners[type]?.push(listener);
  }

  send(text) {
    if (this.readyState === 1) this.link?.say(text);
  }

  shut() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.tell('close', {});
  }

  close() {
    if (this.readyState === 3) return;
    this.link?.leave();
    this.readyState = 3;
    this.later(() => this.tell('close', {}));
  }
}

/** Whether nobody in another seat is speaking: a line that would talk over one isn't said. */
export function voiceFree({ index, host } = SEAT) {
  return host.voice.by === index || Date.now() >= host.voice.until;
}

/** This seat is speaking, for so many seconds. */
export function voiceTaken(seconds, { index, host } = SEAT) {
  host.voice = { by: index, until: Date.now() + seconds * 1000 };
}

/** This seat has stopped speaking before its line was over. */
export function voiceDropped({ index, host } = SEAT) {
  if (host.voice.by === index) host.voice = { by: -1, until: 0 };
}

if (SEAT && globalThis.document) {
  // Each seat's own look, in core/base.css, and links that leave the game take the whole page with them.
  document.documentElement.dataset.seat = String(SEAT.index + 1);
  document.documentElement.dataset.seats = String(SEAT.count);
  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[href]');
    if (link && link.pathname !== location.pathname) link.target = '_top';
  }, true);
}
