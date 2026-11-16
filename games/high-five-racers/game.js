// The race: the player's car and the others on the road, the big hands to slap, stars to catch and
// ramps to jump, and the camera following it all. The world itself is in world.js.
//
// The car follows the road by itself and steering only moves it across the road, so nobody can
// crash or get stuck. There is no failing here on purpose. The one thing that matters is `drive`,
// which comes straight from the hand monitor and is 0 unless the hand in play is open.
//
// Nothing flashes or strobes: seizures are more common in children with hemiplegia, so road markings
// are low contrast and long, there are no full-screen effects, and the tunnel is as bright as outdoors.
// Anything that happens is a burst of small shapes where it happened.
//
// Each level (rules.js, racePlan) brings more cars, more big hands and ramps, and keener racing, and from
// level 2 something new each time: coins, power-ups, a tractor, a sunset, a balloon with a gem, a treasure
// chest, a shower of rain and a giant high ten at the finish. Those are in extras.js and weather.js.
import * as THREE from '../../vendor/three/three.module.js';
import { makeDriver, RaceCar, RIVAL_STYLES } from './cars.js';
import { Particles, SpeedLines } from './effects.js';
import { CarPowers, Chests, CoinField, GemBalloons, HighTen, PowerUpField, Tractor } from './extras.js';
import { HAND_COLOURS, HighFiveGates, PALM_HEIGHT } from './gates.js';
import { canvasTexture, clamp, damp, mod, softCircleTexture } from './kit.js';
import { CarTrack } from './friends.js';
import { Ramps, StarField } from './pickups.js';
import {
  CAR_LENGTH, CAR_WIDTH, CHEST_REACH, COINS, convoyPace, FASTEST_SPEED, FistAndOpen, gateOutcome, HIGH_TEN_BEFORE_LINE, LEAST_REACH, newAt, POWER, PowerUps,
  ownPace, racePlan, REACH, ReachEasing, RIVAL_TURBO, rivalSpeed, SLAP, TOP_SPEED, touching, TRACTOR, tractorRun, TurboMeter, wantedSpeed,
} from './rules.js';
import { LANE_LIMIT, START_BEHIND_LINE, Track } from './track.js';
import { Weather } from './weather.js';
import { World } from './world.js';

const ACCELERATION = 10;
const COAST_DOWN = 13;
const OVER_TOP_DOWN = 7; // Slowing from a boost is gentler than slowing to a stop.

const RIVAL_CRUISE = 0.82 * TOP_SPEED;
// For each of the other cars, in order: the first three race at every level, and the others from level 4 and 8.
const RIVAL_LANES = [-3.2, 3.2, 0, -1.6, 1.6];
const RIVAL_WISHES = [9, 17, 25, 33, 41]; // The middle of how far ahead each likes to be.
const RIVAL_WISH_SWING = 12;
const RIVAL_COMES_BACK_FROM = [24, 32, 40, 48, 56]; // How far behind each gets before it comes past again.
const RIVAL_TURBO_NEAR = [-45, 12];
const GRID_ROWS = [1, 2, 3, 2, 1];
const SOARING_MAKES_ROOM = 30; // Metres either side of a flying car that the others make room in. // Which row of the grid each starts in, 11 m apart. // A rival only uses turbo with the child in sight, from behind to a little ahead.
const LAST_STRETCH = 170; // On Gentle, in the last of the race they ease off, so that the child wins clearly.
const TURBO_PULLS_AWAY_SECONDS = 4; // After this they keep up with turbo, or nobody would ever see them again.
const RIVAL_SLAP_REACH = 1.5;
const RESTING_SPEED = 6;
const CROWD_CHEER_SPACING_SECONDS = 25;
const JUMP_GRAVITY = 21;
// The flight from the other hand's turbo: a long, floaty hop rather than a ramp's quick one, about 6 m up
// and 3 seconds in the air, or a low hop with reduced motion. It stays under everything over the road: the
// lowest is the signs on the footbridges, at about 8.4 m, and the car's roof stays below 7.5 m. The view
// hardly moves, and the car rises up the picture instead: the whole picture sliding up and back down
// again would make lots of it change brightness at once, which is how a flash is counted.
const FLIGHT = { liftSpeed: 8.5, gravity: 6, lowLiftSpeed: 5, overGatesAbove: 2.5, cameraFollows: 0.08, lookFollows: 0.12 };
const jumpSpeed = (speed) => 3 + speed * 0.22;
const FINISH_STOP = 3; // On Gentle, rivals pull up this far before the line, so the child gets there first.
const PASSED_BY = 1.5; // How far clear a car has to be to have passed, so two side by side don't keep swapping.
const SAY_PASSED_AGAIN_AFTER_SECONDS = 8;
// The first time each new thing of a level comes into sight, a little label goes over it for this long. It only
// counts as shown once it has been up on the screen for a while. One that couldn't be seen for this long goes,
// and can come again a few seconds later. All in seconds.
const CALLOUT_SECONDS = 2.8;
const CALLOUT_FADE = 0.35; // The last of it, as the label fades.
const CALLOUT_COUNTS_AFTER = 1;
const CALLOUT_WAIT = 4;
const CALLOUT_AGAIN_AFTER = 3;
const IN_SIGHT = [12, 95]; // Metres ahead of the car that something counts as coming into sight.
// The giant high ten starts fading in this far ahead of the car, in metres, so it's never suddenly big.
const HIGH_TEN_SHOWS_FROM = 260;
const BUBBLE_ROOM = 1.3; // How much further out than the car itself the bubble pushes others away.
// Friends racing from their own computers: each car's colours, by its place on the grid, and how far apart
// they line up across the road. The child's own car is the red one, as always.
const FRIEND_PAINTS = [['#3b82f6', '#ffd23f'], ['#a855f7', '#7ee8ff'], ['#14b8a6', '#ffe0b8'], ['#f59e0b', '#1f2937']];
const GRID_SPREAD = 3.9;
// A friend's car close to the child's is shown this far over, so that it's beside it rather than in front of the
// camera or overlapping, in metres. It's only on this screen: where they really are is up to their own game.
const FRIEND_ROOM = { along: 12, across: 2.8 };
export const gridLane = (slot, size) => (size > 1 ? -GRID_SPREAD + (2 * GRID_SPREAD * slot) / (size - 1) : 0);
const COIN_BURST = { count: 10, shapes: ['coin', 'star'], colours: ['#ffc93c', '#fff1b0'], speed: 3.5, up: 3.5, life: 0.55, size: 0.5 };

const STEERING = {
  // The car's place on the road follows the hand. That's easier than turning a wheel for a child who
  // has to hold an arm out, and it makes reaching further the way to get further across.
  help: { rate: 12, follow: 3.4, span: 5.6, drift: 0 },
  none: { rate: 11, follow: 0, span: 0, drift: 0.2 },
};

const QUALITY_CHECK_SECONDS = 4;
const QUALITY_GOOD_FPS = 36;
const QUALITY_LEVELS = 4;

const IDLE_FINGERS = { thumb: 1, index: 1, middle: 1, ring: 1, pinky: 1 };

