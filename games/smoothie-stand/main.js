// Giraffe's Smoothie Stand: on the day of the Harvest Fair, everyone comes with an order, and the child
// slices what it needs with an open hand. The story and rules are in orders.js, and the fair is in
// field.js. It's right-handed unless a grown-up chooses the left. Up to four children can play at the
// same stand, each on their own computer, slicing from the same fruit: see together.js.
import { renderPortraits } from '../../core/body/portraits.js';
import { byId as characterWithId, ROSTER } from '../../core/body/roster.js';
import { Track } from '../../core/friends.js';
import { FriendsPanel } from '../../core/friends-ui.js';
import { Glove } from '../../core/glove.js';
import { GameSession } from '../../core/session.js';
import { Sound } from '../../core/sound.js';
import { STORY_BOX, StoryBox } from '../../core/story.js';
import { Stand, newAt, pointsFor } from './orders.js';
import { SmoothieField } from './field.js';
import { fruitId, kindOfId, QUIET_MS, runnerOf, StandFollower, wireFruit } from './together.js';

const HOW = 'Swipe through the fruit!';
const STICKY = 'Yuck! Keep your hand open to shake it off!';
const OPEN_TO_SLICE = { left: 'Open your left hand to slice!', right: 'Open your right hand to slice!' };
const WON = 'You won the Golden Cup!';
// When a customer couldn't wait. It's on the card. The voice says what it says after any game that was lost.
const WALKED_OFF = (name) => `${name} couldn’t wait, and went home!`;
const LOST_LINE = 'So close! Try again!'; // One of the lines every game has: see SO_CLOSE in core/sound.js.
const AFTER_WALKED_OFF_SECONDS = 1.4; // A moment to see the customer go, before the card.

const NEXT_CUSTOMER_SECONDS = 1; // The fruit keeps flying, so nobody's waiting for this.
const LAST_THANKS_SECONDS = 2.8;
const HOW_AFTER_SECONDS = 5; // Time without slicing anything, before being told how.
const BUMP_PROMPT_SECONDS = 2.5;
const FILM_SECONDS = 14;

// Playing with friends, each on their own computer. See core/friends-ui.js for what each of these is.
const STAND_WORDS = {
  toggle: 'Play with friends',
  make: 'Make a game',
  codeLabel: 'A friend’s game code',
  codeName: 'Game code',
  how: 'Tell your friends the code. Then you all press <b>Open the stand</b>',
  leave: 'Leave this game',
  privacy: 'Only your name, who you play as, where your glove is, what it slices and your points go to your friends, with the fruit and the orders from the game that runs the stand. The camera picture stays on this computer.',
  alone: 'Play on your own',
  full: 'That game already has 4 players.',
  lost: 'Can’t reach the game. Check the internet, then try again.',
  left: 'You’ve left the game.',
  badCode: 'A game code is 3 letters and numbers.',
  busy: 'Playing',
  still: 'still playing',
};
const PACE_NAMES = ['slow', 'medium', 'fast'];
// A friend's glove between what their game sends: where it is, and its points, which go smoothly from one to
// the next. Whether it can be seen and is open change half way.
const HAND_TRACK = { lerp: ['x', 'y'], lists: ['p'], steps: ['v', 'o'] };
const GLOVE_FADE_RATE = 8; // How quickly a friend's glove fades in and out, as their hand comes and goes.
const MOST_FRUIT_SENT = 16; // There are never more than 12 up at once, and a few on their way.
const round2 = (value) => Math.round(value * 100) / 100;

const byId = (id) => document.getElementById(id);

class SmoothieGame {
  chimeOnOpen = false; // Hands open and close all the time here, so a chime would be noise.

