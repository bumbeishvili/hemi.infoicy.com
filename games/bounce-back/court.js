// Bounce Back's court, drawn in 2D: a sunny court by the sea, seen from the side, with the net in the middle.
// The far side of the court is drawn a little up and to the right, so the court has some depth. The ball
// goes along the middle of it, with its shadow on the court below it.
//
// Each player is their character from the other games, standing on their half, with a long cartoon arm
// up to their glove, which is the racket: an open hand shows a racket with strings round the glove, and a
// hand that isn't open shows only a dashed ring, which can't hit anything. The child's own glove copies their
// hand finger by finger, as in Balloon Pop. Characters run along under their gloves.
//
// The court is turned round so the child's own half is on the side of the hand they play with: flip is 1
// when side A is on the left, and -1 when it's on the right. Nothing flashes: a hit is a small burst, and
// a bounce a little puff, and things that come and go fade or grow.
import { Glove, INK } from '../../core/glove.js';
import { clamp, COURT, EXTRAS, LABELS, signOf } from './rules.js';
import { OPEN_HAND, RUN_FRAMES } from './players.js';

const GROUND = 0.82; // Where the ball bounces, as a share of the screen's height.
const HEADROOM = 1.25; // Court units that always fit above that.
const ACROSS = 0.43; // At most this share of the screen's width for each half of the court.
const DEPTH = { dx: 0.1, dy: 0.24 }; // How far the far side of the court is drawn from the near side: right, and up.
const FEET = 0.42; // Where players stand, a little in front of the ball's line, from the near side.
export const PALM_UNITS = 0.13; // A glove's palm length, in court units.
const CHARACTER = 0.2; // Court units for each unit of a character's own size.
const BODY = 2.05; // About how tall a character is without a long neck, in its own units.
const RUN_SPEED = 1.5; // How fast a character runs after its glove, in court units a second.
const STRIDE = 0.075; // How far a character runs for each picture of its run.
const BEHIND = 0.3; // How far behind its glove a character stands, towards its own end, so the glove is out in front.
const MOODS = { hit: 0.35, cheer: 1.4, oops: 1.0 };
const RING_RATE = 3; // How quickly a racket's strings come and go as a hand opens and closes, every second.
const STAY_WITHIN = 0.14; // A character stays put while its glove moves less than this, in court units.
const CARRY_RATE = 9; // How quickly a ball that has been put somewhere else glides there.
const TRAIL_EVERY = 0.045;
const LABEL_SECONDS = 2.2;
const PRIZE_FLY_SECONDS = 0.75;
const RAINBOW = ['#ff5a4f', '#ff9a3c', '#ffd23f', '#27c96b', '#3b82f6', '#a855f7'];
const BEACH = ['#ff5a4f', '#ffffff', '#3b82f6', '#ffd23f', '#ffffff', '#27c96b'];
const GOLD = ['#ffd23f', '#f2b728', '#ffe27a', '#e9a81c', '#ffd23f', '#f7c948'];
const FRAMES = { mine: '#2a78d6', computer: '#ff6f61', remote: '#8f6cf0' };
const PRIZE_MARKS = { star: '⭐', shell: '🐚', trophy: '🏆', gem: '💎' };

const ease = (share) => share * share * (3 - 2 * share);

/** A small picture, such as a prize, drawn once from an emoji. */
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

