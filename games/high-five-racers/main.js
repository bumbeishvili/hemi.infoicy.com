// High Five Racers: the car only drives while the hand in play is open. Steering over to a big hand at the
// roadside slaps it for a boost. Keeping the hand open fills the turbo meter, and turbo goes by itself when
// it's full. A fist and then an open hand with the other hand makes the car fly.
import { renderPortraits } from '../../core/body/portraits.js';
import { byId as characterWithId, ROSTER } from '../../core/body/roster.js';
import { GameSession, SPOKEN as SPOKEN_EVERYWHERE } from '../../core/session.js';
import { CarSound } from './car-sound.js';
import { drawPowerIcon } from './extras.js';
import { FriendsRace } from './friends-race.js';
import { Race } from './game.js';
import { newAt, POWER_KINDS, racePlan, TOP_SPEED } from './rules.js';

const MOST_RIVALS = racePlan(10).rivals;

const STEER_HINT_SECONDS = 6;
const REST_AFTER_SECONDS = 15;
const FIVE_HINT_WITHIN = 65; // Metres before a big hand that the hint comes up.
const HINT_UNTIL_FIVES = 2; // Once a child has got the idea, nothing more is said about it.
const FILM_AGAIN_AFTER_MISSES = 3;
// Right after turbo runs out, a little film by the meter shows the other hand making a fist and opening, and
// the car taking off: the first few times each race, and after that only while it hasn't flown yet.
const FLY_FILM_SECONDS = 4;
const FLY_FILM_TIMES = 3;
const TURBO_TOAST_SPACING_SECONDS = 9;
const SPEED_SHOWN_PER_METRE = 5; // Metres a second, as a number that's fun to see going up.

const STEER_HINT = 'Move your hand side to side to catch stars';
// Only this game says these. Each has a rendered voice file: see core/audio/voice/lines.json.
const SPOKEN = {
  bigHand: 'High five the big hand!',
};
const PRAISE = ['Great job!', 'Nice one!', 'You passed a car!', 'Way to go!'];
const PRAISE_EVERY = 5; // Cars passed between one bit of praise and the next.

// Little words that pop up beside the action. The Georgian needs a native speaker's check.
const WORDS = {
  en: {
    five: 'High five!',
    row: (count) => `${count} in a row!`,
    passed: (spec) => `You passed ${spec.name}!`,
    turbo: 'Turbo!',
    fly: 'Fly!',
    keepOpen: 'Keep your hand open!',
    // With a hand shape chosen to drive, rather than the open hand.
    keepShape: 'Keep holding it!',
    otherHand: 'Other hand: fist, then open!',
    highTen: 'High ten!',
    newTag: 'New!',
  },
  ka: {
    five: 'ყოჩაღ!',
    row: (count) => `${count} ზედიზედ!`,
    passed: (spec) => `გაასწარი: ${spec.nameKa}!`,
    turbo: 'ტურბო!',
    fly: 'გაფრინდი!',
    keepOpen: 'ხელი გაშლილი გეჭიროს!',
    keepShape: 'ასე გეჭიროს!',
    otherHand: 'მეორე ხელი: მუშტი, მერე გაშალე!',
    highTen: 'ორმაგი ხუთი!',
    newTag: 'ახალი!',
  },
};

const byId = (id) => document.getElementById(id);
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
// Where a new thing's label goes, kept clear of the edges of the screen, in pixels. The bottom keeps it above the
// meters. One that isn't over anything, like the sunset's, goes this far under where the little words come up.
const LABEL_MARGIN = { side: 10, top: 70, bottom: 150, gap: 6 };
const FIXED_LABEL_BELOW_WORDS = 64;

/** The power-ups' own pictures, for the badges on the screen. */
function powerPictures() {
  return Object.fromEntries(POWER_KINDS.map((kind) => {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    drawPowerIcon(canvas.getContext('2d'), kind, 96);
    return [kind, canvas.toDataURL()];
  }));
}
// What the voice says at the finish. Both have a rendered voice file: see core/audio/voice/lines.json.
const WON_LINE = 'You did it! Great racing!';
const LOST_LINE = 'Great job!';
const WON_TITLE = 'You won the race!';
const ordinal = (place) => ['1st', '2nd', '3rd', '4th'][place - 1] ?? `${place}th`;

