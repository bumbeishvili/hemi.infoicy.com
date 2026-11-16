// Several hands in front of one camera: which hand in the picture each hand being followed is, from one look of
// the tracker to the next.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { followHands as followAll, LET_GO_MS, MOST_PLAYERS, SAME_HAND_GAP } from '../../core/hand-group.js';

/** Which hand each hand being followed is now. */
const followHands = (...given) => followAll(...given).to;

/** A hand the tracker found, so far across and down the picture in frame heights, its palm so long. */
const hand = (x, y = 0.5, size = 0.1) => ({ centre: { x, y }, size });
/** A hand being followed: where it was when last seen, and when. One never seen has neither. */
const was = (x, lastSeen, y = 0.5) => ({ centre: { x, y }, lastSeen });
const NEVER = { centre: null, lastSeen: null };

test('up to four can play, and a hand is the same hand within three of its palm lengths of where it was', () => {
  assert.equal(MOST_PLAYERS, 4);
  assert.equal(SAME_HAND_GAP, 3);
  assert.equal(LET_GO_MS, 250);
});

test('to begin with, the hand nearest the camera is the hand in play and the next is the guest', () => {
  assert.deepEqual(followHands([NEVER, NEVER], [hand(0.4, 0.5, 0.08), hand(1.2, 0.5, 0.12)], 0), [1, 0]);
  // One hand alone is the hand in play, and the guest has none.
  assert.deepEqual(followHands([NEVER, NEVER], [hand(0.4)], 0), [0, -1]);
  assert.deepEqual(followHands([NEVER, NEVER], [], 0), [-1, -1]);
});

test('each hand is found where it was, whatever order the tracker lists them in', () => {
  const followed = [was(0.4, 1000), was(1.2, 1000)];
  assert.deepEqual(followHands(followed, [hand(0.42), hand(1.18)], 1050), [0, 1]);
  assert.deepEqual(followHands(followed, [hand(1.18), hand(0.42)], 1050), [1, 0]);
});

test('two hands near each other each stay themselves: the closest pair is settled first', () => {
  // Both hands are within reach of both places, and each is nearer its own.
  const followed = [was(0.6, 1000), was(0.8, 1000)];
  assert.deepEqual(followHands(followed, [hand(0.78), hand(0.63)], 1050), [1, 0]);
});

test('a hand missed for a look or two keeps its place, and a new hand elsewhere does not take it', () => {
  // The hand in play was seen 100 ms ago. A hand far from it is the guest's, not the hand in play jumping across.
  const followed = [was(0.4, 1000), NEVER];
  assert.deepEqual(followHands(followed, [hand(1.3)], 1100), [-1, 0]);
  // The same for a guest missed a moment ago: with no place free, the new hand is nobody's.
  assert.deepEqual(followHands([was(0.4, 1090), was(0.9, 1000)], [hand(0.41), hand(1.6)], 1100), [0, -1]);
});

test('a hand gone for longer lets go of its place, and the next hand to come has it, wherever it is', () => {
  const late = 1000 + LET_GO_MS + 1;
  assert.deepEqual(followHands([was(0.4, 1000), NEVER], [hand(1.3)], late), [0, -1]);
  // A guest's place too.
  assert.deepEqual(followHands([was(0.4, late - 10), was(0.9, 1000)], [hand(0.41), hand(1.6)], late), [0, 1]);
  // Exactly at the limit it still holds on.
  assert.deepEqual(followHands([was(0.4, 1000), NEVER], [hand(1.3)], 1000 + LET_GO_MS), [-1, 0]);
});

test('a hand that has moved further than three palm lengths in one look is not taken for the same hand at once', () => {
  const followed = [was(0.4, 1000)];
  assert.deepEqual(followHands(followed, [hand(0.4 + 0.1 * SAME_HAND_GAP - 0.01)], 1050), [0]);
  assert.deepEqual(followHands(followed, [hand(0.4 + 0.1 * SAME_HAND_GAP + 0.01)], 1050), [-1]);
  // A bigger hand, nearer the camera, moves further across the picture for the same move.
  assert.deepEqual(followHands(followed, [hand(0.4 + 0.1 * SAME_HAND_GAP + 0.01, 0.5, 0.2)], 1050), [0]);
});

