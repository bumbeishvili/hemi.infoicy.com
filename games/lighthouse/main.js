// The Lighthouse Keeper: a storm has muddied the lighthouse windows and ships are lost at sea. Wiping
// a window clean with an open hand lets the light out, and brings one of them home. The story is in
// storm.js, and the room and the sea are in lamp-room.js.
//
// On their own, or with friends, each on their own computer, all wiping the same windows. Each patch of
// mud is whoever's hand wiped it first, as the server decides: each game claims the patches its child's
// hand wipes, and hears whose each one is (wiped). A friend's come off the glass here too, so every game
// has the same mud left, its windows come clean together, and everyone counts everyone's share the same.
import { renderPortraits } from '../../core/body/portraits.js';
import { byId as characterWithId, ROSTER } from '../../core/body/roster.js';
import { seededRandom, Track } from '../../core/friends.js';
import { FriendsPanel } from '../../core/friends-ui.js';
import { Glove } from '../../core/glove.js';
import { GameSession } from '../../core/session.js';
import { Sound } from '../../core/sound.js';
import { STORY_BOX, StoryBox } from '../../core/story.js';
import { LampRoom } from './lamp-room.js';
import { GRID, PATCHES, SHIPS, Storm, newAt } from './storm.js';

const OPEN_TO_WIPE = 'Open your hand to wipe!';
const FINISH = 'You saved every ship!';
// When a ship drifts away first. The card's words are only shown, and the voice says a line it already has.
const DRIFTED_TITLE = 'A ship drifted away!';
const DRIFTED_SAID = 'Great job!';

const NEXT_SHIP_SECONDS = 0.4;
const LAST_SHIP_SECONDS = 1.6;
const FILM_SECONDS = 16;
const CLOSED_PROMPT_SECONDS = 1.2;
const WAVES_LEVEL = 0.4;
const WIPE_LEVEL = 0.7;

// Playing with friends, each on their own computer. See core/friends-ui.js for what each of these is.
const LIGHT_WORDS = {
  toggle: 'Play with friends',
  make: 'Make a game',
  codeLabel: 'A friend’s game code',
  codeName: 'Game code',
  how: 'Tell your friends the code. Then you all press <b>Climb the lighthouse</b>.',
  leave: 'Leave this game',
  privacy: 'Only your name, who you play as, where your glove is on the window and which bits of it you wipe go to your friends. The camera picture stays on this computer.',
  alone: 'Play on your own',
  full: 'That game already has 4 players.',
  lost: 'Can’t reach the game. Check the internet, then try again.',
  left: 'You’ve left the game.',
  badCode: 'A game code is 3 letters and numbers.',
  busy: 'Playing',
  still: 'still wiping',
};
const SHIP_CHOICES = [2, 4];
// A friend's glove between what their game sends: where it is on the window, and its points, which go smoothly
// from one to the next. Whether it can be seen and is open change half way.
const HAND_TRACK = { lerp: ['x', 'y'], lists: ['p'], steps: ['v', 'o'] };
const GLOVE_FADE_RATE = 8; // How quickly a friend's glove fades in and out, as their hand comes and goes.
const HAND_QUIET_MS = 1500; // A friend's glove nothing has come from for this long, as in their hand check, fades away.
const CLAIM_EVERY_MS = 100; // Patches wiped are claimed at most 10 times a second, all of those since the last time.
const CLAIM_AGAIN_MS = 1500; // One with no answer by then is claimed again, as the connection may have lost it.
const round2 = (value) => Math.round(value * 100) / 100;
const round3 = (value) => Math.round(value * 1000) / 1000;

const byId = (id) => document.getElementById(id);

class LighthouseGame {
  chimeOnOpen = false;

