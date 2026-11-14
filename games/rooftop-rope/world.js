// What Rooftop Rope looks like: a city of tall buildings, the rooftops the ropes are tied between, a net under
// each rope, and the child's character gliding along on one foot, seen from behind, so that the child's left
// is the walker's left. It draws what the rules in walk.js say.
//
// Nothing flashes or strobes, as seizures are more common in children with hemiplegia: things come and go by
// growing and shrinking, a catch is a burst of small shapes, a fall is a slow drop into a net, and the picture
// itself never changes brightness. The camera glides after the walker and never swings round.
import * as THREE from '../../vendor/three/three.module.js';
import { Fighter3D, makePose } from '../../core/body/characters.js';
import { ROSTER } from '../../core/body/roster.js';
import { Sparks } from '../../core/body/sparks.js';
import { WALK } from './walk.js';
import { WHEEL, balancePose, buildBalloon, buildBird, buildBuildings, buildCup, buildLight, buildNet, buildPost, buildRoofTop, buildStar, buildSwapFlag, buildWheel, cheerPose, cloudGeometry, fallPose, netPose, seededRandom, wallColour } from './models.js';

const MOST_PIXELS = 3_200_000; // A very big screen is drawn a little less sharply, so that it stays quick.
const SLOW_FRAME_SECONDS = 1 / 45;
const SLOW_CHECK_FRAMES = 90;
const FOG = [60, 420];
const ROOF = { wide: 9, deep: 8, first: 58, step: 1.4, climb: 7 }; // Metres. Each rooftop is a little higher than the last.
const ROPE = { long: 22, sag: 0.6, thick: 0.05 }; // A rope is this long for a rope of the usual length.
const SIDE_BY_SIDE = 3; // Metres between one friend's rope and the next.
const NET_DROP = 5.5; // How far under a rope its net is.
const WALKER_SIZE = 0.95;
const MATE_SLOTS = [-1, 1, -2];
const MATE_WHEELS = ['#4aa3df', '#27c96b', '#b06ad9']; // Each friend's wheel is its own colour.
const QUARTER = Math.PI / 2;

// How the sky looks as the levels go up: morning, the middle of the day, the afternoon, and sunset at the top.
const SKIES = [
  { upTo: 3, top: '#74bdf0', low: '#dff2ff', fog: '#dff2ff', sun: '#fff3dc' },
  { upTo: 6, top: '#5fb0ee', low: '#d6ecfb', fog: '#d6ecfb', sun: '#fff6e6' },
  { upTo: 9, top: '#7fb4e6', low: '#f6e7cf', fog: '#f1e6d6', sun: '#ffe9c4' },
  { upTo: 10, top: '#7f9fe0', low: '#ffd9b8', fog: '#f6ddc8', sun: '#ffd9a8' },
];
const skyAt = (level) => SKIES.find(({ upTo }) => level <= upTo) ?? SKIES[0];

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const damp = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));
const lerp = (a, b, t) => a + (b - a) * t;
const scratch = { v: new THREE.Vector3(), w: new THREE.Vector3() };

/**
 * A character standing on a roof, or riding its one wheel along a rope, lifting a foot. A grown-up who saw the
 * first version, where the walker slid along the rope on its bare foot, asked for some kind of wheel for one
 * foot where the child has to stand with a foot up: so on a rope the walker is up on a wheel, which turns as it
 * goes, and on a rooftop it's on its own two feet.
 */
class Walker {
  constructor(spec, wheelColour = '#e4572e') {
    this.spec = spec;
    this.body = new Fighter3D(spec);
    this.body.root.scale.setScalar(WALKER_SIZE);
    // Seen from behind: facing away from the camera, along the rope.
    this.body.root.rotation.y = Math.PI;
    this.root = new THREE.Group();
    // The character stands on the plate over the wheel, which lifts it off the rope.
    this.seat = new THREE.Group();
    this.seat.add(this.body.root);
    this.wheel = buildWheel(wheelColour);
    this.wheel.root.visible = false;
    this.root.add(this.seat, this.wheel.root);
    this.pose = makePose();
    this.time = Math.random() * 10;
    this.at = new THREE.Vector3();
    this.size = 1;
    this.onWheel = 0; // From 0, on its own feet, to 1, up on its wheel.
    this.rolled = 0; // How far the wheel has turned, in radians: less than nothing going forwards.
  }

