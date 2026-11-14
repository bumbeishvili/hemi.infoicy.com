// Flap, Little Chick!: a little chick runs home along a farm track with a fox trotting behind, and the child's
// hands are its wings. Each time a hand comes up from hanging forwards, bent back at the wrist like a high five,
// that wing flaps and the chick rises, and while the hands stay up it glides. Bending the wrist back is what's
// hard with hemiplegia, and both hands do it here, each doing its share. How the hands are read is in wings.js,
// the rules are in farm.js, and the farm is drawn by view.js and critters.js.
//
// With friends, each on their own computer, up to four chicks fly home along the same track: together, as one
// flock that waits for its slowest, or against each other, as a race home. See core/friends-ui.js for making and
// joining one.
import { renderPortraits } from '../../core/body/portraits.js';
import { byId as characterWithId, ROSTER } from '../../core/body/roster.js';
import { seededRandom, Track } from '../../core/friends.js';
import { FriendsPanel, time as clockTime } from '../../core/friends-ui.js';
import { GameSession } from '../../core/session.js';
import { Sound } from '../../core/sound.js';
import { STORY_BOX, StoryBox } from '../../core/story.js';
import { giraffePixels, renderGiraffe } from '../giraffe-garden/giraffe.js';
import { CHICK_LOOKS } from './critters.js';
import { Farm, farmNewAt, FOX_NAMES, WAYS } from './farm.js';
import { CHICK_TRACK, flockFrom, friendFrom, wireFor } from './flock.js';
import { FarmView, GIRAFFE_TALL } from './view.js';
import { trusted, WINGS, Wings } from './wings.js';

const byId = (id) => document.getElementById(id);
// Each of these has a rendered voice file: see audio/voice/lines.json.
const INTRO = 'Flap home, little chick! The fox is behind you!';
const FLAP_HINT = 'Lift your hands to flap!';
const BOTH_HINT = 'Flap both wings together!';
const GLIDE_HINT = 'Keep your hands up to glide!';
const UNDER_HINT = 'Hands down to go under!';
const RESTING = 'Resting is OK. Flap when you’re ready.';
const SHOW_BOTH = 'Show both hands!';
const FINISH = 'Home safe! What a flyer!';
// What's said, and what the card says, when the fox has the chick. The button under it is to try again, as
// after any game that was lost: see core/levels.js.
const CAUGHT = 'The fox caught the chick! Try again!';
const CAUGHT_TITLE = 'The fox caught the little chick!';
const PRAISE = ['Nice one!', 'Way to go!', 'Great job!'];
const PRAISE_EVERY = 4; // Things flown over cleanly between one word of praise and the next.
const FILM_SECONDS = 25; // The little film of what to do shows until the first flaps, or this long.
const STORY_SECONDS = 6; // Giraffe's words stay up this long, or until the chick is over the first thing.
const HINT_AFTER = 2.5; // Seconds the chick has waited at something before the child is told what to do.
const RESTING_AFTER = 15; // And before saying that resting is fine.
const MISSING_AFTER = 4; // Seconds without a hand the game needs before it's asked for.
const SPOKEN_AT_MOST = 2; // Each prompt is spoken this many times in a game, and only read after that.
const BIRDS_LEVEL = 0.1;
const MUSIC_LEVEL = 0.13;
const ENGINE_LEVEL = 0.1;
const WIND_LEVEL = 0.3;

// With friends, each on their own computer: see core/friends-ui.js for what each of these is.
const FLAP_WORDS = {
  toggle: 'Fly with friends',
  make: 'Make a flock',
  codeLabel: 'A friend’s flock code',
  codeName: 'Flock code',
  how: 'Tell your friends the code. Then you all press <b>Flap home!</b>, and race each other home.',
  // Together or against each other, as whoever made the flock chooses: see teams in core/friends-ui.js.
  together: 'Together',
  against: 'Against each other',
  howTogether: 'Tell your friends the code. Then you all press <b>Flap home!</b>, and fly home together as one flock.',
  teamTitle: 'Everyone is home!',
  leave: 'Leave this flock',
  privacy: 'Only your name, who you play as, whether you chose together or against each other, how long the way home is, where your chick is and how its wings are, and how many flaps and pieces of corn you have go to your friends. The camera picture stays on this computer.',
  alone: 'Fly on your own',
  full: 'That flock already has 4 players.',
  lost: 'Can’t reach the flock. Check the internet, then try again.',
  left: 'You’ve left the flock.',
  badCode: 'A flock code is 3 letters and numbers.',
  busy: 'Flying',
  still: 'still flying',
};

