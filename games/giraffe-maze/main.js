// Giraffe's Maze: Giraffe's friends are lost in a garden maze, and the child leads him to each one with an open hand.
// The character walks along the paths towards the open hand, and waits while the hand is closed or can't be seen.
// Each friend found follows along behind, into the next maze. With friends on their own computers it's the way out
// of the same mazes instead: together, as it comes, whoever finds it takes everyone on to the next maze, and
// against each other it's a race, the first out of the last one winning. The rules are in rules.js and play.js, the maze is
// drawn by view.js, and the characters' pictures come from walkers.js.
import { renderPortraits } from '../../core/body/portraits.js';
import { byId as characterWithId, ROSTER } from '../../core/body/roster.js';
import { Track } from '../../core/friends.js';
import { FriendsPanel, time } from '../../core/friends-ui.js';
import { Glove } from '../../core/glove.js';
import { GameSession, SPOKEN } from '../../core/session.js';
import { DID_IT_TOGETHER, Sound } from '../../core/sound.js';
import { STORY_BOX, StoryBox } from '../../core/story.js';
import { FOLLOW_SPACING, MazeRun } from './play.js';
import {
  castFor, facingOf, FOUND_SECONDS, LABELS, MAZE_COUNTS, mazeNewAt, modeWord, NEWS, newSeedWord, REACH, readMode,
  SIZE_NAMES, SLIDE_SECONDS, SUNS, Trail, WAYS,
} from './rules.js';
import { MazeView } from './view.js';
import { renderWalkers } from './walkers.js';

const byId = (id) => document.getElementById(id);
const HINT = 'Lead the way with your open hand!';
const FINISH = 'Everyone is found!';
// On the card when the sun sets before a friend is found. It's only shown, not said.
const SUNSET = 'The sun went down before everyone was found!';
const TRY_AGAIN = 'Try again';
const RACE_FINISH = 'You did it! Great racing!'; // The end of a race with friends: one of the lines every game shares.
const PRAISE = ['Nice one!', 'Great job!', 'Way to go!'];
// What each friend calls out as their maze begins, in their own voice: see audio/voice/lines.json.
const CALLS = {
  giraffe: 'Help! I’m lost in the maze!',
  truffle: 'Oink! I’m lost! Come and find me!',
  kit: 'Kit here! Can you find me?',
  mochi: 'Hop, hop! I’m lost in the hedges!',
  widget: 'Beep! Widget is lost! Find me!',
  frost: 'Brrr! I’m lost! Please find me!',
  bramble: 'Over here! Follow the path to me!',
  nova: 'Meow! I’m over here! Come and find me!',
  cinder: 'Cinder here! Which way is out?',
  tur: 'I’m lost! Please come quickly!',
};
const HINT_SECONDS = 10;
const ASK_OPEN_AFTER = 2.5; // Seconds of a closed hand before asking for it to open.
const RESTING_AFTER = 15; // And before saying that resting is fine.
const FILM_SECONDS = 25;
const BLOCKED_HINT_AFTER = 1.5; // Seconds held up by something in the way, before saying what to do.
const FILM_CELLS = 3; // The film shows until the character has walked this far.
const STEP_EVERY = 0.42; // Cells between footsteps.
const PRIZE_MARKS = { butterfly: '🦋', gem: '💎', crown: '👑' };
const PRIZE_LANDS_AFTER = 800;
// Which label goes with each thing a level brings, so the newest is named first.
const LABEL_FOR = { butterflies: 'butterfly', gate: 'key', shoes: 'shoes', sheep: 'sheep', gems: 'gem', bird: 'bird', bush: 'bush', magnet: 'magnet', chest: 'chest' };

// Racing friends, each on their own computer. See core/friends-ui.js for what each of these is.
const MAZE_WORDS = {
  toggle: 'Play with friends',
  make: 'Make a game',
  codeLabel: 'A friend’s game code',
  codeName: 'Game code',
  how: 'Tell your friends the code. Then you all press <b>Into the maze!</b> It’s a race: the first one out of the last maze wins.',
  // Together or against each other, as whoever made the game chooses: see teams in core/friends-ui.js.
  together: 'Together',
  against: 'Against each other',
  howTogether: 'Tell your friends the code. Then you all press <b>Into the maze!</b> Look for the way out together: whoever finds it takes everyone on to the next maze.',
  teamTitle: 'You found the way out together!',
  leave: 'Leave this game',
  privacy: 'Only your name, who you play as, whether you chose together or against each other, where your character and glove are in the maze, your time and your fruit go to your friends. The camera picture stays on this computer.',
  alone: 'Play on your own',
  full: 'That game already has 4 players.',
  lost: 'Can’t reach the game. Check the internet, then try again.',
  left: 'You’ve left the game.',
  badCode: 'A game code is 3 letters and numbers.',
  busy: 'Playing',
  still: 'still playing',
};
// A friend between what their game sends: where their character and glove are, and the glove's points, which go
// smoothly from one to the next. Which maze, which way they face, and whether they're walking change half way.
const WALKER_TRACK = { lerp: ['x', 'y', 'gx', 'gy'], lists: ['p'], steps: ['z', 'f', 'm', 'v', 'o'] };
const FRIEND_GLOVE = { fill: '#e3e8ee', ink: '#9aa8b6' };
const FADE_OUT_CELLS = 1; // Walking out of a maze in a race, a character fades away over its last cell.
const round2 = (value) => Math.round(value * 100) / 100;
const ids = ROSTER.map(({ id }) => id);
/** How much of a character still shows, at x in a maze cols across: all of it inside, fading out past the way out. */
const showing = (x, cols) => Math.min(1, Math.max(0, 1 - (x - cols) / FADE_OUT_CELLS));

/** A friend's character and glove in this child's maze, following what their game sends. */
const newWalker = (friend) => ({ id: friend.id, spec: friend.spec, name: friend.spec.name, track: new Track(WALKER_TRACK), trail: new Trail(), glove: new Glove('right'), fade: 0, z: -1, walked: 0 });

