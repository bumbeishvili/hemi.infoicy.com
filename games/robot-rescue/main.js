// Robot Rescue: robots have caught all the friends from the other games and locked them up around
// town. The child rides a little tram from place to place, and frees each friend by dealing with the
// robots there. An open hand fires at whatever is in the crosshair, and a closed hand raises a shield
// and reloads. The story and rules are in rescue.js, and the town and robots are in stage.js.
import { renderPortraits } from '../../core/body/portraits.js';
import { ROSTER } from '../../core/body/roster.js';
import { GameSession, SPOKEN } from '../../core/session.js';
import { STORY_BOX, StoryBox } from '../../core/story.js';
import { Mission, POWERS, PRIZES, newsAt, readHand } from './rescue.js';
import { RescueSound } from './rescue-sound.js';
import { Stage } from './stage.js';

const OPEN_TO_FIRE = 'Open your hand to fire!';
const CLOSE_TO_RELOAD = 'Close your hand to reload!';
const CLOSE_FOR_SHIELD = 'Close your hand for the shield!';
const GOLD_STARS = 'Shoot the gold stars on the big robot!';
const FINISH = 'You saved everyone!';
const SO_CLOSE = 'So close!';
// What the card says when the goo wins, in the story. It's only shown, as "So close!" is what's said.
const GOO_WON = { en: 'The goo stopped the tram!', ka: 'ლორწომ ტრამვაი გააჩერა!' };
const TRY_AGAIN = { en: 'Try again', ka: 'კიდევ სცადე' };
const GIRAFFE_ASKS = 'Help! The robots caught all of us!';

const BY_THE_END = {
  won: { mark: '🎉', one: 'friend freed', many: 'friends freed' },
  lost: { mark: '🤖', one: 'robot dropped', many: 'robots dropped' },
};
const STORY_SECONDS = 3.2; // How long a character's picture stays up after speaking.
const FILM_AT_MOST_SECONDS = 40;
const FILM_AGAIN_AFTER_SECONDS = 12; // Without firing, it comes back.
const CLOSED_PROMPT_SECONDS = 1.6;
const SHIELD_PROMPT_CLOSE = 0.42; // How near the goo is to arriving before the child is told.
const SPOKEN_AT_MOST = 2; // Each prompt is spoken this many times in a game, and read after that.
const STARS_SHOWN_SECONDS = 4;
const GOT_IT_CLOSED_SECONDS = 0.4; // A closed hand held this long has plainly been done on purpose.
const BY_THE_WATER = new Set(['canal', 'harbour']);
const NAMES_AFTER_SECONDS = 1.3;

const byId = (id) => document.getElementById(id);
const HEART = '<svg class="heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21C5 15.500 2 12 2 8a5.500 5.500 0 0 1 10-3 5.500 5.500 0 0 1 10 3c0 4-3 7.500-10 13z"/></svg>';

class RescueGame {
  chimeOnOpen = false; // Hands open and close all the time here, so a chime would be noise.

  constructor(session) {
    this.session = session;
    this.story = new StoryBox(session);
    this.stage = new Stage(byId('game'), byId('sights'));
    this.mission = null;
    this.storyFor = 0;
    this.closedFor = 0;
    this.firedAgo = 0;
    this.filming = false;
    this.gotIt = { fired: false, closed: false };
    this.starsFor = 0;
    this.spokenTimes = new Map();
    this.wasShielding = false;
    this.ended = null;
    this.applySettings();
    this.startPreview();
    const game = this;
    this.debug = {
      stage: this.stage,
      get mission() {
        return game.mission;
      },
      get game() {
        return game;
      },
    };
  }

  /** The town behind the title, with robots marching about in it. Nothing's thrown, or counted. */
  startPreview() {
    const mission = new Mission({ pace: 'slow', onEvent: (event) => this.stage.onEvent(event) });
    this.stage.reset(mission);
    mission.start();
    this.mission = mission;
    this.preview = true;
  }

  applySettings() {
    const { hands, reach, language } = this.session.settings;
    this.stage.configure({ side: hands, reach, language });
  }

