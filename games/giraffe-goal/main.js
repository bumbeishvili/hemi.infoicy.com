// Giraffe's Goal: the cup final has gone to penalties, and Giraffe's team needs a goalkeeper. The child is in goal.
// A kicker runs up and shoots, a ring shows where the ball is coming, and the child's glove saves it by being
// there, with the hand open and held up like a high five. Opening the hand with the wrist held up, rather than
// dropped, is what's hard with hemiplegia, and core/upright.js says whether it is. The balls go far out to the side
// and across the body on purpose, and the wider the hand spreads, thumb and all, the bigger the glove. The rules are
// in goal.js and the pitch is drawn by view.js.
import { renderPortraits } from '../../core/body/portraits.js';
import { byId as characterWithId, ROSTER } from '../../core/body/roster.js';
import { Glove } from '../../core/glove.js';
import { GameSession, SPOKEN } from '../../core/session.js';
import { Sound } from '../../core/sound.js';
import { STORY_BOX, StoryBox } from '../../core/story.js';
import { TIP_LIMITS, UprightReader } from '../../core/upright.js';
import { giraffePixels, renderGiraffe } from '../giraffe-garden/giraffe.js';
import { BIG, bigFor, Goal, goalNewAt, KICKERS, LOST_SECONDS, PARTY_SECONDS, REACH_NAMES, SAVES_CHOICES, STAKES } from './goal.js';
import { playerPixels, renderPlayers } from './players.js';
import { GIRAFFE, GoalView, KICKER_TALL } from './view.js';

const byId = (id) => document.getElementById(id);
const FINISH = 'We won! What a goalkeeper!';
// On the card when the other team wins a real match. It's only shown, not said.
const LOST = 'The other team won the shoot-out!';
const TRY_AGAIN = 'Try again';
const INTRO = 'It’s penalties! Will you be our goalkeeper?';
const HOLD_UP = 'Hold your hand up, like a high five!';
const OPEN_TO_SAVE = 'Open your hand to save the ball!';
const PRAISE = ['Nice one!', 'Way to go!', 'Great job!'];
const PRAISE_EVERY = 3; // Saves between one word of praise and the next.
const FILM_SECONDS = 25; // The little film of what to do shows until the first save, or this long.
const STORY_SECONDS = 6; // Giraffe's words stay up this long, or until the first save.
const HOLD_UP_AFTER = 2.5; // Seconds of an open hand that isn't held up before saying how.
const CLOSED_PROMPT_AFTER = 2.5; // Seconds of a closed hand before asking for it to open.
const RESTING_AFTER = 15; // And before saying that resting is fine.
const BIRDS_LEVEL = 0.1;
// The glove is drawn as long as the hand looks for its width, down to this share of a hand held flat, so a hand
// tipped right over towards the camera has a short glove, as it looks, and not a great wide one. Tipped less than
// this many degrees it's drawn full length, so a hand that's held up doesn't have a glove that shrinks and grows.
const SHORTEST = 0.45;
const SHORTER_FROM = 25;
// A hand that was ready a moment ago still is, for this long, while it's in the picture: the tracker can lose a
// hand for a frame, and read it as not open for a few after, and that shouldn't cost a save.
const READY_GRACE_MS = 250;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

class GoalGame {
  chimeOnOpen = false; // The hand opens for every save here, and the save has its own sound.

