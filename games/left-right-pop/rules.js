// Left, Right, Pop!: the game asks for a hand, left or right, and the circle for it pops when that hand opens on it.
// The other hand on it only makes it wobble. Telling left from right, and using the hand that's asked for, the weaker
// one as often as the other, is what it practises.
//
// Levels 1 to 5 keep it simple: one circle on the screen at a time, at a random place, red for the left hand and green
// for the right, and the voice says only the hand. From level 3 the circle moves a little, and the voice says only
// "Left!" or "Right!". From level 6 there are several circles, of every colour, and the card at the top shows which
// colour to pop with which hand. At every level a big balloon comes now and then, to be popped with a clap on it.
//
// The rules are here, with no screen, so they run in the unit tests. main.js says where each glove is and whether its
// hand is open, and view.js draws what this says. Places are in shares of the screen, x across from the left and y
// down from the top, and sizes and distances are in screen heights.
//
// Each circle asked for waits so long, on a clock, and one that isn't popped in time fades away. Too many fading
// away before enough are popped loses the game. The clock only runs while a hand that's asked for is in the picture,
// so a child who goes away, or a hand the camera can't find, isn't caught out for it. A grown-up can choose Gentle
// instead, which has no clock: each circle waits for as long as it takes, and nothing can be lost.
import { clampLevel, ramp } from '../../core/levels.js';

// The colours, and what they're called on the screen. Up to level 5 the colour goes with the hand: see HAND_COLOURS.
export const COLOURS = {
  red: { fill: '#ef4136', name: 'Red', nameKa: 'წითელი' },
  green: { fill: '#22a94a', name: 'Green', nameKa: 'მწვანე' },
  blue: { fill: '#2f6fe4', name: 'Blue', nameKa: 'ლურჯი' },
  yellow: { fill: '#ffd60a', name: 'Yellow', nameKa: 'ყვითელი' },
  purple: { fill: '#9b5de5', name: 'Purple', nameKa: 'იისფერი' },
  orange: { fill: '#ff8a1f', name: 'Orange', nameKa: 'ნარინჯისფერი' },
};
// Up to level 5, the left hand's circle is red and the right hand's green.
export const HAND_COLOURS = { left: 'red', right: 'green' };
export const ALL_COLOURS = Object.keys(COLOURS); // From level 6.
export const SIMPLE_UP_TO = 5; // The last level with one circle at a time, its colour the hand's.

// Where the circles come, which is how far to reach, as a grown-up chooses: the part of the screen their middles are
// in. The top of the screen is left for what's asked, the counts and the mirror.
export const REACHES = {
  close: { x: [0.26, 0.74], y: [0.34, 0.82] },
  middle: { x: [0.16, 0.84], y: [0.31, 0.85] },
  far: { x: [0.06, 0.94], y: [0.28, 0.88] },
};
export const REACH_NAMES = Object.keys(REACHES);
export const GOAL_CHOICES = [8, 12, 16]; // Circles to pop to win.
// Which hand is asked for, as a grown-up chooses: each as often as the other, the hand in play twice as often as the
// other, or only the hand in play.
export const HAND_MODES = ['even', 'more', 'only'];
// What's at stake: circles on a clock that can fade away (the default), or the gentle game, with no clock.
export const CLOCKS = ['clock', 'gentle'];
// With the clock, the game is lost once this many circles have faded away: a share of the circles to pop, which goes
// down from level 1 to level 10, and never fewer than least.
export const FADE_LIMIT = { first: 0.5, last: 0.25, least: 2 };

const FIRST_ASK_AFTER = 0.9; // Seconds after "Go!" before the first circle is asked for.
export const NEXT_ASK_AFTER = 0.55; // And after a circle is popped or fades, time to see what happened.
export const GROW_SECONDS = 0.35; // A new circle grows in, and can be popped once it's most of the way.
export const POP_SECONDS = 0.3; // A popped circle's burst.
export const FADE_SECONDS = 0.9; // A circle that wasn't popped in time fading away.
export const HOLD_SECONDS = 0.4; // How long the open hand stays on a circle to hold, before it pops.
const HOLD_DRAINS = 1.5; // How fast a circle to hold empties again, once the hand is off it.
const WRONG_AGAIN_AFTER = 1.6; // Seconds before the other hand on the same circle counts again.
const BUMP_AGAIN_AFTER = 0.9;
const WOBBLE_SETTLES = 2.5; // How quickly a wobbling circle settles.
export const PARTY_SECONDS = 1.4; // After the last pop, before the finish card.
export const LOST_SECONDS = 1.6; // After the last fade that loses the game.
const GAP = 0.035; // The least room between two circles, in screen heights.
const RUN = { even: 2, more: 3, only: Infinity }; // The most times in a row one hand is asked for.

