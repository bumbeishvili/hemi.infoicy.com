// Gobble and Grow, drawn in 2D: the world behind, the things to eat drifting through it, the child's creature with
// its mouth as far open as the child's own, friends' creatures, a small ladder down the side showing how far it is
// from a bacterium to a galaxy, and, when a world is won, the view pulling slowly back to the next world, with a
// picture of how much the child grew: what they were, an everyday thing, and what they are now, side by side.
//
// The soup's places are in heights of a field as wide as a 16:9 screen (rules.js), which is fitted into the
// middle of whatever screen this is, with the world's backdrop filling the rest.
//
// Nothing flashes: things drift, a bite is a few crumbs, the creature grows smoothly, and the pull back is one
// slow, steady move. With reduced motion turned on, the picture of how much the child grew fades in instead.
import { drawCreature, drawFood, drawThing, INK, mouthOf, paintBackdrop } from './art.js';
import { FIELD, GULP_SECONDS, ladderFor, timesWords } from './rules.js';
import { WORLDS, worldAt } from './worlds.js';

const TAU = Math.PI * 2;
const LABEL_SECONDS = 2.6;
const GOBBLED_SECONDS = 1.2; // How long the creature takes to go into what gobbled it up.
// When a world is won: a moment of being pleased, the pull back, and then the picture stays for a moment.
export const PULL = { cheer: 0.8, zoom: 5, hold: 2.2 };
// The most the pull back moves on in one frame, in seconds.
const PULL_STEP = 1 / 30;
const PULL_STILL = { cheer: 0.4, zoom: 1.2, hold: 2.6 }; // With reduced motion: it fades across instead.
const FONT = 'Fredoka, "Noto Sans Georgian", ui-rounded, system-ui, sans-serif';
const WORDS = {
  were: ['You were this big', 'ასეთი იყავი'],
  sky: ['You’re as big as the sky!', 'ცასავით დიდი ხარ!'],
  all: ['From a bacterium to a galaxy', 'ბაქტერიიდან გალაქტიკამდე'],
};

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const lerp = (from, to, share) => from + (to - from) * share;

/** How much of a screen w by h a circle round centre with radius r covers, added up in narrow strips. */
function areaShowing(centre, r, w, h) {
  const left = Math.max(0, centre.x - r);
  const right = Math.min(w, centre.x + r);
  const STRIPS = 96;
  const strip = (right - left) / STRIPS;
  let area = 0;
  for (let index = 0; index < STRIPS; index += 1) {
    const across = left + (index + 0.5) * strip - centre.x;
    const half = Math.sqrt(Math.max(0, r * r - across * across));
    area += (clamp(centre.y + half, 0, h) - clamp(centre.y - half, 0, h)) * strip;
  }
  return area;
}

