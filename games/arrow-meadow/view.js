// Arrow Meadow, drawn in 2D, from the side: the meadow with the fair behind it, Giraffe with his bow at one end, the
// dotted line that says where his arrow would go, the targets, the arrows, and whatever the level has brought.
//
// The rules work in a meadow WORLD.wide across and 1 high, with the archer at its left (meadow.js). This fits that
// into the screen, and turns it round for the hand in play: the string hand is on its own side of the picture, as
// in a mirror, so with the right hand in play Giraffe stands on the right and shoots to the left.
//
// Nothing flashes: an arrow is a thin line, a hit is a few small stars, a balloon pops with a ring that fades, and
// whatever comes and goes fades or slides.
import { INK } from '../../core/glove.js';
import { ARROW_LONG, BOW, EXTRAS, gripAt, LABELS, WORLD } from './meadow.js';

const LABEL_SECONDS = 2.6;
const PRIZE_FLY_SECONDS = 0.9;
// Giraffe: where his feet are, and how tall his body is without his neck, in screen heights.
export const ARCHER = { x: 0.135, tall: 0.31 };
// The bow: how far its tips are from the grip, how far back they sit with the bow at rest and drawn right back, and
// how far back the string is at rest. Drawn right back, the string is at the string hand: see BOW in meadow.js.
const LIMB = { long: 0.125, back: [0.03, 0.06], string: 0.03 };
const SKY = ['#8fd3ff', '#dff3ff'];
const BALLOONS = ['#ff6b6b', '#ffd23f', '#4dabf7', '#b197fc', '#ff9ec4'];
const RINGS = [['#ffffff', 1], ['#2b3440', 0.8], ['#4dabf7', 0.6], ['#ff6b6b', 0.4], ['#ffd23f', 0.2]];
const GOLDEN = [['#fff3bf', 1], ['#ffd23f', 0.8], ['#f59f00', 0.6], ['#ffd23f', 0.4], ['#fff3bf', 0.2]];
const MARKS = { star: '⭐', trophy: '🏆' };
const GHOST = { wood: '#9aa7b8', ink: '#6f7c8d' };

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const ease = (share) => share * share * (3 - 2 * share);
const mix = (from, to, share) => from + (to - from) * share;

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

