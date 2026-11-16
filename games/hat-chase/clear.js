// Keeping something drawn in the picture clear of what sits on top of it: the cards, the coach's film, the words
// at the top. Those are different sizes in different windows, and come and go, so where the magpie flies is worked
// out from where they are now. No screen in this file, so it runs in the unit tests.

/**
 * Where to draw something so that none of the covers is over it, as near as can be to where it would be.
 * wanted is { x, y }, its middle. half is { w, h }, half its width and height. covers is a list of boxes,
 * each { left, top, right, bottom }. bounds is the box its middle has to stay in, and pad the room to leave
 * around each cover. If there's nowhere clear, it's left as near to clear as it got.
 */
export function clearOf(wanted, half, covers, bounds, pad = 8) {
  const over = (x, y) => covers.filter((cover) => x + half.w > cover.left - pad && x - half.w < cover.right + pad && y + half.h > cover.top - pad && y - half.h < cover.bottom + pad);
  const inside = ({ x, y }) => x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
  let at = { x: Math.min(bounds.right, Math.max(bounds.left, wanted.x)), y: Math.min(bounds.bottom, Math.max(bounds.top, wanted.y)) };
  for (let tries = 0; tries < 4; tries += 1) {
    const [cover] = over(at.x, at.y);
    if (!cover) break;
    // Just above it, just below it, or just to either side: whichever is nearest where it was wanted, and best
    // of all one that's clear of everything else too.
    const moves = [
      { x: at.x, y: cover.top - pad - half.h },
      { x: at.x, y: cover.bottom + pad + half.h },
      { x: cover.left - pad - half.w, y: at.y },
      { x: cover.right + pad + half.w, y: at.y },
    ].filter(inside);
    if (!moves.length) break;
    const cost = (move) => Math.hypot(move.x - wanted.x, move.y - wanted.y) + over(move.x, move.y).length * 100000;
    moves.sort((a, b) => cost(a) - cost(b));
    [at] = moves;
  }
  return at;
}
