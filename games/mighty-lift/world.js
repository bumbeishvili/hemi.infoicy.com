// The yard: the child's character with a weight in its hand, the crane the rope runs to, the heavy thing on
// its hook, and whoever is stuck under it. It draws what the rules in lift.js say, and the character copies
// the child's body, as a mirror would.
//
// Nothing flashes or strobes, as seizures are more common in children with hemiplegia: things come and go by
// growing and shrinking, a rescue is a burst of small shapes, and the picture itself never changes brightness.
import * as THREE from '../../vendor/three/three.module.js';
import { Fighter3D, ball, makePose, mergeParts, mixPose, outlineMaterial, roundedBox, star, taper, toon } from '../../core/body/characters.js';
import { byId as characterById } from '../../core/body/roster.js';
import { SHAPES, Sparks, spriteTexture } from '../../core/body/sparks.js';

const INK = '#3d2a17';
const LIFTER_AT = [-1, 0, 0];
const LIFTER_FACES = 0.16; // Turned a little towards the crane.
const RING_AT = new THREE.Vector3(-1, 0.06, 0.78); // Where the rope goes through, at the lifter's feet.
const POST_AT = [0.55, 0, -0.45];
const ARM_HEIGHT = 3.62;
const HOOK = { x: 1.8, z: 0.1 };
export const LINE_HEIGHT = 1.2; // How far off the ground a thing is when it's at the line.
const EXIT_AT = [1.5, 0, 1.75]; // Where a friend gets out to.
const MOTHER_AT = [0.95, 0, 1.45]; // Where the mother duck waits for her ducklings.
const HELPER_AT = [0.98, 0, 0.62];
const HOOK_WAITS = 1.75; // How high the hook hangs with nothing on it.
const FRIEND_SIZE = 0.56;
const FRIEND_MOST = 1.08; // As tall as a friend can stand under a thing at the line.
const MATE_SLOTS = [[-2.35, -0.8], [-3.5, -1.5], [-0.05, -1.75]];
const MATE_SIZE = 0.9;
const TEAM_SIZE = 1.22; // The thing everyone lifts together is this much bigger.
// Several lifting in front of one camera stand side by side, left to right across the screen as they stand in
// front of it: where each is and how big, [x, z, size], for so many of them. They're all the same size, as
// nobody is the main one. Two and three stand where a child and their friends do. Four are in a row, a little
// smaller, so that nobody is behind anybody.
const HOME = [LIFTER_AT[0], LIFTER_AT[2]];
const BESIDE = {
  2: [[...MATE_SLOTS[0], 1], [...HOME, 1]],
  3: [[...MATE_SLOTS[1], 1], [...MATE_SLOTS[0], 1], [...HOME, 1]],
  4: [[-3.5, -0.6, 0.85], [-2.5, -0.6, 0.85], [-1.5, -0.6, 0.85], [-0.5, -0.6, 0.85]],
};

const VIEWS = {
  choose: { at: [LIFTER_AT[0], 1.62, 7.5], look: [LIFTER_AT[0], 0.98, 0], fov: 30 },
  // The lifter on the right of the screen, with the child's own picture on the left.
  warmup: { at: [LIFTER_AT[0] - 2.1, 1.7, 8.3], look: [LIFTER_AT[0] - 2.1, 1.05, 0], fov: 30 },
  // With several at one camera, their lifters side by side on the right, clear of their picture and the film,
  // which are one above the other on the left: see the warm-up in style.css.
  warmupBeside: { at: [LIFTER_AT[0] - 2.4, 1.7, 9.3], look: [LIFTER_AT[0] - 2.4, 1.05, 0], fov: 30 },
  play: { at: [0.42, 2.05, 9.4], look: [0.42, 1.5, 0], fov: 30 },
  // Three or four side by side reach further to the left, so the view is from a little further that way.
  playBeside: { at: [-0.1, 2.05, 9.4], look: [-0.1, 1.5, 0], fov: 30 },
  win: { at: [-0.1, 1.8, 7.4], look: [-0.5, 1.25, 0], fov: 30 },
};

// A picture taller than it's wide, as each half of the split screen is, would cut the yard off at its sides, so
// there the camera stands further back. On the chooser the lifter stays clear of the cards above and below, and in
// the warm-up it's below the child's picture and the film, which are side by side along the top.
const NARROW_VIEWS = {
  choose: { at: [LIFTER_AT[0], 1.6, 16], look: [LIFTER_AT[0], 1.3, 0], fov: 30 },
  warmup: { at: [LIFTER_AT[0] + 0.4, 3, 12.5], look: [LIFTER_AT[0] + 0.4, 3, 0], fov: 30 },
  play: { at: [0.1, 2.6, 15.5], look: [0.1, 1.7, 0], fov: 34 },
  win: { at: [-1.4, 2, 11.5], look: [-1.4, 1.35, 0], fov: 32 },
};

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const damp = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));
const UP = new THREE.Vector3(0, 1, 0);
const scratch = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3() };

/* ------------------------------- things made of shapes ------------------------------- */

const toonWith = (options) => new THREE.MeshToonMaterial({ gradientMap: toon(), ...options });
const paint = (colour) => toonWith({ color: colour });

/** Joins parts into one object with an ink line round it. */
function solid(parts, ink = INK, outline = 0.014) {
  const geometry = mergeParts(parts);
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, toonWith({ vertexColors: true }));
  mesh.castShadow = true;
  group.add(mesh, new THREE.Mesh(geometry, outlineMaterial(ink, outline)));
  return group;
}

const ring = (radius, tube) => new THREE.TorusGeometry(radius, tube, 8, 20);
const disc = (radius, height, sides = 24) => new THREE.CylinderGeometry(radius, radius, height, sides);

