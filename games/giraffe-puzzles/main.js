// Giraffe's Puzzles: Giraffe's picture fell off the wall and broke into pieces, and the child puts it back together.
// An open hand over a loose piece picks it up, and the piece goes with the hand for as long as it stays open. Brought
// near its place, it snaps in. A hand that closes, or rests, just leaves the piece where it is. Keeping the hand open
// while reaching to every part of the picture is what's practised. The rules are in puzzle.js, the pictures are
// drawn by pictures.js, and view.js draws the room. On their own, or with friends, each on their own computer:
// together, all putting the same picture back, or against each other, each with a copy of it to themselves.
import { renderPortraits } from '../../core/body/portraits.js';
import { byId as characterWithId, ROSTER } from '../../core/body/roster.js';
import { Track } from '../../core/friends.js';
import { FriendsPanel, time } from '../../core/friends-ui.js';
import { LOOKS, paintFruit } from '../../core/fruit.js';
import { Glove } from '../../core/glove.js';
import { GameSession, SPOKEN } from '../../core/session.js';
import { SEAT, seatName } from '../../core/seat.js';
import { Sound } from '../../core/sound.js';
import { STORY_BOX, StoryBox } from '../../core/story.js';
import { giraffePixels, renderGiraffe } from '../giraffe-garden/giraffe.js';
import { playerPixels, renderPlayers } from '../giraffe-goal/players.js';
import { CAST } from './pictures.js';
import { CLOCKS, NEWS, PIECE_CHOICES, Puzzle, puzzleNewAt, puzzlePlan, REACH, SNAPS, TABLE } from './puzzle.js';
import { GIRAFFE, PuzzleView } from './view.js';

