// Mighty Moves: a fighting game played with the whole body. The coach shows one move at a time,
// and the child's fighter makes its own move only when the child has done it. This file runs the
// fight from start to finish, on top of what the body games share in core/body/game.js. The coach
// is in coach.js, the rules are in fight.js and the stage is in arena.js.
//
// A child can fight the computer, or a friend on their own computer: each child's own computer watches
// them, and each of their fighter's moves goes across to the friend's: see fight.js and core/friends-ui.js.
// With a friend it's together, both of them against the computer's fighter, or against each other, as whoever
// made the fight chooses.
import { BODY_SAY, BodyGame, byElementId } from '../../core/body/game.js';
import { ICONS } from '../../core/body/icons.js';
import { viewProblem } from '../../core/body/reader.js';
import { ROSTER } from '../../core/body/roster.js';
import { mountBodyShell } from '../../core/body/shell.js';
import { Track } from '../../core/friends.js';
import { FriendsPanel } from '../../core/friends-ui.js';
import { Arena } from './arena.js';
import { BODY_KEYS, bodyFrom, bodyList } from '../../core/body/characters.js';
import { Coach } from './coach.js';
import { FightSound } from './fight-sound.js';
import { Fight } from './fight.js';
import { DEFENCES, EXERCISES, MOVES, NEW_THINGS, NPC_LEVELS, PRIZE_ORDER, RULES, fightLevel as fightLevelOf, levelHas, newThingsAt } from './moves.js';

const INTRO_SECONDS = 1.8;
const ROUND_WORD_SECONDS = 1;
const FIGHT_WORD_SECONDS = 0.8;
const AFTER_ROUND_SECONDS = 1.2;
const AFTER_FIGHT_SECONDS = 2.4;
const FEET_PROMPT_SECONDS = 2.5;
const OPEN_HAND_PROMPT_MS = 2500;
const NEW_THING_MS = 2400; // How long the label for something new stays up, the first time it's seen.
const PRIZE_FLIGHT_MS = 750;
const POWER_UPS = { shield: '🫧', glow: '⚡', helper: '🤝' };
// The coin emoji is silver and small, so in the fight a coin is drawn as a gold one instead.
const markHtml = (id) => (id === 'coin' ? '<span class="coin-mark"></span>' : NEW_THINGS[id].mark);

// The computer's strength is fightStrength, which came in when Medium became how the game comes. The old
// setting, kept from when Gentle was how it came and shared with Sky Wings, is left behind, so the game as
// it comes now reaches everyone.
const DEFAULTS = { moveSize: 'small', jumps: 'yes', fightStrength: 'medium', rounds: 3, fightFriends: 'together', fighter: 'giraffe' };
const CHOICES = { jumps: String, fightStrength: String, rounds: Number, fightFriends: String };
const ROUNDS = [1, 3];

// Fighting a friend, each on their own computer: see core/friends-ui.js for what each of these is.
const FIGHT_WORDS = {
  toggle: 'Fight a friend',
  make: 'Make a fight',
  codeLabel: 'A friend’s fight code',
  codeName: 'Fight code',
  how: 'Tell your friend the code. Then you both choose a fighter and press <b>Fight!</b>',
  // Together or against each other, as whoever made the fight chooses: see teams in core/friends-ui.js.
  teamLegend: 'How to fight',
  together: 'Together',
  against: 'Against each other',
  howTogether: 'Tell your friend the code. Then you both choose a fighter and press <b>Fight!</b>, and fight the computer side by side.',
  leave: 'Leave this fight',
  privacy: 'Only your name, who you fight as, whether you chose together or against each other, and how your fighter moves go to your friend. The camera picture stays on this computer.',
  alone: 'Fight the computer',
  full: 'That fight already has 2 fighters.',
  lost: 'Can’t reach the fight. Check the internet, then try again.',
  left: 'You’ve left the fight.',
  badCode: 'A fight code is 3 letters and numbers.',
  busy: 'Fighting',
  still: 'still fighting',
};
// A friend's fighter makes only the moves the friend does, so there are no computer's turns, and it hits as
// hard as their moves do.
const FRIEND_LEVEL = { name: 'Friend', every: Infinity, warning: 3, damage: 1, mercy: 0, defences: ['block'], moves: ['palm'] };
// A knockout waits this long for the server to say whose round it is, and then it's as this computer saw.
const KNOCKOUT_WAIT_MS = 3000;
// Fighting a friend, each child's body goes to the other's computer, for their fighter there to copy them.
const SEND_BODY_SCREENS = new Set(['intro', 'countdown', 'fight', 'roundend', 'break']);
const FRIEND_BODY = { lists: ['p'] };

// Every one of these has a rendered voice file: see audio/voice/lines.json.
const SAY = {
  choose: 'Choose your fighter!',
  fight: 'Fight!',
  knockout: 'Knockout!',
  youWin: 'You win!',
  roundYours: 'That round is yours!',
  roundTheirs: 'So close! You’ll get the next one!',
  fightLost: 'So close! What a fight!',
  takeBreath: 'Take a breath. Well done!',
  niceDodge: 'Nice dodge!',
  goodBlock: 'Good block!',
  openLeft: 'Open your left hand!',
  openRight: 'Open your right hand!',
  another: 'Let’s try another one!',
};
const ROUND_WORDS = { 1: 'Round one!', 2: 'Round two!', last: 'Final round!' };

class MightyMoves extends BodyGame {
  constructor() {
    super({
      defaults: DEFAULTS,
      choices: CHOICES,
      // These go on to a game that's being played at once. The rest, and the level, start it again.
      atOnce: ['jumps'],
      lines: new URL('./audio/voice/lines.json', import.meta.url),
      createSound: (options) => new FightSound(options),
    });
    this.fight = null;
    this.coach = null;
    this.timer = 0;
    this.opponentIndex = 1;
    this.lastNumbers = {};
    this.openHandUntil = 0;
    this.feetMissing = 0;
    this.closeUpScreens = new Set(['fight', 'countdown']);
    this.newShown = new Set();
    this.newQueue = [];
    this.newUntil = 0;
  }

  /** What each level brings that's new: see ARRIVES in moves.js. */
  newAt(level) {
    return this.newThings(level).map(({ mark, name, nameKa }) => ({ mark, name, nameKa }));
  }

  /** What's new at a level for this child: leaning isn't, on a strength that asks for it from the start. */
  newThings(level) {
    return newThingsAt(level, NPC_LEVELS[this.settings.fightStrength] ?? NPC_LEVELS.medium);
  }

