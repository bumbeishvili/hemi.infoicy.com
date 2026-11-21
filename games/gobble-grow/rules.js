// Gobble and Grow's rules: a little creature in a soup of things to eat. Things smaller than it drift by, and
// opening the mouth wide while one is in reach gobbles it: a gulp as it goes in, and a chomp as the mouth shuts,
// which is when it counts, and the creature grows a little. Things bigger than it can't be eaten yet, and they can
// catch it: one that swims right into the creature catches it, and caught LIVES times, it's gobbled up, which ends
// the world. From level 2 the bigger things come after it a little, more at each level. Later it's big enough for
// them. With the gentle choice, and with friends, and when the creature swims by itself, bigger things only nudge it
// gently aside, nothing is ever lost, and the things to eat keep coming for as long as it takes.
//
// There's no screen, camera or sound in this file, so all of it runs in test/unit/gobble-grow.test.js. Places are
// in heights of the field, which is as wide as a 16:9 screen, so that friends see the same things in the same
// places whatever their own screens are like. Each thing's path is worked out from the game's seed and which thing
// it is, so it's the same on every friend's computer without being sent.
import { seededRandom } from '../../core/friends.js';
import { clampLevel, LAST_LEVEL, ramp } from '../../core/levels.js';
import { GROWTH, WORLDS, worldAt } from './worlds.js';

export const FIELD = { wide: 16 / 9, tall: 1 };
/** How much there is to eat in each world, as a grown-up chooses. */
export const BITES = [8, 12, 16];
/** The creature's size to begin with, from its middle to its edge. It ends each world GROWTH times that. */
export const START_R = 0.055;
/** The three kinds of thing to eat in a world, each as so many of the creature's size to begin with. */
export const KIND_SIZE = [0.5, 1.25, 1.7];
// A thing can be eaten once the creature is this much bigger than it: smaller than you, to look at.
const EAT_MARGIN = 1.05;
/**
 * How far the head has to move to take the creature from the middle of the field to its edge, as a share of the
 * camera's picture across and down: a small movement of the head covers the whole screen.
 */
export const HEAD = {
  small: { x: 0.06, y: 0.045 },
  medium: { x: 0.1, y: 0.07 },
  big: { x: 0.16, y: 0.11 },
};
export const HEAD_NAMES = Object.keys(HEAD);
// How near a thing has to be to be gobbled: the creature's own size and a bit, out from its middle, and most of
// the thing's size on top. Generous, so that being roughly on it is enough.
const REACH = 1.45;
const REACH_OF_THING = 0.6;
export const GULP_SECONDS = 0.16; // How long a thing takes to go into the mouth.
// A mouth that stays open with something in it swallows it anyway after this long, so nothing ever gets stuck:
// but the next bite still needs the mouth to have shut first.
export const AUTO_CHOMP_SECONDS = 3;
// Where the creature can go: all of the field but its edges, and the band along the top where the tally is.
const ROAM = { left: 0.1, right: FIELD.wide - 0.1, top: 0.22, bottom: 0.88 };
const HOME = { x: FIELD.wide / 2, y: 0.56 };
const FOLLOW_RATE = 7; // How quickly the creature goes after the face, a second.
const AUTO_SPEED = 0.5; // And how fast it swims by itself, in field heights a second.
const KEEPS_CHASING = 0.15; // Swimming by itself, it stays with the thing it's after unless another is this much nearer.
// And it would sooner go a little further for one that will be about for longer: this much further for each second.
const WORTH_A_SECOND = 0.035;
const WORTH_AT_MOST = 6;
const PUSH_RATE = 8;
const PUSH_FADES = 2.5;
const MOST_PUSH = 0.2;
// Swimming by itself, the creature is only nudged a little, so that it stays in reach of the food it's waiting by:
// a child playing with the mouth alone can't steer back to it.
const MOST_PUSH_ALONE = 0.045;
const TOO_BIG_AGAIN_AFTER = 1.2;
// How many times a bigger thing can catch the creature in a world before it's gobbled up.
export const LIVES = 3;
// How much a bigger thing has to overlap the creature to catch it: their middles this close, in their sizes.
const CATCH_OVERLAP = 0.72;
// After being caught, and after the face has been missing, nothing can catch the creature for this long.
export const SAFE_SECONDS = 2.5;
const SAFE_AFTER_AWAY = 1.5;
// A bigger thing only comes after the creature from this far off, in field heights.
const HUNT_RANGE = 0.55;
// Caught, the creature is pushed this far from what caught it, in field heights.
const CAUGHT_PUSH = 0.18;
// The soup is already going when the game begins: this share of a crossing has gone by, so there's food about.
const LEAD = 0.55;
// Which kind each thing is, in turn, round and round: half or more are always the smallest, so there's always
// something to eat. Later worlds have more of the bigger kinds, which nudge the creature aside until it has grown.
const EASY = [0, 0, 1, 0, 0, 2, 0, 1];
const BUSY = [0, 1, 0, 2, 0, 1, 0, 2];

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const lerp = (from, to, share) => from + (to - from) * share;

