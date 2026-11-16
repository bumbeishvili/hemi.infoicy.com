// Giraffe's Maze, as it's played: the mazes of a game one after another, the character walking towards the open
// hand, what it picks up, what's in the way, and the friends it finds. No screen in this file: main.js gives it
// where the glove is each frame, and draws what it says, so it can be tested on its own with a pretend child.
//
// With friends, everyone's game makes the same mazes from the host's seed, with nobody lost in them, and each child
// leads their character to the way out on the right of each maze, one maze after another. Against each other it's a
// race, each at their own pace: whoever gets out of the last maze first has won. Together, on the same side, the
// first to find the way out of a maze takes everyone on to the next: see carriedOut.
//
// On their own, the sun goes down over each maze, and setting before the friend is found ends the game: see SUN in
// rules.js. With sun: 'gentle' there's no sun, and nothing can be lost, as it always was, and a sheep or a bush gets
// out of the way by itself after a while. In a race there's no sun: the race is the contest. Each child has all the fruit in their own mazes, so a
// child behind never finds less of it, and the race needs nothing from the server but who's where.
import {
  buildMaze, distances, edgeKey, EXTRAS, facingOf, featuresFor, FOUND_SECONDS, mazeLevel, newWalker, OUT_CELLS, REACHES,
  SLIDE_SECONDS, stepWalker, SUN, sunSeconds, Trail, WALK, walkerAt, wayBetween, wayToward,
} from './rules.js';

export const FOLLOW_SPACING = 0.72; // Cells between each friend following along behind.
const STUCK_AFTER = 1.2; // Seconds of an open hand the character can't get any nearer to, before it shows it.
const LEAVE_SECONDS = 1; // A butterfly flies off over this long when its time is up.

const nothing = () => {};

export class MazeRun {
  /**
   * seed is the word every maze of the game is made from, size how big they are, level the level played, and cast
   * who is lost in each maze on their own, as a list of character ids for each. ways is 'lead', to go where the hand
   * leads, or 'find', to find the way to the hand. race is true with friends, for a race out of mazes mazes, with
   * nobody lost in them. events are told what happens: see main.js.
   */
  constructor({ seed, size = 'medium', level = 1, cast = [], mazes = cast.length, ways = 'lead', race = false, sun = 'sets', events = {}, random = Math.random }) {
    Object.assign(this, { seed, size, level, cast, ways, race, random });
    // Whether the sun goes down over each maze: on their own, unless the gentle maze was chosen.
    this.timed = !race && sun !== 'gentle';
    this.sun = null; // { left, total }, in seconds, while there's a maze to walk.
    this.lost = false;
    this.events = new Proxy(events, { get: (target, name) => target[name] ?? nothing });
    this.mazes = mazes;
    this.plan = mazeLevel(level);
    this.time = 0;
    this.index = -1;
    this.layout = null;
    this.nextLayout = null;
    this.phase = 'ready';
    this.phaseTime = 0;
    this.stats = { fruit: 0, found: 0, out: 0, carried: 0, walked: 0, prizes: { butterfly: 0, gem: 0, crown: 0 }, keys: 0, gates: 0, sheep: 0, bushes: 0 };
    this.trail = new Trail();
    this.followers = [];
    this.butterflies = [];
    this.butterflyNumber = 0;
    this.stuckFor = 0;
    this.moving = false;
    this.layout = this.makeLayout(0);
    this.place();
  }

  /** The maze of the game at this index, with what's in it as it starts. */
  makeLayout(index) {
    const features = featuresFor(this.level, index, this.size, { extras: !this.race });
    const layout = buildMaze({ seed: this.seed, index, size: this.size, level: this.level, features, race: this.race });
    layout.features = features;
    layout.lost.forEach((lost, at) => {
      lost.who = this.cast[index]?.[at];
      lost.found = false;
    });
    for (const item of layout.items) Object.assign(item, { gone: false, pull: null });
    for (const blocker of layout.blockers) Object.assign(blocker, { open: false, progress: 0, waited: 0 });
    return layout;
  }

