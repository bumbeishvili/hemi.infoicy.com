// What's on Moto Mountain's road, made of simple shapes with no image files: the motorbike and how its rider
// sits on it, and the stars, puddles, sheep, ramps and the rest that the levels bring. Each is built once and
// stands on the ground at its own middle, facing +z, which is the way the bike goes.
import * as THREE from '../../vendor/three/three.module.js';
import { ball, makePose, mergeParts, outlineMaterial, roundedBox, star, taper, toon } from '../../core/body/characters.js';

export const INK = '#3d2a17';
const toonWith = (options) => new THREE.MeshToonMaterial({ gradientMap: toon(), ...options });
export const paint = (colour) => toonWith({ color: colour });

/** Joins parts into one object with an ink line round it. */
export function solid(parts, { ink = INK, outline = 0.02, shadow = true } = {}) {
  const geometry = mergeParts(parts);
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, toonWith({ vertexColors: true }));
  mesh.castShadow = shadow;
  group.add(mesh);
  if (outline) group.add(new THREE.Mesh(geometry, outlineMaterial(ink, outline)));
  return group;
}

const tube = (radius, length, sides = 12) => new THREE.CylinderGeometry(radius, radius, length, sides);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const QUARTER = Math.PI / 2;

/* ------------------------------- the motorbike ------------------------------- */

export const BIKE_SIZE = { wheel: 0.36, base: 0.74, seat: 0.82, bars: 1.12 };

/** A wheel standing on the ground at the origin, which turns about its axle. */
function wheel(colour) {
  const { wheel: radius } = BIKE_SIZE;
  const group = new THREE.Group();
  const turning = solid([
    { geometry: new THREE.TorusGeometry(radius - 0.08, 0.085, 10, 24).rotateY(QUARTER), colour: '#2b2f36' },
    { geometry: tube(radius - 0.12, 0.05, 20).rotateZ(QUARTER), colour: '#c9d1d9' },
    { geometry: tube(0.075, 0.13, 12).rotateZ(QUARTER), colour },
    // Spokes that can be seen going round.
    ...[0, 1, 2].map((n) => ({ geometry: box(0.07, (radius - 0.12) * 2, 0.045), colour: '#8f99a3', turn: [(n * Math.PI) / 3, 0, 0] })),
  ], { outline: 0.014 });
  turning.position.y = radius;
  group.add(turning);
  group.userData.turning = turning;
  return group;
}

/**
 * The bike, with its wheels on the ground at the origin: lean is the part that tips over, about the line the
 * tyres stand on, and wheels turn as it goes. colour is its paint.
 */
export function buildBike(colour = '#e4572e') {
  const { wheel: radius, base, seat, bars } = BIKE_SIZE;
  const root = new THREE.Group();
  const lean = new THREE.Group();
  root.add(lean);
  const dark = '#3a4250';
  const steel = '#aab3ba';
  const body = solid([
    // The frame, from the back wheel up to the handlebars.
    { geometry: box(0.1, 0.1, 1.0), colour: dark, at: [0, radius + 0.1, -0.1], turn: [-0.12, 0, 0] },
    { geometry: tube(0.05, 0.86), colour: steel, at: [0, 0.74, base - 0.2], turn: [-0.42, 0, 0] },
    // Engine, tank and seat.
    { geometry: roundedBox(0.3, 0.3, 0.44, 0.07), colour: steel, at: [0, radius + 0.13, 0.12] },
    { geometry: ball(0.21, 0.19, 0.36), colour, at: [0, seat + 0.04, 0.26] },
    { geometry: roundedBox(0.3, 0.1, 0.62, 0.045), colour: '#2b2f36', at: [0, seat, -0.3] },
    // Mudguards.
    { geometry: new THREE.TorusGeometry(radius + 0.06, 0.05, 6, 14, Math.PI * 0.6).rotateY(QUARTER).rotateX(-0.5), colour, at: [0, radius, -base] },
    { geometry: new THREE.TorusGeometry(radius + 0.06, 0.05, 6, 14, Math.PI * 0.5).rotateY(QUARTER).rotateX(-0.9), colour, at: [0, radius, base] },
    // Handlebars, grips and the lamp.
    { geometry: tube(0.035, 0.74), colour: dark, at: [0, bars, base - 0.34], turn: [0, 0, QUARTER] },
    { geometry: tube(0.05, 0.16), colour: '#2b2f36', at: [0.33, bars, base - 0.34], turn: [0, 0, QUARTER] },
    { geometry: tube(0.05, 0.16), colour: '#2b2f36', at: [-0.33, bars, base - 0.34], turn: [0, 0, QUARTER] },
    { geometry: ball(0.13, 0.13, 0.1), colour: '#fff3c4', at: [0, bars - 0.16, base - 0.12] },
    { geometry: ball(0.15, 0.15, 0.09), colour: steel, at: [0, bars - 0.16, base - 0.17] },
    // The exhaust, and where the feet go.
    { geometry: tube(0.055, 0.78), colour: steel, at: [0.17, radius + 0.02, -0.42], turn: [QUARTER + 0.1, 0, 0] },
    { geometry: tube(0.03, 0.56), colour: dark, at: [0, radius + 0.02, 0.1], turn: [0, 0, QUARTER] },
    // A little lamp at the back.
    { geometry: ball(0.07, 0.06, 0.05), colour: '#d9413a', at: [0, seat - 0.03, -0.64] },
  ], { outline: 0.016 });
  const back = wheel(colour);
  back.position.z = -base;
  const front = wheel(colour);
  front.position.z = base;
  lean.add(body, back, front);
  return { root, lean, wheels: [back.userData.turning, front.userData.turning], seat: new THREE.Vector3(0, seat, -0.28) };
}