  /** What a level brings that's new: see NEWS in rescue.js. */
  newAt(level) {
    return newsAt(level);
  }

  setHands() {
    this.applySettings();
  }

  /** Speed and difficulty can change in the middle of a game. The number of stops is for the next. */
  settingChanged(change) {
    this.applySettings();
    if (this.preview) return;
    if ('pace' in change) this.mission.configure({ pace: change.pace });
    if ('rescueGoo' in change) {
      this.mission.configure({ level: change.rescueGoo });
      this.showHearts();
    }
    if ('reloading' in change) this.mission.configure({ reloading: change.reloading === 'on' });
  }

  /* ---------- a new game ---------- */

  /**
   * The robots are on their way before the countdown has finished, so there's nothing to wait for.
   * level, from 1 to 10, makes it harder within the grown-up's choices: see levelPlan in rescue.js.
   */
  prepare(level = 1) {
    const { settings } = this.session;
    this.applySettings();
    this.story.hide();
    this.storyFor = 0;
    this.closedFor = 0;
    this.firedAgo = 0;
    // With reloading off, closing the hand is only for the shield, and the film needn't wait for it.
    this.gotIt = { fired: false, closed: settings.reloading === 'off' };
    this.spokenTimes.clear();
    this.ended = null;
    this.saidStars = false;
    this.starsFor = 0;
    this.session.sound.lost = false;
    this.preview = false;
    this.mission = new Mission({
      stops: settings.stops,
      pace: settings.pace,
      level: settings.rescueGoo,
      levelNumber: level,
      reloading: settings.reloading !== 'off',
      onEvent: (event) => this.onEvent(event),
    });
    this.stage.reset(this.mission);
    this.mission.start();
    this.stage.showSights = true;
    this.haulShown = null;
    this.powerShown = null;
    this.progressShown = 0;
    this.showHearts();
    this.showProgress();
    this.showHaul();
    this.showPower();
  }

  begin() {
    const { sound } = this.session;
    sound.startRide();
    this.story.say('giraffe', GIRAFFE_ASKS);
    this.storyFor = STORY_SECONDS;
  }

  /* ---------- what happens ---------- */

  onEvent(event) {
    this.stage.onEvent(event);
    const { sound } = this.session;
    const handlers = {
      shot: () => {
        sound.shot();
        this.firedAgo = 0;
        this.gotIt.fired = true;
      },
      'robot-hit': () => sound.hit(),
      'spot-hit': () => sound.hit(),
      peek: () => sound.popUp(),
      hop: () => sound.popUp(),
      'robot-dropped': () => this.onDropped(event),
      'spot-open': () => this.onSpotOpen(),
      'spot-done': () => sound.spotDone(),
      goo: () => sound.gooThrown(),
      'goo-shot': () => sound.gooPopped(),
      'goo-blocked': () => {
        sound.gooBlocked();
        // The shield bubble from a power-up stopped it, not a closed hand.
        if (!event.bubble) this.gotIt.closed = true;
      },
      // Its counter is shown, and measured, as soon as it's on its way, so that it flies straight to it.
      'prize-out': () => {
        this.homesWanted = true;
      },
      prize: () => {
        sound.prizeIn(event.prize.kind);
        this.showHaul();
        this.showPower();
      },
      'heart-up': () => {
        sound.heartUp();
        this.showHearts(event.hearts);
      },
      bonk: () => sound.bonk(),
      'lid-off': () => sound.lidOff(),
      split: () => sound.splitApart(),
      key: () => sound.keyFlies(),
      'chest-open': () => sound.chestOpens(),
      'pal-freed': () => {
        sound.palFreed();
        this.showHaul();
      },
      bubbled: () => sound.bubbleUp(),
      bounce: () => sound.boingBall(),
      'goo-hit': () => this.onGooHit(event),
      empty: () => sound.ranOut(),
      reloaded: () => {
        sound.reload();
        this.gotIt.closed = true;
      },
      freed: () => this.onFreed(event),
      moving: () => sound.bell(),
      arrived: () => this.showProgress(),
      won: () => this.end(FINISH),
      lost: () => this.onLost(),
    };
    handlers[event.type]?.();
    this.showProgress();
  }

