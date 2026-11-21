// Several playing each other on one screen, each in their own copy of a game: which part of the camera's picture
// each seat has (core/seat.js), the room they share, kept in the page (core/local-room.js), a seat's connection
// to it, and whose turn it is to speak.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalRooms } from '../../core/local-room.js';
import { MOST_SEATS, OWN_VIEW, SEAT, SeatSocket, placeOf, seatName, sliceOf, voiceDropped, voiceFree, voiceTaken } from '../../core/seat.js';

const soon = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

/** A copy of the game, as the room sees it: everything the room has said to it, and whether it was let go. */
function client(rooms, path, was = null) {
  const heard = [];
  const state = { heard, closed: false, link: null, last: (type) => heard.filter((message) => message.t === type).at(-1) };
  state.link = rooms.connect(path, was, {
    hear: (text) => heard.push(text === 'pong' ? { t: 'pong' } : JSON.parse(text)),
    closed: () => {
      state.closed = true;
    },
  });
  state.say = (message) => state.link.say(typeof message === 'string' ? message : JSON.stringify(message));
  return state;
}

test('anywhere but in a seat on a split screen, a game is not a seat', () => {
  assert.equal(SEAT, null);
  assert.equal(MOST_SEATS, 2);
});

test('the seats share the camera\'s picture out in strips, left to right as the players see themselves', () => {
  for (const count of [2, 3, 4]) {
    const slices = Array.from({ length: count }, (_, index) => sliceOf(index, count));
    // The screen shows the picture as a mirror does: the seat on the left of the screen has the right of it.
    assert.equal(slices[0].to, 1);
    assert.equal(slices.at(-1).from, 0);
    for (const [index, { from, to }] of slices.entries()) {
      assert.ok(Math.abs(to - from - 1 / count) < 1e-9, 'each has the same share');
      if (index) assert.ok(Math.abs(to - slices[index - 1].from) < 1e-9, 'with no gap and nothing shared');
    }
  }
  assert.deepEqual(sliceOf(0, 2), { from: 0.5, to: 1 });
  assert.deepEqual(sliceOf(1, 2), { from: 0, to: 0.5 });
});

test('each seat is told which player it is and where they stand', () => {
  assert.equal(seatName(0), 'Player 1');
  assert.equal(seatName(3), 'Player 4');
  assert.deepEqual([0, 1].map((index) => placeOf(index)), ['on the left', 'on the right']);
});

test('two copies of a game are in one room in the page: each is told who\'s there, and the first is the host', () => {
  const rooms = new LocalRooms();
  const arrived = [];
  rooms.onArrive = (id) => arrived.push(id);
  const one = client(rooms, '/room/mighty-lift/ABC');
  assert.equal(arrived.length, 1, 'the page hears of the first, to let the others in after it');
  const two = client(rooms, '/room/mighty-lift/ABC');
  assert.equal(arrived.length, 2);
  for (const each of [one, two]) {
    const room = each.last('room');
    assert.equal(room.members.length, 2);
    assert.equal(room.members.filter(({ host }) => host).length, 1);
  }
  assert.notEqual(one.last('room').you, two.last('room').you);
  assert.equal(one.last('room').members.find(({ host }) => host).id, one.last('room').you, 'the first in is the host');

  // Who they are, as each says.
  one.say({ t: 'hi', name: 'Player 1', driver: 'giraffe', level: 3, length: 5, team: 1 });
  two.say({ t: 'hi', name: 'Player 2', driver: 'kit', level: 1, length: 8, team: 0 });
  assert.deepEqual(two.last('room').members.map(({ name }) => name).sort(), ['Player 1', 'Player 2']);
  assert.equal(two.last('room').team, 1, 'together or against is the host\'s choice');
});

test('when both are ready it starts for both, on the host\'s game, and what one does the other hears', () => {
  const rooms = new LocalRooms();
  const one = client(rooms, '/room/mighty-lift/ABC');
  const two = client(rooms, '/room/mighty-lift/ABC');
  one.say({ t: 'hi', name: 'Player 1', driver: 'giraffe', level: 3, length: 5, team: 1 });
  two.say({ t: 'hi', name: 'Player 2', driver: 'kit', level: 1, length: 8, team: 0 });
  one.say({ t: 'ready' });
  assert.equal(one.last('go'), undefined, 'not until everyone is');
  two.say({ t: 'ready' });
  for (const each of [one, two]) {
    const go = each.last('go');
    assert.equal(go.level, 3);
    assert.equal(go.length, 5);
    assert.equal(go.team, 1);
    assert.deepEqual(go.racers, [one.last('room').you, two.last('room').you]);
  }
  assert.equal(one.last('go').seed, two.last('go').seed, 'laid out the same for both');

  // A lift of the first one's arm reaches the second, and not the first again.
  one.say({ t: 'lifter', ms: 500, u: 1.1, a: 1, n: 1, f: 0, r: 0 });
  const heard = two.last('lifter');
  assert.equal(heard.from, one.last('room').you);
  assert.equal(heard.u, 1.1);
  assert.equal(one.last('lifter'), undefined);
  // And a finish.
  two.say({ t: 'done', ms: 30_000, w: 1, n: 4 });
  assert.equal(one.last('done').from, two.last('room').you);
});

