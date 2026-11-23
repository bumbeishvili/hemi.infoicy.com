// The server for playing with friends, on this computer, for the tests and for trying it out: the same rules as
// the one on Cloudflare (server/race-room.js), at ws://localhost:8643/room/<CODE>, or the port after the games'
// when they're on another, with RACE_PORT=. Nothing to install: it
// speaks just enough of the WebSocket protocol for short text messages.
//   node tools/race-server.mjs
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { COMES_BACK_WITHIN_MS, idFor, mostIn, RaceRoom, takeOver, validCode } from '../server/race-room.js';

const PORT = Number(process.env.RACE_PORT ?? 8643);
// The games' pages on this computer, on whichever port they're served from.
const allowed = (origin) => /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin ?? '');
const GAMES = ['sky-wings', 'balloon-pop', 'mighty-moves', 'bounce-back', 'leap-trail', 'giraffe-maze', 'lighthouse', 'smoothie-stand', 'cannon-bay', 'spider-catcher', 'tank-patrol', 'giraffe-garden', 'frost-arena', 'arrow-meadow', 'giraffe-puzzles', 'chick-flap', 'mighty-lift', 'gobble-grow', 'giraffe-paint', 'moto-mountain', 'rooftop-rope', 'riddle-doors']; // As on Cloudflare: High Five Racers' rooms are just the code.
const MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const rooms = new Map(); // code: { players: Set, rules }

function roomFor(code) {
  let room = rooms.get(code);
  if (!room) {
    const players = new Set();
    room = { players, rules: new RaceRoom({ players: () => [...players] }) };
    rooms.set(code, room);
  }
  return room;
}

function frame(opcode, payload = Buffer.alloc(0)) {
  const length = payload.length;
  const head = length < 126 ? Buffer.from([0x80 | opcode, length]) : length < 65536 ? Buffer.from([0x80 | opcode, 126, length >> 8, length & 255]) : null;
  if (!head) throw new Error('Too long');
  return Buffer.concat([head, payload]);
}

/** Reads whole frames off the front of what's come in, and returns what's left. */
function readFrames(buffer, onFrame) {
  let rest = buffer;
  while (rest.length >= 2) {
    const opcode = rest[0] & 15;
    const masked = rest[1] & 128;
    let length = rest[1] & 127;
    let at = 2;
    if (length === 126) {
      if (rest.length < 4) break;
      length = rest.readUInt16BE(2);
      at = 4;
    } else if (length === 127) {
      if (rest.length < 10) break;
      length = Number(rest.readBigUInt64BE(2));
      at = 10;
    }
    const maskAt = at;
    if (masked) at += 4;
    if (rest.length < at + length) break;
    const payload = Buffer.from(rest.subarray(at, at + length));
    if (masked) for (let i = 0; i < payload.length; i += 1) payload[i] ^= rest[maskAt + (i % 4)];
    onFrame(opcode, payload, Boolean(rest[0] & 128));
    rest = rest.subarray(at + length);
  }
  return rest;
}

const server = createServer((request, response) => {
  response.writeHead(404, { 'Content-Type': 'text/plain' });
  response.end('Not found');
});

server.on('upgrade', (request, socket) => {
  const address = new URL(request.url, 'http://localhost');
  const [, kind, ...rest] = address.pathname.split('/');
  const code = rest.at(-1);
  const game = rest.length === 2 ? rest[0] : '';
  const key = request.headers['sec-websocket-key'];
  const known = kind === 'room' && rest.length <= 2 && validCode(code) && (!game || GAMES.includes(game));
  if (!known || !key || !allowed(request.headers.origin)) {
    socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    return;
  }
  const accept = createHash('sha1').update(key + MAGIC).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);

  const name = game ? `${game}:${code}` : code;
  const room = roomFor(name);
  let open = true;
  let meta = null;
  let heardAt = Date.now();
  const player = {
    get meta() {
      return meta;
    },
    get heardAt() {
      return heardAt;
    },
    setMeta(next) {
      meta = next;
    },
    send(message) {
      if (open) socket.write(frame(1, Buffer.from(JSON.stringify(message))));
    },
    close() {
      if (open) socket.end(frame(8, Buffer.from([0x03, 0xe8])));
      gone();
    },
  };
  // In the room first, so that a connection it takes over going doesn't leave the room empty and gone.
  room.players.add(player);
  const was = address.searchParams.get('was');
  // Taking over a connection that died without closing, or back within moments of one that did close.
  const kept = takeOver([...room.players], was) ?? room.rules.cameBack(was);
  const id = kept ? was : idFor([...room.players], was, () => randomBytes(9).toString('base64url'));
  const gone = () => {
    if (!open) return;
    open = false;
    room.players.delete(player);
    room.rules.leave(player);
    // An empty room is kept a while, as on Cloudflare, for anyone coming back to it.
    if (!room.players.size) {
      setTimeout(() => {
        if (!room.players.size && rooms.get(name) === room) rooms.delete(name);
      }, COMES_BACK_WITHIN_MS).unref();
    }
  };
  const making = address.searchParams.get('make') === '1';
  if (!room.rules.arrive(player, id, kept, { most: mostIn(game), making, fresh: !was && !making })) {
    socket.end(frame(8));
    gone();
    return;
  }

  let pending = Buffer.alloc(0);
  let parts = [];
  socket.on('data', (chunk) => {
    heardAt = Date.now();
    pending = readFrames(Buffer.concat([pending, chunk]), (opcode, payload, last) => {
      if (opcode === 8) {
        socket.end(frame(8));
        gone();
      } else if (opcode === 9) {
        socket.write(frame(10, payload));
      } else if (opcode === 1 || opcode === 0) {
        parts.push(payload);
        if (!last) return;
        const text = Buffer.concat(parts).toString('utf8');
        parts = [];
        // The same as Cloudflare: a keep-alive "ping" is answered "pong", and goes no further.
        if (text === 'ping') socket.write(frame(1, Buffer.from('pong')));
        else room.rules.hear(player, text);
      }
    });
  });
  socket.on('close', gone);
  socket.on('error', gone);
});

server.listen(PORT, () => console.log(`Race server at ws://localhost:${PORT}/room/<CODE>`));