class FlapGame {
  chimeOnOpen = false; // The hands come up and go down all the time here, and a flap has its own sound.
  bothHands = true; // Both hands are drawn on the camera's picture, as each is a wing.

  constructor(session) {
    this.session = session;
    const { settings } = session;
    this.view = new FarmView(byId('game'), {
      language: () => settings.language,
      cornTarget: () => {
        const box = byId('chip-corn')?.closest('.chip')?.getBoundingClientRect();
        return box?.width ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : { x: 220, y: 50 };
      },
    });
    try {
      // Drawn as big as he'll be shown on this screen, even full screen, so he's sharp.
      const tallest = Math.max(window.innerHeight, window.screen?.height || 0);
      this.view.giraffe = renderGiraffe(characterWithId('giraffe'), giraffePixels((tallest / 9.6) * GIRAFFE_TALL, this.view.ratio));
    } catch (error) {
      // Without his picture the game still works: Giraffe just isn't by the hen house.
      console.warn('Could not draw Giraffe:', error);
    }
    this.story = new StoryBox(session);
    this.wings = new Wings();
    this.reading = { flaps: [], wings: { left: { lift: 0, up: false, seen: false }, right: { lift: 0, up: false, seen: false } } };
    this.shown = { left: 0, right: 0 }; // How far up each wing is drawn, which follows the hands smoothly.
    this.lastSnapshot = null;
    this.ghosts = [];
    this.goAt = 0;
    this.team = false;
    this.farm = this.newFarm(session.level);
    this.resetCounts();
    byId('finish-hero')?.closest('.finish-hero')?.insertAdjacentHTML('afterend', '<p id="finish-way" class="finish-way"></p>');
    // The little film of the move is on the title card too, so it's seen before the game starts.
    const film = document.querySelector('.flap-film')?.cloneNode(true);
    if (film) {
      film.className = 'flap-film-title';
      byId('tagline').after(film);
    }
    this.friends = new FriendsPanel({
      game: 'chick-flap',
      linkKey: 'flock',
      words: FLAP_WORDS,
      // The host's level and how long their way home is are everyone's.
      hello: () => ({ driver: this.myCharacter().id, level: session.levels.current, length: this.thingsChosen }),
      screen: () => session.screen,
      portraits: () => session.portraits,
      // Racing, the quickest home is first. Together nobody is placed, and each one's flaps are shown.
      resultText: ({ ms, dropped }) => (this.team ? `${dropped} ${dropped === 1 ? 'flap' : 'flaps'}` : clockTime(ms)),
      titles: { first: 'First home!', other: FINISH },
      // With friends, together or against each other: the grown-ups' choice, which the friends box can change too.
      teams: {
        get: () => (settings.flapFriends === 'against' ? 'against' : 'together'),
        set: (choice) => this.chooseTeams(choice),
      },
      startAfter: byId('start'),
      waitingBefore: byId('screen-finish'),
      resultsAfter: document.querySelector('#screen-finish .finish-hero'),
      finishTitle: document.querySelector('#screen-finish h2'),
    });
    this.showWings();
    const game = this;
    this.debug = {
      view: this.view,
      wings: this.wings,
      get farm() {
        return game.farm;
      },
      get game() {
        return game;
      },
    };
  }

  resetCounts() {
    this.praised = 0;
    this.cleans = 0;
    this.filmShown = false;
    this.storyFor = 0;
    this.missingFor = { left: 0, right: 0 };
    this.hint = null; // What the child is told as the next thing of a kind comes: 'glide' or 'under'.
    this.spokenTimes = new Map();
    this.lastPromptKey = null;
    this.engineOn = false;
    this.windOn = false;
  }

  /* ---------- the grown-ups' choices ---------- */

  get settings() {
    return this.session.settings;
  }

  /** How far a hand has to come up to flap. */
  get need() {
    return WINGS.rises[this.settings.flapRise] ?? WINGS.rises.little;
  }

  /** The one hand that works both wings, or null when each hand is a wing. */
  get single() {
    return this.settings.flapWings === 'one' ? this.settings.hands : null;
  }

  /** How many things are in the way, on a way home as long as was chosen. */
  get thingsChosen() {
    return WAYS[this.settings.flapWay] ?? WAYS.medium;
  }

  /** The child's own character in the other games, for their face among the friends. */
  myCharacter() {
    return characterWithId(this.settings.fighter) ?? ROSTER[0];
  }

  newFarm(level, friendly = null) {
    const { settings } = this;
    return new Farm({
      level: friendly?.level ?? level,
      things: friendly ? friendly.length : this.thingsChosen,
      fox: FOX_NAMES.includes(settings.flapFox) ? settings.flapFox : 'catch',
      single: this.single,
      together: Boolean(friendly?.team),
      friends: Boolean(friendly),
      random: friendly ? seededRandom(friendly.seed) : Math.random,
      onEvent: (event) => this.onFarm(event),
    });
  }

