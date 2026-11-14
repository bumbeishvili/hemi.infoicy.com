// The Lighthouse Keeper: how long a ship can wait for its window, which is what's at stake by default.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Storm, WAITS, shipWaits } from '../../games/lighthouse/storm.js';

const seeded = (seed = 1) => {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
};

test('a ship waits 50 seconds at level 1, down to 16 at level 10, and longer for each thing the storm throws on', () => {
  assert.equal(shipWaits(1), 50);
  assert.equal(shipWaits(10), 16);
  for (let level = 2; level <= 10; level += 1) assert.ok(shipWaits(level) < shipWaits(level - 1), `level ${level}`);
  assert.equal(shipWaits(10, [{ what: 'splat' }, { what: 'splat' }, { what: 'star' }]), 16 + 2 * WAITS.splat + WAITS.lump);
  assert.equal(shipWaits(10, [{ what: 'chest' }, { what: 'crab' }, { what: 'lantern' }]), 16 + WAITS.chest);
  // A big window has longer, and a small one less.
  assert.ok(shipWaits(5, [], 'none') > shipWaits(5, [], 'little'));
  assert.ok(shipWaits(5, [], 'lots') < shipWaits(5, [], 'little'));
  // The storm works it out for each window from what it has planned for it.
  const storm = new Storm({ level: 10, ships: 4, random: seeded() });
  storm.nextShip();
  assert.equal(storm.waitTotal, shipWaits(10, storm.coming));
});

test('a ship drifts away if its window isn\'t clean in time, and the game hears it once', () => {
  const events = [];
  const storm = new Storm({ level: 3, ships: 2, random: seeded(), onEvent: (event) => events.push(event.type) });
  storm.nextShip();
  storm.passTime(storm.waitTotal / 2);
  assert.ok(Math.abs(storm.waitShare - 0.5) < 1e-9);
  assert.equal(storm.drifted, false);
  storm.passTime(storm.waitTotal);
  assert.equal(storm.drifted, true);
  assert.equal(storm.waitShare, 0);
  storm.passTime(5);
  assert.deepEqual(events.filter((type) => type === 'drifted'), ['drifted']);
});

test('a window wiped clean in time stops the ship drifting, and the next ship has its own time', () => {
  const events = [];
  const storm = new Storm({ level: 1, ships: 2, random: seeded(), onEvent: (event) => events.push(event.type) });
  storm.nextShip();
  storm.passTime(10);
  for (let x = 0; x <= 1; x += 0.05) for (let y = 0; y <= 1; y += 0.1) storm.wipe(x, y, 0.12, 0.16);
  storm.update(0.1);
  assert.equal(storm.clean, true);
  const left = storm.waitLeft;
  storm.passTime(1000);
  assert.equal(storm.waitLeft, left, 'a clean window\'s ship waits no more');
  storm.shipHome();
  storm.nextShip();
  assert.equal(storm.waitLeft, storm.waitTotal);
  assert.ok(!events.includes('drifted'));
});

test('on Gentle, and with friends, the ships wait as long as it takes, as they always did', () => {
  for (const options of [{ waits: false }, { shared: true }]) {
    const events = [];
    const storm = new Storm({ level: 10, ships: 4, random: seeded(), onEvent: (event) => events.push(event.type), ...options });
    storm.nextShip();
    storm.passTime(1e6);
    assert.equal(storm.waitTotal, Infinity);
    assert.equal(storm.waitShare, 1);
    assert.ok(!events.includes('drifted'), JSON.stringify(options));
  }
});