// A clap: both hands seen apart, and then together, quickly. Hands that touch are never open (see core/hands.js), so a
// clap is read from where the two hands are, and not from how open they are. Two hands pressed together can also be
// taken by the tracker for one, so a hand lost just as the two were nearly together counts as having met the other.
// Distances are between the middles of the two palms, in screen heights, and times in seconds.
export const CLAP = {
  apart: 0.3, // Hands this far apart are apart, which a clap starts from,
  together: 0.15, // and this near are together.
  within: 1.2, // From apart to together in this long is a clap; slower is just hands coming together.
  close: 0.3, // A hand lost within lost of being this near the other met it.
  lost: 0.4,
  reach: 0.1, // A clap pops the balloon where the hands meet within this much of its edge.
};

// What the levels bring, and the big balloon every level has. Missing any of it never costs anything.
export const EXTRAS = {
  balloonChance: 0.22, // Of each turn after the first, never two in a row: a big balloon, to clap on.
  balloonSize: 0.2, // Its radius.
  starEvery: 3, // From level 2, every third circle asked for has a star in it.
  holdEvery: 3, // From level 4, every third has to be held a moment.
  hopAfter: [1.4, 2.6], // From level 5, a circle hops once to another place, this many seconds after it comes,
  hopAfterMany: [3, 9], // or from level 6, with several on the screen, after this many.
  hopSeconds: 0.35,
  bothEvery: 3, // From level 7, every third turn asks for one circle with each hand.
  bothLonger: 1.6, // How much longer a turn with both hands, or a big balloon, waits.
  swapSeconds: 1.1, // How long two circles take to swap places, from level 8.
  rainbowEvery: 15, // From level 9, now and then a rainbow circle that any open hand can pop, for a gem.
  rainbowSeconds: 7,
  splitEvery: 4, // At level 10, every fourth circle asked for with one hand is big, and splits in two.
  splitBigger: 1.45,
  splitSmaller: 0.75,
  splitApart: 0.17,
  splitExtra: 3, // Seconds more on the clock for its two halves.
};

/** How many circles fading away lose the game, at a level, with so many to pop. */
export function fadesToLose(level, goal) {
  return Math.max(FADE_LIMIT.least, Math.round(goal * ramp(level, FADE_LIMIT.first, FADE_LIMIT.last)));
}

/**
 * What changes from level 1 to 10. Each level from 2 brings something new: see NEWS. gentle is the game with no clock.
 */
export function popLevel(level, { gentle = false } = {}) {
  const at = clampLevel(level);
  const simple = at <= SIMPLE_UP_TO;
  return {
    level: at,
    // Up to level 5, one circle at a time, its colour the hand's, and only the hand is said.
    simple,
    // From level 3 to 5, the voice says only "Left!" or "Right!".
    short: simple && at >= 3,
    // From level 6, several circles at once to look through: 3, up to 5 at level 10.
    circles: simple ? 1 : Math.round(3 + (at - 6) * 0.5),
    // A little smaller each level, so a little harder to get to.
    radius: ramp(at, 0.115, 0.085),
    // Seconds each circle asked for waits, at level 10 half of level 1's.
    wait: gentle ? Infinity : ramp(at, 10, 5),
    // How fast circles move, in screen heights a second, from level 3.
    speed: at >= 3 ? ramp(at, 0.03, 0.06) : 0,
    // Seconds between two circles swapping places, from level 8.
    swapEvery: at >= 8 ? 7 - (at - 8) * 0.9 : Infinity,
    balloons: true,
    stars: at >= 2,
    drifting: at >= 3,
    hold: at >= 4,
    hop: at >= 5,
    colours: at >= 6,
    both: at >= 7,
    swap: at >= 8,
    rainbow: at >= 9,
    split: at >= 10,
  };
}

// What each level brings that's new, for the title card, the countdown and the finish card. key says which part of
// popLevel turns it on, which the unit tests check.
export const NEWS = {
  2: [{ key: 'stars', mark: '⭐', name: 'Star circles', nameKa: 'ვარსკვლავიანი წრეები' }],
  3: [{ key: 'drifting', mark: '🎈', name: 'A moving circle, and just “Left!” or “Right!”', nameKa: 'მოძრავი წრე' }],
  4: [{ key: 'hold', mark: '🫧', name: 'Circles to hold', nameKa: 'წრეები, რომლებიც უნდა გააჩერო' }],
  5: [{ key: 'hop', mark: '🐸', name: 'Circles that hop', nameKa: 'მხტუნავი წრეები' }],
  6: [{ key: 'colours', mark: '🎨', name: 'Circles of every colour', nameKa: 'ყველა ფერის წრეები' }],
  7: [{ key: 'both', mark: '🙌', name: 'A circle for each hand at once', nameKa: 'თითო წრე ორივე ხელისთვის' }],
  8: [{ key: 'swap', mark: '🔄', name: 'Circles that swap places', nameKa: 'წრეები ადგილს იცვლიან' }],
  9: [{ key: 'rainbow', mark: '🌈', name: 'The rainbow circle', nameKa: 'ცისარტყელას წრე' }],
  10: [{ key: 'split', mark: '✂️', name: 'Big circles that split in two', nameKa: 'დიდი წრეები, რომლებიც ორად იყოფა' }],
};

