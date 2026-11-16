// Hat Chase: a magpie has flown off with the hat, and the child's character goes after it, along a path through
// the hills, seen from the side. The child marches on the spot to walk: each knee lifted is a step. Things are in
// the way, and each wants a move: a stream to jump, a branch to duck under with bent knees, a hedgehog to jump
// before it rolls in, stepping stones, a springboard, bees to duck. The character stops at each one by itself and
// waits for the move, so nothing has to be timed to walk up to it.
//
// What can be lost is the magpie: it flies on ahead at its own pace, and once it's out of sight it has got away,
// and the level is to be tried again. Whatever goes wrong only costs time, which is what the magpie needs. A
// grown-up can have the magpie that waits. With nobody in the picture the magpie waits, and so does everything else.
//
// The path is measured in metres, and a step is one of them. The rules are here, with no screen, so they run in
// the unit tests. main.js says when the child has stepped, jumped, bent their knees or reached up, and view.js
// draws what this says.
import { clampLevel, ramp } from '../../core/levels.js';

// A step is this long, and takes this long to walk. Steps taken faster than that wait their turn, this many at most.
export const STEP = { length: 1, seconds: 0.4, waiting: 2 };

// The magpie, in metres ahead of the character: where it starts, the nearest it lets anyone come, how far ahead
// is out of sight, which is when it has got away, where it's said to be getting away, and how far ahead the
// gentle magpie waits.
export const MAGPIE = { start: 8, least: 6, away: 24, warn: 17, waits: 12 };
// Its pace, in metres a second, at level 1 and at level 10. A child marching one step a second walks 1 metre a
// second between things, and stands a while at each. So at level 1 a step every two seconds, with five seconds
// at each thing, keeps up. At level 10 it takes a step a second and each move within two seconds: with three
// seconds at each thing, the magpie gets away about three quarters of the way along.
export const PACE = [0.5, 1.2];

export const TUMBLE_SECONDS = 1.4; // Sitting down with a bump, when something wasn't jumped or ducked in time.
// Nobody is ever stuck at something they can't do: after this long standing at it, marching on climbs past it,
// slowly, and with no stars for it.
export const HELP_AFTER = 12;
export const CLAMBER_SECONDS = 2.4;
export const BIG_JUMP = 1.6; // From this size up a jump is a big one: 1 is the smallest that counts as a jump.
export const HOP_SECONDS = 0.5; // A jump with nothing to jump, on the spot.
const STOP_SHORT = 0.6; // The character stops this far before a thing, and lands this far past it.
const FIRST_AT = 6; // Where the first thing is, so there's a little walking first.
const GAPS = [5, 8]; // Metres of path between one thing and the next.
// From level 9, some come one straight after the other: landing from the first is standing at the second.
const PAIR_GAP = STOP_SHORT * 2;
const STAR_EVERY = 2; // A star on the path every so many metres of walking.

// What's in the way. needs is the move, wide how much path it takes up, seconds how long getting past it takes,
// from the level it first comes at, times how many of the move it takes, fuse whether it comes at the character
// if the move is left too long, and stars what clearing it is worth.
export const KINDS = {
  stream: { needs: 'jump', wide: 1.6, seconds: 0.8, from: 1, stars: 1 },
  branch: { needs: 'squat', wide: 1.2, seconds: 0.9, from: 2, stars: 1 },
  hedgehog: { needs: 'jump', wide: 2.2, seconds: 0.9, from: 4, stars: 2, fuse: true },
  stones: { needs: 'jump', wide: 4.2, seconds: 0.55, from: 5, stars: 3, times: 3 },
  spring: { needs: 'jump', wide: 5, seconds: 1.6, from: 6, stars: 1 },
  bees: { needs: 'squat', wide: 2.4, seconds: 1.6, from: 7, stars: 2, fuse: true },
};
// How long a hedgehog takes to roll in, or the bees to arrive, once the character has stopped: at the level each
// first comes, and at level 10.
export const FUSE = [5, 2.6];
export const TREE = { from: 3, wide: 3, apples: 3, chance: 0.45 }; // An apple tree beside the path: reach up under it.
export const FEATHER = { from: 8, worth: 5 }; // A golden feather over a stream, for a big jump.
export const HIGH_STAR = 1; // Before the feathers, a big jump over a stream catches the star above it.
export const SPRING_STARS = 5; // The arc of stars over a springboard, for a star jump.
export const PAIRS = { from: 9, chance: 0.35 };
export const CUP = { from: 10 };