/**
 * How a character sits on the bike: hips on the seat, feet on the pegs, hands on the grips, leaning forward a
 * little. extra tips the body further into a lean, as riders do, the right side positive.
 */
export function ridingPose(out = makePose(), extra = 0, bounce = 0) {
  Object.assign(out, makePose());
  out.hipDrop = -0.2 - bounce;
  out.hipZ = -0.3;
  out.pitch = 0.36;
  out.roll = -extra;
  out.headPitch = -0.1;
  out.handLX = 0.02;
  out.handLY = -0.34;
  out.handLZ = 0.78;
  out.handRX = -0.02;
  out.handRY = -0.34;
  out.handRZ = 0.78;
  out.openL = 0.25;
  out.openR = 0.25;
  out.footLX = 0.25;
  out.footLY = 0.3;
  out.footLZ = 0.02;
  out.footRX = -0.25;
  out.footRY = 0.3;
  out.footRZ = 0.02;
  return out;
}

/** A small scooter for a friend to trundle along on. */
export function buildScooter(colour = '#4aa3df') {
  const root = new THREE.Group();
  const lean = new THREE.Group();
  root.add(lean);
  const body = solid([
    { geometry: roundedBox(0.36, 0.12, 0.9, 0.05), colour, at: [0, 0.3, -0.05] },
    { geometry: roundedBox(0.4, 0.42, 0.5, 0.1), colour, at: [0, 0.5, -0.42] },
    { geometry: roundedBox(0.34, 0.09, 0.5, 0.04), colour: '#2b2f36', at: [0, 0.76, -0.4] },
    { geometry: roundedBox(0.34, 0.6, 0.1, 0.04), colour, at: [0, 0.6, 0.42], turn: [-0.25, 0, 0] },
    { geometry: tube(0.035, 0.6), colour: '#3a4250', at: [0, 1.02, 0.36], turn: [0, 0, QUARTER] },
    { geometry: ball(0.1, 0.1, 0.07), colour: '#fff3c4', at: [0, 0.82, 0.52] },
    { geometry: new THREE.TorusGeometry(0.17, 0.07, 8, 16).rotateY(QUARTER), colour: '#2b2f36', at: [0, 0.22, 0.52] },
    { geometry: new THREE.TorusGeometry(0.17, 0.07, 8, 16).rotateY(QUARTER), colour: '#2b2f36', at: [0, 0.22, -0.5] },
  ], { outline: 0.016 });
  lean.add(body);
  return { root, lean };
}

