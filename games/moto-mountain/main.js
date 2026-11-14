// Moto Mountain: a motorbike going up a winding mountain road, steered by leaning. The bike rides by itself,
// and in each bend the child leans into it to stay on the road, a little for a gentle bend and further for a
// tight one, holding the lean until the road straightens. It's the game about leaning the body to each side
// and holding it there. This file runs it from start to finish, on top of what the body games share in
// core/body/game.js. The rules are in ride.js, where the road goes is in road.js, and what it looks like is
// in world.js.
//
// Friends can ride together, each on their own computer: all up the same road as one convoy, or racing each
// other to the top.
import { BODY_SAY, BodyGame, byElementId } from '../../core/body/game.js';
import { ROSTER } from '../../core/body/roster.js';
import { mountBodyShell } from '../../core/body/shell.js';
import { seededRandom } from '../../core/friends.js';
import { FriendsPanel, time as raceTime } from '../../core/friends-ui.js';
import { BEND_COUNTS, BIKE, HELP, LEAN, Leaner, PACES, Ride, Warmup, newAt as newAtLevel, newThingsAt, turnOf } from './ride.js';
import { MotoSound } from './moto-sound.js';
import { Mate, finishMessage, mateRoads, riderMessage, scoreRows, teamStars } from './team.js';
import { placeAt } from './road.js';
import { World } from './world.js';

const AFTER_FINISH_SECONDS = 3.2;
const COUNT_FROM = 3;
const GO_SHOWN_SECONDS = 0.9;
const READY_SECONDS = 1.1;
const NEW_SHOWN_SECONDS = 2.6; // How long something new is pointed out, the first time it comes.
const NEW_GAP_SECONDS = 0.35;
// How far the dot goes from the middle for a whole lean, as a percent of the bar. It goes by how much the lean
// turns the bike, which is a logarithm of the lean, so three whole leans take it to the bar's end.
const METER_SPAN = 27;
const ARROW_FROM = 60; // Metres before a bend at which its arrow comes up.
const RAD = Math.PI / 180;

const DEFAULTS = { moveSize: 'medium', motoLean: 'medium', motoBends: 10, motoWay: 'even', motoPace: 'usual', motoHelp: 'some', motoRide: 'wild', motoRivals: 'medium', motoFriends: 'together', fighter: 'giraffe' };
const CHOICES = { motoLean: String, motoBends: Number, motoWay: String, motoPace: String, motoHelp: String, motoRide: String, motoRivals: String, motoFriends: String };
const BIG_AIR_SECONDS = 1.4; // A jump this long is said to be a big one.
const TRICK_HINTS = 4; // How many jumps a trick is asked for in, until one is landed.
const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

// Riding with friends, each on their own computer: see core/friends-ui.js for what each of these is.
const RIDE_WORDS = {
  toggle: 'Play with friends',
  make: 'Make a ride',
  codeLabel: 'A friend’s ride code',
  codeName: 'Ride code',
  how: 'Tell your friends the code. Then you all choose a rider and press <b>Let’s ride!</b>, and race to the top.',
  // Together or against each other, as whoever made the ride chooses: see teams in core/friends-ui.js.
  teamLegend: 'How to play',
  together: 'Together',
  against: 'Against each other',
  howTogether: 'Tell your friends the code. Then you all choose a rider and press <b>Let’s ride!</b>, and ride up the mountain together.',
  teamTitle: 'You rode to the top together!',
  leave: 'Leave this ride',
  privacy: 'Only your name, who you ride as, whether you chose together or against each other, where your bike is on the road and how far it leans go to your friends. The camera picture stays on this computer.',
  alone: 'Play on your own',
  full: 'That ride already has 4 players.',
  lost: 'Can’t reach the ride. Check the internet, then try again.',
  left: 'You’ve left the ride.',
  badCode: 'A ride code is 3 letters and numbers.',
  busy: 'Riding',
  still: 'still riding',
};

// Every one of these has a rendered voice file: see audio/voice/lines.json.
const SAY = {
  choose: 'Who’s riding today?',
  mission: 'Lean into the bends, and ride to the top!',
  warmLeft: 'Lean to the left as far as you can, and hold it!',
  warmRight: 'Lean to the right as far as you can, and hold it!',
  ready: 'That’s it! You’re ready to ride!',
  left: 'Lean to the left!',
  right: 'Lean to the right!',
  trick: 'Lean in the air for a trick!',
  top: 'You made it to the top!',
};
// The moment something is seen, the child is told so, as words on the screen.
const SEEN_WORDS = { lean: ['Good lean!', 'კარგი დახრა!'], bend: ['Smooth!', 'მშვენიერია!'], air: ['Big air!', 'დიდი ნახტომი!'], trick: ['Trick!', 'ტრიუკი!'], over: ['Over!', 'გადაახტი!'] };
const HINTS = { left: SAY.left, right: SAY.right };
const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