  constructor(session) {
    this.session = session;
    this.story = new StoryBox(session);
    // When a ship drifted away, a line on the finish card saying what happened.
    document.querySelector('#screen-finish .finish-hero')?.insertAdjacentHTML('beforebegin', '<p id="finish-story" class="finish-story" hidden></p>');
    this.lost = false;
    this.storm = null;
    this.timer = 0;
    this.after = null;
    this.closedFor = 0;
    this.mode = 'solo';
    this.goAt = 0;
    this.room = new LampRoom(byId('game'), { onSailed: () => this.onSailed() });
    this.applySettings();
    this.startFriends(null);
    // Playing with friends, if a grown-up makes or joins a game.
    this.friends = new FriendsPanel({
      game: 'lighthouse',
      linkKey: 'light',
      words: LIGHT_WORDS,
      hello: () => ({ driver: session.settings.fighter ?? '', level: session.levels.current, length: session.settings.ships }),
      screen: () => session.screen,
      portraits: () => session.portraits,
      onMove: (id, message) => this.fromFriend(id, message),
      onGone: (friend) => this.friendGone(friend),
      // Whoever cleaned the most of the glass, as it's shown, and equal amounts share a place.
      rank: (a, b) => this.shareOf(b.dropped) - this.shareOf(a.dropped),
      resultText: ({ dropped }) => `${this.shareOf(dropped)}% cleaned`,
      titles: { first: 'You cleaned the most!', other: 'Great wiping!' },
      startAfter: byId('start'),
      waitingBefore: byId('screen-finish'),
      resultsAfter: document.querySelector('#screen-finish .finish-hero'),
      finishTitle: document.querySelector('#screen-finish h2'),
    });
    const game = this;
    this.debug = {
      room: this.room,
      get storm() {
        return game.storm;
      },
      get game() {
        return game;
      },
    };
  }

  applySettings() {
    const { hands, reach, language } = this.session.settings;
    this.room.configure({ side: hands, reach });
    // The names of new things are in the language the voice speaks, even if it changes mid-round.
    this.room.language = language;
  }

  setHands() {
    this.applySettings();
  }

  settingChanged() {
    this.applySettings();
  }

  later(seconds, what) {
    this.timer = seconds;
    this.after = what;
  }

  /** What's new at a level, for the title card and the countdown: see NEW_AT in storm.js. */
  newAt(level) {
    return newAt(level);
  }

  /** A new storm, at this level: see stormAt in storm.js for what each level brings. */
  prepare(level) {
    // With friends, everyone has the host's ships, in the plain storm at the host's level, which doesn't move
    // anyone's own level on. Each child keeps their own hand and size of window.
    const friendly = this.friends.current;
    this.mode = friendly ? 'friends' : 'solo';
    document.body.toggleAttribute('data-friends-race', Boolean(friendly));
    this.applySettings();
    this.story.hide();
    this.room.restart();
    this.room.mud = null;
    this.room.setBoat(null);
    this.room.boat = null;
    this.room.calm = 0;
    this.room.shownCalm = 0;
    const ships = friendly ? (SHIP_CHOICES.includes(friendly.length) ? friendly.length : SHIPS.length) : this.session.settings.ships;
    // On their own, a ship only waits so long, unless a grown-up chose Gentle. With friends they always wait.
    const waits = !friendly && this.session.settings.storm !== 'gentle';
    this.storm = new Storm({
      ships,
      level: friendly?.level ?? level,
      shared: Boolean(friendly),
      waits,
      size: this.session.settings.reach,
      onEvent: (event) => this.onStorm(event),
    });
    this.lost = false;
    this.session.finishLine = FINISH;
    byId('chip-wait-box').hidden = !waits;
    this.waitShown = null;
    this.room.swell = this.storm.level.swell;
    this.room.lumps = this.storm.lumps;
    this.room.storm = this.storm;
    this.room.night = this.storm.level.night;
    this.room.fresh = new Set(friendly ? [] : newAt(level).map(({ key }) => key));
    this.startFriends(friendly);
    // Treasure only comes from level 2, so level 1 looks as it always did.
    const treasure = this.storm.level.shells > 0;
    byId('chip-treasure-box').hidden = !treasure;
    byId('sum-left-treasure').closest('tr').hidden = !treasure;
    this.showProgress();
    this.showScores();
  }

