// The rules of a fight and the coach that runs it, without a screen or a camera.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { CLIPS } from '../../games/mighty-moves/clips.js';
import { Coach } from '../../games/mighty-moves/coach.js';
import { Fight, TEAM } from '../../games/mighty-moves/fight.js';
import { ARRIVES, CAN_BE_TWICE, COMBOS, DEFENCES, EXERCISES, MOVES, NEW_THINGS, NPC_LEVELS, ORDER, PRIZES, RULES, fightLevel, levelHas, newThingsAt } from '../../games/mighty-moves/moves.js';
import { DEMOS } from '../../core/body/demos.js';
import { ICONS } from '../../core/body/icons.js';
import { ROSTER } from '../../core/body/roster.js';

// How the computer's strength comes, read from the game's own defaults.
const DEFAULT_STRENGTH = /fightStrength: '(\w+)'/.exec(readFileSync(new URL('../../games/mighty-moves/main.js', import.meta.url), 'utf8'))?.[1];

const MEDIUM = { ...NPC_LEVELS.medium, mercy: 0 };

function setup(options = {}) {
  const events = [];
  const fight = new Fight({ level: MEDIUM, onEvent: (event) => events.push(event), ...options });
  fight.beginRound();
  return { fight, events };
}

const run = (fight, seconds) => {
  for (let t = 0; t < seconds; t += 0.02) fight.update(0.02);
};
const landed = (events) => events.filter(({ type }) => type === 'hit');
const lastHit = (events) => landed(events).at(-1);

/** Performs a move, and returns what it did with nothing else going on. */
function damageOf(move, options = {}, setupOptions = {}) {
  const { fight, events } = setup(setupOptions);
  fight.perform('player', move, options);
  run(fight, 1);
  return lastHit(events).damage;
}

/** Just enough of a body reader for a coach to watch. */
const fakeReader = (changes = {}) => ({
  moving: false,
  guard: false,
  dodge: 0,
  jumpEffort: 0,
  sink: 0,
  footHeight: 0,
  handHeight: { left: -0.9, right: -0.9 },
  personal: { jump: null, squat: null, leg: null, hand: null },
  jumpNeeded: 0.06,
  squatNeeded: 0.16,
  legNeeded: 0.16,
  handNeeded: 0.27,
  ...changes,
});

function coached(options = {}, coachOptions = {}) {
  const { fight, events } = setup(options);
  const reader = fakeReader();
  const coach = new Coach({ fight, reader, ...coachOptions });
  coach.beginRound();
  // Everything goes forward together, as it does in the game.
  const pass = (seconds, each = () => {}) => {
    for (let t = 0; t < seconds; t += 0.02) {
      each();
      if (reader.moving) fight.noteActivity(0.02);
      coach.update(0.02);
      fight.update(0.02);
    }
  };
  pass(RULES.firstCallAfter + 0.05);
  return { fight, events, reader, coach, pass };
}

/** What the reader would see for whatever the coach is asking for. */
const whatsAsked = ({ call }) => [{ move: call.exercise.reads[0], side: call.side, hand: 'open' }];
const named = (events, type) => events.filter((event) => event.type === type);

test('there are ten fighters, each with their own look, name and signature move', () => {
  assert.equal(ROSTER.length, 10);
  for (const field of ['id', 'name', 'nameKa', 'signature', 'signatureKa', 'shout', 'shoutKa', 'voice']) {
    assert.equal(new Set(ROSTER.map((fighter) => fighter[field])).size, field === 'voice' ? ROSTER.length : 10, field);
  }
});

test('the coach asks for concrete moves, and every one has a film, a picture and words to go with it', () => {
  for (const wanted of ['clap', 'squat', 'jump', 'handCircle', 'kneeLift', 'kick']) assert.ok(ORDER.includes(wanted), wanted);
  for (const [name, exercise] of Object.entries(EXERCISES)) {
    assert.ok(DEMOS[exercise.demo], `${name} has a film`);
    assert.ok(ICONS[name], `${name} has a picture`);
    assert.ok(CLIPS[exercise.move], `${name} has something for the fighter to do`);
    assert.ok(MOVES[exercise.move].name, `${name} has a name to call out`);
    assert.ok(exercise.reads.length > 0, name);
    assert.ok(exercise.label, name);
    assert.equal(exercise.seen.length, 2, name);
    assert.match(exercise.seen[1], /[Ⴀ-ჿ]/, name);
    if (exercise.sided) {
      assert.match(exercise.ask.left, /left/, name);
      assert.match(exercise.ask.right, /right/, name);
    } else {
      assert.equal(typeof exercise.ask, 'string', name);
    }
  }
  for (const { demo } of Object.values(DEFENCES)) assert.ok(DEMOS[demo], demo);
});

test('the first thing asked for is shown and said, and then it waits for as long as it takes', () => {
  const { coach, events, pass } = coached();
  assert.equal(coach.phase, 'asking');
  assert.equal(coach.call.name, ORDER[0]);
  assert.deepEqual(named(events, 'call').map(({ name }) => name), [ORDER[0]]);
  pass(60);
  assert.equal(coach.call.name, ORDER[0], 'a child who isn\'t moving isn\'t hurried');
  assert.equal(named(events, 'move').length, 0);
  assert.ok(named(events, 'resting').length === 1, 'and is told that\'s fine, once');
});

test('doing what was asked makes the big move, and then it asks for the next thing', () => {
  const { coach, events, fight, pass } = coached();
  coach.onMoves(whatsAsked(coach));
  assert.equal(named(events, 'call-done').length, 1);
  const [move] = named(events, 'move');
  assert.equal(move.move, MOVES[EXERCISES[ORDER[0]].move] && EXERCISES[ORDER[0]].move);
  assert.equal(move.small, false);
  pass(0.5);
  assert.ok(fight.npc.hp <= RULES.maxHp - 10, `now ${fight.npc.hp}`);
  assert.equal(fight.stats.exercises[ORDER[0]], 1);
  pass(RULES.afterMove + 0.3);
  assert.equal(coach.phase, 'asking');
  assert.equal(coach.call.name, ORDER[1]);
});

test('every move on the list gets asked for in turn', () => {
  const { coach, pass } = coached({ level: { ...MEDIUM, every: 1000 } });
  const asked = [];
  for (let i = 0; i < ORDER.length; i += 1) {
    asked.push(coach.call.name);
    coach.fight.npc.hp = RULES.maxHp;
    coach.onMoves(whatsAsked(coach));
    pass(2.6);
  }
  assert.deepEqual(asked, ORDER);
});

test('anything else does nothing big, and a big exercise that wasn\'t asked for does nothing at all', () => {
  const { coach, events, fight } = coached();
  assert.equal(coach.call.name, 'clap');
  coach.onMoves([{ move: 'stomp', exercise: 'squat' }]);
  coach.onMoves([{ move: 'flying', exercise: 'jump' }]);
  coach.onMoves([{ move: 'circle', side: 'right' }]);
  assert.equal(named(events, 'move').length, 0);
  assert.equal(fight.stats.exercises.squat, 0);
  assert.equal(coach.call.name, 'clap');
  assert.equal(named(events, 'nudge').length, 1, 'it says so, but not over and over');
});

test('ordinary punches and kicks are small hits, which land, in the way they were made', () => {
  const { coach, events, fight, pass } = coached();
  assert.equal(coach.call.name, 'clap');
  coach.onMoves([{ move: 'palm', side: 'left', hand: 'open' }]);
  pass(0.8);
  coach.onMoves([{ move: 'kick', side: 'right' }]);
  pass(0.8);
  coach.onMoves([{ move: 'uppercut', side: 'right', hand: null }]);
  pass(0.8);
  coach.onMoves([{ move: 'punch', side: 'left', hand: 'closed' }]);
  pass(0.8);
  const moves = named(events, 'move');
  assert.deepEqual(moves.map(({ move, side }) => [move, side]), [['palm', 'left'], ['kick', 'right'], ['uppercut', 'right'], ['punch', 'left']]);
  assert.ok(moves.every(({ small }) => small));
  assert.equal(landed(events).length, 4);
  const total = RULES.maxHp - fight.npc.hp;
  assert.ok(total < 15, `four small hits took ${total}`);
  assert.equal(coach.call.name, 'clap', 'and what was asked for is still what\'s asked for');
  assert.equal(fight.player.power, 0, 'and they don\'t fill the power bar');
});

test('small hits have a rest between them, so waving about isn\'t quicker than doing as asked', () => {
  const { coach, events, pass } = coached();
  for (let i = 0; i < 20; i += 1) {
    coach.onMoves([{ move: 'palm', side: 'left', hand: 'open' }]);
    pass(0.1);
  }
  const hits = named(events, 'move').length;
  assert.ok(hits <= 3 + 1, `${hits} in two seconds`);
});

test('a slow arm movement isn\'t a small hit, but it can be the push that was asked for', () => {
  const { coach, events } = coached();
  coach.nextIndex = ORDER.indexOf('push');
  coach.call = null;
  coach.startCall();
  const { side } = coach.call;
  coach.onMoves([{ move: 'palm', side: side === 'left' ? 'right' : 'left', hand: 'open', slow: true }]);
  assert.equal(named(events, 'move').length, 0);
  coach.onMoves([{ move: 'palm', side, hand: 'open', slow: true }]);
  assert.equal(named(events, 'move').length, 1);
  assert.equal(named(events, 'move')[0].small, false);
});

test('small hits can\'t win: they stop doing anything long before the opponent is beaten', () => {
  const { coach, events, fight, pass, reader } = coached({ level: { ...NPC_LEVELS.gentle, every: 1000 } }, {});
  reader.moving = true;
  for (let t = 0; t < 180; t += 0.25) {
    fight.noteActivity(0);
    coach.onMoves([{ move: 'palm', side: 'right', hand: 'open' }]);
    pass(0.25);
    coach.call.trying = 0;
  }
  assert.equal(fight.state, 'fighting');
  assert.ok(fight.npc.hp >= RULES.maxHp - RULES.smallHitsMost - 1e-9, `now ${fight.npc.hp}`);
  assert.ok(landed(events).length > 100);
  assert.ok(lastHit(events).blocked, 'the opponent just blocks them after that');
  assert.ok(named(events, 'small-hits-spent').length > 0);
});

