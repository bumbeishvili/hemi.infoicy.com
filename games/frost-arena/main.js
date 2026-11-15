// Frost Arena: a team match of tag with rifles in a snowy yard, seen through the player's own eyes. Blue, with
// Giraffe on it, against the computer's red. It's a shooter for players who know shooters, played with two hands in
// the air the way one is played with two thumbs on the glass of a phone. A closed hand is a thumb lifted, and does
// nothing. A hand that opens is a thumb put down where it opens, and dragged from there: the hand that isn't in
// play walks, sidesteps, backs away and sprints, and the hand in play looks round. A thumb held up fires on the
// hand in play, and changes the magazine on the other, with the drag still going. Both are drawn on the screen as
// they are on a phone, a pad and its knob at the bottom on each side, with the buttons beside them, so it's always
// plain what each hand is doing, and both are drawn on the camera's picture as the tracker sees them. What each
// hand drags with, and what fires, changes the magazine and sprints, can each be given to something else a hand
// can do with its fingers, under the gear icon, in the picker every game has for its hand shapes
// (core/mapping-ui.js).
//
// With friends, each on their own computer, up to four are in the same yard: together on the blue team against
// the computer's red team (team.js), or everyone for themselves (rivals.js), as whoever made the match chooses.
// See core/friends-ui.js for making and joining one.
//
// How the hands are read is in controls.js, the rules are in arena.js, and the picture is in yard.js.
import { renderPortraits } from '../../core/body/portraits.js';
import { byId as characterWithId, ROSTER } from '../../core/body/roster.js';
import { Track } from '../../core/friends.js';
import { FriendsPanel } from '../../core/friends-ui.js';
import { GameSession } from '../../core/session.js';
import { STORY_BOX, StoryBox } from '../../core/story.js';
import { ArenaSound } from './arena-sound.js';
import { HEALTH, LEVELS, MAGAZINE, Match, POWERS, RIFLES, TAGS_TO_WIN, newsAt } from './arena.js';
import { ACTIONS, BINDINGS, Controls, DRAGS, GESTURES, SENSITIVITY, readBinding } from './controls.js';
import { Rivals } from './rivals.js';
import { PLAYER_LOOKS, TROOPER_TRACK } from './squad.js';
import { TeamMatch } from './team.js';
import { Yard } from './yard.js';

// Each of these has a rendered voice file: see audio/voice/lines.json.
const GIRAFFE_STARTS = 'Tag the red team! I’m right beside you!';
const GIRAFFE_NICE = 'Nice one!';
const GIRAFFE_ONE_MORE = 'One more!';
const GIRAFFE_BACK = 'Back at our end! Off we go again!';
const FINISH = 'We won the match!';
const SO_CLOSE = 'So close!';
const PAUSED = 'Paused. Show your hands to play!';
const SHOW_OTHER = 'Show your other hand to walk!';
// With friends: nothing waits for anyone, so there's no pause to speak of, and against each other there's no
// Giraffe to say anything.
const HANDS_AWAY = 'Show your hands to play!';
const RIVALS_START = 'Everyone for themselves!';
const YOU_WON = 'You won the match!';
const GREAT_GAME = 'Great game!';

const STORY_SECONDS = 3.2; // How long a character's picture stays up after speaking.
const HOW_AT_MOST_SECONDS = 40; // How long the card that says what each hand does stays up, at most...
const WALKED_ENOUGH = 6; // ...and how far walked, how far turned and how many shots fired have it put away sooner.
const TURNED_ENOUGH = 1.2;
const SHOTS_ENOUGH = 4;
const OTHER_PROMPT_SECONDS = 4; // The walking hand out of the picture for this long is asked for.
const SPOKEN_AT_MOST = 2; // Each prompt is spoken this many times in a match, and read after that.
const NICE_EVERY = 3; // Giraffe only says well done for every third tag.
const SPOTTED_SECONDS = 3; // One of the other team that anyone on the player's has seen this lately has an arrow to them.
const HIT_SHOWN_SECONDS = 0.28; // The mark for a hit stays up this long after the last one, so it never blinks.
const FEED_SECONDS = 4.5; // How long who tagged whom stays up.
const FEED_LINES = 3;
const FROM_SECONDS = 1.1; // How long the mark for where a hit came from takes to fade.

// What's over the head of someone special on the other team, on the higher levels.
const BADGES = { shield: '🛡️', runner: '💨', captain: '🎖️' };
const AWAY = '✋'; // And beside a friend whose hands are out of the picture.

// With friends, each on their own computer: see core/friends-ui.js for what each of these is.
const ARENA_WORDS = {
  toggle: 'Play with friends',
  make: 'Make a match',
  codeLabel: 'A friend’s match code',
  codeName: 'Match code',
  how: 'Tell your friends the code. Then you all press <b>Join the team</b>, and it’s everyone for themselves.',
  // Together or against each other, as whoever made the match chooses: see teams in core/friends-ui.js.
  together: 'Together',
  against: 'Against each other',
  howTogether: 'Tell your friends the code. Then you all press <b>Join the team</b>, and tag the red team together.',
  leave: 'Leave this match',
  privacy: 'Only your name, whether you chose together or against each other, how hard and how many tags, where you are in the yard and which way you’re looking, which rifle you have and when it fires, how many hits and tags you make, how much you have left, and whether your hands are in the picture go to your friends. Together, the game of whoever made the match also sends where Giraffe and the red team are. The camera picture stays on this computer.',
  alone: 'Play on your own',
  full: 'That match already has 4 players.',
  lost: 'Can’t reach the match. Check the internet, then try again.',
  left: 'You’ve left the match.',
  badCode: 'A match code is 3 letters and numbers.',
  busy: 'Playing',
  still: 'still playing',
};
// What the numbers along the top are called: playing alone or together with friends, and against them.
const CHIP_LABELS = { alone: ['Blue', 'Red'], team: ['Blue', 'Red'], rivals: ['You', 'Friend'] };

