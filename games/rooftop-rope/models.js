// What Rooftop Rope is made of, from simple shapes with no image files: the city, the rooftops the ropes are
// tied to, and what the levels put along a rope. Each stands at its own middle.
import * as THREE from '../../vendor/three/three.module.js';
import { ball, makePose, mergeParts, outlineMaterial, roundedBox, star, toon } from '../../core/body/characters.js';

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

const tube = (radius, length, sides = 10) => new THREE.CylinderGeometry(radius, radius, length, sides);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const QUARTER = Math.PI / 2;

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/* ------------------------------- the city ------------------------------- */

const WINDOW = { wide: 4, high: 3.6 }; // Metres of wall that one window and the wall round it take up.

/** One window in its bit of wall, to be repeated all over every building. */
function windowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#7fa3c7';
  ctx.fillRect(14, 12, 36, 34);
  ctx.fillStyle = '#a9c6e2';
  ctx.fillRect(14, 12, 36, 12);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

const WALLS = ['#f2d7b6', '#e9c6c0', '#cfe0ee', '#d9e6c8', '#f0e3b8', '#d8cfe8', '#e6d3c2'];

/**
 * Buildings, all in one mesh: each is { x, z, wide, deep, high, colour }, standing on the ground. Their walls
 * are covered in windows, the same size on every one, and their roofs are plain.
 */
export function buildBuildings(list) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const colours = [];
  const roofs = [];
  const tint = new THREE.Color();
  const face = (corners, normal, across, up, colour) => {
    const [a, b, c, d] = corners;
    for (const [point, u, v] of [[a, 0, 0], [b, across, 0], [c, across, up], [a, 0, 0], [c, across, up], [d, 0, up]]) {
      positions.push(...point);
      normals.push(...normal);
      uvs.push(u, v);
      colours.push(colour.r, colour.g, colour.b);
    }
  };
  for (const { x, z, wide, deep, high, colour } of list) {
    tint.set(colour);
    const [x0, x1, z0, z1] = [x - wide / 2, x + wide / 2, z - deep / 2, z + deep / 2];
    const [cols, rows, sides] = [Math.max(1, Math.round(wide / WINDOW.wide)), Math.max(1, Math.round(high / WINDOW.high)), Math.max(1, Math.round(deep / WINDOW.wide))];
    face([[x0, 0, z1], [x1, 0, z1], [x1, high, z1], [x0, high, z1]], [0, 0, 1], cols, rows, tint);
    face([[x1, 0, z0], [x0, 0, z0], [x0, high, z0], [x1, high, z0]], [0, 0, -1], cols, rows, tint);
    face([[x1, 0, z1], [x1, 0, z0], [x1, high, z0], [x1, high, z1]], [1, 0, 0], sides, rows, tint);
    face([[x0, 0, z0], [x0, 0, z1], [x0, high, z1], [x0, high, z0]], [-1, 0, 0], sides, rows, tint);
    roofs.push({ geometry: box(wide, 0.4, deep), colour: '#b9c0c7', at: [x, high + 0.2, z] });
  }
  const walls = new THREE.BufferGeometry();
  walls.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  walls.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  walls.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  walls.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  const group = new THREE.Group();
  group.add(new THREE.Mesh(walls, new THREE.MeshLambertMaterial({ map: windowTexture(), vertexColors: true })));
  group.add(new THREE.Mesh(mergeParts(roofs), new THREE.MeshLambertMaterial({ vertexColors: true })));
  return group;
}

/** The colour of a building's walls, the same every time for the same number. */
export const wallColour = (n) => WALLS[Math.abs(Math.round(n)) % WALLS.length];

/** What stands on a rooftop the ropes are tied to: a low wall, a landing mat, a post for the rope and a flag. */
export function buildRoofTop(wide, deep, colour = '#27c96b', { flag = true } = {}) {
  const parts = [
    { geometry: box(wide - 1.2, 0.08, deep - 1.2), colour, at: [0, 0.44, 0] },
    // Low walls down the sides only: the ropes come in at the back and go out at the front.
    { geometry: box(0.3, 0.7, deep), colour: '#d5dbe1', at: [wide / 2 - 0.15, 0.75, 0] },
    { geometry: box(0.3, 0.7, deep), colour: '#d5dbe1', at: [-wide / 2 + 0.15, 0.75, 0] },
    // Where the ropes are tied, front and back.
    { geometry: tube(0.1, 0.5), colour: '#8a5a2b', at: [0.5, 0.65, -deep / 2 + 0.4] },
    { geometry: tube(0.1, 0.5), colour: '#8a5a2b', at: [0.5, 0.65, deep / 2 - 0.4] },
  ];
  // A small flag at one corner, which is how a rooftop is told from far off. It's on the left, as the walker
  // is seen from a little to the right, and a flag on that side would go by right in front of the eye.
  if (flag) {
    parts.push(
      { geometry: tube(0.05, 2.4, 8), colour: '#f7f2e6', at: [-wide / 2 + 0.5, 1.6, -deep / 2 + 0.5] },
      { geometry: box(0.8, 0.5, 0.05), colour: '#e4572e', at: [-wide / 2 + 0.95, 2.5, -deep / 2 + 0.5] },
    );
  }
  return solid(parts, { outline: 0.03 });
}

