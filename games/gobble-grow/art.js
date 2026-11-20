// How everything in Gobble and Grow looks: the ten creatures the child is, each with a mouth that opens as far as
// the child's own, the thirty things there are to eat, the everyday things for scale, and the ten worlds behind
// them. All of it is drawn with shapes, flat colours and a dark outline, like the rest of the games: there are no
// pictures to load.
//
// Each creature and thing is drawn around its own middle, one unit from there to its edge, facing right, so that
// it can be put anywhere, any size, and turned to face the other way.
const TAU = Math.PI * 2;
export const INK = '#12304d';
const LINE = 0.07;
const MOUTH = '#6e1f2e';
const TONGUE = '#ff8fa3';

const circle = (ctx, x, y, r) => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
};
const oval = (ctx, x, y, rx, ry, turn = 0) => {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, turn, 0, TAU);
};
const shape = (ctx, points) => {
  ctx.beginPath();
  points.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
};
/** Fills and outlines whatever path was just made. */
const paint = (ctx, fill, line = LINE, stroke = INK) => {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (line) {
    ctx.lineWidth = line;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
};
const dots = (ctx, colour, places) => {
  ctx.fillStyle = colour;
  for (const [x, y, r] of places) {
    circle(ctx, x, y, r);
    ctx.fill();
  }
};
const line = (ctx, points, width = LINE, colour = INK) => {
  ctx.beginPath();
  points.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.lineWidth = width;
  ctx.strokeStyle = colour;
  ctx.stroke();
};
/** A wavy line, as a tail or a whisker of water, from a place, going a way, that waves as time goes by. */
const wavy = (ctx, fromX, fromY, alongX, alongY, long, wave, time, width = LINE, colour = INK) => {
  const points = [];
  for (let step = 0; step <= 10; step += 1) {
    const share = step / 10;
    const off = Math.sin(share * 5 - time * 5) * wave * share;
    points.push([fromX + alongX * long * share - alongY * off, fromY + alongY * long * share + alongX * off]);
  }
  line(ctx, points, width, colour);
};

/* ---------- the face every creature has: eyes, and a mouth that opens as far as the child's ---------- */

/** How tall the open mouth is, from its middle to its edge, on a face of size 1. */
const mouthTall = (mouth) => 0.05 + 0.4 * mouth;

function face(ctx, { x = 0.2, y = 0, size = 1, mouth = 0, one = false, wide = 1, cheeks = true, happy = false, pupil = INK }) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  const eyeY = -0.3;
  for (const eyeX of one ? [0.02] : [-0.3, 0.3]) {
    const eyeR = one ? 0.26 : 0.19;
    if (happy) {
      // Shut and smiling, as when it has just grown.
      ctx.beginPath();
      ctx.arc(eyeX, eyeY + 0.08, eyeR * 0.8, Math.PI * 1.12, Math.PI * 1.88);
      paint(ctx, null, 0.075);
    } else {
      circle(ctx, eyeX, eyeY, eyeR);
      paint(ctx, '#ffffff', 0.05);
      circle(ctx, eyeX + 0.05, eyeY + 0.02, eyeR * 0.56);
      paint(ctx, pupil, 0);
      circle(ctx, eyeX + 0.1, eyeY - 0.05, eyeR * 0.2);
      paint(ctx, '#ffffff', 0);
    }
  }
  if (cheeks) {
    ctx.globalAlpha *= 0.45;
    for (const cheekX of [-0.56, 0.56]) {
      oval(ctx, cheekX, 0.02, 0.13, 0.08);
      paint(ctx, '#ff7d95', 0);
    }
    ctx.globalAlpha /= 0.45;
  }
  const halfWide = 0.34 * wide;
  if (mouth < 0.06) {
    // Shut: a smile.
    ctx.beginPath();
    ctx.arc(0, 0.16, halfWide, Math.PI * 0.14, Math.PI * 0.86);
    paint(ctx, null, 0.075);
  } else {
    const tall = mouthTall(mouth);
    const middle = 0.3 + tall * 0.35;
    oval(ctx, 0, middle, halfWide * (1 - 0.12 * mouth), tall);
    paint(ctx, MOUTH, 0);
    ctx.save();
    ctx.clip();
    oval(ctx, 0, middle + tall * 0.8, halfWide * 0.72, tall * 0.62);
    paint(ctx, TONGUE, 0);
    ctx.restore();
    oval(ctx, 0, middle, halfWide * (1 - 0.12 * mouth), tall);
    paint(ctx, null, 0.075);
  }
  ctx.restore();
}

/* ---------- the ten creatures ---------- */

// Where each one's face is on it, and how big.
const FACES = {
  bacterium: { x: 0.42, y: -0.04, size: 0.8 },
  flea: { x: 0.28, y: -0.1, size: 0.8, one: true, cheeks: false },
  fish: { x: 0.5, y: -0.06, size: 0.78 },
  cat: { x: 0.12, y: 0.08, size: 0.9 },
  elephant: { x: 0.02, y: 0.02, size: 0.86 },
  whale: { x: 0.52, y: 0, size: 0.82, wide: 1.25 },
  cloud: { x: 0.1, y: 0.02, size: 0.9 },
  planet: { x: 0.12, y: 0.02, size: 0.86 },
  sun: { x: 0.1, y: 0.04, size: 0.84 },
  galaxy: { x: 0.04, y: 0.02, size: 0.58 },
};