const byId = (id) => document.getElementById(id);
const FINISH = 'The pictures are back together!';
// On the card when the clock runs out before a picture is back together. It's only shown, not said.
const TIME_UP = 'The clock ran out before the picture was mended!';
const TRY_AGAIN = 'Try again';
const INTRO = 'My picture fell and broke! Can you put it back together?';
const PICK_HINT = 'Pick up a piece with your open hand!';
const OPEN_TO_PICK = 'Open your hand to pick up a piece!';
const PLACE_HINT = 'Take it to its place in the picture!';
const PRAISE = ['Nice one!', 'Way to go!', 'Great job!'];
const FILM_SECONDS = 30; // The little film of what to do shows until the first piece is in, or this long.
const STORY_SECONDS = 6; // Giraffe's words stay up this long, or until the first piece is in.
const HINT_FROM = 6.5; // Seconds into a game that how to pick a piece up is said, if none has been by then: once Giraffe has spoken.
const PLACE_HINT_AFTER = 5; // Seconds the first piece has been carried before saying where to take it.
const CLOSED_PROMPT_AFTER = 2.5; // Seconds of a closed hand before asking for it to open.
const RESTING_AFTER = 15; // And before saying that resting is fine.
const BIRDS_LEVEL = 0.07;
const PRIZE_MARKS = { star: '⭐', gem: '💎' };
// The characters in the pictures are drawn about this tall, in pixels, so they're sharp in a picture on the easel.
const FRIEND_PIXELS = 420;
// Playing with friends, each on their own computer. See core/friends-ui.js for what each of these is.
const PUZZLE_WORDS = {
  toggle: 'Play with friends',
  make: 'Make a game',
  codeLabel: 'A friend’s game code',
  codeName: 'Game code',
  how: 'Tell your friends the code. Then you all press <b>Fix the picture</b>, each with the same puzzle, and see who finishes first.',
  // Together or against each other, as whoever made the game chooses: see teams in core/friends-ui.js.
  together: 'Together',
  against: 'Against each other',
  howTogether: 'Tell your friends the code. Then you all press <b>Fix the picture</b>, and put it back together between you.',
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

class PuzzleGame {
  chimeOnOpen = false; // The hand opens and closes all the time here, so a chime would be noise.

  constructor(session) {
    this.session = session;
    this.view = new PuzzleView(byId('game'), {
      language: () => session.settings.language,
      prizeTarget: () => {
        const box = byId('chip-prizes')?.closest('.chip')?.getBoundingClientRect();
        return box?.width ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : { x: 220, y: 50 };
      },
      top: () => this.band(),
    });
    this.drawGiraffe();
    try {
      for (const kind of Object.keys(LOOKS)) this.view.art.fruit[kind] = paintFruit(kind);
    } catch (error) {
      console.warn('Could not draw the fruit:', error);
    }
    this.story = new StoryBox(session);
    this.gloves = { left: new Glove('left'), right: new Glove('right') };
    this.gloveOffset = { x: 0, y: 0 };
    this.mode = 'solo';
    this.team = false;
    this.friendHands = [];
    this.goAt = 0;
    this.lastPictures = [];
    this.puzzle = this.newPuzzle(session.level);
    this.artFor(this.puzzle);
    this.resetCounts();
    byId('finish-hero')?.closest('.finish-hero')?.insertAdjacentHTML('afterend', '<p id="finish-prizes" class="finish-prizes"></p>');
    // Playing with friends, if a grown-up makes or joins a game.
    this.friends = new FriendsPanel({
      game: 'giraffe-puzzles',
      linkKey: 'puzzle',
      words: PUZZLE_WORDS,
      hello: () => ({ driver: session.settings.fighter ?? '', level: session.levels.current, length: Math.min(100, puzzlePlan(session.levels.current, this.piecesChoice(), { friends: true }).total), mode: this.piecesChoice() }),
      screen: () => session.screen,
      portraits: () => session.portraits,
      onMove: (id, message) => this.fromFriend(id, message),
      onGone: (friend) => this.friendGone(friend),
      // Against each other, whoever finished first, by their time. Together, whoever put the most pieces in is first
      // on the list, and nobody is placed.
      rank: (a, b) => (this.team ? b.dropped - a.dropped : a.ms - b.ms),
      resultText: ({ ms, dropped }) => (this.team ? `${dropped} ${dropped === 1 ? 'piece' : 'pieces'}` : time(ms)),
      titles: { first: 'You finished first!', other: 'You did it!' },
      // With friends, together or against each other: the grown-ups' choice, which the friends box can change too.
      teams: {
        get: () => (session.settings.puzzleFriends === 'against' ? 'against' : 'together'),
        set: (choice) => this.chooseTeams(choice),
      },
      startAfter: byId('start'),
      waitingBefore: byId('screen-finish'),
      resultsAfter: document.querySelector('#screen-finish .finish-hero'),
      finishTitle: document.querySelector('#screen-finish h2'),
    });
    window.addEventListener('resize', () => this.placeFilm());
    this.placeFilm();
    const game = this;
    this.debug = {
      view: this.view,
      gloves: this.gloves,
      get puzzle() {
        return game.puzzle;
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
    this.finishIn = null;
    this.doneMs = null;
  }

  /* ---------- the grown-ups' choices ---------- */

  get settings() {
    return this.session.settings;
  }

  piecesChoice() {
    return this.settings.puzzlePieces in PIECE_CHOICES ? this.settings.puzzlePieces : 'more';
  }

  snapChoice() {
    return this.settings.puzzleSnap in SNAPS ? this.settings.puzzleSnap : 'closer';
  }

  /** Whether the clock on the wall gives each picture its time, or it's the gentle puzzle, as a grown-up chose. */
  clockChoice() {
    return CLOCKS.includes(this.settings.puzzleClock) ? this.settings.puzzleClock : 'ticks';
  }

  reachChoice() {
    return this.settings.puzzleReach in REACH ? this.settings.puzzleReach : 'little';
  }

  /** The band at the top of the screen, for the mirror, the meter and the tally, which the table stays under. */
  band() {
    const small = Math.min(230, Math.max(140, window.innerWidth * 0.15));
    const aspect = this.session.camera?.aspect || 16 / 9;
    return 12 + small / aspect + 12;
  }

  /**
   * A puzzle on their own, or with friends the host's plain one, laid out from the seed everyone has: together,
   * one puzzle for everyone, its pieces claimed through the server, or against each other, a copy each.
   */
  newPuzzle(level, friendly = null) {
    const together = Boolean(friendly?.team);
    const pieces = friendly ? (friendly.mode in PIECE_CHOICES ? friendly.mode : 'usual') : this.piecesChoice();
    return new Puzzle({
      level: friendly?.level ?? level,
      pieces,
      snap: this.snapChoice(),
      reach: this.reachChoice(),
      clock: this.clockChoice(),
      // With friends, everything is where it would be for the right hand, so it's the same on every screen.
      side: friendly ? 'right' : this.settings.hands,
      friends: Boolean(friendly),
      shared: together ? { claim: (k) => this.friends.claim(k) } : null,
      me: friendly ? this.friends.room.you : 'me',
      seed: friendly ? friendly.seed : null,
      avoid: friendly ? [] : this.lastPictures,
      onEvent: (event) => this.onPuzzle(event),
    });
  }

  /** Giraffe's own pictures, for behind the easel and for the pictures he's in. */
  drawGiraffe() {
    try {
      const pixels = Math.max(giraffePixels(this.tallest * GIRAFFE.tall, this.view.ratio), FRIEND_PIXELS);
      this.view.giraffe = renderGiraffe(characterWithId('giraffe'), pixels);
      this.view.art.friends.giraffe = this.view.giraffe;
    } catch (error) {
      // Without his picture the puzzle still works: Giraffe just isn't behind the easel.
      console.warn('Could not draw Giraffe:', error);
    }
  }

  /** Pictures of the characters in this puzzle's pictures, the first time each is wanted. */
  artFor(puzzle) {
    const { friends } = this.view.art;
    const wanted = puzzle.rounds.flatMap((round) => round.pictures.flatMap(({ name }) => CAST[name] ?? []));
    const ids = [...new Set(wanted)].filter((id) => id !== 'giraffe' && !(id in friends));
    if (!ids.length) return;
    try {
      Object.assign(friends, renderPlayers(ids.map(characterWithId), Math.max(playerPixels(FRIEND_PIXELS, 1), FRIEND_PIXELS)));
    } catch (error) {
      // Without their pictures the puzzle still works: each friend is a round one in its own colour.
      console.warn('Could not draw the friends:', error);
      for (const id of ids) friends[id] = null;
    }
    this.view.artChanged();
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
    return puzzleNewAt(level);
  }

  setHands() {
    for (const glove of Object.values(this.gloves)) glove.hide();
    this.restage({ hands: true });
    this.placeFilm();
  }

  settingChanged(change) {
    this.restage(change);
    if ('fighter' in change || 'puzzlePieces' in change || 'puzzleFriends' in change) {
      if (this.friends.room.inRoom) this.friends.room.tell(this.friends.hello());
    }
    if ('puzzleFriends' in change) this.friends.showTeams();
  }

  /** How many pieces, or the other hand, starts with the next puzzle, and the title shows it now. */
  restage(change) {
    const { screen } = this.session;
    if (screen === 'playing' || screen === 'countdown' || !this.puzzle) return;
    if ('puzzlePieces' in change || 'hands' in change || 'puzzleClock' in change) {
      this.puzzle = this.newPuzzle(this.session.level);
      this.artFor(this.puzzle);
    }
  }

  /** Together or against each other, chosen in the friends box: kept with the grown-ups' settings, and shown there. */
  chooseTeams(choice) {
    this.session.changeSettings({ puzzleFriends: choice });
    const input = document.querySelector(`input[name="puzzleFriends"][value="${choice}"]`);
    if (input) input.checked = true;
  }

  /** The little film of what to do goes under the easel, on the side away from the hand in play. */
  placeFilm() {
    const { view, puzzle } = this;
    if (!puzzle) return;
    const { film, easel, boards } = puzzle.layout;
    const below = view.at(film.x, easel.y + easel.height);
    const room = view.at(0, TABLE.height).y - below.y;
    // As tall as fits under the easel, and no taller than under the bigger frame, where there's least room.
    const high = Math.max(60, Math.min(room - view.scale * 0.03, view.scale * 0.18));
    const wide = (high * 220) / 160;
    const style = document.documentElement.style;
    style.setProperty('--film-left', `${Math.round(below.x - wide / 2)}px`);
    style.setProperty('--film-top', `${Math.round(below.y + (room - high) / 2 - 4)}px`);
    style.setProperty('--film-width', `${Math.round(wide)}px`);
    // Just under the band, between the two boards: where a prompt goes while Giraffe's words are in the band.
    style.setProperty('--prompt-top', `${Math.round(view.top + view.scale * 0.015)}px`);
    style.setProperty('--prompt-wide', `${Math.round((boards[1].x - boards[0].x - boards[0].width) * view.scale - 12)}px`);
    this.placePrompt();
  }

  /**
   * What the child is asked for goes in the band along the top, between the tally and the hand meter, so it's never
   * over the table. If there isn't room there, as with a long row of friends, it goes just under the band instead.
   */
  placePrompt() {
    const edge = (selector) => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      return box?.width ? box : null;
    };
    const left = (edge('.puzzle-hud')?.right ?? 12) + 14;
    const right = (edge('.hands-bar')?.left ?? window.innerWidth - 12) - 14;
    const style = document.documentElement.style;
    document.body.dataset.prompt = right - left >= 250 ? 'band' : 'table';
    style.setProperty('--prompt-band-left', `${Math.round((left + right) / 2)}px`);
    style.setProperty('--prompt-band-wide', `${Math.round(right - left)}px`);
    style.setProperty('--prompt-band-top', `${Math.round(this.band() / 2)}px`);
  }

  /* ---------- a new puzzle ---------- */

  prepare(level) {
    // With friends, everyone has the host's plain puzzle, at the host's level and number of pieces, which doesn't
    // move anyone's own level on. Each child keeps their own hand, reach help and how near a piece has to come.
    const friendly = this.friends.current;
    this.team = Boolean(friendly?.team);
    this.mode = friendly ? (this.team ? 'together' : 'against') : 'solo';
    document.body.toggleAttribute('data-friends-race', Boolean(friendly));
    document.body.toggleAttribute('data-friends-team', this.team);
    this.view.place();
    this.puzzle = this.newPuzzle(level, friendly);
    this.artFor(this.puzzle);
    if (!friendly) this.lastPictures = this.puzzle.rounds.flatMap((round) => round.pictures.map(({ name }) => name));
    this.friendHands = (friendly?.friends ?? []).map((friend) => ({ id: friend.id, name: friend.spec.name, who: friend.spec.id, glove: new Glove('right'), track: new Track(HAND_TRACK), fade: 0, heardAt: -Infinity, n: 0 }));
    this.view.reset();
    this.resetCounts();
    this.story.hide();
    this.placeFilm();
    this.showProgress();
    this.showScores();
    this.session.sound.lost = false;
    byId('chip-clock-box').hidden = !this.puzzle.timed;
    this.showClock();
    // Prizes only come from level 2, on their own.
    const prizes = this.puzzle.plan.golden;
    byId('chip-prizes-box').hidden = !prizes;
    byId('sum-left-prizes').closest('tr').hidden = !prizes;
  }

  begin() {
    this.goAt = performance.now();
    this.session.sound.startLoop('birds', BIRDS_LEVEL);
    this.story.say('giraffe', INTRO);
    this.storyFor = STORY_SECONDS;
    this.nameNewThings();
    // The tally and the meter are on the screen by now, so the room between them is known.
    this.placePrompt();
  }

  /** The newest thing the level brings is named first, then whatever else is on the table, each the first time. */
  nameNewThings() {
    const { puzzle, view } = this;
    const { round } = puzzle;
    const { piece: size } = round.layout;
    const playing = () => puzzle.phase === 'play' && puzzle.round === round;
    const above = size.height / 2 + 0.035;
    const on = (piece, still) => () => (playing() && piece.state === 'loose' && still(piece) ? { x: piece.x, y: piece.y, above } : null);
    const named = [];
    const find = (fits) => round.pieces.find(fits);
    const golden = find((piece) => piece.golden);
    if (golden) named.push(['golden', on(golden, () => true)]);
    if (round.peek) named.push(['peek', () => (playing() ? { x: round.peek.x, y: round.peek.y, above: 0.085 } : null)]);
    const turned = find((piece) => piece.angle !== 0);
    if (turned) named.push(['turned', on(turned, (piece) => piece.angle !== 0)]);
    const leaf = find((piece) => piece.leaf);
    if (leaf) named.push(['leaf', on(leaf, (piece) => Boolean(piece.leaf))]);
    const [frame] = round.layout.frames;
    if (puzzle.plan.jigsaw) named.push(['jigsaw', () => (playing() ? { x: TABLE.width / 2, y: frame.y + 0.16, above: 0.02 } : null)]);
    const floating = find((piece) => piece.floating);
    if (floating) named.push(['bubble', on(floating, (piece) => Boolean(piece.floating))]);
    if (round.magnet) named.push(['magnet', () => (playing() && round.magnet.state === 'waiting' ? { x: round.magnet.x, y: round.magnet.y, above: 0.1 } : null)]);
    if (round.layout.frames.length > 1) named.push(['pair', () => (playing() ? { x: TABLE.width / 2, y: frame.y + frame.height + 0.02, above: -0.07 } : null)]);
    const newest = (NEWS[puzzle.level] ?? []).map(({ key }) => key);
    named.sort(([a], [b]) => Number(newest.includes(b)) - Number(newest.includes(a)));
    for (const [key, target] of named) view.introduce(key, target);
  }

  /** What the rules say happens, heard and seen. */
  onPuzzle(event) {
    const { sound } = this.session;
    const { view, puzzle } = this;
    switch (event.type) {
      case 'pick':
        this.pickedOnce = true;
        sound.play('tick', { gain: 0.32, rate: 1.25 });
        break;
      case 'placed': {
        const { piece } = event;
        view.settle(piece, event.from);
        view.burst(piece.home.x, piece.home.y, piece.golden ? '#ffd23f' : '#ffe066');
        view.cheer();
        this.story.hide();
        if (event.mine) {
          sound.play('snap', { gain: 0.4 });
          sound.star();
        } else {
          // A friend's piece going in is heard too, more quietly.
          sound.play('snap', { gain: 0.18, rate: 1.15 });
        }
        this.showProgress();
        this.showScores();
        break;
      }
      case 'prize':
        view.prize(event.kind, event.at.x, event.at.y);
        if (event.kind === 'gem') sound.play('sparkle', { gain: 0.3 });
        setTimeout(() => this.showProgress(), 900);
        break;
      case 'turned':
        sound.handsOpen();
        break;
      case 'leaf-off': {
        const { piece } = event;
        sound.play('whoosh', { gain: 0.3 });
        view.leafAway(piece.x, piece.y, Math.max(puzzle.layout.piece.width, puzzle.layout.piece.height) * 0.52);
        break;
      }
      case 'pop':
        sound.play('pop', { gain: 0.4 });
        view.pop(event.piece.x, event.piece.y, puzzle.bubbleRadius());
        break;
      case 'peek':
        sound.handsOpen();
        break;
      case 'magnet':
        sound.play('sparkle', { gain: 0.3, rate: 1.2 });
        view.pop(event.magnet.x, event.magnet.y, 0.07);
        break;
      case 'mended': {
        // A picture is whole again: a cheer, and a few stars over it.
        sound.play('whole', { gain: 0.5 });
        sound.play('cheer', { gain: 0.3 });
        view.cheer(event.last ? 5 : 2.4);
        event.round.pictures.forEach(({ frame }, at) => {
          for (let n = 0; n < 4; n += 1) setTimeout(() => view.sparkle(frame.x + frame.width * (0.2 + 0.2 * n), frame.y + frame.height * (n % 2 ? 0.7 : 0.3), ['#ffe066', '#ff9ec4', '#9ad8ff'][(n + at) % 3]), n * 220);
        });
        if (!event.last) sound.say(PRAISE[this.praised % PRAISE.length], { ifQuiet: true });
        this.praised += 1;
        this.story.hide();
        this.showProgress();
        break;
      }
      case 'alive': {
        view.comeAlive();
        const [{ frame }] = event.round.pictures;
        view.introduce('alive', () => (puzzle.phase !== 'play' ? { x: TABLE.width / 2, y: frame.y, above: 0.02 } : null));
        break;
      }
      case 'round':
        this.placeFilm();
        this.nameNewThings();
        this.showProgress();
        break;
      case 'done':
        this.doneMs = this.sinceGo;
        break;
      case 'timeup':
        // The clock has run out before the picture was back together: a soft sound, and the game is over a moment later.
        sound.play('whoosh', { gain: 0.2, rate: 0.7 });
        this.story.hide();
        this.showClock();
        break;
      default:
    }
  }

  /* ---------- each frame ---------- */

  /** The glove follows the hand in play over the table. Reach help makes it go further than the hand does. */
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
    const { view, puzzle, session } = this;
    this.followHand(dt, snapshot);
    const glove = this.gloveOnTable(snapshot.side);
    // A hand that's missing, or that the tracker isn't sure of, is never open.
    const open = Boolean(glove && snapshot.handOpen === true);
    puzzle.update(dt, { glove, open });
    if (this.mode !== 'solo' && session.screen === 'playing') {
      this.friends.sendMove('jigsaw', this.handState(glove, open), this.sinceGo);
      this.showFriendsHands(dt);
    }
    view.update(dt, puzzle);
    this.closedFor = glove && !open ? this.closedFor + dt : 0;
    this.restFor = open ? 0 : this.restFor + dt;
    this.heldFor = puzzle.held ? this.heldFor + dt : 0;
    this.showFilm();
    if (this.storyFor > 0) {
      this.storyFor -= dt;
      if (this.storyFor <= 0) this.story.hide();
    }
    this.showClock();
    if (puzzle.done && session.screen === 'playing') this.end();
  }

  /** The game is over. One the clock ran out on is told kindly, with no party, and Try again on the big button. */
  end() {
    const { session, puzzle } = this;
    session.sound.lost = puzzle.lost;
    session.finish();
    // After the card is filled in, which puts back the usual title.
    if (this.mode === 'solo') document.querySelector('#screen-finish h2').textContent = puzzle.lost ? TIME_UP : FINISH;
    if (puzzle.lost) {
      session.hud.hideSummary();
      byId('play-again').textContent = TRY_AGAIN;
    }
  }

  /** How much of the clock's time is left for this picture, as a bar that goes down. */
  showClock() {
    const { clock } = this.puzzle;
    const share = clock ? clock.left / clock.total : 1;
    const shown = Math.round(share * 200) / 2;
    if (this.clockShown === shown) return;
    this.clockShown = shown;
    byId('clock-left').style.width = `${shown}%`;
    byId('chip-clock-box').classList.toggle('is-low', share < 0.25);
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
    this.view.update(dt, this.puzzle);
  }

  /** The little film of what to do, until the first piece is in, or a while. */
  showFilm() {
    const wanted = this.puzzle.stats.placed === 0 && this.puzzle.index === 0 && this.session.playSeconds < FILM_SECONDS;
    if (wanted !== this.filmShown) {
      this.filmShown = wanted;
      document.body.dataset.film = wanted ? 'on' : 'off';
    }
  }

  render() {
    const side = this.settings.hands;
    const { screen } = this.session;
    this.view.render({
      puzzle: this.puzzle,
      glove: this.gloves[side],
      offset: this.gloveOffset,
      friends: this.mode === 'together' ? this.friendHands : [],
      side,
      waving: screen !== 'playing' || this.session.playSeconds < 3,
    });
  }

  /* ---------- with friends ---------- */

  /**
   * What this game tells its friends: where the glove is on the table, from 0 to 1 across and down it, whether it
   * can be seen and is open, and its points in palms, and how many pieces this child has put in. Together, also
   * which piece is in the hand, and where the pieces it last held lie: see report() in puzzle.js. Against each
   * other, only how far they've got.
   */
  handState(at, open) {
    const { puzzle } = this;
    const mine = this.mode === 'together' ? puzzle.report() : { h: -1, d: [], n: puzzle.stats.placed };
    const glove = this.gloves[this.settings.hands];
    if (!at || !glove.visible || this.mode !== 'together') return { x: 0, y: 0, v: 0, o: 0, p: [], ...mine };
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
      if (this.mode === 'together' && this.friends.current?.racers.includes(message.by)) this.puzzle.claimed(message.k, message.by);
      return;
    }
    if (message.t !== 'jigsaw' || this.mode === 'solo') return;
    const friend = this.friendHands.find((each) => each.id === id);
    if (!friend) return;
    friend.track.push(message, performance.now());
    friend.heardAt = performance.now();
    if (this.mode === 'together') this.puzzle.heard(id, message);
    else if (message.n !== friend.n) {
      friend.n = message.n;
      this.showScores();
    }
  }

  /** A friend has gone, and their glove with them. Whatever they held lies where it was, and what they put in stays. */
  friendGone(friend) {
    this.friendHands = this.friendHands.filter((each) => each.id !== friend.id);
    if (this.mode === 'together') this.puzzle.friendGone(friend.id);
    this.showScores();
  }

  /**
   * Together, each friend's glove where it is on their table, a moment ago, fading in and out as their hand comes
   * and goes, and the piece in their hand going with it.
   */
  showFriendsHands(dt) {
    if (this.mode !== 'together') return;
    const { view, puzzle } = this;
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
      puzzle.friendAt(friend.id, where, dt);
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

  /** How many pieces are in, of all there are in the game: together, everyone's. */
  showProgress() {
    const { puzzle } = this;
    const placed = this.mode === 'together' ? [...puzzle.tally.values()].reduce((sum, count) => sum + count, 0) : puzzle.stats.placed;
    byId('chip-pieces').textContent = `${Math.min(placed, puzzle.total)} of ${puzzle.total}`;
    const prizes = Object.values(puzzle.stats.prizes).reduce((sum, count) => sum + count, 0);
    byId('chip-prizes').textContent = String(prizes);
  }

  /**
   * With friends, everyone along the top: together, how many pieces each has put in, the most first, and against
   * each other, how far each has got, whoever is furthest on first, with a flag once they've finished.
   */
  showScores() {
    const list = byId('puzzle-scores');
    const { current } = this.friends;
    list.hidden = this.mode === 'solo' || !current;
    if (list.hidden) return;
    const { puzzle } = this;
    const portraits = this.session.portraits ?? {};
    const you = this.friends.room.you;
    // Two in one picture on one screen both see this list, so the first player is Player 1 in it, not You.
    const mine = { id: you, name: SEAT?.onePicture ? seatName(SEAT.index) : 'You', who: (characterWithId(this.settings.fighter) ?? ROSTER[0]).id, n: this.team ? puzzle.tally.get(you) ?? 0 : puzzle.stats.placed };
    const theirs = this.friendHands.map((friend) => ({ id: friend.id, name: friend.name, who: friend.who, n: this.team ? puzzle.tally.get(friend.id) ?? 0 : friend.n }));
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
      name.className = 'puzzle-score-name';
      name.textContent = each.name;
      const score = document.createElement('span');
      score.className = 'puzzle-score';
      score.textContent = this.team ? String(each.n) : `${Math.min(each.n, puzzle.total)}/${puzzle.total}`;
      row.append(face, name, score);
      if (!this.team) {
        // A little bar of how far through the puzzle they are, and a flag at the end of it.
        const bar = document.createElement('span');
        bar.className = 'puzzle-score-bar';
        const fill = document.createElement('i');
        fill.style.width = `${Math.round((100 * Math.min(each.n, puzzle.total)) / puzzle.total)}%`;
        bar.append(fill);
        row.append(bar);
        if (each.n >= puzzle.total) {
          const flag = document.createElement('span');
          flag.className = 'puzzle-score-flag';
          flag.setAttribute('aria-hidden', 'true');
          flag.textContent = '🏁';
          row.append(flag);
        }
      }
      return row;
    }));
    // The row of friends takes room in the band, which a prompt may then not have.
    this.placePrompt();
  }

  /* ---------- the end ---------- */

  prompt(snapshot, dt) {
    const { session, puzzle } = this;
    const needed = session.handsPrompt(snapshot, dt);
    // While a finished picture is being looked at there's nothing to ask for.
    if (puzzle.phase !== 'play') return null;
    if (needed && !needed.key.startsWith('closed')) return needed;
    // In the gentle puzzle the hand can rest whenever it likes: the pieces just wait. After a while, it's said that's
    // fine. With the clock going round that isn't said, as the clock doesn't wait for a closed hand.
    if (!puzzle.timed && this.restFor > RESTING_AFTER) return { key: 'resting', text: SPOKEN.resting, side: null };
    if (this.closedFor > CLOSED_PROMPT_AFTER) return { key: 'open-to-pick', text: OPEN_TO_PICK, side: null, asks: 'open' };
    // The first piece: how to pick one up, and then where to take it.
    if (puzzle.stats.placed > 0 || puzzle.index > 0) return null;
    if (puzzle.held && this.heldFor > PLACE_HINT_AFTER) return { key: 'place-hint', text: PLACE_HINT, side: null };
    if (!this.pickedOnce && session.playSeconds > HINT_FROM) return { key: 'pick-hint', text: PICK_HINT, side: null, asks: 'open' };
    return null;
  }

  finished() {
    this.session.sound.stopLoop('birds');
    this.story.hide();
    // With friends, how long it took, and how many of the pieces this child put in, which every computer counts the same.
    if (this.mode !== 'solo') {
      const { puzzle } = this;
      const mine = this.team ? puzzle.tally.get(this.friends.room.you) ?? 0 : puzzle.stats.placed;
      this.friends.finished(this.doneMs ?? this.sinceGo, { n: mine, w: 1 });
    }
    for (const friend of this.friendHands) friend.glove.visible = false;
    for (const glove of Object.values(this.gloves)) glove.hide();
  }

  summary() {
    const { stats } = this.puzzle;
    const hand = this.settings.hands;
    const row = (value) => ({ left: hand === 'left' ? value : '', right: hand === 'right' ? value : '' });
    const prizes = Object.values(stats.prizes).reduce((sum, count) => sum + count, 0);
    byId('finish-prizes').textContent = Object.entries(stats.prizes)
      .filter(([, count]) => count > 0)
      .map(([kind, count]) => `${PRIZE_MARKS[kind]} ${count}`)
      .join('   ');
    this.friends.showResults();
    return {
      hero: stats.placed,
      noun: 'game',
      rows: { pieces: row(stats.placed), pictures: row(stats.pictures), carried: row(`${Math.round(stats.carried)} s`), prizes: row(prizes) },
      // On their own, the clock can run out before a picture is back together, and that game comes round again at the
      // same level. In the gentle puzzle, and with friends, every piece goes in, in the end.
      won: !this.puzzle.lost,
      // A game with friends is on the host's level, so it doesn't move the child's own level on.
      countsForLevel: !this.friends.current,
    };
  }
}