  onDropped({ robot }) {
    const { sound } = this.session;
    if (robot.kind === 'big') sound.bigFallsApart();
    else sound.fallApart();
  }

  onSpotOpen() {
    const { sound } = this.session;
    sound.spotOpen();
    if (!this.saidStars) {
      this.saidStars = true;
      this.starsFor = STARS_SHOWN_SECONDS;
      sound.say(GOLD_STARS);
    }
  }

  onGooHit({ hearts }) {
    this.session.sound.gooHit();
    this.showHearts(hearts);
  }

  onFreed({ place, hearts }) {
    this.session.sound.cageOpens();
    this.story.say(place.who, place.thanks);
    this.storyFor = STORY_SECONDS;
    this.showHearts(hearts);
  }

  onLost() {
    this.session.sound.lost = true;
    this.end(SO_CLOSE);
  }

  /** The last words on the card. Not getting there counts what was done, and doesn't throw a party. */
  end(words) {
    this.ended = words;
    const { session } = this;
    const { mark, one, many } = BY_THE_END[words === SO_CLOSE ? 'lost' : 'won'];
    const lost = words === SO_CLOSE;
    const language = session.settings.language === 'ka' ? 'ka' : 'en';
    session.finishLine = words;
    document.querySelector('#screen-finish h2').textContent = lost ? GOO_WON[language] : session.translate(words);
    document.querySelector('#screen-finish .hero-mark').textContent = mark;
    document.querySelector('#screen-finish .finish-hero').lastChild.textContent = ` ${this.heroCount() === 1 ? one : many}`;
    session.finish();
    // The level doesn't move on, and the big button says so.
    const again = document.getElementById('play-again');
    if (lost && again) again.textContent = TRY_AGAIN[language];
    // And no confetti for the goo winning.
    if (lost) session.hud.confetti?.stop();
  }

  /**
   * How far through the rescue it is: the friends freed, and how much of this stop has been dealt with.
   * It never goes backwards, as a robot coming apart into two little ones adds one to deal with.
   */
  showProgress() {
    const { mission } = this;
    if (!mission || this.preview) return;
    byId('chip-friends').textContent = `${mission.freed} of ${mission.stops.length}`;
    byId('chip-robots').textContent = String(mission.stats.robots);
    const here = Math.max(1, mission.toDealWith);
    const share = mission.freed + (mission.phase === 'fighting' ? Math.max(0, 1 - mission.leftHere / here) : 0);
    this.progressShown = Math.max(this.progressShown ?? 0, share);
    byId('race-progress-fill').style.width = `${Math.round((this.progressShown / mission.stops.length) * 100)}%`;
  }

  /** The kinds of prize on their way over, which are shown where they'll be counted before they get there. */
  coming() {
    const prizes = this.mission?.prizes ?? [];
    return {
      kinds: new Set(prizes.map(({ kind }) => kind)),
      powers: new Set(prizes.filter(({ kind, power }) => kind === 'power' && power !== 'heart').map(({ power }) => power)),
    };
  }

  /** Bolts, gems, stars and friends from the air, from level 2, each once there's one, or one on its way. */
  showHaul() {
    const { mission } = this;
    const chip = byId('chip-haul');
    if (!mission || this.preview || !chip) return;
    const { stats, plan } = mission;
    const { kinds } = this.coming();
    const key = `${plan.bolts} ${stats.bolts} ${stats.gems} ${stats.stars} ${stats.pals} ${[...kinds].join(',')}`;
    if (key === this.haulShown) return;
    this.haulShown = key;
    chip.hidden = !plan.bolts;
    for (const [kind, { stat }] of Object.entries(PRIZES)) {
      const item = chip.querySelector(`[data-haul='${kind}']`);
      item.hidden = kind !== 'bolt' && !stats[stat] && !kinds.has(kind);
      item.querySelector('.haul-count').textContent = String(stats[stat]);
    }
    this.measureTop();
  }