/**
 * What a level is like: its world, how quickly things drift across, how often they come and how much they sway, and
 * how hard the bigger things come after the creature. gentle is the soup as it always was, with the gentler climb.
 */
export function soupLevel(level, { gentle = false } = {}) {
  const at = clampLevel(level);
  return {
    level: at,
    world: worldAt(at),
    // Seconds for a thing to drift across the field: at level 10, two thirds of level 1's, or three quarters gently.
    cross: ramp(at, 15, gentle ? 11.5 : 10),
    // Seconds between one thing arriving and the next: eight or nine in the soup at once, at any level.
    gap: ramp(at, 1.7, gentle ? 1.4 : 1.2),
    sway: ramp(at, 0.02, 0.045),
    pattern: at <= 4 ? EASY : BUSY,
    // How fast a bigger thing nearby comes after the creature, in field heights a second: not at all at level 1, and
    // at level 10 about half as fast as things drift. Never, gently.
    hunt: gentle ? 0 : ramp(at, 0, 0.07),
  };
}

const capital = (words) => words[0].toUpperCase() + words.slice(1);

/** What each level brings that's new: a new world, with a new creature to be and new things to eat. */
export function gobbleNewAt(level) {
  const at = clampLevel(level);
  if (at < 2) return [];
  const world = worldAt(at);
  return [{ mark: world.mark, name: capital(`${world.you} ${world.place}`), nameKa: `${world.youKa} ${world.placeKa}` }];
}

/** The creature's size once this share of the world's food is eaten: a little bigger with every bite. */
export const radiusAt = (share) => START_R * (1 + (GROWTH - 1) * clamp(share, 0, 1));

/** How many of the three kinds a creature that size can eat: the smallest always, and the others as it grows. */
export const kindsEdible = (radius) => KIND_SIZE.filter((size) => radius >= START_R * size * EAT_MARGIN).length;

/** Together, there's as much to eat as each would have on their own, all added up. */
export const teamGoal = (bites, players) => Math.min(999, bites * Math.max(1, players));

/**
 * Thing number k of a game: which kind it is, and its path across the field, from one edge to the other with a
 * gentle sway. It's the same for the same seed, so every friend's game has the same things in the same places.
 */
