// Giraffe's Goal: a real match, with kickers who shoot on a clock and another team that can win it; the gentle match,
// with kickers who wait for a hand that's ready, and where a ball going in or a rest costs nothing; balls a ready
// glove saves at their rings, where the balls go, and what each level brings. Everything here runs without a screen,
// with a pretend child moving a glove. The tests of the old kind rules play the gentle match, as makeGoal does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BALL, BIG, bigFor, EXTRAS, Goal, goalLevel, goalNewAt, goalsToLose, KICKERS, LABELS, LET_IN, LINGER, LOST_SECONDS, NEWS,
  newsIsOn, PARTY_SECONDS, REACHES, REACH_NAMES, RUN_UP, SAVES_CHOICES, SAVE_FROM, SPOT,
} from '../../games/giraffe-goal/goal.js';
import { byId } from '../../core/body/roster.js';

const FRAME = 1 / 60;
const ASPECT = 16 / 9;
const LEVELS = Array.from({ length: 10 }, (_, index) => index + 1);
const GLOVE = 0.06; // How far the pretend glove reaches from its middle, in screen heights.

/** The same numbers every time, so a test that passes keeps passing. */
function seeded(seed = 7) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return value / 2147483647;
  };
}

function makeGoal(options = {}) {
  const log = [];
  const goal = new Goal({ random: seeded(), stakes: 'gentle', onEvent: (event) => log.push(event), ...options });
  goal.log = log;
  return goal;
}

const said = (goal, type) => goal.log.filter((event) => event.type === type);
const gap = (a, b) => Math.hypot((a.x - b.x) * ASPECT, a.y - b.y);

/** A glove at a place: in the picture, and ready to save, unless it's said not to be. */
function gloveAt(at, { ready = true, visible = true } = {}) {
  return { glove: { visible, ready: visible && ready, x: at.x, y: at.y, reach: (x, y) => Math.max(0, gap({ x, y }, at) - GLOVE) } };
}
const NO_HAND = { glove: null };
const MIDDLE = { x: 0.5, y: 0.5 };

/** Runs the match for a while with the same input, or one worked out each frame, or until something is so. */
function run(goal, seconds, input, until = () => false) {
  let t = 0;
  for (; t < seconds && !until(); t += FRAME) goal.update(FRAME, typeof input === 'function' ? input(t) : input);
  return t;
}

/** Runs until a ball has been kicked, with a ready glove waiting at a place, and gives that ball. */
function kickOff(goal, at = MIDDLE) {
  const before = said(goal, 'kick').length;
  run(goal, 20, gloveAt(at), () => said(goal, 'kick').length > before);
  return said(goal, 'kick').at(-1).shot;
}

/**
 * A pretend child: moves the glove towards wherever the match wants it, at a hand's speed, ready to save all the
 * while. misses is which shots to let in, by their number from 0, by keeping the hand away from them.
 */
function keeper(goal, { speed = 1.2, misses = () => false } = {}) {
  const hand = { ...MIDDLE };
  return () => {
    const wanted = goal.wants();
    const away = wanted?.what === 'ball' && misses(goal.stats.shots - 1);
    const aim = away ? { x: 1 - wanted.x, y: 0.9 } : wanted;
    if (aim) {
      const far = gap(aim, hand);
      const step = Math.min(far, speed * FRAME);
      if (far > 0) {
        hand.x += (((aim.x - hand.x) * ASPECT) / far) * (step / ASPECT);
        hand.y += ((aim.y - hand.y) / far) * step;
      }
    }
    return gloveAt(hand);
  };
}

function playThrough(goal, options = {}, seconds = 400) {
  const child = keeper(goal, options);
  return run(goal, seconds, () => child(), () => goal.done);
}

/* ---------- kickers, balls and saves ---------- */

test('a kicker waits for a hand that is ready to save, however long that takes, and then runs up and shoots', () => {
  const goal = makeGoal();
  assert.deepEqual(goal.kickers.map(({ who, state }) => [who, state]), [['truffle', 'ready']]);
  // No hand at all, then a hand in the picture that isn't ready: a fist, or one that isn't held up.
  run(goal, 20, NO_HAND);
  run(goal, 20, gloveAt(MIDDLE, { ready: false }));
  assert.equal(goal.stats.shots, 0);
  assert.equal(said(goal, 'runup').length, 0);
  assert.equal(goal.kickers[0].state, 'ready');
  // Ready: the run-up starts within half a second, and the ball is kicked at the end of it.
  const waited = run(goal, 5, gloveAt(MIDDLE), () => said(goal, 'runup').length > 0);
  assert.ok(waited < 0.5, `the run-up started after ${waited} s`);
  assert.equal(goal.kickers[0].state, 'runup');
  const ran = run(goal, 5, gloveAt(MIDDLE), () => goal.stats.shots > 0);
  assert.ok(Math.abs(ran - RUN_UP) < 0.05, `the kick came after ${ran} s`);
  assert.equal(goal.kickers[0].state, 'kicked');
  const [shot] = goal.shots;
  assert.deepEqual([shot.kind, shot.state, shot.from], ['plain', 'flying', SPOT]);
});

