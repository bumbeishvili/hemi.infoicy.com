// Giraffe's Paint Box: Giraffe is painting pictures for the friends' party, and the child colours them in. The open
// hand is the brush: paint goes down where it moves, inside the lines, and dipping it in a paint pot takes that paint.
// A closed hand is the brush lifted. It practises opening the hand and keeping it open while moving it smoothly
// across the picture. The rules are in paint.js, the pictures in pages.js, and the sheet is drawn by view.js. On
// their own, or with friends, each on their own computer: all painting one sheet together, or each their own, to
// see who finishes first.
import { renderPortraits } from '../../core/body/portraits.js';
import { byId as characterWithId, ROSTER } from '../../core/body/roster.js';
import { Track } from '../../core/friends.js';
import { FriendsPanel, time as raceTime } from '../../core/friends-ui.js';
import { Glove } from '../../core/glove.js';
import { GameSession, SPOKEN } from '../../core/session.js';
import { Sound } from '../../core/sound.js';
import { STORY_BOX, StoryBox } from '../../core/story.js';
import { giraffePixels, renderGiraffe } from '../giraffe-garden/giraffe.js';
import { COLOUR_NAMES, SHEET } from './pages.js';
import { BRUSH_NAMES, BRUSHES, DONE_NAMES, EXTRAS, modeWord, Painting, paintNewAt, REACH, readMode, RIVAL, RIVALS, RULES, STROKE_NUMBERS } from './paint.js';
import { GIRAFFE, LIFE_SECONDS, PaintView } from './view.js';

