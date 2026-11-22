// The garden: each place's picture, the web, the spiders playing, and the glove that catches them and
// carries them home. Giraffe is 3D, on his own canvas between the garden and everything else. The spiders
// play on the side of the hand in play, and their web is across from them, so bringing one home is a
// reach across.
//
// The higher levels bring more to it (spiders.js): berries left where a spider was caught, a ladybird
// who goes home to her flower, sleepy spiders to wake, a butterfly that slows everyone down, a basket for
// two, treasure chests, two webs of different colours, leaf boats and a golden spider.
//
// Nothing flashes: seizures are more common in children with hemiplegia. Colours stay steady, a web
// fills in slowly, places fade into each other over more than a second, and legs only patter. New things
// only move, grow or fade, slowly.
//
// With friends, it's the same garden on everyone's screen, and each friend's glove is in it in light grey,
// carrying whatever spider it caught: see setShared, and friends.js for how it's shared.
import { Glove, INK, SECOND_PLAYER, inOnePicture, secondPlayerLook } from '../../core/glove.js';
import { pictureChanged, pictureSize } from '../../core/seat.js';
import { acrossGardens, answerFor, catchKey, homeBits, placeRandom, readFriend, readKey } from './friends.js';
import {
  BASKET_HOLDS, BERRY, BUTTERFLY, CATCH_REACH, CHEST_BERRIES, CHEST_SECONDS, Catching, DASH, GOLDEN_BERRIES, SLEEP_MOST,
  SPIDER_SIZE, WAKE_SECONDS, WEB_REACH, AWAY_SECONDS, Wandering, friendsGardenAt, gardenAt, pathFor, spidersFor, spiderAt, spotFor, visitorsAt, webAt,
} from './spiders.js';

const PALM_SHARE = 0.105;
const WEB_SIZE = 0.15; // The web's radius, in screen heights.
const WEB_ACROSS = 0.38; // Where the web hangs, across the screen from the side Giraffe is on.
const WEB_DOWN = 0.5;
const GARDEN_ACROSS = 0.76; // The middle of where the spiders play, with no help reaching.
const GARDEN_DOWN = 0.55;
const BRANCH_DOWN = 0.17; // The branch the swinging spiders hang from.
const REACH_HELP = { none: 0, little: 0.06, lots: 0.12 }; // How much nearer the spiders play, in screen widths.
const ARRIVE_SECONDS = 0.5;
const RETURN_SECONDS = 0.9;
const LAND_SECONDS = 0.45;
const FILL_RATE = 1.2; // How quickly a web fills in, as a share a second.
const SHY_REACH = 1.3; // A shy spider notices a hand this much further off than one can catch it.
const BEHIND = 0.55; // How far behind its twin the second of a pair is, along their path.
const FURTHEST = 0.2; // A spider's path stays within this of the middle of its garden, in screen heights.
const PLACE_HOLD = 0.6; // A moment to see the full web, before moving on.
const MOVE_SECONDS = 1.4; // From one place to the next.
const COLOURS = ['#ff7eb6', '#5fc3ff', '#ffc93c', '#6ad98b', '#b48cff', '#ff9a52'];
const LEGS = [-0.95, -0.45, 0.05, 0.55]; // Leg angles from straight out, on each side.
// Two webs, from level 8: a pink one above and a blue one below, a little smaller, and the spiders the
// colour of the web they live in.
// Two webs, one above the other, far enough apart that their drop areas don't meet.
const TWO_WEBS = { size: 0.12, reach: 0.17, downs: [0.31, 0.69] };
const WEB_COLOURS = ['#ff7eb6', '#5fc3ff'];
const GOLD = '#ffcf3f';
// The ladybird's flower, between the web and where the spiders play, down in the grass.
const FLOWER = { across: 0.5, down: 0.81, reach: 0.17, size: 0.07 };
const GROUND = 0.8; // Where a basket, a chest or a resting butterfly sits, in screen heights.
const BERRY_SIZE = 0.028;
const PRIZE_FLY_SECONDS = 0.7;
const LABEL_SECONDS = 2.2;
const BASKET_AFTER = 2; // Seconds after arriving at a place before the basket, chest or butterfly come.
const CHEST_AFTER = 1.2;
const BUTTERFLY_AFTER = 3;
// The little label each new thing gets the first time it comes along, in English and Georgian.
const LABELS = {
  berry: ['Pick it up!', 'აიღე!'],
  ladybird: ['Take her to the flower!', 'ყვავილთან მიიყვანე!'],
  sleepy: ['Open your hand to wake it!', 'გაშალე ხელი, გააღვიძე!'],
  butterfly: ['Touch the butterfly!', 'შეეხე პეპელას!'],
  basket: ['Carry two!', 'ორი წაიღე!'],
  chest: ['Open your hand on it!', 'ზედ გაშალე ხელი!'],
  webs: ['Same colour web!', 'იმავე ფერის ქსელში!'],
  boat: ['Leaf boat!', 'ფოთლის ნავი!'],
  golden: ['Golden spider!', 'ოქროს ობობა!'],
  shy: ['Shy!', 'მორცხვია!'],
  twins: ['Holding hands!', 'ხელჩაკიდებულები!'],
  away: ['Catch it before it gets away!', 'დაიჭირე, სანამ გაიქცევა!'],
};

// With friends, where a friend's glove is goes from their screen to this one through the garden a child playing with
// the right hand, with a little reach help, sees on a wide screen: see toCommon and acrossGardens in friends.js.
const COMMON = { aspect: 16 / 9, help: REACH_HELP.little };
const COMMON_MIDDLE = (GARDEN_ACROSS - COMMON.help - WEB_ACROSS) * COMMON.aspect; // From the web, in screen heights.
const NO_VISITORS = { ladybird: false, butterfly: false, chest: false, basket: false };
// A friend's glove: solid, as a see-through one shows its outline through itself, and only fading as it comes and goes.
const FRIEND_GLOVE = { fill: '#e3e8ee', ink: '#9aa8b6' };
const isHome = ({ state }) => state === 'home' || state === 'landing';

const LOOKS = {
  gate: { sky: ['#8fd3ff', '#e9f8ff'], far: '#a8dc8a', near: '#7cc65e', leaves: '#4f9f47' },
  carrots: { sky: ['#9bd8ff', '#f1fbff'], far: '#b9e08c', near: '#86c95c', leaves: '#5aa84a' },
  honey: { sky: ['#ffd9a8', '#fff5df'], far: '#c6dd8a', near: '#93c860', leaves: '#5f9e3f' },
  pond: { sky: ['#a6dcff', '#f0faff'], far: '#a5d9a0', near: '#7cc36a', leaves: '#4a9a50' },
  house: { sky: ['#ffc9a0', '#fff1dc'], far: '#b6d98e', near: '#8bc867', leaves: '#4e9d4c' },
};

const ease = (share) => share * share * (3 - 2 * share);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** A colour made darker or lighter by an amount from -1 to 1. */
function shade(hex, amount) {
  const value = parseInt(hex.slice(1), 16);
  const channels = [value >> 16, (value >> 8) & 255, value & 255].map((channel) =>
    Math.round(amount < 0 ? channel * (1 + amount) : channel + (255 - channel) * amount));
  return `rgb(${channels.join(' ')})`;
}

/**
 * A spider's round body and friendly face, about 200 across, drawn once for each colour. Its legs are
 * drawn as it moves. Big eyes, rosy cheeks and a smile, and nothing pointy.
 */
