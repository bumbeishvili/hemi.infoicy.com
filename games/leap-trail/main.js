// Leap Trail: an endless-feeling run down a country path, with obstacles to jump over and three
// lanes to move between, using the child's real body. Jumping is the only move asked for, so a
// child never has to tell a squat from a jump. This file runs it from start to finish, on top of
// what the body games share in core/body/game.js. The rules are in run.js, the lanes are read in
// lanes.js, and the world is in world.js.
//
// Friends can run together, each on their own computer: everyone runs the same trail, sees the others' runners
// beside them, copying their children, and a star on the trail is had by whoever gets to it first.
import { BODY_KEYS, bodyFrom, bodyList } from '../../core/body/characters.js';
import { BODY_SAY, BodyGame, byElementId } from '../../core/body/game.js';
import { SO_CLOSE } from '../../core/sound.js';
import { mountBodyShell } from '../../core/body/shell.js';
import { seededRandom, Track } from '../../core/friends.js';
import { FriendsPanel } from '../../core/friends-ui.js';
import { bodyAcross, LaneReader } from './lanes.js';
import { Practice } from './practice.js';
import { ARCH_STARS, GEM_COINS, GOLD_STARS, POWERS, Run, newAt as newAtLevel, newThingsAt } from './run.js';
import { TrailSound } from './trail-sound.js';
import { World } from './world.js';

const AFTER_FINISH_SECONDS = 2.4;
const COUNT_FROM = 3;
const GO_SHOWN_SECONDS = 0.9;
const FEET_PROMPT_SECONDS = 2.5;
const READY_SECONDS = 1.1;
const REST_LOW = -0.9; // Where a resting hand hangs, in torso lengths above the shoulder.
const STREAKS = { 5: 'Five in a row!', 10: 'Ten in a row!' };
const NEARLY_THERE = 0.85;
const METER_MOST = 1.12; // The meter's top, as a share of a jump that counts.
const NEW_SHOWN_SECONDS = 2.6; // How long something new is pointed out, the first time it comes into view.
const NEW_GAP_SECONDS = 0.35; // Between one thing pointed out and the next.
const POWER_MARKS = { magnet: '🧲', shield: '🫧', friend: '🤝' };
const COIN = '🟡'; // A gold coin in words, as the coin emoji isn't gold everywhere.

const DEFAULTS = {
  moveSize: 'small',
  jumpWith: 'jump',
  // The trail's own pace. It was pace, which Balloon Pop, Robot Rescue and Smoothie Stand also save theirs
  // under: since this game came to be medium and those stayed slow, whichever was played last decided for all.
  trailPace: 'medium',
  obstacles: 20,
  onMissed: 'stumble',
  trailLanes: 'yes',
  // Whether stumbles cost hearts, and a run whose hearts are gone is over: 'yes', or 'no' for the gentle
  // trail, the game as it was, where every run gets to the finish and moves on a level.
  trailHearts: 'yes',
  fighter: 'giraffe',
};
const CHOICES = { jumpWith: String, trailPace: String, obstacles: Number, onMissed: String, trailLanes: String, trailHearts: String };
const LENGTHS = [10, 20, 40];

// Running with friends, each on their own computer: see core/friends-ui.js for what each of these is.
const RUN_WORDS = {
  toggle: 'Run with a friend',
  make: 'Make a run',
  codeLabel: 'A friend’s run code',
  codeName: 'Run code',
  how: 'Tell your friend the code. Then you both choose a runner and press <b>Let’s run!</b>',
  leave: 'Leave this run',
  privacy: 'Only your name, who runs, where your runner is and how it moves go to your friends. The camera picture stays on this computer.',
  alone: 'Run on your own',
  full: 'That run already has 4 runners.',
  lost: 'Can’t reach the run. Check the internet, then try again.',
  left: 'You’ve left the run.',
  badCode: 'A run code is 3 letters and numbers.',
  busy: 'Running',
  still: 'still running',
};
// Each friend's runner as their game sends it, a moment behind, and going on the way it was between messages.
const RUNNER_TRACK = { lerp: ['d', 'x', 'y', 's'], steps: ['j', 'w', 'b'], guess: (last, seconds) => ({ d: last.d + last.s * seconds }) };
const BODY_TRACK = { lists: ['p'] };
const SHOWN_BEHIND_SECONDS = 0.12; // How far behind a friend's runner is shown, which their speed makes up.
const STAR_ANSWER_MS = 1500; // A star asked for with no answer from the server, as when it can't be reached, is had.
// The host's pace and lanes, for everyone's trail, in a word: slowL is slow with lanes.
const runMode = (pace, lanes) => `${pace}${lanes ? 'L' : 'N'}`;
const fromMode = (mode) => {
  const [, pace, lanes] = /^(slow|medium|fast)([LN])$/.exec(mode ?? '') ?? [];
  return pace ? { pace, lanes: lanes === 'L' } : null;
};

// Every one of these has a rendered voice file: see audio/voice/lines.json.
const SAY = {
  choose: 'Who’s running today?',
  jump: 'Jump!',
  jumpReady: 'Jump when you’re ready!',
  side: 'Step to the side!',
  lean: 'Lean to the side!',
  raiseReady: 'Raise your hand when you’re ready!',
  raiseLeft: 'Raise your open left hand!',
  raiseRight: 'Raise your open right hand!',
  openLeft: 'Open your left hand!',
  openRight: 'Open your right hand!',
  lift: 'Lift your knee!',
  liftReady: 'Lift your knee when you’re ready!',
  nearly: 'Almost there!',
  madeIt: 'You made it to the end of the trail!',
  practise: 'Let’s practise!',
  jumpHigh: 'Jump as high as you can!',
  kneeHigh: 'Lift your knee as high as you can!',
  raiseHigh: 'Raise your open hand as high as you can!',
  greatJump: 'Great jump!',
  greatJob: 'Great job!',
  readyNow: 'That’s it! You’re ready!',
};

// The moment a move is seen, the child is told what it was, as words on the screen.
const SEEN_WORDS = {
  jump: ['You jumped!', 'შენ ახტი!'],
  side: ['You moved across!', 'გადაინაცვლე!'],
  lift: ['You lifted your knee!', 'მუხლი ასწიე!'],
  raise: ['You raised your hand!', 'ხელი ასწიე!'],
};

