// Bounce Back's rules: the court, the shots, the computer, resting, the levels and playing with a friend.
// Everything here runs without a screen, with a pretend child holding their hand where each test says.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BallFollower } from '../../games/bounce-back/follow.js';
import { Rally } from '../../games/bounce-back/rally.js';
import {
  advanceBall, AIM, aimAt, aimAtLevel, APEX, ballFor, BALLS, bounceNewAt, COURT, courtLevel, crossingSeconds, EXTRAS,
  gravityFor, heightAtNet, HELP, keepOnSide, LABELS, missAfterRange, modeWord, NET_CLEARANCE, NEWS, newsIsOn, OFF_THE_NET,
  PACES, RACKET, readMode, shotTo, solveShot, spreadFor, teamHits, touches,
} from '../../games/bounce-back/rules.js';

const LEVELS = Array.from({ length: 10 }, (_, index) => index + 1);

/** The same "random" numbers every time, so a test always plays out the same way. */
function seeded(seed = 7) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

const HELPED = { radius: RACKET.radius * HELP.little.size, pull: HELP.little.pull };
// Pretend children: where their hand is, frame by frame, given the ball.
const CHILDREN = {
  // Keeps an open hand still in the middle of their half.
  still: () => ({ visible: true, open: true, u: -0.6, h: 0.45, ...HELPED }),
  // Rests with a closed hand, in view.
  closed: () => ({ visible: true, open: false, u: -0.6, h: 0.45, ...HELPED }),
  // Has gone, or can't be seen.
  missing: () => ({ visible: false, open: false, u: -0.6, h: 0.45, ...HELPED }),
  // Tries, with an open hand, but nowhere near the ball.
  away: () => ({ visible: true, open: true, u: -1.25, h: 1.4, radius: RACKET.radius, pull: 0 }),
};

/** A game that keeps a list of everything that happens in it, from the first serve. */
function game(options = {}) {
  const log = [];
  const events = new Proxy({}, { get: (_, name) => (...args) => log.push([name, ...args]) });
  const rally = new Rally({ random: seeded(), ...options, events });
  rally.begin();
  rally.log = log;
  return rally;
}

/** Plays for a while, or until it's over, and says what happened meanwhile. */
function play(rally, child, seconds, { dt = 1 / 60, friend = null } = {}) {
  const from = rally.log.length;
  for (let t = 0; t < seconds && !rally.over; t += dt) {
    const inputs = { A: child(rally.ball, t) };
    if (friend) inputs.B = friend(rally.ball, t);
    rally.update(dt, inputs);
  }
  return rally.log.slice(from);
}

/**
 * A friend who plays, on side B: their own game hits the ball that's theirs once their racket is on it, as main.js
 * does for whoever joined, and the host's game is told.
 */
function friendWhoPlays(rally, hand = { visible: true, open: true, u: 0.6, h: 0.45, ...HELPED }) {
  return (ball) => {
    const theirs = ball.side === 'B' && ((ball.state === 'flying' && ball.by !== 'B') || ball.state === 'waiting');
    // A ball that's waiting for them, they go and get.
    const at = theirs && ball.state === 'waiting' ? { ...hand, u: ball.u, h: ball.h } : hand;
    if (theirs && touches(ball, at)) {
      const shot = shotTo(ball, aimAt('A', rally.players.A.racket, spreadFor(rally.hard, 0, true, rally.level)), crossingSeconds(rally.pace, rally.level, ball.kind, rally.hard), rally.envFor(ball.kind));
      rally.applyHit('B', { k: ball.stroke, u: shot.from.u, h: shot.from.h, vu: shot.vu, vh: shot.vh, elapsed: 0 });
    }
    return at;
  };
}

/** The ball waits for the child, or the computer waits to serve until their hand is back. */
const waitsForChild = ({ ball, server }) => (ball.state === 'waiting' && ball.side === 'A') || (ball.state === 'held' && server === 'B');

const count = (log, name, test = () => true) => log.filter(([event, ...rest]) => event === name && test(...rest)).length;

test('level 1 is the plain game, and every level from 2 to 10 brings something new, which stays', () => {
  assert.deepEqual(bounceNewAt(1), []);
  const plain = courtLevel(1);
  assert.equal(plain.stars || plain.bubble || plain.flags || plain.bigRacket || plain.castles || plain.rainbow || plain.breeze || plain.bird || plain.golden, false);
  assert.deepEqual(plain.specials, []);
  for (const level of LEVELS.slice(1)) {
    const news = bounceNewAt(level);
    assert.ok(news.length >= 1, `level ${level} brings something`);
    for (const { key, mark, name, nameKa } of news) {
      assert.ok(mark && name, `${key} has a picture and a name`);
      assert.match(nameKa, /[Ⴀ-ჿ]/, `${key} has a Georgian name`);
      assert.ok(newsIsOn(key, level), `${key} is on at level ${level}`);
      assert.ok(!newsIsOn(key, level - 1), `${key} wasn't on before level ${level}`);
      for (const later of LEVELS.slice(level)) assert.ok(newsIsOn(key, later), `${key} stays at level ${later}`);
    }
  }
  assert.deepEqual(Object.keys(NEWS).map(Number), LEVELS.slice(1));
});

