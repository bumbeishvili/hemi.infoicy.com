// Spider Catcher: Giraffe's little spider friends have run off all over the garden. The child opens a hand
// near one and closes it to pick it up, carries it across to its web, and opens the hand to let it in.
// The story and rules are in spiders.js, and the garden is in garden.js. On their own, or with friends on
// their own computers, all catching the same spiders: see friends.js.
import { MoveDemo } from '../../core/body/demo.js';
import { renderPortraits } from '../../core/body/portraits.js';
import { ROSTER, byId as characterById } from '../../core/body/roster.js';
import { Track } from '../../core/friends.js';
import { FriendsPanel } from '../../core/friends-ui.js';
import { Glove } from '../../core/glove.js';
import { GameSession } from '../../core/session.js';
import { Sound } from '../../core/sound.js';
import { STORY_BOX, StoryBox } from '../../core/story.js';
import { catchKey } from './friends.js';
import { Garden } from './garden.js';
import { GET_AWAY_MOST, Gathering, PLACES, placesAt, spiderNewAt } from './spiders.js';

const CLOSE_ON_ONE = 'Close your hand on a spider!';
const OPEN_ON_WEB = 'Bring it to the web, and open your hand!';
const TO_THE_FLOWER = ['Take her to the flower!', 'ყვავილთან მიიყვანე!'];
const ALL_HOME = 'Every spider is home!';
// When too many got away. It's on the card. The voice says what it says after any game that was lost.
const GOT_AWAY = 'Three little spiders got away!';
const LOST_LINE = 'So close! Try again!'; // One of the lines every game has: see SO_CLOSE in core/sound.js.
const AFTER_GOT_AWAY_SECONDS = 1.2; // A moment to see the garden, before the card.

const LAST_WORDS_SECONDS = 2.4;
const HINT_AFTER_SECONDS = 4;
const FILM_SECONDS = 16;
const CLAP_SECONDS = 1.7; // Giraffe claps for each spider home, then watches again.
const BIRDS_LEVEL = 0.35;