// What a child lifts. Each stands on the ground at its own middle. top is where the hook takes it, inner how
// much room there is under it, and reach how far it is from its middle to its edge.
const THINGS = {
  /** An upturned wicker basket, with gaps to see in through. */
  basket() {
    const [height, wide, narrow] = [1.15, 0.74, 0.52];
    const lean = Math.atan2(wide - narrow, height);
    const slat = new THREE.BoxGeometry(0.085, Math.hypot(wide - narrow, height), 0.035);
    const parts = [];
    for (let i = 0; i < 16; i += 1) {
      const angle = (i / 16) * Math.PI * 2;
      const out = (wide + narrow) / 2;
      parts.push({ geometry: slat, colour: i % 2 ? '#d9a55b' : '#c98f45', at: [Math.cos(angle) * out, height / 2, -Math.sin(angle) * out], turn: [0, angle, lean] });
    }
    for (const [y, tube] of [[0.04, 0.05], [0.4, 0.034], [0.78, 0.034], [height, 0.05]]) {
      parts.push({ geometry: ring(wide + (narrow - wide) * (y / height), tube).rotateX(Math.PI / 2), colour: '#a8713a', at: [0, y, 0] });
    }
    parts.push({ geometry: disc(narrow, 0.06), colour: '#d9a55b', at: [0, height, 0] });
    parts.push({ geometry: ring(0.15, 0.03), colour: '#8a5a2b', at: [0, height + 0.13, 0] });
    return { model: solid(parts), top: height + 0.28, inner: height, reach: wide };
  },
  /** A wooden crate with iron weights on it, which is why it's slow to rise. */
  crate() {
    const [wide, height, deep] = [1.36, 1.1, 1.2];
    const parts = [];
    for (const x of [-1, 1]) for (const z of [-1, 1]) parts.push({ geometry: new THREE.BoxGeometry(0.11, height, 0.11), colour: '#8a5a2b', at: [(x * wide) / 2, height / 2, (z * deep) / 2] });
    [0.17, 0.52, 0.87].forEach((y, row) => {
      const colour = row % 2 ? '#c9925a' : '#b98248';
      for (const z of [-1, 1]) parts.push({ geometry: new THREE.BoxGeometry(wide, 0.21, 0.05), colour, at: [0, y, (z * deep) / 2] });
      for (const x of [-1, 1]) parts.push({ geometry: new THREE.BoxGeometry(0.05, 0.21, deep), colour, at: [(x * wide) / 2, y, 0] });
    });
    parts.push({ geometry: new THREE.BoxGeometry(wide + 0.08, 0.07, deep + 0.08), colour: '#b98248', at: [0, height, 0] });
    for (const x of [-0.34, 0.34]) {
      parts.push({ geometry: disc(0.3, 0.13), colour: '#4b5563', at: [x, height + 0.1, 0] });
      parts.push({ geometry: disc(0.1, 0.15), colour: '#aab3ba', at: [x, height + 0.1, 0] });
    }
    parts.push({ geometry: ring(0.14, 0.03), colour: '#4b5563', at: [0, height + 0.2, 0] });
    return { model: solid(parts), top: height + 0.34, inner: height, reach: 0.78 };
  },
  /** An upturned washtub, with a family of ducklings under it. */
  tub() {
    const height = 0.78;
    const parts = [
      { geometry: new THREE.CylinderGeometry(0.6, 0.82, height, 28, 1, true), colour: '#a9bccb', at: [0, height / 2, 0] },
      { geometry: disc(0.6, 0.05, 28), colour: '#bccdda', at: [0, height, 0] },
      { geometry: ring(0.82, 0.04).rotateX(Math.PI / 2), colour: '#8497a8', at: [0, 0.03, 0] },
      { geometry: ring(0.6, 0.03).rotateX(Math.PI / 2), colour: '#8497a8', at: [0, height, 0] },
      { geometry: ring(0.13, 0.03), colour: '#8497a8', at: [0, height + 0.12, 0] },
    ];
    for (const x of [-1, 1]) parts.push({ geometry: ring(0.1, 0.025), colour: '#8497a8', at: [x * 0.74, 0.48, 0], turn: [0, Math.PI / 2, 0] });
    return { model: solid(parts, '#3c4a57'), top: height + 0.26, inner: height, reach: 0.82 };
  },
  /** A big rock, too heavy for one lift. */
  rock() {
    const model = solid([
      { geometry: ball(0.92, 0.74, 0.86), colour: '#9aa3ab', at: [0, 0.64, 0] },
      { geometry: ball(0.5, 0.42, 0.48), colour: '#aab3ba', at: [0.55, 0.4, 0.36] },
      { geometry: ball(0.44, 0.36, 0.4), colour: '#8d969e', at: [-0.6, 0.36, -0.2] },
      { geometry: ball(0.34, 0.07, 0.28), colour: '#7fbf63', at: [-0.12, 1.36, 0.04] },
      { geometry: ring(0.13, 0.03), colour: '#4b5563', at: [0.1, 1.46, 0] },
    ], '#39424a');
    return { model, top: 1.6, inner: 0.3, reach: 0.95 };
  },
  /** The champion's chest, with the trophy in it. */
  chest() {
    const parts = [
      { geometry: roundedBox(1.7, 0.8, 1.15, 0.08), colour: '#b5651d', at: [0, 0.4, 0] },
      { geometry: new THREE.CylinderGeometry(0.575, 0.575, 1.7, 20, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), colour: '#c9772a', at: [0, 0.8, 0] },
      { geometry: roundedBox(0.22, 0.26, 0.09, 0.03), colour: '#ffd23f', at: [0, 0.74, 0.59] },
      { geometry: ring(0.14, 0.03), colour: '#8a5a00', at: [0, 1.46, 0] },
    ];
    for (const x of [-0.55, 0.55]) {
      parts.push({ geometry: new THREE.BoxGeometry(0.13, 0.84, 1.19), colour: '#ffd23f', at: [x, 0.4, 0] });
      parts.push({ geometry: new THREE.CylinderGeometry(0.595, 0.595, 0.13, 20, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), colour: '#ffd23f', at: [x, 0.8, 0] });
    }
    return { model: solid(parts, '#5a2f0b'), top: 1.62, inner: 0.5, reach: 0.95 };
  },
};

const hookBlock = () => solid([
  { geometry: roundedBox(0.22, 0.2, 0.2, 0.05), colour: '#e2513f' },
  { geometry: ring(0.07, 0.024), colour: '#4b5563', at: [0, -0.15, 0] },
]);

function duckling() {
  return solid([
    { geometry: ball(0.11, 0.1, 0.14), colour: '#ffd84a', at: [0, 0.12, 0] },
    { geometry: ball(0.085), colour: '#ffe27a', at: [0, 0.26, 0.09] },
    { geometry: taper(0.035, 0.012, 0.07, 8).rotateX(Math.PI / 2), colour: '#ff9f2e', at: [0, 0.25, 0.16] },
    { geometry: ball(0.015), colour: '#2c1a0f', at: [0.045, 0.29, 0.15] },
    { geometry: ball(0.015), colour: '#2c1a0f', at: [-0.045, 0.29, 0.15] },
  ], '#7a5a12', 0.008);
}

function motherDuck() {
  return solid([
    { geometry: ball(0.24, 0.2, 0.32), colour: '#fdfdf5', at: [0, 0.27, 0] },
    { geometry: ball(0.1, 0.2, 0.1), colour: '#fdfdf5', at: [0, 0.5, 0.2] },
    { geometry: ball(0.13), colour: '#fdfdf5', at: [0, 0.68, 0.24] },
    { geometry: taper(0.06, 0.02, 0.13, 8).rotateX(Math.PI / 2), colour: '#ff9f2e', at: [0, 0.66, 0.34] },
    { geometry: ball(0.02), colour: '#2c1a0f', at: [0.07, 0.72, 0.33] },
    { geometry: ball(0.02), colour: '#2c1a0f', at: [-0.07, 0.72, 0.33] },
    { geometry: ball(0.07, 0.13, 0.2), colour: '#e9e9dc', at: [0.22, 0.3, -0.03] },
    { geometry: ball(0.07, 0.13, 0.2), colour: '#e9e9dc', at: [-0.22, 0.3, -0.03] },
    { geometry: taper(0.09, 0.02, 0.16, 8).rotateX(-Math.PI / 2.6), colour: '#fdfdf5', at: [0, 0.34, -0.26] },
  ], '#6b6b5a', 0.01);
}

/** An owl, with its eyes shut or open: two models, one shown at a time. */
function owl() {
  const body = [
    { geometry: ball(0.15, 0.19, 0.14), colour: '#8a6242', at: [0, 0.19, 0] },
    { geometry: ball(0.1, 0.12, 0.07), colour: '#e8d3b4', at: [0, 0.15, 0.09] },
    { geometry: taper(0.045, 0.01, 0.09, 8), colour: '#8a6242', at: [0.08, 0.33, 0] },
    { geometry: taper(0.045, 0.01, 0.09, 8), colour: '#8a6242', at: [-0.08, 0.33, 0] },
    { geometry: taper(0.028, 0.008, 0.05, 8).rotateX(Math.PI / 1.6), colour: '#ff9f2e', at: [0, 0.235, 0.14] },
  ];
  const eyes = (open) => [0.06, -0.06].flatMap((x) => (open
    ? [{ geometry: ball(0.045, 0.045, 0.02), colour: '#fff6dc', at: [x, 0.27, 0.125] }, { geometry: ball(0.022, 0.022, 0.012), colour: '#2c1a0f', at: [x, 0.27, 0.142] }]
    : [{ geometry: ball(0.042, 0.009, 0.012), colour: '#2c1a0f', at: [x, 0.265, 0.132] }]));
  const group = new THREE.Group();
  const asleep = solid([...body, ...eyes(false)], '#3d2a17', 0.008);
  const awake = solid([...body, ...eyes(true)], '#3d2a17', 0.008);
  awake.visible = false;
  group.add(asleep, awake);
  group.userData = { asleep, awake };
  return group;
}

const hive = () => solid([
  { geometry: ball(0.2, 0.075, 0.2), colour: '#f0b429', at: [0, 0.07, 0] },
  { geometry: ball(0.18, 0.07, 0.18), colour: '#e6a31c', at: [0, 0.18, 0] },
  { geometry: ball(0.14, 0.065, 0.14), colour: '#f0b429', at: [0, 0.28, 0] },
  { geometry: ball(0.085, 0.055, 0.085), colour: '#e6a31c', at: [0, 0.36, 0] },
  { geometry: ball(0.05, 0.05, 0.02), colour: '#3d2a17', at: [0, 0.1, 0.19] },
], '#7a4d05', 0.008);

/** A honey pot, with honey that rises in it. */
function honeyPot() {
  const group = solid([
    { geometry: new THREE.CylinderGeometry(0.1, 0.085, 0.16, 16, 1, true), colour: '#b5651d', at: [0, 0.08, 0] },
    { geometry: disc(0.085, 0.02, 16), colour: '#8a4a12', at: [0, 0.01, 0] },
    { geometry: ring(0.1, 0.018).rotateX(Math.PI / 2), colour: '#8a4a12', at: [0, 0.16, 0] },
  ], '#3d2a17', 0.008);
  const honey = new THREE.Mesh(disc(0.085, 0.14, 16).translate(0, 0.07, 0), paint('#ffc93c'));
  honey.position.y = 0.02;
  group.add(honey);
  group.userData.honey = honey;
  return group;
}