test('on Gentle, even at level 10, a crossing takes more than 70% of the time it did at level 1, at every speed', () => {
  for (const pace of Object.keys(PACES)) {
    const first = crossingSeconds(pace, 1);
    const last = crossingSeconds(pace, 10);
    assert.ok(last / first >= 0.7, `${pace}: ${last / first}`);
    for (const level of LEVELS.slice(1)) assert.ok(crossingSeconds(pace, level) <= crossingSeconds(pace, level - 1));
    // The bubble ball floats more slowly still.
    assert.ok(crossingSeconds(pace, 3, 'bubble') > crossingSeconds(pace, 3));
  }
  assert.ok(crossingSeconds('fast', 10) > 1.3, 'even the quickest is slow');
});

test('on Medium and Tough the ball gets quicker as the levels go up, to half the time at level 10 on Medium', () => {
  for (const pace of Object.keys(PACES)) {
    for (const hard of ['medium', 'tough']) {
      assert.equal(crossingSeconds(pace, 1, 'beach', hard), crossingSeconds(pace, 1), `${pace} ${hard}: level 1 as it always was`);
      for (const level of LEVELS.slice(1)) assert.ok(crossingSeconds(pace, level, 'beach', hard) < crossingSeconds(pace, level - 1, 'beach', hard));
      assert.ok(crossingSeconds(pace, 10, 'beach', hard) < crossingSeconds(pace, 10), `${pace} ${hard}: quicker than Gentle`);
    }
    assert.ok(Math.abs(crossingSeconds(pace, 10, 'beach', 'medium') / crossingSeconds(pace, 1, 'beach', 'medium') - 0.5) < 1e-9);
    assert.ok(crossingSeconds(pace, 10, 'beach', 'tough') >= crossingSeconds(pace, 1) * 0.45, `${pace}: never under 45% of the time`);
  }
  // And the computer aims further off the hand, and misses less, level by level.
  for (const hard of ['medium', 'tough']) {
    for (const level of LEVELS.slice(1)) assert.ok(aimAtLevel(hard, level) > aimAtLevel(hard, level - 1), `${hard} ${level}`);
    assert.equal(aimAtLevel(hard, 1), AIM[hard]);
  }
  assert.ok(LEVELS.every((level) => aimAtLevel('gentle', level) === 0), 'right at the hand on Gentle, at every level');
  assert.deepEqual([missAfterRange('medium', 1), missAfterRange('medium', 10)], [[2, 4], [4, 9]]);
  assert.deepEqual([missAfterRange('gentle', 1), missAfterRange('gentle', 10)], [[1, 3], [2, 5]], 'Gentle as it was');
});

/**
 * A pretend child who chases the ball: they see it this long after it was there, their hand moves this fast,
 * in court units a second, and it's open for so long out of every cycle of so many seconds.
 */
function chaser({ delay, speed, open }) {
  const hand = { u: -0.6, h: 0.45 };
  const seen = [];
  let t = 0;
  return (ball) => {
    t += 1 / 60;
    seen.push({ u: ball.u, h: ball.h });
    const was = seen[Math.max(0, seen.length - 1 - Math.round(delay * 60))];
    const target = was.u < 0 ? was : { u: -0.6, h: 0.45 };
    const du = target.u - hand.u;
    const dh = target.h - hand.h;
    const gap = Math.hypot(du, dh);
    const move = Math.min(gap, speed / 60);
    if (gap > 0) {
      hand.u += (du / gap) * move;
      hand.h += (dh / gap) * move;
    }
    return { visible: true, open: t % open[1] < open[0], u: hand.u, h: hand.h, ...HELPED };
  };
}

test('as it comes, on Medium, a child new to it wins at level 1, and at level 10 the computer wins', () => {
  const newChild = { delay: 0.6, speed: 0.5, open: [1.2, 2] };
  const matches = (level) => [1, 2, 3, 4, 5, 6].map((seed) => {
    const rally = game({ level, hard: 'medium', goal: 5, random: seeded(seed) });
    play(rally, chaser(newChild), 900);
    return rally;
  });
  const first = matches(1);
  const last = matches(10);
  const computer = (rallies) => rallies.reduce((sum, { scores }) => sum + scores.B, 0);
  assert.ok(first.every(({ winner }) => winner === 'A'), `level 1: ${first.map(({ winner }) => winner)}`);
  assert.ok(last.filter(({ winner }) => winner === 'B').length >= 2, `level 10: ${last.map(({ winner }) => winner)}`);
  assert.ok(computer(last) > computer(first) * 3 + 6, `the computer's points: ${computer(first)} at level 1, ${computer(last)} at level 10`);
  // On Gentle it's the game as it was: however the child plays, the computer never scores.
  for (const seed of [1, 2, 3]) {
    const rally = game({ level: 10, hard: 'gentle', goal: 5, random: seeded(seed) });
    play(rally, chaser(newChild), 900);
    assert.equal(rally.scores.B, 0);
  }
});