test('a round takes about ten of the moves asked for', () => {
  const { coach, fight, pass } = coached({ rounds: 1, level: { ...MEDIUM, every: 1000 } });
  let moves = 0;
  while (fight.state === 'fighting' && moves < 40) {
    coach.onMoves(whatsAsked(coach));
    moves += 1;
    pass(2.8);
  }
  assert.equal(fight.winner, 'player');
  assert.ok(moves >= 6 && moves <= 12, `${moves} moves`);
});

test('moves on a side have to be on the side asked for', () => {
  const { coach, events } = coached({}, { side: 'right' });
  coach.nextIndex = ORDER.indexOf('handCircle');
  coach.call = null;
  coach.startCall();
  assert.equal(coach.call.side, 'right');
  coach.onMoves([{ move: 'circle', side: 'left' }]);
  assert.equal(named(events, 'move').length, 0);
  assert.equal(named(events, 'nudge').length, 1);
  coach.onMoves([{ move: 'circle', side: 'right' }]);
  assert.equal(named(events, 'move')[0].move, 'whirlwind');
});

test('most moves on a side are on the side being worked on', () => {
  const { coach } = coached({}, { side: 'left' });
  const sides = Array.from({ length: 9 }, () => coach.nextSide());
  assert.equal(sides.filter((side) => side === 'left').length, 6);
  assert.equal(sides.filter((side) => side === 'right').length, 3);
});

test('a push with a fist doesn\'t count: it\'s a small hit, and the child is asked to open their hand', () => {
  const { coach, events } = coached({}, { side: 'right' });
  coach.nextIndex = ORDER.indexOf('push');
  coach.call = null;
  coach.startCall();
  coach.onMoves([{ move: 'punch', side: 'right', hand: 'closed' }]);
  assert.equal(named(events, 'open-your-hand')[0].side, 'right');
  assert.equal(named(events, 'call-done').length, 0);
  assert.equal(named(events, 'move')[0].small, true);
  assert.equal(coach.call.name, 'push');
  coach.onMoves([{ move: 'palm', side: 'right', hand: null, slow: true }]);
  assert.equal(named(events, 'call-done').length, 1, 'a hand that can\'t be read isn\'t held against them');
});

test('jumps are never asked for when a grown-up has turned them off', () => {
  const { coach } = coached({}, { allowJumps: false });
  const asked = new Set(Array.from({ length: 60 }, () => coach.nextExercise()));
  assert.equal(asked.has('jump'), false);
  assert.equal(asked.has('starJump'), false);
  assert.ok(asked.has('squat') && asked.has('clap'));
});

test('a move that\'s too hard today is put aside, so nobody gets stuck on one', () => {
  const { coach, events, reader, pass } = coached({ level: { ...MEDIUM, every: 1000 } });
  const stuck = coach.call.name;
  reader.moving = true;
  pass(RULES.giveUpAfter + 0.1);
  assert.deepEqual(named(events, 'try-another').map(({ name }) => name), [stuck]);
  pass(RULES.afterMove + 0.1);
  assert.notEqual(coach.call.name, stuck);
  assert.equal(new Set(Array.from({ length: ORDER.length - 2 }, () => coach.nextExercise())).has(stuck), false, 'and it isn\'t asked for again');
});

test('if every move has been put aside, they all come back', () => {
  const { coach } = coached();
  for (const name of ORDER) coach.gaveUpOn.add(name);
  assert.ok(ORDER.includes(coach.nextExercise()));
  assert.equal(coach.gaveUpOn.size, 0);
});

test('what counts for a move comes down for a child who is trying', () => {
  const { coach, reader, pass } = coached({ level: { ...MEDIUM, every: 1000 } });
  coach.nextIndex = ORDER.indexOf('squat');
  coach.call = null;
  coach.startCall();
  pass(5.2, () => {
    reader.sink = 0.1;
  });
  assert.ok(reader.personal.squat > 0.07 && reader.personal.squat < 0.1, `now ${reader.personal.squat}`);
});

test('the computer takes its turn while the child is moving, with a warning, and it hits hard', () => {
  const { coach, events, fight, reader, pass } = coached();
  const asked = coach.call.name;
  reader.moving = true;
  pass(MEDIUM.every + 0.1);
  assert.equal(coach.phase, 'defending');
  assert.equal(named(events, 'warning').length, 1);
  assert.equal(named(events, 'defend')[0].kind, 'block');
  assert.ok(fight.npc.warning);
  assert.equal(fight.player.hp, RULES.maxHp, 'nothing has landed yet');

  pass(MEDIUM.warning + 0.6);
  assert.equal(fight.npc.warning, null);
  const hit = lastHit(events);
  assert.equal(hit.attacker, 'npc');
  assert.ok(hit.damage >= RULES.smallHit * 5, `${hit.damage} against a small hit of ${RULES.smallHit}`);

  pass(RULES.afterSwing + 0.2);
  assert.equal(coach.phase, 'asking');
  assert.equal(coach.call.name, asked, 'and back to what was being asked for');
});

test('at every level the computer hits much harder than a small hit, and more at each level', () => {
  const hitAt = (level) => {
    const { fight, events } = setup({ level });
    fight.perform('npc', 'palm');
    run(fight, 0.5);
    return lastHit(events).damage;
  };
  const [gentle, medium, tough] = [NPC_LEVELS.gentle, NPC_LEVELS.medium, NPC_LEVELS.tough].map(hitAt);
  assert.ok(gentle > RULES.smallHit * 3, `gentle ${gentle}`);
  assert.ok(medium > gentle);
  assert.ok(tough > medium);
});

test('hands up when asked stops the hit, and as soon as they\'re up it happens', () => {
  const { coach, events, fight, reader, pass } = coached();
  reader.moving = true;
  pass(MEDIUM.every + 0.1);
  assert.equal(coach.phase, 'defending');
  pass(0.5);
  reader.guard = true;
  pass(0.1);
  assert.equal(named(events, 'defended')[0].kind, 'block');
  reader.guard = false; // They don't have to hold it.
  pass(0.6);
  assert.equal(fight.player.hp, RULES.maxHp);
  assert.equal(lastHit(events).blocked, true);
  pass(RULES.afterSwing);
  assert.equal(fight.player.guard, false);
});

test('leaning when asked gets out of the way, and leaning when not asked doesn\'t', () => {
  const asked = coached();
  asked.coach.defences = 1; // Medium takes turns: a block and then a lean.
  asked.reader.moving = true;
  asked.pass(MEDIUM.every + 0.1);
  assert.equal(named(asked.events, 'defend')[0].kind, 'lean');
  asked.reader.dodge = 0.8;
  asked.pass(0.7);
  assert.equal(asked.fight.player.hp, RULES.maxHp);
  assert.equal(named(asked.events, 'dodged').length, 1);

  const other = coached();
  other.reader.moving = true;
  other.pass(MEDIUM.every + 0.1);
  assert.equal(named(other.events, 'defend')[0].kind, 'block');
  other.reader.dodge = 0.8;
  other.pass(MEDIUM.warning + 0.6);
  assert.ok(other.fight.player.hp < RULES.maxHp);
});

test('a child who stands still is left alone, however long they rest, even at the toughest', () => {
  const { coach, events, fight, pass } = coached({ level: NPC_LEVELS.tough });
  pass(300);
  assert.equal(fight.player.hp, RULES.maxHp);
  assert.equal(named(events, 'move').length, 0);
  assert.equal(coach.phase, 'asking');
  assert.ok(fight.resting);
});

test('a child warned who then stops moving isn\'t hit, and gets the whole warning again', () => {
  const { coach, events, fight, reader, pass } = coached({ level: NPC_LEVELS.medium });
  reader.moving = true;
  pass(NPC_LEVELS.medium.every + 0.1);
  assert.equal(coach.phase, 'defending');
  reader.moving = false;
  pass(30);
  assert.equal(fight.player.hp, RULES.maxHp);
  assert.equal(coach.phase, 'defending');
  assert.ok(named(events, 'resting').length >= 1);
  reader.moving = true;
  pass(NPC_LEVELS.medium.warning - 0.5);
  assert.equal(fight.player.hp, RULES.maxHp, 'there\'s time again');
  pass(1.2);
  assert.ok(fight.player.hp < RULES.maxHp);
});

test('waving arms about while the computer hits back is a losing game above the gentlest level', () => {
  const { coach, fight, reader, pass } = coached({ rounds: 1, level: NPC_LEVELS.medium });
  reader.moving = true;
  for (let t = 0; t < 400 && fight.state === 'fighting'; t += 0.25) {
    coach.onMoves([{ move: 'palm', side: 'right', hand: 'open' }]);
    pass(0.25);
    if (coach.call) coach.call.trying = 0;
  }
  assert.equal(fight.winner, 'npc');
  assert.ok(fight.npc.hp > 50, `the computer still has ${fight.npc.hp}`);
});

test('doing what\'s asked beats the computer, even without blocking, on the medium level', () => {
  const { coach, fight, reader, pass } = coached({ rounds: 1, level: NPC_LEVELS.medium });
  reader.moving = true;
  for (let t = 0; t < 400 && fight.state === 'fighting'; t += 0.5) {
    if (coach.phase === 'asking') coach.onMoves(whatsAsked(coach));
    pass(0.5);
  }
  assert.equal(fight.winner, 'player');
  assert.ok(fight.player.hp > 0);
});

test('a move with the hand seen open does more, and an unreadable hand gets no bonus', () => {
  const open = damageOf('palm', { side: 'left', hand: 'open' });
  assert.equal(damageOf('palm', { side: 'left', hand: null }), MOVES.palm.damage);
  assert.ok(open > MOVES.palm.damage * 1.3);
});