function balloons() {
  const group = new THREE.Group();
  [['#ff5a4f', -0.2, 0.55], ['#ffd23f', 0.02, 0.7], ['#3b82f6', 0.24, 0.56]].forEach(([colour, x, y]) => {
    const one = solid([
      { geometry: ball(0.19, 0.23, 0.19), colour, at: [x, y, 0] },
      { geometry: taper(0.035, 0.012, 0.05, 8).rotateX(Math.PI), colour, at: [x, y - 0.22, 0] },
      { geometry: new THREE.CylinderGeometry(0.006, 0.006, Math.hypot(x, y - 0.24), 5), colour: '#f7f2e6', at: [x / 2, (y - 0.24) / 2, 0], turn: [0, 0, -Math.atan2(x, y - 0.24)] },
    ], '#3d2a17', 0.008);
    group.add(one);
  });
  return group;
}

const trophy = () => solid([
  { geometry: new THREE.CylinderGeometry(0.2, 0.09, 0.26, 20), colour: '#ffd23f', at: [0, 0.4, 0] },
  { geometry: disc(0.035, 0.14, 12), colour: '#ffd23f', at: [0, 0.2, 0] },
  { geometry: disc(0.13, 0.05, 20), colour: '#f0b429', at: [0, 0.11, 0] },
  { geometry: roundedBox(0.3, 0.09, 0.3, 0.02), colour: '#8a5a2b', at: [0, 0.045, 0] },
  { geometry: ring(0.08, 0.02), colour: '#ffd23f', at: [0.24, 0.42, 0] },
  { geometry: ring(0.08, 0.02), colour: '#ffd23f', at: [-0.24, 0.42, 0] },
], '#8a5a00', 0.01);

/** A piece of rope between two places, which can be moved every frame. */
class Rope {
  constructor(scene, colour = '#8a6a44', radius = 0.024) {
    this.mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 8), paint(colour));
    this.mesh.castShadow = true;
    scene.add(this.mesh);
  }

  between(a, b) {
    const along = scratch.c.subVectors(b, a);
    const length = along.length();
    this.mesh.position.copy(a).addScaledVector(along, 0.5);
    this.mesh.scale.set(1, Math.max(0.001, length), 1);
    this.mesh.quaternion.setFromUnitVectors(UP, along.normalize());
  }
}

/* ------------------------------- the place ------------------------------- */

function skyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, '#3f9fe8');
  sky.addColorStop(0.5, '#8fd2fa');
  sky.addColorStop(0.72, '#d9f2ff');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 4, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function house(colour, roof) {
  return solid([
    { geometry: new THREE.BoxGeometry(2.6, 1.9, 2.2), colour, at: [0, 0.95, 0] },
    { geometry: new THREE.ConeGeometry(2.2, 1.3, 4).rotateY(Math.PI / 4), colour: roof, at: [0, 2.55, 0], size: [1, 1, 0.86] },
    { geometry: new THREE.BoxGeometry(0.6, 1, 0.06), colour: '#8a5a2b', at: [0, 0.5, 1.12] },
    { geometry: new THREE.BoxGeometry(0.55, 0.5, 0.06), colour: '#a8def9', at: [-0.8, 1.15, 1.12] },
    { geometry: new THREE.BoxGeometry(0.55, 0.5, 0.06), colour: '#a8def9', at: [0.8, 1.15, 1.12] },
  ], INK, 0.02);
}

function tree(colour) {
  return solid([
    { geometry: new THREE.CylinderGeometry(0.16, 0.22, 1.3, 10), colour: '#8a5a2b', at: [0, 0.65, 0] },
    { geometry: ball(1, 0.95, 1), colour, at: [0, 1.95, 0] },
    { geometry: ball(0.62, 0.6, 0.62), colour, at: [0.6, 1.5, 0.2] },
  ], '#2f5a2a', 0.02);
}

/** The crane: a post, an arm out over the hook, and a tape at the height a thing has to be lifted to. */
function buildCrane() {
  const [x, , z] = POST_AT;
  const dx = HOOK.x + 0.3 - x;
  const dz = HOOK.z - z;
  const length = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dz, dx);
  const parts = [
    { geometry: roundedBox(0.8, 0.2, 0.8, 0.05), colour: '#4b6584', at: [x, 0.1, z] },
    { geometry: new THREE.CylinderGeometry(0.09, 0.11, ARM_HEIGHT, 14), colour: '#e2513f', at: [x, ARM_HEIGHT / 2, z] },
    { geometry: new THREE.BoxGeometry(length + 0.35, 0.15, 0.15), colour: '#e2513f', at: [x + dx / 2 - 0.1, ARM_HEIGHT, z + dz / 2], turn: [0, yaw, 0] },
    { geometry: new THREE.BoxGeometry(0.95, 0.09, 0.09), colour: '#c43d2e', at: [x + (dx / length) * 0.33, ARM_HEIGHT - 0.33, z + (dz / length) * 0.33], turn: [0, yaw, Math.PI / 4] },
    { geometry: disc(0.12, 0.07, 16).rotateX(Math.PI / 2), colour: '#4b5563', at: [HOOK.x, ARM_HEIGHT - 0.06, HOOK.z] },
    { geometry: disc(0.12, 0.07, 16).rotateX(Math.PI / 2), colour: '#4b5563', at: [x, 0.3, z + 0.14] },
    { geometry: ball(0.13), colour: '#ffd23f', at: [x, ARM_HEIGHT + 0.14, z] },
  ];
  // Marks up the post, like a measure.
  for (let y = 0.6; y < ARM_HEIGHT - 0.4; y += 0.3) parts.push({ geometry: disc(0.105, 0.03, 14), colour: '#f7f2e6', at: [x, y, z] });
  return solid(parts, '#3d2a17', 0.016);
}

/** A little sign that counts the day's lifts, with a picture of a weight in place of words. */
function scoreboard() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const group = solid([
    { geometry: roundedBox(1.7, 0.95, 0.1, 0.04), colour: '#2d6fb5', at: [0, 1.95, 0] },
    { geometry: new THREE.BoxGeometry(0.1, 1.6, 0.1), colour: '#f7f2e6', at: [-0.6, 0.8, 0] },
    { geometry: new THREE.BoxGeometry(0.1, 1.6, 0.1), colour: '#f7f2e6', at: [0.6, 0.8, 0] },
  ], INK, 0.018);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), new THREE.MeshBasicMaterial({ map: texture }));
  face.position.set(0, 1.95, 0.056);
  group.add(face);
  group.userData.show = (count) => {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#12304d';
    ctx.fillRect(0, 0, 256, 128);
    // A weight: a bar with a plate at each end.
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(26, 58, 84, 12);
    for (const x of [30, 44, 86, 100]) ctx.fillRect(x - 6, x === 30 || x === 100 ? 42 : 34, 12, x === 30 || x === 100 ? 44 : 60);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 76px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(count), 184, 68);
    texture.needsUpdate = true;
  };
  group.userData.show(0);
  return group;
}

