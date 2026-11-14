// Playing Giraffe's Smoothie Stand with friends: the rules with no screen in them. How a fruit flies on every
// friend's screen, who runs the stand, what a friend's game keeps of what it hears, what each slice is worth, and
// the plain fair everyone plays. The screens are tested in test/e2e/story-games/smoothie-friends.spec.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanStand, MAX_RACERS, MOST_BYTES, mostIn, RaceRoom } from '../../server/race-room.js';
import { DAY, FRIENDS_POINTS, fairAt, plainFairAt, pointsFor, Stand } from '../../games/smoothie-stand/orders.js';
import { flightAt, FRUIT_KINDS, fruitId, kindOfId, QUIET_MS, rounded, runnerOf, StandFollower, THROW_AHEAD_MS, wireFruit } from '../../games/smoothie-stand/together.js';

const LEVELS = Array.from({ length: 10 }, (_, index) => index + 1);

/** A seeded random, so that a test goes the same way every time. */
const seeded = (seed = 7) => {
  let roll = seed;
  return () => {
    roll = (roll * 16807) % 2147483647;
    return (roll - 1) / 2147483646;
  };
};

/** A room with players who keep what they're sent, as the server's sockets would pass it on. */
function makeRoom() {
  const players = [];
  let clock = 1000;
  const rules = new RaceRoom({ players: () => players }, () => clock);
  const join = (id) => {
    const player = {
      meta: null,
      heard: [],
      setMeta(meta) {
        this.meta = meta;
      },
      send(message) {
        this.heard.push(message);
      },
      say(message) {
        rules.hear(this, JSON.stringify(message));
      },
      last(type) {
        return this.heard.filter(({ t }) => t === type).at(-1);
      },
    };
    players.push(player);
    clock += 10;
    return rules.arrive(player, id, null, { most: mostIn('smoothie-stand') }) ? player : null;
  };
  const leave = (player) => {
    players.splice(players.indexOf(player), 1);
    rules.leave(player);
  };
  return { join, leave };
}

test('a fruit\'s id says what it is, and the game in each place numbers its fruit apart from the others', () => {
  const seen = new Set();
  for (let slot = 0; slot < MAX_RACERS; slot += 1) {
    for (let n = 1; n <= 2000; n += 1) {
      const kind = FRUIT_KINDS[n % FRUIT_KINDS.length];
      const id = fruitId(slot, n, kind);
      assert.equal(kindOfId(id), kind);
      assert.ok(!seen.has(id), `${id} is given out once`);
      assert.ok(Number.isInteger(id) && id >= 0 && id <= 1_000_000, 'within what a claim can be');
      seen.add(id);
    }
  }
  assert.deepEqual(FRUIT_KINDS, ['apple', 'orange', 'banana', 'pear', 'plum', 'peach', 'rotten']);
});

test('a fruit flies the same from wherever it was last told about, and lands where steps of a frame take it', () => {
  const gravity = 0.38;
  const thrown = { x: 0.4, y: 1.119, vx: 0.02, vy: -0.75, t: 1000, still: false };
  // Told about again later in its flight, from where it is then, it goes on the same way.
  const at = flightAt(thrown, 2200, gravity);
  const later = { x: at.x, y: at.y, vx: thrown.vx, vy: thrown.vy + gravity * 1.2, t: 2200, still: false };
  for (const ms of [2300, 3000, 4100]) {
    const [a, b] = [flightAt(thrown, ms, gravity), flightAt(later, ms, gravity)];
    assert.ok(Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9, `the same at ${ms}`);
  }
  // Up to the top and back down, as a frame at a time does it.
  let { x, y, vy } = thrown;
  const frame = 1 / 240;
  for (let step = 0; step < 240 * 3; step += 1) {
    vy += gravity * frame;
    x += thrown.vx * frame;
    y += vy * frame;
  }
  const end = flightAt(thrown, 4000, gravity);
  assert.ok(Math.abs(end.x - x) < 1e-6 && Math.abs(end.y - y) < 0.003, `${end.y} against ${y}`);
  // Its top is where it was meant to go.
  const top = flightAt(thrown, 1000 + (0.75 / gravity) * 1000, gravity);
  assert.ok(Math.abs(top.y - (1.119 - (0.75 * 0.75) / (2 * gravity))) < 1e-9);
  // Before it's thrown, it's further down, below the screen.
  assert.ok(flightAt(thrown, 1000 - THROW_AHEAD_MS, gravity).y > 1.119);
  // One the tests hang still stays where it is.
  assert.deepEqual(flightAt({ x: 0.5, y: 0.5, vx: 0, vy: 0, t: 0, still: true }, 9000, gravity), { x: 0.5, y: 0.5 });
});

