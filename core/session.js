// Runs a camera game from start to finish: welcome, hand check, countdown, play, finish.
//
// Everything to do with the camera, the hand, voice, pausing and the grown-ups' panel lives
// here. A game supplies what's special about it, as an object with these methods:
//
//   prepare(level)            a new round is about to start, at this level from 1 to 10 (core/levels.js)
//   begin()                   the countdown has finished
//   update(dt, snapshot)      one frame of play
//   idle(dt, snapshot)        one frame of anything else: title, check, countdown, finish
//   render()                  draw
//   prompt(snapshot, dt)      what to tell the child during play, or null
//   summary()                 { hero, noun, rows } for the finish card, and won: false if it was lost, or
//                             countsForLevel: false for a round that doesn't move the game's level on
//
// and optionally:
//
//   enterCheck()              the hand check is starting
//   resume()                  play continues after a hand check in the middle of a round
//   finished()                the round is over
//   setHands(side)            the hand in play has changed
//   settingChanged(change)    one of the game's own settings has changed
//   newAt(level)              what's new at a level, as [{ mark, name, nameKa }] (see core/levels.js)
//   holdStart(go)             true to wait on the 'waiting' screen after the hand check rather than count down
//                             at once, as High Five Racers does for friends: the game calls go() when it's time
//   chimeOnOpen               chime whenever the hand in play opens
//   bothHands                 it's played with both hands, so both are drawn on the mirror, and not only the one in play
//   handLinks()               which of each hand's points to join on the mirror, as { play, other }, each a list of
//                             pairs: a thumb and the finger it's pinched against, for a game that goes by such things
//   debug                     extra things for the automated tests to read
//
// A prompt from a game can say it asks for the open move, as asks: 'open'. When a grown-up has chosen a hand shape
// for that move (see core/shapes.js), it's asked for in that shape's words instead.
import { CameraProblem, TrackingCamera } from './camera.js';
import { HandCheck, HandMonitor, OPEN_RULES, PlayStats, promptFor } from './hands.js';
import { Hud } from './hud.js';
import { Levels, mountLevels } from './levels.js';
import { loadSettings, saveSettings } from './settings.js';
import { SHAPE_RESTING, choiceOf, shapesFor } from './shapes.js';
import { givenFor } from './mapping.js';
import { mountShell } from './shell.js';
import { SO_CLOSE, Sound } from './sound.js';

const MIN_FRAME_MS = 14;
const TRACKER_STALL_MS = 1000; // No result for this long counts as no hands: fail closed.
const CLOSER_HINT_AFTER_SECONDS = 4;
const COUNT_FROM = 3;
const COUNT_TICK_SECONDS = 0.75; // Long enough to say each number, and no longer.
const GO_SHOWN_SECONDS = 0.9;
const PRAISE_PAUSE_SECONDS = 0.95; // Lets "Great job!" finish before the countdown speaks.

const PROBLEM_TEXT = {
  insecure: ['This page needs a safe address', 'Open it from http://localhost, as the readme explains, so the browser will allow the camera.'],
  denied: ['Can we use your camera?', 'The game needs to see your hands. Ask a grown-up to allow the camera using the icon next to the web address, then try again.'],
  none: ['We can’t find a camera', 'Ask a grown-up to plug in a camera or turn it on, then try again.'],
  busy: ['The camera is busy', 'Another app may be using it. Ask a grown-up to close that app, then try again.'],
  tracker: ['The hand tracker didn’t start', 'Try reloading the page, and check that this is a recent version of Google Chrome.'],
  other: ['We can’t see the camera', 'Ask a grown-up to check the camera, then try again.'],
};

// Each of these has a rendered voice file: see audio/voice/lines.json.
export const SPOKEN = {
  openWide: 'Open your hand as wide as you can!',
  openWideAgain: 'One more try. Open your hand as wide as you can!',
  holdCloser: 'Hold your hand up closer to the camera',
  resting: 'Resting is OK. Open your hand when you’re ready.',
};