export function foodPlan(seed, k, plan) {
  const random = seededRandom(((seed >>> 0) ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0);
  const kind = plan.pattern[k % plan.pattern.length];
  const r = START_R * KIND_SIZE[kind];
  const out = r + 0.03;
  const way = random();
  let from;
  let to;
  if (way < 0.84) {
    // Most come in from one side and go out of the other, below the tally and above the prompt.
    const [startY, endY] = [lerp(0.26, 0.84, random()), lerp(0.26, 0.84, random())];
    [from, to] = [{ x: -out, y: startY }, { x: FIELD.wide + out, y: endY }];
    if (way >= 0.42) [from.x, to.x] = [to.x, from.x];
  } else {
    // A few float down from the top, or up from the bottom.
    const [startX, endX] = [lerp(0.3, FIELD.wide - 0.3, random()), lerp(0.3, FIELD.wide - 0.3, random())];
    [from, to] = [{ x: startX, y: -out }, { x: endX, y: FIELD.tall + out }];
    if (way >= 0.92) [from.y, to.y] = [to.y, from.y];
  }
  const far = Math.hypot(to.x - from.x, to.y - from.y);
  const life = far / ((FIELD.wide + 0.3) / plan.cross);
  const vel = { x: (to.x - from.x) / life, y: (to.y - from.y) / life };
  return {
    id: k,
    kind,
    r,
    born: k * plan.gap,
    life,
    from,
    vel,
    // It sways from side to side of its line as it goes.
    across: { x: -(to.y - from.y) / far, y: (to.x - from.x) / far },
    sway: plan.sway * (0.6 + 0.8 * random()),
    beat: 0.25 + 0.3 * random(),
    phase: random() * Math.PI * 2,
  };
}

/** Where a thing is on its path at a time, in seconds of the soup's clock. It sways least as it comes and goes. */
export function foodPlace(food, time) {
  const age = time - food.born;
  const settled = clamp(Math.min(age, food.life - age), 0, 1);
  const off = food.sway * settled * Math.sin(food.phase + age * food.beat * Math.PI * 2);
  return { x: food.from.x + food.vel.x * age + food.across.x * off, y: food.from.y + food.vel.y * age + food.across.y * off };
}

export class Soup {
  /**
   * level is the world, from 1 to 10, and bites how much there is to eat in it. seed lays the things out. auto has
   * the creature swim to the food by itself, for playing with the mouth alone, and head is how far the head has to
   * move otherwise. team is how many are playing together, eating from the same soup and growing as one, or 0.
   * shared is for two against each other on one screen, in one picture (core/one-picture.js): one soup, where what
   * one eats is gone for the other, as together, but each grows by their own bites, and their share of it wins.
   * centre is how far across from the middle the creature's own place is then, so the two start apart.
   * onEvent hears what happens, each as { type, ... }: spawn, gulp, chomp, grew, unlock, bump, toobig, taken, won.
   */
  constructor({ level = 1, bites = 12, seed = 1, auto = false, head = 'medium', team = 0, shared = false, centre = 0, gentle = false, onEvent = () => {} } = {}) {
    // Bigger things only catch a creature the child steers, on their own. Swimming by itself, it can't get away.
    this.danger = !gentle && !auto && team === 0;
    this.plan = soupLevel(level, { gentle: !this.danger });
    this.level = this.plan.level;
    this.seed = seed >>> 0;
    this.auto = auto;
    this.head = HEAD[head] ?? HEAD.medium;
    this.together = team > 0;
    this.shared = shared && !this.together;
    this.bites = bites;
    this.goal = this.together ? teamGoal(bites, team) : bites;
    this.onEvent = onEvent;
    this.lead = this.plan.cross * LEAD;
    this.time = this.lead;
    this.centre = { x: HOME.x + centre, y: HOME.y }; // Where the creature is with the head in the middle.
    this.creature = { x: this.centre.x, y: this.centre.y, r: START_R, facing: 1, holding: null, heldFor: 0 };
    this.home = { ...this.centre }; // Where the creature would be with nothing nudging it.
    this.push = { x: 0, y: 0 };
    this.foods = [];
    this.gone = new Set(); // The things that have been eaten, by anyone.
    this.next = 0;
    this.eaten = 0; // This child's own bites.
    this.total = 0; // The bites that count towards growing: their own, or everyone's together.
    this.phase = 'play';
    this.wasOpen = false;
    this.usedOpening = false;
    this.target = null; // The thing that would be gobbled now, if the mouth opened.
    this.waitedFor = 0; // How long something has been in reach of a mouth that's shut.
    this.chasing = null;
    this.lastTooBig = -Infinity;
    this.lives = this.danger ? LIVES : Infinity;
    this.safeFor = SAFE_SECONDS; // Nothing catches the creature in the first moments.
    this.eatenBy = null; // What gobbled the creature up, which ends the world.
    this.stats = { gulps: 0, autoChomps: 0, bumps: 0, tooBig: 0, byKind: [0, 0, 0], seconds: 0, caught: 0 };
    this.spawnDue();
  }

  emit(type, more = {}) {
    this.onEvent({ type, ...more });
  }

  get share() {
    return clamp(this.total / this.goal, 0, 1);
  }

  get won() {
    return this.phase === 'won';
  }

  /** Whether the creature was gobbled up by something bigger, which ends the world. */
  get gobbled() {
    return this.phase === 'eaten';
  }

  canEat(food) {
    return this.creature.r >= food.r * EAT_MARGIN;
  }

  /** Brings in every thing that's due by now, apart from any that have gone already. */
  spawnDue() {
    const { plan } = this;
    while (this.next * plan.gap <= this.time) {
      const food = foodPlan(this.seed, this.next, plan);
      this.next += 1;
      if (food.born + food.life <= this.time || this.gone.has(food.id)) continue;
      Object.assign(food, foodPlace(food, this.time), { state: 'drift', bumped: false });
      this.foods.push(food);
      this.emit('spawn', { food });
    }
  }

  /**
   * One frame. input is what the child is doing: open, whether the mouth counts as open, seen, whether there's a
   * face to steer by, and steer, how far it is from the middle, as { x, y } in shares of the camera's picture.
   * With friends, clock is how many seconds it is since "GO!", which everyone's soup goes by.
   */
  update(dt, input, clock = null) {
    this.time = clock === null ? this.time + dt : clock + this.lead;
    this.stats.seconds += dt;
    this.spawnDue();
    // A child who has gone, or whose face the tracker has lost, is never caught for it, nor just after coming back.
    if (!input.seen) this.safeFor = Math.max(this.safeFor, SAFE_AFTER_AWAY);
    else this.safeFor = Math.max(0, this.safeFor - dt);
    this.moveFoods(dt, input);
    this.moveCreature(dt, input);
    if (this.phase === 'play') this.eat(dt, input);
    else this.target = null;
    if (this.phase === 'play') this.watchOut();
    this.wasOpen = input.open;
  }

  /** Whether a bigger thing is coming after the creature, and can catch it. */
  get hunting() {
    return this.danger && this.phase === 'play';
  }

  moveFoods(dt = 0, input = { seen: true }) {
    const { creature, time } = this;
    // Not while the creature is safe: in the first moments, just after it was caught, or as the face comes back.
    const hunt = this.hunting && input.seen && this.safeFor <= 0 ? this.plan.hunt : 0;
    for (const food of this.foods) {
      if (food.state === 'drift') {
        Object.assign(food, foodPlace(food, time));
        // A bigger thing nearby comes after the creature a little, off its path, and stays off it after.
        if (hunt > 0 && !this.canEat(food) && !food.caughtYou) {
          const [dx, dy] = [creature.x - food.x, creature.y - food.y];
          const far = Math.hypot(dx, dy);
          if (far < HUNT_RANGE && far > 0.0001) {
            food.chase ??= { x: 0, y: 0 };
            food.chase.x += (dx / far) * hunt * dt;
            food.chase.y += (dy / far) * hunt * dt;
          }
        }
        if (food.chase) {
          food.x += food.chase.x;
          food.y += food.chase.y;
        }
        if (time >= food.born + food.life) food.state = 'left';
      } else if (food.state === 'gulped') {
        // Into the mouth, from where it was.
        const share = clamp((time - food.gulpAt) / GULP_SECONDS, 0, 1);
        food.x = lerp(food.gulpFrom.x, creature.x, share);
        food.y = lerp(food.gulpFrom.y, creature.y, share);
        food.inMouth = share;
      } else if (food.state === 'taken' && time - food.takenAt > GULP_SECONDS * 2) {
        food.state = 'left';
      }
    }
    this.foods = this.foods.filter((food) => food.state !== 'left');
  }

  /** Where the creature swims by itself: up to the nearest thing it can eat, to wait beside it. */
  autoTarget() {
    const { creature, time } = this;
    if (creature.holding) return null;
    let best = null;
    for (const food of this.foods) {
      if (food.state !== 'drift' || !this.canEat(food)) continue;
      // Not one that's about to drift off, or that's still on its way in.
      if (food.born + food.life - time < 1.5) continue;
      if (food.x < ROAM.left || food.x > ROAM.right || food.y < ROAM.top - 0.04 || food.y > ROAM.bottom + 0.04) continue;
      const far = Math.hypot(food.x - creature.x, food.y - creature.y);
      const stays = Math.min(WORTH_AT_MOST, food.born + food.life - time);
      const keen = far - stays * WORTH_A_SECOND - (food === this.chasing ? KEEPS_CHASING : 0);
      if (!best || keen < best.keen) best = { food, far, keen };
    }
    this.chasing = best?.food ?? null;
    if (!best) return this.centre;
    // Up beside it, rather than on top of it, so that it can be seen going in.
    const { food, far } = best;
    const keep = creature.r * 0.9 + food.r * 0.3;
    const away = far > 0.0001 ? { x: (creature.x - food.x) / far, y: (creature.y - food.y) / far } : { x: -1, y: 0 };
    return { x: food.x + away.x * keep, y: food.y + away.y * keep };
  }

  moveCreature(dt, input) {
    const { creature, home, push } = this;
    const before = creature.x;
    if (this.auto) {
      const wanted = this.autoTarget();
      if (wanted) {
        const [dx, dy] = [wanted.x - home.x, wanted.y - home.y];
        const far = Math.hypot(dx, dy);
        // Easing off as it arrives, so it doesn't jiggle about beside its food.
        const step = Math.min(far, Math.min(AUTO_SPEED, far * 5) * dt);
        if (far > 0.0001) {
          home.x += (dx / far) * step;
          home.y += (dy / far) * step;
        }
      }
    } else if (input.seen && input.steer) {
      // Where the face is, from the middle of the picture, is where the creature goes, from the middle of the field.
      const wanted = {
        x: this.centre.x + (input.steer.x / this.head.x) * (FIELD.wide / 2),
        y: this.centre.y + (input.steer.y / this.head.y) * (FIELD.tall / 2),
      };
      const blend = 1 - Math.exp(-dt * FOLLOW_RATE);
      home.x += (wanted.x - home.x) * blend;
      home.y += (wanted.y - home.y) * blend;
    }
    home.x = clamp(home.x, ROAM.left, ROAM.right);
    home.y = clamp(home.y, ROAM.top, ROAM.bottom);

    // A thing that's too big to eat nudges the creature gently out of its way, and it drifts back after. Where bigger
    // things can catch it, they don't: it's for the child to keep out of their way.
    let pushed = false;
    for (const food of this.foods) {
      if (food.state !== 'drift' || this.canEat(food) || this.hunting) continue;
      const [dx, dy] = [creature.x - food.x, creature.y - food.y];
      const far = Math.hypot(dx, dy) || 0.0001;
      const overlap = creature.r + food.r * 0.85 - far;
      if (overlap <= 0) continue;
      pushed = true;
      const blend = 1 - Math.exp(-dt * PUSH_RATE);
      push.x += (dx / far) * overlap * blend * 2;
      push.y += (dy / far) * overlap * blend * 2;
      // It's heard and seen once for each thing, however long the creature sits against it.
      if (!food.bumped) {
        food.bumped = true;
        this.stats.bumps += 1;
        this.emit('bump', { food });
      }
    }
    if (!pushed) {
      const fade = Math.exp(-dt * PUSH_FADES);
      push.x *= fade;
      push.y *= fade;
    }
    const size = Math.hypot(push.x, push.y);
    const most = this.auto ? MOST_PUSH_ALONE : MOST_PUSH;
    if (size > most) {
      push.x *= most / size;
      push.y *= most / size;
    }
    creature.x = clamp(home.x + push.x, ROAM.left - 0.04, ROAM.right + 0.04);
    creature.y = clamp(home.y + push.y, ROAM.top - 0.04, ROAM.bottom + 0.04);

    // It looks at what it's about to eat, and otherwise the way it's going.
    const looking = this.target ?? this.chasing;
    if (looking && Math.abs(looking.x - creature.x) > creature.r * 0.3) creature.facing = Math.sign(looking.x - creature.x);
    else if (!looking && Math.abs(creature.x - before) > 0.0015) creature.facing = Math.sign(creature.x - before);
  }

  /**
   * A bigger thing right on the creature catches it: it's pushed away, and nothing catches it again for a moment.
   * Caught for the last time, it's gobbled up, and that's the end of the world.
   */
  watchOut() {
    if (!this.hunting || this.safeFor > 0) return;
    const { creature } = this;
    for (const food of this.foods) {
      if (food.state !== 'drift' || this.canEat(food) || food.caughtYou) continue;
      const [dx, dy] = [creature.x - food.x, creature.y - food.y];
      const far = Math.hypot(dx, dy);
      if (far > (creature.r + food.r) * CATCH_OVERLAP) continue;
      food.caughtYou = true;
      this.lives -= 1;
      this.stats.caught += 1;
      this.safeFor = SAFE_SECONDS;
      if (this.lives <= 0) {
        this.phase = 'eaten';
        this.eatenBy = food;
        this.eatenAt = this.time;
        // Whatever was in the creature's mouth goes with it.
        if (creature.holding) {
          this.foods = this.foods.filter((each) => each !== creature.holding);
          creature.holding = null;
        }
        this.emit('eaten', { food });
        return;
      }
      const away = far > 0.0001 ? { x: dx / far, y: dy / far } : { x: 0, y: -1 };
      this.push.x += away.x * CAUGHT_PUSH;
      this.push.y += away.y * CAUGHT_PUSH;
      this.emit('caught', { food, lives: this.lives });
      return;
    }
  }

  /** The nearest thing in reach that can be eaten, and the nearest that's too big, each with how far it is. */
  inReach() {
    const { creature } = this;
    let food = null;
    let tooBig = null;
    for (const each of this.foods) {
      if (each.state !== 'drift') continue;
      const far = Math.hypot(each.x - creature.x, each.y - creature.y);
      if (far > creature.r * REACH + each.r * REACH_OF_THING) continue;
      if (this.canEat(each)) {
        if (!food || far < food.far) food = { food: each, far };
      } else if (!tooBig || far < tooBig.far) {
        tooBig = { food: each, far };
      }
    }
    return { food, tooBig };
  }

  eat(dt, input) {
    const { creature } = this;
    const { food, tooBig } = this.inReach();
    this.target = !creature.holding && food ? food.food : null;
    this.waitedFor = this.target && !input.open ? this.waitedFor + dt : 0;
    // Each opening of the mouth is one bite: it has to shut before it can gobble again.
    if (!input.open) this.usedOpening = false;

    if (creature.holding) {
      creature.heldFor += dt;
      if (creature.heldFor >= GULP_SECONDS && (!input.open || creature.heldFor >= AUTO_CHOMP_SECONDS)) this.chomp(input.open);
    } else if (input.open && !this.usedOpening && food) {
      this.gulp(food.food);
    } else if (input.open && !this.wasOpen && tooBig && this.time - this.lastTooBig > TOO_BIG_AGAIN_AFTER) {
      this.lastTooBig = this.time;
      this.stats.tooBig += 1;
      this.emit('toobig', { food: tooBig.food });
    }
  }

  /** The mouth is open, and the thing goes in. */
  gulp(food) {
    const { creature } = this;
    Object.assign(food, { state: 'gulped', gulpAt: this.time, gulpFrom: { x: food.x, y: food.y }, inMouth: 0 });
    creature.holding = food;
    creature.heldFor = 0;
    this.usedOpening = true;
    this.target = null;
    this.stats.gulps += 1;
    this.emit('gulp', { food });
  }

  /** The mouth shuts on it: that's a bite. still says the mouth was still open, and it was swallowed anyway. */
  chomp(still = false) {
    const { creature } = this;
    const food = creature.holding;
    creature.holding = null;
    this.foods = this.foods.filter((each) => each !== food);
    this.gone.add(food.id);
    if (still) this.stats.autoChomps += 1;
    this.stats.byKind[food.kind] += 1;
    // Together, and in one soup two share, a bite counts once the server says whose it was: see claimed.
    if (!this.together && !this.shared) {
      this.eaten += 1;
      this.count();
    }
    this.emit('chomp', { food, still, eaten: this.eaten, total: this.total });
  }

  /** One more bite towards growing: the creature is a little bigger, and may be big enough for a new kind of thing. */
  count() {
    const before = kindsEdible(this.creature.r);
    this.total += 1;
    this.creature.r = radiusAt(this.share);
    const after = kindsEdible(this.creature.r);
    this.emit('grew', { total: this.total, share: this.share });
    for (let kind = before; kind < after; kind += 1) this.emit('unlock', { kind });
    if (this.total >= this.goal && this.phase === 'play') {
      this.phase = 'won';
      this.emit('won');
    }
  }

  /**
   * Playing together: the server says thing k went to someone, as theirs was the first mouth to it. mine says it
   * was this child's. Either way it's one more bite for everyone's creature. A thing that went to a friend is
   * gone from here too, even out of this child's own mouth, if both went for it at once. at is where the friend's
   * creature is, for it to be seen going there. In one soup two share against each other, only this child's own
   * bites count, for their own creature.
   */
  claimed(id, mine, at = null) {
    if (!(this.together || this.shared) || this.counted?.has(id)) return;
    (this.counted ??= new Set()).add(id);
    this.gone.add(id);
    if (mine) {
      this.eaten += 1;
    } else {
      const { creature } = this;
      if (creature.holding?.id === id) creature.holding = null;
      const food = this.foods.find((each) => each.id === id);
      if (food) Object.assign(food, { state: 'taken', takenAt: this.time, takenTo: at });
      this.emit('taken', { food: food ?? null, id });
    }
    if (mine || this.together) this.count();
  }

  /**
   * Playing together, a friend has gone, and there are this many left: what there is to eat is what that many
   * would have, though never less than has been eaten already.
   */
  teamOf(players) {
    if (!this.together || this.phase !== 'play') return;
    this.goal = Math.max(this.total + 1, Math.min(this.goal, teamGoal(this.bites, players)));
    this.creature.r = radiusAt(this.share);
  }

  /** Where a child who's playing well would want the creature: on the nearest thing it can eat, or null. */
  wants() {
    const { creature } = this;
    if (creature.holding) return null;
    let best = null;
    for (const food of this.foods) {
      if (food.state !== 'drift' || !this.canEat(food)) continue;
      if (food.x < ROAM.left || food.x > ROAM.right || food.y < ROAM.top || food.y > ROAM.bottom) continue;
      if (food.born + food.life - this.time < 1) continue;
      const far = Math.hypot(food.x - creature.x, food.y - creature.y);
      if (!best || far < best.far) best = { x: food.x, y: food.y, far, id: food.id };
    }
    return best;
  }
}

/* ---------- how much the child grew, for the picture between one world and the next ---------- */

/** How many times bigger the creature of the next world is than this world's is at its end, or null after the last. */
export function grewBy(level) {
  const at = clampLevel(level);
  if (at >= LAST_LEVEL) return null;
  return WORLDS[at].size / (WORLDS[at - 1].size * GROWTH);
}

const roundTo = (value, figures) => Number(value.toPrecision(figures));

/** That, in words a grown-up can read out: "230 times bigger". */
export function timesWords(ratio, language = 'en') {
  const steps = [
    [1e9, 'billion', 'მილიარდ'],
    [1e6, 'million', 'მილიონ'],
    [1e3, 'thousand', 'ათას'],
  ];
  for (const [size, word, wordKa] of steps) {
    if (ratio < size) continue;
    const count = roundTo(ratio / size, 2);
    return language === 'ka' ? `${count} ${wordKa}ჯერ უფრო დიდი!` : `${count} ${word} times bigger!`;
  }
  const count = ratio < 10 ? Math.round(ratio) : roundTo(ratio, 2);
  return language === 'ka' ? `${count}-ჯერ უფრო დიდი!` : `${count} times bigger!`;
}

// A picture can't show something hundreds of times smaller than what's beside it, so past a few times bigger the
// difference is drawn as less than it really is, though still more for more: the words give the real number.
const DRAWN_MOST = 36;
const drawnRatio = (ratio) => (ratio <= 5 ? ratio : Math.min(DRAWN_MOST, 5 * (ratio / 5) ** 0.4));

/**
 * The picture of how much the child grew in a level: the creature they were, at the end of it, an everyday thing
 * that's bigger than that and smaller than what they are now, and the creature they've become, with how big each
 * is drawn, as a share of the new one. After the last level there's nothing new to be: only the whole sky.
 */
export function ladderFor(level) {
  const at = clampLevel(level);
  const old = WORLDS[at - 1];
  if (at >= LAST_LEVEL) return { level: at, old, thing: null, next: null, ratio: null, sizes: { old: 1, thing: 0, next: 0 } };
  const next = WORLDS[at];
  const ratio = grewBy(at);
  const drawn = drawnRatio(ratio);
  // Where the thing comes between the two, as it really does, counting in times bigger.
  const between = clamp(Math.log(old.thing.size / (old.size * GROWTH)) / Math.log(ratio), 0.12, 0.88);
  return { level: at, old, thing: old.thing, next, ratio, sizes: { old: 1 / drawn, thing: drawn ** between / drawn, next: 1 } };
}
