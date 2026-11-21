// The trail: a 3D path through the countryside, what's on it, and the character running along it.
//
// The runner stays where it is and everything else moves past, except that it moves across between
// the trail's three lanes as the child steps from side to side. Scenery is two long strips that
// take turns, so it never ends. Each obstacle has a painted stretch of path before it, showing
// where a move will count. Nothing flashes or strobes, as seizures are more common in children
// with hemiplegia: clearing something is a burst of small shapes, and the picture itself never
// changes brightness.
import * as THREE from '../../vendor/three/three.module.js';
import {
  Fighter3D,
  ball,
  limb,
  makePose,
  mergeParts,
  mixPose,
  outlineMaterial,
  roundedBox,
  taper,
  toon,
} from '../../core/body/characters.js';
import { SHAPES, Sparks, spriteTexture } from '../../core/body/sparks.js';
import { ROSTER } from '../../core/body/roster.js';
import { SEAT } from '../../core/seat.js';

// Three lanes, side by side. The lane in the middle is where the runner starts.
export const LANE_WIDTH = 1.75;
const PATH_WIDTH = LANE_WIDTH * 3 + 0.3;
const OUT = PATH_WIDTH / 2; // From the middle to the path's edge.
export const laneX = (lane) => lane * LANE_WIDTH;
const LANE_CHANGE_RATE = 9; // How quickly the runner gets across to a new lane.
const CAMERA_FOLLOWS = 0.45; // How much of the runner's move across the camera follows.
const STRIP_LENGTH = 90;
const GRASS_BAND = 12;
const PATH_REPEAT = 8;
const SEEN_AHEAD = 110;
const SEEN_BEHIND = 12;
// Friends' runners: one further behind than this is behind the camera, and one just behind is shown at the
// shoulder, this far back. Level with the child's runner and in its lane, one is shown a step to the side.
const MATE_BEHIND = 5;
const MATE_SHOULDER = -0.8;
const MATE_NEAR = 4;
const MATE_ASIDE = 1.15;
const MATE_SIZE = 0.9;
const STARS_SHOWN = 26;
const STARS_SEEN_AHEAD = 75;
const STREAKS = 46; // Lines rushing past, to show the speed.
const STREAK_AREA = { near: 3.6, far: 8, high: 5, ahead: 46, behind: 7 };
const DASH_FOV = 13; // How much wider the view gets in a dash.
const INK = '#3d2a17';

const VIEWS = {
  choose: { at: [0, 1.62, 7.5], look: [0, 0.98, 0], fov: 30 },
  // Low down and close behind, with a wide view, so that everything comes rushing up.
  run: { at: [0.7, 3, 5.9], look: [-0.05, 1.15, -12], fov: 64 },
  // The runner on the right of the screen, with the child's own picture on the left.
  practice: { at: [-2.45, 1.62, 7.5], look: [-2.45, 0.98, 0], fov: 30 },
  win: { at: [1.3, 1.75, 6.5], look: [0, 1.15, 0], fov: 32 },
};

// A picture taller than it's wide, as each half of the split screen is, would cut the runner off at its sides, so
// there the camera stands further back. On the chooser the runner stays clear of the cards above and below, and in
// the practice it's below the child's picture and the film, which are side by side along the top.
const NARROW_VIEWS = {
  choose: { at: [0, 1.6, 16], look: [0, 1.3, 0], fov: 30 },
  // Looking down a little more, so the runners are above the child's picture and the film along the bottom.
  run: { at: [0.7, 3.4, 7], look: [-0.05, -1.4, -12], fov: 62 },
  practice: { at: [0.4, 3, 12.5], look: [0.4, 3, 0], fov: 30 },
  win: { at: [1.3, 2, 10.5], look: [0, 1.35, 0], fov: 32 },
};

// Where and when the run is: a summer's day, autumn from level 7, and an autumn sunset at level 10. The
// picture stays about as bright in each, and it's chosen as a run starts, never changed during one.
const AUTUMN_TREES = { round: ['#e8923a', '#d9673b', '#f0b847'], pines: ['#3f9a58', '#4aa862'], tufts: ['#f2a54a', '#e07b3c'] };
const PLACES = {
  day: {
    sky: ['#3f9fe8', '#a8def9', '#e4f6ff'],
    fog: '#d4f0ff',
    light: ['#ffffff', '#a7c7a0', 1.55],
    sun: ['#fff3dc', 2.3],
    hills: ['#7fcf79', '#74c671', '#8ad684', '#6bbd69'],
    trees: { round: ['#5fb954', '#6cc25e', '#54ad50'], pines: ['#3f9a58', '#4aa862'], tufts: ['#6ec964', '#62bc58'] },
    leaves: null,
  },
  autumn: {
    sky: ['#4a9de0', '#b2dcf4', '#eef6f6'],
    fog: '#e2ecea',
    light: ['#fff8ee', '#b8b48e', 1.55],
    sun: ['#ffe9c8', 2.3],
    hills: ['#b5c96c', '#a7c466', '#c4c773', '#9dba62'],
    trees: AUTUMN_TREES,
    leaves: ['#e8923a', '#d9673b', '#f0b847', '#c9502f'],
  },
  sunset: {
    sky: ['#7f8ad6', '#f4b08e', '#ffe4c2'],
    fog: '#fbdcc6',
    light: ['#fff0e2', '#c9b391', 1.6],
    sun: ['#ffc995', 2.25],
    hills: ['#b9b86c', '#acb066', '#c6b671', '#a3a862'],
    trees: AUTUMN_TREES,
    leaves: ['#e8923a', '#d9673b', '#f0b847', '#c9502f'],
  },
};
const LEAVES = 34;
const LEAF_AREA = { across: 10, high: 7, ahead: 46, behind: 6 };
const PICKUP_SIZE = 1.3;
const ANNOUNCE_AHEAD = 48; // How near something new is when it's first pointed out.
const ARCH_THROUGH = [0.18, 0.3, 0.42, 0.58, 0.72]; // Where the arch's stars are along a bounce.
const CHEST_X = 3.05;
// Something going past the runner towards the camera fades from this far from it, and is gone by this
// near. The runner is about 6 metres from the camera, so nothing at the runner fades.
const NEAR_CAMERA = { full: 4.5, gone: 2 };
// The friend hops over a chest on its side of the trail, rather than running through it.
const FRIEND_HOP = { reach: 1.6, high: 1.5 };

/** Which way ducks waddle off out of the runner's way: to the side of the trail their lanes are on. */
function ducksAway(obstacle) {
  const lanes = obstacle.lanes ?? [-1, 0, 1];
  return lanes.reduce((sum, lane) => sum + lane, 0) < 0 ? -1 : 1;
}

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const damp = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));
const between = (low, high) => low + Math.random() * (high - low);

/* ------------------------------- things made of shapes ------------------------------- */

const toonWith = (options) => new THREE.MeshToonMaterial({ gradientMap: toon(), ...options });

/** Joins parts into one object with an ink line round it. */
function solid(parts, ink = INK, outline = 0.016) {
  const geometry = mergeParts(parts);
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, toonWith({ vertexColors: true }));
  mesh.castShadow = true;
  group.add(mesh, new THREE.Mesh(geometry, outlineMaterial(ink, outline)));
  return group;
}

const cylinderAcross = (radius, length) => new THREE.CylinderGeometry(radius, radius, length, 18).rotateZ(Math.PI / 2);

const OBSTACLE_BUILDERS = {
  log() {
    const parts = [
      { geometry: cylinderAcross(0.38, PATH_WIDTH + 0.3), colour: '#8a5a2b', at: [0, 0.38, -0.45] },
      { geometry: cylinderAcross(0.28, PATH_WIDTH + 0.34), colour: '#d9b277', at: [0, 0.38, -0.45] },
      { geometry: taper(0.1, 0.05, 0.34), colour: '#8a5a2b', at: [0.7, 0.68, -0.45], turn: [0, 0, -0.5] },
      { geometry: ball(0.17, 0.09, 0.14), colour: '#6fbf4f', at: [0.98, 1.05, -0.45] },
    ];
    for (const x of [-2.3, -1.3, -0.5, 0.2, 1.2, 2.2]) parts.push({ geometry: ball(0.05, 0.3, 0.02), colour: '#6d4520', at: [x, 0.5, -0.1], turn: [0.5, 0, 1.57] });
    return solid(parts);
  },
  hay() {
    const parts = [
      { geometry: roundedBox(PATH_WIDTH + 0.3, 1.05, 1.2, 0.16), colour: '#eec04f', at: [0, 0.53, -0.6] },
    ];
    for (const x of [-1.75, 0, 1.75]) {
      parts.push({ geometry: roundedBox(0.09, 1.09, 1.24, 0.04), colour: '#b5482f', at: [x - 0.55, 0.53, -0.6] });
      parts.push({ geometry: roundedBox(0.09, 1.09, 1.24, 0.04), colour: '#b5482f', at: [x + 0.55, 0.53, -0.6] });
    }
    for (let i = 0; i < 13; i += 1) parts.push({ geometry: ball(0.3, 0.012, 0.02), colour: '#d3a43a', at: [-2.5 + i * 0.42, 0.25 + (i % 3) * 0.28, 0.005] });
    return solid(parts);
  },
  rocks() {
    return solid([
      { geometry: ball(0.8, 0.7, 0.72), colour: '#9aa3ab', at: [-0.75, 0.32, -0.7] },
      { geometry: ball(0.62, 0.58, 0.6), colour: '#aab3ba', at: [0.3, 0.27, -0.62] },
      { geometry: ball(0.7, 0.62, 0.66), colour: '#8d969e', at: [1.25, 0.28, -0.76] },
      { geometry: ball(0.46, 0.38, 0.4), colour: '#b8c0c6', at: [-1.7, 0.16, -0.45] },
      { geometry: ball(0.42, 0.33, 0.4), colour: '#a2abb2', at: [1.95, 0.14, -0.4] },
      { geometry: ball(0.66, 0.6, 0.64), colour: '#9aa3ab', at: [-2.55, 0.27, -0.68] },
      { geometry: ball(0.62, 0.56, 0.6), colour: '#8d969e', at: [2.6, 0.26, -0.7] },
      { geometry: ball(0.22, 0.05, 0.2), colour: '#7fbf63', at: [-0.8, 0.98, -0.65] },
    ], '#39424a');
  },
  stream() {
    const parts = [{ geometry: roundedBox(26, 0.06, 2.4, 0.03), colour: '#58b8ee', at: [0, 0.035, -1.2] }];
    for (const [x, z, size] of [[-1.2, -0.6, 1], [0.6, -1.5, 0.8], [1.7, -0.5, 0.9], [-0.1, -1.05, 0.7], [-2.2, -1.7, 0.9], [2.6, -1.7, 0.8], [3.4, -0.7, 1]]) {
      parts.push({ geometry: ball(0.5 * size, 0.012, 0.09), colour: '#b4e4fb', at: [x, 0.07, z] });
    }
    for (const [x, z] of [[-3.2, -0.15], [3.1, -2.25], [-2.1, -2.3], [2.2, -0.12]]) {
      parts.push({ geometry: ball(0.34, 0.14, 0.26), colour: '#a2abb2', at: [x, 0.09, z] });
    }
    return solid(parts, '#1d5a84', 0.008);
  },
  // From level 4: a wooden fence right across the trail.
  fence() {
    const parts = [];
    for (const x of [-2.75, -1.65, -0.55, 0.55, 1.65, 2.75]) {
      parts.push({ geometry: roundedBox(0.17, 1, 0.17, 0.04), colour: '#a8794a', at: [x, 0.5, -0.25] });
      parts.push({ geometry: taper(0.1, 0.02, 0.12, 4), colour: '#a8794a', at: [x, 1.0, -0.25] });
    }
    for (const y of [0.42, 0.8]) parts.push({ geometry: roundedBox(PATH_WIDTH + 0.3, 0.13, 0.08, 0.03), colour: '#f2e2c2', at: [0, y, -0.15] });
    return solid(parts);
  },
  // From level 6: three round bales, one in each lane, that roll in and stop before the painted stretch.
  bale(lanes = [-1, 0, 1]) {
    const parts = [];
    for (const x of lanes.map(laneX)) {
      parts.push({ geometry: cylinderAcross(0.6, 1.5), colour: '#e8c25a', at: [x, 0, 0] });
      for (const end of [-0.76, 0.76]) {
        parts.push({ geometry: cylinderAcross(0.42, 0.02), colour: '#c99a3a', at: [x + end, 0, 0] });
        parts.push({ geometry: cylinderAcross(0.2, 0.03), colour: '#b5862f', at: [x + end, 0, 0] });
      }
      parts.push({ geometry: cylinderAcross(0.615, 0.1), colour: '#b5482f', at: [x - 0.35, 0, 0] });
      parts.push({ geometry: cylinderAcross(0.615, 0.1), colour: '#b5482f', at: [x + 0.35, 0, 0] });
    }
    const rolling = solid(parts);
    rolling.position.set(0, 0.6, -0.62);
    const model = new THREE.Group();
    model.add(rolling);
    model.userData.rolling = rolling;
    return model;
  },
  // From level 8: a flock of sheep crossing the trail.
  sheep(lanes = [-1, 0, 1]) {
    const flock = new THREE.Group();
    const across = lanes.length === 3 ? [[-2.2, 0], [-0.75, 0.25], [0.75, -0.15], [2.2, 0.1]] : lanes.map((lane) => [laneX(lane), lane * 0.15]);
    for (const [x, turn] of across) {
      const parts = [];
      for (const [dx, dy, size] of [[-0.25, 0.62, 0.36], [0.05, 0.68, 0.4], [0.3, 0.62, 0.34], [0, 0.55, 0.38]]) {
        parts.push({ geometry: ball(size, size * 0.85, size * 0.8), colour: '#fbf8f1', at: [dx, dy, 0] });
      }
      parts.push({ geometry: ball(0.17, 0.2, 0.16), colour: '#3d3a3f', at: [0.55, 0.78, 0] });
      parts.push({ geometry: ball(0.07, 0.03, 0.12), colour: '#3d3a3f', at: [0.5, 0.92, 0.14] });
      parts.push({ geometry: ball(0.07, 0.03, 0.12), colour: '#3d3a3f', at: [0.5, 0.92, -0.14] });
      parts.push({ geometry: ball(0.035), colour: '#ffffff', at: [0.66, 0.83, 0.08] });
      parts.push({ geometry: ball(0.035), colour: '#ffffff', at: [0.66, 0.83, -0.08] });
      for (const [lx, lz] of [[-0.25, 0.12], [-0.25, -0.12], [0.28, 0.12], [0.28, -0.12]]) {
        parts.push({ geometry: limb(0.045, 0.04, 0.36, 6).rotateX(Math.PI), colour: '#3d3a3f', at: [lx, 0, lz] });
      }
      const sheep = solid(parts, INK, 0.014);
      sheep.position.set(x, 0, -0.4);
      sheep.rotation.y = turn;
      sheep.userData.phase = x;
      flock.add(sheep);
    }
    flock.userData.sheep = [...flock.children];
    return flock;
  },
  // From level 7: a duck and her two ducklings in each lane they fill, who waddle over into it as they come.
  ducks(lanes = [-1, 0, 1]) {
    const family = new THREE.Group();
    const walking = new THREE.Group();
    family.add(walking);
    const spots = lanes.flatMap((lane) => [[laneX(lane), -0.35, true], [laneX(lane) - 0.55, 0.15, false], [laneX(lane) + 0.55, 0.2, false]]);
    spots.forEach(([x, z, mother], index) => {
      const size = mother ? 1 : 0.6;
      const body = mother ? '#fbf8f1' : '#ffe066';
      const parts = [
        { geometry: ball(0.42 * size, 0.34 * size, 0.32 * size), colour: body, at: [0, 0.4 * size, 0] },
        { geometry: ball(0.13 * size, 0.1 * size, 0.2 * size), colour: mother ? '#e9e4da' : '#f5cf3d', at: [-0.38 * size, 0.55 * size, 0], turn: [0, 0, 0.6] },
        { geometry: ball(0.21 * size), colour: body, at: [0.34 * size, 0.78 * size, 0] },
        { geometry: ball(0.13 * size, 0.05 * size, 0.1 * size), colour: '#ff9f2e', at: [0.56 * size, 0.74 * size, 0] },
        { geometry: ball(0.035), colour: '#2b2b33', at: [0.46 * size, 0.85 * size, 0.12 * size] },
        { geometry: ball(0.035), colour: '#2b2b33', at: [0.46 * size, 0.85 * size, -0.12 * size] },
      ];
      for (const side of [0.1, -0.1]) parts.push({ geometry: limb(0.03, 0.03, 0.12 * size + 0.04, 5).rotateX(Math.PI), colour: '#ff9f2e', at: [0, 0, side * size] });
      const duck = solid(parts, INK, 0.012);
      duck.position.set(x, 0, z);
      duck.userData.phase = index * 1.7;
      walking.add(duck);
    });
    family.userData.walking = walking;
    family.userData.ducks = [...walking.children];
    return family;
  },
};