// What each level brings that's new, for the title card, the countdown and the finish card.
export const NEW_THINGS = {
  2: [{ id: 'branch', mark: '🌿', name: 'Low branches: bend your knees to duck under', nameKa: 'დაბალი ტოტები: მუხლები მოხარე და ქვეშ გაძვერი' }],
  3: [{ id: 'tree', mark: '🍎', name: 'Apple trees: reach up high to pick the apples', nameKa: 'ვაშლის ხეები: ხელები მაღლა ასწიე და ვაშლები მოკრიფე' }],
  4: [{ id: 'hedgehog', mark: '🦔', name: 'Hedgehogs: jump before one rolls into you', nameKa: 'ზღარბები: ახტი, სანამ მოგორდება' }],
  5: [{ id: 'stones', mark: '🪨', name: 'Stepping stones: three jumps across the pond', nameKa: 'ქვები გუბურაში: სამი ნახტომი' }],
  6: [{ id: 'spring', mark: '🤸', name: 'A springboard: a star jump catches the stars above', nameKa: 'ტრამპლინი: ვარსკვლავა ნახტომი ვარსკვლავებს იჭერს' }],
  7: [{ id: 'bees', mark: '🐝', name: 'Bees: bend your knees before they fly over', nameKa: 'ფუტკრები: მუხლები მოხარე, სანამ გადაიფრენენ' }],
  8: [{ id: 'feather', mark: '🪶', name: 'Golden feathers over the streams, for a big jump', nameKa: 'ოქროს ბუმბულები ნაკადულებზე: დიდი ნახტომი' }],
  9: [{ id: 'pairs', mark: '⚡', name: 'Two things in a row, one straight after the other', nameKa: 'ორი დაბრკოლება ზედიზედ' }],
  10: [{ id: 'cup', mark: '🏆', name: 'The cup is in the magpie’s tree', nameKa: 'თასი კაჭკაჭის ხეზეა' }],
};

/** What's new at a level, as the cards want it. */
export const newAt = (level) => NEW_THINGS[clampLevel(level)] ?? [];

/** A number that goes from one end to the other between the level something starts at and level 10. */
const since = (level, first, [from, to]) => from + ((to - from) * Math.max(0, level - first)) / Math.max(1, 10 - first);

/** How a level is played. gentle is the magpie that waits, so nothing can be lost. */
export function chaseLevel(level, { gentle = false } = {}) {
  const at = clampLevel(level);
  const kinds = Object.keys(KINDS).filter((kind) => KINDS[kind].from <= at);
  return {
    level: at,
    kinds,
    pace: ramp(at, PACE[0], PACE[1]),
    gentle,
    // The hedgehog comes at level 4 and the bees at level 7, each with its own time to begin with.
    fuse: { hedgehog: since(at, KINDS.hedgehog.from, FUSE), bees: since(at, KINDS.bees.from, FUSE) },
    trees: at >= TREE.from,
    feathers: at >= FEATHER.from,
    pairs: at >= PAIRS.from,
    cup: at >= CUP.from,
  };
}

const between = (random, [from, to]) => from + random() * (to - from);

/**
 * Lays out a path: the things in the way, the apple trees beside it, the stars along it, and where it ends, at
 * the magpie's tree. Exported so the tests can look at one. things is how many things are in the way.
 */
