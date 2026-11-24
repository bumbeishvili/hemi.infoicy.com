// Left, Right, Pop!: up to level 5, one circle at a time, red for the left hand and green for the right; from level 6,
// circles of every colour, each once; only the circle asked for, with the hand asked for and open, pops it; the other
// hand only makes it wobble; the big balloon that only both hands at once pop; the clock that fades a circle away, and
// only runs while a hand that's asked for can be seen; the gentle game with no clock; and what each level brings.
// Everything here runs without a screen, with pretend gloves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ALL_COLOURS, CLOCKS, COLOURS, EXTRAS, FADE_SECONDS, GOAL_CHOICES, HAND_COLOURS, HAND_MODES, HOLD_SECONDS, LOST_SECONDS,
  NEWS, NEXT_ASK_AFTER, PARTY_SECONDS, POP_SECONDS, PopRules, REACHES, REACH_NAMES, SIMPLE_UP_TO, fadesToLose, popLevel, popNewAt,
} from '../../games/left-right-pop/rules.js';

const FRAME = 1 / 60;
const ASPECT = 16 / 9;
const LEVELS = Array.from({ length: 10 }, (_, index) => index + 1);
const GLOVE = 0.05; // How far a pretend glove reaches from its middle, in screen heights.

/** The same numbers every time, so a test that passes keeps passing. */
function seeded(seed = 7) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return value / 2147483647;
  };
}

function makeRules(options = {}) {
  const log = [];
  const rules = new PopRules({ random: seeded(options.seed ?? 7), aspect: ASPECT, onEvent: (event) => log.push(event), ...options });
  rules.log = log;
  return rules;
}

const said = (rules, type) => rules.log.filter((event) => event.type === type);
const gap = (a, b) => Math.hypot((a.x - b.x) * ASPECT, a.y - b.y);

/** A pretend glove at a place, open unless it's said not to be. */
function gloveAt(at, { open = true, visible = true } = {}) {
  return { visible, open: visible && open, x: at.x, y: at.y, reach: (x, y) => gap({ x, y }, at) - GLOVE };
}

const AWAY = { x: 0.5, y: 0.05 }; // In the picture, but nowhere near a circle.
const away = () => ({ left: gloveAt(AWAY), right: gloveAt(AWAY) });
const hidden = () => gloveAt(AWAY, { visible: false });

/** Plays for so long, with gloves that can follow what's going on: gloves(rules) is { left, right }. */
function play(rules, seconds, gloves = () => ({})) {
  for (let t = 0; t < seconds && !rules.done; t += FRAME) rules.update(FRAME, { gloves: gloves(rules) });
}

/** Plays until something is asked for. */
function untilAsked(rules, gloves = away) {
  for (let t = 0; t < 10 && !rules.current; t += FRAME) rules.update(FRAME, { gloves: gloves(rules) });
  assert.ok(rules.current, 'something is asked for');
  return rules.current;
}

/** Plays until an ask that's wanted, popping the others: rules.current satisfies wanted. */
function untilAsk(rules, wanted, seconds = 120) {
  for (let t = 0; t < seconds && !(rules.current && wanted(rules.current)); t += FRAME) rules.update(FRAME, { gloves: rightOn(rules) });
  return rules.current && wanted(rules.current) ? rules.current : null;
}

const circleOf = (rules, ask) => rules.circles.find((circle) => circle.id === ask.circles[0]);
const live = (rules, ask) => rules.circles.find((each) => ask.circles.includes(each.id) && (each.state === 'waiting' || each.state === 'growing'));

/** The hands asked for, open, on what's asked for, and any other hand away: a big balloon has a hand on each side. */
function rightOn(rules) {
  const ask = rules.current;
  if (!ask) return away();
  const circle = live(rules, ask);
  if (!circle) return away();
  if (ask.hand === 'both') {
    const side = (circle.r * 0.8) / ASPECT;
    return { left: gloveAt({ x: circle.x - side, y: circle.y }), right: gloveAt({ x: circle.x + side, y: circle.y }) };
  }
  const on = gloveAt(circle);
  return ask.hand === 'left' ? { left: on, right: gloveAt(AWAY) } : { left: gloveAt(AWAY), right: on };
}

