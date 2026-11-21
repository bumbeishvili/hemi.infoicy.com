// Giraffe's Puzzles, drawn in 2D: Giraffe's playroom, with his easel in the middle and the empty picture frame on it,
// a cork board at each side where the loose pieces lie, Giraffe looking over the top of the easel, and the child's
// glove in front of it all. puzzle.js says where everything is, in table units, and this fits the table under the
// band along the top of the screen.
//
// Nothing flashes: a piece is a small part of the screen, pictures fade in and out rather than cutting, a piece going
// in is a few small stars, and whatever comes and goes fades or grows.
import { INK, SECOND_PLAYER, inOnePicture, secondPlayerLook } from '../../core/glove.js';
import { EXTRAS, LABELS, TABLE } from './puzzle.js';
import { drawPicture, PICTURE } from './pictures.js';

const LABEL_SECONDS = 2.6;
const PRIZE_FLY_SECONDS = 0.9;
const FADE_SECONDS = 0.7; // How long a picture, or its pieces, take to come and go.
const SETTLE_SECONDS = 0.16; // How long a piece takes to slide the last little way into its place.
const KNOB = 0.22; // How big a jigsaw piece's knob is, as a share of the piece's shorter side.
const MARGIN = 8; // Round the table, in pixels.
const PALM = 0.075; // The glove's palm, in table units.
// Giraffe, behind the easel: how tall his body is without his neck, in table units, and how far down the table the
// tips of his horns are. The rest of him is behind the picture.
export const GIRAFFE = { tall: 0.4, top: 0.02 };
const HEAD_ABOVE_FEET = 1.31; // How far above his feet the tips of his horns are, in body heights.
const CHEER_HOP = 0.16 / 2.05; // How far up he hops in his cheering picture, in body heights: see POSES in giraffe-maze/walkers.js.
const MARKS = { star: '⭐', gem: '💎', magnet: '🧲', eyes: '👀' };
const COLOURS = {
  wall: '#d7ebf7',
  wallDot: '#c9e1f0',
  floor: '#e6c594',
  floorLine: '#d3ad76',
  cork: '#e9cfa2',
  corkSpeck: '#dcbd8a',
  wood: '#c08a50',
  woodDark: '#9b6a3a',
  paper: '#fff8e8',
  held: '#3ddc84',
  gold: '#f5b301',
};
const FRIEND_GLOVE = { fill: '#e3e8ee', ink: '#9aa8b6' };

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const ease = (share) => share * share * (3 - 2 * share);

/** A small picture from an emoji, drawn once. */
function makeMark(mark) {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.font = '124px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(mark, 80, 88);
  return canvas;
}

/**
 * One side of a piece, from (ax, ay) to (bx, by) going clockwise round it: straight, or with a knob that sticks
 * out, or a hole the same shape going in. knob is how big, in pixels.
 */
function side(path, ax, ay, bx, by, tab, knob) {
  if (!tab) {
    path.lineTo(bx, by);
    return;
  }
  const length = Math.hypot(bx - ax, by - ay);
  const [dx, dy] = [(bx - ax) / length, (by - ay) / length];
  // Out from the piece for a knob, and into it for a hole.
  const [nx, ny] = [dy * tab, -dx * tab];
  const [cx, cy] = [(ax + bx) / 2, (ay + by) / 2];
  const at = (along, out) => [cx + (dx * along + nx * out) * knob, cy + (dy * along + ny * out) * knob];
  path.lineTo(...at(-0.26, 0));
  path.bezierCurveTo(...at(-0.1, 0), ...at(-0.1, 0.22), ...at(-0.2, 0.34));
  path.bezierCurveTo(...at(-0.3, 0.42), ...at(-0.46, 0.5), ...at(-0.42, 0.66));
  path.bezierCurveTo(...at(-0.42, 0.86), ...at(-0.22, 1), ...at(0, 1));
  path.bezierCurveTo(...at(0.22, 1), ...at(0.42, 0.86), ...at(0.42, 0.66));
  path.bezierCurveTo(...at(0.46, 0.5), ...at(0.3, 0.42), ...at(0.2, 0.34));
  path.bezierCurveTo(...at(0.1, 0.22), ...at(0.1, 0), ...at(0.26, 0));
  path.lineTo(bx, by);
}

/** A piece's outline, with its middle at (0, 0): wide by high pixels, with knobs and holes where sides says. */
export function piecePath(wide, high, sides) {
  const knob = Math.min(wide, high) * KNOB;
  const [left, top, right, bottom] = [-wide / 2, -high / 2, wide / 2, high / 2];
  const path = new Path2D();
  path.moveTo(left, top);
  side(path, left, top, right, top, sides.top, knob);
  side(path, right, top, right, bottom, sides.right, knob);
  side(path, right, bottom, left, bottom, sides.bottom, knob);
  side(path, left, bottom, left, top, sides.left, knob);
  path.closePath();
  return path;
}