export class GameSession {
  /**
   * shell is what mountShell needs. defaults and choices are the game's own settings.
   * tagline(side) is the line on the title card, and finishLine what the voice says at the
   * end. createSound and createGame build the game's sound and the game itself. lines is where a
   * game's own voice lines are, and portraits makes pictures of the characters for it. moves names what
   * the open and closed hand do, as { open: 'Drive', closed: 'Slow down' }, with closed null where a
   * closed hand does nothing of its own: they're for choosing the open move's hand shape in the panel.
   *
   * mapping is for a game that gives more than its open move to its hands, as Frost Arena gives firing and
   * reloading: { legend, lead, open: { options, hand }, rows }. Each of rows is { id, name, options, fallback },
   * with hand or hands for a game played with both, as core/mapping-ui.js describes. They go in the same picker
   * as the open move, are kept with the game's hand shapes, and are read as session.given, { id: value }. A
   * saved value that the row doesn't offer any more is its fallback. The game hears a change as
   * settingChanged({ given: id }).
   */
  constructor({ shell, defaults = {}, choices = {}, tagline, finishLine, createSound, createGame, lines = null, portraits = null, moves = { open: 'Play', closed: null }, mapping = null }) {
    this.shell = shell;
    this.moves = moves;
    this.mapping = mapping;
    this.defaults = defaults;
    this.choices = choices;
    this.taglineFor = tagline;
    this.finishLine = finishLine;
    this.wonLine = finishLine; // What's said when the game is won, whatever finishLine is changed to for one ending.
    this.createSound = createSound ?? ((options) => new Sound(options));
    this.createGame = createGame;
    this.gameLines = lines;
    this.makePortraits = portraits;

    this.screen = 'welcome';
    this.paused = false;
    this.handCheck = null;
    this.checkRetried = false;
    this.afterCheck = 'countdown';
    this.countLeft = 0;
    this.countWait = 0;
    this.goShownFor = 0;
    this.stats = null;
    this.playSeconds = 0;
    this.closedSeconds = 0;
    this.missingSeconds = 0;
    this.wasHandOpen = false;
    this.lastFrameTime = performance.now();
    // How it's running, for the grown-ups' panel: pictures drawn and looks at the hands, counted over a second.
    this.pace = { frames: 0, looks: 0, drawn: 0, looked: 0, since: performance.now() };
    this.retryAfterProblem = () => this.beginCheck();
  }

  async start() {
    mountShell(this.shell);
    // Pictures of the characters can take a moment, and a click before they're ready would be lost.
    document.getElementById('start').disabled = true;
    this.settings = loadSettings(this.defaults);
    const { settings } = this;
    this.levels = new Levels(settings);
    // The level being played, or about to be. Games read it as session.level.
    this.level = this.levels.current;

    const fetchLines = async (url) => (await fetch(url)).json();
    const lines = await fetchLines(new URL('./audio/voice/lines.json', import.meta.url));
    if (this.gameLines) {
      const base = new URL('./', this.gameLines);
      for (const line of await fetchLines(this.gameLines)) lines.push({ ...line, base });
    }
    const georgian = new Map(lines.map(({ text, ka }) => [text, ka]));
    this.translate = (text) => (settings.language === 'ka' ? georgian.get(text) ?? text : text);

    this.sound = this.createSound({ sound: settings.sound, voice: settings.voice, language: settings.language, lines });
    this.monitor = new HandMonitor(settings.strictness, settings.hands);
    // The hand shapes for this game's moves, saved for each game as its levels are, and what else the game
    // gives to its hands, kept with them.
    this.shapes = shapesFor(settings.shapes?.[this.levels.game], this.mapping?.open?.options);
    this.monitor.setShapes(this.shapes);
    this.given = givenFor(this.mapping, settings.shapes?.[this.levels.game], choiceOf(this.shapes.open));
    this.camera = new TrackingCamera(document.getElementById('camera'));

    this.hud = new Hud({
      // Prompts wait for quiet, and the box tries again.
      speak: (text) => this.sound.say(text, { ifQuiet: true }),
      translate: this.translate,
      settings,
      choices: this.choices,
      tagline: this.taglineFor,
      moves: this.moves,
      shapes: this.shapes,
      onShape: (choice) => this.changeShape(choice),
      mapping: this.mapping,
      given: this.given,
      onGiven: (id, value) => this.changeGiven(id, value),
      onStrictness: (side, value) => {
        settings.strictness[side] = value;
        this.monitor.setStrictness(side, value);
        this.hud.panelHands[side].update(this.monitor.snapshot[side]);
        saveSettings(settings);
      },
      onSettings: (change) => this.changeSettings(change),
      onRecheck: () => {
        this.hud.panel.close();
        this.recheckHands();
      },
    });

    this.levelUi = mountLevels(this.levels, {
      language: () => settings.language,
      // What each level brings that's new, if the game says.
      newAt: (level) => this.game?.newAt?.(level) ?? [],
      onChoose: (level) => {
        // Mid-round, the new level starts with the next round.
        if (this.screen !== 'playing' && this.screen !== 'countdown') this.level = level;
      },
    });

    this.portraits = this.makePortraits?.() ?? null;
    this.game = await this.createGame(this);
    this.game.setHands?.(settings.hands);
    // A game played with both hands has both drawn on the mirror, with whatever it says its fingers are doing.
    this.hud.bothHands = Boolean(this.game.bothHands);
    if (this.game.handLinks) this.hud.links = () => this.game.handLinks();
    // Now the game is here, the title card can say what this level brings.
    this.levelUi.refresh();

    this.camera.onResult = ({ hands, aspect }) => {
      this.pace.looked += 1;
      this.hud.updateHands(this.monitor.update(hands, performance.now(), aspect));
    };
    this.camera.onTrackerError = (message) => console.error('Hand tracking error:', message);

    const byId = (id) => document.getElementById(id);
    byId('start').addEventListener('click', () => this.openCameraThen(() => this.beginCheck()));
    byId('play-again').addEventListener('click', () => this.playAgain());
    byId('problem-retry').addEventListener('click', () => this.openCameraThen(this.retryAfterProblem));
    byId('open-panel').addEventListener('click', () => this.openPanel());
    this.hud.panel.addEventListener('close', () => {
      this.paused = false;
      this.sound.resume();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.sound.quiet();
      else if (!this.paused) this.sound.resume();
    });

    // Lets the automated tests read the game's state. Does nothing in normal use.
    if (new URLSearchParams(location.search).has('debug')) {
      const session = this;
      window.__game = {
        session,
        monitor: this.monitor,
        camera: this.camera,
        hud: this.hud,
        sound: this.sound,
        get screen() {
          return session.screen;
        },
        get stats() {
          return session.stats;
        },
      };
      // Keeps a game's getters as getters, so tests read what's there now.
      if (this.game.debug) Object.defineProperties(window.__game, Object.getOwnPropertyDescriptors(this.game.debug));
    }

    byId('start').disabled = false;
    requestAnimationFrame((now) => this.tick(now));
  }