  /**
   * A game with friends starts with nothing wiped or claimed, and a grey glove for each friend. On their own,
   * there's none of it.
   */
  startFriends(friendly) {
    this.patches = new Map(); // Each window's patches that have gone to someone, and whose they are: window: Map(patch: id).
    this.tally = new Map((friendly?.racers ?? []).map((id) => [id, 0])); // How many patches each one wiped first.
    this.toClaim = new Set(); // Patches this hand has wiped, to claim, each as its window * PATCHES + itself.
    this.unanswered = new Map(); // Patches claimed and not answered yet, the same way, with when.
    this.claimedAt = -Infinity;
    this.glass = (this.storm?.ships.length ?? SHIPS.length) * PATCHES; // Every patch of every window.
    this.seed = friendly?.seed ?? 0;
    this.friendGloves = (friendly?.friends ?? []).map((friend) => ({ id: friend.id, name: friend.spec.name, glove: new Glove('right'), track: new Track(HAND_TRACK), fade: 0, heardAt: -Infinity }));
    this.room.friendGloves = this.friendGloves;
  }

  /** How the mud on a window is laid out: with friends, from the seed everyone has, so it looks the same for all. */
  mudLook(index) {
    return this.mode === 'friends' ? seededRandom((this.seed + (index + 1) * 7919) >>> 0) : Math.random;
  }

  /** How much of all the glass so many patches is, in whole percent, as it's shown. */
  shareOf(patches) {
    return Math.round((100 * patches) / this.glass);
  }

  /** With friends, the start waits until they're ready too. */
  holdStart(go) {
    return this.friends.holdStart(go);
  }

  /** How long since "GO!", by the clock on the wall, for friends' games. */
  get sinceGo() {
    return performance.now() - this.goAt;
  }

  /**
   * Where collected things fly to: the count at the top. It's looked up as they fly, as the count is still
   * hidden when play begins and can move if the screen changes, keeping the last place it was seen.
   */
  keepTallyMeasured(chip, target) {
    let seen = target.tallyAt ?? { x: 80, y: 40 };
    const look = () => {
      const box = chip.getBoundingClientRect();
      if (box.width > 0) seen = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      return seen;
    };
    target.tallyAt = {
      get x() {
        return look().x;
      },
      get y() {
        return look().y;
      },
    };
  }

  begin() {
    const { sound } = this.session;
    this.goAt = performance.now();
    sound.startLoop('waves', WAVES_LEVEL);
    sound.startLoop('wipe', 0);
    this.room.muddy(this.mudLook(0));
    this.keepTallyMeasured(byId('chip-treasure'), this.room);
    this.storm.nextShip();
  }

  onStorm(event) {
    const { room, session, storm } = this;
    // Where something on the glass is, for its name the first time it comes, while it's there.
    const on = (list, thing) => () => (list().includes(thing) ? room.onScreen(thing) : null);
    const born = room.time;
    const handlers = {
      ship: () => this.onShip(event),
      'window-clean': () => this.onWindowClean(),
      splat: () => {
        room.splat(event);
        room.introduce('splats', () => (room.time - born < 2 ? room.onScreen(event) : null));
      },
      'splat-bounced': () => room.bounce(event),
      lump: () => {
        room.lumps = this.storm.lumps;
        room.introduce(event.lump.kind, on(() => storm.lumps, event.lump));
      },
      'lump-off': () => {
        room.lumps = this.storm.lumps;
        room.dropLump(event.lump);
        session.sound.handsOpen();
      },
      'prize-out': () => {
        if (event.prize.kind === 'shell') room.introduce('shells', on(() => storm.prizes, event.prize));
      },
      prize: () => {
        room.prizeFlies(event.prize);
        session.sound.star();
        this.showProgress();
      },
      crab: () => room.introduce('crab', on(() => storm.crabs, event.crab)),
      'crab-caught': () => {
        room.crabLeaves(event.crab);
        session.sound.handsOpen();
      },
      // A crab nobody touched, letting go of its pearl as the window comes clean.
      'crab-off': () => room.crabLeaves(event.crab),
      'power-out': () => room.introduce(event.power.kind, on(() => storm.powers, event.power)),
      // Picked up before its name had its turn, a power-up is named beside its badge while it's on.
      power: () => {
        room.sparkle(event.power);
        room.introduce(event.power.kind, () => room.badgeAt(event.power.kind));
        session.sound.handsOpen();
      },
      // And the gull beside the gull, as it flies across.
      gull: () => {
        room.sparkle(event.power, '#ffffff');
        room.sendGull(event.y);
        room.introduce('gull', () => room.gullAt());
        session.sound.handsOpen();
      },
      'ship-home': () => this.onShipHome(),
      'all-home': () => this.onAllHome(),
      drifted: () => this.onDrifted(event),
    };
    handlers[event.type]?.();
  }