export const popNewAt = (level) => NEWS[clampLevel(level)] ?? [];

const other = (side) => (side === 'left' ? 'right' : 'left');
const ease = (t) => t * t * (3 - 2 * t);
const between = (random, [low, high]) => low + random() * (high - low);

export class PopRules {
  /**
   * goal is how many to pop, reach how far to reach, clock 'clock' or 'gentle', hands which hand is asked for (see
   * HAND_MODES), side the hand in play, and aspect the screen's width over its height. random is for the tests.
   */
  constructor({ level = 1, goal = 12, reach = 'middle', clock = 'clock', hands = 'even', side = 'right', aspect = 16 / 9, random = Math.random, onEvent = () => {} } = {}) {
    this.level = clampLevel(level);
    this.gentle = clock === 'gentle';
    this.plan = popLevel(this.level, { gentle: this.gentle });
    this.goal = GOAL_CHOICES.includes(Number(goal)) ? Number(goal) : 12;
    this.toLose = this.gentle ? Infinity : fadesToLose(this.level, this.goal);
    this.reachName = REACH_NAMES.includes(reach) ? reach : 'middle';
    this.area = REACHES[this.reachName];
    this.mode = HAND_MODES.includes(hands) ? hands : 'even';
    this.side = side === 'left' ? 'left' : 'right';
    this.aspect = aspect;
    this.random = random;
    this.onEvent = onEvent;

    this.phase = 'ready'; // 'ready' before the game starts, then 'play', and 'won' or 'lost' at the end.
    this.done = false;
    this.endIn = 0;
    this.time = 0;
    this.circles = [];
    // What's asked for now: { asks, wait, left }. Each ask is { id, hand, colour, circles, ... }, and hand is 'left',
    // 'right', or 'both' for a big balloon.
    this.turn = null;
    this.askIn = Infinity;
    this.nextId = 1;
    this.askCount = 0;
    this.asked = 0; // Circles asked for with one hand so far, for which have a star, or have to be held.
    this.turns = 0;
    this.singles = 0; // Turns with one hand asked for, for which circle is big and splits.
    this.lastWasBalloon = false;
    this.history = []; // The hands asked for, in order.
    this.lastColour = null;
    this.swapIn = this.plan.swapEvery;
    this.rainbowIn = EXTRAS.rainbowEvery;
    // For reading a clap: when the hands were last apart, and how near they were when last both seen.
    this.apartAt = -Infinity;
    this.bothSeenAt = -Infinity;
    this.lastGap = Infinity;
    this.lastMiddle = null;
    this.stats = {
      pops: 0,
      faded: 0,
      stars: 0,
      gems: 0,
      balloons: 0, // Big balloons popped with a clap,
      balloonsAsked: 0, // of how many.
      asked: { left: 0, right: 0 },
      popped: { left: 0, right: 0 },
      wrong: { left: 0, right: 0 }, // Times each hand tried a circle that was the other hand's.
      seconds: { left: 0, right: 0 }, // Time from being asked to the pop, added up for each hand.
    };
    this.fill();
  }

  /* ---------- the circles ---------- */

  get palette() {
    return this.plan.colours ? ALL_COLOURS : Object.values(HAND_COLOURS);
  }

  /** The circles that are there to be popped: not popped, fading or gone. */
  get live() {
    return this.circles.filter((circle) => circle.state === 'growing' || circle.state === 'waiting');
  }

  /** The ordinary circles, which are what's asked for and, from level 6, what's kept on the screen. */
  get plain() {
    return this.live.filter((circle) => circle.kind === 'plain');
  }

  /** What's asked for now and hasn't been popped yet, in order: the left hand's first when both are asked. */
  get asks() {
    return this.turn ? this.turn.asks.filter((ask) => !ask.done) : [];
  }

  get current() {
    return this.asks[0] ?? null;
  }

