// Two playing in one picture on one screen (see OWN_VIEW in core/seat.js): while they play, the first player's game
// is across the whole screen, with the other player in it as a friend is, and the second player's game goes on
// under it. What each player has of their own stays in their own half of the screen, just where and as big as it was
// while each got ready there: the camera's picture of them, the move their coach shows them, and what they're
// told. The second player's come through holes in the first one's game, from their own game under it, and the first
// player's are moved into the left half, to the mirror image of where the same things are in the right half, so the
// two halves face each other across the middle. See together.js. While this is so, the first game's page has
// data-picture="one" and the others' data-picture="under", for a game to lay out its own things for it.

/**
 * A player's own things, in every game: the camera's picture of them, what they're told, the coach's film of the
 * move, the moves they've made, and how their hands are read. A game can mark more of its own with data-own.
 */
export const OWN = '.camera-frame, #prompt, #coach, .tally, .hands-bar, [data-own]';

// Sizes in a player's own things that go by the screen's width, each with something as wide as it.
const SIZES = [['.meter', '--meter-size']];

const round = (value) => Math.round(value * 10) / 10;

/** A box with rounded corners, as a path that goes round it the same way as every other. */
function around({ x, y, w, h, r = 0 }) {
  const [left, top, wide, high] = [x, y, w, h].map(round);
  const bend = round(Math.max(0, Math.min(r, w / 2, h / 2)));
  const arc = (dx, dy) => (bend ? `a${bend} ${bend} 0 0 1 ${round(dx)} ${round(dy)}` : '');
  return `M${round(left + bend)} ${top}h${round(wide - 2 * bend)}${arc(bend, bend)}v${round(high - 2 * bend)}${arc(-bend, bend)}h${round(2 * bend - wide)}${arc(-bend, -bend)}v${round(2 * bend - high)}${arc(bend, -bend)}Z`;
}

/**
 * The first player's game, so wide and high, with holes for the boxes, [{ x, y, w, h, r }] in its own pixels, as a
 * clip-path: the other player's own things show through them. '' with no holes.
 */
export function withHoles(width, height, boxes) {
  if (!boxes.length) return '';
  return `path(evenodd, '${[{ x: 0, y: 0, w: width, h: height }, ...boxes].map(around).join(' ')}')`;
}

/**
 * Where an element is seen, as boxes { x, y, w, h, r }: its own, or, for one that only holds others and shows
 * nothing itself, such as a row of meters, each of theirs, so a hole for it is no wider than what's in it.
 */
function shownBoxes(element) {
  const style = element.ownerDocument.defaultView.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.02) return [];
  const box = element.getBoundingClientRect();
  if (box.width < 2 || box.height < 2) return [];
  const bare = style.backgroundColor === 'rgba(0, 0, 0, 0)' && style.backgroundImage === 'none' && style.boxShadow === 'none' && !parseFloat(style.borderTopWidth);
  if (bare && element.children.length) return [...element.children].flatMap(shownBoxes);
  if (bare && !element.textContent.trim()) return [];
  return [{ x: box.left, y: box.top, w: box.width, h: box.height, r: parseFloat(style.borderTopLeftRadius) || 0 }];
}

/** The same thing in each game: by its id if it has one, or else by where it comes among them. */
function sameIn(doc, element, index, all) {
  if (element.id) return doc.getElementById(element.id);
  return [...doc.querySelectorAll(OWN)].filter((each) => !each.id)[all.filter((each) => !each.id).indexOf(element)] ?? null;
}

/**
 * Keeps each player's own things in their own half while they play in one picture, every frame, for the seats
 * shown left to right. one() says whether they're in one picture just now.
 */
export function keepOwnThings(seats, one) {
  let was = false;
  let cut = '';
  const tick = () => {
    requestAnimationFrame(tick);
    const [first, ...rest] = seats;
    const mine = first.contentDocument;
    if (!mine?.documentElement) return;
    const now = one();
    if (!now) {
      if (was) {
        delete mine.documentElement.dataset.picture;
        for (const seat of rest) if (seat.contentDocument?.documentElement) delete seat.contentDocument.documentElement.dataset.picture;
        for (const [, size] of SIZES) mine.documentElement.style.removeProperty(size);
        first.style.clipPath = '';
        cut = '';
      }
      was = false;
      return;
    }
    was = true;
    mine.documentElement.dataset.picture = 'one';
    // The other games know they're under it, for a game to lay out what a player has of their own for it.
    for (const seat of rest) if (seat.contentDocument?.documentElement) seat.contentDocument.documentElement.dataset.picture = 'under';
    const holes = [];
    for (const seat of rest) {
      const theirs = seat.contentDocument;
      if (!theirs?.documentElement) continue;
      const at = seat.getBoundingClientRect();
      const all = [...theirs.querySelectorAll(OWN)];
      for (const [index, element] of all.entries()) {
        for (const box of shownBoxes(element)) holes.push({ ...box, x: box.x + at.left, y: box.y + at.top });
        // The first player's own thing goes where the second player's is in their half, but mirrored, so that the
        // two sides of the screen face each other: what's at the outer edge of one is at the outer edge of the other.
        if (seat !== rest[0]) continue;
        const own = sameIn(mine, element, index, all);
        if (!own) continue;
        const where = element.getBoundingClientRect();
        // One the second player doesn't have just now, such as a film they no longer need, says nothing about where
        // the first player's goes: it stays where it was.
        if (!where.width && !where.height) continue;
        const half = seat.clientWidth;
        own.style.setProperty('--own-left', `${round(half - where.right)}px`);
        own.style.setProperty('--own-middle', `${round(half - where.left - where.width / 2)}px`);
        own.style.setProperty('--own-top', `${round(where.top)}px`);
        own.style.setProperty('--own-width', `${round(where.width)}px`);
        own.style.setProperty('--own-height', `${round(where.height)}px`);
      }
    }
    // Sizes set by the width of the screen, as the second player's game has them in its half.
    const theirs = rest[0]?.contentDocument;
    for (const [selector, size] of SIZES) {
      const there = [...(theirs?.querySelectorAll(selector) ?? [])].find((each) => each.offsetWidth);
      if (there) mine.documentElement.style.setProperty(size, `${there.offsetWidth}px`);
    }
    const clip = withHoles(first.clientWidth, first.clientHeight, holes);
    if (clip !== cut) first.style.clipPath = clip;
    cut = clip;
  };
  requestAnimationFrame(tick);
}