/** A soap bubble, see-through with a soft edge, for a power-up to float in. */
function makeBubble() {
  const canvas = document.createElement('canvas');
  canvas.width = 240;
  canvas.height = 240;
  const ctx = canvas.getContext('2d');
  const body = ctx.createRadialGradient(120, 120, 60, 120, 120, 116);
  body.addColorStop(0, 'rgb(220 245 255 / 0.18)');
  body.addColorStop(0.8, 'rgb(190 225 255 / 0.32)');
  body.addColorStop(0.93, 'rgb(255 200 240 / 0.55)');
  body.addColorStop(1, 'rgb(255 255 255 / 0)');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(120, 120, 116, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgb(255 255 255 / 0.8)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(120, 120, 108, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgb(255 255 255 / 0.75)';
  ctx.beginPath();
  ctx.ellipse(78, 72, 22, 12, -0.7, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

function makeCloud() {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 170;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  for (const [x, y, r] of [[70, 92, 42], [130, 66, 56], [196, 76, 48], [250, 98, 34], [160, 104, 50]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}

/** The ball's panels, drawn round from the middle, to be turned as the ball spins. */
function makePanels(colours, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  colours.forEach((colour, index) => {
    const from = (index / colours.length) * Math.PI * 2;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.arc(c, c, c, from, from + (Math.PI * 2) / colours.length + 0.01);
    ctx.closePath();
    ctx.fill();
  });
  // The little cap in the middle.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(c, c, size * 0.08, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

/** Light from above on the left and shade below on the right, which stay put as the ball turns. */
function makeShading(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  const shade = ctx.createRadialGradient(c * 0.7, c * 0.62, size * 0.05, c, c, c);
  shade.addColorStop(0, 'rgb(255 255 255 / 0.55)');
  shade.addColorStop(0.45, 'rgb(255 255 255 / 0)');
  shade.addColorStop(0.8, 'rgb(18 48 77 / 0.12)');
  shade.addColorStop(1, 'rgb(18 48 77 / 0.32)');
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.arc(c, c, c, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgb(255 255 255 / 0.7)';
  ctx.beginPath();
  ctx.ellipse(c * 0.66, c * 0.52, size * 0.12, size * 0.07, -0.6, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

export class Court {
  /** language() says which language a new thing's label is in, and prizeTarget() where the prize tally is on the screen. */
  constructor(canvas, { language = () => 'en', prizeTarget = () => ({ x: 80, y: 40 }) } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.language = language;
    this.prizeTarget = prizeTarget;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.flip = 1;
    this.level = 1;
    this.time = 0;
    this.players = { A: null, B: null };
    this.myGlove = null;
    this.ball = null;
    this.shown = { u: 0, h: 0.5, carryU: 0, carryH: 0, alpha: 0, spin: 0, lastU: null, lastH: null, stroke: -1 };
    this.trail = [];
    this.trailIn = 0;
    this.effects = [];
    this.flying = [];
    this.labels = [];
    this.introduced = new Set();
    this.wanted = new Map();
    this.items = [];
    this.castles = [];
    this.castleLooks = new Map();
    this.flags = { count: 0, lit: 0, shown: [] };
    this.power = null;
    this.wind = 0;
    this.rally = 0;
    this.rallyShown = 0;
    this.breeze = false;
    this.bird = null;
    this.marks = Object.fromEntries([...Object.entries(PRIZE_MARKS), ['big', '🎾'], ['bird', '🐦']].map(([key, mark]) => [key, makeMark(mark)]));
    this.bubble = makeBubble();
    this.cloud = makeCloud();
    this.panels = { beach: makePanels(BEACH), rainbow: makePanels(RAINBOW), golden: makePanels(GOLD) };
    this.shading = makeShading();
    this.clouds = Array.from({ length: 6 }, (_, index) => ({
      at: index / 6 + Math.random() * 0.1,
      y: 0.04 + Math.random() * 0.22,
      size: 0.32 + Math.random() * 0.5,
      drift: 0.004 + Math.random() * 0.005,
    }));
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /* ---------- where things are on the screen ---------- */

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.ratio);
    this.canvas.height = Math.round(this.height * this.ratio);
    this.groundY = this.height * GROUND;
    this.scale = Math.min(this.width * ACROSS, this.groundY / HEADROOM);
    this.cx = this.width / 2;
    this.palmSize = Math.max(34, PALM_UNITS * this.scale);
    this.paintBackdrop();
  }

  /** Where a place on the court is on the screen: along it, how high, and how far back, from 0 at the near side to 1 at the far side. */
  at(u, h = 0, depth = 0.5) {
    const { scale: s } = this;
    return {
      x: this.cx + this.flip * u * s + (depth - 0.5) * DEPTH.dx * s,
      y: this.groundY - h * s - (depth - 0.5) * DEPTH.dy * s,
    };
  }

  /** Where a point on the screen is on the ball's line: { u, h }. */
  fromScreen(x, y) {
    return { u: (x - this.cx) / (this.flip * this.scale), h: (this.groundY - y) / this.scale };
  }

  setFlip(flip) {
    if (flip === this.flip) return;
    this.flip = flip;
    this.trail = [];
  }

  /** The level's things that stand on the court: the flags' poles and the windsock. */
  setLevel(level, { flags = 0, breeze = false } = {}) {
    this.level = level;
    this.flags = { count: flags, lit: 0, shown: Array.from({ length: flags }, () => 0) };
    this.breeze = breeze;
    this.paintBackdrop();
  }

  /**
   * Who's playing: for each side, { spec, art, kind, name, mine }, where art is what renderPlayers made for
   * the character, kind is child, computer or remote, and mine says it's the child at this computer.
   */
  setPlayers(players) {
    for (const side of ['A', 'B']) {
      const given = players[side];
      const glove = given.mine && this.myGlove ? this.myGlove : new Glove(signOf(side) * this.flip > 0 ? 'right' : 'left');
      this.players[side] = {
        ...given,
        glove,
        u: signOf(side) * 0.7,
        hop: 0,
        stride: 0,
        moving: 0,
        mood: null,
        moodLeft: 0,
        ring: 0,
        racket: { u: signOf(side) * 0.6, h: 0.45, visible: false, open: false, radius: 0.17 },
        points: null,
        // The computer's name shows over it for the first moments of a game.
        nameFor: given.kind === 'computer' ? 3.5 : 0,
      };
    }
  }

  /** A new game: nothing left over from the last one. */
  reset() {
    this.effects = [];
    this.flying = [];
    this.labels = [];
    this.trail = [];
    this.introduced = new Set();
    this.wanted = new Map();
    this.items = [];
    this.castles = [];
    this.castleLooks = new Map();
    this.power = null;
    this.bird = null;
    this.rally = 0;
    this.rallyShown = 0;
    this.shown.alpha = 0;
    this.shown.stroke = -1;
    this.flags.lit = 0;
    this.flags.shown = this.flags.shown.map(() => 0);
  }

  /* ---------- each frame ---------- */

  /**
   * One frame. model is what's happening now: { ball, rackets: { A, B }, items, power, castles, flagsLit,
   * wind, rally }, each as rally.js keeps them, and points, a friend's glove's points by side, if any.
   */
  update(dt, model) {
    this.time += dt;
    if (!this.reducedMotion) for (const cloud of this.clouds) cloud.at = (cloud.at + cloud.drift * dt) % 1.3;
    if (model) {
      this.ball = model.ball;
      this.items = model.items ?? [];
      this.power = model.power ?? null;
      this.castles = model.castles ?? [];
      this.wind = model.wind ?? 0;
      this.rally = model.rally ?? 0;
      if (this.flags.count) this.flags.lit = model.flagsLit ?? 0;
      for (const side of ['A', 'B']) {
        if (!this.players[side]) continue;
        if (model.rackets?.[side]) Object.assign(this.players[side].racket, model.rackets[side]);
        this.players[side].points = model.points?.[side] ?? null;
      }
    }
    this.updateBall(dt);
    for (const side of ['A', 'B']) if (this.players[side]) this.updatePlayer(side, dt);
    this.updateFlags(dt);
    this.updateEffects(dt);
    this.updateBird(dt);
    this.rallyShown += ((this.rally >= 3 ? 1 : 0) - this.rallyShown) * (1 - Math.exp(-dt * 6));
  }

  /** The ball as it's drawn: where it is, but gliding there if it was just put somewhere else. */
  updateBall(dt) {
    const { ball, shown } = this;
    if (!ball) return;
    const newPoint = ball.stroke !== shown.stroke && ball.state === 'held';
    if (newPoint || shown.lastU === null) {
      shown.carryU = 0;
      shown.carryH = 0;
      if (newPoint) shown.alpha = 0;
    } else {
      const jump = Math.hypot(ball.u - shown.lastU, ball.h - shown.lastH);
      if (jump > 0.06) {
        shown.carryU = shown.u - ball.u;
        shown.carryH = shown.h - ball.h;
      }
    }
    shown.stroke = ball.stroke;
    const decay = Math.exp(-dt * CARRY_RATE);
    shown.carryU *= decay;
    shown.carryH *= decay;
    shown.u = ball.u + shown.carryU;
    shown.h = ball.h + shown.carryH;
    shown.lastU = ball.u;
    shown.lastH = ball.h;
    // It fades in for each new point, and out once the point is over.
    const wanted = ball.state === 'dead' && ball.since > 0.9 ? 0 : 1;
    shown.alpha += (wanted - shown.alpha) * (1 - Math.exp(-dt * 7));
    const turning = ball.state === 'flying' || ball.state === 'dead' ? ball.vu * 5 : 0.6 * Math.sin(this.time * 0.9);
    shown.spin += turning * dt * this.flip * (this.reducedMotion ? 0.5 : 1);
    // A rainbow ball leaves a soft trail.
    this.trailIn -= dt;
    if (ball.kind === 'rainbow' && ball.state === 'flying') {
      if (this.trailIn <= 0) {
        this.trailIn = TRAIL_EVERY;
        this.trail.push({ u: shown.u, h: shown.h, life: 0.5 });
      }
    }
    for (const dot of this.trail) dot.life -= dt;
    this.trail = this.trail.filter((dot) => dot.life > 0).slice(-12);
  }

  /** A character runs along under its glove, and its glove goes where its hand is. */
  updatePlayer(side, dt) {
    const player = this.players[side];
    const { racket, glove } = player;
    const s = signOf(side);
    if (!player.mine) this.placeGlove(player, side);
    // Never so far back that it's off the edge of the screen, as it could be on a narrow one.
    const edge = clamp((this.width / 2 - this.scale * 0.15) / this.scale, 0.6, 1.18);
    const target = glove.visible ? s * clamp(Math.abs(racket.u) + BEHIND, 0.32, edge) : s * Math.min(0.8, edge);
    // A little movement of the hand doesn't need a step: only once it has gone further does the character
    // run, all the way, as anyone would.
    const gap = target - player.u;
    if (Math.abs(gap) > STAY_WITHIN) player.running = true;
    else if (Math.abs(gap) < 0.01) player.running = false;
    const step = player.running ? clamp(gap, -RUN_SPEED * dt, RUN_SPEED * dt) : 0;
    player.u += step;
    player.moving += ((dt > 0 ? Math.abs(step) / dt : 0) - player.moving) * (1 - Math.exp(-dt * 10));
    player.stride += Math.abs(step);
    player.moodLeft = Math.max(0, player.moodLeft - dt);
    if (!player.moodLeft) player.mood = null;
    player.nameFor = Math.max(0, player.nameFor - dt);
    // The strings show as the hand opens, at a steady rate, so a hand opening and closing quickly can't flicker them.
    const wanted = racket.visible && racket.open ? 1 : 0;
    player.ring += clamp(wanted - player.ring, -RING_RATE * dt, RING_RATE * dt);
    // Jumping a little to reach a glove that's high above.
    const reach = glove.visible ? Math.max(0, racket.h - 0.62) : 0;
    const hop = player.mood === 'cheer' ? Math.abs(Math.sin((1 - player.moodLeft / MOODS.cheer) * Math.PI * 2)) * 0.07 : Math.min(0.12, reach * 0.4);
    player.hop += (hop - player.hop) * (1 - Math.exp(-dt * 8));
  }

  /** The computer's glove, or a friend's, at their racket. A friend's copies their hand, finger by finger. */
  placeGlove(player, side) {
    const { racket, glove } = player;
    glove.visible = racket.visible;
    glove.status = racket.open ? 'open' : 'closed';
    if (!glove.visible) return;
    const { x, y } = this.at(racket.u, racket.h);
    glove.x = x;
    glove.y = y;
    const mirror = this.flip * signOf(side) > 0 ? -1 : 1;
    const { points } = player;
    glove.points.forEach((point, index) => {
      if (points?.length === 42) {
        point.x = points[index * 2] * this.flip * this.palmSize;
        point.y = points[index * 2 + 1] * this.palmSize;
      } else {
        point.x = OPEN_HAND[index][0] * mirror * this.palmSize;
        point.y = OPEN_HAND[index][1] * this.palmSize;
      }
    });
  }

  updateFlags(dt) {
    const { flags } = this;
    flags.shown = flags.shown.map((value, index) => value + clamp((index < flags.lit ? 1 : 0) - value, -dt * 1.2, dt * 3));
  }

  updateEffects(dt) {
    for (const effect of this.effects) effect.life -= dt;
    this.effects = this.effects.filter((effect) => effect.life > 0);
    for (const flight of this.flying) flight.t += dt;
    this.flying = this.flying.filter((flight) => flight.t < PRIZE_FLY_SECONDS);
    for (const label of this.labels) label.life -= dt;
    this.labels = this.labels.filter((label) => label.life > 0);
    this.nextLabel();
  }

  updateBird(dt) {
    const bird = this.bird;
    const active = this.power?.kind === 'bird';
    if (!bird && !active) return;
    const glove = Object.values(this.players).find((player) => player?.mine)?.glove;
    if (!this.bird) this.bird = { x: this.width * 0.5, y: this.height * 0.2, flap: 0, swoop: 0, to: null };
    const { bird: b } = this;
    b.flap += dt * (this.reducedMotion ? 5 : 9);
    b.swoop = Math.max(0, b.swoop - dt);
    let goal;
    if (b.swoop > 0 && b.to) goal = b.to;
    else if (active && glove?.visible) {
      const angle = this.time * 1.2;
      goal = { x: glove.x + Math.cos(angle) * this.palmSize * 1.8, y: glove.y - this.palmSize * 1.3 + Math.sin(angle) * this.palmSize * 0.5 };
    } else goal = { x: active ? this.width * 0.5 : -80, y: this.height * 0.18 };
    const rate = b.swoop > 0 ? 9 : 3.5;
    b.x += (goal.x - b.x) * (1 - Math.exp(-dt * rate));
    b.y += (goal.y - b.y) * (1 - Math.exp(-dt * rate));
    if (!active && b.x < -60) this.bird = null;
  }

  /* ---------- what happens ---------- */

  /** A player's character shows how it went for a moment: hit, cheer or oops. */
  mood(side, mood) {
    const player = this.players[side];
    if (!player) return;
    player.mood = mood;
    player.moodLeft = MOODS[mood];
  }

  /** A hit: a little burst where the ball met the glove. */
  hit(side, at) {
    const { x, y } = this.at(at?.u ?? this.ball?.u ?? 0, at?.h ?? this.ball?.h ?? 0.5);
    this.effects.push({ kind: 'burst', x, y, life: 0.35, total: 0.35, colour: '#ffffff' });
    this.mood(side, 'hit');
  }

  /** A bounce: a little puff off the court. */
  bounce(u, speed) {
    if (speed < 0.12) return;
    const { x, y } = this.at(u, 0);
    this.effects.push({ kind: 'puff', x, y, life: 0.5, total: 0.5, size: clamp(speed, 0.2, 0.9) });
  }

  /** A sandcastle falls over gently, in a puff of sand, or is built again. */
  castleFalls(castle) {
    const { x, y } = this.at(castle.u, 0.05, 0.56);
    this.effects.push({ kind: 'puff', x, y, life: 0.7, total: 0.7, size: 1.2 });
    this.castleLooks.set(castle.id, { ...this.castleLook(castle), fellAt: this.time });
  }

  castleBuilt(castle) {
    this.castleLooks.set(castle.id, { ...this.castleLook(castle), builtAt: this.time });
  }

  castleLook(castle) {
    return this.castleLooks.get(castle.id) ?? { fellAt: -Infinity, builtAt: -Infinity };
  }

  /** The bluebird bops the ball back up. */
  save(at) {
    if (!this.bird) return;
    this.bird.to = this.at(at.u, at.h + 0.05);
    this.bird.swoop = 0.45;
  }

  /** A prize flies up to the tally, from where it was on the court. */
  prize(kind, at) {
    const { x, y } = this.at(at.u, at.h);
    this.flying.push({ kind, x, y, t: 0 });
  }

  /**
   * A new thing's label, the first time it comes along in a game. target() is where it is on the screen, or
   * null once it's gone. They come one at a time, so each is read, and if one goes before its label can come
   * up, the next of its kind has it.
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
   * The sky, the sea and the court only change with the window and the level, so they're drawn once and
   * reused. Nothing in them moves.
   */
  paintBackdrop() {
    const { width: w, height: h, ratio, scale: s } = this;
    if (!w || !h) return;
    this.backdrop = document.createElement('canvas');
    this.backdrop.width = this.canvas.width;
    this.backdrop.height = this.canvas.height;
    const ctx = this.backdrop.getContext('2d');
    ctx.scale(ratio, ratio);
    // The court doesn't turn round with the players, so it's drawn as if side A were on the left.
    const flip = this.flip;
    this.flip = 1;
    const far = this.at(0, 0, 1.12).y;
    const horizon = far - s * 0.64;

    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#58b8f4');
    sky.addColorStop(1, '#d3f0ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizon + 1);
    const sun = ctx.createRadialGradient(w * 0.8, h * 0.13, 0, w * 0.8, h * 0.13, h * 0.3);
    sun.addColorStop(0, 'rgb(255 247 200 / 0.95)');
    sun.addColorStop(0.22, 'rgb(255 244 190 / 0.7)');
    sun.addColorStop(1, 'rgb(255 244 190 / 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, w, horizon);

    // The sea, with a little island on each side and boats far off.
    const sea = ctx.createLinearGradient(0, horizon, 0, far);
    sea.addColorStop(0, '#2c93df');
    sea.addColorStop(1, '#7dd2f4');
    ctx.fillStyle = sea;
    ctx.fillRect(0, horizon, w, far - horizon + 1);
    ctx.fillStyle = '#6bbf7d';
    for (const [x, r] of [[w * 0.08, s * 0.32], [w * 0.95, s * 0.24]]) {
      ctx.beginPath();
      ctx.ellipse(x, horizon + 2, r, r * 0.32, 0, Math.PI, 0);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgb(255 255 255 / 0.35)';
    ctx.lineWidth = Math.max(1.5, s * 0.004);
    ctx.lineCap = 'round';
    for (let row = 0; row < 4; row += 1) {
      const y = horizon + (far - horizon) * (0.18 + row * 0.16);
      for (let x = (row % 2) * 70; x < w; x += 150) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 18, y - 4, x + 36, y);
        ctx.stroke();
      }
    }
    for (const [x, size] of [[w * 0.3, s * 0.06], [w * 0.62, s * 0.045]]) {
      const y = horizon + (far - horizon) * 0.2;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(x, y - size * 1.4);
      ctx.lineTo(x + size * 0.8, y);
      ctx.lineTo(x, y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ff7a59';
      ctx.fillRect(x - size * 0.5, y, size * 1.4, size * 0.25);
    }

    // A strip of sand, then trees and palms behind a low hedge.
    const sandTop = far - s * 0.3;
    ctx.fillStyle = '#f6dfae';
    ctx.fillRect(0, sandTop, w, far - sandTop + 1);
    this.paintTrees(ctx, far - s * 0.11);
    ctx.fillStyle = '#4ea85f';
    ctx.beginPath();
    ctx.moveTo(0, far);
    for (let x = 0; x <= w + 30; x += 30) ctx.arc(x, far - s * 0.075, 17, Math.PI, 0);
    ctx.lineTo(w, far + 4);
    ctx.lineTo(0, far + 4);
    ctx.closePath();
    ctx.fill();

    // The lawn, the court's surround, and the court with its lines.
    ctx.fillStyle = '#86d08f';
    ctx.fillRect(0, far - 2, w, h - far + 2);
    const quad = (u0, u1, d0, d1, colour) => {
      const corners = [this.at(u0, 0, d0), this.at(u1, 0, d0), this.at(u1, 0, d1), this.at(u0, 0, d1)];
      ctx.fillStyle = colour;
      ctx.beginPath();
      corners.forEach(({ x, y }, index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
    };
    quad(-1.3, 1.3, -0.12, 1.12, '#5cb874');
    quad(-1, 1, 0.08, 0.92, '#4a9fe0');
    // A soft light across it, brighter at the back.
    const shine = ctx.createLinearGradient(0, this.at(0, 0, 0.92).y, 0, this.at(0, 0, 0.08).y);
    shine.addColorStop(0, 'rgb(255 255 255 / 0.1)');
    shine.addColorStop(1, 'rgb(18 48 77 / 0.06)');
    quad(-1, 1, 0.08, 0.92, shine);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(2, s * 0.011);
    ctx.lineJoin = 'round';
    const line = (points) => {
      ctx.beginPath();
      points.forEach(([u, d], index) => {
        const { x, y } = this.at(u, 0, d);
        if (index) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.stroke();
    };
    line([[-1, 0.08], [1, 0.08], [1, 0.92], [-1, 0.92], [-1, 0.08]]);
    line([[-0.55, 0.08], [-0.55, 0.92]]);
    line([[0.55, 0.08], [0.55, 0.92]]);
    line([[-0.55, 0.5], [0.55, 0.5]]);
    line([[-1, 0.5], [-0.95, 0.5]]);
    line([[1, 0.5], [0.95, 0.5]]);

    // The poles the flags hang from, from level 4, and the windsock's pole, from level 8.
    if (this.flags.count) {
      ctx.strokeStyle = '#b8c4cf';
      ctx.lineWidth = Math.max(3, s * 0.014);
      for (const u of [-1.12, 1.12]) {
        const foot = this.at(u, 0, 1.08);
        const top = this.at(u, 0.82, 1.08);
        ctx.beginPath();
        ctx.moveTo(foot.x, foot.y);
        ctx.lineTo(top.x, top.y);
        ctx.stroke();
      }
    }
    this.flip = flip;
  }

  /** Round trees and palms along the back, whose feet the hedge hides. */
  paintTrees(ctx, base) {
    const { width: w, scale: s } = this;
    const round = (x, size, tone) => {
      ctx.fillStyle = '#8a5a34';
      ctx.fillRect(x - size * 0.08, base - size * 0.9, size * 0.16, size * 0.9);
      ctx.fillStyle = tone;
      for (const [dx, dy, r] of [[0, -1.25, 0.55], [-0.42, -0.95, 0.42], [0.42, -0.95, 0.42]]) {
        ctx.beginPath();
        ctx.arc(x + dx * size, base + dy * size, r * size, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    const palm = (x, size) => {
      ctx.strokeStyle = '#a8743f';
      ctx.lineWidth = size * 0.12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, base);
      ctx.quadraticCurveTo(x + size * 0.25, base - size * 0.9, x + size * 0.12, base - size * 1.7);
      ctx.stroke();
      ctx.fillStyle = '#3f9d4f';
      const top = { x: x + size * 0.12, y: base - size * 1.7 };
      for (let i = 0; i < 6; i += 1) {
        const angle = Math.PI + (i / 5) * Math.PI;
        ctx.beginPath();
        ctx.ellipse(top.x + Math.cos(angle) * size * 0.42, top.y + Math.sin(angle) * size * 0.2 + size * 0.12, size * 0.5, size * 0.12, angle + Math.PI / 2 - 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    const size = s * 0.2;
    const tones = ['#5cbf6a', '#4fb35f', '#67c873'];
    let index = 0;
    for (let x = -size * 0.3; x < w + size; x += size * 1.35) {
      round(x, size * (0.85 + ((index * 37) % 5) * 0.06), tones[index % tones.length]);
      index += 1;
    }
    palm(w * 0.06, size * 1.25);
    palm(w * 0.9, size * 1.15);
  }

  render() {
    const { ctx, width: w, height: h, ratio } = this;
    if (!this.backdrop) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.drawImage(this.backdrop, 0, 0, w, h);
    ctx.globalAlpha = 0.85;
    for (const cloud of this.clouds) {
      const size = h * 0.34 * cloud.size;
      ctx.drawImage(this.cloud, cloud.at * w * 1.1 - size * 0.6, cloud.y * h, size, (size * 170) / 320);
    }
    ctx.globalAlpha = 1;
    this.drawFlags();
    if (this.breeze) this.drawWindsock();
    for (const castle of this.castles) this.drawCastle(castle);
    this.drawShadows();
    const order = ['A', 'B'].filter((side) => this.players[side]).sort((a, b) => Number(this.players[a].mine) - Number(this.players[b].mine));
    for (const side of order) this.drawCharacter(side);
    this.drawNet();
    for (const item of this.items) this.drawItem(item);
    this.drawBall();
    for (const side of order) this.drawHand(side);
    if (this.bird) this.drawBird(this.bird);
    this.drawEffects();
    this.drawFlying();
    this.drawNames();
    for (const label of this.labels) this.drawLabel(label);
    this.drawRally();
  }

  drawShadows() {
    const { ctx, scale: s, ball, shown } = this;
    ctx.fillStyle = 'rgb(18 48 77 / 0.2)';
    for (const side of ['A', 'B']) {
      const player = this.players[side];
      if (!player) continue;
      const { x, y } = this.at(player.u, 0, FEET);
      const size = s * 0.13 * (1 - player.hop * 1.5);
      ctx.beginPath();
      ctx.ellipse(x, y, size, size * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!ball || shown.alpha < 0.02) return;
    const height = Math.max(0, shown.h - COURT.ball);
    const { x, y } = this.at(shown.u, 0);
    const size = COURT.ball * s * (1.1 - Math.min(0.6, height * 0.6));
    ctx.fillStyle = `rgb(18 48 77 / ${(0.28 * (1 - Math.min(0.7, height * 0.7)) * shown.alpha).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(x, y, size, size * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Which picture a character is in now, and where its feet and its racket shoulder are on the screen. */
  pose(side) {
    const player = this.players[side];
    const { art } = player;
    if (!art) {
      // Without its picture, as when the 3D drawing failed: an arm from where its shoulder would be.
      const feet = this.at(player.u, player.hop, FEET);
      const facing = feet.x < this.cx ? 1 : -1;
      const unit = CHARACTER * this.scale;
      return { frame: null, size: 0, feet, facing, shoulder: { x: feet.x + facing * unit * 0.2, y: feet.y - unit * 1.45 }, head: { x: feet.x, y: feet.y - unit * 2.1 } };
    }
    let name = 'ready';
    if (player.mood) name = player.mood;
    else if (player.moving > 0.12) name = RUN_FRAMES[Math.floor(player.stride / STRIDE) % RUN_FRAMES.length];
    else if (player.hop > 0.03) name = 'reach';
    const frame = art.frames[name] ?? art.frames.ready;
    const size = (CHARACTER * BODY * this.scale) / art.body;
    const feet = this.at(player.u, player.hop, FEET);
    // The pictures face right. A character on the right of the screen faces left, towards the net.
    const facing = feet.x < this.cx ? 1 : -1;
    const shoulder = {
      x: feet.x + (frame.shoulder.x - art.foot.x) * size * facing,
      y: feet.y + (frame.shoulder.y - art.foot.y) * size,
    };
    const head = { x: feet.x + (frame.head.x - art.foot.x) * size * facing, y: feet.y + (frame.head.y - art.foot.y) * size };
    return { frame, size, feet, facing, shoulder, head };
  }

  drawCharacter(side) {
    const { ctx } = this;
    const player = this.players[side];
    if (!player.art) return;
    const { frame, size, feet, facing } = this.pose(side);
    const { art } = player;
    const breathe = this.reducedMotion || player.moving > 0.12 ? 0 : Math.sin(this.time * 2.4 + (side === 'A' ? 0 : 1.3)) * 0.012;
    ctx.save();
    ctx.translate(feet.x, feet.y);
    ctx.scale(facing * size * (1 - breathe * 0.5), size * (1 + breathe));
    ctx.drawImage(frame.image, -art.foot.x, -art.foot.y);
    ctx.restore();
  }

  drawNet() {
    const { ctx, scale: s } = this;
    const near = 0.04;
    const far = 0.96;
    const corners = [this.at(0, 0, near), this.at(0, COURT.net, near), this.at(0, COURT.net, far), this.at(0, 0, far)];
    ctx.save();
    ctx.beginPath();
    corners.forEach(({ x, y }, index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = 'rgb(255 255 255 / 0.12)';
    ctx.fill();
    ctx.clip();
    ctx.strokeStyle = 'rgb(18 48 77 / 0.38)';
    ctx.lineWidth = Math.max(1, s * 0.0035);
    const steps = 14;
    for (let i = 0; i <= steps; i += 1) {
      const depth = near + ((far - near) * i) / steps;
      const bottom = this.at(0, 0, depth);
      const top = this.at(0, COURT.net, depth);
      ctx.beginPath();
      ctx.moveTo(bottom.x, bottom.y);
      ctx.lineTo(top.x, top.y);
      ctx.stroke();
    }
    for (let i = 1; i < 6; i += 1) {
      const height = (COURT.net * i) / 6;
      const a = this.at(0, height, near);
      const b = this.at(0, height, far);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
    // The tape along the top, and the posts.
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(3, s * 0.016);
    ctx.beginPath();
    ctx.moveTo(corners[1].x, corners[1].y);
    ctx.lineTo(corners[2].x, corners[2].y);
    ctx.stroke();
    for (const depth of [far, near]) {
      const foot = this.at(0, 0, depth);
      const top = this.at(0, COURT.net + 0.03, depth);
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(5, s * 0.024);
      ctx.beginPath();
      ctx.moveTo(foot.x, foot.y);
      ctx.lineTo(top.x, top.y);
      ctx.stroke();
      ctx.strokeStyle = '#e9eef3';
      ctx.lineWidth = Math.max(3, s * 0.015);
      ctx.stroke();
    }
  }

  drawBall() {
    const { ctx, ball, shown, scale: s } = this;
    if (!ball || shown.alpha < 0.02) return;
    const r = COURT.ball * s;
    for (const dot of this.trail) {
      const { x, y } = this.at(dot.u, dot.h);
      ctx.globalAlpha = clamp(dot.life / 0.5, 0, 1) * 0.3 * shown.alpha;
      ctx.fillStyle = RAINBOW[Math.floor((dot.u * 40 + 60) % RAINBOW.length)];
      ctx.beginPath();
      ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    const { x, y } = this.at(shown.u, shown.h);
    ctx.globalAlpha = shown.alpha;
    // A ball waiting for the child has a soft ring round it, which grows and shrinks a little.
    if (ball.state === 'waiting' || (ball.state === 'held' && this.players[ball.side]?.kind !== 'computer')) {
      const swell = this.reducedMotion ? 0 : Math.sin(this.time * 2.2) * 0.08;
      ctx.strokeStyle = 'rgb(255 255 255 / 0.55)';
      ctx.lineWidth = Math.max(2, r * 0.12);
      ctx.beginPath();
      ctx.arc(x, y, r * (1.5 + swell), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(x, y);
    if (ball.kind === 'bubble') {
      ctx.drawImage(this.bubble, -r * 1.15, -r * 1.15, r * 2.3, r * 2.3);
    } else {
      ctx.save();
      ctx.rotate(shown.spin);
      ctx.drawImage(this.panels[ball.kind] ?? this.panels.beach, -r, -r, r * 2, r * 2);
      ctx.restore();
      ctx.drawImage(this.shading, -r, -r, r * 2, r * 2);
      ctx.strokeStyle = 'rgb(18 48 77 / 0.55)';
      ctx.lineWidth = Math.max(1.5, r * 0.06);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      // The golden ball has a little star turning slowly on it.
      if (ball.kind === 'golden') {
        ctx.rotate(this.reducedMotion ? 0 : this.time * 0.8);
        ctx.globalAlpha = shown.alpha * 0.75;
        ctx.drawImage(this.marks.star, -r * 0.45, -r * 0.45, r * 0.9, r * 0.9);
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** A player's arm, racket and glove. */
  drawHand(side) {
    const { ctx } = this;
    const player = this.players[side];
    const { glove, racket } = player;
    const { shoulder, facing } = this.pose(side);
    const colours = player.art?.arm ?? { skin: '#f5c451', sleeve: '#f5c451', hand: '#ffffff', ink: INK };
    // As thick as the characters' own arms.
    const thick = Math.max(6, 0.19 * CHARACTER * this.scale);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (!glove.visible) {
      // Resting, by its side.
      const hand = { x: shoulder.x + facing * thick * 0.6, y: shoulder.y + thick * 4.2 };
      this.drawArm(shoulder, hand, thick, colours, facing);
      ctx.fillStyle = colours.hand;
      ctx.strokeStyle = colours.ink;
      ctx.lineWidth = Math.max(1.5, thick * 0.16);
      ctx.beginPath();
      ctx.arc(hand.x, hand.y, thick * 0.75, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }
    const wrist = { x: glove.x + glove.points[0].x, y: glove.y + glove.points[0].y };
    this.drawArm(shoulder, wrist, thick, colours, facing);
    this.drawRacket(player, glove.x, glove.y, racket.radius * this.scale);
    if (player.mine) glove.draw(ctx, this.palmSize);
    else glove.draw(ctx, this.palmSize, { fill: '#ffffff', ink: colours.ink });
    if (player.mine && this.power) this.drawPowerRing(glove, racket.radius * this.scale);
    ctx.restore();
  }

  /** A long cartoon arm, bending a little at the elbow, with an outline. */
  drawArm(from, to, thick, colours, facing) {
    const { ctx } = this;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    // The elbow bends down and out, away from the net.
    const bend = Math.min(length * 0.16, thick * 3);
    const control = { x: (from.x + to.x) / 2 + (dy / length) * bend * facing * -1, y: (from.y + to.y) / 2 + Math.abs(dx / length) * bend };
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.quadraticCurveTo(control.x, control.y, to.x, to.y);
    };
    path();
    ctx.strokeStyle = colours.ink;
    ctx.lineWidth = thick + Math.max(3, thick * 0.3);
    ctx.stroke();
    path();
    ctx.strokeStyle = colours.skin;
    ctx.lineWidth = thick;
    ctx.stroke();
    // The forearm, from the elbow, in its own colour, as on the characters themselves.
    if (colours.sleeve === colours.skin) return;
    const elbow = { x: (from.x + 2 * control.x + to.x) / 4, y: (from.y + 2 * control.y + to.y) / 4 };
    ctx.beginPath();
    ctx.moveTo(elbow.x, elbow.y);
    ctx.quadraticCurveTo((control.x + to.x) / 2, (control.y + to.y) / 2, to.x, to.y);
    ctx.strokeStyle = colours.sleeve;
    ctx.stroke();
  }

  /** The racket round a glove: strings and a frame when the hand is open, and a dashed ring when it isn't. */
  drawRacket(player, x, y, r) {
    const { ctx } = this;
    const open = player.ring;
    ctx.save();
    if (open > 0.02) {
      ctx.globalAlpha = open;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgb(255 255 255 / 0.16)';
      ctx.fill();
      ctx.clip();
      ctx.strokeStyle = 'rgb(255 255 255 / 0.55)';
      ctx.lineWidth = Math.max(1, r * 0.022);
      const gap = r / 3.4;
      ctx.beginPath();
      for (let i = -3; i <= 3; i += 1) {
        ctx.moveTo(x + i * gap, y - r);
        ctx.lineTo(x + i * gap, y + r);
        ctx.moveTo(x - r, y + i * gap);
        ctx.lineTo(x + r, y + i * gap);
      }
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(4, r * 0.14);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = FRAMES[player.mine ? 'mine' : player.kind] ?? FRAMES.computer;
      ctx.lineWidth = Math.max(2.5, r * 0.09);
      ctx.stroke();
    }
    if (open < 0.98) {
      ctx.globalAlpha = (1 - open) * 0.75;
      ctx.setLineDash([r * 0.22, r * 0.18]);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(2, r * 0.05);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  /** How long a power-up has left, as a ring round the racket that goes down. */
  drawPowerRing(glove, r) {
    const { ctx, power } = this;
    const share = clamp(power.left / power.seconds, 0, 1);
    ctx.strokeStyle = 'rgb(255 255 255 / 0.9)';
    ctx.lineWidth = Math.max(3, r * 0.07);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(glove.x, glove.y, r * 1.18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * share);
    ctx.stroke();
    if (power.kind === 'big') {
      const size = this.palmSize * 0.7;
      ctx.drawImage(this.marks.big, glove.x - size / 2, glove.y - r * 1.18 - size * 0.95, size, size);
    }
  }

  drawItem(item) {
    const { ctx, scale: s } = this;
    const { x, y } = this.at(item.u, item.h);
    const fade = clamp(Math.min(item.age / 0.5, (item.life - item.age) / 1), 0, 1);
    ctx.save();
    ctx.globalAlpha = fade;
    if (item.kind === 'star') {
      const r = s * 0.065;
      ctx.translate(x, y);
      ctx.rotate(this.reducedMotion ? 0 : Math.sin(item.age * 1.4 + item.phase) * 0.25);
      ctx.drawImage(this.marks.star, -r, -r, r * 2, r * 2);
    } else {
      const r = s * 0.095;
      ctx.drawImage(this.bubble, x - r, y - r, r * 2, r * 2);
      const mark = this.marks[item.kind];
      if (mark) ctx.drawImage(mark, x - r * 0.6, y - r * 0.62, r * 1.2, r * 1.2);
    }
    ctx.restore();
  }

  drawFlags() {
    const { ctx, flags, scale: s } = this;
    if (!flags.count) return;
    const ends = [this.at(-1.12, 0.8, 1.08), this.at(1.12, 0.8, 1.08)];
    const sag = s * 0.07;
    const along = (share) => ({
      x: ends[0].x + (ends[1].x - ends[0].x) * share,
      y: ends[0].y + (ends[1].y - ends[0].y) * share + Math.sin(share * Math.PI) * sag,
    });
    ctx.strokeStyle = 'rgb(18 48 77 / 0.5)';
    ctx.lineWidth = Math.max(1.5, s * 0.005);
    ctx.beginPath();
    for (let i = 0; i <= 20; i += 1) {
      const { x, y } = along(i / 20);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
    // They fill in from the child's end of the court.
    const mine = this.players.A?.mine === false ? 'B' : 'A';
    const fromLeft = this.at(signOf(mine), 0).x < this.cx;
    const size = s * 0.07;
    for (let i = 0; i < flags.count; i += 1) {
      const order = fromLeft ? i : flags.count - 1 - i;
      const { x, y } = along((order + 0.5) / flags.count);
      const lit = flags.shown[i] ?? 0;
      const sway = this.reducedMotion ? 0 : Math.sin(this.time * 1.6 + i) * 0.05;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(sway);
      ctx.scale(0.85 + 0.15 * lit, 0.85 + 0.15 * lit);
      ctx.beginPath();
      ctx.moveTo(-size * 0.5, 0);
      ctx.lineTo(size * 0.5, 0);
      ctx.lineTo(0, size * 1.1);
      ctx.closePath();
      ctx.fillStyle = '#fbf3df';
      ctx.fill();
      if (lit > 0.01) {
        ctx.globalAlpha = lit;
        ctx.fillStyle = RAINBOW[i % RAINBOW.length];
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = 'rgb(18 48 77 / 0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  drawWindsock() {
    const { ctx, scale: s } = this;
    const foot = this.at(0, COURT.net + 0.03, 0.96);
    const top = this.at(0, COURT.net + 0.36, 0.96);
    ctx.strokeStyle = '#b8c4cf';
    ctx.lineWidth = Math.max(3, s * 0.012);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(foot.x, foot.y);
    ctx.lineTo(top.x, top.y);
    ctx.stroke();
    // It hangs down with no wind, and lifts out the way the breeze blows.
    const strength = clamp(Math.abs(this.wind) / EXTRAS.breeze, 0, 1);
    const way = Math.sign(this.wind || 1) * this.flip;
    ctx.save();
    ctx.translate(top.x, top.y);
    // Drawn hanging straight down, and turned out towards where the breeze is going.
    ctx.rotate(-way * (0.2 + strength * 1.15));
    const length = s * 0.16;
    for (let i = 0; i < 4; i += 1) {
      ctx.fillStyle = i % 2 ? '#ffffff' : '#ff7a3d';
      const a = (i / 4) * length;
      const b = ((i + 1) / 4) * length;
      const wide = (t) => s * 0.035 * (1 - (t / length) * 0.45);
      ctx.beginPath();
      ctx.moveTo(-wide(a), a);
      ctx.lineTo(wide(a), a);
      ctx.lineTo(wide(b), b);
      ctx.lineTo(-wide(b), b);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /** A sandcastle, or the soft heap of sand it leaves when the ball knocks it over, until it's built again. */
  drawCastle(castle) {
    const { ctx, scale: s } = this;
    const { x, y } = this.at(castle.u, 0, 0.56);
    const look = this.castleLook(castle);
    const fell = castle.standing ? 0 : clamp((this.time - look.fellAt) / 0.6, 0, 1);
    const built = castle.standing ? clamp((this.time - look.builtAt) / 0.8, 0, 1) : 0;
    // How much of the castle is up: all of it, sinking as it falls, and rising again as it's built.
    const up = castle.standing ? ease(built) : 1 - ease(fell);
    const size = s * 0.11;
    ctx.save();
    ctx.translate(x, y);
    if (up < 0.99) {
      ctx.globalAlpha = 1 - up * 0.9;
      ctx.fillStyle = '#e8c88b';
      ctx.strokeStyle = 'rgb(120 82 40 / 0.45)';
      ctx.lineWidth = Math.max(1.5, s * 0.004);
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 1.05, size * 0.42, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (up > 0.01) {
      ctx.globalAlpha = Math.min(1, up * 1.5);
      ctx.scale(1, up);
      ctx.fillStyle = '#e8c88b';
      ctx.strokeStyle = 'rgb(120 82 40 / 0.6)';
      ctx.lineWidth = Math.max(1.5, s * 0.004);
      const block = (left, width, height) => {
        ctx.beginPath();
        ctx.rect(left * size, -height * size, width * size, height * size);
        ctx.fill();
        ctx.stroke();
        // Little teeth along the top.
        for (let i = 0; i < 3; i += 1) {
          ctx.beginPath();
          ctx.rect((left + (i * width) / 3 + width * 0.06) * size, -(height + 0.14) * size, width * 0.2 * size, 0.14 * size);
          ctx.fill();
          ctx.stroke();
        }
      };
      block(-0.9, 1.8, 0.55);
      block(-0.8, 0.5, 1.05);
      block(0.3, 0.5, 1.05);
      block(-0.28, 0.56, 1.35);
      ctx.fillStyle = '#c99d58';
      ctx.beginPath();
      ctx.ellipse(0, -0.2 * size, 0.13 * size, 0.2 * size, 0, Math.PI, 0);
      ctx.rect(-0.13 * size, -0.2 * size, 0.26 * size, 0.2 * size);
      ctx.fill();
      if (up > 0.9) {
        ctx.strokeStyle = INK;
        ctx.beginPath();
        ctx.moveTo(0, -1.49 * size);
        ctx.lineTo(0, -1.95 * size);
        ctx.stroke();
        ctx.fillStyle = '#ff5a4f';
        ctx.beginPath();
        ctx.moveTo(0, -1.95 * size);
        ctx.lineTo(0.38 * size * this.flip, -1.83 * size);
        ctx.lineTo(0, -1.71 * size);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawBird(bird) {
    const { ctx } = this;
    const size = this.palmSize * 0.42;
    const flap = Math.sin(bird.flap) * 0.5;
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.lineWidth = Math.max(2, size * 0.1);
    ctx.strokeStyle = INK;
    ctx.fillStyle = '#5fa8ff';
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.rotate(side * (0.4 + flap));
      ctx.beginPath();
      ctx.ellipse(side * size * 0.9, -size * 0.2, size * 0.75, size * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#dff0ff';
    ctx.beginPath();
    ctx.ellipse(0, size * 0.4, size * 0.6, size * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffb703';
    ctx.beginPath();
    ctx.moveTo(size * 0.85, -size * 0.1);
    ctx.lineTo(size * 1.35, size * 0.05);
    ctx.lineTo(size * 0.85, size * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(size * 0.4, -size * 0.25, size * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawEffects() {
    const { ctx, scale: s } = this;
    for (const effect of this.effects) {
      const share = 1 - effect.life / effect.total;
      ctx.save();
      ctx.globalAlpha = clamp(effect.life / effect.total, 0, 1);
      if (effect.kind === 'burst') {
        ctx.strokeStyle = effect.colour;
        ctx.lineWidth = Math.max(2, s * 0.008);
        ctx.lineCap = 'round';
        const inner = s * (0.1 + share * 0.06);
        const outer = s * (0.14 + share * 0.09);
        for (let i = 0; i < 7; i += 1) {
          const angle = (i / 7) * Math.PI * 2 + 0.3;
          ctx.beginPath();
          ctx.moveTo(effect.x + Math.cos(angle) * inner, effect.y + Math.sin(angle) * inner);
          ctx.lineTo(effect.x + Math.cos(angle) * outer, effect.y + Math.sin(angle) * outer);
          ctx.stroke();
        }
      } else if (effect.kind === 'puff') {
        ctx.fillStyle = '#f1e2bd';
        for (let i = 0; i < 5; i += 1) {
          const angle = Math.PI + (i / 4) * Math.PI;
          const out = s * 0.06 * effect.size * (0.4 + share);
          ctx.beginPath();
          ctx.arc(effect.x + Math.cos(angle) * out * 1.4, effect.y + Math.sin(angle) * out * 0.5, s * 0.018 * effect.size * (1 - share * 0.5), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  /** Caught prizes flying up to the tally, getting smaller. */
  drawFlying() {
    if (!this.flying.length) return;
    const { ctx } = this;
    const to = this.prizeTarget();
    for (const flight of this.flying) {
      const share = ease(Math.min(1, flight.t / PRIZE_FLY_SECONDS));
      const x = flight.x + (to.x - flight.x) * share;
      const y = flight.y + (to.y - flight.y) * share - Math.sin(share * Math.PI) * this.height * 0.08;
      const size = this.scale * 0.065 * (1.2 - 0.6 * share);
      ctx.drawImage(this.marks[flight.kind], x - size, y - size, size * 2, size * 2);
    }
  }

  /**
   * A friend's name, over their glove, and the computer's over its head for the first moments. The child's own has
   * a name only when two are on one screen in one picture, and it's over their glove too.
   */
  drawNames() {
    for (const side of ['A', 'B']) {
      const player = this.players[side];
      if (!player?.name) continue;
      const always = player.kind === 'remote' || player.mine;
      const showFor = always ? Infinity : player.nameFor;
      if (showFor <= 0) continue;
      const alpha = clamp(showFor, 0, 1);
      const { head } = this.pose(side);
      const at = always && player.glove.visible ? { x: player.glove.x, y: player.glove.y - this.palmSize * 1.6 } : { x: head.x, y: head.y - this.palmSize * 0.35 };
      this.drawTag(player.name, at, alpha);
    }
  }

  drawTag(text, at, alpha = 1) {
    const { ctx, palmSize } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `700 ${Math.round(Math.max(14, palmSize * 0.34))}px Fredoka, "Noto Sans Georgian", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const wide = ctx.measureText(text).width + palmSize * 0.45;
    const high = Math.max(22, palmSize * 0.52);
    const x = clamp(at.x, wide / 2 + 6, this.width - wide / 2 - 6);
    ctx.fillStyle = 'rgb(18 48 77 / 0.75)';
    ctx.beginPath();
    ctx.roundRect(x - wide / 2, at.y - high / 2, wide, high, high / 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, x, at.y + 1);
    ctx.restore();
  }

  /** A new thing's little label, by it, fading in and out. */
  drawLabel(label) {
    const { ctx, height } = this;
    const target = label.target() ?? label.last;
    if (!target) return;
    label.last = target;
    const alpha = clamp(Math.min((LABEL_SECONDS - label.life) / 0.3, label.life / 0.6), 0, 1);
    const size = Math.max(16, height * 0.03);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `600 ${Math.round(size)}px Fredoka, "Noto Sans Georgian", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(label.text).width + size * 1.2;
    const h = size * 1.7;
    const x = clamp(target.x, w / 2 + 8, this.width - w / 2 - 8);
    const y = clamp(target.y - target.r * 1.4 - h / 2, h / 2 + 120, height - h);
    ctx.fillStyle = 'rgb(255 255 255 / 0.95)';
    ctx.strokeStyle = 'rgb(18 48 77 / 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.fillText(label.text, x, y + 1);
    ctx.restore();
  }

  /** How many hits in a row, once a rally gets going, at the foot of the net. */
  drawRally() {
    if (this.rallyShown < 0.02 || this.rally < 2) return;
    const { ctx, scale: s } = this;
    const text = this.language() === 'ka' ? `${this.rally} ზედიზედ!` : `${this.rally} in a row!`;
    const size = Math.max(16, s * 0.055);
    const at = this.at(0, 0, -0.1);
    ctx.save();
    ctx.globalAlpha = this.rallyShown;
    ctx.font = `700 ${Math.round(size)}px Fredoka, "Noto Sans Georgian", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + size * 1.3;
    const h = size * 1.6;
    const y = Math.min(this.height - h / 2 - 6, at.y + h * 0.9);
    ctx.fillStyle = 'rgb(255 255 255 / 0.95)';
    ctx.beginPath();
    ctx.roundRect(at.x - w / 2, y - h / 2, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.fillText(text, at.x, y + 1);
    ctx.restore();
  }
}
