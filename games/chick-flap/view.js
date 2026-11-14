// Flap, Little Chick!, drawn in 2D from the side: the farm going by behind, the track with whatever is in the
// way, a painted stretch before each thing where a flap will carry the chick over it, the corn, the chick with a
// wing for each of the child's hands, the fox behind, the mother hen when she's needed, friends' chicks, and the
// hen house at the end with Giraffe beside it.
//
// Nothing flashes: things come and go by sliding in from the edge of the screen, feathers and dust are small and
// fade, and the sky only changes from one level to another.
import { INK } from '../../core/glove.js';
import { CHICK_LOOKS, clamp, drawChick, drawCorn, drawDuck, drawFox, drawHen, mix, TAU } from './critters.js';
import { LABELS } from './farm.js';

const UNITS_ACROSS = 16; // At least this much of the track is on the screen, in the chick's units.
const UNITS_DOWN = 9.6;
const CHICK_AT = 0.3; // How far across the screen the chick is.
const GROUND_AT = 0.8; // And how far down the ground is.
const LABEL_SECONDS = 2.6;
const CORN_FLY_SECONDS = 0.8;
const CHICK_DRAWN = 1.18; // The chick is drawn a little bigger than it is, so its wings are easy to see.
export const GIRAFFE_TALL = 1.9; // Giraffe's body by the hen house, in the chick's units, without his neck.

// The sky and the land, which change a little as the levels go on: midday, late afternoon, and sunset at level 10.
const LANDS = [
  { from: 1, sky: ['#74c4f6', '#dff3ff'], sun: '#fff3b0', far: '#bfe3b4', near: '#98d383', field: '#b5e07e', grass: '#7cc75a', hedge: '#4f9e54', track: '#e2bd84', edge: '#c99f66' },
  { from: 7, sky: ['#7fb6ee', '#ffeccf'], sun: '#ffe39a', far: '#c4dcae', near: '#a2cc7c', field: '#c2d977', grass: '#84c257', hedge: '#55964c', track: '#e2b97e', edge: '#c69a5f' },
  { from: 10, sky: ['#f29a6b', '#ffe2b0'], sun: '#ffd27a', far: '#d7c39c', near: '#b9bf78', field: '#c9c56c', grass: '#8fb552', hedge: '#5f8f48', track: '#dcae78', edge: '#bd905a' },
];

