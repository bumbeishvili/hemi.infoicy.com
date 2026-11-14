// Rooftop Rope: ropes strung between rooftops, crossed by standing on one leg. While the child holds one foot
// off the floor, their walker rolls along the rope on its one wheel, faster the higher the foot is held. With both feet down
// on the rope the walker wobbles, and after a few seconds drops into the net and starts that rope again. It's
// the game about standing on one leg and holding it. This file runs it from start to finish, on top of what
// the body games share in core/body/game.js. The rules are in walk.js, and what it looks like is in world.js.
//
// Friends can cross together, each on their own computer: side by side, waiting for each other on every
// rooftop, or racing each other to the last one.
import { BODY_SAY, BodyGame, byElementId } from '../../core/body/game.js';
import { ROSTER } from '../../core/body/roster.js';
import { mountBodyShell } from '../../core/body/shell.js';
import { seededRandom } from '../../core/friends.js';
import { FriendsPanel, time as raceTime } from '../../core/friends-ui.js';
import { HIGHER, HOLDS, LIFT, Lifter, ROPE_COUNTS, WALK, WOBBLES, Walk, Warmup, liftOf, newAt as newAtLevel, newThingsAt, otherLeg } from './walk.js';
import { RopeSound } from './rope-sound.js';
import { Mate, finishMessage, mateRopes, scoreRows, teamStars, walkerMessage } from './team.js';
import { World } from './world.js';

const AFTER_FINISH_SECONDS = 3;
const COUNT_FROM = 3;
const GO_SHOWN_SECONDS = 0.9;
const READY_SECONDS = 1.1;
const NEW_SHOWN_SECONDS = 2.6; // How long something new is pointed out, the first time it comes.
const NEW_GAP_SECONDS = 0.35;
const METER_MOST = 1.6; // The meter's top, in whole lifts.
const HIGHER_FROM = 0.12; // How far before a balloon, as a share of the rope, "Higher!" is asked for.

const DEFAULTS = { moveSize: 'medium', ropeLift: 'medium', ropeCount: 6, ropeHold: 'medium', ropeLeg: 'turns', ropeFall: 'later', ropeFriends: 'together', fighter: 'giraffe' };
const CHOICES = { ropeLift: String, ropeCount: Number, ropeHold: String, ropeLeg: String, ropeFall: String, ropeFriends: String };

// Crossing with friends, each on their own computer: see core/friends-ui.js for what each of these is.
const ROPE_WORDS = {
  toggle: 'Play with friends',
  make: 'Make a crossing',
  codeLabel: 'A friend’s crossing code',
  codeName: 'Crossing code',
  how: 'Tell your friends the code. Then you all choose a walker and press <b>Let’s cross!</b>, and race to the last rooftop.',
  // Together or against each other, as whoever made the crossing chooses: see teams in core/friends-ui.js.
  teamLegend: 'How to play',
  together: 'Together',
  against: 'Against each other',
  howTogether: 'Tell your friends the code. Then you all choose a walker and press <b>Let’s cross!</b>, and cross the rooftops together.',
  teamTitle: 'You crossed them all together!',
  leave: 'Leave this crossing',
  privacy: 'Only your name, who you walk as, whether you chose together or against each other, where your walker is on the ropes, which foot is up and how high go to your friends. The camera picture stays on this computer.',
  alone: 'Play on your own',
  full: 'That crossing already has 4 players.',
  lost: 'Can’t reach the crossing. Check the internet, then try again.',
  left: 'You’ve left the crossing.',
  badCode: 'A crossing code is 3 letters and numbers.',
  busy: 'Crossing',
  still: 'still crossing',
};

// Every one of these has a rendered voice file: see audio/voice/lines.json.
const SAY = {
  choose: 'Who’s walking the rope today?',
  mission: 'Stand on one leg, and cross to the last rooftop!',
  warmLeft: 'Lift your left foot high, and hold it!',
  warmRight: 'Lift your right foot high, and hold it!',
  ready: 'That’s it! You’re ready to cross!',
  left: 'Lift your left foot!',
  right: 'Lift your right foot!',
  other: 'Now the other foot!',
  any: 'Lift one foot!',
  higher: 'Higher!',
  rest: 'Foot down, and have a rest.',
  wait: 'Wait here for your friends!',
  top: 'You crossed them all!',
};
// The moment something is seen, the child is told so, as words on the screen.
const SEEN_WORDS = { lift: ['Good lift!', 'კარგად ასწიე!'], across: ['Across!', 'გადახვედი!'] };
const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

class RooftopRope extends BodyGame {
  constructor() {
    super({
      defaults: DEFAULTS,
      choices: CHOICES,
      lines: new URL('./audio/voice/lines.json', import.meta.url),
      createSound: (options) => new RopeSound(options),
    });
    this.walk = null;
    this.warmup = null;
    this.practised = false;
    this.timer = 0;
    this.countLeft = 0;
    this.readyLeft = 0;
    this.readAt = null;
    this.lastNumbers = {};
    this.mates = [];
    this.markMates = [];
    this.newShown = new Set();
    this.newQueue = [];
    this.newLeft = 0;
    this.newGap = 0;
    this.filmFor = null;
  }