test('every shot goes over the net, not too high, and gets where it was aimed', () => {
  const random = seeded(3);
  let checked = 0;
  for (let i = 0; i < 400; i += 1) {
    const pace = ['slow', 'medium', 'fast'][i % 3];
    const level = 1 + (i % 10);
    const wind = i % 4 === 0 ? (random() - 0.5) * 2 * EXTRAS.breeze : 0;
    const env = { gravity: gravityFor(crossingSeconds(pace, level)), wind };
    // From anywhere on side A a ball can be hit, even right by the net, to anywhere a shot can be aimed on side B.
    const ball0 = { u: -(0.02 + random() * 1.21), h: COURT.ball + random() * 1.1 };
    const to = { u: 0.28 + random() * 0.72, h: random() < 0.5 ? COURT.ball : 0.3 + random() * 0.42 };
    const { from, ...shot } = shotTo(ball0, to, crossingSeconds(pace, level), env);
    assert.ok(from.u <= -OFF_THE_NET + 1e-9, 'never hit from touching the net');
    // From where the ball was, unless it was right by the net, when it's a little further back, the lower the further.
    if (Math.abs(ball0.u) >= 0.4) assert.equal(from.u, ball0.u, 'from where the ball was');
    else assert.ok(from.u <= ball0.u && from.u >= -0.4, `from just behind where it was: ${from.u}`);
    assert.ok(heightAtNet(from, shot, env) >= NET_CLEARANCE - 1e-9, `clears the net: ${JSON.stringify({ from, to })}`);
    const ball = { ...from, vu: shot.vu, vh: shot.vh, rolling: false };
    const events = advanceBall(ball, shot.seconds, env);
    assert.equal(events.filter(({ type }) => type === 'net').length, 0, 'never touches the net');
    assert.ok(events.some(({ type, to: side }) => type === 'cross' && side === 'B'), 'goes over to the other side');
    // A shot that lands is where it was meant to be when it lands, give or take its bounce.
    if (!events.some(({ type }) => type === 'bounce')) {
      assert.ok(Math.abs(ball.u - to.u) < 0.02 && Math.abs(ball.h - to.h) < 0.02, `${JSON.stringify({ ball, to })}`);
    }
    // Over the top of the screen's play only if it started up there, and then only a little, into a breeze.
    let highest = from.h;
    const copy = { ...from, vu: shot.vu, vh: shot.vh, rolling: false };
    for (let t = 0; t < shot.seconds; t += 1 / 120) {
      advanceBall(copy, 1 / 120, env);
      highest = Math.max(highest, copy.h);
    }
    assert.ok(highest <= Math.max(APEX, from.h + 0.04, to.h + 0.04) + 0.05, `${highest} from ${from.h}`);
    checked += 1;
  }
  assert.equal(checked, 400);
});

test('a ball bounces on the court, comes to rest, and comes back off the net on the side it came from', () => {
  const env = { gravity: gravityFor(crossingSeconds('slow', 1)), wind: 0 };
  const ball = { u: -0.5, h: 0.6, vu: 0, vh: 0, rolling: false };
  const events = advanceBall(ball, 20, env);
  const bounces = events.filter(({ type }) => type === 'bounce');
  assert.ok(bounces.length > 3, 'a beach ball is bouncy');
  for (let i = 1; i < bounces.length; i += 1) assert.ok(bounces[i].speed < bounces[i - 1].speed, 'each bounce a little lower');
  assert.equal(bounces.at(-1).settled, true);
  assert.equal(ball.rolling, true);
  assert.ok(Math.abs(ball.h - COURT.ball) < 1e-9);

  const low = { u: -0.4, h: 0.2, vu: 0.8, vh: 0, rolling: false };
  const hits = advanceBall(low, 1.5, env);
  assert.ok(hits.some(({ type }) => type === 'net'));
  assert.ok(low.u < 0, 'it stays on its own side');
  assert.ok(!hits.some(({ type }) => type === 'cross'));
});

test('only an open hand that can be seen hits the ball: a missing, closed or unsure one never does', () => {
  const ball = { u: -0.6, h: 0.45 };
  const on = { u: -0.6, h: 0.45, radius: RACKET.radius };
  assert.equal(touches(ball, { ...on, visible: true, open: true }), true);
  assert.equal(touches(ball, { ...on, visible: true, open: false }), false);
  assert.equal(touches(ball, { ...on, visible: false, open: true }), false);
  assert.equal(touches(ball, null), false);
  assert.equal(touches({ u: -0.6, h: 0.45 + RACKET.radius + COURT.ball + 0.01 }, { ...on, visible: true, open: true }), false);

  // The child's serve waits right on the hand, and never goes while the hand is closed or gone.
  for (const child of ['closed', 'missing']) {
    const rally = game({ random: seeded(), hard: 'medium' });
    const log = play(rally, CHILDREN[child], 30);
    assert.equal(count(log, 'onHit'), 0, `${child}: nothing hit`);
    assert.equal(rally.ball.state, 'held', `${child}: still waiting`);
  }
  // Open, and "open" from the tracker isn't enough without being seen.
  const rally = game({ random: seeded() });
  const log = play(rally, () => ({ ...CHILDREN.missing(), open: true }), 10);
  assert.equal(count(log, 'onHit'), 0);
  assert.equal(rally.players.A.racket.open, false);
});

