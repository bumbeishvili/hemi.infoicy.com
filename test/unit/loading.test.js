// The bar that fills while a game gets ready (core/loading.js): how far along it says the loading is, from what's
// done of each part, and that it never goes back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillBar, LOADING, OPENING, Progress } from '../../core/loading.js';

const near = (value, wanted) => assert.ok(Math.abs(value - wanted) < 1e-9, `${value} is ${wanted}`);

test('each part of the loading is worth its share of the bar, and all of them are the whole of it', () => {
  for (const parts of [OPENING, LOADING]) near(Object.values(parts).reduce((sum, weight) => sum + weight, 0), 1);
  const opening = new Progress(OPENING);
  near(opening.share, 0);
  near(opening.set('card', 1), OPENING.card);
  near(opening.set('words', 1), OPENING.card + OPENING.words);
  near(opening.set('game', 1), 1);
});

test('a part that is part of the way there counts for that much of its share', () => {
  const loading = new Progress(LOADING);
  near(loading.set('sounds', 0.5), LOADING.sounds / 2);
  near(loading.set('tracker', 0.3), LOADING.sounds / 2 + LOADING.tracker * 0.3);
  near(loading.set('camera', 1), LOADING.sounds / 2 + LOADING.tracker * 0.3 + LOADING.camera);
});

test('the bar never goes back, whatever it is told', () => {
  const loading = new Progress(LOADING);
  loading.set('tracker', 0.7);
  // A tracker that starts again on a slower way of working says it's back at the start.
  near(loading.set('tracker', 0.3), LOADING.tracker * 0.7);
  loading.set('camera', 1);
  near(loading.set('camera', 0), LOADING.tracker * 0.7 + LOADING.camera);
  const before = loading.share;
  near(loading.share, before);
});

test('nonsense is nothing: a part that is not one, a share that is not a number, or one past the end', () => {
  const loading = new Progress(LOADING);
  near(loading.set('nothing', 1), 0);
  near(loading.set('sounds', Number.NaN), 0);
  near(loading.set('sounds', -3), 0);
  near(loading.set('sounds', 7), LOADING.sounds);
  near(new Progress({}).share, 1);
});

test('a bar shows how far along in whole percent, for the eye and for a screen reader', () => {
  const fill = { style: {} };
  const said = {};
  const bar = { querySelector: () => fill, setAttribute: (name, value) => { said[name] = value; } };
  fillBar(bar, 0.456);
  assert.equal(fill.style.width, '46%');
  assert.equal(said['aria-valuenow'], '46');
  fillBar(bar, 4);
  assert.equal(fill.style.width, '100%');
  fillBar(bar, -1);
  assert.equal(fill.style.width, '0%');
  // No bar on the page is no error.
  fillBar(null, 0.5);
});