test('a ball comes from the spot to its ring, growing, in the time the level gives it', () => {
  const goal = makeGoal();
  const shot = kickOff(goal);
  const start = goal.ballAt(shot);
  assert.ok(gap(start, SPOT) < 0.02 && Math.abs(start.r - BALL.far) < 0.002);
  let last = start.r;
  // Nobody near it: it arrives after its flight, waits at the line a moment, and goes in.
  const far = { x: 1 - shot.to.x, y: 0.95 };
  const flew = run(goal, 20, () => {
    const ball = goal.ballAt(shot);
    assert.ok(ball.r >= last - 1e-9, 'it never shrinks on its way');
    last = ball.r;
    return gloveAt(far);
  }, () => shot.t >= 1);
  assert.ok(Math.abs(flew - goalLevel(1).flight) < 0.05, `it took ${flew} s`);
  const end = goal.ballAt(shot);
  assert.ok(gap(end, shot.to) < 1e-6 && Math.abs(end.r - BALL.near) < 1e-6);
  const waited = run(goal, 5, gloveAt(far), () => shot.state === 'in');
  assert.ok(Math.abs(waited - LINGER) < 0.05, `it waited ${waited} s at the line`);
});

test('a ready glove at the ring saves the ball, and the ring says so as soon as the glove is there', () => {
  const goal = makeGoal();
  const shot = kickOff(goal);
  run(goal, 1, gloveAt(shot.to));
  assert.equal(shot.covered, true, 'the ring shows the glove is in the right place, long before the ball comes');
  run(goal, 10, gloveAt(shot.to), () => shot.state !== 'flying');
  assert.equal(shot.state, 'saved');
  assert.ok(shot.t >= SAVE_FROM && shot.t <= 1, `saved ${shot.t} of the way`);
  assert.deepEqual([goal.stats.saves, goal.stats.goals, goal.stats.run], [1, 0, 1]);
  assert.equal(said(goal, 'save').length, 1);
});

test('a glove that is not ready, or is somewhere else, does not save, and one that gets there late still does', () => {
  // At the ring, but not ready: a fist, or an open hand that isn't held up.
  const unready = makeGoal();
  const first = kickOff(unready);
  run(unready, 10, gloveAt(first.to, { ready: false }), () => first.state !== 'flying');
  assert.equal(first.covered, false);
  assert.deepEqual([first.state, unready.stats.saves, unready.stats.goals], ['in', 0, 1]);
  // Ready, but a long way from the ring.
  const elsewhere = makeGoal();
  const second = kickOff(elsewhere);
  run(elsewhere, 10, gloveAt({ x: 1 - second.to.x, y: 0.95 }), () => second.state !== 'flying');
  assert.deepEqual([second.state, elsewhere.stats.saves], ['in', 0]);
  // Not there until the ball has arrived: there's a moment at the line in which it can still be saved.
  const late = makeGoal();
  const third = kickOff(late);
  run(late, 10, gloveAt({ x: 1 - third.to.x, y: 0.95 }), () => third.t >= 1);
  run(late, LINGER * 0.6, gloveAt(third.to));
  assert.deepEqual([third.state, late.stats.saves], ['saved', 1]);
});

test('a ball that goes in costs nothing, and the next ones come slower and nearer the glove', () => {
  const goal = makeGoal();
  const plain = goalLevel(1).flight;
  const corner = { x: 0.24, y: 0.66 };
  const letIn = () => {
    const shot = kickOff(goal, corner);
    // The hand stays where it is, not ready, until the ball has gone in.
    run(goal, 20, gloveAt(corner, { ready: false }), () => shot.state === 'in');
    return shot;
  };
  const shots = [letIn(), letIn(), letIn(), letIn(), letIn()];
  assert.deepEqual(shots.map((shot) => Math.round((shot.flight / plain) * 100) / 100), [1, 1.2, 1.4, 1.6, 1.6]);
  assert.deepEqual([goal.stats.saves, goal.stats.goals, goal.stats.run], [0, 5, 0]);
  // Where each would have gone with no misses, from a match with the same luck: each later one is nearer the hand.
  const twin = makeGoal();
  const unhelped = shots.map(() => {
    const shot = kickOff(twin, corner);
    run(twin, 20, gloveAt(shot.to), () => shot.state === 'saved');
    return shot;
  });
  const nearer = shots.map((shot, index) => gap(shot.to, corner) / gap(unhelped[index].to, corner));
  assert.ok(Math.abs(nearer[0] - 1) < 1e-6, 'the first is where it would have been');
  for (const [index, share] of [[1, 0.75], [2, 0.5], [3, 0.25], [4, 0.25]]) assert.ok(Math.abs(nearer[index] - share) < 0.02, `after ${index} misses: ${nearer[index]}`);
  // A save, and they're as they were.
  const saved = kickOff(goal, corner);
  run(goal, 20, gloveAt(saved.to), () => saved.state === 'saved');
  assert.equal(kickOff(goal, corner).flight, plain);
});