  /** The character at the way in, with the friends found so far lined up behind it. */
  place() {
    const { layout } = this;
    this.walker = newWalker(layout.start);
    this.walker.facing = 1;
    const { x, y } = layout.maze.centre(layout.start);
    this.trail.reset(x, y);
    this.hasKey = false;
    this.power = null;
    this.bird = null;
    this.butterflies = [];
    this.butterflyIn = this.plan.butterflies ? 3 : Infinity;
    this.stuckFor = 0;
    this.lockedShown = false;
    this.waitingAt = null;
    this.out = null; // In a race, once the way out is reached: { from, by }, where from and how far it has walked out.
  }

  get maze() {
    return this.layout.maze;
  }

  /** Where the character is, in cells: beyond the maze's right edge as it walks out of it in a race. */
  get position() {
    return this.out ? this.outAt() : walkerAt(this.layout.maze, this.walker);
  }

  get over() {
    return this.phase === 'over';
  }

  begin() {
    this.startMaze(0);
  }

  startMaze(index) {
    this.index = index;
    if (index > 0) this.layout = this.nextLayout ?? this.makeLayout(index);
    this.nextLayout = null;
    this.place();
    this.phase = 'walking';
    this.phaseTime = 0;
    if (this.timed) {
      const total = sunSeconds(this.layout, this.level);
      this.sun = { left: total, total };
    }
    this.events.onMazeStart(index, this.layout);
  }

  /* ---------- what's in the way ---------- */

  blockerOn(a, b) {
    const key = edgeKey(a, b);
    return this.layout.blockers.find((blocker) => edgeKey(blocker.a, blocker.b) === key) ?? null;
  }

  /** How far along the way from cell a in direction d the character may go: see stepWalker. */
  limit(a, d) {
    const { maze } = this.layout;
    if (!maze.isOpen(a, d)) return 0;
    const blocker = this.blockerOn(a, maze.next(a, d));
    return blocker && !blocker.open ? WALK.cap : 1;
  }

  /** Whether the way from cell a in direction d can be walked all the way along now. */
  passable(a, d) {
    return this.limit(a, d) >= 1;
  }

  /* ---------- each frame ---------- */

  /**
   * One frame of play. input is where the glove is, in cells, and whether the hand counts as open: { target, open,
   * glove, gloveSpeed }, target being where the character walks to, inside the maze, glove where the glove really
   * is, and either null when it can't be seen. gloveSpeed is how fast it's moving, in cells a second.
   */
  update(dt, input = {}) {
    this.time += dt;
    this.phaseTime += dt;
    if (this.phase === 'walking') {
      this.walk(dt, input);
      this.sunGoesDown(dt, input);
    } else if (this.phase === 'out') this.walkOut(dt);
    else this.moving = false;
    this.updateFollowers();
    this.updateButterflies(dt, input);
    this.updateBird(dt);
    if ((this.phase === 'found' || this.phase === 'out' || this.phase === 'carried') && this.phaseTime >= FOUND_SECONDS) {
      if (this.index < this.mazes - 1) {
        this.phase = 'sliding';
        this.phaseTime = 0;
        this.nextLayout = this.makeLayout(this.index + 1);
        this.events.onSlide(this.index + 1, this.nextLayout);
      } else {
        this.phase = 'over';
        this.phaseTime = 0;
        this.events.onOver();
      }
    } else if (this.phase === 'sliding' && this.phaseTime >= SLIDE_SECONDS) {
      this.startMaze(this.index + 1);
    } else if (this.phase === 'sunset' && this.phaseTime >= SUN.setSeconds) {
      this.phase = 'over';
      this.phaseTime = 0;
      this.events.onOver();
    }
  }

  /**
   * The sun goes down while the hand is in the picture, open or not, and waits while it isn't, so a child who goes
   * away, or whose hand the camera loses, isn't caught out for it. Setting before the friend is found ends the game.
   */
  sunGoesDown(dt, input) {
    const { sun } = this;
    if (!sun || this.phase !== 'walking' || !input.glove) return;
    sun.left = Math.max(0, sun.left - dt);
    if (sun.left > 0) return;
    this.lost = true;
    this.phase = 'sunset';
    this.phaseTime = 0;
    this.power = null;
    this.stuckFor = 0;
    this.moving = false;
    this.events.onSunset(this.layout.lost.find((each) => !each.found) ?? null);
  }