function paintSpider(colour, { asleep = false, golden = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 240;
  canvas.height = 240;
  const ctx = canvas.getContext('2d');
  ctx.translate(120, 120);
  ctx.lineWidth = 7;
  ctx.strokeStyle = INK;
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.ellipse(0, 6, 96, 90, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // A lighter tummy, and a shine on top.
  ctx.fillStyle = shade(colour, 0.35);
  ctx.beginPath();
  ctx.ellipse(0, 52, 58, 34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgb(255 255 255 / 0.45)';
  ctx.beginPath();
  ctx.ellipse(-46, -46, 18, 11, -0.6, 0, Math.PI * 2);
  ctx.fill();
  // Big eyes.
  for (const x of [-34, 34]) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(x, -12, 28, 32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(x + 4, -6, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x + 9, -13, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  if (asleep) {
    // Eyes closed, in two gentle curves.
    for (const x of [-34, 34]) {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.ellipse(x, -12, 31, 35, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(x, -16, 16, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }
  }
  if (golden) {
    // A little crown, with round tips.
    ctx.fillStyle = '#fff1a8';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-34, -70);
    ctx.lineTo(-38, -104);
    ctx.lineTo(-14, -86);
    ctx.lineTo(0, -110);
    ctx.lineTo(14, -86);
    ctx.lineTo(38, -104);
    ctx.lineTo(34, -70);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // Rosy cheeks and a smile.
  ctx.fillStyle = 'rgb(255 120 140 / 0.55)';
  for (const x of [-62, 62]) {
    ctx.beginPath();
    ctx.ellipse(x, 24, 14, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 24, 22, 0.25 * Math.PI, 0.75 * Math.PI);
  ctx.stroke();
  return canvas;
}

/** A ladybird, round and red with black spots, a friendly face and nothing pointy. */
function paintLadybird() {
  const canvas = document.createElement('canvas');
  canvas.width = 240;
  canvas.height = 240;
  const ctx = canvas.getContext('2d');
  ctx.translate(120, 120);
  ctx.lineWidth = 7;
  ctx.strokeStyle = INK;
  // Her head, at the top.
  ctx.fillStyle = '#3a2b33';
  ctx.beginPath();
  ctx.ellipse(0, -62, 56, 42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ff5a4f';
  ctx.beginPath();
  ctx.ellipse(0, 18, 92, 84, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -62);
  ctx.lineTo(0, 100);
  ctx.stroke();
  ctx.fillStyle = '#3a2b33';
  for (const [x, y, r] of [[-46, -4, 17], [46, -4, 17], [-40, 52, 14], [40, 52, 14], [-14, 82, 9], [14, 82, 9]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgb(255 255 255 / 0.45)';
  ctx.beginPath();
  ctx.ellipse(-44, -36, 18, 10, -0.6, 0, Math.PI * 2);
  ctx.fill();
  for (const x of [-22, 22]) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(x, -68, 15, 17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(x + 3, -65, 8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, -52, 12, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();
  return canvas;
}

/** A small picture drawn once from an emoji: a berry, the butterfly or the basket. */
function paintMark(mark) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.font = '100px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(mark, 64, 70);
  return canvas;
}

export class Garden {
  /** events: onCatch(), onHome(side), onLetGo(), onDash(), onArrive(), onMoved() */
  constructor({ backdrop, canvas }, events = {}) {
    this.backdropCanvas = backdrop;
    this.back = backdrop.getContext('2d', { alpha: false });
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.events = events;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.gloves = { left: new Glove('left'), right: new Glove('right') };
    this.bodies = COLOURS.map((colour) => paintSpider(colour));
    this.sleepers = COLOURS.map((colour) => paintSpider(colour, { asleep: true }));
    // A golden spider is never sleepy, so it only has a waking face.
    this.goldBody = paintSpider(GOLD, { golden: true });
    this.ladybirdBody = paintLadybird();
    this.marks = { berry: paintMark('🍓'), butterfly: paintMark('🦋'), basket: paintMark('🧺'), flower: paintMark('🌼') };
    this.language = () => 'en';
    this.berries = [];
    this.flying = [];
    this.labels = [];
    this.introduced = new Set();
    this.helpers = { basket: null, chest: null, butterfly: null };
    this.oldHelpers = null; // The last place's, fading as the next place comes.
    this.slow = 1;
    this.playTime = 0;
    this.webHome = [0, 0];
    this.webCount = [0, 0];
    this.fills = [0, 0];
    this.webGlow = null;
    this.visitors = visitorsAt('gate', 1);
    this.picked = { left: 0, right: 0 }; // Berries picked by each hand.
    this.ladybirds = { left: 0, right: 0 }; // Ladybirds taken home by each hand.
    this.prizeTarget = () => ({ x: 80, y: 40 });
    this.catching = new Catching();
    this.level = gardenAt(1);
    this.levelNumber = 1;
    this.gentle = false; // The garden as it always was, where no spider ever gets away: see gardenAt.
    this.wandering = new Wandering();
    this.side = 'right';
    this.reach = 'little';
    this.aspect = 16 / 9;
    this.time = 0;
    this.spiders = [];
    this.waiting = [];
    this.count = 0;
    this.homeHere = 0;
    this.place = 'gate';
    this.fromPlace = null;
    this.fade = 1;
    this.moving = 0;
    this.holdFor = 0;
    this.oldWeb = null;
    this.home = { left: 0, right: 0 };
    this.lastHand = { open: false, closed: false };
    // Playing with friends: see setShared.
    this.shared = null;
    this.placeIndex = 0;
    this.friendsGloves = []; // Each friend's glove, as [{ id, name, glove, fade }], which main.js keeps up to date.
    this.early = []; // Claims for spiders that aren't out here yet, as when a friend's game is a moment ahead.
    this.leftBits = 0; // Which spiders are home at the place being left, while the next one comes.
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /**
   * The garden is as big as the picture its player sees it in. Two on one screen in one picture, the second player's
   * game goes on under the first one's, in a window half as wide, and its garden is laid out as big as the first
   * one's, which the player sees: otherwise its web would be somewhere else, and they'd open their hand at the web they
   * see and their spider would only go back to playing. See pictureSize in core/seat.js. The canvases are as big as
   * the window, and show as much of the garden as fits in it.
   */
  resize() {
    ({ width: this.width, height: this.height } = pictureSize());
    this.ratio = Math.min(window.devicePixelRatio || 1, 2);
    for (const canvas of [this.backdropCanvas, this.canvas]) {
      canvas.width = Math.round(window.innerWidth * this.ratio);
      canvas.height = Math.round(window.innerHeight * this.ratio);
    }
    this.palmSize = Math.max(44, this.height * PALM_SHARE);
    this.scenes = {};
  }

  /** Which way is away from Giraffe: 1 when the spiders play on the right. */
  get way() {
    return this.side === 'right' ? 1 : -1;
  }

  /** Across the screen, in pixels, from the side Giraffe is on. */
  across(share) {
    return (this.side === 'right' ? share : 1 - share) * this.width;
  }

  get spiderSize() {
    return this.height * SPIDER_SIZE;
  }

  get catchReach() {
    return this.palmSize * CATCH_REACH + this.spiderSize;
  }

  /** The middle of where the spiders play. */
  get gardenMiddle() {
    return { x: this.across(GARDEN_ACROSS - REACH_HELP[this.reach]), y: this.height * GARDEN_DOWN };
  }

  /** Where the web is now, as it may be swaying from the higher levels. With two, it's the pink one. */
  get web() {
    return this.webs[0];
  }

  /** The webs: one, or from level 8 two, a pink one and a blue one, swaying together. */
  get webs() {
    const sway = webAt(this.level.webSway, this.time, this.reducedMotion);
    const x = this.across(WEB_ACROSS) + sway.x * this.height;
    if (this.level.webs < 2) {
      return [{ x, y: this.height * WEB_DOWN + sway.y * this.height, r: this.height * WEB_SIZE, reach: this.height * WEB_REACH, index: 0, colour: null }];
    }
    return TWO_WEBS.downs.map((down, index) => ({
      x, y: this.height * down + sway.y * this.height, r: this.height * TWO_WEBS.size, reach: this.height * TWO_WEBS.reach, index, colour: WEB_COLOURS[index],
    }));
  }

  /** The web a spider lives in. */
  webOf(spider) {
    const { webs } = this;
    return webs[Math.min(spider.web ?? 0, webs.length - 1)];
  }

  /** Where the ladybird's flower is, down in the grass between the web and the garden. */
  get flower() {
    // Help reaching brings it nearer, but with two webs only half as far, so it stays clear of the lower
    // web. That leaves the ladybird's carry a little shorter, never longer.
    const nearer = REACH_HELP[this.reach] * (this.level.webs > 1 ? 0.25 : 0.5);
    return { x: this.across(FLOWER.across - nearer), y: this.height * FLOWER.down, r: this.height * FLOWER.size, reach: this.height * FLOWER.reach };
  }

  /** How full a web is, from 0 to 1: the first one's, or the one asked for. */
  get fill() {
    return this.fills[0];
  }

  /** What this level brings: see gardenAt in spiders.js. With friends, it's the plain garden at that level. */
  setLevel(level) {
    this.levelNumber = level;
    this.level = this.shared ? friendsGardenAt(level) : gardenAt(level, { gentle: this.gentle });
    // A new game: nobody has got away yet.
    this.wandering = new Wandering({ after: this.level.awayAfter });
  }

  /** How many spiders have got away this game. */
  get gotAway() {
    return this.wandering.away;
  }

  /**
   * Playing with friends, everyone's garden has the same spiders, going round by the same clock, and what happens to
   * them is shared: see friends.js. shared is { seed, clock(), me, claim(k) }: the seed every game was given, the
   * seconds since the game started, the same on every computer, this player's id, and a way to claim a spider
   * caught. Or it's null, on their own. The level is set after, with setLevel.
   */
  setShared(shared) {
    this.shared = shared;
    this.friendsGloves = [];
    this.early = [];
  }

  /** How many spiders this child has brought home, with either hand. */
  get mine() {
    return this.home.left + this.home.right;
  }

  /** Which spiders are home at this place, a bit each, for friends' games: see readFriend in friends.js. */
  get homeBits() {
    return this.moving > 0 ? this.leftBits : homeBits(this.spiders);
  }

  /**
   * A new place: its web is empty, and the first spiders come out to play straight away. index is which place it is
   * in the game, which friends' games know each of its spiders by.
   */
  arriveAt(place, count, index = 0) {
    this.placeIndex = index;
    this.place = place;
    this.fromPlace = null;
    this.fade = 1;
    this.moving = 0;
    this.oldWeb = null;
    this.oldHelpers = null;
    this.count = count;
    this.homeHere = 0;
    this.webHome = [0, 0];
    this.fills = [0, 0];
    this.webGlow = null;
    this.spiders = [];
    this.visitors = this.shared ? NO_VISITORS : visitorsAt(place, this.levelNumber);
    this.catching = new Catching();
    // With friends, the same spiders as on every friend's screen, from the game's seed. Each knows where it comes in
    // the line, which is how friends' games know it.
    const random = this.shared ? placeRandom(this.shared.seed, index) : Math.random;
    this.waiting = spidersFor(count, this.levelNumber, random, { ladybird: this.visitors.ladybird, at: this.level }).map((plan, order) => ({ ...plan, index: order }));
    // At two webs, each spider is the colour of the web it lives in.
    if (this.level.webs > 1) for (const plan of this.waiting) if (plan.web !== null) plan.colour = plan.web;
    this.webCount = [0, 1].map((index) => this.waiting.filter((plan) => plan.kind !== 'ladybird' && (plan.web ?? 0) === index).length);
    this.helpers = {
      basket: this.visitors.basket ? { state: 'coming', in: BASKET_AFTER, alpha: 0 } : null,
      chest: this.visitors.chest ? { state: 'coming', in: CHEST_AFTER, alpha: 0, hold: 0 } : null,
      butterfly: this.visitors.butterfly ? { state: 'coming', in: BUTTERFLY_AFTER, alpha: 0, t: 0, wait: 0 } : null,
    };
    this.slow = 1;
    this.wandering.settle();
    this.letOut();
  }

  /** Off to the next place, with this one's full web fading as the next one comes. */
  moveOn() {
    this.holdFor = PLACE_HOLD;
  }

  /** Brings out more spiders while there are fewer playing than the level has at once. */
  letOut() {
    const playing = () => this.spiders.filter(({ state }) => state !== 'home' && state !== 'landing').length;
    while (this.waiting.length && playing() < this.level.atOnce) {
      const used = new Set(this.spiders.filter(({ state }) => state !== 'home' && state !== 'landing').map(({ slot }) => slot));
      const plan = this.waiting.shift();
      // With friends, each has a spot of its own, so it plays in the same one on every screen, whatever order the
      // others went home in. On their own, the first free spot.
      let slot = this.shared ? plan.index : 0;
      while (!this.shared && used.has(slot)) slot += 1;
      const spider = this.makeSpider(plan, slot);
      this.spiders.push(spider);
      // Twins come out together.
      if (this.waiting[0]?.behind && plan.pair !== null) {
        const twin = this.waiting.shift();
        this.spiders.push(this.makeSpider(twin, slot, spider.path));
        this.introduce('twins', spider);
      }
    }
    // A friend may have caught one of these already, if their game let it out a moment sooner.
    if (this.shared && this.early.length) this.tryEarly();
  }

  makeSpider(plan, slot, leader = null) {
    const path = leader
      ? { ...leader, phase: leader.phase - BEHIND }
      : pathFor({ kind: plan.kind === 'ladybird' ? 'scuttle' : plan.kind, centre: spotFor(slot), phase: plan.phase, level: this.levelNumber, at: this.level });
    const spider = {
      ...plan,
      slot,
      path,
      shift: { x: 0, y: 0 },
      state: plan.sleepy ? 'asleep' : 'playing',
      alpha: 0,
      x: 0,
      y: 0,
      dash: null,
      dashed: false,
      back: null,
      land: null,
      spot: null,
      legs: Math.random() * Math.PI * 2,
      speed: 0,
      asleepFor: 0,
      // When on its path's clock it fell asleep, as its path waits for it while it sleeps.
      sleptAt: plan.sleepy ? this.playTime : null,
      waking: 0,
      // With friends: whose glove it's in, how many times it has been caught and let go, and whether the server has
      // still to say if this child's catch was first. See friends.js.
      holder: null,
      catches: 0,
      pending: false,
    };
    this.placeOnPath(spider);
    this.events.onArrive?.();
    // The first time each new kind comes along, it gets a little label.
    if (plan.kind === 'ladybird') this.introduce('ladybird', spider);
    else if (plan.kind === 'boat') this.introduce('boat', spider);
    if (plan.golden) this.introduce('golden', spider);
    if (plan.sleepy) this.introduce('sleepy', spider);
    if (plan.shy) this.introduce('shy', spider);
    if (this.level.webs > 1 && plan.web !== null) this.introduce('webs', spider);
    return spider;
  }

  /**
   * Where a spider is on its path, in pixels: now, or at another time on the path's clock. The clock
   * slows while the butterfly is out.
   */
  pathPoint(spider, time = this.playTime) {
    const at = spiderAt(spider.path, time);
    const middle = this.gardenMiddle;
    return {
      x: middle.x + this.way * (at.x + spider.shift.x) * this.height,
      y: middle.y + (at.y + spider.shift.y) * this.height,
    };
  }

  placeOnPath(spider, time = this.playTime) {
    const { x, y } = this.pathPoint(spider, time);
    spider.x = x;
    spider.y = y;
  }

  /** Whether a spider can be caught now: out playing, or heading off, and not asleep, dashing off or scurrying back. */
  catchable(spider) {
    return (spider.state === 'playing' || spider.state === 'leaving') && spider.alpha >= 0.5;
  }

  /**
   * Nobody has played with the spiders for a while: the one furthest from the hand heads for the edge of the garden,
   * away from the web. It can still be caught all the way there. Returns whether one went.
   */
  headOff() {
    const glove = this.gloves[this.side];
    const free = this.spiders.filter((spider) => spider.state === 'playing' && spider.alpha >= 1);
    if (!free.length) return false;
    const gap = (spider) => Math.hypot(spider.x - glove.x, spider.y - glove.y);
    const spider = free.reduce((best, each) => (gap(each) > gap(best) ? each : best));
    const edge = this.across(1) + this.way * this.spiderSize * 3;
    spider.state = 'leaving';
    spider.leave = { x: spider.x, y: spider.y, to: edge, t: 0, seconds: this.level.awayRun * (this.reducedMotion ? 1.2 : 1) };
    this.introduce('away', spider);
    this.events.onHeadOff?.(spider);
    return true;
  }

  isNear(spider, glove, reach = this.catchReach) {
    return Math.hypot(spider.x - glove.x, spider.y - glove.y) <= reach;
  }

  /** The nearest spider a hand is by, if any. It's about the hand being there, not fingertips touching. */
  spiderNear(glove) {
    let best = null;
    let bestGap = Infinity;
    for (const spider of this.spiders) {
      if (!this.catchable(spider) || !this.isNear(spider, glove)) continue;
      const gap = Math.hypot(spider.x - glove.x, spider.y - glove.y);
      if (gap < bestGap) {
        best = spider;
        bestGap = gap;
      }
    }
    return best;
  }

  get holding() {
    return this.catching.held ?? this.catching.stash[0] ?? null;
  }

  /** Whether the hand is where what it's carrying goes home: its web, or the ladybird's flower. */
  get onWeb() {
    const carried = this.holding;
    return carried ? this.atHomeOf(carried) : this.atHome(this.web);
  }

  atHome(home) {
    const glove = this.gloves[this.side];
    return glove.visible && Math.hypot(glove.x - home.x, glove.y - home.y) <= home.reach;
  }

  atHomeOf(spider) {
    // The golden spider is welcome in either web.
    if (spider.golden) return this.webs.some((web) => this.atHome(web));
    return this.atHome(spider.kind === 'ladybird' ? this.flower : this.webOf(spider));
  }

  /** At the other web, of two: the wrong colour for this spider. */
  atOtherWeb(spider) {
    if (spider.kind === 'ladybird' || spider.golden || this.level.webs < 2) return null;
    const other = this.webs.find((web) => web.index !== this.webOf(spider).index);
    return this.atHome(other) ? other : null;
  }

  update(dt, snapshot, { aspect = this.aspect, playing = false, showHands = false } = {}) {
    // A seat's game going under the one picture two share on one screen, or coming back out, is laid out again.
    if (pictureChanged(this)) this.resize();
    this.time += dt;
    // With friends, the spiders go round by the clock every friend's game has, so they're in step on every screen.
    this.playTime = this.shared ? this.shared.clock() : this.playTime + dt * this.slow;
    this.aspect = aspect;
    for (const side of ['left', 'right']) {
      const glove = this.gloves[side];
      if (showHands && snapshot?.side === side) glove.follow(snapshot[side], dt, this);
      else glove.hide();
    }
    for (const index of [0, 1]) {
      const wanted = this.webCount[index] ? this.webHome[index] / this.webCount[index] : 0;
      this.fills[index] += Math.sign(wanted - this.fills[index]) * Math.min(Math.abs(wanted - this.fills[index]), dt * FILL_RATE);
    }
    this.moveAlong(dt);
    for (const spider of this.spiders) this.moveSpider(spider, dt);
    if (this.shared) this.followFriends();
    this.updateExtras(dt, snapshot, playing && this.moving === 0);
    if (playing && this.moving === 0) {
      this.noticeHand();
      this.handleHand(dt, snapshot);
      // Spiders nobody plays with wander off, but only while the hand is in the picture, and never between places.
      const settled = this.holdFor > 0 || this.homeHere >= this.count;
      if (!settled && this.wandering.tick(dt, { seen: this.gloves[this.side].visible }) && !this.headOff()) {
        // None free to go just now, as when they're all asleep: the next that is goes.
        this.wandering.since = this.wandering.after;
      }
    }
  }

  /** From one place to the next: a moment with the full web, then the next place fading in. */
  moveAlong(dt) {
    if (this.holdFor > 0) {
      this.holdFor -= dt;
      if (this.holdFor <= 0) {
        this.holdFor = 0;
        this.events.onLeave?.();
      }
      return;
    }
    if (this.moving > 0) {
      this.moving = Math.max(0, this.moving - dt);
      this.fade = 1 - this.moving / MOVE_SECONDS;
      if (this.moving === 0) {
        this.fromPlace = null;
        this.oldWeb = null;
        this.oldHelpers = null;
        this.events.onMoved?.();
      }
    }
  }

  /** The garden starts changing to the next place, which has its own web. */
  goTo(place) {
    this.fromPlace = this.place;
    this.place = place;
    this.leftBits = homeBits(this.spiders);
    this.oldWeb = { spiders: this.spiders.filter(({ state }) => state === 'home'), fills: [...this.fills], flower: this.visitors.ladybird, stream: this.stream };
    // The next place's things fade in as this one's fade out, so its flower comes and goes gently.
    this.visitors = this.shared ? NO_VISITORS : visitorsAt(place, this.levelNumber);
    this.spiders = [];
    this.count = 0;
    this.homeHere = 0;
    this.webHome = [0, 0];
    this.webCount = [0, 0];
    this.fills = [0, 0];
    this.fade = 0;
    this.moving = MOVE_SECONDS;
    this.catching = new Catching();
    // What wasn't picked up fades, at no cost, and the helpers stay behind, fading with the place.
    for (const berry of this.berries) berry.going = true;
    this.oldHelpers = this.helpers;
    this.helpers = { basket: null, chest: null, butterfly: null };
    this.slow = 1;
  }

  /** Where a spider sits once it's home: in its web, or on the ladybird's flower. */
  homeSpot(spider, webs = this.webs) {
    if (spider.kind === 'ladybird') {
      const { flower } = this;
      return { x: flower.x, y: flower.y - flower.r * 0.5 };
    }
    return this.spotInWeb(spider.spot, webs[Math.min(spider.web ?? 0, webs.length - 1)]);
  }

  moveSpider(spider, dt) {
    spider.alpha = Math.min(1, spider.alpha + dt / ARRIVE_SECONDS);
    const lastX = spider.x;
    const lastY = spider.y;
    if (spider.stretch > 0) spider.stretch = Math.max(0, spider.stretch - dt);
    if (spider.state === 'asleep') {
      // It stays where it is, until a hand wakes it, or it wakes by itself. Its path waits for it, at
      // the moment it fell asleep, and it's put on it each time, so a hand switched over or more help
      // reaching moves it with the garden.
      spider.sleptAt ??= this.playTime;
      this.placeOnPath(spider, spider.sleptAt);
      spider.asleepFor += dt;
      if (spider.asleepFor >= SLEEP_MOST) this.wake(spider);
    }
    if (spider.state === 'dashing') {
      const { dash } = spider;
      dash.t += dt;
      const share = ease(Math.min(1, dash.t / dash.seconds));
      spider.shift = { x: dash.from.x + (dash.to.x - dash.from.x) * share, y: dash.from.y + (dash.to.y - dash.from.y) * share };
      if (dash.t >= dash.seconds) {
        spider.state = 'playing';
        spider.dash = null;
      }
    }
    if (spider.state === 'playing' || spider.state === 'dashing') {
      this.placeOnPath(spider);
    } else if (spider.state === 'leaving') {
      // Heading for the edge of the garden, at a steady scuttle. Out of sight there, it has got away.
      const { leave } = spider;
      leave.t += dt;
      const share = Math.min(1, leave.t / leave.seconds);
      spider.x = leave.x + (leave.to - leave.x) * share;
      spider.y = leave.y + Math.sin(share * Math.PI) * this.spiderSize * 0.6;
      if (leave.t >= leave.seconds) {
        spider.state = 'away';
        spider.awayFor = 0;
        spider.leave = null;
        this.events.onGotAway?.(this.wandering.gotAway());
      }
    } else if (spider.state === 'away') {
      // Out of sight for a moment, and then back to playing on its own path, fading in.
      spider.alpha = 0;
      spider.awayFor += dt;
      if (spider.awayFor >= AWAY_SECONDS) {
        spider.state = 'playing';
        spider.shift = { x: 0, y: 0 };
        this.placeOnPath(spider);
      }
    } else if (spider.state === 'returning') {
      const { back } = spider;
      back.t += dt;
      const share = ease(Math.min(1, back.t / RETURN_SECONDS));
      const to = this.pathPoint(spider);
      spider.x = back.x + (to.x - back.x) * share;
      spider.y = back.y + (to.y - back.y) * share;
      if (back.t >= RETURN_SECONDS) {
        spider.state = 'playing';
        spider.back = null;
      }
    } else if (spider.state === 'landing') {
      const { land } = spider;
      land.t += dt;
      const share = ease(Math.min(1, land.t / LAND_SECONDS));
      const to = this.homeSpot(spider);
      spider.x = land.x + (to.x - land.x) * share;
      spider.y = land.y + (to.y - land.y) * share;
      if (land.t >= LAND_SECONDS) spider.state = 'home';
    } else if (spider.state === 'home') {
      const to = this.homeSpot(spider);
      spider.x = to.x;
      spider.y = to.y;
    }
    if (dt > 0) {
      const speed = Math.hypot(spider.x - lastX, spider.y - lastY) / this.height / dt;
      spider.speed += (speed - spider.speed) * Math.min(1, dt * 8);
    }
    // Legs patter while it moves, about once or twice a second, never quicker.
    const resting = spider.state === 'home' || spider.state === 'asleep';
    spider.legs += dt * (resting ? 1.5 : 3 + Math.min(4, spider.speed * 40)) * (this.reducedMotion ? 0.5 : 1);
  }

  /**
   * A sleepy spider wakes, with a stretch, and plays on from right where it is, so the hand that woke
   * it can catch it straight away. Its path waited for it, so it carries on round its own loop from
   * there, in its own part of the garden.
   */
  wake(spider) {
    if (spider.sleptAt != null) spider.path.phase -= spider.path.rate * (this.playTime - spider.sleptAt);
    spider.sleptAt = null;
    spider.state = 'playing';
    spider.sleepy = false;
    spider.stretch = 0.6;
    this.events.onWake?.();
  }

  /** Where in the web a spider sits once it's home, from the middle out, round and round. */
  spotInWeb(spot, web = this.web) {
    const angle = -Math.PI / 2 + spot * 2.4;
    const out = web.r * (0.32 + 0.12 * (spot % 3));
    return { x: web.x + Math.cos(angle) * out, y: web.y + Math.sin(angle) * out };
  }

  /** From the higher levels, a shy spider scuttles a little way off the first time a hand comes near. */
  noticeHand() {
    const glove = this.gloves[this.side];
    if (!glove.visible) return;
    for (const spider of this.spiders) {
      if (!spider.shy || spider.dashed || spider.state !== 'playing' || !this.catchable(spider) || this.holding === spider) continue;
      if (!this.isNear(spider, glove, this.catchReach * SHY_REACH)) continue;
      const away = { x: spider.x - glove.x, y: spider.y - glove.y };
      const length = Math.hypot(away.x, away.y) || 1;
      // In path terms, which are mirrored for the left hand.
      const to = {
        x: spider.shift.x + ((this.way * away.x) / length) * DASH.distance,
        y: spider.shift.y + (away.y / length) * DASH.distance,
      };
      // It stays in its part of the garden.
      to.x = clamp(spider.path.cx + to.x, -FURTHEST, FURTHEST) - spider.path.cx;
      to.y = clamp(spider.path.cy + to.y, -FURTHEST, FURTHEST) - spider.path.cy;
      spider.state = 'dashing';
      spider.dashed = true;
      spider.dash = { from: { ...spider.shift }, to, t: 0, seconds: DASH.seconds * (this.reducedMotion ? 1.5 : 1) };
      this.events.onDash?.();
    }
  }

  /**
   * How sure the hand in play is. Only a hand the tracker is sure of counts as open or closed, so a hand
   * at the edge, too far off or overlapping the other is neither, and does neither.
   */
  readHand(snapshot) {
    const hand = snapshot?.[this.side];
    if (!hand) return { open: false, closed: false };
    return {
      open: hand.status === 'open' && !snapshot.overlap,
      closed: hand.status === 'closed' && hand.reason === 'closed',
    };
  }

  handleHand(dt, snapshot) {
    const glove = this.gloves[this.side];
    const seen = glove.visible;
    const { open, closed } = this.readHand(snapshot);
    this.lastHand = { open, closed };
    const result = this.catching.update(dt, {
      seen,
      open,
      closed,
      near: seen ? this.spiderNear(glove) : null,
      // Each one carried goes home only where it lives, so at one of two webs, or at the ladybird's
      // flower, the other stays in the basket rather than being let go.
      onWeb: (spider) => this.atHomeOf(spider),
    });
    if (result === 'caught') {
      const spider = this.catching.held;
      spider.state = 'held';
      spider.leave = null;
      this.wandering.settle();
      if (this.shared) {
        // In this child's glove at once, and the server says whose it really is, if a friend closed on it too.
        Object.assign(spider, { holder: this.shared.me, pending: true });
        this.shared.claim(catchKey(this.placeIndex, spider.index, spider.catches));
      }
      // It leaves a berry behind on the leaf, to pick up on the way back.
      if (this.level.berries) this.dropBerry(spider.x, spider.y + this.spiderSize * 1.4);
      this.events.onCatch?.();
    } else if (result === 'home') {
      this.wandering.settle();
      for (const spider of this.catching.released) this.bringHome(spider);
    } else if (result === 'let-go') {
      for (const spider of this.catching.released) this.letGoOf(spider);
    } else if (result === 'stashed') {
      this.events.onStash?.();
    }
    const carried = this.catching.carried;
    carried.forEach((spider, index) => {
      // The one in the hand peeps out of it, and one in the basket sits in the basket below.
      const inBasket = spider !== this.catching.held;
      spider.x = glove.x + (inBasket ? this.way * this.palmSize * 0.25 * (index + 1) : 0);
      spider.y = glove.y + (inBasket ? this.palmSize * 0.95 : -this.palmSize * 0.15);
    });
  }

  /**
   * A spider let go of scurries back to playing. At the other of two webs, its own web glows softly. by is the friend
   * who let it go, with friends, or null for this child.
   */
  letGoOf(spider, by = null) {
    const wrong = !by && this.atOtherWeb(spider);
    spider.state = 'returning';
    spider.back = { x: spider.x, y: spider.y, t: 0 };
    if (this.shared) {
      // Caught again, it's a new catch. One the server hasn't said was this child's yet only counts once it does.
      if (by || !spider.pending) spider.catches += 1;
      Object.assign(spider, { holder: null, pending: false });
    }
    if (wrong) {
      const web = this.webOf(spider);
      this.webGlow = { index: web.index, life: 1.6 };
    }
    this.events.onLetGo?.(by);
  }

  /** by is the friend who brought it home, with friends, or null for this child, whose it then is. */
  bringHome(spider, by = null) {
    if (this.catching.held === spider) this.catching.drop();
    spider.state = 'landing';
    spider.land = { x: spider.x, y: spider.y, t: 0 };
    if (spider.kind === 'ladybird') {
      spider.spot = 0;
      this.ladybirds[this.side] += 1;
    } else {
      // The golden spider stays in whichever web it was brought to.
      if (spider.golden) {
        const was = this.webOf(spider).index;
        spider.web = (this.webs.find((one) => this.atHome(one)) ?? this.webOf(spider)).index;
        // Each web still fills up all the way, with the golden one counted in the web it's in.
        if (spider.web !== was) {
          this.webCount[was] -= 1;
          this.webCount[spider.web] += 1;
        }
      }
      const web = this.webOf(spider).index;
      // With friends, each has its own spot in the web, as they can come home in any order on each screen.
      spider.spot = this.shared ? spider.index : this.webHome[web];
      this.webHome[web] += 1;
    }
    this.homeHere += 1;
    if (!by) this.home[this.side] += 1;
    Object.assign(spider, { holder: null, pending: false });
    // A golden spider brings a shower of berries home with it.
    if (spider.golden) {
      const at = this.homeSpot(spider);
      for (let i = 0; i < GOLDEN_BERRIES; i += 1) this.dropBerry(at.x, at.y, { armed: true, spread: (i - (GOLDEN_BERRIES - 1) / 2) * 0.7 });
    }
    this.events.onHome?.(this.side, by);
    this.letOut();
  }

  /* ---------- with friends: see friends.js ---------- */

  /**
   * The server says whose a spider is: the first hand to close on it, here or on a friend's computer. A claim for a
   * spider that isn't out here yet waits until it is.
   */
  claimed(k, by) {
    if (!this.shared) return;
    const { place, index, catches } = readKey(k);
    if (place < this.placeIndex) return;
    const spider = place === this.placeIndex && this.count > 0 ? this.spiders.find((each) => each.index === index) : null;
    if (!spider) {
      this.early.push({ k, by });
      return;
    }
    const answer = answerFor(spider, catches, by, this.shared.me);
    if (answer === 'mine') {
      Object.assign(spider, { catches, pending: false });
    } else if (answer === 'gone') {
      spider.catches = catches + 1;
    } else if (answer === 'theirs') {
      if (this.catching.held === spider) this.catching.drop();
      Object.assign(spider, { state: 'held', holder: by, catches, pending: false, back: null });
    }
  }

  tryEarly() {
    const early = this.early;
    this.early = [];
    for (const { k, by } of early) this.claimed(k, by);
  }

  /**
   * A friend's latest message, { z, h, m }: which place they're at, what's in their glove and which spiders are home
   * on their screen. One home there comes home here, and one they've let go of goes back to playing. If they're on
   * further in the garden, every spider here is home on their screen, so it's home here too.
   */
  fromFriend(id, { z, h, m }) {
    if (!this.shared || this.count === 0) return;
    if (z > this.placeIndex) {
      this.allHome(id);
      return;
    }
    if (z < this.placeIndex) return;
    const { home, letGo } = readFriend(this.spiders, this.placeIndex, id, { h, m });
    for (const spider of home) this.bringHome(spider, id);
    for (const spider of letGo) this.letGoOf(spider, id);
  }

  /** Every spider at this place is home on a friend's screen, so they all come home here, those still waiting too. */
  allHome(by) {
    if (this.homeHere >= this.count) return;
    for (let spider = this.spiders.find((each) => !isHome(each)); spider; spider = this.spiders.find((each) => !isHome(each))) {
      this.bringHome(spider, by);
    }
  }

  /** A friend has gone, and a spider in their glove goes back to playing. */
  friendGone(id) {
    if (!this.shared) return;
    for (const spider of this.spiders) if (spider.holder === id && !isHome(spider)) this.letGoOf(spider, id);
  }

  /** A spider in a friend's glove rides in it, peeping out, wherever their glove is on this screen. */
  followFriends() {
    for (const spider of this.spiders) {
      if (spider.state !== 'held' || !spider.holder || spider.holder === this.shared.me) continue;
      const glove = this.friendsGloves.find((each) => each.id === spider.holder)?.glove;
      if (!glove?.visible) continue;
      spider.x = glove.x;
      spider.y = glove.y - this.palmSize * 0.15;
    }
  }

  /** In a friend's glove, rather than playing or in this child's. */
  heldByFriend(spider) {
    return Boolean(this.shared && spider.state === 'held' && spider.holder && spider.holder !== this.shared.me);
  }

  /** How far the garden's middle is from the web, in screen heights, which reach help and the screen's shape change. */
  get middleFromWeb() {
    return ((GARDEN_ACROSS - REACH_HELP[this.reach] - WEB_ACROSS) * this.width) / this.height;
  }

  /**
   * Where a point on this screen is in the garden friends share: the one a child playing with the right hand, with a
   * little reach help, sees on a wide screen, from 0 on Giraffe's side to 1 across, and down. So a friend's glove by a
   * spider on their screen is by it on this one, and at the web when it's at theirs: see acrossGardens.
   */
  toCommon(x, y) {
    const away = (this.way * (x - this.across(WEB_ACROSS))) / this.height;
    return { x: WEB_ACROSS + acrossGardens(away, this.middleFromWeb, COMMON_MIDDLE) / COMMON.aspect, y: y / this.height };
  }

  /** Where a point in the garden friends share is on this screen. */
  fromCommon(x, y) {
    const away = acrossGardens((x - WEB_ACROSS) * COMMON.aspect, COMMON_MIDDLE, this.middleFromWeb);
    return { x: this.across(WEB_ACROSS) + this.way * away * this.height, y: y * this.height };
  }

  /* ---------- berries, helpers and labels, from the higher levels ---------- */

  /** A new thing's label, the first time it comes along in a game, one at a time so they're read. */
  introduce(key, target) {
    if (this.introduced.has(key) || this.labels.length || !LABELS[key]) return;
    this.introduced.add(key);
    const [en, ka] = LABELS[key];
    this.labels.push({ key, target, life: LABEL_SECONDS, text: this.language() === 'ka' ? ka : en });
  }

  /**
   * A berry hops out onto the grass or a leaf. One left where a spider was caught can only be picked up
   * once the hand has gone away from it and come back; one from a chest or a golden spider straight away.
   */
  dropBerry(x, y, { armed = false, spread = 0 } = {}) {
    const berry = {
      x: x + spread * this.height * 0.05,
      y,
      rest: Math.min(this.height * 0.92, y + this.height * 0.05),
      vx: spread * this.height * 0.12,
      vy: -this.height * 0.35,
      armed,
      age: 0,
      fade: 0,
      going: false,
      r: this.height * BERRY_SIZE,
    };
    this.berries.push(berry);
    this.introduce('berry', berry);
    return berry;
  }

  get berryTotal() {
    return this.picked.left + this.picked.right;
  }

  updateExtras(dt, snapshot, playing) {
    const glove = this.gloves[this.side];
    const { open } = this.readHand(snapshot);
    const seen = playing && glove.visible;
    const gap = (thing) => Math.hypot(glove.x - thing.x, glove.y - thing.y);

    // Berries, which roll to a hand nearby and are picked up by it coming close, open or closed.
    const fall = (berry) => {
      if (berry.y >= berry.rest && berry.vy >= 0) return;
      berry.vy += this.height * 1.4 * dt;
      berry.x += berry.vx * dt;
      berry.y = Math.min(berry.rest, berry.y + berry.vy * dt);
      if (berry.y >= berry.rest) berry.vy = 0;
    };
    this.berries = this.berries.filter((berry) => {
      berry.age += dt;
      berry.fade = Math.min(1, berry.fade + dt * 3);
      if (berry.going) {
        fall(berry);
        berry.gone = (berry.gone ?? 0) + dt;
        return berry.gone < 0.8;
      }
      const away = seen ? gap(berry) : Infinity;
      if (seen && !berry.armed && away > this.height * BERRY.away) berry.armed = true;
      const ready = seen && berry.armed;
      if (ready && away <= this.palmSize * BERRY.pickPalms + berry.r && berry.age > 0.3) {
        this.pickBerry(berry);
        return false;
      }
      if (ready && away < this.height * BERRY.pullRange && away > 1) {
        // It goes straight to the hand, and only falls back to the grass once the hand has gone, so a
        // hand held above it never has it bobbing up and down.
        berry.x += ((glove.x - berry.x) / away) * BERRY.pull * this.height * dt;
        berry.y += ((glove.y - berry.y) / away) * BERRY.pull * this.height * dt;
        berry.vy = 0;
        berry.rest = Math.max(berry.rest, berry.y);
      } else {
        fall(berry);
      }
      return true;
    });
    for (const flight of this.flying) flight.t += dt;
    this.flying = this.flying.filter((flight) => flight.t < PRIZE_FLY_SECONDS);
    for (const label of this.labels) label.life -= dt;
    this.labels = this.labels.filter((label) => label.life > 0);
    if (this.webGlow) {
      this.webGlow.life -= dt;
      if (this.webGlow.life <= 0) this.webGlow = null;
    }

    // Sleepy spiders, woken by an open hand held by them for a moment.
    for (const spider of this.spiders) {
      if (spider.state !== 'asleep') continue;
      const near = seen && open && this.isNear(spider, glove, this.catchReach * 1.1);
      spider.waking = near ? spider.waking + dt : Math.max(0, spider.waking - dt);
      if (spider.waking >= WAKE_SECONDS) this.wake(spider);
    }

    // Helpers only come, and are only introduced, during play: never behind the countdown, where the
    // next place's own would replace them at "Go!", or behind the finish card.
    const { basket, chest, butterfly } = this.helpers;
    const middle = this.gardenMiddle;
    const groundAt = (shift) => ({ x: middle.x + this.way * shift * this.height, y: this.height * GROUND });
    const appear = (helper) => {
      if (helper.state !== 'coming') return false;
      if (playing) helper.in -= dt;
      if (helper.in > 0) return true;
      helper.state = 'waiting';
      return false;
    };
    const introduce = (key, target) => {
      if (playing) this.introduce(key, target);
    };

    // The basket, sitting in the grass until the hand comes by it. Then it carries two.
    if (basket && !appear(basket)) {
      Object.assign(basket, groundAt(0.16), { r: this.height * 0.045 });
      basket.alpha = Math.min(1, basket.alpha + dt * 2);
      if (basket.state === 'waiting') {
        introduce('basket', basket);
        if (seen && gap(basket) <= this.palmSize * 1.5 + basket.r) {
          basket.state = 'carried';
          this.catching.holds = BASKET_HOLDS;
          this.events.onHelper?.('basket');
        }
      }
    }

    // The treasure chest, opened by an open hand held on it, for berries.
    if (chest && !appear(chest)) {
      if (chest.state !== 'open') Object.assign(chest, groundAt(-0.04), { r: this.height * 0.05 });
      chest.alpha = Math.min(1, chest.alpha + dt * 2);
      if (chest.state === 'waiting') {
        introduce('chest', chest);
        const on = seen && open && gap(chest) <= this.palmSize * 1.3 + chest.r;
        chest.hold = on ? chest.hold + dt : Math.max(0, chest.hold - dt);
        if (chest.hold >= CHEST_SECONDS) {
          chest.state = 'open';
          chest.openFor = 0;
          for (let i = 0; i < CHEST_BERRIES; i += 1) this.dropBerry(chest.x, chest.y - chest.r, { armed: true, spread: (i - (CHEST_BERRIES - 1) / 2) * 0.8 });
          this.events.onHelper?.('chest');
        }
      } else if (chest.state === 'open') {
        chest.openFor += dt;
        if (chest.openFor > 2.5) chest.alpha = Math.max(0, chest.alpha - dt * 1.5);
      }
    }

    // The butterfly: it rests in the grass, and touched, it flies over the garden for a while, and the
    // spiders slow right down to watch it. Its time only runs while the hand in play is open, so resting
    // never wastes it.
    if (butterfly && !appear(butterfly)) {
      this.updateButterfly(butterfly, dt, {
        touched: seen && gap(butterfly) <= this.palmSize * 1.8,
        rest: groundAt(-0.04),
        playing,
        open: seen && open,
      });
    }
  }

  /**
   * touched says the hand in play is on it, rest is where it sits in the grass, playing whether it's
   * play, and open whether the hand in play is seen open, which is when its time runs.
   */
  updateButterfly(butterfly, dt, { touched, rest, playing, open }) {
    butterfly.t += dt;
    butterfly.r = this.height * 0.045;
    if (butterfly.state === 'waiting') {
      butterfly.state = 'arriving';
      butterfly.from = { x: rest.x + this.way * this.height * 0.3, y: -this.height * 0.05 };
      butterfly.flown = 0;
    }
    if (butterfly.state === 'arriving') {
      butterfly.flown += dt / 2.2;
      const share = ease(Math.min(1, butterfly.flown));
      butterfly.x = butterfly.from.x + (rest.x - butterfly.from.x) * share;
      butterfly.y = butterfly.from.y + (rest.y - butterfly.from.y) * share - Math.sin(share * Math.PI) * this.height * 0.08;
      butterfly.alpha = Math.min(1, butterfly.alpha + dt * 2);
      if (butterfly.flown >= 1) butterfly.state = 'resting';
    } else if (butterfly.state === 'resting') {
      if (playing) {
        this.introduce('butterfly', butterfly);
        butterfly.wait += dt;
      }
      if (touched) {
        butterfly.state = 'helping';
        butterfly.left = BUTTERFLY.seconds;
        butterfly.from = { x: butterfly.x, y: butterfly.y };
        butterfly.flown = 0;
        this.slow = BUTTERFLY.slow;
        this.events.onHelper?.('butterfly');
      } else if (butterfly.wait > BUTTERFLY.waitMost) {
        butterfly.state = 'leaving';
      }
    } else if (butterfly.state === 'helping') {
      // Round and round, slowly, over where the spiders play.
      if (open) butterfly.left -= dt;
      butterfly.flown = Math.min(1, butterfly.flown + dt);
      const middle = this.gardenMiddle;
      const turn = butterfly.t * 0.7;
      const circle = { x: middle.x + Math.cos(turn) * this.height * 0.14, y: this.height * 0.3 + Math.sin(turn) * this.height * 0.05 };
      const share = ease(butterfly.flown);
      butterfly.x = butterfly.from.x + (circle.x - butterfly.from.x) * share;
      butterfly.y = butterfly.from.y + (circle.y - butterfly.from.y) * share;
      if (butterfly.left <= 0) {
        butterfly.state = 'leaving';
        this.slow = 1;
      }
    } else if (butterfly.state === 'leaving') {
      butterfly.y -= this.height * 0.2 * dt;
      butterfly.x += this.way * this.height * 0.1 * dt;
      butterfly.alpha = Math.max(0, butterfly.alpha - dt * 0.8);
      if (butterfly.alpha <= 0) this.helpers.butterfly = null;
    }
  }

  pickBerry(berry) {
    this.picked[this.side] += 1;
    this.flying.push({ x: berry.x, y: berry.y, t: 0 });
    this.events.onBerry?.(this.berryTotal);
  }

  /* ---------- drawing ---------- */

  /** A place in the garden, drawn once, for behind everything. */
  sceneFor(name) {
    const key = `${name}-${this.side}-${this.reach}`;
    if (this.scenes[key]) return this.scenes[key];
    const { width, height, ratio } = this;
    const look = LOOKS[name];
    const scene = document.createElement('canvas');
    scene.width = Math.round(width * ratio);
    scene.height = Math.round(height * ratio);
    const ctx = scene.getContext('2d');
    ctx.scale(ratio, ratio);
    const sky = ctx.createLinearGradient(0, 0, 0, height * 0.7);
    sky.addColorStop(0, look.sky[0]);
    sky.addColorStop(1, look.sky[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
    // A soft round sun, away from the camera's picture.
    ctx.fillStyle = 'rgb(255 236 150 / 0.9)';
    ctx.beginPath();
    ctx.arc(this.across(0.06), height * 0.09, height * 0.06, 0, Math.PI * 2);
    ctx.fill();
    const hills = (colour, base, size, waves, shift) => {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let x = 0; x <= width; x += 10) {
        const u = (x / width) * Math.PI * 2;
        ctx.lineTo(x, height * base - height * size * (Math.sin(u * waves + shift) * 0.6 + Math.sin(u * waves * 2 + 1 + shift) * 0.4));
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fill();
    };
    hills(look.far, 0.62, 0.05, 2, name.length);
    hills(look.near, 0.8, 0.03, 4, name.length * 2);
    this.paintPlace(ctx, name, look);
    // Flowers along the bottom, the same every time.
    const flowers = ['#ff8ab3', '#ffd23f', '#ffffff', '#b48cff', '#ff9a52'];
    for (let i = 0; i < 26; i += 1) {
      const x = ((i * 0.618 + 0.05) % 1) * width;
      const y = height * (0.86 + ((i * 0.37) % 1) * 0.12);
      ctx.strokeStyle = '#4f9f47';
      ctx.lineWidth = Math.max(2, height * 0.004);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + height * 0.03);
      ctx.stroke();
      ctx.fillStyle = flowers[i % flowers.length];
      for (let petal = 0; petal < 5; petal += 1) {
        const angle = (petal / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(x + Math.cos(angle) * height * 0.008, y + Math.sin(angle) * height * 0.008, height * 0.007, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffb703';
      ctx.beginPath();
      ctx.arc(x, y, height * 0.005, 0, Math.PI * 2);
      ctx.fill();
    }
    // The leafy branch the swinging spiders hang from, over where they play.
    const middle = this.gardenMiddle;
    const branchY = height * BRANCH_DOWN;
    ctx.strokeStyle = '#8a5a34';
    ctx.lineWidth = height * 0.018;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(this.side === 'right' ? width + 10 : -10, branchY - height * 0.04);
    ctx.quadraticCurveTo(middle.x, branchY + height * 0.015, middle.x - this.way * height * 0.42, branchY - height * 0.01);
    ctx.stroke();
    ctx.fillStyle = look.leaves;
    for (let i = 0; i < 9; i += 1) {
      const x = middle.x - this.way * height * (0.38 - i * 0.1);
      ctx.beginPath();
      ctx.ellipse(x, branchY - height * (0.025 + (i % 2) * 0.02), height * 0.04, height * 0.022, (i % 2 ? 0.5 : -0.5) * this.way, 0, Math.PI * 2);
      ctx.fill();
    }
    this.scenes[key] = scene;
    return scene;
  }

  /** What makes each place itself, drawn by Giraffe's side so it's never in the spiders' way. */
  paintPlace(ctx, name, look) {
    const { height } = this;
    const at = (share) => this.across(share);
    ctx.lineWidth = Math.max(2, height * 0.004);
    ctx.strokeStyle = INK;
    if (name === 'gate') {
      // A little white fence with a gate in it.
      for (let i = 0; i < 14; i += 1) {
        const x = at(0.02 + i * 0.075);
        ctx.fillStyle = i === 5 || i === 6 ? '#ffd9a0' : '#fffaf0';
        ctx.beginPath();
        ctx.roundRect(x, height * 0.6, height * 0.035, height * 0.16, [height * 0.017, height * 0.017, 0, 0]);
        ctx.fill();
      }
      ctx.fillStyle = '#fffaf0';
      ctx.fillRect(0, height * 0.64, this.width, height * 0.018);
      ctx.fillRect(0, height * 0.71, this.width, height * 0.018);
    } else if (name === 'carrots') {
      // Rows of carrot tops in brown earth.
      ctx.fillStyle = '#b07a4a';
      ctx.beginPath();
      ctx.ellipse(this.width / 2, height * 0.8, this.width * 0.55, height * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 18; i += 1) {
        const x = (i / 18) * this.width + height * 0.02;
        const y = height * (0.77 + (i % 2) * 0.05);
        ctx.fillStyle = '#ff8a2a';
        ctx.beginPath();
        ctx.moveTo(x - height * 0.014, y);
        ctx.lineTo(x + height * 0.014, y);
        ctx.lineTo(x, y + height * 0.035);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = look.leaves;
        for (const lean of [-0.5, 0, 0.5]) {
          ctx.beginPath();
          ctx.ellipse(x + lean * height * 0.02, y - height * 0.025, height * 0.007, height * 0.025, lean, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (name === 'honey') {
      // A big round tree with a beehive hanging from it.
      const x = at(0.1);
      ctx.fillStyle = '#8a5a34';
      ctx.fillRect(x - height * 0.03, height * 0.32, height * 0.06, height * 0.5);
      ctx.fillStyle = look.leaves;
      for (const [dx, dy, r] of [[0, 0.22, 0.17], [-0.12, 0.3, 0.12], [0.12, 0.3, 0.12]]) {
        ctx.beginPath();
        ctx.arc(x + dx * height, dy * height, r * height, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffc93c';
      ctx.beginPath();
      ctx.ellipse(x + this.way * height * 0.1, height * 0.42, height * 0.04, height * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (name === 'pond') {
      // A round pond with lily pads.
      ctx.fillStyle = '#6cc4ee';
      ctx.beginPath();
      ctx.ellipse(this.width / 2, height * 0.84, this.width * 0.36, height * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5aa84a';
      for (const share of [0.3, 0.45, 0.62]) {
        ctx.beginPath();
        ctx.ellipse(share * this.width, height * 0.84, height * 0.03, height * 0.014, 0, 0.3, Math.PI * 2);
        ctx.lineTo(share * this.width, height * 0.84);
        ctx.fill();
      }
    } else if (name === 'house') {
      // Giraffe's little house, with a round window.
      const x = at(0.06);
      ctx.fillStyle = '#ffe2b0';
      ctx.fillRect(x - height * 0.1, height * 0.42, height * 0.2, height * 0.24);
      ctx.fillStyle = '#e8605a';
      ctx.beginPath();
      ctx.moveTo(x - height * 0.13, height * 0.43);
      ctx.lineTo(x, height * 0.3);
      ctx.lineTo(x + height * 0.13, height * 0.43);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#8fd3ff';
      ctx.beginPath();
      ctx.arc(x, height * 0.51, height * 0.035, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * The web: spokes, a spiral that gets fuller with each spider home, and dew that stays once it's
   * there. It gets a little whiter and fuller as it fills, slowly, never all at once.
   */
  drawWeb(ctx, web, fill, alpha, glow = 0) {
    const { height } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    // Where it hangs from: a twig above, and threads down to the plants.
    ctx.strokeStyle = 'rgb(255 255 255 / 0.85)';
    ctx.lineWidth = Math.max(1.5, height * 0.003);
    // With two webs, the top one's threads go down to the one below rather than to the plants.
    const bottom = web.colour && web.index === 0 ? web.y + web.r * 1.9 : height * 0.86;
    ctx.beginPath();
    ctx.moveTo(web.x, web.y - web.r);
    ctx.lineTo(web.x, height * 0.12);
    ctx.moveTo(web.x - web.r * 0.8, web.y + web.r * 0.6);
    ctx.lineTo(web.x - web.r * 1.3, bottom);
    ctx.moveTo(web.x + web.r * 0.8, web.y + web.r * 0.6);
    ctx.lineTo(web.x + web.r * 1.3, bottom);
    ctx.stroke();
    ctx.fillStyle = '#8a5a34';
    ctx.beginPath();
    ctx.roundRect(web.x - height * 0.06, height * 0.1, height * 0.12, height * 0.022, height * 0.011);
    ctx.fill();
    // A soft pale disc behind it, a little stronger as it fills, so it stands out from the garden.
    ctx.fillStyle = `rgb(255 255 255 / ${0.16 + 0.14 * fill})`;
    ctx.beginPath();
    ctx.arc(web.x, web.y, web.r * 1.08, 0, Math.PI * 2);
    ctx.fill();
    if (web.colour) {
      // Its colour, as a soft disc and a ring round it, so it's clear which spiders live there.
      ctx.save();
      ctx.globalAlpha = alpha * 0.28;
      ctx.fillStyle = web.colour;
      ctx.fill();
      ctx.globalAlpha = alpha * (0.85 + 0.15 * glow);
      ctx.strokeStyle = web.colour;
      ctx.lineWidth = height * (0.009 + 0.006 * glow);
      ctx.beginPath();
      ctx.arc(web.x, web.y, web.r * (1.1 + 0.08 * glow), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    const spokes = 12;
    const thread = Math.max(1.5, height * (0.0028 + 0.0016 * fill));
    ctx.beginPath();
    for (let i = 0; i < spokes; i += 1) {
      const angle = (i / spokes) * Math.PI * 2;
      ctx.moveTo(web.x, web.y);
      ctx.lineTo(web.x + Math.cos(angle) * web.r, web.y + Math.sin(angle) * web.r);
    }
    // The spiral: a few rings to start with, and more as spiders come home.
    const rings = 3 + fill * 5;
    const steps = Math.ceil(rings * spokes);
    for (let step = 0; step <= steps; step += 1) {
      const turn = step / spokes;
      const out = web.r * (0.12 + (0.86 * turn) / Math.max(rings, 1));
      if (out > web.r * 0.98) break;
      const angle = (step / spokes) * Math.PI * 2;
      const x = web.x + Math.cos(angle) * out;
      const y = web.y + Math.sin(angle) * out;
      if (step === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    // A soft blue-grey line under each thread, so the web shows against a pale sky.
    ctx.strokeStyle = 'rgb(96 128 160 / 0.45)';
    ctx.lineWidth = thread * 2.4;
    ctx.stroke();
    ctx.strokeStyle = `rgb(${Math.round(235 + 20 * fill)} ${Math.round(242 + 13 * fill)} 255 / 0.95)`;
    ctx.lineWidth = thread;
    ctx.stroke();
    // Dew, which only ever arrives, so nothing twinkles.
    const drops = Math.floor(fill * 14);
    ctx.fillStyle = 'rgb(255 255 255 / 0.95)';
    for (let i = 0; i < drops; i += 1) {
      const angle = (i * 2.399) % (Math.PI * 2);
      const out = web.r * (0.3 + ((i * 0.37) % 0.6));
      ctx.beginPath();
      ctx.arc(web.x + Math.cos(angle) * out, web.y + Math.sin(angle) * out, height * 0.005, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** A spider, its legs pattering if it's moving. held tucks its legs in, peeping out of the glove. */
  drawSpider(ctx, spider, { alpha = spider.alpha, held = false } = {}) {
    // Just woken, it stretches: a little taller for a moment, slowly.
    const yawn = spider.stretch > 0 && !this.reducedMotion ? Math.sin((1 - spider.stretch / 0.6) * Math.PI) * 0.12 : 0;
    const size = this.spiderSize * (held ? 0.9 : 1) * (1 + yawn);
    const { x, y } = spider;
    ctx.save();
    ctx.globalAlpha = alpha;
    const out = spider.state === 'playing' || spider.state === 'dashing' || spider.state === 'leaving';
    if (spider.kind === 'boat' && out) {
      // Its leaf boat, rocking gently under it.
      ctx.save();
      ctx.translate(x, y + size * 0.75);
      ctx.rotate(this.reducedMotion ? 0 : Math.sin(this.time * 1.3 + spider.phase) * 0.08);
      ctx.fillStyle = '#5fbf4f';
      ctx.strokeStyle = '#3e8f3a';
      ctx.lineWidth = Math.max(2, size * 0.1);
      ctx.beginPath();
      ctx.moveTo(-size * 1.9, -size * 0.25);
      ctx.quadraticCurveTo(0, size * 1.1, size * 1.9, -size * 0.25);
      ctx.quadraticCurveTo(0, size * 0.15, -size * 1.9, -size * 0.25);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    if (spider.kind === 'dangle' && (spider.state === 'playing' || spider.state === 'dashing')) {
      ctx.strokeStyle = 'rgb(255 255 255 / 0.9)';
      ctx.lineWidth = Math.max(1.5, this.height * 0.0028);
      ctx.beginPath();
      ctx.moveTo(x, this.height * BRANCH_DOWN);
      ctx.lineTo(x, y - size * 0.8);
      ctx.stroke();
    }
    const ladybird = spider.kind === 'ladybird';
    const colour = spider.golden ? GOLD : COLOURS[spider.colour % COLOURS.length];
    ctx.strokeStyle = ladybird ? '#3a2b33' : shade(colour, -0.35);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * (ladybird ? 0.16 : 0.2);
    const stretch = held ? 0.55 : ladybird ? 0.75 : 1;
    for (const way of [-1, 1]) {
      (ladybird ? LEGS.slice(1) : LEGS).forEach((angle, index) => {
        const patter = held ? 0 : Math.sin(spider.legs * 1.5 + index * 1.6 + (way > 0 ? Math.PI : 0)) * 0.18;
        const a = angle + patter;
        const kneeX = x + way * Math.cos(a) * size * 1.15 * stretch;
        const kneeY = y + Math.sin(a) * size * 0.9 * stretch;
        const footX = kneeX + way * size * 0.45 * stretch;
        const footY = kneeY + size * 0.35 * stretch;
        ctx.beginPath();
        ctx.moveTo(x + way * size * 0.5, y + Math.sin(a) * size * 0.4);
        ctx.quadraticCurveTo(kneeX, kneeY - size * 0.25, footX, footY);
        ctx.stroke();
      });
    }
    const asleep = spider.state === 'asleep';
    const body = ladybird
      ? this.ladybirdBody
      : spider.golden
        ? this.goldBody
        : (asleep ? this.sleepers : this.bodies)[spider.colour % this.bodies.length];
    const across = size * 2.4;
    ctx.drawImage(body, x - across / 2, y - across / 2, across, across);
    if (asleep) {
      // Little z's drifting slowly up, and a ring closing round it as an open hand wakes it.
      ctx.fillStyle = INK;
      ctx.font = `600 ${Math.round(size * 0.7)}px Fredoka, sans-serif`;
      const rise = (this.time * 0.4 + spider.phase) % 1;
      ctx.globalAlpha = alpha * (1 - rise) * 0.8;
      ctx.fillText('z', x + size * (0.9 + rise * 0.3), y - size * (0.9 + rise * 0.9));
      ctx.globalAlpha = alpha;
      if (spider.waking > 0) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = size * 0.18;
        ctx.beginPath();
        ctx.arc(x, y, size * 1.6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, spider.waking / WAKE_SECONDS));
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** The ladybird's flower: a big daisy in the grass, with a soft ring round it while she's carried. */
  drawFlower(ctx, alpha) {
    const { flower } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#4f9f47';
    ctx.lineWidth = Math.max(3, this.height * 0.008);
    ctx.beginPath();
    ctx.moveTo(flower.x, flower.y);
    ctx.lineTo(flower.x, this.height);
    ctx.stroke();
    if (this.holding?.kind === 'ladybird') {
      ctx.strokeStyle = 'rgb(255 255 255 / 0.9)';
      ctx.lineWidth = Math.max(3, this.height * 0.006);
      ctx.beginPath();
      ctx.arc(flower.x, flower.y, flower.reach * (0.9 + 0.06 * Math.sin(this.time * 2)), 0, Math.PI * 2);
      ctx.stroke();
    }
    const size = flower.r * 2.4;
    ctx.drawImage(this.marks.flower, flower.x - size / 2, flower.y - size / 2, size, size);
    ctx.restore();
  }

  /**
   * The stream the leaf boats sail along, at the bottom of the garden, or null with no boat: its middle,
   * how far it goes either way, and how wide it is either side, in pixels. It's long enough for the
   * whole leaf at either end of a boat's way, and it comes in with its boat.
   */
  get stream() {
    const boat = this.spiders.find((spider) => spider.kind === 'boat');
    if (!boat) return null;
    const middle = this.gardenMiddle;
    return {
      x: middle.x + this.way * boat.path.cx * this.height,
      y: middle.y + boat.path.cy * this.height + this.spiderSize * 1.1,
      half: boat.path.ax * this.height + this.spiderSize * 2.4,
      wide: this.height * 0.03,
      alpha: boat.alpha,
    };
  }

  /** A soft stream along the bottom of the garden, for the leaf boats: this place's, or the last one's fading. */
  drawStream(ctx, stream = this.stream, fade = 1) {
    if (!stream) return;
    ctx.save();
    ctx.globalAlpha = stream.alpha * fade;
    ctx.fillStyle = 'rgb(120 200 240 / 0.55)';
    ctx.beginPath();
    ctx.ellipse(stream.x, stream.y, stream.half, stream.wide, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * The basket, the treasure chest and the butterfly: this place's, or the last place's fading as the
   * next one comes, at fade.
   */
  drawHelpers(ctx, helpers = this.helpers, fade = 1) {
    const { basket, chest, butterfly } = helpers;
    const glove = this.gloves[this.side];
    if (basket && basket.state === 'waiting') this.drawMark(ctx, 'basket', basket.x, basket.y, basket.r, basket.alpha * fade);
    if (chest && chest.state !== 'coming') this.drawChest(ctx, chest, fade);
    if (butterfly && butterfly.state !== 'coming' && butterfly.x !== undefined) {
      // Its wings open and close slowly.
      const flap = butterfly.state === 'resting' ? 0.75 + 0.25 * Math.cos(butterfly.t * 1.6) : 0.55 + 0.45 * Math.abs(Math.cos(butterfly.t * 3));
      const size = butterfly.r * 2;
      ctx.save();
      ctx.globalAlpha = butterfly.alpha * fade;
      ctx.translate(butterfly.x, butterfly.y);
      ctx.scale(this.reducedMotion ? 1 : flap, 1);
      ctx.drawImage(this.marks.butterfly, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
    if (basket?.state === 'carried' && glove.visible) {
      this.drawMark(ctx, 'basket', glove.x, glove.y + this.palmSize * 1.05, this.height * 0.05, fade);
    }
  }

  drawMark(ctx, name, x, y, r, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.marks[name], x - r * 1.2, y - r * 1.2, r * 2.4, r * 2.4);
    ctx.restore();
  }

  /**
   * A little wooden treasure chest, with a gold band, whose lid swings open upwards. It's hinged on
   * Giraffe's side, so it's mirrored for the left hand.
   */
  drawChest(ctx, chest, fade = 1) {
    const { x, y, r } = chest;
    ctx.save();
    ctx.globalAlpha = chest.alpha * fade;
    ctx.lineWidth = Math.max(2, r * 0.08);
    ctx.strokeStyle = INK;
    ctx.fillStyle = '#b5713b';
    ctx.beginPath();
    ctx.roundRect(x - r, y - r * 0.4, r * 2, r * 1.1, r * 0.15);
    ctx.fill();
    ctx.stroke();
    const open = chest.state === 'open' ? Math.min(1, chest.openFor * 3) : 0;
    ctx.save();
    // The hinge, its lid and its swing are all mirrored for the left hand, so it opens upwards either way.
    ctx.translate(x - r * this.way, y - r * 0.4);
    ctx.scale(this.way, 1);
    ctx.rotate(-open * 1.6);
    ctx.fillStyle = '#c98a4a';
    ctx.beginPath();
    ctx.roundRect(0, -r * 0.55, r * 2, r * 0.55, [r * 0.5, r * 0.5, 0, 0]);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(x - r * 0.15, y - r * 0.5, r * 0.3, r * 0.45);
    if (chest.state === 'waiting' && chest.hold > 0) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = r * 0.14;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(x, y, r * 1.6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, chest.hold / CHEST_SECONDS));
      ctx.stroke();
    }
    ctx.restore();
  }

  drawBerries(ctx) {
    for (const berry of this.berries) {
      const alpha = berry.going ? Math.max(0, 1 - (berry.gone ?? 0) / 0.8) : berry.fade;
      this.drawMark(ctx, 'berry', berry.x, berry.y, berry.r, alpha);
    }
    const to = this.prizeTarget();
    for (const flight of this.flying) {
      const share = ease(Math.min(1, flight.t / PRIZE_FLY_SECONDS));
      const x = flight.x + (to.x - flight.x) * share;
      const y = flight.y + (to.y - flight.y) * share - Math.sin(share * Math.PI) * this.height * 0.08;
      this.drawMark(ctx, 'berry', x, y, this.height * BERRY_SIZE * (1.2 - 0.5 * share));
    }
  }

  /** A new thing's little label, above it, fading in and out. */
  drawLabel(ctx, label) {
    const { height } = this;
    const { target } = label;
    const alpha = clamp(Math.min((LABEL_SECONDS - label.life) / 0.3, label.life / 0.6), 0, 1);
    const size = Math.max(16, height * 0.03);
    const r = target.r ?? this.spiderSize;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (!this.reducedMotion) {
      ctx.strokeStyle = 'rgb(255 255 255 / 0.75)';
      ctx.lineWidth = Math.max(2, height * 0.005);
      ctx.beginPath();
      ctx.arc(target.x, target.y, r * (2 + 0.4 * (1 - label.life / LABEL_SECONDS)), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.font = `600 ${Math.round(size)}px Fredoka, "Noto Sans Georgian", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(label.text).width + size * 1.2;
    const h = size * 1.7;
    const x = clamp(target.x, w / 2 + 8, this.width - w / 2 - 8);
    const y = clamp(target.y - r * 2.4 - h / 2, h / 2 + 90, height - h);
    ctx.fillStyle = 'rgb(255 255 255 / 0.95)';
    ctx.strokeStyle = 'rgb(18 48 77 / 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.fillText(label.text, x, y + 1);
    ctx.restore();
  }

  render() {
    const { back, ctx, width, height, ratio } = this;
    back.setTransform(1, 0, 0, 1, 0, 0);
    if (this.fromPlace && this.fade < 1) {
      back.globalAlpha = 1;
      back.drawImage(this.sceneFor(this.fromPlace), 0, 0);
      back.globalAlpha = this.fade;
    } else {
      back.globalAlpha = 1;
    }
    back.drawImage(this.sceneFor(this.place), 0, 0);
    back.globalAlpha = 1;

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const { webs } = this;
    if (this.oldWeb) {
      // The web just filled, fading out as the next place comes, with its spiders in it.
      const gone = 1 - this.fade;
      webs.forEach((web, index) => this.drawWeb(ctx, web, this.oldWeb.fills[index], gone));
      if (this.oldWeb.flower) this.drawFlower(ctx, gone);
      this.drawStream(ctx, this.oldWeb.stream, gone);
      for (const spider of this.oldWeb.spiders) {
        const at = this.homeSpot(spider, webs);
        this.drawSpider(ctx, { ...spider, ...at }, { alpha: gone });
      }
    }
    if (!this.oldWeb || this.fade > 0) {
      const alpha = this.oldWeb ? this.fade : 1;
      webs.forEach((web, index) => {
        const glow = this.webGlow?.index === index ? Math.sin(Math.PI * (1 - this.webGlow.life / 1.6)) : 0;
        this.drawWeb(ctx, web, this.fills[index], alpha, glow);
      });
      if (this.visitors.ladybird) this.drawFlower(ctx, alpha);
    }
    this.drawStream(ctx);
    // The last place's helpers stay behind, fading with it.
    if (this.oldHelpers) this.drawHelpers(ctx, this.oldHelpers, 1 - this.fade);
    this.drawHelpers(ctx);
    this.drawBerries(ctx);
    const carried = this.catching.carried;
    for (const spider of this.spiders) {
      if (!carried.includes(spider) && !this.heldByFriend(spider)) this.drawSpider(ctx, spider);
    }
    // Friends' gloves under the child's own, each with what it's carrying, but the second player's in one picture
    // over the first's.
    const over = inOnePicture();
    const friends = () => {
      this.drawFriendsGloves(ctx);
      for (const spider of this.spiders) if (this.heldByFriend(spider)) this.drawSpider(ctx, spider, { held: true });
    };
    if (!over) friends();
    this.gloves.left.draw(ctx, this.palmSize);
    this.gloves.right.draw(ctx, this.palmSize);
    for (const spider of carried) this.drawSpider(ctx, spider, { held: true });
    if (over) friends();
    for (const label of this.labels) this.drawLabel(ctx, label);
  }

  /**
   * Friends' gloves, playing on their own computers, where their hands really are in the garden, in light grey,
   * with each friend's name over theirs. A spider caught by a friend rides in theirs. Two playing in one picture on
   * one screen, the friend is the second player, right there playing too, so theirs is in their own blue.
   */
  drawFriendsGloves(ctx) {
    const { palmSize } = this;
    const second = inOnePicture();
    for (const { glove, name, fade } of this.friendsGloves) {
      if (!glove.visible || fade < 0.02) continue;
      glove.draw(ctx, palmSize, second ? secondPlayerLook(glove, fade) : { ...FRIEND_GLOVE, alpha: fade });
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.font = `700 ${Math.round(palmSize * 0.32)}px Fredoka, "Noto Sans Georgian", sans-serif`;
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
}