/**
 * Who drives what. Whoever the child chose in the other games drives, and Giraffe if nobody was. rivals is
 * everyone who could be in the other cars, in order: three of them race at first, and higher levels add more.
 */
function castFor(settings) {
  const driver = characterWithId(settings.fighter) ?? ROSTER[0];
  return { driver, rivals: ROSTER.filter((spec) => spec !== driver).slice(0, MOST_RIVALS) };
}

class RaceGame {
  chimeOnOpen = true;

  constructor(session) {
    this.session = session;
    this.praiseIndex = 0;
    this.passed = 0;
    this.missesInARow = 0;
    this.fiveHintSpoken = false;
    this.lastTurboToast = -Infinity;
    this.resetHints();
    const { sound } = session;
    this.cast = castFor(session.settings);
    this.race = new Race(byId('game'), {
      onStar: () => sound.star(),
      onPlace: (place, previous) => {
        if (place < previous) {
          sound.passedCar();
          this.passed += 1;
          if (this.passed % PRAISE_EVERY === 1) sound.say(PRAISE[this.praiseIndex++ % PRAISE.length], { ifQuiet: true });
        }
      },
      // In the air, "Fly!" stays up rather than being replaced by everyone flown past.
      // And while something new has its label up, that's what there is to see.
      onOvertake: (spec) => {
        if (!this.race.soaring && !this.race.callout) this.toast(this.words.passed(spec), spec);
      },
      onLap: (lap) => {
        sound.lap();
        sound.say(lap === this.race.laps ? 'Last lap!' : `Lap ${lap}!`);
      },
      onFive: (total, side, streak) => {
        sound.slap(streak);
        this.missesInARow = 0;
        this.toast(streak >= 3 ? this.words.row(streak) : this.words.five);
      },
      onGate: (gate, outcome) => {
        if (outcome === 'passed' && this.race.drive > 0) this.missesInARow += 1;
        if (outcome === 'closed') sound.pat();
      },
      onBump: () => sound.bump(),
      // What the later levels bring: prizes, power-ups, the tractor and the high ten. See NEW_THINGS in rules.js.
      onCoin: (total, kind) => (kind === 'chest' ? sound.chest() : sound.coin(kind)),
      onPower: (kind, on) => {
        if (on) sound.powerUp();
      },
      onBounce: () => sound.bounce(),
      onTractor: () => sound.tractor(),
      onHighTen: (hard) => {
        sound.highTen(hard);
        if (hard) this.toast(this.words.highTen);
      },
      onTurbo: (on) => {
        if (!on) {
          this.turboRanOut();
          return;
        }
        this.flyFilmLeft = 0;
        sound.turboOn();
        // Taking off says so itself.
        if (this.race.soaring) return;
        if (session.playSeconds - this.lastTurboToast > TURBO_TOAST_SPACING_SECONDS) {
          this.lastTurboToast = session.playSeconds;
          this.toast(this.words.turbo);
        }
      },
      onJump: () => sound.jumped(),
      onFly: () => {
        this.flights += 1;
        this.flyFilmLeft = 0;
        sound.jumped();
        this.toast(this.words.fly);
      },
      onLanded: () => sound.landed(),
      onCrowd: () => sound.crowd(),
      onFinish: () => {
        this.friends.crossed(this.sinceGo);
        // Racing to win, one of the others may have got there first. The voice says something kind either way.
        const lost = Boolean(this.race.lostTo);
        session.finishLine = lost ? LOST_LINE : WON_LINE;
        session.finish();
        if (lost) this.showLost();
      },
    }, { ...this.cast, reach: session.settings.reach, level: session.level });
    this.race.setMode('attract');
    this.race.setRivalsMode(session.settings.rivals);
    this.showSteering(session.settings.steering);
    this.buildOrder();
    this.turboFill = byId('turbo-fill');
    this.turboBox = byId('turbo');
    this.turboWord = byId('turbo-word');
    this.speedShown = byId('speed-value');
    this.toastBox = byId('toast');
    this.toastFace = byId('toast-face');
    this.toastText = byId('toast-text');
    this.coinsBox = byId('chip-coins-box');
    this.coinsValue = byId('chip-coins');
    this.buildPowers();
    this.newLabel = byId('new-label');
    this.cameraFrame = byId('camera-frame');
    this.promptBox = byId('prompt');
    // What was picked up, on the finish card under the stars.
    this.finishPrizes = document.createElement('p');
    this.finishPrizes.id = 'finish-prizes';
    this.finishPrizes.className = 'finish-prizes';
    document.querySelector('#screen-finish .finish-hero')?.after(this.finishPrizes);
    // When one of the others won, a line saying so, over the stars.
    this.finishStory = document.createElement('p');
    this.finishStory.id = 'finish-story';
    this.finishStory.className = 'finish-story';
    this.finishStory.hidden = true;
    document.querySelector('#screen-finish .finish-hero')?.before(this.finishStory);
    // Racing friends on their own computers, if a grown-up makes or joins a race.
    this.friends = new FriendsRace(this);
    // Otherwise it would play again whenever the race's screen comes back.
    this.toastBox.addEventListener('animationend', () => this.toastBox.classList.remove('is-showing'));
    const game = this;
    this.debug = {
      race: this.race,
      get game() {
        return game;
      },
    };
  }

