// What every game played with the whole body shares: the camera and body tracker, checking the
// camera can see the child, choosing a character, the grown-ups' panel and the frame loop. A
// game extends BodyGame and fills in what's special about it:
//
//   setUp()                       build the game's stage, as this.stage, with update() and render()
//   showChosen(spec, silent)      a character has been chosen
//   afterBodyCheck(then)          the camera can see the child, and then says what was asked for
//   onMoves(moves, now)           the child did something: see reader.js for what moves there are
//   frame(dt, now)                one frame of whichever screen the game is on
//   settingChanged(change)        one of the settings has changed
//
// A game's screens are its own, apart from welcome, choose, loading, problem and bodycheck.
import { CameraProblem, TrackingCamera } from '../camera.js';
import { groupChoice as groupChoiceFor } from '../group-choice.js';
import { Confetti, PromptBox } from '../hud.js';
import { Levels, mountLevels } from '../levels.js';
import { openingBar, watchLoading } from '../loading.js';
import { appliesAtOnce, loadSettings, saveSettings } from '../settings.js';
import { MoveDemo } from './demo.js';
import { ICONS } from './icons.js';
import { renderPortraits } from './portraits.js';
import { MOST_PEOPLE, People } from './people.js';
import { BodyReader, closeUpBoxes, viewProblem } from './reader.js';
import { ROSTER, byId } from './roster.js';

export const byElementId = (id) => document.getElementById(id);

const MIN_FRAME_MS = 14;
const TRACKER_STALL_MS = 1000; // No result for this long counts as nobody there.
const CHECK_SECONDS = 1.1;
const LOST_BODY_SECONDS = 1.5;
const SEEN_SHOWN_MS = 800;
const PANEL_READING_MS = 200;

const PROBLEM_TEXT = {
  insecure: ['This page needs a safe address', 'Open it from http://localhost, as the readme explains, so the browser will allow the camera.'],
  denied: ['Can we use your camera?', 'The game needs to see you move. Ask a grown-up to allow the camera using the icon next to the web address, then try again.'],
  none: ['We can’t find a camera', 'Ask a grown-up to plug in a camera or turn it on, then try again.'],
  busy: ['The camera is busy', 'Another app may be using it. Ask a grown-up to close that app, then try again.'],
  tracker: ['The body tracker didn’t start', 'Try reloading the page, and check that this is a recent version of Google Chrome.'],
  other: ['We can’t see the camera', 'Ask a grown-up to check the camera, then try again.'],
};

// Every one of these has a rendered voice file: see voice/lines.json.
export const BODY_SAY = {
  makeSpace: 'Make some space around you',
  stepBack: 'Step back until I can see all of you',
  comeCloser: 'Come a little closer',
  showAll: 'Stand where I can see all of you',
  moveLeft: 'Move to your left',
  moveRight: 'Move to your right',
  canSeeYou: 'I can see all of you! Get ready!',
  // Several playing in front of one camera, and not all of them in the picture yet.
  sideBySide: 'Stand side by side, where I can see all of you',
  comeBack: 'Come back where I can see you',
  seeFeet: 'Step back so I can see your feet',
  waiting: 'Take your time. I’ll wait for you.',
};

/**
 * For the chooser of a game that several can play in front of one camera: a row of numbers for how many are
 * playing. See watchGroupChoice.
 */
export const groupChoice = () => groupChoiceFor(MOST_PEOPLE);

const PROBLEM_PROMPTS = {
  'no-body': { key: 'no-body', text: BODY_SAY.showAll, side: null },
  'show-all': { key: 'show-all', text: BODY_SAY.showAll, side: null },
  'step-back': { key: 'step-back', text: BODY_SAY.stepBack, side: null },
  'come-closer': { key: 'come-closer', text: BODY_SAY.comeCloser, side: null },
  'move-left': { key: 'move-left', text: BODY_SAY.moveLeft, side: 'left' },
  'move-right': { key: 'move-right', text: BODY_SAY.moveRight, side: 'right' },
  // Several are playing, and the camera can't see that many yet.
  'side-by-side': { key: 'side-by-side', text: BODY_SAY.sideBySide, side: null },
};
// With several playing, how long one of them can go unseen before their reader is told nobody is there.
const MISSED_LOOKS_SECONDS = 0.35;
// Each player's stick figure over the camera's picture has its own colour, in the order they stand.
const PLAYER_COLOURS = ['#35e07a', '#4db5ff', '#ffb02e', '#d58cff'];