  changeSettings(change) {
    const { settings } = this;
    Object.assign(settings, change);
    if ('sound' in change || 'voice' in change) this.sound.setEnabled(settings);
    if ('hands' in change) {
      this.monitor.setSide(settings.hands);
      this.hud.setHands(settings.hands);
      this.game.setHands?.(settings.hands);
    }
    if ('language' in change) {
      this.sound.setLanguage(settings.language);
      this.hud.prompt.clear();
    }
    this.game.settingChanged?.(change);
    saveSettings(settings);
  }

  /** A grown-up has chosen the hand shape for this game's open move: see core/shapes.js. */
  changeShape(choice) {
    const { settings } = this;
    const { game } = this.levels;
    settings.shapes = { ...settings.shapes, [game]: { ...settings.shapes?.[game], open: choice } };
    this.shapes = shapesFor(settings.shapes[game], this.mapping?.open?.options);
    this.monitor.setShapes(this.shapes);
    this.hud.setShapes(this.shapes);
    this.hud.prompt.clear();
    const { snapshot } = this.monitor;
    for (const side of ['left', 'right']) this.hud.panelHands[side].update(snapshot[side], snapshot.otherHandSeen);
    // A game that gives more than its open move to its hands hears of this as of any other row.
    if (this.mapping) this.game.settingChanged?.({ given: 'open' });
    saveSettings(settings);
  }

  /** A grown-up has given something else the game does to another hand shape, or hand: see mapping above. */
  changeGiven(id, value) {
    const { settings } = this;
    const { game } = this.levels;
    settings.shapes = { ...settings.shapes, [game]: { ...settings.shapes?.[game], [id]: value } };
    this.given = givenFor(this.mapping, settings.shapes[game], choiceOf(this.shapes.open));
    this.hud.setGiven(this.given);
    this.game.settingChanged?.({ given: id });
    saveSettings(settings);
  }

  /**
   * A game's prompt asking for the open move, asked in the words for the hand shape chosen for it, if there is one.
   * Resting is fine whatever the shape, and that's said in a shape's words too.
   */
  shapedPrompt(prompt) {
    const resting = prompt?.text === SPOKEN.resting;
    const { open } = this.shapes;
    if (!open.prompt || !(resting || prompt?.asks === 'open')) return prompt;
    return { ...prompt, key: `${prompt.key}-${open.id}`, text: resting ? SHAPE_RESTING : open.prompt, move: 'open' };
  }