  setUp() {
    this.arena = new Arena(byElementId('game'));
    this.stage = this.arena;
    // Only the move that was asked for counts, so a slow, careful one doesn't have to stand out.
    this.reader.slowStrikes = true;
    this.arena.setView('choose', { snap: true });
    this.buildTally();
    this.wireFightControls();
    // Fighting a friend, if a grown-up makes or joins a fight.
    this.friends = new FriendsPanel({
      game: 'mighty-moves',
      linkKey: 'fight',
      words: FIGHT_WORDS,
      hello: () => ({ driver: this.chosen?.id ?? this.settings.fighter, level: this.levels.current, length: this.settings.rounds }),
      screen: () => this.screen,
      portraits: () => this.portraits,
      onGone: (friend) => this.friendGone(friend),
      onMove: (id, message) => this.fromFriend(id, message),
      onRoom: () => this.showOpponent(),
      // Whoever won the fight, and then by rounds.
      rank: (a, b) => Number(b.won) - Number(a.won) || b.dropped - a.dropped,
      resultText: ({ dropped }) => `won ${dropped} ${dropped === 1 ? 'round' : 'rounds'}`,
      // With a friend, together or against each other: the grown-ups' choice, which the friends box can change too.
      teams: {
        get: () => (this.settings.fightFriends === 'against' ? 'against' : 'together'),
        set: (choice) => this.chooseTeams(choice),
      },
      startAfter: byElementId('start'),
      waitingBefore: byElementId('screen-finish'),
      resultsAfter: byElementId('finish-line'),
    });
  }

  debug() {
    const game = this;
    return {
      arena: this.arena,
      get fight() {
        return game.fight;
      },
      get coach() {
        return game.coach;
      },
      get friends() {
        return game.friends;
      },
      get newShown() {
        return [...game.newShown];
      },
    };
  }

  wireFightControls() {
    byElementId('start').addEventListener('click', () => {
      this.sound.unlock();
      this.setScreen('choose');
      this.sound.ready.then(() => {
        if (this.screen === 'choose') this.sound.say(SAY.choose);
      });
    });
    byElementId('next-opponent').addEventListener('click', () => this.pickOpponent(1));
    byElementId('fight-start').addEventListener('click', () => this.openCameraThen(() => this.beginBodyCheck()));
    byElementId('fight-again').addEventListener('click', () => this.playAgain());
    byElementId('other-fighter').addEventListener('click', () => {
      this.confetti.stop();
      this.arena.hideHelper();
      this.arena.resetRound();
      this.arena.setFighter('npc', null);
      this.arena.player.presenting = true;
      this.arena.player.hold('wave');
      this.arena.setView('choose');
      this.setScreen('choose');
    });
    byElementId('recheck').addEventListener('click', () => {
      byElementId('panel').close();
      if (this.camera.running) this.beginBodyCheck(this.screen === 'fight' ? 'resume' : 'start');
      else this.openCameraThen(() => this.beginBodyCheck());
    });
  }

  /** Together or against each other, chosen in the friends box: kept with the grown-ups' settings, and shown there. */
  chooseTeams(choice) {
    this.changeSettings({ fightFriends: choice });
    const input = document.querySelector(`input[name="fightFriends"][value="${choice}"]`);
    if (input) input.checked = true;
  }

  settingChanged(change) {
    if ('fightFriends' in change && this.friends) {
      if (this.friends.room.inRoom) this.friends.room.tell(this.friends.hello());
      this.friends.showTeams();
      this.showOpponent();
    }
    if ('moveSize' in change) this.reader.personal = { jump: null, squat: null, leg: null, hand: null };
    // What the cards say is new depends on the computer's strength.
    if ('fightStrength' in change) this.levelUi.refresh();
    if (!this.fight) return;
    if ('hands' in change) {
      this.fight.focusSide = this.settings.hands;
      this.coach.side = this.settings.hands;
    }
    if ('jumps' in change) this.coach.allowJumps = this.settings.jumps === 'yes';
  }

  showChosen(spec) {
    byElementId('chosen-signature').textContent = spec.signature;
    this.arena.setFighter('player', spec);
    this.arena.player.presenting = true;
    this.arena.player.facing = 0.14;
    this.arena.player.hold('wave');
    if (!this.opponent || this.opponent.id === spec.id) this.pickOpponent(this.opponent ? 1 : 0);
    // A friend sees who this child fights as.
    if (this.friends?.room.inRoom) this.friends.room.tell(this.friends.hello());
    this.showOpponent();
  }

  /**
   * In a fight against a friend, the opponent is the friend, as whoever they've chosen, and can't be changed. In
   * one together with them, it's one of the computer's fighters, the same for both, chosen as the fight starts.
   */
  showOpponent() {
    const { room } = this.friends ?? {};
    const friend = room?.inRoom ? room.members.find(({ id }) => id !== room.you) : null;
    const button = byElementId('next-opponent');
    button.disabled = Boolean(room?.inRoom);
    button.classList.toggle('is-friend', Boolean(room?.inRoom));
    const portrait = byElementId('opponent-portrait');
    if (room?.inRoom && this.friends.together) {
      portrait.hidden = true;
      byElementId('opponent-name').textContent = 'The computer';
      byElementId('opponent-change').textContent = friend ? 'You and your friend fight it together' : 'Not here yet. Send them the link.';
      return;
    }
    if (!room?.inRoom) {
      if (this.opponent) this.pickOpponent(0, this.opponent);
      byElementId('opponent-change').textContent = 'Tap to change';
      portrait.hidden = false;
      return;
    }
    const spec = ROSTER.find(({ id }) => id === friend?.driver) ?? null;
    portrait.hidden = !friend;
    if (friend) portrait.src = this.portraits?.[spec?.id ?? ROSTER[0].id] ?? '';
    byElementId('opponent-name').textContent = friend ? friend.name || spec?.name || 'Your friend' : 'Your friend';
    byElementId('opponent-change').textContent = friend ? 'Your friend' : 'Not here yet. Send them the link.';
  }

  /** The computer's fighter, the next one along, or a new one at random. keep shows the one already chosen. */
  pickOpponent(step = 0, keep = null) {
    const others = ROSTER.filter((spec) => spec.id !== this.chosen.id);
    if (keep) this.opponent = keep;
    else {
      if (step === 0) this.opponentIndex = Math.floor(Math.random() * others.length);
      else this.opponentIndex = (this.opponentIndex + step) % others.length;
      this.opponent = others[this.opponentIndex % others.length];
    }
    byElementId('opponent-portrait').src = this.portraits[this.opponent.id];
    byElementId('opponent-name').textContent = this.opponent.name;
  }

  /** Only what the coach asked for does anything: see coach.js. */
  onMoves(moves) {
    if (this.screen === 'fight') this.coach.onMoves(moves);
  }

  afterBodyCheck(then) {
    if (then === 'resume') this.setScreen('fight');
    else this.readyToFight();
  }

  /** Ready. With a friend, each waits for the other, and then both start together. */
  readyToFight() {
    const go = () => {
      if (this.screen === 'waiting') this.beginIntro();
    };
    if (this.friends.holdStart(go)) {
      this.prompt.clear();
      this.setScreen('waiting');
      return;
    }
    this.beginIntro();
  }

  /** Who the child is fighting: their friend's fighter, or the computer's. */
  get rivalSpec() {
    return this.rival?.spec ?? this.teamRival ?? this.opponent;
  }