class MazeGame {
  chimeOnOpen = false; // The hand opens and closes all the time here, so a chime would be noise.

  constructor(session) {
    this.session = session;
    const { settings } = session;
    this.art = {};
    this.gloves = { left: new Glove('left'), right: new Glove('right') };
    this.gloveOffset = { x: 0, y: 0 };
    this.view = new MazeView(byId('game'), {
      language: () => settings.language,
      top: () => this.band(),
      prizeTarget: () => {
        const box = byId('chip-prizes')?.closest('.chip')?.getBoundingClientRect();
        return box?.width ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : { x: 120, y: 50 };
      },
    });
    this.story = new StoryBox(session);
    this.events = this.runEvents();
    this.seedWord = newSeedWord();
    this.friendWalkers = new Map();
    this.mode = 'solo';
    this.team = false; // With friends, together: see prepare().
    this.carriedBy = ''; // Together, the friend who found the way out of the maze just left.
    this.resetCounts();
    byId('finish-hero')?.closest('.finish-hero')?.insertAdjacentHTML('afterend', '<p id="finish-team" class="finish-team" hidden></p><p id="finish-found" class="finish-found"></p><p id="finish-prizes" class="finish-prizes"></p>');
    this.friends = new FriendsPanel({
      game: 'giraffe-maze',
      linkKey: 'maze',
      words: MAZE_WORDS,
      hello: () => ({ driver: this.myCharacter().id, level: session.levels.current, length: this.mazeCount(), mode: modeWord(this.size(), this.seedWord) }),
      screen: () => session.screen,
      portraits: () => session.portraits,
      onMove: (id, message) => this.fromFriend(id, message),
      onGone: (friend) => this.friendGone(friend),
      onBack: (friend) => this.friendBack(friend),
      // A race: whoever got out of the last maze first comes first, by their time, as in High Five Racers. Together,
      // nobody is placed, and each one's line is the fruit they ate on the way.
      resultText: ({ ms, dropped }) => (this.team ? `${dropped} fruit` : time(ms)),
      titles: { first: 'You were first out!', other: 'You made it out!' },
      // With friends, together or against each other: the grown-ups' choice, which the friends box can change too.
      teams: {
        get: () => (session.settings.mazeFriends === 'against' ? 'against' : 'together'),
        set: (choice) => this.chooseTeams(choice),
      },
      startAfter: byId('start'),
      waitingBefore: byId('screen-finish'),
      resultsAfter: document.querySelector('#screen-finish .finish-hero'),
      finishTitle: document.querySelector('#screen-finish h2'),
    });
    // Together, the finish card's line about the fruit fills in whenever the list of who did what does.
    const showResults = this.friends.showResults.bind(this.friends);
    this.friends.showResults = () => {
      showResults();
      this.showTeamFruit();
    };
    this.run = this.soloRun(session.level);
    this.artFor([this.myCharacter().id, ...this.run.cast.flat()]);
    this.view.setLayout(this.run.layout);
    this.showFound();
    const game = this;
    this.debug = {
      view: this.view,
      gloves: this.gloves,
      get run() {
        return game.run;
      },
      get game() {
        return game;
      },
    };
  }

  resetCounts() {
    this.restFor = 0;
    this.blockedFor = 0;
    this.praised = 0;
    this.stepIn = STEP_EVERY;
    this.lastWalked = 0;
    this.filmShown = false;
    this.lastOpen = false;
  }

  /* ---------- the grown-ups' choices ---------- */

  size() {
    const { mazeSize } = this.session.settings;
    return SIZE_NAMES.includes(mazeSize) ? mazeSize : 'hard';
  }

  /** Whether the sun goes down over each maze, or it's the gentle maze, as a grown-up chose. */
  sun() {
    return SUNS.includes(this.session.settings.mazeSun) ? this.session.settings.mazeSun : 'sets';
  }

  mazeCount() {
    const count = Number(this.session.settings.mazes);
    return MAZE_COUNTS.includes(count) ? count : 3;
  }

  ways() {
    return WAYS.includes(this.session.settings.mazeWays) ? this.session.settings.mazeWays : 'lead';
  }

  /** The child's own character: whoever they chose in the other games, or Giraffe. */
  myCharacter() {
    return characterWithId(this.session.settings.fighter) ?? ROSTER[0];
  }

  /** The band at the top of the screen, for the mirror, the meter and what's been found, which the maze stays under. */
  band() {
    const small = Math.min(230, Math.max(140, window.innerWidth * 0.15));
    const aspect = this.session.camera?.aspect || 16 / 9;
    return 12 + small / aspect + 12;
  }

  /** Pictures of these characters, drawn the first time each is needed. */
  artFor(wanted) {
    const needed = [...new Set(wanted)].filter((id) => !(id in this.art)).map((id) => characterWithId(id)).filter(Boolean);
    if (!needed.length) return;
    try {
      Object.assign(this.art, renderWalkers(needed));
    } catch (error) {
      // Without the pictures the maze still works: each character is a plain round token.
      console.warn('Could not draw the characters:', error);
      for (const spec of needed) this.art[spec.id] = null;
    }
  }

  newAt(level) {
    return mazeNewAt(level);
  }

  holdStart(go) {
    // Each game with friends is a new maze: the host's game tells everyone a new seed as it gets ready.
    this.seedWord = newSeedWord();
    return this.friends.holdStart(go);
  }

  setHands() {
    for (const glove of Object.values(this.gloves)) glove.hide();
  }

  settingChanged(change) {
    const { screen } = this.session;
    const between = screen !== 'playing' && screen !== 'countdown';
    // A new character, size or number of friends to find starts with the next game, and the title shows it now.
    if (between && ('fighter' in change || 'mazeSize' in change || 'mazes' in change || 'mazeSun' in change)) {
      this.run = this.soloRun(this.session.level);
      this.artFor([this.myCharacter().id, ...this.run.cast.flat()]);
      this.view.setLayout(this.run.layout);
      this.showFound();
    }
    if (('fighter' in change || 'mazeSize' in change || 'mazes' in change || 'mazeFriends' in change) && this.friends.room.inRoom) this.friends.room.tell(this.friends.hello());
    if ('mazeFriends' in change) this.friends.showTeams();
  }

