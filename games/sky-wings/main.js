// Sky Wings: a dogfight over an island, flown with both arms as wings. Tipping them banks and turns
// the plane, and raising or lowering them flies it up and down. Sky pirates hunt the child, and the
// child hunts them: the guns fire by themselves at any plane inside the ring. This file runs it from
// start to finish, on top of what the body games share in core/body/game.js. The rules are in
// flight.js, the picture is in sky.js, and the island is in island.js.
import { BODY_SAY, BodyGame, byElementId } from '../../core/body/game.js';
import { ROSTER } from '../../core/body/roster.js';
import { mountBodyShell } from '../../core/body/shell.js';
import { Track } from '../../core/friends.js';
import { FriendsPanel, time } from '../../core/friends-ui.js';
import { FlightSound } from './flight-sound.js';
import { DOGFIGHT, Flight, HEARTS, MOST_AT_ONCE_EVER, NEW_AT, forwardOf, isOn } from './flight.js';
import { Lesson } from './lesson.js';
import { Sky } from './sky.js';

const COUNT_FROM = 3;
const GO_SHOWN_SECONDS = 0.9;
const AFTER_FINISH_SECONDS = 2.8;
const READY_SECONDS = 1.1;
const START_HINT_SECONDS = 4;
const WINGS_DOWN_SECONDS = 1; // How long arms can be down before being asked to put them out.
const WING_TILT_SHOWN = 32; // Degrees, at a full turn.
const WING_CLIMB_SHOWN = 22;
const MARK_MARGIN = 70; // How far from the edge of the screen the arrows to other planes stay.
const LIMIT_PROMPT_FROM = 0.25;

// With friends it's against each other, a dogfight, unless a grown-up chooses together: the user asked to play
// against a friend and shoot them down. See DOGFIGHT in flight.js.
const DEFAULTS = { moveSize: 'small', pace: 'slow', planes: 6, level: 'medium', climbing: 'yes', fighter: 'giraffe', wingsFriends: 'against' };
const CHOICES = { pace: String, planes: Number, level: String, climbing: String, wingsFriends: String };

// Every one of these has a rendered voice file: see audio/voice/lines.json.
const SAY = {
  choose: 'Who’s flying today?',
  practise: 'Let’s learn to fly!',
  wings: 'Hold your arms out like wings!',
  tipRight: 'Tip your wings to the right!',
  tipLeft: 'Tip your wings to the left!',
  climb: 'Raise both arms to fly up!',
  dive: 'Lower both arms to fly down!',
  ready: 'That’s it! You’re ready to fly!',
  start: 'Sky pirates! Get them inside the ring!',
  behind: 'Behind you! Turn around!',
  oneLeft: 'One more to go!',
  limit: 'Back to the island!',
  won: 'You dropped them all!',
  lost: 'So close! Fly again!',
};

// Words for the moment a thing has been seen, which aren't spoken.
const SEEN_WORDS = {
  wings: ['Those are wings!', 'ეს ფრთებია!'],
  tipRight: ['You tipped right!', 'მარჯვნივ დახარე!'],
  tipLeft: ['You tipped left!', 'მარცხნივ დახარე!'],
  climb: ['Up you go!', 'მაღლა მიფრინავ!'],
  dive: ['Down you go!', 'დაბლა მიფრინავ!'],
};
const GOT_ONE = { en: 'Got one!', ka: 'ერთი ჩამოაგდე!' };

// The powers in the gift boxes, as they're shown. Nothing new is spoken: the words are only on screen.
const POWER_LOOK = {
  triple: { mark: '🔱', en: 'Triple shot', ka: 'სამმაგი სროლა' },
  bubble: { mark: '🫧', en: 'Bubble shot', ka: 'ბუშტების სროლა' },
  snow: { mark: '❄️', en: 'Snowflake shot', ka: 'ფიფქების სროლა' },
  shield: { mark: '🛡️', en: 'Shield bubble', ka: 'დამცავი ბუშტი' },
  helper: { mark: '🤝', en: 'helps!', ka: 'გეხმარება!' },
  paper: { mark: '📄', en: 'Paper planes', ka: 'ქაღალდის თვითმფრინავები' },
};
// The new kinds of pirate, named the first time one comes in each flight.
const KIND_NAMES = {
  scout: { en: 'Scout', ka: 'მზვერავი' },
  balloon: { en: 'Balloon pirate', ka: 'ბუშტიანი მეკობრე' },
  lead: { en: 'Pirate pair', ka: 'მეკობრეთა წყვილი' },
  wing: { en: 'Pirate pair', ka: 'მეკობრეთა წყვილი' },
  captain: { en: 'Captain', ka: 'კაპიტანი' },
  airship: { en: 'Treasure airship', ka: 'განძის ხომალდი' },
};
// The coin is drawn rather than an emoji, as the coin emoji comes out grey.
const PRIZE_MARKS = { coin: '', gem: '💎', medal: '🏅', chest: '💰' };
const prizeIcon = (kind) => {
  const icon = document.createElement('span');
  icon.className = 'prize-icon';
  icon.dataset.kind = kind;
  icon.textContent = PRIZE_MARKS[kind];
  return icon;
};
const PRIZE_WORDS = { coin: ['gold coin', 'gold coins'], gem: ['gem', 'gems'], medal: ['medal', 'medals'], chest: ['treasure chest', 'treasure chests'] };
const NAME_SHOWN_SECONDS = 3.5;