function buildPlace(scene) {
  scene.background = skyTexture();
  const ground = new THREE.Mesh(new THREE.CircleGeometry(80, 48).rotateX(-Math.PI / 2), paint('#79cf72'));
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);
  // The square the yard is in, and the platform a lifter stands on.
  const square = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 7.4, 0.04, 64), paint('#f0dfb8'));
  square.receiveShadow = true;
  scene.add(square);
  const edge = new THREE.Mesh(new THREE.RingGeometry(7.1, 7.4, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#e2c88f' }));
  edge.position.y = 0.025;
  scene.add(edge);
  const mat = new THREE.Mesh(roundedBox(2.5, 0.08, 1.9, 0.03), paint('#3c4a57'));
  mat.position.set(LIFTER_AT[0], 0.02, 0.15);
  mat.receiveShadow = true;
  const boards = new THREE.Mesh(roundedBox(1.7, 0.08, 1.7, 0.03), paint('#d9a55b'));
  boards.position.set(LIFTER_AT[0], 0.05, 0.15);
  boards.receiveShadow = true;
  scene.add(mat, boards);

  const greens = ['#65c26a', '#58b868', '#74cc78', '#50ad65'];
  for (let i = 0; i < 12; i += 1) {
    const angle = Math.PI * (0.08 + (i / 11) * 0.84);
    const hill = new THREE.Mesh(new THREE.SphereGeometry(10 + (i % 4) * 4, 24, 14), paint(greens[i % 4]));
    hill.scale.y = 0.3;
    hill.position.set(Math.cos(angle) * (34 + (i % 3) * 6), 0, -Math.sin(angle) * (34 + (i % 3) * 6));
    scene.add(hill);
  }
  const houses = [[-9.5, -11, '#ffe9a8', '#e2513f', 0.5], [-4.2, -13.5, '#ffd0c2', '#4b78b5', 0.1], [2.2, -14, '#fff3c9', '#e2513f', -0.1], [8.2, -12, '#d6ecff', '#c9772a', -0.45]];
  for (const [x, z, colour, roof, turn] of houses) {
    const one = house(colour, roof);
    one.position.set(x, 0, z);
    one.rotation.y = turn;
    scene.add(one);
  }
  const trees = [[-12.5, -7, '#5fb954', 1.2], [-6.8, -10.5, '#6cc25e', 1], [-0.9, -11.5, '#54ad50', 1.1], [5.4, -10.8, '#6cc25e', 0.95], [11, -8.5, '#5fb954', 1.15], [-6.2, -3.8, '#54ad50', 0.8], [7.6, -4.6, '#5fb954', 0.85]];
  for (const [x, z, colour, size] of trees) {
    const one = tree(colour);
    one.position.set(x, 0, z);
    one.scale.setScalar(size);
    scene.add(one);
  }

  // Poles and bunting along the back of the square.
  const flagColours = ['#ff5a4f', '#ffd23f', '#27c96b', '#3b82f6', '#a855f7', '#ff7eb6'];
  const flagShape = new THREE.Shape();
  flagShape.moveTo(-0.17, 0);
  flagShape.lineTo(0.17, 0);
  flagShape.lineTo(0, -0.34);
  flagShape.closePath();
  const flag = new THREE.ShapeGeometry(flagShape);
  const poles = [-6.4, -3.2, 0, 3.2, 6.4].map((x) => new THREE.Vector3(x, 4.1, -5.2 + Math.abs(x) * 0.22));
  for (const top of poles) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, top.y, 10), paint('#f7f2e6'));
    pole.position.set(top.x, top.y / 2, top.z);
    scene.add(pole);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), paint('#ff5a4f'));
    knob.position.copy(top);
    scene.add(knob);
  }
  for (let i = 0; i + 1 < poles.length; i += 1) {
    for (let j = 0; j < 9; j += 1) {
      const along = (j + 0.5) / 9;
      const point = poles[i].clone().lerp(poles[i + 1], along);
      point.y -= 0.12 + Math.sin(along * Math.PI) * 0.4;
      const mesh = new THREE.Mesh(flag, new THREE.MeshBasicMaterial({ color: flagColours[(i + j) % flagColours.length], side: THREE.DoubleSide }));
      mesh.position.copy(point);
      scene.add(mesh);
    }
  }

  const cloudMaterial = new THREE.SpriteMaterial({ map: spriteTexture(SHAPES.puff, 128), color: '#ffffff', opacity: 0.92, transparent: true, depthWrite: false });
  for (let i = 0; i < 7; i += 1) {
    const cloud = new THREE.Sprite(cloudMaterial);
    const size = 5 + (i % 3) * 2.5;
    cloud.scale.set(size * 1.6, size * 0.8, 1);
    cloud.position.set(-30 + i * 10, 12 + (i % 3) * 3, -34 - (i % 2) * 6);
    scene.add(cloud);
  }
}

/* ------------------------------- a lifter ------------------------------- */

const PLATE_COLOURS = ['#27c96b', '#3b82f6', '#ffd23f', '#e2513f'];

/** How big the plates are at a level, and their colour: bigger as the levels go up. */
const plateFor = (level) => ({ radius: 0.13 + ((level - 1) / 9) * 0.11, colour: PLATE_COLOURS[Math.min(3, Math.floor((level - 1) / 3))] });

/** A weight to hold: a short one for one hand, or a bar for two, with plates that grow with the level. */
function buildWeight(both, level) {
  const { radius, colour } = plateFor(level);
  const half = both ? 0.86 : 0.24;
  const parts = [{ geometry: new THREE.CylinderGeometry(0.03, 0.03, half * 2 + 0.16, 10).rotateZ(Math.PI / 2), colour: '#c7ced6' }];
  for (const x of [-half, half]) {
    parts.push({ geometry: disc(radius, 0.075).rotateZ(Math.PI / 2), colour, at: [x, 0, 0] });
    parts.push({ geometry: disc(radius * 0.72, 0.06).rotateZ(Math.PI / 2), colour: '#12304d', at: [x + Math.sign(x) * 0.07, 0, 0] });
  }
  return solid(parts, '#12304d', 0.012);
}

/** Where a hand is, in arm lengths from its shoulder, for an arm this far up: for a body the camera can't see. */
function armAt(lift, sign) {
  const angle = clamp(lift, 0, 1.75) * 1.75;
  return { x: sign * (0.42 - 0.12 * Math.sin(angle)), y: -0.86 * Math.cos(angle), z: 0.12 + 0.5 * Math.sin(angle) };
}

/**
 * A character holding a weight: the child's, which copies their body as a mirror would, or a friend's, which
 * copies theirs. hands is which of the child's hands hold it, 'left' or 'right' or both.
 */
class Lifter {
  constructor(spec, scene) {
    this.spec = spec;
    this.scene = scene;
    this.body = new Fighter3D(spec);
    this.body.setExpression('happy');
    this.pose = makePose();
    this.target = makePose();
    this.time = Math.random() * 10;
    this.live = null;
    this.lift = 0;
    this.each = { left: 0, right: 0 };
    this.hands = ['right'];
    this.level = 1;
    this.presenting = true;
    this.won = false;
    this.shaking = false;
    this.weight = null;
    this.rope = new Rope(scene);
    this.rope.mesh.visible = false;
    this.grip = new THREE.Vector3();
    this.palms = { L: new THREE.Vector3(), R: new THREE.Vector3() };
    scene.add(this.body.root);
  }

  /** Which hands hold the weight, and how big its plates are. */
  setWeight(hands, level) {
    const changed = hands.join() !== this.hands.join() || level !== this.level || !this.weight;
    this.hands = hands;
    this.level = level;
    if (!changed) return;
    this.dropWeight();
    this.weight = buildWeight(hands.length === 2, level);
    this.scene.add(this.weight);
  }

  dropWeight() {
    if (!this.weight) return;
    this.scene.remove(this.weight);
    this.weight.traverse((node) => {
      node.geometry?.dispose();
      node.material?.dispose?.();
    });
    this.weight = null;
  }

  update(dt, reducedMotion) {
    this.time += dt;
    const { target, pose, live } = this;
    Object.assign(target, makePose());
    const bob = reducedMotion ? 0 : Math.sin(this.time * 3.2);
    Object.assign(target, { hipDrop: 0.04 + bob * 0.02, handLY: -0.76 + bob * 0.02, handRY: -0.76 + bob * 0.02, handLZ: 0.16, handRZ: 0.16 });

    // The child's right hand is the character's left, which is on the right of the screen, as in a mirror.
    const holds = { L: this.hands.includes('right'), R: this.hands.includes('left') };
    if (this.won) {
      const hop = reducedMotion ? 0 : Math.abs(Math.sin(this.time * 4.6));
      Object.assign(target, { up: hop * 0.32, squash: hop < 0.14 ? 0.07 : -0.03, headPitch: -0.2, handLX: 0.36, handLY: 0.92, handLZ: 0.1, handRX: -0.36, handRY: 0.92, handRZ: 0.1, footLX: 0.22, footRX: -0.22 });
    } else if (this.presenting) {
      // Waving to the child, while they choose.
      Object.assign(target, { handRX: -0.46 + (reducedMotion ? 0 : Math.sin(this.time * 7) * 0.22), handRY: 0.84, handRZ: 0.2, wristR: 0.12 });
    } else if (live) {
      Object.assign(target, {
        handLX: -live.handRX, handLY: live.handRY, handLZ: live.handRZ,
        handRX: -live.handLX, handRY: live.handLY, handRZ: live.handLZ,
        wristL: live.wristR, wristR: live.wristL,
        hipDrop: Math.max(target.hipDrop, live.hipDrop), pitch: live.pitch * 0.6, roll: -live.roll * 0.6,
      });
    } else {
      // Nobody to copy: the arms that lift are as far up as the rules say.
      for (const [key, sign, side] of [['L', 1, 'right'], ['R', -1, 'left']]) {
        if (!holds[key]) continue;
        const at = armAt(this.each[side], sign);
        Object.assign(target, { [`hand${key}X`]: at.x, [`hand${key}Y`]: at.y, [`hand${key}Z`]: at.z });
      }
    }
    if (!this.presenting && !this.won) {
      // Fingers round the weight.
      if (holds.L) target.openL = 0.25;
      if (holds.R) target.openR = 0.25;
      // A shake of the arms between rescues, while they're down.
      if (this.shaking && !reducedMotion) {
        const shake = Math.sin(this.time * 26) * 0.035;
        if (target.handLY < -0.4) target.handLX += shake;
        if (target.handRY < -0.4) target.handRX -= shake;
      }
    }
    mixPose(pose, pose, target, 1 - Math.exp(-dt * 16));
    this.body.setPose(pose);
    this.body.update(dt);
    this.placeWeight();
  }