test('the match is won by saves, however many shots it takes, and nothing is taken away', () => {
  for (const saves of SAVES_CHOICES) {
    const goal = makeGoal({ saves });
    // Every other ball goes in.
    const took = playThrough(goal, { misses: (shot) => shot % 2 === 1 });
    assert.equal(goal.done, true, `${saves} saves: over after ${took} s`);
    assert.equal(goal.stats.saves, saves);
    assert.ok(goal.stats.goals >= saves - 1, `${goal.stats.goals} went in`);
    assert.equal(goal.stats.shots, goal.stats.saves + goal.stats.goals);
    assert.equal(said(goal, 'won').length, 1);
  }
  assert.equal(makeGoal({ saves: 3 }).target, 10, 'a number of saves that is not a choice is 10');
});

test('once the match is won there is a party, and then it is over', () => {
  const goal = makeGoal({ saves: 6 });
  run(goal, 400, (() => {
    const child = keeper(goal);
    return () => child();
  })(), () => goal.phase === 'won');
  assert.deepEqual([goal.phase, goal.done], ['won', false]);
  const party = run(goal, 10, NO_HAND, () => goal.done);
  assert.ok(Math.abs(party - PARTY_SECONDS) < 0.05);
  // And nothing more happens.
  const shots = goal.stats.shots;
  run(goal, 5, gloveAt(MIDDLE));
  assert.equal(goal.stats.shots, shots);
});

test('a child who rests comes back to a kicker who has waited: nothing is kicked, and nothing is lost', () => {
  const goal = makeGoal();
  const child = keeper(goal);
  run(goal, 400, () => child(), () => goal.stats.saves === 3 && !goal.live.length);
  const before = { ...goal.stats };
  run(goal, 60, NO_HAND);
  assert.deepEqual({ ...goal.stats }, before);
  assert.equal(goal.live.length, 0);
  // Back again, the next one comes within a second and a half.
  const back = run(goal, 10, gloveAt(MIDDLE), () => goal.stats.shots > before.shots);
  assert.ok(back < 1.5, `${back} s`);
});

/* ---------- a real match, which the other team can win ---------- */

const realMatch = (options = {}) => makeGoal({ stakes: 'match', ...options });

test('in a real match the kicker shoots on the clock, at a hand that is not ready too, and waits only for no hand', () => {
  const goal = realMatch();
  assert.equal(goal.real, true);
  // No hand in the picture: nothing happens, for as long as that lasts.
  run(goal, 30, NO_HAND);
  assert.equal(goal.stats.shots, 0);
  assert.equal(said(goal, 'runup').length, 0);
  // A closed hand, or one that isn't held up, in the picture: the kicker runs up all the same, and soon.
  const waited = run(goal, 5, gloveAt(MIDDLE, { ready: false }), () => goal.stats.shots > 0);
  assert.ok(waited < 1.6 + RUN_UP + 0.1, `the kick came after ${waited} s`);
  // And the next, once that ball has gone in, after the level's gap.
  const [first] = goal.shots;
  run(goal, 10, gloveAt(MIDDLE, { ready: false }), () => first.state === 'in');
  const next = run(goal, 5, gloveAt(MIDDLE, { ready: false }), () => goal.stats.shots > 1);
  assert.ok(Math.abs(next - (goalLevel(1).gap + RUN_UP)) < 0.05, `the next came after ${next} s`);
});

test('in a real match a ball on its way stops where it is while no hand is in the picture, and goes on when one is', () => {
  const goal = realMatch();
  const shot = kickOff(goal);
  run(goal, 0.8, gloveAt(MIDDLE));
  const where = shot.t;
  run(goal, 20, NO_HAND);
  assert.equal(shot.t, where, 'it waited');
  assert.deepEqual([shot.state, goal.stats.goals], ['flying', 0]);
  run(goal, 10, gloveAt(shot.to), () => shot.state !== 'flying');
  assert.equal(shot.state, 'saved');
});

test('in a real match a ball that goes in is a goal to the other team, with no help after it, and enough of them win the match', () => {
  const goal = realMatch();
  assert.equal(goal.toLose, 6, 'at level 1, six goals of ten saves');
  const flights = [];
  // A hand that's in the picture and never ready: every ball goes in.
  run(goal, 120, gloveAt({ x: 0.5, y: 0.9 }, { ready: false }), () => {
    for (const { shot } of said(goal, 'kick')) if (!flights.includes(shot)) flights.push(shot);
    return goal.phase !== 'play';
  });
  assert.equal(goal.phase, 'lost');
  assert.deepEqual([goal.stats.goals, goal.stats.saves, goal.stats.shots], [6, 0, 6]);
  assert.ok(flights.every((shot) => shot.flight === goalLevel(1).flight), 'a goal makes the next ball no slower');
  assert.equal(said(goal, 'lost').length, 1);
  assert.equal(said(goal, 'won').length, 0);
  assert.equal(goal.lost, true);
  // The other team cheers for a moment, and then it's over, with nothing more kicked.
  assert.equal(goal.done, false);
  const cheered = run(goal, 10, gloveAt(MIDDLE), () => goal.done);
  assert.ok(Math.abs(cheered - LOST_SECONDS) < 0.05, `${cheered} s`);
  assert.equal(goal.stats.shots, 6);
});

