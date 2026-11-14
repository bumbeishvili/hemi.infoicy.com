// The story and rules of Giraffe's Smoothie Stand. It's the day of the Harvest Fair, and everyone has
// come to Giraffe's stand with an order. Whatever they asked for is what's worth slicing. There's no
// screen in this file, so it runs in the unit tests.
import { clampLevel, ramp, rampWhole, stepsAt } from '../../core/levels.js';

export const FRUITS = ['apple', 'orange', 'banana', 'pear', 'plum', 'peach'];

// Who comes, in order, and what they want. rotten is from when someone has hidden bad fruit in the
// baskets. The words are spoken by each character: see audio/voice/lines.json.
export const DAY = [
  { who: 'truffle', order: { apple: 4 }, hello: 'Four apples, please!' },
  { who: 'mochi', order: { orange: 5 }, hello: 'Five oranges, please!' },
  { who: 'frost', order: { pear: 4, orange: 3 }, hello: 'Four pears and three oranges, please!' },
  { who: 'widget', order: { banana: 6 }, hello: 'Six bananas, please! Beep!' },
  { who: 'kit', order: { peach: 5 }, rotten: true, hello: 'Five peaches! Watch out for rotten fruit!' },
  {
    who: 'bramble',
    order: { apple: 4, banana: 4, plum: 4 },
    rotten: true,
    hello: 'Four apples, four bananas and four plums, please!',
    thanks: 'The Golden Cup goes to the giraffe’s stand!',
  },
];

const SHORT_DAY = ['truffle', 'kit', 'bramble'];
const MOST_WITHOUT_WANTED = 2; // Never more than this in a row that isn't on the order, at any level.

// Coins: what a golden fruit and a watermelon's wedge are worth, and the tip for a smoothie.
export const GOLDEN_COINS = 3;
// Power-ups, from the higher levels, and how many seconds each lasts. They only count down while the
// hand is open in the picture, so resting never wastes them.
export const POWER_SECONDS = { magnet: 8, honey: 6, glove: 8, turbo: 6 };
const POWER_AFTER_SECONDS = 3; // Into a customer's order, a power-up bubble floats up, or the bee comes.
const BONUS_AFTER = 3; // The golden fruit or watermelon comes instead of the third fruit not on the order.

/**
 * What each level brings that's new, with a picture and a name in each language. The level each
 * comes in is in NEW_AT, and fairAt switches it on there.
 */
export const NEW_THINGS = {
  tips: { mark: '🪙', name: 'Tip coins', nameKa: 'ჩაის ფული' },
  golden: { mark: '🌟', name: 'Golden fruit', nameKa: 'ოქროს ხილი' },
  across: { mark: '↔️', name: 'Thrown across', nameKa: 'გადმოსროლილი ხილი' },
  magnet: { mark: '🧲', name: 'Magnet', nameKa: 'მაგნიტი' },
  melon: { mark: '🍉', name: 'Watermelon', nameKa: 'საზამთრო' },
  pairs: { mark: '🪰', name: 'Rotten neighbours', nameKa: 'დამპალი მეზობლები' },
  bee: { mark: '🐝', name: 'Honeybee', nameKa: 'ფუტკარი' },
  tough: { mark: '🥥', name: 'Tough fruit', nameKa: 'მაგარი ხილი' },
  glove: { mark: '🧤', name: 'Big glove', nameKa: 'დიდი ხელთათმანი' },
  turbo: { mark: '🌀', name: 'Turbo blender', nameKa: 'ტურბო ბლენდერი' },
};

export const NEW_AT = {
  2: ['tips'],
  3: ['golden'],
  4: ['across'],
  5: ['magnet'],
  6: ['melon', 'pairs'],
  7: ['bee'],
  8: ['tough'],
  9: ['glove'],
  10: ['turbo'],
};

/** What's new at a level, as the title card and the countdown show it. Nothing at level 1. */
export function newAt(level) {
  return (NEW_AT[clampLevel(level)] ?? []).map((key) => ({ key, ...NEW_THINGS[key] }));
}

/**
 * How long a customer waits for their smoothie, in seconds of the hand in play being seen, unless a
 * grown-up has chosen customers who wait as long as it takes: a little while for the stand, and a
 * little more for each fruit on the order. At level 1 it's 14 seconds and 4 for each fruit, 30 for
 * four apples, and by level 10 it's half that. Slicing a rotten fruit puts a customer off a little.
 */
export const PATIENCE = { base: [14, 7], perFruit: [4, 2], rottenCost: 3 };

/** How many seconds this customer waits, at this level. */
export function patienceFor(customer, level) {
  const fruit = Object.values(customer?.order ?? {}).reduce((sum, count) => sum + count, 0);
  return ramp(level, ...PATIENCE.base) + ramp(level, ...PATIENCE.perFruit) * fruit;
}