/* ---------- levels ---------- */

test('each level from 2 brings one new thing, which stays for the levels after it', () => {
  for (const level of LEVELS.slice(1)) {
    const news = popNewAt(level);
    assert.equal(news.length, 1, `level ${level}`);
    const { key } = news[0];
    assert.equal(popLevel(level - 1)[key], false, `${key} is new at level ${level}`);
    for (const after of LEVELS.filter((each) => each >= level)) assert.equal(popLevel(after)[key], true, `${key} at level ${after}`);
    assert.ok(news[0].name && news[0].nameKa && news[0].mark);
  }
  assert.deepEqual(popNewAt(1), []);
  assert.equal(Object.keys(NEWS).length, 9);
  // Big balloons come at every level.
  for (const level of LEVELS) assert.equal(popLevel(level).balloons, true);
});

test('up to level 5 there is one circle at a time and only the hand is said, from level 3 only "Left!" or "Right!"', () => {
  for (const level of LEVELS) {
    const plan = popLevel(level);
    assert.equal(plan.simple, level <= SIMPLE_UP_TO, `level ${level}`);
    assert.equal(plan.short, level >= 3 && level <= SIMPLE_UP_TO, `level ${level}`);
    if (plan.simple) assert.equal(plan.circles, 1);
  }
  assert.equal(popLevel(6).circles, 3);
  assert.equal(popLevel(10).circles, 5);
  for (const level of LEVELS.slice(6)) assert.ok(popLevel(level).circles >= popLevel(level - 1).circles);
});

test('higher levels have circles a little smaller and less time for each, and gentle has no clock', () => {
  for (const level of LEVELS.slice(1)) {
    assert.ok(popLevel(level).radius < popLevel(level - 1).radius);
    assert.ok(popLevel(level).wait < popLevel(level - 1).wait);
    assert.equal(popLevel(level, { gentle: true }).wait, Infinity);
  }
  assert.equal(popLevel(10).wait, popLevel(1).wait / 2);
  // From level 6 there are always more colours than circles, so each is there only once.
  for (const level of LEVELS.slice(5)) assert.ok(ALL_COLOURS.length > popLevel(level).circles, `level ${level}`);
});

test('how many circles fading away lose the game goes down with the level, and is never under two', () => {
  assert.equal(fadesToLose(1, 12), 6);
  assert.equal(fadesToLose(10, 12), 3);
  for (const goal of GOAL_CHOICES) for (const level of LEVELS) assert.ok(fadesToLose(level, goal) >= 2);
  assert.equal(makeRules({ clock: 'gentle' }).toLose, Infinity);
  assert.deepEqual(CLOCKS, ['clock', 'gentle']);
});

/* ---------- the circles ---------- */

test('up to level 5 a circle only comes when it is asked for, one at a time, red for the left hand and green for the right', () => {
  for (const level of LEVELS.slice(0, SIMPLE_UP_TO)) {
    const rules = makeRules({ level, clock: 'gentle', goal: 16 });
    assert.equal(rules.circles.length, 0, 'nothing on the screen before it starts');
    rules.begin();
    const colours = new Set();
    for (let t = 0; t < 90 && !rules.done; t += FRAME) {
      rules.update(FRAME, { gloves: rightOn(rules) });
      const here = rules.live;
      assert.ok(here.length <= 1, `level ${level}: one at a time`);
      for (const circle of here) colours.add(circle.colour);
      for (const ask of rules.asks) if (ask.hand !== 'both') assert.equal(circleOf(rules, ask)?.colour ?? HAND_COLOURS[ask.hand], HAND_COLOURS[ask.hand]);
    }
    assert.ok(rules.stats.pops > 5);
    for (const colour of colours) assert.ok(['red', 'green', 'balloon'].includes(colour), `level ${level}: ${colour}`);
    assert.ok(colours.has('red') && colours.has('green'));
  }
});