function skyReflection(renderer) {
  const picture = canvasTexture(256, 128, (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#5aa8ea');
    sky.addColorStop(0.46, '#e6f5ff');
    sky.addColorStop(0.52, '#f8fcff');
    sky.addColorStop(0.54, '#7fbf6a');
    sky.addColorStop(1, '#5f9e58');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (const [x, y, r] of [[50, 30, 16], [70, 34, 12], [170, 22, 18], [195, 28, 12], [120, 42, 10]]) {
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.6, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { anisotropy: 1 });
  picture.mapping = THREE.EquirectangularReflectionMapping;
  const generator = new THREE.PMREMGenerator(renderer);
  const { texture } = generator.fromEquirectangular(picture);
  generator.dispose();
  picture.dispose();
  return texture;
}

export class Race {
  /**
   * events: onStar(total), onPlace(place, previous), onOvertake(spec, byPlayer), onLap(lap), onFinish(),
   * onFive(total, side, streak), onGate(gate, outcome), onBump(), onTurbo(on), onJump(), onFly(), onLanded(), onCrowd().
   * Modes: attract (title screen), grid (waiting on the line), race, finished.
   * driver is who's driving the child's car, rivals who could be in the others, in order, and reach how
   * far to reach for a big hand. level is from 1 to 10: see setLevel.
   */
  constructor(canvas, events = {}, { driver, rivals, reach = 'medium', level = 1 }) {
    this.events = events;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.track = new Track();
    this.world = new World(this.scene, this.track, { reducedMotion: this.reducedMotion });

    this.hemisphere = new THREE.HemisphereLight('#e8f6ff', '#bcd2a4', 1.75);
    this.scene.add(this.hemisphere);
    this.sunlight = new THREE.DirectionalLight('#fff4dc', 2.3);
    this.sunlight.castShadow = true;
    this.sunlight.shadow.mapSize.set(1024, 1024);
    const reach3d = 46;
    Object.assign(this.sunlight.shadow.camera, { left: -reach3d, right: reach3d, top: reach3d, bottom: -reach3d, near: 1, far: 260 });
    this.scene.add(this.sunlight, this.sunlight.target);
    // A soft light from the viewer, so the side of the car and gloves we look at isn't dark.
    this.fillLight = new THREE.DirectionalLight('#ffffff', 1.1);
    this.scene.add(this.fillLight, this.fillLight.target);

    const environment = skyReflection(this.renderer);
    const glowTexture = softCircleTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64);
    this.environment = environment;
    this.glowTexture = glowTexture;
    this.player = new RaceCar({ styleName: 'roadster', paint: '#ff5a4f', trim: '#ffd23f', spec: driver, environment, glowTexture, isPlayer: true });
    this.driver = makeDriver();
    this.driver.setSleeveColour(driver.colours.arm ?? driver.colours.body);
    this.player.group.add(this.driver.group);
    this.scene.add(this.player.group);

    // Everyone who could be in the other cars, and the cars made so far. More are made when a level needs them.
    this.cast = rivals;
    this.garage = [];
    this.rivals = [];
    this.racers = [null]; // In order, with null for the player. See order.
    // Friends racing from their own computers, who take the place of the others: see setFriends.
    this.friends = null;
    this.team = false;
    this.friendCars = new Map();
    this.gridSlot = 0;
    this.gridSize = 1;
    // How the others race: to win, at their own pace, or on Gentle, staying close and letting the child win.
    this.gentle = false;
    // Whether the camera can see the hand in play. With no hand to see, everyone waits.
    this.handSeen = true;
    this.stars = new StarField(this.scene, this.track);
    this.ramps = new Ramps(this.scene, this.track);
    this.reach = new ReachEasing(REACH[reach] ?? REACH.medium);
    this.gates = new HighFiveGates(this.scene, this.track, { reducedMotion: this.reducedMotion });
    this.powers = new PowerUps();
    this.gates.reachFor = (side) => this.reachNow(side);
    this.gates.applyReach();
    this.particles = new Particles(this.scene);
    this.particles.budget = this.reducedMotion ? 0.5 : 1;
    this.speedLines = new SpeedLines(this.scene);
    this.turbo = new TurboMeter();
    this.otherHand = new FistAndOpen();

    // What the later levels bring. Each is made once and laid out again for each level.
    const extrasLook = { environment, reducedMotion: this.reducedMotion };
    this.coins = new CoinField(this.scene, this.track, extrasLook);
    this.powerUps = new PowerUpField(this.scene, this.track, extrasLook);
    this.carPowers = new CarPowers(this.player, extrasLook);
    this.tractor = new Tractor(this.scene);
    this.balloons = new GemBalloons(this.scene, this.track, extrasLook);
    this.chests = new Chests(this.scene, this.track);
    this.highTen = new HighTen(this.scene, this.track, extrasLook);
    this.highTen.setPlace(this.track.length - HIGH_TEN_BEFORE_LINE);
    this.weather = new Weather(this.scene, this.track, this.world, { hemisphere: this.hemisphere, sunlight: this.sunlight, fillLight: this.fillLight }, extrasLook);

    this.setLevel(level);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.5, 3200);
    this.cameraTarget = new THREE.Vector3();
    this.cameraLook = new THREE.Vector3();
    this.currentLook = new THREE.Vector3();
    this.tmpA = new THREE.Vector3();
    this.tmpB = new THREE.Vector3();
    this.tmpC = new THREE.Vector3();

    this.time = 0;
    this.orbit = 0;
    this.quality = { frames: 0, seconds: 0, level: 0 };
    this.mode = 'attract';
    this.drive = 0;
    this.handSide = 'right';
    this.reset(2);

    window.addEventListener('resize', () => this.resize());
    this.resize();
    // Gets the graphics card ready for everything now, so the first flames or big hand don't make it stutter.
    this.renderer.compile(this.scene, this.camera);
  }

  /** 'race' for the others to race to win, the default, or 'gentle' for the race as it was, which can't be lost. */
  setRivalsMode(mode) {
    this.gentle = mode === 'gentle';
  }

  /** The next of the other cars, which then waits in the garage for any level that has it. */
  makeRival(index) {
    const spec = this.cast[index];
    const [paint, trim] = this.paintsFor(spec, index);
    const car = new RaceCar({ styleName: RIVAL_STYLES[index % RIVAL_STYLES.length], paint, trim, spec, environment: this.environment, glowTexture: this.glowTexture });
    this.scene.add(car.group);
    return {
      car,
      spec,
      lane: RIVAL_LANES[index],
      distance: 0,
      lateral: 0,
      shove: 0,
      speed: 0,
      wishPhase: index * 2.2,
      wanderPhase: index * 1.7,
      bumpWait: 0,
      lift: 0,
      liftSpeed: 0,
      flying: false,
      turboLeft: 0,
      turboIn: Infinity,
    };
  }

  /**
   * What this level's race has: how many other cars and how they race, where the big hands, stars and
   * ramps are. See racePlan in rules.js. Called before a race, and before reset().
   */
  setLevel(level) {
    const changed = level !== this.level;
    this.level = level;
    const plan = racePlan(level);
    this.plan = plan;
    while (this.garage.length < plan.rivals) {
      const rival = this.makeRival(this.garage.length);
      this.garage.push(rival);
      // A car made after the start is got ready now, so that it can't stutter when it first comes into view.
      if (this.camera) {
        rival.car.setDetail(this.quality.level < 3);
        this.renderer.compile(rival.car.group, this.camera, this.scene);
      }
    }
    this.rivals = this.friends ?? this.garage.slice(0, plan.rivals);
    this.garage.forEach((rival, index) => {
      rival.car.group.visible = !this.friends && index < plan.rivals;
    });
    this.racers = [null, ...this.rivals];
    this.gates.setLayout(plan.gates);
    this.stars.setLayout(plan.gates, plan.ramps);
    this.ramps.setLayout(plan.ramps);
    this.powerUps.setLayout(plan.powerUps);
    this.balloons.setLayout(plan.balloons);
    this.chests.setLayout(plan.chests);
    // What's new at this level gets a little label the first time it comes into sight.
    this.newHere = newAt(level);
    // Anything made for a new level is got ready now, so that it can't stutter when it first comes into view.
    // The same level again has nothing new, and getting all of it ready takes a moment.
    if (this.camera && changed) this.renderer.compile(this.scene, this.camera);
  }

  /**
   * Friends racing on their own computers, as [{ key, spec, slot }], or null to race the others again. slot is
   * each one's place on the grid, and mySlot the child's. Their cars go wherever their own games say.
   */
  setFriends(friends, mySlot = 0, team = false) {
    // Whether the friends are on the same side, in one convoy: see convoy.
    this.team = Boolean(friends && team);
    this.friends = friends?.map(({ key, spec, slot }) => {
      let friend = this.friendCars.get(key);
      if (!friend) {
        friend = this.makeFriend(spec, slot);
        this.friendCars.set(key, friend);
      } else if (friend.spec.id !== spec.id || friend.spec.name !== spec.name) {
        friend.spec = spec;
        friend.car.setCharacter(spec);
        friend.car.setDetail(this.quality.level < 3);
      }
      friend.slot = slot;
      return friend;
    }) ?? null;
    for (const friend of this.friendCars.values()) friend.car.group.visible = Boolean(this.friends?.includes(friend));
    this.gridSlot = mySlot;
    this.gridSize = (friends?.length ?? 0) + 1;
    this.setLevel(this.level);
  }

  /**
   * Racing together, how much of its own speed the child's car goes at, to stay in one convoy with the friends
   * still here: see convoyPace in rules.js. On its own, or racing them, it's all of it.
   */
  get convoy() {
    return this.team && this.friends ? convoyPace(this.distance, this.friends.map((friend) => friend.distance)) : 1;
  }

  makeFriend(spec, slot) {
    const [paint, trim] = FRIEND_PAINTS[slot % FRIEND_PAINTS.length];
    const car = new RaceCar({ styleName: RIVAL_STYLES[slot % RIVAL_STYLES.length], paint, trim, spec, environment: this.environment, glowTexture: this.glowTexture });
    this.scene.add(car.group);
    if (this.camera) {
      car.setDetail(this.quality.level < 3);
      this.renderer.compile(car.group, this.camera, this.scene);
    }
    return { car, spec, remote: true, track: new CarTrack(), slot, lane: 0, distance: -START_BEHIND_LINE, lateral: 0, shove: 0, speed: 0, lift: 0, liftSpeed: 0, flying: false, turboLeft: 0, turboIn: Infinity, bumpWait: 0, wishPhase: 0, wanderPhase: 0 };
  }

  /** A friend who has gone, whose car goes too. */
  dropFriend(key) {
    const friend = this.friendCars.get(key);
    if (!friend || !this.friends?.includes(friend)) return;
    friend.car.group.visible = false;
    this.friends = this.friends.filter((each) => each !== friend);
    this.rivals = this.friends;
    this.racers = this.racers.filter((each) => each !== friend);
    this.place = 1 + this.friends.filter((each) => each.wasAhead).length;
  }

  paintsFor(spec, index) {
    const fallback = [['#3b82f6', '#ffd23f'], ['#a855f7', '#7ee8ff'], ['#14b8a6', '#ffe0b8']][index % 3];
    const main = spec.colours.pants ?? spec.colours.chest ?? fallback[0];
    return [main, spec.burstColours[0] === main ? fallback[1] : spec.burstColours[0]];
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  reset(laps) {
    this.laps = laps;
    this.raceDistance = laps * this.track.length;
    this.distance = -START_BEHIND_LINE;
    this.previousDistance = this.distance;
    this.lateral = 0;
    this.lateralVelocity = 0;
    this.shove = 0;
    this.speed = 0;
    this.starTotal = 0;
    this.fives = 0;
    this.gatesMet = 0;
    this.fivesLeft = 0;
    this.fivesRight = 0;
    this.streak = 0;
    this.lap = 1;
    this.place = this.rivals.length + 1;
    this.drive = 0;
    this.finished = false;
    // Racing to win, whoever of the others got over the line first, if the child didn't.
    this.lostTo = null;
    this.boostLeft = 0;
    this.reachOut = 0;
    this.reachAcross = 0;
    this.afterSlap = 0;
    this.lift = 0;
    this.liftSpeed = 0;
    this.flying = false;
    this.soaring = false;
    this.otherHand.reset();
    this.nosePitch = 0;
    this.gateNext = null;
    this.gateAhead = Infinity;
    this.gateLined = false;
    this.crowdCheeredAt = -Infinity;
    this.airWait = 0;
    this.restingFor = 0;
    this.turbo.reset();
    this.powers.reset();
    // Prizes: coins picked up, of which gems and treasure chests are worth more. See COINS in rules.js.
    this.coinTotal = 0;
    this.prizes = { coins: 0, gems: 0, chests: 0, highTens: 0 };
    this.coins.reset();
    this.powerUps.reset();
    this.balloons.reset();
    this.chests.reset();
    this.farm = { active: false, lap: null, distance: 0, lateral: 0, side: 1, speed: 0, passed: false, end: 0 };
    this.tractor.group.visible = false;
    this.callout = null;
    this.calledOut = new Set();
    this.calloutAgainAt = new Map();
    this.rivals.forEach((rival, index) => {
      // The first three line up one behind another, and the others from higher levels beside them, in the
      // other half of the road, so they're no closer together and all start behind the line.
      rival.distance = -START_BEHIND_LINE + 11 * GRID_ROWS[index];
      rival.lateral = rival.lane;
      rival.shove = 0;
      rival.speed = 0;
      rival.bumpWait = 0;
      rival.wasAhead = true;
      rival.passedAt = -Infinity;
      rival.lift = 0;
      rival.liftSpeed = 0;
      rival.flying = false;
      rival.comingBack = false;
      rival.turboLeft = 0;
      rival.coinsAt = -Infinity;
      rival.pacePhase = index * 1.9;
      // Spread out, so they take turns.
      rival.turboIn = this.plan.rivalTurboEvery * (0.5 + index * 0.37);
    });
    // Racing friends, everyone lines up side by side, in the same order on every computer.
    if (this.friends) {
      this.lateral = gridLane(this.gridSlot, this.gridSize);
      for (const friend of this.friends) {
        friend.distance = -START_BEHIND_LINE;
        friend.lateral = gridLane(friend.slot, this.gridSize);
        friend.wasAhead = friend.slot < this.gridSlot;
        friend.turboLeft = 0;
        friend.nudge = 0;
        friend.roomSide = 0;
        friend.track.clear();
      }
      this.place = 1 + this.friends.filter((friend) => friend.wasAhead).length;
    }
    this.stars.reset();
    this.snapCamera = true;
  }

  setMode(mode) {
    this.mode = mode;
    this.snapCamera = true;
    // Nothing is picked up once the race is over, and no power-up is left on for the next one. A hand check in
    // the middle of a race takes nothing away: coins stay on the road, and power-ups wait, as turbo does.
    if (mode === 'finished' || mode === 'attract') {
      const hadWide = this.powers.has('wide');
      this.coins.reset();
      this.powers.reset();
      if (hadWide) this.gates.applyReach({ snap: false });
    }
  }

  /** Whether a race is on and it's the last lap, which in a race of one lap is all of it. */
  get onLastLap() {
    return this.mode === 'race' && clamp(this.lapIndex + 1, 1, this.laps) === this.laps;
  }

  /**
   * At level 10 the last lap is golden. It goes by where the car is, so the first star past the line counts
   * twice too.
   */
  get goldenLapNow() {
    return Boolean(this.plan.goldenLap) && this.onLastLap;
  }

  /** Only the hand being played with appears on the car. */
  setDriverHand(side) {
    this.handSide = side;
    const { left, right, sleeves } = this.driver;
    left.root.visible = side === 'left';
    sleeves.left.visible = side === 'left';
    right.root.visible = side === 'right';
    sleeves.right.visible = side === 'right';
    this.player.setFreeArm(side);
  }

  /**
   * How far over the car has to be for a big hand on one side, right now. It's what a grown-up chose, eased
   * for a side that keeps being missed, and less while the closer-hands power-up is on.
   */
  reachNow(side) {
    const reach = this.reach.reachFor(side);
    return this.powers.has('wide') ? Math.max(LEAST_REACH, reach * POWER.wide.reach) : reach;
  }

  /** How far the child has to reach for a big hand. */
  setReach(reach) {
    this.reach.setBase(REACH[reach] ?? REACH.medium);
    this.gates.applyReach();
  }

  /** Puts different characters in the cars. */
  setDrivers(driver, rivals) {
    this.player.setCharacter(driver);
    this.player.setFreeArm(this.handSide);
    this.driver.setSleeveColour(driver.colours.arm ?? driver.colours.body);
    this.cast = rivals;
    this.garage.forEach((rival, index) => {
      rival.spec = rivals[index];
      rival.car.setCharacter(rivals[index]);
    });
    this.setCarDetail();
  }

  get info() {
    return {
      lap: this.lap,
      laps: this.laps,
      place: this.place,
      stars: this.starTotal,
      fives: this.fives,
      progress: clamp((this.distance + START_BEHIND_LINE) / (this.raceDistance + START_BEHIND_LINE), 0, 1),
      speed: this.speed / TOP_SPEED,
      turbo: this.turbo.level,
      turboOn: this.turbo.active,
      boosting: this.boostLeft > 0,
      flying: this.soaring,
      coins: this.coinTotal,
    };
  }

  /**
   * Everyone in order, first first. Two other cars side by side only swap places on the list when one
   * is clearly ahead, so that it doesn't keep jumping about.
   */
  get order() {
    const { racers } = this;
    const inFront = (a, b) => {
      if (a === null) return !b.wasAhead;
      if (b === null) return a.wasAhead;
      return a.distance > b.distance + 2;
    };
    for (let i = 0; i < racers.length - 1; i += 1) {
      if (inFront(racers[i + 1], racers[i])) [racers[i], racers[i + 1]] = [racers[i + 1], racers[i]];
    }
    return racers.map((racer) => (racer ? racer.spec : this.player.spec));
  }

  get lapIndex() {
    return Math.floor(this.distance / this.track.length);
  }

  /** The car steers itself to the next big hand or treasure chest, or else the next star. */
  autoLane() {
    const { gate, ahead } = this.gates.next(this.distance);
    const reachOver = (side) => side * Math.max(this.reachNow(side) + 0.5, 3.4);
    const position = mod(this.distance, this.track.length);
    // A chest is gone over to from further off, as it's the first of the two on that side.
    const chest = this.chests.chests.find((each) => each.openedOnLap !== this.lapIndex && mod(each.along - position, this.track.length) < Math.min(60, ahead));
    if (chest) return reachOver(chest.side);
    if (ahead < 42) return reachOver(gate.side);
    return this.stars.nextLane(position, this.lapIndex) ?? 0;
  }

  updatePlayer(dt, { drive = 0, steer = 0, steering = 'help', other = null }) {
    this.drive = drive;
    const handOpen = drive > 0;
    const wasTurbo = this.turbo.active;
    // A fist and then an open hand with the other hand makes the car fly, with turbo. The car still only
    // goes while the hand in play is open.
    const otherHandDidIt = this.otherHand.update(other);
    if (otherHandDidIt && handOpen && !this.soaring) {
      this.turbo.burst();
      this.takeOff();
    }
    this.turbo.update(handOpen ? 1 : 0, dt);
    if (this.turbo.active !== wasTurbo) this.events.onTurbo?.(this.turbo.active);
    // Power-ups run down only while the hand is open, like turbo.
    for (const kind of this.powers.update(handOpen ? 1 : 0, dt)) {
      if (kind === 'wide') this.gates.applyReach({ snap: false });
      this.events.onPower?.(kind, false);
    }
    this.boostLeft = handOpen ? Math.max(0, this.boostLeft - dt) : 0;

    const targetSpeed = wantedSpeed(drive, this.turbo.bonus, this.boostLeft) * this.convoy;
    if (targetSpeed > this.speed) {
      this.speed = Math.min(targetSpeed, this.speed + ACCELERATION * dt);
    } else {
      const down = handOpen ? OVER_TOP_DOWN : COAST_DOWN;
      this.speed = Math.max(targetSpeed, this.speed - down * dt);
    }
    this.previousDistance = this.distance;
    this.distance += this.speed * dt;

    // Standing still means no sliding sideways either.
    const grip = clamp(this.speed / (TOP_SPEED * 0.4), 0, 1);
    this.shove = damp(this.shove, 0, 5, dt);
    if (steering === 'auto') {
      this.lateralVelocity = clamp((this.autoLane() - this.lateral) * 1.8, -7, 7) * grip;
    } else {
      const tune = STEERING[steering] ?? STEERING.help;
      const wanted = tune.follow ? clamp((steer * tune.span - this.lateral) * tune.follow, -tune.rate, tune.rate) : steer * tune.rate;
      const push = -this.track.curvatureAt(this.distance) * this.speed ** 2 * tune.drift;
      this.lateralVelocity = wanted * grip + push;
    }
    this.lateral = clamp(this.lateral + (this.lateralVelocity + this.shove * grip) * dt, -LANE_LIMIT, LANE_LIMIT);

    const lapPosition = mod(this.distance, this.track.length);
    // A magnet draws the stars a little way ahead over to the car.
    this.stars.pull(dt, { position: lapPosition, lateral: this.lateral, reach: this.powers.has('magnet') ? POWER.magnet.ahead : 0 });
    if (this.distance > 0) {
      this.stars.collect(lapPosition, this.lateral, this.lapIndex, (star) => {
        // On the golden lap and with the rainbow on, each star counts twice, or four times with both.
        this.starTotal += (this.goldenLapNow ? 2 : 1) * (this.powers.has('rainbow') ? POWER.rainbow.starsEach : 1);
        this.particles.burst(star.position, { count: 9, shapes: ['star', 'dot'], colours: ['#ffe27a', '#fff3b8'], speed: 3.5, up: 3.5, life: 0.55, size: 0.45 });
        this.events.onStar?.(this.starTotal);
      });
      this.powerUps.collect(lapPosition, this.lateral, this.lapIndex, (token) => this.takePower(token));
    }
    this.updateGates(dt, handOpen);
    this.updateRoadside(handOpen);
    this.updateJump(dt);

    const lap = clamp(this.lapIndex + 1, 1, this.laps);
    if (lap !== this.lap) {
      this.lap = lap;
      this.celebrateAtLine();
      this.events.onLap?.(lap);
    }

    this.watchOvertaking();
    const place = 1 + this.rivals.filter((rival) => rival.wasAhead).length;
    if (place !== this.place) {
      const previous = this.place;
      this.place = place;
      this.events.onPlace?.(place, previous);
    }

    if (this.distance >= this.raceDistance && !this.finished) {
      this.finished = true;
      this.events.onFinish?.();
    }
  }

  /**
   * Racing to win, the first of the others over the line wins the race, and it's over there, with the child
   * wherever they were. Friends racing each other finish by their own games, as before.
   */
  watchForWinner() {
    if (this.gentle || this.finished || this.friends) return;
    const winner = this.rivals.filter((rival) => !rival.remote && rival.distance >= this.raceDistance).sort((a, b) => b.distance - a.distance)[0];
    if (!winner) return;
    this.finished = true;
    this.lostTo = winner.spec;
    this.place = 1 + this.rivals.filter((rival) => rival.distance > this.distance).length;
    this.events.onFinish?.();
  }

  /** Whoever gets overtaken, or does the overtaking, looks over and waves. It's all friendly. */
  watchOvertaking() {
    for (const rival of this.rivals) {
      const gap = rival.distance - this.distance;
      const ahead = rival.wasAhead ? gap > -PASSED_BY : gap > PASSED_BY;
      if (ahead === rival.wasAhead) continue;
      rival.wasAhead = ahead;
      rival.car.wave = 1.8;
      if (ahead) continue;
      // Past someone: you wave, they wave, and a few stars come out.
      this.player.wave = 1.4;
      const at = this.tmpC.copy(rival.car.group.position);
      at.y += 2.4;
      this.particles.burst(at, { count: 8, shapes: ['star'], colours: ['#ffffff', '#ffe27a'], speed: 3, up: 3, life: 0.6, size: 0.4 });
      // From level 2 they drop a few coins too, though not again straight away for the same car.
      if (this.plan.coins && this.mode === 'race' && this.time - rival.coinsAt > COINS.passAgainAfter) {
        rival.coinsAt = this.time;
        this.coins.spill(at, this.distance, this.lateral, COINS.perPass);
      }
      if (this.time - rival.passedAt > SAY_PASSED_AGAIN_AFTER_SECONDS) this.events.onOvertake?.(rival.spec);
      rival.passedAt = this.time;
    }
  }

  updateGates(dt, handOpen) {
    const { gate: next, ahead } = this.gates.next(this.distance);
    const reach = this.reachNow(next.side);
    const lined = this.lateral * next.side >= reach;
    // The arm goes out just before the hands meet, and comes back after.
    const timeLeft = ahead / Math.max(this.speed, 1);
    this.afterSlap = Math.max(0, this.afterSlap - dt);
    const reaching = (handOpen && lined && timeLeft < 0.34 && this.distance > 0) || this.afterSlap > 0;
    if (reaching && this.afterSlap <= 0) this.reachAcross = this.lateral - next.handX;
    this.reachOut = damp(this.reachOut, reaching ? 1 : 0, 20, dt);
    this.gateNext = next;
    this.gateAhead = ahead;
    this.gateLined = lined && handOpen;

    const moved = this.distance - this.previousDistance;
    if (moved <= 0 || moved > 8 || this.distance <= 0) return;
    const from = mod(this.previousDistance, this.track.length);
    for (const gate of this.gates.gates) {
      if (mod(gate.along - from, this.track.length) > moved) continue;
      // Flying high over a big hand is neither a high five nor a miss, so it costs nothing.
      if (this.soaring && this.lift > FLIGHT.overGatesAbove) continue;
      const outcome = gateOutcome({ handOpen, lateral: this.lateral, side: gate.side, reach: this.reachNow(gate.side) });
      this.gatesMet += 1;
      // Easing goes by how far over the car really was, so a slap the closer hands made easier can't make the
      // reach on that side any harder for afterwards.
      this.reach.recordPass(gate.side, this.lateral, handOpen);
      this.gates.applyReach({ snap: false });
      if (outcome === 'slap') this.slapGate(gate);
      else if (outcome === 'closed') this.gates.brush(gate, 4);
      else this.gates.brush(gate, 1.2);
      if (outcome !== 'slap') this.streak = 0;
      this.events.onGate?.(gate, outcome);
    }
  }

  slapGate(gate) {
    this.fives += 1;
    if (gate.side < 0) this.fivesLeft += 1;
    else this.fivesRight += 1;
    this.streak += 1;
    this.boostLeft = SLAP.boostSeconds;
    this.speed = Math.min(FASTEST_SPEED, this.speed + SLAP.kick);
    this.afterSlap = 0.16;
    this.gates.slap(gate);
    const where = this.tmpA;
    this.track.pointAt(gate.along, gate.handX, where);
    where.y += 3.6;
    const colour = `#${gate.paint.color.getHexString()}`;
    const bigger = Math.min(1.5, 1 + this.streak * 0.08);
    this.particles.burst(where, {
      count: 38 * bigger,
      shapes: ['star', 'hand', 'spark', 'paper'],
      colours: [colour, '#ffffff', '#ffe27a', HAND_COLOURS[(gate.index + 2) % HAND_COLOURS.length]],
      speed: 9,
      up: 8,
      life: 0.95,
      size: 0.85,
      gravity: 9,
    });
    this.particles.emit({ shape: 'ring', colour: '#ffffff', x: where.x, y: where.y, z: where.z, life: 0.4, size: 1.4, grow: 13, opacity: 0.85 });
    // From level 2, coins spill out of the big hand onto the road ahead.
    if (this.plan.coins) this.coins.spill(where, this.distance, this.lateral, COINS.perFive);
    this.player.fighter.setExpression('happy', 1.4);
    this.events.onFive?.(this.fives, gate.side, this.streak);
  }

  /** A power-up was driven through. */
  takePower(token) {
    this.powers.take(token.kind);
    if (token.kind === 'wide') this.gates.applyReach({ snap: false });
    const at = this.tmpA.copy(token.group.position);
    this.particles.burst(at, { count: 16, shapes: ['star', 'dot'], colours: ['#ffffff', '#fff3b8', '#bfe8ff'], speed: 5, up: 4, life: 0.6, size: 0.5 });
    this.particles.emit({ shape: 'ring', colour: '#ffffff', x: at.x, y: at.y, z: at.z, life: 0.35, size: 1.2, grow: 8, opacity: 0.7 });
    this.events.onPower?.(token.kind, true);
  }

  /** A coin picked up, or a gem or treasure, worth more. */
  addCoins(value, kind, at) {
    this.coinTotal += value;
    if (kind === 'coin') this.prizes.coins += 1;
    else if (kind === 'gem') this.prizes.gems += 1;
    else if (kind === 'chest') this.prizes.chests += 1;
    else if (kind === 'highTen') this.prizes.highTens += 1;
    if (at) this.particles.burst(at, kind === 'coin' ? COIN_BURST : { ...COIN_BURST, count: 22, speed: 6, up: 6, life: 0.8, size: 0.6, shapes: kind === 'gem' ? ['gem', 'star'] : ['coin', 'star'], colours: kind === 'gem' ? ['#53e0ff', '#ffffff'] : COIN_BURST.colours });
    this.events.onCoin?.(this.coinTotal, kind);
  }

  /**
   * Things beside the road that the car goes past: a treasure chest opens for a car reached over to it like a
   * big hand, and on the last lap at level 10, the giant high ten.
   */
  updateRoadside(handOpen) {
    const moved = this.distance - this.previousDistance;
    if (moved <= 0 || moved > 8 || this.distance <= 0) return;
    const { length } = this.track;
    const from = mod(this.previousDistance, length);
    const passing = (along) => mod(along - from, length) <= moved;
    for (const chest of this.chests.chests) {
      if (chest.openedOnLap === this.lapIndex || !passing(chest.along)) continue;
      if (!handOpen || this.lateral * chest.side < Math.max(LEAST_REACH, CHEST_REACH * this.reachNow(chest.side))) continue;
      chest.openedOnLap = this.lapIndex;
      const at = this.tmpA.copy(chest.group.position);
      at.y += 1.8;
      this.particles.burst(at, { count: 30, shapes: ['coin', 'gem', 'star'], colours: ['#ffc93c', '#53e0ff', '#ff7eb6', '#ffffff'], speed: 6, up: 9, life: 1, size: 0.6, gravity: 10 });
      this.addCoins(COINS.chest, 'chest', null);
    }
    // The high ten stands this far before the finish line on the last lap.
    const highTenAt = this.raceDistance - HIGH_TEN_BEFORE_LINE;
    if (this.plan.highTen && this.previousDistance < highTenAt && this.distance >= highTenAt) {
      this.highTen.slap(handOpen);
      if (handOpen) {
        for (const index of [0, 1]) {
          const at = this.highTen.palmAt(index, this.tmpA);
          this.particles.burst(at, { count: 34, shapes: ['star', 'hand', 'paper', 'coin'], colours: [...HAND_COLOURS, '#ffffff'], speed: 9, up: 8, life: 1.1, size: 0.85, gravity: 8 });
          this.particles.emit({ shape: 'ring', colour: '#ffffff', x: at.x, y: at.y, z: at.z, life: 0.45, size: 1.6, grow: 14, opacity: 0.85 });
        }
        this.player.fighter.setExpression('happy', 2);
        this.player.wave = 2;
        this.addCoins(COINS.highTen, 'highTen', null);
      }
      this.events.onHighTen?.(handOpen);
    }
  }

  /** Up into the air, from the other hand's turbo. */
  takeOff() {
    this.flying = true;
    this.soaring = true;
    this.liftSpeed = Math.max(this.liftSpeed, this.reducedMotion ? FLIGHT.lowLiftSpeed : FLIGHT.liftSpeed);
    this.lift = Math.max(this.lift, 0.2);
    this.player.fighter.setExpression('happy', 2);
    this.events.onFly?.();
  }

  updateJump(dt) {
    const onRamp = this.ramps.liftAt(this.distance, this.lateral);
    if (this.flying) {
      this.liftSpeed -= (this.soaring ? FLIGHT.gravity : JUMP_GRAVITY) * dt;
      this.lift += this.liftSpeed * dt;
      if (this.lift <= 0) {
        this.lift = 0;
        this.flying = false;
        this.soaring = false;
        this.liftSpeed = 0;
        this.puffAtWheels(10);
        this.events.onLanded?.();
      }
    } else if (onRamp > 0 && this.speed > 4) {
      this.lift = onRamp;
    } else if (this.ramps.launches(this.previousDistance, this.distance, this.lateral) && this.speed > 4) {
      this.flying = true;
      this.liftSpeed = jumpSpeed(this.speed);
      this.lift = 1;
      this.events.onJump?.();
    } else {
      this.lift = damp(this.lift, 0, 14, dt);
    }
  }

  puffAtWheels(count) {
    const at = this.player.group.position;
    for (let i = 0; i < count; i += 1) {
      this.particles.emit({
        shape: 'puff',
        colour: '#e8e4da',
        x: at.x + (Math.random() - 0.5) * 2,
        y: at.y + 0.2,
        z: at.z + (Math.random() - 0.5) * 3,
        vx: (Math.random() - 0.5) * 3,
        vy: 0.8 + Math.random() * 1.2,
        vz: (Math.random() - 0.5) * 3,
        life: 0.55,
        size: 0.7,
        grow: 1.5,
        opacity: 0.34,
      });
    }
  }

  updateRivals(dt, chasing) {
    const { gentle } = this;
    const stopped = chasing && this.drive === 0 && this.speed < RESTING_SPEED;
    // On Gentle everyone waits for a child who's resting. Racing to win, they only wait while the camera can't
    // see the hand: a hand that's closed in plain view is a rest the others drive on through.
    const resting = gentle ? stopped : stopped && !this.handSeen;
    const rushing = this.boostLeft > 0 || (this.turbo.active && this.turbo.heldFor < TURBO_PULLS_AWAY_SECONDS);
    const lastStretch = gentle && this.raceDistance - this.distance < LAST_STRETCH;
    this.restingFor = resting ? this.restingFor + dt : 0;
    const finishLine = this.raceDistance - FINISH_STOP;
    const pace = this.plan.rivalPace;
    // From level 5 the others use turbo now and then, one at a time, but never on the last stretch or while
    // a child is resting.
    const turboAllowed = chasing && !resting && !lastStretch;
    let anyTurbo = this.rivals.some((rival) => rival.turboLeft > 0);

    this.rivals.forEach((rival, index) => {
      if (rival.remote) {
        this.followFriend(rival, dt);
        return;
      }
      const gap = rival.distance - this.distance;
      let wanted = RIVAL_CRUISE * 0.5;
      if (chasing && !gentle) {
        // Racing to win: each at its own pace, whatever the child does, unless the camera has lost the hand.
        wanted = resting
          ? rivalSpeed({ gap, wish: 0, playerSpeed: 0, resting: true, rushing: false, cruise: RIVAL_CRUISE, pace })
          : ownPace({ cruise: this.plan.rivalCruise, index, time: this.time, phase: rival.pacePhase });
      } else if (chasing) {
        // Each drifts nearer and further ahead, at its own pace.
        const wish = lastStretch
          ? -10 - index * 9
          : RIVAL_WISHES[index] + pace.wishAhead + RIVAL_WISH_SWING * Math.sin(this.time * (0.21 + index * 0.05) + rival.wishPhase);
        if (gap < -RIVAL_COMES_BACK_FROM[index] * pace.comesBackScale) rival.comingBack = true;
        if (gap > wish || lastStretch) rival.comingBack = false;
        wanted = rivalSpeed({ gap, wish, playerSpeed: this.speed, resting, rushing, comingBack: rival.comingBack, cruise: RIVAL_CRUISE, pace });
      }
      if (turboAllowed) {
        rival.turboIn -= dt;
        const inSight = gap > RIVAL_TURBO_NEAR[0] && gap < RIVAL_TURBO_NEAR[1];
        const turboNow = gentle ? !rushing && inSight && this.speed > RESTING_SPEED : true;
        if (rival.turboIn <= 0 && !anyTurbo && turboNow) {
          rival.turboLeft = RIVAL_TURBO.seconds;
          rival.turboIn = this.plan.rivalTurboEvery;
          anyTurbo = true;
          this.events.onRivalTurbo?.(rival.spec);
        }
      } else {
        rival.turboLeft = 0;
      }
      if (rival.turboLeft > 0) {
        rival.turboLeft = Math.max(0, rival.turboLeft - dt);
        wanted = gentle ? Math.max(wanted, Math.min(FASTEST_SPEED, this.speed + RIVAL_TURBO.gain)) : Math.min(FASTEST_SPEED, wanted + RIVAL_TURBO.gain);
      }
      rival.speed = damp(rival.speed, wanted, 2.2, dt);
      if (chasing && gentle) rival.speed = Math.min(rival.speed, Math.max(0, finishLine - rival.distance) * 1.6);
      rival.distance += rival.speed * dt;
      // On Gentle everyone gets to finish: rivals never cross the line before the player does. Racing to win,
      // the first over the line wins: see watchForWinner.
      if (chasing && gentle) rival.distance = Math.min(rival.distance, finishLine);

      // Wander across the road, and keep out of each other's way. They try to keep out of the
      // player's way too, but a child steering over can still catch one.
      let lane = rival.lane + Math.sin(this.time * 0.37 + rival.wanderPhase) * 1.3;
      for (const other of this.rivals) {
        if (other === rival) continue;
        if (Math.abs(other.distance - rival.distance) < 7 && Math.abs(other.lateral - rival.lateral) < 3) {
          lane += rival.lateral >= other.lateral ? 2 : -2;
        }
      }
      if (chasing && Math.abs(gap) < 9 && Math.abs(rival.lateral - this.lateral) < 2.6) {
        lane += rival.lateral >= this.lateral ? 2.4 : -2.4;
      }
      // The tractor is on the shoulder, where no car can touch it, and they give it room as they go by.
      const { farm } = this;
      if (farm.active && Math.abs(farm.distance - 1.3 - rival.distance) < 10 && Math.abs(farm.lateral - rival.lateral) < 3.4) {
        lane += rival.lateral >= farm.lateral ? 2.6 : -2.6;
      }
      // While the child's car flies, those near it make room at the edges of the road, so that they go past
      // beside the camera rather than right under it, which with a crowd behind could change much of the
      // picture at once.
      if (chasing && this.soaring && gap > -SOARING_MAKES_ROOM && gap < SOARING_MAKES_ROOM) {
        lane = (rival.lateral >= this.lateral ? 1 : -1) * LANE_LIMIT;
      }
      rival.shove = damp(rival.shove, 0, 3.4, dt);
      const before = rival.lateral;
      rival.lateral = clamp(damp(rival.lateral, clamp(lane, -LANE_LIMIT, LANE_LIMIT), 1.6, dt) + rival.shove * dt, -LANE_LIMIT, LANE_LIMIT);
      rival.lateralVelocity = (rival.lateral - before) / Math.max(dt, 0.001);
      rival.bumpWait = Math.max(0, rival.bumpWait - dt);
      this.rivalOverRamps(rival, dt);

      if (chasing && this.speed > 1 && (touching(this, rival) || (this.powers.has('bubble') && this.inBubble(rival.distance, rival.lateral, CAR_LENGTH, CAR_WIDTH)))) this.bump(rival);
      if (chasing) this.rivalPassesGates(rival, dt);

      // Being beside the child means looking over and, as they pass, a wave.
      const beside = Math.abs(rival.distance - this.distance) < 14;
      const looking = beside ? clamp((this.lateral - rival.lateral) / 5, -1, 1) * -1.1 : 0;
      rival.car.look = resting && gap > 0 ? -2.4 : looking;
      if (resting && gap > 0 && this.restingFor > 1.5 && rival.car.wave <= 0 && Math.sin(this.time * 0.7 + index) > 0.8) rival.car.wave = 2.2;
    });
  }

  /** A friend's car goes where their own game says it is, a moment ago, so that it moves smoothly. */
  followFriend(friend, dt) {
    const at = friend.track.at(performance.now());
    if (!at) return;
    const { lateral, lift } = friend;
    // Close by, it goes over to one side, keeping to that side until it's clear, and to the edge of the road
    // while the child's car flies, as the others do.
    const gap = at.d - this.distance;
    let wanted = at.x;
    if (this.mode === 'race' && this.soaring && Math.abs(gap) < SOARING_MAKES_ROOM) {
      wanted = (at.x >= this.lateral ? 1 : -1) * LANE_LIMIT;
    } else if (Math.abs(gap) < FRIEND_ROOM.along && Math.abs(at.x - this.lateral) < FRIEND_ROOM.across) {
      if (!friend.roomSide) {
        const side = at.x >= this.lateral ? 1 : -1;
        friend.roomSide = Math.abs(this.lateral + side * FRIEND_ROOM.across) <= LANE_LIMIT ? side : -side;
      }
      wanted = this.lateral + friend.roomSide * FRIEND_ROOM.across;
    } else {
      friend.roomSide = 0;
    }
    friend.nudge = damp(friend.nudge ?? 0, clamp(wanted, -LANE_LIMIT, LANE_LIMIT) - at.x, 4, dt);
    friend.distance = at.d;
    friend.lateral = clamp(at.x + friend.nudge, -LANE_LIMIT, LANE_LIMIT);
    friend.speed = at.s;
    friend.lift = at.l;
    friend.flying = Boolean(at.f);
    friend.turboLeft = at.b ? 1 : 0;
    friend.lateralVelocity = (friend.lateral - lateral) / Math.max(dt, 0.001);
    friend.liftSpeed = (friend.lift - lift) / Math.max(dt, 0.001);
  }

  /** Where the child's car is, for friends' games to show: see friends.js. */
  get carState() {
    return {
      d: this.distance,
      x: this.lateral,
      s: this.speed,
      l: this.lift,
      f: this.flying ? 1 : 0,
      b: this.mode === 'race' && (this.turbo.active || this.boostLeft > 0) ? 1 : 0,
    };
  }

  /** The others take the ramps too, rather than driving through them. */
  rivalOverRamps(rival, dt) {
    const onRamp = this.ramps.liftAt(rival.distance, rival.lateral);
    if (rival.flying) {
      rival.liftSpeed -= JUMP_GRAVITY * dt;
      rival.lift += rival.liftSpeed * dt;
      if (rival.lift <= 0) {
        rival.lift = 0;
        rival.flying = false;
      }
    } else if (onRamp > 0) {
      rival.lift = onRamp;
    } else if (this.ramps.launches(rival.distance - rival.speed * dt, rival.distance, rival.lateral) && rival.speed > 4) {
      rival.flying = true;
      rival.liftSpeed = jumpSpeed(rival.speed);
      rival.lift = 1;
    } else {
      rival.lift = damp(rival.lift, 0, 14, dt);
    }
  }

  /** The others high five the big hands as well, which shows what they're there for. */
  rivalPassesGates(rival, dt) {
    const moved = rival.speed * dt;
    if (moved <= 0 || rival.distance <= 0) return;
    const from = mod(rival.distance - moved, this.track.length);
    for (const gate of this.gates.gates) {
      if (mod(gate.along - from, this.track.length) > moved) continue;
      if (rival.lateral * gate.side < RIVAL_SLAP_REACH) continue;
      this.gates.brush(gate, 6);
      rival.car.wave = Math.max(rival.car.wave, 0.8);
      const at = this.tmpC.copy(rival.car.group.position);
      at.y += 3;
      this.particles.burst(at, { count: 10, shapes: ['star', 'spark'], colours: ['#ffffff', '#ffe27a'], speed: 4, up: 4, life: 0.5, size: 0.5 });
    }
  }

  /**
   * Two cars touch: a little shove sideways and a few sparks, and everyone carries on. They never go
   * through each other: whichever way they overlap least, that's the way they're moved apart.
   */
  bump(rival) {
    const side = rival.lateral >= this.lateral ? 1 : -1;
    if (this.powers.has('bubble')) {
      this.bounceOffBubble(rival, side);
      if (touching(this, rival)) this.keepApart(rival, side);
      return;
    }
    const ahead = rival.distance >= this.distance ? 1 : -1;
    const across = CAR_WIDTH - Math.abs(rival.lateral - this.lateral);
    const along = CAR_LENGTH - Math.abs(rival.distance - this.distance);
    rival.shove = side * 9;
    this.shove = -side * 3;
    if (across < along) {
      rival.lateral = clamp(rival.lateral + side * across * 0.6, -LANE_LIMIT, LANE_LIMIT);
      this.lateral = clamp(this.lateral - side * across * 0.4, -LANE_LIMIT, LANE_LIMIT);
    } else {
      // Whoever's behind gives the one in front a push.
      rival.distance += ahead * along;
      rival.speed = ahead > 0 ? Math.max(rival.speed, this.speed) : Math.min(rival.speed, this.speed * 0.9);
    }
    if (rival.bumpWait > 0) return;
    rival.bumpWait = 0.9;
    rival.car.fighter.setExpression('dizzy', 1);
    const at = this.tmpA.copy(this.player.group.position).lerp(rival.car.group.position, 0.5);
    at.y += 0.7;
    this.particles.burst(at, { count: 14, shapes: ['spark', 'star'], colours: ['#ffd23f', '#ff9f45', '#ffffff'], speed: 7, up: 4, life: 0.45, size: 0.42, gravity: 12 });
    this.events.onBump?.();
  }

  /** Whether something of a length and width at a distance and lateral is touching the car's bubble. */
  inBubble(distance, lateral, length, width) {
    return Math.abs(distance - this.distance) < (CAR_LENGTH + length) / 2 + BUBBLE_ROOM
      && Math.abs(lateral - this.lateral) < (CAR_WIDTH + width) / 2 + BUBBLE_ROOM;
  }

  /**
   * With the bubble on, the child's car isn't pushed about, but two cars still never go through each other. One
   * that gets right up to the car is moved out of its way, whichever way it overlaps least, which is checked
   * every frame, so it's never far. Only one that's against the edge of the road and can't go any further
   * across leaves the child's car to move over, by what's left.
   */
  keepApart(rival, side) {
    const across = CAR_WIDTH - Math.abs(rival.lateral - this.lateral);
    const along = CAR_LENGTH - Math.abs(rival.distance - this.distance);
    if (across < along) {
      const before = rival.lateral;
      rival.lateral = clamp(rival.lateral + side * across, -LANE_LIMIT, LANE_LIMIT);
      const still = across - Math.abs(rival.lateral - before);
      if (still > 0) this.lateral = clamp(this.lateral - side * still, -LANE_LIMIT, LANE_LIMIT);
    } else {
      const ahead = rival.distance >= this.distance ? 1 : -1;
      rival.distance += ahead * along;
      rival.speed = ahead > 0 ? Math.max(rival.speed, this.speed) : Math.min(rival.speed, this.speed * 0.9);
    }
  }

  /** With the bubble on, whatever touches it bounces softly away to the side, and the child's car isn't pushed. */
  bounceOffBubble(other, side) {
    other.shove = side * 12;
    if (other.bumpWait > 0) return;
    other.bumpWait = 0.9;
    const at = this.tmpA.copy(this.player.group.position);
    at.y += 1.3;
    const across = this.tmpB.set(Math.cos(this.player.group.rotation.y), 0, -Math.sin(this.player.group.rotation.y)).multiplyScalar(-side * 2);
    at.add(across);
    this.particles.burst(at, { count: 12, shapes: ['dot', 'ring'], colours: ['#ffffff', '#bfe8ff', '#8fd6ff'], speed: 4, up: 2.5, life: 0.5, size: 0.42, gravity: 2 });
    this.events.onBounce?.();
  }

  /**
   * From level 4, a tractor comes out of the farm once a lap as the car gets near, and trundles along the
   * shoulder of its stretch of road, on the side away from the next big hand. That's off the tarmac, so it's never
   * in the way and nothing can run into it, wherever the child steers or flies. It stops before the next big hand
   * on its side, whose post is on the shoulder too, and it waits for a child who's resting, and through a hand
   * check. Going past it brings out coins from its trailer.
   */
  updateTractor(dt, resting) {
    const stretch = this.plan.tractor;
    const { farm, tractor } = this;
    if (!stretch || (this.mode !== 'race' && this.mode !== 'grid')) {
      farm.active = false;
      tractor.group.visible = false;
      return;
    }
    const { length } = this.track;
    const here = mod(this.distance, length);
    if (this.mode === 'race' && !farm.active && farm.lap !== this.lapIndex && this.distance > 0 && here > stretch.from - 120 && here < stretch.from - 30) {
      const start = this.distance + (stretch.from - here);
      const { side, from, to } = tractorRun(this.plan, length);
      Object.assign(farm, { active: true, lap: this.lapIndex, distance: start, end: start + to - from, side, lateral: side * TRACTOR.out, speed: TRACTOR.speed, passed: false });
    }
    if (!farm.active) {
      tractor.group.visible = false;
      return;
    }
    const gap = farm.distance - this.distance;
    farm.speed = damp(farm.speed, resting || farm.distance >= farm.end ? 0 : TRACTOR.speed, TRACTOR.slows, dt);
    farm.distance += farm.speed * dt;
    if (!farm.passed && this.distance > farm.distance + 1.5) {
      farm.passed = true;
      tractor.wave = 2.4;
      if (this.plan.coins) {
        const at = this.tmpA.copy(tractor.group.position);
        at.y += 2.4;
        this.coins.spill(at, this.distance, this.lateral, COINS.perTractor);
      }
      this.events.onTractor?.();
    }
    if (gap < -70) farm.active = false;
    tractor.group.visible = farm.active;
    tractor.place(this.track, farm.distance, farm.lateral, farm.speed, dt, this.reducedMotion);
  }

  /**
   * The first time something new at this level comes into sight, a little label goes over it for a moment,
   * and nothing is said. Things that aren't in one place, like the sunset, get it in the middle, near the top.
   * Sets this.callout to { id, left, at, ... }, where at is a spot in the world or null. The screen sets
   * callout.visible while it has the label up, and it only counts as shown once it has been up for a while: a
   * label that couldn't be seen comes again, the next time what it's for is in sight. A hand check in the
   * middle of a race holds it where it is.
   */
  updateCallout(dt) {
    if (this.mode === 'grid') return;
    if (this.mode !== 'race') {
      this.callout = null;
      return;
    }
    const { callout } = this;
    if (callout) {
      const at = callout.follow?.();
      if (at) callout.at = at;
      // Once what it's over has been picked up, the label fades straight away.
      else if (callout.follow) callout.left = Math.min(callout.left, CALLOUT_FADE);
      if (callout.visible) callout.seen += dt;
      if (callout.seen >= CALLOUT_COUNTS_AFTER) this.calledOut.add(callout.id);
      // Its time only runs while it's up, or once it's fading. Until then it waits to be seen, for a while.
      if (callout.visible || callout.left <= CALLOUT_FADE) callout.left -= dt;
      else callout.wait -= dt;
      callout.ending = callout.left <= CALLOUT_FADE;
      if (callout.left <= 0 || callout.wait <= 0) {
        if (!this.calledOut.has(callout.id)) this.calloutAgainAt.set(callout.id, this.time + CALLOUT_AGAIN_AFTER);
        this.callout = null;
      }
      return;
    }
    for (const thing of this.newHere) {
      if (this.calledOut.has(thing.id) || (this.calloutAgainAt.get(thing.id) ?? -Infinity) > this.time) continue;
      const follow = this.inSight(thing.id);
      if (follow === undefined) continue;
      this.callout = { ...thing, left: CALLOUT_SECONDS, wait: CALLOUT_WAIT, seen: 0, visible: false, ending: false, follow, at: follow?.() ?? null };
      return;
    }
  }

  /**
   * Whether something new is in sight: undefined if not, null for something that isn't in one place, or a
   * function that says where it is now.
   */
  inSight(id) {
    const { length } = this.track;
    const position = mod(this.distance, length);
    const lap = this.lapIndex;
    const ahead = (along) => mod(along - position, length);
    const near = (gap) => gap > IN_SIGHT[0] && gap < IN_SIGHT[1];
    const above = (object, up = 2.6) => () => {
      const at = object.getWorldPosition(new THREE.Vector3());
      at.y += up;
      return at;
    };
    const atRoad = (along, lateral, up) => () => this.track.pointAt(along, lateral, new THREE.Vector3()).setY(this.track.heightAt(along) + up);
    switch (id) {
      case 'coins': {
        // As soon as they spill out, over the one furthest on.
        const coin = this.coins.items.at(-1);
        return coin && coin.distance - this.distance > 8 ? () => (this.coins.items.includes(coin) ? coin.position.clone().setY(coin.position.y + 1.4) : null) : undefined;
      }
      case 'magnet':
      case 'bubble':
      case 'wide':
      case 'rainbow': {
        const { token, ahead: gap } = this.powerUps.next(position, lap, id);
        if (!token || !near(gap)) return undefined;
        const follow = above(token.group, 1.9);
        return () => (token.takenOnLap === this.lapIndex ? null : follow());
      }
      case 'pair': {
        const gate = this.gates.gates.find((each, index) => index > 0 && this.gates.gates[index - 1].side === each.side && near(ahead(each.along)));
        return gate ? above(gate.pivot, 4.4) : undefined;
      }
      case 'slalom': {
        const gate = this.plan.slalom ? this.gates.gates[0] : null;
        return gate && near(ahead(gate.along)) ? above(gate.pivot, 4.4) : undefined;
      }
      case 'tractor': {
        // Only once it's close, as it comes out of the farm just past the tunnel, which hides it before.
        const gap = this.farm.distance - this.distance;
        return this.farm.active && gap > IN_SIGHT[0] && gap < 55 ? above(this.tractor.group, 4.4) : undefined;
      }
      case 'car4':
      case 'car5': {
        if (this.friends) return undefined;
        const rival = this.rivals[id === 'car4' ? 3 : 4];
        return rival && near(rival.distance - this.distance) ? above(rival.car.group, 4.6) : undefined;
      }
      case 'rivalTurbo': {
        if (this.friends) return undefined;
        // Only once it's in the picture: beside the car or ahead of it, as one behind may be behind the camera.
        const rival = this.rivals.find((each) => each.turboLeft > 0 && each.distance - this.distance > -4 && each.distance - this.distance < IN_SIGHT[1]);
        return rival ? above(rival.car.group, 4.6) : undefined;
      }
      case 'sideRamp': {
        const ramp = this.ramps.layout.find((each) => each.lateral !== 0 && near(ahead(each.along)));
        return ramp ? atRoad(ramp.along + 3.5, ramp.lateral, 3.4) : undefined;
      }
      case 'balloon': {
        const balloon = this.balloons.balloons.find((each) => each.takenOnLap !== lap && near(ahead(each.along)) && each.drop > 0.3);
        if (!balloon) return undefined;
        const follow = above(balloon.gem, 1.6);
        return () => (balloon.takenOnLap === this.lapIndex ? null : follow());
      }
      case 'chest': {
        const chest = this.chests.chests.find((each) => near(ahead(each.along)));
        return chest ? above(chest.group, 3) : undefined;
      }
      case 'highTen':
        return this.highTen.shown > 0.5 && near(ahead(this.highTen.along)) ? atRoad(this.highTen.along, 0, 10.5) : undefined;
      // These go by what this race wants, so the last race's sunset fading away at the start isn't taken for it.
      case 'sunset':
        return this.weather.sunsetWanted > 0.15 && this.weather.sunset > 0.15 ? null : undefined;
      case 'rain':
        return this.weather.rainWanted > 0.3 && this.weather.rain > 0.3 ? null : undefined;
      case 'goldenLap':
        return this.goldenLapNow && this.distance > 0 ? null : undefined;
      default:
        return undefined;
    }
  }

  /** Little things drifting across the view, which say where you are, and show how fast you're going past. */
  emitAir(dt) {
    this.airWait -= dt;
    if (this.airWait > 0 || this.reducedMotion || this.mode !== 'race' || this.particles.budget < 1) return;
    this.airWait = 0.09;
    const air = this.world.airAt(this.distance + 30);
    if (!air) return;
    const at = this.track.pointAt(this.distance + 14 + Math.random() * 46, (Math.random() - 0.5) * 34, this.tmpC);
    this.particles.emit({
      shape: air.shape,
      colour: air.colours[Math.floor(Math.random() * air.colours.length)],
      x: at.x,
      y: at.y + 4 + Math.random() * 8,
      z: at.z,
      vx: (Math.random() - 0.5) * 1.6,
      vy: -1.5,
      vz: (Math.random() - 0.5) * 1.6,
      life: 2.6,
      size: air.size,
      spin: (Math.random() - 0.5) * 5,
    });
  }

  /** Paper coming down from the gantry, whenever someone goes through the start line. */
  celebrateAtLine() {
    const at = this.track.pointAt(4, 0, this.tmpC);
    at.y += 11;
    this.particles.burst(at, {
      count: 46,
      shapes: ['paper', 'paper', 'star'],
      colours: [...HAND_COLOURS, '#ffffff', '#ff5a4f'],
      speed: 11,
      up: 1,
      life: 1.9,
      size: 0.46,
      gravity: 4,
      drag: 1.1,
    });
  }

  emitExhaust(dt, car, carSpeed, throttle, flames) {
    car.exhaustWait = (car.exhaustWait ?? 0) - dt;
    if (car.exhaustWait > 0) return;
    if (this.particles.budget < 0.5 && !flames) return;
    car.exhaustWait = flames ? 0.05 : throttle ? 0.13 : 0.34;
    const pipe = car.exhaustAt(Math.floor(this.time * 30), this.tmpB);
    const heading = car.group.rotation.y;
    const backX = -Math.sin(heading);
    const backZ = -Math.cos(heading);
    if (flames) {
      // Warm little puffs behind the flames, which go with the car and fade straight away.
      this.particles.emit({
        shape: 'puff',
        colour: Math.random() > 0.5 ? '#ffb347' : '#ff8a3c',
        x: pipe.x + backX * 1.3,
        y: pipe.y,
        z: pipe.z + backZ * 1.3,
        vx: Math.sin(heading) * carSpeed * 0.7 + (Math.random() - 0.5),
        vy: 0.6 + Math.random() * 0.8,
        vz: Math.cos(heading) * carSpeed * 0.7 + (Math.random() - 0.5),
        life: 0.26,
        size: 0.42,
        grow: 0.8,
        opacity: 0.7,
      });
    } else {
      // A proper puff when the engine's working, and hardly anything when it's only cruising.
      const working = carSpeed > (car.puffSpeed ?? 0) + 0.01;
      car.puffSpeed = carSpeed;
      this.particles.emit({
        shape: 'puff',
        colour: '#f2efe8',
        x: pipe.x,
        y: pipe.y,
        z: pipe.z,
        vx: Math.sin(heading) * carSpeed * 0.6 + (Math.random() - 0.5) * 0.8,
        vy: 0.5 + Math.random() * 0.6,
        vz: Math.cos(heading) * carSpeed * 0.6 + (Math.random() - 0.5) * 0.8,
        life: working ? 0.55 : 0.3,
        size: working ? 0.2 : 0.14,
        grow: working ? 1.5 : 1,
        opacity: working ? 0.42 : 0.2,
      });
    }
  }

  update(dt, input = {}) {
    this.time += dt;
    this.watchFrameRate(dt);

    if (this.mode === 'race') {
      this.handSeen = input.handSeen ?? true;
      this.updatePlayer(dt, input);
      this.updateRivals(dt, true);
      this.watchForWinner();
      this.updateTractor(dt, this.drive === 0 && this.speed < RESTING_SPEED);
    } else if (this.mode === 'grid') {
      this.speed = 0;
      this.drive = 0;
      this.previousDistance = this.distance;
    } else {
      // Title and finish screens: everyone cruises around while the camera circles.
      const cruise = this.mode === 'attract' ? 11 : 13;
      this.speed = damp(this.speed, cruise, 2, dt);
      this.distance += this.speed * dt;
      this.lateral = damp(this.lateral, Math.sin(this.time * 0.3) * 2, 1, dt);
      this.lateralVelocity = 0;
      this.drive = 1;
      this.updateRivals(dt, false);
    }

    const racing = this.mode === 'race';
    const turboOn = racing && this.turbo.active;
    const boosting = racing && this.boostLeft > 0;
    const rushing = turboOn || boosting;

    const yaw = clamp(-this.lateralVelocity * 0.022, -0.3, 0.3);
    // The nose dips under braking and lifts under power, which is much of what makes a car feel heavy.
    const slowing = racing && this.drive === 0 && this.speed > 0.5;
    const wantedPitch = (slowing ? 0.055 : 0) + (rushing ? -0.04 : 0) + (this.flying ? -clamp(this.liftSpeed * 0.035, -0.28, 0.28) : 0);
    this.nosePitch = damp(this.nosePitch, this.reducedMotion ? 0 : wantedPitch, 8, dt);
    this.player.place(this.track, this.distance, this.lateral, this.speed, yaw, dt, {
      lift: this.lift,
      pitch: this.nosePitch,
      roll: clamp(this.lateralVelocity * 0.006, -0.06, 0.06),
    });

    const braking = racing && this.drive === 0;
    this.player.setBraking(braking ? 1 : 0, dt);
    const flameLevel = turboOn ? 0.55 + this.turbo.grown * 0.45 : boosting ? 0.5 : 0;
    this.player.setFlames(flameLevel, dt, this.reducedMotion);
    this.emitExhaust(dt, this.player, this.speed, this.drive > 0, flameLevel > 0.1);
    this.driver.reachOut(this.handSide, this.reachOut, this.reachAcross, PALM_HEIGHT);
    this.player.look = this.reachOut > 0.1 ? clamp(this.reachAcross, -0.9, 0.9) : clamp(-this.lateralVelocity * 0.05, -0.5, 0.5);
    this.player.updateDriver(dt, { steer: input.steer ?? 0, excited: rushing ? 1 : 0 });
    if (slowing && Math.random() < dt * 14) this.puffAtWheels(1);

    for (const rival of this.rivals) {
      const rivalYaw = clamp(-(rival.lateralVelocity ?? 0) * 0.03, -0.25, 0.25);
      rival.car.place(this.track, rival.distance, rival.lateral, rival.speed, rivalYaw, dt, {
        lift: rival.lift,
        pitch: rival.flying ? -clamp(rival.liftSpeed * 0.035, -0.28, 0.28) : 0,
      });
      const stoppedWaiting = racing && rival.speed < 3;
      rival.car.setBraking(stoppedWaiting ? 0.7 : 0, dt);
      const rivalFlames = racing && rival.turboLeft > 0 ? 0.6 : 0;
      rival.car.setFlames(rivalFlames, dt, this.reducedMotion);
      const gap = rival.distance - this.distance;
      const near = Math.abs(gap) < (this.quality.level >= QUALITY_LEVELS ? 60 : 110);
      rival.car.fighter.root.visible = near;
      if (near) rival.car.updateDriver(dt, { steer: rivalYaw * -2 });
      // A name over each car ahead, but not over one so close to the camera that it would be in the way.
      rival.car.showTag(racing && gap > -3 ? 1 - clamp((gap - 14) / 36, 0, 1) : 0);
      if (near) this.emitExhaust(dt, rival.car, rival.speed, rival.speed > 6, rivalFlames > 0);
    }

    this.poseDriver(dt, input);
    this.emitAir(dt);

    this.stars.update(this.time, this.lapIndex, racing || this.mode === 'grid');
    this.updateExtras(dt, racing);
    const showGates = racing || this.mode === 'grid';
    this.gates.update(dt, this.time, {
      next: showGates ? this.gateNext ?? this.gates.gates[0] : null,
      ready: this.gateLined,
      stripOn: racing && this.gateAhead < 60,
      carDistance: this.distance,
    });
    const speedShare = this.speed / TOP_SPEED;
    const crowdNear = this.world.crowdNearness(this.distance);
    if (racing && crowdNear > 0.6 && this.time - this.crowdCheeredAt > CROWD_CHEER_SPACING_SECONDS) {
      this.crowdCheeredAt = this.time;
      this.events.onCrowd?.();
    }
    this.world.update(dt, this.time, { crowdNear, excited: rushing ? 1 : 0 });

    this.updateCamera(dt);

    const carPosition = this.player.group.position;
    this.sunlight.position.set(carPosition.x + 55, carPosition.y + 90, carPosition.z + 32);
    this.sunlight.target.position.copy(carPosition);
    this.fillLight.position.copy(this.camera.position);
    this.fillLight.target.position.copy(carPosition);

    const lineStrength = this.reducedMotion ? 0 : racing ? clamp((speedShare - 0.85) / 0.4, 0, 1) : 0;
    this.speedLines.update(dt, this.camera, this.speed, this.quality.level >= 3 ? 0 : lineStrength);
    this.particles.update(dt, this.camera, this.renderer.domElement.height);
  }

  /**
   * Everything from the later levels that has to move each frame. It comes after the race itself has moved on,
   * so on the frame the race finishes, nothing from the race is left up in the view of the finish.
   */
  updateExtras(dt, racing) {
    const showing = racing || this.mode === 'grid';
    const position = mod(this.distance, this.track.length);
    const lap = this.lapIndex;
    // During a hand check in the middle of a race, the tractor waits as it does for a child who's resting.
    if (this.mode !== 'race') this.updateTractor(dt, true);
    // Nothing is picked up during a hand check, as the race is waiting.
    this.coins.update(dt, this.time, { distance: this.distance, lateral: this.lateral, magnet: this.powers.has('magnet'), collect: racing }, (coin) => {
      this.addCoins(1, 'coin', coin.position);
    });
    this.powerUps.update(this.time, lap, showing);
    this.balloons.update(dt, this.time, { position, lap, lateral: this.lateral, lift: this.lift, visible: showing, collect: racing }, (balloon) => {
      this.addCoins(COINS.gem, 'gem', this.balloons.gemPosition(balloon, this.tmpA));
    });
    this.chests.update(dt, lap, showing);
    // The high ten fades in far ahead on the last lap, and stays through a hand check. When the view cuts away,
    // as at the finish, it goes at once, so it's never left in the new view for a moment.
    const highTenAhead = this.raceDistance - HIGH_TEN_BEFORE_LINE - this.distance;
    const highTenWanted = this.plan.highTen && showing && !this.finished && highTenAhead < HIGH_TEN_SHOWS_FROM;
    this.highTen.update(dt, highTenWanted, this.snapCamera);
    this.stars.setGolden(this.goldenLapNow ? 1 : 0, dt);
    this.carPowers.update(dt, this.powers, this.time);
    // The rainbow trail only while the car is going with the hand open: resting leaves nothing behind.
    if (racing && this.powers.has('rainbow') && this.drive > 0 && this.speed > RESTING_SPEED) this.carPowers.trail(dt, this.particles, this.player, this.speed);
    const progress = clamp((this.distance + START_BEHIND_LINE) / (this.raceDistance + START_BEHIND_LINE), 0, 1);
    this.weather.update(dt, { plan: this.plan, progress, position, racing: racing || this.mode === 'finished', camera: this.camera });
    if (racing) this.weather.rainOn(dt, this.particles, this.camera);
    this.updateCallout(dt);
  }

  poseDriver(dt, { left = null, right = null, steer = 0 }) {
    const liveHands = (this.mode === 'race' || this.mode === 'grid') && left && right;
    if (liveHands) {
      this.driver.left.setPose(left.fingers, left.status, dt);
      this.driver.right.setPose(right.fingers, right.status, dt);
    } else {
      this.driver.left.setPose(IDLE_FINGERS, 'open', dt);
      this.driver.right.setPose(IDLE_FINGERS, 'open', dt);
    }
    // Seen from behind, rotating about +Z lifts the screen-left hand and lowers the screen-right hand,
    // so the driver leans into a turn.
    const idleWave = liveHands || this.reducedMotion ? 0 : Math.sin(this.time * 1.4) * 0.05;
    this.driver.group.rotation.z = damp(this.driver.group.rotation.z, steer * 0.14 + idleWave, 10, dt);
  }

  updateCamera(dt) {
    const carPosition = this.player.group.position;
    if (this.mode === 'attract' || this.mode === 'finished') {
      if (!this.reducedMotion) this.orbit += dt * 0.22;
      const heading = this.track.headingAt(this.distance) + 2.45 + Math.sin(this.orbit) * 0.5;
      this.cameraTarget.set(
        carPosition.x + Math.sin(heading) * 12.5,
        carPosition.y + 3.9,
        carPosition.z + Math.cos(heading) * 12.5,
      );
      // On a wide screen the car goes to one side, so that the card in the middle doesn't hide who's in it.
      const aside = this.camera.aspect > 1.3 ? 6.4 : 0;
      this.cameraLook.set(
        carPosition.x + Math.cos(heading) * aside,
        carPosition.y + 2.2,
        carPosition.z - Math.sin(heading) * aside,
      );
    } else {
      // Looks down far enough to keep the car clear of the hand meters at the bottom, and follows the
      // car sideways enough that it stays above them at the road's edge.
      const rush = this.mode === 'race' && (this.turbo.active || this.boostLeft > 0) && !this.reducedMotion ? 1 : 0;
      this.pullBack = damp(this.pullBack ?? 0, rush, 2.6, dt);
      this.track.pointAt(this.distance - 12.5 + this.pullBack * 1.4, this.lateral * 0.72, this.tmpA);
      this.track.pointAt(this.distance + 8.8, this.lateral * 0.62, this.tmpB);
      const [follows, looks] = this.soaring ? [FLIGHT.cameraFollows, FLIGHT.lookFollows] : [0.35, 0.5];
      this.cameraTarget.set(this.tmpA.x, this.tmpA.y + 5.5 + this.lift * follows, this.tmpA.z);
      this.cameraLook.set(this.tmpB.x, this.tmpB.y + 0.7 + this.lift * looks, this.tmpB.z);
    }

    if (this.snapCamera) {
      this.camera.position.copy(this.cameraTarget);
      this.currentLook.copy(this.cameraLook);
      this.snapCamera = false;
    } else {
      const blend = 1 - Math.exp(-dt * 14);
      this.camera.position.lerp(this.cameraTarget, blend);
      this.currentLook.lerp(this.cameraLook, blend);
    }
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.currentLook);

    if (!this.reducedMotion) {
      // Going faster widens the view, and turbo or a slap widens it a good deal more.
      const fov = 57 + Math.min(1, this.speed / TOP_SPEED) * 5 + (this.pullBack ?? 0) * 8;
      if (Math.abs(fov - this.camera.fov) > 0.02) {
        this.camera.fov = damp(this.camera.fov, fov, 3, dt);
        this.camera.updateProjectionMatrix();
      }
    }
  }

  setCarDetail() {
    const full = this.quality.level < 3;
    this.player.setDetail(full);
    for (const rival of this.garage) rival.car.setDetail(full);
    for (const friend of this.friendCars.values()) friend.car.setDetail(full);
  }

  /**
   * On a slow computer, trade sharpness, then shadows, then the small things for a steady frame rate. It
   * only watches during a race, as a title screen doesn't matter, and the first moments of anything
   * are slow while the graphics card gets ready.
   */
  watchFrameRate(dt) {
    const quality = this.quality;
    if (this.mode !== 'race') {
      quality.frames = 0;
      quality.seconds = 0;
      return;
    }
    quality.frames += 1;
    quality.seconds += dt;
    if (quality.seconds < QUALITY_CHECK_SECONDS) return;
    const framesPerSecond = quality.frames / quality.seconds;
    quality.frames = 0;
    quality.seconds = 0;
    if (framesPerSecond >= QUALITY_GOOD_FPS || quality.level >= QUALITY_LEVELS) return;
    quality.level += 1;
    this.applyQuality();
  }

  applyQuality() {
    const { level } = this.quality;
    if (level >= 1) this.renderer.setPixelRatio(1);
    if (level >= 2 && this.renderer.shadowMap.enabled) {
      this.renderer.shadowMap.enabled = false;
      this.sunlight.castShadow = false;
      this.scene.traverse((object) => {
        if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => {
          material.needsUpdate = true;
        });
      });
    }
    // Level 3 drops flowers, grass and ink lines. Level 4 drops bushes, rocks, things far away and half the crowd.
    this.world.setDetail(level - 1);
    this.particles.budget = (level >= 4 ? 0.3 : level >= 3 ? 0.55 : 1) * (this.reducedMotion ? 0.5 : 1);
    this.setCarDetail();
    this.resize();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