const byId = (id) => document.getElementById(id);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// What each thing that can be given to a gesture is called, on its button and in the panel.
const ACTION_NAMES = { fire: 'Fire', reload: 'Reload', sprint: 'Sprint' };
// The two hands, for the panel: which is which goes by what they do, as the hand in play can be either.
const HANDS = [{ id: 'aim', name: 'The hand that looks round' }, { id: 'move', name: 'The hand that walks' }];
// A binding as the panel keeps it: see core/mapping.js.
const given = (binding) => {
  const read = readBinding(binding);
  return typeof read === 'string' ? read : { hand: read.hand, is: read.gesture };
};
// What the hands are given to do, for the panel's picker: what each drags with, and what fires, changes the
// magazine and sprints. The hand in play's drag is the game's open move, so it's the first row there.
const MAPPING = {
  legend: 'What each hand does, and how',
  lead: 'Each hand drags while it makes its shape, and is let go by any other. Firing, the magazine and sprinting can each be given to something else a hand can do, on either hand.',
  open: { options: DRAGS, hand: 'aim' },
  rows: [
    { id: 'walk', name: 'Walk', hand: 'move', options: DRAGS, fallback: 'open' },
    { id: 'fire', name: ACTION_NAMES.fire, hands: HANDS, options: Object.keys(GESTURES), fallback: given(BINDINGS.fire) },
    { id: 'reload', name: ACTION_NAMES.reload, hands: HANDS, options: [{ id: 'off', name: 'Nothing: an empty one changes itself', icon: 'none' }, ...Object.keys(GESTURES)], fallback: given(BINDINGS.reload) },
    { id: 'sprint', name: ACTION_NAMES.sprint, hands: HANDS, options: [{ id: 'stick', name: 'Walking hand right out forwards', icon: 'push' }, { id: 'off', name: 'Nothing: no sprinting', icon: 'none' }, ...Object.keys(GESTURES)], fallback: given(BINDINGS.sprint) },
  ],
};
// How a card says what a hand drags with, at the start of a line.
const DRAG_WORDS = { open: 'open it', point: 'point', two: 'show two fingers', three: 'show three fingers' };

class ArenaGame {
  chimeOnOpen = false; // Hands open and close all the time here, so a chime would be noise.
  bothHands = true; // Both hands are drawn on the camera's picture, as both are played with.

  constructor(session) {
    this.session = session;
    this.story = new StoryBox(session);
    this.yard = new Yard(byId('game'));
    this.controls = new Controls({ sensitivity: session.settings.arenaSens, bindings: this.bindings(), drags: this.drags() });
    this.match = null;
    this.preview = false;
    this.storyFor = 0;
    this.turned = 0;
    this.awayFor = 0;
    this.spokenTimes = new Map();
    this.lastPromptKey = null;
    this.tagsSaid = 0;
    this.shown = {};
    this.marks = [];
    this.feed = [];
    this.hitFor = 0;
    this.from = [];
    this.mode = 'alone'; // Or with friends: 'team', together against the red team, or 'rivals', against each other.
    this.tracks = new Map(); // Where each friend is, from what their game sends, by their id.
    this.goAt = 0;
    this.startPreview();
    // A match with friends, if someone makes or joins one.
    const { settings } = session;
    this.friends = new FriendsPanel({
      game: 'frost-arena',
      linkKey: 'arena',
      words: ARENA_WORDS,
      // Everyone here plays with Giraffe. The host's number of tags says how many win it, for each player
      // together or for the first to them against each other, and how hard they chose is how hard it is together.
      hello: () => ({ driver: 'giraffe', level: session.levels.current, length: settings.arenaWin, mode: settings.arenaHard }),
      // Together or against each other: a choice in the panel, which the friends box can change too.
      teams: {
        get: () => (settings.arenaFriends === 'against' ? 'against' : 'together'),
        set: (choice) => this.chooseTeams(choice),
      },
      screen: () => session.screen,
      portraits: () => session.portraits,
      onMove: (id, message) => this.fromFriend(id, message),
      onGone: (friend) => this.friendGone(friend),
      // Whoever made the most tags, and equal ones share the place.
      rank: (a, b) => b.dropped - a.dropped,
      resultText: ({ dropped }) => `${dropped} ${dropped === 1 ? 'tag' : 'tags'}`,
      startAfter: byId('start'),
      waitingBefore: byId('screen-finish'),
      resultsAfter: document.querySelector('#screen-finish .finish-hero'),
    });
    const game = this;
    this.debug = {
      yard: this.yard,
      controls: this.controls,
      get match() {
        return game.match;
      },
      get game() {
        return game;
      },
      get friends() {
        return game.friends;
      },
    };
  }

  settings() {
    // How hard and how many tags have names of their own, so nothing kept from the first version of the game,
    // which was for a child and couldn't be lost, is taken for a choice made in this one.
    const { arenaWin, arenaHard, arenaRifle, arenaAssist } = this.session.settings;
    return { tags: arenaWin, level: arenaHard, rifle: arenaRifle, assist: arenaAssist !== 'off' };
  }

  /** What each thing a player can do is given to, as it was chosen in the panel: see BINDINGS in controls.js. */
  bindings() {
    return Object.fromEntries(ACTIONS.map((action) => [action, this.session.given[action]]));
  }

  /** What each hand drags with: the hand in play with the game's open move's shape, and the other with its own. */
  drags() {
    return { aim: this.session.shapes.open.id, move: this.session.given.walk };
  }

  /**
   * On the camera's picture, the thumb and the finger it's pinched against are joined, on whichever hand has
   * something given to a pinch: see handLinks in core/session.js. The hand in play is the one that looks round.
   */
  handLinks() {
    const { aim, move } = this.controls.links();
    return { play: aim, other: move };
  }

