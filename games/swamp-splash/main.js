// Swamp Splash: the child jumps, and their character lands in the swamp with a splash that throws mud on the
// screen, as if it were a window. The bigger the jump, the more mud. The window has to be muddy enough before the
// rain cloud that's coming across the sky gets here and washes it. It's the game about jumping, and jumping
// higher. This file runs it from start to finish, on top of what the body games share in core/body/game.js. The
// rules are in swamp.js, and what it looks like is in view.js.
import { BODY_SAY, BodyGame, byElementId } from '../../core/body/game.js';
import { ROSTER } from '../../core/body/roster.js';
import { mountBodyShell } from '../../core/body/shell.js';
import { SwampSound } from './swamp-sound.js';
import { SPLASH, Swamp, newAt as newAtLevel } from './swamp.js';
import { SwampView } from './view.js';

const AFTER_WON_SECONDS = 3;
const AFTER_LOST_SECONDS = 2.6; // The rain washes the window, and then the card says so.
const COUNT_FROM = 3;
const GO_SHOWN_SECONDS = 0.9;
const AIR_MOST = 1.6; // A jump that hasn't come down by now, as far as the camera can tell, has.
const AIR_LEAST = 0.12;
const SIZE_MOST = 2.8; // No jump counts for more than this, however high.
const STAR_SIZE = 1.5; // A star jump is never less than this, even one stepped into.
// How high a big jump is, as a share of the child's height that their hips go up: the grown-ups' choice. A jump
// that only just counts is size 1, and one this high is SPLASH.bigAt, the biggest splash there is. A child who
// lifts a foot in place of jumping is measured by how high the foot goes, in the same way.
const HIGH = { low: 0.1, medium: 0.15, high: 0.2 };
const LIFT_DOWN = 0.05; // A lifted foot is down again below this share of the child's height.
const IDLE_SECONDS = 7; // With no jump for this long, the character shows how.
const KNEES_AFTER = 2; // From the level that brings it, bent knees are shown after this many jumps.

// moveSize is the body games' setting for how big a move has to be: here, how high the smallest jump that counts
// is. It's kept as the other games have it, as settings are saved all together.
const DEFAULTS = { moveSize: 'small', swampRain: 'rain', swampJump: 'jump', swampHigh: 'medium', fighter: 'giraffe' };
const CHOICES = { swampRain: String, swampJump: String, swampHigh: String };
// The card at the end of a game the rain won. Its big button is to try again, as after any game that was lost.
const LOST_TITLE = 'The rain got there first! Try again.';

// Every one of these has a rendered voice file: see audio/voice/lines.json.
const SAY = {
  choose: 'Who’s jumping in the swamp today?',
  mission: 'Jump in the swamp! Cover the window in mud before the rain comes!',
  jump: 'Jump!',
  higher: 'Jump as high as you can!',
  lift: 'Lift your knee up high!',
  knees: 'Bend your knees, then jump!',
  bubble: 'Now! Land on the bubble!',
  heron: 'Jump, and scare the heron away!',
  star: 'Do a star jump!',
  rain: 'The rain got there first! Try again!',
  won: 'What a muddy window!',
};
// The moment something is seen, the child is told so, as words on the screen.
const SEEN_WORDS = {
  splash: ['Splash!', 'ჭყაპ!'],
  big: ['Big splash!', 'დიდი ჭყაპი!'],
  super: ['Super splash!', 'სუპერ ჭყაპი!'],
  gold: ['Golden mud!', 'ოქროს ტალახი!'],
  scared: ['Off it goes!', 'გაფრინდა!'],
};
const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

class SwampSplash extends BodyGame {
  constructor() {
    super({
      defaults: DEFAULTS,
      choices: CHOICES,
      // How high a big jump is goes on to a game that's being played at once. The rest, and the level, start it again.
      atOnce: ['swampHigh'],
      lines: new URL('./audio/voice/lines.json', import.meta.url),
      createSound: (options) => new SwampSound(options),
    });
    this.swamp = null;
    this.air = null; // A jump that's up: { since, peak, star }.
    this.timer = 0;
    this.countLeft = 0;
    this.idleFor = 0;
    this.filmFor = null;
    this.did = { knees: false, star: false };
    this.lastNumbers = {};
  }

  /** What a level brings that's new, for the cards: see NEW_THINGS in swamp.js. */
  newAt(level) {
    return newAtLevel(level);
  }