class LeapTrail extends BodyGame {
  constructor() {
    super({
      defaults: DEFAULTS,
      choices: CHOICES,
      lines: new URL('./audio/voice/lines.json', import.meta.url),
      createSound: (options) => new TrailSound(options),
    });
    this.run = null;
    this.timer = 0;
    this.countLeft = 0;
    this.closeUpScreens = new Set(['practice', 'countdown', 'run']);
    this.handUsed = false;
    this.feetMissing = 0;
    this.saidNearly = false;
    this.wasResting = false;
    this.lastNumbers = {};
    this.practice = null;
    this.practised = false;
    this.lanes = null;
    this.newLeft = 0; // How long the label for something new has still to show.
    this.newGap = 0;
  }

  /**
   * What a level brings that's new, for the cards: see NEW_THINGS in run.js. Only what these settings
   * really bring: a magnet and stars changing lanes need the lanes, and the bubble needs a runner that
   * runs on when a move is missed.
   */
  newAt(level) {
    return newAtLevel(level, this.trailSettings);
  }

  /** What the run is set to, as far as what's new at a level goes. */
  get trailSettings() {
    return { lanes: this.hasLanes, whenMissed: this.settings.onMissed };
  }

  /** Whether this child jumps for real, or raises an open hand instead. */
  get raisingHand() {
    return this.settings.jumpWith === 'reach';
  }

  setUp() {
    this.world = new World(byElementId('game'));
    this.stage = this.world;
    this.world.setView('choose', { snap: true });
    this.world.onStep = () => this.sound.step();
    this.world.onStar = () => this.sound.star();
    this.world.onSeen = (id) => this.pointOutNew(id);
    this.applyJumpWith();

    byElementId('start').addEventListener('click', () => {
      this.sound.unlock();
      this.setScreen('choose');
      this.sound.ready.then(() => {
        if (this.screen === 'choose') this.sound.say(SAY.choose);
      });
    });
    byElementId('run-start').addEventListener('click', () => this.openCameraThen(() => this.beginBodyCheck()));
    byElementId('run-again').addEventListener('click', () => this.runAgain());
    byElementId('other-runner').addEventListener('click', () => {
      this.confetti.stop();
      this.world.setRun(null);
      this.world.setLive(null);
      this.world.won = false;
      this.world.runner.presenting = true;
      this.world.setView('choose');
      this.setScreen('choose');
    });
    byElementId('practice-skip').addEventListener('click', () => this.endPractice());
    // Running with friends, if a grown-up makes or joins a run.
    this.mates = [];
    this.asked = new Map(); // Stars asked for, by index: when.
    this.markMates = [];
    this.friends = new FriendsPanel({
      game: 'leap-trail',
      linkKey: 'run',
      words: RUN_WORDS,
      hello: () => ({ driver: this.chosen?.id ?? this.settings.fighter, level: this.levels.current, length: this.settings.obstacles, mode: runMode(this.settings.trailPace, this.hasLanes) }),
      screen: () => this.screen,
      portraits: () => this.portraits,
      onGone: (friend) => this.friendGone(friend),
      onMove: (id, message) => this.fromFriend(id, message),
      // Whoever caught the most stars. Equal ones share a place.
      rank: (a, b) => b.dropped - a.dropped,
      resultText: ({ dropped }) => `${dropped} ${dropped === 1 ? 'star' : 'stars'}`,
      titles: { first: 'You caught the most stars!', other: 'Great running!' },
      startAfter: byElementId('start'),
      waitingBefore: byElementId('screen-finish'),
      resultsAfter: document.querySelector('#screen-finish .finish-hero'),
      finishTitle: byElementId('finish-title'),
    });
    byElementId('recheck').addEventListener('click', () => {
      byElementId('panel').close();
      this.practised = false;
      if (this.camera.running) this.beginBodyCheck(this.screen === 'run' ? 'resume' : 'start');
      else this.openCameraThen(() => this.beginBodyCheck());
    });
  }

  debug() {
    const game = this;
    return {
      world: this.world,
      get run() {
        return game.run;
      },
      get friends() {
        return game.friends;
      },
      get mates() {
        return game.mates;
      },
    };
  }

  applyJumpWith() {
    this.upperBodyOnly = this.raisingHand;
    this.reader.upperBodyOnly = this.raisingHand;
    this.reader.personal = { jump: null, squat: null, leg: null, hand: null };
    document.body.dataset.jumpWith = this.settings.jumpWith;
  }

  /** The move that gets the runner over things: 'jump', 'lift' or 'raise'. */
  get overMove() {
    return { jump: 'jump', lift: 'lift', reach: 'raise' }[this.settings.jumpWith] ?? 'jump';
  }

  /** Whether stars are in all three lanes, so stepping from side to side moves the runner across. */
  get hasLanes() {
    return this.settings.trailLanes !== 'no';
  }

  /** Reads which lane the child is in. Its middle is wherever they're standing when it starts. */
  startLanes() {
    this.lanes = new LaneReader({ size: this.reader.size ?? 1, upperBodyOnly: this.raisingHand });
    this.lanes.centreOn(bodyAcross(this.latestBody, this.aspect, this.raisingHand));
    this.world.setLane(0);
  }

  /** Where the child is across the trail now: -1, 0 or 1. */
  readLane(dt) {
    if (!this.lanes || !this.hasLanes) return 0;
    const lane = this.lanes.update(bodyAcross(this.latestBody, this.aspect, this.raisingHand), this.reader.torsoSize, dt);
    this.world.setLane(lane);
    return lane;
  }

  settingChanged(change) {
    if ('jumpWith' in change || 'trailLanes' in change) {
      if ('jumpWith' in change) this.applyJumpWith();
      this.practised = false;
    }
    if ('moveSize' in change) this.reader.personal = { jump: null, squat: null, leg: null, hand: null };
    if ('jumpWith' in change || 'hands' in change) this.handUsed = false;
    // What the cards say is new depends on these.
    if ('trailLanes' in change || 'onMissed' in change || 'trailHearts' in change) this.levelUi.refresh();
  }

  showChosen(spec) {
    this.world.setRunner(spec);
  }