  onShip({ ship, index }) {
    if (!this.room.mud) this.room.muddy(this.mudLook(index));
    this.room.setBoat(ship.boat);
    this.room.lumps = this.storm.lumps;
    this.story.say(ship.who, ship.ask);
    this.showProgress();
    // With friends, what they've wiped of this window already, if their game got to it a moment sooner.
    if (this.mode === 'friends') this.wipeTheirs(index, [...(this.patches.get(index)?.keys() ?? [])]);
  }

  onWindowClean() {
    const { sound } = this.session;
    const { room } = this;
    room.clearMud();
    // The night sky, with its moon, is only all there to see once the first window is clean.
    if (this.storm.level.night) room.introduce('night', () => ({ x: room.window.x + room.window.width * (room.side === 'right' ? 0.84 : 0.16), y: room.window.y + room.window.height * 0.16 }));
    sound.play('horn', { gain: 0.5 });
    sound.handsOpen();
    this.story.say(this.storm.ship.who, this.storm.ship.thanks);
    this.room.sailHome();
  }

  onSailed() {
    this.storm.shipHome();
  }

  onShipHome() {
    this.room.calm = this.storm.calm;
    this.room.boat = null;
    this.showProgress();
    this.later(NEXT_SHIP_SECONDS, () => this.storm.nextShip());
  }

  /**
   * The window wasn't clean in time, and the ship drifted off into the storm: the game ends there, kindly,
   * and that level comes round again. The lifeboat will bring them in, so nobody is left out at sea.
   */
  onDrifted({ ship }) {
    const { session } = this;
    this.lost = true;
    this.driftedWho = characterWithId(ship.who)?.name ?? 'The ship';
    session.finishLine = DRIFTED_SAID;
    session.finish();
  }

  onAllHome() {
    this.room.calm = 1;
    this.later(LAST_SHIP_SECONDS, () => this.session.finish());
  }

  showProgress() {
    const { storm } = this;
    byId('chip-ships').textContent = `${storm.home} of ${storm.ships.length}`;
    byId('chip-treasure').textContent = `🐚 ${storm.treasure}`;
    const windowShare = storm.mud && storm.index >= 0 && storm.index < storm.ships.length ? storm.mud.share : 0;
    byId('race-progress-fill').style.width = `${Math.round(((storm.home + Math.min(1, windowShare) * 0.999) / storm.ships.length) * 100)}%`;
    // How long this ship can still wait, as a bar that empties slowly.
    const shown = Math.round(storm.waitShare * 100);
    if (shown !== this.waitShown) {
      this.waitShown = shown;
      byId('wait-fill').style.width = `${shown}%`;
      byId('chip-wait-box').dataset.low = storm.waitShare < 0.25 ? 'yes' : 'no';
    }
  }

  wipe = (x, y, sizeX, sizeY, moved, how) => this.storm.wipe(x, y, sizeX, sizeY, moved, how);

  update(dt, snapshot) {
    if (this.after) {
      this.timer -= dt;
      if (this.timer <= 0) {
        const what = this.after;
        this.after = null;
        what();
      }
    }
    const { room, storm } = this;
    // Only with a ship waiting, so that the story is heard first.
    const wiping = Boolean(storm.ship) && Boolean(room.mud) && !room.mudFading && room.sailing === 0;
    storm.update(dt, { still: room.reducedMotion, hand: wiping ? room.handOnGlass() : null });
    // The ship drifts only while its window is there to wipe and the camera can see the hand, so a child who
    // is out of the picture isn't hurried.
    const hand = snapshot?.[this.session.settings.hands];
    const seen = Boolean(hand) && hand.status !== 'missing' && hand.reason !== 'edge' && hand.reason !== 'small';
    if (wiping && seen) storm.passTime(dt);
    if (this.session.screen !== 'playing') return;
    room.update(dt, snapshot, { aspect: this.session.camera.aspect, wiping, showHands: true, wipe: this.wipe });
    this.session.sound.setLoopLevel('wipe', wiping ? room.wipeSpeed * WIPE_LEVEL : 0);
    // With friends, the patches just wiped are claimed, and everyone sees everyone's glove.
    if (this.mode === 'friends' && this.session.screen === 'playing') {
      this.claimWiped();
      this.friends.sendMove('hand', this.handState(), this.sinceGo);
      this.showFriendsGloves(dt);
    }
    this.showProgress();
    const glove = room.gloves[room.side];
    this.closedFor = wiping && glove.visible && glove.status !== 'open' ? this.closedFor + dt : 0;
    const filming = this.session.playSeconds < FILM_SECONDS && storm.home === 0 && (!storm.mud || storm.mud.share < 0.2);
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
    const counting = this.session.screen === 'countdown';
    this.room.update(dt, snapshot, { aspect: this.session.camera.aspect, showHands: counting });
    // Checking the hand again in the middle, friends' gloves still come and go.
    if (this.mode === 'friends' && this.session.screen === 'check') this.showFriendsGloves(dt);
  }