test('when the hand in play has gone and a guest is still there, the guest is the hand in play', () => {
  const late = 1000 + LET_GO_MS + 1;
  // The guest at 1.2 is still where it was. The hand in play at 0.4 hasn't been seen for a while.
  assert.deepEqual(followHands([was(0.4, 1000), was(1.2, late - 50)], [hand(1.21)], late), [0, -1]);
  // Not before it has let go: a look or two missed, and the guest is still the guest.
  assert.deepEqual(followHands([was(0.4, 1000), was(1.2, 1050)], [hand(1.21)], 1100), [-1, 0]);
  // And with a spare hand to take, the hand in play takes that and leaves the guest alone.
  assert.deepEqual(followHands([was(0.4, 1000), was(1.2, late - 50)], [hand(1.21), hand(2.0)], late), [1, 0]);
});

test('the guest whose hand became the hand in play is named, so its place can be forgotten', () => {
  const late = 1000 + LET_GO_MS + 1;
  assert.equal(followAll([was(0.4, 1000), was(0.8, late - 50), was(1.2, late - 50)], [hand(0.81), hand(1.21)], late).heir, 1);
  // Nobody is, when the hand in play is still there, has only just been missed, or took a spare hand.
  assert.equal(followAll([was(0.4, late - 50), was(1.2, late - 50)], [hand(0.41), hand(1.21)], late).heir, -1);
  assert.equal(followAll([was(0.4, 1050), was(1.2, 1050)], [hand(1.21)], 1100).heir, -1);
  assert.equal(followAll([was(0.4, 1000), was(1.2, late - 50)], [hand(1.21), hand(2.0)], late).heir, -1);
  assert.equal(followAll([NEVER, NEVER], [], 0).heir, -1);
});

test('with more hands than places, the ones nearest the camera play and the rest are nobody', () => {
  const to = followHands([NEVER, NEVER], [hand(0.3, 0.5, 0.06), hand(0.8, 0.5, 0.11), hand(1.4, 0.5, 0.09)], 0);
  assert.deepEqual(to, [1, 2]);
});

test('four places follow four hands across a few looks, with one of them missed in the middle', () => {
  let followed = [NEVER, NEVER, NEVER, NEVER];
  const xs = [0.3, 0.7, 1.1, 1.5];
  let now = 0;
  const look = (hands) => {
    const to = followHands(followed, hands, now);
    followed = followed.map((each, f) => (to[f] >= 0 ? { centre: hands[to[f]].centre, lastSeen: now } : each));
    return to.map((h) => (h >= 0 ? Math.round(hands[h].centre.x * 10) / 10 : null));
  };
  // Biggest first to begin with, so sizes say who is who: 0.7, 1.5, 0.3, 1.1.
  const sizes = [0.09, 0.12, 0.08, 0.1];
  assert.deepEqual(look(xs.map((x, index) => hand(x, 0.5, sizes[index]))), [0.7, 1.5, 0.3, 1.1]);
  now += 50;
  // Listed the other way round, each a little further on.
  assert.deepEqual(look([...xs].reverse().map((x) => hand(x + 0.02))), [0.7, 1.5, 0.3, 1.1]);
  now += 50;
  // The tracker misses the one at 1.5 for a look.
  assert.deepEqual(look(xs.filter((x) => x !== 1.5).map((x) => hand(x + 0.04))), [0.7, null, 0.3, 1.1]);
  now += 50;
  assert.deepEqual(look(xs.map((x) => hand(x + 0.06))), [0.8, 1.6, 0.4, 1.2]);
});

/* ---------- the hand monitor with several playing: real hands from photos, placed where they're wanted ---------- */

const { HandMonitor, OPEN_RULES } = await import('../../core/hands.js');
const { FIST, FRAME_ASPECT, OPEN, feed, handAt, setup } = await import('./photo-hands.js');

/** A right hand, as everyone plays with when the hand in play is the right: so far across the screen. */
const right = (name, x, options = {}) => handAt(name, x, 0.5, { palm: 0.12, label: 'Right', ...options });
const left = (name, x, options = {}) => handAt(name, x, 0.5, { palm: 0.12, label: 'Left', ...options });
const several = (count, side = 'right') => {
  const { monitor, clock } = setup({}, side);
  monitor.setPlayers(count);
  return { monitor, clock };
};

