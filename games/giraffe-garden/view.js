// Giraffe's Garden, drawn in 2D: a sunny garden with a fence and Giraffe behind it, a bed of soil along the bottom
// where the plants grow, and the watering can held by the child's glove, tipped as far as the hand is turned.
//
// Nothing flashes: plants grow and open slowly, water falls as small drops, a sparkle is a few small stars, and
// whatever comes and goes fades or slides.
import { INK } from '../../core/glove.js';
import { pictureChanged, pictureSize } from '../../core/seat.js';
import { BASKET_Y, GROUND, LABELS } from './garden.js';

const LABEL_SECONDS = 2.4;
const PRIZE_FLY_SECONDS = 0.9;
const BLOOM_OPEN_SECONDS = 0.7; // A flower opens over this long.
const CAN_SIZE = 1.9; // The watering can, in palms.
const MOST_DROPS = 90;
const DROP_SPEED = 1.1; // How fast drops fall at first, in screen heights a second, and they speed up.
const GRAVITY = 2.2;
// The can, in its own size from its handle, which the glove holds: its body below, its spout out to one side, and
// the rose at the spout's end where the water comes out.
const ROSE = { x: 1.02, y: 0.18 };
// How far the can tips, in radians, for a tip of 1, which is the hand turned right over. It tips as far as the
// hand turns: at the turn that's wanted, which pours, it has tipped POURING of the way.
export const TIP_MOST = 1.35;
export const POURING = 0.78;
// Giraffe, behind a bush by the fence on the side away from the child's hand: how far in from the edge, where his
// feet are, and how tall his body is, as shares of the screen.
export const GIRAFFE = { x: 0.085, feet: 0.765, tall: 0.29 };
// The bush in front of him: its top, just over the fence's, and how wide it is, as shares of the screen's height.
const BUSH = { top: 0.565, wide: 0.44 };
const MARKS = { bee: '🐝', honey: '🍯', snail: '🐌', hedgehog: '🦔', bunny: '🐰', apple: '🍎', carrot: '🥕', egg: '🥚', star: '⭐' };
const PETALS = {
  daisy: { count: 10, colour: '#ffffff', edge: '#e8e4f0', middle: '#ffcf3f', long: 1 },
  tulip: { count: 5, colour: '#ff5a6e', edge: '#d93a52', middle: '#ffcf3f', long: 0.9, cup: true },
  poppy: { count: 5, colour: '#ff6b3d', edge: '#e04a1f', middle: '#2b2233', long: 0.95 },
  cornflower: { count: 8, colour: '#5b8cff', edge: '#3d68d8', middle: '#2b3a7a', long: 0.85, spiky: true },
  pansy: { count: 5, colour: '#a06bff', edge: '#7a4ad8', middle: '#ffd84a', long: 1 },
  marigold: { count: 12, colour: '#ffa53d', edge: '#e88a1f', middle: '#d8701f', long: 0.8 },
  sunflower: { count: 16, colour: '#ffd23f', edge: '#e8b01f', middle: '#6b4423', long: 1.15 },
};

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const ease = (share) => share * share * (3 - 2 * share);

