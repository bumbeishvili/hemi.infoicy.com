// Gobble and Grow: the child is a tiny creature that grows by eating, from a bacterium to a galaxy, one world to
// each level. It's played with the mouth: opening it wide gobbles whatever small thing is in reach, and shutting it
// munches. Opening the mouth wide and closing it again is what children with one weaker side of the face find
// hard, and core/face/mouth.js says whether it's open, measured against the child's own widest. The creature goes
// where the child's face goes, or swims to the food by itself if a grown-up chooses the mouth alone. On their own,
// or with friends: eating from one soup to grow together, or each in their own to see who grows up first.
// The rules are in rules.js, the worlds in worlds.js, and it's drawn by view.js and art.js.
import { renderPortraits } from '../../core/body/portraits.js';
import { ROSTER } from '../../core/body/roster.js';
import { MOUTH_SAY } from '../../core/face/mouth.js';
import { FaceSession } from '../../core/face/session.js';
import { Track } from '../../core/friends.js';
import { FriendsPanel, time as clockTime } from '../../core/friends-ui.js';
import { LAST_LEVEL } from '../../core/levels.js';
import { Sound } from '../../core/sound.js';
import { BITES, FIELD, gobbleNewAt, HEAD_NAMES, LIVES, radiusAt, SAFE_SECONDS, Soup } from './rules.js';
import { GobbleView, nowLine } from './view.js';
import { worldAt } from './worlds.js';

const byId = (id) => document.getElementById(id);
const MISSION = 'Eat up, and grow as big as the sky!';
const OPEN_TO_GOBBLE = 'Open wide to gobble it up!';
const SHUT_TO_MUNCH = 'Close your mouth to munch!';
const SKY = 'You’re as big as the sky!';
const TOGETHER_LINE = 'Great job!';
const PRAISE = ['Nice one!', 'Way to go!', 'Great job!'];
const PRAISE_EVERY = 4; // Bites between one word of praise and the next.
const FILM_SECONDS = 30; // The little film of what to do shows until the first bite, or this long.
const OPEN_HINT_AFTER = 3.5; // Seconds of food waiting by a shut mouth before saying to open it.
const SHUT_HINT_AFTER = 1.2; // Seconds of a mouth still open on its food before saying to shut it.
const RESTING_AFTER = 15; // And of doing nothing at all before saying that resting is fine.
const CHEER_SECONDS = 1.8; // With friends, how long everyone is pleased before the finish card.
const GOBBLED_SECONDS = 1.6; // A moment to see the creature gobbled up, before the card.
// When a bigger thing gobbled the creature up. It's only on the card: the voice says the same kind word as any finish.
const GOBBLED = (name) => `${name} gobbled you up!`;
const LOST_LINE = 'Great job!';
const KEEP_AWAY_WITHIN = 0.4; // How near a bigger thing has to come for the label to say to keep away, in field heights.
const LABELS = {
  tooBig: ['Too big for now!', 'ჯერ ძალიან დიდია!'],
  canEat: ['Now you can eat this!', 'ახლა ამის ჭამაც შეგიძლია!'],
  keepAway: ['Too big! Keep away!', 'ძალიან დიდია! მოერიდე!'],
};
// How loud the world is underneath, and which recording it is: water, a garden's birds, the countryside's, or wind.
const AIR = [null, ['water', 0.05], ['water', 0.09], ['garden', 0.1], ['country', 0.1], ['water', 0.12], ['wind', 0.1], null, null, null];

// Playing with friends, each on their own computer. See core/friends-ui.js for what each of these is.
const GOBBLE_WORDS = {
  toggle: 'Play with friends',
  make: 'Make a game',
  codeLabel: 'A friend’s game code',
  codeName: 'Game code',
  how: 'Tell your friends the code. Then you all press <b>Let’s eat!</b>, and see who grows up first.',
  // Together or against each other, as whoever made the game chooses: see teams in core/friends-ui.js.
  together: 'Together',
  against: 'Against each other',
  howTogether: 'Tell your friends the code. Then you all press <b>Let’s eat!</b>, and eat from the same soup, to grow together.',
  teamTitle: 'You grew together!',
  leave: 'Leave this game',
  privacy: 'Only your name, who you play as in the other games, whether you chose together or against each other, where your creature is, how far its mouth is open and what it has eaten are sent to your friends. The camera picture stays on this computer.',
  alone: 'Play on your own',
  full: 'That game already has 4 players.',
  lost: 'Can’t reach the game. Check the internet, then try again.',
  left: 'You’ve left the game.',
  badCode: 'A game code is 3 letters and numbers.',
  busy: 'Eating',
  still: 'still eating',
};
// A friend's creature between what their game sends: where it is and how far its mouth is open go smoothly from
// one to the next, and how much it has eaten and whether it can be seen change half way.
const EATER_TRACK = { lerp: ['x', 'y', 'm'], steps: ['n', 'v'] };
const round3 = (value) => Math.round(value * 1000) / 1000;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