  /**
   * The buttons go beside the hand each is given to, and the card that says what each hand does says what's
   * given to it, so both always say what was chosen.
   */
  showBindings() {
    const { bindings } = this.controls;
    const drags = { move: this.controls.move.drag, aim: this.controls.aim.drag };
    const other = (drag) => (drag === 'open' ? 'close it' : 'any other hand');
    const lines = {
      move: [`${DRAG_WORDS[drags.move]}, and drag: walk that way`, `${other(drags.move)}: stop`],
      aim: [`${DRAG_WORDS[drags.aim]}, and drag: look round`, `${other(drags.aim)}: let go, to drag again`],
    };
    if (bindings.sprint === 'stick') lines.move.push('right out forwards: sprint');
    for (const action of ACTIONS) {
      const binding = bindings[action];
      const button = byId(`button-${action}`);
      button.hidden = binding === 'off';
      // Sprinting by dragging right out is the walking hand's, and so is a magazine that only changes when it's empty.
      const hand = typeof binding === 'string' ? 'move' : binding.hand;
      const side = byId(`side-${hand}`);
      if (button.parentElement !== side) side.append(button);
      button.querySelector('.button-mark').textContent = typeof binding === 'string' ? '' : GESTURES[binding.gesture].mark;
      if (typeof binding !== 'string') lines[binding.hand].push(`${GESTURES[binding.gesture].words}: ${ACTION_NAMES[action].toLowerCase()}`);
    }
    for (const hand of ['move', 'aim']) {
      const list = byId(`how-${hand}`);
      list.replaceChildren(...lines[hand].map((text) => Object.assign(document.createElement('span'), { textContent: text })));
    }
  }

  /** The yard behind the title, with both teams about in it. Nothing's counted, and nothing's heard. */
  startPreview() {
    this.match = new Match({ ...this.settings(), level: 'gentle', onEvent: (event) => this.yard.onEvent(event) });
    this.match.begin();
    this.yard.setMatch(this.match);
    this.preview = true;
    this.buildMarks();
  }

  /** What each level brings that's new, for the cards: see NEWS in arena.js. */
  newAt(level) {
    return newsAt(level);
  }

  setHands() {
    this.controls.reset();
    this.showBindings();
    this.showControls(this.controls.out);
  }

  /**
   * Everything but the rifle and the number of tags can change in the middle of a match: those are for the next
   * one. With friends, how hard it is is the host's, for everyone, so only this player's own help with aiming
   * changes.
   */
  settingChanged(change = {}) {
    // The friends' games hear the host's number of tags, how hard, and whether it's together, for the next match.
    if (('arenaWin' in change || 'arenaHard' in change || 'arenaFriends' in change) && this.friends.room.inRoom) this.friends.room.tell(this.friends.hello());
    if ('arenaFriends' in change) this.friends.showTeams();
    this.controls.setSensitivity(this.session.settings.arenaSens);
    this.controls.setDrags(this.drags());
    this.controls.setBindings(this.bindings());
    this.showBindings();
    if (this.preview) return;
    const { level, assist } = this.settings();
    this.match.configure(this.mode === 'alone' ? { level, assist } : { assist });
  }

  /** Together or against each other, chosen in the friends box: kept with the other settings, and shown there. */
  chooseTeams(choice) {
    this.session.changeSettings({ arenaFriends: choice });
    const input = document.querySelector(`input[name="arenaFriends"][value="${choice}"]`);
    if (input) input.checked = true;
  }

  /** With friends, the start waits until they're ready too. */
  holdStart(go) {
    return this.friends.holdStart(go);
  }

  /** How long since "GO!", by the clock on the wall, for the friends' games. */
  get sinceGo() {
    return performance.now() - this.goAt;
  }

  /* ---------- a new match ---------- */

  /**
   * level, from 1 to 10, brings what the levels bring: see levelPlan in arena.js.
   *
   * With friends it's as whoever made the match chose. Together, everyone is on the blue team with Giraffe,
   * against a red team the host's game runs for all of them, as hard as the host chose. Against each other it's
   * everyone for themselves, with nobody played by the computer. Either way it's the plain match to the host's
   * number of tags, with this player's own rifle, help with aiming and way of holding it, and it doesn't move
   * anyone's own level on.
   */
  prepare(level = 1) {
    const { sound } = this.session;
    this.story.hide();
    this.storyFor = 0;
    this.turned = 0;
    this.awayFor = 0;
    this.spokenTimes.clear();
    this.lastPromptKey = null;
    this.tagsSaid = 0;
    this.preview = false;
    this.hitFor = 0;
    this.from = [];
    this.feed = [];
    byId('feed').replaceChildren();
    sound.lost = false;
    const friendly = this.friends.current;
    const others = friendly?.friends ?? [];
    this.mode = !others.length ? 'alone' : friendly.team ? 'team' : 'rivals';
    this.tracks = new Map(others.map((friend) => [friend.id, { slot: friend.slot, track: new Track(TROOPER_TRACK) }]));
    const onEvent = (event) => this.onEvent(event);
    if (this.mode === 'alone') {
      this.match = new Match({ ...this.settings(), levelNumber: level, onEvent });
    } else {
      const { rifle, assist } = this.settings();
      // Each friend by the name they typed, or by that of the character they look like here.
      const nameOf = (friend) => this.friends.room.members.find((member) => member.id === friend.id)?.name || characterWithId(PLAYER_LOOKS[friend.slot])?.name || '';
      const players = [{ slot: friendly.mySlot, name: '' }, ...others.map((friend) => ({ slot: friend.slot, name: nameOf(friend) }))];
      const shared = { slot: friendly.mySlot, players, tags: TAGS_TO_WIN.includes(friendly.length) ? friendly.length : TAGS_TO_WIN[1], rifle, assist, onEvent };
      this.match = this.mode === 'team' ? new TeamMatch({ ...shared, level: LEVELS[friendly.mode] ? friendly.mode : 'medium', runs: friendly.hosting, seed: friendly.seed }) : new Rivals(shared);
    }
    document.body.toggleAttribute('data-friends-race', Boolean(friendly));
    document.body.dataset.match = this.mode;
    const [first, second] = CHIP_LABELS[this.mode];
    byId('chip-blue-label').textContent = first;
    byId('chip-red-label').textContent = second;
    this.yard.setMatch(this.match);
    // The sensitivity and what each hand does are as they were last chosen: see settingChanged.
    this.controls.reset();
    this.showBindings();
    this.buildMarks();
    this.shown = {};
    byId('ammo-name').textContent = RIFLES[this.match.child.rifle].name;
    this.showHud();
    this.showControls(this.controls.out);
    document.body.dataset.sight = 'none';
    document.body.dataset.how = 'on';
  }

  begin() {
    const { sound } = this.session;
    this.goAt = performance.now();
    this.match.begin();
    sound.startMatch();
    // Against each other there's no Giraffe in the yard: it's said, and nobody's picture goes up.
    if (this.mode === 'rivals') sound.say(RIVALS_START);
    else this.sayAsGiraffe(GIRAFFE_STARTS);
  }