test('in a game played in one picture, it\'s one picture from when both are sent off until the host\'s game is over', () => {
  const rooms = new LocalRooms();
  assert.equal(rooms.view(), 'split', 'nobody there yet');
  const one = client(rooms, '/room/mighty-moves/ABC');
  assert.equal(rooms.view(), 'split', 'one on their own');
  const two = client(rooms, '/room/mighty-moves/ABC');
  for (const each of [one, two]) each.say({ t: 'hi', name: 'Player', driver: 'giraffe', level: 1, length: 3, team: 1 });
  one.say({ t: 'ready' });
  assert.equal(rooms.view(), 'split', 'getting ready, each with their own camera check');
  two.say({ t: 'ready' });
  assert.equal(rooms.view('split'), 'one', 'both under way');

  // The second player finishing first leaves the host playing in the whole picture, where both are.
  two.say({ t: 'done', ms: 30_000, w: 1, n: 2 });
  assert.equal(rooms.view('one'), 'one');
  // Just started, with one of them not under way, as when the host starts without the other, it stays split.
  assert.equal(rooms.view('split'), 'split');
  one.say({ t: 'done', ms: 31_000, w: 1, n: 3 });
  assert.equal(rooms.view('one'), 'split', 'each sees their own finish card');

  // Off again, and the host going in the middle splits it, as nobody's game is the whole picture then.
  one.say({ t: 'ready' });
  two.say({ t: 'ready' });
  assert.equal(rooms.view('split'), 'one');
  one.link.leave();
  assert.equal(rooms.view('one'), 'split');
});

test('only the games where each player steers their own way through a world bigger than the screen keep it split', () => {
  assert.deepEqual([...OWN_VIEW].sort(), ['cannon-bay', 'frost-arena', 'high-five-racers', 'moto-mountain', 'rooftop-rope', 'sky-wings']);
});

test('a keep-alive is answered, and goes no further', () => {
  const rooms = new LocalRooms();
  const one = client(rooms, '/room/ABC');
  const two = client(rooms, '/room/ABC');
  const before = two.heard.length;
  one.say('ping');
  assert.equal(one.heard.at(-1).t, 'pong');
  assert.equal(two.heard.length, before);
});

test('each game and each code has a room of its own, and High Five Racers\' rooms are just the code', () => {
  const rooms = new LocalRooms();
  const racer = client(rooms, '/room/ABC');
  const lifter = client(rooms, '/room/mighty-lift/ABC');
  const other = client(rooms, '/room/mighty-lift/XYZ');
  for (const each of [racer, lifter, other]) assert.equal(each.last('room').members.length, 1);
  assert.equal(client(rooms, '/room/ABC').last('room').members.length, 2);
  assert.equal(lifter.last('room').members.length, 1);
});

test('a game for two has no room for a third, and a game for four none for a fifth', () => {
  const rooms = new LocalRooms();
  client(rooms, '/room/mighty-moves/ABC');
  client(rooms, '/room/mighty-moves/ABC');
  const third = client(rooms, '/room/mighty-moves/ABC');
  assert.equal(third.link, null);
  assert.equal(third.closed, true);
  assert.equal(third.last('full').t, 'full');

  const four = Array.from({ length: 4 }, () => client(rooms, '/room/moto-mountain/ABC'));
  assert.equal(four[3].last('room').members.length, 4);
  assert.equal(client(rooms, '/room/moto-mountain/ABC').link, null);
});

test('a copy that goes leaves the other in the room on their own, and can come back as itself', () => {
  const rooms = new LocalRooms();
  const one = client(rooms, '/room/mighty-lift/ABC');
  const two = client(rooms, '/room/mighty-lift/ABC');
  two.say({ t: 'hi', name: 'Player 2', driver: 'kit', level: 1, length: 5 });
  const wasTwo = two.last('room').you;
  two.link.leave();
  assert.equal(one.last('room').members.length, 1);
  // Nothing more reaches a copy that has gone, or comes from it: not even the answer to a keep-alive.
  const before = two.heard.length;
  one.say({ t: 'hi', name: 'Still here', driver: 'giraffe', level: 1, length: 5 });
  two.say({ t: 'hi', name: 'Gone', driver: 'kit', level: 1, length: 5 });
  two.say('ping');
  assert.equal(two.heard.length, before);
  assert.deepEqual(one.last('room').members.map(({ name }) => name), ['Still here']);
  // Reloaded, it's back with the id it had, and as who it was, before it has said anything.
  const again = client(rooms, '/room/mighty-lift/ABC', wasTwo);
  assert.equal(again.last('room').you, wasTwo);
  assert.deepEqual(one.last('room').members.map(({ name }) => name).sort(), ['Player 2', 'Still here']);
});

