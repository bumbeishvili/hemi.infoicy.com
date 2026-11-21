// Giraffe's Paint Box, drawn in 2D: a sheet of paper on a board in Giraffe's garden, with the picture to colour in
// on it in outline, the row of paint pots under it, and the child's glove, which is the brush.
//
// The paint is kept as a picture of its own, the size of the sheet. Each stroke is drawn as a real brush stroke and
// then cut to the shape of the part it's in, so paint never goes over a line, however shaky the hand. The outline is
// laid over the paint, so the lines always show.
//
// Nothing flashes: a part that's done fills in over half a second, sparkles are a few small stars, and whatever
// comes and goes fades or grows.
import { INK } from '../../core/glove.js';
import { COLOURS, RAINBOW, RAINBOW_HEXES, SHEET } from './pages.js';
import { DESK, DIP_SECONDS, LABELS, ROW } from './paint.js';

const { width: WIDE, height: HIGH } = SHEET;
const LINE = 0.75; // How thick the picture's lines are, on the sheet.
const PAPER = '#fffdf8';
const LABEL_SECONDS = 2.6;
const SETTLE_SECONDS = 0.55; // A part that's done fills in over this long.
export const LIFE_SECONDS = 3.4; // The finished picture comes to life for this long.
const LIFE_ROOM = 8; // How much room round a group of parts there is for it to move in, on the sheet.
const RAINBOW_EVERY = 9; // The rainbow paint changes colour every so far along the stroke, on the sheet.
const MARKS = { friend: '❓', pencil: '✏️', heart: '💗' };
// Giraffe, beside the sheet on the side away from the child's hand: how tall his body is, as a share of the screen.
export const GIRAFFE = { tall: 0.25 };

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const ease = (share) => share * share * (3 - 2 * share);
const hexOf = (colour) => COLOURS[colour]?.hex ?? '#888888';

const channels = (hex) => [0, 2, 4].map((at) => parseInt(hex.slice(at + 1, at + 3), 16));

/** The rainbow paint's colour so far along a stroke: one colour going smoothly into the next. */
export function rainbowAt(far) {
  const along = (((far / RAINBOW_EVERY) % RAINBOW_HEXES.length) + RAINBOW_HEXES.length) % RAINBOW_HEXES.length;
  const [from, to] = [channels(RAINBOW_HEXES[Math.floor(along)]), channels(RAINBOW_HEXES[(Math.floor(along) + 1) % RAINBOW_HEXES.length])];
  const share = along - Math.floor(along);
  return `rgb(${from.map((value, index) => Math.round(value + (to[index] - value) * share)).join(' ')})`;
}

/** A small picture from an emoji, drawn once. */
function makeMark(mark) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.font = '100px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(mark, 64, 70);
  return canvas;
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

/** Traces an edge from outlineOf as a path. */
function trace(ctx, outline) {
  ctx.moveTo(outline[0], outline[1]);
  for (let i = 2; i < outline.length; i += 2) ctx.lineTo(outline[i], outline[i + 1]);
  ctx.closePath();
}

/** A smooth line through points, as quadratic curves through the middles between them. */
function bend(ctx, points) {
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length - 2; i += 2) {
    ctx.quadraticCurveTo(points[i], points[i + 1], (points[i] + points[i + 2]) / 2, (points[i + 1] + points[i + 3]) / 2);
  }
  ctx.quadraticCurveTo(points.at(-4), points.at(-3), points.at(-2), points.at(-1));
}

export class PaintView {
  /** language() says which language a new thing's label is in. */
  constructor(canvas, { language = () => 'en' } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.language = language;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.time = 0;
    this.painting = null;
    this.giraffe = null; // Giraffe's pictures, if they could be drawn.
    this.cheerUntil = 0;
    this.marks = Object.fromEntries(Object.entries(MARKS).map(([key, mark]) => [key, makeMark(mark)]));
    this.friendMark = null;
    this.clear();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** Nothing left over from the last picture. */
  clear() {
    this.effects = [];
    this.labels = [];
    this.introduced = new Set();
    this.wanted = new Map();
    this.settling = [];
    this.life = null;
    this.potBob = new Map();
    this.friendShown = 0;
    this.friendHop = -1;
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.ratio);
    this.canvas.height = Math.round(this.height * this.ratio);
    this.palmSize = Math.max(34, this.height * 0.066);
    // The desk, the sheet with its pots under it, fills the screen below the band along the top.
    const [deskWide, deskHigh] = [DESK.right - DESK.left, DESK.bottom - DESK.top];
    this.unit = Math.min((this.height * 0.835) / deskHigh, (this.width * 0.97) / deskWide);
    this.origin = {
      x: (this.width - deskWide * this.unit) / 2 - DESK.left * this.unit,
      y: this.height * 0.992 - DESK.bottom * this.unit,
    };
    this.base = null;
    if (this.painting) this.build(true);
  }

  /** Where a place on the sheet is on the screen. */
  at(x, y) {
    return { x: this.origin.x + x * this.unit, y: this.origin.y + y * this.unit };
  }

  /** Where a place on the screen is on the sheet. */
  toSheet(x, y) {
    return { x: (x - this.origin.x) / this.unit, y: (y - this.origin.y) / this.unit };
  }

  /** The desk on the screen, which the hand's reach is measured against: see main.js. */
  get desk() {
    const [from, to] = [this.at(DESK.left, DESK.top), this.at(DESK.right, DESK.bottom)];
    return { left: from.x, top: from.y, width: to.x - from.x, height: to.y - from.y };
  }

  /* ---------- a picture to paint ---------- */

  /** A new sheet: its picture in outline, each part's shape to cut the paint to, and no paint on it yet. */
  setPainting(painting) {
    this.painting = painting;
    this.clear();
    this.friendMark = painting.friend ? makeMark(painting.friend.mark) : null;
    this.build(false);
  }