  /** The weight goes in the hand, or between the two, and the rope from it to the ring at the lifter's feet. */
  placeWeight() {
    const { body, weight, palms } = this;
    const showing = Boolean(weight) && !this.presenting && !this.won;
    if (weight) weight.visible = showing;
    this.rope.mesh.visible = showing && this.roped;
    if (!showing) return;
    body.root.updateMatrixWorld(true);
    body.palmL.getWorldPosition(palms.L);
    body.palmR.getWorldPosition(palms.R);
    const holds = this.hands.map((side) => (side === 'right' ? palms.L : palms.R));
    if (holds.length === 2) {
      this.grip.copy(holds[0]).add(holds[1]).multiplyScalar(0.5);
      const across = scratch.a.subVectors(palms.L, palms.R);
      weight.rotation.set(0, Math.atan2(-across.z, across.x), Math.atan2(across.y, Math.hypot(across.x, across.z)), 'YZX');
    } else {
      this.grip.copy(holds[0]);
      weight.rotation.set(0, this.body.root.rotation.y, 0);
    }
    this.grip.y -= 0.07 * body.root.scale.y;
    weight.position.copy(this.grip);
    if (this.roped) this.rope.between(this.grip, this.ringAt ?? RING_AT);
  }

  dispose() {
    this.dropWeight();
    this.scene.remove(this.body.root, this.rope.mesh);
    this.body.dispose();
    this.rope.mesh.geometry.dispose();
    this.rope.mesh.material.dispose();
  }
}

/* ------------------------------- the world ------------------------------- */

const zTexture = () => spriteTexture((ctx) => {
  ctx.font = '700 84px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('z', 0, 0);
}, 96);

