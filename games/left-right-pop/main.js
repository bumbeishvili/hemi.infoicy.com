// Left, Right, Pop!: coloured circles come up all over the screen, and the game asks for one of them, with one hand.
// The card at the top shows the colour, big, with its name, and which hand, and the voice says the hand: "Open your
// left hand to pop it!". An open hand pops a circle, but only the colour asked for, with the hand asked for. Both
// hands play, so telling left from right is half of it, and using the hand that's asked for, the weaker one too, is
// the other half. The rules are in rules.js, and view.js draws them.
//
// The voice doesn't say the colour: every line is a recording, and there are none of colour names yet. So the colour
// is shown, on the card and, if a grown-up chooses, written on each circle.
import { Glove } from '../../core/glove.js';
import { GameSession, SPOKEN } from '../../core/session.js';
import { Sound } from '../../core/sound.js';
import { CLOCKS, COLOURS, GOAL_CHOICES, HAND_MODES, PopRules, popNewAt, REACH_NAMES } from './rules.js';
import { PopView } from './view.js';

const byId = (id) => document.getElementById(id);

// Every line said here has a rendered voice file: see core/audio/voice/lines.json.
const OPEN_TO_POP = {
  left: 'Open your left hand to pop it!',
  right: 'Open your right hand to pop it!',
};
const PRAISE = ['Great job!', 'Nice one!', 'Way to go!'];
const FINISH = 'You popped them all!';
// On the card when too many circles faded away. It's only shown, not said: the voice says what it says after any
// game that was lost.
const LOST = 'The circles faded away!';
const HAND_WORDS = {
  left: { en: 'Left hand', ka: 'მარცხენა ხელი' },
  right: { en: 'Right hand', ka: 'მარჯვენა ხელი' },
};

const PRAISE_EVERY = 4; // Pops between one word of praise and the next.
const SAY_AGAIN_AFTER = 8; // A circle that's still waiting has its hand said once more, after this long.
const WRONG_SAID_EVERY = 3; // The other hand on a circle says the hand again, at most this often.
const CLOSER_AFTER = 4; // Seconds of the hand asked for not being seen before asking for it closer.
const RESTING_AFTER = 15; // In the gentle game, seconds of no open hand before saying resting is fine.
const FILM_SECONDS = 20; // The little film of what to do shows until the first pop, or this long.
const BIRDS_LEVEL = 0.08;

/** A little open hand, drawn as the meters draw theirs: the thumb on the right is the hand on the left of the screen. */
function handIcon(side) {
  const flip = side === 'right' ? ' transform="translate(120 0) scale(-1 1)"' : '';
  const box = side === 'right' ? '20 20 66 76' : '34 20 66 76';
  return `<svg class="pop-hand-icon" viewBox="${box}" aria-hidden="true"><g${flip}>
      <path class="pop-hand-ink" d="M44 62V36M53.5 58V30M63 58V27M72.5 62V31M75 78L92 64" />
      <rect x="39" y="58" width="38" height="33" rx="13" />
      <path class="pop-hand-finger" d="M44 62V36M53.5 58V30M63 58V27M72.5 62V31M75 78L92 64" />
    </g></svg>`;
}

const askSlot = (side) => `
  <div class="pop-ask-slot" data-hand="${side}" hidden>
    <span class="pop-ask-disc">
      <svg class="pop-ask-clock" viewBox="0 0 100 100" aria-hidden="true">
        <circle class="pop-clock-track" cx="50" cy="50" r="45" />
        <circle class="pop-clock-fill" cx="50" cy="50" r="45" pathLength="100" transform="rotate(-90 50 50)" />
      </svg>
      <span class="pop-ask-dot"></span>
    </span>
    <span class="pop-ask-words">
      <span class="pop-ask-colour"></span>
      <span class="pop-ask-hand">${handIcon(side)}<span class="pop-ask-hand-word"></span></span>
    </span>
  </div>`;