test('moves on the side being worked on do more', () => {
  const focus = damageOf('kick', { side: 'left' }, { focusSide: 'left' });
  const otherSide = damageOf('kick', { side: 'right' }, { focusSide: 'left' });
  assert.ok(focus > otherSide);
});

test('the moves asked for, one after the other, can be a combo', () => {
  for (const { steps, name } of COMBOS) {
    const { fight, events } = setup();
    for (const step of steps) {
      fight.perform('player', EXERCISES[step].move, { exercise: step });
      run(fight, 0.8);
    }
    assert.ok(events.some((event) => event.type === 'combo' && event.name === name), name);
    // They come one after the other on the list too, or they'd never happen.
    assert.equal(ORDER.indexOf(steps[1]), ORDER.indexOf(steps[0]) + 1, name);
  }
});

test('a combo needs its steps close enough together', () => {
  const { fight, events } = setup();
  fight.perform('player', 'stomp', { exercise: 'squat' });
  run(fight, 16);
  fight.perform('player', 'flying', { exercise: 'jump' });
  run(fight, 0.6);
  assert.equal(events.some(({ type }) => type === 'combo'), false);
});

test('sky charge does no damage itself and powers up the next move, however long that takes', () => {
  const { fight, events } = setup();
  fight.perform('player', 'skyCharge', { exercise: 'skyReach' });
  run(fight, 20);
  assert.equal(landed(events).length, 0);
  fight.perform('player', 'kick', { side: 'left', exercise: 'kick' });
  run(fight, 0.5);
  assert.ok(lastHit(events).reasons.includes('charged'));
  fight.perform('player', 'kick', { side: 'left', exercise: 'kick' });
  run(fight, 0.5);
  assert.equal(lastHit(events).reasons.includes('charged'), false, 'once only');
});

test('a small hit doesn\'t use up a charge or a full power bar', () => {
  const { fight, events } = setup();
  fight.player.power = 100;
  fight.player.charged = true;
  fight.perform('player', 'palm', { side: 'left', hand: 'open', small: true });
  run(fight, 0.4);
  assert.equal(lastHit(events).signature, false);
  assert.equal(fight.player.charged, true);
  assert.equal(fight.player.power, 100);
});

test('a full power bar turns the next big move into the fighter\'s own', () => {
  const { fight, events } = setup();
  fight.player.power = 100;
  fight.perform('player', 'stomp', { exercise: 'squat' });
  run(fight, 0.6);
  assert.equal(lastHit(events).signature, true);
  assert.ok(fight.player.power <= RULES.powerPerExercise + RULES.powerPerHit);
  assert.equal(fight.stats.signatures, 1);
});

test('the numbers for grown-ups count each side, each exercise and each kind of hand', () => {
  const { fight } = setup();
  fight.perform('player', 'palm', { side: 'left', hand: 'open', exercise: 'push' });
  fight.perform('player', 'punch', { side: 'right', hand: 'closed', small: true });
  fight.perform('player', 'palm', { side: 'right', hand: null, small: true });
  fight.perform('player', 'whirlwind', { side: 'left', hand: 'open', exercise: 'handCircle' });
  fight.perform('player', 'kick', { side: 'left', small: true });
  fight.perform('player', 'stomp', { exercise: 'squat' });
  fight.perform('player', 'flying', { exercise: 'jump' });
  const { strikes, kicks, hands, exercises } = fight.stats;
  assert.deepEqual(strikes, { left: 2, right: 2 });
  assert.deepEqual(kicks, { left: 1, right: 0 });
  assert.deepEqual(hands, { open: 2, closed: 1, unknown: 1 });
  assert.equal(exercises.squat, 1);
  assert.equal(exercises.jump, 1);
  assert.equal(exercises.handCircle, 1);
});

test('blocking stops all of a hit, and leaning avoids it', () => {
  const hitWith = (prepare) => {
    const { fight, events } = setup();
    prepare(fight);
    fight.perform('npc', 'kick');
    run(fight, 0.5);
    return { lost: RULES.maxHp - fight.player.hp, events };
  };
  assert.ok(hitWith(() => {}).lost > 0);
  assert.equal(hitWith((fight) => fight.setGuard('player', true)).lost, 0);
  const leaned = hitWith((fight) => fight.setDodge('player', 1));
  assert.equal(leaned.lost, 0);
  assert.ok(leaned.events.some(({ type }) => type === 'dodged'));
});

test('on the gentle level the computer can\'t knock a child out', () => {
  const { fight } = setup({ level: NPC_LEVELS.gentle });
  for (let i = 0; i < 200; i += 1) {
    fight.perform('npc', 'flying');
    run(fight, 0.6);
  }
  assert.equal(fight.state, 'fighting');
  assert.equal(fight.player.hp, NPC_LEVELS.gentle.mercy);
});

test('on the higher levels a fight can be lost', () => {
  const { fight, events } = setup({ level: NPC_LEVELS.medium, rounds: 1 });
  while (fight.state === 'fighting') {
    fight.perform('npc', 'flying');
    run(fight, 0.6);
  }
  assert.equal(fight.winner, 'npc');
  assert.ok(events.some(({ type, winner }) => type === 'fight-end' && winner === 'npc'));
});

test('knocking the computer out wins the round, and the fight takes two of three', () => {
  const { fight, events } = setup({ rounds: 3 });
  const knockOut = () => {
    while (fight.state === 'fighting') {
      fight.perform('player', 'stomp', { exercise: 'squat' });
      run(fight, 0.5);
    }
  };
  knockOut();
  assert.equal(fight.state, 'break');
  assert.equal(fight.npc.hp, 0);
  run(fight, 1);
  fight.beginRound();
  assert.equal(fight.npc.hp, RULES.maxHp);
  assert.equal(fight.round, 2);
  knockOut();
  assert.equal(fight.state, 'over');
  assert.equal(fight.winner, 'player');
  assert.equal(events.filter(({ type }) => type === 'round-end').length, 2);
});

test('small hits can do their bit again in a new round', () => {
  const { fight } = setup({ rounds: 3 });
  fight.player.smallHitsDealt = RULES.smallHitsMost;
  fight.npc.hp = 1;
  fight.perform('player', 'stomp', { exercise: 'squat' });
  run(fight, 0.5);
  fight.beginRound();
  assert.equal(fight.player.smallHitsDealt, 0);
});

test('health never goes below nothing, and nothing happens after the fight', () => {
  const { fight, events } = setup({ rounds: 1 });
  fight.npc.hp = 1;
  fight.perform('player', 'starBurst', { exercise: 'starJump' });
  run(fight, 0.6);
  assert.equal(fight.npc.hp, 0);
  assert.equal(fight.state, 'over');
  const count = events.length;
  assert.equal(fight.perform('player', 'palm', { side: 'left' }), null);
  run(fight, 2);
  assert.equal(events.length, count);
});

test('everything Mighty Moves says has a voice file, in English and in Georgian', () => {
  const lines = JSON.parse(readFileSync(new URL('../../games/mighty-moves/audio/voice/lines.json', import.meta.url)));
  const shared = JSON.parse(readFileSync(new URL('../../core/body/voice/lines.json', import.meta.url)));
  const core = JSON.parse(readFileSync(new URL('../../core/audio/voice/lines.json', import.meta.url)));
  const known = new Set([...lines, ...shared, ...core].map(({ text }) => text));
  for (const { id, ka } of lines) {
    assert.ok(ka, `${id} has no Georgian`);
    for (const language of ['en', 'ka']) {
      assert.ok(existsSync(new URL(`../../games/mighty-moves/audio/voice/${language}/${id}.ogg`, import.meta.url)), `${language}/${id}.ogg is missing`);
    }
  }

  const source = ['../../games/mighty-moves/main.js', '../../core/body/game.js']
    .map((file) => readFileSync(new URL(file, import.meta.url), 'utf8'))
    .join('\n');
  const asked = new Set();
  for (const block of source.matchAll(/const (?:SAY|ROUND_WORDS|BODY_SAY) = \{([\s\S]+?)\n?\};/g)) {
    for (const [, text] of block[1].matchAll(/'([^']+)'/g)) asked.add(text);
  }
  for (const { ask } of Object.values(EXERCISES)) {
    for (const text of typeof ask === 'string' ? [ask] : Object.values(ask)) asked.add(text);
  }
  for (const { ask } of Object.values(DEFENCES)) asked.add(ask);
  for (const { name } of Object.values(MOVES)) if (name) asked.add(`${name}!`);
  for (const { name } of COMBOS) asked.add(`${name}!`);
  for (const { signature } of ROSTER) asked.add(`${signature}!`);
  assert.ok(asked.size > 50, `only found ${asked.size} lines`);
  assert.deepEqual([...asked].filter((text) => !known.has(text)), []);
  // Nothing rendered that the game can no longer say.
  const gameLines = lines.map(({ text }) => text);
  assert.deepEqual(gameLines.filter((text) => !asked.has(text)), []);
});

test('there\'s a film of every move, which never leaves a limb past where it can reach', () => {
  for (const [name, { frames }] of Object.entries(DEMOS)) {
    assert.ok(frames.length >= 2, name);
    frames.forEach(([t], index) => {
      if (index) assert.ok(t > frames[index - 1][0], `${name} goes forwards in time`);
    });
    assert.ok(frames.at(-1)[0] >= 0.8, `${name} is slow enough to follow`);
    for (const [, pose] of frames) {
      for (const value of Object.values(pose)) assert.ok(Number.isFinite(value), name);
    }
  }
});

/* ---------- levels ---------- */

const LEVELS = Array.from({ length: 10 }, (_, index) => index + 1);
const seeded = (seed = 1) => {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
};
const atLevel = (levelNumber, options = {}, coachOptions = {}) => coached({ levelNumber, ...options }, { random: seeded(3), ...coachOptions });