test('on Gentle, the ball always waits for the child, so the game can\'t be lost, and the computer is kind', () => {
  for (const child of ['away', 'closed', 'missing']) {
    const rally = game({ random: seeded(5), hard: 'gentle', goal: 5 });
    // The child hits their serve first, then plays as the test says.
    let served = false;
    play(rally, (ball) => {
      if (!served && ball.state === 'held') return CHILDREN.still();
      served = true;
      return CHILDREN[child]();
    }, 240);
    assert.equal(rally.scores.B, 0, `${child}: the computer never scores`);
    // A child who rests: the ball is waiting for them, or the computer waits to serve until their hand is back.
    if (child !== 'away') assert.ok(waitsForChild(rally), `${child}: ${rally.ball.state}`);
    // A child who tries and misses: it waited for them, and drifted over to their open hand.
    if (child !== 'missing') assert.ok(count(rally.log, 'onWait', (side) => side === 'A') >= 1, `${child}: the ball waited`);
  }
  // A child who holds an open hand still wins, as the computer aims right at the hand and misses after a few.
  const rally = game({ random: seeded(5), hard: 'gentle', goal: 5 });
  const log = play(rally, CHILDREN.still, 400);
  assert.equal(rally.winner, 'A');
  assert.deepEqual(rally.scores, { A: 5, B: 0 });
  assert.ok(rally.over);
  assert.ok(count(log, 'onOver') === 1);
  assert.equal(AIM.gentle, 0);
});

test('resting never loses a point, on Medium and Tough too: the ball waits for a hand that wasn\'t open', () => {
  for (const hard of ['medium', 'tough']) {
    for (const child of ['closed', 'missing']) {
      const rally = game({ random: seeded(2), hard, goal: 5 });
      let served = false;
      play(rally, (ball) => {
        if (!served && ball.state === 'held') return CHILDREN.still();
        served = true;
        return CHILDREN[child]();
      }, 200);
      assert.equal(rally.scores.B, 0, `${hard}, ${child}`);
      assert.ok(waitsForChild(rally), `${hard}, ${child}: ${rally.ball.state}`);
    }
  }
});

test('on Medium, a child who tries and misses gives the computer the point, and a game can be lost', () => {
  const rally = game({ random: seeded(4), hard: 'medium', goal: 5 });
  let served = false;
  play(rally, (ball) => {
    if (!served && ball.state === 'held') return CHILDREN.still();
    served = true;
    return CHILDREN.away();
  }, 400);
  assert.equal(rally.winner, 'B');
  assert.equal(rally.scores.B, 5);
});

test('the computer aims at the child\'s hand, a little way off on the harder settings, and serves only to a hand it can see', () => {
  const racket = { visible: true, u: -0.5, h: 0.5 };
  assert.deepEqual(aimAt('A', racket, 0), { u: -0.5, h: 0.5 });
  const random = seeded(9);
  for (let i = 0; i < 50; i += 1) {
    const aim = aimAt('A', racket, AIM.tough, random);
    const off = Math.abs(Math.abs(aim.u) - 0.5);
    assert.ok(off >= AIM.tough * 0.59 && off <= AIM.tough + 1e-9, `${off}`);
    assert.ok(aim.u < 0 && aim.h >= 0.3 && aim.h <= 0.72);
  }
  assert.ok(AIM.gentle < AIM.medium && AIM.medium < AIM.tough);
  // A hand that can't be seen gets the ball in the middle of its half.
  assert.deepEqual(aimAt('A', { visible: false, u: -1, h: 1 }, 0), { u: -0.6, h: 0.45 });

  // The second point is the computer's serve. It waits until the child's hand has been in view a moment.
  const rally = game({ random: seeded(1) });
  rally.startPoint();
  assert.equal(rally.server, 'B');
  play(rally, CHILDREN.missing, 20);
  assert.equal(rally.ball.state, 'held', 'nobody to serve to');
  const log = play(rally, CHILDREN.closed, 3);
  assert.equal(count(log, 'onHit', (side) => side === 'B'), 1, 'served once the hand was in view');
});

