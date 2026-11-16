// Hat Chase's magpie keeping clear of what sits on top of the picture: games/hat-chase/clear.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearOf } from '../../games/hat-chase/clear.js';

const half = { w: 60, h: 40 };
const bounds = { left: 60, right: 1220, top: 44, bottom: 450 };
const box = (left, top, right, bottom) => ({ left, top, right, bottom });
const touches = (at, cover, pad = 8) => at.x + half.w > cover.left - pad && at.x - half.w < cover.right + pad && at.y + half.h > cover.top - pad && at.y - half.h < cover.bottom + pad;

test('with nothing on top of it, it stays where it was wanted', () => {
  assert.deepEqual(clearOf({ x: 900, y: 220 }, half, [], bounds), { x: 900, y: 220 });
  // And with something on top of the picture that isn't over it.
  assert.deepEqual(clearOf({ x: 900, y: 220 }, half, [box(100, 500, 300, 700)], bounds), { x: 900, y: 220 });
});

test('under the top of the coach\'s film it goes up, just clear of it, and no further', () => {
  const film = box(935, 254, 1268, 708);
  const at = clearOf({ x: 1160, y: 227 }, half, [film], bounds);
  assert.equal(at.x, 1160);
  assert.equal(at.y, 254 - 8 - 40);
  assert.equal(touches(at, film), false);
});

test('under the words at the top it goes down below them, as that\'s nearer than going over them', () => {
  const prompt = box(402, 135, 698, 199);
  const at = clearOf({ x: 631, y: 189 }, half, [prompt], bounds);
  assert.deepEqual(at, { x: 631, y: 199 + 8 + 40 });
});

test('behind a card that fills the middle of the screen it goes out to the side', () => {
  const card = box(340, 89, 940, 631);
  const at = clearOf({ x: 878, y: 264 }, half, [card], bounds);
  assert.deepEqual(at, { x: 940 + 8 + 60, y: 264 });
  assert.equal(touches(at, card), false);
});

test('a way out of one thing that puts it under another is not taken while there\'s a clear one', () => {
  // Going down out of the words would put it on the film: it goes up over the words instead.
  const prompt = box(700, 150, 1000, 220);
  const film = box(900, 240, 1268, 708);
  const at = clearOf({ x: 950, y: 200 }, half, [prompt, film], bounds);
  assert.equal(touches(at, prompt), false);
  assert.equal(touches(at, film), false);
  assert.deepEqual(at, { x: 950, y: 150 - 8 - 40 });
});

test('it never goes off the screen or down onto the path, and with nowhere clear it stays as near as it got', () => {
  // A card over the whole screen: nowhere to go.
  const all = box(0, 0, 1280, 720);
  const at = clearOf({ x: 600, y: 200 }, half, [all], bounds);
  assert.deepEqual(at, { x: 600, y: 200 });
  // Wanted off the screen, it's brought in.
  assert.deepEqual(clearOf({ x: 1400, y: 10 }, half, [], bounds), { x: 1220, y: 44 });
  // Something low over it, with the path just below: it goes up, not down onto the path.
  const low = box(500, 380, 700, 470);
  const up = clearOf({ x: 600, y: 400 }, half, [low], bounds);
  assert.ok(up.y <= bounds.bottom);
  assert.equal(touches(up, low), false);
});