const BODIES = {
  bacterium(ctx, time) {
    // A little rod, with a tail that whips it along and fine hairs all round.
    wavy(ctx, -1.2, 0.1, -1, 0, 1.05, 0.2, time, 0.09, '#4f9a3a');
    wavy(ctx, -1.2, -0.15, -1, -0.25, 0.8, 0.16, time + 1, 0.07, '#4f9a3a');
    for (let hair = 0; hair < 12; hair += 1) {
      const turn = (hair / 12) * TAU;
      const [x, y] = [Math.cos(turn) * 1.22, Math.sin(turn) * 0.76];
      line(ctx, [[x, y], [x * 1.13, y * 1.2]], 0.05, '#4f9a3a');
    }
    ctx.beginPath();
    ctx.roundRect(-1.25, -0.76, 2.5, 1.52, 0.76);
    paint(ctx, '#8fdc6c');
    dots(ctx, '#6fc04f', [[-0.75, -0.3, 0.14], [-0.5, 0.32, 0.1], [-0.92, 0.12, 0.08], [-0.2, -0.45, 0.07]]);
  },
  flea(ctx, time) {
    // A water flea: see-through, with two feathery arms it rows with, a spike of a tail and its dinner inside.
    const row = Math.sin(time * 4) * 0.25;
    for (const [lean, reach] of [[-0.9 + row, 1], [-0.35 + row, 0.82]]) {
      const [x, y] = [-0.05 + Math.sin(lean) * reach * 1.1, -0.95 - Math.cos(lean) * reach * 0.55];
      line(ctx, [[-0.05, -0.85], [x, y]], 0.09, '#b98a3c');
      for (const side of [-0.35, 0.35]) line(ctx, [[x, y], [x + Math.sin(lean + side) * 0.3, y - Math.cos(lean + side) * 0.3]], 0.05, '#b98a3c');
    }
    line(ctx, [[-0.5, 0.95], [-0.85, 1.45]], 0.09, '#b98a3c');
    oval(ctx, 0, 0.05, 0.95, 1.1, -0.15);
    paint(ctx, 'rgb(250 226 160 / 0.92)');
    oval(ctx, -0.46, 0.32, 0.26, 0.46, -0.3);
    paint(ctx, '#7cc86a', 0.04, '#4f9a3a');
  },
  fish(ctx, time) {
    const wag = Math.sin(time * 5) * 0.16;
    shape(ctx, [[-1.05, 0], [-1.85, -0.62 + wag], [-1.6, 0 + wag * 0.5], [-1.85, 0.62 + wag]]);
    paint(ctx, '#ff7a2f');
    shape(ctx, [[-0.5, -0.78], [0.05, -1.25], [0.45, -0.72]]);
    paint(ctx, '#ff7a2f');
    oval(ctx, 0, 0, 1.25, 0.88);
    paint(ctx, '#ffa23f');
    ctx.save();
    ctx.clip();
    oval(ctx, 0.1, 0.75, 1.3, 0.5);
    paint(ctx, '#ffd08a', 0);
    ctx.restore();
    for (const x of [-0.7, -0.4, -0.1]) {
      ctx.beginPath();
      ctx.arc(x, 0, 0.3, -0.9, 0.9);
      paint(ctx, null, 0.045, '#e07a1f');
    }
    shape(ctx, [[-0.3, 0.3], [-0.75, 0.62], [-0.2, 0.62]]);
    paint(ctx, '#ff7a2f', 0.05);
  },
  cat(ctx, time) {
    // A cat's head, face on, with its tail curling up behind.
    const flick = Math.sin(time * 2.2) * 0.12;
    ctx.beginPath();
    ctx.moveTo(-0.7, 0.75);
    ctx.bezierCurveTo(-1.5, 0.9, -1.7, 0.1, -1.35 + flick, -0.45);
    paint(ctx, null, 0.3, INK);
    ctx.beginPath();
    ctx.moveTo(-0.7, 0.75);
    ctx.bezierCurveTo(-1.5, 0.9, -1.7, 0.1, -1.35 + flick, -0.45);
    paint(ctx, null, 0.18, '#f6a44c');
    for (const side of [-1, 1]) {
      shape(ctx, [[side * 0.92, -0.42], [side * 0.84, -1.22], [side * 0.26, -0.86]]);
      paint(ctx, '#f6a44c');
      shape(ctx, [[side * 0.8, -0.6], [side * 0.76, -1], [side * 0.46, -0.82]]);
      paint(ctx, '#ffc9d2', 0);
    }
    oval(ctx, 0, 0, 1.08, 0.96);
    paint(ctx, '#f6a44c');
    for (const x of [-0.22, 0, 0.22]) line(ctx, [[x + 0.12, -0.92], [x + 0.12, -0.66]], 0.07, '#d9822b');
    for (const side of [-1, 1]) {
      for (const lift of [-0.08, 0.1]) line(ctx, [[0.12 + side * 0.62, 0.2 + lift], [0.12 + side * 1.2, 0.12 + lift * 2.4]], 0.035, INK);
    }
    shape(ctx, [[0.02, 0.1], [0.22, 0.1], [0.12, 0.22]]);
    paint(ctx, '#ff7d95', 0.04);
  },
  elephant(ctx, time) {
    const flap = Math.sin(time * 1.8) * 0.06;
    for (const side of [-1, 1]) {
      oval(ctx, side * 0.98, -0.12, 0.62 + flap, 0.86, side * 0.18);
      paint(ctx, '#9fb0c2');
      oval(ctx, side * 1, -0.1, 0.4 + flap, 0.6, side * 0.18);
      paint(ctx, '#f3b9c4', 0);
    }
    oval(ctx, 0, 0, 0.96, 1);
    paint(ctx, '#b3c1d1');
    // The trunk, swinging out to one side, and two little tusks.
    const swing = Math.sin(time * 2) * 0.1;
    const trunk = () => {
      ctx.beginPath();
      ctx.moveTo(0.5, -0.02);
      ctx.bezierCurveTo(1.1, 0.1, 1.45, 0.5 + swing, 1.62, 0.0 + swing);
    };
    trunk();
    paint(ctx, null, 0.42, INK);
    trunk();
    paint(ctx, null, 0.29, '#b3c1d1');
    for (const x of [-0.44, 0.48]) {
      ctx.beginPath();
      ctx.moveTo(x, 0.52);
      ctx.quadraticCurveTo(x + 0.02, 0.86, x + 0.2, 0.9);
      paint(ctx, null, 0.17, INK);
      ctx.beginPath();
      ctx.moveTo(x, 0.52);
      ctx.quadraticCurveTo(x + 0.02, 0.86, x + 0.2, 0.9);
      paint(ctx, null, 0.08, '#fffaf0');
    }
  },
  whale(ctx, time) {
    const wag = Math.sin(time * 2.4) * 0.14;
    // Its tail, and a little fountain from its blowhole.
    shape(ctx, [[-1.25, 0], [-1.75, -0.2 + wag], [-2.1, -0.75 + wag], [-1.72, -0.12 + wag], [-2.15, 0.4 + wag], [-1.7, 0.18 + wag]]);
    paint(ctx, '#3f7fc4');
    for (const [lean, reach] of [[-0.5, 0.5], [0, 0.62], [0.5, 0.5]]) {
      ctx.beginPath();
      ctx.moveTo(-0.1, -0.86);
      ctx.quadraticCurveTo(-0.1 + lean * 0.3, -0.95 - reach, -0.1 + lean * 0.9, -0.92 - reach * 0.7 + Math.sin(time * 3 + lean) * 0.04);
      paint(ctx, null, 0.08, '#bfe9ff');
    }
    oval(ctx, 0, 0, 1.42, 0.9);
    paint(ctx, '#4f93d8');
    ctx.save();
    ctx.clip();
    oval(ctx, 0.2, 0.9, 1.5, 0.62);
    paint(ctx, '#d6ecff', 0);
    for (const x of [-0.5, -0.2, 0.1]) line(ctx, [[x, 0.42], [x - 0.12, 0.95]], 0.035, '#9dc3e8');
    ctx.restore();
    oval(ctx, 0, 0, 1.42, 0.9);
    paint(ctx, null);
    shape(ctx, [[-0.5, 0.35], [-0.95, 0.9], [-0.3, 0.66]]);
    paint(ctx, '#3f7fc4', 0.05);
  },
  cloud(ctx) {
    // A giant made of cloud: its puffs are outlined together, and shaded underneath.
    const puffs = [[-0.72, 0.28, 0.55], [-0.3, -0.36, 0.66], [0.42, -0.3, 0.62], [0.84, 0.24, 0.5], [0.08, 0.34, 0.72]];
    for (const [x, y, r] of puffs) {
      circle(ctx, x, y, r);
      paint(ctx, null, LINE * 2);
    }
    for (const [x, y, r] of puffs) {
      circle(ctx, x, y, r);
      paint(ctx, '#ffffff', 0);
    }
    ctx.save();
    ctx.beginPath();
    for (const [x, y, r] of puffs) {
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, TAU);
    }
    ctx.clip();
    oval(ctx, 0.05, 1.05, 1.5, 0.5);
    paint(ctx, '#d5e4f5', 0);
    ctx.restore();
  },
  planet(ctx) {
    // A planet with a ring round it: the far half of the ring first, then the planet, then the near half.
    const ring = (from, to) => {
      ctx.beginPath();
      ctx.ellipse(0, 0.06, 1.62, 0.4, -0.3, from, to);
    };
    ring(Math.PI, TAU);
    paint(ctx, null, 0.26, INK);
    ring(Math.PI, TAU);
    paint(ctx, null, 0.14, '#f1cf86');
    circle(ctx, 0, 0, 1);
    paint(ctx, '#62c7ad');
    ctx.save();
    ctx.clip();
    for (const [y, tall, colour] of [[-0.62, 0.16, '#8adcc6'], [0.5, 0.2, '#46ad93'], [0.86, 0.14, '#8adcc6']]) {
      oval(ctx, 0, y, 1.3, tall, -0.12);
      paint(ctx, colour, 0);
    }
    ctx.restore();
    circle(ctx, 0, 0, 1);
    paint(ctx, null);
    ring(0, Math.PI);
    paint(ctx, null, 0.26, INK);
    ring(0, Math.PI);
    paint(ctx, null, 0.14, '#f1cf86');
  },
  sun(ctx, time) {
    // Its rays turn slowly round it.
    ctx.save();
    ctx.rotate(time * 0.25);
    for (let ray = 0; ray < 12; ray += 1) {
      ctx.rotate(TAU / 12);
      shape(ctx, [[0.98, -0.2], [1.5, 0], [0.98, 0.2]]);
      paint(ctx, '#ffae2b');
    }
    ctx.restore();
    circle(ctx, 0, 0, 1.02);
    paint(ctx, '#ffd447');
    ctx.save();
    ctx.clip();
    circle(ctx, -0.3, -0.34, 0.66);
    paint(ctx, '#ffe37a', 0);
    ctx.restore();
  },
  galaxy(ctx, time) {
    // Two arms of stars winding out from a bright middle, turning slowly.
    ctx.save();
    ctx.rotate(time * 0.2);
    ctx.globalAlpha *= 0.3;
    circle(ctx, 0, 0, 1.5);
    paint(ctx, '#8f7bff', 0);
    ctx.globalAlpha /= 0.3;
    for (const start of [0, Math.PI]) {
      const points = [];
      for (let step = 0; step <= 22; step += 1) {
        const turn = start + step * 0.2;
        const far = 0.5 + step * 0.052;
        points.push([Math.cos(turn) * far, Math.sin(turn) * far]);
      }
      line(ctx, points, 0.44, INK);
      line(ctx, points, 0.31, '#b9a7ff');
      ctx.fillStyle = '#ffffff';
      points.forEach(([x, y], index) => {
        if (index % 3 !== 1) return;
        circle(ctx, x, y, 0.05);
        ctx.fill();
      });
    }
    ctx.restore();
    circle(ctx, 0, 0, 0.66);
    paint(ctx, '#ffe2a1');
  },
};