export class MeadowView {
  /** language() says which language a new thing's label is in, and prizeTarget() where the stars' tally is. */
  constructor(canvas, { language = () => 'en', prizeTarget = () => ({ x: 80, y: 40 }) } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.language = language;
    this.prizeTarget = prizeTarget;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.time = 0;
    this.flip = false;
    this.castle = false;
    this.base = null;
    this.effects = [];
    this.flying = [];
    this.labels = [];
    this.introduced = new Set();
    this.wanted = new Map();
    this.marks = Object.fromEntries(Object.entries(MARKS).map(([key, mark]) => [key, makeMark(mark)]));
    this.archer = null; // Giraffe's pictures, if they could be drawn.
    this.gladUntil = 0;
    this.partyUntil = 0;
    this.partyNext = 0;
    this.pull = 0; // How far the string is back, as it's drawn: it follows the hands, and springs back.
    this.hold = 0; // How much the string hand has hold of the string, from 0 to 1.
    this.wind = 0;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.ratio);
    this.canvas.height = Math.round(this.height * this.ratio);
    // The whole meadow fits, whatever the screen: a taller one has more sky and more grass.
    this.scale = Math.min(this.width / WORLD.wide, this.height);
    this.left = (this.width - WORLD.wide * this.scale) / 2;
    this.top = (this.height - this.scale) * 0.6;
    this.palmSize = Math.max(40, this.height * 0.085);
    this.base = null;
  }

  /** Which way round the meadow is: turned, the archer is on the right. And whether the castle stands at its far end. */
  setScene({ flip = this.flip, castle = this.castle } = {}) {
    if (flip !== this.flip || castle !== this.castle) this.base = null;
    this.flip = flip;
    this.castle = castle;
  }

  /** A new contest: nothing left over from the last one. */
  reset() {
    this.effects = [];
    this.flying = [];
    this.labels = [];
    this.introduced = new Set();
    this.wanted = new Map();
    this.gladUntil = 0;
    this.partyUntil = 0;
    this.pull = 0;
    this.hold = 0;
  }

  /** Where a place in the meadow is on the screen. */
  at(x, y) {
    return { x: this.left + (this.flip ? WORLD.wide - x : x) * this.scale, y: this.top + y * this.scale };
  }

  /** 1 when things in the meadow go to the right of the screen as they go away from the archer, and -1 turned round. */
  get way() {
    return this.flip ? -1 : 1;
  }

  update(dt, { bow = null, wind = 0 } = {}) {
    this.time += dt;
    for (const effect of this.effects) effect.life -= dt;
    this.effects = this.effects.filter((effect) => effect.life > 0);
    for (const flight of this.flying) flight.t += dt;
    this.flying = this.flying.filter((flight) => flight.t < PRIZE_FLY_SECONDS);
    for (const label of this.labels) label.life -= dt;
    this.labels = this.labels.filter((label) => label.life > 0 && label.target());
    this.nextLabel();
    // The string follows the hands quickly, and springs back quicker still once it's let go.
    const nocked = Boolean(bow?.nocked);
    const wanted = nocked ? bow.draw : 0;
    this.pull += (wanted - this.pull) * (1 - Math.exp(-dt * (wanted < this.pull ? 30 : 16)));
    this.hold += ((nocked ? 1 : 0) - this.hold) * (1 - Math.exp(-dt * 14));
    this.wind += (wind - this.wind) * (1 - Math.exp(-dt * 2.5));
    // The party once the contest is won: small stars here and there, one after another.
    if (this.time < this.partyUntil && this.time >= this.partyNext) {
      this.partyNext = this.time + 0.16;
      const turn = this.time * 7.3;
      this.sparkle(this.width * (0.5 + 0.36 * Math.sin(turn)), this.height * (0.4 + 0.2 * Math.cos(turn * 1.7)), ['#ffe066', '#ff9ec4', '#9ad8ff'][Math.floor(turn) % 3]);
    }
  }

  /* ---------- what happens, shown ---------- */

  /** A few small stars, as something good happens. */
  sparkle(x, y, colour = '#ffe066') {
    if (this.effects.length < 40) this.effects.push({ kind: 'sparkle', x, y, life: 0.7, total: 0.7, colour });
  }

  /** A hit: a ring of stars going out from where the arrow struck. */
  burst(x, y, colour = '#ffe066') {
    this.effects.push({ kind: 'burst', x, y, life: 0.8, total: 0.8, colour });
  }

  /** A balloon pops: a ring, going out and fading, in its own colour. */
  pop(x, y, colour = '#ffffff') {
    this.effects.push({ kind: 'pop', x, y, life: 0.45, total: 0.45, colour });
  }

  /** An arrow lands in the grass, or bonks off something: a little puff. */
  puff(x, y, colour = 'rgb(255 255 255 / 0.8)') {
    if (this.effects.length < 40) this.effects.push({ kind: 'puff', x, y, life: 0.45, total: 0.45, colour });
  }

  /** Stars fly up to the tally, from where they were won: count of them, one after another. */
  prize(kind, x, y, count = 1) {
    if (!this.marks[kind]) return;
    const at = this.at(x, y);
    for (let n = 0; n < count; n += 1) this.flying.push({ kind, x: at.x + (n - (count - 1) / 2) * this.scale * 0.05, y: at.y, t: -n * 0.12 });
  }

  /** Giraffe is pleased for a while. */
  glad(seconds = 1.1) {
    this.gladUntil = Math.max(this.gladUntil, this.time + seconds);
  }

  /** The contest is won: Giraffe is pleased and stars go off, until the finish card. */
  party(seconds) {
    this.partyUntil = this.time + seconds;
    this.partyNext = this.time;
    this.glad(seconds + 1);
  }

  /**
   * A new thing's label, the first time it comes along in a game. target() says where it is, in the meadow, or null
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

  /* ---------- the meadow itself, which only changes with the window ---------- */

  baseFor() {
    if (this.base) return this.base;
    const canvas = document.createElement('canvas');
    canvas.width = this.canvas.width;
    canvas.height = this.canvas.height;
    const ctx = canvas.getContext('2d');
    ctx.scale(this.ratio, this.ratio);
    this.drawMeadow(ctx);
    this.base = canvas;
    return canvas;
  }

  /** The sky, the hills, the fair's tents and bunting, and the grass, the same every time. */
  drawMeadow(ctx) {
    const { width: w, height: h, scale: s } = this;
    let seed = 23;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const ground = this.at(0, WORLD.ground).y;
    const horizon = this.at(0, 0.7).y;
    // Across the screen as a share of the meadow, so a screen wider than the meadow has more of everything.
    const X = (x) => this.at(x, 0).x;
    const Y = (y) => this.at(0, y).y;
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, SKY[0]);
    sky.addColorStop(1, SKY[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    // The sun, low over the far end, and a few still clouds.
    const sun = this.at(1.56, 0.13);
    const glow = ctx.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, s * 0.16);
    glow.addColorStop(0, 'rgb(255 244 200 / 0.9)');
    glow.addColorStop(1, 'rgb(255 244 200 / 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sun.x - s * 0.2, sun.y - s * 0.2, s * 0.4, s * 0.4);
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.arc(sun.x, sun.y, s * 0.045, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgb(255 255 255 / 0.85)';
    for (const [x, y, size] of [[0.42, 0.1, 1], [0.98, 0.16, 0.75], [1.3, 0.07, 0.6], [-0.1, 0.2, 0.7], [1.9, 0.2, 0.8]]) {
      for (const [dx, dy, r] of [[-0.05, 0.006, 0.026], [0, -0.008, 0.036], [0.05, 0.006, 0.026], [0.024, 0.012, 0.03], [-0.024, 0.012, 0.03]]) {
        ctx.beginPath();
        ctx.ellipse(X(x) + s * dx * size, Y(y + dy * size), s * r * size * 1.5, s * r * size, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Two rows of hills.
    const hills = (colour, base, rise, wave, shift) => {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let px = 0; px <= w + 8; px += 8) {
        const x = (px - this.left) / s;
        ctx.lineTo(px, Y(base - rise * (0.5 + 0.5 * Math.sin(x * wave + shift)) - rise * 0.3 * Math.sin(x * wave * 2.3 + shift * 2)));
      }
      ctx.lineTo(w, h);
      ctx.fill();
    };
    hills('#b9e3a0', 0.66, 0.09, 2.1, 0.6);
    hills('#9fd685', 0.7, 0.06, 3.4, 2.2);
    // Round trees along the nearer hills.
    for (let n = 0; n < 14; n += 1) {
      const x = -0.3 + n * 0.19 + random() * 0.08;
      const y = 0.685 + random() * 0.02;
      ctx.fillStyle = '#8a6a48';
      ctx.fillRect(X(x) - s * 0.004, Y(y), s * 0.008, s * 0.03);
      ctx.fillStyle = n % 2 ? '#5aae5c' : '#4f9e54';
      ctx.beginPath();
      ctx.ellipse(X(x), Y(y - 0.012), s * 0.026, s * 0.034, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // The fair: striped tents, with a pennant each.
    for (const [x, wide, tall, a, b] of [[0.62, 0.11, 0.1, '#ff8787', '#fff5f5'], [0.98, 0.14, 0.12, '#74c0fc', '#f1f8ff'], [1.3, 0.1, 0.09, '#ffd43b', '#fff9db'], [0.06, 0.1, 0.09, '#b197fc', '#f3f0ff']]) {
      const [cx, base] = [X(x), Y(0.745)];
      const [half, high] = [s * wide * 0.5, s * tall];
      for (let stripe = 0; stripe < 6; stripe += 1) {
        ctx.fillStyle = stripe % 2 ? a : b;
        ctx.beginPath();
        ctx.moveTo(cx, base - high);
        ctx.lineTo(cx - half + (stripe * half) / 3, base - high * 0.42);
        ctx.lineTo(cx - half + ((stripe + 1) * half) / 3, base - high * 0.42);
        ctx.fill();
        ctx.fillRect(cx - half + (stripe * half) / 3, base - high * 0.42 - 0.5, half / 3 + 0.5, high * 0.42 + 1);
      }
      ctx.strokeStyle = '#8a6a48';
      ctx.lineWidth = Math.max(1, s * 0.003);
      ctx.beginPath();
      ctx.moveTo(cx, base - high);
      ctx.lineTo(cx, base - high - s * 0.03);
      ctx.stroke();
      ctx.fillStyle = a;
      ctx.beginPath();
      ctx.moveTo(cx, base - high - s * 0.03);
      ctx.lineTo(cx + s * 0.022, base - high - s * 0.022);
      ctx.lineTo(cx, base - high - s * 0.014);
      ctx.fill();
    }
    // Bunting, strung from pole to pole behind the meadow.
    const poles = [0.44, 0.8, 1.14, 1.5];
    ctx.strokeStyle = '#a08060';
    ctx.lineWidth = Math.max(1.5, s * 0.004);
    for (const x of poles) {
      ctx.beginPath();
      ctx.moveTo(X(x), Y(0.75));
      ctx.lineTo(X(x), Y(0.6));
      ctx.stroke();
    }
    for (let n = 0; n < poles.length - 1; n += 1) {
      const [from, to] = [poles[n], poles[n + 1]];
      ctx.strokeStyle = 'rgb(120 100 80 / 0.7)';
      ctx.lineWidth = Math.max(1, s * 0.002);
      ctx.beginPath();
      ctx.moveTo(X(from), Y(0.6));
      ctx.quadraticCurveTo(X((from + to) / 2), Y(0.66), X(to), Y(0.6));
      ctx.stroke();
      for (let flag = 1; flag < 9; flag += 1) {
        const share = flag / 9;
        const x = X(mix(from, to, share));
        const y = Y(0.6 + 0.12 * share * (1 - share));
        ctx.fillStyle = ['#ff8787', '#ffd43b', '#74c0fc', '#8ce99a', '#b197fc'][(flag + n) % 5];
        ctx.beginPath();
        ctx.moveTo(x - s * 0.008, y);
        ctx.lineTo(x + s * 0.008, y);
        ctx.lineTo(x, y + s * 0.02);
        ctx.fill();
      }
    }
    // The grass, in two greens, with the line the targets stand on a little way down it.
    ctx.fillStyle = '#8fd16f';
    ctx.fillRect(0, Y(0.745), w, h);
    const grass = ctx.createLinearGradient(0, Y(0.78), 0, h);
    grass.addColorStop(0, '#7cc65c');
    grass.addColorStop(1, '#63b247');
    ctx.fillStyle = grass;
    ctx.fillRect(0, Y(0.79), w, h);
    // Mown stripes, tufts and a few flowers.
    ctx.fillStyle = 'rgb(255 255 255 / 0.06)';
    for (let px = 0; px < w; px += s * 0.2) ctx.fillRect(px, Y(0.79), s * 0.1, h);
    for (let n = 0; n < 90; n += 1) {
      const x = random() * w;
      const y = ground + (random() * 0.9 - 0.05) * (h - ground + s * 0.04);
      ctx.strokeStyle = n % 3 ? '#5aa53f' : '#96d877';
      ctx.lineWidth = Math.max(1, s * 0.0025);
      ctx.beginPath();
      ctx.moveTo(x - s * 0.006, y);
      ctx.lineTo(x - s * 0.002, y - s * 0.014);
      ctx.moveTo(x, y);
      ctx.lineTo(x + s * 0.001, y - s * 0.018);
      ctx.moveTo(x + s * 0.006, y);
      ctx.lineTo(x + s * 0.004, y - s * 0.013);
      ctx.stroke();
    }
    for (let n = 0; n < 26; n += 1) {
      const x = random() * w;
      const y = ground + s * 0.03 + random() * Math.max(1, h - ground - s * 0.04);
      ctx.fillStyle = ['#ffffff', '#ffe066', '#ffa8c5', '#ffffff'][n % 4];
      for (let petal = 0; petal < 5; petal += 1) {
        const turn = (petal / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(x + Math.cos(turn) * s * 0.005, y + Math.sin(turn) * s * 0.005, s * 0.0038, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#f59f00';
      ctx.beginPath();
      ctx.arc(x, y, s * 0.003, 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.castle) this.drawCastle(ctx);
  }

  /** The castle at the far end of the meadow, at level 10: two towers, a wall between them and a gate. */
  drawCastle(ctx) {
    const { scale: s } = this;
    const way = this.way;
    const { x, y } = this.at(1.6, WORLD.ground);
    const stone = '#d9dde4';
    const shade = '#b9c0cb';
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(way, 1);
    ctx.lineWidth = Math.max(1.5, s * 0.004);
    ctx.strokeStyle = '#7d8794';
    const block = (left, top, wide, high, colour = stone) => {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.rect(left * s, top * s, wide * s, high * s);
      ctx.fill();
      ctx.stroke();
    };
    const teeth = (left, top, wide, count) => {
      const each = wide / (count * 2 - 1);
      for (let n = 0; n < count; n += 1) block(left + n * each * 2, top - 0.022, each, 0.024);
    };
    // The wall, with its gate.
    block(-0.13, -0.24, 0.3, 0.26, shade);
    teeth(-0.13, -0.24, 0.3, 6);
    ctx.fillStyle = '#6b4a2b';
    ctx.beginPath();
    ctx.moveTo(-0.035 * s, 0.01 * s);
    ctx.lineTo(-0.035 * s, -0.09 * s);
    ctx.arc(0.02 * s, -0.09 * s, 0.055 * s, Math.PI, 0);
    ctx.lineTo(0.075 * s, 0.01 * s);
    ctx.fill();
    ctx.stroke();
    // Its towers, with a flag on each.
    for (const [left, tall, colour] of [[-0.19, 0.42, '#ff8787'], [0.13, 0.36, '#74c0fc']]) {
      block(left, -tall, 0.1, tall + 0.02);
      teeth(left - 0.008, -tall, 0.116, 3);
      ctx.fillStyle = '#4a5560';
      ctx.fillRect((left + 0.04) * s, (-tall + 0.07) * s, 0.02 * s, 0.045 * s);
      ctx.beginPath();
      ctx.moveTo((left + 0.05) * s, (-tall - 0.02) * s);
      ctx.lineTo((left + 0.05) * s, (-tall - 0.1) * s);
      ctx.stroke();
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.moveTo((left + 0.05) * s, (-tall - 0.1) * s);
      ctx.lineTo((left + 0.1) * s, (-tall - 0.082) * s);
      ctx.lineTo((left + 0.05) * s, (-tall - 0.064) * s);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ---------- each frame ---------- */

  /**
   * meadow is the rules, bow what the hands are asking for (see bow.js), and aim the arc an arrow let go now would
   * fly, from meadow.aimFor, or null: the whole of it once the bow is ready to shoot, and only the start of it
   * until then. ghosts are friends' bows, each { angle, draw, nocked, name, alpha, row }.
   */
  render({ meadow, bow = null, aim = null, ready = false, ghosts = [], playing = true }) {
    const { ctx } = this;
    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    ctx.drawImage(this.baseFor(), 0, 0, this.width, this.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (meadow.plan.wind) this.drawFlag();
    if (meadow.bird) this.drawBird(meadow, meadow.bird);
    const targets = [...meadow.targets].sort((a, b) => a.id - b.id);
    for (const target of targets) this.drawApparatus(meadow, target);
    for (const target of targets) if (target.kind !== 'gift') this.drawTarget(meadow, target, ready && playing && aim?.target === target);
    for (const arrow of meadow.arrows) if (arrow.state !== 'flying') this.drawArrow(arrow);
    for (const ghost of ghosts) this.drawGhostBow(ghost);
    this.drawArcher(bow, aim, playing, ready);
    for (const arrow of meadow.arrows) if (arrow.state === 'flying') this.drawArrow(arrow);
    this.drawEffects();
    this.drawFlying();
    for (const label of this.labels) this.drawLabel(label);
  }

  /** A soft round glow. */
  drawGlow(x, y, r, colour) {
    const { ctx } = this;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
    glow.addColorStop(0, colour);
    glow.addColorStop(1, colour.replace(/\/ [\d.]+\)/, '/ 0)'));
    ctx.fillStyle = glow;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  /** How much of itself a target shows: it grows as it comes, and shrinks away once it's hit. */
  shownShare(target) {
    const coming = clamp(target.since / 0.35, 0, 1);
    // One that has stood long enough, or is left when the quiver is empty, shrinks away.
    if (target.state === 'leaving') return 1 - ease(clamp(target.since / 0.5, 0, 1));
    if (target.state === 'hit' || target.state === 'asked') return target.state === 'hit' ? 1 - ease(clamp((target.since - 0.45) / 0.35, 0, 1)) : 1;
    return ease(coming);
  }

  /** What stands with a target, behind it: its stand, cart, post, string, wall or windmill. */
  drawApparatus(meadow, target) {
    const { ctx, scale: s } = this;
    const where = meadow.whereAt(target);
    const { x, y } = this.at(where.x, where.y);
    const ground = this.at(0, WORLD.ground).y;
    const share = this.shownShare(target);
    if (share <= 0) return;
    const r = target.r * s;
    ctx.save();
    ctx.globalAlpha = share;
    ctx.strokeStyle = '#8a5a2b';
    ctx.lineWidth = Math.max(2, s * 0.008);
    if (target.kind === 'butt' || target.kind === 'far' || target.kind === 'wall') {
      // An easel: two legs out in front, and one behind.
      ctx.beginPath();
      ctx.moveTo(x, y - r * 0.2);
      ctx.lineTo(x - r * 0.75, ground);
      ctx.moveTo(x, y - r * 0.2);
      ctx.lineTo(x + r * 0.75, ground);
      ctx.stroke();
      ctx.strokeStyle = '#74491f';
      ctx.beginPath();
      ctx.moveTo(x, y - r * 0.2);
      ctx.lineTo(x + this.way * r * 0.2, ground - s * 0.012);
      ctx.stroke();
    }
    if (target.kind === 'far') {
      // A little flag over it, to say where it is from far off.
      ctx.strokeStyle = '#74491f';
      ctx.lineWidth = Math.max(1.5, s * 0.005);
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x, y - r - s * 0.07);
      ctx.stroke();
      ctx.fillStyle = '#ff6b6b';
      ctx.beginPath();
      ctx.moveTo(x, y - r - s * 0.07);
      ctx.lineTo(x - this.way * s * 0.045, y - r - s * 0.055);
      ctx.lineTo(x, y - r - s * 0.04);
      ctx.fill();
    }
    if (target.kind === 'roller') {
      // A cart: a board on two wheels, with a post up to the target.
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, ground - s * 0.03);
      ctx.stroke();
      ctx.fillStyle = '#c98b4a';
      ctx.strokeStyle = '#74491f';
      ctx.lineWidth = Math.max(1.5, s * 0.005);
      ctx.beginPath();
      ctx.roundRect(x - r * 1.05, ground - s * 0.045, r * 2.1, s * 0.022, s * 0.006);
      ctx.fill();
      ctx.stroke();
      const turn = (where.x / 0.02) * this.way;
      for (const side of [-1, 1]) {
        const [wx, wy, wr] = [x + side * r * 0.7, ground - s * 0.018, s * 0.018];
        ctx.fillStyle = '#4a5560';
        ctx.beginPath();
        ctx.arc(wx, wy, wr, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#dfe5ec';
        ctx.lineWidth = Math.max(1, s * 0.003);
        ctx.beginPath();
        for (let spoke = 0; spoke < 3; spoke += 1) {
          const angle = turn + (spoke * Math.PI) / 3;
          ctx.moveTo(wx - Math.cos(angle) * wr * 0.8, wy - Math.sin(angle) * wr * 0.8);
          ctx.lineTo(wx + Math.cos(angle) * wr * 0.8, wy + Math.sin(angle) * wr * 0.8);
        }
        ctx.stroke();
      }
    }
    if (target.kind === 'balloon') {
      // Its string, down to a peg in the grass.
      ctx.strokeStyle = 'rgb(255 255 255 / 0.9)';
      ctx.lineWidth = Math.max(1, s * 0.003);
      ctx.beginPath();
      ctx.moveTo(x, y + r * 1.15);
      ctx.bezierCurveTo(x + r * 0.5, y + (ground - y) * 0.4, x - r * 0.5, y + (ground - y) * 0.7, x, ground);
      ctx.stroke();
    }
    if (target.kind === 'bell') {
      // A tall post with an arm, and the bell hanging from it.
      const post = this.at(EXTRAS.bell.post, 0).x;
      ctx.strokeStyle = '#8a5a2b';
      ctx.lineWidth = Math.max(3, s * 0.014);
      ctx.beginPath();
      ctx.moveTo(post, ground);
      ctx.lineTo(post, y - r * 2.4);
      ctx.lineTo(x, y - r * 2.4);
      ctx.stroke();
      ctx.lineWidth = Math.max(1.5, s * 0.004);
      ctx.beginPath();
      ctx.moveTo(x, y - r * 2.4);
      ctx.lineTo(x, y - r);
      ctx.stroke();
    }
    if (target.wall) this.drawWall(target.wall);
    if (target.mill) this.drawMill(target.mill, meadow.time);
    ctx.restore();
  }

  /** A wall of hay bales. */
  drawWall(wall) {
    const { ctx, scale: s } = this;
    const from = this.at(wall.x0, wall.top);
    const to = this.at(wall.x1, WORLD.ground);
    const [left, wide] = [Math.min(from.x, to.x), Math.abs(to.x - from.x)];
    const rows = 4;
    const high = (to.y - from.y) / rows;
    for (let row = 0; row < rows; row += 1) {
      const top = from.y + row * high;
      const out = row % 2 ? s * 0.006 : 0;
      ctx.fillStyle = row % 2 ? '#f2cf6b' : '#f6d97f';
      ctx.strokeStyle = '#b98a2e';
      ctx.lineWidth = Math.max(1.5, s * 0.004);
      ctx.beginPath();
      ctx.roundRect(left - s * 0.012 - out, top, wide + s * 0.024 + out * 2, high, s * 0.008);
      ctx.fill();
      ctx.stroke();
      // The twine round each bale, and a few straws.
      ctx.strokeStyle = 'rgb(160 110 30 / 0.55)';
      ctx.lineWidth = Math.max(1, s * 0.0025);
      ctx.beginPath();
      ctx.moveTo(left + wide * 0.25, top + 1);
      ctx.lineTo(left + wide * 0.25, top + high - 1);
      ctx.moveTo(left + wide * 0.75, top + 1);
      ctx.lineTo(left + wide * 0.75, top + high - 1);
      ctx.stroke();
    }
  }

  /** A windmill: its tower, and its four sails going round the target at the middle of them. */
  drawMill(mill, time) {
    const { ctx, scale: s } = this;
    const hub = this.at(mill.x, mill.y);
    const ground = this.at(0, WORLD.ground).y;
    // The tower, wider at the bottom, with a door.
    ctx.fillStyle = '#f1e3c8';
    ctx.strokeStyle = '#8a6a48';
    ctx.lineWidth = Math.max(1.5, s * 0.005);
    ctx.beginPath();
    ctx.moveTo(hub.x - s * 0.03, hub.y + s * 0.04);
    ctx.lineTo(hub.x + s * 0.03, hub.y + s * 0.04);
    ctx.lineTo(hub.x + s * 0.062, ground);
    ctx.lineTo(hub.x - s * 0.062, ground);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#c0703a';
    ctx.beginPath();
    ctx.moveTo(hub.x - s * 0.05, hub.y + s * 0.05);
    ctx.lineTo(hub.x, hub.y - s * 0.03);
    ctx.lineTo(hub.x + s * 0.05, hub.y + s * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#8a5a2b';
    ctx.beginPath();
    ctx.roundRect(hub.x - s * 0.018, ground - s * 0.07, s * 0.036, s * 0.07, [s * 0.018, s * 0.018, 0, 0]);
    ctx.fill();
    // The sails: a bare arm from the middle, and then the sail itself, a frame with cloth in it.
    const turn = (mill.phase + mill.rate * time) * this.way;
    ctx.save();
    ctx.translate(hub.x, hub.y);
    ctx.rotate(this.flip ? Math.PI + turn : turn);
    for (let sail = 0; sail < 4; sail += 1) {
      ctx.rotate(Math.PI / 2);
      ctx.strokeStyle = '#7a5230';
      ctx.lineWidth = Math.max(2, s * 0.008);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(mill.r * s, 0);
      ctx.stroke();
      ctx.fillStyle = '#fff7e6';
      ctx.strokeStyle = '#7a5230';
      ctx.lineWidth = Math.max(1.5, s * 0.004);
      ctx.beginPath();
      ctx.rect(mill.inner * s, -mill.blade * s, (mill.r - mill.inner) * s, mill.blade * 2 * s);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      for (let bar = 1; bar < 4; bar += 1) {
        const out = mix(mill.inner, mill.r, bar / 4) * s;
        ctx.moveTo(out, -mill.blade * s);
        ctx.lineTo(out, mill.blade * s);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /** A target's rings, on a round face. */
  drawRings(x, y, r, rings = RINGS) {
    const { ctx, scale: s } = this;
    // The straw behind the face, showing round its edge.
    ctx.fillStyle = '#e9c46a';
    ctx.strokeStyle = '#b98a2e';
    ctx.lineWidth = Math.max(1.5, s * 0.004);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    for (const [colour, share] of rings) {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.9 * share, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** One target: as big as it's shown, lit when the dotted line ends on it, and with whatever it is on top. */
  drawTarget(meadow, target, aimedAt) {
    const { ctx, scale: s } = this;
    const where = meadow.whereAt(target);
    const { x, y } = this.at(where.x, where.y);
    const share = this.shownShare(target);
    if (share <= 0) return;
    const r = target.r * s * (0.6 + 0.4 * share);
    const hit = target.state === 'hit' || target.state === 'asked';
    ctx.save();
    ctx.globalAlpha = share;
    // The one the arrow would hit has a ring round it, as well as the dotted line ending on it.
    if (aimedAt && !hit) {
      ctx.strokeStyle = 'rgb(255 255 255 / 0.95)';
      ctx.lineWidth = Math.max(3, s * 0.009);
      ctx.beginPath();
      ctx.arc(x, y, r + s * 0.014, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#2f9e44';
      ctx.lineWidth = Math.max(2, s * 0.005);
      ctx.beginPath();
      ctx.arc(x, y, r + s * 0.014, 0, Math.PI * 2);
      ctx.stroke();
    }
    // A hit one wobbles a little, with the arrow in it.
    const wobble = hit && !this.reducedMotion ? Math.sin(target.since * 28) * 0.08 * Math.max(0, 1 - target.since / 0.5) : 0;
    ctx.translate(x, y);
    ctx.rotate(wobble);
    if (target.kind === 'balloon') {
      if (!hit) this.drawBalloon(r, BALLOONS[(target.colour ?? 0) % BALLOONS.length]);
    } else if (target.kind === 'bell') {
      this.drawBell(r, hit ? Math.sin(target.since * 22) * 0.5 * Math.max(0, 1 - target.since / 0.7) : 0);
    } else if (target.kind === 'castle') {
      this.drawGlow(0, 0, r * 2.2, 'rgb(255 226 110 / 0.5)');
      this.drawRings(0, 0, r, GOLDEN);
    } else {
      this.drawRings(0, 0, r);
    }
    ctx.restore();
  }

  drawBalloon(r, colour) {
    const { ctx, scale: s } = this;
    ctx.fillStyle = colour;
    ctx.strokeStyle = 'rgb(18 48 77 / 0.35)';
    ctx.lineWidth = Math.max(1.5, s * 0.004);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.88, r * 1.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-r * 0.12, r * 1.02);
    ctx.lineTo(r * 0.12, r * 1.02);
    ctx.lineTo(0, r * 1.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgb(255 255 255 / 0.55)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.32, -r * 0.42, r * 0.2, r * 0.32, -0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  drawBell(r, swing) {
    const { ctx, scale: s } = this;
    ctx.save();
    ctx.translate(0, -r);
    ctx.rotate(swing);
    ctx.translate(0, r);
    ctx.fillStyle = '#ffd23f';
    ctx.strokeStyle = '#b98a2e';
    ctx.lineWidth = Math.max(1.5, s * 0.004);
    ctx.beginPath();
    ctx.moveTo(-r * 0.95, r * 0.75);
    ctx.quadraticCurveTo(-r * 0.7, r * 0.45, -r * 0.62, -r * 0.2);
    ctx.quadraticCurveTo(-r * 0.55, -r * 0.95, 0, -r * 0.98);
    ctx.quadraticCurveTo(r * 0.55, -r * 0.95, r * 0.62, -r * 0.2);
    ctx.quadraticCurveTo(r * 0.7, r * 0.45, r * 0.95, r * 0.75);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#b98a2e';
    ctx.beginPath();
    ctx.arc(0, r * 0.92, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgb(255 255 255 / 0.55)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.28, -r * 0.3, r * 0.12, r * 0.36, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** The bird that carries a gift across: its wings beat, and the gift hangs under it on a string. */
  drawBird(meadow, bird) {
    if (bird.x === undefined) return;
    const { ctx, scale: s } = this;
    const { x, y } = this.at(bird.x, bird.y);
    const { gift } = bird;
    const size = s * 0.036;
    if (gift.state === 'up' || gift.state === 'hit') {
      const where = meadow.whereAt(gift);
      const at = this.at(where.x, where.y);
      const share = this.shownShare(gift);
      ctx.strokeStyle = 'rgb(255 255 255 / 0.9)';
      ctx.lineWidth = Math.max(1, s * 0.003);
      ctx.beginPath();
      ctx.moveTo(x, y + size * 0.4);
      ctx.lineTo(at.x, at.y - gift.r * s * 0.7);
      ctx.stroke();
      if (share > 0) {
        const r = gift.r * s * 0.82 * share;
        ctx.save();
        ctx.globalAlpha = share;
        ctx.fillStyle = '#ff8fb1';
        ctx.strokeStyle = '#c2255c';
        ctx.lineWidth = Math.max(1.5, s * 0.004);
        ctx.beginPath();
        ctx.roundRect(at.x - r, at.y - r * 0.85, r * 2, r * 1.75, r * 0.2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffe066';
        ctx.fillRect(at.x - r * 0.18, at.y - r * 0.85, r * 0.36, r * 1.75);
        ctx.fillRect(at.x - r, at.y - r * 0.16, r * 2, r * 0.36);
        ctx.beginPath();
        ctx.ellipse(at.x - r * 0.3, at.y - r * 1.02, r * 0.3, r * 0.18, -0.5, 0, Math.PI * 2);
        ctx.ellipse(at.x + r * 0.3, at.y - r * 1.02, r * 0.3, r * 0.18, 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    // The bird flies towards the archer.
    const beat = this.reducedMotion ? 0.3 : Math.sin(this.time * 9);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(-this.way, 1);
    ctx.fillStyle = '#4dabf7';
    ctx.strokeStyle = '#1c6fb8';
    ctx.lineWidth = Math.max(1.5, s * 0.004);
    ctx.beginPath();
    ctx.ellipse(0, 0, size, size * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-size * 0.9, 0);
    ctx.lineTo(-size * 1.7, -size * 0.3);
    ctx.lineTo(-size * 1.6, size * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#a5d8ff';
    ctx.beginPath();
    ctx.moveTo(-size * 0.2, -size * 0.1);
    ctx.quadraticCurveTo(-size * 0.5, -size * (0.4 + 1.1 * beat), -size * 1.05, -size * (0.2 + 1.2 * beat));
    ctx.quadraticCurveTo(-size * 0.3, -size * 0.1, size * 0.3, -size * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffa94d';
    ctx.beginPath();
    ctx.moveTo(size * 0.92, -size * 0.1);
    ctx.lineTo(size * 1.4, size * 0.05);
    ctx.lineTo(size * 0.92, size * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#12304d';
    ctx.beginPath();
    ctx.arc(size * 0.55, -size * 0.15, size * 0.11, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** The wind's flag, on a pole behind the meadow: it streams the way the wind blows, further the harder it does. */
  drawFlag() {
    const { ctx, scale: s } = this;
    const foot = this.at(0.56, 0.8);
    const top = this.at(0.56, 0.4);
    ctx.strokeStyle = '#8a6a48';
    ctx.lineWidth = Math.max(2.5, s * 0.008);
    ctx.beginPath();
    ctx.moveTo(foot.x, foot.y);
    ctx.lineTo(top.x, top.y);
    ctx.stroke();
    const strength = clamp(Math.abs(this.wind) / EXTRAS.wind.most, 0, 1);
    const along = Math.sign(this.wind || 1) * this.way;
    const long = s * (0.035 + 0.075 * strength);
    const high = s * 0.045;
    const wave = this.reducedMotion ? 0 : Math.sin(this.time * (3 + 4 * strength)) * s * 0.008 * (0.4 + strength);
    // It hangs down when there's next to no wind, and lifts as it blows.
    const droop = (1 - strength) * s * 0.03;
    ctx.fillStyle = '#ff6b6b';
    ctx.strokeStyle = '#c92a2a';
    ctx.lineWidth = Math.max(1.5, s * 0.004);
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.quadraticCurveTo(top.x + along * long * 0.5, top.y + wave + droop * 0.5, top.x + along * long, top.y + high * 0.5 - wave + droop);
    ctx.quadraticCurveTo(top.x + along * long * 0.5, top.y + high - wave + droop * 0.5, top.x, top.y + high);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // And a few lines on the air, going the way it blows.
    if (strength > 0.05) {
      ctx.strokeStyle = `rgb(255 255 255 / ${(0.3 + 0.35 * strength).toFixed(2)})`;
      ctx.lineWidth = Math.max(1.5, s * 0.004);
      for (let n = 0; n < 3; n += 1) {
        const drift = this.reducedMotion ? 0.5 : ((this.time * (0.05 + 0.1 * strength) + n * 0.37) % 1);
        const from = this.at(0.56 + (Math.sign(this.wind) * (drift - 0.5)) * 0.5, 0.43 + n * 0.045);
        const fade = Math.sin(drift * Math.PI);
        ctx.globalAlpha = fade;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(from.x + along * s * 0.05, from.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  /* ---------- the archer, the bow and the dotted line ---------- */

  /** Where the bow's parts are on the screen, tilted and drawn so far: its grip, tips, the string's nock and the way it points. */
  bowShape(angle, pull) {
    const { scale: s } = this;
    const held = gripAt(angle);
    const grip = this.at(held.x, held.y);
    // The way the arrow points, on the screen.
    const dir = { x: Math.cos(angle) * this.way, y: -Math.sin(angle) };
    const across = { x: -dir.y, y: dir.x };
    const back = mix(LIMB.back[0], LIMB.back[1], pull) * s;
    const tip = (side) => ({ x: grip.x - dir.x * back + across.x * side * LIMB.long * s, y: grip.y - dir.y * back + across.y * side * LIMB.long * s });
    const string = mix(LIMB.string, BOW.reach, pull) * s;
    return { grip, dir, across, tips: [tip(-1), tip(1)], nock: { x: grip.x - dir.x * string, y: grip.y - dir.y * string } };
  }

  /** A bow: its limbs bending back to the tips, and its string. */
  drawBow(shape, { wood = '#c0703a', ink = '#74491f', taut = true } = {}) {
    const { ctx, scale: s } = this;
    const { grip, dir, tips, nock } = shape;
    for (const [colour, wide] of [[ink, 0.02], [wood, 0.013]]) {
      ctx.strokeStyle = colour;
      ctx.lineWidth = Math.max(3, s * wide);
      ctx.beginPath();
      ctx.moveTo(tips[0].x, tips[0].y);
      ctx.quadraticCurveTo(grip.x + dir.x * s * 0.04, grip.y + dir.y * s * 0.04, tips[1].x, tips[1].y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgb(255 255 255 / 0.95)';
    ctx.lineWidth = Math.max(1.5, s * 0.004);
    ctx.beginPath();
    ctx.moveTo(tips[0].x, tips[0].y);
    if (taut) ctx.lineTo(nock.x, nock.y);
    ctx.lineTo(tips[1].x, tips[1].y);
    ctx.stroke();
  }

  /** An arrow, from its tail to its tip: a shaft, feathers and a round soft tip. */
  drawShaft(tip, dir, { alpha = 1, colours = { shaft: '#f8f0dc', ink: '#74491f', tip: '#ff6b6b', feather: '#4dabf7' } } = {}) {
    const { ctx, scale: s } = this;
    const long = ARROW_LONG * s;
    const tail = { x: tip.x - dir.x * long, y: tip.y - dir.y * long };
    const across = { x: -dir.y, y: dir.x };
    ctx.save();
    ctx.globalAlpha *= alpha;
    for (const [colour, wide] of [[colours.ink, 0.011], [colours.shaft, 0.006]]) {
      ctx.strokeStyle = colour;
      ctx.lineWidth = Math.max(2, s * wide);
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();
    }
    ctx.fillStyle = colours.feather;
    ctx.strokeStyle = colours.ink;
    ctx.lineWidth = Math.max(1, s * 0.0025);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(tail.x + dir.x * long * 0.02, tail.y + dir.y * long * 0.02);
      ctx.lineTo(tail.x - dir.x * long * 0.06 + across.x * side * s * 0.014, tail.y - dir.y * long * 0.06 + across.y * side * s * 0.014);
      ctx.lineTo(tail.x + dir.x * long * 0.2 + across.x * side * s * 0.014, tail.y + dir.y * long * 0.2 + across.y * side * s * 0.014);
      ctx.lineTo(tail.x + dir.x * long * 0.28, tail.y + dir.y * long * 0.28);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = colours.tip;
    ctx.strokeStyle = colours.ink;
    ctx.lineWidth = Math.max(1.5, s * 0.004);
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, s * 0.0095, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /** An arrow in the meadow: flying, stuck where it landed, or tumbling off something. */
  drawArrow(arrow) {
    const tip = this.at(arrow.x, arrow.y);
    const far = Math.hypot(arrow.dx, arrow.dy) || 1;
    let angle = Math.atan2(arrow.dy / far, (arrow.dx / far) * this.way);
    if (arrow.state === 'fell') angle += arrow.spin * this.way;
    const dir = { x: Math.cos(angle), y: Math.sin(angle) };
    // One in the grass, or tumbling, fades as it goes. One in a target goes when the target does.
    let alpha = 1;
    if (arrow.state === 'stuck' && !arrow.in) alpha = clamp((3 - arrow.since) / 0.6, 0, 1);
    if (arrow.state === 'fell') alpha = clamp((1.6 - arrow.since) / 0.5, 0, 1);
    const ghost = arrow.ghost ? { shaft: '#e3e8ee', ink: GHOST.ink, tip: '#c9d3df', feather: '#c9d3df' } : undefined;
    this.drawShaft(tip, dir, { alpha: alpha * (arrow.ghost ? 0.6 : 1), colours: ghost });
  }

  /** A friend's bow, grey and see-through, where the child's own is, tilted and drawn as theirs is, with their name. */
  drawGhostBow({ angle, draw, nocked, name, alpha = 1, row = 0 }) {
    if (alpha < 0.02) return;
    const { ctx, scale: s } = this;
    const shape = this.bowShape(angle, nocked ? draw : 0);
    ctx.save();
    ctx.globalAlpha = 0.5 * alpha;
    this.drawBow(shape, { wood: GHOST.wood, ink: GHOST.ink });
    if (nocked) {
      const tip = { x: shape.nock.x + shape.dir.x * ARROW_LONG * s, y: shape.nock.y + shape.dir.y * ARROW_LONG * s };
      this.drawShaft(tip, shape.dir, { colours: { shaft: '#e3e8ee', ink: GHOST.ink, tip: '#c9d3df', feather: '#c9d3df' } });
    }
    ctx.restore();
    if (!name) return;
    // Their name, over the bow, one under another when there are several.
    const over = this.at(BOW.x + BOW.reach, BOW.y - BOW.reach - LIMB.long - 0.03 - row * 0.042);
    ctx.save();
    ctx.globalAlpha = 0.85 * alpha;
    ctx.font = `600 ${Math.round(Math.max(12, s * 0.026))}px Fredoka, 'Noto Sans Georgian', sans-serif`;
    const wide = ctx.measureText(name).width + s * 0.03;
    ctx.fillStyle = 'rgb(255 255 255 / 0.85)';
    ctx.beginPath();
    ctx.roundRect(over.x - wide / 2, over.y - s * 0.018, wide, s * 0.036, s * 0.018);
    ctx.fill();
    ctx.fillStyle = GHOST.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, over.x, over.y + 1);
    ctx.restore();
  }

  /**
   * A long cartoon arm, with an outline, and a round hand at the end of it. elbow is how far its elbow sticks out
   * from the straight line between shoulder and hand, across and down the screen.
   */
  drawArm(from, to, thick, colours, elbow) {
    const { ctx } = this;
    const control = { x: (from.x + to.x) / 2 + elbow.x * 2, y: (from.y + to.y) / 2 + elbow.y * 2 };
    for (const [colour, wide] of [[colours.ink, thick + Math.max(3, thick * 0.3)], [colours.skin, thick]]) {
      ctx.strokeStyle = colour;
      ctx.lineWidth = wide;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.quadraticCurveTo(control.x, control.y, to.x, to.y);
      ctx.stroke();
    }
    ctx.fillStyle = colours.hand;
    ctx.strokeStyle = colours.ink;
    ctx.lineWidth = Math.max(1.5, thick * 0.16);
    ctx.beginPath();
    ctx.arc(to.x, to.y, thick * 0.72, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  /**
   * Giraffe, his bow and his arrow, and the dotted line that says where the arrow would go. The bow is tilted as
   * the hands have it, and bends as far as they've drawn it, and the string hand is on the string while it holds it.
   */
  drawArcher(bow, aim, playing, ready) {
    const { ctx, scale: s, archer } = this;
    const feet = this.at(ARCHER.x, WORLD.ground);
    const way = this.way;
    const seen = Boolean(bow?.bowSeen);
    const angle = bow ? (aim?.angle ?? bow.angle) : 0.2;
    const shape = this.bowShape(seen || !playing ? angle : mix(angle, -0.5, 0.6), this.pull);
    const thick = Math.max(6, s * 0.036);
    const colours = archer?.arm ?? { skin: '#f5c451', hand: '#f5c451', ink: '#4a2c10' };
    // His shoulders, from his picture, or about where they'd be without it.
    let near = { x: feet.x + way * s * 0.03, y: feet.y - s * ARCHER.tall * 0.7 };
    let far = { x: feet.x + way * s * 0.05, y: feet.y - s * ARCHER.tall * 0.7 };
    let frame = null;
    let size = 0;
    if (archer) {
      frame = archer.frames[this.time < this.gladUntil ? 'glad' : 'ready'];
      size = (ARCHER.tall * s) / archer.body;
      const on = (point) => ({ x: feet.x + (point.x - archer.foot.x) * size * way, y: feet.y + (point.y - archer.foot.y) * size });
      near = on(frame.near);
      far = on(frame.far);
    }
    // The dotted line goes under everything of his.
    if (aim && playing && seen) this.drawDots(aim, ready);
    // The arm that holds the bow, behind him, held out nearly straight.
    this.drawArm(far, shape.grip, thick, colours, { x: 0, y: thick * 0.25 });
    if (frame) {
      ctx.save();
      ctx.translate(feet.x, feet.y);
      ctx.scale(way, 1);
      ctx.drawImage(frame.image, -archer.foot.x * size, -archer.foot.y * size, archer.width * size, archer.height * size);
      ctx.restore();
    }
    ctx.save();
    if (bow && !seen && playing) ctx.globalAlpha = 0.6;
    this.drawBow(shape);
    // The arrow on the string, ready: its tail at the string, wherever that's been drawn back to.
    const tip = { x: shape.nock.x + shape.dir.x * ARROW_LONG * s, y: shape.nock.y + shape.dir.y * ARROW_LONG * s };
    this.drawShaft(tip, shape.dir);
    ctx.restore();
    // The string hand: on the string while it holds it, and down by his side when it doesn't.
    const rest = { x: near.x - way * s * 0.012, y: near.y + s * 0.115 };
    const hand = { x: mix(rest.x, shape.nock.x, this.hold), y: mix(rest.y, shape.nock.y, this.hold) };
    // On the string, its elbow is up and out behind him, as an archer's is.
    this.drawArm(near, hand, thick, colours, { x: -way * thick * mix(0.2, 1.25, this.hold), y: thick * mix(0.5, -0.1, this.hold) });
  }

  /** The dotted line: where an arrow let go now would fly, and what it would come to. */
  drawDots(aim, ready) {
    const { ctx, scale: s } = this;
    const { dots, end } = aim;
    const shown = ready ? dots : dots.slice(0, 9);
    ctx.save();
    shown.forEach((dot, index) => {
      // The first few are behind the bow and the arrow.
      if (index < 3) return;
      const { x, y } = this.at(dot.x, dot.y);
      const r = s * (ready ? 0.0068 : 0.0045);
      ctx.globalAlpha = ready ? 0.95 : 0.5 * (1 - index / 10);
      ctx.fillStyle = 'rgb(18 48 77 / 0.55)';
      ctx.beginPath();
      ctx.arc(x, y, r + Math.max(1.5, s * 0.003), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = aim.target ? '#d3f9d8' : '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    // Where it ends, if not on a target: a small cross on whatever's in the way, or on the grass.
    if (ready && !aim.target && end.what !== 'out') {
      const { x, y } = this.at(end.x, end.y);
      const size = s * 0.014;
      for (const [colour, wide] of [['rgb(18 48 77 / 0.6)', 0.009], ['#ffffff', 0.005]]) {
        ctx.strokeStyle = colour;
        ctx.lineWidth = Math.max(2, s * wide);
        ctx.beginPath();
        ctx.moveTo(x - size, y - size);
        ctx.lineTo(x + size, y + size);
        ctx.moveTo(x + size, y - size);
        ctx.lineTo(x - size, y + size);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /* ---------- small things ---------- */

  drawMark(kind, x, y, size, alpha = 1) {
    const image = this.marks[kind];
    if (!image) return;
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.drawImage(image, x - size / 2, y - size / 2, size, size);
    ctx.restore();
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

  drawEffects() {
    const { ctx, scale: s } = this;
    for (const effect of this.effects) {
      const share = 1 - effect.life / effect.total;
      ctx.save();
      ctx.globalAlpha = clamp(effect.life / effect.total, 0, 1);
      ctx.fillStyle = effect.colour;
      if (effect.kind === 'pop') {
        ctx.strokeStyle = effect.colour;
        ctx.lineWidth = s * 0.006;
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, s * (0.04 + share * 0.045), 0, Math.PI * 2);
        ctx.stroke();
      } else if (effect.kind === 'puff') {
        for (let i = 0; i < 5; i += 1) {
          const angle = Math.PI + (i / 4) * Math.PI;
          ctx.beginPath();
          ctx.arc(effect.x + Math.cos(angle) * s * (0.01 + share * 0.03), effect.y + Math.sin(angle) * s * (0.005 + share * 0.02), s * 0.008 * (1 - share * 0.4), 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        const burst = effect.kind === 'burst';
        const count = burst ? 10 : 6;
        for (let i = 0; i < count; i += 1) {
          const angle = (i / count) * Math.PI * 2 + 0.4;
          const out = s * (burst ? 0.05 + share * 0.09 : 0.02 + share * 0.04);
          this.drawStar(effect.x + Math.cos(angle) * out, effect.y + Math.sin(angle) * out, s * (burst ? 0.012 : 0.008) * (1 - share * 0.5));
        }
      }
      ctx.restore();
    }
  }

  /** Stars flying up to the tally, getting smaller. */
  drawFlying() {
    if (!this.flying.length) return;
    const to = this.prizeTarget();
    for (const flight of this.flying) {
      if (flight.t < 0) continue;
      const share = ease(Math.min(1, flight.t / PRIZE_FLY_SECONDS));
      const x = flight.x + (to.x - flight.x) * share;
      const y = flight.y + (to.y - flight.y) * share - Math.sin(share * Math.PI) * this.height * 0.06;
      this.drawMark(flight.kind, x, y, this.height * 0.07 * (1.2 - 0.6 * share));
    }
  }

  drawLabel(label) {
    const where = label.target();
    if (!where) return;
    const { ctx, palmSize, height: h } = this;
    const fade = clamp(Math.min((LABEL_SECONDS - label.life) / 0.3, label.life / 0.4), 0, 1);
    const { x, y } = this.at(where.x, where.y);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.font = `600 ${Math.round(Math.max(15, palmSize * 0.42))}px Fredoka, 'Noto Sans Georgian', sans-serif`;
    const wide = ctx.measureText(label.text).width + 26;
    const high = Math.max(30, palmSize * 0.78);
    const left = clamp(x - wide / 2, 8, this.width - wide - 8);
    const top = clamp(y - this.scale * 0.13 - high, h * 0.2, h - high - 8);
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