  /**
   * Together with a friend, the computer's fighter is the same on both computers: one that's neither of theirs,
   * chosen by the number the server gives everyone as it starts.
   */
  teamOpponent(friendly, friend) {
    const others = ROSTER.filter((spec) => spec.id !== this.chosen.id && spec.id !== friend.spec.id);
    return others[Math.abs(friendly.seed ?? 0) % others.length];
  }

  /* ---------- the fight ---------- */

  beginIntro() {
    const { arena, settings } = this;
    // With a friend, it's the host's level and number of rounds, which doesn't move anyone's own level on.
    const friendly = this.friends.current;
    const friend = friendly?.friends[0] ?? null;
    // Together, the friend is on the child's side, and the two of them fight one of the computer's fighters.
    this.team = Boolean(friendly?.team && friend);
    this.ally = this.team ? friend : null;
    this.rival = this.team ? null : friend;
    this.teamRival = this.team ? this.teamOpponent(friendly, friend) : null;
    document.body.toggleAttribute('data-friends-race', Boolean(friendly));
    document.body.toggleAttribute('data-friends-team', this.team);
    const levelNumber = friendly ? friendly.level : this.startLevel();
    const rules = fightLevelOf(levelNumber);
    const champion = rules.champion && (!friendly || this.team);
    const rival = this.rivalSpec;
    arena.setFighter('player', this.chosen);
    arena.setFighter('npc', rival);
    arena.hideHelper();
    arena.resetRound();
    if (this.team) arena.showAlly(this.ally.spec);
    arena.setTheme(rules.theme);
    document.body.dataset.place = rules.theme;
    arena.setChampion(champion);
    arena.player.presenting = false;
    arena.setView('intro');
    arena.player.body.setExpression('happy', 2.5);
    arena.npc.body.setExpression('happy', 2.5);
    byElementId('versus-player').textContent = this.teamName();
    byElementId('versus-npc').textContent = champion ? `👑 ${rival.name}` : rival.name;

    this.fight = new Fight({
      rounds: friendly && ROUNDS.includes(friendly.length) ? friendly.length : settings.rounds,
      // Together, the computer is as strong as this child's own grown-up has set it, and can't knock them out.
      level: friendly && !this.team ? FRIEND_LEVEL : NPC_LEVELS[settings.fightStrength] ?? NPC_LEVELS.medium,
      levelNumber,
      focusSide: settings.hands,
      friend: Boolean(friendly) && !this.team,
      ally: this.team,
      onEvent: (event) => this.onFightEvent(event),
    });
    this.goAt = performance.now();
    this.friendWentAway = false;
    // The friend's body, from their computer, a moment behind, so that it moves smoothly.
    this.friendBody = friendly ? new Track(FRIEND_BODY) : null;
    // Rounds the server has said are someone's before this computer has got to them.
    this.settledEarly = new Map();
    clearTimeout(this.knockoutWait);
    this.coach = new Coach({
      fight: this.fight,
      reader: this.reader,
      side: settings.hands,
      allowJumps: settings.jumps === 'yes',
    });
    this.openHandUntil = 0;
    this.feetMissing = 0;
    this.wasResting = false;
    this.newShown = new Set();
    this.newQueue = [];
    this.hideNewThing();
    this.fillHud();
    this.updateTally();
    this.setScreen('intro');
    // The place is the first new thing to see, if it's new at this level.
    for (const theme of ['sunset', 'autumn', 'snow']) if (rules.theme === theme) this.firstSight(theme);
    this.timer = INTRO_SECONDS;
    setTimeout(() => {
      if (this.screen === 'intro') this.sound.say(this.chosen.shout);
    }, 150);
  }

  fillHud() {
    const { portraits, chosen } = this;
    const rival = this.rivalSpec;
    byElementId('player-portrait').src = portraits[chosen.id];
    byElementId('npc-portrait').src = portraits[rival.id];
    byElementId('player-name').textContent = this.teamName();
    byElementId('npc-name').textContent = this.fight.levelRules.champion ? `👑 ${rival.name}` : rival.name;
    this.lastNumbers = {};
    const { prizes, powerUps } = this.fight.levelRules;
    for (const kind of PRIZE_ORDER) {
      const item = byElementId(`prize-${kind}`);
      item.hidden = !prizes.includes(kind);
      item.querySelector('strong').textContent = '0';
    }
    byElementId('prizes').hidden = !prizes.length && !powerUps.length;
    this.showPowerUpBadges();
  }

  /** The child's fighter's name, with the friend's beside it when they fight together. */
  teamName() {
    return this.team && this.ally ? `${this.chosen.name} + ${this.ally.spec.name}` : this.chosen.name;
  }

  /** The power-ups waiting to be used, as small badges next to the prizes. */
  showPowerUpBadges() {
    const { player } = this.fight;
    const have = { shield: player.shield, glow: player.glow > 0, helper: player.helper };
    for (const badge of document.querySelectorAll('.powerup')) {
      badge.hidden = !have[badge.dataset.kind];
    }
    byElementId('glow-left').textContent = player.glow > 1 ? String(player.glow) : '';
    this.arena.showPowerUps(player);
  }

  /** The friend who helps: Giraffe, unless the child is Giraffe, or the opponent is. */
  helperSpec() {
    return ROSTER.find((spec) => spec.id !== this.chosen.id && spec.id !== this.rivalSpec.id);
  }

  beginRoundCountdown() {
    const { fight } = this;
    this.arena.resetRound();
    this.arena.setView('fight');
    if (fight.player.helper && !fight.ally) this.arena.showHelper(this.helperSpec());
    this.reader.forget();
    this.lastNumbers = {};
    for (const id of ['player-hp', 'npc-hp']) {
      byElementId(id).style.width = '100%';
      byElementId(id).classList.remove('is-low');
    }
    const number = fight.round + 1;
    const needed = Math.floor(fight.totalRounds / 2) + 1;
    const last = number >= fight.totalRounds || (fight.player.roundsWon === needed - 1 && fight.npc.roundsWon === needed - 1);
    const line = last && fight.totalRounds > 1 ? ROUND_WORDS.last : ROUND_WORDS[number];
    this.setCount(this.translate(line).replace('!', ''));
    this.sound.say(line);
    this.countStage = 'round';
    this.timer = ROUND_WORD_SECONDS;
    this.setScreen('countdown');
    this.sound.startFightMusic();
  }

  updateCountdown(dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    if (this.countStage === 'round') {
      this.countStage = 'fight';
      this.timer = FIGHT_WORD_SECONDS;
      this.setCount(this.translate(SAY.fight));
      this.sound.bell();
      this.sound.say(SAY.fight);
      this.fight.beginRound();
      this.coach.beginRound();
      this.setScreen('fight');
      if (this.fight.levelRules.champion) this.firstSight('champion');
      // The friend's computer was ahead, and this round is already theirs, or this child's, or the two of them's.
      const early = this.settledEarly?.get(this.fight.round);
      if (early && this.fight.ally) this.fight.teamRoundWon();
      else if (early) this.fight.settleRound(early);
    }
  }