test('a circle on its own comes anywhere it can, in reach, and not always in the same place', () => {
  for (const reach of REACH_NAMES) {
    const rules = makeRules({ level: 1, reach, clock: 'gentle', goal: 16 });
    rules.begin();
    const places = [];
    for (let t = 0; t < 90 && !rules.done; t += FRAME) {
      const ask = rules.current;
      const circle = ask && live(rules, ask);
      if (circle && circle.kind === 'plain' && !places.some((place) => place.id === circle.id)) places.push({ id: circle.id, x: circle.x, y: circle.y, r: circle.r });
      rules.update(FRAME, { gloves: rightOn(rules) });
    }
    const area = REACHES[reach];
    for (const circle of places) {
      assert.ok(circle.x - circle.r / ASPECT >= area.x[0] - 1e-9 && circle.x + circle.r / ASPECT <= area.x[1] + 1e-9, `${reach}: inside across`);
      assert.ok(circle.y - circle.r >= area.y[0] - 1e-9 && circle.y + circle.r <= area.y[1] + 1e-9, `${reach}: inside down`);
    }
    const spread = Math.max(...places.map((p) => p.x)) - Math.min(...places.map((p) => p.x));
    assert.ok(places.length >= 8 && spread > (area.x[1] - area.x[0]) * 0.3, `${reach}: ${places.length} places, ${spread.toFixed(2)} across`);
  }
});

test('from level 6 the screen has its level\'s circles, each colour once, all inside where they can come and none on top of another', () => {
  for (const reach of REACH_NAMES) {
    for (const level of LEVELS.slice(5)) {
      for (const seed of [3, 7, 11]) {
        const rules = makeRules({ level, reach, seed });
        const { plain } = rules;
        assert.equal(plain.length, popLevel(level).circles);
        assert.equal(new Set(plain.map((circle) => circle.colour)).size, plain.length, 'each colour once');
        const area = REACHES[reach];
        for (const circle of plain) {
          assert.ok(COLOURS[circle.colour]);
          assert.ok(circle.x - circle.r / ASPECT >= area.x[0] - 1e-9 && circle.x + circle.r / ASPECT <= area.x[1] + 1e-9, `${reach} level ${level}: inside across`);
          assert.ok(circle.y - circle.r >= area.y[0] - 1e-9 && circle.y + circle.r <= area.y[1] + 1e-9, `${reach} level ${level}: inside down`);
        }
        for (const a of plain) for (const b of plain) if (a !== b) assert.ok(gap(a, b) >= a.r + b.r - 1e-9, `${reach} level ${level}: apart`);
      }
    }
  }
});

test('only red and green up to level 5, and every colour from level 6', () => {
  for (const level of LEVELS) {
    const rules = makeRules({ level, clock: 'gentle' });
    rules.begin();
    const seen = new Set();
    play(rules, 60, (each) => {
      for (const circle of each.plain) seen.add(circle.colour);
      return rightOn(each);
    });
    const others = [...seen].filter((colour) => colour !== 'red' && colour !== 'green');
    assert.equal(others.length > 0, level >= 6, `level ${level}: ${[...seen]}`);
  }
});

/* ---------- popping ---------- */

test('the hand asked for, open, on its circle, pops it, and the next is asked for soon after', () => {
  const rules = makeRules();
  rules.begin();
  const ask = untilAsked(rules);
  const circle = circleOf(rules, ask);
  assert.equal(circle.colour, HAND_COLOURS[ask.hand]);
  assert.equal(said(rules, 'ask').length, 1);
  // It has just come, so it grows in first.
  for (let t = 0; t < 1 && !rules.stats.pops; t += FRAME) rules.update(FRAME, { gloves: rightOn(rules) });
  assert.equal(rules.stats.pops, 1);
  assert.equal(rules.stats.popped[ask.hand], 1);
  assert.equal(said(rules, 'pop').length, 1);
  assert.equal(said(rules, 'popped')[0].side, ask.hand);
  assert.equal(rules.current, null, 'nothing is asked for for a moment');
  play(rules, POP_SECONDS + 0.05, away);
  assert.equal(rules.live.length, 0, 'and nothing is on the screen');
  play(rules, NEXT_ASK_AFTER, away);
  assert.ok(rules.current && rules.current.id !== ask.id, 'the next one is asked for');
});