  /* ---------- with friends ---------- */

  /**
   * The patches this child's hand has wiped, claimed at most 10 times a second, all of those since the last
   * time, and any claimed a while ago with no answer yet, again. The server says whose each one is: see wiped.
   */
  claimWiped(now = performance.now()) {
    const { w, c } = this.storm.takeWiped();
    for (const patch of c) this.toClaim.add(w * PATCHES + patch);
    for (const [key, at] of this.unanswered) if (now - at >= CLAIM_AGAIN_MS) this.toClaim.add(key);
    if (!this.toClaim.size || now - this.claimedAt < CLAIM_EVERY_MS) return;
    this.claimedAt = now;
    const byPane = new Map();
    for (const key of this.toClaim) {
      const pane = Math.floor(key / PATCHES);
      if (!byPane.has(pane)) byPane.set(pane, []);
      byPane.get(pane).push(key % PATCHES);
      this.unanswered.set(key, now);
    }
    this.toClaim.clear();
    const { friends } = this;
    if (!friends.current || !friends.room.inRoom) return;
    for (const [pane, patches] of byPane) friends.room.say({ t: 'wipe', w: pane, c: patches });
  }

  /**
   * Patches c of window w went to whoever wiped them first, as the server says: they count for them, the same
   * on every computer, and the mud there is gone here too.
   */
  wiped({ w, c, by }) {
    if (this.mode !== 'friends' || !this.friends.current?.racers.includes(by) || !Array.isArray(c)) return;
    if (!this.patches.has(w)) this.patches.set(w, new Map());
    const owners = this.patches.get(w);
    const fresh = [];
    for (const patch of c) {
      this.unanswered.delete(w * PATCHES + patch);
      if (!Number.isInteger(patch) || owners.has(patch)) continue;
      owners.set(patch, by);
      fresh.push(patch);
    }
    if (!fresh.length) return;
    this.tally.set(by, (this.tally.get(by) ?? 0) + fresh.length);
    this.wipeTheirs(w, fresh);
    this.showScores();
  }

  /**
   * Patches of window w gone to someone come off the glass here, if it's the window here now, and can make it
   * clean. Any this child's own hand wiped are clean here already.
   */
  wipeTheirs(w, patches) {
    const { storm, room } = this;
    if (w !== storm.index || !patches.length) return;
    room.clearPatches(storm.wipePatches(patches), GRID.columns, GRID.rows);
    this.showProgress();
  }

  /** Something from a friend's game: where their glove is, or whose some patches are. */
  fromFriend(id, message) {
    if (message.t === 'wiped') {
      this.wiped(message);
      return;
    }
    if (message.t !== 'hand') return;
    const each = this.friendGloves.find((glove) => glove.id === id);
    if (!each) return;
    each.track.push(message, performance.now());
    each.heardAt = performance.now();
  }

  /** A friend has gone, and their glove with them. What they wiped stays wiped, and stays theirs. */
  friendGone(friend) {
    this.friendGloves = this.friendGloves.filter((each) => each.id !== friend.id);
    this.room.friendGloves = this.friendGloves;
    this.showScores();
  }