export class PuzzleView {
  /**
   * language() says which language a new thing's label is in, prizeTarget() where the prizes' tally is on the
   * screen, and top() how deep the band along the top of the screen is, which the table stays under.
   */
  constructor(canvas, { language = () => 'en', prizeTarget = () => ({ x: 80, y: 40 }), top = () => 130 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.language = language;
    this.prizeTarget = prizeTarget;
    this.topBand = top;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.time = 0;
    this.bases = new Map();
    this.effects = [];
    this.flying = [];
    this.labels = [];
    this.introduced = new Set();
    this.wanted = new Map();
    this.marks = Object.fromEntries(Object.entries(MARKS).map(([key, mark]) => [key, makeMark(mark)]));
    this.giraffe = null; // Giraffe's pictures, if they could be drawn: see games/giraffe-garden/giraffe.js.
    this.art = { friends: {}, fruit: {} }; // The characters and fruit in the pictures: see pictures.js.
    this.artVersion = 0;
    this.built = null; // Which picture the pieces were last cut from, and at what size.
    this.sprites = new Map();
    this.pictures = [];
    this.leaving = null; // The picture before, fading away.
    this.settling = new Map(); // Pieces sliding the last little way into their places, by number, as { x, y, at }.
    this.shownAt = 0;
    this.peekFade = 0;
    this.cheerUntil = 0;
    this.gloveLayer = document.createElement('canvas');
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.ratio);
    this.canvas.height = Math.round(this.height * this.ratio);
    this.bases.clear();
    this.place();
  }

  /** Where the table goes: as big as fits under the band at the top, in the middle. */
  place() {
    const band = this.topBand();
    const room = { width: this.width - MARGIN * 2, height: this.height - band - MARGIN };
    this.scale = Math.max(120, Math.min(room.width / TABLE.width, room.height / TABLE.height));
    this.left = (this.width - TABLE.width * this.scale) / 2;
    this.top = band + Math.max(0, (room.height - TABLE.height * this.scale) / 2);
    this.area = { left: this.left, top: this.top, width: TABLE.width * this.scale, height: TABLE.height * this.scale };
    this.palmSize = Math.max(26, this.scale * PALM);
    this.bases.clear();
  }

  /** A new game: nothing left over from the last one. */
  reset() {
    this.effects = [];
    this.flying = [];
    this.labels = [];
    this.introduced = new Set();
    this.wanted = new Map();
    this.cheerUntil = 0;
    this.peekFade = 0;
    this.leaving = null;
    this.settling = new Map();
    this.built = null;
  }

  /** The characters' and the fruit's pictures have changed, so the pieces are cut again. */
  artChanged() {
    this.artVersion += 1;
  }

  /** Where a place on the table is on the screen. */
  at(x, y) {
    return { x: this.left + x * this.scale, y: this.top + y * this.scale };
  }

  /** And where a place on the screen is on the table. */
  fromScreen(x, y) {
    return { x: (x - this.left) / this.scale, y: (y - this.top) / this.scale };
  }

  update(dt, puzzle = null) {
    this.time += dt;
    for (const effect of this.effects) effect.life -= dt;
    this.effects = this.effects.filter((effect) => effect.life > 0);
    for (const flight of this.flying) flight.t += dt;
    this.flying = this.flying.filter((flight) => flight.t < PRIZE_FLY_SECONDS);
    for (const label of this.labels) label.life -= dt;
    this.labels = this.labels.filter((label) => label.life > 0 && label.target());
    this.nextLabel();
    if (this.leaving) {
      this.leaving.t += dt;
      if (this.leaving.t >= FADE_SECONDS) this.leaving = null;
    }
    for (const [id, slide] of this.settling) if (this.time - slide.at >= SETTLE_SECONDS) this.settling.delete(id);
    const showing = puzzle?.phase === 'play' && puzzle.round.peek?.showing > 0.3;
    this.peekFade = clamp(this.peekFade + (showing ? dt : -dt) / 0.35, 0, 1);
  }

  /* ---------- what happens, seen ---------- */

  /** A few small stars, as something good happens, at a place on the table. */
  sparkle(x, y, colour = '#ffe066') {
    const at = this.at(x, y);
    if (this.effects.length < 40) this.effects.push({ kind: 'sparkle', x: at.x, y: at.y, life: 0.7, total: 0.7, colour });
  }

  /** A piece going into its place: a ring of small stars going out from it. */
  burst(x, y, colour = '#ffe066') {
    const at = this.at(x, y);
    this.effects.push({ kind: 'burst', x: at.x, y: at.y, life: 0.8, total: 0.8, colour });
  }

  /** A piece going in slides the last little way to its place from where it was, rather than jumping there. */
  settle(piece, from) {
    this.settling.set(piece.id, { x: from.x, y: from.y, at: this.time });
  }

  /** A bubble pops: a ring, going out and fading. */
  pop(x, y, r) {
    const at = this.at(x, y);
    this.effects.push({ kind: 'pop', x: at.x, y: at.y, r: r * this.scale, life: 0.4, total: 0.4, colour: '#bfe6ff' });
  }

  /** A leaf brushed off a piece flutters away to the side, and fades. */
  leafAway(x, y, size) {
    const at = this.at(x, y);
    this.effects.push({ kind: 'leaf', x: at.x, y: at.y, size: size * this.scale, way: x < TABLE.width / 2 ? -1 : 1, life: 0.8, total: 0.8 });
  }