  setScreen(name) {
    this.screen = name;
    document.body.dataset.screen = name;
  }

  async openCameraThen(next) {
    this.sound.unlock();
    this.setScreen('loading');
    try {
      await Promise.all([this.camera.start(), this.sound.ready]);
    } catch (problem) {
      const kind = problem instanceof CameraProblem ? problem.kind : 'other';
      if (problem.cause) console.error(problem.cause);
      this.hud.showProblem(...PROBLEM_TEXT[kind]);
      this.retryAfterProblem = next;
      this.setScreen('problem');
      return;
    }
    this.hud.setCameraAspect(this.camera.aspect);
    next();
  }

  /**
   * "Show your right hand!" is the wrong thing to keep saying to a child who is showing it.
   * The tracker can't find a hand until it's within about 60 cm of the camera. Once found,
   * it can follow that hand back to about 1.5 m, so coming closer once is all it takes.
   */
  handsPrompt(snapshot, dt) {
    const prompt = promptFor(snapshot);
    const missing = prompt?.key.startsWith('missing');
    this.missingSeconds = missing ? this.missingSeconds + dt : 0;
    if (missing && this.missingSeconds > CLOSER_HINT_AFTER_SECONDS) {
      return { key: 'closer', text: SPOKEN.holdCloser, side: null };
    }
    return prompt;
  }

  beginCheck(then = 'countdown') {
    this.handCheck = new HandCheck();
    this.checkRetried = false;
    this.missingSeconds = 0;
    this.afterCheck = then;
    this.game.enterCheck?.();
    this.hud.setCheckProgress(0);
    this.setScreen('check');
  }

  updateCheck(dt, now) {
    const { monitor, hud, sound } = this;
    const snapshot = monitor.snapshot;
    const counted = this.handCheck.add(snapshot, dt);
    hud.setCheckProgress(this.handCheck.progress);

    // With a shape for the open move, the check is of that, and how far the hand opens doesn't matter.
    const { open } = this.shapes;
    const asked = open.prompt
      ? { key: `check-${open.id}`, text: open.prompt, side: null, move: 'open' }
      : { key: `check-${this.checkRetried}`, text: this.checkRetried ? SPOKEN.openWideAgain : SPOKEN.openWide, side: null };
    hud.prompt.show(counted ? asked : this.handsPrompt(snapshot, dt), now);

    if (!this.handCheck.done) return;
    const result = this.handCheck.result();
    if (open.fingers) result.best = null;
    if (result.best !== null && result.best < OPEN_RULES.floor && !this.checkRetried) {
      this.handCheck = new HandCheck();
      this.checkRetried = true;
      return;
    }

    monitor.applyCheck(result);
    hud.prompt.clear();
    sound.handsOpen();
    sound.say('Great job!');
    if (this.afterCheck === 'resume') {
      this.game.resume?.();
      this.setScreen('playing');
    } else {
      this.countdownOrWait(PRAISE_PAUSE_SECONDS);
    }
  }

  /** The countdown, unless the game wants to wait for something first. */
  countdownOrWait(wait = 0) {
    const go = () => {
      if (this.screen === 'waiting') this.beginCountdown(PRAISE_PAUSE_SECONDS);
    };
    if (this.game.holdStart?.(go)) {
      this.hud.prompt.clear();
      this.setScreen('waiting');
      return;
    }
    this.beginCountdown(wait);
  }

  beginCountdown(wait = 0) {
    this.level = this.levels.current;
    this.levelUi.refresh();
    this.game.prepare(this.level);
    this.countLeft = COUNT_FROM;
    this.countWait = wait;
    this.setScreen('countdown');
    if (wait === 0) this.showFirstCount();
  }

  showFirstCount() {
    this.hud.setCount(String(COUNT_FROM));
    this.sound.count(COUNT_FROM);
  }

  updateCountdown(dt) {
    if (this.countWait > 0) {
      this.countWait -= dt;
      if (this.countWait <= 0) this.showFirstCount();
      return;
    }
    const before = Math.ceil(this.countLeft);
    this.countLeft -= dt / COUNT_TICK_SECONDS;
    const after = Math.ceil(this.countLeft);
    if (this.countLeft <= 0) {
      this.beginPlay();
    } else if (after !== before) {
      this.hud.setCount(String(after));
      this.sound.count(after);
    }
  }