test('the other hand on the circle asked for only makes it wobble, and says so once in a while', () => {
  const rules = makeRules({ clock: 'gentle' });
  rules.begin();
  const ask = untilAsked(rules);
  const circle = circleOf(rules, ask);
  const wrong = ask.hand === 'left' ? 'right' : 'left';
  play(rules, 1, () => ({ [wrong]: gloveAt(circle), [ask.hand]: gloveAt(AWAY) }));
  assert.equal(rules.stats.pops, 0);
  assert.equal(circle.state, 'waiting');
  assert.ok(circle.wobble > 0);
  assert.equal(said(rules, 'wrong-hand').length, 1, 'once, however long it stays');
  assert.equal(rules.stats.wrong[wrong], 1);
  play(rules, 1.5, () => ({ [wrong]: gloveAt(circle), [ask.hand]: gloveAt(AWAY) }));
  assert.equal(said(rules, 'wrong-hand').length, 2, 'and again a while later');
  // Then the right hand pops it.
  play(rules, 0.1, rightOn);
  assert.equal(rules.stats.pops, 1);
});

test('a closed hand pops nothing, and from level 6 an open hand on another colour only makes it wobble', () => {
  const one = makeRules({ clock: 'gentle' });
  one.begin();
  const first = circleOf(one, untilAsked(one));
  play(one, 1, () => ({ left: gloveAt(first, { open: false }), right: gloveAt(first, { open: false }) }));
  assert.equal(one.stats.pops, 0);

  const rules = makeRules({ level: 6, clock: 'gentle' });
  rules.begin();
  const ask = untilAsked(rules);
  const circle = circleOf(rules, ask);
  const other = rules.plain.find((each) => each !== circle);
  play(rules, 1, () => ({ left: gloveAt(other), right: gloveAt(other) }));
  assert.equal(rules.stats.pops, 0);
  assert.equal(other.state, 'waiting');
  assert.ok(said(rules, 'bump').length >= 1);
  assert.equal(said(rules, 'wrong-hand').length, 0);
});

test('a circle that has only just come can\'t be popped until it has grown', () => {
  const rules = makeRules();
  rules.begin();
  for (let t = 0; t < 10 && !said(rules, 'ask').length; t += FRAME) rules.update(FRAME, { gloves: away() });
  const fresh = circleOf(rules, rules.current);
  assert.equal(fresh.state, 'growing');
  rules.update(FRAME, { gloves: { left: gloveAt(fresh), right: gloveAt(fresh) } });
  assert.equal(rules.stats.pops, 0);
});

/* ---------- the big balloon ---------- */

test('now and then a big balloon comes, and only both hands open on it at once pop it', () => {
  const rules = makeRules({ clock: 'gentle', goal: 16 });
  rules.begin();
  const ask = untilAsk(rules, (each) => each.hand === 'both');
  assert.ok(ask, 'a big balloon comes');
  const balloon = live(rules, ask);
  assert.equal(balloon.kind, 'balloon');
  assert.equal(balloon.r, EXTRAS.balloonSize);
  assert.equal(rules.live.length, 1, 'on its own up to level 5');
  const pops = rules.stats.pops;
  // One hand alone only makes it wobble.
  const side = (balloon.r * 0.8) / ASPECT;
  play(rules, 1, () => ({ left: gloveAt({ x: balloon.x - side, y: balloon.y }), right: gloveAt(AWAY) }));
  assert.equal(rules.stats.pops, pops);
  assert.ok(balloon.wobble > 0);
  assert.equal(said(rules, 'one-hand').length, 1);
  // Two closed hands don't either.
  play(rules, 0.5, () => ({ left: gloveAt({ x: balloon.x - side, y: balloon.y }, { open: false }), right: gloveAt({ x: balloon.x + side, y: balloon.y }, { open: false }) }));
  assert.equal(rules.stats.pops, pops);
  // Both open, one on each side, pop it.
  play(rules, 0.1, rightOn);
  assert.equal(rules.stats.pops, pops + 1);
  assert.equal(rules.stats.balloons, 1);
  assert.equal(said(rules, 'popped').at(-1).side, 'both');
  // A balloon a hand on each side of can be popped by hands that don't touch: far enough apart that one couldn't be
  // holding the other open. Hands closer than about a third of the screen's height are read as touching.
  assert.ok(2 * (EXTRAS.balloonSize + 0.06) > 0.4);
});