  /**
   * The power-ups that are on, each with a bar that runs down, and those on their way over, faintly, so
   * that each flies to its own place.
   */
  showPower() {
    const { mission } = this;
    const chip = byId('chip-power');
    if (!mission || !chip) return;
    const on = this.preview ? [] : mission.powersOn;
    const coming = this.preview ? [] : [...this.coming().powers].filter((kind) => !on.includes(kind));
    const shown = [...on, ...coming];
    // Its name is in the language the voice speaks, which a grown-up can change in the middle of a game.
    const ka = this.session.settings.language === 'ka';
    const key = `${on.join(',')} ${coming.join(',')} ${ka}`;
    if (key !== this.powerShown) {
      this.powerShown = key;
      chip.hidden = !shown.length;
      chip.querySelector('.chip-value').innerHTML = shown.map((kind) => `<span class="power${on.includes(kind) ? '' : ' is-coming'}" data-power="${kind}"><span class="power-mark" aria-hidden="true">${POWERS[kind].mark}</span><span class="power-bar"><span></span></span></span>`).join('');
      chip.querySelector('.chip-label').textContent = shown.length === 1 ? (ka ? POWERS[shown[0]].nameKa : POWERS[shown[0]].name) : 'Power-ups';
      this.measureTop();
    }
    for (const kind of shown) {
      const { left, seconds } = on.includes(kind) ? mission.powerLeft(kind) : { left: 1, seconds: 1 };
      const bar = chip.querySelector(`[data-power='${kind}'] .power-bar span`);
      if (bar) bar.style.width = `${Math.round((left / seconds) * 100)}%`;
    }
  }

  /**
   * The story box goes under the second row of chips, wherever that ends up. Prizes fly to where
   * they're counted, so the stage is told where that is.
   */
  measureTop() {
    const bottom = Math.round(document.querySelector('.hud-top')?.getBoundingClientRect().bottom ?? 0);
    if (bottom > 0 && bottom !== this.topBottom) {
      this.topBottom = bottom;
      document.documentElement.style.setProperty('--hud-bottom', `${bottom}px`);
    }
    this.stage.hudBottom = this.topBottom;
    // Each kind of prize to its own counter, each power-up to its own place, and a heart to the first
    // heart that's gone.
    const homes = {};
    const middle = (element) => {
      const box = element?.getBoundingClientRect();
      return box?.width ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null;
    };
    for (const kind of Object.keys(PRIZES)) {
      const home = middle(document.querySelector(`#chip-haul [data-haul='${kind}'] [aria-hidden]`));
      if (home) homes[kind] = home;
    }
    for (const kind of Object.keys(POWERS)) {
      const home = kind === 'heart' ? middle(document.querySelector('#chip-hearts .heart.is-gone') ?? document.querySelector('#chip-hearts .heart:last-child')) : middle(document.querySelector(`#chip-power [data-power='${kind}'] .power-mark`));
      if (home) homes[`power:${kind}`] = home;
    }
    this.stage.prizeHomes = homes;
  }

  showHearts(hearts = this.mission?.hearts) {
    const { mission } = this;
    if (!mission) return;
    const box = byId('chip-hearts');
    const most = mission.level.hearts;
    if (box.children.length !== most) {
      box.innerHTML = HEART.repeat(most);
    }
    [...box.children].forEach((heart, index) => heart.classList.toggle('is-gone', index >= hearts));
  }

  /* ---------- every frame ---------- */