/** How a friend sits on the scooter, with one hand free to wave. wave goes from 0 to 1 and back. */
export function scooterPose(out = makePose(), wave = 0) {
  Object.assign(out, makePose());
  out.hipDrop = -0.2;
  out.hipZ = -0.38;
  out.pitch = 0.12;
  out.handLX = 0.0;
  out.handLY = -0.36;
  out.handLZ = 0.74;
  out.handRX = -0.02 - wave * 0.5;
  out.handRY = -0.36 + wave * 1.3;
  out.handRZ = 0.74 - wave * 0.6;
  out.openL = 0.25;
  out.openR = 0.25 + wave * 0.75;
  out.footLX = 0.16;
  out.footLY = 0.26;
  out.footLZ = 0.08;
  out.footRX = -0.16;
  out.footRY = 0.26;
  out.footRZ = 0.08;
  return out;
}

/* ------------------------------- what the levels bring ------------------------------- */

/** A gold star, standing a little off the road and turning. */
export function buildStar() {
  const geometry = star(0.62, 0.29, 0.16).translate(0, 0, -0.08);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, paint('#ffd23f')), new THREE.Mesh(geometry, outlineMaterial('#8a5a00', 0.022)));
  return group;
}

/** A heap of snow with a twig in it, to burst through. */
export function buildSnowHeap() {
  return solid([
    { geometry: ball(0.78, 0.52, 0.7), colour: '#f4f8fb', at: [0, 0.3, 0] },
    { geometry: ball(0.46, 0.36, 0.44), colour: '#ffffff', at: [0.22, 0.72, 0.05] },
    { geometry: ball(0.3, 0.24, 0.3), colour: '#eaf1f6', at: [-0.42, 0.3, 0.3] },
    { geometry: tube(0.025, 0.5, 6), colour: '#7a5230', at: [0.3, 1.1, 0.02], turn: [0, 0, -0.4] },
  ], { ink: '#7f93a6', outline: 0.022 });
}

/** A puddle, flat on the road. */
export function buildPuddle(reach) {
  const group = new THREE.Group();
  // Long along the road, as anything flat is seen very squashed from the bike.
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 28).rotateX(-QUARTER).scale(reach, 1, reach * 2.6), new THREE.MeshBasicMaterial({ color: '#58b4ee', transparent: true, opacity: 0.92 }));
  water.position.y = 0.03;
  const rim = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 28).rotateX(-QUARTER).scale(reach, 1, reach * 2.6), new THREE.MeshBasicMaterial({ color: '#2f86c7', transparent: true, opacity: 0.9 }));
  rim.position.y = 0.035;
  const shine = new THREE.Mesh(new THREE.CircleGeometry(1, 20).rotateX(-QUARTER).scale(reach * 0.45, 1, reach * 0.9), new THREE.MeshBasicMaterial({ color: '#d5eefc', transparent: true, opacity: 0.85 }));
  shine.position.set(-reach * 0.25, 0.04, -reach * 0.6);
  group.add(water, rim, shine);
  return group;
}

/** Arrows painted on the road, pointing the way the bike goes, which make it faster. */
export function buildBoost(reach) {
  const shape = new THREE.Shape();
  shape.moveTo(-1, -0.5);
  shape.lineTo(0, 0.5);
  shape.lineTo(1, -0.5);
  shape.lineTo(1, -1.05);
  shape.lineTo(0, -0.05);
  shape.lineTo(-1, -1.05);
  shape.closePath();
  const group = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(reach * 2, 13).rotateX(-QUARTER), new THREE.MeshBasicMaterial({ color: '#1f6f8f', transparent: true, opacity: 0.7 }));
  pad.position.y = 0.025;
  group.add(pad);
  for (const [n, colour] of [[-1, '#f7d154'], [0, '#fbe38a'], [1, '#fff2bf']]) {
    const arrow = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-QUARTER).scale(reach * 0.72, 1, 3.2), new THREE.MeshBasicMaterial({ color: colour }));
    // A shape's up, laid flat, points along -z: turned round, it points the way the bike goes.
    arrow.rotation.y = Math.PI;
    arrow.position.set(0, 0.035, n * 4);
    group.add(arrow);
  }
  return group;
}