  newAt(level) {
    return farmNewAt(level);
  }

  holdStart(go) {
    return this.friends.holdStart(go);
  }

  setHands() {
    this.restage({ hands: true });
  }

  settingChanged(change) {
    this.restage(change);
    if ('flapWay' in change || 'flapFriends' in change || 'fighter' in change) {
      if (this.friends.room.inRoom) this.friends.room.tell(this.friends.hello());
    }
    if ('flapFriends' in change) this.friends.showTeams();
  }

  /** Together or against each other, chosen in the friends box: kept with the grown-ups' settings, and shown there. */
  chooseTeams(choice) {
    this.session.changeSettings({ flapFriends: choice });
    const input = document.querySelector(`input[name="flapFriends"][value="${choice}"]`);
    if (input) input.checked = true;
  }

  /** A new length, fox, or which hands are wings starts with the next game, and the title shows it now. */
  restage(change) {
    this.showWings();
    const { screen } = this.session;
    if (screen === 'playing' || screen === 'countdown' || !this.farm) return;
    if ('flapWay' in change || 'flapFox' in change || 'flapWings' in change || 'hands' in change) this.farm = this.newFarm(this.session.level);
  }

  /** Which wings there are gauges for: both, or the one hand that works both. */
  showWings() {
    document.body.dataset.flapWings = this.single ? 'one' : 'both';
  }

  /** How long since "GO!", by the clock on the wall, for friends' games. */
  get sinceGo() {
    return performance.now() - this.goAt;
  }

  /* ---------- a new game ---------- */

  /** The hand check is starting: how each hand looks in it is how it looks held up. */
  enterCheck() {
    this.wings.left.samples = [];
    this.wings.right.samples = [];
  }

  /** After a hand check in the middle of a game. */
  resume() {
    this.wings.calibrate();
  }

  prepare(level) {
    const friendly = this.friends.current;
    this.team = Boolean(friendly?.team);
    this.wings.calibrate();
    this.farm = this.newFarm(level, friendly);
    this.view.reset();
    this.resetCounts();
    this.story.hide();
    // Each friend's chick, in a colour of its own, where their game says it is.
    this.ghosts = (friendly?.friends ?? []).map((friend, index) => {
      const track = new Track(CHICK_TRACK);
      this.friends.follow(friend.id, track);
      return { friend, track, look: CHICK_LOOKS[1 + (index % (CHICK_LOOKS.length - 1))], shown: null };
    });
    document.body.toggleAttribute('data-friends-race', Boolean(friendly));
    document.body.toggleAttribute('data-friends-team', this.team);
    // Corn only comes from level 2.
    const { corn } = this.farm.plan;
    byId('chip-corn-box').hidden = !corn;
    this.showWay(true);
    this.showProgress();
    this.showCounts();
  }

  begin() {
    const { sound } = this.session;
    this.goAt = performance.now();
    this.farm.begin();
    sound.startLoop('birds', BIRDS_LEVEL);
    sound.startLoop('music', MUSIC_LEVEL);
    this.story.say('giraffe', INTRO);
    this.storyFor = STORY_SECONDS;
    this.introduceAhead();
    // And the corn, by the first piece that's still there, once what's in the way has had its label.
    const { farm } = this;
    if (farm.plan.corn) {
      this.view.introduce('corn', () => {
        const piece = farm.corn.find((each) => !each.taken && each.x > farm.chick.x + 1);
        return piece ? { x: piece.x, h: piece.h } : null;
      });
    }
  }

  /**
   * The next things in the way have their labels as they come onto the screen, the first time one of each kind
   * comes along in a game: a gust of wind, and what's in it.
   */
  introduceAhead() {
    const ahead = this.farm.things.filter((thing) => !thing.done).slice(0, 2);
    for (const thing of ahead) this.introduceThing(thing);
  }

  /** A thing's label: by the thing, while it's still ahead. */
  introduceThing(thing) {
    const { farm, view } = this;
    const key = thing.type === 'zone' ? 'gust' : thing.kind;
    view.introduce(key, () => (!thing.done && farm.things.includes(thing) && !thing.away ? { x: (thing.x0 + thing.x1) / 2, h: Math.max(thing.tall ?? 0, thing.top ?? 0, 0.8) } : null));
  }