  get words() {
    return WORDS[this.session.settings.language] ?? WORDS.en;
  }

  /** What a level brings that's new, for the title card, the countdown and the finish card. */
  newAt(level) {
    return newAt(level);
  }

  /** A race one of the others won ends kindly: no confetti, and Try again as the big button. */
  showLost() {
    this.session.hud.confetti.stop();
    const again = document.querySelector('#screen-finish .finish-actions .big-button');
    if (again) again.textContent = 'Try again';
  }

  /** A badge for each power-up, which shows while it's on, with a ring that goes down as it runs out. */
  buildPowers() {
    const pictures = powerPictures();
    const box = byId('powers');
    this.powerBadges = new Map(POWER_KINDS.map((kind) => {
      const badge = document.createElement('div');
      badge.className = 'power';
      badge.dataset.kind = kind;
      const picture = document.createElement('img');
      picture.alt = '';
      picture.src = pictures[kind];
      badge.append(picture);
      box.append(badge);
      return [kind, badge];
    }));
  }

  showPowers() {
    const { powers } = this.race;
    for (const [kind, badge] of this.powerBadges) {
      const on = powers.has(kind);
      if (badge.classList.contains('is-on') !== on) badge.classList.toggle('is-on', on);
      if (on) badge.style.setProperty('--left', powers.share(kind).toFixed(3));
    }
  }

  /**
   * The first time something new comes into sight, a little label over it, or near the top for the sunset or
   * rain. It's kept on the screen and clear of the camera's picture, the prompt and the little words, so nothing
   * covers it, and the race is told while it's up, as a label only counts as shown once it has been seen.
   */
  showNewLabel() {
    const { callout, camera } = this.race;
    const label = this.newLabel;
    if (!callout || this.session.screen !== 'playing') {
      if (callout) callout.visible = false;
      if (label.classList.contains('is-showing')) label.classList.remove('is-showing');
      return;
    }
    // In the language the voice speaks, even if that changes while it's up.
    const { language } = this.session.settings;
    const key = `${callout.id} ${language}`;
    if (label.dataset.key !== key) {
      label.dataset.key = key;
      byId('new-label-tag').textContent = this.words.newTag;
      byId('new-label-mark').textContent = callout.mark;
      byId('new-label-name').textContent = language === 'ka' ? callout.nameKa : callout.name;
    }
    // Anything in one place has it over itself, and it fades if that goes out of the picture. Something that
    // isn't, like the sunset, has it in the middle, under where the little words come up.
    let inView = true;
    let x = innerWidth / 2;
    let y = this.toastBox.offsetTop + FIXED_LABEL_BELOW_WORDS + label.offsetHeight;
    if (callout.follow) {
      const point = callout.at?.clone().project(camera);
      inView = Boolean(point) && point.z < 1 && Math.abs(point.x) < 1.1 && Math.abs(point.y) < 1.1;
      if (inView) {
        x = ((point.x + 1) / 2) * innerWidth;
        y = ((1 - point.y) / 2) * innerHeight;
      }
    }
    if (inView) {
      const spot = this.labelSpot(x, y, label.offsetWidth, label.offsetHeight);
      label.style.setProperty('--x', `${spot.x.toFixed(1)}px`);
      label.style.setProperty('--y', `${spot.y.toFixed(1)}px`);
    }
    const up = inView && !callout.ending;
    if (label.classList.contains('is-showing') !== up) label.classList.toggle('is-showing', up);
    callout.visible = up;
  }

