// Giraffe's Garden: Giraffe's garden has dried up in the sun. The child's open hand holds his watering can, and
// turning the hand over tips it, so the water pours onto the plant below, which grows and flowers. Turning the hand
// over is turning the forearm, the movement that's hardest of all with hemiplegia: see core/turn.js, which says how
// far it's turned. The rules are in garden.js and the garden is drawn by view.js. On their own, or with friends, each
// on their own computer, all watering the same garden: see garden.js for how its water is shared.
import { renderPortraits } from '../../core/body/portraits.js';
import { byId as characterWithId, ROSTER } from '../../core/body/roster.js';
import { Track } from '../../core/friends.js';
import { FriendsPanel } from '../../core/friends-ui.js';
import { Glove } from '../../core/glove.js';
import { GameSession, SPOKEN } from '../../core/session.js';
import { Sound } from '../../core/sound.js';
import { STORY_BOX, StoryBox } from '../../core/story.js';
import { flowFor, TURN_TARGETS, TurnReader } from '../../core/turn.js';
import { BEE_SECONDS, Garden, gardenNewAt, NEWS, PARTY_SECONDS, PLANT_COUNTS, SIP, SPREADS, SPREAD_NAMES, STREAM, SUNS } from './garden.js';
import { giraffePixels, renderGiraffe } from './giraffe.js';
import { GardenView, GIRAFFE, POURING } from './view.js';

const byId = (id) => document.getElementById(id);
const FINISH = 'The garden is in bloom!';
// On the card when a plant wilts in the sun. It's only shown, not said.
const WILTED = 'A plant wilted in the sun!';
const TRY_AGAIN = 'Try again';
const INTRO = 'My garden is so thirsty! Can you water it?';
const TURN_HINT = 'Turn your hand over to pour!';
const OPEN_TO_HOLD = 'Open your hand to hold the can!';
const PRAISE = ['Nice one!', 'Way to go!', 'Great job!'];
const FILM_SECONDS = 25; // The little film of what to do shows until the first flower, or this long.
const STORY_SECONDS = 6; // Giraffe's words stay up this long, or until the first flower.
const TURN_HINT_AFTER = 4; // Seconds holding the can without pouring, before saying how.
const CLOSED_PROMPT_AFTER = 2.5; // Seconds of a closed hand before asking for it to open.
const RESTING_AFTER = 15; // And before saying that resting is fine.
const TIP_RATE = 16; // How quickly the can's tip on the screen follows the hand's turn.
const LET_GO_SHARE = 0.4; // A can tipped this little, by a hand that has closed, is put down.
const POUR_LEVEL = 0.75;
const BIRDS_LEVEL = 0.12;
// Watering with friends, each on their own computer. See core/friends-ui.js for what each of these is.
const GARDEN_WORDS = {
  toggle: 'Play with friends',
  make: 'Make a game',
  codeLabel: 'A friend’s game code',
  codeName: 'Game code',
  how: 'Tell your friends the code. Then you all press <b>Water the garden</b>, and water it together.',
  leave: 'Leave this game',
  privacy: 'Only your name, who you play as, where your watering can is, how far it’s tipped and the water you give go to your friends. The camera picture stays on this computer.',
  alone: 'Play on your own',
  full: 'That game already has 4 players.',
  lost: 'Can’t reach the game. Check the internet, then try again.',
  left: 'You’ve left the game.',
  badCode: 'A game code is 3 letters and numbers.',
  busy: 'Playing',
  still: 'still watering',
};
// A friend's can between what their game sends: where it is, how far it's tipped and pouring, and their glove's
// points, which go smoothly from one to the next. Whether it can be seen changes half way.
const CAN_TRACK = { lerp: ['u', 'y', 'tip', 'f'], lists: ['p'], steps: ['v'] };
const FRIEND_CAN = { body: '#c9d3df', ink: '#7f8a99', glove: '#e3e8ee' };
const CAN_FADE_RATE = 8; // How quickly a friend's can fades in and out, as their hand comes and goes.
const CAN_QUIET_MS = 1500; // A friend's can nothing has come from for this long, as in their hand check, fades away.
const round2 = (value) => Math.round(value * 100) / 100;
const round3 = (value) => Math.round(value * 1000) / 1000;
// Which label goes with each thing a level brings, so the newest is named first.
const LABEL_FOR = { bees: 'bee', snails: 'snail', sprinkler: 'sprinkler', sunflower: 'sunflower', hedgehog: 'hedgehog', bunny: 'bunny', baskets: 'basket', cloud: 'cloud', bean: 'bean' };

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/**
 * How far the can tips, from 0 to 1, for a hand turned this many degrees when a turn of target is wanted: POURING
 * of the way at the target, and on from there as far as the hand turns, so it follows the whole turn.
 */