  /** What the rules say happens, heard and seen. */
  onFarm(event) {
    const { sound } = this.session;
    const { view, farm } = this;
    const { chick } = farm;
    switch (event.type) {
      case 'flap': {
        const both = event.energy > 1.5;
        sound.play(both ? 'flap-both' : 'flap', { gain: both ? 0.34 : 0.26, rate: (both ? 1.25 : 1.5) + Math.random() * 0.12 });
        view.flap(farm, event.sides, event.open);
        // An open hand's flap has its label once, when no new thing's label is waiting to be read.
        if (event.open && !view.labels.length && !view.wanted.size) view.introduce('open', () => (chick.state === 'run' ? { x: chick.x, h: chick.h + 1 } : null));
        break;
      }
      case 'land':
        sound.play('land', { gain: 0.16, rate: 1.2 });
        view.dust(chick.x, chick.h);
        break;
      case 'wait':
        break;
      case 'tumble':
        sound.play('bump', { gain: 0.4 });
        sound.play('boing', { gain: 0.22, rate: 1.2, after: 0.12 });
        view.dust(chick.x);
        break;
      case 'splash':
        sound.play('splash', { gain: 0.4 });
        view.drops(chick.x);
        this.hint = 'glide';
        break;
      case 'bonk':
        sound.play('boing', { gain: 0.3 });
        view.straw(chick.x, event.thing.low);
        this.hint = 'under';
        break;
      case 'corn':
        sound.star();
        view.cornTaken(event.piece);
        this.showCounts();
        break;
      case 'gust':
        // The wind is heard for as long as the chick is in it: see update().
        sound.startLoop('wind', WIND_LEVEL);
        this.windOn = true;
        break;
      case 'tractor':
        sound.startLoop('engine', ENGINE_LEVEL);
        this.engineOn = true;
        break;
      case 'ride':
        sound.play('splash', { gain: 0.14, rate: 1.5 });
        sound.play('boing', { gain: 0.2, rate: 1.5 });
        break;
      case 'ride-off':
        sound.play('flap', { gain: 0.2, rate: 1.4 });
        break;
      case 'shortcut':
        sound.play('swish', { gain: 0.3 });
        break;
      case 'pounce':
        sound.play('swish', { gain: 0.3, rate: 0.8 });
        sound.play('bump', { gain: 0.25, after: 0.45 });
        view.foxLeaps(event.thing);
        break;
      case 'hen':
        sound.play('hen', { gain: 0.4 });
        view.introduce('hen', () => (farm.hen ? { x: chick.x, h: chick.h + 1.4 } : null));
        break;
      case 'set-down':
        sound.play('land', { gain: 0.2 });
        view.henLeaves(chick.x);
        break;
      case 'clear': {
        const { thing } = event;
        if (thing.kind === 'tractor' && this.engineOn) {
          sound.stopLoop('engine');
          this.engineOn = false;
        }
        this.story.hide();
        if (event.clean) {
          // Praise now and then, never over anything else being said.
          this.cleans += 1;
          if (this.cleans % PRAISE_EVERY === 0) {
            sound.say(PRAISE[this.praised % PRAISE.length], { ifQuiet: true });
            this.praised += 1;
          }
          // The hint for that kind of thing has done its job.
          if ((thing.type === 'water' && this.hint === 'glide') || (thing.type === 'over' && this.hint === 'under')) this.hint = null;
        }
        this.introduceAhead();
        this.showProgress();
        break;
      }
      case 'fox-coming':
        // He's up and coming: the child is told, in the words the flight began with.
        sound.say(INTRO, { ifQuiet: true });
        break;
      case 'caught':
        sound.play('swish', { gain: 0.3, rate: 0.8 });
        sound.play('bump', { gain: 0.25, after: 0.35 });
        this.story.hide();
        break;
      case 'door':
        break;
      case 'home':
        sound.play('cheer', { gain: 0.4 });
        sound.play('hen', { gain: 0.35, rate: 1.2 });
        view.cheer(4);
        this.story.hide();
        this.showProgress();
        break;
      default:
    }
  }

  /* ---------- each frame ---------- */

  /** What the hands are doing, from the tracker's newest look: which flapped, and how far up each wing is. */
  readWings(snapshot) {
    if (snapshot === this.lastSnapshot) return [];
    this.lastSnapshot = snapshot;
    const { camera } = this.session;
    const { other } = snapshot;
    const images = { [snapshot.side]: trusted(snapshot[snapshot.side], snapshot.overlap), [other.side]: trusted(other, snapshot.overlap) };
    this.reading = this.wings.update(images, camera.aspect, performance.now(), { need: this.need, only: this.single });
    return this.reading.flaps;
  }