test('the computer misses one of the child\'s shots after a few, more of them at higher levels and on harder settings', () => {
  for (const hard of ['gentle', 'medium', 'tough']) {
    let last = [0, 0];
    for (const level of LEVELS) {
      const range = missAfterRange(hard, level);
      assert.ok(range[0] >= 1 && range[0] <= range[1]);
      assert.ok(range[0] >= last[0] && range[1] >= last[1], `${hard} ${level}`);
      last = range;
    }
  }
  assert.ok(missAfterRange('gentle', 1)[1] <= missAfterRange('medium', 1)[1]);
  assert.ok(missAfterRange('medium', 10)[0] <= missAfterRange('tough', 10)[0]);
  // Longer rallies at level 10 than at level 1, for a child who keeps the hand still and open.
  const longest = (level) => {
    const rally = game({ level, random: seeded(6), goal: 5 });
    play(rally, CHILDREN.still, 600);
    return rally.stats.longest;
  };
  assert.ok(longest(10) > longest(1), `${longest(10)} > ${longest(1)}`);
});

test('first to the points chosen wins, serves take turns, and the child serves first', () => {
  const rally = game({ random: seeded(8), goal: 7 });
  assert.equal(rally.server, 'A');
  play(rally, CHILDREN.still, 900);
  const { log } = rally;
  assert.equal(rally.scores.A, 7);
  assert.equal(rally.winner, 'A');
  const servers = log.filter(([name]) => name === 'onServe').map(([, side]) => side);
  assert.deepEqual(servers.slice(0, 4), ['A', 'B', 'A', 'B']);
  assert.equal(count(log, 'onPoint'), 7);
});

test('each level\'s new things work: stars, the bubble ball, flags, the big racket, sandcastles, the rainbow ball, the breeze, the bluebird and the golden ball', () => {
  // Stars float on the child's side, and the glove catches them just by coming near, open or closed.
  {
    const rally = game({ level: 2, random: seeded(3) });
    play(rally, CHILDREN.missing, 6);
    const star = rally.items.find(({ kind }) => kind === 'star');
    assert.ok(star, 'a star came');
    assert.ok(star.u < 0, 'on the child\'s side');
    const log = play(rally, () => ({ ...CHILDREN.closed(), u: star.u, h: star.h }), 0.5);
    assert.equal(count(log, 'onPrize', (kind) => kind === 'star'), 1);
    assert.equal(rally.stats.prizes.star, 1);
  }
  // The bubble ball floats more slowly, on every third point.
  assert.equal(ballFor(3, 3), 'bubble');
  assert.equal(ballFor(3, 1), 'beach');
  assert.equal(ballFor(2, 3), 'beach');
  assert.equal(ballFor(7, 3), 'rainbow', 'the newest special ball comes first');
  assert.equal(ballFor(7, 6), 'bubble');
  assert.equal(ballFor(10, 3), 'golden');
  assert.equal(ballFor(10, 1, { lastPoint: true }), 'golden', 'the last point is golden');
  assert.equal(ballFor(9, 1, { lastPoint: true }), 'beach');
  assert.equal(ballFor(10, 3, { extras: false }), 'beach', 'never with a friend');
  // Flags: each of the child's hits colours one in, and a full row is a trophy.
  {
    const rally = game({ level: 4, random: seeded(3), goal: 11 });
    const log = play(rally, CHILDREN.still, 300);
    assert.ok(rally.stats.hits.A >= EXTRAS.flags);
    assert.equal(rally.stats.prizes.trophy, Math.floor(rally.stats.hits.A / EXTRAS.flags));
    assert.equal(count(log, 'onFlag'), rally.stats.hits.A);
  }
  // The big racket: a power-up on the child's side, which makes the racket bigger while the hand is open.
  {
    const rally = game({ level: 5, random: seeded(3) });
    play(rally, CHILDREN.missing, EXTRAS.firstPowerAfter + 0.5);
    const power = rally.items.find(({ kind }) => kind === 'big');
    assert.ok(power, 'it came');
    play(rally, () => ({ ...CHILDREN.closed(), u: power.u, h: power.h }), 0.2);
    assert.equal(rally.power?.kind, 'big');
    play(rally, CHILDREN.closed, 1);
    assert.equal(rally.players.A.racket.radius, HELPED.radius * 1.4);
    // Resting never wastes it: its time only runs while the hand is open.
    play(rally, CHILDREN.closed, 20);
    assert.equal(rally.power?.left, EXTRAS.powerSeconds);
    play(rally, CHILDREN.still, EXTRAS.powerSeconds + 0.5);
    assert.equal(rally.power, null);
  }
  // Sandcastles on the computer's side: a shot that lands on one knocks it over for a shell, and it's built again.
  {
    const rally = game({ level: 6, random: seeded(3), goal: 11 });
    assert.equal(rally.castles.length, 2);
    assert.ok(rally.castles.every(({ u }) => u > 0));
    const log = play(rally, CHILDREN.still, 120);
    assert.ok(count(log, 'onCastle', (_, what) => what === 'fell') >= 1);
    assert.ok(count(log, 'onCastle', (_, what) => what === 'built') >= 1);
    assert.equal(rally.stats.prizes.shell, count(log, 'onCastle', (_, what) => what === 'fell'));
  }
  // The rainbow and golden balls give a star and a gem for each of the child's hits.
  assert.equal(BALLS.rainbow.prize, 'star');
  assert.equal(BALLS.golden.prize, 'gem');
  {
    const rally = game({ level: 10, random: seeded(3), goal: 7 });
    play(rally, CHILDREN.still, 500);
    assert.ok(rally.stats.prizes.gem >= 1, 'gems from the golden ball');
  }
  // The breeze, from level 8, pushes one way and then the other, gently.
  {
    const rally = game({ level: 8, random: seeded(3) });
    const winds = [];
    play(rally, (ball, t) => {
      winds.push(rally.wind);
      return CHILDREN.closed();
    }, 40);
    assert.ok(Math.max(...winds) > 0 && Math.min(...winds) < 0);
    assert.ok(Math.max(...winds.map(Math.abs)) <= EXTRAS.breeze);
    assert.equal(new Rally({ level: 7 }).plan.breeze, 0);
  }
  // The bluebird bops a ball that would bounce twice on the child's side back up to their hand.
  {
    const rally = game({ level: 9, hard: 'medium', random: seeded(3) });
    rally.power = { kind: 'bird', left: 100, seconds: 100 };
    rally.startPoint();
    let served = false;
    const log = play(rally, (ball) => {
      if (ball.by === 'B') served = true;
      // An open hand held up high near the net: the ball comes down behind it, on the court.
      return served ? { visible: true, open: true, u: -0.25, h: 1.4, radius: RACKET.radius, pull: 0 } : CHILDREN.still();
    }, 20);
    assert.ok(count(log, 'onSave') >= 1, 'the bird saved it');
    assert.ok(rally.stats.saves >= 1);
  }
});

