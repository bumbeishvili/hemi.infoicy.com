// Giraffe's World Tour: Giraffe flies round the globe in a little plane, and at each stop the child finds the
// country, colours in its flag and raises it. An open hand held over a country chooses it, an open hand is the
// brush, and an open hand lifted up raises the flag: a closed hand does none of these. From level 5 the other hand
// holds the flag while it's painted. It practises opening the hand and keeping it open, reaching across and up,
// and the two hands doing different jobs. The rules are in tour.js, the flags in flags.js, the map in world.json,
// and view.js draws it.
import { renderPortraits } from '../../core/body/portraits.js';
import { byId as characterWithId, ROSTER } from '../../core/body/roster.js';
import { Glove } from '../../core/glove.js';
import { GameSession, SPOKEN } from '../../core/session.js';
import { Sound } from '../../core/sound.js';
import { STORY_BOX, StoryBox } from '../../core/story.js';
import { giraffePixels, renderGiraffe } from '../giraffe-garden/giraffe.js';
import { FLAGS } from './flags.js';
import { Globe } from './globe.js';
import { newAt, TOUR, Tour } from './tour.js';
import { OTHER_GLOVE, TourView } from './view.js';
import { SAY, thisIs, whereIs } from './words.js';

const byId = (id) => document.getElementById(id);
const FINISH = SAY.finish[0];
const OUT_OF_FUEL = 'Out of fuel!'; // On the card when the journey is lost. It's only shown, not said.
// Reach help: the middle of the camera picture covers the whole screen, so a smaller movement goes further.
const REACH = { none: 1, little: 1.25, lots: 1.6 };
// How far down the camera picture the middle of the hand can be with the whole of an open hand still in it, as
// shares of its height: its fingers reach up a good way, so not near the top, and its wrist may go off the bottom.
const HAND_BAND = { top: 0.24, bottom: 0.9 };
// What core/glove.js spreads over the field it's given: the camera picture from a tenth of the way down, 0.78 of
// its height and 0.8 of its width.
const GLOVE_VIEW = { top: 0.1, high: 0.78, wide: 0.8 };
const FILM_SECONDS = 25; // A little film of what to do shows until it's been done once, or this long.
const STORY_SECONDS = 4.5; // The country's name stays up this long into the painting.
const CLOSED_PROMPT_AFTER = 2.5; // Seconds of a closed hand before asking for it to open.
const RESTING_AFTER = 15; // And before saying that resting is fine.
const FIND_HINT_AFTER = 7; // Seconds of looking with the hand over no country, before saying how to choose one.
const DIP_HINT_AFTER = 3.5; // Seconds at the board with no paint on the hand.
const HINT_PROMPT_AFTER = 1.5; // Seconds a part has been showing which pot it wants, before the words say so too.
const RAISE_HINT_AFTER = 1.2;
const WON_SECONDS = 2.8; // The plane flies round over the flags for this long before the finish card.
const LOST_SECONDS = 2.2; // And comes down with no fuel for this long.
const PROPELLER = { waiting: 0.045, flying: 0.12 };
const BRUSH_LEVEL = 0.5;
const WIND_LEVEL = 0.3;

class TourGame {
  chimeOnOpen = false; // The hand opens and closes all the time here, so a chime would be noise.

  constructor(session, world) {
    this.session = session;
    this.places = Object.fromEntries(world.countries.map((country) => [country.id, country.at]));
    this.view = new TourView(byId('game'), {
      globe: new Globe(world.countries),
      flags: FLAGS,
      language: () => session.settings.language,
      side: () => session.settings.hands,
    });
    try {
      // Drawn as big as he'll be shown on this screen, even full screen, so he's sharp.
      const tallest = Math.max(window.innerHeight, window.screen?.height || 0);
      this.view.giraffe = renderGiraffe(characterWithId('giraffe'), giraffePixels(tallest * 0.2, this.view.ratio));
    } catch (error) {
      // Without his picture the game still works: the plane just flies with nobody looking out of it.
      console.warn('Could not draw Giraffe:', error);
    }
    // Where a stamp goes when it's won: to the chip that counts them.
    this.view.stampsAt = () => {
      const box = byId('chip-stamps-box')?.getBoundingClientRect();
      return box && box.width ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null;
    };
    this.story = new StoryBox(session);
    this.gloves = { play: new Glove('right'), other: new Glove('left') };
    this.gloveOffset = { x: 0, y: 0 };
    this.hover = null;
    this.resetCounts();
    this.newTour(session.level);
    const game = this;
    this.debug = {
      view: this.view,
      gloves: this.gloves,
      get tour() {
        return game.tour;
      },
      get game() {
        return game;
      },
    };
  }