  /** The wings as they're drawn and shown on their gauges, which glide between the tracker's looks. */
  followWings(dt) {
    const blend = 1 - Math.exp(-dt * 26);
    for (const side of ['left', 'right']) {
      this.shown[side] += (this.reading.wings[side].lift - this.shown[side]) * blend;
      const gauge = byId(`flap-wing-${side}`);
      const wing = this.single ? this.wings[this.single] : this.wings[side];
      gauge.style.setProperty('--lift', this.shown[side].toFixed(3));
      gauge.style.setProperty('--ready', wing.progress(this.need).toFixed(3));
      gauge.dataset.up = String(this.reading.wings[side].up);
      gauge.dataset.seen = String(this.reading.wings[side].seen);
    }
  }

  /** How the chick's wings are, for the rules and the picture: drawn smoothly, and up as the hands say. */
  wingsNow() {
    const { wings } = this.reading;
    return {
      left: { lift: this.shown.left, up: wings.left.up, seen: wings.left.seen },
      right: { lift: this.shown.right, up: wings.right.up, seen: wings.right.seen },
    };
  }

  update(dt, snapshot) {
    const { farm, view, session } = this;
    const flaps = this.readWings(snapshot);
    this.followWings(dt);
    // A flap with the hand open is a little stronger: the hand in play by its own measure, and the other by the usual one.
    const open = { [snapshot.side]: snapshot.handOpen, [snapshot.other.side]: snapshot.other.status === 'open' && !snapshot.overlap };
    const now = performance.now();
    for (const ghost of this.ghosts) ghost.shown = friendFrom(ghost.track.at(now), ghost, this.friends.results.has(ghost.friend.id));
    farm.update(dt, { wings: this.wingsNow(), flaps, open, flock: flockFrom(this.ghosts, farm.end) });
    if (this.friends.current) this.friends.sendMove('chick', wireFor(farm), this.sinceGo);
    if (flaps.length) this.showCounts();
    this.showWay();
    for (const side of ['left', 'right']) this.missingFor[side] = this.reading.wings[side].seen ? 0 : this.missingFor[side] + dt;
    // A chick waiting for a slower one, flying home together, says so.
    if (farm.chick.flockWait) view.introduce('flock', () => (farm.chick.flockWait ? { x: farm.chick.x, h: 1.1 } : null));
    // Out of the gust, or down on the ground in it, the wind dies away.
    if (this.windOn && !(farm.chick.air && farm.gustAt(farm.chick.x))) {
      session.sound.stopLoop('wind');
      this.windOn = false;
    }
    view.update(dt, farm);
    this.showFilm();
    if (this.storyFor > 0) {
      this.storyFor -= dt;
      if (this.storyFor <= 0) this.story.hide();
    }
    if (farm.done && session.screen === 'playing') {
      // Caught by the fox, it's said so, and not that the chick is home.
      session.finishLine = farm.lost ? CAUGHT : FINISH;
      session.finish();
    }
  }

  idle(dt, snapshot) {
    const { screen } = this.session;
    // On the title card, the chick stands to the left of it, where it can be seen, if the screen is wide enough.
    const card = screen === 'welcome' ? document.querySelector('#screen-welcome .title-card')?.getBoundingClientRect() : null;
    this.view.clearOf = card?.width ? card.left : null;
    if (this.filmShown) {
      this.filmShown = false;
      document.body.dataset.film = 'off';
    }
    const { other } = snapshot;
    // In the hand check, how each hand looks is how it looks held up.
    if (screen === 'check' && snapshot !== this.lastSnapshot) {
      this.lastSnapshot = snapshot;
      this.wings.sample({ [snapshot.side]: trusted(snapshot[snapshot.side], snapshot.overlap), [other.side]: trusted(other, snapshot.overlap) }, this.session.camera.aspect);
    }
    // During the countdown the wings follow the hands already, so the child can find them.
    if (screen === 'countdown') {
      this.readWings(snapshot);
      this.followWings(dt);
      this.farm.wings = this.wingsNow();
    }
    this.view.update(dt, this.farm);
  }

  /** The little film of what to do: until the first flaps, or a while, and again whenever the chick has waited. */
  showFilm() {
    const { farm } = this;
    const flapped = farm.stats.flaps.left + farm.stats.flaps.right;
    const wanted = (flapped < 2 && this.session.playSeconds < FILM_SECONDS) || (Boolean(farm.chick.waiting) && farm.chick.waitFor > HINT_AFTER);
    if (wanted !== this.filmShown) {
      this.filmShown = wanted;
      document.body.dataset.film = wanted ? 'on' : 'off';
    }
  }

  render() {
    const { screen } = this.session;
    this.view.render({
      farm: this.farm,
      friends: this.ghosts.map((ghost) => ghost.shown).filter(Boolean),
      waving: screen !== 'playing' || this.farm.chick.x > this.farm.end - 9,
    });
  }