class GobbleGame {
  constructor(session) {
    this.session = session;
    const { settings } = session;
    this.view = new GobbleView(byId('game'), { language: () => settings.language });
    this.team = false;
    this.friendsOn = false;
    this.tracks = new Map();
    this.goAt = 0;
    this.resetCounts();
    this.friends = new FriendsPanel({
      game: 'gobble-grow',
      linkKey: 'gobble',
      words: GOBBLE_WORDS,
      hello: () => ({ driver: settings.fighter ?? 'giraffe', level: session.levels.current, length: this.bites }),
      screen: () => session.screen,
      portraits: () => session.portraits,
      onMove: (id, message) => this.fromFriend(id, message),
      // Together, a friend who has gone takes their share of what there was to eat with them.
      onGone: () => {
        if (!this.team || this.session.screen !== 'playing') return;
        const left = 1 + (this.friends.current?.friends.filter((friend) => !friend.gone).length ?? 0);
        this.soup.teamOf(left);
        this.showProgress();
      },
      // Against each other, those who ate everything, the quickest first. Together nobody is placed.
      resultText: ({ ms, dropped }) => (this.team ? `${dropped} ${dropped === 1 ? 'bite' : 'bites'}` : clockTime(ms)),
      titles: { first: 'You grew up first!', other: 'All grown up!' },
      // With friends, together or against each other: the grown-ups' choice, which the friends box can change too.
      teams: {
        get: () => (settings.gobbleFriends === 'against' ? 'against' : 'together'),
        set: (choice) => this.chooseTeams(choice),
      },
      startAfter: byId('start'),
      waitingBefore: byId('screen-finish'),
      resultsAfter: document.querySelector('#screen-finish .finish-hero'),
      finishTitle: document.querySelector('#screen-finish h2'),
    });
    document.querySelector('#screen-finish .finish-hero').insertAdjacentHTML('afterend', '<canvas id="finish-ladder" class="finish-ladder" aria-hidden="true"></canvas>');
    this.stage(session.level);
    const game = this;
    this.debug = {
      view: this.view,
      get soup() {
        return game.soup;
      },
      get game() {
        return game;
      },
    };
  }

  resetCounts() {
    this.restFor = 0;
    this.praised = 0;
    this.filmShown = false;
    this.cheerFor = 0;
    this.cardDrawn = false;
    this.pulling = false;
    this.gobbledFor = 0;
  }

  get settings() {
    return this.session.settings;
  }

  /** How much there is to eat in a world, as a grown-up chose. */
  get bites() {
    const chosen = Number(this.settings.gobbleBites);
    return BITES.includes(chosen) ? chosen : 12;
  }

  newAt(level) {
    return gobbleNewAt(level);
  }

  holdStart(go) {
    return this.friends.holdStart(go);
  }

  /** How long since "GO!", by the clock on the wall, which friends' games all go by. */
  get sinceGo() {
    return performance.now() - this.goAt;
  }

  /* ---------- the grown-ups' choices ---------- */

  /** A new soup, for a level: before a game, behind the title card, and for each game. */
  stage(level, { friendly = null } = {}) {
    const { settings } = this;
    const team = friendly?.team ? friendly.racers.length : 0;
    this.soup = new Soup({
      level,
      bites: friendly ? (BITES.includes(friendly.length) ? friendly.length : 12) : this.bites,
      seed: friendly ? friendly.seed : Math.floor(Math.random() * 2 ** 31),
      auto: settings.gobbleMove === 'mouth',
      head: HEAD_NAMES.includes(settings.gobbleHead) ? settings.gobbleHead : 'medium',
      team,
      // Bigger things that only nudge, as the soup always had them, if a grown-up chose it, and always with friends.
      gentle: settings.gobbleBig === 'gentle' || Boolean(friendly),
      onEvent: (event) => this.onSoup(event),
    });
    this.view.setWorld(this.soup.level);
    this.showProgress();
  }