  resetCounts() {
    this.closedFor = 0;
    this.restFor = 0;
    this.findFor = 0;
    this.paintFor = 0;
    this.hintFor = 0;
    this.raiseFor = 0;
    this.highFor = 0;
    this.storyFor = 0;
    this.askIn = null;
    this.endIn = null;
    this.brushLevel = 0;
    this.fresh = false;
    this.filmKind = null;
    this.did = { find: false, paint: false, raise: false };
  }

  /* ---------- the grown-ups' choices ---------- */

  get settings() {
    return this.session.settings;
  }

  holdName() {
    return ['later', 'always', 'never'].includes(this.settings.tourHold) ? this.settings.tourHold : 'later';
  }

  newTour(level) {
    this.tour = new Tour({
      level,
      flags: FLAGS,
      places: this.places,
      gentle: this.settings.tourFuel === 'gentle',
      hold: this.holdName(),
      onEvent: (event) => this.onTour(event),
    });
    this.view.setTour(this.tour);
    this.view.parkPlane();
    this.hover = null;
    // A flag that's held is held with the other hand, so both are drawn on the camera's picture.
    this.session.hud.bothHands = this.tour.rules.holding;
    this.showChips();
  }

  newAt(level) {
    return newAt(level, { hold: this.holdName() });
  }

  setHands() {
    for (const glove of Object.values(this.gloves)) glove.hide();
  }

  settingChanged(change) {
    // How the tour is played starts with the next journey, and the title shows it now. One that's being flown, or
    // has just ended, stays as it is: in the middle of one, the session starts it again.
    const { screen } = this.session;
    if (!['playing', 'countdown', 'finish'].includes(screen) && ('tourFuel' in change || 'tourHold' in change)) this.newTour(this.session.levels.current);
    if ('language' in change && this.story.who) this.story.hide();
  }

  /* ---------- a new journey ---------- */

  prepare(level) {
    this.resetCounts();
    this.newTour(level);
    this.story.hide();
    this.session.sound.lost = false;
    const { rules } = this.tour;
    byId('sum-left-stamps').closest('tr').hidden = !rules.stamps;
    byId('sum-left-gusts').closest('tr').hidden = !rules.wind;
    byId('sum-left-cans').closest('tr').hidden = !rules.can;
  }

  begin() {
    const { sound } = this.session;
    sound.startLoop('propeller', PROPELLER.waiting);
    sound.startLoop('brush', 0);
    sound.startLoop('wind', 0);
    this.tour.begin();
  }

  nameOf(id) {
    return FLAGS[id].name;
  }