/** A trampoline's mat, a lane wide and the length of the painted stretch, with a red rim and springs. */
function buildMatRim(length) {
  const parts = [];
  for (const x of [-(LANE_WIDTH - 0.15) / 2, (LANE_WIDTH - 0.15) / 2]) {
    parts.push({ geometry: roundedBox(0.16, 0.16, length, 0.05), colour: '#e8504a', at: [x, 0.08, 0] });
    for (let z = -length / 2 + 0.8; z < length / 2; z += 1.6) parts.push({ geometry: limb(0.05, 0.05, 0.1, 6).rotateX(Math.PI), colour: '#c9d2da', at: [x, 0, z] });
  }
  for (const z of [-length / 2, length / 2]) parts.push({ geometry: roundedBox(LANE_WIDTH - 0.15, 0.16, 0.16, 0.05), colour: '#e8504a', at: [0, 0.08, z] });
  return solid(parts, INK, 0.012);
}

/** A treasure chest, with a lid that opens. */
function buildChest() {
  const chest = new THREE.Group();
  const body = solid([
    { geometry: roundedBox(0.9, 0.55, 0.6, 0.06), colour: '#9a5b2c', at: [0, 0.28, 0] },
    { geometry: roundedBox(0.94, 0.08, 0.64, 0.03), colour: '#ffcf3f', at: [0, 0.5, 0] },
    { geometry: roundedBox(0.08, 0.57, 0.64, 0.03), colour: '#ffcf3f', at: [-0.3, 0.28, 0] },
    { geometry: roundedBox(0.08, 0.57, 0.64, 0.03), colour: '#ffcf3f', at: [0.3, 0.28, 0] },
    { geometry: roundedBox(0.16, 0.18, 0.06, 0.03), colour: '#ffcf3f', at: [0, 0.42, 0.31] },
  ]);
  const lid = new THREE.Group();
  lid.add(solid([
    { geometry: new THREE.CylinderGeometry(0.3, 0.3, 0.9, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2), colour: '#a8632f', at: [0, 0, 0.3] },
    { geometry: new THREE.CylinderGeometry(0.31, 0.31, 0.08, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2), colour: '#ffcf3f', at: [-0.3, 0, 0.3] },
    { geometry: new THREE.CylinderGeometry(0.31, 0.31, 0.08, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2), colour: '#ffcf3f', at: [0.3, 0, 0.3] },
  ]));
  lid.position.set(0, 0.55, -0.3);
  chest.add(body, lid);
  chest.userData.lid = lid;
  return chest;
}

/* Obstacles that fill only one or two lanes: the same things, a lane wide, in the lanes they fill. */
const PIECE_WIDTH = LANE_WIDTH + 0.12;
const PIECES = {
  log: (x) => [
    { geometry: cylinderAcross(0.38, PIECE_WIDTH), colour: '#8a5a2b', at: [x, 0.38, -0.45] },
    { geometry: cylinderAcross(0.28, PIECE_WIDTH + 0.04), colour: '#d9b277', at: [x, 0.38, -0.45] },
    { geometry: ball(0.05, 0.3, 0.02), colour: '#6d4520', at: [x - 0.35, 0.5, -0.1], turn: [0.5, 0, 1.57] },
    { geometry: ball(0.05, 0.3, 0.02), colour: '#6d4520', at: [x + 0.45, 0.5, -0.1], turn: [0.5, 0, 1.57] },
  ],
  hay: (x) => [
    { geometry: roundedBox(PIECE_WIDTH, 1.05, 1.2, 0.16), colour: '#eec04f', at: [x, 0.53, -0.6] },
    { geometry: roundedBox(0.09, 1.09, 1.24, 0.04), colour: '#b5482f', at: [x - 0.45, 0.53, -0.6] },
    { geometry: roundedBox(0.09, 1.09, 1.24, 0.04), colour: '#b5482f', at: [x + 0.45, 0.53, -0.6] },
    ...[-0.6, -0.15, 0.3, 0.7].map((dx, i) => ({ geometry: ball(0.3, 0.012, 0.02), colour: '#d3a43a', at: [x + dx, 0.25 + (i % 3) * 0.28, 0.005] })),
  ],
  rocks: (x) => [
    { geometry: ball(0.62, 0.66, 0.66), colour: '#9aa3ab', at: [x - 0.3, 0.3, -0.7] },
    { geometry: ball(0.5, 0.5, 0.52), colour: '#8d969e', at: [x + 0.45, 0.24, -0.62] },
    { geometry: ball(0.34, 0.3, 0.34), colour: '#b8c0c6', at: [x + 0.1, 0.14, -0.3] },
    { geometry: ball(0.2, 0.05, 0.18), colour: '#7fbf63', at: [x - 0.3, 0.92, -0.65] },
  ],
  fence: (x) => {
    const parts = [];
    for (const post of [x - PIECE_WIDTH / 2 + 0.12, x + PIECE_WIDTH / 2 - 0.12]) {
      parts.push({ geometry: roundedBox(0.17, 1, 0.17, 0.04), colour: '#a8794a', at: [post, 0.5, -0.25] });
      parts.push({ geometry: taper(0.1, 0.02, 0.12, 4), colour: '#a8794a', at: [post, 1.0, -0.25] });
    }
    for (const y of [0.42, 0.8]) parts.push({ geometry: roundedBox(PIECE_WIDTH, 0.13, 0.08, 0.03), colour: '#f2e2c2', at: [x, y, -0.15] });
    return parts;
  },
};

/** An obstacle filling these lanes: right across is the obstacle as it always was. */
function buildObstacle(kind, lanes) {
  if (lanes.length === 3 || kind === 'stream') return OBSTACLE_BUILDERS[kind]();
  if (kind === 'bale' || kind === 'sheep' || kind === 'ducks') return OBSTACLE_BUILDERS[kind](lanes);
  const ink = kind === 'rocks' ? '#39424a' : INK;
  return solid(lanes.flatMap((lane) => PIECES[kind](laneX(lane))), ink);
}

// A round bale rolls in from further away and stops this far short of where a jump starts to count.
const BALE_STOPS_SHORT = 6;
const BALE_ROLLS = 0.45; // How much further it starts, for each metre it still has to go.
const BALE_RADIUS = 0.6;
// The golden star: bigger than the rest, and higher, over one lane.
const GOLD_SIZE = 2.1;
const GOLD_ABOVE = 1.55;

