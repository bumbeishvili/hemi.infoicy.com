// Giraffe's Riddle Doors: how a picture in a riddle is drawn, from what riddles.js says it is. Each is drawn in the
// middle of a square, size pixels wide, at (0, 0), with a dark outline round everything, so even the yellow reads on
// the paper. A riddle where colour is the rule asks for its colours to be told apart, which red and green may not be
// for a child who sees colour differently: see the readme.
import { INK } from '../../core/glove.js';
import { STICK_ENDS } from './riddles.js';

export const PAINT = {
  red: '#e63946',
  blue: '#3a86ff',
  yellow: '#ffbe0b',
  green: '#2a9d4b',
  purple: '#9b5de5',
};

// How big one shape is, as a share of the square, for each size when it's on its own, and when there are more of them.
const ALONE = [0.36, 0.56, 0.8];
const MANY = { 2: 0.38, 3: 0.34, 4: 0.32, 5: 0.27 };
// Where each of several goes, as shares of the square from its middle.
const SPOTS = {
  1: [[0, 0]],
  2: [[-0.22, 0], [0.22, 0]],
  3: [[0, -0.2], [-0.22, 0.18], [0.22, 0.18]],
  4: [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]],
  5: [[-0.24, -0.24], [0.24, -0.24], [0, 0], [-0.24, 0.24], [0.24, 0.24]],
};

/** A shape's outline, d across, with its middle at (0, 0). */
export function shapePath(shape, d) {
  const r = d / 2;
  const path = new Path2D();
  switch (shape) {
    case 'square':
      path.roundRect(-r * 0.86, -r * 0.86, r * 1.72, r * 1.72, r * 0.16);
      break;
    case 'triangle':
      path.moveTo(0, -r);
      path.lineTo(r * 0.98, r * 0.78);
      path.lineTo(-r * 0.98, r * 0.78);
      path.closePath();
      break;
    case 'star':
      for (let at = 0; at < 10; at += 1) {
        const angle = -Math.PI / 2 + (at * Math.PI) / 5;
        const reach = at % 2 ? r * 0.44 : r;
        path.lineTo(Math.cos(angle) * reach, Math.sin(angle) * reach + r * 0.08);
      }
      path.closePath();
      break;
    case 'heart':
      path.moveTo(0, r * 0.86);
      path.bezierCurveTo(-r * 1.25, r * 0.05, -r * 0.85, -r * 1.05, 0, -r * 0.42);
      path.bezierCurveTo(r * 0.85, -r * 1.05, r * 1.25, r * 0.05, 0, r * 0.86);
      path.closePath();
      break;
    case 'diamond':
      path.moveTo(0, -r);
      path.lineTo(r * 0.78, 0);
      path.lineTo(0, r);
      path.lineTo(-r * 0.78, 0);
      path.closePath();
      break;
    default:
      path.arc(0, 0, r * 0.94, 0, Math.PI * 2);
  }
  return path;
}

function fillShape(ctx, shape, d, colour, line) {
  const path = shapePath(shape, d);
  ctx.fillStyle = PAINT[colour] ?? colour;
  ctx.fill(path);
  ctx.strokeStyle = INK;
  ctx.lineWidth = line;
  ctx.lineJoin = 'round';
  ctx.stroke(path);
}

/** An arrow, turn eighths of the way round from pointing up. */
function drawArrow(ctx, cell, size) {
  const s = size * 0.4;
  ctx.save();
  ctx.rotate((cell.turn * Math.PI) / 4);
  const path = new Path2D();
  path.moveTo(0, -s);
  path.lineTo(s * 0.62, -s * 0.18);
  path.lineTo(s * 0.24, -s * 0.18);
  path.lineTo(s * 0.24, s * 0.9);
  path.lineTo(-s * 0.24, s * 0.9);
  path.lineTo(-s * 0.24, -s * 0.18);
  path.lineTo(-s * 0.62, -s * 0.18);
  path.closePath();
  ctx.fillStyle = PAINT[cell.colour];
  ctx.fill(path);
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(2, size * 0.028);
  ctx.lineJoin = 'round';
  ctx.stroke(path);
  ctx.restore();
}

/** Sticks on a faint square of dots, so where each one is can be seen. */
function drawSticks(ctx, cell, size) {
  const reach = size * 0.3;
  ctx.fillStyle = 'rgb(18 48 77 / 0.2)';
  for (const y of [-1, 0, 1]) {
    for (const x of [-1, 0, 1]) {
      ctx.beginPath();
      ctx.arc(x * reach, y * reach, Math.max(1.5, size * 0.018), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.lineCap = 'round';
  const wide = Math.max(4, size * 0.075);
  for (const [colour, width] of [[INK, wide + Math.max(3, size * 0.03)], [PAINT[cell.colour], wide]]) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.beginPath();
    STICK_ENDS.forEach(([ax, ay, bx, by], at) => {
      if (!(cell.sticks & (1 << at))) return;
      ctx.moveTo(ax * reach, ay * reach);
      ctx.lineTo(bx * reach, by * reach);
    });
    ctx.stroke();
  }
}

/** An outline, with a small shape inside it. */
function drawNest(ctx, cell, size) {
  const path = shapePath(cell.outer, size * 0.84);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(5, size * 0.085);
  ctx.stroke(path);
  ctx.strokeStyle = PAINT[cell.colour];
  ctx.lineWidth = Math.max(3, size * 0.05);
  ctx.stroke(path);
  ctx.save();
  // A triangle's middle is low down in it, so what's inside sits a little lower, where there's room.
  if (cell.outer === 'triangle') ctx.translate(0, size * 0.08);
  fillShape(ctx, cell.inner, size * (cell.outer === 'triangle' ? 0.24 : 0.3), cell.colour, Math.max(1.5, size * 0.022));
  ctx.restore();
}

/** One picture of a riddle, size pixels across, in the middle of where the context is. */
export function drawCell(ctx, cell, size) {
  if (!cell) return;
  ctx.save();
  switch (cell.look) {
    case 'arrow':
      drawArrow(ctx, cell, size);
      break;
    case 'sticks':
      drawSticks(ctx, cell, size);
      break;
    case 'nest':
      drawNest(ctx, cell, size);
      break;
    default: {
      const d = (cell.count > 1 ? MANY[cell.count] : ALONE[cell.size ?? 1]) * size;
      for (const [x, y] of SPOTS[cell.count] ?? SPOTS[1]) {
        ctx.save();
        ctx.translate(x * size, y * size);
        fillShape(ctx, cell.shape, d, cell.colour, Math.max(1.5, size * 0.024));
        ctx.restore();
      }
    }
  }
  ctx.restore();
}