const beeTexture = () => spriteTexture((ctx) => {
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.ellipse(0, 0, 34, 24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2c1a0f';
  ctx.fillRect(-12, -22, 9, 44);
  ctx.fillRect(8, -20, 9, 40);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(-4, -30, 16, 12, -0.4, 0, Math.PI * 2);
  ctx.fill();
}, 96);

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#a7c7a0', 1.55));
    const sun = new THREE.DirectionalLight('#fff3dc', 2.3);
    sun.position.set(-4, 11, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
    sun.shadow.radius = 4;
    this.scene.add(sun);
    buildPlace(this.scene);

    this.crane = buildCrane();
    this.scene.add(this.crane);
    this.sign = scoreboard();
    this.sign.position.set(-0.15, 0, -3.3);
    this.scene.add(this.sign);
    this.buildTape();
    this.groundRope = new Rope(this.scene);
    this.groundRope.between(RING_AT, new THREE.Vector3(POST_AT[0], 0.3, POST_AT[2] + 0.14));
    const eye = new THREE.Mesh(ring(0.09, 0.025).rotateX(Math.PI / 2), paint('#4b5563'));
    eye.position.copy(RING_AT);
    this.scene.add(eye);
    this.hangRope = new Rope(this.scene);
    this.hookTop = new THREE.Vector3(HOOK.x, ARM_HEIGHT - 0.1, HOOK.z);
    this.hookAt = new THREE.Vector3(HOOK.x, 1.6, HOOK.z);
    this.hook = hookBlock();
    this.scene.add(this.hook);

    this.sparks = new Sparks(this.scene);
    this.camera = new THREE.PerspectiveCamera(VIEWS.choose.fov, 1, 0.1, 200);
    this.cameraAt = new THREE.Vector3(...VIEWS.choose.at);
    this.cameraLook = new THREE.Vector3(...VIEWS.choose.look);
    this.view = 'choose';
    this.time = 0;
    this.frames = 0;
    this.slowFrames = 0;
    this.quality = 2;

    this.lifter = null;
    this.mates = [];
    this.beside = false; // Whether several are lifting side by side in front of one camera: see setMates.
    this.game = null;
    this.thing = null; // What's on the hook: { model, top, inner, reach, kind }.
    this.thingY = 0;
    this.thingSize = 0;
    this.leaving = []; // Things on their way out, shrinking.
    this.friend = null; // Whoever is under it: { body, size, pose, out, hop, gone }.
    this.friends = new Map(); // Characters made so far, by id, to use again.
    this.runners = []; // Friends who are free, on their way off.
    this.ducks = null;
    this.buildExtras();

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** The tape a thing has to be lifted over, between two poles behind it. */
  buildTape() {
    const poles = solid([
      { geometry: new THREE.CylinderGeometry(0.04, 0.05, LINE_HEIGHT + 0.14, 10), colour: '#f7f2e6', at: [HOOK.x - 1.22, (LINE_HEIGHT + 0.14) / 2, HOOK.z - 0.55] },
      { geometry: new THREE.CylinderGeometry(0.04, 0.05, LINE_HEIGHT + 0.14, 10), colour: '#f7f2e6', at: [HOOK.x + 1.22, (LINE_HEIGHT + 0.14) / 2, HOOK.z - 0.55] },
      { geometry: ball(0.075), colour: '#27c96b', at: [HOOK.x - 1.22, LINE_HEIGHT + 0.16, HOOK.z - 0.55] },
      { geometry: ball(0.075), colour: '#27c96b', at: [HOOK.x + 1.22, LINE_HEIGHT + 0.16, HOOK.z - 0.55] },
    ], INK, 0.012);
    this.tape = new THREE.Mesh(new THREE.BoxGeometry(2.44, 0.07, 0.02), new THREE.MeshBasicMaterial({ color: '#27c96b' }));
    this.tape.position.set(HOOK.x, LINE_HEIGHT, HOOK.z - 0.55);
    this.tapeMix = 0;
    this.linePieces = new THREE.Group();
    this.linePieces.add(poles, this.tape);
    this.scene.add(this.linePieces);
  }

  /** What the levels bring, each made once and shown when it's wanted. */
  buildExtras() {
    const { scene } = this;
    const goldStar = star(0.24, 0.11, 0.08).translate(0, 0, -0.04);
    this.star = new THREE.Group();
    this.star.add(new THREE.Mesh(goldStar, paint('#ffd23f')), new THREE.Mesh(goldStar, outlineMaterial('#8a5a00', 0.014)));
    this.star.visible = false;
    this.starSize = 0;
    scene.add(this.star);

    this.owl = owl();
    this.owl.visible = false;
    this.owlAway = 0;
    scene.add(this.owl);
    const zMaterial = () => new THREE.SpriteMaterial({ map: this.zMap ??= zTexture(), color: '#ffffff', transparent: true, depthWrite: false });
    this.zs = [0, 1, 2].map(() => {
      const z = new THREE.Sprite(zMaterial());
      z.visible = false;
      scene.add(z);
      return z;
    });

    this.hive = hive();
    this.hive.visible = false;
    scene.add(this.hive);
    this.pot = honeyPot();
    this.pot.visible = false;
    scene.add(this.pot);
    const beeMap = beeTexture();
    this.bees = [0, 1, 2, 3, 4].map((index) => {
      const bee = new THREE.Sprite(new THREE.SpriteMaterial({ map: beeMap, transparent: true, depthWrite: false }));
      bee.scale.setScalar(0.11);
      bee.visible = false;
      bee.userData = { turn: (index / 5) * Math.PI * 2, wide: 0.3 };
      scene.add(bee);
      return bee;
    });

    this.balloons = balloons();
    this.balloons.visible = false;
    this.balloonSize = 0;
    scene.add(this.balloons);

    this.trophy = trophy();
    this.trophy.visible = false;
    this.trophyUp = 0;
    scene.add(this.trophy);

    this.helper = null; // The friend who's stayed to help: { body, pose }.
    this.jack = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1, 12).translate(0, 0.5, 0), paint('#e2513f'));
    this.jack.position.set(HOOK.x + 1, 0, HOOK.z + 0.25);
    this.jack.visible = false;
    this.jackHeight = 0;
    scene.add(this.jack);
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  setView(name, { snap = false } = {}) {
    this.view = name;
    if (!snap) return;
    const view = this.viewNow;
    this.cameraAt.set(...view.at);
    this.cameraLook.set(...view.look);
    this.camera.fov = view.fov;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Where the camera is going. The warm-up has a view of its own when several stand side by side, and so has a game
   * with three or four. A picture taller than it's wide has its own, further back.
   */
  get viewNow() {
    if (this.beside && this.view === 'warmup') return VIEWS.warmupBeside;
    if (this.beside && this.view === 'play' && this.mates.length >= 2) return VIEWS.playBeside;
    return (this.camera.aspect < 1 && NARROW_VIEWS[this.view]) || VIEWS[this.view];
  }

  /** Where a place in the yard is on the screen, in pixels, and whether it's behind the camera. */
  project(x, y, z) {
    const at = scratch.b.set(x, y, z).project(this.camera);
    return { x: ((at.x + 1) / 2) * window.innerWidth, y: ((1 - at.y) / 2) * window.innerHeight, behind: at.z > 1 };
  }

  /* ---------- who's lifting ---------- */

  setLifter(spec) {
    const before = this.lifter;
    this.lifter?.dispose();
    this.lifter = new Lifter(spec, this.scene);
    this.lifter.body.root.position.set(...LIFTER_AT);
    this.lifter.body.faceTowards(LIFTER_FACES);
    this.lifter.roped = true;
    if (before) {
      this.lifter.presenting = before.presenting;
      this.lifter.setWeight(before.hands, before.level);
    }
  }

  /** The child's body, for their character to copy, or null when the camera can't see it. */
  setLive(pose) {
    if (this.lifter) this.lifter.live = pose;
  }

  /** How far up the child's arms are, for a character with no body to copy. */
  setLift(lift, each) {
    if (!this.lifter) return;
    this.lifter.lift = lift;
    this.lifter.each = each;
  }

  /**
   * Friends' characters, each with a weight of their own, beside the child's. team has their ropes go to the same
   * ring. beside is for several lifting in front of one camera: the child's own lifter is the first of them, and
   * they all stand left to right, as they do in front of it. inOrder stands them so without that, for friends whose
   * own games follow them: two on one screen in one picture (core/one-picture.js). Otherwise the child's lifter is
   * where it always is.
   */
  setMates(specs, { hands = ['right'], level = 1, team = false, beside = false, inOrder = beside } = {}) {
    for (const mate of this.mates) mate.dispose();
    this.mates = specs.map((spec) => {
      const mate = new Lifter(spec, this.scene);
      mate.body.faceTowards(LIFTER_FACES);
      mate.presenting = false;
      mate.roped = team;
      mate.setWeight(hands, level);
      return mate;
    });
    this.team = team && specs.length > 0;
    this.beside = beside && specs.length > 0;
    const places = inOrder && specs.length > 0
      ? BESIDE[Math.min(4, specs.length + 1)]
      : [[...HOME, 1], ...specs.map((_, index) => [...MATE_SLOTS[index % MATE_SLOTS.length], MATE_SIZE])];
    [this.lifter, ...this.mates].forEach((lifter, index) => {
      if (!lifter) return;
      const [x, z, size] = places[index % places.length];
      lifter.body.root.position.set(x, 0, z);
      lifter.body.root.scale.setScalar(size);
    });
  }

  /** What each friend is doing: { lift, live }, or null for one who has gone. */
  placeMates(list) {
    this.mates.forEach((mate, index) => {
      const now = list[index];
      mate.body.root.visible = Boolean(now);
      if (mate.weight) mate.weight.visible = Boolean(now);
      if (!now) {
        mate.rope.mesh.visible = false;
        mate.gone = true;
        return;
      }
      mate.gone = false;
      mate.live = now.live ?? null;
      mate.lift = now.lift ?? 0;
      mate.each = { left: mate.lift, right: mate.lift };
    });
  }

  /* ---------- a game ---------- */

  /** The rules to draw from, or null for none. */
  setGame(game) {
    this.game = game;
    this.clearThing();
    this.clearFriend();
    for (const runner of this.runners) this.scene.remove(runner.body.root);
    this.runners = [];
    for (const piece of [this.star, this.owl, this.hive, this.pot, this.balloons, this.trophy, this.jack, ...this.zs, ...this.bees]) piece.visible = false;
    this.trophyUp = 0;
    this.balloonSize = 0;
    this.setHelper(null);
    if (this.lifter) this.lifter.won = false;
  }

  clearThing() {
    if (this.thing) this.leaving.push({ model: this.thing.model, size: this.thingSize });
    this.thing = null;
  }

  clearFriend() {
    if (this.friend) this.scene.remove(this.friend.body.root);
    this.friend = null;
    if (this.ducks) {
      this.scene.remove(this.ducks.mother, ...this.ducks.little);
      this.ducks = null;
    }
  }

  /** A character to be a friend in need, made once and used again. */
  friendBody(id) {
    if (!this.friends.has(id)) {
      const spec = characterById(id);
      const body = new Fighter3D(spec);
      // Small enough to crouch under a basket, however long its neck.
      const tall = 1.95 + spec.build.neck;
      this.friends.set(id, { body, size: Math.min(FRIEND_SIZE, FRIEND_MOST / tall) });
    }
    return this.friends.get(id);
  }

  /** The next friend in need, and what's on them, come in. One that's already there, as the first is from the countdown, stays. */
  arrive(rescue) {
    if (this.thing?.rescue === rescue) return;
    this.clearThing();
    this.clearFriend();
    const build = THINGS[rescue.kind]();
    this.thing = { ...build, kind: rescue.kind, rescue };
    this.thingSize = 0;
    this.thingY = 0;
    const size = this.team ? TEAM_SIZE : 1;
    this.thing.scale = size;
    this.thing.model.position.set(HOOK.x, 0, HOOK.z);
    this.thing.model.scale.setScalar(0.001);
    this.scene.add(this.thing.model);

    if (rescue.friend === 'ducks') {
      const mother = motherDuck();
      mother.position.set(...MOTHER_AT);
      mother.rotation.y = 0.5;
      const little = [0, 1, 2].map(() => {
        const one = duckling();
        one.position.set(HOOK.x, 0, HOOK.z);
        one.visible = false;
        this.scene.add(one);
        return one;
      });
      this.scene.add(mother);
      this.ducks = { mother, little, out: [0, 0, 0] };
    } else {
      const { body, size: friendSize } = this.friendBody(rescue.friend);
      body.root.scale.setScalar(friendSize * (this.team ? 1.1 : 1));
      body.root.position.set(HOOK.x, 0, HOOK.z);
      body.setExpression('ready');
      this.scene.add(body.root);
      this.friend = { id: rescue.friend, body, pose: makePose(), target: makePose(), out: 0, free: false, time: 0, joy: 0 };
    }
    this.owl.visible = rescue.owl;
    this.owlAway = 0;
    this.owl.userData.asleep.visible = true;
    this.owl.userData.awake.visible = false;
    this.hive.visible = rescue.hive;
    this.pot.visible = rescue.hive;
    this.star.visible = rescue.star;
    this.starSize = 0;
    this.jack.visible = rescue.lifts > 1;
    this.jackHeight = 0;
    this.trophy.visible = false;
    this.trophyUp = 0;
    this.puff(HOOK.x, 0.2, HOOK.z + 0.6, 5);
  }

  /** The friend is out: a little burst, and a jump for joy before they run off. */
  freed() {
    const [x, , z] = EXIT_AT;
    this.burst(x, 1, z, ['#ffd23f', '#ff8f3f', '#7dff9f'], 12);
    if (this.friend) {
      this.friend.free = true;
      this.friend.body.setExpression('happy');
    }
    this.lifter?.body.setExpression('happy', 1.6);
    if (this.beside) for (const mate of this.mates) mate.body.setExpression('happy', 1.6);
  }

  /** A star taken: it bursts into little ones. */
  starTaken() {
    this.burst(this.star.position.x, this.star.position.y, this.star.position.z, ['#ffd23f', '#fff3b0'], 9);
    this.star.visible = false;
  }

  /** The weight is back on the ground: a puff of dust if it came down hard. */
  setDown(gentle) {
    if (!gentle) this.puff(HOOK.x, 0.15, HOOK.z + 0.5, 6);
  }

  /** The owl, woken by a bump, flies off. */
  owlWoke() {
    this.owl.userData.asleep.visible = false;
    this.owl.userData.awake.visible = true;
    this.owlAway = 0.001;
  }

  /** A feather, or honey: a few small shapes float up from where it was. */
  prize(from, colours, shape = 'star') {
    this.burst(from.x, from.y + 0.2, from.z, colours, 7, shape);
  }

  notch() {
    this.burst(this.jack.position.x, this.jackHeight + 0.1, this.jack.position.z, ['#ffd23f', '#ffffff'], 5, 'spark');
  }

  /** The friend who stays to help with the next rescue, or null when they've done so. */
  setHelper(id) {
    if (this.helper) this.scene.remove(this.helper.body.root);
    this.helper = null;
    if (!id) return;
    const spec = characterById(id);
    const body = new Fighter3D(spec);
    body.root.scale.setScalar(Math.min(FRIEND_SIZE, FRIEND_MOST / (1.95 + spec.build.neck)) * 1.15);
    body.root.position.set(...HELPER_AT);
    body.faceTowards(-0.9);
    body.setExpression('happy');
    this.scene.add(body.root);
    this.helper = { body, pose: makePose(), time: 0 };
  }

  showTrophy() {
    this.trophy.visible = true;
    this.trophyUp = 0.001;
  }

  /** Everyone's free: the lifter puts the weight down and jumps for joy, and so do those lifting beside it at one camera. */
  celebrate() {
    if (this.lifter) this.lifter.won = true;
    if (this.beside) for (const mate of this.mates) mate.won = true;
    this.setView('win');
    const [x, , z] = LIFTER_AT;
    this.burst(x, 2.2, z + 0.4, ['#ffd23f', '#ff5a4f', '#3b82f6', '#27c96b'], 16);
  }

  setLiftsToday(count) {
    this.sign.userData.show(count);
  }

  burst(x, y, z, colours, count, shape = 'star') {
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      this.sparks.emit({ shape, colour: colours[i % colours.length], at: { x, y, z }, velocity: [Math.cos(angle) * 1.6, 1.2 + Math.sin(angle) * 1.2, 0.4], life: 0.6, size: 0.2, gravity: 2.2, spin: 3, drag: 0.8 });
    }
  }

  puff(x, y, z, count) {
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      this.sparks.emit({ shape: 'puff', colour: '#f3e7cf', at: { x: x + Math.cos(angle) * 0.5, y, z: z + Math.sin(angle) * 0.2 }, velocity: [Math.cos(angle) * 0.9, 0.5, 0.1], life: 0.55, size: 0.22, grow: 0.5, drag: 2, opacity: 0.7 });
    }
  }

  /* ---------- every frame ---------- */

  /** A slow computer gives up sharpness and then shadows, so that lifting still feels immediate. */
  watchSpeed(dt) {
    this.frames += 1;
    if (dt > 1 / 40) this.slowFrames += 1;
    if (this.frames < 90) return;
    const slow = this.slowFrames > this.frames * 0.5;
    this.frames = 0;
    this.slowFrames = 0;
    if (!slow || this.quality === 0) return;
    this.quality -= 1;
    if (this.quality === 1) {
      this.renderer.setPixelRatio(1);
      this.resize();
    } else {
      this.renderer.shadowMap.enabled = false;
      this.scene.traverse((node) => {
        if (node.material) node.material.needsUpdate = true;
      });
    }
  }

  update(dt) {
    this.time += dt;
    this.watchSpeed(dt);
    const { game, lifter } = this;
    const playing = Boolean(game) && this.view !== 'choose' && this.view !== 'warmup';
    this.crane.visible = true;
    if (lifter) {
      lifter.shaking = game?.phase === 'resting';
      lifter.update(dt, this.reducedMotion);
    }
    for (const mate of this.mates) {
      if (mate.gone) continue;
      mate.shaking = this.beside && game?.phase === 'resting';
      mate.update(dt, this.reducedMotion);
    }
    this.updateThing(dt, playing);
    this.updateFriend(dt);
    this.updateDucks(dt);
    this.updateRunners(dt);
    this.updateExtras(dt);
    this.updateHelper(dt);
    this.sparks.update(dt);
    this.updateCamera(dt);
  }

  /** The thing on the hook goes as high as the rules say, and the rope and the tape go with it. */
  updateThing(dt, playing) {
    const { game, thing } = this;
    this.leaving = this.leaving.filter((old) => {
      old.size = damp(old.size, 0, 9, dt);
      old.model.scale.setScalar(Math.max(0.001, old.size));
      if (old.size > 0.03) return true;
      this.scene.remove(old.model);
      old.model.traverse((node) => {
        node.geometry?.dispose();
        node.material?.dispose?.();
      });
      return false;
    });
    this.linePieces.visible = playing;
    let hookY = HOOK_WAITS;
    if (thing && game) {
      const resting = game.phase === 'resting' || game.state === 'finished';
      this.thingSize = damp(this.thingSize, resting ? 0 : thing.scale, resting ? 7 : 9, dt);
      this.thingY = damp(this.thingY, game.thingHeight * LINE_HEIGHT, 22, dt);
      thing.model.scale.setScalar(Math.max(0.001, this.thingSize));
      thing.model.position.y = this.thingY;
      // A little sway on the rope, more with a shaking arm, unless that's not wanted.
      const sway = this.reducedMotion ? 0 : clamp(game.wobble * 0.02, 0, 0.05) * Math.sin(this.time * 9);
      thing.model.rotation.z = this.thingY > 0.02 ? sway : 0;
      hookY = HOOK_WAITS + (this.thingY + thing.top * thing.scale + 0.12 - HOOK_WAITS) * clamp(this.thingSize / thing.scale, 0, 1);
    }
    this.hookAt.set(HOOK.x, hookY, HOOK.z);
    this.hook.position.copy(this.hookAt);
    this.hangRope.between(this.hookAt, this.hookTop);
    // The tape is a brighter green while the thing is over it.
    this.tapeMix = damp(this.tapeMix, game?.up ? 1 : 0, 8, dt);
    this.tape.material.color.setRGB(0.153 + this.tapeMix * 0.2, 0.788 + this.tapeMix * 0.15, 0.42 + this.tapeMix * 0.1);
    // A rock stays up on its jack, a notch at a time.
    if (this.jack.visible && game && thing) {
      this.jackHeight = damp(this.jackHeight, clamp(game.pulls / thing.rescue.lifts, 0, 1) * LINE_HEIGHT + 0.25, 10, dt);
      this.jack.scale.y = this.jackHeight;
    }
  }

  /** Whoever is under it: crouched while it's down, standing as it rises, and scrambling out while it's held up. */
  updateFriend(dt) {
    const { friend, game, thing } = this;
    if (!friend || !game || !thing) return;
    friend.time += dt;
    const { body, pose, target } = friend;
    // Out while it's held up, as far as they've got, and back under in a hurry if it comes down early.
    const wanted = friend.free ? 1 : game.freeing ? game.out : 0;
    friend.out = damp(friend.out, wanted, wanted > friend.out ? 6 : 10, dt);
    const [ex, , ez] = EXIT_AT;
    const x = HOOK.x + (ex - HOOK.x) * friend.out;
    const z = HOOK.z + (ez - HOOK.z) * friend.out;
    body.root.position.set(x, 0, z);
    const size = body.root.scale.y;
    body.root.visible = this.thingSize > 0.5 || friend.free;
    // There's room to stand once the thing is clear of their head.
    const room = (this.thingY + thing.inner * this.thingSize) / size;
    const under = friend.out < 0.45;
    const tall = 1.95 + body.spec.build.neck;
    const low = 0.24 * (1 - clamp(this.thingY / 0.55, 0, 1));
    const crouch = under ? Math.max(low, clamp((tall - room) / 0.9, 0, 0.34)) : 0;
    const moving = Math.abs(wanted - friend.out) > 0.02;
    const step = moving && !this.reducedMotion ? Math.sin(friend.time * 16) : 0;
    Object.assign(target, makePose());
    Object.assign(target, {
      hipDrop: 0.03 + crouch,
      pitch: crouch * 0.5,
      headPitch: under ? -0.25 : 0,
      handLX: 0.4, handLY: under ? -0.3 : -0.7, handLZ: 0.4,
      handRX: -0.4, handRY: under ? -0.3 : -0.7, handRZ: 0.4,
      footLZ: step * 0.2, footRZ: -step * 0.2, footLY: Math.max(0, step) * 0.12, footRY: Math.max(0, -step) * 0.12,
    });
    if (friend.free) {
      friend.joy += dt;
      const hop = this.reducedMotion ? 0 : Math.abs(Math.sin(friend.joy * 9));
      Object.assign(target, { up: hop * 0.3, handLX: 0.4, handLY: 0.9, handLZ: 0.1, handRX: -0.4, handRY: 0.9, handRZ: 0.1, headPitch: -0.15 });
      // After a jump for joy, they run off, and the next one can come.
      if (friend.joy > 1.1 && friend.out > 0.97) {
        this.runners.push({ body, pose, time: 0 });
        this.friend = null;
        return;
      }
    }
    mixPose(pose, pose, target, 1 - Math.exp(-dt * 14));
    body.setPose(pose);
    body.update(dt);
    body.faceTowards(friend.free ? 0 : 0.2);
  }

  /** Ducklings waddle out to their mother one at a time, as far as the rules say each has got. */
  updateDucks(dt) {
    const { ducks, game, thing } = this;
    if (!ducks || !game || !thing) return;
    const bob = this.reducedMotion ? 0 : Math.sin(this.time * 7) * 0.03;
    ducks.mother.position.y = bob > 0 ? bob : 0;
    ducks.mother.visible = this.thingSize > 0.5 || game.phase !== 'arriving';
    // All three are out once the family is free, and none before the tub has been lifted.
    const done = game.phase === 'freed' || game.phase === 'resting' ? 3 : game.parts;
    ducks.little.forEach((one, index) => {
      // The one whose turn it is goes as far as the hold has got, and back under if the tub comes down.
      const share = game.freeing && index === done ? clamp(game.progress * 3 - index, 0, 1) : 0;
      const wanted = index < done ? 1 : share;
      ducks.out[index] = damp(ducks.out[index], wanted, wanted > ducks.out[index] ? 5 : 11, dt);
      const out = ducks.out[index];
      const spot = [MOTHER_AT[0] + 0.42 + index * 0.3, 0, MOTHER_AT[2] + 0.25 - index * 0.12];
      one.visible = out > 0.03 && this.thingSize > 0.5;
      one.position.set(HOOK.x + (spot[0] - HOOK.x) * out, 0, HOOK.z + (spot[2] - HOOK.z) * out);
      const waddle = out > 0.03 && out < 0.97 && !this.reducedMotion ? Math.sin(this.time * 18 + index) : 0;
      one.rotation.set(0, Math.atan2(spot[0] - HOOK.x, spot[2] - HOOK.z), waddle * 0.2);
      one.position.y = Math.abs(waddle) * 0.03;
    });
  }

  /** Friends who are free run off to the side, and are gone once they're out of the picture. */
  updateRunners(dt) {
    this.runners = this.runners.filter((runner) => {
      runner.time += dt;
      const { body, pose } = runner;
      const step = this.reducedMotion ? 0 : Math.sin(runner.time * 16);
      const target = { ...makePose(), pitch: 0.2, footLZ: step * 0.3, footRZ: -step * 0.3, footLY: Math.max(0, step) * 0.2, footRY: Math.max(0, -step) * 0.2, handLZ: -step * 0.4, handRZ: step * 0.4, handLY: -0.5, handRY: -0.5 };
      mixPose(pose, pose, target, 1 - Math.exp(-dt * 14));
      body.setPose(pose);
      body.update(dt);
      body.faceTowards(1.35);
      body.root.position.x += dt * 4.2;
      body.root.position.z -= dt * 0.9;
      if (body.root.position.x < 7.5) return true;
      this.scene.remove(body.root);
      return false;
    });
  }

  /** The star, the owl, the hive and its bees, the balloons and the trophy, each where it belongs on the thing. */
  updateExtras(dt) {
    const { game, thing } = this;
    if (!game || !thing) return;
    const { rescue } = thing;
    const top = this.thingY + thing.top * this.thingSize;
    const lid = this.thingY + (thing.top - 0.28) * this.thingSize;
    const shown = this.thingSize > 0.5;

    if (rescue.star) {
      const waiting = !game.starTaken && shown && game.phase !== 'resting';
      this.starSize = damp(this.starSize, waiting ? 1 : 0, 8, dt);
      this.star.visible = this.starSize > 0.04;
      this.star.scale.setScalar(Math.max(0.001, this.starSize));
      this.star.position.set(HOOK.x + 0.38, game.starAt * LINE_HEIGHT + thing.top + 0.36, HOOK.z);
      this.star.rotation.y = this.reducedMotion ? 0 : Math.sin(this.time * 1.6) * 0.5;
    }

    if (rescue.owl) {
      this.owl.visible = shown || this.owlAway > 0;
      if (this.owlAway > 0) {
        // Awake, it flies up and away, and isn't seen again.
        this.owlAway += dt;
        this.owl.position.x -= dt * 1.6;
        this.owl.position.y += dt * 2.2;
        this.owl.rotation.z = this.reducedMotion ? 0 : Math.sin(this.time * 20) * 0.25;
        if (this.owlAway > 2.2) this.owl.visible = false;
      } else {
        this.owl.position.set(HOOK.x - 0.3, lid, HOOK.z + 0.12);
        this.owl.rotation.z = 0;
        const breath = this.reducedMotion ? 1 : 1 + Math.sin(this.time * 2) * 0.03;
        this.owl.scale.set(1, breath, 1);
      }
      // Little z's drift up from an owl that's asleep.
      this.zs.forEach((z, index) => {
        const through = ((this.time * 0.45 + index / 3) % 1);
        z.visible = shown && this.owlAway === 0 && !this.reducedMotion && game.phase !== 'resting';
        z.position.set(this.owl.position.x + 0.2 + through * 0.25, this.owl.position.y + 0.4 + through * 0.5, this.owl.position.z);
        z.scale.setScalar(0.12 + through * 0.1);
        z.material.opacity = 0.9 * (1 - through);
      });
    } else {
      for (const z of this.zs) z.visible = false;
    }

    if (rescue.hive) {
      this.hive.visible = shown;
      this.pot.visible = shown;
      this.hive.position.set(HOOK.x - 0.26, lid, HOOK.z + 0.08);
      this.pot.position.set(HOOK.x + 0.22, lid, HOOK.z + 0.14);
      this.pot.userData.honey.scale.y = Math.max(0.02, game.honey);
      // The bees fly close when the arm is steady, and wide when it shakes.
      const wide = game.up && !game.steady ? 0.62 : 0.3;
      this.bees.forEach((bee, index) => {
        bee.userData.wide = damp(bee.userData.wide, wide, 4, dt);
        bee.userData.turn += dt * (this.reducedMotion ? 0.6 : 2.6 + index * 0.3);
        bee.visible = shown;
        bee.position.set(this.hive.position.x + Math.cos(bee.userData.turn) * bee.userData.wide, this.hive.position.y + 0.3 + Math.sin(bee.userData.turn * 1.7 + index) * 0.12, this.hive.position.z + Math.sin(bee.userData.turn) * bee.userData.wide * 0.5);
      });
    } else {
      this.hive.visible = false;
      this.pot.visible = false;
      for (const bee of this.bees) bee.visible = false;
    }

    // Balloons on the hook, for as long as they have something to make light.
    this.balloonSize = damp(this.balloonSize, game.balloons > 0 ? 1 : 0, 6, dt);
    this.balloons.visible = this.balloonSize > 0.04;
    this.balloons.scale.setScalar(Math.max(0.001, this.balloonSize));
    this.balloons.position.set(HOOK.x, top + 0.2, HOOK.z - 0.05);
    this.balloons.rotation.z = this.reducedMotion ? 0 : Math.sin(this.time * 1.4) * 0.08;

    if (this.trophyUp > 0) {
      this.trophyUp = Math.min(1, this.trophyUp + dt * 1.6);
      const [ex, , ez] = EXIT_AT;
      this.trophy.position.set(HOOK.x + (ex - 0.7 - HOOK.x) * this.trophyUp, 0.2 + Math.sin(this.trophyUp * Math.PI) * 0.9 + this.trophyUp * 0.5, HOOK.z + (ez - HOOK.z) * this.trophyUp);
      this.trophy.scale.setScalar(0.4 + this.trophyUp * 0.9);
      this.trophy.rotation.y += dt * (this.reducedMotion ? 0.4 : 1.6);
    }
  }

  /** The friend who stayed to help pulls on the rope along the ground. */
  updateHelper(dt) {
    const { helper, game } = this;
    if (!helper) return;
    helper.time += dt;
    const pulling = Boolean(game?.helping && game.up) && !this.reducedMotion;
    const heave = pulling ? Math.sin(helper.time * 9) : 0;
    const target = { ...makePose(), hipDrop: 0.1 + heave * 0.05, pitch: 0.25 + heave * 0.08, handLX: 0.2, handLY: -0.45, handLZ: 0.7, handRX: -0.2, handRY: -0.45, handRZ: 0.7, openL: 0.3, openR: 0.3 };
    mixPose(helper.pose, helper.pose, target, 1 - Math.exp(-dt * 12));
    helper.body.setPose(helper.pose);
    helper.body.update(dt);
  }

  updateCamera(dt) {
    const view = this.viewNow;
    const rate = 2.6;
    this.cameraAt.x = damp(this.cameraAt.x, view.at[0], rate, dt);
    this.cameraAt.y = damp(this.cameraAt.y, view.at[1], rate, dt);
    this.cameraAt.z = damp(this.cameraAt.z, view.at[2], rate, dt);
    this.cameraLook.x = damp(this.cameraLook.x, view.look[0], rate, dt);
    this.cameraLook.y = damp(this.cameraLook.y, view.look[1], rate, dt);
    this.cameraLook.z = damp(this.cameraLook.z, view.look[2], rate, dt);
    const fov = damp(this.camera.fov, view.fov, rate, dt);
    if (Math.abs(fov - this.camera.fov) > 0.001) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.copy(this.cameraAt);
    this.camera.lookAt(this.cameraLook);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
