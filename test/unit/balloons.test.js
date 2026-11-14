// The parts of Balloon Pop that can be checked without a screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { toScreen } from '../../games/balloon-pop/balloons.js';
import { LEVELS, MathsDeck, answersFor, choicesFor } from '../../games/balloon-pop/maths.js';
import {
  awayAllowed, balloonLevel, balloonNewAt, balloonsPerMinute, LEAST_AWAY, MOST_ANSWERS, newsIsOn, PACES, PLACES, POWER_SECONDS, PRIZE, secondsOnScreen, STAR_HOLD_SECONDS, WANDERER_CHANCE,
} from '../../games/balloon-pop/rules.js';

test('the middle of the picture lands near the middle of the screen', () => {
  const { x, y } = toScreen(0.5, 0.49, 1000, 500);
  assert.ok(Math.abs(x - 500) < 1);
  assert.ok(Math.abs(y - 250) < 1);
});

test('the screen\'s edges can be reached without the hand leaving the picture', () => {
  assert.ok(toScreen(0.1, 0.5, 1000, 500).x <= 0);
  assert.ok(toScreen(0.9, 0.5, 1000, 500).x >= 1000);
  assert.ok(toScreen(0.5, 0.1, 1000, 500).y <= 0);
  assert.ok(toScreen(0.5, 0.88, 1000, 500).y >= 500);
});

test('every question is right, and stays within what its level says', () => {
  for (const { a, b, answer } of LEVELS.add.questions) {
    assert.equal(answer, a + b);
    assert.ok(answer <= 10 && a >= 1 && b >= 1);
  }
  assert.equal(LEVELS.add.questions.length, 45);
  for (const { id, a, b, answer } of LEVELS.addTake.questions) {
    assert.equal(answer, id.startsWith('add') ? a + b : a - b);
    assert.ok(answer >= 1 && answer <= 20 && a <= 20, id);
  }
  assert.ok(LEVELS.addTake.questions.some(({ id }) => id.startsWith('take')));
  for (const { a, b, answer } of LEVELS.times.questions) assert.equal(answer, a * b);
  assert.equal(LEVELS.times.questions.length, 81);
});

test('the right answer is always there, among other sensible ones, and it moves around', () => {
  for (const { choices, questions } of Object.values(LEVELS)) {
    for (const question of questions) {
      const answers = answersFor(question, choices);
      assert.equal(answers.length, choices, question.id);
      assert.equal(new Set(answers).size, choices, `${question.id}: ${answers}`);
      assert.equal(answers.filter((value) => value === question.answer).length, 1, question.id);
      assert.ok(answers.every((value) => Number.isInteger(value) && value > 0), `${question.id}: ${answers}`);
    }
  }
  const [question] = LEVELS.add.questions;
  const places = new Set(Array.from({ length: 60 }, () => answersFor(question, 3).indexOf(question.answer)));
  assert.equal(places.size, 3);
});

test('no question comes round again until they\'ve all been asked', () => {
  const deck = new MathsDeck('add');
  const asked = Array.from({ length: LEVELS.add.questions.length }, () => deck.next().id);
  assert.equal(new Set(asked).size, asked.length);
  const next = deck.next();
  assert.ok(next.answers.includes(next.answer));
  assert.equal(next.answers.length, LEVELS.add.choices);
});

test('what Balloon Pop says about answers has a voice file, in both languages', () => {
  const lines = JSON.parse(readFileSync(new URL('../../core/audio/voice/lines.json', import.meta.url)));
  const known = new Map(lines.map(({ text, id, ka }) => [text, { id, ka }]));
  const source = readFileSync(new URL('../../games/balloon-pop/main.js', import.meta.url), 'utf8');
  for (const constant of ['MATHS_HINT', 'TOO_HOT', 'COOL_IT']) {
    const [, text] = source.match(new RegExp(`const ${constant} = '([^']+)'`));
    const line = known.get(text);
    assert.ok(line, text);
    assert.match(line.ka, /[Ⴀ-ჿ]/, text);
    for (const language of ['en', 'ka']) {
      assert.ok(existsSync(new URL(`../../core/audio/voice/${language}/${line.id}.ogg`, import.meta.url)), `${language}/${line.id}.ogg`);
    }
  }
});

