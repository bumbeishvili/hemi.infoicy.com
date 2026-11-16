// What Swamp Splash looks like: the swamp, the character who jumps in it, the frogs, the mud bubble, the heron and
// the clouds, and over all of it the mud on the window. The rules are in swamp.js: this draws what they say.
//
// The mud is drawn square by square, as the rules count it, so the window looks exactly as muddy as the game
// says it is. Each square is a round blob a little bigger than itself, so that they run together, and each comes
// and goes a little at a time and spreading from the middle of its splat: nothing on the screen jumps.
import { renderGiraffe, giraffePixels } from '../giraffe-garden/giraffe.js';
import { BUBBLE, GRID } from './swamp.js';

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const lerp = (from, to, share) => from + (to - from) * share;
const smooth = (share) => share * share * (3 - 2 * share);
/** A number from 0 to 1 that's always the same for the same square: for what makes each blob its own. */
const chance = (cell, salt) => {
  const value = Math.sin(cell * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
};

const INK = '#12304d';
const MUD = { fill: '#7b5230', edge: '#5c3b1f', light: '#946a40' };
const GOLD = { fill: '#e2b23a', edge: '#b3841c', light: '#f6d877' };
const SKY = ['#e3f1ea', '#d3e8c4'];
const WATER = ['#9aa862', '#74843f'];

// Where things are, as shares of the screen: x of its width and y of its height.
const PLACE = { feet: { x: 0.5, y: 0.8 }, tall: 0.34, horizon: 0.5 };
const FROG_PADS = [{ x: 0.24, y: 0.74 }, { x: 0.77, y: 0.71 }, { x: 0.33, y: 0.9 }];
const BUBBLE_AT = { x: 0.64, y: 0.86 };
// The rain cloud's way along the top: it starts clear of the mud meter and the golden stars, at the top left, and
// ends clear of the gear, at the top right.
const RAIN_CLOUD = { from: 0.44, to: 0.85, y: 0.085 };

const MUD_SECONDS = 0.45; // A square of mud comes, or goes, over this long,
const SPREAD = 0.045; // and this much later for each square further from the middle of its splat.
const JUMP_TALL = 0.3; // How high the character goes for the biggest jump, as a share of the screen's height.
// Several playing in front of one camera stand side by side, this far apart across the screen, a little smaller
// when there are three or four of them.
// On the title and the chooser they stand closer together, between the cards at either side.
const GROUP = { apart: [0, 0.24, 0.2, 0.17], close: [0, 0.16, 0.115, 0.085], size: [1, 1, 0.88, 0.78] };

export class SwampView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.time = 0;
    this.arts = [null]; // Each character's pictures, if they could be drawn: one, or one for each of several jumpers.
    this.view = 'title';
    this.swamp = null;
    this.way = RAIN_CLOUD; // Where the rain cloud's way runs, for the tests to find it by.
    // What each square of the window shows: how much of its mud is there, what it's going to, and how long it waits.
    this.shown = new Float32Array(GRID.wide * GRID.high);
    // And how much of its gold is there: gold lies over the mud, and comes and goes a little at a time as mud does.
    this.gold = new Float32Array(GRID.wide * GRID.high);
    this.wait = new Float32Array(GRID.wide * GRID.high);
    this.clear();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** Nothing left over from the last game. */
  clear() {
    this.shown.fill(0);
    this.gold.fill(0);
    this.wait.fill(0);
    this.drops = [];
    this.effects = [];
    // What each jumper's body is doing: how high off the floor, how far the knees are bent, and how flat from a landing.
    this.bodies = this.arts.map(() => ({ jump: 0, crouch: 0, squash: 0 }));
    this.frogHops = FROG_PADS.map(() => 0);
    this.bubble = { size: 0, popping: 0 };
    this.heron = null;
    this.shower = null;
    this.raining = 0;
    this.cheering = 0;
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.ratio);
    this.canvas.height = Math.round(this.height * this.ratio);
    this.back = null;
  }

  /** The character who jumps: one of the roster (core/body/roster.js). */
  setWalker(spec) {
    this.setWalkers([spec]);
  }

  /** The characters who jump, side by side, when several play in front of one camera: each one of the roster. */
  setWalkers(specs) {
    const tallest = Math.max(window.innerHeight, window.screen?.height || 0);
    this.arts = specs.map((spec) => {
      try {
        return renderGiraffe(spec, giraffePixels(tallest * PLACE.tall, this.ratio));
      } catch (error) {
        // Without its picture the game still works: the mud flies all the same.
        console.warn('Could not draw the character:', error);
        return null;
      }
    });
    this.bodies = this.arts.map((_, index) => this.bodies[index] ?? { jump: 0, crouch: 0, squash: 0 });
  }

  /** The one character's pictures, or the first of several. */
  get art() {
    return this.arts[0];
  }

  /** How high off the floor the one jumper is, or the first of several, and how far their knees are bent. */
  get jump() {
    return this.bodies[0].jump;
  }

  get crouch() {
    return this.bodies[0].crouch;
  }

  /** Where a jumper's feet are, as shares of the screen: in the middle for one, and side by side for several. */
  feetOf(index) {
    const count = this.arts.length;
    const spread = this.view === 'title' || this.view === 'choose' ? GROUP.close : GROUP.apart;
    const apart = spread[count - 1] ?? spread.at(-1);
    return { x: PLACE.feet.x + (index - (count - 1) / 2) * apart, y: PLACE.feet.y };
  }

  /** 'title', 'choose', 'play' or 'finish': where the game is, for how the character stands. */
  setView(name) {
    this.view = name;
  }

  /** A new game: its rules, and a clean window. */
  setSwamp(swamp) {
    this.swamp = swamp;
    this.clear();
  }

  /**
   * How high a child is off the floor right now, and how far their knees are bent, each from 0 to 1. index is
   * which of the jumpers, when several play in front of one camera.
   */
  setBody({ jump = 0, crouch = 0 } = {}, index = 0) {
    const body = this.bodies[index];
    if (!body) return;
    body.jump = clamp(jump, 0, 1);
    body.crouch = clamp(crouch, 0, 1);
  }

  at(x, y) {
    return { x: x * this.width, y: y * this.height };
  }

  /** What the rules say happened: see swamp.js. */
  on(event) {
    const { width: w, height: h } = this;
    switch (event.type) {
      case 'land': {
        // Mud flies up from the feet of whoever landed: more of it, and further, for a bigger jump.
        const lander = this.bodies[event.by ?? 0] ?? this.bodies[0];
        lander.squash = 1;
        const feet = this.feetOf(this.bodies.indexOf(lander));
        const count = Math.round(8 + Math.min(3, event.size) * 9);
        for (let n = 0; n < count; n += 1) {
          const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.3;
          const speed = h * (0.5 + Math.random() * 0.5) * Math.min(1.6, 0.6 + event.size * 0.4);
          this.drops.push({ x: w * feet.x, y: h * feet.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: h * (0.006 + Math.random() * 0.012), age: 0, life: 0.75 });
        }
        break;
      }
      case 'splat':
        this.spread(event);
        break;
      case 'clean':
        for (const cell of event.cells) this.wait[cell] = event.why === 'rain' ? chance(cell, 3) * 0.9 : event.why === 'shower' ? (Math.floor(cell / GRID.wide) / GRID.high) * 0.6 : chance(cell, 5) * 0.25;
        break;
      case 'frog':
        this.frogHops[event.frog % FROG_PADS.length] = 1;
        break;
      case 'bubble':
        this.bubble = { size: 0, popping: 0 };
        break;
      case 'pop':
        this.bubble.popping = 1;
        break;
      case 'heron':
        // It comes in from the nearer side.
        this.heron = { to: { x: event.x, y: event.y }, from: { x: event.x < 0.5 ? -0.12 : 1.12, y: 0.12 }, age: 0, takes: event.seconds, leaving: null };
        break;
      case 'wiped':
      case 'scared':
        if (this.heron) this.heron.leaving = { age: 0, scared: event.type === 'scared' };
        break;
      case 'shower-coming':
        this.shower = { x: event.from + event.wide / 2, wide: event.wide, age: 0, raining: 0 };
        break;
      case 'shower':
        if (this.shower) this.shower.raining = 1;
        break;
      case 'star':
        for (let n = 0; n < 7; n += 1) this.effects.push({ x: w * (0.3 + Math.random() * 0.4), y: h * (0.25 + Math.random() * 0.4), age: -n * 0.06, life: 0.8 });
        break;
      case 'won':
        this.cheering = 1;
        break;
      case 'lost':
        this.raining = 1;
        break;
      default:
    }
  }

  /** A splat's squares come one after another, from its middle outwards. */
  spread({ x, y, cells, golden }) {
    for (const cell of cells) {
      const [cx, cy] = [(cell % GRID.wide) + 0.5, Math.floor(cell / GRID.wide) + 0.5];
      const far = Math.hypot(cx - x * GRID.wide, cy - y * GRID.high);
      // Gold spreads over mud that's there already, as mud spreads over a clean window.
      if (golden || this.shown[cell] < 0.05) this.wait[cell] = far * SPREAD;
    }
  }

  update(dt) {
    this.time += dt;
    const { swamp } = this;
    const still = this.reducedMotion;
    // Each square goes to what the rules say it is, a little at a time, after its wait.
    if (swamp) {
      const step = Math.min(dt, 1 / 30) / MUD_SECONDS;
      for (let cell = 0; cell < this.shown.length; cell += 1) {
        const want = swamp.mud[cell] ? 1 : 0;
        const wantGold = swamp.mud[cell] === 2 ? 1 : 0;
        if (this.shown[cell] === want && this.gold[cell] === wantGold) continue;
        if (this.wait[cell] > 0 && !still) {
          this.wait[cell] -= dt;
          continue;
        }
        const towards = (now, wanted) => (still ? wanted : clamp(now + (wanted > now ? step : -step), 0, 1));
        this.shown[cell] = towards(this.shown[cell], want);
        // Washed gold goes as its mud goes, still gold, and never turns brown first.
        this.gold[cell] = towards(this.gold[cell], wantGold);
      }
      // The mud bubble grows as the rules' one does.
      const age = swamp.bubble?.age;
      const wanted = age === null || age === undefined ? 0 : Math.min(1, age / BUBBLE.grows);
      this.bubble.size += (wanted - this.bubble.size) * (1 - Math.exp(-dt * 8));
    }
    this.bubble.popping = Math.max(0, this.bubble.popping - dt / 0.4);
    for (const body of this.bodies) body.squash = Math.max(0, body.squash - dt / 0.28);
    this.frogHops = this.frogHops.map((hop) => Math.max(0, hop - dt / 0.7));
    this.cheering = Math.max(0, this.cheering - dt / 4);
    this.raining = Math.max(0, this.raining - dt / 2.2);
    for (const drop of this.drops) {
      drop.age += dt;
      drop.vy += this.height * 2.4 * dt;
      drop.x += drop.vx * dt;
      drop.y += drop.vy * dt;
    }
    this.drops = this.drops.filter((drop) => drop.age < drop.life);
    for (const effect of this.effects) effect.age += dt;
    this.effects = this.effects.filter((effect) => effect.age < effect.life);
    if (this.heron) {
      this.heron.age += dt;
      if (this.heron.leaving) {
        this.heron.leaving.age += dt;
        if (this.heron.leaving.age > 1.4) this.heron = null;
      }
    }
    if (this.shower) {
      this.shower.age += dt;
      if (this.shower.raining > 0) {
        this.shower.raining -= dt / 1.3;
        if (this.shower.raining <= 0) this.shower = null;
      }
    }
  }

  /* ---------- drawing ---------- */

  render() {
    const { ctx, ratio } = this;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.drawSwamp();
    this.drawFrogs();
    this.drawBubble();
    this.arts.forEach((_, index) => this.drawWalker(index));
    this.drawDrops();
    this.drawMud();
    this.drawShower();
    this.drawHeron();
    this.drawRainCloud();
    this.drawStars();
  }

  /** The swamp itself, which never changes, drawn once and kept. */
  drawSwamp() {
    const { ctx, width: w, height: h, ratio } = this;
    if (!this.back) {
      this.back = document.createElement('canvas');
      this.back.width = this.canvas.width;
      this.back.height = this.canvas.height;
      const back = this.back.getContext('2d', { alpha: false });
      back.setTransform(ratio, 0, 0, ratio, 0, 0);
      const sky = back.createLinearGradient(0, 0, 0, h * PLACE.horizon);
      sky.addColorStop(0, SKY[0]);
      sky.addColorStop(1, SKY[1]);
      back.fillStyle = sky;
      back.fillRect(0, 0, w, h);
      // Trees a long way off, and nearer ones at the sides.
      back.fillStyle = '#a9c79a';
      for (let n = 0; n < 14; n += 1) {
        back.beginPath();
        back.ellipse(w * (n / 13), h * (PLACE.horizon - 0.02), w * 0.07, h * (0.08 + chance(n, 1) * 0.07), 0, 0, Math.PI * 2);
        back.fill();
      }
      back.fillStyle = '#7fae7a';
      for (const [x, tall] of [[0.04, 0.3], [0.13, 0.22], [0.9, 0.26], [0.985, 0.32]]) {
        back.beginPath();
        back.ellipse(w * x, h * (PLACE.horizon - tall * 0.35), w * 0.075, h * tall * 0.6, 0, 0, Math.PI * 2);
        back.fill();
      }
      // The water, with mud in it.
      const water = back.createLinearGradient(0, h * PLACE.horizon, 0, h);
      water.addColorStop(0, WATER[0]);
      water.addColorStop(1, WATER[1]);
      back.fillStyle = water;
      back.fillRect(0, h * PLACE.horizon, w, h * (1 - PLACE.horizon));
      back.fillStyle = 'rgb(123 82 48 / 0.55)';
      for (const [x, y, rx, ry] of [[0.5, 0.82, 0.2, 0.075], [0.16, 0.68, 0.1, 0.03], [0.84, 0.8, 0.11, 0.04], [0.66, 0.62, 0.08, 0.02], [0.3, 0.6, 0.07, 0.018]]) {
        back.beginPath();
        back.ellipse(w * x, h * y, w * rx, h * ry, 0, 0, Math.PI * 2);
        back.fill();
      }
      // Lily pads, for the frogs and for nobody.
      for (const [index, pad] of [...FROG_PADS, { x: 0.58, y: 0.63 }, { x: 0.9, y: 0.92 }, { x: 0.1, y: 0.86 }].entries()) {
        back.fillStyle = index % 2 ? '#62b060' : '#70bd6a';
        back.strokeStyle = '#3d8347';
        back.lineWidth = Math.max(1.5, h * 0.003);
        back.beginPath();
        back.ellipse(w * pad.x, h * (pad.y + 0.012), h * 0.07, h * 0.022, 0, 0.25, Math.PI * 2 - 0.15);
        back.lineTo(w * pad.x, h * (pad.y + 0.012));
        back.closePath();
        back.fill();
        back.stroke();
      }
      // Reeds at the sides.
      back.lineCap = 'round';
      for (const [x, tall] of [[0.03, 0.3], [0.06, 0.24], [0.09, 0.33], [0.93, 0.27], [0.96, 0.34], [0.985, 0.22]]) {
        back.strokeStyle = '#4f8a4a';
        back.lineWidth = Math.max(3, h * 0.008);
        back.beginPath();
        back.moveTo(w * x, h);
        back.lineTo(w * (x + 0.006), h * (1 - tall));
        back.stroke();
        back.strokeStyle = '#6b4a2b';
        back.lineWidth = Math.max(6, h * 0.02);
        back.beginPath();
        back.moveTo(w * (x + 0.006), h * (1 - tall));
        back.lineTo(w * (x + 0.007), h * (1 - tall - 0.05));
        back.stroke();
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.back, 0, 0);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  drawFrogs() {
    const { ctx, height: h, swamp } = this;
    const count = swamp?.rules.frogs ?? 0;
    for (let n = 0; n < count; n += 1) {
      const pad = this.at(FROG_PADS[n % FROG_PADS.length].x, FROG_PADS[n % FROG_PADS.length].y);
      const hop = this.frogHops[n % FROG_PADS.length];
      const up = Math.sin((1 - hop) * Math.PI) * (hop > 0 ? h * 0.13 : 0);
      const r = h * 0.03;
      ctx.save();
      ctx.translate(pad.x, pad.y - up);
      ctx.fillStyle = '#3fa34d';
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(1.5, h * 0.003);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.25, r * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      for (const side of [-1, 1]) {
        ctx.fillStyle = '#3fa34d';
        ctx.beginPath();
        ctx.arc(side * r * 0.6, -r * 0.75, r * 0.38, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(side * r * 0.6, -r * 0.8, r * 0.22, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(side * r * 0.6, -r * 0.8, r * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /** The mud bubble: a dome that swells out of the swamp, shines when it's big enough to land on, and bursts. */
  drawBubble() {
    const { ctx, height: h, bubble } = this;
    if (bubble.size < 0.03 && bubble.popping <= 0) return;
    const at = this.at(BUBBLE_AT.x, BUBBLE_AT.y);
    const big = bubble.size > 0.98;
    const r = h * 0.055 * bubble.size * (big && !this.reducedMotion ? 1 + Math.sin(this.time * 4) * 0.05 : 1);
    if (bubble.popping > 0) {
      // A ring of drops going out.
      ctx.fillStyle = MUD.fill;
      for (let n = 0; n < 10; n += 1) {
        const angle = (n / 10) * Math.PI * 2;
        const far = h * 0.06 + (1 - bubble.popping) * h * 0.09;
        ctx.globalAlpha = bubble.popping;
        ctx.beginPath();
        ctx.arc(at.x + Math.cos(angle) * far, at.y - h * 0.02 + Math.sin(angle) * far * 0.6, h * 0.009, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      return;
    }
    ctx.fillStyle = MUD.fill;
    ctx.strokeStyle = big ? '#ffd23f' : MUD.edge;
    ctx.lineWidth = Math.max(2, h * (big ? 0.008 : 0.004));
    ctx.beginPath();
    ctx.ellipse(at.x, at.y, r * 1.25, r, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgb(255 255 255 / 0.55)';
    ctx.beginPath();
    ctx.ellipse(at.x - r * 0.45, at.y - r * 0.55, r * 0.22, r * 0.12, -0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  /** The character: standing, down with bent knees, up in the air with its arms up, or flat for a moment as it lands. */
  drawWalker(index = 0) {
    const { ctx, width: w, height: h } = this;
    const art = this.arts[index];
    const body = this.bodies[index];
    const place = this.feetOf(index);
    const feet = this.at(place.x, place.y);
    const size = GROUP.size[this.arts.length - 1] ?? GROUP.size.at(-1);
    const up = body.jump * h * JUMP_TALL;
    // Its shadow on the mud, smaller the higher it is.
    ctx.fillStyle = 'rgb(18 48 77 / 0.2)';
    ctx.beginPath();
    ctx.ellipse(feet.x, feet.y + h * 0.008, w * 0.06 * size * (1 - body.jump * 0.5), h * 0.016 * size * (1 - body.jump * 0.5), 0, 0, Math.PI * 2);
    ctx.fill();
    if (!art) return;
    const cheering = this.cheering > 0 || this.view === 'finish';
    const waving = this.view === 'title' || this.view === 'choose';
    let frame = art.frames.stand;
    if (body.jump > 0.08 || cheering) frame = art.frames.cheer;
    else if (waving && !this.reducedMotion && Math.floor(this.time * 1.4) % 2) frame = art.frames.wave;
    // Bent knees are the whole of it a little shorter and wider, and a landing is the same for a moment.
    const flat = Math.max(body.crouch * 0.22, smooth(body.squash) * 0.2);
    // Cheering, several bob up and down one after another, not all at once.
    const bounce = cheering && !this.reducedMotion ? Math.abs(Math.sin(this.time * 5 + index * 0.9)) * h * 0.03 : 0;
    const scale = ((h * PLACE.tall) / art.tall) * size;
    ctx.save();
    ctx.translate(feet.x, feet.y - up - bounce);
    ctx.scale(scale * (1 + flat * 0.6), scale * (1 - flat));
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(frame, -art.foot.x, -art.foot.y);
    ctx.restore();
  }

  drawDrops() {
    const { ctx } = this;
    ctx.fillStyle = MUD.fill;
    for (const drop of this.drops) {
      ctx.globalAlpha = 1 - drop.age / drop.life;
      ctx.beginPath();
      ctx.arc(drop.x, drop.y, drop.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** The mud on the window: every square that has any, as a blob, with its dark edge first and its colour over it. */
  drawMud() {
    const { ctx, width: w, height: h, shown } = this;
    const [cw, ch] = [w / GRID.wide, h / GRID.high];
    const { gold } = this;
    // How much of a square's blob there is: all its mud for the brown, and for the gold, as much as has come.
    const amount = (cell, golden) => (golden ? Math.min(shown[cell], gold[cell]) : shown[cell]);
    const blob = (cell, grow, golden) => {
      const share = amount(cell, golden);
      const size = Math.sqrt(share) * (0.76 + chance(cell, 1) * 0.18) * grow;
      const x = ((cell % GRID.wide) + 0.5 + (chance(cell, 2) - 0.5) * 0.3) * cw;
      const y = (Math.floor(cell / GRID.wide) + 0.5 + (chance(cell, 4) - 0.5) * 0.3) * ch;
      ctx.moveTo(x + cw * size, y);
      ctx.ellipse(x, y, cw * size, ch * size, 0, 0, Math.PI * 2);
    };
    for (const golden of [0, 1]) {
      const look = golden ? GOLD : MUD;
      for (const [colour, grow] of [[look.edge, 1.09], [look.fill, 1]]) {
        ctx.fillStyle = colour;
        ctx.beginPath();
        let any = false;
        for (let cell = 0; cell < shown.length; cell += 1) {
          if (amount(cell, golden) <= 0.01) continue;
          blob(cell, grow, golden);
          any = true;
        }
        if (any) ctx.fill();
      }
      // Wet shine on some of it.
      ctx.fillStyle = look.light;
      ctx.beginPath();
      for (let cell = 0; cell < shown.length; cell += 1) {
        // The shine is the gold's where the square is golden, and the mud's where it isn't.
        const share = amount(cell, golden);
        if (share < 0.6 || (!golden && gold[cell] > 0.5) || chance(cell, 7) > 0.3) continue;
        const x = ((cell % GRID.wide) + 0.3 + chance(cell, 8) * 0.4) * cw;
        const y = (Math.floor(cell / GRID.wide) + 0.3 + chance(cell, 9) * 0.4) * ch;
        ctx.moveTo(x + cw * 0.16, y);
        ctx.ellipse(x, y, cw * 0.16 * share, ch * 0.09 * share, -0.5, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }

  /** A cloud, soft and grey, with its middle at a place. */
  cloudShape(x, y, size, colour) {
    const { ctx, height: h } = this;
    ctx.fillStyle = colour;
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, h * 0.004);
    ctx.beginPath();
    for (const [dx, dy, r] of [[-0.9, 0.15, 0.62], [0, -0.22, 0.85], [0.95, 0.12, 0.66], [0.1, 0.3, 0.7]]) {
      ctx.moveTo(x + (dx + r) * size, y + dy * size);
      ctx.arc(x + dx * size, y + dy * size, r * size, 0, Math.PI * 2);
    }
    ctx.stroke();
    ctx.fill();
  }

  /** A shower: a little cloud over one strip of the window, and then rain down it. */
  drawShower() {
    const { ctx, width: w, height: h, shower } = this;
    if (!shower) return;
    const come = smooth(clamp(shower.age / 0.8, 0, 1));
    const x = w * shower.x;
    const y = lerp(-h * 0.1, h * 0.19, come);
    if (shower.raining > 0) {
      ctx.strokeStyle = `rgb(120 170 220 / ${0.7 * Math.min(1, shower.raining * 2)})`;
      ctx.lineWidth = Math.max(2, h * 0.004);
      ctx.lineCap = 'round';
      const fall = (1 - shower.raining) * h * 1.6;
      for (let n = 0; n < 22; n += 1) {
        const sx = x + (chance(n, 11) - 0.5) * w * shower.wide;
        const sy = ((chance(n, 12) * h + fall) % (h * 0.8)) + h * 0.2;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - h * 0.006, sy + h * 0.04);
        ctx.stroke();
      }
    }
    this.cloudShape(x, y, h * 0.05, '#dfe6ee');
  }

  /** The heron, on the window: it flies in to a muddy place, wipes it with a wing, and goes; or is scared off. */
  drawHeron() {
    const { ctx, height: h, heron } = this;
    if (!heron) return;
    const coming = smooth(clamp(heron.age / heron.takes, 0, 1));
    let x = lerp(heron.from.x, heron.to.x, coming);
    let y = lerp(heron.from.y, heron.to.y - 0.06, coming);
    if (heron.leaving) {
      const gone = smooth(clamp(heron.leaving.age / (heron.leaving.scared ? 0.9 : 1.4), 0, 1));
      x = lerp(x, heron.from.x, gone);
      y = lerp(y, -0.2, gone);
    }
    const at = this.at(x, y);
    const facing = heron.from.x < 0.5 ? 1 : -1;
    const flap = this.reducedMotion ? 0.3 : Math.sin(this.time * 9) * 0.5;
    const size = h * 0.06;
    ctx.save();
    ctx.translate(at.x, at.y);
    ctx.scale(facing, 1);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, h * 0.004);
    // Legs trailing, body, wing, neck, head and beak.
    ctx.beginPath();
    ctx.moveTo(-size * 0.5, size * 0.2);
    ctx.lineTo(-size * 1.6, size * 0.5);
    ctx.stroke();
    ctx.fillStyle = '#f4f6f8';
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.95, size * 0.5, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#c9d3dd';
    ctx.beginPath();
    ctx.moveTo(-size * 0.5, -size * 0.1);
    ctx.quadraticCurveTo(-size * 0.1, -size * (1.2 + flap), size * 0.5, -size * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(size * 0.75, -size * 0.15);
    ctx.quadraticCurveTo(size * 1.25, -size * 0.2, size * 1.2, -size * 0.75);
    ctx.stroke();
    ctx.fillStyle = '#f4f6f8';
    ctx.beginPath();
    ctx.arc(size * 1.22, -size * 0.85, size * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffb703';
    ctx.beginPath();
    ctx.moveTo(size * 1.42, -size * 0.92);
    ctx.lineTo(size * 2.1, -size * 0.8);
    ctx.lineTo(size * 1.42, -size * 0.72);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(size * 1.28, -size * 0.9, size * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** The rain cloud that's coming across the top of the window, and, when it's here, its rain. */
  drawRainCloud() {
    const { ctx, width: w, height: h, swamp } = this;
    if (!swamp || !Number.isFinite(swamp.rules.seconds) || !['play', 'finish'].includes(this.view)) return;
    const y = h * RAIN_CLOUD.y;
    // The way it has to come: a line, with where it's going at the end of it.
    ctx.strokeStyle = 'rgb(18 48 77 / 0.3)';
    ctx.lineWidth = Math.max(2, h * 0.004);
    ctx.setLineDash([h * 0.012, h * 0.012]);
    ctx.beginPath();
    ctx.moveTo(w * RAIN_CLOUD.from, y);
    ctx.lineTo(w * RAIN_CLOUD.to, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = INK;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(w * RAIN_CLOUD.to, y - h * 0.03);
    ctx.lineTo(w * RAIN_CLOUD.to, y + h * 0.03);
    ctx.stroke();
    // It goes away when the window is muddy enough.
    const gone = swamp.state === 'won' ? smooth(clamp(1 - this.cheering, 0, 1)) : 0;
    const x = w * lerp(RAIN_CLOUD.from, RAIN_CLOUD.to, swamp.cloud);
    // Up and off the top of the window, whole: a cloud that faded would show the rounds it's made of.
    if (gone < 1) this.cloudShape(x, y - gone * h * 0.3, h * 0.045, '#b8c4d2');
    if (this.raining > 0) {
      ctx.strokeStyle = `rgb(120 170 220 / ${0.6 * Math.min(1, this.raining * 2)})`;
      ctx.lineWidth = Math.max(2, h * 0.004);
      const fall = (1 - this.raining) * h * 2.2;
      for (let n = 0; n < 70; n += 1) {
        const sx = chance(n, 13) * w;
        const sy = (chance(n, 14) * h + fall) % h;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - h * 0.006, sy + h * 0.04);
        ctx.stroke();
      }
    }
  }

  /** Small stars for golden mud. */
  drawStars() {
    const { ctx, height: h } = this;
    for (const effect of this.effects) {
      if (effect.age < 0) continue;
      const share = effect.age / effect.life;
      const r = h * 0.03 * (0.4 + share);
      ctx.globalAlpha = 1 - share;
      ctx.fillStyle = '#ffe066';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let n = 0; n < 10; n += 1) {
        const reach = n % 2 ? r * 0.45 : r;
        const angle = (n * Math.PI) / 5 - Math.PI / 2;
        ctx.lineTo(effect.x + Math.cos(angle) * reach, effect.y + Math.sin(angle) * reach);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
