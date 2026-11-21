// Everything drawn flat over the valley: the crosshair in each of its looks, the ring showing how far the
// gun can reach, where the tank's going, where shells will land and how much each robot tank has left.
// A state is never shown by colour alone: each has its own shape too.
//
// A closed hand makes it a marker lying on the ground, saying "go here". An open hand makes it a sight
// standing up, a ring with ticks, which turns green and spins when the gun's firing.
//
// Nothing flashes or strobes, as seizures are more common in children with hemiplegia. Firing is shown by
// shapes turning, never by anything lighting up, and nothing big comes or goes quickly.
import { INK } from '../../core/glove.js';

const TAU = Math.PI * 2;
const GO = '#ffd23f';
const FIRING = '#35e07a';
const FAR = '#ff9a3c';
const READY = '#ffffff';
const LOST = '#c6d0db';
const SHELL = '#ff5a4f';
const POP_SECONDS = 0.22;
const SQUASH = 0.72; // How flat a ring lying on the ground looks, at the angle the camera's at.

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

function starPath(ctx, x, y, outer, inner, points = 5, turn = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const reach = i % 2 ? inner : outer;
    const angle = turn + (i / (points * 2)) * TAU;
    ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(angle) * reach, y + Math.sin(angle) * reach);
  }
  ctx.closePath();
}

/** A little closed hand, as a picture of what to do. */
function fistIcon(ctx, x, y, size) {
  ctx.fillStyle = '#ffc21a';
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(2, size * 0.09);
  ctx.beginPath();
  ctx.roundRect(x - size * 0.5, y - size * 0.32, size, size * 0.74, size * 0.24);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  for (const share of [-0.25, 0, 0.25]) {
    ctx.moveTo(x + size * share, y - size * 0.32);
    ctx.lineTo(x + size * share, y - size * 0.04);
  }
  ctx.moveTo(x - size * 0.5, y + size * 0.08);
  ctx.lineTo(x + size * 0.18, y + size * 0.08);
  ctx.stroke();
}

/** A thick line with a dark edge, which shows up on anything. */
function inkLine(ctx, draw, colour, width, edge = 4) {
  draw();
  ctx.strokeStyle = INK;
  ctx.lineWidth = width + edge;
  ctx.stroke();
  draw();
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.stroke();
}