const SKELETON_LINES = [
  [11, 13, 15], [12, 14, 16], [11, 12], [11, 23], [12, 24], [23, 24], [23, 25, 27, 31], [24, 26, 28, 32],
];

export class BodyGame {
  /**
   * defaults and choices are the game's own settings, and how to read each from its radio
   * buttons. lines is where the game's voice lines are, and createSound builds its sound.
   */
  constructor({ defaults, choices, atOnce = [], lines, createSound }) {
    // The game's settings that go on to a game that's being played at once: see appliesAtOnce in settings.js.
    this.atOnce = atOnce;
    this.startAgainWanted = false;
    this.defaults = defaults;
    this.choices = choices;
    this.gameLines = lines;
    this.createSound = createSound;
    this.screen = 'welcome';
    this.paused = false;
    this.lastFrameTime = performance.now();
    this.latestBody = null;
    // Who's playing in front of this camera: one child, unless a game that can be played by several has been told
    // how many. Each is { index, reader, body }: see setPlayers and core/body/people.js.
    this.players = [];
    this.people = new People(1);
    this.aspect = 16 / 9;
    this.checkHeld = 0;
    this.nextHand = 'left';
    this.upperBodyOnly = false; // Whether the game is happy with just the top half of the child.
    this.armsOut = false; // Whether it has them holding their arms out to the sides.
    this.closeUpScreens = new Set();
    this.retryAfterProblem = () => this.beginBodyCheck();
  }

  async start() {
    // The characters and the scene take a moment to build, and a click before they're ready would be lost. A bar
    // under the button fills until it can be pressed: see core/loading.js.
    const startButton = byElementId('start');
    if (startButton) startButton.disabled = true;
    const opening = openingBar();
    this.settings = loadSettings(this.defaults);
    const { settings } = this;
    if (!byId(settings.fighter)) settings.fighter = this.defaults.fighter;
    this.levels = new Levels(settings);
    // The level being played, or about to be: see startLevel() and finishLevel().
    this.level = this.levels.current;

    const coreUrl = new URL('../audio/voice/lines.json', import.meta.url);
    const sharedBase = new URL('./voice/', import.meta.url);
    const gameBase = new URL('./', this.gameLines);
    const [coreLines, sharedLines, gameLines] = await Promise.all(
      [coreUrl, new URL('lines.json', sharedBase), this.gameLines].map((url) => fetch(url).then((response) => response.json())),
    );
    const lines = [
      ...coreLines,
      ...sharedLines.map((line) => ({ ...line, base: sharedBase })),
      ...gameLines.map((line) => ({ ...line, base: gameBase })),
    ];
    const georgian = new Map(lines.map(({ text, ka }) => [text, ka]));
    this.translate = (text) => (settings.language === 'ka' ? georgian.get(text) ?? text : text);
    opening.step('words');

    this.sound = this.createSound({ sound: settings.sound, voice: settings.voice, language: settings.language, lines });
    this.reader = new BodyReader({ size: settings.moveSize });
    this.camera = new TrackingCamera(byElementId('camera'), {
      worker: new URL('./pose.worker.js', import.meta.url),
      width: 1920,
      height: 1080,
      closeUps: (video) => this.takeCloseUp(video),
    });
    this.camera.onResult = (result) => this.onTrackerResult(result);
    this.setPlayers(1);
    this.camera.onTrackerError = (message) => console.error('Body tracking error:', message);

    this.prompt = new PromptBox((text) => this.sound.say(text, { ifQuiet: true }), this.translate);
    this.confetti = new Confetti(byElementId('confetti'));
    await document.fonts.load('700 72px Fredoka');
    await this.setUp();
    this.portraits = renderPortraits(ROSTER);
    this.demo = new MoveDemo(byElementId('coach-demo'));

    this.buildFighterGrid();
    this.wireControls();
    this.levelUi = mountLevels(this.levels, {
      language: () => settings.language,
      // What each level brings that's new, if the game says: a newAt(level) method, as in core/levels.js.
      newAt: (level) => this.newAt?.(level) ?? [],
      onChoose: (level) => {
        // In the middle of play, the game starts again at the new level when the panel is closed.
        if (this.levelUnderway) this.startAgainWanted = true;
        else this.level = level;
      },
    });
    this.chooseFighter(settings.fighter, { silent: true });

    if (new URLSearchParams(location.search).has('debug')) this.exposeForTests();
    opening.step('game');
    if (startButton) startButton.disabled = false;
    opening.done();
    document.body.dataset.ready = 'yes';
    requestAnimationFrame((now) => this.tick(now));
  }