  constructor(session) {
    this.session = session;
    this.story = new StoryBox(session);
    this.stand = null;
    this.timer = 0;
    this.after = null;
    this.bump = null;
    this.idleFor = 0;
    this.saidSticky = false;
    this.inRound = false; // From "GO!" to the finish, even while the hands are checked again.
    this.ended = false; // The finish card is up.
    this.standOpen = false; // Fruit is coming, until the last customer has their smoothie.
    this.wantedHere = 0;
    this.zeroAt = performance.now();
    this.goAt = performance.now();
    // Playing with friends: see prepareFriends().
    this.friendly = null;
    this.follower = new StandFollower();
    this.runnerId = null;
    this.friendsGloves = [];
    this.scores = new Map();
    this.resetFriends();
    this.field = new SmoothieField(byId('game'), {
      onSlice: (kind, side, fruit) => this.onSlice(kind, side, fruit),
      onBump: (side) => {
        this.bump = { side, at: session.playSeconds };
      },
      onShaken: () => session.sound.handsOpen(),
      // The first swipe on a tough fruit, from the higher levels: a crack, and one more to go.
      onCrack: () => {
        this.idleFor = 0;
        session.sound.play('chop', { gain: 0.5, rate: 1.25 });
      },
      // From the higher levels: see fairAt in orders.js.
      onCoin: (kind) => {
        this.idleFor = 0;
        session.sound.star();
        if (kind === 'wedge') this.stand.slice('wedge');
        else this.stand.addCoins(1, 'tip');
      },
      onPower: (kind) => {
        this.idleFor = 0;
        session.sound.handsOpen();
        this.stand.power(kind);
      },
      onBee: () => {
        this.idleFor = 0;
        session.sound.handsOpen();
        this.stand.power('honey');
      },
    });
    this.field.giraffe = Object.assign(new Image(), { src: session.portraits.giraffe });
    this.applySettings();
    // Playing with friends, if a grown-up makes or joins a game.
    this.friends = new FriendsPanel({
      game: 'smoothie-stand',
      linkKey: 'stand',
      words: STAND_WORDS,
      hello: () => {
        const { fighter, customers, pace } = session.settings;
        return { driver: fighter ?? '', level: session.levels.current, length: customers, mode: pace };
      },
      screen: () => session.screen,
      portraits: () => session.portraits,
      onMove: (id, message) => this.fromFriend(id, message),
      onGone: (friend) => this.friendGone(friend),
      // Whoever has the most points, and equal ones share a place.
      rank: (a, b) => b.dropped - a.dropped,
      resultText: ({ dropped }) => `${dropped} ${dropped === 1 ? 'point' : 'points'}`,
      startAfter: byId('start'),
      waitingBefore: byId('screen-finish'),
      resultsAfter: document.querySelector('#screen-finish .finish-hero'),
      finishTitle: document.querySelector('#screen-finish h2'),
    });
    const game = this;
    this.debug = {
      field: this.field,
      get stand() {
        return game.stand;
      },
      get game() {
        return game;
      },
    };
  }

  applySettings() {
    const { pace, slicing, hands, language } = this.session.settings;
    // With friends, the fruit comes as fast as the host chose, and each child keeps their own way of slicing.
    this.field.configure({ pace: this.friendly ? this.hostPace : pace, slicing, side: hands });
    // The names of new things are in the language the voice speaks, even if it changes mid-round.
    this.field.language = language;
  }

  /** The host's choice of how fast the fruit flies, which is what everyone plays with. */
  get hostPace() {
    return PACE_NAMES.includes(this.friendly?.mode) ? this.friendly.mode : 'slow';
  }

  setHands(side) {
    this.field.configure({ side });
  }

  settingChanged(change) {
    this.applySettings();
    // What a friend's game would be, if this one hosts it.
    if (('pace' in change || 'customers' in change) && this.friends.room.inRoom) this.friends.room.tell(this.friends.hello());
  }

  /** What's new at a level, for the title card and the countdown: see NEW_AT in orders.js. */
  newAt(level) {
    return newAt(level);
  }

  /** With friends, the start waits until they're ready too. The time since "GO!" counts from hearing it. */
  holdStart(go) {
    return this.friends.holdStart(() => {
      this.zeroAt = performance.now();
      go();
    });
  }

  /**
   * A new fair, at this level: see fairAt in orders.js for what each level brings. With friends, it's the host's
   * fair, at the host's level, with the host's customers and pace, and that doesn't move anyone's own level on.
   */
  prepare(level) {
    const friendly = this.friends.current;
    this.friendly = friendly;
    document.body.toggleAttribute('data-friends-race', Boolean(friendly));
    const playing = friendly ? friendly.level : level;
    this.applySettings();
    this.field.reset();
    this.field.fresh = new Set(friendly ? [] : newAt(level).map(({ key }) => key));
    this.story.hide();
    byId('order').replaceChildren();
    this.bump = null;
    this.after = null;
    this.idleFor = 0;
    this.saidSticky = false;
    this.wantedHere = 0;
    this.inRound = false;
    this.ended = false;
    this.standOpen = false;
    this.stand = new Stand({
      short: (friendly ? friendly.length : this.session.settings.customers) === 3,
      level: playing,
      plain: Boolean(friendly),
      // Customers who wait as long as it takes, as the stand always had them, if a grown-up chose it.
      gentle: this.session.settings.patience === 'gentle',
      onEvent: (event) => this.onStandEvent(event),
    });
    this.field.level = this.stand.level;
    this.walkedOff = null;
    this.showPatience();
    this.field.nextFruit = () => this.stand.nextFruit();
    this.field.nextThrow = () => this.stand.nextThrow();
    this.field.powerOn = (kind) => this.stand.isOn(kind);
    this.field.powerLeft = (kind) => this.stand.active[kind];
    this.field.isWanted = (kind) => this.stand.left[kind] > 0;
    // Coins only come from level 2, so level 1 looks as it always did.
    const coins = this.stand.level.tips > 0;
    byId('chip-coins-box').hidden = !coins;
    byId('sum-left-coins').closest('tr').hidden = !coins;
    this.prepareFriends(friendly);
    this.showProgress();
  }