  /* ---------- the body ---------- */

  onMoves(moves) {
    if (this.screen === 'practice') {
      this.practice?.onMoves(moves);
      return;
    }
    if (this.screen !== 'run') return;
    for (const { move } of moves) {
      this.run.noteActivity();
      // Going down before a jump can read as a squat. Nothing asks for one, so it's just ignored.
      if (this.overMove === 'jump' && (move === 'flying' || move === 'starBurst')) this.run.jump(); // A star jump leaves the ground too.
      else if (this.overMove === 'lift' && (move === 'kick' || move === 'knee')) this.run.jump();
    }
  }

  /**
   * For a child who can't jump safely: raising the hand being worked on, open, is the jump. It
   * can be done sitting down, and it's the open-hand exercise as well. A closed hand is asked to
   * open and doesn't count, as in the other games. A hand has to come down before it counts again.
   * done is what to do with a raised open hand.
   */
  readRaisedHand(now, done) {
    const side = this.settings.hands;
    const up = this.reader.handsUp[side];
    if (!up) {
      this.handUsed = false;
      return null;
    }
    if (this.handUsed) return null;
    const state = this.reader.hands.stateOf(side, now);
    if (state === 'open') {
      this.handUsed = true;
      done();
      return null;
    }
    return { key: `open-${side}`, text: side === 'left' ? SAY.openLeft : SAY.openRight, side };
  }

  /* ---------- how the body is being seen ---------- */

  /**
   * Moves the marker on the meter, so the child can see their own movement being read. It only goes
   * up, from standing at the bottom to a jump that counts at the top, as going down isn't asked for.
   */
  updateMeter() {
    const { reader } = this;
    let value;
    if (this.overMove === 'raise') {
      const height = reader.handHeight[this.settings.hands];
      value = (height - REST_LOW) / Math.max(0.1, reader.handNeeded - REST_LOW);
    } else if (this.overMove === 'lift') {
      value = reader.footHeight / reader.legNeeded;
    } else {
      value = reader.jumpEffort / reader.jumpNeeded;
    }
    const shown = Math.round(Math.min(METER_MOST, Math.max(0, value || 0)) * 100);
    if (this.lastNumbers.meter === shown) return;
    this.lastNumbers.meter = shown;
    byElementId('meter-dot').style.bottom = `${9 + shown * 0.8}%`;
    const meter = byElementId('move-meter');
    meter.dataset.zone = shown >= 100 ? 'up' : 'middle';
  }

  /** The move was seen: this child's way over, or a step across. */
  sawMove(what) {
    const inPractice = this.screen === 'practice';
    this.showSeen(SEEN_WORDS[what], { x: inPractice ? 0.26 : 0.42, y: inPractice ? 0.45 : 0.62 });
  }

  /* ---------- practising ---------- */

  beginPractice() {
    const { world } = this;
    world.setRun(null);
    world.won = false;
    world.runner.presenting = true;
    world.setView('practice');
    this.lastNumbers = {};
    this.handUsed = false;
    this.readyLeft = 0;
    this.setScreen('practice');
    this.sound.say(SAY.practise);
    const steps = [this.overMove, ...(this.hasLanes ? ['side'] : [])];
    this.practice = new Practice({
      steps,
      reader: this.reader,
      side: this.settings.hands,
      onEvent: (event) => this.onPracticeEvent(event),
    });
  }

  onPracticeEvent({ type, step, index, total }) {
    if (type === 'step') {
      if (step === 'side') this.startLanes();
      const { demo } = this.practiceAsk(step);
      const text = { jump: SAY.jumpHigh, lift: SAY.kneeHigh, raise: SAY.raiseHigh, side: this.sideWords }[step];
      this.showCoach(demo, this.translate(text), { side: this.settings.hands });
      byElementId('practice-count').textContent = `${index + 1} / ${total}`;
      // After "Let's practise!" the first time.
      setTimeout(() => {
        if (this.screen === 'practice' && this.practice?.step === step) this.sound.say(text, { ifQuiet: true });
      }, index === 0 ? 1200 : 150);
    } else if (type === 'success') {
      this.hideCoach();
      this.sawMove(step);
      this.world.hop();
      this.sound.say(step === 'jump' ? SAY.greatJump : SAY.greatJob);
    } else if (type === 'finished') {
      this.sound.say(SAY.readyNow);
      this.readyLeft = READY_SECONDS;
    }
  }

  updatePractice(dt, now) {
    const { practice } = this;
    this.updateMeter();
    if (this.readyLeft > 0) {
      this.readyLeft -= dt;
      if (this.readyLeft <= 0) this.endPractice();
      return;
    }
    if (this.bodyLost()) {
      this.world.setLive(null);
      this.prompt.show({ key: 'come-back', text: BODY_SAY.comeBack, side: null }, now);
      return;
    }
    this.world.setLive(this.reader.hasPose ? this.reader.pose : null);
    if (practice.step === 'side') {
      // Moving across is seen as soon as the runner moves into another lane.
      if (this.readLane(dt) !== 0) practice.succeed();
      this.setCoachEffort(Math.min(1, Math.abs(this.lanes.offset) / this.lanes.enter));
    } else {
      this.setCoachEffort(this.reader.effortFor(this.practiceAsk(practice.step).demo, this.settings.hands));
    }
    const handPrompt = practice.step === 'raise' ? this.readRaisedHand(now / 1000, () => practice.succeed()) : null;
    this.prompt.show(handPrompt, now);
    practice.update(dt);
  }

  /** The film for a step of the practice. */
  practiceAsk(step) {
    return step === 'side' ? { demo: 'sideStep', text: this.sideWords } : this.askFor('jump');
  }

  /** Sitting down, it's leaning that moves the runner across, rather than stepping. */
  get sideWords() {
    return this.raisingHand ? SAY.lean : SAY.side;
  }

  endPractice() {
    this.world.setLane(0);
    this.practice = null;
    this.practised = true;
    this.hideCoach();
    this.prompt.clear();
    this.beginCountdown();
  }

  /* ---------- a run ---------- */

  afterBodyCheck(then) {
    if (then === 'resume') this.setScreen('run');
    else if (this.practised) this.beginCountdown();
    else this.beginPractice();
  }