  beginPlay() {
    this.stats = new PlayStats();
    this.playSeconds = 0;
    this.closedSeconds = 0;
    this.wasHandOpen = false;
    this.goShownFor = GO_SHOWN_SECONDS;
    this.hud.setCount(this.settings.language === 'ka' ? this.translate('Go!') : 'GO!');
    this.sound.go();
    this.game.begin();
    this.setScreen('playing');
  }

  updatePlaying(dt, now) {
    const snapshot = this.monitor.snapshot;
    this.playSeconds += dt;
    this.closedSeconds = snapshot.handOpen ? 0 : this.closedSeconds + dt;

    if (this.game.chimeOnOpen && snapshot.handOpen && !this.wasHandOpen) this.sound.handsOpen();
    this.wasHandOpen = snapshot.handOpen;

    this.stats.update(snapshot, dt);
    this.game.update(dt, snapshot);

    // The game may have just finished.
    if (this.screen === 'playing') this.hud.prompt.show(this.shapedPrompt(this.game.prompt(snapshot, dt)), now);

    if (this.goShownFor > 0) {
      this.goShownFor -= dt;
      if (this.goShownFor <= 0) this.hud.setCount('');
    }
  }

  /** A game calls this when its round is over. */
  finish() {
    this.camera.stop();
    this.monitor.forgetHands();
    this.game.finished?.();
    const summary = this.game.summary();
    // A game that was lost isn't cheered: no fanfare, no clapping and no confetti. What's said then is the line
    // the game has for it, which it sets as finishLine before it finishes. A game with no line of its own for
    // losing, which still has the line it's won with, has the one all the games share.
    const lost = summary.won === false;
    this.sound.finish(lost && this.finishLine === this.wonLine ? SO_CLOSE : this.finishLine, { lost });
    this.hud.prompt.clear();
    this.hud.setCount('');
    this.hud.showSummary(this.stats, this.monitor.side, summary);
    if (summary.countsForLevel === false) {
      this.levels.last = null;
      this.levelUi.refresh();
    } else {
      this.levelUi.showResult(this.levels.complete(summary.won !== false, this.level));
    }
    this.setScreen('finish');
  }

  playAgain() {
    this.hud.hideSummary();
    this.openCameraThen(() => this.countdownOrWait());
  }

  recheckHands() {
    const midRound = this.screen === 'playing';
    this.hud.hideSummary();
    this.hud.prompt.clear();
    this.hud.setCount('');
    if (this.camera.running) this.beginCheck(midRound ? 'resume' : 'countdown');
    else this.openCameraThen(() => this.beginCheck('countdown'));
  }

  openPanel() {
    const { monitor, hud } = this;
    this.paused = true;
    this.sound.quiet();
    hud.updateHands(monitor.snapshot);
    hud.panel.showModal();
    hud.panelHands.left.update(monitor.snapshot.left, monitor.snapshot.otherHandSeen);
    hud.panelHands.right.update(monitor.snapshot.right, monitor.snapshot.otherHandSeen);
  }

  /**
   * How many pictures were drawn, and how many times the hands were looked at, in the last second: for the
   * panel, so a grown-up can see whether a game that feels slow is this computer being slow.
   */
  countPace(now) {
    const { pace } = this;
    pace.drawn += 1;
    if (now - pace.since < 1000) return;
    const seconds = (now - pace.since) / 1000;
    Object.assign(pace, { frames: Math.round(pace.drawn / seconds), looks: Math.round(pace.looked / seconds), drawn: 0, looked: 0, since: now });
    this.hud.showPace(pace, this.camera.running);
  }

  tick(now) {
    requestAnimationFrame((next) => this.tick(next));
    // 60 frames a second is plenty. On a 120 Hz screen the extra frames would only take
    // the GPU away from hand tracking and run the battery down.
    if (now - this.lastFrameTime < MIN_FRAME_MS) return;
    const dt = Math.min(0.05, Math.max(0, now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;
    this.countPace(now);

    // A stalled tracker must look like no hands, never like hands frozen open.
    if (this.camera.running && performance.now() - this.camera.lastResultAt > TRACKER_STALL_MS) {
      this.hud.updateHands(this.monitor.update([], performance.now(), this.camera.aspect));
    }

    if (!this.paused) {
      if (this.screen === 'check') this.updateCheck(dt, now);
      else if (this.screen === 'countdown') this.updateCountdown(dt);

      if (this.screen === 'playing') this.updatePlaying(dt, now);
      else this.game.idle(dt, this.monitor.snapshot);
    }
    this.game.render();
  }
}