export function layPath({ level = 1, things = 12, random = Math.random } = {}) {
  const rules = chaseLevel(level);
  const course = [];
  const trees = [];
  const stars = [];
  const newest = rules.kinds.filter((kind) => KINDS[kind].from === rules.level);
  let at = FIRST_AT;
  let walkedFrom = 0;
  for (let index = 0; index < things; index += 1) {
    // A new kind always comes at its level: the second thing is one, and chance decides the rest. At the level
    // the golden feathers come, it's a stream, as that's where they are.
    const second = index === Math.min(1, things - 1);
    const sure = rules.level === FEATHER.from ? 'stream' : newest[0];
    const kind = sure && second ? sure : rules.kinds[Math.floor(random() * rules.kinds.length)];
    const { needs, wide, seconds, stars: worth, times = 1, fuse = false } = KINDS[kind];
    // The stars along the path up to it, never right at its edge.
    for (let star = walkedFrom + STAR_EVERY; star < at - STOP_SHORT - 0.5; star += STAR_EVERY) stars.push({ at: star, taken: false });
    const thing = { index, kind, needs, at, wide, seconds, worth, times, done: 0, state: 'ahead', waited: 0 };
    if (fuse) thing.fuse = rules.fuse[kind];
    // Over a stream, something for a big jump: a star, or from level 8 a golden feather.
    if (kind === 'stream') thing.high = { feather: rules.feathers, taken: false };
    course.push(thing);
    const far = at + wide;
    // From level 9 some things come in twos, and the first that can always does, so a short path has one.
    const pairs = rules.pairs && index < things - 1 && (random() < PAIRS.chance || !course.some((each) => each.paired));
    if (pairs) {
      thing.paired = true;
      at = far + PAIR_GAP;
      walkedFrom = far + STOP_SHORT;
      continue;
    }
    const gap = Math.round(between(random, GAPS));
    // An apple tree beside the path in some of the gaps, and in the first one that has room if chance brings none.
    if (rules.trees && gap >= TREE.wide + 2 && (random() < TREE.chance || (!trees.length && index >= Math.min(2, things - 1)))) {
      trees.push({ at: far + (gap - TREE.wide) / 2, wide: TREE.wide, picked: false });
    }
    at = far + gap;
    walkedFrom = far + STOP_SHORT;
  }
  const end = at;
  for (let star = walkedFrom + STAR_EVERY; star < end - 1.5; star += STAR_EVERY) stars.push({ at: star, taken: false });
  stars.forEach((star, index) => {
    star.index = index;
  });
  return { course, trees, stars, end };
}

const emptyStats = () => ({
  steps: 0,
  left: 0,
  right: 0,
  jumps: 0,
  big: 0,
  squats: 0,
  reaches: 0,
  starJumps: 0,
  stars: 0,
  feathers: 0,
  apples: 0,
  cleared: 0, // Things got past with the move they wanted.
  tumbles: 0, // Things that came at the character before the move was made.
  helped: 0, // Things climbed past after a long wait.
  seconds: 0,
  cup: false,
});

const easeInOut = (share) => share * share * (3 - 2 * share);

export class Chase {
  /**
   * level is 1 to 10, things how many things are in the way, gentle the magpie that waits, and onEvent is told
   * what happens: see main.js.
   */
  constructor({ level = 1, things = 12, gentle = false, random = Math.random, onEvent = () => {} } = {}) {
    this.levelNumber = clampLevel(level);
    this.rules = chaseLevel(level, { gentle });
    this.onEvent = onEvent;
    Object.assign(this, layPath({ level, things, random }));
    this.state = 'ready'; // ready, play, won, lost
    this.time = 0;
    // The character: where it is, where its steps are taking it, and what it's doing. A move is getting past
    // something, or a hop on the spot: { kind, from, to, t, seconds, thing }.
    this.hero = { x: 0, walkTo: 0, mode: 'stand', move: null, tumble: 0, side: 'left' };
    this.station = null; // The thing the character has stopped at, and is waiting to be got past.
    this.magpie = { x: MAGPIE.start, warned: false };
    this.nextStar = 0;
    this.stats = emptyStats();
  }