  setUp() {
    this.view = new SwampView(byElementId('game'));
    this.stage = this.view;
    this.view.setView('title');

    byElementId('start').addEventListener('click', () => {
      this.sound.unlock();
      this.view.setView('choose');
      this.setScreen('choose');
      this.sound.ready.then(() => {
        if (this.screen === 'choose') this.sound.say(SAY.choose);
      });
    });
    byElementId('swamp-start').addEventListener('click', () => this.openCameraThen(() => this.beginBodyCheck()));
    byElementId('jump-again').addEventListener('click', () => this.jumpAgain());
    byElementId('other-jumper').addEventListener('click', () => {
      this.confetti.stop();
      this.view.setSwamp(null);
      this.view.setView('choose');
      this.setScreen('choose');
    });
    byElementId('recheck').addEventListener('click', () => {
      byElementId('panel').close();
      if (this.camera.running) this.beginBodyCheck(this.screen === 'playing' ? 'resume' : 'start');
      else this.openCameraThen(() => this.beginBodyCheck());
    });
  }

  debug() {
    const game = this;
    return {
      view: this.view,
      get swamp() {
        return game.swamp;
      },
      get air() {
        return game.air;
      },
    };
  }

  showChosen(spec) {
    this.view.setWalker(spec);
  }

  /** Whether this child lifts a knee or a foot, in place of jumping. */
  get lifting() {
    return this.settings.swampJump === 'lift';
  }

  /* ---------- the body ---------- */

  /** How high a big jump is for this child, as a share of their height: see HIGH. */
  get high() {
    return HIGH[this.settings.swampHigh] ?? HIGH.medium;
  }

  /**
   * How big the jump is right now: 1 is the smallest that counts, and SPLASH.bigAt is as high as a big jump is
   * set to be. For a child who lifts a foot in place of jumping, it's how high the foot is.
   */
  height() {
    const { reader } = this;
    const least = this.lifting ? LIFT_DOWN : reader.jumpNeeded;
    const now = this.lifting ? reader.footHeight ?? 0 : reader.jumpEffort ?? 0;
    return 1 + (Math.max(0, now - least) / Math.max(0.01, this.high - least)) * (SPLASH.bigAt - 1);
  }

  /** Whether the child is back on the floor. */
  down() {
    const { reader } = this;
    return this.lifting ? (reader.footHeight ?? 0) < LIFT_DOWN : !reader.inAir;
  }

  /**
   * Each time the tracker has looked at the child: a jump going up is followed to its highest, and when it comes
   * down that's how big it was. Bent knees are noted too, for the super splash.
   */
  onMoves(moves, now) {
    const { reader, view } = this;
    const crouch = Math.min(1, Math.max(0, (reader.sink ?? 0) / Math.max(0.001, reader.squatNeeded)));
    // The character goes up as the child does, there and then: all the way for a big jump.
    const up = this.lifting ? reader.footHeight ?? 0 : reader.jumpEffort ?? 0;
    const playing = this.screen === 'playing';
    view.setBody({ jump: playing ? Math.min(1, up / this.high) : 0, crouch: playing ? crouch : 0 });
    if (this.screen !== 'playing' || !this.swamp) return;
    for (const { move } of moves) {
      if (move === 'stomp') this.swamp.squat();
      const star = move === 'starBurst';
      const up = this.lifting ? move === 'kick' || move === 'knee' : move === 'flying' || star;
      if (!up) continue;
      if (this.air) this.air.star ||= star;
      else {
        this.air = { since: now, peak: star ? STAR_SIZE : 1, star };
        this.sound.jump();
      }
    }
    this.followAir(now);
  }

  /** A jump that's up is followed to its highest, and lands when the child is down again. */
  followAir(now) {
    const { air } = this;
    if (!air) return;
    air.peak = Math.max(air.peak, this.height());
    const long = now - air.since;
    if ((long >= AIR_LEAST && this.down()) || long >= AIR_MOST) this.touchDown();
  }

  touchDown() {
    const { air } = this;
    this.air = null;
    this.idleFor = 0;
    this.swamp.land(Math.min(SIZE_MOST, Math.max(1, air.peak)), { star: air.star });
  }