test('level 1 is the fight as it always was, at every strength', () => {
  for (const strength of Object.values(NPC_LEVELS)) {
    assert.deepEqual(fightLevel(1, strength), { turnEvery: 1, warning: 1, hits: 1, afterMove: RULES.afterMove, defences: [], npcMoves: [], doubles: 0, mixed: false, twice: 0, prizes: [], powerUps: [], theme: 'day', champion: false });
  }
  for (const strength of Object.values(NPC_LEVELS)) {
    const { coach, fight } = coached({ level: strength });
    assert.equal(fight.levelNumber, 1);
    for (const field of ['every', 'warning', 'defences', 'moves', 'damage', 'mercy']) assert.deepEqual(coach.level[field], strength[field], `${strength.name} ${field}`);
  }
  // The same order every time round, and everything asked for once.
  const { coach } = coached();
  coach.nextIndex = 0;
  assert.deepEqual(Array.from({ length: ORDER.length * 2 }, () => coach.nextExercise()), [...ORDER, ...ORDER]);
  assert.ok(Array.from({ length: 30 }, () => (coach.startCall(), coach.call.times)).every((times) => times === 1));
});

test('level 1 fights go exactly as they did before there were levels', () => {
  // A scripted child doing what's asked every 2.4 seconds and blocking now and then, at each strength,
  // gave exactly these with the code from before levels: the winner, the time, and what happened.
  const expected = ['player 36.82 72 692', 'player 39.22 77 725', 'player 39.22 77 730'];
  Object.values(NPC_LEVELS).forEach((strength, index) => {
    const happened = [];
    const fight = new Fight({ rounds: 3, level: strength, onEvent: (event) => happened.push(event.type + (event.name ?? event.kind ?? '')) });
    const reader = fakeReader({ moving: true });
    const coach = new Coach({ fight, reader });
    let t = 0;
    while (fight.state !== 'over' && t < 900) {
      fight.beginRound();
      coach.beginRound();
      let frame = 0;
      while (fight.state === 'fighting' && t < 900) {
        t += 0.02;
        frame += 1;
        if (coach.phase === 'asking' && frame % 120 === 0) coach.onMoves(whatsAsked(coach));
        reader.guard = coach.phase === 'defending' && frame % 3 === 0 && coach.defence.kind === 'block';
        fight.noteActivity(0.02);
        coach.update(0.02);
        fight.update(0.02);
      }
    }
    assert.equal(`${fight.winner} ${t.toFixed(2)} ${happened.length} ${happened.join('|').length}`, expected[index], strength.name);
  });
});

test('each level is the same as the one before or harder, in every way, and always harder in something', () => {
  for (const level of LEVELS.slice(1)) {
    const before = fightLevel(level - 1);
    const now = fightLevel(level);
    assert.ok(now.turnEvery <= before.turnEvery && now.warning <= before.warning && now.afterMove <= before.afterMove, `${level}: pace`);
    assert.ok(before.defences.every((kind) => now.defences.includes(kind)) && before.npcMoves.every((move) => now.npcMoves.includes(move)), `${level}: nothing taken away`);
    assert.ok(now.doubles >= before.doubles && now.twice >= before.twice && (now.mixed || !before.mixed), `${level}: new things stay`);
    assert.ok(before.prizes.every((kind) => now.prizes.includes(kind)) && before.powerUps.every((kind) => now.powerUps.includes(kind)), `${level}: prizes and power-ups stay`);
    const harder = [now.turnEvery < before.turnEvery, now.warning < before.warning, now.defences.length > before.defences.length, now.npcMoves.length > before.npcMoves.length, now.doubles > before.doubles, now.mixed && !before.mixed, now.twice > before.twice];
    assert.ok(harder.some(Boolean), `${level}: something is harder`);
  }
  // New kinds of things to get out of the way of, and more of what the computer does.
  assert.deepEqual([3, 4, 5, 6, 7, 8].map((level) => {
    const now = fightLevel(level);
    return [now.defences.join(), now.npcMoves.length, now.doubles > 0, now.mixed, now.twice > 0];
  }), [['lean', 0, false, false, false], ['lean', 2, false, false, false], ['lean', 2, true, false, false], ['lean,duck', 2, true, true, false], ['lean,duck', 5, true, true, true], ['lean,duck,catch', 5, true, true, true]]);
});

test('every level from 2 to 10 brings something new, and level 1 nothing', () => {
  assert.deepEqual(newThingsAt(1), []);
  for (const level of LEVELS.slice(1)) {
    const news = newThingsAt(level);
    assert.ok(news.length >= 1 && news.length <= 3, `${level}: ${news.length} new things`);
    for (const { id, mark, name, nameKa } of news) {
      assert.ok(mark && name && nameKa, `${level}: ${id} has a picture and both names`);
      assert.ok(name.split(' ').length <= 3, `${id}: a short name`);
      assert.match(nameKa, /[\u10A0-\u10FF]/, `${id}: Georgian`);
      // Really switched on from that level, and not before.
      assert.equal(levelHas(level, id), true, `${id} is on at level ${level}`);
      assert.equal(levelHas(level - 1, id), false, `${id} isn't on at level ${level - 1}`);
      // And it stays on, apart from the places, which each give way to the next.
      if (!['sunset', 'autumn'].includes(id)) for (let later = level; later <= 10; later += 1) assert.equal(levelHas(later, id), true, `${id} stays on at ${later}`);
    }
  }
  // Every thing listed arrives once, and every one there is arrives somewhere.
  const listed = Object.values(ARRIVES).flat();
  assert.deepEqual([...listed].sort(), Object.keys(NEW_THINGS).sort());
  for (const level of LEVELS) for (const id of Object.keys(NEW_THINGS)) if (!listed.includes(id)) assert.fail(id);
});

test('prizes: a coin for each big move that lands, a gem for each way out, a medal for each round, and a trophy for the champion', () => {
  const prizes = (fight) => ({ ...fight.stats.prizes });
  // Not at level 1, where the fight is as it always was.
  const first = setup({ levelNumber: 1 });
  first.fight.perform('player', 'stomp', { exercise: 'squat' });
  run(first.fight, 1);
  assert.deepEqual(prizes(first.fight), { coin: 0, gem: 0, medal: 0, trophy: 0 });
  assert.equal(named(first.events, 'prize').length, 0);

  // Level 2: coins only, by themselves, and none for a small hit.
  const two = setup({ levelNumber: 2 });
  two.fight.perform('player', 'stomp', { exercise: 'squat' });
  two.fight.perform('player', 'punch', { small: true });
  run(two.fight, 1);
  assert.deepEqual(prizes(two.fight), { coin: 1, gem: 0, medal: 0, trophy: 0 });
  assert.deepEqual(named(two.events, 'prize').map(({ kind, total }) => [kind, total]), [['coin', 1]]);
  two.fight.setGuard('player', true);
  two.fight.perform('npc', 'kick');
  run(two.fight, 1);
  assert.equal(two.fight.stats.prizes.gem, 0, 'no gems yet at level 2');

  // Level 3: a gem for a block and for a lean, none for a hit that lands.
  const three = setup({ levelNumber: 3 });
  three.fight.setGuard('player', true);
  three.fight.perform('npc', 'kick');
  run(three.fight, 1);
  three.fight.setGuard('player', false);
  three.fight.setDodge('player', 1);
  three.fight.perform('npc', 'kick');
  run(three.fight, 1);
  three.fight.setDodge('player', 0);
  three.fight.perform('npc', 'kick');
  run(three.fight, 1);
  assert.equal(three.fight.stats.prizes.gem, 2);

  // The fighter's own move is worth three coins.
  const signature = setup({ levelNumber: 2 });
  signature.fight.player.power = 100;
  signature.fight.perform('player', 'stomp', { exercise: 'squat' });
  run(signature.fight, 1);
  assert.equal(signature.fight.stats.prizes.coin, 3);

  // Level 5: a medal for a round won. Level 10: the champion's trophy for the fight.
  for (const [levelNumber, medal, trophy] of [[4, 0, 0], [5, 1, 0], [10, 1, 1]]) {
    const { fight } = setup({ levelNumber, rounds: 1 });
    fight.npc.hp = 5;
    fight.perform('player', 'stomp', { exercise: 'squat' });
    run(fight, 1);
    assert.equal(fight.winner, 'player');
    assert.equal(fight.stats.prizes.medal, medal, `level ${levelNumber} medal`);
    assert.equal(fight.stats.prizes.trophy, trophy, `level ${levelNumber} trophy`);
  }
  // Losing a round gives no medal, and costs nothing that was collected.
  const lost = setup({ levelNumber: 5, rounds: 1 });
  lost.fight.perform('player', 'stomp', { exercise: 'squat' });
  run(lost.fight, 1);
  lost.fight.player.hp = 1;
  lost.fight.perform('npc', 'kick');
  run(lost.fight, 1);
  assert.equal(lost.fight.winner, 'npc');
  assert.deepEqual(prizes(lost.fight), { coin: 1, gem: 0, medal: 0, trophy: 0 });
  assert.equal(Object.keys(PRIZES).length, 4);
});

/** Lands big moves one after the other, and says what came of them. */
function landBigMoves(fight, count) {
  for (let i = 0; i < count; i += 1) {
    fight.npc.hp = RULES.maxHp; // So the round goes on.
    fight.perform('player', 'thunderClap', { exercise: 'clap' });
    run(fight, 0.5);
  }
}

test('power-ups come after every few big moves, each kind in turn, from level 4', () => {
  const none = setup({ levelNumber: 3 });
  landBigMoves(none.fight, 6);
  assert.equal(named(none.events, 'power-up').length, 0);

  const four = setup({ levelNumber: 4 });
  landBigMoves(four.fight, RULES.powerUpEvery - 1);
  assert.equal(named(four.events, 'power-up').length, 0);
  landBigMoves(four.fight, 1);
  assert.deepEqual(named(four.events, 'power-up').map(({ kind }) => kind), ['shield']);
  assert.equal(four.fight.player.shield, true);

  // The newest a level has comes first, so a short fight at that level still has it, and then they take turns.
  const nine = setup({ levelNumber: 9 });
  landBigMoves(nine.fight, RULES.powerUpEvery * 4);
  assert.deepEqual(named(nine.events, 'power-up').map(({ kind }) => kind), ['helper', 'shield', 'glow', 'helper']);
  const seven = setup({ levelNumber: 7 });
  landBigMoves(seven.fight, RULES.powerUpEvery);
  assert.deepEqual(named(seven.events, 'power-up').map(({ kind }) => kind), ['glow']);
});