test('as a game comes, one plays: a second right hand in the picture is nobody, and there are no guests', () => {
  const { monitor, clock } = setup({}, 'right');
  const snapshot = feed(monitor, clock, 500, [right(OPEN, 0.75), right(OPEN, 0.3)]);
  assert.equal(snapshot.players, 1);
  assert.deepEqual(snapshot.guests, []);
  assert.equal(snapshot.handOpen, true);
  // And never more than four, or fewer than one.
  monitor.setPlayers(9);
  assert.equal(monitor.players, 4);
  monitor.setPlayers(0);
  assert.equal(monitor.players, 1);
});

test('with two playing, two right hands are the hand in play and a guest, each open or closed on its own', () => {
  const { monitor, clock } = several(2);
  let snapshot = feed(monitor, clock, 500, [right(OPEN, 0.75), right(FIST, 0.3)]);
  assert.equal(snapshot.players, 2);
  assert.equal(snapshot.guests.length, 1);
  const open = [snapshot.handOpen, snapshot.guests[0].status === 'open'];
  // One of them is open and the other isn't, whichever came first.
  assert.deepEqual([...open].sort(), [false, true]);
  assert.equal(snapshot.guests[0].place, 1);
  assert.equal(snapshot.guests[0].side, 'right');
  // The fist opens, and both are.
  snapshot = feed(monitor, clock, 500, [right(OPEN, 0.75), right(OPEN, 0.3)]);
  assert.equal(snapshot.handOpen, true);
  assert.equal(snapshot.guests[0].status, 'open');
  assert.ok(snapshot.guests[0].image, 'a guest has its points, for its glove');
});

test('each stays the same hand as they move, whatever order the tracker lists them in', () => {
  const { monitor, clock } = several(2);
  feed(monitor, clock, 300, [right(OPEN, 0.75), right(FIST, 0.3)]);
  const guestIsFist = monitor.snapshot.guests[0].status !== 'open';
  // Listed the other way round, and each a little further across every look.
  for (let step = 1; step <= 10; step += 1) {
    clock.now += 50;
    monitor.update([right(FIST, 0.3 + step * 0.01), right(OPEN, 0.75 - step * 0.01)], clock.now, FRAME_ASPECT);
  }
  const snapshot = monitor.snapshot;
  assert.equal(snapshot.guests[0].status !== 'open', guestIsFist);
  assert.equal(snapshot.handOpen, guestIsFist);
});

test('everyone plays with the same hand: a hand the tracker is sure is the other one is nobody', () => {
  const { monitor, clock } = several(2);
  const snapshot = feed(monitor, clock, 500, [right(OPEN, 0.75), left(OPEN, 0.3, { confidence: () => 0.95 })]);
  assert.equal(snapshot.handOpen, true);
  assert.equal(snapshot.guests[0].status, 'missing');
  // One it isn't sure of may play: an affected hand is often the one it can't name.
  const unsure = feed(monitor, clock, 500, [right(OPEN, 0.75), left(OPEN, 0.3, { confidence: () => 0.5 })]);
  assert.equal(unsure.guests[0].status, 'open');
});

test('with the left hand in play, it is left hands that play', () => {
  const { monitor, clock } = several(2, 'left');
  const snapshot = feed(monitor, clock, 500, [left(OPEN, 0.3, { confidence: () => 0.95 }), left(OPEN, 0.75, { confidence: () => 0.95 }), right(OPEN, 0.5, { confidence: () => 0.95 })]);
  assert.equal(snapshot.side, 'left');
  assert.equal(snapshot.left.status, 'open');
  assert.equal(snapshot.guests[0].status, 'open');
  assert.equal(snapshot.guests[0].side, 'left');
});

