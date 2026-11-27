// Left, Right, Pop!: draws what rules.js says, on the game's canvas: a soft sky with a strip of grass, the circles, the
// big balloons to clap on, the bursts when they pop, a clap where the hands meet, and the two gloves, each with its
// name under it. Nothing
// flashes: a pop is a small burst of its own colour, and a circle that fades just goes paler and smaller.
import { INK } from '../../core/glove.js';
import { COLOURS, FADE_SECONDS, GROW_SECONDS, HAND_COLOURS, HOLD_SECONDS, POP_SECONDS } from './rules.js';

const RAINBOW = ['#ef4136', '#ff8a1f', '#ffd60a', '#22a94a', '#2f6fe4', '#9b5de5'];
// A big balloon is the left hand's red on its left and the right hand's green on its right.
const BALLOON = [COLOURS[HAND_COLOURS.left].fill, COLOURS[HAND_COLOURS.right].fill];
const PALM_SIZE = 0.12; // The glove's palm, in screen heights.
const BURST_SECONDS = 0.6;
const CLAP_SECONDS = 0.35;
const TAG_WORDS = { left: { en: 'Left', ka: 'მარცხენა' }, right: { en: 'Right', ka: 'მარჯვენა' } };

const easeOutBack = (t) => {
  const s = 1.6;
  const u = t - 1;
  return 1 + (s + 1) * u * u * u + s * u * u;
};

export class PopView {
  constructor(canvas, { language = () => 'en' } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.language = language;
    this.bursts = [];
    this.marks = [];
    this.claps = [];
    this.time = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.ratio = Math.min(2, window.devicePixelRatio || 1);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.round(this.width * this.ratio);
    this.canvas.height = Math.round(this.height * this.ratio);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
  }

  get aspect() {
    return this.width / Math.max(1, this.height);
  }

  get palmSize() {
    return this.height * PALM_SIZE;
  }

  /** Where a place in shares of the screen is, in pixels. */
  at(x, y) {
    return { x: x * this.width, y: y * this.height };
  }

  /** A small burst of a circle's own colour where it popped. */
  burst(x, y, colour, r) {
    const at = this.at(x, y);
    const fill = colour === 'rainbow' || colour === 'balloon' ? null : COLOURS[colour]?.fill ?? '#ffffff';
    const size = r * this.height;
    for (let index = 0; index < 14; index += 1) {
      const angle = (index / 14) * Math.PI * 2 + Math.random() * 0.3;
      // A balloon's bits are red on its left and green on its right, as it was.
      const balloonBit = Math.cos(angle) < 0 ? BALLOON[0] : BALLOON[1];
      const speed = size * (2.2 + Math.random() * 1.6);
      this.bursts.push({
        x: at.x + Math.cos(angle) * size * 0.5,
        y: at.y + Math.sin(angle) * size * 0.5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: size * (0.12 + Math.random() * 0.08),
        colour: fill ?? (colour === 'balloon' ? balloonBit : RAINBOW[index % RAINBOW.length]),
        age: 0,
      });
    }
  }

  /** Short lines out from where two hands met in a clap, which widen and go in a third of a second. */
  clap(x, y) {
    const at = this.at(x, y);
    this.claps.push({ x: at.x, y: at.y, age: 0 });
  }

  /** A star or a gem that floats up from where it was won, and goes. */
  prize(x, y, mark) {
    const at = this.at(x, y);
    this.marks.push({ x: at.x, y: at.y, mark, age: 0 });
  }

  update(dt) {
    this.time += dt;
    for (const bit of this.bursts) {
      bit.age += dt;
      bit.x += bit.vx * dt;
      bit.y += bit.vy * dt;
      bit.vx *= Math.exp(-dt * 4);
      bit.vy = bit.vy * Math.exp(-dt * 4) + this.height * 0.4 * dt;
    }
    this.bursts = this.bursts.filter((bit) => bit.age < BURST_SECONDS);
    for (const mark of this.marks) mark.age += dt;
    this.marks = this.marks.filter((mark) => mark.age < 1.4);
    for (const clap of this.claps) clap.age += dt;
    this.claps = this.claps.filter((clap) => clap.age < CLAP_SECONDS);
  }

  reset() {
    this.bursts = [];
    this.marks = [];
    this.claps = [];
  }