  /** What a level brings that's new, for the cards: see NEW_THINGS in walk.js. */
  newAt(level) {
    return newAtLevel(level);
  }

  setUp() {
    const { settings } = this;
    this.lifter = new Lifter({ size: settings.ropeLift });
    this.world = new World(byElementId('game'));
    this.stage = this.world;
    this.world.setView('title', { snap: true });

    byElementId('start').addEventListener('click', () => {
      this.sound.unlock();
      this.world.setView('choose');
      this.setScreen('choose');
      this.sound.ready.then(() => {
        if (this.screen === 'choose') this.sound.say(SAY.choose);
      });
    });
    byElementId('rope-start').addEventListener('click', () => this.openCameraThen(() => this.beginBodyCheck()));
    byElementId('cross-again').addEventListener('click', () => this.crossAgain());
    byElementId('other-walker').addEventListener('click', () => {
      this.confetti.stop();
      this.showPlace();
      this.world.setView('choose', { snap: true });
      this.setScreen('choose');
    });
    byElementId('warm-skip').addEventListener('click', () => this.warmup?.finish(false));
    // Crossing with friends, if a grown-up makes or joins one.
    this.friends = new FriendsPanel({
      game: 'rooftop-rope',
      linkKey: 'rope',
      words: ROPE_WORDS,
      hello: () => ({ driver: this.chosen?.id ?? settings.fighter, level: this.levels.current, length: settings.ropeCount, mode: settings.ropeHold }),
      screen: () => this.screen,
      portraits: () => this.portraits,
      onGone: (friend) => this.friendGone(friend),
      onMove: (id, message) => this.fromFriend(id, message),
      // Together, it's the stars each has. Against each other, it's the time to the last rooftop.
      resultText: ({ ms, won, dropped }) => (this.team ? plural(dropped, 'star') : won ? raceTime(ms) : ROPE_WORDS.still),
      titles: { first: 'First to the last rooftop!', other: 'You crossed them all!' },
      teams: {
        get: () => (settings.ropeFriends === 'against' ? 'against' : 'together'),
        set: (choice) => this.chooseTeams(choice),
      },
      startAfter: byElementId('start'),
      waitingBefore: byElementId('screen-finish'),
      resultsAfter: document.querySelector('#screen-finish .finish-hero'),
      finishTitle: byElementId('finish-title'),
    });
    byElementId('recheck').addEventListener('click', () => {
      byElementId('panel').close();
      this.practised = false;
      if (this.camera.running) this.beginBodyCheck(this.screen === 'playing' ? 'resume' : 'start');
      else this.openCameraThen(() => this.beginBodyCheck());
    });
  }

  debug() {
    const game = this;
    return {
      world: this.world,
      lifter: this.lifter,
      get walk() {
        return game.walk;
      },
      get warmup() {
        return game.warmup;
      },
      get friends() {
        return game.friends;
      },
      get mates() {
        return game.mates;
      },
    };
  }

  /** Together or against each other, chosen in the friends box: kept with the grown-ups' settings, and shown there. */
  chooseTeams(choice) {
    this.changeSettings({ ropeFriends: choice });
    const input = document.querySelector(`input[name="ropeFriends"][value="${choice}"]`);
    if (input) input.checked = true;
  }

  settingChanged(change) {
    const { settings } = this;
    if ('ropeLift' in change) this.lifter.setSize(settings.ropeLift);
    if ('ropeFriends' in change && this.friends) {
      if (this.friends.room.inRoom) this.friends.room.tell(this.friends.hello());
      this.friends.showTeams();
    }
  }

  /**
   * The rooftops the walker waits on before a game: the ones for the level that's next, laid out the same way
   * every time, so the title card always looks the same.
   */
  showPlace() {
    const place = new Walk({ level: this.levels.current, ropes: 4, random: seededRandom(17 + this.levels.current) });
    this.walk = null;
    this.world.setMates([]);
    this.world.setWalk(place, 0);
    this.world.setLive(null);
  }

  showChosen(spec) {
    this.world.setWalker(spec);
    if (!this.world.walk) this.showPlace();
    // Friends see who this child walks as.
    if (this.friends?.room.inRoom) this.friends.room.tell(this.friends.hello());
  }

  /* ---------- the body ---------- */

  /**
   * Each time the tracker has looked at the child: how much higher one foot is than the other, which is all
   * this game reads. The body reader's own moves, like a jump or a kick, mean nothing here.
   */
  onMoves(moves, now) {
    const dt = this.readAt === null ? 1 / 30 : Math.min(0.1, Math.max(0.001, now - this.readAt));
    this.readAt = now;
    this.lifter.update(liftOf(this.latestBody), dt);
    if (this.screen === 'warmup' && this.warmup) this.warmup.update(dt);
  }

  /** Nobody in the picture for a while: the lifted foot is let go, and the walker stands on both. */
  feetUnseen(dt) {
    this.lifter.update(null, dt);
  }