  /* ---------- what happens ---------- */

  onEvent(event) {
    this.yard.onEvent(event);
    const { sound } = this.session;
    const { match } = this;
    const { child } = match;
    const away = (trooper) => Math.hypot(trooper.x - child.x, trooper.z - child.z);
    const handlers = {
      shot: () => sound.shot(event.by.rifle, { mine: event.by === child, away: away(event.by) }),
      hit: () => {
        if (event.by === child) this.onHit();
        if (event.trooper === child) this.onHurt(event.by);
      },
      tagged: () => this.onTagged(event, away(event.trooper)),
      back: () => {
        if (event.trooper === child && this.mode !== 'rivals') this.sayAsGiraffe(GIRAFFE_BACK, { quietly: true });
      },
      // With friends: a hit of this player's on one of the red team goes to the game that runs them, and one on
      // a friend goes to that friend's game, which counts it.
      tag: () => this.friends.sendTag(event.id, event.hits),
      zap: () => this.friends.sendHit({ r: event.slot + 1, m: 'tag', d: 1, tot: event.hits, sm: event.rifle === 'm4' ? 1 : 0, sg: 0, sd: '' }, this.sinceGo),
      gone: () => this.buildMarks(),
      empty: () => sound.empty(),
      reload: () => {
        if (event.trooper === child) sound.reload();
      },
      bonk: () => {
        if (event.by === child) sound.bonk();
      },
      star: () => {
        this.showHud();
        this.bump('chip-stars-box');
      },
      'crate-got': () => sound.crate(),
      resting: () => {
        if (event.on) this.story.hide();
      },
      won: () => this.end(this.mode === 'rivals' ? YOU_WON : FINISH),
      lost: () => {
        sound.lost = true;
        this.end(SO_CLOSE);
      },
      // Against each other, someone else got to the tags first: nobody loses, and everyone has the tags they made.
      over: () => this.end(GREAT_GAME),
    };
    handlers[event.type]?.();
  }

  /** A shot of the player's has landed: a tick, and a mark at the middle of the sights that stays up while they keep landing. */
  onHit() {
    this.session.sound.hit();
    this.hitFor = HIT_SHOWN_SECONDS;
    document.body.dataset.hit = 'on';
  }

  /** One has landed on the player: a thump, the health bar shakes, and a mark at the edge of the sights says where from. */
  onHurt(by) {
    this.session.sound.hurt();
    const bar = byId('vitals');
    bar.classList.remove('is-hurt');
    void bar.offsetWidth;
    bar.classList.add('is-hurt');
    if (!by) return;
    const known = this.from.find((each) => each.by === by);
    if (known) known.left = FROM_SECONDS;
    else this.from.push({ by, left: FROM_SECONDS });
  }

  onTagged({ trooper, by }, away) {
    const { sound } = this.session;
    const { match } = this;
    const mine = by === match.child;
    sound.tagged({ mine, away });
    this.say(by, trooper);
    if (mine) document.body.dataset.hit = 'tag';
    // Against each other, the first number is this player's own tags, and the second whoever of the others has most.
    if (this.mode === 'rivals') {
      if (mine) this.bump('chip-blue-box');
      else if (by && by === match.leader) this.bump('chip-red-box');
      return;
    }
    if (trooper.team === match.child.team) {
      this.bump('chip-red-box');
      return;
    }
    this.bump('chip-blue-box');
    if (mine && this.mode === 'team') this.bump('chip-mine-box');
    if (match.left === 1) this.sayAsGiraffe(GIRAFFE_ONE_MORE, { quietly: true });
    else if (mine && match.left > 1) {
      this.tagsSaid += 1;
      if (this.tagsSaid % NICE_EVERY === 1) this.sayAsGiraffe(GIRAFFE_NICE, { quietly: true });
    }
  }

  /** Who tagged whom, in a line at the side for a few seconds, as shooters have. */
  say(by, trooper) {
    const { child } = this.match;
    const ka = this.session.settings.language === 'ka';
    const nameOf = (each) => {
      if (each === child) return ka ? 'შენ' : 'You';
      // A friend goes by the name they typed.
      if (each?.name) return each.name;
      const character = characterWithId(each?.who);
      return (ka ? character?.nameKa : character?.name) ?? '';
    };
    // Someone a friend's game says was tagged out by nobody this game knows of: there's nothing to say.
    if (!by || !trooper) return;
    const line = document.createElement('li');
    line.dataset.mine = String(by === child);
    for (const [each, role] of [[by, 'by'], [trooper, 'out']]) {
      const name = document.createElement('span');
      name.className = `feed-name is-${each.team === child.team ? 'blue' : 'red'} is-${role}`;
      name.textContent = nameOf(each);
      line.append(name);
      if (role === 'by') line.append(Object.assign(document.createElement('span'), { className: 'feed-mark', textContent: '▸' }));
    }
    const list = byId('feed');
    list.append(line);
    this.feed.push({ line, left: FEED_SECONDS });
    while (this.feed.length > FEED_LINES) this.feed.shift().line.remove();
  }

  /** A score that's gone up grows a little and settles, a move rather than a flash. */
  bump(id) {
    const chip = byId(id);
    chip.classList.remove('is-up');
    void chip.offsetWidth;
    chip.classList.add('is-up');
  }

  /** Giraffe says something, with his picture up for a moment. Quietly means only if nothing else is being said. */
  sayAsGiraffe(line, { quietly = false } = {}) {
    const { sound } = this.session;
    if (quietly && sound.currentVoice) return;
    this.story.say('giraffe', line);
    this.storyFor = STORY_SECONDS;
  }

  end(words) {
    const { session } = this;
    session.finishLine = words;
    document.querySelector('#screen-finish h2').textContent = session.translate(words);
    session.finish();
  }

  /* ---------- what's on the screen ---------- */