test('with a friend, it\'s the plain game, and the host\'s game takes the friend\'s hit on the right ball', () => {
  const rally = game({ level: 10, mode: 'host', random: seeded(3) });
  assert.equal(rally.players.B.kind, 'remote');
  assert.equal(rally.extras, false);
  assert.deepEqual(rally.castles, []);
  assert.equal(rally.plan.breeze, 0);
  // The host serves to the friend's hand.
  const friendHand = { visible: true, open: true, u: 0.6, h: 0.45, radius: RACKET.radius, pull: 0.7 };
  const log = play(rally, CHILDREN.still, 1, { friend: () => friendHand });
  assert.equal(count(log, 'onHit', (side) => side === 'A'), 1);
  play(rally, CHILDREN.still, 1.6, { friend: () => ({ ...friendHand, open: false }) });
  assert.equal(rally.ball.side, 'B');
  const { stroke } = rally.ball;
  const shot = shotTo(rally.ball, aimAt('A', rally.players.A.racket, 0), crossingSeconds('slow', 10), rally.envFor('beach'));
  const hit = { u: shot.from.u, h: shot.from.h, vu: shot.vu, vh: shot.vh, elapsed: 0.1 };
  assert.equal(rally.applyHit('B', { ...hit, k: stroke - 1 }), false, 'a hit on a ball that has gone');
  assert.equal(rally.applyHit('A', { ...hit, k: stroke }), false, 'only the friend\'s hits come in');
  assert.equal(rally.applyHit('B', { ...hit, u: -0.3, k: stroke }), false, 'from their own side');
  assert.equal(rally.applyHit('B', { ...hit, vu: NaN, k: stroke }), false);
  assert.equal(rally.applyHit('B', { ...hit, k: stroke }), true);
  assert.equal(rally.ball.by, 'B');
  assert.equal(rally.ball.stroke, stroke + 1);
  assert.equal(rally.stats.hits.B, 1);
  assert.equal(rally.applyHit('B', { ...hit, k: stroke }), false, 'once');
});

test('with a friend, a miss is a point even on Gentle, a hit on its way still counts, and resting still waits', () => {
  const serveAndThen = (friend) => {
    const rally = game({ mode: 'host', hard: 'gentle', random: seeded(3), goal: 5 });
    const log = play(rally, CHILDREN.still, 25, { friend });
    return { rally, log };
  };
  const away = serveAndThen(() => ({ visible: true, open: true, u: 1.25, h: 1.4, radius: RACKET.radius, pull: 0 }));
  assert.ok(away.rally.scores.A >= 1, 'a friend who tried and missed');
  const resting = serveAndThen(() => ({ visible: true, open: false, u: 0.6, h: 0.45, radius: RACKET.radius, pull: 0 }));
  assert.equal(resting.rally.scores.A, 0, 'a friend who rested');
  assert.ok(count(resting.log, 'onWait', (side) => side === 'B') >= 1);
  // And a long rally between friends drifts further from the hands, so it ends sometime.
  assert.equal(spreadFor('gentle', 3, true), 0);
  assert.ok(spreadFor('gentle', 12, true) > 0);
  assert.equal(spreadFor('gentle', 12, false), 0, 'not against the computer, which misses on purpose');
  assert.ok(spreadFor('gentle', 100, true) <= 0.25);
});