  /**
   * Where collected things fly to: the count at the top. It's looked up as they fly, as the count is still
   * hidden when play begins and can move if the screen changes, keeping the last place it was seen.
   */
  keepTallyMeasured(chip, target) {
    let seen = target.tallyAt ?? { x: 80, y: 40 };
    const look = () => {
      const box = chip.getBoundingClientRect();
      if (box.width > 0) seen = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      return seen;
    };
    target.tallyAt = {
      get x() {
        return look().x;
      },
      get y() {
        return look().y;
      },
    };
  }

  /** Straight into it: the first order comes along with the first fruit. With friends, the same one for everyone. */
  begin() {
    this.goAt = performance.now();
    this.keepTallyMeasured(byId('chip-coins'), this.field);
    this.inRound = true;
    this.standOpen = true;
    this.field.throwing = !this.friendly || this.isRunner;
    this.field.throwIn = 0;
    this.stand.nextCustomer();
  }

  /** Does something after a while, in game time, so that the panel pauses it. */
  later(seconds, what) {
    this.timer = seconds;
    this.after = what;
  }

  /* ---------- what happens ---------- */

  onStandEvent(event) {
    const handlers = {
      customer: () => this.onCustomer(event),
      wanted: () => this.showOrder(),
      'order-done': () => this.onOrderDone(event),
      'day-over': () => this.session.finish(),
      coins: () => this.showProgress(),
      'power-out': () => this.field.throwBubble(event.kind),
      'walked-off': () => this.onWalkedOff(event),
      bee: () => this.field.startBee(),
    };
    handlers[event.type]?.();
  }

  onCustomer({ customer }) {
    this.field.blenderLevel = 0;
    this.story.say(customer.who, customer.hello);
    this.showOrder();
    this.showProgress();
  }

  /**
   * A customer couldn't wait any longer, which ends the fair: the fruit stops, the ticket greys, and the card
   * says who went home. The level stays where it is, to try again.
   */
  onWalkedOff({ customer }) {
    this.walkedOff = customer;
    this.field.throwing = false;
    this.standOpen = false;
    byId('order').classList.add('is-gone');
    this.showPatience();
    this.later(AFTER_WALKED_OFF_SECONDS, () => this.session.finish());
  }

  /** The bar, kept hold of, as it goes in and out of the ticket with each customer. */
  get patienceBar() {
    this.bar ??= byId('patience');
    return this.bar;
  }

  /** How long this customer will still wait, as a bar under their ticket. Customers who wait have none. */
  showPatience() {
    const bar = this.patienceBar;
    const stand = this.stand;
    const shown = Boolean(stand?.customer) && !stand.waits;
    bar.hidden = !shown;
    if (!shown) return;
    const share = stand.orderDone ? 1 : stand.patienceShare;
    bar.firstElementChild.style.width = `${(share * 100).toFixed(1)}%`;
    bar.dataset.low = share < 0.3 ? 'yes' : 'no';
    if (bar.parentElement !== byId('order')) byId('order').append(bar);
  }

  /** The ticket: a picture of each fruit that's wanted, and how many more. */
  showOrder() {
    const { stand, field } = this;
    const ticket = byId('order');
    if (!stand.customer) return;
    const { order } = stand.customer;
    const made = (kind) => order[kind] - stand.left[kind];
    const items = Object.keys(order).map((kind) => {
      const item = document.createElement('span');
      item.className = 'order-item';
      item.dataset.fruit = kind;
      item.classList.toggle('is-done', stand.left[kind] === 0);
      const picture = document.createElement('img');
      picture.alt = '';
      picture.src = field.pictureOf(kind);
      const count = document.createElement('span');
      count.className = 'order-count';
      count.textContent = `${made(kind)} / ${order[kind]}`;
      item.append(picture, count);
      return item;
    });
    ticket.replaceChildren(...items, this.patienceBar);
    ticket.classList.toggle('is-gone', Boolean(this.walkedOff));
    const box = ticket.getBoundingClientRect();
    field.tokenTarget = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    const wanted = Object.values(order).reduce((sum, count) => sum + count, 0);
    const left = Object.values(stand.left).reduce((sum, count) => sum + count, 0);
    field.blenderLevel = (wanted - left) / wanted;
  }