  exposeForTests() {
    const game = this;
    window.__game = {
      game,
      reader: this.reader,
      camera: this.camera,
      sound: this.sound,
      get screen() {
        return game.screen;
      },
    };
    // Keeps a game's getters as getters, so tests read what's there now.
    if (this.debug) Object.defineProperties(window.__game, Object.getOwnPropertyDescriptors(this.debug()));
  }

  /* ---------- levels ---------- */

  /** A game calls this as it starts something new to play, and builds it for this.level. */
  startLevel() {
    this.level = this.levels.current;
    this.levelUnderway = true;
    this.levelUi.refresh();
    return this.level;
  }

  /** A game calls this at its finish. A level that's won moves on to the next one. */
  finishLevel(won = true) {
    this.levelUnderway = false;
    return this.levelUi.showResult(this.levels.complete(won, this.level));
  }

  /* ---------- controls ---------- */

  wireControls() {
    const { settings } = this;
    byElementId('problem-retry').addEventListener('click', () => this.openCameraThen(this.retryAfterProblem));
    byElementId('open-panel').addEventListener('click', () => this.openPanel());
    const panel = byElementId('panel');
    byElementId('close-panel').addEventListener('click', () => panel.close());
    panel.addEventListener('close', () => {
      this.paused = false;
      this.sound.resume();
      if (this.startAgainWanted) this.startAgain();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.sound.quiet();
      else if (!this.paused) this.sound.resume();
    });

    const choices = { moveSize: String, hands: String, language: String, ...this.choices };
    for (const [name, read] of Object.entries(choices)) {
      // A saved value from an older version may no longer be one of the choices.
      const current = document.querySelector(`input[name="${name}"][value="${settings[name]}"]`);
      if (current) current.checked = true;
      for (const input of document.querySelectorAll(`input[name="${name}"]`)) {
        input.addEventListener('change', () => this.changeSettings({ [name]: read(input.value) }));
      }
    }
    byElementId('setting-sound').checked = settings.sound;
    byElementId('setting-voice').checked = settings.voice;
    byElementId('setting-sound').addEventListener('change', (event) => this.changeSettings({ sound: event.target.checked }));
    byElementId('setting-voice').addEventListener('change', (event) => this.changeSettings({ voice: event.target.checked }));
  }

  changeSettings(change) {
    const { settings } = this;
    Object.assign(settings, change);
    if ('sound' in change || 'voice' in change) this.sound.setEnabled(settings);
    if ('language' in change) {
      this.sound.setLanguage(settings.language);
      this.prompt.clear();
    }
    if ('moveSize' in change) for (const { reader } of this.players) reader.setSize(settings.moveSize);
    this.settingChanged?.(change);
    // In the middle of a game, what doesn't go on to it at once starts it again when the panel is closed.
    if (this.levelUnderway && Object.keys(change).some((name) => !appliesAtOnce(name, this.atOnce))) this.startAgainWanted = true;
    saveSettings(settings);
  }