function goldTexture() {
  const star = (ctx, outer, inner) => {
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const radius = i % 2 ? inner : outer;
      const angle = (i / 5) * Math.PI - Math.PI / 2;
      ctx[i ? 'lineTo' : 'moveTo'](Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    ctx.closePath();
    ctx.fill();
  };
  return spriteTexture((ctx) => {
    ctx.fillStyle = '#ffffff';
    star(ctx, 49, 23);
    ctx.fillStyle = '#ffb21f';
    star(ctx, 41, 18);
    ctx.fillStyle = '#ffe27a';
    star(ctx, 22, 10);
  }, 128);
}

/** A round badge for something to pick up, so it stands out from the stars: a picture on a white disc. */
function badgeTexture(ring, draw) {
  return spriteTexture((ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 47, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = ring;
    ctx.beginPath();
    ctx.arc(0, 0, 43, 0, Math.PI * 2);
    ctx.stroke();
    draw(ctx);
  }, 128);
}

const PICKUP_TEXTURES = {
  magnet: () => badgeTexture('#e8504a', (ctx) => {
    ctx.lineCap = 'butt';
    ctx.lineWidth = 15;
    ctx.strokeStyle = '#e8504a';
    ctx.beginPath();
    ctx.arc(0, -2, 20, Math.PI, 0, true);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-20, -2);
    ctx.lineTo(-20, -24);
    ctx.moveTo(20, -2);
    ctx.lineTo(20, -24);
    ctx.stroke();
    ctx.fillStyle = '#c9d2da';
    ctx.fillRect(-27.5, -34, 15, 11);
    ctx.fillRect(12.5, -34, 15, 11);
  }),
  shield: () => badgeTexture('#4aa8ff', (ctx) => {
    ctx.fillStyle = 'rgba(120, 200, 255, 0.45)';
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#4aa8ff';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-10, -11, 7, 0, Math.PI * 2);
    ctx.fill();
  }),
  key: () => badgeTexture('#e0a21a', (ctx) => {
    ctx.fillStyle = '#ffc21f';
    ctx.strokeStyle = '#a8740f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(-14, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-14, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffc21f';
    ctx.fillRect(-2, -4, 32, 8);
    ctx.fillRect(18, 4, 6, 9);
    ctx.fillRect(26, 4, 5, 6);
  }),
};

