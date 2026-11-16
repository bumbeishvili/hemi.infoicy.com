// Balloon Pop's world: balloons floating up and swaying, and a big glove that copies the
// child's hand finger by finger. Only an open hand pops a balloon. A closed one bumps it,
// which keeps the point of the game on opening the hand. Missing balloons costs nothing.
//
// With the maths challenge on, balloons with answers on them come up and wait. The right one pops.
// The wrong one is too hot: the glove goes black with soot and can't pop anything until the child
// has held the hand open for long enough to cool it, which is the exercise this game is for.
//
// Higher levels (rules.js) bring more balloons, a little faster, and new kinds: presents that fall on a
// little parachute to be caught, power-up bubbles, star balloons that need the open hand held on them a
// moment, pairs tied together, friends in baskets to bring down, rainbow balloons whose pop spreads,
// a bluebird that helps, big balloons that pop into three, a breeze, and new places: the sea and the fair.
// Prizes fall slowly, drift towards the hand and are caught by the glove just coming near, open or
// closed. Missing one costs nothing.
//
// Nothing flashes: seizures are more common in children with hemiplegia, so pops are small
// bursts of colour and the screen itself never changes brightness. New things only move, grow or fade.
import { Glove, INK, toScreen } from '../../core/glove.js';
import {
  balloonLevel, BASKET_BALLOONS, BIG_SPLITS_INTO, BIRD, BUBBLE_REACH, FIRST_BASKET_AFTER, FIRST_POWER_AFTER, MAGNET,
  PACES, POWER_SECONDS, PRIZE, STAR_HOLD_SECONDS,
} from './rules.js';

export { toScreen };

const COLOURS = ['#ff5a4f', '#ffb703', '#27c96b', '#3b82f6', '#a855f7', '#ff7eb6', '#14b8a6'];

// How strongly a balloon drifts towards a nearby open hand, in screen heights a second, for
// a child whose reach is limited. It only ever helps a hand that is already open.
const REACH_HELP = { none: 0, little: 0.05, lots: 0.13 };
const REACH_HELP_RANGE = 0.36;

const PALM_SHARE = 0.105; // A glove's palm length, as a share of screen height.
const BALLOON_SHARE = 0.078; // A balloon's radius, as a share of screen height.
const BUMP_REST_SECONDS = 0.7;
const BREEZE_RATE = 0.32; // How fast the breeze turns, in radians a second: slowly, one way and then the other.


// Balloons with answers on them.
const NUMBERED_SIZE = 1.3; // Bigger than the others, to fit a number that can be read across a room.
const NUMBER_RISE = 0.42; // In screen heights a second, up to where it waits.
const NUMBER_LEAVE = 0.6; // How fast the ones not wanted any more float off.
const NUMBER_ROWS = [0.48, 0.7]; // Where they wait, as shares of the screen's height.
// How long an open hand has to stay on a balloon for it to count, so that a hand on its way to the
// right answer can pass over a wrong one without any trouble.
const CHOOSE_SECONDS = 0.45;
const COOL_SECONDS = 1.5; // How long a burnt glove has to be held open.
const SMOKE_EVERY = 0.22;

// The new things from the higher levels.
const PRIZE_SHARE = 0.05; // A prize's size, as a share of the screen's height.
const PRIZE_FLY_SECONDS = 0.7; // On its way up to the tally.
const LABEL_SECONDS = 2.2; // A new thing's little label, the first time it comes.
const CHAIN_GAP = 0.14; // Seconds between pops, as a rainbow balloon's pop spreads.
const CHAIN_REACH = 3.4; // How far it spreads, in balloon sizes.
const CHAIN_MOST = 6;
const BIG_SIZE = 1.75;
const BASKET_FALL = 0.11; // How fast a friend's basket comes down, in screen heights a second.
const FRIENDS = ['giraffe', 'mochi', 'frost', 'truffle']; // Giraffe first.
const PRIZE_MARKS = { sweet: '🍬', star: '⭐', gem: '💎', heart: '💗' };
const POWER_MARKS = { bubble: '✋', magnet: '🧲', bird: '🐦' };
// The little label each new thing gets the first time it comes along, in English and Georgian.
const LABELS = {
  present: ['Pop it for a present!', 'გახეთქე, შიგ საჩუქარია!'],
  sweet: ['Catch the present!', 'დაიჭირე საჩუქარი!'],
  star: ['Catch the star!', 'დაიჭირე ვარსკვლავი!'],
  gem: ['A gem!', 'ძვირფასი ქვა!'],
  heart: ['A heart!', 'გული!'],
  starBalloon: ['Hold your hand on it!', 'ხელი გააჩერე ბუშტზე!'],
  pair: ['Pop both!', 'ორივე გახეთქე!'],
  basket: ['Pop all three!', 'სამივე გახეთქე!'],
  rainbow: ['Rainbow!', 'ცისარტყელა!'],
  big: ['Big balloon!', 'დიდი ბუშტი!'],
  bubble: ['Bubble glove!', 'ბუშტის ხელთათმანი!'],
  magnet: ['Magnet!', 'მაგნიტი!'],
  bird: ['Bluebird!', 'ლურჯი ჩიტი!'],
};
const RAINBOW = ['#ff5a4f', '#ff9a3c', '#ffd23f', '#27c96b', '#3b82f6', '#a855f7'];
const ease = (share) => share * share * (3 - 2 * share);

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const between = (low, high) => low + Math.random() * (high - low);
function shade(hex, amount) {
  const value = parseInt(hex.slice(1), 16);
  const target = amount > 0 ? 255 : 0;
  const mix = (channel) => Math.round(channel + (target - channel) * Math.abs(amount));
  return `rgb(${mix(value >> 16)} ${mix((value >> 8) & 255)} ${mix(value & 255)})`;
}