class PopGame {
  chimeOnOpen = false; // Hands open and close all the time here, so a chime would be noise.
  bothHands = true; // Both hands are drawn on the camera's picture, as both are played with.

  constructor(session) {
    this.session = session;
    this.view = new PopView(byId('game'), { language: () => session.settings.language });
    this.gloves = { left: new Glove('left'), right: new Glove('right') };
    this.rules = this.newRules(session.level);
    this.card = byId('pop-ask');
    this.slots = Object.fromEntries(['left', 'right'].map((side) => [side, this.card.querySelector(`[data-hand="${side}"]`)]));
    this.shownAsk = '';
    // The finish card lists the prizes won, if there were any.
    byId('finish-hero')?.closest('.finish-hero')?.insertAdjacentHTML('afterend', '<p id="finish-prizes" class="finish-prizes" hidden></p>');
    this.resetCounts();
    const game = this;
    this.debug = {
      view: this.view,
      gloves: this.gloves,
      get rules() {
        return game.rules;
      },
      get game() {
        return game;
      },
    };
  }

  get settings() {
    return this.session.settings;
  }

  newRules(level) {
    const { popGoal, popReach, popClock, popHands, hands } = this.settings;
    return new PopRules({
      level,
      goal: GOAL_CHOICES.includes(Number(popGoal)) ? Number(popGoal) : 12,
      reach: REACH_NAMES.includes(popReach) ? popReach : 'middle',
      clock: CLOCKS.includes(popClock) ? popClock : 'clock',
      hands: HAND_MODES.includes(popHands) ? popHands : 'even',
      side: hands,
      aspect: this.view.aspect,
      onEvent: (event) => this.onRules(event),
    });
  }

  resetCounts() {
    this.missingFor = { left: 0, right: 0 };
    this.restFor = 0;
    this.sayAgainIn = Infinity;
    this.wrongSaidAt = -Infinity;
    this.praised = 0;
    this.filmShown = false;
  }

  newAt(level) {
    return popNewAt(level);
  }

  /** The hand in play is the one asked for more often, or only, if a grown-up chose that. It goes on at once. */
  setHands(side) {
    this.rules.setSide(side);
  }

  settingChanged(change) {
    if ('popReach' in change) this.rules.setReach(this.settings.popReach);
    // How many to pop, the clock and which hand is asked for start the next game, and the title shows it now.
    const { screen } = this.session;
    const between = screen !== 'playing' && screen !== 'countdown';
    if (between && ('popGoal' in change || 'popClock' in change || 'popHands' in change)) this.rules = this.newRules(this.session.level);
    if ('language' in change) {
      this.shownAsk = '';
      this.showAsk();
    }
    this.showProgress();
  }

  /* ---------- a new game ---------- */

  prepare(level) {
    this.rules = this.newRules(level);
    this.view.reset();
    this.resetCounts();
    this.shownAsk = '';
    this.showAsk();
    this.showProgress();
    byId('finish-prizes').hidden = true;
  }

  begin() {
    this.rules.begin();
    this.session.sound.startLoop('birds', BIRDS_LEVEL);
  }

  /** The line that asks for a hand: in the hand shape's own words, for the hand in play, if a grown-up chose one. */
  lineFor(hand) {
    const { shapes, monitor } = this.session;
    return hand === monitor.side && shapes?.open?.prompt ? shapes.open.prompt : OPEN_TO_POP[hand];
  }