export class Marks {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.time = 0;
    this.spin = 0;
    this.pop = 0;
    this.lastLook = null;
    this.ring = 0;
    this.gloveSide = 1;
    this.sharpness = Math.min(window.devicePixelRatio || 1, 2);
    this.resize();
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.ratio = this.sharpness;
    this.canvas.width = Math.round(this.width * this.ratio);
    this.canvas.height = Math.round(this.height * this.ratio);
  }

  /** A slow computer draws these less sharply, rather than losing frames. */
  setSharpness(ratio) {
    this.sharpness = ratio;
    this.resize();
  }

  clear() {
    const { ctx, ratio, width, height } = this;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
  }

  /** state has what's needed to draw a frame, all in pixels: see Field.drawMarks. */
  draw(state, dt) {
    const { ctx } = this;
    this.time += dt;
    this.clear();
    if (!state) return;
    this.spin += dt * (this.reducedMotion ? 0 : state.crosshair?.look === 'firing' ? 3.4 : 0.6);
    this.pop = Math.max(0, this.pop - dt / POP_SECONDS);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (state.range) this.drawRange(state.range);
    for (const shell of state.shells) this.drawShell(shell);
    if (state.route.length > 1) this.drawRoute(state.route, state.crosshair?.look === 'go');
    if (state.line) this.drawAimLine(state.line);
    for (const bar of state.bars) this.drawBar(bar);
    for (const sleep of state.sleeping) this.drawSleep(sleep);
    if (state.friendMark) this.drawFriendMark(state.friendMark);
    if (state.crosshair) this.drawCrosshair(state.crosshair);
    for (const label of state.labels ?? []) this.drawLabel(label);
  }

  /** The name of something new, in a little white bubble with a point at the bottom. */
  drawLabel({ x, y, words, alpha }) {
    const { ctx } = this;
    const size = clamp(this.height * 0.03, 15, 26);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `600 ${size}px Fredoka, "Noto Sans Georgian", sans-serif`;
    const wide = ctx.measureText(words).width + size * 1.2;
    const high = size * 1.7;
    const top = Math.max(4, y - high - size * 0.5);
    // Kept on the screen, with its point still under the thing it names.
    const left = clamp(x - wide / 2, 6, this.width - wide - 6);
    const point = clamp(x, left + high / 2, left + wide - high / 2);
    ctx.beginPath();
    ctx.roundRect(left, top, wide, high, high / 2);
    ctx.moveTo(point - size * 0.4, top + high);
    ctx.lineTo(point, top + high + size * 0.5);
    ctx.lineTo(point + size * 0.4, top + high);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(words, left + wide / 2, top + high / 2 + 1);
    ctx.restore();
  }

  /** How far the gun reaches: a ring on the ground round the tank. */
  drawRange({ points, look }) {
    const { ctx } = this;
    const trace = () => {
      ctx.beginPath();
      points.forEach(({ x, y }, index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
    };
    const colour = look === 'firing' ? FIRING : look === 'far' ? FAR : READY;
    const strong = look === 'firing' || look === 'far' || look === 'ready';
    trace();
    ctx.fillStyle = 'rgb(255 255 255 / 0.07)';
    ctx.fill();
    trace();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgb(18 48 77 / 0.5)';
    ctx.lineWidth = strong ? 8 : 6;
    ctx.stroke();
    trace();
    ctx.setLineDash([22, 16]);
    ctx.lineDashOffset = this.reducedMotion ? 0 : -this.time * 12;
    ctx.strokeStyle = colour;
    ctx.lineWidth = strong ? 4.5 : 3;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** Where the tank is going: dots along the way, which go along it too. */
  drawRoute(route, strong) {
    const { ctx } = this;
    const gap = 22;
    let carry = this.reducedMotion ? 0 : (this.time * 40) % gap;
    ctx.fillStyle = strong ? GO : READY;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    for (let i = 0; i < route.length - 1; i += 1) {
      const a = route[i];
      const b = route[i + 1];
      const leg = Math.hypot(b.x - a.x, b.y - a.y);
      let at = carry;
      while (at < leg) {
        const share = at / leg;
        ctx.beginPath();
        ctx.arc(a.x + (b.x - a.x) * share, a.y + (b.y - a.y) * share, 4.2, 0, TAU);
        ctx.fill();
        ctx.stroke();
        at += gap;
      }
      carry = at - leg;
    }
  }

  /** From the tank to the crosshair, and which part of the way is out of reach. */
  drawAimLine({ from, to, reachShare }) {
    const { ctx } = this;
    const dotted = (a, b, colour) => {
      ctx.setLineDash([3, 13]);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.strokeStyle = colour;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.setLineDash([]);
    };
    const edge = { x: from.x + (to.x - from.x) * reachShare, y: from.y + (to.y - from.y) * reachShare };
    dotted(from, edge, READY);
    if (reachShare < 1) dotted(edge, to, FAR);
  }

  /** Where a shell will land: a ring on the ground that fills in as it comes down. */
  drawShell({ x, y, rx, ry, share }) {
    const { ctx } = this;
    const ring = (radiusX, radiusY) => {
      ctx.beginPath();
      ctx.ellipse(x, y, radiusX, radiusY, 0, 0, TAU);
    };
    ring(rx, ry);
    ctx.fillStyle = 'rgb(255 90 79 / 0.14)';
    ctx.fill();
    if (share > 0) {
      ring(rx * share, ry * share);
      ctx.fillStyle = 'rgb(255 90 79 / 0.42)';
      ctx.fill();
    }
    ring(rx, ry);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 7.5;
    ctx.stroke();
    ring(rx, ry);
    ctx.setLineDash([14, 9]);
    ctx.lineDashOffset = this.reducedMotion ? 0 : -this.time * 14;
    ctx.strokeStyle = SHELL;
    ctx.lineWidth = 4.5;
    ctx.stroke();
    ctx.setLineDash([]);
    // A cross in the middle, which says "not here".
    const size = Math.min(rx, ry) * 0.22;
    inkLine(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(x - size, y - size * SQUASH);
      ctx.lineTo(x + size, y + size * SQUASH);
      ctx.moveTo(x + size, y - size * SQUASH);
      ctx.lineTo(x - size, y + size * SQUASH);
    }, SHELL, 4, 3.5);
  }

  /** How much a robot tank has left: chunky blocks above it, one for each hit it can take. */
  drawBar({ x, y, width, share, blocks }) {
    const { ctx } = this;
    const height = Math.max(9, width * 0.17);
    const left = x - width / 2;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.roundRect(left - 3, y - 3, width + 6, height + 6, height * 0.55);
    ctx.fill();
    const count = Math.max(1, blocks);
    const gap = 2;
    const each = (width - gap * (count - 1)) / count;
    const filled = share * count;
    for (let i = 0; i < count; i += 1) {
      const amount = clamp(filled - i, 0, 1);
      ctx.fillStyle = 'rgb(255 255 255 / 0.22)';
      ctx.fillRect(left + i * (each + gap), y, each, height);
      if (amount > 0) {
        ctx.fillStyle = share > 0.5 ? '#6be35a' : share > 0.25 ? '#ffd23f' : '#ff9a4d';
        ctx.fillRect(left + i * (each + gap), y, each * amount, height);
      }
    }
  }

  /** A little z over a tank that's waiting for a child who's resting. */
  drawSleep({ x, y }) {
    const { ctx, time, reducedMotion } = this;
    ctx.font = '700 20px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 2; i += 1) {
      const rise = reducedMotion ? i * 16 : (((time * 0.7 + i * 0.5) % 1) * 30);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      ctx.strokeText('z', x + 14 + i * 8, y - rise);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('z', x + 14 + i * 8, y - rise);
    }
  }

  drawCrosshair(crosshair) {
    const { ctx } = this;
    const { x, y, look, radius, target, glove, palmSize, auto, tankX } = crosshair;
    if (look !== this.lastLook) {
      this.pop = 1;
      this.lastLook = look;
    }
    const wanted = look === 'firing' && target ? Math.max(radius * 0.78, target * 1.15) : radius;
    this.ring += (wanted - this.ring) * 0.25;
    const R = (this.ring || wanted) * (1 + this.pop * 0.14);

    if (look === 'go') this.drawGoHere(x, y, R);
    else if (look === 'lost') this.drawLost(x, y, R);
    else this.drawSight(x, y, R, look, auto);

    // A little copy of the hand beside it, so the crosshair is plainly the hand, on the side away from
    // the tank so as not to hide Giraffe.
    if (glove?.visible) {
      const reach = R + palmSize * 1.9;
      let side = x >= tankX ? 1 : -1;
      if (x + side * reach > this.width - palmSize || x + side * reach < palmSize) side = -side;
      this.gloveSide += (side - this.gloveSide) * 0.14;
      ctx.save();
      ctx.translate(x + this.gloveSide * reach - glove.x, y + R * 0.3 - glove.y);
      glove.draw(ctx, palmSize);
      ctx.restore();
    }
  }

  /**
   * Two on one screen, in one picture: the friend's crosshair, where their game says it is, all in the colour of
   * their tank, with a dotted line to it from their tank. It has the same shapes as the child's own: a marker on
   * the ground for a closed hand, and a sight for an open one.
   */
  drawFriendMark({ x, y, from, look, radius, colour }) {
    if (look === 'lost') return;
    const { ctx } = this;
    ctx.save();
    ctx.setLineDash([3, 13]);
    inkLine(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(x, y);
    }, colour, 5, 3);
    ctx.setLineDash([]);
    if (look === 'go') this.drawGoHere(x, y, radius, colour);
    else this.drawSight(x, y, radius, look, false, colour);
    ctx.restore();
  }

  /** A closed hand: a marker lying on the ground, with arrows going in and one coming down on it. colour is the friend's. */
  drawGoHere(x, y, R, colour = GO) {
    const { ctx, time, reducedMotion } = this;
    const flat = (radius) => {
      ctx.beginPath();
      ctx.ellipse(x, y, radius, radius * SQUASH, 0, 0, TAU);
    };
    flat(R);
    ctx.save();
    ctx.globalAlpha = 0.26;
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.restore();
    inkLine(ctx, () => flat(R), colour, 7, 5);
    inkLine(ctx, () => flat(R * 0.46), colour, 4, 4);

    // Four arrows, going in towards the middle.
    const going = reducedMotion ? 0.4 : (time * 0.9) % 1;
    for (let i = 0; i < 4; i += 1) {
      const angle = Math.PI / 4 + (i * Math.PI) / 2;
      const reach = R * (1.42 - going * 0.3);
      const px = x + Math.cos(angle) * reach;
      const py = y + Math.sin(angle) * reach * SQUASH;
      const size = R * 0.24;
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(1, SQUASH);
      ctx.rotate(angle + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(-size, -size * 0.55);
      ctx.lineTo(size, -size * 0.55);
      ctx.lineTo(0, size * 0.75);
      ctx.closePath();
      ctx.fillStyle = colour;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // The big arrow, bobbing over the place.
    const bob = reducedMotion ? 0 : Math.abs(Math.sin(time * 3.4)) * R * 0.2;
    const tip = y - R * 0.05 - bob;
    const w = R * 0.42;
    ctx.beginPath();
    ctx.moveTo(x, tip);
    ctx.lineTo(x + w, tip - w * 1.05);
    ctx.lineTo(x + w * 0.42, tip - w * 1.05);
    ctx.lineTo(x + w * 0.42, tip - w * 2.1);
    ctx.lineTo(x - w * 0.42, tip - w * 2.1);
    ctx.lineTo(x - w * 0.42, tip - w * 1.05);
    ctx.lineTo(x - w, tip - w * 1.05);
    ctx.closePath();
    ctx.fillStyle = colour;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4.5;
    ctx.fill();
    ctx.stroke();
  }

  /** An open hand: a sight standing up, which goes green and spins when it's firing. own is the friend's colour, for theirs. */
  drawSight(x, y, R, look, auto, own = null) {
    const { ctx } = this;
    const colour = own ?? (look === 'firing' ? FIRING : look === 'far' ? FAR : READY);
    ctx.save();
    ctx.translate(x, y);
    const circle = (radius) => {
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, TAU);
    };
    if (look === 'firing') {
      circle(R);
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = own ?? FIRING;
      ctx.fill();
      ctx.restore();
    }
    circle(R);
    ctx.strokeStyle = INK;
    ctx.lineWidth = look === 'firing' ? 13 : 11;
    ctx.stroke();
    circle(R);
    ctx.strokeStyle = colour;
    ctx.lineWidth = look === 'firing' ? 8 : 6.5;
    if (look === 'far') ctx.setLineDash([R * 0.34, R * 0.2]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Four marks pointing in, which turn quickly while it's firing.
    ctx.save();
    ctx.rotate(this.spin);
    for (let i = 0; i < 4; i += 1) {
      ctx.rotate(Math.PI / 2);
      const [inner, outer] = look === 'firing' ? [R * 0.42, R * 1.12] : [R * 0.56, R * 1.16];
      ctx.strokeStyle = INK;
      ctx.lineWidth = 9.5;
      ctx.beginPath();
      ctx.moveTo(0, -inner);
      ctx.lineTo(0, -outer);
      ctx.stroke();
      ctx.strokeStyle = look === 'firing' ? '#f3fff0' : colour;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, -inner);
      ctx.lineTo(0, -outer);
      ctx.stroke();
    }
    ctx.restore();

    if (look === 'firing') {
      starPath(ctx, 0, 0, R * 0.28, R * 0.12, 5, this.spin);
      ctx.fillStyle = '#fff3c4';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.fill();
      ctx.stroke();
    } else if (look === 'far') {
      // Too far off. If it's up to the child to get nearer, the hand that does that is shown.
      if (auto) {
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, TAU);
        ctx.fill();
      } else {
        fistIcon(ctx, 0, 0, R * 0.74);
      }
    } else {
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 4.6, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /** A hand that can't be read does nothing, and looks like it. */
  drawLost(x, y, R) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.setLineDash([12, 14]);
    ctx.beginPath();
    ctx.arc(x, y, R * 0.8, 0, TAU);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, R * 0.8, 0, TAU);
    ctx.strokeStyle = LOST;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
  }
}