  constructor(session) {
    this.session = session;
    this.view = new GoalView(byId('game'), {
      language: () => session.settings.language,
      prizeTarget: () => {
        const box = byId('chip-stars')?.closest('.chip')?.getBoundingClientRect();
        return box?.width ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : { x: 220, y: 50 };
      },
    });
    try {
      // Drawn as big as he'll be shown on this screen, even full screen, so he's sharp.
      this.view.giraffe = renderGiraffe(characterWithId('giraffe'), giraffePixels(this.tallest * GIRAFFE.tall, this.view.ratio));
    } catch (error) {
      // Without his picture the match still works: Giraffe just isn't by the post.
      console.warn('Could not draw Giraffe:', error);
    }
    this.story = new StoryBox(session);
    this.upright = new UprightReader();
    this.gloves = { left: new Glove('left'), right: new Glove('right') };
    this.goal = this.newGoal(session.level);
    this.drawPlayers();
    this.resetCounts();
    const game = this;
    this.debug = {
      view: this.view,
      gloves: this.gloves,
      upright: this.upright,
      get goal() {
        return game.goal;
      },
      get game() {
        return game;
      },
    };
  }

  /** The tallest this window can be, even full screen, for pictures drawn once to be sharp. */
  get tallest() {
    return Math.max(window.innerHeight, window.screen?.height || 0);
  }

  resetCounts() {
    this.ready = false;
    this.readyAt = -Infinity;
    this.big = 0;
    this.lowFor = 0;
    this.closedFor = 0;
    this.restFor = 0;
    this.praised = 0;
    this.filmShown = false;
    this.storyFor = 0;
  }

  /* ---------- the grown-ups' choices ---------- */

  get settings() {
    return this.session.settings;
  }

  /** How far the hand can be tipped and still save, in degrees, or null when any open hand saves. */
  get limit() {
    const { goalWrist } = this.settings;
    return goalWrist === 'any' ? null : TIP_LIMITS[goalWrist] ?? TIP_LIMITS.little;
  }

  newGoal(level) {
    const { goalSaves, goalReach, goalStakes, hands } = this.settings;
    return new Goal({
      level,
      saves: SAVES_CHOICES.includes(Number(goalSaves)) ? Number(goalSaves) : 10,
      reach: REACH_NAMES.includes(goalReach) ? goalReach : 'middle',
      stakes: STAKES.includes(goalStakes) ? goalStakes : 'match',
      side: hands,
      aspect: window.innerWidth / window.innerHeight,
      onEvent: (event) => this.onGoal(event),
    });
  }

  /** Pictures of the kickers this level has, the first time each is wanted. */
  drawPlayers() {
    const { view, goal } = this;
    const ids = ['plain', ...goal.specials].flatMap((kind) => KICKERS[kind]).filter((id) => !view.players[id]);
    if (!ids.length) return;
    try {
      Object.assign(view.players, renderPlayers(ids.map(characterWithId), playerPixels(this.tallest * KICKER_TALL, view.ratio)));
    } catch (error) {
      // Without their pictures the match still works: the balls come from the spot.
      console.warn('Could not draw the kickers:', error);
    }
  }

  newAt(level) {
    return goalNewAt(level);
  }

  setHands() {
    for (const glove of Object.values(this.gloves)) glove.hide();
    this.restage({ hands: true });
  }

  settingChanged(change) {
    this.restage(change);
  }

  /** A new number of saves, how far to reach or the other hand starts with the next match, and the title shows it now. */
  restage(change) {
    const { screen } = this.session;
    if (screen === 'playing' || screen === 'countdown' || !this.goal) return;
    if ('goalSaves' in change || 'goalReach' in change || 'goalStakes' in change || 'hands' in change) this.goal = this.newGoal(this.session.level);
  }

  /* ---------- a new match ---------- */

  /** The hand check is starting: how the hand looks in it is how it looks held up. */
  enterCheck() {
    this.upright.samples = [];
  }

  /** After a hand check in the middle of a match. */
  resume() {
    this.upright.calibrate();
  }

  prepare(level) {
    this.upright.calibrate();
    this.goal = this.newGoal(level);
    this.drawPlayers();
    this.view.reset();
    this.resetCounts();
    this.story.hide();
    this.session.sound.lost = false;
    this.showProgress();
    // The other team's goals are only counted in a real match.
    byId('chip-goals-box').hidden = !this.goal.real;
    // Stars only come from level 2.
    const { stars } = this.goal.plan;
    byId('chip-stars-box').hidden = !stars;
    byId('sum-left-stars').closest('tr').hidden = !stars;
  }

