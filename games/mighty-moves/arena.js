// The stage, the two fighters on it, and the effects that go with every move.
//
// Nothing flashes or strobes: seizures are more common in children with hemiplegia. A hit is a
// burst of small shapes where it lands, and the picture itself never changes brightness.
import * as THREE from '../../vendor/three/three.module.js';
import { Fighter3D, makePose, mixPose, sampleClip } from '../../core/body/characters.js';
import { SHAPES, Sparks, spriteTexture } from '../../core/body/sparks.js';
import { BODY_KEYS, CLIPS, HELD, STANCE } from './clips.js';

const STAGE_RADIUS = 5.6;
const START_GAP = 2.7;
const STRIKE_GAP = 1.55; // How close a strike brings a fighter.
const BIG_MOVES = new Set(['stomp', 'flying', 'starBurst', 'turbo', 'sweep', 'thunderClap', 'whirlwind']);
const SLOW_FRAME_SECONDS = 1 / 40;
const SLOW_CHECK_FRAMES = 90;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const damp = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));
const NARROWEST_FEET = 0.17; // A fighter copying a child never has its feet closer together than its hips.
// The fighter takes this much of how a child leans and turns, which the camera reads least surely of all.
const LEAN_SHARE = 0.6;

/**
 * A fighter copying a child: their arms and hands, how they lean and turn, how far they sink, their legs and their
 * jumps. pose is what the fighter would otherwise be doing, and gets the child's body over it.
 */
function copyBody(pose, live) {
  for (const key of BODY_KEYS) pose[key] = live[key];
  for (const key of ['pitch', 'roll', 'twist']) pose[key] = live[key] * LEAN_SHARE;
  pose.footLX = Math.max(live.footLX, NARROWEST_FEET);
  pose.footRX = Math.min(live.footRX, -NARROWEST_FEET);
  return pose;
}
const between = (low, high) => low + Math.random() * (high - low);

// The camera sits behind the child's fighter, off to its right. The child's right hand is then
// on the right of the screen, as it is in the mirror, and the opponent faces them.
// Together, two against two: the second pair, the friend's fighter and their computer one, stands further back and
// over to the right, so that the camera, which looks across from the child's side, sees the friend's between the
// first pair and their computer one beside it, and nobody is hidden behind anybody. ally is where the friend's
// fighter stands across, and the computer's stands gap from it, a little more than the first pair's, as it's further.
const BACK_PAIR = { z: -2.8, ally: 0.9, gap: 3 };

const VIEWS = {
  fight: { at: [-3.75, 2.25, 5.5], look: [0.3, 1.2, -0.2], fov: 31 },
  fightTwoByTwo: { at: [-2.4, 3, 7.8], look: [0.7, 1.1, -1.3], fov: 33 },
  choose: { at: [-1.35, 1.6, 7.3], look: [-1.35, 0.92, 0], fov: 30 },
  intro: { at: [0, 2, 8.3], look: [0, 1.25, 0], fov: 30 },
  win: { at: [0.9, 1.75, 5.6], look: [-1.1, 1.2, 0], fov: 30 },
};

// A picture taller than it's wide, as each half of the split screen is, would cut the fighters off at its sides,
// so there the camera stands further back. On the chooser the fighter also stays clear of the cards above and below.
const NARROW_VIEWS = {
  fight: { at: [-5.6, 2.9, 8.6], look: [0, 1.1, -0.4], fov: 40 },
  fightTwoByTwo: { at: [-5.2, 3.6, 10.4], look: [1.1, 1, -1.3], fov: 42 },
  choose: { at: [-1.35, 1.6, 16], look: [-1.35, 1.3, 0], fov: 30 },
  intro: { at: [0, 2.3, 14], look: [0, 1.25, 0], fov: 32 },
  win: { at: [1.6, 2, 9.6], look: [-1.1, 1.2, 0], fov: 32 },
};

/* ------------------------------- one fighter on the stage ------------------------------- */

/** Chooses what a fighter's body is doing, from its moves and its reactions. */
class Stander {
  constructor(spec, side) {
    this.spec = spec;
    this.side = side; // -1 is the child's end of the stage and 1 the opponent's.
    this.body = new Fighter3D(spec);
    this.home = side * (START_GAP / 2);
    this.x = this.home;
    this.y = 0;
    this.body.root.position.x = this.x;
    this.fightFacing = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    this.facing = this.fightFacing;
    this.presenting = false; // Turned to the camera, rather than to the other fighter.
    this.body.faceTowards(this.facing);

    this.action = null;
    this.reaction = null;
    this.held = null;
    this.heldMix = 0;
    this.guarding = false;
    this.guardMix = 0;
    this.warning = 0;
    this.warningMix = 0;
    this.warningPose = 'lookOut'; // Or 'ballUp', holding the soft ball ready to throw.
    this.ducking = false;
    this.duckMix = 0;
    this.z = 0;
    this.time = Math.random() * 10;
    // A child's body, for their own fighter to copy, or a friend's, from their computer. null when there's none.
    this.live = null;
    this.liveMix = 0;

    this.base = makePose();
    this.clipPose = makePose();
    this.final = makePose();
    this.working = makePose();
    this.copied = makePose();
  }

  /** Copying a child, rather than standing ready on its own. */
  get copying() {
    return this.liveMix > 0.5 && !this.presenting;
  }

  /**
   * Starts a move. gap is how far it has to travel to reach the other fighter. A fighter copying a child starts
   * it from just where the child is, so the move carries on from what they did, rather than from the start.
   */
  play(name, { side = 'right', gap = 0 } = {}) {
    let clip = CLIPS[name][side];
    if (this.copying) clip = { ...clip, frames: [{ t: 0, pose: { ...this.final } }, ...clip.frames.slice(1)] };
    this.action = { clip, t: 0, gap, name };
    this.body.setExpression('strike', 0.6);
  }

  react(name) {
    this.reaction = { clip: CLIPS[name].right, t: 0, name };
    this.body.setExpression(name === 'block' ? 'ready' : 'hurt', 0.55);
  }