test('big balloons come in about a fifth of the turns, never first and never twice running, and not with one hand only', () => {
  const kinds = [];
  for (let game = 0; game < 6; game += 1) {
    const each = makeRules({ clock: 'gentle', goal: 16, seed: 5 + game });
    each.begin();
    for (let t = 0; t < 300 && !each.done; t += FRAME) each.update(FRAME, { gloves: rightOn(each) });
    const asks = said(each, 'ask').map((event) => (event.asks[0].hand === 'both' ? 'balloon' : 'hand'));
    assert.equal(asks[0], 'hand', 'never first');
    for (let index = 1; index < asks.length; index += 1) assert.ok(!(asks[index] === 'balloon' && asks[index - 1] === 'balloon'), 'never twice running');
    kinds.push(...asks);
  }
  const share = kinds.filter((kind) => kind === 'balloon').length / kinds.length;
  assert.ok(share > 0.1 && share < 0.3, `${(share * 100).toFixed(0)}% balloons`);
  const only = makeRules({ hands: 'only', clock: 'gentle', goal: 16 });
  only.begin();
  play(only, 200, rightOn);
  assert.equal(only.stats.balloonsAsked, 0);
});

/* ---------- the clock ---------- */

test('with no hand asked for in the picture the clock waits, and a circle left too long fades away', () => {
  const rules = makeRules();
  rules.begin();
  const ask = untilAsked(rules);
  play(rules, 60, () => ({ left: hidden(), right: hidden() }));
  assert.equal(rules.stats.faded, 0, 'a child who goes away is not caught out');
  assert.equal(rules.current, ask);
  // The hand asked for in the picture, but not popping: it fades once its time is up.
  play(rules, popLevel(1).wait - 0.2, away);
  assert.equal(rules.stats.faded, 0);
  play(rules, 0.4, away);
  assert.equal(rules.stats.faded, 1);
  assert.equal(said(rules, 'faded').length, 1);
  assert.ok(rules.clockShare === null, 'nothing is asked for just then');
});

test('too many fading away loses the game, and the gentle game can\'t be lost', () => {
  for (const level of [1, 10]) {
    const rules = makeRules({ level });
    rules.begin();
    play(rules, 300, away);
    assert.equal(rules.phase, 'lost', `level ${level}`);
    // Two can fade at once, when one was asked for with each hand.
    assert.ok(rules.stats.faded >= rules.toLose && rules.stats.faded <= rules.toLose + 1, `${rules.stats.faded} faded`);
    assert.equal(said(rules, 'lost').length, 1);
    assert.ok(rules.done);
  }

  const ending = makeRules({ level: 10 });
  ending.begin();
  for (let t = 0; t < 200 && ending.phase !== 'lost'; t += FRAME) ending.update(FRAME, { gloves: away() });
  assert.equal(ending.done, false, 'a moment to see it before the finish card');
  play(ending, LOST_SECONDS + 0.1);
  assert.ok(ending.done);

  const gentle = makeRules({ level: 10, clock: 'gentle' });
  gentle.begin();
  play(gentle, 600, away);
  assert.equal(gentle.stats.faded, 0);
  assert.equal(gentle.phase, 'play');
  assert.equal(gentle.clockShare, null);
});

test('popping enough wins the game, after a moment to see it, at every level', () => {
  for (const level of LEVELS) {
    for (const goal of GOAL_CHOICES) {
      const rules = makeRules({ level, goal });
      rules.begin();
      for (let t = 0; t < 400 && rules.phase === 'play'; t += FRAME) rules.update(FRAME, { gloves: rightOn(rules) });
      assert.equal(rules.phase, 'won', `level ${level}, goal ${goal}`);
      assert.equal(rules.stats.pops, goal);
      assert.equal(rules.stats.faded, 0, `level ${level}, goal ${goal}`);
      assert.equal(rules.done, false);
      play(rules, PARTY_SECONDS + 0.1);
      assert.ok(rules.done);
      assert.equal(rules.stats.popped.left + rules.stats.popped.right + rules.stats.balloons, goal);
    }
  }
});