  /** How far over the rope the character's feet are: the height of the wheel, when it's on it. */
  get lift() {
    return WHEEL.up * this.onWheel;
  }

  /**
   * Stands where it's told, in whatever pose the rules call for. wheel is whether it's riding its wheel, which
   * comes out from under it and is put away again by growing and shrinking, and rock is how much it's
   * wobbling on it, from 0 to 1.
   */
  stand(at, pose, dt, { size = 1, wheel = false, rock = 0 } = {}) {
    this.time += dt;
    // The wheel turns by as far as it has come along the rope. A walker put somewhere new hasn't rolled there.
    const along = at.z - this.root.position.z;
    if (wheel && Math.abs(along) < 1) this.rolled += along / WHEEL.radius;
    this.root.position.copy(at);
    this.size = damp(this.size, size, 14, dt);
    this.root.scale.setScalar(Math.max(0.001, this.size));
    this.onWheel = damp(this.onWheel, wheel ? 1 : 0, 10, dt);
    this.wheel.root.visible = this.onWheel > 0.02;
    this.wheel.root.scale.setScalar(Math.max(0.001, this.onWheel));
    // Wobbling, the wheel rocks to and fro under the walker, and tips a little from side to side with it.
    const sway = Math.sin(this.time * 6.5) * rock;
    this.wheel.spin.rotation.x = this.rolled + sway * 0.4;
    this.wheel.root.rotation.z = sway * 0.1;
    this.seat.position.y = this.lift;
    this.body.setPose(pose(this.pose, this.time));
    this.body.update(dt);
  }

