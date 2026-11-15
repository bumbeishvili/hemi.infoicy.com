// Arrow Meadow: it's the meadow fair, and Giraffe is in the archery contest. The child holds his bow with one hand
// and his bowstring with the other. The bow hand, up or down, tilts the bow, pulling the hands apart draws it, and
// opening the string hand lets the arrow fly, in an arc a dotted line shows beforehand. It's the game for both hands
// doing different jobs at once: one steadies while the other acts, and the hand in play opens on purpose, to let go.
// How the hands are read is in bow.js, the rules are in meadow.js, and the meadow is drawn by view.js. On their own,
// or with friends, each on their own computer: together at the same targets, or against each other.
import { renderPortraits } from '../../core/body/portraits.js';
import { byId as characterWithId, ROSTER } from '../../core/body/roster.js';
import { Track } from '../../core/friends.js';
import { FriendsPanel } from '../../core/friends-ui.js';
import { GameSession, SPOKEN } from '../../core/session.js';
import { Sound } from '../../core/sound.js';
import { STORY_BOX, StoryBox } from '../../core/story.js';
import { archerPixels, renderArcher } from './archer.js';
import { Bow } from './bow.js';
import { GOALS, HELP_NAMES, Meadow, meadowNewAt, MIN_DRAW, PARTY_SECONDS } from './meadow.js';
import { ARCHER, MeadowView } from './view.js';

const byId = (id) => document.getElementById(id);
const FINISH = 'We won the contest! What an archer!';
const INTRO = 'It’s the meadow fair! Help me hit the targets!';
const TAKE = 'Close your hand to hold the string!';
const PULL = 'Pull the string back!';
const LET_GO = 'Open your hand to let the arrow go!';
const OTHER_HAND = 'Hold up your other hand, for the bow!';
const TOGETHER_DONE = 'You did it together!';
const YOU_WON = 'You won the contest!';
const GREAT_SHOOTING = 'Great shooting!';
// When the quiver was empty before enough targets were hit. It's on the card. The voice says what it says after
// any game that was lost.
const OUT_OF_ARROWS = 'Out of arrows! So close!';
const LOST_LINE = 'So close! Try again!'; // One of the lines every game has: see SO_CLOSE in core/sound.js.
const PRAISE = ['Nice one!', 'Way to go!', 'Great job!'];
const PRAISE_EVERY = 3; // Hits between one word of praise and the next.
const FILM_SECONDS = 30; // The little film of what to do shows until the first hit, or this long.
const STORY_SECONDS = 6; // Giraffe's words stay up this long, or until the first hit.
const TAKE_AFTER = 3; // Seconds of an open string hand before saying to close it on the string.
const PULL_AFTER = 3; // Seconds of holding a string that isn't pulled back before saying to pull it.
const PULL_SHOWN = 2.5; // And how long that's said for after letting go of one that wasn't.
const LET_GO_AFTER = 5; // Seconds of holding a drawn bow before saying how to let go.
const OTHER_AFTER = 2.5; // Seconds without the bow hand before asking for it.
const RESTING_AFTER = 15; // Seconds without an arrow before saying that resting is fine.
const SPOKEN_AT_MOST = 2; // Each thing is said out loud this many times in a game, and only read after that.
const BIRDS_LEVEL = 0.1;
// Playing with friends, each on their own computer. See core/friends-ui.js for what each of these is.
const ARROW_WORDS = {
  toggle: 'Play with friends',
  make: 'Make a game',
  codeLabel: 'A friend’s game code',
  codeName: 'Game code',
  how: 'Tell your friends the code. Then you all press <b>Pick up the bow</b>, and the first to hit enough targets wins.',
  // Together or against each other, as whoever made the game chooses: see teams in core/friends-ui.js.
  together: 'Together',
  against: 'Against each other',
  howTogether: 'Tell your friends the code. Then you all press <b>Pick up the bow</b>, and hit the targets as a team.',
  teamTitle: TOGETHER_DONE,
  leave: 'Leave this game',
  privacy: 'Only your name, whether you chose together or against each other, how your bow is tilted and drawn, the arrows you let go and the targets you hit go to your friends. The camera picture stays on this computer.',
  alone: 'Play on your own',
  full: 'That game already has 4 players.',
  lost: 'Can’t reach the game. Check the internet, then try again.',
  left: 'You’ve left the game.',
  badCode: 'A game code is 3 letters and numbers.',
  busy: 'Playing',
  still: 'still shooting',
};
// A friend's bow between what their game sends: how it's tilted and drawn go smoothly from one to the next, and
// whether the string is held, and whether their hands can be seen, change half way.
const BOW_TRACK = { lerp: ['a', 'd'], steps: ['h', 'v'] };
const GHOST_FADE_RATE = 8; // How quickly a friend's bow fades in and out, as their hands come and go.
const GHOST_QUIET_MS = 1500; // A friend's bow nothing has come from for this long, as in their hand check, fades away.
const round2 = (value) => Math.round(value * 100) / 100;
const round3 = (value) => Math.round(value * 1000) / 1000;
// Where each thing a level brings is, for its label the first time it comes.
const LABEL_FOR = { balloon: 'balloon', far: 'far', roller: 'roller', wall: 'wall', bell: 'bell', mill: 'mill', gift: 'bird', castle: 'castle' };