/**
 * What each level of the fair brings, from 1 to 10. Level 1 is the fair as it always was. The orders
 * are what the customers say, so they stay the same, and so do the grown-ups' choices: how fast the
 * fruit flies, how to slice, and how many customers. A level only goes on top of those. gentle is the
 * fair as it was before customers stopped waiting, with the gentler climb from level to level.
 */
export function fairAt(level, { gentle = false } = {}) {
  return {
    // Fruit falls back quicker: gravity times this. At level 10 it's in the air 83% as long, or 88% gently.
    gravity: ramp(level, 1, gentle ? 1.3 : 1.45),
    // Throws come more often: the time between them, times this.
    every: ramp(level, 1, gentle ? 0.8 : 0.72),
    // More in a throw, from level 3: one more at most.
    volley: stepsAt(level, { 1: 0, 3: 1 }),
    // And more up at once.
    most: rampWhole(level, 0, 3),
    // How much of what comes up is on the order. Less at higher levels, but with more coming up, at least
    // as much that's wanted comes up every second, at any pace, so nobody waits longer for it.
    wantedShare: ramp(level, 0.6, 0.5),
    // Rotten fruit, for how many of the last customers: the last two at level 1, then earlier.
    rottenLast: stepsAt(level, { 1: 2, 3: 3, 5: 4, 8: 6 }),
    rottenShare: ramp(level, 0.14, 0.2),
    // From level 4, some fruit is thrown across, from one side to the other, rather than straight up.
    across: stepsAt(level, { 1: 0, 4: 0.2, 6: 0.3, 9: 0.4 }),
    // From level 6, a rotten one sometimes comes up right beside something on the order.
    pairs: stepsAt(level, { 1: 0, 6: 0.15, 9: 0.25 }),
    // From level 8, some fruit on the order is tough: the first swipe cracks it, and the second slices it.
    tough: stepsAt(level, { 1: 0, 8: 0.12, 10: 0.15 }),
    // From level 2, each customer leaves coins as a tip, which float up for an open hand to touch.
    tips: stepsAt(level, { 1: 0, 2: 2 }),
    // Once with each customer, from level 3, something that isn't on the order comes up as a golden
    // fruit instead, worth coins when sliced. From level 6 it takes turns with a watermelon, newest
    // first, which a slice splits into wedges, each worth a coin.
    bonus: stepsAt(level, { 1: [], 3: ['golden'], 6: ['melon', 'golden'] }),
    // From level 5, a power-up bubble floats up with a customer's order, taking turns, the newest
    // first: a magnet, which draws coins and what's on the order to the hand, from 9 a big glove, which
    // slices from further away, and at 10 a turbo blender, which counts each fruit on the order twice.
    powers: stepsAt(level, { 1: [], 5: ['magnet'], 9: ['glove', 'magnet'], 10: ['turbo', 'glove', 'magnet'] }),
    // From level 7, every other customer brings a bee with a pot of honey instead. Touching the bee
    // with an open hand gets the honey, and everything floats slowly for a while.
    bee: level >= 7,
  };
}

/**
 * With friends, everyone slices from the same fruit, at the host's level, but it's the plain fair: none of the tip
 * coins, golden fruit, watermelons, power-ups, bees, tough fruit or fruit thrown across that the levels bring, as
 * each of those would be one child's and not another's. How fast the fruit comes, and the rotten fruit, stay the
 * level's.
 */
export function plainFairAt(level) {
  // The gentle climb, whatever each child's grown-up chose, as it always was with friends.
  return { ...fairAt(level, { gentle: true }), across: 0, pairs: 0, tough: 0, tips: 0, bonus: [], powers: [], bee: false };
}

// With friends, each fruit is a point for whoever sliced it, one on the order two, and a rotten one nothing.
export const FRIENDS_POINTS = { wanted: 2, extra: 1, rotten: 0 };
export const pointsFor = (verdict) => FRIENDS_POINTS[verdict] ?? 0;