  /* ---------- the top of the screen ---------- */

  /** How far along the way home the chick is, with a dot for each friend's. */
  showWay(fresh = false) {
    const { farm } = this;
    const way = byId('flap-way');
    if (fresh) {
      for (const dot of way.querySelectorAll('.flap-way-friend')) dot.remove();
      for (const ghost of this.ghosts) {
        const dot = document.createElement('i');
        dot.className = 'flap-way-friend';
        dot.style.background = ghost.look.body;
        way.append(dot);
        ghost.dot = dot;
      }
    }
    way.style.setProperty('--along', farm.progress.along.toFixed(4));
    for (const ghost of this.ghosts) {
      if (!ghost.dot) continue;
      ghost.dot.hidden = !ghost.shown;
      if (ghost.shown) ghost.dot.style.setProperty('--along', Math.min(1, ghost.shown.x / farm.end).toFixed(4));
    }
  }

  showProgress() {
    const { past, of } = this.farm.progress;
    byId('chip-way').textContent = `${past} of ${of}`;
  }

  showCounts() {
    const { stats } = this.farm;
    byId('chip-corn').textContent = String(stats.corn);
    for (const side of ['left', 'right']) byId(`flap-count-${side}`).textContent = String(stats.flaps[side]);
  }

  /* ---------- what the child is told ---------- */

  /** A prompt is read as long as it's up, and spoken only the first couple of times it comes in a game. */
  once(key, text, extra = {}) {
    if (this.lastPromptKey !== key) {
      this.lastPromptKey = key;
      this.spokenTimes.set(key, (this.spokenTimes.get(key) ?? 0) + 1);
    }
    return { key, text, side: null, silent: this.spokenTimes.get(key) > SPOKEN_AT_MOST, ...extra };
  }

  prompt(snapshot, dt) {
    const { farm, session } = this;
    const { chick } = farm;
    const quiet = () => {
      this.lastPromptKey = null;
      return null;
    };
    if (chick.state === 'door' || chick.state === 'home') return quiet();
    const needed = session.handsPrompt(snapshot, dt);
    // Hands too close together can't be told apart.
    if (needed?.key === 'apart') return this.once('apart', needed.text);
    const waiting = chick.waiting;
    if (waiting) {
      // Where the fox can't catch, the chick waits for as long as it takes, and after a while it's said that
      // resting is fine. Where he can, it isn't.
      if (farm.restFor > RESTING_AFTER && !farm.catches) return this.once('resting', RESTING);
      const play = snapshot.side;
      const other = play === 'left' ? 'right' : 'left';
      // Something that takes both wings: said as soon as one alone has been tried and didn't do it, and the other
      // hand is asked for if it isn't in the picture.
      if (!this.single && waiting.wings === 2 && waiting.fails >= 1) {
        return this.missingFor[other] > MISSING_AFTER ? this.once('show-both', SHOW_BOTH) : this.once('both', BOTH_HINT);
      }
      if (chick.waitFor < HINT_AFTER) return quiet();
      // The hand in play is asked for if it isn't in the picture, and otherwise it's said what to do.
      if (this.missingFor[play] > MISSING_AFTER && needed && !needed.key.startsWith('closed')) return this.once(needed.key, needed.text, { side: needed.side });
      return this.once('flap', FLAP_HINT);
    }
    // After a splash or a bump, what to do is said as the next thing of that kind comes.
    const { next } = farm;
    if (next && chick.state === 'run' && next.x0 - chick.x < 7) {
      if (this.hint === 'glide' && next.type === 'water') return this.once('glide', GLIDE_HINT);
      if (this.hint === 'under' && next.type === 'over') return this.once('under', UNDER_HINT);
    }
    return quiet();
  }

  /* ---------- the end ---------- */

  finished() {
    const { sound } = this.session;
    sound.stopLoop('birds');
    sound.stopLoop('music');
    if (this.engineOn) sound.stopLoop('engine');
    if (this.windOn) sound.stopLoop('wind');
    this.engineOn = false;
    this.windOn = false;
    this.story.hide();
    const { flaps } = this.farm.stats;
    // The friends' finish cards fill in with how long this chick took, and how many flaps it made.
    if (this.friends.current) this.friends.finished(this.sinceGo, { n: flaps.left + flaps.right, w: 1 });
  }