  /** What the rules say happens, heard and seen. */
  onRules(event) {
    const { sound } = this.session;
    const { view } = this;
    switch (event.type) {
      case 'ask':
        // Each hand asked for is said once now, the left hand's first when it's both, and once more later if it's
        // still waiting.
        for (const ask of event.asks) sound.say(this.lineFor(ask.hand));
        this.sayAgainIn = SAY_AGAIN_AFTER;
        this.showAsk();
        break;
      case 'pop':
        view.burst(event.circle.x, event.circle.y, event.circle.colour, event.circle.r);
        // Never quite the same twice.
        sound.play('pop', { gain: 0.5, rate: 0.88 + Math.random() * 0.3 });
        break;
      case 'split':
        view.burst(event.circle.x, event.circle.y, event.circle.colour, event.circle.r);
        sound.play('pop', { gain: 0.45, rate: 0.75 });
        break;
      case 'popped':
        this.praised += 1;
        if (this.praised % PRAISE_EVERY === 0 && this.rules.phase === 'play') sound.say(PRAISE[(this.praised / PRAISE_EVERY - 1) % PRAISE.length], { ifQuiet: true });
        this.showAsk();
        this.showProgress();
        break;
      case 'star':
        view.prize(event.at.x, event.at.y, '⭐');
        sound.star();
        this.showProgress();
        break;
      case 'gem':
        view.prize(event.at.x, event.at.y, '💎');
        sound.star();
        this.showProgress();
        break;
      case 'wrong-hand':
        sound.play('boing', { gain: 0.3 });
        if (this.rules.time - this.wrongSaidAt > WRONG_SAID_EVERY) {
          this.wrongSaidAt = this.rules.time;
          sound.say(this.lineFor(event.ask.hand), { ifQuiet: true });
        }
        break;
      case 'bump':
        sound.play('boing', { gain: 0.14, rate: 1.5 });
        break;
      case 'faded':
        sound.play('whoosh', { gain: 0.3, rate: 0.8 });
        this.showAsk();
        this.showProgress();
        break;
      case 'swap':
        sound.play('whoosh', { gain: 0.14, rate: 1.3 });
        break;
      case 'rainbow':
        sound.play('sparkle', { gain: 0.3 });
        break;
      case 'won':
        sound.play('sparkle', { gain: 0.35 });
        this.showAsk();
        break;
      case 'lost':
        this.showAsk();
        break;
      default:
    }
  }

  /* ---------- each frame ---------- */

  /** The hand on this side, as the snapshot has it: the hand in play, or the other one. */
  viewOf(snapshot, side) {
    if (side === snapshot.side) return snapshot[side];
    return snapshot.other?.side === side ? snapshot.other : null;
  }

  /** Whether the hand on this side is open: the hand in play by its own measure, and the other by the usual one. */
  isOpen(snapshot, side) {
    if (side === snapshot.side) return snapshot.handOpen;
    return snapshot.other?.side === side && snapshot.other.status === 'open' && !snapshot.overlap;
  }

  followHands(dt, snapshot) {
    const { view, session } = this;
    for (const [side, glove] of Object.entries(this.gloves)) {
      const hand = this.viewOf(snapshot, side);
      if (!hand) {
        glove.hide();
        continue;
      }
      glove.follow(hand, dt, { aspect: session.camera.aspect, palmSize: view.palmSize, width: view.width, height: view.height });
      if (glove.visible) glove.status = this.isOpen(snapshot, side) ? 'open' : 'closed';
    }
  }

  /** Each glove as the rules want it. */
  gloveFor(side) {
    const glove = this.gloves[side];
    const { width, height, palmSize } = this.view;
    return {
      visible: glove.visible,
      open: glove.visible && glove.status === 'open',
      x: glove.x / width,
      y: glove.y / height,
      reach: (x, y) => glove.reachTo(x * width, y * height, palmSize) / height,
    };
  }

  update(dt, snapshot) {
    const { rules, session } = this;
    this.followHands(dt, snapshot);
    rules.aspect = this.view.aspect;
    rules.update(dt, { gloves: { left: this.gloveFor('left'), right: this.gloveFor('right') } });
    this.view.update(dt);

    // Said once more, if it's still waiting.
    if (rules.turn) {
      this.sayAgainIn -= dt;
      if (this.sayAgainIn <= 0) {
        this.sayAgainIn = Infinity;
        const ask = rules.current;
        if (ask) session.sound.say(this.lineFor(ask.hand), { ifQuiet: true });
      }
    }
    const anyOpen = this.gloves.left.status === 'open' || this.gloves.right.status === 'open';
    this.restFor = anyOpen ? 0 : this.restFor + dt;
    for (const side of ['left', 'right']) this.missingFor[side] = this.gloves[side].visible ? 0 : this.missingFor[side] + dt;
    this.showFilm();
    this.showClock();
    if (rules.done && session.screen === 'playing') this.end();
  }