  /** Ready to run. With friends, everyone waits for the others first, and then all count down together. */
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
    // With friends, everyone runs the host's trail: their level, length, pace and lanes, laid out from the same
    // seed. It doesn't move anyone's own level on, and each child keeps their own way of getting over things.
    const friendly = this.friends.current;
    document.body.toggleAttribute('data-friends-race', Boolean(friendly));
    const levelNumber = friendly ? friendly.level : this.startLevel();
    const host = friendly ? fromMode(friendly.mode) : null;
    this.run = new Run({
      obstacles: friendly && LENGTHS.includes(friendly.length) ? friendly.length : settings.obstacles,
      pace: host?.pace ?? settings.trailPace,
      lanes: host ? host.lanes : this.hasLanes,
      whenMissed: settings.onMissed,
      gentle: settings.trailHearts === 'no',
      levelNumber,
      random: friendly ? seededRandom(friendly.seed) : Math.random,
      friends: Boolean(friendly),
      onEvent: (event) => this.onRunEvent(event),
    });
    this.setUpMates(friendly);
    world.won = false;
    world.setRun(this.run);
    world.setLane(0);
    this.lanes = null;
    document.body.dataset.coins = this.run.levelRules.coins ? 'yes' : 'no';
    document.body.dataset.hearts = this.run.hearts === null ? 'no' : 'yes';
    this.newShown = new Set();
    this.newQueue = [];
    this.newLeft = 0;
    this.newGap = 0;
    byElementId('trail-new').classList.remove('is-showing');
    world.runner.presenting = false;
    world.setLive(null);
    world.setView('run');
    this.lastNumbers = {};
    this.handUsed = false;
    this.feetMissing = 0;
    this.saidNearly = false;
    this.wasResting = false;
    byElementId('runner-portrait').src = this.portraits[this.chosen.id];
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
    if (this.countLeft <= 0) this.beginRun();
    else if (after !== before) {
      this.setCount(String(after));
      this.sound.count(after);
    }
  }

  /** Friends' runners, each following what their own game sends, and their names over them. */
  setUpMates(friendly) {
    this.mates = (friendly?.friends ?? []).map((friend) => ({ friend, track: new Track(RUNNER_TRACK), body: new Track(BODY_TRACK), stars: 0, gone: false }));
    this.asked = new Map();
    this.world.setMates(this.mates.map(({ friend }) => friend.spec));
    for (const mark of this.markMates) mark.root.remove();
    this.markMates = this.mates.map(({ friend }) => {
      const root = document.createElement('div');
      root.className = 'runner-mark';
      root.dataset.where = 'none';
      const face = document.createElement('img');
      face.className = 'runner-mark-face';
      face.alt = '';
      face.src = this.portraits[friend.spec.id] ?? '';
      const name = document.createElement('span');
      name.className = 'runner-mark-name';
      name.textContent = friend.spec.name;
      root.append(face, name);
      document.body.append(root);
      return { root };
    });
    this.showScores();
  }

  /** Where each friend is now, a moment behind what their game says, so that they move smoothly. */
  updateMates(now) {
    const wheres = this.mates.map((mate) => {
      if (mate.gone) return null;
      const at = mate.track.at(now);
      if (!at) return null;
      const body = mate.body.at(now);
      return { ...at, d: at.d + at.s * SHOWN_BEHIND_SECONDS, live: body?.p?.length === BODY_KEYS.length ? bodyFrom(body.p) : null };
    });
    this.world.placeMates(wheres);
    // Their names over them, while they can be seen, on the trail.
    const running = ['countdown', 'run', 'finishing'].includes(this.screen);
    this.world.mates.forEach((shown, index) => {
      const mark = this.markMates[index];
      if (!mark) return;
      const seen = running && shown.shown ? this.world.project(shown.x, 2.15, shown.z) : null;
      const onScreen = seen && !seen.behind && seen.x > 0 && seen.x < innerWidth && seen.y > 0 && seen.y < innerHeight;
      mark.root.dataset.where = onScreen ? 'on' : 'none';
      if (onScreen) mark.root.style.transform = `translate(${Math.round(seen.x)}px, ${Math.round(seen.y)}px)`;
    });
  }

  /** Where this child's runner is, and their body, for friends' games, timed from "GO!". */
  sendRunner(now) {
    const { run, world, reader } = this;
    if (!this.friends.current || !run || run.state === 'ready') return;
    const since = now - this.goAt;
    this.friends.sendMove('runner', { d: run.distance, x: world.runnerX, y: run.air.height, s: run.speed, j: run.move?.kind === 'jump' ? 1 : 0, w: run.waiting ? 1 : 0, b: run.stats.bumps }, since);
    // An empty list says the camera can't see this child, so their runner stops copying them.
    this.friends.sendMove('pose', { p: reader.hasPose && !this.bodyLost() ? bodyList(reader.pose) : [] }, since);
  }

  /** Something from a friend's game: where their runner is, their body, their stars, or whose a star is. */
  fromFriend(id, message) {
    if (message.t === 'claimed') {
      this.asked.delete(message.k);
      this.run?.settleStar(message.k, message.by === this.friends.room.you);
      return;
    }
    const mate = this.mates.find(({ friend }) => friend.id === id);
    if (!mate) return;
    if (message.t === 'runner') mate.track.push(message, performance.now());
    else if (message.t === 'pose') mate.body.push(message, performance.now());
    else if (message.t === 'score') {
      mate.stars = message.n;
      this.showScores();
    }
  }

  /** A star this runner has reached: the server says whose it is, as a friend may have got there first. */
  askForStar({ star }) {
    this.asked.set(star.index, performance.now());
    this.friends.claim(star.index);
  }

  /** With no answer about a star for a while, as when the server can't be reached, it's this runner's. */
  settleUnanswered(now) {
    for (const [index, at] of this.asked) {
      if (now - at < STAR_ANSWER_MS) continue;
      this.asked.delete(index);
      this.run.settleStar(index, true);
    }
  }

  /** Everyone's stars, top right, with friends: the most first. */
  showScores() {
    const board = byElementId('run-scores');
    const friendly = this.mates.length > 0;
    board.hidden = !friendly;
    if (!friendly) return;
    const rows = [{ name: 'You', stars: this.run?.starTotal ?? 0, you: true }, ...this.mates.filter(({ gone }) => !gone).map(({ friend, stars }) => ({ name: friend.spec.name, stars, you: false }))];
    rows.sort((a, b) => b.stars - a.stars);
    board.replaceChildren(...rows.map(({ name, stars, you }) => {
      const row = document.createElement('li');
      if (you) row.className = 'is-you';
      const who = document.createElement('span');
      who.textContent = name;
      const count = document.createElement('strong');
      count.textContent = String(stars);
      row.append(who, count);
      return row;
    }));
  }

  /** A friend has gone in the middle, and their runner with them. */
  friendGone(friend) {
    const mate = this.mates.find((each) => each.friend.id === friend.id);
    if (!mate) return;
    mate.gone = true;
    this.showScores();
  }

  beginRun() {
    this.goAt = performance.now();
    this.setCount(this.translate('Go!'));
    this.sound.go();
    this.sound.startMusic();
    this.timer = GO_SHOWN_SECONDS;
    // The middle lane is wherever the child is standing as the run starts.
    if (this.hasLanes) this.startLanes();
    this.run.begin();
    this.setScreen('run');
    // A new time of year, or of day, is pointed out as the run starts.
    this.pointOutNew(this.run.levelRules.place);
  }

  /**
   * The first time something this level brings comes into view, it's pointed out with a small label
   * at the top, for a moment, with no talking. Several at once take turns.
   */
  pointOutNew(id) {
    if (!this.run) return;
    const thing = newThingsAt(this.run.levelNumber, this.trailSettings).find((one) => one.id === id);
    if (!thing || this.newShown?.has(id)) return;
    this.newShown.add(id);
    this.newQueue.push(thing);
    if (this.newLeft <= 0 && this.newGap <= 0) this.showNextNew();
  }

  showNextNew() {
    const label = byElementId('trail-new');
    const thing = this.newQueue.shift();
    if (!thing) return;
    const georgian = this.settings.language === 'ka';
    label.innerHTML = `<span class="trail-new-lead">${georgian ? 'ახალი:' : 'New:'}</span><span class="trail-new-mark">${thing.mark}</span>${georgian ? thing.nameKa : thing.name}`;
    label.dataset.thing = thing.id;
    label.classList.add('is-showing');
    this.newLeft = NEW_SHOWN_SECONDS;
  }

  /**
   * The label's time goes with the game's, so it waits while the grown-ups' panel is open, rather than
   * running out behind it unseen.
   */
  updateNew(dt) {
    if (this.newLeft > 0) {
      this.newLeft -= dt;
      if (this.newLeft > 0) return;
      byElementId('trail-new').classList.remove('is-showing');
      this.newGap = NEW_GAP_SECONDS;
      return;
    }
    if (this.newGap <= 0) return;
    this.newGap -= dt;
    if (this.newGap <= 0) this.showNextNew();
  }

  updateRun(dt, now) {
    const { run, reader } = this;
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) this.setCount('');
    }

    // Nobody in the picture: everything waits.
    if (this.bodyLost()) {
      this.prompt.show({ key: 'come-back', text: BODY_SAY.comeBack, side: null }, now);
      return;
    }

    if (reader.moving) run.noteActivity(dt);
    run.setLane(this.readLane(dt));
    this.world.setLive(reader.hasPose ? reader.pose : null);
    this.updateMeter();
    const asked = run.mustJump ? this.askFor(run.next.needs).demo : null;
    if (asked) this.setCoachEffort(reader.effortFor(asked, this.settings.hands));
    this.followLanes();
    const handPrompt = this.raisingHand ? this.readRaisedHand(now / 1000, () => run.jump({ hand: 'open' })) : null;
    run.update(dt);
    if (run.state === 'finished') return;

    if (run.resting !== this.wasResting) {
      this.wasResting = run.resting;
      if (run.resting) this.sound.say(BODY_SAY.waiting, { ifQuiet: true });
    }
    if (!this.saidNearly && run.distance > run.end * NEARLY_THERE) {
      this.saidNearly = true;
      this.sound.say(SAY.nearly, { ifQuiet: true });
    }

    const problemFeet = !this.raisingHand && this.feetProblem(dt);
    let prompt = handPrompt;
    if (!prompt && run.waiting) prompt = this.waitingPrompt();
    if (!prompt && problemFeet) prompt = { key: 'see-feet', text: BODY_SAY.seeFeet, side: null };
    this.prompt.show(prompt, now);
    this.updateHud();
  }

  /**
   * An obstacle that leaves a lane free only needs a jump in a lane it fills. Stepping out of its way
   * puts the film away, and stepping back in brings it back, said only the once.
   */
  followLanes() {
    const { run } = this;
    const showing = byElementId('coach').classList.contains('is-visible');
    if (run.move?.obstacle) return;
    if (!run.mustJump && showing) this.hideCoach();
    else if (run.mustJump && !showing && run.announced === run.next.index) {
      const { demo, text } = this.askFor(run.next.needs);
      this.showCoach(demo, this.translate(text), { side: this.settings.hands });
    }
  }

  feetProblem(dt) {
    const { left, right } = this.reader.floor;
    const body = this.latestBody;
    const hidden = !body || left === null || right === null || body.image[27].visibility < 0.5 || body.image[28].visibility < 0.5;
    this.feetMissing = hidden ? this.feetMissing + dt : 0;
    return this.feetMissing > FEET_PROMPT_SECONDS;
  }

  /** What to say to a child the runner is waiting for. */
  waitingPrompt() {
    const next = this.run.next;
    if (!next) return null;
    if (this.raisingHand) return { key: 'raise-ready', text: SAY.raiseReady, side: null };
    if (this.overMove === 'lift') return { key: 'lift-ready', text: SAY.liftReady, side: null };
    return { key: 'jump-ready', text: SAY.jumpReady, side: null };
  }

  updateHud() {
    const { run, lastNumbers } = this;
    const share = Math.min(1, run.distance / run.end);
    const percent = Math.round(share * 1000) / 10;
    if (lastNumbers.percent !== percent) {
      lastNumbers.percent = percent;
      byElementId('trail-fill').style.width = `${percent}%`;
      byElementId('runner-portrait').style.left = `${percent}%`;
    }
    const { streak, coins } = run.stats;
    const stars = run.starTotal;
    // Friends' scoreboards hear about every star.
    if (lastNumbers.stars !== stars && this.friends.current) {
      this.friends.sendScore(stars, performance.now() - this.goAt);
      this.showScores();
    }
    if (lastNumbers.coins !== coins) {
      lastNumbers.coins = coins;
      byElementId('coins').textContent = String(coins);
    }
    this.updatePowersShown();
    if (lastNumbers.stars !== stars) {
      lastNumbers.stars = stars;
      byElementId('stars').textContent = String(stars);
    }
    if (lastNumbers.streak !== streak) {
      lastNumbers.streak = streak;
      byElementId('streak').textContent = String(streak);
    }
    if (lastNumbers.hearts !== run.hearts) {
      lastNumbers.hearts = run.hearts;
      const full = run.hearts ?? 0;
      const all = run.levelRules.hearts ?? 0;
      byElementId('hearts').textContent = `${'♥'.repeat(full)}${'♡'.repeat(Math.max(0, all - full))}`;
      byElementId('hearts').setAttribute('aria-label', `${full} of ${all}`);
    }
    const left = run.course.filter(({ state }) => state === 'ahead' || state === 'passing').length;
    if (lastNumbers.left !== left) {
      lastNumbers.left = left;
      byElementId('obstacles-left').textContent = String(left);
    }
  }

  /** The power-ups going, each with a bar running down, and a key if one's being carried. */
  updatePowersShown() {
    const { run, lastNumbers } = this;
    const going = Object.keys(POWERS).filter((kind) => run.power[kind] > 0);
    if (run.keys > 0) going.push('key');
    const names = going.join(',');
    const row = byElementId('power-row');
    if (lastNumbers.powers !== names) {
      lastNumbers.powers = names;
      row.replaceChildren(...going.map((kind) => {
        const pill = document.createElement('span');
        pill.className = 'power-pill';
        pill.dataset.kind = kind;
        pill.innerHTML = `<span class="power-mark">${kind === 'key' ? '🔑' : POWER_MARKS[kind]}</span>${kind === 'key' ? '' : '<span class="power-bar"><span class="power-fill"></span></span>'}`;
        return pill;
      }));
    }
    for (const fill of row.querySelectorAll('.power-fill')) {
      const kind = fill.closest('.power-pill').dataset.kind;
      fill.style.width = `${Math.round((run.power[kind] / POWERS[kind].seconds) * 100)}%`;
    }
  }

  /* ---------- what happened ---------- */

  onRunEvent(event) {
    const handlers = {
      ask: () => this.onAsk(event),
      'star-line': () => this.onStarLine(event),
      'star-asked': () => this.askForStar(event),
      gold: () => this.onGold(event),
      bounce: () => this.onBounce(event),
      power: () => this.onPower(event),
      'power-end': () => this.onPowerEnd(event),
      key: () => this.onKey(event),
      chest: () => this.onChest(event),
      lane: () => this.sound.across(),
      move: () => this.onMove(event),
      cleared: () => this.onCleared(event),
      bump: () => this.onBump(event),
      landed: () => this.onLanded(event),
      'wrong-move': () => this.onWrongMove(event),
      finished: () => this.onFinished(),
    };
    handlers[event.type]?.();
  }

  /** The words and the move to show for what's being asked for: this child's way over. */
  askFor() {
    if (this.overMove === 'raise') {
      return { demo: 'raise', text: this.settings.hands === 'left' ? SAY.raiseLeft : SAY.raiseRight };
    }
    if (this.overMove === 'lift') return { demo: 'kneeLift', text: SAY.lift };
    return { demo: 'jump', text: SAY.jump };
  }

  onAsk({ needs }) {
    const { demo, text } = this.askFor(needs);
    this.showCoach(demo, this.translate(text), { side: this.settings.hands });
    this.callout(this.translate(text).replace('!', ''), { kind: 'is-big', x: 0.42, y: 0.34 });
    // This is the one thing the child needs to hear, so it's next after anything being said.
    this.sound.say(text);
  }

  /** The child did something, but something else is wanted. They're told what. */
  onWrongMove({ needs }) {
    this.sound.say(this.askFor(needs).text);
  }

  onMove({ kind, counts, float, bounce }) {
    if (float) {
      // The bubble shield floating the runner over: that wasn't the child, so nothing says they jumped.
      this.hideCoach();
      this.world.moveCounted({ kind, obstacle: this.run.move.obstacle, move: this.run.move });
      return;
    }
    if (bounce) this.sound.bounce();
    this.world.moved(kind, counts);
    this.sound.moved(kind);
    this.sawMove(this.overMove);
    if (!counts) return;
    this.hideCoach();
    this.world.moveCounted({ kind, obstacle: this.run.move.obstacle, move: this.run.move });
  }

  onCleared({ obstacle, streak, coin }) {
    this.world.cleared(obstacle, { coin });
    this.sound.cleared();
    if (coin) {
      this.sound.coin();
      this.pointOutNew('coins');
    }
    const word = STREAKS[streak];
    if (word) {
      this.callout(this.translate(word).replace('!', ''), { kind: 'is-big', x: 0.5, y: 0.3 });
      this.sound.say(word, { ifQuiet: true });
    }
    this.callout(coin ? `+3 ★ +1 ${COIN}` : '+3 ★', { kind: 'is-number', x: 0.46, y: 0.42 });
  }

  /** Over an obstacle from a trampoline: the arch of stars, and a gem at level 10. */
  onBounce({ gem }) {
    this.callout(gem ? `+${ARCH_STARS} ★ 💎 +${GEM_COINS} ${COIN}` : `+${ARCH_STARS} ★`, { kind: 'is-number', x: 0.54, y: 0.26 });
    if (gem) this.sound.gold();
  }

  /** A power-up picked up: the runner shows it while it lasts, and it's on the top of the screen. */
  onPower({ kind, pickup }) {
    if (kind === 'friend') this.pointOutNew('friend');
    else this.world.tookPickup(pickup);
    this.world.setPower(kind, true);
    this.sound.pickedUp();
    this.callout(POWER_MARKS[kind], { kind: 'is-number', x: 0.42, y: 0.4 });
  }

  onPowerEnd({ kind, used }) {
    this.world.setPower(kind, false);
    if (kind === 'shield' && used) {
      this.world.popBubble();
      this.sound.bubblePop();
    }
  }

  onKey({ pickup }) {
    this.world.tookPickup(pickup);
    this.sound.pickedUp();
    this.callout('🔑', { kind: 'is-number', x: 0.42, y: 0.4 });
  }

  /** A chest beside the trail, opened with a key as it's passed. */
  onChest({ chest, coins }) {
    this.world.openedChest(chest, coins);
    this.sound.chest();
    this.callout(`+${coins} ${COIN}`, { kind: 'is-number', x: chest.side < 0 ? 0.3 : 0.62, y: 0.36 });
  }

  onBump({ obstacle }) {
    this.world.bumped(obstacle);
    this.hideCoach();
    this.sound.bump();
  }

  /** A golden star, caught by jumping over in its lane. */
  onGold({ obstacle }) {
    this.world.tookGold(obstacle);
    this.sound.gold();
    this.callout(`+${GOLD_STARS} ★`, { kind: 'is-number', x: 0.52, y: 0.32 });
  }

  onStarLine({ star, pulled, friend }) {
    this.world.tookStar();
    if (pulled) this.world.pulledStar(star.lane);
    if (friend) this.world.friendCaught();
    this.sound.star();
  }

  onLanded({ kind }) {
    if (kind !== 'jump') return;
    this.world.landed();
    this.sound.land();
  }

  onFinished() {
    const { world, sound } = this;
    const { lost } = this.run;
    // Friends' finish cards fill in with how this child did.
    if (this.friends.current) this.friends.finished(performance.now() - this.goAt, { w: 1, n: this.run.starTotal });
    world.setLive(null);
    this.camera.stop();
    this.reader.forget();
    this.latestBody = null;
    this.hideCoach();
    this.prompt.clear();
    this.setCount('');
    this.updateHud();
    sound.stopMusic();
    // Out of hearts, the runner sits down for a rest, a little dizzy. Nothing is cheered, and the voice says what
    // it says after any game that was lost.
    if (lost) {
      world.tumbledOut();
      sound.finish(SO_CLOSE, { lost: true });
    } else {
      sound.finish(SAY.madeIt);
      world.celebrate();
    }
    this.timer = AFTER_FINISH_SECONDS;
    this.setScreen('finishing');
  }

  showFinish() {
    const { stats, course } = this.run;
    byElementId('finish-stars').textContent = String(this.run.starTotal);
    byElementId('finish-coins').textContent = String(stats.coins);
    byElementId('finish-prizes').textContent = this.prizeWords();
    const seconds = Math.round(stats.movingSeconds);
    const moving = seconds >= 60 ? `${Math.floor(seconds / 60)} min ${seconds % 60} sec` : `${seconds} seconds`;
    const movingWords = seconds > 0 ? `, with ${moving} of moving` : '';
    const golden = course.filter(({ gold }) => gold).length;
    const roundWords = stats.stepped ? `, ${stats.stepped} of them by stepping round` : '';
    const goldWords = golden ? `, and caught ${stats.gold} of ${golden} golden stars` : '';
    byElementId('finish-line').textContent = `${this.chosen.name} cleared ${stats.cleared} of ${course.length} obstacles${roundWords}${goldWords}${movingWords}.`;
    const raised = this.raisingHand;
    const overCard = {
      jump: { name: 'jumps', icon: 'jump', label: 'Jumps', value: stats.jumps },
      lift: { name: 'lifts', icon: 'highKnees', label: 'Knee lifts', value: stats.jumps },
      raise: { name: 'raised', icon: 'handUp', label: 'Hand raised, open', value: stats.hands.open },
    }[this.overMove];
    const entries = [
      overCard,
      { name: 'across', icon: 'sideStep', label: raised ? 'Leans across' : 'Steps across', value: stats.laneMoves },
      { name: 'streak', icon: 'starJump', label: 'Most in a row', value: stats.bestStreak },
    ].filter(({ name }) => this.hasLanes || name !== 'across');
    this.fillTallyCards(byElementId('finish-tally'), entries);
    // A run that gets to the finish moves on a level, and one whose hearts ran out stays on it. Running
    // with friends is on the host's level, so it doesn't move anyone's own level on.
    const { lost } = this.run;
    if (this.friends.current) {
      this.levels.last = null;
      this.levelUi.refresh();
    } else {
      this.finishLevel(!lost);
    }
    this.friends.showResults();
    if (lost) {
      const left = course.filter(({ state }) => state === 'ahead' || state === 'passing').length;
      byElementId('finish-title').textContent = 'Out of hearts!';
      byElementId('finish-line').textContent = `${this.chosen.name} tripped ${stats.bumps} ${stats.bumps === 1 ? 'time' : 'times'}, with ${left} ${left === 1 ? 'obstacle' : 'obstacles'} still to go. Have another go, and see how far ${this.chosen.name} gets!`;
      byElementId('run-again').textContent = 'Try again';
    } else this.confetti.start();
    document.body.dataset.runLost = lost ? 'yes' : 'no';
    this.setScreen('finish');
  }

  /** What else was won on this run, in words, from what this level has. Nothing at level 1. */
  prizeWords() {
    const { stats, levelRules, course, chests } = this.run;
    const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
    const parts = [];
    const springs = course.filter(({ spring }) => spring).length;
    if (springs) parts.push(`bounced on ${plural(stats.bounces, 'trampoline')} of ${springs}`);
    if (levelRules.gems && springs) parts.push(`found ${plural(stats.gems, 'gem')}`);
    if (chests.length) parts.push(`opened ${plural(stats.chests, 'chest')} of ${chests.length}`);
    if (levelRules.powers.length) parts.push(`picked up ${plural(stats.powers, 'power-up')}`);
    if (stats.floated) parts.push(`floated over ${plural(stats.floated, 'thing')} in a bubble`);
    if (stats.friendStars) parts.push(`a friend caught ${plural(stats.friendStars, 'star')}`);
    if (!parts.length) return '';
    const last = parts.pop();
    const words = parts.length ? `${parts.join(', ')} and ${last}` : last;
    return `${words[0].toUpperCase()}${words.slice(1)}.`;
  }

  runAgain() {
    this.confetti.stop();
    this.reader.forget();
    this.openCameraThen(() => this.beginBodyCheck());
  }

  /* ---------- every frame ---------- */

  frame(dt, now) {
    if (this.run) this.updateNew(dt);
    if (this.mates.length) this.updateMates(now);
    if (this.screen === 'run' || this.screen === 'finishing') {
      this.sendRunner(now);
      if (this.asked.size) this.settleUnanswered(now);
    }
    switch (this.screen) {
      case 'practice':
        this.updatePractice(dt, now);
        break;
      case 'countdown':
        this.updateCountdown(dt);
        break;
      case 'run':
        this.updateRun(dt, now);
        break;
      case 'finishing':
        this.run.update(dt);
        this.timer -= dt;
        if (this.timer <= 0) this.showFinish();
        break;
      default:
    }
  }
}