  walk(dt, input) {
    const { maze } = this.layout;
    const open = Boolean(input.open && input.target);
    const before = this.position;
    let moved = 0;
    if (open) {
      const target = { x: Math.min(maze.cols - 0.05, Math.max(0.05, input.target.x)), y: Math.min(maze.rows - 0.05, Math.max(0.05, input.target.y)) };
      const speed = WALK.speed * (this.power?.kind === 'shoes' ? EXTRAS.shoesSpeed : 1);
      const field = this.ways === 'find' ? wayToward(maze, this.walker, target, (a, d) => this.passable(a, d)) : null;
      moved = stepWalker(maze, this.walker, target, speed * dt, { limit: (a, d) => this.limit(a, d), field });
      const gap = Math.hypot(target.x - before.x, target.y - before.y);
      this.stuckFor = moved < 0.002 && gap > 0.6 ? this.stuckFor + dt : 0;
    } else {
      this.stuckFor = 0;
    }
    this.moving = moved > 0.0005;
    this.stats.walked += moved;
    const at = this.position;
    this.trail.add(at.x, at.y);
    // A power-up only runs down while the hand is open, so resting never wastes it.
    if (this.power && open) {
      this.power.left -= dt;
      if (this.power.left <= 0) this.power = null;
    }
    this.pickUp(at, dt);
    this.workOnBlockers(dt, input, at);
    if (this.race) this.reachWayOut(at);
    else this.findFriends(at);
  }

  /** In a race: the character has got to the way out of this maze, and walks on out of it by itself. */
  reachWayOut(at) {
    const way = this.layout.maze.centre(this.layout.goal);
    if (Math.hypot(way.x - at.x, way.y - at.y) > REACHES.find) return;
    this.out = { from: { ...at }, by: 0 };
    this.stats.out += 1;
    this.phase = 'out';
    this.phaseTime = 0;
    this.power = null;
    this.events.onOut(this.index, this.index === this.mazes - 1);
  }

  /**
   * Playing together with friends: one of them has found the way out of this maze, and everyone goes on to the
   * next with them. The character stops where it is for the moment a way out found takes, and then it's the next
   * maze, or the end of the game after the last. True if that's what happened: only while this maze is being walked.
   */
  carriedOut() {
    if (!this.race || this.phase !== 'walking') return false;
    this.phase = 'carried';
    this.phaseTime = 0;
    this.power = null;
    this.stuckFor = 0;
    this.moving = false;
    this.stats.carried += 1;
    this.events.onCarried(this.index, this.index === this.mazes - 1);
    return true;
  }

  /** Out of a maze, it walks to the middle of the last cell, and on out through the way out. */
  walkOut(dt) {
    const { out } = this;
    const way = this.layout.maze.centre(this.layout.goal);
    const first = Math.hypot(way.x - out.from.x, way.y - out.from.y);
    const step = Math.min(first + OUT_CELLS - out.by, WALK.speed * dt);
    out.by += step;
    this.moving = step > 0.0005;
    this.stats.walked += step;
    this.walker.facing = out.by < first ? facingOf(way.x - out.from.x, way.y - out.from.y, 1) : 1;
  }

  /** Where it is, walking out. */
  outAt() {
    const { from, by } = this.out;
    const way = this.layout.maze.centre(this.layout.goal);
    const first = Math.hypot(way.x - from.x, way.y - from.y);
    if (by < first) return { x: from.x + ((way.x - from.x) * by) / first, y: from.y + ((way.y - from.y) * by) / first };
    return { x: way.x + Math.min(OUT_CELLS, by - first), y: way.y };
  }

  /** Whether the character can't get any nearer to an open hand, as when it's on the other side of a hedge. */
  get stuck() {
    return this.stuckFor > STUCK_AFTER;
  }

