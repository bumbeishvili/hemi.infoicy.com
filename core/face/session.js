// Runs a game played with the face from start to finish: welcome, mouth check, countdown, play, finish. It's the
// hand games' session (core/session.js) for a mouth: the same screens, with the same names, and a game is the same
// kind of object, so levels and playing with friends fit it as they are.
//
// Everything to do with the camera, the face, voice, pausing and the grown-ups' panel lives here. A game supplies
// what's special about it, as an object with these methods:
//
//   prepare(level)            a new round is about to start, at this level from 1 to 10 (core/levels.js)
//   begin()                   the countdown has finished
//   update(dt, snapshot)      one frame of play. snapshot is what the mouth is doing: see MouthMonitor in mouth.js
//   idle(dt, snapshot)        one frame of anything else: title, check, countdown, finish
//   render()                  draw
//   prompt(snapshot, dt)      what to tell the child during play, or null
//   summary()                 { hero, noun, rows } for the finish card, and line, what the voice says there, won: false
//                             if it was lost, or countsForLevel: false for a round that doesn't move the level on
//
// and optionally:
//
//   enterCheck()              the mouth check is starting
//   resume()                  play continues after a mouth check in the middle of a round
//   finished()                the round is over
//   settingChanged(change)    one of the game's own settings has changed
//   levelChosen(level)        a grown-up has chosen another level, for a game whose title card shows the level's world
//   newAt(level)              what's new at a level, as [{ mark, name, nameKa }] (see core/levels.js)
//   holdStart(go)             true to wait on the 'waiting' screen after the check rather than count down at once,
//                             as for friends: the game calls go() when it's time
//   debug                     extra things for the automated tests to read
//
// The tests can't show the tracker a real face, as there are no photos of faces in this folder. So, only with
// ?debug in the address, a stand-in for the tracker can be given as window.__faceTracker: see test/e2e/fake-face.js.
import { CameraProblem, TrackingCamera } from '../camera.js';
import { Levels, mountLevels } from '../levels.js';
import { loadSettings, saveSettings } from '../settings.js';
import { Sound } from '../sound.js';
import { FaceHud } from './hud.js';
import { MOUTH_RULES, MOUTH_SAY, MouthCheck, MouthMonitor, mouthPrompt, MouthStats } from './mouth.js';
import { mountFaceShell } from './shell.js';

const MIN_FRAME_MS = 14;
const TRACKER_STALL_MS = 1000; // No result for this long counts as nobody there: fail closed.
const COUNT_FROM = 3;
const COUNT_TICK_SECONDS = 0.75; // Long enough to say each number, and no longer.
const GO_SHOWN_SECONDS = 0.9;
const PRAISE_PAUSE_SECONDS = 0.95; // Lets "Great job!" finish before the countdown speaks.

const PROBLEM_TEXT = {
  insecure: ['This page needs a safe address', 'Open it from http://localhost, as the readme explains, so the browser will allow the camera.'],
  denied: ['Can we use your camera?', 'The game needs to see your face. Ask a grown-up to allow the camera using the icon next to the web address, then try again.'],
  none: ['We can’t find a camera', 'Ask a grown-up to plug in a camera or turn it on, then try again.'],
  busy: ['The camera is busy', 'Another app may be using it. Ask a grown-up to close that app, then try again.'],
  tracker: ['The face tracker didn’t start', 'Try reloading the page, and check that this is a recent version of Google Chrome.'],
  other: ['We can’t see the camera', 'Ask a grown-up to check the camera, then try again.'],
};