  onSlice(kind, side, fruit) {
    const { sound } = this.session;
    sound.play('chop', { gain: 0.8, rate: 0.92 + Math.random() * 0.18 });
    this.idleFor = 0;
    // With friends, the stand counts it once the server says whose it is: see claimed().
    const verdict = this.friendly ? this.sliceShared(kind, side, fruit) : this.stand.slice(kind);
    if (verdict === 'wanted') this.wantedHere += 1;
    if (verdict === 'wanted' || verdict === 'golden') sound.star();
    if (verdict === 'rotten' && !this.saidSticky) {
      this.saidSticky = true;
      sound.say(STICKY);
    }
    this.showProgress();
    return verdict;
  }

  onOrderDone({ customer }) {
    const { stand, field } = this;
    const last = this.orderMade(customer);
    // From level 2, a tip: coins floating up, near the hand.
    if (stand.level.tips) field.tossTips(stand.level.tips);
    this.later(last ? LAST_THANKS_SECONDS : NEXT_CUSTOMER_SECONDS, () => stand.nextCustomer());
  }

  /** An order made, on every friend's screen too: the blender whirs, and the last customer says thanks. Returns whether it was the last. */
  orderMade(customer) {
    const { stand, field, session } = this;
    field.blenderSpin = 1.6;
    session.sound.play('mixer', { gain: 0.5 });
    this.showProgress();
    const last = stand.index >= stand.customers.length - 1;
    if (last) {
      field.throwing = false;
      this.standOpen = false;
      this.story.say(customer.who, customer.thanks);
    }
    return last;
  }

  showProgress() {
    const { stats, customers } = this.stand;
    byId('chip-smoothies').textContent = `${stats.smoothies} of ${customers.length}`;
    byId('chip-coins').textContent = `🪙 ${this.stand.coins}`;
    byId('race-progress-fill').style.width = `${Math.round((stats.smoothies / customers.length) * 100)}%`;
  }

  /* ---------- every frame ---------- */

  update(dt, snapshot) {
    if (this.friendly && !this.followFriends(dt)) return;
    if (!this.runLater(dt)) return;
    this.idleFor += dt;
    // Power-ups only count down while the hand is open in the picture, so resting never uses them up.
    const glove = this.field.gloves[this.field.side];
    // A customer's patience only runs down while the hand in play is in the picture, open or not.
    if (this.field.throwing) this.stand.tick(dt, { seen: glove.visible && glove.status === 'open', present: glove.visible });
    if (!this.friendly) this.showPatience();
    this.field.update(dt, snapshot, { aspect: this.session.camera.aspect, slicing: true, showHands: true });
    // Until the child has sliced something on the order.
    const filming = this.session.playSeconds < FILM_SECONDS && (this.friendly ? this.wantedHere : this.stand.stats.wanted) === 0;
    if (filming !== this.filming) {
      this.filming = filming;
      document.body.dataset.film = filming ? 'on' : 'off';
    }
    if (this.friendly) this.sendFriends();
  }

  /** What was to happen after a while, if it's time. Returns false if that was the end of the game. */
  runLater(dt) {
    if (!this.after) return true;
    this.timer -= dt;
    if (this.timer > 0) return true;
    const what = this.after;
    this.after = null;
    what();
    return this.inRound;
  }

  idle(dt, snapshot) {
    if (this.filming) {
      this.filming = false;
      document.body.dataset.film = 'off';
    }
    const counting = this.session.screen === 'countdown';
    // With friends, the stand carries on while this child's hands are checked again, as it does for everyone else.
    const together = this.friendly && (counting || this.inRound);
    if (together && this.inRound && (!this.followFriends(dt) || !this.runLater(dt))) return;
    this.field.update(dt, snapshot, { aspect: this.session.camera.aspect, showHands: counting });
    if (together) this.sendFriends({ hand: false });
  }

  render() {
    this.field.render();
  }

  prompt(snapshot, dt) {
    const { session, field } = this;
    const needed = session.handsPrompt(snapshot, dt);
    if (needed && !needed.key.startsWith('closed')) return needed;
    const { side } = snapshot;
    if (field.gloves[side].sticky > 0) return { key: `sticky-${side}`, text: STICKY, side: null, silent: true, asks: 'open' };
    if (this.bump && session.playSeconds - this.bump.at < BUMP_PROMPT_SECONDS) {
      return { key: `bump-${this.bump.side}`, text: OPEN_TO_SLICE[this.bump.side], side: this.bump.side, asks: 'open' };
    }
    // With friends, fruit flies whoever throws it.
    const flying = this.friendly ? this.standOpen : field.throwing;
    if (flying && this.idleFor > HOW_AFTER_SECONDS) return { key: 'how', text: HOW, side: null };
    return null;
  }

