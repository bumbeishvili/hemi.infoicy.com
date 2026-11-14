// Spider Catcher's spiders wandering off when nobody plays with them, unless a grown-up chooses the gentle garden:
// the rules with no screen in them. The screen is tested in test/e2e/spider-catcher/away.spec.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATCH_REACH, GET_AWAY_MOST, SPIDER_SIZE, Wandering, friendsGardenAt, gardenAt } from '../../games/spider-catcher/spiders.js';

const LEVELS = Array.from({ length: 10 }, (_, index) => index + 1);
const near = (a, b) => Math.abs(a - b) < 1e-9;

test('spider catcher: one heads off after 24 seconds with nothing caught at level 1, and after 12 at level 10', () => {
  assert.equal(gardenAt(1).awayAfter, 24);
  assert.equal(gardenAt(10).awayAfter, 12);
  assert.equal(gardenAt(1).awayRun, 5);
  assert.equal(gardenAt(10).awayRun, 3);
  for (const level of LEVELS.slice(1)) assert.ok(gardenAt(level).awayAfter < gardenAt(level - 1).awayAfter);
  assert.equal(GET_AWAY_MOST, 3);
});

test('spider catcher: only the hand in the picture keeps the clock going, and catching or bringing one home settles them', () => {
  const wandering = new Wandering({ after: 10 });
  assert.equal(wandering.on, true);
  // A child who has gone, or whose hand the camera lost, is never let down for it.
  for (let i = 0; i < 1000; i += 1) assert.equal(wandering.tick(0.1, { seen: false }), false);
  assert.equal(wandering.since, 0);
  let went = 0;
  for (let i = 0; i < 99; i += 1) went += wandering.tick(0.1, { seen: true }) ? 1 : 0;
  assert.equal(went, 0);
  wandering.settle();
  for (let i = 0; i < 99; i += 1) went += wandering.tick(0.1, { seen: true }) ? 1 : 0;
  assert.equal(went, 0);
  // Left alone long enough, one goes, and the next goes as long again after.
  for (let i = 0; i < 2; i += 1) went += wandering.tick(0.1, { seen: true }) ? 1 : 0;
  assert.equal(went, 1);
  for (let i = 0; i < 101; i += 1) went += wandering.tick(0.1, { seen: true }) ? 1 : 0;
  assert.equal(went, 2);
});

test('spider catcher: the third to get away ends the game, and nothing more goes after that', () => {
  const wandering = new Wandering({ after: 1 });
  assert.equal(wandering.gotAway(), false);
  assert.equal(wandering.gotAway(), false);
  assert.equal(wandering.lost, false);
  assert.equal(wandering.gotAway(), true);
  assert.equal(wandering.lost, true);
  for (let i = 0; i < 50; i += 1) assert.equal(wandering.tick(0.1, { seen: true }), false);
});

test('spider catcher: in the gentle garden, and with friends, nobody ever gets away', () => {
  for (const level of LEVELS) {
    for (const at of [gardenAt(level, { gentle: true }), friendsGardenAt(level)]) {
      assert.equal(at.awayAfter, Infinity);
      const wandering = new Wandering({ after: at.awayAfter });
      assert.equal(wandering.on, false);
      for (let i = 0; i < 1000; i += 1) assert.equal(wandering.tick(1, { seen: true }), false);
    }
  }
});

test('spider catcher: the gentle garden climbs as it always did, and the default climbs further', () => {
  assert.ok(near(gardenAt(10, { gentle: true }).speed, 0.094));
  assert.ok(near(gardenAt(10).speed, 0.12));
  // Everything else a level brings is the same either way.
  const rest = ({ speed, awayAfter, awayRun, ...others }) => others;
  for (const level of LEVELS) assert.deepEqual(rest(gardenAt(level)), rest(gardenAt(level, { gentle: true })));
  // A spider going past a still hand is in reach for over half as long at level 10 as at level 1.
  const react = (level) => (2 * (0.105 * CATCH_REACH + SPIDER_SIZE)) / gardenAt(level).speed;
  assert.ok(react(10) >= react(1) * 0.55, `${react(10)} against ${react(1)}`);
  // And one heading off takes a few seconds to get away, so there is time to go after it.
  for (const level of LEVELS) assert.ok(gardenAt(level).awayRun >= 3);
});