  /** Together or against each other, chosen in the friends box: kept with the grown-ups' settings, and shown there. */
  chooseTeams(choice) {
    this.session.changeSettings({ mazeFriends: choice });
    const input = document.querySelector(`input[name="mazeFriends"][value="${choice}"]`);
    if (input) input.checked = true;
  }

  /** How long since "GO!", by the clock on the wall, for friends' games. */
  get sinceGo() {
    return performance.now() - this.goAt;
  }

  /* ---------- a new game ---------- */

  /** A game on their own: a new maze for each friend to find, each with a friend who isn't the child's own character. */
  soloRun(level) {
    const cast = castFor(ids, this.myCharacter().id, this.mazeCount(), level).map((id) => [id]);
    return new MazeRun({ seed: newSeedWord(), size: this.size(), level, cast, ways: this.ways(), sun: this.sun(), events: this.events });
  }

  prepare(level) {
    const friendly = this.friends.current;
    this.mode = friendly ? 'friends' : 'solo';
    document.body.toggleAttribute('data-friends-race', Boolean(friendly));
    this.friendWalkers = new Map();
    this.outMs = null; // In a race, how long after "GO!" the child got out of the last maze.
    // Together, everyone looks for the way out of each maze, and whoever finds it takes the others on: see followTeam.
    this.team = Boolean(friendly?.team);
    this.carriedBy = '';
    document.body.toggleAttribute('data-friends-team', this.team);
    this.session.finishLine = this.team ? DID_IT_TOGETHER : friendly ? RACE_FINISH : FINISH;
    if (friendly) {
      // A race: everyone makes the same mazes from the host's seed, at the host's size, level and number of mazes,
      // with nobody lost in them, and the first out of the last one wins. Each has all the fruit in their own.
      const { size, seed } = readMode(friendly.mode);
      const mazes = MAZE_COUNTS.includes(friendly.length) ? friendly.length : 3;
      this.run = new MazeRun({ seed, size, level: friendly.level, mazes, race: true, ways: this.ways(), events: this.events });
      for (const friend of friendly.friends) this.friendWalkers.set(friend.id, newWalker(friend));
      this.artFor([this.myCharacter().id, ...friendly.friends.map((friend) => friend.spec.id)]);
    } else {
      this.run = this.soloRun(level);
      this.artFor([this.myCharacter().id, ...this.run.cast.flat()]);
    }
    this.view.reset();
    this.view.setLayout(this.run.layout);
    this.resetCounts();
    this.story.hide();
    this.showFound();
    this.showFruit();
    this.showPrizes();
    this.showRace();
    this.session.sound.lost = false;
    byId('chip-sun-box').hidden = !this.run.timed;
    this.showSun();
    // Prizes only come from level 2, on the child's own.
    document.body.dataset.prizes = !friendly && level >= 2 ? 'on' : 'off';
  }

  begin() {
    this.goAt = performance.now();
    this.run.begin();
    this.session.sound.startLoop('birds', 0.14);
  }

  /** What the rules say happens, heard and seen. */
  runEvents() {
    const sound = () => this.session.sound;
    const view = () => this.view;
    return {
      onMazeStart: (index, layout) => {
        this.view.setLayout(layout);
        // On their own, the friend lost in this maze calls out, and the new things in it are named. In a race, the
        // way out is, as it starts.
        if (this.mode === 'solo') {
          const [lost] = layout.lost;
          if (lost && CALLS[lost.who]) this.story.say(lost.who, CALLS[lost.who]);
          this.nameNewThings(layout);
        } else if (index === 0) {
          this.view.introduce('wayOut', () => (this.run.phase === 'walking' ? this.view.flagAt(layout) : null));
        }
        this.showFound();
      },
      onEat: (item) => {
        sound().play('crunch', { gain: 0.45, rate: 0.95 + Math.random() * 0.15 });
        view().sparkle(item.pull?.x ?? item.x, item.pull?.y ?? item.y, '#ffffff');
        this.showFruit();
      },
      onKey: (item) => {
        sound().play('sparkle', { gain: 0.3 });
        view().sparkle(item.x, item.y);
      },
      onLocked: (blocker) => view().introduce('locked', () => (blocker.open ? null : { x: blocker.x, y: blocker.y })),
      onUnblock: (blocker) => {
        if (blocker.kind === 'gate') sound().play('unlock', { gain: 0.5 });
        else if (blocker.kind === 'sheep') {
          sound().play('boing', { gain: 0.32, rate: 1.1 });
          view().puff(blocker.x, blocker.y, '#ffffff');
        } else {
          sound().play('rustle', { gain: 0.5 });
          view().puff(blocker.x, blocker.y, '#5cb85c', true);
        }
      },
      onPower: (kind) => {
        sound().handsOpen();
        view().introduce(kind, () => (this.run.power?.kind === kind ? { ...this.run.position } : null));
      },
      onBird: () => {
        sound().play('whoosh', { gain: 0.3, rate: 1.3 });
        view().introduce('bird', () => this.run.birdAt());
      },
      onChest: (item) => {
        sound().play('unlock', { gain: 0.4, rate: 1.2 });
        view().sparkle(item.x, item.y);
      },
      onPrize: (kind, at) => {
        sound().play('sparkle', { gain: 0.3, rate: 1 + Math.random() * 0.1 });
        view().prize(kind, at.x, at.y);
        setTimeout(() => this.showPrizes(true), PRIZE_LANDS_AFTER);
      },
      onButterfly: (fly) => view().introduce('butterfly', () => (fly.caught || fly.leaving ? null : { x: fly.x, y: fly.y - 0.4 })),
      onFound: (lost) => {
        sound().play('found', { gain: 0.55 });
        sound().play('cheer', { gain: 0.16 });
        view().hearts(lost.x, lost.y);
        this.story.hide();
        this.praise();
        this.showFound();
      },
      // In a race, out of a maze: a cheer, and on the last one the time, which is the child's race time.
      onOut: (index, last) => {
        if (last) this.outMs = this.sinceGo;
        sound().play('found', { gain: 0.55 });
        sound().play('cheer', { gain: 0.16 });
        const way = this.run.layout.maze.centre(this.run.layout.goal);
        view().sparkle(way.x + 0.5, way.y);
        if (!last) this.praise();
        this.showRace();
      },
      // Together, a friend found the way out of this maze: a cheer here too, and on the last one the team's time.
      onCarried: (index, last) => {
        if (last) this.outMs = this.sinceGo;
        sound().play('found', { gain: 0.55 });
        sound().play('cheer', { gain: 0.16 });
        const way = this.run.layout.maze.centre(this.run.layout.goal);
        view().sparkle(way.x + 0.5, way.y);
        this.showRace();
      },
      onSlide: () => {
        sound().play('whoosh', { gain: 0.25, rate: 0.9 });
      },
      // The sun has set before the friend was found: a soft sound, and the game is over a moment later.
      onSunset: () => {
        sound().play('whoosh', { gain: 0.2, rate: 0.7 });
        this.story.hide();
        this.showSun();
      },
    };
  }