  begin() {
    this.session.sound.startLoop('birds', BIRDS_LEVEL);
    this.story.say('giraffe', INTRO);
    this.storyFor = STORY_SECONDS;
  }

  /** What the rules say happens, heard and seen. */
  onGoal(event) {
    const { sound } = this.session;
    const { view, goal } = this;
    switch (event.type) {
      case 'kick': {
        const { shot } = event;
        sound.play('kick', { gain: 0.45 });
        // What's new about this ball is named the first time one comes, by its ring.
        view.introduce(shot.kind, () => (goal.shots.includes(shot) && (shot.state === 'flying' || shot.state === 'pushing') ? shot.to : null));
        break;
      }
      case 'save': {
        const at = view.at(event.at.x, event.at.y);
        sound.play('save', { gain: 0.6 });
        view.burst(at.x, at.y, event.shot.kind === 'golden' ? '#ffd23f' : '#ffe066');
        view.cheer();
        this.story.hide();
        if (this.praised % PRAISE_EVERY === 0) sound.say(PRAISE[Math.floor(this.praised / PRAISE_EVERY) % PRAISE.length], { ifQuiet: true });
        this.praised += 1;
        this.showProgress();
        break;
      }
      case 'goal':
        sound.play('in', { gain: 0.22 });
        view.glad();
        this.showProgress();
        break;
      case 'lost':
        // The other team's kickers cheer, and the crowd with them, softly. Nothing flashes.
        sound.play('cheer', { gain: 0.25 });
        view.glad(LOST_SECONDS);
        this.story.hide();
        break;
      case 'star': {
        const { star } = event;
        view.introduce('stars', () => (goal.stars.includes(star) ? { x: star.x, y: star.y } : null));
        break;
      }
      case 'prize':
        view.prize(event.kind, event.at.x, event.at.y, event.count);
        sound.star();
        setTimeout(() => this.showProgress(), 900);
        break;
      case 'thud':
        sound.play('thud', { gain: 0.4 });
        break;
      case 'push':
        sound.handsOpen();
        break;
      case 'bounce':
        sound.play('boing', { gain: 0.3 });
        break;
      case 'pop': {
        const at = view.at(event.at.x, event.at.y);
        sound.play('pop', { gain: 0.4 });
        view.pop(at.x, at.y);
        break;
      }
      case 'hop':
        sound.play('in', { gain: 0.2, rate: 1.4 });
        break;
      case 'cup-out':
        sound.play('sparkle', { gain: 0.3 });
        view.introduce('cup', () => (goal.cup && goal.cup.state !== 'caught' ? { x: goal.cup.x, y: goal.cup.y } : null));
        break;
      case 'cup': {
        const at = view.at(event.cup.x, event.cup.y);
        sound.play('found', { gain: 0.5 });
        view.burst(at.x, at.y, '#ffd23f');
        break;
      }
      case 'won':
        sound.play('cheer', { gain: 0.45 });
        view.party(PARTY_SECONDS);
        this.story.hide();
        this.showProgress();
        break;
      default:
    }
  }

  /* ---------- each frame ---------- */