  emit(type, more = {}) {
    this.onEvent({ type, ...more });
  }

  begin() {
    this.state = 'play';
    this.emit('begin');
  }

  /** How far ahead the magpie is, in metres. */
  get lead() {
    return this.magpie.x - this.hero.x;
  }

  /** How near the magpie is to getting away: 0 when it's as near as it lets anyone, and 1 when it's out of sight. */
  get danger() {
    if (this.rules.gentle) return 0;
    return Math.min(1, Math.max(0, (this.lead - MAGPIE.least) / (MAGPIE.away - MAGPIE.least)));
  }

  /** The next thing in the way that hasn't been got past, or null on the last stretch. */
  get next() {
    return this.course.find((thing) => thing.state === 'ahead' || thing.state === 'at') ?? null;
  }

  /** How far along the path the character may walk before it has to stop: at the next thing, or at the end. */
  get stopAt() {
    const { next } = this;
    return next ? next.at - STOP_SHORT : this.end;
  }

  /** How far along the whole path the character is, from 0 to 1. */
  get progress() {
    return Math.min(1, Math.max(0, this.hero.x / this.end));
  }

  /** Whether the character is in the middle of something, and can't start anything else. */
  get busy() {
    return this.hero.mode === 'move' || this.hero.mode === 'tumble';
  }

  /** The apple tree the character is under, if its apples are still on it. */
  get treeHere() {
    const { x } = this.hero;
    return this.trees.find((tree) => !tree.picked && x >= tree.at && x <= tree.at + tree.wide) ?? null;
  }

  /* ---------- what the child does ---------- */

  /** A knee lifted: one step along the path. side is which leg it was. */
  step(side = 'left') {
    if (this.state !== 'play' || this.busy) return false;
    const { hero, stats, station } = this;
    if (station) {
      // Standing at something for a long time, marching on climbs past it: nobody is stuck at a move they can't do.
      if (station.waited < HELP_AFTER) return false;
      this.countStep(side);
      this.startMove('clamber', station, CLAMBER_SECONDS);
      stats.helped += 1;
      this.emit('helped', { thing: station });
      return true;
    }
    const most = Math.min(this.stopAt, hero.x + STEP.waiting * STEP.length);
    const already = Math.max(hero.walkTo, hero.x);
    const wanted = Math.min(most, already + STEP.length);
    // A step that would take it no further is let go: it's at something, or two steps are waiting already.
    if (wanted <= already + 1e-6) return false;
    hero.walkTo = wanted;
    hero.mode = 'walk';
    this.countStep(side);
    this.emit('step', { side });
    return true;
  }

  countStep(side) {
    this.stats.steps += 1;
    this.stats[side === 'right' ? 'right' : 'left'] += 1;
    this.hero.side = side;
  }

  /**
   * A jump. size is how big it was: 1 is the smallest that counts, and BIG_JUMP and up is a big one. star is a
   * star jump, arms and legs out. At something that wants a jump it gets the character past it, or one stone
   * further. Anywhere else it's a hop on the spot.
   */
  jump(size = 1, { star = false } = {}) {
    if (this.state !== 'play' || this.busy) return false;
    const { stats, station } = this;
    const big = size >= BIG_JUMP;
    stats.jumps += 1;
    if (big) stats.big += 1;
    if (star) stats.starJumps += 1;
    if (!station || station.needs !== 'jump') {
      this.startMove('hop', null, HOP_SECONDS);
      this.emit('hop', { size, star });
      return true;
    }
    if (station.kind === 'stones') {
      station.done += 1;
      this.startMove('stone', station, station.seconds, { last: station.done >= station.times });
    } else if (station.kind === 'spring') {
      this.startMove('bounce', station, station.seconds, { star });
      // The arc of stars over a springboard is for a star jump, which goes that much higher.
      if (star) this.addStars(SPRING_STARS, 'arc');
    } else {
      this.startMove('leap', station, station.seconds, { big });
      // Over a stream, a big jump reaches what's up above it.
      if (big) this.takeHigh(station);
    }
    this.emit('jump', { thing: station, size, big, star });
    return true;
  }