test('the shield bubble catches the computer\'s next hit that would have landed, and then it\'s gone', () => {
  const { fight, events } = setup({ levelNumber: 4 });
  fight.givePowerUp('shield');
  // A block doesn't use it up.
  fight.setGuard('player', true);
  fight.perform('npc', 'kick');
  run(fight, 1);
  assert.equal(fight.player.shield, true);
  fight.setGuard('player', false);
  fight.perform('npc', 'kick');
  run(fight, 1);
  assert.equal(fight.player.hp, RULES.maxHp, 'caught by the bubble');
  assert.equal(fight.player.shield, false);
  assert.equal(lastHit(events).bubble, true);
  fight.perform('npc', 'kick');
  run(fight, 1);
  assert.ok(fight.player.hp < RULES.maxHp, 'and the next one lands');
  // Resting doesn't use it up: it lasts until it's needed.
  const resting = setup({ levelNumber: 4 });
  resting.fight.givePowerUp('shield');
  run(resting.fight, 120);
  assert.equal(resting.fight.player.shield, true);
});

test('a glow makes the next two big moves stronger and fills the power bar faster', () => {
  const plain = damageOf('thunderClap', { exercise: 'clap' }, { levelNumber: 7 });
  const { fight, events } = setup({ levelNumber: 7 });
  fight.givePowerUp('glow');
  const hits = [];
  for (let i = 0; i < 3; i += 1) {
    fight.perform('player', 'thunderClap', { exercise: 'clap' });
    run(fight, 0.5);
    hits.push(lastHit(events).damage);
  }
  assert.deepEqual(hits.map((damage) => Math.round(damage * 100) / 100), [plain * RULES.glow, plain * RULES.glow, plain].map((damage) => Math.round(damage * 100) / 100));
  assert.equal(fight.player.glow, 0);
  // Two glowing moves filled twice as much power as plain ones would, plus what the hits added.
  assert.equal(fight.player.power, RULES.powerPerExercise * 2 * 2 + RULES.powerPerExercise + RULES.powerPerHit * 3);
  // A small hit doesn't use a glow up.
  const small = setup({ levelNumber: 7 });
  small.fight.givePowerUp('glow');
  small.fight.perform('player', 'punch', { small: true });
  run(small.fight, 1);
  assert.equal(small.fight.player.glow, RULES.glowMoves);
});

test('a helper friend joins in for one big move, which is a team move worth three coins', () => {
  const plain = damageOf('stomp', { exercise: 'squat' }, { levelNumber: 9 });
  const { fight, events } = setup({ levelNumber: 9 });
  fight.givePowerUp('helper');
  fight.perform('player', 'skyCharge', { exercise: 'skyReach' });
  run(fight, 1);
  assert.equal(fight.player.helper, true, 'reaching up does no damage, so the friend waits');
  fight.player.charged = false;
  fight.perform('player', 'stomp', { exercise: 'squat' });
  run(fight, 1);
  assert.equal(named(events, 'team').length, 1);
  assert.equal(lastHit(events).damage, plain * RULES.team);
  assert.equal(fight.player.helper, false);
  assert.equal(fight.stats.prizes.coin, 3);
});

test('from level 6 the computer swings high, and squatting ducks under it, earning a gem', () => {
  const { coach, events, fight, reader, pass } = atLevel(6, { level: { ...MEDIUM, every: 2 } }, { random: () => 0.99 });
  reader.moving = true;
  // Ducking is what this level brings, so it's the computer's first turn.
  pass(2.1);
  assert.equal(coach.phase, 'defending');
  assert.equal(coach.defence.kind, 'duck');
  assert.equal(coach.defence.move, 'highSwing');
  assert.equal(named(events, 'defend').at(-1).kind, 'duck');
  // Hands up isn't ducking.
  reader.guard = true;
  pass(0.3);
  assert.equal(coach.defence.done, false);
  reader.guard = false;
  coach.onMoves([{ move: 'stomp' }]);
  pass(0.1);
  assert.equal(named(events, 'defended').at(-1).kind, 'duck');
  assert.equal(fight.player.duck, true);
  pass(1.5);
  assert.equal(fight.player.hp, RULES.maxHp, 'ducked under it');
  assert.equal(named(events, 'dodged').at(-1).duck, true);
  assert.equal(fight.stats.prizes.gem, 1);
  assert.equal(fight.player.duck, false, 'and up again after');
  // Being down in a squat counts too, as it does for the squat that's asked for.
  const held = atLevel(6, { level: { ...MEDIUM, every: 2 } });
  held.reader.moving = true;
  held.pass(2.1);
  held.reader.squatting = true;
  held.pass(0.1);
  assert.equal(held.coach.defence?.done ?? named(held.events, 'defended').length > 0, true);
});

test('from level 8 the computer throws a soft ball, and a clap catches it and throws it back', () => {
  const { coach, events, fight, reader, pass } = atLevel(8, { level: { ...MEDIUM, every: 2 } }, { random: () => 0.99 });
  reader.moving = true;
  // Catching is what this level brings, so it's the computer's first turn.
  pass(2.1);
  assert.equal(coach.defence.kind, 'catch');
  assert.equal(coach.defence.move, 'ball');
  // Leaning isn't catching.
  reader.dodge = 0.9;
  pass(0.3);
  assert.equal(coach.defence.done, false);
  reader.dodge = 0;
  coach.onMoves([{ move: 'clap' }]);
  pass(0.1);
  assert.equal(named(events, 'defended').at(-1).kind, 'catch');
  pass(1.5);
  assert.equal(named(events, 'caught').length, 1);
  assert.equal(fight.player.hp, RULES.maxHp, 'caught, so nothing hit the child');
  assert.ok(named(events, 'move').some(({ who, move }) => who === 'player' && move === 'ballReturn'), 'thrown back');
  assert.equal(fight.npc.hp, RULES.maxHp - MOVES.ballReturn.damage);
  assert.equal(fight.stats.prizes.gem, 1);
  assert.ok(fight.stats.prizes.coin >= 1);
});

test('a duck or a catch that\'s missed is put aside for the rest of the fight, and neither hits harder than the lightest move', () => {
  const { coach, fight, reader, pass } = atLevel(8, { level: { ...MEDIUM, every: 2 } }, { random: () => 0.99 });
  reader.moving = true;
  coach.defences = 3; // Catch, block, lean, then duck.
  pass(2.1);
  assert.equal(coach.defence.kind, 'duck');
  pass(coach.level.warning + 1.5);
  assert.ok(fight.player.hp < RULES.maxHp, 'missed');
  assert.deepEqual([...coach.putAside], ['duck']);
  for (let i = 0; i < 8; i += 1) {
    pass(2.2);
    if (coach.phase === 'defending') {
      assert.notEqual(coach.defence.kind, 'duck');
      if (coach.defence.kind === 'block') reader.guard = true;
      if (coach.defence.kind === 'lean') reader.dodge = 0.9;
      if (coach.defence.kind === 'catch') coach.onMoves([{ move: 'clap' }]);
      pass(1.5);
      reader.guard = false;
      reader.dodge = 0;
    }
  }
  for (const move of ['highSwing', 'ball']) assert.ok(MOVES[move].damage <= MOVES.palm.damage, move);
  // Block and lean are never put aside.
  assert.ok(!coach.putAside.has('block') && !coach.putAside.has('lean'));
});

test('the champion, at level 10, picks any way out for its turns, so they can\'t be guessed', () => {
  const picks = new Set();
  for (let seed = 1; seed < 40; seed += 1) {
    const { coach, reader, pass } = atLevel(10, { level: { ...MEDIUM, every: 2 } }, { random: seeded(seed) });
    reader.moving = true;
    pass(2.1);
    if (coach.defence) picks.add(coach.defence.kind);
  }
  assert.deepEqual([...picks].sort(), ['block', 'catch', 'duck', 'lean']);
  // Below level 10 they still take turns.
  const nine = atLevel(9, { level: { ...MEDIUM, every: 2 } });
  nine.reader.moving = true;
  nine.pass(2.1);
  assert.equal(nine.coach.defence.kind, 'block');
});

test('on the higher levels the computer comes more often and with more moves, but never takes away its warning', () => {
  for (const strength of Object.values(NPC_LEVELS)) {
    const { coach, fight } = atLevel(10, { level: strength });
    // On Gentle, the game as it was, at least 80% of the warning at level 10, and on Medium and Tough 60%.
    const least = strength.mercy ? 0.8 : 0.6;
    assert.ok(coach.level.warning >= strength.warning * least - 1e-9, `${strength.name}: ${coach.level.warning} seconds of warning`);
    // On Medium and Tough it hits harder as the levels go up, and on Gentle never.
    assert.equal(fight.levelRules.hits, strength.mercy ? 1 : 1.4, `${strength.name}: how much harder it hits at level 10`);
    assert.ok(coach.level.every < strength.every);
    assert.deepEqual(new Set(coach.level.defences), new Set(['block', 'lean', 'duck', 'catch']));
    assert.ok(coach.level.moves.length > strength.moves.length || strength.moves.length >= 7);
    assert.equal(coach.level.damage, strength.damage, 'how hard it hits is still the grown-ups\' choice');
    assert.equal(coach.level.mercy, strength.mercy);
  }
  // Leaning comes in on Gentle at level 3.
  const gentle = atLevel(3, { level: NPC_LEVELS.gentle });
  assert.deepEqual(gentle.coach.level.defences, ['block', 'lean']);
});