const ease = (share) => share * share * (3 - 2 * share);
/** A number from 0 to 1 that's always the same for the same place, for scattering trees and stones. */
const scatter = (n, salt = 0) => {
  const value = Math.sin(n * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
};

export class FarmView {
  /** language() says which language a new thing's label is in, and cornTarget() where the corn's tally is. */
  constructor(canvas, { language = () => 'en', cornTarget = () => ({ x: 120, y: 40 }) } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.language = language;
    this.cornTarget = cornTarget;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.time = 0;
    this.cam = 0;
    this.giraffe = null; // Giraffe's pictures, if they could be drawn.
    this.clearOf = null; // Where a card over the farm starts across the screen, so the chick stands to its left.
    this.reset();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.ratio);
    this.canvas.height = Math.round(this.height * this.ratio);
    this.unit = Math.min(this.width / UNITS_ACROSS, this.height / UNITS_DOWN);
    this.ground = this.height * GROUND_AT;
    this.chickX = this.chickAt();
  }

  /**
   * How far across the screen the chick is: 0.3 of the way, or just to the left of a card over the farm, such as the
   * title card on a wide screen. If there isn't room for it there, it stays where it is.
   */
  chickAt() {
    const usual = this.width * CHICK_AT;
    if (this.clearOf === null) return usual;
    const beside = this.clearOf - this.unit * 1.1;
    return beside < this.unit * 2.5 ? usual : Math.min(usual, beside);
  }

  /** A new game: nothing left over from the last one. */
  reset() {
    this.effects = [];
    this.flying = [];
    this.labels = [];
    this.introduced = new Set();
    this.wanted = new Map();
    this.foxGap = null;
    this.pounce = null;
    this.henAway = null;
    this.flapFor = { left: 0, right: 0 };
    this.openFor = 0;
    this.cheerUntil = 0;
    this.cam = 0;
  }

  /** Where a place along the track is across the screen, and where a height is down it. */
  x(along) {
    return this.chickX + (along - this.cam) * this.unit;
  }

  y(high) {
    return this.ground - high * this.unit;
  }

  /* ---------- what happens, shown ---------- */

  /** A wing flaps: a few small feathers, and the wing's feathers spread for a moment. */
  flap(farm, sides, open) {
    const { chick } = farm;
    for (const side of sides) this.flapFor[side] = 0.28;
    if (open) this.openFor = 0.5;
    if (this.reducedMotion) return;
    for (let n = 0; n < 2; n += 1) {
      this.effects.push({ kind: 'feather', x: chick.x - 0.2 - n * 0.12, h: chick.h + 0.45, vx: -0.6 - n * 0.4, vh: 0.5, life: 0.8, total: 0.8, spin: n * 2 });
    }
  }

  /** A little dust, as the chick lands or tumbles. */
  dust(x, h = 0) {
    for (let n = 0; n < 3; n += 1) this.effects.push({ kind: 'dust', x: x + (n - 1) * 0.22, h: h + 0.06, vx: (n - 1) * 0.5, vh: 0.35, life: 0.5, total: 0.5 });
  }

  /** Drops of water, as it lands in the pond. */
  drops(x) {
    for (let n = 0; n < 7; n += 1) {
      const way = -1 + (n / 6) * 2;
      this.effects.push({ kind: 'drop', x, h: 0.05, vx: way * 1.3, vh: 2.4 - Math.abs(way) * 0.8, life: 0.8, total: 0.8 });
    }
  }

  /** A few leaves or straws, as it bumps the scarecrow. */
  straw(x, h) {
    for (let n = 0; n < 4; n += 1) this.effects.push({ kind: 'straw', x: x + (n - 1.5) * 0.2, h, vx: (n - 1.5) * 0.5, vh: 0.6, life: 0.9, total: 0.9, spin: n });
  }

  /** A piece of corn goes up to the tally. */
  cornTaken(piece) {
    this.flying.push({ x: this.x(piece.x), y: this.y(piece.h), t: 0 });
    this.effects.push({ kind: 'spark', x: piece.x, h: piece.h, vx: 0, vh: 0, life: 0.4, total: 0.4 });
  }

  /** The fox leaps at the chick as it goes over him, and misses. */
  foxLeaps(thing) {
    this.pounce = { x: (thing.x0 + thing.x1) / 2, t: 0 };
  }

  /** The hen has set the chick down, and flies off. */
  henLeaves(x) {
    this.henAway = { x, t: 0 };
  }

  /** Everyone by the hen house cheers for a while. */
  cheer(seconds = 3) {
    this.cheerUntil = Math.max(this.cheerUntil, this.time + seconds);
  }

  /**
   * A new thing's label, the first time it comes along in a game. target() says where it is, as { x, h } along the
   * track and up from it, or null once it has gone. They come one at a time, so each is read.
   */
  introduce(key, target) {
    if (this.introduced.has(key) || !LABELS[key] || this.wanted.has(key)) return;
    this.wanted.set(key, target);
  }

  nextLabel() {
    if (this.labels.length) return;
    for (const [key, target] of this.wanted) {
      const where = target();
      if (!where) {
        this.wanted.delete(key);
        continue;
      }
      // Not until it's on the screen, so it's read where the thing is.
      const across = this.x(where.x);
      if (across < 40 || across > this.width - 40) continue;
      this.wanted.delete(key);
      this.introduced.add(key);
      const [en, ka] = LABELS[key];
      this.labels.push({ key, target, life: LABEL_SECONDS, text: this.language() === 'ka' ? ka : en });
      return;
    }
  }

  /** One frame of everything that moves by itself. farm is the game as it is. */
  update(dt, farm) {
    this.time += dt;
    const { chick, fox } = farm;
    // The chick slides over to where it's to stand on the screen, or is just there with reduced motion.
    const at = this.chickAt();
    this.chickX = this.reducedMotion ? at : this.chickX + (at - this.chickX) * (1 - Math.exp(-dt * 4));
    // The picture follows the chick, a moment behind, so a tumble doesn't jolt it.
    this.cam += (chick.x - this.cam) * (1 - Math.exp(-dt * 9));
    if (Math.abs(chick.x - this.cam) > 6) this.cam = chick.x;
    // The fox is drawn where he is, a moment behind, and comes up fast when he has the chick.
    const foxRate = chick.state === 'caught' ? 7 : 2.2;
    this.foxGap = this.foxGap === null ? fox.gap : this.foxGap + (fox.gap - this.foxGap) * (1 - Math.exp(-dt * foxRate));
    for (const side of ['left', 'right']) this.flapFor[side] = Math.max(0, this.flapFor[side] - dt);
    this.openFor = Math.max(0, this.openFor - dt);
    for (const effect of this.effects) {
      effect.life -= dt;
      effect.x += effect.vx * dt;
      effect.h += effect.vh * dt;
      if (effect.kind === 'drop') effect.vh -= 6 * dt;
      else if (effect.kind === 'feather' || effect.kind === 'straw') effect.vh = Math.max(-0.5, effect.vh - 1.6 * dt);
    }
    this.effects = this.effects.filter((effect) => effect.life > 0);
    for (const flight of this.flying) flight.t += dt;
    this.flying = this.flying.filter((flight) => flight.t < CORN_FLY_SECONDS);
    if (this.pounce) {
      this.pounce.t += dt;
      if (this.pounce.t > 1.5) this.pounce = null;
    }
    if (this.henAway) {
      this.henAway.t += dt;
      if (this.henAway.t > 1.6) this.henAway = null;
    }
    for (const label of this.labels) label.life -= dt;
    this.labels = this.labels.filter((label) => label.life > 0 && label.target());
    this.nextLabel();
  }

  /* ---------- drawing ---------- */

  /**
   * Draws everything. model is { farm, friends, waving }: the game as it is, the friends' chicks, each as { x, h,
   * wings, state, name, look }, and whether Giraffe waves.
   */
  render({ farm, friends = [], waving = false } = {}) {
    const { ctx, ratio } = this;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const land = [...LANDS].reverse().find((each) => farm.level >= each.from) ?? LANDS[0];
    this.land = land;
    this.drawSky(land);
    this.drawHills(land);
    this.drawField(land);
    if (farm.fox.mode === 'dash') this.drawDash(farm);
    this.drawHedge(land);
    this.drawTrack(land);
    for (const thing of farm.things) if (thing.type !== 'zone' && !thing.done) this.drawStretch(farm, thing);
    for (const thing of farm.things) if (thing.type === 'water') this.drawPond(thing);
    this.drawHome(farm, waving);
    for (const thing of farm.things) this.drawThing(farm, thing);
    for (const piece of farm.corn) if (!piece.taken) this.drawPiece(piece);
    this.drawFox(farm, friends);
    for (const friend of friends) this.drawFriend(friend);
    this.drawChick(farm);
    for (const thing of farm.things) if (thing.type === 'water') this.drawWaterFront(thing);
    for (const thing of farm.things) if (thing.type === 'zone') this.drawGust(thing);
    this.drawEffects();
    this.drawGrass(land);
    this.drawFlying();
    for (const label of this.labels) this.drawLabel(label);
  }

  drawSky(land) {
    const { ctx, width: w, height: h } = this;
    const sky = ctx.createLinearGradient(0, 0, 0, this.ground);
    sky.addColorStop(0, land.sky[0]);
    sky.addColorStop(1, land.sky[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    // The sun, soft, and a few clouds that hardly move.
    const sun = { x: w * 0.44, y: this.ground - this.unit * 5.4 };
    const glow = ctx.createRadialGradient(sun.x, sun.y, this.unit * 0.3, sun.x, sun.y, this.unit * 1.7);
    glow.addColorStop(0, land.sun);
    glow.addColorStop(1, 'rgb(255 255 255 / 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sun.x, sun.y, this.unit * 1.7, 0, TAU);
    ctx.fill();
    ctx.fillStyle = land.sun;
    ctx.beginPath();
    ctx.arc(sun.x, sun.y, this.unit * 0.52, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgb(255 255 255 / 0.86)';
    const span = w + this.unit * 8;
    for (let n = 0; n < 5; n += 1) {
      const drift = (scatter(n, 3) * span - this.cam * this.unit * 0.04 - (this.reducedMotion ? 0 : this.time * this.unit * 0.05)) % span;
      const x = ((drift % span) + span) % span - this.unit * 4;
      const y = this.ground - this.unit * (4.3 + scatter(n, 5) * 2.4);
      const size = this.unit * (0.5 + scatter(n, 7) * 0.4);
      for (const [dx, dy, r] of [[-1.1, 0.12, 0.62], [0, -0.2, 0.9], [1.1, 0.12, 0.62], [0.5, 0.25, 0.7], [-0.5, 0.25, 0.7]]) {
        ctx.beginPath();
        ctx.ellipse(x + dx * size, y + dy * size, r * size * 1.3, r * size * 0.8, 0, 0, TAU);
        ctx.fill();
      }
    }
  }

  /** Two rows of hills, going by slowly. */
  drawHills(land) {
    const { ctx, width: w, unit } = this;
    for (const [colour, slow, high, salt] of [[land.far, 0.1, 2.9, 0], [land.near, 0.2, 2.1, 4]]) {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.moveTo(0, this.ground);
      for (let x = 0; x <= w + 24; x += 24) {
        const along = x / unit + this.cam * slow + salt * 9;
        const rise = high + Math.sin(along * 0.42) * 0.55 + Math.sin(along * 0.97 + 1.3) * 0.22;
        ctx.lineTo(x, this.ground - rise * unit);
      }
      ctx.lineTo(w, this.ground);
      ctx.closePath();
      ctx.fill();
    }
  }

  /** The fields between the hills and the track: trees, a barn, a windmill and haystacks, going by at half speed. */
  drawField(land) {
    const { ctx, width: w, unit } = this;
    const top = this.ground - unit * 1.25;
    ctx.fillStyle = land.field;
    ctx.fillRect(0, top, w, this.ground - top);
    // Rows in the field, as lines that lean with the way it's going.
    ctx.strokeStyle = 'rgb(255 255 255 / 0.22)';
    ctx.lineWidth = Math.max(1, unit * 0.03);
    const slow = 0.5;
    const each = 1.4;
    const start = Math.floor((this.cam * slow - this.chickX / unit) / each) - 1;
    ctx.beginPath();
    for (let n = start; n < start + w / unit / each + 3; n += 1) {
      const x = this.chickX + (n * each - this.cam * slow) * unit;
      ctx.moveTo(x, this.ground - unit * 0.1);
      ctx.lineTo(x + unit * 0.5, top + unit * 0.12);
    }
    ctx.stroke();
    // What stands in it: one in each stretch, chosen by where it is.
    const wide = 5.2;
    const first = Math.floor((this.cam * slow - this.chickX / unit) / wide) - 1;
    for (let n = first; n < first + w / unit / wide + 3; n += 1) {
      const x = this.chickX + ((n + 0.2 + scatter(n, 1) * 0.6) * wide - this.cam * slow) * unit;
      const base = this.ground - unit * (0.62 + scatter(n, 2) * 0.3);
      const pick = scatter(n, 9);
      ctx.save();
      ctx.translate(x, base);
      ctx.scale(unit * 0.62, unit * 0.62);
      if (pick < 0.42) this.drawTree(n);
      else if (pick < 0.62) this.drawBarn();
      else if (pick < 0.8) this.drawStack();
      else this.drawMill();
      ctx.restore();
    }
  }

  drawTree(n) {
    const { ctx } = this;
    ctx.fillStyle = '#9a6b3f';
    ctx.fillRect(-0.09, -0.7, 0.18, 0.7);
    ctx.fillStyle = scatter(n, 4) > 0.5 ? '#58a85a' : '#63b565';
    for (const [x, y, r] of [[0, -1.2, 0.62], [-0.42, -0.92, 0.42], [0.42, -0.96, 0.44]]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
  }

  drawBarn() {
    const { ctx } = this;
    ctx.fillStyle = '#d9584a';
    ctx.fillRect(-0.9, -1, 1.8, 1);
    ctx.fillStyle = '#b8473c';
    ctx.beginPath();
    ctx.moveTo(-1.05, -1);
    ctx.lineTo(-0.6, -1.5);
    ctx.lineTo(0.6, -1.5);
    ctx.lineTo(1.05, -1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff4e2';
    ctx.fillRect(-0.3, -0.62, 0.6, 0.62);
    ctx.strokeStyle = '#d9584a';
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    ctx.moveTo(-0.3, -0.62);
    ctx.lineTo(0.3, 0);
    ctx.moveTo(0.3, -0.62);
    ctx.lineTo(-0.3, 0);
    ctx.stroke();
  }

  drawStack() {
    const { ctx } = this;
    ctx.fillStyle = '#eec95c';
    ctx.beginPath();
    ctx.moveTo(-0.6, 0);
    ctx.quadraticCurveTo(-0.62, -0.9, 0, -0.95);
    ctx.quadraticCurveTo(0.62, -0.9, 0.6, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgb(180 130 40 / 0.5)';
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    ctx.moveTo(-0.3, -0.1);
    ctx.lineTo(-0.2, -0.7);
    ctx.moveTo(0.1, -0.1);
    ctx.lineTo(0.06, -0.8);
    ctx.moveTo(0.36, -0.1);
    ctx.lineTo(0.3, -0.6);
    ctx.stroke();
  }

  drawMill() {
    const { ctx } = this;
    ctx.fillStyle = '#f3ead8';
    ctx.beginPath();
    ctx.moveTo(-0.34, 0);
    ctx.lineTo(-0.2, -1.5);
    ctx.lineTo(0.2, -1.5);
    ctx.lineTo(0.34, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#b8473c';
    ctx.beginPath();
    ctx.moveTo(-0.28, -1.5);
    ctx.lineTo(0, -1.86);
    ctx.lineTo(0.28, -1.5);
    ctx.closePath();
    ctx.fill();
    // Its sails turn slowly: far too slowly to flicker.
    ctx.save();
    ctx.translate(0, -1.5);
    ctx.rotate(this.reducedMotion ? 0.4 : this.time * 0.35);
    ctx.strokeStyle = '#9a6b3f';
    ctx.lineWidth = 0.07;
    ctx.beginPath();
    for (let n = 0; n < 4; n += 1) {
      const turn = (n * TAU) / 4;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(turn) * 0.95, Math.sin(turn) * 0.95);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** The hedge along the back of the track. */
  drawHedge(land) {
    const { ctx, width: w, unit } = this;
    const slow = 0.9;
    const each = 0.9;
    const first = Math.floor((this.cam * slow - this.chickX / unit) / each) - 1;
    ctx.fillStyle = land.hedge;
    ctx.fillRect(0, this.ground - unit * 0.42, w, unit * 0.36);
    for (let n = first; n < first + w / unit / each + 3; n += 1) {
      const x = this.chickX + (n * each - this.cam * slow) * unit;
      ctx.beginPath();
      ctx.arc(x, this.ground - unit * 0.42, unit * (0.4 + scatter(n, 6) * 0.14), Math.PI, 0);
      ctx.fill();
    }
    // A flower here and there.
    for (let n = first; n < first + w / unit / each + 3; n += 1) {
      if (scatter(n, 8) > 0.3) continue;
      const x = this.chickX + ((n + 0.4) * each - this.cam * slow) * unit;
      ctx.fillStyle = scatter(n, 10) > 0.5 ? '#fff4e2' : '#ffd23f';
      ctx.beginPath();
      ctx.arc(x, this.ground - unit * (0.5 + scatter(n, 11) * 0.2), unit * 0.055, 0, TAU);
      ctx.fill();
      ctx.fillStyle = land.hedge;
    }
  }

  /** The track itself, with a few stones and tufts going by, and the grass in front of it. */
  drawTrack(land) {
    const { ctx, width: w, height: h, unit } = this;
    ctx.fillStyle = land.grass;
    ctx.fillRect(0, this.ground - unit * 0.1, w, h - this.ground + unit * 0.1);
    ctx.fillStyle = land.track;
    ctx.fillRect(0, this.ground - unit * 0.08, w, unit * 0.5);
    ctx.fillStyle = land.edge;
    ctx.fillRect(0, this.ground + unit * 0.38, w, unit * 0.045);
    const each = 1.1;
    const first = Math.floor((this.cam - this.chickX / unit) / each) - 1;
    for (let n = first; n < first + w / unit / each + 3; n += 1) {
      const x = this.x((n + scatter(n, 12)) * each);
      const y = this.ground + unit * (0.08 + scatter(n, 13) * 0.24);
      ctx.fillStyle = scatter(n, 14) > 0.5 ? 'rgb(150 110 60 / 0.35)' : 'rgb(255 255 255 / 0.3)';
      ctx.beginPath();
      ctx.ellipse(x, y, unit * 0.07, unit * 0.035, 0, 0, TAU);
      ctx.fill();
    }
  }

  /** Blades of grass along the bottom, in front of everything, going by a little faster. */
  drawGrass(land) {
    const { ctx, width: w, height: h, unit } = this;
    const fast = 1.25;
    const each = 0.55;
    const first = Math.floor((this.cam * fast - this.chickX / unit) / each) - 1;
    ctx.fillStyle = land.hedge;
    ctx.globalAlpha = 0.5;
    for (let n = first; n < first + w / unit / each + 3; n += 1) {
      if (scatter(n, 15) > 0.55) continue;
      const x = this.chickX + (n * each - this.cam * fast) * unit;
      const tall = unit * (0.16 + scatter(n, 16) * 0.2);
      ctx.beginPath();
      ctx.moveTo(x - unit * 0.07, h);
      ctx.quadraticCurveTo(x - unit * 0.02, h - tall * 0.6, x + unit * 0.03, h - tall);
      ctx.quadraticCurveTo(x + unit * 0.05, h - tall * 0.5, x + unit * 0.09, h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /**
   * The painted stretch before a thing, where a flap carries the chick over it: pale, with arrows pointing up, one
   * for a thing one wing gets over and two side by side for one that needs both.
   */
  drawStretch(farm, thing) {
    const zone = farm.zoneOf(thing);
    if (!zone || thing.inGust) return;
    const { ctx, unit } = this;
    const [from, to] = [this.x(zone.from), this.x(zone.to)];
    if (to < -20 || from > this.width + 20) return;
    const [top, tall] = [this.ground - unit * 0.05, unit * 0.4];
    ctx.save();
    ctx.fillStyle = 'rgb(255 255 255 / 0.42)';
    ctx.beginPath();
    ctx.roundRect(from, top, to - from, tall, unit * 0.12);
    ctx.fill();
    ctx.strokeStyle = 'rgb(255 255 255 / 0.95)';
    ctx.lineWidth = unit * 0.07;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const count = Math.max(1, Math.round((to - from) / (unit * 0.95)));
    for (let n = 0; n < count; n += 1) {
      const x = from + ((n + 0.5) * (to - from)) / count;
      for (const dx of thing.wings === 2 ? [-0.17, 0.17] : [0]) {
        ctx.beginPath();
        ctx.moveTo(x + (dx - 0.11) * unit, top + tall * 0.66);
        ctx.lineTo(x + dx * unit, top + tall * 0.32);
        ctx.lineTo(x + (dx + 0.11) * unit, top + tall * 0.66);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** A pond: water set into the track, with reeds at each end. */
  drawPond(thing) {
    const { ctx, unit } = this;
    const [from, to] = [this.x(thing.x0), this.x(thing.x1)];
    if (to < -unit || from > this.width + unit) return;
    const top = this.ground - unit * 0.06;
    const water = ctx.createLinearGradient(0, top, 0, top + unit * 0.5);
    water.addColorStop(0, '#8fd6f2');
    water.addColorStop(1, '#4aa9d6');
    ctx.fillStyle = water;
    ctx.beginPath();
    ctx.roundRect(from, top, to - from, unit * 0.5, [unit * 0.1, unit * 0.1, unit * 0.3, unit * 0.3]);
    ctx.fill();
    ctx.strokeStyle = '#3d8fb8';
    ctx.lineWidth = unit * 0.03;
    ctx.stroke();
    // Ripples that drift, slowly.
    ctx.strokeStyle = 'rgb(255 255 255 / 0.6)';
    ctx.lineWidth = unit * 0.03;
    ctx.lineCap = 'round';
    const count = Math.max(2, Math.round((thing.x1 - thing.x0) / 1.1));
    for (let n = 0; n < count; n += 1) {
      const sway = this.reducedMotion ? 0 : Math.sin(this.time * 0.9 + n * 1.7) * unit * 0.1;
      const x = from + ((n + 0.5) * (to - from)) / count + sway;
      const y = top + unit * (0.14 + (n % 2) * 0.16);
      ctx.beginPath();
      ctx.moveTo(x - unit * 0.18, y);
      ctx.lineTo(x + unit * 0.18, y);
      ctx.stroke();
    }
    // Reeds at each bank.
    for (const [x, way] of [[from, -1], [to, 1]]) {
      for (let n = 0; n < 3; n += 1) {
        const lean = way * (0.05 + n * 0.08) * unit;
        const tall = unit * (0.7 + n * 0.16);
        ctx.strokeStyle = '#4f9e54';
        ctx.lineWidth = unit * 0.05;
        ctx.beginPath();
        ctx.moveTo(x + way * n * unit * 0.07, top + unit * 0.06);
        ctx.quadraticCurveTo(x + lean * 0.5, top - tall * 0.6, x + lean * 1.6, top - tall);
        ctx.stroke();
        if (n === 1) {
          ctx.fillStyle = '#8a5a2b';
          ctx.beginPath();
          ctx.ellipse(x + lean * 1.5, top - tall * 0.94, unit * 0.05, unit * 0.13, way * 0.2, 0, TAU);
          ctx.fill();
        }
      }
    }
  }

  /** The front of the pond's water, over a chick that's in it and the duck's feet. */
  drawWaterFront(thing) {
    const { ctx, unit } = this;
    const [from, to] = [this.x(thing.x0), this.x(thing.x1)];
    if (to < -unit || from > this.width + unit) return;
    const top = this.ground + unit * 0.1;
    ctx.fillStyle = 'rgb(86 178 221 / 0.82)';
    ctx.beginPath();
    ctx.roundRect(from + unit * 0.04, top, to - from - unit * 0.08, unit * 0.32, [0, 0, unit * 0.28, unit * 0.28]);
    ctx.fill();
  }

  /** One thing in the way: a log, a fence, a bale, the hay cart behind its tractor, the scarecrow, or the fox. */
  drawThing(farm, thing) {
    const { ctx, unit } = this;
    const [from, to] = [this.x(thing.x0), this.x(thing.x1)];
    if (to < -unit * 3 || from > this.width + unit * 3) return;
    if (thing.type === 'water') {
      if (thing.duck) this.drawDuckOn(farm, thing);
      return;
    }
    if (thing.type === 'zone') return;
    ctx.save();
    ctx.translate(from, this.ground);
    ctx.scale(unit, unit);
    const wide = thing.x1 - thing.x0;
    if (thing.kind === 'log') this.drawLog(wide, thing.tall);
    else if (thing.kind === 'fence') this.drawFence(wide, thing.tall);
    else if (thing.kind === 'hay') this.drawBale(wide, thing.tall);
    else if (thing.kind === 'tractor') this.drawTractor(wide, thing.tall, thing);
    else if (thing.kind === 'scarecrow') this.drawScarecrow(wide, thing);
    ctx.restore();
    if (thing.kind === 'fox' && thing.waiting && !this.pounce) {
      // The fox, on the track, crouched and facing the chick.
      ctx.save();
      ctx.translate((from + to) / 2 + unit * 0.2, this.ground);
      ctx.scale(-unit * 1.1, unit * 1.1);
      drawFox(ctx, { pose: 'crouch', time: this.time });
      ctx.restore();
    }
  }

  ink(wide = 0.05) {
    const { ctx } = this;
    ctx.strokeStyle = INK;
    ctx.lineWidth = wide;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  drawLog(wide, tall) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.roundRect(0, -tall, wide, tall, tall * 0.42);
    ctx.fillStyle = '#b07a48';
    ctx.fill();
    this.ink();
    ctx.strokeStyle = 'rgb(90 55 25 / 0.5)';
    ctx.lineWidth = 0.035;
    ctx.beginPath();
    ctx.moveTo(wide * 0.3, -tall * 0.72);
    ctx.lineTo(wide * 0.62, -tall * 0.72);
    ctx.moveTo(wide * 0.38, -tall * 0.34);
    ctx.lineTo(wide * 0.76, -tall * 0.34);
    ctx.stroke();
    // The sawn end, with its rings.
    ctx.beginPath();
    ctx.ellipse(tall * 0.36, -tall / 2, tall * 0.3, tall * 0.42, 0, 0, TAU);
    ctx.fillStyle = '#e8c48c';
    ctx.fill();
    this.ink(0.04);
    ctx.strokeStyle = 'rgb(140 95 50 / 0.7)';
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    ctx.ellipse(tall * 0.36, -tall / 2, tall * 0.15, tall * 0.22, 0, 0, TAU);
    ctx.stroke();
    // A leaf on a twig.
    ctx.strokeStyle = '#7a4f28';
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    ctx.moveTo(wide * 0.72, -tall);
    ctx.lineTo(wide * 0.8, -tall - 0.16);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(wide * 0.86, -tall - 0.2, 0.1, 0.055, -0.5, 0, TAU);
    ctx.fillStyle = '#6cc04a';
    ctx.fill();
  }

  drawFence(wide, tall) {
    const { ctx } = this;
    // Seen end on, as it crosses the track: its boards go away behind it, and the near post stands on the track.
    const post = (x, high, colour) => {
      ctx.beginPath();
      ctx.moveTo(x - 0.11, 0);
      ctx.lineTo(x - 0.11, -high + 0.12);
      ctx.lineTo(x, -high);
      ctx.lineTo(x + 0.11, -high + 0.12);
      ctx.lineTo(x + 0.11, 0);
      ctx.closePath();
      ctx.fillStyle = colour;
      ctx.fill();
      this.ink(0.045);
    };
    ctx.fillStyle = '#d9b27c';
    for (const high of [0.5, 0.98, 1.46]) {
      ctx.beginPath();
      ctx.moveTo(wide / 2, -high * (tall / 1.9));
      ctx.lineTo(wide / 2 + 0.62, -high * (tall / 1.9) - 0.34);
      ctx.lineTo(wide / 2 + 0.62, -high * (tall / 1.9) - 0.18);
      ctx.lineTo(wide / 2, -high * (tall / 1.9) + 0.16);
      ctx.closePath();
      ctx.fill();
      this.ink(0.04);
    }
    ctx.save();
    ctx.translate(0.62, -0.34);
    post(wide / 2, tall * 0.9, '#c79c62');
    ctx.restore();
    post(wide / 2, tall, '#e6c392');
  }

  drawBale(wide, tall) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.roundRect(0, -tall, wide, tall, 0.12);
    ctx.fillStyle = '#f0cf62';
    ctx.fill();
    this.ink();
    ctx.strokeStyle = 'rgb(176 128 38 / 0.6)';
    ctx.lineWidth = 0.035;
    ctx.beginPath();
    for (let n = 1; n < 5; n += 1) {
      ctx.moveTo(0.08, -(tall * n) / 5);
      ctx.lineTo(wide - 0.08, -(tall * n) / 5);
    }
    ctx.stroke();
    // The strings round it.
    ctx.strokeStyle = '#c0553f';
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(wide * 0.3, -tall);
    ctx.lineTo(wide * 0.3, 0);
    ctx.moveTo(wide * 0.7, -tall);
    ctx.lineTo(wide * 0.7, 0);
    ctx.stroke();
  }

  /** A cart piled with hay, and the little tractor pulling it along. */
  drawTractor(wide, tall, thing) {
    const { ctx } = this;
    const turn = thing.moving ? (this.time * 3) % TAU : 0;
    const wheel = (x, r) => {
      ctx.beginPath();
      ctx.arc(x, -r, r, 0, TAU);
      ctx.fillStyle = '#2f3440';
      ctx.fill();
      this.ink(0.045);
      ctx.beginPath();
      ctx.arc(x, -r, r * 0.45, 0, TAU);
      ctx.fillStyle = '#ffd23f';
      ctx.fill();
      ctx.strokeStyle = '#2f3440';
      ctx.lineWidth = 0.04;
      ctx.beginPath();
      for (let n = 0; n < 3; n += 1) {
        ctx.moveTo(x, -r);
        ctx.lineTo(x + Math.cos(turn + (n * TAU) / 3) * r * 0.45, -r + Math.sin(turn + (n * TAU) / 3) * r * 0.45);
      }
      ctx.stroke();
    };
    const cart = wide * 0.56;
    // The cart, and its hay, right up to the top.
    ctx.beginPath();
    ctx.roundRect(0.05, -tall, cart - 0.1, tall - 0.5, 0.2);
    ctx.fillStyle = '#f0cf62';
    ctx.fill();
    this.ink();
    ctx.strokeStyle = 'rgb(176 128 38 / 0.6)';
    ctx.lineWidth = 0.035;
    ctx.beginPath();
    for (let n = 1; n < 5; n += 1) {
      ctx.moveTo(0.2, -0.5 - ((tall - 0.5) * n) / 5);
      ctx.lineTo(cart - 0.2, -0.5 - ((tall - 0.5) * n) / 5);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(0, -0.62, cart, 0.3, 0.06);
    ctx.fillStyle = '#4f8fd0';
    ctx.fill();
    this.ink();
    wheel(cart * 0.3, 0.26);
    wheel(cart * 0.72, 0.26);
    // The tractor: its cab as high as the hay, a bonnet, a big wheel and a small one, and a little puff of smoke.
    ctx.fillStyle = '#e5484d';
    ctx.beginPath();
    ctx.roundRect(cart + 0.1, -tall, 0.9, tall - 0.4, 0.12);
    ctx.fill();
    this.ink();
    ctx.beginPath();
    ctx.roundRect(cart + 0.24, -tall + 0.16, 0.62, 0.62, 0.08);
    ctx.fillStyle = '#cfeeff';
    ctx.fill();
    this.ink(0.04);
    ctx.beginPath();
    ctx.roundRect(cart + 0.92, -1.1, wide - cart - 0.96, 0.7, 0.1);
    ctx.fillStyle = '#e5484d';
    ctx.fill();
    this.ink();
    ctx.fillStyle = '#2f3440';
    ctx.fillRect(wide - 0.3, -1.42, 0.09, 0.34);
    if (thing.moving && !this.reducedMotion) {
      for (let n = 0; n < 3; n += 1) {
        const age = (this.time * 0.8 + n / 3) % 1;
        ctx.globalAlpha = 0.5 * (1 - age);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(wide - 0.26 - age * 0.5, -1.5 - age * 0.7, 0.08 + age * 0.12, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    wheel(cart + 0.5, 0.5);
    wheel(wide - 0.36, 0.3);
  }

  /** The scarecrow: a pole behind the track, his coat and his arms held out over it, and his hat on top. */
  drawScarecrow(wide, thing) {
    const { ctx } = this;
    const mid = wide / 2;
    const { low, top } = thing;
    ctx.strokeStyle = '#8a5a2b';
    ctx.lineWidth = 0.12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(mid, -0.12);
    ctx.lineTo(mid, -top + 0.5);
    ctx.moveTo(-0.15, -low - 0.42);
    ctx.lineTo(wide + 0.15, -low - 0.42);
    ctx.stroke();
    // His coat, hanging down to just over the chick's head.
    ctx.beginPath();
    ctx.moveTo(mid - 0.42, -low - 0.5);
    ctx.lineTo(mid + 0.42, -low - 0.5);
    ctx.lineTo(mid + 0.5, -low + 0.02);
    ctx.lineTo(mid + 0.22, -low - 0.1);
    ctx.lineTo(mid, -low + 0.02);
    ctx.lineTo(mid - 0.22, -low - 0.1);
    ctx.lineTo(mid - 0.5, -low + 0.02);
    ctx.closePath();
    ctx.fillStyle = '#5b8fd9';
    ctx.fill();
    this.ink();
    // Sleeves along his arms, with straw at the cuffs.
    for (const way of [-1, 1]) {
      ctx.beginPath();
      ctx.roundRect(way > 0 ? mid + 0.3 : -0.05, -low - 0.56, mid - 0.25, 0.3, 0.08);
      ctx.fillStyle = '#5b8fd9';
      ctx.fill();
      this.ink();
      ctx.strokeStyle = '#eec95c';
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      const cuff = way > 0 ? wide + 0.05 : -0.05;
      for (const dy of [-0.1, 0, 0.1]) {
        ctx.moveTo(cuff, -low - 0.42);
        ctx.lineTo(cuff + way * 0.2, -low - 0.42 + dy + 0.12);
      }
      ctx.stroke();
    }
    // A patch on the coat.
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(mid + 0.08, -low - 0.36, 0.16, 0.16);
    // His head, a sack with a smile, and his hat.
    ctx.beginPath();
    ctx.arc(mid, -low - 0.86, 0.34, 0, TAU);
    ctx.fillStyle = '#f3deb0';
    ctx.fill();
    this.ink();
    ctx.fillStyle = INK;
    for (const dx of [-0.12, 0.12]) {
      ctx.beginPath();
      ctx.arc(mid + dx, -low - 0.9, 0.04, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    ctx.arc(mid, -low - 0.84, 0.16, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(mid, -low - 1.12, 0.56, 0.1, 0, 0, TAU);
    ctx.fillStyle = '#c98a3e';
    ctx.fill();
    this.ink(0.045);
    ctx.beginPath();
    ctx.moveTo(mid - 0.3, -low - 1.14);
    ctx.quadraticCurveTo(mid, -top - 0.12, mid + 0.3, -low - 1.14);
    ctx.closePath();
    ctx.fillStyle = '#c98a3e';
    ctx.fill();
    this.ink(0.045);
  }

  /** The duck on her pond, and the chick on her back while it's riding. */
  drawDuckOn(farm, thing) {
    const { ctx, unit } = this;
    ctx.save();
    ctx.translate(this.x(thing.duck.x), this.ground + unit * 0.12);
    ctx.scale(unit, unit);
    drawDuck(ctx, { time: this.time, swimming: thing.duck.riding });
    ctx.restore();
  }

  /** A gust of wind: curling lines and a few leaves, drifting along. */
  drawGust(thing) {
    const { ctx, unit } = this;
    const [from, to] = [this.x(thing.x0), this.x(thing.x1)];
    if (to < -unit || from > this.width + unit) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = unit * 0.07;
    const long = thing.x1 - thing.x0;
    for (let n = 0; n < 7; n += 1) {
      const high = 0.9 + (n % 4) * 0.82;
      const drift = this.reducedMotion ? scatter(n, 21) : (this.time * 0.22 + scatter(n, 21)) % 1;
      const x = this.x(thing.x0 + drift * long);
      const y = this.y(high + Math.sin(drift * 6 + n) * 0.12);
      // Fading in at one end and out at the other, so nothing pops.
      ctx.strokeStyle = `rgb(255 255 255 / ${(0.75 * Math.sin(Math.PI * drift)).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(x - unit * 0.9, y);
      ctx.bezierCurveTo(x - unit * 0.3, y - unit * 0.1, x + unit * 0.2, y + unit * 0.1, x + unit * 0.5, y - unit * 0.05);
      ctx.arc(x + unit * 0.5, y - unit * 0.18, unit * 0.13, Math.PI / 2, -Math.PI * 0.8, true);
      ctx.stroke();
    }
    for (let n = 0; n < 5; n += 1) {
      const drift = this.reducedMotion ? scatter(n, 23) : (this.time * 0.3 + scatter(n, 23)) % 1;
      const x = this.x(thing.x0 + drift * long);
      const y = this.y(0.6 + scatter(n, 24) * 3 + Math.sin(drift * 9 + n) * 0.25);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(drift * 9 + n);
      ctx.globalAlpha = Math.sin(Math.PI * drift);
      ctx.fillStyle = n % 2 ? '#8fd07a' : '#f0b03c';
      ctx.beginPath();
      ctx.ellipse(0, 0, unit * 0.13, unit * 0.06, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  drawPiece(piece) {
    const { ctx, unit } = this;
    const x = this.x(piece.x);
    if (x < -unit || x > this.width + unit) return;
    const bob = this.reducedMotion ? 0 : Math.sin(this.time * 2.6 + piece.id) * 0.05;
    ctx.save();
    ctx.translate(x, this.y(piece.h + bob));
    ctx.scale(unit, unit);
    drawCorn(ctx, { time: this.reducedMotion ? 0 : this.time, phase: piece.id });
    ctx.restore();
  }

  /** How high the fox is as he hops over whatever he's passing, so he never runs through a log or a pond. */
  foxHop(farm, x) {
    for (const thing of farm.things) {
      if (thing.type === 'over' || thing.type === 'zone' || thing.away || (thing.kind === 'fox')) continue;
      const [from, to] = [thing.x0 - 0.9, thing.x1 + 0.9];
      if (x <= from || x >= to) continue;
      return Math.sin(Math.PI * ((x - from) / (to - from))) * (thing.type === 'water' ? 1 : thing.tall + 0.35);
    }
    return 0;
  }

  /** The fox: behind the chick, or the last of a flock, trotting or sitting, or leaping at the chick and missing. */
  drawFox(farm, friends) {
    const { ctx, unit } = this;
    const { fox, chick } = farm;
    const draw = (x, high, pose, size = 1.12) => {
      ctx.save();
      ctx.translate(this.x(x), this.y(high));
      ctx.scale(unit * size, unit * size);
      drawFox(ctx, { pose, time: this.time });
      ctx.restore();
    };
    if (this.pounce) {
      // Up, and over, and flat on his nose, as the chick goes by overhead.
      const { x, t } = this.pounce;
      if (t < 0.5) draw(x, Math.sin(Math.PI * (t / 0.5)) * 1.5, 'leap');
      else draw(x + 0.3, 0, 'flat');
      return;
    }
    if (fox.mode !== 'chase') return;
    // Behind the last of the flock, if there is one.
    const last = farm.together ? Math.min(chick.x, ...friends.map((friend) => friend.x)) : chick.x;
    const x = last - (this.foxGap ?? fox.gap) - 0.5;
    if (this.x(x) < -unit * 2) return;
    // With the chick in his paws he sits down, holding it up in front of him.
    const has = chick.state === 'caught' && chick.t > 0.5;
    const sitting = fox.sitting || has;
    draw(x, sitting ? 0 : this.foxHop(farm, x), sitting ? 'sit' : 'trot');
    if (has) return;
    // Puffing, when he's sitting after a chase.
    if (sitting && !this.reducedMotion) {
      const age = (this.time * 0.7) % 1;
      ctx.globalAlpha = 0.6 * (1 - age);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(this.x(x + 0.75 + age * 0.4), this.y(1.05 + age * 0.3), unit * (0.06 + age * 0.08), 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /** The fox on his way round, behind the hedge: only his back and his tail show over it. */
  drawDash(farm) {
    const { ctx, unit } = this;
    const { fox, chick } = farm;
    const from = chick.x - (this.foxGap ?? fox.gap) - 0.5;
    const to = (fox.thing.x0 + fox.thing.x1) / 2;
    const x = mix(from, to, ease(clamp(fox.t, 0, 1)));
    ctx.save();
    ctx.translate(this.x(x), this.ground - unit * 0.2);
    ctx.scale(unit * 0.8, unit * 0.8);
    drawFox(ctx, { pose: 'trot', time: this.time * 1.6 });
    ctx.restore();
  }

  /** A friend's chick, with their name over it. */
  drawFriend(friend) {
    const { ctx, unit } = this;
    const x = this.x(friend.x);
    // Off the screen, or in at the hen house door, there's nothing to draw.
    if (x < -unit * 2 || x > this.width + unit * 2 || friend.state === 'home') return;
    ctx.save();
    ctx.globalAlpha = 0.92;
    if (friend.carried) {
      // Their own mother hen has them.
      ctx.save();
      ctx.translate(x, this.y(friend.h));
      ctx.scale(unit * 1.25, unit * 1.25);
      drawHen(ctx, { time: this.time, flying: true });
      ctx.restore();
    }
    this.drawOneChick({ x: friend.x, h: friend.h, state: friend.state, air: friend.air, t: this.time % 1, dizzy: 0, waiting: friend.waiting }, friend.wings, friend.look, friend.carried);
    ctx.restore();
    if (!friend.name) return;
    ctx.save();
    ctx.font = `600 ${Math.round(Math.max(13, unit * 0.26))}px Fredoka, 'Noto Sans Georgian', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const wide = ctx.measureText(friend.name).width + unit * 0.3;
    const y = this.y(friend.h + 1.25);
    ctx.fillStyle = 'rgb(255 255 255 / 0.9)';
    ctx.beginPath();
    ctx.roundRect(x - wide / 2, y - unit * 0.2, wide, unit * 0.4, unit * 0.2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.fillText(friend.name, x, y + 1);
    ctx.restore();
  }

  /** The child's own chick, and the hen when she has it. */
  drawChick(farm) {
    const { chick, wings, hen } = farm;
    const { ctx, unit } = this;
    // In at the hen house door, it's out of sight.
    if (chick.state === 'home' && chick.x >= farm.end - 0.25) return;
    const open = clamp(this.openFor / 0.5, 0, 1);
    // Each wing dips for a moment as it flaps, so the flap shows even from a wing that's already up.
    const beat = (side) => clamp(wings[side].lift - Math.sin(Math.PI * clamp(this.flapFor[side] / 0.28, 0, 1)) * 0.5, 0, 1);
    const shown = { left: beat('left'), right: beat('right') };
    if (hen || chick.state === 'carried') {
      // On the hen's back.
      const arriving = hen ? clamp(hen.t / 0.16, 0, 1) : 1;
      const from = { x: chick.x + (1 - ease(arriving)) * 7, h: chick.h + (1 - ease(arriving)) * 4.5 };
      ctx.save();
      ctx.translate(this.x(from.x), this.y(Math.max(from.h, 0)));
      ctx.scale(unit * 1.25, unit * 1.25);
      drawHen(ctx, { time: this.time, flying: true });
      ctx.restore();
      this.drawOneChick({ ...chick, h: chick.h + (arriving >= 1 ? 0.62 : 0), state: arriving >= 1 ? 'sit' : 'run' }, shown, CHICK_LOOKS[0]);
      return;
    }
    if (this.henAway) {
      const { x, t } = this.henAway;
      const share = ease(clamp(t / 1.6, 0, 1));
      ctx.save();
      ctx.translate(this.x(x + share * 9), this.y(0.4 + share * 6));
      ctx.scale(unit * 1.25, unit * 1.25);
      drawHen(ctx, { time: this.time, flying: true });
      ctx.restore();
    }
    this.drawOneChick(chick, shown, CHICK_LOOKS[0], false, open);
    // A flock ahead that's waiting: nothing more to draw. Dizzy: little stars going round its head.
    if (chick.dizzy > 0 || chick.state === 'tumble') {
      ctx.fillStyle = '#ffd23f';
      for (let n = 0; n < 3; n += 1) {
        const turn = this.time * 4 + (n * TAU) / 3;
        this.star(this.x(chick.x + 0.1 + Math.cos(turn) * 0.42), this.y(chick.h + 1.02 + Math.sin(turn) * 0.1), unit * 0.09);
      }
    }
  }

  /** A chick, the child's or a friend's: running, flying, waiting, tumbling, in the water, riding or cheering. */
  drawOneChick(chick, wings, look, carried = false, open = 0) {
    const { ctx, unit } = this;
    let pose = chick.air ? 'fly' : 'run';
    let turn = 0;
    let high = chick.h;
    if (chick.state === 'tumble') {
      pose = 'tumble';
      turn = chick.t * TAU * 1.5;
    } else if (chick.state === 'splash') {
      pose = 'splash';
      turn = Math.sin(this.time * 12) * 0.15;
    } else if (chick.state === 'sit' || chick.state === 'ride' || chick.state === 'caught' || carried) {
      // Sitting on the hen, on the duck, or held up by the fox.
      pose = 'sit';
    } else if (chick.state === 'door' || chick.state === 'home') {
      pose = 'cheer';
    } else if (chick.dizzy > 0) {
      pose = 'dizzy';
    } else if (chick.waiting || chick.flockWait) {
      pose = 'wait';
    }
    if (carried) high += 0.62;
    ctx.save();
    // A soft shadow on the ground under it.
    if (chick.state !== 'splash' && pose !== 'sit') {
      ctx.fillStyle = `rgb(18 48 77 / ${(0.2 * clamp(1 - high / 5, 0.25, 1)).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(this.x(chick.x), this.ground + unit * 0.02, unit * 0.34 * clamp(1 - high / 9, 0.5, 1), unit * 0.07, 0, 0, TAU);
      ctx.fill();
    }
    ctx.translate(this.x(chick.x), this.y(high));
    ctx.scale(unit * CHICK_DRAWN, unit * CHICK_DRAWN);
    drawChick(ctx, { wings, pose, time: this.time, turn, look, open });
    ctx.restore();
  }

  /** The hen house at the end of the track, with a hen at each window, a ramp up to its door, and Giraffe beside it. */
  drawHome(farm, waving) {
    const { ctx, unit } = this;
    const at = this.x(farm.end);
    if (at > this.width + unit * 4) return;
    const cheering = this.time < this.cheerUntil;
    ctx.save();
    ctx.translate(at, this.ground);
    ctx.scale(unit, unit);
    // The house: red boards, a roof, a round door at the bottom and two little windows.
    ctx.beginPath();
    ctx.roundRect(-0.4, -2.5, 3.4, 2.5, 0.12);
    ctx.fillStyle = '#e0584c';
    ctx.fill();
    this.ink(0.06);
    ctx.strokeStyle = 'rgb(120 30 25 / 0.35)';
    ctx.lineWidth = 0.035;
    ctx.beginPath();
    for (const y of [-0.5, -1, -1.5, -2]) {
      ctx.moveTo(-0.3, y);
      ctx.lineTo(2.9, y);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-0.75, -2.42);
    ctx.lineTo(1.3, -3.6);
    ctx.lineTo(3.35, -2.42);
    ctx.closePath();
    ctx.fillStyle = '#8a5a2b';
    ctx.fill();
    this.ink(0.06);
    ctx.beginPath();
    ctx.moveTo(-0.2, 0);
    ctx.lineTo(-0.2, -0.8);
    ctx.arc(0.35, -0.8, 0.55, Math.PI, 0);
    ctx.lineTo(0.9, 0);
    ctx.closePath();
    ctx.fillStyle = '#4a2c1c';
    ctx.fill();
    this.ink(0.06);
    // A heart over the door.
    ctx.fillStyle = '#fff4e2';
    ctx.beginPath();
    ctx.moveTo(0.35, -1.62);
    ctx.bezierCurveTo(0.1, -1.92, -0.05, -1.6, 0.35, -1.42);
    ctx.bezierCurveTo(0.75, -1.6, 0.6, -1.92, 0.35, -1.62);
    ctx.fill();
    // The hens at the windows, looking out, and bobbing when the chick is home.
    for (const [x, y] of [[1.45, -1.25], [2.35, -1.25]]) {
      ctx.beginPath();
      ctx.roundRect(x - 0.32, y - 0.36, 0.64, 0.66, 0.1);
      ctx.fillStyle = '#4a2c1c';
      ctx.fill();
      this.ink(0.05);
      const bob = cheering && !this.reducedMotion ? Math.abs(Math.sin(this.time * 6 + x)) * 0.08 : 0;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - 0.3, y - 0.5, 0.6, 0.78);
      ctx.clip();
      ctx.beginPath();
      ctx.arc(x, y + 0.12 - bob, 0.22, 0, TAU);
      ctx.fillStyle = '#fffaf0';
      ctx.fill();
      this.ink(0.04);
      ctx.beginPath();
      ctx.moveTo(x - 0.1, y - 0.08 - bob);
      ctx.quadraticCurveTo(x, y - 0.26 - bob, x + 0.1, y - 0.08 - bob);
      ctx.fillStyle = '#e5484d';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - 0.24, y + 0.1 - bob);
      ctx.lineTo(x - 0.4, y + 0.16 - bob);
      ctx.lineTo(x - 0.24, y + 0.22 - bob);
      ctx.closePath();
      ctx.fillStyle = '#ffb21c';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x - 0.08, y + 0.08 - bob, 0.035, 0, TAU);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.restore();
    }
    // A straw mat at the door.
    ctx.beginPath();
    ctx.roundRect(-0.9, -0.03, 1.9, 0.16, 0.06);
    ctx.fillStyle = '#eec95c';
    ctx.fill();
    this.ink(0.04);
    ctx.restore();
    // Giraffe, beside the hen house, turned towards the chick.
    const art = this.giraffe;
    if (!art) return;
    let frame = art.frames.stand;
    if (cheering) frame = art.frames.cheer;
    else if (waving && !this.reducedMotion) frame = Math.floor(this.time * 1.4) % 2 ? art.frames.wave : art.frames.stand;
    const scale = (unit * GIRAFFE_TALL) / art.tall;
    ctx.save();
    ctx.translate(at + unit * 4.3, this.ground + unit * 0.12);
    ctx.scale(-scale, scale);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(frame, -art.foot.x, -art.foot.y);
    ctx.restore();
  }

  drawEffects() {
    const { ctx, unit } = this;
    for (const effect of this.effects) {
      const fade = clamp(effect.life / effect.total, 0, 1);
      const [x, y] = [this.x(effect.x), this.y(effect.h)];
      ctx.save();
      ctx.globalAlpha = fade;
      if (effect.kind === 'feather' || effect.kind === 'straw') {
        ctx.translate(x, y);
        ctx.rotate(effect.spin + (1 - fade) * 3);
        ctx.fillStyle = effect.kind === 'feather' ? '#fff3c4' : '#eec95c';
        ctx.beginPath();
        ctx.ellipse(0, 0, unit * 0.13, unit * 0.045, 0, 0, TAU);
        ctx.fill();
      } else if (effect.kind === 'dust') {
        ctx.fillStyle = 'rgb(214 180 130 / 0.8)';
        ctx.beginPath();
        ctx.arc(x, y, unit * (0.07 + (1 - fade) * 0.1), 0, TAU);
        ctx.fill();
      } else if (effect.kind === 'drop') {
        ctx.fillStyle = '#8fd6f2';
        ctx.beginPath();
        ctx.arc(x, y, unit * 0.06, 0, TAU);
        ctx.fill();
      } else {
        ctx.fillStyle = '#ffe066';
        for (let n = 0; n < 5; n += 1) {
          const turn = (n * TAU) / 5 + 0.3;
          const out = unit * (0.12 + (1 - fade) * 0.3);
          this.star(x + Math.cos(turn) * out, y + Math.sin(turn) * out, unit * 0.06);
        }
      }
      ctx.restore();
    }
  }

  star(x, y, r) {
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

  /** Corn on its way up to the tally, getting smaller. */
  drawFlying() {
    if (!this.flying.length) return;
    const { ctx, unit } = this;
    const to = this.cornTarget();
    for (const flight of this.flying) {
      const share = ease(Math.min(1, flight.t / CORN_FLY_SECONDS));
      ctx.save();
      ctx.translate(flight.x + (to.x - flight.x) * share, flight.y + (to.y - flight.y) * share - Math.sin(share * Math.PI) * this.height * 0.05);
      ctx.scale(unit * (1.1 - 0.5 * share), unit * (1.1 - 0.5 * share));
      drawCorn(ctx, {});
      ctx.restore();
    }
  }

  drawLabel(label) {
    const where = label.target();
    if (!where) return;
    const { ctx, unit, height: h } = this;
    const fade = clamp(Math.min((LABEL_SECONDS - label.life) / 0.3, label.life / 0.4), 0, 1);
    ctx.save();
    ctx.globalAlpha = fade;
    const size = Math.round(Math.max(15, unit * 0.34));
    ctx.font = `600 ${size}px Fredoka, 'Noto Sans Georgian', sans-serif`;
    const wide = ctx.measureText(label.text).width + size * 1.5;
    const high = size * 1.9;
    const left = clamp(this.x(where.x) - wide / 2, 8, this.width - wide - 8);
    const top = clamp(this.y(where.h) - unit * 0.7 - high, h * 0.2, h - high - 8);
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