/** The net under a rope: a wide strip of it, to drop into. */
export function buildNet(wide, long) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 5;
  ctx.strokeRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(wide / 0.9, long / 0.9);
  const group = new THREE.Group();
  const net = new THREE.Mesh(new THREE.PlaneGeometry(wide, long).rotateX(-QUARTER), new THREE.MeshBasicMaterial({ map: texture, transparent: true, color: '#fff7d6', side: THREE.DoubleSide, depthWrite: false }));
  const rim = solid([
    { geometry: tube(0.09, long, 8).rotateX(QUARTER), colour: '#e4572e', at: [wide / 2, 0, 0] },
    { geometry: tube(0.09, long, 8).rotateX(QUARTER), colour: '#e4572e', at: [-wide / 2, 0, 0] },
  ], { outline: 0 });
  group.add(net, rim);
  return group;
}

/* ------------------------------- what the levels bring ------------------------------- */

/** A gold star, hanging by the rope and turning. */
export function buildStar() {
  const geometry = star(0.34, 0.16, 0.1).translate(0, 0, -0.05);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, paint('#ffd23f')), new THREE.Mesh(geometry, outlineMaterial('#8a5a00', 0.018)));
  return group;
}

/** A balloon on a string, floating above the rope. */
export function buildBalloon(colour = '#e4572e') {
  return solid([
    { geometry: ball(0.34, 0.42, 0.34), colour, at: [0, 0, 0] },
    { geometry: new THREE.ConeGeometry(0.07, 0.1, 8), colour, at: [0, -0.45, 0] },
    { geometry: tube(0.012, 0.9, 5), colour: '#f7f2e6', at: [0, -0.95, 0] },
  ], { outline: 0.018 });
}

/** A little bird. Its wings are its own, to flap. */
export function buildBird() {
  const group = new THREE.Group();
  const body = solid([
    { geometry: ball(0.13, 0.12, 0.17), colour: '#4aa3df', at: [0, 0.12, 0] },
    { geometry: ball(0.09), colour: '#4aa3df', at: [0, 0.24, 0.1] },
    { geometry: new THREE.ConeGeometry(0.03, 0.09, 6).rotateX(QUARTER), colour: '#ffb02e', at: [0, 0.23, 0.2] },
    { geometry: ball(0.02), colour: '#1c2b3a', at: [0.05, 0.27, 0.15] },
    { geometry: ball(0.02), colour: '#1c2b3a', at: [-0.05, 0.27, 0.15] },
    { geometry: box(0.07, 0.02, 0.16), colour: '#2f7fb8', at: [0, 0.12, -0.2] },
  ], { outline: 0.012 });
  const wing = (sign) => {
    const made = solid([{ geometry: ball(0.13, 0.02, 0.08), colour: '#2f7fb8', at: [sign * 0.13, 0, 0] }], { outline: 0.01 });
    made.position.set(sign * 0.08, 0.16, 0);
    return made;
  };
  const wings = [wing(1), wing(-1)];
  group.add(body, ...wings);
  group.userData.wings = wings;
  return group;
}

/** A flag on the rope, where the other foot takes over. */
export function buildSwapFlag() {
  return solid([
    { geometry: tube(0.05, 2.2, 8), colour: '#f7f2e6', at: [0.5, 1.1, 0] },
    { geometry: box(0.9, 0.6, 0.04), colour: '#b06ad9', at: [0.98, 1.85, 0] },
    { geometry: box(0.5, 0.05, 0.3), colour: '#8a5a2b', at: [0.5, 0, 0] },
  ], { outline: 0.02 });
}

