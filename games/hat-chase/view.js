// What Hat Chase looks like: a path through the hills, seen from the side, with the character walking along it,
// the things in its way, the apple trees, the stars, and the magpie flying on ahead with the hat. The rules are in
// chase.js: this draws what they say, so the picture is never ahead of the game or behind it.
//
// The path is measured in metres, as the rules have it. The character stays a third of the way across the screen
// and the land goes by, the far hills more slowly than the near ones. Nothing flashes: things come and go a
// little at a time, and the land only moves as fast as the character walks.
import { MAGPIE, TREE } from './chase.js';
import { renderHiker } from './hikers.js';

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const lerp = (from, to, share) => from + (to - from) * share;
/** A number from 0 to 1 that's always the same for the same place: for what makes each tuft and flower its own. */
const chance = (n, salt = 0) => {
  const value = Math.sin(n * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
};

const INK = '#12304d';
const SKY = ['#bfe3f7', '#e9f6ee'];
const FAR_HILLS = '#b9dba9';
const NEAR_HILLS = '#9ccf86';
const GRASS = ['#7fc461', '#69b24e'];
const EARTH = ['#c79a63', '#a87c49'];
const PATH = '#e8cf9c';
const WATER = ['#7cc4ea', '#5aa9d6'];
const STAR = { fill: '#ffd23f', edge: '#e0a800' };

// Where things are on the screen, as shares of its width and height. The character is to the left while it
// walks, with the path ahead of it, beside the title card and the finish card, and in the middle to be chosen.
const PLACE = { ground: 0.76, tall: 0.25 };
const HERO_AT = { title: 0.14, choose: 0.5, play: 0.24, finish: 0.12, lost: 0.12 };
// Before a game, how far ahead of the character the magpie waits, in metres: clear of each screen's cards.
const WAITS_AT = { title: 11, choose: 2.6 };
const PLACE_RATE = 4; // How quickly the character goes over to its place when the screen changes, a second.
const SEEN_METRES = 17; // How much of the path a screen as wide as it is high and a half shows.
// How high things are off the path, in metres. The magpie flies above the coach's film, which is in the bottom
// right corner whenever something is asked of the child, so it's never hidden behind it.
const HEIGHTS = { leap: 1, big: 1.5, hop: 0.45, stone: 0.6, bounce: 2.4, star: 3.2, magpie: 4.5, high: 1.75, star0: 0.55 };
const FOLLOW = 7; // How quickly the view catches up with the character, a second.
const FADE_SECONDS = 0.35; // Something picked up goes over this long.

export class ChaseView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.time = 0;
    this.art = null; // The character's pictures, if they could be drawn.
    this.view = 'title';
    this.place = HERO_AT.title; // Where across the screen the character is, which eases over when the screen changes.
    this.chase = null;
    this.clear();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** Nothing left over from the last game. */
  clear() {
    this.camera = 0;
    this.crouch = 0;
    this.reach = 0;
    this.walked = 0;
    this.effects = []; // Stars popping, apples falling, numbers going up, dust: { kind, x, y, age, life, ... }.
    this.gone = new Map(); // What's been picked up, by its key, and how long ago: it fades.
    this.hat = null; // The hat coming down, once the game is won.
    this.cheering = 0;
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.ratio);
    this.canvas.height = Math.round(this.height * this.ratio);
    // A metre of path, in pixels: a wide screen shows more of it, and a narrow one never less than 9 metres.
    this.metre = Math.min(this.width / 9, (this.height * 1.5) / SEEN_METRES);
    this.ground = this.height * PLACE.ground;
  }

  /** The character who walks: one of the roster (core/body/roster.js). */
  setWalker(spec) {
    try {
      const tallest = Math.max(window.innerHeight, window.screen?.height || 0);
      this.art = renderHiker(spec, Math.round(tallest * PLACE.tall * this.ratio));
    } catch (error) {
      // Without its picture the game still works: a plain shape walks in its place.
      console.warn('Could not draw the character:', error);
      this.art = null;
    }
  }

  /** 'title', 'choose', 'play', 'finish' or 'lost': where the game is, for where the character stands, and how. */
  setView(name) {
    this.view = name;
  }

  /** A new game: its rules, and nothing left over. */
  setChase(chase) {
    this.chase = chase;
    this.clear();
  }

  /** How far the child's knees are bent and how high their arms are, each from 0 to 1, as the camera sees them now. */
  setBody({ crouch = 0, reach = 0 } = {}) {
    this.crouch = clamp(crouch, 0, 1);
    this.reach = clamp(reach, 0, 1);
  }

  /** Where a place on the path is on the screen, across. */
  across(x) {
    return this.width * this.place + (x - this.camera) * this.metre;
  }

  /** Where the character is on the screen, for the words that come up beside it and for the tests. */
  get heroAt() {
    const hero = this.chase?.hero;
    return { x: this.across(hero?.x ?? 0), y: this.ground - this.lift() * this.metre };
  }

  /** Where the magpie is on the screen, and whether that's in sight. */
  get magpieAt() {
    const x = this.across(this.chase?.magpie.x ?? WAITS_AT[this.view] ?? MAGPIE.start);
    return { x, y: this.ground - HEIGHTS.magpie * this.metre, seen: x < this.width - 12 };
  }

  /** What the rules say happened: see chase.js. */
  on(event) {
    const { chase } = this;
    if (!chase) return;
    const hero = chase.hero.x;
    switch (event.type) {
      case 'star':
        this.gone.set(`star-${event.star.index}`, 0);
        break;
      case 'stars':
        this.effects.push({ kind: 'number', text: `+${event.count}`, x: hero + 1.3, y: 1.1, age: 0, life: 1.1 });
        break;
      case 'apples':
        this.gone.set(`tree-${chase.trees.indexOf(event.tree)}`, 0);
        for (let n = 0; n < TREE.apples; n += 1) {
          this.effects.push({ kind: 'apple', x: event.tree.at + 0.6 + n * 0.9, y: 2.6 + chance(n, 3) * 0.5, age: -n * 0.12, life: 0.9 });
        }
        break;
      case 'high':
        this.gone.set(`high-${event.thing.index}`, 0);
        break;
      case 'jump':
        if (event.thing.kind === 'spring' && event.star) this.gone.set(`arc-${event.thing.index}`, 0);
        break;
      case 'tumble':
        for (let n = 0; n < 6; n += 1) this.effects.push({ kind: 'dust', x: hero + (chance(n, 9) - 0.5) * 1.2, y: 0.1 + chance(n, 4) * 0.3, age: 0, life: 0.7, drift: chance(n, 2) - 0.5 });
        break;
      case 'won':
        this.hat = { age: 0 };
        this.cheering = 1;
        break;
      default:
    }
  }

  /** How high off the path the character is right now, in metres, from what it's doing. */
  lift() {
    const move = this.chase?.hero.move;
    if (!move) return 0;
    const share = clamp(move.t / move.seconds, 0, 1);
    const arc = 4 * share * (1 - share);
    const tall = { leap: move.big ? HEIGHTS.big : HEIGHTS.leap, hop: HEIGHTS.hop, stone: HEIGHTS.stone, bounce: move.star ? HEIGHTS.star : HEIGHTS.bounce }[move.kind] ?? 0;
    return tall * arc;
  }

  update(dt) {
    this.time += dt;
    const hero = this.chase?.hero;
    const wanted = hero?.x ?? 0;
    // The view goes with the character, catching it up smoothly, so a step doesn't jolt the land.
    this.camera += (wanted - this.camera) * (1 - Math.exp(-dt * FOLLOW));
    if (Math.abs(wanted - this.camera) < 0.001) this.camera = wanted;
    // And over to its place for this screen, a little at a time, so the land never jumps.
    const place = HERO_AT[this.view] ?? HERO_AT.play;
    this.place += (place - this.place) * (1 - Math.exp(-dt * PLACE_RATE));
    if (Math.abs(place - this.place) < 0.0005) this.place = place;
    for (const [key, age] of this.gone) this.gone.set(key, age + dt);
    for (const effect of this.effects) effect.age += dt;
    this.effects = this.effects.filter((effect) => effect.age < effect.life);
    if (this.hat) this.hat.age += dt;
  }

  /* ---------- drawing ---------- */

  render() {
    const { ctx, ratio } = this;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.drawLand();
    const { chase } = this;
    if (chase) {
      for (const [index, tree] of chase.trees.entries()) this.drawAppleTree(tree, index);
      this.drawEnd(chase.end);
      for (const thing of chase.course) this.drawThing(thing);
      for (const star of chase.stars) this.drawPathStar(star);
    } else {
      this.drawEnd(11);
    }
    this.drawHero();
    if (chase) for (const thing of chase.course) this.drawInFront(thing);
    this.drawMagpie();
    this.drawEffects();
  }

  /** The sky, the hills going by, and the ground with the path along it. */
  drawLand() {
    const { ctx, width: w, height: h, ground, metre } = this;
    const sky = ctx.createLinearGradient(0, 0, 0, ground);
    sky.addColorStop(0, SKY[0]);
    sky.addColorStop(1, SKY[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    // The sun, standing still.
    ctx.fillStyle = 'rgba(255, 244, 200, 0.9)';
    ctx.beginPath();
    ctx.arc(w * 0.82, h * 0.16, h * 0.07, 0, Math.PI * 2);
    ctx.fill();
    // Clouds, drifting, and going by very slowly as the character walks.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    const drift = this.reducedMotion ? 0 : this.time * 6;
    for (let n = 0; n < 5; n += 1) {
      const span = w + 400;
      const x = ((n * 0.23 * span - this.camera * metre * 0.06 - drift) % span + span) % span - 200;
      const y = h * (0.1 + chance(n, 1) * 0.2);
      const r = h * (0.035 + chance(n, 2) * 0.02);
      for (const [dx, dy, s] of [[0, 0, 1], [-1.1, 0.2, 0.75], [1.1, 0.25, 0.8], [0.4, -0.5, 0.7]]) {
        ctx.beginPath();
        ctx.arc(x + dx * r, y + dy * r, r * s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    this.drawHills(FAR_HILLS, 0.16, h * 0.16, 0.0031, ground - h * 0.1);
    this.drawHills(NEAR_HILLS, 0.4, h * 0.1, 0.0052, ground - h * 0.03);
    // The ground: grass, then earth under it.
    const grass = ctx.createLinearGradient(0, ground, 0, h);
    grass.addColorStop(0, GRASS[0]);
    grass.addColorStop(1, GRASS[1]);
    ctx.fillStyle = grass;
    ctx.fillRect(0, ground - h * 0.012, w, h - ground + h * 0.012);
    // The path, worn along the top of it.
    ctx.fillStyle = PATH;
    ctx.fillRect(0, ground, w, h * 0.035);
    ctx.fillStyle = EARTH[0];
    ctx.fillRect(0, ground + h * 0.035, w, h * 0.012);
    // Tufts of grass and small flowers beside the path, each always in its own place.
    const first = Math.floor(this.camera - (w * this.place) / metre) - 1;
    const last = first + Math.ceil(w / metre) + 2;
    for (let place = first; place <= last; place += 1) {
      const x = this.across(place + chance(place, 5));
      const y = ground + h * (0.075 + chance(place, 6) * 0.13);
      if (chance(place, 7) < 0.55) {
        ctx.strokeStyle = '#5a9f43';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (const lean of [-0.4, 0, 0.4]) {
          ctx.moveTo(x, y);
          ctx.lineTo(x + lean * 9, y - 11);
        }
        ctx.stroke();
      } else {
        ctx.fillStyle = ['#fff7d6', '#ffd0e0', '#e3d4ff'][Math.floor(chance(place, 8) * 3)];
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f2b900';
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** A line of hills, which goes by at a share of how fast the path does. */
  drawHills(colour, share, tall, wave, base) {
    const { ctx, width: w, height: h } = this;
    const offset = this.camera * this.metre * share;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w + 24; x += 24) {
      const along = (x + offset) * wave;
      ctx.lineTo(x, base - tall * (0.5 + 0.32 * Math.sin(along) + 0.18 * Math.sin(along * 2.3 + 1.4)));
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }

  /** Whether something at this place on the path is anywhere near the screen. */
  near(x, wide = 0) {
    const left = this.across(x);
    return left < this.width + 6 * this.metre && left + wide * this.metre > -6 * this.metre;
  }

  /** How much of something picked up is still there: it goes a little at a time. */
  left(key) {
    const age = this.gone.get(key);
    return age === undefined ? 1 : clamp(1 - age / FADE_SECONDS, 0, 1);
  }

  drawStarShape(x, y, r, alpha = 1, colours = STAR) {
    const { ctx } = this;
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = colours.fill;
    ctx.strokeStyle = colours.edge;
    ctx.lineWidth = Math.max(1.5, r * 0.14);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let point = 0; point < 10; point += 1) {
      const angle = -Math.PI / 2 + (point * Math.PI) / 5;
      const far = point % 2 ? r * 0.46 : r;
      ctx.lineTo(x + Math.cos(angle) * far, y + Math.sin(angle) * far);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawPathStar(star) {
    if (!this.near(star.at)) return;
    const alpha = star.taken ? this.left(`star-${star.index}`) : 1;
    const rise = star.taken ? (1 - alpha) * 0.5 : 0;
    this.drawStarShape(this.across(star.at), this.ground - (HEIGHTS.star0 + rise) * this.metre, this.metre * 0.24, alpha);
  }

  /** An apple tree behind the path: the child reaches up under it, and its apples come down. */
  drawAppleTree(tree, index) {
    if (!this.near(tree.at, tree.wide)) return;
    const { ctx, ground, metre } = this;
    const x = this.across(tree.at + tree.wide / 2);
    ctx.fillStyle = '#8a5a34';
    ctx.fillRect(x - metre * 0.22, ground - metre * 2.5, metre * 0.44, metre * 2.5);
    ctx.fillStyle = '#4f9d4a';
    for (const [dx, dy, r] of [[0, -3.3, 1.3], [-1, -2.8, 1], [1, -2.8, 1], [0, -2.5, 1.1]]) {
      ctx.beginPath();
      ctx.arc(x + dx * metre, ground + dy * metre, r * metre, 0, Math.PI * 2);
      ctx.fill();
    }
    const alpha = tree.picked ? this.left(`tree-${index}`) : 1;
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#e2483d';
    for (let n = 0; n < TREE.apples + 2; n += 1) {
      ctx.beginPath();
      ctx.arc(x + (chance(n, 11) - 0.5) * 2.4 * metre, ground - (2.4 + chance(n, 12) * 1.3) * metre, metre * 0.17, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** The magpie's tree, at the end of the path, with its nest. */
  drawEnd(end) {
    const at = end + 1.6;
    if (!this.near(at, 3)) return;
    const { ctx, ground, metre } = this;
    const x = this.across(at);
    ctx.fillStyle = '#7a4f2d';
    ctx.fillRect(x - metre * 0.3, ground - metre * 3.4, metre * 0.6, metre * 3.4);
    ctx.fillStyle = '#3f8f52';
    for (const [dx, dy, r] of [[0, -4.4, 1.5], [-1.3, -3.7, 1.2], [1.3, -3.7, 1.2], [0, -3.4, 1.3]]) {
      ctx.beginPath();
      ctx.arc(x + dx * metre, ground + dy * metre, r * metre, 0, Math.PI * 2);
      ctx.fill();
    }
    // The nest, in the fork.
    ctx.fillStyle = '#b98b52';
    ctx.beginPath();
    ctx.ellipse(x - metre * 0.9, ground - metre * 2.9, metre * 0.55, metre * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Water between two banks, from one place on the path to another. */
  drawWater(from, to) {
    const { ctx, ground, height: h } = this;
    const [left, right] = [this.across(from), this.across(to)];
    const water = ctx.createLinearGradient(0, ground, 0, ground + h * 0.12);
    water.addColorStop(0, WATER[0]);
    water.addColorStop(1, WATER[1]);
    ctx.fillStyle = water;
    // It runs on down to the bottom of the screen, as a stream across the path would.
    ctx.fillRect(left, ground - h * 0.012, right - left, h - ground + h * 0.012);
    // Slow ripples, which only ever move a little.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 2;
    const sway = this.reducedMotion ? 0 : Math.sin(this.time * 0.9) * 4;
    for (let row = 0; row < 6; row += 1) {
      const y = ground + h * (0.02 + row * 0.035);
      for (let x = left + 14 + row * 9; x < right - 22; x += 46) {
        ctx.beginPath();
        ctx.moveTo(x + sway, y);
        ctx.quadraticCurveTo(x + 9 + sway, y - 4, x + 18 + sway, y);
        ctx.stroke();
      }
    }
  }

  /** What's in the way, behind the character. */
  drawThing(thing) {
    if (!this.near(thing.at, thing.wide)) return;
    const { ctx, ground, metre, height: h } = this;
    const { at, wide, kind } = thing;
    const [left, right, middle] = [this.across(at), this.across(at + wide), this.across(at + wide / 2)];
    if (kind === 'stream') {
      this.drawWater(at, at + wide);
      // Over it, something for a big jump: a star, or a golden feather.
      const alpha = thing.high.taken ? this.left(`high-${thing.index}`) : 1;
      const y = ground - HEIGHTS.high * metre;
      if (thing.high.feather) this.drawFeather(middle, y, metre * 0.42, alpha);
      else this.drawStarShape(middle, y, metre * 0.3, alpha);
    } else if (kind === 'stones') {
      this.drawWater(at, at + wide);
      ctx.fillStyle = '#9aa3ad';
      for (let stone = 1; stone < thing.times; stone += 1) {
        const x = this.across(at + (wide * stone) / thing.times);
        ctx.beginPath();
        ctx.ellipse(x, ground + h * 0.004, metre * 0.5, metre * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (kind === 'spring') {
      this.drawWater(at + 0.9, at + wide);
      // The springboard, on the near bank.
      ctx.fillStyle = '#e2483d';
      ctx.fillRect(left, ground - metre * 0.22, metre * 0.9, metre * 0.1);
      ctx.strokeStyle = '#6d7885';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (const leg of [0.12, 0.78]) {
        ctx.moveTo(left + metre * leg, ground - metre * 0.12);
        ctx.lineTo(left + metre * leg, ground);
      }
      ctx.stroke();
      // The arc of stars above, for a star jump.
      const alpha = this.left(`arc-${thing.index}`);
      for (let n = 0; n < 5; n += 1) {
        const share = (n + 1) / 6;
        this.drawStarShape(lerp(left, right, share), ground - (1.5 + 4 * share * (1 - share) * 1.9) * metre, metre * 0.22, alpha);
      }
    } else if (kind === 'branch') {
      // The tree it grows from stands behind the path, and the branch reaches over it at head height.
      ctx.fillStyle = '#7a4f2d';
      ctx.fillRect(right + metre * 0.2, ground - metre * 3.2, metre * 0.5, metre * 3.2);
      ctx.fillStyle = '#4f9d4a';
      for (const [dx, dy, r] of [[0.45, -3.6, 1.1], [1.3, -3.1, 0.9]]) {
        ctx.beginPath();
        ctx.arc(right + dx * metre, ground + dy * metre, r * metre, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (kind === 'bees') {
      // The hive hangs from a post beyond where the character stops.
      ctx.fillStyle = '#7a4f2d';
      ctx.fillRect(right + metre * 0.4, ground - metre * 2.6, metre * 0.16, metre * 2.6);
      ctx.fillRect(right - metre * 0.3, ground - metre * 2.6, metre * 0.86, metre * 0.12);
      ctx.fillStyle = '#e9b949';
      ctx.beginPath();
      ctx.ellipse(right - metre * 0.1, ground - metre * 2.05, metre * 0.34, metre * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#b98a1f';
      ctx.lineWidth = 2;
      for (const band of [-0.18, 0, 0.18]) {
        ctx.beginPath();
        ctx.moveTo(right - metre * 0.4, ground - metre * (2.05 + band));
        ctx.lineTo(right + metre * 0.2, ground - metre * (2.05 + band));
        ctx.stroke();
      }
    }
  }

  /** What comes between the character and the child: the branch it ducks under, the hedgehog, the bees. */
  drawInFront(thing) {
    if (!this.near(thing.at, thing.wide)) return;
    const { ctx, ground, metre } = this;
    const { at, wide, kind } = thing;
    // How far something that comes at the character has come: not at all until the character stops at it, and
    // then as its time runs down. It stays where it had got to once the move is made.
    const come = thing.fuse && thing.left !== undefined ? 1 - clamp(thing.left / thing.fuse, 0, 1) : 0;
    if (kind === 'branch') {
      const [left, right] = [this.across(at - 0.2), this.across(at + wide + 0.5)];
      const y = ground - this.heroTall() * 0.72;
      ctx.strokeStyle = '#7a4f2d';
      ctx.lineWidth = metre * 0.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(right, y - metre * 0.3);
      ctx.quadraticCurveTo((left + right) / 2, y - metre * 0.1, left, y + metre * 0.05);
      ctx.stroke();
      ctx.fillStyle = '#5fae52';
      for (let leaf = 0; leaf < 5; leaf += 1) {
        const share = leaf / 4;
        ctx.beginPath();
        ctx.ellipse(lerp(left, right, share), y + metre * (0.12 - share * 0.3), metre * 0.34, metre * 0.2, 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (kind === 'hedgehog') {
      // It waits further along, curled up, and rolls nearer as its time runs down. One that rolled into the
      // character has rolled on by, and one that was jumped stays where it was, behind.
      if (thing.missed) return;
      const x = this.across(at + wide - 0.1 - come * (wide + 0.3));
      this.drawHedgehog(x, ground, metre * 0.42, this.reducedMotion ? 0 : come * 9);
    } else if (kind === 'bees') {
      // They come out of the hive and over, at head height, as their time runs down, and once they're past
      // they're gone.
      if (thing.state === 'cleared') return;
      // While the character is ducked down, they fly on over it and away behind.
      const move = this.chase.hero.move;
      const over = move?.thing === thing ? clamp(move.t / move.seconds, 0, 1) : 0;
      const middle = this.across(lerp(at + wide - 0.2 - come * (wide + 0.6), at - 3.5, over));
      const y = ground - this.heroTall() * 0.8;
      for (let bee = 0; bee < 7; bee += 1) {
        const wobble = this.reducedMotion ? 0 : Math.sin(this.time * 5 + bee * 1.7) * metre * 0.08;
        const [x, up] = [middle + (chance(bee, 21) - 0.5) * metre * 1.1, y + (chance(bee, 22) - 0.5) * metre * 0.6 + wobble];
        // Each bee: pale wings, a yellow body and a dark stripe.
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.beginPath();
        ctx.ellipse(x, up - metre * 0.07, metre * 0.07, metre * 0.045, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f2b900';
        ctx.beginPath();
        ctx.ellipse(x, up, metre * 0.11, metre * 0.075, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3b2f1d';
        ctx.fillRect(x - metre * 0.02, up - metre * 0.07, metre * 0.045, metre * 0.14);
      }
    }
  }

  drawHedgehog(x, ground, r, turned) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, ground - r * 0.9);
    ctx.rotate(-turned);
    ctx.fillStyle = '#7b5a3c';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5b3f27';
    ctx.lineWidth = Math.max(2, r * 0.1);
    ctx.beginPath();
    for (let spike = 0; spike < 12; spike += 1) {
      const angle = (spike / 12) * Math.PI * 2;
      ctx.moveTo(Math.cos(angle) * r * 0.82, Math.sin(angle) * r * 0.82);
      ctx.lineTo(Math.cos(angle) * r * 1.22, Math.sin(angle) * r * 1.22);
    }
    ctx.stroke();
    ctx.fillStyle = '#f0d9b8';
    ctx.beginPath();
    ctx.arc(-r * 0.45, r * 0.15, r * 0.36, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(-r * 0.55, r * 0.08, r * 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawFeather(x, y, r, alpha = 1) {
    const { ctx } = this;
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(-0.5);
    ctx.fillStyle = '#f6c945';
    ctx.strokeStyle = '#c9971a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.36, r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(0, r * 1.35);
    ctx.stroke();
    ctx.restore();
  }

  /** How tall the character's body is on the screen, without a long neck. */
  heroTall() {
    return this.height * PLACE.tall;
  }

  /** Which picture of the character shows, from what it's doing and what the child is doing. */
  heroFrame() {
    const hero = this.chase?.hero;
    if (this.cheering > 0 || this.view === 'finish') return 'cheer';
    if (!hero) return 'stand';
    if (hero.mode === 'tumble') return 'sit';
    if (hero.mode === 'move') {
      const { kind, star } = hero.move;
      if (kind === 'duck') return 'duck';
      if (kind === 'clamber') return Math.floor(hero.move.t * 3) % 2 ? 'stepA' : 'stepB';
      return kind === 'bounce' && star ? 'star' : 'hop';
    }
    if (hero.mode === 'walk') return Math.floor(hero.x) % 2 ? 'stepA' : 'stepB';
    // Standing, the character shows what the child is doing: arms up, or knees bent.
    if (this.reach > 0.6) return 'reach';
    if (this.crouch > 0.7) return 'duck';
    return 'stand';
  }

  drawHero() {
    const { ctx, ground, metre } = this;
    const hero = this.chase?.hero;
    const x = this.across(hero?.x ?? 0);
    const y = ground - this.lift() * metre;
    // Its shadow stays on the path while it's in the air.
    ctx.fillStyle = 'rgba(18, 48, 77, 0.16)';
    ctx.beginPath();
    ctx.ellipse(x, ground + 3, metre * 0.5, metre * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
    const { art } = this;
    if (!art) {
      ctx.fillStyle = '#f2a33a';
      ctx.fillRect(x - metre * 0.3, y - this.heroTall(), metre * 0.6, this.heroTall());
      return;
    }
    const frame = art.frames[this.heroFrame()];
    const scale = this.heroTall() / art.tall;
    ctx.drawImage(frame, x - art.foot.x * scale, y - art.foot.y * scale, art.width * scale, art.height * scale);
    // The hat, coming down onto its head once the game is won.
    if (this.hat) {
      const share = clamp(this.hat.age / 1.1, 0, 1);
      const top = y - art.foot.y * scale + art.height * scale * 0.08;
      this.drawHat(x, lerp(top - metre * 3, top, share * share), metre * 0.5);
    }
  }

  drawHat(x, y, r) {
    const { ctx } = this;
    ctx.fillStyle = '#d83a4a';
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - r * 0.55, y);
    ctx.quadraticCurveTo(x, y - r * 1.25, x + r * 0.55, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(x - r * 0.5, y - r * 0.2, r, r * 0.14);
  }

  /** The magpie, flying on ahead with the hat. Out of the picture, a small sign at the edge says how far ahead it is. */
  drawMagpie() {
    const { ctx, metre, width: w } = this;
    const { chase } = this;
    const lead = chase ? chase.lead : MAGPIE.start;
    const at = this.magpieAt;
    const won = chase?.state === 'won';
    const bob = this.reducedMotion ? 0 : Math.sin(this.time * 2.2) * metre * 0.12;
    if (at.seen || won) {
      // Home on its nest once the game is won, and in the air ahead until then.
      const x = won ? this.across(chase.end + 0.7) : at.x;
      const y = won ? this.ground - metre * 3.15 : at.y + bob;
      this.drawBird(x, y, metre * 0.42, won ? 0 : Math.sin(this.time * (this.reducedMotion ? 0 : 7)));
      if (!this.hat) this.drawHat(x + metre * 0.5, y + metre * 0.28, metre * 0.3);
      return;
    }
    // Further ahead than the screen shows: a small sign at the right edge, which fills as it gets away.
    const share = clamp((lead - MAGPIE.least) / (MAGPIE.away - MAGPIE.least), 0, 1);
    const x = w - metre * 0.75;
    const y = at.y;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.beginPath();
    ctx.arc(x, y, metre * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = share > 0.7 ? '#e0762f' : '#8fa3b5';
    ctx.lineWidth = metre * 0.09;
    ctx.beginPath();
    ctx.arc(x, y, metre * 0.62, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * share);
    ctx.stroke();
    this.drawBird(x - metre * 0.06, y, metre * 0.3, 0);
  }

  drawBird(x, y, r, flap) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    // The tail, the body and its white front.
    ctx.fillStyle = '#1f2a37';
    ctx.beginPath();
    ctx.moveTo(-r * 0.7, 0);
    ctx.lineTo(-r * 1.9, -r * 0.25);
    ctx.lineTo(-r * 1.8, r * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(r * 0.1, r * 0.22, r * 0.62, r * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    // The head, the beak and the eye.
    ctx.fillStyle = '#1f2a37';
    ctx.beginPath();
    ctx.arc(r * 0.85, -r * 0.3, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2a33a';
    ctx.beginPath();
    ctx.moveTo(r * 1.2, -r * 0.34);
    ctx.lineTo(r * 1.7, -r * 0.2);
    ctx.lineTo(r * 1.2, -r * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(r * 0.95, -r * 0.36, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
    // The wing, going up and down.
    ctx.fillStyle = '#2d4b7a';
    ctx.beginPath();
    ctx.moveTo(-r * 0.3, -r * 0.1);
    ctx.quadraticCurveTo(-r * 0.2, -r * (0.9 + flap * 0.7), r * 0.5, -r * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawEffects() {
    const { ctx, ground, metre } = this;
    for (const effect of this.effects) {
      if (effect.age < 0) continue;
      const share = effect.age / effect.life;
      const x = this.across(effect.x);
      if (effect.kind === 'number') {
        ctx.save();
        ctx.globalAlpha = 1 - share * share;
        ctx.font = `700 ${Math.round(metre * 0.55)}px Fredoka, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#ffffff';
        ctx.fillStyle = INK;
        const y = ground - (effect.y + share * 0.9) * metre;
        ctx.strokeText(effect.text, x + metre * 0.9, y);
        ctx.fillText(effect.text, x + metre * 0.9, y);
        this.drawStarShape(x + metre * 0.3, y - metre * 0.18, metre * 0.2, 1);
        ctx.restore();
      } else if (effect.kind === 'apple') {
        ctx.fillStyle = '#e2483d';
        ctx.globalAlpha = 1 - share * share * share;
        ctx.beginPath();
        ctx.arc(x, ground - lerp(effect.y, 0.2, share * share) * metre, metre * 0.17, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (effect.kind === 'dust') {
        ctx.fillStyle = `rgba(214, 190, 150, ${0.7 * (1 - share)})`;
        ctx.beginPath();
        ctx.arc(x + effect.drift * share * metre, ground - (effect.y + share * 0.5) * metre, metre * (0.12 + share * 0.2), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