export function tipFor(degrees, target) {
  if (degrees <= target) return (POURING * Math.max(0, degrees)) / target;
  return Math.min(1, POURING + ((1 - POURING) * (degrees - target)) / Math.max(1, 180 - target));
}

class GardenGame {
  chimeOnOpen = false; // The hand opens and closes all the time here, so a chime would be noise.

  constructor(session) {
    this.session = session;
    this.view = new GardenView(byId('game'), {
      language: () => session.settings.language,
      prizeTarget: () => {
        const box = byId('chip-prizes')?.closest('.chip')?.getBoundingClientRect();
        return box?.width ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : { x: 120, y: 50 };
      },
    });
    try {
      // Drawn as big as he'll be shown on this screen, even full screen, so he's sharp.
      const tallest = Math.max(window.innerHeight, window.screen?.height || 0);
      this.view.giraffe = renderGiraffe(characterWithId('giraffe'), giraffePixels(tallest * GIRAFFE.tall, this.view.ratio));
    } catch (error) {
      // Without his picture the garden still works: Giraffe just isn't by the fence.
      console.warn('Could not draw Giraffe:', error);
    }
    this.story = new StoryBox(session);
    this.turn = new TurnReader();
    this.gloves = { left: new Glove('left'), right: new Glove('right') };
    this.mode = 'solo';
    this.friendCans = [];
    this.goAt = 0;
    this.garden = this.newGarden(session.level);
    this.resetCounts();
    // Watering with friends, if a grown-up makes or joins a game.
    this.friends = new FriendsPanel({
      game: 'giraffe-garden',
      linkKey: 'garden',
      words: GARDEN_WORDS,
      hello: () => ({ driver: session.settings.fighter ?? '', level: session.levels.current, length: this.plantCount() }),
      screen: () => session.screen,
      portraits: () => session.portraits,
      onMove: (id, message) => this.fromFriend(id, message),
      onGone: (friend) => this.friendGone(friend),
      // Whoever gave the most of the water, as it's shown, and equal amounts share a place.
      rank: (a, b) => this.shareOf(b.dropped) - this.shareOf(a.dropped),
      resultText: ({ dropped }) => `${this.shareOf(dropped)}% of the water`,
      titles: { first: 'You watered the most!', other: 'Great watering!' },
      startAfter: byId('start'),
      waitingBefore: byId('screen-finish'),
      resultsAfter: document.querySelector('#screen-finish .finish-hero'),
      finishTitle: document.querySelector('#screen-finish h2'),
    });
    const game = this;
    this.debug = {
      view: this.view,
      gloves: this.gloves,
      turn: this.turn,
      get garden() {
        return game.garden;
      },
      get game() {
        return game;
      },
    };
  }

  resetCounts() {
    this.tip = 0;
    this.flow = 0;
    this.latched = false;
    this.closedFor = 0;
    this.restFor = 0;
    this.dryFor = 0;
    this.praised = 0;
    this.partyIn = null;
    this.filmShown = false;
    this.storyFor = 0;
  }

  /* ---------- the grown-ups' choices ---------- */

  get settings() {
    return this.session.settings;
  }

  /** How far the hand has to turn to pour, in degrees: see TURN_TARGETS in core/turn.js. */
  get target() {
    return TURN_TARGETS[this.settings.turn] ?? TURN_TARGETS.little;
  }

  plantCount() {
    const count = Number(this.settings.plants);
    return PLANT_COUNTS.includes(count) ? count : 6;
  }

  spread() {
    return SPREAD_NAMES.includes(this.settings.spread) ? this.settings.spread : 'middle';
  }

  /** Whether the sun dries the garden, or it's the gentle garden, as a grown-up chose. */
  sun() {
    return SUNS.includes(this.settings.gardenSun) ? this.settings.gardenSun : 'dries';
  }

  /** Which way the can's spout points: across the screen from the hand that holds it, towards the garden. */
  get spoutSide() {
    return this.settings.hands === 'left' ? 1 : -1;
  }