// Playing with friends, each on their own computer. See core/friends-ui.js for what each of these is.
const SPIDER_WORDS = {
  toggle: 'Play with friends',
  make: 'Make a game',
  codeLabel: 'A friend’s game code',
  codeName: 'Game code',
  how: 'Tell your friends the code. Then you all press <b>Catch the spiders</b>',
  leave: 'Leave this game',
  privacy: 'Only your name, who you play as, where your glove is, which spiders it catches and how many you bring home go to your friends. The camera picture stays on this computer.',
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
const CATCHER_TRACK = { lerp: ['x', 'y'], lists: ['p'], steps: ['v', 'o'] };
const GLOVE_FADE_RATE = 8; // How quickly a friend's glove fades in and out, as their hand comes and goes.
const round2 = (value) => Math.round(value * 100) / 100;
const round3 = (value) => Math.round(value * 1000) / 1000;

const byId = (id) => document.getElementById(id);
const sounds = Object.fromEntries(['home', 'rustle', 'birds'].map((name) => [name, new URL(`./audio/${name}.ogg`, import.meta.url)]));

class SpiderGame {
  chimeOnOpen = false;

  constructor(session) {
    this.session = session;
    this.story = new StoryBox(session);
    this.gathering = null;
    this.timer = 0;
    this.after = null;
    this.idleFor = 0;
    this.clapUntil = 0;
    this.goAt = 0;
    this.clockFrom = 0;
    this.friendsGloves = []; // Each friend's glove, as { id, name, who, glove, track, fade, n }: see showFriendsGloves.
    this.garden = new Garden({ backdrop: byId('backdrop'), canvas: byId('game') }, {
      onCatch: () => {
        this.idleFor = 0;
        session.sound.play('tick', { gain: 0.5 });
      },
      onHome: (side, by) => this.onHome(by),
      onLetGo: (by) => {
        // A friend letting one go is only heard softly.
        session.sound.play('rustle', { gain: by ? 0.25 : 0.5, rate: 1.1 });
        if (!by) this.gathering?.letGo();
      },
      onDash: () => session.sound.play('rustle', { gain: 0.4, rate: 1.25 }),
      // A berry picked, a helper met, a sleepy spider woken: a soft sound each, and no words.
      onBerry: () => {
        session.sound.play('star', { gain: 0.3, rate: 1.05 + Math.random() * 0.15 });
        this.showBerries(true);
      },
      onHelper: () => session.sound.play('handsOpen', { gain: 0.4 }),
      onWake: () => session.sound.play('rustle', { gain: 0.35, rate: 0.9 }),
      onStash: () => session.sound.play('tick', { gain: 0.4 }),
      onLeave: () => this.leave(),
      // A spider nobody played with heads off, and one that gets to the edge of the garden has got away.
      onHeadOff: () => session.sound.play('rustle', { gain: 0.45, rate: 0.8 }),
      onGotAway: (last) => this.onGotAway(last),
      onMoved: () => this.gathering.nextPlace(),
    });
    this.garden.language = () => session.settings.language;
    this.garden.prizeTarget = () => {
      const box = byId('chip-berries')?.getBoundingClientRect();
      return box && box.width ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : { x: 80, y: 40 };
    };
    byId('finish-hero')?.closest('.finish-hero')?.insertAdjacentHTML('afterend', '<p id="finish-prizes" class="finish-prizes"></p>');
    this.giraffe = new MoveDemo(byId('giraffe-stage'));
    this.giraffe.setCharacter(characterById('giraffe'));
    // Playing with friends, if a grown-up makes or joins a game.
    this.friends = new FriendsPanel({
      game: 'spider-catcher',
      linkKey: 'spiders',
      words: SPIDER_WORDS,
      hello: () => ({ driver: session.settings.fighter ?? '', level: session.levels.current, length: 1, mode: '' }),
      screen: () => session.screen,
      portraits: () => session.portraits,
      onMove: (id, message) => {
        if (message.t === 'claimed') this.claimed(message);
        else if (message.t === 'catcher') this.fromFriend(id, message);
      },
      onGone: (friend) => this.friendGone(friend),
      // Whoever brought the most home, and equal ones share a place.
      rank: (a, b) => b.dropped - a.dropped,
      resultText: ({ dropped }) => `${dropped} ${dropped === 1 ? 'spider' : 'spiders'}`,
      titles: { first: 'You brought the most home!', other: 'Great catching!' },
      startAfter: byId('start'),
      waitingBefore: byId('screen-finish'),
      resultsAfter: document.querySelector('#screen-finish .finish-hero'),
      finishTitle: document.querySelector('#screen-finish h2'),
    });
    this.applySettings();
    const game = this;
    this.debug = {
      garden: this.garden,
      giraffe: this.giraffe,
      get gathering() {
        return game.gathering;
      },
      get game() {
        return game;
      },
    };
  }

  applySettings() {
    const { hands, reach, spiderAway } = this.session.settings;
    this.garden.side = hands;
    this.garden.reach = reach;
    // Spiders who play as long as it takes, as the garden always had them, if a grown-up chose it. From the next game.
    this.garden.gentle = spiderAway === 'gentle';
    document.body.dataset.side = hands;
  }

  setHands() {
    this.applySettings();
    this.giraffeDoes('giraffeWaits');
  }

  settingChanged() {
    this.applySettings();
  }

  /** He faces the spiders, on the side of the hand being played with. */
  giraffeDoes(name) {
    this.giraffe.show(name, this.session.settings.hands);
  }

  /** With friends, the start waits until they're ready too. */
  holdStart(go) {
    return this.friends.holdStart(go);
  }

  /** How long since "GO!", by the clock on the wall, for friends' games. */
  get sinceGo() {
    return performance.now() - this.goAt;
  }

  /** The spiders this child has brought home. On their own, that's every one home; with friends, they did the rest. */
  get broughtHome() {
    return this.friends.current ? this.garden.mine : this.gathering.stats.home;
  }

  /**
   * A new game, at this level: see gardenAt in spiders.js for what each level brings. With friends, everyone plays
   * the same garden, at the host's level: see friends.js. Each child keeps their own hand and reach help, and the
   * game doesn't move anyone's own level on.
   */
  prepare(level) {
    const friendly = this.friends.current;
    document.body.toggleAttribute('data-friends-race', Boolean(friendly));
    this.applySettings();
    this.story.hide();
    this.after = null;
    // The garden's clock, with friends, starts as the game does, which is the same moment on every friend's computer.
    this.clockFrom = performance.now();
    this.garden.setShared(friendly ? {
      seed: friendly.seed,
      clock: () => (performance.now() - this.clockFrom) / 1000,
      me: this.friends.room.you,
      claim: (k) => this.friends.claim(k),
    } : null);
    const played = friendly?.level ?? level;
    this.garden.home = { left: 0, right: 0 };
    this.garden.picked = { left: 0, right: 0 };
    this.garden.ladybirds = { left: 0, right: 0 };
    this.garden.berries = [];
    this.garden.flying = [];
    this.garden.labels = [];
    this.garden.introduced = new Set();
    this.garden.setLevel(played);
    this.lost = false;
    this.showAway();
    // Berries only come from level 2, so there's no tally before then, and none with friends.
    document.body.dataset.prizes = this.garden.level.berries ? 'on' : 'off';
    this.showBerries();
    this.garden.arriveAt(PLACES[0].place, 0);
    this.gathering = new Gathering({ level: played, onEvent: (event) => this.onGathering(event) });
    // Each friend's glove, in light grey, where their hand is in the garden on their own screen.
    this.friendsGloves = (friendly?.friends ?? []).map((friend) => this.gloveFor(friend));
    this.garden.friendsGloves = this.friendsGloves;
    this.giraffeDoes('giraffeWaits');
    this.showProgress();
    this.showScores();
  }

  begin() {
    this.goAt = performance.now();
    this.session.sound.startLoop('birds', BIRDS_LEVEL);
    this.gathering.nextPlace();
  }

  later(seconds, what) {
    this.timer = seconds;
    this.after = what;
  }

  onGathering(event) {
    const handlers = {
      place: () => this.onPlace(event),
      home: () => this.showProgress(),
      'place-done': () => this.onPlaceDone(event),
      'all-home': () => this.session.finish(),
    };
    handlers[event.type]?.();
  }

  onPlace({ place, index }) {
    this.garden.arriveAt(place.place, place.count, index);
    this.giraffeDoes('giraffeWaits');
    this.story.say(place.who, place.hello);
    this.idleFor = 0;
    this.showProgress();
  }

  /** A spider is home: this child's, or with friends, by a friend, whose harp is softer. Giraffe claps for each. */
  onHome(by = null) {
    const { sound } = this.session;
    sound.play('home', { gain: by ? 0.45 : 0.75, rate: 0.95 + Math.random() * 0.12 });
    if (!by) this.idleFor = 0;
    this.clapUntil = performance.now() + CLAP_SECONDS * 1000;
    this.giraffeDoes('clap');
    this.gathering.spiderHome();
    this.showScores();
  }

  /** Off to the next place almost at once, except at the very end, where there's a thank-you. */
  onPlaceDone({ place }) {
    const next = this.gathering.places[this.gathering.index + 1];
    if (!next) {
      this.story.say(place.who, place.done);
      this.later(LAST_WORDS_SECONDS, () => this.gathering.nextPlace());
      return;
    }
    this.garden.moveOn();
  }

  leave() {
    const next = this.gathering.places[this.gathering.index + 1];
    if (!next) return;
    this.clapUntil = 0;
    this.giraffeDoes('walk');
    this.garden.goTo(next.place);
  }

  /** What each level brings that's new: see spiderNewAt in spiders.js. */
  newAt(level) {
    return spiderNewAt(level);
  }

  /** A spider got away. The last there can be ends the game, at the same level, to try again. */
  onGotAway(last) {
    this.session.sound.play('rustle', { gain: 0.5, rate: 0.7 });
    this.showAway();
    if (!last || this.lost) return;
    this.lost = true;
    this.later(AFTER_GOT_AWAY_SECONDS, () => this.session.finish());
  }

  /** How many have got away, of how many can, while that can happen. */
  showAway() {
    const { wandering } = this.garden;
    byId('chip-away-box').hidden = !wandering.on;
    byId('chip-away').textContent = `${wandering.away} of ${GET_AWAY_MOST}`;
  }

  /** The berry tally, which grows a little for a moment when a berry lands in it. */
  showBerries(picked = false) {
    const chip = byId('chip-berries');
    chip.textContent = String(this.garden.berryTotal);
    if (!picked) return;
    const box = chip.closest('.chip');
    box.classList.remove('is-caught');
    void box.offsetWidth;
    box.classList.add('is-caught');
  }

  showProgress() {
    const { gathering } = this;
    const dots = byId('spider-dots');
    if (dots.children.length !== gathering.total) {
      dots.innerHTML = Array.from({ length: gathering.total }, () => '<li></li>').join('');
    }
    [...dots.children].forEach((dot, index) => dot.classList.toggle('is-home', index < gathering.stats.home));
    byId('chip-home').textContent = `${gathering.stats.home} of ${gathering.total}`;
  }

  /* ---------- with friends ---------- */

  /** The server says whose a spider is: whoever's hand closed on it first. */
  claimed({ k, by }) {
    if (!this.friends.current?.racers.includes(by)) return;
    this.garden.claimed(k, by);
  }

  /** A friend's glove, as it's shown here. */
  gloveFor(friend) {
    return { id: friend.id, name: friend.spec.name, who: friend.spec.id, glove: new Glove('right'), track: new Track(CATCHER_TRACK), fade: 0, n: 0 };
  }

  /** A friend's glove, what's in it, and which spiders are home on their screen. */
  fromFriend(id, message) {
    if (!this.garden.shared) return;
    let friend = this.friendsGloves.find((each) => each.id === id);
    if (!friend) {
      // Back after losing the connection for long enough to have been taken for gone: their glove comes back, and
      // what they catch and bring home still counts here, so that nobody is left waiting for a spider.
      const racer = this.friends.current?.friends.find((each) => each.id === id);
      if (!racer) return;
      friend = this.gloveFor(racer);
      this.friendsGloves.push(friend);
    }
    friend.track.push(message, performance.now());
    friend.n = message.n;
    this.garden.fromFriend(id, message);
    this.showScores();
  }

  /** A friend who goes takes their glove with them, and a spider in it goes back to playing. Everyone else plays on. */
  friendGone(friend) {
    this.garden.friendGone(friend.id);
    this.friendsGloves = this.friendsGloves.filter((each) => each.id !== friend.id);
    this.garden.friendsGloves = this.friendsGloves;
    this.showScores();
  }

  /**
   * Where the child's glove is, for friends' games, in the garden they share (see toCommon in garden.js), with its
   * points in palms, what's in it, as the claim it was caught with, which spiders are home here and how many were
   * this child's.
   */
  catcherState() {
    const { garden } = this;
    const glove = garden.gloves[garden.side];
    const seen = glove.visible;
    const at = seen ? garden.toCommon(glove.x, glove.y) : { x: 0, y: 0 };
    const palm = garden.palmSize;
    const { holding } = garden;
    return {
      x: round3(at.x),
      y: round3(at.y),
      v: seen ? 1 : 0,
      o: seen && glove.status === 'open' ? 1 : 0,
      // Turned round for the left hand, as the garden friends share is a right hand's.
      p: seen ? glove.points.flatMap(({ x, y }) => [round2((x * garden.way) / palm), round2(y / palm)]) : [],
      z: Math.max(0, this.gathering.index),
      h: holding ? catchKey(garden.placeIndex, holding.index, holding.catches) : -1,
      m: garden.homeBits,
      n: garden.mine,
    };
  }

  /** Each friend's glove where their hand is in the garden, a moment ago, fading in and out as it comes and goes. */
  showFriendsGloves(dt) {
    const { garden } = this;
    const now = performance.now();
    for (const each of this.friendsGloves) {
      const at = each.track.at(now);
      const seen = Boolean(at?.v && at.p?.length === 42);
      each.fade += ((seen ? 1 : 0) - each.fade) * (1 - Math.exp(-dt * GLOVE_FADE_RATE));
      if (!seen) {
        if (each.fade < 0.02) each.glove.visible = false;
        continue;
      }
      const { glove } = each;
      const spot = garden.fromCommon(at.x, at.y);
      glove.visible = true;
      glove.status = at.o ? 'open' : 'closed';
      glove.x = spot.x;
      glove.y = spot.y;
      glove.points.forEach((point, index) => {
        point.x = at.p[index * 2] * garden.way * garden.palmSize;
        point.y = at.p[index * 2 + 1] * garden.palmSize;
      });
    }
  }

  /** With friends, how many spiders each has brought home, the most first. */
  showScores() {
    const list = byId('spider-scores');
    const { current } = this.friends;
    list.hidden = !current || !this.garden.shared;
    if (list.hidden) return;
    const portraits = this.session.portraits ?? {};
    const you = this.friends.room.you;
    const mine = { id: you, name: 'You', who: (characterById(this.session.settings.fighter) ?? ROSTER[0]).id, n: this.garden.mine };
    const everyone = [mine, ...this.friendsGloves.map(({ id, name, who, n }) => ({ id, name, who, n }))].sort((a, b) => b.n - a.n);
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
      name.className = 'spider-score-name';
      name.textContent = each.name;
      const score = document.createElement('span');
      score.className = 'spider-score';
      score.textContent = String(each.n);
      row.append(face, name, score);
      return row;
    }));
  }

  /* ---------- each frame ---------- */

  update(dt, snapshot) {
    if (this.after) {
      this.timer -= dt;
      if (this.timer <= 0) {
        const what = this.after;
        this.after = null;
        what();
      }
    }
    this.giraffe.update(dt);
    if (this.garden.shared) this.showFriendsGloves(dt);
    this.garden.update(dt, snapshot, { aspect: this.session.camera.aspect, playing: true, showHands: true });
    // Friends see where the glove is, what's in it, and what's home here.
    if (this.garden.shared) this.friends.sendMove('catcher', this.catcherState(), this.sinceGo);
    if (this.clapUntil && performance.now() > this.clapUntil) {
      this.clapUntil = 0;
      if (this.garden.moving === 0) this.giraffeDoes('giraffeWaits');
    }
    if (this.garden.moving === 0 && this.giraffe.playing?.name === 'walk') this.giraffeDoes('giraffeWaits');
    this.idleFor += dt;
    const filming = this.session.playSeconds < FILM_SECONDS && this.broughtHome === 0;
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
    this.giraffe.update(dt);
    const counting = this.session.screen === 'countdown';
    // With friends, their gloves stay where they are in a hand check in the middle of a game, as they play on.
    if (this.garden.shared) this.showFriendsGloves(dt);
    this.garden.update(dt, snapshot, { aspect: this.session.camera.aspect, showHands: counting });
  }

  render() {
    this.garden.render();
  }

  prompt(snapshot, dt) {
    const { session, garden } = this;
    const needed = session.handsPrompt(snapshot, dt);
    // Closing the hand is part of this game, so it isn't asked to open unless it's time to.
    if (needed && !needed.key.startsWith('closed')) return needed;
    // Once they've got the idea, these only come back if they seem to have stopped.
    if (garden.holding && (this.broughtHome === 0 || this.idleFor > HINT_AFTER_SECONDS)) {
      // The ladybird goes home to her flower, not the web. Her hint is shown but not said, as it has no voice.
      if (garden.holding.kind === 'ladybird') {
        const [en, ka] = TO_THE_FLOWER;
        return { key: 'bring-ladybird', text: session.settings.language === 'ka' ? ka : en, side: null, silent: true };
      }
      return { key: 'bring', text: OPEN_ON_WEB, side: null, asks: 'open' };
    }
    const playing = garden.spiders.some((spider) => garden.catchable(spider));
    if (!garden.holding && playing && this.idleFor > HINT_AFTER_SECONDS) return { key: 'close-on-one', text: CLOSE_ON_ONE, side: null };
    return null;
  }

  finished() {
    // What the voice says at the end: the same kind word as any finish, when too many got away.
    this.session.finishLine = this.lost ? LOST_LINE : ALL_HOME;
    this.session.sound.stopLoop('birds');
    this.story.hide();
    this.giraffe.hide();
    if (this.garden.shared) this.friends.finished(this.sinceGo, { n: this.garden.mine, w: 1 });
    // Friends' gloves go with the end of the game, rather than staying where they last were.
    for (const each of this.friendsGloves) each.glove.visible = false;
    this.garden.setShared(null);
  }

  summary() {
    const { picked, ladybirds, berryTotal } = this.garden;
    const birds = ladybirds.left + ladybirds.right;
    byId('finish-prizes').textContent = [berryTotal ? `🍓 ${berryTotal}` : '', birds ? `🐞 ${birds}` : ''].filter(Boolean).join('   ');
    this.friends.showResults();
    if (!this.friends.current) document.querySelector('#screen-finish h2').textContent = this.lost ? GOT_AWAY : ALL_HOME;
    // The card's big button is to try the same level again. The levels' own words are put on it first.
    if (this.lost) queueMicrotask(() => {
      byId('play-again').textContent = 'Try again';
    });
    return {
      hero: this.broughtHome,
      noun: 'game',
      rows: { home: this.garden.home, berries: picked },
      // Too many getting away means trying the same level again.
      won: !this.lost,
      // A game with friends is on the host's level, so it doesn't move the child's own level on.
      countsForLevel: !this.friends.current,
    };
  }
}