  /** How much of the clock is left for this turn, from 1 to 0, or null with no clock. */
  get clockShare() {
    if (!this.turn || !Number.isFinite(this.turn.wait)) return null;
    return Math.max(0, this.turn.left / this.turn.wait);
  }

  gap(a, b) {
    return Math.hypot((a.x - b.x) * this.aspect, a.y - b.y);
  }

  /** Keeps a circle's middle where the whole circle is in the area. */
  clampInto(circle) {
    const { x, y } = this.area;
    const across = circle.r / this.aspect;
    circle.x = Math.min(x[1] - across, Math.max(x[0] + across, circle.x));
    circle.y = Math.min(y[1] - circle.r, Math.max(y[0] + circle.r, circle.y));
  }

  /**
   * A place for a circle of radius r, never on top of another. The places are a grid, spread over where circles can
   * be and nudged a little each time, so that there's room for all of a level's circles even where they only just
   * fit, and a free place is taken at random. Failing that, the place with the most room.
   */
  place(r) {
    const { x, y } = this.area;
    const left = x[0] + r / this.aspect;
    const right = Math.max(left, x[1] - r / this.aspect);
    const top = y[0] + r;
    const bottom = Math.max(top, y[1] - r);
    const others = this.live;
    const roomAt = (spot) => Math.min(Infinity, ...others.map((circle) => this.gap(spot, circle) - circle.r - r));
    const step = 2 * r + GAP;
    const across = Math.max(1, Math.floor(((right - left) * this.aspect) / step) + 1);
    const down = Math.max(1, Math.floor((bottom - top) / step) + 1);
    const spread = (from, to, count, index) => (count === 1 ? (from + to) / 2 : from + ((to - from) * index) / (count - 1));
    const grid = [];
    for (let i = 0; i < across; i += 1) for (let j = 0; j < down; j += 1) grid.push({ x: spread(left, right, across, i), y: spread(top, bottom, down, j) });
    const free = grid.filter((spot) => roomAt(spot) >= GAP);
    if (free.length) {
      const spot = free[Math.floor(this.random() * free.length)];
      // Nudged a lot when it's alone on the screen, and a little when it isn't, so the circles don't stand in rows.
      const nudge = others.length ? GAP : step / 2;
      const nudged = {
        x: Math.min(right, Math.max(left, spot.x + ((this.random() - 0.5) * nudge * 2) / this.aspect)),
        y: Math.min(bottom, Math.max(top, spot.y + (this.random() - 0.5) * nudge * 2)),
      };
      return roomAt(nudged) >= GAP ? nudged : spot;
    }
    let best = grid[0];
    for (let tries = 0; tries < 60; tries += 1) {
      const spot = { x: left + this.random() * (right - left), y: top + this.random() * (bottom - top) };
      if (roomAt(spot) > roomAt(best)) best = spot;
    }
    return best;
  }

  /** A colour that isn't on the screen yet, if there is one, so that each colour is only there once. */
  freeColour() {
    const showing = new Set(this.plain.map((circle) => circle.colour));
    const free = this.palette.filter((colour) => !showing.has(colour));
    const from = free.length ? free : this.palette;
    return from[Math.floor(this.random() * from.length)];
  }

  addCircle({ colour, r = this.plan.radius, kind = 'plain', at = null }) {
    const spot = at ?? this.place(r);
    const angle = this.random() * Math.PI * 2;
    const circle = {
      id: this.nextId++,
      kind, // 'plain', 'half' (one of a split circle's two), 'rainbow', or 'balloon'
      colour,
      x: spot.x,
      y: spot.y,
      r,
      state: 'growing',
      age: 0,
      endAge: 0,
      vx: Math.cos(angle) * this.plan.speed,
      vy: Math.sin(angle) * this.plan.speed,
      wobble: 0,
      bumpedAt: -Infinity,
      ask: null,
      star: false,
      hold: false,
      big: false,
      holding: 0,
      glide: null,
      // From level 5 an ordinary circle hops once, when it's been there so long.
      hopAt: kind === 'plain' && this.plan.hop ? between(this.random, this.plan.simple ? EXTRAS.hopAfter : EXTRAS.hopAfterMany) : Infinity,
    };
    this.clampInto(circle);
    this.circles.push(circle);
    return circle;
  }

  /** From level 6, enough ordinary circles on the screen, each colour once. Up to level 5 a circle comes when it's asked for. */
  fill() {
    if (this.plan.simple) return;
    while (this.plain.length < this.plan.circles) this.addCircle({ colour: this.freeColour() });
  }

  /* ---------- what's asked for ---------- */

  begin() {
    this.phase = 'play';
    this.askIn = FIRST_ASK_AFTER;
  }

