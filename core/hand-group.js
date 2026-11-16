// Several playing a hand game in front of one camera, each with a hand of their own. The tracker says where the
// hands in the picture are, in no particular order, and that order can change from one look to the next. This
// keeps them apart: each hand being followed is looked for where it was, and one that has gone lets go of its
// place for the next hand to come. No screen or camera in this file, so it runs in the unit tests.
//
// The first hand followed is the hand in play, the one the rest of the game knows about: its check, its prompts,
// its meter. The others are guests. Nobody is told apart by anything but where their hand is, so the hand in
// play is whoever's hand got there first, and if it goes while a guest's is still there, the guest's is the hand
// in play from then on. That way a game is only ever asked for a hand when there are none at all.

/** The most that can play a hand game at one camera. */
export const MOST_PLAYERS = 4;
/** How far a hand may be from where it was a look ago and still be the same hand, in its own palm lengths. */
export const SAME_HAND_GAP = 3;
/** A hand not seen for this long lets go of its place, as a hand rides out a look or two that missed it. */
export const LET_GO_MS = 250;

const far = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Which hand in the picture each hand being followed is now. followed is a list of { centre, lastSeen }, the
 * hand in play first: where each was when last seen, in frame heights, and when, or null for one never seen.
 * hands is what the tracker found that may play, each { centre, size }. Returns { to, heir }: to is a list as
 * long as followed, with the number of each one's hand in hands, or -1 for none, and heir is which guest's hand
 * has just become the hand in play, or -1. That guest's place is to be forgotten, or it would go on being
 * looked for where the hand in play now is.
 */
export function followHands(followed, hands, now) {
  const to = followed.map(() => -1);
  const taken = new Set();
  // Each to the hand nearest where it was, the closest pairs first.
  const pairs = [];
  followed.forEach((each, f) => {
    if (!each.centre || each.lastSeen === null) return;
    hands.forEach((hand, h) => {
      const gap = far(each.centre, hand.centre);
      if (gap <= SAME_HAND_GAP * hand.size) pairs.push({ f, h, gap });
    });
  });
  pairs.sort((a, b) => a.gap - b.gap);
  for (const { f, h } of pairs) {
    if (to[f] >= 0 || taken.has(h)) continue;
    to[f] = h;
    taken.add(h);
  }
  // A place whose hand has gone is for the next hand to come, the hand in play's first, and of several hands
  // the one nearest the camera.
  const letGo = (each) => each.lastSeen === null || now - each.lastSeen > LET_GO_MS;
  const spare = hands.map((_, h) => h).filter((h) => !taken.has(h)).sort((a, b) => hands[b].size - hands[a].size);
  followed.forEach((each, f) => {
    if (to[f] >= 0 || !spare.length || !letGo(each)) return;
    to[f] = spare.shift();
  });
  // With no hand in play and none spare, a guest's hand is the hand in play.
  let heir = -1;
  if (followed.length && to[0] < 0 && letGo(followed[0])) {
    heir = to.findIndex((hand, f) => f > 0 && hand >= 0);
    if (heir > 0) {
      to[0] = to[heir];
      to[heir] = -1;
    }
  }
  return { to, heir };
}