  /** A prize flies up to the tally, from where it was on the table. */
  prize(kind, x, y) {
    if (!this.marks[kind]) return;
    const at = this.at(x, y);
    this.flying.push({ kind, x: at.x, y: at.y, t: 0 });
  }

  /** Giraffe cheers for a while. */
  cheer(seconds = 1.1) {
    this.cheerUntil = Math.max(this.cheerUntil, this.time + seconds);
  }

  /**
   * A new thing's label, the first time it comes along in a game. target() says where it is, on the table, or null
   * once it has gone. They come one at a time, so each is read.
   */
  introduce(key, target) {
    if (this.introduced.has(key) || !LABELS[key] || this.wanted.has(key)) return;
    this.wanted.set(key, target);
  }

  nextLabel() {
    if (this.labels.length) return;
    for (const [key, target] of this.wanted) {
      this.wanted.delete(key);
      if (!target()) continue;
      this.introduced.add(key);
      const [en, ka] = LABELS[key];
      this.labels.push({ key, target, life: LABEL_SECONDS, text: this.language() === 'ka' ? ka : en });
      return;
    }
  }

  /* ---------- the pieces, cut from their pictures ---------- */

  /**
   * The pictures being put together, drawn at the size they are on this screen, and each piece cut from them: once
   * for a picture, and again if the window changes size.
   */
  cut(puzzle) {
    const { round } = puzzle;
    const key = [puzzle.seed, puzzle.level, puzzle.plan.cutIndex, round.index, this.scale.toFixed(2), this.ratio, this.artVersion].join(':');
    if (this.built === key) return;
    // The picture before fades away as the next one's pieces come, unless it's only the window that changed.
    const same = this.builtFor === `${puzzle.seed}:${round.index}`;
    if (!same && this.pictures.length && this.wasWhole) this.leaving = { pictures: this.pictures, t: 0 };
    if (!same) this.shownAt = this.time;
    this.built = key;
    this.builtFor = `${puzzle.seed}:${round.index}`;
    this.wasWhole = false;
    const { scale, ratio } = this;
    const { piece: size } = round.layout;
    const [wide, high] = [size.width * scale, size.height * scale];
    this.pieceWide = wide;
    this.pieceHigh = high;
    this.pictures = round.pictures.map(({ name, frame }) => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(frame.width * scale * ratio);
      canvas.height = Math.round(frame.height * scale * ratio);
      const ctx = canvas.getContext('2d');
      ctx.scale(canvas.width / PICTURE.width, canvas.height / PICTURE.height);
      drawPicture(ctx, name, { art: this.art });
      return { name, frame, canvas };
    });
    this.sprites = new Map();
    const margin = Math.ceil(Math.min(wide, high) * KNOB * 1.05 + 14);
    for (const piece of round.pieces) {
      const path = piecePath(wide, high, piece.sides);
      const picture = this.pictures[piece.frame];
      const make = (shadow) => {
        const canvas = document.createElement('canvas');
        const [across, down] = [wide + margin * 2, high + margin * 2];
        canvas.width = Math.ceil(across * ratio);
        canvas.height = Math.ceil(down * ratio);
        const ctx = canvas.getContext('2d');
        ctx.scale(ratio, ratio);
        ctx.translate(across / 2, down / 2);
        if (shadow) {
          // A soft shadow under a loose piece, so it's seen to lie on top of things. Shadows are in real pixels.
          ctx.save();
          ctx.shadowColor = 'rgb(18 48 77 / 0.38)';
          ctx.shadowBlur = 7 * ratio;
          ctx.shadowOffsetY = 3.5 * ratio;
          ctx.fillStyle = '#ffffff';
          ctx.fill(path);
          ctx.restore();
        }
        ctx.save();
        ctx.clip(path);
        ctx.drawImage(picture.canvas, -wide / 2 - piece.col * wide, -high / 2 - piece.row * high, frameWide(picture, scale), frameHigh(picture, scale));
        if (piece.golden) {
          // A golden rim, inside its edge, so it's golden in the frame too.
          ctx.strokeStyle = COLOURS.gold;
          ctx.lineWidth = Math.max(8, Math.min(wide, high) * 0.11);
          ctx.lineJoin = 'round';
          ctx.stroke(path);
          ctx.strokeStyle = 'rgb(255 255 255 / 0.7)';
          ctx.lineWidth = 2.5;
          ctx.stroke(path);
        }
        ctx.restore();
        ctx.lineJoin = 'round';
        ctx.strokeStyle = shadow ? 'rgb(18 48 77 / 0.8)' : 'rgb(18 48 77 / 0.35)';
        ctx.lineWidth = shadow ? 2 : 1.25;
        ctx.stroke(path);
        return canvas;
      };
      this.sprites.set(piece.id, { path, loose: make(true), flat: make(false), wide: wide + margin * 2, high: high + margin * 2 });
    }
  }

  /* ---------- drawing ---------- */

  /**
   * The room and the easel only change with the window, and with how many pictures are on the easel, so they're
   * drawn once: the room behind Giraffe, and the easel in front of him, as { back, front }.
   */
  baseFor(layout) {
    const key = `${layout.frames.length}:${layout.boards[0].width.toFixed(3)}`;
    if (this.bases.has(key)) return this.bases.get(key);
    const layer = () => {
      const canvas = document.createElement('canvas');
      canvas.width = this.canvas.width;
      canvas.height = this.canvas.height;
      const context = canvas.getContext('2d');
      context.scale(this.ratio, this.ratio);
      return [canvas, context];
    };
    const [back, behind] = layer();
    const [front, ctx] = layer();
    this.drawRoom(behind, layout);
    this.drawEasel(ctx, layout);
    const base = { back, front };
    this.bases.set(key, base);
    return base;
  }

  /** The playroom: its wall, its floor, and the cork board at each side. */
  drawRoom(ctx, layout) {
    const { width: w, height: h, scale } = this;
    let seed = 23;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    ctx.fillStyle = COLOURS.wall;
    ctx.fillRect(0, 0, w, h);
    // A quiet pattern on the wall.
    ctx.fillStyle = COLOURS.wallDot;
    const step = Math.max(44, scale * 0.09);
    for (let row = 0; row * step < h; row += 1) {
      for (let x = (row % 2 ? step / 2 : 0) + step / 2; x < w; x += step) {
        ctx.beginPath();
        ctx.arc(x, row * step + step / 2, step * 0.06, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // The floor, with a board along the bottom of the wall.
    const floor = this.at(0, 0.968).y;
    ctx.fillStyle = COLOURS.floor;
    ctx.fillRect(0, floor, w, h - floor);
    ctx.strokeStyle = COLOURS.floorLine;
    ctx.lineWidth = 2;
    for (let x = (w % 140) / 2; x < w; x += 140) {
      ctx.beginPath();
      ctx.moveTo(x, floor);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, floor - scale * 0.012, w, scale * 0.012);
    ctx.fillStyle = 'rgb(18 48 77 / 0.18)';
    ctx.fillRect(0, floor, w, 2);
    // The cork boards.
    for (const board of layout.boards) {
      const { x, y } = this.at(board.x, board.y);
      const [wide, high] = [board.width * scale, board.height * scale];
      ctx.fillStyle = 'rgb(18 48 77 / 0.14)';
      ctx.beginPath();
      ctx.roundRect(x + 3, y + 5, wide, high, scale * 0.03);
      ctx.fill();
      ctx.fillStyle = COLOURS.cork;
      ctx.beginPath();
      ctx.roundRect(x, y, wide, high, scale * 0.03);
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = COLOURS.corkSpeck;
      for (let n = 0; n < 150; n += 1) {
        ctx.beginPath();
        ctx.ellipse(x + random() * wide, y + random() * high, 1.5 + random() * 3, 1 + random() * 2, random() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle = COLOURS.wood;
      ctx.lineWidth = Math.max(5, scale * 0.012);
      ctx.beginPath();
      ctx.roundRect(x, y, wide, high, scale * 0.03);
      ctx.stroke();
      ctx.strokeStyle = 'rgb(18 48 77 / 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(x - scale * 0.006, y - scale * 0.006, wide + scale * 0.012, high + scale * 0.012, scale * 0.034);
      ctx.stroke();
    }
  }

  /** The easel: its legs down to the floor, the board the pictures are on, and the paper where each one goes. */
  drawEasel(ctx, layout) {
    const { scale } = this;
    const { easel } = layout;
    const { x, y } = this.at(easel.x, easel.y);
    const [wide, high] = [easel.width * scale, easel.height * scale];
    const floor = this.at(0, 0.985).y;
    // Legs, a little apart at the bottom, and the ledge the board stands on.
    ctx.lineCap = 'round';
    for (const [from, to] of [[0.14, 0.04], [0.86, 0.96]]) {
      for (const [colour, thick] of [[INK, scale * 0.034], [COLOURS.woodDark, scale * 0.026]]) {
        ctx.strokeStyle = colour;
        ctx.lineWidth = thick;
        ctx.beginPath();
        ctx.moveTo(x + wide * from, y + high - scale * 0.01);
        ctx.lineTo(x + wide * to, floor);
        ctx.stroke();
      }
    }
    ctx.fillStyle = 'rgb(18 48 77 / 0.16)';
    ctx.beginPath();
    ctx.roundRect(x + 4, y + 7, wide, high, scale * 0.016);
    ctx.fill();
    ctx.fillStyle = COLOURS.wood;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x - scale * 0.012, y + high - scale * 0.004, wide + scale * 0.024, scale * 0.024, scale * 0.008);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(x, y, wide, high, scale * 0.016);
    ctx.fill();
    ctx.stroke();
    // A lighter line along the wood, so it looks like a frame.
    ctx.strokeStyle = 'rgb(255 255 255 / 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x + scale * 0.006, y + scale * 0.006, wide - scale * 0.012, high - scale * 0.012, scale * 0.012);
    ctx.stroke();
    for (const frame of layout.frames) {
      const corner = this.at(frame.x, frame.y);
      ctx.fillStyle = COLOURS.paper;
      ctx.fillRect(corner.x, corner.y, frame.width * scale, frame.height * scale);
      ctx.strokeStyle = 'rgb(18 48 77 / 0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(corner.x, corner.y, frame.width * scale, frame.height * scale);
    }
  }

  /**
   * Draws everything. model is { puzzle, glove, offset, holding, friends, side, waving }: the puzzle as it is, the
   * child's glove and how far it is from where it's drawn (see main.js), whether it has a piece, each friend's
   * glove as { glove, name, fade }, which hand is in play, and whether Giraffe waves.
   */
  render(model = {}) {
    const { ctx, width: w, height: h, ratio } = this;
    const { puzzle } = model;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (!puzzle) {
      ctx.fillStyle = COLOURS.wall;
      ctx.fillRect(0, 0, w, h);
      return;
    }
    this.cut(puzzle);
    const { round } = puzzle;
    const { back, front } = this.baseFor(round.layout);
    ctx.drawImage(back, 0, 0, w, h);
    this.drawGiraffe(round.layout, model);
    ctx.drawImage(front, 0, 0, w, h);
    this.drawFrames(puzzle);
    if (round.peek) this.drawPeek(round.peek);

    // The loose pieces, the last one moved on top, then any in a bubble, then those in friends' hands.
    const coming = clamp((this.time - this.shownAt) / FADE_SECONDS, 0, 1);
    const mine = puzzle.held;
    const lying = round.pieces.filter((piece) => piece.state === 'loose' && !piece.floating).sort((a, b) => a.z - b.z);
    for (const piece of lying) {
      this.drawPiece(piece, { alpha: coming });
      if (piece.leaf) this.drawLeaf(piece, coming);
    }
    for (const piece of round.pieces) if (piece.floating && piece.state === 'loose') this.drawFloating(piece, puzzle, coming);
    if (round.magnet?.state === 'waiting') this.drawMagnetBubble(round.magnet, coming);
    // Friends' pieces and gloves under the child's own. Two in one picture on one screen, the second player's are
    // over the first's, in their own blue, so they're never hidden under them.
    const second = inOnePicture();
    const friends = () => {
      for (const piece of round.pieces) if (piece.state === 'held' && piece !== mine) this.drawPiece(piece, { lift: 1, ring: second ? SECOND_PLAYER.open : '#b8c4d0' });
      for (const friend of model.friends ?? []) this.drawFriend(friend, second && round.pieces.some((piece) => piece.state === 'held' && piece.holder === friend.id));
    };
    if (!second) friends();
    if (mine) this.drawPiece(mine, { lift: 1, ring: COLOURS.held });
    const { glove } = model;
    if (glove?.visible) {
      if (round.magnet?.state === 'on') this.drawMagnetRing(glove, model.offset, round.magnet);
      // With a piece in the hand, the glove is see-through, so the piece shows under it.
      this.drawGlove(glove, model.offset, mine ? 0.62 : 1);
    }
    if (second) friends();
    this.drawEffects();
    this.drawFlying();
    for (const label of this.labels) this.drawLabel(label);
  }

  /** Giraffe, behind the easel, looking over the top of it: waving, cheering or watching. */
  drawGiraffe(layout, model) {
    const art = this.giraffe;
    if (!art) return;
    const { ctx, scale } = this;
    let frame = art.frames.stand;
    if (this.time < this.cheerUntil) frame = art.frames.cheer;
    else if (model.waving && !this.reducedMotion) frame = Math.floor(this.time * 1.4) % 2 ? art.frames.wave : art.frames.stand;
    const size = (GIRAFFE.tall * scale) / art.tall;
    const feet = this.at(layout.giraffe.x, GIRAFFE.top + GIRAFFE.tall * HEAD_ABOVE_FEET);
    const top = this.at(0, layout.easel.y + 0.01).y;
    // In his cheering picture he's up on his toes. Here it's drawn that much lower, so his head stays where it
    // was and only his arms and his face change: his whole head hopping up and down would be a lot to change at once.
    const hop = frame === art.frames.cheer ? art.tall * CHEER_HOP : 0;
    ctx.save();
    // Only what's above the easel is drawn: the rest of him is behind it.
    ctx.beginPath();
    ctx.rect(0, 0, this.width, top);
    ctx.clip();
    ctx.translate(feet.x, feet.y);
    ctx.scale(size, size);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(frame, -art.foot.x, -art.foot.y + hop);
    ctx.restore();
  }

  /**
   * What's in the frames: the picture before, fading away, a look at the finished picture, the outline of each
   * place still empty, lit up when the piece in the hand has been carried a while, the pieces in place, and the
   * whole picture once it's finished, with its joins gone.
   */
  drawFrames(puzzle) {
    const { ctx, scale } = this;
    const { round } = puzzle;
    // A picture the clock ran out on isn't whole: it stays as far as it got.
    const whole = puzzle.phase === 'mended' || (puzzle.phase === 'done' && !puzzle.lost);
    if (this.leaving) {
      ctx.save();
      ctx.globalAlpha = 1 - ease(clamp(this.leaving.t / FADE_SECONDS, 0, 1));
      for (const { frame, canvas } of this.leaving.pictures) {
        const corner = this.at(frame.x, frame.y);
        ctx.drawImage(canvas, corner.x, corner.y, frame.width * scale, frame.height * scale);
      }
      ctx.restore();
    }
    if (this.peekFade > 0 && !whole) {
      ctx.save();
      ctx.globalAlpha = 0.5 * ease(this.peekFade);
      for (const { frame, canvas } of this.pictures) {
        const corner = this.at(frame.x, frame.y);
        ctx.drawImage(canvas, corner.x, corner.y, frame.width * scale, frame.height * scale);
      }
      ctx.restore();
    }
    for (const piece of round.pieces) {
      const sprite = this.sprites.get(piece.id);
      if (!sprite) continue;
      const home = this.at(piece.home.x, piece.home.y);
      if (piece.state === 'placed') {
        const slide = this.settling.get(piece.id);
        if (slide) {
          // Just let go: it slides the last little way in, coming down flat as it goes.
          const share = ease(clamp((this.time - slide.at) / SETTLE_SECONDS, 0, 1));
          const from = this.at(slide.x, slide.y);
          const grow = 1 + 0.06 * (1 - share);
          ctx.save();
          ctx.translate(from.x + (home.x - from.x) * share, from.y + (home.y - from.y) * share);
          ctx.scale(grow, grow);
          ctx.drawImage(sprite.loose, -sprite.wide / 2, -sprite.high / 2, sprite.wide, sprite.high);
          ctx.restore();
        } else {
          ctx.drawImage(sprite.flat, home.x - sprite.wide / 2, home.y - sprite.high / 2, sprite.wide, sprite.high);
        }
        continue;
      }
      ctx.save();
      ctx.translate(home.x, home.y);
      if (piece.hint > 0) {
        ctx.fillStyle = `rgb(255 210 63 / ${(0.45 * piece.hint).toFixed(3)})`;
        ctx.fill(sprite.path);
        ctx.strokeStyle = `rgb(245 179 1 / ${piece.hint.toFixed(3)})`;
        ctx.lineWidth = 4;
        ctx.stroke(sprite.path);
      } else {
        ctx.setLineDash([7, 6]);
        ctx.strokeStyle = 'rgb(18 48 77 / 0.24)';
        ctx.lineWidth = 2;
        ctx.stroke(sprite.path);
      }
      ctx.restore();
    }
    if (!whole) return;
    // Whole again: the picture itself, over its pieces, so the joins fade away. Alive, it moves.
    this.wasWhole = true;
    const share = ease(clamp(puzzle.mendedFor / 0.9, 0, 1));
    ctx.save();
    ctx.globalAlpha = puzzle.phase === 'done' ? 1 : share;
    for (const { name, frame, canvas } of this.pictures) {
      const corner = this.at(frame.x, frame.y);
      if (round.alive && !this.reducedMotion) {
        ctx.save();
        ctx.translate(corner.x, corner.y);
        ctx.scale((frame.width * scale) / PICTURE.width, (frame.height * scale) / PICTURE.height);
        drawPicture(ctx, name, { life: Math.max(0.001, this.time - (this.aliveAt ?? this.time)), art: this.art });
        ctx.restore();
      } else {
        ctx.drawImage(canvas, corner.x, corner.y, frame.width * scale, frame.height * scale);
      }
      ctx.strokeStyle = 'rgb(18 48 77 / 0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(corner.x, corner.y, frame.width * scale, frame.height * scale);
    }
    ctx.restore();
  }

  /** A finished picture comes to life from now. */
  comeAlive() {
    this.aliveAt = this.time;
  }

  /**
   * One piece, where it is and as it's turned. lift is for one in a hand, a little bigger, with a ring round it in
   * the hand's colour.
   */
  drawPiece(piece, { alpha = 1, lift = 0, ring = null } = {}) {
    const sprite = this.sprites.get(piece.id);
    if (!sprite) return;
    const { ctx } = this;
    const { x, y } = this.at(piece.x, piece.y);
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    ctx.rotate(((piece.angle + piece.tilt) * Math.PI) / 180);
    const grow = 1 + 0.06 * lift;
    ctx.scale(grow, grow);
    if (ring) {
      ctx.strokeStyle = ring;
      ctx.lineWidth = 9;
      ctx.lineJoin = 'round';
      ctx.stroke(sprite.path);
    }
    ctx.drawImage(sprite.loose, -sprite.wide / 2, -sprite.high / 2, sprite.wide, sprite.high);
    // A piece the wrong way up says so, with an arrow going round.
    if (piece.angle !== 0) this.drawTurnMark();
    ctx.restore();
  }

  /** A round arrow on a piece that isn't the right way up yet. */
  drawTurnMark() {
    const { ctx, scale } = this;
    const r = scale * 0.032;
    ctx.save();
    ctx.fillStyle = 'rgb(255 255 255 / 0.92)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(3, r * 0.34);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, r, -Math.PI * 0.9, Math.PI * 0.55);
    ctx.stroke();
    const tip = { x: Math.cos(Math.PI * 0.55) * r, y: Math.sin(Math.PI * 0.55) * r };
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(tip.x - r * 0.62, tip.y - r * 0.2);
    ctx.lineTo(tip.x + r * 0.3, tip.y + r * 0.52);
    ctx.lineTo(tip.x + r * 0.34, tip.y - r * 0.52);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** The leaf lying on a piece. It slides off a little as it's brushed, to show that's working. */
  drawLeaf(piece, alpha = 1) {
    const { ctx } = this;
    const size = Math.max(this.pieceWide, this.pieceHigh) * 0.52;
    const { x, y } = this.at(piece.x, piece.y);
    const brushed = clamp(piece.leaf.brushed, 0, 1);
    ctx.save();
    ctx.globalAlpha *= alpha;
    this.paintLeaf(x + brushed * size * 0.45, y - brushed * size * 0.12, size, -0.5 + brushed * 0.5);
    ctx.restore();
  }

  paintLeaf(x, y, size, turn) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(turn);
    ctx.fillStyle = '#58b65a';
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, size * 0.035);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-size, 0);
    ctx.bezierCurveTo(-size * 0.5, -size * 0.78, size * 0.5, -size * 0.7, size, 0);
    ctx.bezierCurveTo(size * 0.5, size * 0.7, -size * 0.5, size * 0.78, -size, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#3d8f45';
    ctx.lineWidth = Math.max(2, size * 0.04);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-size * 1.12, 0);
    ctx.lineTo(size * 0.86, 0);
    for (const along of [-0.5, -0.1, 0.3]) {
      ctx.moveTo(along * size, 0);
      ctx.lineTo((along + 0.26) * size, -size * 0.34);
      ctx.moveTo(along * size, 0);
      ctx.lineTo((along + 0.26) * size, size * 0.34);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** A piece floating in a bubble: see-through, with a shine, bobbing a little. */
  drawFloating(piece, puzzle, alpha = 1) {
    const { ctx, scale } = this;
    const bob = this.reducedMotion ? 0 : Math.sin(this.time * 2 + piece.id) * scale * 0.006;
    const { x, y } = this.at(piece.x, piece.y);
    const r = puzzle.bubbleRadius() * scale;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(0, bob);
    this.drawPiece(piece);
    ctx.translate(x, y);
    this.paintBubble(r);
    ctx.restore();
  }

  paintBubble(r) {
    const { ctx } = this;
    ctx.fillStyle = 'rgb(170 225 255 / 0.3)';
    ctx.strokeStyle = 'rgb(255 255 255 / 0.95)';
    ctx.lineWidth = Math.max(2.5, r * 0.05);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgb(120 190 235 / 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, r + Math.max(2, r * 0.03), 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgb(255 255 255 / 0.8)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.42, -r * 0.5, r * 0.2, r * 0.1, -0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  /** The magnet, waiting in its bubble. */
  drawMagnetBubble(magnet, alpha = 1) {
    const { ctx, scale } = this;
    const bob = this.reducedMotion ? 0 : Math.sin(this.time * 2.2) * scale * 0.006;
    const { x, y } = this.at(magnet.x, magnet.y);
    const r = scale * 0.07;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y + bob);
    ctx.drawImage(this.marks.magnet, -r * 0.72, -r * 0.72, r * 1.44, r * 1.44);
    this.paintBubble(r);
    ctx.restore();
  }

  /** The magnet over the glove, with a ring round the glove that shows its time running out. */
  drawMagnetRing(glove, offset = { x: 0, y: 0 }, magnet) {
    const { ctx, palmSize } = this;
    const [x, y] = [glove.x + offset.x, glove.y + offset.y];
    const r = palmSize * 1.75;
    ctx.save();
    ctx.strokeStyle = 'rgb(255 255 255 / 0.55)';
    ctx.lineWidth = Math.max(4, palmSize * 0.14);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#ff6b5e';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(magnet.left / EXTRAS.magnetSeconds, 0.01, 1));
    ctx.stroke();
    const size = palmSize * 0.95;
    ctx.drawImage(this.marks.magnet, x - size / 2, y - r - size * 0.8, size, size);
    ctx.restore();
  }

  /** The peek button: a ring fills round it while an open hand stays on it, and it's lit while the picture shows. */
  drawPeek(peek) {
    const { ctx, scale } = this;
    const { x, y } = this.at(peek.x, peek.y);
    const r = scale * 0.058;
    const showing = peek.showing > 0;
    ctx.save();
    ctx.fillStyle = 'rgb(18 48 77 / 0.16)';
    ctx.beginPath();
    ctx.arc(x + 2, y + 4, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = showing ? '#fff3c4' : '#ffffff';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.drawImage(this.marks.eyes, x - r * 0.7, y - r * 0.72, r * 1.4, r * 1.4);
    const share = showing ? peek.showing / EXTRAS.peekSeconds : peek.hold / EXTRAS.peekHold;
    if (share > 0.02) {
      ctx.strokeStyle = showing ? COLOURS.gold : COLOURS.held;
      ctx.lineWidth = Math.max(5, r * 0.2);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(x, y, r + ctx.lineWidth * 0.9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(share, 0, 1));
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * The child's glove, where it is on the screen. alpha makes it see-through: it's drawn whole, to one side, and
   * then put on the screen, so its fingers don't show through each other.
   */
  drawGlove(glove, offset = { x: 0, y: 0 }, alpha = 1, look = null) {
    const { ctx, palmSize, ratio } = this;
    if (alpha >= 0.999) {
      ctx.save();
      ctx.translate(offset.x, offset.y);
      glove.draw(ctx, palmSize, look);
      ctx.restore();
      return;
    }
    const size = Math.ceil(palmSize * 5.4);
    const layer = this.gloveLayer;
    if (layer.width !== Math.ceil(size * ratio)) {
      layer.width = Math.ceil(size * ratio);
      layer.height = Math.ceil(size * ratio);
    }
    const side = layer.getContext('2d');
    side.setTransform(ratio, 0, 0, ratio, 0, 0);
    side.clearRect(0, 0, size, size);
    side.save();
    side.translate(size / 2 - glove.x, size / 2 - glove.y);
    glove.draw(side, palmSize, look);
    side.restore();
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(layer, glove.x + offset.x - size / 2, glove.y + offset.y - size / 2, size, size);
    ctx.restore();
  }

  /**
   * A friend's glove, in grey, with their name over it, fading in and out as their hand comes and goes. Two in one
   * picture on one screen, the second player's is in their own blue, and solid unless holding a piece, as the
   * child's own is: holding says so.
   */
  drawFriend({ glove, name, fade = 1 }, holding = false) {
    if (!glove.visible || fade < 0.02) return;
    const { ctx, palmSize } = this;
    const second = inOnePicture();
    if (second) this.drawGlove(glove, { x: 0, y: 0 }, fade * (holding ? 0.62 : 1), secondPlayerLook(glove));
    else this.drawGlove(glove, { x: 0, y: 0 }, Math.min(0.9, fade), FRIEND_GLOVE);
    if (!name) return;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.font = `700 ${Math.round(Math.max(13, palmSize * 0.38))}px Fredoka, 'Noto Sans Georgian', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const y = glove.y - palmSize * 1.7;
    const wide = ctx.measureText(name).width + palmSize * 0.5;
    ctx.fillStyle = second ? SECOND_PLAYER.tag : 'rgb(255 255 255 / 0.92)';
    ctx.beginPath();
    ctx.roundRect(glove.x - wide / 2, y - palmSize * 0.3, wide, palmSize * 0.6, palmSize * 0.3);
    ctx.fill();
    ctx.fillStyle = second ? '#ffffff' : INK;
    ctx.fillText(name, glove.x, y + 1);
    ctx.restore();
  }

  drawMark(kind, x, y, size, alpha = 1) {
    const image = this.marks[kind];
    if (!image) return;
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.drawImage(image, x - size / 2, y - size / 2, size, size);
    ctx.restore();
  }

  drawEffects() {
    const { ctx, scale } = this;
    for (const effect of this.effects) {
      const share = 1 - effect.life / effect.total;
      ctx.save();
      ctx.globalAlpha = clamp(effect.life / effect.total, 0, 1);
      ctx.fillStyle = effect.colour;
      if (effect.kind === 'pop') {
        ctx.strokeStyle = effect.colour;
        ctx.lineWidth = scale * 0.007;
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, effect.r * (1 + share * 0.35), 0, Math.PI * 2);
        ctx.stroke();
      } else if (effect.kind === 'leaf') {
        this.paintLeaf(effect.x + effect.way * share * scale * 0.2, effect.y - Math.sin(share * Math.PI) * scale * 0.05, effect.size, -0.5 + effect.way * share * 2.2);
      } else {
        const burst = effect.kind === 'burst';
        const count = burst ? 10 : 6;
        for (let i = 0; i < count; i += 1) {
          const angle = (i / count) * Math.PI * 2 + 0.4;
          const out = scale * (burst ? 0.05 + share * 0.09 : 0.02 + share * 0.04);
          this.drawStar(effect.x + Math.cos(angle) * out, effect.y + Math.sin(angle) * out, scale * (burst ? 0.012 : 0.008) * (1 - share * 0.5));
        }
      }
      ctx.restore();
    }
  }

  drawStar(x, y, r) {
    const { ctx } = this;
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const reach = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach);
    }
    ctx.closePath();
    ctx.fill();
  }

  /** Prizes flying up to the tally, getting smaller. */
  drawFlying() {
    if (!this.flying.length) return;
    const to = this.prizeTarget();
    for (const flight of this.flying) {
      const share = ease(Math.min(1, flight.t / PRIZE_FLY_SECONDS));
      const x = flight.x + (to.x - flight.x) * share;
      const y = flight.y + (to.y - flight.y) * share - Math.sin(share * Math.PI) * this.scale * 0.06;
      this.drawMark(flight.kind, x, y, this.scale * 0.085 * (1.2 - 0.6 * share));
    }
  }

  drawLabel(label) {
    const where = label.target();
    if (!where) return;
    const { ctx, scale } = this;
    const fade = clamp(Math.min((LABEL_SECONDS - label.life) / 0.3, label.life / 0.4), 0, 1);
    const { x, y } = this.at(where.x, where.y);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.font = `600 ${Math.round(Math.max(15, scale * 0.034))}px Fredoka, 'Noto Sans Georgian', sans-serif`;
    const wide = ctx.measureText(label.text).width + 26;
    const high = Math.max(30, scale * 0.06);
    const left = clamp(x - wide / 2, 8, this.width - wide - 8);
    const top = clamp(y - scale * (where.above ?? 0.13) - high, this.top + 4, this.height - high - 8);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffb703';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(left, top, wide, high, high / 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label.text, left + wide / 2, top + high / 2 + 1);
    ctx.restore();
  }
}

const frameWide = (picture, scale) => picture.frame.width * scale;
const frameHigh = (picture, scale) => picture.frame.height * scale;
