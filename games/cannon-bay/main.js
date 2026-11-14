// Cannon Bay: pirates have come for the island's treasure, and Captain Giraffe asks the child to drive them
// off. One hand does it all. Moving it from side to side turns the ship's wheel, opening it raises the
// sails, and the cannons fire by themselves at any pirate ship in a firing zone. This file runs it from
// start to finish. The rules are in battle.js, the picture is in sea.js, and the ships are in ships.js.
// With a friend on their own computer, as whoever makes the game chooses: both ships against the pirates
// together (team.js), or ship against ship, with no pirates (duel.js).
import { renderPortraits } from '../../core/body/portraits.js';
import { byId as characterWithId, ROSTER } from '../../core/body/roster.js';
import { Track, seededRandom } from '../../core/friends.js';
import { FriendsPanel } from '../../core/friends-ui.js';
import { GameSession, SPOKEN } from '../../core/session.js';
import { STORY_BOX, StoryBox } from '../../core/story.js';
import { BaySound } from './bay-sound.js';
import { Battle, HEARTS, MOST_AT_ONCE, PACES, levelPlan, newsAt, newsFor } from './battle.js';
import { Duel, SHIP_TRACK, duelSeconds, duelStart, shipWire } from './duel.js';
import { Bay } from './sea.js';
import { TeamBattle } from './team.js';

// Every one of these has a rendered voice file: see audio/voice/lines.json.
const MISSION = 'Pirates want our treasure! Help me drive them off!';
const OPEN_TO_SAIL = 'Open your hand to raise the sails!';
const TURN_WHEEL = 'Move your hand side to side to turn the wheel!';
const SAIL_BESIDE = 'Sail beside them! The cannons fire by themselves!';
const BYE_BYE = 'Bye bye! They’re rowing home!';
const ONE_LEFT = 'One more to go!';
const TURN_BACK = 'Back to the island!';
const WON = 'You drove them all off! The treasure is safe!';
const LOST = 'So close! Sail again!';
// What the card says when the pirates win, in the story. It's only shown, as LOST is what's said.
const PIRATES_WON = { en: 'The pirates got the treasure this time!', ka: 'ამჯერად მეკობრეებმა განძი წაიღეს!' };
const TRY_AGAIN = { en: 'Try again', ka: 'კიდევ სცადე' };
// A battle together that the two have lost has its own title, which the friends' finish card reads each time it fills in.
const teamCard = { lost: null };
// With a friend, whoever won: Giraffe starts it with SAIL_BESIDE, and says this at the end.
const DUEL_DONE = 'What a battle! Well sailed!';

// Each captain's one line, in their own voice, as they come near.
const CAPTAINS = {
  truffle: 'Oink! That treasure smells delicious!',
  kit: 'Kit here! Your treasure is mine!',
  mochi: 'Hop hop! Hand over the treasure!',
  widget: 'Beep! Treasure found! Boop!',
  frost: 'Frost here! Let’s have a snowball fight!',
  bramble: 'Bramble here! Is the treasure honey?',
  nova: 'Meow! That treasure shines like the stars!',
  cinder: 'Cinder here! I’m all fired up!',
  tur: 'Tur here! Nobody sails like a mountain goat!',
};

const DEFAULTS = { bayPace: 'slow', bayCannons: 'open', bayPirates: 'medium', bayShips: 6, bayFriends: 'together' };
const CHOICES = { bayPace: String, bayCannons: String, bayPirates: String, bayShips: Number, bayFriends: String };

const AFTER_WIN_SECONDS = 2.2; // A moment to see Giraffe cheering, after the last ship has gone down.
const AFTER_LOST_SECONDS = 1.4;
const STORY_SECONDS = 4.4;
const CAPTAIN_SPEAKS_WITHIN = 280;
const CAPTAIN_SPEAKS_EVERY = 14; // Children are here to move, and nobody's waiting to listen.
const FIRST_CAPTAIN_AFTER = 5;
const BYE_EVERY = 3; // Ships between one bit of praise and the next.
const OPEN_PROMPT_AFTER = 0.8;
const RESTING_PROMPT_AFTER = 15;
const LIMIT_PROMPT_FROM = 0.3;
const WHEEL_TURNS_DEGREES = 135;
const MARK_MARGIN = 74;
const MARK_TOP = 128;
// A mark for each pirate that can be out at once, with room for the two little rafts a raft comes apart into.
const MOST_MARKS = MOST_AT_ONCE + levelPlan(10).atOnce + 4;

// The first time something new is seen in a battle, a little label with its name, for this long.
const LABEL_SECONDS = 2.8;
const LABEL_FADE = 0.6;
// One for something out of sight waits for it to come into view, for up to this long.
const LABEL_WAITS = 14;
const NAMES_AFTER_SECONDS = 1.3; // Long enough for "GO!" to have gone.
// What the label says for each kind of pirate ship, and for each prize, by its key in levelPlan.
const KIND_NEWS = { raft: 'rafts', sloop: 'sloops', smoky: 'smoke', sub: 'subs', flagship: 'flagship', king: 'king' };
const PRIZE_NEWS = { gem: 'gems', heart: 'hearts', key: 'keys' };
const CHEST_NAME = { mark: '🧰', name: 'Treasure chest', nameKa: 'განძის სკივრი' };
// The prizes counted along the top, and on the finish card, and which part of the level brings each.
const PRIZE_COUNTS = [
  { id: 'gems', stat: 'gems', plan: 'gems', mark: '💎', word: 'gems' },
  { id: 'sailors', stat: 'sailors', plan: 'sailors', mark: '🛟', word: 'sailors' },
  { id: 'chests', stat: 'chests', plan: 'keys', mark: '🧰', word: 'chests' },
  { id: 'powers', stat: 'powers', plan: 'triple', mark: '✨', word: 'power-ups', top: false },
];

// When the film of what to do comes up: until the child has done it for this long, and again if they
// seem stuck.
const SAILS_LEARNED_SECONDS = 2;
const WHEEL_LEARNED_SECONDS = 1.2;
const WHEEL_USED_FROM = 0.3;
const CLOSED_STUCK_SECONDS = 6;
const WHEEL_STUCK_SECONDS = 15;
const FILM_SHOWN_AT_LEAST = 3;
const WHEEL_PROMPT_SECONDS = 8; // The words about the wheel, which go away before the film does.
const BESIDE_AFTER_SECONDS = 9;
const BESIDE_SHOWN_FOR = 5;
const BESIDE_AGAIN_AFTER = 30;