  /**
   * Where a label goes, as its middle and its bottom edge: on the screen, and moved down under the camera's
   * picture, which is the child's own hand, the prompt and the little words, wherever it would touch them.
   */
  labelSpot(x, y, width, height) {
    const { side, top, bottom, gap } = LABEL_MARGIN;
    const spot = {
      x: Math.min(innerWidth - side - width / 2, Math.max(side + width / 2, x)),
      y: Math.min(innerHeight - bottom, Math.max(top + height, y)),
    };
    const inTheWay = [
      this.cameraFrame,
      this.promptBox.classList.contains('is-visible') ? this.promptBox : null,
      this.toastBox.classList.contains('is-showing') ? this.toastBox : null,
    ].filter(Boolean).map((element) => element.getBoundingClientRect()).sort((a, b) => a.top - b.top);
    for (const box of inTheWay) {
      const touches = spot.x - width / 2 < box.right + gap && spot.x + width / 2 > box.left - gap
        && spot.y - height < box.bottom + gap && spot.y > box.top - gap;
      if (touches) spot.y = box.bottom + gap + height;
    }
    return spot;
  }

  /** Coins, gems and treasure, on the finish card. Nothing at level 1, which has none. */
  prizesWords() {
    const { race } = this;
    if (!race.plan.coins) return '';
    const { gems, chests, highTens } = race.prizes;
    const parts = [`🪙 ${plural(race.coinTotal, 'coin', 'coins')}`];
    if (gems) parts.push(`💎 ${plural(gems, 'gem', 'gems')}`);
    if (chests) parts.push(`🎁 ${plural(chests, 'treasure chest', 'treasure chests')}`);
    if (highTens) parts.push('🙌 High ten!');
    return parts.join(' · ');
  }

  /** At the start of each race: nothing hinted, said or flown yet. */
  resetHints() {
    this.flyFilmLeft = 0;
    this.flyFilms = 0;
    this.flights = 0;
    this.lastTurboLevel = 0;
  }

  /** Turbo has just run out. While the hand in play is open, that's when the other hand can make it fly. */
  turboRanOut() {
    const { session, race } = this;
    if (session.screen !== 'playing' || race.drive <= 0 || race.soaring) return;
    if (this.flyFilms >= FLY_FILM_TIMES && this.flights > 0) return;
    this.flyFilms += 1;
    this.flyFilmLeft = FLY_FILM_SECONDS;
    byId('fly-film-words').textContent = this.words.otherHand;
  }

  /** The film of the other hand, on its own side of the picture, as in a mirror. */
  showFlyFilm(dt) {
    if (this.race.turbo.active) this.flyFilmLeft = 0;
    this.flyFilmLeft = Math.max(0, this.flyFilmLeft - dt);
    const side = this.flyFilmLeft > 0 ? (this.session.settings.hands === 'left' ? 'right' : 'left') : '';
    if ((document.body.dataset.flyFilm ?? '') === side) return;
    if (side) document.body.dataset.flyFilm = side;
    else delete document.body.dataset.flyFilm;
  }

  /** A picture of each racer, in the order they're going, which swap places as they overtake. */
  buildOrder() {
    const list = byId('race-order');
    this.orderRows = new Map();
    list.replaceChildren();
    const racing = [this.cast.driver, ...this.race.rivals.map((rival) => rival.spec)];
    list.style.setProperty('--cars', String(racing.length));
    for (const spec of racing) {
      const row = document.createElement('li');
      row.className = 'order-row';
      row.dataset.who = spec.id;
      if (spec === this.cast.driver) row.classList.add('is-you');
      if (spec.key) row.classList.add('is-friend');
      const face = document.createElement('img');
      face.alt = '';
      face.src = this.session.portraits?.[spec.id] ?? '';
      const number = document.createElement('span');
      number.className = 'order-number';
      row.append(number, face);
      list.append(row);
      this.orderRows.set(spec.key ?? spec.id, { row, number });
    }
  }

  /**
   * Takes the little words away. The finish card hides them part way through, which stops their animation
   * without it ending, so they would otherwise come up again at the start of the next race.
   */
  clearToast() {
    this.toastBox.classList.remove('is-showing');
  }