/** A woolly sheep, standing across the road. */
export function buildSheep() {
  const wool = '#f7f2e6';
  const face = '#4b4038';
  const group = solid([
    { geometry: ball(0.52, 0.42, 0.7), colour: wool, at: [0, 0.78, 0] },
    { geometry: ball(0.3, 0.26, 0.3), colour: wool, at: [0, 1.0, 0.36] },
    { geometry: ball(0.24, 0.2, 0.24), colour: wool, at: [0.26, 0.98, -0.2] },
    { geometry: ball(0.24, 0.2, 0.24), colour: wool, at: [-0.26, 0.98, -0.2] },
    { geometry: ball(0.2, 0.2, 0.2), colour: wool, at: [0, 0.82, -0.66] },
    { geometry: ball(0.19, 0.22, 0.24), colour: face, at: [0, 0.98, 0.72] },
    { geometry: ball(0.09, 0.05, 0.12), colour: face, at: [0.22, 1.06, 0.62], turn: [0, 0, -0.5] },
    { geometry: ball(0.09, 0.05, 0.12), colour: face, at: [-0.22, 1.06, 0.62], turn: [0, 0, 0.5] },
    { geometry: ball(0.035), colour: '#ffffff', at: [0.09, 1.04, 0.92] },
    { geometry: ball(0.035), colour: '#ffffff', at: [-0.09, 1.04, 0.92] },
    ...[[0.24, 0.36], [-0.24, 0.36], [0.24, -0.36], [-0.24, -0.36]].map(([x, z]) => ({ geometry: tube(0.06, 0.46, 8), colour: face, at: [x, 0.23, z] })),
  ], { outline: 0.02 });
  // Seen from the bike, it stands sideways on.
  group.rotation.y = QUARTER;
  const holder = new THREE.Group();
  holder.add(group);
  return holder;
}

/** A wooden ramp, with the low end towards the bike. */
export function buildRamp(reach) {
  const [width, length, height] = [reach * 2, 4.4, 1.05];
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(length, 0);
  shape.lineTo(length, height);
  shape.closePath();
  const wedge = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false }).translate(-length / 2, 0, -width / 2).rotateY(-QUARTER);
  // Wood and stripes that aren't much brighter than the road: a bike that takes the ramp has the camera go
  // close over it, where it fills the bottom of the picture for a moment.
  const parts = [{ geometry: wedge, colour: '#c08a4a' }];
  // Stripes up the slope, so it's seen as a ramp from a long way off.
  const slope = Math.atan2(height, length);
  for (let n = 0; n < 4; n += 1) {
    const along = -length / 2 + 0.55 + n * 1.1;
    const up = ((along + length / 2) / length) * height;
    parts.push({ geometry: box(width + 0.02, 0.05, 0.42), colour: n % 2 ? '#ecd9ac' : '#e4572e', at: [0, up + 0.035, along], turn: [-slope, 0, 0] });
  }
  return solid(parts, { outline: 0.03 });
}

/**
 * A row of hay bales across the road, reach metres to each side of its middle, with a second row on top, a
 * bale shorter. They're soft: a bike goes through them, and they burst.
 */
export function buildBales(reach) {
  const [wide, tall, deep] = [1.24, 0.62, 0.8];
  const count = Math.max(2, Math.round((reach * 2) / wide));
  const from = -((count - 1) * wide) / 2;
  const parts = [];
  // Hay that's about as bright as the road and the grass it lies across, between the two. A row of it right
  // across the road goes by close under a bike that's flying over, and fills the bottom of the picture for a
  // moment: pale yellow bales changed the whole picture's brightness by 4.7 out of 255 in one frame there,
  // where the most the games allow is 4.
  const bale = (x, y) => {
    parts.push({ geometry: roundedBox(wide - 0.06, tall, deep, 0.08), colour: '#d0a244', at: [x, y, 0] });
    // The two strings round each bale.
    for (const side of [-0.3, 0.3]) parts.push({ geometry: box(0.05, tall + 0.02, deep + 0.02), colour: '#8f6420', at: [x + side, y, 0] });
  };
  for (let n = 0; n < count; n += 1) bale(from + n * wide, tall / 2);
  for (let n = 0; n < count - 1; n += 1) bale(from + (n + 0.5) * wide, tall * 1.5);
  return solid(parts, { outline: 0.025 });
}