test('a seat\'s connection opens before anything is heard on it, and the room never answers in the middle of what a game is doing', async () => {
  const host = { rooms: new LocalRooms() };
  const events = [];
  const socket = new SeatSocket('ws://localhost:8643/room/mighty-lift/ABC', { host });
  assert.equal(socket.readyState, 0, 'connecting, as a WebSocket is at first');
  socket.addEventListener('open', () => events.push('open'));
  socket.addEventListener('message', ({ data }) => events.push(JSON.parse(data).t));
  socket.addEventListener('close', () => events.push('close'));
  assert.deepEqual(events, [], 'nothing yet');
  await soon();
  assert.equal(socket.readyState, 1);
  assert.deepEqual(events, ['open', 'room']);

  // What it says is heard at once by the room, and the answer comes a moment later.
  socket.send(JSON.stringify({ t: 'hi', name: 'Player 1', driver: 'giraffe', level: 1, length: 5 }));
  assert.deepEqual(events, ['open', 'room']);
  await soon();
  assert.deepEqual(events, ['open', 'room', 'room']);

  // A second seat in the same room is told of the first, and the first of the second.
  const other = new SeatSocket('ws://localhost:8643/room/mighty-lift/ABC?make=1', { host });
  const theirs = [];
  other.addEventListener('message', ({ data }) => theirs.push(JSON.parse(data)));
  await soon();
  assert.equal(theirs.at(-1).members.length, 2);
  assert.equal(events.at(-1), 'room');

  // Closing it leaves the room, and says so once.
  socket.close();
  assert.equal(socket.readyState, 3);
  await soon();
  assert.equal(events.at(-1), 'close');
  assert.equal(events.filter((event) => event === 'close').length, 1);
  assert.equal(theirs.at(-1).members.length, 1);
  socket.send('ping');
  socket.close();
  await soon();
  assert.equal(events.filter((event) => event === 'close').length, 1);
});

test('a seat the room has no place for is closed, as a full game on the server closes a connection', async () => {
  const host = { rooms: new LocalRooms() };
  for (let seat = 0; seat < 2; seat += 1) new SeatSocket('ws://localhost:8643/room/tank-patrol/ABC', { host });
  const third = new SeatSocket('ws://localhost:8643/room/tank-patrol/ABC', { host });
  const events = [];
  third.addEventListener('message', ({ data }) => events.push(JSON.parse(data).t));
  third.addEventListener('close', () => events.push('close'));
  await soon();
  assert.deepEqual(events, ['full', 'close']);
  assert.equal(third.readyState, 3);
});

test('only one seat speaks at a time: a line that would talk over another seat\'s isn\'t said', async () => {
  const host = { voice: { by: -1, until: 0 } };
  const [one, two] = [{ index: 0, host }, { index: 1, host }];
  assert.equal(voiceFree(one), true);
  assert.equal(voiceFree(two), true);
  voiceTaken(0.05, one);
  assert.equal(voiceFree(two), false, 'the first is speaking');
  assert.equal(voiceFree(one), true, 'its own next line may follow its last');
  await soon(70);
  assert.equal(voiceFree(two), true, 'and has finished');
  // A line stopped early, as when a game is paused, lets the others speak at once.
  voiceTaken(10, two);
  assert.equal(voiceFree(one), false);
  voiceDropped(one);
  assert.equal(voiceFree(one), false, 'only whoever is speaking can stop');
  voiceDropped(two);
  assert.equal(voiceFree(one), true);
});

test('in one picture, the other player\'s own things show through holes in the first player\'s game', async () => {
  const { withHoles } = await import('../../core/one-picture.js');
  assert.equal(withHoles(1440, 900, []), '', 'nothing to show through, so nothing cut');
  const cut = withHoles(1440, 900, [{ x: 1080, y: 12, w: 160, h: 90, r: 18 }, { x: 900.04, y: 700, w: 40, h: 20, r: 999 }]);
  assert.match(cut, /^path\(evenodd, '/, 'holes, as the whole game with the boxes taken out of it');
  const parts = cut.slice("path(evenodd, '".length, -2).split(' M').map((part, index) => (index ? `M${part}` : part));
  assert.equal(parts.length, 3, 'the whole game, and a hole for each box');
  assert.equal(parts[0], 'M0 0h1440v900h-1440v-900Z');
  assert.ok(parts[1].startsWith('M1098 12h124a18 18 0 0 1 18 18'), 'rounded as the box is');
  assert.ok(parts[2].startsWith('M910 700h20a10 10 0 0 1 10 10'), 'a round end at most half as big as the box, in tenths of a pixel');
});
