// Giraffe's Riddle Doors: every door in Giraffe's hall has a riddle on it, a square of pictures with one missing, and
// the child opens each by finding the piece that fits, the kind of puzzle in the picture parts of intelligence tests.
// An open hand over a piece on a shelf picks it up, and the piece goes with the hand for as long as it stays open.
// Held in the gap for a moment, it's tried there: the right one opens the door, and one that doesn't goes back to its
// shelf, greyed, and blows a candle out. A hand that closes, or rests, just leaves the piece where it is. The rules
// are in doors.js, the riddles are made by riddles.js and drawn by riddle-art.js, and view.js draws the hall. On their
// own, or with friends, each on their own computer: together, all on the same door, or against each other, each with
// a copy of the same doors. Two on one screen, in one picture, against each other is one door too, and whoever opens
// the most wins.
import { renderPortraits } from '../../core/body/portraits.js';
import { byId as characterWithId, ROSTER } from '../../core/body/roster.js';
import { Track } from '../../core/friends.js';
import { FriendsPanel, time } from '../../core/friends-ui.js';
import { Glove } from '../../core/glove.js';
import { GameSession, SPOKEN } from '../../core/session.js';
import { SEAT, seatName } from '../../core/seat.js';
import { Sound } from '../../core/sound.js';
import { STORY_BOX, StoryBox } from '../../core/story.js';
import { giraffePixels, renderGiraffe } from '../giraffe-garden/giraffe.js';
import { CANDLES, DOORS, Doors, doorNewAt, LABELS, REACH, SNAPS, TABLE } from './doors.js';
import { DoorsView, GIRAFFE } from './view.js';

const byId = (id) => document.getElementById(id);
const FINISH = 'Every door is open!';
// On the card when the last candle goes out. It's only shown, not said.
const DARK = 'The candles went out before every door was open!';
const TRY_AGAIN = 'Try again';
const INTRO = 'Each door is missing a piece. Which one fits?';
const PICK_HINT = 'Pick up a piece with your open hand!';
const OPEN_TO_PICK = 'Open your hand to pick up a piece!';
const PLACE_HINT = 'Hold it in the gap in the door!';
const LOOK_HINT = 'Look along the row!';
const PRAISE = ['Nice one!', 'Way to go!', 'Great job!'];
const FILM_SECONDS = 30; // The little film of what to do shows until the first door opens, or this long.
const STORY_SECONDS = 6; // Giraffe's words stay up this long, or until the first door opens.
const HINT_FROM = 7; // Seconds into a game that how to pick a piece up is said, if none has been by then: once Giraffe has spoken.
const PLACE_HINT_AFTER = 5; // Seconds the first piece has been carried before saying where to hold it.
const CLOSED_PROMPT_AFTER = 2.5; // Seconds of a closed hand before asking for it to open.
const RESTING_AFTER = 15; // And before saying that resting is fine.
const BIRDS_LEVEL = 0.05;
const PRIZE_MARKS = { star: '⭐' };
// Playing with friends, each on their own computer. See core/friends-ui.js for what each of these is.
const DOOR_WORDS = {
  toggle: 'Play with friends',
  make: 'Make a game',
  codeLabel: 'A friend’s game code',
  codeName: 'Game code',
  how: 'Tell your friends the code. Then you all press <b>Open the doors</b>, each with the same riddles, and see who opens them all first.',
  // Together or against each other, as whoever made the game chooses: see teams in core/friends-ui.js.
  together: 'Together',
  against: 'Against each other',
  howTogether: 'Tell your friends the code. Then you all press <b>Open the doors</b>, and work out each riddle between you.',
  teamTitle: 'You did it together!',
  leave: 'Leave this game',
  privacy: 'Only your name, who you play as, whether you chose together or against each other, where your glove is, which piece it holds and where you put pieces go to your friends. The camera picture stays on this computer.',
  alone: 'Play on your own',
  full: 'That game already has 4 players.',
  lost: 'Can’t reach the game. Check the internet, then try again.',
  left: 'You’ve left the game.',
  badCode: 'A game code is 3 letters and numbers.',
  busy: 'Playing',
  still: 'still playing',
};
// A friend's glove between what their game sends: where it is, and its points, which go smoothly from one to the
// next. Whether it can be seen and is open change half way.
const HAND_TRACK = { lerp: ['x', 'y'], lists: ['p'], steps: ['v', 'o'] };
const GLOVE_FADE_RATE = 8; // How quickly a friend's glove fades in and out, as their hand comes and goes.
const HAND_QUIET_MS = 1500; // A friend's glove nothing has come from for this long, as in their hand check, fades away.
const round2 = (value) => Math.round(value * 100) / 100;
const round3 = (value) => Math.round(value * 1000) / 1000;
// On the card of whoever opened the most doors, two on one screen against each other.
const MOST = 'You opened the most doors!';
const DID_IT = 'You did it!';