/**
 * The water of a river that crosses the road, long metres of it along the road and out to each side for less
 * than half as far as the road ever comes to itself, flat, with pale streaks across it. Its far side is the one
 * a bike wades out of. The ground has a bed dug for it: see buildGround in land.js.
 */
export function buildWater(long, wide = 84) {
  const group = new THREE.Group();
  // A blue between the road's grey and the grass in brightness: it comes into the picture all at once under a
  // bike that flies over the bank, and a paler one changed the picture's brightness by nearly 4 out of 255 there.
  const water = new THREE.Mesh(new THREE.PlaneGeometry(wide, long).rotateX(-QUARTER), new THREE.MeshBasicMaterial({ color: '#4590cf', transparent: true, opacity: 0.72 }));
  group.add(water);
  // Streaks the way the water runs, which is across the road.
  const streak = new THREE.MeshBasicMaterial({ color: '#bfdff5', transparent: true, opacity: 0.7 });
  for (let n = 0; n < 9; n += 1) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(3 + (n % 3) * 1.4, 0.16).rotateX(-QUARTER), streak);
    line.position.set(((n * 37) % 23) - 11, 0.02, -long / 2 + ((n + 0.5) * long) / 9);
    group.add(line);
  }
  return group;
}

/** One length of a wooden bridge's deck, as wide as the bridge, and a railing post for each side. */
export function buildPlank(width) {
  return solid([{ geometry: box(width, 0.14, 1.86), colour: '#c9925a' }, { geometry: box(width, 0.15, 0.1), colour: '#a8713a', at: [0, 0, 0.95] }], { outline: 0 });
}

export function buildRail(length) {
  return solid([
    { geometry: box(0.16, 1.0, 0.16), colour: '#8a5a2b', at: [0, 0.5, -length / 2 + 0.1] },
    { geometry: box(0.1, 0.12, length), colour: '#b98248', at: [0, 0.92, 0] },
    { geometry: box(0.08, 0.1, length), colour: '#b98248', at: [0, 0.5, 0] },
  ], { outline: 0.02 });
}

/** A board with arrows on it, standing on the outside of a bend and pointing the way it goes. */
export function buildChevron(turn) {
  const group = solid([
    { geometry: box(0.12, 1.5, 0.12), colour: '#6b7280', at: [-0.95, 0.75, 0] },
    { geometry: box(0.12, 1.5, 0.12), colour: '#6b7280', at: [0.95, 0.75, 0] },
    { geometry: box(2.7, 1.1, 0.1), colour: '#f7f2e6', at: [0, 1.7, 0] },
  ], { outline: 0.03 });
  const shape = new THREE.Shape();
  shape.moveTo(-0.34, 0.42);
  shape.lineTo(0.08, 0);
  shape.lineTo(-0.34, -0.42);
  shape.lineTo(0.0, -0.42);
  shape.lineTo(0.42, 0);
  shape.lineTo(0.0, 0.42);
  shape.closePath();
  for (const x of [-0.82, 0, 0.82]) {
    // Seen from in front, the board's own right is the right, and an arrow turned over is seen from its back.
    const arrow = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: '#d9413a', side: THREE.DoubleSide }));
    arrow.position.set(x, 1.7, 0.09);
    arrow.scale.x = turn;
    group.add(arrow);
  }
  return group;
}

/** A pine, a rock and a flower: one of each, to be copied all over the mountain. */
export function pineGeometry() {
  return mergeParts([
    { geometry: tube(0.16, 0.9, 7), colour: '#7a5230', at: [0, 0.45, 0] },
    { geometry: new THREE.ConeGeometry(1.25, 2.1, 8), colour: '#2f7d55', at: [0, 1.7, 0] },
    { geometry: new THREE.ConeGeometry(0.98, 1.8, 8), colour: '#3a8f62', at: [0, 2.75, 0] },
    { geometry: new THREE.ConeGeometry(0.66, 1.5, 8), colour: '#48a370', at: [0, 3.7, 0] },
  ]);
}

export function rockGeometry() {
  return mergeParts([
    { geometry: new THREE.DodecahedronGeometry(1, 0).scale(1, 0.72, 0.9), colour: '#9aa3ab', at: [0, 0.45, 0] },
    { geometry: new THREE.DodecahedronGeometry(0.55, 0).scale(1, 0.8, 1), colour: '#aab3ba', at: [0.85, 0.28, 0.3] },
  ]);
}