// Flying with friends, each on their own computer: see core/friends-ui.js for what each of these is.
const FLY_WORDS = {
  toggle: 'Fly with a friend',
  make: 'Make a flight',
  codeLabel: 'A friend’s flight code',
  codeName: 'Flight code',
  how: 'Tell your friend the code. Then you both choose a pilot and press <b>Let’s fly!</b>, and try to get each other inside your ring.',
  // Against each other, a dogfight, or together against the sky pirates, as whoever made the flight chooses.
  together: 'Together',
  against: 'Against each other',
  howTogether: 'Tell your friend the code. Then you both choose a pilot and press <b>Let’s fly!</b>, and drop the sky pirates together.',
  leave: 'Leave this flight',
  privacy: 'Only your name, who flies, whether you chose together or against each other, where your plane is and whose plane yours put out go to your friends. The camera picture stays on this computer.',
  alone: 'Fly on your own',
  full: 'That flight already has 4 planes.',
  lost: 'Can’t reach the flight. Check the internet, then try again.',
  left: 'You’ve left the flight.',
  badCode: 'A flight code is 3 letters and numbers.',
  busy: 'Flying',
  still: 'still flying',
};
const PLANES = [3, 6, 9]; // The numbers of planes to drop a host can have chosen.
const MOST_FRIENDS = 3;
const START_APART = 24; // Metres between friends' planes at the start, side by side, rather than all in one place.
// A dogfight's start: the middle of the circle is so far ahead of where a plane starts alone, and each plane is so
// far out from it, so that two start a little further apart than their guns reach.
const DOGFIGHT_START = { ahead: 180, apart: 140 };
// Words on the screen in a dogfight, which aren't spoken.
const DOGFIGHT_WORDS = {
  start: { en: 'Get your friend inside the ring!', ka: 'მეგობარი რგოლში მოაქციე!' },
  out: { en: 'Smoke! Back in a moment', ka: 'კვამლი! ცოტაც და დაბრუნდები' },
};
// A friend's plane between what their game sends: where it is, its pitch, roll and speed, the way it heads,
// which goes the short way round, and, with nothing new for a moment, carrying on the way it was going.
const PLANE_TRACK = {
  lerp: ['x', 'y', 'z', 'p', 'r', 's'],
  angles: ['h'],
  steps: ['f'],
  guess: (last, seconds) => {
    const way = forwardOf(last.h, last.p);
    return { x: last.x + way.x * last.s * seconds, y: last.y + way.y * last.s * seconds, z: last.z + way.z * last.s * seconds };
  },
};

class SkyWings extends BodyGame {
  constructor() {
    super({
      defaults: DEFAULTS,
      choices: CHOICES,
      // These go on to a game that's being played at once. The rest, and the level, start it again.
      atOnce: [],
      lines: new URL('./audio/voice/lines.json', import.meta.url),
      createSound: (options) => new FlightSound(options),
    });
    this.flight = null;
    this.lesson = null;
    this.learned = false;
    this.timer = 0;
    this.countLeft = 0;
    this.lastNumbers = {};
    this.upperBodyOnly = true; // It can all be done sitting down.
    this.armsOut = true;
    this.wingsDownFor = 0;
    this.marks = [];
    this.mates = []; // Friends flying on their own computers, in this flight: see setUpMates.
    this.goAt = 0;
  }

  setUp() {
    this.sky = new Sky(byElementId('game'));
    this.stage = this.sky;
    this.sky.setView('choose', { snap: true });
    this.sky.onSizeChanged = () => this.sizeAim();
    this.reader.upperBodyOnly = true;

    byElementId('start').addEventListener('click', () => {
      this.sound.unlock();
      this.setScreen('choose');
      this.sound.ready.then(() => {
        if (this.screen === 'choose') this.sound.say(SAY.choose);
      });
    });
    byElementId('fly-start').addEventListener('click', () => this.openCameraThen(() => this.beginBodyCheck()));
    byElementId('fly-again').addEventListener('click', () => {
      this.confetti.stop();
      this.reader.forget();
      this.openCameraThen(() => this.beginBodyCheck());
    });
    byElementId('other-pilot').addEventListener('click', () => {
      this.confetti.stop();
      this.sky.setFlight(null);
      this.flight = null;
      this.sky.setLive(null);
      this.sky.setView('choose');
      this.setScreen('choose');
    });
    byElementId('lesson-skip').addEventListener('click', () => this.endLesson());
    byElementId('recheck').addEventListener('click', () => {
      byElementId('panel').close();
      this.learned = false;
      if (this.camera.running) this.beginBodyCheck(this.screen === 'fly' ? 'resume' : 'start');
      else this.openCameraThen(() => this.beginBodyCheck());
    });
    this.buildMarks();
    this.sizeAim();
    // Flying with friends, if a grown-up makes or joins a flight.
    this.friends = new FriendsPanel({
      game: 'sky-wings',
      linkKey: 'fly',
      words: FLY_WORDS,
      hello: () => ({ driver: this.chosen?.id ?? this.settings.fighter, level: this.levels.current, length: this.settings.planes }),
      screen: () => this.screen,
      portraits: () => this.portraits,
      onGone: (friend) => this.friendGone(friend),
      resultText: ({ ms, won, dropped }) => (this.flight?.dogfight ? `${dropped} ${dropped === 1 ? 'hit plane' : 'hit planes'}` : won ? `all ${dropped} in ${time(ms)}` : `${dropped} dropped`),
      // Against each other, a dogfight, or together against the pirates: the grown-ups' choice.
      teams: {
        get: () => (this.settings.wingsFriends === 'together' ? 'together' : 'against'),
        set: (choice) => this.chooseTeams(choice),
      },
      onMove: (id, message) => this.fromFriend(id, message),
      startAfter: byElementId('start'),
      waitingBefore: byElementId('screen-finish'),
      resultsAfter: byElementId('finish-place'),
      finishTitle: byElementId('finish-title'),
    });
  }

  debug() {
    const game = this;
    return {
      sky: this.sky,
      get flight() {
        return game.flight;
      },
      get lesson() {
        return game.lesson;
      },
      get friends() {
        return game.friends;
      },
      get mates() {
        return game.mates;
      },
    };
  }

  /**
   * What a level brings that's new, for the cards: see NEW_AT in flight.js. Only what really comes with
   * this many planes to drop: with three, there are never four at once, and the kinds new at a level
   * come first, so a pair with a captain leaves no room for a scout or a balloon.
   */
  newAt(level) {
    return (NEW_AT[level] ?? []).filter(({ thing }) => isOn(thing, level, this.settings.planes)).map(({ thing, mark, name, nameKa }) => {
      if (thing !== 'gift:helper') return { mark, name, nameKa };
      // The friend who helps is Giraffe, unless the child is flying as Giraffe.
      const helper = this.helperSpec();
      return helper.id === 'giraffe' ? { mark, name: 'Giraffe helps', nameKa: 'ჟირაფი გეხმარება' } : { mark: '🤝', name: `${helper.name} helps`, nameKa: `${helper.nameKa ?? helper.name} გეხმარება` };
    });
  }

  /** The friend who comes to help: Giraffe first, or someone who isn't a pirate this time. */
  helperSpec() {
    const chosen = this.chosen?.id ?? this.settings.fighter;
    if (chosen !== 'giraffe') return ROSTER[0];
    const pirates = new Set(ROSTER.filter(({ id }) => id !== chosen).slice(0, this.settings.planes).map(({ id }) => id));
    return ROSTER.find(({ id }) => id !== chosen && !pirates.has(id)) ?? ROSTER.at(-1);
  }

