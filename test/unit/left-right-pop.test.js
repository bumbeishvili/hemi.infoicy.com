// Left, Right, Pop!: circles of each colour once, asked for with one hand or the other; only the colour asked for,
// with the hand asked for and open, pops it; the other hand only makes it wobble; the clock that fades a circle
// away, and only runs while a hand that's asked for can be seen; the gentle game with no clock; and what each level
// brings. Everything here runs without a screen, with pretend gloves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CLOCKS, COLOURS, EXTRAS, FADE_SECONDS, FIRST_COLOURS, GOAL_CHOICES, HAND_MODES, HOLD_SECONDS, LOST_SECONDS, MORE_COLOURS,
  NEWS, NEXT_ASK_AFTER, PARTY_SECONDS, PopRules, REACHES, REACH_NAMES, fadesToLose, popLevel, popNewAt,
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
const hidden = () => gloveAt(AWAY, { visible: false });

/** Plays for so long, with gloves that can follow what's going on: gloves(rules) is { left, right }. */
function play(rules, seconds, gloves = () => ({})) {
  for (let t = 0; t < seconds && !rules.done; t += FRAME) rules.update(FRAME, { gloves: gloves(rules) });
}

/** Plays until something is asked for. */
function untilAsked(rules, gloves = () => ({ left: gloveAt(AWAY), right: gloveAt(AWAY) })) {
  for (let t = 0; t < 10 && !rules.current; t += FRAME) rules.update(FRAME, { gloves: gloves(rules) });
  assert.ok(rules.current, 'something is asked for');
  return rules.current;
}

const circleOf = (rules, ask) => rules.circles.find((circle) => circle.id === ask.circles[0]);

/** The hand asked for, open, on the circle asked for, and the other hand away. */
function rightOn(rules) {
  const ask = rules.current;
  if (!ask) return { left: gloveAt(AWAY), right: gloveAt(AWAY) };
  const circle = rules.circles.find((each) => ask.circles.includes(each.id) && (each.state === 'waiting' || each.state === 'growing'));
  const on = circle ? gloveAt(circle) : gloveAt(AWAY);
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
});

test('higher levels have more circles, a little smaller, and less time for each, and gentle has no clock', () => {
  assert.equal(popLevel(1).circles, 3);
  assert.equal(popLevel(10).circles, 6);
  for (const level of LEVELS.slice(1)) {
    assert.ok(popLevel(level).circles >= popLevel(level - 1).circles);
    assert.ok(popLevel(level).radius < popLevel(level - 1).radius);
    assert.ok(popLevel(level).wait < popLevel(level - 1).wait);
    assert.equal(popLevel(level, { gentle: true }).wait, Infinity);
  }
  assert.equal(popLevel(10).wait, popLevel(1).wait / 2);
  // There are always more colours than circles, so each is there only once.
  for (const level of LEVELS) assert.ok((popLevel(level).colours ? FIRST_COLOURS.length + MORE_COLOURS.length : FIRST_COLOURS.length) >= popLevel(level).circles, `level ${level}`);
});

test('how many circles fading away lose the game goes down with the level, and is never under two', () => {
  assert.equal(fadesToLose(1, 12), 6);
  assert.equal(fadesToLose(10, 12), 3);
  for (const goal of GOAL_CHOICES) for (const level of LEVELS) assert.ok(fadesToLose(level, goal) >= 2);
  assert.equal(makeRules({ clock: 'gentle' }).toLose, Infinity);
  assert.deepEqual(CLOCKS, ['clock', 'gentle']);
});

/* ---------- the circles ---------- */