/** Drawn once for each colour, as gradients are too slow to repeat every frame. */
function makeBalloonSprite(colour) {
  const canvas = document.createElement('canvas');
  canvas.width = 240;
  canvas.height = 300;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = shade(colour, -0.28);
  ctx.beginPath();
  ctx.moveTo(120, 230);
  ctx.lineTo(107, 252);
  ctx.quadraticCurveTo(120, 246, 133, 252);
  ctx.closePath();
  ctx.fill();

  const body = ctx.createRadialGradient(88, 78, 8, 120, 122, 132);
  body.addColorStop(0, shade(colour, 0.6));
  body.addColorStop(0.42, colour);
  body.addColorStop(1, shade(colour, -0.3));
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(120, 18);
  ctx.bezierCurveTo(186, 18, 222, 70, 222, 122);
  ctx.bezierCurveTo(222, 178, 160, 222, 120, 236);
  ctx.bezierCurveTo(80, 222, 18, 178, 18, 122);
  ctx.bezierCurveTo(18, 70, 54, 18, 120, 18);
  ctx.fill();

  ctx.fillStyle = 'rgb(255 255 255 / 0.55)';
  ctx.beginPath();
  ctx.ellipse(82, 76, 15, 28, 0.55, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

/** A rainbow balloon: the same shape, in soft stripes. It never changes colour, so nothing flickers. */
function makeRainbowSprite() {
  const canvas = makeBalloonSprite('#ffd23f');
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(120, 18);
  ctx.bezierCurveTo(186, 18, 222, 70, 222, 122);
  ctx.bezierCurveTo(222, 178, 160, 222, 120, 236);
  ctx.bezierCurveTo(80, 222, 18, 178, 18, 122);
  ctx.bezierCurveTo(18, 70, 54, 18, 120, 18);
  ctx.clip();
  RAINBOW.forEach((colour, index) => {
    ctx.fillStyle = colour;
    ctx.fillRect(0, 18 + index * 37, 240, 38);
  });
  const shine = ctx.createRadialGradient(88, 78, 8, 120, 122, 132);
  shine.addColorStop(0, 'rgb(255 255 255 / 0.55)');
  shine.addColorStop(0.45, 'rgb(255 255 255 / 0)');
  shine.addColorStop(1, 'rgb(0 0 0 / 0.18)');
  ctx.fillStyle = shine;
  ctx.fillRect(0, 0, 240, 260);
  ctx.restore();
  ctx.fillStyle = 'rgb(255 255 255 / 0.6)';
  ctx.beginPath();
  ctx.ellipse(82, 76, 15, 28, 0.55, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

/** A small picture, such as a prize, drawn once from an emoji. */
function makeMarkSprite(mark) {
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

/** A soap bubble, see-through with a soft edge, for a power-up to float up in. */
function makeBubbleSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 240;
  canvas.height = 240;
  const ctx = canvas.getContext('2d');
  const body = ctx.createRadialGradient(120, 120, 60, 120, 120, 116);
  body.addColorStop(0, 'rgb(220 245 255 / 0.18)');
  body.addColorStop(0.8, 'rgb(190 225 255 / 0.32)');
  body.addColorStop(0.93, 'rgb(255 200 240 / 0.55)');
  body.addColorStop(1, 'rgb(255 255 255 / 0)');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(120, 120, 116, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgb(255 255 255 / 0.8)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(120, 120, 108, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgb(255 255 255 / 0.75)';
  ctx.beginPath();
  ctx.ellipse(78, 72, 22, 12, -0.7, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

/** A friend peeping over the side of a basket: Giraffe, Mochi, Frost or Truffle, from simple shapes. */
function makeFriendSprite(who) {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  const ctx = canvas.getContext('2d');
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  const blob = (x, y, rx, ry, colour, angle = 0) => {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  };
  const looks = {
    giraffe: { face: '#f5c451', inner: '#fff0c9' },
    mochi: { face: '#ffffff', inner: '#ffc2d8' },
    frost: { face: '#2f4a6b', inner: '#ffffff' },
    truffle: { face: '#ffb3c6', inner: '#ff8fae' },
  }[who];
  if (who === 'giraffe') {
    // Two little horns with round tips, and ears.
    for (const x of [72, 128]) {
      ctx.fillStyle = '#c98a3a';
      ctx.fillRect(x - 5, 40, 10, 34);
      ctx.strokeRect(x - 5, 40, 10, 34);
      blob(x, 38, 11, 11, '#8a5a34');
    }
    blob(46, 92, 22, 12, looks.face, -0.4);
    blob(154, 92, 22, 12, looks.face, 0.4);
  } else if (who === 'mochi') {
    blob(76, 50, 15, 44, looks.face, -0.15);
    blob(124, 50, 15, 44, looks.face, 0.15);
    ctx.fillStyle = looks.inner;
    for (const [x, a] of [[76, -0.15], [124, 0.15]]) {
      ctx.beginPath();
      ctx.ellipse(x, 52, 6, 32, a, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (who === 'truffle') {
    blob(62, 66, 18, 16, looks.face, -0.6);
    blob(138, 66, 18, 16, looks.face, 0.6);
  }
  blob(100, 120, 62, 56, looks.face);
  if (who === 'giraffe') {
    ctx.fillStyle = '#c98a3a';
    for (const [x, y, r] of [[64, 100, 9], [138, 96, 8], [126, 140, 7]]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    blob(100, 150, 34, 22, looks.inner);
  } else if (who === 'frost') {
    blob(100, 132, 44, 40, looks.inner);
    blob(100, 140, 13, 8, '#ffb703');
  } else if (who === 'truffle') {
    blob(100, 142, 22, 15, looks.inner);
    ctx.fillStyle = INK;
    for (const x of [93, 107]) {
      ctx.beginPath();
      ctx.arc(x, 142, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    blob(100, 140, 9, 6, '#ff7eb6');
  }
  for (const x of [80, 120]) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, 112, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(x + 2, 114, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgb(255 120 140 / 0.5)';
  for (const x of [62, 138]) {
    ctx.beginPath();
    ctx.ellipse(x, 134, 9, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}

const CLOUD_HEIGHT = 170;

function makeCloudSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = CLOUD_HEIGHT;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  for (const [x, y, r] of [[70, 92, 42], [130, 66, 56], [196, 76, 48], [250, 98, 34], [160, 104, 50]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}

/** A glove that the wrong answer can burn. It gets its colour back gradually, as it cools. */
class BalloonGlove extends Glove {
  burnt = 0; // Seconds of being held open still needed, after popping a wrong answer.
  smokeIn = 0;

  draw(ctx, palmSize, look = null) {
    this.stain = this.burnt > 0 ? 0.25 + 0.75 * (this.burnt / COOL_SECONDS) : 0;
    this.embers = this.burnt > 0;
    super.draw(ctx, palmSize, look);
  }
}

// With several playing at one camera, the outline of each of the other gloves, in the order they came. Each is
// still green when open and yellow when not, as the first one is.
const GUEST_INKS = ['#1f5fd0', '#b4530a', '#7a3cc2'];

export class BalloonField {
  /**
   * events: onPop(total), onBump(side), onGoal(), onWrong(side), onCooled(side), onPrize(kind, total),
   * onPower(kind). language() says which language a new thing's label is in, and prizeTarget() where on
   * the screen the prize tally is, for a caught prize to fly to.
   */
  constructor(canvas, events = {}, { language = () => 'en', prizeTarget = () => ({ x: 80, y: 40 }) } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.events = events;
    this.language = language;
    this.prizeTarget = prizeTarget;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.sprites = COLOURS.map(makeBalloonSprite);
    this.rainbowSprite = makeRainbowSprite();
    this.bubbleSprite = makeBubbleSprite();
    this.marks = Object.fromEntries([...Object.entries(PRIZE_MARKS), ...Object.entries(POWER_MARKS), ['present', '🎁']]
      .map(([key, mark]) => [key, makeMarkSprite(mark)]));
    this.friends = Object.fromEntries(FRIENDS.map((who) => [who, makeFriendSprite(who)]));
    this.prizes = [];
    this.flying = [];
    this.labels = [];
    this.baskets = [];
    this.chain = [];
    this.power = null;
    this.bird = null;
    this.introduced = new Set();
    this.cloud = makeCloudSprite();
    this.gloves = { left: new BalloonGlove('left'), right: new BalloonGlove('right') };
    // With several playing at one camera, a glove for each hand but the first: see setPlayers in core/hands.js.
    this.guests = [];
    this.balloons = [];
    this.shards = [];
    this.rings = [];
    this.smoke = [];
    this.numbered = false; // Whether balloons wait with answers on them, rather than floating by.
    this.gentle = false;
    // How many balloons can float away before the game is over. Infinity on Gentle, with friends, and with the
    // maths challenge, whose balloons wait.
    this.awayAllowed = Infinity;
    this.rightNumber = null;
    this.wrong = { left: 0, right: 0 };
    // Playing with friends, everyone plays with the same balloons: see setShared.
    this.shared = null;
    this.nextId = 1;
    this.gone = new Set();
    this.aspect = 16 / 9;
    this.time = 0;
    this.spawnTimer = 0;
    this.nextColour = 0;
    this.clouds = Array.from({ length: 6 }, (_, index) => ({
      at: index / 6 + Math.random() * 0.1,
      y: 0.05 + Math.random() * 0.42,
      size: 0.35 + Math.random() * 0.55,
      drift: 0.004 + Math.random() * 0.006,
    }));
    this.configure({ goal: 20, pace: 'slow', reach: 'little', side: 'right' });
    this.setLevel(1);
    this.reset({});

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  configure({ goal = this.goal, pace = this.paceName, reach = this.reachName, side = this.side }) {
    const turned = this.side !== side;
    this.goal = goal;
    this.paceName = pace;
    this.reachName = reach;
    this.side = side;
    // A place's landmarks stand on the side away from the hand in play.
    if (turned && this.width && this.plan?.place !== 'hills') this.paintBackdrop();
  }

  /**
   * What this level changes: see rules.js. A new place is painted when the level brings one. gentle is the
   * game as it was, where floating away costs nothing, whose levels climb more gently.
   */
  setLevel(level, { gentle = this.gentle } = {}) {
    const place = this.plan?.place;
    this.level = level;
    this.gentle = gentle;
    this.plan = balloonLevel(level, { gentle });
    if (this.width && place !== this.plan.place) this.paintBackdrop();
  }

  /** The chosen speed, with this level's on top. */
  get pace() {
    const chosen = PACES[this.paceName];
    const { plan } = this;
    return { rise: chosen.rise * plan.rise, every: chosen.every * plan.every, most: chosen.most + plan.most };
  }

  /** How far the breeze has pushed everything sideways just now, in pixels. */
  get breezeAt() {
    if (!this.plan.breeze) return 0;
    return Math.sin(this.time * BREEZE_RATE) * this.plan.breeze * this.width * (this.reducedMotion ? 0.4 : 1);
  }

  resetCounts() {
    this.popped = { left: 0, right: 0 };
    this.wrong = { left: 0, right: 0 };
    this.caught = { left: 0, right: 0 }; // Prizes caught by each hand.
    this.prizeKinds = { sweet: 0, star: 0, gem: 0, heart: 0 };
    this.reachedGoal = false;
    // Balloons that floated off the top while they could still have been popped, and whether too many have.
    this.away = 0;
    this.tooManyAway = false;
    for (const glove of this.hands) glove.burnt = 0;
  }

  /** A new round: an empty sky and nothing popped. */
  reset(options) {
    this.configure(options);
    this.resetCounts();
    this.balloons = [];
    this.shards = [];
    this.rings = [];
    this.smoke = [];
    this.prizes = [];
    this.flying = [];
    this.labels = [];
    this.baskets = [];
    this.chain = [];
    this.spreads = [];
    this.power = null;
    this.bird = null;
    this.introduced = new Set();
    this.owed = { power: false, basket: false };
    this.powerTimer = FIRST_POWER_AFTER;
    this.basketTimer = FIRST_BASKET_AFTER;
    this.powerTurn = 0;
    this.friendTurn = 0;
    this.spawnTimer = 0;
    this.numbered = false;
    this.rightNumber = null;
    this.nextId = 1;
    this.gone = new Set();
  }

  /**
   * Playing with friends, everyone plays with the same balloons, and the same sums. The host's game runs
   * them, and sends where they are to the others' games, which show them. Anyone can pop any of them, and
   * whoever's hand gets there first has it: a balloon touched here goes at once, and shared.claim(balloon,
   * side, right) asks the server whose it is. shared is { host, claim, world() }, where world() is where the
   * host's balloons are now, for a game that isn't the host's, or null to play alone again.
   */
  setShared(shared) {
    this.shared = shared;
    this.gone = new Set();
    if (!shared) return;
    // Plain balloons, and the sums, for everyone: what the levels add would be one child's and not another's.
    this.plan = { ...this.plan, pairs: 0, big: 0, rainbow: 0, stars: 0, presents: 0, powers: [], powerEvery: 0, baskets: 0, prizes: [] };
  }

  /** A balloon that went to someone, here or on a friend's computer, pops here too, if it's still here. */
  removeShared(id, { burst = true } = {}) {
    this.gone.add(id);
    const balloon = this.balloons.find((each) => each.id === id);
    if (!balloon) return null;
    this.balloons = this.balloons.filter((each) => each !== balloon);
    if (burst) this.burst(balloon);
    return balloon;
  }

  /** A balloon that went to the child counts. */
  score(side) {
    this.popped[side] += 1;
    this.events.onPop?.(this.total);
  }

  /** On a friend's game, the host's balloons where they are now, and the sum, if one is being asked. */
  syncWorld() {
    const world = this.shared.world();
    if (!world) return;
    const known = new Map(this.balloons.map((balloon) => [balloon.id, balloon]));
    let right = null;
    let numbered = false;
    this.balloons = world.b.filter(([id]) => !this.gone.has(id)).map(([id, x, y, r, colour, shown, flags]) => {
      const balloon = known.get(id) ?? this.sharedBalloon(id);
      balloon.x = x * this.width;
      balloon.homeX = balloon.x;
      balloon.y = y * this.height;
      balloon.r = r * this.height;
      balloon.sprite = colour % this.sprites.length;
      balloon.leaving = Boolean(flags & 2);
      if (shown >= 0) {
        numbered = true;
        balloon.number = shown;
        balloon.arrived = Boolean(flags & 1);
        if (flags & 4) right = shown;
      } else {
        delete balloon.number;
      }
      return balloon;
    });
    this.numbered = numbered;
    this.rightNumber = right;
  }

  /** One of the host's balloons, as this game keeps it: where it is comes from the host each frame. */
  sharedBalloon(id) {
    return { id, homeX: 0, x: 0, y: 0, still: true, r: this.balloonSize, sprite: 0, pace: 0, phase: 0, swayRate: 0, sway: 0, drift: 0, push: 0, pushSpeed: 0, bumpedAt: -Infinity, star: false, choosing: 0, tie: null, kind: null, power: null, born: this.time, ready: false, arrived: false };
  }

  get prizeTotal() {
    return this.caught.left + this.caught.right;
  }

  /** Where balloons with answers wait, within reach of the hand, staggered so they don't touch. */
  numberSpots(count) {
    // With friends, right across, as each may be playing with a different hand.
    const [low, high] = this.shared ? [0.12, 0.88] : { left: [0.1, 0.66], right: [0.34, 0.9] }[this.side];
    // For a child whose reach is limited, they're closer together.
    const tighten = this.shared ? 0 : { none: 0, little: 0.02, lots: 0.05 }[this.reachName];
    const from = low + tighten;
    const to = high - tighten;
    return Array.from({ length: count }, (_, index) => ({
      x: (from + ((index + 0.5) / count) * (to - from)) * this.width,
      y: NUMBER_ROWS[index % 2] * this.height,
    }));
  }

  /** Balloons with these numbers on come up and wait. Anything still up there floats away. */
  askNumbers(numbers, right) {
    this.numbered = true;
    this.rightNumber = right;
    this.clearNumbers();
    this.rightNumber = right;
    const spots = this.numberSpots(numbers.length);
    numbers.forEach((number, index) => {
      const { x, y } = spots[index];
      const balloon = this.addBalloon({ x, y: this.height + this.balloonSize * 2.4, still: true });
      Object.assign(balloon, {
        number,
        hoverY: y,
        r: this.balloonSize * NUMBERED_SIZE,
        arrived: false,
        ready: false,
        choosing: 0,
      });
    });
  }

  /** Whatever is up there floats away, and nothing can be popped until the next question. */
  clearNumbers() {
    this.rightNumber = null;
    for (const balloon of this.balloons) balloon.leaving = true;
  }

  /** Back to balloons floating by, with no numbers on them. */
  stopNumbers() {
    this.clearNumbers();
    this.numbered = false;
    for (const glove of this.hands) glove.burnt = 0;
  }

  get total() {
    return this.popped.left + this.popped.right;
  }

  get info() {
    return {
      total: this.total,
      goal: this.goal,
      popped: { ...this.popped },
      wrong: { ...this.wrong },
      caught: { ...this.caught },
      prizes: { ...this.prizeKinds },
      progress: clamp(this.total / this.goal, 0, 1),
      away: this.away,
      awayAllowed: this.awayAllowed,
    };
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.ratio);
    this.canvas.height = Math.round(this.height * this.ratio);
    this.palmSize = Math.max(44, this.height * PALM_SHARE);
    this.balloonSize = Math.max(30, this.height * BALLOON_SHARE);
    this.paintBackdrop();
  }

  /**
   * The sky and the place only change with the window and the level, so they're drawn once and reused:
   * the hills, the sea from level 5, or the Harvest Fair from level 8. What makes each place itself
   * stands at the far edge, away from where balloons come up, and nothing in it moves.
   */
  paintBackdrop() {
    const { width, height, ratio } = this;
    this.backdrop = document.createElement('canvas');
    this.backdrop.width = this.canvas.width;
    this.backdrop.height = this.canvas.height;
    const ctx = this.backdrop.getContext('2d');
    ctx.scale(ratio, ratio);

    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#58b7ff');
    sky.addColorStop(0.72, '#d6f0ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    const sun = ctx.createRadialGradient(width * 0.84, height * 0.16, 0, width * 0.84, height * 0.16, height * 0.3);
    sun.addColorStop(0, 'rgb(255 244 190 / 0.95)');
    sun.addColorStop(0.3, 'rgb(255 244 190 / 0.6)');
    sun.addColorStop(1, 'rgb(255 244 190 / 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, width, height);

    const hill = (colour, base, size, stretch, shift) => {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let x = 0; x <= width; x += 8) {
        const u = (x / width) * stretch + shift;
        ctx.lineTo(x, height * base - height * size * (Math.sin(u) * 0.6 + Math.sin(u * 2.3 + 1) * 0.4));
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fill();
    };
    const place = this.plan?.place ?? 'hills';
    if (place === 'seaside') {
      this.paintSeaside(ctx, hill);
      return;
    }
    if (place === 'fair') this.paintFair(ctx);
    hill('#a6e4b4', 0.82, 0.05, 5, 0.6);
    hill('#7ed492', 0.88, 0.045, 7, 2.4);
    hill('#5cc471', 0.95, 0.035, 9, 4.1);
    if (place === 'fair') this.paintTents(ctx);
  }

  /** The edge of the screen away from the hand in play, where a place's landmarks stand. */
  farEdge(share) {
    return (this.side === 'left' ? 1 - share : share) * this.width;
  }

  /** By the sea: a far headland, calm water with two sailing boats, a lighthouse, and sand. */
  paintSeaside(ctx, hill) {
    const { width, height } = this;
    hill('#a6e4b4', 0.76, 0.04, 3, 0.6);
    const sea = ctx.createLinearGradient(0, height * 0.78, 0, height);
    sea.addColorStop(0, '#7fd0f2');
    sea.addColorStop(1, '#4fb3e3');
    ctx.fillStyle = sea;
    ctx.fillRect(0, height * 0.78, width, height * 0.22);
    ctx.strokeStyle = 'rgb(255 255 255 / 0.55)';
    ctx.lineWidth = Math.max(2, height * 0.004);
    ctx.lineCap = 'round';
    for (let i = 0; i < 9; i += 1) {
      const x = ((i * 0.37 + 0.05) % 1) * width;
      const y = height * (0.83 + ((i * 0.53) % 1) * 0.08);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + height * 0.03, y - height * 0.012, x + height * 0.06, y);
      ctx.stroke();
    }
    // Sand along the bottom.
    ctx.fillStyle = '#f6dfa4';
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let x = 0; x <= width; x += 10) ctx.lineTo(x, height * 0.955 - height * 0.012 * Math.sin((x / width) * 9));
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();
    // A red and white lighthouse on the far side.
    const lx = this.side === 'left' ? width - height * 0.09 : height * 0.09;
    const top = height * 0.56;
    const base = height * 0.8;
    const w = height * 0.05;
    for (let band = 0; band < 4; band += 1) {
      ctx.fillStyle = band % 2 ? '#ffffff' : '#ef5b5b';
      const y0 = top + ((base - top) * band) / 4;
      const y1 = top + ((base - top) * (band + 1)) / 4;
      const half0 = w * (0.75 + 0.25 * (band / 4));
      const half1 = w * (0.75 + 0.25 * ((band + 1) / 4));
      ctx.beginPath();
      ctx.moveTo(lx - half0, y0);
      ctx.lineTo(lx + half0, y0);
      ctx.lineTo(lx + half1, y1);
      ctx.lineTo(lx - half1, y1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#fff3b0';
    ctx.fillRect(lx - w * 0.6, top - height * 0.05, w * 1.2, height * 0.05);
    ctx.fillStyle = '#ef5b5b';
    ctx.beginPath();
    ctx.moveTo(lx - w * 0.9, top - height * 0.05);
    ctx.lineTo(lx, top - height * 0.1);
    ctx.lineTo(lx + w * 0.9, top - height * 0.05);
    ctx.closePath();
    ctx.fill();
    // Two little sailing boats, far out.
    for (const [share, size, colour] of [[0.3, 1, '#ffd23f'], [0.62, 0.8, '#ff7eb6']]) {
      const x = this.farEdge(share);
      const y = height * 0.86;
      const s = height * 0.05 * size;
      ctx.fillStyle = '#8a5a34';
      ctx.beginPath();
      ctx.moveTo(x - s, y);
      ctx.lineTo(x + s, y);
      ctx.lineTo(x + s * 0.7, y + s * 0.4);
      ctx.lineTo(x - s * 0.7, y + s * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.moveTo(x, y - s * 1.6);
      ctx.lineTo(x + s * 0.9, y - s * 0.1);
      ctx.lineTo(x, y - s * 0.1);
      ctx.closePath();
      ctx.fill();
    }
  }

  /** The Harvest Fair: a big wheel standing still behind the hills on the far side. */
  paintFair(ctx) {
    const { height } = this;
    const x = this.side === 'left' ? this.width - height * 0.2 : height * 0.2;
    const y = height * 0.6;
    const r = height * 0.17;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(3, height * 0.007);
    ctx.beginPath();
    ctx.moveTo(x - r * 0.5, height * 0.86);
    ctx.lineTo(x, y);
    ctx.lineTo(x + r * 0.5, height * 0.86);
    ctx.stroke();
    ctx.strokeStyle = '#ff7eb6';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = Math.max(2, height * 0.004);
    ctx.strokeStyle = '#ffffff';
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
      ctx.stroke();
      ctx.fillStyle = COLOURS[i % COLOURS.length];
      ctx.beginPath();
      ctx.roundRect(x + Math.cos(angle) * r - height * 0.016, y + Math.sin(angle) * r, height * 0.032, height * 0.026, height * 0.008);
      ctx.fill();
    }
  }

  /** Two striped tents in front of the hills, at the far side. */
  paintTents(ctx) {
    const { height } = this;
    for (const [share, colour] of [[0.05, '#ef5b5b'], [0.17, '#3b82f6']]) {
      const x = this.farEdge(share);
      const base = height * 0.93;
      const w = height * 0.08;
      for (let stripe = 0; stripe < 4; stripe += 1) {
        ctx.fillStyle = stripe % 2 ? '#ffffff' : colour;
        const x0 = x - w + (stripe * w) / 2;
        ctx.beginPath();
        ctx.moveTo(x, base - w * 1.4);
        ctx.lineTo(x0, base);
        ctx.lineTo(x0 + w / 2, base);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(x, base - w * 1.45, height * 0.008, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Puts a balloon somewhere exact, for the automated tests. */
  spawnAt(x, y, { still = false } = {}) {
    return this.addBalloon({ x, y, still });
  }

  /**
   * A balloon. kind is what's special about it, if anything: 'present' carries a present, 'rainbow'
   * spreads its pop, 'big' pops into three, and 'power' is a soap bubble with a power-up in it.
   */
  addBalloon({ x, y, still = false, star = false, kind = null, power = null }) {
    const wanderer = !kind && Math.random() < this.plan.wanderers;
    const balloon = {
      id: this.nextId++,
      homeX: x,
      x,
      y,
      still,
      r: this.balloonSize * between(0.9, 1.15),
      sprite: this.nextColour,
      pace: still ? 0 : between(0.85, 1.15) * (wanderer ? 0.72 : 1),
      phase: Math.random() * Math.PI * 2,
      swayRate: between(0.5, 0.9),
      sway: still ? 0 : this.width * (wanderer ? between(0.07, 0.11) : between(0.015, 0.035)) * (this.reducedMotion ? 0.4 : 1),
      drift: wanderer && !still ? between(-0.03, 0.03) * this.width : 0,
      push: 0,
      pushSpeed: 0,
      bumpedAt: -Infinity,
      star,
      choosing: 0,
      tie: null,
      kind,
      power,
      born: this.time,
    };
    if (kind === 'big') {
      balloon.r = this.balloonSize * BIG_SIZE;
      balloon.pace *= 0.85;
    } else if (kind === 'power') {
      balloon.r = this.balloonSize * 1.2;
      balloon.pace *= 0.9;
    }
    this.nextColour = (this.nextColour + 1) % this.sprites.length;
    this.balloons.push(balloon);
    // The first time each new kind comes along, it gets a little label, once it's up on the screen.
    balloon.intro = kind === 'power' ? power : kind ?? (star ? 'starBalloon' : null);
    return balloon;
  }

  /** Balloons come up across the hand's own side and a little past the middle. */
  spawn() {
    const { width, height } = this;
    // With friends, right across, as each may be playing with a different hand.
    const range = this.shared ? [0.1, 0.9] : { left: [0.1, 0.66], right: [0.34, 0.9] }[this.side];
    // A few tries for a clear patch of sky, so balloons don't start on top of each other.
    let x = 0;
    for (let tries = 0; tries < 5; tries += 1) {
      x = between(range[0], range[1]) * width;
      const crowded = this.balloons.some((other) => other.y > height * 0.7 && Math.abs(other.x - x) < other.r * 2.6);
      if (!crowded) break;
    }
    const y = height + this.balloonSize * 1.6;
    const { plan } = this;
    const room = this.pace.most - this.balloons.length;
    // A friend in a basket, or a power-up, takes the next balloon's turn when one is due.
    // While a basket is due, no more balloons come until there's room for its three, which is soon, as
    // balloons float off the top all the time. So there are never more up than the level allows.
    if (this.owed.basket && this.playing) {
      if (room < BASKET_BALLOONS) return;
      this.owed.basket = false;
      this.addBasket(x, y);
      return;
    }
    if (this.owed.power && this.playing) {
      this.owed.power = false;
      // The newest kind first, and then each in turn.
      const kinds = plan.powers;
      const power = kinds[(kinds.length - 1 + this.powerTurn) % kinds.length];
      this.powerTurn += 1;
      this.addBalloon({ x, y, kind: 'power', power });
      return;
    }
    if (room >= 2 && Math.random() < plan.pairs) {
      this.addPair(x, y);
      return;
    }
    if (plan.big && Math.random() < plan.big) {
      this.addBalloon({ x, y, kind: 'big' });
      return;
    }
    if (plan.rainbow && Math.random() < plan.rainbow) {
      this.addBalloon({ x, y, kind: 'rainbow' });
      return;
    }
    const star = Math.random() < plan.stars;
    const present = !star && plan.presents > 0 && Math.random() < plan.presents;
    this.addBalloon({ x, y, star, kind: present ? 'present' : null });
  }

  /** Two balloons tied together, which go up together until one of them pops. */
  addPair(x, y) {
    const apart = this.balloonSize * 1.05;
    const middle = clamp(x, apart + this.balloonSize, this.width - apart - this.balloonSize);
    const first = this.addBalloon({ x: middle - apart, y });
    const second = this.addBalloon({ x: middle + apart, y: y - this.balloonSize * 0.5 });
    // They move as one: the same pace, sway and drift.
    for (const key of ['pace', 'phase', 'swayRate', 'sway', 'drift']) second[key] = first[key];
    const tie = { members: [first, second], popped: 0 };
    first.tie = tie;
    second.tie = tie;
    if (this.plan.prizes.includes('gem')) second.intro = 'pair';
    return tie;
  }

  /**
   * A friend in a basket, under three balloons. It rises more slowly with each one popped, and once all
   * three are, it comes gently down and leaves a heart.
   */
  addBasket(x, y) {
    const size = this.balloonSize;
    const middle = clamp(x, size * 2.4, this.width - size * 2.4);
    const basket = {
      x: middle,
      y: y + size * 3,
      r: size * 0.95,
      friend: FRIENDS[this.friendTurn++ % FRIENDS.length],
      state: 'rising',
      left: BASKET_BALLOONS,
      phase: Math.random() * Math.PI * 2,
      fade: 1,
      balloons: [],
    };
    const spots = [[-1.05, -2.5], [0, -3.15], [1.05, -2.5]];
    for (const [dx, dy] of spots) {
      const balloon = this.addBalloon({ x: middle + dx * size, y: basket.y + dy * size });
      Object.assign(balloon, { basket, offset: { x: dx * size, y: dy * size }, sway: 0, drift: 0 });
      basket.balloons.push(balloon);
    }
    this.baskets.push(basket);
    basket.intro = 'basket';
    return basket;
  }

  /**
   * One frame. snapshot is the hand monitor's latest, or null for no hands. popping and
   * spawning are off outside of play, while balloons just float behind the other screens.
   */
  update(dt, snapshot, { aspect = this.aspect, popping = false, spawning = true, showHands = false } = {}) {
    this.time += dt;
    this.aspect = aspect;
    // Power-ups, friends in baskets and the labels for new things are only for play, never behind a card.
    this.playing = popping;

    for (const side of ['left', 'right']) {
      const glove = this.gloves[side];
      if (showHands && snapshot?.side === side) glove.follow(snapshot[side], dt, this);
      else glove.hide();
      if (popping) this.coolGlove(glove, dt);
    }
    // Everyone else's hands, with several playing: each pops, bumps and is burnt as the first does.
    const others = snapshot?.guests ?? [];
    if (this.guests.length !== others.length) this.guests = others.map((_, index) => this.guests[index] ?? Object.assign(new BalloonGlove(snapshot.side), { place: index + 1 }));
    this.guests.forEach((glove, index) => {
      glove.side = snapshot.side;
      if (showHands) glove.follow(others[index], dt, this);
      else glove.hide();
      if (popping) this.coolGlove(glove, dt);
    });

    const { pace, plan } = this;
    // On a friend's game the balloons are the host's, where the host's game says they are.
    const following = Boolean(this.shared && !this.shared.host);
    if (following) this.syncWorld();
    if (spawning && !this.numbered && !following) {
      // Power-ups and friends in baskets come along every so often, from their levels.
      if (popping && plan.powerEvery && !this.power && !this.owed.power && !this.balloons.some(({ kind }) => kind === 'power')) {
        this.powerTimer -= dt;
        if (this.powerTimer <= 0) {
          this.owed.power = true;
          this.powerTimer = plan.powerEvery;
        }
      }
      if (popping && plan.baskets && !this.baskets.length && !this.owed.basket) {
        this.basketTimer -= dt;
        if (this.basketTimer <= 0) {
          this.owed.basket = true;
          this.basketTimer = plan.baskets;
        }
      }
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.balloons.length < pace.most) {
        this.spawn();
        this.spawnTimer = pace.every * between(0.8, 1.2);
      }
    }
    if (popping) {
      // A power-up's time only runs while the hand in play counts as open, so resting never wastes it.
      // A hand that's missing, unsure or overlapping the other doesn't count: it fails closed.
      const open = snapshot?.handOpen === true && snapshot.side === this.side;
      this.updatePower(dt, open);
      this.updateBird(dt, open);
      this.updateChain();
    } else if (this.bird?.state === 'leaving') {
      // Once play is over, a bluebird on its way off carries on, rather than waiting by the finish card.
      this.updateBird(dt, false);
    }
    this.updateBaskets(dt, pace);

    // A pop can add balloons, as a big one pops into three, so they're kept on after the ones gone through.
    const before = this.balloons;
    const count = before.length;
    const kept = [];
    for (let index = 0; index < count; index += 1) {
      const balloon = before[index];
      if (balloon.popNow && !balloon.leaving) {
        this.pop(balloon, balloon.popNow);
        continue;
      }
      balloon.popNow = null;
      if (!following) this.moveBalloon(balloon, dt, pace);
      if (popping && balloon.intro && balloon.y < this.height - balloon.r * 1.5) {
        if (this.introduce(balloon.intro, balloon) || this.introduced.has(balloon.intro)) balloon.intro = null;
      }
      if (popping && balloon.y < this.height + balloon.r && this.touchGloves(balloon, dt)) continue;
      if (balloon.y > -balloon.r * 3.2) kept.push(balloon);
      else if (popping) this.floatedAway(balloon, snapshot);
    }
    this.balloons = kept.concat(before.slice(count));

    this.updatePrizes(dt, popping);
    this.updateEffects(dt);
    for (const cloud of this.clouds) {
      if (!this.reducedMotion) cloud.at = (cloud.at + cloud.drift * dt) % 1.3;
    }

    if (popping && !this.reachedGoal && this.total >= this.goal) {
      this.reachedGoal = true;
      this.events.onGoal?.();
    } else if (popping && !this.reachedGoal && !this.tooManyAway && this.away >= this.awayAllowed) {
      this.tooManyAway = true;
      this.events.onTooManyAway?.();
    }
  }

  /**
   * A balloon has floated off the top of the sky. An ordinary one that could have been popped has got away,
   * unless the camera can't see the hand in play just then: a child who's out of the picture isn't counted
   * against. A power-up's bubble, an answer, a friend's basket and the shared balloons of friends don't count.
   */
  floatedAway(balloon, snapshot) {
    if (this.awayAllowed === Infinity || this.shared || this.numbered) return;
    if (balloon.kind === 'power' || balloon.number !== undefined || balloon.leaving || balloon.basket) return;
    const hand = snapshot?.[this.side];
    const seen = Boolean(hand) && hand.status !== 'missing' && hand.reason !== 'edge' && hand.reason !== 'small';
    if (!seen) return;
    this.away += 1;
    this.events.onAway?.(this.away);
  }

  /* ---------- prizes, power-ups and helpers, from the higher levels ---------- */

  /** A new thing's label, the first time it comes along in a game, one at a time so they're read. */
  introduce(key, target) {
    if (this.introduced.has(key) || this.labels.length || !LABELS[key]) return false;
    this.introduced.add(key);
    const [en, ka] = LABELS[key];
    this.labels.push({ key, target, life: LABEL_SECONDS, text: this.language() === 'ka' ? ka : en });
    return true;
  }

  /** A prize comes out of something popped. It hops a little, then falls slowly. */
  dropPrize(kind, x, y) {
    if (!this.plan.prizes.includes(kind)) return null;
    const prize = {
      kind,
      x,
      y,
      homeX: x,
      vy: kind === 'sweet' ? 0 : -this.height * 0.14,
      r: this.height * PRIZE_SHARE * (kind === 'sweet' ? 1.15 : 1),
      age: 0,
      phase: Math.random() * Math.PI * 2,
      fade: 1,
    };
    this.prizes.push(prize);
    this.introduce(kind, prize);
    return prize;
  }

  /** Every glove there is: the hand in play's and the other hand's, and with several playing, everyone else's. */
  get hands() {
    return [...Object.values(this.gloves), ...this.guests];
  }

  /** Prizes fall, drift towards a nearby hand, and are caught by the glove coming near, open or closed. */
  updatePrizes(dt, catching) {
    // With several playing, each prize is for whoever's glove is nearest it.
    const catchers = [this.gloves[this.side], ...this.guests].filter((each) => each.visible);
    const awayFrom = (each, prize) => Math.hypot(each.x - prize.x, each.y - prize.y);
    const magnet = this.power?.kind === 'magnet';
    const range = (magnet ? MAGNET.pullRange : PRIZE.pullRange) * this.height;
    const pull = (magnet ? MAGNET.pull : PRIZE.pull) * this.height;
    const reach = this.palmSize * (PRIZE.catchPalms + (this.power?.kind === 'bubble' ? BUBBLE_REACH : 0));
    const fall = PRIZE.fall * this.height;
    this.prizes = this.prizes.filter((prize) => {
      prize.age += dt;
      prize.vy = Math.min(prize.vy + this.height * 0.5 * dt, fall * (prize.kind === 'sweet' ? 0.85 : 1));
      prize.y += prize.vy * dt;
      const glove = catchers.reduce((nearest, each) => (!nearest || awayFrom(each, prize) < awayFrom(nearest, prize) ? each : nearest), null);
      if (catching && glove) {
        const dx = glove.x - prize.x;
        const dy = glove.y - prize.y;
        const away = Math.hypot(dx, dy);
        // A present is seen falling for a moment before it can be caught.
        if (away <= reach + prize.r && prize.age > (prize.kind === 'sweet' ? 0.6 : 0.3)) {
          this.catchPrize(prize);
          return false;
        }
        if (away < range && away > 1) {
          prize.homeX += (dx / away) * pull * dt;
          prize.y += (dy / away) * pull * dt;
        }
      }
      const sway = (this.reducedMotion ? 0.4 : 1) * Math.sin(this.time * 1.3 + prize.phase) * this.height * 0.018;
      prize.x = clamp(prize.homeX + sway, prize.r, this.width - prize.r);
      // One that isn't caught lands on the hills and fades. Missing it costs nothing.
      if (prize.y > this.height * 0.9) prize.fade -= dt;
      return prize.fade > 0;
    });
    for (const flight of this.flying) flight.t += dt;
    this.flying = this.flying.filter((flight) => flight.t < PRIZE_FLY_SECONDS);
    for (const label of this.labels) label.life -= dt;
    this.labels = this.labels.filter((label) => label.life > 0);
  }

  catchPrize(prize) {
    const { side } = this;
    this.caught[side] += 1;
    this.prizeKinds[prize.kind] += 1;
    this.flying.push({ kind: prize.kind, x: prize.x, y: prize.y, t: 0 });
    this.rings.push({ x: prize.x, y: prize.y, r: prize.r, life: 0.32, colour: '#ffd23f' });
    this.events.onPrize?.(prize.kind, this.prizeTotal);
  }

  /** A power-up's bubble was popped: it lasts a few seconds. */
  startPower(kind, glove) {
    this.power = { kind, left: POWER_SECONDS };
    if (kind === 'bird') {
      this.bird = { x: glove.x, y: glove.y - this.palmSize * 1.4, state: 'with', next: 0.5, flap: 0, target: null };
    }
    this.events.onPower?.(kind);
  }

  /** A power-up's time runs out, but only while the hand in play is open. */
  updatePower(dt, open) {
    if (!this.power) return;
    if (open) this.power.left -= dt;
    if (this.power.left > 0) return;
    if (this.power.kind === 'bird' && this.bird) this.bird.state = 'leaving';
    this.power = null;
  }

  /** Play is over: a power-up stops, and the bluebird flies off. */
  endPlay() {
    this.power = null;
    if (this.bird) this.bird.state = 'leaving';
  }

  /**
   * The bluebird stays by the hand, and while the hand is open, every so often it flies to a balloon near
   * it and pops it. So a closed hand never pops anything, even with its help, as its time doesn't run then.
   */
  updateBird(dt, open) {
    const { bird } = this;
    if (!bird) return;
    bird.flap += dt * (this.reducedMotion ? 3 : 6);
    const glove = this.gloves[this.side];
    if (bird.state === 'leaving') {
      bird.x += this.width * 0.12 * dt;
      bird.y -= this.height * 0.35 * dt;
      if (bird.y < -this.height * 0.1) this.bird = null;
      return;
    }
    if (bird.state === 'going') {
      const { target } = bird;
      bird.t += dt;
      const share = ease(Math.min(1, bird.t / BIRD.flySeconds));
      bird.x = bird.from.x + (target.x - bird.from.x) * share;
      bird.y = bird.from.y + (target.y - target.r * 0.6 - bird.from.y) * share;
      if (bird.t >= BIRD.flySeconds) {
        if (this.balloons.includes(target) && !target.popNow && !target.leaving && !this.numbered) target.popNow = this.side;
        bird.state = 'with';
      }
      return;
    }
    if (!glove.visible) return;
    const home = { x: glove.x + this.palmSize * 1.1, y: glove.y - this.palmSize * 1.3 };
    const follow = Math.min(1, dt * 4);
    bird.x += (home.x - bird.x) * follow;
    bird.y += (home.y - bird.y) * follow;
    if (!open) return;
    bird.next -= dt;
    if (bird.next > 0) return;
    bird.next = BIRD.every;
    if (this.numbered) return;
    let best = null;
    let bestGap = BIRD.range * this.height;
    for (const balloon of this.balloons) {
      if (balloon.number !== undefined || balloon.kind === 'power' || balloon.popNow || balloon.leaving || balloon.y > this.height) continue;
      const gap = Math.hypot(balloon.x - glove.x, balloon.y - glove.y);
      if (gap < bestGap) {
        best = balloon;
        bestGap = gap;
      }
    }
    if (best) Object.assign(bird, { state: 'going', target: best, from: { x: bird.x, y: bird.y }, t: 0 });
  }

  /** A rainbow balloon's pop spreading, one balloon after another. */
  updateChain() {
    this.chain = this.chain.filter(({ balloon, at, side }) => {
      if (this.numbered) return false;
      if (this.time < at) return true;
      if (this.balloons.includes(balloon) && !balloon.popNow && !balloon.leaving) balloon.popNow = side;
      return false;
    });
  }

  /**
   * Friends' baskets rise with their balloons, and come down once they've all been popped. Reach help and
   * the magnet bring a basket to the hand by the same rules as a balloon on its own, all of it together,
   * going by whichever of its balloons is nearest the hand.
   */
  updateBaskets(dt, pace) {
    const breeze = this.breezeAt;
    const glove = this.gloves[this.side];
    const edge = this.balloonSize * 2.4;
    this.baskets = this.baskets.filter((basket) => {
      if (basket.state === 'rising') {
        basket.y -= pace.rise * 0.8 * this.height * dt * (basket.left / BASKET_BALLOONS);
        const reachable = basket.balloons.filter(({ leaving }) => !leaving);
        if (glove.visible && reachable.length) {
          const gap = (balloon) => Math.hypot(balloon.x - glove.x, balloon.y - glove.y);
          const nearest = reachable.reduce((best, balloon) => (gap(balloon) < gap(best) ? balloon : best));
          const pull = this.pullTowardsHand(nearest, dt);
          basket.x = clamp(basket.x + pull.x, edge, this.width - edge);
          basket.y += pull.y;
        }
      } else if (basket.state === 'falling') {
        basket.y += BASKET_FALL * this.height * dt;
        if (basket.y >= this.height * 0.86) basket.state = 'landed';
      } else {
        basket.fade -= dt / 1.5;
      }
      basket.drawX = clamp(basket.x + breeze, basket.r, this.width - basket.r);
      if (this.playing && basket.intro && basket.y < this.height * 0.85) {
        if (this.introduce(basket.intro, basket) || this.introduced.has(basket.intro)) basket.intro = null;
      }
      return basket.fade > 0 && basket.y > -this.height * 0.25;
    });
  }

  /**
   * A big balloon pops into three ordinary ones. Each starts inside where the big one was, and drifts out
   * to its own place within about a second, the two at the sides out of reach of a hand that stays where
   * the big one was, so each is reached for. Its own sway and the breeze are allowed for from the start,
   * so it never jumps sideways.
   */
  split(balloon) {
    for (let i = 0; i < BIG_SPLITS_INTO; i += 1) {
      const angle = -Math.PI / 2 + (i - 1) * 1.1;
      const to = clamp(balloon.x + Math.cos(angle) * balloon.r * 2, this.balloonSize, this.width - this.balloonSize);
      const from = balloon.x + (to - balloon.x) * 0.25;
      const little = this.addBalloon({ x: from, y: balloon.y + Math.sin(angle) * balloon.r * 1.1 });
      little.homeX = to - this.swayOf(little) - this.breezeOn(little);
      // A push that starts at the gap and dies away smoothly carries it out from where it starts.
      little.push = from - to;
      little.pushSpeed = (to - from) * 2.3;
      // A moment to be seen before it can be popped.
      little.fresh = true;
    }
  }

  /** A burnt glove only cools while it's held open, and it smokes until it has. */
  coolGlove(glove, dt) {
    if (glove.burnt <= 0 || !glove.visible) return;
    glove.smokeIn -= dt;
    if (glove.smokeIn <= 0) {
      glove.smokeIn = SMOKE_EVERY * (this.reducedMotion ? 2 : 1);
      this.addSmoke(glove.x, glove.y - this.palmSize * 0.5, 1);
    }
    if (glove.status !== 'open') return;
    glove.burnt = Math.max(0, glove.burnt - dt);
    if (glove.burnt === 0) this.events.onCooled?.(glove.side);
  }

  addSmoke(x, y, count) {
    for (let i = 0; i < count; i += 1) {
      this.smoke.push({
        x: x + between(-0.5, 0.5) * this.palmSize,
        y,
        vx: between(-0.03, 0.03) * this.height,
        vy: -between(0.08, 0.16) * this.height,
        size: this.palmSize * between(0.22, 0.42),
        life: 0.9,
      });
    }
  }

  moveBalloon(balloon, dt, pace) {
    const { width, height } = this;
    if (balloon.basket) {
      // Tied to a friend's basket, and going wherever it goes.
      const { basket } = balloon;
      balloon.x = (basket.drawX ?? basket.x) + balloon.offset.x;
      balloon.y = basket.y + balloon.offset.y + Math.sin(this.time * 1.2 + balloon.phase) * balloon.r * 0.05;
      return;
    }
    if (balloon.leaving) {
      balloon.y -= NUMBER_LEAVE * height * dt;
    } else if (balloon.number === undefined) {
      balloon.y -= pace.rise * balloon.pace * height * dt;
    } else if (!balloon.arrived) {
      balloon.y -= NUMBER_RISE * height * dt;
      if (balloon.y <= balloon.hoverY) balloon.arrived = true;
    } else {
      // Waiting for as long as it takes, bobbing a little.
      const bob = this.reducedMotion ? 0 : Math.sin(this.time * 1.1 + balloon.phase) * height * 0.008;
      balloon.y += (balloon.hoverY + bob - balloon.y) * Math.min(1, dt * 3);
    }
    balloon.homeX += balloon.drift * dt;
    if (balloon.homeX < width * 0.08 || balloon.homeX > width * 0.92) balloon.drift *= -1;

    // A bump pushes a balloon aside, and it eases back.
    balloon.push += balloon.pushSpeed * dt;
    balloon.pushSpeed *= Math.exp(-dt * 3.2);
    balloon.push *= Math.exp(-dt * 0.9);

    const pull = this.pullTowardsHand(balloon, dt);
    balloon.homeX += pull.x;
    balloon.y += pull.y;

    balloon.x = clamp(balloon.homeX + this.swayOf(balloon) + this.breezeOn(balloon) + balloon.push, balloon.r, width - balloon.r);
  }

  /** How far a balloon has swayed from where it's heading just now, in pixels. */
  swayOf(balloon) {
    return Math.sin(this.time * balloon.swayRate + balloon.phase) * balloon.sway;
  }

  /** How far the breeze has pushed a balloon sideways just now, in pixels. Balloons that wait are still. */
  breezeOn(balloon) {
    return balloon.still || balloon.number !== undefined ? 0 : this.breezeAt;
  }

  /**
   * How far reach help and the magnet draw a balloon towards the hand this frame, in pixels. Reach help
   * draws it to a nearby open hand, for a child whose reach is limited. The magnet draws it to the hand in
   * play, open or closed, while it lasts. Balloons that wait for an answer stay where they are.
   */
  pullTowardsHand(balloon, dt) {
    const { height } = this;
    const pull = { x: 0, y: 0 };
    // With friends, no balloon drifts towards one child's hand, as that would be theirs before anyone's.
    if (balloon.still || this.shared) return pull;
    const towards = (glove, speed, nearest, furthest) => {
      const dx = glove.x - balloon.x;
      const dy = glove.y - balloon.y;
      const away = Math.hypot(dx, dy);
      if (away <= nearest || away >= furthest) return;
      pull.x += (dx / away) * speed * dt;
      pull.y += (dy / away) * speed * dt;
    };
    const help = REACH_HELP[this.reachName] * height;
    if (help > 0) {
      for (const glove of this.hands) {
        if (glove.visible && glove.status === 'open') towards(glove, help, 1, height * REACH_HELP_RANGE);
      }
    }
    const glove = this.gloves[this.side];
    if (this.power?.kind === 'magnet' && glove.visible && balloon.number === undefined && balloon.kind !== 'power') {
      towards(glove, MAGNET.balloonPull * height, balloon.r, height * MAGNET.balloonRange);
    }
    return pull;
  }

  /** Whether a balloon with an answer on it has been chosen, and what that means for the glove. */
  touchNumbered(balloon, dt) {
    if (balloon.leaving || !balloon.arrived) return false;
    const glove = this.hands.find((each) => each.visible && each.reachTo(balloon.x, balloon.y, this.palmSize) <= balloon.r);
    // A hand that was already there when it arrived hasn't chosen it, so it has to come back.
    if (!balloon.ready) {
      if (!glove) balloon.ready = true;
      return false;
    }
    if (!glove || glove.status !== 'open' || glove.burnt > 0) {
      balloon.choosing = Math.max(0, balloon.choosing - dt * 2);
      if (glove && this.time - balloon.bumpedAt > BUMP_REST_SECONDS) {
        balloon.bumpedAt = this.time;
        balloon.pushSpeed += (Math.sign(balloon.x - glove.x) || 1) * this.height * 0.4;
        if (glove.status !== 'open') this.events.onBump?.(glove.side);
      }
      return false;
    }
    balloon.choosing += dt;
    if (balloon.choosing < CHOOSE_SECONDS) return false;
    if (balloon.number === this.rightNumber) {
      this.pop(balloon, glove.side);
    } else {
      this.burn(balloon, glove);
      // With friends, it's gone for everyone, though only this glove is burnt.
      if (this.shared) {
        this.gone.add(balloon.id);
        this.shared.claim(balloon, glove.side, false);
      }
    }
    return true;
  }

  /** The wrong answer goes up in smoke, and takes the glove with it for a while. */
  burn(balloon, glove) {
    this.wrong[glove.side] += 1;
    glove.burnt = COOL_SECONDS;
    glove.smokeIn = 0;
    this.addSmoke(balloon.x, balloon.y, this.reducedMotion ? 4 : 9);
    this.events.onWrong?.(glove.side);
  }

  /** Returns whether the balloon popped. */
  touchGloves(balloon, dt) {
    if (balloon.number !== undefined) return this.touchNumbered(balloon, dt);
    if (balloon.leaving) return false;
    if (balloon.fresh) {
      if (this.time - balloon.born < 0.5) return false;
      balloon.fresh = false;
    }
    let held = false;
    // The bubble round the glove reaches a little further.
    const extra = this.power?.kind === 'bubble' ? this.palmSize * BUBBLE_REACH : 0;
    // A balloon this game has already let go of, while the host's still has it, can't be popped again.
    if (this.shared && this.gone.has(balloon.id)) return true;
    for (const glove of this.hands) {
      if (!glove.visible || glove.reachTo(balloon.x, balloon.y, this.palmSize) > balloon.r + extra) continue;
      if (glove.status === 'open' && balloon.kind === 'power') {
        this.popPower(balloon, glove);
        return true;
      }
      if (glove.status === 'open' && balloon.star) {
        // A star balloon needs the open hand to stay on it for a moment.
        held = true;
        balloon.choosing += dt;
        if (balloon.choosing < STAR_HOLD_SECONDS) continue;
        this.pop(balloon, glove.side);
        return true;
      }
      if (glove.status === 'open') {
        this.pop(balloon, glove.side);
        return true;
      }
      if (this.time - balloon.bumpedAt > BUMP_REST_SECONDS) {
        balloon.bumpedAt = this.time;
        const direction = Math.sign(balloon.x - glove.x) || 1;
        balloon.pushSpeed += direction * this.height * 0.75;
        this.events.onBump?.(glove.side);
      }
    }
    if (!held) balloon.choosing = Math.max(0, balloon.choosing - dt * 2);
    return false;
  }

  /** A power-up's bubble pops softly, and doesn't count as a balloon. */
  popPower(balloon, glove) {
    this.rings.push({ x: balloon.x, y: balloon.y, r: balloon.r * 0.8, life: 0.32, colour: '#ffffff' });
    this.startPower(balloon.power, glove);
  }

  pop(balloon, side) {
    // With friends, it goes at once, and the server says whose it is: see score().
    if (this.shared) {
      this.gone.add(balloon.id);
      this.burst(balloon);
      this.shared.claim(balloon, side, true);
      return;
    }
    this.popped[side] += 1;
    // Its partner floats on by itself. Popping both drops a gem.
    if (balloon.tie) {
      balloon.tie.members = balloon.tie.members.filter((member) => member !== balloon);
      balloon.tie.popped += 1;
      if (balloon.tie.popped === 2) this.dropPrize('gem', balloon.x, balloon.y);
    }
    if (balloon.kind === 'present') this.dropPrize('sweet', balloon.x, balloon.y + balloon.r * 2.1);
    if (balloon.star) this.dropPrize('star', balloon.x, balloon.y);
    if (balloon.basket) {
      const { basket } = balloon;
      basket.left -= 1;
      basket.balloons = basket.balloons.filter((member) => member !== balloon);
      if (basket.left === 0) {
        basket.state = 'falling';
        this.dropPrize('heart', basket.drawX ?? basket.x, basket.y - basket.r);
      }
    }
    if (balloon.kind === 'rainbow') this.spreadPop(balloon, side);
    if (balloon.kind === 'big') this.split(balloon);
    this.burst(balloon);
    this.events.onPop?.(this.total);
  }

  /** A balloon's pop: bits of it flying off, and a ring. */
  burst(balloon) {
    const colour = balloon.kind === 'rainbow' ? RAINBOW[Math.floor(Math.random() * RAINBOW.length)] : COLOURS[balloon.sprite];
    const count = this.reducedMotion ? 7 : 15;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const speed = between(0.35, 0.95) * this.height;
      this.shards.push({
        x: balloon.x,
        y: balloon.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        spin: between(-9, 9),
        turn: Math.random() * Math.PI,
        size: balloon.r * between(0.16, 0.3),
        life: 0.55,
        colour,
      });
    }
    this.rings.push({ x: balloon.x, y: balloon.y, r: balloon.r * 0.7, life: 0.32, colour });
  }

  /** A rainbow balloon's pop spreads to the balloons round it, one after another, nearest first. */
  spreadPop(rainbow, side) {
    const reach = this.balloonSize * CHAIN_REACH;
    const near = this.balloons
      .filter((other) => other !== rainbow && other.number === undefined && other.kind !== 'power' && !other.popNow && !other.leaving && other.y < this.height)
      .map((other) => ({ other, gap: Math.hypot(other.x - rainbow.x, other.y - rainbow.y) }))
      .filter(({ gap }) => gap < reach)
      .sort((a, b) => a.gap - b.gap)
      .slice(0, CHAIN_MOST);
    near.forEach(({ other }, index) => this.chain.push({ balloon: other, at: this.time + CHAIN_GAP * (index + 1) * (this.reducedMotion ? 1.5 : 1), side }));
    this.spreads.push({ x: rainbow.x, y: rainbow.y, r: rainbow.r, life: 0.9 });
  }

  updateEffects(dt) {
    const gravity = this.height * 1.5;
    for (const shard of this.shards) {
      shard.life -= dt;
      shard.vy += gravity * dt;
      shard.vx *= Math.exp(-dt * 2.4);
      shard.x += shard.vx * dt;
      shard.y += shard.vy * dt;
      shard.turn += shard.spin * dt;
    }
    this.shards = this.shards.filter((shard) => shard.life > 0);
    for (const ring of this.rings) {
      ring.life -= dt;
      ring.r += this.height * 0.6 * dt;
    }
    this.rings = this.rings.filter((ring) => ring.life > 0);
    for (const puff of this.smoke) {
      puff.life -= dt;
      puff.x += puff.vx * dt;
      puff.y += puff.vy * dt;
      puff.size += this.palmSize * 0.5 * dt;
    }
    this.smoke = this.smoke.filter((puff) => puff.life > 0);
    // A rainbow's ring grows slowly and fades.
    for (const spread of this.spreads) {
      spread.life -= dt;
      spread.r += this.balloonSize * 2.6 * dt;
    }
    this.spreads = this.spreads.filter((spread) => spread.life > 0);
  }

  drawBalloon(balloon) {
    const { ctx } = this;
    const { x, y } = balloon;
    if (balloon.kind === 'power') {
      this.drawPowerBubble(balloon);
      return;
    }
    // The three a big balloon pops into grow quickly to their size.
    const r = balloon.r * Math.min(1, 0.45 + (this.time - balloon.born) * 2.2);
    if (balloon.basket) {
      this.drawBasketString(balloon);
    } else {
      this.drawString(balloon, r);
    }
    const lean = balloon.basket ? 0 : this.leanOf(balloon);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean);
    ctx.drawImage(balloon.kind === 'rainbow' ? this.rainbowSprite : this.sprites[balloon.sprite], -r * 1.2, -r * 1.22, r * 2.4, r * 3);
    if (balloon.number !== undefined) this.drawNumber(balloon);
    else if (balloon.star) this.drawStar(balloon);
    ctx.restore();
  }

  /** How far a balloon leans into its movement. */
  leanOf(balloon) {
    const breezeLean = balloon.still || balloon.number !== undefined || !this.plan.breeze
      ? 0
      : Math.cos(this.time * BREEZE_RATE) * this.plan.breeze * 2.4;
    return clamp((Math.cos(this.time * balloon.swayRate + balloon.phase) * balloon.sway) / (this.width * 0.6) + balloon.pushSpeed / (this.height * 6) + breezeLean, -0.3, 0.3);
  }

  /** A balloon's string trailing behind, down to a knot with its partner's, or to a present. */
  drawString(balloon, r) {
    const { ctx } = this;
    const { x, y } = balloon;
    const lean = this.leanOf(balloon);
    const tail = r * 1.16;
    const flutter = Math.sin(this.time * 1.7 + balloon.phase) * r * 0.26;

    ctx.strokeStyle = 'rgb(18 48 77 / 0.45)';
    ctx.lineWidth = Math.max(1.5, r * 0.035);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - lean * tail, y + tail);
    const pair = balloon.tie?.members.length === 2 ? balloon.tie.members : null;
    if (pair) {
      // Both strings go down to one knot between them.
      const knotX = (pair[0].x + pair[1].x) / 2 - lean * r * 2;
      const knotY = Math.max(pair[0].y, pair[1].y) + tail + r * 1.4;
      ctx.quadraticCurveTo(x - lean * r, y + tail + r * 0.8, knotX, knotY);
      if (balloon === pair[0]) ctx.lineTo(knotX - lean * r - flutter * 0.4, knotY + r * 0.9);
    } else if (balloon.kind === 'present') {
      // A shorter string, with a present tied on the end.
      const endX = x - lean * r * 1.6;
      const endY = y + tail + r * 0.7;
      ctx.quadraticCurveTo(x - lean * r + flutter * 0.4, y + tail + r * 0.4, endX, endY);
      ctx.stroke();
      const size = r * 0.95;
      ctx.drawImage(this.marks.present, endX - size / 2, endY - size * 0.12, size, size);
      return;
    } else {
      ctx.quadraticCurveTo(x - lean * r * 2 + flutter, y + tail + r * 0.75, x - lean * r * 2.8 - flutter * 0.6, y + tail + r * 1.5);
    }
    ctx.stroke();
  }

  /** A balloon's string going down to its friend's basket. */
  drawBasketString(balloon) {
    const { ctx } = this;
    const { basket } = balloon;
    const bx = basket.drawX ?? basket.x;
    ctx.strokeStyle = 'rgb(18 48 77 / 0.45)';
    ctx.lineWidth = Math.max(1.5, balloon.r * 0.035);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(balloon.x, balloon.y + balloon.r * 1.16);
    ctx.lineTo(bx + Math.sign(balloon.offset.x) * basket.r * 0.7, basket.y - basket.r * 0.35);
    ctx.stroke();
  }

  /** A soap bubble with a power-up inside it. */
  drawPowerBubble(balloon) {
    const { ctx } = this;
    const { x, y, r } = balloon;
    const wobble = this.reducedMotion ? 0 : Math.sin(this.time * 1.6 + balloon.phase) * 0.03;
    ctx.drawImage(this.bubbleSprite, x - r * (1 + wobble), y - r * (1 - wobble), r * 2 * (1 + wobble), r * 2 * (1 - wobble));
    const size = r * 1.05;
    ctx.drawImage(this.marks[balloon.power], x - size / 2, y - size / 2, size, size);
  }

  /** A friend's basket, with the friend peeping out and waving once they're on the way down. */
  drawBasket(basket) {
    const { ctx } = this;
    const x = basket.drawX ?? basket.x;
    const { y, r } = basket;
    ctx.save();
    ctx.globalAlpha = clamp(basket.fade, 0, 1);
    if (basket.state !== 'rising') {
      // A little parachute, the colour of a balloon, for coming down gently.
      ctx.fillStyle = '#ff7eb6';
      ctx.beginPath();
      ctx.arc(x, y - r * 2.1, r * 1.3, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgb(18 48 77 / 0.45)';
      ctx.lineWidth = Math.max(1.5, r * 0.04);
      ctx.beginPath();
      for (const side of [-1, 1]) {
        ctx.moveTo(x + side * r * 1.25, y - r * 2.05);
        ctx.lineTo(x + side * r * 0.7, y - r * 0.35);
      }
      ctx.stroke();
    }
    // The friend, behind the front of the basket.
    const size = r * 1.7;
    const bob = basket.state === 'rising' ? 0 : Math.sin(this.time * 2.2) * r * 0.05;
    ctx.drawImage(this.friends[basket.friend], x - size / 2, y - r * 2.05 + bob, size, size);
    ctx.fillStyle = '#c98a3a';
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, r * 0.07);
    ctx.beginPath();
    ctx.moveTo(x - r * 0.9, y - r * 0.35);
    ctx.lineTo(x + r * 0.9, y - r * 0.35);
    ctx.lineTo(x + r * 0.7, y + r * 0.55);
    ctx.lineTo(x - r * 0.7, y + r * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgb(120 70 30 / 0.6)';
    ctx.lineWidth = Math.max(1.5, r * 0.04);
    ctx.beginPath();
    for (const share of [0.25, 0.55]) {
      const yy = y - r * 0.35 + r * 0.9 * share;
      ctx.moveTo(x - r * (0.9 - 0.2 * share), yy);
      ctx.lineTo(x + r * (0.9 - 0.2 * share), yy);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** A star balloon has a white star on it, and the ring that closes as an open hand stays on it. */
  drawStar({ r, choosing }) {
    const { ctx } = this;
    ctx.fillStyle = 'rgb(255 255 255 / 0.92)';
    ctx.strokeStyle = 'rgb(18 48 77 / 0.35)';
    ctx.lineWidth = Math.max(1.5, r * 0.05);
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const radius = (i % 2 === 0 ? 0.5 : 0.22) * r;
      const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius + r * 0.02);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (choosing > 0) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = r * 0.12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, choosing / STAR_HOLD_SECONDS));
      ctx.stroke();
    }
  }

  /** The answer, and a ring around it that closes as an open hand stays on it. */
  drawNumber({ number, r, choosing }) {
    const { ctx } = this;
    ctx.font = `700 ${Math.round(r * 1.1)}px Fredoka, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = r * 0.16;
    ctx.strokeStyle = INK;
    ctx.fillStyle = '#ffffff';
    ctx.strokeText(String(number), 0, r * 0.04);
    ctx.fillText(String(number), 0, r * 0.04);
    if (choosing > 0) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = r * 0.12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, choosing / CHOOSE_SECONDS));
      ctx.stroke();
    }
  }

  /**
   * Friends' gloves, playing on their own computers, where their hands really are, in light grey under the
   * child's own, with each friend's name over theirs. They're only there to see: they pop nothing here.
   * main.js keeps friendsGloves up to date, as [{ glove, name, fade }].
   */
  drawFriendsGloves() {
    const { ctx, palmSize } = this;
    for (const { glove, name, fade } of this.friendsGloves ?? []) {
      if (!glove.visible || fade < 0.02) continue;
      // Solid, as a see-through one shows its outline through itself, and only fading as it comes and goes.
      glove.draw(ctx, palmSize, { fill: '#e3e8ee', ink: '#9aa8b6', alpha: fade });
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.font = `700 ${Math.round(palmSize * 0.32)}px Fredoka, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const y = glove.y - palmSize * 1.55;
      const wide = ctx.measureText(name).width + palmSize * 0.4;
      ctx.fillStyle = 'rgba(18, 48, 77, 0.72)';
      ctx.beginPath();
      ctx.roundRect(glove.x - wide / 2, y - palmSize * 0.42, wide, palmSize * 0.48, palmSize * 0.24);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(name, glove.x, y);
      ctx.restore();
    }
  }

  render() {
    const { ctx, width, height, ratio } = this;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.drawImage(this.backdrop, 0, 0, width, height);

    ctx.globalAlpha = 0.9;
    for (const cloud of this.clouds) {
      const w = height * 0.42 * cloud.size;
      ctx.drawImage(this.cloud, cloud.at * width * 1.1 - w * 0.6, cloud.y * height, w, (w * CLOUD_HEIGHT) / 320);
    }
    ctx.globalAlpha = 1;

    for (const balloon of this.balloons) this.drawBalloon(balloon);
    for (const basket of this.baskets) this.drawBasket(basket);
    for (const prize of this.prizes) this.drawPrize(prize);

    for (const spread of this.spreads) {
      // A soft rainbow ring, growing slowly as the pop spreads.
      ctx.lineWidth = Math.max(3, height * 0.01);
      RAINBOW.forEach((colour, index) => {
        ctx.strokeStyle = colour;
        ctx.globalAlpha = clamp(spread.life / 0.9, 0, 1) * 0.45;
        ctx.beginPath();
        ctx.arc(spread.x, spread.y, spread.r + index * ctx.lineWidth, 0, Math.PI * 2);
        ctx.stroke();
      });
    }
    ctx.globalAlpha = 1;

    for (const ring of this.rings) {
      ctx.strokeStyle = ring.colour;
      ctx.globalAlpha = clamp(ring.life / 0.32, 0, 1) * 0.7;
      ctx.lineWidth = Math.max(2, height * 0.008);
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const shard of this.shards) {
      ctx.fillStyle = shard.colour;
      ctx.globalAlpha = clamp(shard.life / 0.3, 0, 1);
      ctx.save();
      ctx.translate(shard.x, shard.y);
      ctx.rotate(shard.turn);
      ctx.fillRect(-shard.size / 2, -shard.size / 3, shard.size, (shard.size * 2) / 3);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    this.drawFriendsGloves();
    this.gloves.left.draw(ctx, this.palmSize);
    this.gloves.right.draw(ctx, this.palmSize);
    for (const glove of this.guests) glove.draw(ctx, this.palmSize, { ink: GUEST_INKS[(glove.place - 1) % GUEST_INKS.length] });
    this.drawPower();
    if (this.bird) this.drawBird(this.bird);
    this.drawFlying();

    ctx.fillStyle = '#5b5552';
    for (const puff of this.smoke) {
      ctx.globalAlpha = clamp(puff.life / 0.9, 0, 1) * 0.5;
      ctx.beginPath();
      ctx.arc(puff.x, puff.y, puff.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const label of this.labels) this.drawLabel(label);
  }

  /** A prize falling: a present on a little parachute, a star, a gem or a heart. */
  drawPrize(prize) {
    const { ctx } = this;
    const { x, y, r } = prize;
    ctx.save();
    ctx.globalAlpha = clamp(prize.fade, 0, 1);
    if (prize.kind === 'sweet') {
      ctx.fillStyle = 'rgb(255 255 255 / 0.9)';
      ctx.strokeStyle = 'rgb(18 48 77 / 0.4)';
      ctx.lineWidth = Math.max(1.5, r * 0.05);
      ctx.beginPath();
      ctx.arc(x, y - r * 1.5, r * 1.15, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      for (const side of [-1, 1]) {
        ctx.moveTo(x + side * r * 1.1, y - r * 1.45);
        ctx.lineTo(x + side * r * 0.45, y - r * 0.5);
      }
      ctx.stroke();
      ctx.drawImage(this.marks.present, x - r, y - r * 0.85, r * 2, r * 2);
    } else {
      // Turns slowly, so it catches the eye without anything flashing.
      const turn = this.reducedMotion ? 0 : Math.sin(this.time * 1.4 + prize.phase) * 0.25;
      ctx.translate(x, y);
      ctx.rotate(turn);
      ctx.drawImage(this.marks[prize.kind], -r, -r, r * 2, r * 2);
    }
    ctx.restore();
  }

  /** A caught prize flying up to the tally, getting smaller. */
  drawFlying() {
    if (!this.flying.length) return;
    const { ctx } = this;
    const to = this.prizeTarget();
    for (const flight of this.flying) {
      const share = ease(Math.min(1, flight.t / PRIZE_FLY_SECONDS));
      const x = flight.x + (to.x - flight.x) * share;
      const y = flight.y + (to.y - flight.y) * share - Math.sin(share * Math.PI) * this.height * 0.08;
      const size = this.height * PRIZE_SHARE * (1.2 - 0.6 * share);
      ctx.drawImage(this.marks[flight.kind], x - size, y - size, size * 2, size * 2);
    }
  }

  /** What a power-up looks like on the glove, with a ring that goes down as its time runs out. */
  drawPower() {
    const { power } = this;
    const glove = this.gloves[this.side];
    if (!power || !glove.visible) return;
    const { ctx, palmSize } = this;
    const reach = palmSize * (0.62 + BUBBLE_REACH) + palmSize * 0.3;
    ctx.save();
    if (power.kind === 'bubble') {
      ctx.drawImage(this.bubbleSprite, glove.x - reach, glove.y - reach, reach * 2, reach * 2);
    } else if (power.kind === 'magnet') {
      const size = palmSize * 0.8;
      ctx.drawImage(this.marks.magnet, glove.x - size / 2, glove.y - palmSize * 1.9, size, size);
    }
    ctx.strokeStyle = 'rgb(255 255 255 / 0.85)';
    ctx.lineWidth = Math.max(3, palmSize * 0.07);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(glove.x, glove.y, reach + palmSize * 0.12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(power.left / POWER_SECONDS, 0, 1));
    ctx.stroke();
    ctx.restore();
  }

  /** The bluebird: round and blue, with a yellow beak and slow flapping wings. */
  drawBird(bird) {
    const { ctx } = this;
    const size = this.palmSize * 0.42;
    const flap = Math.sin(bird.flap) * 0.5;
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.lineWidth = Math.max(2, size * 0.1);
    ctx.strokeStyle = INK;
    ctx.fillStyle = '#5fa8ff';
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.rotate(side * (0.4 + flap));
      ctx.beginPath();
      ctx.ellipse(side * size * 0.9, -size * 0.2, size * 0.75, size * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#dff0ff';
    ctx.beginPath();
    ctx.ellipse(0, size * 0.4, size * 0.6, size * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffb703';
    ctx.beginPath();
    ctx.moveTo(size * 0.85, -size * 0.1);
    ctx.lineTo(size * 1.35, size * 0.05);
    ctx.lineTo(size * 0.85, size * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(size * 0.4, -size * 0.25, size * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** A new thing's little label, above it, fading in and out. */
  drawLabel(label) {
    const { ctx, height } = this;
    const { target } = label;
    const alpha = clamp(Math.min((LABEL_SECONDS - label.life) / 0.3, label.life / 0.6), 0, 1);
    const tx = target.drawX ?? target.x;
    const size = Math.max(16, height * 0.03);
    ctx.save();
    ctx.globalAlpha = alpha;
    // A soft ring round it, growing slowly.
    if (!this.reducedMotion) {
      ctx.strokeStyle = 'rgb(255 255 255 / 0.7)';
      ctx.lineWidth = Math.max(2, height * 0.005);
      ctx.beginPath();
      ctx.arc(tx, target.y, target.r * (1.35 + 0.25 * (1 - label.life / LABEL_SECONDS)), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.font = `600 ${Math.round(size)}px Fredoka, "Noto Sans Georgian", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(label.text).width + size * 1.2;
    const h = size * 1.7;
    const x = clamp(tx, w / 2 + 8, this.width - w / 2 - 8);
    const y = clamp(target.y - target.r * 1.6 - h, h / 2 + 90, height - h);
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
}
