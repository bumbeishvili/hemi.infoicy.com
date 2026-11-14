// The picture of Frost Arena: the yard as the player sees it, from where they stand, down the sights of their
// rifle. The rules are in arena.js, and this only shows what they say.
//
// It's a little more real than the other games: a snowy yard with wooden crates, steel containers and concrete
// walls, pines and mountains behind the fence, proper shadows, and two rifles that look like what they are. But
// nothing flashes or strobes, as seizures are more common in children with hemiplegia: there's no muzzle flash,
// a shot is a thin line that fades and a little soft smoke, a hit is a puff of snow, and the picture itself never
// changes brightness. Nobody gets hurt: someone tagged out sits down in a few stars and is back at their end.
// The rifle's kick is in the view, as it is in where the shots go: it climbs as it fires and comes back down.
import * as THREE from '../../vendor/three/three.module.js';
import { Fighter3D, makePose } from '../../core/body/characters.js';
import { byId as characterWithId } from '../../core/body/roster.js';
import { Sparks } from '../../core/body/sparks.js';
import { BLOCKS, EYES, RIFLES, YARD, forwardOf, reachAlong } from './arena.js';

const FOV = 62;
const SPRINT_FOV = 1.05; // Sprinting, the view opens out a little.
const SIZE = 0.95; // The characters, beside the crates.
// A frame that takes longer than this has missed its turn on a screen that shows 60 a second. With more than half
// of them late for a second and a half, the picture is made cheaper to draw.
const SLOW_FRAME_SECONDS = 1 / 45;
const SLOW_CHECK_FRAMES = 90;
// How many pixels are drawn at most. A big, sharp screen has twice as many as anyone can tell apart in a game
// that's moving, and drawing them all is what makes it run slowly: this many keeps it smooth, and still sharp.
const MOST_PIXELS = 3_200_000;
const TRACERS = 10;
const TRACER_SECONDS = 0.09;
const FLAKES = 500; // Snowflakes in the air, from the level where it snows.
const CLEAR_DAY = { near: 38, far: 120 };
const SNOWING = { near: 14, far: 46 };
const CRATE_COLOURS = { double: '#ffc21a', boots: '#4aa3ff' };
// What comes off whatever a shot meets: snow off the snow, splinters off wood, and dust off steel and concrete.
// Being tagged out and back at their own end moves the player's view right across the yard. So that's never a
// flash, a soft snowy veil comes over the view in the last moment of sitting out, the view moves behind it, and it
// clears again, each taking this long.
const VEIL_SECONDS = 0.6;
const VEIL_COLOUR = '#d5e2ec';
const CHIPS = { snow: '#ffffff', crate: '#c9a473', crates: '#c9a473', fence: '#c9a473', container: '#cfd6dc', wall: '#c4c7cb' };
export const TEAM_COLOURS = ['#2f6fed', '#e0533a'];
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const damp = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));

/* ---------- what things are made of: drawn here, with no picture files ---------- */

function paint(width, height, draw, repeat = null) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
  }
  return texture;
}

/** The same numbers every time, so the yard looks the same every game. */
function steady(seed) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

const speckle = (ctx, width, height, random, count, colours, [low, high]) => {
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = colours[Math.floor(random() * colours.length)];
    const size = low + random() * (high - low);
    ctx.fillRect(random() * width, random() * height, size, size);
  }
};

const snowTexture = () => paint(512, 512, (ctx, width, height) => {
  const random = steady(11);
  ctx.fillStyle = '#eef3f8';
  ctx.fillRect(0, 0, width, height);
  // Soft hollows and drifts, and a fine sparkle, rather than anything with edges.
  for (let i = 0; i < 70; i += 1) {
    const x = random() * width;
    const y = random() * height;
    const size = 30 + random() * 70;
    const drift = ctx.createRadialGradient(x, y, 0, x, y, size);
    drift.addColorStop(0, random() < 0.5 ? 'rgba(214, 225, 237, 0.5)' : 'rgba(255, 255, 255, 0.6)');
    drift.addColorStop(1, 'rgba(238, 243, 248, 0)');
    ctx.fillStyle = drift;
    ctx.fillRect(x - size, y - size, size * 2, size * 2);
  }
  speckle(ctx, width, height, random, 1400, ['rgba(255, 255, 255, 0.8)', 'rgba(205, 217, 230, 0.5)'], [1, 2.5]);
  // Where boots have trodden it down.
  ctx.strokeStyle = 'rgba(176, 190, 206, 0.28)';
  ctx.lineWidth = 7;
  for (let i = 0; i < 7; i += 1) {
    ctx.beginPath();
    ctx.moveTo(random() * width, random() * height);
    ctx.bezierCurveTo(random() * width, random() * height, random() * width, random() * height, random() * width, random() * height);
    ctx.stroke();
  }
}, [9, 8]);