  /** The next hand to ask for: as the grown-up chose, and never the same hand too many times in a row. */
  pickHand() {
    if (this.mode === 'only') return this.side;
    const share = this.mode === 'more' ? 2 / 3 : 1 / 2;
    let hand = this.random() < share ? this.side : other(this.side);
    const run = RUN[this.mode];
    const recent = this.history.slice(-run);
    if (recent.length === run && recent.every((each) => each === hand)) hand = other(hand);
    return hand;
  }

  /** From level 6, a circle on the screen to ask for, not the colour asked for last time if there's another. */
  pickCircle(not = []) {
    const choices = this.plain.filter((circle) => !not.includes(circle) && !circle.ask);
    const fresh = choices.filter((circle) => circle.colour !== this.lastColour);
    const from = fresh.length ? fresh : choices;
    return from[Math.floor(this.random() * from.length)] ?? null;
  }

  /** Whether this turn is a big balloon: now and then, never the first turn or two in a row, and never with one hand only. */
  balloonTurn() {
    return this.plan.balloons && this.mode !== 'only' && this.turns > 0 && !this.lastWasBalloon && this.random() < EXTRAS.balloonChance;
  }

  newTurn() {
    this.fill();
    const { plan } = this;
    if (this.balloonTurn()) {
      const balloon = this.addCircle({ colour: 'balloon', kind: 'balloon', r: EXTRAS.balloonSize });
      const ask = { id: ++this.askCount, hand: 'both', colour: 'balloon', circles: [balloon.id], started: this.time, wrongAt: -Infinity, done: false };
      balloon.ask = ask.id;
      this.stats.balloonsAsked += 1;
      this.lastWasBalloon = true;
      const wait = plan.wait * EXTRAS.bothLonger;
      this.turn = { asks: [ask], wait, left: wait };
      this.turns += 1;
      this.askIn = Infinity;
      this.emit('ask', { asks: [ask] });
      return;
    }
    this.lastWasBalloon = false;
    const both = plan.both && this.mode !== 'only' && this.turns % EXTRAS.bothEvery === EXTRAS.bothEvery - 1 && this.plain.length >= 2;
    const hands = both ? ['left', 'right'] : [this.pickHand()];
    if (!both) this.singles += 1;
    const asks = [];
    const taken = [];
    for (const hand of hands) {
      // Up to level 5 the circle is the hand's colour, and comes now, wherever there's room.
      const circle = plan.simple ? this.addCircle({ colour: HAND_COLOURS[hand] }) : this.pickCircle(taken);
      if (!circle) break;
      taken.push(circle);
      this.asked += 1;
      const ask = {
        id: ++this.askCount,
        hand,
        colour: circle.colour,
        circles: [circle.id],
        star: plan.stars && this.asked % EXTRAS.starEvery === 1,
        hold: plan.hold && this.asked % EXTRAS.holdEvery === 2,
        split: plan.split && !both && this.singles % EXTRAS.splitEvery === 3,
        started: this.time,
        wrongAt: -Infinity,
        done: false,
      };
      circle.ask = ask.id;
      circle.star = ask.star;
      circle.hold = ask.hold;
      if (ask.split) {
        circle.big = true;
        circle.r = plan.radius * EXTRAS.splitBigger;
        this.clampInto(circle);
      }
      this.stats.asked[hand] += 1;
      this.history.push(hand);
      asks.push(ask);
    }
    if (!asks.length) {
      this.askIn = NEXT_ASK_AFTER;
      return;
    }
    this.lastColour = asks[asks.length - 1].colour;
    const wait = plan.wait * (asks.length > 1 ? EXTRAS.bothLonger : 1);
    this.turn = { asks, wait, left: wait };
    this.turns += 1;
    this.askIn = Infinity;
    this.emit('ask', { asks });
  }

  /* ---------- each frame ---------- */