  /** The game is over. A lost one is told kindly, with no party, and Try again on the big button. */
  end() {
    const { session, rules } = this;
    const lost = rules.phase === 'lost';
    document.querySelector('#screen-finish h2').textContent = lost ? LOST : FINISH;
    session.finish();
  }

  idle(dt, snapshot) {
    if (this.filmShown) {
      this.filmShown = false;
      document.body.dataset.film = 'off';
    }
    // During the countdown the gloves come out, so the child can find both hands.
    if (this.session.screen === 'countdown') this.followHands(dt, snapshot);
    else for (const glove of Object.values(this.gloves)) glove.hide();
    this.rules.aspect = this.view.aspect;
    if (this.rules.phase === 'ready') this.rules.update(dt);
    this.view.update(dt);
  }

  /** The little film of what to do: until the first pop, or a while. */
  showFilm() {
    const wanted = this.rules.stats.pops === 0 && this.session.playSeconds < FILM_SECONDS;
    if (wanted !== this.filmShown) {
      this.filmShown = wanted;
      document.body.dataset.film = wanted ? 'on' : 'off';
    }
  }

  render() {
    this.view.render({ rules: this.rules, gloves: this.gloves, palm: this.view.palmSize, asked: this.rules.asks, names: this.settings.popNames === 'on' });
  }

  /* ---------- the top of the screen ---------- */

  /** The card that shows what's asked for: the colour, big, with its name, and the hand, for each hand asked for. */
  showAsk() {
    const ka = this.settings.language === 'ka';
    const asks = this.rules.phase === 'play' ? this.rules.asks : [];
    const key = `${ka}|${asks.map((ask) => `${ask.id}:${ask.hand}:${ask.colour}`).join(',')}`;
    if (key === this.shownAsk) return;
    this.shownAsk = key;
    this.card.dataset.count = String(asks.length);
    for (const side of ['left', 'right']) {
      const slot = this.slots[side];
      const ask = asks.find((each) => each.hand === side);
      slot.hidden = !ask;
      if (!ask) continue;
      const colour = COLOURS[ask.colour];
      slot.dataset.colour = ask.colour;
      slot.querySelector('.pop-ask-dot').style.background = colour.fill;
      slot.querySelector('.pop-ask-colour').textContent = ka ? colour.nameKa : colour.name;
      slot.querySelector('.pop-ask-hand-word').textContent = HAND_WORDS[side][ka ? 'ka' : 'en'];
    }
  }

  /** The ring round each colour on the card empties as its time runs out. With no clock there's no ring. */
  showClock() {
    const share = this.rules.clockShare;
    this.card.dataset.clock = share === null ? 'off' : 'on';
    if (share === null) return;
    const dash = `${(share * 100).toFixed(1)} 100`;
    for (const slot of Object.values(this.slots)) {
      if (!slot.hidden) slot.querySelector('.pop-clock-fill').style.strokeDasharray = dash;
    }
  }

  showProgress() {
    const { stats, goal, toLose, gentle, plan } = this.rules;
    byId('chip-pops').textContent = `${Math.min(stats.pops, goal)} of ${goal}`;
    byId('chip-faded-box').hidden = gentle;
    if (!gentle) byId('chip-faded').textContent = `${Math.min(stats.faded, toLose)} of ${toLose}`;
    byId('chip-stars-box').hidden = !plan.stars;
    byId('chip-stars').textContent = String(stats.stars);
    byId('chip-gems-box').hidden = !plan.rainbow;
    byId('chip-gems').textContent = String(stats.gems);
  }

  /* ---------- what to tell the child ---------- */

