// What Giraffe's World Tour looks like: the globe with the countries lit to choose from, Giraffe's plane flying
// from one to the next, the flag on its board with its pots of paint, and the pole it goes up. The rules are in
// tour.js: this draws what they say, and tells main.js what's under the hand.
import { INK } from '../../core/glove.js';
import { apart, between } from './globe.js';
import { trace } from './shapes.js';
import { TOUR } from './tour.js';

const RAD = Math.PI / 180;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const lerp = (from, to, share) => from + (to - from) * share;
const smooth = (share) => share * share * (3 - 2 * share);

const SKY = ['#bfe6ff', '#eef9ff'];
const LOOK = { sea: '#8fd0f5', seaEdge: '#3f8fd0', land: '#cfe8b5', border: '#8fb27a', dimmed: '#f3e3a6' };
// The colours the countries to choose from are lit in. None is a flag's, so the colour gives nothing away.
const LIT = ['#ffb347', '#ff8fb1', '#b79bff', '#5fd3c4', '#ffe066'];
const OUT = '#c8ced6'; // One that was chosen wrongly.
const WOOD = '#c99a66';
const PAPER = '#f4f6f9';
const HATCH = '#dde4ec';
const GOLD = '#ffb703';
const OTHER_GLOVE = { fill: '#8fc7ff', ink: INK };

// Where things are, as shares of the screen's height unless it says otherwise.
const GLOBE = { y: 0.55, radius: 0.4, widest: 0.36 }; // widest is a share of the width.
const BOARD = { top: 0.2, high: 0.48, widest: 0.56, frame: 0.014 };
const POTS = { below: 0.115, radius: 0.056, gap: 0.165, dip: 1.25 };
const HOLD = { radius: 0.07, reach: 0.17, y: 0.77, in: 0.36 };
// With the flag held, the board is nearer the hand that paints, by up to this share of the width, so the two
// hands are well apart: hands that touch in the camera's picture can't be told apart, and count as closed.
const SHIFT = 0.09;
// The pole, and how far the hand has to go to raise the flag: from low down to high up, a good reach.
const POLE = { top: 0.17, bottom: 0.9, flag: 0.24, low: 0.84, high: 0.24 };
const CAN = { radius: 0.06, reach: 0.11 };
const PICK = 0.2; // How near a country's pin the hand has to be to be over it.
const PLANE = 0.19; // How long the plane is.

const TURN_RATE = 3.2; // How quickly the globe turns to where it's wanted, and comes nearer.
const BOARD_SECONDS = 0.7; // The board comes in over this long,
const POLE_SECONDS = 0.5; // and the flag goes from it to its pole over this long.
// When what's on the screen changes all at once (the board for the pole, the pole for the globe), the last picture
// of what was there fades out over what's there now, for this long, so that nothing flashes.
const FADE_SECONDS = 0.6;
// However long a frame took, these changes go no further in it than they would in a thirtieth of a second: on a
// computer that's struggling they take longer, and are never a jump.
const STEP = 1 / 30;

/** The middle of some places on the globe. */
function middleOf(places) {
  let [x, y, z] = [0, 0, 0];
  for (const [lon, lat] of places) {
    x += Math.cos(lat * RAD) * Math.cos(lon * RAD);
    y += Math.cos(lat * RAD) * Math.sin(lon * RAD);
    z += Math.sin(lat * RAD);
  }
  const far = Math.hypot(x, y, z) || 1;
  return [Math.atan2(y, x) / RAD, Math.asin(clamp(z / far, -1, 1)) / RAD];
}

export class TourView {
  /**
   * globe is the Globe, flags the flags by country, and language() says which language names are in. side() is
   * the hand in play, 'left' or 'right'.
   */
  constructor(canvas, { globe, flags, names = {}, language = () => 'en', side = () => 'right' }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.globe = globe;
    this.flags = flags;
    this.names = names; // The names of countries that have no flag here: see NEIGHBOURS in tour.js.
    this.language = language;
    this.side = side;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.time = 0;
    this.giraffe = null; // Giraffe's pictures, if they could be drawn.
    this.back = document.createElement('canvas'); // The globe as it was last drawn, kept while nothing turns.
    this.snap = document.createElement('canvas'); // The last picture of the board or the pole, to fade out.
    this.backKey = '';
    this.cam = { at: [20, 30], zoom: 1 };
    this.minis = new Map();
    this.extents = new Map();
    this.tour = null;
    this.clear();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** Nothing left over from the last journey. */
  clear() {
    this.colours = new Map(); // The colour each country is lit in.
    this.effects = [];
    this.plane = { x: 0, y: 0, facing: 1, shown: false, from: null, trail: [] };
    this.layers = null; // The paint on the flag, a layer to each part.
    this.flagCanvas = null;
    this.flagDirty = false;
    this.boardFor = 0;
    this.poleFor = 0;
    this.fade = 0; // How much of the last picture still shows, from all of it to none.
    this.snapAt = -Infinity;
    this.gustFor = 0;
    this.wave = 0;
    this.named = null; // A country whose name is shown: { id, until }.
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.ratio);
    this.canvas.height = Math.round(this.height * this.ratio);
    this.back.width = this.canvas.width;
    this.back.height = this.canvas.height;
    this.snap.width = this.canvas.width;
    this.snap.height = this.canvas.height;
    this.fade = 0;
    this.snapAt = -Infinity;
    this.backKey = '';
    this.palmSize = Math.max(34, this.height * 0.066);
    this.radius = Math.min(this.height * GLOBE.radius, this.width * GLOBE.widest);
    this.centre = { x: this.width / 2, y: this.height * GLOBE.y };
    if (this.tour?.painting) this.layFlag(this.tour, true);
  }

  /** The part of the screen the hands' reach is spread over: see main.js. */
  get desk() {
    return { left: this.width * 0.05, top: this.height * 0.15, width: this.width * 0.9, height: this.height * 0.76 };
  }

  /* ---------- the journey ---------- */

  setTour(tour) {
    this.tour = tour;
    this.clear();
    // The globe turns to the part of the world the journey is in.
    this.cam.at = middleOf(tour.stops.map((id) => tour.places[id]));
    this.cam.zoom = 1;
    this.backKey = '';
  }