  /** A pose that lasts until it's replaced: 'win', 'dizzy', 'wave' or null. */
  hold(name) {
    this.held = name;
    this.action = null;
    this.reaction = null;
    if (name === 'win') this.body.setExpression('happy');
    else if (name === 'dizzy') this.body.setExpression('dizzy');
    else if (name === 'wave') this.body.setExpression('happy');
    else this.body.setExpression('ready');
    if (name) this.heldMix = Math.max(this.heldMix, 0.01);
  }

  update(dt, reducedMotion) {
    this.time += dt;
    const { base, final, clipPose, working } = this;

    this.facing = damp(this.facing, this.presenting ? 0.14 : this.fightFacing, 7, dt);
    this.body.faceTowards(this.facing);

    // Breathing and shifting about, so a fighter is never quite still.
    Object.assign(base, STANCE);
    if (!reducedMotion) {
      const bob = Math.sin(this.time * 4.2);
      base.hipDrop += 0.012 + bob * 0.012;
      base.handLY += bob * 0.018;
      base.handRY -= bob * 0.018;
      base.pitch += Math.sin(this.time * 2.1) * 0.012;
    }

    // Copying a child, whatever they do, the fighter does, easing in and out as the camera finds or loses them.
    if (this.live) copyBody(Object.assign(this.copied, base), this.live);
    this.liveMix = damp(this.liveMix, this.live && !this.presenting ? 1 : 0, 10, dt);
    if (this.liveMix > 0.001) mixPose(base, base, this.copied, this.liveMix);

    this.warningMix = damp(this.warningMix, this.warning > 0 ? 1 : 0, 9, dt);
    if (this.warningMix > 0.01) mixPose(base, { ...base }, HELD[this.warningPose], this.warningMix);

    this.guardMix = damp(this.guardMix, this.guarding ? 1 : 0, 18, dt);
    if (this.guardMix > 0.01) mixPose(base, { ...base }, HELD.guard, this.guardMix);

    this.duckMix = damp(this.duckMix, this.ducking ? 1 : 0, 14, dt);
    if (this.duckMix > 0.01) mixPose(base, { ...base }, HELD.duck, this.duckMix);

    this.heldMix = damp(this.heldMix, this.held ? 1 : 0, 7, dt);
    if (this.held) this.fading = this.held;
    if (this.fading && this.heldMix > 0.01) {
      Object.assign(working, HELD[this.fading]);
      if (this.fading === 'win' && !reducedMotion) {
        const hop = Math.abs(Math.sin(this.time * 4.6));
        working.up = hop * 0.42;
        working.squash = hop < 0.14 ? 0.08 : -0.03;
        working.handLX += Math.sin(this.time * 9) * 0.1;
        working.handRX += Math.sin(this.time * 9) * 0.1;
      }
      if (this.fading === 'wave' && !reducedMotion) {
        working.handRX += Math.sin(this.time * 7) * 0.22;
        working.hipX = Math.sin(this.time * 3.5) * 0.03;
      }
      mixPose(base, { ...base }, working, this.heldMix);
    }

    Object.assign(final, base);
    let forward = 0;

    if (this.reaction) {
      const { clip } = this.reaction;
      this.reaction.t += dt;
      sampleClip(clip, this.reaction.t, clipPose);
      // A reaction fades out towards whatever the body is doing.
      const fade = clamp((clip.duration - this.reaction.t) / 0.14, 0, 1);
      mixPose(final, base, clipPose, fade);
      forward += clipPose.forward * fade;
      if (this.reaction.t >= clip.duration) this.reaction = null;
    }

    if (this.action) {
      const { clip, gap } = this.action;
      this.action.t += dt;
      sampleClip(clip, this.action.t, clipPose);
      const fadeIn = clamp(this.action.t / 0.035, 0, 1);
      const fadeOut = clamp((clip.duration - this.action.t) / 0.16, 0, 1);
      const weight = Math.min(fadeIn, fadeOut);
      mixPose(final, { ...final }, clipPose, weight);
      forward += (clip.lunge ? clipPose.forward * gap : clipPose.forward) * weight;
      if (this.action.t >= clip.duration) this.action = null;
    }

    final.forward = 0;
    this.body.setPose(final);
    this.body.update(dt);

    // A little settling back to where this fighter stands.
    this.body.root.position.x = this.x - this.side * forward;
    this.body.root.position.z = this.z;
  }

  /** How far a strike has to travel from here to reach someone. */
  gapTo(other) {
    return Math.max(0, Math.abs(other.x - this.x) - STRIKE_GAP);
  }
}

/* ------------------------------- the place itself ------------------------------- */

const toonRamp = (() => {
  let map;
  return () => {
    if (!map) {
      map = new THREE.DataTexture(new Uint8Array([140, 200, 255]), 3, 1, THREE.RedFormat);
      map.minFilter = THREE.NearestFilter;
      map.magFilter = THREE.NearestFilter;
      map.needsUpdate = true;
    }
    return map;
  };
})();
const paint = (colour) => new THREE.MeshToonMaterial({ color: colour, gradientMap: toonRamp() });

// Where the fight is, by level: see theme in fightLevel. Each is about as bright as the day, and none
// of it changes during a fight.
const THEMES = {
  day: { sky: ['#3f9fe8', '#8fd2fa', '#d9f2ff'], ground: '#79cf72', hills: ['#65c26a', '#58b868', '#74cc78', '#50ad65'], light: ['#ffffff', '#a7c7a0'], sun: '#fff3dc', weather: null },
  sunset: { sky: ['#e9845f', '#ffb27a', '#ffe0b5'], ground: '#86c86c', hills: ['#78b266', '#6aa760', '#86bd70', '#5f9c5c'], light: ['#fff0dc', '#c4ad8c'], sun: '#ffd6a0', weather: null },
  autumn: { sky: ['#5aa6de', '#a0d2f0', '#e2f1fa'], ground: '#b7c46a', hills: ['#e09d3c', '#d27e34', '#e8bd4c', '#c56e30'], light: ['#ffffff', '#c8b07c'], sun: '#fff0d6', weather: 'leaves' },
  snow: { sky: ['#82b2de', '#b6d4ee', '#e3effa'], ground: '#e4ecf4', hills: ['#eef4fa', '#dce7f2', '#f4f8fc', '#d3e0ee'], light: ['#ffffff', '#b9c8d8'], sun: '#f2f6ff', weather: 'snow' },
};