  prompt(snapshot, dt) {
    const { rules, session } = this;
    if (rules.phase !== 'play') return null;
    if (snapshot.overlap) return { key: 'apart', text: 'Keep your hands apart', side: null };
    const ask = rules.current;
    if (!ask) return null;
    const { hand } = ask;
    const view = this.viewOf(snapshot, hand);
    const reason = view && view.status !== 'missing' ? view.reason : 'missing';
    if (reason === 'missing') {
      if (this.missingFor[hand] > CLOSER_AFTER) return { key: 'closer', text: SPOKEN.holdCloser, side: null };
      return { key: `missing-${hand}`, text: `Show your ${hand} hand!`, side: hand };
    }
    if (reason === 'edge') return { key: `edge-${hand}`, text: `Move your ${hand} hand into the picture`, side: hand };
    if (reason === 'small') return { key: 'small', text: 'Come a little closer', side: null };
    // In the gentle game the hands can rest whenever they like: the circle just waits. After a while, it's said
    // that's fine. With the clock, it isn't said, as the circle won't wait.
    if (rules.gentle && this.restFor > RESTING_AFTER) return { key: 'resting', text: SPOKEN.resting, side: null };
    // What's asked for, shown with an arrow to the hand. It's said when it's asked for, and once more, above.
    const inPlay = hand === snapshot.side;
    return { key: `ask-${ask.id}`, text: OPEN_TO_POP[hand], side: hand, silent: true, ...(inPlay ? { asks: 'open' } : {}) };
  }

  finished() {
    this.session.sound.stopLoop('birds');
    for (const glove of Object.values(this.gloves)) glove.hide();
    this.shownAsk = '';
    this.card.dataset.count = '0';
    for (const slot of Object.values(this.slots)) slot.hidden = true;
  }

  summary() {
    const { stats } = this.rules;
    const average = (side) => (stats.popped[side] ? `${(stats.seconds[side] / stats.popped[side]).toFixed(1)} s` : '–');
    const each = (make) => ({ left: make('left'), right: make('right') });
    const prizes = [];
    if (stats.stars) prizes.push(`⭐ ${stats.stars} ${stats.stars === 1 ? 'star' : 'stars'}`);
    if (stats.gems) prizes.push(`💎 ${stats.gems} ${stats.gems === 1 ? 'gem' : 'gems'}`);
    const line = byId('finish-prizes');
    line.textContent = prizes.join('   ');
    line.hidden = !prizes.length;
    return {
      hero: stats.pops,
      noun: 'game',
      rows: {
        popped: each((side) => `${stats.popped[side]} of ${stats.asked[side]}`),
        wrong: each((side) => stats.wrong[side]),
        quick: each(average),
      },
      // A game where too many faded away comes round again at the same level. The gentle one can't be lost.
      won: this.rules.phase !== 'lost',
    };
  }
}

const choice = (name, value, label) => `<label><input type="radio" name="${name}" value="${value}"> ${label}</label>`;