const byId = (id) => document.getElementById(id);
const FINISH = 'What a lovely picture!';
// On the card when the other painter finishes first. It's only shown, not said.
const BEATEN = (name) => `${name} finished painting first!`;
const TRY_AGAIN = 'Try again';
const INTRO = 'I’m painting pictures for the party! Can you colour them in?';
const PAINT_HINT = 'Paint with your open hand!';
const OPEN_TO_PAINT = 'Open your hand to paint!';
const DIP_HINT = 'Dip your hand in that pot!';
const NUMBER_HINT = 'Find the pot with the same number!';
const MIX_HINT = 'Mix those two paints in the dish!';
const STAMP_HINT = 'Hold still to print a star!';
const PRAISE = ['Nice one!', 'Way to go!', 'Great job!'];
const FILM_SECONDS = 25; // The little film of what to do shows until the first part is painted, or this long.
const STORY_SECONDS = 6; // Giraffe's words stay up this long, or until the first part is painted.
const PAINT_HINT_SECONDS = 9; // How to paint is said in the first few seconds, to a child who hasn't yet.
const CLOSED_PROMPT_AFTER = 2.5; // Seconds of a closed hand before asking for it to open.
const RESTING_AFTER = 15; // And before saying that resting is fine.
const HINT_PROMPT_AFTER = 1.5; // Seconds a part has been showing which pot it wants, before the words say so too.
const STAMP_HINT_AFTER = 5; // Seconds with the stamp on the sheet and no star printed, before saying how.
const SETTLE_FIRST = 0.75; // The last part fills in before the picture comes to life.
const RACE_SECONDS = 180; // Against each other, everyone's picture is done, or as far as it got, after this long.
const BRUSH_LEVEL = 0.5;
const BIRDS_LEVEL = 0.1;
const SEND_EVERY_MS = 100; // With friends, the strokes painted go to them 10 times a second.
// How far down the camera picture the middle of the hand can be with the whole of an open hand still in it, as
// shares of its height: its fingers reach up a good way, so not near the top, and its wrist may go off the bottom.
const HAND_BAND = { top: 0.24, bottom: 0.9 };
// What core/glove.js spreads over the field it's given: the camera picture from a tenth of the way down, 0.78 of
// its height and 0.8 of its width.
const GLOVE_VIEW = { top: 0.1, high: 0.78, wide: 0.8 };
// Painting with friends, each on their own computer. See core/friends-ui.js for what each of these is.
const PAINT_WORDS = {
  toggle: 'Play with friends',
  make: 'Make a game',
  codeLabel: 'A friend’s game code',
  codeName: 'Game code',
  how: 'Tell your friends the code. Then you all press <b>Start painting</b>, and see who finishes their own picture first.',
  howTogether: 'Tell your friends the code. Then you all press <b>Start painting</b>, and paint one picture together.',
  // Together or against each other, as whoever made the game chooses: see teams in core/friends-ui.js.
  together: 'Together',
  against: 'Against each other',
  teamTitle: 'You painted it together!',
  leave: 'Leave this game',
  privacy: 'Only your name, who you play as, whether you chose together or against each other, where your hand is on the picture and the strokes you paint go to your friends. The camera picture stays on this computer.',
  alone: 'Play on your own',
  full: 'That game already has 4 players.',
  lost: 'Can’t reach the game. Check the internet, then try again.',
  left: 'You’ve left the game.',
  badCode: 'A game code is 3 letters and numbers.',
  busy: 'Painting',
  still: 'still painting',
};
// A friend's brush between what their game sends: where it is on the sheet, and their glove's points, which go
// smoothly from one to the next. Whether it can be seen and is down, its paint and its size change half way.
const BRUSH_TRACK = { lerp: ['x', 'y'], lists: ['p'], steps: ['v', 'o', 'c', 'r'] };
const FRIEND_LOOK = { ink: '#7f8a99', glove: '#e3e8ee' };
const FADE_RATE = 8; // How quickly a friend's glove fades in and out, as their hand comes and goes.
const QUIET_MS = 1500; // A friend nothing has come from for this long fades away.
const round1 = (value) => Math.round(value * 10) / 10;
const round2 = (value) => Math.round(value * 100) / 100;
const clock = (seconds) => {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

class PaintGame {
  chimeOnOpen = false; // The hand opens and closes all the time here, so a chime would be noise.

  constructor(session) {
    this.session = session;
    this.view = new PaintView(byId('game'), { language: () => session.settings.language });
    try {
      // Drawn as big as he'll be shown on this screen, even full screen, so he's sharp.
      const tallest = Math.max(window.innerHeight, window.screen?.height || 0);
      this.view.giraffe = renderGiraffe(characterWithId('giraffe'), giraffePixels(tallest * GIRAFFE.tall, this.view.ratio));
    } catch (error) {
      // Without his picture the game still works: Giraffe just isn't beside the sheet.
      console.warn('Could not draw Giraffe:', error);
    }
    this.story = new StoryBox(session);
    this.gloves = { left: new Glove('left'), right: new Glove('right') };
    this.gloveOffset = { x: 0, y: 0 };
    this.mode = 'solo';
    this.friendBrushes = [];
    this.scores = new Map(); // Against each other: how far along each friend's picture is, in whole percent.
    this.goAt = 0;
    this.sentAt = 0;
    this.clock = null;
    this.resetCounts();
    // The finish card and the grown-ups' panel can each save the picture, to this computer only.
    document.querySelector('#screen-finish .finish-actions')?.insertAdjacentHTML('afterbegin', '<button id="save-picture" class="soft-button paint-save" type="button">Save the picture</button>');
    for (const id of ['save-picture', 'save-picture-now']) byId(id)?.addEventListener('click', () => this.savePicture());
    // Painting with friends, if a grown-up makes or joins a game.
    this.friends = new FriendsPanel({
      game: 'giraffe-paint',
      linkKey: 'paint',
      words: PAINT_WORDS,
      hello: () => ({ driver: session.settings.fighter ?? '', level: session.levels.current, length: 1, mode: modeWord(this.rule(), this.doneName()) }),
      screen: () => session.screen,
      portraits: () => session.portraits,
      onMove: (id, message) => this.fromFriend(id, message),
      onGone: (friend) => this.friendGone(friend),
      // Together, whoever finished the most parts is first on the card, though nobody is placed. Against each
      // other, those who finished their picture by time, and then the rest by how much of it they painted.
      rank: (a, b) => (this.mode === 'together' ? b.dropped - a.dropped : Number(b.won) - Number(a.won) || (a.won ? a.ms - b.ms : b.dropped - a.dropped)),
      resultText: ({ ms, won, dropped }) => (this.mode === 'together' ? `${dropped} ${dropped === 1 ? 'part' : 'parts'}` : won ? raceTime(ms) : `${dropped}% painted`),
      titles: { first: 'You finished first!', other: 'Lovely painting!' },
      // With friends, together or against each other: the grown-ups' choice, which the friends box can change too.
      teams: {
        get: () => (session.settings.paintFriends === 'against' ? 'against' : 'together'),
        set: (choice) => this.chooseTeams(choice),
      },
      startAfter: byId('start'),
      waitingBefore: byId('screen-finish'),
      resultsAfter: document.querySelector('#screen-finish .finish-hero'),
      finishTitle: document.querySelector('#screen-finish h2'),
    });
    this.painting = this.newPainting(session.level);
    this.view.setPainting(this.painting);
    this.showProgress();
    const game = this;
    this.debug = {
      view: this.view,
      gloves: this.gloves,
      get painting() {
        return game.painting;
      },
      get game() {
        return game;
      },
    };
  }

  resetCounts() {
    this.closedFor = 0;
    this.restFor = 0;
    this.hintFor = 0;
    this.stampIdleFor = 0;
    this.praised = 0;
    this.partyIn = null;
    this.lostIn = null;
    this.alive = false;
    this.filmShown = false;
    this.storyFor = 0;
    this.brushLevel = 0;
    this.sentPercent = -1;
  }

  /* ---------- the grown-ups' choices ---------- */

  get settings() {
    return this.session.settings;
  }

  brushName() {
    return BRUSH_NAMES.includes(this.settings.paintBrush) ? this.settings.paintBrush : 'small';
  }

  doneName() {
    return DONE_NAMES.includes(this.settings.paintDone) ? this.settings.paintDone : 'most';
  }

  /** Whether another painter paints the same picture, to beat, or it's the gentle picture, as a grown-up chose. */
  rivalName() {
    return RIVALS.includes(this.settings.paintRival) ? this.settings.paintRival : 'contest';
  }

  rule() {
    return RULES.includes(this.settings.paintColours) ? this.settings.paintColours : 'own';
  }

  /**
   * A sheet on their own, or with friends the host's picture without what the levels bring, by the host's rule
   * for the paints and how much of a part is enough. Each child keeps their own brush and reach help.
   */
  newPainting(level, friendly = null) {
    const { rule, done } = friendly ? readMode(friendly.mode) : { rule: this.rule(), done: this.doneName() };
    return new Painting({
      level: friendly?.level ?? level,
      plain: Boolean(friendly),
      rule,
      done,
      brush: this.brushName(),
      rival: this.rivalName(),
      shared: friendly?.team ? { claim: (k) => this.friends.claim(k) } : null,
      me: friendly ? this.friends.room.you : 'me',
      onEvent: (event) => this.onPaint(event),
    });
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
    return paintNewAt(level);
  }

  setHands() {
    for (const glove of Object.values(this.gloves)) glove.hide();
  }

  settingChanged(change) {
    const { screen } = this.session;
    // A new rule for the paints, or how much is enough, starts with the next picture, and the title shows it now.
    // A picture that's being painted, or has just been finished, stays as it is.
    if (!['playing', 'countdown', 'finish'].includes(screen) && ('paintColours' in change || 'paintDone' in change || 'paintRival' in change)) {
      this.painting = this.newPainting(this.session.level);
      this.view.setPainting(this.painting);
      this.showProgress();
    }
    // The brush's size changes straight away, in the middle of a picture too.
    if ('paintBrush' in change) this.painting.size = BRUSHES[this.brushName()];
    if ('paintColours' in change || 'paintDone' in change || 'paintFriends' in change) {
      if (this.friends.room.inRoom) this.friends.room.tell(this.friends.hello());
    }
    if ('paintFriends' in change) this.friends.showTeams();
  }

  /** Together or against each other, chosen in the friends box: kept with the grown-ups' settings, and shown there. */
  chooseTeams(choice) {
    this.session.changeSettings({ paintFriends: choice });
    const input = document.querySelector(`input[name="paintFriends"][value="${choice}"]`);
    if (input) input.checked = true;
  }

  /* ---------- a new picture ---------- */

  prepare(level) {
    // With friends, everyone has the host's picture, plain, which doesn't move anyone's own level on.
    const friendly = this.friends.current;
    this.mode = friendly ? (friendly.team ? 'together' : 'against') : 'solo';
    document.body.toggleAttribute('data-friends-race', Boolean(friendly));
    this.painting = this.newPainting(level, friendly);
    this.view.setPainting(this.painting);
    this.friendBrushes = (friendly?.friends ?? []).map((friend) => ({ id: friend.id, name: friend.spec.name, who: friend.spec.id, glove: new Glove('right'), track: new Track(BRUSH_TRACK), fade: 0, heardAt: -Infinity, at: null }));
    this.scores = new Map();
    this.clock = this.mode === 'against' ? RACE_SECONDS : null;
    byId('chip-time-box').hidden = this.clock === null;
    this.resetCounts();
    this.story.hide();
    this.showProgress();
    this.showScores();
    const { stamp, friend } = this.painting.plan;
    byId('chip-friend-box').hidden = !this.painting.friend;
    byId('chip-friend').textContent = '?';
    this.showRival();
    this.session.sound.lost = false;
    byId('sum-left-stars').closest('tr').hidden = !stamp;
    byId('sum-left-friends').closest('tr').hidden = !friend;
  }

  begin() {
    const { sound } = this.session;
    this.goAt = performance.now();
    this.sentAt = 0;
    sound.startLoop('birds', BIRDS_LEVEL);
    sound.startLoop('brush', 0);
    this.story.say('giraffe', INTRO);
    this.storyFor = STORY_SECONDS;
    this.nameNewThings();
  }

  /** The newest thing the level brings is named first, then whatever else is on the desk, each the first time. */
  nameNewThings() {
    const { painting, view } = this;
    const newest = (paintNewAt(painting.level)[0] ?? {}).key;
    const named = [];
    const pot = (find) => painting.pots.find(find);
    const over = (each) => () => ({ x: each.x, y: each.y - 9 });
    const rainbow = pot((each) => each.kind === 'colour' && each.colour === 'rainbow');
    if (rainbow) named.push(['rainbow', over(rainbow)]);
    const stamp = pot((each) => each.kind === 'stamp');
    if (stamp) named.push(['stamp', over(stamp)]);
    const dish = pot((each) => each.kind === 'dish');
    if (dish) named.push(['dish', over(dish)]);
    const { roller, friend } = painting;
    if (roller) named.push(['roller', () => (roller.taken ? null : { x: roller.x, y: roller.y - 3 })]);
    if (friend) named.push(['friend', () => (friend.found ? null : { x: painting.parts[friend.part].dot.x, y: painting.parts[friend.part].dot.y })]);
    if (painting.mirror) named.push(['mirror', () => ({ x: SHEET.width / 2, y: 30 })]);
    if (painting.numbers) named.push(['numbers', () => ({ x: SHEET.width / 2, y: 104 })]);
    const free = painting.parts.find((part) => part.kind === 'free');
    if (free) named.push(['free', () => (free.done ? null : { x: free.dot.x, y: free.dot.y })]);
    named.sort(([a], [b]) => Number(b === newest) - Number(a === newest));
    for (const [name, target] of named) view.introduce(name, target);
  }

  /** What the rules say happens, heard and seen. */
  onPaint(event) {
    const { sound } = this.session;
    const { view, painting } = this;
    switch (event.type) {
      case 'dip':
        sound.play('dip', { gain: 0.5, rate: 0.9 + Math.random() * 0.3 });
        view.splash(event.pot.x, event.pot.y - 4, event.pot.colour ?? 'yellow');
        break;
      case 'dish':
        sound.play('dip', { gain: 0.4, rate: 0.75 });
        view.splash(event.pot.x, event.pot.y - 2, event.pot.holds);
        break;
      case 'mix':
        sound.play('mix', { gain: 0.3 });
        sound.star();
        view.splash(event.pot.x, event.pot.y - 2, event.colour, 1.4);
        if (event.into) view.sparkle(event.into.x, event.into.y - 4);
        break;
      case 'part': {
        const { part } = event;
        view.settle(part, event.colour);
        view.sparkle(part.dot.x, part.dot.y);
        view.cheer();
        sound.play('part', { gain: 0.42 });
        this.story.hide();
        // Every third one has a word of praise, if nothing else is being said.
        if (event.mine && this.praised % 3 === 2 && !painting.done) sound.say(PRAISE[Math.floor(this.praised / 3) % PRAISE.length], { ifQuiet: true });
        if (event.mine) this.praised += 1;
        this.showProgress();
        this.showScores();
        break;
      }
      case 'friend':
        sound.play('boing', { gain: 0.3, rate: 1.15 });
        sound.star();
        view.heart(event.friend.at[0], event.friend.at[1] - 5);
        byId('chip-friend').textContent = event.friend.mark;
        break;
      case 'stamp':
        sound.play('pop', { gain: 0.3, rate: 1.25 + Math.random() * 0.2 });
        this.stampIdleFor = 0;
        break;
      case 'roller':
        sound.handsOpen();
        view.sparkle(event.roller.x, event.roller.y, '#ffffff');
        break;
      case 'balloon':
        sound.play('pop', { gain: 0.45, rate: 0.9 + Math.random() * 0.2 });
        view.splash(event.balloon.x, event.balloon.y, event.colour, 2);
        break;
      case 'balloon-new':
        view.introduce('balloon', () => (event.balloon.popped ? null : { x: event.balloon.x, y: event.balloon.y - 4 }));
        break;
      case 'helped':
        // Giraffe hands over the right paint.
        sound.handsOpen();
        view.cheer(0.8);
        break;
      case 'done':
        // The last part fills in, and then the picture comes to life for a moment, before the finish card.
        this.partyIn = SETTLE_FIRST + LIFE_SECONDS;
        this.story.hide();
        break;
      case 'beaten':
        // The other painter has finished first: a soft sound, and the contest is over a moment later.
        this.lostIn = RIVAL.lostSeconds;
        sound.play('sparkle', { gain: 0.2, rate: 0.8 });
        this.story.hide();
        this.showRival();
        break;
      default:
    }
  }

  /* ---------- each frame ---------- */

  /**
   * The glove follows the hand in play over the desk. The brush is the middle of the hand, so the top of the sheet
   * has to be where the middle of the hand can get to with its fingers still in the camera picture: a band of the
   * picture, HAND_BAND, covers the desk from top to bottom, with the same measure across as down, so a circle drawn
   * in the air is a circle on the sheet. Reach help makes a narrower band cover it, round the same middle, so a
   * smaller movement goes further.
   */
  followHand(dt, snapshot) {
    const { desk, palmSize } = this.view;
    const gain = REACH[this.settings.paintReach] ?? REACH.little;
    const aspect = this.session.camera.aspect;
    const middle = (HAND_BAND.top + HAND_BAND.bottom) / 2;
    const half = (HAND_BAND.bottom - HAND_BAND.top) / 2 / gain;
    // The glove is placed on a field that the middle of the camera picture fills: see GLOVE_VIEW.
    const height = (desk.height * GLOVE_VIEW.high) / (half * 2);
    const width = Math.max(height * aspect * (GLOVE_VIEW.wide / GLOVE_VIEW.high), desk.width * gain * 1.1);
    this.gloveOffset = { x: desk.left + desk.width / 2 - width / 2, y: desk.top - ((middle - half - GLOVE_VIEW.top) / GLOVE_VIEW.high) * height };
    for (const [hand, glove] of Object.entries(this.gloves)) {
      if (hand !== snapshot.side) glove.hide();
      else glove.follow(snapshot[hand], dt, { aspect, palmSize, width, height });
    }
  }

  /** Where the glove is on the screen, and on the sheet, or null when it can't be seen. */
  gloveOnScreen(side = this.settings.hands) {
    const glove = this.gloves[side];
    return glove?.visible ? { x: glove.x + this.gloveOffset.x, y: glove.y + this.gloveOffset.y } : null;
  }

  brushOnSheet(side = this.settings.hands) {
    const on = this.gloveOnScreen(side);
    return on ? this.view.toSheet(on.x, on.y) : null;
  }

  update(dt, snapshot) {
    const { view, painting, session } = this;
    this.followHand(dt, snapshot);
    const at = this.brushOnSheet(snapshot.side);
    // A hand that's missing or unsure is never open: it fails closed.
    const open = Boolean(at && snapshot.handOpen === true);
    const before = painting.stats.stamps;
    painting.update(dt, { at, open });
    if (this.mode !== 'solo' && session.screen === 'playing') this.withFriends(dt);
    view.drawMarks(painting.takeMarks());
    view.update(dt, painting);
    // The brush on the paper sounds while it lays paint, as loud as it's going.
    const laying = painting.fresh > 0 ? 1 : 0;
    this.brushLevel += (laying - this.brushLevel) * (1 - Math.exp(-dt * (laying ? 14 : 6)));
    session.sound.setLoopLevel('brush', this.brushLevel * BRUSH_LEVEL);
    this.closedFor = at && !open ? this.closedFor + dt : 0;
    this.restFor = open ? 0 : this.restFor + dt;
    this.hintFor = painting.hint ? this.hintFor + dt : 0;
    const stamping = painting.brush.tool === 'stamp' && open && painting.stats.stamps === before;
    this.stampIdleFor = stamping ? this.stampIdleFor + dt : painting.brush.tool === 'stamp' ? this.stampIdleFor : 0;
    this.showFilm();
    if (this.storyFor > 0) {
      this.storyFor -= dt;
      if (this.storyFor <= 0) this.story.hide();
    }
    if (this.clock !== null && this.partyIn === null) {
      this.clock = Math.max(0, RACE_SECONDS - this.sinceGo / 1000);
      byId('chip-time').textContent = clock(this.clock);
      // Time's up: everyone's picture is as far as it got.
      if (this.clock === 0 && session.screen === 'playing') session.finish();
    }
    if (this.partyIn !== null) {
      this.partyIn -= dt;
      if (!this.alive && this.partyIn <= LIFE_SECONDS) {
        this.alive = true;
        view.startLife(painting);
        view.cheer(LIFE_SECONDS);
        session.sound.play('cheer', { gain: 0.25 });
        session.sound.play('sparkle', { gain: 0.3 });
      }
      if (this.partyIn <= 0 && session.screen === 'playing') this.end();
    }
    this.showRival();
    if (this.lostIn !== null) {
      this.lostIn -= dt;
      if (this.lostIn <= 0 && session.screen === 'playing') this.end();
    }
  }

  /** The contest is over. One the other painter won is told kindly, with no party, and Try again on the big button. */
  end() {
    const { session, painting } = this;
    session.sound.lost = painting.lost;
    session.finish();
    // After the card is filled in, which puts back the usual title.
    if (this.mode === 'solo') document.querySelector('#screen-finish h2').textContent = painting.lost ? BEATEN(this.rivalCharacter().name) : FINISH;
    if (painting.lost) {
      session.hud.hideSummary();
      byId('play-again').textContent = TRY_AGAIN;
    }
  }

  /** The other painter, from core/body/roster.js. */
  rivalCharacter() {
    return characterWithId(this.painting.rival?.who) ?? ROSTER[1];
  }

  /** The other painter at the top: their face, their name, and how far through the picture they are. */
  showRival() {
    const { rival } = this.painting;
    const box = byId('chip-rival-box');
    box.hidden = !rival;
    if (!rival) return;
    const who = this.rivalCharacter();
    if (box.dataset.who !== who.id) {
      box.dataset.who = who.id;
      byId('rival-name').textContent = who.name;
      byId('rival-face').src = this.session.portraits?.[who.id] ?? '';
    }
    const shown = Math.round(rival.progress * 200) / 2;
    if (this.rivalShown === shown) return;
    this.rivalShown = shown;
    byId('rival-done').style.width = `${shown}%`;
    box.classList.toggle('is-near', rival.progress > 0.75);
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
    // Behind the title card is the level's own picture: a grown-up may just have chosen another level.
    if (screen === 'welcome' && this.painting.level !== this.session.levels.current) {
      this.painting = this.newPainting(this.session.levels.current);
      this.view.setPainting(this.painting);
      this.showProgress();
    }
    this.view.drawMarks(this.painting.takeMarks());
    this.view.update(dt, this.painting);
  }

  /** The little film of what to do, until the first part is painted, or a while. */
  showFilm() {
    const wanted = this.painting.stats.parts === 0 && this.session.playSeconds < FILM_SECONDS;
    if (wanted !== this.filmShown) {
      this.filmShown = wanted;
      document.body.dataset.film = wanted ? 'on' : 'off';
    }
  }

  render() {
    const { view, painting } = this;
    const side = this.session.settings.hands;
    const glove = this.gloves[side];
    const gloves = [];
    // Friends' gloves first, grey and see-through, under the child's own.
    for (const each of this.friendBrushes) {
      if (!each.at || each.fade < 0.02) continue;
      const on = view.at(each.at.x, each.at.y);
      gloves.push({ glove: each.glove, x: on.x, y: on.y, look: { ...FRIEND_LOOK, alpha: each.fade * 0.85 }, name: each.name, down: Boolean(each.at.o), colour: COLOUR_NAMES[Math.round(each.at.c)] ?? null, radius: each.at.r });
    }
    const on = this.gloveOnScreen(side);
    if (on) {
      const { brush, roller, stamping } = painting;
      const playing = this.session.screen === 'playing';
      let ring = null;
      if (brush.tool === 'stamp' && stamping && !stamping.printed) ring = stamping.for / EXTRAS.stampSeconds;
      else if (roller?.taken && roller.left > 0) ring = roller.left / EXTRAS.rollerSeconds;
      const mine = { glove, x: on.x, y: on.y, down: playing && brush.down, colour: brush.tool === 'paint' ? brush.colour : null, tool: brush.tool, radius: painting.radius, ring: playing ? ring : null };
      // The butterfly: the other wing's brush, where the same stroke is being painted.
      if (painting.mirror && playing) {
        const sheet = view.toSheet(on.x, on.y);
        const far = view.at(SHEET.width - sheet.x, sheet.y);
        gloves.push({ ...mine, glove: null, ghost: true, x: far.x, y: far.y, ring: null });
      }
      gloves.push(mine);
    }
    view.render({ painting, gloves, side, waving: this.session.screen !== 'playing' || this.session.playSeconds < 3 });
  }

  /* ---------- with friends ---------- */

  /** Each frame of a game with friends: what's sent, and where everyone is. */
  withFriends(dt) {
    const { painting, friends } = this;
    const now = performance.now();
    if (this.mode === 'together') {
      // The strokes painted since last time, where the brush is, and which parts are done, 10 times a second.
      if (now - this.sentAt >= SEND_EVERY_MS && friends.room.inRoom && friends.current) {
        this.sentAt = now;
        friends.room.say({ t: 'brush', ms: Math.round(this.sinceGo), ...this.brushState(), s: painting.takeStrokes(STROKE_NUMBERS), d: painting.doneBits() });
      }
      this.showFriendsBrushes(dt);
    } else {
      // Against each other: only how far along the picture is, when that changes.
      const percent = Math.round(painting.progress * 100);
      if (percent !== this.sentPercent) {
        this.sentPercent = percent;
        friends.sendScore(percent, this.sinceGo);
        this.showScores();
      }
    }
  }

  /**
   * Where the child's brush is, for friends' games: on the sheet, whether it can be seen and is down, its paint
   * and its size, and the glove's points in palms.
   */
  brushState() {
    const glove = this.gloves[this.settings.hands];
    const at = this.brushOnSheet();
    if (!at || !glove.visible) return { x: 0, y: 0, v: 0, o: 0, c: 0, r: 0, p: [] };
    const { brush } = this.painting;
    const palm = this.view.palmSize;
    return {
      x: round1(at.x),
      y: round1(at.y),
      v: 1,
      o: brush.down ? 1 : 0,
      c: Math.max(0, COLOUR_NAMES.indexOf(brush.colour)),
      r: round1(this.painting.radius),
      p: glove.points.flatMap(({ x, y }) => [round2(x / palm), round2(y / palm)]),
    };
  }

  /** Each friend's glove where their hand is on the sheet, a moment ago, fading in and out as it comes and goes. */
  showFriendsBrushes(dt) {
    const now = performance.now();
    const palm = this.view.palmSize;
    for (const each of this.friendBrushes) {
      const at = each.track.at(now);
      const seen = Boolean(at?.v) && now - each.heardAt < QUIET_MS && !this.friends.results.has(each.id);
      each.fade += ((seen ? 1 : 0) - each.fade) * (1 - Math.exp(-dt * FADE_RATE));
      if (!at) continue;
      each.at = at;
      const { glove } = each;
      glove.visible = seen || each.fade > 0.05;
      glove.status = 'open';
      if (at.p?.length === 42) {
        glove.points.forEach((point, index) => {
          point.x = at.p[index * 2] * palm;
          point.y = at.p[index * 2 + 1] * palm;
        });
      }
    }
  }

  /** Something from a friend's game: their strokes and where their brush is, whose a part was, or how far they've got. */
  fromFriend(id, message) {
    if (!this.friends.current?.racers.includes(message.t === 'claimed' ? message.by : id)) return;
    if (message.t === 'claimed') {
      if (this.mode === 'together') this.painting.claimed(message.k, message.by);
      this.showScores();
      return;
    }
    if (message.t === 'score') {
      this.scores.set(id, Math.max(0, Math.min(100, Math.round(message.n))));
      this.showScores();
      return;
    }
    if (message.t !== 'brush' || this.mode !== 'together') return;
    const each = this.friendBrushes.find((brush) => brush.id === id);
    if (!each) return;
    each.track.push(message, performance.now());
    each.heardAt = performance.now();
    // Their strokes are painted here too, and any part their game has done is done here.
    this.painting.friendStrokes(message.s);
    this.painting.learnDone(message.d);
  }

  /** A friend has gone, and their glove with them. What they painted stays painted, and stays theirs. */
  friendGone(friend) {
    this.friendBrushes = this.friendBrushes.filter((each) => each.id !== friend.id);
    this.scores.delete(friend.id);
    this.showScores();
  }

  /**
   * With friends, along the top: together, how many parts each one's stroke finished, and against each other,
   * how far along each one's picture is, the most first.
   */
  showScores() {
    const list = byId('paint-scores');
    const { current } = this.friends;
    list.hidden = this.mode === 'solo' || !current;
    if (list.hidden) return;
    const portraits = this.session.portraits ?? {};
    const you = this.friends.room.you;
    const together = this.mode === 'together';
    const scoreOf = (id) => (together ? this.painting.tally.get(id) ?? 0 : id === you ? Math.round(this.painting.progress * 100) : this.scores.get(id) ?? 0);
    const mine = { id: you, name: 'You', who: (characterWithId(this.settings.fighter) ?? ROSTER[0]).id };
    const theirs = current.friends.filter((friend) => !friend.gone).map((friend) => ({ id: friend.id, name: friend.spec.name, who: friend.spec.id }));
    const everyone = [mine, ...theirs].map((each) => ({ ...each, score: scoreOf(each.id) })).sort((a, b) => b.score - a.score);
    const key = everyone.map(({ id, score }) => `${id}:${score}`).join(',');
    if (list.dataset.key === key) return;
    list.dataset.key = key;
    list.replaceChildren(...everyone.map((each) => {
      const row = document.createElement('li');
      row.classList.toggle('is-you', each.id === you);
      const face = document.createElement('img');
      face.alt = '';
      face.src = portraits[each.who] ?? '';
      const name = document.createElement('span');
      name.className = 'paint-score-name';
      name.textContent = each.name;
      const score = document.createElement('span');
      score.className = 'paint-score';
      score.textContent = together ? String(each.score) : `${each.score}%`;
      row.append(face, name, score);
      return row;
    }));
  }

  showProgress() {
    const { painting } = this;
    byId('chip-parts').textContent = `${painting.stats.parts} of ${painting.toPaint.length}`;
  }

  /* ---------- keeping the picture ---------- */

  /** Saves the picture as it is to this computer, as a file. Nothing is sent anywhere. */
  savePicture() {
    const canvas = this.view.picture(this.painting);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const link = document.createElement('a');
      link.download = `giraffe-paint-box-${this.painting.page.id}.png`;
      link.href = URL.createObjectURL(blob);
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
    }, 'image/png');
  }

  /* ---------- the end ---------- */

  prompt(snapshot, dt) {
    const { session, painting } = this;
    const needed = session.handsPrompt(snapshot, dt);
    if (painting.done || painting.lost) return null;
    if (needed && !needed.key.startsWith('closed')) return needed;
    // In the gentle picture the hand can rest whenever it likes: the picture just waits. After a while, it's said
    // that's fine. In a contest that isn't said, as the other painter doesn't wait for a closed hand.
    if (!painting.rival && this.restFor > RESTING_AFTER) return { key: 'resting', text: SPOKEN.resting, side: null };
    if (this.closedFor > CLOSED_PROMPT_AFTER) return { key: 'open-to-paint', text: OPEN_TO_PAINT, side: null, asks: 'open' };
    // A part with the wrong paint on it is showing which pot it wants: the words say so too.
    const { hint } = painting;
    if (hint && this.hintFor > HINT_PROMPT_AFTER) {
      if (hint.recipe) return { key: 'mix-hint', text: MIX_HINT, side: null };
      return painting.numbers ? { key: 'number-hint', text: NUMBER_HINT, side: null } : { key: 'dip-hint', text: DIP_HINT, side: null };
    }
    if (this.stampIdleFor > STAMP_HINT_AFTER) return { key: 'stamp-hint', text: STAMP_HINT, side: null };
    if (painting.stats.cells === 0 && session.playSeconds > 2.5 && session.playSeconds < PAINT_HINT_SECONDS) return { key: 'paint-hint', text: PAINT_HINT, side: null, asks: 'open' };
    return null;
  }

  finished() {
    const { sound } = this.session;
    sound.stopLoop('birds');
    sound.stopLoop('brush');
    this.story.hide();
    // With friends: together, how many parts this child's stroke finished, as the server said, and against each
    // other, whether the picture was finished, and how far along it got.
    if (this.mode === 'together') this.friends.finished(this.sinceGo, { n: this.painting.tally.get(this.friends.room.you) ?? 0, w: 1 });
    else if (this.mode === 'against') this.friends.finished(this.sinceGo, { n: Math.round(this.painting.progress * 100), w: this.painting.done ? 1 : 0 });
    for (const each of this.friendBrushes) each.glove.visible = false;
    for (const glove of Object.values(this.gloves)) glove.hide();
  }

  summary() {
    const { stats } = this.painting;
    const hand = this.session.settings.hands;
    const row = (value) => ({ left: hand === 'left' ? value : '', right: hand === 'right' ? value : '' });
    this.friends.showResults();
    return {
      hero: stats.parts,
      noun: 'picture',
      rows: { parts: row(stats.parts), dips: row(stats.dips), stars: row(stats.stamps), friends: row(stats.friends) },
      // On their own, the other painter can finish first, and that picture comes round again at the same level. In the
      // gentle picture, and with friends, every picture gets painted in the end.
      won: !this.painting.lost,
      // A picture with friends is the host's, so it doesn't move the child's own level on.
      countsForLevel: !this.friends.current,
    };
  }
}