test('together with a friend, every hit is one for the team, nobody scores a point, and both win once the team has its hits', () => {
  const rally = game({ mode: 'host', team: true, goal: 6, random: seeded(3) });
  assert.equal(rally.team, true);
  const log = play(rally, CHILDREN.still, 120, { friend: friendWhoPlays(rally) });
  assert.equal(rally.over, true);
  assert.equal(rally.winner, 'both');
  assert.equal(rally.teamHits, 6);
  // They took turns, so half of the hits are each one's.
  assert.deepEqual(rally.scores, { A: 3, B: 3 });
  assert.equal(count(log, 'onPoint'), 0);
  assert.equal(count(log, 'onTeamHit'), 6);
  assert.equal(count(log, 'onOver', (winner) => winner === 'both'), 1);
  // What goes to the friend's game: the hits each has made, nobody the winner, and that it's over.
  const wire = rally.wire();
  assert.deepEqual([wire.a, wire.b, wire.g, wire.w], [3, 3, 0, 1]);
  // The last hit is seen going over before it ends, and a hit after it doesn't count.
  const last = rally.log.findLastIndex(([name]) => name === 'onTeamHit');
  const over = rally.log.findIndex(([name]) => name === 'onOver');
  assert.ok(over > last);
});

test('together, a ball that gets past someone waits for them, costs nothing, and the hits in a row start again', () => {
  const rally = game({ mode: 'host', team: true, goal: 20, hard: 'tough', random: seeded(3) });
  // The friend tries, with an open hand, nowhere near it: against each other, on Tough, that's a point lost.
  const away = () => ({ visible: true, open: true, u: 1.25, h: 1.4, radius: RACKET.radius, pull: 0 });
  const log = play(rally, CHILDREN.still, 12, { friend: away });
  assert.ok(count(log, 'onWait', (side) => side === 'B') >= 1);
  assert.equal(count(log, 'onPoint'), 0);
  assert.deepEqual(rally.scores, { A: 1, B: 0 }, 'only the hit that was made counts, and nothing is taken away');
  assert.equal(rally.rallyHits, 0);
  assert.equal(rally.ball.state, 'waiting');
  assert.equal(rally.ball.side, 'B');
  // It waits for as long as it takes.
  play(rally, CHILDREN.still, 30, { friend: away });
  assert.deepEqual([rally.ball.state, rally.scores.A, rally.over], ['waiting', 1, false]);
  // Back with a hand that's there, the friend hits it, and on they go, the child too.
  play(rally, CHILDREN.still, 40, { friend: friendWhoPlays(rally) });
  assert.ok(rally.scores.A >= 3 && rally.scores.B >= 3, `${rally.scores.A} and ${rally.scores.B}`);
  assert.ok(rally.stats.longest >= 4);
});

test('together, a child who misses loses nothing either: the ball waits for them, on any How hard', () => {
  for (const hard of ['gentle', 'medium', 'tough']) {
    const rally = game({ mode: 'host', team: true, goal: 20, hard, random: seeded(4) });
    // The child serves and then tries and misses what comes back.
    let served = false;
    const child = (ball) => {
      if (ball.by === 'A') served = true;
      return served ? CHILDREN.away() : CHILDREN.still();
    };
    const log = play(rally, child, 20, { friend: friendWhoPlays(rally) });
    assert.equal(count(log, 'onPoint'), 0, hard);
    assert.ok(count(log, 'onWait', (side) => side === 'A') >= 1, hard);
    assert.equal(rally.winner, null, hard);
    // Nothing was taken away: the team still has every hit that was made.
    assert.equal(rally.teamHits, rally.stats.hits.A + rally.stats.hits.B, hard);
    assert.ok(rally.teamHits >= 2, hard);
  }
});

test('together, shots keep coming to the hand however long the rally goes on, and against each other they drift off it', () => {
  const hand = { visible: true, open: true, u: 0.6, h: 0.45, radius: RACKET.radius, pull: 0 };
  for (const [team, drifts] of [[true, false], [false, true]]) {
    const rally = game({ mode: 'host', team, goal: 99, random: seeded(5) });
    play(rally, CHILDREN.still, 0.2, { friend: () => hand });
    rally.rallyHits = 40;
    const off = Array.from({ length: 30 }, () => Math.abs(Math.abs(rally.targetFor('A').u) - 0.6));
    assert.equal(Math.max(...off) > 0.05, drifts, `${team ? 'together' : 'against each other'}: ${Math.max(...off)} off`);
  }
});

test('together is only with a friend, and how many hits the team makes comes from the host\'s points to win', () => {
  assert.equal(new Rally({ mode: 'solo', team: true }).team, false);
  assert.equal(new Rally({ mode: 'host' }).team, false);
  assert.deepEqual([5, 7, 11].map(teamHits), [20, 30, 40]);
  assert.equal(teamHits(3), 20);
});