// Playing with a friend, each on their own computer: see core/friends-ui.js for what each of these is.
const BAY_WORDS = {
  toggle: 'Play with a friend',
  make: 'Make a game',
  codeLabel: 'A friend’s game code',
  codeName: 'Game code',
  how: 'Tell your friend the code. Then you both press <b>Set sail!</b>',
  // Together or against each other, as whoever made the game chooses: see teams in core/friends-ui.js.
  together: 'Together',
  against: 'Against each other',
  howTogether: 'Tell your friend the code. Then you both press <b>Set sail!</b>, and drive the pirates off together.',
  get teamTitle() {
    return teamCard.lost ?? 'You saved the treasure together!';
  },
  leave: 'Leave this game',
  privacy: 'Only your name, who you play as, whether you chose together or against each other, where your ship is, the hits it makes and whether you’re resting go to your friend. Together, the game of whoever made it also sends where the pirate ships and their cannonballs are. The camera picture stays on this computer.',
  alone: 'Play on your own',
  full: 'That game already has 2 players.',
  lost: 'Can’t reach the game. Check the internet, then try again.',
  left: 'You’ve left the game.',
  badCode: 'A game code is 3 letters and numbers.',
  busy: 'Playing',
  still: 'still playing',
};
// The finish card's title with a friend, once both have finished, or before their result is in.
const DUEL_TITLES = { won: 'You won!', both: 'You both won!', waiting: 'Time’s up!' };