const woodTexture = () => paint(256, 256, (ctx, width, height) => {
  const random = steady(5);
  for (let plank = 0; plank < 4; plank += 1) {
    const y = (plank * height) / 4;
    ctx.fillStyle = ['#b98a55', '#a97b49', '#c2945f', '#b08352'][plank];
    ctx.fillRect(0, y, width, height / 4);
    ctx.strokeStyle = 'rgba(92, 62, 30, 0.35)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 7; i += 1) {
      const at = y + 6 + random() * (height / 4 - 12);
      ctx.beginPath();
      ctx.moveTo(0, at);
      ctx.bezierCurveTo(width * 0.3, at + random() * 6 - 3, width * 0.7, at + random() * 6 - 3, width, at);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(70, 46, 22, 0.55)';
    ctx.fillRect(0, y, width, 3);
  }
  // A band of snow along the top edge is put on separately: this is only the wood.
});

const steelTexture = (colour, dark) => paint(256, 256, (ctx, width, height) => {
  const random = steady(9);
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, width, height);
  // The ribs of a shipping container.
  for (let x = 0; x < width; x += 32) {
    const rib = ctx.createLinearGradient(x, 0, x + 32, 0);
    rib.addColorStop(0, 'rgba(255,255,255,0.10)');
    rib.addColorStop(0.5, 'rgba(0,0,0,0.16)');
    rib.addColorStop(1, 'rgba(255,255,255,0.10)');
    ctx.fillStyle = rib;
    ctx.fillRect(x, 0, 32, height);
  }
  speckle(ctx, width, height, random, 90, [dark, 'rgba(120, 84, 60, 0.35)'], [2, 7]);
});

const concreteTexture = () => paint(256, 256, (ctx, width, height) => {
  const random = steady(21);
  ctx.fillStyle = '#b9bcc0';
  ctx.fillRect(0, 0, width, height);
  speckle(ctx, width, height, random, 700, ['#aeb1b6', '#c4c7cb', '#a3a6ab'], [2, 9]);
  ctx.strokeStyle = 'rgba(80, 84, 90, 0.4)';
  ctx.lineWidth = 2;
  for (const y of [height / 2]) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
});

/** A soft round shadow, for under a player, on a slow computer that has given up the real ones. */
const blobTexture = () => paint(64, 64, (ctx, width, height) => {
  const fade = ctx.createRadialGradient(width / 2, height / 2, 2, width / 2, height / 2, width / 2);
  fade.addColorStop(0, 'rgba(40, 60, 90, 0.42)');
  fade.addColorStop(1, 'rgba(40, 60, 90, 0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, width, height);
});

/* ---------- the two rifles ---------- */

const part = (geometry, material, x, y, z, turn = null) => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  if (turn) mesh.rotation.set(turn[0], turn[1], turn[2]);
  mesh.castShadow = true;
  return mesh;
};
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const tube = (r, length) => new THREE.CylinderGeometry(r, r, length, 12).rotateX(Math.PI / 2);

/**
 * A rifle, pointing along -z, with its grip at the middle. kind is 'ak', with its wooden stock and curved
 * magazine, or 'm4', black, with its rail along the top and its straight magazine. Returns the rifle and its
 * magazine, which comes out and goes back in when it's changed, and where the end of its barrel is.
 */
export function buildRifle(kind) {
  const root = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: '#3a3f47', roughness: 0.55, metalness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: '#23262b', roughness: 0.7, metalness: 0.35 });
  const magazine = new THREE.Group();
  if (kind === 'ak') {
    const wood = new THREE.MeshStandardMaterial({ color: '#9a5f2e', roughness: 0.75 });
    const tan = new THREE.MeshStandardMaterial({ color: '#b5622d', roughness: 0.6 });
    root.add(
      part(box(0.05, 0.075, 0.3), steel, 0, 0.03, -0.02), // The receiver.
      part(box(0.044, 0.06, 0.24), wood, 0, 0.02, -0.29), // The wooden handguard.
      part(tube(0.012, 0.42), steel, 0, 0.035, -0.6), // The barrel.
      part(tube(0.015, 0.22), steel, 0, 0.066, -0.36), // The gas tube over it.
      part(box(0.012, 0.05, 0.016), steel, 0, 0.07, -0.76), // The front sight.
      part(box(0.03, 0.035, 0.03), steel, 0, 0.085, -0.13), // The rear sight.
      part(box(0.04, 0.085, 0.3), wood, 0, -0.012, 0.27, [0.16, 0, 0]), // The stock.
      part(box(0.04, 0.1, 0.045), wood, 0, -0.06, 0.07, [-0.3, 0, 0]), // The grip.
      part(box(0.01, 0.03, 0.05), steel, 0, -0.03, 0.01), // The trigger guard.
    );
    // The curved magazine: three pieces, each turned a little further forward.
    for (const [y, z, turn] of [[-0.05, 0, 0.14], [-0.115, -0.014, 0.42], [-0.172, -0.045, 0.72]]) magazine.add(part(box(0.034, 0.075, 0.058), tan, 0, y, z, [turn, 0, 0]));
    magazine.position.set(0, -0.005, -0.11);
  } else {
    root.add(
      part(box(0.05, 0.07, 0.24), dark, 0, 0.03, -0.01), // The receiver.
      part(box(0.03, 0.022, 0.42), dark, 0, 0.078, -0.14), // The rail along the top.
      part(tube(0.028, 0.26), dark, 0, 0.032, -0.27), // The round handguard.
      part(tube(0.011, 0.26), steel, 0, 0.032, -0.52), // The barrel.
      part(tube(0.016, 0.05), steel, 0, 0.032, -0.66), // The end of it.
      part(box(0.012, 0.06, 0.02), dark, 0, 0.075, -0.42), // The front sight.
      part(tube(0.016, 0.2), dark, 0, 0.03, 0.2), // The tube of the stock.
      part(box(0.042, 0.095, 0.12), dark, 0, 0.012, 0.33), // The stock.
      part(box(0.038, 0.1, 0.042), dark, 0, -0.058, 0.075, [-0.25, 0, 0]), // The grip.
      part(box(0.01, 0.03, 0.05), steel, 0, -0.03, 0.01), // The trigger guard.
    );
    magazine.add(part(box(0.03, 0.17, 0.055), steel, 0, -0.095, -0.012, [0.12, 0, 0]));
    magazine.position.set(0, 0, -0.07);
  }
  root.add(magazine);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.035, kind === 'ak' ? -0.82 : -0.7);
  root.add(muzzle);
  return { root, magazine, muzzle, home: magazine.position.clone() };
}