export class FaceSession {
  /**
   * shell is what mountFaceShell needs. defaults and choices are the game's own settings. tagline is the line on
   * the title card, and finishLine what the voice says at the end, unless the game's summary says another.
   * createSound and createGame build the game's sound and the game itself, and lines is where its voice lines are.
   */
  constructor({ shell, defaults = {}, choices = {}, tagline = '', finishLine, createSound, createGame, lines = null }) {
    this.shell = shell;
    this.defaults = defaults;
    this.choices = choices;
    this.tagline = tagline;
    this.finishLine = finishLine;
    this.createSound = createSound ?? ((options) => new Sound(options));
    this.createGame = createGame;
    this.gameLines = lines;

    this.screen = 'welcome';
    this.paused = false;
    this.mouthCheck = null;
    this.checkRetried = false;
    this.afterCheck = 'countdown';
    this.countLeft = 0;
    this.countWait = 0;
    this.goShownFor = 0;
    this.stats = null;
    this.playSeconds = 0;
    this.closedSeconds = 0;
    this.lastFrameTime = performance.now();
    this.retryAfterProblem = () => this.beginCheck();
  }

  async start() {
    mountFaceShell(this.shell);
    document.getElementById('start').disabled = true;
    this.settings = loadSettings({ mouthStrictness: MOUTH_RULES.defaultStrictness, ...this.defaults });
    const { settings } = this;
    this.levels = new Levels(settings);
    // The level being played, or about to be. Games read it as session.level.
    this.level = this.levels.current;

    // The lines every game has, those for a face, and the game's own.
    const fetchLines = async (url) => (await fetch(url)).json();
    const faceBase = new URL('./voice/', import.meta.url);
    const lines = await fetchLines(new URL('../audio/voice/lines.json', import.meta.url));
    for (const line of await fetchLines(new URL('lines.json', faceBase))) lines.push({ ...line, base: faceBase });
    if (this.gameLines) {
      const base = new URL('./', this.gameLines);
      for (const line of await fetchLines(this.gameLines)) lines.push({ ...line, base });
    }
    const georgian = new Map(lines.map(({ text, ka }) => [text, ka]));
    this.translate = (text) => (settings.language === 'ka' ? georgian.get(text) ?? text : text);

    this.sound = this.createSound({ sound: settings.sound, voice: settings.voice, language: settings.language, lines });
    this.monitor = new MouthMonitor(settings.mouthStrictness);
    const debugging = new URLSearchParams(location.search).has('debug');
    this.camera = new TrackingCamera(document.getElementById('camera'), {
      worker: (debugging && window.__faceTracker) || new URL('./face.worker.js', import.meta.url),
    });

    this.hud = new FaceHud({
      // Prompts wait for quiet, and the box tries again.
      speak: (text) => this.sound.say(text, { ifQuiet: true }),
      translate: this.translate,
      settings,
      choices: this.choices,
      tagline: this.tagline,
      onStrictness: (value) => {
        settings.mouthStrictness = value;
        this.monitor.setStrictness(value);
        this.hud.panelMouth.update(this.monitor.snapshot);
        saveSettings(settings);
      },
      onSettings: (change) => this.changeSettings(change),
      onRecheck: () => {
        this.hud.panel.close();
        this.recheckMouth();
      },
    });

    this.levelUi = mountLevels(this.levels, {
      language: () => settings.language,
      // What each level brings that's new, if the game says.
      newAt: (level) => this.game?.newAt?.(level) ?? [],
      onChoose: (level) => {
        // Mid-round, the new level starts with the next round.
        if (this.screen !== 'playing' && this.screen !== 'countdown') this.level = level;
        this.game?.levelChosen?.(level);
      },
    });

    this.game = await this.createGame(this);
    // Now the game is here, the title card can say what this level brings.
    this.levelUi.refresh();

    this.camera.onResult = ({ faces, aspect }) => {
      this.hud.update(this.monitor.update(faces, performance.now(), aspect));
    };
    this.camera.onTrackerError = (message) => console.error('Face tracking error:', message);

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
    if (debugging) {
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

    this.hud.update(this.monitor.snapshot);
    byId('start').disabled = false;
    requestAnimationFrame((now) => this.tick(now));
  }

  changeSettings(change) {
    const { settings } = this;
    Object.assign(settings, change);
    if ('sound' in change || 'voice' in change) this.sound.setEnabled(settings);
    if ('language' in change) {
      this.sound.setLanguage(settings.language);
      this.hud.prompt.clear();
    }
    this.game.settingChanged?.(change);
    saveSettings(settings);
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
   * What to say about a face that can't be read: not in the picture, too far away or turned away. Nothing for a
   * mouth that's only shut, which can rest whenever it likes: a game says what it wants of that.
   */
  facePrompt(snapshot) {
    const prompt = mouthPrompt(snapshot);
    return prompt && !prompt.key.startsWith('closed') ? prompt : null;
  }

  beginCheck(then = 'countdown') {
    this.mouthCheck = new MouthCheck();
    this.checkRetried = false;
    this.afterCheck = then;
    this.game.enterCheck?.();
    this.hud.setCheckProgress(0);
    this.setScreen('check');
  }

  updateCheck(dt, now) {
    const { monitor, hud, sound } = this;
    const snapshot = monitor.snapshot;
    const counted = this.mouthCheck.add(snapshot, dt);
    hud.setCheckProgress(this.mouthCheck.progress);
    const asked = { key: `check-${this.checkRetried}`, text: this.checkRetried ? MOUTH_SAY.openWideAgain : MOUTH_SAY.openWide, side: null };
    hud.prompt.show(counted ? asked : this.facePrompt(snapshot), now);

    if (!this.mouthCheck.done) return;
    const result = this.mouthCheck.result();
    // A mouth that didn't open is asked once more. After that the game goes on, with the line where any mouth's is.
    if (result.best < MOUTH_RULES.floor && !this.checkRetried) {
      this.mouthCheck = new MouthCheck();
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
    this.stats = new MouthStats();
    this.playSeconds = 0;
    this.closedSeconds = 0;
    this.goShownFor = GO_SHOWN_SECONDS;
    this.hud.setCount(this.settings.language === 'ka' ? this.translate('Go!') : 'GO!');
    this.sound.go();
    this.game.begin();
    this.setScreen('playing');
  }

  updatePlaying(dt, now) {
    const snapshot = this.monitor.snapshot;
    this.playSeconds += dt;
    this.closedSeconds = snapshot.mouthOpen ? 0 : this.closedSeconds + dt;
    this.stats.update(snapshot, dt);
    this.game.update(dt, snapshot);

    // The game may have just finished.
    if (this.screen === 'playing') this.hud.prompt.show(this.game.prompt(snapshot, dt), now);

    if (this.goShownFor > 0) {
      this.goShownFor -= dt;
      if (this.goShownFor <= 0) this.hud.setCount('');
    }
  }

  /** A game calls this when its round is over. */
  finish() {
    this.camera.stop();
    this.monitor.forget();
    this.hud.update(this.monitor.snapshot);
    this.game.finished?.();
    this.hud.prompt.clear();
    this.hud.setCount('');
    const summary = this.game.summary();
    // A game that was lost isn't cheered, as in the hand games: no fanfare, no clapping and no confetti.
    this.sound.finish(summary.line ?? this.finishLine, { lost: summary.won === false });
    this.hud.showSummary(this.stats, summary);
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

  recheckMouth() {
    const midRound = this.screen === 'playing';
    this.hud.hideSummary();
    this.hud.prompt.clear();
    this.hud.setCount('');
    if (this.camera.running) this.beginCheck(midRound ? 'resume' : 'countdown');
    else this.openCameraThen(() => this.beginCheck('countdown'));
  }

  openPanel() {
    this.paused = true;
    this.sound.quiet();
    this.hud.update(this.monitor.snapshot);
    this.hud.panel.showModal();
    this.hud.panelMouth.update(this.monitor.snapshot);
  }

  tick(now) {
    requestAnimationFrame((next) => this.tick(next));
    // 60 frames a second is plenty. On a 120 Hz screen the extra frames would only take the GPU away from tracking.
    if (now - this.lastFrameTime < MIN_FRAME_MS) return;
    const dt = Math.min(0.05, Math.max(0, now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    // A stalled tracker must look like nobody there, never like a mouth frozen open.
    if (this.camera.running && performance.now() - this.camera.lastResultAt > TRACKER_STALL_MS) {
      this.hud.update(this.monitor.update([], performance.now(), this.camera.aspect));
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
