// Giraffe's Long Walk Home: Giraffe is lost, and hungry at every stop on the way back to his family. The
// child closes a hand on fruit, carries it to his mouth and opens to feed him. The story is in
// journey.js, and the land he walks through is in walk.js.
import { MoveDemo } from '../../core/body/demo.js';
import { renderPortraits } from '../../core/body/portraits.js';
import { ROSTER, byId as characterById } from '../../core/body/roster.js';
import { GameSession } from '../../core/session.js';
import { Sound } from '../../core/sound.js';
import { STORY_BOX, StoryBox } from '../../core/story.js';
import { Journey, STOPS, newAt } from './journey.js';
import { Walk } from './walk.js';

const CLOSE_ON_IT = 'Close your hand on the fruit!';
const OPEN_FOR_GIRAFFE = 'Bring it to the giraffe, and open your hand!';
// For the broken bridge, from level 7. These are shown but not said, as they have no voice.
const ON_THE_PLANK = ['Close your hand on the plank!', 'მოკუმე ხელი ფიცარზე!'];
const TO_THE_BRIDGE = ['Bring it to the bridge, and open your hand!', 'ხიდთან მიიტანე და ხელი გაშალე!'];
const HOME = 'The giraffe is home!';
// When the sun goes down first. The card's words are only shown, and the voice says a line it already has.
const DARK_TITLE = 'The sun went down!';
const DARK_SAID = 'So close! Try again!'; // One of the lines every game has: see SO_CLOSE in core/sound.js.

const LAST_WORDS_SECONDS = 2.4;
const HINT_AFTER_SECONDS = 4;
const FILM_SECONDS = 16;
const MOUTH_HOLD_MS = 2200;
const MOUTH_FORWARD = 0.09; // Where his mouth is from the middle of his head, in screen heights.
const MOUTH_DOWN = 0.03;

const byId = (id) => document.getElementById(id);

class WalkGame {
  chimeOnOpen = false;

  constructor(session) {
    this.session = session;
    this.story = new StoryBox(session);
    this.journey = null;
    this.timer = 0;
    this.after = null;
    this.idleFor = 0;
    this.eatingUntil = 0;
    this.walk = new Walk({ backdrop: byId('backdrop'), canvas: byId('game') }, {
      onPick: () => {
        this.idleFor = 0;
        session.sound.play('tick', { gain: 0.5 });
      },
      onFed: (side, eaten) => this.onFed(eaten),
      onDropped: () => this.journey?.dropped(),
      onWalked: () => this.journey.nextStop(),
      // From the higher levels: see walkAt in journey.js.
      canTakeTwo: () => this.journey.wanted >= 2,
      onBasket: () => session.sound.handsOpen(),
      onBridge: () => {
        this.idleFor = 0;
        session.sound.handsOpen();
        this.journey.fixBridge();
      },
      onThawed: () => session.sound.handsOpen(),
      onGift: (kind) => {
        session.sound.star();
        this.journey.gift(kind);
      },
      onGiftOut: (gift) => {
        if (gift.kind === 'flower') this.walk.introduce('butterflies', () => (this.walk.gifts.includes(gift) ? gift : null));
      },
      onMonkeyComes: (monkey) => this.walk.introduce('monkey', () => (this.walk.monkey === monkey ? monkey : null)),
      onButterflyComes: (flier) => this.walk.introduce('butterflies', () => (this.walk.butterfly === flier && !flier.leaving ? { x: flier.fruit.x, y: flier.fruit.y - flier.fruit.r } : null)),
      onParrot: (parrot) => {
        session.sound.handsOpen();
        this.walk.introduce('parrot', () => (this.walk.parrot === parrot ? parrot : null));
      },
    });
    // When the sun goes down first, a line on the finish card saying what happened.
    document.querySelector('#screen-finish .finish-hero')?.insertAdjacentHTML('beforebegin', '<p id="finish-story" class="finish-story" hidden></p>');
    this.daylightShown = null;
    this.giraffe = new MoveDemo(byId('giraffe-stage'));
    this.giraffe.setCharacter(characterById('giraffe'));
    this.applySettings();
    const game = this;
    this.debug = {
      walk: this.walk,
      giraffe: this.giraffe,
      get journey() {
        return game.journey;
      },
    };
  }

  applySettings() {
    const { hands, reach, language } = this.session.settings;
    this.walk.side = hands;
    this.walk.reach = reach;
    // The names of new things are in the language the voice speaks, even if it changes mid-walk.
    this.walk.language = language;
    document.body.dataset.side = hands;
  }

  setHands() {
    this.applySettings();
    this.giraffeDoes('giraffeWaits');
  }

  settingChanged() {
    this.applySettings();
  }

  /** He faces the tree, on the side of the hand being played with. */
  giraffeDoes(name) {
    this.giraffe.show(name, this.session.settings.hands);
  }

