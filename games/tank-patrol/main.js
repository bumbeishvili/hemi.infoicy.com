// Tank Patrol: robot tanks are rolling into Giraffe's valley, and he's riding in the child's tank to stop
// them. A closed hand drives the tank to where it points, and an open hand fires at any robot tank under
// the crosshair that the gun can reach. The story and rules are in patrol.js, the valley is in valley.js,
// and the picture is in field.js.
//
// Or with a friend on their own computer, as whoever makes the game chooses: a patrol together, both tanks
// against the robot tanks (team.js), or a battle against each other, tank against tank, with no robot tanks at
// all (duel.js). See core/friends-ui.js for making and joining a game.
import { renderPortraits } from '../../core/body/portraits.js';
import { byId as characterById } from '../../core/body/roster.js';
import { Track } from '../../core/friends.js';
import { FriendsPanel } from '../../core/friends-ui.js';
import { GameSession, SPOKEN } from '../../core/session.js';
import { STORY_BOX, StoryBox } from '../../core/story.js';
import { Duel, battleSeconds, wrap } from './duel.js';
import { Field } from './field.js';
import { PACES, POWERS, PRIZES, Patrol, newsAt, readHand } from './patrol.js';
import { PatrolSound } from './patrol-sound.js';
import { TeamPatrol } from './team.js';

// Each of these has a rendered voice file: see audio/voice/lines.json.
const GIRAFFE_ASKS = 'Robot tanks in my valley! Let’s stop them!';
const GIRAFFE_WAVING = 'Look! The little robot’s waving!';
const GIRAFFE_TICKLES = 'Ooh, that tickles!';
const GIRAFFE_ONE_MORE = 'One more tank!';
const GIRAFFE_BATTLE = 'A friendly battle! Hit your friend’s tank!';
const FINISH = 'You saved the valley!';
const SO_CLOSE = 'So close!';
// What the card says when the shells win, in the story. It's only shown, as "So close!" is what's said.
const SHELLS_WON = { en: 'The robot tanks got the better of you!', ka: 'რობოტმა ტანკებმა გაგაჩერეს!' };
const SHELLS_WON_TOGETHER = { en: 'The robot tanks got the better of you both!', ka: 'რობოტმა ტანკებმა ორივე გაგაჩერეს!' };
const TRY_AGAIN = { en: 'Try again', ka: 'კიდევ სცადე' };
const CLOSE_TO_DRIVE = 'Close your hand to drive!';
const OPEN_TO_FIRE = 'Open your hand to fire!';
const TOO_FAR = 'Too far! Close your hand and drive closer!';
const LOOK_OUT = 'Look out! Drive away from the ring!';
// The end of a battle with a friend, whoever made the most hits: one of the lines every game shares.
const BATTLE_OVER = 'Great job!';

const STORY_SECONDS = 3.2; // How long a character's picture stays up after speaking.
const FILM_AT_MOST_SECONDS = 45;
const FILM_AGAIN_AFTER_SECONDS = 11; // With nothing fired or driven for this long, it comes back.
const DRIVEN_ENOUGH = 8; // How far the tank has to have been driven to have got the idea.
const SHOTS_ENOUGH = 3; // And how many shots fired.
const TOO_FAR_PROMPT_SECONDS = 0.5;
const OPEN_PROMPT_SECONDS = 2.2; // Closed, with a tank in reach, and not driving anywhere.
const CLOSE_PROMPT_SECONDS = 4; // Open, with nothing in reach.
const SPOKEN_AT_MOST = 2; // Each prompt is spoken this many times in a game, and read after that.
const TICKLES_AT_MOST = 2; // Giraffe only says this now and then.
const NAMES_AFTER_SECONDS = 1.3; // Names of new things wait until "GO!" has gone.