function coinTexture() {
  return spriteTexture((ctx) => {
    ctx.fillStyle = '#c98a12';
    ctx.beginPath();
    ctx.arc(0, 0, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffcc2e';
    ctx.beginPath();
    ctx.arc(0, 0, 38, 0, Math.PI * 2);
    ctx.fill();
    // A giraffe's patches, for Giraffe.
    ctx.fillStyle = '#e59b17';
    for (const [x, y, r] of [[-12, -12, 9], [12, -6, 8], [-4, 14, 10], [18, 16, 6], [-20, 8, 5]]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }, 96);
}

function gemTexture() {
  return spriteTexture((ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(-40, -14);
    ctx.lineTo(-22, -36);
    ctx.lineTo(22, -36);
    ctx.lineTo(40, -14);
    ctx.lineTo(0, 42);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3fc7d9';
    ctx.beginPath();
    ctx.moveTo(-33, -13);
    ctx.lineTo(-19, -30);
    ctx.lineTo(19, -30);
    ctx.lineTo(33, -13);
    ctx.lineTo(0, 33);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#a6f0f7';
    ctx.beginPath();
    ctx.moveTo(-19, -30);
    ctx.lineTo(19, -30);
    ctx.lineTo(10, -13);
    ctx.lineTo(-10, -13);
    ctx.closePath();
    ctx.fill();
  }, 128);
}

function buildFinish() {
  const parts = [
    { geometry: roundedBox(0.36, 4.2, 0.36, 0.08), colour: '#f7f2e6', at: [-3.9, 2.1, 0] },
    { geometry: roundedBox(0.36, 4.2, 0.36, 0.08), colour: '#f7f2e6', at: [3.9, 2.1, 0] },
    { geometry: ball(0.3), colour: '#ffd23f', at: [-3.9, 4.35, 0] },
    { geometry: ball(0.3), colour: '#ffd23f', at: [3.9, 4.35, 0] },
  ];
  for (let column = 0; column < 16; column += 1) {
    for (let row = 0; row < 2; row += 1) {
      parts.push({
        geometry: new THREE.BoxGeometry(0.5, 0.44, 0.1),
        colour: (column + row) % 2 ? '#12304d' : '#ffffff',
        at: [-3.75 + column * 0.5, 3.45 + row * 0.44, 0],
      });
    }
  }
  return solid(parts, '#12304d');
}

function buildStrip(trees = PLACES.day.trees) {
  const parts = [];
  const side = () => (Math.random() < 0.5 ? -1 : 1);
  const z = () => -Math.random() * STRIP_LENGTH;

  // Trees, keeping clear of the path.
  for (let i = 0; i < 46; i += 1) {
    const x = side() * between(6.5, 44);
    const where = z();
    const size = between(0.85, 1.5);
    const trunkHeight = 1.5 * size;
    parts.push({ geometry: taper(0.3 * size, 0.2 * size, trunkHeight, 8), colour: '#7c5228', at: [x, 0, where] });
    if (i % 3 === 0) {
      // A pointed one.
      for (const [y, radius] of [[1.1, 1.3], [2.1, 1.02], [3, 0.72]]) {
        parts.push({ geometry: new THREE.ConeGeometry(radius * size, 1.7 * size, 12), colour: trees.pines[i % 2], at: [x, (y + 0.7) * size, where] });
      }
    } else {
      const green = trees.round[i % 3];
      parts.push({ geometry: ball(1.2 * size, 1.1 * size, 1.2 * size), colour: green, at: [x, trunkHeight + 0.9 * size, where] });
      parts.push({ geometry: ball(0.82 * size), colour: trees.tufts[0], at: [x + 0.7 * size, trunkHeight + 0.45 * size, where + 0.3] });
      parts.push({ geometry: ball(0.78 * size), colour: trees.tufts[1], at: [x - 0.72 * size, trunkHeight + 0.5 * size, where - 0.2] });
    }
  }
  // Bushes and stones nearer in.
  for (let i = 0; i < 24; i += 1) {
    const x = side() * between(OUT + 1.5, 14);
    const where = z();
    const size = between(0.5, 0.95);
    if (i % 3 === 2) parts.push({ geometry: ball(0.5 * size, 0.34 * size, 0.42 * size), colour: '#a9b1b8', at: [x, 0.14 * size, where] });
    else {
      parts.push({ geometry: ball(0.8 * size, 0.62 * size, 0.72 * size), colour: i % 2 ? '#5db152' : '#6bbf5e', at: [x, 0.42 * size, where] });
      parts.push({ geometry: ball(0.5 * size, 0.42 * size, 0.46 * size), colour: '#78cb68', at: [x + 0.5 * size, 0.32 * size, where + 0.2] });
    }
  }
  // Flowers along the path.
  const petals = ['#ff7eb6', '#ffd23f', '#ffffff', '#ff8a5c', '#b58cff'];
  for (let i = 0; i < 90; i += 1) {
    const x = side() * between(PATH_WIDTH / 2 + 0.25, 7.5);
    const where = z();
    parts.push({ geometry: limb(0.018, 0.018, 0.2, 5).rotateX(Math.PI), colour: '#3f9a58', at: [x, 0, where] });
    parts.push({ geometry: ball(0.09, 0.07, 0.09), colour: petals[i % petals.length], at: [x, 0.23, where] });
  }
  // A rail fence on each side, the whole way along.
  for (const fenceSide of [-1, 1]) {
    const x = fenceSide * (OUT + 0.95);
    for (let post = 0; post < STRIP_LENGTH / 5; post += 1) {
      const where = -post * 5;
      parts.push({ geometry: new THREE.BoxGeometry(0.16, 1, 0.16), colour: '#c49a64', at: [x, 0.5, where] });
      parts.push({ geometry: new THREE.BoxGeometry(0.08, 0.1, 5), colour: '#d9b277', at: [x, 0.76, where - 2.5] });
      parts.push({ geometry: new THREE.BoxGeometry(0.08, 0.1, 5), colour: '#d9b277', at: [x, 0.42, where - 2.5] });
    }
  }
  // A village going by: houses, barns and haystacks further out.
  const walls = ['#fff1d6', '#ffe0b8', '#f7d3c4', '#e7efd6', '#f4e3b1'];
  const roofs = ['#d9534f', '#c9683d', '#a8483f', '#4f7fb5', '#b5573a'];
  for (let i = 0; i < 12; i += 1) {
    const x = side() * between(9, 24);
    const where = z();
    const wide = between(2.6, 4.2);
    const deep = between(2.6, 4.4);
    const high = between(2, 3.2);
    const barn = i % 5 === 4;
    parts.push({ geometry: new THREE.BoxGeometry(wide, high, deep), colour: barn ? '#b5413a' : walls[i % walls.length], at: [x, high / 2, where] });
    parts.push({
      geometry: new THREE.ConeGeometry(Math.hypot(wide, deep) * 0.56, wide * 0.5, 4).rotateY(Math.PI / 4).scale(1, 1, deep / wide),
      colour: barn ? '#5c3a2c' : roofs[i % roofs.length],
      at: [x, high + wide * 0.25, where],
    });
    parts.push({ geometry: new THREE.BoxGeometry(wide * 0.26, high * 0.45, 0.06), colour: '#6a4a2e', at: [x, high * 0.23, where + deep / 2 + 0.02] });
    for (const across of [-0.3, 0.3]) {
      parts.push({ geometry: new THREE.BoxGeometry(wide * 0.18, high * 0.2, 0.06), colour: '#8fd0ee', at: [x + across * wide, high * 0.66, where + deep / 2 + 0.02] });
    }
  }
  for (let i = 0; i < 8; i += 1) {
    const x = side() * between(5, 11);
    const where = z();
    parts.push({ geometry: new THREE.CylinderGeometry(0.75, 0.9, 1.3, 10), colour: '#e2bd5c', at: [x, 0.65, where] });
    parts.push({ geometry: new THREE.ConeGeometry(0.78, 0.65, 10), colour: '#d6ad4c', at: [x, 1.6, where] });
  }
  // Tall poles close by, which go past quickly, and strings of flags high overhead.
  const flags = ['#ff5a4f', '#ffd23f', '#3b82f6', '#27c96b', '#a855f7'];
  for (let i = 0; i < 2; i += 1) {
    const where = -STRIP_LENGTH * (0.25 + i * 0.5);
    for (const poleSide of [-1, 1]) {
      parts.push({ geometry: new THREE.CylinderGeometry(0.08, 0.1, 5.8, 8), colour: '#9a7446', at: [poleSide * (OUT + 1.6), 2.9, where] });
    }
    for (let flag = 0; flag < 13; flag += 1) {
      const across = (flag / 12 - 0.5) * (PATH_WIDTH + 3.2);
      const sag = 5.6 - (1 - ((flag / 12 - 0.5) * 2) ** 2) * 0.45;
      parts.push({ geometry: new THREE.ConeGeometry(0.2, 0.46, 3).rotateX(Math.PI), colour: flags[flag % flags.length], at: [across, sag, where] });
    }
  }
  for (let i = 0; i < 9; i += 1) {
    const x = (i % 2 ? 1 : -1) * (OUT + 2);
    const where = -((i + 0.5) / 9) * STRIP_LENGTH;
    parts.push({ geometry: new THREE.CylinderGeometry(0.06, 0.08, 3.4, 6), colour: '#566b7d', at: [x, 1.7, where] });
    parts.push({ geometry: ball(0.2), colour: '#fff3c4', at: [x, 3.5, where] });
  }

  const geometry = mergeParts(parts);
  const mesh = new THREE.Mesh(geometry, toonWith({ vertexColors: true }));
  mesh.castShadow = true;
  return mesh;
}

/**
 * Gives a strip's trees another set of colours, from the set they have now, in place. No colour in a set
 * of trees is used for anything else in a strip, so only the trees change.
 */
function recolourTrees(strip, from, to) {
  const swaps = [];
  for (const key of Object.keys(from)) {
    from[key].forEach((colour, index) => {
      if (colour !== to[key][index]) swaps.push([new THREE.Color(colour), new THREE.Color(to[key][index])]);
    });
  }
  const colours = strip.geometry.attributes.color;
  const values = colours.array;
  const same = (value, wanted) => Math.abs(value - wanted) < 1e-5;
  for (let i = 0; i < values.length; i += 3) {
    for (const [was, now] of swaps) {
      if (!same(values[i], was.r) || !same(values[i + 1], was.g) || !same(values[i + 2], was.b)) continue;
      values[i] = now.r;
      values[i + 1] = now.g;
      values[i + 2] = now.b;
      break;
    }
  }
  colours.needsUpdate = true;
}

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

function grassTexture() {
  return canvasTexture(64, (ctx, size) => {
    ctx.fillStyle = '#83d27a';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#7bca72';
    ctx.fillRect(0, 0, size, size / 2);
  });
}

function pathTexture() {
  return canvasTexture(256, (ctx, size) => {
    ctx.fillStyle = '#e4bf85';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 70; i += 1) {
      ctx.fillStyle = i % 3 ? '#d7ae72' : '#efd0a0';
      ctx.beginPath();
      ctx.ellipse(Math.random() * size, Math.random() * size, between(3, 11), between(2, 7), Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#c99c61';
    ctx.fillRect(0, 0, 9, size);
    ctx.fillRect(size - 9, 0, 9, size);
    // Two soft lines between the lanes, unbroken, so nothing goes past in flickers.
    ctx.fillStyle = '#f3dcb2';
    for (const share of [1 / 3, 2 / 3]) ctx.fillRect(Math.round(size * share) - 3, 0, 6, size);
  });
}

/** Chevrons pointing up the texture. The colour comes from the material using it. */
function zoneTexture() {
  return canvasTexture(128, (ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 15;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(size * 0.2, size * 0.72);
    ctx.lineTo(size * 0.5, size * 0.32);
    ctx.lineTo(size * 0.8, size * 0.72);
    ctx.stroke();
  });
}

function skyTexture(colours = PLACES.day.sky) {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, colours[0]);
  sky.addColorStop(0.52, colours[1]);
  sky.addColorStop(0.7, colours[2]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 4, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function arrowTexture(pointsUp, colour) {
  return spriteTexture((ctx) => {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(0, 0, 47, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.rotate(pointsUp ? 0 : Math.PI);
    ctx.beginPath();
    ctx.moveTo(0, -32);
    ctx.lineTo(28, 2);
    ctx.lineTo(11, 2);
    ctx.lineTo(11, 30);
    ctx.lineTo(-11, 30);
    ctx.lineTo(-11, 2);
    ctx.lineTo(-28, 2);
    ctx.closePath();
    ctx.fill();
  }, 128);
}

/* ------------------------------- the runner ------------------------------- */

// How quickly the legs go. It doesn't go up as fast as the speed, or they'd be nothing but a blur.
const STRIDE_RATE = 3.5;
const STRIDE_POWER = 0.45;
const HOP_SECONDS = 0.65;
const HOP_HEIGHT = 1.1;

class Runner {
  constructor(spec) {
    this.spec = spec;
    this.body = new Fighter3D(spec);
    this.facing = Math.PI;
    this.presenting = false;
    this.phase = 0;
    this.time = Math.random() * 10;
    this.landing = 0;
    this.stumble = 0;
    this.hopLeft = 0;
    this.live = null; // A pose from the child's body, when there is one.
    this.pose = makePose();
    this.target = makePose();
    this.body.setExpression('happy');
    this.onStep = null;
  }

  /** What the body should be doing, from what the run says. */
  update(dt, { speed = 0, top = 5, height = 0, through = 0, jumping = false, won = false, waiting = false }, reducedMotion) {
    this.time += dt;
    const { target, pose } = this;
    Object.assign(target, makePose());

    const stride = clamp(speed / top, 0, 1);
    const before = Math.sin(this.phase);
    this.phase += dt * speed ** STRIDE_POWER * STRIDE_RATE * Math.PI * 0.5;
    const swing = Math.sin(this.phase);
    const lift = Math.cos(this.phase);
    if (!jumping && speed > 1 && Math.sign(before) !== Math.sign(swing)) this.onStep?.();

    if (won) {
      const hop = reducedMotion ? 0 : Math.abs(Math.sin(this.time * 4.6));
      Object.assign(target, {
        up: hop * 0.42,
        squash: hop < 0.14 ? 0.08 : -0.03,
        headPitch: -0.2,
        handLX: 0.36 + Math.sin(this.time * 9) * 0.1,
        handLY: 0.92,
        handLZ: 0.1,
        handRX: -0.36 + Math.sin(this.time * 9) * 0.1,
        handRY: 0.92,
        handRZ: 0.1,
        footLX: 0.22,
        footRX: -0.22,
      });
    } else if (jumping) {
      const rising = through < 0.5;
      Object.assign(target, {
        pitch: rising ? 0.05 : 0.2,
        squash: rising ? -0.08 : -0.03,
        headPitch: rising ? -0.25 : 0.1,
        handLX: 0.34,
        handLY: rising ? 0.85 : 0.35,
        handLZ: rising ? 0.3 : 0.45,
        handRX: -0.34,
        handRY: rising ? 0.85 : 0.35,
        handRZ: rising ? 0.3 : 0.45,
        wristL: -0.5,
        wristR: -0.5,
        footLX: 0.2,
        footLY: 0.28,
        footLZ: 0.2,
        footLPitch: -0.5,
        footRX: -0.2,
        footRY: 0.2,
        footRZ: -0.3,
        footRPitch: 0.5,
      });
    } else if (stride > 0.04) {
      Object.assign(target, {
        pitch: 0.1 + stride * 0.2,
        hipDrop: 0.05,
        up: Math.abs(lift) * 0.07 * stride,
        twist: swing * 0.14 * stride,
        handLX: 0.4,
        handLY: -0.56,
        handLZ: 0.2 - swing * 0.46 * stride,
        handRX: -0.4,
        handRY: -0.56,
        handRZ: 0.2 + swing * 0.46 * stride,
        footLX: 0.16,
        footLY: Math.max(0, lift) * 0.3 * stride,
        footLZ: swing * 0.42 * stride,
        footLPitch: -swing * 0.5 * stride,
        footRX: -0.16,
        footRY: Math.max(0, -lift) * 0.3 * stride,
        footRZ: -swing * 0.42 * stride,
        footRPitch: swing * 0.5 * stride,
      });
    } else {
      // Standing, bouncing a little, ready to go.
      const bob = reducedMotion ? 0 : Math.sin(this.time * (waiting ? 5 : 3.2));
      Object.assign(target, {
        hipDrop: 0.05 + bob * 0.025,
        headPitch: waiting ? -0.1 : 0,
        handLX: 0.42,
        handLY: -0.72 + bob * 0.03,
        handLZ: 0.16,
        handRX: -0.42,
        handRY: -0.72 + bob * 0.03,
        handRZ: 0.16,
      });
    }

    // The runner copies the child, so they can see it's them: fully when standing, and in the
    // sinking and a share of the arms when running. It faces the child as a mirror would.
    const { live } = this;
    if (live && !won && !jumping) {
      const share = stride > 0.04 && !this.presenting ? 0.35 : 1;
      const mirrored = this.presenting;
      const copy = (key, value) => {
        target[key] += (value - target[key]) * share;
      };
      copy('handLX', mirrored ? -live.handRX : live.handLX);
      copy('handLY', mirrored ? live.handRY : live.handLY);
      copy('handLZ', mirrored ? live.handRZ : live.handLZ);
      copy('handRX', mirrored ? -live.handLX : live.handRX);
      copy('handRY', mirrored ? live.handLY : live.handRY);
      copy('handRZ', mirrored ? live.handLZ : live.handRZ);
      copy('wristL', mirrored ? live.wristR : live.wristL);
      copy('wristR', mirrored ? live.wristL : live.wristR);
      target.openL = mirrored ? live.openR : live.openL;
      target.openR = mirrored ? live.openL : live.openR;
      target.hipDrop = Math.max(target.hipDrop, live.hipDrop);
      if (share === 1) {
        target.pitch = live.pitch * 0.6;
        target.roll = (mirrored ? -1 : 1) * live.roll * 0.6;
      }
    } else if (this.presenting && !won) {
      // Waving to the child, on the choosing screen.
      target.handRX = -0.46 + (reducedMotion ? 0 : Math.sin(this.time * 7) * 0.22);
      target.handRY = 0.84;
      target.handRZ = 0.2;
      target.wristR = 0.12;
    }

    if (this.stumble > 0) {
      this.stumble = Math.max(0, this.stumble - dt);
      const wobble = Math.sin(this.stumble * 18) * 0.12;
      target.pitch = 0.5 + wobble;
      target.roll = wobble;
      target.handLX = 0.7;
      target.handLY = 0.1;
      target.handRX = -0.7;
      target.handRY = 0.1;
    }

    mixPose(pose, pose, target, 1 - Math.exp(-dt * (jumping ? 22 : 15)));

    // Height follows the arc exactly, so the fighter really is over what it jumps.
    pose.up = jumping ? height : pose.up;
    if (this.hopLeft > 0) {
      // A hop just to show the move was seen, when not on the trail.
      this.hopLeft = Math.max(0, this.hopLeft - dt);
      const through = 1 - this.hopLeft / HOP_SECONDS;
      pose.up = HOP_HEIGHT * 4 * through * (1 - through);
    }
    if (this.landing > 0) {
      this.landing = Math.max(0, this.landing - dt);
      pose.squash = Math.max(pose.squash, this.landing * 0.75);
    }
    this.body.setPose(pose);
    this.body.update(dt);

    this.facing = damp(this.facing, this.presenting ? 0.14 : Math.PI, 7, dt);
    this.body.faceTowards(this.facing);
  }
}

/* ------------------------------- the world ------------------------------- */

export class World {
  constructor(canvas) {
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = skyTexture();
    this.scene.fog = new THREE.Fog('#d4f0ff', 62, SEEN_AHEAD + 12);
    this.skyLight = new THREE.HemisphereLight('#ffffff', '#a7c7a0', 1.55);
    this.scene.add(this.skyLight);
    const sun = new THREE.DirectionalLight('#fff3dc', 2.3);
    this.sun = sun;
    sun.position.set(-7, 16, 7);
    sun.target.position.set(0, 0, -9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1536, 1536);
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 24, bottom: -14, near: 1, far: 50 });
    sun.shadow.radius = 3;
    this.scene.add(sun, sun.target);

    this.buildPlace();
    this.sparks = new Sparks(this.scene);
    this.zoneMap = zoneTexture();
    this.arrows = { jump: arrowTexture(true, '#17a84f') };
    this.cue = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.arrows.jump, transparent: true, depthTest: false }));
    this.cue.scale.setScalar(1.05);
    this.cue.visible = false;
    this.cue.renderOrder = 5;
    this.scene.add(this.cue);
    this.cue.scale.setScalar(1.5);
    this.starMap = spriteTexture(SHAPES.star, 96);
    this.goldMap = goldTexture();
    this.buildStarLines();
    this.buildStreaks();
    this.buildExtras();
    this.finishGate = buildFinish();
    this.finishGate.visible = false;
    this.scene.add(this.finishGate);

    this.camera = new THREE.PerspectiveCamera(VIEWS.choose.fov, 1, 0.1, 400);
    this.cameraAt = new THREE.Vector3(...VIEWS.choose.at);
    this.cameraLook = new THREE.Vector3(...VIEWS.choose.look);
    this.view = 'choose';
    this.lane = 0;
    this.runnerX = 0;
    this.run = null;
    this.runner = null;
    this.time = 0;
    this.items = new Map(); // What's on the trail, by obstacle.
    this.place = 'day';
    this.spare = new Map(); // Obstacles ready to use again, by kind.
    this.onStar = null;
    this.frames = 0;
    this.slowFrames = 0;
    this.quality = 2;

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  buildPlace() {
    const { scene } = this;
    this.grass = grassTexture();
    this.grass.repeat.set(1, 400 / (GRASS_BAND * 2));
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), toonWith({ map: this.grass }));
    ground.position.set(0, -0.02, -120);
    ground.receiveShadow = true;
    scene.add(ground);

    this.path = pathTexture();
    this.path.repeat.set(1, 300 / PATH_REPEAT);
    const path = new THREE.Mesh(new THREE.PlaneGeometry(PATH_WIDTH, 300).rotateX(-Math.PI / 2), toonWith({ map: this.path }));
    path.position.set(0, 0.005, -120);
    path.receiveShadow = true;
    scene.add(path);

    // Hills on the far horizon, which don't move.
    const greens = ['#7fcf79', '#74c671', '#8ad684', '#6bbd69'];
    this.hills = [];
    for (let i = 0; i < 16; i += 1) {
      const across = (i / 15 - 0.5) * 340;
      const size = 28 + (i % 4) * 11;
      const hill = new THREE.Mesh(new THREE.SphereGeometry(size, 26, 14), new THREE.MeshToonMaterial({ color: greens[i % 4], gradientMap: toon(), fog: false }));
      this.hills.push(hill);
      hill.scale.y = 0.42 + (i % 3) * 0.08;
      hill.position.set(across, 0, -190 - (i % 3) * 22);
      scene.add(hill);
    }

    this.strips = [buildStrip(), buildStrip()];
    for (const strip of this.strips) {
      strip.receiveShadow = false;
      scene.add(strip);
    }

    const cloudMaterial = new THREE.SpriteMaterial({ map: spriteTexture(SHAPES.puff, 128), color: '#ffffff', opacity: 0.94, transparent: true, depthWrite: false, fog: false });
    this.clouds = [];
    for (let i = 0; i < 9; i += 1) {
      const cloud = new THREE.Sprite(cloudMaterial);
      const size = 18 + (i % 3) * 8;
      cloud.scale.set(size * 1.6, size * 0.8, 1);
      cloud.position.set(-150 + i * 38, 42 + (i % 3) * 14, -210);
      scene.add(cloud);
      this.clouds.push(cloud);
    }
  }

  /**
   * What later levels bring: things to pick up, coins flying, chests, a bubble round the runner, a
   * magnet over its head, falling leaves, and a friend who runs alongside. Most are made as needed.
   */
  buildExtras() {
    const { scene } = this;
    this.coinMap = coinTexture();
    this.gemMap = gemTexture();
    this.pickupMaps = Object.fromEntries(Object.entries(PICKUP_TEXTURES).map(([kind, make]) => [kind, make()]));
    this.springPaint = null;
    this.pickupSprites = new Map(); // By pickup.
    this.chestModels = new Map(); // By chest.
    this.flyers = [];
    this.announced = new Set();
    this.onSeen = null;

    // A bubble round the runner, while the shield lasts. Soft and see-through, so nothing gets brighter.
    this.bubble = new THREE.Mesh(
      new THREE.SphereGeometry(1.15, 32, 20),
      new THREE.MeshBasicMaterial({ color: '#9fdcff', transparent: true, opacity: 0.2, depthWrite: false }),
    );
    this.bubbleRing = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteTexture(SHAPES.bubble, 128), color: '#d8f2ff', transparent: true, opacity: 0.7, depthWrite: false }));
    this.bubbleRing.scale.setScalar(2.5);
    this.bubble.add(this.bubbleRing);
    this.bubble.visible = false;
    scene.add(this.bubble);

    // A magnet over the runner's head, while it lasts.
    this.magnetBadge = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.pickupMaps.magnet, transparent: true, depthWrite: false }));
    this.magnetBadge.scale.setScalar(0.62);
    this.magnetBadge.visible = false;
    scene.add(this.magnetBadge);

    // Falling leaves, in autumn.
    this.leafMap = spriteTexture(SHAPES.leaf, 64);
    this.leaves = Array.from({ length: LEAVES }, (_, index) => {
      const leaf = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.leafMap, color: '#e8923a', transparent: true, depthWrite: false }));
      leaf.scale.setScalar(0.22 + (index % 3) * 0.05);
      leaf.visible = false;
      leaf.userData = { x: between(-LEAF_AREA.across, LEAF_AREA.across), y: between(0.3, LEAF_AREA.high), z: between(-LEAF_AREA.ahead, LEAF_AREA.behind), phase: Math.random() * 6 };
      scene.add(leaf);
      return leaf;
    });

    this.friend = null;
    this.mates = []; // Friends running on their own computers: see setMates.
    this.friendIn = 0; // 0 is out of sight behind, 1 is running alongside.
    this.friendWanted = 0;
  }

  /**
   * Where and when the run is, from its level: a summer's day, autumn, or an autumn sunset. It's chosen
   * as a run starts, and never changes during one. The trees change colour where they stand, rather than
   * being made again, so it costs no time.
   */
  setPlace(name) {
    const place = PLACES[name] ?? PLACES.day;
    const before = PLACES[this.place] ?? PLACES.day;
    this.place = name in PLACES ? name : 'day';
    if (place.sky !== before.sky) {
      this.scene.background.dispose();
      this.scene.background = skyTexture(place.sky);
    }
    this.scene.fog.color.set(place.fog);
    this.skyLight.color.set(place.light[0]);
    this.skyLight.groundColor.set(place.light[1]);
    this.skyLight.intensity = place.light[2];
    this.sun.color.set(place.sun[0]);
    this.sun.intensity = place.sun[1];
    this.hills.forEach((hill, index) => hill.material.color.set(place.hills[index % 4]));
    if (place.trees !== before.trees) {
      for (const strip of this.strips) recolourTrees(strip, before.trees, place.trees);
    }
    this.leaves.forEach((leaf, index) => {
      if (place.leaves) leaf.material.color.set(place.leaves[index % place.leaves.length]);
    });
  }

  /** The stars lying along the path. There's only so many at once, and they're used again. */
  buildStarLines() {
    this.linePaint = new THREE.SpriteMaterial({ map: this.starMap, color: '#ffd23f', transparent: true, fog: false });
    this.lineSprites = Array.from({ length: STARS_SHOWN }, () => {
      const sprite = new THREE.Sprite(this.linePaint);
      sprite.scale.setScalar(0.85);
      sprite.visible = false;
      this.scene.add(sprite);
      return sprite;
    });
  }

  /** Thin lines rushing past on both sides, which get clearer the faster the runner goes. */
  buildStreaks() {
    const paint = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.streakLines = new THREE.InstancedMesh(new THREE.BoxGeometry(0.025, 0.025, 1), paint, STREAKS);
    this.streakLines.frustumCulled = false;
    this.streakSpots = Array.from({ length: STREAKS }, () => ({
      x: (Math.random() < 0.5 ? -1 : 1) * between(STREAK_AREA.near, STREAK_AREA.far),
      y: between(0.3, STREAK_AREA.high),
      z: between(-STREAK_AREA.ahead, STREAK_AREA.behind),
      length: between(1.2, 3.4),
    }));
    this.streakMatrix = new THREE.Matrix4();
    this.scene.add(this.streakLines);
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
    if (snap) {
      const view = this.framing(name);
      this.cameraAt.set(...view.at);
      this.cameraLook.set(...view.look);
      this.camera.fov = view.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Where the camera stands for a view, which is further back in a picture that's taller than it's wide. */
  framing(name) {
    return (this.camera.aspect < 1 && NARROW_VIEWS[name]) || VIEWS[name];
  }

  setRunner(spec) {
    if (this.runner) {
      this.scene.remove(this.runner.body.root);
      this.runner.body.dispose();
    }
    const presenting = this.runner?.presenting ?? true;
    this.runner = new Runner(spec);
    this.runner.presenting = presenting;
    this.runner.facing = presenting ? 0.14 : Math.PI;
    this.runner.onStep = () => this.onStep?.();
    this.scene.add(this.runner.body.root);
  }

  /** The lane the runner should be in, from the child moving across: -1, 0 or 1. */
  setLane(lane) {
    this.lane = lane;
  }

  /** The child's body for the runner to copy, or null when it isn't in the picture. */
  setLive(pose) {
    this.runner.live = pose;
  }

  /** Shows the move was seen, when there's no trail to do it on. */
  hop() {
    this.runner.hopLeft = HOP_SECONDS;
    this.runner.body.setExpression('happy', 1.2);
    this.burst(new THREE.Vector3(this.runnerX - 0.1, 1.2, 0), { shapes: ['star', 'spark'], colours: ['#ffd23f', '#ffffff', '#7ee8ff'], count: 12, speed: 2.4, size: 0.26, life: 0.6, gravity: 2 });
  }

  /** A new run. Whatever was on the trail goes, and the new one's obstacles arrive as they near. */
  setRun(run) {
    for (const obstacle of [...this.items.keys()]) this.retire(obstacle);
    for (const pickup of [...this.pickupSprites.keys()]) this.dropPickup(pickup);
    for (const chest of [...this.chestModels.keys()]) this.dropChest(chest);
    for (const flyer of this.flyers) this.scene.remove(flyer.sprite);
    this.flyers = [];
    this.announced = new Set();
    this.bubble.visible = false;
    this.magnetBadge.visible = false;
    this.friendWanted = 0;
    this.friendIn = 0;
    if (this.friend) this.friend.body.root.visible = false;
    this.run = run;
    // Choosing a runner and practising are on a summer's day, whatever the last run was.
    this.setPlace(run ? run.levelRules.place : 'day');
    if (run?.levelRules.powers.includes('friend')) this.makeFriend();
    this.finishGate.visible = false;
    this.cue.visible = false;
    this.won = false;
    this.lane = 0;
  }

  /* ---------- what's on the trail ---------- */

  arrive(obstacle) {
    const lanes = obstacle.lanes ?? [-1, 0, 1];
    const pool = this.spare.get(this.poolName(obstacle)) ?? [];
    const model = pool.pop() ?? buildObstacle(obstacle.kind, lanes);
    model.visible = true;
    model.rotation.set(0, 0, 0);
    model.position.set(0, 0, 0);
    this.scene.add(model);

    // The painted stretch where a jump counts, under the lanes the obstacle fills. A free lane stays
    // plain path, so from far off it can be seen to be the way round.
    const reach = this.run.reachDistance;
    const zonePaint = new THREE.MeshBasicMaterial({ color: '#2fd16f', map: this.zoneMap.clone(), transparent: true, opacity: 0.62, depthWrite: false });
    zonePaint.map.repeat.set(1, Math.max(1, Math.round(reach / 1.6)));
    zonePaint.map.needsUpdate = true;
    const zone = new THREE.Group();
    const { spring } = obstacle;
    if (lanes.length === 3 && !spring) zone.add(new THREE.Mesh(new THREE.PlaneGeometry(PATH_WIDTH - 0.3, reach).rotateX(-Math.PI / 2), zonePaint));
    else {
      for (const lane of lanes) {
        // A trampoline's lane is a blue mat with a red rim, the same chevrons on it.
        const onMat = spring?.lane === lane;
        const piece = new THREE.Mesh(new THREE.PlaneGeometry(LANE_WIDTH - 0.15, reach).rotateX(-Math.PI / 2), onMat ? this.matPaint(reach) : zonePaint);
        piece.position.x = laneX(lane);
        piece.userData.mat = onMat;
        zone.add(piece);
        if (onMat) {
          const rim = buildMatRim(reach);
          rim.position.x = laneX(lane);
          rim.userData.mat = true;
          zone.add(rim);
        }
      }
    }
    this.scene.add(zone);

    // Over a trampoline, an arch of stars high up in its lane, and at level 10 a gem at its top.
    let arch = null;
    if (spring) {
      const sprites = ARCH_THROUGH.map(() => {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.starMap, color: '#ffd23f', transparent: true }));
        sprite.scale.setScalar(0.7);
        this.scene.add(sprite);
        return sprite;
      });
      let gem = null;
      if (spring.gem) {
        gem = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.gemMap, transparent: true }));
        gem.scale.setScalar(1.25);
        this.scene.add(gem);
      }
      arch = { sprites, gem, taken: ARCH_THROUGH.map(() => false), placed: false, at: null, y: null };
    }

    // Stars to catch, where the child will be if they make the move.
    const stars = [0, 1, 2].map((index) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.starMap, color: '#ffd23f', transparent: true }));
      sprite.scale.setScalar(0.62);
      this.scene.add(sprite);
      return { sprite, index, taken: false, at: obstacle.at + obstacle.length * (index * 0.5), y: obstacle.height + 0.85 + (index === 1 ? 0.28 : 0) };
    });

    let gold = null;
    if (obstacle.gold) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.goldMap, transparent: true }));
      sprite.scale.setScalar(GOLD_SIZE);
      this.scene.add(sprite);
      gold = { sprite, y: obstacle.height + GOLD_ABOVE, done: false };
    }

    this.items.set(obstacle, { model, zone, zonePaint, stars, gold, arch, knocked: 0 });
  }

  /** The painted stretch goes once it's done with. A trampoline's mat stays, as it's really there. */
  hideZone(item) {
    for (const piece of item.zone.children) piece.visible = Boolean(piece.userData.mat);
  }

  /** The paint for a trampoline's mat: blue, with the same chevrons as where a jump counts. */
  matPaint(reach) {
    const paint = new THREE.MeshBasicMaterial({ color: '#3d9cf0', map: this.zoneMap.clone(), transparent: true, opacity: 0.85, depthWrite: false });
    paint.map.repeat.set(1, Math.max(1, Math.round(reach / 1.6)));
    paint.map.needsUpdate = true;
    return paint;
  }

  /** Obstacles are kept to use again, by kind and the lanes they fill. */
  poolName(obstacle) {
    return `${obstacle.kind}:${(obstacle.lanes ?? [-1, 0, 1]).join(',')}`;
  }

  retire(obstacle) {
    const item = this.items.get(obstacle);
    if (!item) return;
    this.scene.remove(item.model);
    const name = this.poolName(obstacle);
    const pool = this.spare.get(name) ?? [];
    pool.push(item.model);
    this.spare.set(name, pool);
    this.scene.remove(item.zone);
    // A trampoline's mat and rim are made for it, so they go with it.
    item.zone.traverse((node) => {
      node.geometry?.dispose();
      if (!node.isMesh || node.material === item.zonePaint) return;
      node.material.map?.dispose();
      node.material.dispose();
    });
    item.zonePaint.map.dispose();
    item.zonePaint.dispose();
    const archSprites = item.arch ? [...item.arch.sprites, ...(item.arch.gem ? [item.arch.gem] : [])] : [];
    for (const sprite of [...item.stars.map(({ sprite: one }) => one), ...(item.gold ? [item.gold.sprite] : []), ...archSprites]) {
      this.scene.remove(sprite);
      sprite.material.dispose();
    }
    this.items.delete(obstacle);
  }

  /** The move counted, so the stars line up along the way it will go. */
  moveCounted({ kind, obstacle, move }) {
    const item = this.items.get(obstacle);
    if (!item) return;
    item.stars.forEach((star) => {
      const through = 0.32 + star.index * 0.19;
      star.at = move.from + move.travel * through;
      star.y = move.height * 4 * through * (1 - through) + 1;
    });
    this.hideZone(item);
    if (item.arch && move.bounce) {
      // The arch's stars go along the bounce, a little above the runner, to be run through on the way.
      item.arch.move = move;
      item.arch.bouncing = true;
      this.burst(new THREE.Vector3(this.runnerX, 0.2, -0.3), { shapes: ['ring', 'spark'], colours: ['#3d9cf0', '#ffffff', '#e8504a'], count: 10, speed: 2.2, size: 0.3, life: 0.5, flat: true });
    }
    // A golden star goes to where the jump will be over the obstacle, so it's caught on the way.
    if (item.gold) {
      const through = Math.min(1, Math.max(0, (obstacle.at + obstacle.length / 2 - move.from) / move.travel));
      item.gold.y = Math.max(obstacle.height + 0.9, move.height * 4 * through * (1 - through) + 1.1);
    }
  }

  /** A golden star caught, in its lane. */
  tookGold(obstacle) {
    const item = this.items.get(obstacle);
    if (!item?.gold) return;
    item.gold.done = true;
    item.gold.sprite.visible = false;
    const at = item.gold.sprite.position.clone();
    this.burst(at, { shapes: ['star', 'spark'], colours: ['#ffb21f', '#ffe27a', '#ffffff'], count: 12, speed: 2.2, size: 0.3, life: 0.55 });
    this.runner.body.setExpression('happy', 1.4);
  }

  moved(kind, counts) {
    this.dust(new THREE.Vector3(this.runnerX, 0.15, 0), counts ? 8 : 5);
    this.runner.body.setExpression('strike', 0.5);
  }

  landed() {
    this.runner.landing = 0.22;
    this.dust(new THREE.Vector3(this.runnerX, 0.15, 0), 7);
  }

  cleared(obstacle, { coin = false } = {}) {
    const item = this.items.get(obstacle);
    if (item) this.hideZone(item);
    // From level 2, a coin pops up out of it and flies to the runner.
    if (coin) this.flyCoin(new THREE.Vector3(this.runnerX, obstacle.height + 0.9, -1.2), { lift: 1.2 });
    this.cue.visible = false;
    this.runner.body.setExpression('happy', 1.2);
  }

  bumped(obstacle) {
    const item = this.items.get(obstacle);
    if (item) item.knocked = 0.001;
    item?.stars.forEach((star) => {
      star.taken = true;
      star.sprite.visible = false;
    });
    this.cue.visible = false;
    this.runner.stumble = 1;
    this.runner.body.setExpression('hurt', 1);
    const at = new THREE.Vector3(this.runnerX, 0.8, -0.8);
    this.sparks.emit({ shape: 'star', colour: '#ffffff', at, velocity: [0, 1, this.run.speed], life: 0.4, size: 0.4, spin: 3 });
    this.burst(at, { shapes: ['puff'], colours: ['#fff8e6', '#ffe9c4'], count: 9, speed: 1.8, size: 0.32, grow: 0.7, life: 0.5, opacity: 0.85 });
  }

  /** A star on the path has been run through. */
  tookStar() {
    this.burst(new THREE.Vector3(this.runnerX, 1.1, -0.2), { shapes: ['spark'], colours: ['#ffd23f', '#ffffff'], count: 3, speed: 1.6, size: 0.18, life: 0.3 });
  }

  /** Out of hearts: the runner slows to a stop, a little dizzy. Nothing bursts or flashes. */
  tumbledOut() {
    this.bubble.visible = false;
    this.magnetBadge.visible = false;
    this.friendWanted = 0;
    this.cue.visible = false;
    this.runner.body.setExpression('dizzy', 3);
  }

  celebrate() {
    // What was on the runner goes, as it turns round to celebrate.
    this.bubble.visible = false;
    this.magnetBadge.visible = false;
    this.friendWanted = 0;
    this.won = true;
    this.runner.presenting = true;
    this.setView('win');
    this.runner.body.setExpression('happy');
  }

  dust(at, count) {
    this.burst(at, { shapes: ['puff'], colours: ['#fff8e6', '#efdcb6'], count, speed: 1.3, size: 0.28, grow: 0.7, life: 0.5, opacity: 0.85, flat: true });
  }

  burst(at, { shapes = ['star'], colours = ['#ffffff'], count = 8, speed = 2, size = 0.24, life = 0.5, gravity = 0, flat = false, grow = 0, opacity = 1 }) {
    const total = Math.max(2, Math.round(count * (this.reducedMotion ? 0.5 : 1)));
    const drift = this.run?.speed ?? 0;
    for (let i = 0; i < total; i += 1) {
      const angle = (i / total) * Math.PI * 2 + Math.random();
      const push = speed * between(0.55, 1.15);
      this.sparks.emit({
        shape: shapes[i % shapes.length],
        colour: colours[i % colours.length],
        at,
        velocity: [Math.cos(angle) * push, (flat ? between(0.1, 0.4) : between(-0.5, 1)) * push, Math.sin(angle) * push + drift * 0.6],
        life: life * between(0.8, 1.2),
        size: size * between(0.75, 1.25),
        grow,
        gravity,
        spin: between(-5, 5),
        opacity,
        drag: flat ? 2.4 : 0.8,
      });
    }
  }

  /* ---------- every frame ---------- */

  /** A slow computer gives up sharpness and then shadows, so that moves still feel immediate. */
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
    const { run } = this;
    const distance = run?.distance ?? 0;

    // Sliding past: a strip covers the trail for its length, and then the next one takes over.
    const shift = distance % STRIP_LENGTH;
    this.strips[0].position.z = shift;
    this.strips[1].position.z = shift - STRIP_LENGTH;
    this.grass.offset.y = (distance / (GRASS_BAND * 2)) % 1;
    this.path.offset.y = (distance / PATH_REPEAT) % 1;

    if (!this.reducedMotion) {
      for (const cloud of this.clouds) {
        cloud.position.x += dt * 0.6;
        if (cloud.position.x > 190) cloud.position.x = -190;
      }
    }

    // Across to the lane the child has moved into. Not on the screens where the runner faces them.
    // In the practice it's a smaller step, as the runner is close up and on the edge of the picture.
    const across = this.view === 'run' ? laneX(this.lane) : this.view === 'practice' ? laneX(this.lane) * 0.45 : 0;
    this.runnerX = damp(this.runnerX, across, LANE_CHANGE_RATE, dt);
    if (Math.abs(this.runnerX - across) < 0.002) this.runnerX = across;
    if (this.runner) this.runner.body.root.position.x = this.runnerX;

    if (run) this.updateTrail(dt, distance);
    this.updateMates(dt);
    this.updateOnRunner(dt);
    this.updateLeaves(dt);
    this.updateStarLines(distance);
    this.updateStreaks(dt);
    this.sparks.update(dt);
    if (this.runner) {
      this.runner.update(dt, run
        ? {
            speed: run.speed,
            top: run.settings.speed,
            height: run.air.height,
            through: run.air.through,
            jumping: run.move?.kind === 'jump',
            waiting: run.waiting,
            won: this.won,
          }
        : {}, this.reducedMotion);
    }
    this.updateCamera(dt);
  }

  updateTrail(dt, distance) {
    const { run } = this;

    for (const obstacle of run.course) {
      const ahead = obstacle.at - distance;
      let item = this.items.get(obstacle);
      if (!item) {
        if (ahead >= SEEN_AHEAD || ahead <= -SEEN_BEHIND) continue;
        // Put in its place before it's drawn, or it would show for a moment where the runner is.
        this.arrive(obstacle);
        item = this.items.get(obstacle);
      }
      if (ahead < -SEEN_BEHIND) {
        this.retire(obstacle);
        continue;
      }
      const reach = run.reachDistance;
      item.model.position.z = -ahead;
      if (obstacle.kind === 'bale') this.rollBale(item, ahead, reach);
      if (obstacle.kind === 'sheep') this.mill(item);
      if (obstacle.kind === 'ducks') this.waddle(item, obstacle, ahead, reach);
      // Only once the run is going, as that's when it can be pointed out: not in the countdown.
      if (ahead < ANNOUNCE_AHEAD && !item.announced && run.state === 'running') {
        item.announced = true;
        this.seen(obstacle.kind);
        if (obstacle.gold) this.seen('gold');
        if (obstacle.spring) this.seen('spring');
        if (obstacle.spring?.gem) this.seen('gems');
      }
      if (item.arch && obstacle.spring) this.updateArch(item, obstacle, ahead, distance, dt);
      if (item.knocked > 0) {
        // Knocked aside, and out of the way. Sheep trot off and ducks waddle off: nothing knocks them over.
        item.knocked = Math.min(1, item.knocked + dt * 2.2);
        const eased = item.knocked * (2 - item.knocked);
        const animals = obstacle.kind === 'sheep' || obstacle.kind === 'ducks';
        // A stream stays where it is: the runner has splashed through it. Slid aside and tipped like a log, the
        // whole band of water stood up in front of the camera, and darkened the picture all at once.
        if (obstacle.kind !== 'stream') {
          item.model.position.x = eased * 7 * (obstacle.kind === 'ducks' ? ducksAway(obstacle) : 1);
          item.model.rotation.z = animals ? 0 : -eased * 0.5;
        }
      }
      if (item.gold && !item.gold.done) {
        const { sprite } = item.gold;
        const bob = this.reducedMotion ? 0 : Math.sin(this.time * 2.6 + obstacle.index) * 0.12;
        // It glides, rather than jumps, to the height of the jump once one counts.
        const y = item.gold.placed ? damp(sprite.position.y, item.gold.y + bob, 6, dt) : item.gold.y + bob;
        item.gold.placed = true;
        sprite.position.set(laneX(obstacle.gold.lane), y, -ahead);
        sprite.material.rotation = this.reducedMotion ? 0 : Math.sin(this.time * 1.8 + obstacle.index) * 0.2;
        // Missed costs nothing: it stays where it was, a little paler, and goes by, fading before the camera.
        this.fadeNearCamera(sprite, obstacle.gold.missed ? 0.45 : 1);
      }
      item.zone.position.set(0, 0.03, -ahead + reach / 2);
      if (obstacle.state === 'ahead' && ahead <= reach) item.zonePaint.opacity = 0.82;

      for (const star of item.stars) {
        if (star.taken) continue;
        const bob = this.reducedMotion ? 0 : Math.sin(this.time * 3 + star.index) * 0.08;
        star.sprite.position.set(this.runnerX, star.y + bob, -(star.at - distance));
        star.sprite.material.rotation = this.reducedMotion ? 0 : Math.sin(this.time * 2 + star.index) * 0.3;
        if (distance >= star.at && obstacle.state !== 'ahead') {
          star.taken = true;
          star.sprite.visible = false;
          this.burst(new THREE.Vector3(this.runnerX, star.y, 0), { shapes: ['spark', 'star'], colours: ['#ffd23f', '#ffffff'], count: 6, speed: 1.6, size: 0.2, life: 0.42 });
          this.onStar?.();
        }
      }
    }

    // The arrow over what's next, once a jump would count and it's in the runner's lane.
    const next = run.next;
    const asking = run.mustJump;
    this.cue.visible = Boolean(asking);
    if (asking) {
      this.cue.material.map = this.arrows[next.needs];
      const bob = this.reducedMotion ? 0 : Math.sin(this.time * 6) * 0.14;
      this.cue.position.set(this.runnerX, next.height + 1.9 + bob, -(next.at - distance));
    }

    this.updatePickups(distance);
    this.updateChests(distance, dt);

    const gateAhead = run.end - distance;
    this.finishGate.visible = gateAhead < SEEN_AHEAD && gateAhead > -SEEN_BEHIND;
    this.finishGate.position.z = -gateAhead;
  }

  /** A round bale rolls in from further off, faster than the trail, and comes to rest. */
  rollBale(item, ahead, reach) {
    const { rolling } = item.model.userData;
    const still = this.reducedMotion || item.knocked > 0;
    const further = still ? 0 : Math.max(0, ahead - reach - BALE_STOPS_SHORT) * BALE_ROLLS;
    item.model.position.z = -(ahead + further);
    rolling.rotation.x = -further / BALE_RADIUS;
  }

  /**
   * Ducks waddle in from the side as they come, and settle in their lane before the painted stretch. If
   * the runner comes on without jumping, they waddle off out of the way, rather than being run into.
   */
  waddle(item, obstacle, ahead, reach) {
    const { walking, ducks } = item.model.userData;
    const leaving = item.knocked > 0;
    const from = obstacle.index % 2 ? 1 : -1;
    const left = this.reducedMotion || leaving ? 0 : Math.min(3.2, Math.max(0, ahead - reach - BALE_STOPS_SHORT) * 0.12);
    walking.position.x = left > 0 ? from * left : 0;
    // Which way they're going: in from their side, or off out of the way.
    const towards = leaving ? ducksAway(obstacle) : -from;
    const going = left > 0 || leaving;
    const wobble = going && !this.reducedMotion;
    for (const duck of ducks) {
      const { phase } = duck.userData;
      // Facing the way they walk, and then the runner once they've stopped.
      duck.rotation.y = going ? (towards > 0 ? 0 : Math.PI) : -Math.PI / 2;
      duck.rotation.z = wobble ? Math.sin(this.time * 9 + phase) * 0.14 : 0;
      duck.position.y = wobble ? Math.abs(Math.sin(this.time * 9 + phase)) * 0.04 : 0;
    }
  }

  /** Something new for this level has come into view, once a run. */
  seen(id) {
    // Not in the countdown, when it couldn't be pointed out: it's as the run goes that it counts.
    if (this.announced.has(id) || this.run?.state !== 'running') return;
    this.announced.add(id);
    this.onSeen?.(id);
  }

  /** The arch of stars over a trampoline: high in its lane until a bounce, then along the bounce. */
  updateArch(item, obstacle, ahead, distance, dt) {
    const { arch } = item;
    const { spring } = obstacle;
    const all = [...arch.sprites, ...(arch.gem ? [arch.gem] : [])];
    if (arch.bouncing) {
      const { move } = arch;
      ARCH_THROUGH.forEach((through, index) => {
        const sprite = arch.sprites[index];
        if (arch.taken[index]) return;
        const at = move.from + move.travel * through;
        const y = move.height * 4 * through * (1 - through) + 1.6;
        sprite.position.set(this.runnerX, damp(sprite.position.y, y, 8, dt), -(at - distance));
        if (distance >= at) {
          arch.taken[index] = true;
          sprite.visible = false;
          this.burst(new THREE.Vector3(this.runnerX, y, 0), { shapes: ['spark', 'star'], colours: ['#ffd23f', '#ffffff'], count: 5, speed: 1.5, size: 0.2, life: 0.4 });
          this.onStar?.();
        }
      });
      if (arch.gem && !arch.gemTaken) {
        const at = move.from + move.travel * 0.5;
        arch.gem.position.set(this.runnerX, damp(arch.gem.position.y, move.height + 2.3, 8, dt), -(at - distance));
        if (distance >= at) {
          arch.gemTaken = true;
          arch.gem.visible = false;
          this.burst(new THREE.Vector3(this.runnerX, move.height + 2.3, 0), { shapes: ['spark', 'star'], colours: ['#3fc7d9', '#a6f0f7', '#ffffff'], count: 12, speed: 2.2, size: 0.3, life: 0.55 });
        }
      }
      return;
    }
    // Waiting over the obstacle, in the trampoline's lane: an arch higher than any ordinary jump.
    const x = laneX(spring.lane);
    const span = obstacle.length + 9;
    ARCH_THROUGH.forEach((through, index) => {
      const bob = this.reducedMotion ? 0 : Math.sin(this.time * 3 + index) * 0.08;
      arch.sprites[index].position.set(x, obstacle.height + 1.4 + 4 * 1.5 * through * (1 - through) + bob, -(ahead - 6 + span * through));
    });
    if (arch.gem) arch.gem.position.set(x, obstacle.height + 3.3, -(ahead - 6 + span * 0.5));
    // Missed costs nothing: they go a little paler, and go by. An arch is as high as the camera, so it
    // fades as it nears it, rather than sweeping right across the lens.
    for (const sprite of all) this.fadeNearCamera(sprite, spring.missed ? 0.4 : 1);
  }

  /**
   * Shows a sprite at this opacity, less of it the nearer it is to the camera and none of it close by, so
   * something left behind on the trail never goes right past the lens.
   */
  fadeNearCamera(sprite, opacity = 1) {
    const away = sprite.position.distanceTo(this.camera.position);
    const shown = clamp((away - NEAR_CAMERA.gone) / (NEAR_CAMERA.full - NEAR_CAMERA.gone), 0, 1);
    sprite.material.opacity = opacity * shown;
    sprite.visible = shown > 0.01;
  }

  /** Power-ups and keys on the line of stars: shown as they come, gone once picked up or gone by. */
  updatePickups(distance) {
    const { run } = this;
    for (const pickup of run.pickups) {
      const ahead = pickup.at - distance;
      let sprite = this.pickupSprites.get(pickup);
      // A friend has no badge: they just come running up.
      if (pickup.lane === null) continue;
      if (!sprite) {
        if (pickup.taken || ahead > STARS_SEEN_AHEAD || ahead < -SEEN_BEHIND) continue;
        sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.pickupMaps[pickup.kind], transparent: true }));
        sprite.scale.setScalar(PICKUP_SIZE);
        this.scene.add(sprite);
        this.pickupSprites.set(pickup, sprite);
      }
      if (pickup.taken || ahead < -SEEN_BEHIND) {
        this.dropPickup(pickup);
        continue;
      }
      if (ahead < ANNOUNCE_AHEAD) this.seen(pickup.kind);
      const bob = this.reducedMotion ? 0 : Math.sin(this.time * 3.4 + pickup.at) * 0.12;
      sprite.position.set(laneX(pickup.lane), 1.5 + bob, -ahead);
      // One missed in another lane goes by paler, and fades before it reaches the camera.
      this.fadeNearCamera(sprite, pickup.missed ? 0.4 : 1);
    }
  }

  dropPickup(pickup) {
    const sprite = this.pickupSprites.get(pickup);
    if (!sprite) return;
    this.scene.remove(sprite);
    sprite.material.dispose();
    this.pickupSprites.delete(pickup);
  }

  /** Picked up: a little burst where it was, and the runner is pleased. */
  tookPickup(pickup) {
    const sprite = this.pickupSprites.get(pickup);
    const at = sprite ? sprite.position.clone() : new THREE.Vector3(this.runnerX, 1.5, 0);
    const colours = { magnet: ['#e8504a', '#ffffff'], shield: ['#9fdcff', '#ffffff'], key: ['#ffc21f', '#ffffff'] }[pickup.kind] ?? ['#ffd23f', '#ffffff'];
    this.burst(at, { shapes: ['spark', 'star'], colours, count: 10, speed: 2, size: 0.26, life: 0.5 });
    this.dropPickup(pickup);
    this.runner.body.setExpression('happy', 1.2);
  }

  /** Chests beside the trail. One with a key to open it opens as it's passed, and coins fly out. */
  updateChests(distance, dt) {
    for (const chest of this.run.chests) {
      const ahead = chest.at - distance;
      let model = this.chestModels.get(chest);
      if (!model) {
        if (ahead > SEEN_AHEAD || ahead < -SEEN_BEHIND) continue;
        model = buildChest();
        model.scale.setScalar(1.35);
        model.rotation.y = -chest.side * Math.PI / 2;
        model.userData.opening = 0;
        this.scene.add(model);
        this.chestModels.set(chest, model);
      }
      if (ahead < -SEEN_BEHIND) {
        this.dropChest(chest);
        continue;
      }
      if (ahead < ANNOUNCE_AHEAD) this.seen('key');
      model.position.set(chest.side * CHEST_X, 0, -ahead);
      if (chest.opened) model.userData.opening = Math.min(1, model.userData.opening + dt * 2.5);
      model.userData.lid.rotation.x = -model.userData.opening * 1.9;
    }
  }

  dropChest(chest) {
    const model = this.chestModels.get(chest);
    if (!model) return;
    this.scene.remove(model);
    model.traverse((node) => {
      node.geometry?.dispose();
      if (node.isMesh) node.material.dispose();
    });
    this.chestModels.delete(chest);
  }

  /** A chest opened: coins fly out of it to the runner. */
  openedChest(chest, coins) {
    const model = this.chestModels.get(chest);
    const from = model ? model.position.clone().add(new THREE.Vector3(0, 0.8, 0)) : new THREE.Vector3(chest.side * CHEST_X, 0.8, 0);
    const shown = Math.min(coins, this.reducedMotion ? 3 : 6);
    for (let i = 0; i < shown; i += 1) this.flyCoin(from, { delay: i * 0.08, lift: 1.6 + (i % 3) * 0.4 });
    this.burst(from, { shapes: ['star', 'spark'], colours: ['#ffcc2e', '#ffffff', '#ffb21f'], count: 12, speed: 2.4, size: 0.28, life: 0.6 });
  }

  /** A coin flies from where it was won to just over the runner, and is gone. */
  flyCoin(from, { delay = 0, lift = 1.4, map = this.coinMap, size = 0.62 } = {}) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthTest: false }));
    sprite.scale.setScalar(size);
    sprite.renderOrder = 4;
    sprite.visible = false;
    sprite.position.copy(from);
    this.scene.add(sprite);
    this.flyers.push({ sprite, from: from.clone(), lift, t: -delay, lasts: 0.6, size });
  }

  updateFlyers(dt) {
    const runner = new THREE.Vector3(this.runnerX, 2.4 + (this.run?.air.height ?? 0), 0.2);
    this.flyers = this.flyers.filter((flyer) => {
      flyer.t += dt;
      if (flyer.t < 0) return true;
      const share = Math.min(1, flyer.t / flyer.lasts);
      const eased = share * (2 - share);
      flyer.sprite.visible = true;
      flyer.sprite.position.lerpVectors(flyer.from, runner, eased);
      flyer.sprite.position.y += Math.sin(share * Math.PI) * flyer.lift;
      flyer.sprite.scale.setScalar(flyer.size * (1 - share * 0.35));
      if (share < 1) return true;
      this.scene.remove(flyer.sprite);
      flyer.sprite.material.dispose();
      return false;
    });
  }

  /** A star pulled in from another lane by the magnet. */
  pulledStar(lane) {
    this.flyCoin(new THREE.Vector3(laneX(lane), 1.25, -0.4), { map: this.starMap, size: 0.7, lift: 0.4 });
  }

  /* ---------- friends, each running on their own computer ---------- */

  /** Friends' runners, one for each friend running, as the characters they chose. */
  setMates(specs) {
    for (const mate of this.mates) {
      this.scene.remove(mate.runner.body.root);
      mate.runner.body.dispose();
    }
    this.mates = specs.map((spec) => {
      const runner = new Runner(spec);
      // A little smaller than the child's own runner, which stays the one that stands out.
      runner.body.root.scale.setScalar(MATE_SIZE);
      runner.body.root.visible = false;
      this.scene.add(runner.body.root);
      return { spec, runner, x: 0, z: 0, bumps: 0, where: null, shown: false, ahead: 0 };
    });
  }

  /**
   * Where each friend is, from what their game says: { d, x, y, s, j, w, b, live } for how far along, how far
   * across and how high, how fast, whether jumping or waiting, how many times they've stumbled, and their
   * body to copy, or null when it's not known.
   */
  placeMates(wheres) {
    this.mates.forEach((mate, index) => {
      mate.where = wheres[index] ?? null;
    });
  }

  /**
   * Each friend's runner, on the same trail, as far ahead as they really are. One just behind is shown at the
   * child's runner's shoulder, never between it and the camera, and one level with it, in its lane, a step to
   * the side, so both are always seen.
   */
  updateMates(dt) {
    const { run } = this;
    for (const mate of this.mates) {
      const { where } = mate;
      const { root } = mate.runner.body;
      mate.ahead = where && run ? where.d - run.distance : 0;
      // Two in one picture (core/one-picture.js): one behind is always at the shoulder, as it's that player's own
      // runner, which they have to see.
      const near = mate.ahead > -MATE_BEHIND || Boolean(SEAT?.onePicture);
      mate.shown = Boolean(this.view === 'run' && where && near && mate.ahead < SEEN_AHEAD);
      root.visible = mate.shown;
      if (!mate.shown) continue;
      let x = where.x;
      if (mate.ahead < MATE_NEAR && Math.abs(x - this.runnerX) < LANE_WIDTH * 0.75) x = this.runnerX + (this.runnerX > 0 ? -1 : 1) * MATE_ASIDE;
      mate.x = damp(mate.x, x, 10, dt);
      mate.z = -Math.max(mate.ahead, MATE_SHOULDER);
      root.position.set(mate.x, 0, mate.z);
      if (where.b > mate.bumps) {
        mate.runner.stumble = 1;
        mate.runner.body.setExpression('hurt', 1);
      }
      mate.bumps = where.b;
      mate.runner.live = where.live ?? null;
      mate.runner.update(dt, { speed: where.s, top: run.settings.speed, height: where.y, through: where.j ? 0.4 : 0, jumping: Boolean(where.j), waiting: Boolean(where.w) }, this.reducedMotion);
    }
  }

  /** Where a point on the trail is on the screen, for a friend's name over their runner. */
  project(x, y, z) {
    const at = (this.projecting ??= new THREE.Vector3()).set(x, y, z);
    at.project(this.camera);
    return { x: ((at.x + 1) / 2) * window.innerWidth, y: ((1 - at.y) / 2) * window.innerHeight, behind: at.z > 1 };
  }

  /** The runner's friend, who runs alongside on the grass from level 9: Giraffe, or Truffle if Giraffe is running. */
  makeFriend() {
    const id = this.runner?.spec.id === 'giraffe' ? 'truffle' : 'giraffe';
    if (this.friend?.spec.id === id) return;
    if (this.friend) {
      this.scene.remove(this.friend.body.root);
      this.friend.body.dispose();
    }
    this.friend = new Runner(ROSTER.find((spec) => spec.id === id));
    this.friend.body.root.scale.setScalar(0.85);
    this.friend.body.root.visible = false;
    this.scene.add(this.friend.body.root);
  }

  /** The friend comes running up, or runs on ahead. */
  setFriend(on) {
    this.friendWanted = on ? 1 : 0;
    if (on) this.friend?.body.setExpression('happy', 2);
  }

  updateFriend(dt) {
    const { friend, run } = this;
    if (!friend) return;
    this.friendIn = damp(this.friendIn, this.friendWanted, 2.2, dt);
    const shown = this.view === 'run' && run && this.friendIn > 0.01;
    friend.body.root.visible = Boolean(shown);
    if (!shown) return;
    // From behind to alongside, and on ahead when it's time to go.
    const z = this.friendWanted ? (1 - this.friendIn) * 7 : -(1 - this.friendIn) * 30;
    // A little ahead, so it's beside the runner on the screen and clear of the child's picture.
    friend.body.root.position.set(-(OUT + 0.4), 0, z - 3.2);
    // A chest on the friend's side of the trail is hopped over, rather than run through.
    let hop = 0;
    for (const [chest, model] of this.chestModels) {
      const off = Math.abs(model.position.z - friend.body.root.position.z);
      if (chest.side < 0 && off < FRIEND_HOP.reach) hop = Math.max(hop, FRIEND_HOP.high * Math.cos((off / FRIEND_HOP.reach) * (Math.PI / 2)));
    }
    const jumping = run.move?.kind === 'jump' || hop > 0;
    const height = Math.max(run.air.height * 0.8, hop);
    friend.update(dt, { speed: run.speed, top: run.settings.speed, height, through: run.move ? run.air.through : 0.3, jumping }, this.reducedMotion);
  }

  /** A star the friend caught, alongside. */
  friendCaught() {
    if (!this.friend?.body.root.visible) return;
    const at = this.friend.body.root.position.clone().add(new THREE.Vector3(0, 1.6, 0));
    this.burst(at, { shapes: ['spark'], colours: ['#ffd23f', '#ffffff'], count: 3, speed: 1.4, size: 0.18, life: 0.3 });
  }

  /** Power-ups show on the runner while they last: a bubble round it, a magnet over its head. */
  setPower(kind, on) {
    if (kind === 'shield') this.bubble.visible = on;
    if (kind === 'magnet') this.magnetBadge.visible = on;
    if (kind === 'friend') this.setFriend(on);
  }

  /** The bubble pops softly as it floats the runner over. */
  popBubble() {
    const at = this.bubble.position.clone();
    this.bubble.visible = false;
    this.burst(at, { shapes: ['bubble'], colours: ['#d8f2ff', '#9fdcff'], count: 10, speed: 2, size: 0.32, life: 0.55 });
  }

  updateOnRunner(dt) {
    const height = this.run?.air.height ?? 0;
    if (this.bubble.visible) {
      const wobble = this.reducedMotion ? 1 : 1 + Math.sin(this.time * 3) * 0.03;
      this.bubble.position.set(this.runnerX, 1.05 + height, 0);
      this.bubble.scale.set(wobble, 2 - wobble, wobble);
    }
    if (this.magnetBadge.visible) {
      const bob = this.reducedMotion ? 0 : Math.sin(this.time * 4) * 0.08;
      this.magnetBadge.position.set(this.runnerX, 2.85 + height + bob, 0);
    }
    this.updateFlyers(dt);
    this.updateFriend(dt);
  }

  /** Leaves drifting down past the runner, in autumn. Few, small and slow, and none with reduced motion. */
  updateLeaves(dt) {
    const falling = Boolean(PLACES[this.place].leaves) && this.view === 'run' && !this.reducedMotion;
    const speed = this.run?.speed ?? 0;
    for (const leaf of this.leaves) {
      leaf.visible = falling;
      if (!falling) continue;
      const spot = leaf.userData;
      spot.z += (speed + 0.6) * dt;
      spot.y -= 0.55 * dt;
      if (spot.z > LEAF_AREA.behind || spot.y < 0.05) {
        spot.z = -LEAF_AREA.ahead + Math.random() * 8;
        spot.y = between(2.5, LEAF_AREA.high);
        spot.x = between(-LEAF_AREA.across, LEAF_AREA.across);
      }
      leaf.position.set(spot.x + Math.sin(this.time * 1.3 + spot.phase) * 0.5, spot.y, spot.z);
      leaf.material.rotation = Math.sin(this.time * 1.7 + spot.phase) * 0.8;
      // The ones that come near the camera fade away first, so none goes right past the lens.
      this.fadeNearCamera(leaf);
    }
  }

  /** Sheep milling about as they cross, nodding as they go. */
  mill(item) {
    if (this.reducedMotion) return;
    for (const sheep of item.model.userData.sheep) {
      const { phase } = sheep.userData;
      sheep.position.y = Math.abs(Math.sin(this.time * 5 + phase)) * 0.05;
      sheep.rotation.z = Math.sin(this.time * 2.5 + phase) * 0.04;
    }
    if (item.knocked === 0) item.model.position.x = Math.sin(this.time * 0.7) * 0.3;
  }

  updateStarLines(distance) {
    const { run, lineSprites } = this;
    let used = 0;
    if (run && this.view === 'run') {
      for (let i = run.nextStar; i < run.starLines.length && used < lineSprites.length; i += 1) {
        const ahead = run.starLines[i].at - distance;
        if (ahead > STARS_SEEN_AHEAD) break;
        // A friend got to it first.
        if (run.starLines[i].gone) continue;
        if (run.starLines[i].crosses && ahead < ANNOUNCE_AHEAD) this.seen('zigzag');
        const bob = this.reducedMotion ? 0 : Math.sin(this.time * 4 + i * 0.7) * 0.1;
        lineSprites[used].position.set(laneX(run.starLines[i].lane ?? 0), 1.25 + bob, -ahead);
        lineSprites[used].visible = true;
        used += 1;
      }
      this.linePaint.rotation = this.reducedMotion ? 0 : Math.sin(this.time * 3) * 0.35;
    }
    for (let i = used; i < lineSprites.length; i += 1) lineSprites[i].visible = false;
  }

  updateStreaks(dt) {
    const { run, streakLines, streakSpots, streakMatrix } = this;
    const speed = this.view === 'run' ? run?.speed ?? 0 : 0;
    const wanted = this.reducedMotion ? 0 : clamp((speed - 6) / 26, 0, 1) * 0.5;
    const paint = streakLines.material;
    paint.opacity = damp(paint.opacity, wanted, 4, dt);
    streakLines.visible = paint.opacity > 0.01;
    if (!streakLines.visible) return;
    streakSpots.forEach((spot, index) => {
      spot.z += speed * 2 * dt;
      if (spot.z > STREAK_AREA.behind) spot.z -= STREAK_AREA.ahead + STREAK_AREA.behind;
      streakMatrix.makeScale(1, 1, spot.length * (0.5 + speed / 16));
      streakMatrix.setPosition(spot.x, spot.y, spot.z);
      streakLines.setMatrixAt(index, streakMatrix);
    });
    streakLines.instanceMatrix.needsUpdate = true;
  }

  /** The view widens as the runner goes faster than its usual speed, in a dash. */
  wantedFov(view) {
    const { run } = this;
    if (this.view !== 'run' || !run || this.reducedMotion) return view.fov;
    const { speed } = run.settings;
    return view.fov + clamp((run.speed - speed) / speed, 0, 1) * DASH_FOV;
  }

  updateCamera(dt) {
    const view = this.framing(this.view);
    const rate = this.view === 'run' ? 3.2 : 2.2;
    // In a run, the camera goes some of the way across with the runner, so all three lanes stay in view.
    const follow = this.view === 'run' ? this.runnerX * CAMERA_FOLLOWS : 0;
    this.cameraAt.x = damp(this.cameraAt.x, view.at[0] + follow, rate, dt);
    // It rises a little with a jump, and more with a bounce off a trampoline, to keep the runner in view.
    // With reduced motion, a bounce moves it no more than a jump does, which still keeps the runner in view.
    const bouncing = this.view === 'run' && Boolean(this.run?.move?.bounce) && !this.reducedMotion;
    const rising = this.view === 'run' ? (this.run?.air.height ?? 0) * (bouncing ? 0.6 : 0.14) : 0;
    this.cameraAt.y = damp(this.cameraAt.y, view.at[1] + rising, rate, dt);
    this.cameraAt.z = damp(this.cameraAt.z, view.at[2], rate, dt);
    this.cameraLook.x = damp(this.cameraLook.x, view.look[0] + follow, rate, dt);
    this.cameraLook.y = damp(this.cameraLook.y, view.look[1] + (bouncing ? rising : 0), rate, dt);
    this.cameraLook.z = damp(this.cameraLook.z, view.look[2], rate, dt);
    const fov = damp(this.camera.fov, this.wantedFov(view), rate, dt);
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