/** The magic bean's golden egg, drawn once: gold, with a shine. */
function makeGoldenEgg() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gold = ctx.createRadialGradient(54, 48, 6, 64, 70, 60);
  gold.addColorStop(0, '#fff3b0');
  gold.addColorStop(0.45, '#ffd23f');
  gold.addColorStop(1, '#d99a1f');
  ctx.fillStyle = gold;
  ctx.strokeStyle = '#9a6a1f';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(64, 70, 36, 48, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgb(255 255 255 / 0.7)';
  ctx.beginPath();
  ctx.ellipse(50, 50, 9, 15, -0.4, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
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

export class GardenView {
  /**
   * language() says which language a new thing's label is in, prizeTarget() where the prize tally is on the screen,
   * and top() how tall the band along the top is, which the sky goes up into.
   */
  constructor(canvas, { language = () => 'en', prizeTarget = () => ({ x: 80, y: 40 }) } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.language = language;
    this.prizeTarget = prizeTarget;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.time = 0;
    this.base = null;
    this.drops = [];
    this.splashes = [];
    this.effects = [];
    this.flying = [];
    this.bees = [];
    this.labels = [];
    this.introduced = new Set();
    this.wanted = new Map();
    this.grown = new Map(); // How grown each plant looks, catching up with how grown it is.
    this.openedAt = new Map(); // When each plant flowered, for it to open.
    this.marks = Object.fromEntries(Object.entries(MARKS).map(([key, mark]) => [key, makeMark(mark)]));
    this.marks.egg = makeGoldenEgg();
    this.giraffe = null; // The pictures of Giraffe, from the maze's characters, if they could be drawn.
    this.cheerUntil = 0;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /**
   * As big as the picture the child sees it in. That's the window, except for the second of two playing in one
   * picture, whose game goes on under the first one's, in a window half as wide: it's as big as the first one's,
   * so their water lands where it falls in the picture. See pictureSize in core/seat.js. The canvas is as big as
   * the window, and shows as much as fits in it.
   */
  resize() {
    ({ width: this.width, height: this.height } = pictureSize());
    this.ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(window.innerWidth * this.ratio);
    this.canvas.height = Math.round(window.innerHeight * this.ratio);
    this.palmSize = Math.max(40, this.height * 0.08);
    this.base = null;
  }

  /** A new game: nothing left over from the last one. */
  reset() {
    this.drops = [];
    this.splashes = [];
    this.effects = [];
    this.flying = [];
    this.bees = [];
    this.labels = [];
    this.introduced = new Set();
    this.wanted = new Map();
    this.grown = new Map();
    this.openedAt = new Map();
  }

  /** Where a place in the garden is on the screen. */
  at(x, y) {
    return { x: x * this.width, y: y * this.height };
  }

  /* ---------- the can ---------- */

  /**
   * Where the can's rose is on the screen, the water coming out of it, for a can held at (x, y) by its handle and
   * tipped this far, from 0 to 1, with its spout towards side: 1 to the right, -1 to the left.
   */
  roseAt(x, y, tip, side) {
    const size = this.palmSize * CAN_SIZE;
    const angle = side * tip * TIP_MOST;
    const rx = side * ROSE.x * size;
    const ry = ROSE.y * size;
    return { x: x + Math.cos(angle) * rx - Math.sin(angle) * ry, y: y + Math.sin(angle) * rx + Math.cos(angle) * ry };
  }

  /**
   * Where the water from a can held at (x, y) falls from, for what it waters: always where the rose is once the can
   * is tipped to pour, so the water lands in the same place under the hand, however much further the hand turns.
   */
  waterAt(x, y, side) {
    return this.roseAt(x, y, POURING, side);
  }

  /* ---------- what happens ---------- */

  update(dt, garden) {
    this.time += dt;
    for (const effect of this.effects) effect.life -= dt;
    this.effects = this.effects.filter((effect) => effect.life > 0);
    for (const flight of this.flying) flight.t += dt;
    this.flying = this.flying.filter((flight) => flight.t < PRIZE_FLY_SECONDS);
    for (const bee of this.bees) bee.t += dt;
    this.bees = this.bees.filter((bee) => bee.t < bee.total);
    for (const label of this.labels) label.life -= dt;
    this.labels = this.labels.filter((label) => label.life > 0);
    this.nextLabel();
    if (garden) {
      // Each plant's look catches up with how much it has had, so it grows smoothly, never in jumps.
      for (const plant of garden.plants) {
        const share = clamp(plant.water / plant.need, 0, 1);
        const shown = this.grown.get(plant) ?? share;
        this.grown.set(plant, shown + (share - shown) * (1 - Math.exp(-dt * 4)));
        if (plant.bloomed && !this.openedAt.has(plant)) this.openedAt.set(plant, this.time);
      }
    }
    for (const drop of this.drops) {
      drop.vy += GRAVITY * this.height * dt;
      drop.y += drop.vy * dt;
      drop.x += drop.vx * dt;
    }
    for (const drop of this.drops.filter((each) => each.y >= each.until)) this.splashAt(drop.x, drop.until);
    this.drops = this.drops.filter((drop) => drop.y < drop.until);
    for (const splash of this.splashes) splash.life -= dt;
    this.splashes = this.splashes.filter((splash) => splash.life > 0);
  }

  /**
   * Water coming out of the rose at (x, y), on the screen, falling as far down as until, spread this wide either side,
   * in screen widths: as many drops as the flow says, this frame. to is where across it lands, on the screen, which
   * the drops drift towards as they fall, so they're seen to land on what they water.
   */
  pour(x, y, until, flow, wide, dt, to = x) {
    if (flow <= 0) return;
    const many = (this.reducedMotion ? 30 : 55) * flow * dt * (wide > 0.05 ? 2 : 1);
    let count = Math.floor(many) + (Math.random() < many % 1 ? 1 : 0);
    const { height: h } = this;
    while (count-- > 0 && this.drops.length < MOST_DROPS) {
      const spread = (Math.random() - 0.5) * 2 * wide * this.width;
      const vy = DROP_SPEED * h * (0.6 + Math.random() * 0.4);
      const fall = Math.max(0, until - y);
      const seconds = fall > 0 ? (-vy + Math.sqrt(vy * vy + 2 * GRAVITY * h * fall)) / (GRAVITY * h) : 0.1;
      this.drops.push({
        x: x + spread * 0.2,
        y,
        vx: (to - x + spread * 0.8) / Math.max(0.08, seconds),
        vy,
        until: Math.max(until, y),
        size: 0.006 + Math.random() * 0.004,
      });
    }
  }

  /** Rain from the cloud at (x, y) in the garden, falling as far down as until, in the garden too. */
  rain(x, y, until, wide, dt) {
    this.pour(x * this.width, y * this.height, until * this.height, 0.8, wide, dt);
  }

  splashAt(x, y) {
    if (this.splashes.length > 24) return;
    this.splashes.push({ x, y, life: 0.35, total: 0.35, way: Math.random() < 0.5 ? -1 : 1 });
  }

  /** A few small stars, as a flower opens or something is pleased. */
  sparkle(x, y, colour = '#ffe066') {
    this.effects.push({ kind: 'sparkle', x, y, life: 0.7, total: 0.7, colour });
  }

  /** A prize flies up to the tally, from where it was in the garden. */
  prize(kind, x, y) {
    if (!this.marks[kind]) return;
    const at = this.at(x, y);
    this.flying.push({ kind, x: at.x, y: at.y, t: 0 });
  }

  /**
   * A bee flies in to a new flower, stays a moment, and flies off up to the tally with its honey, or at the party at
   * the end, off up into the sky. wait is how long before it sets off.
   */
  bee(plant, total, { party = false, wait = 0 } = {}) {
    this.bees.push({ plant, t: -wait, total, from: Math.random() < 0.5 ? -1 : 1, party });
  }

  /** Giraffe cheers for a while. */
  cheer(seconds = 1.2) {
    this.cheerUntil = this.time + seconds;
  }

  /**
   * A new thing's label, the first time it comes along in a game. target() says where it is, in the garden, or null
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

  /* ---------- drawing ---------- */

  /**
   * The sky, the hills, the fence and the soil only change with the window, so they're drawn once: the sky and the
   * hills behind Giraffe, and the fence and the soil in front of him, as { back, front }.
   */
  baseFor() {
    if (this.base) return this.base;
    const layer = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(this.width * this.ratio);
      canvas.height = Math.round(this.height * this.ratio);
      const context = canvas.getContext('2d');
      context.scale(this.ratio, this.ratio);
      return [canvas, context];
    };
    const [back, behind] = layer();
    const [front, ctx] = layer();
    const { width: w, height: h } = this;
    this.drawSky(behind);
    // The fence: pickets along the back of the garden.
    const picket = Math.max(18, w / 40);
    for (let x = picket * 0.3; x < w; x += picket * 1.35) {
      ctx.fillStyle = '#fff8ea';
      ctx.strokeStyle = '#d8c7a6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, h * 0.8);
      ctx.lineTo(x, h * 0.62);
      ctx.lineTo(x + picket / 2, h * 0.6);
      ctx.lineTo(x + picket, h * 0.62);
      ctx.lineTo(x + picket, h * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#f1e4c8';
    ctx.fillRect(0, h * 0.655, w, h * 0.022);
    ctx.fillRect(0, h * 0.735, w, h * 0.022);
    // The soil, with a soft edge and a few pebbles, the same every time.
    ctx.fillStyle = '#9a6a43';
    ctx.fillRect(0, h * (GROUND - 0.035), w, h);
    ctx.fillStyle = '#7d5232';
    ctx.fillRect(0, h * (GROUND - 0.035), w, h * 0.012);
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    ctx.fillStyle = 'rgb(255 240 220 / 0.18)';
    for (let i = 0; i < 70; i += 1) {
      ctx.beginPath();
      ctx.ellipse(random() * w, h * (GROUND - 0.01) + random() * h * 0.12, 2 + random() * 4, 1.5 + random() * 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    this.base = { back, front };
    return this.base;
  }

  /** The sky, a soft still sun, and rolling hills, behind everything. */
  drawSky(ctx) {
    const { width: w, height: h } = this;
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.7);
    sky.addColorStop(0, '#9fd8ff');
    sky.addColorStop(1, '#e6f6ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    const sun = ctx.createRadialGradient(w * 0.86, h * 0.3, 0, w * 0.86, h * 0.3, h * 0.16);
    sun.addColorStop(0, 'rgb(255 240 170 / 0.95)');
    sun.addColorStop(0.45, 'rgb(255 230 140 / 0.6)');
    sun.addColorStop(1, 'rgb(255 230 140 / 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#a9dc8a';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.62);
    for (let x = 0; x <= w; x += w / 24) ctx.lineTo(x, h * (0.6 + Math.sin((x / w) * 5.2 + 0.6) * 0.035));
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.fill();
    ctx.fillStyle = '#8fcf74';
    ctx.fillRect(0, h * 0.7, w, h * 0.3);
  }

  /**
   * Draws everything. model is { garden, cans, side, prizes }: the garden as it is, the cans to draw, each { x, y,
   * tip, glove, look, name, sprinkler }, on the screen, and which side the child's can's spout points.
   */
  render(model = {}) {
    // A seat's game going under the one picture two share on one screen, or coming back out, is laid out again.
    if (pictureChanged(this)) this.resize();
    const { ctx, width: w, height: h, ratio } = this;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const { back, front } = this.baseFor();
    ctx.drawImage(back, 0, 0, w, h);
    const { garden } = model;
    this.drawGiraffe(model);
    ctx.drawImage(front, 0, 0, w, h);
    this.drawBush(model);
    if (garden) {
      if (garden.plants.some((plant) => plant.hanging)) this.drawArch(garden);
      if (garden.cloud && garden.cloud.state !== 'gone') this.drawCloud(garden.cloud);
      if (garden.sprinkler && !garden.sprinkler.taken) this.drawSprinkler(garden.sprinkler);
      if (garden.bunny) this.drawBunny(garden.bunny);
      if (garden.hedgehog) this.drawHedgehog(garden.hedgehog);
      for (const plant of garden.plants) this.drawPlant(plant, garden);
      for (const snail of garden.snails) this.drawSnail(snail, garden);
    }
    this.drawWater();
    for (const can of model.cans ?? []) this.drawCan(can);
    for (const bee of this.bees) this.drawBee(bee, garden);
    this.drawEffects();
    this.drawFlying();
    for (const label of this.labels) this.drawLabel(label);
  }

  /** Giraffe, behind the fence on the side away from the child's hand, waving, cheering or watching. */
  drawGiraffe(model) {
    const art = this.giraffe;
    if (!art) return;
    const { ctx, width: w, height: h } = this;
    const onLeft = model.side !== 'left';
    let frame = art.frames.stand;
    if (this.time < this.cheerUntil) frame = art.frames.cheer;
    else if (model.waving && !this.reducedMotion) frame = Math.floor(this.time * 1.4) % 2 ? art.frames.wave : art.frames.stand;
    const scale = (h * GIRAFFE.tall) / art.tall;
    ctx.save();
    ctx.translate(w * (onLeft ? GIRAFFE.x : 1 - GIRAFFE.x), h * GIRAFFE.feet);
    // His pictures turn towards the right of the screen, so on the right he's flipped, to turn to the garden.
    ctx.scale(onLeft ? scale : -scale, scale);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(frame, -art.foot.x, -art.foot.y);
    ctx.restore();
  }

  /** The bush Giraffe stands behind, in front of the fence, so he looks over it. */
  drawBush(model) {
    if (!this.giraffe) return;
    const { ctx, width: w, height: h } = this;
    const bush = this.bushFor();
    const x = w * (model.side !== 'left' ? GIRAFFE.x : 1 - GIRAFFE.x);
    ctx.drawImage(bush.canvas, x - bush.width / 2, h * BUSH.top, bush.width, bush.height);
  }

  /** The bush, drawn once for the window's size: round clumps of leaves, darker below, with a few flowers. */
  bushFor() {
    const { height: h, ratio } = this;
    if (this.bush?.h === h && this.bush.ratio === ratio) return this.bush;
    const width = h * BUSH.wide;
    const height = h * (GROUND - 0.02 - BUSH.top);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    // Each clump is [across, down, size], as shares of the bush's width and height, and of its height.
    const clumps = [
      [0.5, 0.3, 0.3], [0.3, 0.36, 0.27], [0.7, 0.36, 0.27], [0.14, 0.56, 0.27], [0.86, 0.56, 0.27],
      [0.38, 0.6, 0.32], [0.62, 0.6, 0.32], [0.06, 0.8, 0.24], [0.94, 0.8, 0.24], [0.26, 0.82, 0.3], [0.74, 0.82, 0.3], [0.5, 0.82, 0.32],
    ];
    const round = (colour, grow, lift = 0) => {
      ctx.fillStyle = colour;
      for (const [across, down, size] of clumps) {
        ctx.beginPath();
        ctx.arc(across * width, down * height - lift * size * height, size * height * grow, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    round('#2f6b3a', 1.06);
    round('#4f9a45', 1);
    round('#6cbb55', 0.72, 0.22);
    round('#8fd36a', 0.34, 0.5);
    // A few small flowers on it, the same every time.
    const flowers = [[0.32, 0.22], [0.7, 0.3], [0.18, 0.5], [0.52, 0.48], [0.84, 0.52], [0.4, 0.72], [0.66, 0.7], [0.12, 0.76], [0.9, 0.78]];
    const petal = h * 0.008;
    for (const [index, [across, down]] of flowers.entries()) {
      const cx = across * width;
      const cy = down * height;
      ctx.fillStyle = index % 2 ? '#ffffff' : '#ffd2e4';
      for (let i = 0; i < 5; i += 1) {
        const angle = (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(angle) * petal, cy + Math.sin(angle) * petal, petal * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffcf3f';
      ctx.beginPath();
      ctx.arc(cx, cy, petal * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    this.bush = { canvas, width, height, h, ratio };
    return this.bush;
  }

  /** A wooden arch for the hanging baskets, with a chain down to each. */
  drawArch(garden) {
    const { ctx, width: w, height: h } = this;
    const hanging = garden.plants.filter((plant) => plant.hanging);
    const left = Math.min(...hanging.map((plant) => plant.x)) - 0.08;
    const right = Math.max(...hanging.map((plant) => plant.x)) + 0.08;
    const top = h * 0.25;
    ctx.save();
    ctx.fillStyle = '#b07a4a';
    ctx.strokeStyle = '#7d5232';
    ctx.lineWidth = 2;
    for (const x of [left, right]) {
      ctx.fillRect(x * w - 6, top, 12, h * (GROUND - 0.25));
      ctx.strokeRect(x * w - 6, top, 12, h * (GROUND - 0.25));
    }
    ctx.fillRect(left * w - 14, top - 8, (right - left) * w + 28, 14);
    ctx.strokeRect(left * w - 14, top - 8, (right - left) * w + 28, 14);
    ctx.strokeStyle = '#8a8f99';
    ctx.lineWidth = 2;
    for (const plant of hanging) {
      ctx.beginPath();
      ctx.moveTo(plant.x * w, top + 6);
      ctx.lineTo(plant.x * w - h * 0.04, h * BASKET_Y);
      ctx.moveTo(plant.x * w, top + 6);
      ctx.lineTo(plant.x * w + h * 0.04, h * BASKET_Y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** A plant: a shoot, dry until it has some water, that grows a stem and leaves, then a bud, then its flower. */
  drawPlant(plant, garden) {
    const { ctx, height: h } = this;
    const grown = this.grown.get(plant) ?? 0;
    const base = this.at(plant.x, plant.y);
    if (plant.hanging) this.drawBasket(base);
    const tall = garden.heightOf({ ...plant, water: grown * plant.need }) * h;
    const sway = this.reducedMotion ? 0 : Math.sin(this.time * 1.3 + plant.id) * tall * 0.02 * grown;
    const top = { x: base.x + sway, y: base.y - tall };
    // From dry and drooping to fresh green as it drinks, and back towards straw as the sun dries it.
    const dry = garden.drying && !plant.bloomed ? ease(clamp((plant.thirst - 0.5) / 0.5, 0, 1)) * 0.8 : 0;
    const fresh = grown * (1 - dry);
    const green = `rgb(${Math.round(190 - 125 * fresh)} ${Math.round(165 + 5 * fresh)} ${Math.round(60 - 5 * fresh)})`;
    const thick = Math.max(4, h * (plant.look === 'flower' ? 0.008 : 0.012));
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = green;
    ctx.lineWidth = thick;
    if (plant.look === 'bean') {
      // A vine, winding up.
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      const steps = 24;
      for (let i = 1; i <= steps; i += 1) {
        const along = i / steps;
        ctx.lineTo(base.x + Math.sin(along * 9 + plant.id) * h * 0.025 * grown + sway * along, base.y - tall * along);
      }
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.quadraticCurveTo(base.x - sway * 0.5, base.y - tall * 0.5, top.x, top.y);
      ctx.stroke();
    }
    // Leaves, drooping while it's dry and lifting as it drinks.
    const leaves = plant.look === 'bean' ? 6 : 2;
    for (let i = 0; i < leaves; i += 1) {
      const along = plant.look === 'bean' ? (i + 1) / (leaves + 1) : [0.35, 0.62][i];
      const way = i % 2 ? 1 : -1;
      const at = { x: base.x + (top.x - base.x) * along + (plant.look === 'bean' ? Math.sin(along * 9 + plant.id) * h * 0.025 * grown : 0), y: base.y - tall * along };
      const size = h * (plant.look === 'flower' ? 0.034 : 0.045) * (0.85 + grown * 0.15);
      ctx.save();
      ctx.translate(at.x, at.y);
      ctx.rotate(way * (0.9 - fresh * 0.5) + (fresh < 0.25 ? way * 0.5 : 0));
      ctx.fillStyle = green;
      ctx.beginPath();
      ctx.ellipse(way * size * 0.6, 0, size * 0.65, size * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    this.drawHead(plant, top, grown);
    if (garden.drying && !plant.bloomed) this.drawThirst(plant, base);
  }

  /**
   * With the sun drying the garden, a drop by each plant not yet in flower, full when it's just been watered and
   * emptying as it gets thirsty, its edge going orange when it's nearly dry. It changes slowly, and it's small.
   */
  drawThirst(plant, base) {
    const { ctx, height: h } = this;
    const r = h * 0.017;
    const x = base.x + h * 0.04;
    const y = base.y + (plant.hanging ? h * 0.05 : h * 0.035);
    const full = clamp(1 - plant.thirst, 0, 1);
    const drop = () => {
      ctx.beginPath();
      ctx.moveTo(x, y - r * 1.9);
      ctx.bezierCurveTo(x + r * 0.5, y - r * 1.1, x + r, y - r * 0.5, x + r, y);
      ctx.arc(x, y, r, 0, Math.PI);
      ctx.bezierCurveTo(x - r, y - r * 0.5, x - r * 0.5, y - r * 1.1, x, y - r * 1.9);
      ctx.closePath();
    };
    ctx.save();
    drop();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.fill();
    ctx.save();
    drop();
    ctx.clip();
    ctx.fillStyle = '#4aa3df';
    ctx.fillRect(x - r * 1.2, y + r - full * r * 2.9, r * 2.4, full * r * 2.9);
    ctx.restore();
    drop();
    ctx.lineWidth = Math.max(1.5, h * 0.003);
    ctx.strokeStyle = plant.thirst > 0.7 ? '#e8743b' : '#2f7fb8';
    ctx.stroke();
    ctx.restore();
  }

  /** A plant's top: nothing while it's a shoot, then a bud that swells and colours, then its flower opening. */
  drawHead(plant, top, grown) {
    const { ctx, height: h } = this;
    if (plant.look === 'bean') {
      if (plant.bloomed) this.drawMark('egg', top.x, top.y - h * 0.02, h * 0.06);
      return;
    }
    const petals = PETALS[plant.kind] ?? PETALS.daisy;
    const big = h * (plant.look === 'sunflower' ? 0.06 : 0.036);
    const opened = this.openedAt.has(plant) ? ease(clamp((this.time - this.openedAt.get(plant)) / BLOOM_OPEN_SECONDS, 0, 1)) : 0;
    if (grown < 0.34 && !plant.bloomed) return;
    if (!plant.bloomed || opened < 1) {
      // The bud, green, then showing its colour at the tip.
      const swell = clamp((grown - 0.34) / 0.66, 0, 1);
      const size = big * (0.35 + swell * 0.3) * (1 - opened);
      if (size > 0.5) {
        ctx.fillStyle = '#5fae4a';
        ctx.beginPath();
        ctx.ellipse(top.x, top.y - size * 0.4, size * 0.55, size * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
        if (swell > 0.5) {
          ctx.fillStyle = petals.colour;
          ctx.beginPath();
          ctx.ellipse(top.x, top.y - size * 0.9, size * 0.3, size * 0.35, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    if (!plant.bloomed) return;
    // The flower opening: its petals spreading out from the middle.
    const size = big * (0.4 + 0.6 * opened);
    ctx.save();
    ctx.translate(top.x, top.y - size * 0.2);
    if (petals.cup) {
      ctx.fillStyle = petals.colour;
      ctx.strokeStyle = petals.edge;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-size * 0.7, -size * 0.6);
      ctx.quadraticCurveTo(-size * 0.75, size * 0.55, 0, size * 0.55);
      ctx.quadraticCurveTo(size * 0.75, size * 0.55, size * 0.7, -size * 0.6);
      ctx.lineTo(size * 0.35, -size * 0.25);
      ctx.lineTo(0, -size * 0.7);
      ctx.lineTo(-size * 0.35, -size * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      for (let i = 0; i < petals.count; i += 1) {
        const angle = (i / petals.count) * Math.PI * 2 + plant.id;
        ctx.save();
        ctx.rotate(angle);
        ctx.fillStyle = petals.colour;
        ctx.strokeStyle = petals.edge;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (petals.spiky) {
          ctx.moveTo(0, -size * 0.2);
          ctx.lineTo(size * 0.22, -size * petals.long);
          ctx.lineTo(-size * 0.22, -size * petals.long);
          ctx.closePath();
        } else {
          ctx.ellipse(0, -size * 0.55 * petals.long, size * (petals.count > 10 ? 0.18 : 0.3), size * 0.5 * petals.long, 0, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = petals.middle;
      ctx.beginPath();
      ctx.arc(0, 0, size * (plant.look === 'sunflower' ? 0.45 : 0.28), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawBasket(base) {
    const { ctx, height: h } = this;
    const wide = h * 0.07;
    ctx.save();
    ctx.fillStyle = '#c28a52';
    ctx.strokeStyle = '#7d5232';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(base.x - wide, base.y - h * 0.005);
    ctx.quadraticCurveTo(base.x, base.y + h * 0.075, base.x + wide, base.y - h * 0.005);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgb(125 82 50 / 0.5)';
    for (let i = -2; i <= 2; i += 1) {
      ctx.beginPath();
      ctx.moveTo(base.x + i * wide * 0.35, base.y);
      ctx.lineTo(base.x + i * wide * 0.25, base.y + h * 0.03);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** A snail munching its plant, and once a splash has sent it off, sliding away to rest by the fence. */
  drawSnail(snail, garden) {
    const { height: h } = this;
    const { plant } = snail;
    const tall = garden.heightOf(plant) * h;
    const base = this.at(plant.x, plant.y);
    snail.offAt ??= snail.off ? this.time : undefined;
    const gone = snail.off ? clamp((this.time - (snail.offAt ?? this.time)) / 1.2, 0, 1) : 0;
    const wobble = this.reducedMotion || snail.off ? 0 : Math.sin(this.time * 3 + snail.id) * h * 0.003;
    const x = base.x + h * 0.03 + gone * h * 0.08;
    const y = base.y - tall * 0.45 * (1 - gone) + wobble;
    this.drawMark('snail', x, y, h * 0.06, snail.off ? 1 - gone * 0.3 : 1, gone > 0 ? -1 : 1);
  }

  drawHedgehog(hedgehog) {
    const { ctx, height: h } = this;
    const at = this.at(hedgehog.x, hedgehog.y);
    // The bowl, and the water in it.
    const wide = h * 0.045;
    ctx.save();
    ctx.fillStyle = '#c9d3df';
    ctx.strokeStyle = '#7f8a99';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(at.x - wide, at.y - h * 0.03);
    ctx.quadraticCurveTo(at.x, at.y + h * 0.01, at.x + wide, at.y - h * 0.03);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const full = hedgehog.drank ? 1 : hedgehog.bowl;
    if (full > 0) {
      ctx.fillStyle = 'rgb(110 190 255 / 0.85)';
      ctx.beginPath();
      ctx.ellipse(at.x, at.y - h * 0.03, wide * 0.85, h * 0.008 + h * 0.006 * full, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    const hop = hedgehog.drank && !this.reducedMotion ? Math.abs(Math.sin(this.time * 4)) * h * 0.01 : 0;
    this.drawMark('hedgehog', at.x + wide * 1.6, at.y - h * 0.035 - hop, h * 0.07, 1, -1);
  }

  /** The bunny's hole, and the bunny coming up out of it, or going down again with a giggle. */
  drawBunny(bunny) {
    const { ctx, height: h } = this;
    const at = this.at(bunny.x, bunny.y);
    bunny.shown ??= 0;
    bunny.shown += ((bunny.up ? 1 : 0) - bunny.shown) * 0.12;
    ctx.save();
    ctx.fillStyle = '#4a2e1a';
    ctx.beginPath();
    ctx.ellipse(at.x, at.y - h * 0.012, h * 0.04, h * 0.012, 0, 0, Math.PI * 2);
    ctx.fill();
    // Only the part above the ground shows.
    ctx.beginPath();
    ctx.rect(at.x - h * 0.06, 0, h * 0.12, at.y - h * 0.012);
    ctx.clip();
    const giggle = bunny.giggling > 0 && !this.reducedMotion ? Math.sin(this.time * 18) * h * 0.004 : 0;
    this.drawMark('bunny', at.x + giggle, at.y - h * 0.012 - h * 0.05 * ease(bunny.shown) + h * 0.03, h * 0.075);
    ctx.restore();
  }

  drawSprinkler(sprinkler) {
    const { ctx, height: h } = this;
    const at = this.at(sprinkler.x, sprinkler.y);
    const bob = this.reducedMotion ? 0 : Math.sin(this.time * 2) * h * 0.004;
    ctx.save();
    ctx.fillStyle = '#b07a4a';
    ctx.fillRect(at.x - 3, at.y, 6, h * GROUND - at.y);
    ctx.translate(at.x, at.y + bob);
    ctx.fillStyle = 'rgb(255 255 255 / 0.55)';
    ctx.beginPath();
    ctx.arc(0, 0, h * 0.045, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3aa86b';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, h * 0.028, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#d8f5e4';
    for (let i = 0; i < 7; i += 1) {
      const angle = (i / 7) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * h * 0.016, Math.sin(angle) * h * 0.016, h * 0.004, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawCloud(cloud) {
    const { ctx, height: h } = this;
    const at = this.at(cloud.x, cloud.y);
    const raining = cloud.state === 'raining';
    const fade = raining ? clamp(cloud.left / 0.8, 0, 1) : 1;
    const bob = this.reducedMotion ? 0 : Math.sin(this.time * 1.5) * h * 0.006;
    ctx.save();
    ctx.globalAlpha = fade;
    const puffs = () => {
      ctx.beginPath();
      for (const [dx, dy, r] of [[-0.06, 0.01, 0.035], [-0.02, -0.015, 0.045], [0.025, -0.01, 0.04], [0.06, 0.012, 0.032], [0, 0.02, 0.04]]) {
        ctx.moveTo(at.x + dx * h + r * h, at.y + dy * h + bob);
        ctx.arc(at.x + dx * h, at.y + dy * h + bob, r * h, 0, Math.PI * 2);
      }
    };
    // Its outline first, thick, and then its puffs filled in over it, so only the outside edge shows.
    ctx.strokeStyle = 'rgb(140 160 185 / 0.8)';
    ctx.lineWidth = 5;
    puffs();
    ctx.stroke();
    ctx.fillStyle = raining ? '#d9e2ee' : '#ffffff';
    puffs();
    ctx.fill();
    ctx.restore();
  }

  drawWater() {
    const { ctx, height: h } = this;
    ctx.save();
    ctx.fillStyle = 'rgb(96 176 255 / 0.85)';
    for (const drop of this.drops) {
      ctx.beginPath();
      ctx.ellipse(drop.x, drop.y, drop.size * h * 0.5, drop.size * h, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgb(96 176 255 / 0.7)';
    ctx.lineWidth = 2;
    for (const splash of this.splashes) {
      const share = 1 - splash.life / splash.total;
      const { y } = splash;
      ctx.globalAlpha = 1 - share;
      ctx.beginPath();
      ctx.arc(splash.x - 6 * share, y - 8 * Math.sin(share * Math.PI), 2, 0, Math.PI * 2);
      ctx.arc(splash.x + 6 * share, y - 6 * Math.sin(share * Math.PI), 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * A watering can, held by its handle at (x, y) and tipped by tip, from 0 to 1, with the glove holding it on top.
   * look is { body, ink, glove, alpha } for a friend's, which is grey and see-through, or for the second player's,
   * playing in one picture on one screen, which is solid, in their own blue, and has a blue tag too. sprinkler gives
   * it a big green rose, with a ring for how long that has left.
   */
  drawCan({ x, y, tip = 0, side = 1, glove = null, look = null, name = null, sprinkler = null }) {
    const { ctx, palmSize } = this;
    const size = palmSize * CAN_SIZE;
    const alpha = look?.alpha ?? 1;
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(side * tip * TIP_MOST);
    ctx.scale(side, 1);
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2.5, size * 0.035);
    ctx.strokeStyle = look?.ink ?? INK;
    const body = look?.body ?? '#4bb3a8';
    // The spout, from low on the body out to the rose.
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(size * 0.22, size * 0.78);
    ctx.lineTo(size * 0.9, size * 0.24);
    ctx.lineTo(size * 0.98, size * 0.32);
    ctx.lineTo(size * 0.3, size * 0.92);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // The rose, where the water comes out: big and green with the sprinkler.
    const rose = sprinkler ? size * 0.16 : size * 0.09;
    ctx.fillStyle = sprinkler ? '#3aa86b' : '#7fd3c8';
    ctx.beginPath();
    ctx.ellipse(size * ROSE.x - size * 0.02, size * ROSE.y + size * 0.06, rose * 0.6, rose, -0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // The body, and its handle over the top, which the hand holds.
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.roundRect(-size * 0.36, size * 0.3, size * 0.72, size * 0.72, size * 0.12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgb(255 255 255 / 0.25)';
    ctx.beginPath();
    ctx.roundRect(-size * 0.28, size * 0.38, size * 0.14, size * 0.52, size * 0.06);
    ctx.fill();
    ctx.lineWidth = Math.max(5, size * 0.09);
    ctx.strokeStyle = look?.ink ?? INK;
    ctx.beginPath();
    ctx.moveTo(-size * 0.26, size * 0.32);
    ctx.quadraticCurveTo(-size * 0.2, -size * 0.08, 0, -size * 0.04);
    ctx.quadraticCurveTo(size * 0.2, -size * 0.08, size * 0.26, size * 0.32);
    ctx.stroke();
    ctx.lineWidth = Math.max(3, size * 0.06);
    ctx.strokeStyle = body;
    ctx.stroke();
    ctx.restore();
    if (glove?.visible) {
      ctx.save();
      ctx.globalAlpha = alpha * (look && !look.solid ? 0.75 : 0.92);
      glove.draw(ctx, palmSize * 0.85, look ? { fill: look.glove, ink: look.ink } : null);
      ctx.restore();
    }
    if (sprinkler) {
      ctx.save();
      ctx.strokeStyle = 'rgb(255 255 255 / 0.9)';
      ctx.lineWidth = Math.max(3, size * 0.04);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(x, y + size * 0.6, size * 0.75, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(sprinkler, 0, 1));
      ctx.stroke();
      ctx.restore();
    }
    if (name) this.drawTag(name, x, y - palmSize * 1.3, alpha, look?.tag);
  }

  /** A bee flying in to its flower from the side, staying a moment, and off up to the tally with the honey. */
  drawBee(bee, garden) {
    if (!garden) return;
    const { width: w, height: h } = this;
    if (bee.t < 0) return;
    const flower = this.at(bee.plant.x, bee.plant.y - garden.heightOf(bee.plant));
    const share = bee.t / bee.total;
    let x;
    let y;
    if (share < 0.4) {
      const along = ease(share / 0.4);
      x = flower.x + bee.from * w * 0.25 * (1 - along);
      y = flower.y - h * 0.08 * (1 - along) - h * 0.03;
    } else if (share < 0.65) {
      x = flower.x + (this.reducedMotion ? 0 : Math.sin(this.time * 10) * h * 0.006);
      y = flower.y - h * 0.035;
    } else {
      const along = ease((share - 0.65) / 0.35);
      const to = bee.party ? { x: flower.x + bee.from * w * 0.2, y: -h * 0.1 } : this.prizeTarget();
      x = flower.x + (to.x - flower.x) * along;
      y = flower.y - h * 0.035 + (to.y - flower.y) * along;
    }
    this.drawMark('bee', x, y, h * 0.05, share > 0.9 ? (1 - share) * 10 : 1, bee.from);
  }

  drawMark(kind, x, y, size, alpha = 1, flip = 1) {
    const image = this.marks[kind];
    if (!image) return;
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    ctx.scale(flip, 1);
    ctx.drawImage(image, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  drawEffects() {
    const { ctx, height: h } = this;
    for (const effect of this.effects) {
      const share = 1 - effect.life / effect.total;
      ctx.save();
      ctx.globalAlpha = clamp(effect.life / effect.total, 0, 1);
      ctx.fillStyle = effect.colour;
      for (let i = 0; i < 6; i += 1) {
        const angle = (i / 6) * Math.PI * 2 + 0.4;
        const out = h * (0.02 + share * 0.04);
        this.drawStar(effect.x + Math.cos(angle) * out, effect.y + Math.sin(angle) * out, h * 0.008 * (1 - share * 0.5));
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
      const y = flight.y + (to.y - flight.y) * share - Math.sin(share * Math.PI) * this.height * 0.06;
      this.drawMark(flight.kind, x, y, this.height * 0.07 * (1.2 - 0.6 * share));
    }
  }

  /** A name over a can, white, or in a colour of its own with white writing. */
  drawTag(text, x, y, alpha = 1, colour = null) {
    const { ctx, palmSize } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `600 ${Math.round(Math.max(13, palmSize * 0.36))}px Fredoka, sans-serif`;
    const wide = ctx.measureText(text).width + 18;
    const high = Math.max(22, palmSize * 0.56);
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
    ctx.font = `600 ${Math.round(Math.max(15, palmSize * 0.42))}px Fredoka, 'Noto Sans Georgian', sans-serif`;
    const wide = ctx.measureText(label.text).width + 26;
    const high = Math.max(30, palmSize * 0.78);
    const left = clamp(x - wide / 2, 8, this.width - wide - 8);
    const top = clamp(y - h * 0.1 - high, h * 0.24, h - high - 8);
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