  toast(text, spec = null) {
    this.toastText.textContent = text;
    if (spec) this.toastFace.src = this.session.portraits?.[spec.id] ?? '';
    this.toastFace.classList.toggle('is-hidden', !spec);
    this.toastBox.classList.remove('is-showing');
    void this.toastBox.offsetWidth;
    this.toastBox.classList.add('is-showing');
  }

  showSteering(steering) {
    byId('wheel').classList.toggle('is-auto', steering === 'auto');
  }

  showProgress() {
    const { race } = this;
    const { place, lap, laps, stars, fives, progress, speed, turbo, turboOn } = race.info;
    byId('chip-place').textContent = ordinal(place);
    byId('chip-lap').textContent = `${lap} of ${laps}`;
    byId('chip-stars').textContent = String(stars);
    byId('chip-fives').textContent = String(fives);
    const coinsText = String(race.coinTotal);
    if (this.coinsValue.textContent !== coinsText) this.coinsValue.textContent = coinsText;
    this.showPowers();
    byId('race-progress-fill').style.width = `${Math.round(progress * 100)}%`;

    this.turboFill.style.transform = `scaleX(${turbo.toFixed(3)})`;
    // The meter says the one thing to do: keep the hand open, and it fills up and turns into turbo.
    const rising = turbo > this.lastTurboLevel + 1e-4;
    this.lastTurboLevel = turbo;
    const state = turboOn ? 'on' : turbo > 0.02 && rising ? 'filling' : 'idle';
    const word = turboOn ? this.words.turbo : this.session.shapes.open.fingers ? this.words.keepShape : this.words.keepOpen;
    if (this.turboBox.dataset.state !== state || this.turboWord.textContent !== word) {
      this.turboBox.dataset.state = state;
      this.turboWord.textContent = word;
    }
    this.speedShown.textContent = String(Math.round(speed * TOP_SPEED * SPEED_SHOWN_PER_METRE));

    race.order.forEach((spec, index) => {
      const entry = this.orderRows.get(spec.key ?? spec.id);
      if (!entry) return;
      entry.row.style.setProperty('--slot', String(index));
      entry.number.textContent = String(index + 1);
    });
  }

  setHands(side) {
    this.race.setDriverHand(side);
  }

  settingChanged(change) {
    if ('steering' in change) this.showSteering(change.steering);
    if ('rivals' in change) this.race.setRivalsMode(change.rivals);
    if ('reach' in change) this.race.setReach(change.reach);
    if ('fighter' in change) {
      this.cast = castFor(this.session.settings);
      this.race.setDrivers(this.cast.driver, this.cast.rivals);
      this.buildOrder();
    }
    if (('fighter' in change || 'laps' in change) && this.friends.room.inRoom) this.friends.room.tell(this.friends.hello());
  }

  /** With friends, the start waits on the grid until they're ready too. */
  holdStart(go) {
    return this.friends.holdStart(go);
  }

  /** A friend has gone in the middle of a race, and their car with them. */
  friendGone(key) {
    this.race.dropFriend(key);
    this.buildOrder();
  }

  enterCheck() {
    this.flyFilmLeft = 0;
    this.showFlyFilm(0);
    this.session.sound.stopEngine();
    this.race.setMode('grid');
    this.race.world.places.startLights.set(0);
  }

  /** Higher levels have more cars, more big hands and ramps, and keener racing: see racePlan in rules.js. */
  prepare(level) {
    // Racing friends, everyone races on the host's course, which doesn't move anyone's own level on.
    const friendly = this.friends.current;
    document.body.toggleAttribute('data-friends-race', Boolean(friendly));
    this.race.setFriends(friendly?.friends ?? null, friendly?.mySlot ?? 0);
    this.friends.carsReady(this.race);
    this.race.setLevel(friendly?.level ?? level);
    // Coins are counted from level 2, where they come in.
    this.coinsBox.hidden = !this.race.plan.coins;
    this.clearToast();
    this.buildOrder();
    this.race.reset(friendly?.laps ?? this.session.settings.laps);
    this.race.setMode('grid');
    this.race.world.places.startLights.set(0);
    this.missesInARow = 0;
    this.lastTurboToast = -Infinity;
    this.resetHints();
    this.showProgress();
    this.session.sound.startEngine();
  }

  /**
   * How long since "GO!", by the clock on the wall, for friends' games. Not by the game's own clock, which
   * runs slow on a computer that's struggling and would make it look faster than it is.
   */
  get sinceGo() {
    return performance.now() - this.goAt;
  }