  /** What the panel says the camera can see, so a grown-up can tell why a lift isn't counting. */
  showLiveReading() {
    const now = performance.now();
    if (now - (this.panelAt ?? 0) < 200) return;
    this.panelAt = now;
    const { lifter } = this;
    const percent = (share) => `${Math.round(share * 1000) / 10}%`;
    const high = lifter.heightOf('left') > lifter.heightOf('right') ? ['left', lifter.heightOf('left')] : ['right', lifter.heightOf('right')];
    const seeing = !lifter.seen ? 'nobody’s feet' : high[1] <= LIFT.dead ? 'both feet on the floor' : `the ${high[0]} foot ${percent(high[1])} of the child’s height off the floor`;
    const { left, right } = lifter.reach;
    const from = lifter.best.left === null && lifter.best.right === null ? 'a small one, as the warm-up was skipped or measured nothing' : 'from the warm-up and the setting below';
    byElementId('live-reading').textContent = `The camera sees ${seeing}. A whole lift is ${percent(left)} of their height with the left foot and ${percent(right)} with the right, ${from}. The walker goes once a foot is ${Math.round(WALK.on * 100)}% of the way to that, and fastest at all of it.`;
  }

  /**
   * The meter beside the child's picture: the marker is the foot that's up, the line near the bottom is where
   * the walker starts to go, and the green at the top is a whole lift, where it goes fastest.
   */
  updateMeter(lift) {
    const shown = Math.round(Math.min(METER_MOST, Math.max(0, lift || 0)) * 100);
    if (this.lastNumbers.meter === shown) return;
    this.lastNumbers.meter = shown;
    byElementId('meter-dot').style.bottom = `${6 + (shown / (METER_MOST * 100)) * 88}%`;
    byElementId('rope-meter').dataset.zone = shown >= 100 ? 'up' : shown >= WALK.on * 100 ? 'going' : 'down';
  }

  /** The two feet at the bottom of the screen: which to lift, and which is up. */
  showFeet(asked, up) {
    const key = `${asked}:${up}`;
    if (this.lastNumbers.feet === key) return;
    this.lastNumbers.feet = key;
    const feet = byElementId('feet');
    feet.dataset.ask = asked ?? 'none';
    feet.dataset.up = up ?? 'none';
  }

  /* ---------- the warm-up ---------- */

  afterBodyCheck(then) {
    if (then === 'resume') {
      this.world.setView('play');
      this.setScreen('playing');
    } else if (this.practised) this.beginCountdown();
    else this.beginWarmup();
  }

  /** Before the first game, the child lifts each foot as high as they can, and that's what a whole lift is set from. */
  beginWarmup() {
    const { world } = this;
    if (this.walk) this.showPlace();
    world.setView('warmup');
    this.lastNumbers = {};
    this.readyLeft = 0;
    this.setScreen('warmup');
    // The child has just stood still for the camera, on both feet: that's level.
    this.lifter.restHere();
    // Standing on the leg being worked on, which is lifting the other foot, comes second, when the child
    // knows what's wanted.
    const worked = this.settings.hands === 'right' ? 'right' : 'left';
    this.warmup = new Warmup({ lifter: this.lifter, sides: [worked, otherLeg(worked)], onEvent: (event) => this.onWarmEvent(event) });
    this.askWarmSide();
  }

  askWarmSide() {
    const side = this.warmup.side;
    const text = side === 'left' ? SAY.warmLeft : SAY.warmRight;
    this.showCoach('footUp', this.translate(text), { side });
    this.sound.say(text);
    this.showFeet(side, null);
  }

  onWarmEvent({ type, best }) {
    if (type === 'measured') {
      if (best !== null) this.showSeen(SEEN_WORDS.lift, { x: 0.3, y: 0.4 });
      return;
    }
    if (type === 'side') {
      this.askWarmSide();
      return;
    }
    // Done, or skipped.
    this.hideCoach();
    this.sound.say(SAY.ready);
    this.readyLeft = READY_SECONDS;
  }

  /** The foot the child has up, and how high against the setting, for the walker to copy before a game. */
  liveFoot() {
    const { lifter } = this;
    const foot = lifter.heightOf('left') > lifter.heightOf('right') ? 'left' : 'right';
    const lift = lifter.heightOf(foot) / lifter.full;
    return lift > 0.15 ? { foot, lift } : null;
  }

  updateWarmup(dt, now) {
    const { warmup, world } = this;
    if (this.readyLeft > 0) {
      this.readyLeft -= dt;
      world.setLive(this.liveFoot());
      if (this.readyLeft <= 0) this.endWarmup();
      return;
    }
    if (this.bodyLost()) {
      this.feetUnseen(dt);
      world.setLive(null);
      this.prompt.show({ key: 'come-back', text: BODY_SAY.comeBack, side: null }, now);
      return;
    }
    // There, but with their feet out of the picture: nothing can be measured until they're back in it.
    this.prompt.show(this.lifter.seen ? null : { key: 'see-feet', text: BODY_SAY.seeFeet, side: null }, now);
    const live = this.liveFoot();
    world.setLive(live);
    this.setCoachEffort(Math.min(1, warmup.share));
    // The meter goes on up into the green for a foot that's higher than the setting's whole lift.
    this.updateMeter(warmup.height / this.lifter.full);
    this.showFeet(warmup.side, live?.foot ?? null);
  }

