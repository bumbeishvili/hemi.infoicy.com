// Mighty Lift with friends: two, three and four games, each with its own rules and its own child, talking to
// each other only through the server's own rules (server/race-room.js), as they do on their own computers. No
// browser here: each child's arm goes where the test says.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanLifter, mostIn, RaceRoom } from '../../server/race-room.js';
import { seededRandom } from '../../core/friends.js';
import { layOut, Lifting } from '../../games/mighty-lift/lift.js';
import { FriendRescue, Mate, armMessage, finishMessage, mateArms, scoreRows, someoneFreedAll } from '../../games/mighty-lift/team.js';

const STEP = 1 / 30;
const SEND_EVERY = 0.1;
const ARM_SPEED = 3; // Lifts a second: how fast a child's arm goes up or down here.

/**
 * A game with friends, from making it to "GO!". arms says what each child's arm does: a function of the
 * seconds since "GO!" for each of them, in the order they joined. together is the host's choice.
 */
function makeMatch(arms, { together = true, lifts = 5, level = 3, hold = 'medium' } = {}) {
  const players = [];
  let clock = 1000;
  const rules = new RaceRoom({ players: () => players.map(({ socket }) => socket).filter((socket) => socket.meta) }, () => clock);
  arms.forEach((arm, index) => {
    const socket = {
      meta: null,
      heard: [],
      setMeta(meta) {
        this.meta = meta;
      },
      send(message) {
        this.heard.push(message);
      },
    };
    const id = `player${index}aa`;
    players.push({ id, socket, arm, read: 0, sentAt: -Infinity, events: [], results: new Map(), game: null, mates: [] });
    clock += 10;
    assert.equal(rules.arrive(socket, id, null, { most: mostIn('mighty-lift') }), true);
  });
  const say = (player, message) => rules.hear(player.socket, JSON.stringify(message));
  for (const player of players) say(player, { t: 'hi', name: player.id, driver: 'giraffe', level, length: lifts, mode: hold, team: together ? 1 : 0 });
  for (const player of players) say(player, { t: 'ready' });
  const go = players[0].socket.heard.filter(({ t }) => t === 'go').at(-1);
  assert.ok(go, 'the game started');
  const team = Boolean(go.team);
  for (const player of players) {
    player.mates = players.filter((other) => other !== player).map((other) => new Mate({ id: other.id, spec: { name: other.id } }));
    player.game = new Lifting({
      level: go.level,
      lifts: go.length,
      hold: go.mode,
      lifter: null,
      random: seededRandom(go.seed),
      plain: true,
      team: team ? { size: players.length } : null,
      onEvent: (event) => {
        player.events.push(event);
        // As the page does: a rescue done on one weight is claimed from the server, and a finish is told to everyone.
        if (event.type === 'freed' && team) say(player, { t: 'claim', k: event.index });
        if (event.type === 'finished') say(player, { t: 'done', ms: clock, ...finishMessage(player.game, team) });
      },
    });
    player.game.begin();
  }

  let seconds = 0;
  const step = () => {
    seconds += STEP;
    clock += STEP * 1000;
    for (const player of players) {
      if (player.left) continue;
      // What has come from the others since last time.
      for (const message of player.socket.heard.slice(player.read)) {
        if (message.t === 'claimed' && team) player.game.settle(message.k);
        else if (message.t === 'done') player.results.set(message.from, { won: message.w !== 0, dropped: message.n });
        else player.mates.find(({ friend }) => friend.id === message.from)?.hear(message, clock);
      }
      player.read = player.socket.heard.length;
      if (player.game.state !== 'playing') continue;
      // An arm takes a moment to get where it's going, as a real one does.
      const wanted = player.arm(seconds, player.game);
      player.lift = (player.lift ?? 0) + Math.max(-ARM_SPEED * STEP, Math.min(ARM_SPEED * STEP, wanted - (player.lift ?? 0)));
      const { lift } = player;
      player.game.update(STEP, lift, mateArms(player.mates, clock));
      if (seconds - player.sentAt >= SEND_EVERY && player.game.state === 'playing') {
        player.sentAt = seconds;
        say(player, { t: 'lifter', ms: Math.round(seconds * 1000), ...armMessage(player.game, lift) });
      }
      // Against each other, it's over for everyone once someone has freed all of theirs.
      if (!team && someoneFreedAll(player.results)) player.game.finish();
    }
  };
  const runFor = (time) => {
    for (let i = 0; i < Math.round(time / STEP); i += 1) step();
  };
  const leave = (player) => {
    player.left = true;
    rules.leave(player.socket);
    for (const other of players) for (const mate of other.mates) if (mate.friend.id === player.id) mate.gone = true;
  };
  const count = (player, type) => player.events.filter((event) => event.type === type).length;
  return { players, team, go, step, runFor, leave, count, seconds: () => seconds };
}