  update(dt, snapshot) {
    const { stage, mission, session } = this;
    const hand = readHand(snapshot);
    stage.showSights = true;
    // Names of new things wait until "Go!" has gone.
    stage.playing = session.playSeconds > NAMES_AFTER_SECONDS;
    stage.aspect = session.camera.aspect;
    const target = stage.steer(dt, snapshot);
    mission.update(dt, { hand, target });
    // The game may have just finished.
    if (session.screen !== 'playing') return;
    if (this.homesWanted) {
      this.homesWanted = false;
      this.showHaul();
      this.showPower();
      this.measureTop();
    }
    stage.update(dt, hand);
    if (hand === 'closed' && !this.wasShielding) session.sound.shieldUp();
    this.wasShielding = hand === 'closed';
    this.closedFor = hand === 'open' || hand === 'none' ? 0 : this.closedFor + dt;
    if (hand === 'closed' && this.closedFor > GOT_IT_CLOSED_SECONDS) this.gotIt.closed = true;
    this.firedAgo += dt;
    this.starsFor = Math.max(0, this.starsFor - dt);
    this.showPower();
    // The second row of chips can change height with the window, so the story box keeps checking.
    this.measureIn = (this.measureIn ?? 0) - dt;
    if (this.measureIn <= 0) {
      this.measureIn = 0.5;
      this.measureTop();
    }
    this.showShield(hand === 'closed');
    session.sound.setRide({ moving: mission.phase === 'moving', byWater: BY_THE_WATER.has(mission.place?.id) });
    if (this.storyFor > 0) {
      this.storyFor -= dt;
      if (this.storyFor <= 0) this.story.hide();
    }
    this.updateFilm();
  }

  /** Here a closed hand is doing something useful, so the meter says so: see style.css. */
  showShield(up) {
    const wanted = up ? 'up' : 'down';
    if (document.body.dataset.shield !== wanted) document.body.dataset.shield = wanted;
  }

  /** The film stays up until the child has fired and closed, and comes back if they've stopped firing. */
  updateFilm() {
    const { session, gotIt, mission } = this;
    const learning = !(gotIt.fired && gotIt.closed) && session.playSeconds < FILM_AT_MOST_SECONDS;
    const stuck = this.firedAgo > FILM_AGAIN_AFTER_SECONDS && mission.phase === 'fighting' && !mission.resting;
    const filming = learning || stuck;
    if (filming !== this.filming) {
      this.filming = filming;
      document.body.dataset.film = filming ? 'on' : 'off';
    }
  }

  idle(dt, snapshot) {
    if (this.filming) {
      this.filming = false;
      document.body.dataset.film = 'off';
    }
    const { stage, mission, session } = this;
    stage.playing = false;
    if (this.preview || session.screen === 'countdown') mission.warmUp(dt);
    const counting = session.screen === 'countdown';
    this.showShield(counting && readHand(snapshot) === 'closed');
    stage.aspect = session.camera.aspect;
    if (counting) stage.steer(dt, snapshot);
    stage.showSights = counting;
    stage.update(dt, counting ? readHand(snapshot) : 'none');
  }

  render() {
    this.stage.render();
  }

  /** A prompt is read as long as it's up, and spoken only for the first few times. asks is 'open' if it asks for that. */
  once(key, text, asks) {
    const said = this.spokenTimes.get(key) ?? 0;
    if (this.lastPromptKey !== key) {
      this.lastPromptKey = key;
      this.spokenTimes.set(key, said + 1);
    }
    return { key, text, side: null, silent: said >= SPOKEN_AT_MOST, asks };
  }

  prompt(snapshot, dt) {
    const { session, mission } = this;
    const needed = session.handsPrompt(snapshot, dt);
    if (needed && !needed.key.startsWith('closed')) {
      this.lastPromptKey = null;
      return needed;
    }
    const hand = readHand(snapshot);
    const fighting = mission.phase === 'fighting';
    if (fighting && mission.resting && hand === 'closed') return this.once('resting', SPOKEN.resting);
    if (hand === 'open' && mission.blaster.empty && mission.leftHere > 0) return this.once('reload', CLOSE_TO_RELOAD);
    if (fighting && hand !== 'closed' && !mission.guarded && mission.gooClose > SHIELD_PROMPT_CLOSE && !this.blockedOne()) return this.once('shield', CLOSE_FOR_SHIELD);
    if (fighting && hand === 'closed' && !mission.goo.length && this.closedFor > CLOSED_PROMPT_SECONDS) return this.once('fire', OPEN_TO_FIRE, 'open');
    // The words of what's just been said, for as long as it takes to find the first star.
    if (this.starsFor > 0) return { key: 'stars', text: GOLD_STARS, side: null, silent: true };
    this.lastPromptKey = null;
    return null;
  }