  /**
   * gloves is { left, right }, each { visible, open, x, y, reach(x, y), tracked }: reach is how near the glove comes
   * to a point, from its palm or a fingertip, in screen heights, and 0 or less is on it. tracked says the tracker saw
   * that hand just now, rather than the glove waiting where it was for a hand that's gone for a moment.
   */
  update(dt, { gloves = {} } = {}) {
    this.time += dt;
    this.animate(dt);
    if (this.phase === 'won' || this.phase === 'lost') {
      this.endIn -= dt;
      if (this.endIn <= 0) this.done = true;
      return;
    }
    if (this.phase !== 'play') return;

    this.extras(dt);
    const clap = this.readClap(gloves);
    if (clap) {
      this.clapped(clap);
      if (this.phase !== 'play') return;
    }
    const touched = new Set();
    const onBalloon = new Map(); // Each balloon, and the open hands on it.
    for (const side of ['left', 'right']) {
      const glove = gloves[side];
      if (!glove?.visible || !glove.open) continue;
      for (const circle of this.live) {
        if (circle.state === 'growing' && circle.age < GROW_SECONDS * 0.6) continue;
        if (glove.reach(circle.x, circle.y) > circle.r) continue;
        touched.add(circle);
        if (circle.kind === 'balloon') {
          onBalloon.set(circle, [...(onBalloon.get(circle) ?? []), side]);
          continue;
        }
        this.touch(side, circle, dt);
        if (this.phase !== 'play') return;
      }
    }
    for (const [balloon, sides] of onBalloon) {
      this.touchBalloon(balloon, sides);
      if (this.phase !== 'play') return;
    }
    for (const circle of this.live) {
      if (circle.hold && !touched.has(circle)) circle.holding = Math.max(0, circle.holding - dt * HOLD_DRAINS);
    }

    if (this.turn) {
      // The clock only runs while a hand that's asked for is in the picture.
      const seen = this.asks.some((ask) => (ask.hand === 'both' ? gloves.left?.visible || gloves.right?.visible : gloves[ask.hand]?.visible));
      if (seen) this.turn.left -= dt;
      if (this.turn.left <= 0) this.timeUp();
    } else if (Number.isFinite(this.askIn)) {
      this.askIn -= dt;
      if (this.askIn <= 0) this.newTurn();
    }
  }

  /** An open hand on a circle. */
  touch(side, circle, dt) {
    if (circle.kind === 'rainbow') {
      this.pop(circle, side);
      this.stats.gems += 1;
      this.emit('gem', { at: { x: circle.x, y: circle.y }, side });
      return;
    }
    const ask = this.asks.find((each) => each.circles.includes(circle.id));
    if (!ask) {
      // Not a colour that's asked for: it just wobbles.
      circle.wobble = Math.max(circle.wobble, 0.7);
      if (this.time - circle.bumpedAt > BUMP_AGAIN_AFTER) {
        circle.bumpedAt = this.time;
        this.emit('bump', { circle, side });
      }
      return;
    }
    if (ask.hand !== side) {
      // The circle asked for, with the other hand: it wobbles, and the hand that's asked for is said again.
      circle.wobble = 1;
      if (this.time - ask.wrongAt > WRONG_AGAIN_AFTER) {
        ask.wrongAt = this.time;
        this.stats.wrong[side] += 1;
        this.emit('wrong-hand', { ask, side, circle });
      }
      return;
    }
    if (circle.hold && circle.holding < HOLD_SECONDS) {
      circle.holding += dt;
      if (circle.holding < HOLD_SECONDS) return;
    }
    if (circle.big) {
      this.split(circle, ask);
      return;
    }
    this.pop(circle, side);
    if (ask.circles.every((id) => this.circles.find((each) => each.id === id)?.state === 'popped' || !this.circles.some((each) => each.id === id))) this.askDone(ask, side, circle);
  }

  /** Open hands on a big balloon only make it wobble, and the clap is asked for again: it pops with a clap. */
  touchBalloon(balloon, sides) {
    const ask = this.asks.find((each) => each.circles.includes(balloon.id));
    if (!ask) return;
    balloon.wobble = Math.max(balloon.wobble, 0.6);
    if (this.time - ask.wrongAt > WRONG_AGAIN_AFTER) {
      ask.wrongAt = this.time;
      this.emit('touch-balloon', { ask, side: sides[0], circle: balloon });
    }
  }

  /**
   * Where a clap happened just now, or null. Both hands have to be seen apart first, and come together within
   * CLAP.within seconds, so hands that drift together slowly, or stay together, aren't a clap. After a clap the hands
   * have to be apart again for the next.
   */
  readClap(gloves) {
    const seen = (side) => Boolean(gloves[side]?.visible && (gloves[side].tracked ?? true));
    const quick = () => this.time - this.apartAt <= CLAP.within;
    if (seen('left') && seen('right')) {
      const { left, right } = gloves;
      const gap = Math.hypot((left.x - right.x) * this.aspect, left.y - right.y);
      this.bothSeenAt = this.time;
      this.lastGap = gap;
      this.lastMiddle = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
      if (gap >= CLAP.apart) this.apartAt = this.time;
      else if (gap <= CLAP.together && quick()) {
        this.apartAt = -Infinity;
        return this.lastMiddle;
      }
      return null;
    }
    // One hand lost just as the two were nearly together: the tracker took them for one, and they met.
    const one = seen('left') ? gloves.left : seen('right') ? gloves.right : null;
    if (one && this.time - this.bothSeenAt <= CLAP.lost && this.lastGap <= CLAP.close && quick()) {
      this.apartAt = -Infinity;
      return { x: (one.x + this.lastMiddle.x) / 2, y: (one.y + this.lastMiddle.y) / 2 };
    }
    return null;
  }

