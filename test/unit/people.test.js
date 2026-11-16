// Several people in front of one camera: keeping them apart from one look of the tracker to the next.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acrossOf, MOST_PEOPLE, People, tallOf } from '../../core/body/people.js';

/**
 * A body as the tracker reports it, standing so far across the screen (0 at its left, 1 at its right) and so tall
 * in the picture. The picture itself is the other way across from the screen, which shows it as a mirror does.
 */
function bodyAt(across, tall = 0.5, name = '') {
  const image = Array.from({ length: 33 }, () => ({ x: 1 - across, y: 0.5, z: 0, visibility: 1 }));
  for (const index of [11, 12]) image[index] = { x: 1 - across, y: 0.8 - tall, z: 0, visibility: 1 };
  for (const index of [23, 24]) image[index] = { x: 1 - across + (index === 23 ? 0.02 : -0.02), y: 0.8 - tall * 0.5, z: 0, visibility: 1 };
  for (const index of [27, 28]) image[index] = { x: 1 - across, y: 0.8, z: 0, visibility: 1 };
  return { image, world: image, name };
}
const names = (bodies) => bodies.map((body) => body?.name ?? null);

test('where a body is across the screen is the mirror of where it is in the picture, and how tall it is goes from shoulders to ankles', () => {
  const body = bodyAt(0.2, 0.4);
  assert.ok(Math.abs(acrossOf(body) - 0.2) < 1e-9);
  assert.ok(Math.abs(tallOf(body) - 0.4) < 1e-9);
});

test('one player is whoever the camera sees, and nobody when it sees no one', () => {
  const people = new People(1);
  assert.deepEqual(people.assign([], 0), [null]);
  assert.deepEqual(names(people.assign([bodyAt(0.5, 0.5, 'ana')], 0.1)), ['ana']);
  assert.deepEqual(people.assign([], 0.2), [null]);
  assert.equal(new People(0).count, 1);
  assert.equal(new People(9).count, MOST_PEOPLE);
});

test('two players are taken left to right across the screen, once both are in the picture, whatever order the tracker lists them in', () => {
  const people = new People(2);
  // One of them isn't there yet: nobody is anyone.
  assert.deepEqual(people.assign([bodyAt(0.7, 0.5, 'ben')], 0), [null, null]);
  assert.equal(people.placed, false);
  assert.deepEqual(names(people.assign([bodyAt(0.7, 0.5, 'ben'), bodyAt(0.3, 0.5, 'ana')], 0.1)), ['ana', 'ben']);
  assert.equal(people.placed, true);
  // The tracker's order changes from look to look. The players don't.
  for (let look = 0; look < 20; look += 1) {
    const bodies = [bodyAt(0.3, 0.5, 'ana'), bodyAt(0.7, 0.5, 'ben')];
    if (look % 2) bodies.reverse();
    assert.deepEqual(names(people.assign(bodies, 0.2 + look * 0.03)), ['ana', 'ben']);
  }
});

test('each player stays themselves as they move about, even right across to the other side', () => {
  const people = new People(2);
  people.assign([bodyAt(0.3, 0.5, 'ana'), bodyAt(0.7, 0.5, 'ben')], 0);
  // Ana walks over to the right, behind Ben, a little at a time, and Ben over to the left.
  for (let step = 1; step <= 30; step += 1) {
    const ana = 0.3 + step * 0.02;
    const ben = 0.7 - step * 0.015;
    assert.deepEqual(names(people.assign([bodyAt(ben, 0.5, 'ben'), bodyAt(ana, 0.5, 'ana')], step * 0.033)), ['ana', 'ben'], `step ${step}`);
  }
});

test('one who walks behind the other to the far side, hidden for a moment on the way, is still themselves', () => {
  const people = new People(2);
  // Ana is nearer the camera, so taller in the picture. Ben, further off, walks across behind her.
  people.assign([bodyAt(0.4, 0.55, 'ana'), bodyAt(0.7, 0.4, 'ben')], 0);
  let time = 0;
  for (let ben = 0.7; ben > 0.1; ben -= 0.02) {
    time += 0.033;
    // Close behind her, the camera can't see him at all.
    const hidden = Math.abs(ben - 0.4) < 0.05;
    const bodies = hidden ? [bodyAt(0.4, 0.55, 'ana')] : [bodyAt(ben, 0.4, 'ben'), bodyAt(0.4, 0.55, 'ana')];
    assert.deepEqual(names(people.assign(bodies, time)), hidden ? ['ana', null] : ['ana', 'ben'], `Ben at ${ben.toFixed(2)}`);
  }
});