/** A crossing light on a pole beside the rope. Its two lamps are its own, to light one or the other. */
export function buildLight() {
  const group = solid([
    { geometry: tube(0.06, 2.6, 8), colour: '#6b7280', at: [0.9, 1.3, 0] },
    { geometry: roundedBox(0.5, 1.0, 0.3, 0.06), colour: '#2b2f36', at: [0.9, 2.5, 0] },
    { geometry: box(0.5, 0.05, 0.3), colour: '#8a5a2b', at: [0.5, 0, 0] },
  ], { outline: 0.02 });
  const lamp = (y, colour) => {
    const made = new THREE.Mesh(ball(0.15, 0.15, 0.08), new THREE.MeshBasicMaterial({ color: colour }));
    made.position.set(0.9, y, 0.16);
    group.add(made);
    return made;
  };
  group.userData.red = lamp(2.74, '#e4572e');
  group.userData.green = lamp(2.28, '#27c96b');
  return group;
}

/** A small platform on the long rope, to rest on. */
export function buildPost() {
  return solid([
    { geometry: tube(0.9, 0.16, 20), colour: '#27c96b', at: [0, -0.08, 0] },
    { geometry: tube(0.14, 14, 8), colour: '#9aa3ab', at: [0, -7.1, 0] },
    { geometry: new THREE.TorusGeometry(0.9, 0.05, 6, 20).rotateX(QUARTER), colour: '#f7f2e6', at: [0, 0, 0] },
  ], { outline: 0.025 });
}

export const WHEEL = { radius: 0.34, wide: 0.2, up: 0.8 }; // How big the wheel is, and how high over the rope the walker stands on it.

/**
 * The one wheel the walker rides along a rope, standing on it on one foot: a fat tyre with pale blocks round
 * its tread, which are what's seen of it turning from behind, a bright hub on each side, and a plate over it to
 * stand on. Returns the whole of it, standing on the rope at its own middle, and the part that turns.
 */
export function buildWheel(colour = '#e4572e') {
  const { radius, wide, up } = WHEEL;
  // A tube's axis is up and down: turned on its side, it's a wheel that rolls along the rope.
  const across = (geometry) => geometry.rotateZ(QUARTER);
  const turning = [
    { geometry: across(tube(radius, wide, 24)), colour: '#3b4350' },
    { geometry: across(tube(radius * 0.64, wide + 0.06, 20)), colour },
    { geometry: across(tube(radius * 0.22, wide + 0.1, 12)), colour: '#ffd23f' },
  ];
  // Pale blocks round the tread, each lying flat against it.
  const blocks = 10;
  for (let n = 0; n < blocks; n += 1) {
    const angle = (n / blocks) * Math.PI * 2;
    turning.push({ geometry: box(wide + 0.02, 0.05, 0.12), colour: '#f7f2e6', at: [0, Math.sin(angle) * radius, Math.cos(angle) * radius], turn: [QUARTER - angle, 0, 0] });
  }
  // A spoke across each hub, which goes round with it.
  for (const side of [-1, 1]) turning.push({ geometry: box(0.03, radius * 1.1, 0.07), colour: '#f7f2e6', at: [side * (wide / 2 + 0.04), 0, 0] });
  const fixed = [
    { geometry: tube(0.028, up - radius, 8), colour: '#9aa3ab', at: [wide / 2 + 0.07, (radius + up) / 2, 0] },
    { geometry: tube(0.028, up - radius, 8), colour: '#9aa3ab', at: [-(wide / 2 + 0.07), (radius + up) / 2, 0] },
    { geometry: roundedBox(0.42, 0.07, 0.66, 0.03), colour: '#4aa3df', at: [0, up - 0.035, 0] },
  ];
  const root = new THREE.Group();
  const spin = solid(turning, { outline: 0.02 });
  spin.position.y = radius;
  root.add(spin, solid(fixed, { outline: 0.02 }));
  return { root, spin };
}

/** The cup on the last rooftop, at level 10. */
export function buildCup() {
  const gold = '#ffd23f';
  return solid([
    { geometry: box(1.0, 0.5, 1.0), colour: '#9aa3ab', at: [0, 0.25, 0] },
    { geometry: tube(0.09, 0.5), colour: gold, at: [0, 0.75, 0] },
    { geometry: new THREE.CylinderGeometry(0.5, 0.2, 0.7, 20), colour: gold, at: [0, 1.3, 0] },
    { geometry: new THREE.TorusGeometry(0.22, 0.05, 8, 14), colour: gold, at: [0.56, 1.34, 0] },
    { geometry: new THREE.TorusGeometry(0.22, 0.05, 8, 14), colour: gold, at: [-0.56, 1.34, 0] },
  ], { ink: '#8a5a00', outline: 0.025 });
}