/** An arm that goes up for so long and rests for so long, over and over, starting after a delay, whatever the game is doing. */
const lifting = (up = 3, rest = 2.5, after = 0, high = 1.1) => (t) => (t >= after && (t - after) % (up + rest) < up ? high : 0);
/** A child who lifts whenever there's something to lift, after thinking about it for a while, and puts it down once the friend is out. */
const keen = (thinks = 0.2, high = 1.1) => (t, game) => (game.phase === 'lifting' && game.phaseFor >= thinks ? high : 0);
const resting = () => 0;

test('what a game tells friends about an arm is only numbers, as the server keeps them', () => {
  const game = new Lifting({ level: 1, plain: true });
  game.begin();
  for (let i = 0; i < 30; i += 1) game.update(STEP, 1.2345);
  const message = armMessage(game, 1.2345);
  assert.deepEqual(message, { u: 1.23, a: 1, n: 1, f: 0, r: 0 });
  assert.deepEqual(cleanLifter({ ms: 400, ...message }), { ms: 400, ...message }, 'nothing is lost on the way through the server');
  assert.deepEqual(armMessage(game, 37), { ...message, u: 2 }, 'an arm is never sent as more than twice its line');
  assert.equal(armMessage(game, NaN).u, 0);
});

test('together, two children lifting free every friend on both computers, each rescue once, and finish as a team', () => {
  const { players, team, runFor, count } = makeMatch([lifting(), lifting(3, 2.5, 0.7)], { together: true, lifts: 5 });
  assert.equal(team, true);
  runFor(60);
  for (const player of players) {
    assert.equal(player.game.state, 'finished', `${player.id} finished`);
    assert.equal(count(player, 'freed'), 5, `${player.id} saw every friend freed, once each`);
    assert.equal(player.game.stats.freed, 5);
    assert.deepEqual(finishMessage(player.game, true).w, 1);
  }
  // Each heard the other's finish, with their lifts, and nobody is placed above anybody.
  const [ana, ben] = players;
  assert.equal(ana.results.get(ben.id).won, true);
  assert.equal(ana.results.get(ben.id).dropped, ben.game.stats.lifts);
  assert.ok(ana.game.stats.lifts >= 4 && ben.game.stats.lifts >= 4, 'both did their share of the lifting');
});

test('together, every rescue is over on every computer at the same moment, give or take a message', () => {
  const { players, step, seconds } = makeMatch([lifting(), lifting(2.6, 2.2, 0.4)], { together: true, lifts: 5 });
  const freedAt = players.map(() => []);
  for (let i = 0; i < 60 / STEP; i += 1) {
    step();
    players.forEach((player, index) => {
      while (freedAt[index].length < player.game.stats.freed) freedAt[index].push(seconds());
    });
  }
  assert.equal(freedAt[0].length, 5);
  freedAt[0].forEach((time, index) => assert.ok(Math.abs(time - freedAt[1][index]) <= STEP * 2 + 1e-9, `rescue ${index}: ${time} and ${freedAt[1][index]}`));
});

test('together, a child who rests the whole game still sees every friend freed, by the one who lifts', () => {
  const { players, runFor, count } = makeMatch([resting, lifting(4, 2)], { together: true, lifts: 5 });
  runFor(120);
  const [sitting, working] = players;
  for (const player of players) {
    assert.equal(player.game.state, 'finished', `${player.id} finished`);
    assert.equal(count(player, 'freed'), 5);
  }
  assert.equal(sitting.game.stats.lifts, 0);
  assert.equal(count(sitting, 'resting') >= 1, true, 'and is only told that resting is fine');
  assert.ok(working.game.stats.lifts >= 5);
});

test('together, the weight is higher with two arms up than with one, on both computers', () => {
  const both = makeMatch([() => 1.1, () => 1.1], { together: true });
  both.runFor(0.8);
  const one = makeMatch([() => 1.1, resting], { together: true });
  one.runFor(0.8);
  for (const player of both.players) assert.ok(player.game.height > 1, `both up: ${player.game.height}`);
  for (const player of one.players) assert.ok(Math.abs(player.game.height - 0.55) < 0.08, `one up: ${player.game.height}`);
  // And the friend under it gets out about twice as fast.
  both.runFor(0.4);
  one.runFor(0.4);
  assert.ok(both.players[0].game.out > one.players[0].game.out * 1.5, `${both.players[0].game.out} against ${one.players[0].game.out}`);
});