  dispose() {
    this.root.removeFromParent();
    this.body.dispose();
  }
}

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#dff2ff', FOG[0], FOG[1]);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#b8c4d0', 1.75));
    this.sun = new THREE.DirectionalLight('#fff3dc', 2.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 70 });
    this.sun.shadow.radius = 4;
    this.scene.add(this.sun, this.sun.target);

    this.camera = new THREE.PerspectiveCamera(56, 1, 0.3, 1400);
    this.cameraAt = new THREE.Vector3(0, ROOF.first + 3, 8);
    this.cameraLook = new THREE.Vector3(0, ROOF.first, 0);
    this.view = 'title';
    this.snapNext = true;
    this.time = 0;
    this.frames = 0;
    this.slowFrames = 0;
    this.quality = 2;

    this.sparks = new Sparks(this.scene);
    this.walker = null;
    this.mates = [];
    this.walk = null;
    this.place = null; // The rooftops and ropes of the game being shown.
    this.items = [];
    this.fans = [];
    this.live = null; // On a rooftop before a game: the foot the child has up, to copy.
    this.walkerAt = new THREE.Vector3(0, ROOF.first, 0);
    this.cheering = false;
    this.gustIn = 0;
    this.skies = new Map();

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /* ---------- building ---------- */

  skyFor(level) {
    const sky = skyAt(level);
    if (!this.skies.has(sky)) {
      const canvas = document.createElement('canvas');
      canvas.width = 4;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      const fade = ctx.createLinearGradient(0, 0, 0, 256);
      fade.addColorStop(0, sky.top);
      fade.addColorStop(0.6, sky.low);
      fade.addColorStop(1, sky.low);
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, 4, 256);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.skies.set(sky, texture);
    }
    return { texture: this.skies.get(sky), sky };
  }

  /** Whose walk it is. */
  setWalker(spec) {
    this.walker?.dispose();
    this.walker = new Walker(spec);
    this.scene.add(this.walker.root);
    this.snapNext = true;
  }

  /**
   * The game to draw: its rooftops and ropes are built from its plan. A game that hasn't begun is the place
   * the walker waits in, on the title card and in the warm-up. friends is how many friends' ropes run beside it.
   */
  setWalk(walk, friends = this.mates.length) {
    this.clearWalk();
    this.walk = walk;
    const { plan } = walk;
    const level = plan.rules.level;
    const { texture, sky } = this.skyFor(level);
    this.scene.background = texture;
    this.scene.fog.color.set(sky.fog);
    this.sun.color.set(sky.sun);

    const group = new THREE.Group();
    this.scene.add(group);
    const wide = ROOF.wide + friends * SIDE_BY_SIDE;
    // Where each rooftop is, and each rope between two of them.
    const roofs = [];
    let z = 0;
    let y = ROOF.first;
    for (let k = 0; k <= plan.ropes.length; k += 1) {
      roofs.push({ x: 0, y, z });
      const rope = plan.ropes[k];
      if (!rope) break;
      const long = ROPE.long * (rope.long ? 2 : 1);
      z -= ROOF.deep + long;
      y += rope.climb ? ROOF.climb : ROOF.step;
    }
    const ropes = plan.ropes.map((rope, k) => {
      const [from, to] = [roofs[k], roofs[k + 1]];
      return {
        from: new THREE.Vector3(0, from.y + 0.5, from.z - ROOF.deep / 2 + 0.4),
        to: new THREE.Vector3(0, to.y + 0.5, to.z + ROOF.deep / 2 - 0.4),
      };
    });
    this.place = { group, roofs, ropes, wide };

    // The towers under the rooftops, and the rest of the city round them.
    const random = seededRandom(900 + level * 31 + plan.ropes.length);
    const towers = roofs.map(({ y: high, z: at }, k) => ({ x: 0, z: at, wide, deep: ROOF.deep, high, colour: wallColour(k + level) }));
    const far = roofs.at(-1).z;
    const city = [];
    for (let n = 0; n < 150; n += 1) {
      const side = random() < 0.5 ? -1 : 1;
      const x = side * (wide / 2 + 9 + random() ** 1.4 * 170);
      const at = 60 - random() * (60 - far + 220);
      const nearRoute = Math.abs(x) < 60;
      // Those near the ropes are lower than the rooftops, so the walker looks out over them.
      const most = nearRoute ? ROOF.first - 12 : ROOF.first + 50;
      city.push({ x, z: at, wide: 10 + random() * 16, deep: 10 + random() * 16, high: 14 + random() * (most - 14), colour: wallColour(n) });
    }
    // Some in front of the last rooftop too, so the way ahead isn't empty.
    for (let n = 0; n < 14; n += 1) city.push({ x: (random() - 0.5) * 130, z: far - 40 - random() * 180, wide: 12 + random() * 14, deep: 12 + random() * 14, high: 20 + random() * (ROOF.first - 28), colour: wallColour(n + 3) });
    group.add(buildBuildings([...towers, ...city]));
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600).rotateX(-QUARTER), new THREE.MeshLambertMaterial({ color: '#9fb39a' }));
    ground.position.set(0, 0, far / 2);
    group.add(ground);

    roofs.forEach(({ y: high, z: at }, k) => {
      const last = k === roofs.length - 1;
      const top = buildRoofTop(wide, ROOF.deep, last ? '#ffd23f' : '#27c96b', { flag: !last });
      top.position.set(0, high, at);
      top.traverse((node) => {
        if (node.isMesh) node.receiveShadow = true;
      });
      group.add(top);
    });
    // The ropes, each sagging a little, with a net under it: this child's, and one beside it for each friend.
    const lanes = [0, ...MATE_SLOTS.slice(0, friends).map((slot) => slot * SIDE_BY_SIDE)];
    const ropeMaterial = new THREE.MeshLambertMaterial({ color: '#f1e3c2' });
    ropes.forEach(({ from, to }) => {
      for (const lane of lanes) {
        const points = Array.from({ length: 13 }, (_, n) => this.onRope({ from, to }, n / 12, new THREE.Vector3()).setX(lane));
        group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, ROPE.thick, 6), ropeMaterial));
      }
      const net = buildNet(wide + 2, from.z - to.z - 1);
      net.position.set(0, Math.min(from.y, to.y) - NET_DROP, (from.z + to.z) / 2);
      group.add(net);
    });
    // Clouds, here and there above the city.
    const clouds = new THREE.InstancedMesh(cloudGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), 26);
    const matrix = new THREE.Matrix4();
    for (let n = 0; n < 26; n += 1) {
      const scale = 1.5 + random() * 3;
      matrix.compose(new THREE.Vector3((random() - 0.5) * 520, ROOF.first + 22 + random() * 70, 80 - random() * (300 - far)), new THREE.Quaternion(), new THREE.Vector3(scale, scale * 0.8, scale));
      clouds.setMatrixAt(n, matrix);
    }
    group.add(clouds);

    this.items = [];
    plan.ropes.forEach((rope, k) => rope.things.forEach((thing, n) => this.items.push(this.buildItem(k, n, thing))));
    if (plan.rules.cup) {
      const cup = buildCup();
      const last = roofs.at(-1);
      cup.position.set(-2.6, last.y + 0.45, last.z - 1.5);
      group.add(cup);
      this.cup = cup;
    } else this.cup = null;
    this.buildFans();
    this.cheering = false;
    this.walkerAt.copy(this.spotOn(0));
    this.snapNext = true;
  }

  clearWalk() {
    const group = this.place?.group;
    if (group) {
      group.removeFromParent();
      group.traverse((node) => {
        node.geometry?.dispose();
        if (Array.isArray(node.material)) node.material.forEach((material) => material.dispose());
        else {
          node.material?.map?.dispose?.();
          node.material?.dispose?.();
        }
      });
    }
    for (const fan of this.fans) {
      fan.body.root.removeFromParent();
      fan.body.dispose();
    }
    this.fans = [];
    this.items = [];
    this.place = null;
  }

  /** A place on a rope: p of the way along it, with its sag. */
  onRope({ from, to }, p, out = new THREE.Vector3()) {
    return out.set(lerp(from.x, to.x, p), lerp(from.y, to.y, p) - ROPE.sag * 4 * p * (1 - p), lerp(from.z, to.z, p));
  }

  /** Where the walker stands on a rooftop, before the rope that starts from it. */
  spotOn(index, out = new THREE.Vector3()) {
    const roof = this.place.roofs[Math.min(index, this.place.roofs.length - 1)];
    const last = index >= this.place.roofs.length - 1;
    return out.set(0, roof.y + 0.45, roof.z - (last ? 0 : ROOF.deep / 2 - 1.3));
  }

  /** One thing on a rope, where the rules have it. n is its place in the rope's list, which the rules keep too. */
  buildItem(rope, n, thing) {
    const builders = {
      star: () => buildStar(),
      balloon: () => buildBalloon(['#e4572e', '#4aa3df', '#b06ad9'][(rope + n) % 3]),
      bird: () => buildBird(),
      swap: () => buildSwapFlag(),
      light: () => buildLight(),
      post: () => buildPost(),
      gust: () => new THREE.Group(),
    };
    const object = builders[thing.kind]();
    const at = this.onRope(this.place.ropes[rope], thing.at);
    // Stars at the walker's middle, balloons over its head and the bird over that, for a walker up on its wheel.
    const lift = { star: 1.15 + WHEEL.up, balloon: 2.7 + WHEEL.up, bird: 3.2 + WHEEL.up }[thing.kind] ?? 0;
    object.position.set(at.x + (thing.kind === 'star' ? 0.75 : 0), at.y + lift, at.z);
    if (thing.kind === 'bird') object.visible = false;
    this.place.group.add(object);
    // A crossing light is red until the walker has waited at it.
    return { rope, n, thing, object, base: object.position.clone(), gone: 0, red: thing.kind === 'light' };
  }

  /** Two friends on the last rooftop, who cheer as the walker gets there. */
  buildFans() {
    const taken = new Set([this.walker?.spec.id, ...this.mates.map(({ spec }) => spec.id)]);
    const free = ROSTER.filter(({ id }) => !taken.has(id));
    const last = this.place.roofs.at(-1);
    const level = this.walk.levelNumber;
    this.fans = [[-2.4, -2.6], [2.6, -1.9]].map(([x, z], index) => {
      const body = new Fighter3D(free[(level + index * 3) % free.length]);
      body.root.position.set(x, last.y + 0.45, last.z + z);
      // Turned to face the walker coming.
      body.root.rotation.y = 0;
      this.scene.add(body.root);
      return { body, pose: makePose(), phase: index * 1.7 };
    });
  }

  /** Friends' walkers, each on a rope beside this child's. */
  setMates(specs) {
    for (const mate of this.mates) mate.dispose();
    this.mates = specs.map((spec, index) => {
      const mate = new Walker(spec, MATE_WHEELS[index % MATE_WHEELS.length]);
      mate.root.visible = false;
      this.scene.add(mate.root);
      return mate;
    });
  }

  /** Where each friend's walker is: { index, progress, foot, lift, wobble, falling }, or null for one who's gone. */
  placeMates(places, dt) {
    this.mates.forEach((mate, slot) => {
      const at = places[slot];
      mate.root.visible = Boolean(at) && Boolean(this.place);
      if (!mate.root.visible) return;
      const lane = MATE_SLOTS[slot] * SIDE_BY_SIDE;
      const rope = this.place.ropes[Math.min(at.index, this.place.ropes.length - 1)];
      const done = at.index >= this.place.ropes.length;
      const spot = done ? this.spotOn(this.place.roofs.length - 1, scratch.v) : at.progress <= 0 ? this.spotOn(at.index, scratch.v) : this.onRope(rope, at.progress, scratch.v);
      spot.x = lane;
      if (at.falling) spot.y -= NET_DROP * 0.8;
      // On a rope, a friend's walker is up on its wheel too.
      const riding = !done && at.progress > 0 && !at.falling;
      mate.stand(spot, (pose, time) => (done ? cheerPose(pose, time, 0.6) : balancePose(pose, { foot: at.foot, lift: at.lift, wobble: at.wobble, time, onRope: at.progress > 0 })), dt, { wheel: riding, rock: riding ? at.wobble : 0 });
    });
  }

  /* ---------- what happens ---------- */

  setView(name, { snap = false } = {}) {
    this.view = name;
    if (snap) this.snapNext = true;
  }

  /** The foot the child has up, and how high, for a walker standing on a rooftop before a game: or null. */
  setLive(live) {
    this.live = live;
  }

  /** A burst of small shapes at a place. */
  burst(at, { shape = 'star', colours = ['#ffd23f'], count = 8, speed = 3, size = 0.3, life = 0.7, gravity = 5, up = 2.5 }) {
    for (let n = 0; n < count; n += 1) {
      const angle = Math.random() * Math.PI * 2;
      const out = speed * (0.4 + Math.random() * 0.6);
      this.sparks.emit({
        shape,
        colour: colours[n % colours.length],
        at,
        velocity: [Math.cos(angle) * out, up * (0.5 + Math.random()), Math.sin(angle) * out],
        life: life * (0.7 + Math.random() * 0.6),
        size: size * (0.7 + Math.random() * 0.6),
        gravity,
        spin: (Math.random() - 0.5) * 6,
        drag: 1.2,
      });
    }
  }

  /** Something the rules say has happened, which is shown where it happened. */
  onWalkEvent(event) {
    if (!this.walker || !this.place) return;
    const item = event.thing ? this.items.find(({ rope, thing }) => rope === this.walk.index && thing.kind === event.thing.kind && thing.at === event.thing.at) : null;
    const here = scratch.w.copy(this.walker.root.position).setY(this.walker.root.position.y + 1.2);
    switch (event.type) {
      case 'star':
        if (item) {
          item.gone = 0.0001;
          this.burst(item.object.position, { shape: 'star', colours: ['#ffd23f', '#fff2bf'], count: 7, size: 0.26 });
        }
        break;
      case 'pop':
        if (item) {
          item.gone = 0.0001;
          this.burst(item.object.position, { shape: 'spark', colours: ['#e4572e', '#ffd23f', '#4aa3df'], count: 10, size: 0.3, speed: 3.5 });
        }
        break;
      case 'bird':
        if (item) item.riding = true;
        break;
      case 'bird-off':
        if (item) item.riding = false;
        break;
      case 'feather':
        if (item) item.riding = false;
        this.burst(here.setY(here.y + 0.8), { shape: 'leaf', colours: ['#4aa3df', '#bfe3f5'], count: 6, size: 0.28, gravity: 1.5, up: 1.2 });
        break;
      case 'red':
        if (item) item.red = true;
        break;
      case 'green':
        if (item) item.red = false;
        break;
      case 'fall':
        this.fallFrom = this.walker.root.position.clone();
        break;
      case 'crossed':
        this.burst(here, { shape: 'star', colours: ['#27c96b', '#baf0cf'], count: 6, size: 0.24, speed: 2.2 });
        break;
      case 'cup':
        if (this.cup) this.burst(scratch.v.copy(this.cup.position).setY(this.cup.position.y + 1.6), { shape: 'star', colours: ['#ffd23f', '#fff2bf'], count: 12, size: 0.4, speed: 3 });
        break;
      default:
    }
  }

  /** The walker has reached the last rooftop, and everyone there cheers. */
  celebrate() {
    this.cheering = true;
    for (const fan of this.fans) fan.body.setExpression('glad');
    this.walker?.body.setExpression('glad');
  }

  /* ---------- every frame ---------- */

  update(dt) {
    this.time += dt;
    const { walk, walker, place } = this;
    if (!walk || !walker || !place) return;
    this.updateWalker(dt);
    this.updateItems(dt);
    this.updateFans(dt);
    this.updateGust(dt);
    this.updateCamera(dt);
    const at = walker.root.position;
    this.sun.position.set(at.x - 12, at.y + 26, at.z + 10);
    this.sun.target.position.copy(at);
    this.sparks.update(dt);
  }

  /** Where the walker is and how it stands, from what the rules say. */
  updateWalker(dt) {
    const { walk, walker, place } = this;
    const playing = walk.state !== 'ready';
    const foot = playing ? walk.foot : this.live?.foot ?? null;
    const lift = playing ? walk.lift : this.live?.lift ?? 0;
    let target = this.spotOn(walk.index, scratch.v);
    let pose = (out, time) => balancePose(out, { foot, lift, wobble: 0, time, onRope: false });
    let size = 1;
    let rate = 2.6; // Across a rooftop, at a walk.

    if (walk.state === 'rope') {
      const rope = place.ropes[walk.index];
      target = this.onRope(rope, walk.progress, scratch.v);
      pose = (out, time) => balancePose(out, { foot, lift, wobble: walk.wobble, time, onRope: true });
      rate = 30;
    } else if (walk.state === 'stepping') {
      // Off the rope, and across the rooftop in small steps, to where the next rope starts.
      const across = clamp(1 - walk.timer / WALK.stepSeconds, 0, 1);
      const eased = across * across * (3 - 2 * across);
      target = this.onRope(place.ropes[walk.index], 1, scratch.v).lerp(this.spotOn(walk.index + 1, scratch.w), eased);
      target.y += Math.abs(Math.sin(across * Math.PI * 5)) * 0.07;
      rate = 30;
    } else if (walk.state === 'falling') {
      // A slow drop into the net, a bounce or two, and then away, to come back on the rooftop.
      const from = this.fallFrom ?? walker.root.position;
      const t = WALK.fallSeconds - walk.timer;
      const net = Math.min(place.ropes[walk.index].from.y, place.ropes[walk.index].to.y) - NET_DROP + 0.2;
      const drop = Math.min(1, t / 1.1);
      const bounce = t > 1.1 ? Math.abs(Math.sin((t - 1.1) * 4.2)) * 1.6 * Math.max(0, 1 - (t - 1.1) / 0.9) : 0;
      target = scratch.v.set(from.x, lerp(from.y, net, drop * drop) + bounce, from.z);
      pose = (out, time) => fallPose(out, time);
      // After the last drop the crossing has, the walker isn't put back: it sits where it landed.
      const stays = walk.lastDrop;
      if (stays && t > 2) pose = (out, time) => netPose(out, time);
      size = t > 2 && !stays ? 0 : 1;
      rate = 60;
      if (t > 2.3 && !stays) {
        // Out of sight in the net, the walker is put back on the rooftop, and grows there again.
        this.walkerAt.copy(this.spotOn(walk.index, scratch.w));
        target = this.walkerAt;
        size = 1;
        pose = (out, time) => balancePose(out, { time, onRope: false });
      }
    } else if (walk.state === 'lost') {
      // Sat in the net, where the last drop left it.
      const from = this.fallFrom ?? walker.root.position;
      const net = Math.min(place.ropes[walk.index].from.y, place.ropes[walk.index].to.y) - NET_DROP + 0.2;
      target = scratch.v.set(from.x, net, from.z);
      pose = (out, time) => netPose(out, time);
      rate = 60;
    } else if (walk.state === 'finished') {
      // On the last rooftop of all.
      target = this.spotOn(walk.index + 1, scratch.v);
      pose = (out, time) => cheerPose(out, time);
    }
    this.walkerAt.set(damp(this.walkerAt.x, target.x, rate, dt), damp(this.walkerAt.y, target.y, rate, dt), damp(this.walkerAt.z, target.z, rate, dt));
    // On a rope it's up on its wheel, which is put away as it steps off, or drops into the net.
    walker.stand(this.walkerAt, pose, dt, { size, wheel: walk.state === 'rope', rock: walk.state === 'rope' ? walk.wobble : 0 });
  }

  updateItems(dt) {
    const { walk, walker } = this;
    for (const item of this.items) {
      const { thing, object } = item;
      if (thing.kind === 'star') {
        object.rotation.y += dt * 2.2;
        object.position.y = item.base.y + Math.sin(this.time * 2.4 + thing.at * 9) * 0.08;
      } else if (thing.kind === 'balloon' && !item.gone) {
        object.position.y = item.base.y + Math.sin(this.time * 1.3 + thing.at * 7) * 0.12;
      }
      // A star or a balloon that's been had shrinks away.
      if (item.gone > 0) {
        item.gone = Math.min(1, item.gone + dt / 0.22);
        object.scale.setScalar(Math.max(0.001, 1 - item.gone));
        if (item.gone >= 1) object.visible = false;
      }
      if (thing.kind === 'bird') {
        // Riding on the walker's head, or up and away from it.
        const riding = Boolean(item.riding) && item.rope === walk.index;
        const head = scratch.v.copy(walker.root.position).setY(walker.root.position.y + walker.lift + 1.72 * WALKER_SIZE + (walker.spec.build?.neck ?? 0) * 0.9);
        const away = scratch.w.copy(item.base);
        const to = riding ? head : away;
        object.visible = riding || item.wasRiding > 0;
        item.wasRiding = riding ? 1 : Math.max(0, (item.wasRiding ?? 0) - dt / 1.6);
        object.position.set(damp(object.position.x, to.x, 5, dt), damp(object.position.y, to.y, 5, dt), damp(object.position.z, to.z, 5, dt));
        const flap = riding ? 0.15 : Math.sin(this.time * 22) * 0.9;
        object.userData.wings[0].rotation.z = flap;
        object.userData.wings[1].rotation.z = -flap;
      }
      if (thing.kind === 'light') {
        // One lamp lit at a time: the other is small and dull.
        const red = item.red === true;
        object.userData.red.scale.setScalar(red ? 1.25 : 0.55);
        object.userData.green.scale.setScalar(red ? 0.55 : 1.25);
      }
    }
  }

  updateFans(dt) {
    for (const fan of this.fans) {
      fan.body.setPose(cheerPose(fan.pose, this.time + fan.phase, this.cheering ? 1 : 0.3));
      fan.body.update(dt);
    }
  }

  /** In a gust, wisps of wind blow across the rope. */
  updateGust(dt) {
    const { walk, walker } = this;
    this.gustIn -= dt;
    if (walk.state !== 'rope' || !walk.inGust() || this.gustIn > 0) return;
    this.gustIn = 0.12;
    const at = walker.root.position;
    this.sparks.emit({
      shape: 'puff',
      colour: '#ffffff',
      at: scratch.w.set(at.x - 4 + Math.random() * 2, at.y + 0.4 + Math.random() * 2, at.z - 3 + Math.random() * 6),
      velocity: [7 + Math.random() * 3, 0, 0],
      life: 0.9,
      size: 0.4,
      grow: 0.5,
      opacity: 0.6,
    });
  }

  updateCamera(dt) {
    const { camera, walker, walk } = this;
    const at = scratch.v;
    const look = scratch.w;
    const here = walker.root.position;
    // When the walker drops into the net, the camera stays up by the rope and looks down after it.
    // After the last drop it goes on looking down, until the card comes, and then goes down to the net itself.
    const dropped = walk.state === 'falling' || (walk.state === 'lost' && this.view === 'play');
    const high = dropped && this.fallFrom ? this.fallFrom.y : this.walkerAt.y;
    const down = Math.max(0, high - here.y);
    let fov = 56;
    if (this.view === 'play') {
      // Behind and above the walker, a little to one side, looking along the rope to the next rooftop.
      // Up on its wheel the walker is higher, and so is the camera, by most of that.
      const lift = walker.lift;
      at.set(here.x + 1.4, high + 2.7 + lift * 0.8, here.z + 6.2);
      look.set(here.x, high + 0.9 + lift * 0.6 - down * 0.8, here.z - 7 + Math.min(1, down / 4) * 5.5);
    } else if (this.view === 'warmup') {
      // From behind, so the child's left is the walker's left, with the walker to the right of the picture.
      at.set(here.x - 0.85, high + 1.7, here.z + 7);
      look.set(here.x - 0.85, high + 1.0, here.z - 5);
      fov = 40;
    } else if (this.view === 'finish') {
      // Still from behind, to one side, so the walker is to the left of the finish card.
      at.set(here.x + 3.2, high + 2.3, here.z + 6.4);
      look.set(here.x + 4.6, high + 1.1, here.z - 8);
      fov = 50;
    } else if (this.view === 'title') {
      // The title card is in the middle of the screen, so the walker is seen to the left of it.
      at.set(here.x + 2.4, high + 1.9, here.z + 6.2);
      look.set(here.x + 3.4, high + 1.0, here.z - 6);
      fov = 42;
    } else {
      // Choosing who walks: from behind and a little above, in the middle.
      at.set(here.x + 0.6, high + 2.0, here.z + 5.6);
      look.set(here.x, high + 1.0, here.z - 4);
      fov = 40;
    }
    const rate = this.snapNext ? 1e6 : this.view === 'play' ? 4 : 2.4;
    this.cameraAt.set(damp(this.cameraAt.x, at.x, rate, dt), damp(this.cameraAt.y, at.y, rate, dt), damp(this.cameraAt.z, at.z, rate, dt));
    this.cameraLook.set(damp(this.cameraLook.x, look.x, rate, dt), damp(this.cameraLook.y, look.y, rate, dt), damp(this.cameraLook.z, look.z, rate, dt));
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = this.snapNext ? fov : damp(camera.fov, fov, 3, dt);
      camera.updateProjectionMatrix();
    }
    this.snapNext = false;
    camera.position.copy(this.cameraAt);
    camera.lookAt(this.cameraLook);
  }

  /** Where a place in the world is on the screen, in pixels. */
  project(x, y, z) {
    const point = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (point.x * 0.5 + 0.5) * this.canvas.clientWidth, y: (-point.y * 0.5 + 0.5) * this.canvas.clientHeight, behind: point.z > 1 };
  }

  /** Where the walker is on the screen, as shares of its width and height, for words that fly up from it. */
  walkerOnScreen(up = 2.2) {
    if (!this.walker) return { x: 0.5, y: 0.5 };
    const { position } = this.walker.root;
    const at = this.project(position.x, position.y + up + this.walker.lift, position.z);
    return { x: clamp(at.x / Math.max(1, this.canvas.clientWidth), 0.08, 0.92), y: clamp(at.y / Math.max(1, this.canvas.clientHeight), 0.12, 0.9) };
  }

  resize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    const most = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(MOST_PIXELS / Math.max(1, width * height)));
    this.renderer.setPixelRatio(this.quality >= 2 ? most : Math.min(most, 1));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  render() {
    const started = performance.now();
    this.renderer.render(this.scene, this.camera);
    // A computer that can't keep up draws less sharply, and then without shadows, and never goes back.
    this.frames += 1;
    if ((performance.now() - started) / 1000 > SLOW_FRAME_SECONDS) this.slowFrames += 1;
    if (this.frames < SLOW_CHECK_FRAMES) return;
    if (this.slowFrames > SLOW_CHECK_FRAMES / 2 && this.quality > 0) {
      this.quality -= 1;
      if (this.quality === 0) this.renderer.shadowMap.enabled = false;
      this.resize();
    }
    this.frames = 0;
    this.slowFrames = 0;
  }
}