/** A puff of cloud. */
export function cloudGeometry() {
  return mergeParts([
    { geometry: ball(3, 1.6, 2), colour: '#ffffff', at: [0, 0, 0] },
    { geometry: ball(2.2, 1.3, 1.6), colour: '#ffffff', at: [2.6, -0.3, 0.2] },
    { geometry: ball(2, 1.2, 1.5), colour: '#ffffff', at: [-2.5, -0.35, -0.2] },
  ]);
}

/* ------------------------------- how the walker stands ------------------------------- */

/**
 * The walker on a rope, seen from behind: arms out to balance, one foot in front of the other on the rope, and
 * one of them lifted. foot is which is up, 'left' or 'right', or null, and lift how high, as a share of a whole
 * lift. wobble, from 0 to 1, has the arms and the body swaying, and time keeps them moving.
 */
export function balancePose(out = makePose(), { foot = null, lift = 0, wobble = 0, time = 0, onRope = true } = {}) {
  Object.assign(out, makePose());
  const sway = Math.sin(time * 1.7) * 0.03 + Math.sin(time * 6.5) * 0.24 * wobble;
  out.roll = sway * 0.8;
  out.handLX = 0.92;
  out.handLY = 0.04 + sway * 1.4;
  out.handLZ = 0.06;
  out.handRX = -0.92;
  out.handRY = 0.04 - sway * 1.4;
  out.handRZ = 0.06;
  // On a rope the feet are in a line. On a roof they're side by side.
  const apart = onRope ? 0.05 : 0.17;
  out.footLX = apart;
  out.footRX = -apart;
  out.footLZ = onRope ? 0.1 : 0;
  out.footRZ = onRope ? -0.1 : 0;
  if (foot) {
    // Up and out to the side, where it's seen from behind, and further for a higher lift.
    const high = 0.1 + 0.3 * Math.min(1, lift / 1.6);
    const [x, y, z] = foot === 'left' ? ['footLX', 'footLY', 'footLZ'] : ['footRX', 'footRY', 'footRZ'];
    out[y] = high;
    out[z] = 0.04;
    out[x] = (foot === 'left' ? 1 : -1) * (0.22 + high * 0.5);
    // The other foot under the middle of the body.
    out[foot === 'left' ? 'footRX' : 'footLX'] = 0;
    out[foot === 'left' ? 'footRZ' : 'footLZ'] = 0;
    out.hipX = (foot === 'left' ? -1 : 1) * 0.02;
  }
  return out;
}

/** Arms up, hopping: at the top, and for a friend who's cheering. */
export function cheerPose(out = makePose(), time = 0, amount = 1) {
  Object.assign(out, makePose());
  const beat = Math.sin(time * 6);
  out.handLX = 0.5;
  out.handLY = 0.55 + beat * 0.2 * amount;
  out.handRX = -0.5;
  out.handRY = 0.55 - beat * 0.2 * amount;
  out.up = Math.max(0, beat) * 0.12 * amount;
  return out;
}

/** Sat in the net, legs out in front, bobbing a little: where the walker is left by the last drop it had. */
export function netPose(out = makePose(), time = 0) {
  Object.assign(out, makePose());
  const bob = Math.sin(time * 2.2);
  out.hipDrop = 0.4;
  out.up = bob * 0.03;
  out.pitch = -0.1;
  out.footLX = 0.2;
  out.footRX = -0.2;
  out.footLZ = 0.42;
  out.footRZ = 0.42;
  out.footLY = 0.06;
  out.footRY = 0.06;
  out.handLX = 0.5;
  out.handLY = -0.5 + bob * 0.05;
  out.handLZ = 0.25;
  out.handRX = -0.5;
  out.handRY = -0.5 - bob * 0.05;
  out.handRZ = 0.25;
  return out;
}

/** Tumbling through the air, on the way down to the net. */
export function fallPose(out = makePose(), time = 0) {
  Object.assign(out, makePose());
  out.handLX = 0.7;
  out.handLY = 0.5 + Math.sin(time * 9) * 0.25;
  out.handRX = -0.7;
  out.handRY = 0.5 - Math.sin(time * 9) * 0.25;
  out.footLX = 0.3;
  out.footRX = -0.3;
  out.footLY = 0.12;
  out.footRY = 0.06;
  out.pitch = 0.25;
  return out;
}