mountBodyShell({
  title: 'Leap Trail',
  tagline: 'Run down the trail! Jump over what’s in the way, and step from side to side to catch stars.',
  startLabel: 'Choose your runner',
  chooseTitle: 'Who’s running today?',
  chooseSide: `
      <p class="choose-tip">Jump for real, and your runner jumps too. Step to the side, and it moves across.</p>
      <button id="run-start" class="big-button" type="button">Let’s run!</button>`,
  hud: `
  <div id="move-meter" class="move-meter" data-zone="middle" aria-hidden="true">
    <div class="meter-zone meter-zone-up"></div>
    <div class="meter-middle"></div>
    <div id="meter-dot" class="meter-dot"></div>
  </div>
  <div id="practice-bar" class="practice-bar">
    <span id="practice-count" class="practice-count"></span>
    <button id="practice-skip" class="soft-button" type="button">Skip practice</button>
  </div>
  <header id="trail-top" class="trail-top">
    <div class="trail-chips">
      <div class="chip"><span class="chip-label">Stars</span><span id="stars" class="chip-value">0</span></div>
      <div class="chip"><span class="chip-label">In a row</span><span id="streak" class="chip-value">0</span></div>
      <div class="chip"><span class="chip-label">Still to go</span><span id="obstacles-left" class="chip-value">0</span></div>
      <div class="chip hearts-chip"><span class="chip-label">Hearts</span><span id="hearts" class="chip-value hearts-value"></span></div>
      <div class="chip coins-chip"><span class="chip-label">Coins</span><span class="chip-value"><span class="coin-mark" aria-hidden="true"></span><span id="coins">0</span></span></div>
    </div>
    <div class="trail-track" aria-hidden="true">
      <div id="trail-fill" class="trail-fill"></div>
      <img id="runner-portrait" class="trail-runner" alt="">
      <span class="trail-flag">🏁</span>
    </div>
  </header>
  <div id="power-row" class="power-row" aria-hidden="true"></div>
  <ol id="run-scores" class="run-scores" aria-label="Stars" hidden></ol>
  <div id="trail-new" class="trail-new" aria-hidden="true"></div>`,
  finishBody: `
      <h2 id="finish-title">You made it!</h2>
      <p class="finish-hero"><span class="hero-mark" aria-hidden="true">★</span> <span id="finish-stars">0</span> stars<span class="finish-coins"> <span class="coin-mark" aria-hidden="true"></span><span id="finish-coins">0</span> coins</span></p>
      <p id="finish-line" class="finish-open"></p>
      <p id="finish-prizes" class="finish-prizes"></p>
      <div id="finish-tally" class="finish-tally"></div>
      <p class="small-print">These numbers are shown once and not saved.</p>
      <div class="finish-actions">
        <button id="run-again" class="big-button" type="button">Run again</button>
        <button id="other-runner" class="soft-button" type="button">Choose another runner</button>
        <a class="all-games" href="../../index.html">All games</a>
      </div>`,
  panelLead: 'The game is paused. To jump for real, the camera has to see the child’s whole body, from about 2 to 3 metres away.',
  handLegend: 'Hand to raise, if raising a hand instead of jumping',
  panelSettings: `
    <fieldset class="choice">
      <legend>How to get over things</legend>
      <label><input type="radio" name="jumpWith" value="jump"> Really jumping, or a star jump</label>
      <label><input type="radio" name="jumpWith" value="lift"> Lifting a knee or a foot, for a child who can stand but not jump</label>
      <label><input type="radio" name="jumpWith" value="reach"> Raising an open hand, which can be done sitting down</label>
    </fieldset>
    <fieldset class="choice">
      <legend>Moving from side to side</legend>
      <label><input type="radio" name="trailLanes" value="yes"> Yes: stepping to the side moves the runner into another lane, for stars</label>
      <label><input type="radio" name="trailLanes" value="no"> No: the runner stays in the middle lane, and so do the stars</label>
    </fieldset>
    <fieldset class="choice">
      <legend>Running out of hearts</legend>
      <label><input type="radio" name="trailHearts" value="yes"> Yes: each stumble costs a heart, and a run is over when they’re all gone</label>
      <label><input type="radio" name="trailHearts" value="no"> Gentle: no hearts, every run gets to the finish and moves on a level</label>
    </fieldset>
    <fieldset class="choice">
      <legend>When a move is missed</legend>
      <label><input type="radio" name="onMissed" value="stumble"> The runner stumbles and carries on</label>
      <label><input type="radio" name="onMissed" value="wait"> The runner stops and waits for it, for a child who needs longer</label>
    </fieldset>
    <fieldset class="choice">
      <legend>Speed</legend>
      <label><input type="radio" name="trailPace" value="slow"> Slow</label>
      <label><input type="radio" name="trailPace" value="medium"> Medium</label>
      <label><input type="radio" name="trailPace" value="fast"> Fast</label>
    </fieldset>
    <fieldset class="choice">
      <legend>Length of the trail</legend>
      <label><input type="radio" name="obstacles" value="10"> 10 obstacles</label>
      <label><input type="radio" name="obstacles" value="20"> 20 obstacles</label>
      <label><input type="radio" name="obstacles" value="40"> 40 obstacles</label>
    </fieldset>`,
});

new LeapTrail().start();