class ArcherGame {
  chimeOnOpen = false; // The hand opens for every arrow here, and the arrow has its own sound.
  bothHands = true; // Both hands are drawn on the camera's picture, as both are played with.

  constructor(session) {
    this.session = session;
    const { settings } = session;
    this.view = new MeadowView(byId('game'), {
      language: () => settings.language,
      prizeTarget: () => {
        const box = byId('chip-stars')?.closest('.chip')?.getBoundingClientRect();
        return box?.width ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : { x: 220, y: 50 };
      },
    });
    try {
      // Drawn as big as he'll be shown on this screen, even full screen, so he's sharp.
      const tallest = Math.max(window.innerHeight, window.screen?.height || 0);
      this.view.archer = renderArcher(characterWithId('giraffe'), archerPixels(tallest * ARCHER.tall, this.view.ratio));
    } catch (error) {
      // Without his picture the game still works: the bow is held up by his two arms.
      console.warn('Could not draw Giraffe:', error);
    }
    this.story = new StoryBox(session);
    this.bow = new Bow({ reach: settings.arrowReach });
    this.mode = 'solo'; // Or with friends: 'team', together at the same targets, or 'race', against each other.
    this.others = [];
    this.goAt = 0;
    this.meadow = this.newMeadow(session.level);
    this.resetCounts();
    // A game with friends, if a grown-up makes or joins one.
    this.friends = new FriendsPanel({
      game: 'arrow-meadow',
      linkKey: 'arrows',
      words: ARROW_WORDS,
      // Everyone here plays as Giraffe. The host's number of targets says how many win it: for each player
      // together, or for the first to them against each other.
      hello: () => ({ driver: 'giraffe', level: session.levels.current, length: this.goalChosen() }),
      // Together or against each other: a choice in the panel, which the friends box can change too.
      teams: {
        get: () => (settings.arrowFriends === 'against' ? 'against' : 'together'),
        set: (choice) => this.chooseTeams(choice),
      },
      screen: () => session.screen,
      portraits: () => session.portraits,
      onMove: (id, message) => this.fromFriend(id, message),
      onGone: (friend) => this.friendGone(friend),
      // Whoever hit the most targets, and equal ones share the place.
      rank: (a, b) => b.dropped - a.dropped,
      resultText: ({ dropped }) => `${dropped} ${dropped === 1 ? 'target' : 'targets'}`,
      titles: { first: YOU_WON, other: GREAT_SHOOTING },
      startAfter: byId('start'),
      waitingBefore: byId('screen-finish'),
      resultsAfter: document.querySelector('#screen-finish .finish-hero'),
      finishTitle: document.querySelector('#screen-finish h2'),
    });
    const game = this;
    this.debug = {
      view: this.view,
      bow: this.bow,
      get meadow() {
        return game.meadow;
      },
      get game() {
        return game;
      },
      get friends() {
        return game.friends;
      },
    };
  }

  resetCounts() {
    this.hands = this.bow.state;
    this.aim = null;
    this.ready = false;
    this.shots = 0;
    this.lastShot = { angle: 0, draw: 0 };
    this.openFor = 0;
    this.heldFor = 0;
    this.weakFor = 0;
    this.pullShownFor = 0;
    this.bowAwayFor = 0;
    this.restFor = 0;
    this.praised = 0;
    this.filmShown = false;
    this.storyFor = 0;
    this.spokenTimes = new Map();
    this.lastPromptKey = null;
    this.beaten = false;
    this.happened = {}; // How many times each thing the rules say has happened, for the automated tests.
  }

  /* ---------- the grown-ups' choices ---------- */

  get settings() {
    return this.session.settings;
  }

  goalChosen() {
    const goal = Number(this.settings.arrowGoal);
    return GOALS.includes(goal) ? goal : 10;
  }

  helpChosen() {
    return HELP_NAMES.includes(this.settings.arrowHelp) ? this.settings.arrowHelp : 'off';
  }

  /** As many arrows as it takes, targets that wait, and nothing lost, as the contest always was, if a grown-up chose it. */
  get gentle() {
    return this.settings.arrowQuiver === 'gentle';
  }