  pickUp(at, dt) {
    const { items } = this.layout;
    const magnet = this.power?.kind === 'magnet';
    for (const item of items) {
      if (item.gone || item.opened) continue;
      if ((magnet || item.pull) && (item.kind === 'fruit' || item.kind === 'gem')) this.pullIn(item, at, dt);
      const where = item.pull ?? item;
      if (Math.hypot(where.x - at.x, where.y - at.y) > REACHES.pick) continue;
      this.take(item, at);
    }
  }

  /** The magnet draws fruit and gems near the character to it, over the hedges. Once on its way, it arrives. */
  pullIn(item, at, dt) {
    const from = item.pull ?? { x: item.x, y: item.y };
    const gap = Math.hypot(at.x - from.x, at.y - from.y);
    if (!item.pull && gap > EXTRAS.magnetRange) return;
    const step = Math.min(gap, EXTRAS.magnetPull * dt);
    item.pull = { x: from.x + ((at.x - from.x) / (gap || 1)) * step, y: from.y + ((at.y - from.y) / (gap || 1)) * step };
  }

  take(item, at) {
    switch (item.kind) {
      case 'fruit':
        item.gone = true;
        this.stats.fruit += 1;
        this.events.onEat(item);
        return;
      case 'key':
        item.gone = true;
        this.hasKey = true;
        this.stats.keys += 1;
        this.events.onKey(item);
        return;
      case 'shoes':
      case 'magnet': {
        item.gone = true;
        const seconds = item.kind === 'shoes' ? EXTRAS.shoesSeconds : EXTRAS.magnetSeconds;
        this.power = { kind: item.kind, left: seconds, seconds };
        this.events.onPower(item.kind, item);
        return;
      }
      case 'bird':
        item.gone = true;
        this.startBird(at);
        return;
      case 'gem':
        item.gone = true;
        this.prize('gem', item.pull ?? item);
        return;
      case 'chest':
        item.opened = true;
        this.events.onChest(item);
        this.prize('crown', item);
        return;
      default:
    }
  }

  prize(kind, at) {
    this.stats.prizes[kind] += 1;
    this.events.onPrize(kind, { x: at.x, y: at.y });
  }

  /** The sheep, the bush and the gate: what the hand and the character do about them. */
  workOnBlockers(dt, input, at) {
    this.waitingAt = null;
    for (const blocker of this.layout.blockers) {
      if (blocker.open) continue;
      const near = Math.hypot(blocker.x - at.x, blocker.y - at.y);
      // Standing right up against it. With the sun going down, also standing still near it, as at a corner just
      // before it, so what to do about it is shown: nothing gets out of the way by itself then.
      if (near < 0.5 - WALK.cap + 0.12 || (this.timed && near < 1 && !this.moving)) this.waitingAt = blocker;
      const glove = input.glove;
      const onIt = glove && input.open && Math.hypot(blocker.x - glove.x, blocker.y - glove.y) < REACHES.touch;
      // Waiting right by it: in the gentle maze a sheep wakes and a bush goes by themselves after a while, so nobody
      // gets stuck. With the sun going down they don't: the hand has to see to them.
      if (near < 1 && !this.timed) blocker.waited += dt;
      if (blocker.kind === 'gate') {
        if (near < REACHES.gate) {
          if (this.hasKey) this.open(blocker);
          else if (!this.lockedShown) {
            this.lockedShown = true;
            this.events.onLocked(blocker);
          }
        }
      } else if (blocker.kind === 'sheep') {
        if (onIt) blocker.progress = Math.min(1, blocker.progress + dt / EXTRAS.sheepWake);
        if (blocker.progress >= 1 || blocker.waited >= EXTRAS.sheepWakes) this.open(blocker);
      } else if (blocker.kind === 'bush') {
        if (onIt && (input.gloveSpeed ?? 0) >= EXTRAS.rubSpeed) blocker.progress = Math.min(1, blocker.progress + dt / EXTRAS.rubSeconds);
        if (blocker.progress >= 1 || blocker.waited >= EXTRAS.bushGoes) this.open(blocker);
      }
    }
  }