/* ---------- which hand ---------- */

test('each hand is asked for about as often as the other, and never three times in a row', () => {
  const rules = makeRules({ goal: 16, clock: 'gentle' });
  const hands = [];
  for (let index = 0; index < 600; index += 1) hands.push(rules.pickHand()) && rules.history.push(hands.at(-1));
  const left = hands.filter((hand) => hand === 'left').length;
  assert.ok(left > 240 && left < 360, `left ${left} of 600`);
  for (let index = 2; index < hands.length; index += 1) assert.ok(!(hands[index] === hands[index - 1] && hands[index] === hands[index - 2]), 'never three in a row');
});

test('the hand in play can be asked for twice as often, or only, as a grown-up chooses', () => {
  assert.deepEqual(HAND_MODES, ['even', 'more', 'only']);
  const more = makeRules({ hands: 'more', side: 'left' });
  const asked = [];
  for (let index = 0; index < 600; index += 1) asked.push(more.pickHand()) && more.history.push(asked.at(-1));
  const left = asked.filter((hand) => hand === 'left').length;
  assert.ok(left > 340 && left < 460, `left ${left} of 600`);
  const only = makeRules({ hands: 'only', side: 'left', clock: 'gentle' });
  only.begin();
  play(only, 120, rightOn);
  assert.ok(only.stats.pops > 5);
  assert.equal(only.stats.asked.right, 0);
  // The hand in play can change in the middle of a game.
  only.setSide('right');
  assert.equal(only.pickHand(), 'right');
});

/* ---------- what the levels bring ---------- */

test('from level 2, every third circle asked for has a star, won by popping it', () => {
  const rules = makeRules({ level: 2, clock: 'gentle', goal: 12 });
  rules.begin();
  for (let t = 0; t < 300 && rules.phase === 'play'; t += FRAME) rules.update(FRAME, { gloves: rightOn(rules) });
  const hands = rules.stats.popped.left + rules.stats.popped.right;
  assert.equal(rules.stats.stars, Math.ceil(hands / 3));
  assert.equal(said(rules, 'star').length, rules.stats.stars);
  const one = makeRules({ level: 1, clock: 'gentle' });
  one.begin();
  play(one, 120, rightOn);
  assert.equal(one.stats.stars, 0);
});

test('from level 3 the circle moves a little, and from level 8 two now and then swap places', () => {
  const still = makeRules({ level: 2, clock: 'gentle' });
  still.begin();
  const first = circleOf(still, untilAsked(still));
  const from = { x: first.x, y: first.y };
  play(still, 2, away);
  assert.ok(gap(first, from) < 1e-9);
  const moving = makeRules({ level: 3, clock: 'gentle' });
  moving.begin();
  const circle = circleOf(moving, untilAsked(moving));
  const start = { x: circle.x, y: circle.y };
  play(moving, 2, away);
  assert.ok(gap(circle, start) > 0.03, 'it moves');
  assert.ok(gap(circle, start) < 0.2, 'a little');
  // It stays where circles can be.
  play(moving, 60, away);
  const area = REACHES.middle;
  assert.ok(circle.y >= area.y[0] && circle.y <= area.y[1]);

  const swapping = makeRules({ level: 8, clock: 'gentle' });
  swapping.begin();
  play(swapping, popLevel(8).swapEvery + 0.1, away);
  assert.equal(said(swapping, 'swap').length, 1);
  const seven = makeRules({ level: 7, clock: 'gentle' });
  seven.begin();
  play(seven, 10, away);
  assert.equal(said(seven, 'swap').length, 0);
});