export class Stand {
  /**
   * short is a shorter day, with only three customers. plain is the plain fair, for friends: see plainFairAt.
   * gentle is the fair as it always was, where customers wait as long as it takes: otherwise each one waits
   * as long as patienceFor says, and a customer who walks off ends the fair.
   */
  constructor({ short = false, level = 1, plain = false, gentle = false, random = Math.random, onEvent = () => {} } = {}) {
    this.customers = short ? DAY.filter(({ who }) => SHORT_DAY.includes(who)) : DAY;
    this.level = plain ? plainFairAt(level) : fairAt(level, { gentle });
    this.levelNumber = level;
    // With friends it's the plain fair, where nobody walks off: see plainFairAt.
    this.waits = gentle || plain;
    this.patience = Infinity; // Seconds this customer will still wait.
    this.patienceFull = Infinity;
    this.walkedOff = null; // The customer who couldn't wait, which ends the fair.
    this.random = random;
    this.onEvent = onEvent;
    this.index = -1;
    this.left = {};
    this.sinceWanted = 0;
    this.coins = 0;
    this.active = { magnet: 0, honey: 0, glove: 0, turbo: 0 }; // Seconds left of each power-up.
    this.specialIn = Infinity; // Seconds until this customer's power-up or bee.
    this.stats = { smoothies: 0, wanted: 0, extra: 0, rotten: 0, coins: 0, golden: 0, melons: 0, wedges: 0, tips: 0, powers: 0, bees: 0 };
  }

  get customer() {
    return this.customers[this.index] ?? null;
  }

  get over() {
    return this.index >= this.customers.length;
  }

  /** Whether this customer's baskets have rotten fruit in them. */
  get rotten() {
    return this.index >= this.customers.length - this.level.rottenLast;
  }

  get wantedKinds() {
    return Object.keys(this.left).filter((kind) => this.left[kind] > 0);
  }

  /** What's left of this customer's order, as counts in the order's own order, for friends' games. */
  get leftList() {
    return Object.keys(this.customer?.order ?? {}).map((kind) => this.left[kind] ?? 0);
  }

  /** Whether this customer's order is all made. */
  get orderDone() {
    return Boolean(this.customer) && !this.wantedKinds.length;
  }

  /**
   * With friends, the stand as whoever runs it has it: this customer, and what's left of their order, as
   * leftList. Nothing is said or shown from here. Returns whether it's a new customer.
   */
  setTo(index, leftList = []) {
    const fresh = index !== this.index;
    if (fresh) {
      this.index = index;
      this.sinceWanted = 0;
      this.others = 0;
      this.bonusThrown = false;
      this.specialIn = Infinity;
    }
    const order = this.customer?.order ?? {};
    this.left = Object.fromEntries(Object.keys(order).map((kind, at) => [kind, Math.max(0, Math.min(order[kind], leftList[at] ?? order[kind]))]));
    this.stats.smoothies = Math.max(0, Math.min(this.index, this.customers.length)) + (this.orderDone ? 1 : 0);
    return fresh;
  }

  emit(type, details = {}) {
    this.onEvent({ type, ...details });
  }

  nextCustomer() {
    this.index += 1;
    this.sinceWanted = 0;
    if (this.over) {
      this.left = {};
      this.emit('day-over');
      return;
    }
    this.left = { ...this.customer.order };
    this.patienceFull = this.waits ? Infinity : patienceFor(this.customer, this.levelNumber);
    this.patience = this.patienceFull;
    this.specialIn = this.special ? POWER_AFTER_SECONDS : Infinity;
    this.others = 0;
    this.bonusThrown = false;
    this.emit('customer', { customer: this.customer, index: this.index, total: this.customers.length });
  }

  /**
   * What this customer brings besides the order, from the higher levels: a power-up's name, 'bee', or
   * null. With the bee, it's every other customer, and a power-up for the rest.
   */
  get special() {
    const { powers, bee } = this.level;
    if (bee && this.index % 2 === 1) return 'bee';
    if (!powers.length) return null;
    const turn = bee ? Math.floor(this.index / 2) : this.index;
    return powers[turn % powers.length];
  }

  /** This customer's golden fruit or watermelon, from the higher levels, or null. */
  get bonus() {
    const { bonus } = this.level;
    return bonus.length ? bonus[this.index % bonus.length] : null;
  }

  /** How much of this customer's patience is left, from 1 down to 0, or 1 for a customer who waits. */
  get patienceShare() {
    return Number.isFinite(this.patienceFull) ? Math.max(0, this.patience / this.patienceFull) : 1;
  }

  /**
   * Every frame while fruit is flying. seen says the hand is open in the picture: power-ups only
   * count down then, so resting never uses them up. present says the hand in play is in the picture,
   * open or not: the customer only waits less then, so a child who goes, or whose hand the camera
   * loses, is never let down for it.
   */
  tick(dt, { seen = true, present = seen } = {}) {
    if (present && this.customer && !this.orderDone && !this.walkedOff) this.losePatience(dt);
    if (seen) for (const key of Object.keys(this.active)) this.active[key] = Math.max(0, this.active[key] - dt);
    if (this.specialIn === Infinity || !this.customer) return;
    this.specialIn -= dt;
    if (this.specialIn > 0) return;
    this.specialIn = Infinity;
    const special = this.special;
    if (special === 'bee') this.emit('bee');
    else this.emit('power-out', { kind: special });
  }