  /** Once the child has stopped a few with the shield, they don't need telling any more. */
  blockedOne() {
    return this.mission.stats.gooBlocked >= 2;
  }

  finished() {
    const { sound } = this.session;
    sound.stopRide();
    this.story.hide();
    this.stage.showSights = false;
    this.stage.update(0, 'none');
  }

  /** The big number on the card: friends freed, or robots dropped by someone who didn't quite get there. */
  heroCount() {
    const { stats } = this.mission;
    return this.ended === SO_CLOSE ? stats.robots : stats.friends;
  }

  summary() {
    const { stats, plan } = this.mission;
    const { hands } = this.session.settings;
    const onHand = (value, other = 0) => ({ left: hands === 'left' ? value : other, right: hands === 'right' ? value : other });
    // What was picked up, from level 2: bolts always, and the rest once there's one.
    const haul = Object.values(PRIZES).filter(({ stat }) => stat === 'bolts' || stats[stat] > 0).map(({ mark, stat }) => `${mark} ${stats[stat]}`).join('  ');
    byId('sum-left-prizes').closest('tr').hidden = !plan.bolts;
    // Running out of hearts, which only Medium and Tough allow, means trying the same level again.
    const won = this.ended !== SO_CLOSE;
    return { hero: this.heroCount(), noun: 'rescue', rows: { robots: onHand(stats.robots), friends: onHand(stats.friends), prizes: onHand(plan.bolts ? haul : '', '') }, won };
  }
}

const choice = (name, value, label) => `<label><input type="radio" name="${name}" value="${value}"> ${label}</label>`;

