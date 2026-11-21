// A big glove on screen that copies the child's hand finger by finger, for the hand games. Its shape
// comes from the tracker's real points. It's green when open and yellow when not, and a game can
// stain it for a while, as Balloon Pop does when the wrong answer burns it.

// The part of the camera picture that fills the screen, so the whole play area can be reached
// without the hand leaving the picture.
const VIEW = { left: 0.1, right: 0.9, top: 0.1, bottom: 0.88 };

const FOLLOW_RATE = 20; // How tightly a glove follows the hand. Higher is tighter but shakier.
const FINGERS = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
const PALM = [0, 1, 5, 9, 13, 17];
const PALM_CENTRE = [0, 5, 9, 13, 17];
const TIPS = [4, 8, 12, 16, 20];
const GLOVE_COLOURS = { open: '#3ddc84', closed: '#ffc21a' };
export const INK = '#12304d';

/**
 * The second player's glove, while two play in one picture on one screen (see core/one-picture.js), where it's in
 * the first player's game as a friend's is: solid, and blue where the first player's is green, so that each knows
 * their own at a glance. It's a deeper blue when it isn't open, as the first player's is yellow then, and its name is
 * on a tag of the same blue.
 */
export const SECOND_PLAYER = { open: '#6f7cff', closed: '#4651cf', ink: INK, tag: '#3b45b5' };

/** Whether this game is the one picture two play in on one screen, just now, where a friend is the second player. */
export const inOnePicture = () => globalThis.document?.documentElement?.dataset.picture === 'one';

/** How the second player's glove is drawn, open or not, fading only as it comes and goes. */
export const secondPlayerLook = (glove, alpha = 1) => ({ fill: SECOND_PLAYER[glove.status === 'open' ? 'open' : 'closed'], ink: SECOND_PLAYER.ink, alpha });

const channels = (hex) => [0, 2, 4].map((at) => parseInt(hex.slice(at + 1, at + 3), 16));

/** A colour part of the way to another one. */
export function mixColours(from, to, share) {
  const [a, b] = [channels(from), channels(to)];
  return `rgb(${a.map((value, index) => Math.round(value + (b[index] - value) * share)).join(' ')})`;
}

/** Where a point in the mirror picture lands on the screen. */
export function toScreen(x, y, width, height) {
  return {
    x: ((x - VIEW.left) / (VIEW.right - VIEW.left)) * width,
    y: ((y - VIEW.top) / (VIEW.bottom - VIEW.top)) * height,
  };
}

export class Glove {
  constructor(side) {
    this.side = side;
    this.visible = false;
    this.status = 'missing';
    this.stain = 0; // How much of the stain colour shows, from nothing to all of it.
    this.stainColour = '#352c28';
    this.embers = false; // Little hot spots on the fingertips.
    this.x = 0;
    this.y = 0;
    this.speed = 0; // In screen heights a second.
    this.points = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
  }

  hide() {
    this.visible = false;
    this.status = 'missing';
    this.speed = 0;
  }

  /** field has the aspect of the camera picture, the screen's width and height, and a palm size. */
  follow(view, dt, field) {
    this.status = view.status;
    if (view.status === 'missing') {
      this.visible = false;
      return;
    }
    const { image } = view;
    if (!image) return; // Riding out a dropped detection: stay where it is.

    let cx = 0;
    let cy = 0;
    for (const index of PALM_CENTRE) {
      cx += image[index].x / PALM_CENTRE.length;
      cy += image[index].y / PALM_CENTRE.length;
    }
    const { aspect, palmSize, width, height } = field;
    const palm = Math.hypot((image[0].x - image[9].x) * aspect, image[0].y - image[9].y) || 0.1;
    // The same size on screen however far the hand is from the camera.
    const scale = palmSize / palm;
    const target = toScreen(cx, cy, width, height);

    const blend = this.visible ? 1 - Math.exp(-dt * FOLLOW_RATE) : 1;
    const [lastX, lastY] = [this.x, this.y];
    this.x += (target.x - this.x) * blend;
    this.y += (target.y - this.y) * blend;
    if (this.visible && dt > 0) {
      const moved = Math.hypot(this.x - lastX, this.y - lastY) / height / dt;
      this.speed += (moved - this.speed) * (1 - Math.exp(-dt * 12));
    }
    this.points.forEach((point, index) => {
      point.x += ((image[index].x - cx) * aspect * scale - point.x) * blend;
      point.y += ((image[index].y - cy) * scale - point.y) * blend;
    });
    this.visible = true;
  }

  /** The nearest this glove comes to a point, from its palm or any fingertip. */
  reachTo(x, y, palmSize) {
    let nearest = Math.hypot(x - this.x, y - this.y) - palmSize * 0.62;
    for (const index of TIPS) {
      nearest = Math.min(nearest, Math.hypot(x - this.x - this.points[index].x, y - this.y - this.points[index].y));
    }
    return nearest;
  }

  /** look is { fill, ink, alpha }, for a glove of another colour, as a friend's is: see Balloon Pop. */
  draw(ctx, palmSize, look = null) {
    if (!this.visible) return;
    const finger = palmSize * 0.27;
    ctx.save();
    if (look?.alpha !== undefined) ctx.globalAlpha = look.alpha;
    ctx.translate(this.x, this.y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const trace = (indices, close) => {
      ctx.beginPath();
      indices.forEach((index, order) => {
        const { x, y } = this.points[index];
        if (order === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      if (close) ctx.closePath();
    };

    // The dark pass first, then the colour on top, gives one clean outline around it all.
    const pass = (colour, extra) => {
      ctx.strokeStyle = colour;
      ctx.fillStyle = colour;
      for (const indices of FINGERS) {
        trace(indices, false);
        ctx.lineWidth = finger + extra;
        ctx.stroke();
      }
      trace(PALM, true);
      ctx.lineWidth = finger * 0.7 + extra;
      ctx.stroke();
      ctx.fill();
    };
    pass(look?.ink ?? INK, palmSize * 0.07);
    const colour = look?.fill ?? GLOVE_COLOURS[this.status === 'open' ? 'open' : 'closed'];
    pass(this.stain > 0 ? mixColours(colour, this.stainColour, this.stain) : colour, 0);
    if (this.embers) {
      ctx.fillStyle = '#ff8f3f';
      for (const index of TIPS) {
        const { x, y } = this.points[index];
        ctx.beginPath();
        ctx.arc(x, y, finger * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