function skyTexture(colours = THEMES.day.sky) {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, colours[0]);
  sky.addColorStop(0.5, colours[1]);
  sky.addColorStop(0.72, colours[2]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 4, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildPlace(scene) {
  scene.background = skyTexture();

  const place = { ground: null, hills: [] };
  const ground = new THREE.Mesh(new THREE.CircleGeometry(70, 48).rotateX(-Math.PI / 2), paint('#79cf72'));
  place.ground = ground;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  // Rounded hills all the way round the back.
  const hillColours = ['#65c26a', '#58b868', '#74cc78', '#50ad65'];
  for (let i = 0; i < 14; i += 1) {
    const angle = (i / 14) * Math.PI * 2;
    const distance = 30 + (i % 3) * 7;
    const size = 9 + (i % 4) * 4;
    const hill = new THREE.Mesh(new THREE.SphereGeometry(size, 24, 14), paint(hillColours[i % 4]));
    hill.scale.y = 0.55;
    hill.position.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
    scene.add(hill);
    place.hills.push(hill);
  }

  // A round, soft mat for the fighters, with rings on it.
  const mat = new THREE.Group();
  const layer = (radius, colour, y) => {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.08, 64), paint(colour));
    disc.position.y = y;
    disc.receiveShadow = true;
    mat.add(disc);
  };
  layer(STAGE_RADIUS + 0.35, '#2d6fb5', 0.0);
  layer(STAGE_RADIUS, '#ffd66b', 0.02);
  layer(STAGE_RADIUS - 0.5, '#ffb347', 0.03);
  layer(STAGE_RADIUS - 1.0, '#ffe39b', 0.04);
  const middle = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.18, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffb347' }));
  middle.position.y = 0.085;
  mat.add(middle);
  scene.add(mat);

  // Poles and strings of bunting around the mat.
  const flagColours = ['#ff5a4f', '#ffd23f', '#27c96b', '#3b82f6', '#a855f7', '#ff7eb6'];
  const flagShape = new THREE.Shape();
  flagShape.moveTo(-0.17, 0);
  flagShape.lineTo(0.17, 0);
  flagShape.lineTo(0, -0.34);
  flagShape.closePath();
  const flag = new THREE.ShapeGeometry(flagShape);
  const count = 8;
  const poles = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + Math.PI / 8;
    const x = Math.cos(angle) * (STAGE_RADIUS + 1.1);
    const z = Math.sin(angle) * (STAGE_RADIUS + 1.1);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.6, 12), paint('#f7f2e6'));
    pole.position.set(x, 1.8, z);
    scene.add(pole);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), paint('#ff5a4f'));
    top.position.set(x, 3.65, z);
    scene.add(top);
    poles.push(new THREE.Vector3(x, 3.5, z));
  }
  for (let i = 0; i < count; i += 1) {
    const a = poles[i];
    const b = poles[(i + 1) % count];
    const flags = 8;
    for (let j = 0; j < flags; j += 1) {
      const along = (j + 0.5) / flags;
      const sag = Math.sin(along * Math.PI) * 0.42;
      const point = a.clone().lerp(b, along);
      point.y -= sag;
      const material = new THREE.MeshBasicMaterial({ color: flagColours[(i + j) % flagColours.length], side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(flag, material);
      mesh.position.copy(point);
      mesh.lookAt(0, point.y, 0);
      scene.add(mesh);
    }
  }

  // Soft clouds.
  const cloudMaterial = new THREE.SpriteMaterial({ map: spriteTexture(SHAPES.puff, 128), color: '#ffffff', opacity: 0.92, transparent: true, depthWrite: false });
  for (let i = 0; i < 7; i += 1) {
    const cloud = new THREE.Sprite(cloudMaterial);
    const size = 5 + (i % 3) * 2.5;
    cloud.scale.set(size * 1.6, size * 0.8, 1);
    cloud.position.set(-30 + i * 10, 11 + (i % 3) * 3, -32 - (i % 2) * 6);
    scene.add(cloud);
  }
  return place;
}

/** A small autumn leaf, for falling slowly through the air. */
const LEAF = (ctx) => {
  ctx.beginPath();
  ctx.moveTo(0, -44);
  ctx.quadraticCurveTo(38, -10, 0, 44);
  ctx.quadraticCurveTo(-38, -10, 0, -44);
  ctx.fill();
};
const FLAKE = (ctx) => {
  ctx.beginPath();
  ctx.arc(0, 0, 40, 0, Math.PI * 2);
  ctx.fill();
};

/** A beach ball, soft and stripy. */
function ballTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ['#ff5a4f', '#ffffff', '#ffd23f', '#ffffff', '#3b82f6', '#ffffff'].forEach((colour, index) => {
    ctx.fillStyle = colour;
    ctx.fillRect(index * (128 / 6), 0, 128 / 6 + 1, 64);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/* ------------------------------- the arena ------------------------------- */

export class Arena {
  constructor(canvas) {
    this.canvas = canvas;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.hemisphere = new THREE.HemisphereLight('#ffffff', '#a7c7a0', 1.55);
    this.scene.add(this.hemisphere);
    const sun = new THREE.DirectionalLight('#fff3dc', 2.3);
    this.sun = sun;
    sun.position.set(-4, 11, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
    sun.shadow.radius = 4;
    this.scene.add(sun);

    this.place = buildPlace(this.scene);
    this.theme = 'day';
    this.weather = [];
    this.sparks = new Sparks(this.scene);
    this.camera = new THREE.PerspectiveCamera(VIEWS.choose.fov, 1, 0.1, 200);
    this.cameraAt = new THREE.Vector3(...VIEWS.choose.at);
    this.cameraLook = new THREE.Vector3(...VIEWS.choose.look);
    this.view = 'choose';
    this.shake = 0;
    this.time = 0;
    this.slowFrames = 0;
    this.frames = 0;
    this.quality = 2; // 2 is everything on, 1 is lower sharpness, and 0 is no shadows as well.
    this.player = null;
    this.npc = null;

    this.rings = [];
    this.warningMark = this.buildWarningMark();
    this.halo = this.buildChargeHalo();
    this.dizzyStars = this.buildDizzyStars();
    this.bubble = this.buildBubble();
    this.glowRing = this.buildGlowRing();
    this.crown = this.buildCrown();
    this.ball = this.buildBall();
    this.helper = null;
    this.foe = null; // Together, two against two: the computer's fighter for the friend. See showFoe.
    this.champion = false;

    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.resize();
  }

  buildWarningMark() {
    const texture = spriteTexture((ctx) => {
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(0, 0, 46, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#12304d';
      ctx.font = '700 72px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', 0, 4);
    }, 128);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
    sprite.scale.setScalar(0.62);
    sprite.visible = false;
    this.scene.add(sprite);
    return sprite;
  }

  buildChargeHalo() {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.05, 10, 40).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.9 }),
    );
    ring.visible = false;
    this.scene.add(ring);
    return ring;
  }

  buildDizzyStars() {
    const group = new THREE.Group();
    const material = new THREE.SpriteMaterial({ map: spriteTexture(SHAPES.star), color: '#ffd23f', transparent: true, depthWrite: false });
    for (let i = 0; i < 5; i += 1) {
      const star = new THREE.Sprite(material);
      star.scale.setScalar(0.2);
      group.add(star);
    }
    group.visible = false;
    this.scene.add(group);
    return group;
  }

  /** A see-through bubble around the child's fighter, which catches the computer's next hit. */
  buildBubble() {
    // Drawn as a soap bubble: nearly clear in the middle, with a pale blue rim and a shine on it.
    const texture = spriteTexture((ctx) => {
      const fill = ctx.createRadialGradient(0, 0, 16, 0, 0, 48);
      fill.addColorStop(0, 'rgba(190, 235, 255, 0.06)');
      fill.addColorStop(0.78, 'rgba(170, 225, 255, 0.16)');
      fill.addColorStop(0.93, 'rgba(140, 210, 255, 0.62)');
      fill.addColorStop(1, 'rgba(140, 210, 255, 0)');
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(0, 0, 48, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, 36, Math.PI * 1.08, Math.PI * 1.42);
      ctx.stroke();
    }, 128);
    const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false }));
    bubble.visible = false;
    bubble.userData = { on: false, mix: 0 };
    this.scene.add(bubble);
    return bubble;
  }

  /** A soft golden ring round the child's fighter's feet while a glow lasts. */
  buildGlowRing() {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.86, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.visible = false;
    ring.userData = { on: false, mix: 0, sparkleIn: 0 };
    this.scene.add(ring);
    return ring;
  }

  /** The champion's crown, at level 10. */
  buildCrown() {
    const crown = new THREE.Group();
    const gold = paint('#ffc93c');
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.24, 0.13, 24, 1, true), gold);
    band.material.side = THREE.DoubleSide;
    crown.add(band);
    for (let i = 0; i < 5; i += 1) {
      const angle = (i / 5) * Math.PI * 2;
      const point = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.17, 10), gold);
      point.position.set(Math.cos(angle) * 0.24, 0.14, Math.sin(angle) * 0.24);
      crown.add(point);
      const gem = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), paint(['#ff5a4f', '#3b82f6', '#27c96b', '#a855f7', '#ff7eb6'][i]));
      gem.position.set(Math.cos(angle) * 0.25, 0.01, Math.sin(angle) * 0.25);
      crown.add(gem);
    }
    crown.scale.setScalar(1.35);
    crown.visible = false;
    this.scene.add(crown);
    return crown;
  }

  buildBall() {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.26, 24, 16), new THREE.MeshToonMaterial({ map: ballTexture(), gradientMap: toonRamp() }));
    ball.castShadow = true;
    ball.visible = false;
    ball.userData = { state: 'away', flight: null };
    this.scene.add(ball);
    return ball;
  }

  /** The time of day and the weather, for a level: see THEMES. */
  setTheme(name) {
    const theme = THEMES[name] ?? THEMES.day;
    if (this.theme === name && this.scene.background) return;
    this.theme = name;
    this.scene.background?.dispose?.();
    this.scene.background = skyTexture(theme.sky);
    this.place.ground.material.color.set(theme.ground);
    this.place.hills.forEach((hill, index) => hill.material.color.set(theme.hills[index % theme.hills.length]));
    this.hemisphere.color.set(theme.light[0]);
    this.hemisphere.groundColor.set(theme.light[1]);
    this.sun.color.set(theme.sun);

    for (const bit of this.weather) this.scene.remove(bit.sprite);
    this.weather = [];
    if (!theme.weather) return;
    const snow = theme.weather === 'snow';
    const material = new THREE.SpriteMaterial({ map: spriteTexture(snow ? FLAKE : LEAF, 64), transparent: true, depthWrite: false });
    const colours = snow ? ['#ffffff'] : ['#e8862e', '#d9622b', '#f2b33d', '#c9542a'];
    const count = this.reducedMotion ? 18 : 40;
    for (let i = 0; i < count; i += 1) {
      const sprite = new THREE.Sprite(material.clone());
      sprite.material.color.set(colours[i % colours.length]);
      sprite.material.opacity = snow ? 0.9 : 1;
      const size = snow ? between(0.05, 0.09) : between(0.11, 0.17);
      sprite.scale.set(size, snow ? size : size * 1.3, 1);
      sprite.position.set(between(-6, 6), between(0, 7), between(-5, 2.2));
      this.scene.add(sprite);
      this.weather.push({ sprite, fall: snow ? between(0.35, 0.6) : between(0.45, 0.75), sway: between(0.2, 0.5), phase: Math.random() * 10 });
    }
  }

  /** Slow falling snow or leaves, gone round again from the top. Slower still with reduced motion. */
  updateWeather(dt) {
    const pace = this.reducedMotion ? 0.35 : 1;
    for (const bit of this.weather) {
      bit.phase += dt * pace;
      bit.sprite.position.y -= bit.fall * dt * pace;
      bit.sprite.position.x += Math.sin(bit.phase * 1.3) * bit.sway * dt * pace;
      bit.sprite.material.rotation = Math.sin(bit.phase) * 0.6;
      if (bit.sprite.position.y < 0.05) bit.sprite.position.set(between(-6, 6), 7, between(-5, 2.2));
    }
  }

  /** At level 10 the opponent is the champion: a crown, and a little bigger. */
  setChampion(on) {
    this.champion = on;
    this.crown.visible = on && Boolean(this.npc);
    this.npc?.body.root.scale.setScalar(on ? 1.14 : 1);
  }

  /** The power-ups the child's fighter has now, shown on it. */
  showPowerUps({ shield = false, glow = 0 } = {}) {
    this.bubble.userData.on = shield;
    this.glowRing.userData.on = glow > 0;
  }

  /** At the end of a fight, a bubble or glow that's left fades away, and a friend who came to help goes. */
  clearPowerUps() {
    this.showPowerUps();
    // A friend fighting on the child's side stays for the cheering.
    if (this.helper && !this.helper.ally) this.helper.leaving = true;
  }

  /** The bubble caught a hit, and goes in a soft puff. */
  popBubble() {
    if (!this.player) return;
    this.bubble.userData.on = false;
    this.bubble.userData.mix = 0;
    this.bubble.visible = false;
    const at = this.player.body.torso.getWorldPosition(new THREE.Vector3());
    this.burst(at, { shape: 'puff', colours: ['#d8f3ff', '#ffffff'], count: 10, speed: 1.6, size: 0.3, life: 0.5, opacity: 0.6 });
  }

  /**
   * A friend comes to help, standing a little behind, until the next big move. The same friend is kept
   * for next time, rather than made again each time they come.
   */
  showHelper(spec) {
    this.hideHelper();
    if (!spec) return;
    if (this.keptHelper?.spec.id !== spec.id) {
      this.keptHelper?.body.dispose();
      this.keptHelper = new Stander(spec, -1);
    }
    const helper = this.keptHelper;
    // In the gap between the two fighters, a little further back, where the camera sees it, turned
    // towards the opponent so its face shows.
    helper.x = 0.6;
    helper.z = -1.75;
    helper.fightFacing = Math.atan2(START_GAP / 2 - helper.x, -helper.z);
    helper.facing = helper.fightFacing;
    helper.action = null;
    helper.reaction = null;
    helper.leaveIn = undefined;
    helper.ally = false;
    helper.live = null;
    helper.hold('wave');
    helper.body.root.scale.setScalar(0.01);
    helper.grow = 0;
    helper.leaving = false;
    this.helper = helper;
    this.scene.add(helper.body.root);
    this.dust(new THREE.Vector3(helper.x, 0, helper.z), 6);
  }

  /**
   * A friend fighting on the child's side, in a fight together, each on their own computer: they stand where a
   * helper would, a little behind, for the whole fight, and copy the friend's body as the child's own fighter
   * copies the child's (see setLive, with 'helper').
   */
  showAlly(spec) {
    this.showHelper(spec);
    if (!this.helper) return;
    this.helper.ally = true;
    this.helper.hold(null);
  }

  /**
   * Together, two against two: the computer's fighter for the friend, facing the friend's fighter, the two of them
   * a pair behind the child's and their own. null takes it away, as when the friend goes.
   */
  showFoe(spec) {
    this.hideFoe();
    if (!spec) return;
    const foe = new Stander(spec, 1);
    foe.home = BACK_PAIR.ally + BACK_PAIR.gap;
    foe.x = foe.home;
    foe.z = BACK_PAIR.z;
    this.foe = foe;
    this.scene.add(foe.body.root);
    const { helper } = this;
    if (helper?.ally) {
      helper.x = BACK_PAIR.ally;
      helper.z = BACK_PAIR.z;
      helper.fightFacing = Math.PI / 2;
      helper.facing = helper.fightFacing;
    }
  }

  hideFoe() {
    if (!this.foe) return;
    this.scene.remove(this.foe.body.root);
    this.foe.body.dispose();
    this.foe = null;
  }

  /**
   * The friend's fighter makes one of the friend's moves, at the computer's fighter it's fighting, and stays. at is
   * 'foe', the friend's own, or 'npc', the child's, when the friend's own is down and they've come to help.
   */
  allyStrike(move, side = 'right', at = 'npc') {
    const { helper } = this;
    const target = this[at] ?? this.npc;
    if (!helper?.ally || !target) return;
    helper.hold(null);
    helper.play(CLIPS[move] ? move : 'palm', { side: side === 'left' ? 'left' : 'right', gap: helper.gapTo(target) });
  }

  /** The friend joins in with the child's big move, and then goes. */
  helperStrike(move) {
    const { helper, npc } = this;
    if (!helper || !npc) return;
    helper.hold(null);
    helper.play(CLIPS[move] ? move : 'palm', { gap: helper.gapTo(npc) });
    helper.leaveIn = 1.6;
  }

  /** Where the friend's feet are, as a share of the screen, for words over the mat below it. */
  helperFeet() {
    if (!this.helper) return { x: 0.45, y: 0.7 };
    return this.toScreen(this.helper.body.root.position.clone());
  }

  /** The friend goes from the stage, and is kept for coming again. */
  hideHelper() {
    if (!this.helper) return;
    this.scene.remove(this.helper.body.root);
    this.helper = null;
  }

  updateHelper(dt) {
    const { helper } = this;
    if (!helper) return;
    helper.update(dt, this.reducedMotion);
    if (helper.leaveIn !== undefined) {
      helper.leaveIn -= dt;
      if (helper.leaveIn <= 0.6 && helper.held !== 'wave') helper.hold('wave');
      if (helper.leaveIn <= 0) helper.leaving = true;
    }
    helper.grow = clamp(helper.grow + (helper.leaving ? -dt : dt) * 3, 0, 1);
    helper.body.root.scale.setScalar(Math.max(0.01, helper.grow));
    if (helper.leaving && helper.grow <= 0) {
      this.dust(new THREE.Vector3(helper.x, 0, helper.z), 5);
      this.hideHelper();
    }
  }

  /* ---------- the soft ball ---------- */

  /** The opponent holds the ball up, ready to throw. */
  ballReady() {
    if (!this.npc) return;
    this.npc.warningPose = 'ballUp';
    this.ball.userData.state = 'held';
    this.ball.visible = true;
  }

  /** The ball flies from one fighter to the other, over this many seconds. */
  throwBall(from, to, seconds, then = 'away') {
    if (!this[from] || !this[to]) return;
    const start = this.ballSpot(from);
    this.ball.visible = true;
    this.ball.userData.state = 'flying';
    this.ball.userData.flight = { from, to, start, t: 0, seconds, then };
  }

  /**
   * Where the ball is held: over the opponent's head, between its hands, and in front of the child's
   * fighter, where the camera behind it can see it.
   */
  ballSpot(who) {
    const stander = this[who];
    if (who === 'player') {
      const at = stander.body.torso.getWorldPosition(new THREE.Vector3());
      at.x += 0.62;
      at.y += 0.28;
      return at;
    }
    const at = stander.body.head.getWorldPosition(new THREE.Vector3());
    at.y += (this.champion ? 0.85 : 0.42) * stander.body.root.scale.y;
    at.x -= stander.side * 0.12;
    return at;
  }

  updateBall(dt) {
    const { ball } = this;
    const { state, flight } = ball.userData;
    if (!ball.visible) return;
    if (state === 'held' && this.npc) ball.position.copy(this.ballSpot('npc'));
    if (state === 'caught' && this.player) ball.position.copy(this.ballSpot('player'));
    if (state === 'dropping') {
      flight.t += dt;
      ball.position.y = Math.max(0.2, ball.position.y + flight.vy * dt);
      flight.vy -= 9 * dt;
      ball.position.x += flight.vx * dt;
      if (flight.t > 0.9) this.hideBall();
    }
    if (state === 'flying') {
      flight.t += dt;
      const share = clamp(flight.t / flight.seconds, 0, 1);
      const end = flight.then === 'bounce' ? this[flight.to].body.torso.getWorldPosition(new THREE.Vector3()) : this.ballSpot(flight.to);
      ball.position.lerpVectors(flight.start, end, share);
      ball.position.y += Math.sin(share * Math.PI) * 0.8;
      ball.rotation.z += dt * 6;
      if (share >= 1) {
        if (flight.then === 'caught') {
          ball.userData.state = 'caught';
        } else if (flight.then === 'bounce') {
          ball.userData.state = 'dropping';
          ball.userData.flight = { t: 0, vy: 2.2, vx: -this[flight.to].side * 1.2 };
        } else {
          this.hideBall();
        }
      }
    }
  }

  hideBall() {
    this.ball.visible = false;
    this.ball.userData.state = 'away';
    this.ball.userData.flight = null;
    if (this.npc) this.npc.warningPose = 'lookOut';
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
    const views = this.camera.aspect < 1 ? NARROW_VIEWS : VIEWS;
    return name === 'fight' && this.foe ? views.fightTwoByTwo : views[name];
  }

  /** Puts a fighter on the stage in place of whoever was there. which is 'player' or 'npc'. */
  /** The body a fighter copies: the child's, for their own, or a friend's, for theirs. null when there's none. */
  setLive(which, pose) {
    if (this[which]) this[which].live = pose;
  }

  setFighter(which, spec) {
    const old = this[which];
    if (old) {
      this.scene.remove(old.body.root);
      old.body.dispose();
    }
    this[which] = spec ? new Stander(spec, which === 'player' ? -1 : 1) : null;
    if (spec) this.scene.add(this[which].body.root);
    if (which === 'npc') this.setChampion(false);
  }

  /** Back to the start of a round. */
  resetRound() {
    for (const stander of [this.player, this.npc, this.foe]) {
      if (!stander) continue;
      stander.hold(null);
      stander.action = null;
      stander.reaction = null;
      stander.x = stander.home;
    }
    this.halo.visible = false;
    this.dizzyStars.visible = false;
    this.hideBall();
    // A helper goes with the round. A friend fighting on the child's side stays where they are, ready again.
    if (this.helper?.ally) {
      this.helper.hold(null);
      this.helper.action = null;
      this.helper.reaction = null;
    } else {
      this.hideHelper();
    }
    if (this.player) this.player.ducking = false;
  }

  /** Where a body part is, as a share of the screen, for putting words next to it. */
  toScreen(point) {
    const projected = point.clone().project(this.camera);
    return { x: (projected.x + 1) / 2, y: (1 - projected.y) / 2 };
  }

  fighterTop(which) {
    const stander = this[which];
    const point = stander.body.head.getWorldPosition(new THREE.Vector3());
    point.y += 0.62;
    return point;
  }

  /* ---------- what happens on stage for each thing in the fight ---------- */

  /** aim is who it's aimed at, if not the one facing: together, the other pair's computer fighter, or their friend. */
  moveStarted(who, move, { side, aim = null }) {
    const self = this[who];
    const other = this[aim ?? (who === 'player' ? 'npc' : 'player')] ?? this[who === 'player' ? 'npc' : 'player'];
    const name = move;
    self.play(name, { side: side === 'left' ? 'left' : 'right', gap: self.gapTo(other) });
    self.body.setExpression('strike', 0.5);

    const at = self.body.root.position.clone();
    if (BIG_MOVES.has(move)) this.dust(at, 4);
    if (move === 'skyCharge') this.skyColumn(self);
    // The soft ball: thrown at the child when it wasn't caught, and back at the opponent when it was.
    // Once it's thrown, the opponent's hands come down from holding it up.
    if (move === 'ball') {
      this.throwBall('npc', 'player', 0.45, 'bounce');
      self.warningPose = 'lookOut';
    }
    if (move === 'ballReturn') this.throwBall('player', 'npc', 0.45, 'away');
  }

  /** The child caught the ball: it comes over into their fighter's hands. */
  ballCaught() {
    this.throwBall('npc', 'player', 0.3, 'caught');
    if (this.npc) this.npc.warningPose = 'lookOut';
  }

  /** The move connected: what the target does, and everything that flies about. */
  hitLanded({ attacker, target, move, blocked, signature, small = false }) {
    const self = this[attacker];
    const victim = this[target];
    const contact = victim.body.torso.getWorldPosition(new THREE.Vector3());
    contact.y += 0.32;
    contact.x -= victim.side * 0.28;

    const big = BIG_MOVES.has(move) && !small;
    victim.react(blocked ? 'block' : big ? 'bighit' : 'hit');

    if (blocked) {
      this.burst(contact, { shape: 'spark', colours: ['#bfe3ff', '#ffffff'], count: 6, speed: 1.6, size: 0.18, life: 0.3 });
      return;
    }

    if (small) {
      // A small hit looks like one.
      this.burst(contact, { shape: 'star', colours: ['#ffd23f', '#ffffff'], count: 4, speed: 1.8, size: 0.14, life: 0.3, gravity: 3 });
      return;
    }
    this.ringAt(contact, big ? '#fff3b0' : '#ffffff', big ? 1.1 : 0.7);
    this.burst(contact, { shape: 'star', colours: ['#ffd23f', '#ff8f3f', '#ffffff'], count: big ? 14 : 8, speed: big ? 3.8 : 2.6, size: big ? 0.3 : 0.2, life: big ? 0.65 : 0.42, gravity: 3 });
    this.addShake(big ? 0.11 : 0.04);

    if (move === 'stomp') this.groundWave(self);
    if (move === 'flying') this.dust(victim.body.root.position, 8);
    if (move === 'starBurst') this.starShower(self, victim);
    if (move === 'turbo') this.dust(self.body.root.position, 10);
    if (move === 'sweep') this.sweepArc(victim);
    if (move === 'thunderClap') this.ringAt(contact, '#ffffff', 1.5);
    if (move === 'whirlwind') this.sweepArc(victim);
    if (signature) this.signatureBurst(self, victim);
  }

  dodged(who) {
    const self = this[who];
    const at = self.body.root.position.clone();
    at.y += 1;
    this.burst(at, { shape: 'puff', colours: ['#ffffff', '#d8f0ff'], count: 5, speed: 1.1, size: 0.34, life: 0.42, opacity: 0.7 });
  }

  dust(at, count) {
    const origin = new THREE.Vector3(at.x, 0.14, at.z);
    this.burst(origin, { shape: 'puff', colours: ['#fff8e6', '#ffe9c4'], count, speed: 1.5, flat: true, size: 0.3, grow: 0.8, life: 0.55, opacity: 0.85, drag: 2.4 });
  }

  burst(at, { shape = 'star', colours = ['#ffffff'], count = 8, speed = 2, size = 0.24, life = 0.5, gravity = 0, flat = false, grow = 0, opacity = 1, drag = 0.8 }) {
    const scale = this.reducedMotion ? 0.5 : 1;
    const total = Math.max(2, Math.round(count * scale));
    for (let i = 0; i < total; i += 1) {
      const angle = (i / total) * Math.PI * 2 + Math.random();
      const lift = flat ? between(0.05, 0.3) : between(-0.7, 1);
      const push = speed * between(0.55, 1.15);
      this.sparks.emit({
        shape,
        colour: colours[i % colours.length],
        at,
        velocity: [Math.cos(angle) * push, lift * push, Math.sin(angle) * push],
        life: life * between(0.8, 1.2),
        size: size * between(0.75, 1.25),
        grow,
        gravity,
        spin: between(-5, 5),
        opacity,
        drag,
      });
    }
  }

  /** A flat ring on the ground that spreads out, or a ring in the air. */
  ringAt(at, colour, size) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 1, 40),
      new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    );
    mesh.position.copy(at);
    mesh.lookAt(this.camera.position);
    mesh.scale.setScalar(size * 0.3);
    this.scene.add(mesh);
    this.rings.push({ mesh, life: 0.26, total: 0.26, from: size * 0.3, to: size });
  }

  groundWave(stander) {
    const at = stander.body.root.position;
    for (let i = 0; i < 3; i += 1) {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(0.72, 1, 56).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: i === 1 ? '#ffffff' : '#ffb347', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
      );
      mesh.position.set(at.x, 0.12, at.z);
      this.scene.add(mesh);
      this.rings.push({ mesh, life: 0.5 + i * 0.1, total: 0.5 + i * 0.1, from: 0.2, to: 3.2 + i * 0.9 });
    }
    // Bits of ground thrown up along the way to the other fighter.
    const direction = -stander.side;
    for (let i = 0; i < (this.reducedMotion ? 6 : 13); i += 1) {
      const along = between(0.2, 2.4);
      this.sparks.emit({
        shape: 'rock',
        colour: i % 2 ? '#c99b6b' : '#a97b4d',
        at: new THREE.Vector3(at.x + direction * along, 0.15, at.z + between(-0.45, 0.45)),
        velocity: [direction * 0.6, between(2.6, 4.6), between(-0.6, 0.6)],
        life: 0.72,
        size: between(0.13, 0.27),
        gravity: 9,
        spin: between(-7, 7),
      });
    }
  }

  starShower(from, to) {
    const start = from.body.torso.getWorldPosition(new THREE.Vector3());
    start.y += 0.4;
    const end = to.body.torso.getWorldPosition(new THREE.Vector3());
    for (let i = 0; i < (this.reducedMotion ? 7 : 15); i += 1) {
      const at = start.clone().lerp(end, Math.random());
      at.y += between(-0.3, 1);
      at.z += between(-0.7, 0.7);
      this.sparks.emit({
        shape: 'star',
        colour: ['#ffd23f', '#ff7eb6', '#7ee8ff', '#ffffff'][i % 4],
        at,
        velocity: [between(-1.2, 1.2), between(-0.3, 2.2), between(-0.8, 0.8)],
        life: between(0.55, 0.95),
        size: between(0.2, 0.42),
        gravity: 2.6,
        spin: between(-5, 5),
      });
    }
  }

  sweepArc(victim) {
    const at = victim.body.root.position.clone();
    at.y = 0.2;
    this.burst(at, { shape: 'puff', colours: ['#fff8e6', '#ffe9c4'], count: 9, speed: 2.2, flat: true, size: 0.3, grow: 0.7, life: 0.55, opacity: 0.85 });
  }

  /** Sparkles rising around a fighter who is reaching for the sky, and a halo that stays. */
  skyColumn(stander) {
    const at = stander.body.root.position;
    for (let i = 0; i < (this.reducedMotion ? 8 : 18); i += 1) {
      const angle = Math.random() * Math.PI * 2;
      this.sparks.emit({
        shape: 'spark',
        colour: i % 2 ? '#ffd23f' : '#ffffff',
        at: new THREE.Vector3(at.x + Math.cos(angle) * 0.72, between(0.1, 1.5), at.z + Math.sin(angle) * 0.72),
        velocity: [0, between(1.8, 3.6), 0],
        life: between(0.55, 1),
        size: between(0.15, 0.3),
        spin: between(-3, 3),
      });
    }
  }

  setCharged(on) {
    this.halo.visible = on;
  }

  /** The fighter's own finishing move, thrown at the other fighter in their own colours. */
  signatureBurst(from, to) {
    const { burst, burstColours } = from.spec;
    const shape = SHAPES[burst] ? burst : 'star';
    const start = from.body.torso.getWorldPosition(new THREE.Vector3());
    const end = to.body.torso.getWorldPosition(new THREE.Vector3());
    for (let i = 0; i < (this.reducedMotion ? 12 : 30); i += 1) {
      const at = start.clone().lerp(end, Math.pow(Math.random(), 0.6));
      at.y += between(-0.5, 1.2);
      at.z += between(-0.9, 0.9);
      this.sparks.emit({
        shape,
        colour: burstColours[i % burstColours.length],
        at,
        velocity: [between(-1.6, 1.6), between(0, 3), between(-1.3, 1.3)],
        life: between(0.6, 1.15),
        size: between(0.24, 0.5),
        gravity: 3.2,
        spin: between(-5, 5),
      });
    }
    this.addShake(0.08);
  }

  addShake(amount) {
    if (!this.reducedMotion) this.shake = Math.min(0.16, this.shake + amount);
  }

  /* ---------- every frame ---------- */

  /** A slow computer gives up sharpness and then shadows, so that moves still feel immediate. */
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
      this.renderer.shadowMap.enabled = false;
      this.scene.traverse((node) => {
        if (node.material) node.material.needsUpdate = true;
      });
    }
  }

  update(dt) {
    this.time += dt;
    this.watchSpeed(dt);
    this.player?.update(dt, this.reducedMotion);
    this.npc?.update(dt, this.reducedMotion);
    this.foe?.update(dt, this.reducedMotion);
    this.updateHelper(dt);
    this.updateBall(dt);
    this.updateWeather(dt);
    this.updatePowerUps(dt);
    this.sparks.update(dt);

    this.rings = this.rings.filter((ring) => {
      ring.life -= dt;
      if (ring.life <= 0) {
        this.scene.remove(ring.mesh);
        ring.mesh.geometry.dispose();
        ring.mesh.material.dispose();
        return false;
      }
      const done = 1 - ring.life / ring.total;
      ring.mesh.scale.setScalar(ring.from + (ring.to - ring.from) * Math.sqrt(done));
      ring.mesh.material.opacity = 0.9 * (1 - done);
      return true;
    });

    if (this.halo.visible && this.player) {
      const at = this.player.body.head.getWorldPosition(new THREE.Vector3());
      this.halo.position.set(at.x, at.y + 0.7, at.z);
      this.halo.rotation.y += dt * 3;
    }

    const showWarning = this.npc?.warning > 0;
    this.warningMark.visible = Boolean(showWarning);
    if (showWarning) {
      const top = this.fighterTop('npc');
      // Beside a ball held over the head, rather than hidden behind it.
      if (this.ball.userData.state === 'held') {
        top.x += 0.8;
        top.y -= 0.3;
      }
      this.warningMark.position.copy(top);
      this.warningMark.scale.setScalar(0.62 + (this.reducedMotion ? 0 : Math.sin(this.time * 12) * 0.05));
    }

    const dizzy = [this.player, this.npc].find((stander) => stander?.held === 'dizzy');
    this.dizzyStars.visible = Boolean(dizzy);
    if (dizzy) {
      const at = dizzy.body.head.getWorldPosition(new THREE.Vector3());
      this.dizzyStars.children.forEach((star, index) => {
        const angle = this.time * (this.reducedMotion ? 0.8 : 3) + (index / 5) * Math.PI * 2;
        star.position.set(at.x + Math.cos(angle) * 0.56, at.y + 0.56 + Math.sin(angle * 2) * 0.04, at.z + Math.sin(angle) * 0.56);
      });
    }

    this.updateCamera(dt);
  }

  /** The bubble and the glow fade in and out gently, rather than appearing all at once. */
  updatePowerUps(dt) {
    const { bubble, glowRing, player } = this;
    for (const [mesh, most] of [[bubble, 1], [glowRing, 0.75]]) {
      const data = mesh.userData;
      data.mix = damp(data.mix, data.on && player ? 1 : 0, 5, dt);
      mesh.visible = data.mix > 0.02;
      mesh.material.opacity = most * data.mix;
    }
    if (player && bubble.visible) {
      const at = player.body.torso.getWorldPosition(new THREE.Vector3());
      bubble.position.copy(at);
      bubble.position.y += 0.1;
      bubble.scale.setScalar(2.5 + (this.reducedMotion ? 0 : Math.sin(this.time * 2.2) * 0.05));
    }
    if (player && glowRing.visible) {
      const at = player.body.root.position;
      glowRing.position.set(at.x, 0.13, at.z);
      glowRing.rotation.y += dt * (this.reducedMotion ? 0.3 : 1.2);
      glowRing.userData.sparkleIn -= dt;
      if (glowRing.userData.sparkleIn <= 0 && glowRing.userData.on) {
        glowRing.userData.sparkleIn = this.reducedMotion ? 0.7 : 0.25;
        const angle = Math.random() * Math.PI * 2;
        this.sparks.emit({ shape: 'spark', colour: '#ffd23f', at: new THREE.Vector3(at.x + Math.cos(angle) * 0.7, 0.2, at.z + Math.sin(angle) * 0.7), velocity: [0, between(0.8, 1.4), 0], life: 0.8, size: 0.14, spin: 2 });
      }
    }
    if (this.crown.visible && this.npc) {
      const at = this.npc.body.head.getWorldPosition(new THREE.Vector3());
      this.crown.position.set(at.x, at.y + 0.56 * this.npc.body.root.scale.y, at.z);
    }
  }

  updateCamera(dt) {
    const view = this.framing(this.view);
    const rate = this.view === 'fight' ? 3.4 : 2.2;
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
    if (this.shake > 0.001) {
      this.camera.position.x += Math.sin(this.time * 61) * this.shake;
      this.camera.position.y += Math.sin(this.time * 47) * this.shake * 0.7;
      this.shake *= Math.exp(-dt * 11);
    }
    this.camera.lookAt(this.cameraLook);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