/** The radius of a circle round centre that covers this much of a screen w by h, and is at least smallest. */
function bubbleShowing(centre, area, w, h, smallest) {
  let low = smallest;
  let high = Math.max(Math.hypot(centre.x, centre.y), Math.hypot(w - centre.x, centre.y), Math.hypot(centre.x, h - centre.y), Math.hypot(w - centre.x, h - centre.y));
  if (high <= low) return low;
  for (let step = 0; step < 22; step += 1) {
    const middle = (low + high) / 2;
    if (areaShowing(centre, middle, w, h) < area) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}
const ease = (share) => share * share * (3 - 2 * share);

/** What a child is in a world, said to them: "Now you’re a water flea!". The voice says the same: see lines.json. */
export const nowLine = (world) => `Now you’re ${world.you}!`;
export const nowLineKa = (world) => `ახლა ${world.youKa} ხარ!`;

export class GobbleView {
  /** language() says which language the words on the picture are in. */
  constructor(canvas, { language = () => 'en' } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.language = language;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.time = 0;
    this.level = 1;
    this.backdrops = new Map();
    this.effects = [];
    this.labels = [];
    this.introduced = new Set();
    this.wanted = [];
    this.shown = { r: 0, mouth: 0, bounce: 0, snap: 0 };
    this.ladderWanted = false;
    this.ladderShown = 0;
    this.pull = null;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.ratio);
    this.canvas.height = Math.round(this.height * this.ratio);
    // The field, fitted into the middle of the screen.
    this.scale = Math.min(this.width / FIELD.wide, this.height / FIELD.tall);
    this.left = (this.width - FIELD.wide * this.scale) / 2;
    this.top = (this.height - FIELD.tall * this.scale) / 2;
    this.backdrops.clear();
  }

  /** A clear see-through canvas as big as the screen, ready to draw on in the screen's places. */
  layer() {
    const { canvas } = this;
    if (!this.layerCtx || this.layerCtx.canvas.width !== canvas.width || this.layerCtx.canvas.height !== canvas.height) {
      const made = document.createElement('canvas');
      made.width = canvas.width;
      made.height = canvas.height;
      this.layerCtx = made.getContext('2d');
    }
    const ctx = this.layerCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    return ctx;
  }

  get word() {
    return this.language() === 'ka' ? 1 : 0;
  }

  /** Where a place in the field is on the screen. */
  at(x, y) {
    return { x: this.left + x * this.scale, y: this.top + y * this.scale };
  }

  /** A world's backdrop, painted once for this size of screen. */
  backdrop(id) {
    let made = this.backdrops.get(id);
    if (!made) {
      made = document.createElement('canvas');
      made.width = this.canvas.width;
      made.height = this.canvas.height;
      paintBackdrop(made.getContext('2d'), id, made.width, made.height);
      this.backdrops.set(id, made);
    }
    return made;
  }

  /** A new world: nothing left over from the last one. */
  setWorld(level) {
    this.level = level;
    this.world = worldAt(level);
    this.effects = [];
    this.labels = [];
    this.wanted = [];
    this.introduced = new Set();
    this.pull = null;
    this.shown = { r: 0, mouth: 0, bounce: 0, snap: 0 };
  }

  update(dt) {
    this.time += dt;
    for (const effect of this.effects) effect.life -= dt;
    this.effects = this.effects.filter((effect) => effect.life > 0);
    for (const label of this.labels) label.life -= dt;
    this.labels = this.labels.filter((label) => label.life > 0 && label.target());
    if (!this.labels.length && this.wanted.length) {
      const next = this.wanted.shift();
      if (next.target()) this.labels.push({ ...next, life: LABEL_SECONDS, total: LABEL_SECONDS });
      // What it was about has gone before its turn came: it's said the next time there's one.
      else this.introduced.delete(next.key);
    }
    this.shown.bounce = Math.max(0, this.shown.bounce - dt);
    this.shown.snap = Math.max(0, this.shown.snap - dt);
    // The ladder fades in and out, rather than coming and going all at once.
    this.ladderShown += ((this.ladderWanted ? 1 : 0) - this.ladderShown) * (1 - Math.exp(-dt * 5));
    // A frame that came late doesn't make the pull back jump to catch up: it goes on from where it was.
    if (this.pull) this.pull.t += Math.min(dt, PULL_STEP);
  }

  /* ---------- small things that happen ---------- */

  /**
   * A new thing has a small label beside it for a moment, the first time it comes along in a game, in the language
   * the voice speaks. words is [English, Georgian], and target() says where it is on the screen now, or null once
   * it has gone. They show one at a time, and first puts this one before any that are waiting.
   */
  introduce(key, words, target, { first = false } = {}) {
    if (this.introduced.has(key)) return;
    this.introduced.add(key);
    if (first) this.wanted.unshift({ key, words, target });
    else this.wanted.push({ key, words, target });
  }

  /** A bite: a few crumbs fly out, the creature's mouth snaps shut for a moment, and it swells a little. */
  bite(x, y, colour = '#ffe066') {
    if (this.effects.length < 60) this.effects.push({ kind: 'crumbs', x, y, life: 0.55, total: 0.55, colour, turn: this.time * 3 });
    this.shown.bounce = 0.35;
    this.shown.snap = 0.16;
  }

  /** A soft ring going out from a place, as when the creature has just got bigger, or bumps something too big. */
  ring(x, y, r, colour = '#ffffff') {
    if (this.effects.length < 60) this.effects.push({ kind: 'ring', x, y, r, life: 0.6, total: 0.6, colour });
  }

  /* ---------- a world being played ---------- */

  /**
   * model is { soup, mouth, friends, hud }: the soup, how open the child's mouth is from 0 to 1, each friend as
   * { x, y, r, mouth, facing, name, form }, in the field's places, and hud, whether to show the ladder.
   */
  render(model) {
    const { ctx, ratio } = this;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.globalAlpha = 1;
    this.ladderWanted = Boolean(model.hud) && !this.pull;
    if (this.pull) {
      this.renderPull(model);
    } else {
      ctx.drawImage(this.backdrop(this.world.id), 0, 0, this.width, this.height);
      this.drawSoup(model, 1);
      this.drawEffects();
      this.drawLabels();
    }
    if (this.ladderShown > 0.01) {
      ctx.globalAlpha = this.ladderShown;
      this.drawLadder(this.level, model.soup.share);
      ctx.globalAlpha = 1;
    }
  }

  /** How big the child's creature is drawn just now: it grows smoothly to its new size, and swells with each bite. */
  shownRadius(soup, dt = 1 / 60) {
    const wanted = soup.creature.r * this.scale;
    const { shown } = this;
    shown.r = shown.r ? shown.r + (wanted - shown.r) * (1 - Math.exp(-dt * 7)) : wanted;
    return shown.r * (1 + 0.1 * Math.sin((shown.bounce / 0.35) * Math.PI) * (shown.bounce > 0 ? 1 : 0));
  }

  /** The things to eat, the friends, and the child's creature. fade is for when the world has been won. */
  drawSoup(model, fade) {
    const { ctx, scale, time } = this;
    const { soup, friends = [] } = model;
    const { creature } = soup;
    const world = this.world;

    // The biggest things first, so a small one is never hidden behind a big one.
    const drifting = soup.foods.filter((food) => food.state !== 'gulped').sort((a, b) => b.r - a.r);
    for (const food of drifting) {
      let { x, y } = this.at(food.x, food.y);
      let size = food.r * scale;
      let alpha = fade;
      if (food.state === 'taken') {
        // Off to the friend who got to it first, shrinking as it goes.
        const share = clamp((soup.time - food.takenAt) / (GULP_SECONDS * 2), 0, 1);
        if (food.takenTo) {
          const to = this.at(food.takenTo.x, food.takenTo.y);
          [x, y] = [lerp(x, to.x, share), lerp(y, to.y, share)];
        }
        size *= 1 - 0.7 * share;
        alpha *= 1 - share;
      }
      drawFood(ctx, world.foods[food.kind].id, x, y, size, { time: time + food.phase, turn: Math.sin(time * 0.9 + food.phase) * 0.14, alpha });
      // What would be gobbled now if the mouth opened has a ring round it, closing in and letting go.
      if (food === soup.target && fade === 1) {
        const pulse = 1.28 + 0.1 * Math.sin(time * 3.2);
        ctx.setLineDash([size * 0.5, size * 0.34]);
        ctx.lineDashOffset = -time * size * 0.5;
        ctx.beginPath();
        ctx.arc(x, y, size * pulse, 0, TAU);
        ctx.lineWidth = Math.max(3, size * 0.18);
        ctx.strokeStyle = 'rgb(18 48 77 / 0.55)';
        ctx.stroke();
        ctx.lineWidth = Math.max(2, size * 0.1);
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    for (const friend of friends) {
      const { x, y } = this.at(friend.x, friend.y);
      const size = friend.r * scale;
      drawCreature(ctx, friend.form ?? world.id, x, y, size, { facing: friend.facing ?? 1, mouth: friend.mouth ?? 0, time: time + 2, alpha: 0.62 * fade });
      if (friend.name) this.pill(friend.name, x, y - size * 1.35 - 6, { size: Math.max(13, this.height * 0.02), alpha: 0.9 * fade });
    }

    // The child's own creature, with whatever is in its mouth.
    const { x, y } = this.at(creature.x, creature.y);
    const size = this.shownRadius(soup);
    const { shown } = this;
    const wantedMouth = shown.snap > 0 ? 0 : clamp(model.mouth ?? 0, 0, 1);
    shown.mouth += (wantedMouth - shown.mouth) * 0.45;
    const mouth = creature.holding ? Math.max(shown.mouth, 0.5) : shown.mouth;
    const bob = Math.sin(time * 2) * size * 0.04;
    if (soup.gobbled && soup.eatenBy) {
      // Gobbled up: it goes softly into what caught it, getting smaller and fainter, and is gone.
      const share = ease(clamp((soup.time - soup.eatenAt) / GOBBLED_SECONDS, 0, 1));
      const to = this.at(soup.eatenBy.x, soup.eatenBy.y);
      drawCreature(ctx, world.id, lerp(x, to.x, share), lerp(y + bob, to.y, share), size * (1 - 0.75 * share), { facing: creature.facing, mouth: 0, time, alpha: (1 - share) * fade });
      this.creatureAt = { x, y: y + bob, r: size };
      return;
    }
    drawCreature(ctx, world.id, x, y + bob, size, { facing: creature.facing, mouth, time, happy: soup.won });
    const held = creature.holding;
    if (held) {
      const into = mouthOf(world.id, x, y + bob, size, creature.facing, mouth);
      const from = this.at(held.gulpFrom.x, held.gulpFrom.y);
      const share = ease(clamp(held.inMouth ?? 0, 0, 1));
      const heldSize = lerp(held.r * scale, Math.min(held.r * scale, into.r * 0.92), share);
      drawFood(ctx, world.foods[held.kind].id, lerp(from.x, into.x, share), lerp(from.y, into.y, share), heldSize, { time, turn: share * 0.6 });
    }
    this.creatureAt = { x, y: y + bob, r: size };
  }

  drawEffects() {
    const { ctx } = this;
    for (const effect of this.effects) {
      const age = 1 - effect.life / effect.total;
      if (effect.kind === 'crumbs') {
        ctx.globalAlpha = 1 - age;
        ctx.fillStyle = effect.colour;
        for (let crumb = 0; crumb < 7; crumb += 1) {
          const turn = effect.turn + (crumb / 7) * TAU;
          const far = this.scale * (0.02 + 0.07 * ease(age));
          ctx.beginPath();
          ctx.arc(effect.x + Math.cos(turn) * far, effect.y + Math.sin(turn) * far * 0.8 + age * age * this.scale * 0.03, this.scale * 0.008 * (1 - age * 0.5), 0, TAU);
          ctx.fill();
        }
      } else if (effect.kind === 'ring') {
        ctx.globalAlpha = (1 - age) * 0.55;
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, effect.r * (1 + 0.5 * ease(age)), 0, TAU);
        ctx.lineWidth = Math.max(2, this.scale * 0.008);
        ctx.strokeStyle = effect.colour;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Words in a white box with round ends, centred on a place. */
  pill(text, x, y, { size = 18, alpha = 1, bold = 700, colour = INK, fill = '#ffffff', ctx = this.ctx } = {}) {
    ctx.save();
    ctx.font = `${bold} ${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const wide = ctx.measureText(text).width + size * 1.3;
    const tall = size * 1.7;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.roundRect(x - wide / 2, y - tall / 2, wide, tall, tall / 2);
    ctx.fillStyle = fill;
    ctx.shadowColor = 'rgb(18 48 77 / 0.25)';
    ctx.shadowBlur = size * 0.5;
    ctx.shadowOffsetY = size * 0.15;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = colour;
    ctx.fillText(text, x, y + size * 0.04);
    ctx.restore();
  }

  drawLabels() {
    const size = clamp(this.height * 0.026, 14, 26);
    for (const label of this.labels) {
      const place = label.target();
      if (!place) continue;
      const age = label.total - label.life;
      const alpha = clamp(Math.min(age / 0.25, label.life / 0.35), 0, 1);
      const x = clamp(place.x, 110, this.width - 110);
      const y = clamp(place.y - (place.r ?? 0) - size * 1.5, size * 5, this.height - size * 2);
      this.pill(label.words[this.word], x, y, { size, alpha });
    }
  }

  /**
   * The ladder down the left: the ten creatures from a bacterium at the bottom to a galaxy at the top, with the
   * one the child is now bigger than the rest, and a ring round it that fills as they eat.
   */
  drawLadder(level, share, { ctx = this.ctx, height = this.height, x = null, top = null, bottom = null } = {}) {
    const rung = clamp(height * 0.03, 11, 26);
    const centre = x ?? 14 + rung * 1.5;
    const [from, to] = [bottom ?? height * 0.93, top ?? height * 0.23];
    const step = (from - to) / (WORLDS.length - 1);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(centre - rung * 1.5, to - rung * 1.9, rung * 3, from - to + rung * 3.8, rung * 1.5);
    ctx.fillStyle = 'rgb(255 255 255 / 0.84)';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(centre, from);
    ctx.lineTo(centre, to);
    ctx.lineWidth = Math.max(3, rung * 0.2);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#d9e3ec';
    ctx.stroke();
    // As far up the rail as the child has got.
    ctx.beginPath();
    ctx.moveTo(centre, from);
    ctx.lineTo(centre, from - step * (level - 1 + clamp(share, 0, 1)));
    ctx.strokeStyle = '#0ca30c';
    ctx.stroke();
    WORLDS.forEach((world, index) => {
      const here = index + 1 === level;
      const done = index + 1 < level;
      const y = from - step * index;
      const r = here ? rung * 1.32 : rung * 0.82;
      ctx.beginPath();
      ctx.arc(centre, y, r, 0, TAU);
      ctx.fillStyle = here ? '#ffffff' : done ? '#e4f7e4' : '#f1f6fa';
      ctx.fill();
      ctx.lineWidth = Math.max(2, rung * 0.13);
      ctx.strokeStyle = here ? INK : done ? '#0ca30c' : '#b9c7d6';
      ctx.stroke();
      if (here) {
        ctx.beginPath();
        ctx.arc(centre, y, r + rung * 0.24, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(share, 0, 1));
        ctx.lineWidth = Math.max(3, rung * 0.26);
        ctx.strokeStyle = '#0ca30c';
        ctx.stroke();
      }
      // Each is drawn small enough for its tail, rays or ring to fit in its circle.
      drawCreature(ctx, world.id, centre + r * 0.1, y, r * 0.5, { alpha: here || done ? 1 : 0.45, time: 0 });
    });
    ctx.restore();
  }

  /* ---------- a world won: the pull back, and how much the child grew ---------- */

  /** from is where the child's creature is on the screen, and how big, as the world is won. */
  startPull(level) {
    const from = this.creatureAt ?? { x: this.width / 2, y: this.height / 2, r: this.height * 0.1 };
    this.pull = { level, ladder: ladderFor(level), t: 0, from: { ...from }, times: this.reducedMotion ? PULL_STILL : PULL };
    this.labels = [];
    this.wanted = [];
  }

  get pullSeconds() {
    const { cheer, zoom, hold } = this.pull?.times ?? PULL;
    return cheer + zoom + hold;
  }

  get pullOver() {
    return Boolean(this.pull) && this.pull.t >= this.pullSeconds;
  }

  /**
   * Where everything is in the picture of how much the child grew, on a screen w by h: what they were, in a little
   * bubble of the world they've left, the everyday thing, and what they are now, in a row, each as big as the
   * ladder says. After the last world there's only the galaxy they were, in the middle of the whole sky.
   */
  chart(ladder, w, h) {
    const unit = Math.min(h, w * 0.5);
    if (!ladder.next) {
      const oldR = unit * 0.075;
      return { unit, old: { x: w / 2, y: h * 0.4, r: oldR }, bubble: oldR * 2.6, thing: null, next: null };
    }
    let nextR = unit * 0.18;
    const sizes = () => {
      const oldR = Math.max(3.5, nextR * ladder.sizes.old);
      return { oldR, bubble: Math.max(oldR * 2.4, oldR + unit * 0.03), thingR: nextR * ladder.sizes.thing, gap: unit * 0.09 };
    };
    // The creature's trunk, rays or ring go further out in front of it than its size says, and its tail further
    // still behind, so it's given room each side. It faces the others, so its tail is on the right.
    const [front, behind] = [1.55, 2];
    const wideOf = ({ bubble, thingR, gap }) => bubble * 2 + gap + thingR * 2 + gap + nextR * (front + behind);
    if (wideOf(sizes()) > w * 0.9) nextR *= (w * 0.9) / wideOf(sizes());
    const { oldR, bubble, thingR, gap } = sizes();
    const left = (w - wideOf(sizes())) / 2;
    const y = h * 0.5;
    return {
      unit,
      old: { x: left + bubble, y, r: oldR },
      bubble,
      thing: { x: left + bubble * 2 + gap + thingR, y, r: thingR },
      next: { x: left + bubble * 2 + gap + thingR * 2 + gap + nextR * front, y, r: nextR },
    };
  }

  renderPull(model) {
    const { ctx, width: w, height: h, pull } = this;
    const { cheer, zoom } = pull.times;
    const still = pull.times === PULL_STILL;
    const share = ease(clamp((pull.t - cheer) / zoom, 0, 1));
    const words = clamp((pull.t - cheer - zoom + 0.2) / 0.7, 0, 1);
    this.drawGrew(ctx, w, h, pull, { share, words, still });
    // What's left of the old world's food fades away first.
    if (pull.t < 0.5) this.drawLeftovers(model, 1 - pull.t / 0.5);
  }

  drawLeftovers(model, fade) {
    const { ctx, scale, time } = this;
    for (const food of model.soup.foods) {
      if (food.state !== 'drift') continue;
      const { x, y } = this.at(food.x, food.y);
      drawFood(ctx, this.world.foods[food.kind].id, x, y, food.r * scale, { time: time + food.phase, alpha: fade });
    }
  }

  /**
   * The picture of how much the child grew. share goes from 0, the world just won, filling the screen, to 1, the
   * picture all in view: in between, the view pulls back, the old world closing to a little bubble round what the
   * child was, as the everyday thing and what they are now come in from the side. words fades the words in.
   */
  drawGrew(ctx, w, h, pull, { share = 1, words = 1, still = false } = {}) {
    const { ladder, from } = pull;
    const { time } = this;
    const place = this.chart(ladder, w, h);
    const newId = ladder.next ? ladder.next.id : 'sky';
    const oldBackdrop = this.backdrop(ladder.old.id);
    const newBackdrop = this.backdrop(newId);
    // With reduced motion nothing moves: the finished picture fades in over the old world.
    const move = still ? 1 : share;
    const start = from.r / place.old.r;
    const zoom = start ** (1 - move);
    const centre = { x: lerp(from.x, place.old.x, move), y: lerp(from.y, place.old.y, move) };
    const seen = (point) => ({ x: centre.x + (point.x - place.old.x) * zoom, y: centre.y + (point.y - place.old.y) * zoom, r: point.r * zoom });

    ctx.save();
    // The new world, a little closer than it will be, coming to rest.
    const near = 1 + 0.25 * (1 - move);
    ctx.drawImage(newBackdrop, (w - w * near) / 2, (h - h * near) / 2, w * near, h * near);
    if (place.thing) {
      // The everyday thing and the creature the child is now come in from the side as the view pulls back, and
      // fade in slowly as they come, so that something big and bright is never suddenly there. They're never more
      // than a little bigger than they'll be, so that nothing huge sweeps across the screen as it shrinks.
      const arriving = ease(clamp((move - 0.4) / 0.55, 0, 1));
      if (arriving > 0) {
        // Drawn whole on a layer of their own first, and then faded in, so that a creature's own parts don't show
        // through each other as it fades.
        const layer = this.layer();
        const comes = (point) => ({ ...seen(point), r: point.r * Math.min(zoom, 1.5) });
        const thing = comes(place.thing);
        drawThing(layer, ladder.thing.id, thing.x, thing.y, thing.r);
        const next = comes(place.next);
        drawCreature(layer, ladder.next.id, next.x, next.y + Math.sin(time * 2) * next.r * 0.03, next.r, { facing: -1, time });
        ctx.globalAlpha = arriving;
        ctx.drawImage(layer.canvas, 0, 0, w, h);
        ctx.globalAlpha = 1;
      }
    }

    // The world that was, closing to a bubble round the creature the child was.
    // It uncovers the same amount of the screen each moment, as much at the start, when only the corners go, as at
    // the end, so that going from a bright world to a dark one, as from the sky to among the moons, is a slow change
    // and never a sudden one.
    const cover = Math.max(Math.hypot(from.x, from.y), Math.hypot(w - from.x, from.y), Math.hypot(from.x, h - from.y), Math.hypot(w - from.x, h - from.y)) * 1.02;
    const bubble = move <= 0 ? cover : bubbleShowing(centre, lerp(w * h, Math.PI * place.bubble * place.bubble, move), w, h, place.bubble);
    // The old world's backdrop shrinks with the creature, but never to less than fills what can be seen of the
    // bubble: at first that's the whole screen, just as it was while the world was played.
    const fills = (reach, room) => Math.min(reach, bubble) / Math.max(1, room);
    const roomy = Math.max(zoom / start, fills(centre.x, from.x), fills(w - centre.x, w - from.x), fills(centre.y, from.y), fills(h - centre.y, h - from.y));
    ctx.save();
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, bubble, 0, TAU);
    ctx.clip();
    ctx.drawImage(oldBackdrop, centre.x - from.x * roomy, centre.y - from.y * roomy, w * roomy, h * roomy);
    const old = seen(place.old);
    drawCreature(ctx, ladder.old.id, old.x, old.y, old.r, { facing: 1, time, happy: true });
    ctx.restore();
    if (move > 0.02) {
      // Its edge comes in gently too.
      ctx.globalAlpha = still ? 1 : clamp((move - 0.02) / 0.3, 0, 1);
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, bubble, 0, TAU);
      ctx.lineWidth = Math.max(3, place.unit * 0.012);
      ctx.strokeStyle = 'rgb(18 48 77 / 0.45)';
      ctx.stroke();
      ctx.lineWidth = Math.max(2, place.unit * 0.007);
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (still && share < 1) {
      // The old world still over it all, fading away.
      ctx.globalAlpha = 1 - share;
      ctx.drawImage(oldBackdrop, 0, 0, w, h);
      drawCreature(ctx, ladder.old.id, from.x, from.y, from.r, { facing: 1, time, happy: true });
      ctx.globalAlpha = 1;
    }

    if (words > 0) this.drawGrewWords(ctx, w, h, ladder, place, words);
    ctx.restore();
  }

  /** The words on the picture. brief leaves out the two small ones, for the finish card, where it's drawn small. */
  drawGrewWords(ctx, w, h, ladder, place, alpha, brief = false) {
    const word = this.word;
    const size = brief ? clamp(place.unit * 0.085, 11, 18) : clamp(place.unit * 0.042, 12, 30);
    const under = (point, text, extra = 0, options = {}) => this.pill(text, clamp(point.x, w * 0.1, w * 0.9), point.y + extra, { ctx, size, alpha, ...options });
    if (!ladder.next) {
      // After the last world: the whole sky, and every creature the child has been, in a row.
      this.pill(WORDS.sky[word], w / 2, h * 0.14, { ctx, size: size * 1.5, alpha });
      const rowY = h * 0.76;
      const step = Math.min(w * 0.085, place.unit * 0.17);
      const first = w / 2 - step * 4.5;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.roundRect(first - step * 0.75, rowY - step * 0.62, step * 10.5, step * 1.24, step * 0.62);
      ctx.fillStyle = 'rgb(255 255 255 / 0.9)';
      ctx.fill();
      WORLDS.forEach((world, index) => drawCreature(ctx, world.id, first + step * index + step * 0.04, rowY, step * (0.16 + index * 0.012), { time: 0 }));
      ctx.globalAlpha = 1;
      this.pill(WORDS.all[word], w / 2, rowY + step * 1.05, { ctx, size, alpha });
      if (!brief) under(place.old, word ? ladder.old.youKa : ladder.old.you, place.bubble + size * 1.4);
      return;
    }
    if (brief) {
      // Small, there's room for how many times bigger, at the top, and what the child is now, at the bottom.
      this.pill(timesWords(ladder.ratio, this.language()), w * 0.27, size * 1.5, { ctx, size, alpha });
      this.pill(word ? nowLineKa(ladder.next) : nowLine(ladder.next), w * 0.27, h - size * 1.5, { ctx, size, alpha, fill: '#ffd23f' });
      return;
    }
    under(place.old, WORDS.were[word], place.bubble + size * 1.4);
    under(place.thing, word ? ladder.thing.nameKa : ladder.thing.name, Math.max(place.thing.r, place.bubble) + size * 3.4);
    under(place.next, word ? nowLineKa(ladder.next) : nowLine(ladder.next), place.next.r * 1.35 + size * 1.6, { size: size * 1.25, fill: '#ffd23f' });
    this.pill(timesWords(ladder.ratio, this.language()), w / 2, clamp(h * 0.5 - place.next.r * 1.5 - size * 2.2, size * 2, h), { ctx, size: size * 1.35, alpha });
  }

  /**
   * The same picture, finished, drawn small on the finish card's own canvas, so that it's there to look at while
   * the card is up.
   */
  drawGrewCard(canvas) {
    if (!this.pull) return false;
    const { clientWidth: wide, clientHeight: tall } = canvas;
    if (!wide || !tall) return false;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(wide * ratio);
    canvas.height = Math.round(tall * ratio);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    // Backdrops are painted for the whole screen, so the card shows a piece of one, drawn to fit.
    const { ladder } = this.pull;
    const place = this.chart(ladder, wide, tall);
    ctx.drawImage(this.backdrop(ladder.next ? ladder.next.id : 'sky'), 0, 0, wide, tall);
    if (place.thing) {
      drawThing(ctx, ladder.thing.id, place.thing.x, place.thing.y, place.thing.r);
      drawCreature(ctx, ladder.next.id, place.next.x, place.next.y, place.next.r, { facing: -1 });
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(place.old.x, place.old.y, place.bubble, 0, TAU);
    ctx.clip();
    ctx.drawImage(this.backdrop(ladder.old.id), place.old.x - wide / 2, place.old.y - tall / 2, wide, tall);
    drawCreature(ctx, ladder.old.id, place.old.x, place.old.y, place.old.r, { happy: true });
    ctx.restore();
    ctx.beginPath();
    ctx.arc(place.old.x, place.old.y, place.bubble, 0, TAU);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    this.drawGrewWords(ctx, wide, tall, ladder, place, 1, true);
    return true;
  }
}