export function flowerGeometry() {
  return mergeParts([
    { geometry: tube(0.025, 0.34, 5), colour: '#3f9a52', at: [0, 0.17, 0] },
    { geometry: ball(0.13, 0.09, 0.13), colour: '#ffffff', at: [0, 0.38, 0] },
  ]);
}

/** The hut at the end of the ride, with its flag. */
export function buildHut() {
  const wall = '#c98f5a';
  const roof = '#b5463c';
  const group = solid([
    { geometry: box(6.4, 3.2, 5), colour: wall, at: [0, 1.6, 0] },
    { geometry: new THREE.CylinderGeometry(0.02, 4.6, 2.6, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.82), colour: roof, at: [0, 4.5, 0] },
    { geometry: box(1.3, 2.1, 0.12), colour: '#7a5230', at: [0, 1.05, 2.52] },
    { geometry: box(1.2, 1.0, 0.12), colour: '#bfe3f5', at: [-1.95, 1.9, 2.52] },
    { geometry: box(1.2, 1.0, 0.12), colour: '#bfe3f5', at: [1.95, 1.9, 2.52] },
    { geometry: box(0.7, 1.5, 0.7), colour: '#9aa3ab', at: [1.9, 5.0, -0.6] },
    { geometry: tube(0.07, 5.4, 8), colour: '#f7f2e6', at: [4.4, 2.7, 1.6] },
    { geometry: box(1.5, 0.9, 0.05), colour: '#e4572e', at: [5.2, 4.9, 1.6] },
  ], { outline: 0.035 });
  return group;
}

/**
 * A banner over the road: green for the start, and chequered for the finish. The bike rides under it, so for a
 * moment it fills the top of the picture: its colours are about as bright as the sky behind it, and the finish's
 * squares are grey and cream, not black and white, so that nothing dark sweeps across the screen.
 */
export function buildArch(width, finish) {
  const post = (x) => ({ geometry: tube(0.16, 6.6, 10), colour: '#f7f2e6', at: [x, 3.3, 0] });
  const parts = [post(-width / 2), post(width / 2)];
  const squares = 12;
  const size = width / squares;
  for (let n = 0; n < squares; n += 1) {
    for (let row = 0; row < 2; row += 1) {
      const dark = (n + row) % 2 === 0;
      const colour = finish ? (dark ? '#8d99a6' : '#f7f2e6') : (dark ? '#4fd68a' : '#c9f3da');
      parts.push({ geometry: box(size, 0.55, 0.12), colour, at: [-width / 2 + size / 2 + n * size, 5.7 + row * 0.55, 0] });
    }
  }
  // No ink line round it: from underneath, as the bike goes through, that would be a dark band across the picture.
  return solid(parts, { outline: 0 });
}

/** The cup at the top of the mountain, at level 10. */
export function buildCup() {
  const gold = '#ffd23f';
  return solid([
    { geometry: box(1.1, 0.5, 1.1), colour: '#9aa3ab', at: [0, 0.25, 0] },
    { geometry: tube(0.09, 0.5, 10), colour: gold, at: [0, 0.75, 0] },
    { geometry: new THREE.CylinderGeometry(0.5, 0.2, 0.7, 20), colour: gold, at: [0, 1.3, 0] },
    { geometry: new THREE.TorusGeometry(0.22, 0.05, 8, 14), colour: gold, at: [0.56, 1.34, 0] },
    { geometry: new THREE.TorusGeometry(0.22, 0.05, 8, 14), colour: gold, at: [-0.56, 1.34, 0] },
  ], { ink: '#8a5a00', outline: 0.025 });
}

/** A far-off mountain with snow on top: a cone and a smaller, whiter one over its tip. */
export function peakGeometry(snow = true) {
  const parts = [{ geometry: new THREE.ConeGeometry(1, 1, 7), colour: '#8fa3bd', at: [0, 0.5, 0] }];
  if (snow) parts.push({ geometry: new THREE.ConeGeometry(0.36, 0.36, 7), colour: '#f4f8fb', at: [0, 0.825, 0] });
  return mergeParts(parts);
}

export { taper };