  /** What the rules say happens, heard and seen. */
  onTour(event) {
    const { sound } = this.session;
    const { view, tour } = this;
    view.on(event);
    switch (event.type) {
      case 'ask':
        this.story.say('giraffe', whereIs(this.nameOf(event.target)));
        this.findFor = 0;
        this.storyFor = 0;
        this.askIn = null;
        this.showChips();
        break;
      case 'right':
        sound.star();
        this.did.find = true;
        break;
      case 'wrong':
        sound.play('boing', { gain: 0.35 });
        // The country that was chosen is named, and then the question is asked again.
        this.story.say('giraffe', thisIs(this.nameOf(event.country)));
        this.askIn = TOUR.wrongRest;
        break;
      case 'fuel':
        sound.play('splutter', { gain: 0.4 });
        this.showChips();
        break;
      case 'lost':
        sound.lost = true;
        this.endIn = LOST_SECONDS;
        this.story.hide();
        break;
      case 'can':
        sound.star();
        view.sparkle(view.can.x, view.can.y);
        this.showChips();
        break;
      case 'landed':
        this.story.say('giraffe', thisIs(this.nameOf(event.country)));
        break;
      case 'easel':
        this.storyFor = STORY_SECONDS;
        this.paintFor = 0;
        break;
      case 'dip':
        sound.play('dip', { gain: 0.5, rate: 0.9 + Math.random() * 0.3 });
        break;
      case 'roller':
        sound.play('dip', { gain: 0.5, rate: 0.7 });
        break;
      case 'stroke':
        this.fresh = true;
        break;
      case 'part':
        sound.play('part', { gain: 0.4 });
        this.did.paint = true;
        break;
      case 'gust':
        sound.play('flap', { gain: event.held ? 0.35 : 0.55 });
        break;
      case 'painted':
        this.raiseFor = 0;
        this.highFor = 0;
        sound.star();
        break;
      case 'grip':
        sound.play('creak', { gain: 0.3 });
        this.did.raise = true;
        break;
      case 'raised':
        sound.play('cheer', { gain: 0.22 });
        sound.play('sparkle', { gain: 0.3 });
        this.story.hide();
        this.showChips();
        break;
      case 'stamp':
        sound.play('stamp', { gain: 0.4, after: 0.35 });
        this.showChips();
        break;
      case 'won':
        this.endIn = WON_SECONDS;
        this.story.hide();
        break;
      default:
    }
    if (tour.state === 'fly') sound.setLoopLevel('propeller', PROPELLER.flying);
  }

  /** The chips along the top: the fuel that's left, the flags raised, and the stamps. */
  showChips() {
    const { tour } = this;
    if (!tour || !byId('chip-fuel')) return;
    const cans = byId('chip-fuel');
    if (tour.counted) {
      const full = tour.rules.cans;
      if (cans.children.length !== full) cans.innerHTML = Array.from({ length: full }, () => '<span class="tour-can"></span>').join('');
      [...cans.children].forEach((can, index) => can.classList.toggle('is-empty', index >= tour.cans));
      cans.setAttribute('aria-label', `${tour.cans} of ${full}`);
    } else {
      cans.textContent = '∞';
      cans.removeAttribute('aria-label');
    }
    cans.dataset.cans = String(tour.cans);
    byId('chip-flags').textContent = `${tour.flown.length} of ${tour.stops.length}`;
    byId('chip-stamps-box').hidden = !tour.rules.stamps;
    byId('chip-stamps').textContent = String(tour.stats.stamps);
  }

  /* ---------- the hands ---------- */

  /**
   * The gloves follow the hands, with the middle of the camera picture spread over the whole screen: how much of
   * the picture that is, is the grown-ups' choice, so that a smaller movement goes further.
   */
  followHands(dt, snapshot) {
    const { desk, palmSize } = this.view;
    const gain = REACH[this.settings.tourReach] ?? REACH.little;
    const aspect = this.session.camera.aspect;
    const middle = (HAND_BAND.top + HAND_BAND.bottom) / 2;
    const half = (HAND_BAND.bottom - HAND_BAND.top) / 2 / gain;
    // The glove is placed on a field that the middle of the camera picture fills: see GLOVE_VIEW.
    const height = (desk.height * GLOVE_VIEW.high) / (half * 2);
    const width = Math.max(height * aspect * (GLOVE_VIEW.wide / GLOVE_VIEW.high), desk.width * gain * 1.1);
    this.gloveOffset = { x: desk.left + desk.width / 2 - width / 2, y: desk.top - ((middle - half - GLOVE_VIEW.top) / GLOVE_VIEW.high) * height };
    const field = { aspect, palmSize, width, height };
    this.gloves.play.follow(snapshot[snapshot.side], dt, field);
    // The other hand is only looked for where it has a job: holding the flag.
    if (this.tour.rules.holding && this.tour.state === 'paint') this.gloves.other.follow(snapshot.other, dt, field);
    else this.gloves.other.hide();
  }