  /**
   * A meadow on their own, or with friends: together, one meadow shared through the server, to the host's number
   * of targets for each player, or against each other, a lane of one's own with the same targets as everyone's.
   */
  newMeadow(level, friendly = null) {
    const common = { help: this.helpChosen(), onEvent: (event) => this.onMeadow(event) };
    if (!friendly) return new Meadow({ ...common, level, goal: this.goalChosen(), gentle: this.gentle });
    const each = GOALS.includes(friendly.length) ? friendly.length : 10;
    const me = this.friends.room.you;
    if (friendly.team) {
      const players = friendly.racers.length;
      return new Meadow({ ...common, level: friendly.level, goal: each * players, me, team: { seed: friendly.seed, players, claim: (k) => this.friends.claim(k) } });
    }
    return new Meadow({ ...common, level: friendly.level, goal: each, me, race: { seed: friendly.seed } });
  }

  /** With friends, the start waits until they're ready too. */
  holdStart(go) {
    return this.friends.holdStart(go);
  }

  /** How long since "GO!", by the clock on the wall, for friends' games. */
  get sinceGo() {
    return performance.now() - this.goAt;
  }

  newAt(level) {
    return meadowNewAt(level);
  }

  /** The string hand is on its own side of the picture, so with the right hand in play Giraffe is on the right. */
  setHands(side) {
    this.view.setScene({ flip: side === 'right' });
    this.bow.reset();
    this.hands = this.bow.state;
  }

  settingChanged(change) {
    const { screen } = this.session;
    if ('arrowReach' in change) this.bow.setReach(change.arrowReach);
    if ('arrowHelp' in change) this.meadow.help = this.helpChosen();
    // A new number of targets starts with the next contest, and the title shows it now.
    if (('arrowGoal' in change || 'arrowQuiver' in change) && screen !== 'playing' && screen !== 'countdown') {
      this.meadow = this.newMeadow(this.session.level);
      this.showProgress();
    }
    if ('arrowGoal' in change || 'arrowFriends' in change) {
      if (this.friends.room.inRoom) this.friends.room.tell(this.friends.hello());
    }
    if ('arrowFriends' in change) this.friends.showTeams();
  }

  /** Together or against each other, chosen in the friends box: kept with the grown-ups' settings, and shown there. */
  chooseTeams(choice) {
    this.session.changeSettings({ arrowFriends: choice });
    const input = document.querySelector(`input[name="arrowFriends"][value="${choice}"]`);
    if (input) input.checked = true;
  }

  /* ---------- a new contest ---------- */

  prepare(level) {
    // With friends, everyone has the host's level and number of targets, in the plain meadow, which doesn't move
    // anyone's own level on. Each child keeps their own hand, how far a full draw is, and help with aiming.
    const friendly = this.friends.current;
    this.mode = friendly ? (friendly.team ? 'team' : 'race') : 'solo';
    document.body.toggleAttribute('data-friends-race', Boolean(friendly));
    document.body.dataset.arrows = this.mode;
    this.meadow = this.newMeadow(level, friendly);
    this.others = (friendly?.friends ?? []).map((friend) => ({ id: friend.id, name: friend.spec.name, track: new Track(BOW_TRACK), shots: null, hits: 0, fade: 0, heardAt: -Infinity, at: null }));
    this.session.finishLine = this.mode === 'team' ? TOGETHER_DONE : this.mode === 'race' ? YOU_WON : FINISH;
    this.view.setScene({ castle: this.meadow.plan.castle });
    this.view.reset();
    this.bow.reset();
    this.resetCounts();
    this.story.hide();
    this.showProgress();
    this.showScores();
    // Stars only come from level 2, on their own.
    const { stars } = this.meadow;
    byId('chip-stars-box').hidden = !stars;
    byId('sum-left-stars').closest('tr').hidden = !stars;
    byId('chip-targets-label').textContent = this.mode === 'team' ? 'Together' : 'Targets';
  }

  begin() {
    this.goAt = performance.now();
    this.session.sound.startLoop('birds', BIRDS_LEVEL);
    this.story.say('giraffe', INTRO);
    this.storyFor = STORY_SECONDS;
    for (const target of this.meadow.targets) this.introduce(target);
    if (this.meadow.plan.wind) this.view.introduce('wind', () => (this.meadow.phase === 'play' ? { x: 0.56, y: 0.44 } : null));
  }

  /** What a level brings is named the first time it comes, by where it is. */
  introduce(target) {
    const key = LABEL_FOR[target.kind];
    if (!key) return;
    const { meadow } = this;
    this.view.introduce(key, () => {
      if (!meadow.targets.includes(target) || target.state !== 'up') return null;
      const where = meadow.whereAt(target);
      // The bird's label waits until its gift is well over the meadow.
      if (target.kind === 'gift' && where.x > 1.62) return null;
      return { x: where.x, y: where.y - target.r };
    });
  }