/**
 * Draws one of the ten creatures. mouth is how open its mouth is, from 0 to 1, facing 1 for looking right and -1
 * for left, and happy has its eyes shut and smiling.
 */
export function drawCreature(ctx, id, x, y, r, { facing = 1, mouth = 0, time = 0, happy = false, alpha = 1 } = {}) {
  if (r < 0.3) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(r * facing, r);
  ctx.globalAlpha *= alpha;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  BODIES[id](ctx, time);
  // Too small to see a face on, it's just its shape.
  if (r > 5) face(ctx, { ...FACES[id], mouth, happy });
  ctx.restore();
}

/** Where a creature's mouth is on the screen, and how big it is when it's that far open: for what's going into it. */
export function mouthOf(id, x, y, r, facing = 1, mouth = 0) {
  const { x: faceX, y: faceY, size, wide = 1 } = FACES[id];
  const tall = mouthTall(mouth);
  return { x: x + facing * faceX * r, y: y + (faceY + (0.3 + tall * 0.35) * size) * r, r: Math.min(0.34 * wide, tall) * size * r };
}

/* ---------- the things to eat, three in each world ---------- */

const moon = (ctx, base = '#d9d6c7', crater = '#b9b5a3') => {
  circle(ctx, 0, 0, 1);
  paint(ctx, base);
  dots(ctx, crater, [[-0.35, -0.3, 0.24], [0.3, 0.25, 0.3], [0.38, -0.45, 0.13], [-0.4, 0.42, 0.15]]);
};

const littleFish = (ctx, x, y, size, colour, time) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  const wag = Math.sin(time * 6 + x * 5) * 0.12;
  shape(ctx, [[-0.6, 0], [-1.1, -0.42 + wag], [-1.1, 0.42 + wag]]);
  paint(ctx, colour, 0.09);
  oval(ctx, 0, 0, 0.8, 0.48);
  paint(ctx, colour, 0.09);
  dots(ctx, INK, [[0.42, -0.1, 0.09]]);
  ctx.restore();
};

const spiral = (ctx, time, arm = '#b9a7ff', middle = '#ffe2a1') => {
  ctx.save();
  ctx.rotate(time * 0.3);
  for (const start of [0, Math.PI]) {
    const points = [];
    for (let step = 0; step <= 16; step += 1) {
      const turn = start + step * 0.26;
      const far = 0.3 + step * 0.044;
      points.push([Math.cos(turn) * far, Math.sin(turn) * far]);
    }
    line(ctx, points, 0.36, INK);
    line(ctx, points, 0.22, arm);
  }
  ctx.restore();
  circle(ctx, 0, 0, 0.4);
  paint(ctx, middle);
};