  /** The numbers: each team's tags along the top, and at the bottom how much the player has left, and what's in the rifle. */
  showHud() {
    const { match, shown } = this;
    if (!match || this.preview) return;
    const { child, score, goal } = match;
    const set = (key, value, apply) => {
      if (shown[key] === value) return;
      shown[key] = value;
      apply(value);
    };
    // Alone or together: the blue team's tags of those that win it, and the red team's. Against each other:
    // this player's own, and those of whoever of the others has most, by their name.
    const leader = this.mode === 'rivals' ? match.leader : null;
    set('blue', this.mode === 'rivals' ? match.mine : score[0], (value) => {
      byId('chip-blue').textContent = String(value);
      byId('race-progress-fill').style.width = `${Math.round(Math.min(1, value / goal) * 100)}%`;
    });
    set('goal', goal, (value) => {
      byId('chip-goal').textContent = `of ${value}`;
    });
    set('red', this.mode === 'rivals' ? (leader ? score[leader.number] : 0) : score[1], (value) => {
      byId('chip-red').textContent = String(value);
    });
    if (this.mode === 'rivals') {
      set('leader', leader?.name || CHIP_LABELS.rivals[1], (value) => {
        byId('chip-red-label').textContent = value;
      });
    }
    // Together, how many of the blue team's tags are this player's own.
    set('mine', this.mode === 'team' ? match.stats.tags : -1, (value) => {
      byId('chip-mine-box').hidden = value < 0;
      byId('chip-mine').textContent = String(Math.max(0, value));
    });
    const out = child.state !== 'in';
    set('health', out ? 0 : Math.ceil((child.health / HEALTH) * 50), (value) => {
      byId('health-fill').style.width = `${value * 2}%`;
      byId('health-number').textContent = String(Math.ceil(value * 2));
      byId('vitals').dataset.low = String(value > 0 && value <= 15);
    });
    const changing = child.reloadLeft > 0;
    set('rounds', changing ? 'changing' : child.rounds, (value) => {
      byId('ammo-rounds').textContent = value === 'changing' ? '··' : String(value);
      byId('ammo').dataset.state = value === 'changing' ? 'changing' : value === 0 ? 'empty' : value <= 8 ? 'low' : 'full';
    });
    // Changing a magazine, the ring round the reload button fills as it goes in.
    const through = changing ? 1 - child.reloadLeft / RIFLES[child.rifle].reload : 0;
    set('reloading', Math.round(through * 40), (value) => {
      byId('button-reload').style.setProperty('--through', String(value / 40));
    });
    // From the levels that have them: the player's gold stars, and whatever a crate has given them, running down.
    set('stars', match.plan.stars ? match.stats.stars : -1, (value) => {
      byId('chip-stars-box').hidden = value < 0;
      byId('chip-stars').textContent = String(Math.max(0, value));
    });
    const { power } = match;
    const on = power.doubleLeft > 0 ? 'double' : power.bootsLeft > 0 ? 'boots' : null;
    // In the language the voice speaks, which can be changed in the middle of a match.
    const ka = this.session.settings.language === 'ka';
    set('power', `${on} ${ka}`, () => {
      byId('chip-power-box').hidden = !on;
      if (!on) return;
      byId('chip-power-mark').textContent = POWERS[on].mark;
      byId('chip-power-name').textContent = ka ? POWERS[on].nameKa : POWERS[on].name;
    });
    if (on) {
      const left = power[`${on}Left`] / POWERS[on].seconds;
      set('power-left', Math.ceil(left * 20), (value) => {
        byId('chip-power').style.width = `${value * 5}%`;
      });
    }
  }

  /**
   * What each hand is doing, drawn as it is on a phone: a pad for each, bright while that hand is down and faint
   * while it's lifted, with its knob as far from the middle as the hand has been dragged, and the buttons, each
   * lit while it's held. out is what controls.js made of the hands this frame.
   */
  showControls(out) {
    const { shown } = this;
    const set = (key, value, apply) => {
      if (shown[key] === value) return;
      shown[key] = value;
      apply(value);
    };
    const place = (id, x, y) => {
      byId(id).style.transform = `translate(calc(-50% + ${Math.round(x * 100) / 100}px), calc(-50% + ${Math.round(y * 100) / 100}px))`;
    };
    const { stick, pad, buttons } = out;
    set('stick-state', stick.on ? 'on' : stick.seen ? 'seen' : 'off', (value) => {
      byId('stick').dataset.state = value;
    });
    set('stick-knob', `${stick.x.toFixed(2)} ${stick.y.toFixed(2)}`, () => place('stick-knob', stick.x * 34, stick.y * 34));
    for (const action of ACTIONS) {
      set(action, buttons[action], (value) => {
        byId(`button-${action}`).dataset.on = String(value);
      });
    }
    // How many hands the camera can see, for the frame round its picture: both, as it takes both to play.
    set('seen', out.hands, (value) => {
      document.body.dataset.seen = String(value);
    });
    set('pad-state', pad.on ? 'on' : pad.seen ? 'seen' : 'off', (value) => {
      byId('pad').dataset.state = value;
    });
    set('pad-knob', `${pad.x.toFixed(2)} ${pad.y.toFixed(2)}`, () => place('pad-knob', pad.x * 34, pad.y * 34));
  }

  /**
   * The sights, in the middle of the screen: four ticks that open as far as a shot can go off the middle of them
   * just now, so they close up standing still and open with firing, walking and sprinting. They turn red on
   * someone who can be hit.
   */
  showSight() {
    const { match, yard, shown } = this;
    const { child } = match;
    const state = child.state !== 'in' || match.resting ? 'none' : child.reloadLeft > 0 ? 'changing' : match.aimed ? 'on' : 'ready';
    if (shown.sight !== state) {
      shown.sight = state;
      document.body.dataset.sight = state;
    }
    // How far apart the ticks are, in pixels: the spread, as it looks from here.
    const gap = Math.round(clamp(yard.pixelsFor(child.spread), 4, 90));
    if (shown.gap !== gap) {
      shown.gap = gap;
      byId('sight').style.setProperty('--gap', `${gap}px`);
    }
  }