test('how each fruit was thrown goes to friends rounded as the game itself has it, so every screen works from the same numbers', () => {
  const anchor = { x: rounded(0.123456), y: rounded(1.11899), vx: rounded(-0.0123456), vy: rounded(-0.876543), t: 61234, still: false };
  const fruit = [{ id: fruitId(0, 5, 'pear'), anchor }, { id: fruitId(0, 6, 'apple'), anchor: { ...anchor, still: true } }];
  const sent = { t: 'stand', ms: 61300, g: rounded(0.392667), f: wireFruit(fruit), c: 2, l: [3, 1], a: 9 };
  const { ms, ...heard } = cleanStand(JSON.parse(JSON.stringify(sent)));
  assert.equal(ms, 61300);
  assert.deepEqual(heard.f, sent.f, 'nothing is changed on the way');
  assert.equal(heard.g, sent.g);
  const follower = new StandFollower();
  follower.follow('host', 0);
  follower.push('host', { ms, ...heard }, 10);
  const [pear, apple] = follower.fruit;
  assert.deepEqual(pear, { id: fruit[0].id, kind: 'pear', ...anchor });
  assert.equal(apple.kind, 'apple');
  assert.equal(apple.still, true);
  for (const now of [61300, 62000, 63500]) assert.deepEqual(flightAt(pear, now, heard.g), flightAt(anchor, now, sent.g));
});

test('the stand goes to the others, only from someone playing, with only what it should hold, rounded and bounded', () => {
  const { join } = makeRoom();
  const ana = join('aaaaaaaa');
  const ben = join('bbbbbbbb');
  const cara = join('cccccccc');
  const stand = { t: 'stand', ms: 1500.4, g: 0.39267, f: [[16, 0.51234, 1.11899, 0.012345, -0.87654, 1750.6, 0], 'junk', [1, 2]], c: 1, l: [3, 2.6], a: 4, picture: 'not this' };
  ana.say(stand);
  assert.equal(ben.last('stand'), undefined, 'not before the game has started');
  for (const player of [ana, ben]) player.say({ t: 'ready' });
  ana.say({ t: 'go' });
  ana.say(stand);
  assert.deepEqual(ben.last('stand'), { t: 'stand', from: 'aaaaaaaa', ms: 1500, g: 0.3927, f: [[16, 0.5123, 1.119, 0.0123, -0.8765, 1751, 0]], c: 1, l: [3, 3], a: 4 });
  assert.equal(ana.last('stand'), undefined, 'nobody hears their own');
  assert.equal(cara.last('stand').from, 'aaaaaaaa', 'someone in the room who isn\'t playing still hears it');
  cara.say(stand);
  assert.equal(ben.heard.filter(({ t }) => t === 'stand').length, 1, 'only from someone playing');
  // Anything out of bounds is brought back into them.
  assert.deepEqual(cleanStand({ ms: -5, g: 99, f: [[2e6, 9, -9, 9, -9, -1, 'yes']], c: 40, l: [500, -3, 1, 1, 1], a: 1e9 }), { ms: 0, g: 3, f: [[1_000_000, 1.5, -1, 2, -4, 0, 1]], c: 9, l: [99, 0, 1], a: 100_000 });
  assert.deepEqual(cleanStand({}), { ms: 0, g: 0, f: [], c: 0, l: [], a: 0 });
  // A full stand is well under the most a message can be.
  const full = { t: 'stand', from: 'abcdefghijkl', ...cleanStand({ ms: 3_599_999, g: 0.8844, f: Array.from({ length: 30 }, (_, i) => [999_999 - i, -0.4999, 1.9999, -1.9999, -3.9999, 3_599_999, 1]), c: 5, l: [12, 12, 12], a: 99_999 }) };
  assert.equal(full.f.length, 16, 'never more fruit than there can be');
  assert.ok(JSON.stringify(full).length < MOST_BYTES * 0.6, `${JSON.stringify(full).length} characters at most`);
});

