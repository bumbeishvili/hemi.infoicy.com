// The picture of a patrol. The camera is fixed, high up and looking down over the whole valley, so a place
// on the ground is always at the same place on the screen, and that's what lets the hand be a pointer.
// The rules are in patrol.js, and this only shows what they say.
//
// Nothing flashes or strobes, as seizures are more common in children with hemiplegia. There's no muzzle
// flash and nothing explodes. A shot is a small ball and a little soft smoke, a hit is a few small shapes
// where it happened, and the picture itself never changes brightness.
import * as THREE from '../../vendor/three/three.module.js';
import { ball, outlineMaterial } from '../../core/body/characters.js';
import { SHAPES, Sparks } from '../../core/body/sparks.js';
import { Glove } from '../../core/glove.js';
import { CageView, Loot } from './goodies.js';
import { Marks } from './marks.js';
import { GUN, NEWS, POWERS, PRIZES, shellPoint } from './patrol.js';
import { ChildTank, PAINTS, RobotTank, shadowTexture } from './tanks.js';
import { Valley } from './valley.js';
import { PLAY, bridgeRise, clampToPlay, groundY, heightAt } from './valley-map.js';

const FOV = 24;
const ELEVATION = (45 * Math.PI) / 180; // How far the camera looks down from level.
// How much of the screen the play area gets. The top is left for the fort, the mirror and the numbers.
const PLAY_SCREEN = { top: 0.27, bottom: 0.985, side: 0.012 };
const SLOW_FRAME_SECONDS = 1 / 34;
const SLOW_CHECK_FRAMES = 90;
const PALM_SHARE = 0.04; // The little copy of the hand under the crosshair.
const CROSSHAIR_SHARE = 0.066;
const BAR_ABOVE = { scout: 5.6, basher: 5.8, heavy: 6.6, shield: 6.4, digger: 5.6, splitter: 6.6, mini: 4.4, boss: 8.6, cage: 8.4 };
const RING_POINTS = 64;
const SHOTS_AT_ONCE = 16;
const LABEL_SECONDS = 2.6; // The first time something new turns up, its name is over it for this long.
// What the new kinds of robot tank are called, the first time each turns up.
const NEWS_BY_KEY = Object.fromEntries(Object.values(NEWS).flat().map((item) => [item.key, item]));
const KIND_LABELS = {
  shield: { name: 'Shield tank', nameKa: 'ფარიანი ტანკი' },
  digger: { name: 'Digger tank', nameKa: 'მთხრელი ტანკი' },
  splitter: { name: 'Splitting tank', nameKa: 'ორად გაყოფადი ტანკი' },
  boss: { name: 'Big boss tank', nameKa: 'დიდი უფროსი ტანკი' },
};
// The warm light of the evening, on the higher levels, which is just as bright as the day's.
const DAY = { sky: '#79bf60', hemi: '#ffffff', ground: '#a6c79a', sun: '#fff3dc', fog: '#d7eefb' };
const SUNSET = { sky: '#e9a86a', hemi: '#ffd8b0', ground: '#c99a78', sun: '#ffb877', fog: '#f7c9a0' };
const SHELLS_AT_ONCE = 6;
const TRACK_MARKS = 420;
const TRACK_EVERY = 0.85;
const CREW_SMOKE_SECONDS = 2.6;
// In a battle with a friend: their shots coming over, how high their name is over their tank, above Giraffe's
// head, and the +1 that goes up beside it for each hit, slowly, fading in and out.
const FRIEND_SHOTS_AT_ONCE = 6;
const NAME_ABOVE = 10.6;
const POINT_SECONDS = 1.4;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const mix = (from, to, share) => from + (to - from) * share;
const between = (low, high) => low + Math.random() * (high - low);

// Bolts, for robot tanks rattling to a halt, alongside the shapes everything else uses.
SHAPES.bolt = (ctx) => {
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    ctx[i ? 'lineTo' : 'moveTo'](Math.cos(angle) * 44, Math.sin(angle) * 44);
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
};

export class Field {
  constructor(canvas, overlay) {
    this.canvas = canvas;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#79bf60');
    this.scene.fog = new THREE.Fog('#d7eefb', 150, 330);
    this.hemi = new THREE.HemisphereLight('#ffffff', '#a6c79a', 1.95);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight('#fff3dc', 1.9);
    this.sun = sun;
    // The same way the baked shadows on the ground fall.
    sun.position.set(-0.45, 1, -0.3);
    this.scene.add(sun);

    this.camera = new THREE.PerspectiveCamera(FOV, 1, 5, 900);
    this.sparks = new Sparks(this.scene);
    this.valley = new Valley(this.scene);
    this.marks = new Marks(overlay);
    this.softShadow = shadowTexture();
    this.child = new ChildTank(this.scene, this.softShadow, this.reducedMotion);
    // A friend's tank, in a battle with them: made the first time it's needed.
    this.friendTank = null;
    this.friendName = '';
    this.friendShots = [];
    // Two on one screen, in one picture: where the friend's crosshair is, as their game says, or null.
    this.friendAim = null;
    this.points = [];
    this.robots = new Map();
    this.loot = new Loot(this.scene, this.softShadow, this.reducedMotion);
    this.cageViews = new Map();
    this.labels = [];
    this.labelled = new Set();
    this.named = []; // Every name put up this round, in order, for the tests.
    this.playing = false; // Whether the game is being played, after "GO!", which is when names come up.
    this.language = 'en';
    this.sparkleIn = 0;

    this.gloves = { left: new Glove('left'), right: new Glove('right') };
    this.side = 'right';
    this.aspect = 16 / 9;
    this.steady = { x: 0, y: 0, seen: false };
    this.patrol = null;
    this.showMarks = false;
    this.frames = 0;
    this.slowFrames = 0;
    this.quality = 2;
    this.effects = 1;
    this.time = 0;
    this.handState = 'none';

    this.ray = new THREE.Vector3();
    this.point = new THREE.Vector3();
    this.buildShots();
    this.buildTracks();

    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.resize();
  }

  configure({ side = this.side, language = this.language }) {
    this.side = side;
    this.language = language;
  }

  /** The light of the day, or of a warm evening on the higher levels. */
  setSunset(on) {
    const look = on ? SUNSET : DAY;
    this.scene.background.set(look.sky);
    this.hemi.color.set(look.hemi);
    this.hemi.groundColor.set(look.ground);
    this.sun.color.set(look.sun);
    this.scene.fog.color.set(look.fog);
    this.sunset = on;
  }