  /** Where a glove is on the screen, or null when it can't be seen. */
  gloveOnScreen(which = 'play') {
    const glove = this.gloves[which];
    return glove.visible ? { x: glove.x + this.gloveOffset.x, y: glove.y + this.gloveOffset.y } : null;
  }

  update(dt, snapshot) {
    const { view, tour, session } = this;
    this.followHands(dt, snapshot);
    const at = this.gloveOnScreen('play');
    const other = this.gloveOnScreen('other');
    // A hand that's missing or unsure is never open: it fails closed.
    const open = Boolean(at && snapshot.handOpen === true);
    const input = { seen: Boolean(at), open };
    const state = tour.state;
    this.hover = state === 'find' && at ? view.countryAt(at.x, at.y) : null;
    if (state === 'find') input.over = this.hover;
    else if (state === 'fly') input.onCan = Boolean(at && tour.can && view.onCan(at.x, at.y));
    else if (state === 'paint') {
      input.brush = at ? view.toFlag(at.x, at.y) : null;
      input.pot = at ? view.potAt(at.x, at.y) : null;
      input.holding = Boolean(other && view.onHold(other.x, other.y));
    } else if (state === 'raise') input.lift = at ? view.liftOf(at.y) : 0;
    this.fresh = false;
    tour.update(dt, input);
    view.update(dt);

    // The brush on the flag sounds while it lays paint, the wind as it comes, and the engine all the while.
    const { sound } = session;
    const laying = this.fresh ? 1 : 0;
    this.brushLevel += (laying - this.brushLevel) * (1 - Math.exp(-dt * (laying ? 14 : 6)));
    sound.setLoopLevel('brush', this.brushLevel * BRUSH_LEVEL);
    sound.setLoopLevel('wind', Math.max(tour.gustShare ?? 0, view.gustFor) * WIND_LEVEL);
    const quiet = ['paint', 'raise', 'lost'].includes(tour.state);
    sound.setLoopLevel('propeller', quiet ? 0 : tour.state === 'fly' ? PROPELLER.flying : PROPELLER.waiting);

    // What the words go by: how long the hand has been closed, or at something without getting on.
    this.closedFor = at && !open ? this.closedFor + dt : 0;
    this.restFor = open ? 0 : this.restFor + dt;
    this.findFor = tour.state === 'find' && !this.hover ? this.findFor + dt : 0;
    this.paintFor = tour.state === 'paint' && !tour.paint ? this.paintFor + dt : 0;
    this.hintFor = tour.state === 'paint' && tour.hint?.paint ? this.hintFor + dt : 0;
    this.raiseFor = tour.state === 'raise' ? this.raiseFor + dt : 0;
    this.highFor = tour.state === 'raise' && !tour.gripped && open && input.lift > TOUR.raiseFrom ? this.highFor + dt : 0;
    if (this.storyFor > 0) {
      this.storyFor -= dt;
      if (this.storyFor <= 0) this.story.hide();
    }
    // After a wrong country has been named, the question again.
    if (this.askIn !== null) {
      this.askIn -= dt;
      if (this.askIn <= 0) {
        this.askIn = null;
        if (tour.state === 'find') this.story.say('giraffe', whereIs(this.nameOf(tour.target)));
      }
    }
    this.showFilm();
    if (this.endIn !== null) {
      this.endIn -= dt;
      if (this.endIn <= 0 && session.screen === 'playing') this.end();
    }
  }

  /** The journey is over. One that ran out of fuel is told kindly, with Try again on the big button. */
  end() {
    const { session, tour } = this;
    this.endIn = null;
    session.finish();
    // After the card is filled in, which puts back the usual title.
    document.querySelector('#screen-finish h2').textContent = tour.state === 'lost' ? OUT_OF_FUEL : FINISH;
  }