  finished() {
    // What the voice says at the end: the same kind word as any finish, when a customer couldn't wait.
    this.session.finishLine = this.walkedOff && !this.friendly ? LOST_LINE : WON;
    this.story.hide();
    this.field.throwing = false;
    this.field.labels = [];
    this.inRound = false;
    this.ended = true;
    this.standOpen = false;
    if (!this.friendly) return;
    this.friends.finished(this.sinceGo, { n: this.points, w: 1 });
    // Friends' gloves go with the end of the game, and the fruit behind the finish card is this game's own again.
    for (const each of this.friendsGloves) each.glove.visible = false;
    this.field.setShared(null);
  }

  summary() {
    const { smoothies, rotten } = this.stand.stats;
    const lost = Boolean(this.walkedOff) && !this.friendly;
    const name = lost ? (characterWithId(this.walkedOff.who)?.name ?? 'The customer') : '';
    if (!this.friendly) document.querySelector('#screen-finish h2').textContent = lost ? WALKED_OFF(name) : WON;
    // The card's big button is to try the same level again. The levels' own words are put on it first.
    if (lost) queueMicrotask(() => {
      byId('play-again').textContent = 'Try again';
    });
    const { hands } = this.session.settings;
    const mine = (value) => ({ left: hands === 'left' ? value : 0, right: hands === 'right' ? value : 0 });
    this.friends.showResults();
    // With friends, what this child sliced is what was theirs, and the stand's rotten fruit was everyone's.
    const sliced = this.friendly ? { ...this.theirs } : this.field.sliced;
    return {
      hero: smoothies,
      noun: 'fair',
      rows: {
        sliced,
        rotten: mine(this.friendly ? this.rottenHere : rotten),
        coins: mine(this.stand.coins),
      },
      // A customer who walked off means trying the same level again.
      won: !lost,
      // A game with friends is on the host's level, so it doesn't move the child's own level on.
      countsForLevel: !this.friends.current,
    };
  }

  /* ---------- with friends ---------- */

  resetFriends() {
    this.myClaims = new Map(); // What this child's hand got to, by fruit, waiting to hear whose it is.
    this.claims = []; // Every fruit that went to someone this game, in the order the server said.
    this.applied = 0; // How many of those the stand has counted, as whoever runs it says.
    this.appliedMs = null;
    this.points = 0;
    this.sentPoints = null;
    this.theirs = { left: 0, right: 0 }; // Fruit this child sliced that was theirs.
    this.rottenHere = 0;
    this.thrown = 0;
    this.outOfTouch = false; // This game lost touch for long enough that friends will have gone on without it.
    this.awaySince = null;
    this.lastFrameAt = null;
    this.passedOver = new Set(); // Whoever ran the stand and went quiet, so someone else runs it now.
  }

  /** Each friend's glove and score, and who runs the stand, for a game with friends, or none of it alone. */
  prepareFriends(friendly) {
    this.resetFriends();
    this.scores = new Map();
    this.friendsGloves = (friendly?.friends ?? []).map((friend) => ({ id: friend.id, name: friend.spec.name, glove: new Glove('right'), track: new Track(HAND_TRACK), fade: 0 }));
    this.field.friendsGloves = this.friendsGloves;
    this.follower = new StandFollower();
    if (!friendly) {
      this.runnerId = null;
      this.field.setShared(null);
      this.showScores();
      return;
    }
    this.runnerId = this.chooseRunner();
    this.follower.follow(this.runnerId, performance.now());
    this.field.setShared({
      runner: this.isRunner,
      clock: () => this.clock(),
      nextId: (kind) => fruitId(friendly.mySlot, (this.thrown += 1), kind),
    });
    this.showScores();
  }

  /** Milliseconds since this game heard "GO!", which is about the same moment on every friend's computer. */
  clock() {
    return performance.now() - this.zeroAt;
  }

  /** How long since "GO!" was shown, by the clock on the wall, for what's sent about the glove and points. */
  get sinceGo() {
    return performance.now() - this.goAt;
  }

  get isRunner() {
    return Boolean(this.friendly) && this.runnerId === this.friends.room.you;
  }

  /** Who runs the stand: the first in the order everyone has, the host first, who's still playing. */
  chooseRunner() {
    const { current, room } = this.friends;
    const present = (id) => {
      if (id === room.you) return !this.outOfTouch;
      return !this.passedOver.has(id) && current.friends.some((friend) => friend.id === id && !friend.gone);
    };
    return runnerOf(current.racers, present) ?? room.you;
  }