  /**
   * The glove follows the hand in play. It's bigger the further the thumb is out of the palm, and green only when
   * the hand can save: making the open move, and held up, unless a grown-up chose that any open hand will do.
   */
  followHand(dt, snapshot) {
    const { view, session } = this;
    const hand = snapshot[snapshot.side];
    const now = performance.now();
    const { held, wide, flat, tip } = this.upright.update(hand.image, session.camera.aspect, now, this.limit ?? TIP_LIMITS.little);
    this.big += (bigFor(hand.fingers.thumb, snapshot.handOpen) - this.big) * (1 - Math.exp(-dt * BIG.rate));
    const shorter = tip > SHORTER_FROM && wide ? clamp(flat / wide / Math.cos((SHORTER_FROM * Math.PI) / 180), SHORTEST, 1) : 1;
    this.palm = view.palmSize * (1 + BIG.by * this.big) * shorter;
    for (const [side, glove] of Object.entries(this.gloves)) {
      if (side !== snapshot.side) glove.hide();
      else glove.follow(hand, dt, { aspect: session.camera.aspect, palmSize: this.palm, width: view.width, height: view.height });
    }
    const glove = this.gloves[snapshot.side];
    this.heldUp = held || this.limit === null;
    if (glove.visible && snapshot.handOpen && this.heldUp) this.readyAt = now;
    this.ready = glove.visible && now - this.readyAt < READY_GRACE_MS;
    if (glove.visible) glove.status = this.ready ? 'open' : 'closed';
    return glove;
  }

  update(dt, snapshot) {
    const { view, goal, session } = this;
    const glove = this.followHand(dt, snapshot);
    const { width, height } = view;
    goal.update(dt, {
      glove: {
        visible: glove.visible,
        ready: this.ready,
        x: glove.x / width,
        y: glove.y / height,
        reach: (x, y) => glove.reachTo(x * width, y * height, this.palm) / height,
      },
    });
    if (this.big > 0.6 && this.ready) view.introduce('big', () => (glove.visible && this.big > 0.4 ? { x: glove.x / width, y: glove.y / height } : null));
    view.update(dt);
    // An open hand that isn't held up, a hand that's closed, and a hand that's doing neither, each for how long.
    this.lowFor = glove.visible && snapshot.handOpen && !this.heldUp ? this.lowFor + dt : 0;
    this.closedFor = glove.visible && !snapshot.handOpen ? this.closedFor + dt : 0;
    this.restFor = this.ready ? 0 : this.restFor + dt;
    this.showFilm();
    if (this.storyFor > 0) {
      this.storyFor -= dt;
      if (this.storyFor <= 0) this.story.hide();
    }
    if (goal.done && session.screen === 'playing') this.end();
  }

  /** The match is over. A lost one is told kindly, with no party, and Try again on the big button. */
  end() {
    const { session, goal } = this;
    const lost = goal.lost;
    session.sound.lost = lost;
    document.querySelector('#screen-finish h2').textContent = lost ? LOST : FINISH;
    session.finish();
    if (lost) {
      session.hud.hideSummary();
      byId('play-again').textContent = TRY_AGAIN;
    }
  }

  idle(dt, snapshot) {
    const { screen } = this.session;
    if (this.filmShown) {
      this.filmShown = false;
      document.body.dataset.film = 'off';
    }
    // In the hand check, how the hand looks is how it looks held up.
    if (screen === 'check') this.upright.sample(snapshot[snapshot.side].image, this.session.camera.aspect);
    // During the countdown the glove comes out, so the child can find their hand.
    if (screen === 'countdown') this.followHand(dt, snapshot);
    else for (const glove of Object.values(this.gloves)) glove.hide();
    this.view.update(dt);
  }

  /** The little film of what to do: until the first save, or a while, and again whenever the hand isn't held up. */
  showFilm() {
    const wanted = (this.goal.stats.saves === 0 && this.session.playSeconds < FILM_SECONDS) || this.lowFor > HOLD_UP_AFTER;
    if (wanted !== this.filmShown) {
      this.filmShown = wanted;
      document.body.dataset.film = wanted ? 'on' : 'off';
    }
  }

  render() {
    const side = this.session.settings.hands;
    const { screen } = this.session;
    this.view.render({ goal: this.goal, glove: this.gloves[side], palm: this.palm, big: this.big, side, waving: screen !== 'playing' || this.session.playSeconds < 3 });
  }

  /* ---------- the top of the screen ---------- */