test('in a real match the other team needs fewer goals as the levels go up, out of the saves that win it', () => {
  assert.deepEqual(LEVELS.map((level) => goalsToLose(level, 10)), [6, 6, 5, 5, 5, 4, 4, 4, 3, 3]);
  assert.deepEqual([goalsToLose(1, 6), goalsToLose(10, 6), goalsToLose(1, 14), goalsToLose(10, 14)], [4, 2, 8, 4]);
  for (const level of LEVELS) for (const saves of SAVES_CHOICES) assert.ok(goalsToLose(level, saves) >= LET_IN.least);
  assert.equal(makeGoal().toLose, Infinity, 'the gentle match can never be lost');
});

test('a real match can be won by a quick hand at every level, and a slow hand that wins level 1 loses level 10', () => {
  for (const level of LEVELS) {
    const goal = realMatch({ level });
    const took = playThrough(goal, { speed: 1.4 });
    assert.equal(goal.done, true, `level ${level}: not over after ${took} s`);
    assert.equal(goal.lost, false, `level ${level}: lost, ${goal.stats.goals} went in`);
  }
  const first = realMatch({ level: 1 });
  playThrough(first, { speed: 0.3 });
  assert.equal(first.lost, false, `level 1, slowly: ${first.stats.goals} went in`);
  const last = realMatch({ level: 10 });
  playThrough(last, { speed: 0.3 });
  assert.equal(last.lost, true, `level 10, slowly: ${last.stats.saves} saves`);
});

test('the gentle match is the game as it was: the kicker waits for a ready hand, and no number of goals loses it', () => {
  const goal = makeGoal({ stakes: 'gentle' });
  run(goal, 30, gloveAt(MIDDLE, { ready: false }));
  assert.equal(goal.stats.shots, 0);
  const took = playThrough(goal, { misses: (shot) => shot % 3 !== 0 });
  assert.equal(goal.done, true, `${took} s`);
  assert.equal(goal.lost, false);
  assert.ok(goal.stats.goals > 10, `${goal.stats.goals} went in`);
  assert.deepEqual([goalLevel(1, { gentle: true }).flight, goalLevel(1, { gentle: true }).gap], [3.4, 1.3]);
});

/* ---------- where the balls go ---------- */

test('the balls go near the hand, far out to its side, across the middle and up high, in turn, inside the goal', () => {
  for (const reach of REACH_NAMES) {
    for (const side of ['right', 'left']) {
      const goal = makeGoal({ reach, side, saves: 14 });
      playThrough(goal);
      const { x: [left, right], y: [top, bottom] } = REACHES[reach];
      const half = (right - left) / 2;
      const sign = side === 'right' ? 1 : -1;
      const places = said(goal, 'kick').map(({ shot }) => shot.to);
      assert.equal(places.length, 14);
      for (const { x, y } of places) assert.ok(x >= left - 1e-9 && x <= right + 1e-9 && y >= top - 1e-9 && y <= bottom + 1e-9, `${reach} ${side}: ${x}, ${y}`);
      // How far along from the middle to the edge on the hand's own side each one is, and how far down the goal.
      const along = places.map(({ x }) => (sign * (x - 0.5)) / half);
      const down = places.map(({ y }) => (y - top) / (bottom - top));
      const turn = (from) => [from, from + 8].filter((index) => index < places.length);
      for (const index of [...turn(0), ...turn(4)]) assert.ok(along[index] > 0.2 && along[index] < 0.6, `near: ${along[index]}`);
      for (const index of [...turn(1), ...turn(6)]) assert.ok(along[index] > 0.8, `out: ${along[index]}`);
      for (const index of [...turn(2), ...turn(5)]) assert.ok(along[index] < -0.45, `across: ${along[index]}`);
      for (const index of [...turn(3), ...turn(7)]) assert.ok(down[index] < 0.12, `high: ${down[index]}`);
      // Saved, they count: of these 14, three far out and three up high, and four across the body, or more when a
      // high one is across the middle too.
      assert.deepEqual([goal.stats.out, goal.stats.high], [3, 3]);
      assert.ok(goal.stats.across >= 4 && goal.stats.across <= 7, `${goal.stats.across} across`);
    }
  }
});

test('how far the balls go is the grown-ups\' choice, and no level changes it', () => {
  assert.deepEqual(REACH_NAMES, ['close', 'middle', 'far']);
  for (const [nearer, further] of [['close', 'middle'], ['middle', 'far']]) {
    assert.ok(REACHES[further].x[0] < REACHES[nearer].x[0] && REACHES[further].x[1] > REACHES[nearer].x[1]);
    assert.ok(REACHES[further].y[0] < REACHES[nearer].y[0] && REACHES[further].y[1] > REACHES[nearer].y[1]);
  }
  for (const level of LEVELS) {
    for (const reach of REACH_NAMES) assert.deepEqual(makeGoal({ level, reach }).box, REACHES[reach]);
    assert.equal(makeGoal({ level, saves: 6 }).target, 6);
  }
  assert.deepEqual(makeGoal({ reach: 'further' }).box, REACHES.middle, 'a reach that is not a choice is the middle one');
  // Every place a ball can go leaves the whole ball, and the glove on it, inside the picture.
  for (const { x: [left, right], y: [top, bottom] } of Object.values(REACHES)) {
    assert.ok(left >= 0.1 && right <= 0.9 && top >= 0.2 && bottom <= 0.78);
  }
});