  /** A mark for each of the other players: their face, in their team's colour, with how much they have left. */
  buildMarks() {
    const holder = byId('arena-marks');
    holder.replaceChildren();
    const portraits = this.session.portraits ?? {};
    const { child } = this.match;
    this.marks = this.match.troopers.filter((trooper) => trooper !== child && trooper.state !== 'gone').map((trooper) => {
      const root = document.createElement('div');
      root.className = 'arena-mark';
      root.dataset.team = trooper.team === child.team ? 'blue' : 'red';
      root.dataset.where = 'none';
      root.innerHTML = '<span class="arena-mark-arrow"></span><img class="arena-mark-face" alt=""><span class="arena-mark-badge"></span><span class="arena-mark-bar"><span class="arena-mark-fill"></span></span><span class="arena-mark-name"></span>';
      root.querySelector('img').src = portraits[trooper.who] ?? '';
      // Someone special, on the higher levels, has a badge beside their face that says what they are.
      const badge = root.querySelector('.arena-mark-badge');
      badge.textContent = BADGES[trooper.part] ?? (trooper.champion ? '👑' : '');
      // A friend has their name under their face. It goes in as text, never as markup.
      root.querySelector('.arena-mark-name').textContent = trooper.name ?? '';
      holder.append(root);
      return { trooper, root, badge, fill: root.querySelector('.arena-mark-fill'), where: 'none', width: -1, away: false, spottedAt: -Infinity };
    });
  }

  /**
   * Over each player who can be seen, their face and how much they have left. One of the other team who's out of
   * view, but whom someone on the player's team has seen in the last few seconds, has their face at the edge of the
   * screen on the side they're on, with an arrow: where they were last known to be, and no more than that.
   */
  showMarks() {
    const { match, yard } = this;
    const { child } = match;
    const team = match.troopers.filter((each) => each.team === child.team && each.state === 'in');
    const edge = { left: 0, right: 0 };
    for (const mark of this.marks) {
      const { trooper, root } = mark;
      let where = 'none';
      let x = 0;
      let y = 0;
      if (trooper.state === 'in' && child.state === 'in') {
        if (trooper.team !== child.team && team.some((mate) => match.sees(mate, trooper))) mark.spottedAt = match.time;
        const on = yard.project(trooper.x, 2.25, trooper.z);
        const seen = !on.behind && on.x > 40 && on.x < yard.width - 40;
        if (seen) {
          // Only over someone the player can really see: nobody is given away behind a crate.
          where = match.sees(child, trooper) ? 'on' : 'none';
          x = on.x;
          y = clamp(on.y, 96, yard.height - 60);
        } else if (trooper.team !== child.team && match.time - mark.spottedAt < SPOTTED_SECONDS) {
          const side = yard.offView(trooper.x, trooper.z) >= 0 ? 'right' : 'left';
          where = side;
          x = side === 'right' ? yard.width - 46 : 46;
          y = yard.height * 0.38 + edge[side] * 74;
          edge[side] += 1;
        }
      }
      if (mark.where !== where) {
        mark.where = where;
        root.dataset.where = where;
      }
      if (where === 'none') continue;
      root.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      const width = Math.round((trooper.health / trooper.most) * 10);
      if (mark.width !== width) {
        mark.width = width;
        mark.fill.style.width = `${width * 10}%`;
      }
      // A friend whose hands are out of the picture has a hand beside their face: they're standing where they are.
      const away = !trooper.bot && Boolean(trooper.resting);
      if (mark.away !== away) {
        mark.away = away;
        mark.badge.textContent = away ? AWAY : '';
      }
    }
  }

  /** The mark for a hit fades once they stop landing, the lines about who tagged whom go, and so do the marks for where hits came from. */
  showFading(dt) {
    const { yard } = this;
    if (this.hitFor > 0) {
      this.hitFor -= dt;
      if (this.hitFor <= 0) document.body.dataset.hit = 'off';
    }
    for (const each of this.feed) each.left -= dt;
    while (this.feed.length && this.feed[0].left <= 0) this.feed.shift().line.remove();
    // Where hits have come from: a mark on a ring round the sights, on the side they came from, fading away.
    for (const each of this.from) each.left -= dt;
    this.from = this.from.filter(({ left }) => left > 0);
    const marks = byId('from').children;
    for (let index = 0; index < marks.length; index += 1) {
      const each = this.from[index];
      const mark = marks[index];
      if (!each) {
        if (mark.dataset.on !== 'false') mark.dataset.on = 'false';
        continue;
      }
      mark.dataset.on = 'true';
      mark.style.opacity = String(Math.round(clamp(each.left / FROM_SECONDS, 0, 1) * 20) / 20);
      mark.style.transform = `rotate(${Math.round((yard.offView(each.by.x, each.by.z) * 180) / Math.PI)}deg)`;
    }
  }

  /* ---------- every frame ---------- */

  update(dt, snapshot) {
    const { match, session, yard, controls } = this;
    const out = controls.update(snapshot, session.camera.aspect, performance.now(), dt, { slow: match.aimSlow() });
    if (this.mode !== 'alone') this.followFriends();
    match.update(dt, out);
    if (this.mode !== 'alone') this.tellFriends();
    // The match may have just finished.
    if (session.screen !== 'playing') return;
    yard.update(dt);
    this.showHud();
    this.showControls(out);
    this.showSight();
    this.showMarks();
    this.showFading(dt);
    const { child, stats } = match;
    session.sound.steps(child.speed, dt);
    this.turned += Math.abs(out.turn);
    this.awayFor = out.stick.seen ? 0 : this.awayFor + dt;
    if (this.storyFor > 0) {
      this.storyFor -= dt;
      if (this.storyFor <= 0) this.story.hide();
    }
    // The card that says what each hand does stays up until the player has walked, looked round and fired.
    const learning = (stats.walked < WALKED_ENOUGH || this.turned < TURNED_ENOUGH || stats.shots < SHOTS_ENOUGH) && session.playSeconds < HOW_AT_MOST_SECONDS;
    const how = learning ? 'on' : 'off';
    if (this.shown.how !== how) {
      this.shown.how = how;
      document.body.dataset.how = how;
    }
  }

  /* ---------- with friends ---------- */

  /** Each friend goes where their game last said they were, a moment ago, so they move smoothly. */
  followFriends() {
    const { match } = this;
    const now = performance.now();
    for (const { slot, track } of this.tracks.values()) match.placeFriend(match.playerAt(slot), track.at(now));
  }

  /**
   * Where this player is, for the friends' games, and from the game that runs Giraffe and the red team, where
   * those are. Ten times a second at most: see sendMove in core/friends.js.
   */
  tellFriends() {
    const { match, friends } = this;
    if (match.state !== 'playing') return;
    friends.sendMove('trooper', match.childWire(), this.sinceGo);
    if (this.mode === 'team' && match.runs) friends.sendMove('foes', match.wire(), this.sinceGo);
  }