  endWarmup() {
    this.warmup = null;
    this.practised = true;
    this.hideCoach();
    this.prompt.clear();
    this.beginCountdown();
  }

  /* ---------- a game ---------- */

  /** Ready to cross. With friends, everyone waits for the others first, and then all count down together. */
  beginCountdown() {
    const go = () => {
      if (this.screen === 'waiting') this.countDown();
    };
    if (this.friends.holdStart(go)) {
      this.hideCoach();
      this.prompt.clear();
      this.setScreen('waiting');
      return;
    }
    this.countDown();
  }

  countDown() {
    const { settings, world } = this;
    // With friends, everyone crosses the host's ropes: their level, how many and how long, laid out from the
    // same seed. It doesn't move anyone's own level on, and each child keeps their own lift and their own legs.
    const friendly = this.friends.current;
    this.team = Boolean(friendly?.team);
    document.body.toggleAttribute('data-friends-race', Boolean(friendly));
    document.body.toggleAttribute('data-friends-team', this.team);
    const levelNumber = friendly ? friendly.level : this.startLevel();
    this.walk = new Walk({
      level: levelNumber,
      ropes: friendly && ROPE_COUNTS.includes(friendly.length) ? friendly.length : settings.ropeCount,
      hold: friendly && HOLDS[friendly.mode] ? friendly.mode : settings.ropeHold,
      which: settings.ropeLeg,
      side: settings.hands,
      wobble: settings.ropeFall,
      random: friendly ? seededRandom(friendly.seed) : Math.random,
      plain: Boolean(friendly),
      team: this.team,
      lifter: this.lifter,
      onEvent: (event) => this.onWalkEvent(event),
    });
    this.setUpMates(friendly);
    world.setWalk(this.walk, this.mates.length);
    world.setLive(null);
    world.setView('play', { snap: true });
    this.newShown = new Set();
    this.newQueue = [];
    this.newLeft = 0;
    this.newGap = 0;
    byElementId('rope-new').classList.remove('is-showing');
    this.lastNumbers = {};
    this.filmFor = null;
    this.hideCoach();
    this.updateHud();
    this.updateMeter(0);
    this.showFeet(this.walk.asked, null);
    this.countLeft = COUNT_FROM;
    this.setCount(String(COUNT_FROM));
    this.sound.count(COUNT_FROM);
    this.setScreen('countdown');
  }

  updateCountdown(dt) {
    const before = Math.ceil(this.countLeft);
    this.countLeft -= dt;
    const after = Math.ceil(this.countLeft);
    if (this.countLeft <= 0) this.beginPlay();
    else if (after !== before) {
      this.setCount(String(after));
      this.sound.count(after);
    }
  }

  beginPlay() {
    this.goAt = performance.now();
    this.setCount(this.translate('Go!'));
    this.sound.go();
    this.sound.startCity();
    this.timer = GO_SHOWN_SECONDS;
    this.setScreen('playing');
    // However the child's feet have been through the countdown is level.
    this.lifter.restHere();
    this.walk.begin();
    // The mission, in one line.
    this.sound.say(SAY.mission);
  }

  /** The character showing the lift, with what's asked for under it. */
  showFilm(side, text) {
    const key = `${side}:${text}`;
    if (this.filmFor === key) return;
    this.filmFor = key;
    this.showCoach('footUp', this.translate(text), { side });
  }

  hideFilm() {
    if (this.filmFor === null) return;
    this.filmFor = null;
    this.hideCoach();
  }

  /** A balloon coming up that the foot isn't high enough for yet. */
  balloonAhead() {
    const { walk } = this;
    if (walk.state !== 'rope' || !walk.gliding || walk.lift >= HIGHER) return false;
    return walk.things.some((thing) => thing.kind === 'balloon' && !thing.done && thing.at - walk.progress > 0 && thing.at - walk.progress < HIGHER_FROM);
  }