  showProgress() {
    const { stats, target, toLose, real } = this.goal;
    byId('chip-saves').textContent = `${Math.min(stats.saves, target)} of ${target}`;
    if (real) byId('chip-goals').textContent = `${Math.min(stats.goals, toLose)} of ${toLose}`;
    byId('chip-stars').textContent = String(stats.stars);
  }

  /* ---------- the end ---------- */

  prompt(snapshot, dt) {
    const needed = this.session.handsPrompt(snapshot, dt);
    // Once the match is over there's nothing to ask for.
    if (this.goal.phase !== 'play') return null;
    if (needed && !needed.key.startsWith('closed')) return needed;
    // In the gentle match the hand can rest whenever it likes: the kicker just waits. After a while, it's said that's
    // fine. In a real match the kicker doesn't wait, so that isn't said, and a hand taken out of the picture rests.
    if (!this.goal.real && this.restFor > RESTING_AFTER) return { key: 'resting', text: SPOKEN.resting, side: null };
    if (this.lowFor > HOLD_UP_AFTER) return { key: 'hold-up', text: HOLD_UP, side: null };
    if (this.closedFor > CLOSED_PROMPT_AFTER) return { key: 'open-to-save', text: OPEN_TO_SAVE, side: null, asks: 'open' };
    return null;
  }

  finished() {
    this.session.sound.stopLoop('birds');
    this.story.hide();
    for (const glove of Object.values(this.gloves)) glove.hide();
  }

  summary() {
    const { stats } = this.goal;
    const hand = this.session.settings.hands;
    const row = (value) => ({ left: hand === 'left' ? value : '', right: hand === 'right' ? value : '' });
    return {
      hero: stats.saves,
      noun: 'match',
      rows: { saves: row(`${stats.saves} of ${stats.shots}`), across: row(stats.across), held: row(`${Math.round(stats.held)} s`), stars: row(stats.stars) },
      // A real match the other team won comes round again at the same level. The gentle one can't be lost.
      won: !this.goal.lost,
    };
  }
}

/**
 * The game's sounds. A match the other team won ends softly: a sparkle in place of the fanfare, and
 * the voice says what it says after any game that was lost.
 */
class GoalSound extends Sound {
  lost = false;

  finish(line, options) {
    if (this.lost) this.play('sparkle', { gain: 0.3 });
    super.finish(line, options);
  }
}

const choice = (name, value, label) => `<label><input type="radio" name="${name}" value="${value}"> ${label}</label>`;

