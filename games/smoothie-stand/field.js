// The Harvest Fair behind Giraffe's stand: fruit flying up, a glove that copies the child's hand, and
// the blender on the counter. An open hand moving through a fruit slices it. A closed one bumps it.
//
// Nothing flashes: seizures are more common in children with hemiplegia. A slice is a few drops
// of juice where it happened, and the picture itself never changes brightness. Coins, power-up
// bubbles and the bee from the higher levels float slowly, and the first time each new thing comes
// in a game, a little label with its name fades in beside it and out again.
//
// With friends, everyone slices from the same fruit, and friends' gloves are here too, in light grey with
// their names: see setShared, and together.js.
import { LOOKS, paintFruit } from '../../core/fruit.js';
import { Glove, INK, SECOND_PLAYER, inOnePicture, secondPlayerLook } from '../../core/glove.js';
import { GOLDEN_COINS, NEW_THINGS, POWER_SECONDS, fairAt, nearestOnPath } from './orders.js';
import { flightAt, rounded, THROW_AHEAD_MS } from './together.js';

// gravity is in screen heights a second squared, every is the seconds between throws, volley is how
// few and how many go up in a throw, and most is how many can be up at once. There's always plenty to
// slice, and even fast is gentle: this is about reaching, not reaction time.
const PACES = {
  slow: { gravity: 0.38, every: 0.85, volley: [1, 2], most: 8 },
  medium: { gravity: 0.5, every: 0.7, volley: [1, 3], most: 10 },
  fast: { gravity: 0.68, every: 0.55, volley: [2, 3], most: 12 },
};
// However high the level, never more than the fastest pace has at once, or in a throw, so the sky
// never gets so full that fruit flickers past.
const MOST_EVER = 12;
const VOLLEY_EVER = 3;
const PALM_SHARE = 0.105;
const FRUIT_SHARE = 0.085; // A fruit's radius, as a share of the screen's height.
const SWIPE_SPEED = 0.28; // How fast a hand has to be going to slice, in screen heights a second.
const COUNTER_SHARE = 0.86; // Where the counter's top is.
const STICKY_SECONDS = 1.2;
const STICKY_COLOUR = '#7a5c3a';
const BUMP_REST_SECONDS = 1.2;
const REACH = { left: [0.1, 0.62], right: [0.38, 0.9] };
const TRAIL_SECONDS = 0.22;
const ACROSS_FROM = 0.08; // Thrown across from this far inside one end of the reach to as far inside the other.
const PAIR_GAP = 2.8; // A rotten one beside another, this many fruit sizes apart, so one can be sliced alone.
const CRACK_KICK = 0.12; // The first swipe on a tough fruit knocks it up this far, in screen heights.
const CRACK_REST_SECONDS = 0.35; // The same swipe can't slice it straight after cracking it.
const SKIN = '#8a5a2b';
// Coins, wedges and power-up bubbles float up slowly, and only need touching with an open hand.
const COIN_GRAVITY = 0.3; // In screen heights a second squared.
const COIN_PEAK = 0.42; // How high they go, as a share of the screen's height from the top.
const BUBBLE_GRAVITY = 0.2;
const BUBBLE_PEAK = 0.36;
const TOUCH_REACH = 0.75; // How near an open hand has to come, in palm lengths beyond the thing.
const MAGNET_REACH = 0.5; // How far the magnet pulls from, in screen heights.
const MAGNET_SPEED = 0.55; // In screen heights a second.
const BIG_GLOVE = 1.8; // How much further the big glove slices from.
const HONEY_SLOW = 0.5; // How fast everything goes with the honey.
const BEE_SECONDS = 9; // The bee crossing the reach, if nobody touches it.
const FLY_SECONDS = 0.7; // A coin flying up to the count of them.
const LABEL_SECONDS = 2.4; // A new thing's name, beside it the first time it comes.
const LABEL_WAIT = 3; // How long an older thing's name waits its turn before it's let go.
const LABEL_DOWN = 0.42; // Where a name waits, under it, as a share of the screen's height.
// With friends, fruit comes up right across the screen, as each child may play with a different hand.
const SHARED_REACH = [0.12, 0.88];
const START_SHARE = 1 + FRUIT_SHARE * 1.4; // Where thrown fruit starts, just below the screen, as a share of its height.
const FRIEND_GLOVE = { fill: '#e3e8ee', ink: '#9aa8b6' };
const FLESH = { golden: '#fff3a6', melon: '#ff6b7f', wedge: '#ff6b7f' };
const fleshOf = (kind) => FLESH[kind] ?? LOOKS[kind].flesh;