const FOODS = {
  // Under the microscope.
  speck(ctx) {
    shape(ctx, [[0, -1], [0.9, -0.1], [0.25, 0.95], [-0.85, 0.2]]);
    paint(ctx, '#ffffff', 0.12);
    line(ctx, [[0, -1], [0.1, 0.1], [0.25, 0.95]], 0.07, '#b9c7d6');
    line(ctx, [[-0.85, 0.2], [0.1, 0.1], [0.9, -0.1]], 0.07, '#b9c7d6');
  },
  germ(ctx) {
    for (let hair = 0; hair < 10; hair += 1) {
      const turn = (hair / 10) * TAU;
      line(ctx, [[Math.cos(turn) * 0.8, Math.sin(turn) * 0.8], [Math.cos(turn) * 1.05, Math.sin(turn) * 1.05]], 0.07, '#8a5fc4');
    }
    circle(ctx, 0, 0, 0.82);
    paint(ctx, '#c7a2f2');
    dots(ctx, '#a67fde', [[-0.25, -0.2, 0.17], [0.28, 0.12, 0.2], [-0.1, 0.38, 0.11]]);
  },
  yeast(ctx) {
    circle(ctx, 0.52, -0.5, 0.44);
    paint(ctx, '#f0d49a');
    oval(ctx, -0.12, 0.14, 0.82, 0.74, 0.3);
    paint(ctx, '#f0d49a');
    dots(ctx, '#d6b06a', [[-0.2, 0.15, 0.22], [0.52, -0.5, 0.13]]);
  },
  // In a drop of water.
  alga(ctx) {
    circle(ctx, 0, 0, 0.88);
    paint(ctx, '#6fcb5c', 0.11);
    dots(ctx, '#b7ee9b', [[-0.28, -0.25, 0.22], [0.3, -0.05, 0.2], [-0.05, 0.38, 0.2]]);
  },
  slipper(ctx, time) {
    for (let hair = 0; hair < 16; hair += 1) {
      const turn = (hair / 16) * TAU;
      const wave = 1.13 + Math.sin(time * 6 + hair) * 0.04;
      line(ctx, [[Math.cos(turn) * 0.98, Math.sin(turn) * 0.5], [Math.cos(turn) * 0.98 * wave, Math.sin(turn) * 0.5 * (wave + 0.12)]], 0.045, '#7b8fd6');
    }
    oval(ctx, 0, 0, 1, 0.5);
    paint(ctx, '#c4d3ff');
    oval(ctx, 0.2, 0.12, 0.34, 0.12, 0.5);
    paint(ctx, '#8ea2e6', 0);
    dots(ctx, '#ffffff', [[-0.5, -0.05, 0.13], [0.55, -0.12, 0.11]]);
  },
  amoeba(ctx, time) {
    ctx.beginPath();
    for (let step = 0; step <= 48; step += 1) {
      const turn = (step / 48) * TAU;
      const far = 0.72 + 0.2 * Math.sin(turn * 5 + time * 1.5) + 0.08 * Math.sin(turn * 3 - time);
      const [x, y] = [Math.cos(turn) * far, Math.sin(turn) * far];
      if (step) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
    paint(ctx, '#eeb0df');
    dots(ctx, '#c97fb8', [[0.1, 0.05, 0.22]]);
    dots(ctx, '#ffffff', [[-0.35, -0.2, 0.1], [-0.2, 0.35, 0.08], [0.4, -0.3, 0.07]]);
  },
  // In a pond.
  waterflea(ctx, time) {
    ctx.scale(0.82, 0.82);
    BODIES.flea(ctx, time);
    dots(ctx, INK, [[0.25, -0.35, 0.2]]);
  },
  tadpole(ctx, time) {
    wavy(ctx, -0.25, 0, -1, 0, 1.25, 0.26, time * 1.4, 0.3, INK);
    wavy(ctx, -0.25, 0, -1, 0, 1.25, 0.26, time * 1.4, 0.17, '#5b4a3c');
    oval(ctx, 0.2, 0, 0.62, 0.52);
    paint(ctx, '#6b5847');
    dots(ctx, '#ffffff', [[0.45, -0.15, 0.15]]);
    dots(ctx, INK, [[0.5, -0.14, 0.08]]);
  },
  snail(ctx) {
    ctx.beginPath();
    ctx.moveTo(-0.9, 0.72);
    ctx.quadraticCurveTo(0.2, 0.5, 0.95, 0.72);
    ctx.quadraticCurveTo(1.02, 0.95, 0.7, 0.95);
    ctx.lineTo(-0.8, 0.95);
    ctx.closePath();
    paint(ctx, '#c9bfa8');
    for (const x of [0.72, 0.92]) {
      line(ctx, [[x - 0.05, 0.72], [x + 0.06, 0.3]], 0.07);
      dots(ctx, INK, [[x + 0.06, 0.28, 0.07]]);
    }
    circle(ctx, -0.1, 0.02, 0.76);
    paint(ctx, '#dba45e');
    ctx.beginPath();
    for (let step = 0; step <= 30; step += 1) {
      const turn = step * 0.42;
      const far = 0.62 - step * 0.019;
      const [x, y] = [-0.1 + Math.cos(turn) * far, 0.02 + Math.sin(turn) * far];
      if (step) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    paint(ctx, null, 0.07, '#a5722f');
  },
  // In a garden.
  littlefish(ctx, time) {
    littleFish(ctx, 0.1, 0, 0.92, '#ffa23f', time);
  },
  cheese(ctx) {
    shape(ctx, [[-0.95, 0.55], [0.95, 0.55], [0.95, -0.1], [-0.2, -0.75]]);
    paint(ctx, '#ffd23f');
    shape(ctx, [[-0.95, 0.55], [0.95, 0.55], [0.95, 0.12], [-0.95, 0.12]]);
    paint(ctx, '#f5b923');
    dots(ctx, '#e39f10', [[-0.4, 0.34, 0.12], [0.3, 0.3, 0.16], [0.7, 0.4, 0.08], [0.2, -0.22, 0.13]]);
  },
  drumstick(ctx) {
    line(ctx, [[0.3, 0.3], [0.85, 0.85]], 0.3, INK);
    line(ctx, [[0.3, 0.3], [0.85, 0.85]], 0.17, '#fffaf0');
    for (const [x, y] of [[0.94, 0.72], [0.72, 0.94]]) {
      circle(ctx, x, y, 0.16);
      paint(ctx, '#fffaf0', 0.06);
    }
    oval(ctx, -0.22, -0.22, 0.86, 0.66, 0.78);
    paint(ctx, '#c9772e');
    ctx.beginPath();
    ctx.arc(-0.3, -0.3, 0.42, 3.4, 4.9);
    paint(ctx, null, 0.09, '#e59a52');
  },
  // On the savanna.
  peanut(ctx) {
    ctx.beginPath();
    ctx.moveTo(-0.92, 0);
    ctx.bezierCurveTo(-0.92, -0.75, -0.25, -0.72, 0, -0.36);
    ctx.bezierCurveTo(0.25, -0.72, 0.92, -0.75, 0.92, 0);
    ctx.bezierCurveTo(0.92, 0.75, 0.25, 0.72, 0, 0.36);
    ctx.bezierCurveTo(-0.25, 0.72, -0.92, 0.75, -0.92, 0);
    paint(ctx, '#e3b877', 0.1);
    for (const x of [-0.6, -0.36, 0.36, 0.6]) line(ctx, [[x, -0.36], [x, 0.36]], 0.05, '#b98a45');
  },
  melon(ctx) {
    circle(ctx, 0, 0, 0.94);
    paint(ctx, '#5fba4d');
    ctx.save();
    ctx.clip();
    for (const x of [-0.6, -0.2, 0.2, 0.6]) {
      ctx.beginPath();
      ctx.ellipse(x * 1.5, 0, 0.16 + Math.abs(x) * 0.5, 1.1, 0, -1.2, 1.2, x > 0);
      paint(ctx, null, 0.14, '#2f7d32');
    }
    ctx.restore();
    circle(ctx, 0, 0, 0.94);
    paint(ctx, null);
  },
  haystack(ctx) {
    ctx.beginPath();
    ctx.moveTo(-0.98, 0.72);
    ctx.bezierCurveTo(-0.95, -0.6, -0.3, -0.95, 0, -0.95);
    ctx.bezierCurveTo(0.3, -0.95, 0.95, -0.6, 0.98, 0.72);
    ctx.closePath();
    paint(ctx, '#f0c64f');
    for (const [x, lean] of [[-0.6, -0.1], [-0.3, 0.06], [0, -0.04], [0.3, 0.08], [0.6, -0.06]]) {
      line(ctx, [[x, 0.6], [x + lean, -0.25 + Math.abs(x) * 0.5]], 0.05, '#c9972a');
    }
    line(ctx, [[-0.98, 0.72], [0.98, 0.72]], LINE);
  },
  // In the ocean.
  shrimp(ctx) {
    for (let part = 0; part < 6; part += 1) {
      const turn = -0.4 + part * 0.5;
      oval(ctx, Math.cos(turn) * 0.5, Math.sin(turn) * 0.5, 0.38 - part * 0.035, 0.3 - part * 0.03, turn + 1.5);
      paint(ctx, '#ff9a9a', 0.08);
    }
    shape(ctx, [[-0.52, 0.2], [-0.95, 0.5], [-0.8, 0.02]]);
    paint(ctx, '#ff7d7d', 0.08);
    line(ctx, [[0.62, -0.42], [1, -0.9]], 0.05);
    line(ctx, [[0.62, -0.42], [0.6, -1]], 0.05);
    dots(ctx, INK, [[0.62, -0.25, 0.08]]);
  },
  shoal(ctx, time) {
    littleFish(ctx, -0.35, -0.48, 0.42, '#a9d3ee', time);
    littleFish(ctx, 0.42, -0.05, 0.46, '#c7e3f5', time + 1);
    littleFish(ctx, -0.3, 0.5, 0.42, '#a9d3ee', time + 2);
  },
  squid(ctx, time) {
    for (let arm = 0; arm < 5; arm += 1) {
      wavy(ctx, -0.3, -0.36 + arm * 0.18, -1, (arm - 2) * 0.12, 0.85, 0.12, time * 0.8 + arm, 0.16, INK);
      wavy(ctx, -0.3, -0.36 + arm * 0.18, -1, (arm - 2) * 0.12, 0.85, 0.12, time * 0.8 + arm, 0.08, '#ef7f8f');
    }
    ctx.beginPath();
    ctx.moveTo(-0.38, -0.52);
    ctx.quadraticCurveTo(0.5, -0.62, 1, 0);
    ctx.quadraticCurveTo(0.5, 0.62, -0.38, 0.52);
    ctx.closePath();
    paint(ctx, '#f48a99');
    shape(ctx, [[0.55, -0.34], [0.98, -0.62], [0.9, -0.1]]);
    paint(ctx, '#e06f80', 0.06);
    shape(ctx, [[0.55, 0.34], [0.98, 0.62], [0.9, 0.1]]);
    paint(ctx, '#e06f80', 0.06);
    dots(ctx, '#ffffff', [[-0.08, -0.1, 0.2]]);
    dots(ctx, INK, [[-0.1, -0.08, 0.11]]);
  },
  // In the sky.
  kite(ctx, time) {
    wavy(ctx, 0, 0.85, -0.3, 1, 0.8, 0.14, time, 0.05);
    shape(ctx, [[0, -0.95], [0.66, -0.1], [0, 0.85], [-0.66, -0.1]]);
    paint(ctx, '#ff6b6b');
    shape(ctx, [[0, -0.95], [0.66, -0.1], [0, -0.1]]);
    paint(ctx, '#ffd23f', 0);
    shape(ctx, [[0, 0.85], [-0.66, -0.1], [0, -0.1]]);
    paint(ctx, '#4dabf7', 0);
    shape(ctx, [[0, -0.95], [0.66, -0.1], [0, 0.85], [-0.66, -0.1]]);
    paint(ctx, null);
    line(ctx, [[0, -0.95], [0, 0.85]], 0.04);
    line(ctx, [[-0.66, -0.1], [0.66, -0.1]], 0.04);
  },
  airballoon(ctx) {
    line(ctx, [[-0.42, 0.3], [-0.2, 0.74]], 0.04);
    line(ctx, [[0.42, 0.3], [0.2, 0.74]], 0.04);
    ctx.beginPath();
    ctx.roundRect(-0.24, 0.7, 0.48, 0.3, 0.06);
    paint(ctx, '#b9824a', 0.06);
    oval(ctx, 0, -0.24, 0.76, 0.76);
    paint(ctx, '#ff8a5c');
    ctx.save();
    ctx.clip();
    for (const [x, colour] of [[-0.5, '#ffd23f'], [0, '#ffffff'], [0.5, '#ffd23f']]) {
      oval(ctx, x, -0.24, 0.14, 0.8);
      paint(ctx, colour, 0);
    }
    ctx.restore();
    oval(ctx, 0, -0.24, 0.76, 0.76);
    paint(ctx, null);
  },
  rainbow(ctx) {
    ['#ff6b6b', '#ffa94d', '#ffd23f', '#69db7c', '#4dabf7', '#b197fc'].forEach((colour, band) => {
      ctx.beginPath();
      ctx.arc(0, 0.5, 0.94 - band * 0.11, Math.PI, TAU);
      paint(ctx, null, 0.12, colour);
    });
    ctx.beginPath();
    ctx.arc(0, 0.5, 1, Math.PI, TAU);
    paint(ctx, null, 0.05);
    for (const side of [-1, 1]) {
      for (const [x, y, r] of [[0.66, 0.52, 0.2], [0.9, 0.56, 0.17], [0.76, 0.42, 0.2]]) {
        circle(ctx, side * x, y, r);
        paint(ctx, null, 0.1);
      }
      for (const [x, y, r] of [[0.66, 0.52, 0.2], [0.9, 0.56, 0.17], [0.76, 0.42, 0.2]]) {
        circle(ctx, side * x, y, r);
        paint(ctx, '#ffffff', 0);
      }
    }
  },
  // Among the moons.
  rock(ctx) {
    shape(ctx, [[-0.9, -0.1], [-0.5, -0.78], [0.3, -0.9], [0.92, -0.3], [0.78, 0.5], [0.1, 0.9], [-0.66, 0.6]]);
    paint(ctx, '#9aa3ad', 0.1);
    dots(ctx, '#7c858f', [[-0.3, -0.25, 0.2], [0.35, 0.2, 0.25], [0.3, -0.5, 0.1]]);
  },
  comet(ctx) {
    ctx.globalAlpha *= 0.55;
    shape(ctx, [[0.3, -0.5], [-1.7, -0.25], [-1.25, 0], [-1.7, 0.25], [0.3, 0.5]]);
    paint(ctx, '#bfe9ff', 0);
    ctx.globalAlpha /= 0.55;
    circle(ctx, 0.38, 0, 0.58);
    paint(ctx, '#e7f7ff');
    dots(ctx, '#a9d8f2', [[0.25, -0.15, 0.14], [0.55, 0.18, 0.1]]);
  },
  moonlet(ctx) {
    moon(ctx);
  },
  // Among the planets.
  smallmoon(ctx) {
    moon(ctx, '#c9cdd6', '#a7acb8');
  },
  earth(ctx) {
    circle(ctx, 0, 0, 0.96);
    paint(ctx, '#4da3ee');
    ctx.save();
    ctx.clip();
    for (const [x, y, rx, ry, turn] of [[-0.42, -0.2, 0.42, 0.52, 0.3], [0.5, 0.36, 0.42, 0.3, -0.4], [0.3, -0.62, 0.3, 0.16, 0.2]]) {
      oval(ctx, x, y, rx, ry, turn);
      paint(ctx, '#62c267', 0);
    }
    oval(ctx, 0, -1.02, 0.6, 0.24);
    paint(ctx, '#ffffff', 0);
    ctx.restore();
    circle(ctx, 0, 0, 0.96);
    paint(ctx, null);
  },
  ringed(ctx) {
    const ring = (from, to) => {
      ctx.beginPath();
      ctx.ellipse(0, 0.04, 1.26, 0.32, -0.3, from, to);
    };
    ring(Math.PI, TAU);
    paint(ctx, null, 0.2, INK);
    ring(Math.PI, TAU);
    paint(ctx, null, 0.1, '#d6c7ff');
    circle(ctx, 0, 0, 0.76);
    paint(ctx, '#f0a868');
    ctx.save();
    ctx.clip();
    for (const y of [-0.36, 0.14, 0.52]) {
      oval(ctx, 0, y, 1, 0.1, -0.1);
      paint(ctx, '#d98a4a', 0);
    }
    ctx.restore();
    circle(ctx, 0, 0, 0.76);
    paint(ctx, null);
    ring(0, Math.PI);
    paint(ctx, null, 0.2, INK);
    ring(0, Math.PI);
    paint(ctx, null, 0.1, '#d6c7ff');
  },
  // Among the stars.
  star(ctx) {
    ctx.beginPath();
    for (let point = 0; point < 8; point += 1) {
      const turn = (point / 8) * TAU - Math.PI / 2;
      const far = point % 2 ? 0.48 : 1;
      ctx.lineTo(Math.cos(turn) * far, Math.sin(turn) * far);
    }
    ctx.closePath();
    paint(ctx, '#fff3b0', 0.1);
    circle(ctx, 0, 0, 0.42);
    paint(ctx, '#ffd447', 0);
  },
  nebula(ctx) {
    ctx.globalAlpha *= 0.75;
    for (const [x, y, r, colour] of [[-0.42, -0.1, 0.56, '#ff9ec4'], [0.3, -0.3, 0.52, '#9ad8ff'], [0.26, 0.36, 0.56, '#c7a2f2'], [-0.3, 0.42, 0.4, '#9ad8ff']]) {
      circle(ctx, x, y, r);
      paint(ctx, colour, 0);
    }
    ctx.globalAlpha /= 0.75;
    dots(ctx, '#ffffff', [[-0.4, -0.2, 0.08], [0.3, -0.35, 0.1], [0.2, 0.3, 0.07], [-0.2, 0.42, 0.06], [0.55, 0.1, 0.05], [0, 0, 0.09]]);
  },
  spiral(ctx, time) {
    spiral(ctx, time);
  },
};

/** Draws one of the things to eat, by its name in worlds.js, swaying a little. */
export function drawFood(ctx, id, x, y, r, { time = 0, turn = 0, alpha = 1 } = {}) {
  if (r < 0.3) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(turn);
  ctx.scale(r, r);
  ctx.globalAlpha *= alpha;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  FOODS[id](ctx, time);
  ctx.restore();
}

/* ---------- everyday things, for how big the child has got ---------- */

const THINGS = {
  sand(ctx) {
    shape(ctx, [[-0.8, 0.3], [-0.6, -0.55], [0.1, -0.9], [0.85, -0.35], [0.7, 0.55], [-0.1, 0.9]]);
    paint(ctx, '#e8cf9a');
    line(ctx, [[-0.6, -0.55], [0.05, -0.1], [0.85, -0.35]], 0.05, '#c7a866');
    line(ctx, [[0.05, -0.1], [-0.1, 0.9]], 0.05, '#c7a866');
  },
  ladybird(ctx) {
    circle(ctx, 0.72, 0, 0.36);
    paint(ctx, '#2b3440');
    dots(ctx, '#ffffff', [[0.86, -0.14, 0.08], [0.86, 0.14, 0.08]]);
    oval(ctx, -0.1, 0, 0.84, 0.76);
    paint(ctx, '#e94a3f');
    line(ctx, [[-0.94, 0], [0.74, 0]], 0.06);
    dots(ctx, '#2b3440', [[-0.45, -0.38, 0.14], [0.1, -0.42, 0.15], [-0.2, 0.36, 0.16], [0.35, 0.34, 0.13], [-0.62, 0.12, 0.1]]);
  },
  football(ctx) {
    circle(ctx, 0, 0, 0.96);
    paint(ctx, '#ffffff');
    ctx.fillStyle = '#2b3440';
    const patch = (x, y, size, turn) => {
      ctx.beginPath();
      for (let corner = 0; corner < 5; corner += 1) {
        const angle = turn + (corner / 5) * TAU;
        ctx.lineTo(x + Math.cos(angle) * size, y + Math.sin(angle) * size);
      }
      ctx.closePath();
      ctx.fill();
    };
    patch(0, 0, 0.34, -Math.PI / 2);
    ctx.save();
    circle(ctx, 0, 0, 0.93);
    ctx.clip();
    for (let around = 0; around < 5; around += 1) {
      const angle = -Math.PI / 2 + (around / 5) * TAU;
      patch(Math.cos(angle) * 0.86, Math.sin(angle) * 0.86, 0.3, angle);
      line(ctx, [[Math.cos(angle) * 0.34, Math.sin(angle) * 0.34], [Math.cos(angle) * 0.6, Math.sin(angle) * 0.6]], 0.05);
    }
    ctx.restore();
  },
  bicycle(ctx) {
    for (const x of [-0.6, 0.6]) {
      circle(ctx, x, 0.4, 0.4);
      paint(ctx, null, 0.1);
      circle(ctx, x, 0.4, 0.06);
      paint(ctx, INK, 0);
    }
    line(ctx, [[-0.6, 0.4], [-0.15, -0.3], [0.42, -0.3], [0.02, 0.4], [-0.6, 0.4]], 0.09, '#e94a3f');
    line(ctx, [[0.02, 0.4], [-0.15, -0.3]], 0.09, '#e94a3f');
    line(ctx, [[0.6, 0.4], [0.42, -0.3], [0.36, -0.56]], 0.09, '#e94a3f');
    line(ctx, [[0.2, -0.6], [0.52, -0.56]], 0.09);
    line(ctx, [[-0.3, -0.36], [0, -0.36]], 0.12);
  },
  house(ctx) {
    ctx.beginPath();
    ctx.rect(-0.72, -0.15, 1.44, 1.05);
    paint(ctx, '#ffe9c2');
    shape(ctx, [[-0.95, -0.1], [0, -0.95], [0.95, -0.1]]);
    paint(ctx, '#e0533a');
    ctx.beginPath();
    ctx.rect(-0.16, 0.35, 0.36, 0.55);
    paint(ctx, '#9a5f2e', 0.06);
    ctx.beginPath();
    ctx.rect(-0.56, 0.12, 0.3, 0.3);
    paint(ctx, '#9ad8ff', 0.06);
    ctx.beginPath();
    ctx.rect(0.34, 0.12, 0.26, 0.3);
    paint(ctx, '#9ad8ff', 0.06);
  },
  mountain(ctx) {
    shape(ctx, [[-0.2, 0.85], [0.5, -0.2], [1, 0.85]]);
    paint(ctx, '#8d9aab');
    shape(ctx, [[-1, 0.85], [-0.2, -0.9], [0.62, 0.85]]);
    paint(ctx, '#a8b4c4');
    shape(ctx, [[-0.2, -0.9], [-0.47, -0.3], [-0.3, -0.42], [-0.16, -0.24], [0.02, -0.42], [0.1, -0.26]]);
    paint(ctx, '#ffffff', 0.05);
  },
  moon(ctx) {
    moon(ctx);
  },
  jupiter(ctx) {
    circle(ctx, 0, 0, 0.96);
    paint(ctx, '#e8c08a');
    ctx.save();
    ctx.clip();
    for (const [y, tall, colour] of [[-0.62, 0.12, '#c98f5a'], [-0.24, 0.1, '#f5dab0'], [0.12, 0.14, '#c98f5a'], [0.56, 0.1, '#b97b48']]) {
      oval(ctx, 0, y, 1.2, tall);
      paint(ctx, colour, 0);
    }
    oval(ctx, 0.36, 0.3, 0.24, 0.14);
    paint(ctx, '#d9603f', 0);
    ctx.restore();
    circle(ctx, 0, 0, 0.96);
    paint(ctx, null);
  },
  planets(ctx) {
    // The Sun in the middle, with its planets going round it.
    for (const [rx, colour, turn] of [[0.36, '#b9824a', 0.4], [0.58, '#4da3ee', 2.5], [0.8, '#e8c08a', 4.4], [0.98, '#9ad8ff', 5.6]]) {
      oval(ctx, 0, 0, rx, rx * 0.42);
      paint(ctx, null, 0.03, '#8ea2c6');
      circle(ctx, Math.cos(turn) * rx, Math.sin(turn) * rx * 0.42, 0.085);
      paint(ctx, colour, 0.035);
    }
    circle(ctx, 0, 0, 0.17);
    paint(ctx, '#ffd447', 0.05);
  },
};

/** Draws one of the everyday things, by its name in worlds.js. */
export function drawThing(ctx, id, x, y, r) {
  if (r < 0.3) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(r, r);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  THINGS[id](ctx);
  ctx.restore();
}

/* ---------- the ten worlds, behind everything ---------- */

/** A steady random number from a seed, so a world looks the same every time it's drawn. */
const seeded = (seed) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

const sky = (ctx, w, h, top, bottom, upTo = 1) => {
  const fill = ctx.createLinearGradient(0, 0, 0, h * upTo);
  fill.addColorStop(0, top);
  fill.addColorStop(1, bottom);
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, w, h);
};

const stars = (ctx, w, h, random, count, bright = 0.8) => {
  for (let star = 0; star < count; star += 1) {
    ctx.globalAlpha = (0.25 + random() * 0.75) * bright;
    ctx.fillStyle = ['#ffffff', '#ffe9b0', '#cfe3ff'][Math.floor(random() * 3)];
    circle(ctx, random() * w, random() * h, (0.6 + random() * 1.6) * (h / 900));
    ctx.fill();
  }
  ctx.globalAlpha = 1;
};

const glow = (ctx, x, y, r, colour, alpha) => {
  const fill = ctx.createRadialGradient(x, y, 0, x, y, r);
  fill.addColorStop(0, colour);
  fill.addColorStop(1, 'rgb(0 0 0 / 0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fill;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
};

const BACKDROPS = {
  bacterium(ctx, w, h, random) {
    // What a microscope shows: pale, with soft shapes out of focus.
    sky(ctx, w, h, '#e6f6ea', '#c8ecdc');
    for (let blob = 0; blob < 16; blob += 1) {
      ctx.globalAlpha = 0.16 + random() * 0.14;
      oval(ctx, random() * w, random() * h, (0.04 + random() * 0.1) * h, (0.03 + random() * 0.08) * h, random() * 3);
      paint(ctx, ['#9fdcbf', '#b9e3f0', '#d9efb8'][blob % 3], 0);
    }
    ctx.globalAlpha = 1;
  },
  flea(ctx, w, h, random) {
    // Inside a drop of water: light blue, with bubbles and the light bending through it.
    sky(ctx, w, h, '#d9f4ff', '#9fd8f2');
    ctx.globalAlpha = 0.28;
    for (let band = 0; band < 5; band += 1) {
      ctx.beginPath();
      ctx.ellipse(w * (0.1 + band * 0.22), h * (0.15 + random() * 0.2), w * 0.3, h * 0.05, -0.5, 0, TAU);
      paint(ctx, '#ffffff', 0);
    }
    ctx.globalAlpha = 1;
    for (let bubble = 0; bubble < 14; bubble += 1) {
      const [x, y, r] = [random() * w, random() * h, (0.008 + random() * 0.022) * h];
      ctx.globalAlpha = 0.5;
      circle(ctx, x, y, r);
      paint(ctx, 'rgb(255 255 255 / 0.35)', Math.max(1, h * 0.0025), '#ffffff');
    }
    ctx.globalAlpha = 1;
  },
  fish(ctx, w, h, random) {
    // A pond from under the water: lily pads floating above, reeds, and pebbles on the bottom.
    sky(ctx, w, h, '#bfe9d6', '#4fa58e');
    ctx.globalAlpha = 0.12;
    for (const x of [0.2, 0.5, 0.78]) {
      shape(ctx, [[w * x, 0], [w * (x + 0.07), 0], [w * (x + 0.02), h], [w * (x - 0.1), h]]);
      paint(ctx, '#ffffff', 0);
    }
    ctx.globalAlpha = 1;
    for (const [x, wide] of [[0.12, 0.09], [0.36, 0.07], [0.63, 0.1], [0.88, 0.08]]) {
      oval(ctx, w * x, h * 0.012, w * wide, h * 0.03);
      paint(ctx, '#3f8f4f', 0);
    }
    for (let reed = 0; reed < 9; reed += 1) {
      const x = w * (0.04 + random() * 0.92);
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.quadraticCurveTo(x + w * 0.02, h * 0.75, x - w * 0.01 + random() * w * 0.03, h * (0.5 + random() * 0.25));
      paint(ctx, null, h * 0.012, '#3b8a63');
    }
    for (let pebble = 0; pebble < 22; pebble += 1) {
      oval(ctx, random() * w, h * (0.965 + random() * 0.03), h * (0.02 + random() * 0.03), h * (0.012 + random() * 0.014));
      paint(ctx, ['#7f9a8e', '#9bb3a6', '#6d877c'][pebble % 3], 0);
    }
  },
  cat(ctx, w, h, random) {
    // A garden: sky, a fence, a hedge and a lawn.
    sky(ctx, w, h, '#a9dcff', '#e6f6ff', 0.6);
    for (const [x, y, size] of [[0.2, 0.14, 1], [0.7, 0.09, 0.8]]) {
      for (const [dx, dy, r] of [[-0.05, 0.01, 0.04], [0, -0.012, 0.052], [0.05, 0.012, 0.04]]) {
        circle(ctx, w * (x + dx * size), h * (y + dy * size), h * r * size);
        paint(ctx, 'rgb(255 255 255 / 0.85)', 0);
      }
    }
    ctx.fillStyle = '#6fb04f';
    ctx.fillRect(0, h * 0.5, w, h * 0.12);
    for (let bump = 0; bump < 16; bump += 1) {
      circle(ctx, w * (bump / 15), h * 0.5, h * (0.035 + random() * 0.02));
      paint(ctx, '#6fb04f', 0);
    }
    ctx.fillStyle = '#f3e3c3';
    for (let board = 0; board < 30; board += 1) ctx.fillRect(w * (board / 30) + w * 0.004, h * 0.52, w / 30 - w * 0.008, h * 0.14);
    ctx.fillStyle = '#8fd16a';
    ctx.fillRect(0, h * 0.64, w, h * 0.36);
    ctx.fillStyle = '#84c860';
    for (let stripe = 0; stripe < 4; stripe += 1) ctx.fillRect(0, h * (0.68 + stripe * 0.085), w, h * 0.04);
    for (let flower = 0; flower < 12; flower += 1) {
      const [x, y] = [random() * w, h * (0.66 + random() * 0.32)];
      dots(ctx, ['#ff9ec4', '#ffd23f', '#ffffff'][flower % 3], [[x, y, h * 0.009]]);
    }
  },
  elephant(ctx, w, h, random) {
    // The savanna: a warm sky, far hills, flat-topped trees and long golden grass.
    sky(ctx, w, h, '#ffe6ad', '#ffd08a', 0.62);
    circle(ctx, w * 0.8, h * 0.3, h * 0.085);
    paint(ctx, '#fff3c4', 0);
    ctx.beginPath();
    ctx.moveTo(0, h * 0.62);
    for (let step = 0; step <= 12; step += 1) ctx.lineTo(w * (step / 12), h * (0.56 + 0.045 * Math.sin(step * 1.3 + 1)));
    ctx.lineTo(w, h * 0.7);
    ctx.lineTo(0, h * 0.7);
    paint(ctx, '#d9a878', 0);
    ctx.fillStyle = '#e8c267';
    ctx.fillRect(0, h * 0.62, w, h * 0.38);
    for (const [x, size] of [[0.13, 1], [0.58, 0.72], [0.9, 0.9]]) {
      const [baseX, baseY, tall] = [w * x, h * 0.66, h * 0.2 * size];
      line(ctx, [[baseX, baseY], [baseX + tall * 0.06, baseY - tall]], tall * 0.07, '#7a5a3a');
      oval(ctx, baseX + tall * 0.06, baseY - tall, tall * 0.62, tall * 0.16);
      paint(ctx, '#7f9a4a', 0);
    }
    for (let blade = 0; blade < 90; blade += 1) {
      const [x, y] = [random() * w, h * (0.66 + random() * 0.34)];
      line(ctx, [[x, y], [x + h * 0.008, y - h * (0.02 + random() * 0.025)]], Math.max(1, h * 0.004), '#d2a94c');
    }
  },
  whale(ctx, w, h, random) {
    // The open ocean: light coming down from above, and the dark sea bed far below.
    sky(ctx, w, h, '#74c6ea', '#1d5c9e');
    ctx.globalAlpha = 0.1;
    for (const x of [0.12, 0.38, 0.62, 0.86]) {
      shape(ctx, [[w * x, 0], [w * (x + 0.08), 0], [w * (x + 0.03), h], [w * (x - 0.12), h]]);
      paint(ctx, '#ffffff', 0);
    }
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let step = 0; step <= 14; step += 1) ctx.lineTo(w * (step / 14), h * (0.95 - 0.03 * Math.abs(Math.sin(step * 1.7))));
    ctx.lineTo(w, h);
    paint(ctx, '#174a80', 0);
    for (let bubble = 0; bubble < 10; bubble += 1) {
      ctx.globalAlpha = 0.35;
      circle(ctx, random() * w, random() * h, (0.006 + random() * 0.012) * h);
      paint(ctx, null, Math.max(1, h * 0.0025), '#ffffff');
    }
    ctx.globalAlpha = 1;
  },
  cloud(ctx, w, h, random) {
    // High in the sky: the sea far below, with little islands and mountains on it.
    sky(ctx, w, h, '#7cc6ff', '#dff3ff', 0.86);
    ctx.fillStyle = '#4aa6dc';
    ctx.fillRect(0, h * 0.87, w, h * 0.13);
    for (const [x, wide] of [[0.14, 0.11], [0.47, 0.07], [0.8, 0.13]]) {
      oval(ctx, w * x, h * 0.9, w * wide, h * 0.022);
      paint(ctx, '#f3e3a8', 0);
      shape(ctx, [[w * (x - wide * 0.6), h * 0.895], [w * (x - wide * 0.1), h * 0.835], [w * (x + wide * 0.5), h * 0.895]]);
      paint(ctx, '#6fb96a', 0);
      shape(ctx, [[w * (x - wide * 0.2), h * 0.853], [w * (x - wide * 0.1), h * 0.835], [w * x, h * 0.853]]);
      paint(ctx, '#ffffff', 0);
    }
    for (let puff = 0; puff < 5; puff += 1) {
      const [x, y, size] = [random() * w, h * (0.2 + random() * 0.55), h * (0.03 + random() * 0.03)];
      ctx.globalAlpha = 0.5;
      for (const [dx, r] of [[-1, 0.8], [0, 1], [1, 0.75]]) {
        circle(ctx, x + dx * size, y + (dx === 0 ? -size * 0.3 : 0), size * r);
        paint(ctx, '#ffffff', 0);
      }
    }
    ctx.globalAlpha = 1;
  },
  planet(ctx, w, h, random) {
    // Out among the moons: dark, with a far-off sun.
    sky(ctx, w, h, '#0e1b3d', '#1d3466');
    stars(ctx, w, h, random, 150);
    glow(ctx, w * 0.9, h * 0.16, h * 0.3, '#ffe9a8', 0.5);
    circle(ctx, w * 0.9, h * 0.16, h * 0.03);
    paint(ctx, '#fff3c4', 0);
  },
  sun(ctx, w, h, random) {
    // Among the planets: darker still, with clouds of colour a long way off.
    sky(ctx, w, h, '#140c33', '#2b1856');
    glow(ctx, w * 0.2, h * 0.3, h * 0.5, '#7a3fa8', 0.35);
    glow(ctx, w * 0.82, h * 0.75, h * 0.45, '#2f5fa8', 0.35);
    stars(ctx, w, h, random, 190);
  },
  galaxy(ctx, w, h, random) {
    // Among the stars: the deep sky, with other galaxies far away.
    sky(ctx, w, h, '#070a1f', '#121d44');
    glow(ctx, w * 0.5, h * 0.5, h * 0.7, '#2b2a6e', 0.4);
    stars(ctx, w, h, random, 260, 0.9);
    for (let far = 0; far < 7; far += 1) {
      ctx.globalAlpha = 0.5;
      oval(ctx, random() * w, random() * h, h * (0.012 + random() * 0.012), h * 0.005, random() * 3);
      paint(ctx, ['#b9a7ff', '#ffd9a8', '#9ad8ff'][far % 3], 0);
    }
    ctx.globalAlpha = 1;
  },
  // After the last world: the whole sky, full of galaxies.
  sky(ctx, w, h, random) {
    sky(ctx, w, h, '#05060f', '#0d1330');
    stars(ctx, w, h, random, 320, 0.9);
    for (let far = 0; far < 26; far += 1) {
      const [x, y, size] = [random() * w, random() * h, h * (0.012 + random() * 0.02)];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(random() * 3);
      ctx.scale(size, size * (0.45 + random() * 0.5));
      ctx.globalAlpha = 0.7;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      spiral(ctx, random() * 9, ['#b9a7ff', '#ffd9a8', '#9ad8ff'][far % 3]);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },
};

/** Paints a world's backdrop, by its name in worlds.js, or 'sky' for what comes after the last, to fill w by h. */
export function paintBackdrop(ctx, id, w, h) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  BACKDROPS[id](ctx, w, h, seeded(id.length * 7919 + id.charCodeAt(0) * 31));
  ctx.restore();
}