  /** rules is what's there, gloves the two gloves, palm their size, asked the hands asked for, names whether to write colours on the circles. */
  render({ rules, gloves, palm, asked = [], names = false }) {
    const { ctx, height, ratio } = this;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.drawSky();
    if (rules) {
      // Names only go on the circles from level 6, where there are colours to tell apart.
      for (const circle of rules.circles) this.drawCircle(circle, names && !rules.plan.simple);
    }
    for (const bit of this.bursts) {
      ctx.globalAlpha = 1 - bit.age / BURST_SECONDS;
      ctx.fillStyle = bit.colour;
      ctx.beginPath();
      ctx.arc(bit.x, bit.y, bit.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const mark of this.marks) {
      ctx.globalAlpha = Math.max(0, 1 - mark.age / 1.4);
      ctx.font = `${Math.round(height * 0.07)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(mark.mark, mark.x, mark.y - mark.age * height * 0.12);
    }
    ctx.globalAlpha = 1;
    for (const clap of this.claps) {
      const t = clap.age / CLAP_SECONDS;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(3, height * 0.008);
      ctx.lineCap = 'round';
      for (let index = 0; index < 8; index += 1) {
        const angle = (index / 8) * Math.PI * 2 + Math.PI / 8;
        const from = height * (0.09 + t * 0.05);
        const to = height * (0.13 + t * 0.07);
        ctx.beginPath();
        ctx.moveTo(clap.x + Math.cos(angle) * from, clap.y + Math.sin(angle) * from);
        ctx.lineTo(clap.x + Math.cos(angle) * to, clap.y + Math.sin(angle) * to);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    if (gloves) {
      for (const side of ['left', 'right']) {
        const glove = gloves[side];
        if (!glove?.visible) continue;
        glove.draw(ctx, palm);
        this.drawTag(glove, side, palm, asked.find((ask) => ask.hand === side || ask.hand === 'both'));
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  drawSky() {
    const { ctx, width, height } = this;
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#a9dcff');
    sky.addColorStop(0.7, '#e9f7ff');
    sky.addColorStop(1, '#f6fcff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
    // Soft hills along the bottom, pale enough never to look like a circle.
    ctx.fillStyle = '#cdeccb';
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, height * 0.9);
    ctx.quadraticCurveTo(width * 0.25, height * 0.84, width * 0.5, height * 0.9);
    ctx.quadraticCurveTo(width * 0.75, height * 0.96, width, height * 0.88);
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();
  }

  drawCircle(circle, names) {
    const { ctx, height } = this;
    const at = this.at(circle.x, circle.y);
    let scale = 1;
    let alpha = 1;
    if (circle.state === 'growing') scale = easeOutBack(Math.min(1, circle.age / GROW_SECONDS));
    if (circle.state === 'popped') {
      // A ring that widens and goes, where the burst is.
      const t = Math.min(1, circle.endAge / POP_SECONDS);
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = circle.kind === 'rainbow' || circle.kind === 'balloon' ? '#ffffff' : COLOURS[circle.colour]?.fill ?? '#ffffff';
      ctx.lineWidth = circle.r * height * 0.12;
      ctx.beginPath();
      ctx.arc(at.x, at.y, circle.r * height * (1 + t * 0.4), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }
    if (circle.state === 'fading') {
      const t = Math.min(1, circle.endAge / FADE_SECONDS);
      alpha = 1 - t;
      scale = 1 - t * 0.35;
    }
    const r = circle.r * height * Math.max(0, scale);
    if (r <= 0) return;
    const wobble = Math.sin(this.time * 28) * circle.wobble * r * 0.12;
    const x = at.x + wobble;
    const { y } = at;
    if (circle.kind === 'balloon') {
      this.drawBalloon(x, y, r, alpha);
      return;
    }
    ctx.save();
    ctx.globalAlpha = alpha;

    // A circle to hold has a bubble round it, and a ring that closes while the hand is on it.
    if (circle.hold) {
      ctx.fillStyle = 'rgb(255 255 255 / 0.35)';
      ctx.strokeStyle = 'rgb(255 255 255 / 0.9)';
      ctx.lineWidth = Math.max(2, r * 0.05);
      ctx.beginPath();
      ctx.arc(x, y, r * 1.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (circle.kind === 'rainbow') {
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      RAINBOW.forEach((colour, index) => {
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.arc(x, y, r * (1 - index / RAINBOW.length) * 0.96, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
    } else {
      ctx.fillStyle = COLOURS[circle.colour]?.fill ?? '#cccccc';
      ctx.fill();
    }
    ctx.lineWidth = Math.max(3, r * 0.08);
    ctx.strokeStyle = INK;
    ctx.stroke();

    // A shine, so it looks round.
    ctx.fillStyle = 'rgb(255 255 255 / 0.4)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.35, y - r * 0.4, r * 0.28, r * 0.17, -0.6, 0, Math.PI * 2);
    ctx.fill();

    // A big circle has a seam where it will split in two.
    if (circle.big) {
      ctx.strokeStyle = 'rgb(18 48 77 / 0.55)';
      ctx.lineWidth = Math.max(2, r * 0.04);
      ctx.setLineDash([r * 0.12, r * 0.1]);
      ctx.beginPath();
      ctx.moveTo(x, y - r * 0.92);
      ctx.lineTo(x, y + r * 0.92);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (circle.star) this.drawStar(x, y, r * 0.42);

    if (names && circle.kind !== 'rainbow') {
      const colour = COLOURS[circle.colour];
      const word = this.language() === 'ka' ? colour.nameKa : colour.name;
      ctx.font = `700 ${Math.round(r * (word.length > 7 ? 0.26 : 0.36))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(3, r * 0.08);
      ctx.strokeStyle = INK;
      ctx.fillStyle = '#ffffff';
      const below = circle.star ? r * 0.62 : 0;
      ctx.strokeText(word, x, y + below);
      ctx.fillText(word, x, y + below);
    }

    if (circle.hold && circle.holding > 0) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(4, r * 0.12);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(x, y, r * 1.18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, circle.holding / HOLD_SECONDS));
      ctx.stroke();
    }
    ctx.restore();
  }