  open(blocker) {
    blocker.open = true;
    blocker.openedAt = this.time;
    if (this.waitingAt === blocker) this.waitingAt = null;
    if (blocker.kind === 'gate') {
      this.hasKey = false;
      this.stats.gates += 1;
    } else if (blocker.kind === 'sheep') {
      this.stats.sheep += 1;
    } else {
      this.stats.bushes += 1;
    }
    this.events.onUnblock(blocker);
  }

  /** On their own: reaching the friend lost in this maze. */
  findFriends(at) {
    for (const lost of this.layout.lost) {
      if (lost.found) continue;
      if (Math.hypot(lost.x - at.x, lost.y - at.y) > REACHES.find) continue;
      this.found(lost);
    }
  }

  /** A lost friend is found, and follows along behind. */
  found(lost) {
    lost.found = true;
    lost.foundAt = this.time;
    this.stats.found += 1;
    this.followers.push({ who: lost.who, lost });
    this.events.onFound(lost);
    if (this.layout.lost.every((each) => each.found) && this.phase === 'walking') {
      this.phase = 'found';
      this.phaseTime = 0;
      this.power = null;
    }
  }

  /** The friends found follow along behind, in a line, wherever the character goes. */
  updateFollowers() {
    this.followers.forEach((follower, at) => {
      const spot = this.trail.behind((at + 1) * FOLLOW_SPACING);
      if (!spot) return;
      const moved = Math.hypot(spot.x - (follower.x ?? spot.x), spot.y - (follower.y ?? spot.y));
      follower.moving = moved > 0.001;
      follower.x = spot.x;
      follower.y = spot.y;
      if (Math.hypot(spot.dx, spot.dy) > 0.01) follower.dx = spot.dx;
      if (Math.hypot(spot.dx, spot.dy) > 0.01) follower.dy = spot.dy;
    });
  }

  /* ---------- butterflies and the bluebird ---------- */

  updateButterflies(dt, input) {
    const { maze } = this.layout;
    const playing = this.phase === 'walking';
    if (this.layout.features.butterflies && playing) {
      this.butterflyIn -= dt;
      if (this.butterflyIn <= 0 && this.butterflies.filter((each) => !each.leaving).length < EXTRAS.butterflies) {
        this.butterflyIn = this.plan.butterflyEvery;
        this.spawnButterfly();
      }
    }
    for (const fly of this.butterflies) {
      fly.age += dt;
      // A gentle wander, turning a little at a time, and back in over the maze if it drifts off it.
      fly.heading += (Math.sin(fly.age * 0.9 + fly.wobble) * 0.9 + (this.random() - 0.5) * 0.6) * dt;
      const homeX = maze.cols / 2 - fly.x;
      const homeY = maze.rows / 2 - fly.y;
      if (fly.x < 0.4 || fly.x > maze.cols - 0.4 || fly.y < 0.4 || fly.y > maze.rows - 0.4) fly.heading = Math.atan2(homeY, homeX);
      const speed = EXTRAS.butterflySpeed * (fly.leaving ? 2.2 : 1);
      fly.x += Math.cos(fly.heading) * speed * dt;
      fly.y += Math.sin(fly.heading) * speed * dt;
      if (!fly.caught && !fly.leaving && playing && input.glove && Math.hypot(fly.x - input.glove.x, fly.y - input.glove.y) < REACHES.catch) {
        fly.caught = true;
        this.prize('butterfly', fly);
      }
      if (!fly.leaving && (fly.age > EXTRAS.butterflyLife || !playing)) fly.leaving = fly.age;
    }
    this.butterflies = this.butterflies.filter((fly) => !fly.caught && !(fly.leaving && fly.age - fly.leaving > LEAVE_SECONDS));
  }

  spawnButterfly() {
    const { maze } = this.layout;
    const fromTop = this.random() < 0.5;
    const x = 0.6 + this.random() * (maze.cols - 1.2);
    const y = fromTop ? 0.5 : maze.rows - 0.5;
    this.butterflyNumber += 1;
    this.butterflies.push({ id: this.butterflyNumber, x, y, heading: fromTop ? Math.PI / 2 : -Math.PI / 2, wobble: this.random() * 6, age: 0, hue: Math.floor(this.random() * 4), leaving: 0, caught: false });
    this.events.onButterfly(this.butterflies.at(-1));
  }

