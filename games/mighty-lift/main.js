// Mighty Lift: someone is stuck under something heavy, and the child lifts it off them by raising an arm. The
// weight goes as high as the arm does, and held up for a moment, the friend scrambles free. It's the game about
// raising the arm, to the shoulder and on above the head, and holding it there. This file runs it from start to
// finish, on top of what the body games share in core/body/game.js. The rules are in lift.js and the yard is
// in world.js.
//
// Friends can lift together, each on their own computer: everyone on one big weight, each arm adding its share,
// or each freeing their own friends, to see who frees the most.
import { BODY_KEYS, bodyFrom, bodyList } from '../../core/body/characters.js';
import { BODY_SAY, BodyGame, byElementId } from '../../core/body/game.js';
import { SO_CLOSE } from '../../core/sound.js';
import { ROSTER, byId as characterById } from '../../core/body/roster.js';
import { mountBodyShell } from '../../core/body/shell.js';
import { seededRandom } from '../../core/friends.js';
import { FriendsPanel } from '../../core/friends-ui.js';
import { Arms, HEIGHTS, HOLDS, LIFT_COUNTS, Lifting, Warmup, armHeights, newAt as newAtLevel, thingsUpTo } from './lift.js';
import { LiftSound } from './lift-sound.js';
import { Mate, armMessage, finishMessage, mateArms, scoreRows, someoneFreedAll } from './team.js';
import { World } from './world.js';

const AFTER_FINISH_SECONDS = 2.4;
const COUNT_FROM = 3;
const GO_SHOWN_SECONDS = 0.9;
const READY_SECONDS = 1.1;
const METER_MOST = 1.12; // The meter's top, as a share of a lift that counts.
const NEW_SHOWN_SECONDS = 2.6; // How long something new is pointed out, the first time it comes.
const NEW_GAP_SECONDS = 0.35;
const HELPER_STAYS_MS = 900; // A helper waves goodbye for a moment before going.
// The picture needs room above the shoulders for the arm to go up into: as high as a grown-up chose, and this
// much more, in torso lengths, as a star hangs a little above the line.
const ROOM_ABOVE_LINE = 0.35;
const ROOM_EDGE = 0.02; // And that far inside the top of the picture.

// liftClock is whether the lifts have to be done before sunset: 'yes', or 'no' for the gentle game, as it was.
const DEFAULTS = { moveSize: 'small', liftHeight: 'shoulder', liftWith: 'play', liftHold: 'medium', lifts: 8, liftFriends: 'together', liftClock: 'yes', fighter: 'giraffe' };
const CHOICES = { liftHeight: String, liftWith: String, liftHold: String, lifts: Number, liftFriends: String, liftClock: String };

// Lifting with friends, each on their own computer: see core/friends-ui.js for what each of these is.
const LIFT_WORDS = {
  toggle: 'Play with friends',
  make: 'Make a game',
  codeLabel: 'A friend’s game code',
  codeName: 'Game code',
  how: 'Tell your friends the code. Then you all choose a lifter and press <b>Let’s lift!</b>, and see who frees the most friends.',
  // Together or against each other, as whoever made the game chooses: see teams in core/friends-ui.js.
  teamLegend: 'How to play',
  together: 'Together',
  against: 'Against each other',
  howTogether: 'Tell your friends the code. Then you all choose a lifter and press <b>Let’s lift!</b>, and lift one big weight together.',
  teamTitle: 'You lifted it together!',
  leave: 'Leave this game',
  privacy: 'Only your name, who you lift as, whether you chose together or against each other, how far up your arm is and how your lifter stands go to your friends. The camera picture stays on this computer.',
  alone: 'Play on your own',
  full: 'That game already has 4 players.',
  lost: 'Can’t reach the game. Check the internet, then try again.',
  left: 'You’ve left the game.',
  badCode: 'A game code is 3 letters and numbers.',
  busy: 'Lifting',
  still: 'still lifting',
};
const CLAIM_ANSWER_MS = 1500; // A rescue told to the server with no answer, as when it can't be reached, stands.

// Every one of these has a rendered voice file: see audio/voice/lines.json.
const SAY = {
  choose: 'Who’s lifting today?',
  mission: 'Lift it up and set them free!',
  warmOne: 'Raise your arm as high as you can!',
  warmBoth: 'Raise both arms as high as you can!',
  ready: 'That’s it! You’re ready!',
  lift: 'Lift it up!',
  both: 'Lift with both arms!',
  higher: 'A little higher!',
  hold: 'Hold it up!',
  down: 'Now put it down gently.',
  again: 'Arm down, then lift again!',
  allFree: 'You set them all free!',
};
// What each friend says as they get out, in their own voice.
const THANKS = {
  giraffe: 'Thank you! You’re so strong!',
  truffle: 'Oink! I’m free!',
  kit: 'Thank you, strong friend!',
  mochi: 'Hooray! I can hop again!',
  widget: 'Beep boop! Thank you!',
  frost: 'Brr! That was heavy!',
  bramble: 'A big bear thank you!',
  nova: 'Meow! You’re a star!',
  cinder: 'Phew! Thank you!',
  tur: 'What a lift! Thank you!',
};
// The moment a lift is seen, the child is told so, as words on the screen.
const SEEN_WORDS = { lift: ['You lifted it!', 'ასწიე!'], free: ['Free!', 'თავისუფალია!'] };
// What a hint asks for, and whether the character shows it.
const HINTS = {
  lift: { text: SAY.lift, film: true },
  both: { text: SAY.both, film: true },
  higher: { text: SAY.higher, film: true },
  hold: { text: SAY.hold, film: true },
  down: { text: SAY.down, film: false },
  again: { text: SAY.again, film: false },
};
const DUCK = '🦆';
const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

