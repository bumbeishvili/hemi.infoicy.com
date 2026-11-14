// Giraffe's Long Walk Home: the sun going down, which is what's at stake by default.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAYLIGHT, Journey, daylightAt, featuresAt, stopsAt } from '../../games/giraffe-walk/journey.js';

const LEVELS = Array.from({ length: 10 }, (_, index) => index + 1);

test('there\'s daylight for every fruit and job on the way: 14 seconds each at level 1, down to 5 at level 10', () => {
  const jobs = (level) => stopsAt(level).reduce((sum, stop, index) => {
    const features = featuresAt(level, index);
    return sum + stop.count + (features.bridge ? DAYLIGHT.bridge : 0) + features.frost * DAYLIGHT.frost;
  }, 0);
  assert.equal(daylightAt(1), 17 * 14);
  assert.equal(daylightAt(10), jobs(10) * 5);
  assert.equal(jobs(10), 23, 'nineteen fruit, the bridge and two frosty fruit');
  for (const level of LEVELS.slice(1)) {
    assert.ok(daylightAt(level) / jobs(level) < daylightAt(level - 1) / jobs(level - 1), `less time for each at level ${level}`);
  }
});

test('the sun goes down as time passes, and when it\'s dark the walk is over, once', () => {
  const events = [];
  const journey = new Journey({ level: 4, onEvent: (event) => events.push(event.type) });
  journey.nextStop();
  assert.equal(journey.daylight, daylightAt(4));
  assert.equal(journey.daylightShare, 1);
  journey.passTime(journey.daylight / 2);
  assert.ok(Math.abs(journey.daylightShare - 0.5) < 1e-9);
  assert.equal(journey.dark, false);
  journey.passTime(journey.daylight);
  assert.equal(journey.dark, true);
  assert.equal(journey.daylightShare, 0);
  journey.passTime(10);
  assert.deepEqual(events.filter((type) => type === 'dark'), ['dark']);
});

test('a walk that gets home in time is never dark', () => {
  const events = [];
  const journey = new Journey({ level: 1, onEvent: (event) => events.push(event.type) });
  journey.nextStop();
  while (!journey.over) {
    journey.passTime(5);
    journey.feed(1);
    if (journey.wanted === 0) journey.nextStop();
  }
  journey.passTime(1000);
  assert.ok(events.includes('home'));
  assert.ok(!events.includes('dark'));
});

test('on Gentle it stays light, however long the walk takes, as it always did', () => {
  const events = [];
  const journey = new Journey({ level: 10, daylight: false, onEvent: (event) => events.push(event.type) });
  journey.nextStop();
  journey.passTime(1e6);
  assert.equal(journey.daylight, Infinity);
  assert.equal(journey.daylightShare, 1);
  assert.equal(journey.dark, false);
  assert.ok(!events.includes('dark'));
});