  /**
   * A jump that's still going up has turned out to be a big one, as the camera only sees how high a jump is once
   * it's well off the floor: over a stream, it reaches what's up above it after all. size is how big it is by now.
   */
  grow(size) {
    const { move } = this.hero;
    if (this.state !== 'play' || !move || move.kind !== 'leap' || move.big || size < BIG_JUMP) return false;
    // Coming down again, it's too late to go any higher.
    if (move.t > move.seconds * 0.6) return false;
    move.big = true;
    this.stats.big += 1;
    this.takeHigh(move.thing);
    return true;
  }

  /** What's up above a stream is caught: a star, or from level 8 a golden feather. */
  takeHigh(thing) {
    if (!thing.high || thing.high.taken) return;
    thing.high.taken = true;
    if (thing.high.feather) {
      this.stats.feathers += 1;
      this.addStars(FEATHER.worth, 'feather');
    } else this.addStars(HIGH_STAR, 'high');
    this.emit('high', { thing });
  }

  /** Knees bent: under a branch, or down out of the way of the bees. Anywhere else it's only seen. */
  squat() {
    if (this.state !== 'play' || this.busy) return false;
    this.stats.squats += 1;
    const { station } = this;
    if (!station || station.needs !== 'squat') {
      this.emit('bob');
      return false;
    }
    this.startMove('duck', station, station.seconds);
    this.emit('duck', { thing: station });
    return true;
  }

  /** Both arms up high: under an apple tree, the apples come down. */
  reach() {
    if (this.state !== 'play') return false;
    this.stats.reaches += 1;
    const tree = this.treeHere;
    if (!tree) return false;
    tree.picked = true;
    this.stats.apples += TREE.apples;
    this.addStars(TREE.apples, 'apples');
    this.emit('apples', { tree });
    return true;
  }

  addStars(count, from) {
    this.stats.stars += count;
    this.emit('stars', { count, from });
  }

  /** The character sets off past a thing, or hops on the spot: where from, where to and how long it takes. */
  startMove(kind, thing, seconds, more = {}) {
    const { hero } = this;
    const from = hero.x;
    let to = from;
    if (thing) {
      // On the stepping stones, each jump is one stone further, and the last lands on the far bank.
      if (kind === 'stone') to = more.last ? thing.at + thing.wide + STOP_SHORT : thing.at + (thing.wide * thing.done) / thing.times;
      else to = thing.at + thing.wide + STOP_SHORT;
      thing.state = 'passing';
    }
    hero.mode = 'move';
    hero.move = { kind, thing, from, to, t: 0, seconds, ...more };
    hero.walkTo = to;
    // Past a thing, it's no longer standing at it. A hop on the spot, or a stone that isn't the last, leaves it there.
    if (thing && (kind !== 'stone' || more.last)) this.station = null;
  }

  /* ---------- each frame ---------- */

  /** One frame. seen is whether the camera can see the child: with nobody in the picture everything waits. */
  update(dt, { seen = true } = {}) {
    if (this.state !== 'play' || !seen) return;
    this.time += dt;
    this.stats.seconds += dt;
    this.moveHero(dt);
    this.waitAtStation(dt);
    if (this.state !== 'play') return;
    this.moveMagpie(dt);
  }