class MightyLift extends BodyGame {
  constructor() {
    super({
      defaults: DEFAULTS,
      choices: CHOICES,
      // These go on to a game that's being played at once. The rest, and the level, start it again.
      atOnce: ['liftHeight', 'liftWith'],
      lines: new URL('./audio/voice/lines.json', import.meta.url),
      createSound: (options) => new LiftSound(options),
    });
    this.lifting = null;
    this.warmup = null;
    this.practised = false;
    this.timer = 0;
    this.countLeft = 0;
    this.readyLeft = 0;
    this.readAt = null;
    this.liftsToday = 0; // Since the page was opened. Never kept.
    this.lastNumbers = {};
    this.mates = [];
    this.markMates = [];
    this.asked = new Map(); // Rescues told to the server, with friends, by number: when.
    this.newShown = new Set();
    this.newQueue = [];
    this.newLeft = 0;
    this.newGap = 0;
    this.filmFor = null;
  }

  /** What a level brings that's new, for the cards: see NEW_THINGS in lift.js. */
  newAt(level) {
    return newAtLevel(level);
  }

  /** The child's hands that hold the weight: the arm being worked on, the other, or both. */
  get liftSides() {
    return this.arms.sides;
  }

  /** The film that shows the move, and which side it's on. */
  get film() {
    return { demo: this.arms.both ? 'liftBoth' : 'lift', side: this.arms.sides[0] };
  }

