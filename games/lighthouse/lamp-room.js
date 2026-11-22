// The lamp room of the lighthouse: a big window with mud on it, and the sea outside. An open hand
// wipes the mud off, and when it's clean the light goes out across the water to bring a ship home.
// The window is on the side of the hand being played with.
//
// Nothing flashes, as seizures are more common in children with hemiplegia. The beam comes on slowly
// and stays steady, there's no lightning, and the picture brightens gradually as the storm clears.
// Splats, seaweed and starfish from the higher levels are small, and arrive and leave over a moment.
// Treasure, crabs, power-ups and the gull move slowly and are small too, and the first time each one
// comes in a game, a little label with its name fades in beside it and out again.
//
// With friends, each friend's glove is on the glass too, in light grey with their name over it, where
// their hand is on their own window, and the mud their hand wipes comes off here as well, a patch at a
// time, softly, as the server says it was theirs.
import { Glove, INK, SECOND_PLAYER, inOnePicture, mixColours, secondPlayerLook } from '../../core/glove.js';
import { pictureChanged, pictureSize } from '../../core/seat.js';
import { NEW_THINGS, POWER_SECONDS, PRIZE_READY_SECONDS } from './storm.js';

const PALM_SHARE = 0.105;
const WIPE_SIZE = 0.15; // The size of a wipe, as a share of the screen's height.
const SIZES = { none: [0.05, 0.95], little: [0.2, 0.95], lots: [0.38, 0.95] }; // Across the screen, for the right hand.
const TOP = 0.13;
const BOTTOM = 0.88;
const SAIL_SECONDS = 2.4;
const BEAM_SECONDS = 0.8;
// At night the beam and the clear glass stand out more against the dark, so they come more slowly.
const NIGHT_BEAM_SECONDS = 1.4;
const MUD_FADE = 1.2; // How quickly the last of the mud slides away, as a share a second.
const NIGHT_MUD_FADE = 0.7;
const BOAT_COLOURS = { ice: '#d7f2ff', fishing: '#ff9a5c', tin: '#a9b6c4', honey: '#ffcf4a' };
const FALL_SECONDS = 1; // Seaweed and starfish sliding down and off the glass.
const FLY_SECONDS = 0.7; // Treasure flying up to the count of it.
const LABEL_SECONDS = 2.4; // A new thing's name, beside it the first time it comes.
const LABEL_WAIT = 3; // How long an older thing's name waits its turn before it's let go.
const GULL_SECONDS = 2.6; // The gull flying across the window.
const GULL_WIPE = 0.2; // How wide the gull's wipe is, as a share of the screen's height.
// A friend's patch comes off as a soft round wipe over it: clear right out to its corners, and fading
// out a little way past them, as cells across and down.
const PATCH_CLEAR = 0.72;
const PATCH_EDGE = 0.95;
const FRIEND_GLOVE = { fill: '#e3e8ee', ink: '#9aa8b6' };
const BOUNCE_SECONDS = 0.9; // A splat bouncing off the bubble shield.
const PRIZE_SHARE = 0.042; // A prize's size, as a share of the screen's height.
// The stars in the night sky, as shares of the window, always in the same places.
const STARS = Array.from({ length: 26 }, (_, i) => ({ x: ((i * 0.618) % 1) * 0.94 + 0.03, y: ((i * 0.377) % 1) * 0.5 + 0.03, r: 0.8 + (i % 3) * 0.5 }));

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export class LampRoom {
  /** events: onWiped(amount), onSailed() */
  constructor(canvas, events = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.events = events;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.gloves = { left: new Glove('left'), right: new Glove('right') };
    this.side = 'right';
    this.reach = 'none';
    this.aspect = 16 / 9;
    this.time = 0;
    this.calm = 0;
    this.shownCalm = 0;
    this.mud = null;
    this.mudLeft = 0;
    this.boat = null;
    this.sailing = 0;
    this.beam = 0;
    this.wipeSpeed = 0;
    this.last = null;
    this.drops = [];
    this.swell = 1; // How wild the sea is: more at higher levels.
    this.lumps = []; // Seaweed and starfish on the glass, from the rules.
    this.falling = []; // Seaweed and starfish on their way down.
    this.storm = null; // The rules, for the treasure, crabs and power-ups on the glass.
    this.night = false;
    this.language = 'en';
    this.labels = []; // Names of new things, beside them the first time.
    this.introduced = new Set();
    this.fresh = new Set(); // What's new at this level, whose names always get their turn.
    this.flying = []; // Treasure on its way up to the count.
    this.leaving = []; // Crabs going off, having let go of their pearls.
    this.bounces = []; // Mud bouncing off the bubble shield.
    this.sparkles = [];
    this.gull = null;
    this.friendGloves = []; // With friends, each one's glove, as [{ glove, name, fade }]: main.js keeps them up to date.
    this.tallyAt = { x: 80, y: 40 }; // Where the treasure count is on the screen.
    this.sprites = { shell: paintPrize('shell'), pearl: paintPrize('pearl'), coin: paintPrize('coin') };
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  configure({ side = this.side, reach = this.reach }) {
    this.side = side;
    this.reach = reach;
    this.placeWindow();
  }

  /**
   * As big as the picture the child sees it in. That's the window, except for the second of two playing in one
   * picture, whose game goes on under the first one's, in a window half as wide: it's as big as the first one's,
   * so their hand wipes the glass it's on in the picture, as wide as it is there. See pictureSize in core/seat.js.
   * The canvas is as big as the window, and shows as much as fits in it.
   */
  resize() {
    ({ width: this.width, height: this.height } = pictureSize());
    this.ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(window.innerWidth * this.ratio);
    this.canvas.height = Math.round(window.innerHeight * this.ratio);
    this.palmSize = Math.max(44, this.height * PALM_SHARE);
    this.placeWindow();
  }

  placeWindow() {
    const [from, to] = SIZES[this.reach];
    const [left, right] = this.side === 'right' ? [from, to] : [1 - to, 1 - from];
    this.window = {
      x: left * this.width,
      y: TOP * this.height,
      width: (right - left) * this.width,
      height: (BOTTOM - TOP) * this.height,
    };
  }

  /**
   * Fresh mud on the window, from the storm. random lays out its lumps: with friends, it's the same on
   * every computer, so everyone's mud looks the same.
   */
  muddy(random = Math.random) {
    const { window: glass, ratio } = this;
    const mud = document.createElement('canvas');
    mud.width = Math.round(glass.width * ratio);
    mud.height = Math.round(glass.height * ratio);
    const ctx = mud.getContext('2d');
    ctx.fillStyle = '#6b4a2b';
    ctx.fillRect(0, 0, mud.width, mud.height);
    for (let i = 0; i < 170; i += 1) {
      ctx.fillStyle = ['#7c5733', '#5e3f24', '#876139', '#553820'][i % 4];
      ctx.beginPath();
      ctx.arc(random() * mud.width, random() * mud.height, 10 + random() * mud.height * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
    this.mud = mud;
    this.mudLeft = 1;
    this.last = null;
    this.falling = [];
    this.leaving = [];
    this.bounces = [];
  }

  /** A new game: nothing has been shown yet. */
  restart() {
    this.labels = [];
    this.introduced = new Set();
    this.flying = [];
    this.sparkles = [];
    this.gull = null;
  }

  /**
   * The first time something new comes in a game, its name fades in beside it for a moment. at says
   * where it is now, on the screen, or null while it can't be seen. A name only counts as shown once
   * it has been: one still waiting when its thing goes waits for the next of its kind instead.
   */
  introduce(key, at) {
    if (this.introduced.has(key) || !NEW_THINGS[key]) return;
    const waiting = this.labels.find((label) => label.key === key);
    if (!waiting) this.labels.push({ key, at, t: 0 });
    else if (!waiting.started && waiting.at() === null) Object.assign(waiting, { at, wait: 0 });
  }

  /** A new thing's name, in the language the voice speaks now. */
  labelText({ key }) {
    const { mark, name, nameKa } = NEW_THINGS[key];
    return `${mark} ${this.language === 'ka' ? nameKa : name}`;
  }

  /** Where a power-up's badge is while it's on, at the bottom of the window, or null. */
  badgeAt(kind) {
    if (!this.mud || !(this.storm?.active[kind] > 0)) return null;
    const { window: glass, height } = this;
    return { x: glass.x + glass.width / 2 + (kind === 'bubble' ? 1 : -1) * height * 0.06, y: glass.y + glass.height - height * 0.06 };
  }

  /** Where the gull is while it flies across, or null. */
  gullAt() {
    const { gull, window: glass } = this;
    return gull?.x === undefined ? null : { x: glass.x + gull.x, y: glass.y + gull.yNow };
  }

  /** Where a place on the glass, given in shares of the window, is on the screen. */
  onScreen({ x, y }) {
    const { window: glass } = this;
    return { x: glass.x + x * glass.width, y: glass.y + y * glass.height };
  }

  /** The open hand on the glass, in shares of the window, for the rules, or null if there isn't one. */
  handOnGlass() {
    const glove = this.gloves[this.side];
    if (!glove.visible || glove.status !== 'open') return null;
    const { window: glass, height } = this;
    const x = glove.x - glass.x;
    const y = glove.y - glass.y;
    if (x < -height * 0.1 || x > glass.width + height * 0.1 || y < -height * 0.1 || y > glass.height + height * 0.1) return null;
    const size = this.wipeSize;
    return { x: x / glass.width, y: y / glass.height, sizeX: size / glass.width, sizeY: size / glass.height };
  }

  /** How big a wipe is, on the screen: bigger with the lantern. */
  get wipeSize() {
    return WIPE_SIZE * this.height * (this.storm?.wipeScale ?? 1);
  }

  /** Treasure picked up, flying up to the count. */
  prizeFlies(prize) {
    const from = this.onScreen(prize);
    this.flying.push({ kind: prize.kind, fromX: from.x, fromY: from.y, t: 0 });
  }

  /** A crab that has let go of its pearl, waving and sliding off the glass. */
  crabLeaves(crab) {
    this.leaving.push({ ...crab, fall: 0 });
  }

  /** Mud that would have landed, bouncing off the bubble shield. */
  bounce({ x, y }) {
    this.bounces.push({ x, y, t: 0 });
  }

  /** A few little sparkles where a power-up was picked up. Not for anyone who prefers less motion. */
  sparkle(at, colour = '#fff3b0') {
    if (this.reducedMotion) return;
    const { x, y } = this.onScreen(at);
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * Math.PI * 2;
      this.sparkles.push({ x, y, vx: Math.cos(angle) * this.height * 0.1, vy: Math.sin(angle) * this.height * 0.1, life: 0.6, colour });
    }
  }

  /** The gull flies across the window at a height, as a share of it, wiping a wide stripe. */
  sendGull(y) {
    this.gull = { y, t: 0, last: null };
  }

  /**
   * Mud thrown back on by a wave, at a place given in shares of the window. It goes onto the mud at
   * once, so that what's on the screen is always what's left to wipe, with drops flying off it.
   */
  splat({ x, y, rx, ry }) {
    this.paintSplat({ x, y, rx, ry, seed: Math.random() * 6 });
    const { window: glass, height } = this;
    if (this.reducedMotion) return;
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * Math.PI * 2 + Math.random();
      this.drops.push({
        x: glass.x + x * glass.width,
        y: glass.y + y * glass.height,
        vx: Math.cos(angle) * height * 0.12,
        vy: Math.sin(angle) * height * 0.12,
        life: 0.5,
        size: height * (0.005 + Math.random() * 0.005),
      });
    }
  }

  paintSplat(splat) {
    if (!this.mud) return;
    const ctx = this.mud.getContext('2d');
    // The mud's own size, which is the window's when it was muddied.
    const cx = splat.x * this.mud.width;
    const cy = splat.y * this.mud.height;
    // A little wider than the cells it covers, so that nothing the rules count as muddy looks clean.
    const rx = splat.rx * this.mud.width * 1.08;
    const ry = splat.ry * this.mud.height * 1.08;
    ctx.fillStyle = '#6b4a2b';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5e3f24';
    for (let i = 0; i < 4; i += 1) {
      const angle = splat.seed + i * 1.7;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(angle) * rx * 0.62, cy + Math.sin(angle) * ry * 0.62, Math.min(rx, ry) * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * With friends: the mud gone from patches a friend's hand wiped, given as cells of the rules' grid,
   * columns across and rows down. Each comes off as a soft round wipe, right out to its corners, so
   * nothing the rules count as clean still looks muddy.
   */
  clearPatches(cells, columns, rows) {
    if (!this.mud || !cells.length) return;
    const ctx = this.mud.getContext('2d');
    const wide = this.mud.width / columns;
    const high = this.mud.height / rows;
    const reach = wide * PATCH_EDGE;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const soft = ctx.createRadialGradient(0, 0, 0, 0, 0, reach);
    soft.addColorStop(0, '#000');
    soft.addColorStop(PATCH_CLEAR / PATCH_EDGE, '#000');
    soft.addColorStop(1, 'rgb(0 0 0 / 0)');
    ctx.fillStyle = soft;
    for (const cell of cells) {
      ctx.setTransform(1, 0, 0, high / wide, ((cell % columns) + 0.5) * wide, (Math.floor(cell / columns) + 0.5) * high);
      ctx.beginPath();
      ctx.arc(0, 0, reach, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Seaweed or a starfish lets go of the glass, and slides off it into the sea. */
  dropLump(lump) {
    this.falling.push({ ...lump, fall: 0 });
  }

  /** The last of the mud slides away. */
  clearMud() {
    this.mudFading = true;
  }

  /** A boat, out at sea and lost. */
  setBoat(kind) {
    this.boat = { kind, share: 0 };
    this.beam = 0;
    this.sailing = 0;
  }

  /** The beam comes on and the boat sails in. */
  sailHome() {
    this.sailing = SAIL_SECONDS;
  }

  /**
   * One frame. wipe(x, y, sizeX, sizeY, moved, how) tells the rules about a wipe, and only comes in
   * play: without it, as during a hand check in the middle of a round, nothing wipes, and the gull
   * waits where it is, so the mud on the screen is always the mud the rules count.
   */
  update(dt, snapshot, { aspect = this.aspect, wiping = false, showHands = false, wipe = null } = {}) {
    this.time += dt;
    this.aspect = aspect;
    for (const side of ['left', 'right']) {
      const glove = this.gloves[side];
      if (showHands && snapshot?.side === side) glove.follow(snapshot[side], dt, this);
      else glove.hide();
    }
    this.shownCalm += (this.calm - this.shownCalm) * (1 - Math.exp(-dt * 0.8));

    const glove = this.gloves[this.side];
    let wipedNow = 0;
    if (wiping && wipe && this.mud && glove.visible && glove.status === 'open') wipedNow = this.wipeAt(glove, wipe);
    else this.last = null;
    this.wipeSpeed += (Math.min(1, wipedNow > 0 ? 1 : glove.speed * 1.5) * (glove.visible && glove.status === 'open' ? 1 : 0) - this.wipeSpeed) * (1 - Math.exp(-dt * 10));

    for (const drop of this.drops) {
      drop.life -= dt;
      drop.x += (drop.vx ?? 0) * dt;
      drop.y += drop.vy * dt;
    }
    for (const lump of this.falling) lump.fall += dt / FALL_SECONDS;
    this.falling = this.falling.filter(({ fall }) => fall < 1);
    this.drops = this.drops.filter(({ life }) => life > 0);
    for (const crab of this.leaving) crab.fall += dt / FALL_SECONDS;
    this.leaving = this.leaving.filter(({ fall }) => fall < 1);
    for (const flier of this.flying) flier.t += dt / FLY_SECONDS;
    this.flying = this.flying.filter(({ t }) => t < 1);
    for (const bounce of this.bounces) bounce.t += dt / BOUNCE_SECONDS;
    this.bounces = this.bounces.filter(({ t }) => t < 1);
    for (const sparkle of this.sparkles) {
      sparkle.life -= dt;
      sparkle.x += sparkle.vx * dt;
      sparkle.y += sparkle.vy * dt;
    }
    this.sparkles = this.sparkles.filter(({ life }) => life > 0);
    if (this.gull && wipe) this.flyGull(dt, wipe);
    this.labels = stepLabels(this.labels, dt, this.fresh, this.introduced);

    if (this.mudFading) {
      this.mudLeft = Math.max(0, this.mudLeft - dt * (this.night ? NIGHT_MUD_FADE : MUD_FADE));
      if (this.mudLeft === 0) {
        this.mudFading = false;
        this.mud = null;
      }
    }
    if (this.sailing > 0) {
      this.sailing = Math.max(0, this.sailing - dt);
      this.beam = Math.min(1, this.beam + dt / (this.night ? NIGHT_BEAM_SECONDS : BEAM_SECONDS));
      if (this.boat) this.boat.share = 1 - this.sailing / SAIL_SECONDS;
      if (this.sailing === 0) this.events.onSailed?.();
    } else if (this.beam > 0 && !this.boat) {
      this.beam = Math.max(0, this.beam - dt);
    }
  }

  /** Takes mud off along the way the hand has gone, and tells the rules how much of the window. */
  wipeAt(glove, wipe) {
    const { window: glass, ratio, height } = this;
    const x = glove.x - glass.x;
    const y = glove.y - glass.y;
    const inside = x > -height * 0.1 && x < glass.width + height * 0.1 && y > -height * 0.1 && y < glass.height + height * 0.1;
    if (!inside) {
      this.last = null;
      return 0;
    }
    // Rubbing goes by how far the hand moved in lengths of an ordinary wipe, so the lantern's bigger
    // wipe rubs seaweed and starfish off as quickly as ever, and reaches them from further away.
    const added = this.wipeLine(this.last ?? { x, y }, { x, y }, this.wipeSize, wipe, WIPE_SIZE * height);
    this.last = { x, y };
    if (added) this.addDrips(glove);
    return added;
  }

  /**
   * Takes the mud off from one place on the glass to another, in pixels from its corner. rubLength
   * is how far counts as one length of a wipe, for rubbing.
   */
  wipeLine(from, { x, y }, size, wipe, rubLength = size) {
    const { window: glass, ratio } = this;
    if (!this.mud) return 0;
    const ctx = this.mud.getContext('2d');
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineCap = 'round';
    ctx.lineWidth = size * 2 * ratio;
    ctx.beginPath();
    ctx.moveTo(from.x * ratio, from.y * ratio);
    ctx.lineTo(x * ratio + 0.01, y * ratio);
    ctx.stroke();
    ctx.restore();

    // Along the way too, as a quick hand can go a long way between pictures. How far it went, in
    // lengths of a wipe, is what rubs seaweed and starfish off.
    let added = 0;
    const distance = Math.hypot(x - from.x, y - from.y);
    const steps = Math.max(1, Math.ceil(distance / (size * 0.5)));
    for (let i = 1; i <= steps; i += 1) {
      const px = from.x + ((x - from.x) * i) / steps;
      const py = from.y + ((y - from.y) * i) / steps;
      added += wipe(px / glass.width, py / glass.height, size / glass.width, size / glass.height, distance / rubLength / steps);
    }
    return added;
  }

  /**
   * The gull, across the window from the far side, wiping as it goes. It doesn't rub anything off,
   * and it isn't the hand, so what the storm throws still lands away from the hand.
   */
  flyGull(dt, wipe) {
    const { gull, window: glass, side } = this;
    gull.t = Math.min(1, gull.t + dt / GULL_SECONDS);
    const share = side === 'right' ? 1.05 - gull.t * 1.1 : -0.05 + gull.t * 1.1;
    const at = { x: share * glass.width, y: gull.y * glass.height + Math.sin(gull.t * Math.PI * 2) * glass.height * 0.03 };
    if (this.mud && !this.mudFading) this.wipeLine(gull.last ?? at, at, GULL_WIPE * this.height, (x, y, sizeX, sizeY) => wipe(x, y, sizeX, sizeY, 0, { byHand: false }));
    gull.last = at;
    gull.x = at.x;
    gull.yNow = at.y;
    if (gull.t >= 1) this.gull = null;
  }

  addDrips(glove) {
    if (this.drops.length > 30 || this.reducedMotion) return;
    this.drops.push({ x: glove.x + (Math.random() - 0.5) * this.palmSize, y: glove.y, vy: this.height * 0.2, life: 0.7, size: this.height * (0.004 + Math.random() * 0.006) });
  }

  drawSea(ctx) {
    const { window: glass, height, time } = this;
    const calm = this.shownCalm;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(glass.x, glass.y, glass.width, glass.height, 22);
    ctx.clip();
    const sky = ctx.createLinearGradient(0, glass.y, 0, glass.y + glass.height);
    // At night, the storm clears to a moonlit sky rather than a sunny one.
    const night = this.night;
    sky.addColorStop(0, night ? mixColours('#1b2a4e', '#35589a', calm) : mixColours('#27384f', '#8fd2fa', calm));
    sky.addColorStop(0.62, night ? mixColours('#34466d', '#8193c4', calm) : mixColours('#3c536b', '#ffe1b0', calm));
    ctx.fillStyle = sky;
    ctx.fillRect(glass.x, glass.y, glass.width, glass.height);
    if (night) this.drawMoon(ctx);

    const seaTop = glass.y + glass.height * 0.62;
    const wave = (colour, base, size, rate, length) => {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.moveTo(glass.x, glass.y + glass.height);
      const swell = this.reducedMotion ? 0.4 : this.swell;
      for (let x = 0; x <= glass.width; x += 14) {
        const height2 = Math.sin(x / length + time * rate) * size * swell * (1 - calm * 0.65);
        ctx.lineTo(glass.x + x, base + height2);
      }
      ctx.lineTo(glass.x + glass.width, glass.y + glass.height);
      ctx.closePath();
      ctx.fill();
    };
    const sea = this.night ? [['#1a3550', '#2f6596'], ['#142c45', '#265887'], ['#0f2238', '#1f4c78']] : [['#23435f', '#3d9ad9'], ['#1b3650', '#2b86c7'], ['#142a40', '#2373ad']];
    wave(mixColours(...sea[0], calm), seaTop, height * 0.016, 0.9, 110);
    this.drawBoat(ctx, seaTop);
    wave(mixColours(...sea[1], calm), seaTop + height * 0.08, height * 0.02, 1.2, 80);
    wave(mixColours(...sea[2], calm), seaTop + height * 0.17, height * 0.024, 1.5, 60);
    ctx.restore();
  }

  /** The moon and stars, from the night levels. They stay still and steady. */
  drawMoon(ctx) {
    const { window: glass, height, side } = this;
    ctx.fillStyle = 'rgb(255 250 225 / 0.75)';
    for (const star of STARS) {
      ctx.beginPath();
      ctx.arc(glass.x + star.x * glass.width, glass.y + star.y * glass.height * 0.9, star.r * Math.max(1, height * 0.0018), 0, Math.PI * 2);
      ctx.fill();
    }
    const x = glass.x + glass.width * (side === 'right' ? 0.84 : 0.16);
    const y = glass.y + glass.height * 0.16;
    const r = height * 0.055;
    const glow = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 2.4);
    glow.addColorStop(0, 'rgb(255 244 200 / 0.25)');
    glow.addColorStop(1, 'rgb(255 244 200 / 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    // A friendly face, as the moon is watching the ships come home.
    ctx.fillStyle = 'rgb(18 48 77 / 0.55)';
    for (const way of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(x + way * r * 0.32, y - r * 0.12, r * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgb(18 48 77 / 0.55)';
    ctx.lineWidth = Math.max(1.5, r * 0.08);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y + r * 0.08, r * 0.32, 0.4, Math.PI - 0.4);
    ctx.stroke();
  }

  drawBoat(ctx, seaTop) {
    if (!this.boat) return;
    const { window: glass, height, time, boat, side } = this;
    // It comes in towards the hand's side of the window, and gets bigger as it does.
    const share = boat.share * boat.share * (3 - 2 * boat.share);
    const near = 0.34 + share * 0.86;
    const direction = side === 'right' ? 1 : -1;
    const start = side === 'right' ? 0.22 : 0.78;
    const x = glass.x + glass.width * (start + direction * share * 0.5);
    const y = seaTop + Math.sin(time * 1.3) * height * 0.012 * (this.reducedMotion ? 0.3 : 1);
    const size = height * 0.13 * near;
    ctx.save();
    ctx.translate(x, y);
    if (!this.reducedMotion) ctx.rotate(Math.sin(time * 1.1) * 0.05);
    ctx.fillStyle = BOAT_COLOURS[boat.kind];
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, height * 0.004);
    ctx.beginPath();
    ctx.moveTo(-size, -size * 0.1);
    ctx.lineTo(size, -size * 0.1);
    ctx.lineTo(size * 0.72, size * 0.34);
    ctx.lineTo(-size * 0.72, size * 0.34);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.1);
    ctx.lineTo(0, -size);
    ctx.stroke();
    ctx.fillStyle = '#fff4e0';
    ctx.beginPath();
    ctx.moveTo(size * 0.05, -size * 0.92);
    ctx.lineTo(size * 0.62, -size * 0.2);
    ctx.lineTo(size * 0.05, -size * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Its little lantern, for finding it in the dark.
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(-size * 0.5, -size * 0.28, size * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Seaweed and starfish, on the glass or sliding off it, over the mud. */
  drawLumps(ctx) {
    if (!this.lumps.length && !this.falling.length) return;
    const { window: glass } = this;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(glass.x, glass.y, glass.width, glass.height, 22);
    ctx.clip();
    for (const lump of this.lumps) this.drawLump(ctx, lump, Math.min(1, lump.rubbed / lump.needs), 0);
    for (const lump of this.falling) this.drawLump(ctx, lump, 1, lump.fall);
    ctx.restore();
  }

  /** loose is how far it's been rubbed off, and fall how far it is on its way down. */
  drawLump(ctx, lump, loose, fall) {
    const { window: glass, height, time } = this;
    const size = height * 0.085;
    const x = glass.x + lump.x * glass.width;
    const y = glass.y + lump.y * glass.height + fall * fall * height * 0.5;
    // The more it's been rubbed, the more it wobbles, to show it's coming loose. Slowly, though.
    const wobble = this.reducedMotion ? 0 : Math.sin(time * 5 + lump.x * 20) * 0.18 * loose;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = (1 - fall) * (1 - loose * 0.35);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (lump.kind === 'clam' || lump.kind === 'chest') {
      // These open slowly as the hand stays on them, rather than wobbling loose.
      ctx.globalAlpha = 1 - fall;
      if (lump.kind === 'clam') drawOyster(ctx, size, loose, height);
      else drawChest(ctx, size * 1.35, loose, height);
      if (fall === 0) drawProgress(ctx, size * (lump.kind === 'chest' ? 1.7 : 1.3), loose, height);
    } else if (lump.kind === 'star') {
      ctx.rotate(Math.sin(lump.heading) * 0.25 + wobble + fall * 2);
      ctx.beginPath();
      for (let i = 0; i < 10; i += 1) {
        const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const reach = i % 2 ? size * 0.42 : size;
        ctx.lineTo(Math.cos(angle) * reach, Math.sin(angle) * reach);
      }
      ctx.closePath();
      ctx.fillStyle = '#ff8a5c';
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(2, height * 0.004);
      ctx.stroke();
      ctx.fillStyle = '#ffd0a8';
      for (let i = 0; i < 5; i += 1) {
        const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * size * 0.62, Math.sin(angle) * size * 0.62, size * 0.07, 0, Math.PI * 2);
        ctx.fill();
      }
      // A friendly face, as it's only visiting.
      ctx.fillStyle = INK;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(side * size * 0.15, -size * 0.08, size * 0.065, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.lineWidth = Math.max(1.5, height * 0.0035);
      ctx.beginPath();
      ctx.arc(0, size * 0.02, size * 0.14, 0.3, Math.PI - 0.3);
      ctx.stroke();
    } else {
      ctx.rotate(wobble);
      // A tangle of seaweed, its fronds hanging down the glass every which way.
      const fronds = [[-0.55, -0.35, 0.95, -1], [-0.2, -0.6, 1.15, 1], [0.15, -0.5, 0.85, -1], [0.5, -0.3, 1.05, 1], [-0.05, -0.15, 0.7, 1], [0.35, 0.05, 0.6, -1]];
      const frond = ([dx, dy, length, curl]) => {
        ctx.beginPath();
        ctx.moveTo(dx * size, dy * size);
        ctx.bezierCurveTo((dx + curl * 0.35) * size, (dy + length * 0.35) * size, (dx - curl * 0.3) * size, (dy + length * 0.7) * size, (dx + curl * 0.12) * size, (dy + length) * size);
        ctx.stroke();
      };
      ctx.strokeStyle = INK;
      ctx.lineWidth = size * 0.3;
      fronds.forEach(frond);
      fronds.forEach((one, i) => {
        ctx.strokeStyle = ['#3f9d4a', '#5cb85c', '#2f8a43'][i % 3];
        ctx.lineWidth = size * 0.21;
        frond(one);
      });
      // Little bladders along them, as real seaweed has.
      ctx.fillStyle = '#7fcf6a';
      for (const [dx, dy, length] of fronds) {
        ctx.beginPath();
        ctx.arc(dx * size, (dy + length * 0.5) * size, size * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawBeam(ctx) {
    if (this.beam <= 0) return;
    const { window: glass, height, side } = this;
    const fromX = side === 'right' ? glass.x : glass.x + glass.width;
    const fromY = glass.y + height * 0.08;
    const way = side === 'right' ? 1 : -1;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(glass.x, glass.y, glass.width, glass.height, 22);
    ctx.clip();
    const gradient = ctx.createLinearGradient(fromX, 0, fromX + way * glass.width, 0);
    gradient.addColorStop(0, `rgb(255 233 150 / ${0.75 * this.beam})`);
    gradient.addColorStop(1, 'rgb(255 233 150 / 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(fromX + way * glass.width * 1.1, glass.y + glass.height * 0.46);
    ctx.lineTo(fromX + way * glass.width * 1.1, glass.y + glass.height * 0.86);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  render() {
    // A seat's game going under the one picture two share on one screen, or coming back out, is laid out again.
    if (pictureChanged(this)) this.resize();
    const { ctx, width, height, ratio, window: glass } = this;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    // The room around the window, warm against the night outside.
    ctx.fillStyle = '#4a3a33';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#5a463d';
    for (let y = 0; y < height; y += height * 0.09) ctx.fillRect(0, y, width, height * 0.004);

    this.drawSea(ctx);
    this.drawBeam(ctx);

    if (this.mud) {
      ctx.globalAlpha = this.mudLeft;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(glass.x, glass.y, glass.width, glass.height, 22);
      ctx.clip();
      ctx.drawImage(this.mud, glass.x, glass.y, glass.width, glass.height);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    this.drawLumps(ctx);
    this.drawOnGlass(ctx);

    ctx.strokeStyle = '#e7dcc4';
    ctx.lineWidth = height * 0.018;
    ctx.beginPath();
    ctx.roundRect(glass.x, glass.y, glass.width, glass.height, 22);
    ctx.stroke();
    ctx.lineWidth = height * 0.006;
    ctx.strokeStyle = 'rgb(231 220 196 / 0.8)';
    ctx.beginPath();
    ctx.moveTo(glass.x + glass.width / 2, glass.y);
    ctx.lineTo(glass.x + glass.width / 2, glass.y + glass.height);
    ctx.moveTo(glass.x, glass.y + glass.height / 2);
    ctx.lineTo(glass.x + glass.width, glass.y + glass.height / 2);
    ctx.stroke();

    ctx.fillStyle = '#4f3620';
    for (const drop of this.drops) {
      ctx.globalAlpha = clamp(drop.life / 0.3, 0, 1);
      ctx.beginPath();
      ctx.arc(drop.x, drop.y, drop.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    this.drawShield(ctx);
    this.drawGull(ctx);
    this.drawLanternGlow(ctx);
    // A friend's glove goes under the child's own, but the second player's in one picture goes over the first's.
    const over = inOnePicture();
    if (!over) this.drawFriendsGloves(ctx);
    this.gloves.left.draw(ctx, this.palmSize);
    this.gloves.right.draw(ctx, this.palmSize);
    if (over) this.drawFriendsGloves(ctx);
    this.drawFlying(ctx);
    this.drawLabels(ctx);
  }

  /**
   * Friends' gloves, wiping on their own computers, where their hands are on their own windows, in light
   * grey under the child's own, with each friend's name over theirs. They're only there to see: the mud
   * a friend wipes comes off as the server says it was theirs, with clearPatches. Two playing in one picture on one
   * screen, the friend is the second player, right there playing too, so theirs is in their own blue.
   */
  drawFriendsGloves(ctx) {
    const { palmSize, height } = this;
    const second = inOnePicture();
    for (const { glove, name, fade } of this.friendGloves) {
      if (!glove.visible || fade < 0.02) continue;
      // Solid, as a see-through one shows its outline through itself, and only fading as it comes and goes.
      glove.draw(ctx, palmSize, second ? secondPlayerLook(glove, fade) : { ...FRIEND_GLOVE, alpha: fade });
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.font = `700 ${Math.round(palmSize * 0.32)}px Fredoka, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      // Over the glove, or under it near the top, where the camera's picture is.
      const above = glove.y - palmSize * 1.55;
      const y = above - palmSize * 0.42 < height * 0.24 ? glove.y + palmSize * 1.2 : above;
      const wide = ctx.measureText(name).width + palmSize * 0.4;
      ctx.fillStyle = second ? SECOND_PLAYER.tag : 'rgb(18 48 77 / 0.72)';
      ctx.beginPath();
      ctx.roundRect(glove.x - wide / 2, y - palmSize * 0.42, wide, palmSize * 0.48, palmSize * 0.24);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(name, glove.x, y);
      ctx.restore();
    }
  }

  /**
   * Treasure, crabs and power-ups on the glass, over the mud. They go with the last of it, apart from
   * crabs walking off, which take their own time.
   */
  drawOnGlass(ctx) {
    const { storm } = this;
    if (!storm || (!this.mud && !this.leaving.length)) return;
    const { window: glass, height, time } = this;
    const bob = this.reducedMotion ? 0 : 1;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(glass.x, glass.y, glass.width, glass.height, 22);
    ctx.clip();
    if (this.mud) {
      ctx.globalAlpha = this.mudLeft;
      for (const power of storm.powers) {
        const { x, y } = this.onScreen(power);
        const grow = Math.min(1, power.age / 0.5);
        drawPower(ctx, power.kind, x, y + Math.sin(time * 1.6 + power.x * 9) * height * 0.006 * bob, height * 0.05 * grow, height);
      }
      for (const prize of storm.prizes) {
        if (prize.hidden) continue;
        const { x, y } = this.onScreen(prize);
        const grow = Math.min(1, prize.age / PRIZE_READY_SECONDS);
        const size = height * PRIZE_SHARE * (0.4 + 0.6 * grow * (2 - grow));
        const sprite = this.sprites[prize.kind];
        ctx.drawImage(sprite, x - size, y - size + Math.sin(time * 2 + prize.x * 7) * height * 0.004 * bob, size * 2, size * 2);
      }
      for (const crab of storm.crabs) this.drawCrab(ctx, crab, 0, true);
    }
    ctx.globalAlpha = 1;
    for (const crab of this.leaving) this.drawCrab(ctx, crab, crab.fall, false);
    ctx.restore();
  }

  /** A little round crab, walking sideways, with a pearl held up in its claws. */
  drawCrab(ctx, crab, fall, withPearl) {
    const { height, time } = this;
    const { x, y } = this.onScreen(crab);
    const size = height * 0.045;
    // Its legs patter about one and a half times a second, and more slowly for less motion.
    const step = Math.sin(time * Math.PI * 2 * (this.reducedMotion ? 0.6 : 1.4) + crab.y * 10);
    ctx.save();
    ctx.translate(x, y + fall * fall * height * 0.45);
    ctx.globalAlpha *= 1 - fall;
    ctx.strokeStyle = INK;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(2, size * 0.14);
    for (const way of [-1, 1]) {
      for (let leg = 0; leg < 3; leg += 1) {
        const lift = (leg % 2 ? step : -step) * size * 0.12;
        ctx.beginPath();
        ctx.moveTo(way * size * 0.7, size * (0.05 + leg * 0.18));
        ctx.lineTo(way * size * 1.25, size * (0.3 + leg * 0.22) + lift);
        ctx.stroke();
      }
    }
    // Claws up, holding the pearl, or waving goodbye.
    const wave = fall > 0 ? Math.sin(time * 6) * 0.3 : 0;
    for (const way of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(way * size * 0.55, -size * 0.3);
      ctx.lineTo(way * size * 0.75, -size * (0.85 + wave * way));
      ctx.stroke();
      ctx.fillStyle = '#ff6f4f';
      ctx.beginPath();
      ctx.arc(way * size * 0.75, -size * (0.95 + wave * way), size * 0.24, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#ff6f4f';
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.85, size * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffb199';
    ctx.beginPath();
    ctx.ellipse(-size * 0.25, -size * 0.2, size * 0.22, size * 0.12, -0.4, 0, Math.PI * 2);
    ctx.fill();
    // Eyes on stalks, and a smile.
    for (const way of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(way * size * 0.22, -size * 0.45);
      ctx.lineTo(way * size * 0.26, -size * 0.75);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(way * size * 0.26, -size * 0.8, size * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(way * size * 0.26 + crab.heading * size * 0.04, -size * 0.8, size * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, -size * 0.05, size * 0.22, 0.3, Math.PI - 0.3);
    ctx.stroke();
    if (withPearl) ctx.drawImage(this.sprites.pearl, -size * 0.55, -size * 1.65, size * 1.1, size * 1.1);
    ctx.restore();
  }

  /** The bubble shield, round the window, while it lasts, and mud bouncing off it. */
  drawShield(ctx) {
    const { storm, window: glass, height } = this;
    const left = storm?.active.bubble ?? 0;
    if (left > 0 && this.mud) {
      const fade = Math.min(1, left / 1.5);
      ctx.save();
      ctx.globalAlpha = fade * this.mudLeft;
      ctx.strokeStyle = 'rgb(160 225 255 / 0.55)';
      ctx.lineWidth = height * 0.012;
      ctx.beginPath();
      ctx.roundRect(glass.x + height * 0.02, glass.y + height * 0.02, glass.width - height * 0.04, glass.height - height * 0.04, 30);
      ctx.stroke();
      // Its badge at the bottom of the window, clear of the camera's picture at the top.
      const badge = this.badgeAt('bubble');
      drawPower(ctx, 'bubble', badge.x, badge.y, height * 0.032, height);
      drawProgress(ctx, height * 0.042, left / POWER_SECONDS.bubble, height, badge.x, badge.y);
      ctx.restore();
    }
    for (const bounce of this.bounces) {
      const { x, y } = this.onScreen(bounce);
      // In towards the glass, then off it again, shrinking away.
      const going = bounce.t < 0.4 ? bounce.t / 0.4 : 1 - (bounce.t - 0.4) / 0.6;
      const size = height * 0.05 * (bounce.t < 0.4 ? 1 : 1 - (bounce.t - 0.4) * 1.2);
      ctx.globalAlpha = Math.min(1, (1 - bounce.t) * 2);
      ctx.fillStyle = '#6b4a2b';
      ctx.beginPath();
      ctx.arc(x + (1 - going) * height * 0.12, y - (1 - going) * height * 0.12, Math.max(1, size), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /** The warm glow round the hand, showing its bigger wipe, while the lantern lasts. */
  drawLanternGlow(ctx) {
    const left = this.storm?.active.lantern ?? 0;
    const glove = this.gloves[this.side];
    if (left <= 0 || !this.mud) return;
    const { height } = this;
    ctx.save();
    ctx.globalAlpha = Math.min(1, left / 1.2);
    if (glove.visible) {
      // A thin ring and only a faint fill, as it goes wherever the hand goes, however quickly.
      ctx.fillStyle = 'rgb(255 214 110 / 0.08)';
      ctx.strokeStyle = 'rgb(255 205 90 / 0.6)';
      ctx.lineWidth = height * 0.005;
      ctx.beginPath();
      ctx.arc(glove.x, glove.y, this.wipeSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // Its badge stays still at the bottom of the window, beside the bubble shield's, if that's on.
    const badge = this.badgeAt('lantern');
    drawPower(ctx, 'lantern', badge.x, badge.y, height * 0.03, height);
    drawProgress(ctx, height * 0.04, left / POWER_SECONDS.lantern, height, badge.x, badge.y);
    ctx.restore();
  }

  drawGull(ctx) {
    const { gull, window: glass, height } = this;
    if (!gull || gull.x === undefined) return;
    const flap = Math.sin(this.time * Math.PI * 2 * (this.reducedMotion ? 0.7 : 1.5));
    const way = this.side === 'right' ? -1 : 1;
    drawGullShape(ctx, glass.x + gull.x, glass.y + gull.yNow, height * 0.08, flap, way, height);
  }

  /** Treasure on its way up to the count, getting smaller. */
  drawFlying(ctx) {
    const { height } = this;
    for (const flier of this.flying) {
      const ease = flier.t * flier.t * (3 - 2 * flier.t);
      const x = flier.fromX + (this.tallyAt.x - flier.fromX) * ease;
      const y = flier.fromY + (this.tallyAt.y - flier.fromY) * ease - Math.sin(flier.t * Math.PI) * height * 0.08;
      const size = height * PRIZE_SHARE * (1.1 - ease * 0.5);
      ctx.drawImage(this.sprites[flier.kind], x - size, y - size, size * 2, size * 2);
    }
    ctx.fillStyle = '#fff3b0';
    for (const sparkle of this.sparkles) {
      ctx.globalAlpha = Math.min(1, sparkle.life / 0.3);
      ctx.fillStyle = sparkle.colour;
      ctx.beginPath();
      ctx.arc(sparkle.x, sparkle.y, height * 0.006, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** The name of a new thing, fading in above it, with a soft ring round it. */
  drawLabels(ctx) {
    const [label] = this.labels;
    if (label?.started) drawLabel(ctx, label, this.labelText(label), label.at(), this.width, this.height, LABEL_SECONDS);
  }
}

/** Shells, pearls and coins, drawn once each. */
function paintPrize(kind) {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.translate(48, 48);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  if (kind === 'shell') {
    // A scallop: a fan with ribs, pink and cream.
    ctx.fillStyle = '#ffb3c7';
    ctx.beginPath();
    ctx.moveTo(0, 30);
    ctx.lineTo(-36, -4);
    ctx.quadraticCurveTo(-30, -36, 0, -38);
    ctx.quadraticCurveTo(30, -36, 36, -4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#ffe3ea';
    ctx.lineWidth = 3;
    for (const angle of [-0.9, -0.45, 0, 0.45, 0.9]) {
      ctx.beginPath();
      ctx.moveTo(0, 26);
      ctx.lineTo(Math.sin(angle) * 32, 26 - Math.cos(angle) * 58);
      ctx.stroke();
    }
    ctx.fillStyle = '#ff8fab';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(-11, 26, 22, 12, 4);
    ctx.fill();
    ctx.stroke();
  } else if (kind === 'pearl') {
    const shade = ctx.createRadialGradient(-10, -12, 4, 0, 0, 34);
    shade.addColorStop(0, '#ffffff');
    shade.addColorStop(0.6, '#efe9ff');
    shade.addColorStop(1, '#c9bdf0');
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(0, 0, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(0, 0, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#e09a1a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#f2a516';
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const reach = i % 2 ? 7 : 16;
      ctx.lineTo(Math.cos(angle) * reach, Math.sin(angle) * reach);
    }
    ctx.closePath();
    ctx.fill();
  }
  return canvas;
}

/** A power-up: a little picture on a soft round badge, with a gentle glow round it. */
function drawPower(ctx, kind, x, y, r, height) {
  if (r <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  const glow = ctx.createRadialGradient(0, 0, r * 0.9, 0, 0, r * 1.7);
  glow.addColorStop(0, 'rgb(255 245 190 / 0.45)');
  glow.addColorStop(1, 'rgb(255 245 190 / 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fffaf0';
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(2, height * 0.004);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = Math.max(1.5, height * 0.003);
  if (kind === 'lantern') {
    ctx.beginPath();
    ctx.arc(0, -r * 0.42, r * 0.22, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = '#ff9a3c';
    ctx.beginPath();
    ctx.roundRect(-r * 0.36, -r * 0.42, r * 0.72, r * 0.86, r * 0.18);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff1a8';
    ctx.beginPath();
    ctx.roundRect(-r * 0.2, -r * 0.26, r * 0.4, r * 0.54, r * 0.1);
    ctx.fill();
  } else if (kind === 'bubble') {
    ctx.fillStyle = 'rgb(150 215 255 / 0.55)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(-r * 0.2, -r * 0.22, r * 0.14, r * 0.09, -0.6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    drawGullShape(ctx, 0, r * 0.05, r * 0.62, 0.4, 1, height);
  }
  ctx.restore();
}

/** A friendly white gull, wings up or down by flap, from -1 to 1, facing way. */
function drawGullShape(ctx, x, y, size, flap, way, height) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(way, 1);
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1.5, height * 0.0035);
  ctx.lineJoin = 'round';
  ctx.fillStyle = '#d6dde6';
  for (const back of [1, -1]) {
    ctx.beginPath();
    ctx.moveTo(-size * 0.1, -size * 0.05);
    ctx.quadraticCurveTo(-size * 0.3, -size * (0.2 + flap * 0.5) * back - size * 0.2, -size * 0.8, -size * flap * 0.6 * back - size * 0.1);
    ctx.quadraticCurveTo(-size * 0.4, size * 0.05, -size * 0.1, size * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.6, size * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(size * 0.48, -size * 0.18, size * 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffa53c';
  ctx.beginPath();
  ctx.moveTo(size * 0.68, -size * 0.2);
  ctx.lineTo(size * 0.95, -size * 0.12);
  ctx.lineTo(size * 0.68, -size * 0.06);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(size * 0.54, -size * 0.24, size * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** An oyster, opening as open goes from 0 to 1, with its pearl inside. */
function drawOyster(ctx, size, open, height) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(2, height * 0.004);
  ctx.fillStyle = '#b9a6d9';
  ctx.beginPath();
  ctx.ellipse(0, size * 0.15, size * 0.85, size * 0.45, 0, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (open > 0.15) {
    const r = size * 0.28;
    const shade = ctx.createRadialGradient(-r * 0.3, size * 0.05 - r * 0.3, 1, 0, size * 0.05, r);
    shade.addColorStop(0, '#ffffff');
    shade.addColorStop(1, '#d9cff5');
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(0, size * 0.05, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(-size * 0.85, size * 0.15);
  ctx.rotate(-open * 0.9);
  ctx.fillStyle = '#9d86c9';
  ctx.beginPath();
  ctx.ellipse(size * 0.85, 0, size * 0.85, size * 0.5, 0, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#c8b8e8';
  for (const dx of [0.45, 0.85, 1.25]) {
    ctx.beginPath();
    ctx.moveTo(size * dx, -size * 0.05);
    ctx.lineTo(size * (0.85 + (dx - 0.85) * 1.3), -size * 0.42);
    ctx.stroke();
  }
  ctx.restore();
}

/** A treasure chest, its lid lifting as open goes from 0 to 1, with coins inside. */
function drawChest(ctx, size, open, height) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(2, height * 0.004);
  ctx.fillStyle = '#b8743a';
  ctx.beginPath();
  ctx.roundRect(-size * 0.75, -size * 0.1, size * 1.5, size * 0.75, size * 0.1);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffd23f';
  for (const dx of [-0.5, 0.5]) {
    ctx.beginPath();
    ctx.rect(size * dx - size * 0.07, -size * 0.1, size * 0.14, size * 0.75);
    ctx.fill();
    ctx.stroke();
  }
  if (open > 0.15) {
    ctx.fillStyle = '#ffd23f';
    for (const dx of [-0.4, -0.1, 0.2, 0.45]) {
      ctx.beginPath();
      ctx.arc(size * dx, -size * 0.12, size * 0.14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.save();
  ctx.translate(-size * 0.75, -size * 0.1);
  ctx.rotate(-open * 1.1);
  ctx.fillStyle = '#c9843f';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -size * 0.25);
  ctx.quadraticCurveTo(size * 0.75, -size * 0.6, size * 1.5, -size * 0.25);
  ctx.lineTo(size * 1.5, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.roundRect(size * 0.65, -size * 0.12, size * 0.2, size * 0.22, size * 0.04);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** A ring filling slowly round something, as a hand held open on it opens it. */
function drawProgress(ctx, r, share, height, x = 0, y = 0) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(3, height * 0.007);
  ctx.strokeStyle = 'rgb(255 255 255 / 0.45)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  if (share > 0) {
    ctx.strokeStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, share));
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * One name at a time, so they never pile up. A name only starts once its thing can be seen, and only
 * then counts as shown, in shown. What's new at this level goes first, and waits for as long as it
 * takes. An older one that's waited a while is let go, to come again with the next of its kind.
 */
function stepLabels(labels, dt, fresh, shown) {
  if (labels.length && !labels[0].started) {
    const ready = labels.filter((label) => label.at() !== null);
    const next = ready.find((label) => fresh.has(label.key)) ?? ready[0];
    if (next) {
      const { x, y } = next.at();
      Object.assign(next, { started: true, last: { x, y } });
      shown.add(next.key);
      labels = [next, ...labels.filter((label) => label !== next)];
    }
  }
  for (const label of labels) {
    if (label.started) label.t += dt;
    else label.wait = (label.wait ?? 0) + dt;
  }
  return labels.filter((label) => (label.started ? label.t < LABEL_SECONDS : fresh.has(label.key) || label.wait < LABEL_WAIT));
}

/** A new thing's name in a little rounded box above it, fading in and out, with a soft ring. */
function drawLabel(ctx, label, text, now, width, height, lasts) {
  // Where its thing is, or was last, if it's just gone. The ring follows it, and the name stays
  // where it first came, so nothing bright moves quickly.
  const at = now ?? label.last;
  if (!at) return;
  label.last = { x: at.x, y: at.y };
  label.home ??= { x: at.x, y: at.y };
  const fade = Math.min(1, label.t / 0.4, (lasts - label.t) / 0.6);
  if (fade <= 0) return;
  const font = Math.round(height * 0.03);
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.strokeStyle = 'rgb(255 236 150 / 0.9)';
  ctx.lineWidth = Math.max(3, height * 0.006);
  ctx.beginPath();
  ctx.arc(at.x, at.y, height * (0.075 + 0.01 * Math.min(1, label.t)), 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = `600 ${font}px Fredoka, system-ui, sans-serif`;
  const wide = ctx.measureText(text).width + font * 1.2;
  const x = Math.min(width - wide / 2 - 8, Math.max(wide / 2 + 8, label.home.x));
  // Above its thing, or below it near the top, where the camera's picture is.
  const above = label.home.y - height * 0.12 - Math.min(1, label.t) * height * 0.01;
  const y = above < height * 0.24 ? label.home.y + height * 0.12 : above;
  ctx.fillStyle = '#fffaf0';
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(2, height * 0.004);
  ctx.beginPath();
  ctx.roundRect(x - wide / 2, y - font * 0.85, wide, font * 1.7, font * 0.85);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + font * 0.05);
  ctx.restore();
}