  /**
   * Each frame with friends: who runs the stand, and the fruit and orders as they have them, and friends' gloves.
   * Returns false once the game is over, as it is for everyone when the game running the stand has finished.
   */
  followFriends(dt) {
    const now = performance.now();
    const { room } = this.friends;
    // Out of touch for a long while, friends will have gone on without this game: without the connection, they
    // count it as gone, and running the stand with the page put away, they count it as stopped.
    if (this.isRunner && this.lastFrameAt !== null && now - this.lastFrameAt > QUIET_MS) this.outOfTouch = true;
    this.lastFrameAt = now;
    if (room.inRoom) this.awaySince = null;
    else if (now - (this.awaySince ??= now) > QUIET_MS) this.outOfTouch = true;
    // Whoever runs the stand, gone quiet for as long while still here, has stopped: the next one takes over.
    if (!this.isRunner && room.inRoom && this.follower.quiet(now)) this.passedOver.add(this.runnerId);
    const runner = this.chooseRunner();
    if (runner !== this.runnerId) this.changeRunner(runner, now);
    if (!this.isRunner) this.applyStand();
    this.showFriendsGloves(dt);
    // The game running the stand only finishes once the last customer has their smoothie: the day is over.
    if (!this.isRunner && this.friends.results.has(this.runnerId)) {
      this.stand.setTo(this.stand.customers.length);
      this.session.finish();
      return false;
    }
    return true;
  }

  changeRunner(runner, now) {
    this.runnerId = runner;
    this.follower.follow(runner, now);
    this.field.shared.runner = this.isRunner;
    if (this.isRunner) {
      this.takeOver();
    } else {
      // Someone else runs it now, and this game only has the fruit they throw.
      this.field.throwing = false;
      this.after = null;
    }
  }

  /**
   * This game runs the stand from now on, from where it was left: the same customer, what's left of their order,
   * and the fruit in the air. Whatever was sliced since it was last counted, the server told everyone, in the
   * same order, so that's counted now.
   */
  takeOver() {
    const { stand, field } = this;
    const owed = this.claims.slice(this.applied);
    this.applied = this.claims.length;
    for (const k of owed) stand.slice(kindOfId(k));
    if (!this.inRound) return;
    if (stand.orderDone && !this.after) {
      const last = stand.index >= stand.customers.length - 1;
      this.later(last ? LAST_THANKS_SECONDS : NEXT_CUSTOMER_SECONDS, () => stand.nextCustomer());
    }
    field.throwing = this.standOpen;
    field.throwIn = 0;
  }

  /** On a friend's game, the stand as whoever runs it has it: their fruit, their customer and what's left of the order. */
  applyStand() {
    const { latest } = this.follower;
    if (!latest || !this.inRound) return;
    if (latest.g > 0) this.field.sharedGravity = latest.g;
    this.field.syncShared(this.follower.fruit);
    if (latest.ms === this.appliedMs) return;
    this.appliedMs = latest.ms;
    this.applied = Math.min(latest.a, this.claims.length);
    const { stand } = this;
    const wasDone = stand.orderDone;
    const before = stand.leftList.join(',');
    if (latest.c < stand.index) return;
    if (stand.setTo(latest.c, latest.l)) {
      this.onCustomer({ customer: stand.customer });
      return;
    }
    if (stand.leftList.join(',') !== before) this.showOrder();
    if (!wasDone && stand.orderDone) this.orderMade(stand.customer);
  }

  /** With friends: this child's hand got there, so it's gone here, and the server says whose it is. It's worth what the order makes it now. */
  sliceShared(kind, side, fruit) {
    const verdict = kind === 'rotten' ? 'rotten' : this.stand.left[kind] > 0 ? 'wanted' : 'extra';
    this.myClaims.set(fruit.id, { verdict, side });
    if (verdict === 'rotten') this.rottenHere += 1;
    this.friends.claim(fruit.id);
    return verdict;
  }

  /**
   * A fruit went to someone: it goes here too, it counts for them, and the stand counts it for the order. Every
   * one is noted, from the countdown on, so this game's list is the same as everyone's, should it take over.
   */
  claimed({ k, by }) {
    if (!this.friendly || this.ended || !this.friendly.racers.includes(by)) return;
    this.claims.push(k);
    if (this.isRunner) {
      this.stand.slice(kindOfId(k));
      this.applied = this.claims.length;
    }
    const mine = by === this.friends.room.you ? this.myClaims.get(k) : null;
    if (mine) {
      this.points += pointsFor(mine.verdict);
      this.theirs[mine.side] += 1;
      this.field.removeShared(k, { burst: false });
    } else if (this.field.removeShared(k, { burst: true })) {
      // A friend's slice: it falls in two here too, more quietly than the child's own.
      this.session.sound.play('chop', { gain: 0.3, rate: 0.95 + Math.random() * 0.1 });
    }
    this.showScores();
  }