  setUp() {
    // Head, shoulders and arms are enough, so it can be played sitting down. The shared check's room for arms
    // held out is all it asks above the head: how much this game needs is worked out from the child's own
    // size, in roomToLift.
    this.upperBodyOnly = true;
    this.armsOut = true;
    this.reader.upperBodyOnly = true;
    const { settings } = this;
    this.arms = new Arms({ side: settings.hands, liftWith: settings.liftWith, height: settings.liftHeight });
    this.world = new World(byElementId('game'));
    this.stage = this.world;
    this.world.setView('choose', { snap: true });

    byElementId('start').addEventListener('click', () => {
      this.sound.unlock();
      this.setScreen('choose');
      this.sound.ready.then(() => {
        if (this.screen === 'choose') this.sound.say(SAY.choose);
      });
    });
    byElementId('lift-start').addEventListener('click', () => this.openCameraThen(() => this.beginBodyCheck()));
    byElementId('lift-again').addEventListener('click', () => this.liftAgain());
    byElementId('other-lifter').addEventListener('click', () => {
      this.confetti.stop();
      this.world.setGame(null);
      this.world.setLive(null);
      this.world.lifter.presenting = true;
      this.world.setView('choose');
      this.setScreen('choose');
    });
    byElementId('warm-skip').addEventListener('click', () => this.warmup?.finish(false));
    // Lifting with friends, if a grown-up makes or joins a game.
    this.friends = new FriendsPanel({
      game: 'mighty-lift',
      linkKey: 'lift',
      words: LIFT_WORDS,
      hello: () => ({ driver: this.chosen?.id ?? settings.fighter, level: this.levels.current, length: settings.lifts, mode: settings.liftHold }),
      screen: () => this.screen,
      portraits: () => this.portraits,
      onGone: (friend) => this.friendGone(friend),
      onMove: (id, message) => this.fromFriend(id, message),
      // Whoever freed the most friends. Equal ones share a place.
      rank: (a, b) => b.dropped - a.dropped,
      resultText: ({ dropped }) => (this.team ? plural(dropped, 'lift') : `${plural(dropped, 'friend')} freed`),
      titles: { first: 'You freed the most friends!', other: 'Great lifting!' },
      // Together or against each other: the grown-ups' choice, which the friends box can change too.
      teams: {
        get: () => (settings.liftFriends === 'against' ? 'against' : 'together'),
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
      arms: this.arms,
      get lifting() {
        return game.lifting;
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
    this.changeSettings({ liftFriends: choice });
    const input = document.querySelector(`input[name="liftFriends"][value="${choice}"]`);
    if (input) input.checked = true;
  }

  settingChanged(change) {
    const { settings } = this;
    if ('hands' in change || 'liftWith' in change) {
      this.arms.setArms(settings.hands, settings.liftWith);
      // Another arm has its own reach, so the warm-up comes again.
      this.practised = false;
      this.world.lifter?.setWeight(this.liftSides, this.lifting?.levelNumber ?? this.level);
    }
    if ('liftHeight' in change) this.arms.setHeight(settings.liftHeight);
    if ('liftFriends' in change && this.friends) {
      if (this.friends.room.inRoom) this.friends.room.tell(this.friends.hello());
      this.friends.showTeams();
    }
  }

  showChosen(spec) {
    this.world.setLifter(spec);
    this.world.lifter.setWeight(this.liftSides, this.level);
    // Friends see who this child lifts as.
    if (this.friends?.room.inRoom) this.friends.room.tell(this.friends.hello());
  }

  /* ---------- the body ---------- */

  /**
   * Each time the tracker has looked at the child: how high each wrist is above its shoulder, which is all
   * this game reads. The body reader's own moves, like a jump or a clap, mean nothing here.
   */
  onMoves(moves, now) {
    const dt = this.readAt === null ? 1 / 30 : Math.min(0.1, Math.max(0.001, now - this.readAt));
    this.readAt = now;
    const heights = armHeights(this.latestBody, this.reader.torsoSize);
    if (this.screen === 'warmup' && this.warmup) this.warmup.update(heights, dt);
    else this.arms.update(heights, dt);
  }

  /**
   * Whether there's room in the picture, above the shoulders, for the arm to go as high as it's asked to. It
   * goes by the child's own size, so a child a long way off needs less of the picture than one close by.
   */
  roomToLift() {
    const body = this.latestBody;
    const torso = this.reader.torsoSize;
    if (!body || !(torso > 0)) return true;
    const shoulders = Math.min(body.image[11].y, body.image[12].y);
    const room = Math.max(0, (HEIGHTS[this.settings.liftHeight] ?? 0) + ROOM_ABOVE_LINE);
    return shoulders - room * torso >= ROOM_EDGE;
  }

  /** The shared check that the camera can see the child, and then that there's room for the arm to go up. */
  updateBodyCheck(dt, now) {
    if (this.latestBody && !this.roomToLift()) {
      this.checkHeld = 0;
      byElementId('camera-frame').dataset.ready = 'not-open';
      byElementId('check-progress-fill').style.width = '0%';
      this.prompt.show({ key: 'step-back', text: BODY_SAY.stepBack, side: null }, now);
      return;
    }
    super.updateBodyCheck(dt, now);
  }

  /** Nobody in the picture: the arms aren't seen, so a weight that was up comes down gently by itself. */
  armsUnseen(dt) {
    this.arms.update({ left: null, right: null }, dt);
    this.world.setLive(null);
  }

  /** What the panel says the camera can see, so a grown-up can tell why a lift isn't counting. */
  showLiveReading() {
    const now = performance.now();
    if (now - (this.panelAt ?? 0) < 200) return;
    this.panelAt = now;
    const { arms, reader } = this;
    const seeing = reader.seen ? 'someone' : 'nobody';
    const percent = (value) => `${Math.round(value * 100)}%`;
    const each = arms.sides.map((side) => {
      const arm = arms[side];
      const state = arm.seen ? `${percent(arm.lift)} of the way up to its line` : 'not in view';
      const eased = arm.eased === null ? '' : ', which has come down to meet it';
      return `The ${side} arm is ${state}${eased}.`;
    });
    byElementId('live-reading').textContent = `The camera sees ${seeing}. ${each.join(' ')} A lift counts from 100%, held for ${(this.lifting?.holdSeconds ?? HOLDS[this.settings.liftHold]).toFixed(1)} seconds.`;
  }

  /** The marker on the meter: resting at the bottom, and a lift that counts in the green at the top. */
  updateMeter(value) {
    const shown = Math.round(Math.min(METER_MOST, Math.max(0, value || 0)) * 100);
    if (this.lastNumbers.meter === shown) return;
    this.lastNumbers.meter = shown;
    byElementId('meter-dot').style.bottom = `${9 + shown * 0.8}%`;
    byElementId('lift-meter').dataset.zone = shown >= 100 ? 'up' : 'middle';
  }

  /* ---------- the warm-up ---------- */

  afterBodyCheck(then) {
    if (then === 'resume') {
      this.world.setView('play');
      this.setScreen('playing');
    } else if (this.practised) this.beginCountdown();
    else this.beginWarmup();
  }

  /** Before the first game, the child raises the arm as high as it goes, and that's what its line is set from. */
  beginWarmup() {
    const { world } = this;
    world.setGame(null);
    world.lifter.presenting = false;
    world.lifter.setWeight(this.liftSides, this.level);
    world.setView('warmup');
    this.lastNumbers = {};
    this.readyLeft = 0;
    this.setScreen('warmup');
    this.warmup = new Warmup({ arms: this.arms, onEvent: (event) => this.onWarmEvent(event) });
    const text = this.arms.both ? SAY.warmBoth : SAY.warmOne;
    const { demo, side } = this.film;
    this.showCoach(demo, this.translate(text), { side });
    this.sound.say(text);
  }

  onWarmEvent({ type }) {
    if (type !== 'measured') {
      this.endWarmup();
      return;
    }
    this.hideCoach();
    this.showSeen(SEEN_WORDS.lift, { x: 0.26, y: 0.45 });
    this.sound.say(SAY.ready);
    this.readyLeft = READY_SECONDS;
  }

  updateWarmup(dt, now) {
    if (this.readyLeft > 0) {
      this.readyLeft -= dt;
      if (this.readyLeft <= 0) this.endWarmup();
      return;
    }
    if (this.bodyLost()) {
      this.armsUnseen(dt);
      this.prompt.show({ key: 'come-back', text: BODY_SAY.comeBack, side: null }, now);
      return;
    }
    const { arms, warmup, reader } = this;
    this.world.setLive(reader.hasPose ? reader.pose : null);
    this.world.setLift(arms.lift, { left: arms.left.lift, right: arms.right.lift });
    this.setCoachEffort(Math.min(1, warmup.share));
    this.updateMeter(warmup.share);
    this.prompt.show(arms.both && arms.oneSided ? { key: 'both', text: SAY.both, side: null } : null, now);
  }

  endWarmup() {
    this.warmup = null;
    this.practised = true;
    this.hideCoach();
    this.prompt.clear();
    this.beginCountdown();
  }

  /* ---------- a game ---------- */

  /** Ready to lift. With friends, everyone waits for the others first, and then all count down together. */
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
    // With friends, everyone plays the host's game: their level, how many lifts, and how long a hold is, laid
    // out from the same seed. It doesn't move anyone's own level on, and each child keeps their own arm and line.
    const friendly = this.friends.current;
    this.team = Boolean(friendly?.team);
    document.body.toggleAttribute('data-friends-race', Boolean(friendly));
    document.body.toggleAttribute('data-friends-team', this.team);
    const levelNumber = friendly ? friendly.level : this.startLevel();
    this.lifting = new Lifting({
      level: levelNumber,
      lifts: friendly && LIFT_COUNTS.includes(friendly.length) ? friendly.length : settings.lifts,
      hold: friendly && HOLDS[friendly.mode] ? friendly.mode : settings.liftHold,
      // With friends, the same friends are under the same things on every screen, whoever each child lifts as.
      lifter: friendly ? null : this.chosen.id,
      random: friendly ? seededRandom(friendly.seed) : Math.random,
      plain: Boolean(friendly),
      team: this.team ? { size: friendly.friends.length + 1 } : null,
      reach: this.arms.reach,
      gentle: settings.liftClock === 'no',
      onEvent: (event) => this.onLiftEvent(event),
    });
    document.body.dataset.sunset = this.lifting.timeLeft === null ? 'no' : 'yes';
    this.setUpMates(friendly);
    // Wherever the arm is as the countdown starts is where it rests, unless it's held up: a bent arm rests
    // higher than one that hangs, and lifting is measured from there.
    this.arms.restHere(0.8);
    world.lifter.presenting = false;
    world.lifter.setWeight(this.liftSides, levelNumber);
    world.setGame(this.lifting);
    // The first friend is already there, stuck, while it counts down.
    world.arrive(this.lifting.rescues[0]);
    world.setLive(null);
    world.setView('play');
    this.newShown = new Set();
    this.newQueue = [];
    this.newLeft = 0;
    this.newGap = 0;
    byElementId('lift-new').classList.remove('is-showing');
    byElementId('freed-row').replaceChildren();
    this.lastNumbers = {};
    this.filmFor = null;
    this.asked = new Map();
    this.hideCoach();
    this.updateHud();
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
    this.sound.startYard();
    this.timer = GO_SHOWN_SECONDS;
    this.setScreen('playing');
    this.lifting.begin();
    // The mission, in one line, and the film of the move until the first lift.
    this.sound.say(SAY.mission);
    this.showFilm('lift');
  }

  /** The character showing the move, with what's asked for under it. */
  showFilm(hint) {
    if (this.filmFor === hint) return;
    this.filmFor = hint;
    const { demo, side } = this.film;
    this.showCoach(demo, this.translate(HINTS[hint].text), { side });
  }

  hideFilm() {
    if (this.filmFor === null) return;
    this.filmFor = null;
    this.hideCoach();
  }

  updatePlaying(dt, now) {
    const { lifting, arms, reader, world } = this;
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) this.setCount('');
    }
    const mates = mateArms(this.mates, now);

    // Nobody in the picture: a weight that was up comes down gently, and everything else waits.
    if (this.bodyLost()) {
      this.armsUnseen(dt);
      lifting.update(dt, arms.lift, mates, { seen: false });
      this.prompt.show({ key: 'come-back', text: BODY_SAY.comeBack, side: null }, now);
      this.sound.strain(0);
      this.sendLifter(now);
      return;
    }

    lifting.span = arms.span;
    world.setLive(reader.hasPose ? reader.pose : null);
    world.setLift(arms.lift, { left: arms.left.lift, right: arms.right.lift });
    // A child who's trying and not getting there: the line comes down to meet them.
    if (lifting.phase === 'lifting' && !lifting.mustLower && arms.tried(dt)) lifting.stats.eased += 1;
    const before = lifting.height;
    lifting.update(dt, arms.lift, mates);
    if (lifting.state === 'finished') return;

    // The rope creaks while the weight is moving on it.
    this.sound.strain(lifting.height > 0.05 ? 0.25 + Math.min(1, Math.abs(lifting.height - before) / Math.max(dt, 0.001)) * 0.75 : 0);
    const hint = arms.both && arms.oneSided && !lifting.up ? 'both' : lifting.hint;
    this.prompt.show(hint ? { key: hint, text: HINTS[hint].text, side: null } : null, now);
    if (hint && HINTS[hint].film) this.showFilm(hint);
    // The bar under the film fills as the arm gets near its line.
    if (this.filmFor) this.setCoachEffort(Math.min(1, arms.lift));
    this.updateMeter(arms.lift);
    this.updateHud();
    this.sendLifter(now);
    this.settleUnanswered();
    // Against each other, the game is over for everyone once someone has freed all of theirs.
    if (this.friends.current && !this.team && someoneFreedAll(this.friends.results)) lifting.finish();
  }

  updateHud() {
    const { lifting, lastNumbers } = this;
    const { stats } = lifting;
    const set = (key, value, id) => {
      if (lastNumbers[key] === value) return;
      lastNumbers[key] = value;
      byElementId(id).textContent = String(value);
    };
    set('done', Math.min(lifting.liftsDone, lifting.liftsPlanned), 'lifts-done');
    set('planned', lifting.liftsPlanned, 'lifts-all');
    set('today', this.liftsToday, 'lifts-today');
    // The time before sunset, and whether it's waiting for a resting arm.
    if (lifting.timeLeft !== null) {
      const seconds = Math.ceil(lifting.timeLeft);
      set('sunset', `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`, 'sunset');
      const share = Math.round((lifting.timeLeft / lifting.timeAll) * 100);
      if (lastNumbers.sunShare !== share) {
        lastNumbers.sunShare = share;
        byElementId('sunset-fill').style.width = `${share}%`;
      }
      const waits = lifting.clockWaits ? 'yes' : 'no';
      if (lastNumbers.waits !== waits) {
        lastNumbers.waits = waits;
        byElementId('sunset-chip').dataset.waits = waits;
      }
    }
    // Prizes, from the levels that have them, each with its little picture.
    const prizes = [['⭐', stats.stars, lifting.rules.star && !lifting.plain], ['🪶', stats.feathers, lifting.rules.owl && !lifting.plain], ['🍯', stats.honey, lifting.rules.hive && !lifting.plain]].filter(([, , has]) => has);
    const words = prizes.map(([mark, count]) => `${mark} ${count}`).join('  ');
    if (lastNumbers.prizes !== words) {
      lastNumbers.prizes = words;
      byElementId('prizes-chip').hidden = !prizes.length;
      byElementId('prizes').textContent = words;
    }
  }

  /* ---------- what's new at this level ---------- */

  /**
   * The first time something this level brings comes along, it's pointed out with a small label at the top, for
   * a moment, with no talking. Several at once take turns.
   */
  pointOutNew(id) {
    const { lifting } = this;
    if (!lifting || lifting.plain || this.newShown.has(id)) return;
    const thing = thingsUpTo(lifting.levelNumber).find((one) => one.id === id);
    if (!thing) return;
    this.newShown.add(id);
    this.newQueue.push(thing);
    if (this.newLeft <= 0 && this.newGap <= 0) this.showNextNew();
  }

  showNextNew() {
    const label = byElementId('lift-new');
    const thing = this.newQueue.shift();
    if (!thing) return;
    const georgian = this.settings.language === 'ka';
    label.innerHTML = `<span class="lift-new-lead">${georgian ? 'ახალი:' : 'New:'}</span><span class="lift-new-mark">${thing.mark}</span>${georgian ? thing.nameKa : thing.name}`;
    label.dataset.thing = thing.id;
    label.classList.add('is-showing');
    this.newLeft = NEW_SHOWN_SECONDS;
  }

  /** The label's time goes with the game's, so it waits while the grown-ups' panel is open. */
  updateNew(dt) {
    if (this.newLeft > 0) {
      this.newLeft -= dt;
      if (this.newLeft > 0) return;
      byElementId('lift-new').classList.remove('is-showing');
      this.newGap = NEW_GAP_SECONDS;
      return;
    }
    if (this.newGap <= 0) return;
    this.newGap -= dt;
    if (this.newGap <= 0) this.showNextNew();
  }

  /* ---------- what happened ---------- */

  onLiftEvent(event) {
    const handlers = {
      arrive: () => this.onArrive(event),
      lift: () => this.onLift(),
      up: () => this.onUp(),
      part: () => this.onDuckling(event),
      notch: () => this.onNotch(event),
      star: () => this.onPrize('⭐', this.world.star.position),
      freed: () => this.onFreed(event),
      settle: () => this.arms.restHere(0.8),
      down: () => this.onDown(event),
      feather: () => this.onPrize('🪶', this.world.owl.position, 1.3),
      woke: () => this.onWoke(),
      honey: () => this.onPrize('🍯', this.world.pot.position, 0.9),
      balloons: () => this.onBalloons(),
      helper: () => this.onHelper(event),
      'helper-gone': () => setTimeout(() => this.world.setHelper(this.lifting?.helper ?? null), HELPER_STAYS_MS),
      trophy: () => this.onTrophy(),
      resting: () => this.sound.say(BODY_SAY.waiting, { ifQuiet: true }),
      finished: () => this.onFinished(),
    };
    handlers[event.type]?.();
  }

  /** The next friend in need. What's new about them is pointed out, the newest first. */
  onArrive({ rescue }) {
    this.world.arrive(rescue);
    const ids = [rescue.kind, rescue.hive && 'hive', rescue.owl && 'owl', rescue.star && 'star'].filter(Boolean);
    const newest = thingsUpTo(this.lifting.levelNumber).map(({ id }) => id).reverse();
    for (const id of newest.filter((each) => ids.includes(each))) this.pointOutNew(id);
  }

  /**
   * The arm has gone up to its line: one more lift, on the yard's sign and at the top. With friends on one big
   * weight, that's this child's share done, whether or not the weight is up yet, so it's said now.
   */
  onLift() {
    this.liftsToday += 1;
    this.world.setLiftsToday(this.liftsToday);
    this.arms.made();
    if (this.team) this.sawLift();
  }

  /** The weight is up at the line. */
  onUp() {
    if (!this.team) this.sawLift();
  }

  /** The child is told the lift was seen, in words, with a chime and a green frame round their picture. */
  sawLift() {
    this.hideFilm();
    this.showSeen(SEEN_WORDS.lift, { x: 0.36, y: 0.22 });
    this.sound.up();
  }

  onDuckling({ n, of }) {
    this.sound.duckling();
    this.callout(`${DUCK} ${n} / ${of}`, { kind: 'is-number', x: 0.6, y: 0.62 });
  }

  onNotch({ n, of }) {
    this.world.notch();
    this.sound.notch();
    if (n < of) this.callout(`${n} / ${of}`, { kind: 'is-number', x: 0.7, y: 0.5 });
  }

  /** A prize: a star, a feather or honey. A few small shapes where it was, and one more at the top. */
  onPrize(mark, from, rate = 1.1) {
    const at = this.world.project(from.x, from.y, from.z);
    if (mark === '⭐') this.world.starTaken();
    else this.world.prize(from, mark === '🍯' ? ['#ffc93c', '#ffe27a'] : ['#f7f2e6', '#c9a37a'], mark === '🍯' ? 'honey' : 'leaf');
    this.sound.prize(rate);
    this.callout(`+1 ${mark}`, { kind: 'is-number', x: at.x / innerWidth, y: at.y / innerHeight });
  }

  /** A friend is free: they say so, in their own voice, and their face joins the row of friends freed. */
  onFreed({ rescue, index }) {
    this.world.freed();
    this.sound.freed();
    this.hideFilm();
    this.callout(this.settings.language === 'ka' ? SEEN_WORDS.free[1] : SEEN_WORDS.free[0], { kind: 'is-big', x: 0.6, y: 0.4 });
    const thanks = THANKS[rescue.friend];
    if (thanks) this.sound.say(thanks, { ifQuiet: true });
    const face = document.createElement('li');
    if (rescue.friend === 'ducks') face.textContent = DUCK;
    else {
      const picture = document.createElement('img');
      picture.alt = '';
      picture.src = this.portraits[rescue.friend] ?? '';
      face.append(picture);
    }
    byElementId('freed-row').append(face);
    this.updateHud();
    // With friends on one weight, the server tells everyone that this one is done.
    if (this.team && this.friends.current) {
      this.asked.set(index, performance.now());
      this.friends.claim(index);
    }
    this.showScores();
  }

  onDown({ gentle }) {
    this.world.setDown(gentle);
    this.sound.down(gentle);
    this.sound.strain(0);
  }

  onWoke() {
    this.world.owlWoke();
    this.sound.owlOff();
  }

  onBalloons() {
    this.pointOutNew('balloons');
    this.sound.prize(1.3);
    this.callout('🎈', { kind: 'is-number', x: 0.66, y: 0.3 });
  }

  onHelper({ friend }) {
    this.world.setHelper(friend);
    this.pointOutNew('helper');
  }

  onTrophy() {
    this.world.showTrophy();
    this.sound.trophy();
    this.callout('🏆', { kind: 'is-number', x: 0.62, y: 0.5 });
  }

  onFinished() {
    const { world, sound, lifting } = this;
    // Friends' finish cards fill in with how this child did: lifts, on one weight together, or friends freed.
    if (this.friends.current) this.friends.finished(performance.now() - this.goAt, finishMessage(lifting, this.team));
    world.setLive(null);
    this.camera.stop();
    this.reader.forget();
    this.latestBody = null;
    this.readAt = null;
    this.hideFilm();
    this.prompt.clear();
    this.setCount('');
    this.updateHud();
    sound.strain(0);
    sound.stopYard();
    // The sun set first: no celebration, and the voice says what it says after any game that was lost.
    if (lifting.lost) {
      sound.finish(SO_CLOSE, { lost: true });
    } else {
      sound.finish(SAY.allFree);
      world.celebrate();
    }
    this.timer = AFTER_FINISH_SECONDS;
    this.setScreen('finishing');
  }

  showFinish() {
    const { lifting } = this;
    const { stats } = lifting;
    byElementId('finish-freed').textContent = plural(stats.freed, 'friend');
    byElementId('finish-lifts').textContent = plural(stats.lifts, 'lift');
    byElementId('finish-faces').replaceChildren(...[...byElementId('freed-row').children].map((face) => face.cloneNode(true)));
    const held = Math.round(stats.heldSeconds);
    const longest = Math.round(stats.longestHold * 10) / 10;
    const eased = stats.eased ? ' The line came down a little, to meet how high the arm goes.' : '';
    byElementId('finish-line').textContent = `${this.chosen.name} held it up for ${plural(held, 'second')} in all, and the longest hold was ${longest} seconds.${eased}`;
    byElementId('finish-prizes').textContent = this.prizeWords();
    this.fillTallyCards(byElementId('finish-tally'), [
      { name: 'lifts', icon: this.arms.both ? 'skyReach' : 'handUp', label: 'Lifts', value: stats.lifts },
      { name: 'longest', icon: 'skyReach', label: 'Longest hold, seconds', value: longest },
      { name: 'today', icon: 'starJump', label: 'Lifts today', value: this.liftsToday },
    ]);
    // A game with everyone freed moves on a level, and one where the sun set first stays on it. With friends
    // it's the host's level, so it doesn't move anyone's own level on.
    const { lost } = lifting;
    if (this.friends.current) {
      this.levels.last = null;
      this.levelUi.refresh();
    } else {
      this.finishLevel(!lost);
    }
    this.friends.showResults();
    if (lost) {
      const stuck = lifting.rescues.length - stats.freed;
      byElementId('finish-title').textContent = 'The sun has set!';
      byElementId('finish-line').textContent = `${this.chosen.name} freed ${stats.freed} of ${plural(lifting.rescues.length, 'friend')} before sunset, and ${stuck === 1 ? 'one is' : `${stuck} are`} still waiting. Have another go!`;
      byElementId('lift-again').textContent = 'Try again';
    } else this.confetti.start();
    this.setScreen('finish');
  }

  /** What else was won, in words, from what this level has. Nothing at level 1. */
  prizeWords() {
    const { stats, plain } = this.lifting;
    if (plain) return '';
    const parts = [];
    if (stats.starsHung) parts.push(`caught ${stats.stars} of ${plural(stats.starsHung, 'star')}`);
    if (stats.ducklings) parts.push(`freed ${plural(stats.ducklings, 'duckling')}`);
    if (stats.owls) parts.push(`put ${stats.feathers} of ${plural(stats.owls, 'owl')} down still asleep`);
    if (stats.hives) parts.push(`held steady for ${stats.honey} of ${plural(stats.hives, 'pot')} of honey`);
    if (stats.trophy) parts.push('won the trophy');
    if (!parts.length) return '';
    const last = parts.pop();
    const words = parts.length ? `${parts.join(', ')} and ${last}` : last;
    return `${words[0].toUpperCase()}${words.slice(1)}.`;
  }

  /**
   * What a round leaves going, stopped when a grown-up's change in the panel starts the game again: see
   * startAgain in core/body/game.js.
   */
  leaveRound() {
    this.sound.strain(0);
    this.sound.stopYard();
  }

  liftAgain() {
    this.confetti.stop();
    this.reader.forget();
    this.openCameraThen(() => this.beginBodyCheck());
  }

  /* ---------- with friends ---------- */

  /** Friends' lifters, each following what their own game sends, and their names over them. */
  setUpMates(friendly) {
    this.mates = (friendly?.friends ?? []).map((friend) => new Mate(friend));
    this.world.setMates(this.mates.map(({ friend }) => friend.spec), { level: friendly?.level ?? 1, team: this.team });
    for (const mark of this.markMates) mark.remove();
    this.markMates = this.mates.map(({ friend }) => {
      const root = document.createElement('div');
      root.className = 'lifter-mark';
      root.dataset.where = 'none';
      const face = document.createElement('img');
      face.className = 'lifter-mark-face';
      face.alt = '';
      face.src = this.portraits[friend.spec.id] ?? '';
      const name = document.createElement('span');
      name.className = 'lifter-mark-name';
      name.textContent = friend.spec.name;
      root.append(face, name);
      document.body.append(root);
      return root;
    });
    this.showScores();
  }

  /** Where each friend's lifter is and what it's doing, a moment behind what their game says. */
  updateMates(now) {
    const showing = ['countdown', 'playing', 'finishing'].includes(this.screen);
    this.world.placeMates(this.mates.map((mate) => {
      if (mate.gone) return null;
      const body = mate.bodyAt(now);
      return { lift: mate.armAt(now).lift, live: body.length === BODY_KEYS.length ? bodyFrom(body) : null };
    }));
    this.world.mates.forEach((shown, index) => {
      const mark = this.markMates[index];
      if (!mark) return;
      const at = shown.body.root.position;
      const seen = showing && !shown.gone ? this.world.project(at.x, 2.35 + shown.spec.build.neck * 0.9, at.z) : null;
      mark.dataset.where = seen && !seen.behind ? 'on' : 'none';
      if (seen) mark.style.transform = `translate(${Math.round(seen.x)}px, ${Math.round(seen.y)}px)`;
    });
  }

  /** How far up this child's arm is, and their body, for friends' games, timed from "GO!". */
  sendLifter(now) {
    const { lifting, arms, reader } = this;
    if (!this.friends.current || !lifting) return;
    const since = now - this.goAt;
    this.friends.sendMove('lifter', armMessage(lifting, arms.lift), since);
    // An empty list says the camera can't see this child, so their lifter stops copying them.
    this.friends.sendMove('pose', { p: reader.hasPose && !this.bodyLost() ? bodyList(reader.pose) : [] }, since);
  }

  /** Something from a friend's game: their arm, their body, or the server saying a rescue is done. */
  fromFriend(id, message) {
    if (message.t === 'claimed') {
      this.asked.delete(message.k);
      if (this.team) this.lifting?.settle(message.k);
      return;
    }
    const mate = this.mates.find(({ friend }) => friend.id === id);
    if (mate?.hear(message, performance.now())) this.showScores();
  }

  /** With no answer about a rescue for a while, as when the server can't be reached, this game's own word stands. */
  settleUnanswered() {
    const now = performance.now();
    for (const [index, at] of this.asked) if (now - at >= CLAIM_ANSWER_MS) this.asked.delete(index);
  }

  /** Everyone's count, top right, with friends: lifts on one weight together, or friends freed, the most first. */
  showScores() {
    const board = byElementId('lift-scores');
    const friendly = this.mates.length > 0;
    board.hidden = !friendly;
    if (!friendly || !this.lifting) return;
    const rows = scoreRows(this.lifting.stats, this.mates, this.team);
    board.dataset.counts = this.team ? 'lifts' : 'freed';
    board.replaceChildren(...rows.map(({ name, count: number, you }) => {
      const row = document.createElement('li');
      if (you) row.className = 'is-you';
      const who = document.createElement('span');
      who.textContent = name;
      const value = document.createElement('strong');
      value.textContent = String(number);
      row.append(who, value);
      return row;
    }));
  }

  /** A friend has gone in the middle, and their lifter with them. Everyone else lifts on. */
  friendGone(friend) {
    const mate = this.mates.find((each) => each.friend.id === friend.id);
    if (!mate) return;
    mate.gone = true;
    this.showScores();
  }

  /* ---------- every frame ---------- */

  frame(dt, now) {
    if (this.lifting) this.updateNew(dt);
    if (this.mates.length) this.updateMates(now);
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

mountBodyShell({
  title: 'Mighty Lift',
  tagline: 'Someone is stuck under something heavy! Raise your arm to lift it up, and set your friends free.',
  startLabel: 'Choose your lifter',
  chooseTitle: 'Who’s lifting today?',
  chooseSide: `
      <p class="choose-tip">Raise your arm, and your lifter lifts too. Hold it up, and your friend gets out.</p>
      <button id="lift-start" class="big-button" type="button">Let’s lift!</button>`,
  hud: `
  <div id="lift-meter" class="lift-meter" data-zone="middle" aria-hidden="true">
    <div class="meter-zone meter-zone-up"></div>
    <div class="meter-middle"></div>
    <div id="meter-dot" class="meter-dot"></div>
  </div>
  <div id="warm-bar" class="warm-bar">
    <button id="warm-skip" class="soft-button" type="button">Skip the warm-up</button>
  </div>
  <header id="lift-top" class="lift-top">
    <div class="chip"><span class="chip-label">Lifts</span><span class="chip-value"><span id="lifts-done">0</span> / <span id="lifts-all">0</span></span></div>
    <div id="prizes-chip" class="chip" hidden><span class="chip-label">Prizes</span><span id="prizes" class="chip-value"></span></div>
    <div class="chip"><span class="chip-label">Lifts today</span><span id="lifts-today" class="chip-value">0</span></div>
    <div id="sunset-chip" class="chip sunset-chip"><span class="chip-label">Before sunset</span><span class="chip-value"><span aria-hidden="true">☀️</span> <span id="sunset">0:00</span></span><span class="sunset-bar" aria-hidden="true"><span id="sunset-fill" class="sunset-fill"></span></span></div>
    <ul id="freed-row" class="freed-row" aria-label="Friends freed"></ul>
  </header>
  <ol id="lift-scores" class="lift-scores" aria-label="Everyone’s count" hidden></ol>
  <div id="lift-new" class="lift-new" aria-hidden="true"></div>`,
  finishBody: `
      <h2 id="finish-title">You set them all free!</h2>
      <p class="finish-hero"><span id="finish-freed">0 friends</span> freed, with <span id="finish-lifts">0 lifts</span></p>
      <ul id="finish-faces" class="freed-row finish-faces" aria-hidden="true"></ul>
      <p id="finish-line" class="finish-open"></p>
      <p id="finish-prizes" class="finish-prizes"></p>
      <div id="finish-tally" class="finish-tally"></div>
      <p class="small-print">These numbers are shown once and not saved.</p>
      <div class="finish-actions">
        <button id="lift-again" class="big-button" type="button">Lift again</button>
        <button id="other-lifter" class="soft-button" type="button">Choose another lifter</button>
        <a class="all-games" href="../../index.html">All games</a>
      </div>`,
  panelLead: 'The game is paused. The camera needs to see the child’s head, shoulders and arms, sitting or standing, with room above the head for a raised arm.',
  handLegend: 'Arm being worked on',
  safetyPrint: 'Please make room to raise both arms, and stay close by.',
  panelSettings: `
    <fieldset class="choice">
      <legend>Which arm lifts</legend>
      ${choice('liftWith', 'play', 'The arm being worked on')}
      ${choice('liftWith', 'other', 'The other arm')}
      ${choice('liftWith', 'both', 'Both together, holding a bar: the weight goes as high as the lower arm, each measured against its own reach')}
    </fieldset>
    <fieldset class="choice">
      <legend>How high the arm has to go, at most. It’s never more than most of the way to this child’s own reach, as measured in the warm-up</legend>
      ${choice('liftHeight', 'little', 'A little: the hand to about the tummy')}
      ${choice('liftHeight', 'shoulder', 'Shoulder height')}
      ${choice('liftHeight', 'head', 'Above the head')}
    </fieldset>
    <fieldset class="choice">
      <legend>How long to hold it up, at level 1</legend>
      ${choice('liftHold', 'short', 'Short: about half a second')}
      ${choice('liftHold', 'medium', 'Medium: a second')}
      ${choice('liftHold', 'long', 'Long: two seconds')}
    </fieldset>
    <fieldset class="choice">
      <legend>Lifts in a game</legend>
      ${LIFT_COUNTS.map((count) => choice('lifts', count, `${count} lifts`)).join('\n      ')}
    </fieldset>
    <fieldset class="choice">
      <legend>Before sunset</legend>
      ${choice('liftClock', 'yes', 'Yes: the lifts have to be done before the sun sets, and a game can be lost. The clock waits while the arm rests')}
      ${choice('liftClock', 'no', 'Gentle: no clock, take as long as it takes, and every game moves on a level')}
    </fieldset>
    <fieldset class="choice">
      <legend>With friends</legend>
      ${choice('liftFriends', 'together', 'Together: everyone lifts one big weight, each arm adding its share')}
      ${choice('liftFriends', 'against', 'Against each other: each frees their own friends, and the most wins')}
    </fieldset>`,
});

// Checked here so that a mistake in the roster's names shows up as soon as the page loads.
for (const { id } of ROSTER) if (!THANKS[id] || !characterById(id)) console.error(`No thanks for ${id}`);

new MightyLift().start();