/**
 * The game's sounds. A game the clock ran out on ends softly: a sparkle in place of the fanfare, and
 * the voice says what it says after any game that was lost.
 */
class PuzzleSound extends Sound {
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
    title: 'Giraffe’s Puzzles',
    startLabel: 'Fix the picture',
    againLabel: 'Play again',
    finishTitle: FINISH,
    heroMark: '🧩',
    heroNoun: 'pieces',
    extraRows: [{ id: 'pieces', label: 'Pieces put in place' }, { id: 'pictures', label: 'Pictures finished' }, { id: 'carried', label: 'Time carrying a piece' }, { id: 'prizes', label: 'Prizes' }],
    hudTop: `
      <div class="puzzle-hud">
        <div class="chip chip-pieces"><span class="chip-label">Pieces</span><span id="chip-pieces" class="chip-value">0 of 12</span></div>
        <div id="chip-prizes-box" class="chip chip-prizes" hidden><span class="chip-label">Prizes</span><span id="chip-prizes" class="chip-value">0</span></div>
        <div id="chip-clock-box" class="chip chip-clock" hidden><span class="chip-label">Clock</span><span class="thin-meter clock-meter"><span id="clock-left"></span></span></div>
        <ol id="puzzle-scores" class="puzzle-scores" aria-label="How far everyone has got" hidden></ol>
      </div>
      ${STORY_BOX}
      <div class="film puzzle-film" aria-hidden="true">
        <svg viewBox="0 0 220 160">
          <rect class="film-board" x="6" y="30" width="62" height="100" rx="8" />
          <rect class="film-frame" x="104" y="22" width="108" height="116" rx="6" />
          <rect class="film-paper" x="112" y="30" width="92" height="100" />
          <rect class="film-in film-in-a" x="112" y="30" width="46" height="50" />
          <rect class="film-in film-in-b" x="158" y="30" width="46" height="50" />
          <rect class="film-in film-in-c" x="158" y="80" width="46" height="50" />
          <rect class="film-place" x="112" y="80" width="46" height="50" />
          <g class="film-carry">
            <rect class="film-piece" x="-23" y="-25" width="46" height="50" rx="3" />
            <g class="film-hand">
              <path class="film-finger-ink" d="M-12 -6V-25M-4 -9V-32M4 -9V-32M12 -6V-25M17 10L31 -3" />
              <rect x="-18" y="-10" width="36" height="32" rx="12" />
              <path class="film-finger" d="M-12 -6V-25M-4 -9V-32M4 -9V-32M12 -6V-25M17 10L31 -3" />
            </g>
          </g>
          <path class="film-star" d="M135 66l4.4 9 9.9 1.400-7.200 7 1.700 9.900-8.800-4.700-8.800 4.700 1.700-9.900-7.200-7 9.900-1.400z" />
        </svg>
      </div>`,
    panelSettings: `
      <fieldset class="choice">
        <legend>The clock on the wall</legend>
        ${choice('puzzleClock', 'ticks', 'The clock gives each picture its time: mend it before it runs out')}
        ${choice('puzzleClock', 'gentle', 'Gentle: no clock, take all the time you need')}
      </fieldset>
      <fieldset class="choice">
        <legend>How many pieces each picture is cut into, for its level. Fewer are bigger, and make a shorter game</legend>
        ${choice('puzzlePieces', 'fewer', 'Fewer')}
        ${choice('puzzlePieces', 'usual', 'Usual')}
        ${choice('puzzlePieces', 'more', 'More')}
      </fieldset>
      <fieldset class="choice">
        <legend>How near its place a piece has to be brought</legend>
        ${choice('puzzleSnap', 'near', 'Near: it snaps in from a good way off')}
        ${choice('puzzleSnap', 'closer', 'Closer')}
        ${choice('puzzleSnap', 'exact', 'Right on it')}
      </fieldset>
      <fieldset class="choice">
        <legend>Reach help (a smaller movement goes further, and a piece is picked up from a little way off)</legend>
        ${choice('puzzleReach', 'none', 'None')}
        ${choice('puzzleReach', 'little', 'A little')}
        ${choice('puzzleReach', 'lots', 'A lot')}
      </fieldset>
      <fieldset class="choice">
        <legend>With friends</legend>
        ${choice('puzzleFriends', 'together', 'Together: everyone puts the same picture back')}
        ${choice('puzzleFriends', 'against', 'Against each other: the same puzzle each, and the first to finish wins')}
      </fieldset>`,
  },
  defaults: { puzzlePieces: 'more', puzzleSnap: 'closer', puzzleClock: 'ticks', puzzleReach: 'little', puzzleFriends: 'together' },
  choices: { puzzlePieces: String, puzzleSnap: String, puzzleClock: String, puzzleReach: String, puzzleFriends: String },
  // These go on to a game that's being played at once. The rest, and the level, start it again: see core/settings.js.
  atOnce: ['puzzleSnap', 'puzzleReach'],
  // The game is laid out for the hand in play, so the other hand chosen in the middle of it starts it again.
  startsAgain: ['hands'],
  tagline: (side) => `Giraffe’s picture fell and broke! Pick up each piece with your open ${side} hand, and put it back in its place.`,
  finishLine: FINISH,
  lines: new URL('./audio/voice/lines.json', import.meta.url),
  portraits: () => renderPortraits(ROSTER),
  createSound: (options) => new PuzzleSound({
    ...options,
    sounds: {
      birds: new URL('../spider-catcher/audio/birds.ogg', import.meta.url),
      snap: new URL('../robot-rescue/audio/unlock.ogg', import.meta.url),
      whole: new URL('../spider-catcher/audio/home.ogg', import.meta.url),
      cheer: new URL('../mighty-moves/audio/cheer.ogg', import.meta.url),
      sparkle: new URL('../mighty-moves/audio/sparkle.ogg', import.meta.url),
      whoosh: new URL('../mighty-moves/audio/whoosh-2.ogg', import.meta.url),
      pop: new URL('../balloon-pop/audio/pop.ogg', import.meta.url),
    },
  }),
  createGame: (session) => new PuzzleGame(session),
}).start();