test('the screen has its level\'s circles, each colour once, all inside where they can come and none on top of another', () => {
  for (const reach of REACH_NAMES) {
    for (const level of LEVELS) {
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

test('purple and orange only come from level 6', () => {
  for (const level of LEVELS) {
    const rules = makeRules({ level, clock: 'gentle' });
    play(rules, 1, rightOn);
    rules.begin();
    const seen = new Set();
    play(rules, 60, (each) => {
      for (const circle of each.plain) seen.add(circle.colour);
      return rightOn(each);
    });
    const more = MORE_COLOURS.some((colour) => seen.has(colour));
    assert.equal(more, level >= 6, `level ${level}`);
  }
});

/* ---------- popping ---------- */

test('the hand asked for, open, on the colour asked for, pops it, and the next is asked for soon after', () => {
  const rules = makeRules();
  rules.begin();
  const ask = untilAsked(rules);
  const circle = circleOf(rules, ask);
  assert.equal(circle.colour, ask.colour);
  assert.equal(said(rules, 'ask').length, 1);
  play(rules, 0.1, rightOn);
  assert.equal(rules.stats.pops, 1);
  assert.equal(rules.stats.popped[ask.hand], 1);
  assert.equal(said(rules, 'pop').length, 1);
  assert.equal(said(rules, 'popped')[0].side, ask.hand);
  assert.equal(rules.current, null, 'nothing is asked for for a moment');
  play(rules, NEXT_ASK_AFTER + 0.1, () => ({ left: gloveAt(AWAY), right: gloveAt(AWAY) }));
  assert.ok(rules.current && rules.current.id !== ask.id, 'the next one is asked for');
  // A new circle took the popped one's place.
  play(rules, 0.5, () => ({ left: gloveAt(AWAY), right: gloveAt(AWAY) }));
  assert.equal(rules.plain.length, popLevel(1).circles);
});

test('the other hand on the colour asked for only makes it wobble, and says so once in a while', () => {
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

test('a closed hand pops nothing, and an open hand on another colour only makes it wobble', () => {
  const rules = makeRules({ clock: 'gentle' });
  rules.begin();
  const ask = untilAsked(rules);
  const circle = circleOf(rules, ask);
  play(rules, 1, () => ({ left: gloveAt(circle, { open: false }), right: gloveAt(circle, { open: false }) }));
  assert.equal(rules.stats.pops, 0);
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
  untilAsked(rules);
  const fresh = rules.addCircle({ colour: 'red' });
  rules.turn.asks[0].circles = [fresh.id];
  rules.update(FRAME, { gloves: { left: gloveAt(fresh), right: gloveAt(fresh) } });
  assert.equal(fresh.state, 'growing');
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
  const seen = { left: gloveAt(AWAY), right: gloveAt(AWAY) };
  play(rules, popLevel(1).wait - 0.2, () => seen);
  assert.equal(rules.stats.faded, 0);
  play(rules, 0.4, () => seen);
  assert.equal(rules.stats.faded, 1);
  assert.equal(said(rules, 'faded').length, 1);
  assert.ok(rules.clockShare === null, 'nothing is asked for just then');
});

test('too many fading away loses the game, and the gentle game can\'t be lost', () => {
  const rules = makeRules({ level: 10 });
  rules.begin();
  play(rules, 200, () => ({ left: gloveAt(AWAY), right: gloveAt(AWAY) }));
  assert.equal(rules.phase, 'lost');
  // Two can fade at once, when one was asked for with each hand.
  assert.ok(rules.stats.faded >= rules.toLose && rules.stats.faded <= rules.toLose + 1, `${rules.stats.faded} faded`);
  assert.equal(said(rules, 'lost').length, 1);
  assert.ok(rules.done);

  const ending = makeRules({ level: 10 });
  ending.begin();
  for (let t = 0; t < 200 && ending.phase !== 'lost'; t += FRAME) ending.update(FRAME, { gloves: { left: gloveAt(AWAY), right: gloveAt(AWAY) } });
  assert.equal(ending.done, false, 'a moment to see it before the finish card');
  play(ending, LOST_SECONDS + 0.1);
  assert.ok(ending.done);

  const gentle = makeRules({ level: 10, clock: 'gentle' });
  gentle.begin();
  play(gentle, 600, () => ({ left: gloveAt(AWAY), right: gloveAt(AWAY) }));
  assert.equal(gentle.stats.faded, 0);
  assert.equal(gentle.phase, 'play');
  assert.equal(gentle.clockShare, null);
});

test('popping enough wins the game, after a moment to see it', () => {
  for (const goal of GOAL_CHOICES) {
    const rules = makeRules({ goal });
    rules.begin();
    for (let t = 0; t < 300 && rules.phase === 'play'; t += FRAME) rules.update(FRAME, { gloves: rightOn(rules) });
    assert.equal(rules.phase, 'won', `goal ${goal}`);
    assert.equal(rules.stats.pops, goal);
    assert.equal(rules.stats.faded, 0);
    assert.equal(rules.done, false);
    play(rules, PARTY_SECONDS + 0.1);
    assert.ok(rules.done);
    assert.equal(rules.stats.popped.left + rules.stats.popped.right, goal);
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
  assert.equal(rules.stats.stars, 4);
  assert.equal(said(rules, 'star').length, 4);
  const one = makeRules({ level: 1, clock: 'gentle' });
  one.begin();
  play(one, 120, rightOn);
  assert.equal(one.stats.stars, 0);
});

test('from level 4, a circle to hold only pops once the open hand has stayed on it a moment', () => {
  const rules = makeRules({ level: 4, clock: 'gentle' });
  rules.begin();
  for (let t = 0; t < 60 && !(rules.current?.hold); t += FRAME) rules.update(FRAME, { gloves: rightOn(rules) });
  const ask = rules.current;
  assert.ok(ask?.hold, 'a circle to hold comes');
  const circle = circleOf(rules, ask);
  const pops = rules.stats.pops;
  play(rules, HOLD_SECONDS * 0.6, rightOn);
  assert.equal(rules.stats.pops, pops, 'not yet');
  assert.ok(circle.holding > 0);
  // Taken off, it empties again.
  play(rules, 1, () => ({ left: gloveAt(AWAY), right: gloveAt(AWAY) }));
  assert.equal(circle.holding, 0);
  play(rules, HOLD_SECONDS + 0.1, rightOn);
  assert.equal(rules.stats.pops, pops + 1);
});

test('from level 5, now and then one circle is asked for with each hand, and both have to be popped', () => {
  const rules = makeRules({ level: 5, clock: 'gentle', goal: 16 });
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
  // Not with only the hand in play.
  const only = makeRules({ level: 5, clock: 'gentle', hands: 'only' });
  only.begin();
  for (let t = 0; t < 120; t += FRAME) {
    only.update(FRAME, { gloves: rightOn(only) });
    assert.ok(only.asks.length <= 1);
  }
});

test('from level 3 circles drift, and from level 7 two now and then swap places', () => {
  const still = makeRules({ level: 2, clock: 'gentle' });
  still.begin();
  const where = still.plain.map(({ x, y }) => ({ x, y }));
  play(still, 0.5);
  still.plain.forEach((circle, index) => assert.ok(gap(circle, where[index]) < 1e-9));
  const drifting = makeRules({ level: 3, clock: 'gentle' });
  drifting.begin();
  const from = drifting.plain.map(({ x, y }) => ({ x, y }));
  play(drifting, 2);
  assert.ok(drifting.plain.some((circle, index) => gap(circle, from[index]) > 0.03));
  // Drifting circles stay where circles can be.
  play(drifting, 60);
  const area = REACHES.middle;
  for (const circle of drifting.plain) assert.ok(circle.y >= area.y[0] && circle.y <= area.y[1]);

  const swapping = makeRules({ level: 7, clock: 'gentle' });
  swapping.begin();
  play(swapping, popLevel(7).swapEvery + 0.1);
  assert.equal(said(swapping, 'swap').length, 1);
  assert.equal(said(makeRules({ level: 6 }), 'swap').length, 0);
});

test('from level 8 a rainbow circle comes now and then: any open hand pops it, for a gem, and it doesn\'t count', () => {
  const rules = makeRules({ level: 8, clock: 'gentle' });
  rules.begin();
  play(rules, EXTRAS.rainbowEvery + 0.5, () => ({ left: gloveAt(AWAY), right: gloveAt(AWAY) }));
  const rainbow = rules.live.find((circle) => circle.kind === 'rainbow');
  assert.ok(rainbow);
  const pops = rules.stats.pops;
  play(rules, 0.1, () => ({ left: gloveAt(rainbow), right: gloveAt(AWAY) }));
  assert.equal(rules.stats.gems, 1);
  assert.equal(rules.stats.pops, pops);
  // One that isn't popped just goes.
  play(rules, EXTRAS.rainbowEvery + EXTRAS.rainbowSeconds + FADE_SECONDS + 1, () => ({ left: gloveAt(AWAY), right: gloveAt(AWAY) }));
  assert.equal(rules.stats.faded, 0);
});

test('from level 9 a cloud drifts across now and then', () => {
  const rules = makeRules({ level: 9, clock: 'gentle' });
  rules.begin();
  play(rules, EXTRAS.cloudEvery, () => ({ left: gloveAt(AWAY), right: gloveAt(AWAY) }));
  assert.ok(said(rules, 'cloud').length >= 1);
  assert.equal(said(makeRules({ level: 8 }), 'cloud').length, 0);
});

test('at level 10 a big circle splits in two of its colour, and popping both is one pop', () => {
  const rules = makeRules({ level: 10, clock: 'gentle', goal: 16 });
  rules.begin();
  for (let t = 0; t < 120 && !(rules.current?.split); t += FRAME) rules.update(FRAME, { gloves: rightOn(rules) });
  const ask = rules.current;
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
  const rules = makeRules({ reach: 'far' });
  rules.setReach('close');
  const area = REACHES.close;
  for (const circle of rules.circles) {
    assert.ok(circle.x - circle.r / ASPECT >= area.x[0] - 1e-9 && circle.x + circle.r / ASPECT <= area.x[1] + 1e-9);
    assert.ok(circle.y - circle.r >= area.y[0] - 1e-9 && circle.y + circle.r <= area.y[1] + 1e-9);
  }
});

/* ---------- its words and settings ---------- */

test('everything the game says is one of the lines every game has, with English and Georgian voice files', () => {
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