test('two who step past each other between two looks are told apart by how tall each is in the picture', () => {
  const people = new People(2);
  // Ana is nearer the camera, so taller in the picture, and Ben stands just beside her, further off.
  people.assign([bodyAt(0.4, 0.55, 'ana'), bodyAt(0.5, 0.4, 'ben')], 0);
  // A look later each is a little past where the other was: going by places alone, they'd have changed over.
  assert.deepEqual(names(people.assign([bodyAt(0.44, 0.4, 'ben'), bodyAt(0.46, 0.55, 'ana')], 0.5)), ['ana', 'ben']);
});

test('a player the camera loses for a moment is nobody for that moment, and the other is still themselves', () => {
  const people = new People(2);
  people.assign([bodyAt(0.3, 0.5, 'ana'), bodyAt(0.7, 0.5, 'ben')], 0);
  assert.deepEqual(names(people.assign([bodyAt(0.7, 0.5, 'ben')], 0.1)), [null, 'ben']);
  assert.deepEqual(names(people.assign([bodyAt(0.31, 0.5, 'ana')], 0.2)), ['ana', null]);
  assert.deepEqual(names(people.assign([bodyAt(0.31, 0.5, 'ana'), bodyAt(0.69, 0.5, 'ben')], 0.3)), ['ana', 'ben']);
});

test('someone who steps out of the picture and comes back somewhere else is themselves again, though not at once', () => {
  const people = new People(2);
  people.assign([bodyAt(0.3, 0.5, 'ana'), bodyAt(0.7, 0.5, 'ben')], 0);
  // Ana is gone, and a moment later a body turns up far from where she was: too soon to be her.
  assert.deepEqual(names(people.assign([bodyAt(0.7, 0.5, 'ben')], 0.1)), [null, 'ben']);
  assert.deepEqual(names(people.assign([bodyAt(0.7, 0.5, 'ben'), bodyAt(0.95, 0.5, 'ana')], 0.3)), [null, 'ben']);
  // After she's been gone a while, it's her, wherever she comes back.
  assert.deepEqual(names(people.assign([bodyAt(0.7, 0.5, 'ben'), bodyAt(0.95, 0.5, 'ana')], 0.8)), ['ana', 'ben']);
  // And from then on that's where she is.
  assert.deepEqual(names(people.assign([bodyAt(0.93, 0.5, 'ana'), bodyAt(0.7, 0.5, 'ben')], 0.9)), ['ana', 'ben']);
});

test('to begin with, the players are whoever is nearest the camera: someone further off in the picture is nobody', () => {
  const people = new People(2);
  const bodies = [bodyAt(0.5, 0.25, 'someone at the back'), bodyAt(0.75, 0.5, 'ben'), bodyAt(0.2, 0.55, 'ana')];
  assert.deepEqual(names(people.assign(bodies, 0)), ['ana', 'ben']);
  // And they stay nobody while both players are in view.
  for (let look = 1; look < 10; look += 1) assert.deepEqual(names(people.assign(bodies, look * 0.05)), ['ana', 'ben']);
});

test('a body that turns up a long way from a player between two looks isn\'t taken for them', () => {
  const people = new People(1);
  people.assign([bodyAt(0.2, 0.5, 'ana')], 0);
  assert.deepEqual(names(people.assign([bodyAt(0.8, 0.5, 'someone else')], 0.05)), [null]);
  // Up to a fifth of the picture's width is still them.
  assert.deepEqual(names(people.assign([bodyAt(0.38, 0.5, 'ana')], 0.1)), ['ana']);
});

test('four players are kept apart, and forgetting them takes whoever is there afresh', () => {
  const people = new People(4);
  const stand = (shift = 0) => [bodyAt(0.62 + shift, 0.5, 'c'), bodyAt(0.12 + shift, 0.5, 'a'), bodyAt(0.88 + shift, 0.5, 'd'), bodyAt(0.38 + shift, 0.5, 'b')];
  assert.deepEqual(names(people.assign(stand(), 0)), ['a', 'b', 'c', 'd']);
  for (let look = 1; look <= 10; look += 1) assert.deepEqual(names(people.assign(stand(look * 0.005).reverse(), look * 0.04)), ['a', 'b', 'c', 'd']);
  // Only three of them in view: each is still themselves, and the fourth is nobody.
  assert.deepEqual(names(people.assign(stand(0.05).filter((body) => body.name !== 'b'), 0.5)), ['a', null, 'c', 'd']);
  people.forget();
  assert.equal(people.placed, false);
  assert.deepEqual(names(people.assign([bodyAt(0.9, 0.5, 'z'), bodyAt(0.6, 0.5, 'y'), bodyAt(0.3, 0.5, 'x'), bodyAt(0.1, 0.5, 'w')], 1)), ['w', 'x', 'y', 'z']);
});