test('from level 4, a circle to hold only pops once the open hand has stayed on it a moment', () => {
  const rules = makeRules({ level: 4, clock: 'gentle' });
  rules.begin();
  const ask = untilAsk(rules, (each) => each.hold, 60);
  assert.ok(ask?.hold, 'a circle to hold comes');
  const circle = circleOf(rules, ask);
  const pops = rules.stats.pops;
  play(rules, HOLD_SECONDS * 0.6, rightOn);
  assert.equal(rules.stats.pops, pops, 'not yet');
  assert.ok(circle.holding > 0);
  // Taken off, it empties again.
  play(rules, 1, away);
  assert.equal(circle.holding, 0);
  play(rules, HOLD_SECONDS + 0.1, rightOn);
  assert.equal(rules.stats.pops, pops + 1);
});

test('from level 5 a circle hops once to another place, a moment after it comes', () => {
  const rules = makeRules({ level: 5, clock: 'gentle' });
  rules.begin();
  const circle = circleOf(rules, untilAsked(rules));
  const from = { x: circle.x, y: circle.y };
  play(rules, EXTRAS.hopAfter[0] - 0.1, away);
  assert.equal(said(rules, 'hop').length, 0, 'not straight away');
  play(rules, EXTRAS.hopAfter[1] - EXTRAS.hopAfter[0] + EXTRAS.hopSeconds + 0.3, away);
  assert.equal(said(rules, 'hop').length, 1);
  assert.ok(gap(circle, from) > circle.r * 2, 'somewhere else');
  play(rules, 10, away);
  assert.equal(said(rules, 'hop').length, 1, 'once');
  const four = makeRules({ level: 4, clock: 'gentle' });
  four.begin();
  play(four, 10, away);
  assert.equal(said(four, 'hop').length, 0);
});

test('from level 7, now and then one circle is asked for with each hand, and both have to be popped', () => {
  const rules = makeRules({ level: 7, clock: 'gentle', goal: 16 });
  rules.begin();
  for (let t = 0; t < 120 && rules.asks.length < 2; t += FRAME) rules.update(FRAME, { gloves: rightOn(rules) });
  const [first, second] = rules.asks;
  assert.ok(first && second, 'two at once');
  assert.deepEqual([first.hand, second.hand], ['left', 'right']);
  assert.notEqual(first.colour, second.colour);
  const pops = rules.stats.pops;
  // The left hand's first: the right hand stays away.
  const leftCircle = circleOf(rules, first);
  play(rules, 0.1, () => ({ left: gloveAt(leftCircle), right: gloveAt(AWAY) }));
  assert.equal(rules.stats.pops, pops + 1);
  assert.equal(rules.asks.length, 1, 'the other is still waiting');
  assert.equal(rules.current, second);
  play(rules, 0.1, rightOn);
  assert.equal(rules.stats.pops, pops + 2);
  // Not before level 7, and not with only the hand in play.
  for (const [level, hands] of [[6, 'even'], [7, 'only']]) {
    const each = makeRules({ level, clock: 'gentle', hands });
    each.begin();
    for (let t = 0; t < 120; t += FRAME) {
      each.update(FRAME, { gloves: rightOn(each) });
      assert.ok(each.asks.length <= 1, `level ${level} ${hands}`);
    }
  }
});

test('from level 9 a rainbow circle comes now and then: any open hand pops it, for a gem, and it doesn\'t count', () => {
  const rules = makeRules({ level: 9, clock: 'gentle' });
  rules.begin();
  play(rules, EXTRAS.rainbowEvery + 0.5, away);
  const rainbow = rules.live.find((circle) => circle.kind === 'rainbow');
  assert.ok(rainbow);
  const pops = rules.stats.pops;
  play(rules, 0.1, () => ({ left: gloveAt(rainbow), right: gloveAt(AWAY) }));
  assert.equal(rules.stats.gems, 1);
  assert.equal(rules.stats.pops, pops);
  // One that isn't popped just goes.
  play(rules, EXTRAS.rainbowEvery + EXTRAS.rainbowSeconds + FADE_SECONDS + 1, away);
  assert.equal(rules.stats.faded, 0);
  const eight = makeRules({ level: 8, clock: 'gentle' });
  eight.begin();
  play(eight, EXTRAS.rainbowEvery + 0.5, away);
  assert.equal(said(eight, 'rainbow').length, 0);
});