  levelChosen(level) {
    this.restage({ level });
  }

  settingChanged(change) {
    this.restage(change);
    if ('gobbleBites' in change || 'gobbleFriends' in change) {
      if (this.friends.room.inRoom) this.friends.room.tell(this.friends.hello());
    }
    if ('gobbleFriends' in change) this.friends.showTeams();
  }

  /** What a grown-up changes starts with the next world, and the title card shows it now. */
  restage(change) {
    const { screen } = this.session;
    if (screen === 'playing' || screen === 'countdown' || screen === 'finish') return;
    if ('level' in change || 'gobbleBites' in change || 'gobbleMove' in change || 'gobbleHead' in change || 'gobbleBig' in change) this.stage(this.session.levels.current);
  }

  /** Together or against each other, chosen in the friends box: kept with the grown-ups' settings, and shown there. */
  chooseTeams(choice) {
    this.session.changeSettings({ gobbleFriends: choice });
    const input = document.querySelector(`input[name="gobbleFriends"][value="${choice}"]`);
    if (input) input.checked = true;
  }

  /* ---------- a new world ---------- */

  prepare(level) {
    const friendly = this.friends.current;
    this.friendsOn = Boolean(friendly);
    this.team = Boolean(friendly?.team);
    this.tracks = new Map((friendly?.friends ?? []).map((friend) => [friend.id, { friend, track: new Track(EATER_TRACK), eaten: 0 }]));
    document.body.toggleAttribute('data-friends-race', this.friendsOn);
    document.body.toggleAttribute('data-friends-team', this.team);
    this.resetCounts();
    this.stage(friendly?.level ?? level, { friendly });
    byId('finish-ladder').hidden = true;
  }

  begin() {
    const { sound } = this.session;
    this.goAt = performance.now();
    const air = AIR[this.soup.level - 1];
    if (air) sound.startLoop(air[0], air[1]);
    this.air = air?.[0] ?? null;
    sound.say(MISSION);
  }

  /** What the rules say happens, heard and seen. */
  onSoup(event) {
    const { sound } = this.session;
    const { view, soup } = this;
    switch (event.type) {
      case 'gulp':
        sound.play('gulp', { gain: 0.5, rate: this.pitch * (0.95 + Math.random() * 0.1) });
        this.restFor = 0;
        // Together, the server says whose it is: the first mouth to it.
        if (this.team) this.friends.claim(event.food.id);
        break;
      case 'chomp': {
        const at = view.creatureAt ?? view.at(soup.creature.x, soup.creature.y);
        sound.play('chomp', { gain: 0.5, rate: this.pitch * (0.95 + Math.random() * 0.1) });
        view.bite(at.x, at.y + (at.r ?? 0) * 0.3);
        if (this.praised % PRAISE_EVERY === PRAISE_EVERY - 1) sound.say(PRAISE[Math.floor(this.praised / PRAISE_EVERY) % PRAISE.length], { ifQuiet: true });
        this.praised += 1;
        break;
      }
      case 'grew':
        this.showProgress();
        break;
      case 'unlock': {
        // What was too big a moment ago: one of them is pointed out, if there's one to be seen.
        sound.play('sparkle', { gain: 0.3 });
        const food = this.soup?.foods.find((each) => each.kind === event.kind && this.inView(each));
        if (food) view.introduce(`can-eat-${event.kind}`, LABELS.canEat, this.placeOf(food), { first: true });
        break;
      }
      case 'bump': {
        sound.play('bump', { gain: 0.22, rate: this.pitch });
        const at = view.at(event.food.x, event.food.y);
        view.ring(at.x, at.y, event.food.r * view.scale);
        view.introduce('too-big', LABELS.tooBig, this.placeOf(event.food), { first: true });
        break;
      }
      case 'toobig':
        sound.play('boing', { gain: 0.25, rate: this.pitch });
        view.introduce('too-big', LABELS.tooBig, this.placeOf(event.food), { first: true });
        break;
      case 'won':
        sound.play('cheer', { gain: 0.3 });
        break;
      case 'caught': {
        // A bigger thing caught the creature: a soft boing, a ring, and it bounces away. One of its lives is gone.
        const at = view.creatureAt ?? view.at(soup.creature.x, soup.creature.y);
        sound.play('boing', { gain: 0.35, rate: this.pitch * 0.85 });
        view.ring(at.x, at.y, (at.r ?? 0) * 1.3, '#ffd6e0');
        this.showProgress();
        break;
      }
      case 'eaten':
        // Gobbled up: the creature goes into what caught it, and the world is over, to try again.
        sound.play('gulp', { gain: 0.6, rate: 0.6 });
        this.gobbledFor = 0;
        this.showProgress();
        break;
      default:
    }
  }