  /**
   * A clap: on a big balloon that's asked for, it pops, and anywhere else then it's just a clap. With no balloon asked
   * for it's nothing at all, as hands come together for all sorts of reasons.
   */
  clapped(at) {
    const ask = this.asks.find((each) => each.hand === 'both');
    if (!ask) return;
    const balloon = this.live.find((circle) => ask.circles.includes(circle.id));
    const on = Boolean(balloon && this.gap(at, balloon) <= balloon.r + CLAP.reach);
    this.emit('clap', { at, on });
    if (!on) return;
    this.pop(balloon, 'both');
    this.askDone(ask, 'both', balloon);
  }

  pop(circle, side) {
    circle.state = 'popped';
    circle.endAge = 0;
    this.emit('pop', { circle, side });
  }

  /** A big circle popped: two halves of the same colour come out of it, and both have to be popped. */
  split(circle, ask) {
    circle.state = 'popped';
    circle.endAge = 0;
    const r = this.plan.radius * EXTRAS.splitSmaller;
    const halves = [-1, 1].map((way) => {
      const half = this.addCircle({ colour: circle.colour, r, kind: 'half', at: { x: circle.x + (way * EXTRAS.splitApart) / this.aspect, y: circle.y } });
      half.ask = ask.id;
      half.state = 'waiting';
      half.age = GROW_SECONDS;
      half.vx = way * Math.max(this.plan.speed, 0.03);
      half.vy = 0;
      return half;
    });
    ask.circles = halves.map((half) => half.id);
    if (Number.isFinite(this.turn.left)) this.turn.left += EXTRAS.splitExtra;
    this.emit('split', { circle, halves });
  }

  /** side is the hand that popped it, or 'both' for a big balloon. */
  askDone(ask, side, circle) {
    ask.done = true;
    const { stats } = this;
    stats.pops += 1;
    if (side === 'both') {
      stats.balloons += 1;
    } else {
      stats.popped[side] += 1;
      stats.seconds[side] += this.time - ask.started;
    }
    if (ask.star) {
      stats.stars += 1;
      this.emit('star', { at: { x: circle.x, y: circle.y } });
    }
    this.emit('popped', { ask, side, at: { x: circle.x, y: circle.y } });
    if (stats.pops >= this.goal) {
      this.turn = null;
      this.phase = 'won';
      this.endIn = PARTY_SECONDS;
      this.emit('won');
      return;
    }
    if (!this.asks.length) this.endTurn();
  }

  /** The clock ran out: what's still asked for fades away. */
  timeUp() {
    const missed = this.asks;
    for (const ask of missed) {
      ask.done = true;
      for (const circle of this.live) {
        if (!ask.circles.includes(circle.id)) continue;
        circle.state = 'fading';
        circle.endAge = 0;
      }
    }
    this.stats.faded += missed.length;
    this.emit('faded', { asks: missed });
    if (this.stats.faded >= this.toLose) {
      this.turn = null;
      this.phase = 'lost';
      this.endIn = LOST_SECONDS;
      this.emit('lost');
      return;
    }
    this.endTurn();
  }

  endTurn() {
    this.turn = null;
    for (const circle of this.live) circle.ask = null;
    this.fill();
    this.askIn = NEXT_ASK_AFTER;
  }

  /** Circles growing, popping, fading, wobbling, moving, hopping and swapping places. */
  animate(dt) {
    const moving = this.plan.drifting && this.phase !== 'ready';
    for (const circle of this.circles) {
      circle.age += dt;
      circle.wobble = Math.max(0, circle.wobble - dt * WOBBLE_SETTLES);
      if (circle.state === 'growing' && circle.age >= GROW_SECONDS) circle.state = 'waiting';
      if (circle.state === 'popped' || circle.state === 'fading') circle.endAge += dt;
      if (circle.kind === 'rainbow' && circle.state === 'waiting' && circle.age > EXTRAS.rainbowSeconds) {
        circle.state = 'fading';
        circle.endAge = 0;
      }
      if (circle.glide) {
        const { glide } = circle;
        glide.t = Math.min(1, glide.t + dt / glide.seconds);
        const along = ease(glide.t);
        circle.x = glide.from.x + (glide.to.x - glide.from.x) * along;
        circle.y = glide.from.y + (glide.to.y - glide.from.y) * along;
        if (glide.t >= 1) circle.glide = null;
      } else if (moving && circle.kind !== 'balloon' && (circle.state === 'waiting' || circle.state === 'growing')) {
        this.drift(circle, dt);
      }
    }
    this.circles = this.circles.filter((circle) => !((circle.state === 'popped' && circle.endAge > POP_SECONDS) || (circle.state === 'fading' && circle.endAge > FADE_SECONDS)));
    if (moving) this.keepApart();
  }