  /** What the rules say happens, heard and seen. */
  onMeadow(event) {
    const { sound } = this.session;
    const { view, meadow } = this;
    if (!view || !sound) return;
    const what = event.type === 'bonk' ? `bonk-${event.what}` : event.type;
    if (this.happened) this.happened[what] = (this.happened[what] ?? 0) + 1;
    const at = event.at ? view.at(event.at.x, event.at.y) : null;
    switch (event.type) {
      case 'spawn':
        if (this.session.screen === 'playing') this.introduce(event.target);
        break;
      case 'loose':
        if (!event.arrow.ghost) sound.play(`whoosh${1 + (event.arrow.id % 3)}`, { gain: 0.3 + 0.25 * event.arrow.shot.draw, rate: 0.95 + 0.25 * event.arrow.shot.draw });
        break;
      case 'hit': {
        const { kind } = event.target;
        if (kind === 'balloon') {
          sound.play('pop', { gain: 0.45, rate: 0.95 + (event.target.id % 4) * 0.05 });
          view.pop(at.x, at.y, '#ffffff');
        } else if (kind === 'bell') {
          sound.play('bell', { gain: 0.3, rate: 1.5 });
        } else if (kind === 'gift') {
          sound.play('pop', { gain: 0.35, rate: 1.3 });
          sound.play('sparkle', { gain: 0.3 });
        } else {
          sound.play('thud', { gain: 0.55, rate: 1.15 + (event.target.id % 3) * 0.06 });
        }
        view.burst(at.x, at.y, kind === 'castle' ? '#ffd23f' : '#ffe066');
        view.glad();
        this.story.hide();
        // With friends together, whose it is comes from the server, and it counts then.
        if (!event.asked) this.praise();
        this.showProgress();
        break;
      }
      case 'claimed':
        if (event.mine) this.praise();
        else if (event.target) {
          const where = meadow.whereAt(event.target);
          const there = view.at(where.x, where.y);
          view.sparkle(there.x, there.y, '#dfe7ef');
          sound.play('thud', { gain: 0.25, rate: 1.3 });
        }
        this.showProgress();
        this.showScores();
        break;
      case 'prize':
        view.prize(event.kind, event.at.x, event.at.y, event.count);
        sound.star();
        setTimeout(() => this.showProgress(), 900);
        break;
      case 'land':
        if (!event.arrow.ghost) sound.play('rustle', { gain: 0.22, rate: 1.2 });
        view.puff(at.x, at.y, 'rgb(190 235 160 / 0.9)');
        break;
      case 'bonk':
        if (!event.arrow.ghost) sound.play(event.what === 'wall' ? 'block' : 'boing', { gain: event.what === 'wall' ? 0.5 : 0.22, rate: event.what === 'wall' ? 0.9 : 1.3 });
        view.puff(at.x, at.y, event.what === 'wall' ? 'rgb(246 217 127 / 0.95)' : 'rgb(255 255 255 / 0.9)');
        break;
      case 'grow': {
        const where = view.at(event.target.x, event.target.y);
        view.sparkle(where.x, where.y, '#ffffff');
        sound.play('sparkle', { gain: 0.12, rate: 0.8 });
        break;
      }
      case 'wind':
        if (this.session.screen === 'playing') sound.play('flap', { gain: 0.3 });
        break;
      case 'castle':
        sound.play('sparkle', { gain: 0.3 });
        this.introduce(event.target);
        this.showProgress();
        break;
      case 'trophy':
        sound.play('found', { gain: 0.5 });
        view.burst(at.x, at.y, '#ffd23f');
        view.prize('trophy', event.at.x, event.at.y);
        break;
      case 'leave':
        // A target that has stood long enough goes, softly, and another comes.
        sound.play('rustle', { gain: 0.18, rate: 0.9 });
        break;
      case 'out':
        // The quiver is empty and the contest isn't won: it's over, to try again.
        sound.play('flap', { gain: 0.3, rate: 0.8 });
        this.story.hide();
        this.showProgress();
        break;
      case 'won':
        sound.play('cheer', { gain: 0.45 });
        view.party(PARTY_SECONDS);
        this.story.hide();
        this.showProgress();
        break;
      default:
    }
  }

  /** A word of praise now and then, if nothing else is being said. */
  praise() {
    if (this.praised % PRAISE_EVERY === 0) this.session.sound.say(PRAISE[Math.floor(this.praised / PRAISE_EVERY) % PRAISE.length], { ifQuiet: true });
    this.praised += 1;
  }

  /* ---------- each frame ---------- */

  /**
   * What the two hands are asking for, and the arc an arrow would fly: the dotted line. With the string held and
   * the bow drawn far enough to shoot, it's the whole arc, and otherwise only the start of it, to say which way
   * the bow points.
   */
  readHands(snapshot) {
    const hands = this.bow.read(snapshot, this.session.camera.aspect, performance.now());
    this.hands = hands;
    this.ready = hands.nocked && hands.draw >= MIN_DRAW;
    this.aim = hands.both || hands.nocked ? this.meadow.aimFor(hands.angle, this.ready ? hands.draw : Math.max(hands.draw, 0.6)) : null;
    return hands;
  }