test('together with three and with four, everyone\'s arms count, and the game ends the same for all of them', () => {
  for (const arms of [[lifting(), lifting(3, 2.5, 0.5), resting], [lifting(), lifting(3, 2.5, 0.5), lifting(2.5, 3, 1), resting]]) {
    const { players, runFor, count } = makeMatch(arms, { together: true, lifts: 5 });
    runFor(150);
    for (const player of players) {
      assert.equal(player.game.state, 'finished', `${arms.length} players: ${player.id} finished`);
      assert.equal(count(player, 'freed'), 5);
      assert.equal(player.results.size, arms.length - 1, 'and heard everyone else finish');
    }
  }
});

test('together, a friend who goes in the middle leaves the rest to lift on, with one arm fewer to wait for', () => {
  const { players, runFor, leave, count } = makeMatch([lifting(), lifting(3, 2.5, 0.5)], { together: true, lifts: 5 });
  runFor(8);
  const [staying, going] = players;
  const before = staying.game.stats.freed;
  assert.ok(before >= 1 && before < 5, `${before} freed so far`);
  leave(going);
  runFor(60);
  assert.equal(staying.game.state, 'finished');
  assert.equal(count(staying, 'freed'), 5);
  // On their own now, their arm is all of it: the weight goes right up with it.
  const alone = makeMatch([() => 1.1, resting], { together: true });
  alone.leave(alone.players[1]);
  alone.runFor(0.8);
  assert.ok(alone.players[0].game.height > 1);
});

test('against each other, each child frees their own friends, and it\'s over for both when one has freed them all', () => {
  const { players, team, runFor, count } = makeMatch([keen(0.2), keen(4)], { together: false, lifts: 5 });
  assert.equal(team, false);
  runFor(90);
  const [quick, slow] = players;
  assert.equal(quick.game.state, 'finished');
  assert.equal(slow.game.state, 'finished');
  assert.equal(quick.game.stats.freed, 5);
  assert.ok(slow.game.stats.freed >= 1 && slow.game.stats.freed < 5, `the slower one freed ${slow.game.stats.freed}`);
  assert.equal(count(slow, 'finished'), 1);
  assert.deepEqual(finishMessage(quick.game, false), { w: 1, n: 5 });
  assert.deepEqual(finishMessage(slow.game, false), { w: 0, n: slow.game.stats.freed });
  // Each heard how the other did, and the one who freed the most is first.
  assert.deepEqual(slow.results.get(quick.id), { won: true, dropped: 5 });
  assert.deepEqual(quick.results.get(slow.id), { won: false, dropped: slow.game.stats.freed });
  // One child's arm lifts nothing on the other's computer.
  const apart = makeMatch([() => 1.1, resting], { together: false });
  apart.runFor(3);
  assert.equal(apart.players[1].game.height, 0);
  assert.equal(apart.players[1].game.stats.freed, 0);
});

test('against each other, a child who rests loses nothing: their friends wait, and they\'re placed by how many they freed', () => {
  const { players, runFor } = makeMatch([keen(0.2), resting], { together: false, lifts: 5 });
  runFor(60);
  const [, sitting] = players;
  assert.equal(sitting.game.state, 'finished');
  assert.equal(sitting.game.stats.freed, 0);
  assert.equal(sitting.game.index, 0, 'still on their first friend, who was never taken away');
});

test('the scoreboard counts lifts on one weight together and friends freed against each other, the most first', () => {
  const friend = (name) => ({ id: name, spec: { name } });
  const ana = Object.assign(new Mate(friend('Ana')), { freed: 3, lifts: 7 });
  const ben = Object.assign(new Mate(friend('Ben')), { freed: 5, lifts: 2 });
  const gone = Object.assign(new Mate(friend('Cal')), { freed: 9, lifts: 9, gone: true });
  const mine = { freed: 4, lifts: 4 };
  assert.deepEqual(scoreRows(mine, [ana, ben, gone], false), [{ name: 'Ben', count: 5, you: false }, { name: 'You', count: 4, you: true }, { name: 'Ana', count: 3, you: false }]);
  assert.deepEqual(scoreRows(mine, [ana, ben, gone], true).map(({ name, count }) => [name, count]), [['Ana', 7], ['You', 4], ['Ben', 2]]);
  // On a tie, the child sees themselves first.
  assert.equal(scoreRows({ freed: 5, lifts: 0 }, [ben], false)[0].you, true);
  // Two in one picture on one screen both read it, so the child is named as a player there.
  assert.deepEqual(scoreRows(mine, [ben], false, 'Player 1').map(({ name }) => name), ['Ben', 'Player 1']);
  assert.equal(someoneFreedAll(new Map([['a', { won: false }], ['b', { won: true }]])), true);
  assert.equal(someoneFreedAll(new Map([['a', { won: false }]])), false);
  assert.equal(someoneFreedAll(new Map()), false);
});