  /** The newest thing this level brings is named first, then whatever else is in the maze, each the first time. */
  nameNewThings(layout) {
    const { view } = this;
    const newest = (NEWS[this.run.level] ?? []).map(({ key }) => LABEL_FOR[key]);
    const named = [];
    for (const item of layout.items) {
      if (['key', 'shoes', 'gem', 'bird', 'magnet', 'chest'].includes(item.kind)) {
        named.push([item.kind, () => (item.gone || item.opened ? null : { x: item.x, y: item.y - 0.2 })]);
      }
    }
    for (const blocker of layout.blockers) {
      if (blocker.kind !== 'gate') named.push([blocker.kind, () => (blocker.open ? null : { x: blocker.x, y: blocker.y })]);
    }
    named.sort(([a], [b]) => Number(newest.includes(b)) - Number(newest.includes(a)));
    for (const [key, target] of named) view.introduce(key, target);
  }

  /** Praise now and then, never over anything else being said. */
  praise() {
    if (this.praised % 2 === 0) this.session.sound.say(PRAISE[Math.floor(this.praised / 2) % PRAISE.length], { ifQuiet: true });
    this.praised += 1;
  }

  /* ---------- each frame ---------- */

  update(dt, snapshot) {
    this.followHand(dt, snapshot);
    const input = this.input(snapshot);
    this.lastOpen = input.open;
    this.run.update(dt, input);
    if (this.mode === 'friends') {
      this.friends.sendMove('walker', this.walkerState(input), this.sinceGo);
      this.updateFriends(dt);
      if (this.team) this.followTeam();
      this.showRace();
    }
    this.view.update(dt);
    this.restFor = input.open ? 0 : this.restFor + dt;
    this.blockedFor = this.run.waitingAt ? this.blockedFor + dt : 0;
    this.showFilm();
    this.footsteps();
    this.showSun();
    if (this.run.over && this.session.screen === 'playing') this.end();
  }

  /** The game is over. One the sun set on is told kindly, with no party, and Try again on the big button. */
  end() {
    const { session, run } = this;
    session.sound.lost = run.lost;
    session.finish();
    // After the card is filled in, which puts back the usual title.
    if (this.mode === 'solo') document.querySelector('#screen-finish h2').textContent = run.lost ? SUNSET : FINISH;
    if (run.lost) {
      session.hud.hideSummary();
      byId('play-again').textContent = TRY_AGAIN;
    }
  }

  /** How much of the sun's time is left for this maze, as a bar that goes down. */
  showSun() {
    const { sun } = this.run;
    const share = sun ? sun.left / sun.total : 1;
    const shown = Math.round(share * 200) / 2;
    if (this.sunShown === shown) return;
    this.sunShown = shown;
    byId('sun-left').style.width = `${shown}%`;
    byId('chip-sun-box').classList.toggle('is-low', share < 0.25);
  }

  /** The glove follows the hand in play over the maze. Reach help makes it go further than the hand does. */
  followHand(dt, snapshot) {
    const { area, palmSize } = this.view;
    const gain = REACH[this.session.settings.mazeReach] ?? REACH.little;
    const width = area.width * gain;
    const height = area.height * gain;
    this.gloveOffset = { x: area.left - (width - area.width) / 2, y: area.top - (height - area.height) / 2 };
    for (const [hand, glove] of Object.entries(this.gloves)) {
      if (hand !== snapshot.side) {
        glove.hide();
        continue;
      }
      glove.follow(snapshot[hand], dt, { aspect: this.session.camera.aspect, palmSize, width, height });
    }
  }

  /** Where the glove is in the maze, in cells, or null when it can't be seen. */
  gloveInMaze(side = this.session.settings.hands) {
    const glove = this.gloves[side];
    if (!glove?.visible) return null;
    return this.view.fromScreen(glove.x + this.gloveOffset.x, glove.y + this.gloveOffset.y);
  }

  /** What the rules are given each frame. A hand that's missing or unsure is never open. */
  input(snapshot) {
    const glove = this.gloves[snapshot.side];
    const at = this.gloveInMaze(snapshot.side);
    const gain = REACH[this.session.settings.mazeReach] ?? REACH.little;
    return {
      target: at,
      glove: at,
      open: Boolean(at && snapshot.handOpen === true),
      gloveSpeed: glove.visible ? (glove.speed * this.view.area.height * gain) / this.view.cell : 0,
    };
  }

  /** A soft footstep now and then while the character walks. */
  footsteps() {
    const walked = this.run.stats.walked;
    this.stepIn -= walked - this.lastWalked;
    this.lastWalked = walked;
    if (this.stepIn > 0) return;
    this.stepIn = STEP_EVERY;
    this.session.sound.play(this.stepOther ? 'step2' : 'step1', { gain: 0.12, rate: 1.05 + Math.random() * 0.1 });
    this.stepOther = !this.stepOther;
  }