// With a friend, each on their own computer: see core/friends-ui.js for what each of these is.
// A patrol together that the two have lost has its own title, which the friends' finish card reads each time it fills in.
const teamCard = { lost: null };
const TANK_WORDS = {
  toggle: 'Play with a friend',
  make: 'Make a game',
  codeLabel: 'A friend’s game code',
  codeName: 'Game code',
  how: 'Tell your friend the code. Then you both press <b>Climb aboard</b>.',
  // Together or against each other, as whoever made the game chooses: see teams in core/friends-ui.js.
  together: 'Together',
  against: 'Against each other',
  howTogether: 'Tell your friend the code. Then you both press <b>Climb aboard</b>, and stop the robot tanks together.',
  get teamTitle() {
    return teamCard.lost ?? 'You saved the valley together!';
  },
  leave: 'Leave this game',
  privacy: 'Only your name, whether you chose together or against each other, where your tank is and which way it points, when it fires, how many hits it makes, and whether your hand is open or resting go to your friend. Together, the game of whoever made it also sends where the robot tanks and their shells are. The camera picture stays on this computer.',
  alone: 'Play on your own',
  full: 'That game already has 2 players.',
  lost: 'Can’t reach the game. Check the internet, then try again.',
  left: 'You’ve left the game.',
  badCode: 'A game code is 3 letters and numbers.',
  busy: 'Playing',
  still: 'still playing',
};
// The friend's tank between what their game sends: where it is and how fast it goes, which go smoothly from one
// to the next, which way it faces and its turret points, which go the short way round, and whether their child
// is resting, whether their hand is open and how many shots it has fired, which change half way. With nothing
// new for a moment, it carries on a little way as it was going.
const TANK_TRACK = {
  lerp: ['x', 'z', 's'],
  angles: ['h', 'a'],
  steps: ['r', 'o', 'n'],
  guess: (last, seconds) => {
    const ahead = Math.min(seconds, 0.25) * last.s;
    return { x: last.x + Math.sin(last.h) * ahead, z: last.z - Math.cos(last.h) * ahead };
  },
};
const round = (value, places) => Math.round(value * 10 ** places) / 10 ** places;
const clock = (seconds) => {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

const byId = (id) => document.getElementById(id);
const HEART = '<svg class="heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21C5 15.500 2 12 2 8a5.500 5.500 0 0 1 10-3 5.500 5.500 0 0 1 10 3c0 4-3 7.500-10 13z"/></svg>';
// A little tank, in the colour of the child's own or their friend's, beside each score in a battle.
const TANK_MARK = '<svg class="battle-tank" viewBox="0 0 26 16" aria-hidden="true"><rect class="battle-tread" x="1.5" y="10" width="21" height="5" rx="2.5"/><rect x="3" y="5.5" width="18" height="6" rx="2.6"/><path class="battle-gun" d="M13.5 5.5L24 2.5"/><circle cx="12" cy="5.5" r="3.6"/></svg>';

class TankGame {
  chimeOnOpen = false; // Hands open and close all the time here, so a chime would be noise.

  constructor(session) {
    this.session = session;
    this.story = new StoryBox(session);
    this.field = new Field(byId('game'), byId('marks'));
    this.patrol = null;
    this.battle = null; // A battle with a friend, while there is one: see prepare().
    this.team = null; // Or a patrol together with them.
    this.goAt = 0;
    this.storyFor = 0;
    this.filming = false;
    this.sinceAction = 0;
    this.openFor = 0;
    this.closedFor = 0;
    this.farFor = 0;
    this.spokenTimes = new Map();
    this.ticklesSaid = 0;
    this.saidWaving = false;
    this.applySettings();
    this.startPreview();
    window.addEventListener('resize', () => this.measureTop());
    // A battle with a friend, if a grown-up makes or joins a game.
    const { settings } = session;
    this.friends = new FriendsPanel({
      game: 'tank-patrol',
      linkKey: 'tanks',
      words: TANK_WORDS,
      // Everyone here rides with Giraffe. The host's number of tanks says how many there are to stop together, or how
      // long a battle lasts, and their speed how fast both tanks go.
      hello: () => ({ driver: 'giraffe', level: session.levels.current, length: settings.tanks, mode: settings.pace }),
      // Together or against each other: the grown-ups' choice, which the friends box can change too.
      teams: {
        get: () => (settings.tankFriends === 'against' ? 'against' : 'together'),
        set: (choice) => this.chooseTeams(choice),
      },
      screen: () => session.screen,
      portraits: () => session.portraits,
      onMove: (id, message) => this.fromFriend(id, message),
      onGone: (friend) => this.friendGone(friend),
      // Whoever made the most hits, and equal ones share the win.
      rank: (a, b) => b.dropped - a.dropped,
      resultText: ({ dropped }) => (this.battle ? `${dropped} ${dropped === 1 ? 'hit' : 'hits'}` : `${dropped} stopped`),
      startAfter: byId('start'),
      waitingBefore: byId('screen-finish'),
      resultsAfter: document.querySelector('#screen-finish .finish-hero'),
    });
    // Both scores, big, on the finish card of a battle.
    document.querySelector('#screen-finish .finish-hero').insertAdjacentHTML('afterend', '<p id="finish-score" class="finish-score" hidden></p>');
    const game = this;
    this.debug = {
      field: this.field,
      get patrol() {
        return game.patrol;
      },
      get game() {
        return game;
      },
      get friends() {
        return game.friends;
      },
    };
  }

  /** The valley behind the title, with robot tanks rolling about in it. Nothing's fired, or counted. */
  startPreview() {
    this.patrol = new Patrol({ tanks: 15, pace: 'slow', onEvent: (event) => this.field.onEvent(event) });
    this.field.reset(this.patrol);
    this.preview = true;
  }

  /** What each level brings that's new, for the cards: see NEWS in patrol.js. */
  newAt(level) {
    return newsAt(level);
  }

  applySettings() {
    const { hands, language } = this.session.settings;
    this.field.configure({ side: hands, language });
    if (this.patrol) {
      const { reach, pace, tankShells, driving } = this.session.settings;
      // With a friend, both tanks go at the host's speed. A battle has nothing to make harder, and together each
      // child's own How hard says how many hearts they have.
      if (this.battle) this.patrol.configure({ help: reach, driving });
      else if (this.team) this.patrol.configure({ help: reach, level: tankShells, driving });
      else this.patrol.configure({ help: reach, pace, level: tankShells, driving });
      this.showHearts();
    }
  }

  setHands() {
    this.applySettings();
  }

  /** Everything but the number of tanks can change in the middle of a game, which is for the next one. */
  settingChanged(change) {
    // A friend's game hears the host's number of tanks and speed, and whether it's together, for the next game.
    if (('tanks' in change || 'pace' in change || 'tankFriends' in change) && this.friends.room.inRoom) this.friends.room.tell(this.friends.hello());
    if ('tankFriends' in change) this.friends.showTeams();
    if (this.preview) return;
    this.applySettings();
  }

  /** Together or against each other, chosen in the friends box: kept with the grown-ups' settings, and shown there. */
  chooseTeams(choice) {
    this.session.changeSettings({ tankFriends: choice });
    const input = document.querySelector(`input[name="tankFriends"][value="${choice}"]`);
    if (input) input.checked = true;
  }

  /** With a friend, the start waits until they're ready too. */
  holdStart(go) {
    return this.friends.holdStart(go);
  }

  /** How long since "GO!", by the clock on the wall, for the friend's game. */
  get sinceGo() {
    return performance.now() - this.goAt;
  }

  /* ---------- a new game ---------- */

  /**
   * The robot tanks are on their way before the countdown has finished, so there's nothing to wait for.
   * level, from 1 to 10, makes it harder within the grown-up's choices: see levelPlan in patrol.js.
   *
   * With a friend it's as whoever made the game chose. Together, both tanks stop the robot tanks, twice the
   * host's number of them, which the host's game runs for both. Against each other it's a battle, tank against
   * tank, for as long as the host's game says. Either way it's at the host's speed, with this child's own reach
   * help and driving, and it doesn't move anyone's own level on.
   */
  prepare(level = 1) {
    const { settings, sound } = this.session;
    this.story.hide();
    this.storyFor = 0;
    this.sinceAction = 0;
    this.openFor = 0;
    this.closedFor = 0;
    this.farFor = 0;
    this.spokenTimes.clear();
    this.ticklesSaid = 0;
    this.saidWaving = false;
    this.preview = false;
    sound.lost = false;
    this.lost = false;
    const friendly = this.friends.current;
    const rival = friendly?.friends[0] ?? null;
    const pace = PACES[friendly?.mode] ? friendly.mode : 'slow';
    this.battle = null;
    this.team = null;
    if (rival && friendly.team) {
      this.team = { friend: rival, track: new Track(TANK_TRACK), alone: false };
      this.patrol = new TeamPatrol({
        slot: friendly.mySlot,
        runs: friendly.hosting,
        tanks: friendly.length,
        pace,
        level: settings.tankShells,
        help: settings.reach,
        driving: settings.driving,
        onEvent: (event) => this.onEvent(event),
      });
      this.field.friendName = rival.spec.name;
    } else if (rival) {
      this.battle = { seconds: battleSeconds(friendly.length), rival, track: new Track(TANK_TRACK), shown: null, endShown: null };
      this.patrol = new Duel({
        slot: friendly.mySlot,
        pace,
        help: settings.reach,
        driving: settings.driving,
        onEvent: (event) => this.onEvent(event),
      });
      this.field.friendName = rival.spec.name;
      byId('battle-name').textContent = rival.spec.name;
    } else {
      this.patrol = new Patrol({
        tanks: settings.tanks,
        pace: settings.pace,
        level: settings.tankShells,
        levelNumber: level,
        help: settings.reach,
        driving: settings.driving,
        onEvent: (event) => this.onEvent(event),
      });
    }
    document.body.toggleAttribute('data-friends-race', Boolean(friendly));
    document.body.toggleAttribute('data-battle', Boolean(this.battle));
    for (const id of ['chip-mine', 'chip-theirs', 'chip-time-box']) byId(id).hidden = !this.battle;
    byId('chip-stopped-label').textContent = this.team ? 'Stopped together' : 'Stopped';
    this.field.configure({ side: settings.hands, language: settings.language });
    this.field.reset(this.patrol);
    this.field.showMarks = true;
    this.powerShown = null;
    this.showHearts();
    this.showProgress();
    this.showHaul();
    this.showPower();
    if (this.battle) this.showBattle(this.battle.seconds);
  }

  begin() {
    const { sound } = this.session;
    this.goAt = performance.now();
    this.patrol.begin();
    sound.startPatrol();
    this.story.say('giraffe', this.battle ? GIRAFFE_BATTLE : GIRAFFE_ASKS);
    this.storyFor = STORY_SECONDS;
    this.field.child.cheer(1.6);
  }

  /* ---------- what happens ---------- */

  onEvent(event) {
    this.field.onEvent(event);
    const { sound } = this.session;
    const handlers = {
      shot: () => {
        // A triple shot's two side balls go with the middle one, which makes the one sound.
        if (!event.side) sound.shot();
        this.sinceAction = 0;
      },
      // A friend's hit on a robot tank shows, and is heard on their own computer.
      hit: () => {
        if (!event.friend) sound.hit();
      },
      // On a patrol together, the game that runs the robot tanks hears of each hit this child's game has made.
      tag: () => this.friends.sendTag(event.id, event.hits),
      stopped: () => this.onStopped(event),
      crew: () => this.onCrew(),
      lob: () => sound.lob(),
      land: () => sound.land(event.hit),
      hurt: () => this.onHurt(event),
      healed: () => this.showHearts(),
      resting: () => this.onResting(event),
      won: () => this.end(FINISH),
      lost: () => this.onLost(),
      prize: () => {
        this.prizeSound();
        this.showHaul();
      },
      'chest-open': () => sound.crew(),
      'crate-got': () => sound.crew(),
      power: () => this.showPower(),
      'power-off': () => this.showPower(),
      bonk: () => sound.bump(),
      'shield-down': () => sound.stopped(),
      bubbled: () => sound.crew(),
      dig: () => sound.land(false),
      'pop-up': () => sound.land(false),
      split: () => sound.stopped(),
      'part-off': () => sound.stopped(),
      'cage-hit': () => sound.hit(),
      freed: () => {
        if (event.byChild) sound.crew();
        this.showHaul();
      },
      'friend-hit': () => this.onFriendHit(event),
      'friend-bonk': () => sound.bump(),
      'hit-by': () => this.onHitBy(),
    };
    handlers[event.type]?.();
    this.showProgress();
  }

  onStopped({ left, part }) {
    const { sound } = this.session;
    sound.stopped();
    if (left === 1 && !part) this.sayAsGiraffe(GIRAFFE_ONE_MORE, { quietly: true });
  }

  /** Prizes come in handfuls, so their twinkle isn't played for every one. */
  prizeSound() {
    const now = performance.now();
    if (now - (this.lastPrizeSound ?? 0) < 140) return;
    this.lastPrizeSound = now;
    this.session.sound.prize();
  }

  /** What's been picked up, on the chip at the top: only what this level has, and only once there's some. */
  showHaul() {
    const { patrol } = this;
    if (!patrol || this.preview) return;
    const chip = byId('chip-haul');
    chip.hidden = !patrol.plan.bolts;
    const haul = patrol.haul;
    for (const [key, value] of Object.entries(haul)) {
      const item = chip.querySelector(`[data-haul='${key}']`);
      item.hidden = key !== 'bolts' && value === 0;
      item.querySelector('.haul-count').textContent = String(value);
    }
    this.measureTop();
  }

  /** Where the chips along the top end, for what goes under them, as they can need a second row. */
  measureTop() {
    const bottom = Math.round(document.querySelector('.hud-top')?.getBoundingClientRect().bottom ?? 0);
    if (bottom > 0 && bottom !== this.topBottom) {
      this.topBottom = bottom;
      document.documentElement.style.setProperty('--hud-bottom', `${bottom}px`);
    }
  }

  /** The power-up that's on, with a bar that runs down. */
  showPower() {
    const { patrol } = this;
    const chip = byId('chip-power');
    const on = patrol && !this.preview ? [['fire', patrol.fireKind, patrol.power.fireLeft], ['magnet', patrol.power.magnetLeft > 0 && 'magnet', patrol.power.magnetLeft], ['slow', patrol.slowing && 'slow', patrol.power.slowLeft]].filter(([, name]) => name) : [];
    // Its name is in the language the voice speaks, which a grown-up can change in the middle of a round.
    const ka = this.session.settings.language === 'ka';
    const key = `${on.map(([, name]) => name).join(',')} ${ka}`;
    if (key !== this.powerShown) {
      this.powerShown = key;
      chip.hidden = !on.length;
      chip.querySelector('.chip-value').innerHTML = on.map(([slot, name]) => `<span class="power" data-power="${slot}"><span class="power-mark" aria-hidden="true">${POWERS[name].mark}</span><span class="power-bar"><span></span></span></span>`).join('');
      chip.querySelector('.chip-label').textContent = on.length === 1 ? (ka ? POWERS[on[0][1]].nameKa : POWERS[on[0][1]].name) : 'Power-ups';
      this.measureTop();
    }
    for (const [slot, name, left] of on) {
      const bar = chip.querySelector(`[data-power='${slot}'] .power-bar span`);
      if (bar) bar.style.width = `${Math.round((left / POWERS[name].seconds) * 100)}%`;
    }
  }

  onCrew() {
    this.session.sound.crew();
    if (!this.saidWaving) {
      this.saidWaving = true;
      this.sayAsGiraffe(GIRAFFE_WAVING);
    }
  }

  onHurt({ hearts }) {
    this.showHearts(hearts);
    const chip = document.querySelector('.chip-hearts');
    chip.classList.remove('is-hurt');
    void chip.offsetWidth;
    chip.classList.add('is-hurt');
    if (this.ticklesSaid < TICKLES_AT_MOST && hearts > 0) {
      this.ticklesSaid += 1;
      this.sayAsGiraffe(GIRAFFE_TICKLES, { quietly: true });
    }
  }

  onResting({ on }) {
    if (on) this.story.hide();
  }

  /** Giraffe says something, with his picture up for a moment. Quietly means only if nothing else is being said. */
  sayAsGiraffe(line, { quietly = false } = {}) {
    const { sound } = this.session;
    if (quietly && sound.currentVoice) return;
    this.story.say('giraffe', line);
    this.storyFor = STORY_SECONDS;
  }

  onLost() {
    const { session } = this;
    session.sound.lost = true;
    this.lost = true;
    this.end(SO_CLOSE);
  }

  /**
   * On a patrol together, the friend's hearts have run out, which their game says in the result it sends: the
   * team has lost together, and it ends here too.
   */
  watchFriendLost() {
    const { team, session } = this;
    if (!team || team.alone || this.lost || session.screen !== 'playing') return;
    if (this.friends.results.get(team.friend.id)?.won !== false) return;
    this.patrol.fizzleShells();
    this.onLost();
  }

  end(words) {
    const { session } = this;
    const language = session.settings.language === 'ka' ? 'ka' : 'en';
    session.finishLine = words;
    // A patrol finished together says so, on both screens.
    const together = Boolean(this.team) && !this.team.alone;
    teamCard.lost = this.lost && together ? SHELLS_WON_TOGETHER[language] : null;
    const title = this.lost && !together ? SHELLS_WON[language] : together ? TANK_WORDS.teamTitle : session.translate(words);
    document.querySelector('#screen-finish h2').textContent = title;
    // Short enough to stay on one line: the title above says what was stopped.
    document.querySelector('.finish-hero').lastChild.textContent = together ? ' stopped together' : this.patrol.stopped === 1 ? ' tank stopped' : ' tanks stopped';
    session.finish();
    // The level doesn't move on, and the big button says so.
    const again = document.getElementById('play-again');
    if (this.lost && again) again.textContent = TRY_AGAIN[language];
    // And no confetti for the robot tanks winning.
    if (this.lost) session.hud.confetti?.stop();
  }

  showProgress() {
    const { patrol } = this;
    if (!patrol || this.preview || this.battle) return;
    byId('chip-left').textContent = String(patrol.left);
    byId('chip-stopped').textContent = String(patrol.stopped);
    byId('race-progress-fill').style.width = `${Math.round((patrol.stopped / patrol.total) * 100)}%`;
  }

  showHearts(hearts = this.patrol?.hearts) {
    const { patrol } = this;
    if (!patrol) return;
    const box = byId('chip-hearts');
    const most = patrol.level.hearts;
    if (box.children.length !== most) box.innerHTML = HEART.repeat(most);
    [...box.children].forEach((heart, index) => heart.classList.toggle('is-gone', index >= hearts));
  }

  /* ---------- with a friend ---------- */

  /**
   * Something from the friend's game. In a battle: where their tank is, or how many times its shots have hit this
   * child's. On a patrol together: where their tank is, and from the game that runs the robot tanks, where those
   * and their shells are, or to it, a hit the friend's shot has made on one.
   */
  fromFriend(id, message) {
    const { battle, team, session } = this;
    if (team) {
      if (id !== team.friend.id) return;
      if (message.t === 'tank' && session.screen === 'playing') team.track.push(message, performance.now());
      // The robot tanks are rolling in from the countdown on.
      else if (message.t === 'foes' && ['countdown', 'playing'].includes(session.screen)) {
        this.patrol.follow(message);
        this.showProgress();
      }
      else if (message.t === 'tag' && session.screen === 'playing') this.patrol.friendTagged(message.k, message.n);
      return;
    }
    if (!battle || id !== battle.rival.id) return;
    if (message.t === 'tank' && session.screen === 'playing') battle.track.push(message, performance.now());
    // Their hits were decided by their game, which fired the shots. One that comes just after the end still counts.
    else if (message.t === 'hit' && ['playing', 'finish'].includes(session.screen)) this.patrol.hitBy(message.tot);
  }

  /** The friend's tank where their game says it is, a moment ago, and any shots it has fired coming over. */
  followFriend(dt) {
    const { patrol, field } = this;
    const { track } = this.battle ?? this.team;
    const fired = patrol.placeFriend(track.at(performance.now()), dt);
    if (!fired) return;
    // In a battle they come at this child's tank. Together, they go for the robot tank the friend is firing at.
    field.friendFired(fired, this.team ? patrol.friendAim() : null);
    this.session.sound.shot({ friend: true });
  }

  /**
   * On a patrol together: where the child's tank is, for the friend's game, and from the game that runs the robot
   * tanks, where those and their shells are. Once the friend has gone, there's nobody to tell.
   */
  updateTeam() {
    const { patrol } = this;
    if (!patrol.together) return;
    if (patrol.state === 'playing') this.friends.sendMove('tank', this.tankState(), this.sinceGo);
    if (patrol.runs) this.friends.sendMove('foes', patrol.wire(), patrol.state === 'playing' ? this.sinceGo : 0);
  }

  /** Where the child's tank is, for the friend's game, and the time running out. */
  updateBattle() {
    const { battle, patrol, session } = this;
    if (patrol.state === 'playing') this.friends.sendMove('tank', this.tankState(), this.sinceGo);
    const left = Math.max(0, battle.seconds - this.sinceGo / 1000);
    this.showBattle(left);
    if ((left <= 0 || patrol.friend.state === 'gone') && session.screen === 'playing') this.endBattle();
  }

  /** The child's tank, for the friend's game: where it is, which way it faces and its turret points, its speed, how many shots it has fired, whether the child is resting, and whether their hand is open. */
  tankState() {
    const { tank, stats, resting } = this.patrol;
    return { x: round(tank.x, 2), z: round(tank.z, 2), h: round(wrap(tank.heading), 3), a: round(wrap(tank.turret), 3), s: round(tank.speed, 1), n: stats.shots, r: resting ? 1 : 0, o: this.handShown === 'open' ? 1 : 0 };
  }

  /** A shot of the child's has hit their friend's tank, as this game decides: a point, and their game is told. */
  onFriendHit({ hits }) {
    this.session.sound.hit();
    this.friends.sendHit({ r: 1, m: 'ball', d: 1, tot: hits, sm: 0, sg: 0, sd: '' }, this.sinceGo);
    this.showBattle(null);
    this.bump('chip-mine');
  }

  /** The friend's shot has hit the child's tank, as their game says: their point, and it tickles. Nothing is lost. */
  onHitBy() {
    const { sound } = this.session;
    sound.tickled();
    this.showBattle(null);
    this.bump('chip-theirs');
    if (this.ticklesSaid < TICKLES_AT_MOST && !sound.currentVoice) {
      this.ticklesSaid += 1;
      this.sayAsGiraffe(GIRAFFE_TICKLES);
    }
  }

  /** The scores, and the time left. left is null when only a score has changed. */
  showBattle(left) {
    const { battle, patrol } = this;
    if (left !== null) battle.left = left;
    const { mine, theirs } = patrol.score;
    const key = `${mine}:${theirs}:${Math.ceil(battle.left)}`;
    if (key === battle.shown) return;
    battle.shown = key;
    byId('battle-mine').textContent = String(mine);
    byId('battle-theirs').textContent = String(theirs);
    byId('chip-time').textContent = clock(battle.left);
    byId('race-progress-fill').style.width = `${Math.round((1 - battle.left / battle.seconds) * 100)}%`;
  }

  /** A score that's gone up grows a little and settles, a move rather than a flash. */
  bump(id) {
    const chip = byId(id);
    chip.classList.remove('is-up');
    void chip.offsetWidth;
    chip.classList.add('is-up');
  }

  /** The time is up, or the friend has gone: the battle is over, and each child has the hits they made. */
  endBattle() {
    const { session } = this;
    this.patrol.endBattle();
    session.finishLine = BATTLE_OVER;
    session.finish();
  }

  /**
   * The friend has gone in the middle, and their tank goes too. A battle is over for the one still here. A patrol
   * together carries on, with half of what was left to stop: see friendGone in team.js.
   */
  friendGone(friend) {
    const { battle, team, patrol, session } = this;
    if (team && friend.id === team.friend.id) {
      patrol.friendGone();
      team.alone = true;
      this.field.friendTank?.setVisible(false);
      byId('chip-stopped-label').textContent = 'Stopped';
      this.showProgress();
      return;
    }
    if (!battle || friend.id !== battle.rival.id) return;
    patrol.friendGone();
    this.field.friendTank?.setVisible(false);
    if (session.screen === 'playing') this.endBattle();
  }

  /** Who won, with both scores, on the finish card. The friend's last hits can come in a moment later. */
  showBattleEnd() {
    const { battle, patrol } = this;
    const mine = patrol.score.mine;
    const theirs = Math.max(patrol.score.theirs, this.friends.results.get(battle.rival.id)?.dropped ?? 0);
    const key = `${mine}:${theirs}`;
    if (key === battle.endShown) return;
    battle.endShown = key;
    document.querySelector('#screen-finish h2').textContent = mine > theirs ? 'You won!' : mine === theirs ? 'You both won!' : 'Great game!';
    const line = byId('finish-score');
    line.hidden = false;
    line.innerHTML = `<span class="finish-side is-mine">${TANK_MARK}<span class="finish-who">You</span><span class="finish-points"></span></span><span class="finish-dash" aria-hidden="true">:</span><span class="finish-side is-friend"><span class="finish-points"></span><span class="finish-who"></span>${TANK_MARK}</span>`;
    // Names go in as text, never as markup.
    const [me, them] = line.querySelectorAll('.finish-side');
    me.querySelector('.finish-points').textContent = String(mine);
    them.querySelector('.finish-points').textContent = String(theirs);
    them.querySelector('.finish-who').textContent = battle.rival.spec.name;
  }

  /* ---------- every frame ---------- */

  /** What the hand is doing, which the meter on the screen says too. */
  readTheHand(snapshot) {
    const hand = readHand(snapshot);
    if (hand !== this.handShown) {
      this.handShown = hand;
      document.body.dataset.handRead = hand;
    }
    return hand;
  }

  update(dt, snapshot) {
    const { field, patrol, session } = this;
    const hand = this.readTheHand(snapshot);
    field.aspect = session.camera.aspect;
    const pointer = field.steer(dt, snapshot);
    if (this.battle || this.team) this.followFriend(dt);
    patrol.update(dt, { hand, pointer });
    if (this.battle) this.updateBattle();
    if (this.team) this.updateTeam();
    if (this.team) this.watchFriendLost();
    // The game may have just finished.
    if (session.screen !== 'playing') return;
    field.showMarks = true;
    field.playing = session.playSeconds > NAMES_AFTER_SECONDS;
    field.update(dt, hand);
    this.showPower();
    this.measureIn = (this.measureIn ?? 0) - dt;
    if (this.measureIn <= 0) {
      this.measureIn = 0.5;
      this.measureTop();
    }
    session.sound.engine(patrol.tank.speed / patrol.pace.drive);

    this.sinceAction = patrol.firing || patrol.tank.speed > 1 ? 0 : this.sinceAction + dt;
    this.closedFor = hand === 'closed' ? this.closedFor + dt : 0;
    this.openFor = hand === 'open' ? this.openFor + dt : 0;
    this.farFor = patrol.look === 'far' ? this.farFor + dt : 0;
    if (this.storyFor > 0) {
      this.storyFor -= dt;
      if (this.storyFor <= 0) this.story.hide();
    }
    this.updateFilm();
  }

  /** The film stays up until the child has driven and fired, and comes back if they seem stuck. */
  updateFilm() {
    const { session, patrol } = this;
    const { stats } = patrol;
    const learning = (stats.driven < DRIVEN_ENOUGH || stats.shots < SHOTS_ENOUGH) && session.playSeconds < FILM_AT_MOST_SECONDS;
    // With no hand there's nothing to show it to, and being asked for the hand comes first.
    const stuck = this.sinceAction > FILM_AGAIN_AFTER_SECONDS && patrol.hand !== 'none';
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
    const { field, patrol, session } = this;
    const counting = session.screen === 'countdown';
    const hand = this.readTheHand(snapshot);
    field.playing = false;
    if (this.preview || counting) patrol.warmUp(dt);
    // On a patrol together, the friend's game sees the robot tanks rolling in behind the countdown too.
    if (this.team && counting) this.updateTeam();
    // Behind the finish, the crews carry on waving and Giraffe carries on cheering.
    else if (session.screen === 'finish') patrol.update(dt);
    // After a battle, the friend's last hits, which can come a moment later, go on the finish card.
    if (this.battle && session.screen === 'finish') this.showBattleEnd();
    field.showMarks = counting;
    if (counting) {
      field.aspect = session.camera.aspect;
      const pointer = field.steer(dt, snapshot);
      patrol.hand = hand;
      patrol.closedFor = hand === 'closed' ? patrol.closedFor + dt : 0;
      patrol.aim(dt, hand, pointer);
      field.update(dt, hand);
    } else {
      field.update(dt, 'none');
    }
  }

  render() {
    this.field.render();
  }

  /** A prompt is read as long as it's up, and spoken only for the first few times. asks is 'open' if it asks for that. */
  once(key, text, asks) {
    if (this.lastPromptKey !== key) {
      this.lastPromptKey = key;
      this.spokenTimes.set(key, (this.spokenTimes.get(key) ?? 0) + 1);
    }
    return { key, text, side: null, silent: this.spokenTimes.get(key) > SPOKEN_AT_MOST, asks };
  }

  prompt(snapshot, dt) {
    const { session, patrol } = this;
    const needed = session.handsPrompt(snapshot, dt);
    if (needed && !needed.key.startsWith('closed')) {
      this.lastPromptKey = null;
      return needed;
    }
    const hand = readHand(snapshot);
    // Nothing else says what the ring on the ground means.
    if (!patrol.autoDrive && patrol.underShell) return this.once('look-out', LOOK_OUT);
    if (patrol.resting && hand === 'closed') return this.once('resting', SPOKEN.resting);
    if (!patrol.autoDrive && this.farFor > TOO_FAR_PROMPT_SECONDS) return this.once('far', TOO_FAR);
    // What the gun can fire at, as it fires: robot tanks that can be seen, and the cage, but not a
    // digger under the ground. In a battle, it's the friend's tank.
    const nearOne = patrol.targets.some((target) => patrol.inRange(target));
    if (hand === 'closed' && nearOne && !patrol.driving && this.closedFor > OPEN_PROMPT_SECONDS) return this.once('fire', OPEN_TO_FIRE, 'open');
    if (!patrol.autoDrive && hand === 'open' && !nearOne && this.openFor > CLOSE_PROMPT_SECONDS) return this.once('drive', CLOSE_TO_DRIVE);
    this.lastPromptKey = null;
    return null;
  }

  finished() {
    const { sound } = this.session;
    sound.stopPatrol();
    this.story.hide();
    this.field.showMarks = false;
    this.field.update(0, 'none');
    // The friend's finish card fills in with how this child did.
    // On a patrol together, it's how many of the robot tanks were this child's.
    const mine = this.battle ? this.patrol.score.mine : this.team ? this.patrol.stoppedBy.mine : this.patrol.stopped;
    // A child whose hearts ran out on a patrol together, or whose friend's did, says the team lost.
    if (this.friends.current) this.friends.finished(this.sinceGo, { n: mine, w: this.lost ? 0 : 1 });
  }

  summary() {
    const { stats } = this.patrol;
    const { hands } = this.session.settings;
    const onHand = (value, other = 0) => ({ left: hands === 'left' ? value : other, right: hands === 'right' ? value : other });
    const rowOf = (id) => byId(`sum-left-${id}`).closest('tr');
    this.friends.showResults();
    rowOf('tanks').hidden = Boolean(this.battle);
    rowOf('hits').hidden = !this.battle;
    byId('finish-score').hidden = !this.battle;
    if (this.battle) {
      // A battle: the hits each child made, and who won. It doesn't move anyone's own level on.
      const { mine } = this.patrol.score;
      rowOf('prizes').hidden = true;
      rowOf('friends').hidden = true;
      document.querySelector('.finish-hero').lastChild.textContent = mine === 1 ? ' hit' : ' hits';
      this.battle.endShown = null;
      this.showBattleEnd();
      return { hero: mine, noun: 'battle', rows: { hits: onHand(mine) }, won: true, countsForLevel: false };
    }
    if (this.team) {
      // A patrol together: how many the two stopped between them, and how many of those were this child's. On
      // Medium and Tough the two can lose it together. It doesn't move anyone's own level on.
      rowOf('prizes').hidden = true;
      rowOf('friends').hidden = true;
      return { hero: this.patrol.stopped, noun: 'patrol', rows: { tanks: onHand(this.patrol.stoppedBy.mine) }, won: !this.lost, countsForLevel: false };
    }
    // What was picked up, from level 2 on, and any friend let out of a cage, from level 6.
    const { plan } = this.patrol;
    const haul = Object.entries(this.patrol.haul).filter(([key, value]) => key !== 'friends' && (value > 0 || key === 'bolts'));
    const prizes = haul.map(([key, value]) => `${PRIZES[key.slice(0, -1)].mark} ${value}`).join('  ');
    rowOf('prizes').hidden = !plan.bolts;
    rowOf('friends').hidden = !plan.cage;
    // Running out of hearts, which only Medium and Tough allow, means trying the same level again. A patrol
    // started with friends, with nobody else ready, is on the host's level, so it doesn't move it on either.
    return { hero: stats.stopped, noun: 'patrol', rows: { tanks: onHand(stats.stopped), prizes: onHand(plan.bolts ? prizes : '', ''), friends: onHand(stats.friends) }, won: this.patrol.state !== 'lost', countsForLevel: !this.friends.current };
  }
}

const choice = (name, value, label) => `<label><input type="radio" name="${name}" value="${value}"> ${label}</label>`;

new GameSession({
  // What the open and closed hand do here, for the hand shapes in the grown-ups' panel: see core/shapes.js.
  moves: { open: 'Fire', closed: 'Drive' },
  shell: {
    title: 'Tank Patrol',
    startLabel: 'Climb aboard',
    againLabel: 'Go again',
    finishTitle: FINISH,
    heroMark: '⭐',
    heroNoun: 'tanks stopped',
    extraRows: [{ id: 'tanks', label: 'Tanks stopped' }, { id: 'hits', label: 'Hits on the other tank' }, { id: 'prizes', label: 'Prizes' }, { id: 'friends', label: 'Friends freed' }],
    hudTop: `
      <div class="hud-top">
        <div class="chips">
          <div class="chip chip-solo"><span class="chip-label">Tanks left</span><span id="chip-left" class="chip-value">6</span></div>
          <div class="chip chip-solo"><span id="chip-stopped-label" class="chip-label">Stopped</span><span id="chip-stopped" class="chip-value">0</span></div>
          <div class="chip chip-hearts chip-solo"><span class="chip-label">Hearts</span><span id="chip-hearts" class="chip-value"></span></div>
          <div id="chip-mine" class="chip chip-battle is-mine" hidden><span class="chip-label">${TANK_MARK}You</span><span id="battle-mine" class="chip-value">0</span></div>
          <div id="chip-theirs" class="chip chip-battle is-friend" hidden><span class="chip-label">${TANK_MARK}<span id="battle-name" class="battle-name"></span></span><span id="battle-theirs" class="chip-value">0</span></div>
          <div id="chip-time-box" class="chip chip-time" hidden><span class="chip-label">Time</span><span id="chip-time" class="chip-value">2:00</span></div>
        </div>
        <div class="race-progress" aria-hidden="true"><div id="race-progress-fill" class="race-progress-fill"></div></div>
        <div class="chips chips-more">
          <div id="chip-haul" class="chip chip-haul" hidden><span class="chip-label">Prizes</span><span class="chip-value">${['bolts', 'gems', 'stars', 'friends'].map((key) => `<span class="haul" data-haul="${key}" ${key === 'bolts' ? '' : 'hidden'}><span aria-hidden="true">${{ bolts: '🔩', gems: '💎', stars: '🌟', friends: '🤗' }[key]}</span><span class="haul-count">0</span></span>`).join('')}</span></div>
          <div id="chip-power" class="chip chip-power" hidden><span class="chip-label">Power-up</span><span class="chip-value"></span></div>
        </div>
      </div>
      ${STORY_BOX}
      <div class="film" aria-hidden="true">
        <svg viewBox="0 0 220 220">
          <rect class="film-ground" width="220" height="220" />
          <path class="film-road" d="M30 140L100 92L190 50" />
          <g class="film-go-mark">
            <ellipse class="film-go-edge" cx="104" cy="88" rx="28" ry="21" />
            <ellipse class="film-go" cx="104" cy="88" rx="28" ry="21" />
          </g>
          <g class="film-robot">
            <rect class="film-treads" x="-27" y="4" width="54" height="13" rx="6" />
            <rect class="film-robot-body" x="-23" y="-16" width="46" height="24" rx="8" />
            <circle class="film-robot-eye" cx="-9" cy="-6" r="7" />
            <circle class="film-robot-eye" cx="9" cy="-6" r="7" />
            <circle class="film-pupil" cx="-10" cy="-5" r="3" />
            <circle class="film-pupil" cx="8" cy="-5" r="3" />
          </g>
          <g class="film-stars">
            <path class="film-star" d="M0-12l3.500 8 8.500 1-6.500 5.500 2 8.500-7.500-4.500-7.500 4.500 2-8.500L-11-3l8.500-1z" />
          </g>
          <g class="film-sight-mark">
            <circle class="film-sight-edge" cx="172" cy="44" r="32" />
            <circle class="film-sight" cx="172" cy="44" r="32" />
          </g>
          <g class="film-balls"><circle class="film-ball" r="5" /><circle class="film-ball" r="5" /><circle class="film-ball" r="5" /></g>
          <g class="film-tank">
            <rect class="film-treads" x="-28" y="8" width="56" height="14" rx="7" />
            <rect class="film-body" x="-24" y="-8" width="48" height="20" rx="7" />
            <g class="film-turret">
              <rect class="film-gun" x="10" y="-15" width="30" height="7" rx="3" transform="rotate(-34 10 -12)" />
            </g>
            <path class="film-neck" d="M-4-8L-8-34" />
            <path class="film-horns" d="M-14-46l-2-6M-4-46l2-6" />
            <ellipse class="film-head" cx="-9" cy="-40" rx="10" ry="8" />
            <circle class="film-eye" cx="-12" cy="-41" r="1.800" />
            <circle class="film-eye" cx="-5" cy="-41" r="1.800" />
          </g>
          <g class="film-hand">
            <rect x="28" y="168" width="44" height="36" rx="15" />
            <path d="M34 172V148" />
            <path d="M45 168V138" />
            <path d="M57 168V136" />
            <path d="M67 172V144" />
            <path class="film-thumb" d="M72 192L90 178" />
          </g>
        </svg>
      </div>`,
    panelSettings: `
      <fieldset class="choice">
        <legend>Driving</legend>
        ${choice('driving', 'closed', 'A closed hand drives the tank')}
        ${choice('driving', 'auto', 'By itself, towards any tank out of range, for a child who can’t close their hand easily')}
      </fieldset>
      <fieldset class="choice">
        <legend>Speed</legend>
        ${choice('pace', 'slow', 'Slow')}
        ${choice('pace', 'medium', 'Medium')}
        ${choice('pace', 'fast', 'Fast')}
      </fieldset>
      <fieldset class="choice">
        <legend>Reach help (the crosshair is pulled onto a tank near it)</legend>
        ${choice('reach', 'none', 'A little')}
        ${choice('reach', 'little', 'More')}
        ${choice('reach', 'lots', 'A lot')}
      </fieldset>
      <fieldset class="choice">
        <legend>How hard the robots’ shells come</legend>
        ${choice('tankShells', 'gentle', 'Gentle: the shells are slow, hearts stop at one, and it can’t be lost')}
        ${choice('tankShells', 'medium', 'Medium: the shells can win, and the patrol ends when the hearts run out')}
        ${choice('tankShells', 'tough', 'Tough: fewer hearts, and the shells come thick and fast')}
      </fieldset>
      <fieldset class="choice">
        <legend>Robot tanks to stop (together with a friend, twice as many between you. Against each other, the battle lasts 2, 3 or 4 minutes)</legend>
        ${choice('tanks', '6', '6')}
        ${choice('tanks', '10', '10')}
        ${choice('tanks', '15', '15')}
      </fieldset>
      <fieldset class="choice">
        <legend>With a friend</legend>
        ${choice('tankFriends', 'together', 'Together: both tanks stop the robot tanks, side by side')}
        ${choice('tankFriends', 'against', 'Against each other: tank against tank, with no robot tanks')}
      </fieldset>`,
  },
  defaults: { pace: 'slow', reach: 'little', driving: 'closed', tankShells: 'medium', tanks: 6, tankFriends: 'together' },
  choices: { pace: String, reach: String, driving: String, tankShells: String, tanks: Number, tankFriends: String },
  // These go on to a game that's being played at once. The rest, and the level, start it again: see core/settings.js.
  atOnce: ['pace', 'reach', 'driving'],
  tagline: (side) => `Robot tanks are rolling into Giraffe’s valley! Close your ${side} hand to drive, and open it to fire.`,
  finishLine: FINISH,
  lines: new URL('./audio/voice/lines.json', import.meta.url),
  portraits: () => renderPortraits([characterById('giraffe')]),
  createSound: (options) => new PatrolSound(options),
  createGame: (session) => new TankGame(session),
}).start();