/* ---------- a player ---------- */

/** One of the characters, in their team's vest, with their rifle. */
class Player {
  /** ours says whether they're on the side of whoever is playing here: with friends, a team isn't always blue or red. */
  constructor(trooper, scene, blob, ours = trooper.team === 0) {
    this.trooper = trooper;
    this.fighter = new Fighter3D(characterWithId(trooper.who) ?? characterWithId('giraffe'));
    this.fighter.root.scale.setScalar(SIZE);
    this.fighter.root.traverse((node) => {
      if (node.isMesh) node.castShadow = true;
    });
    this.holdRifle();
    this.pose = makePose();
    this.root = new THREE.Group();
    this.root.add(this.fighter.root);
    // A shield carrier's shield: a wide plate held out in front, there for as long as it has shots left in it.
    this.shield = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.05, 0.06), new THREE.MeshStandardMaterial({ color: '#9fb4c8', roughness: 0.4, metalness: 0.5 }));
    this.shield.position.set(0, 0.28, 0.62);
    this.shield.castShadow = true;
    this.shield.visible = false;
    this.fighter.torso.add(this.shield);
    // The champions each have a gold crown over their head.
    this.crown = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.13, 6, 1, true), new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.35, metalness: 0.6, side: THREE.DoubleSide }));
    this.crown.position.set(0, 2.25, 0);
    this.crown.visible = Boolean(trooper.champion);
    this.root.add(this.crown);
    this.shieldDown = 0;
    // A ring on the snow under them in their team's colour, so nobody is in doubt whose side anyone is on,
    // whatever they're wearing.
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.66, 28), new THREE.MeshBasicMaterial({ color: TEAM_COLOURS[ours ? 0 : 1], transparent: true, opacity: 0.85, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.03;
    this.root.add(this.ring);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.02;
    this.shadow.visible = false;
    this.root.add(this.shadow);
    scene.add(this.root);
    this.step = 0;
    this.sit = 0;
    this.shown = 1;
  }

  /**
   * Their rifle, held in front of them in both hands. The characters are chunky, so it's a little bigger than
   * life, to be seen for what it is from across the yard. It points the way they face, which for them is +z. A
   * friend's is whichever their own game says they chose, which is only known once it has said.
   */
  holdRifle() {
    this.rifle?.root.removeFromParent();
    this.rifleKind = this.trooper.rifle;
    this.rifle = buildRifle(this.rifleKind);
    this.rifle.root.scale.setScalar(1.3);
    this.rifle.root.rotation.set(0, Math.PI, 0);
    this.rifle.root.position.set(0, 0.34, 0.36);
    this.fighter.torso.add(this.rifle.root);
  }

  update(dt, reducedMotion) {
    const { trooper, pose, fighter } = this;
    // A friend who has gone is gone from the yard.
    if (trooper.state === 'gone') {
      this.root.visible = false;
      return;
    }
    if (trooper.rifle !== this.rifleKind) this.holdRifle();
    const out = trooper.state === 'out';
    this.sit = damp(this.sit, out ? 1 : 0, 6, dt);
    // Just back at their end, they shimmer for a moment: nothing can hit them yet.
    const safe = trooper.safeLeft > 0 && !out;
    this.shown = damp(this.shown, out ? clamp(trooper.outLeft / 0.6, 0, 1) : 1, 8, dt);
    this.root.visible = this.shown > 0.02;
    this.root.position.set(trooper.x, 0, trooper.z);
    this.root.scale.setScalar(0.35 + 0.65 * this.shown);
    // The character's forward is +z, and the yard's heading 0 is along -z.
    fighter.root.rotation.y = Math.PI - trooper.heading;
    this.step += dt * (4 + trooper.speed * 2.2);
    const stride = clamp(trooper.speed / 4, 0, 1) * (reducedMotion ? 0.4 : 1);
    const swing = Math.sin(this.step) * stride;
    Object.assign(pose, {
      hipDrop: 0.05 + this.sit * 0.36,
      pitch: 0.1 + trooper.hitLeft * 0.5,
      twist: 0,
      up: Math.abs(Math.cos(this.step)) * 0.03 * stride,
      // Their right hand on the rifle's grip and their left under its handguard, as far forward as it reaches.
      handRX: 0.56, handRY: -0.2 - this.sit * 0.12, handRZ: 0.5,
      handLX: -0.56, handLY: -0.12 - this.sit * 0.12, handLZ: 0.8,
      openR: 0.1, openL: 0.25,
      footLZ: swing * 0.34 + this.sit * 0.3, footRZ: -swing * 0.34 + this.sit * 0.3,
      footLY: Math.max(0, swing) * 0.1, footRY: Math.max(0, -swing) * 0.1,
      headPitch: this.sit * 0.3,
    });
    // Up to the eye while they're firing, a little lower otherwise, and down across their knees sitting it out.
    this.aim = damp(this.aim ?? 0, trooper.firing ? 1 : 0, 9, dt);
    this.rifle.root.rotation.x = 0.28 * (1 - this.aim) + this.sit * 0.5;
    this.rifle.root.position.y = 0.34 + this.aim * 0.06 - this.sit * 0.1;
    fighter.setPose(pose);
    fighter.update(dt);
    // The shield sinks down out of the way once it's taken all it can, and is up again when they're back.
    this.shieldDown = damp(this.shieldDown, trooper.shield > 0 ? 0 : 1, 7, dt);
    this.shield.visible = trooper.part === 'shield' && this.shieldDown < 0.97;
    this.shield.position.y = 0.28 - this.shieldDown * 0.9;
    this.crown.visible = Boolean(trooper.champion) && !out;
    const expression = out ? 'hurt' : trooper.hitLeft > 0 ? 'hurt' : trooper.firing ? 'ready' : 'happy';
    if (fighter.expression !== expression) fighter.setExpression(expression);
    this.fighter.root.visible = !safe || reducedMotion || Math.sin(this.step * 2.2) > -0.55;
  }

  /** Where the end of their barrel is, in the yard. */
  muzzleAt(out) {
    return this.rifle.muzzle.getWorldPosition(out);
  }

  dispose() {
    this.root.removeFromParent();
    this.fighter.dispose();
  }
}

