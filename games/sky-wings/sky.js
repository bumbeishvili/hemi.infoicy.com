// The picture of a dogfight: the island below, the child's plane, the sky pirates, and the shots
// between them. The camera sits behind the plane and looks the way it points, so climbing, diving and
// banking all move the whole world, and the middle of the picture is where the guns are aimed.
//
// Nothing flashes or strobes: seizures are more common in children with hemiplegia. A hit is a few
// small shapes where it happened, a plane that's dropped falls away in soft grey smoke, and the picture
// itself never changes brightness.
import * as THREE from '../../vendor/three/three.module.js';
import { ball, Fighter3D, makePose, mergeParts, outlineMaterial, roundedBox, star, toon } from '../../core/body/characters.js';
import { Sparks, spriteTexture } from '../../core/body/sparks.js';
import { LEVELS } from './flight.js';
import { Island, SKIES } from './island.js';
import { floorAt, heightAt } from './island-map.js';

const SLOW_FRAME_SECONDS = 1 / 40;
const SLOW_CHECK_FRAMES = 90;
const PILOT_SIZE = 0.8;
const ENEMY_SIZE = 1.8; // Bigger than life, so that they can be seen from further away.
const CAPTAIN_SIZE = 1.4; // The pirate captain's plane, on the higher levels, as a share of that.
const TRACERS = 70;
const TRACER_LENGTH = 10;
const FLY_FOV = 62;
const CAMERA_ROLL = 0.5; // How much of the plane's bank the camera shares, so the horizon tips.
const SMOKE_EVERY = { damaged: 0.2, falling: 0.07 };
const CHUTE_SECONDS = 7;
const CHUTE_FALL = 9;
// How big each kind of pirate is, as a share of ENEMY_SIZE.
const KIND_SIZE = { scout: 0.72, captain: CAPTAIN_SIZE };
const BUBBLES = 24;
const PAPERS = 16;
const SNOWFLAKES = 420;
const SNOW_BOX = 320; // The flakes fill a box this big round the camera, and wrap round it.
// How big a snowflake is on the screen, in pixels, however near or far it is, so that one the plane
// flies past is never any bigger.
const SNOWFLAKE_PIXELS = 5;
const SHIELD_RADIUS = 5.4;
// What each power's gift box looks like, and the colour of what it fires.
const GIFT_COLOURS = {
  triple: ['#ff9f43', '#fff1c1'],
  bubble: ['#5cc8ff', '#ffffff'],
  snow: ['#b8e6ff', '#3b82f6'],
  shield: ['#4f86f7', '#ffd23f'],
  helper: ['#ffd23f', '#7ac74f'],
  paper: ['#f6f1e4', '#ff5a4f'],
};
// Each time of day's light and haze. The sun is never dimmer than the day's.
const WEATHER = {
  day: { fog: '#dff4ff', sky: '#ffffff', ground: '#9fbf9a', sun: '#fff3dc' },
  sunset: { fog: '#ffe3bd', sky: '#fff0e0', ground: '#b3a58e', sun: '#ffcf9c' },
  snow: { fog: '#eef4fa', sky: '#ffffff', ground: '#c1cdc8', sun: '#f2f7ff' },
};

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const damp = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));
const between = (low, high) => low + Math.random() * (high - low);

// Where the plane waits while choosing a pilot and learning to fly, with the island behind it.
const SHOWCASE = { x: 30, y: 150, z: 700 };
// The camera, away from the plane, and where it looks, also from the plane.
const VIEWS = {
  choose: { at: [0, 2.6, 17], look: [0, 0.1, 0], fov: 30 },
  lesson: { at: [-7.2, 3.4, 22], look: [-7.2, 0.8, 0], fov: 34 },
  fly: { fov: FLY_FOV },
  win: { at: [9, 3.5, 13], look: [0, 0.5, 0], fov: 40 },
};
// The same, for a picture taller than it is wide, as a seat on the split screen is: the plane from further away
// and in the middle, as there's no room beside the panels: between the pilot's name and the pilots to choose
// from, and below the child's own picture and the coach's film in the lesson.
const NARROW_VIEWS = {
  ...VIEWS,
  choose: { at: [0, 4.5, 30], look: [0, -0.8, 0], fov: 30 },
  lesson: { at: [0, 3.6, 22], look: [0, 2.6, 0], fov: 34 },
};