  /** The bluebird flies along the way from here to the lost friend, and leaves a trail of footprints to follow. */
  startBird(at) {
    const { maze } = this.layout;
    const from = maze.cellAt(at.x, at.y);
    const to = this.layout.lost.find((each) => !each.found)?.cell ?? this.layout.goal;
    const cells = wayBetween(maze, from, to, (a, d) => maze.isOpen(a, d));
    this.bird = { cells, flown: 0, life: EXTRAS.birdTrail, from: { ...at } };
    this.events.onBird(this.bird);
  }

  updateBird(dt) {
    const { bird } = this;
    if (!bird) return;
    bird.flown += EXTRAS.birdSpeed * dt;
    bird.life -= dt;
    if (bird.life <= 0) this.bird = null;
  }

  /** Where the bluebird is along its way, in cells. */
  birdAt() {
    const { bird } = this;
    if (!bird || bird.cells.length < 1) return null;
    const { maze } = this.layout;
    const along = Math.min(bird.flown, bird.cells.length - 1);
    const at = Math.floor(along);
    const a = maze.centre(bird.cells[at]);
    const b = maze.centre(bird.cells[Math.min(bird.cells.length - 1, at + 1)]);
    const share = along - at;
    return { x: a.x + (b.x - a.x) * share, y: a.y + (b.y - a.y) * share, done: bird.flown >= bird.cells.length - 1 };
  }

  /* ---------- for the screen and the tests ---------- */

  /**
   * Where the character should go next, as a cell: the key while a gate is still locked, and otherwise the friend
   * still lost, or in a race the way out. For the tests and the films, which lead it there the way a child would.
   */
  nextCell() {
    const { maze } = this.layout;
    const from = maze.cellAt(this.position.x, this.position.y);
    const key = this.layout.items.find((item) => item.kind === 'key' && !item.gone);
    if (key && !this.hasKey) return key.cell;
    const reach = distances(maze, from, (a, d) => maze.isOpen(a, d));
    const left = this.layout.lost.filter((lost) => !lost.found).sort((a, b) => reach[a.cell] - reach[b.cell]);
    return left[0]?.cell ?? this.layout.goal;
  }

  /** A point this many cells ahead of the character along the way to a cell. */
  wayAhead(cell = this.nextCell(), ahead = 1.3) {
    const { maze } = this.layout;
    const at = this.position;
    const open = (a, d) => maze.isOpen(a, d);
    // From whichever end of the path it's on gets there sooner.
    const ends = [this.walker.a];
    if (this.walker.d >= 0) ends.push(maze.next(this.walker.a, this.walker.d));
    let cells = [];
    let best = Infinity;
    for (const end of ends) {
      const way = wayBetween(maze, end, cell, open);
      const centre = maze.centre(end);
      const length = way.length + Math.hypot(centre.x - at.x, centre.y - at.y);
      if (way.length && length < best) {
        best = length;
        cells = way;
      }
    }
    let point = { ...at };
    let left = ahead;
    for (const next of cells) {
      const centre = maze.centre(next);
      const gap = Math.hypot(centre.x - point.x, centre.y - point.y);
      if (gap >= left) return { x: point.x + ((centre.x - point.x) / gap) * left, y: point.y + ((centre.y - point.y) / gap) * left };
      left -= gap;
      point = centre;
    }
    return point;
  }

  /** How many steps the character is from the friend still to find, along the paths, or -1. */
  stepsToFriend() {
    const lost = this.layout.lost.find((each) => !each.found);
    if (!lost) return -1;
    return distances(this.layout.maze, this.walker.a, (a, d) => this.layout.maze.isOpen(a, d))[lost.cell];
  }

  /** Everything still to pick up in this maze. */
  get itemsLeft() {
    return this.layout.items.filter((item) => !item.gone && !item.opened);
  }
}