  /** What's new at a level, for the title card and the countdown: see NEW_AT in journey.js. */
  newAt(level) {
    return newAt(level);
  }

  /** A new walk home, at this level: see walkAt in journey.js for what each level brings. */
  prepare(level) {
    this.applySettings();
    this.story.hide();
    this.walk.fruit = [];
    this.walk.fed = { left: 0, right: 0 };
    this.walk.arriveAt(STOPS[0].place);
    this.walk.setLevel(level);
    // The sun goes down unless a grown-up chose Gentle, where it stays light, as the walk always was.
    const daylight = this.session.settings.daylight !== 'gentle';
    this.journey = new Journey({ level, daylight, onEvent: (event) => this.onJourney(event) });
    this.atTree = false;
    this.lost = false;
    this.session.finishLine = HOME;
    byId('chip-sun-box').hidden = !daylight;
    // Gifts only come from level 2, so level 1 looks as it always did.
    const gifts = this.journey.level.golden > 0;
    byId('chip-gifts-box').hidden = !gifts;
    byId('sum-left-gifts').closest('tr').hidden = !gifts;
    this.giraffeDoes('giraffeWaits');
    this.showProgress();
  }


  /**
   * Where collected things fly to: the count at the top. It's looked up as they fly, as the count is still
   * hidden when play begins and can move if the screen changes, keeping the last place it was seen.
   */
  keepTallyMeasured(chip, target) {
    let seen = target.tallyAt ?? { x: 80, y: 40 };
    const look = () => {
      const box = chip.getBoundingClientRect();
      if (box.width > 0) seen = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      return seen;
    };
    target.tallyAt = {
      get x() {
        return look().x;
      },
      get y() {
        return look().y;
      },
    };
  }

  begin() {
    this.keepTallyMeasured(byId('chip-gifts'), this.walk);
    this.journey.nextStop();
  }

  later(seconds, what) {
    this.timer = seconds;
    this.after = what;
  }

  onJourney(event) {
    const handlers = {
      stop: () => this.onStop(event),
      fed: () => this.showProgress(),
      gift: () => this.showProgress(),
      'stop-done': () => this.onStopDone(event),
      home: () => this.session.finish(),
      dark: () => this.onDark(),
    };
    handlers[event.type]?.();
  }

  onStop({ stop, features }) {
    const { walk } = this;
    this.atTree = true;
    walk.arriveAt(stop.place);
    this.giraffeDoes('giraffeWaits');
    this.story.say(stop.who, stop.hello);
    this.idleFor = 0;
    walk.hangFruit(stop.fruit, stop.count, features);
    this.introduceStop();
    this.showProgress();
  }

  /** Names for what's new on this tree, the first time each comes. */
  introduceStop() {
    const { walk } = this;
    const fruit = (test) => walk.fruit.find(test);
    // Each name is beside its thing while it's still on this tree, and never on the next one's.
    const onTree = (thing, still = () => true) => () => ((walk.fruit.includes(thing) || walk.items.includes(thing)) && thing.state === 'hanging' && still() ? thing : null);
    const golden = fruit(({ golden: shiny }) => shiny);
    if (golden) walk.introduce('golden', onTree(golden));
    if (walk.level.sway > 0) {
      const swaying = fruit(({ ripe, golden: shiny }) => ripe && !shiny) ?? walk.fruit[0];
      walk.introduce('wind', onTree(swaying));
    }
    const green = fruit(({ ripe }) => !ripe);
    if (green) walk.introduce('green', onTree(green, () => !green.ripe));
    const frosty = fruit(({ frost }) => frost);
    if (frosty) walk.introduce('frost', onTree(frosty, () => frosty.frost));
    for (const item of walk.items) walk.introduce({ basket: 'basket', plank: 'bridge', feather: 'parrot' }[item.kind], onTree(item));
    if (walk.flies.length) walk.introduce('fireflies', () => walk.flies.find(({ caught }) => !caught) ?? null);
  }

  /** Fruit eaten: one, or two from the basket, or one the parrot brought. */
  onFed({ count = 1, golden = 0 } = {}) {
    const { sound } = this.session;
    sound.play('crunch', { gain: 0.8, rate: 0.95 + Math.random() * 0.12 });
    this.idleFor = 0;
    this.eatingUntil = performance.now() + MOUTH_HOLD_MS;
    this.giraffeDoes('munch');
    this.journey.feed(count, { golden });
  }

  /**
   * The sun went down before Giraffe got home: the walk ends there, kindly, and that level comes round again.
   * His family come to find him, so nobody is left out in the dark.
   */
  onDark() {
    const { session } = this;
    this.lost = true;
    this.atTree = false;
    session.finishLine = DARK_SAID;
    session.finish();
    session.hud.confetti.stop();
    const again = document.querySelector('#screen-finish .finish-actions .big-button');
    if (again) again.textContent = 'Try again';
  }