export class Yard {
  constructor(canvas) {
    this.canvas = canvas;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#bfd9ee');
    this.scene.fog = new THREE.Fog('#d5e6f3', 38, 120);
    this.scene.add(new THREE.HemisphereLight('#f4f9ff', '#c5d2de', 1.5));
    const sun = new THREE.DirectionalLight('#fff4e2', 2.1);
    sun.position.set(-18, 30, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 24, bottom: -24, near: 5, far: 80 });
    sun.shadow.bias = -0.0006;
    this.sun = sun;
    this.scene.add(sun, sun.target);

    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 220);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    // In front of everything, the rifle too, and only there while it's showing at all: see VEIL_SECONDS.
    this.veil = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ color: VEIL_COLOUR, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false }));
    this.veil.position.set(0, 0, -0.1);
    this.veil.renderOrder = 1000;
    this.veil.visible = false;
    this.veil.frustumCulled = false;
    this.camera.add(this.veil);
    this.sparks = new Sparks(this.scene);
    this.blob = blobTexture();
    this.players = new Map();
    this.match = null;
    this.rifle = null;
    this.kick = 0;
    this.sway = 0;
    this.reloadShare = 0;
    this.time = 0;
    this.frames = 0;
    this.slowFrames = 0;
    this.quality = 2;
    this.point = new THREE.Vector3();
    this.other = new THREE.Vector3();

    this.buildYard();
    this.buildTracers();
    this.buildSnow();
    this.buildCrate();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.resize();
  }

  /* ---------- the yard itself ---------- */

  buildYard() {
    const { scene } = this;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(YARD.halfX * 2 + 60, YARD.halfZ * 2 + 60), new THREE.MeshStandardMaterial({ map: snowTexture(), roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const wood = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.85 });
    const concrete = new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.9 });
    const steels = [['#3f7f9c', '#2c5d73'], ['#b5553a', '#8a3d29'], ['#4d8a5b', '#376644'], ['#c9a13d', '#9a7a2b']].map(([colour, dark]) => new THREE.MeshStandardMaterial({ map: steelTexture(colour, dark), roughness: 0.6, metalness: 0.25 }));
    const snow = new THREE.MeshStandardMaterial({ color: '#f4f8fc', roughness: 1 });
    let containers = 0;
    for (const block of BLOCKS) {
      const material = block.kind === 'container' ? steels[containers++ % steels.length] : block.kind === 'wall' ? concrete : wood;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(block.w, block.h, block.d), material);
      mesh.position.set(block.x, block.h / 2, block.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Snow lying on top of it.
      const cap = new THREE.Mesh(new THREE.BoxGeometry(block.w + 0.08, 0.1, block.d + 0.08), snow);
      cap.position.set(block.x, block.h + 0.04, block.z);
      cap.receiveShadow = true;
      scene.add(mesh, cap);
    }

    // The fence round the yard: posts and boards, low enough to see the pines and mountains over.
    const post = new THREE.BoxGeometry(0.18, 2.3, 0.18);
    const fence = new THREE.Group();
    const board = (length, x, z, turned) => {
      for (const y of [0.6, 1.35, 2.05]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(turned ? 0.07 : length, 0.36, turned ? length : 0.07), wood);
        rail.position.set(x, y, z);
        rail.castShadow = true;
        fence.add(rail);
      }
    };
    board(YARD.halfX * 2, 0, -YARD.halfZ - 0.1, false);
    board(YARD.halfX * 2, 0, YARD.halfZ + 0.1, false);
    board(YARD.halfZ * 2, -YARD.halfX - 0.1, 0, true);
    board(YARD.halfZ * 2, YARD.halfX + 0.1, 0, true);
    for (let x = -YARD.halfX; x <= YARD.halfX; x += 4) for (const z of [-YARD.halfZ - 0.1, YARD.halfZ + 0.1]) fence.add(part(post, wood, x, 1.15, z));
    for (let z = -YARD.halfZ; z <= YARD.halfZ; z += 5) for (const x of [-YARD.halfX - 0.1, YARD.halfX + 0.1]) fence.add(part(post, wood, x, 1.15, z));
    scene.add(fence);

    // Each end, marked on the snow in the colour of whoever's it is, and a flag at each: see showEnds.
    this.ends = [[0, YARD.halfZ - 1.6], [1, -YARD.halfZ + 1.6]].map(([team, z]) => {
      const mat = new THREE.Mesh(new THREE.PlaneGeometry(18, 2.6), new THREE.MeshStandardMaterial({ color: TEAM_COLOURS[team], transparent: true, opacity: 0.22, roughness: 1 }));
      mat.rotation.x = -Math.PI / 2;
      mat.position.set(0, 0.015, z);
      const pole = part(new THREE.CylinderGeometry(0.05, 0.05, 4.2, 8), concrete, 10 * (team ? -1 : 1), 2.1, z + (team ? -0.9 : 0.9));
      const flag = part(new THREE.BoxGeometry(1.3, 0.8, 0.03), new THREE.MeshStandardMaterial({ color: TEAM_COLOURS[team], roughness: 0.9 }), pole.position.x + 0.68, 3.7, pole.position.z);
      scene.add(mat, pole, flag);
      return { z, mat, flag };
    });

    // Pines and mountains beyond the fence, the same every game.
    const random = steady(31);
    const needles = new THREE.MeshStandardMaterial({ color: '#2f6b4a', roughness: 1 });
    const trunk = new THREE.MeshStandardMaterial({ color: '#6b4a2f', roughness: 1 });
    const far = new THREE.MeshStandardMaterial({ color: '#a9bfd4', roughness: 1 });
    const peak = new THREE.MeshStandardMaterial({ color: '#f2f6fa', roughness: 1 });
    for (let i = 0; i < 46; i += 1) {
      const angle = (i / 46) * Math.PI * 2 + random() * 0.1;
      const away = 1.18 + random() * 0.5;
      const x = Math.sin(angle) * (YARD.halfX + 6) * away;
      const z = Math.cos(angle) * (YARD.halfZ + 6) * away;
      const tall = 4 + random() * 4;
      const tree = new THREE.Group();
      tree.add(part(new THREE.CylinderGeometry(0.16, 0.22, 1.4, 7), trunk, 0, 0.7, 0));
      for (const [y, size] of [[1.2, 1], [2.3, 0.76], [3.3, 0.5]]) tree.add(part(new THREE.ConeGeometry(1.5 * size, tall * 0.42, 9), needles, 0, y * (tall / 5) + tall * 0.2, 0));
      tree.position.set(x, 0, z);
      scene.add(tree);
    }
    for (let i = 0; i < 9; i += 1) {
      const angle = (i / 9) * Math.PI * 2 + 0.3;
      const size = 26 + random() * 22;
      const mountain = new THREE.Mesh(new THREE.ConeGeometry(size, size * 0.9, 6), far);
      mountain.position.set(Math.sin(angle) * 120, size * 0.4, Math.cos(angle) * 120);
      mountain.rotation.y = random() * 3;
      const top = new THREE.Mesh(new THREE.ConeGeometry(size * 0.36, size * 0.33, 6), peak);
      top.position.set(mountain.position.x, size * 0.69, mountain.position.z);
      top.rotation.y = mountain.rotation.y;
      scene.add(mountain, top);
    }
  }

  buildTracers() {
    this.tracers = Array.from({ length: TRACERS }, () => {
      const line = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 6).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#fff6d8', transparent: true, opacity: 0, depthWrite: false }));
      line.visible = false;
      this.scene.add(line);
      return { line, left: 0 };
    });
    this.nextTracer = 0;
  }

  /** Snowflakes, drifting down round wherever the child is, from the level where it snows. */
  buildSnow() {
    const places = new Float32Array(FLAKES * 3);
    const random = steady(41);
    for (let i = 0; i < FLAKES; i += 1) {
      places[i * 3] = (random() - 0.5) * 40;
      places[i * 3 + 1] = random() * 12;
      places[i * 3 + 2] = (random() - 0.5) * 40;
    }
    const flakes = new THREE.BufferGeometry();
    flakes.setAttribute('position', new THREE.BufferAttribute(places, 3));
    this.snow = new THREE.Points(flakes, new THREE.PointsMaterial({ color: '#ffffff', size: 0.09, transparent: true, opacity: 0.85, depthWrite: false }));
    this.snow.frustumCulled = false;
    this.snow.visible = false;
    this.scene.add(this.snow);
  }

  /** A crate with something in it, from the levels that have them: wooden, with a band in its own colour. */
  buildCrate() {
    const crate = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.85 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), wood);
    body.position.y = 0.35;
    body.castShadow = true;
    this.crateBand = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.2, 0.94), new THREE.MeshStandardMaterial({ color: CRATE_COLOURS.double, roughness: 0.6 }));
    this.crateBand.position.y = 0.4;
    crate.add(body, this.crateBand);
    crate.visible = false;
    this.crate = crate;
    this.scene.add(crate);
  }

  /**
   * How many pixels are drawn for each one of the page's: as sharp as the screen, up to twice, as long as that's
   * no more than MOST_PIXELS in all, and never sharper than one for one on a computer that has turned out slow.
   */
  sharpness(width, height) {
    if ((this.quality ?? 2) < 2) return 1;
    return Math.max(1, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(MOST_PIXELS / (width * height))));
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.width = width;
    this.height = height;
    this.renderer.setPixelRatio(this.sharpness(width, height));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    // A little wider on a tall window, so there's as much to see either side.
    this.fov = FOV * clamp(1.5 / (width / height) ** 0.5, 0.85, 1.25);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }

  /* ---------- a new match ---------- */

  /**
   * Each end of the yard is the colour of whoever comes in there, as whoever is playing here sees them: blue for
   * their own side and red for anyone to be tagged. Alone and together that's blue at the near end and red at
   * the far one. Against each other, the player's own start is the blue one, if it's at an end.
   */
  showEnds() {
    const { child, troopers } = this.match;
    for (const end of this.ends) {
      const there = troopers.filter(({ home }) => Math.abs(home.z - end.z) < 3);
      const ours = there.length ? there.some(({ team }) => team === child.team) : end.z > 0;
      const colour = TEAM_COLOURS[ours ? 0 : 1];
      end.mat.material.color.set(colour);
      end.flag.material.color.set(colour);
    }
  }

  setMatch(match) {
    for (const player of this.players.values()) player.dispose();
    this.players.clear();
    this.match = match;
    if (this.rifle) this.rifle.root.removeFromParent();
    this.rifle = null;
    for (const tracer of this.tracers) tracer.line.visible = false;
    if (!match) return;
    for (const trooper of match.troopers) {
      if (trooper === match.child) continue;
      const player = new Player(trooper, this.scene, this.blob, trooper.team === match.child.team);
      player.shadow.visible = this.quality < 2;
      this.players.set(trooper, player);
    }
    this.showEnds();
    // The child's own rifle, down the right of the picture, as they'd see it held at the shoulder.
    this.rifle = buildRifle(match.child.rifle);
    this.rifle.root.traverse((node) => {
      if (node.isMesh) node.castShadow = false;
    });
    this.camera.add(this.rifle.root);
    this.kick = 0;
    this.reloadShare = 0;
    // When it's snowing, there's snow in the air, and the far end of the yard is lost in it.
    const snowing = Boolean(match.plan.snow);
    this.snow.visible = snowing && !this.reducedMotion;
    Object.assign(this.scene.fog, snowing ? SNOWING : CLEAR_DAY);
    this.scene.background.set(snowing ? '#d3e0ea' : '#bfd9ee');
    this.scene.fog.color.set(snowing ? '#d9e4ec' : '#d5e6f3');
    this.crate.visible = false;
    this.placeCamera(1 / 60, true);
  }

  /** The player sees from where they stand, the way they're looking, with the rifle's kick in it. */
  placeCamera(dt, snap = false) {
    const { camera, match } = this;
    const { child } = match;
    const walking = clamp(child.speed / 4.4, 0, 1.4) * (this.reducedMotion ? 0 : 1);
    this.sway += dt * (3 + child.speed * 1.6);
    const bob = Math.sin(this.sway * 2) * 0.03 * walking;
    const sat = child.state === 'out' ? 0.75 : 0;
    this.eye = snap ? EYES - sat : damp(this.eye ?? EYES, EYES - sat, 5, dt);
    // The veil comes over in the last moment of sitting out, and clears once they're back, never faster than that.
    const veiled = child.state === 'out' ? clamp(1 - (child.outLeft ?? 0) / VEIL_SECONDS, 0, 1) : 0;
    const veil = snap ? 0 : clamp(veiled, this.veil.material.opacity - dt / VEIL_SECONDS, this.veil.material.opacity + dt / VEIL_SECONDS);
    this.veil.material.opacity = veil;
    this.veil.visible = veil > 0.001;
    camera.position.set(child.x, this.eye + bob, child.z);
    this.kick = damp(this.kick, 0, 16, dt);
    camera.rotation.set(child.punch.pitch, -(child.heading + child.punch.yaw), 0);
    // Sprinting, the view opens out a little, and the rifle comes down across the body: it can't be aimed.
    this.sprint = damp(this.sprint ?? 0, child.sprinting ? 1 : 0, 8, dt);
    const fov = this.fov * (1 + (SPRINT_FOV - 1) * this.sprint * (this.reducedMotion ? 0 : 1));
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    // The rifle: down to the right, swaying a little with each step, kicking back with each shot, and tipped
    // down and across while its magazine is changed.
    const changing = child.reloadLeft > 0 ? 1 : 0;
    this.reloadShare = damp(this.reloadShare, changing, 9, dt);
    const { rifle } = this;
    rifle.root.position.set(0.2 + Math.sin(this.sway) * 0.006 * walking - this.sprint * 0.05, -0.2 - this.reloadShare * 0.08 + bob * 0.3 - this.sprint * 0.06, -0.52 + this.kick * 0.04);
    rifle.root.rotation.set(0.02 - this.kick * 0.035 - this.reloadShare * 0.5 - this.sprint * 0.22, 0.11 + this.reloadShare * 0.5 + this.sprint * 0.5, -this.reloadShare * 0.45 - this.sprint * 0.2);
    // The magazine drops out for the first part of the change, and a new one comes up for the rest.
    const total = RIFLES[child.rifle].reload;
    const through = changing ? 1 - child.reloadLeft / total : 1;
    const out = changing ? (through < 0.5 ? through * 2 : (1 - through) * 2) : 0;
    rifle.magazine.position.set(rifle.home.x, rifle.home.y - out * 0.3, rifle.home.z);
    rifle.magazine.visible = !(changing && through > 0.42 && through < 0.58);
  }

  /* ---------- what the rules say has happened ---------- */

  onEvent(event) {
    const handlers = {
      shot: () => this.onShot(event),
      hit: () => this.onHit(event),
      tagged: () => this.onTagged(event),
      back: () => this.puff(event.trooper, { count: 5, colours: ['#ffffff', '#eaf2f9'], size: 0.7, up: 1.4 }),
      bonk: () => this.onBonk(event),
      'crate-got': () => this.onCrateGot(event),
    };
    handlers[event.type]?.();
  }

  /** Where someone is hit, or fired at: about chest high. */
  chestOf(trooper, out) {
    return out.set(trooper.x, trooper.state === 'out' ? 0.6 : 1.1, trooper.z);
  }

  onShot({ by, at, hit, to, what }) {
    const { match, point, other } = this;
    const mine = by === match.child;
    if (mine) {
      this.kick = Math.min(1.6, this.kick + (this.reducedMotion ? 0.3 : 1));
      this.rifle.muzzle.getWorldPosition(point);
    } else {
      const player = this.players.get(by);
      if (!player) return;
      player.muzzleAt(point);
    }
    if (to) {
      // The player's own shot: to wherever the rules say it ended, with a little of whatever it met coming off.
      other.set(to.x, to.y, to.z);
      const chip = CHIPS[what];
      if (chip) this.sparks.emit({ shape: 'puff', colour: chip, at: other, velocity: [(Math.random() - 0.5) * 0.6, 0.9, (Math.random() - 0.5) * 0.6], life: 0.45, size: what === 'snow' ? 0.3 : 0.22, grow: 0.8, opacity: 0.75 });
    } else if (hit) {
      // One that lands goes to them. One that doesn't goes just past, as far as whatever's behind.
      this.chestOf(at, other);
    } else {
      const heading = Math.atan2(at.x - by.x, -(at.z - by.z)) + (Math.random() < 0.5 ? -1 : 1) * (0.04 + Math.random() * 0.05);
      const reach = reachAlong(by, heading);
      const way = forwardOf(heading);
      other.set(by.x + way.x * reach, 1 + Math.random() * 0.8, by.z + way.z * reach);
      this.sparks.emit({ shape: 'puff', colour: '#ffffff', at: other, velocity: [0, 0.8, 0], life: 0.5, size: 0.35, grow: 0.8, opacity: 0.7 });
    }
    this.tracer(point, other);
    // A little soft smoke at the end of the barrel, and no flash.
    this.sparks.emit({ shape: 'puff', colour: '#e9edf1', at: point, velocity: [0, 0.5, 0], life: 0.35, size: mine ? 0.09 : 0.3, grow: mine ? 0.25 : 0.7, opacity: 0.5 });
  }

  tracer(from, to) {
    const item = this.tracers[this.nextTracer];
    this.nextTracer = (this.nextTracer + 1) % this.tracers.length;
    const { line } = item;
    const length = from.distanceTo(to);
    line.position.copy(from).lerp(to, 0.5);
    line.scale.set(1, 1, Math.max(0.1, length));
    line.lookAt(to);
    line.visible = true;
    item.left = TRACER_SECONDS;
  }

  onHit({ trooper }) {
    if (trooper === this.match.child) return;
    const at = this.chestOf(trooper, this.point);
    this.sparks.emit({ shape: 'puff', colour: '#ffffff', at, velocity: [(Math.random() - 0.5) * 1.5, 1.2, (Math.random() - 0.5) * 1.5], life: 0.45, size: 0.3, grow: 0.9, opacity: 0.8 });
  }

  onTagged({ trooper }) {
    if (trooper === this.match.child) return;
    const at = this.chestOf(trooper, this.point);
    for (let i = 0; i < 7; i += 1) {
      const angle = (i / 7) * Math.PI * 2;
      this.sparks.emit({ shape: 'star', colour: i % 2 ? '#ffd23f' : '#ffffff', at, velocity: [Math.sin(angle) * 2.2, 2.6, Math.cos(angle) * 2.2], life: 0.9, size: 0.3, gravity: 6 });
    }
  }

  /** A shot bouncing off a shield: a couple of small sparks off its face, and a clatter of stars when it goes down. */
  onBonk({ trooper, down }) {
    const at = this.chestOf(trooper, this.point);
    const count = down ? 6 : 2;
    for (let i = 0; i < count; i += 1) {
      this.sparks.emit({ shape: down ? 'star' : 'spark', colour: i % 2 ? '#dfe6ee' : '#ffffff', at, velocity: [(Math.random() - 0.5) * 3, 1.5 + Math.random() * 1.5, (Math.random() - 0.5) * 3], life: 0.5, size: 0.22, gravity: 6 });
    }
  }

  /** A crate picked up: it opens in a few stars of its own colour. */
  onCrateGot({ crate }) {
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2;
      this.sparks.emit({ shape: 'star', colour: i % 2 ? CRATE_COLOURS[crate.kind] : '#ffffff', at: { x: crate.x, y: 0.8, z: crate.z }, velocity: [Math.sin(angle) * 2, 2.4, Math.cos(angle) * 2], life: 0.8, size: 0.28, gravity: 5 });
    }
  }

  puff(trooper, { count, colours, size, up }) {
    if (trooper === this.match.child) return;
    for (let i = 0; i < count; i += 1) {
      this.sparks.emit({ shape: 'puff', colour: colours[i % colours.length], at: { x: trooper.x + (Math.random() - 0.5) * 0.8, y: 0.5 + Math.random(), z: trooper.z + (Math.random() - 0.5) * 0.8 }, velocity: [0, up, 0], life: 0.8, size, grow: 1.2, opacity: 0.7 });
    }
  }

  /* ---------- every frame ---------- */

  /** A slow computer gives up sharpness first, and then its real shadows for soft round ones. */
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
      this.resize();
    } else {
      this.renderer.shadowMap.enabled = false;
      this.sun.castShadow = false;
    }
    for (const player of this.players.values()) player.shadow.visible = true;
  }

  update(dt) {
    this.time += dt;
    this.watchSpeed(dt);
    if (!this.match) return;
    this.placeCamera(dt);
    for (const player of this.players.values()) player.update(dt, this.reducedMotion);
    this.showCrate();
    if (this.snow.visible) this.fall(dt);
    for (const item of this.tracers) {
      if (item.left <= 0) continue;
      item.left -= dt;
      item.line.material.opacity = clamp(item.left / TRACER_SECONDS, 0, 1) * 0.55;
      if (item.left <= 0) item.line.visible = false;
    }
    this.sparks.update(dt);
  }

  /** The crate, where the rules have it, turning slowly so it catches the eye. */
  showCrate() {
    const { crate } = this.match;
    this.crate.visible = Boolean(crate);
    if (!crate) return;
    this.crate.position.set(crate.x, 0, crate.z);
    this.crateBand.material.color.set(CRATE_COLOURS[crate.kind]);
    if (!this.reducedMotion) this.crate.rotation.y = this.time * 0.6;
  }

  /** The snow comes down slowly round the child, each flake starting again at the top once it's landed. */
  fall(dt) {
    const { child } = this.match;
    const places = this.snow.geometry.attributes.position;
    for (let i = 0; i < FLAKES; i += 1) {
      let y = places.getY(i) - dt * (0.9 + (i % 5) * 0.12);
      if (y < 0) y += 12;
      places.setY(i, y);
    }
    places.needsUpdate = true;
    this.snow.position.set(child.x, 0, child.z);
  }

  /** How many pixels from the middle of the screen something this far off the middle of the view is, in radians. */
  pixelsFor(angle) {
    return (Math.tan(angle) / Math.tan(((this.camera.fov * Math.PI) / 180) / 2)) * (this.height / 2);
  }

  /** Where something in the yard is on the screen, in pixels, and whether it's behind the player. */
  project(x, y, z) {
    const at = this.point.set(x, y, z).project(this.camera);
    return { x: ((at.x + 1) / 2) * this.width, y: ((1 - at.y) / 2) * this.height, behind: at.z > 1 };
  }

  /** How far round from straight ahead something is, for the arrow to it when it's out of view: right is positive. */
  offView(x, z) {
    const { child } = this.match;
    return Math.atan2(Math.sin(Math.atan2(x - child.x, -(z - child.z)) - child.heading), Math.cos(Math.atan2(x - child.x, -(z - child.z)) - child.heading));
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