  /** The sheet's pictures, at the size it is on this screen. keep carries the paint over, as when the window changes. */
  build(keep) {
    const { painting } = this;
    const scale = this.unit * this.ratio;
    const [wide, high] = [Math.round(WIDE * scale), Math.round(HIGH * scale)];
    const old = keep ? this.paint : null;
    this.scale = wide / WIDE;
    this.paint = makeCanvas(wide, high);
    this.paintCtx = this.paint.getContext('2d');
    if (old) this.paintCtx.drawImage(old, 0, 0, wide, high);
    this.scratch = makeCanvas(wide, high);
    this.scratchCtx = this.scratch.getContext('2d');
    this.lines = makeCanvas(wide, high);
    this.drawLines(this.lines.getContext('2d'), painting);
    // Each part's shape as it shows, with whatever lies on top of it cut away: paint is cut to this.
    this.masks = painting.parts.map((part) => (part.kind === 'paper' ? null : this.maskFor(part, painting.parts.slice(part.index + 1))));
  }

  /** The picture in outline: every part white with a line round it, in order, and the ink over them all. */
  drawLines(ctx, painting) {
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, WIDE, HIGH);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK;
    for (const part of painting.parts) {
      // The line goes round the outside of the part: drawn twice as thick, and the part filled in over half of it.
      ctx.lineWidth = LINE * 2;
      ctx.beginPath();
      for (const outline of part.outlines) trace(ctx, outline);
      ctx.stroke();
      // A part that isn't for painting can come ready coloured, as a car's tyres do.
      ctx.fillStyle = painting.page.parts[part.index].fill ?? PAPER;
      for (const outline of part.outlines) {
        ctx.beginPath();
        trace(ctx, outline);
        ctx.fill();
      }
    }
    ctx.lineWidth = LINE;
    ctx.fillStyle = INK;
    for (const [kind, ...n] of painting.page.ink ?? []) {
      ctx.beginPath();
      if (kind === 'line') {
        ctx.moveTo(n[0], n[1]);
        for (let i = 2; i < n.length; i += 2) ctx.lineTo(n[i], n[i + 1]);
        ctx.stroke();
      } else if (kind === 'bend') {
        bend(ctx, n);
        ctx.stroke();
      } else if (kind === 'dot' || kind === 'wheel') {
        ctx.arc(n[0], n[1], n[2], 0, Math.PI * 2);
        ctx.fill();
      } else if (kind === 'glint') {
        ctx.fillStyle = '#ffffff';
        ctx.arc(n[0], n[1], n[2], 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = INK;
      } else if (kind === 'fill') {
        trace(ctx, n);
        ctx.fill();
      } else if (kind === 'word') {
        ctx.font = `700 ${n[2]}px Fredoka, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(n[3], n[0], n[1]);
      }
    }
  }

  /** A part's shape as it shows, on a little picture of its own: { canvas, left, top, wide, high }, on the sheet. */
  maskFor(part, above) {
    const pad = 1;
    const left = Math.max(0, Math.floor(part.box.left - pad));
    const top = Math.max(0, Math.floor(part.box.top - pad));
    const wide = Math.min(WIDE, Math.ceil(part.box.right + pad)) - left;
    const high = Math.min(HIGH, Math.ceil(part.box.bottom + pad)) - top;
    // Half as sharp as the screen is plenty: its edge is under the picture's line.
    const scale = Math.max(2, this.scale * 0.5);
    const canvas = makeCanvas(wide * scale, high * scale);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(canvas.width / wide, 0, 0, canvas.height / high, (-left * canvas.width) / wide, (-top * canvas.height) / high);
    ctx.fillStyle = '#000000';
    for (const outline of part.outlines) {
      ctx.beginPath();
      trace(ctx, outline);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'destination-out';
    for (const other of above) {
      if (other.box.left > part.box.right || other.box.right < part.box.left || other.box.top > part.box.bottom || other.box.bottom < part.box.top) continue;
      for (const outline of other.outlines) {
        ctx.beginPath();
        trace(ctx, outline);
        ctx.fill();
      }
    }
    return { canvas, left, top, wide, high };
  }

  /**
   * Paints strokes onto the sheet, each cut to the parts it's in: { x0, y0, x1, y1, r, colour, phase, parts }, as
   * the rules give them (takeMarks).
   */
  drawMarks(marks) {
    for (const mark of marks) {
      const colour = mark.colour === RAINBOW ? rainbowAt(mark.phase) : hexOf(mark.colour);
      for (const index of mark.parts) {
        const mask = this.masks[index];
        if (!mask) continue;
        const pad = mark.r + 1;
        const left = Math.max(mask.left, Math.min(mark.x0, mark.x1) - pad);
        const top = Math.max(mask.top, Math.min(mark.y0, mark.y1) - pad);
        const right = Math.min(mask.left + mask.wide, Math.max(mark.x0, mark.x1) + pad);
        const bottom = Math.min(mask.top + mask.high, Math.max(mark.y0, mark.y1) + pad);
        if (right <= left || bottom <= top) continue;
        this.cut({ left, top, right, bottom }, mask, (ctx) => {
          ctx.strokeStyle = colour;
          ctx.lineCap = 'round';
          ctx.lineWidth = mark.r * 2;
          ctx.beginPath();
          ctx.moveTo(mark.x0, mark.y0);
          // A dab in one place is still a round blob of paint.
          ctx.lineTo(mark.x1 + (mark.x0 === mark.x1 && mark.y0 === mark.y1 ? 0.01 : 0), mark.y1);
          ctx.stroke();
        });
      }
    }
  }

  /**
   * Draws something in a box on the sheet, cuts it to a part's shape, and lays it on the paint: over what's
   * there, or under it, as a part filling itself in does, at so much strength.
   */
  cut(box, mask, draw, { under = false, alpha = 1 } = {}) {
    const { scratchCtx: ctx, scale } = this;
    // Whole pixels, a little outside the box, so nothing is left at its edge.
    const x = Math.max(0, Math.floor(box.left * scale) - 1);
    const y = Math.max(0, Math.floor(box.top * scale) - 1);
    const w = Math.min(this.scratch.width, Math.ceil(box.right * scale) + 1) - x;
    const h = Math.min(this.scratch.height, Math.ceil(box.bottom * scale) + 1) - y;
    if (w <= 0 || h <= 0) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.clearRect(x, y, w, h);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    draw(ctx);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(mask.canvas, mask.left, mask.top, mask.wide, mask.high);
    ctx.restore();
    const paint = this.paintCtx;
    paint.save();
    paint.globalCompositeOperation = under ? 'destination-over' : 'source-over';
    paint.globalAlpha = alpha;
    paint.drawImage(this.scratch, x, y, w, h, x, y, w, h);
    paint.restore();
  }

  /** A part is done: what's left of it fills in, under the paint that's there, over half a second. */
  settle(part, colour) {
    if (part.kind === 'free' || !this.masks[part.index]) return;
    this.settling.push({ index: part.index, colour, t: 0 });
  }

  fillPart(index, colour, alpha) {
    const mask = this.masks[index];
    const box = { left: mask.left, top: mask.top, right: mask.left + mask.wide, bottom: mask.top + mask.high };
    this.cut(box, mask, (ctx) => {
      if (colour === RAINBOW) {
        // Stripes of every colour across it, each going smoothly into the next.
        const stripes = ctx.createLinearGradient(box.left, box.top, box.right, box.bottom);
        RAINBOW_HEXES.forEach((hex, at) => stripes.addColorStop(at / (RAINBOW_HEXES.length - 1), hex));
        ctx.fillStyle = stripes;
      } else {
        ctx.fillStyle = hexOf(colour);
      }
      ctx.fillRect(box.left, box.top, mask.wide, mask.high);
    }, { under: true, alpha });
  }

  /* ---------- what happens ---------- */

  update(dt, painting) {
    this.time += dt;
    for (const effect of this.effects) effect.life -= dt;
    this.effects = this.effects.filter((effect) => effect.life > 0);
    for (const label of this.labels) label.life -= dt;
    this.labels = this.labels.filter((label) => label.life > 0);
    this.nextLabel();
    for (const each of this.settling) {
      each.t += dt;
      const over = each.t >= SETTLE_SECONDS;
      this.fillPart(each.index, each.colour, over ? 1 : clamp(dt * 7, 0, 1));
      each.over = over;
    }
    this.settling = this.settling.filter((each) => !each.over);
    if (this.life) this.life.t += dt;
    if (!painting) return;
    // Whoever is hiding shows as their part is painted, and hops out once it's done.
    const { friend } = painting;
    if (friend) {
      const part = painting.parts[friend.part];
      const share = friend.found ? 1 : clamp(part.covered / (part.cells * part.need), 0, 1) * 0.7;
      this.friendShown += (share - this.friendShown) * (1 - Math.exp(-dt * 5));
      if (friend.found && this.friendHop < 0) this.friendHop = this.time;
    }
    // A pot the picture is pointing at bobs, and one just mixed pops up.
    for (const pot of painting.pots) {
      const wanted = painting.hint?.pots.includes(pot.index) ? 1 : 0;
      const now = this.potBob.get(pot.index) ?? 0;
      this.potBob.set(pot.index, now + (wanted - now) * (1 - Math.exp(-dt * 6)));
    }
  }

  /** A few small stars, as a part is done or something is pleased. Where is on the sheet. */
  sparkle(x, y, colour = '#ffe066') {
    this.effects.push({ kind: 'sparkle', x, y, life: 0.7, total: 0.7, colour });
  }

  /** A few drops of paint flying out, as a balloon bursts or a hand dips in a pot. */
  splash(x, y, colour, big = 1) {
    this.effects.push({ kind: 'splash', x, y, life: 0.5, total: 0.5, colour: colour === RAINBOW ? RAINBOW_HEXES[3] : hexOf(colour), big });
  }

  /** A heart floating up from whoever was hiding. */
  heart(x, y) {
    this.effects.push({ kind: 'heart', x, y, life: 1.4, total: 1.4 });
  }

  /** Giraffe cheers for a while. */
  cheer(seconds = 1.1) {
    this.cheerUntil = this.time + seconds;
  }

  /**
   * A new thing's label, the first time it comes along in a game. target() says where it is, on the sheet, or null
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

  /* ---------- the finished picture comes to life ---------- */

  /**
   * Each group of parts that moves is lifted off the finished picture as a little picture of its own, and where it
   * was is painted over with what's behind it. Whatever lies over the group is kept too, to go back on top, so
   * that an ear wags behind the head, and a ship rocks behind the waves.
   */
  startLife(painting) {
    const groups = [];
    const whole = this.picture(painting);
    const still = makeCanvas(whole.width, whole.height);
    const ctx = still.getContext('2d');
    ctx.drawImage(whole, 0, 0);
    const { scale } = this;
    for (const move of painting.page.life ?? []) {
      const parts = move.parts.map((id) => painting.parts.find((part) => part.id === id)).filter(Boolean);
      if (!parts.length) continue;
      // Room round the group for it to move in.
      const left = Math.max(0, Math.min(...parts.map((part) => part.box.left)) - LIFE_ROOM);
      const top = Math.max(0, Math.min(...parts.map((part) => part.box.top)) - LIFE_ROOM);
      const right = Math.min(WIDE, Math.max(...parts.map((part) => part.box.right)) + LIFE_ROOM);
      const bottom = Math.min(HIGH, Math.max(...parts.map((part) => part.box.bottom)) + LIFE_ROOM);
      const [wide, high] = [right - left, bottom - top];
      const [x, y, w, h] = [Math.round(left * scale), Math.round(top * scale), Math.round(wide * scale), Math.round(high * scale)];
      const sheet = () => {
        const canvas = makeCanvas(w, h);
        const on = canvas.getContext('2d');
        on.setTransform(scale, 0, 0, scale, -x, -y);
        on.lineJoin = 'round';
        return [canvas, on];
      };
      const lay = (on, part, grow) => {
        on.lineWidth = grow * 2;
        for (const outline of part.outlines) {
          on.beginPath();
          trace(on, outline);
          on.fill();
          on.stroke();
        }
      };
      // In the order they're drawn. The group as it shows: each of its parts adds its shape, with its line, and
      // anything else that lies over them takes its own away. What lies over the group is the other way round.
      const first = Math.min(...parts.map((part) => part.index));
      const [shown, cut] = sheet();
      const [over, above] = sheet();
      let covered = false;
      for (const part of painting.parts.slice(first)) {
        const mine = parts.includes(part);
        cut.globalCompositeOperation = mine ? 'source-over' : 'destination-out';
        lay(cut, part, mine ? LINE + 0.3 : LINE);
        above.globalCompositeOperation = mine ? 'destination-out' : 'source-over';
        lay(above, part, mine ? LINE + 0.3 : LINE);
        if (!mine && part.box.left < right && part.box.right > left && part.box.top < bottom && part.box.bottom > top) covered = true;
      }
      const from = (shape) => {
        const [canvas, on] = sheet();
        on.setTransform(1, 0, 0, 1, 0, 0);
        on.drawImage(whole, x, y, w, h, 0, 0, w, h);
        on.globalCompositeOperation = 'destination-in';
        on.drawImage(shape, 0, 0);
        return [canvas, on];
      };
      // The group's picture, cut out of the finished one, with the rest of each part, hidden till now, behind it
      // in its own paint.
      const [sprite, lift] = from(shown);
      lift.globalCompositeOperation = 'destination-over';
      lift.setTransform(scale, 0, 0, scale, -x, -y);
      for (const part of parts.slice().sort((a, b) => b.index - a.index)) {
        lift.fillStyle = this.colourOf(painting, part);
        for (const outline of part.outlines) {
          lift.beginPath();
          trace(lift, outline);
          lift.fill();
        }
      }
      const front = covered ? from(over)[0] : null;
      // And where the group was, painted over with what's behind: the part it sits on, or the paper.
      const behind = move.under ? painting.parts.find((part) => part.id === move.under) : null;
      const [cover, fill] = sheet();
      fill.setTransform(1, 0, 0, 1, 0, 0);
      fill.fillStyle = behind ? this.colourOf(painting, behind) : PAPER;
      fill.fillRect(0, 0, w, h);
      fill.globalCompositeOperation = 'destination-in';
      fill.drawImage(shown, 0, 0);
      ctx.drawImage(cover, x, y);
      const middle = move.at ?? [(Math.min(...parts.map((part) => part.box.left)) + Math.max(...parts.map((part) => part.box.right))) / 2, (Math.min(...parts.map((part) => part.box.top)) + Math.max(...parts.map((part) => part.box.bottom))) / 2];
      groups.push({ sprite, front, left: x / scale, top: y / scale, wide: w / scale, high: h / scale, move, middle });
    }
    this.life = { t: 0, still, groups };
  }

  /** The paint a part was mostly painted with, as a colour for the screen. */
  colourOf(painting, part) {
    const counts = new Map();
    for (let cell = 0; cell < painting.owner.length; cell += 1) {
      if (painting.owner[cell] === part.index && painting.paint[cell]) counts.set(painting.paint[cell], (counts.get(painting.paint[cell]) ?? 0) + 1);
    }
    const most = [...counts].sort((a, b) => b[1] - a[1])[0];
    const names = [...Object.keys(COLOURS), RAINBOW];
    const name = most ? names[most[0] - 1] : null;
    return name === RAINBOW ? RAINBOW_HEXES[4] : name ? hexOf(name) : PAPER;
  }

  /** The sheet as it is now, as a picture: the paint with the lines over it, the stars printed and whoever was found. */
  picture(painting = this.painting) {
    const canvas = makeCanvas(this.paint.width, this.paint.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(this.lines, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(this.paint, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    this.drawOnSheet(ctx, painting, { dots: false });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return canvas;
  }

  /* ---------- drawing ---------- */

  /** The sky, the hills and the grass only change with the window, so they're drawn once. */
  baseFor() {
    if (this.base) return this.base;
    const canvas = makeCanvas(this.canvas.width, this.canvas.height);
    const ctx = canvas.getContext('2d');
    ctx.scale(this.ratio, this.ratio);
    const { width: w, height: h } = this;
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.75);
    sky.addColorStop(0, '#a6dbff');
    sky.addColorStop(1, '#e9f7ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#a9dc8a';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.62);
    for (let x = 0; x <= w; x += w / 24) ctx.lineTo(x, h * (0.6 + Math.sin((x / w) * 5.2 + 0.6) * 0.035));
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.fill();
    ctx.fillStyle = '#8fcf74';
    ctx.fillRect(0, h * 0.74, w, h * 0.26);
    // A few daisies in the grass, the same every time.
    let seed = 11;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 26; i += 1) {
      const [x, y, r] = [random() * w, h * (0.77 + random() * 0.21), h * 0.004];
      ctx.fillStyle = '#ffffff';
      for (let petal = 0; petal < 5; petal += 1) {
        ctx.beginPath();
        ctx.arc(x + Math.cos((petal / 5) * Math.PI * 2) * r, y + Math.sin((petal / 5) * Math.PI * 2) * r, r * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffcf3f';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    // The board the sheet is pinned to, its legs, and the shelf the pots stand on.
    const { unit } = this;
    const sheet = this.at(0, 0);
    const wood = '#c28a52';
    const dark = '#8a5a2e';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = dark;
    ctx.lineWidth = Math.max(2, unit * 0.5);
    ctx.fillStyle = wood;
    for (const x of [14, 136]) {
      ctx.beginPath();
      ctx.rect(sheet.x + (x - 2.5) * unit, sheet.y + 96 * unit, 5 * unit, h - (sheet.y + 96 * unit) + 4);
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.roundRect(sheet.x - 3 * unit, sheet.y - 3 * unit, (WIDE + 6) * unit, (HIGH + 6) * unit, 2 * unit);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#d6a069';
    ctx.beginPath();
    ctx.roundRect(sheet.x + (ROW.left - 13) * unit, sheet.y + (ROW.y + 5.5) * unit, (ROW.right - ROW.left + 26) * unit, 7 * unit, 2 * unit);
    ctx.fill();
    ctx.stroke();
    this.base = canvas;
    return canvas;
  }

  /**
   * Draws everything. model is { painting, gloves, side, waving }: the picture as it is, the gloves to draw, each
   * { glove, x, y, look, name, open, down }, on the screen, and which hand the child plays with.
   */
  render(model = {}) {
    const { ctx, width: w, height: h, ratio, unit } = this;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.baseFor(), 0, 0, w, h);
    const { painting } = model;
    this.drawGiraffe(model);
    if (!painting || !this.paint) return;
    const sheet = this.at(0, 0);
    const [wide, high] = [WIDE * unit, HIGH * unit];
    if (this.life) {
      this.drawLife(sheet, wide, high);
    } else {
      ctx.drawImage(this.lines, sheet.x, sheet.y, wide, high);
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(this.paint, sheet.x, sheet.y, wide, high);
      ctx.globalCompositeOperation = 'source-over';
    }
    // Everything else on the desk is drawn in the sheet's own measure.
    ctx.save();
    ctx.translate(sheet.x, sheet.y);
    ctx.scale(unit, unit);
    if (!this.life) this.drawOnSheet(ctx, painting, { dots: true });
    this.drawHint(ctx, painting);
    this.drawExtras(ctx, painting);
    for (const pot of painting.pots) this.drawPot(ctx, pot, painting);
    this.drawEffects(ctx);
    ctx.restore();
    for (const each of model.gloves ?? []) this.drawGlove(each, painting);
    for (const label of this.labels) this.drawLabel(label);
  }

  /** What lies on the paint: the stars printed, whoever was hiding, and each unfinished part's dot. */
  drawOnSheet(ctx, painting, { dots }) {
    for (const star of painting.stamps) {
      ctx.save();
      ctx.translate(star.x, star.y);
      ctx.rotate((star.turn * Math.PI) / 180);
      ctx.fillStyle = hexOf(star.colour);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.45;
      ctx.lineJoin = 'round';
      this.starPath(ctx, 0, 0, 3.6);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    const { friend } = painting;
    if (friend && this.friendMark && this.friendShown > 0.02) {
      const hop = this.friendHop >= 0 && !this.reducedMotion ? Math.abs(Math.sin(Math.min(1.6, this.time - this.friendHop) * Math.PI * 2.5)) * 2.2 * Math.max(0, 1 - (this.time - this.friendHop) / 1.6) : 0;
      ctx.save();
      ctx.globalAlpha = clamp(this.friendShown, 0, 1);
      ctx.drawImage(this.friendMark, friend.at[0] - friend.size / 2, friend.at[1] - friend.size / 2 - hop, friend.size, friend.size);
      ctx.restore();
    }
    if (!dots) return;
    for (const part of painting.toPaint) {
      if (part.done) continue;
      for (const dot of part.dots) this.drawDot(ctx, part, dot, painting);
    }
  }

  /**
   * One of a part's dots, of which it has one on each piece of it: the colour it asks for, or its number, or a
   * pencil for the space to draw in.
   */
  drawDot(ctx, part, dot, painting, grow = 1) {
    const { x, y, deep } = dot;
    if (part.kind === 'free') {
      ctx.drawImage(this.marks.pencil, x - 4, y - 4, 8, 8);
      return;
    }
    const number = painting.numbers ? painting.numberOf(part.colour) : null;
    const r = clamp(deep * (number ? 0.72 : 0.5), number ? 1.5 : 1, number ? 2.9 : 2.1) * grow;
    ctx.save();
    ctx.lineWidth = 0.32;
    ctx.strokeStyle = INK;
    if (number) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.font = `700 ${r * 1.5}px Fredoka, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(number), x, y + r * 0.08);
    } else {
      this.blob(ctx, x, y, r, part.colour);
      ctx.stroke();
    }
    // Whoever is hiding here: a question mark by the dot, until they're found.
    if (part.magic && dot === part.dot && !painting.friend?.found) ctx.drawImage(this.marks.friend, x + r * 0.5, y - r - 5.2, 6, 6);
    ctx.restore();
  }