  /**
   * Who flies the pirate planes: everyone but the child's own character, in the roster's order. On the
   * levels with a friend who helps, never that friend too, so Giraffe isn't helping and a pirate at once, and
   * never a character a friend flying with the child chose. With too few left for the planes, some fly twice.
   */
  pirateSpecs(total, friendly = []) {
    const helping = this.flight.levelRules.gifts.includes('helper');
    const pool = ROSTER.filter(({ id }) => id !== this.chosen.id && !(helping && id === this.helper.id) && !friendly.includes(id));
    return Array.from({ length: total }, (_, index) => pool[index % pool.length]);
  }

  settingChanged(change) {
    if ('moveSize' in change) {
      this.reader.personal.wings = null;
      this.learned = false;
    }
    if ('level' in change) this.sizeAim();
    // What the cards say is new depends on how many planes there are.
    if ('planes' in change) this.levelUi.refresh();
    // Friends are shown the choice at once, as it's the host's that counts.
    if ('wingsFriends' in change && this.friends) {
      if (this.friends.room.inRoom) this.friends.room.tell(this.friends.hello());
      this.friends.showTeams();
    }
  }

  /** Together or against each other, chosen in the friends box: kept with the grown-ups' settings, and shown there. */
  chooseTeams(choice) {
    this.changeSettings({ wingsFriends: choice });
    const input = document.querySelector(`input[name="wingsFriends"][value="${choice}"]`);
    if (input) input.checked = true;
  }

  showChosen(spec) {
    this.sky.setPilot(spec);
    // The friend who helps depends on who's flying.
    this.levelUi?.refresh();
  }

  afterBodyCheck(then) {
    if (then === 'resume') this.setScreen('fly');
    else if (this.learned) this.beginCountdown();
    else this.beginLesson();
  }

  /** Nothing here comes from a single move: the arms are read all the time. */
  onMoves() {}

  /** The little pair of wings that shows how the arms are being read. */
  updateWingMeter() {
    const { wings } = this.reader;
    const tilt = Math.round(wings.bank * WING_TILT_SHOWN);
    const lift = Math.round(wings.climb * -WING_CLIMB_SHOWN);
    const out = wings.out ? 'yes' : 'no';
    const key = `${tilt},${lift},${out}`;
    if (this.lastNumbers.meter === key) return;
    this.lastNumbers.meter = key;
    byElementId('wing-pair').style.transform = `translateY(${lift}px) rotate(${tilt}deg)`;
    byElementId('wing-meter').dataset.out = out;
  }

  /* ---------- learning to fly ---------- */

  beginLesson() {
    this.sky.setFlight(null);
    this.flight = null;
    this.sky.setView('lesson');
    this.lastNumbers = {};
    this.readyLeft = 0;
    this.setScreen('lesson');
    this.sound.say(SAY.practise);
    const steps = ['wings', 'tipRight', 'tipLeft', ...(this.settings.climbing === 'yes' ? ['climb', 'dive'] : [])];
    this.lesson = new Lesson({
      steps,
      reader: this.reader,
      onEvent: (event) => this.onLessonEvent(event),
    });
  }

  /** The film and the words for one thing to learn. */
  lessonStep(step) {
    const { hands } = this.settings;
    return {
      wings: { demo: 'wings', text: SAY.wings, side: hands },
      tipRight: { demo: 'tip', text: SAY.tipRight, side: 'right' },
      tipLeft: { demo: 'tip', text: SAY.tipLeft, side: 'left' },
      climb: { demo: 'climb', text: SAY.climb, side: hands },
      dive: { demo: 'dive', text: SAY.dive, side: hands },
    }[step];
  }

  onLessonEvent({ type, step, index, total }) {
    if (type === 'step') {
      const { demo, text, side } = this.lessonStep(step);
      this.showCoach(demo, this.translate(text), { side });
      byElementId('lesson-count').textContent = `${index + 1} / ${total}`;
      this.sound.say(text);
    } else if (type === 'success') {
      this.hideCoach();
      this.showSeen(SEEN_WORDS[step], { x: 0.2, y: 0.42 });
    } else if (type === 'finished') {
      this.sound.say(SAY.ready);
      this.readyLeft = READY_SECONDS;
    }
  }

  updateLesson(dt, now) {
    const { lesson } = this;
    this.updateWingMeter();
    if (this.readyLeft > 0) {
      this.readyLeft -= dt;
      if (this.readyLeft <= 0) this.endLesson();
      return;
    }
    if (this.bodyLost()) {
      this.sky.setLive(null);
      this.prompt.show({ key: 'come-back', text: BODY_SAY.comeBack, side: null }, now);
      return;
    }
    this.prompt.show(null, now);
    this.sky.setLive(this.reader.hasPose ? this.reader.pose : null);
    this.sky.setBank(this.reader.wings.out ? this.reader.wings.bank : 0);
    this.setCoachEffort(lesson.effort);
    lesson.update(dt);
  }

  endLesson() {
    this.lesson = null;
    this.learned = true;
    this.hideCoach();
    this.prompt.clear();
    this.beginCountdown();
  }

  /* ---------- a dogfight ---------- */