  /** What the rules say happened: see tour.js. */
  on(event) {
    const { tour } = this;
    // The board gives way to the pole, or to the globe: what was there a moment ago fades out over it.
    if (['painted', 'ask', 'won', 'lost'].includes(event.type) && this.time - this.snapAt < 0.25) this.fade = 1;
    switch (event.type) {
      case 'ask':
        this.colours = new Map(event.choices.map((id, index) => [id, LIT[index % LIT.length]]));
        this.named = null;
        this.layers = null;
        this.flagCanvas = null;
        break;
      case 'wrong':
        this.named = { id: event.country, until: this.time + 3 };
        break;
      case 'fly':
        this.plane.from = { x: this.plane.x, y: this.plane.y };
        this.plane.trail = [];
        break;
      case 'landed':
        this.named = { id: event.country, until: Infinity };
        break;
      case 'easel':
        this.layFlag(tour);
        this.boardFor = 0;
        this.poleFor = 0;
        break;
      case 'stroke':
        this.stroke(event);
        break;
      case 'part':
        this.fillPart(event.part);
        this.sparkleFlag(event.part);
        break;
      case 'gust':
        this.gustFor = 1;
        if (event.part !== null && event.part !== undefined) this.blowOff(event.part);
        break;
      case 'painted':
        this.poleFor = 0;
        break;
      case 'raised': {
        // Stars round the flag at the top of its pole.
        const flag = this.poleFlag(1);
        for (let n = 0; n < 9; n += 1) {
          const turn = (n / 9) * Math.PI * 2;
          this.sparkle(flag.x + flag.wide / 2 + Math.cos(turn) * flag.wide * 0.75, flag.y + flag.high / 2 + Math.sin(turn) * flag.high * 0.95);
        }
        break;
      }
      case 'stamp': {
        // The country's stamp comes off the flag and goes up to where the stamps are counted.
        const flag = this.poleFlag(1);
        const to = this.stampsAt?.() ?? { x: this.width * 0.2, y: this.height * 0.07 };
        this.effects.push({ kind: 'stamp', id: event.country, from: { x: flag.x + flag.wide / 2, y: flag.y + flag.high / 2 }, to, age: 0, life: 1.5 });
        break;
      }
      default:
    }
  }

  /** How far round the globe a country reaches from where its name goes, in degrees. */
  extentOf(id) {
    if (this.extents.has(id)) return this.extents.get(id);
    const country = this.globe.byId.get(id);
    let far = 1;
    const ring = country?.rings[0];
    if (ring) {
      for (let n = 0; n < ring.length; n += 3) {
        const [lon, lat] = [Math.atan2(ring[n + 1], ring[n]) / RAD, Math.asin(clamp(ring[n + 2], -1, 1)) / RAD];
        far = Math.max(far, apart(country.at, [lon, lat]));
      }
    }
    this.extents.set(id, far);
    return far;
  }

  /** Where the globe should face and how near it should be, for what's going on. */
  wanted() {
    const { tour } = this;
    if (!tour) return { at: this.cam.at, zoom: 1 };
    const place = (id) => tour.places[id];
    const fit = (at, ids, share) => {
      const reach = Math.max(...ids.map((id) => apart(at, place(id)) + this.extentOf(id) * 0.6));
      return clamp(share / Math.sin(Math.min(80, reach) * RAD), 1, 9);
    };
    if (tour.state === 'ready') return { at: middleOf(tour.stops.map(place)), zoom: 1 };
    if (tour.state === 'won') {
      const at = middleOf(tour.flown.map(place));
      return { at, zoom: Math.min(2.4, fit(at, tour.flown, 0.62)) };
    }
    if (tour.state === 'find' || tour.state === 'lost') {
      const at = middleOf(tour.choices.map(place));
      return { at, zoom: fit(at, tour.choices, 0.62) };
    }
    const at = place(tour.target);
    const near = clamp(0.5 / Math.sin(Math.min(80, this.extentOf(tour.target)) * RAD), 1, 10);
    if (tour.state === 'fly') {
      // Half way between how near the choosing was and how near the landing will be.
      const middle = middleOf(tour.choices.map(place));
      return { at, zoom: Math.sqrt(fit(middle, tour.choices, 0.62) * near) };
    }
    return { at, zoom: near };
  }

  /** Where a place on the globe is on the screen, and whether it's on the side that's seen. */
  onScreen(place) {
    const at = this.globe.project(place[0], place[1]);
    const reach = this.radius * this.cam.zoom;
    return { x: this.centre.x + at.x * reach, y: this.centre.y + at.y * reach, front: at.front };
  }

  /** The country lit to choose from that the hand is over, or null: the one whose pin is nearest, if it's near. */
  countryAt(x, y) {
    const { tour } = this;
    if (!tour || tour.state !== 'find') return null;
    let [best, nearest] = [null, this.height * PICK];
    for (const id of tour.choices) {
      const at = this.onScreen(tour.places[id]);
      const far = Math.hypot(at.x - x, at.y - y);
      if (at.front && far < nearest) [best, nearest] = [id, far];
    }
    // A hand on a country that's been chosen wrongly is on that one, and not on whichever is next nearest.
    return best && tour.out.has(best) ? null : best;
  }

  /* ---------- the flag on its board ---------- */

  /** Where the flag is on the screen while it's painted, and its pots under it. */
  layFlag(tour, keep = false) {
    const { flag } = tour;
    const { width: w, height: h } = this;
    const high = Math.min(h * BOARD.high, (w * BOARD.widest * 100) / flag.wide);
    const unit = high / 100;
    const wide = flag.wide * unit;
    const frame = h * BOARD.frame;
    // The other hand's side of the screen: the left for a child who paints with the right.
    const away = this.side() === 'right' ? -1 : 1;
    const holding = tour.rules.holding;
    // It never goes under the little film of what to do, which is at the top left: see style.css.
    const film = 16 + Math.max(120, Math.min(w * 0.15, h * 0.23)) + 10;
    const room = (w - wide) / 2 - frame - (away > 0 ? Math.max(w * 0.02, film) : w * 0.02);
    const middle = w / 2 - (holding ? away * Math.max(0, Math.min(w * SHIFT, room)) : 0);
    this.board = { x: middle - wide / 2, y: h * BOARD.top, wide, high, unit };
    const paints = Object.keys(flag.colours);
    const pots = paints.map((paint) => ({ paint, colour: flag.colours[paint] }));
    if (tour.rules.roller) pots.push({ paint: 'roller' });
    const gap = Math.min(h * POTS.gap, (w * 0.9) / pots.length);
    this.pots = pots.map((pot, index) => ({ ...pot, x: middle + (index - (pots.length - 1) / 2) * gap, y: this.board.y + high + h * POTS.below, r: h * POTS.radius }));
    // What's beside the board: the finished flag to copy from, on the left, or with the flag held, on the other
    // hand's side, over the spot where that hand holds it.
    const beside = holding ? away : -1;
    const space = beside < 0 ? this.board.x - frame : w - this.board.x - wide - frame;
    const across = (share) => (beside < 0 ? space * share : w - space * share);
    const copyHigh = Math.min(h * 0.16, ((space - h * 0.07) * 100) / flag.wide);
    this.copy = copyHigh < h * 0.06 ? null : { x: across(0.5) - (copyHigh * flag.wide) / 200, y: this.board.y + h * 0.13, wide: (copyHigh * flag.wide) / 100, high: copyHigh };
    const reach = h * HOLD.radius;
    this.hold = holding ? { x: beside < 0 ? Math.max(reach * 1.15, across(HOLD.in)) : Math.min(w - reach * 1.15, across(HOLD.in)), y: h * HOLD.y, r: reach } : null;

    // A layer of paint to each part, each as sharp as the screen.
    const pixels = unit * this.ratio;
    const [pixelsWide, pixelsHigh] = [Math.ceil(flag.wide * pixels), Math.ceil(100 * pixels)];
    const make = () => {
      const canvas = document.createElement('canvas');
      canvas.width = pixelsWide;
      canvas.height = pixelsHigh;
      return canvas;
    };
    this.pixels = pixels;
    this.flagCanvas = make();
    this.layers = flag.parts.map(() => make());
    // On a screen that's changed size, the parts that are done are done, and paint that was wet is as it was painted.
    if (keep || tour.painting) {
      tour.painting.done.forEach((done, part) => {
        if (done) this.fillPart(part);
        else this.repaint(tour.painting, part);
      });
    }
    this.flagDirty = true;
  }