  /** Something from a friend's game: where they are, where the host's game has the computer's players, or a hit. */
  fromFriend(id, message) {
    const { match, mode } = this;
    const friend = this.tracks.get(id);
    if (!friend || mode === 'alone' || this.preview) return;
    if (message.t === 'trooper') friend.track.push(message, performance.now());
    else if (message.t === 'foes' && mode === 'team') match.follow(message);
    else if (message.t === 'tag' && mode === 'team') match.friendTagged(friend.slot, message.k, message.n);
    // Against each other: r is which player was hit, by their place, from 1, and it's only theirs to count.
    else if (message.t === 'hit' && mode === 'rivals' && message.r - 1 === match.slot) match.hitBy(friend.slot, message.sm ? 'm4' : 'ak', message.tot);
  }

  /** A friend has gone in the middle, and is gone from the yard. The rest carry on: see friendGone in team.js and rivals.js. */
  friendGone(friend) {
    const known = this.tracks.get(friend.id);
    if (!known || this.mode === 'alone' || this.preview) return;
    this.match.friendGone(known.slot);
  }

  idle(dt, snapshot) {
    const { match, session, yard, controls } = this;
    const counting = session.screen === 'countdown';
    if (this.preview) {
      // Looking slowly round the yard, behind the title, with both teams about in it.
      match.update(dt, { turn: 0.24 * dt });
      if (match.state !== 'playing') this.startPreview();
    } else if (session.screen === 'finish') {
      match.update(dt);
    }
    yard.update(dt);
    if (counting) {
      // The hands go down during the countdown, so both pads are there at "GO!".
      this.showControls(controls.update(snapshot, session.camera.aspect, performance.now(), dt));
      this.showHud();
      this.showSight();
    }
  }

  render() {
    this.yard.render();
  }

  /** A prompt is read as long as it's up, and spoken only for the first few times. */
  once(key, text) {
    if (this.lastPromptKey !== key) {
      this.lastPromptKey = key;
      this.spokenTimes.set(key, (this.spokenTimes.get(key) ?? 0) + 1);
    }
    return { key, text, side: null, silent: this.spokenTimes.get(key) > SPOKEN_AT_MOST };
  }

  prompt(snapshot, dt) {
    const { session, match } = this;
    // With neither hand in the picture it's paused, and that's all there is to say. With friends nothing waits.
    if (match.resting) return this.mode === 'alone' ? this.once('paused', PAUSED) : this.once('away', HANDS_AWAY);
    const needed = session.handsPrompt(snapshot, dt);
    // A closed hand is a trigger pulled here, not a hand to be opened.
    if (needed && !needed.key.startsWith('closed')) {
      this.lastPromptKey = null;
      return needed;
    }
    if (this.awayFor > OTHER_PROMPT_SECONDS) return this.once('other', SHOW_OTHER);
    this.lastPromptKey = null;
    return null;
  }

  finished() {
    const { sound } = this.session;
    // The friends' finish cards fill in with how many tags this player made.
    if (this.friends.current) this.friends.finished(this.sinceGo, { n: this.match.stats.tags, w: 1 });
    sound.stopMatch();
    this.story.hide();
    document.body.dataset.sight = 'none';
    document.body.dataset.hit = 'off';
    document.body.dataset.how = 'off';
    for (const mark of this.marks) mark.root.dataset.where = 'none';
    this.friends.showResults();
  }

  summary() {
    const { match, mode } = this;
    const { stats, score, plan } = match;
    const { hands } = this.session.settings;
    // The card has a column for the hand in play, and everything goes in it.
    const aim = (value) => ({ left: hands === 'left' ? value : '', right: hands === 'right' ? value : '' });
    const move = aim;
    document.querySelector('.finish-hero').lastChild.textContent = stats.tags === 1 ? ' tag' : ' tags';
    // The prizes of the higher levels, in one row, with only those this level has.
    const prizes = [plan.stars && `🌟 ${stats.stars}`, plan.power && `📦 ${stats.crates}`, plan.trophy && stats.trophy && '🏆'].filter(Boolean).join('  ');
    byId('sum-left-prizes').closest('tr').hidden = !plan.stars;
    // Against each other there are no teams: the row for the score is this player's tags and the most anyone else made.
    byId('sum-left-score').closest('tr').firstElementChild.textContent = mode === 'rivals' ? 'You : the best of the others' : 'Blue : Red';
    const accuracy = stats.shots ? `${Math.round((stats.hits / stats.shots) * 100)}%` : '–';
    return {
      hero: stats.tags,
      noun: 'match',
      rows: {
        // Against each other: this player's tags, and those of whoever of the others made most.
        score: aim(mode === 'rivals' ? `${match.mine} : ${Math.max(0, ...match.friends.map((friend) => score[friend.number]))}` : `${score[0]} : ${score[1]}`),
        accuracy: aim(`${accuracy} of ${stats.shots}`),
        out: aim(String(stats.out)),
        walked: move(`${Math.round(stats.walked)} m`),
        magazines: move(String(stats.reloads)),
        prizes: aim(prizes),
      },
      won: match.state !== 'lost',
      // A match with friends doesn't move anyone's own level on.
      countsForLevel: !this.friends.current,
    };
  }
}