  update(dt, snapshot) {
    const { view, meadow, session } = this;
    const before = this.hands.nocked;
    const hands = this.readHands(snapshot);
    if (hands.nocked && !before) session.sound.play('tick', { gain: 0.18, rate: 1.3 });
    if (hands.loosed && meadow.phase !== 'won') {
      // The arrow flies along the arc the dotted line showed as the hand began to open.
      const shot = meadow.aimFor(hands.loosed.angle, hands.loosed.draw);
      if (meadow.loose(shot.angle, shot.draw)) {
        this.shots += 1;
        this.lastShot = { angle: shot.angle, draw: shot.draw };
        this.restFor = 0;
      }
    }
    // A target only stands for so long while both hands are in the picture.
    meadow.update(dt, { present: hands.both });
    // The bird's gift is named once it's over the meadow, which is a while after it sets out.
    if (meadow.bird?.gift.state === 'up') this.introduce(meadow.bird.gift);
    view.update(dt, { bow: hands, wind: meadow.wind });
    if (this.mode !== 'solo' && session.screen === 'playing') {
      this.friends.sendMove('archer', this.bowState(), this.sinceGo);
      this.showFriendsBows(dt);
    }
    // What the hands have been doing, and for how long, for what to say.
    const stringOnly = hands.stringSeen && !hands.bowSeen && !snapshot.overlap;
    this.bowAwayFor = stringOnly ? this.bowAwayFor + dt : 0;
    this.openFor = hands.both && !hands.nocked ? this.openFor + dt : 0;
    this.heldFor = this.ready ? this.heldFor + dt : 0;
    this.weakFor = hands.nocked && !this.ready ? this.weakFor + dt : 0;
    // Letting go of a string that wasn't pulled back says so at once, for a moment.
    this.pullShownFor = hands.slack ? PULL_SHOWN : Math.max(0, this.pullShownFor - dt);
    this.restFor += dt;
    this.showFilm();
    if (this.storyFor > 0) {
      this.storyFor -= dt;
      if (this.storyFor <= 0) this.story.hide();
    }
    if (meadow.done && session.screen === 'playing') session.finish();
  }

  idle(dt, snapshot) {
    const { screen } = this.session;
    if (this.filmShown) {
      this.filmShown = false;
      document.body.dataset.film = 'off';
    }
    // During the countdown the bow follows the hands, so the child can find them. Nothing is let go.
    if (screen === 'countdown') {
      this.readHands(snapshot);
    } else if (this.hands !== null && (this.hands.both || this.hands.nocked)) {
      this.bow.reset();
      this.hands = this.bow.state;
      this.aim = null;
      this.ready = false;
    }
    this.view.update(dt, { bow: screen === 'countdown' ? this.hands : null, wind: this.meadow.wind });
  }

  /** Whether the string is held without being pulled back far enough to shoot, and has been for a while. */
  get pulling() {
    return this.weakFor > PULL_AFTER || this.pullShownFor > 0;
  }

  /** The little film of what to do: until the first hit, or a while, and again for a child who seems stuck. */
  showFilm() {
    const stuck = this.heldFor > LET_GO_AFTER || this.openFor > TAKE_AFTER + 1 || this.pulling;
    const wanted = (this.meadow.stats.hits === 0 && this.session.playSeconds < FILM_SECONDS) || stuck;
    if (wanted !== this.filmShown) {
      this.filmShown = wanted;
      document.body.dataset.film = wanted ? 'on' : 'off';
    }
  }

  render() {
    const { screen } = this.session;
    const playing = screen === 'playing' || screen === 'countdown';
    const ghosts = [];
    let row = 0;
    for (const each of screen === 'playing' ? this.others : []) {
      if (!each.at || each.fade < 0.02) continue;
      ghosts.push({ angle: each.at.a, draw: each.at.d, nocked: Boolean(each.at.h), name: each.name, alpha: each.fade, row });
      row += 1;
    }
    this.view.render({ meadow: this.meadow, bow: playing ? this.hands : null, aim: screen === 'playing' ? this.aim : null, ready: this.ready, ghosts, playing });
  }

  /* ---------- with friends ---------- */

  /**
   * How the child's bow is, for friends' games: how it's tilted and drawn, whether the string is held and the
   * hands can be seen, how many arrows have been let go, with the angle and the draw of the last, so their games can
   * show it flying, and how many targets this child has hit.
   */
  bowState() {
    const { hands } = this;
    return {
      a: round3(this.aim?.angle ?? hands.angle),
      d: round2(hands.draw),
      h: hands.nocked ? 1 : 0,
      v: hands.both ? 1 : 0,
      n: this.shots,
      sa: round3(this.lastShot.angle),
      sp: round2(this.lastShot.draw),
      k: this.meadow.stats.hits,
    };
  }