  updatePlaying(dt, now) {
    const { walk, lifter, sound } = this;
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) this.setCount('');
    }
    // Nobody in the picture: everything waits.
    const lost = this.bodyLost();
    if (lost) this.feetUnseen(dt);
    walk.update(dt, lifter, mateRopes(this.mates));
    if (walk.state === 'finished') return;
    // The child is there, but not their feet: too near the camera, or something in the way of them.
    const noFeet = !lost && !lifter.seen;

    const hint = walk.hint;
    const foot = hint === 'other' ? walk.leg : hint;
    const words = { left: SAY.left, right: SAY.right, other: SAY.other, rest: SAY.rest, wait: SAY.wait };
    // Resting at a red light, or waiting on a rooftop for a friend: no foot is asked for.
    const still = hint === 'rest' || hint === 'wait';
    // On a rope that either foot crosses, it's a foot that's asked for, and the film shows the one last lifted.
    const either = walk.leg === 'any' && (hint === 'left' || hint === 'right');
    const said = either ? SAY.any : words[hint];
    if (lost) this.prompt.show({ key: 'come-back', text: BODY_SAY.comeBack, side: null }, now);
    else if (noFeet) this.prompt.show({ key: 'see-feet', text: BODY_SAY.seeFeet, side: null }, now);
    else if (this.balloonAhead()) this.prompt.show({ key: 'higher', text: SAY.higher, side: null }, now);
    else this.prompt.show(hint ? { key: either ? 'any' : hint === 'other' ? `other-${foot}` : hint, text: said, side: still || either ? null : foot } : null, now);
    // The film shows the lift while the walker is waiting for it: on a rooftop, or stopped on the rope.
    if (!lost && !noFeet && (hint === 'left' || hint === 'right' || hint === 'other') && walk.state !== 'falling') {
      this.showFilm(foot, said);
      this.setCoachEffort(Math.min(1, walk.lift));
    } else {
      this.hideFilm();
    }

    this.updateMeter(walk.lift);
    this.showFeet(still ? 'none' : walk.leg === 'any' ? 'any' : walk.leg, walk.foot);
    this.updateWobble(walk.wobble);
    this.updateHud();
    sound.wobble(walk.state === 'rope' ? walk.wobble : 0);
    this.sendWalker(now);
  }

  /** The bar at the top that fills as the walker wobbles: full is a drop into the net. */
  updateWobble(wobble) {
    const shown = Math.round(wobble * 100);
    if (this.lastNumbers.wobble === shown) return;
    this.lastNumbers.wobble = shown;
    byElementId('wobble-fill').style.width = `${shown}%`;
    byElementId('wobble').dataset.wobbling = String(shown > 2);
  }

  updateHud() {
    const { walk, lastNumbers } = this;
    const { stats } = walk;
    const set = (key, value, id) => {
      if (lastNumbers[key] === value) return;
      lastNumbers[key] = value;
      byElementId(id).textContent = String(value);
    };
    set('crossed', stats.crossed, 'ropes-done');
    set('ropes', stats.ropes, 'ropes-all');
    // Prizes, from the levels that have them, each with its little picture.
    const { plan } = walk;
    const prizes = [['⭐', stats.stars, plan.stars > 0], ['🎈', stats.balloons, plan.balloons > 0], ['🪶', stats.feathers, plan.birds > 0], ['🏆', 1, stats.cup]].filter(([, , has]) => has);
    const words = prizes.map(([mark, count]) => `${mark} ${count}`).join('  ');
    if (lastNumbers.prizes !== words) {
      lastNumbers.prizes = words;
      byElementId('prizes-chip').hidden = !prizes.length;
      byElementId('prizes').textContent = words;
    }
  }

  /* ---------- what's new at this level ---------- */

  /**
   * The first time what this level brings comes along, it's pointed out with a small label at the top, for a
   * moment, with no talking.
   */
  pointOutNew(id) {
    const { walk } = this;
    if (!walk || walk.plain || this.newShown.has(id)) return;
    const thing = newThingsAt(walk.levelNumber).find((one) => one.id === id);
    if (!thing) return;
    this.newShown.add(id);
    this.newQueue.push(thing);
    if (this.newLeft <= 0 && this.newGap <= 0) this.showNextNew();
  }

  showNextNew() {
    const label = byElementId('rope-new');
    const thing = this.newQueue.shift();
    if (!thing) return;
    const georgian = this.settings.language === 'ka';
    label.innerHTML = `<span class="rope-new-lead">${georgian ? 'ახალი:' : 'New:'}</span><span class="rope-new-mark">${thing.mark}</span>${georgian ? thing.nameKa : thing.name}`;
    label.dataset.thing = thing.id;
    label.classList.add('is-showing');
    this.newLeft = NEW_SHOWN_SECONDS;
  }

  /** The label's time goes with the game's, so it waits while the grown-ups' panel is open. */
  updateNew(dt) {
    if (this.newLeft > 0) {
      this.newLeft -= dt;
      if (this.newLeft > 0) return;
      byElementId('rope-new').classList.remove('is-showing');
      this.newGap = NEW_GAP_SECONDS;
      return;
    }
    if (this.newGap <= 0) return;
    this.newGap -= dt;
    if (this.newGap <= 0) this.showNextNew();
  }

  /** Whatever the rope the walker is on, or about to cross, has is named as it comes, the first time. */
  watchForNew() {
    const { walk } = this;
    if (!walk || walk.plain || walk.state === 'ready' || walk.state === 'finished') return;
    const rope = walk.rope;
    if (!rope) return;
    for (const thing of rope.things) this.pointOutNew(thing.kind === 'post' ? 'long' : thing.kind);
    if (rope.climb) this.pointOutNew('climb');
    if (rope.long) this.pointOutNew('long');
    if (walk.rules.cup && walk.index === walk.plan.ropes.length - 1) this.pointOutNew('cup');
  }

  /* ---------- what happened ---------- */

  onWalkEvent(event) {
    const { sound, world } = this;
    world.onWalkEvent(event);
    const at = () => world.walkerOnScreen();
    const georgian = this.settings.language === 'ka';
    const handlers = {
      up: () => this.hideFilm(),
      star: () => {
        sound.star();
        this.callout('+1 ⭐', { kind: 'is-number', ...at() });
      },
      pop: () => {
        sound.pop();
        this.callout('+1 🎈', { kind: 'is-number', ...at() });
      },
      feather: () => {
        sound.feather();
        this.callout('+1 🪶', { kind: 'is-number', ...at() });
      },
      rested: () => this.callout('😌', { kind: 'is-number', ...at() }),
      green: () => sound.green(),
      gust: () => sound.gust(),
      fall: () => sound.fall(),
      crossed: () => {
        sound.crossed();
        this.callout(georgian ? SEEN_WORDS.across[1] : SEEN_WORDS.across[0], { kind: 'is-seen', ...at() });
      },
      cup: () => {
        sound.cup();
        this.callout('🏆', { kind: 'is-number', ...world.walkerOnScreen(3) });
      },
      resting: () => sound.say(BODY_SAY.waiting, { ifQuiet: true }),
      finished: () => this.onFinished(),
    };
    handlers[event.type]?.();
  }

  onFinished() {
    const { world, sound, walk } = this;
    // Friends' finish cards fill in with how this child did: the time to the last rooftop, or the stars they have.
    if (this.friends.current) {
      this.sendWalker(performance.now());
      this.friends.finished(performance.now() - this.goAt, finishMessage(walk));
    }
    this.camera.stop();
    this.reader.forget();
    this.lifter.forget();
    this.latestBody = null;
    this.readAt = null;
    this.hideFilm();
    this.prompt.clear();
    this.setCount('');
    this.updateHud();
    this.updateWobble(0);
    sound.wobble(0);
    sound.stopCity();
    sound.finish(SAY.top);
    sound.cheer();
    world.celebrate();
    world.setView('finish');
    this.timer = AFTER_FINISH_SECONDS;
    this.setScreen('finishing');
  }

  showFinish() {
    const { walk } = this;
    const { stats } = walk;
    byElementId('finish-crossed').textContent = plural(stats.crossed, 'rope');
    const seconds = (value) => Math.round(value);
    const longest = Math.round(stats.longest * 10) / 10;
    // Standing on the left leg is the right foot held up, and the other way round.
    const stood = `${this.chosen.name} stood on the left leg for ${plural(seconds(stats.holdSeconds.right), 'second')} and on the right leg for ${plural(seconds(stats.holdSeconds.left), 'second')}, and the longest stand was ${longest} seconds.`;
    const fell = stats.falls ? ` The walker dropped into the net ${plural(stats.falls, 'time')}, and went back up.` : '';
    const eased = stats.eased.left + stats.eased.right ? ' The ropes asked for a foot a little less high as the game went on, to meet how high it goes.' : '';
    byElementId('finish-line').textContent = `${stood}${fell}${eased}`;
    byElementId('finish-prizes').textContent = this.prizeWords();
    this.fillTallyCards(byElementId('finish-tally'), [
      { name: 'left', icon: 'standLeft', label: 'Stands on the left leg', value: stats.holds.right },
      { name: 'right', icon: 'standRight', label: 'Stands on the right leg', value: stats.holds.left },
      { name: 'longest', icon: 'standRight', label: 'Longest stand, seconds', value: longest },
    ]);
    // Nobody fails a game, so every one that's finished moves on a level. With friends it's the host's level,
    // so it doesn't move anyone's own level on.
    if (this.friends.current) {
      this.levels.last = null;
      this.levelUi.refresh();
    } else {
      this.finishLevel(true);
    }
    this.friends.showResults();
    this.confetti.start();
    this.setScreen('finish');
  }

  /** What else was won, in words, from what this level has. Nothing at level 1. */
  prizeWords() {
    const { stats, plan } = this.walk;
    const parts = [];
    if (plan.stars) parts.push(`caught ${stats.stars} of ${plural(plan.stars, 'star')}`);
    if (plan.balloons) parts.push(`popped ${stats.balloons} of ${plural(plan.balloons, 'balloon')}`);
    if (plan.birds) parts.push(`carried ${stats.feathers} of ${plural(plan.birds, 'bird')} across`);
    if (stats.rests) parts.push(`took ${plural(stats.rests, 'rest')} at the lights`);
    if (stats.cup) parts.push('won the cup');
    if (!parts.length) return '';
    const last = parts.pop();
    const words = parts.length ? `${parts.join(', ')} and ${last}` : last;
    return `${words[0].toUpperCase()}${words.slice(1)}.`;
  }

  crossAgain() {
    this.confetti.stop();
    this.reader.forget();
    this.openCameraThen(() => this.beginBodyCheck());
  }

  /* ---------- with friends ---------- */

  /** Friends' walkers, each following what their own game sends, and their names over them. */
  setUpMates(friendly) {
    this.mates = (friendly?.friends ?? []).map((friend) => new Mate(friend));
    this.world.setMates(this.mates.map(({ friend }) => friend.spec));
    for (const mark of this.markMates) mark.remove();
    this.markMates = this.mates.map(({ friend }) => {
      const root = document.createElement('div');
      root.className = 'walker-mark';
      root.dataset.where = 'none';
      const face = document.createElement('img');
      face.className = 'walker-mark-face';
      face.alt = '';
      face.src = this.portraits[friend.spec.id] ?? '';
      const name = document.createElement('span');
      name.className = 'walker-mark-name';
      name.textContent = friend.spec.name;
      root.append(face, name);
      document.body.append(root);
      return root;
    });
    this.showScores();
  }

  /** Where each friend's walker is, a moment behind what their game says. */
  updateMates(now, dt) {
    const showing = ['countdown', 'playing', 'finishing'].includes(this.screen);
    const places = this.mates.map((mate) => mate.placeAt(now) ?? (mate.gone ? null : { index: 0, progress: 0, foot: null, lift: 0, wobble: 0, falling: false }));
    this.world.placeMates(places, dt);
    this.world.mates.forEach((shown, index) => {
      const mark = this.markMates[index];
      if (!mark) return;
      const at = shown.root.position;
      const seen = showing && shown.root.visible ? this.world.project(at.x, at.y + 2.6 + shown.lift, at.z) : null;
      mark.dataset.where = seen && !seen.behind ? 'on' : 'none';
      if (seen) mark.style.transform = `translate(${Math.round(seen.x)}px, ${Math.round(seen.y)}px)`;
    });
    if (this.walk && this.screen === 'playing') this.showScores();
  }

  /** Where this child's walker is, for friends' games, timed from "GO!". */
  sendWalker(now) {
    const { walk } = this;
    if (!this.friends.current || !walk) return;
    this.friends.sendMove('balancer', walkerMessage(walk), now - this.goAt);
  }

  /** Something from a friend's game: where their walker is. */
  fromFriend(id, message) {
    const mate = this.mates.find(({ friend }) => friend.id === id);
    if (mate?.hear(message, performance.now())) this.showScores();
  }

  /** Everyone's line, top right, with friends: the stars each has, together, or who's in front. */
  showScores() {
    const board = byElementId('rope-scores');
    const friendly = this.mates.length > 0;
    board.hidden = !friendly;
    if (!friendly || !this.walk) return;
    const rows = scoreRows(this.walk, this.mates, this.team);
    const key = `${this.team}:${rows.map(({ name, count }) => `${name}${count}`).join(',')}`;
    if (this.lastNumbers.scores === key) return;
    this.lastNumbers.scores = key;
    board.dataset.counts = this.team ? 'stars' : 'place';
    const items = rows.map(({ name, count: number, you }) => {
      const row = document.createElement('li');
      if (you) row.className = 'is-you';
      const who = document.createElement('span');
      who.textContent = name;
      const value = document.createElement('strong');
      value.textContent = String(number);
      row.append(who, value);
      return row;
    });
    if (this.team) {
      const all = document.createElement('li');
      all.className = 'is-all';
      const who = document.createElement('span');
      who.textContent = 'Together';
      const value = document.createElement('strong');
      value.textContent = String(teamStars(this.walk, this.mates));
      all.append(who, value);
      items.unshift(all);
    }
    board.replaceChildren(...items);
  }

  /** A friend has gone in the middle, and their walker with them. Everyone else crosses on. */
  friendGone(friend) {
    const mate = this.mates.find((each) => each.friend.id === friend.id);
    if (!mate) return;
    mate.gone = true;
    this.showScores();
  }

  /* ---------- every frame ---------- */

  frame(dt, now) {
    if (this.walk) {
      this.updateNew(dt);
      this.watchForNew();
    }
    if (this.mates.length) this.updateMates(now, dt);
    switch (this.screen) {
      case 'warmup':
        this.updateWarmup(dt, now);
        break;
      case 'countdown':
        this.updateCountdown(dt);
        break;
      case 'playing':
        this.updatePlaying(dt, now);
        break;
      case 'finishing':
        this.timer -= dt;
        if (this.timer <= 0) this.showFinish();
        break;
      default:
    }
  }
}