  /** What the panel says the camera can see, so a grown-up can tell why a jump isn't counting. */
  showLiveReading() {
    const now = performance.now();
    if (now - (this.panelAt ?? 0) < 200) return;
    this.panelAt = now;
    const { reader } = this;
    const percent = (share) => `${Math.round(share * 1000) / 10}%`;
    const reading = this.lifting
      ? `The camera sees the higher foot ${percent(reader.footHeight ?? 0)} of the child’s height off the floor. A foot ${percent(this.high)} up is the biggest splash.`
      : `The camera sees the child ${percent(reader.jumpEffort ?? 0)} of their height off the floor. A jump of ${percent(reader.jumpNeeded)} is the smallest that counts, and one of ${percent(this.high)} is the biggest splash.`;
    byElementId('live-reading').textContent = reading;
  }

  /* ---------- a game ---------- */

  afterBodyCheck(then) {
    if (then === 'resume') {
      this.view.setView('play');
      this.setScreen('playing');
    } else this.countDown();
  }

  countDown() {
    const { settings, view } = this;
    this.swamp = new Swamp({
      level: this.startLevel(),
      gentle: settings.swampRain === 'gentle',
      onEvent: (event) => this.onSwampEvent(event),
    });
    view.setSwamp(this.swamp);
    view.setView('play');
    this.air = null;
    this.idleFor = 0;
    this.filmFor = null;
    this.did = { knees: false, star: false };
    this.lastNumbers = {};
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
    this.setCount(this.translate('Go!'));
    this.sound.go();
    this.sound.startSwamp();
    this.timer = GO_SHOWN_SECONDS;
    this.setScreen('playing');
    this.swamp.begin();
    // The mission, in one line.
    this.sound.say(SAY.mission);
  }

  /** The character showing a move, with what's asked for under it. */
  showFilm(name, text) {
    const key = `${name}:${text}`;
    if (this.filmFor === key) return;
    this.filmFor = key;
    this.showCoach(name, this.translate(text));
  }

  hideFilm() {
    if (this.filmFor === null) return;
    this.filmFor = null;
    this.hideCoach();
  }