  /** Each friend's bow, as it is on their screen a moment ago, fading in and out as their hands come and go. */
  showFriendsBows(dt) {
    const now = performance.now();
    for (const each of this.others) {
      const at = each.track.at(now);
      const seen = Boolean(at?.v) && now - each.heardAt < GHOST_QUIET_MS && !this.friends.results.has(each.id);
      each.fade += ((seen ? 1 : 0) - each.fade) * (1 - Math.exp(-dt * GHOST_FADE_RATE));
      if (at) each.at = at;
    }
  }

  /** Something from a friend's game: how their bow is and what they've let go, or whose a target was. */
  fromFriend(id, message) {
    if (message.t === 'claimed') {
      if (this.mode === 'team' && this.friends.current?.racers.includes(message.by)) this.meadow.claimed(message.k, message.by);
      return;
    }
    if (message.t !== 'archer' || this.session.screen !== 'playing') return;
    const each = this.others.find((other) => other.id === id);
    if (!each) return;
    each.track.push(message, performance.now());
    each.heardAt = performance.now();
    // Together, an arrow of theirs is shown flying, as theirs flew: it hits nothing here. Against each other their
    // targets are in a lane of their own, so only their bow is shown.
    if (this.mode === 'team' && each.shots !== null && message.n > each.shots) this.meadow.loose(message.sa, message.sp, { ghost: true, by: id });
    each.shots = message.n;
    if (message.k !== each.hits) {
      each.hits = message.k;
      this.showScores();
    }
    // Against each other, the first to enough targets ends it for everyone.
    if (this.mode === 'race' && each.hits >= this.meadow.goal && this.meadow.phase === 'play') {
      this.beaten = true;
      this.session.finishLine = GREAT_SHOOTING;
      this.session.finish();
    }
  }

  /**
   * A friend has gone, and their bow with them. Together, what they hit stays hit, and the rest finish with as
   * many targets fewer as that friend's share of what was left.
   */
  friendGone(friend) {
    const before = this.others.length + 1;
    this.others = this.others.filter((each) => each.id !== friend.id);
    if (this.mode === 'team' && this.session.screen === 'playing') this.meadow.fewer(before, this.others.length + 1);
    this.showProgress();
    this.showScores();
  }

  /** With friends, how many targets each one has hit so far, the most first. */
  showScores() {
    const list = byId('arrow-scores');
    const { current } = this.friends;
    list.hidden = this.mode === 'solo' || !current;
    if (list.hidden) return;
    const portraits = this.session.portraits ?? {};
    const you = this.friends.room.you;
    const hitsOf = (id) => (this.mode === 'team' ? this.meadow.tally.get(id) ?? 0 : id === you ? this.meadow.stats.hits : this.others.find((each) => each.id === id)?.hits ?? 0);
    const everyone = [{ id: you, name: 'You' }, ...this.others.map((each) => ({ id: each.id, name: each.name }))]
      .map((each) => ({ ...each, hits: hitsOf(each.id) }))
      .sort((a, b) => b.hits - a.hits);
    const key = everyone.map(({ id, hits }) => `${id}:${hits}`).join(',');
    if (list.dataset.key === key) return;
    list.dataset.key = key;
    list.replaceChildren(...everyone.map((each) => {
      const row = document.createElement('li');
      row.classList.toggle('is-you', each.id === you);
      const face = document.createElement('img');
      face.alt = '';
      face.src = portraits.giraffe ?? '';
      const name = document.createElement('span');
      name.className = 'arrow-score-name';
      name.textContent = each.name;
      const hits = document.createElement('span');
      hits.className = 'arrow-score';
      hits.textContent = String(each.hits);
      row.append(face, name, hits);
      return row;
    }));
  }

  /* ---------- the top of the screen ---------- */

  showProgress() {
    const { meadow } = this;
    byId('chip-targets').textContent = `${Math.min(meadow.total, meadow.goal)} of ${meadow.goal}`;
    byId('chip-stars').textContent = String(meadow.stats.stars);
    // The arrows left in the quiver, where there are only so many.
    const counted = Number.isFinite(meadow.arrowsLeft);
    byId('chip-quiver-box').hidden = !counted;
    if (counted) byId('chip-quiver').textContent = String(meadow.arrowsLeft);
    if (this.mode !== 'solo') this.showScores();
  }

  /* ---------- the end ---------- */

  /** A prompt is read as long as it's up, and said out loud only the first couple of times in a game. */
  once(key, text, extra = {}) {
    if (this.lastPromptKey !== key) {
      this.lastPromptKey = key;
      this.spokenTimes.set(key, (this.spokenTimes.get(key) ?? 0) + 1);
    }
    return { key, text, side: null, silent: this.spokenTimes.get(key) > SPOKEN_AT_MOST, ...extra };
  }