  /** Whether a thing is drifting well inside the field, where a label beside it can be read. */
  inView(food) {
    return food.state === 'drift' && food.x > 0.2 && food.x < FIELD.wide - 0.2 && food.y > 0.2 && food.y < 0.9;
  }

  /** Where a thing is on the screen now, for a label to follow it, or null once it has gone. */
  placeOf(food) {
    const { view } = this;
    return () => (this.soup.foods.includes(food) && food.state === 'drift' ? { ...view.at(food.x, food.y), r: food.r * view.scale } : null);
  }

  /** Each of the world's three things is named the first time one is well in view, in the language the voice speaks. */
  nameFoods() {
    const { view, soup } = this;
    if (view.introduced.has('food-2') && view.introduced.has('food-1') && view.introduced.has('food-0')) return;
    const world = worldAt(soup.level);
    for (const kind of [0, 1, 2]) {
      if (view.introduced.has(`food-${kind}`)) continue;
      const food = soup.foods.find((each) => each.kind === kind && this.inView(each));
      if (food) view.introduce(`food-${kind}`, [world.foods[kind].name, world.foods[kind].nameKa], this.placeOf(food));
    }
  }

  /** The first time a bigger thing that can catch the creature comes near, it says to keep away from it. */
  warn() {
    const { soup, view } = this;
    if (!soup.hunting || view.introduced.has('keep-away')) return;
    const { creature } = soup;
    const near = soup.foods.find((food) => !soup.canEat(food) && this.inView(food) && Math.hypot(food.x - creature.x, food.y - creature.y) < KEEP_AWAY_WITHIN);
    if (near) view.introduce('keep-away', LABELS.keepAway, this.placeOf(near), { first: true });
  }

  /** Small creatures sound high, and big ones low. */
  get pitch() {
    return 1.3 - (this.view.level - 1) * 0.065;
  }

  /* ---------- each frame ---------- */

  /** What the child is doing, as the soup wants it. */
  inputFrom(snapshot) {
    return { open: snapshot.mouthOpen, seen: snapshot.seen, steer: snapshot.steer };
  }

  /**
   * How far open the creature's mouth is shown: a little, as the child's mouth begins to open, and wide once it
   * counts, so that the moment it's wide enough can be seen.
   */
  mouthShown(snapshot) {
    if (!snapshot.seen) return 0;
    const { amount, lineAmount, mouthOpen } = snapshot;
    if (mouthOpen) return 0.55 + 0.45 * clamp((amount - lineAmount) / Math.max(0.05, 1 - lineAmount), 0, 1);
    return 0.3 * clamp(amount / Math.max(0.05, lineAmount), 0, 1);
  }

  update(dt, snapshot) {
    const { soup, view, session } = this;
    soup.update(dt, this.inputFrom(snapshot), this.friendsOn ? this.sinceGo / 1000 : null);
    this.mouth = this.mouthShown(snapshot);
    this.restFor = snapshot.mouthOpen || soup.creature.holding ? 0 : this.restFor + dt;
    if (this.friendsOn) this.friends.sendMove('eater', this.eaterState(snapshot), this.sinceGo);
    if (!soup.won) this.nameFoods();
    this.warn();
    view.update(dt);
    this.showFilm();
    if (soup.gobbled) {
      this.gobbledFor += dt;
      if (this.gobbledFor >= GOBBLED_SECONDS && session.screen === 'playing') session.finish();
      return;
    }

    if (!soup.won) return;
    if (this.friendsOn) {
      // With friends there's no next world to pull back to: everyone is pleased for a moment, and that's the game.
      this.cheerFor += dt;
      if (this.cheerFor >= CHEER_SECONDS && session.screen === 'playing') session.finish();
    } else if (!this.pulling) {
      this.pulling = true;
      view.startPull(soup.level);
      session.sound.play('whoosh', { gain: 0.3, rate: 0.55, after: 0.7 });
      session.sound.play('sparkle', { gain: 0.3, after: view.pullSeconds - 2.4 });
    } else if (view.pullOver && session.screen === 'playing') {
      session.finish();
    }
  }