  begin() {
    this.goAt = performance.now();
    this.race.setMode('race');
    this.race.world.places.startLights.go();
    this.race.celebrateAtLine();
  }

  resume() {
    this.session.sound.startEngine();
    this.race.setMode('race');
    this.race.world.places.startLights.go();
  }

  update(dt, snapshot) {
    const { session, race } = this;
    // A hand the camera can't see properly, gone, at the edge or too far off, is waited for. A closed hand in
    // plain view is a rest, which the others only wait for on Gentle.
    const hand = snapshot[session.monitor.side];
    race.update(dt, {
      handSeen: Boolean(hand) && hand.status !== 'missing' && hand.reason !== 'edge' && hand.reason !== 'small',
      drive: snapshot.drive,
      steer: snapshot.steer,
      steering: session.settings.steering,
      left: snapshot.left,
      right: snapshot.right,
      // The other hand: a fist and then open makes the car fly.
      other: snapshot.other,
    });
    const { speed, turboOn, boosting } = race.info;
    session.sound.engine(speed, snapshot.drive > 0, turboOn || boosting ? 1 : 0);
    this.friends.sendCar(race.carState, this.sinceGo);
    this.showProgress();
    this.showFlyFilm(dt);
  }

  idle(dt, { left, right, steer }) {
    this.race.update(dt, { left, right, steer });
    // The lights over the start line come on, one for each number of the countdown.
    if (this.session.screen === 'countdown') this.race.world.places.startLights.set(this.session.countWait > 0 ? 0 : 4 - Math.ceil(this.session.countLeft));
  }

  render() {
    // The label for something new goes up last of all, once this frame's prompt and words are where they'll be.
    this.showNewLabel();
    this.race.render();
  }

  /** A film of what to do with the next big hand, until the child has got the idea. */
  showFiveFilm(side) {
    const film = side ?? '';
    if (this.shownFilm === film) return;
    this.shownFilm = film;
    if (side) document.body.dataset.fiveFilm = side;
    else delete document.body.dataset.fiveFilm;
  }

  prompt(snapshot, dt) {
    const { session, race } = this;
    const steerable = session.settings.steering !== 'auto';
    const { gateNext: gate, gateAhead: ahead } = race;
    const side = gate?.side < 0 ? 'left' : 'right';
    const needsFiveHelp = race.fives < HINT_UNTIL_FIVES || this.missesInARow >= FILM_AGAIN_AFTER_MISSES;
    const gateHintDue = needsFiveHelp && steerable && ahead < FIVE_HINT_WITHIN;

    const gateHint = gateHintDue;
    const steerHint = session.playSeconds < STEER_HINT_SECONDS && steerable && !gateHint;
    // While a hint is up, a little film shows what it means.
    document.body.toggleAttribute('data-steer-hint', steerHint);
    this.showFiveFilm(gateHint && snapshot.handOpen ? side : null);

    // Once a big hand's hint has been up and gone, or gone over to the other side, it has had its say.
    const fiveKey = gateHint ? `five-${side}` : null;
    if (this.fiveHintKey && fiveKey !== this.fiveHintKey) this.fiveHintSpoken = true;
    this.fiveHintKey = fiveKey;

    const needed = session.handsPrompt(snapshot, dt);
    if (needed) {
      // After a while with the hand closed, stop asking and make resting feel fine. That's only on Gentle, where
      // everyone waits: racing to win, the others drive on, so the hand is still asked for.
      if (race.gentle && needed.key.startsWith('closed') && session.closedSeconds > REST_AFTER_SECONDS) {
        return { key: 'rest', text: SPOKEN_EVERYWHERE.resting, side: null };
      }
      return needed;
    }
    // Each hint is said aloud the first time it shows, and only shown after that. It has to stay unsaid-able
    // for the whole of its first showing, as the prompt box waits a moment before it shows and speaks.
    if (gateHint) return { key: fiveKey, text: SPOKEN.bigHand, side, silent: this.fiveHintSpoken };
    if (steerHint) return { key: 'steer-hint', text: STEER_HINT, side: null };
    return null;
  }

  finished() {
    this.clearToast();
    this.flyFilmLeft = 0;
    this.showFlyFilm(0);
    this.session.sound.stopEngine();
    this.showFiveFilm(null);
    this.race.setMode('finished');
  }