/* ---------- levels ---------- */

const LEVEL_NUMBERS = Array.from({ length: 10 }, (_, index) => index + 1);
// For each number a level changes, which way is harder. More presents, rainbows and friends in baskets
// are more to deal with, though they help too.
const HARDER = { rise: 1, every: -1, most: 1, wanderers: 1, presents: 1, stars: 1, pairs: 1, breeze: 1, rainbow: 1, big: 1, answers: 1 };
// What a level adds rather than turns up: lists that only ever grow, and new things that come at a level.
const ADDED = ['powers', 'prizes'];
const FROM_LEVEL = ['baskets', 'powerEvery', 'place'];

test('level 1 is Balloon Pop as it always was', () => {
  assert.deepEqual(PACES, {
    slow: { rise: 0.085, every: 1.05, most: 7 },
    medium: { rise: 0.115, every: 0.8, most: 9 },
    fast: { rise: 0.16, every: 0.6, most: 11 },
  });
  assert.equal(WANDERER_CHANCE, 0.25);
  assert.deepEqual(balloonLevel(1), {
    rise: 1, every: 1, most: 0, wanderers: 0.25, presents: 0, stars: 0, pairs: 0, breeze: 0, rainbow: 0, big: 0,
    baskets: 0, powerEvery: 0, powers: [], prizes: [], place: 'hills', answers: 0,
  });
  assert.deepEqual(balloonNewAt(1), []);
  for (const kind of Object.keys(LEVELS)) assert.equal(new MathsDeck(kind, Math.random, { extra: balloonLevel(1).answers }).choices, LEVELS[kind].choices);
});

test('each level is the same or harder than the one before in every way, and harder in at least one', () => {
  assert.deepEqual(Object.keys(balloonLevel(1)).sort(), [...Object.keys(HARDER), ...ADDED, ...FROM_LEVEL].sort());
  for (const level of LEVEL_NUMBERS.slice(1)) {
    // Power-ups and prizes only ever join: nothing a level had goes away at the next.
    for (const key of ADDED) assert.ok(balloonLevel(level - 1)[key].every((thing) => balloonLevel(level)[key].includes(thing)), `level ${level}: ${key}`);
    // Friends in baskets and power-ups, once they've come, stay, and come along at least as often.
    for (const key of ['baskets', 'powerEvery']) {
      const [before, now] = [balloonLevel(level - 1)[key], balloonLevel(level)[key]];
      if (before) assert.ok(now > 0 && now <= before, `level ${level}: ${key}`);
    }
  }
  for (const level of LEVEL_NUMBERS.slice(1)) {
    const before = balloonLevel(level - 1);
    const now = balloonLevel(level);
    let harder = 0;
    for (const [key, way] of Object.entries(HARDER)) {
      assert.ok((now[key] - before[key]) * way >= 0, `level ${level}: ${key} got easier`);
      if ((now[key] - before[key]) * way > 0) harder += 1;
    }
    assert.ok(harder > 0, `level ${level} is no harder than ${level - 1}`);
  }
});