test('when the hand in play goes and a guest is still there, the guest is the hand in play, and the game is never told a hand is missing', () => {
  const { monitor, clock } = several(2);
  feed(monitor, clock, 500, [right(OPEN, 0.75), right(OPEN, 0.3)]);
  // Whichever hand is the hand in play goes: the other is left.
  const playAt = monitor.right.centre.x / FRAME_ASPECT;
  const stays = playAt > 0.5 ? 0.3 : 0.75;
  const seen = [];
  for (let step = 0; step < 30; step += 1) {
    clock.now += 33;
    const snapshot = monitor.update([right(OPEN, stays)], clock.now, FRAME_ASPECT);
    seen.push(snapshot.handVisible);
  }
  assert.ok(seen.every(Boolean), 'the hand in play is never missing');
  const snapshot = monitor.snapshot;
  assert.equal(snapshot.handOpen, true);
  assert.equal(snapshot.guests[0].status, 'missing');
  assert.ok(Math.abs(monitor.right.centre.x / FRAME_ASPECT - stays) < 0.05, 'the hand in play is the one that stayed');
  // With no hands at all, it's missing, as ever.
  const none = feed(monitor, clock, 600, []);
  assert.equal(none.handVisible, false);
  assert.equal(none.guests[0].status, 'missing');
});

test('the place a guest had is not left behind as a second hand where the hand in play now is', () => {
  const { monitor, clock } = several(2);
  feed(monitor, clock, 500, [right(OPEN, 0.75), right(OPEN, 0.3)]);
  const stays = monitor.right.centre.x / FRAME_ASPECT > 0.5 ? 0.3 : 0.75;
  // The hand that's left is never quite still, as a real hand isn't.
  const lost = [];
  for (let step = 0; step < 60; step += 1) {
    clock.now += 33;
    const snapshot = monitor.update([right(OPEN, stays + (step % 2 ? 0.004 : -0.004))], clock.now, FRAME_ASPECT);
    if (step > 12) lost.push([snapshot.handOpen, snapshot.guests[0].status, Boolean(snapshot.guests[0].image)]);
  }
  // Once it has taken over, the hand in play has the hand in every look, and the guest has nothing.
  assert.ok(lost.every(([open, guest, seen]) => open && guest === 'missing' && !seen), JSON.stringify(lost.filter(([open, guest]) => !open || guest !== 'missing').slice(0, 3)));
});

test('hands touching each other are never open, whoever they belong to', () => {
  const { monitor, clock } = several(2);
  const snapshot = feed(monitor, clock, 500, [right(OPEN, 0.5), right(OPEN, 0.56)]);
  assert.equal(snapshot.handOpen, false);
  assert.equal(snapshot.overlap, true);
  assert.notEqual(snapshot.guests[0].status, 'open');
  assert.equal(snapshot.guests[0].reason, 'overlap');
  // A sure left hand over a guest's right hand closes it too.
  const apart = feed(monitor, clock, 500, [right(OPEN, 0.8), right(OPEN, 0.3), left(OPEN, 0.36, { confidence: () => 0.95 })]);
  const closed = [apart.right, apart.guests[0]].filter((hand) => hand.reason === 'overlap');
  assert.equal(closed.length, 1);
});

test('four play with four hands, and a fifth is nobody', () => {
  const { monitor, clock } = several(4);
  const xs = [0.15, 0.38, 0.62, 0.85];
  const snapshot = feed(monitor, clock, 500, [...xs.map((x) => right(OPEN, x, { palm: 0.09 })), right(OPEN, 0.5, { palm: 0.06 })]);
  assert.equal(snapshot.guests.length, 3);
  assert.equal(snapshot.handOpen, true);
  assert.deepEqual(snapshot.guests.map(({ status }) => status), ['open', 'open', 'open']);
  assert.deepEqual(snapshot.guests.map(({ place }) => place), [1, 2, 3]);
  // The four are the four nearest the camera: nobody has the small one in the middle.
  const places = [monitor.right, ...monitor.guests].map((hand) => Math.round((hand.centre.x / FRAME_ASPECT) * 100) / 100).sort();
  assert.deepEqual(places, xs);
});

test('a guest is as easy to please as the hand in play is set to be, and the camera going off forgets them all', () => {
  const { monitor, clock } = several(2);
  monitor.setStrictness('right', 0.7);
  assert.equal(monitor.guests[0].strictness, 0.7);
  assert.equal(monitor.snapshot.guests[0].target, Math.max(OPEN_RULES.floor, Math.min(OPEN_RULES.ceiling, OPEN_RULES.defaultBest * 0.7)));
  feed(monitor, clock, 500, [right(OPEN, 0.75), right(OPEN, 0.3)]);
  assert.equal(monitor.snapshot.guests[0].status, 'open');
  monitor.forgetHands();
  assert.equal(monitor.snapshot.guests[0].status, 'missing');
  assert.equal(monitor.snapshot.handVisible, false);
  // Back to one player, and the guests are gone.
  monitor.setPlayers(1);
  assert.deepEqual(monitor.snapshot.guests, []);
  assert.ok(new HandMonitor().snapshot.guests.length === 0);
});