  /**
   * A grown-up chose another level, or changed how the game is, in the middle of it: it starts again from the
   * check that the child can be seen, so that what they chose is what's played. A game with friends isn't under
   * way in this sense, as it's on the host's level, so it's left alone. leaveRound is a game's own, for what
   * a round leaves going, such as its music.
   */
  startAgain() {
    this.startAgainWanted = false;
    if (!this.levelUnderway) return;
    this.levelUnderway = false;
    this.leaveRound?.();
    this.prompt.clear();
    this.setCount('');
    this.confetti.stop();
    this.reader.forget();
    this.openCameraThen(() => this.beginBodyCheck());
  }

  setScreen(name) {
    this.screen = name;
    document.body.dataset.screen = name;
  }

  openPanel() {
    this.paused = true;
    this.sound.quiet();
    byElementId('panel').showModal();
  }

  /* ---------- choosing a character ---------- */

  buildFighterGrid() {
    const grid = byElementId('fighter-grid');
    for (const spec of ROSTER) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'fighter-card';
      card.setAttribute('role', 'radio');
      card.dataset.fighter = spec.id;
      const picture = document.createElement('img');
      picture.src = this.portraits[spec.id];
      picture.alt = '';
      const name = document.createElement('span');
      name.textContent = spec.name;
      card.append(picture, name);
      card.addEventListener('click', () => this.chooseFighter(spec.id));
      grid.append(card);
    }
  }

  chooseFighter(id, { silent = false } = {}) {
    const spec = byId(id);
    this.chosen = spec;
    this.settings.fighter = id;
    saveSettings(this.settings);
    for (const card of document.querySelectorAll('.fighter-card')) {
      card.setAttribute('aria-checked', String(card.dataset.fighter === id));
    }
    byElementId('chosen-name').textContent = spec.name;
    byElementId('chosen-title').textContent = `${spec.species}. ${spec.title}.`;
    this.demo.setCharacter(spec);
    this.showChosen(spec, silent);
    if (!silent) {
      this.sound.unlock();
      this.sound.say(spec.shout);
    }
  }

  /* ---------- camera ---------- */

  async openCameraThen(next) {
    this.sound.unlock();
    this.setScreen('loading');
    // The bar on the card fills as the camera opens and the tracker and the sounds load.
    watchLoading(this.camera, this.sound);
    try {
      await Promise.all([this.camera.start(), this.sound.ready]);
    } catch (problem) {
      const kind = problem instanceof CameraProblem ? problem.kind : 'other';
      if (problem.cause) console.error(problem.cause);
      const [title, detail] = PROBLEM_TEXT[kind];
      byElementId('problem-title').textContent = title;
      byElementId('problem-detail').textContent = detail;
      this.retryAfterProblem = next;
      this.setScreen('problem');
      return;
    }
    document.documentElement.style.setProperty('--camera-aspect', String(this.camera.aspect));
    next();
  }

  /**
   * A hand is too small to read in a picture of a whole body, so this sends a sharper close-up
   * of one hand with each frame, taking turns, from the camera's full-size picture.
   */
  async takeCloseUp(video) {
    // With several playing, nobody's hands are read: there's only time to look closely at one child's.
    if (this.grouped) return [];
    if (!this.latestBody || !this.closeUpScreens.has(this.screen)) return [];
    const boxes = closeUpBoxes(this.latestBody, this.aspect);
    const box = boxes.find(({ side }) => side === this.nextHand) ?? boxes[0];
    this.nextHand = this.nextHand === 'left' ? 'right' : 'left';
    if (!box) return [];
    const { videoWidth: width, videoHeight: height } = video;
    const bitmap = await createImageBitmap(
      video,
      Math.round(box.x * width),
      Math.round(box.y * height),
      Math.max(1, Math.round(box.width * width)),
      Math.max(1, Math.round(box.height * height)),
      { resizeWidth: 256, resizeHeight: 256, resizeQuality: 'high' },
    );
    return [{ side: box.side, box, bitmap }];
  }

  /* ---------- several people in front of one camera ---------- */

  /** Whether more than one is playing in front of this camera. */
  get grouped() {
    return this.players.length > 1;
  }

  /**
   * How many are playing in front of this camera: 1, as every game comes, or up to four in a game that can be
   * played by several. Each has their own reader of moves, and the first is the one a game for one child uses.
   */
  setPlayers(count) {
    const wanted = Math.min(MOST_PEOPLE, Math.max(1, Math.round(Number(count)) || 1));
    this.players = Array.from({ length: wanted }, (_, index) => this.players[index] ?? { index, reader: index === 0 ? this.reader : new BodyReader({ size: this.settings.moveSize }), body: null });
    this.people = new People(wanted);
    this.camera.setPeople(wanted);
    document.body.dataset.players = String(wanted);
  }

  /** The characters of everyone playing: the one chosen, and for the others the ones after it in the roster. */
  get cast() {
    const first = Math.max(0, ROSTER.indexOf(this.chosen));
    return this.players.map((_, index) => ROSTER[(first + index) % ROSTER.length]);
  }

  /**
   * A game that several can play has a row of numbers on its chooser, groupChoice() below, for how many are
   * playing. It always starts at one: a grown-up standing in the picture isn't taken for a player unless someone
   * says so. onChange hears the number each time it's changed.
   */
  watchGroupChoice(onChange = () => {}) {
    for (const input of document.querySelectorAll('input[name="group-size"]')) {
      input.checked = Number(input.value) === this.players.length;
      input.addEventListener('change', () => {
        if (!input.checked) return;
        this.setPlayers(Number(input.value));
        onChange(this.players.length);
      });
    }
  }

  /**
   * The tracker has looked, with several playing: each body goes to the player it belongs to, each player's
   * moves are read by their own reader, and the game hears of each player in turn.
   */
  onGroupResult(bodies, now, aspect) {
    const mine = this.people.assign(bodies, now);
    this.latestBody = mine[0];
    const moves = this.players.map((player, index) => {
      // The tracker loses one of several people for a look now and then, the more of them the more often. A
      // player it has only just lost is left as they were, so a jump they're in the middle of isn't cut short.
      if (!mine[index] && now - player.reader.lastSeenAt < MISSED_LOOKS_SECONDS) return [];
      player.body = mine[index];
      return player.reader.update(player.body, now, aspect);
    });
    const first = moves.flat()[0];
    if (first) this.lastSeen = { move: first.move, at: performance.now() };
    this.drawSkeleton(mine);
    if (this.paused || this.bodyLost()) return;
    this.players.forEach((player, index) => this.onPlayerMoves(player, moves[index], now));
  }

  /**
   * What one player did, each time the tracker has looked, with several playing. A game that several can play
   * says what to do with it. Otherwise the first player's moves are the child's.
   */
  onPlayerMoves(player, moves, now) {
    if (player.index === 0) this.onMoves(moves, now);
  }

  onTrackerResult({ body, bodies, hands = [], aspect }) {
    const now = performance.now() / 1000;
    this.aspect = aspect;
    if (this.grouped) {
      this.onGroupResult(bodies ?? (body ? [body] : []), now, aspect);
      return;
    }
    this.latestBody = body;
    this.players[0].body = body;
    for (const reading of hands) this.reader.hands.add(reading, now);
    const moves = this.reader.update(body, now, aspect);
    if (moves.length) this.lastSeen = { move: moves[0].move, at: performance.now() };
    this.drawSkeleton(body);
    if (!this.paused && !this.bodyLost()) this.onMoves(moves, now);
  }

  /**
   * Nobody in the picture for a little while, or a tracker that has stopped answering. With several playing,
   * it's none of them: one who steps out leaves the others playing.
   */
  bodyLost() {
    const seenAt = Math.max(...this.players.map(({ reader }) => reader.lastSeenAt));
    return performance.now() / 1000 - seenAt > LOST_BODY_SECONDS;
  }

  /** The stick figure over the camera's picture: the child's, or each player's in their own colour. */
  drawSkeleton(seen) {
    const bodies = Array.isArray(seen) ? seen : [seen];
    const canvas = byElementId('skeleton');
    const { clientWidth: width, clientHeight: height } = canvas;
    if (!width || !height) return;
    const ratio = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    bodies.forEach((body, player) => {
      if (!body) return;
      const at = (index) => [(1 - body.image[index].x) * width, body.image[index].y * height];
      for (const [colour, lineWidth] of [['rgba(18,48,77,0.6)', 5], [PLAYER_COLOURS[player % PLAYER_COLOURS.length], 3]]) {
        ctx.strokeStyle = colour;
        ctx.lineWidth = lineWidth;
        for (const line of SKELETON_LINES) {
          ctx.beginPath();
          line.forEach((index, order) => (order ? ctx.lineTo(...at(index)) : ctx.moveTo(...at(index))));
          ctx.stroke();
        }
      }
      ctx.fillStyle = '#ffffff';
      const [noseX, noseY] = at(0);
      ctx.beginPath();
      ctx.arc(noseX, noseY, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  /* ---------- checking the camera can see the child ---------- */

  beginBodyCheck(then = 'start') {
    this.afterCheck = then;
    this.checkHeld = 0;
    // With several playing, who is who is settled afresh: left to right, as they stand now.
    this.people.forget();
    this.setScreen('bodycheck');
    if (then === 'start' && !this.upperBodyOnly) this.sound.say(BODY_SAY.makeSpace);
    byElementId('check-progress-fill').style.width = '0%';
  }

  /**
   * What's wrong with the view, if anything. With several playing, it's that not all of them are in the picture
   * yet, or whatever is wrong for the first of them who isn't standing where the camera sees them well.
   */
  checkProblem() {
    const options = { upperBodyOnly: this.upperBodyOnly, armsOut: this.armsOut };
    if (!this.grouped) return viewProblem(this.latestBody, this.aspect, options);
    if (!this.people.placed || this.players.some(({ body }) => !body)) return 'side-by-side';
    for (const { body } of this.players) {
      const problem = viewProblem(body, this.aspect, { ...options, group: true });
      if (problem) return problem;
    }
    return null;
  }

  updateBodyCheck(dt, now) {
    const problem = this.checkProblem();
    byElementId('camera-frame').dataset.ready = problem ? 'not-open' : 'open';
    this.checkHeld = problem ? 0 : this.checkHeld + dt;
    byElementId('check-progress-fill').style.width = `${Math.min(100, (this.checkHeld / CHECK_SECONDS) * 100)}%`;
    this.prompt.show(problem ? PROBLEM_PROMPTS[problem] : null, now);

    if (this.checkHeld < CHECK_SECONDS) return;
    for (const { reader, body } of this.players) reader.setStanding(body, this.aspect);
    this.prompt.clear();
    this.sound.say(BODY_SAY.canSeeYou);
    this.afterBodyCheck(this.afterCheck);
  }

  /* ---------- things most screens want ---------- */

  setCount(text) {
    const count = byElementId('count');
    if (count.textContent === text) return;
    count.textContent = text;
    // Restart the pop animation for each new word.
    count.classList.remove('pop');
    void count.offsetWidth;
    if (text) count.classList.add('pop');
  }

  /** A word flying up from a place on the screen, given as shares of its width and height. */
  callout(text, { kind = '', x, y }) {
    // Big words all land in the same spot, so a new one takes over from the last.
    if (kind === 'is-big') this.bigWord?.remove();
    const word = document.createElement('span');
    if (kind === 'is-big') this.bigWord = word;
    word.className = `callout ${kind}`;
    word.textContent = text;
    // Quick moves would otherwise stack their words exactly on top of each other.
    const inPlace = kind === 'is-big' || kind === 'is-combo';
    const spreadX = inPlace ? 0 : (Math.random() - 0.5) * 0.09;
    const spreadY = inPlace ? 0 : (Math.random() - 0.5) * 0.07;
    word.style.left = `${Math.round((x + spreadX) * 1000) / 10}%`;
    word.style.top = `${Math.round((y + spreadY) * 1000) / 10}%`;
    word.addEventListener('animationend', () => word.remove());
    byElementId('callouts').append(word);
    // In case a hidden page never runs the animation.
    setTimeout(() => word.remove(), 2500);
  }

  /** Says what to do, with the child's character showing it. See demos.js for the moves. */
  showCoach(name, text, { side = 'right' } = {}) {
    this.demo.show(name, side);
    byElementId('coach-text').textContent = text;
    this.setCoachEffort(0);
    byElementId('coach').classList.add('is-visible');
  }

  hideCoach() {
    this.demo.hide();
    byElementId('coach').classList.remove('is-visible');
  }

  /** The bar under the coach, which fills as the child gets close to what's being asked for. */
  setCoachEffort(share) {
    const shown = Math.round(share * 100);
    if (shown === this.coachEffort) return;
    this.coachEffort = shown;
    byElementId('coach-effort-fill').style.width = `${shown}%`;
  }

  /** The move was seen, right now, and here's what it was. */
  showSeen(words, { x = 0.5, y = 0.62 } = {}) {
    const [english, georgian] = words;
    this.callout(`✓ ${this.settings.language === 'ka' ? georgian : english}`, { kind: 'is-seen', x, y });
    const frame = byElementId('camera-frame');
    frame.classList.add('has-seen');
    clearTimeout(this.seenTimer);
    this.seenTimer = setTimeout(() => frame.classList.remove('has-seen'), SEEN_SHOWN_MS);
    this.sound.seen();
  }

  /** What the panel says the camera can see, so a grown-up can tell if moves are being read. */
  showLiveReading() {
    const now = performance.now();
    if (now - (this.panelAt ?? 0) < PANEL_READING_MS) return;
    this.panelAt = now;
    const { reader, lastSeen } = this;
    const seeing = !reader.seen ? 'nobody' : reader.squatting ? 'a squat' : reader.inAir ? 'a jump' : 'someone standing';
    const last = lastSeen ? `${lastSeen.move}, ${Math.round((now - lastSeen.at) / 1000)} seconds ago` : 'none yet';
    const percent = (value) => `${Math.round(value * 100)}%`;
    byElementId('live-reading').textContent = `The camera sees ${seeing}. The last move it read was: ${last}. Right now a jump needs the hips to rise ${percent(reader.jumpNeeded)} of leg length, and a squat needs them to sink ${percent(reader.squatNeeded)}.`;
  }

  /** A row of cards with a picture, a number and a word, for what's been done so far. */
  fillTallyCards(parent, entries) {
    parent.replaceChildren();
    for (const { name, icon, label, value } of entries) {
      const card = document.createElement('div');
      card.className = 'tally-card';
      card.dataset.exercise = name;
      card.innerHTML = ICONS[icon];
      const count = document.createElement('strong');
      count.textContent = String(value);
      const words = document.createElement('span');
      words.textContent = label;
      card.append(count, words);
      parent.append(card);
    }
  }

  /* ---------- every frame ---------- */

  tick(now) {
    requestAnimationFrame((next) => this.tick(next));
    if (now - this.lastFrameTime < MIN_FRAME_MS) return;
    const dt = Math.min(0.05, Math.max(0, now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    if (this.camera.running && performance.now() - this.camera.lastResultAt > TRACKER_STALL_MS) {
      this.latestBody = null;
      for (const player of this.players) {
        player.body = null;
        player.reader.update(null, performance.now() / 1000, this.aspect);
      }
    }

    if (!this.paused) {
      if (this.screen === 'bodycheck') this.updateBodyCheck(dt, now);
      else this.frame(dt, now);
      this.stage.update(dt);
      this.demo.update(dt);
    } else {
      this.showLiveReading();
    }
    this.stage.render();
  }
}