test('at level 10 a big circle splits in two of its colour, and popping both is one pop', () => {
  const rules = makeRules({ level: 10, clock: 'gentle', goal: 16 });
  rules.begin();
  const ask = untilAsk(rules, (each) => each.split);
  assert.ok(ask?.split, 'a big circle comes');
  const big = circleOf(rules, ask);
  assert.ok(big.big && big.r > popLevel(10).radius);
  const pops = rules.stats.pops;
  // It may have to be held a moment first, too.
  for (let t = 0; t < HOLD_SECONDS + 0.2 && !said(rules, 'split').length; t += FRAME) rules.update(FRAME, { gloves: rightOn(rules) });
  const [split] = said(rules, 'split');
  assert.ok(split);
  assert.equal(split.halves.length, 2);
  assert.ok(split.halves.every((half) => half.colour === big.colour && half.kind === 'half'));
  assert.equal(rules.stats.pops, pops);
  play(rules, 2, rightOn);
  assert.ok(rules.stats.pops >= pops + 1);
  assert.equal(said(rules, 'popped').filter((event) => event.ask === ask).length, 1);
});

test('choosing how far to reach in the middle of a game moves the circles into the new area', () => {
  const rules = makeRules({ level: 6, reach: 'far' });
  rules.setReach('close');
  const area = REACHES.close;
  for (const circle of rules.circles) {
    assert.ok(circle.x - circle.r / ASPECT >= area.x[0] - 1e-9 && circle.x + circle.r / ASPECT <= area.x[1] + 1e-9);
    assert.ok(circle.y - circle.r >= area.y[0] - 1e-9 && circle.y + circle.r <= area.y[1] + 1e-9);
  }
});

/* ---------- its words and settings ---------- */

test('every line of its own has English and Georgian voice files, and the game says each one', () => {
  const folder = new URL('../../games/left-right-pop/audio/voice/', import.meta.url);
  const lines = JSON.parse(readFileSync(new URL('lines.json', folder), 'utf8'));
  const source = readFileSync(new URL('../../games/left-right-pop/main.js', import.meta.url), 'utf8');
  assert.equal(lines.length, 5);
  for (const { id, text, ka } of lines) {
    assert.ok(ka, `${id} has Georgian`);
    assert.ok(source.includes(`'${text}'`), `"${text}" is said by the game`);
    for (const language of ['en', 'ka']) assert.ok(readFileSync(new URL(`${language}/${id}.ogg`, folder)).length > 1000, `${language}/${id}.ogg`);
  }
});

test('the lines it borrows are ones every game has, with English and Georgian voice files', () => {
  const folder = new URL('../../core/audio/voice/', import.meta.url);
  const lines = JSON.parse(readFileSync(new URL('lines.json', folder), 'utf8'));
  const byText = new Map(lines.map((line) => [line.text, line]));
  const source = readFileSync(new URL('../../games/left-right-pop/main.js', import.meta.url), 'utf8');
  const spoken = ['Open your left hand to pop it!', 'Open your right hand to pop it!', 'Great job!', 'Nice one!', 'Way to go!', 'You popped them all!', 'Keep your hands apart', 'Come a little closer'];
  for (const text of spoken) {
    assert.ok(source.includes(text), `"${text}" is in main.js`);
    const line = byText.get(text);
    assert.ok(line, `"${text}" is a line every game has`);
    for (const language of ['en', 'ka']) assert.ok(readFileSync(new URL(`${language}/${line.id}.ogg`, folder)).length > 1000, `${language}/${line.id}.ogg`);
  }
  for (const side of ['left', 'right']) {
    assert.ok(byText.has(`Show your ${side} hand!`) && byText.has(`Move your ${side} hand into the picture`));
  }
});

test('the grown-ups\' settings for this game have names of their own, as every game\'s are kept together', () => {
  const source = readFileSync(new URL('../../games/left-right-pop/main.js', import.meta.url), 'utf8');
  assert.match(source, /defaults: \{ popHands: 'even', popClock: 'clock', popReach: 'middle', popGoal: 12, popNames: 'off' \}/);
  assert.match(source, /choices: \{ popHands: String, popClock: String, popReach: String, popGoal: Number, popNames: String \}/);
  assert.match(source, /atOnce: \['popReach', 'popNames'\]/);
});