  /** A circle moving along, turning back at the edges of where circles can be. */
  drift(circle, dt) {
    if (circle.holding > 0) return; // A circle being held stays put.
    circle.x += (circle.vx / this.aspect) * dt;
    circle.y += circle.vy * dt;
    const { x, y } = this.area;
    const across = circle.r / this.aspect;
    if (circle.x < x[0] + across) circle.vx = Math.abs(circle.vx);
    if (circle.x > x[1] - across) circle.vx = -Math.abs(circle.vx);
    if (circle.y < y[0] + circle.r) circle.vy = Math.abs(circle.vy);
    if (circle.y > y[1] - circle.r) circle.vy = -Math.abs(circle.vy);
    this.clampInto(circle);
  }

  /** Moving circles that come too close push each other gently apart, and bounce off each other. */
  keepApart() {
    const moving = this.live.filter((circle) => !circle.glide);
    for (let i = 0; i < moving.length; i += 1) {
      for (let j = i + 1; j < moving.length; j += 1) {
        const a = moving[i];
        const b = moving[j];
        const apart = this.gap(a, b);
        const wanted = a.r + b.r + GAP * 0.5;
        if (apart >= wanted || apart === 0) continue;
        const push = (wanted - apart) / 2;
        const nx = ((a.x - b.x) * this.aspect) / apart;
        const ny = (a.y - b.y) / apart;
        a.x += (nx * push) / this.aspect;
        a.y += ny * push;
        b.x -= (nx * push) / this.aspect;
        b.y -= ny * push;
        [a.vx, b.vx] = [b.vx, a.vx];
        [a.vy, b.vy] = [b.vy, a.vy];
        this.clampInto(a);
        this.clampInto(b);
      }
    }
  }

  /** Glides a circle to a place, over so many seconds. */
  glideTo(circle, to, seconds) {
    circle.glide = { from: { x: circle.x, y: circle.y }, to, t: 0, seconds };
  }

  /** The things later levels bring: circles hopping and swapping places, and the rainbow circle. */
  extras(dt) {
    const { plan } = this;
    if (plan.hop) {
      for (const circle of this.plain) {
        if (circle.age < circle.hopAt || circle.state !== 'waiting' || circle.glide || circle.holding > 0) continue;
        circle.hopAt = Infinity;
        this.glideTo(circle, this.place(circle.r), EXTRAS.hopSeconds);
        this.emit('hop', { circle });
      }
    }
    if (plan.swap) {
      this.swapIn -= dt;
      if (this.swapIn <= 0) {
        this.swapIn = plan.swapEvery;
        this.swap();
      }
    }
    if (plan.rainbow) {
      this.rainbowIn -= dt;
      if (this.rainbowIn <= 0) {
        this.rainbowIn = EXTRAS.rainbowEvery;
        if (!this.live.some((circle) => circle.kind === 'rainbow')) {
          const rainbow = this.addCircle({ colour: 'rainbow', kind: 'rainbow', r: plan.radius * 0.9 });
          this.emit('rainbow', { circle: rainbow });
        }
      }
    }
  }

  /** Two ordinary circles glide to each other's places. */
  swap() {
    const free = this.plain.filter((circle) => !circle.glide && circle.holding === 0 && circle.state === 'waiting');
    if (free.length < 2) return;
    const a = free.splice(Math.floor(this.random() * free.length), 1)[0];
    const b = free[Math.floor(this.random() * free.length)];
    const [toA, toB] = [{ x: b.x, y: b.y }, { x: a.x, y: a.y }];
    this.glideTo(a, toA, EXTRAS.swapSeconds);
    this.glideTo(b, toB, EXTRAS.swapSeconds);
    this.emit('swap', { circles: [a, b] });
  }

  /* ---------- a grown-up's choices that go on at once ---------- */

  /** How far to reach: the circles move into the new area. */
  setReach(name) {
    if (!REACH_NAMES.includes(name)) return;
    this.reachName = name;
    this.area = REACHES[name];
    for (const circle of this.circles) {
      circle.glide = null;
      this.clampInto(circle);
    }
  }

  /** The hand in play, which is the one asked for more often, or only, if a grown-up chose that. */
  setSide(side) {
    this.side = side === 'left' ? 'left' : 'right';
  }

  emit(type, detail = {}) {
    this.onEvent({ type, ...detail });
  }
}