  /** The little film of what to do, until the character has walked a few cells. */
  showFilm() {
    const wanted = this.run.stats.walked < FILM_CELLS && this.session.playSeconds < FILM_SECONDS;
    if (wanted !== this.filmShown) {
      this.filmShown = wanted;
      document.body.dataset.film = wanted ? 'on' : 'off';
    }
  }

  idle(dt, snapshot) {
    const counting = this.session.screen === 'countdown';
    if (this.filmShown) {
      this.filmShown = false;
      document.body.dataset.film = 'off';
    }
    // During the countdown the glove comes out, so the child can find their hand.
    if (counting) this.followHand(dt, snapshot);
    else for (const glove of Object.values(this.gloves)) glove.hide();
    this.view.update(dt);
  }

  render() {
    this.view.render(this.model());
  }

  /* ---------- with friends ---------- */

  /** Where the child's character and glove are, for friends' games: in cells, and the glove's points in palms. */
  walkerState(input) {
    const { run } = this;
    const at = run.position;
    const glove = this.gloves[this.session.settings.hands];
    const palm = this.view.palmSize;
    return {
      z: run.index,
      x: round2(at.x),
      y: round2(at.y),
      f: run.walker.facing,
      m: run.moving ? 1 : 0,
      v: input.glove ? 1 : 0,
      o: input.open ? 1 : 0,
      gx: round2(input.glove?.x ?? 0),
      gy: round2(input.glove?.y ?? 0),
      p: glove.visible ? glove.points.flatMap(({ x, y }) => [round2(x / palm), round2(y / palm)]) : [],
    };
  }

  /** Something from a friend's game: where their character is, in whichever maze they've got to. */
  fromFriend(id, message) {
    if (message.t !== 'walker' || this.session.screen !== 'playing') return;
    this.friendWalkers.get(id)?.track.push(message, performance.now());
  }

  friendGone(friend) {
    this.friendWalkers.delete(friend.id);
    this.showRace();
  }

  /**
   * A friend who had gone is here again in the same game, as after a connection lost for longer than a moment:
   * their character is back, wherever they've got to, and together they take everyone on again and are taken.
   */
  friendBack(friend) {
    if (!this.friends.current || this.friendWalkers.has(friend.id)) return;
    this.friendWalkers.set(friend.id, newWalker(friend));
    this.showRace();
  }

  /** Together: the mazes everyone got out of and the fruit they ate on the way, on the finish card. */
  showTeamFruit() {
    const line = byId('finish-team');
    if (!line) return;
    const together = Boolean(this.team && this.friends.current);
    line.hidden = !together;
    if (!together) return;
    const you = this.friends.room.you;
    let fruit = this.run.stats.fruit;
    for (const [id, result] of this.friends.results) if (id !== you) fruit += result.dropped;
    const { mazes } = this.run;
    line.textContent = `Together you got out of ${mazes} ${mazes === 1 ? 'maze' : 'mazes'} and ate ${fruit} fruit.`;
  }

  /**
   * Together: once a friend is out of the maze this child is still walking, this child's character goes on to the
   * next with them. Who it was is said on the screen while it does.
   */
  followTeam() {
    const { run } = this;
    if (run.phase !== 'walking') return;
    const finder = this.friends.current?.friends.find((friend) => !friend.gone && this.mazesOut(friend.id) > run.index);
    if (!finder || !run.carriedOut()) return;
    this.carriedBy = finder.spec.name;
  }

  /**
   * Each friend's character and glove where they are, a moment ago, if they're in the same maze as this child. One
   * walking out of it fades away as it goes, and is gone once it's out.
   */
  updateFriends(dt) {
    const now = performance.now();
    const { run } = this;
    for (const friend of this.friendWalkers.values()) {
      const at = friend.track.at(now);
      friend.at = at;
      friend.out = at ? 1 - showing(at.x, run.layout.cols) : 0;
      if (!at || at.z !== run.index || friend.out >= 0.99) {
        friend.shown = false;
        continue;
      }
      if (friend.z !== at.z) {
        friend.z = at.z;
        const start = run.layout.maze.centre(run.layout.start);
        friend.trail.reset(start.x, start.y);
      }
      const before = friend.trail.points[0];
      friend.trail.add(at.x, at.y);
      if (before) friend.walked += Math.hypot(at.x - before.x, at.y - before.y) > 0.001 ? Math.min(0.2, Math.hypot(at.x - before.x, at.y - before.y)) : 0;
      friend.shown = true;
      const seen = Boolean(at.v) && friend.out === 0;
      friend.fade += ((seen ? 1 : 0) - friend.fade) * (1 - Math.exp(-dt * 8));
      const { glove } = friend;
      glove.visible = seen || friend.fade > 0.05;
      glove.status = at.o ? 'open' : 'closed';
      const spot = this.view.at(at.gx, at.gy);
      glove.x = spot.x;
      glove.y = spot.y;
      const palm = this.view.palmSize * 0.8;
      if (at.p?.length === 42) {
        glove.points.forEach((point, index) => {
          point.x = at.p[index * 2] * palm;
          point.y = at.p[index * 2 + 1] * palm;
        });
      }
    }
  }

  /* ---------- what's drawn ---------- */

  /**
   * The friends a walker has found, following along its trail and walking while it walks, apart from one just
   * found, who cheers where they were.
   */
  followersOf(trail, found, walked, moving) {
    return found.map((entry, at) => {
      const { lost, who } = entry;
      if (lost && this.run.time - (lost.foundAt ?? -Infinity) < FOUND_SECONDS && lost.cell !== undefined && this.run.layout.lost.includes(lost)) {
        return { x: lost.x, y: lost.y, art: this.art[who], facing: 2, cheer: true };
      }
      const spot = trail.behind((at + 1) * FOLLOW_SPACING);
      if (!spot) return null;
      return { x: spot.x, y: spot.y, art: this.art[who], facing: facingOf(spot.dx, spot.dy, 1), moving, walked: walked + at * 0.31 };
    }).filter(Boolean);
  }

