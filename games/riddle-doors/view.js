// Giraffe's Riddle Doors, drawn in 2D: a hall with a door in the middle and the riddle on it, a shelf at each side
// where the pieces lie, Giraffe peeking over the top of the door, and the child's glove in front of it all. doors.js
// says where everything is, in table units, and this fits the table under the band along the top of the screen.
//
// Nothing flashes: a piece is a small part of the screen, the door swings open over a second, what's behind it is a
// soft garden rather than bright light, a new door fades in, and the last candle going out dims the hall slowly.
import { INK, SECOND_PLAYER, inOnePicture, secondPlayerLook } from '../../core/glove.js';
import { DARK_SECONDS, LABELS, PICK_SECONDS, TABLE, TRY_SECONDS } from './doors.js';
import { drawCell } from './riddle-art.js';

const LABEL_SECONDS = 2.8;
const PRIZE_FLY_SECONDS = 0.9;
const FADE_SECONDS = 0.6; // How long a new door takes to come.
const SETTLE_SECONDS = 0.16; // How long the piece that fits takes to slide the last little way into the gap.
const BACK_SECONDS = 0.55; // And how long a piece that doesn't takes to go back to its shelf.
const SHAKE_SECONDS = 0.5; // How long the door gives its little shake, a piece that doesn't fit having been tried.
const SWING = { from: 0.45, seconds: 1 }; // When the door starts to swing open, after the piece goes in, and for how long.
const MARGIN = 8; // Round the table, in pixels.
const PALM = 0.075; // The glove's palm, in table units.
// Giraffe, behind the door: how tall his body is without his neck, in table units, and how far down the table the tips
// of his horns are. The rest of him is behind the door.
export const GIRAFFE = { tall: 0.36, top: 0.035 };
const HEAD_ABOVE_FEET = 1.31; // How far above his feet the tips of his horns are, in body heights.
const CHEER_HOP = 0.16 / 2.05; // How far up he hops in his cheering picture, in body heights: see POSES in giraffe-maze/walkers.js.
const MARKS = { star: '⭐' };
const COLOURS = {
  wall: '#c9d6e3',
  stone: '#bccbda',
  mortar: '#aebfd0',
  floor: '#b98b5e',
  floorLine: '#a07548',
  shelf: '#e2c193',
  shelfDark: '#c49a62',
  wood: '#a8683a',
  woodDark: '#7d4a26',
  woodLight: '#bf7d48',
  paper: '#fff8e8',
  tile: '#fffdf6',
  held: '#3ddc84',
  gold: '#f5b301',
  garden: '#bfe3a0',
  sky: '#cfe8f7',
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

/** A door's outline: straight sides down to the floor and a round arch over the top, from its corner at (x, y). */
function doorPath(x, y, wide, high, arch) {
  const path = new Path2D();
  path.moveTo(x, y + high);
  path.lineTo(x, y);
  path.quadraticCurveTo(x, y - arch, x + wide / 2, y - arch);
  path.quadraticCurveTo(x + wide, y - arch, x + wide, y);
  path.lineTo(x + wide, y + high);
  path.closePath();
  return path;
}

export class DoorsView {
  /**
   * language() says which language a label is in, prizeTarget() where the prizes' tally is on the screen, and top()
   * how deep the band along the top of the screen is, which the table stays under.
   */
  constructor(canvas, { language = () => 'en', prizeTarget = () => ({ x: 80, y: 40 }), top = () => 130 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.language = language;
    this.prizeTarget = prizeTarget;
    this.topBand = top;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.time = 0;
    this.giraffe = null; // Giraffe's pictures, if they could be drawn: see games/giraffe-garden/giraffe.js.
    this.marks = Object.fromEntries(Object.entries(MARKS).map(([key, mark]) => [key, makeMark(mark)]));
    this.gloveLayer = document.createElement('canvas');
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
    this.hall = null;
    this.drawn = new Map();
  }

  /** A new game: nothing left over from the last one. */
  reset() {
    this.effects = [];
    this.flying = [];
    this.labels = [];
    this.introduced = new Set();
    this.wanted = new Map();
    this.cheerUntil = 0;
    this.moving = new Map(); // Pieces sliding into the gap, or back to their shelf, by number, as { x, y, at, seconds }.
    this.shakeAt = -Infinity;
    this.shownDoor = null;
    this.shownAt = 0;
    this.drawn = new Map();
  }

  /** Where a place on the table is on the screen. */
  at(x, y) {
    return { x: this.left + x * this.scale, y: this.top + y * this.scale };
  }

  /** And where a place on the screen is on the table. */
  fromScreen(x, y) {
    return { x: (x - this.left) / this.scale, y: (y - this.top) / this.scale };
  }

  update(dt) {
    this.time += dt;
    for (const effect of this.effects) effect.life -= dt;
    this.effects = this.effects.filter((effect) => effect.life > 0);
    for (const flight of this.flying) flight.t += dt;
    this.flying = this.flying.filter((flight) => flight.t < PRIZE_FLY_SECONDS);
    for (const label of this.labels) label.life -= dt;
    this.labels = this.labels.filter((label) => label.life > 0 && label.target());
    this.nextLabel();
    for (const [id, move] of this.moving) if (this.time - move.at >= move.seconds) this.moving.delete(id);
  }

  /* ---------- what happens, seen ---------- */

  /** A few small stars, as something good happens, at a place on the table. */
  sparkle(x, y, colour = '#ffe066') {
    const at = this.at(x, y);
    if (this.effects.length < 40) this.effects.push({ kind: 'sparkle', x: at.x, y: at.y, life: 0.7, total: 0.7, colour });
  }

  /** The piece that fits going in: a ring of small stars going out from it. */
  burst(x, y, colour = '#ffe066') {
    const at = this.at(x, y);
    this.effects.push({ kind: 'burst', x: at.x, y: at.y, life: 0.8, total: 0.8, colour });
  }

  /** A piece slides from where it was to where it is now: into the gap, or back to its shelf. */
  slide(tile, from, seconds = SETTLE_SECONDS) {
    this.moving.set(tile.id, { x: from.x, y: from.y, at: this.time, seconds });
  }

  /** A piece that doesn't fit has been tried: it goes back to its shelf, and the door gives a little shake. */
  notThatOne(tile, from) {
    this.slide(tile, from, BACK_SECONDS);
    this.shakeAt = this.time;
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
   * A label, the first time its thing comes along in a game. target() says where it is, on the table, or null once it
   * has gone. They come one at a time, so each is read.
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

  /* ---------- drawn once ---------- */

  /** A canvas the size of the screen, or of a part of it, drawn on in pixels. */
  layer(wide = this.width, high = this.height) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(wide * this.ratio);
    canvas.height = Math.ceil(high * this.ratio);
    const ctx = canvas.getContext('2d');
    ctx.scale(this.ratio, this.ratio);
    return [canvas, ctx];
  }

  /** The hall only changes with the window, and with the size of the door, so it's drawn once for each. */
  hallFor(layout) {
    const key = `hall:${layout.size}`;
    if (!this.drawn.has(key)) {
      const [canvas, ctx] = this.layer();
      this.drawHall(ctx, layout);
      this.drawn.set(key, canvas);
    }
    return this.drawn.get(key);
  }

  /** The hall: its stone wall, its floor, and the shelf at each side. */
  drawHall(ctx, layout) {
    const { width: w, height: h, scale } = this;
    let seed = 41;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    ctx.fillStyle = COLOURS.wall;
    ctx.fillRect(0, 0, w, h);
    // Big soft stones, row by row, each a little different.
    const high = Math.max(40, scale * 0.085);
    const wide = high * 2.1;
    for (let row = 0; row * high < h; row += 1) {
      for (let x = row % 2 ? -wide / 2 : 0; x < w; x += wide) {
        ctx.fillStyle = random() < 0.5 ? COLOURS.stone : COLOURS.wall;
        ctx.strokeStyle = COLOURS.mortar;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x + 2, row * high + 2, wide - 4, high - 4, high * 0.18);
        ctx.fill();
        ctx.stroke();
      }
    }
    const floor = this.at(0, 0.965).y;
    ctx.fillStyle = COLOURS.floor;
    ctx.fillRect(0, floor, w, h - floor);
    ctx.strokeStyle = COLOURS.floorLine;
    ctx.lineWidth = 2;
    for (let x = (w % 120) / 2; x < w; x += 120) {
      ctx.beginPath();
      ctx.moveTo(x, floor);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgb(18 48 77 / 0.2)';
    ctx.fillRect(0, floor, w, 3);
    // The shelves: a board on the wall at each side, with a lip along the bottom of each row of pieces.
    for (const shelf of layout.shelves) {
      const { x, y } = this.at(shelf.x, shelf.y);
      const [across, down] = [shelf.width * scale, shelf.height * scale];
      const round = scale * 0.03;
      ctx.fillStyle = 'rgb(18 48 77 / 0.16)';
      ctx.beginPath();
      ctx.roundRect(x + 3, y + 6, across, down, round);
      ctx.fill();
      ctx.fillStyle = COLOURS.shelf;
      ctx.beginPath();
      ctx.roundRect(x, y, across, down, round);
      ctx.fill();
      ctx.save();
      ctx.clip();
      // The grain of the wood.
      ctx.strokeStyle = COLOURS.shelfDark;
      ctx.lineWidth = 1.5;
      for (let n = 0; n < 14; n += 1) {
        const along = y + (down * (n + random() * 0.6)) / 14;
        ctx.beginPath();
        ctx.moveTo(x, along);
        ctx.bezierCurveTo(x + across * 0.3, along + 4, x + across * 0.6, along - 4, x + across, along + 2);
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = COLOURS.wood;
      ctx.lineWidth = Math.max(5, scale * 0.012);
      ctx.beginPath();
      ctx.roundRect(x, y, across, down, round);
      ctx.stroke();
      const rows = [...new Set(layout.slots.filter((slot) => slot.shelf === layout.shelves.indexOf(shelf)).map((slot) => slot.y))];
      for (const row of rows) {
        const lip = this.at(0, row + layout.cell / 2 + 0.018).y;
        ctx.fillStyle = COLOURS.wood;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x + scale * 0.012, lip, across - scale * 0.024, scale * 0.016, scale * 0.006);
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  /** A door, closed, with its riddle on it and the gap dashed: drawn once for each door, as { canvas, box }. */
  doorFor(door) {
    const key = `door:${door.index}:${door.riddle.size}`;
    if (this.drawn.has(key)) return this.drawn.get(key);
    const { layout } = door;
    const { scale } = this;
    const box = { x: layout.door.x, y: layout.door.y - layout.door.arch, width: layout.door.width, height: layout.door.height + layout.door.arch };
    const pad = 8;
    const [canvas, ctx] = this.layer(box.width * scale + pad * 2, box.height * scale + pad * 2);
    ctx.translate(pad - box.x * scale, pad - box.y * scale);
    this.drawDoor(ctx, door);
    const drawn = { canvas, box, pad };
    this.drawn.set(key, drawn);
    return drawn;
  }

  /** A wooden door with planks and iron studs, its handle, the paper with the riddle on it, and the gap dashed. */
  drawDoor(ctx, door) {
    const { scale } = this;
    const { layout, riddle } = door;
    const { door: frame, board, cell } = layout;
    const [x, y, wide, high, arch] = [frame.x * scale, frame.y * scale, frame.width * scale, frame.height * scale, frame.arch * scale];
    const outline = doorPath(x, y, wide, high, arch);
    ctx.fillStyle = 'rgb(18 48 77 / 0.2)';
    ctx.save();
    ctx.translate(4, 6);
    ctx.fill(outline);
    ctx.restore();
    ctx.fillStyle = COLOURS.wood;
    ctx.fill(outline);
    ctx.save();
    ctx.clip(outline);
    // Planks, down the door.
    const planks = 5;
    for (let n = 0; n < planks; n += 1) {
      ctx.fillStyle = n % 2 ? COLOURS.woodLight : COLOURS.wood;
      ctx.fillRect(x + (wide * n) / planks, y - arch, wide / planks, high + arch);
      ctx.strokeStyle = COLOURS.woodDark;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + (wide * n) / planks, y - arch);
      ctx.lineTo(x + (wide * n) / planks, y + high);
      ctx.stroke();
    }
    // Iron bands across, with studs.
    for (const along of [0.06, 0.93]) {
      const band = y + high * along;
      ctx.fillStyle = '#56606b';
      ctx.fillRect(x, band - scale * 0.012, wide, scale * 0.024);
      ctx.fillStyle = '#8a96a3';
      for (let n = 0; n < 7; n += 1) {
        ctx.beginPath();
        ctx.arc(x + (wide * (n + 0.5)) / 7, band, scale * 0.006, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3.5;
    ctx.stroke(outline);
    // The handle, on the side away from the hinge.
    const handle = { x: x + wide * 0.93, y: (board.y + board.height + 0.07) * scale };
    ctx.fillStyle = '#e0b340';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(handle.x, Math.min(handle.y, y + high - scale * 0.05), scale * 0.016, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // The paper, and the riddle on it.
    const corner = { x: board.x * scale, y: board.y * scale };
    ctx.fillStyle = 'rgb(18 48 77 / 0.25)';
    ctx.fillRect(corner.x + 3, corner.y + 5, board.width * scale, board.height * scale);
    ctx.fillStyle = COLOURS.paper;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(corner.x, corner.y, board.width * scale, board.height * scale, scale * 0.012);
    ctx.fill();
    ctx.stroke();
    const size = cell * scale;
    layout.places.forEach((place, at) => {
      const middle = { x: place.x * scale, y: place.y * scale };
      ctx.save();
      ctx.translate(middle.x, middle.y);
      if (at === riddle.hole) {
        // The gap: dashed, with a question mark faintly in it.
        ctx.fillStyle = 'rgb(18 48 77 / 0.06)';
        ctx.fillRect(-size / 2, -size / 2, size, size);
        ctx.setLineDash([8, 6]);
        ctx.strokeStyle = 'rgb(18 48 77 / 0.55)';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(-size / 2, -size / 2, size, size);
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgb(18 48 77 / 0.22)';
        ctx.font = `700 ${Math.round(size * 0.5)}px Fredoka, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', 0, size * 0.04);
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = 'rgb(18 48 77 / 0.3)';
        ctx.lineWidth = 1.5;
        ctx.fillRect(-size / 2, -size / 2, size, size);
        ctx.strokeRect(-size / 2, -size / 2, size, size);
        drawCell(ctx, riddle.cells[at], size);
      }
      ctx.restore();
    });
  }

  /** A piece, drawn once: a square of card with its picture on it, as { loose, tried, size }. */
  tileFor(tile, cellSize) {
    const key = `tile:${tile.id}`;
    if (this.drawn.has(key)) return this.drawn.get(key);
    const size = cellSize * this.scale;
    const margin = 14;
    const make = (tried) => {
      const [canvas, ctx] = this.layer(size + margin * 2, size + margin * 2);
      ctx.translate(margin + size / 2, margin + size / 2);
      ctx.save();
      ctx.shadowColor = 'rgb(18 48 77 / 0.38)';
      ctx.shadowBlur = 7 * this.ratio;
      ctx.shadowOffsetY = 3.5 * this.ratio;
      ctx.fillStyle = COLOURS.tile;
      ctx.beginPath();
      ctx.roundRect(-size / 2, -size / 2, size, size, size * 0.06);
      ctx.fill();
      ctx.restore();
      drawCell(ctx, tile.cell, size);
      ctx.strokeStyle = 'rgb(18 48 77 / 0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-size / 2, -size / 2, size, size, size * 0.06);
      ctx.stroke();
      if (tried) {
        // Tried, and it didn't fit: faded, with a soft grey cross over it.
        ctx.fillStyle = 'rgb(225 230 236 / 0.62)';
        ctx.beginPath();
        ctx.roundRect(-size / 2, -size / 2, size, size, size * 0.06);
        ctx.fill();
        ctx.strokeStyle = 'rgb(90 104 120 / 0.75)';
        ctx.lineWidth = Math.max(4, size * 0.06);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-size * 0.28, -size * 0.28);
        ctx.lineTo(size * 0.28, size * 0.28);
        ctx.moveTo(size * 0.28, -size * 0.28);
        ctx.lineTo(-size * 0.28, size * 0.28);
        ctx.stroke();
      }
      return canvas;
    };
    const drawn = { loose: make(false), tried: make(true), size: size + margin * 2, inner: size };
    this.drawn.set(key, drawn);
    return drawn;
  }

  /* ---------- drawing ---------- */

  /**
   * Draws everything. model is { doors, glove, offset, friends, waving }: the game as it is, the child's glove and how
   * far it is from where it's drawn (see main.js), each friend's glove as { glove, name, fade }, and whether Giraffe waves.
   */
  render(model = {}) {
    const { ctx, width: w, height: h, ratio } = this;
    const { doors } = model;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (!doors) {
      ctx.fillStyle = COLOURS.wall;
      ctx.fillRect(0, 0, w, h);
      return;
    }
    const { door } = doors;
    if (this.shownDoor !== door) {
      this.shownDoor = door;
      this.shownAt = this.time;
    }
    ctx.drawImage(this.hallFor(door.layout), 0, 0, w, h);
    const coming = ease(clamp((this.time - this.shownAt) / FADE_SECONDS, 0, 1));
    this.drawGiraffe(door.layout, model);
    this.drawDoorway(doors, coming);
    // The pieces on the shelves, the last one moved on top: those tried already under the rest.
    const mine = doors.held;
    const lying = door.tiles.filter((tile) => tile.state === 'loose' || tile.state === 'tried').sort((a, b) => (b.state === 'tried') - (a.state === 'tried') || a.z - b.z);
    for (const tile of lying) this.drawTile(tile, door, { alpha: coming });
    this.drawHover(doors);
    if (mine) this.drawTrying(doors);
    // Friends' pieces and gloves under the child's own. Two in one picture on one screen, the second player's are over
    // the first's, in their own blue, so they're never hidden under them.
    const second = inOnePicture();
    const friends = () => {
      for (const tile of door.tiles) if (tile.state === 'held' && tile !== mine) this.drawTile(tile, door, { lift: 1, ring: second ? SECOND_PLAYER.open : '#b8c4d0' });
      for (const friend of model.friends ?? []) this.drawFriend(friend, second && door.tiles.some((tile) => tile.state === 'held' && tile.holder === friend.id));
    };
    if (!second) friends();
    if (mine) this.drawTile(mine, door, { lift: 1, ring: COLOURS.held });
    const { glove } = model;
    // With a piece in the hand, the glove is see-through, so the piece shows under it.
    if (glove?.visible) this.drawGlove(glove, model.offset, mine ? 0.62 : 1);
    if (second) friends();
    this.drawEffects();
    this.drawFlying();
    for (const label of this.labels) this.drawLabel(label);
    if (doors.phase === 'dark' || (doors.phase === 'done' && doors.lost)) this.drawDark(doors);
  }

  /** Giraffe, behind the door, peeking over the top of it: waving, cheering or watching. */
  drawGiraffe(layout, model) {
    const art = this.giraffe;
    if (!art) return;
    const { ctx, scale } = this;
    let frame = art.frames.stand;
    if (this.time < this.cheerUntil) frame = art.frames.cheer;
    else if (model.waving && !this.reducedMotion) frame = Math.floor(this.time * 1.4) % 2 ? art.frames.wave : art.frames.stand;
    const size = (GIRAFFE.tall * scale) / art.tall;
    const feet = this.at(layout.giraffe.x, GIRAFFE.top + GIRAFFE.tall * HEAD_ABOVE_FEET);
    const top = this.at(0, layout.giraffe.y + 0.02).y;
    // In his cheering picture he's up on his toes. Here it's drawn that much lower, so his head stays where it was and
    // only his arms and his face change.
    const hop = frame === art.frames.cheer ? art.tall * CHEER_HOP : 0;
    ctx.save();
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
   * The door: closed, with the gap's row lit when someone has been on it a while, and the piece that fits sliding into
   * the gap; then, once it's in, swinging open on its hinge on the left to the garden behind. A new door fades in, and
   * gives a little shake when a piece that doesn't fit has been tried.
   */
  drawDoorway(doors, coming) {
    const { ctx, scale } = this;
    const { door } = doors;
    const { box, pad, canvas } = this.doorFor(door);
    const corner = this.at(box.x, box.y);
    const [wide, high] = [box.width * scale, box.height * scale];
    const frame = door.layout.door;
    const outline = doorPath(this.left + frame.x * scale, this.top + frame.y * scale, frame.width * scale, frame.height * scale, frame.arch * scale);
    const opening = door.open ? ease(clamp((doors.phaseFor - SWING.from) / SWING.seconds, 0, 1)) : 0;
    const swing = doors.phase === 'done' && !doors.lost ? 1 : opening;
    if (swing > 0) {
      // The garden behind, seen through the doorway as it opens.
      ctx.save();
      ctx.clip(outline);
      const sky = ctx.createLinearGradient(0, corner.y, 0, corner.y + high);
      sky.addColorStop(0, COLOURS.sky);
      sky.addColorStop(0.62, COLOURS.sky);
      sky.addColorStop(0.62, COLOURS.garden);
      sky.addColorStop(1, '#9fd07e');
      ctx.fillStyle = sky;
      ctx.fillRect(corner.x, corner.y, wide, high);
      ctx.fillStyle = '#ffe28a';
      ctx.beginPath();
      ctx.arc(corner.x + wide * 0.7, corner.y + high * 0.25, scale * 0.045, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3.5;
      ctx.stroke(outline);
    }
    const since = clamp((this.time - this.shakeAt) / SHAKE_SECONDS, 0, 1);
    const shake = this.reducedMotion ? 0 : Math.sin(since * Math.PI * 4) * (1 - since) * scale * 0.008;
    ctx.save();
    ctx.globalAlpha = coming;
    // Turning on its hinge, it looks narrower, towards the hinge.
    ctx.translate(corner.x + shake, corner.y);
    ctx.scale(1 - swing * 0.86, 1);
    ctx.translate(-corner.x, -corner.y);
    ctx.drawImage(canvas, corner.x - pad, corner.y - pad, wide + pad * 2, high + pad * 2);
    if (door.look > 0 && !door.open) this.drawLookRow(door);
    // The piece that fits, in the gap, sliding the last little way in.
    const placed = door.tiles.find((tile) => tile.state === 'placed');
    if (placed) this.drawTile(placed, door, {});
    if (swing > 0) {
      // As it turns away, it darkens a little, as the side of a turning door does.
      ctx.fillStyle = `rgb(60 30 10 / ${(0.35 * swing).toFixed(3)})`;
      ctx.fill(outline);
    }
    ctx.restore();
  }

  /** The gap's row, lit softly, with its pictures drawn again over the light, so they stay as clear as the rest. */
  drawLookRow(door) {
    const { ctx, scale } = this;
    const { row, places, cell } = door.layout;
    const { riddle } = door;
    const at = this.at(row.x, row.y);
    ctx.fillStyle = `rgb(255 214 90 / ${(0.32 * door.look).toFixed(3)})`;
    ctx.strokeStyle = `rgb(245 179 1 / ${(0.9 * door.look).toFixed(3)})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(at.x, at.y, row.width * scale, row.height * scale, scale * 0.012);
    ctx.fill();
    ctx.stroke();
    const size = cell * scale;
    for (let index = riddle.size * (riddle.size - 1); index < riddle.cells.length; index += 1) {
      const middle = this.at(places[index].x, places[index].y);
      ctx.save();
      ctx.translate(middle.x, middle.y);
      if (riddle.cells[index]) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-size / 2, -size / 2, size, size);
        ctx.strokeStyle = 'rgb(18 48 77 / 0.3)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-size / 2, -size / 2, size, size);
        drawCell(ctx, riddle.cells[index], size);
      } else {
        ctx.setLineDash([8, 6]);
        ctx.strokeStyle = 'rgb(18 48 77 / 0.55)';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(-size / 2, -size / 2, size, size);
      }
      ctx.restore();
    }
  }

  /** The ring that fills round a piece an open hand is settling on, until it's picked up. */
  drawHover(doors) {
    const { tile, for: held } = doors.hover;
    if (!tile || held <= 0.02 || doors.held || doors.phase !== 'play' || tile.state !== 'loose') return;
    this.drawRing(tile, doors.layout.cell, held / PICK_SECONDS);
  }

  /** A ring round a place on the table, filling as share goes from 0 to 1. */
  drawRing(at, cell, share) {
    const { ctx, scale } = this;
    const { x, y } = this.at(at.x, at.y);
    const r = cell * scale * 0.74;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgb(255 255 255 / 0.8)';
    ctx.lineWidth = Math.max(6, scale * 0.014);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = COLOURS.held;
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(share, 0, 1));
    ctx.stroke();
    ctx.restore();
  }

  /** The ring that fills round the gap while a piece is held in it, until it's tried. */
  drawTrying(doors) {
    if (doors.trying <= 0.01 || doors.phase !== 'play') return;
    this.drawRing(doors.layout.hole, doors.layout.cell, doors.trying / TRY_SECONDS);
  }

  /**
   * One piece, where it is, or sliding to there. lift is for one in a hand, a little bigger, with a ring round it in
   * the hand's colour.
   */
  drawTile(tile, door, { alpha = 1, lift = 0, ring = null } = {}) {
    const sprite = this.tileFor(tile, door.layout.cell);
    const { ctx } = this;
    let { x, y } = this.at(tile.x, tile.y);
    const move = this.moving.get(tile.id);
    if (move) {
      const share = ease(clamp((this.time - move.at) / move.seconds, 0, 1));
      const from = this.at(move.x, move.y);
      x = from.x + (x - from.x) * share;
      y = from.y + (y - from.y) * share;
    }
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    ctx.rotate((tile.tilt * Math.PI) / 180);
    const grow = 1 + 0.06 * lift;
    ctx.scale(grow, grow);
    if (ring) {
      ctx.strokeStyle = ring;
      ctx.lineWidth = 9;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.roundRect(-sprite.inner / 2, -sprite.inner / 2, sprite.inner, sprite.inner, sprite.inner * 0.06);
      ctx.stroke();
    }
    ctx.drawImage(tile.state === 'tried' ? sprite.tried : sprite.loose, -sprite.size / 2, -sprite.size / 2, sprite.size, sprite.size);
    ctx.restore();
  }

  /** The last candle out: the hall dims slowly, and stays dim. */
  drawDark(doors) {
    const { ctx } = this;
    const share = doors.phase === 'done' ? 1 : ease(clamp(doors.phaseFor / (DARK_SECONDS * 0.7), 0, 1));
    ctx.save();
    ctx.fillStyle = `rgb(20 26 52 / ${(0.42 * share).toFixed(3)})`;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
  }

  /**
   * The child's glove, where it is on the screen. alpha makes it see-through: it's drawn whole, to one side, and then
   * put on the screen, so its fingers don't show through each other.
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
   * picture on one screen, the second player's is in their own blue, and solid unless holding a piece, as the child's
   * own is: holding says so.
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

  drawEffects() {
    const { ctx, scale } = this;
    for (const effect of this.effects) {
      const share = 1 - effect.life / effect.total;
      ctx.save();
      ctx.globalAlpha = clamp(effect.life / effect.total, 0, 1);
      ctx.fillStyle = effect.colour;
      const burst = effect.kind === 'burst';
      const count = burst ? 10 : 6;
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * Math.PI * 2 + 0.4;
        const out = scale * (burst ? 0.05 + share * 0.09 : 0.02 + share * 0.04);
        this.drawStar(effect.x + Math.cos(angle) * out, effect.y + Math.sin(angle) * out, scale * (burst ? 0.012 : 0.008) * (1 - share * 0.5));
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
      const size = this.scale * 0.085 * (1.2 - 0.6 * share);
      this.ctx.drawImage(this.marks[flight.kind], x - size / 2, y - size / 2, size, size);
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