test('at the stand, each fruit goes to the first hand that claims it, a room holds four, and a host who goes hands over', () => {
  const { join, leave } = makeRoom();
  const players = ['aaaaaaaa', 'bbbbbbbb', 'cccccccc', 'dddddddd'].map(join);
  assert.ok(players.every(Boolean));
  assert.equal(mostIn('smoothie-stand'), MAX_RACERS);
  assert.equal(join('eeeeeeee'), null, 'the fifth is told the game is full');
  const [ana, ben, cara] = players;
  for (const player of players) player.say({ t: 'ready' });
  const k = fruitId(0, 3, 'banana');
  cara.say({ t: 'claim', k });
  ben.say({ t: 'claim', k });
  for (const player of players) assert.deepEqual(player.heard.filter(({ t }) => t === 'claimed'), [{ t: 'claimed', k, by: 'cccccccc' }]);
  // The host goes: the next in line, still playing, runs the stand, and the server passes it on from them.
  leave(ana);
  assert.equal(ben.last('room').members.find(({ host }) => host).id, 'bbbbbbbb');
  ben.say({ t: 'stand', ms: 9000, g: 0.38, f: [], c: 2, l: [1], a: 1 });
  assert.equal(cara.last('stand').from, 'bbbbbbbb');
});

test('the stand is run by the first in line who\'s still here: the host, and then whoever came next', () => {
  const racers = ['host', 'ben', 'cara', 'dan'];
  assert.equal(runnerOf(racers, () => true), 'host');
  assert.equal(runnerOf(racers, (id) => id !== 'host'), 'ben');
  assert.equal(runnerOf(racers, (id) => id === 'dan' || id === 'cara'), 'cara');
  assert.equal(runnerOf(racers, () => false), null);
});

test('a friend\'s game keeps only what comes from whoever runs the stand, the newest of it, and notices when they go quiet', () => {
  const follower = new StandFollower();
  follower.follow('host', 0);
  assert.equal(follower.push('ben', { ms: 50, f: [] }, 50), false, 'not from someone else');
  assert.ok(follower.push('host', { ms: 100, f: [[fruitId(0, 1, 'plum'), 0.5, 1.1, 0, -0.7, 350, 0]] }, 120));
  assert.equal(follower.push('host', { ms: 90, f: [] }, 130), false, 'an older one that came late is passed over');
  assert.equal(follower.fruit.length, 1);
  assert.equal(follower.fruit[0].kind, 'plum');
  assert.equal(follower.quiet(130 + QUIET_MS - 10), false);
  assert.equal(follower.quiet(130 + QUIET_MS + 10), true);
  // Someone else runs it now: the fruit already thrown stays until they say something, and they're given time.
  follower.follow('ben', 5000);
  assert.equal(follower.fruit.length, 1, 'the fruit in the air flies on meanwhile');
  assert.equal(follower.quiet(5000 + QUIET_MS + 10), false, 'before they\'ve said anything, they have longer');
  assert.equal(follower.quiet(5000 + QUIET_MS * 2 + 10), true);
  // Their first message is kept, even from a clock that's a little behind.
  assert.ok(follower.push('ben', { ms: 80, f: [] }, 5200));
  assert.equal(follower.fruit.length, 0);
});

test('with friends, what\'s on the order is worth two points to whoever slices it, any other fruit one, and rotten fruit none', () => {
  assert.deepEqual(FRIENDS_POINTS, { wanted: 2, extra: 1, rotten: 0 });
  assert.equal(pointsFor('wanted'), 2);
  assert.equal(pointsFor('extra'), 1);
  assert.equal(pointsFor('rotten'), 0);
  assert.equal(pointsFor('golden'), 0, 'the levels\' extras don\'t come with friends');
});