  /** Where the child's glove is, for friends' games: across and down the window, and its points in palms. */
  handState() {
    const { room } = this;
    const glove = room.gloves[room.side];
    if (!glove.visible) return { x: 0, y: 0, v: 0, o: 0, p: [] };
    const { window: glass, palmSize } = room;
    return {
      x: round3((glove.x - glass.x) / glass.width),
      y: round3((glove.y - glass.y) / glass.height),
      v: 1,
      o: glove.status === 'open' ? 1 : 0,
      p: glove.points.flatMap(({ x, y }) => [round2(x / palmSize), round2(y / palmSize)]),
    };
  }

  /**
   * Each friend's glove where their hand is on their window, a moment ago, on this window, fading in and out as
   * it comes and goes, and away once they've finished.
   */
  showFriendsGloves(dt) {
    const { room } = this;
    const now = performance.now();
    for (const each of this.friendGloves) {
      const at = each.track.at(now);
      const seen = Boolean(at?.v && at.p?.length === 42) && now - each.heardAt < HAND_QUIET_MS && !this.friends.results.has(each.id);
      each.fade += ((seen ? 1 : 0) - each.fade) * (1 - Math.exp(-dt * GLOVE_FADE_RATE));
      if (!seen) {
        if (each.fade < 0.02) each.glove.visible = false;
        continue;
      }
      const { glove } = each;
      glove.visible = true;
      glove.status = at.o ? 'open' : 'closed';
      const spot = room.onScreen(at);
      glove.x = spot.x;
      glove.y = spot.y;
      glove.points.forEach((point, index) => {
        point.x = at.p[index * 2] * room.palmSize;
        point.y = at.p[index * 2 + 1] * room.palmSize;
      });
    }
  }

  /** With friends, how much of all the glass each one has cleaned so far, the most first. */
  showScores() {
    const list = byId('light-scores');
    const { current } = this.friends;
    list.hidden = this.mode !== 'friends' || !current;
    if (list.hidden) return;
    const portraits = this.session.portraits ?? {};
    const you = this.friends.room.you;
    const mine = { id: you, name: 'You', who: (characterWithId(this.session.settings.fighter) ?? ROSTER[0]).id };
    const theirs = current.friends.filter((friend) => !friend.gone).map((friend) => ({ id: friend.id, name: friend.spec.name, who: friend.spec.id }));
    const everyone = [mine, ...theirs].map((each) => ({ ...each, share: this.shareOf(this.tally.get(each.id) ?? 0) })).sort((a, b) => b.share - a.share);
    const key = everyone.map(({ id, share }) => `${id}:${share}`).join(',');
    if (list.dataset.key === key) return;
    list.dataset.key = key;
    list.replaceChildren(...everyone.map((each) => {
      const row = document.createElement('li');
      row.classList.toggle('is-you', each.id === you);
      const face = document.createElement('img');
      face.alt = '';
      face.src = portraits[each.who] ?? '';
      const name = document.createElement('span');
      name.className = 'light-score-name';
      name.textContent = each.name;
      const share = document.createElement('span');
      share.className = 'light-score';
      share.textContent = `${each.share}%`;
      row.append(face, name, share);
      return row;
    }));
  }

  render() {
    this.room.render();
  }

  prompt(snapshot, dt) {
    const { session } = this;
    const needed = session.handsPrompt(snapshot, dt);
    if (needed && !needed.key.startsWith('closed')) return needed;
    if (this.closedFor > CLOSED_PROMPT_SECONDS) return { key: 'open-to-wipe', text: OPEN_TO_WIPE, side: null, asks: 'open' };
    return null;
  }

  finished() {
    const { sound } = this.session;
    sound.stopLoop('waves');
    sound.stopLoop('wipe');
    this.story.hide();
    this.room.labels = [];
    // With friends, how much this child's hand wiped first, which every computer has counted the same.
    if (this.mode === 'friends') this.friends.finished(this.sinceGo, { n: this.tally.get(this.friends.room.you) ?? 0, w: 1 });
    for (const each of this.friendGloves) each.glove.visible = false;
  }