/* ---------- what the levels bring ---------- */

test('each level from 2 brings something new, named in both languages, that the level before did not have', () => {
  assert.deepEqual(goalNewAt(1), []);
  const keys = [];
  for (const level of LEVELS.slice(1)) {
    const news = goalNewAt(level);
    assert.equal(news.length, 1, `level ${level}`);
    for (const { key, mark, name, nameKa } of news) {
      assert.ok(mark && name && nameKa, `level ${level}`);
      assert.equal(newsIsOn(key, level), true, `${key} is on at level ${level}`);
      assert.equal(newsIsOn(key, level - 1), false, `${key} is not on before level ${level}`);
      assert.equal(newsIsOn(key, 10), true, `${key} is still on at level 10`);
      assert.ok(LABELS[key]?.length === 2, `${key} has a label in both languages`);
      keys.push(key);
    }
  }
  assert.equal(new Set(keys).size, 9);
  assert.deepEqual(Object.keys(NEWS).map(Number), LEVELS.slice(1));
  // Balls come quicker each level. In a real match level 10 leaves about half of level 1's time, and in the gentle
  // one, as it always was, about three quarters.
  for (const gentle of [false, true]) {
    for (const level of LEVELS.slice(1)) {
      assert.ok(goalLevel(level, { gentle }).flight < goalLevel(level - 1, { gentle }).flight);
      assert.ok(goalLevel(level, { gentle }).gap < goalLevel(level - 1, { gentle }).gap);
    }
  }
  assert.equal(goalLevel(1).flight, 3.4);
  assert.ok(Math.abs(goalLevel(10).flight - 1.5) < 1e-9 && goalLevel(10).flight >= goalLevel(1).flight * 0.44);
  assert.ok(goalLevel(10).linger < goalLevel(1).linger);
  assert.ok(goalLevel(10, { gentle: true }).flight >= 2.4 && goalLevel(1, { gentle: true }).flight <= 3.6);
  assert.equal(goalLevel(10, { gentle: true }).linger, LINGER);
});

test('a level\'s new kind of ball is the first to come, every other ball is a plain one, and each has its kicker', () => {
  const newest = { 3: 'curl', 4: 'heavy', 5: 'double', 6: 'golden', 7: 'bounce', 8: 'bubbles', 9: 'trick', 10: 'trick' };
  for (const level of LEVELS) {
    const goal = makeGoal({ level, saves: 14 });
    playThrough(goal);
    const kinds = [];
    // A double shot's two balls are one shot.
    for (const { shot } of said(goal, 'kick')) if (!shot.second) kinds.push(shot.kind);
    assert.equal(kinds[0], newest[level] ?? 'plain', `level ${level} starts with ${kinds[0]}`);
    for (let index = 1; index < kinds.length; index += 2) assert.equal(kinds[index], 'plain', `level ${level}, shot ${index}`);
    const wanted = Object.keys(newest).filter((from) => Number(from) <= level && from !== '10').map((from) => newest[from]);
    for (const kind of wanted.slice(-6)) assert.ok(kinds.includes(kind), `level ${level} has a ${kind}`);
  }
  for (const [kind, who] of Object.entries(KICKERS)) {
    assert.equal(who.length, kind === 'double' ? 2 : 1);
    for (const id of who) assert.ok(byId(id), `${id} is one of the characters`);
  }
  assert.ok(!Object.values(KICKERS).flat().includes('giraffe'), 'Giraffe is on the child\'s side');
});

test('from level 2, a save knocks out a star that comes to rest away from the glove, and waits to be touched', () => {
  const plain = makeGoal({ level: 1 });
  const first = kickOff(plain);
  run(plain, 20, gloveAt(first.to), () => first.state === 'saved');
  assert.equal(plain.stars.length, 0);

  const goal = makeGoal({ level: 2 });
  const shot = kickOff(goal);
  run(goal, 20, gloveAt(shot.to), () => shot.state === 'saved');
  const [star] = goal.stars;
  assert.ok(star, 'a star came out');
  assert.equal(said(goal, 'star').length, 1);
  // Left where the save was, the glove doesn't have it: it has to go and get it.
  run(goal, 2, gloveAt(shot.at));
  assert.equal(goal.stats.stars, 0);
  assert.ok(gap(star, shot.at) > EXTRAS.starOut * 0.8, `it rests ${gap(star, shot.at)} away`);
  const { x: [left, right], y: [top, bottom] } = goal.box;
  assert.ok(star.x >= left && star.x <= right && star.y >= top && star.y <= bottom);
  // Any hand will do, even one that isn't ready.
  run(goal, 0.2, gloveAt(star, { ready: false }));
  assert.deepEqual([goal.stats.stars, goal.stars.length], [1, 0]);
  assert.deepEqual(said(goal, 'prize').map(({ kind, count }) => [kind, count]), [['star', 1]]);
});