test('every level from 2 brings something new, which really comes in at that level and stays', () => {
  for (const level of LEVEL_NUMBERS.slice(1)) {
    const news = balloonNewAt(level);
    assert.ok(news.length > 0 && news.length <= 3, `level ${level} has nothing new`);
    for (const { key, mark, name, nameKa } of news) {
      assert.ok(mark && name && name.split(' ').length <= 3, `level ${level}: ${name}`);
      assert.match(nameKa, /[Ⴀ-ჿ]/, name);
      // Not there the level before, there from this level, and still there at every level after.
      assert.equal(newsIsOn(key, level - 1), false, `${name} is already on at level ${level - 1}`);
      assert.equal(newsIsOn(key, level), true, `${name} is off at level ${level}`);
      // A place lasts until the next one, and everything else stays once it's come.
      if (PLACES.includes(key)) continue;
      for (const later of LEVEL_NUMBERS.slice(level - 1)) assert.equal(newsIsOn(key, later), true, `${name} is off at level ${later}`);
    }
  }
  // Every new thing is listed somewhere, so nothing comes without its chip.
  const listed = new Set(LEVEL_NUMBERS.flatMap((level) => balloonNewAt(level).map(({ key }) => key)));
  for (const thing of ['presents', 'sweet', 'bubble', 'stars', 'pairs', 'gem', 'seaside', 'baskets', 'heart', 'magnet', 'breeze', 'rainbow', 'fair', 'bird', 'big']) {
    assert.ok(listed.has(thing), thing);
  }
  const top = balloonLevel(10);
  assert.ok(top.stars > 0 && top.pairs > 0 && top.breeze > 0 && top.answers > 0 && top.rainbow > 0 && top.big > 0 && top.baskets > 0);
  assert.deepEqual(top.powers.sort(), ['bird', 'bubble', 'magnet']);
  assert.deepEqual(top.prizes.sort(), ['gem', 'heart', 'star', 'sweet']);
});

test('prizes and power-ups are gentle: slow to fall, easy to catch, and over in a few seconds', () => {
  // A prize takes about ten seconds to fall the height of the screen, so there's time to get to it.
  assert.ok(1 / PRIZE.fall >= 10);
  // It's caught by the glove coming within a palm and a half, and drifts to a hand nearer than 0.4 of
  // the screen, at a pace a child can see: about a third of the screen in a second and a half.
  assert.ok(PRIZE.catchPalms >= 1.5 && PRIZE.pullRange >= 0.4 && PRIZE.pull <= 0.3);
  assert.ok(POWER_SECONDS >= 6 && POWER_SECONDS <= 10);
});

test('on Gentle, even level 10 stays doable: time to reach, balloons a minute, and the length of a game', () => {
  const gentle = { gentle: true };
  for (const pace of Object.keys(PACES)) {
    // Each balloon is on the screen for at least 70% of the time it was at level 1.
    assert.ok(secondsOnScreen(pace, 10, gentle) >= 0.7 * secondsOnScreen(pace, 1, gentle), pace);
    // No more than twice as many balloons a minute to reach for, counting the three a big one pops into
    // and the balloons on a friend's basket.
    for (const level of LEVEL_NUMBERS) assert.ok(balloonsPerMinute(pace, level, gentle) <= 2 * balloonsPerMinute(pace, 1, gentle), `${pace} ${level}`);
  }
  // How many to pop is the grown-up's, so a game only gets longer by the moments star balloons are held,
  // which is a few seconds over a game, well under a third of it.
  const balloonsToPop = 20;
  const levelOneSeconds = balloonsToPop * (60 / balloonsPerMinute('fast', 1));
  const extraSeconds = balloonsToPop * balloonLevel(10).stars * STAR_HOLD_SECONDS;
  assert.ok(extraSeconds < levelOneSeconds / 3);
  // A breeze can't carry a balloon far: less than a twentieth of the screen each way.
  assert.ok(balloonLevel(10).breeze <= 0.05);
});

test('the maths challenge has a few more answers to choose from at higher levels, never more than fit', () => {
  for (const [kind, { choices, questions }] of Object.entries(LEVELS)) {
    const counts = LEVEL_NUMBERS.map((level) => new MathsDeck(kind, Math.random, { extra: balloonLevel(level).answers, most: MOST_ANSWERS }).choices);
    assert.equal(counts[0], choices);
    assert.ok(counts.every((count, index) => index === 0 || count >= counts[index - 1]));
    assert.ok(counts[9] > choices && counts[9] <= MOST_ANSWERS, `${kind}: ${counts}`);
    // Every question still has that many different answers, with the right one among them.
    for (const question of questions) {
      const answers = answersFor(question, counts[9]);
      assert.equal(new Set(answers).size, counts[9], question.id);
      assert.ok(answers.includes(question.answer) && answers.every((value) => value > 0), question.id);
    }
  }
});