  /** Where a place on the screen is on the flag, in the flag's units. */
  toFlag(x, y) {
    const { board } = this;
    return board ? { x: (x - board.x) / board.unit, y: (y - board.y) / board.unit } : null;
  }

  /** The pot a place on the screen is in, by its paint, or null. */
  potAt(x, y) {
    for (const pot of this.pots ?? []) if (Math.hypot(pot.x - x, pot.y - y) < pot.r * POTS.dip) return pot.paint;
    return null;
  }

  /** Whether a place on the screen is on the spot where the flag is held. */
  onHold(x, y) {
    return Boolean(this.hold) && Math.hypot(this.hold.x - x, this.hold.y - y) < this.height * HOLD.reach;
  }

  /** How high up the pole a place on the screen is, from 0 at the bottom to 1 at the top. */
  liftOf(y) {
    return clamp((this.height * POLE.low - y) / (this.height * (POLE.low - POLE.high)), 0, 1);
  }

  /** Where the fuel can is on the way, on the side of the hand in play. */
  get can() {
    const bob = this.reducedMotion ? 0 : Math.sin(this.time * 2.2) * this.height * 0.012;
    return { x: this.width * (this.side() === 'right' ? 0.7 : 0.3), y: this.height * 0.5 + bob, r: this.height * CAN.radius };
  }

  onCan(x, y) {
    const { can } = this;
    return Math.hypot(can.x - x, can.y - y) < this.height * CAN.reach;
  }

  /** A part's shapes as the path, on one of the flag's canvases. */
  partPath(ctx, part) {
    ctx.setTransform(this.pixels, 0, 0, this.pixels, 0, 0);
    ctx.beginPath();
    for (const shape of this.tour.flag.parts[part].shapes) trace(ctx, shape);
  }