/** A toy plane with the character sitting in it, whose arms can copy the child's. */
class Plane {
  constructor(spec) {
    this.spec = spec;
    this.root = new THREE.Group();
    const { colours, burstColours } = spec;
    const main = colours.pants ?? colours.body;
    const wing = burstColours[0];
    const trim = burstColours[1] ?? wing;

    const body = mergeParts([
      { geometry: ball(0.74, 0.72, 2.3), colour: main },
      { geometry: ball(0.42, 0.42, 0.5), colour: '#f7f2e6', at: [0, 0, -2.15] },
      { geometry: roundedBox(7.4, 0.2, 1.55, 0.09), colour: wing, at: [0, -0.15, -0.3] },
      { geometry: roundedBox(0.7, 0.24, 1.6, 0.09), colour: trim, at: [3.4, -0.15, -0.3] },
      { geometry: roundedBox(0.7, 0.24, 1.6, 0.09), colour: trim, at: [-3.4, -0.15, -0.3] },
      { geometry: roundedBox(2.7, 0.15, 0.85, 0.06), colour: wing, at: [0, 0.12, 2.05] },
      { geometry: roundedBox(0.17, 1.15, 0.95, 0.07), colour: trim, at: [0, 0.72, 2.05] },
    ]);
    const paint = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon() });
    const outline = outlineMaterial(colours.ink, 0.03);
    this.root.add(new THREE.Mesh(body, paint), new THREE.Mesh(body, outline));

    const bladeShape = roundedBox(2.5, 0.2, 0.06, 0.02);
    const blades = new THREE.MeshToonMaterial({ color: '#3a3a44', gradientMap: toon() });
    this.propeller = new THREE.Group();
    this.propeller.position.set(0, 0, -2.66);
    this.propeller.add(new THREE.Mesh(bladeShape, blades));
    const second = new THREE.Mesh(bladeShape, blades);
    second.rotation.z = Math.PI / 2;
    this.propeller.add(second);
    this.root.add(this.propeller);

    // The pirate captain's flag, on the tail, only shown on the captain's plane.
    this.flag = new THREE.Group();
    const flagPaint = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon(), side: THREE.DoubleSide });
    this.flag.add(new THREE.Mesh(mergeParts([
      { geometry: new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6), colour: '#5a4632', at: [0, 0.75, 0] },
      { geometry: new THREE.BoxGeometry(0.04, 0.7, 1.05), colour: '#26283a', at: [0, 1.15, 0.55] },
      { geometry: ball(0.2, 0.2, 0.05).rotateY(Math.PI / 2), colour: '#ffd23f', at: [0.03, 1.15, 0.55] },
    ]), flagPaint));
    this.flag.position.set(0, 1.25, 2.1);
    this.flag.visible = false;
    this.root.add(this.flag);
    this.bubble = buildBubble(5.2);
    this.root.add(this.bubble);

    this.pilot = new Fighter3D(spec);
    this.pilot.faceTowards(Math.PI);
    this.pilot.root.scale.setScalar(PILOT_SIZE);
    this.pilot.root.position.set(0, -0.02, -0.25);
    this.pilot.setExpression('happy');
    this.root.add(this.pilot.root);
    this.pose = makePose();
    Object.assign(this.pose, { handLX: 0.72, handLY: -0.45, handLZ: 0.25, handRX: -0.72, handRY: -0.45, handRZ: 0.25 });
    this.pilot.setPose(this.pose);

    this.roll = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.wobble = 0;
    this.time = Math.random() * 6;
  }

  /** dt, how fast the propeller goes, and which way the plane points. arms is the child's pose. */
  update(dt, { spin = 1, heading = 0, pitch = 0, roll = 0, arms = null }) {
    this.time += dt;
    this.propeller.rotation.z += dt * 30 * spin;
    const wobble = this.wobble > 0 ? Math.sin(this.time * 11) * 0.5 * clamp(this.wobble, 0, 1) : 0;
    this.root.rotation.set(pitch, -heading, -roll + wobble, 'YXZ');
    if (arms) {
      for (const key of ['handLX', 'handLY', 'handLZ', 'handRX', 'handRY', 'handRZ', 'wristL', 'wristR', 'openL', 'openR']) {
        this.pose[key] = damp(this.pose[key], arms[key], 14, dt);
      }
    }
    this.pilot.setPose(this.pose);
    this.pilot.update(dt);
  }

  dispose() {
    this.root.traverse((node) => {
      node.geometry?.dispose();
      node.material?.dispose?.();
    });
  }
}

/** A soft see-through bubble, for a pirate that's been wrapped up, and for the shield. */
function buildBubble(radius, colour = '#bfeaff', opacity = 0.34) {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), new THREE.MeshLambertMaterial({ color: colour, transparent: true, opacity, depthWrite: false })));
  const shine = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.13, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, depthWrite: false }));
  shine.position.set(-radius * 0.45, radius * 0.5, radius * 0.55);
  group.add(shine);
  group.visible = false;
  return group;
}

/** A pirate in a hot-air balloon, which drifts slowly and never shoots. */
class BalloonCraft {
  constructor(spec) {
    this.spec = spec;
    this.root = new THREE.Group();
    const { burstColours, colours } = spec;
    const stripes = [burstColours[0], '#3a3550', burstColours[1] ?? '#ffffff', '#3a3550'];
    const parts = [];
    for (let s = 0; s < 8; s += 1) {
      const slice = new THREE.SphereGeometry(4.3, 10, 10, (s / 8) * Math.PI * 2, Math.PI / 4);
      parts.push({ geometry: slice, colour: stripes[s % stripes.length], at: [0, 7.6, 0], size: [1, 1.15, 1] });
    }
    parts.push({ geometry: roundedBox(2.8, 1.5, 2.8, 0.2), colour: '#a07c4f', at: [0, 0, 0] });
    for (const [x, z] of [[-1.25, -1.25], [1.25, -1.25], [-1.25, 1.25], [1.25, 1.25]]) {
      parts.push({ geometry: new THREE.BoxGeometry(0.1, 3.4, 0.1), colour: '#5c4630', at: [x, 2.4, z] });
    }
    // A little pirate flag on the basket.
    parts.push({ geometry: new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), colour: '#5a4632', at: [1.3, 1.6, 1.3] });
    parts.push({ geometry: new THREE.BoxGeometry(0.04, 0.7, 1.05), colour: '#26283a', at: [1.3, 2.3, 1.85] });
    const body = mergeParts(parts);
    this.root.add(new THREE.Mesh(body, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon(), side: THREE.DoubleSide })));
    this.root.add(new THREE.Mesh(body, outlineMaterial(colours.ink, 0.03)));
    this.flag = new THREE.Group();
    this.bubble = buildBubble(6.2);
    this.bubble.position.y = 4.5;
    this.root.add(this.bubble);
    this.pilot = new Fighter3D(spec);
    this.pilot.root.scale.setScalar(PILOT_SIZE);
    this.pilot.root.position.set(0, -0.6, 0);
    this.pilot.setExpression('ready');
    this.root.add(this.pilot.root);
    this.wobble = 0;
    this.time = Math.random() * 6;
  }

  update(dt, { heading = 0, still = false }) {
    this.time += dt;
    const sway = still ? 0 : Math.sin(this.time * 0.9) * 0.05;
    this.root.rotation.set(0, -heading, sway + (this.wobble > 0 ? Math.sin(this.time * 9) * 0.12 * Math.min(1, this.wobble) : 0), 'YXZ');
    this.pilot.update(dt);
  }

  dispose() {
    this.root.traverse((node) => {
      node.geometry?.dispose();
      node.material?.dispose?.();
    });
  }
}