const choice = (name, value, label) => `<label><input type="radio" name="${name}" value="${value}"> ${label}</label>`;
const FROM_MARKS = '<i></i>'.repeat(4);
new GameSession({
  // What the hand in play does here with its open move's shape, and without it, for the panel, and everything
  // else the hands are given to do: see core/shapes.js and core/mapping.js.
  moves: { open: 'Look round', closed: 'Let go' },
  mapping: MAPPING,
  shell: {
    title: 'Frost Arena',
    startLabel: 'Join the team',
    againLabel: 'Play again',
    finishTitle: FINISH,
    heroMark: '⭐',
    heroNoun: 'tags',
    extraRows: [
      { id: 'score', label: 'Blue : Red' },
      { id: 'accuracy', label: 'Shots that hit' },
      { id: 'out', label: 'Times tagged out' },
      { id: 'walked', label: 'Walked' },
      { id: 'magazines', label: 'Magazines' },
      { id: 'prizes', label: 'Prizes' },
    ],
    hudTop: `
      <div class="hud-top">
        <div class="chips">
          <div id="chip-blue-box" class="chip chip-team is-blue"><span id="chip-blue-label" class="chip-label">Blue</span><span class="chip-value"><span id="chip-blue">0</span> <small id="chip-goal">of 10</small></span></div>
          <div id="chip-red-box" class="chip chip-team is-red"><span id="chip-red-label" class="chip-label">Red</span><span id="chip-red" class="chip-value">0</span></div>
          <div id="chip-mine-box" class="chip chip-mine" hidden><span class="chip-label">You</span><span id="chip-mine" class="chip-value">0</span></div>
          <div id="chip-stars-box" class="chip chip-stars" hidden><span class="chip-label">Stars</span><span class="chip-value"><span aria-hidden="true">🌟</span> <span id="chip-stars">0</span></span></div>
          <div id="chip-power-box" class="chip chip-bar" hidden><span class="chip-label"><span id="chip-power-mark" aria-hidden="true"></span> <span id="chip-power-name"></span></span><span class="chip-value"><span class="bar"><span id="chip-power" class="bar-fill is-power"></span></span></span></div>
        </div>
        <div class="race-progress" aria-hidden="true"><div id="race-progress-fill" class="race-progress-fill"></div></div>
      </div>
      ${STORY_BOX}
      <div id="arena-marks" class="arena-marks" aria-hidden="true"></div>
      <div id="sight" class="sight" aria-hidden="true"><i class="tick is-up"></i><i class="tick is-down"></i><i class="tick is-left"></i><i class="tick is-right"></i><i class="sight-dot"></i><i class="sight-hit"></i></div>
      <div id="from" class="from" aria-hidden="true">${FROM_MARKS}</div>
      <ul id="feed" class="feed" aria-hidden="true"></ul>
      <div class="pads" aria-hidden="true">
        <div id="side-move" class="pad-side is-move">
          <div id="stick" class="ring" data-state="off"><i id="stick-knob" class="knob"></i><span class="ring-word">Move</span></div>
          <div id="button-reload" class="button is-reload" data-on="false"><i class="button-mark"></i><span>Reload</span></div>
          <div id="button-sprint" class="button is-sprint" data-on="false"><i class="button-mark"></i><span>Sprint</span></div>
        </div>
        <div id="vitals" class="vitals" data-low="false">
          <div class="vital is-health"><span class="vital-mark">✚</span><span id="health-number" class="vital-number">100</span><span class="bar"><span id="health-fill" class="bar-fill is-health"></span></span></div>
          <div id="ammo" class="vital is-ammo" data-state="full"><span id="ammo-name" class="ammo-name">Kalashnikov</span><span id="ammo-rounds" class="vital-number">${MAGAZINE}</span><span class="ammo-of">/ ∞</span></div>
        </div>
        <div id="side-aim" class="pad-side is-aim">
          <div id="pad" class="ring" data-state="off"><i id="pad-knob" class="knob"></i><span class="ring-word">Look</span></div>
          <div id="button-fire" class="button is-fire" data-on="false"><i class="button-mark"></i><span>Fire</span></div>
        </div>
      </div>
      <div class="how" aria-hidden="true">
        <div class="how-side is-move"><b class="how-hand"></b><div id="how-move" class="how-lines"></div></div>
        <div class="how-side is-aim"><b class="how-hand"></b><div id="how-aim" class="how-lines"></div></div>
      </div>`,
    panelSettings: `
      <fieldset class="choice">
        <legend>Rifle</legend>
        ${choice('arenaRifle', 'ak', `${RIFLES.ak.name}: hits harder, and kicks more`)}
        ${choice('arenaRifle', 'm4', `${RIFLES.m4.name}: quicker, lighter and steadier`)}
      </fieldset>
      <fieldset class="choice">
        <legend>Sensitivity (how far the view turns as the hand is dragged)</legend>
        ${Object.keys(SENSITIVITY).map((key) => choice('arenaSens', key, key[0].toUpperCase() + key.slice(1))).join('')}
      </fieldset>
      <fieldset class="choice">
        <legend>Help with aiming</legend>
        ${choice('arenaAssist', 'on', 'On: the view turns less while the sights are on someone')}
        ${choice('arenaAssist', 'off', 'Off')}
      </fieldset>
      <fieldset class="choice">
        <legend>How hard</legend>
        ${choice('arenaHard', 'gentle', 'Easy: you can’t be tagged out, and the match can’t be lost')}
        ${choice('arenaHard', 'medium', 'Medium')}
        ${choice('arenaHard', 'tough', 'Tough')}
      </fieldset>
      <fieldset class="choice">
        <legend>Tags to win (together with friends, that many for each of you. Against each other, the first to them)</legend>
        ${TAGS_TO_WIN.map((tags) => choice('arenaWin', String(tags), String(tags))).join('')}
      </fieldset>
      <fieldset class="choice">
        <legend>With friends</legend>
        ${choice('arenaFriends', 'together', 'Together: everyone on the blue team, against the red team')}
        ${choice('arenaFriends', 'against', 'Against each other: everyone for themselves, with no red team')}
      </fieldset>`,
  },
  defaults: { arenaRifle: 'ak', arenaSens: 'medium', arenaAssist: 'on', arenaHard: 'medium', arenaWin: 10, arenaFriends: 'together' },
  choices: { arenaRifle: String, arenaSens: String, arenaAssist: String, arenaHard: String, arenaWin: Number, arenaFriends: String },
  // These go on to a game that's being played at once. The rest, and the level, start it again: see core/settings.js.
  atOnce: ['arenaSens', 'arenaRifle', 'arenaAssist'],
  tagline: (side) => `A team match, played like a shooter on a phone. Open your ${side} hand and drag it to look round, thumb up to fire. Your other hand walks.`,
  finishLine: FINISH,
  lines: new URL('./audio/voice/lines.json', import.meta.url),
  portraits: () => renderPortraits(ROSTER),
  createSound: (options) => new ArenaSound(options),
  createGame: (session) => new ArenaGame(session),
}).start();