test('a friend\'s arm is shown a moment behind and moves smoothly between messages, and their body is passed on as it came', () => {
  const mate = new Mate({ id: 'friend', spec: { name: 'Friend' } });
  assert.deepEqual(mate.armAt(1000), { lift: 0, up: false }, 'nothing heard yet');
  assert.deepEqual(mate.bodyAt(1000), []);
  assert.equal(mate.hear({ t: 'lifter', ms: 0, u: 0, a: 0, n: 0, f: 0, r: 0 }, 1000), false);
  assert.equal(mate.hear({ t: 'lifter', ms: 100, u: 0.5, a: 0, n: 0, f: 0, r: 0 }, 1100), false);
  assert.equal(mate.hear({ t: 'lifter', ms: 200, u: 1, a: 1, n: 1, f: 0, r: 0 }, 1200), true, 'a lift is one more on the scoreboard');
  const between = mate.armAt(1270);
  assert.ok(between.lift > 0.5 && between.lift < 1, `part of the way: ${between.lift}`);
  assert.deepEqual(mate.armAt(1400), { lift: 1, up: true });
  assert.equal(mate.lifts, 1);
  mate.hear({ t: 'pose', ms: 200, p: [1, 2, 3] }, 1200);
  assert.deepEqual(mate.bodyAt(1400), [1, 2, 3]);
  assert.equal(mate.hear({ t: 'score', n: 4 }, 1300), false, 'anything else is nothing to it');
});

test('two on one screen against each other: the second player\'s own rescue follows their arm, and their friend is free when their game says so', () => {
  const rescues = layOut({ lifts: 2, lifter: ['giraffe', 'truffle'], random: () => 0.4, plain: true });
  const rescue = new FriendRescue(rescues, 1);
  const run = (seconds, arm) => {
    for (let t = 0; t < seconds; t += STEP) rescue.update(STEP, arm);
  };
  assert.deepEqual(rescues.map(({ kind }) => kind), ['basket', 'basket']);
  assert.ok(!rescues.some(({ friend }) => friend === 'giraffe' || friend === 'truffle'), 'neither lifter is one to free');
  // The basket comes in, and goes up with the arm.
  run(1, { lift: 0 });
  assert.equal(rescue.phase, 'lifting');
  assert.equal(rescue.left, 2);
  run(0.8, { lift: 1.1, up: true });
  assert.ok(rescue.height > 1);
  assert.ok(rescue.freeing && rescue.out > 0.3);
  // However long it's held, the friend isn't free until their game says so.
  run(3, { lift: 1.1, up: true });
  assert.equal(rescue.phase, 'lifting');
  assert.ok(rescue.out < 1);
  // The arm comes down early: the friend is back under, but what they'd managed isn't lost.
  run(0.5, { lift: 0 });
  assert.equal(rescue.out, 0);
  assert.ok(rescue.progress > 0.9);
  // Their game has freed them: out, and once the arm is down, a rest and the next one.
  run(0.2, { lift: 1, up: true, freed: 1 });
  assert.equal(rescue.phase, 'freed');
  assert.equal(rescue.out, 1);
  assert.equal(rescue.left, 1);
  run(0.5, { lift: 0, freed: 1 });
  assert.equal(rescue.phase, 'resting');
  run(2, { lift: 0, freed: 1 });
  assert.equal(rescue.index, 1);
  assert.equal(rescue.phase, 'arriving');
  assert.equal(rescue.out, 0);
  // The last one freed, it's done, with none left.
  run(1.5, { lift: 1, up: true, freed: 2 });
  run(2, { lift: 0, freed: 2 });
  assert.equal(rescue.phase, 'done');
  assert.equal(rescue.left, 0);
});