const total = placesAt(1).reduce((sum, { count }) => sum + count, 0);

new GameSession({
  // What the open and closed hand do here, for the hand shapes in the grown-ups' panel: see core/shapes.js.
  moves: { open: 'Let go', closed: 'Catch and hold' },
  shell: {
    title: 'Spider Catcher',
    startLabel: 'Catch the spiders',
    againLabel: 'Play again',
    finishTitle: ALL_HOME,
    heroMark: '🏡',
    heroNoun: 'spiders brought home',
    extraRows: [{ id: 'home', label: 'Spiders home' }, { id: 'berries', label: 'Berries picked' }],
    hudTop: `
      <div class="hud-top">
        <div class="chips">
          <div class="chip"><span class="chip-label">Home</span><span id="chip-home" class="chip-value">0 of ${total}</span></div>
          <div class="chip chip-berries"><span class="chip-label">Berries</span><span id="chip-berries" class="chip-value">0</span></div>
          <div id="chip-away-box" class="chip chip-away" hidden><span class="chip-label">Got away</span><span id="chip-away" class="chip-value">0 of ${GET_AWAY_MOST}</span></div>
          <ol id="spider-scores" class="spider-scores" hidden></ol>
        </div>
      </div>
      <ol id="spider-dots" class="spider-dots" aria-hidden="true"></ol>
      ${STORY_BOX}
      <div class="film" aria-hidden="true">
        <svg viewBox="0 0 220 220">
          <g class="film-web">
            <circle cx="50" cy="96" r="34" />
            <circle cx="50" cy="96" r="20" />
            <path d="M50 62v68M16 96h68M26 72l48 48M74 72l-48 48" />
          </g>
          <g class="film-spider">
            <path class="film-legs" d="M150 60h-20M150 66l-18 8M190 60h20M190 66l18 8" />
            <circle class="film-body" cx="170" cy="62" r="18" />
            <circle class="film-eye" cx="164" cy="58" r="5" />
            <circle class="film-eye" cx="176" cy="58" r="5" />
          </g>
          <g class="film-hand">
            <rect x="150" y="96" width="46" height="42" rx="16" />
            <path class="film-finger" d="M156 102V74" />
            <path class="film-finger" d="M167 98V64" />
            <path class="film-finger" d="M179 98V62" />
            <path class="film-finger" d="M190 102V70" />
          </g>
        </svg>
      </div>`,
    panelSettings: `
      <fieldset class="choice">
        <legend>How far to reach (how far the spiders play from their web)</legend>
        <label><input type="radio" name="reach" value="none"> Far</label>
        <label><input type="radio" name="reach" value="little"> Medium</label>
        <label><input type="radio" name="reach" value="lots"> Close</label>
      </fieldset>
      <fieldset class="choice">
        <legend>Spiders getting away</legend>
        <label><input type="radio" name="spiderAway" value="away"> Left alone too long, a spider runs off: three getting away ends the game</label>
        <label><input type="radio" name="spiderAway" value="gentle"> Gentle: they play for as long as it takes, and nothing can be lost</label>
      </fieldset>`,
  },
  defaults: { reach: 'little', spiderAway: 'away' },
  choices: { reach: String, spiderAway: String },
  tagline: (side) => `Giraffe’s little spiders ran off! Close your ${side} hand on one, carry it to its web, and open your hand to put it home.`,
  finishLine: ALL_HOME,
  lines: new URL('./audio/voice/lines.json', import.meta.url),
  portraits: () => renderPortraits(ROSTER),
  createSound: (options) => new Sound({ ...options, sounds }),
  createGame: (session) => new SpiderGame(session),
}).start();