  summary() {
    const { race } = this;
    this.finishPrizes.textContent = this.prizesWords();
    this.friends.showResults();
    if (!this.friends.current) {
      const title = document.querySelector('#screen-finish h2');
      if (title) title.textContent = race.lostTo ? `${race.lostTo.name} won the race!` : WON_TITLE;
      this.finishStory.textContent = race.lostTo ? `${race.lostTo.name} got to the finish line first. You were ${ordinal(race.place)}.` : '';
      this.finishStory.hidden = !race.lostTo;
    }
    const fives = `${race.fives} of ${race.gatesMet}`;
    const sides = `Left ${race.fivesLeft}, right ${race.fivesRight}`;
    return {
      hero: race.info.stars,
      noun: 'race',
      rows: { fives: { left: fives, right: fives }, sides: { left: sides, right: sides } },
      // Racing to win, coming in behind one of the others means the same level again.
      won: !race.lostTo,
      // A race with friends is on the host's course, so it doesn't move the child's own level on.
      countsForLevel: !this.friends.current,
    };
  }
}

const driverChoices = ROSTER.map(({ id, name }) => `<label><input type="radio" name="fighter" value="${id}"> ${name}</label>`).join('\n        ');

new GameSession({
  // What the open and closed hand do here, for the hand shapes in the grown-ups' panel: see core/shapes.js.
  moves: { open: 'Drive', closed: 'Slow down' },
  shell: {
    title: 'High Five Racers',
    startLabel: 'Let’s race!',
    againLabel: 'Race again',
    finishTitle: WON_TITLE,
    heroMark: '★',
    heroNoun: 'stars',
    withWheel: true,
    extraRows: [{ id: 'fives', label: 'High fives' }, { id: 'sides', label: 'To each side' }],
    hudTop: `
      <div class="hud-top">
        <div class="chips">
          <div class="chip"><span class="chip-label">Place</span><span id="chip-place" class="chip-value">4th</span></div>
          <div class="chip"><span class="chip-label">Lap</span><span id="chip-lap" class="chip-value">1 of 2</span></div>
          <div class="chip"><span class="chip-label">Stars</span><span id="chip-stars" class="chip-value">0</span></div>
          <div class="chip"><span class="chip-label">Fives</span><span id="chip-fives" class="chip-value">0</span></div>
          <div id="chip-coins-box" class="chip chip-coins" hidden><span class="chip-label">Coins</span><span id="chip-coins" class="chip-value">0</span></div>
        </div>
        <div class="race-progress" aria-hidden="true"><div id="race-progress-fill" class="race-progress-fill"></div></div>
        <ol id="race-order" class="race-order" aria-hidden="true"></ol>
      </div>
      <div id="turbo" class="turbo" data-state="idle" aria-hidden="true">
        <svg class="turbo-flame" viewBox="0 0 40 52"><path d="M20 2c5 10 15 15 15 29a15 15 0 0 1-30 0c0-7 3-11 7-15 1 4 3 6 5 6 2-6 0-13 3-20z"/><path class="turbo-flame-core" d="M20 24c3 5 7 7 7 13a7 7 0 0 1-14 0c0-5 4-7 7-13z"/></svg>
        <svg class="turbo-hand" viewBox="0 0 52 56">
          <rect x="14" y="28" width="24" height="22" rx="9"/>
          <path class="turbo-finger turbo-finger-1" d="M17 31L9 13"/>
          <path class="turbo-finger turbo-finger-2" d="M23 29L20 7"/>
          <path class="turbo-finger turbo-finger-3" d="M30 29L32 7"/>
          <path class="turbo-finger turbo-finger-4" d="M36 31L43 14"/>
          <path class="turbo-finger turbo-thumb" d="M37 43L50 37"/>
        </svg>
        <div class="turbo-parts">
          <div class="turbo-words"><span id="turbo-word" class="turbo-word">Open wide!</span><span class="turbo-speed"><span id="speed-value">0</span></span></div>
          <div class="turbo-track"><div id="turbo-fill" class="turbo-fill"></div></div>
        </div>
      </div>
      <div id="fly-film" class="fly-film" aria-hidden="true">
        <svg viewBox="0 0 170 92">
          <g class="fly-film-hand">
            <rect x="16" y="46" width="34" height="30" rx="12"/>
            <path class="fly-film-finger" d="M22 50V28"/>
            <path class="fly-film-finger" d="M30 47V20"/>
            <path class="fly-film-finger" d="M38 47V21"/>
            <path class="fly-film-finger" d="M46 50V30"/>
            <path class="fly-film-finger fly-film-thumb" d="M50 66L62 56"/>
          </g>
          <path class="fly-film-arrow" d="M70 52h18m-7-7l7 7-7 7"/>
          <path class="fly-film-ground" d="M98 84h64"/>
          <g class="fly-film-car">
            <path class="fly-film-flame" d="M104 66l-12 -4 12 -4z"/>
            <rect x="104" y="54" width="52" height="16" rx="7"/>
            <rect class="fly-film-cab" x="118" y="45" width="22" height="12" rx="5"/>
            <circle cx="115" cy="72" r="6"/>
            <circle cx="145" cy="72" r="6"/>
          </g>
        </svg>
        <p id="fly-film-words" class="fly-film-words">Other hand: fist, then open!</p>
      </div>
      <div id="powers" class="powers" aria-hidden="true"></div>
      <div id="new-label" class="new-label" aria-hidden="true"><span id="new-label-tag" class="new-label-tag">New!</span><span id="new-label-mark" class="new-label-mark"></span><span id="new-label-name" class="new-label-name"></span></div>
      <div id="toast" class="toast" aria-live="polite"><img id="toast-face" class="toast-face is-hidden" alt=""><span id="toast-text"></span></div>
      <div class="five-film" aria-hidden="true">
        <svg viewBox="0 0 120 110">
          <g class="five-film-big">
            <rect x="82" y="46" width="30" height="30" rx="12"/>
            <path d="M88 50V24M97 46V16M105 46V18M113 52V28M84 66L72 56"/>
          </g>
          <g class="five-film-small">
            <rect x="14" y="62" width="24" height="24" rx="9"/>
            <path d="M18 66V46M25 62V40M32 62V42M38 66V50M15 78L6 70"/>
          </g>
          <g class="five-film-burst"><path d="M64 44l4 10 11 1-8 7 2 11-9-6-10 6 3-11-8-7 11-1z"/></g>
        </svg>
      </div>`,
    panelSettings: `
      <fieldset class="choice">
        <legend>Steering</legend>
        <label><input type="radio" name="steering" value="auto"> Car steers itself</label>
        <label><input type="radio" name="steering" value="help"> A little help</label>
        <label><input type="radio" name="steering" value="none"> No help</label>
      </fieldset>
      <fieldset class="choice">
        <legend>The other cars</legend>
        <label><input type="radio" name="rivals" value="race"> Race to win: they drive at their own pace, and the first over the line wins</label>
        <label><input type="radio" name="rivals" value="gentle"> Gentle: they stay close, wait while the hand rests, and let the child win</label>
      </fieldset>
      <fieldset class="choice">
        <legend>How far to reach for the big hands</legend>
        <label><input type="radio" name="reach" value="small"> A small reach</label>
        <label><input type="radio" name="reach" value="medium"> A medium reach</label>
        <label><input type="radio" name="reach" value="big"> Right to the edge of the road</label>
      </fieldset>
      <fieldset class="choice">
        <legend>Race length (with the hand open)</legend>
        <label><input type="radio" name="laps" value="1"> 1 lap, about a minute</label>
        <label><input type="radio" name="laps" value="2"> 2 laps, about 2 minutes</label>
        <label><input type="radio" name="laps" value="4"> 4 laps, about 4 minutes</label>
      </fieldset>
      <fieldset class="choice">
        <legend>Who drives</legend>
        ${driverChoices}
      </fieldset>`,
  },
  defaults: { steering: 'help', laps: 2, reach: 'medium', fighter: ROSTER[0].id, rivals: 'race' },
  choices: { steering: String, laps: Number, reach: String, fighter: String, rivals: String },
  tagline: (side) => `Open your ${side} hand to make your car go!`,
  finishLine: 'You did it! Great racing!',
  portraits: () => renderPortraits(ROSTER),
  createSound: (options) => new CarSound(options),
  createGame: async (session) => {
    // The signs and banners draw text, so their font has to be ready first.
    await document.fonts.load('700 104px Fredoka');
    return new RaceGame(session);
  },
}).start();