new GameSession({
  // What the open and closed hand do here, for the hand shapes in the grown-ups' panel: see core/shapes.js.
  moves: { open: 'Save the ball', closed: null },
  shell: {
    title: 'Giraffe’s Goal',
    startLabel: 'Go in goal',
    againLabel: 'Play again',
    finishTitle: FINISH,
    heroMark: '🧤',
    heroNoun: 'saves',
    extraRows: [{ id: 'saves', label: 'Saves, of the shots' }, { id: 'across', label: 'Saves across the body' }, { id: 'held', label: 'Time ready to save' }, { id: 'stars', label: 'Stars' }],
    hudTop: `
      <div class="goal-hud">
        <div class="chip chip-saves"><span class="chip-label">Saves</span><span id="chip-saves" class="chip-value">0 of 10</span></div>
        <div id="chip-goals-box" class="chip chip-goals"><span class="chip-label">Goals in</span><span id="chip-goals" class="chip-value">0 of 6</span></div>
        <div id="chip-stars-box" class="chip chip-stars" hidden><span class="chip-label">Stars</span><span id="chip-stars" class="chip-value">0</span></div>
      </div>
      ${STORY_BOX}
      <div class="film goal-film" aria-hidden="true">
        <svg viewBox="0 0 220 160">
          <rect class="film-grass" x="0" y="122" width="220" height="38" />
          <circle class="film-ring" cx="146" cy="60" r="38" />
          <g class="film-hand">
            <g class="film-hand-turn">
              <path class="film-finger-ink" d="M-15 -8V-32M-5 -11V-41M5 -11V-41M15 -8V-32M22 12L40 -4" />
              <rect x="-23" y="-12" width="46" height="40" rx="14" />
              <path class="film-finger" d="M-15 -8V-32M-5 -11V-41M5 -11V-41M15 -8V-32M22 12L40 -4" />
            </g>
          </g>
          <g class="film-ball">
            <circle r="21" />
            <path d="M0 -9L8.6 -2.8L5.3 7.3L-5.3 7.3L-8.6 -2.8Z" />
          </g>
          <path class="film-star" d="M146 6l4.4 9 9.9 1.4-7.2 7 1.7 9.9-8.8-4.7-8.8 4.7 1.7-9.9-7.2-7 9.9-1.4z" />
        </svg>
      </div>`,
    panelSettings: `
      <fieldset class="choice">
        <legend>How the hand has to be held to save</legend>
        ${choice('goalWrist', 'any', 'Any open hand')}
        ${choice('goalWrist', 'little', 'Held up a little: the wrist not right down')}
        ${choice('goalWrist', 'more', 'Held up more')}
        ${choice('goalWrist', 'upright', 'Right up: the hand flat to the camera')}
      </fieldset>
      <fieldset class="choice">
        <legend>How far the balls go, which is how far to reach</legend>
        ${choice('goalReach', 'close', 'Close')}
        ${choice('goalReach', 'middle', 'Medium')}
        ${choice('goalReach', 'far', 'Far')}
      </fieldset>
      <fieldset class="choice">
        <legend>The other team's kicks</legend>
        ${choice('goalStakes', 'match', 'A real match: they shoot on time, and can win it')}
        ${choice('goalStakes', 'gentle', 'Gentle: they wait for a ready hand, and goals cost nothing')}
      </fieldset>
      <fieldset class="choice">
        <legend>Saves to win the match</legend>
        ${choice('goalSaves', '6', '6')}
        ${choice('goalSaves', '10', '10')}
        ${choice('goalSaves', '14', '14')}
      </fieldset>`,
  },
  defaults: { goalWrist: 'little', goalReach: 'middle', goalSaves: 10, goalStakes: 'match' },
  choices: { goalWrist: String, goalReach: String, goalSaves: Number, goalStakes: String },
  // These go on to a game that's being played at once. The rest, and the level, start it again: see core/settings.js.
  atOnce: ['goalWrist'],
  // The game is laid out for the hand in play, so the other hand chosen in the middle of it starts it again.
  startsAgain: ['hands'],
  tagline: (side) => `Giraffe’s team needs a goalkeeper! Hold your open ${side} hand up like a high five, and get it to the ring before the ball.`,
  finishLine: FINISH,
  lines: new URL('./audio/voice/lines.json', import.meta.url),
  portraits: () => renderPortraits(ROSTER),
  createSound: (options) => new GoalSound({
    ...options,
    sounds: {
      birds: new URL('../tank-patrol/audio/birds.ogg', import.meta.url),
      kick: new URL('../mighty-moves/audio/thump.ogg', import.meta.url),
      save: new URL('../high-five-racers/audio/slap.ogg', import.meta.url),
      in: new URL('../mighty-moves/audio/whoosh-2.ogg', import.meta.url),
      cheer: new URL('../mighty-moves/audio/cheer.ogg', import.meta.url),
      thud: new URL('../cannon-bay/audio/thud.ogg', import.meta.url),
      boing: new URL('../robot-rescue/audio/boing.ogg', import.meta.url),
      pop: new URL('../balloon-pop/audio/pop.ogg', import.meta.url),
      sparkle: new URL('../mighty-moves/audio/sparkle.ogg', import.meta.url),
      found: new URL('../spider-catcher/audio/home.ogg', import.meta.url),
    },
  }),
  createGame: (session) => new GoalGame(session),
}).start();