const choice = (name, value, words) => `<label><input type="radio" name="${name}" value="${value}"> ${words}</label>`;
// A footprint: the left one, which the page turns over for the right.
const FOOT = '<svg viewBox="0 0 40 64" aria-hidden="true"><path d="M19 62c-8 0-10-8-8-16 2-7-1-13-2-19-1-8 4-12 12-12s12 5 11 13c-1 8-3 13-3 20 0 8-2 14-10 14z" /><circle cx="27" cy="8" r="4.6" /><circle cx="18.5" cy="6.4" r="3.4" /><circle cx="11.8" cy="8.6" r="3" /><circle cx="6.8" cy="12.8" r="2.7" /><circle cx="4" cy="18.4" r="2.4" /></svg>';

mountBodyShell({
  title: 'Rooftop Rope',
  tagline: 'Ride the ropes between the rooftops! Stand on one leg, hold your foot up, and roll all the way across on your one wheel.',
  startLabel: 'Choose your walker',
  chooseTitle: 'Who’s walking the rope today?',
  chooseSide: `
      <p class="choose-tip">Lift one foot off the floor, and your walker rolls along the rope on its one wheel. Rest on every rooftop for as long as you like.</p>
      <button id="rope-start" class="big-button" type="button">Let’s cross!</button>`,
  hud: `
  <div id="rope-meter" class="rope-meter" data-zone="down" aria-hidden="true">
    <div class="meter-zone meter-zone-up"></div>
    <div class="meter-line"></div>
    <div id="meter-dot" class="meter-dot"></div>
  </div>
  <div id="feet" class="feet" data-ask="none" data-up="none" aria-hidden="true">
    <div class="foot foot-left">${FOOT}</div>
    <div class="foot foot-right">${FOOT}</div>
  </div>
  <div id="wobble" class="wobble" data-wobbling="false" aria-hidden="true"><div id="wobble-fill" class="wobble-fill"></div></div>
  <div id="warm-bar" class="warm-bar">
    <button id="warm-skip" class="soft-button" type="button">Skip the warm-up</button>
  </div>
  <header id="rope-top" class="rope-top">
    <div class="chip"><span class="chip-label">Ropes</span><span class="chip-value"><span id="ropes-done">0</span> / <span id="ropes-all">0</span></span></div>
    <div id="prizes-chip" class="chip" hidden><span class="chip-label">Prizes</span><span id="prizes" class="chip-value"></span></div>
  </header>
  <ol id="rope-scores" class="rope-scores" aria-label="Everyone’s line" hidden></ol>
  <div id="rope-new" class="rope-new" aria-hidden="true"></div>`,
  finishBody: `
      <h2 id="finish-title">You crossed them all!</h2>
      <p class="finish-hero"><span id="finish-crossed">0 ropes</span> on one leg</p>
      <p id="finish-line" class="finish-open"></p>
      <p id="finish-prizes" class="finish-prizes"></p>
      <div id="finish-tally" class="finish-tally"></div>
      <p class="small-print">These numbers are shown once and not saved.</p>
      <div class="finish-actions">
        <button id="cross-again" class="big-button" type="button">Cross again</button>
        <button id="other-walker" class="soft-button" type="button">Choose another walker</button>
        <a class="all-games" href="../../index.html">All games</a>
      </div>`,
  panelLead: 'The game is paused. The camera needs to see all of the child, feet too, standing up with their feet side by side. A hand on a chair, a wall or a grown-up for balance is fine: it’s the foot off the floor that counts. Keep something steady within reach, and stay close by.',
  handLegend: 'Side being worked on',
  safetyPrint: 'Standing on one leg, a child can lose their balance: please clear some space, put a steady chair or a wall within reach to hold on to, and stay close by.',
  panelSettings: `
    <fieldset class="choice">
      <legend>Which foot lifts</legend>
      ${choice('ropeLeg', 'turns', 'Taking turns: one rope on each leg')}
      ${choice('ropeLeg', 'stand', 'Always standing on the leg being worked on, and lifting the other foot')}
      ${choice('ropeLeg', 'lift', 'Always lifting the foot of the leg being worked on')}
      ${choice('ropeLeg', 'any', 'Whichever foot the child likes')}
    </fieldset>
    <fieldset class="choice">
      <legend>How high a whole lift is, at most, as a share of the child’s height. It’s never more than most of this child’s own lift with that foot, as measured in the warm-up, and ${Math.round(LIFT.unmeasured * 100)}% if the warm-up is skipped. The walker goes once the foot is ${Math.round(WALK.on * 100)}% of the way there, and fastest at all of it</legend>
      ${choice('ropeLift', 'tiny', `Just off the floor: ${Math.round(LIFT.full.tiny * 100)}% of their height`)}
      ${choice('ropeLift', 'small', `A little: ${Math.round(LIFT.full.small * 100)}%`)}
      ${choice('ropeLift', 'medium', `Medium: ${Math.round(LIFT.full.medium * 100)}%, about half way up the shin`)}
      ${choice('ropeLift', 'big', `High: ${Math.round(LIFT.full.big * 100)}%, towards the knee`)}
    </fieldset>
    <fieldset class="choice">
      <legend>How long a rope takes with the foot at a whole lift, at level 1</legend>
      ${choice('ropeHold', 'short', `Short: ${HOLDS.short} seconds`)}
      ${choice('ropeHold', 'medium', `Medium: ${HOLDS.medium} seconds`)}
      ${choice('ropeHold', 'long', `Long: ${HOLDS.long} seconds`)}
    </fieldset>
    <fieldset class="choice">
      <legend>Ropes in a game</legend>
      ${ROPE_COUNTS.map((count) => choice('ropeCount', count, `${count} ropes`)).join('\n      ')}
    </fieldset>
    <fieldset class="choice">
      <legend>Standing on the rope with both feet down, the walker wobbles and then drops into the net, to start that rope again</legend>
      ${choice('ropeFall', 'soon', `After ${WOBBLES.soon} seconds`)}
      ${choice('ropeFall', 'later', `After ${WOBBLES.later} seconds`)}
      ${choice('ropeFall', 'never', 'Never: the walker waits on the rope for as long as it takes')}
    </fieldset>
    <fieldset class="choice">
      <legend>With friends</legend>
      ${choice('ropeFriends', 'together', 'Together: everyone crosses side by side, waiting for each other on every rooftop')}
      ${choice('ropeFriends', 'against', 'Against each other: a race to the last rooftop')}
    </fieldset>`,
});

// Checked here so that a mistake in the roster shows up as soon as the page loads.
if (!ROSTER.length) console.error('No walkers');

new RooftopRope().start();