  idle(dt, snapshot) {
    const { screen } = this.session;
    if (this.filmShown) {
      this.filmShown = false;
      document.body.dataset.film = 'off';
    }
    // The creature copies the child's mouth as soon as it can be seen, and in the countdown it goes where the face
    // goes, so the child can find it. Nothing is eaten until the game begins.
    const counting = screen === 'countdown';
    const trying = counting || screen === 'check';
    this.mouth = trying ? this.mouthShown(snapshot) : 0;
    // Nothing comes after the creature or catches it until the game begins, nor for a moment after.
    this.soup.safeFor = Math.max(this.soup.safeFor, SAFE_SECONDS);
    this.soup.update(dt, { open: false, seen: counting && snapshot.seen, steer: snapshot.steer });
    this.view.update(dt);
    // The picture of how much the child grew goes on the finish card once the card is there to draw on.
    if (screen === 'finish' && !this.cardDrawn && this.view.pull) {
      const card = byId('finish-ladder');
      card.hidden = false;
      this.cardDrawn = this.view.drawGrewCard(card);
    }
  }

  render() {
    const { screen } = this.session;
    this.view.render({ soup: this.soup, mouth: this.mouth ?? 0, friends: this.friendsShown(), hud: screen === 'playing' || screen === 'countdown' });
  }

  /** The little film of what to do: until the first bite, or a while. */
  showFilm() {
    const wanted = this.soup.stats.gulps === 0 && this.session.playSeconds < FILM_SECONDS;
    if (wanted !== this.filmShown) {
      this.filmShown = wanted;
      document.body.dataset.film = wanted ? 'on' : 'off';
    }
  }

  /* ---------- the top of the screen ---------- */

  showProgress() {
    const { soup } = this;
    if (!soup) return;
    const world = worldAt(soup.level);
    byId('chip-bites').textContent = this.team ? String(soup.eaten) : `${Math.min(soup.eaten, soup.goal)} of ${soup.goal}`;
    byId('chip-team-box').hidden = !this.team;
    byId('chip-team').textContent = `${Math.min(soup.total, soup.goal)} of ${soup.goal}`;
    byId('chip-you').textContent = `${world.mark} ${world.you}`;
    // How many more times a bigger thing can catch the creature, where they can.
    const lives = soup.danger;
    byId('chip-lives-box').hidden = !lives;
    if (lives) byId('chip-lives').textContent = `${'💛'.repeat(Math.max(0, soup.lives))}${'🤍'.repeat(LIVES - Math.max(0, soup.lives))}`;
  }

  /* ---------- with friends ---------- */

  /** Where the child's creature is, for friends' games: across and down the field, from 0 to 1. */
  eaterState(snapshot) {
    const { creature } = this.soup;
    return { x: round3(creature.x / FIELD.wide), y: round3(creature.y), m: Math.round((this.mouth ?? 0) * 100) / 100, n: this.soup.eaten, v: snapshot.seen ? 1 : 0 };
  }

  /** Something from a friend's game: where their creature is, or, together, whose mouth got to a thing first. */
  fromFriend(id, message) {
    const { current } = this.friends;
    if (!current || this.session.screen !== 'playing') return;
    if (message.t === 'eater') {
      const friend = this.tracks.get(id);
      if (!friend) return;
      friend.track.push(message, performance.now());
      friend.eaten = message.n;
    } else if (message.t === 'claimed' && this.team) {
      const mine = message.by === this.friends.room.you;
      const theirs = mine ? null : this.tracks.get(message.by)?.track.at(performance.now());
      this.soup.claimed(message.k, mine, theirs ? { x: theirs.x * FIELD.wide, y: theirs.y } : null);
      this.showProgress();
    }
  }