  /** Something from a friend's game: their glove, the stand, whose a fruit was, or their points. */
  fromFriend(id, message) {
    if (!this.friendly) return;
    if (message.t === 'hand') this.friendsGloves.find((each) => each.id === id)?.track.push(message, performance.now());
    else if (message.t === 'stand') this.heardStand(id, message);
    else if (message.t === 'claimed') this.claimed(message);
    else if (message.t === 'score') this.friendScore(id, message);
  }

  heardStand(id, message) {
    const { racers } = this.friendly;
    if (this.isRunner) {
      // Someone after this game in the order runs the stand: they only would once friends had gone on without
      // this game, as when it was out of touch for a while. It follows them from now on.
      if (racers.indexOf(id) > racers.indexOf(this.friends.room.you)) this.outOfTouch = true;
      return;
    }
    this.follower.push(id, message, performance.now());
  }

  friendGone(friend) {
    this.scores.delete(friend.id);
    this.friendsGloves = this.friendsGloves.filter((each) => each.id !== friend.id);
    this.field.friendsGloves = this.friendsGloves;
    this.showScores();
  }

  /** What goes to friends: the glove, the stand if this game runs it, and the points when they change. */
  sendFriends({ hand = true } = {}) {
    const ms = this.sinceGo;
    if (hand) this.friends.sendMove('hand', this.handState(), ms);
    else this.friends.sendMove('hand', { x: 0, y: 0, v: 0, o: 0, p: [] }, ms);
    if (this.isRunner) this.friends.sendMove('stand', this.standState(), this.clock());
    if (this.points !== this.sentPoints) {
      this.sentPoints = this.points;
      this.friends.sendScore(this.points, ms);
    }
  }

  /** The stand, for friends' games: how each fruit was thrown, the customer, what's left of their order, and how many slices it has counted. */
  standState() {
    const { field, stand } = this;
    return {
      g: field.sharedGravity,
      f: wireFruit(field.fruit.slice(0, MOST_FRUIT_SENT)),
      c: Math.max(0, stand.index),
      l: stand.leftList,
      a: this.applied,
    };
  }

  /** Where the child's glove is, for friends' games: across and down the screen, and its points in palms. */
  handState() {
    const { field } = this;
    const glove = field.gloves[field.side];
    if (!glove.visible) return { x: 0, y: 0, v: 0, o: 0, p: [] };
    const palm = field.palmSize;
    return {
      x: round2(glove.x / field.width) || 0,
      y: round2(glove.y / field.height) || 0,
      v: 1,
      o: glove.status === 'open' ? 1 : 0,
      p: glove.points.flatMap(({ x, y }) => [round2(x / palm), round2(y / palm)]),
    };
  }

  /** Each friend's glove where their hand is, a moment ago, fading in and out as it comes and goes. */
  showFriendsGloves(dt) {
    const { field } = this;
    const now = performance.now();
    for (const each of this.friendsGloves) {
      const at = each.track.at(now);
      const seen = Boolean(at?.v && at.p?.length === 42);
      each.fade += ((seen ? 1 : 0) - each.fade) * (1 - Math.exp(-dt * GLOVE_FADE_RATE));
      if (!seen) {
        if (each.fade < 0.02) each.glove.visible = false;
        continue;
      }
      const { glove } = each;
      glove.visible = true;
      glove.status = at.o ? 'open' : 'closed';
      glove.x = at.x * field.width;
      glove.y = at.y * field.height;
      glove.points.forEach((point, index) => {
        point.x = at.p[index * 2] * field.palmSize;
        point.y = at.p[index * 2 + 1] * field.palmSize;
      });
    }
  }

  /** A friend's points, as they change. */
  friendScore(id, message) {
    if (!this.friendly.racers.includes(id)) return;
    this.scores.set(id, message.n);
    this.showScores();
  }

  /** Everyone's points while playing with friends, the most first, with the child's own among them. */
  showScores() {
    const list = byId('stand-scores');
    const current = this.friendly;
    list.hidden = !current;
    if (list.hidden) return;
    const portraits = this.session.portraits ?? {};
    const mine = { id: this.friends.room.you, name: 'You', driver: this.session.settings.fighter, n: this.points };
    const theirs = current.friends.filter((friend) => !friend.gone).map((friend) => ({ id: friend.id, name: friend.spec.name, driver: friend.spec.id, n: this.scores.get(friend.id) ?? 0 }));
    const everyone = [mine, ...theirs].sort((a, b) => b.n - a.n);
    const key = everyone.map(({ id, n }) => `${id}:${n}`).join(',');
    if (list.dataset.key === key) return;
    list.dataset.key = key;
    list.replaceChildren(...everyone.map((each) => {
      const row = document.createElement('li');
      row.classList.toggle('is-you', each === mine);
      const face = document.createElement('img');
      face.alt = '';
      face.src = portraits[(characterWithId(each.driver) ?? ROSTER[0]).id] ?? '';
      const name = document.createElement('span');
      name.className = 'stand-score-name';
      name.textContent = each.name;
      const score = document.createElement('span');
      score.className = 'stand-score';
      score.textContent = String(each.n);
      row.append(face, name, score);
      return row;
    }));
  }
}

