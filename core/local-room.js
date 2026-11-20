// The rooms for several playing each other on one screen, each in their own copy of a game (see together.html
// and core/seat.js). They follow the same rules as the server's rooms for friends on their own computers
// (server/race-room.js), but they're kept in the page that shows the copies, so nothing leaves this computer and
// no internet is needed. No screen or camera in this file, so it runs in the unit tests.
import { idFor, mostIn, RaceRoom, takeOver } from '../server/race-room.js';

const newId = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_');
};

export class LocalRooms {
  constructor() {
    this.rooms = new Map(); // name: { players: Set, rules }
    // The time, which never says the same moment twice: copies in one page can arrive within a millisecond of each
    // other, and the first in is the host, whose choices count.
    let last = 0;
    this.now = () => {
      last = Math.max(last + 1, Date.now());
      return last;
    };
    this.onArrive = () => {}; // Someone has got into a room: see together.js, which lets the rest in after the first.
  }

  roomFor(name) {
    let room = this.rooms.get(name);
    if (!room) {
      const players = new Set();
      room = { players, rules: new RaceRoom({ players: () => [...players] }, this.now) };
      this.rooms.set(name, room);
    }
    return room;
  }

  /**
   * A copy of the game connects, as it would to the server: path is /room/<game>/<CODE>, or /room/<CODE> for High
   * Five Racers, and was the id it had, if it's coming back. client is { hear(text), closed() }: what the room
   * says to it, and that the room has let it go. Returns { say(text), leave() } for what it says to the room, or
   * null if the room is full.
   */
  connect(path, was, client) {
    const [, , ...rest] = path.split('/');
    const game = rest.length === 2 ? rest[0] : '';
    const room = this.roomFor(rest.join(':'));
    let open = true;
    let meta = null;
    const gone = () => {
      if (!open) return;
      open = false;
      room.players.delete(player);
      room.rules.leave(player);
    };
    const player = {
      get meta() {
        return meta;
      },
      // Nothing between a copy and this room can go quiet without closing, so it's always just heard from.
      get heardAt() {
        return Date.now();
      },
      setMeta(next) {
        meta = next;
      },
      send(message) {
        client.hear(JSON.stringify(message));
      },
      close() {
        if (!open) return;
        gone();
        client.closed();
      },
    };
    // In the room first, so that a connection it takes over going doesn't leave the room empty.
    room.players.add(player);
    const kept = takeOver([...room.players], was) ?? room.rules.cameBack(was);
    const id = kept ? was : idFor([...room.players], was, newId);
    if (!room.rules.arrive(player, id, kept, { most: mostIn(game) })) {
      gone();
      client.closed();
      return null;
    }
    this.onArrive(id);
    return {
      say(text) {
        if (!open) return;
        // As the server does: a keep-alive "ping" is answered "pong", and goes no further.
        if (text === 'ping') client.hear('pong');
        else room.rules.hear(player, text);
      },
      leave: gone,
    };
  }
}