  prompt(snapshot, dt) {
    const needed = this.session.handsPrompt(snapshot, dt);
    // Once the contest is won, or the quiver is empty, there's nothing to ask for.
    if (this.meadow.phase === 'won' || this.meadow.lost) return null;
    // A string hand that isn't open is holding the string here, not a hand to be opened.
    if (needed && !needed.key.startsWith('closed')) {
      this.lastPromptKey = null;
      return needed;
    }
    // The hands can rest whenever they like: the targets just wait. After a while, it's said that's fine.
    if (this.restFor > RESTING_AFTER) return this.once('resting', SPOKEN.resting);
    if (this.bowAwayFor > OTHER_AFTER) return this.once('other-hand', OTHER_HAND);
    if (this.pulling) return this.once('pull', PULL);
    if (this.heldFor > LET_GO_AFTER) return this.once('let-go', LET_GO, { asks: 'open' });
    if (this.openFor > TAKE_AFTER) return this.once('take', TAKE);
    this.lastPromptKey = null;
    return null;
  }

  finished() {
    // What the voice says at the end: the same kind word as any finish, when the quiver ran out.
    if (this.mode === 'solo') this.session.finishLine = this.meadow.lost ? LOST_LINE : FINISH;
    this.session.sound.stopLoop('birds');
    this.story.hide();
    // With friends, how many targets this child hit, which every computer has counted the same.
    if (this.mode !== 'solo') this.friends.finished(this.sinceGo, { n: this.meadow.stats.hits, w: this.beaten ? 0 : 1 });
  }

  summary() {
    const { stats } = this.meadow;
    const hand = this.session.settings.hands;
    const row = (value) => ({ left: hand === 'left' ? value : '', right: hand === 'right' ? value : '' });
    this.friends.showResults();
    const lost = this.meadow.lost && this.mode === 'solo';
    if (this.mode === 'solo') document.querySelector('#screen-finish h2').textContent = lost ? OUT_OF_ARROWS : FINISH;
    // The card's big button is to try the same level again. The levels' own words are put on it first.
    if (lost) queueMicrotask(() => {
      byId('play-again').textContent = 'Try again';
    });
    return {
      hero: stats.hits,
      noun: 'contest',
      rows: { hits: row(`${stats.hits} of ${stats.shots}`), run: row(stats.bestRun), full: row(stats.full), stars: row(stats.trophy ? `${stats.stars} 🏆` : stats.stars) },
      // An empty quiver before enough targets means trying the same level again. Gently, nobody can lose.
      won: !lost,
      // A game with friends is on the host's level, so it doesn't move the child's own level on.
      countsForLevel: !this.friends.current,
    };
  }
}

const choice = (name, value, label) => `<label><input type="radio" name="${name}" value="${value}"> ${label}</label>`;