new GameSession({
  // What the open and closed hand do here, for the hand shapes in the grown-ups' panel: see core/shapes.js.
  moves: { open: 'Pop', closed: null },
  shell: {
    title: 'Left, Right, Pop!',
    startLabel: 'Start popping',
    againLabel: 'Play again',
    finishTitle: FINISH,
    heroMark: '🔴',
    heroNoun: 'popped',
    extraRows: [{ id: 'popped', label: 'Popped, of the times asked' }, { id: 'wrong', label: 'Tried the other hand’s circle' }, { id: 'quick', label: 'Time to pop, on average' }],
    hudTop: `
      <div class="pop-hud">
        <div class="chip chip-pops"><span class="chip-label">Popped</span><span id="chip-pops" class="chip-value">0 of 12</span></div>
        <div id="chip-faded-box" class="chip chip-faded"><span class="chip-label">Faded away</span><span id="chip-faded" class="chip-value">0 of 6</span></div>
        <div id="chip-stars-box" class="chip chip-stars" hidden><span class="chip-label">Stars</span><span id="chip-stars" class="chip-value">0</span></div>
        <div id="chip-gems-box" class="chip chip-gems" hidden><span class="chip-label">Gems</span><span id="chip-gems" class="chip-value">0</span></div>
      </div>
      <div id="pop-ask" class="pop-ask" data-count="0" data-clock="off">${askSlot('left')}${askSlot('right')}</div>
      <div class="film pop-film" aria-hidden="true">
        <svg viewBox="0 0 220 160">
          <rect class="film-grass" x="0" y="136" width="220" height="24" />
          <g class="film-card">
            <rect x="62" y="8" width="96" height="30" rx="15" />
            <circle class="film-red" cx="80" cy="23" r="10" />
            <text x="96" y="28">Left</text>
          </g>
          <circle class="film-blue" cx="160" cy="84" r="22" />
          <g class="film-pop"><circle class="film-red" cx="64" cy="80" r="22" /></g>
          <g class="film-hand">
            <path class="film-finger-ink" d="M-15 -8V-32M-5 -11V-41M5 -11V-41M15 -8V-32M22 12L40 -4" />
            <rect x="-23" y="-12" width="46" height="40" rx="14" />
            <path class="film-finger" d="M-15 -8V-32M-5 -11V-41M5 -11V-41M15 -8V-32M22 12L40 -4" />
          </g>
        </svg>
      </div>`,
    panelSettings: `
      <fieldset class="choice">
        <legend>Which hand is asked for</legend>
        ${choice('popHands', 'even', 'Both hands, each as often as the other')}
        ${choice('popHands', 'more', 'The hand in play twice as often as the other')}
        ${choice('popHands', 'only', 'Only the hand in play: just the colours')}
      </fieldset>
      <fieldset class="choice">
        <legend>Circles that fade away</legend>
        ${choice('popClock', 'clock', 'They count: each waits so long, and too many fading away ends the game')}
        ${choice('popClock', 'gentle', 'Gentle: each waits for as long as it takes, and nothing is lost')}
      </fieldset>
      <fieldset class="choice">
        <legend>How far the circles come, which is how far to reach</legend>
        ${choice('popReach', 'close', 'Close')}
        ${choice('popReach', 'middle', 'Medium')}
        ${choice('popReach', 'far', 'Far')}
      </fieldset>
      <fieldset class="choice">
        <legend>Circles to pop</legend>
        ${choice('popGoal', '8', '8')}
        ${choice('popGoal', '12', '12')}
        ${choice('popGoal', '16', '16')}
      </fieldset>
      <fieldset class="choice">
        <legend>Colour names on the circles, for a child who finds some colours hard to tell apart, or is learning to read them</legend>
        ${choice('popNames', 'off', 'No names')}
        ${choice('popNames', 'on', 'Each circle has its colour written on it')}
      </fieldset>`,
  },
  defaults: { popHands: 'even', popClock: 'clock', popReach: 'middle', popGoal: 12, popNames: 'off' },
  choices: { popHands: String, popClock: String, popReach: String, popGoal: Number, popNames: String },
  // These go on to a game that's being played at once. The rest, and the level, start it again: see core/settings.js.
  atOnce: ['popReach', 'popNames'],
  tagline: () => 'Circles of every colour! Pop the colour on the card with the hand it shows: left or right, with your hand open.',
  finishLine: FINISH,
  createSound: (options) => new Sound({
    ...options,
    sounds: {
      pop: new URL('../balloon-pop/audio/pop.ogg', import.meta.url),
      boing: new URL('../robot-rescue/audio/boing.ogg', import.meta.url),
      whoosh: new URL('../mighty-moves/audio/whoosh-2.ogg', import.meta.url),
      sparkle: new URL('../mighty-moves/audio/sparkle.ogg', import.meta.url),
      birds: new URL('../tank-patrol/audio/birds.ogg', import.meta.url),
    },
  }),
  createGame: (session) => new PopGame(session),
}).start();
