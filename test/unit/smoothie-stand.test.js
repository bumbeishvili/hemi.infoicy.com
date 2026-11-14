// Giraffe's Smoothie Stand's customers, who won't wait forever unless a grown-up chooses customers who wait as long
// as it takes: the rules with no screen in them. The screens are in test/e2e/story-games/smoothie-patience.spec.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY, PATIENCE, Stand, fairAt, patienceFor } from '../../games/smoothie-stand/orders.js';

const LEVELS = Array.from({ length: 10 }, (_, index) => index + 1);
const fruitIn = ({ order }) => Object.values(order).reduce((sum, count) => sum + count, 0);

function standWith(options = {}) {
  const events = [];
  const stand = new Stand({ ...options, onEvent: (event) => events.push(event) });
  return { stand, events, types: () => events.map(({ type }) => type) };
}

const sliceOrder = (stand) => {
  for (const kind of stand.wantedKinds) while (stand.left[kind] > 0) stand.slice(kind);
};

test('smoothie stand: a customer waits 30 seconds for four apples at level 1, and half that at level 10', () => {
  const truffle = DAY[0];
  assert.equal(patienceFor(truffle, 1), 30);
  assert.equal(patienceFor(truffle, 10), 15);
  for (const customer of DAY) {
    const first = patienceFor(customer, 1);
    let before = first;
    for (const level of LEVELS.slice(1)) {
      const now = patienceFor(customer, level);
      assert.ok(now < before, `${customer.who} waits no less at level ${level}`);
      before = now;
    }
    assert.ok(Math.abs(before / first - 0.5) < 1e-9, `${customer.who}: ${before} against ${first}`);
  }
});

test('smoothie stand: patience only runs down while the hand is in the picture, and a customer who runs out goes home', () => {
  const { stand, events, types } = standWith({ level: 1 });
  stand.nextCustomer();
  assert.equal(stand.patience, 30);
  // A child who has gone, or whose hand the camera has lost, keeps the customer waiting for nothing.
  for (let i = 0; i < 200; i += 1) stand.tick(0.5, { seen: false, present: false });
  assert.equal(stand.patience, 30);
  // A closed hand in the picture is still at the stand: patience runs down.
  for (let i = 0; i < 20; i += 1) stand.tick(0.5, { seen: false, present: true });
  assert.equal(stand.patience, 20);
  assert.ok(Math.abs(stand.patienceShare - 2 / 3) < 1e-9);
  for (let i = 0; i < 39; i += 1) stand.tick(0.5);
  assert.equal(stand.walkedOff, null);
  stand.tick(0.5);
  assert.equal(stand.walkedOff?.who, 'truffle');
  assert.deepEqual(types().filter((type) => type === 'walked-off'), ['walked-off']);
  assert.equal(events.at(-1).customer.who, 'truffle');
  // Only once.
  for (let i = 0; i < 20; i += 1) stand.tick(0.5);
  assert.equal(types().filter((type) => type === 'walked-off').length, 1);
});

test('smoothie stand: an order made in time stops the wait, and the next customer starts their own', () => {
  const { stand, types } = standWith({ level: 10 });
  stand.nextCustomer();
  for (let i = 0; i < 20; i += 1) stand.tick(0.5);
  assert.equal(stand.patience, 5);
  sliceOrder(stand);
  for (let i = 0; i < 40; i += 1) stand.tick(0.5);
  assert.equal(stand.walkedOff, null);
  assert.ok(!types().includes('walked-off'));
  stand.nextCustomer();
  assert.equal(stand.customer.who, 'mochi');
  assert.equal(stand.patience, patienceFor(DAY[1], 10));
});

test('smoothie stand: slicing a rotten fruit puts the customer off a little, and an order that is made can still be finished', () => {
  const { stand } = standWith({ level: 1 });
  stand.nextCustomer();
  stand.slice('rotten');
  assert.equal(stand.patience, 30 - PATIENCE.rottenCost);
  // Enough rotten fruit sends them home, with no clock at all.
  for (let i = 0; i < 9; i += 1) stand.slice('rotten');
  assert.equal(stand.walkedOff?.who, 'truffle');
});

test('smoothie stand: gentle customers wait as long as it takes, and so does everyone with friends', () => {
  for (const options of [{ gentle: true }, { plain: true }]) {
    for (const level of [1, 10]) {
      const { stand, types } = standWith({ ...options, level });
      stand.nextCustomer();
      for (let i = 0; i < 2000; i += 1) stand.tick(0.5);
      for (let i = 0; i < 50; i += 1) stand.slice('rotten');
      assert.equal(stand.walkedOff, null);
      assert.equal(stand.patienceShare, 1);
      assert.ok(!types().includes('walked-off'), JSON.stringify(options));
    }
  }
});

test('smoothie stand: the gentle fair climbs as it always did, and the default climbs further', () => {
  const gentle = fairAt(10, { gentle: true });
  assert.deepEqual([gentle.gravity, gentle.every], [1.3, 0.8]);
  const hard = fairAt(10);
  assert.ok(Math.abs(hard.gravity - 1.45) < 1e-9);
  assert.ok(Math.abs(hard.every - 0.72) < 1e-9);
  assert.deepEqual(fairAt(1), fairAt(1, { gentle: true }));
  // Everything else a level brings is the same either way.
  const rest = ({ gravity, every, ...others }) => others;
  for (const level of LEVELS) assert.deepEqual(rest(fairAt(level)), rest(fairAt(level, { gentle: true })));
  // A fruit is still up for over 80% as long at level 10, more than half of level 1's time to slice it.
  assert.ok(1 / Math.sqrt(hard.gravity) > 0.8);
});

// The paces a grown-up can choose, as in field.js.
const PACES = {
  slow: { gravity: 0.38, every: 0.85, volley: [1, 2], most: 8 },
  medium: { gravity: 0.5, every: 0.7, volley: [1, 3], most: 10 },
  fast: { gravity: 0.68, every: 0.55, volley: [2, 3], most: 12 },
};

/** How many fruit on the order come up each second, at a level and pace. */
function wantedPerSecond(level, paceName) {
  const at = fairAt(level);
  const pace = PACES[paceName];
  const upSeconds = 2 * Math.sqrt((2 * 0.52) / (pace.gravity * at.gravity));
  const volley = Math.max(pace.volley[1], Math.min(3, pace.volley[1] + at.volley));
  const most = Math.max(pace.most, Math.min(12, pace.most + at.most));
  const thrown = Math.min((pace.volley[0] + volley) / 2 / (pace.every * at.every), most / upSeconds);
  return thrown * at.wantedShare;
}

test('smoothie stand: every customer can be served in time at every level and pace, slicing only every other fruit that is wanted', () => {
  for (const pace of Object.keys(PACES)) {
    for (const level of LEVELS) {
      for (const customer of DAY) {
        const needs = (2 * fruitIn(customer)) / wantedPerSecond(level, pace);
        assert.ok(patienceFor(customer, level) > needs, `${pace}, level ${level}, ${customer.who}: ${patienceFor(customer, level)}s to wait, ${needs.toFixed(1)}s needed`);
      }
    }
  }
});