new GameSession({
  // What the open and closed hand do here, for the hand shapes in the grown-ups' panel: see core/shapes.js.
  moves: { open: 'Let the arrow go', closed: 'Hold the string' },
  shell: {
    title: 'Arrow Meadow',
    startLabel: 'Pick up the bow',
    againLabel: 'Play again',
    finishTitle: FINISH,
    heroMark: '🎯',
    heroNoun: 'targets',
    extraRows: [{ id: 'hits', label: 'Targets hit, of the arrows' }, { id: 'run', label: 'Most hits in a row' }, { id: 'full', label: 'Arrows from a bow drawn right back' }, { id: 'stars', label: 'Stars' }],
    hudTop: `
      <div class="arrow-hud">
        <div class="chip chip-targets"><span id="chip-targets-label" class="chip-label">Targets</span><span id="chip-targets" class="chip-value">0 of 10</span></div>
        <div id="chip-stars-box" class="chip chip-stars" hidden><span class="chip-label">Stars</span><span id="chip-stars" class="chip-value">0</span></div>
        <div id="chip-quiver-box" class="chip chip-quiver" hidden><span class="chip-label">Arrows</span><span id="chip-quiver" class="chip-value">25</span></div>
        <ol id="arrow-scores" class="arrow-scores" aria-label="How many targets each one has hit" hidden></ol>
      </div>
      ${STORY_BOX}
      <div class="film arrow-film" aria-hidden="true">
        <svg viewBox="0 0 220 160">
          <rect class="film-grass" x="0" y="128" width="220" height="32" />
          <g class="film-target">
            <path class="film-stand" d="M34 86L22 130M34 86L46 130" />
            <circle class="film-ring-a" cx="34" cy="80" r="22" />
            <circle class="film-ring-b" cx="34" cy="80" r="15" />
            <circle class="film-ring-c" cx="34" cy="80" r="8" />
          </g>
          <path class="film-star" d="M34 30l4.4 9 9.9 1.4-7.200 7 1.700 9.900-8.800-4.700-8.800 4.700 1.700-9.900-7.200-7 9.900-1.400z" />
          <g class="film-bow">
            <path class="film-limb" d="M128 44Q104 80 128 116" />
            <path class="film-string" d="M128 44L128 80L128 116" />
            <g class="film-arrow">
              <path class="film-shaft" d="M82 80H132" />
              <circle class="film-tip" cx="82" cy="80" r="4" />
            </g>
          </g>
          <g class="film-hand film-bow-hand">
            <rect x="-12" y="-11" width="24" height="23" rx="8" />
            <path class="film-finger" d="M-7 -9V-21M-1 -11V-25M5 -11V-25M11 -9V-20" />
          </g>
          <g class="film-hand film-string-hand">
            <rect x="-12" y="-11" width="24" height="23" rx="8" />
            <path class="film-finger" d="M-7 -9V-21M-1 -11V-25M5 -11V-25M11 -9V-20M12 4L21 -3" />
          </g>
        </svg>
      </div>`,
    panelSettings: `
      <fieldset class="choice">
        <legend>How far apart the hands have to be to draw the bow right back</legend>
        ${choice('arrowReach', 'small', 'A little: about as far apart as the shoulders')}
        ${choice('arrowReach', 'medium', 'More: the string hand reaching out to the side')}
        ${choice('arrowReach', 'large', 'A long way: both arms reaching apart')}
      </fieldset>
      <fieldset class="choice">
        <legend>Help with aiming</legend>
        ${choice('arrowHelp', 'off', 'Off: the arrow goes just where the bow points')}
        ${choice('arrowHelp', 'little', 'A little: an arc that’s nearly on a target is pulled onto it')}
        ${choice('arrowHelp', 'lots', 'A lot')}
      </fieldset>
      <fieldset class="choice">
        <legend>Arrows in the quiver</legend>
        ${choice('arrowQuiver', 'quiver', 'As many as the level gives: an empty quiver before enough targets loses the contest, and targets don’t wait for ever')}
        ${choice('arrowQuiver', 'gentle', 'Gentle: as many as it takes, the targets wait, and nothing can be lost')}
      </fieldset>
      <fieldset class="choice">
        <legend>Targets to win (together with friends, that many for each of you. Against each other, the first to them)</legend>
        ${GOALS.map((goal) => choice('arrowGoal', String(goal), String(goal))).join('')}
      </fieldset>
      <fieldset class="choice">
        <legend>With friends</legend>
        ${choice('arrowFriends', 'together', 'Together: everyone at the same targets, as a team')}
        ${choice('arrowFriends', 'against', 'Against each other: the same targets each, and the first to enough wins')}
      </fieldset>`,
  },
  defaults: { arrowReach: 'small', arrowHelp: 'off', arrowQuiver: 'quiver', arrowGoal: 10, arrowFriends: 'together' },
  choices: { arrowReach: String, arrowHelp: String, arrowQuiver: String, arrowGoal: Number, arrowFriends: String },
  // These go on to a game that's being played at once. The rest, and the level, start it again: see core/settings.js.
  atOnce: ['arrowReach', 'arrowHelp'],
  tagline: (side) => `Giraffe needs an archer! One hand holds the bow up. Close your ${side} hand on the string, pull it back, and open your hand to let the arrow fly.`,
  finishLine: FINISH,
  lines: new URL('./audio/voice/lines.json', import.meta.url),
  portraits: () => renderPortraits(ROSTER),
  createSound: (options) => new Sound({
    ...options,
    sounds: {
      birds: new URL('../tank-patrol/audio/birds.ogg', import.meta.url),
      whoosh1: new URL('../mighty-moves/audio/whoosh-1.ogg', import.meta.url),
      whoosh2: new URL('../mighty-moves/audio/whoosh-2.ogg', import.meta.url),
      whoosh3: new URL('../mighty-moves/audio/whoosh-3.ogg', import.meta.url),
      thud: new URL('../cannon-bay/audio/thud.ogg', import.meta.url),
      pop: new URL('../balloon-pop/audio/pop.ogg', import.meta.url),
      bell: new URL('../mighty-moves/audio/bell.ogg', import.meta.url),
      block: new URL('../mighty-moves/audio/block.ogg', import.meta.url),
      boing: new URL('../robot-rescue/audio/boing.ogg', import.meta.url),
      rustle: new URL('../spider-catcher/audio/rustle.ogg', import.meta.url),
      flap: new URL('../cannon-bay/audio/canvas.ogg', import.meta.url),
      sparkle: new URL('../mighty-moves/audio/sparkle.ogg', import.meta.url),
      found: new URL('../spider-catcher/audio/home.ogg', import.meta.url),
      cheer: new URL('../mighty-moves/audio/cheer.ogg', import.meta.url),
    },
  }),
  createGame: (session) => new ArcherGame(session),
}).start();