  summary() {
    const { home, treasure } = this.storm;
    const { hands } = this.session.settings;
    const byHand = (count) => ({ left: hands === 'left' ? count : 0, right: hands === 'right' ? count : 0 });
    this.friends.showResults();
    const story = byId('finish-story');
    if (!this.friends.current) {
      document.querySelector('#screen-finish h2').textContent = this.lost ? DRIFTED_TITLE : FINISH;
      story.textContent = this.lost ? `${this.driftedWho}’s boat drifted off into the storm before the window was clean. The lifeboat will bring them in.` : '';
    }
    story.hidden = !this.lost || Boolean(this.friends.current);
    // A ship drifting away means that level again. A game with friends is on the host's level, so it doesn't
    // move the child's own level on.
    return { hero: home, noun: 'storm', won: !this.lost, rows: { ships: byHand(home), treasure: byHand(treasure) }, countsForLevel: !this.friends.current };
  }
}

new GameSession({
  // What the open and closed hand do here, for the hand shapes in the grown-ups' panel: see core/shapes.js.
  moves: { open: 'Wipe', closed: null },
  shell: {
    title: 'The Lighthouse Keeper',
    startLabel: 'Climb the lighthouse',
    againLabel: 'Another storm',
    finishTitle: FINISH,
    heroMark: '⛵',
    heroNoun: 'ships home',
    extraRows: [{ id: 'ships', label: 'Ships brought home' }, { id: 'treasure', label: 'Treasure found' }],
    hudTop: `
      <div class="hud-top">
        <div class="chips">
          <div class="chip"><span class="chip-label">Ships home</span><span id="chip-ships" class="chip-value">0 of 4</span></div>
          <div id="chip-treasure-box" class="chip" hidden><span class="chip-label">Treasure</span><span id="chip-treasure" class="chip-value">🐚 0</span></div>
          <div id="chip-wait-box" class="chip chip-wait" hidden><span class="chip-label">⛵ Ship waiting</span><span class="wait-bar"><span id="wait-fill" class="wait-fill"></span></span></div>
        </div>
        <div class="race-progress" aria-hidden="true"><div id="race-progress-fill" class="race-progress-fill"></div></div>
        <ol id="light-scores" class="light-scores" aria-label="How much each one has cleaned" hidden></ol>
      </div>
      ${STORY_BOX}
      <div class="film" aria-hidden="true">
        <svg viewBox="0 0 220 220">
          <rect class="film-glass" x="14" y="24" width="192" height="172" rx="14" />
          <rect class="film-mud" x="14" y="24" width="192" height="172" rx="14" />
          <g class="film-wiper">
            <rect x="40" y="96" width="46" height="42" rx="16" />
            <path d="M46 102V74M57 98V64M69 98V62M80 102V70M86 122L104 108" />
          </g>
        </svg>
      </div>`,
    panelSettings: `
      <fieldset class="choice">
        <legend>Size of the window, which is how far there is to reach</legend>
        <label><input type="radio" name="reach" value="none"> Big</label>
        <label><input type="radio" name="reach" value="little"> Medium</label>
        <label><input type="radio" name="reach" value="lots"> Small</label>
      </fieldset>
      <fieldset class="choice">
        <legend>How long the ships can wait</legend>
        <label><input type="radio" name="storm" value="drift"> Not for ever: a ship drifts away if its window isn’t clean in time</label>
        <label><input type="radio" name="storm" value="gentle"> Gentle: they wait as long as it takes, as before</label>
      </fieldset>
      <fieldset class="choice">
        <legend>Ships to bring home</legend>
        <label><input type="radio" name="ships" value="2"> Two</label>
        <label><input type="radio" name="ships" value="4"> All four</label>
      </fieldset>`,
  },
  defaults: { reach: 'little', ships: 4, storm: 'drift' },
  choices: { reach: String, ships: Number, storm: String },
  tagline: (side) => `Ships are lost in the storm! Wipe the mud off the lighthouse windows with your open ${side} hand, and bring them home.`,
  finishLine: FINISH,
  lines: new URL('./audio/voice/lines.json', import.meta.url),
  portraits: () => renderPortraits(ROSTER),
  createSound: (options) => new Sound({
    ...options,
    sounds: {
      wipe: new URL('./audio/wipe.ogg', import.meta.url),
      horn: new URL('./audio/horn.ogg', import.meta.url),
      waves: new URL('./audio/waves.ogg', import.meta.url),
    },
  }),
  createGame: (session) => new LighthouseGame(session),
}).start();