  /** A garden on their own, or with friends the host's plain one, its water shared through the server. */
  newGarden(level, friendly = null) {
    return new Garden({
      level: friendly?.level ?? level,
      plants: friendly ? (PLANT_COUNTS.includes(friendly.length) ? friendly.length : 6) : this.plantCount(),
      spread: this.spread(),
      sun: this.sun(),
      plain: Boolean(friendly),
      shared: friendly ? { claim: (k) => this.friends.claim(k) } : null,
      me: friendly ? this.friends.room.you : 'me',
      aspect: window.innerWidth / window.innerHeight,
      onEvent: (event) => this.onGarden(event),
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
    return gardenNewAt(level);
  }

  setHands() {
    for (const glove of Object.values(this.gloves)) glove.hide();
  }

  settingChanged(change) {
    const { screen } = this.session;
    // A new number of plants, or how far apart they are, starts with the next garden, and the title shows it now.
    if (screen !== 'playing' && screen !== 'countdown' && ('plants' in change || 'spread' in change || 'gardenSun' in change)) this.garden = this.newGarden(this.session.level);
  }

  /* ---------- a new garden ---------- */

  /** The hand check is starting: what it sees of the hand is where turning starts from. */
  enterCheck() {
    this.turn.samples = [];
  }

  /** After a hand check in the middle of a garden. */
  resume() {
    this.turn.calibrate();
  }

  prepare(level) {
    // With friends, everyone has the host's plain garden, at the host's level and number of plants, which doesn't
    // move anyone's own level on. Each child keeps their own hand, turn and how far apart their plants are.
    const friendly = this.friends.current;
    this.mode = friendly ? 'friends' : 'solo';
    document.body.toggleAttribute('data-friends-race', Boolean(friendly));
    this.turn.calibrate();
    this.garden = this.newGarden(level, friendly);
    this.friendCans = (friendly?.friends ?? []).map((friend) => ({ id: friend.id, name: friend.spec.name, glove: new Glove('right'), track: new Track(CAN_TRACK), fade: 0, heardAt: -Infinity, at: null }));
    this.showScores();
    this.view.reset();
    this.resetCounts();
    this.story.hide();
    this.session.sound.lost = false;
    this.showProgress();
    // Prizes only come from level 2.
    const prizes = this.garden.plan.bees;
    byId('chip-prizes-box').hidden = !prizes;
    byId('sum-left-prizes').closest('tr').hidden = !prizes;
  }

  begin() {
    const { sound } = this.session;
    this.goAt = performance.now();
    sound.startLoop('birds', BIRDS_LEVEL);
    sound.startLoop('pour', 0);
    this.story.say('giraffe', INTRO);
    this.storyFor = STORY_SECONDS;
    this.nameNewThings();
  }

  /** The newest thing the level brings is named first, then whatever else is in the garden, each the first time. */
  nameNewThings() {
    const { garden, view } = this;
    const newest = (NEWS[garden.level] ?? []).map(({ key }) => LABEL_FOR[key]);
    const named = [];
    const top = (plant) => () => (plant.bloomed ? null : { x: plant.x, y: plant.y - garden.heightOf(plant) });
    for (const snail of garden.snails) named.push(['snail', () => (snail.off ? null : { x: snail.plant.x, y: snail.plant.y - garden.heightOf(snail.plant) * 0.5 })]);
    const sunflower = garden.plants.find((plant) => plant.look === 'sunflower');
    if (sunflower) named.push(['sunflower', top(sunflower)]);
    const bean = garden.plants.find((plant) => plant.look === 'bean');
    if (bean) named.push(['bean', top(bean)]);
    const basket = garden.plants.find((plant) => plant.hanging);
    if (basket) named.push(['basket', top(basket)]);
    const { sprinkler, cloud, hedgehog, bunny } = garden;
    if (sprinkler) named.push(['sprinkler', () => (sprinkler.taken ? null : { x: sprinkler.x, y: sprinkler.y })]);
    if (cloud) named.push(['cloud', () => (cloud.state === 'waiting' ? { x: cloud.x, y: cloud.y } : null)]);
    if (hedgehog) named.push(['hedgehog', () => (hedgehog.drank ? null : { x: hedgehog.x, y: hedgehog.y - 0.04 })]);
    if (bunny) named.push(['bunny', () => (bunny.up ? { x: bunny.x, y: bunny.y - 0.06 } : null)]);
    named.sort(([a], [b]) => Number(newest.includes(b)) - Number(newest.includes(a)));
    for (const [key, target] of named) view.introduce(key, target);
  }

  /** What the rules say happens, heard and seen. */
  onGarden(event) {
    const { sound } = this.session;
    const { view, garden } = this;
    const at = (thing) => view.at(thing.x, thing.y);
    switch (event.type) {
      case 'grow':
        sound.play('sparkle', { gain: 0.12, rate: 1.3 + event.stage * 0.1 });
        break;
      case 'bloom': {
        const { plant } = event;
        const top = view.at(plant.x, plant.y - garden.heightOf(plant));
        sound.play('found', { gain: 0.5 });
        view.sparkle(top.x, top.y);
        view.cheer();
        this.story.hide();
        if (this.praised % 2 === 0) sound.say(PRAISE[Math.floor(this.praised / 2) % PRAISE.length], { ifQuiet: true });
        this.praised += 1;
        this.showProgress();
        break;
      }
      case 'bee':
        view.bee(event.plant, BEE_SECONDS);
        view.introduce('bee', () => (view.bees.some((bee) => bee.plant === event.plant) ? { x: event.plant.x, y: event.plant.y - garden.heightOf(event.plant) - 0.05 } : null));
        break;
      case 'prize':
        // The bee takes the honey itself, and everything else flies up to the tally.
        if (event.kind !== 'honey') {
          view.prize(event.kind, event.at.x, event.at.y);
          sound.star();
        } else {
          setTimeout(() => sound.star(), BEE_SECONDS * 900);
        }
        setTimeout(() => this.showProgress(), event.kind === 'honey' ? BEE_SECONDS * 1000 : 900);
        break;
      case 'snail-off':
        sound.play('whoosh', { gain: 0.3, rate: 0.8 });
        break;
      case 'sprinkler':
        sound.handsOpen();
        view.sparkle(at(event.sprinkler).x, at(event.sprinkler).y, '#bff0d4');
        break;
      case 'hedgehog':
        sound.play('crunch', { gain: 0.4 });
        break;
      case 'bunny-giggle':
        sound.play('boing', { gain: 0.3, rate: 1.2 });
        break;
      case 'cloud':
        sound.handsOpen();
        break;
      case 'wilted':
        // A plant left too long in the sun droops: a soft sound, and the garden is over a moment later.
        sound.play('whoosh', { gain: 0.22, rate: 0.7 });
        this.story.hide();
        break;
      case 'all-bloomed':
        this.partyIn = PARTY_SECONDS;
        view.cheer(PARTY_SECONDS + 1);
        // The bees come to the party: one to each flower, one after another.
        garden.plants.forEach((plant, index) => view.bee(plant, PARTY_SECONDS + 0.4, { party: true, wait: index * 0.12 }));
        this.story.hide();
        this.showProgress();
        break;
      default:
    }
  }

  /* ---------- each frame ---------- */

  /** The glove follows the hand in play over the garden. */
  followHand(dt, snapshot) {
    const { view } = this;
    for (const [side, glove] of Object.entries(this.gloves)) {
      if (side !== snapshot.side) glove.hide();
      else glove.follow(snapshot[side], dt, { aspect: this.session.camera.aspect, palmSize: view.palmSize * 0.85, width: view.width, height: view.height });
    }
  }

  /**
   * How far the can tips, and how much it pours, from how far the hand is turned. The open hand takes hold of the
   * can, and a hand that's turned keeps hold of it even if it reads a little less open, as a turned hand can. One
   * that closes as it comes back round puts it down, and so does one that can't be seen.
   */
  holdAndPour(dt, snapshot) {
    const hand = snapshot[snapshot.side];
    const glove = this.gloves[snapshot.side];
    const degrees = this.turn.update(hand.image, this.session.camera.aspect, performance.now(), hand.world);
    const turned = clamp(degrees / this.target, 0, 1);
    if (!glove.visible || hand.status === 'missing') this.latched = false;
    else if (snapshot.handOpen) this.latched = true;
    else if (turned < LET_GO_SHARE) this.latched = false;
    const holding = glove.visible && (snapshot.handOpen || this.latched);
    this.tip += ((holding ? tipFor(degrees, this.target) : 0) - this.tip) * (1 - Math.exp(-dt * TIP_RATE));
    this.flow = holding ? flowFor(degrees, this.target) : 0;
    this.holding = holding;
    this.degrees = degrees;
  }

  update(dt, snapshot) {
    const { view, garden, session } = this;
    this.followHand(dt, snapshot);
    this.holdAndPour(dt, snapshot);
    const glove = this.gloves[snapshot.side];
    const can = glove.visible ? { x: glove.x / view.width, y: glove.y / view.height } : null;
    // The water lands under the can as it is when pouring, wherever the can has tipped to: it falls from the rose.
    const falls = glove.visible ? view.waterAt(glove.x, glove.y, this.spoutSide) : null;
    const water = falls && this.flow > 0 ? { x: falls.x / view.width, y: falls.y / view.height, flow: this.flow } : null;
    garden.update(dt, { can, water });
    if (water && garden.splash) {
      const rose = view.roseAt(glove.x, glove.y, this.tip, this.spoutSide);
      view.pour(rose.x, rose.y, garden.splash.y * view.height, this.flow, garden.streamWidth(), dt, garden.splash.to * view.width);
    }
    if (garden.cloud?.state === 'raining') {
      const under = garden.landing(garden.cloud.x, garden.cloud.y + 0.05, 0.07);
      view.rain(garden.cloud.x, garden.cloud.y + 0.04, Math.min(...under.map((hit) => hit.y)), 0.06, dt);
    }
    if (this.mode === 'friends' && session.screen === 'playing') {
      this.friends.sendMove('can', this.canState(), this.sinceGo);
      this.showFriendsCans(dt);
    }
    view.update(dt, garden);
    session.sound.setLoopLevel('pour', this.flow * POUR_LEVEL);
    this.closedFor = glove.visible && !this.holding ? this.closedFor + dt : 0;
    this.restFor = this.holding ? 0 : this.restFor + dt;
    this.dryFor = this.holding && this.flow === 0 ? this.dryFor + dt : 0;
    this.showFilm();
    if (this.storyFor > 0) {
      this.storyFor -= dt;
      if (this.storyFor <= 0) this.story.hide();
    }
    if (this.partyIn !== null) {
      this.partyIn -= dt;
      if (this.partyIn <= 0 && session.screen === 'playing') this.end();
    }
    if (garden.lost && garden.done && session.screen === 'playing') this.end();
  }

  /** The garden is over. One a plant wilted in is told kindly, with no party, and Try again on the big button. */
  end() {
    const { session, garden } = this;
    session.sound.lost = garden.lost;
    session.finish();
    // After the card is filled in, which puts back the usual title.
    if (this.mode === 'solo') document.querySelector('#screen-finish h2').textContent = garden.lost ? WILTED : FINISH;
    if (garden.lost) {
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
    // In the hand check, how the hand is held is where turning starts from.
    if (screen === 'check') this.turn.sample(snapshot[snapshot.side].image, this.session.camera.aspect, snapshot[snapshot.side].world);
    // During the countdown the glove and the can come out, so the child can find their hand.
    if (screen === 'countdown') {
      this.followHand(dt, snapshot);
      this.holdAndPour(dt, snapshot);
      this.flow = 0;
    } else {
      for (const glove of Object.values(this.gloves)) glove.hide();
      this.tip = 0;
    }
    this.view.update(dt, this.garden);
  }

  /** The little film of what to do, until the first flower, or a while. */
  showFilm() {
    const wanted = this.garden.stats.flowers === 0 && this.session.playSeconds < FILM_SECONDS;
    if (wanted !== this.filmShown) {
      this.filmShown = wanted;
      document.body.dataset.film = wanted ? 'on' : 'off';
    }
  }

  render() {
    const { view, garden } = this;
    const side = this.session.settings.hands;
    const glove = this.gloves[side];
    const cans = [];
    // Friends' cans first, grey and see-through, under the child's own.
    for (const each of this.friendCans) {
      if (!each.at || each.fade < 0.02) continue;
      cans.push({ x: each.x, y: each.y, tip: each.at.tip, side: each.side, glove: each.glove, look: { ...FRIEND_CAN, alpha: each.fade * 0.85 }, name: each.name });
    }
    if (glove.visible) {
      const { sprinkler } = garden;
      cans.push({ x: glove.x, y: glove.y, tip: this.tip, side: this.spoutSide, glove, sprinkler: sprinkler?.taken && sprinkler.left > 0 ? sprinkler.left / 8 : null });
    }
    view.render({ garden, cans, side, waving: this.session.screen !== 'playing' || this.session.playSeconds < 3 });
  }

  /* ---------- the top of the screen ---------- */

  /* ---------- with friends ---------- */

  /** How far along this child's row of plants a place across is, from the first to the last, and back. */
  alongRow(x) {
    const [from, to] = SPREADS[this.spread()];
    return (x - from) / (to - from);
  }

  acrossAt(along) {
    const [from, to] = SPREADS[this.spread()];
    return from + along * (to - from);
  }

  /**
   * Where the child's can is, for friends' games: along the row of plants, so it's over the same plant on every
   * screen, how far down, how far it's tipped and pouring, and its glove's points in palms.
   */
  canState() {
    const glove = this.gloves[this.session.settings.hands];
    if (!glove.visible) return { u: 0, y: 0, v: 0, tip: 0, f: 0, p: [] };
    const { view } = this;
    const palm = view.palmSize * 0.85;
    return {
      u: round3(this.alongRow(glove.x / view.width)),
      y: round3(glove.y / view.height),
      v: 1,
      tip: round2(this.tip),
      f: round2(this.flow),
      p: glove.points.flatMap(({ x, y }) => [round2(x / palm), round2(y / palm)]),
    };
  }

  /**
   * Each friend's can where it is on their screen, a moment ago, over the same plant here, fading in and out as their
   * hand comes and goes, and away once they've finished. Its water falls here too, though it's the sips the server
   * says are theirs that make the plants grow.
   */
  showFriendsCans(dt) {
    const { view, garden } = this;
    const now = performance.now();
    for (const each of this.friendCans) {
      const at = each.track.at(now);
      const seen = Boolean(at?.v) && now - each.heardAt < CAN_QUIET_MS && !this.friends.results.has(each.id);
      each.fade += ((seen ? 1 : 0) - each.fade) * (1 - Math.exp(-dt * CAN_FADE_RATE));
      if (!at) continue;
      each.at = at;
      each.x = this.acrossAt(at.u) * view.width;
      each.y = at.y * view.height;
      each.side = each.x > view.width / 2 ? -1 : 1;
      const { glove } = each;
      glove.visible = seen || each.fade > 0.05;
      glove.status = 'open';
      glove.x = each.x;
      glove.y = each.y;
      const palm = view.palmSize * 0.85;
      if (at.p?.length === 42) {
        glove.points.forEach((point, index) => {
          point.x = at.p[index * 2] * palm;
          point.y = at.p[index * 2 + 1] * palm;
        });
      }
      if (seen && at.f > 0) {
        const rose = view.roseAt(each.x, each.y, at.tip, each.side);
        const falls = view.waterAt(each.x, each.y, each.side);
        const hits = garden.landing(falls.x / view.width, falls.y / view.height, STREAM);
        view.pour(rose.x, rose.y, Math.min(...hits.map((hit) => hit.y)) * view.height, at.f, STREAM, dt, (hits[0].thing?.x ?? falls.x / view.width) * view.width);
      }
    }
  }

  /** Something from a friend's game: where their can is, or whose a sip of water was. */
  fromFriend(id, message) {
    if (message.t === 'claimed') {
      if (this.mode === 'friends' && this.friends.current?.racers.includes(message.by)) this.garden.claimed(message.k, message.by);
      this.showScores();
      return;
    }
    if (message.t !== 'can') return;
    const each = this.friendCans.find((can) => can.id === id);
    if (!each) return;
    each.track.push(message, performance.now());
    each.heardAt = performance.now();
  }

  /** A friend has gone, and their can with them. The water they gave stays given, and stays theirs. */
  friendGone(friend) {
    this.friendCans = this.friendCans.filter((each) => each.id !== friend.id);
    this.showScores();
  }

  /** How much of all the garden's water so many sips is, in whole percent, as it's shown. */
  shareOf(sips) {
    const all = this.garden.plants.reduce((sum, plant) => sum + Math.ceil(plant.need / SIP - 1e-9), 0);
    return all ? Math.min(100, Math.round((100 * sips) / all)) : 0;
  }

  /** With friends, how much of the watering each one has done so far, the most first. */
  showScores() {
    const list = byId('garden-scores');
    const { current } = this.friends;
    list.hidden = this.mode !== 'friends' || !current;
    if (list.hidden) return;
    const portraits = this.session.portraits ?? {};
    const you = this.friends.room.you;
    const mine = { id: you, name: 'You', who: (characterWithId(this.session.settings.fighter) ?? ROSTER[0]).id };
    const theirs = current.friends.filter((friend) => !friend.gone).map((friend) => ({ id: friend.id, name: friend.spec.name, who: friend.spec.id }));
    const everyone = [mine, ...theirs].map((each) => ({ ...each, share: this.shareOf(this.garden.tally.get(each.id) ?? 0) })).sort((a, b) => b.share - a.share);
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
      name.className = 'garden-score-name';
      name.textContent = each.name;
      const share = document.createElement('span');
      share.className = 'garden-score';
      share.textContent = `${each.share}%`;
      row.append(face, name, share);
      return row;
    }));
  }