test('with friends it\'s the plain fair at every level: the same pace and rotten fruit, and none of the levels\' new things', () => {
  for (const level of LEVELS) {
    const plain = plainFairAt(level);
    // The fair as it always was, with the gentle climb, whatever each child's grown-up chose.
    const fair = fairAt(level, { gentle: true });
    for (const key of ['gravity', 'every', 'volley', 'most', 'wantedShare', 'rottenLast', 'rottenShare']) assert.deepEqual(plain[key], fair[key], `${key} at level ${level}`);
    assert.deepEqual({ across: plain.across, pairs: plain.pairs, tough: plain.tough, tips: plain.tips, bonus: plain.bonus, powers: plain.powers, bee: plain.bee }, { across: 0, pairs: 0, tough: 0, tips: 0, bonus: [], powers: [], bee: false });
    // Whatever's thrown is only ever a plain fruit or a rotten one, thrown straight up.
    const stand = new Stand({ level, plain: true, random: seeded(level) });
    for (let customer = 0; customer < DAY.length; customer += 1) {
      stand.nextCustomer();
      assert.equal(stand.special, null);
      for (let i = 0; i < 60; i += 1) {
        const throwing = stand.nextThrow();
        assert.ok(FRUIT_KINDS.includes(throwing.kind), throwing.kind);
        assert.deepEqual([throwing.across, throwing.tough, throwing.withRotten], [false, false, false]);
      }
      for (const kind of stand.wantedKinds) while (stand.left[kind] > 0) stand.slice(kind);
    }
  }
});

test('a friend\'s game keeps the stand as whoever runs it has it, and taking over, counts what\'s been sliced since', () => {
  // The host's stand counts every fruit that went to anyone, in the order the server said.
  const host = new Stand({ short: true, plain: true });
  const ben = new Stand({ short: true, plain: true });
  host.nextCustomer();
  ben.nextCustomer();
  const claims = ['apple', 'apple', 'orange', 'apple'].map((kind, n) => fruitId(n % 2, n, kind));
  for (const k of claims.slice(0, 3)) host.slice(kindOfId(k));
  assert.equal(ben.setTo(host.index, host.leftList), false, 'the same customer');
  assert.deepEqual(ben.left, { apple: 2 });
  assert.equal(ben.stats.smoothies, 0);
  // The host goes before counting the last one, and Ben counts what it hadn't: the same as the host would have.
  for (const k of claims.slice(3)) {
    host.slice(kindOfId(k));
    ben.slice(kindOfId(k));
  }
  assert.deepEqual(ben.left, host.left);
  // On to the next customer, and the day's end, as the host has it.
  for (const kind of host.wantedKinds) while (host.left[kind] > 0) host.slice(kind);
  assert.ok(host.orderDone);
  ben.setTo(host.index, host.leftList);
  assert.ok(ben.orderDone);
  assert.equal(ben.stats.smoothies, 1);
  host.nextCustomer();
  assert.equal(ben.setTo(host.index, host.leftList), true, 'a new customer');
  assert.equal(ben.customer.who, 'kit');
  assert.deepEqual(ben.left, { peach: 5 });
  // The day is over, for a friend's game, once whoever runs it has finished.
  ben.setTo(ben.customers.length);
  assert.equal(ben.stats.smoothies, 3);
  assert.equal(ben.customer, null);
});

test('the stand\'s rooms are known to both servers, and a stand is passed on to the game', () => {
  for (const file of ['../../server/worker.js', '../../tools/race-server.mjs']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /const GAMES = \[[^\]]*'smoothie-stand'/, file);
  }
  const friends = readFileSync(new URL('../../core/friends.js', import.meta.url), 'utf8');
  assert.match(friends, /\[[^\]]*'stand'[^\]]*\]\.includes\(message\.t\)/, 'a stand message is passed on to the game');
  const page = readFileSync(new URL('../../games/smoothie-stand/index.html', import.meta.url), 'utf8');
  assert.match(page, /connect-src 'self' wss:\/\/hemi-race\.infoicy\.com ws:\/\/localhost:\*/);
});