test('a friend\'s game shows the ball where it is now, and its own hit at once, until the other game has it', () => {
  const follower = new BallFollower();
  const envFor = () => ({ gravity: gravityFor(crossingSeconds('slow', 1)), wind: 0 });
  assert.equal(follower.ballAt(0, envFor), null);
  // Sent 50 ms before it arrives, going along at 0.5 a second.
  follower.push({ ms: 1000, x: -0.5, y: 0.5, vx: 0.5, vy: 0, s: 1, k: 4, a: 1, b: 2, n: 3, f: 0, l: 1, sv: 1, g: 0, r: 0, w: 0 }, 5050);
  const now = follower.ballAt(5050 + 200, envFor);
  assert.equal(now.state, 'flying');
  assert.equal(now.by, 'A');
  assert.ok(Math.abs(now.u - (-0.5 + 0.5 * 0.2)) < 0.01, `moved on by what has passed since: ${now.u}`);
  assert.deepEqual(follower.score, { A: 1, B: 2, rally: 3, server: 'A', winner: null, over: false, stroke: 4 });
  // Not past what it could know: half a second at most.
  assert.ok(follower.ballAt(5050 + 5000, envFor).u < -0.5 + 0.5 * 0.41);
  // The child here hits it back: shown at once, flying back.
  follower.hitHere({ u: 0.4, h: 0.5, vu: -0.5, vh: 0.4, kind: 'beach', by: 'B' }, 4, 6000);
  assert.ok(follower.waitingForHit);
  const own = follower.ballAt(6100, envFor);
  assert.ok(own.u < 0.4 && own.by === 'B');
  // A message about the same ball, from before the hit got there, doesn't undo it.
  follower.push({ ms: 2000, x: 0.45, y: 0.4, vx: 0.5, vy: -0.2, s: 1, k: 4, a: 1, b: 2, n: 3, f: 0, l: 1, sv: 1, g: 0, r: 0, w: 0 }, 6100);
  assert.ok(follower.waitingForHit);
  // Once the other game has it, it's that game's ball again.
  follower.push({ ms: 2100, x: 0.35, y: 0.52, vx: -0.5, vy: 0.3, s: 1, k: 5, a: 1, b: 2, n: 4, f: 0, l: 2, sv: 1, g: 0, r: 0, w: 0 }, 6200);
  assert.equal(follower.waitingForHit, false);
  assert.equal(follower.ballAt(6200, envFor).stroke, 5);
});

test('a racket is kept on its own side of the net, above the court', () => {
  assert.deepEqual(keepOnSide('A', 0.3, 0.5), { u: -0.08, h: 0.5 });
  assert.deepEqual(keepOnSide('B', 2, -1), { u: 1.25, h: COURT.ball });
  assert.deepEqual(keepOnSide('A', NaN, NaN), { u: -0.6, h: 0.45 });
});

test('how hard and how quick go to a friend\'s game in one word, and come back the same', () => {
  for (const hard of ['gentle', 'medium', 'tough']) {
    for (const pace of ['slow', 'medium', 'fast']) {
      const word = modeWord(hard, pace);
      assert.match(word, /^[A-Za-z]{1,12}$/, 'as the server allows');
      assert.deepEqual(readMode(word), { hard, pace });
    }
  }
  assert.deepEqual(readMode('nonsense'), { hard: 'gentle', pace: 'slow' });
  assert.deepEqual(readMode(undefined), { hard: 'gentle', pace: 'slow' });
});

test('what Bounce Back says out loud has a voice file, and anything new is only written, in both languages', () => {
  const lines = JSON.parse(readFileSync(new URL('../../core/audio/voice/lines.json', import.meta.url)));
  const known = new Set(lines.map(({ text }) => text));
  const source = readFileSync(new URL('../../games/bounce-back/main.js', import.meta.url), 'utf8');
  const praise = source.match(/const PRAISE = \[([^\]]+)\]/)[1].match(/'([^']+)'/g).map((text) => text.slice(1, -1));
  const finish = source.match(/finishLine: '([^']+)'/)[1];
  for (const text of [...praise, finish]) assert.ok(known.has(text), `${text} has a voice file`);
  // The hint is new, so it's only shown, never said.
  const hint = source.match(/const HINT = \['([^']+)', '([^']+)'\]/);
  assert.ok(!known.has(hint[1]));
  assert.match(hint[2], /[Ⴀ-ჿ]/);
  assert.match(source, /key: 'bounce-hint'[^}]+silent: true/);
  // Nothing else calls say() with words of its own.
  assert.deepEqual([...source.matchAll(/\.say\('([^']+)'/g)].map(([, text]) => text).filter((text) => !known.has(text)), []);
  for (const [key, [en, ka]] of Object.entries(LABELS)) {
    assert.ok(en, key);
    assert.match(ka, /[Ⴀ-ჿ]/, `${key} has Georgian`);
  }
});