  /** Friends' creatures, as their games said a moment ago: together they're all as big as each other. */
  friendsShown() {
    if (!this.friendsOn || this.session.screen === 'finish') return [];
    const now = performance.now();
    const shown = [];
    for (const { friend, track, eaten } of this.tracks.values()) {
      if (friend.gone) continue;
      const at = track.at(now);
      if (!at) continue;
      const before = friend.lastX ?? at.x;
      if (Math.abs(at.x - before) > 0.002) friend.facing = Math.sign(at.x - before);
      friend.lastX = at.x;
      shown.push({
        x: at.x * FIELD.wide,
        y: at.y,
        r: this.team ? this.soup.creature.r : radiusAt(eaten / this.soup.goal),
        mouth: at.m,
        facing: friend.facing ?? 1,
        name: this.team ? friend.spec.name : `${friend.spec.name} ${eaten}`,
      });
    }
    return shown;
  }

  /* ---------- the end ---------- */

  prompt(snapshot) {
    const { soup, session } = this;
    if (soup.won || soup.gobbled) return null;
    const face = session.facePrompt(snapshot);
    if (face) return face;
    const { creature } = soup;
    // Something is in the mouth, and it's still open: shutting it is the other half of the bite.
    if (creature.holding && creature.heldFor > SHUT_HINT_AFTER) return { key: 'shut-to-munch', text: SHUT_TO_MUNCH, side: null };
    // The mouth can rest whenever it likes: the food waits. After a while, it's said that's fine.
    if (this.restFor > RESTING_AFTER) return { key: 'resting', text: MOUTH_SAY.resting, side: null };
    if (soup.waitedFor > OPEN_HINT_AFTER) return { key: 'open-to-gobble', text: OPEN_TO_GOBBLE, side: null };
    return null;
  }

  finished() {
    const { sound } = this.session;
    if (this.air) sound.stopLoop(this.air);
    if (this.friendsOn) this.friends.finished(this.sinceGo, { n: this.soup.eaten, w: 1 });
  }

  summary() {
    const { soup } = this;
    const last = soup.level >= LAST_LEVEL;
    const next = last ? null : worldAt(soup.level + 1);
    // With friends, the results say how everyone did. On their own, the title says what they've become.
    this.friends.showResults();
    const title = document.querySelector('#screen-finish h2');
    const gobbled = soup.gobbled && !this.friendsOn;
    const by = gobbled ? worldAt(soup.level).foods[soup.eatenBy.kind].name : '';
    if (!this.friendsOn) title.textContent = gobbled ? GOBBLED(by) : last ? SKY : 'You grew!';
    // The card's big button is to try the same world again. The levels' own words are put on it first.
    if (gobbled) queueMicrotask(() => {
      byId('play-again').textContent = 'Try again';
    });
    return {
      hero: soup.eaten,
      noun: 'world',
      line: this.friendsOn ? TOGETHER_LINE : gobbled ? LOST_LINE : next ? nowLine(next) : SKY,
      // A world is won by eating it all. Gobbled up by something bigger, it's the same world again. With friends it's
      // the host's level, and nothing can gobble anyone up.
      won: !gobbled,
      countsForLevel: !this.friendsOn,
    };
  }
}

const choice = (name, value, label) => `<label><input type="radio" name="${name}" value="${value}"> ${label}</label>`;