  showProgress() {
    const { garden } = this;
    byId('chip-flowers').textContent = `${garden.stats.flowers} of ${garden.plants.length}`;
    const prizes = Object.values(garden.stats.prizes).reduce((sum, count) => sum + count, 0);
    byId('chip-prizes').textContent = String(prizes);
  }

  /* ---------- the end ---------- */

  prompt(snapshot, dt) {
    const { session } = this;
    const needed = session.handsPrompt(snapshot, dt);
    if (this.partyIn !== null || this.garden.wilted) return null;
    if (needed && !needed.key.startsWith('closed')) return needed;
    // In the gentle garden the hand can rest whenever it likes: the can just waits. After a while, it's said that's
    // fine. With the sun drying the garden that isn't said, as the sun doesn't wait for a closed hand.
    if (!this.garden.drying && this.restFor > RESTING_AFTER) return { key: 'resting', text: SPOKEN.resting, side: null };
    if (!this.holding && this.closedFor > CLOSED_PROMPT_AFTER) return { key: 'open-to-hold', text: OPEN_TO_HOLD, side: null, asks: 'open' };
    // Holding the can and not pouring: how to.
    if (this.dryFor > TURN_HINT_AFTER) return { key: 'turn-hint', text: TURN_HINT, side: null };
    return null;
  }