class MotoMountain extends BodyGame {
  constructor() {
    super({
      defaults: DEFAULTS,
      choices: CHOICES,
      lines: new URL('./audio/voice/lines.json', import.meta.url),
      createSound: (options) => new MotoSound(options),
    });
    this.ride = null;
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
    this.roadSeed = null;
  }

  /** Whether it's the wild ride, which is how the game comes: a race over hills, with jumps and hay bales. */
  get wild() {
    return this.settings?.motoRide !== 'gentle';
  }

  /** What a level brings that's new, for the cards: see NEW_THINGS in ride.js. */
  newAt(level) {
    return newAtLevel(level, this.wild);
  }

  setUp() {
    // Head and shoulders are enough, so it can be played sitting down, on a chair or a stool. A lean needs
    // room to the sides, not above the head, which is what the shared check asks for when arms are held out.
    this.upperBodyOnly = true;
    this.armsOut = true;
    this.reader.upperBodyOnly = true;
    const { settings } = this;
    this.leaner = new Leaner({ size: settings.motoLean });
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
    byElementId('moto-start').addEventListener('click', () => this.openCameraThen(() => this.beginBodyCheck()));
    byElementId('ride-again').addEventListener('click', () => this.rideAgain());
    byElementId('other-rider').addEventListener('click', () => {
      this.confetti.stop();
      this.showPlace();
      this.world.setView('choose', { snap: true });
      this.setScreen('choose');
    });
    byElementId('warm-skip').addEventListener('click', () => this.warmup?.finish(false));
    // Riding with friends, if a grown-up makes or joins a ride.
    this.friends = new FriendsPanel({
      game: 'moto-mountain',
      linkKey: 'ride',
      words: RIDE_WORDS,
      hello: () => ({ driver: this.chosen?.id ?? settings.fighter, level: this.levels.current, length: settings.motoBends, mode: settings.motoPace }),
      screen: () => this.screen,
      portraits: () => this.portraits,
      onGone: (friend) => this.friendGone(friend),
      onMove: (id, message) => this.fromFriend(id, message),
      // Together, it's the stars each brought. Against each other, it's the time to the top.
      resultText: ({ ms, won, dropped }) => (this.team ? plural(dropped, 'star') : won ? raceTime(ms) : RIDE_WORDS.still),
      titles: { first: 'First to the top!', other: 'You made it to the top!' },
      teams: {
        get: () => (settings.motoFriends === 'against' ? 'against' : 'together'),
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
      leaner: this.leaner,
      get ride() {
        return game.ride;
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
      /** How high the road is at a place, for the tests to say how far over it the bike is drawn. */
      roadY: (along, across = 0) => placeAt(game.world.shape, along, across, {}).y,
    };
  }

  /** Together or against each other, chosen in the friends box: kept with the grown-ups' settings, and shown there. */
  chooseTeams(choice) {
    this.changeSettings({ motoFriends: choice });
    const input = document.querySelector(`input[name="motoFriends"][value="${choice}"]`);
    if (input) input.checked = true;
  }

  settingChanged(change) {
    const { settings } = this;
    if ('motoLean' in change) this.leaner.setSize(settings.motoLean);
    // What level 7 brings is different on the wild ride, so the cards say it again.
    if ('motoRide' in change) this.levelUi?.refresh();
    if ('motoFriends' in change && this.friends) {
      if (this.friends.room.inRoom) this.friends.room.tell(this.friends.hello());
      this.friends.showTeams();
    }
  }

  /**
   * The mountain the bike waits on before a ride: the one for the level that's next, laid out the same way
   * every time, so the title card always looks the same.
   */
  showPlace() {
    const place = new Ride({ level: this.levels.current, bends: 6, random: seededRandom(11 + this.levels.current) });
    this.ride = null;
    this.world.setMates([]);
    this.world.setRide(place);
    this.world.setLean(0);
  }

  showChosen(spec) {
    this.world.setRider(spec);
    if (!this.world.ride) this.showPlace();
    // Friends see who this child rides as.
    if (this.friends?.room.inRoom) this.friends.room.tell(this.friends.hello());
  }

  /* ---------- the body ---------- */

  /**
   * Each time the tracker has looked at the child: how far their body leans to the side, which is all this
   * game reads. The body reader's own moves, like a jump or a clap, mean nothing here.
   */
  onMoves(moves, now) {
    const dt = this.readAt === null ? 1 / 30 : Math.min(0.1, Math.max(0.001, now - this.readAt));
    this.readAt = now;
    this.leaner.read(this.latestBody, this.aspect, dt);
    if (this.screen === 'warmup' && this.warmup) this.warmup.update(dt);
  }

  /** Nobody in the picture for a while: the lean is let go, and the bike comes upright by itself. */
  leanUnseen(dt) {
    this.leaner.update(null, dt);
  }

  /** What the panel says the camera can see, so a grown-up can tell why a lean isn't counting. */
  showLiveReading() {
    const now = performance.now();
    if (now - (this.panelAt ?? 0) < 200) return;
    this.panelAt = now;
    const { leaner } = this;
    const degrees = (radians) => `${Math.round((radians / RAD) * 10) / 10} degrees`;
    const seeing = leaner.seen ? `someone leaning ${degrees(Math.abs(leaner.raw))} to the ${leaner.raw < 0 ? 'left' : 'right'} of where upright was taken` : 'nobody';
    const { left, right } = leaner.reach;
    const from = leaner.best.left === null && leaner.best.right === null ? 'a small one, as the warm-up was skipped or measured nothing' : 'from the warm-up and the setting below';
    byElementId('live-reading').textContent = `The camera sees ${seeing}. A whole lean is ${degrees(left)} to the left and ${degrees(right)} to the right, ${from}. A bend asks for a little over half of that, up to about three quarters at level 10.`;
  }

  /**
   * The bar along the bottom: the dot is the child's lean, and the green stretch is where the road needs it
   * to be. Keeping the dot in the green keeps the bike on the road.
   */
  updateMeter(share, need, wide) {
    const { lastNumbers } = this;
    const turn = turnOf(Math.max(-LEAN.most, Math.min(LEAN.most, share)));
    const dot = Math.round((50 + turn * METER_SPAN) * 10) / 10;
    if (lastNumbers.dot !== dot) {
      lastNumbers.dot = dot;
      byElementId('lean-dot').style.left = `${dot}%`;
    }
    const middle = Math.round((50 + turnOf(need) * METER_SPAN) * 10) / 10;
    const width = Math.round(wide * METER_SPAN * 2 * 10) / 10;
    if (lastNumbers.zone !== middle || lastNumbers.zoneWidth !== width) {
      lastNumbers.zone = middle;
      lastNumbers.zoneWidth = width;
      const zone = byElementId('lean-zone');
      zone.style.left = `${middle - width / 2}%`;
      zone.style.width = `${width}%`;
    }
    const inside = Math.abs(turn - turnOf(need)) <= wide;
    if (lastNumbers.inside !== inside) {
      lastNumbers.inside = inside;
      byElementId('lean-meter').dataset.zone = inside ? 'in' : 'out';
    }
  }

  /* ---------- the warm-up ---------- */

  afterBodyCheck(then) {
    if (then === 'resume') {
      this.world.setView('play');
      this.setScreen('playing');
    } else if (this.practised) this.beginCountdown();
    else this.beginWarmup();
  }

  /** Before the first ride, the child leans as far as they can each way, and that's what a whole lean is set from. */
  beginWarmup() {
    const { world } = this;
    if (this.ride) this.showPlace();
    world.setView('warmup');
    this.lastNumbers = {};
    this.readyLeft = 0;
    this.setScreen('warmup');
    // The child has just stood still for the camera: that's upright.
    this.leaner.restHere();
    // The side being worked on comes second, when the child knows what's wanted.
    const worked = this.settings.hands === 'right' ? 'right' : 'left';
    const sides = worked === 'left' ? ['right', 'left'] : ['left', 'right'];
    this.warmup = new Warmup({ leaner: this.leaner, sides, onEvent: (event) => this.onWarmEvent(event) });
    this.askWarmSide();
  }

  askWarmSide() {
    const side = this.warmup.side;
    const text = side === 'left' ? SAY.warmLeft : SAY.warmRight;
    this.showCoach('leanOver', this.translate(text), { side });
    this.sound.say(text);
  }

  onWarmEvent({ type, best }) {
    if (type === 'measured') {
      if (best !== null) this.showSeen(SEEN_WORDS.lean, { x: 0.3, y: 0.4 });
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

  updateWarmup(dt, now) {
    const { leaner, warmup, world } = this;
    if (this.readyLeft > 0) {
      this.readyLeft -= dt;
      world.setLean(leaner.share);
      if (this.readyLeft <= 0) this.endWarmup();
      return;
    }
    if (this.bodyLost()) {
      this.leanUnseen(dt);
      world.setLean(leaner.share);
      this.prompt.show({ key: 'come-back', text: BODY_SAY.comeBack, side: null }, now);
      return;
    }
    this.prompt.show(null, now);
    // The bike leans as far as the body does, measured against the setting, as nothing is known of the child yet.
    const sign = warmup.side === 'left' ? -1 : 1;
    const shown = Math.max(-1.25, Math.min(1.25, leaner.raw / leaner.full));
    world.setLean(shown);
    this.setCoachEffort(Math.min(1, warmup.share));
    this.updateMeter(shown, sign * 0.8, 0.2);
  }

  endWarmup() {
    this.warmup = null;
    this.practised = true;
    this.hideCoach();
    this.prompt.clear();
    this.beginCountdown();
  }

  /* ---------- a ride ---------- */

  /** Ready to ride. With friends, everyone waits for the others first, and then all count down together. */
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
    // With friends, everyone rides the host's road: their level, how many bends and how fast, laid out from
    // the same seed. It doesn't move anyone's own level on, and each child keeps their own lean and help.
    const friendly = this.friends.current;
    this.team = Boolean(friendly?.team);
    document.body.toggleAttribute('data-friends-race', Boolean(friendly));
    document.body.toggleAttribute('data-friends-team', this.team);
    const levelNumber = friendly ? friendly.level : this.startLevel();
    this.ride = new Ride({
      level: levelNumber,
      bends: friendly && BEND_COUNTS.includes(friendly.length) ? friendly.length : settings.motoBends,
      // With friends the bends go one way and then the other, so the road is the same for everyone.
      favour: friendly ? 'even' : settings.motoWay,
      side: settings.hands,
      pace: friendly && PACES[friendly.mode] ? friendly.mode : settings.motoPace,
      help: settings.motoHelp,
      // A road can be asked for by its number, as the tests do, to ride the same one every time.
      random: friendly ? seededRandom(friendly.seed) : this.roadSeed !== null ? seededRandom(this.roadSeed) : Math.random,
      plain: Boolean(friendly),
      // On their own it's the wild ride, unless a grown-up chose the gentle one. Friends are each other's race.
      wild: !friendly && this.wild,
      rivalry: settings.motoRivals,
      team: this.team,
      leaner: this.leaner,
      onEvent: (event) => this.onRideEvent(event),
    });
    this.setUpMates(friendly);
    world.setRide(this.ride);
    world.setLean(0);
    world.cheering = false;
    world.setView('play', { snap: true });
    this.newShown = new Set();
    this.newQueue = [];
    this.newLeft = 0;
    this.newGap = 0;
    byElementId('moto-new').classList.remove('is-showing');
    this.lastNumbers = {};
    this.filmFor = null;
    this.hideCoach();
    this.updateHud();
    this.updateMeter(0, 0, HELP[settings.motoHelp] ?? HELP.some);
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
    this.sound.startRide();
    this.timer = GO_SHOWN_SECONDS;
    this.setScreen('playing');
    // However the child has been sitting through the countdown is upright.
    this.leaner.restHere();
    this.ride.begin();
    // The mission, in one line.
    this.sound.say(SAY.mission);
  }

  /** The character showing the lean, with what's asked for under it. */
  showFilm(side) {
    if (this.filmFor === side) return;
    this.filmFor = side;
    this.showCoach('leanOver', this.translate(HINTS[side]), { side });
  }

  hideFilm() {
    if (this.filmFor === null) return;
    this.filmFor = null;
    this.hideCoach();
  }

  updatePlaying(dt, now) {
    const { ride, leaner, sound } = this;
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) this.setCount('');
    }
    // Nobody in the picture: the bike stops and waits, wherever it is.
    const lost = this.bodyLost();
    if (lost) this.leanUnseen(dt);
    ride.update(dt, leaner, mateRoads(this.mates, now));
    if (ride.state === 'finished') return;

    const hint = ride.hint;
    // In the air there's nothing to steer, and a lean is a trick: said on the first jumps, until one is landed.
    const trickNow = ride.air !== null && ride.stats.tricks === 0 && ride.stats.jumps < TRICK_HINTS;
    if (lost) this.prompt.show({ key: 'come-back', text: BODY_SAY.comeBack, side: null }, now);
    else if (trickNow) this.prompt.show({ key: 'trick', text: SAY.trick, side: null }, now);
    else this.prompt.show(hint ? { key: hint, text: HINTS[hint], side: hint } : null, now);
    if (hint && !lost) {
      this.showFilm(hint);
      // The bar under the film fills as the lean gets near what the bend needs.
      const need = Math.abs(ride.needAt(ride.s)) || ride.ahead?.need || 1;
      this.setCoachEffort(Math.min(1, Math.max(0, (leaner.share * (hint === 'left' ? -1 : 1)) / need)));
    } else {
      this.hideFilm();
    }

    this.updateMeter(leaner.share, ride.towed ? 0 : ride.needAt(ride.s), HELP[this.settings.motoHelp] ?? HELP.some);
    this.updateArrow();
    this.updateHud();
    const speed = ride.v / (ride.cruise * 1.2);
    sound.engine(speed, !ride.resting && !ride.offRoad, ride.boostLeft > 0 ? 1 : 0);
    if (ride.offRoad && ride.v > 2 && !ride.onBridge) sound.onGrass(dt);
    if (ride.onBridge && ride.v > 1) sound.onBridge(dt, speed);
    const { snowFrom } = ride.plan;
    sound.snow(snowFrom === null ? 0 : (ride.s - (snowFrom - 80)) / 80);
    this.sendRider(now);
  }

  /** The arrow for the bend that's coming, or that the bike is in: which way, and bigger for the big bend. */
  updateArrow() {
    const { ride, lastNumbers } = this;
    const ahead = ride.ahead;
    const way = ahead && ahead.in <= ARROW_FROM && ahead.through < 0.85 ? (ahead.turn < 0 ? 'left' : 'right') : 'none';
    // Still ahead, it says what's coming. Once the bike is in the bend, it says lean now.
    const shown = `${way}:${Boolean(ahead?.big)}:${Boolean(ahead && ahead.in <= 0)}`;
    if (lastNumbers.arrow === shown) return;
    lastNumbers.arrow = shown;
    const arrow = byElementId('bend-arrow');
    arrow.dataset.way = way;
    arrow.dataset.big = String(way !== 'none' && Boolean(ahead.big));
    arrow.dataset.now = String(way !== 'none' && ahead.in <= 0);
  }

  updateHud() {
    const { ride, lastNumbers } = this;
    const { stats } = ride;
    const set = (key, value, id) => {
      if (lastNumbers[key] === value) return;
      lastNumbers[key] = value;
      byElementId(id).textContent = String(value);
    };
    set('bend', Math.min(stats.bends, ride.nextBend), 'bends-done');
    set('bends', stats.bends, 'bends-all');
    set('clean', stats.clean, 'bends-clean');
    // In a race, where the child is in it.
    const racing = ride.rivals.length > 0;
    if (lastNumbers.racing !== racing) {
      lastNumbers.racing = racing;
      byElementId('place-chip').hidden = !racing;
    }
    if (racing) {
      set('place', ORDINALS[ride.place - 1] ?? ride.place, 'place');
      set('riders', ride.rivals.length + 1, 'riders');
    }
    // Prizes, from the levels that have them, each with its little picture.
    const prizes = [['⭐', stats.stars, ride.plan.stars > 0], ['⛄', stats.snow, ride.plan.snows > 0], ['🏅', 1, stats.medal], ['🏆', 1, stats.cup]].filter(([, , has]) => has);
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
    const { ride } = this;
    if (!ride || ride.plain || this.newShown.has(id)) return;
    const thing = newThingsAt(ride.levelNumber, ride.rules.wild).find((one) => one.id === id);
    if (!thing) return;
    this.newShown.add(id);
    this.newQueue.push(thing);
    if (this.newLeft <= 0 && this.newGap <= 0) this.showNextNew();
  }

  showNextNew() {
    const label = byElementId('moto-new');
    const thing = this.newQueue.shift();
    if (!thing) return;
    const georgian = this.settings.language === 'ka';
    label.innerHTML = `<span class="moto-new-lead">${georgian ? 'ახალი:' : 'New:'}</span><span class="moto-new-mark">${thing.mark}</span>${georgian ? thing.nameKa : thing.name}`;
    label.dataset.thing = thing.id;
    label.classList.add('is-showing');
    this.newLeft = NEW_SHOWN_SECONDS;
  }

  /** The label's time goes with the game's, so it waits while the grown-ups' panel is open. */
  updateNew(dt) {
    if (this.newLeft > 0) {
      this.newLeft -= dt;
      if (this.newLeft > 0) return;
      byElementId('moto-new').classList.remove('is-showing');
      this.newGap = NEW_GAP_SECONDS;
      return;
    }
    if (this.newGap <= 0) return;
    this.newGap -= dt;
    if (this.newGap <= 0) this.showNextNew();
  }

  /** Whatever is coming up on the road is named as it comes into view, the first time. */
  watchForNew() {
    const { ride } = this;
    if (!ride || ride.plain) return;
    for (const thing of ride.things) {
      const at = thing.from ?? thing.at;
      if (at < ride.s || at - ride.s > 70) continue;
      this.pointOutNew(thing.kind);
    }
    const ahead = ride.ahead;
    if (ahead?.big && ahead.in < 70) this.pointOutNew('big');
  }

  /* ---------- what happened ---------- */

  onRideEvent(event) {
    const { sound, world } = this;
    world.onRideEvent(event);
    const at = () => world.bikeOnScreen();
    const handlers = {
      clean: () => {
        sound.bend();
        this.callout(this.settings.language === 'ka' ? SEEN_WORDS.bend[1] : SEEN_WORDS.bend[0], { kind: 'is-seen', ...at() });
        if (event.bend.big) {
          sound.medal();
          this.callout('🏅', { kind: 'is-number', ...world.bikeOnScreen(2.4) });
        }
      },
      lean: () => this.hideFilm(),
      star: () => {
        sound.star();
        this.callout('+1 ⭐', { kind: 'is-number', ...at() });
      },
      snow: () => {
        sound.snowHeap();
        this.callout('+1 ⛄', { kind: 'is-number', ...at() });
      },
      splash: () => sound.splash(),
      boost: () => sound.boost(),
      jump: () => sound.jump(),
      land: () => {
        sound.land();
        const words = event.trick ? SEEN_WORDS.trick : event.seconds >= BIG_AIR_SECONDS ? SEEN_WORDS.air : null;
        if (event.trick) sound.trick();
        if (words) this.callout(this.settings.language === 'ka' ? words[1] : words[0], { kind: 'is-seen', ...at() });
      },
      crash: () => sound.crash(),
      clear: () => this.callout(this.settings.language === 'ka' ? SEEN_WORDS.over[1] : SEEN_WORDS.over[0], { kind: 'is-seen', ...at() }),
      wade: () => sound.wade(),
      river: () => this.callout('🌊 👍', { kind: 'is-number', ...at() }),
      place: () => {
        // A place gained is said, big. One lost isn't.
        if (event.place >= event.before) return;
        sound.placeUp();
        this.callout(ORDINALS[event.place - 1] ?? String(event.place), { kind: 'is-number', ...world.bikeOnScreen(2.6) });
      },
      'sheep-goes': () => {
        sound.ring();
        sound.sheepGoes();
      },
      scooter: () => sound.ring(),
      pass: () => this.callout('👋', { kind: 'is-number', ...at() }),
      cup: () => {
        sound.cup();
        this.callout('🏆', { kind: 'is-number', ...world.bikeOnScreen(2.4) });
      },
      resting: () => sound.say(BODY_SAY.waiting, { ifQuiet: true }),
      finished: () => this.onFinished(),
    };
    handlers[event.type]?.();
  }

  onFinished() {
    const { world, sound, ride } = this;
    // Friends' finish cards fill in with how this child did: the time to the top, or the stars they brought.
    if (this.friends.current) {
      this.sendRider(performance.now());
      this.friends.finished(performance.now() - this.goAt, finishMessage(ride));
    }
    this.camera.stop();
    this.reader.forget();
    this.leaner.forget();
    this.latestBody = null;
    this.readAt = null;
    this.hideFilm();
    this.prompt.clear();
    this.setCount('');
    this.updateHud();
    sound.stopRide();
    sound.finish(SAY.top);
    sound.cheer();
    world.celebrate();
    world.setView('finish');
    this.timer = AFTER_FINISH_SECONDS;
    this.setScreen('finishing');
  }

  showFinish() {
    const { ride } = this;
    const { stats } = ride;
    const clean = `${stats.clean} of ${plural(stats.bends, 'bend')}`;
    // After a race, it's where the child came in it that's said biggest.
    const raced = stats.place !== null;
    byElementId('finish-clean').textContent = raced ? `${ORDINALS[stats.place - 1] ?? stats.place} of ${stats.riders}` : clean;
    byElementId('finish-what').textContent = raced ? 'in the race' : 'ridden all on the road';
    const longest = Math.round(stats.longest * 10) / 10;
    const eased = stats.eased.left + stats.eased.right ? ' The bends asked for a little less lean as the ride went on, to meet how far the body goes.' : '';
    const towed = stats.tows ? ` The bike was helped round ${plural(stats.tows, 'bend')}.` : '';
    const onRoad = raced ? ` ${clean} were ridden all on the road.` : '';
    byElementId('finish-line').textContent = `${this.chosen.name} leaned ${plural(stats.leans.left, 'time')} to the left and ${plural(stats.leans.right, 'time')} to the right, and the longest lean was held for ${longest} seconds.${onRoad}${eased}${towed}`;
    byElementId('finish-prizes').textContent = this.prizeWords();
    this.fillTallyCards(byElementId('finish-tally'), [
      { name: 'left', icon: 'leanLeft', label: 'Leans to the left', value: stats.leans.left },
      { name: 'right', icon: 'leanRight', label: 'Leans to the right', value: stats.leans.right },
      { name: 'longest', icon: 'leanRight', label: 'Longest lean, seconds', value: longest },
    ]);
    // Nobody fails a ride, so every one that's finished moves on a level. With friends it's the host's level,
    // so it doesn't move anyone's own level on.
    if (this.friends.current) {
      this.levels.last = null;
      this.levelUi.refresh();
    } else {
      this.finishLevel(true);
    }
    this.friends.showResults();
    // After a race, the card's title says how it went. With friends, the friends box has said it already.
    if (raced && !this.friends.current && stats.place <= 3) byElementId('finish-title').textContent = stats.place === 1 ? 'You won the race!' : 'On the podium!';
    this.confetti.start();
    this.setScreen('finish');
  }

  /** What else was won, in words, from what this level has. Nothing at level 1. */
  prizeWords() {
    const { stats, plan } = this.ride;
    const parts = [];
    if (plan.stars) parts.push(`caught ${stats.stars} of ${plural(plan.stars, 'star')}`);
    if (plan.snows) parts.push(`burst ${stats.snow} of ${plural(plan.snows, 'heap')} of snow`);
    if (stats.splashes) parts.push(`splashed through ${plural(stats.splashes, 'puddle')}`);
    if (stats.jumps) parts.push(`made ${plural(stats.jumps, 'jump')}, with ${Math.round(stats.air)} seconds in the air`);
    if (stats.tricks) parts.push(`did ${plural(stats.tricks, 'trick')}`);
    if (stats.rivers) parts.push(`jumped ${plural(stats.rivers, 'river')}`);
    if (stats.crashes) parts.push(`went through ${plural(stats.crashes, 'row')} of hay bales`);
    if (stats.passed) parts.push(`passed ${stats.passed} on the road`);
    if (stats.medal) parts.push('won the medal for the big bend');
    if (stats.cup) parts.push('won the cup');
    if (!parts.length) return '';
    const last = parts.pop();
    const words = parts.length ? `${parts.join(', ')} and ${last}` : last;
    return `${words[0].toUpperCase()}${words.slice(1)}.`;
  }

  rideAgain() {
    this.confetti.stop();
    this.reader.forget();
    this.openCameraThen(() => this.beginBodyCheck());
  }

  /* ---------- with friends ---------- */

  /** Friends' bikes, each following what their own game sends, and their names over them. */
  setUpMates(friendly) {
    this.mates = (friendly?.friends ?? []).map((friend) => new Mate(friend));
    this.world.setMates(this.mates.map(({ friend }) => friend.spec));
    for (const mark of this.markMates) mark.remove();
    this.markMates = this.mates.map(({ friend }) => {
      const root = document.createElement('div');
      root.className = 'rider-mark';
      root.dataset.where = 'none';
      const face = document.createElement('img');
      face.className = 'rider-mark-face';
      face.alt = '';
      face.src = this.portraits[friend.spec.id] ?? '';
      const name = document.createElement('span');
      name.className = 'rider-mark-name';
      name.textContent = friend.spec.name;
      root.append(face, name);
      document.body.append(root);
      return root;
    });
    this.showScores();
  }

  /** Where each friend's bike is, a moment behind what their game says. */
  updateMates(now, dt) {
    const showing = ['countdown', 'playing', 'finishing'].includes(this.screen);
    const places = this.mates.map((mate) => mate.placeAt(now, BIKE.leanMost) ?? (mate.gone ? null : { s: 0, x: 0, roll: 0, height: 0, v: 0 }));
    // On the start line, they stand side by side.
    places.forEach((place, index) => {
      if (place && !this.mates[index].heard) place.x = [-2.4, 2.4, -3.6][index] ?? 0;
    });
    this.world.placeMates(places, dt);
    this.world.mates.forEach((shown, index) => {
      const mark = this.markMates[index];
      if (!mark) return;
      const at = shown.root.position;
      const seen = showing && shown.root.visible ? this.world.project(at.x, at.y + 2.5, at.z) : null;
      mark.dataset.where = seen && !seen.behind ? 'on' : 'none';
      if (seen) mark.style.transform = `translate(${Math.round(seen.x)}px, ${Math.round(seen.y)}px)`;
    });
    if (this.ride && this.screen === 'playing') this.showScores();
  }

  /** Where this child's bike is, for friends' games, timed from "GO!". */
  sendRider(now) {
    const { ride } = this;
    if (!this.friends.current || !ride) return;
    this.friends.sendMove('rider', riderMessage(ride, ride.roll / BIKE.leanMost), now - this.goAt);
  }

  /** Something from a friend's game: where their bike is. */
  fromFriend(id, message) {
    const mate = this.mates.find(({ friend }) => friend.id === id);
    if (mate?.hear(message, performance.now())) this.showScores();
  }

  /** Everyone's line, top right, with friends: the stars each has brought, together, or who's in front. */
  showScores() {
    const board = byElementId('moto-scores');
    const friendly = this.mates.length > 0;
    board.hidden = !friendly;
    if (!friendly || !this.ride) return;
    const rows = scoreRows(this.ride, this.mates, this.team);
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
      value.textContent = String(teamStars(this.ride, this.mates));
      all.append(who, value);
      items.unshift(all);
    }
    board.replaceChildren(...items);
  }

  /** A friend has gone in the middle, and their bike with them. Everyone else rides on. */
  friendGone(friend) {
    const mate = this.mates.find((each) => each.friend.id === friend.id);
    if (!mate) return;
    mate.gone = true;
    this.showScores();
  }

  /* ---------- every frame ---------- */

  frame(dt, now) {
    if (this.ride) {
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

mountBodyShell({
  title: 'Moto Mountain',
  tagline: 'Race a motorbike up the mountain! Lean your body into each bend, fly off the hills, and beat the other riders to the top.',
  startLabel: 'Choose your rider',
  chooseTitle: 'Who’s riding today?',
  chooseSide: `
      <p class="choose-tip">Lean to the side, and the bike leans too. Lean into each bend, and hold it until the road is straight again. In the air, lean for a trick!</p>
      <button id="moto-start" class="big-button" type="button">Let’s ride!</button>`,
  hud: `
  <div id="lean-meter" class="lean-meter" data-zone="in" aria-hidden="true">
    <div id="lean-zone" class="lean-zone"></div>
    <div class="lean-middle"></div>
    <div id="lean-dot" class="lean-dot"></div>
  </div>
  <div id="bend-arrow" class="bend-arrow" data-way="none" aria-hidden="true">
    <svg viewBox="0 0 64 64"><path d="M16 58V34c0-10 8-18 18-18h12M36 6l12 10-12 10" /></svg>
  </div>
  <div id="warm-bar" class="warm-bar">
    <button id="warm-skip" class="soft-button" type="button">Skip the warm-up</button>
  </div>
  <header id="moto-top" class="moto-top">
    <div id="place-chip" class="chip chip-place" hidden><span class="chip-label">Race</span><span class="chip-value"><span id="place">5th</span> of <span id="riders">5</span></span></div>
    <div class="chip"><span class="chip-label">Bends</span><span class="chip-value"><span id="bends-done">0</span> / <span id="bends-all">0</span></span></div>
    <div class="chip"><span class="chip-label">On the road</span><span id="bends-clean" class="chip-value">0</span></div>
    <div id="prizes-chip" class="chip" hidden><span class="chip-label">Prizes</span><span id="prizes" class="chip-value"></span></div>
  </header>
  <ol id="moto-scores" class="moto-scores" aria-label="Everyone’s line" hidden></ol>
  <div id="moto-new" class="moto-new" aria-hidden="true"></div>`,
  finishBody: `
      <h2 id="finish-title">You made it to the top!</h2>
      <p class="finish-hero"><span id="finish-clean">0 of 0 bends</span> <span id="finish-what">ridden all on the road</span></p>
      <p id="finish-line" class="finish-open"></p>
      <p id="finish-prizes" class="finish-prizes"></p>
      <div id="finish-tally" class="finish-tally"></div>
      <p class="small-print">These numbers are shown once and not saved.</p>
      <div class="finish-actions">
        <button id="ride-again" class="big-button" type="button">Ride again</button>
        <button id="other-rider" class="soft-button" type="button">Choose another rider</button>
        <a class="all-games" href="../../index.html">All games</a>
      </div>`,
  panelLead: 'The game is paused. The camera needs to see the child’s head and shoulders, sitting or standing, with room to lean to each side. It reads the lean best with the hips in the picture too.',
  handLegend: 'Side being worked on',
  safetyPrint: 'Please make room to lean to each side, on a seat that won’t tip, and stay close by.',
  panelSettings: `
    <fieldset class="choice">
      <legend>The ride</legend>
      ${choice('motoRide', 'wild', 'Wild: a race against other riders, over steep hills that throw the bike into the air, with ramps, hay bales in the way and, from level 7, a river to jump')}
      ${choice('motoRide', 'gentle', 'Gentle: the road alone, with nobody to race and nothing in the way')}
    </fieldset>
    <fieldset class="choice">
      <legend>The other riders in the race</legend>
      ${choice('motoRivals', 'easy', 'Easy to beat')}
      ${choice('motoRivals', 'medium', 'A fair race: riding well is a place on the podium')}
      ${choice('motoRivals', 'hard', 'Hard to beat')}
    </fieldset>
    <fieldset class="choice">
      <legend>How far a whole lean is, at most, as the camera reads it: a body bending at the waist reads as about half as far as it bends. It’s never more than most of this child’s own lean to that side, as measured in the warm-up, and ${LEAN.unmeasured} degrees if the warm-up is skipped. A bend asks for a little over half of a whole lean</legend>
      ${choice('motoLean', 'tiny', `A little: about ${LEAN.full.tiny} degrees from upright`)}
      ${choice('motoLean', 'small', `Some: about ${LEAN.full.small} degrees`)}
      ${choice('motoLean', 'medium', `Medium: about ${LEAN.full.medium} degrees`)}
      ${choice('motoLean', 'big', `A lot: about ${LEAN.full.big} degrees`)}
    </fieldset>
    <fieldset class="choice">
      <legend>Which way the bends go</legend>
      ${choice('motoWay', 'even', 'One way and then the other')}
      ${choice('motoWay', 'more', 'Two in every three towards the side being worked on')}
    </fieldset>
    <fieldset class="choice">
      <legend>Bends in a ride</legend>
      ${BEND_COUNTS.map((count) => choice('motoBends', count, `${count} bends`)).join('\n      ')}
    </fieldset>
    <fieldset class="choice">
      <legend>How fast the bike goes, which is how long there is to lean into a bend</legend>
      ${choice('motoPace', 'gentle', 'Gently')}
      ${choice('motoPace', 'usual', 'The usual speed')}
      ${choice('motoPace', 'quick', 'Quickly')}
    </fieldset>
    <fieldset class="choice">
      <legend>How much help the road gives</legend>
      ${choice('motoHelp', 'lots', 'Lots: leaning the right way is nearly enough')}
      ${choice('motoHelp', 'some', 'Some: about half the lean a bend needs keeps the bike on the road')}
      ${choice('motoHelp', 'little', 'A little: the lean has to be close to what the bend needs')}
    </fieldset>
    <fieldset class="choice">
      <legend>With friends</legend>
      ${choice('motoFriends', 'together', 'Together: everyone rides up as one convoy, and the stars are shared')}
      ${choice('motoFriends', 'against', 'Against each other: a race to the top')}
    </fieldset>`,
});

// Checked here so that a mistake in the roster shows up as soon as the page loads.
if (!ROSTER.length) console.error('No riders');

new MotoMountain().start();