  summary() {
    const { stats } = this.farm;
    const { hands } = this.settings;
    const total = stats.flaps.left + stats.flaps.right;
    // Each hand has its own column. With one hand working both wings, only that hand's.
    const each = (left, right) => (this.single ? { left: hands === 'left' ? left : '', right: hands === 'right' ? right : '' } : { left, right });
    const seconds = (value) => `${Math.round(value)} s`;
    this.friends.showResults();
    // Caught, the card says so, and the button under it is to try again.
    const lost = Boolean(this.farm.lost);
    const title = document.querySelector('#screen-finish h2');
    if (!this.friends.current && title) title.textContent = lost ? CAUGHT_TITLE : FINISH;
    const noun = byId('finish-hero')?.nextSibling;
    if (noun?.nodeType === Node.TEXT_NODE) noun.textContent = total === 1 ? ' flap' : ' flaps';
    // How the way home went, in a line: what was flown over, the corn, and the hen's help if she gave any.
    const parts = [`🏠 ${stats.clean} of ${stats.cleared} flown over without a stop`];
    if (this.farm.plan.corn) parts.push(`🌽 ${stats.corn} of ${stats.cornOut}`);
    if (stats.hen) parts.push(`🐔 ${stats.hen} ${stats.hen === 1 ? 'lift' : 'lifts'} from the mother hen`);
    byId('finish-way').textContent = parts.join('   ');
    return {
      hero: total,
      noun: 'flight',
      rows: {
        flaps: each(stats.flaps.left, stats.flaps.right),
        held: each(seconds(stats.held.left), seconds(stats.held.right)),
        together: each(this.single ? '' : stats.together, this.single ? '' : stats.together),
      },
      // A chick the fox caught hasn't got home, and the level stays where it is.
      won: !lost,
      // A flight with friends is on the host's level, so it doesn't move the child's own level on.
      countsForLevel: !this.friends.current,
    };
  }
}

const choice = (name, value, label) => `<label><input type="radio" name="${name}" value="${value}"> ${label}</label>`;
const gauge = (side, name) => `
        <div id="flap-wing-${side}" class="flap-wing" data-side="${side}" data-up="false" data-seen="false">
          <svg viewBox="0 0 68 56">
            <path class="flap-wing-track" d="M8 50A28 28 0 0 1 64 50" />
            <path class="flap-wing-fill" pathLength="100" d="M8 50A28 28 0 0 1 64 50" />
            <path class="flap-wing-shape" d="M38 49C26 46 14 36 12 22c6 5 11 6 15 6-3-6-3-12-1-17 6 8 14 16 14 28 0 4-1 7-2 10z" />
          </svg>
          <span class="flap-wing-name">${name}</span>
          <span id="flap-count-${side}" class="flap-wing-count">0</span>
        </div>`;