  model() {
    const { run } = this;
    const me = this.myCharacter().id;
    const sliding = run.phase === 'sliding' && run.nextLayout;
    const walkers = [];
    if (sliding) {
      // Coming in at the way into the next maze, with everyone found so far lined up behind.
      const start = run.nextLayout.maze.centre(run.nextLayout.start);
      walkers.push({
        x: start.x,
        y: start.y,
        art: this.art[me],
        facing: 1,
        mine: true,
        followers: run.followers.map((follower, at) => ({ x: start.x - (at + 1) * FOLLOW_SPACING, y: start.y, art: this.art[follower.who], facing: 1 })),
      });
    } else {
      const at = run.position;
      // It cheers a friend just found, and, together with friends, the way out one of them has just found.
      const justFound = run.phase === 'carried' || (run.phase === 'found' && run.followers.some(({ lost }) => run.time - (lost.foundAt ?? -Infinity) < FOUND_SECONDS));
      // In a race, walking out of the maze, the character fades away as it goes.
      const left = showing(at.x, run.layout.cols);
      if (left > 0.01) {
        walkers.push({
          x: at.x,
          y: at.y,
          art: this.art[me],
          facing: run.phase === 'found' || run.phase === 'carried' ? 2 : run.walker.facing,
          moving: run.moving,
          walked: run.stats.walked,
          cheer: justFound,
          mine: true,
          hasKey: run.hasKey,
          power: run.power,
          stuck: run.stuck,
          alpha: left,
          followers: this.followersOf(run.trail, run.followers, run.stats.walked, run.moving),
        });
      }
      for (const friend of this.friendWalkers.values()) {
        if (!friend.shown || !friend.at) continue;
        walkers.push({
          x: friend.at.x,
          y: friend.at.y,
          art: this.art[friend.spec.id],
          facing: friend.at.f,
          moving: Boolean(friend.at.m),
          walked: friend.walked,
          name: friend.name,
          alpha: 0.95 * (1 - friend.out),
          fade: 1 - friend.out,
        });
      }
    }
    const gloves = [];
    for (const friend of this.friendWalkers.values()) {
      if (friend.shown && friend.glove.visible) gloves.push({ glove: friend.glove, look: { ...FRIEND_GLOVE, alpha: 0.7 * friend.fade, palm: this.view.palmSize * 0.8 } });
    }
    const mine = this.gloves[this.session.settings.hands];
    gloves.push({ glove: mine, offset: this.gloveOffset });
    const playing = this.session.screen === 'playing' && run.phase === 'walking';
    const lead = playing && this.lastOpen && mine.visible ? { from: run.position, to: { x: mine.x + this.gloveOffset.x, y: mine.y + this.gloveOffset.y } } : null;
    const bird = run.bird ? { ...run.bird, at: run.birdAt() } : null;
    return {
      layout: run.layout,
      slide: sliding ? { share: run.phaseTime / SLIDE_SECONDS, next: run.nextLayout } : null,
      walkers,
      butterflies: run.butterflies,
      bird,
      gloves,
      lead,
      art: this.art,
    };
  }

  /* ---------- the top of the screen ---------- */

  /** On their own, a face for each friend to find, which lights up once they're found. */
  showFound() {
    const list = byId('maze-found');
    if (!list) return;
    list.hidden = this.mode !== 'solo';
    if (list.hidden) return;
    const portraits = this.session.portraits ?? {};
    const faces = this.run.cast.map(([who], index) => {
      const found = index < this.run.index || (index === this.run.index && this.run.layout.lost.every((lost) => lost.found));
      return { who, found, now: index === Math.max(0, this.run.index) && !found };
    });
    const key = faces.map(({ who, found, now }) => `${who}:${found}:${now}`).join(',');
    if (list.dataset.key === key) return;
    list.dataset.key = key;
    list.replaceChildren(...faces.map(({ who, found, now }) => {
      const row = document.createElement('li');
      row.classList.toggle('is-found', found);
      row.classList.toggle('is-now', now);
      const face = document.createElement('img');
      face.alt = '';
      face.src = portraits[who] ?? '';
      row.append(face);
      return row;
    }));
  }

  showFruit() {
    byId('chip-fruit').textContent = String(this.run.stats.fruit);
  }

  showPrizes(landed = false) {
    const total = Object.values(this.run.stats.prizes).reduce((sum, count) => sum + count, 0);
    byId('chip-prizes').textContent = String(total);
    if (!landed) return;
    const box = byId('chip-prizes').closest('.chip');
    box.classList.remove('is-caught');
    void box.offsetWidth;
    box.classList.add('is-caught');
  }

  /**
   * How many of the mazes each racer is out of, as a friend's game last said: the maze they're in, and whether
   * they're walking out of it. All of them, once they've finished.
   */
  mazesOut(id) {
    const { run } = this;
    // The child's own: the mazes behind them, and this one too once they're out of it, or carried out of it. In the
    // countdown, before the first maze has begun, that's none.
    if (id === this.friends.room.you) return run.over ? run.mazes : Math.max(0, run.index) + (['out', 'carried', 'sliding'].includes(run.phase) ? 1 : 0);
    if (this.friends.results.has(id)) return run.mazes;
    const at = this.friendWalkers.get(id)?.at;
    if (!at) return 0;
    return Math.min(run.mazes, at.z + (at.x > run.layout.cols ? 1 : 0));
  }

