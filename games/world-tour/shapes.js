// The shapes a flag is made of, in the flag's own units: 100 high, and as wide as its proportions make it, with
// 0, 0 at the top left. There's no screen in here, so the rules and the unit tests can ask where a shape is, and
// the screen draws the same shapes with the same numbers.
//
//   { type: 'rect', x, y, w, h }
//   { type: 'poly', points: [[x, y], ...] }                  a simple outline, such as a triangle or a cross
//   { type: 'circle', x, y, r }
//   { type: 'star', x, y, r, points, inner, turn }           r to its points, inner the share of r to its dents,
//                                                            and turn in degrees, 0 with one point straight up
//   { type: 'crescent', x, y, r, cut: { x, y, r } }          a disc with another disc cut out of it
const RAD = Math.PI / 180;

/** The corners of a star, as [x, y] pairs, starting from its top point and going round clockwise. */
export function starPoints({ x, y, r, points = 5, inner = 0.382, turn = 0 }) {
  const corners = [];
  for (let n = 0; n < points * 2; n += 1) {
    const angle = (turn - 90) * RAD + (n * Math.PI) / points;
    const reach = n % 2 ? r * inner : r;
    corners.push([x + Math.cos(angle) * reach, y + Math.sin(angle) * reach]);
  }
  return corners;
}

/** The outline of a shape, as [x, y] pairs, for the shapes that have corners. */
export function cornersOf(shape) {
  if (shape.type === 'rect') return [[shape.x, shape.y], [shape.x + shape.w, shape.y], [shape.x + shape.w, shape.y + shape.h], [shape.x, shape.y + shape.h]];
  if (shape.type === 'poly') return shape.points;
  if (shape.type === 'star') return starPoints(shape);
  return null;
}

function insideCorners(corners, x, y) {
  let inside = false;
  for (let n = 0, last = corners.length - 1; n < corners.length; last = n, n += 1) {
    const [ax, ay] = corners[n];
    const [bx, by] = corners[last];
    if ((ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

/** Whether a place on the flag is in a shape. */
export function inShape(shape, x, y) {
  if (shape.type === 'rect') return x >= shape.x && x < shape.x + shape.w && y >= shape.y && y < shape.y + shape.h;
  if (shape.type === 'circle') return Math.hypot(x - shape.x, y - shape.y) <= shape.r;
  if (shape.type === 'crescent') return Math.hypot(x - shape.x, y - shape.y) <= shape.r && Math.hypot(x - shape.cut.x, y - shape.cut.y) > shape.cut.r;
  return insideCorners(cornersOf(shape), x, y);
}

/** The box a shape fits in: { left, top, right, bottom }. */
export function boxOf(shape) {
  if (shape.type === 'circle' || shape.type === 'crescent') return { left: shape.x - shape.r, top: shape.y - shape.r, right: shape.x + shape.r, bottom: shape.y + shape.r };
  const corners = cornersOf(shape);
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

/** Adds a shape to the path being drawn, on a canvas whose units are the flag's. */
export function trace(ctx, shape) {
  if (shape.type === 'circle') {
    ctx.moveTo(shape.x + shape.r, shape.y);
    ctx.arc(shape.x, shape.y, shape.r, 0, Math.PI * 2);
    return;
  }
  if (shape.type === 'crescent') {
    // The disc one way round and the cut the other, so that filling by the nonzero rule leaves the cut out.
    ctx.moveTo(shape.x + shape.r, shape.y);
    ctx.arc(shape.x, shape.y, shape.r, 0, Math.PI * 2);
    ctx.moveTo(shape.cut.x + shape.cut.r, shape.cut.y);
    ctx.arc(shape.cut.x, shape.cut.y, shape.cut.r, 0, Math.PI * 2, true);
    return;
  }
  const corners = cornersOf(shape);
  ctx.moveTo(corners[0][0], corners[0][1]);
  for (const [x, y] of corners.slice(1)) ctx.lineTo(x, y);
  ctx.closePath();
}

/** Whether a place on the flag is in any of a part's shapes. */
export const inPart = (part, x, y) => part.shapes.some((shape) => inShape(shape, x, y));