/** The pirates' treasure airship: big and slow, with a chest hanging under it. It never shoots. */
class AirshipCraft {
  constructor(spec) {
    this.spec = spec;
    this.root = new THREE.Group();
    const { burstColours, colours } = spec;
    const main = colours.pants ?? colours.body;
    const trim = burstColours[0];
    const parts = [
      { geometry: ball(3.3, 3.1, 9.5), colour: main, at: [0, 0, 0] },
      { geometry: new THREE.TorusGeometry(3.25, 0.28, 8, 24), colour: trim, at: [0, 0, -3] },
      { geometry: new THREE.TorusGeometry(3.25, 0.28, 8, 24), colour: trim, at: [0, 0, 3] },
      { geometry: roundedBox(0.3, 3.2, 2.6, 0.1), colour: trim, at: [0, 2.6, 7.6] },
      { geometry: roundedBox(0.3, 3.2, 2.6, 0.1), colour: trim, at: [0, -2.6, 7.6] },
      { geometry: roundedBox(3.2, 0.3, 2.6, 0.1), colour: trim, at: [2.6, 0, 7.6] },
      { geometry: roundedBox(3.2, 0.3, 2.6, 0.1), colour: trim, at: [-2.6, 0, 7.6] },
      { geometry: roundedBox(2.6, 1.5, 5, 0.25), colour: '#8a5a2b', at: [0, -4, 0] },
      // The treasure chest, hanging under the gondola.
      { geometry: roundedBox(2, 1.3, 1.4, 0.15), colour: '#9a6230', at: [0, -5.6, 1.8] },
      { geometry: new THREE.BoxGeometry(2.1, 0.3, 1.5), colour: '#ffd23f', at: [0, -5.4, 1.8] },
      { geometry: new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), colour: '#5a4632', at: [0, -2.6, 2.2] },
      { geometry: new THREE.BoxGeometry(0.04, 0.9, 1.3), colour: '#26283a', at: [0, -1.9, 2.9] },
      { geometry: ball(0.25, 0.25, 0.05).rotateY(Math.PI / 2), colour: '#ffd23f', at: [0.03, -1.9, 2.9] },
    ];
    const body = mergeParts(parts);
    this.root.add(new THREE.Mesh(body, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon() })));
    this.root.add(new THREE.Mesh(body, outlineMaterial(colours.ink, 0.03)));
    const blades = new THREE.MeshToonMaterial({ color: '#3a3a44', gradientMap: toon() });
    this.propeller = new THREE.Group();
    this.propeller.position.set(0, 0, 9.6);
    const blade = roundedBox(2.4, 0.2, 0.06, 0.02);
    this.propeller.add(new THREE.Mesh(blade, blades));
    const second = new THREE.Mesh(blade, blades);
    second.rotation.z = Math.PI / 2;
    this.propeller.add(second);
    this.root.add(this.propeller);
    this.flag = new THREE.Group();
    this.bubble = buildBubble(11);
    this.root.add(this.bubble);
    this.pilot = new Fighter3D(spec);
    this.pilot.faceTowards(Math.PI);
    this.pilot.root.scale.setScalar(PILOT_SIZE);
    this.pilot.root.position.set(0, -4.4, -1.4);
    this.pilot.setExpression('ready');
    this.root.add(this.pilot.root);
    this.wobble = 0;
    this.time = Math.random() * 6;
  }

  update(dt, { heading = 0, pitch = 0 }) {
    this.time += dt;
    this.propeller.rotation.z += dt * 8;
    const wobble = this.wobble > 0 ? Math.sin(this.time * 8) * 0.08 * Math.min(1, this.wobble) : 0;
    this.root.rotation.set(pitch * 0.3, -heading, wobble, 'YXZ');
    this.pilot.update(dt);
  }

  dispose() {
    this.root.traverse((node) => {
      node.geometry?.dispose();
      node.material?.dispose?.();
    });
  }
}

/** What a dropped pirate leaves: a gold coin, a gem, the captain's medal or a treasure chest. */
function buildPrize(kind) {
  const parts = {
    coin: [
      { geometry: new THREE.CylinderGeometry(2.3, 2.3, 0.55, 24).rotateX(Math.PI / 2), colour: '#ffc531' },
      { geometry: new THREE.CylinderGeometry(1.5, 1.5, 0.62, 24).rotateX(Math.PI / 2), colour: '#ffe27a' },
    ],
    gem: [
      { geometry: new THREE.OctahedronGeometry(2.2), colour: '#3fd6ff', size: [1, 1.35, 1] },
      { geometry: new THREE.OctahedronGeometry(1.2), colour: '#b8f3ff', at: [0, 0.4, 0.5], size: [1, 1.2, 1] },
    ],
    medal: [
      { geometry: new THREE.CylinderGeometry(2.4, 2.4, 0.5, 24).rotateX(Math.PI / 2), colour: '#ffc531' },
      { geometry: star(1.3, 0.6, 0.4), colour: '#fff3b0', at: [0, 0, 0.3] },
      { geometry: new THREE.BoxGeometry(1.2, 2.6, 0.2), colour: '#e8433f', at: [-0.7, 3, 0], turn: [0, 0, 0.35] },
      { geometry: new THREE.BoxGeometry(1.2, 2.6, 0.2), colour: '#3b82f6', at: [0.7, 3, 0], turn: [0, 0, -0.35] },
    ],
    chest: [
      { geometry: roundedBox(4.6, 2.6, 3, 0.25), colour: '#9a6230' },
      { geometry: ball(2.3, 1, 1.5), colour: '#b3743a', at: [0, 1.4, 0] },
      { geometry: new THREE.BoxGeometry(4.8, 0.45, 3.2), colour: '#ffd23f', at: [0, 1.1, 0] },
      { geometry: roundedBox(0.8, 0.9, 0.3, 0.1), colour: '#ffd23f', at: [0, 0.6, 1.55] },
    ],
  }[kind];
  return new THREE.Mesh(mergeParts(parts), new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon() }));
}

/** A gift box hanging from a little balloon, in its power's colours. */
function buildGift(kind) {
  const [box, ribbon] = GIFT_COLOURS[kind];
  const group = new THREE.Group();
  const body = mergeParts([
    { geometry: roundedBox(6, 6, 6, 0.5), colour: box },
    { geometry: new THREE.BoxGeometry(6.2, 6.2, 1.3), colour: ribbon },
    { geometry: new THREE.BoxGeometry(1.3, 6.2, 6.2), colour: ribbon },
    { geometry: ball(1.2, 0.8, 0.8), colour: ribbon, at: [-1.1, 3.4, 0], turn: [0, 0, 0.5] },
    { geometry: ball(1.2, 0.8, 0.8), colour: ribbon, at: [1.1, 3.4, 0], turn: [0, 0, -0.5] },
    { geometry: new THREE.BoxGeometry(0.1, 4, 0.1), colour: '#f4f1e8', at: [0, 5.4, 0] },
    { geometry: ball(2.6, 3, 2.6), colour: box, at: [0, 9.8, 0] },
  ]);
  group.add(new THREE.Mesh(body, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon() })));
  group.add(new THREE.Mesh(body, outlineMaterial('#12304d', 0.04)));
  group.visible = false;
  return group;
}