new GameSession({
  // What the open and closed hand do here, for the hand shapes in the grown-ups' panel: see core/shapes.js.
  moves: { open: 'Slice', closed: null },
  shell: {
    title: 'Giraffe’s Smoothie Stand',
    startLabel: 'Open the stand',
    againLabel: 'Another fair',
    finishTitle: WON,
    heroMark: '🥤',
    heroNoun: 'smoothies',
    extraRows: [{ id: 'sliced', label: 'Fruit sliced' }, { id: 'rotten', label: 'Rotten fruit' }, { id: 'coins', label: 'Coins' }],
    hudTop: `
      <div class="hud-top">
        <div class="chips">
          <div class="chip"><span class="chip-label">Smoothies</span><span id="chip-smoothies" class="chip-value">0 of 6</span></div>
          <div id="chip-coins-box" class="chip" hidden><span class="chip-label">Coins</span><span id="chip-coins" class="chip-value">🪙 0</span></div>
        </div>
        <div class="race-progress" aria-hidden="true"><div id="race-progress-fill" class="race-progress-fill"></div></div>
        <ol id="stand-scores" class="stand-scores" hidden></ol>
      </div>
      ${STORY_BOX}
      <div id="order" class="order" aria-hidden="true"></div>
      <div id="patience" class="patience" aria-hidden="true" hidden><span id="patience-fill" class="patience-fill"></span></div>
      <div class="film" aria-hidden="true">
        <svg viewBox="0 0 220 220">
          <g class="film-apple">
            <circle cx="150" cy="90" r="34" />
            <path d="M150 58q2-14 12-20" />
          </g>
          <g class="film-halves">
            <path class="film-half-a" d="M116 90a34 34 0 0 1 68 0z" />
            <path class="film-half-b" d="M116 90a34 34 0 0 0 68 0z" />
          </g>
          <path class="film-swipe" d="M34 168Q110 110 200 34" />
          <g class="film-hand">
            <rect x="26" y="150" width="46" height="42" rx="16" />
            <path d="M32 156V128M43 152V118M55 152V116M66 156V124M72 176L90 162" />
          </g>
        </svg>
      </div>`,
    panelSettings: `
      <fieldset class="choice">
        <legend>How to slice</legend>
        <label><input type="radio" name="slicing" value="swipe"> A swipe of the open hand</label>
        <label><input type="radio" name="slicing" value="touch"> Just touching the fruit with an open hand, for slow or limited movement</label>
      </fieldset>
      <fieldset class="choice">
        <legend>How fast the fruit flies</legend>
        <label><input type="radio" name="pace" value="slow"> Slow</label>
        <label><input type="radio" name="pace" value="medium"> Medium</label>
        <label><input type="radio" name="pace" value="fast"> Fast</label>
      </fieldset>
      <fieldset class="choice">
        <legend>Customers’ patience</legend>
        <label><input type="radio" name="patience" value="hurry"> They won’t wait forever: a customer whose order isn’t made in time goes home, and that ends the fair</label>
        <label><input type="radio" name="patience" value="gentle"> Gentle: they wait as long as it takes, and nothing can be lost</label>
      </fieldset>
      <fieldset class="choice">
        <legend>Customers</legend>
        <label><input type="radio" name="customers" value="3"> Three</label>
        <label><input type="radio" name="customers" value="6"> All six</label>
      </fieldset>`,
  },
  defaults: { pace: 'medium', slicing: 'swipe', customers: 6, patience: 'hurry' },
  choices: { pace: String, slicing: String, customers: Number, patience: String },
  tagline: (side) => `It’s the Harvest Fair! Slice what the customers order, with your open ${side} hand.`,
  finishLine: WON,
  lines: new URL('./audio/voice/lines.json', import.meta.url),
  portraits: () => renderPortraits(ROSTER),
  createSound: (options) => new Sound({
    ...options,
    sounds: { chop: new URL('./audio/chop.ogg', import.meta.url), mixer: new URL('./audio/mixer.ogg', import.meta.url) },
  }),
  createGame: (session) => new SmoothieGame(session),
}).start();
