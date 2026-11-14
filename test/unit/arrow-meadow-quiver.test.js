// Arrow Meadow's quiver, and targets that don't wait for ever, unless a grown-up chooses the gentle contest: the rules
// with no screen in them. The screen is tested in test/e2e/arrow-meadow/quiver.spec.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXTRAS, MERCY, Meadow, meadowLevel, quiverFor, seeded } from '../../games/arrow-meadow/meadow.js';

const FRAME = 1 / 60;
const LEVELS = Array.from({ length: 10 }, (_, index) => index + 1);
const rad = (degrees) => (degrees * Math.PI) / 180;

function makeMeadow(options = {}) {
  const log = [];
  const meadow = new Meadow({ random: seeded(options.seed ?? 7), help: 'off', onEvent: (event) => log.push(event), ...options });
  meadow.log = log;
  return meadow;
}
const said = (meadow, type) => meadow.log.filter((event) => event.type === type);
const plainOf = (meadow) => meadow.live.find((target) => target.slot === 'plain');

function run(meadow, seconds, until = () => false, present = true) {
  let t = 0;
  for (; t < seconds && !until(); t += FRAME) meadow.update(FRAME, { present });
  return t;
}

/** An arrow that comes down in the grass, short of everything. */
function miss(meadow) {
  for (const [degrees, draw] of [[78, 0.3], [70, 0.3], [-12, 0.3], [78, 0.5]]) {
    if (meadow.trace(rad(degrees), draw).end.what === 'ground') {
      const arrow = meadow.loose(rad(degrees), draw);
      run(meadow, 8, () => !arrow || arrow.state !== 'flying');
      return arrow;
    }
  }
  throw new Error('no way to miss');
}

function hitPlain(meadow) {
  run(meadow, 5, () => plainOf(meadow));
  const target = plainOf(meadow);
  for (const draw of [1, 0.85, 0.7]) {
    const angle = meadow.solve(target, draw);
    if (angle === null) continue;
    const arrow = meadow.loose(angle, draw);
    run(meadow, 8, () => arrow.state !== 'flying');
    return arrow;
  }
  throw new Error('no arc reaches it');
}

/** A pretend archer, as in arrow-meadow.test.js: wander is how far off its aim can be, in degrees. */
function playThrough(meadow, { every = 1.2, wander = 0, seconds = 600, seed = 11 } = {}) {
  const random = seeded(seed);
  let wait = every;
  return run(meadow, seconds, () => {
    wait -= FRAME;
    if (wait <= 0 && !meadow.done) {
      wait = every;
      const wanted = meadow.wants();
      if (wanted) {
        const aim = meadow.aimFor(wanted.angle + rad((random() - 0.5) * 2 * wander), wanted.draw);
        meadow.loose(aim.angle, aim.draw);
      }
    }
    return meadow.done;
  });
}

test('arrow meadow: the quiver holds two and a half arrows for each target at level 1, and 1.4 at level 10', () => {
  assert.equal(quiverFor(10, 1), 25);
  assert.equal(quiverFor(10, 10), 14);
  assert.equal(quiverFor(6, 10), 9);
  for (const level of LEVELS.slice(1)) assert.ok(meadowLevel(level).quiver < meadowLevel(level - 1).quiver);
  assert.equal(quiverFor(10, 5, { gentle: true }), Infinity);
  const meadow = makeMeadow({ level: 1, goal: 10 });
  assert.equal(meadow.arrowsLeft, 25);
});

test('arrow meadow: every arrow takes one from the quiver, and the contest is lost once it\'s empty and the last has landed', () => {
  const meadow = makeMeadow({ level: 1, goal: 2 });
  assert.equal(meadow.arrowsLeft, 5);
  hitPlain(meadow);
  assert.equal(meadow.arrowsLeft, 4);
  for (let n = 0; n < 4; n += 1) miss(meadow);
  assert.equal(meadow.arrowsLeft, 0);
  // Nothing more can be let go.
  assert.equal(meadow.loose(rad(20), 1), null);
  run(meadow, 0.1);
  assert.equal(meadow.phase, 'lost');
  assert.equal(said(meadow, 'out').length, 1);
  assert.equal(meadow.done, false, 'a moment to see it');
  run(meadow, 2, () => meadow.done);
  assert.equal(meadow.done, true);
  assert.equal(meadow.stats.hits, 1);
});