const between = (low, high) => low + Math.random() * (high - low);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export class SmoothieField {
  /** events: onSlice(kind, side), onBump(side), onShaken(side) */
  constructor(canvas, events = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.events = events;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.sprites = Object.fromEntries(Object.keys(LOOKS).map((kind) => [kind, paintFruit(kind)]));
    this.sprites.golden = paintGolden(this.sprites.apple);
    this.sprites.melon = paintMelon();
    this.sprites.wedge = paintWedge();
    this.sprites.coin = paintCoin();
    this.coins = []; // Tip coins and watermelon wedges, floating up to be touched.
    this.bubbles = []; // Power-up bubbles.
    this.bee = null;
    this.flying = []; // Coins on their way up to the count.
    this.labels = [];
    this.introduced = new Set();
    this.fresh = new Set(); // What's new at this level, whose names always get their turn.
    this.language = 'en';
    this.tallyAt = { x: 200, y: 40 };
    // From the rules: whether a power-up is on now, how long it has left, and whether a kind is wanted.
    this.powerOn = () => false;
    this.powerLeft = () => 0;
    this.isWanted = () => false;
    this.gloves = { left: new Glove('left'), right: new Glove('right') };
    for (const glove of Object.values(this.gloves)) {
      glove.stainColour = STICKY_COLOUR;
      glove.sticky = 0;
      glove.lastX = null;
      glove.lastY = null;
      glove.bumpedAt = -Infinity;
    }
    this.fruit = [];
    this.halves = [];
    this.drops = [];
    this.tokens = [];
    this.trail = [];
    this.aspect = 16 / 9;
    this.time = 0;
    this.throwIn = 0;
    this.throwing = false;
    this.nextFruit = () => 'apple';
    // What the next throw is: see Stand.nextThrow. Only the kind, unless a level says more.
    this.nextThrow = () => ({ kind: this.nextFruit() });
    this.level = fairAt(1);
    this.blenderLevel = 0;
    this.blenderSpin = 0;
    this.giraffe = null;
    this.tokenTarget = { x: 120, y: 200 };
    this.sliced = { left: 0, right: 0 };
    // Playing with friends: see setShared. gone is fruit that has gone from this screen for good.
    this.shared = null;
    this.gone = new Set();
    this.sharedGravity = 0;
    this.friendsGloves = []; // Each friend's glove, as { glove, name, fade }: main.js keeps them up to date.
    this.configure({ pace: 'slow', side: 'right', slicing: 'swipe' });
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** What this level brings, on top of the grown-ups' pace: see fairAt in orders.js. */
  setLevel(level) {
    this.level = fairAt(level);
  }

  /** The pace the grown-ups chose, with the level's on top. */
  get pace() {
    const pace = PACES[this.paceName];
    const { gravity, every, volley, most } = this.level;
    return {
      gravity: pace.gravity * gravity,
      every: pace.every * every,
      volley: [pace.volley[0], Math.max(pace.volley[1], Math.min(VOLLEY_EVER, pace.volley[1] + volley))],
      most: Math.max(pace.most, Math.min(MOST_EVER, pace.most + most)),
    };
  }

  configure({ pace = this.paceName, side = this.side, slicing = this.slicing }) {
    this.paceName = pace;
    this.side = side;
    this.slicing = slicing;
  }

  reset() {
    this.fruit = [];
    this.halves = [];
    this.drops = [];
    this.tokens = [];
    this.trail = [];
    this.throwing = false;
    this.throwIn = 0;
    this.blenderLevel = 0;
    this.sliced = { left: 0, right: 0 };
    this.coins = [];
    this.bubbles = [];
    this.bee = null;
    this.flying = [];
    this.labels = [];
    this.introduced = new Set();
    this.gone = new Set();
    for (const glove of Object.values(this.gloves)) glove.sticky = 0;
  }

  /**
   * Playing with friends, everyone slices from the same fruit. Whoever runs the stand throws it, and every game
   * works out where each fruit is from how it was thrown and the time since "GO!", so it's in the same place on
   * every screen. A fruit sliced here goes at once, and the server says whose it was. shared is { runner, clock(),
   * nextId(kind) }: runner says this game throws the fruit, clock() is the milliseconds since "GO!", and nextId
   * numbers each fruit thrown. null plays alone again.
   */
  setShared(shared) {
    this.shared = shared;
    this.gone = new Set();
    this.fruit = [];
    // Gravity, in screen heights a second squared, rounded as it's sent, so every game's fruit falls the same.
    this.sharedGravity = rounded(this.pace.gravity);
  }

  /** The same turn, spin and flies on every screen, from the fruit's id. */
  sharedFruit(id, kind, anchor) {
    const share = (id * 0.6180339887) % 1;
    return {
      id,
      kind,
      anchor,
      x: 0,
      y: -this.height,
      vx: 0,
      vy: 0,
      still: anchor.still,
      turnFrom: (id * 2.39996) % (Math.PI * 2),
      turn: 0,
      spin: this.reducedMotion ? 0.3 : share * 3.2 - 1.6,
      r: this.fruitSize,
      phase: (id * 1.7) % 6,
      across: false,
      tough: false,
      cracked: false,
      rest: 0,
    };
  }

  /**
   * With friends, this game throws one, for everyone. It goes up a moment from now, still below the screen,
   * so friends' games have heard of it before it can be seen. Somewhere exact, it hangs still there, for the
   * automated tests, and can be sliced from that moment on, by any glove there then.
   */
  throwShared(kind, { x, y } = {}) {
    const now = this.shared.clock();
    let anchor;
    if (y !== undefined) {
      anchor = { x: rounded(x / this.width), y: rounded(y / this.height), vx: 0, vy: 0, t: Math.round(now + THROW_AHEAD_MS), still: true };
    } else {
      const [low, high] = SHARED_REACH;
      const peak = between(0.34, 0.62);
      anchor = {
        x: rounded(x === undefined ? between(low, high) : x / this.width),
        y: rounded(START_SHARE),
        vx: rounded(between(-0.03, 0.03)),
        vy: rounded(-Math.sqrt(2 * this.sharedGravity * (START_SHARE - peak))),
        t: Math.round(now + THROW_AHEAD_MS),
        still: false,
      };
    }
    const fruit = this.sharedFruit(this.shared.nextId(kind), kind, anchor);
    this.fruit.push(fruit);
    this.placeShared(fruit, now);
    return fruit;
  }

  /** On a friend's game, the fruit as whoever runs the stand has it: each { id, kind, x, y, vx, vy, t, still }. */
  syncShared(list) {
    const known = new Map(this.fruit.map((fruit) => [fruit.id, fruit]));
    this.fruit = list.filter(({ id }) => !this.gone.has(id)).map((each) => {
      const fruit = known.get(each.id) ?? this.sharedFruit(each.id, each.kind, each);
      fruit.anchor = { x: each.x, y: each.y, vx: each.vx, vy: each.vy, t: each.t, still: each.still };
      fruit.still = each.still;
      return fruit;
    });
  }

  /** Where a shared fruit is at this moment, on this screen. */
  placeShared(fruit, now) {
    const { anchor } = fruit;
    const at = flightAt(anchor, now, this.sharedGravity);
    const seconds = (now - anchor.t) / 1000;
    fruit.x = at.x * this.width;
    fruit.y = at.y * this.height;
    // How it's going, for the halves when it's sliced.
    fruit.vx = anchor.still ? 0 : anchor.vx * this.width;
    fruit.vy = anchor.still ? 0 : (anchor.vy + this.sharedGravity * seconds) * this.height;
    fruit.turn = fruit.turnFrom + fruit.spin * Math.max(0, seconds);
  }

  /** With friends: throwing, if this game runs the stand, and every fruit where it is now. */
  updateShared(dt, slicing) {
    const now = this.shared.clock();
    if (this.shared.runner && this.throwing) {
      this.throwIn -= dt;
      if (this.throwIn <= 0) {
        const { pace } = this;
        const [few, many] = pace.volley;
        const count = Math.round(between(few, many));
        for (let i = 0; i < count && this.fruit.length < pace.most; i += 1) this.throwShared(this.nextThrow().kind);
        this.throwIn = pace.every * between(0.85, 1.15);
      }
    }
    this.fruit = this.fruit.filter((fruit) => {
      this.placeShared(fruit, now);
      // Not thrown yet: still below the screen.
      if (now < fruit.anchor.t) return true;
      if (slicing && this.touchGloves(fruit)) return false;
      if (fruit.still || fruit.y < this.height + fruit.r * 2) return true;
      this.gone.add(fruit.id);
      return false;
    });
  }

  /** A fruit that someone sliced, here or on a friend's computer, goes here too, in two if it was a friend. */
  removeShared(id, { burst = true } = {}) {
    this.gone.add(id);
    const fruit = this.fruit.find((each) => each.id === id);
    if (!fruit) return null;
    this.fruit = this.fruit.filter((each) => each !== fruit);
    if (burst && this.shared && this.shared.clock() >= fruit.anchor.t) this.split(fruit, -0.4);
    return fruit;
  }

  /**
   * The first time something new comes in a game, its name fades in beside it for a moment. at says
   * where it is now, on the screen, or null while it can't be seen, as when it's still below the
   * screen. A name only counts as shown once it has been: one still waiting when its thing goes waits
   * for the next of its kind instead.
   */
  introduce(key, at, x = at()?.x, y = this.height * LABEL_DOWN) {
    if (this.introduced.has(key) || !NEW_THINGS[key]) return;
    // Things fly up here, so the name waits in the sky above where it's going, and the ring follows it.
    const home = x === undefined ? undefined : { x, y };
    const waiting = this.labels.find((label) => label.key === key);
    if (!waiting) this.labels.push({ key, at, t: 0, home });
    else if (!waiting.started && waiting.at() === null) Object.assign(waiting, { at, home, wait: 0 });
  }

  /** A new thing's name, in the language the voice speaks now. */
  labelText({ key }) {
    const { mark, name, nameKa } = NEW_THINGS[key];
    return `${mark} ${this.language === 'ka' ? nameKa : name}`;
  }

  /** Where a power-up's badge is, beside the count of coins, while it's on, or null. */
  badgeAt(kind) {
    const on = Object.keys(POWER_SECONDS).filter((power) => this.powerOn(power));
    const index = on.indexOf(kind);
    return index < 0 ? null : { x: this.tallyAt.x + this.height * (0.15 + index * 0.085), y: this.tallyAt.y };
  }

  /** Something floating up slowly from below, within reach, to a height, as for coins. */
  floatUp(thing, gravity, peak, x) {
    const { width, height } = this;
    const [low, high] = REACH[this.side];
    const startY = height + this.fruitSize;
    return {
      x: x ?? between(low + 0.06, high - 0.06) * width,
      y: startY,
      vx: between(-0.02, 0.02) * width,
      vy: -Math.sqrt(2 * gravity * height * (startY - peak * height)),
      gravity: gravity * height,
      age: 0,
      ...thing,
    };
  }

  /** A customer's tip: coins floating up, near where the hand is, to touch. */
  tossTips(count) {
    const glove = this.gloves[this.side];
    const [low, high] = REACH[this.side];
    for (let i = 0; i < count; i += 1) {
      const near = glove.visible ? clamp(glove.x / this.width + (i - (count - 1) / 2) * 0.08, low + 0.06, high - 0.06) : undefined;
      const coin = this.floatUp({ kind: 'coin', r: this.fruitSize * 0.55, why: 'tip' }, COIN_GRAVITY, COIN_PEAK + i * 0.04, near === undefined ? undefined : near * this.width);
      this.coins.push(coin);
      this.introduce('tips', () => (this.coins.includes(coin) && coin.y < this.height ? coin : null), coin.x);
    }
  }

  /** A power-up bubble, floating up slowly. */
  throwBubble(power) {
    const bubble = this.floatUp({ power, r: this.fruitSize * 1.05 }, BUBBLE_GRAVITY, BUBBLE_PEAK);
    this.bubbles.push(bubble);
    this.introduce(power, () => (this.bubbles.includes(bubble) && !bubble.popped && bubble.y < this.height ? bubble : null), bubble.x);
    return bubble;
  }

  /** The bee with its pot of honey, buzzing slowly across the reach. */
  startBee() {
    const [low, high] = REACH[this.side];
    const leftFirst = Math.random() < 0.5;
    this.bee = { from: (leftFirst ? low : high) * this.width, to: (leftFirst ? high : low) * this.width, t: 0, x: 0, y: 0, leaving: false, honey: true, way: leftFirst ? 1 : -1 };
    this.moveBee(0);
    this.introduce('bee', () => this.bee);
  }

  /**
   * Throws one up now, somewhere exact if asked for, for the automated tests. across throws it from
   * one side of the reach to the other, tough makes it take two swipes, and withRotten throws a
   * rotten one up beside it.
   */
  throwFruit(kind, { x, y, across = false, tough = false, withRotten = false } = {}) {
    const { width, height } = this;
    const { pace } = this;
    const [low, high] = REACH[this.side];
    const startY = y ?? height + this.fruitSize * 1.4;
    const peak = between(0.34, 0.62) * height;
    const gravity = pace.gravity * height;
    const vy = y === undefined ? -Math.sqrt(2 * gravity * (startY - peak)) : 0;
    let startX = x ?? between(low, high) * width;
    let vx = x === undefined ? between(-0.03, 0.03) * width : 0;
    if (across && x === undefined) {
      // From near one end of the reach, landing near the other, so it's never out of reach.
      const leftFirst = Math.random() < 0.5;
      const from = (leftFirst ? low + ACROSS_FROM : high - ACROSS_FROM) * width;
      const to = (leftFirst ? high - ACROSS_FROM : low + ACROSS_FROM) * width;
      startX = from;
      vx = (to - from) / ((2 * -vy) / gravity);
    }
    const make = (what, atX) => ({
      kind: what,
      x: atX,
      y: startY,
      vx,
      vy,
      still: y !== undefined,
      turn: Math.random() * 6,
      spin: this.reducedMotion ? 0.3 : between(-1.6, 1.6),
      r: this.fruitSize * (what === 'melon' ? 1.35 : 1),
      phase: Math.random() * 6,
      across,
      tough,
      cracked: false,
      rest: 0,
    });
    const fruit = make(kind, startX);
    this.fruit.push(fruit);
    // Its name, the first time, once it's up in sight.
    fruit.news = kind === 'golden' || kind === 'melon' ? kind : tough ? 'tough' : across ? 'across' : withRotten ? 'pairs' : null;
    if (withRotten) {
      // On whichever side there's room for it, within reach.
      const gap = this.fruitSize * PAIR_GAP;
      const right = startX + gap <= high * width ? startX + gap : null;
      const left = startX - gap >= low * width ? startX - gap : null;
      const at = Math.random() < 0.5 ? left ?? right : right ?? left;
      if (at !== null && this.fruit.length < pace.most) this.fruit.push({ ...make('rotten', at), tough: false, partner: fruit });
    }
    return fruit;
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.ratio);
    this.canvas.height = Math.round(this.height * this.ratio);
    this.palmSize = Math.max(44, this.height * PALM_SHARE);
    this.fruitSize = Math.max(32, this.height * FRUIT_SHARE);
    this.paintBackdrop();
  }

  /** The fair only changes with the window, so it's drawn once and reused. */
  paintBackdrop() {
    const { width, height, ratio } = this;
    this.backdrop = document.createElement('canvas');
    this.backdrop.width = this.canvas.width;
    this.backdrop.height = this.canvas.height;
    const ctx = this.backdrop.getContext('2d');
    ctx.scale(ratio, ratio);

    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#6cc3ff');
    sky.addColorStop(0.7, '#fdf3cf');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    // Tents of the fair, in the distance.
    const tentColours = [['#ff7d6e', '#fff4e0'], ['#7cc4ff', '#fff4e0'], ['#ffd23f', '#fff4e0'], ['#8fd98a', '#fff4e0']];
    const ground = height * 0.74;
    ctx.fillStyle = '#9edb8f';
    ctx.fillRect(0, ground, width, height - ground);
    for (let i = 0; i < 6; i += 1) {
      const size = height * (0.13 + (i % 3) * 0.025);
      const x = (i + 0.5) * (width / 6);
      const [one, two] = tentColours[i % 4];
      const stripes = 6;
      for (let s = 0; s < stripes; s += 1) {
        ctx.fillStyle = s % 2 ? one : two;
        ctx.beginPath();
        ctx.moveTo(x, ground - size);
        ctx.lineTo(x - size * 0.9 + (s * size * 1.8) / stripes, ground);
        ctx.lineTo(x - size * 0.9 + ((s + 1) * size * 1.8) / stripes, ground);
        ctx.closePath();
        ctx.fill();
      }
    }
    // Bunting across the top.
    const flags = ['#ff5a4f', '#ffd23f', '#27c96b', '#3b82f6', '#a855f7'];
    const count = 22;
    for (let i = 0; i < count; i += 1) {
      const x = ((i + 0.5) / count) * width;
      const y = height * 0.03 + Math.sin((i / (count - 1)) * Math.PI) * height * 0.05;
      ctx.fillStyle = flags[i % flags.length];
      ctx.beginPath();
      ctx.moveTo(x - width * 0.017, y);
      ctx.lineTo(x + width * 0.017, y);
      ctx.lineTo(x, y + height * 0.05);
      ctx.closePath();
      ctx.fill();
    }
    // The counter of the stand.
    const top = height * COUNTER_SHARE;
    ctx.fillStyle = '#e7a862';
    ctx.fillRect(0, top, width, height - top);
    ctx.fillStyle = '#c98443';
    ctx.fillRect(0, top, width, height * 0.018);
  }

  /** One frame. slicing says whether slices count, for the moments between customers. */
  update(dt, snapshot, { aspect = this.aspect, slicing = false, showHands = false } = {}) {
    this.time += dt;
    this.aspect = aspect;
    for (const side of ['left', 'right']) {
      const glove = this.gloves[side];
      glove.lastX = glove.visible ? glove.x : null;
      glove.lastY = glove.visible ? glove.y : null;
      if (showHands && snapshot?.side === side) glove.follow(snapshot[side], dt, this);
      else glove.hide();
      if (slicing) this.shakeOff(glove, dt);
    }

    if (this.shared) this.updateShared(dt, slicing);
    else this.updateFruit(dt, slicing);
    this.updateExtras(dt, slicing);

    const glove = this.gloves[this.side];
    if (slicing && glove.visible && glove.status === 'open' && glove.speed >= SWIPE_SPEED * 0.7) {
      this.trail.push({ x: glove.x + glove.points[12].x, y: glove.y + glove.points[12].y, life: TRAIL_SECONDS });
    }
    for (const point of this.trail) point.life -= dt;
    this.trail = this.trail.filter(({ life }) => life > 0);

    this.updateBits(dt);
    this.blenderSpin = Math.max(0, this.blenderSpin - dt);
    if (this.blenderSpin === 0 && this.blenderLevel >= 1) this.blenderLevel = 0;
  }

  /** On their own: throwing, and each fruit flying on. */
  updateFruit(dt, slicing) {
    const { pace } = this;
    // With the honey, everything floats slowly for a while.
    const slow = this.powerOn('honey') ? HONEY_SLOW : 1;
    const fruitDt = dt * slow;
    if (this.throwing) {
      this.throwIn -= fruitDt;
      if (this.throwIn <= 0) {
        const [few, many] = pace.volley;
        const count = Math.round(between(few, many));
        for (let i = 0; i < count && this.fruit.length < pace.most; i += 1) {
          const { kind, ...how } = this.nextThrow();
          this.throwFruit(kind, how);
        }
        this.throwIn = pace.every * between(0.85, 1.15);
      }
    }

    const gravity = pace.gravity * this.height;
    this.gravityNow = gravity;
    this.fruit = this.fruit.filter((fruit) => {
      fruit.rest = Math.max(0, (fruit.rest ?? 0) - dt);
      if (!fruit.still) {
        fruit.vy += gravity * fruitDt;
        fruit.x += fruit.vx * fruitDt;
        fruit.y += fruit.vy * fruitDt;
        fruit.turn += fruit.spin * fruitDt;
      }
      if (fruit.news && fruit.y < this.height * 0.8) {
        this.introduce(fruit.news, () => (this.fruit.includes(fruit) ? fruit : null));
        fruit.news = null;
      }
      if (slicing && this.powerOn('magnet') && this.isWanted(fruit.kind)) this.pull(fruit, dt);
      if (slicing && this.touchGloves(fruit)) return false;
      return fruit.still || fruit.y < this.height + fruit.r * 2;
    });
  }

  /** A sticky glove comes clean by being held open. */
  shakeOff(glove, dt) {
    if (glove.sticky <= 0 || !glove.visible) {
      glove.stain = 0;
      return;
    }
    if (glove.status === 'open') {
      glove.sticky = Math.max(0, glove.sticky - dt);
      if (glove.sticky === 0) this.events.onShaken?.(glove.side);
    }
    glove.stain = glove.sticky > 0 ? 0.3 + 0.7 * (glove.sticky / STICKY_SECONDS) : 0;
  }

  /** Whether a hand has just gone through this fruit. Returns whether it was sliced. */
  touchGloves(fruit) {
    for (const glove of Object.values(this.gloves)) {
      if (!glove.visible) continue;
      const reach = fruit.r + this.palmSize * 0.5 * (this.powerOn('glove') ? BIG_GLOVE : 1);
      const near = glove.lastX === null
        ? Math.hypot(fruit.x - glove.x, fruit.y - glove.y)
        : nearestOnPath(glove.lastX, glove.lastY, glove.x, glove.y, fruit.x, fruit.y);
      if (near > reach && glove.reachTo(fruit.x, fruit.y, this.palmSize) > fruit.r) continue;
      if (glove.status !== 'open') {
        if (this.time - glove.bumpedAt > BUMP_REST_SECONDS) {
          glove.bumpedAt = this.time;
          this.events.onBump?.(glove.side);
        }
        continue;
      }
      if (glove.sticky > 0) continue;
      // Just touching is enough if a grown-up has chosen that.
      if (this.slicing === 'swipe' && glove.speed < SWIPE_SPEED) continue;
      if (fruit.rest > 0) continue;
      if (fruit.tough && !fruit.cracked) {
        this.crack(fruit, glove);
        return false;
      }
      this.slice(fruit, glove);
      return true;
    }
    return false;
  }

  /** The first swipe on a tough fruit cracks it, and knocks it up a little, for time for the second. */
  crack(fruit, glove) {
    fruit.cracked = true;
    fruit.rest = CRACK_REST_SECONDS;
    if (!fruit.still) fruit.vy = Math.min(fruit.vy, -Math.sqrt(2 * (this.gravityNow ?? this.height) * CRACK_KICK * this.height));
    const flesh = fleshOf(fruit.kind);
    for (let i = 0; i < (this.reducedMotion ? 2 : 5); i += 1) {
      const angle = (i / 5) * Math.PI * 2 + Math.random();
      const speed = between(0.15, 0.35) * this.height;
      this.drops.push({ x: fruit.x, y: fruit.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: fruit.r * between(0.06, 0.1), life: 0.4, colour: flesh });
    }
    this.events.onCrack?.(fruit.kind, glove.side);
  }

  slice(fruit, glove) {
    this.sliced[glove.side] += 1;
    const moveX = glove.lastX === null ? 1 : glove.x - glove.lastX;
    const moveY = glove.lastY === null ? 0 : glove.y - glove.lastY;
    this.split(fruit, Math.atan2(moveY, moveX || 1));
    // With friends, it's gone from here at once, and main.js asks the server whose it is.
    if (this.shared) this.gone.add(fruit.id);
    const verdict = this.events.onSlice?.(fruit.kind, glove.side, fruit);
    if (verdict === 'rotten') glove.sticky = STICKY_SECONDS;
    if (verdict === 'wanted') {
      this.tokens.push({ kind: fruit.kind, x: fruit.x, y: fruit.y, share: 0, fromX: fruit.x, fromY: fruit.y });
    }
    // A golden fruit is worth coins, which fly straight up to the count.
    if (verdict === 'golden') for (let i = 0; i < GOLDEN_COINS; i += 1) this.flying.push({ fromX: fruit.x + (i - 1) * fruit.r * 0.6, fromY: fruit.y, t: -i * 0.12 });
    // A watermelon splits into wedges, floating up, each worth a coin when touched.
    if (verdict === 'melon') {
      for (let i = 0; i < 3; i += 1) {
        this.coins.push({
          kind: 'wedge',
          x: fruit.x,
          y: fruit.y,
          vx: (i - 1) * this.height * 0.18,
          vy: -this.height * 0.45,
          gravity: COIN_GRAVITY * this.height,
          r: this.fruitSize * 0.7,
          age: 0,
          turn: (i - 1) * 0.6,
        });
      }
    }
  }

  /** A fruit falling in two along the cut, with a few drops of juice. */
  split(fruit, cut) {
    const push = this.height * 0.28;
    for (const way of [-1, 1]) {
      this.halves.push({
        kind: fruit.kind,
        x: fruit.x,
        y: fruit.y,
        vx: fruit.vx * 0.4 + Math.cos(cut + Math.PI / 2) * way * push,
        vy: fruit.vy * 0.3 + Math.sin(cut + Math.PI / 2) * way * push - this.height * 0.1,
        turn: cut,
        spin: way * between(1, 2.4),
        way,
        r: fruit.r,
        life: 1,
      });
    }
    const flesh = fleshOf(fruit.kind);
    const count = this.reducedMotion ? 4 : 9;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + Math.random();
      const speed = between(0.2, 0.5) * this.height;
      this.drops.push({ x: fruit.x, y: fruit.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: fruit.r * between(0.07, 0.14), life: 0.5, colour: flesh });
    }
  }

  /** The magnet draws something towards an open hand nearby. */
  pull(thing, dt) {
    const glove = this.gloves[this.side];
    if (!glove.visible || glove.status !== 'open') return;
    const dx = glove.x - thing.x;
    const dy = glove.y - thing.y;
    const distance = Math.hypot(dx, dy);
    if (distance === 0 || distance > this.height * MAGNET_REACH) return;
    const step = Math.min(distance, MAGNET_SPEED * this.height * dt);
    thing.x += (dx / distance) * step;
    thing.y += (dy / distance) * step;
  }

  /** Whether an open hand is touching something round, of radius r. Speed doesn't matter. */
  touched(thing) {
    const glove = this.gloves[this.side];
    if (!glove.visible || glove.status !== 'open') return false;
    const reach = thing.r + this.palmSize * TOUCH_REACH * (this.powerOn('glove') ? BIG_GLOVE : 1);
    const near = glove.lastX === null ? Math.hypot(thing.x - glove.x, thing.y - glove.y) : nearestOnPath(glove.lastX, glove.lastY, glove.x, glove.y, thing.x, thing.y);
    return near <= reach;
  }

  /**
   * Coins, wedges, power-up bubbles and the bee, from the higher levels. With the honey they float at
   * half speed too, like the fruit.
   */
  updateExtras(dt, slicing) {
    const floatDt = dt * (this.powerOn('honey') ? HONEY_SLOW : 1);
    const [low, high] = REACH[this.side];
    const keep = (thing) => {
      thing.age += floatDt;
      thing.vy += thing.gravity * floatDt;
      // Never drifting out of reach: at the edge of the reach it stops going further, and one that
      // started a little outside it comes back in, gently.
      const inner = low * this.width + thing.r;
      const outer = high * this.width - thing.r;
      if (thing.x < inner) thing.vx = Math.max(thing.vx, (inner - thing.x) * 2);
      else if (thing.x > outer) thing.vx = Math.min(thing.vx, (outer - thing.x) * 2);
      thing.x += thing.vx * floatDt;
      thing.y += thing.vy * floatDt;
      return thing.y < this.height + thing.r * 2;
    };
    this.coins = this.coins.filter((coin) => {
      if (slicing && this.powerOn('magnet')) this.pull(coin, dt);
      if (slicing && coin.age > 0.25 && this.touched(coin)) {
        this.flying.push({ fromX: coin.x, fromY: coin.y, t: 0, kind: coin.kind });
        this.events.onCoin?.(coin.kind);
        return false;
      }
      return keep(coin);
    });
    this.bubbles = this.bubbles.filter((bubble) => {
      if (slicing && bubble.age > 0.25 && this.touched(bubble)) {
        this.popBubble(bubble);
        return false;
      }
      return keep(bubble);
    });
    if (this.bee) this.moveBee(floatDt, slicing);
    for (const flier of this.flying) flier.t += dt / FLY_SECONDS;
    this.flying = this.flying.filter(({ t }) => t < 1);
    this.labels = stepLabels(this.labels, dt, this.fresh, this.introduced);
  }

  popBubble(bubble) {
    const count = this.reducedMotion ? 3 : 8;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      this.drops.push({ x: bubble.x + Math.cos(angle) * bubble.r, y: bubble.y + Math.sin(angle) * bubble.r, vx: Math.cos(angle) * this.height * 0.15, vy: Math.sin(angle) * this.height * 0.15, size: bubble.r * 0.08, life: 0.4, colour: '#bfe8ff' });
    }
    bubble.popped = true;
    this.events.onPower?.(bubble.power);
    // Popped before its name had its turn, it's named beside its badge while it's on.
    const badge = this.badgeAt(bubble.power);
    if (badge) this.introduce(bubble.power, () => this.badgeAt(bubble.power), badge.x, badge.y);
  }

  /** The bee buzzing across in a gentle wave, until a hand touches it and it gives its honey. */
  moveBee(dt, slicing = false) {
    const bee = this.bee;
    bee.t += dt;
    if (bee.leaving) {
      bee.y -= this.height * 0.3 * dt;
      bee.x += bee.way * this.height * 0.1 * dt;
      if (bee.y < -this.fruitSize * 2) this.bee = null;
      return;
    }
    const share = bee.t / BEE_SECONDS;
    bee.x = bee.from + (bee.to - bee.from) * share;
    // Below where prompts show, in the middle of where fruit flies.
    bee.y = this.height * (0.5 + 0.06 * Math.sin(bee.t * 1.4));
    bee.r = this.fruitSize * 0.9;
    if (slicing && bee.t > 0.4 && this.touched(bee)) {
      bee.leaving = true;
      bee.honey = false;
      this.flying.push({ fromX: bee.x, fromY: bee.y + bee.r * 0.6, t: 0, kind: 'honey', to: 'glove' });
      this.events.onBee?.();
    } else if (share >= 1) {
      bee.leaving = true;
    }
  }

  updateBits(dt) {
    const gravity = this.height * 1.3;
    for (const half of this.halves) {
      half.life -= dt;
      half.vy += gravity * dt;
      half.x += half.vx * dt;
      half.y += half.vy * dt;
      half.turn += half.spin * dt;
    }
    this.halves = this.halves.filter(({ life, y }) => life > 0 && y < this.height + 80);
    for (const drop of this.drops) {
      drop.life -= dt;
      drop.vy += gravity * dt;
      drop.x += drop.vx * dt;
      drop.y += drop.vy * dt;
    }
    this.drops = this.drops.filter(({ life }) => life > 0);
    for (const token of this.tokens) {
      token.share = Math.min(1, token.share + dt * 1.9);
      const ease = token.share * token.share * (3 - 2 * token.share);
      token.x = token.fromX + (this.tokenTarget.x - token.fromX) * ease;
      token.y = token.fromY + (this.tokenTarget.y - token.fromY) * ease;
    }
    this.tokens = this.tokens.filter(({ share }) => share < 1);
  }

  drawFruit(ctx, { kind, x, y, r, turn, tough = false, cracked = false }) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(turn);
    ctx.drawImage(this.sprites[kind], -r * 1.2, -r * 1.2, r * 2.4, r * 2.4);
    if (tough && !cracked) {
      // A thick brown skin all round, as a tough one has.
      ctx.lineWidth = r * 0.2;
      ctx.strokeStyle = SKIN;
      ctx.setLineDash([r * 0.35, r * 0.2]);
      ctx.beginPath();
      ctx.arc(0, r * 0.03, r * 1.02, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (cracked) {
      // A crack across it, showing the fruit inside.
      const crack = () => {
        ctx.beginPath();
        ctx.moveTo(-r * 0.8, -r * 0.1);
        ctx.lineTo(-r * 0.35, r * 0.15);
        ctx.lineTo(0, -r * 0.12);
        ctx.lineTo(r * 0.38, r * 0.16);
        ctx.lineTo(r * 0.8, -r * 0.05);
        ctx.stroke();
      };
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = INK;
      ctx.lineWidth = r * 0.2;
      crack();
      ctx.strokeStyle = fleshOf(kind);
      ctx.lineWidth = r * 0.1;
      crack();
    }
    ctx.restore();
  }

  drawFlies(ctx, fruit) {
    ctx.fillStyle = INK;
    for (let i = 0; i < 3; i += 1) {
      const angle = this.time * (1.6 + i * 0.3) + fruit.phase + i * 2.1;
      const size = fruit.r * (1.1 + Math.sin(this.time * 1.3 + i) * 0.15);
      ctx.beginPath();
      ctx.arc(fruit.x + Math.cos(angle) * size, fruit.y + Math.sin(angle * 1.3) * size, Math.max(2, fruit.r * 0.05), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** The turbo blender: a soft swirl over the blender while it lasts, turning slowly. */
  drawTurbo(ctx) {
    const { height, width } = this;
    const size = height * 0.2;
    const x = width * (this.side === 'right' ? 0.17 : 0.83) + size * 0.3;
    const y = height * 0.985 - size * 1.25;
    ctx.save();
    ctx.globalAlpha = Math.min(1, this.powerLeft('turbo') / 1.2);
    drawBubble(ctx, 'turbo', x, y, size * 0.28, size * 0.28, height);
    ctx.restore();
  }

  /** The blender on the counter, filling up as an order comes together. */
  drawBlender(ctx) {
    const { height, width, giraffe } = this;
    const baseY = height * 0.985;
    const size = height * 0.2;
    const x = width * (this.side === 'right' ? 0.17 : 0.83);
    if (giraffe?.complete && giraffe.naturalWidth) {
      const picture = height * 0.3;
      ctx.drawImage(giraffe, x - size * 1.45, baseY - picture * 1.02, picture, picture);
    }
    const wobble = this.blenderSpin > 0 && !this.reducedMotion ? Math.sin(this.time * 40) * height * 0.002 : 0;
    ctx.save();
    ctx.translate(x + size * 0.3 + wobble, baseY);
    ctx.fillStyle = '#39455a';
    ctx.fillRect(-size * 0.32, -size * 0.2, size * 0.64, size * 0.2);
    ctx.fillStyle = 'rgb(255 255 255 / 0.65)';
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, height * 0.004);
    ctx.beginPath();
    ctx.moveTo(-size * 0.26, -size * 0.2);
    ctx.lineTo(-size * 0.34, -size);
    ctx.lineTo(size * 0.34, -size);
    ctx.lineTo(size * 0.26, -size * 0.2);
    ctx.closePath();
    ctx.fill();
    const level = clamp(this.blenderLevel, 0, 1);
    if (level > 0) {
      const top = -size * 0.2 - size * 0.76 * level;
      const widthAt = size * (0.26 + 0.08 * level);
      ctx.fillStyle = '#ff9ac0';
      ctx.beginPath();
      ctx.moveTo(-size * 0.26, -size * 0.2);
      ctx.lineTo(-widthAt, top);
      ctx.lineTo(widthAt, top);
      ctx.lineTo(size * 0.26, -size * 0.2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(-size * 0.26, -size * 0.2);
    ctx.lineTo(-size * 0.34, -size);
    ctx.lineTo(size * 0.34, -size);
    ctx.lineTo(size * 0.26, -size * 0.2);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  render() {
    const { ctx, width, height, ratio } = this;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.drawImage(this.backdrop, 0, 0, width, height);
    this.drawBlender(ctx);
    if (this.powerOn('turbo')) this.drawTurbo(ctx);

    for (const fruit of this.fruit) {
      this.drawFruit(ctx, fruit);
      if (fruit.kind === 'rotten') this.drawFlies(ctx, fruit);
    }

    for (const half of this.halves) {
      ctx.save();
      ctx.translate(half.x, half.y);
      ctx.rotate(half.turn);
      ctx.beginPath();
      ctx.rect(-half.r * 1.4, half.way > 0 ? 0 : -half.r * 1.4, half.r * 2.8, half.r * 1.4);
      ctx.clip();
      ctx.drawImage(this.sprites[half.kind], -half.r * 1.2, -half.r * 1.2, half.r * 2.4, half.r * 2.4);
      ctx.fillStyle = fleshOf(half.kind);
      ctx.beginPath();
      ctx.ellipse(0, 0, half.r * 0.9, half.r * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (const drop of this.drops) {
      ctx.globalAlpha = clamp(drop.life / 0.25, 0, 1);
      ctx.fillStyle = drop.colour;
      ctx.beginPath();
      ctx.arc(drop.x, drop.y, drop.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const token of this.tokens) this.drawFruit(ctx, { kind: token.kind, x: token.x, y: token.y, r: this.fruitSize * (1 - token.share * 0.6), turn: 0 });

    if (this.trail.length > 1) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 1; i < this.trail.length; i += 1) {
        const a = this.trail[i - 1];
        const b = this.trail[i];
        ctx.strokeStyle = `rgb(255 255 255 / ${clamp(b.life / TRAIL_SECONDS, 0, 1) * 0.8})`;
        ctx.lineWidth = height * 0.012 * clamp(b.life / TRAIL_SECONDS, 0.2, 1);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    this.drawExtras(ctx);
    this.drawBigGlove(ctx);
    // A friend's glove goes under the child's own, but the second player's in one picture goes over the first's.
    const over = inOnePicture();
    if (!over) this.drawFriendsGloves(ctx);
    this.gloves.left.draw(ctx, this.palmSize);
    this.gloves.right.draw(ctx, this.palmSize);
    if (over) this.drawFriendsGloves(ctx);
    this.drawPowers(ctx);
    this.drawFlying(ctx);
    const [label] = this.labels;
    if (label?.started) drawLabel(ctx, label, this.labelText(label), label.at(), width, height, LABEL_SECONDS);
  }

  /**
   * Friends' gloves, playing on their own computers, where their hands really are, in light grey under the
   * child's own, with each friend's name over theirs. They're only there to see: they slice nothing here. Two
   * playing in one picture on one screen, the friend is the second player, right there playing too, so theirs is
   * in their own blue.
   */
  drawFriendsGloves(ctx) {
    const { palmSize } = this;
    const second = inOnePicture();
    for (const { glove, name, fade } of this.friendsGloves) {
      if (!glove.visible || fade < 0.02) continue;
      // Solid, as a see-through one shows its outline through itself, and only fading as it comes and goes.
      glove.draw(ctx, palmSize, second ? secondPlayerLook(glove, fade) : { ...FRIEND_GLOVE, alpha: fade });
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.font = `700 ${Math.round(palmSize * 0.32)}px Fredoka, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const y = glove.y - palmSize * 1.55;
      const wide = ctx.measureText(name).width + palmSize * 0.4;
      ctx.fillStyle = second ? SECOND_PLAYER.tag : 'rgba(18, 48, 77, 0.72)';
      ctx.beginPath();
      ctx.roundRect(glove.x - wide / 2, y - palmSize * 0.42, wide, palmSize * 0.48, palmSize * 0.24);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(name, glove.x, y);
      ctx.restore();
    }
  }

  /** Coins and wedges floating up, power-up bubbles, and the bee. */
  drawExtras(ctx) {
    const { height } = this;
    for (const coin of this.coins) {
      const size = coin.r * 1.2;
      ctx.save();
      ctx.translate(coin.x, coin.y);
      if (coin.kind === 'wedge') ctx.rotate(coin.turn + coin.age * (this.reducedMotion ? 0.2 : 1));
      ctx.drawImage(this.sprites[coin.kind], -size, -size, size * 2, size * 2);
      ctx.restore();
    }
    for (const bubble of this.bubbles) {
      const wobble = this.reducedMotion ? 0 : Math.sin(bubble.age * 3) * 0.04;
      drawBubble(ctx, bubble.power, bubble.x, bubble.y, bubble.r * (1 + wobble), bubble.r * (1 - wobble), height);
    }
    if (this.bee) drawBee(ctx, this.bee, this.time, this.reducedMotion, height);
  }

  /** The soft glow round the hand that shows the big glove's reach, while it lasts. */
  drawBigGlove(ctx) {
    const glove = this.gloves[this.side];
    if (!this.powerOn('glove') || !glove.visible) return;
    const left = this.powerLeft('glove');
    ctx.save();
    // A thin ring and only a faint fill, as it goes wherever the hand goes, however quickly.
    ctx.globalAlpha = Math.min(1, left / 1.2);
    ctx.fillStyle = 'rgb(255 240 170 / 0.08)';
    ctx.strokeStyle = 'rgb(255 205 90 / 0.6)';
    ctx.lineWidth = this.height * 0.005;
    ctx.beginPath();
    ctx.arc(glove.x, glove.y, this.palmSize * 0.5 * BIG_GLOVE + this.fruitSize * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /**
   * A little badge for each power-up that's on, with a ring for the time it has left. They stay still
   * beside the count of coins, rather than going about with the hand.
   */
  drawPowers(ctx) {
    const on = Object.keys(POWER_SECONDS).filter((kind) => this.powerOn(kind));
    if (!on.length) return;
    const { height } = this;
    on.forEach((kind, i) => {
      const x = this.tallyAt.x + height * (0.15 + i * 0.085);
      const y = this.tallyAt.y;
      const r = height * 0.03;
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.powerLeft(kind) / 1.2);
      drawBubble(ctx, kind, x, y, r, r, height);
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(3, height * 0.006);
      ctx.strokeStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(x, y, r * 1.3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (this.powerLeft(kind) / POWER_SECONDS[kind]));
      ctx.stroke();
      ctx.restore();
    });
  }

  /** Coins on their way up to the count, and honey on its way to the hand. */
  drawFlying(ctx) {
    const glove = this.gloves[this.side];
    for (const flier of this.flying) {
      if (flier.t < 0) continue;
      const ease = flier.t * flier.t * (3 - 2 * flier.t);
      const to = flier.to === 'glove' && glove.visible ? glove : this.tallyAt;
      const x = flier.fromX + (to.x - flier.fromX) * ease;
      const y = flier.fromY + (to.y - flier.fromY) * ease - Math.sin(flier.t * Math.PI) * this.height * 0.06;
      const size = this.fruitSize * 0.6 * (1.1 - ease * 0.5);
      if (flier.kind === 'honey') drawHoneyPot(ctx, x, y, size, this.height);
      else ctx.drawImage(this.sprites.coin, x - size, y - size, size * 2, size * 2);
    }
  }

  /** A picture of a fruit, for the order ticket. */
  pictureOf(kind) {
    return this.sprites[kind].toDataURL('image/png');
  }
}

/** A golden apple: the apple's shape in bright gold, inside a dark outline, with a sparkle. */
function paintGolden(apple) {
  const { width: wide, height: high } = apple;
  const shape = (fill) => {
    const canvas = document.createElement('canvas');
    canvas.width = wide;
    canvas.height = high;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(apple, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = fill(ctx);
    ctx.fillRect(0, 0, wide, high);
    return canvas;
  };
  const gold = document.createElement('canvas');
  gold.width = wide;
  gold.height = high;
  const ctx = gold.getContext('2d');
  ctx.drawImage(shape(() => INK), 0, 0);
  ctx.drawImage(shape((context) => {
    const shine = context.createRadialGradient(wide * 0.4, high * 0.38, 10, wide / 2, high / 2, wide * 0.5);
    shine.addColorStop(0, '#fff3a6');
    shine.addColorStop(0.55, '#ffd23f');
    shine.addColorStop(1, '#f0a81c');
    return shine;
  }), wide * 0.035, high * 0.035, wide * 0.93, high * 0.93);
  ctx.fillStyle = 'rgb(255 255 255 / 0.6)';
  ctx.beginPath();
  ctx.ellipse(wide * 0.34, high * 0.36, wide * 0.06, high * 0.1, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fffbe0';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    const reach = i % 2 ? 9 : 26;
    ctx.lineTo(wide * 0.74 + Math.cos(angle) * reach, high * 0.3 + Math.sin(angle) * reach);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  return gold;
}

/** A round watermelon, striped. */
function paintMelon() {
  const canvas = document.createElement('canvas');
  canvas.width = 240;
  canvas.height = 240;
  const ctx = canvas.getContext('2d');
  ctx.translate(120, 120);
  ctx.lineWidth = 7;
  ctx.strokeStyle = INK;
  ctx.fillStyle = '#3fae4a';
  ctx.beginPath();
  ctx.ellipse(0, 4, 98, 90, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = '#23793a';
  ctx.lineWidth = 12;
  for (const dx of [-60, -20, 20, 60]) {
    ctx.beginPath();
    ctx.moveTo(dx, -96);
    ctx.quadraticCurveTo(dx * 1.4, 4, dx, 100);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.ellipse(0, 4, 98, 90, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgb(255 255 255 / 0.4)';
  ctx.beginPath();
  ctx.ellipse(-44, -36, 16, 26, -0.5, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

/** A wedge of watermelon, red with seeds and a green rind. */
function paintWedge() {
  const canvas = document.createElement('canvas');
  canvas.width = 240;
  canvas.height = 240;
  const ctx = canvas.getContext('2d');
  ctx.translate(120, 130);
  ctx.lineWidth = 7;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.fillStyle = '#3fae4a';
  ctx.beginPath();
  ctx.arc(0, -40, 110, Math.PI * 0.2, Math.PI * 0.8);
  ctx.lineTo(0, -40);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ff6b7f';
  ctx.beginPath();
  ctx.arc(0, -40, 90, Math.PI * 0.22, Math.PI * 0.78);
  ctx.lineTo(0, -40);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = INK;
  for (const [x, y] of [[-24, 10], [0, 22], [24, 10], [-10, -8], [12, -8]]) {
    ctx.beginPath();
    ctx.ellipse(x, y, 4, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}

/** A gold coin with a star on it. */
function paintCoin() {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.translate(48, 48);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.arc(0, 0, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#e09a1a';
  ctx.beginPath();
  ctx.arc(0, 0, 29, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#f2a516';
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const reach = i % 2 ? 8 : 19;
    ctx.lineTo(Math.cos(angle) * reach, Math.sin(angle) * reach);
  }
  ctx.closePath();
  ctx.fill();
  return canvas;
}

/** A power-up in a soft bubble: a magnet, honey, a big glove or a turbo swirl. */
function drawBubble(ctx, kind, x, y, rx, ry, height) {
  ctx.save();
  ctx.translate(x, y);
  const glow = ctx.createRadialGradient(0, 0, rx * 0.2, 0, 0, rx);
  glow.addColorStop(0, 'rgb(255 255 255 / 0.85)');
  glow.addColorStop(1, 'rgb(190 232 255 / 0.75)');
  ctx.fillStyle = glow;
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(2, height * 0.004);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const r = Math.min(rx, ry) * 0.55;
  ctx.lineWidth = Math.max(2, height * 0.0035);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (kind === 'magnet') {
    ctx.strokeStyle = '#e8433f';
    ctx.lineWidth = r * 0.45;
    ctx.beginPath();
    ctx.arc(0, -r * 0.05, r * 0.6, Math.PI, 0);
    ctx.lineTo(r * 0.6, r * 0.6);
    ctx.moveTo(-r * 0.6, -r * 0.05);
    ctx.lineTo(-r * 0.6, r * 0.6);
    ctx.stroke();
    ctx.strokeStyle = '#d6dde6';
    ctx.beginPath();
    ctx.moveTo(-r * 0.6, r * 0.45);
    ctx.lineTo(-r * 0.6, r * 0.75);
    ctx.moveTo(r * 0.6, r * 0.45);
    ctx.lineTo(r * 0.6, r * 0.75);
    ctx.stroke();
  } else if (kind === 'honey') {
    drawHoneyPot(ctx, 0, 0, r, height);
  } else if (kind === 'glove') {
    ctx.fillStyle = '#3ddc84';
    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.roundRect(-r * 0.55, -r * 0.1, r * 1.1, r * 0.85, r * 0.3);
    ctx.fill();
    ctx.stroke();
    for (const dx of [-0.42, -0.14, 0.14, 0.42]) {
      ctx.beginPath();
      ctx.roundRect(r * dx - r * 0.12, -r * 0.8, r * 0.24, r * 0.8, r * 0.12);
      ctx.fill();
      ctx.stroke();
    }
  } else if (kind === 'turbo') {
    ctx.strokeStyle = '#ff6fae';
    ctx.lineWidth = r * 0.3;
    ctx.beginPath();
    for (let i = 0; i <= 40; i += 1) {
      const angle = (i / 40) * Math.PI * 3.2;
      const reach = r * (0.15 + (i / 40) * 0.75);
      ctx.lineTo(Math.cos(angle) * reach, Math.sin(angle) * reach);
    }
    ctx.stroke();
  }
  ctx.fillStyle = 'rgb(255 255 255 / 0.8)';
  ctx.beginPath();
  ctx.ellipse(-rx * 0.45, -ry * 0.45, rx * 0.14, ry * 0.08, -0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHoneyPot(ctx, x, y, r, height) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(2, height * 0.0035);
  ctx.fillStyle = '#f4a52a';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.15, r * 0.75, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#c9843f';
  ctx.beginPath();
  ctx.roundRect(-r * 0.55, -r * 0.65, r * 1.1, r * 0.3, r * 0.1);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.ellipse(-r * 0.15, -r * 0.3, r * 0.3, r * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A round, smiling bee, wings beating about twice a second, with its honey until it gives it. */
function drawBee(ctx, bee, time, reduced, height) {
  const r = bee.r ?? 30;
  ctx.save();
  ctx.translate(bee.x, bee.y);
  ctx.scale(bee.way, 1);
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(2, height * 0.004);
  const flap = 0.6 + 0.4 * Math.abs(Math.sin(time * Math.PI * 2 * (reduced ? 1 : 2)));
  ctx.fillStyle = 'rgb(255 255 255 / 0.85)';
  for (const dx of [-0.2, 0.25]) {
    ctx.beginPath();
    ctx.ellipse(r * dx, -r * 0.6, r * 0.32, r * 0.5 * flap, dx * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.7, r * 0.52, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#3a2a1a';
  for (const dx of [-0.3, 0.05]) ctx.fillRect(r * dx, -r, r * 0.16, r * 2);
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.7, r * 0.52, 0, 0, Math.PI * 2);
  ctx.stroke();
  // A smiling face at the front.
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(r * 0.42, -r * 0.1, r * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(r * 0.38, r * 0.08, r * 0.14, 0.2, Math.PI - 0.6);
  ctx.stroke();
  ctx.restore();
  if (bee.honey) drawHoneyPot(ctx, bee.x, bee.y + r * 0.95, r * 0.45, height);
}

/**
 * One name at a time, so they never pile up. A name only starts once its thing can be seen, and only
 * then counts as shown, in shown. What's new at this level goes first, and waits for as long as it
 * takes. An older one that's waited a while is let go, to come again with the next of its kind.
 */
function stepLabels(labels, dt, fresh, shown) {
  if (labels.length && !labels[0].started) {
    const ready = labels.filter((label) => label.at() !== null);
    const next = ready.find((label) => fresh.has(label.key)) ?? ready[0];
    if (next) {
      const { x, y } = next.at();
      Object.assign(next, { started: true, last: { x, y } });
      shown.add(next.key);
      labels = [next, ...labels.filter((label) => label !== next)];
    }
  }
  for (const label of labels) {
    if (label.started) label.t += dt;
    else label.wait = (label.wait ?? 0) + dt;
  }
  return labels.filter((label) => (label.started ? label.t < LABEL_SECONDS : fresh.has(label.key) || label.wait < LABEL_WAIT));
}

/** A new thing's name in a little rounded box above it, fading in and out, with a soft ring. */
function drawLabel(ctx, label, text, now, width, height, lasts) {
  // Where its thing is, or was last, if it's just gone. The ring follows it, and the name stays
  // where it first came, so nothing bright moves quickly.
  const at = now ?? label.last;
  if (!at) return;
  label.last = { x: at.x, y: at.y };
  label.home ??= { x: at.x, y: at.y };
  const fade = Math.min(1, label.t / 0.4, (lasts - label.t) / 0.6);
  if (fade <= 0) return;
  const font = Math.round(height * 0.03);
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.strokeStyle = 'rgb(255 236 150 / 0.9)';
  ctx.lineWidth = Math.max(3, height * 0.006);
  ctx.beginPath();
  ctx.arc(at.x, at.y, height * (0.075 + 0.01 * Math.min(1, label.t)), 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = `600 ${font}px Fredoka, system-ui, sans-serif`;
  const wide = ctx.measureText(text).width + font * 1.2;
  const x = Math.min(width - wide / 2 - 8, Math.max(wide / 2 + 8, label.home.x));
  // Above its thing, or below it near the top, where the camera's picture is.
  const above = label.home.y - height * 0.12 - Math.min(1, label.t) * height * 0.01;
  const y = above < height * 0.24 ? label.home.y + height * 0.12 : above;
  ctx.fillStyle = '#fffaf0';
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(2, height * 0.004);
  ctx.beginPath();
  ctx.roundRect(x - wide / 2, y - font * 0.85, wide, font * 1.7, font * 0.85);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + font * 0.05);
  ctx.restore();
}