  idle(dt, snapshot) {
    const { screen } = this.session;
    if (this.filmKind) {
      this.filmKind = null;
      document.body.dataset.film = 'off';
    }
    // During the countdown the glove comes out, so the child can find their hand.
    if (screen === 'countdown') this.followHands(dt, snapshot);
    else for (const glove of Object.values(this.gloves)) glove.hide();
    // Behind the title card is the level's own journey: a grown-up may just have chosen another level.
    if (screen === 'welcome' && this.tour.levelNumber !== this.session.levels.current) this.newTour(this.session.levels.current);
    this.view.update(dt);
  }

  /** The little film of what to do: for each of the three things, until it's been done once, or a while. */
  showFilm() {
    const { tour, did } = this;
    let kind = null;
    if (this.session.playSeconds < FILM_SECONDS * 3) {
      if (tour.state === 'find' && !did.find && this.findFor < FILM_SECONDS) kind = 'find';
      else if (tour.state === 'paint' && !did.paint) kind = 'paint';
      else if (tour.state === 'raise' && !did.raise) kind = 'raise';
    }
    if (kind === this.filmKind) return;
    this.filmKind = kind;
    document.body.dataset.film = kind ? 'on' : 'off';
    if (kind) document.body.dataset.filmKind = kind;
  }

  render() {
    const { view, tour } = this;
    const playing = this.session.screen === 'playing';
    const gloves = [];
    const other = this.gloveOnScreen('other');
    if (other) gloves.push({ glove: this.gloves.other, x: other.x, y: other.y, look: OTHER_GLOVE });
    const at = this.gloveOnScreen('play');
    if (at) {
      const painting = playing && tour.state === 'paint';
      gloves.push({
        glove: this.gloves.play,
        x: at.x,
        y: at.y,
        colour: painting && tour.paint ? tour.flag.colours[tour.paint] : null,
        reach: painting && tour.paint ? (tour.rollerOn ? TOUR.roller : TOUR.brush) : 0,
        down: painting && this.brushLevel > 0.1,
      });
    }
    view.render({ gloves, hover: this.hover });
  }

  /* ---------- the end ---------- */

  prompt(snapshot, dt) {
    const { session, tour } = this;
    const needed = session.handsPrompt(snapshot, dt);
    const { state } = tour;
    if (state === 'won' || state === 'lost') return null;
    if (needed && !needed.key.startsWith('closed')) return needed;
    const ask = (key, open = false) => ({ key, text: SAY[key][0], side: null, ...(open ? { asks: 'open' } : {}) });
    const closed = this.closedFor > CLOSED_PROMPT_AFTER;
    if (state === 'find') {
      // Nothing is lost by resting here: the question waits. After a while, it's said that's fine.
      if (this.restFor > RESTING_AFTER) return { key: 'resting', text: SPOKEN.resting, side: null };
      if (closed) return ask('openToChoose', true);
      if (this.findFor > FIND_HINT_AFTER) return ask('findHint', true);
      return null;
    }
    if (state === 'paint') {
      const coming = (tour.gustShare ?? 0) > 0;
      if (tour.rules.holding && !tour.held && (coming || tour.hint?.hold)) return ask('holdHint');
      if (!tour.rules.holding && coming) return ask('gustHint', true);
      if (!tour.rules.wind && this.restFor > RESTING_AFTER) return { key: 'resting', text: SPOKEN.resting, side: null };
      if (closed) return ask('openToPaint', true);
      if (this.paintFor > DIP_HINT_AFTER) return ask('dipFirst', true);
      // A part with the wrong paint on it is showing which pot it wants: the words say so too. Not to a child
      // who's painting from memory, whose flag is shown again instead.
      if (this.hintFor > HINT_PROMPT_AFTER && (tour.rules.memory === null || tour.shown)) return ask('dipHint');
      return null;
    }
    if (state === 'raise' && this.raiseFor > RAISE_HINT_AFTER) return this.highFor > 1 ? ask('lowHint') : ask('raiseHint', true);
    return null;
  }

  finished() {
    const { sound } = this.session;
    for (const loop of ['propeller', 'brush', 'wind']) sound.stopLoop(loop);
    this.story.hide();
    this.askIn = null;
    this.endIn = null;
    for (const glove of Object.values(this.gloves)) glove.hide();
  }