test('with three playing, when the hand in play goes it is the place of the guest who took over that is cleared, and no other', () => {
  const { monitor, clock } = several(3);
  // The nearest the camera is the hand in play, and then the guests in the order of their size.
  const play = right(OPEN, 0.8, { palm: 0.14 });
  const first = right(OPEN, 0.5, { palm: 0.12 });
  const second = right(OPEN, 0.2, { palm: 0.1 });
  feed(monitor, clock, 500, [play, first, second]);
  const across = (hand) => Math.round((hand.centre.x / FRAME_ASPECT) * 10) / 10;
  assert.deepEqual([monitor.right, ...monitor.guests].map(across), [0.8, 0.5, 0.2]);
  // The first guest goes, and then the hand in play: the second guest's hand is the hand in play.
  feed(monitor, clock, 600, [play, second]);
  assert.deepEqual(monitor.snapshot.guests.map(({ status }) => status), ['missing', 'open']);
  const after = [];
  for (let step = 0; step < 60; step += 1) {
    clock.now += 33;
    const snapshot = monitor.update([right(OPEN, 0.2 + (step % 2 ? 0.004 : -0.004), { palm: 0.1 })], clock.now, FRAME_ASPECT);
    if (step > 12) after.push([snapshot.handOpen, ...snapshot.guests.map(({ status }) => status)].join());
  }
  assert.deepEqual([...new Set(after)], ['true,missing,missing']);
  assert.equal(across(monitor.right), 0.2);
});

test('one hand the tracker reports twice is one hand: the second sighting is not a second player', () => {
  const { monitor, clock } = several(2);
  const snapshot = feed(monitor, clock, 500, [right(OPEN, 0.5), right(OPEN, 0.505, { confidence: () => 0.8 })]);
  assert.equal(snapshot.handOpen, true);
  assert.equal(snapshot.overlap, false);
  assert.equal(snapshot.guests[0].status, 'missing');
});

test('a hand shape chosen for the game\'s move is the shape for everyone, whenever they join', async () => {
  const { shapesFor } = await import('../../core/shapes.js');
  const pointing = (x) => right('pointing_up', x);
  // Chosen before anyone else is playing, and after.
  for (const order of ['shape first', 'players first']) {
    const { monitor, clock } = setup({}, 'right');
    if (order === 'shape first') monitor.setShapes(shapesFor({ open: 'point' }));
    monitor.setPlayers(2);
    if (order === 'players first') monitor.setShapes(shapesFor({ open: 'point' }));
    let snapshot = feed(monitor, clock, 700, [pointing(0.75), pointing(0.3)]);
    assert.equal(snapshot.handOpen, true, order);
    assert.equal(snapshot.guests[0].status, 'open', order);
    assert.equal(snapshot.guests[0].shape, 'point', order);
    // An open hand isn't that shape, for either of them.
    snapshot = feed(monitor, clock, 700, [right(OPEN, 0.75), right(OPEN, 0.3)]);
    assert.equal(snapshot.handOpen, false, order);
    assert.equal(snapshot.guests[0].status, 'closed', order);
  }
});

test('when a grown-up changes which hand is in play, it changes for everyone', () => {
  const { monitor, clock } = several(2);
  feed(monitor, clock, 500, [right(OPEN, 0.75), right(OPEN, 0.3)]);
  monitor.setSide('left');
  assert.equal(monitor.snapshot.guests[0].side, 'left');
  assert.equal(monitor.snapshot.guests[0].status, 'missing');
  // Right hands don't play any more, and left hands do.
  const sure = { confidence: () => 0.95 };
  let snapshot = feed(monitor, clock, 500, [right(OPEN, 0.75, sure), right(OPEN, 0.3, sure)]);
  assert.equal(snapshot.handVisible, false);
  assert.equal(snapshot.guests[0].status, 'missing');
  snapshot = feed(monitor, clock, 500, [left(OPEN, 0.75, sure), left(OPEN, 0.3, sure)]);
  assert.equal(snapshot.left.status, 'open');
  assert.equal(snapshot.guests[0].status, 'open');
});