new FaceSession({
  shell: {
    title: 'Gobble and Grow',
    startLabel: 'Let’s eat!',
    againLabel: 'Play again',
    finishTitle: 'You grew!',
    heroMark: '😋',
    heroNoun: 'bites',
    hudTop: `
      <div class="gobble-hud">
        <div class="chip chip-bites"><span class="chip-label">Eaten</span><span id="chip-bites" class="chip-value">0 of 12</span></div>
        <div id="chip-team-box" class="chip chip-team" hidden><span class="chip-label">Together</span><span id="chip-team" class="chip-value">0 of 24</span></div>
        <div class="chip chip-you"><span class="chip-label">You are</span><span id="chip-you" class="chip-value"></span></div>
        <div id="chip-lives-box" class="chip chip-lives" hidden><span class="chip-label">Lives</span><span id="chip-lives" class="chip-value"></span></div>
      </div>
      <div class="film gobble-film" aria-hidden="true">
        <svg viewBox="0 0 220 160">
          <circle class="film-food" cx="0" cy="0" r="13" />
          <g class="film-eater">
            <ellipse class="film-body" cx="150" cy="88" rx="56" ry="50" />
            <circle class="film-eye" cx="130" cy="70" r="9" />
            <circle class="film-eye" cx="166" cy="70" r="9" />
            <circle class="film-pupil" cx="128" cy="71" r="4.5" />
            <circle class="film-pupil" cx="164" cy="71" r="4.5" />
            <ellipse class="film-mouth" cx="146" cy="106" rx="20" ry="17" />
          </g>
          <path class="film-crumbs" d="M118 100l-8 -5M116 112l-10 2M122 122l-7 7" />
        </svg>
      </div>`,
    panelSettings: `
      <fieldset class="choice">
        <legend>How the creature moves</legend>
        ${choice('gobbleMove', 'face', 'It goes where the face goes: mouth and steering')}
        ${choice('gobbleMove', 'mouth', 'It swims to the food by itself: mouth only')}
      </fieldset>
      <fieldset class="choice">
        <legend>How far the head has to move to cross the screen</legend>
        ${choice('gobbleHead', 'small', 'A little')}
        ${choice('gobbleHead', 'medium', 'Medium')}
        ${choice('gobbleHead', 'big', 'A lot')}
      </fieldset>
      <fieldset class="choice">
        <legend>Bigger things</legend>
        ${choice('gobbleBig', 'catch', 'They can catch you: caught three times, you’re gobbled up, and the world starts again')}
        ${choice('gobbleBig', 'gentle', 'Gentle: they only nudge you aside, and nothing can be lost')}
      </fieldset>
      <fieldset class="choice">
        <legend>How much to eat in each world</legend>
        ${choice('gobbleBites', '8', '8 bites')}
        ${choice('gobbleBites', '12', '12 bites')}
        ${choice('gobbleBites', '16', '16 bites')}
      </fieldset>
      <fieldset class="choice">
        <legend>With friends</legend>
        ${choice('gobbleFriends', 'together', 'Together: one soup, and everyone grows as one')}
        ${choice('gobbleFriends', 'against', 'Against each other: see who grows up first')}
      </fieldset>`,
  },
  defaults: { gobbleMove: 'face', gobbleHead: 'medium', gobbleBites: 12, gobbleBig: 'catch', gobbleFriends: 'together' },
  choices: { gobbleMove: String, gobbleHead: String, gobbleBites: Number, gobbleBig: String, gobbleFriends: String },
  tagline: 'You’re a tiny bacterium. Open your mouth wide to gobble up what’s smaller than you, and grow into a whole galaxy!',
  finishLine: SKY,
  lines: new URL('./audio/voice/lines.json', import.meta.url),
  createSound: (options) => new Sound({
    ...options,
    sounds: {
      gulp: new URL('../robot-rescue/audio/goo-pop.ogg', import.meta.url),
      chomp: new URL('../giraffe-walk/audio/crunch.ogg', import.meta.url),
      bump: new URL('../leap-trail/audio/bump.ogg', import.meta.url),
      boing: new URL('../robot-rescue/audio/boing.ogg', import.meta.url),
      sparkle: new URL('../mighty-moves/audio/sparkle.ogg', import.meta.url),
      whoosh: new URL('../mighty-moves/audio/whoosh-2.ogg', import.meta.url),
      cheer: new URL('../mighty-moves/audio/cheer.ogg', import.meta.url),
      water: new URL('../lighthouse/audio/waves.ogg', import.meta.url),
      garden: new URL('../spider-catcher/audio/birds.ogg', import.meta.url),
      country: new URL('../tank-patrol/audio/birds.ogg', import.meta.url),
      wind: new URL('../cannon-bay/audio/wind.ogg', import.meta.url),
    },
  }),
  createGame: async (session) => {
    // The words drawn on the picture need their letters to be there first.
    await Promise.all([document.fonts.load('700 24px Fredoka'), document.fonts.load('700 24px "Noto Sans Georgian"', 'ა')]).catch(() => {});
    try {
      // Pictures of the characters from the other games, for who's who among friends.
      session.portraits = renderPortraits(ROSTER);
    } catch (error) {
      console.warn('Could not draw the characters:', error);
      session.portraits = {};
    }
    return new GobbleGame(session);
  },
}).start();