  moveHero(dt) {
    const { hero } = this;
    if (hero.mode === 'tumble') {
      hero.tumble -= dt;
      if (hero.tumble <= 0) hero.mode = 'stand';
      return;
    }
    if (hero.mode === 'move') {
      const { move } = hero;
      move.t = Math.min(move.seconds, move.t + dt);
      hero.x = move.from + (move.to - move.from) * easeInOut(move.t / move.seconds);
      if (move.t < move.seconds) return;
      hero.mode = 'stand';
      hero.move = null;
      hero.walkTo = hero.x;
      this.finishMove(move);
      return;
    }
    if (hero.mode !== 'walk') return;
    const speed = STEP.length / STEP.seconds;
    hero.x = Math.min(hero.walkTo, hero.x + speed * dt);
    this.collectStars();
    if (hero.x < hero.walkTo - 1e-6) return;
    hero.mode = 'stand';
    this.arrive();
  }

  /** A move has finished: the thing is behind the character now, or the next stone is under it. */
  finishMove(move) {
    const { thing, kind } = move;
    if (!thing) return;
    if (kind === 'stone' && !move.last) {
      thing.state = 'at';
      this.station = thing;
      return;
    }
    thing.state = 'cleared';
    if (kind !== 'clamber') {
      this.stats.cleared += 1;
      this.addStars(thing.worth, thing.kind);
    }
    this.emit('cleared', { thing, how: kind });
    this.collectStars();
    this.arrive();
  }

  /** Walking has brought the character to where it has to stop: at the next thing, or at the magpie's tree. */
  arrive() {
    const { hero, next } = this;
    if (hero.x < this.stopAt - 1e-6) return;
    if (!next) {
      this.win();
      return;
    }
    next.state = 'at';
    next.waited = 0;
    if (next.fuse !== undefined) next.left = next.fuse;
    this.station = next;
    this.emit('arrive', { thing: next });
  }

  /** The stars on the path the character has walked past are picked up. */
  collectStars() {
    const { stars, hero } = this;
    while (this.nextStar < stars.length && hero.x >= stars[this.nextStar].at) {
      const star = stars[this.nextStar];
      this.nextStar += 1;
      // One inside something that was jumped over or ducked under stays where it is.
      if (star.taken) continue;
      star.taken = true;
      this.stats.stars += 1;
      this.emit('star', { star });
    }
  }

  /** Standing at a thing: how long for, and a hedgehog rolling in or the bees arriving before the move was made. */
  waitAtStation(dt) {
    const { station, hero } = this;
    if (!station || hero.mode !== 'stand') return;
    station.waited += dt;
    if (station.left === undefined) return;
    station.left = Math.max(0, station.left - dt);
    if (station.left > 0) return;
    // It got here first: a bump, a sit down, and it's gone by, with nothing for it.
    station.state = 'cleared';
    station.missed = true;
    this.station = null;
    hero.mode = 'tumble';
    hero.tumble = TUMBLE_SECONDS;
    hero.walkTo = hero.x;
    this.stats.tumbles += 1;
    this.emit('tumble', { thing: station });
  }

  /**
   * The magpie flies on at its own pace, past its own tree if the character is a long way behind: it only comes
   * home once the character gets there. It never lets the character come nearer than so far, and the gentle one
   * never goes further ahead than so far. Out of sight, it has got away.
   */
  moveMagpie(dt) {
    const { magpie, hero, rules } = this;
    const before = magpie.x;
    let x = magpie.x + rules.pace * dt;
    if (rules.gentle) x = Math.min(x, Math.max(magpie.x, hero.x + MAGPIE.waits));
    x = Math.max(x, hero.x + MAGPIE.least);
    magpie.x = x;
    magpie.flying = magpie.x > before + 1e-9;
    if (rules.gentle) return;
    if (this.lead >= MAGPIE.away) {
      this.state = 'lost';
      this.emit('lost');
      return;
    }
    // Said once each time it gets far ahead, and again only after the character has caught up a good way.
    if (!magpie.warned && this.lead >= MAGPIE.warn) {
      magpie.warned = true;
      this.emit('away');
    } else if (magpie.warned && this.lead < MAGPIE.warn - 6) magpie.warned = false;
  }

  win() {
    this.state = 'won';
    if (this.rules.cup) {
      this.stats.cup = true;
      this.emit('cup');
    }
    this.emit('won');
  }
}