  /** Ready to fly. With friends, everyone waits for the others first, and then all count down together. */
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
    const { settings, sky } = this;
    // With friends, everyone flies the host's level and number of planes, which doesn't move anyone's own
    // level on.
    const friendly = this.friends.current;
    document.body.toggleAttribute('data-friends-race', Boolean(friendly));
    const levelNumber = friendly ? friendly.level : this.startLevel();
    // Against each other, it's a dogfight in the same sky, with no pirates.
    const dogfight = Boolean(friendly && !friendly.team && friendly.friends.length);
    this.flight = new Flight({
      planes: friendly && PLANES.includes(friendly.length) ? friendly.length : settings.planes,
      pace: settings.pace,
      level: settings.level,
      levelNumber,
      climbing: settings.climbing === 'yes',
      dogfight,
      onEvent: (event) => this.onFlightEvent(event),
    });
    this.helper = this.helperSpec();
    this.pirates = this.pirateSpecs(this.flight.total, (friendly?.friends ?? []).map(({ spec }) => spec.id));
    document.body.toggleAttribute('data-dogfight', dogfight);
    if (dogfight) this.faceEachOther(friendly);
    // Together, side by side, in the same order on every computer.
    else if (friendly) this.flight.x += (friendly.mySlot - (friendly.racers.length - 1) / 2) * START_APART;
    this.friendsOut = new Map(); // A dogfight: each friend's count of whose plane they put out, as the last heard.
    this.friendScores = new Map(); // And how many each has put out in all.
    this.putOut = new Map(); // How many times this child's plane has put out each friend's.
    sky.setFlight(this.flight, this.pirates, this.helper);
    this.setUpMates(friendly);
    this.namedKinds = new Set();
    this.namedPowers = new Set();
    byElementId('treasure-chip').dataset.on = this.flight.levelRules.prizes ? 'yes' : 'no';
    byElementId('power').dataset.on = 'no';
    sky.setView('fly');
    this.lastNumbers = {};
    this.wingsDownFor = 0;
    this.sizeAim();
    this.hideCoach();
    this.updateHud();
    this.updateMarks();
    this.countLeft = COUNT_FROM;
    this.setCount(String(COUNT_FROM));
    this.sound.count(COUNT_FROM);
    this.setScreen('countdown');
  }

  /**
   * A dogfight: everyone starts round a circle out over the sea, each heading in across it towards the others, the
   * same on every computer, so that friends meet straight away.
   */
  faceEachOther(friendly) {
    const { flight } = this;
    const ahead = forwardOf(flight.heading, 0);
    const middle = { x: flight.x + ahead.x * DOGFIGHT_START.ahead, z: flight.z + ahead.z * DOGFIGHT_START.ahead };
    const turn = (friendly.mySlot / friendly.racers.length) * Math.PI * 2;
    // Each starts on the far side of the middle from where their heading points.
    flight.heading = flight.heading + turn;
    const facing = forwardOf(flight.heading, 0);
    flight.x = middle.x - facing.x * DOGFIGHT_START.apart;
    flight.z = middle.z - facing.z * DOGFIGHT_START.apart;
  }

  /** Friends' planes, each following what their own game sends about where it is. */
  setUpMates(friendly) {
    const friends = (friendly?.friends ?? []).slice(0, MOST_FRIENDS);
    this.mates = friends.map((friend) => {
      const track = new Track(PLANE_TRACK);
      this.friends.follow(friend.id, track);
      return { friend, track, x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0, speed: 0, live: true, seen: false, outLeft: 0, hitsTaken: 0 };
    });
    this.flight.mates = this.mates;
    this.sky.setMates(friends.map(({ spec }) => spec), this.mates);
  }

  /** Where each friend's plane is now, a moment behind where their game says, so that it moves smoothly. */
  updateMates() {
    const now = performance.now();
    for (const mate of this.mates) {
      const at = mate.live ? mate.track.at(now) : null;
      if (at) Object.assign(mate, { x: at.x, y: at.y, z: at.z, heading: at.h, pitch: at.p, roll: at.r, speed: at.s, seen: true });
    }
  }

  /** A friend has gone in the middle of a flight, and their plane goes too. */
  friendGone(friend) {
    const mate = this.mates.find((each) => each.friend.id === friend.id);
    if (mate) mate.live = false;
  }

  updateCountdown(dt) {
    const before = Math.ceil(this.countLeft);
    this.countLeft -= dt;
    const after = Math.ceil(this.countLeft);
    if (this.countLeft <= 0) this.beginFlying();
    else if (after !== before) {
      this.setCount(String(after));
      this.sound.count(after);
    }
  }

  beginFlying() {
    this.goAt = performance.now();
    this.setCount(this.translate('Go!'));
    this.sound.go();
    this.sound.startFlying();
    this.timer = GO_SHOWN_SECONDS;
    this.hintLeft = START_HINT_SECONDS;
    this.flight.begin();
    this.setScreen('fly');
    this.asking = 'tip';
    if (this.flight.dogfight) {
      // No pirates: the friend is the one to get inside the ring. Shown, and not said.
      this.showCoach('tip', DOGFIGHT_WORDS.start[this.settings.language] ?? DOGFIGHT_WORDS.start.en, { side: this.settings.hands });
    } else {
      this.showCoach('tip', this.translate(SAY.start), { side: this.settings.hands });
      this.sound.say(SAY.start);
    }
  }

  updateFlying(dt, now) {
    const { flight, reader, settings, sky } = this;
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) this.setCount('');
    }

    // Nobody in the picture: everything waits.
    if (this.bodyLost()) {
      this.sound.guns(false);
      this.prompt.show({ key: 'come-back', text: BODY_SAY.comeBack, side: null }, now);
      return;
    }

    const { wings } = reader;
    flight.update(dt, { out: wings.out, bank: wings.bank, climb: wings.climb });
    if (flight.dogfight) this.dogfightOver();
    if (flight.state !== 'flying') return;
    // Where this plane is, for friends' games, timed by the clock on the wall.
    const heading = Math.atan2(Math.sin(flight.heading), Math.cos(flight.heading));
    this.friends.sendMove('plane', { x: flight.x, y: flight.y, z: flight.z, h: heading, p: flight.pitch, r: flight.roll, s: flight.speed, f: flight.firing ? 1 : 0 }, performance.now() - this.goAt);

    sky.setLive(reader.hasPose ? reader.pose : null);
    this.sound.propeller(flight.speed / flight.pace.speed);
    this.updateWingMeter();
    this.updateHud();
    this.updateMarks();
    this.updateGiftMark();

    this.wingsDownFor = wings.out ? 0 : this.wingsDownFor + dt;
    if (this.hintLeft > 0) this.hintLeft -= dt;

    // On Gentle a rest is left alone, and the coach stops asking. On the harder settings the pirates keep
    // coming, so the wings are still asked for.
    if (this.wingsDownFor > WINGS_DOWN_SECONDS && !flight.safeResting) {
      this.showAsk('wings', this.translate(SAY.wings), settings.hands);
      this.prompt.show({ key: 'wings', text: SAY.wings, side: null }, now);
    } else if (flight.atLimit > LIMIT_PROMPT_FROM) {
      this.prompt.show({ key: 'limit', text: SAY.limit, side: null, silent: flight.atLimit < 1 }, now);
      if (this.hintLeft <= 0) this.clearAsk();
    } else {
      if (this.hintLeft <= 0) this.clearAsk();
      this.prompt.show(null, now);
    }
    if (this.asking === 'wings') this.setCoachEffort(reader.effortFor('wings'));
  }

  /** Shows a film, unless it's the one already showing. */
  showAsk(demo, text, side) {
    if (this.asking === demo) return;
    this.asking = demo;
    this.showCoach(demo, text, { side });
  }

  clearAsk() {
    if (!this.asking) return;
    this.asking = null;
    this.hideCoach();
  }

  updateHud() {
    const { flight, lastNumbers } = this;
    const { left, dropped, hearts } = flight;
    if (lastNumbers.left !== left) {
      lastNumbers.left = left;
      byElementId('planes-left').textContent = String(left);
    }
    if (lastNumbers.dropped !== dropped) {
      lastNumbers.dropped = dropped;
      byElementId('dropped').textContent = String(dropped);
    }
    if (lastNumbers.hearts !== hearts) {
      lastNumbers.hearts = hearts;
      byElementId('hearts').textContent = '♥'.repeat(hearts) + '♡'.repeat(HEARTS - hearts);
    }
    const treasure = this.treasureWords();
    if (lastNumbers.treasure !== treasure) {
      lastNumbers.treasure = treasure;
      const shown = byElementId('treasure');
      shown.replaceChildren();
      for (const [kind, count] of this.treasureShown()) {
        const item = document.createElement('span');
        item.className = 'treasure-item';
        item.dataset.kind = kind;
        item.append(prizeIcon(kind), String(count));
        shown.append(item);
      }
    }
    const power = flight.power ? Math.ceil((flight.power.left / flight.power.total) * 20) : 0;
    if (lastNumbers.power !== power) {
      lastNumbers.power = power;
      byElementId('power-fill').style.width = `${power * 5}%`;
    }
    const locked = flight.locked ? 'yes' : 'no';
    if (lastNumbers.locked !== locked) {
      lastNumbers.locked = locked;
      byElementId('aim').dataset.locked = locked;
    }
  }

  /** The prizes so far, as little pictures and numbers, with a coin even before there are any. */
  treasureShown() {
    return Object.entries(this.flight.stats.prizes).filter(([kind, count]) => count > 0 || kind === 'coin');
  }

  treasureWords() {
    return this.treasureShown().map(([kind, count]) => `${kind} ${count}`).join(', ');
  }

  /** Words in the language chosen, from an { en, ka } pair. */
  words(pair) {
    return this.settings.language === 'ka' ? pair.ka : pair.en;
  }

  powerName(kind) {
    const look = POWER_LOOK[kind];
    if (kind === 'helper') return `${this.words({ en: this.helper.name, ka: this.helper.nameKa ?? this.helper.name })} ${this.words(look)}`;
    return this.words(look);
  }

  /* ---------- the ring, and where the other planes are ---------- */

  /** The ring on the screen is exactly what the guns fire at, whatever the size of the window. */
  sizeAim() {
    const size = `${Math.round(this.sky.aimDiameter(this.settings.level))}px`;
    const aim = byElementId('aim');
    aim.style.width = size;
    aim.style.height = size;
  }

  buildMarks() {
    const holder = byElementId('marks');
    this.marks = Array.from({ length: MOST_AT_ONCE_EVER }, () => {
      const root = document.createElement('div');
      root.className = 'mark';
      const box = document.createElement('span');
      box.className = 'mark-box';
      const face = document.createElement('img');
      face.className = 'mark-face';
      face.alt = '';
      const bar = document.createElement('span');
      bar.className = 'mark-bar';
      const fill = document.createElement('span');
      fill.className = 'mark-fill';
      bar.append(fill);
      const arrow = document.createElement('span');
      arrow.className = 'mark-arrow';
      const name = document.createElement('span');
      name.className = 'mark-name';
      root.append(box, face, bar, arrow, name);
      holder.append(root);
      return { root, face, fill, arrow, name, enemy: null };
    });
    // A friend's name and face over their plane, while it can be seen.
    this.mateMarks = Array.from({ length: MOST_FRIENDS }, () => {
      const root = document.createElement('div');
      root.className = 'mate-mark';
      root.dataset.where = 'none';
      const face = document.createElement('img');
      face.className = 'mate-face';
      face.alt = '';
      const name = document.createElement('span');
      name.className = 'mate-name';
      root.append(face, name);
      holder.append(root);
      return { root, face, name, mate: null };
    });
    // The gift box's mark: its power's picture, and the power's name the first time it comes.
    const gift = document.createElement('div');
    gift.id = 'gift-mark';
    gift.className = 'gift-mark';
    gift.dataset.where = 'none';
    gift.innerHTML = '<span class="gift-icon"></span><span class="gift-name"></span>';
    holder.append(gift);
  }

  updateGiftMark() {
    const { flight, sky } = this;
    const mark = byElementId('gift-mark');
    const { gift } = flight;
    if (!gift) {
      if (mark.dataset.where !== 'none') mark.dataset.where = 'none';
      return;
    }
    if (mark.dataset.kind !== gift.kind || mark.gift !== gift) {
      mark.gift = gift;
      mark.dataset.kind = gift.kind;
      mark.querySelector('.gift-icon').textContent = POWER_LOOK[gift.kind].mark;
      const first = !this.namedPowers.has(gift.kind);
      this.namedPowers.add(gift.kind);
      mark.querySelector('.gift-name').textContent = first ? this.powerName(gift.kind) : '';
      mark.dataset.named = first ? 'yes' : 'no';
    }
    const seen = sky.project(gift.x, gift.y, gift.z);
    const onScreen = !seen.behind && seen.x > 0 && seen.x < sky.width && seen.y > 0 && seen.y < sky.height;
    mark.dataset.where = onScreen ? 'on' : 'off';
    if (onScreen) mark.style.transform = `translate(${Math.round(seen.x)}px, ${Math.round(seen.y)}px)`;
  }

  /** A mark on each plane that can be seen, and an arrow at the edge of the screen to any that can't. */
  updateMarks() {
    const { flight, sky, marks } = this;
    // In a dogfight the friends' planes are the ones to find and get in the ring, with an arrow to any off the screen.
    const planes = flight.dogfight ? this.mates.filter(({ live, seen }) => live && seen) : flight.flying;
    // From where the camera is now, rather than a frame ago, so that the marks stay on the planes.
    sky.updateCamera(0);
    marks.forEach((mark, index) => {
      const enemy = planes[index];
      if (!enemy) {
        mark.root.dataset.where = 'none';
        mark.enemy = null;
        return;
      }
      if (mark.enemy !== enemy) {
        mark.enemy = enemy;
        const pilot = enemy.friend ? enemy.friend.spec : this.pirates[enemy.index % this.pirates.length];
        mark.face.src = this.portraits[pilot.id];
      }
      const seen = sky.project(enemy.x, enemy.y, enemy.z);
      const { width, height } = sky;
      const onScreen = !seen.behind && seen.x > 0 && seen.x < width && seen.y > 0 && seen.y < height;
      mark.root.dataset.hunting = enemy.mode === 'hunt' ? 'yes' : 'no';
      mark.root.dataset.locked = enemy === flight.locked ? 'yes' : 'no';
      mark.root.dataset.captain = enemy.captain ? 'yes' : 'no';
      mark.root.dataset.kind = enemy.kind;
      mark.root.dataset.slow = enemy.slowLeft > 0 ? 'yes' : 'no';
      // A new kind of pirate is named the first time one is seen in a flight, for a few seconds.
      const named = KIND_NAMES[enemy.kind];
      const group = enemy.kind === 'wing' ? 'lead' : enemy.kind;
      if (onScreen && named && !this.namedKinds.has(group)) {
        this.namedKinds.add(group);
        enemy.nameUntil = flight.time + NAME_SHOWN_SECONDS;
      }
      const label = (enemy.nameUntil ?? 0) > flight.time ? this.words(named) : '';
      if (mark.label !== label) {
        mark.label = label;
        mark.name.textContent = label;
        mark.root.dataset.named = label ? 'yes' : 'no';
      }
      const share = enemy.friend ? (enemy.outLeft > 0 ? 0 : 1 - (enemy.hitsTaken ?? 0) / DOGFIGHT.hits) : enemy.hitsLeft / enemy.hitsTotal;
      mark.fill.style.width = `${Math.round(share * 100)}%`;
      mark.root.dataset.out = enemy.outLeft > 0 ? 'yes' : 'no';
      if (onScreen) {
        mark.root.dataset.where = 'on';
        mark.root.style.transform = `translate(${Math.round(seen.x)}px, ${Math.round(seen.y)}px)`;
        return;
      }
      // Off to one side, or round behind: the arrow says which way to turn.
      const way = seen.behind ? -1 : 1;
      const dx = (seen.x - width / 2) * way;
      const dy = (seen.y - height / 2) * way;
      const size = Math.hypot(dx, dy) || 1;
      const reach = Math.min((width / 2 - MARK_MARGIN) / Math.max(1e-3, Math.abs(dx / size)), (height / 2 - MARK_MARGIN) / Math.max(1e-3, Math.abs(dy / size)));
      mark.root.dataset.where = 'off';
      mark.root.style.transform = `translate(${Math.round(width / 2 + (dx / size) * reach)}px, ${Math.round(height / 2 + (dy / size) * reach)}px)`;
      mark.arrow.style.transform = `rotate(${Math.round((Math.atan2(dy, dx) * 180) / Math.PI)}deg)`;
    });
    this.updateMateMarks();
  }

  /** Each friend's name over their plane, while it's on the screen. There are no arrows to friends. */
  updateMateMarks() {
    const { sky } = this;
    this.mateMarks.forEach((mark, index) => {
      const mate = this.mates[index];
      const seen = mate?.live && mate.seen ? sky.project(mate.x, mate.y, mate.z) : null;
      const onScreen = seen && !seen.behind && seen.x > 0 && seen.x < sky.width && seen.y > 0 && seen.y < sky.height;
      mark.root.dataset.where = onScreen ? 'on' : 'none';
      if (!onScreen) return;
      const name = this.flight?.dogfight ? `${mate.friend.spec.name} ${this.friendScores?.get(mate.friend.id) ?? 0}` : mate.friend.spec.name;
      if (mark.mate !== mate || mark.name.textContent !== name) {
        mark.mate = mate;
        mark.face.src = this.portraits[mate.friend.spec.id] ?? '';
        mark.name.textContent = name;
      }
      mark.root.style.transform = `translate(${Math.round(seen.x)}px, ${Math.round(seen.y)}px)`;
    });
  }

  /* ---------- what happened ---------- */

  onFlightEvent(event) {
    const handlers = {
      firing: () => this.sound.guns(event.on),
      hit: () => this.onHit(event),
      down: () => this.onDown(event),
      'enemy-shot': () => this.sound.theirShot(),
      hurt: () => this.onHurt(),
      behind: () => this.sound.say(SAY.behind, { ifQuiet: true }),
      prize: () => this.onPrize(event),
      power: () => this.onPower(event),
      bubbled: () => {
        this.sky.bubbled(event.enemy);
        this.sound.bubble();
      },
      shielded: () => {
        this.sky.shieldBlocked();
        this.sound.blocked();
      },
      slowed: () => this.sound.slowed(),
      paper: () => this.sound.paper(),
      resting: () => this.onResting(event),
      won: () => this.onFinished(true),
      lost: () => this.onFinished(false),
      'mate-hit': () => {
        this.sky.hitMate(this.mates.indexOf(event.mate));
        this.sound.hit();
      },
      'mate-out': () => this.onMateOut(event),
      out: () => this.onOut(),
    };
    handlers[event.type]?.();
  }

  /* ---------- a dogfight with friends ---------- */

  /**
   * Something from a friend's game: where their plane is, which goes to the track following it, and in a dogfight,
   * whose plane they've put out and how many they've put out in all.
   */
  fromFriend(id, message) {
    if (message.t === 'plane') {
      this.friends.current?.tracks.get(id)?.push(message, performance.now());
      return;
    }
    const { flight } = this;
    if (!flight?.dogfight || flight.state !== 'flying') return;
    if (message.t === 'score') {
      this.friendScores.set(id, message.n);
      return;
    }
    if (message.t !== 'hit') return;
    // r is whose plane, by their place, and tot how many times in all this friend has put it out: each is heard once.
    const key = `${id}:${message.r}`;
    if (!(message.tot > (this.friendsOut.get(key) ?? 0))) return;
    this.friendsOut.set(key, message.tot);
    const slot = message.r - 1;
    if (slot === this.friends.current?.mySlot) flight.knockedOut();
    else {
      const mate = this.mates.find(({ friend }) => friend.slot === slot);
      if (mate) flight.mateOut(mate);
    }
  }

  /** A friend's plane is out of the fight for a moment. When this child's put it out, every game is told. */
  onMateOut({ mate, mine }) {
    this.sky.mateOut(this.mates.indexOf(mate));
    if (!mine) return;
    const times = (this.putOut.get(mate.friend.id) ?? 0) + 1;
    this.putOut.set(mate.friend.id, times);
    const ms = performance.now() - this.goAt;
    this.friends.sendHit({ r: mate.friend.slot + 1, tot: times, d: 1 }, ms);
    this.friends.sendScore(this.flight.stats.dropped, ms);
    this.sound.down();
    this.callout(GOT_ONE[this.settings.language] ?? GOT_ONE.en, { kind: 'is-big', x: 0.42, y: 0.26 });
  }

  /** A friend put this child's plane out: it trails smoke for a moment, and that's all. */
  onOut() {
    this.sky.childOut();
    this.sound.hurt();
    this.callout(DOGFIGHT_WORDS.out[this.settings.language] ?? DOGFIGHT_WORDS.out.en, { kind: 'is-combo', x: 0.5, y: 0.36 });
  }

  /** A dogfight is over once a friend has won it, and won by whoever's still here if all the others have gone. */
  dogfightOver() {
    const { flight } = this;
    if (flight.state !== 'flying') return;
    const results = [...(this.friends.results?.entries() ?? [])];
    if (results.some(([id, { won }]) => won && id !== this.friends.room.you)) flight.beaten();
    else if (this.mates.length && this.mates.every(({ live }) => !live)) flight.walkover();
  }

  onHit({ enemy }) {
    this.sky.hitEnemy(enemy);
    this.sound.hit();
  }

  onDown({ enemy, left }) {
    this.sky.enemyDown(enemy);
    this.sound.down();
    this.callout(GOT_ONE[this.settings.language] ?? GOT_ONE.en, { kind: 'is-big', x: 0.42, y: 0.26 });
    if (left === 1) this.sound.say(SAY.oneLeft, { ifQuiet: true });
  }

  onPrize({ prize }) {
    this.sky.prizeCaught(prize);
    this.sound.prize(prize.kind);
    if (this.screen === 'fly') this.callout(prize.kind === 'coin' ? '+1' : `+${PRIZE_MARKS[prize.kind]}`, { kind: 'is-number', x: 0.5, y: 0.66 });
  }

  onPower({ kind, on }) {
    const chip = byElementId('power');
    if (!on) {
      if (chip.dataset.kind === kind) chip.dataset.on = 'no';
      return;
    }
    chip.dataset.on = 'yes';
    chip.dataset.kind = kind;
    byElementId('power-mark').textContent = POWER_LOOK[kind].mark;
    byElementId('power-name').textContent = this.powerName(kind);
    this.lastNumbers.power = null;
    this.sound.gift();
    this.callout(`${POWER_LOOK[kind].mark} ${this.powerName(kind)}`, { kind: 'is-combo', x: 0.5, y: 0.36 });
  }

  onHurt() {
    this.sky.childHit();
    this.sound.hurt();
    const hearts = byElementId('hearts');
    hearts.classList.remove('is-hurt');
    void hearts.offsetWidth;
    hearts.classList.add('is-hurt');
  }

  onResting({ on }) {
    if (on && this.flight.level.restSafe) {
      this.sound.say(BODY_SAY.waiting, { ifQuiet: true });
      this.clearAsk();
    }
  }

  /**
   * What a round leaves going, stopped when a grown-up's change in the panel starts the game again: see
   * startAgain in core/body/game.js.
   */
  leaveRound() {
    this.sound.stopFlying();
  }

  onFinished(won) {
    const { sky, sound } = this;
    this.won = won;
    this.friends.finished(performance.now() - this.goAt, { w: won ? 1 : 0, n: this.flight.stats.dropped });
    this.camera.stop();
    this.reader.forget();
    this.latestBody = null;
    this.clearAsk();
    this.hideCoach();
    this.prompt.clear();
    this.setCount('');
    this.updateHud();
    for (const mark of [...this.marks, ...this.mateMarks]) mark.root.dataset.where = 'none';
    byElementId('gift-mark').dataset.where = 'none';
    byElementId('power').dataset.on = 'no';
    sound.stopFlying();
    // Shot down, there's no fanfare: only what's said.
    sound.finish(won ? SAY.won : SAY.lost, { lost: !won });
    sky.setLive(null);
    sky.celebrate();
    this.timer = AFTER_FINISH_SECONDS;
    this.setScreen('finishing');
  }

  showFinish() {
    const { stats, total } = this.flight;
    const { won } = this;
    byElementId('finish-title').textContent = this.translate(won ? SAY.won : SAY.lost);
    byElementId('finish-place').textContent = `${stats.dropped} / ${total}`;
    const clock = (seconds) => {
      const whole = Math.round(seconds);
      return whole >= 60 ? `${Math.floor(whole / 60)} min ${whole % 60} sec` : `${whole} sec`;
    };
    const winner = [...(this.friends.results?.entries() ?? [])].find(([id, { won: theirs }]) => theirs && id !== this.friends.room.you);
    const winnerName = winner ? this.mates.find(({ friend }) => friend.id === winner[0])?.friend.spec.name ?? 'Your friend' : 'Your friend';
    byElementId('finish-line').textContent = this.flight.dogfight
      ? won
        ? `${this.chosen.name} put friends’ planes out ${stats.dropped} ${stats.dropped === 1 ? 'time' : 'times'}, first to ${total}.`
        : `${winnerName} got to ${total} first this time. ${this.chosen.name} put friends’ planes out ${stats.dropped} ${stats.dropped === 1 ? 'time' : 'times'}.`
      : won
        ? `${this.chosen.name} dropped ${stats.dropped} of ${total} planes.`
        : `The sky pirates got ${this.chosen.name}’s plane this time. ${this.chosen.name} dropped ${stats.dropped} of ${total} planes.`;
    byElementId('finish-hold').textContent = `Arms out for ${clock(stats.wingsSeconds)} of ${clock(stats.seconds)}.`;
    // The treasure brought home, on the levels with prizes.
    const prizes = Object.entries(stats.prizes).filter(([, count]) => count > 0);
    const treasure = byElementId('finish-treasure');
    treasure.replaceChildren();
    if (this.flight.levelRules.prizes) {
      const lead = document.createElement('span');
      lead.className = 'finish-treasure-lead';
      lead.textContent = 'Treasure';
      treasure.append(lead);
      for (const [kind, count] of prizes.length ? prizes : [['coin', 0]]) {
        const item = document.createElement('span');
        item.className = 'finish-treasure-item';
        item.dataset.kind = kind;
        item.append(prizeIcon(kind), `${count} ${PRIZE_WORDS[kind][count === 1 ? 0 : 1]}`);
        treasure.append(item);
      }
      if (stats.gifts) {
        const gifts = document.createElement('span');
        gifts.className = 'finish-treasure-item';
        gifts.dataset.kind = 'gifts';
        gifts.textContent = `🎁 ${stats.gifts} ${stats.gifts === 1 ? 'gift box' : 'gift boxes'}`;
        treasure.append(gifts);
      }
    }
    this.fillTallyCards(byElementId('finish-tally'), [
      { name: 'dropped', icon: 'shoot', label: 'Planes dropped', value: stats.dropped },
      { name: 'hits', icon: 'ring', label: 'Hits', value: stats.hits },
      { name: 'hurts', icon: 'wings', label: 'Times hit', value: stats.hurts },
    ]);
    // Dropping them all moves on a level, and being shot down, on the harder settings, doesn't. Flying with
    // friends is on the host's level, so it doesn't move anyone's own level on.
    if (this.friends.current) {
      this.finishFriendsLevel(won, this.friends.current.level);
    } else {
      this.finishLevel(won);
    }
    // Shot down: the same level again, with Try again as the big button.
    if (!won) byElementId('fly-again').textContent = 'Try again';
    this.friends.showResults();
    if (won) this.confetti.start();
    this.setScreen('finish');
  }

  /* ---------- every frame ---------- */

  frame(dt, now) {
    if (this.mates.length) this.updateMates();
    switch (this.screen) {
      case 'lesson':
        this.updateLesson(dt, now);
        break;
      case 'countdown':
        this.updateCountdown(dt);
        break;
      case 'fly':
        this.updateFlying(dt, now);
        break;
      case 'finishing':
        this.flight.update(dt);
        this.timer -= dt;
        if (this.timer <= 0) this.showFinish();
        break;
      default:
    }
  }
}