  drawStar(x, y, size) {
    const { ctx } = this;
    ctx.beginPath();
    for (let point = 0; point < 10; point += 1) {
      const angle = -Math.PI / 2 + (point * Math.PI) / 5;
      const reach = point % 2 === 0 ? size : size * 0.45;
      ctx[point === 0 ? 'moveTo' : 'lineTo'](x + Math.cos(angle) * reach, y + Math.sin(angle) * reach);
    }
    ctx.closePath();
    ctx.fillStyle = '#fff3b0';
    ctx.fill();
    ctx.lineWidth = Math.max(2, size * 0.12);
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

  /**
   * A big balloon for both hands: red on the left, for the left hand, and green on the right, for the right hand, a
   * little taller than wide, with its knot and a string hanging from it.
   */
  drawBalloon(x, y, r, alpha) {
    const { ctx } = this;
    const tall = r * 1.08;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // The string, swaying a little.
    const sway = Math.sin(this.time * 1.6) * r * 0.12;
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, r * 0.03);
    ctx.beginPath();
    ctx.moveTo(x, y + tall + r * 0.1);
    ctx.quadraticCurveTo(x + sway + r * 0.25, y + tall + r * 0.45, x - sway * 0.5, y + tall + r * 0.8);
    ctx.stroke();
    // The knot.
    ctx.fillStyle = BALLOON[0];
    ctx.beginPath();
    ctx.moveTo(x, y + tall - r * 0.02);
    ctx.lineTo(x - r * 0.1, y + tall + r * 0.13);
    ctx.lineTo(x + r * 0.1, y + tall + r * 0.13);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.04);
    ctx.stroke();
    // The two halves.
    const shape = () => {
      ctx.beginPath();
      ctx.ellipse(x, y, r, tall, 0, 0, Math.PI * 2);
    };
    for (const [index, from] of [[0, Math.PI / 2], [1, -Math.PI / 2]]) {
      ctx.save();
      shape();
      ctx.clip();
      ctx.fillStyle = BALLOON[index];
      ctx.beginPath();
      ctx.ellipse(x, y, r, tall, 0, from, from + Math.PI);
      ctx.lineTo(x, y);
      ctx.fill();
      ctx.restore();
    }
    shape();
    ctx.lineWidth = Math.max(3, r * 0.06);
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y - tall);
    ctx.lineTo(x, y + tall);
    ctx.lineWidth = Math.max(2, r * 0.025);
    ctx.stroke();
    // A shine, so it looks round.
    ctx.fillStyle = 'rgb(255 255 255 / 0.42)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.42, y - tall * 0.45, r * 0.2, r * 0.12, -0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** The glove's name under its wrist: in the asked colour when that hand is asked for, and its own for a balloon. */
  drawTag(glove, side, palm, ask) {
    const { ctx } = this;
    const wrist = glove.points[0];
    const x = glove.x + wrist.x;
    const y = glove.y + wrist.y + palm * 0.32;
    const word = TAG_WORDS[side][this.language() === 'ka' ? 'ka' : 'en'];
    const size = Math.round(palm * 0.24);
    ctx.save();
    ctx.font = `700 ${size}px system-ui, sans-serif`;
    const w = ctx.measureText(word).width + size * 1.1;
    const h = size * 1.5;
    const asked = ask?.hand === 'both' ? HAND_COLOURS[side] : ask?.colour;
    const colour = asked ? COLOURS[asked]?.fill ?? '#ffffff' : '#ffffff';
    ctx.fillStyle = colour;
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, size * 0.14);
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = asked && asked !== 'yellow' ? '#ffffff' : INK;
    ctx.fillText(word, x, y + size * 0.05);
    ctx.restore();
  }
}
