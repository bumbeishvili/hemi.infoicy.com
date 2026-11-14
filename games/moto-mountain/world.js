// What Moto Mountain looks like: the mountain road, the bike with the child's character on it, whatever a level
// has put on the road, and the camera riding along behind. It draws what the rules in ride.js say, and the
// bike leans as the child does.
//
// Nothing flashes or strobes, as seizures are more common in children with hemiplegia: things come and go by
// growing and shrinking, a catch is a burst of small shapes, and the picture itself never changes brightness.
// The camera tips with the bike only a little.
import * as THREE from '../../vendor/three/three.module.js';
import { Fighter3D, makePose } from '../../core/body/characters.js';
import { ROSTER, byId as characterById } from '../../core/body/roster.js';
import { Sparks } from '../../core/body/sparks.js';
import { BIKE, ROAD, rollFor } from './ride.js';
import { placeAt, shapeOf } from './road.js';
import { buildLand } from './land.js';
import { BIKE_SIZE, buildBales, buildBike, buildBoost, buildPuddle, buildRamp, buildScooter, buildSheep, buildSnowHeap, buildStar, buildWater, ridingPose, scooterPose } from './models.js';

const MOST_PIXELS = 3_200_000; // A very big screen is drawn a little less sharply, so that it stays quick.
const SLOW_FRAME_SECONDS = 1 / 45;
const SLOW_CHECK_FRAMES = 90;
const CAMERA_TIP = 0.22; // How much of the bike's lean the camera takes.
const FOG = [70, 330];
const START_AT = 0; // Where the bike stands before a ride.
const COAST = 40; // And how far past the finish it rolls on.
const MATE_COLOURS = ['#4aa3df', '#27c96b', '#b06ad9'];
const RIVAL_COLOURS = ['#4aa3df', '#27c96b', '#b06ad9', '#f2a03d', '#e05c9a'];
const RIVALS_SEEN = [-70, 300]; // The other riders are only drawn this far behind the bike, and this far in front.
// Where riders who are home wait: past where the child's bike stops, in a row along the grass on the right.
const PARKED = { from: COAST + 6, apart: 5, across: 5.6 };
// A rider right behind the child's bike would be between it and the camera, and fill the picture: there they
// shrink away, and come back as they drop further behind or draw level.
const IN_THE_WAY = { behind: [-12, -1.4], across: 1.9 };
const QUARTER = Math.PI / 2;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const damp = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));
const scratch = { a: {}, b: {}, v: new THREE.Vector3(), w: new THREE.Vector3() };

/** A bike with a character sitting on it. */
class Rider {
  constructor(spec, colour) {
    this.spec = spec;
    this.bike = buildBike(colour);
    this.body = new Fighter3D(spec);
    this.body.root.scale.setScalar(0.92);
    this.bike.lean.add(this.body.root);
    this.pose = makePose();
    this.root = this.bike.root;
    this.roll = 0;
    this.spin = 0;
    this.bounce = 0;
    this.lastX = 0;
    this.drift = 0;
    this.place();
  }

  /** Sits the character on the seat, leaning a little further than the bike does. */
  place(wave = 0) {
    ridingPose(this.pose, this.roll * 0.35, this.bounce);
    if (wave) {
      this.pose.handRX = -0.1 - wave * 0.45;
      this.pose.handRY = -0.34 + wave * 1.45;
      this.pose.handRZ = 0.78 - wave * 0.62;
      this.pose.openR = 0.25 + wave * 0.75;
      this.pose.headPitch = -0.1 - wave * 0.12;
    }
    this.body.setPose(this.pose);
  }