  stroke({ x, y, reach, paint, parts }) {
    if (!this.layers) return;
    const colour = this.tour.flag.colours[paint];
    for (const part of parts) {
      const ctx = this.layers[part].getContext('2d');
      ctx.save();
      this.partPath(ctx, part);
      ctx.clip();
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(x, y, reach, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    this.flagDirty = true;
  }

  fillPart(part) {
    if (!this.layers) return;
    const { flag } = this.tour;
    const ctx = this.layers[part].getContext('2d');
    ctx.save();
    this.partPath(ctx, part);
    ctx.fillStyle = flag.colours[flag.parts[part].colour];
    ctx.fill();
    ctx.restore();
    this.flagDirty = true;
  }

  /** A part's paint as the rules have it, square by square: for a screen that changed size in the middle. */
  repaint(painting, part) {
    const { flag } = this.tour;
    const ctx = this.layers[part].getContext('2d');
    ctx.setTransform(this.pixels, 0, 0, this.pixels, 0, 0);
    ctx.fillStyle = flag.colours[flag.parts[part].colour];
    for (let at = 0; at < painting.owner.length; at += 1) {
      if (painting.owner[at] === part && painting.painted[at]) ctx.fillRect(at % painting.wide, Math.floor(at / painting.wide), 1, 1);
    }
  }

  /** The wind takes a part's wet paint: it's bare again, and flecks of it fly off. */
  blowOff(part) {
    if (!this.layers) return;
    const layer = this.layers[part];
    const ctx = layer.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, layer.width, layer.height);
    this.flagDirty = true;
    const { flag } = this.tour;
    const colour = flag.colours[flag.parts[part].colour];
    const { board } = this;
    for (let n = 0; n < 14; n += 1) {
      this.effects.push({ kind: 'fleck', x: board.x + Math.random() * board.wide, y: board.y + Math.random() * board.high, vx: this.height * (0.5 + Math.random() * 0.5), vy: this.height * (Math.random() * 0.2 - 0.15), colour, age: 0, life: 0.9 });
    }
  }

  /** The flag as it is now: its paper, each part's paint over what's under it, and its lines on top. */
  compose() {
    const { flagCanvas: canvas, tour } = this;
    const { flag } = tour;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.paper ??= this.makePaper();
    const paper = ctx.createPattern(this.paper, 'repeat');
    const done = tour.painting?.done ?? [];
    flag.parts.forEach((part, index) => {
      // Its lines first, twice as thick as they'll look: dark round what's still to paint, and faint round
      // what's done. The half of each that's inside the part is then covered, with any line where two of its
      // own shapes cross, so what's left is one line round the whole part.
      ctx.setTransform(this.pixels, 0, 0, this.pixels, 0, 0);
      ctx.lineJoin = 'round';
      ctx.lineWidth = done[index] ? 0.6 : 1.4;
      ctx.strokeStyle = done[index] ? 'rgb(18 48 77 / 0.35)' : INK;
      for (const shape of part.shapes) {
        ctx.save();
        if (shape.type === 'crescent') {
          // Only as much of the disc that's cut out of it as is inside it.
          ctx.beginPath();
          ctx.arc(shape.x, shape.y, shape.r + ctx.lineWidth / 2, 0, Math.PI * 2);
          ctx.clip();
        }
        ctx.beginPath();
        trace(ctx, shape);
        ctx.stroke();
        ctx.restore();
      }
      // Then bare paper, over whatever is under this part, and this part's own paint.
      this.partPath(ctx, index);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = paper;
      ctx.fill();
      ctx.drawImage(this.layers[index], 0, 0);
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.flagDirty = false;
  }

  /** Bare paper: pale, with fine lines across it, so that white paint shows on it. */
  makePaper() {
    const size = Math.round(9 * this.ratio);
    const tile = document.createElement('canvas');
    tile.width = size;
    tile.height = size;
    const ctx = tile.getContext('2d');
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = HATCH;
    ctx.lineWidth = Math.max(1, this.ratio);
    ctx.beginPath();
    for (const shift of [-size, 0, size]) {
      ctx.moveTo(shift, size);
      ctx.lineTo(shift + size, 0);
    }
    ctx.stroke();
    return tile;
  }

  /** A country's finished flag, small, for its pin on the globe and to copy from. */
  mini(id) {
    if (this.minis.has(id)) return this.minis.get(id);
    const flag = this.flags[id];
    const canvas = document.createElement('canvas');
    const scale = 2.4;
    canvas.width = Math.ceil(flag.wide * scale);
    canvas.height = Math.ceil(100 * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    for (const part of flag.parts) {
      ctx.beginPath();
      for (const shape of part.shapes) trace(ctx, shape);
      ctx.fillStyle = flag.colours[part.colour];
      ctx.fill();
    }
    this.minis.set(id, canvas);
    return canvas;
  }

  nameOf(id) {
    const flag = this.flags[id] ?? this.names[id];
    return (this.language() === 'ka' ? flag?.nameKa : flag?.name) ?? flag?.name ?? id;
  }

  /* ---------- little things that come and go ---------- */

  sparkle(x, y, colour = '#ffe066') {
    this.effects.push({ kind: 'sparkle', x, y, colour, age: 0, life: 0.7 });
  }

  /** Stars over a part that's just filled itself in. */
  sparkleFlag(part) {
    const { board, tour } = this;
    if (!board) return;
    const painting = tour.painting;
    let made = 0;
    for (let tries = 0; tries < 60 && made < 4; tries += 1) {
      const [x, y] = [Math.random() * painting.wide, Math.random() * painting.high];
      if (painting.partAt(x, y) !== part) continue;
      this.sparkle(board.x + x * board.unit, board.y + y * board.unit, '#ffffff');
      made += 1;
    }
  }

  /* ---------- each frame ---------- */

  update(dt) {
    this.time += dt;
    const { tour, cam } = this;
    // The globe turns to where it's wanted, and stops there, so it needn't be drawn again until it's wanted elsewhere.
    const wanted = this.wanted();
    const share = this.reducedMotion ? 1 : 1 - Math.exp(-dt * TURN_RATE);
    const away = apart(cam.at, wanted.at);
    cam.at = away < 0.02 ? [...wanted.at] : between(cam.at, wanted.at, share);
    const ratio = wanted.zoom / cam.zoom;
    cam.zoom = Math.abs(ratio - 1) < 0.002 ? wanted.zoom : cam.zoom * ratio ** share;
    // While nothing is going on, the whole globe turns slowly, to be looked at.
    if (tour?.state === 'ready' && !this.reducedMotion) cam.at = [cam.at[0] + dt * 3, cam.at[1]];
    this.globe.face(cam.at[0], cam.at[1]);

    if (tour) this.movePlane(dt, tour);
    const painting = tour && ['paint', 'raise', 'settle'].includes(tour.state);
    const step = Math.min(dt, STEP);
    this.boardFor = painting ? Math.min(1, this.boardFor + step / BOARD_SECONDS) : 0;
    this.fade = this.reducedMotion ? 0 : Math.max(0, this.fade - step / FADE_SECONDS);
    const raising = tour && ['raise', 'settle'].includes(tour.state);
    this.poleFor = raising ? Math.min(1, this.poleFor + step / POLE_SECONDS) : 0;
    this.gustFor = Math.max(0, this.gustFor - dt / 0.9);
    this.wave += dt * (tour?.state === 'settle' ? 6 : 2);
    for (const effect of this.effects) {
      effect.age += dt;
      if (effect.kind === 'fleck') {
        effect.x += effect.vx * dt;
        effect.y += effect.vy * dt;
      }
    }
    this.effects = this.effects.filter((effect) => effect.age < effect.life);
  }

  /** Where the plane is: beside the country it's at, on its way to the next, or coming down into it. */
  movePlane(dt, tour) {
    const { plane, width: w, height: h } = this;
    const bob = this.reducedMotion ? 0 : Math.sin(this.time * 2.4) * h * 0.008;
    const over = (id) => {
      const at = this.onScreen(tour.places[id]);
      return at.front ? { x: at.x, y: at.y - h * 0.07 } : null;
    };
    const parked = { x: w * 0.17, y: h * 0.36 };
    let to = null;
    plane.shown = true;
    if (tour.state === 'fly') {
      const end = over(tour.target) ?? parked;
      const from = plane.from ?? parked;
      const share = smooth(tour.flightShare);
      // Up and over, as a hop is.
      to = { x: lerp(from.x, end.x, share), y: lerp(from.y, end.y, share) - Math.sin(share * Math.PI) * h * 0.1 };
      if (Math.abs(end.x - from.x) > 4) plane.facing = Math.sign(end.x - from.x);
      plane.x = to.x;
      plane.y = to.y + bob;
      plane.trail.push({ x: plane.x, y: plane.y });
      if (plane.trail.length > 40) plane.trail.shift();
      return;
    }
    plane.trail = [];
    if (['paint', 'raise', 'settle'].includes(tour.state)) {
      // It waits over the country, out of sight behind the board and the pole.
      plane.shown = false;
      const at = over(tour.target);
      if (at) [plane.x, plane.y] = [at.x, at.y];
      return;
    }
    if (tour.state === 'won') {
      // Round and round over the flags.
      const turn = this.time * 0.9;
      to = { x: this.centre.x + Math.cos(turn) * this.radius * 0.9, y: this.centre.y - this.radius * 0.55 + Math.sin(turn * 2) * h * 0.03 };
      plane.facing = Math.sin(turn) > 0 ? -1 : 1;
    } else if (tour.state === 'lost') {
      to = { x: w * 0.5, y: h * 0.86 };
    } else if (tour.state === 'land') {
      to = over(tour.target) ?? parked;
    } else {
      // Waiting where it last landed, if that's in sight.
      const last = tour.flown.at(-1);
      to = (last && over(last)) || parked;
    }
    const share = 1 - Math.exp(-dt * (tour.state === 'lost' ? 1.4 : 6));
    plane.x += (to.x - plane.x) * share;
    plane.y += (to.y + bob - plane.y) * share;
  }

  /** Before the first frame of a journey, the plane is where it waits, and not on its way there. */
  parkPlane() {
    this.plane.x = this.width * 0.17;
    this.plane.y = this.height * 0.36;
    this.plane.facing = 1;
  }

  /* ---------- drawing ---------- */

  /** model is { gloves: [{ glove, x, y, look, paint, reach, ring }], hover }. */
  render(model = {}) {
    const { ctx, ratio, width: w, height: h, tour } = this;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.drawGlobe(model);
    if (!tour) return;
    const state = tour.state;
    this.drawPlanted(tour);
    if (state === 'find') this.drawChoices(tour, model.hover);
    if (this.named && this.time < this.named.until && ['find', 'land'].includes(state)) this.drawName(this.named.id, state === 'land' ? 1.5 : 1);
    if (state === 'fly' && tour.can && !tour.can.taken) this.drawCan();
    this.drawPlane(tour);
    if (this.boardFor > 0) {
      // The globe goes pale behind the board.
      ctx.fillStyle = `rgb(255 255 255 / ${0.5 * this.boardFor})`;
      ctx.fillRect(0, 0, w, h);
      if (this.flagDirty) this.compose();
      if (state === 'paint') this.drawBoard(tour);
      else this.drawPole(tour);
    }
    if (state === 'won' && tour.rules.cup) this.drawCup();
    this.drawEffects();
    if (this.fade > 0) {
      // What was on the screen before, fading out.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = this.fade;
      ctx.drawImage(this.snap, 0, 0);
      ctx.globalAlpha = 1;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    } else if (state === 'paint' || state === 'settle') {
      // The board and the flag on its pole can each go all at once, so a picture of them is kept, without the hands.
      this.snap.getContext('2d', { alpha: false }).drawImage(this.canvas, 0, 0);
      this.snapAt = this.time;
    }
    for (const glove of model.gloves ?? []) this.drawGlove(glove);
    // Over the glove, which would hide them: the pin of the country the hand is on, with its ring closing.
    if (state === 'find' && model.hover) this.drawPin(tour, model.hover, true);
  }

  drawGlobe(model) {
    const { ctx, tour, cam, width: w, height: h, ratio } = this;
    const lit = new Map();
    const dim = new Set();
    if (tour) {
      for (const id of tour.flown) dim.add(id);
      if (tour.state === 'find') {
        for (const id of tour.choices) {
          if (tour.out.has(id)) lit.set(id, { fill: OUT, edge: '#7f8a99', thick: 1.5 });
          // With no lights, a country only shows itself under the hand.
          else if (tour.rules.lights || id === model.hover) lit.set(id, { fill: this.colours.get(id), edge: INK });
        }
      } else if (['fly', 'land', 'paint', 'raise', 'settle'].includes(tour.state)) {
        lit.set(tour.target, { fill: this.colours.get(tour.target) ?? LIT[0], edge: INK });
      }
    }
    const reach = this.radius * cam.zoom;
    const key = [cam.at[0].toFixed(3), cam.at[1].toFixed(3), reach.toFixed(1), [...lit].map(([id, look]) => id + look.fill).join(), [...dim].join(), w, h].join('|');
    if (key !== this.backKey) {
      this.backKey = key;
      const back = this.back.getContext('2d', { alpha: false });
      back.setTransform(ratio, 0, 0, ratio, 0, 0);
      const sky = back.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, SKY[0]);
      sky.addColorStop(1, SKY[1]);
      back.fillStyle = sky;
      back.fillRect(0, 0, w, h);
      // A soft shadow under the ball, while the whole of it is in sight.
      if (cam.zoom < 1.6) {
        back.fillStyle = 'rgb(18 48 77 / 0.1)';
        back.beginPath();
        back.ellipse(this.centre.x, this.centre.y + reach * 1.04, reach * 0.8, reach * 0.07, 0, 0, Math.PI * 2);
        back.fill();
      }
      this.globe.draw(back, this.centre.x, this.centre.y, reach, { ...LOOK, lit, dim, line: clamp(reach * 0.004, 1, 2.2) });
      back.lineWidth = 2;
      back.strokeStyle = 'rgb(18 48 77 / 0.35)';
      back.beginPath();
      back.arc(this.centre.x, this.centre.y, reach, 0, Math.PI * 2);
      back.stroke();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.back, 0, 0);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  /** The flags that are up already, each on its pole where its country is. */
  drawPlanted(tour) {
    const { ctx, height: h } = this;
    const shown = tour.state === 'paint' || tour.state === 'raise' ? [] : tour.flown;
    for (const id of shown) {
      const at = this.onScreen(tour.places[id]);
      if (!at.front) continue;
      const mini = this.mini(id);
      const high = h * 0.05;
      const wide = (high * mini.width) / mini.height;
      ctx.lineCap = 'round';
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(2, h * 0.005);
      ctx.beginPath();
      ctx.moveTo(at.x, at.y);
      ctx.lineTo(at.x, at.y - high * 1.9);
      ctx.stroke();
      this.drawWaving(mini, at.x + 1, at.y - high * 1.9, wide, high, 0.06);
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      ctx.arc(at.x, at.y - high * 1.9, h * 0.006, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** A flag flying: drawn in strips, each a little up or down from the last. */
  drawWaving(image, x, y, wide, high, much) {
    const { ctx } = this;
    const strips = 24;
    const liftAt = (n) => (this.reducedMotion ? 0 : Math.sin(this.wave + n * 0.32) * high * much * (n / strips));
    for (let n = 0; n < strips; n += 1) {
      ctx.drawImage(image, (image.width * n) / strips, 0, image.width / strips, image.height, x + (wide * n) / strips, y + liftAt(n + 0.5), wide / strips + 0.6, high);
    }
    // Its edge goes up and down with it.
    ctx.strokeStyle = 'rgb(18 48 77 / 0.5)';
    ctx.lineWidth = 1;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let n = 0; n <= strips; n += 1) ctx.lineTo(x + (wide * n) / strips, y + liftAt(n));
    for (let n = strips; n >= 0; n -= 1) ctx.lineTo(x + (wide * n) / strips, y + high + liftAt(n));
    ctx.closePath();
    ctx.stroke();
  }

  /** A pin on each country to choose from. */
  drawChoices(tour, hover) {
    for (const id of tour.choices) {
      // With no lights, a country's pin only shows under the hand.
      if (tour.out.has(id) || tour.rules.lights || id === hover) this.drawPin(tour, id, false);
    }
  }

  /** A country's pin, and for the one the hand is on, the ring that closes round it as the hand stays. */
  drawPin(tour, id, chosen) {
    const { ctx, height: h } = this;
    const at = this.onScreen(tour.places[id]);
    if (!at.front) return;
    const out = tour.out.has(id);
    const r = h * 0.02;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = out ? '#7f8a99' : INK;
    ctx.lineWidth = Math.max(2, h * 0.004);
    ctx.beginPath();
    ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = out ? OUT : this.colours.get(id);
    ctx.beginPath();
    ctx.arc(at.x, at.y, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    if (!chosen || tour.over !== id) return;
    ctx.lineCap = 'round';
    ctx.lineWidth = h * 0.012;
    ctx.strokeStyle = 'rgb(255 255 255 / 0.85)';
    ctx.beginPath();
    ctx.arc(at.x, at.y, h * 0.05, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = GOLD;
    ctx.beginPath();
    ctx.arc(at.x, at.y, h * 0.05, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(tour.overFor / TOUR.dwell, 0, 1));
    ctx.stroke();
  }

  /** A country's name, on a tag over it. */
  drawName(id, big = 1) {
    const at = this.onScreen(this.tour.places[id]);
    if (at.front) this.drawTag(this.nameOf(id), at.x, at.y + this.height * 0.055, big);
  }

  drawTag(text, x, y, big = 1) {
    const { ctx, height: h, width: w } = this;
    const size = clamp(h * 0.03, 16, 30) * big;
    ctx.font = `800 ${size}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const wide = ctx.measureText(text).width + size * 1.2;
    const at = clamp(x, wide / 2 + 6, w - wide / 2 - 6);
    ctx.fillStyle = 'rgb(255 255 255 / 0.95)';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(at - wide / 2, y - size * 0.8, wide, size * 1.6, size * 0.8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.fillText(text, at, y + size * 0.04);
  }

  /** The fuel can to catch on the way. */
  drawCan() {
    const { ctx } = this;
    const { x, y, r } = this.can;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgb(255 255 255 / 0.9)';
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = r * 0.12;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = r * 0.09;
    ctx.fillStyle = '#f25c54';
    ctx.beginPath();
    ctx.roundRect(-r * 0.55, -r * 0.5, r * 1.1, r * 1.2, r * 0.16);
    ctx.fill();
    ctx.stroke();
    // Its spout and its handle.
    ctx.beginPath();
    ctx.moveTo(r * 0.15, -r * 0.5);
    ctx.lineTo(r * 0.15, -r * 0.78);
    ctx.lineTo(r * 0.5, -r * 0.78);
    ctx.moveTo(-r * 0.45, -r * 0.5);
    ctx.lineTo(-r * 0.45, -r * 0.72);
    ctx.lineTo(-r * 0.1, -r * 0.72);
    ctx.lineTo(-r * 0.1, -r * 0.5);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${r * 0.62}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+1', 0, r * 0.14);
    ctx.restore();
  }

  /** Giraffe's little plane, with his head out of the top of it. */
  drawPlane(tour) {
    const { plane, ctx, height: h } = this;
    if (!plane.shown) return;
    // The way it's come, in dots.
    ctx.fillStyle = 'rgb(255 255 255 / 0.85)';
    plane.trail.forEach((dot, index) => {
      if (index % 4) return;
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, h * 0.006, 0, Math.PI * 2);
      ctx.fill();
    });
    const long = h * PLANE * (tour.state === 'land' ? 0.85 : 1);
    const flying = tour.state !== 'lost';
    ctx.save();
    ctx.translate(plane.x, plane.y);
    ctx.scale(plane.facing, 1);
    if (tour.state === 'fly') ctx.rotate(-0.08);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = long * 0.035;
    // The tail.
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.moveTo(-long * 0.42, -long * 0.02);
    ctx.lineTo(-long * 0.56, -long * 0.26);
    ctx.lineTo(-long * 0.36, -long * 0.24);
    ctx.lineTo(-long * 0.24, -long * 0.06);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Giraffe, behind the side of the plane: his head and neck, and nothing below his chest.
    const art = this.giraffe;
    if (art) {
      const cut = art.foot.y - art.tall * 0.62;
      const scale = (long * 0.78) / cut;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(art.frames.stand, 0, 0, art.width, cut, -art.width * scale * 0.5 - long * 0.02, -cut * scale - long * 0.02, art.width * scale, cut * scale);
    }
    // The body, the wing and the wheel.
    ctx.fillStyle = '#f25c54';
    ctx.beginPath();
    ctx.moveTo(-long * 0.46, -long * 0.06);
    ctx.quadraticCurveTo(-long * 0.1, -long * 0.13, long * 0.3, -long * 0.1);
    ctx.quadraticCurveTo(long * 0.47, -long * 0.06, long * 0.47, long * 0.03);
    ctx.quadraticCurveTo(long * 0.44, long * 0.16, long * 0.16, long * 0.17);
    ctx.quadraticCurveTo(-long * 0.26, long * 0.16, -long * 0.46, -long * 0.06);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.roundRect(-long * 0.16, long * 0.0, long * 0.34, long * 0.085, long * 0.04);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(long * 0.1, long * 0.22, long * 0.05, 0, Math.PI * 2);
    ctx.fill();
    // The propeller: a blur while it turns, and two blades when it's stopped.
    if (flying && !this.reducedMotion) {
      ctx.fillStyle = 'rgb(18 48 77 / 0.22)';
      ctx.beginPath();
      ctx.ellipse(long * 0.49, long * 0.0, long * 0.025, long * 0.17, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(long * 0.49, -long * 0.15);
      ctx.lineTo(long * 0.49, long * 0.15);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(long * 0.48, 0, long * 0.03, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /** The flag on its board, with what to copy beside it, its pots under it, and the spot to hold it by. */
  drawBoard(tour) {
    const { ctx, board, height: h, width: w } = this;
    // It comes up from below, evenly, so that the screen never brightens quickest in the middle of its coming.
    // It comes in where it stands, a little at a time, so that nothing on the screen jumps.
    ctx.save();
    ctx.globalAlpha = this.boardFor;
    const frame = h * BOARD.frame;
    ctx.fillStyle = 'rgb(18 48 77 / 0.16)';
    ctx.beginPath();
    ctx.roundRect(board.x - frame, board.y - frame + h * 0.012, board.wide + frame * 2, board.high + frame * 2, frame);
    ctx.fill();
    ctx.fillStyle = WOOD;
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, h * 0.004);
    ctx.beginPath();
    ctx.roundRect(board.x - frame, board.y - frame, board.wide + frame * 2, board.high + frame * 2, frame);
    ctx.fill();
    ctx.stroke();
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.flagCanvas, board.x, board.y, board.wide, board.high);
    ctx.strokeRect(board.x, board.y, board.wide, board.high);

    this.drawCopy(tour);
    for (const pot of this.pots) this.drawPot(pot, tour);
    if (tour.rules.holding) this.drawHold(tour);
    if (tour.rules.wind) this.drawWind(tour);
    ctx.restore();
    // The streaks of a gust, across the whole screen.
    if (this.gustFor > 0) {
      ctx.strokeStyle = `rgb(255 255 255 / ${0.7 * this.gustFor})`;
      ctx.lineWidth = h * 0.006;
      ctx.lineCap = 'round';
      for (let n = 0; n < 7; n += 1) {
        const y = h * (0.22 + n * 0.085);
        const x = ((1 - this.gustFor) * 1.5 + ((n * 0.37) % 1) * 0.4 - 0.4) * w;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w * 0.16, y);
        ctx.stroke();
      }
    }
  }

  /** The finished flag to copy from, with the country's name: or, painting from memory, a card that hides it. */
  drawCopy(tour) {
    const { ctx, height: h } = this;
    if (!this.copy) return;
    const mini = this.mini(tour.target);
    const { x, y, wide, high } = this.copy;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, h * 0.004);
    ctx.beginPath();
    ctx.roundRect(x - h * 0.012, y - h * 0.012, wide + h * 0.024, high + h * 0.024, h * 0.012);
    ctx.fill();
    ctx.stroke();
    if (tour.shown) {
      ctx.drawImage(mini, x, y, wide, high);
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, wide, high);
    } else {
      ctx.fillStyle = '#e6ebf2';
      ctx.fillRect(x, y, wide, high);
      ctx.fillStyle = INK;
      ctx.font = `800 ${high * 0.6}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', x + wide / 2, y + high * 0.54);
    }
    this.drawTag(this.nameOf(tour.target), x + wide / 2, y + high + h * 0.05, 0.9);
  }

  drawPot(pot, tour) {
    const { ctx } = this;
    const { x, r } = pot;
    const wanted = tour.hint?.paint === pot.paint;
    const on = pot.paint === 'roller' ? tour.rollerOn : tour.paint === pot.paint;
    // The pot a part is asking for bobs, slowly.
    const y = pot.y - (wanted && !this.reducedMotion ? Math.abs(Math.sin(this.time * 3)) * r * 0.22 : 0);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = r * 0.08;
    if (on || wanted) {
      ctx.strokeStyle = on ? GOLD : 'rgb(18 48 77 / 0.5)';
      ctx.lineWidth = r * 0.12;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = INK;
      ctx.lineWidth = r * 0.08;
    }
    if (pot.paint === 'roller') {
      // A tray, with the roller across it.
      ctx.fillStyle = '#eef2f6';
      ctx.beginPath();
      ctx.roundRect(x - r * 0.9, y - r * 0.55, r * 1.8, r * 1.3, r * 0.2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = tour.rollerOn ? '#cfd6de' : '#ff9f5a';
      ctx.beginPath();
      ctx.roundRect(x - r * 0.7, y - r * 0.35, r * 1.4, r * 0.5, r * 0.22);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y + r * 0.15);
      ctx.lineTo(x, y + r * 0.55);
      ctx.stroke();
      return;
    }
    ctx.fillStyle = '#eef2f6';
    ctx.beginPath();
    ctx.roundRect(x - r * 0.9, y - r * 0.5, r * 1.8, r * 1.35, r * 0.3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = pot.colour;
    ctx.beginPath();
    ctx.ellipse(x, y - r * 0.5, r * 0.9, r * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  /** The spot where the other hand holds the flag: asking for a hand while there's none, and green with one on it. */
  drawHold(tour) {
    const { ctx, hold, board, height: h } = this;
    const { x, y, r } = hold;
    const held = tour.held;
    // A strap from the board's corner to the spot: slack while nobody holds it, and tight when they do.
    const corner = { x: x < board.x ? board.x - h * BOARD.frame : board.x + board.wide + h * BOARD.frame, y: board.y + board.high };
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = r * 0.2;
    ctx.beginPath();
    ctx.moveTo(corner.x, corner.y);
    ctx.quadraticCurveTo((corner.x + x) / 2, Math.max(corner.y, y) + (held ? 0 : r * 0.9), x, y);
    ctx.stroke();
    ctx.strokeStyle = held ? '#22a35a' : WOOD;
    ctx.lineWidth = r * 0.11;
    ctx.stroke();
    const asking = !held && !this.reducedMotion ? 1 + Math.sin(this.time * 3) * 0.06 : 1;
    ctx.fillStyle = held ? '#c9f5d9' : 'rgb(255 255 255 / 0.9)';
    ctx.strokeStyle = held ? '#22a35a' : INK;
    ctx.lineWidth = r * 0.1;
    if (!held) ctx.setLineDash([r * 0.3, r * 0.24]);
    ctx.beginPath();
    ctx.arc(x, y, r * asking, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    // A hand to say whose spot it is.
    ctx.fillStyle = held ? '#22a35a' : INK;
    ctx.font = `${r * 0.95}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✋', x, y + r * 0.06);
  }

  /** The wind on its way: a cloud beside the board that grows as the gust comes. */
  drawWind(tour) {
    const share = tour.gustShare ?? 0;
    if (share <= 0 && this.gustFor <= 0) return;
    const { ctx, board, height: h } = this;
    const size = h * (0.035 + 0.045 * Math.max(share, this.gustFor));
    const onLeft = Boolean(this.hold) && this.hold.x > this.width / 2;
    const x = onLeft ? board.x - h * 0.09 : board.x + board.wide + h * 0.09;
    const y = board.y + h * 0.06;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, h * 0.004);
    ctx.beginPath();
    ctx.arc(x - size * 0.7, y + size * 0.15, size * 0.6, 0, Math.PI * 2);
    ctx.arc(x, y - size * 0.25, size * 0.8, 0, Math.PI * 2);
    ctx.arc(x + size * 0.75, y + size * 0.1, size * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x - size * 0.7, y + size * 0.15, size * 0.56, 0, Math.PI * 2);
    ctx.arc(x, y - size * 0.25, size * 0.76, 0, Math.PI * 2);
    ctx.arc(x + size * 0.75, y + size * 0.1, size * 0.58, 0, Math.PI * 2);
    ctx.fill();
    // Its puffed cheeks blow towards the flag.
    ctx.strokeStyle = INK;
    ctx.lineCap = 'round';
    const blow = onLeft ? 1 : -1;
    for (const lift of [-0.2, 0.15, 0.5]) {
      ctx.beginPath();
      ctx.moveTo(x + blow * size * 1.5, y + size * lift);
      ctx.lineTo(x + blow * size * (1.9 + share * 0.8), y + size * lift);
      ctx.stroke();
    }
  }

  /** The flag on the pole, where it would be at some height up it. */
  poleFlag(raised = this.tour?.raisedTo ?? 0) {
    const { height: h, width: w, tour } = this;
    const high = h * POLE.flag;
    const wide = (high * (tour?.flag.wide ?? 150)) / 100;
    const x = w / 2 - wide / 2 + h * 0.03;
    const top = lerp(h * POLE.bottom - high - h * 0.03, h * (POLE.top + 0.025), raised);
    return { x, y: top, wide, high, pole: x - h * 0.012 };
  }

  /** The painted flag goes from its board to the foot of the pole, and up it with the hand. */
  drawPole(tour) {
    const { ctx, board, height: h } = this;
    const flag = this.poleFlag();
    const moved = smooth(this.poleFor);
    // The pole, with its gold ball, on a little mound.
    ctx.fillStyle = '#9ccf7a';
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, h * 0.004);
    ctx.beginPath();
    ctx.ellipse(flag.pole, h * POLE.bottom, h * 0.12, h * 0.03, 0, Math.PI, 0);
    ctx.fill();
    ctx.stroke();
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = h * 0.02;
    ctx.beginPath();
    ctx.moveTo(flag.pole, h * POLE.bottom);
    ctx.lineTo(flag.pole, h * POLE.top);
    ctx.stroke();
    ctx.strokeStyle = '#d9dee5';
    ctx.lineWidth = h * 0.012;
    ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, h * 0.004);
    ctx.beginPath();
    ctx.arc(flag.pole, h * POLE.top, h * 0.018, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Where the hand has to get to, and the rope's ring, which goes up with the flag.
    if (tour.state === 'raise') {
      const ring = { x: flag.pole - h * 0.06, y: lerp(h * POLE.low, h * POLE.high, tour.raisedTo) };
      ctx.strokeStyle = 'rgb(18 48 77 / 0.35)';
      ctx.setLineDash([h * 0.012, h * 0.012]);
      ctx.lineWidth = Math.max(2, h * 0.004);
      ctx.beginPath();
      ctx.moveTo(ring.x, h * POLE.low);
      ctx.lineTo(ring.x, h * POLE.high);
      ctx.stroke();
      ctx.setLineDash([]);
      // An arrow at the top of the way up.
      ctx.fillStyle = GOLD;
      ctx.strokeStyle = INK;
      ctx.beginPath();
      ctx.moveTo(ring.x, h * POLE.high - h * 0.05);
      ctx.lineTo(ring.x - h * 0.03, h * POLE.high);
      ctx.lineTo(ring.x + h * 0.03, h * POLE.high);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      const asking = !tour.gripped && !this.reducedMotion ? 1 + Math.sin(this.time * 3) * 0.08 : 1;
      ctx.fillStyle = tour.gripped ? '#c9f5d9' : '#ffffff';
      ctx.strokeStyle = tour.gripped ? '#22a35a' : INK;
      ctx.lineWidth = h * 0.008;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, h * 0.035 * asking, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // The flag: from where it was painted to the pole, and then flying on it.
    const from = board ?? flag;
    const [x, y, wide, high] = [lerp(from.x, flag.x, moved), lerp(from.y, flag.y, moved), lerp(from.wide, flag.wide, moved), lerp(from.high, flag.high, moved)];
    ctx.imageSmoothingQuality = 'high';
    this.drawWaving(this.flagCanvas, x, y, wide, high, moved * 0.035);
    if (tour.state === 'settle') this.drawTag(this.nameOf(tour.target), flag.x + flag.wide / 2, flag.y + flag.high + h * 0.06, 1.3);
  }

  drawCup() {
    const { ctx, height: h } = this;
    const grow = this.reducedMotion ? 1 : 1 + Math.sin(this.time * 2.5) * 0.04;
    ctx.font = `${h * 0.2 * grow}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏆', this.centre.x, this.centre.y + h * 0.02);
  }

  drawEffects() {
    const { ctx, height: h } = this;
    for (const effect of this.effects) {
      const share = effect.age / effect.life;
      if (effect.kind === 'stamp') {
        // It shows itself for a moment, and then goes up to the others, getting smaller.
        const going = smooth(clamp((share - 0.4) / 0.6, 0, 1));
        const [x, y] = [lerp(effect.from.x, effect.to.x, going), lerp(effect.from.y, effect.to.y, going)];
        const r = h * lerp(0.075, 0.022, going) * Math.min(1, share / 0.12);
        const mini = this.mini(effect.id);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = INK;
        ctx.lineWidth = Math.max(2, r * 0.07);
        ctx.setLineDash([r * 0.16, r * 0.12]);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        const high = r * 0.85;
        const wide = Math.min(r * 1.5, (high * mini.width) / mini.height);
        ctx.drawImage(mini, x - wide / 2, y - high / 2, wide, high);
        ctx.lineWidth = 1;
        ctx.strokeRect(x - wide / 2, y - high / 2, wide, high);
      } else if (effect.kind === 'fleck') {
        ctx.globalAlpha = 1 - share;
        ctx.fillStyle = effect.colour;
        ctx.strokeStyle = 'rgb(18 48 77 / 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, h * 0.008, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        // A small star that grows and fades.
        const r = h * 0.022 * (0.4 + share);
        ctx.globalAlpha = 1 - share;
        ctx.fillStyle = effect.colour;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let n = 0; n < 8; n += 1) {
          const reach = n % 2 ? r * 0.4 : r;
          const angle = (n * Math.PI) / 4 - Math.PI / 2;
          if (n === 0) ctx.moveTo(effect.x + Math.cos(angle) * reach, effect.y + Math.sin(angle) * reach);
          else ctx.lineTo(effect.x + Math.cos(angle) * reach, effect.y + Math.sin(angle) * reach);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  /** A hand's glove, with the paint that's on it in its palm, and a ring as big as its brush. */
  drawGlove({ glove, x, y, look = null, colour = null, reach = 0, down = false }) {
    if (!glove?.visible) return;
    const { ctx, palmSize, board } = this;
    if (reach > 0 && board) {
      const size = reach * board.unit;
      ctx.lineWidth = Math.max(2, board.unit * 0.45);
      ctx.strokeStyle = down ? '#ffffff' : 'rgb(18 48 77 / 0.5)';
      if (!down) ctx.setLineDash([board.unit * 1.4, board.unit * 1.4]);
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (down) {
        ctx.lineWidth = Math.max(1, board.unit * 0.16);
        ctx.strokeStyle = 'rgb(18 48 77 / 0.6)';
        ctx.beginPath();
        ctx.arc(x, y, size + board.unit * 0.3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // Over the globe the glove is seen through, so that the countries under it can be seen, and a dot in its palm
    // says where it's pointing.
    const finding = this.tour?.state === 'find';
    ctx.save();
    ctx.translate(x - glove.x, y - glove.y);
    ctx.globalAlpha = finding ? 0.55 : 0.94;
    glove.draw(ctx, palmSize, look);
    ctx.restore();
    if (finding) {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(2, palmSize * 0.05);
      ctx.beginPath();
      ctx.arc(x, y, palmSize * 0.13, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (colour) {
      ctx.fillStyle = colour;
      ctx.strokeStyle = INK;
      ctx.lineWidth = palmSize * 0.05;
      ctx.beginPath();
      ctx.arc(x, y, palmSize * 0.27, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}

export { OTHER_GLOVE };