  /**
   * In a race, everyone at the top as they play, whoever is furthest on first, with a dot for each maze and a flag
   * once they're out of the last one. Equal ones stay in the order they came.
   */
  showRace() {
    const list = byId('maze-race');
    const { current } = this.friends;
    list.hidden = this.mode !== 'friends' || !current;
    if (list.hidden) return;
    const portraits = this.session.portraits ?? {};
    const you = this.friends.room.you;
    const { mazes } = this.run;
    const finishedAt = (id) => this.friends.results.get(id)?.ms ?? (id === you ? this.outMs : null) ?? Infinity;
    // Against each other, everyone, whoever is furthest on first. Together they go on as one, so it's one line.
    const everyone = this.team
      ? [{ id: 'team', name: 'Together', who: '', out: this.mazesOut(you), at: Infinity }]
      : [{ id: you, name: 'You', who: this.myCharacter().id }, ...current.friends.filter((friend) => !friend.gone).map((friend) => ({ id: friend.id, name: friend.spec.name, who: friend.spec.id }))]
        .map((each) => ({ ...each, out: this.mazesOut(each.id), at: finishedAt(each.id) }))
        .sort((a, b) => b.out - a.out || (a.at === b.at ? 0 : a.at < b.at ? -1 : 1));
    const key = everyone.map(({ id, out }) => `${id}:${out}`).join(',');
    if (list.dataset.key === key) return;
    list.dataset.key = key;
    list.replaceChildren(...everyone.map((each) => {
      const row = document.createElement('li');
      row.classList.toggle('is-you', each.id === you);
      row.classList.toggle('is-team', each.id === 'team');
      row.classList.toggle('is-out', each.out >= mazes);
      row.dataset.out = String(each.out);
      const face = document.createElement('img');
      face.alt = '';
      face.src = portraits[each.who] ?? '';
      face.hidden = !each.who;
      const name = document.createElement('span');
      name.className = 'maze-race-name';
      name.textContent = each.name;
      const dots = document.createElement('span');
      dots.className = 'maze-race-dots';
      dots.setAttribute('aria-label', `${each.out} of ${mazes} mazes`);
      for (let maze = 0; maze < mazes; maze += 1) {
        const dot = document.createElement('i');
        dot.classList.toggle('is-done', maze < each.out);
        dots.append(dot);
      }
      row.append(face, name, dots);
      if (each.out >= mazes) {
        const flag = document.createElement('span');
        flag.className = 'maze-race-flag';
        flag.setAttribute('aria-hidden', 'true');
        flag.textContent = '🏁';
        row.append(flag);
      }
      return row;
    }));
  }

  /* ---------- the end ---------- */

  finished() {
    const { sound } = this.session;
    sound.stopLoop('birds');
    this.story.hide();
    // The race time is when the child's character got out of the last maze, not the moment after when this card comes.
    if (this.mode === 'friends') this.friends.finished(this.outMs ?? this.sinceGo, { n: this.run.stats.fruit, w: 1 });
    for (const glove of Object.values(this.gloves)) glove.hide();
    for (const friend of this.friendWalkers.values()) friend.shown = false;
  }

  prompt(snapshot, dt) {
    const { session, run } = this;
    const needed = session.handsPrompt(snapshot, dt);
    // Together, a friend has found the way out: who it was, on the screen and not said aloud.
    if (run.phase === 'carried') return { key: `carried-${run.index}`, text: `${this.carriedBy || 'A friend'} found the way out!`, side: null, silent: true };
    if (run.phase !== 'walking') return needed && !needed.key.startsWith('closed') ? needed : null;
    // In the gentle maze the hand can rest whenever it likes: the character just waits. After a while, it's said that's
    // fine. With the sun going down that isn't said, as the sun doesn't wait for a closed hand.
    if (!run.timed && this.restFor > RESTING_AFTER) return { key: 'resting', text: SPOKEN.resting, side: null };
    if (needed && !needed.key.startsWith('closed')) return needed;
    if (needed && this.restFor > ASK_OPEN_AFTER) return needed;
    // Held up by something in the way: what to do about it, shown rather than said, every time.
    const blocker = run.waitingAt;
    if (blocker && this.blockedFor > BLOCKED_HINT_AFTER) {
      const key = blocker.kind === 'gate' ? 'locked' : blocker.kind;
      const [en, ka] = LABELS[key];
      return { key: `blocked-${key}`, text: session.settings.language === 'ka' ? ka : en, side: null, silent: true };
    }
    if (run.index === 0 && run.stats.walked < 2 && session.playSeconds < HINT_SECONDS) return { key: 'lead-hint', text: HINT, side: null, asks: 'open' };
    return null;
  }

  summary() {
    const { stats } = this.run;
    const hand = this.session.settings.hands;
    const row = (value) => ({ left: hand === 'left' ? value : '', right: hand === 'right' ? value : '' });
    const prizes = Object.values(stats.prizes).reduce((sum, count) => sum + count, 0);
    this.friends.showResults();
    // In a race nobody is found and there are no prizes, so the card only has the fruit, the times and the hand.
    for (const id of ['found', 'prizes']) byId(`sum-left-${id}`).closest('tr').hidden = this.mode === 'friends';
    const portraits = this.session.portraits ?? {};
    const found = byId('finish-found');
    found.replaceChildren(...this.run.followers.map(({ who }) => {
      const face = document.createElement('img');
      face.alt = '';
      face.src = portraits[who] ?? '';
      return face;
    }));
    byId('finish-prizes').textContent = Object.entries(stats.prizes)
      .filter(([, count]) => count > 0)
      .map(([kind, count]) => `${PRIZE_MARKS[kind]} ${count}`)
      .join('   ');
    return {
      hero: stats.fruit,
      noun: 'game',
      rows: { found: row(stats.found), prizes: row(prizes) },
      // On their own, the sun can set before a friend is found, and that game comes round again at the same level. In
      // the gentle maze nobody can lose, and in a race everyone gets out.
      won: !this.run.lost,
      // A game with friends is on the host's level, so it doesn't move the child's own level on.
      countsForLevel: !this.friends.current,
    };
  }
}

/**
 * The game's sounds. A game the sun set on ends softly: a sparkle in place of the fanfare, and
 * the voice says what it says after any game that was lost.
 */
class MazeSound extends Sound {
  lost = false;

  finish(line, options) {
    if (this.lost) this.play('sparkle', { gain: 0.3 });
    super.finish(line, options);
  }
}

const choice = (name, value, label) => `<label><input type="radio" name="${name}" value="${value}"> ${label}</label>`;
const characterChoices = ROSTER.map(({ id, name }) => choice('fighter', id, name)).join('\n        ');