new GameSession({
  // What the open and closed hand do here, for the hand shapes in the grown-ups' panel: see core/shapes.js.
  moves: { open: 'Fire', closed: 'Shield' },
  shell: {
    title: 'Robot Rescue',
    startLabel: 'Ride to the rescue',
    againLabel: 'Go again',
    finishTitle: FINISH,
    heroMark: '🎉',
    heroNoun: 'friends freed',
    extraRows: [{ id: 'robots', label: 'Robots dropped' }, { id: 'friends', label: 'Friends freed' }, { id: 'prizes', label: 'Prizes' }],
    hudTop: `
      <div class="hud-top">
        <div class="chips">
          <div class="chip"><span class="chip-label">Friends</span><span id="chip-friends" class="chip-value">0 of 5</span></div>
          <div class="chip"><span class="chip-label">Robots</span><span id="chip-robots" class="chip-value">0</span></div>
          <div class="chip chip-hearts"><span class="chip-label">Hearts</span><span id="chip-hearts" class="chip-value"></span></div>
        </div>
        <div class="race-progress" aria-hidden="true"><div id="race-progress-fill" class="race-progress-fill"></div></div>
        <div class="chips chips-more">
          <div id="chip-haul" class="chip chip-haul" hidden><span class="chip-label">Prizes</span><span class="chip-value">${Object.entries(PRIZES).map(([kind, { mark }]) => `<span class="haul" data-haul="${kind}" ${kind === 'bolt' ? '' : 'hidden'}><span aria-hidden="true">${mark}</span><span class="haul-count">0</span></span>`).join('')}</span></div>
          <div id="chip-power" class="chip chip-power" hidden><span class="chip-label">Power-up</span><span class="chip-value"></span></div>
        </div>
      </div>
      ${STORY_BOX}
      <div class="film" aria-hidden="true">
        <svg viewBox="0 0 220 220">
          <rect class="film-sky" width="220" height="220" />
          <g transform="translate(150 66)">
            <g class="film-robot">
              <rect class="film-robot-body" x="-24" y="-22" width="48" height="46" rx="8" />
              <rect class="film-robot-body" x="-16" y="-44" width="32" height="24" rx="7" />
              <circle class="film-robot-face" cx="-7" cy="-33" r="6" />
              <circle class="film-robot-face" cx="7" cy="-33" r="6" />
              <circle class="film-robot-eye" cx="-7" cy="-32" r="2.500" />
              <circle class="film-robot-eye" cx="7" cy="-32" r="2.500" />
              <rect class="film-robot-face" x="-13" y="-10" width="26" height="16" rx="3" />
            </g>
            <g class="film-bits">
              <circle cx="-20" cy="-14" r="6" />
              <path d="M18-24l4 8 9 1-6 6 1 9-8-4-8 4 1-9-6-6 9-1z" />
              <circle cx="14" cy="14" r="5" />
              <circle cx="-14" cy="16" r="4" />
            </g>
            <g class="film-shots"><circle r="6" /><circle r="6" /><circle r="6" /></g>
            <g class="film-crosshair">
              <circle r="27" />
              <path d="M0-34v14M0 20v14M-34 0h14M20 0h14" />
            </g>
          </g>
          <g transform="translate(112 100)">
            <circle class="film-goo" r="17" />
          </g>
          <g class="film-shield">
            <circle class="film-shield-glass" cx="112" cy="118" r="58" />
            <path class="film-shield-star" d="M112 96l6 14 15 1-11 10 3 15-13-8-13 8 3-15-11-10 15-1z" />
          </g>
          <g class="film-hand">
            <g class="film-hand-shape">
              <rect x="28" y="168" width="44" height="36" rx="15" />
              <path d="M34 172V148" />
              <path d="M45 168V138" />
              <path d="M57 168V136" />
              <path d="M67 172V144" />
              <path class="film-thumb" d="M72 192L90 178" />
            </g>
          </g>
        </svg>
      </div>`,
    panelSettings: `
      <fieldset class="choice">
        <legend>How fast it all goes</legend>
        ${choice('pace', 'slow', 'Slow')}
        ${choice('pace', 'medium', 'Medium')}
        ${choice('pace', 'fast', 'Fast')}
      </fieldset>
      <fieldset class="choice">
        <legend>Reach help (the crosshair is pulled onto a robot near it)</legend>
        ${choice('reach', 'none', 'A little')}
        ${choice('reach', 'little', 'More')}
        ${choice('reach', 'lots', 'A lot')}
      </fieldset>
      <fieldset class="choice">
        <legend>Reloading (closing the hand fills the blaster)</legend>
        ${choice('reloading', 'on', 'On')}
        ${choice('reloading', 'off', 'Off: it never runs out, for a child who can’t close their hand easily')}
      </fieldset>
      <fieldset class="choice">
        <legend>How hard the robots’ goo comes</legend>
        ${choice('rescueGoo', 'gentle', 'Gentle: the goo is slow, hearts stop at one, and it can’t be lost')}
        ${choice('rescueGoo', 'medium', 'Medium: the goo can win, and stops the tram when the hearts run out')}
        ${choice('rescueGoo', 'tough', 'Tough: fewer hearts, and the goo comes thick and fast')}
      </fieldset>
      <fieldset class="choice">
        <legend>Stops on the way</legend>
        ${choice('stops', '3', 'Three')}
        ${choice('stops', '5', 'All five')}
      </fieldset>`,
  },
  defaults: { pace: 'slow', reach: 'little', reloading: 'on', rescueGoo: 'medium', stops: 5 },
  choices: { pace: String, reach: String, reloading: String, rescueGoo: String, stops: Number },
  // These go on to a game that's being played at once. The rest, and the level, start it again: see core/settings.js.
  atOnce: ['pace', 'reach', 'reloading'],
  tagline: (side) => `Robots have caught your friends! Ride the tram through town. Open your ${side} hand to fire, and close it for your shield.`,
  finishLine: FINISH,
  lines: new URL('./audio/voice/lines.json', import.meta.url),
  portraits: () => renderPortraits(ROSTER),
  createSound: (options) => new RescueSound(options),
  createGame: (session) => new RescueGame(session),
}).start();