/** A folded paper plane, pointing along +z. */
function paperPlaneShape() {
  const geometry = new THREE.BufferGeometry();
  // Wings folded up in a V, so it can be seen from behind as well as from above.
  const points = [0, 0, 1.5, -1, 0.6, -1, 0, -0.4, -0.8, 0, 0, 1.5, 0, -0.4, -0.8, 1, 0.6, -1];
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function buildParachute(colours) {
  const parts = [];
  const stripes = 10;
  for (let s = 0; s < stripes; s += 1) {
    const slice = new THREE.SphereGeometry(4.6, 8, 6, (s / stripes) * Math.PI * 2, (Math.PI * 2) / stripes, 0, Math.PI / 2);
    parts.push({ geometry: slice, colour: colours[s % colours.length], at: [0, 5.6, 0] });
  }
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    const x = Math.cos(angle) * 2.3;
    const z = Math.sin(angle) * 2.3;
    const tilt = Math.atan2(2.3, 5);
    parts.push({ geometry: new THREE.BoxGeometry(0.06, 5.6, 0.06), colour: '#f4f1e8', at: [x, 2.9, z], turn: [Math.sin(angle) * tilt, 0, -Math.cos(angle) * tilt] });
  }
  return new THREE.Mesh(mergeParts(parts), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
}

export class Sky {
  constructor(canvas) {
    this.canvas = canvas;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#dff4ff', 700, 2300);
    this.skyLight = new THREE.HemisphereLight('#ffffff', '#9fbf9a', 1.9);
    this.scene.add(this.skyLight);
    const sun = new THREE.DirectionalLight('#fff3dc', 2.1);
    sun.position.set(-0.5, 1, 0.45);
    this.scene.add(sun);
    this.sun = sun;

    this.camera = new THREE.PerspectiveCamera(VIEWS.choose.fov, 1, 1.5, 6000);
    this.cameraAt = new THREE.Vector3(...VIEWS.choose.at);
    this.cameraLook = new THREE.Vector3(...VIEWS.choose.look);
    this.view = 'choose';
    this.time = 0;
    this.frames = 0;
    this.slowFrames = 0;
    this.quality = 2;

    this.island = new Island(this.scene);
    this.sparks = new Sparks(this.scene);
    this.plane = null;
    this.enemyPlanes = [];
    this.flight = null;
    this.chutes = [];
    this.live = null;
    this.lessonBank = 0;
    this.smokeIn = new Map();
    this.weather = 'day';
    this.prizeMeshes = new Map();
    this.gifts = {};
    this.helperPlane = null;
    this.frostIn = new Map();
    // Friends flying on their own computers: a plane each, and where each is, kept up to date by main.js.
    this.matePlanes = [];
    this.mates = [];

    this.tracers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.34, 1), new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false }), TRACERS);
    this.tracers.frustumCulled = false;
    this.tracers.count = 0;
    this.scene.add(this.tracers);
    this.tracerAt = new THREE.Vector3();
    this.tracerTurn = new THREE.Quaternion();
    this.tracerSize = new THREE.Vector3(1, 1, TRACER_LENGTH);
    this.tracerMatrix = new THREE.Matrix4();
    this.tracerDirection = new THREE.Vector3();
    this.forwardAxis = new THREE.Vector3(0, 0, 1);
    this.mineColour = new THREE.Color('#ffe14d');
    this.theirColour = new THREE.Color('#ff8a3c');
    this.snowColour = new THREE.Color('#bfefff');
    this.helperColour = new THREE.Color('#9dffbd');

    // Bubbles and paper planes, for those powers.
    this.bubbleShots = new THREE.InstancedMesh(new THREE.SphereGeometry(1.7, 14, 10), new THREE.MeshLambertMaterial({ color: '#bfeaff', transparent: true, opacity: 0.6, depthWrite: false }), BUBBLES);
    this.paperShots = new THREE.InstancedMesh(paperPlaneShape(), new THREE.MeshLambertMaterial({ color: '#f4f1e8', side: THREE.DoubleSide }), PAPERS);
    for (const mesh of [this.bubbleShots, this.paperShots]) {
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.scene.add(mesh);
    }
    this.oneSize = new THREE.Vector3(1, 1, 1);
    this.paperSize = new THREE.Vector3(2.8, 2.8, 2.8);

    // The shield bubble round the child's plane.
    this.shield = buildBubble(SHIELD_RADIUS, '#6fb6ff', 0);
    this.shieldShare = 0;
    this.scene.add(this.shield);

    // Light snow, which falls round the camera wherever it goes. Each flake is a small soft dot, the same
    // few pixels across near or far, so flying through one never fills the picture with white.
    const flakes = new Float32Array(SNOWFLAKES * 3);
    for (let i = 0; i < flakes.length; i += 1) flakes[i] = (Math.random() - 0.5) * SNOW_BOX;
    const snowShape = new THREE.BufferGeometry();
    snowShape.setAttribute('position', new THREE.BufferAttribute(flakes, 3));
    const flake = spriteTexture((ctx) => {
      const soft = ctx.createRadialGradient(0, 0, 0, 0, 0, 48);
      soft.addColorStop(0, 'rgba(255, 255, 255, 1)');
      soft.addColorStop(0.45, 'rgba(255, 255, 255, 0.85)');
      soft.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = soft;
      ctx.beginPath();
      ctx.arc(0, 0, 48, 0, Math.PI * 2);
      ctx.fill();
    }, 32);
    this.snow = new THREE.Points(snowShape, new THREE.PointsMaterial({ color: '#ffffff', map: flake, size: SNOWFLAKE_PIXELS, sizeAttenuation: false, transparent: true, opacity: 0.85, depthWrite: false, fog: false }));
    this.snow.frustumCulled = false;
    this.snow.visible = false;
    this.scene.add(this.snow);

    // A soft shadow on the ground, which shows how high the plane is.
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#12304d', transparent: true, opacity: 0.22, depthWrite: false }),
    );
    this.scene.add(this.shadow);

    this.projecting = new THREE.Vector3();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.resize();
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.onSizeChanged?.();
  }

  /** How wide the ring on the screen is, so that what's inside it is what the guns fire at. */
  aimDiameter(level = 'gentle') {
    const half = Math.tan(LEVELS[level].aim) / Math.tan((FLY_FOV * Math.PI) / 360);
    return half * this.height;
  }

  /** Where the camera is for a view, for the shape the picture is now. */
  viewOf(name) {
    return (this.camera.aspect < 1 ? NARROW_VIEWS : VIEWS)[name];
  }

  setView(name, { snap = false } = {}) {
    if (this.view === 'fly' && name !== 'fly' && this.plane) {
      // Off from where the camera is now, rather than jumping.
      this.cameraAt.copy(this.camera.position).sub(this.plane.root.position);
      this.cameraLook.set(0, 0, 0);
    }
    this.view = name;
    if (name === 'fly') {
      this.camera.fov = FLY_FOV;
      this.camera.updateProjectionMatrix();
    } else if (snap) {
      const view = this.viewOf(name);
      this.cameraAt.set(...view.at);
      this.cameraLook.set(...view.look);
      this.camera.fov = view.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  setPilot(spec) {
    if (this.plane) {
      this.scene.remove(this.plane.root);
      this.plane.dispose();
    }
    this.plane = new Plane(spec);
    this.scene.add(this.plane.root);
  }

  /** What the child's arms are doing, for the pilot to copy, or null. */
  setLive(pose) {
    this.live = pose;
  }

  /**
   * A dogfight with these characters as the sky pirates, or null for none. helperSpec is the friend
   * who comes to help, on the levels that have that.
   */
  setFlight(flight, enemySpecs = [], helperSpec = null) {
    for (const plane of this.enemyPlanes) {
      this.scene.remove(plane.root);
      plane.dispose();
    }
    for (const chute of this.chutes) this.dropChute(chute);
    this.chutes = [];
    this.smokeIn.clear();
    this.frostIn.clear();
    for (const mesh of this.prizeMeshes.values()) this.scene.remove(mesh);
    this.prizeMeshes.clear();
    if (this.helperPlane) {
      this.scene.remove(this.helperPlane.root);
      this.helperPlane.dispose();
      this.helperPlane = null;
    }
    this.flight = flight;
    this.enemyPlanes = enemySpecs.map((spec, index) => {
      const kind = flight?.plan?.[index] ?? 'pirate';
      const Craft = kind === 'balloon' ? BalloonCraft : kind === 'airship' ? AirshipCraft : Plane;
      const plane = new Craft(spec);
      plane.kind = kind;
      plane.root.scale.setScalar(ENEMY_SIZE * (KIND_SIZE[kind] ?? 1));
      plane.root.visible = false;
      plane.pilot.setExpression('ready');
      this.scene.add(plane.root);
      return plane;
    });
    if (helperSpec && flight?.levelRules.gifts.includes('helper')) {
      this.helperPlane = new Plane(helperSpec);
      this.helperPlane.root.visible = false;
      this.scene.add(this.helperPlane.root);
    }
    this.setWeather(flight?.levelRules.sky ?? 'day');
  }

  /**
   * Friends flying on their own computers, each with the character they chose: specs in order, and mates,
   * where each is, as { x, y, z, heading, pitch, roll, live, seen }. As big as the pirates, so they can be
   * seen from as far away.
   */
  setMates(specs = [], mates = []) {
    for (const plane of this.matePlanes) {
      this.scene.remove(plane.root);
      plane.dispose();
    }
    this.mates = mates;
    this.matePlanes = specs.map((spec) => {
      const plane = new Plane(spec);
      plane.root.scale.setScalar(ENEMY_SIZE);
      plane.root.visible = false;
      this.scene.add(plane.root);
      return plane;
    });
  }

  /** Each friend's plane where they are, once something has come from their game. */
  drawMates(dt) {
    this.matePlanes.forEach((plane, index) => {
      const mate = this.mates[index];
      plane.root.visible = Boolean(mate?.live && mate.seen && this.view === 'fly');
      if (!plane.root.visible) return;
      plane.root.position.set(mate.x, mate.y, mate.z);
      // Smaller near the camera, and gone right by it, so that a friend flying past or through the child's own
      // plane never fills the view. These are the child's own plane's planes, so it doesn't happen often.
      const near = clamp((plane.root.position.distanceTo(this.camera.position) - 12) / 30, 0, 1);
      plane.root.scale.setScalar(ENEMY_SIZE * Math.max(0.01, near));
      plane.root.visible = near > 0;
      plane.update(dt, { spin: 1, heading: mate.heading, pitch: mate.pitch, roll: mate.roll });
    });
  }

  /** The time of day and the weather, which only ever change between flights. */
  setWeather(name) {
    const look = WEATHER[name] ?? WEATHER.day;
    this.weather = name;
    this.island.paintSky(SKIES[name] ? name : 'day');
    this.scene.fog.color.set(look.fog);
    this.skyLight.color.set(look.sky);
    this.skyLight.groundColor.set(look.ground);
    this.sun.color.set(look.sun);
    this.snow.visible = name === 'snow';
  }

  /** How the plane tips when there's no dogfight going on, in the lesson. */
  setBank(bank) {
    this.lessonBank = bank;
  }

  planeFor(enemy) {
    return this.enemyPlanes[enemy.index % this.enemyPlanes.length] ?? null;
  }

  /** Where something in the world is on the screen, in pixels, and whether it's behind the camera. */
  project(x, y, z) {
    const at = this.projecting.set(x, y, z);
    const { camera } = this;
    at.project(camera);
    const behind = at.z > 1;
    return { x: ((at.x + 1) / 2) * this.width, y: ((1 - at.y) / 2) * this.height, behind };
  }

  /* ---------- what happens in the sky ---------- */

  puffs(at, { count = 4, colours = ['#d8d3cc'], size = 3, speed = 5, life = 0.9, grow = 1.4, opacity = 0.75 }) {
    const total = Math.max(1, Math.round(count * (this.reducedMotion ? 0.5 : 1)));
    for (let i = 0; i < total; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const push = speed * between(0.4, 1.1);
      this.sparks.emit({
        shape: 'puff',
        colour: colours[i % colours.length],
        at,
        velocity: [Math.cos(angle) * push, between(-0.2, 0.7) * push, Math.sin(angle) * push],
        life: life * between(0.8, 1.2),
        size: size * between(0.8, 1.2),
        grow,
        spin: between(-2, 2),
        opacity,
        drag: 1.4,
      });
    }
  }

  /**
   * How big smoke can be here, as a share: smaller the nearer the camera, as the plane may fly through
   * it before it's gone, and big grey puffs right in front of the camera would darken the picture.
   */
  smokeShare(at) {
    return clamp((at.distanceTo(this.camera.position) - 20) / 90, 0.2, 1);
  }

  hitEnemy(enemy) {
    const plane = this.planeFor(enemy);
    if (!plane) return;
    plane.pilot.setExpression('hurt', 0.4);
    const count = this.reducedMotion ? 2 : 4;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + Math.random();
      this.sparks.emit({
        shape: i % 2 ? 'star' : 'spark',
        colour: ['#ffd23f', '#ff8f3f'][i % 2],
        at: plane.root.position,
        velocity: [Math.cos(angle) * 14, Math.sin(angle) * 14, between(-8, 8)],
        life: 0.35,
        size: 2,
        spin: 4,
        drag: 1,
      });
    }
  }

  /** A plane that's been dropped falls away by itself, and its pilot comes down by parachute. */
  enemyDown(enemy) {
    const plane = this.planeFor(enemy);
    if (!plane) return;
    const { position } = plane.root;
    if (enemy.bubbled || !(plane instanceof Plane)) {
      // Wrapped in a bubble, or a balloon or the airship letting its air out: it floats gently down with
      // its pilot aboard, so there's no smoke and no parachute.
      plane.pilot.setExpression('happy');
      this.puffs(position, { count: 5, colours: ['#e6f6ff', '#ffffff'], size: 3, speed: 6, life: 0.9, grow: 1.2, opacity: 0.6 });
      return;
    }
    this.puffs(position, { count: 12, colours: ['#6b6560', '#8a837b', '#a59e95', '#ff9c4a'], size: 5 * this.smokeShare(position), speed: 12, life: 1.3, grow: 1.6 });
    const { pilot } = plane;
    plane.root.remove(pilot.root);
    const colours = plane.spec.burstColours.length > 1 ? plane.spec.burstColours : [plane.spec.burstColours[0], '#ffffff'];
    const group = new THREE.Group();
    const canopy = buildParachute(colours);
    canopy.material.transparent = true;
    group.add(canopy);
    pilot.root.position.set(0, -2.3, 0);
    pilot.root.scale.setScalar(1.4);
    pilot.setExpression('happy');
    group.add(pilot.root);
    group.scale.setScalar(1.6);
    group.position.set(position.x, position.y + 6, position.z);
    this.scene.add(group);
    this.chutes.push({ group, pilot, canopy, left: CHUTE_SECONDS, phase: Math.random() * 6 });
  }

  childHit() {
    if (!this.plane) return;
    const at = this.plane.root.position;
    this.puffs(at, { count: 3, colours: ['#bdb7ae', '#ffb25c'], size: 2, speed: 8, life: 0.5, grow: 1 });
    this.plane.pilot.setExpression('hurt', 0.5);
  }

  celebrate() {
    this.plane?.pilot.setExpression('happy');
    this.setView('win');
  }

  /* ---------- every frame ---------- */

  watchSpeed(dt) {
    this.frames += 1;
    if (dt > SLOW_FRAME_SECONDS) this.slowFrames += 1;
    if (this.frames < SLOW_CHECK_FRAMES) return;
    const slow = this.slowFrames > this.frames * 0.5;
    this.frames = 0;
    this.slowFrames = 0;
    if (!slow || this.quality === 0) return;
    this.quality -= 1;
    if (this.quality === 1) {
      this.renderer.setPixelRatio(1);
      this.resize();
    } else {
      this.island.showFewer();
    }
  }

  placeChild(dt) {
    const { flight, plane } = this;
    if (!plane) return;
    if (flight && this.view !== 'choose' && this.view !== 'lesson') {
      plane.root.position.set(flight.x, flight.y, flight.z);
      plane.wobble = flight.hurtLeft;
      plane.update(dt, {
        spin: 0.5 + (flight.speed / flight.pace.speed) * 0.5,
        heading: flight.heading,
        pitch: flight.pitch,
        roll: flight.roll,
        arms: this.live,
      });
      const ground = Math.max(0, heightAt(flight.x, flight.z));
      this.shadow.visible = true;
      this.shadow.position.set(flight.x, ground + 1.2, flight.z);
      this.shadow.scale.setScalar(clamp(9 - (flight.y - ground) * 0.02, 4, 9));
      return;
    }
    this.shadow.visible = false;
    const bob = this.reducedMotion ? 0 : Math.sin(this.time * 1.1) * 0.5;
    plane.root.position.set(SHOWCASE.x, SHOWCASE.y + bob, SHOWCASE.z);
    if (this.view === 'choose') plane.update(dt, { spin: 0.4, heading: -Math.PI - 0.7 });
    else plane.update(dt, { spin: 0.6, heading: this.lessonBank * 0.3, roll: this.lessonBank * 0.85, arms: this.live });
  }

  placeEnemies(dt) {
    const { flight } = this;
    if (!flight) return;
    const seen = new Set();
    for (const enemy of flight.enemies) {
      const plane = this.planeFor(enemy);
      if (!plane) continue;
      seen.add(plane);
      plane.root.visible = true;
      plane.root.position.set(enemy.x, enemy.y, enemy.z);
      // One going down gets smaller if the camera comes near it, so flying past it never fills the view.
      const falling = enemy.state === 'falling';
      const near = falling ? clamp((plane.root.position.distanceTo(this.camera.position) - 25) / 55, 0, 1) : 1;
      plane.root.scale.setScalar(ENEMY_SIZE * (KIND_SIZE[enemy.kind] ?? (enemy.captain ? CAPTAIN_SIZE : 1)) * Math.max(0.01, near));
      plane.flag.visible = Boolean(enemy.captain);
      plane.bubble.visible = enemy.bubbled;
      plane.wobble = enemy.bubbled ? 0 : enemy.hitLeft * 2;
      const slowed = enemy.slowLeft > 0;
      plane.update(dt, { spin: slowed ? 0.4 : 1, heading: enemy.heading, pitch: enemy.pitch, roll: enemy.roll, still: this.reducedMotion });

      // A pirate slowed by a snowflake leaves a little trail of snow.
      if (slowed && enemy.state === 'flying') {
        const wait = (this.frostIn.get(enemy) ?? 0) - dt;
        this.frostIn.set(enemy, wait);
        if (wait <= 0) {
          this.frostIn.set(enemy, this.reducedMotion ? 0.4 : 0.2);
          this.sparks.emit({ shape: 'star', colour: '#dff6ff', at: plane.root.position, velocity: [between(-3, 3), -2, between(-3, 3)], life: 0.9, size: 2.4, spin: 1, drag: 1, opacity: 0.9 });
        }
      }

      const damaged = enemy.hitsLeft <= enemy.hitsTotal / 2;
      // Only a plane smokes: a bubble, a balloon or an airship goes down gently.
      const smokes = !enemy.bubbled && plane instanceof Plane;
      if (smokes && (falling || damaged)) {
        const wait = (this.smokeIn.get(enemy) ?? 0) - dt;
        this.smokeIn.set(enemy, wait);
        if (wait <= 0) {
          this.smokeIn.set(enemy, falling ? SMOKE_EVERY.falling : SMOKE_EVERY.damaged);
          this.puffs(plane.root.position, {
            count: 1,
            colours: falling ? ['#6b6560', '#7d766e'] : ['#b5b0a8'],
            size: (falling ? 4.5 : 2.6) * this.smokeShare(plane.root.position),
            speed: 2,
            life: falling ? 1.6 : 0.9,
            grow: 1.6,
            opacity: 0.7,
          });
        }
      }
    }
    for (const plane of this.enemyPlanes) {
      if (!seen.has(plane)) plane.root.visible = false;
    }
  }

  moveChutes(dt) {
    for (const chute of this.chutes) {
      chute.left -= dt;
      // A parachute and its pilot fade and shrink as the camera nears them, so flying through one can't
      // fill the view.
      const near = clamp((chute.group.position.distanceTo(this.camera.position) - 20) / 45, 0, 1);
      chute.canopy.material.opacity = near;
      chute.group.scale.setScalar(1.6 * Math.max(0.01, near));
      chute.group.visible = near > 0.02;
      chute.group.position.y -= CHUTE_FALL * dt;
      chute.group.position.y = Math.max(chute.group.position.y, floorAt(chute.group.position.x, chute.group.position.z) - 10);
      chute.group.rotation.z = this.reducedMotion ? 0 : Math.sin(this.time * 1.3 + chute.phase) * 0.12;
      chute.pilot.update(dt);
      if (chute.left <= 0) this.dropChute(chute);
    }
    this.chutes = this.chutes.filter(({ left }) => left > 0);
  }

  /** A parachute that's come down goes, with its pilot, and what they were made of is let go. */
  dropChute(chute) {
    this.scene.remove(chute.group);
    chute.canopy.geometry.dispose();
    chute.canopy.material.dispose();
    chute.pilot.dispose();
  }

  drawTracers() {
    const { flight, tracers, bubbleShots, paperShots } = this;
    const shots = flight?.shots ?? [];
    let count = 0;
    let bubbles = 0;
    let papers = 0;
    for (const shot of shots) {
      this.tracerAt.set(shot.x, shot.y, shot.z);
      this.tracerDirection.set(shot.dx, shot.dy, shot.dz);
      this.tracerTurn.setFromUnitVectors(this.forwardAxis, this.tracerDirection);
      if (shot.kind === 'bubble') {
        if (bubbles < BUBBLES) bubbleShots.setMatrixAt(bubbles++, this.tracerMatrix.compose(this.tracerAt, this.tracerTurn, this.oneSize));
      } else if (shot.kind === 'paper') {
        if (papers < PAPERS) paperShots.setMatrixAt(papers++, this.tracerMatrix.compose(this.tracerAt, this.tracerTurn, this.paperSize));
      } else if (count < TRACERS) {
        tracers.setMatrixAt(count, this.tracerMatrix.compose(this.tracerAt, this.tracerTurn, this.tracerSize));
        const colour = !shot.mine ? this.theirColour : shot.kind === 'snow' ? this.snowColour : shot.kind === 'helper' ? this.helperColour : this.mineColour;
        tracers.setColorAt(count, colour);
        count += 1;
      }
    }
    tracers.count = count;
    tracers.instanceMatrix.needsUpdate = true;
    if (tracers.instanceColor) tracers.instanceColor.needsUpdate = true;
    bubbleShots.count = bubbles;
    bubbleShots.instanceMatrix.needsUpdate = true;
    paperShots.count = papers;
    paperShots.instanceMatrix.needsUpdate = true;
  }

  /** Prizes on their way to the plane, turning slowly so they catch the light. */
  drawPrizes(dt) {
    const prizes = this.flight?.prizes ?? [];
    const now = new Set(prizes);
    for (const [prize, mesh] of this.prizeMeshes) {
      if (now.has(prize)) continue;
      this.scene.remove(mesh);
      this.prizeMeshes.delete(prize);
    }
    for (const prize of prizes) {
      let mesh = this.prizeMeshes.get(prize);
      if (!mesh) {
        this.prizeShapes ??= {};
        this.prizeShapes[prize.kind] ??= buildPrize(prize.kind);
        mesh = this.prizeShapes[prize.kind].clone();
        mesh.userData.size = { chest: 2.4, gem: 1.6 }[prize.kind] ?? 2.1;
        this.scene.add(mesh);
        this.prizeMeshes.set(prize, mesh);
      }
      mesh.position.set(prize.x, prize.y, prize.z);
      mesh.rotation.y += dt * (this.reducedMotion ? 0.8 : 2.4);
      // Smaller as it nears the camera, so one coming from behind never fills the view.
      const near = clamp((mesh.position.distanceTo(this.camera.position) - 12) / 30, 0, 1);
      mesh.scale.setScalar(mesh.userData.size * near);
      mesh.visible = near > 0.05;
    }
  }

  /** A prize reaching the plane: a few small stars, where it was caught. */
  prizeCaught(prize) {
    const at = this.plane?.root.position;
    if (!at) return;
    const colour = { coin: '#ffd23f', gem: '#7fe6ff', medal: '#ffd23f', chest: '#ffb347' }[prize.kind];
    const count = this.reducedMotion ? 2 : 4;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      this.sparks.emit({ shape: 'star', colour, at, velocity: [Math.cos(angle) * 3, 2.5, Math.sin(angle) * 3], life: 0.45, size: 0.7, spin: 3, drag: 1.5 });
    }
  }

  /** The gift box in the sky, if there is one, bobbing gently on its balloon. */
  drawGift() {
    const gift = this.flight?.gift ?? null;
    for (const group of Object.values(this.gifts)) group.visible = false;
    if (!gift) return;
    if (!this.gifts[gift.kind]) {
      this.gifts[gift.kind] = buildGift(gift.kind);
      this.scene.add(this.gifts[gift.kind]);
    }
    const group = this.gifts[gift.kind];
    const bob = this.reducedMotion ? 0 : Math.sin(this.time * 1.6) * 1.2;
    group.visible = true;
    group.position.set(gift.x, gift.y + bob, gift.z);
    group.rotation.y = this.reducedMotion ? 0 : this.time * 0.6;
  }

  /** What a power shows: the shield round the plane, and a friend flying alongside. */
  drawPower(dt) {
    const { flight, plane } = this;
    const power = flight?.power?.kind;
    // The shield fades in and out, rather than popping up round the plane.
    this.shieldShare = damp(this.shieldShare, power === 'shield' && plane ? 1 : 0, 4, dt);
    this.shield.visible = this.shieldShare > 0.02 && Boolean(plane);
    if (this.shield.visible) {
      this.shield.position.copy(plane.root.position);
      const [ball, shine] = this.shield.children;
      ball.material.opacity = 0.13 * this.shieldShare;
      shine.material.opacity = 0.5 * this.shieldShare;
    }
    const { helperPlane } = this;
    if (!helperPlane) return;
    const helper = flight?.helper;
    helperPlane.root.visible = Boolean(helper);
    if (!helper) return;
    helperPlane.root.position.set(helper.x, helper.y, helper.z);
    helperPlane.update(dt, { spin: 1, heading: flight.heading, pitch: flight.pitch, roll: flight.roll * 0.6 });
  }

  /**
   * Something the shield stopped: a few small sparkles on its edge. They go along with the plane, so the
   * camera behind it never flies into them, and they're smaller still if they're near the camera, as
   * smoke is. With reduced motion there are fewer, and they don't spread.
   */
  shieldBlocked() {
    const { plane, flight } = this;
    if (!plane || !flight) return;
    const { forward, speed } = flight;
    const right = new THREE.Vector3(-forward.z, 0, forward.x).normalize();
    const count = this.reducedMotion ? 2 : 4;
    const spread = this.reducedMotion ? 0 : 2.5;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + Math.random();
      const out = new THREE.Vector3().addScaledVector(right, Math.cos(angle)).add(new THREE.Vector3(0, Math.sin(angle), 0));
      const at = plane.root.position.clone().addScaledVector(out, SHIELD_RADIUS);
      this.sparks.emit({
        shape: 'spark',
        colour: '#cfe9ff',
        at,
        velocity: [forward.x * speed + out.x * spread, forward.y * speed + out.y * spread, forward.z * speed + out.z * spread],
        life: 0.45,
        size: 1.1 * clamp((at.distanceTo(this.camera.position) - 6) / 8, 0, 1),
        spin: this.reducedMotion ? 0 : 3,
        opacity: this.reducedMotion ? 0.45 : 0.6,
      });
    }
  }

  /** A pirate wrapped up in a bubble. */
  bubbled(enemy) {
    const plane = this.planeFor(enemy);
    if (plane) plane.bubble.visible = true;
  }

  /** Light snow falling round the camera. It moves slowly and steadily, and never flickers. */
  moveSnow(dt) {
    if (!this.snow.visible) return;
    const { camera } = this;
    const positions = this.snow.geometry.attributes.position;
    const half = SNOW_BOX / 2;
    const fall = (this.reducedMotion ? 3 : 6) * dt;
    const wrap = (value, middle) => middle + ((((value - middle + half) % SNOW_BOX) + SNOW_BOX) % SNOW_BOX) - half;
    for (let i = 0; i < positions.count; i += 1) {
      positions.setX(i, wrap(positions.getX(i), camera.position.x));
      positions.setY(i, wrap(positions.getY(i) - fall, camera.position.y));
      positions.setZ(i, wrap(positions.getZ(i), camera.position.z));
    }
    positions.needsUpdate = true;
  }

  update(dt) {
    this.time += dt;
    this.watchSpeed(dt);
    this.placeChild(dt);
    this.placeEnemies(dt);
    this.moveChutes(dt);
    this.drawTracers();
    this.drawPrizes(dt);
    this.drawGift();
    this.drawPower(dt);
    this.drawMates(dt);
    this.sparks.update(dt);
    this.updateCamera(dt);
    this.moveSnow(dt);
    this.island.update(dt, this.camera, this.reducedMotion);
  }

  updateCamera(dt) {
    const { flight, camera, plane } = this;
    if (this.view === 'fly' && flight) {
      const { eye, forward, up } = flight.view;
      const axis = this.tracerDirection.set(forward.x, forward.y, forward.z);
      camera.position.set(eye.x, eye.y, eye.z);
      camera.up.set(up.x, up.y, up.z);
      if (!this.reducedMotion) camera.up.applyAxisAngle(axis, flight.roll * CAMERA_ROLL);
      camera.lookAt(eye.x + forward.x * 100, eye.y + forward.y * 100, eye.z + forward.z * 100);
      camera.updateMatrixWorld();
      return;
    }
    const view = this.viewOf(this.view === 'fly' ? 'lesson' : this.view);
    const rate = 2.4;
    this.cameraAt.x = damp(this.cameraAt.x, view.at[0], rate, dt);
    this.cameraAt.y = damp(this.cameraAt.y, view.at[1], rate, dt);
    this.cameraAt.z = damp(this.cameraAt.z, view.at[2], rate, dt);
    this.cameraLook.x = damp(this.cameraLook.x, view.look[0], rate, dt);
    this.cameraLook.y = damp(this.cameraLook.y, view.look[1], rate, dt);
    this.cameraLook.z = damp(this.cameraLook.z, view.look[2], rate, dt);
    const fov = damp(camera.fov, view.fov, rate, dt);
    if (Math.abs(fov - camera.fov) > 0.001) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    const at = plane?.root.position ?? new THREE.Vector3(SHOWCASE.x, SHOWCASE.y, SHOWCASE.z);
    camera.up.set(0, 1, 0);
    camera.position.set(at.x + this.cameraAt.x, at.y + this.cameraAt.y, at.z + this.cameraAt.z);
    camera.lookAt(at.x + this.cameraLook.x, at.y + this.cameraLook.y, at.z + this.cameraLook.z);
    camera.updateMatrixWorld();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