new GameSession({
  // What the open and closed hand do here, for the hand shapes in the grown-ups' panel: see core/shapes.js. A flap
  // is the wrist coming up, whatever the fingers are doing, and an open hand's flap is a little stronger.
  moves: { open: 'Flap harder', closed: null },
  shell: {
    title: 'Flap, Little Chick!',
    startLabel: 'Flap home!',
    againLabel: 'Fly again',
    finishTitle: FINISH,
    heroMark: '🐥',
    heroNoun: 'flaps',
    extraRows: [{ id: 'flaps', label: 'Flaps' }, { id: 'held', label: 'Time held up' }, { id: 'together', label: 'Both wings together' }],
    hudTop: `
      <div class="flap-hud">
        <div class="chip chip-way">
          <span class="chip-label">Way home</span>
          <span class="chip-value"><span id="chip-way">0 of 12</span></span>
          <span id="flap-way" class="flap-way" aria-hidden="true"><i class="flap-way-fill"></i><i class="flap-way-chick">🐥</i><i class="flap-way-home">🏠</i></span>
        </div>
        <div id="chip-corn-box" class="chip chip-corn" hidden><span class="chip-label">Corn</span><span id="chip-corn" class="chip-value">0</span></div>
      </div>
      ${STORY_BOX}
      <div class="flap-wings" aria-hidden="true">${gauge('left', 'Left wing')}${gauge('right', 'Right wing')}
      </div>
      <div class="film flap-film" aria-hidden="true">
        <svg viewBox="0 0 220 160">
          <rect class="film-grass" x="0" y="132" width="220" height="28" />
          <g transform="translate(-16 0)">
            <g class="film-arm film-arm-far">
              <path class="film-sleeve-ink" d="M22 150L66 88" />
              <path class="film-sleeve" d="M22 150L66 88" />
              <g class="film-hand">
                <path class="film-finger-ink" d="M58 62V38M66 60V32M74 62V38M54 80L44 70" />
                <rect x="53" y="58" width="26" height="32" rx="10" />
                <path class="film-finger" d="M58 62V38M66 60V32M74 62V38M54 80L44 70" />
              </g>
            </g>
            <g class="film-arm">
              <path class="film-sleeve-ink" d="M46 156L92 92" />
              <path class="film-sleeve" d="M46 156L92 92" />
              <g class="film-hand">
                <path class="film-finger-ink" d="M84 66V40M92 64V34M100 66V40M80 84L70 74" />
                <rect x="79" y="62" width="26" height="32" rx="10" />
                <path class="film-finger" d="M84 66V40M92 64V34M100 66V40M80 84L70 74" />
              </g>
            </g>
          </g>
          <g transform="translate(16 0)">
            <g class="film-chick">
              <path class="film-wing film-wing-far" d="M170 98C162 96 152 88 150 78c8 2 16 6 22 14z" />
              <ellipse class="film-body" cx="172" cy="104" rx="21" ry="19" />
              <path class="film-beak" d="M192 98l12 4-12 5z" />
              <circle class="film-eye" cx="182" cy="97" r="2.6" />
              <path class="film-wing" d="M166 104C156 104 146 98 142 88c9 1 18 4 26 10z" />
              <path class="film-legs" d="M166 122v8M178 122v8" />
            </g>
          </g>
        </svg>
      </div>`,
    panelSettings: `
      <fieldset class="choice">
        <legend>How far a hand has to come up to flap</legend>
        ${choice('flapRise', 'little', 'A little')}
        ${choice('flapRise', 'more', 'More')}
        ${choice('flapRise', 'lots', 'A lot: most of the way from hanging forwards to held up')}
      </fieldset>
      <fieldset class="choice">
        <legend>Wings</legend>
        ${choice('flapWings', 'both', 'Both hands: each is a wing')}
        ${choice('flapWings', 'one', 'The hand in play alone: it works both wings')}
      </fieldset>
      <fieldset class="choice">
        <legend>The fox</legend>
        ${choice('flapFox', 'catch', 'He can catch the chick: he comes on while it stands at something, and nearer with every tumble, and a chick he catches has to start again')}
        ${choice('flapFox', 'tumble', 'He never catches it: a flap that’s too early or too small has the chick tumble over and him get nearer, and the mother hen is always there first')}
        ${choice('flapFox', 'wait', 'He keeps his distance: the chick waits for another flap, and nothing is ever lost')}
      </fieldset>
      <fieldset class="choice">
        <legend>How long the way home is</legend>
        ${choice('flapWay', 'short', 'Short')}
        ${choice('flapWay', 'medium', 'Medium')}
        ${choice('flapWay', 'long', 'Long')}
      </fieldset>
      <fieldset class="choice">
        <legend>With friends</legend>
        ${choice('flapFriends', 'together', 'Together: one flock, which waits for its slowest')}
        ${choice('flapFriends', 'against', 'Against each other: a race home')}
      </fieldset>`,
  },
  defaults: { flapRise: 'little', flapWings: 'both', flapFox: 'catch', flapWay: 'medium', flapFriends: 'together' },
  choices: { flapRise: String, flapWings: String, flapFox: String, flapWay: String, flapFriends: String },
  tagline: () => 'Flap home before the fox! Your hands are the chick’s wings: bring them up like high fives, and it flies over what’s in the way.',
  finishLine: FINISH,
  lines: new URL('./audio/voice/lines.json', import.meta.url),
  portraits: () => renderPortraits(ROSTER),
  createSound: (options) => new Sound({
    ...options,
    sounds: {
      birds: new URL('../tank-patrol/audio/birds.ogg', import.meta.url),
      music: new URL('../leap-trail/audio/music.ogg', import.meta.url),
      flap: new URL('../mighty-moves/audio/whoosh-1.ogg', import.meta.url),
      'flap-both': new URL('../mighty-moves/audio/whoosh-3.ogg', import.meta.url),
      swish: new URL('../mighty-moves/audio/whoosh-2.ogg', import.meta.url),
      land: new URL('../leap-trail/audio/land.ogg', import.meta.url),
      bump: new URL('../leap-trail/audio/bump.ogg', import.meta.url),
      boing: new URL('../robot-rescue/audio/boing.ogg', import.meta.url),
      splash: new URL('../cannon-bay/audio/splash.ogg', import.meta.url),
      wind: new URL('../cannon-bay/audio/wind.ogg', import.meta.url),
      engine: new URL('../tank-patrol/audio/engine.ogg', import.meta.url),
      hen: new URL('../spider-catcher/audio/home.ogg', import.meta.url),
      cheer: new URL('../mighty-moves/audio/cheer.ogg', import.meta.url),
    },
  }),
  createGame: (session) => new FlapGame(session),
}).start();