new GameSession({
  // What the open and closed hand do here, for the hand shapes in the grown-ups' panel: see core/shapes.js.
  moves: { open: 'Lead Giraffe', closed: 'Wait' },
  shell: {
    title: 'Giraffe’s Maze',
    startLabel: 'Into the maze!',
    againLabel: 'Play again',
    finishTitle: FINISH,
    heroMark: '🍎',
    heroNoun: 'fruit',
    extraRows: [{ id: 'found', label: 'Friends found' }, { id: 'prizes', label: 'Prizes caught' }],
    hudTop: `
      <div class="maze-hud">
        <ol id="maze-found" class="maze-found" aria-label="Friends to find"></ol>
        <div class="chip chip-fruit"><span class="chip-label">Fruit</span><span id="chip-fruit" class="chip-value">0</span></div>
        <div class="chip chip-prizes"><span class="chip-label">Prizes</span><span id="chip-prizes" class="chip-value">0</span></div>
        <div id="chip-sun-box" class="chip chip-sun" hidden><span class="chip-label">Sun</span><span class="thin-meter sun-meter"><span id="sun-left"></span></span></div>
        <ol id="maze-race" class="maze-race" aria-label="The race" hidden></ol>
      </div>
      ${STORY_BOX}
      <div class="film maze-film" aria-hidden="true">
        <svg viewBox="0 0 220 150">
          <path class="film-hedge" d="M8 62h132v-50h70v126H8z" />
          <path class="film-path" d="M8 84h150V30h30v86H8z" />
          <path class="film-lead" d="M40 100h132V44" />
          <g class="film-walker">
            <circle class="film-body" cx="0" cy="0" r="11" />
            <circle class="film-spot" cx="-4" cy="-3" r="2.6" />
            <circle class="film-spot" cx="4" cy="3" r="2.2" />
            <circle class="film-eye" cx="3" cy="-4" r="1.6" />
          </g>
          <g class="film-hand">
            <rect x="-14" y="-6" width="28" height="24" rx="9" />
            <path class="film-finger" d="M-9 -3V-18" />
            <path class="film-finger" d="M-3 -5V-23" />
            <path class="film-finger" d="M4 -5V-23" />
            <path class="film-finger" d="M10 -3V-17" />
          </g>
        </svg>
      </div>`,
    panelSettings: `
      <fieldset class="choice">
        <legend>How hard (how big the maze is, and so how wide its paths are)</legend>
        ${choice('mazeSize', 'easy', 'Easy: a small maze with wide paths')}
        ${choice('mazeSize', 'medium', 'Medium')}
        ${choice('mazeSize', 'hard', 'Hard: a bigger maze with narrower paths')}
      </fieldset>
      <fieldset class="choice">
        <legend>The sun going down</legend>
        ${choice('mazeSun', 'sets', 'The sun sets over each maze: find the friend before it does')}
        ${choice('mazeSun', 'gentle', 'Gentle: no sun, all the time it takes, and a sheep or a bush moves by itself')}
      </fieldset>
      <fieldset class="choice">
        <legend>Reach help (the middle of the camera picture covers the whole maze, so a smaller movement goes further)</legend>
        ${choice('mazeReach', 'none', 'None')}
        ${choice('mazeReach', 'little', 'A little')}
        ${choice('mazeReach', 'lots', 'A lot')}
      </fieldset>
      <fieldset class="choice">
        <legend>Finding the way</legend>
        ${choice('mazeWays', 'lead', 'The character goes where the open hand leads it, along the paths')}
        ${choice('mazeWays', 'find', 'The character finds its own way to the open hand')}
      </fieldset>
      <fieldset class="choice">
        <legend>With friends</legend>
        ${choice('mazeFriends', 'together', 'Together: everyone looks for the way out, and whoever finds it takes the others on to the next maze')}
        ${choice('mazeFriends', 'against', 'Against each other: a race, and the first out of the last maze wins')}
      </fieldset>
      <fieldset class="choice">
        <legend>Friends to find in a game (with friends, how many mazes to get out of)</legend>
        ${choice('mazes', '2', '2')}
        ${choice('mazes', '3', '3')}
        ${choice('mazes', '5', '5')}
      </fieldset>
      <fieldset class="choice">
        <legend>Who plays</legend>
        ${characterChoices}
      </fieldset>`,
  },
  defaults: { mazeSize: 'hard', mazeSun: 'sets', mazeReach: 'little', mazeWays: 'lead', mazes: 3, mazeFriends: 'together', fighter: ROSTER[0].id },
  choices: { mazeSize: String, mazeSun: String, mazeReach: String, mazeWays: String, mazes: Number, mazeFriends: String, fighter: String },
  // These go on to a game that's being played at once. The rest, and the level, start it again: see core/settings.js.
  atOnce: ['mazeReach'],
  tagline: (side) => `Friends are lost in the maze! Lead the way to them with your open ${side} hand.`,
  finishLine: FINISH,
  lines: new URL('./audio/voice/lines.json', import.meta.url),
  portraits: () => renderPortraits(ROSTER),
  createSound: (options) => new MazeSound({
    ...options,
    sounds: {
      crunch: new URL('../giraffe-walk/audio/crunch.ogg', import.meta.url),
      found: new URL('../spider-catcher/audio/home.ogg', import.meta.url),
      rustle: new URL('../spider-catcher/audio/rustle.ogg', import.meta.url),
      birds: new URL('../spider-catcher/audio/birds.ogg', import.meta.url),
      step1: new URL('../leap-trail/audio/step-1.ogg', import.meta.url),
      step2: new URL('../leap-trail/audio/step-2.ogg', import.meta.url),
      cheer: new URL('../mighty-moves/audio/cheer.ogg', import.meta.url),
      sparkle: new URL('../mighty-moves/audio/sparkle.ogg', import.meta.url),
      whoosh: new URL('../mighty-moves/audio/whoosh-2.ogg', import.meta.url),
      unlock: new URL('../robot-rescue/audio/unlock.ogg', import.meta.url),
      boing: new URL('../robot-rescue/audio/boing.ogg', import.meta.url),
    },
  }),
  createGame: (session) => new MazeGame(session),
}).start();