test('a star that is not touched goes after a while, and that costs nothing', () => {
  const goal = makeGoal({ level: 2 });
  const shot = kickOff(goal);
  run(goal, 20, gloveAt(shot.to), () => shot.state === 'saved');
  const saves = goal.stats.saves;
  const waited = run(goal, 30, NO_HAND, () => goal.stars.length === 0);
  assert.ok(Math.abs(waited - EXTRAS.starSeconds) < 0.1);
  assert.deepEqual([goal.stats.stars, goal.stats.saves, goal.stats.goals], [0, saves, 0]);
});

test('from level 3, the curling shot bends on its way and still arrives at its ring', () => {
  const goal = makeGoal({ level: 3 });
  const shot = kickOff(goal);
  assert.equal(shot.kind, 'curl');
  assert.deepEqual(goal.kickers.map(({ who }) => who), ['kit']);
  let most = 0;
  run(goal, 20, () => {
    // How far the ball is from the straight line between the spot and its ring, across.
    const ball = goal.ballAt(shot);
    const straight = shot.from.x + (shot.to.x - shot.from.x) * (shot.t ** 1.35);
    most = Math.max(most, Math.abs(ball.x - straight) * ASPECT);
    return gloveAt({ x: 1 - shot.to.x, y: 0.95 });
  }, () => shot.t >= 1);
  assert.ok(Math.abs(most - EXTRAS.curl) < 0.01, `it bends ${most}`);
  assert.ok(gap(goal.ballAt(shot), shot.to) < 1e-6);
});

test('from level 4, the heavy ball waits at the line and has to be held back, which need not be all at once', () => {
  const goal = makeGoal({ level: 4 });
  const shot = kickOff(goal);
  assert.equal(shot.kind, 'heavy');
  assert.deepEqual(goal.kickers.map(({ who }) => who), ['bramble']);
  assert.ok(shot.near > BALL.near * 1.3 && shot.flight > goalLevel(4).flight * 1.1);
  // The glove is there before it arrives: that doesn't save it, as it has to be held.
  run(goal, 20, gloveAt(shot.to), () => shot.state === 'pushing');
  assert.equal(goal.stats.saves, 0);
  assert.equal(said(goal, 'thud').length, 1);
  // Held for half of what it needs, let go for a while, and held again.
  run(goal, EXTRAS.heavyHold * 0.5, gloveAt(shot.to));
  assert.ok(Math.abs(shot.pushed - EXTRAS.heavyHold * 0.5) < 0.05);
  run(goal, 1, gloveAt({ x: 1 - shot.to.x, y: 0.95 }));
  assert.deepEqual([shot.state, goal.stats.saves], ['pushing', 0]);
  // A hand on it that isn't ready doesn't hold it.
  run(goal, 1, gloveAt(shot.to, { ready: false }));
  assert.ok(Math.abs(shot.pushed - EXTRAS.heavyHold * 0.5) < 0.05);
  const rest = run(goal, 5, gloveAt(shot.to), () => shot.state === 'saved');
  assert.ok(Math.abs(rest - EXTRAS.heavyHold * 0.5) < 0.06, `held again for ${rest} s`);
  assert.deepEqual([goal.stats.saves, said(goal, 'push').length], [1, 1]);
});

test('a heavy ball nobody holds back goes in after a good while, and costs nothing', () => {
  const goal = makeGoal({ level: 4 });
  const shot = kickOff(goal);
  run(goal, 20, gloveAt({ x: 1 - shot.to.x, y: 0.95 }), () => shot.state === 'pushing');
  const waited = run(goal, 20, gloveAt({ x: 1 - shot.to.x, y: 0.95 }), () => shot.state === 'in');
  assert.ok(Math.abs(waited - EXTRAS.heavySlip) < 0.05, `${waited} s`);
  assert.deepEqual([goal.stats.saves, goal.stats.goals], [0, 1]);
});

test('from level 5, the double shot is two balls from two kickers, one after the other, to different sides', () => {
  for (const side of ['right', 'left']) {
    const goal = makeGoal({ level: 5, side });
    assert.deepEqual(goal.kickers.map(({ who }) => who), ['frost', 'widget']);
    const first = kickOff(goal);
    assert.equal(first.kind, 'double');
    const child = keeper(goal);
    const between = run(goal, 10, () => child(), () => said(goal, 'kick').length === 2);
    assert.ok(Math.abs(between - EXTRAS.doubleGap) < 0.05, `the second came ${between} s after the first`);
    const second = said(goal, 'kick')[1].shot;
    assert.notEqual(first.from.x, second.from.x);
    const sign = side === 'right' ? 1 : -1;
    assert.ok(sign * (first.to.x - 0.5) > 0.1 && sign * (second.to.x - 0.5) < -0.05, 'the first to the hand\'s own side, and the second across');
    // A hand that goes from one to the other saves both.
    run(goal, 20, () => child(), () => goal.live.length === 0);
    assert.deepEqual([goal.stats.saves, goal.stats.goals, goal.stats.across], [2, 0, 1]);
    // And it was one shot: a plain one comes next.
    assert.equal(kickOff(goal).kind, 'plain');
  }
});