const byElement = (id) => document.getElementById(id);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const clock = (seconds) => {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

/** random is where the chance comes from: one both friends share, for an order that's the same on both screens. */
function shuffled(list, random = Math.random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

class CannonBay {
  chimeOnOpen = false; // The sails going up have their own sound.

  /** What a level brings that's new, for the cards: see NEWS in battle.js. */
  newAt(level) {
    return newsAt(level);
  }

  constructor(session) {
    this.session = session;
    this.story = new StoryBox(session);
    this.pirateSpecs = ROSTER.filter(({ id }) => id !== 'giraffe');
    this.bay = new Bay(byElement('game'), characterWithId('giraffe'), this.pirateSpecs);
    this.duel = null; // With a friend, ship against ship: see duel.js and prepare().
    this.team = null; // Or with them against the pirates: see team.js.
    this.friendTrack = null; // Where the friend's game says their ship is.
    this.goAt = 0;
    this.buildMarks();
    this.buildWheel();
    this.labelHolder = byElement('bay-labels');
    this.labels = [];
    this.lastShown = {};
    this.resetHelp();
    this.makeBattle();
    window.addEventListener('resize', () => this.measureTop());
    // A fine sight on the title screen, with its sails up.
    this.battle.sails = 1;
    const game = this;
    // Playing with a friend, if a grown-up makes or joins a game.
    this.friends = new FriendsPanel({
      game: 'cannon-bay',
      linkKey: 'bay',
      words: BAY_WORDS,
      // Each child sails as themselves, so their own settings stay theirs: only the host's ships to beat, which
      // say how many pirates there are or how long a duel lasts, and with pirates about, the host's speed, so
      // that they can keep up with both ships, are everyone's.
      hello: () => ({ driver: session.settings.fighter ?? '', level: session.levels.current, length: session.settings.bayShips, mode: session.settings.bayPace }),
      // Together or against each other: the grown-ups' choice, which the friends box can change too.
      teams: {
        get: () => (session.settings.bayFriends === 'against' ? 'against' : 'together'),
        set: (choice) => this.chooseTeams(choice),
      },
      screen: () => session.screen,
      portraits: () => session.portraits,
      onMove: (id, message) => this.fromFriend(id, message),
      onGone: (friend) => this.friendGone(friend),
      // The most hits first, and equal ones share a place.
      rank: (a, b) => b.dropped - a.dropped,
      resultText: ({ dropped }) => (this.duel ? `${dropped} ${dropped === 1 ? 'hit' : 'hits'}` : `${dropped} ${dropped === 1 ? 'ship' : 'ships'} beaten`),
      // Read as the card fills in, so it can say who won once both have finished.
      titles: {
        get first() {
          return game.resultTitle();
        },
        get other() {
          return game.resultTitle();
        },
      },
      startAfter: byElement('start'),
      waitingBefore: byElement('screen-finish'),
      resultsAfter: document.querySelector('#screen-finish .finish-hero'),
      finishTitle: document.querySelector('#screen-finish h2'),
    });
    this.debug = {
      bay: this.bay,
      get battle() {
        return game.battle;
      },
      get game() {
        return game;
      },
      get duel() {
        return game.duel;
      },
      get friends() {
        return game.friends;
      },
    };
  }

  /** With a friend, the start waits until they're ready too. */
  holdStart(go) {
    return this.friends.holdStart(go);
  }

  /** How long since "GO!", by the clock on the wall, for the friend's game. */
  get sinceGo() {
    return performance.now() - this.goAt;
  }

  /**
   * level, from 1 to 10, makes it harder within the grown-up's choices: see levelPlan in battle.js. With a
   * friend, there are no pirates, just the two ships, each in the plain game, at the child's own speed,
   * cannons and how hard.
   */
  makeBattle(level = this.session.level ?? 1) {
    const { bayShips, bayPace, bayPirates, bayCannons } = this.session.settings;
    const { duel, team } = this;
    const settings = { pace: bayPace, level: bayPirates, cannons: bayCannons, onEvent: (event) => this.onBattle(event) };
    this.captains = null;
    if (team) {
      // The same captains, in the same order, on both screens, from the chance both games were given. The friend's
      // ship comes after them, and is one of its own.
      this.captains = shuffled(this.pirateSpecs.map(({ id }) => id), seededRandom(team.seed)).slice(0, team.ships);
      this.order = [...this.captains, this.bay.friendShipKey(team.friend.spec, { ally: true })];
      this.battle = new TeamBattle({ ...settings, pace: team.pace, ships: team.ships, slot: team.slot, runs: team.hosting });
    } else if (duel) {
      this.order = [this.bay.friendShipKey(duel.friend.spec)];
      this.battle = new Battle({ ...settings, ships: 0, levelNumber: 1, start: duelStart(duel.slot) });
      this.battle.addFriend(duelStart(1 - duel.slot));
    } else {
      // A different lot of captains each time, when there are fewer ships than characters.
      this.order = shuffled(this.pirateSpecs.map(({ id }) => id)).slice(0, bayShips);
      this.battle = new Battle({ ...settings, ships: bayShips, levelNumber: level });
    }
    this.bay.setBattle(this.battle, this.order);
    this.buildCaptainsRow();
    this.lastShown = {};
    this.endIn = null;
    this.saidBye = 0;
    for (const mark of this.marks) mark.root.dataset.where = 'none';
    this.clearLabels();
    this.showPrizeCounts();
  }

  resetHelp() {
    this.openFor = 0;
    this.wheelFor = 0;
    this.sinceWheel = 0;
    this.sinceFired = 0;
    this.filmHeld = 0;
    this.film = null;
    this.wheelPromptLeft = 0;
    this.storyLeft = 0;
    this.nextCaptainIn = 0;
    this.besideShown = 0;
    this.firedYet = false;
    document.body.dataset.film = 'off';
    delete document.body.dataset.filmPart;
  }

  settingChanged(change) {
    const { battle } = this;
    // With a friend against the pirates, both ships sail at the host's speed.
    if ('bayPace' in change && !this.team) battle.setPace(change.bayPace);
    if ('bayPirates' in change) {
      battle.setLevel(change.bayPirates);
      this.bay.shapeZones();
    }
    if ('bayCannons' in change) battle.cannons = change.bayCannons;
    if ('bayShips' in change && battle.state === 'ready' && !this.duel && !this.team) this.makeBattle();
    // A friend hosted by this child plays this child's ships to beat, at this child's speed, together or not.
    if (('bayShips' in change || 'bayPace' in change || 'bayFriends' in change) && this.friends.room.inRoom) this.friends.room.tell(this.friends.hello());
    if ('bayFriends' in change) this.friends.showTeams();
  }

  /** Together or against each other, chosen in the friends box: kept with the grown-ups' settings, and shown there. */
  chooseTeams(choice) {
    this.session.changeSettings({ bayFriends: choice });
    const input = document.querySelector(`input[name="bayFriends"][value="${choice}"]`);
    if (input) input.checked = true;
  }

  /* ---------- the round ---------- */

  prepare(level = 1) {
    // With a friend it's as whoever made the game chose: both ships against the host's number of pirates, which
    // the host's game runs for both, or ship against ship, for as long as the host's ships to beat say. Neither
    // moves anyone's own level on.
    const friendly = this.friends.current;
    const friend = friendly?.friends[0] ?? null;
    const together = Boolean(friend && friendly.team);
    this.team = together ? { friend, slot: friendly.mySlot, hosting: friendly.hosting, ships: friendly.length, pace: PACES[friendly.mode] ? friendly.mode : 'slow', seed: friendly.seed, alone: false } : null;
    this.duel = friend && !together ? new Duel({ seconds: duelSeconds(friendly.length), slot: friendly.mySlot, friend }) : null;
    this.friendTrack = friend ? new Track(SHIP_TRACK) : null;
    document.body.toggleAttribute('data-friends-race', Boolean(this.duel));
    this.resetHelp();
    this.story.hide();
    this.makeBattle(level);
    this.showDuel();
    this.bay.setSailing(true);
    this.session.sound.startSea();
    this.updateHud();
  }

  begin() {
    this.goAt = performance.now();
    this.battle.begin();
    // The friend's ship is already alongside, so it's what to do that's said.
    this.say('giraffe', this.duel ? SAIL_BESIDE : MISSION);
    this.nextCaptainIn = FIRST_CAPTAIN_AFTER;
    // The weather, if it's new, is named out over the water in front.
    const { plan } = this.battle;
    const ahead = () => {
      const { battle } = this;
      return { x: battle.x + Math.sin(battle.heading) * 240, y: 55, z: battle.z - Math.cos(battle.heading) * 240 };
    };
    if (plan.sunset) this.firstSeen('sunset', ahead);
    else if (plan.mist) this.firstSeen('mist', ahead);
  }

  resume() {
    this.session.sound.startSea();
  }

  enterCheck() {
    // A hand check in the middle of a battle: everything waits for it.
    this.session.sound.sailing(0, 0);
  }

  /** The hand as the rules need it. Anything that can't be properly read fails closed. */
  readHand(snapshot) {
    const hand = snapshot[snapshot.side];
    const readable = hand.status !== 'missing' && !snapshot.overlap && (hand.reason === null || hand.reason === 'closed');
    return { steer: snapshot.steer, drive: snapshot.drive, open: snapshot.handOpen === true, seen: readable };
  }

  update(dt, snapshot) {
    const { battle, session } = this;
    // The friend's ship goes where their game says first, so the cannons fire at where it's seen.
    if (this.duel || this.team) this.followFriend(dt);
    const input = this.readHand(snapshot);
    const wasOpen = battle.open;
    battle.update(dt, input);
    if (input.open && !wasOpen) session.sound.sailsUp();
    if (this.duel) this.updateDuel(dt);
    if (this.team) this.updateTeam();
    if (this.team) this.watchFriendLost();
    this.bay.update(dt);

    session.sound.sailing(battle.speed / battle.pace.speed, battle.sails);
    this.updateWheel(snapshot);
    this.updateHud();
    // The prizes along the top can change height with the window, so the story box keeps checking.
    this.measureIn = (this.measureIn ?? 0) - dt;
    if (this.measureIn <= 0) {
      this.measureIn = 0.5;
      this.measureTop();
    }
    this.updateMarks();
    this.updateLabels(dt);
    this.updateHelp(dt, snapshot);
    this.updateStory(dt);

    if (this.endIn !== null) {
      this.endIn -= dt;
      if (this.endIn <= 0) {
        this.endIn = null;
        session.finish();
        // The level doesn't move on, and the big button says so.
        const again = document.getElementById('play-again');
        if (this.battle.state === 'lost' && again) again.textContent = TRY_AGAIN[this.language];
        // And no confetti for the pirates winning.
        if (this.battle.state === 'lost') session.hud.confetti?.stop();
      }
    }
  }

  idle(dt, snapshot) {
    const { battle, session } = this;
    // The sails already answer the hand in the hand check and the countdown, and the wheel does too.
    const screen = session.screen;
    if (battle.state === 'ready') {
      if (screen === 'check' || screen === 'countdown') {
        const input = this.readHand(snapshot);
        battle.update(dt, input);
        this.updateWheel(snapshot);
      }
    } else if (battle.state !== 'sailing') {
      // Behind the finish card, the friend's ship goes on as their game last said.
      if (this.duel || this.team) this.followFriend(dt);
      battle.update(dt, {});
    }
    this.bay.update(dt);
  }

  render() {
    this.bay.render();
  }

  finished() {
    const { session, battle, duel, team } = this;
    // Whatever's still floating over to the ship counts on the card.
    battle.collectAll();
    session.sound.stopSea();
    this.story.hide();
    this.bay.setSailing(false);
    this.clearLabels();
    for (const mark of this.marks) mark.root.dataset.where = 'none';
    document.body.dataset.film = 'off';
    session.finishLine = duel ? DUEL_DONE : battle.state === 'lost' ? LOST : WON;
    session.sound.lost = battle.state === 'lost';
    // The friend's finish card fills in with how this child did.
    // Together, it's how many of the pirate ships were this child's.
    // Sunk together, it says the battle was lost, so the friend's game ends it too.
    teamCard.lost = team && battle.state === 'lost' ? PIRATES_WON[this.language] : null;
    if (this.friends.current) this.friends.finished(this.sinceGo, { n: duel ? duel.mine : team ? battle.beatenBy.mine : battle.beaten, w: battle.state === 'lost' ? 0 : 1 });
  }

  summary() {
    const { beaten, plan, stats } = this.battle;
    const { duel, team, session } = this;
    const { hands } = session.settings;
    const { gold } = stats;
    const count = (value) => ({ left: hands === 'left' ? value : 0, right: hands === 'right' ? value : 0 });
    // Against a friend, it's the hits that count, and there's no gold, as nobody sinks. Together, the row is how
    // many of the pirate ships were this child's, and the big number how many the two beat between them.
    const rows = { beaten: count(duel ? duel.mine : team ? this.battle.beatenBy.mine : beaten), gold: count(gold) };
    this.labelRow('beaten', duel ? 'Hits on your friend’s ship' : 'Ships beaten');
    this.labelRow('gold', 'Gold picked up', Boolean(duel));
    // The prizes of the higher levels, in one row, with only those this level has.
    const shown = PRIZE_COUNTS.filter(({ plan: key }) => plan[key]);
    rows.prizes = count(shown.map(({ stat, mark }) => `${mark} ${stats[stat]}`).join(' · '));
    this.labelRow('prizes', `Prizes: ${shown.map(({ word }) => word).join(', ')}`, shown.length === 0);
    // With a friend, the card says who won, and on their own, how the battle went.
    this.friends.showResults();
    if (!this.friends.current) document.querySelector('#screen-finish h2').textContent = this.battle.state === 'lost' ? PIRATES_WON[this.language] : session.translate(session.finishLine);
    const hero = duel ? duel.mine : beaten;
    const noun = byElement('finish-hero')?.nextSibling;
    const together = Boolean(team) && !team.alone;
    if (noun?.nodeType === Node.TEXT_NODE) noun.textContent = duel ? ` ${hero === 1 ? 'hit' : 'hits'}` : together ? ' beaten together' : ' pirate ships beaten';
    // Being sunk, which only Medium and Tough allow, means trying the same level again. A game with a friend
    // doesn't move anyone's own level on.
    return { hero, noun: 'battle', rows, won: this.battle.state !== 'lost', countsForLevel: !this.friends.current };
  }

  /** A row of the finish card's table: what it's called, and whether it's left out. */
  labelRow(id, label, hidden = false) {
    const row = byElement(`sum-left-${id}`)?.closest('tr');
    if (!row) return;
    row.hidden = hidden;
    row.querySelector('th').textContent = label;
  }

  /**
   * The finish card's title with a friend: who won, once both have finished, and equal points share the win.
   * A friend who went in the middle leaves it to the child still there. On their own, it's how the battle went.
   */
  resultTitle() {
    const { duel, friends, session } = this;
    if (!duel) return session.translate(session.finishLine ?? WON);
    const theirs = friends.results.get(duel.friend.id);
    const mine = friends.results.get(friends.room.you)?.dropped ?? duel.mine;
    if (!theirs) return duel.friend.gone ? DUEL_TITLES.won : DUEL_TITLES.waiting;
    const outcome = Duel.outcome(mine, theirs.dropped);
    if (outcome === 'tied') return DUEL_TITLES.both;
    return outcome === 'won' ? DUEL_TITLES.won : `${duel.friend.spec.name} won!`;
  }

  /* ---------- what happens ---------- */

  onBattle(event) {
    const { bay, session, battle } = this;
    const { sound } = session;
    bay.onEvent(event);
    const away = (x, z) => Math.hypot(x - battle.x, z - battle.z);
    const handlers = {
      fire: () => {
        sound.cannon();
        this.firedYet = true;
      },
      'pirate-fire': () => sound.theirCannon(away(event.pirate.x, event.pirate.z)),
      splash: () => sound.splash(away(event.x, event.z), event.size),
      // A friend's hit on a pirate ship shows, and is heard on their own computer.
      hit: () => {
        if (!event.theirs) sound.hit(away(event.x, event.z));
        if (event.friend) this.scored();
      },
      // Together, the game that runs the pirates hears of each hit this child's game has made.
      tag: () => this.friends.sendTag(event.id, event.hits),
      struck: () => sound.struck(),
      hurt: () => {
        sound.hurt();
        this.shakeHearts();
      },
      spawn: () => {
        this.showCaptains();
        this.labelPirate(event.pirate);
      },
      gold: () => sound.gold(),
      beaten: () => this.onBeaten(event),
      'little-beaten': () => {
        sound.beaten(away(event.pirate.x, event.pirate.z), { small: true });
        this.showCaptains();
      },
      drop: () => this.labelPrize(event.prize),
      // Once it's over, what's still coming over is counted quietly, under the horn and the cheering.
      prize: () => {
        if (battle.state === 'sailing') sound.prize(event.prize);
      },
      power: () => sound.powerUp(),
      bubbled: () => sound.bubble(away(event.pirate.x, event.pirate.z)),
      bounce: () => sound.boing(away(event.from.x, event.from.z)),
      blocked: () => sound.bubble(0, 0.7),
      'sail-down': () => sound.sailDown(away(event.x, event.z)),
      split: () => sound.hit(away(event.pirate.x, event.pirate.z)),
      smoke: () => sound.puff(away(event.pirate.x, event.pirate.z)),
      dive: () => sound.splash(away(event.pirate.x, event.pirate.z), 0.5),
      surface: () => sound.splash(away(event.pirate.x, event.pirate.z), 0.5),
      won: () => {
        this.endIn = AFTER_WIN_SECONDS;
        sound.won();
      },
      lost: () => {
        this.endIn = AFTER_LOST_SECONDS;
      },
    };
    handlers[event.type]?.();
  }

  onBeaten({ pirate, left, boat }) {
    const { sound } = this.session;
    // What's said comes first, so the voice is already on as the beaten ship's sounds start, and they go
    // under it rather than all starting at full on top of each other, which came close to clipping.
    if (left === 1) {
      sound.say(ONE_LEFT, { ifQuiet: true });
    } else if (left > 1 && boat && this.saidBye % BYE_EVERY === 0) {
      this.say('giraffe', BYE_BYE, { ifQuiet: true });
    }
    if (boat) this.saidBye += 1;
    // A raft has nobody on it, so no lifeboat is launched, and nobody is heard rowing or said to be.
    sound.beaten(Math.hypot(pirate.x - this.battle.x, pirate.z - this.battle.z), { rowing: Boolean(boat) });
    this.showCaptains();
  }

  /* ---------- with a friend ---------- */

  /**
   * The friend's ship where their game says it is, a moment ago, and the balls it has fired since, flying
   * over to the child's ship.
   */
  followFriend(dt) {
    const { battle, duel } = this;
    const at = this.friendTrack?.at(performance.now());
    if (!at || !battle.friend) return;
    battle.placeFriend({ x: at.x, z: at.z, heading: at.h, speed: at.s, sails: at.v, resting: Boolean(at.r) }, dt);
    // In a duel they come at the child's ship. Together, they go for the pirate the friend is firing at.
    const fired = (duel ?? battle).newlyFired(at.f);
    if (fired > 0) battle.friendFired(fired);
  }

  /**
   * Together: where the child's ship is, for the friend's game, and from the game that runs the pirates, where
   * they and their cannonballs are. Once the friend has gone, there's nobody to tell.
   */
  /** Which language the card's own words are in, as the voice speaks. */
  get language() {
    return this.session.settings.language === 'ka' ? 'ka' : 'en';
  }

  /**
   * Together, the friend's ship has been sunk, which their game says in the result it sends: the two have lost
   * together, and it ends here too.
   */
  watchFriendLost() {
    const { battle, team } = this;
    if (!battle.friend || battle.state !== 'sailing') return;
    if (this.friends.results.get(team.friend.id)?.won !== false) return;
    battle.lose();
  }

  updateTeam() {
    const { battle } = this;
    if (!battle.friend) return;
    this.friends.sendMove('ship', shipWire(battle), this.sinceGo);
    if (battle.runs && battle.state === 'sailing') this.friends.sendMove('foes', battle.wire(), this.sinceGo);
  }

  /** The duel's clock, and where the child's ship is, for the friend's game. */
  updateDuel(dt) {
    const { battle, duel } = this;
    if (battle.state === 'sailing') {
      duel.tick(dt);
      // Once the friend has finished, or gone, there's nobody to sail against.
      if (duel.over || !battle.friend || this.friends.results.has(duel.friend.id)) battle.stop();
    }
    this.friends.sendMove('ship', shipWire(battle), this.sinceGo);
  }

  /** One of the child's balls hit the friend's ship, as this game saw it: a point, which their game hears. */
  scored() {
    const { duel } = this;
    if (!duel) return;
    this.friends.sendHit({ r: 1, m: 'ball', d: 1, tot: duel.scored() }, this.sinceGo);
  }

  /**
   * Something from the friend's game. In a duel: where their ship is, or a hit it says it made. Together: where
   * their ship is, and from the game that runs the pirates, where those and their cannonballs are, or to it, a
   * hit the friend's ball has made on one.
   */
  fromFriend(id, message) {
    const { duel, team, battle } = this;
    if (team) {
      if (id !== team.friend.id) return;
      if (message.t === 'ship') this.friendTrack?.push(message, performance.now());
      else if (message.t === 'foes' && this.session.screen === 'playing') battle.follow(message);
      else if (message.t === 'tag' && this.session.screen === 'playing') battle.friendTagged(message.k, message.n);
      return;
    }
    if (!duel || id !== duel.friend.id) return;
    if (message.t === 'ship') {
      this.friendTrack?.push(message, performance.now());
    } else if (message.t === 'hit') {
      const fresh = duel.heard(message.tot);
      // It shows on the child's ship as one of theirs lands, while it's being played.
      if (fresh > 0 && this.session.screen === 'playing') this.battle.struck(fresh);
    }
  }

  /**
   * The friend has gone, in the middle, and their ship goes with them. A duel is over for the child. Together,
   * the child carries on against the pirates by themselves, with half the hits still to make: see team.js.
   */
  friendGone(friend) {
    const { duel, team, battle, session } = this;
    if (team && friend.id === team.friend.id) {
      battle.friendGone();
      team.alone = true;
      this.showCaptains();
      return;
    }
    if (!duel || friend.id !== duel.friend.id) return;
    battle.removeFriend();
    if (session.screen === 'playing') battle.stop();
  }

  /** The two scores and the time, along the top, with the friend's name and face. */
  showDuel() {
    const { duel } = this;
    if (!duel) return;
    const portraits = this.session.portraits ?? {};
    // The child's own ship is Giraffe's, and the friend's is in their character's colours.
    byElement('duel-my-face').src = portraits.giraffe ?? '';
    byElement('duel-their-face').src = portraits[duel.friend.spec.id] ?? '';
    byElement('duel-their-name').textContent = duel.friend.spec.name;
  }

  /** Who's speaking, with their picture and their words, which never holds anything up. */
  say(who, text, { ifQuiet = false } = {}) {
    const { sound } = this.session;
    if (ifQuiet && (sound.currentVoice || this.storyLeft > 0)) return false;
    this.story.say(who, text, { quietly: ifQuiet });
    if (ifQuiet) sound.say(text, { ifQuiet: true });
    this.storyLeft = STORY_SECONDS;
    return true;
  }

  /** A captain says their one line as they come near, as long as nobody else is talking. */
  updateStory(dt) {
    const { battle } = this;
    if (this.storyLeft > 0) {
      this.storyLeft -= dt;
      if (this.storyLeft <= 0) this.story.hide();
    }
    this.nextCaptainIn -= dt;
    if (this.nextCaptainIn > 0 || battle.state !== 'sailing' || battle.resting) return;
    // The little rafts a raft comes apart into are the same captain's, who has had their say.
    const pirate = battle.afloat.find((each) => !each.spoke && !each.little && Math.hypot(each.x - battle.x, each.z - battle.z) < CAPTAIN_SPEAKS_WITHIN);
    if (!pirate) return;
    const who = this.order[pirate.index % this.order.length];
    if (this.say(who, CAPTAINS[who], { ifQuiet: true })) {
      pirate.spoke = true;
      this.nextCaptainIn = CAPTAIN_SPEAKS_EVERY;
    }
  }

  /* ---------- what to do ---------- */

  /** A film of what to do, until the child has got the idea, and again if they seem stuck. */
  updateHelp(dt, snapshot) {
    const { battle, session } = this;
    const turning = Math.abs(snapshot.steer) > WHEEL_USED_FROM;
    if (snapshot.handOpen) this.openFor += dt;
    if (turning) this.wheelFor += dt;
    this.sinceWheel = turning ? 0 : this.sinceWheel + dt;
    this.sinceFired = battle.firing ? 0 : this.sinceFired + dt;

    const needsSails = this.openFor < SAILS_LEARNED_SECONDS || session.closedSeconds > CLOSED_STUCK_SECONDS;
    const needsWheel = this.wheelFor < WHEEL_LEARNED_SECONDS || (this.sinceWheel > WHEEL_STUCK_SECONDS && this.sinceFired > WHEEL_STUCK_SECONDS);
    const part = needsSails ? 'sails' : needsWheel ? 'wheel' : null;
    this.filmHeld -= dt;
    if (part !== this.film && (this.filmHeld <= 0 || part)) {
      this.film = part;
      this.filmHeld = FILM_SHOWN_AT_LEAST;
      document.body.dataset.film = part ? 'on' : 'off';
      if (part) document.body.dataset.filmPart = part;
      if (part === 'wheel') this.wheelPromptLeft = WHEEL_PROMPT_SECONDS;
    }
    if (this.film === 'wheel' && snapshot.handOpen) this.wheelPromptLeft -= dt;
    if (this.showingBeside) this.besideShown += dt;
    if (this.sinceFired > BESIDE_AGAIN_AFTER) this.besideShown = 0;
  }

  prompt(snapshot, dt) {
    const { session, battle } = this;
    this.showingBeside = false;
    const needed = session.handsPrompt(snapshot, dt);
    if (needed && !needed.key.startsWith('closed')) return needed;
    if (battle.state !== 'sailing') return null;
    if (!snapshot.handOpen) {
      if (session.closedSeconds > RESTING_PROMPT_AFTER) return { key: 'rest', text: SPOKEN.resting, side: null };
      if (session.closedSeconds > OPEN_PROMPT_AFTER) return { key: 'open-to-sail', text: OPEN_TO_SAIL, side: null, asks: 'open' };
      return null;
    }
    if (battle.atLimit > LIMIT_PROMPT_FROM) return { key: 'limit', text: TURN_BACK, side: null };
    if (this.film === 'wheel' && this.wheelPromptLeft > 0) return { key: 'turn-wheel', text: TURN_WHEEL, side: null };
    // A friend's ship on the child's side isn't one to sail beside and fire at.
    const pirateNear = battle.afloat.some((each) => !each.ally);
    if (pirateNear && session.playSeconds > BESIDE_AFTER_SECONDS && this.sinceFired > BESIDE_AFTER_SECONDS && this.besideShown < BESIDE_SHOWN_FOR) {
      this.showingBeside = true;
      return { key: 'beside', text: SAIL_BESIDE, side: null };
    }
    return null;
  }

  /* ---------- what's new, the first time it's seen ---------- */

  /**
   * A label with a new thing's name over it, the first time it's seen in a battle at the level that
   * brings it. where() says where it is in the world now. Things from the levels before aren't named
   * again, so that there are never many at once.
   */
  firstSeen(key, where, item = newsFor(key)) {
    const newHere = newsAt(this.battle.levelNumber).some((news) => news.key === (key === 'chest' ? 'keys' : key));
    if (!item || !newHere || this.labelled.has(key)) return;
    this.labelled.add(key);
    const root = document.createElement('div');
    root.className = 'bay-label';
    root.dataset.key = key;
    root.innerHTML = `<span class="bay-label-mark" aria-hidden="true">${item.mark}</span><span class="bay-label-name"></span>`;
    this.labelHolder.append(root);
    const label = { key, root, item, where, left: LABEL_SECONDS, waits: LABEL_WAITS, ka: null };
    this.nameLabel(label);
    this.labels.push(label);
  }

  /** A label's words, in the language the voice speaks, which can change in the middle of a battle. */
  nameLabel(label) {
    const ka = this.session.settings.language === 'ka';
    if (label.ka === ka) return;
    label.ka = ka;
    label.root.querySelector('.bay-label-name').textContent = ka && label.item.nameKa ? label.item.nameKa : label.item.name;
  }

  /** A new kind of pirate ship, or one towing a sailor, the first time one comes. */
  labelPirate(pirate) {
    const { plan } = this.battle;
    const where = () => (pirate.state === 'gone' ? null : { x: pirate.x, y: 34 * (pirate.kind === 'king' ? 1.4 : 1), z: pirate.z });
    const kind = KIND_NEWS[pirate.kind];
    if (kind && plan[kind]) this.firstSeen(kind, where);
    // Over the cage it tows, behind it.
    if (pirate.cage) this.firstSeen('sailors', () => (pirate.state === 'gone' ? null : { x: pirate.x - Math.sin(pirate.heading) * 30, y: 14, z: pirate.z + Math.cos(pirate.heading) * 30 }));
  }

  /** A new kind of prize or power-up, the first time one is dropped. */
  labelPrize(prize) {
    // Once it's picked up, its name stays over the child's ship for the rest of its time.
    const where = () => (prize.left > 0 ? { x: prize.x, y: 15, z: prize.z } : prize.taken ? { x: this.battle.x, y: 30, z: this.battle.z } : null);
    if (prize.kind === 'power') this.firstSeen(prize.power, where);
    else if (prize.kind === 'chest') this.firstSeen('chest', where, CHEST_NAME);
    else if (PRIZE_NEWS[prize.kind]) this.firstSeen(PRIZE_NEWS[prize.kind], where);
  }

  updateLabels(dt) {
    const { bay } = this;
    const placed = [];
    // Names wait until "GO!" has gone, and only start counting down then.
    const afterGo = this.session.playSeconds > NAMES_AFTER_SECONDS;
    for (const label of this.labels) {
      if (!afterGo) {
        label.root.style.opacity = '0';
        continue;
      }
      this.nameLabel(label);
      const at = label.where();
      const on = at ? bay.project(at.x, at.y, at.z) : null;
      const visible = on && !on.behind && on.x > 40 && on.x < bay.width - 40 && on.y > 0 && on.y < bay.height;
      // Its time only starts once it can be seen, unless it's taken too long, or what it's on has gone.
      const started = label.left < LABEL_SECONDS;
      label.waits -= dt;
      if (started || visible || label.waits <= 0 || !at) label.left -= dt;
      // It fades in and out slowly, never blinking.
      const fade = Math.min(1, (LABEL_SECONDS - label.left) / LABEL_FADE, label.left / LABEL_FADE);
      label.root.style.opacity = visible ? Math.max(0, fade).toFixed(2) : '0';
      if (visible) {
        // Two near each other go one above the other, rather than on top of each other.
        const x = Math.round(on.x);
        let y = Math.round(clamp(on.y, 90, bay.height - 40));
        while (placed.some((other) => Math.abs(other.x - x) < 190 && Math.abs(other.y - y) < 38)) y -= 40;
        placed.push({ x, y });
        label.root.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      }
      if (label.left <= 0) label.root.remove();
    }
    this.labels = this.labels.filter(({ left }) => left > 0);
  }

  clearLabels() {
    for (const label of this.labels ?? []) label.root.remove();
    this.labels = [];
    this.labelled = new Set();
  }

  /** Along the top, only the prizes this level has. */
  showPrizeCounts() {
    const { plan } = this.battle;
    const holder = byElement('bay-prizes');
    let any = false;
    for (const { id, plan: key, top } of PRIZE_COUNTS) {
      if (top === false) continue;
      const pill = holder.querySelector(`[data-kind="${id}"]`);
      pill.hidden = !plan[key];
      any ||= plan[key];
    }
    holder.dataset.on = any ? 'yes' : 'no';
    this.measureTop();
  }

  /**
   * The story box goes under the prizes along the top, wherever they end: on a narrow window, or with
   * a long name in Georgian, they can need a second row.
   */
  measureTop() {
    const bottom = Math.round(document.querySelector('.hud-top')?.getBoundingClientRect().bottom ?? 0);
    if (bottom > 0 && bottom !== this.topBottom) {
      this.topBottom = bottom;
      document.documentElement.style.setProperty('--hud-bottom', `${bottom}px`);
    }
  }

  /* ---------- what's on the screen ---------- */

  buildWheel() {
    this.wheel = byElement('ship-wheel');
    this.wheelTurn = byElement('ship-wheel-turn');
  }

  updateWheel(snapshot) {
    const hand = snapshot[snapshot.side];
    const state = hand.status === 'missing' ? 'missing' : snapshot.handOpen ? 'open' : 'closed';
    if (this.lastShown.hand !== state) {
      this.lastShown.hand = state;
      this.wheel.dataset.hand = state;
    }
    const degrees = Math.round(this.battle.wheel * WHEEL_TURNS_DEGREES);
    if (this.lastShown.wheel !== degrees) {
      this.lastShown.wheel = degrees;
      this.wheelTurn.style.transform = `rotate(${degrees}deg)`;
    }
  }

  buildCaptainsRow() {
    const row = byElement('bay-captains');
    row.replaceChildren();
    // Together with a friend, their ship is in the order too, after the captains, and isn't one of them.
    this.captainFaces = (this.captains ?? this.order).map((id) => {
      const face = document.createElement('img');
      face.className = 'captain-face';
      face.alt = '';
      face.src = this.session.portraits?.[id] ?? '';
      face.dataset.who = id;
      row.append(face);
      return face;
    });
  }

  /** A row of the captains: those still to come are faint, and those beaten have a tick. */
  showCaptains() {
    const { battle } = this;
    const afloat = new Set(battle.afloat.map(({ index }) => index));
    this.captainFaces.forEach((face, index) => {
      face.dataset.state = index < battle.nextPirate ? (afloat.has(index) ? 'here' : 'beaten') : 'coming';
    });
  }

  /** With a friend, each ship's hits and the time left, with whoever's ahead picked out. */
  updateDuelHud() {
    const { duel, lastShown } = this;
    const { mine, theirs } = duel;
    const shown = `${mine}:${theirs}:${clock(duel.left)}`;
    if (lastShown.duel === shown) return;
    lastShown.duel = shown;
    byElement('duel-mine').textContent = String(mine);
    byElement('duel-theirs').textContent = String(theirs);
    byElement('duel-time').textContent = clock(duel.left);
    byElement('duel-mine-chip').classList.toggle('is-ahead', mine > theirs);
    byElement('duel-theirs-chip').classList.toggle('is-ahead', theirs > mine);
  }

  updateHud() {
    const { battle, lastShown } = this;
    if (this.duel) this.updateDuelHud();
    const { left, hearts } = battle;
    const { gold } = battle.stats;
    if (lastShown.left !== left) {
      lastShown.left = left;
      byElement('bay-left').textContent = String(left);
    }
    if (lastShown.gold !== gold) {
      lastShown.gold = gold;
      byElement('bay-gold').textContent = String(gold);
    }
    if (lastShown.hearts !== hearts) {
      lastShown.hearts = hearts;
      byElement('hearts').textContent = '♥'.repeat(Math.max(0, hearts)) + '♡'.repeat(Math.max(0, HEARTS - Math.max(0, hearts)));
    }
    for (const { id, stat, top } of PRIZE_COUNTS) {
      if (top === false || lastShown[id] === battle.stats[stat]) continue;
      lastShown[id] = battle.stats[stat];
      byElement(`bay-${id}`).textContent = String(battle.stats[stat]);
    }
    // The power-up going, with its name and a bar that runs down.
    const power = battle.state === 'sailing' ? battle.power : null;
    const kind = power?.kind ?? null;
    // Its name follows the voice's language, even if that's changed in the middle of a battle.
    const ka = this.session.settings.language === 'ka';
    if (lastShown.power !== kind || lastShown.powerKa !== ka) {
      lastShown.power = kind;
      lastShown.powerKa = ka;
      const pill = byElement('bay-power');
      pill.hidden = !kind;
      if (kind) {
        const item = newsFor(kind);
        pill.dataset.kind = kind;
        byElement('bay-power-mark').textContent = item.mark;
        byElement('bay-power-name').textContent = ka ? item.nameKa : item.name;
      }
      this.measureTop();
    }
    if (power) {
      const share = Math.round((power.left / power.total) * 100);
      if (lastShown.powerShare !== share) {
        lastShown.powerShare = share;
        byElement('bay-power-fill').style.width = `${share}%`;
      }
    }
  }

  shakeHearts() {
    const hearts = byElement('hearts');
    hearts.classList.remove('is-hurt');
    void hearts.offsetWidth;
    hearts.classList.add('is-hurt');
  }

  buildMarks() {
    const holder = byElement('marks');
    // As many as there can ever be at once, which is more on the higher levels.
    this.marks = Array.from({ length: MOST_MARKS }, () => {
      const root = document.createElement('div');
      root.className = 'mark';
      root.dataset.where = 'none';
      const face = document.createElement('img');
      face.className = 'mark-face';
      face.alt = '';
      const bar = document.createElement('span');
      bar.className = 'mark-bar';
      const fill = document.createElement('span');
      fill.className = 'mark-fill';
      bar.append(fill);
      const arrow = document.createElement('span');
      arrow.className = 'mark-arrow';
      // What it carries or is, on the higher levels: the key, a sailor to rescue, or the king's crown.
      const badge = document.createElement('span');
      badge.className = 'mark-badge';
      // A friend's name, over their ship, in place of a pirate's health.
      const name = document.createElement('span');
      name.className = 'mark-name';
      root.append(bar, face, arrow, badge, name);
      holder.append(root);
      return { root, face, fill, arrow, badge, name, pirate: null };
    });
  }

  /** Over each ship that can be seen, its captain and health. For one that can't, an arrow says which way to steer. */
  updateMarks() {
    const { battle, bay, marks } = this;
    const pirates = battle.afloat;
    const { width, height } = bay;
    marks.forEach((mark, index) => {
      const pirate = pirates[index];
      if (!pirate) {
        mark.root.dataset.where = 'none';
        mark.pirate = null;
        mark.badge.textContent = '';
        return;
      }
      if (mark.pirate !== pirate) {
        mark.pirate = pirate;
        // A friend's ship has their face and their name over it.
        const friend = pirate.friend ? (this.duel ?? this.team)?.friend.spec : null;
        mark.face.src = this.session.portraits[friend?.id ?? this.order[pirate.index % this.order.length]] ?? '';
        mark.name.textContent = friend?.name ?? '';
        mark.root.dataset.kind = pirate.kind;
        mark.root.dataset.friend = friend ? 'yes' : 'no';
        // A friend on the child's side has their ship's blue round their face and name.
        mark.root.dataset.ally = pirate.ally ? 'yes' : 'no';
      }
      const badge = pirate.key ? '🗝️' : pirate.cage ? '🛟' : pirate.kind === 'king' ? '👑' : '';
      if (mark.badge.textContent !== badge) mark.badge.textContent = badge;
      const firedOn = battle.zones.left.target === pirate || battle.zones.right.target === pirate;
      const hidden = pirate.under || pirate.smoke > 0;
      mark.root.dataset.state = hidden ? 'hidden' : firedOn && battle.firing ? 'fired-on' : pirate.mode === 'side' ? 'hunting' : 'sailing';
      if (!pirate.friend) mark.fill.style.width = `${Math.round((pirate.hitsLeft / pirate.maxHits) * 100)}%`;
      const seen = bay.project(pirate.x, 47, pirate.z);
      const low = bay.project(pirate.x, 0, pirate.z);
      if (!seen.behind && !low.behind && low.x > 0 && low.x < width && low.y > 0 && low.y < height) {
        mark.root.dataset.where = 'on';
        mark.root.style.transform = `translate(${Math.round(seen.x)}px, ${Math.round(clamp(seen.y, 70, height))}px)`;
        return;
      }
      // Round the edge of the screen, which way to turn. Behind is out at a bottom corner, rather than
      // in the middle where the ship is, so that it still says left or right.
      const off = bay.offCamera(pirate.x, pirate.z);
      const shown = clamp(off, -2.1, 2.1);
      const x = width / 2 + Math.sin(shown) * (width / 2 - MARK_MARGIN);
      const y = clamp(height / 2 - Math.cos(shown) * (height / 2 - MARK_MARGIN), MARK_TOP, height - MARK_MARGIN);
      mark.root.dataset.where = 'off';
      mark.root.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      mark.arrow.style.transform = `rotate(${Math.round((shown * 180) / Math.PI - 90)}deg)`;
    });
  }
}

new GameSession({
  // What the open and closed hand do here, for the hand shapes in the grown-ups' panel: see core/shapes.js.
  moves: { open: 'Raise the sails', closed: 'Lower the sails' },
  shell: {
    title: 'Cannon Bay',
    startLabel: 'Set sail!',
    againLabel: 'Sail again',
    finishTitle: WON,
    heroMark: '⚓',
    heroNoun: 'pirate ships beaten',
    extraRows: [
      { id: 'beaten', label: 'Ships beaten' },
      { id: 'gold', label: 'Gold picked up' },
      { id: 'prizes', label: 'Prizes' },
    ],
    hudTop: `
      <div class="hud-top">
        <div class="chips">
          <div class="chip bay-solo"><span class="chip-label">Pirates left</span><span id="bay-left" class="chip-value">6</span></div>
          <div class="chip bay-gold bay-solo"><span class="chip-label">Gold</span><span id="bay-gold" class="chip-value">0</span></div>
          <div class="chip bay-hearts bay-solo"><span class="chip-label">Hearts</span><span id="hearts" class="chip-value">♥♥♥♥♥</span></div>
          <div id="duel-mine-chip" class="chip bay-duel bay-score is-mine"><span class="chip-label"><img id="duel-my-face" class="bay-score-face" alt="">You</span><span id="duel-mine" class="chip-value">0</span></div>
          <div id="duel-theirs-chip" class="chip bay-duel bay-score"><span class="chip-label"><img id="duel-their-face" class="bay-score-face" alt=""><span id="duel-their-name" class="bay-score-name"></span></span><span id="duel-theirs" class="chip-value">0</span></div>
          <div class="chip bay-duel"><span class="chip-label">Time</span><span id="duel-time" class="chip-value">3:00</span></div>
        </div>
        <div id="bay-prizes" class="bay-prizes" data-on="no">
          <span class="bay-prize" data-kind="gems" hidden><span aria-hidden="true">💎</span><b id="bay-gems">0</b></span>
          <span class="bay-prize" data-kind="sailors" hidden><span aria-hidden="true">🛟</span><b id="bay-sailors">0</b></span>
          <span class="bay-prize" data-kind="chests" hidden><span aria-hidden="true">🧰</span><b id="bay-chests">0</b></span>
          <span id="bay-power" class="bay-power" hidden><span id="bay-power-mark" aria-hidden="true"></span><span id="bay-power-name"></span><span class="bay-power-bar"><span id="bay-power-fill"></span></span></span>
        </div>
      </div>
      <div id="bay-labels" class="bay-labels" aria-hidden="true"></div>
      <div id="bay-captains" class="bay-captains" aria-hidden="true"></div>
      <div id="marks" class="marks" aria-hidden="true"></div>
      ${STORY_BOX}
      <div id="ship-wheel" class="ship-wheel" data-hand="missing" aria-hidden="true">
        <svg viewBox="0 0 200 200">
          <circle class="wheel-state" cx="100" cy="100" r="96" />
          <g id="ship-wheel-turn" class="wheel-turn">
            <path class="wheel-spoke" d="M100 100V8M100 100V192M100 100H8M100 100H192M100 100L35 35M100 100L165 165M100 100L165 35M100 100L35 165" />
            <path class="wheel-spoke-light" d="M100 100V8M100 100V192M100 100H8M100 100H192M100 100L35 35M100 100L165 165M100 100L165 35M100 100L35 165" />
            <circle class="wheel-rim-ink" cx="100" cy="100" r="68" />
            <circle class="wheel-rim" cx="100" cy="100" r="68" />
            <circle class="wheel-rim-inner" cx="100" cy="100" r="68" />
            <circle class="wheel-hub" cx="100" cy="100" r="20" />
            <circle class="wheel-hub-middle" cx="100" cy="100" r="8" />
            <path class="wheel-top" d="M100 4l12 17H88z" />
          </g>
        </svg>
      </div>
      <div class="film" aria-hidden="true">
        <svg viewBox="0 0 220 220">
          <rect class="film-sky" width="220" height="108" />
          <rect class="film-water" y="96" width="220" height="124" />
          <g class="film-boat">
            <path class="film-mast" d="M74 92V22" />
            <path class="film-sail" d="M50 28h48l-4 52H54z" />
            <path class="film-hull" d="M34 86h82l-12 24H46z" />
          </g>
          <g class="film-small-wheel">
            <circle class="film-wheel-rim" cx="170" cy="56" r="27" />
            <path class="film-wheel-spokes" d="M170 22V90M136 56H204M146 32L194 80M194 32L146 80" />
            <circle class="film-wheel-hub" cx="170" cy="56" r="7" />
          </g>
          <g class="film-hand">
            <rect x="86" y="154" width="48" height="42" rx="16" />
            <path class="film-finger" d="M93 158V132" />
            <path class="film-finger" d="M105 154V120" />
            <path class="film-finger" d="M117 154V118" />
            <path class="film-finger" d="M128 158V128" />
            <path class="film-finger film-thumb" d="M134 178L152 162" />
          </g>
        </svg>
      </div>`,
    panelSettings: `
      <fieldset class="choice">
        <legend>Speed</legend>
        <label><input type="radio" name="bayPace" value="slow"> Slow</label>
        <label><input type="radio" name="bayPace" value="medium"> Medium</label>
        <label><input type="radio" name="bayPace" value="fast"> Fast</label>
      </fieldset>
      <fieldset class="choice">
        <legend>Cannons</legend>
        <label><input type="radio" name="bayCannons" value="open"> Only with an open hand</label>
        <label><input type="radio" name="bayCannons" value="always"> Always, as long as the hand can be seen</label>
      </fieldset>
      <fieldset class="choice">
        <legend>How hard the pirates fight</legend>
        <label><input type="radio" name="bayPirates" value="gentle"> Gentle: big firing zones, hearts stop at one, and the ship can’t be sunk</label>
        <label><input type="radio" name="bayPirates" value="medium"> Medium: the pirates can win, and get the treasure when the hearts run out</label>
        <label><input type="radio" name="bayPirates" value="tough"> Tough: smaller firing zones, and the pirates fire thick and fast</label>
      </fieldset>
      <fieldset class="choice">
        <legend>Ships to beat (together with a friend, each takes twice the hits. Against each other, the duel lasts 2, 3 or 4 minutes)</legend>
        <label><input type="radio" name="bayShips" value="4"> 4</label>
        <label><input type="radio" name="bayShips" value="6"> 6</label>
        <label><input type="radio" name="bayShips" value="9"> 9</label>
      </fieldset>
      <fieldset class="choice">
        <legend>With a friend</legend>
        <label><input type="radio" name="bayFriends" value="together"> Together: both ships against the pirates, side by side</label>
        <label><input type="radio" name="bayFriends" value="against"> Against each other: ship against ship, with no pirates</label>
      </fieldset>`,
  },
  defaults: DEFAULTS,
  choices: CHOICES,
  tagline: (side) => `Pirates have come for the island’s treasure! Open your ${side} hand to raise the sails, and move it to turn the wheel.`,
  finishLine: WON,
  lines: new URL('./audio/voice/lines.json', import.meta.url),
  portraits: () => renderPortraits(ROSTER),
  createSound: (options) => new BaySound(options),
  createGame: (session) => new CannonBay(session),
}).start();