  /** A round blob of a paint: one colour, or the rainbow's, as slices. */
  blob(ctx, x, y, r, colour) {
    if (colour === RAINBOW) {
      RAINBOW_HEXES.forEach((hex, at) => {
        ctx.fillStyle = hex;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y, r, (at / RAINBOW_HEXES.length) * Math.PI * 2 - Math.PI / 2, ((at + 1) / RAINBOW_HEXES.length) * Math.PI * 2 - Math.PI / 2 + 0.02);
        ctx.fill();
      });
    } else {
      ctx.fillStyle = hexOf(colour);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }

  /** A part with the wrong paint on it shows the pot it wants: its dot grows, with a row of drops off to the pot. */
  drawHint(ctx, painting) {
    const { hint } = painting;
    if (!hint) return;
    const part = painting.parts[hint.part];
    if (!part?.dot || part.done) return;
    const beat = this.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(this.time * 3.2);
    ctx.save();
    ctx.strokeStyle = '#ffb703';
    ctx.lineWidth = 0.7;
    for (const dot of part.dots) {
      this.drawDot(ctx, part, dot, painting, 1.5 + beat * 0.35);
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, clamp(dot.deep * 0.5, 1, 2.1) * 2.4 + beat * 0.8, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffb703';
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
    const to = painting.pots[hint.pots.at(-1)];
    if (to) {
      // Drops in the paint that's wanted, from the piece of the part the brush is nearest down to the pot,
      // drifting slowly that way.
      const by = painting.brush.at;
      if (by) this.hintFrom = part.dots.slice().sort((a, b) => Math.hypot(a.x - by.x, a.y - by.y) - Math.hypot(b.x - by.x, b.y - by.y))[0];
      const from = part.dots.includes(this.hintFrom) ? this.hintFrom : part.dot;
      const drift = this.reducedMotion ? 0 : (this.time * 0.35) % 1;
      const [dx, dy] = [to.x - from.x, to.y - 9 - from.y];
      const count = Math.max(3, Math.round(Math.hypot(dx, dy) / 6));
      for (let i = 0; i < count; i += 1) {
        const along = (i + drift) / count;
        const [x, y] = [from.x + dx * along + Math.sin(along * Math.PI) * 4, from.y + dy * along];
        ctx.globalAlpha = 0.85 * Math.sin(along * Math.PI) ** 0.5;
        this.blob(ctx, x, y, 0.95, hint.colour);
        ctx.lineWidth = 0.22;
        ctx.strokeStyle = INK;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** The big brush lying on the sheet, and the paint balloons. */
  drawExtras(ctx, painting) {
    const { roller } = painting;
    const bob = (seed) => (this.reducedMotion ? 0 : Math.sin(this.time * 2 + seed) * 0.5);
    if (roller && !roller.taken) {
      ctx.save();
      ctx.translate(roller.x, roller.y + bob(0));
      ctx.rotate(-0.5);
      ctx.fillStyle = 'rgb(255 255 255 / 0.75)';
      ctx.beginPath();
      ctx.arc(0, 0, 7.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = INK;
      ctx.lineJoin = 'round';
      ctx.fillStyle = '#c28a52';
      ctx.beginPath();
      ctx.roundRect(-1.1, -0.5, 2.2, 6.6, 1);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#9aa7b4';
      ctx.beginPath();
      ctx.rect(-3.4, -1.6, 6.8, 1.5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffd43b';
      ctx.beginPath();
      ctx.moveTo(-3.4, -1.6);
      ctx.lineTo(-3.9, -5.6);
      ctx.lineTo(3.9, -5.6);
      ctx.lineTo(3.4, -1.6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    for (const balloon of painting.balloons) {
      if (balloon.popped) continue;
      const colour = painting.parts[balloon.part].colour;
      ctx.save();
      ctx.translate(balloon.x, balloon.y + bob(balloon.id * 1.7));
      ctx.lineWidth = 0.45;
      ctx.strokeStyle = INK;
      ctx.beginPath();
      ctx.moveTo(0, 4.6);
      ctx.quadraticCurveTo(1.2, 6.4, 0, 8.4);
      ctx.stroke();
      ctx.save();
      ctx.scale(0.86, 1);
      this.blob(ctx, 0, 0, 4.6, colour);
      ctx.restore();
      ctx.beginPath();
      ctx.ellipse(0, 0, 3.96, 4.6, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgb(255 255 255 / 0.6)';
      ctx.beginPath();
      ctx.ellipse(-1.4, -1.7, 0.8, 1.4, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /** A paint pot, the mixing dish or the star stamp, in its place in the row. */
  drawPot(ctx, pot, painting) {
    const { brush, dipping } = painting;
    const { r } = pot;
    const chosen = pot.kind === 'stamp' ? brush.tool === 'stamp' : pot.kind === 'colour' && brush.tool === 'paint' && brush.colour === pot.colour;
    const lift = (chosen ? 1.2 : 0) + (this.potBob.get(pot.index) ?? 0) * (this.reducedMotion ? 1 : 1 + Math.sin(this.time * 5) * 0.9);
    ctx.save();
    ctx.translate(pot.x, pot.y - lift);
    ctx.lineWidth = 0.5;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    if (pot.kind === 'colour' && !pot.ready) {
      // The place for a paint that has to be mixed: an empty pot, in dashes.
      ctx.setLineDash([1.2, 1.2]);
      ctx.strokeStyle = 'rgb(18 48 77 / 0.45)';
      ctx.fillStyle = 'rgb(255 255 255 / 0.35)';
      ctx.beginPath();
      ctx.roundRect(-r * 0.8, -r * 0.3, r * 1.6, r * 1.25, r * 0.28);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.3, r * 0.86, r * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.5;
      this.blob(ctx, 0, r * 0.4, r * 0.24, pot.colour);
      ctx.restore();
      return;
    }
    if (pot.kind === 'stamp') {
      ctx.fillStyle = '#7b8794';
      ctx.beginPath();
      ctx.roundRect(-r * 0.86, -r * 0.1, r * 1.72, r * 1.02, r * 0.2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#eef2f6';
      ctx.beginPath();
      ctx.roundRect(-r * 0.86, -r * 0.5, r * 1.72, r * 0.72, r * 0.2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffd43b';
      this.starPath(ctx, 0, -r * 0.15, r * 0.34);
      ctx.fill();
      ctx.stroke();
    } else if (pot.kind === 'dish') {
      ctx.fillStyle = '#eef2f6';
      ctx.beginPath();
      ctx.moveTo(-r * 0.95, -r * 0.12);
      ctx.quadraticCurveTo(-r * 0.7, r * 0.95, 0, r * 0.95);
      ctx.quadraticCurveTo(r * 0.7, r * 0.95, r * 0.95, -r * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.12, r * 0.95, r * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (pot.holds) {
        ctx.fillStyle = hexOf(pot.holds);
        ctx.beginPath();
        ctx.ellipse(-r * 0.08, -r * 0.08, r * 0.52, r * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = INK;
      ctx.font = `700 ${r * 0.62}px Fredoka, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('+', 0, r * 0.52);
    } else {
      // The pot, with a band of its paint round it, and the paint in the top.
      ctx.fillStyle = '#eef2f6';
      ctx.beginPath();
      ctx.roundRect(-r * 0.8, -r * 0.3, r * 1.6, r * 1.25, r * 0.28);
      ctx.fill();
      ctx.stroke();
      ctx.save();
      ctx.beginPath();
      ctx.rect(-r * 0.8, r * 0.14, r * 1.6, r * 0.5);
      ctx.clip();
      this.blob(ctx, 0, r * 0.4, r, pot.colour);
      ctx.restore();
      ctx.beginPath();
      ctx.rect(-r * 0.8, r * 0.14, r * 1.6, r * 0.5);
      ctx.stroke();
      ctx.save();
      ctx.translate(0, -r * 0.3);
      ctx.scale(1, 0.42);
      this.blob(ctx, 0, 0, r * 0.86, pot.colour);
      ctx.restore();
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.3, r * 0.86, r * 0.36, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (pot.number) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, r * 0.4, r * 0.36, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = INK;
        ctx.font = `700 ${r * 0.56}px Fredoka, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(pot.number), 0, r * 0.43);
      }
    }
    // The paint on the brush has a ring round its pot, and a hand dipping in has one closing round it.
    if (chosen) {
      ctx.strokeStyle = '#ffb703';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.ellipse(0, r * 0.2, r * 1.08, r * 1.02, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (dipping?.pot === pot && !dipping.done) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.ellipse(0, r * 0.2, r * 1.08, r * 1.02, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(dipping.for / DIP_SECONDS, 0, 1));
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * A glove on the screen, which is the brush: a ring for how big the brush is, the glove, and on its palm the
   * paint that's on it, or a star with the stamp. down is the brush on the sheet, painting. look is { ink, glove,
   * alpha } for a friend's, which is grey and see-through, or for the second player's, playing in one picture on one
   * screen, which is solid, in their own blue, with a tag of the same blue.
   */
  drawGlove({ glove, x, y, look = null, name = null, down = false, colour = null, tool = 'paint', radius = 0, ring = null, ghost = false }, painting) {
    if (!glove?.visible && !ghost) return;
    const { ctx, palmSize, unit } = this;
    const alpha = look?.alpha ?? 1;
    if (alpha <= 0.01) return;
    const size = radius * unit;
    ctx.save();
    ctx.globalAlpha = alpha * (ghost ? 0.55 : 1);
    if (size > 0 && tool === 'paint') {
      // How big the brush is: a ring, whole while it's down and in dashes while it's lifted.
      ctx.lineWidth = Math.max(2, unit * 0.45);
      ctx.strokeStyle = down ? '#ffffff' : 'rgb(18 48 77 / 0.5)';
      if (!down) ctx.setLineDash([unit * 1.4, unit * 1.4]);
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (down) {
        ctx.lineWidth = Math.max(1, unit * 0.16);
        ctx.strokeStyle = 'rgb(18 48 77 / 0.6)';
        ctx.beginPath();
        ctx.arc(x, y, size + unit * 0.3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (ring !== null) {
      // A ring closing as a star is about to print, or running down with the big brush.
      ctx.lineWidth = Math.max(3, unit * 0.7);
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#ffb703';
      ctx.beginPath();
      ctx.arc(x, y, Math.max(size, palmSize * 0.5) + unit * 1.3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(ring, 0, 1));
      ctx.stroke();
    }
    if (glove?.visible && !ghost) {
      ctx.save();
      ctx.translate(x - glove.x, y - glove.y);
      ctx.globalAlpha = alpha * (look && !look.solid ? 0.8 : 0.94);
      glove.draw(ctx, palmSize, look ? { fill: look.glove, ink: look.ink } : null);
      ctx.restore();
    }
    // The paint on the brush, in the palm of the glove.
    if (colour || tool === 'stamp') {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(palmSize, palmSize);
      ctx.lineWidth = 0.05;
      ctx.strokeStyle = look?.ink ?? INK;
      ctx.lineJoin = 'round';
      if (tool === 'stamp') {
        ctx.fillStyle = '#ffd43b';
        this.starPath(ctx, 0, 0, 0.34);
        ctx.fill();
      } else {
        this.blob(ctx, 0, 0, 0.27, colour);
      }
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    if (name) this.drawTag(name, x, y - palmSize * 1.35, alpha, look?.tag);
  }

  /** Giraffe, beside the sheet on the side away from the child's hand, waving, cheering or watching. */
  drawGiraffe(model) {
    const art = this.giraffe;
    if (!art) return;
    const { ctx, width: w, height: h } = this;
    const room = this.at(-3, 0).x;
    // On a narrow screen the sheet takes the room, and he stays out of the way.
    if (room < h * 0.2) return;
    const onLeft = model.side !== 'left';
    let frame = art.frames.stand;
    if (this.time < this.cheerUntil) frame = art.frames.cheer;
    else if (model.waving && !this.reducedMotion) frame = Math.floor(this.time * 1.4) % 2 ? art.frames.wave : art.frames.stand;
    const scale = (h * GIRAFFE.tall) / art.tall;
    ctx.save();
    ctx.translate(onLeft ? room / 2 : w - room / 2, h * 0.93);
    // His pictures turn towards the right of the screen, so on the right he's flipped, to turn to the sheet.
    ctx.scale(onLeft ? scale : -scale, scale);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(frame, -art.foot.x, -art.foot.y);
    ctx.restore();
  }

  /** The finished picture, with each group that moves swaying, bobbing, flapping or turning over the rest. */
  drawLife(sheet, wide, high) {
    const { ctx, life, unit } = this;
    ctx.drawImage(life.still, sheet.x, sheet.y, wide, high);
    // It comes in gently and goes out gently, so nothing jumps.
    const strength = this.reducedMotion ? 0 : Math.sin(clamp(life.t / LIFE_SECONDS, 0, 1) * Math.PI) ** 0.6;
    for (const group of life.groups) {
      const { move } = group;
      const t = Math.max(0, life.t - (move.late ?? 0));
      const swing = Math.sin(t * 4.4) * strength;
      ctx.save();
      ctx.translate(sheet.x + group.middle[0] * unit, sheet.y + group.middle[1] * unit);
      if (move.move === 'sway') ctx.rotate((move.by * Math.PI * swing) / 180);
      else if (move.move === 'bob') ctx.translate(0, -move.by * unit * swing);
      else if (move.move === 'hop') ctx.translate(0, -move.by * unit * Math.abs(swing));
      else if (move.move === 'pulse') ctx.scale(1 + move.by * swing, 1 + move.by * swing);
      else if (move.move === 'flap') ctx.scale(1 - move.by * (0.5 - 0.5 * Math.cos(t * 5.5)) * strength, 1);
      else if (move.move === 'flicker') ctx.scale(move.sideways ? 1 + move.by * swing : 1, move.sideways ? 1 : 1 + move.by * swing);
      else if (move.move === 'spin') ctx.rotate((move.by * Math.PI * ease(clamp(life.t / LIFE_SECONDS, 0, 1))) / 180);
      ctx.drawImage(group.sprite, (group.left - group.middle[0]) * unit, (group.top - group.middle[1]) * unit, group.wide * unit, group.high * unit);
      ctx.restore();
      // What lies over the group goes back on top of it, where it always was.
      if (group.front) ctx.drawImage(group.front, sheet.x + group.left * unit, sheet.y + group.top * unit, group.wide * unit, group.high * unit);
    }
  }

  starPath(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const reach = i % 2 ? r * 0.48 : r;
      ctx.lineTo(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach);
    }
    ctx.closePath();
  }

  drawEffects(ctx) {
    for (const effect of this.effects) {
      const share = 1 - effect.life / effect.total;
      ctx.save();
      ctx.globalAlpha = clamp(effect.life / effect.total, 0, 1);
      if (effect.kind === 'sparkle') {
        ctx.fillStyle = effect.colour;
        ctx.strokeStyle = 'rgb(18 48 77 / 0.5)';
        ctx.lineWidth = 0.2;
        for (let i = 0; i < 6; i += 1) {
          const angle = (i / 6) * Math.PI * 2 + 0.4;
          const out = 3 + share * 6;
          this.starPath(ctx, effect.x + Math.cos(angle) * out, effect.y + Math.sin(angle) * out, 1.5 * (1 - share * 0.5));
          ctx.fill();
          ctx.stroke();
        }
      } else if (effect.kind === 'splash') {
        ctx.fillStyle = effect.colour;
        for (let i = 0; i < 7; i += 1) {
          const angle = (i / 7) * Math.PI * 2 + 0.3;
          const out = (2 + share * 7) * effect.big;
          ctx.beginPath();
          ctx.arc(effect.x + Math.cos(angle) * out, effect.y + Math.sin(angle) * out - Math.sin(share * Math.PI) * 1.5, 0.9 * effect.big * (1 - share * 0.4), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (effect.kind === 'heart') {
        const size = 5 + share * 2;
        ctx.drawImage(this.marks.heart, effect.x - size / 2, effect.y - size / 2 - share * 9, size, size);
      }
      ctx.restore();
    }
  }

  /** A name over a glove, white, or in a colour of its own with white writing. */
  drawTag(text, x, y, alpha = 1, colour = null) {
    const { ctx, palmSize } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `600 ${Math.round(Math.max(13, palmSize * 0.4))}px Fredoka, sans-serif`;
    const wide = ctx.measureText(text).width + 18;
    const high = Math.max(22, palmSize * 0.62);
    ctx.fillStyle = colour ?? 'rgb(255 255 255 / 0.92)';
    ctx.beginPath();
    ctx.roundRect(x - wide / 2, y - high, wide, high, high / 2);
    ctx.fill();
    ctx.fillStyle = colour ? '#ffffff' : INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y - high / 2 + 1);
    ctx.restore();
  }

  drawLabel(label) {
    const where = label.target();
    if (!where) return;
    const { ctx, palmSize, height: h } = this;
    const fade = clamp(Math.min((LABEL_SECONDS - label.life) / 0.3, label.life / 0.4), 0, 1);
    const { x, y } = this.at(where.x, where.y);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.font = `600 ${Math.round(Math.max(15, palmSize * 0.5))}px Fredoka, 'Noto Sans Georgian', sans-serif`;
    const wide = ctx.measureText(label.text).width + 26;
    const high = Math.max(30, palmSize * 0.92);
    const left = clamp(x - wide / 2, 8, this.width - wide - 8);
    const top = clamp(y - h * 0.075 - high, h * 0.17, h - high - 8);
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