  /** Off to the next tree straight away, except at the very end, where there's a thank-you. */
  onStopDone({ stop }) {
    this.atTree = false;
    this.walk.fruit = [];
    const next = this.journey.stops[this.journey.index + 1];
    if (!next) {
      // He's home: a butterfly on the tree flies off, and gifts still waiting, like a coconut the monkey
      // has just thrown down, are kept.
      this.walk.leaveTree();
      this.walk.keepWaitingGifts();
      this.story.say(stop.who, stop.done);
      this.later(LAST_WORDS_SECONDS, () => this.journey.nextStop());
      return;
    }
    this.giraffeDoes('walk');
    this.walk.walkTo(next.place, this.journey.level.walkSeconds);
  }

  showProgress() {
    const { journey } = this;
    const share = journey.progress;
    const { length } = journey.stops;
    byId('chip-stops').textContent = `${Math.max(1, Math.min(length, journey.index + 1))} of ${length}`;
    byId('race-progress-fill').style.width = `${Math.round(share * 100)}%`;
    byId('map-giraffe').style.left = `${Math.round(share * 1000) / 10}%`;
    byId('chip-gifts').textContent = `🎁 ${journey.gifts}`;
    this.showDaylight();
  }

  /** The sun sinking towards the hills, as a bar that empties. */
  showDaylight() {
    const share = this.journey.daylightShare;
    const shown = Math.round(share * 100);
    if (shown === this.daylightShown) return;
    this.daylightShown = shown;
    byId('sun-fill').style.width = `${shown}%`;
    byId('chip-sun-box').dataset.low = share < 0.25 ? 'yes' : 'no';
  }

  update(dt, snapshot) {
    if (this.after) {
      this.timer -= dt;
      if (this.timer <= 0) {
        const what = this.after;
        this.after = null;
        what();
      }
    }
    this.giraffe.update(dt);
    const head = this.giraffe.headOnPage();
    if (head) {
      // His mouth is at the front of his head, and he's facing the tree.
      const way = this.session.settings.hands === 'right' ? 1 : -1;
      this.walk.setMouth(head.x + way * window.innerHeight * MOUTH_FORWARD, head.y + window.innerHeight * MOUTH_DOWN);
    }
    this.walk.update(dt, snapshot, { aspect: this.session.camera.aspect, playing: true, showHands: true });
    // The sun only goes down while Giraffe waits at a tree and the camera can see the hand: not while he walks,
    // and not for a child who's out of the picture.
    const hand = snapshot?.[this.session.settings.hands];
    const seen = Boolean(hand) && hand.status !== 'missing' && hand.reason !== 'edge' && hand.reason !== 'small';
    if (this.atTree && seen && this.walk.walking === 0) this.journey.passTime(dt);
    if (this.session.screen !== 'playing') return;
    this.showDaylight();
    if (this.eatingUntil && performance.now() > this.eatingUntil) {
      this.eatingUntil = 0;
      if (this.walk.walking === 0 && this.walk.fruit.length) this.giraffeDoes('giraffeWaits');
    }
    this.idleFor += dt;
    const filming = this.session.playSeconds < FILM_SECONDS && this.journey.stats.fed === 0;
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
    this.giraffe.update(dt);
    const counting = this.session.screen === 'countdown';
    this.walk.update(dt, snapshot, { aspect: this.session.camera.aspect, showHands: counting });
  }

  render() {
    this.walk.render();
  }

  prompt(snapshot, dt) {
    const { session, walk, journey } = this;
    const needed = session.handsPrompt(snapshot, dt);
    // Closing the hand is part of this game, so it isn't asked to open unless it's time to.
    if (needed && !needed.key.startsWith('closed')) return needed;
    const shown = (key, [en, ka], asks) => ({ key, text: session.settings.language === 'ka' ? ka : en, side: null, silent: true, asks });
    // The plank goes in the gap in the bridge, not to Giraffe.
    if (walk.holding?.kind === 'plank') return shown('to-the-bridge', TO_THE_BRIDGE, 'open');
    const stopped = this.idleFor > HINT_AFTER_SECONDS;
    // Just after taking the basket or the feather, the hand opens before it picks a fruit, so if it
    // stays closed for a while, it's asked to open.
    if (walk.picking.spent) return stopped ? needed : null;
    // He's had enough here, and it's the bridge that's still to mend, so it's the plank, not more fruit.
    if (journey.wanted === 0 && !journey.bridgeFixed) return stopped ? shown('on-the-plank', ON_THE_PLANK) : null;
    // Once they've got the idea, these only come back if they seem to have stopped.
    if (walk.holding && (journey.stats.fed === 0 || stopped)) return { key: 'bring', text: OPEN_FOR_GIRAFFE, side: null, asks: 'open' };
    if (!walk.holding && stopped && walk.fruit.some(({ state }) => state === 'hanging')) return { key: 'close-on-it', text: CLOSE_ON_IT, side: null };
    return null;
  }