test('from level 6, the golden ball goes to the top corner furthest across, and is worth three stars at once', () => {
  for (const side of ['right', 'left']) {
    const goal = makeGoal({ level: 6, side });
    const shot = kickOff(goal);
    assert.equal(shot.kind, 'golden');
    const { x: [left, right], y: [top, bottom] } = goal.box;
    const corner = { x: side === 'right' ? left : right, y: top };
    assert.ok(gap(shot.to, corner) < 0.06, `it goes to ${shot.to.x}, ${shot.to.y}`);
    assert.ok(bottom - shot.to.y > (bottom - top) * 0.9);
    run(goal, 20, gloveAt(shot.to), () => shot.state === 'saved');
    assert.deepEqual([goal.stats.saves, goal.stats.stars, goal.stats.across, goal.stats.high], [1, EXTRAS.goldenStars, 1, 1]);
    assert.deepEqual(said(goal, 'prize').map(({ count }) => count), [EXTRAS.goldenStars]);
    assert.equal(goal.stars.length, 0, 'its stars go straight to the tally');
  }
});

test('from level 7, the bouncing ball comes down again somewhere else once it is saved, and both saves count', () => {
  const goal = makeGoal({ level: 7 });
  const shot = kickOff(goal);
  assert.equal(shot.kind, 'bounce');
  const first = { ...shot.to };
  run(goal, 20, gloveAt(first), () => goal.stats.saves === 1);
  assert.deepEqual([shot.state, said(goal, 'bounce').length], ['flying', 1]);
  assert.ok(gap(shot.to, first) > 0.25, `it comes down ${gap(shot.to, first)} away`);
  assert.ok((shot.to.x - 0.5) * (first.x - 0.5) < 0, 'on the other side of the middle');
  // The hand that stays where it was doesn't get it again.
  const waited = run(goal, 20, gloveAt(first), () => shot.state === 'in');
  assert.ok(waited > EXTRAS.bounceFlight);
  assert.deepEqual([goal.stats.saves, goal.stats.goals], [1, 1]);
  // And one that follows it does: it doesn't bounce again.
  const again = makeGoal({ level: 7 });
  const other = kickOff(again);
  const child = keeper(again);
  run(again, 20, () => child(), () => again.live.length === 0);
  assert.deepEqual([other.state, again.stats.saves, again.stats.goals, said(again, 'bounce').length], ['saved', 2, 0, 1]);
});

test('from level 8, the bubble ball bursts into bubbles round where it was saved, each a star when it is popped', () => {
  const goal = makeGoal({ level: 8 });
  const shot = kickOff(goal);
  assert.equal(shot.kind, 'bubbles');
  run(goal, 20, gloveAt(shot.to), () => shot.state === 'saved');
  assert.equal(goal.bubbles.length, EXTRAS.bubbles);
  assert.equal(goal.stars.length, 0, 'the bubbles are its stars');
  // Left where the save was, the glove pops none of them.
  run(goal, 1.5, gloveAt(shot.at));
  assert.equal(goal.bubbles.length, EXTRAS.bubbles);
  const { x: [left, right], y: [top, bottom] } = goal.box;
  for (const bubble of goal.bubbles) {
    assert.ok(gap(bubble, shot.at) > EXTRAS.bubbleOut * 0.6, `a bubble is ${gap(bubble, shot.at)} away`);
    assert.ok(bubble.x >= left && bubble.x <= right && bubble.y >= top - 0.01 && bubble.y <= bottom + 0.01);
  }
  for (let n = EXTRAS.bubbles; n > 0; n -= 1) {
    run(goal, 0.2, gloveAt(goal.bubbles[0], { ready: false }));
    assert.equal(goal.bubbles.length, n - 1);
  }
  assert.deepEqual([goal.stats.stars, said(goal, 'pop').length], [EXTRAS.bubbles, EXTRAS.bubbles]);
});

test('from level 9, the trick shot\'s ring hops to the other side early on, and the ball comes to where it hopped to', () => {
  const goal = makeGoal({ level: 9 });
  const shot = kickOff(goal);
  assert.equal(shot.kind, 'trick');
  const first = { ...shot.to };
  const total = shot.flight;
  const hopped = run(goal, 20, gloveAt(first), () => shot.hopped);
  assert.ok(Math.abs(hopped - total * EXTRAS.trickAt) < 0.05, `it hopped after ${hopped} s`);
  assert.ok(Math.abs(shot.to.x - (1 - first.x)) < 1e-9 && shot.to.y === first.y, 'as far over on the other side, and as high');
  assert.ok(gap(shot.to, first) > 0.3);
  // There's as long left as a plain ball takes at level 1, near enough, to get across.
  assert.ok(shot.flight > 2.2, `${shot.flight} s left`);
  // The hand that stays at the first place doesn't save it.
  run(goal, 20, gloveAt(first), () => shot.state !== 'flying');
  assert.equal(shot.state, 'in');
  // And one that follows the ring does.
  const again = makeGoal({ level: 9 });
  const other = kickOff(again);
  const child = keeper(again);
  run(again, 20, () => child(), () => other.state !== 'flying');
  assert.deepEqual([other.state, other.hopped, again.stats.saves], ['saved', true, 1]);
});