test('from level 5 a turn can be two hits, one to block and one to lean from, each with its whole warning', () => {
  const { coach, events, fight, reader, pass } = atLevel(10, { level: NPC_LEVELS.medium }, { random: () => 0 });
  reader.moving = true;
  pass(coach.level.every + 0.1);
  assert.equal(coach.phase, 'defending');
  assert.equal(coach.defence.then, 'lean');
  reader.guard = true;
  pass(0.1);
  reader.guard = false;
  let secondFrom = null;
  pass(RULES.swingAfterDefence + 0.4 + RULES.afterSwing + 0.2, () => {
    if (coach.defence?.second && secondFrom === null) secondFrom = coach.defence.left;
  });
  assert.equal(coach.phase, 'defending', 'straight into the second');
  assert.equal(coach.defence.kind, 'lean');
  assert.equal(coach.defence.second, true);
  assert.equal(secondFrom, coach.level.warning, 'with its whole warning');
  reader.dodge = 0.8;
  pass(1);
  reader.dodge = 0;
  pass(1.5);
  assert.equal(fight.player.hp, RULES.maxHp, 'both got out of the way of');
  assert.deepEqual(named(events, 'defended').map(({ kind }) => kind), ['block', 'lean']);
  assert.equal(coach.phase, 'asking', 'and back to what was being asked for');
});

test('from level 6 the moves come in a mixed-up order, all of them each time round, with combos together', () => {
  const { coach } = atLevel(6);
  coach.queue = [];
  const rounds = Array.from({ length: 4 }, () => Array.from({ length: ORDER.length }, () => coach.nextExercise()));
  for (const round of rounds) {
    assert.deepEqual([...round].sort(), [...ORDER].sort());
    for (const { steps } of COMBOS) assert.equal(round.indexOf(steps[1]), round.indexOf(steps[0]) + 1, steps.join(' then '));
  }
  assert.ok(rounds.some((round) => round.join() !== ORDER.join()), 'and not the same as the list');
  const noJumps = atLevel(10, {}, { allowJumps: false });
  const asked = Array.from({ length: 40 }, () => noJumps.coach.nextExercise());
  assert.ok(!asked.includes('jump') && !asked.includes('starJump'), 'and jumps that are off stay off');
});

test('from level 7 some moves are asked for twice, and only the second makes the big move', () => {
  const { coach, events, pass } = atLevel(10, { level: { ...MEDIUM, every: 1000 } }, { random: () => 0 });
  coach.nextIndex = 0;
  coach.queue = ['squat'];
  coach.call = null;
  coach.startCall();
  assert.equal(coach.call.times, 2);
  assert.equal(named(events, 'call').at(-1).times, 2);
  coach.onMoves(whatsAsked(coach));
  assert.equal(named(events, 'rep').length, 1);
  assert.equal(named(events, 'move').length, 0, 'not yet');
  coach.onMoves(whatsAsked(coach));
  assert.equal(named(events, 'move').length, 0, 'the same moment can\'t count twice');
  pass(0.6);
  coach.onMoves(whatsAsked(coach));
  assert.equal(named(events, 'move').length, 1);
  assert.equal(named(events, 'call-done').length, 1);
  // Jumps, high knees and reaching up are never asked for twice.
  for (const name of ['jump', 'starJump', 'highKnees', 'skyReach']) {
    assert.equal(CAN_BE_TWICE.has(name), false, name);
    coach.queue = [name];
    coach.call = null;
    coach.startCall();
    assert.equal(coach.call.times, 1, name);
  }
});

test('at level 10 a child standing still is still left alone, and Gentle still can\'t knock a child out', () => {
  const resting = atLevel(10, { level: NPC_LEVELS.tough });
  resting.pass(300);
  assert.equal(resting.fight.player.hp, RULES.maxHp);
  assert.equal(named(resting.events, 'move').length, 0);

  const { coach, fight, reader, pass } = atLevel(10, { level: NPC_LEVELS.gentle, rounds: 1 });
  reader.moving = true;
  pass(400, () => {
    if (coach.call) coach.call.trying = 0;
  });
  assert.equal(fight.state, 'fighting');
  assert.equal(fight.player.hp, NPC_LEVELS.gentle.mercy);
});

/**
 * A child doing what's asked: react seconds after each thing is asked for, and defend seconds after
 * each warning. Plays a whole fight, and says how long it took and how many moves it asked for.
 */
function playFight({ levelNumber, strength = NPC_LEVELS.gentle, rounds = 3, seed = 1, react = 2.5, defend = 1.2, onEvent = () => {} }) {
  const fight = new Fight({ rounds, level: strength, levelNumber, onEvent });
  const reader = fakeReader({ moving: true });
  const coach = new Coach({ fight, reader, random: seeded(seed) });
  let seconds = 0;
  let moves = 0;
  while (fight.state !== 'over' && seconds < 2000) {
    fight.beginRound();
    coach.beginRound();
    let askedFor = null;
    let askedAt = 0;
    let warned = null;
    let warnedAt = 0;
    while (fight.state === 'fighting' && seconds < 2000) {
      seconds += 0.02;
      // A new thing asked for, or the second time of one asked for twice, starts the child's clock.
      if (coach.phase === 'asking' && (coach.call !== askedFor?.call || askedFor.done !== coach.call.done)) {
        askedFor = { call: coach.call, done: coach.call.done };
        askedAt = seconds;
      }
      if (coach.phase === 'asking' && seconds - askedAt >= react) {
        coach.onMoves(whatsAsked(coach));
        moves += 1;
        askedAt = Infinity;
      }
      if (coach.defence !== warned) {
        warned = coach.defence;
        warnedAt = seconds;
        reader.guard = false;
        reader.dodge = 0;
      }
      if (warned && !warned.done && seconds - warnedAt >= defend) {
        reader.guard = warned.kind === 'block';
        reader.dodge = warned.kind === 'lean' ? 0.8 : 0;
        reader.squatting = warned.kind === 'duck';
        if (warned.kind === 'catch') coach.onMoves([{ move: 'clap' }]);
        if (!warned.counted) moves += 1;
        warned.counted = true;
      }
      if (!coach.defence) reader.squatting = false;
      fight.noteActivity(0.02);
      coach.update(0.02);
      fight.update(0.02);
    }
    // The break between rounds, the same at every level.
    seconds += RULES.breakSeconds + 3;
  }
  return { seconds, perMinute: moves / (seconds / 60), winner: fight.winner };
}

test('level 10 is still doable: as long to react, not many more moves a minute, and not much longer', () => {
  for (const strength of Object.values(NPC_LEVELS)) {
    for (const react of [1.5, 3]) {
      const mean = (levelNumber) => {
        const fights = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => playFight({ levelNumber, strength, seed, react }));
        assert.ok(fights.every(({ winner }) => winner === 'player'), `${strength.name} at level ${levelNumber}: doing as the coach says wins`);
        return { seconds: fights.reduce((sum, one) => sum + one.seconds, 0) / fights.length, perMinute: fights.reduce((sum, one) => sum + one.perMinute, 0) / fights.length };
      };
      const first = mean(1);
      const last = mean(10);
      const name = `${strength.name}, ${react} seconds to each move`;
      // Stricter than the limits for every game, of a third longer and twice the moves: big whole-body
      // moves are tiring. With the new things at level 10, it measured at most 1.15 and 1.17.
      assert.ok(last.seconds <= first.seconds * 1.25, `${name}: ${last.seconds} seconds against ${first.seconds}`);
      assert.ok(last.perMinute <= first.perMinute * 1.4, `${name}: ${last.perMinute} moves a minute against ${first.perMinute}`);
    }
  }
});

test('what each level brings comes in a fight at that level, even a one-round fight won quickly', () => {
  // A quick child, a second and a half to each move. The new way out of the way is the computer's first
  // turn, and the newest power-up the first to come.
  const comes = (what, options) => {
    let fights = 0;
    for (let seed = 1; seed <= 8; seed += 1) {
      const seen = new Set();
      playFight({ react: 1.5, seed, ...options, onEvent: ({ type, kind }) => seen.add(`${type}:${kind}`) });
      if (seen.has(what)) fights += 1;
    }
    return fights;
  };
  for (const strength of [NPC_LEVELS.gentle, NPC_LEVELS.medium]) {
    const name = strength.name;
    assert.equal(comes('defend:duck', { levelNumber: 6, strength, rounds: 1 }), 8, `${name}: ducking at level 6`);
    assert.equal(comes('defend:catch', { levelNumber: 8, strength, rounds: 1 }), 8, `${name}: catching at level 8`);
    assert.equal(comes('power-up:helper', { levelNumber: 9, strength }), 8, `${name}: the helper at level 9`);
    assert.equal(comes('power-up:glow', { levelNumber: 7, strength }), 8, `${name}: the glow at level 7`);
    assert.ok(comes('power-up:glow', { levelNumber: 7, strength, rounds: 1 }) >= 7, `${name}: the glow at level 7, in one round`);
  }
  assert.equal(comes('defend:lean', { levelNumber: 3, strength: NPC_LEVELS.gentle, rounds: 1 }), 8, 'leaning at level 3');
});

test('leaning isn\'t new at level 3 on Medium or Tough, which ask for it from level 1', () => {
  const ids = (strength) => newThingsAt(3, strength).map(({ id }) => id);
  assert.deepEqual(ids(NPC_LEVELS.gentle), ['lean', 'gem', 'sunset']);
  assert.deepEqual(ids(NPC_LEVELS.medium), ['gem', 'sunset']);
  assert.deepEqual(ids(NPC_LEVELS.tough), ['gem', 'sunset']);
  // And on those, the computer's first turn at level 3 is a block, as it always was.
  const { coach, reader, pass } = atLevel(3, { level: { ...MEDIUM, every: 2 } });
  reader.moving = true;
  pass(2.1);
  assert.equal(coach.defence.kind, 'block');
});