mountBodyShell({
  title: 'Sky Wings',
  tagline: 'Sky pirates are hunting you over the island! Fly with your arms as wings, get them inside the ring, and drop them all.',
  startLabel: 'Choose your pilot',
  chooseTitle: 'Who’s flying today?',
  chooseSide: `
      <p class="choose-tip">Hold both arms out. Tip them to turn, and raise or lower them to fly up and down. The guns fire by themselves at any plane inside the ring.</p>
      <button id="fly-start" class="big-button" type="button">Let’s fly!</button>`,
  hud: `
  <div id="wing-meter" class="wing-meter" data-out="no" aria-hidden="true">
    <svg viewBox="0 0 120 120">
      <line class="wing-mid" x1="12" y1="60" x2="108" y2="60" />
      <g id="wing-pair" class="wing-pair">
        <path class="wing-line" d="M14 60H106" />
        <circle class="wing-body" cx="60" cy="60" r="9" />
      </g>
    </svg>
  </div>
  <div id="lesson-bar" class="lesson-bar">
    <span id="lesson-count" class="lesson-count"></span>
    <button id="lesson-skip" class="soft-button" type="button">Skip this</button>
  </div>
  <div id="marks" class="marks" aria-hidden="true"></div>
  <div id="aim" class="aim" data-locked="no" aria-hidden="true">
    <svg viewBox="0 0 200 200">
      <circle class="aim-under" cx="100" cy="100" r="93" />
      <circle class="aim-ring" cx="100" cy="100" r="93" />
      <path class="aim-under" d="M100 2V30M100 170V198M2 100H30M170 100H198" />
      <path class="aim-ticks" d="M100 2V30M100 170V198M2 100H30M170 100H198" />
      <circle class="aim-dot" cx="100" cy="100" r="4" />
    </svg>
  </div>
  <header id="sky-top" class="sky-top">
    <div class="sky-chips">
      <div class="chip sky-left"><span class="chip-label">Planes left</span><span id="planes-left" class="chip-value">6</span></div>
      <div class="chip"><span class="chip-label">Dropped</span><span id="dropped" class="chip-value">0</span></div>
      <div class="chip sky-hearts"><span class="chip-label">Hearts</span><span id="hearts" class="chip-value">♥♥♥♥♥</span></div>
      <div id="treasure-chip" class="chip sky-treasure" data-on="no"><span class="chip-label">Treasure</span><span id="treasure" class="chip-value"></span></div>
      <div id="power" class="chip sky-power" data-on="no"><span id="power-mark" class="power-mark"></span><span class="power-words"><span id="power-name" class="chip-label"></span><span class="power-bar"><span id="power-fill" class="power-fill"></span></span></span></div>
    </div>
  </header>`,
  finishBody: `
      <h2 id="finish-title"></h2>
      <p id="finish-place" class="finish-place"></p>
      <p id="finish-line" class="finish-open"></p>
      <div id="finish-tally" class="finish-tally"></div>
      <p id="finish-treasure" class="finish-treasure"></p>
      <p id="finish-hold" class="finish-open"></p>
      <p class="small-print">These numbers are shown once and not saved.</p>
      <div class="finish-actions">
        <button id="fly-again" class="big-button" type="button">Fly again</button>
        <button id="other-pilot" class="soft-button" type="button">Choose another pilot</button>
        <a class="all-games" href="../../index.html">All games</a>
      </div>`,
  panelLead: 'The game is paused. The child flies with both arms held out like wings, sitting or standing: tipping them turns the plane, and raising or lowering both flies it up or down. The guns fire by themselves at any plane inside the ring. The camera has to see both arms, from about 1.5 to 2.5 metres away.',
  safetyPrint: 'Please make sure there’s room for both arms out to the sides.',
  panelSettings: `
    <fieldset class="choice">
      <legend>Flying up and down</legend>
      <label><input type="radio" name="climbing" value="yes"> Raising and lowering both arms</label>
      <label><input type="radio" name="climbing" value="no"> By itself, following the other planes, so that only turning is left to do</label>
    </fieldset>
    <fieldset class="choice">
      <legend>How hard the sky pirates are</legend>
      <label><input type="radio" name="level" value="gentle"> Gentle: a big ring, the pirates can’t shoot the plane down, and they leave a resting child alone</label>
      <label><input type="radio" name="level" value="medium"> Medium: five hits bring the plane down, even with arms down</label>
      <label><input type="radio" name="level" value="tough"> Tough: a smaller ring, and sharper pirates</label>
    </fieldset>
    <fieldset class="choice">
      <legend>Speed</legend>
      <label><input type="radio" name="pace" value="slow"> Slow</label>
      <label><input type="radio" name="pace" value="medium"> Medium</label>
      <label><input type="radio" name="pace" value="fast"> Fast</label>
    </fieldset>
    <fieldset class="choice">
      <legend>With friends</legend>
      <label><input type="radio" name="wingsFriends" value="against"> Against each other: a dogfight, with no pirates, where getting a friend’s plane in the ring puts it out for a moment, and the first to put others out as many times as the planes to drop wins</label>
      <label><input type="radio" name="wingsFriends" value="together"> Together: everyone against the sky pirates, each with their own</label>
    </fieldset>
    <fieldset class="choice">
      <legend>Planes to drop</legend>
      <label><input type="radio" name="planes" value="3"> 3</label>
      <label><input type="radio" name="planes" value="6"> 6</label>
      <label><input type="radio" name="planes" value="9"> 9</label>
    </fieldset>`,
});

new SkyWings().start();