  /**
   * Puts the bike on the road: s along it, x across it, leaning by roll, height off the ground. yaw is how far
   * its nose points away from the way the road goes, as the rules have it. A friend's bike, whose game doesn't
   * say, points the way it's going across the road.
   */
  ride(shape, { s, x, roll, height = 0, v = 0, air = 0, yaw = null }, dt, wave = 0) {
    const at = placeAt(shape, s, x, scratch.a);
    this.root.position.set(at.x, at.y + 0.06 + height, at.z);
    const across = dt > 0 ? (x - this.lastX) / dt : 0;
    this.lastX = x;
    if (yaw === null) this.drift = damp(this.drift, clamp(Math.atan2(across, Math.max(v, 5)), -0.3, 0.3), 6, dt);
    else this.drift = yaw;
    this.root.rotation.set(0, Math.PI - at.heading - this.drift, 0);
    this.roll = roll;
    // Nose up the hill, up off a ramp and down again to land.
    this.bike.lean.rotation.set(-Math.atan(at.slope) - (air ? (0.5 - air) * 0.7 : 0), 0, roll, 'YXZ');
    this.spin += (v * dt) / BIKE_SIZE.wheel;
    for (const wheel of this.bike.wheels) wheel.rotation.x = this.spin;
    this.place(wave);
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
    this.scene.fog = new THREE.Fog('#d9f1ff', FOG[0], FOG[1]);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#a7c7a0', 1.7));
    this.sun = new THREE.DirectionalLight('#fff3dc', 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 80 });
    this.sun.shadow.radius = 4;
    this.scene.add(this.sun, this.sun.target);

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.3, 3400);
    this.cameraAt = new THREE.Vector3(0, 3, 8);
    this.cameraLook = new THREE.Vector3();
    this.cameraTip = 0;
    this.view = 'choose';
    this.snapNext = true;
    this.time = 0;
    this.frames = 0;
    this.slowFrames = 0;
    this.quality = 2;

    this.sparks = new Sparks(this.scene);
    this.bikeGoes = new THREE.Vector3(); // How fast the bike is going, and which way, in metres a second.
    this.bikeWas = new THREE.Vector3();
    this.rider = null;
    this.mates = [];
    this.rivals = []; // The other riders in the race, each a bike with a character on it.
    this.ride = null;
    this.shape = null;
    this.land = null;
    this.items = []; // What's on the road: { thing, object, ... }.
    this.fans = []; // Friends waiting at the top.
    this.lean = 0; // The child's lean, shown on a bike that's standing still.
    this.coast = 0;
    this.wave = 0;
    this.dustIn = 0;
    this.skies = new Map();
    this.buildSnowfall();

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /* ---------- building ---------- */

  /** The sky behind everything: deeper blue at the top, pale at the hills. */
  skyFor(theme) {
    if (!this.skies.has(theme)) {
      const canvas = document.createElement('canvas');
      canvas.width = 4;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      const fade = ctx.createLinearGradient(0, 0, 0, 256);
      fade.addColorStop(0, theme.sky[0]);
      fade.addColorStop(0.62, theme.sky[1]);
      fade.addColorStop(1, theme.sky[1]);
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, 4, 256);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.skies.set(theme, texture);
    }
    return this.skies.get(theme);
  }

  /** Slow flakes round the camera, for the snowy top of the mountain. */
  buildSnowfall() {
    const count = 160;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 1] = Math.random() * 22;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.snowfall = new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#ffffff', size: 0.22, transparent: true, opacity: 0, depthWrite: false }));
    this.snowfall.frustumCulled = false;
    this.snowfall.visible = false;
    this.scene.add(this.snowfall);
  }

  /** Whose bike it is. */
  setRider(spec) {
    this.rider?.dispose();
    this.rider = new Rider(spec, spec.colours?.accent ?? '#e4572e');
    this.scene.add(this.rider.root);
    this.snapNext = true;
  }

  /**
   * The ride to draw: its mountain is built from where its road goes. A ride that hasn't begun is the place
   * the bike waits in, on the title card and in the warm-up.
   */
  setRide(ride) {
    this.clearRide();
    this.ride = ride;
    this.shape = shapeOf(ride.plan);
    this.land = buildLand(this.shape, ride.plan, ride);
    this.scene.add(this.land.group);
    this.scene.background = this.skyFor(this.land.theme);
    this.scene.fog.color.set(this.land.theme.fog);
    this.things = new THREE.Group();
    this.scene.add(this.things);
    this.items = ride.things.filter(({ kind }) => kind !== 'bridge').map((thing) => this.buildItem(thing));
    // The other riders: friends from the others, the same ones each time for the same race.
    const others = ROSTER.filter(({ id }) => id !== this.rider?.spec.id);
    this.rivals = ride.rivals.map((rival, index) => {
      const rider = new Rider(others[(index * 2 + ride.levelNumber) % others.length], RIVAL_COLOURS[index % RIVAL_COLOURS.length]);
      this.scene.add(rider.root);
      return rider;
    });
    this.buildFans();
    this.coast = 0;
    this.wave = 0;
    this.snapNext = true;
  }

  clearRide() {
    for (const group of [this.land?.group, this.things]) {
      if (!group) continue;
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
    for (const item of this.items) item.rider?.dispose();
    for (const rival of this.rivals) rival.dispose();
    this.rivals = [];
    for (const fan of this.fans) {
      fan.body.root.removeFromParent();
      fan.body.dispose();
    }
    this.items = [];
    this.fans = [];
    this.land = null;
    this.things = null;
  }

  /** One thing on the road, standing where the rules have it. */
  buildItem(thing) {
    const { shape } = this;
    const builders = {
      star: () => buildStar(),
      snow: () => buildSnowHeap(),
      puddle: () => buildPuddle(thing.reach),
      boost: () => buildBoost(thing.reach),
      sheep: () => buildSheep(),
      ramp: () => buildRamp(thing.reach),
      scooter: () => buildScooter(),
      barrier: () => buildBales(thing.reach),
      river: () => buildWater(thing.to - thing.from + 1.2),
    };
    const object = builders[thing.kind]();
    const item = { thing, object, size: 1, gone: 0, wave: 0 };
    if (thing.kind === 'scooter') {
      // A friend from the others, the same one each time for the same ride.
      const others = ROSTER.filter(({ id }) => id !== this.rider?.spec.id);
      const spec = others[Math.round(thing.from) % others.length];
      item.rider = new Fighter3D(spec);
      item.rider.root.scale.setScalar(0.86);
      item.pose = makePose();
      object.lean.add(item.rider.root);
      this.things.add(object.root);
      item.object = object.root;
      item.spec = spec;
    } else {
      this.things.add(object);
    }
    // A river's water is flat, at the height of the road at its far side, where a bike wades out of it.
    const river = thing.kind === 'river';
    const at = placeAt(shape, river ? (thing.from + thing.to) / 2 : thing.at ?? thing.from, thing.x ?? 0, scratch.a);
    const y = river ? placeAt(shape, thing.to, 0, scratch.b).y + 0.12 : at.y + 0.06;
    item.object.position.set(at.x, y, at.z);
    item.object.rotation.y = Math.PI - at.heading;
    item.baseY = y;
    // A star is at the height of the bike's rider, and one in the air where a bike that's flying is.
    if (thing.kind === 'star') item.baseY += 1.25 + (thing.high ?? 0);
    return item;
  }

  /** Two friends at the top, who cheer as the bike comes in. */
  buildFans() {
    const { shape, ride } = this;
    const taken = new Set([this.rider?.spec.id, ...this.items.map(({ spec }) => spec?.id), ...this.mates.map(({ spec }) => spec.id), ...this.rivals.map(({ spec }) => spec.id)]);
    const free = ROSTER.filter(({ id }) => !taken.has(id));
    // One up the road on the left, by the hut, and one on the right, where the finish card leaves room to see them.
    const spots = [[ride.plan.length + COAST + 12, -7], [ride.plan.length + COAST + 0.6, 9]];
    this.fans = spots.map(([s, x], index) => {
      const spec = free[(ride.levelNumber + index * 3) % free.length];
      const body = new Fighter3D(spec);
      const at = placeAt(shape, s, x, scratch.a);
      body.root.position.set(at.x, this.land.ground(at.x, at.z), at.z);
      // Turned towards the road.
      body.root.rotation.y = QUARTER * Math.sign(x) - at.heading + Math.PI;
      this.scene.add(body.root);
      return { body, pose: makePose(), phase: index * 1.7 };
    });
  }

  /** Friends' bikes, each with their character on it. */
  setMates(specs) {
    for (const mate of this.mates) mate.dispose();
    this.mates = specs.map((spec, index) => {
      const mate = new Rider(spec, MATE_COLOURS[index % MATE_COLOURS.length]);
      mate.root.visible = false;
      this.scene.add(mate.root);
      return mate;
    });
  }

  /** Where each friend's bike is: { s, x, roll, height, v }, or null for one who's gone. */
  placeMates(places, dt) {
    this.mates.forEach((mate, index) => {
      const at = places[index];
      mate.root.visible = Boolean(at) && Boolean(this.shape);
      if (mate.root.visible) mate.ride(this.shape, at, dt);
    });
  }

  /* ---------- what happens ---------- */

  setView(name, { snap = false } = {}) {
    this.view = name;
    if (snap) this.snapNext = true;
  }

  /** The child's lean, for a bike that's standing still, as in the warm-up. */
  setLean(share) {
    this.lean = share;
  }

  /** Where something on the road is, in the world. */
  spotOf(thing, out = new THREE.Vector3()) {
    const at = placeAt(this.shape, thing.pos ?? thing.at ?? thing.from, thing.x ?? 0, scratch.b);
    return out.set(at.x, at.y + 0.8, at.z);
  }

  /**
   * A burst of small shapes at a place. withBike has them go along with the bike, as fast as it's going, and not
   * hang where they were made: the camera is a few metres behind the bike, and half a second later it's where
   * the bike was. On the ground a burst is under it by then. In the air it would be right in front of it, and
   * the camera would fly through it: a burst of pale stars filled the middle of the picture there for a frame,
   * and changed its brightness by 5.8 out of 255, where the most the games allow is 4.
   */
  burst(at, { shape = 'star', colours = ['#ffd23f'], count = 10, speed = 4, size = 0.5, life = 0.7, gravity = 6, up = 3, withBike = false }) {
    const carry = withBike ? this.bikeGoes : null;
    for (let n = 0; n < count; n += 1) {
      const angle = Math.random() * Math.PI * 2;
      const out = speed * (0.4 + Math.random() * 0.6);
      this.sparks.emit({
        shape,
        colour: colours[n % colours.length],
        at,
        velocity: [Math.cos(angle) * out + (carry?.x ?? 0), up * (0.5 + Math.random()) + (carry?.y ?? 0), Math.sin(angle) * out + (carry?.z ?? 0)],
        life: life * (0.7 + Math.random() * 0.6) * (carry ? 0.75 : 1),
        size: size * (0.7 + Math.random() * 0.6),
        gravity,
        spin: (Math.random() - 0.5) * 6,
        // Carried with the bike, they keep up with it: left to slow down, they'd drift back to the camera.
        drag: carry ? 0.15 : 1.2,
      });
    }
  }

  /** Something the rules say has happened, which is shown where it happened. */
  onRideEvent(event) {
    if (!this.rider || !this.shape) return;
    const bike = this.rider.root.position;
    const here = scratch.v.set(bike.x, bike.y + 0.9, bike.z);
    const item = event.thing ? this.items.find(({ thing }) => thing === event.thing) : null;
    // In the air, what bursts at the bike goes along with it: see burst.
    const withBike = Boolean(this.ride?.air);
    switch (event.type) {
      case 'star':
        if (item) item.gone = 0.0001;
        this.burst(this.spotOf(event.thing).setY(here.y + 0.3), { shape: 'star', colours: ['#ffd23f', '#fff2bf'], count: 7, size: 0.3, withBike });
        break;
      case 'snow':
        if (item) item.gone = 0.0001;
        this.burst(this.spotOf(event.thing), { shape: 'snow', colours: ['#ffffff', '#e3eef6'], count: 16, size: 0.7, speed: 5, up: 4 });
        break;
      case 'splash':
        this.burst(here.setY(bike.y + 0.2), { shape: 'bubble', colours: ['#7cc3ee', '#c9e8fb'], count: 14, size: 0.4, speed: 4.5, up: 4.5, gravity: 11 });
        break;
      case 'boost':
        this.burst(here, { shape: 'spark', colours: ['#f7d154', '#fff2bf'], count: 10, size: 0.5, speed: 3, up: 1.5, gravity: 0 });
        break;
      case 'land':
        this.burst(here.setY(bike.y + 0.15), { shape: 'puff', colours: ['#e8e2d2'], count: 8, size: 0.7, speed: 3, up: 1, gravity: 0, life: 0.6 });
        if (event.trick) this.burst(scratch.w.set(bike.x, bike.y + 1.8, bike.z), { shape: 'star', colours: ['#b06ad9', '#f7d154'], count: 9, size: 0.3, speed: 3, up: 3, withBike: true });
        break;
      case 'crash':
      case 'rival-crash':
        // Hay bales burst into straw, and are gone.
        if (item) item.gone = 0.0001;
        this.burst(this.spotOf(event.thing), { shape: 'leaf', colours: ['#f0c960', '#e2b24a', '#fff0b8'], count: event.type === 'crash' ? 22 : 12, size: 0.5, speed: 5, up: 4.5, gravity: 7, life: 0.9 });
        break;
      case 'clear':
        this.burst(here.setY(bike.y + 0.6), { shape: 'star', colours: ['#27c96b', '#baf0cf'], count: 6, size: 0.26, speed: 2.5, up: 2, withBike: true });
        break;
      case 'wade':
        this.burst(here.setY(bike.y + 0.3), { shape: 'bubble', colours: ['#7cc3ee', '#c9e8fb'], count: 20, size: 0.5, speed: 5.5, up: 5.5, gravity: 11 });
        break;
      case 'river':
        this.burst(here.setY(bike.y + 0.6), { shape: 'star', colours: ['#7cc3ee', '#fff2bf'], count: 8, size: 0.3, speed: 3, up: 2.5, withBike: true });
        break;
      case 'clean':
        this.burst(here.setY(bike.y + 1.6), { shape: 'star', colours: ['#27c96b', '#baf0cf'], count: 6, size: 0.26, speed: 2.5, up: 2.5 });
        break;
      case 'sheep-goes':
        if (item) item.leaving = 0.0001;
        break;
      case 'pass':
        if (item) item.wave = 0.0001;
        break;
      case 'scooter-aside':
        if (item) item.wave = 0.0001;
        break;
      case 'cup':
        if (this.land?.cup) this.burst(scratch.w.copy(this.land.cup.position).setY(this.land.cup.position.y + 1.6), { shape: 'star', colours: ['#ffd23f', '#fff2bf'], count: 14, size: 0.5, speed: 3.5, up: 4 });
        break;
      default:
    }
  }

  /** The bike has reached the top, and everyone there cheers. */
  celebrate() {
    this.cheering = true;
    for (const fan of this.fans) fan.body.setExpression('glad');
    this.rider?.body.setExpression('glad');
  }

  /* ---------- every frame ---------- */

  update(dt) {
    this.time += dt;
    const { ride, rider, shape } = this;
    if (!ride || !rider || !shape) return;
    const riding = ride.state !== 'ready';
    const finished = ride.state === 'finished';
    // Past the finish, the bike rolls on to the hut and stops.
    if (finished) this.coast = damp(this.coast, COAST, 1.1, dt);
    this.wave = damp(this.wave, finished ? 1 : 0, 3, dt);
    const s = riding ? ride.s + this.coast : START_AT;
    const roll = riding && !finished ? ride.roll : damp(rider.roll, rollFor(this.lean), BIKE.rollFollow, dt);
    const speed = finished ? (COAST - this.coast) * 1.1 : riding ? ride.v : 0;
    const air = ride.air ? clamp(ride.air.t / BIKE.jumpSeconds, 0.001, 1) : 0;
    rider.bounce = ride.offRoad && speed > 1 ? Math.sin(this.time * 31) * 0.012 : 0;
    // Its nose swings round as it turns, and comes back in line as it rolls up to the hut.
    const yaw = riding ? ride.yaw * (finished ? Math.max(0, 1 - this.coast / 8) : 1) : 0;
    rider.ride(shape, { s, x: riding ? ride.x : 0, roll, height: ride.height, v: speed, air, yaw }, dt, this.wave * (0.6 + 0.4 * Math.sin(this.time * 7)));

    this.updateItems(dt);
    this.updateRivals(dt);
    this.updateFans(dt);
    this.updateDust(dt, speed);
    this.updateSnowfall(dt, s);
    this.updateCamera(dt, s, riding ? ride.x : 0, roll);

    // The sun's shadows are only worked out round the bike.
    const bike = rider.root.position;
    // How fast it's going, from where it was a frame ago: nothing, for a frame in which it was put somewhere new.
    if (dt > 0 && bike.distanceTo(this.bikeWas) < 3) this.bikeGoes.copy(bike).sub(this.bikeWas).divideScalar(dt);
    else this.bikeGoes.set(0, 0, 0);
    this.bikeWas.copy(bike);
    this.sun.position.set(bike.x - 14, bike.y + 30, bike.z + 12);
    this.sun.target.position.copy(bike);
    this.sparks.update(dt);
  }

  /**
   * The other riders, where the rules have them. One who is home waits past the finish, off the road, out of the
   * way of the child's bike as it rolls up.
   */
  updateRivals(dt) {
    const { shape, ride } = this;
    let home = 0;
    this.rivals.forEach((rider, index) => {
      const rival = ride.rivals[index];
      if (!rival) return;
      if (rival.done) {
        const s = ride.plan.length + PARKED.from + home * PARKED.apart;
        home += 1;
        rider.root.visible = true;
        rider.size = damp(rider.size ?? 1, 1, 8, dt);
        rider.root.scale.setScalar(rider.size);
        rider.ride(shape, { s, x: PARKED.across, roll: 0, v: 0 }, dt, this.cheering ? 0.6 + 0.4 * Math.sin(this.time * 7 + index) : 0);
        return;
      }
      const ahead = rival.s - ride.s;
      const inWay = this.view === 'play' && ahead > IN_THE_WAY.behind[0] && ahead < IN_THE_WAY.behind[1] && Math.abs(rival.x - ride.x * 0.6) < IN_THE_WAY.across;
      rider.size = damp(rider.size ?? 1, inWay ? 0 : 1, 10, dt);
      rider.root.visible = ahead > RIVALS_SEEN[0] && ahead < RIVALS_SEEN[1] && rider.size > 0.02;
      if (!rider.root.visible) return;
      rider.root.scale.setScalar(rider.size);
      rider.ride(shape, { s: rival.s, x: rival.x, roll: rival.roll, height: rival.height, v: rival.v, air: rival.air ? 0.5 : 0 }, dt);
    });
  }

  updateItems(dt) {
    const { shape, ride } = this;
    for (const item of this.items) {
      const { thing, object } = item;
      if (thing.kind === 'star') {
        object.rotation.y += dt * 2.2;
        object.position.y = item.baseY + Math.sin(this.time * 2.4 + thing.at) * 0.12;
      }
      // A star or a heap that's been taken shrinks away.
      if (item.gone > 0) {
        item.gone = Math.min(1, item.gone + dt / 0.22);
        object.scale.setScalar(Math.max(0.001, 1 - item.gone));
        if (item.gone >= 1) object.visible = false;
      }
      if (thing.kind === 'sheep' && item.leaving > 0) {
        // It trots off to the nearer edge, with little hops.
        item.leaving = Math.min(1, item.leaving + dt / 1.5);
        const side = Math.sign(thing.x) || 1;
        const x = thing.x + side * (ROAD.half + ROAD.verge - 0.6 - Math.abs(thing.x)) * item.leaving;
        const at = placeAt(shape, thing.at, x, scratch.a);
        object.position.set(at.x, item.baseY + Math.abs(Math.sin(item.leaving * Math.PI * 4)) * 0.22, at.z);
        object.rotation.y = Math.PI - at.heading + side * -QUARTER * Math.min(1, item.leaving * 3);
      }
      if (thing.kind === 'scooter') {
        const side = Math.sign(thing.x) || 1;
        const x = thing.x + side * (ROAD.half + ROAD.verge - 0.8 - Math.abs(thing.x)) * (thing.over ?? 0);
        const at = placeAt(shape, thing.pos ?? thing.from, x, scratch.a);
        object.position.set(at.x, at.y + 0.06, at.z);
        object.rotation.y = Math.PI - at.heading;
        object.visible = thing.pos - ride.s < 260 && ride.s - thing.pos < 60;
        // A wave as the bike goes by.
        if (item.wave > 0) item.wave = Math.min(2, item.wave + dt);
        const waving = item.wave > 0 && item.wave < 2 ? 0.6 + 0.4 * Math.sin(item.wave * 9) : 0;
        scooterPose(item.pose, waving);
        item.rider.setPose(item.pose);
        item.rider.update(dt);
      }
    }
  }

  updateFans(dt) {
    for (const fan of this.fans) {
      const { pose } = fan;
      const cheer = this.cheering ? 1 : 0.35;
      const beat = Math.sin(this.time * 6 + fan.phase);
      Object.assign(pose, makePose());
      pose.handLX = 0.5;
      pose.handLY = 0.55 + beat * 0.2 * cheer;
      pose.handRX = -0.5;
      pose.handRY = 0.55 - beat * 0.2 * cheer;
      pose.up = Math.max(0, beat) * 0.12 * cheer;
      fan.body.setPose(pose);
      fan.body.update(dt);
    }
  }

  /** Dust from the back wheel on the grass, so it's seen as well as felt. */
  updateDust(dt, speed) {
    const { ride, rider } = this;
    this.dustIn -= dt;
    if (!ride.offRoad || speed < 2 || this.dustIn > 0 || ride.state !== 'riding') return;
    this.dustIn = 0.09;
    const at = rider.root.position;
    const snowy = ride.plan.snowFrom !== null && ride.s >= ride.plan.snowFrom;
    this.sparks.emit({
      shape: 'puff',
      colour: snowy ? '#ffffff' : '#cbb98a',
      at: scratch.w.set(at.x + (Math.random() - 0.5) * 0.5, at.y + 0.25, at.z + (Math.random() - 0.5) * 0.5),
      velocity: [(Math.random() - 0.5) * 1.5, 1 + Math.random(), (Math.random() - 0.5) * 1.5],
      life: 0.7,
      size: 0.5,
      grow: 1.2,
      opacity: 0.7,
    });
  }

  updateSnowfall(dt, s) {
    const { snowfall, ride } = this;
    const from = ride.plan.snowFrom;
    const amount = from === null ? 0 : clamp((s - (from - 80)) / 80, 0, 1);
    snowfall.visible = amount > 0;
    if (!snowfall.visible) return;
    snowfall.material.opacity = amount * 0.85;
    const positions = snowfall.geometry.attributes.position;
    for (let i = 0; i < positions.count; i += 1) {
      let y = positions.getY(i) - dt * 1.6;
      if (y < 0) y += 22;
      positions.setY(i, y);
    }
    positions.needsUpdate = true;
    snowfall.position.set(this.cameraAt.x, this.cameraAt.y - 8, this.cameraAt.z);
  }

  updateCamera(dt, s, x, roll) {
    const { shape, camera, rider } = this;
    const bike = rider.root.position;
    const at = scratch.v;
    const look = scratch.w;
    let fov = 58;
    let tip = 0;
    if (this.view === 'play') {
      // Behind and above the bike, looking up the road past it.
      // In the air it looks further up the road and a little higher: what goes by right under a bike that's
      // flying, a ramp, a row of bales, a river, is then out of the picture sooner, and smaller as it goes.
      const up = this.ride.height ?? 0;
      // How high the road is where the camera is, and where it looks, is taken over a stretch of it, not at
      // one place: over a river's bank, which is three metres up and down again in a few, the camera would
      // otherwise go up and down with it and tip over its top, and the whole picture with it, in a moment.
      const high = (along) => (placeAt(shape, along - 6, 0, scratch.b).y + placeAt(shape, along, 0, scratch.b).y + placeAt(shape, along + 6, 0, scratch.b).y) / 3;
      const backHigh = high(s - 6.2);
      const frontHigh = high(s + 14 + up * 3);
      const back = placeAt(shape, s - 6.2, x * 0.6, scratch.a);
      at.set(back.x, backHigh + 3.05 + up * 0.5, back.z);
      const front = placeAt(shape, s + 12 + up * 3, x * 0.3, scratch.b);
      look.set(front.x, frontHigh + 1.0 + up * 0.45, front.z);
      tip = this.reducedMotion ? 0 : roll * CAMERA_TIP;
    } else if (this.view === 'warmup') {
      // From behind, so that the child's left is the bike's left, with the bike to the right of the picture.
      const back = placeAt(shape, s - 6.4, -1.9, scratch.a);
      at.set(back.x, back.y + 2.0, back.z);
      const front = placeAt(shape, s + 6, -1.9, scratch.b);
      look.set(front.x, front.y + 1.15, front.z);
      fov = 40;
    } else if (this.view === 'finish') {
      // Still from behind, a little nearer and to one side, so the bike is to the left of the finish card and
      // the friends at the top are ahead of it. The camera never swings round: that would sweep the whole
      // picture past in a moment.
      const back = placeAt(shape, s - 6.4, 3.2, scratch.a);
      at.set(back.x, back.y + 2.5, back.z);
      const front = placeAt(shape, s + 9, 4.7, scratch.b);
      look.set(front.x, front.y + 1.1, front.z);
      fov = 50;
    } else if (this.view === 'title') {
      // The title card is in the middle of the screen, so the bike is seen to the left of it.
      const front = placeAt(shape, s + 6.6, -1.2, scratch.a);
      at.set(front.x, front.y + 1.5, front.z);
      const side = placeAt(shape, s + 1.6, -2.2, scratch.b);
      look.set(side.x, side.y + 1.0, side.z);
      fov = 40;
    } else {
      // Choosing who rides: the bike from in front and to one side.
      const front = placeAt(shape, s + 6.2, 3.3, scratch.a);
      at.set(front.x, front.y + 1.55, front.z);
      const side = placeAt(shape, s + 0.2, -0.9, scratch.b);
      look.set(side.x, side.y + 0.95, side.z);
      fov = 36;
    }
    const rate = this.snapNext ? 1e6 : this.view === 'play' ? 9 : 2.6;
    this.cameraAt.set(damp(this.cameraAt.x, at.x, rate, dt), damp(this.cameraAt.y, at.y, rate, dt), damp(this.cameraAt.z, at.z, rate, dt));
    this.cameraLook.set(damp(this.cameraLook.x, look.x, rate, dt), damp(this.cameraLook.y, look.y, rate, dt), damp(this.cameraLook.z, look.z, rate, dt));
    this.cameraTip = damp(this.cameraTip, tip, this.snapNext ? 1e6 : 5, dt);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = this.snapNext ? fov : damp(camera.fov, fov, 3, dt);
      camera.updateProjectionMatrix();
    }
    this.snapNext = false;
    camera.position.copy(this.cameraAt);
    // Tipped a little with the bike: up is turned about the way the camera is looking.
    const forward = scratch.v.copy(this.cameraLook).sub(this.cameraAt).normalize();
    const right = scratch.w.crossVectors(forward, camera.up.set(0, 1, 0)).normalize();
    camera.up.set(0, 1, 0).multiplyScalar(Math.cos(this.cameraTip)).addScaledVector(right, Math.sin(this.cameraTip));
    camera.lookAt(this.cameraLook);
  }

  /** Where a place in the world is on the screen, in pixels. */
  project(x, y, z) {
    const point = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (point.x * 0.5 + 0.5) * this.canvas.clientWidth, y: (-point.y * 0.5 + 0.5) * this.canvas.clientHeight, behind: point.z > 1 };
  }

  /** Where the bike is on the screen, as shares of its width and height, for words that fly up from it. */
  bikeOnScreen(up = 1.6) {
    if (!this.rider) return { x: 0.5, y: 0.6 };
    const { position } = this.rider.root;
    const at = this.project(position.x, position.y + up, position.z);
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

// Checked here so that a mistake in the roster shows up as soon as the page loads.
if (!characterById('giraffe')) console.error('No giraffe in the roster');