test('what counts for ducking comes down for a child who\'s trying, over the ducks in a fight', () => {
  // Going down, but not as far as counts, every time the computer swings high. One warning is shorter
  // than it takes for what counts to come down, so it's the ducks in a fight together that do it.
  const { coach, reader, pass } = atLevel(6, { level: NPC_LEVELS.gentle });
  reader.moving = true;
  reader.sink = 0.12;
  assert.ok(coach.level.warning < 5);
  for (let duck = 0; duck < 3 && reader.personal.squat === null; duck += 1) {
    coach.startDefence('duck');
    pass(coach.level.warning + 0.2);
    pass(1.5);
  }
  assert.ok(reader.personal.squat !== null && reader.personal.squat < reader.squatNeeded, `came down to ${reader.personal.squat}`);
  assert.ok(reader.personal.squat > 0.07, 'but never as far as standing still');
});

test('a ball caught at the very last moment is still held a moment before it\'s thrown back', () => {
  const { coach, events, pass } = atLevel(8, { level: { ...MEDIUM, every: 2 } }, { random: () => 0.99 });
  coach.fight.noteActivity(0);
  pass(2.1, () => coach.fight.noteActivity(0.02));
  assert.equal(coach.defence.kind, 'catch');
  pass(coach.defence.left - 0.04, () => coach.fight.noteActivity(0.02));
  coach.onMoves([{ move: 'clap' }]);
  const caughtAt = coach.time;
  let thrownAt = null;
  pass(1.5, () => {
    coach.fight.noteActivity(0.02);
    if (thrownAt === null && named(events, 'caught').length) thrownAt = coach.time;
  });
  assert.ok(thrownAt - caughtAt >= RULES.holdCaughtBall - 0.05, `held for ${thrownAt - caughtAt} seconds`);
});

/** Two fights, one on each friend's computer, passing each other's moves as the server would. */
function friendlyFight(options = {}) {
  const make = () => {
    const events = [];
    const fight = new Fight({ level: { ...NPC_LEVELS.gentle, damage: 1, mercy: 0 }, friend: true, rounds: 1, onEvent: (event) => events.push(event), ...options });
    fight.beginRound();
    return { fight, events };
  };
  const ana = make();
  const ben = make();
  // What each one's fighter does goes to the other, as the friend's fighter's move.
  const pass = (from, to) => {
    for (const { type, who, move, side, small, signature, damage, total } of from.events.splice(0)) {
      if (type === 'move' && who === 'player') to.fight.perform('npc', move, { side, small, signature, damage, total });
    }
  };
  return { ana, ben, pass };
}

test('against a friend, a big move does what it did on the friend\'s computer, and every one lands', () => {
  const { ana, ben, pass } = friendlyFight();
  ana.fight.perform('player', 'stomp', { exercise: 'squat', side: 'right' });
  ana.fight.perform('player', 'palm', { exercise: 'push', hand: 'open', side: 'right' });
  const sent = ana.events.filter(({ type }) => type === 'move').map(({ damage, total }) => ({ damage, total }));
  // The right side is the one being worked on, and an open hand makes a push stronger.
  assert.deepEqual(sent, [{ damage: 16.8, total: 16.8 }, { damage: 15.12, total: 31.92 }]);
  pass(ana, ben);
  // The friend's fighter isn't blocked or leaned away from: there are no computer's turns, and no shield.
  ben.fight.setGuard('player', true);
  run(ana.fight, 1);
  run(ben.fight, 1);
  assert.equal(ana.fight.npc.hp, RULES.maxHp - 31.92);
  assert.equal(ben.fight.player.hp, RULES.maxHp - 31.92, 'the same on both computers');
  assert.equal(ben.events.filter(({ type, attacker }) => type === 'hit' && attacker === 'npc').length, 2);
  assert.ok(!ana.fight.levelRules.champion);
  assert.ok(!ana.fight.levelRules.powerUps.includes('shield'));
});

test('against a friend, there are no gems, as those are for getting out of the way, and no champion\'s trophy', () => {
  const champion = new Fight({ level: MEDIUM, levelNumber: 10, friend: true });
  assert.ok(fightLevel(10).prizes.includes('gem'));
  assert.deepEqual(champion.levelRules.prizes, fightLevel(10).prizes.filter((kind) => kind !== 'gem' && kind !== 'trophy'));
  assert.equal(champion.levelRules.champion, false);
  assert.deepEqual(new Fight({ level: MEDIUM, levelNumber: 10 }).levelRules, fightLevel(10, MEDIUM), 'against the computer, it\'s as it was');
});

test('against a friend, a move missed while the connection was down is made up by the next', () => {
  const { ana, ben, pass } = friendlyFight();
  ana.fight.perform('player', 'stomp', { exercise: 'squat' });
  ana.events.splice(0);
  ana.fight.perform('player', 'flying', { exercise: 'jump' });
  pass(ana, ben);
  run(ana.fight, 1);
  run(ben.fight, 1);
  assert.ok(ana.fight.npc.hp < RULES.maxHp - 14 - 15, 'both moves, the second as a combo');
  assert.equal(ben.fight.player.hp, ana.fight.npc.hp);
});

test('against a friend, small hits still only go so far', () => {
  const { ana } = friendlyFight();
  for (let i = 0; i < 30; i += 1) ana.fight.perform('player', 'punch', { side: 'left', small: true });
  const done = ana.events.filter(({ type }) => type === 'move').map(({ damage }) => damage);
  assert.equal(done.reduce((sum, damage) => sum + damage, 0), RULES.smallHitsMost);
  run(ana.fight, 1);
  assert.equal(ana.fight.npc.hp, RULES.maxHp - RULES.smallHitsMost);
});

test('against a friend, a knockout waits for whose round the server says it is, even when both got there at once', () => {
  const { ana, ben, pass } = friendlyFight({ rounds: 3 });
  for (const each of [ana, ben]) {
    for (let i = 0; i < 7; i += 1) each.fight.perform('player', 'flying', { exercise: 'jump' });
  }
  pass(ana, ben);
  pass(ben, ana);
  run(ana.fight, 1);
  run(ben.fight, 1);
  // Each saw their own fighter knock the other out, and nothing more happens until it's settled.
  for (const each of [ana, ben]) {
    assert.equal(each.fight.state, 'knockout');
    assert.ok(each.events.some(({ type }) => type === 'knockout'));
    assert.equal(each.fight.perform('player', 'stomp', { exercise: 'squat' }), null);
  }
  // Ben's claim got to the server first.
  ana.fight.settleRound('npc');
  ben.fight.settleRound('player');
  assert.deepEqual([ana.fight.player.roundsWon, ana.fight.npc.roundsWon], [0, 1]);
  assert.deepEqual([ben.fight.player.roundsWon, ben.fight.npc.roundsWon], [1, 0]);
  assert.equal(ana.fight.player.hp, 0);
  assert.equal(ana.fight.state, 'break');
  ana.fight.beginRound();
  assert.equal(ana.fight.dealt, 0);
  assert.equal(ana.fight.npc.hp, RULES.maxHp);
});

test('against a friend who has gone, the fight is over, and it\'s the child\'s', () => {
  const { ana } = friendlyFight();
  ana.fight.friendGone();
  assert.equal(ana.fight.state, 'over');
  assert.deepEqual(ana.events.at(-1), { type: 'fight-end', winner: 'player', walkover: true });
  assert.equal(ana.fight.perform('player', 'stomp', { exercise: 'squat' }), null);
});

test('together with a friend, the computer\'s fighter has twice the health, and what\'s left is what both children\'s moves have left it', () => {
  const { fight, events } = setup({ ally: true });
  assert.equal(fight.ally, true);
  assert.equal(fight.npc.hp, RULES.maxHp * TEAM.health);
  fight.perform('player', 'stomp', { exercise: 'squat', side: 'right' });
  run(fight, 1);
  const mine = lastHit(events);
  assert.ok(mine.damage > 0);
  // What goes to the friend's computer: all this child's moves have done this round.
  assert.equal(mine.total, mine.damage);
  assert.equal(fight.npc.hp, RULES.maxHp * 2 - mine.damage);
  // The friend's computer says what theirs have done, and their fighter is seen making the move.
  assert.equal(fight.allyHit('kick', { side: 'left', damage: 12, total: 30 }), true);
  assert.equal(fight.npc.hp, RULES.maxHp * 2 - mine.damage - 30);
  assert.deepEqual(events.at(-1), { type: 'ally-hit', move: 'kick', side: 'left', small: false, signature: false, damage: 12 });
  // One missed while the connection was down is made up by the next, and one that comes late takes nothing back.
  fight.allyHit('palm', { damage: 10, total: 55 });
  assert.equal(fight.npc.hp, RULES.maxHp * 2 - mine.damage - 55);
  fight.allyHit('palm', { damage: 10, total: 40 });
  assert.equal(fight.npc.hp, RULES.maxHp * 2 - mine.damage - 55);
  // Nothing that isn't a move, or a number, is taken.
  assert.equal(fight.allyHit('teleport', { total: 500 }), false);
  assert.equal(fight.allyHit('palm', { total: NaN }), false);
  assert.equal(fight.state, 'fighting');
  // The child's own next move adds to their own total.
  fight.perform('player', 'stomp', { exercise: 'squat', side: 'right' });
  run(fight, 1);
  assert.ok(lastHit(events).total > mine.total);
  assert.equal(fight.npc.hp, RULES.maxHp * 2 - lastHit(events).total - 55);
});

test('together, a round is the two of them\'s once the computer\'s fighter is out, whoever\'s move it was, and so is the fight', () => {
  const { fight, events } = setup({ ally: true, rounds: 3 });
  // The friend's move finishes it.
  fight.allyHit('palm', { damage: 50, total: RULES.maxHp * 2 });
  assert.deepEqual([fight.state, fight.player.roundsWon, fight.npc.roundsWon], ['break', 1, 0]);
  const end = events.find(({ type }) => type === 'round-end');
  assert.deepEqual([end.winner, end.over], ['player', false]);
  // The next round starts afresh: what either did in the last one doesn't carry over.
  fight.beginRound();
  assert.deepEqual([fight.npc.hp, fight.allyDealt, fight.dealt], [RULES.maxHp * 2, 0, 0]);
  // A move of the friend's from the round before, coming late, does nothing: main.js only passes on this round's.
  // The friend's computer got there first, and says the round is won: it is, for both, and that's the fight.
  fight.teamRoundWon();
  assert.deepEqual([fight.state, fight.winner, fight.player.roundsWon], ['over', 'player', 2]);
  assert.deepEqual(events.at(-1), { type: 'fight-end', winner: 'player' });
  // Once it's over, nothing more is taken.
  assert.equal(fight.allyHit('palm', { total: 10 }), false);
});