  /**
   * The first time something new turns up, its name goes over it for a moment. item is what it's called,
   * as { name, nameKa }, and at() says where it is.
   */
  label(key, item, at) {
    if (this.labelled.has(key) || !item) return;
    this.labelled.add(key);
    this.named.push(this.wordsFor(item));
    this.labels.push({ key, item, at, age: 0 });
  }

  /** The name of something new over a robot tank, for as long as it's rolling. */
  labelOver(key, enemy, item = NEWS_BY_KEY[key]) {
    this.label(key, item, () => (enemy.state === 'rolling' ? this.point.set(enemy.x, enemy.y + BAR_ABOVE[enemy.kind] + 1.6, enemy.z) : null));
  }

  /** Over the child's tank, where a prize or a crate's name goes once it's been picked up. */
  overTank() {
    const { tank } = this.patrol;
    return this.point.set(tank.x, tank.y + 9, tank.z);
  }

  wordsFor(item) {
    return this.language === 'ka' && item.nameKa ? item.nameKa : item.name;
  }

  buildShots() {
    const shape = ball(0.46);
    const line = outlineMaterial('#1d2740', 0.09);
    const mine = new THREE.MeshBasicMaterial({ color: '#ffd23f' });
    // Each kind of fire has its own look: the usual yellow balls, see-through bubbles and big boing balls.
    this.shotLooks = {
      ball: { fill: mine, size: 1, arc: 1.6 },
      spread: { fill: mine, size: 1, arc: 1.6 },
      bubble: { fill: new THREE.MeshBasicMaterial({ color: '#a9dcff', transparent: true, opacity: 0.6, depthWrite: false }), size: 2.1, arc: 2.4 },
      boing: { fill: new THREE.MeshBasicMaterial({ color: '#ff8c5a' }), size: 2.4, arc: 5 },
    };
    this.shotBalls = Array.from({ length: SHOTS_AT_ONCE }, () => {
      const group = new THREE.Group();
      group.add(new THREE.Mesh(shape, mine), new THREE.Mesh(shape, line));
      group.visible = false;
      this.scene.add(group);
      return group;
    });
    // A friend's shots are the same balls, in the colour of their tank, so it's plain whose they are.
    const friends = new THREE.MeshBasicMaterial({ color: PAINTS.friend.light });
    this.friendBalls = Array.from({ length: FRIEND_SHOTS_AT_ONCE }, () => {
      const group = new THREE.Group();
      group.add(new THREE.Mesh(shape, friends), new THREE.Mesh(shape, line));
      group.visible = false;
      this.scene.add(group);
      return group;
    });
    const big = ball(1.05);
    const bigLine = outlineMaterial('#1d2740', 0.14);
    const theirs = new THREE.MeshBasicMaterial({ color: '#ff7a5c' });
    const band = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.17, 8, 18).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#fff3d0' }));
    this.shellBalls = Array.from({ length: SHELLS_AT_ONCE }, () => {
      const group = new THREE.Group();
      group.add(new THREE.Mesh(big, theirs), new THREE.Mesh(big, bigLine), band.clone());
      group.visible = false;
      this.scene.add(group);
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.softShadow, color: '#102a22', transparent: true, opacity: 0.4, depthWrite: false }));
      shadow.visible = false;
      this.scene.add(shadow);
      return { group, shadow };
    });
  }

  /** The marks the treads leave behind them on the ground. */
  buildTracks() {
    const mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#4a3d2a', transparent: true, opacity: 0.26, depthWrite: false }),
      TRACK_MARKS,
    );
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.renderOrder = 1;
    this.scene.add(mesh);
    this.tracks = mesh;
    this.nextTrack = 0;
    this.trackMatrix = new THREE.Matrix4();
    this.trackTurn = new THREE.Quaternion();
    this.trackAt = new THREE.Vector3();
    this.trackSize = new THREE.Vector3();
    this.trackUp = new THREE.Vector3(0, 1, 0);
    this.lastTrack = new Map();
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.renderer.setSize(this.width, this.height, false);
    // Going by the height of the window, or its width if it's standing on end.
    this.markSize = Math.min(this.height, this.width * 0.78);
    this.palmSize = Math.max(20, this.markSize * PALM_SHARE);
    this.fitCamera();
    this.marks.resize();
  }

  /** The whole play area in view, as big as it'll go, whatever the shape of the window. */
  fitCamera() {
    const { camera, width, height } = this;
    camera.aspect = width / height;
    camera.fov = FOV;
    camera.updateProjectionMatrix();
    const up = Math.sin(ELEVATION);
    const back = Math.cos(ELEVATION);
    const at = new THREE.Vector3();
    const place = (distance, lookZ) => {
      camera.position.set(0, up * distance, lookZ + back * distance);
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, lookZ);
      camera.updateMatrixWorld();
    };
    const screen = (x, z) => {
      at.set(x, 0, z).project(camera);
      return { x: (at.x + 1) / 2, y: (1 - at.y) / 2 };
    };
    const { top, bottom, side } = PLAY_SCREEN;
    const middle = (top + bottom) / 2;
    const fits = (distance) => {
      let lookZ = 0;
      for (let i = 0; i < 8; i += 1) {
        place(distance, lookZ);
        const far = screen(0, PLAY.far);
        const near = screen(0, PLAY.near);
        lookZ += (((far.y + near.y) / 2 - middle) * (PLAY.near - PLAY.far)) / Math.max(0.01, near.y - far.y);
      }
      place(distance, lookZ);
      const far = screen(PLAY.left, PLAY.far);
      const near = screen(PLAY.left, PLAY.near);
      const ok = far.y >= top - 0.001 && near.y <= bottom + 0.001 && near.x >= side && far.x >= side;
      return { ok, lookZ };
    };
    let low = 40;
    let high = 1200;
    for (let i = 0; i < 26; i += 1) {
      const distance = (low + high) / 2;
      if (fits(distance).ok) high = distance;
      else low = distance;
    }
    const { lookZ } = fits(high);
    place(high, lookZ);
    camera.far = high + 420;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    this.valley.fitTo(camera);
    // Fog that only touches the hills at the back, however far away the camera has had to go.
    this.scene.fog.near = high + 22;
    this.scene.fog.far = high + 240;
    this.cameraDistance = high;
  }

  /* ---------- a new game ---------- */

  reset(patrol) {
    for (const view of this.robots.values()) view.dispose();
    this.robots.clear();
    this.patrol = patrol;
    this.valley.setFlags(false);
    this.child.cheerLeft = 0;
    this.celebrating = false;
    this.steady.seen = false;
    this.tracks.count = 0;
    this.nextTrack = 0;
    this.lastTrack.clear();
    // The names go first, so that a new kind of tank in the opening wave is named too.
    this.labels = [];
    this.labelled.clear();
    this.named = [];
    this.setSunset(Boolean(patrol.plan?.sunset));
    if (patrol.plan?.sunset) this.label('sunset', NEWS_BY_KEY.sunset, () => this.point.set(0, 12, PLAY.far + 8));
    for (const enemy of patrol.enemies) this.addRobot(enemy);
    for (const ball of this.shotBalls) ball.visible = false;
    this.loot.clear();
    for (const view of this.cageViews.values()) view.dispose();
    this.cageViews.clear();
    for (const cage of patrol.cages) this.cageViews.set(cage, new CageView(cage, this.scene, this.reducedMotion));
    for (const { group, shadow } of this.shellBalls) {
      group.visible = false;
      shadow.visible = false;
    }
    this.child.place(patrol.tank, 1 / 60, { snap: true });
    this.showFriend(patrol.friend ?? null);
  }

  /** In a battle with a friend, their tank, where it starts. With no friend there's none. */
  showFriend(friend) {
    this.friendShots = [];
    this.points = [];
    for (const ball of this.friendBalls) ball.visible = false;
    if (!friend) {
      this.friendTank?.setVisible(false);
      return;
    }
    this.friendTank ??= new ChildTank(this.scene, this.softShadow, this.reducedMotion, PAINTS.friend);
    this.friendTank.setVisible(true);
    this.friendTank.cheerLeft = 0;
    this.friendTank.place(friend, 1 / 60, { snap: true });
  }

  /**
   * The friend's gun has fired, as many times as this: each shot comes over. In a battle it's at the child's tank.
   * On a patrol together it's at to, the robot tank their gun is firing at, or a place out along their turret.
   */
  friendFired(count, to = null) {
    const { patrol, friendTank } = this;
    if (!patrol?.friend || !friendTank?.visible) return;
    const at = to ?? patrol.tank;
    for (let i = 0; i < count && this.friendShots.length < FRIEND_SHOTS_AT_ONCE; i += 1) {
      const from = friendTank.muzzle(this.point).clone();
      const seconds = Math.max(0.12, Math.hypot(at.x - from.x, at.z - from.z) / GUN.shotSpeed);
      this.friendShots.push({ from, to: at, share: -i * 0.15, seconds });
    }
    friendTank.fired();
  }

  addRobot(enemy) {
    const view = new RobotTank(enemy, this.scene, this.softShadow, this.reducedMotion);
    view.place(enemy, 1 / 60, { snap: true });
    this.robots.set(enemy, view);
    if (KIND_LABELS[enemy.kind]) this.label(enemy.kind, KIND_LABELS[enemy.kind], () => (enemy.state === 'gone' ? null : this.point.set(enemy.x, enemy.y + BAR_ABOVE[enemy.kind] + 1.6, enemy.z)));
    // The second of a pair: the name goes between the two of them.
    const { leader } = enemy;
    if (leader) this.label('pairs', NEWS_BY_KEY.pairs, () => (enemy.state === 'rolling' && leader.state === 'rolling' ? this.point.set((enemy.x + leader.x) / 2, Math.max(enemy.y, leader.y) + 7.4, (enemy.z + leader.z) / 2) : null));
  }

  /* ---------- the hand ---------- */

  /** Where a place on the screen is on the ground. */
  groundAt(screenX, screenY) {
    const { camera, ray, point } = this;
    point.set((screenX / this.width) * 2 - 1, 1 - (screenY / this.height) * 2, 0.5).unproject(camera);
    ray.copy(point).sub(camera.position).normalize();
    if (ray.y >= -0.01) return clampToPlay(0, PLAY.far);
    const origin = camera.position;
    let height = 0;
    let x = 0;
    let z = 0;
    // A few steps are plenty, as the land is so gentle where the hand can point.
    for (let i = 0; i < 4; i += 1) {
      const along = (height - origin.y) / ray.y;
      x = origin.x + ray.x * along;
      z = origin.z + ray.z * along;
      height = heightAt(clamp(x, PLAY.left, PLAY.right), clamp(z, PLAY.far, PLAY.near));
    }
    return { x, z };
  }

  /** The hand goes from the camera's picture to the screen, and from there to the ground. */
  steer(dt, snapshot) {
    const { aspect } = this;
    for (const side of ['left', 'right']) {
      const glove = this.gloves[side];
      if (snapshot?.side === side) glove.follow(snapshot[side], dt, { aspect, palmSize: this.palmSize, width: this.width, height: this.height });
      else glove.hide();
    }
    const glove = this.gloves[this.side];
    if (!glove.visible) {
      this.steady.seen = false;
      return null;
    }
    const { steady } = this;
    if (!steady.seen) {
      steady.x = glove.x;
      steady.y = glove.y;
      steady.seen = true;
    }
    // Slow movement is mostly wobble, so it's steadied hard. Quick movement is meant, so it isn't.
    const speed = Math.hypot(glove.x - steady.x, glove.y - steady.y) / this.height / Math.max(dt, 0.001);
    const rate = mix(7, 30, clamp(speed / 1.1, 0, 1));
    const share = 1 - Math.exp(-rate * dt);
    steady.x += (glove.x - steady.x) * share;
    steady.y += (glove.y - steady.y) * share;
    const { x, z } = this.groundAt(steady.x, steady.y);
    return clampToPlay(x, z);
  }

  /* ---------- what the rules say has happened ---------- */

  onEvent(event) {
    const handlers = {
      spawn: () => this.addRobot(event.enemy),
      shot: () => this.onShot(event.shot, event.side),
      hit: () => this.onHit(event.enemy),
      stopped: () => this.onStopped(event.enemy, event.left),
      crew: () => this.onCrew(event.enemy),
      gone: () => this.onGone(event.enemy),
      lob: () => this.onLob(event.enemy),
      land: () => this.onLand(event.shell, event.hit),
      fizzle: () => this.onFizzle(event.shell),
      hurt: () => this.onHurt(),
      dash: () => {
        this.dust(event.enemy);
        this.labelOver('dash', event.enemy);
      },
      'run-off': () => {
        this.dust(event.enemy);
        this.labelOver('retreat', event.enemy);
      },
      bounce: () => this.onBounce(event),
      bonk: () => this.onBonk(event.enemy),
      'shield-down': () => this.puffs(this.topOf(event.enemy, this.point), { count: 4, colours: ['#d8d3cc', '#86e6dc'], size: 1.2, speed: 1.8, life: 0.8 }),
      bubbled: () => this.bits(this.topOf(event.enemy, this.point), { count: 5, shapes: ['bubble'], colours: ['#d6efff', '#ffffff'], size: 1, speed: 3, life: 0.9, gravity: -2 }),
      dig: () => this.dirt(event.enemy),
      'pop-up': () => this.dirt(event.enemy),
      split: () => this.onSplit(event.enemy),
      'part-off': () => this.onPartOff(event.enemy, event.part),
      'cage-hit': () => this.onCageHit(event.cage),
      freed: () => this.onFreed(event.cage),
      prizes: () => this.onPrizes(event.prizes),
      prize: () => this.onPrize(),
      crate: () => this.label(`power-${event.crate.power}`, POWERS[event.crate.power], () => (this.patrol.crates.includes(event.crate) ? this.point.set(event.crate.x, event.crate.y + 6.4, event.crate.z) : this.overTank())),
      power: () => this.label(`power-${event.name}`, POWERS[event.name], () => this.overTank()),
      'crate-got': () => this.onCrateGot(),
      'chest-open': () => this.bits(this.point.set(event.prize.x, event.prize.y + 2, event.prize.z), { count: 8, shapes: ['star', 'spark'], colours: ['#ffd23f', '#ffffff'], size: 1, speed: 5, life: 0.9, gravity: 8 }),
      'friend-hit': () => this.onFriendHit(event.friend),
      'friend-bonk': () => this.bits(this.point.set(event.friend.x, event.friend.y + 4, event.friend.z), { count: 2, shapes: ['star', 'spark'], colours: ['#ffffff', '#bfe8ff'], size: 0.8, speed: 4, life: 0.45 }),
      'hit-by': () => this.onHitBy(),
    };
    handlers[event.type]?.();
  }

  /** The child's shot has hit their friend's tank: it wobbles, a few stars, and +1 goes up beside it. */
  onFriendHit(friend) {
    this.friendTank?.hit();
    this.bits(this.point.set(friend.x, friend.y + 4, friend.z), { count: 5, shapes: ['star', 'spark', 'star'], colours: ['#ffd23f', '#ffffff', PAINTS.friend.light], size: 1.1 });
    this.points.push({ age: 0 });
  }

  /** The friend's shot has hit the child's tank, as their game says: the shot lands, and it tickles. */
  onHitBy() {
    // The ball still on its way lands now, so the hit and the ball go together.
    const coming = this.friendShots.find(({ share }) => share >= 0);
    if (coming) coming.share = 1;
    this.child.hit();
    const { tank } = this.patrol;
    this.bits(this.point.set(tank.x, tank.y + 4, tank.z), { count: 5, shapes: ['star'], colours: ['#ffd23f', '#ffffff'], size: 0.75, speed: 4, life: 0.75, gravity: 7 });
  }

  onBounce({ from }) {
    this.puffs(this.point.set(from.x, from.y + 3, from.z), { count: 2, colours: ['#ffd9c8'], size: 0.8, speed: 1.4, life: 0.5 });
  }

  /** A shot bouncing off a shield: a bonk and a few stars, and no harm done. */
  onBonk(enemy) {
    const view = this.robots.get(enemy);
    view?.hit();
    this.bits(this.topOf(enemy, this.point), { count: 4, shapes: ['star', 'spark'], colours: ['#ffffff', '#86e6dc'], size: 0.9, speed: 4.5, life: 0.5 });
  }

  /** Earth thrown up by a digger going down or coming up. */
  dirt(enemy) {
    const at = this.point.set(enemy.x, enemy.y + 0.8, enemy.z);
    this.puffs(at, { count: 6, colours: ['#b58a5c', '#9a6a3c', '#d9c9a0'], size: 1.5, speed: 2.8, life: 0.9, grow: 1.6, opacity: 0.6, up: 0.6 });
    this.bits(at, { count: 4, shapes: ['rock'], colours: ['#7d5430', '#9a6a3c'], size: 0.5, speed: 5, life: 0.55 });
  }

  /** A splitting tank comes apart, in soft smoke, and its two halves roll out of it. */
  onSplit(enemy) {
    const view = this.robots.get(enemy);
    const at = this.topOf(enemy, this.point);
    this.puffs(at, { count: 7, colours: ['#d8d3cc', '#b9b3a9', '#9fd3ff'], size: 1.8, speed: 2.4, life: 1.1, grow: 1.7 });
    this.bits(at, { count: 8, shapes: ['bolt', 'star'], colours: ['#dfe6ee', '#ffd23f'], size: 1.2, speed: 6.5, life: 0.9 });
    if (view) {
      view.dispose();
      this.robots.delete(enemy);
    }
  }

  /** A part comes off the boss, with a puff and some bolts. */
  onPartOff(enemy, part) {
    this.robots.get(enemy)?.dropPart(part);
    const at = this.topOf(enemy, this.point);
    this.puffs(at, { count: 5, colours: ['#a59e95', '#b9b3a9'], size: 1.6, speed: 2.2, life: 1.1 });
    this.bits(at, { count: 8, shapes: ['bolt', 'star'], colours: ['#dfe6ee', '#ffd23f'], size: 1.3, speed: 7, life: 0.9 });
  }

  onCageHit(cage) {
    this.cageViews.get(cage)?.hit();
    this.bits(this.point.set(cage.x, cage.y + 4, cage.z), { count: 4, shapes: ['star', 'spark'], colours: ['#ffd23f', '#ffffff'], size: 0.9, speed: 4.5, life: 0.5 });
  }

  onFreed(cage) {
    this.cageViews.get(cage)?.open();
    this.bits(this.point.set(cage.x, cage.y + 5, cage.z), { count: 10, shapes: ['star', 'spark', 'star'], colours: ['#ffd23f', '#ff7a9a', '#ffffff'], size: 1.1, speed: 5, life: 1.1, gravity: 6 });
    this.child.cheer(1.6);
  }

  onPrizes(prizes) {
    for (const prize of prizes) {
      const item = prize.type === 'chest' ? NEWS_BY_KEY.treasure : PRIZES[prize.type];
      this.label(`prize-${prize.type}`, item, () => (this.patrol.prizes.includes(prize) ? this.point.set(prize.x, prize.y + 4.2, prize.z) : this.overTank()));
    }
  }

  /** A prize reaching the tank: a twinkle, and not too many at once. */
  onPrize() {
    if (this.sparkleIn > 0) return;
    this.sparkleIn = 0.12;
    const { tank } = this.patrol;
    this.bits(this.point.set(tank.x, tank.y + 4, tank.z), { count: 2, shapes: ['star'], colours: ['#ffd23f'], size: 0.6, speed: 3, life: 0.5, gravity: 6 });
  }

  onCrateGot() {
    const { tank } = this.patrol;
    this.bits(this.point.set(tank.x, tank.y + 5, tank.z), { count: 7, shapes: ['star', 'spark'], colours: ['#ffd23f', '#ffffff', '#9fd3ff'], size: 0.9, speed: 4.5, life: 0.8, gravity: 6 });
    this.child.cheer(1.2);
  }

  puffs(at, { count = 4, colours = ['#d8d3cc'], size = 1, speed = 2.4, life = 0.9, grow = 1.6, opacity = 0.72, up = 0.8 }) {
    const total = Math.max(1, Math.round(count * this.effects * (this.reducedMotion ? 0.5 : 1)));
    for (let i = 0; i < total; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const push = speed * between(0.4, 1.1);
      this.sparks.emit({
        shape: 'puff',
        colour: colours[i % colours.length],
        at,
        velocity: [Math.cos(angle) * push, between(0.2, up) * push, Math.sin(angle) * push],
        life: life * between(0.8, 1.2),
        size: size * between(0.8, 1.2),
        grow,
        spin: between(-1.4, 1.4),
        opacity,
        drag: 1.6,
      });
    }
  }

  bits(at, { count = 4, shapes = ['star'], colours = ['#ffd23f'], size = 0.8, speed = 6, life = 0.6, gravity = 12 }) {
    const total = Math.max(1, Math.round(count * this.effects * (this.reducedMotion ? 0.5 : 1)));
    for (let i = 0; i < total; i += 1) {
      const angle = (i / total) * Math.PI * 2 + Math.random();
      const push = speed * between(0.6, 1.1);
      this.sparks.emit({
        shape: shapes[i % shapes.length],
        colour: colours[i % colours.length],
        at,
        velocity: [Math.cos(angle) * push, between(4, 8), Math.sin(angle) * push],
        life: life * between(0.8, 1.2),
        size: size * between(0.8, 1.2),
        spin: between(-6, 6),
        gravity,
        drag: 0.4,
      });
    }
  }

  onShot(shot, side = false) {
    const { child } = this;
    const muzzle = child.muzzle(this.point);
    shot.from = muzzle.clone();
    // The two side balls of a triple shot go with the middle one: no more kick or smoke.
    if (side) return;
    child.fired();
    this.puffs(muzzle, { count: 3, colours: ['#efe9dd', '#d8d3cc'], size: 0.8, speed: 1.6, life: 0.5, grow: 2.2, opacity: 0.68 });
  }

  topOf(enemy, out) {
    return out.set(enemy.x, enemy.y + BAR_ABOVE[enemy.kind] - 2.6, enemy.z);
  }

  onHit(enemy) {
    const view = this.robots.get(enemy);
    if (!view) return;
    view.hit();
    this.bits(this.topOf(enemy, this.point), { count: 5, shapes: ['star', 'spark', 'bolt'], colours: ['#ffd23f', '#ffffff', '#dfe6ee'], size: 1.15 });
  }

  onStopped(enemy, left) {
    if (left === 0) this.onAllStopped();
    if (enemy.kind === 'boss') this.robots.get(enemy)?.dropPart(3);
    const at = this.topOf(enemy, this.point);
    this.bits(at, { count: 14, shapes: ['bolt', 'star', 'bolt', 'spark'], colours: ['#dfe6ee', '#ffd23f', '#c6d0db', '#ffffff'], size: 1.5, speed: 8.5, life: 1.05 });
    this.puffs(at, { count: 7, colours: ['#a59e95', '#8a837b', '#b9b3a9'], size: 2, speed: 2.6, life: 1.3, grow: 1.8 });
    this.child.cheer(1.4);
    // On a patrol together, whoever's shot it was, both Giraffes cheer.
    if (this.friendTank?.visible) this.friendTank.cheer(1.4);
  }

  onCrew(enemy) {
    const at = this.topOf(enemy, this.point);
    this.bits(at, { count: 6, shapes: ['star'], colours: ['#ffd23f', '#ffffff'], size: 0.8, speed: 4, life: 0.9, gravity: 8 });
  }

  onGone(enemy) {
    const view = this.robots.get(enemy);
    if (!view) return;
    this.puffs(view.crew.position, { count: 5, colours: ['#ffffff', '#e8e4da'], size: 1, speed: 1.6, life: 0.7, grow: 1.2, opacity: 0.8 });
    this.bits(view.crew.position, { count: 4, shapes: ['star'], colours: ['#ffd23f'], size: 0.6, speed: 3, life: 0.7, gravity: 6 });
    view.dispose();
    this.robots.delete(enemy);
  }

  onLob(enemy) {
    const view = this.robots.get(enemy);
    if (!view) return;
    view.lobbed();
    this.puffs(this.point.set(enemy.x, enemy.y + 3.4, enemy.z), { count: 3, colours: ['#d8d3cc'], size: 0.8, speed: 1.2, life: 0.6, grow: 1.6 });
  }

  onLand({ to }, hit) {
    const at = this.point.set(to.x, to.y + 0.5, to.z);
    this.puffs(at, { count: 8, colours: ['#d9c9a0', '#c4b188', '#b9b3a9'], size: 1.6, speed: 3.4, life: 0.9, grow: 1.7, opacity: 0.66, up: 0.7 });
    this.bits(at, { count: hit ? 5 : 4, shapes: ['rock', 'rock', 'star'], colours: ['#9b8660', '#b39e74', '#ffd23f'], size: 0.5, speed: 6, life: 0.55 });
  }

  /** A little dust behind a robot tank setting off in a hurry, on the higher levels. */
  dust(enemy) {
    const at = this.point.set(enemy.x, enemy.y + 0.8, enemy.z);
    this.puffs(at, { count: 3, colours: ['#d9c9a0', '#c4b188'], size: 1.2, speed: 1.8, life: 0.7, grow: 1.5, opacity: 0.55, up: 0.5 });
  }

  /** A rest has begun, and whatever was coming goes up in a harmless puff. */
  onFizzle(shell) {
    const at = shellPoint(shell);
    this.puffs(at, { count: 4, colours: ['#ffffff', '#efe9dd'], size: 1.1, speed: 1.4, life: 0.7, grow: 1.4, opacity: 0.7 });
  }

  onHurt() {
    this.child.hit();
    const { tank } = this.patrol;
    this.bits(this.point.set(tank.x, tank.y + 5, tank.z), { count: 5, shapes: ['star'], colours: ['#ffd23f', '#ffffff'], size: 0.75, speed: 4, life: 0.75, gravity: 7 });
  }

  /** The valley's safe again: Giraffe cheers, and the fort's flags change hands. */
  onAllStopped() {
    this.celebrating = true;
    this.valley.setFlags(true);
  }

  /* ---------- every frame ---------- */

  /** A slow computer gives up sharpness first, and then some of the trees and small effects. */
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
      this.marks.setSharpness(1);
      this.resize();
    } else {
      this.valley.showFewer();
      this.effects = 0.6;
    }
  }

  stampTrack(tank, length, wide) {
    if (bridgeRise(tank.x, tank.z) > 0) return;
    const last = this.lastTrack.get(tank);
    if (last && Math.hypot(tank.x - last.x, tank.z - last.z) < TRACK_EVERY) return;
    this.lastTrack.set(tank, { x: tank.x, z: tank.z });
    const { tracks, trackMatrix, trackTurn, trackAt, trackSize, trackUp } = this;
    const sideX = Math.cos(tank.heading) * wide;
    const sideZ = Math.sin(tank.heading) * wide;
    trackTurn.setFromAxisAngle(trackUp, -tank.heading);
    trackSize.set(1, 1, length);
    for (const way of [-1, 1]) {
      const x = tank.x + sideX * way;
      const z = tank.z + sideZ * way;
      trackAt.set(x, heightAt(x, z) + 0.09, z);
      tracks.setMatrixAt(this.nextTrack, trackMatrix.compose(trackAt, trackTurn, trackSize));
      this.nextTrack = (this.nextTrack + 1) % TRACK_MARKS;
      tracks.count = Math.max(tracks.count, this.nextTrack);
    }
    tracks.instanceMatrix.needsUpdate = true;
  }

  /** Dust from the treads, and marks left on the ground. */
  whileMoving(tank, dt, wide, length) {
    if (tank.speed < 0.8) return;
    this.stampTrack(tank, 0.6, wide);
    tank.dustIn = (tank.dustIn ?? 0) - dt;
    if (tank.dustIn > 0) return;
    tank.dustIn = 0.16 / this.effects;
    const behind = length * 0.5;
    const sideways = between(-wide, wide);
    this.sparks.emit({
      shape: 'puff',
      colour: bridgeRise(tank.x, tank.z) > 0 ? '#d8d3cc' : '#dccb9f',
      at: { x: tank.x - Math.sin(tank.heading) * behind + Math.cos(tank.heading) * sideways, y: tank.y + 0.5, z: tank.z + Math.cos(tank.heading) * behind + Math.sin(tank.heading) * sideways },
      velocity: [between(-0.5, 0.5), 0.7, between(-0.5, 0.5)],
      life: 0.75,
      size: 1,
      grow: 1.5,
      opacity: 0.55,
      drag: 0.8,
    });
  }

  /** Little puffs from the pipe at the back of the child's tank, more of them the faster it goes. */
  exhaust(dt) {
    const { tank, pace } = this.patrol;
    tank.smokeIn = (tank.smokeIn ?? 0) - dt;
    if (tank.smokeIn > 0) return;
    tank.smokeIn = (0.55 - (tank.speed / pace.drive) * 0.36) / this.effects;
    const sin = Math.sin(tank.heading);
    const cos = Math.cos(tank.heading);
    this.sparks.emit({
      shape: 'puff',
      colour: '#d4cfc6',
      at: { x: tank.x + cos * 1.7 - sin * 3, y: tank.y + 3.5, z: tank.z + sin * 1.7 + cos * 3 },
      velocity: [between(-0.2, 0.2), 1.5, between(-0.2, 0.2)],
      life: 0.8,
      size: 0.45,
      grow: 0.9,
      opacity: 0.55,
      drag: 0.4,
    });
  }

  updateRobots(dt) {
    const { patrol } = this;
    for (const [enemy, view] of this.robots) {
      view.update(dt, { resting: patrol.paused, childAt: patrol.tankFor(enemy) });
      if (enemy.dig?.phase === 'under') {
        // A trail of earth behind a digger going along underground.
        enemy.dirtIn = (enemy.dirtIn ?? 0) - dt;
        if (enemy.dirtIn <= 0) {
          enemy.dirtIn = 0.2 / this.effects;
          this.sparks.emit({ shape: 'puff', colour: '#b58a5c', at: { x: enemy.x + between(-1, 1), y: enemy.y + 0.8, z: enemy.z + between(-1, 1) }, velocity: [between(-0.4, 0.4), 1, between(-0.4, 0.4)], life: 0.8, size: 1.1, grow: 1.4, opacity: 0.55, drag: 0.8 });
        }
      } else if (enemy.state === 'rolling') {
        this.whileMoving(enemy, dt, view.wide * 0.32, view.length);
        // Getting tired: a thin wisp of smoke once it's nearly had enough.
        if (enemy.hp / enemy.maxHp <= 0.5) {
          enemy.wispIn = (enemy.wispIn ?? 0) - dt;
          if (enemy.wispIn <= 0) {
            enemy.wispIn = 0.34 / this.effects;
            this.sparks.emit({ shape: 'puff', colour: '#b9b3a9', at: { x: enemy.x, y: enemy.y + 3.4, z: enemy.z }, velocity: [between(-0.3, 0.5), 1.6, between(-0.3, 0.3)], life: 1, size: 0.7, grow: 1.1, opacity: 0.5, drag: 0.5 });
          }
        }
      } else if (enemy.state !== 'fading') {
        // Soft grey smoke, going up slowly.
        enemy.smokeIn = (enemy.smokeIn ?? 0) - dt;
        enemy.smokeLeft = (enemy.smokeLeft ?? CREW_SMOKE_SECONDS) - dt;
        if (enemy.smokeIn <= 0 && enemy.smokeLeft > 0) {
          enemy.smokeIn = 0.18 / this.effects;
          this.sparks.emit({ shape: 'puff', colour: ['#8f8981', '#a59e95', '#b9b3a9'][Math.floor(Math.random() * 3)], at: { x: enemy.x + between(-0.8, 0.8), y: enemy.y + 3, z: enemy.z + between(-0.8, 0.8) }, velocity: [between(-0.3, 0.6), 2.2, between(-0.3, 0.3)], life: 1.5, size: 1.2, grow: 1.6, opacity: 0.6, drag: 0.5 });
        }
      }
    }
  }

  placeShots() {
    const { patrol } = this;
    const shots = patrol?.shots ?? [];
    this.shotBalls.forEach((shotBall, index) => {
      const shot = shots[index];
      shotBall.visible = Boolean(shot?.from);
      if (!shotBall.visible) return;
      const { target, share, from } = shot;
      const look = this.shotLooks[shot.kind] ?? this.shotLooks.ball;
      shotBall.children[0].material = look.fill;
      shotBall.scale.setScalar(look.size);
      const toY = target.y + (target.kind === 'cage' ? 4 : 2.8) + (target.bubbled > 0 ? 2.4 : 0);
      shotBall.position.set(mix(from.x, target.x, share), mix(from.y, toY, share) + Math.sin(share * Math.PI) * look.arc, mix(from.z, target.z, share));
      if (shot.kind === 'boing' && !this.reducedMotion) shotBall.rotation.x += 0.2;
    });
  }

  /** The friend's tank where their game says it is, with their Giraffe copying their hand, and their shots coming over. */
  updateFriend(dt, friend) {
    const { patrol } = this;
    this.friendTank.update(dt, {
      tank: friend,
      hand: friend.open ? 'open' : 'closed',
      lookAt: patrol.tank,
      speedShare: friend.speed / patrol.pace.drive,
      celebrating: this.celebrating,
      safe: patrol.friendSafe,
    });
    this.whileMoving(friend, dt, 2.1, 7.8);
    // Each shot goes to what it was fired at, wherever that's got to: the child's tank, or a robot tank.
    this.friendShots = this.friendShots.filter((shot) => {
      shot.share += dt / shot.seconds;
      if (shot.share < 1) return true;
      // Landing: a little puff. Whether it was a hit, the friend's game says.
      const { to } = shot;
      this.puffs(this.point.set(to.x, to.y + 2.8, to.z), { count: 2, colours: ['#ffe3d9', '#ffffff'], size: 0.7, speed: 1.4, life: 0.45 });
      return false;
    });
    this.friendBalls.forEach((ball, index) => {
      const shot = this.friendShots[index];
      ball.visible = Boolean(shot && shot.share >= 0);
      if (!ball.visible) return;
      const { from, to, share } = shot;
      ball.position.set(mix(from.x, to.x, share), mix(from.y, to.y + 2.8, share) + Math.sin(share * Math.PI) * 1.6, mix(from.z, to.z, share));
    });
    for (const point of this.points) point.age += dt;
    this.points = this.points.filter(({ age }) => age < POINT_SECONDS);
  }

  placeShells(dt) {
    const shells = this.patrol?.shells ?? [];
    this.shellBalls.forEach(({ group, shadow }, index) => {
      const shell = shells[index];
      group.visible = Boolean(shell);
      shadow.visible = Boolean(shell);
      if (!shell) return;
      const at = shellPoint(shell);
      group.position.set(at.x, at.y, at.z);
      group.rotation.x += dt * 2.2;
      group.rotation.z += dt * 1.4;
      const x = mix(shell.from.x, shell.to.x, shell.share);
      const z = mix(shell.from.z, shell.to.z, shell.share);
      const size = 1.4 + (1 - (at.y - shell.to.y) / 20) * 1.8;
      shadow.scale.set(size, 1, size);
      shadow.position.set(x, groundY(x, z) + 0.14, z);
      shell.trailIn = (shell.trailIn ?? 0) - dt;
      if (shell.trailIn <= 0) {
        shell.trailIn = 0.11 / this.effects;
        this.sparks.emit({ shape: 'puff', colour: '#f2eee4', at, velocity: [0, 0.4, 0], life: 0.55, size: 0.6, grow: 0.9, opacity: 0.6 });
      }
    });
  }

  /** Whatever goes with what the rules have said this frame. hand is what readHand said. */
  update(dt, hand = 'none') {
    this.time += dt;
    this.handState = hand;
    this.watchSpeed(dt);
    const { patrol, child } = this;
    this.valley.update(dt, this.reducedMotion);
    if (patrol) {
      const { tank, crosshair } = patrol;
      const { friend } = patrol;
      child.update(dt, {
        tank,
        hand,
        lookAt: crosshair.seen ? crosshair : patrol.rolling[0] ?? friend ?? null,
        speedShare: tank.speed / patrol.pace.drive,
        celebrating: this.celebrating,
        safe: Boolean(patrol.safe),
      });
      this.whileMoving(tank, dt, 2.1, 7.8);
      this.exhaust(dt);
      if (friend && this.friendTank?.visible) this.updateFriend(dt, friend);
      this.updateRobots(dt);
      this.placeShots();
      this.placeShells(dt);
      this.loot.update(dt, patrol);
      for (const view of this.cageViews.values()) view.update(dt, tank);
      if (patrol.state === 'playing') {
        for (const cage of patrol.cages) if (cage.state === 'closed') this.label('cage', NEWS_BY_KEY.cage, () => (cage.state === 'closed' ? this.point.set(cage.x, cage.y + BAR_ABOVE.cage + 1.6, cage.z) : null));
      }
    }
    this.sparkleIn = Math.max(0, this.sparkleIn - dt);
    // One name at a time, so they never pile up on each other. One whose thing has gone before its name
    // came up is skipped, and left for the next one of its kind. They only count down in play, once "GO!"
    // has gone, and not behind the countdown.
    this.labels = this.labels.filter((label) => {
      if (label.age >= LABEL_SECONDS) return false;
      if (label.age > 0 || label.at()) return true;
      this.labelled.delete(label.key);
      return false;
    });
    if (this.playing && this.labels[0]) this.labels[0].age += dt;
    this.sparks.update(dt);
    this.drawMarks(dt);
  }

  /** Where something in the world is on the screen, in pixels. */
  project(x, y, z) {
    this.point.set(x, y, z).project(this.camera);
    return { x: ((this.point.x + 1) / 2) * this.width, y: ((1 - this.point.y) / 2) * this.height };
  }

  /** How wide a size in the world looks at a place, in pixels. */
  sizeAt(x, y, z, size) {
    const a = this.project(x - size, y, z);
    const b = this.project(x + size, y, z);
    return Math.hypot(b.x - a.x, b.y - a.y) / 2;
  }

  drawMarks(dt) {
    const { patrol, marks } = this;
    if (!patrol || !this.showMarks) {
      marks.draw(null, dt);
      return;
    }
    const { tank, crosshair, resting } = patrol;
    // The robot tanks wait while the child rests, and with a friend on the same side, only while both do.
    const waiting = patrol.paused;
    const look = patrol.look;
    const bars = [];
    const sleeping = [];
    for (const enemy of [...patrol.rolling, ...patrol.cages.filter(({ state }) => state === 'closed')]) {
      if (patrol.hidden(enemy)) continue;
      const top = BAR_ABOVE[enemy.kind] + (enemy.bubbled > 0 ? 2.4 : 0);
      const at = this.project(enemy.x, enemy.y + top, enemy.z);
      const size = this.sizeAt(enemy.x, enemy.y + top, enemy.z, enemy.size);
      bars.push({ x: at.x, y: at.y - 8, width: Math.max(38, size * 1.5), share: enemy.hp / enemy.maxHp, blocks: enemy.maxHp });
      if (waiting && enemy.kind !== 'cage') sleeping.push({ x: at.x, y: at.y - 10 });
    }
    // The name of something new, over it, fading in and out slowly.
    const labels = [];
    for (const label of this.playing ? this.labels.slice(0, 1) : []) {
      const where = label.at();
      if (!where) continue;
      const at = this.project(where.x, where.y, where.z);
      const alpha = clamp(Math.min(label.age / 0.5, (LABEL_SECONDS - label.age) / 0.7), 0, 1);
      // In the language the voice speaks, which a grown-up can change in the middle of a round.
      labels.push({ x: at.x, y: at.y, words: this.wordsFor(label.item), alpha });
    }
    // With a friend, their name is over their tank all the time, and in a battle +1 goes up beside it for each hit.
    const { friend } = patrol;
    if (friend && this.friendTank?.visible) {
      const top = this.project(friend.x, friend.y + NAME_ABOVE, friend.z);
      labels.push({ x: top.x, y: top.y, words: this.friendName, alpha: 1 });
      for (const { age } of this.points) {
        const rise = this.reducedMotion ? 0 : (age / POINT_SECONDS) * 3.5;
        const side = this.project(friend.x + 6, friend.y + 4 + rise, friend.z);
        labels.push({ x: side.x, y: side.y, words: '+1', alpha: clamp(Math.min(age / 0.3, (POINT_SECONDS - age) / 0.5), 0, 1) });
      }
      // A tank whose child is resting is asleep, though in a battle it can still be hit.
      if (friend.resting) sleeping.push(this.project(friend.x + 2, friend.y + 7.6, friend.z));
    }
    if (friend && resting) sleeping.push(this.project(tank.x + 2, tank.y + 7.6, tank.z));
    // How far the gun reaches, as a ring on the ground, following its bumps.
    const points = [];
    for (let i = 0; i < RING_POINTS; i += 1) {
      const angle = (i / RING_POINTS) * Math.PI * 2;
      const x = tank.x + Math.cos(angle) * GUN.range;
      const z = tank.z + Math.sin(angle) * GUN.range;
      points.push(this.project(x, Math.max(heightAt(x, z), 0), z));
    }
    const route = look === 'go' || patrol.driving ? patrol.route.map(({ x, z }) => this.project(x, groundY(x, z) + 0.2, z)) : [];
    const shells = patrol.shells.map(({ to, blast, share }) => {
      const at = this.project(to.x, to.y + 0.1, to.z);
      const across = this.project(to.x + blast, to.y + 0.1, to.z);
      const along = this.project(to.x, to.y + 0.1, to.z + blast);
      return { x: at.x, y: at.y, rx: Math.abs(across.x - at.x), ry: Math.abs(along.y - at.y), share };
    });
    let line = null;
    let spot = null;
    if (crosshair.seen) {
      const target = patrol.locked;
      const onIt = target ? this.project(target.x, target.y + 2.2, target.z) : null;
      const onGround = this.project(crosshair.x, heightAt(crosshair.x, crosshair.z) + 0.2, crosshair.z);
      spot = look === 'firing' && onIt ? onIt : onGround;
      if (look === 'far' || look === 'ready' || look === 'firing') {
        const dx = crosshair.x - tank.x;
        const dz = crosshair.z - tank.z;
        const away = Math.hypot(dx, dz);
        const muzzle = this.child.muzzle(this.point);
        line = { from: this.project(muzzle.x, muzzle.y, muzzle.z), to: spot, reachShare: clamp(GUN.range / Math.max(0.01, away), 0, 1) };
      }
    }
    // Two on one screen, in one picture: the friend's crosshair as well, in the colour of their tank, with a line
    // from their tank to it, so they can see where they point and drive.
    const aim = this.friendAim;
    const friendMark = aim && friend && this.friendTank?.visible ? {
      ...this.project(aim.x, heightAt(aim.x, aim.z) + 0.2, aim.z),
      from: this.project(friend.x, friend.y + 2.6, friend.z),
      look: aim.look,
      radius: this.markSize * CROSSHAIR_SHARE * 0.85,
      colour: PAINTS.friend.main,
    } : null;
    const target = patrol.locked;
    marks.draw({
      range: { points, look },
      route,
      shells,
      bars,
      sleeping,
      labels,
      line,
      friendMark,
      crosshair: spot ? {
        x: spot.x,
        y: spot.y,
        look,
        radius: this.markSize * CROSSHAIR_SHARE,
        target: target ? this.sizeAt(target.x, target.y, target.z, target.size) : 0,
        auto: patrol.autoDrive,
        tankX: this.project(tank.x, tank.y, tank.z).x,
        glove: this.gloves[this.side],
        palmSize: this.palmSize,
      } : null,
    }, dt);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