/**
 * Whether everyone playing with friends has one door: together, and against each other too for two playing in one
 * picture on one screen (core/one-picture.js), where the hall both of them see is the first player's, so a copy of the
 * second player's own couldn't be seen. Each piece is whoever's hand got to it first, as the room says, and against
 * each other, whoever opened the most doors is first.
 */
const oneDoor = (friendly) => Boolean(friendly && (friendly.team || SEAT?.onePicture));

class RiddleGame {
  chimeOnOpen = false; // The hand opens and closes all the time here, so a chime would be noise.

  constructor(session) {
    this.session = session;
    this.view = new DoorsView(byId('game'), {
      language: () => session.settings.language,
      prizeTarget: () => {
        const box = byId('chip-prizes')?.closest('.chip')?.getBoundingClientRect();
        return box?.width ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : { x: 220, y: 50 };
      },
      top: () => this.band(),
    });
    this.drawGiraffe();
    this.story = new StoryBox(session);
    this.gloves = { left: new Glove('left'), right: new Glove('right') };
    this.gloveOffset = { x: 0, y: 0 };
    this.mode = 'solo';
    this.team = false;
    this.shared = false; // One door for everyone: see oneDoor.
    this.friendHands = [];
    this.goAt = 0;
    this.doors = this.newDoors(session.level);
    this.resetCounts();
    byId('finish-hero')?.closest('.finish-hero')?.insertAdjacentHTML('afterend', '<p id="finish-prizes" class="finish-prizes"></p>');
    const game = this;
    // Playing with friends, if a grown-up makes or joins a game.
    this.friends = new FriendsPanel({
      game: 'riddle-doors',
      linkKey: 'doors',
      words: DOOR_WORDS,
      hello: () => ({ driver: session.settings.fighter ?? '', level: session.levels.current, length: DOORS, mode: 'doors' }),
      screen: () => session.screen,
      portraits: () => session.portraits,
      onMove: (id, message) => this.fromFriend(id, message),
      onGone: (friend) => this.friendGone(friend),
      // Against each other, each with their own, whoever finished first, by their time. With one door, whoever opened
      // the most is first on the list, though together nobody is placed.
      rank: (a, b) => (this.shared ? b.dropped - a.dropped : a.ms - b.ms),
      resultText: ({ ms, dropped }) => (this.shared ? `${dropped} ${dropped === 1 ? 'door' : 'doors'}` : time(ms)),
      titles: {
        // With one door, two who opened as many as each other are both first, and neither opened the most.
        get first() {
          if (!game.shared) return 'You finished first!';
          const { results, room } = game.friends;
          const mine = results.get(room.you)?.dropped;
          return [...results].some(([id, { dropped }]) => id !== room.you && dropped === mine) ? DID_IT : MOST;
        },
        other: DID_IT,
      },
      // With friends, together or against each other: the grown-ups' choice, which the friends box can change too.
      teams: {
        get: () => (session.settings.doorFriends === 'against' ? 'against' : 'together'),
        set: (choice) => this.chooseTeams(choice),
      },
      startAfter: byId('start'),
      waitingBefore: byId('screen-finish'),
      resultsAfter: document.querySelector('#screen-finish .finish-hero'),
      finishTitle: document.querySelector('#screen-finish h2'),
    });
    window.addEventListener('resize', () => this.placeFilm());
    this.placeFilm();
    this.debug = {
      view: this.view,
      gloves: this.gloves,
      get doors() {
        return game.doors;
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
    this.closedFor = 0;
    this.restFor = 0;
    this.heldFor = 0;
    this.pickedOnce = false;
    this.praised = 0;
    this.filmShown = false;
    this.storyFor = 0;
    this.lookSaid = false;
    this.doneMs = null;
  }

  /* ---------- the grown-ups' choices ---------- */

  get settings() {
    return this.session.settings;
  }

  snapChoice() {
    return this.settings.doorSnap in SNAPS ? this.settings.doorSnap : 'near';
  }

  /** How many candles light the doors, or the gentle game, where they never go out, as a grown-up chose. */
  candlesChoice() {
    return this.settings.doorCandles in CANDLES ? this.settings.doorCandles : 'three';
  }

  reachChoice() {
    return this.settings.doorReach in REACH ? this.settings.doorReach : 'little';
  }

  /** The band at the top of the screen, for the mirror, the meter and the tally, which the hall stays under. */
  band() {
    const small = Math.min(230, Math.max(140, window.innerWidth * 0.15));
    const aspect = this.session.camera?.aspect || 16 / 9;
    return 12 + small / aspect + 12;
  }

  /**
   * The doors on their own, or with friends the host's plain ones, made from the seed everyone has: together, or
   * against each other in one picture on one screen, one door for everyone, its pieces claimed through the server, or
   * else against each other, a copy each.
   */
  newDoors(level, friendly = null) {
    const together = oneDoor(friendly);
    return new Doors({
      level: friendly?.level ?? level,
      snap: this.snapChoice(),
      reach: this.reachChoice(),
      candles: this.candlesChoice(),
      // With friends, everything is where it would be for the right hand, so it's the same on every screen.
      side: friendly ? 'right' : this.settings.hands,
      friends: Boolean(friendly),
      shared: together ? { claim: (k) => this.friends.claim(k) } : null,
      me: friendly ? this.friends.room.you : 'me',
      seed: friendly ? friendly.seed : null,
      onEvent: (event) => this.onDoors(event),
    });
  }

  /** Giraffe's pictures, for peeking over the door. */
  drawGiraffe() {
    try {
      this.view.giraffe = renderGiraffe(characterWithId('giraffe'), giraffePixels(this.tallest * GIRAFFE.tall, this.view.ratio));
    } catch (error) {
      // Without his picture the game still works: Giraffe just isn't over the door.
      console.warn('Could not draw Giraffe:', error);
    }
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
    return doorNewAt(level);
  }

  setHands() {
    for (const glove of Object.values(this.gloves)) glove.hide();
    this.restage({ hands: true });
    this.placeFilm();
  }

  settingChanged(change) {
    this.restage(change);
    if ('fighter' in change || 'doorFriends' in change) {
      if (this.friends.room.inRoom) this.friends.room.tell(this.friends.hello());
    }
    if ('doorFriends' in change) this.friends.showTeams();
  }

  /** The candles, or the other hand, start with the next doors, and the title shows them now. */
  restage(change) {
    const { screen } = this.session;
    if (screen === 'playing' || screen === 'countdown' || !this.doors) return;
    if ('hands' in change || 'doorCandles' in change) this.doors = this.newDoors(this.session.level);
  }

  /** Together or against each other, chosen in the friends box: kept with the grown-ups' settings, and shown there. */
  chooseTeams(choice) {
    this.session.changeSettings({ doorFriends: choice });
    const input = document.querySelector(`input[name="doorFriends"][value="${choice}"]`);
    if (input) input.checked = true;
  }

  /** The little film of what to do goes on the door, under the riddle, on the side away from the hand in play. */
  placeFilm() {
    const { view, doors } = this;
    if (!doors) return;
    const { film, shelves } = doors.layout;
    const top = view.at(film.x, film.y);
    const room = view.at(0, film.bottom).y - top.y;
    const high = Math.max(56, Math.min(room - view.scale * 0.02, view.scale * 0.16));
    const wide = (high * 220) / 160;
    const style = document.documentElement.style;
    style.setProperty('--film-left', `${Math.round(top.x - wide / 2)}px`);
    style.setProperty('--film-top', `${Math.round(top.y + (room - high) / 2)}px`);
    style.setProperty('--film-width', `${Math.round(wide)}px`);
    // Just under the band, between the two shelves: where a prompt goes while Giraffe's words are in the band.
    style.setProperty('--prompt-top', `${Math.round(view.top + view.scale * 0.015)}px`);
    style.setProperty('--prompt-wide', `${Math.round((shelves[1].x - shelves[0].x - shelves[0].width) * view.scale - 12)}px`);
    this.placePrompt();
  }

  /**
   * What the child is asked for goes in the band along the top, between the tally and the hand meter, so it's never
   * over the hall. If there isn't room there, as with a long row of friends, it goes just under the band instead.
   */
  placePrompt() {
    const edge = (selector) => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      return box?.width ? box : null;
    };
    const left = (edge('.doors-hud')?.right ?? 12) + 14;
    const right = (edge('.hands-bar')?.left ?? window.innerWidth - 12) - 14;
    const style = document.documentElement.style;
    document.body.dataset.prompt = right - left >= 250 ? 'band' : 'table';
    style.setProperty('--prompt-band-left', `${Math.round((left + right) / 2)}px`);
    style.setProperty('--prompt-band-wide', `${Math.round(right - left)}px`);
    style.setProperty('--prompt-band-top', `${Math.round(this.band() / 2)}px`);
  }

  /* ---------- new doors ---------- */

  prepare(level) {
    // With friends, everyone has the host's plain doors, at the host's level, which doesn't move anyone's own level
    // on. Each child keeps their own hand, reach help and how near the gap a piece has to be held.
    const friendly = this.friends.current;
    this.team = Boolean(friendly?.team);
    this.shared = oneDoor(friendly);
    this.mode = friendly ? (this.team ? 'together' : 'against') : 'solo';
    document.body.toggleAttribute('data-friends-race', Boolean(friendly));
    document.body.toggleAttribute('data-friends-team', this.team);
    this.view.place();
    this.doors = this.newDoors(level, friendly);
    this.friendHands = (friendly?.friends ?? []).map((friend) => ({ id: friend.id, name: friend.spec.name, who: friend.spec.id, glove: new Glove('right'), track: new Track(HAND_TRACK), fade: 0, heardAt: -Infinity, n: 0 }));
    this.view.reset();
    this.resetCounts();
    this.story.hide();
    this.placeFilm();
    this.showProgress();
    this.showScores();
    this.session.sound.lost = false;
    byId('chip-candles-box').hidden = !this.doors.candles;
  }

  begin() {
    this.goAt = performance.now();
    this.session.sound.startLoop('birds', BIRDS_LEVEL);
    this.story.say('giraffe', INTRO);
    this.storyFor = STORY_SECONDS;
    this.nameNewThing();
    // The tally and the meter are on the screen by now, so the room between them is known.
    this.placePrompt();
  }

  /** The first door of a kind that's new at this level has a label beside it, the first time it comes in a game. */
  nameNewThing() {
    const { doors, view } = this;
    const { door } = doors;
    if (!LABELS[door.kind] || door.kind !== doors.plan.newest) return;
    const { board } = door.layout;
    view.introduce(door.kind, () => (doors.phase === 'play' && doors.door === door ? { x: TABLE.width / 2, y: board.y, above: 0.012 } : null));
  }

  /** What the rules say happens, heard and seen. */
  onDoors(event) {
    const { sound } = this.session;
    const { view } = this;
    switch (event.type) {
      case 'pick':
        this.pickedOnce = true;
        sound.play('tick', { gain: 0.32, rate: 1.25 });
        break;
      case 'placed': {
        const { tile } = event;
        view.slide(tile, event.from);
        view.burst(tile.x, tile.y);
        view.cheer(2.4);
        this.story.hide();
        sound.play('unlock', { gain: event.mine ? 0.45 : 0.25 });
        this.showProgress();
        this.showScores();
        break;
      }
      case 'wrong': {
        // Not that one: back to its shelf, greyed, with a soft boing and a little shake of the door. Nothing is said.
        view.notThatOne(event.tile, event.from);
        sound.play('boing', { gain: event.mine ? 0.28 : 0.14, rate: 0.85 });
        break;
      }
      case 'candle':
        sound.play('whoosh', { gain: 0.16, rate: 0.7 });
        this.showProgress();
        break;
      case 'prize':
        view.prize(event.kind, event.at.x, event.at.y);
        setTimeout(() => this.showProgress(), 900);
        break;
      case 'look':
        // Someone has been on a door a while: the row with the gap lights up, and the first time, it's said.
        if (!this.lookSaid) {
          this.lookSaid = true;
          sound.say(LOOK_HINT, { ifQuiet: true });
        }
        break;
      case 'opened': {
        // The door swings open: a harp, a cheer, and a few stars round the riddle.
        sound.play('home', { gain: 0.45 });
        sound.play('cheer', { gain: event.last ? 0.4 : 0.22 });
        const { board } = event.door.layout;
        for (let n = 0; n < 4; n += 1) setTimeout(() => view.sparkle(board.x + board.width * (0.2 + 0.2 * n), board.y + board.height * (n % 2 ? 0.7 : 0.3), ['#ffe066', '#ff9ec4', '#9ad8ff'][n % 3]), n * 200);
        if (!event.last && this.praised % 2 === 0) sound.say(PRAISE[(this.praised / 2) % PRAISE.length], { ifQuiet: true });
        this.praised += 1;
        this.story.hide();
        this.showProgress();
        break;
      }
      case 'door':
        this.placeFilm();
        this.nameNewThing();
        this.showProgress();
        break;
      case 'done':
        this.doneMs = this.sinceGo;
        break;
      case 'dark':
        // The last candle is out: it's too dark to go on, and the game is over a moment later.
        this.story.hide();
        break;
      default:
    }
  }

  /* ---------- each frame ---------- */

  /** The glove follows the hand in play over the hall. Reach help makes it go further than the hand does. */
  followHand(dt, snapshot) {
    const { area, palmSize } = this.view;
    const gain = REACH[this.reachChoice()];
    const width = area.width * gain;
    const height = area.height * gain;
    this.gloveOffset = { x: area.left - (width - area.width) / 2, y: area.top - (height - area.height) / 2 };
    for (const [hand, glove] of Object.entries(this.gloves)) {
      if (hand !== snapshot.side) glove.hide();
      else glove.follow(snapshot[hand], dt, { aspect: this.session.camera.aspect, palmSize, width, height });
    }
  }

  /** Where the middle of the glove is on the table, or null when it can't be seen. */
  gloveOnTable(side = this.settings.hands) {
    const glove = this.gloves[side];
    if (!glove?.visible) return null;
    return this.view.fromScreen(glove.x + this.gloveOffset.x, glove.y + this.gloveOffset.y);
  }

  update(dt, snapshot) {
    const { view, doors, session } = this;
    this.followHand(dt, snapshot);
    const glove = this.gloveOnTable(snapshot.side);
    // A hand that's missing, or that the tracker isn't sure of, is never open.
    const open = Boolean(glove && snapshot.handOpen === true);
    doors.update(dt, { glove, open });
    if (this.mode !== 'solo' && session.screen === 'playing') {
      this.friends.sendMove('jigsaw', this.handState(glove, open), this.sinceGo);
      this.showFriendsHands(dt);
    }
    view.update(dt);
    this.closedFor = glove && !open ? this.closedFor + dt : 0;
    this.restFor = open ? 0 : this.restFor + dt;
    this.heldFor = doors.held ? this.heldFor + dt : 0;
    this.showFilm();
    if (this.storyFor > 0) {
      this.storyFor -= dt;
      if (this.storyFor <= 0) this.story.hide();
    }
    if (doors.done && session.screen === 'playing') this.end();
  }

  /** The game is over. One the candles went out on is told kindly, with no party, and Try again on the big button. */
  end() {
    const { session, doors } = this;
    session.sound.lost = doors.lost;
    session.finish();
    // After the card is filled in, which puts back the usual title.
    if (this.mode === 'solo') document.querySelector('#screen-finish h2').textContent = doors.lost ? DARK : FINISH;
    if (doors.lost) {
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
    // During the countdown the glove comes out, so the child can find their hand.
    if (screen === 'countdown') this.followHand(dt, snapshot);
    else for (const glove of Object.values(this.gloves)) glove.hide();
    this.view.update(dt);
  }

  /** The little film of what to do, until the first door opens, or a while. */
  showFilm() {
    const wanted = this.doors.index === 0 && this.doors.phase === 'play' && this.session.playSeconds < FILM_SECONDS;
    if (wanted !== this.filmShown) {
      this.filmShown = wanted;
      document.body.dataset.film = wanted ? 'on' : 'off';
    }
  }

  render() {
    const side = this.settings.hands;
    const { screen } = this.session;
    this.view.render({
      doors: this.doors,
      glove: this.gloves[side],
      offset: this.gloveOffset,
      friends: this.shared ? this.friendHands : [],
      waving: screen !== 'playing' || this.session.playSeconds < 3,
    });
  }

  /* ---------- with friends ---------- */

  /**
   * What this game tells its friends: where the glove is on the table, from 0 to 1 across and down it, whether it can
   * be seen and is open, and its points in palms, and how many doors this child has opened. With one door, also which
   * piece is in the hand, and where the pieces it last held lie: see report() in doors.js. Against each other, each
   * with their own, only how far they've got.
   */
  handState(at, open) {
    const { doors } = this;
    const mine = this.shared ? doors.report() : { h: -1, d: [], n: doors.stats.opened };
    const glove = this.gloves[this.settings.hands];
    if (!at || !glove.visible || !this.shared) return { x: 0, y: 0, v: 0, o: 0, p: [], ...mine };
    const palm = this.view.palmSize;
    return {
      x: round3(at.x / TABLE.width),
      y: round3(at.y / TABLE.height),
      v: 1,
      o: open ? 1 : 0,
      p: glove.points.flatMap(({ x, y }) => [round2(x / palm), round2(y / palm)]),
      ...mine,
    };
  }

  /** Something from a friend's game: where their glove is and what they've done, or whose a piece is. */
  fromFriend(id, message) {
    if (message.t === 'claimed') {
      if (this.shared && this.friends.current?.racers.includes(message.by)) this.doors.claimed(message.k, message.by);
      return;
    }
    if (message.t !== 'jigsaw' || this.mode === 'solo') return;
    const friend = this.friendHands.find((each) => each.id === id);
    if (!friend) return;
    friend.track.push(message, performance.now());
    friend.heardAt = performance.now();
    if (this.shared) this.doors.heard(id, message);
    else if (message.n !== friend.n) {
      friend.n = message.n;
      this.showScores();
    }
  }

  /** A friend has gone, and their glove with them. Whatever they held lies where it was, and the doors they opened stay open. */
  friendGone(friend) {
    this.friendHands = this.friendHands.filter((each) => each.id !== friend.id);
    if (this.shared) this.doors.friendGone(friend.id);
    this.showScores();
  }

  /**
   * With one door, each friend's glove where it is on their table, a moment ago, fading in and out as their hand comes
   * and goes, and the piece in their hand going with it.
   */
  showFriendsHands(dt) {
    if (!this.shared) return;
    const { view, doors } = this;
    const now = performance.now();
    for (const friend of this.friendHands) {
      const at = friend.track.at(now);
      const seen = Boolean(at?.v) && at.p?.length === 42 && now - friend.heardAt < HAND_QUIET_MS && !this.friends.results.has(friend.id);
      friend.fade += ((seen ? 1 : 0) - friend.fade) * (1 - Math.exp(-dt * GLOVE_FADE_RATE));
      const { glove } = friend;
      if (!seen) {
        if (friend.fade < 0.02) glove.visible = false;
        continue;
      }
      const where = { x: at.x * TABLE.width, y: at.y * TABLE.height };
      doors.friendAt(friend.id, where, dt);
      const spot = view.at(where.x, where.y);
      glove.visible = true;
      glove.status = at.o ? 'open' : 'closed';
      glove.x = spot.x;
      glove.y = spot.y;
      glove.points.forEach((point, index) => {
        point.x = at.p[index * 2] * view.palmSize;
        point.y = at.p[index * 2 + 1] * view.palmSize;
      });
    }
  }

  /* ---------- the top of the screen ---------- */

  /** How many doors are open, of all there are, the candles still lit, and the prizes: with one door, everyone's doors. */
  showProgress() {
    const { doors } = this;
    const opened = this.shared ? [...doors.tally.values()].reduce((sum, count) => sum + count, 0) : doors.stats.opened;
    byId('chip-doors').textContent = `${Math.min(opened, doors.total)} of ${doors.total}`;
    byId('chip-prizes').textContent = String(doors.stats.prizes.star);
    const { candles } = doors;
    const box = byId('chip-candles');
    if (!candles) return;
    const key = `${candles.left}/${candles.total}`;
    if (box.dataset.key === key) return;
    box.dataset.key = key;
    // Drawn here rather than an emoji, which some computers show pale: a lit candle has its flame, and one blown out
    // a wisp of smoke.
    box.innerHTML = Array.from({ length: candles.total }, (_, at) => `<svg class="candle${at < candles.left ? '' : ' is-out'}" viewBox="0 0 16 30" aria-hidden="true"><path class="candle-flame" d="M8 1C11 6 12 8 12 10a4 4 0 0 1-8 0c0-2 1-4 4-9z"/><path class="candle-smoke" d="M8 12c-2-2 2-4 0-6s2-4 0-5"/><rect class="candle-wax" x="4" y="14" width="8" height="15" rx="2"/></svg>`).join('');
    box.setAttribute('aria-label', `${candles.left} of ${candles.total} candles lit`);
  }

  /**
   * With friends, everyone along the top: with one door, how many doors each has opened, the most first, and against
   * each other, each with their own, how far each has got, whoever is furthest on first, with a flag once they've
   * finished.
   */
  showScores() {
    const list = byId('door-scores');
    const { current } = this.friends;
    list.hidden = this.mode === 'solo' || !current;
    if (list.hidden) return;
    const { doors } = this;
    const portraits = this.session.portraits ?? {};
    const you = this.friends.room.you;
    // Two in one picture on one screen both see this list, so the first player is Player 1 in it, not You.
    const mine = { id: you, name: SEAT?.onePicture ? seatName(SEAT.index) : 'You', who: (characterWithId(this.settings.fighter) ?? ROSTER[0]).id, n: this.shared ? doors.tally.get(you) ?? 0 : doors.stats.opened };
    const theirs = this.friendHands.map((friend) => ({ id: friend.id, name: friend.name, who: friend.who, n: this.shared ? doors.tally.get(friend.id) ?? 0 : friend.n }));
    const everyone = [mine, ...theirs].sort((a, b) => b.n - a.n);
    const key = everyone.map(({ id, n }) => `${id}:${n}`).join(',');
    if (list.dataset.key === key) return;
    list.dataset.key = key;
    list.replaceChildren(...everyone.map((each) => {
      const row = document.createElement('li');
      row.classList.toggle('is-you', each.id === you);
      const face = document.createElement('img');
      face.alt = '';
      face.src = portraits[each.who] ?? '';
      const name = document.createElement('span');
      name.className = 'door-score-name';
      name.textContent = each.name;
      const score = document.createElement('span');
      score.className = 'door-score';
      score.textContent = this.shared ? String(each.n) : `${Math.min(each.n, doors.total)}/${doors.total}`;
      row.append(face, name, score);
      if (!this.shared && each.n >= doors.total) {
        const flag = document.createElement('span');
        flag.className = 'door-score-flag';
        flag.setAttribute('aria-hidden', 'true');
        flag.textContent = '🏁';
        row.append(flag);
      }
      return row;
    }));
    // The row of friends takes room in the band, which a prompt may then not have.
    this.placePrompt();
  }

  /* ---------- the end ---------- */

  prompt(snapshot, dt) {
    const { session, doors } = this;
    const needed = session.handsPrompt(snapshot, dt);
    // While an opened door is looked through there's nothing to ask for.
    if (doors.phase !== 'play') return null;
    if (needed && !needed.key.startsWith('closed')) return needed;
    // The hand can rest whenever it likes: the pieces just wait, and there's no clock. After a while, it's said
    // that's fine.
    if (this.restFor > RESTING_AFTER) return { key: 'resting', text: SPOKEN.resting, side: null };
    if (this.closedFor > CLOSED_PROMPT_AFTER) return { key: 'open-to-pick', text: OPEN_TO_PICK, side: null, asks: 'open' };
    // The first door: how to pick a piece up, and then where to hold it.
    if (doors.index > 0 || doors.stats.wrong > 0) return null;
    if (doors.held && this.heldFor > PLACE_HINT_AFTER) return { key: 'place-hint', text: PLACE_HINT, side: null };
    if (!this.pickedOnce && session.playSeconds > HINT_FROM) return { key: 'pick-hint', text: PICK_HINT, side: null, asks: 'open' };
    return null;
  }

  finished() {
    this.session.sound.stopLoop('birds');
    this.story.hide();
    // With friends, how long it took, and how many of the doors this child opened, which every computer counts the same.
    if (this.mode !== 'solo') {
      const { doors } = this;
      const mine = this.shared ? doors.tally.get(this.friends.room.you) ?? 0 : doors.stats.opened;
      this.friends.finished(this.doneMs ?? this.sinceGo, { n: mine, w: 1 });
    }
    for (const friend of this.friendHands) friend.glove.visible = false;
    for (const glove of Object.values(this.gloves)) glove.hide();
  }

  summary() {
    const { stats } = this.doors;
    const hand = this.settings.hands;
    const row = (value) => ({ left: hand === 'left' ? value : '', right: hand === 'right' ? value : '' });
    byId('finish-prizes').textContent = stats.prizes.star ? `${PRIZE_MARKS.star} ${stats.prizes.star}` : '';
    this.friends.showResults();
    return {
      hero: stats.opened,
      noun: 'game',
      rows: { doors: row(stats.opened), first: row(stats.firstTry), wrong: row(stats.wrong), carried: row(`${Math.round(stats.carried)} s`) },
      // On their own, the candles can go out before every door is open, and that game comes round again at the same
      // level. In the gentle game, and with friends, every door opens, in the end.
      won: !this.doors.lost,
      // A game with friends is on the host's level, so it doesn't move the child's own level on.
      countsForLevel: !this.friends.current,
    };
  }
}

/** The game's sounds. A game the candles went out on ends softly: a sparkle in place of the fanfare. */
class DoorsSound extends Sound {
  lost = false;

  finish(line, options) {
    if (this.lost) this.play('sparkle', { gain: 0.3 });
    super.finish(line, options);
  }
}

const choice = (name, value, label) => `<label><input type="radio" name="${name}" value="${value}"> ${label}</label>`;

new GameSession({
  // What the open and closed hand do here, for the hand shapes in the grown-ups' panel: see core/shapes.js.
  moves: { open: 'Hold a piece', closed: null },
  shell: {
    title: 'Giraffe’s Riddle Doors',
    startLabel: 'Open the doors',
    againLabel: 'Play again',
    finishTitle: FINISH,
    heroMark: '🚪',
    heroNoun: 'doors',
    extraRows: [{ id: 'doors', label: 'Doors opened' }, { id: 'first', label: 'Opened with the first piece tried' }, { id: 'wrong', label: 'Pieces that didn’t fit' }, { id: 'carried', label: 'Time carrying a piece' }],
    hudTop: `
      <div class="doors-hud">
        <div class="chip chip-doors"><span class="chip-label">Doors</span><span id="chip-doors" class="chip-value">0 of 6</span></div>
        <div id="chip-candles-box" class="chip chip-candles"><span class="chip-label">Candles</span><span id="chip-candles" class="chip-value candles" role="img"></span></div>
        <div class="chip chip-prizes"><span class="chip-label">Stars</span><span id="chip-prizes" class="chip-value">0</span></div>
        <ol id="door-scores" class="door-scores" aria-label="How far everyone has got" hidden></ol>
      </div>
      ${STORY_BOX}
      <div class="film doors-film" aria-hidden="true">
        <svg viewBox="0 0 220 160">
          <rect class="film-shelf" x="6" y="26" width="58" height="108" rx="8" />
          <rect class="film-door" x="96" y="14" width="118" height="140" rx="10" />
          <rect class="film-paper" x="106" y="26" width="98" height="98" rx="4" />
          <circle class="film-red" cx="130" cy="50" r="12" />
          <circle class="film-red" cx="180" cy="50" r="12" />
          <path class="film-blue" d="M130 86l13 22h-26z" />
          <rect class="film-gap" x="160" y="80" width="40" height="40" />
          <g class="film-carry">
            <rect class="film-piece" x="-20" y="-20" width="40" height="40" rx="4" />
            <path class="film-blue" d="M0 -11l12 20h-24z" />
            <g class="film-hand">
              <path class="film-finger-ink" d="M-12 -6V-25M-4 -9V-32M4 -9V-32M12 -6V-25M17 10L31 -3" />
              <rect x="-18" y="-10" width="36" height="32" rx="12" />
              <path class="film-finger" d="M-12 -6V-25M-4 -9V-32M4 -9V-32M12 -6V-25M17 10L31 -3" />
            </g>
          </g>
          <circle class="film-ring" cx="180" cy="100" r="27" />
        </svg>
      </div>`,
    panelSettings: `
      <fieldset class="choice">
        <legend>The candles (each piece that doesn’t fit blows one out)</legend>
        ${choice('doorCandles', 'three', 'Three candles: with all three out, the game is lost')}
        ${choice('doorCandles', 'five', 'Five candles')}
        ${choice('doorCandles', 'gentle', 'Gentle: the candles never go out, try as many pieces as you like')}
      </fieldset>
      <fieldset class="choice">
        <legend>How near the gap a piece has to be held</legend>
        ${choice('doorSnap', 'near', 'Near: anywhere over the gap')}
        ${choice('doorSnap', 'closer', 'Closer')}
        ${choice('doorSnap', 'exact', 'Right on it')}
      </fieldset>
      <fieldset class="choice">
        <legend>Reach help (a smaller movement goes further, and a piece is picked up from a little way off)</legend>
        ${choice('doorReach', 'none', 'None')}
        ${choice('doorReach', 'little', 'A little')}
        ${choice('doorReach', 'lots', 'A lot')}
      </fieldset>
      <fieldset class="choice">
        <legend>With friends</legend>
        ${choice('doorFriends', 'together', 'Together: everyone works on the same door')}
        ${choice('doorFriends', 'against', SEAT?.onePicture ? 'Against each other: one door, and whoever opens the most doors wins' : 'Against each other: the same doors each, and the first to open them all wins')}
      </fieldset>`,
  },
  defaults: { doorCandles: 'three', doorSnap: 'near', doorReach: 'little', doorFriends: 'together' },
  choices: { doorCandles: String, doorSnap: String, doorReach: String, doorFriends: String },
  // These go on to a game that's being played at once. The rest, and the level, start it again: see core/settings.js.
  atOnce: ['doorSnap', 'doorReach'],
  // The doors are laid out for the hand in play, so the other hand chosen in the middle of a game starts it again.
  startsAgain: ['hands'],
  tagline: (side) => `Each of Giraffe’s doors has a riddle with a piece missing. Pick up the piece that fits with your open ${side} hand, and hold it in the gap.`,
  finishLine: FINISH,
  lines: new URL('./audio/voice/lines.json', import.meta.url),
  portraits: () => renderPortraits(ROSTER),
  createSound: (options) => new DoorsSound({
    ...options,
    sounds: {
      birds: new URL('../spider-catcher/audio/birds.ogg', import.meta.url),
      unlock: new URL('../robot-rescue/audio/unlock.ogg', import.meta.url),
      home: new URL('../spider-catcher/audio/home.ogg', import.meta.url),
      boing: new URL('../robot-rescue/audio/boing.ogg', import.meta.url),
      cheer: new URL('../mighty-moves/audio/cheer.ogg', import.meta.url),
      sparkle: new URL('../mighty-moves/audio/sparkle.ogg', import.meta.url),
      whoosh: new URL('../mighty-moves/audio/whoosh-2.ogg', import.meta.url),
    },
  }),
  createGame: (session) => new RiddleGame(session),
}).start();