test('at level 10, the cup floats down once the match is won, and waits to be caught', () => {
  const goal = makeGoal({ level: 10, saves: 6 });
  const child = keeper(goal);
  run(goal, 400, () => child(), () => goal.phase === 'cup');
  assert.equal(goal.stats.saves, 6);
  assert.equal(goal.live.length, 0, 'nothing more is kicked');
  const { cup } = goal;
  assert.equal(cup.state, 'falling');
  // Nobody there: it comes down to the middle of the goal, and waits.
  const fell = run(goal, 20, NO_HAND, () => cup.state === 'waiting');
  assert.ok(Math.abs(fell - EXTRAS.cupFall) < 0.05);
  const { y: [top, bottom] } = goal.box;
  assert.ok(Math.abs(cup.x - 0.5) < 1e-9 && Math.abs(cup.y - (top + bottom) / 2) < 1e-6);
  run(goal, 3, NO_HAND);
  assert.deepEqual([goal.phase, goal.done], ['cup', false]);
  // Any hand that touches it has it.
  run(goal, 0.2, gloveAt(cup, { ready: false }));
  assert.deepEqual([cup.state, cup.byHand, goal.phase], ['caught', true, 'won']);
  run(goal, PARTY_SECONDS + 0.1, NO_HAND);
  assert.equal(goal.done, true);
});

test('a cup nobody catches is given anyway, so the match always ends', () => {
  const goal = makeGoal({ level: 10, saves: 6 });
  const child = keeper(goal);
  run(goal, 400, () => child(), () => goal.phase === 'cup');
  const waited = run(goal, 60, NO_HAND, () => goal.done);
  assert.ok(Math.abs(waited - (EXTRAS.cupFall + EXTRAS.cupWaits + PARTY_SECONDS)) < 0.1, `${waited} s`);
  assert.equal(goal.cup.byHand, false);
  // Before level 10 there's no cup.
  const ninth = makeGoal({ level: 9, saves: 6 });
  playThrough(ninth);
  assert.equal(ninth.cup, null);
});

test('every level can be won by a hand that goes where it is wanted, quickly or slowly', () => {
  for (const level of LEVELS) {
    for (const speed of [1.2, 0.45]) {
      const goal = makeGoal({ level });
      const took = playThrough(goal, { speed });
      assert.equal(goal.done, true, `level ${level} at ${speed}: not over after ${took} s`);
      assert.equal(goal.stats.saves >= 10, true);
      assert.ok(took < 240, `level ${level} at ${speed} took ${took} s`);
      // A quick hand lets nothing in.
      if (speed > 1) assert.equal(goal.stats.goals, 0, `level ${level}: ${goal.stats.goals} went in`);
    }
  }
});

test('what the match wants of a hand is the ball that arrives first, then a bubble or a star', () => {
  const goal = makeGoal({ level: 8 });
  assert.equal(goal.wants(), null);
  const shot = kickOff(goal);
  assert.deepEqual(goal.wants(), { x: shot.to.x, y: shot.to.y, what: 'ball', kind: 'bubbles' });
  run(goal, 20, gloveAt(shot.to), () => shot.state === 'saved');
  assert.equal(goal.wants().what, 'bubble');
});

/* ---------- the glove ---------- */

test('the glove grows as the thumb comes out of the palm, on a hand making the open move', () => {
  assert.equal(bigFor(0, true), 0, 'a thumb across the palm');
  assert.equal(bigFor(BIG.from, true), 0);
  assert.equal(bigFor(1, true), 1, 'a thumb held right out');
  assert.ok(Math.abs(bigFor((BIG.from + BIG.to) / 2, true) - 0.5) < 1e-9);
  assert.ok(bigFor(0.5, true) > bigFor(0.4, true));
  assert.equal(bigFor(1, false), 0, 'a hand that is not open has the plain glove');
  // On the photos, a thumb tucked in reads under 0.15 and one held out over 0.9, so both ends can be reached.
  assert.ok(BIG.from > 0.15 && BIG.to < 0.9 && BIG.by > 0.2);
});

/* ---------- its words ---------- */

test('every line the game says has its English and Georgian voice files, and the game says each one', () => {
  const folder = new URL('../../games/giraffe-goal/audio/voice/', import.meta.url);
  const lines = JSON.parse(readFileSync(new URL('lines.json', folder), 'utf8'));
  assert.ok(lines.length >= 4);
  for (const { id, ka } of lines) {
    assert.ok(ka, `${id} has Georgian`);
    for (const language of ['en', 'ka']) assert.ok(readFileSync(new URL(`${language}/${id}.ogg`, folder)).length > 1000, `${language}/${id}.ogg`);
  }
  const source = readFileSync(new URL('../../games/giraffe-goal/main.js', import.meta.url), 'utf8');
  for (const { text } of lines) assert.ok(source.includes(text), `"${text}" is said by the game`);
});

test('the grown-ups\' settings for this game have names of their own, as every game\'s are kept together', () => {
  const source = readFileSync(new URL('../../games/giraffe-goal/main.js', import.meta.url), 'utf8');
  assert.match(source, /defaults: \{ goalWrist: 'little', goalReach: 'middle', goalSaves: 10, goalStakes: 'match' \}/);
  assert.match(source, /choices: \{ goalWrist: String, goalReach: String, goalSaves: Number, goalStakes: String \}/);
});