  summary() {
    const { stats } = this.tour;
    const hand = this.settings.hands;
    const row = (value) => ({ left: hand === 'left' ? value : '', right: hand === 'right' ? value : '' });
    return {
      hero: stats.stops,
      noun: 'journey',
      rows: { parts: row(stats.parts), wrong: row(stats.wrong), stamps: row(stats.stamps), gusts: row(stats.held), cans: row(stats.cans) },
      // A journey that ran out of fuel comes round again at the same level.
      won: this.tour.state === 'won',
    };
  }
}

/**
 * The game's sounds. A journey that ran out of fuel ends softly: a sparkle in place of the fanfare, and the voice
 * says what it says after any game that was lost.
 */
class TourSound extends Sound {
  lost = false;

  finish(line, options) {
    if (this.lost) this.play('sparkle', { gain: 0.3 });
    super.finish(line, options);
  }
}

const choice = (name, value, label) => `<label><input type="radio" name="${name}" value="${value}"> ${label}</label>`;

new GameSession({
  // What the open and closed hand do here, for the hand shapes in the grown-ups' panel: see core/shapes.js.
  moves: { open: 'Choose, paint and lift', closed: null },
  shell: {
    title: 'Giraffe’s World Tour',
    startLabel: 'Start the tour',
    againLabel: 'Fly again',
    finishTitle: FINISH,
    heroMark: '🌍',
    heroNoun: 'flags raised',
    extraRows: [
      { id: 'parts', label: 'Parts painted' },
      { id: 'wrong', label: 'Wrong countries' },
      { id: 'stamps', label: 'Stamps' },
      { id: 'gusts', label: 'Gusts held off' },
      { id: 'cans', label: 'Fuel cans caught' },
    ],
    hudTop: `
      <div class="tour-hud">
        <div class="chip chip-fuel"><span class="chip-label">Fuel</span><span id="chip-fuel" class="chip-value tour-cans"></span></div>
        <div class="chip chip-flags"><span class="chip-label">Flags</span><span id="chip-flags" class="chip-value">0 of 3</span></div>
        <div id="chip-stamps-box" class="chip chip-stamps" hidden><span class="chip-label">Stamps</span><span id="chip-stamps" class="chip-value">0</span></div>
      </div>
      ${STORY_BOX}
      <div class="film tour-film" aria-hidden="true">
        <svg class="film-find" viewBox="0 0 220 170">
          <circle class="film-sea" cx="110" cy="92" r="72" />
          <path class="film-land film-land-a" d="M70 62q14-12 30-4t10 22q-8 14-26 10t-14-28z" />
          <path class="film-land film-land-b" d="M118 58q16-8 30 2t4 26q-12 10-28 2t-6-30z" />
          <path class="film-land film-land-c" d="M88 104q18-8 36 0t8 26q-16 12-38 4t-6-30z" />
          <circle class="film-ring-back" cx="134" cy="72" r="20" />
          <circle class="film-ring" cx="134" cy="72" r="20" />
          <g class="film-hand film-hand-find">
            <rect x="-13" y="-8" width="26" height="22" rx="8" />
            <path class="film-finger" d="M-8 -6V-22M-2 -8V-26M4 -8V-26M10 -6V-20M13 6L22 -2" />
          </g>
        </svg>
        <svg class="film-paint" viewBox="0 0 220 170">
          <rect class="film-flag" x="30" y="14" width="160" height="96" rx="3" />
          <path class="film-stripe-line" d="M30 62H190" />
          <path class="film-row film-row-1" d="M46 38H174" />
          <g class="film-pot film-pot-a"><rect x="62" y="134" width="34" height="28" rx="7" /><ellipse cx="79" cy="134" rx="18" ry="7" /></g>
          <g class="film-pot film-pot-b"><rect x="124" y="134" width="34" height="28" rx="7" /><ellipse cx="141" cy="134" rx="18" ry="7" /></g>
          <g class="film-hand film-hand-paint">
            <rect x="-13" y="-8" width="26" height="22" rx="8" />
            <path class="film-finger" d="M-8 -6V-22M-2 -8V-26M4 -8V-26M10 -6V-20M13 6L22 -2" />
            <circle class="film-blob" cx="0" cy="3" r="6" />
          </g>
        </svg>
        <svg class="film-raise" viewBox="0 0 220 170">
          <path class="film-pole" d="M96 160V16" />
          <circle class="film-ball" cx="96" cy="14" r="6" />
          <g class="film-flying">
            <rect class="film-top" x="100" y="0" width="64" height="20" />
            <rect class="film-bottom" x="100" y="20" width="64" height="20" />
          </g>
          <path class="film-way" d="M56 140V40" />
          <path class="film-arrow" d="M56 26l-10 16h20z" />
          <g class="film-hand film-hand-raise">
            <rect x="-13" y="-8" width="26" height="22" rx="8" />
            <path class="film-finger" d="M-8 -6V-22M-2 -8V-26M4 -8V-26M10 -6V-20M13 6L22 -2" />
          </g>
        </svg>
      </div>`,
    panelSettings: `
      <fieldset class="choice">
        <legend>The plane’s fuel</legend>
        ${choice('tourFuel', 'counted', 'It can run out: a wrong country costs a can, and so does a gust that finds the flag let go')}
        ${choice('tourFuel', 'gentle', 'Gentle: there’s always fuel, take all the time you need')}
      </fieldset>
      <fieldset class="choice">
        <legend>Holding the flag with the other hand while it’s painted</legend>
        ${choice('tourHold', 'later', 'From level 5')}
        ${choice('tourHold', 'always', 'From the first level')}
        ${choice('tourHold', 'never', 'Never: one hand does it all')}
      </fieldset>
      <fieldset class="choice">
        <legend>Reach help (a smaller movement goes further across the screen)</legend>
        ${choice('tourReach', 'none', 'None')}
        ${choice('tourReach', 'little', 'A little')}
        ${choice('tourReach', 'lots', 'A lot')}
      </fieldset>`,
  },
  defaults: { tourFuel: 'counted', tourHold: 'later', tourReach: 'little' },
  choices: { tourFuel: String, tourHold: String, tourReach: String },
  // This goes on to a journey that's being flown at once. The rest, and the level, start it again: see core/settings.js.
  atOnce: ['tourReach'],
  // The spot where the flag is held is on the other hand's side, so changing hands starts the journey again.
  startsAgain: ['hands'],
  tagline: (side) => `Giraffe is flying round the world! Hold your open ${side} hand over each country to fly there, then paint its flag and raise it.`,
  finishLine: FINISH,
  lines: new URL('./audio/voice/lines.json', import.meta.url),
  portraits: () => renderPortraits(ROSTER),
  createSound: (options) => new TourSound({
    ...options,
    sounds: {
      propeller: new URL('../sky-wings/audio/propeller.ogg', import.meta.url),
      brush: new URL('../lighthouse/audio/wipe.ogg', import.meta.url),
      wind: new URL('../cannon-bay/audio/wind.ogg', import.meta.url),
      flap: new URL('../cannon-bay/audio/canvas.ogg', import.meta.url),
      creak: new URL('../cannon-bay/audio/creak.ogg', import.meta.url),
      dip: new URL('../robot-rescue/audio/goo-pop.ogg', import.meta.url),
      part: new URL('../spider-catcher/audio/home.ogg', import.meta.url),
      sparkle: new URL('../mighty-moves/audio/sparkle.ogg', import.meta.url),
      cheer: new URL('../mighty-moves/audio/cheer.ogg', import.meta.url),
      boing: new URL('../robot-rescue/audio/boing.ogg', import.meta.url),
      splutter: new URL('../tank-patrol/audio/splutter.ogg', import.meta.url),
      stamp: new URL('../robot-rescue/audio/unlock.ogg', import.meta.url),
    },
  }),
  createGame: async (session) => new TourGame(session, await (await fetch(new URL('./world.json', import.meta.url))).json()),
}).start();