test('arrow meadow: the last arrow hitting the last target wins, rather than losing', () => {
  const meadow = makeMeadow({ level: 1, goal: 2 });
  for (let n = 0; n < 3; n += 1) miss(meadow);
  hitPlain(meadow);
  assert.equal(meadow.arrowsLeft, 1);
  assert.equal(meadow.phase, 'play');
  hitPlain(meadow);
  assert.equal(meadow.arrowsLeft, 0);
  assert.equal(meadow.phase, 'won');
  run(meadow, 5, () => meadow.done);
  assert.equal(meadow.phase, 'won');
});

test('arrow meadow: a target stands for 20 seconds at level 1 and 8 at level 10, only while the hands are in the picture', () => {
  assert.equal(meadowLevel(1).stays, 20);
  assert.equal(meadowLevel(10).stays, 8);
  const meadow = makeMeadow({ level: 1 });
  const first = plainOf(meadow);
  // The hands gone from the picture: it waits.
  run(meadow, 60, () => false, false);
  assert.equal(plainOf(meadow), first);
  run(meadow, 19.5);
  assert.equal(plainOf(meadow), first);
  run(meadow, 1);
  assert.equal(first.state, 'leaving');
  assert.equal(said(meadow, 'leave').length, 1);
  // And another comes somewhere else, costing no arrow.
  run(meadow, 2, () => plainOf(meadow));
  assert.notEqual(plainOf(meadow), first);
  assert.equal(meadow.arrowsLeft, 25);
});

test('arrow meadow: missing never makes the target grow, and the golden target goes down without the trophy, though the contest is won', () => {
  const meadow = makeMeadow({ level: 3 });
  const target = plainOf(meadow);
  const size = target.r;
  for (let n = 0; n < MERCY.from + 4; n += 1) miss(meadow);
  assert.equal(target.r, size);
  assert.equal(said(meadow, 'grow').length, 0);

  const castle = makeMeadow({ level: 10, goal: 2 });
  hitPlain(castle);
  hitPlain(castle);
  assert.equal(castle.phase, 'castle');
  // Shooting at it costs nothing, even with an empty quiver.
  castle.arrowsLeft = 0;
  assert.ok(castle.loose(rad(80), 0.3));
  run(castle, EXTRAS.castle.waits + 1, () => castle.phase !== 'castle');
  assert.equal(castle.phase, 'won');
  assert.equal(castle.stats.trophy, false);
  assert.equal(said(castle, 'trophy').length, 0);
});

test('arrow meadow: gently, and with friends, arrows never run out, targets wait, and misses grow the target', () => {
  const gentle = makeMeadow({ level: 10, gentle: true });
  assert.equal(gentle.arrowsLeft, Infinity);
  for (let n = 0; n < 40; n += 1) miss(gentle);
  assert.equal(gentle.phase, 'play');
  assert.ok(said(gentle, 'grow').length > 0);
  const first = plainOf(gentle) ?? gentle.live[0];
  run(gentle, 120);
  assert.equal(said(gentle, 'leave').length, 0);
  assert.ok(first);
  const team = makeMeadow({ level: 6, team: { seed: 3, players: 2, claim: () => {} } });
  const race = makeMeadow({ level: 6, race: { seed: 3 } });
  for (const meadow of [team, race]) {
    assert.equal(meadow.gentle, true);
    assert.equal(meadow.arrowsLeft, Infinity);
  }
});

test('arrow meadow: a good archer wins every level with arrows to spare, and one who misses a lot at level 10 runs out', () => {
  for (const level of LEVELS) {
    const good = makeMeadow({ level });
    const took = playThrough(good, { every: 1.5 });
    assert.equal(good.phase, 'won', `level ${level}: ${good.phase} after ${took} s, ${good.stats.hits} hit of ${good.stats.shots}`);
    assert.ok(good.arrowsLeft >= 1, `level ${level}: ${good.arrowsLeft} left`);
  }
  // An archer whose aim wanders by a dozen degrees either way.
  let lost = 0;
  for (const seed of [11, 12, 13]) {
    const clumsy = makeMeadow({ level: 10 });
    playThrough(clumsy, { every: 2, wander: 12, seconds: 900, seed });
    if (clumsy.phase === 'lost') lost += 1;
  }
  assert.ok(lost >= 2, `only ${lost} of 3 clumsy archers ran out at level 10`);
});