  updateFight(dt, now) {
    const { fight, coach, arena, reader } = this;
    if (this.countStage === 'fight') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.countStage = null;
        this.setCount('');
      }
    }

    // Nobody in the picture: everything waits, so a child can't lose by stepping away. Against a friend, only
    // the coach waits, and the friend's moves still land.
    if (this.bodyLost()) {
      this.prompt.show({ key: 'come-back', text: BODY_SAY.comeBack, side: null }, now);
      if (fight.friend) {
        fight.update(dt);
        if (fight.state === 'fighting') this.updateHud();
      }
      // Together, the friend's moves still take the computer's fighter down, and that shows.
      if (fight.ally && fight.state === 'fighting') this.updateHud();
      return;
    }

    if (reader.moving) fight.noteActivity(dt);
    coach.update(dt);
    fight.update(dt);
    if (fight.state !== 'fighting') return;

    arena.npc.warning = fight.npc.warning ? 1 : 0;
    arena.player.guarding = fight.player.guard;
    arena.player.ducking = fight.player.duck;
    // A friend's fighter doesn't wait for this child, as the computer's does.
    if (fight.resting !== this.wasResting && !fight.friend) {
      this.wasResting = fight.resting;
      arena.npc.hold(fight.resting ? 'wave' : null);
    }
    const { showing } = coach;
    if (showing) this.setCoachEffort(reader.effortFor(showing.demo, showing.side));

    // Everything's fine if the feet come and go, as long as they come back.
    const problem = viewProblem(this.latestBody, this.aspect);
    this.feetMissing = problem === 'step-back' || problem === 'show-all' ? this.feetMissing + dt : 0;
    let prompt = null;
    if (now < this.openHandUntil) {
      const side = this.openHandSide;
      prompt = { key: `open-${side}`, text: side === 'left' ? SAY.openLeft : SAY.openRight, side };
    } else if (this.feetMissing > FEET_PROMPT_SECONDS) {
      prompt = { key: 'see-feet', text: BODY_SAY.seeFeet, side: null };
    }
    this.prompt.show(prompt, now);

    this.updateHud();
  }

  /* ---------- new things, the first time they're seen ---------- */

  /**
   * Something this level brought is on the screen for the first time this fight: a small label says
   * what it is, with its picture, for a moment. Nothing is said.
   */
  firstSight(id) {
    if (!this.fight || this.newShown.has(id) || !levelHas(this.fight.levelNumber, id)) return;
    if (!this.newThings(this.fight.levelNumber).some((thing) => thing.id === id)) return;
    this.newShown.add(id);
    this.newQueue.push(id);
    if (!this.newTimer) this.showNextNewThing();
  }

  showNextNewThing() {
    const id = this.newQueue.shift();
    const label = byElementId('new-thing');
    if (!id) {
      this.hideNewThing();
      return;
    }
    const { name, nameKa } = NEW_THINGS[id];
    label.dataset.thing = id;
    label.innerHTML = `<span class="new-thing-mark">${markHtml(id)}</span><span>${this.settings.language === 'ka' ? nameKa : name}</span>`;
    label.classList.remove('is-shown');
    void label.offsetWidth;
    label.classList.add('is-shown');
    this.newTimer = setTimeout(() => this.showNextNewThing(), NEW_THING_MS);
  }

  hideNewThing() {
    clearTimeout(this.newTimer);
    this.newTimer = null;
    byElementId('new-thing')?.classList.remove('is-shown');
  }

  /* ---------- prizes and power-ups ---------- */

  onPrize({ kind, total }) {
    this.firstSight(kind);
    const counter = byElementId(`prize-${kind}`);
    const from = kind === 'coin' ? this.arena.toScreen(this.arena.fighterTop('npc'))
      : kind === 'gem' ? this.arena.toScreen(this.arena.fighterTop('player'))
        : { x: 0.5, y: 0.4 };
    this.sound.prize(kind);
    const land = () => {
      counter.querySelector('strong').textContent = String(total);
      counter.classList.remove('is-bumped');
      void counter.offsetWidth;
      counter.classList.add('is-bumped');
    };
    if (this.arena.reducedMotion || counter.hidden) {
      land();
      return;
    }
    // The prize flies over to its counter at the top.
    const mark = document.createElement('span');
    mark.className = 'prize-fly';
    mark.innerHTML = markHtml(kind);
    mark.style.left = `${Math.round(from.x * innerWidth)}px`;
    mark.style.top = `${Math.round(from.y * innerHeight)}px`;
    document.body.append(mark);
    const box = counter.getBoundingClientRect();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      mark.style.transform = `translate(${Math.round(box.left + 14 - from.x * innerWidth)}px, ${Math.round(box.top + box.height / 2 - from.y * innerHeight)}px) scale(0.7)`;
    }));
    setTimeout(() => {
      mark.remove();
      land();
    }, PRIZE_FLIGHT_MS);
  }

  onPowerUp({ kind }) {
    this.firstSight(kind);
    this.sound.powerUp();
    if (kind === 'helper') this.arena.showHelper(this.helperSpec());
    const top = this.arena.toScreen(this.arena.fighterTop('player'));
    this.callout(`${POWER_UPS[kind]} ${this.settings.language === 'ka' ? NEW_THINGS[kind].nameKa : NEW_THINGS[kind].name}`, { kind: 'is-open', x: top.x, y: top.y });
    this.showPowerUpBadges();
  }

  onTeam({ move }) {
    const feet = this.arena.helperFeet();
    this.arena.helperStrike(move);
    this.callout(`🤝 ${this.settings.language === 'ka' ? 'გუნდური დარტყმა!' : 'Team move!'}`, { kind: 'is-combo', x: feet.x, y: Math.min(0.8, feet.y + 0.06) });
    this.showPowerUpBadges();
  }

  updateHud() {
    const { fight, lastNumbers } = this;
    const setWidth = (id, share, name) => {
      const value = Math.round(share * 1000) / 10;
      if (lastNumbers[name] === value) return;
      lastNumbers[name] = value;
      byElementId(id).style.width = `${value}%`;
    };
    setWidth('player-hp', fight.player.hp / RULES.maxHp, 'playerHp');
    setWidth('npc-hp', fight.npc.hp / fight.npcMax, 'npcHp');
    setWidth('player-power', fight.player.power / 100, 'power');
    byElementId('player-hp').classList.toggle('is-low', fight.player.hp < 30);
    byElementId('npc-hp').classList.toggle('is-low', fight.npc.hp < 0.3 * fight.npcMax);
    byElementId('power-bar').classList.toggle('is-full', fight.player.power >= 100);

    if (lastNumbers.round !== fight.round) {
      lastNumbers.round = fight.round;
      byElementId('round-word').textContent = `Round ${Math.max(1, fight.round)}`;
      const pips = (count) => '★'.repeat(count);
      byElementId('player-wins').textContent = pips(fight.player.roundsWon);
      byElementId('npc-wins').textContent = pips(fight.npc.roundsWon);
    }
  }

  buildTally() {
    const tally = byElementId('tally');
    for (const name of Object.keys(EXERCISES)) {
      const item = document.createElement('div');
      item.className = 'tally-item';
      item.dataset.exercise = name;
      item.innerHTML = ICONS[name];
      const count = document.createElement('span');
      count.className = 'tally-count';
      count.textContent = '0';
      item.append(count);
      tally.append(item);
    }
  }

  updateTally() {
    const { exercises } = this.fight.stats;
    for (const item of document.querySelectorAll('.tally-item')) {
      const value = exercises[item.dataset.exercise];
      item.querySelector('.tally-count').textContent = String(value);
      item.classList.toggle('has-some', value > 0);
    }
  }

  /* ---------- what happened ---------- */

  onFightEvent(event) {
    const handlers = {
      call: () => this.onCall(event),
      'call-again': () => this.sayCall(event),
      'call-done': () => this.onCallDone(event),
      rep: () => this.onRep(event),
      nudge: () => this.onNudge(event),
      'try-another': () => this.onTryAnother(),
      'small-hits-spent': () => this.coach.nudge(),
      'open-your-hand': () => this.onOpenYourHand(event),
      defend: () => this.onDefend(event),
      defended: () => this.onDefended(event),
      resting: () => this.sound.say(BODY_SAY.waiting, { ifQuiet: true }),
      move: () => this.onMove(event),
      hit: () => this.onHit(event),
      dodged: () => this.onDodged(event),
      combo: () => this.onCombo(event),
      prize: () => this.onPrize(event),
      'power-up': () => this.onPowerUp(event),
      team: () => this.onTeam(event),
      'ally-hit': () => this.onAllyHit(event),
      charged: () => this.arena.setCharged(event.who === 'player'),
      'round-end': () => this.onRoundEnd(event),
      'fight-end': () => this.onFightEnd(event),
      knockout: () => this.onKnockout(event),
    };
    handlers[event.type]?.();
  }

  /** The words for an exercise, which say which side if it has one. */
  callWords({ name, side }) {
    const { ask } = EXERCISES[name];
    return side ? ask[side] : ask;
  }

  sayCall(event) {
    this.sound.say(this.callWords(event));
  }

  onCall(event) {
    if (event.times > 1) this.firstSight('twice');
    this.firstSight('mixed');
    const { demo } = EXERCISES[event.name];
    this.showCoach(demo, this.coachWords(event), { side: event.side ?? this.settings.hands });
    this.sayCall(event);
  }

  /**
   * What the coach's card says. A move asked for twice, on the higher levels, has a dot for each time,
   * filled in as it's done, so it needs no reading.
   */
  coachWords({ name, side, times = 1, done = 0 }) {
    const words = this.translate(this.callWords({ name, side }));
    return times > 1 ? `${words} ${'●'.repeat(done)}${'○'.repeat(times - done)}` : words;
  }

  /** One of a move asked for twice: seen, and the card shows one more to go. */
  onRep(event) {
    byElementId('coach-text').textContent = this.coachWords(event);
    this.showSeen(EXERCISES[event.name].seen, { x: 0.3, y: 0.55 });
  }

  onCallDone({ name }) {
    this.hideCoach();
    this.showSeen(EXERCISES[name].seen, { x: 0.3, y: 0.55 });
  }

  /** They're doing something else, so the card moves to catch the eye, and it's said again. */
  onNudge(event) {
    const coach = byElementId('coach');
    coach.classList.remove('is-nudged');
    void coach.offsetWidth;
    coach.classList.add('is-nudged');
    this.sayCall(event);
  }

  onTryAnother() {
    this.hideCoach();
    this.sound.say(SAY.another);
  }

  /** A fist doesn't count for a push. */
  onOpenYourHand({ side }) {
    this.openHandUntil = performance.now() + OPEN_HAND_PROMPT_MS;
    this.openHandSide = side;
  }

  onDefend({ kind, second }) {
    const { demo, ask } = DEFENCES[kind];
    this.showCoach(demo, this.translate(ask), { side: this.settings.hands });
    this.sound.say(ask);
    if (kind === 'catch') this.arena.ballReady();
    this.firstSight(kind);
    if (second) this.firstSight('doubles');
  }

  onDefended({ kind }) {
    this.hideCoach();
    this.showSeen(DEFENCES[kind].seen, { x: 0.3, y: 0.55 });
    if (kind === 'catch') {
      this.arena.ballCaught();
      this.sound.caught();
    }
  }

  onMove(event) {
    const { who, move, side, signature, small } = event;
    this.arena.moveStarted(who, move, { side });
    this.sound.swing(move);
    if (this.fight.friend) {
      if (who === 'player') this.sendMove(event);
      else this.friendMoved(event);
    }
    if (who !== 'player') {
      // The computer's turn stops what the coach was asking for. A friend's move doesn't.
      if (!this.fight.friend) this.hideCoach();
      return;
    }
    if (small) return;
    this.updateTally();
    this.showPowerUpBadges();
    // Every move is what the child was asked for, and it gets its name in lights. The fighter's own
    // finishing move is shown by its name in either language, as it's said, whatever move it came from.
    const { name, label, labelKa } = MOVES[move];
    const ka = this.settings.language === 'ka';
    let shown;
    if (signature) shown = ka ? this.chosen.signatureKa : this.chosen.signature;
    else if (name) shown = this.translate(`${name}!`).replace('!', '');
    else shown = ka ? labelKa : label;
    this.callout(shown, { kind: 'is-big', x: 0.42, y: 0.36 });
    // Only the fighter's own big move is shouted, so that the next thing to do comes straight away.
    if (signature) this.sound.say(`${this.chosen.signature}!`);
  }

  /* ---------- fighting a friend ---------- */

  /** Each of the child's fighter's moves goes to the friend's computer, with what it does. */
  sendMove({ move, side, small, signature, damage, total }) {
    const hit = { r: this.fight.round, m: move, d: damage, tot: total, sm: small ? 1 : 0, sg: signature ? 1 : 0, sd: side ? side[0] : '' };
    this.friends.sendHit(hit, performance.now() - this.goAt);
  }

  /** The friend did a move, and their fighter makes it: its name, over them, as the child's own are. */
  friendMoved({ move, small, signature }) {
    if (small) return;
    const { name, label, labelKa } = MOVES[move];
    const ka = this.settings.language === 'ka';
    const rival = this.rivalSpec;
    let shown;
    if (signature) shown = ka ? rival.signatureKa ?? rival.signature : rival.signature;
    else if (name) shown = this.translate(`${name}!`).replace('!', '');
    else shown = ka ? labelKa : label;
    if (!shown) return;
    const top = this.arena.toScreen(this.arena.fighterTop('npc'));
    this.callout(shown, { kind: 'is-friend', x: top.x, y: Math.max(0.12, top.y - 0.06) });
  }

  /** Something from the friend's computer: one of their fighter's moves, their body, or whose a round is. */
  fromFriend(id, message) {
    const { fight } = this;
    if (!fight?.friend && !fight?.ally) return;
    const friend = fight.ally ? this.ally : this.rival;
    if (message.t === 'pose') {
      if (id === friend?.id) this.friendBody?.push(message, performance.now());
      return;
    }
    if (message.t === 'claimed') {
      if (fight.ally) this.teamRoundSettled(message.k);
      else this.roundSettled(message.k, message.by === this.friends.room.you ? 'player' : 'npc');
      return;
    }
    if (message.t !== 'hit' || id !== friend?.id || !MOVES[message.m]) return;
    if (fight.ally) {
      // A move from a later round says this one is won already, as it is for both.
      if (message.r > fight.round) fight.teamRoundWon();
      else if (message.r === fight.round) fight.allyHit(message.m, { side: { l: 'left', r: 'right' }[message.sd] ?? null, small: Boolean(message.sm), signature: Boolean(message.sg), damage: message.d, total: message.tot });
      return;
    }
    if (message.r !== fight.round) return;
    fight.perform('npc', message.m, {
      side: { l: 'left', r: 'right' }[message.sd] ?? null,
      small: Boolean(message.sm),
      signature: Boolean(message.sg),
      damage: message.d,
      total: message.tot,
    });
  }

  /* ---------- fighting together with a friend ---------- */

  /** Together: each of the child's moves that lands goes to the friend's computer, with all they've done this round. */
  sendTeamHit({ move, side, small, signature, damage, total }) {
    const hit = { r: this.fight.round, m: move, d: damage, tot: total, sm: small ? 1 : 0, sg: signature ? 1 : 0, sd: side ? side[0] : '' };
    this.friends.sendHit(hit, performance.now() - this.goAt);
  }

  /** Together: the friend's move has landed on the computer's fighter, and their fighter here makes it. */
  onAllyHit({ move, side, small, signature, damage }) {
    const { arena } = this;
    this.sound.swing(move);
    // Their fighter makes the move, if it's still beside the child's.
    if (arena.helper?.ally) {
      arena.allyStrike(move, side ?? 'right');
      arena.hitLanded({ attacker: 'helper', target: 'npc', move, blocked: false, signature, small });
    }
    this.sound.impact(move, { blocked: false, signature, small });
    const top = arena.toScreen(arena.fighterTop('npc'));
    if (damage > 0) this.callout(String(Math.max(1, Math.round(damage))), { kind: 'is-number', x: top.x + 0.03, y: top.y });
    if (small) return;
    // Its name over the friend's fighter, as the child's own moves have theirs.
    const { name, label, labelKa } = MOVES[move];
    const ka = this.settings.language === 'ka';
    const spec = this.ally.spec;
    let shown;
    if (signature) shown = ka ? spec.signatureKa ?? spec.signature : spec.signature;
    else if (name) shown = this.translate(`${name}!`).replace('!', '');
    else shown = ka ? labelKa : label;
    const feet = arena.helperFeet();
    if (shown) this.callout(shown, { kind: 'is-friend', x: feet.x, y: Math.max(0.12, feet.y - 0.34) });
    this.updateHud();
  }

  /** Together: a round is won on the friend's computer, so it's won here, now or as soon as it starts. */
  teamRoundSettled(round) {
    const { fight } = this;
    if (round > fight.round) this.settledEarly.set(round, 'player');
    else if (round === fight.round) fight.teamRoundWon();
  }

  /**
   * A knockout, on this computer. When the child's fighter knocked the friend's out, it claims the round, and
   * the round is whoever's the server says, as both can get there at once. Without a word from the server, as
   * when the connection is down, it's as this computer saw.
   */
  onKnockout({ winner }) {
    const { fight } = this;
    if (winner === 'player') this.friends.claim(fight.round);
    clearTimeout(this.knockoutWait);
    const { round } = fight;
    this.knockoutWait = setTimeout(() => {
      if (this.fight === fight && fight.state === 'knockout' && fight.round === round) fight.settleRound(winner);
    }, KNOCKOUT_WAIT_MS);
  }

  roundSettled(round, winner) {
    const { fight } = this;
    if (round > fight.round) {
      this.settledEarly.set(round, winner);
      return;
    }
    if (round !== fight.round) return;
    clearTimeout(this.knockoutWait);
    fight.settleRound(winner);
  }

  /** The friend has gone, in the middle of a fight: it's over, and it's the child's. */
  friendGone(friend) {
    const { fight } = this;
    // Together, the child fights on by themselves, and the friend's fighter goes.
    if (fight?.ally && friend.id === this.ally?.id) {
      fight.allyGone();
      this.arena.hideHelper();
      this.team = false;
      byElementId('player-name').textContent = this.teamName();
      this.friendWentAway = true;
      return;
    }
    if (!fight?.friend || friend.id !== this.rival?.id || fight.state === 'over') return;
    clearTimeout(this.afterRound);
    clearTimeout(this.knockoutWait);
    this.friendWentAway = true;
    fight.friendGone();
  }

  onHit(event) {
    const { attacker, target, move, damage, blocked, bubble, reasons, signature, small } = event;
    // Together, what the child's move did goes to the friend's computer, where their fighter makes it too.
    if (this.fight.ally && !this.fight.allyLeft && attacker === 'player') this.sendTeamHit(event);
    this.arena.hitLanded({ attacker, target, move, blocked, signature, small });
    // The bubble has its own soft sound, in place of the block's.
    if (!bubble) this.sound.impact(move, { blocked, signature, small });
    if (reasons.includes('charged') && attacker === 'player') this.arena.setCharged(false);

    const top = this.arena.toScreen(this.arena.fighterTop(target));
    if (bubble) {
      // The shield bubble caught it.
      this.arena.popBubble();
      this.sound.bubble();
      this.showPowerUpBadges();
      this.callout(`🫧 ${this.settings.language === 'ka' ? 'ბუშტმა დაგიცვა!' : 'Bubble!'}`, { kind: 'is-open', x: top.x, y: top.y });
      return;
    }
    if (blocked) {
      if (target === 'player') {
        this.callout(this.translate(SAY.goodBlock).replace('!', ''), { x: top.x, y: top.y });
      }
      return;
    }
    if (damage > 0) this.callout(String(Math.max(1, Math.round(damage))), { kind: 'is-number', x: top.x + 0.03, y: top.y });
    if (attacker === 'player' && reasons.includes('open-hand')) {
      this.callout(this.settings.language === 'ka' ? 'გაშლილი ხელი!' : 'Open hand!', { kind: 'is-open', x: top.x - 0.09, y: top.y + 0.1 });
    }
  }

  onDodged({ who }) {
    this.arena.dodged(who);
    if (who === 'player') {
      const top = this.arena.toScreen(this.arena.fighterTop('player'));
      this.callout(this.translate(SAY.niceDodge).replace('!', ''), { kind: 'is-open', x: top.x, y: top.y });
    }
  }

  onCombo({ who, name }) {
    if (who !== 'player') return;
    this.callout(this.translate(`${name}!`).replace('!', ''), { kind: 'is-combo', x: 0.42, y: 0.52 });
  }

  onRoundEnd({ winner, over }) {
    const { arena } = this;
    this.updateHud();
    this.hideCoach();
    arena.setCharged(false);
    arena.npc.warning = 0;
    arena.player.guarding = false;
    this.prompt.clear();
    const [won, lost] = winner === 'player' ? [arena.player, arena.npc] : [arena.npc, arena.player];
    won.hold('win');
    lost.hold('dizzy');
    // Together, the friend's computer hears the round is won, and their fighter here cheers too.
    if (this.fight.ally && winner === 'player') {
      this.friends.claim(this.fight.round);
      if (arena.helper?.ally) arena.helper.hold('win');
    }
    this.sound.say(SAY.knockout);
    this.sound.cheer(winner === 'player' ? 0.6 : 0.3);
    if (over) return;

    const mine = winner === 'player';
    this.afterRound = setTimeout(() => {
      byElementId('break-title').textContent = this.translate(mine ? SAY.roundYours : SAY.roundTheirs);
      byElementId('break-line').textContent = this.translate(SAY.takeBreath);
      this.fillTallyCards(byElementId('break-tally'), this.exerciseCards());
      this.sound.say(mine ? SAY.roundYours : SAY.roundTheirs);
      this.setScreen('break');
      this.timer = RULES.breakSeconds;
    }, AFTER_ROUND_SECONDS * 1000);
    this.setScreen('roundend');
  }

  exerciseCards() {
    const { exercises } = this.fight.stats;
    return Object.entries(EXERCISES).map(([name, { label }]) => ({ name, icon: name, label, value: exercises[name] }));
  }

  onFightEnd({ winner }) {
    const { arena } = this;
    clearTimeout(this.afterRound);
    clearTimeout(this.knockoutWait);
    this.hideCoach();
    // A friend's finish card fills in with how this child did.
    if (this.fight.friend || this.fight.ally) this.friends.finished(performance.now() - this.goAt, { w: winner === 'player' ? 1 : 0, n: this.fight.player.roundsWon });
    this.camera.stop();
    this.reader.forget();
    this.latestBody = null;
    this.sound.stopFightMusic();
    this.prompt.clear();
    this.setCount('');
    // Power-ups belong to a fight: a bubble or glow that's left fades, and a friend who came to help goes.
    arena.clearPowerUps();
    arena.setView('win');
    if (winner === 'player') arena.player.presenting = true;
    this.sound.cheer(winner === 'player' ? 0.75 : 0.35);
    this.setScreen('roundend');
    this.timer = AFTER_FIGHT_SECONDS;
    this.showAfterTimer = () => this.showFinish(winner);
    setTimeout(() => this.sound.say(winner === 'player' ? SAY.youWin : SAY.fightLost), 700);
  }

  showFinish(winner) {
    const { stats, player } = this.fight;
    const won = winner === 'player';
    byElementId('finish-title').textContent = this.translate(won ? SAY.youWin : SAY.fightLost);
    const minutes = stats.activeSeconds >= 60
      ? `${Math.floor(stats.activeSeconds / 60)} min ${Math.round(stats.activeSeconds % 60)} sec`
      : `${Math.round(stats.activeSeconds)} seconds`;
    byElementId('finish-prizes').innerHTML = this.prizeWords();
    byElementId('finish-prizes').hidden = !this.fight.levelRules.prizes.length;
    const rounds = `${player.roundsWon} of ${stats.rounds.length} ${stats.rounds.length === 1 ? 'round' : 'rounds'}`;
    let line = `${this.chosen.name} won ${rounds}, with ${minutes} of moving.`;
    if (!won && !this.fight.friend && !this.fight.ally) line = `${this.rivalSpec.name} won this fight. ${line}`;
    if (this.friendWentAway) line = `Your friend had to go. ${this.chosen.name} had ${minutes} of moving.`;
    else if (this.team && this.ally) line = `${this.chosen.name} and ${this.ally.spec.name} won ${rounds} together, with ${minutes} of moving.`;
    byElementId('finish-line').textContent = line;
    this.friendWentAway = false;
    this.fillTallyCards(byElementId('finish-tally'), this.exerciseCards());
    byElementId('sum-left-strikes').textContent = String(stats.strikes.left);
    byElementId('sum-right-strikes').textContent = String(stats.strikes.right);
    byElementId('sum-left-kicks').textContent = String(stats.kicks.left);
    byElementId('sum-right-kicks').textContent = String(stats.kicks.right);
    const { open, closed } = stats.hands;
    const seen = open + closed;
    byElementId('finish-hands').textContent = seen
      ? `Hand seen open in ${open} of the ${seen} arm moves it could be read in.`
      : 'The hands were too far away to read in any arm move.';
    // A fight that's won moves on a level, and one that's lost stays on it. Fighting a friend is on the host's
    // level, so it doesn't move anyone's own level on.
    if (this.fight.friend || this.fight.ally) {
      this.finishFriendsLevel(won, this.friends.current?.level);
    } else {
      this.finishLevel(won);
      // Lost to the computer: the same level again, and the big button says so.
      if (!won) byElementId('fight-again').textContent = 'Try again';
    }
    this.friends.showResults();
    if (won) this.confetti.start();
    this.setScreen('finish');
  }

  /** The prizes collected, for the finish card. */
  prizeWords() {
    const { prizes } = this.fight.stats;
    const names = { coin: ['coin', 'coins'], gem: ['gem', 'gems'], medal: ['medal', 'medals'], trophy: ['trophy', 'trophies'] };
    const got = this.fight.levelRules.prizes.map((kind) => `<span class="finish-prize">${markHtml(kind)} ${prizes[kind]} ${names[kind][prizes[kind] === 1 ? 0 : 1]}</span>`);
    return got.length ? `Prizes: ${got.join(' · ')}` : '';
  }

  /**
   * What a round leaves going, stopped when a grown-up's change in the panel starts the game again: see
   * startAgain in core/body/game.js.
   */
  leaveRound() {
    this.sound.stopFightMusic();
  }

  playAgain() {
    this.confetti.stop();
    this.reader.forget();
    this.openCameraThen(() => this.beginBodyCheck());
  }

  /* ---------- every frame ---------- */

  /**
   * The child's own fighter copies them whenever the camera can see them. Fighting a friend, their body goes to
   * the friend's computer, and the friend's fighter here copies the friend's, from what theirs sends.
   */
  copyBodies(now) {
    const seen = this.camera.running && this.reader.hasPose && !this.bodyLost();
    this.arena.setLive('player', seen ? this.reader.pose : null);
    const { fight } = this;
    if (!fight?.friend && !(fight?.ally && !fight.allyLeft)) {
      this.arena.setLive('npc', null);
      return;
    }
    const theirs = this.friendBody?.at(now);
    const body = theirs?.p?.length === BODY_KEYS.length ? bodyFrom(theirs.p) : null;
    // Against a friend, their fighter is the other corner's. Together, it's the one beside the child's own.
    this.arena.setLive('npc', fight.ally ? null : body);
    if (fight.ally) this.arena.setLive('helper', body);
    // An empty list says the camera can't see this child, so the friend's computer stops copying them.
    if (SEND_BODY_SCREENS.has(this.screen)) this.friends.sendMove('pose', { p: seen ? bodyList(this.reader.pose) : [] }, now - this.goAt);
  }

  frame(dt, now) {
    this.copyBodies(now);
    switch (this.screen) {
      case 'intro':
        this.timer -= dt;
        if (this.timer <= 0) this.beginRoundCountdown();
        break;
      case 'countdown':
        this.updateCountdown(dt);
        break;
      case 'fight':
        this.updateFight(dt, now);
        break;
      case 'roundend':
        if (this.showAfterTimer) {
          this.timer -= dt;
          if (this.timer <= 0) {
            const show = this.showAfterTimer;
            this.showAfterTimer = null;
            show();
          }
        }
        break;
      case 'break':
        this.timer -= dt;
        if (this.timer <= 0) this.beginRoundCountdown();
        break;
      default:
    }
  }
}