  finished() {
    this.story.hide();
    this.giraffe.hide();
    this.walk.labels = [];
  }

  summary() {
    const { gifts } = this.journey;
    const { hands } = this.session.settings;
    // The fruit the child's own hand fed Giraffe, with each hand and in all, so the big number and the rows
    // agree. The parrot's fruit isn't the child's, and fruit fed after he'd had enough still counts.
    const { fed } = this.walk;
    document.querySelector('#screen-finish h2').textContent = this.lost ? DARK_TITLE : HOME;
    const story = byId('finish-story');
    story.textContent = this.lost ? 'It got dark before Giraffe got home, so his family came to find him with a lantern.' : '';
    story.hidden = !this.lost;
    // When the sun went down first, that level comes round again.
    return { hero: fed.left + fed.right, noun: 'walk', won: !this.lost, rows: { fed, gifts: { left: hands === 'left' ? gifts : 0, right: hands === 'right' ? gifts : 0 } } };
  }
}

new GameSession({
  // What the open and closed hand do here, for the hand shapes in the grown-ups' panel: see core/shapes.js.
  moves: { open: 'Let go', closed: 'Pick and hold' },
  shell: {
    title: 'Giraffe’s Long Walk Home',
    startLabel: 'Help Giraffe',
    againLabel: 'Walk again',
    finishTitle: HOME,
    heroMark: '🍎',
    heroNoun: 'fruit fed to Giraffe',
    extraRows: [{ id: 'fed', label: 'Fruit fed' }, { id: 'gifts', label: 'Gifts for home' }],
    hudTop: `
      <div class="hud-top">
        <div class="chips">
          <div class="chip"><span class="chip-label">Stop</span><span id="chip-stops" class="chip-value">1 of 5</span></div>
          <div id="chip-gifts-box" class="chip" hidden><span class="chip-label">Gifts</span><span id="chip-gifts" class="chip-value">🎁 0</span></div>
          <div id="chip-sun-box" class="chip chip-sun" hidden><span class="chip-label">☀️ Home before dark</span><span class="sun-bar"><span id="sun-fill" class="sun-fill"></span></span></div>
        </div>
      </div>
      <div class="map" aria-hidden="true">
        <div class="race-progress"><div id="race-progress-fill" class="race-progress-fill"></div></div>
        <span id="map-giraffe" class="map-giraffe">🦒</span>
        <span class="map-home">🏠</span>
      </div>
      ${STORY_BOX}
      <div class="film" aria-hidden="true">
        <svg viewBox="0 0 220 220">
          <circle class="film-mouth" cx="44" cy="100" r="26" />
          <path class="film-smile" d="M28 100q16 18 32 0" />
          <circle class="film-fruit" cx="170" cy="60" r="20" />
          <g class="film-hand">
            <rect x="150" y="96" width="46" height="42" rx="16" />
            <path class="film-finger" d="M156 102V74" />
            <path class="film-finger" d="M167 98V64" />
            <path class="film-finger" d="M179 98V62" />
            <path class="film-finger" d="M190 102V70" />
          </g>
        </svg>
      </div>`,
    panelSettings: `
      <fieldset class="choice">
        <legend>The sun going down</legend>
        <label><input type="radio" name="daylight" value="sets"> It sets: Giraffe has to be home before dark, or the walk is over</label>
        <label><input type="radio" name="daylight" value="gentle"> Gentle: it stays light, with no hurry, as before</label>
      </fieldset>
      <fieldset class="choice">
        <legend>How far to reach (how close the tree is to Giraffe)</legend>
        <label><input type="radio" name="reach" value="none"> Far</label>
        <label><input type="radio" name="reach" value="little"> Medium</label>
        <label><input type="radio" name="reach" value="lots"> Close</label>
      </fieldset>`,
  },
  defaults: { reach: 'little', daylight: 'sets' },
  choices: { reach: String, daylight: String },
  // These go on to a game that's being played at once. The rest, and the level, start it again: see core/settings.js.
  atOnce: ['reach'],
  tagline: (side) => `Giraffe is lost! Pick fruit with your ${side} hand, carry it to him, and open your hand to feed him, all the way home.`,
  finishLine: HOME,
  lines: new URL('./audio/voice/lines.json', import.meta.url),
  portraits: () => renderPortraits(ROSTER),
  createSound: (options) => new Sound({ ...options, sounds: { crunch: new URL('./audio/crunch.ogg', import.meta.url) } }),
  createGame: (session) => new WalkGame(session),
}).start();