  finished() {
    const { sound } = this.session;
    sound.stopLoop('birds');
    sound.stopLoop('pour');
    this.story.hide();
    // With friends, how much of the water this child gave, which every computer has counted the same.
    if (this.mode === 'friends') this.friends.finished(this.sinceGo, { n: this.garden.tally.get(this.friends.room.you) ?? 0, w: 1 });
    for (const each of this.friendCans) each.glove.visible = false;
    for (const glove of Object.values(this.gloves)) glove.hide();
  }

  summary() {
    const { stats } = this.garden;
    const hand = this.session.settings.hands;
    const row = (value) => ({ left: hand === 'left' ? value : '', right: hand === 'right' ? value : '' });
    const prizes = Object.values(stats.prizes).reduce((sum, count) => sum + count, 0);
    this.friends.showResults();
    return {
      hero: stats.flowers,
      noun: 'garden',
      rows: { flowers: row(stats.flowers), pours: row(stats.pours), prizes: row(prizes) },
      // On their own, a plant can wilt in the sun, and that garden comes round again at the same level. In the gentle
      // garden, and with friends, every plant flowers in the end.
      won: !this.garden.lost,
      // A garden with friends is on the host's level, so it doesn't move the child's own level on.
      countsForLevel: !this.friends.current,
    };
  }
}