test('with the maths challenge on, the cards only list what comes with it: one more answer where a level adds one, and the places', () => {
  const words = (news) => news.map(({ name }) => name);
  // Off, or never chosen, is the usual list.
  for (const level of LEVEL_NUMBERS) {
    assert.deepEqual(balloonNewAt(level, { maths: 'off' }), balloonNewAt(level));
    assert.deepEqual(balloonNewAt(level, {}), balloonNewAt(level));
  }
  for (const kind of Object.keys(LEVELS)) {
    const answers = (level) => new MathsDeck(kind, Math.random, { extra: balloonLevel(level).answers, most: MOST_ANSWERS }).choices;
    for (const level of LEVEL_NUMBERS) {
      const news = balloonNewAt(level, { maths: kind });
      // Only balloons with answers come up, so nothing else that's new is listed, apart from a new place.
      const places = balloonNewAt(level).filter(({ key }) => PLACES.includes(key));
      const adds = level > 1 && answers(level) > answers(level - 1);
      assert.deepEqual(news.filter(({ key }) => key !== 'answers'), places, `${kind} at ${level}`);
      assert.equal(news.some(({ key }) => key === 'answers'), adds, `${kind} at ${level}: ${words(news)}`);
      for (const { mark, name, nameKa } of news) {
        assert.ok(mark && name && name.split(' ').length <= 3, name);
        assert.match(nameKa, /[Ⴀ-ჿ]/, name);
      }
      // What the cards say is what the deck really has.
      assert.equal(choicesFor(kind, balloonLevel(level).answers, MOST_ANSWERS), answers(level));
    }
  }
  // Adding up to 10 starts with three answers, so it gets one more at 4 and another at 8. The others
  // start with four, and five is the most, so only level 4 adds one.
  assert.deepEqual(words(balloonNewAt(4, { maths: 'add' })), ['One more answer']);
  assert.deepEqual(words(balloonNewAt(8, { maths: 'add' })), ['One more answer', 'The fair']);
  assert.deepEqual(words(balloonNewAt(8, { maths: 'times' })), ['The fair']);
  assert.deepEqual(words(balloonNewAt(5, { maths: 'addTake' })), ['By the sea']);
  for (const level of [1, 2, 3, 6, 7, 9, 10]) assert.deepEqual(balloonNewAt(level, { maths: 'add' }), [], `level ${level}`);
});

test('by default the levels climb further: at level 10 a balloon is up for two thirds of the time, and more come', () => {
  for (const pace of Object.keys(PACES)) {
    assert.equal(secondsOnScreen(pace, 1), secondsOnScreen(pace, 1, { gentle: true }), 'level 1 is the same either way');
    const share = secondsOnScreen(pace, 10) / secondsOnScreen(pace, 1);
    assert.ok(share > 0.6 && share < 0.7, `${pace}: ${share}`);
    assert.ok(secondsOnScreen(pace, 10) < secondsOnScreen(pace, 10, { gentle: true }));
    assert.ok(balloonsPerMinute(pace, 10) > balloonsPerMinute(pace, 10, { gentle: true }));
    for (const level of LEVEL_NUMBERS.slice(1)) assert.ok(secondsOnScreen(pace, level) < secondsOnScreen(pace, level - 1), `${pace} ${level}`);
  }
  assert.deepEqual(balloonLevel(1), balloonLevel(1, { gentle: true }));
});

test('how many balloons can float away: twice the number to pop at level 1, down to half at level 10', () => {
  assert.equal(awayAllowed(20, 1), 40);
  assert.equal(awayAllowed(40, 1), 80);
  assert.equal(awayAllowed(20, 10), 10);
  assert.equal(awayAllowed(60, 10), 30);
  for (const goal of [20, 40, 60]) {
    for (const level of LEVEL_NUMBERS.slice(1)) assert.ok(awayAllowed(goal, level) <= awayAllowed(goal, level - 1), `${goal} ${level}`);
    assert.ok(awayAllowed(goal, 10) >= LEAST_AWAY);
  }
});