  updatePlaying(dt, now) {
    const { swamp } = this;
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) this.setCount('');
    }
    // Nobody in the picture: everything waits, the rain cloud too.
    const lost = this.bodyLost();
    // A jump the camera lost sight of comes down all the same.
    if (this.air && (lost || performance.now() / 1000 - this.air.since >= AIR_MOST)) this.touchDown();
    swamp.update(dt, { seen: !lost });
    if (swamp.state !== 'play') return;
    this.idleFor = lost ? 0 : this.idleFor + dt;
    this.updateHud();
    this.sound.cloud(swamp.cloud);

    // What's asked for, most pressing first, and the character showing how when the child seems to need it.
    const { rules, stats } = swamp;
    const ask = (key) => ({ key, text: SAY[key], side: null });
    let prompt = null;
    let film = null;
    if (lost) prompt = { key: 'come-back', text: BODY_SAY.comeBack, side: null };
    else if (swamp.heron && swamp.heron.coming !== null) prompt = ask('heron');
    else if (swamp.bubbleBig) prompt = ask('bubble');
    else if (rules.star && !this.did.star && stats.jumps >= 1 && !this.lifting) film = ['starJump', SAY.star];
    else if (rules.squat && !this.did.knees && stats.jumps >= KNEES_AFTER && !this.lifting) film = ['squat', SAY.knees];
    else if (stats.jumps === 0 || this.idleFor > IDLE_SECONDS) film = this.lifting ? ['kneeLift', SAY.lift] : ['jump', stats.jumps === 0 ? SAY.jump : SAY.higher];
    if (film) {
      this.showFilm(...film);
      prompt = { key: film[1], text: film[1], side: null };
    } else this.hideFilm();
    this.prompt.show(prompt, now);
  }

  /** The bar along the top: how muddy the window is, with a mark where it's muddy enough, and the golden stars. */
  updateHud() {
    const { swamp } = this;
    if (!swamp) return;
    const percent = Math.round(swamp.coverage * 100);
    const stars = swamp.stats.stars;
    const key = `${percent}:${stars}:${swamp.levelNumber}`;
    if (this.lastNumbers.hud === key) return;
    this.lastNumbers.hud = key;
    byElementId('mud-now').textContent = `${percent}%`;
    byElementId('mud-fill').style.width = `${percent}%`;
    byElementId('mud-target').style.left = `${Math.round(swamp.rules.target * 100)}%`;
    byElementId('mud-meter').setAttribute('aria-valuenow', String(percent));
    byElementId('stars-chip').hidden = !swamp.rules.gold;
    byElementId('stars').textContent = String(stars);
  }

  /** What the rules say happened, heard and seen. */
  onSwampEvent(event) {
    const { sound, view, swamp } = this;
    view.on(event);
    switch (event.type) {
      case 'land':
        sound.splash(event.size);
        if (event.bent) this.did.knees = true;
        if (event.star) this.did.star = true;
        this.showSeen(event.bent ? SEEN_WORDS.super : event.big ? SEEN_WORDS.big : SEEN_WORDS.splash, { x: 0.5, y: 0.42 });
        break;
      case 'splat':
        if (event.kind === 'jump') sound.splat(event.fresh);
        break;
      case 'frog':
        sound.frog();
        break;
      case 'pop':
        sound.pop();
        break;
      case 'star':
        sound.gold();
        this.showSeen(SEEN_WORDS.gold, { x: 0.5, y: 0.3 });
        break;
      case 'heron':
        sound.heron();
        break;
      case 'scared':
        sound.heron();
        this.showSeen(SEEN_WORDS.scared, { x: 0.5, y: 0.3 });
        break;
      case 'shower':
      case 'wiped':
        sound.wash();
        break;
      case 'cup':
        sound.cup();
        break;
      case 'won':
        this.onWon();
        break;
      case 'lost':
        this.onLost();
        break;
      default:
    }
    if (swamp) this.updateHud();
  }

  /** What every ending does: the camera goes off, and nothing more is asked for. */
  wrapUp() {
    this.camera.stop();
    this.reader.forget();
    this.latestBody = null;
    this.air = null;
    this.hideFilm();
    this.prompt.clear();
    this.setCount('');
    this.updateHud();
    this.sound.stopSwamp();
    this.view.setBody({});
  }

  onWon() {
    this.wrapUp();
    this.sound.finish(SAY.won);
    this.sound.cheer();
    this.view.setView('finish');
    this.timer = AFTER_WON_SECONDS;
    this.setScreen('finishing');
  }

  /** The rain got there first: it washes the window, and the card says so, with no cheering. */
  onLost() {
    this.wrapUp();
    this.sound.wash();
    this.sound.finish(SAY.rain, { lost: true });
    this.timer = AFTER_LOST_SECONDS;
    this.setScreen('finishing');
  }

  showFinish() {
    const { swamp } = this;
    const { stats, rules } = swamp;
    const lost = swamp.state === 'lost';
    const percent = Math.round((lost ? rules.target : swamp.coverage) * 100);
    byElementId('finish-muddy').textContent = lost ? `${percent}% was the mark` : `${percent}% muddy`;
    const biggest = Math.round(stats.biggest * 10) / 10;
    const how = this.lifting ? 'lifted a foot' : 'jumped';
    const big = stats.big ? `, ${plural(stats.big, 'of them a big one', 'of them big ones')}` : '';
    const most = stats.jumps ? ` The biggest was ${biggest} times the smallest that counts.` : '';
    byElementId('finish-line').textContent = `${this.chosen.name} ${how} ${plural(stats.jumps, 'time')}${big}.${most}`;
    byElementId('finish-prizes').textContent = this.prizeWords();
    this.fillTallyCards(byElementId('finish-tally'), [
      { name: 'jumps', icon: this.lifting ? 'kneeLift' : 'jump', label: this.lifting ? 'Lifts' : 'Jumps', value: stats.jumps },
      { name: 'big', icon: this.lifting ? 'kneeLift' : 'jump', label: 'Big ones', value: stats.big },
      ...(rules.squat ? [{ name: 'supers', icon: 'squat', label: 'Super splashes', value: stats.supers }] : []),
      ...(rules.star ? [{ name: 'stars', icon: 'starJump', label: 'Star jumps', value: stats.starJumps }] : []),
    ]);
    // A window that got muddy enough moves on a level, and one the rain washed is to be tried again.
    this.finishLevel(!lost);
    if (lost) byElementId('finish-title').textContent = LOST_TITLE;
    else {
      byElementId('finish-title').textContent = SAY.won;
      this.confetti.start();
    }
    this.setScreen('finish');
  }

  /** What else happened, in words, from what this level has. Nothing at level 1. */
  prizeWords() {
    const { stats, rules } = this.swamp;
    const parts = [];
    if (rules.frogs && stats.frogs) parts.push(`the frogs jumped ${plural(stats.frogs, 'time')}`);
    if (rules.bubble && stats.bubbles) parts.push(`${plural(stats.bubbles, 'mud bubble')} burst`);
    if (rules.heron && stats.herons) parts.push(`the heron was scared off ${plural(stats.herons, 'time')}`);
    if (rules.gold && stats.stars) parts.push(`${plural(stats.stars, 'splash', 'splashes')} of golden mud`);
    if (stats.cup) parts.push('the cup is won');
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
    this.air = null;
    this.hideFilm();
    this.sound.stopSwamp();
    this.view.setBody({});
  }

  jumpAgain() {
    this.confetti.stop();
    this.reader.forget();
    this.openCameraThen(() => this.beginBodyCheck());
  }

  /* ---------- every frame ---------- */

  frame(dt, now) {
    switch (this.screen) {
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
  title: 'Swamp Splash',
  tagline: 'Jump in the swamp! The bigger you jump, the more mud lands on the window. Cover it before the rain comes!',
  startLabel: 'Choose your jumper',
  chooseTitle: 'Who’s jumping in the swamp today?',
  chooseSide: `
      <p class="choose-tip">Jump, and mud flies up onto the window. Jump higher, and more of it does. Get the window muddy enough before the rain cloud gets here.</p>
      <button id="swamp-start" class="big-button" type="button">Let’s jump!</button>`,
  hud: `
  <header id="swamp-top" class="swamp-top">
    <div class="chip chip-mud">
      <span class="chip-label">Mud</span>
      <span id="mud-now" class="chip-value">0%</span>
      <span id="mud-meter" class="mud-meter" role="progressbar" aria-label="How muddy the window is" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="mud-fill" class="mud-fill"></span><span id="mud-target" class="mud-target"></span></span>
    </div>
    <div id="stars-chip" class="chip" hidden><span class="chip-label">Golden</span><span id="stars" class="chip-value">0</span></div>
  </header>`,
  finishBody: `
      <h2 id="finish-title">What a muddy window!</h2>
      <p class="finish-hero"><span id="finish-muddy">0% muddy</span></p>
      <p id="finish-line" class="finish-open"></p>
      <p id="finish-prizes" class="finish-prizes"></p>
      <div id="finish-tally" class="finish-tally"></div>
      <p class="small-print">These numbers are shown once and not saved.</p>
      <div class="finish-actions">
        <button id="jump-again" class="big-button" type="button">Jump again</button>
        <button id="other-jumper" class="soft-button" type="button">Choose another jumper</button>
        <a class="all-games" href="../../index.html">All games</a>
      </div>`,
  panelLead: 'The game is paused. The camera needs to see all of the child, feet too, standing up. Jumping needs room: clear the floor, and stay close by.',
  handLegend: 'Side being worked on',
  safetyPrint: 'Jumping, a child can land badly or slip: please clear some space on a floor that isn’t slippery, and stay close by.',
  panelSettings: `
    <fieldset class="choice">
      <legend>The rain cloud</legend>
      ${choice('swampRain', 'rain', 'It comes: the window has to be muddy enough before it gets here, or it’s washed and the level is tried again')}
      ${choice('swampRain', 'gentle', 'Gentle: no rain cloud. Take all the time you need')}
    </fieldset>
    <fieldset class="choice">
      <legend>How high a big jump is: the child’s hips going up by this share of their height, or their foot if they lift one. A jump this high is the biggest splash, and smaller ones are less</legend>
      ${choice('swampHigh', 'low', `Low: ${Math.round(HIGH.low * 100)}%`)}
      ${choice('swampHigh', 'medium', `Medium: ${Math.round(HIGH.medium * 100)}%`)}
      ${choice('swampHigh', 'high', `High: ${Math.round(HIGH.high * 100)}%`)}
    </fieldset>
    <fieldset class="choice">
      <legend>How the child jumps</legend>
      ${choice('swampJump', 'jump', 'Really jumping, or a star jump: the higher, the bigger the splash')}
      ${choice('swampJump', 'lift', 'Lifting a knee or a foot, for a child who can stand but not jump: the higher, the bigger the splash')}
    </fieldset>`,
});

// Checked here so that a mistake in the roster shows up as soon as the page loads.
if (!ROSTER.length) console.error('No jumpers');

new SwampSplash().start();