/**
 * The game's sounds. A garden a plant wilted in ends softly: a sparkle in place of the fanfare, and
 * the voice says what it says after any game that was lost.
 */
class GardenSound extends Sound {
  lost = false;

  finish(line, options) {
    if (this.lost) this.play('sparkle', { gain: 0.3 });
    super.finish(line, options);
  }
}

const choice = (name, value, label) => `<label><input type="radio" name="${name}" value="${value}"> ${label}</label>`;

new GameSession({
  // What the open and closed hand do here, for the hand shapes in the grown-ups' panel: see core/shapes.js.
  moves: { open: 'Hold the can', closed: null },
  shell: {
    title: 'Giraffe’s Garden',
    startLabel: 'Water the garden',
    againLabel: 'Play again',
    finishTitle: FINISH,
    heroMark: '🌼',
    heroNoun: 'flowers',
    extraRows: [{ id: 'flowers', label: 'Flowers grown' }, { id: 'pours', label: 'Turns of the hand' }, { id: 'prizes', label: 'Prizes' }],
    hudTop: `
      <div class="garden-hud">
        <div class="chip chip-flowers"><span class="chip-label">Flowers</span><span id="chip-flowers" class="chip-value">0 of 6</span></div>
        <div id="chip-prizes-box" class="chip chip-prizes" hidden><span class="chip-label">Prizes</span><span id="chip-prizes" class="chip-value">0</span></div>
        <ol id="garden-scores" class="garden-scores" aria-label="How much of the watering each one has done" hidden></ol>
      </div>
      ${STORY_BOX}
      <div class="film garden-film" aria-hidden="true">
        <svg viewBox="0 0 220 160">
          <rect class="film-soil" x="0" y="138" width="220" height="22" />
          <g class="film-flower">
            <path class="film-stem" d="M150 138V96" />
            <ellipse class="film-leaf" cx="142" cy="118" rx="9" ry="4" />
            <circle class="film-bloom" cx="150" cy="92" r="11" />
            <circle class="film-middle" cx="150" cy="92" r="4.5" />
          </g>
          <g class="film-drops">
            <circle cx="128" cy="78" r="3" />
            <circle cx="133" cy="92" r="3" />
            <circle cx="129" cy="106" r="3" />
          </g>
          <g class="film-can">
            <path class="film-spout" d="M88 70L126 46" />
            <rect class="film-body" x="58" y="56" width="38" height="36" rx="8" />
            <path class="film-handle" d="M62 58Q66 34 77 36Q88 34 92 58" />
            <g class="film-hand">
              <rect x="-13" y="-10" width="26" height="22" rx="8" />
              <path class="film-finger" d="M-8 -8V-22M-2 -10V-26M4 -10V-26M10 -8V-20M13 4L22 -4" />
            </g>
          </g>
        </svg>
      </div>`,
    panelSettings: `
      <fieldset class="choice">
        <legend>How far to turn the hand over to pour</legend>
        ${choice('turn', 'little', 'A little: the palm turns partly away')}
        ${choice('turn', 'more', 'More: the hand nearly side-on')}
        ${choice('turn', 'over', 'Right over: the back of the hand to the camera')}
      </fieldset>
      <fieldset class="choice">
        <legend>How far apart the plants are, which is how far to reach</legend>
        ${choice('spread', 'close', 'Close together')}
        ${choice('spread', 'middle', 'Medium')}
        ${choice('spread', 'wide', 'Far apart')}
      </fieldset>
      <fieldset class="choice">
        <legend>The sun drying the garden</legend>
        ${choice('gardenSun', 'dries', 'The sun dries it: a plant left too long without water wilts')}
        ${choice('gardenSun', 'gentle', 'Gentle: nothing dries out, take all the time you need')}
      </fieldset>
      <fieldset class="choice">
        <legend>Plants to grow</legend>
        ${choice('plants', '4', '4')}
        ${choice('plants', '6', '6')}
        ${choice('plants', '8', '8')}
      </fieldset>`,
  },
  defaults: { turn: 'little', spread: 'middle', plants: 6, gardenSun: 'dries' },
  choices: { turn: String, spread: String, plants: Number, gardenSun: String },
  // These go on to a game that's being played at once. The rest, and the level, start it again: see core/settings.js.
  atOnce: ['turn'],
  tagline: (side) => `Giraffe’s garden is thirsty! Hold the watering can with your open ${side} hand, and turn your hand over to pour.`,
  finishLine: FINISH,
  lines: new URL('./audio/voice/lines.json', import.meta.url),
  portraits: () => renderPortraits(ROSTER),
  createSound: (options) => new GardenSound({
    ...options,
    sounds: {
      pour: new URL('./audio/pour.ogg', import.meta.url),
      birds: new URL('../spider-catcher/audio/birds.ogg', import.meta.url),
      found: new URL('../spider-catcher/audio/home.ogg', import.meta.url),
      sparkle: new URL('../mighty-moves/audio/sparkle.ogg', import.meta.url),
      whoosh: new URL('../mighty-moves/audio/whoosh-2.ogg', import.meta.url),
      boing: new URL('../robot-rescue/audio/boing.ogg', import.meta.url),
      crunch: new URL('../giraffe-walk/audio/crunch.ogg', import.meta.url),
    },
  }),
  createGame: (session) => new GardenGame(session),
}).start();