test('together, the computer can never knock a child out, however hard a grown-up has set it', () => {
  const tough = { ...NPC_LEVELS.tough };
  assert.equal(tough.mercy, 0);
  const { fight } = setup({ ally: true, level: tough });
  assert.equal(fight.level.mercy, TEAM.mercy);
  for (let i = 0; i < 40; i += 1) {
    fight.perform('npc', 'flying');
    run(fight, 1);
  }
  assert.equal(fight.state, 'fighting');
  assert.equal(fight.player.hp, TEAM.mercy);
  // On their own, at the same strength, that's a round lost.
  const alone = setup({ level: tough });
  for (let i = 0; i < 40 && alone.fight.state === 'fighting'; i += 1) {
    alone.fight.perform('npc', 'flying');
    run(alone.fight, 1);
  }
  assert.equal(alone.fight.npc.roundsWon, 1);
  // Gentle's own mercy, which is the same, stays as it is.
  assert.equal(setup({ ally: true, level: { ...NPC_LEVELS.gentle } }).fight.level.mercy, NPC_LEVELS.gentle.mercy);
});

test('together, it\'s the level as it is on their own, with its prizes and its champion, but no other helper: the friend is the helper', () => {
  const team = new Fight({ level: MEDIUM, levelNumber: 10, ally: true });
  const rules = fightLevel(10);
  assert.ok(rules.powerUps.includes('helper'));
  assert.deepEqual(team.levelRules.powerUps, rules.powerUps.filter((kind) => kind !== 'helper'));
  assert.deepEqual(team.levelRules.prizes, rules.prizes);
  assert.equal(team.levelRules.champion, rules.champion);
  // Against a friend isn't together, whatever else is said.
  assert.equal(new Fight({ level: MEDIUM, friend: true, ally: true }).ally, false);
  assert.equal(new Fight({ level: MEDIUM }).npcMax, RULES.maxHp);
});

test('together, a friend who goes leaves the child to fight on, against a fighter with one fighter\'s health', () => {
  const { fight, events } = setup({ ally: true });
  fight.allyHit('palm', { damage: 30, total: 30 });
  assert.equal(fight.npc.hp, 170);
  fight.allyGone();
  // No more than one fighter's health, and no more gone from it than it had lost.
  assert.deepEqual([fight.npc.hp, fight.npcMax, fight.state], [100, 100, 'fighting']);
  fight.perform('player', 'stomp', { exercise: 'squat', side: 'right' });
  run(fight, 1);
  assert.equal(fight.npc.hp, 100 - lastHit(events).damage);
  // A fighter that was nearly out stays nearly out.
  const late = setup({ ally: true });
  late.fight.allyHit('palm', { damage: 30, total: 180 });
  late.fight.allyGone();
  assert.equal(late.fight.npc.hp, 20);
  late.fight.beginRound();
  assert.equal(late.fight.npc.hp, 100, 'and the next round is one fighter\'s too');
  // Gone twice is gone once.
  late.fight.allyGone();
  assert.equal(late.fight.npc.hp, 100);
});

test('the coach gives the computer its turns when the friend is on the child\'s side, as it does on their own', () => {
  const { fight } = setup({ ally: true, level: { ...NPC_LEVELS.medium } });
  const coach = new Coach({ fight, reader: fakeReader({ moving: true }) });
  coach.beginRound();
  for (let t = 0; t < 120; t += 0.1) {
    fight.noteActivity(0.1);
    coach.update(0.1);
    fight.update(0.1);
  }
  assert.ok(coach.defences >= 1);
});

test('the coach never gives a friend\'s fighter a turn of its own', () => {
  const { fight } = setup({ friend: true, level: { ...NPC_LEVELS.gentle, every: Infinity, damage: 1, mercy: 0 } });
  const coach = new Coach({ fight, reader: fakeReader({ moving: true }) });
  coach.beginRound();
  for (let t = 0; t < 120; t += 0.1) {
    fight.noteActivity(0.1);
    coach.update(0.1);
    fight.update(0.1);
  }
  assert.notEqual(coach.phase, 'defending');
  assert.equal(coach.defences, 0);
});

test('a squat stays on the floor, sinking deeper to slam it, and a toe touch starts folded over with the hands at the toes', () => {
  const stomp = CLIPS.stomp.right.frames;
  assert.ok(stomp.every(({ pose }) => pose.up <= 0.01), 'no jump in a squat');
  const slam = stomp.find(({ t }) => Math.abs(t - MOVES.stomp.hitAt) < 0.02).pose;
  assert.ok(slam.hipDrop >= 0.3 && slam.handLY <= -0.9 && slam.handRY <= -0.9, 'both palms on the floor, down low, as it lands');
  const [touch] = CLIPS.sweep.right.frames;
  assert.ok(touch.pose.pitch >= 0.9 && touch.pose.handLY <= -0.95 && touch.pose.handRY <= -0.95);
  const sweep = CLIPS.sweep.right.frames.find(({ t }) => Math.abs(t - MOVES.sweep.hitAt) < 0.02).pose;
  assert.ok(sweep.handLZ > 0.5 && sweep.handRZ > 0.5 && sweep.handLY < -0.8, 'the hands sweep low along the floor, at the other fighter');
});

/* ---------- the computer can win ---------- */

/**
 * A whole fight against the computer, with a scripted child: they do what's asked after moveAfter seconds, and
 * get out of the way of the computer's turns dodge of the time, react seconds into the warning. Says who won.
 */
function scriptedFight(strength, levelNumber, { moveAfter, dodge, react }, seed) {
  const random = seeded(seed);
  const fight = new Fight({ rounds: 3, level: strength, levelNumber });
  const reader = fakeReader({ moving: true });
  const coach = new Coach({ fight, reader, random: seeded(seed + 100) });
  let t = 0;
  while (fight.state !== 'over' && t < 900) {
    fight.beginRound();
    coach.beginRound();
    let asking = 0;
    let defending = 0;
    let willDodge = false;
    while (fight.state === 'fighting' && t < 900) {
      t += 0.02;
      asking = coach.phase === 'asking' ? asking + 0.02 : 0;
      if (asking >= moveAfter) {
        coach.onMoves(whatsAsked(coach));
        asking = 0;
      }
      if (coach.phase === 'defending') {
        if (defending === 0) willDodge = random() < dodge;
        defending += 0.02;
        const doing = willDodge && defending >= react;
        reader.guard = doing && coach.defence?.kind === 'block';
        reader.dodge = doing && coach.defence?.kind === 'lean' ? 1 : 0;
      } else {
        defending = 0;
        reader.guard = false;
        reader.dodge = 0;
      }
      fight.noteActivity(0.02);
      coach.update(0.02);
      fight.update(0.02);
    }
  }
  return fight.winner;
}

// A child new to the game: slow to do what's asked, and out of the way of only a third of the computer's turns.
const NEW_CHILD = { moveAfter: 5, dodge: 0.3, react: 2 };

test('as it comes, on Medium, the computer can win a fight: a child new to it wins at level 1, and loses at level 10', () => {
  assert.equal(DEFAULT_STRENGTH, 'medium');
  const wins = (strength, level) => [1, 2, 3, 4, 5, 6].filter((seed) => scriptedFight(strength, level, NEW_CHILD, seed) === 'player').length;
  assert.ok(wins(NPC_LEVELS.medium, 1) >= 5, 'level 1 can be learnt');
  assert.ok(wins(NPC_LEVELS.medium, 10) <= 1, 'at level 10 the computer wins');
  assert.ok(wins(NPC_LEVELS.tough, 10) <= 1);
});

test('on Gentle, the game as it was, the computer never knocks a child out, at any level', () => {
  for (const level of [1, 10]) {
    for (const seed of [1, 2, 3]) assert.equal(scriptedFight(NPC_LEVELS.gentle, level, NEW_CHILD, seed), 'player', `level ${level}`);
  }
  const gentle = fightLevel(10, NPC_LEVELS.gentle);
  const medium = fightLevel(10, NPC_LEVELS.medium);
  assert.deepEqual([gentle.turnEvery, gentle.warning, gentle.hits], [0.8, 0.8, 1]);
  assert.deepEqual([medium.turnEvery, medium.warning, medium.hits], [0.6, 0.6, 1.4]);
});

test('a child standing still is never hit, on Tough at level 10 too', () => {
  const fight = new Fight({ rounds: 1, level: NPC_LEVELS.tough, levelNumber: 10 });
  const reader = fakeReader({ moving: false });
  const coach = new Coach({ fight, reader, random: seeded(4) });
  fight.beginRound();
  coach.beginRound();
  for (let t = 0; t < 120; t += 0.02) {
    coach.update(0.02);
    fight.update(0.02);
  }
  assert.equal(fight.player.hp, RULES.maxHp);
  assert.equal(fight.state, 'fighting');
});

test('on Medium the computer hits 1.4 times as hard at level 10 as at level 1, and on Gentle no harder', () => {
  const hit = (strength, levelNumber) => {
    const events = [];
    const fight = new Fight({ rounds: 1, level: strength, levelNumber, onEvent: (event) => events.push(event) });
    fight.beginRound();
    fight.perform('npc', 'palm');
    run(fight, 1);
    return lastHit(events).damage;
  };
  assert.ok(Math.abs(hit(NPC_LEVELS.medium, 10) / hit(NPC_LEVELS.medium, 1) - 1.4) < 1e-9);
  assert.equal(hit(NPC_LEVELS.gentle, 10), hit(NPC_LEVELS.gentle, 1));
});