/** The game's sounds. A contest the other painter won ends softly, with no fanfare and nothing said. */
class PaintSound extends Sound {
  lost = false;

  finish(line) {
    if (this.lost) this.play('sparkle', { gain: 0.3 });
    else super.finish(line);
  }
}

const choice = (name, value, label) => `<label><input type="radio" name="${name}" value="${value}"> ${label}</label>`;

new GameSession({
  // What the open and closed hand do here, for the hand shapes in the grown-ups' panel: see core/shapes.js.
  moves: { open: 'Paint', closed: null },
  shell: {
    title: 'Giraffe’s Paint Box',
    startLabel: 'Start painting',
    againLabel: 'Paint again',
    finishTitle: FINISH,
    heroMark: '🎨',
    heroNoun: 'parts painted',
    extraRows: [{ id: 'parts', label: 'Parts painted' }, { id: 'dips', label: 'Dips in the paint pots' }, { id: 'stars', label: 'Stars printed' }, { id: 'friends', label: 'Friends found' }],
    hudTop: `
      <div class="paint-hud">
        <div class="chip chip-parts"><span class="chip-label">Painted</span><span id="chip-parts" class="chip-value">0 of 8</span></div>
        <div id="chip-friend-box" class="chip chip-friend" hidden><span class="chip-label">Hiding</span><span id="chip-friend" class="chip-value">?</span></div>
        <div id="chip-rival-box" class="chip chip-rival" hidden><span class="chip-label"><img id="rival-face" class="rival-face" alt=""> <span id="rival-name"></span></span><span class="thin-meter rival-meter"><span id="rival-done"></span></span></div>
        <div id="chip-time-box" class="chip" hidden><span class="chip-label">Time</span><span id="chip-time" class="chip-value">3:00</span></div>
        <ol id="paint-scores" class="paint-scores" aria-label="How everyone is getting on" hidden></ol>
      </div>
      ${STORY_BOX}
      <div class="film paint-film" aria-hidden="true">
        <svg viewBox="0 0 220 170">
          <defs><clipPath id="film-inside"><circle cx="110" cy="62" r="40" /></clipPath></defs>
          <rect class="film-sheet" x="14" y="10" width="192" height="104" rx="6" />
          <g clip-path="url(#film-inside)">
            <path class="film-row film-row-1" d="M76 44H146" />
            <path class="film-row film-row-2" d="M146 62H76" />
            <path class="film-row film-row-3" d="M76 80H146" />
          </g>
          <circle class="film-fill" cx="110" cy="62" r="40" />
          <circle class="film-shape" cx="110" cy="62" r="40" />
          <circle class="film-dot" cx="110" cy="62" r="6" />
          <g class="film-pot film-pot-a"><rect x="42" y="134" width="34" height="28" rx="7" /><ellipse cx="59" cy="134" rx="18" ry="7" /></g>
          <g class="film-pot film-pot-b"><rect x="144" y="134" width="34" height="28" rx="7" /><ellipse cx="161" cy="134" rx="18" ry="7" /></g>
          <g class="film-hand">
            <rect x="-13" y="-8" width="26" height="22" rx="8" />
            <path class="film-finger" d="M-8 -6V-22M-2 -8V-26M4 -8V-26M10 -6V-20M13 6L22 -2" />
            <circle class="film-blob" cx="0" cy="3" r="6" />
          </g>
        </svg>
      </div>`,
    panelSettings: `
      <fieldset class="choice">
        <legend>Brush size (bigger is easier)</legend>
        ${choice('paintBrush', 'small', 'Small')}
        ${choice('paintBrush', 'medium', 'Medium')}
        ${choice('paintBrush', 'big', 'Big')}
      </fieldset>
      <fieldset class="choice">
        <legend>How much of a part to paint before it fills itself in</legend>
        ${choice('paintDone', 'some', 'About two thirds')}
        ${choice('paintDone', 'most', 'Most of it')}
        ${choice('paintDone', 'all', 'Nearly all')}
      </fieldset>
      <fieldset class="choice">
        <legend>Reach help (a smaller movement goes further across the picture)</legend>
        ${choice('paintReach', 'none', 'None')}
        ${choice('paintReach', 'little', 'A little')}
        ${choice('paintReach', 'lots', 'A lot')}
      </fieldset>
      <fieldset class="choice">
        <legend>Another painter</legend>
        ${choice('paintRival', 'contest', 'A contest: a friend paints the same picture, and the first to finish wins')}
        ${choice('paintRival', 'gentle', 'Gentle: nobody to beat, take all the time you need')}
      </fieldset>
      <fieldset class="choice">
        <legend>Colours</legend>
        ${choice('paintColours', 'own', 'Each part takes only the paint its dot asks for')}
        ${choice('paintColours', 'free', 'Free painting: any colour anywhere')}
      </fieldset>
      <fieldset class="choice">
        <legend>With friends</legend>
        ${choice('paintFriends', 'together', 'Together: everyone paints the same picture')}
        ${choice('paintFriends', 'against', 'Against each other: who finishes their own picture first')}
      </fieldset>
      <div class="panel-actions">
        <button id="save-picture-now" class="soft-button" type="button">Save the picture as it is</button>
      </div>`,
  },
  defaults: { paintBrush: 'small', paintDone: 'most', paintRival: 'contest', paintReach: 'little', paintColours: 'own', paintFriends: 'together' },
  choices: { paintBrush: String, paintDone: String, paintRival: String, paintReach: String, paintColours: String, paintFriends: String },
  tagline: (side) => `Giraffe is painting pictures for the party. Dip your open ${side} hand in a paint pot, and colour them in!`,
  finishLine: FINISH,
  lines: new URL('./audio/voice/lines.json', import.meta.url),
  portraits: () => renderPortraits(ROSTER),
  createSound: (options) => new PaintSound({
    ...options,
    sounds: {
      brush: new URL('../lighthouse/audio/wipe.ogg', import.meta.url),
      birds: new URL('../spider-catcher/audio/birds.ogg', import.meta.url),
      dip: new URL('../robot-rescue/audio/goo-pop.ogg', import.meta.url),
      part: new URL('../spider-catcher/audio/home.ogg', import.meta.url),
      sparkle: new URL('../mighty-moves/audio/sparkle.ogg', import.meta.url),
      cheer: new URL('../mighty-moves/audio/cheer.ogg', import.meta.url),
      mix: new URL('../smoothie-stand/audio/mixer.ogg', import.meta.url),
      boing: new URL('../robot-rescue/audio/boing.ogg', import.meta.url),
      pop: new URL('../balloon-pop/audio/pop.ogg', import.meta.url),
    },
  }),
  createGame: (session) => new PaintGame(session),
}).start();