  /** The customer waits this many seconds less, and walks off if that was all their patience. */
  losePatience(seconds) {
    if (this.waits || this.walkedOff || !this.customer) return;
    this.patience = Math.max(0, this.patience - seconds);
    if (this.patience > 0) return;
    this.walkedOff = this.customer;
    this.emit('walked-off', { customer: this.customer });
  }

  /** A power-up picked up: a bubble popped, or the bee's honey. */
  power(kind) {
    this.active[kind] = POWER_SECONDS[kind];
    this.stats.powers += 1;
    if (kind === 'honey') this.stats.bees += 1;
    this.emit('power', { kind });
  }

  isOn(kind) {
    return this.active[kind] > 0;
  }

  /** Coins picked up, or got for slicing something. */
  addCoins(count, why) {
    this.coins += count;
    this.stats.coins += count;
    if (why === 'tip') this.stats.tips += count;
    this.emit('coins', { count, why, coins: this.coins });
  }

  /** What to throw up next. There's always something on the order coming before long. */
  nextFruit() {
    const { customer, random } = this;
    const { wantedShare, rottenShare } = this.level;
    const wanted = this.wantedKinds;
    const roll = random();
    if (wanted.length && (roll < wantedShare || this.sinceWanted >= MOST_WITHOUT_WANTED)) {
      this.sinceWanted = 0;
      return wanted[Math.floor(random() * wanted.length)];
    }
    this.sinceWanted += 1;
    if (customer && this.rotten && roll < wantedShare + rottenShare) return 'rotten';
    const others = FRUITS.filter((kind) => !wanted.includes(kind));
    return others[Math.floor(random() * others.length)];
  }

  /**
   * The next throw: what's in it, and how, from the higher levels. across is thrown from one side to
   * the other, tough takes two swipes, and withRotten has a rotten one right beside it. At level 1
   * this is only ever nextFruit().
   */
  nextThrow() {
    let kind = this.nextFruit();
    const { random, level } = this;
    // Once with each customer, instead of something that isn't on the order, a golden fruit or a
    // watermelon.
    if (this.bonus && !this.bonusThrown && kind !== 'rotten' && !(this.left[kind] > 0)) {
      this.others += 1;
      if (this.others >= BONUS_AFTER) {
        kind = this.bonus;
        this.bonusThrown = true;
      }
    }
    const throwing = { kind, across: false, tough: false, withRotten: false };
    const wanted = this.left[kind] > 0;
    if (level.across) throwing.across = random() < level.across;
    if (level.tough && wanted) throwing.tough = random() < level.tough;
    if (level.pairs && wanted && this.rotten) throwing.withRotten = random() < level.pairs;
    return throwing;
  }

  /**
   * A fruit has been sliced. Returns 'wanted', 'extra' or 'rotten', or for the extras from the higher
   * levels, 'golden', 'melon' or 'wedge'. With the turbo blender, what's on the order counts twice.
   */
  slice(kind) {
    if (kind === 'golden') {
      this.stats.golden += 1;
      this.addCoins(GOLDEN_COINS, 'golden');
      return 'golden';
    }
    if (kind === 'melon') {
      this.stats.melons += 1;
      this.emit('melon');
      return 'melon';
    }
    if (kind === 'wedge') {
      this.stats.wedges += 1;
      this.addCoins(1, 'wedge');
      return 'wedge';
    }
    if (kind === 'rotten') {
      this.stats.rotten += 1;
      this.emit('rotten');
      if (this.customer && !this.orderDone) this.losePatience(PATIENCE.rottenCost);
      return 'rotten';
    }
    if (!(this.left[kind] > 0)) {
      this.stats.extra += 1;
      this.emit('extra', { kind });
      return 'extra';
    }
    const counts = this.isOn('turbo') ? Math.min(2, this.left[kind]) : 1;
    this.left[kind] -= counts;
    this.stats.wanted += counts;
    this.emit('wanted', { kind, left: this.left[kind], counts });
    if (!this.wantedKinds.length) {
      this.stats.smoothies += 1;
      this.emit('order-done', { customer: this.customer });
    }
    return 'wanted';
  }
}

/** The nearest a moving hand came to a point, between where it was and where it is. */
export function nearestOnPath(fromX, fromY, toX, toY, x, y) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(x - toX, y - toY);
  const along = Math.max(0, Math.min(1, ((x - fromX) * dx + (y - fromY) * dy) / lengthSquared));
  return Math.hypot(x - (fromX + dx * along), y - (fromY + dy * along));
}