mountBodyShell({
  title: 'Mighty Moves',
  tagline: 'Punches and kicks do a little. Do what your fighter shows you, and it’s a mighty move!',
  startLabel: 'Choose your fighter',
  chooseTitle: 'Choose your fighter',
  chosenExtra: '<p class="chosen-move"><span class="chosen-label">Special move</span> <span id="chosen-signature"></span></p>',
  chooseSide: `
      <button id="next-opponent" class="opponent" type="button">
        <img id="opponent-portrait" alt="">
        <span><span class="chosen-label">Your opponent</span><br><strong id="opponent-name"></strong><br><span id="opponent-change" class="opponent-change">Tap to change</span></span>
      </button>
      <button id="fight-start" class="big-button" type="button">Fight!</button>`,
  hud: `
  <header id="hud-top" class="fight-top">
    <div class="corner" data-who="player">
      <img id="player-portrait" class="corner-portrait" alt="">
      <div class="corner-bars">
        <div class="corner-name"><span id="player-name"></span><span id="player-wins" class="wins" aria-hidden="true"></span></div>
        <div class="hp"><div id="player-hp" class="hp-fill"></div></div>
        <div id="power-bar" class="power" aria-hidden="true"><div id="player-power" class="power-fill"></div><span class="power-word">Super</span></div>
        <div id="prizes" class="prizes" aria-hidden="true" hidden>
          ${PRIZE_ORDER.map((kind) => `<span id="prize-${kind}" class="prize" data-kind="${kind}" hidden><span class="prize-mark">${markHtml(kind)}</span><strong>0</strong></span>`).join('')}
          ${Object.entries(POWER_UPS).map(([kind, mark]) => `<span class="powerup" data-kind="${kind}" hidden>${mark}${kind === 'glow' ? '<strong id="glow-left"></strong>' : ''}</span>`).join('')}
        </div>
      </div>
    </div>
    <div class="round-box">
      <span id="round-word" class="round-word"></span>
    </div>
    <div class="corner" data-who="npc">
      <div class="corner-bars">
        <div class="corner-name"><span id="npc-wins" class="wins" aria-hidden="true"></span><span id="npc-name"></span></div>
        <div class="hp"><div id="npc-hp" class="hp-fill"></div></div>
      </div>
      <img id="npc-portrait" class="corner-portrait" alt="">
    </div>
  </header>
  <div id="tally" class="tally" aria-hidden="true"></div>
  <div id="new-thing" class="new-thing" aria-hidden="true"></div>
  <div id="versus-banner" class="versus-banner" aria-live="polite">
    <span id="versus-player"></span>
    <span class="versus-word">VS</span>
    <span id="versus-npc"></span>
  </div>
  <div id="break-card" class="break-card card">
    <h2 id="break-title"></h2>
    <p id="break-line" class="tagline"></p>
    <div id="break-tally" class="break-tally"></div>
  </div>`,
  finishBody: `
      <h2 id="finish-title"></h2>
      <p id="finish-line" class="finish-open"></p>
      <p id="finish-prizes" class="finish-prizes" hidden></p>
      <div id="finish-tally" class="finish-tally"></div>
      <table class="summary fight-summary">
        <thead>
          <tr><th scope="col"><span class="visually-hidden">Measure</span></th><th scope="col">Left</th><th scope="col">Right</th></tr>
        </thead>
        <tbody>
          <tr><th scope="row">Arm moves</th><td id="sum-left-strikes"></td><td id="sum-right-strikes"></td></tr>
          <tr><th scope="row">Leg moves</th><td id="sum-left-kicks"></td><td id="sum-right-kicks"></td></tr>
        </tbody>
      </table>
      <p id="finish-hands" class="finish-hands"></p>
      <p class="small-print">These numbers are shown once and not saved.</p>
      <div class="finish-actions">
        <button id="fight-again" class="big-button" type="button">Fight again</button>
        <button id="other-fighter" class="soft-button" type="button">Choose another fighter</button>
        <a class="all-games" href="../../index.html">All games</a>
      </div>`,
  panelLead: 'The game is paused. The coach shows one move at a time, and only those moves can win a round. Ordinary punches and kicks are small hits. The camera has to see the child’s whole body, from about 2 to 3 metres away.',
  handLegend: 'Side to work on (its moves are stronger)',
  panelSettings: `
    <fieldset class="choice">
      <legend>The coach may ask for jumps and star jumps</legend>
      <label><input type="radio" name="jumps" value="yes"> Yes</label>
      <label><input type="radio" name="jumps" value="no"> No, jumping isn’t safe for this child</label>
    </fieldset>
    <fieldset class="choice">
      <legend>The computer’s strength</legend>
      <label><input type="radio" name="fightStrength" value="medium"> Medium: it can win a fight, and gets stronger level by level</label>
      <label><input type="radio" name="fightStrength" value="tough"> Tough: less warning, and it hits harder</label>
      <label><input type="radio" name="fightStrength" value="gentle"> Gentle: plenty of warning, and it can’t knock a child out</label>
    </fieldset>
    <fieldset class="choice">
      <legend>Length of a fight</legend>
      <label><input type="radio" name="rounds" value="1"> One round</label>
      <label><input type="radio" name="rounds" value="3"> Best of three, with a rest between</label>
    </fieldset>
    <fieldset class="choice">
      <legend>With a friend</legend>
      <label><input type="radio" name="fightFriends" value="together"> Together: both of you against the computer’s fighter, side by side</label>
      <label><input type="radio" name="fightFriends" value="against"> Against each other</label>
    </fieldset>`,
});

new MightyMoves().start();
