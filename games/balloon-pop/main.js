// Balloon Pop: balloons float up, and an open hand pops them. A grown-up can turn on a maths
// challenge, where the balloons have answers on them and the wrong one burns the glove.
import { renderPortraits } from '../../core/body/portraits.js';
import { byId as characterWithId, ROSTER } from '../../core/body/roster.js';
import { Track } from '../../core/friends.js';
import { FriendsPanel } from '../../core/friends-ui.js';
import { Glove } from '../../core/glove.js';
import { GameSession } from '../../core/session.js';
import { SEAT, seatName } from '../../core/seat.js';
import { DID_IT_TOGETHER, Sound } from '../../core/sound.js';
import { BalloonField } from './balloons.js';
import { MathsDeck } from './maths.js';
import { awayAllowed, balloonNewAt, friendsMode, MOST_ANSWERS, readFriendsMode, TEAM, teamGoal } from './rules.js';
import { WorldTrack } from './world-track.js';

const POP_HINT_SECONDS = 6;
const DEMO_MATHS_SECONDS = 14;
const BUMP_PROMPT_SECONDS = 2.5;
const PRAISE_EVERY = 10;
const PRAISE_RIGHT_EVERY = 3; // Right answers between one "Great job!" and the next.
const MATHS_GOAL_SHARE = 0.5; // Each answer takes longer than a balloon, so a game has fewer of them.
const FIRST_QUESTION_AFTER = 0.8; // Lets "Go!" finish first.
const NEXT_QUESTION_AFTER = 0.6; // Time to see that it was right.
const ASK_AGAIN_EVERY = 9;
const ASKED_AT_MOST = 2;

const POP_HINT = 'Pop the balloons with your open hand!';
const OPEN_TO_POP = {
  left: 'Open your left hand to pop it!',
  right: 'Open your right hand to pop it!',
};
const PRAISE = ['Great job!', 'Nice one!', 'Way to go!'];
const MATHS_HINT = 'Pop the right answer!';
const TOO_HOT = 'Ouch! Too hot!';
const COOL_IT = 'Hold your hand open to cool it down!';
// What the voice says at the end. Both have a rendered voice file: see core/audio/voice/lines.json.
const FINISH = 'You popped them all!';
const AWAY_FINISH = 'So close! Try again!'; // One of the lines every game has: see SO_CLOSE in core/sound.js.
const AWAY_TITLE = 'The balloons floated away!';

const byId = (id) => document.getElementById(id);
const PRIZE_MARKS = { sweet: '🍬', star: '⭐', gem: '💎', heart: '💗' };

// Playing with friends, each on their own computer, with the same balloons. Together, as it comes, what everyone
// pops adds up, and the team has so many to pop between them before the time is up: see TEAM in rules.js. Against
// each other, everyone plays for the same time, and whoever pops the most, or gets the most right, comes first.
// How long goes by the host's number of balloons. See core/friends-ui.js for what each of the words is.
const FRIENDS_SECONDS = { 20: 60, 40: 120, 60: 180 };
// The finish card's title when friends played together: see teamTitle below.
const TEAM_TITLE = 'You popped them together!';
const TEAM_SUMS_TITLE = 'You did the sums together!';
const TEAM_LOST_TITLE = 'Time’s up!';
// Which of them it is is worked out each time the card is filled in, as it can change after the game is over: see
// teamLost.
const teamCard = { game: null };
const POP_WORDS = {
  toggle: 'Play with a friend',
  make: 'Make a game',
  codeLabel: 'A friend’s game code',
  codeName: 'Game code',
  how: 'Tell your friend the code. Then you both press <b>Let’s pop!</b>',
  // Together or against each other, as whoever made the game chooses: see teams in core/friends-ui.js.
  together: 'Together',
  against: 'Against each other',
  howTogether: 'Tell your friend the code. Then you both press <b>Let’s pop!</b>, and pop the balloons together: every pop counts for your team.',
  get teamTitle() {
    return teamCard.game?.teamTitle ?? TEAM_TITLE;
  },
  leave: 'Leave this game',
  privacy: 'Only your name, who you play as, whether you chose together or against each other, where your glove is and what it pops go to your friends. The camera picture stays on this computer.',
  alone: 'Play on your own',
  full: 'That game already has 4 players.',
  lost: 'Can’t reach the game. Check the internet, then try again.',
  left: 'You’ve left the game.',
  badCode: 'A game code is 3 letters and numbers.',
  busy: 'Playing',
  still: 'still playing',
};
// A friend's glove between what their game sends: where it is, and its points, which go smoothly from one to
// the next. Whether it can be seen and is open change half way.
const HAND_TRACK = { lerp: ['x', 'y'], lists: ['p'], steps: ['v', 'o'] };
const GLOVE_FADE_RATE = 8; // How quickly a friend's glove fades in and out, as their hand comes and goes.
const round2 = (value) => Math.round(value * 100) / 100;
const round3 = (value) => Math.round(value * 1000) / 1000;
const clock = (seconds) => {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

class BalloonGame {
  chimeOnOpen = false; // Hands open and close all the time here, so a chime would be noise.

  constructor(session) {
    this.session = session;
    this.bump = null;
    this.praiseIndex = 0;
    this.deck = null;
    this.question = null;
    this.questionIn = 0;
    this.askAgainIn = 0;
    this.timesAsked = 0;
    this.saidHint = false;
    this.burns = 0;
    this.timed = null; // With friends, how long the game lasts and how long is left: see prepare().
    this.team = null; // With friends, together: how many to pop between them, and how it's going: see prepare().
    this.scores = new Map(); // Friends' scores, by their id, as they come in.
    this.friendsGloves = []; // Each friend's glove, as { id, glove, track, name, fade }: see showFriendsGloves.
    this.sentScore = null;
    this.goAt = 0;
    // Playing with friends, everyone plays with the host's balloons: see prepare() and claimed().
    this.shared = null;
    this.worldTrack = null; // The host's balloons, on a friend's game.
    this.myClaims = new Map(); // Balloons this child's hand got to, by id, waiting to hear whose they are.
    this.mathsOn = false;
    const { settings, sound } = session;
    this.field = new BalloonField(byId('game'), {
      onPop: (total) => {
        // Never quite the same twice, as real balloons aren't.
        sound.play('pop', { gain: 0.55, rate: 0.88 + Math.random() * 0.32 });
        // Only an answer to a question that's showing counts as one. With friends, the sum moves on once
        // anyone has the right answer: see claimed().
        if (this.deck && this.question && !this.shared) this.rightAnswer(total);
        else if (total % PRAISE_EVERY === 0 && total < this.field.goal) {
          sound.say(PRAISE[this.praiseIndex++ % PRAISE.length], { ifQuiet: true });
        }
        this.showProgress();
      },
      onWrong: () => {
        this.burns += 1;
        sound.play('sizzle', { gain: 0.6 });
        sound.say(TOO_HOT);
      },
      onCooled: () => sound.handsOpen(),
      // A prize caught, and a power-up started: a soft chime each, and no words.
      onPrize: () => {
        sound.play('star', { gain: 0.32, rate: 1.05 + Math.random() * 0.15 });
        this.showPrizes(true);
      },
      onPower: () => sound.play('handsOpen', { gain: 0.4 }),
      onBump: (side) => {
        this.bump = { side, at: session.playSeconds };
      },
      onGoal: () => {
        session.finishLine = FINISH;
        session.finish();
      },
      onAway: () => this.showProgress(),
      // Too many floated away before enough were popped: the game ends there, kindly, on the same level.
      onTooManyAway: () => this.endLost(),
    }, {
      language: () => settings.language,
      prizeTarget: () => {
        const box = byId('chip-prizes')?.getBoundingClientRect();
        return box && box.width ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : { x: 80, y: 40 };
      },
    });
    // The finish card lists the prizes caught, by kind.
    byId('finish-hero')?.closest('.finish-hero')?.insertAdjacentHTML('afterend', '<p id="finish-prizes" class="finish-prizes"></p>');
    this.field.configure({ pace: settings.pace, reach: settings.reach, goal: settings.balloons, side: settings.hands });
    this.field.setLevel(session.level, { gentle: settings.away === 'gentle' });
    this.lost = false;
    // When a balloon got away, a line on the finish card saying how it went.
    byId('finish-prizes')?.insertAdjacentHTML('beforebegin', '<p id="finish-story" class="finish-story" hidden></p>');
    // Playing with friends, if a grown-up makes or joins a game.
    this.friends = new FriendsPanel({
      game: 'balloon-pop',
      linkKey: 'pop',
      words: POP_WORDS,
      // Together, the host's Gentle goes along too, as it takes the clock away.
      hello: () => ({ driver: settings.fighter ?? '', level: session.levels.current, length: settings.balloons, mode: friendsMode(settings.maths, settings.popFriends !== 'against' && settings.away === 'gentle') }),
      screen: () => session.screen,
      portraits: () => session.portraits,
      // With friends on their own computers, one plays at each camera: several at this one is for a game of
      // its own (the row on the title card, which the friends box hides while it's open).
      onRoom: () => {
        if (this.friends?.room.joined && session.players > 1) session.setPlayers(1);
      },
      onMove: (id, message) => {
        if (message.t === 'hand') this.friendsGloves.find((each) => each.id === id)?.track.push(message, performance.now());
        else if (message.t === 'world') this.worldTrack?.push(message, performance.now());
        else if (message.t === 'claimed') this.claimed(message);
        else this.friendScore(id, message);
      },
      onGone: (friend) => {
        // Without the host there are no more balloons, so the game is over for everyone else.
        const { current } = this.friends;
        // Together, that's short of what the team needed, unless they'd already popped enough.
        if (current && friend.id === current.host && !current.hosting && this.session.screen === 'playing') {
          if (this.team && this.teamTotal < this.team.goal) this.endLost();
          else this.session.finish();
        }
        // Together, what a friend popped before they went still counts for the team, so their score stays in it. A
        // friend who was only away a while, and comes back, goes on from that score rather than being counted twice.
        if (!this.team) this.scores.delete(friend.id);
        this.friendsGloves = this.friendsGloves.filter((each) => each.id !== friend.id);
        this.field.friendsGloves = this.friendsGloves;
        this.showScores();
      },
      // Whoever has the most, and equal scores share a place.
      rank: (a, b) => b.dropped - a.dropped,
      resultText: ({ dropped }) => `${dropped} ${this.mathsOn ? 'right' : 'popped'}`,
      titles: { first: 'You popped the most!', other: 'Great popping!' },
      // With friends, together or against each other: the grown-ups' choice, which the friends box can change too.
      teams: {
        get: () => (settings.popFriends === 'against' ? 'against' : 'together'),
        set: (choice) => this.chooseTeams(choice),
      },
      startAfter: byId('start'),
      waitingBefore: byId('screen-finish'),
      resultsAfter: document.querySelector('#screen-finish .finish-hero'),
      finishTitle: document.querySelector('#screen-finish h2'),
    });
    // Together, the finish card is the team's, and it's filled in again whenever a friend's ending arrives.
    teamCard.game = this;
    const showResults = this.friends.showResults.bind(this.friends);
    this.friends.showResults = () => {
      showResults();
      this.showTeamCard();
    };
    const game = this;
    this.debug = {
      balloons: this.field,
      get deck() {
        return game.deck;
      },
      get question() {
        return game.question;
      },
      get game() {
        return game;
      },
    };
  }

  /* ---------- the maths challenge ---------- */

  /**
   * Starts the maths challenge if a grown-up has turned it on, or stops it if they've turned it off. With
   * friends, it's the host's kind of sums, and the game goes on until the time is up rather than to a goal.
   */
  setUpMaths() {
    const { balloons } = this.session.settings;
    const maths = this.friendsMaths ?? this.session.settings.maths;
    const on = maths !== 'off';
    this.mathsOn = on;
    // Higher levels have more answers to choose from: see rules.js. With friends, only the host asks the sums,
    // and everyone sees them.
    const asking = on && !(this.shared && !this.shared.host);
    this.deck = asking ? new MathsDeck(maths, Math.random, { extra: this.field.plan.answers, most: MOST_ANSWERS }) : null;
    this.question = null;
    this.field.configure({ goal: this.timed ? Infinity : on ? Math.round(balloons * MATHS_GOAL_SHARE) : balloons });
    this.field.numbered = on;
    this.setUpAway();
    document.body.dataset.maths = on ? 'on' : 'off';
    byId('chip-popped-label').textContent = this.team ? (on ? 'Right together' : 'Popped together') : on ? 'Right answers' : 'Popped';
    byId('maths-question').textContent = '';
    byId('maths-question').classList.remove('is-right');
  }

  /**
   * Balloons that float away count, unless a grown-up chose Gentle. Not with friends, where it's a contest of
   * who pops the most in the time, and not with the maths challenge, whose balloons wait.
   */
  setUpAway() {
    const counting = !this.mathsOn && !this.timed && this.session.settings.away !== 'gentle';
    this.field.awayAllowed = counting ? awayAllowed(this.session.settings.balloons, this.field.level) : Infinity;
    byId('chip-away-box').hidden = !counting;
  }

  nextQuestion() {
    const question = this.deck.next();
    this.question = question;
    this.field.askNumbers(question.answers, question.answer);
    const shown = byId('maths-question');
    shown.classList.remove('is-right');
    shown.textContent = `${question.shown} = ?`;
    // The sum is on the screen, so it's only said at the start, or to a child who has stopped.
    if (!this.saidHint) this.askQuestion();
    this.saidHint = true;
    this.timesAsked = 1;
    this.askAgainIn = ASK_AGAIN_EVERY;
  }

  /** The sum itself is on the screen. One line does for every question. */
  askQuestion() {
    this.session.sound.say(MATHS_HINT);
  }

  rightAnswer(total) {
    const { field, question, session } = this;
    const shown = byId('maths-question');
    shown.textContent = `${question.shown} = ${question.answer} ✓`;
    shown.classList.add('is-right');
    this.answered = `${question.shown} = ${question.answer}`;
    this.question = null;
    field.clearNumbers();
    if (total >= field.goal) return;
    if (total % PRAISE_RIGHT_EVERY === 0) session.sound.say(PRAISE[this.praiseIndex++ % PRAISE.length], { ifQuiet: true });
    this.questionIn = NEXT_QUESTION_AFTER;
  }

  updateMaths(dt) {
    if (!this.deck) return;
    if (this.questionIn > 0) {
      this.questionIn -= dt;
      if (this.questionIn <= 0) this.nextQuestion();
      return;
    }
    if (!this.question) return;
    this.askAgainIn -= dt;
    if (this.askAgainIn <= 0 && this.timesAsked < ASKED_AT_MOST) {
      this.askQuestion();
      this.timesAsked += 1;
      this.askAgainIn = ASK_AGAIN_EVERY;
    }
  }

  /** The little film of what to do, which shows until it's clear the child has it. */
  showDemo() {
    const { session, field } = this;
    const wanted = field.total === 0 && session.playSeconds < (this.mathsOn ? DEMO_MATHS_SECONDS : POP_HINT_SECONDS);
    if (wanted !== this.demoShown) {
      this.demoShown = wanted;
      document.body.dataset.popDemo = wanted ? 'on' : 'off';
    }
  }

  /* ---------- the game ---------- */

  showProgress() {
    const { total, goal, progress } = this.field.info;
    const { timed, team } = this;
    // Against friends there's no goal, only the time: the bar shows how much of it has gone. Together, it's how
    // far the team has got, and the number is everyone's.
    const together = team ? Math.min(this.teamTotal, team.goal) : 0;
    byId('chip-popped').textContent = team ? `${together} of ${team.goal}` : timed ? String(total) : `${total} of ${goal}`;
    const { away, awayAllowed: allowed } = this.field.info;
    if (allowed !== Infinity) byId('chip-away').textContent = `${away} of ${allowed}`;
    const share = team ? together / team.goal : timed ? 1 - timed.left / timed.seconds : progress;
    byId('race-progress-fill').style.width = `${Math.round(share * 100)}%`;
    if (timed) byId('chip-time').textContent = clock(timed.left);
    this.showScores();
  }

  /** Together: what everyone has popped between them, with what friends who've gone popped before they went. */
  get teamTotal() {
    const { results } = this.friends;
    let total = this.field.total;
    // A friend's last score may not have arrived, but how they finished always does: whichever is more.
    for (const [id, score] of this.scores) total += Math.max(score, results.get(id)?.dropped ?? 0);
    return total;
  }

  /** A friend's score, as it changes. */
  friendScore(id, message) {
    if (message.t !== 'score' || !this.friends.current?.racers.includes(id)) return;
    this.scores.set(id, message.n);
    this.showScores();
  }

  /** Everyone's score while playing with friends, the most first, with the child's own among them. */
  showScores() {
    const list = byId('pop-scores');
    const { current } = this.friends;
    list.hidden = !current || !this.timed;
    if (list.hidden) return;
    const portraits = this.session.portraits ?? {};
    // Two in one picture on one screen both see this list, so the first player is Player 1 in it, not You.
    const mine = { id: this.friends.room.you, name: SEAT?.onePicture ? seatName(SEAT.index) : 'You', driver: this.session.settings.fighter, n: this.field.total };
    const theirs = current.friends.filter((friend) => !friend.gone).map((friend) => ({ id: friend.id, name: friend.spec.name, driver: friend.spec.id, n: this.scores.get(friend.id) ?? 0 }));
    // Against each other the most comes first. Together nobody is ahead: the child, then their friends.
    const everyone = this.team ? [mine, ...theirs] : [mine, ...theirs].sort((a, b) => b.n - a.n);
    const key = everyone.map(({ id, n }) => `${id}:${n}`).join(',');
    if (list.dataset.key === key) return;
    list.dataset.key = key;
    list.replaceChildren(...everyone.map((each) => {
      const row = document.createElement('li');
      row.classList.toggle('is-you', each === mine);
      const face = document.createElement('img');
      face.alt = '';
      face.src = portraits[(characterWithId(each.driver) ?? ROSTER[0]).id] ?? '';
      const name = document.createElement('span');
      name.className = 'pop-score-name';
      name.textContent = each.name;
      const score = document.createElement('span');
      score.className = 'pop-score';
      score.textContent = String(each.n);
      row.append(face, name, score);
      return row;
    }));
  }

  /** With friends, the start waits until they're ready too. */
  holdStart(go) {
    return this.friends.holdStart(go);
  }

  /** How long since "GO!", by the clock on the wall, for friends' games. */
  get sinceGo() {
    return performance.now() - this.goAt;
  }

  /** The prize tally, from level 2, which grows a little for a moment when a prize lands in it. */
  showPrizes(caught = false) {
    const chip = byId('chip-prizes');
    chip.textContent = String(this.field.prizeTotal);
    if (!caught) return;
    const box = chip.closest('.chip');
    box.classList.remove('is-caught');
    void box.offsetWidth;
    box.classList.add('is-caught');
  }

  /**
   * What each level brings that's new: see balloonNewAt in rules.js. With the maths challenge on, that's
   * only what comes with it: more answers to choose from, and the places.
   */
  newAt(level) {
    return balloonNewAt(level, { maths: this.session.settings.maths });
  }

  setHands(side) {
    this.field.configure({ side });
  }

  settingChanged(change) {
    // Friends are shown the choice at once, as it's the host's that counts.
    if ('popFriends' in change) {
      if (this.friends.room.inRoom) this.friends.room.tell(this.friends.hello());
      this.friends.showTeams();
    }
    if ('pace' in change) this.field.configure({ pace: change.pace });
    if ('reach' in change) this.field.configure({ reach: change.reach });
    if ('maths' in change) this.changeMaths();
    if ('away' in change) {
      this.field.setLevel(this.field.level, { gentle: change.away === 'gentle' });
      this.setUpAway();
      this.showProgress();
    }
  }

  /** Together or against each other, chosen in the friends box: kept with the grown-ups' settings, and shown there. */
  chooseTeams(choice) {
    this.session.changeSettings({ popFriends: choice });
    const input = document.querySelector(`input[name="popFriends"][value="${choice}"]`);
    if (input) input.checked = true;
  }

  /** A grown-up can turn it on or off in the middle of a game, and it takes effect straight away. */
  changeMaths() {
    this.field.stopNumbers();
    this.setUpMaths();
    if (this.deck && this.session.screen === 'playing') this.questionIn = FIRST_QUESTION_AFTER;
    this.showProgress();
    // What's new at a level depends on it, so the cards say so straight away.
    this.session.levelUi?.refresh();
  }

  /** Each level brings more balloons, a little faster, and new kinds of them: see rules.js. */
  prepare(level) {
    const { balloons, pace, reach, hands } = this.session.settings;
    // With friends, everyone plays the host's level and kind of sums, for as long as the host's game is, and
    // that doesn't move anyone's own level on. Each child keeps their own speed and reach help.
    const friendly = this.friends.current;
    document.body.toggleAttribute('data-friends-race', Boolean(friendly));
    const size = friendly && FRIENDS_SECONDS[friendly.length] ? friendly.length : 20;
    const seconds = friendly ? FRIENDS_SECONDS[size] : 0;
    const host = friendly ? readFriendsMode(friendly.mode) : null;
    // Together, the team has so many to pop between them before the time is up, and with the host's game on
    // Gentle there's no clock at all: endless. closing is the moment after the time is up, while the last pops
    // from friends' games come in.
    // racing is which friends have been seen playing this game, to tell one whose game is over from one who
    // hasn't begun: see friendOver.
    this.team = friendly?.team ? { goal: 0, closing: null, won: false, racing: new Set() } : null;
    // endsAt is when the time is up by the clock on the wall, for a team: see begin().
    this.timed = friendly ? { seconds, left: seconds, endless: Boolean(this.team && host.gentle), endsAt: null } : null;
    this.friendsMaths = host ? host.maths : null;
    // Everyone plays with the host's balloons. The host's game runs them, and the others' follow it.
    this.shared = friendly ? { host: friendly.hosting } : null;
    this.worldTrack = friendly && !friendly.hosting ? new WorldTrack() : null;
    this.myClaims = new Map();
    this.answered = '';
    // Each friend's score, from nothing, so that together every one of them is in the team's.
    this.scores = new Map((friendly?.friends ?? []).map((friend) => [friend.id, 0]));
    this.sentScore = null;
    // Each friend's glove, in grey, where their hand is on their own screen.
    this.friendsGloves = (friendly?.friends ?? []).map((friend) => ({ id: friend.id, name: friend.spec.name, glove: new Glove('right'), track: new Track(HAND_TRACK), fade: 0 }));
    this.field.friendsGloves = this.friendsGloves;
    byId('chip-time-box').hidden = !friendly || this.timed.endless;
    document.body.toggleAttribute('data-friends-team', Boolean(this.team));
    this.lost = false;
    this.session.finishLine = FINISH;
    this.field.setLevel(friendly?.level ?? level, { gentle: this.session.settings.away === 'gentle' });
    this.field.reset({ goal: friendly ? Infinity : balloons, pace, reach, side: hands });
    this.field.setShared(friendly ? {
      host: friendly.hosting,
      claim: (balloon, side, right) => this.claimBalloon(balloon, side, right),
      world: () => this.worldTrack?.at(performance.now()) ?? null,
    } : null);
    this.bump = null;
    this.saidHint = false;
    this.burns = 0;
    this.setUpMaths();
    if (this.team) this.team.goal = teamGoal(size, { maths: this.mathsOn });
    this.friends.titles = this.mathsOn ? { first: 'You got the most right!', other: 'Great sums!' } : { first: 'You popped the most!', other: 'Great popping!' };
    this.showProgress();
    // Prizes only come from level 2, so there's no tally before then.
    document.body.dataset.prizes = this.field.plan.prizes.length ? 'on' : 'off';
    this.showPrizes();
  }

  begin() {
    this.goAt = performance.now();
    if (this.deck) this.questionIn = FIRST_QUESTION_AFTER;
    // A team's time is up at the same moment on every computer: so long after "GO!", by the clock on the wall,
    // whatever each computer was doing in between, such as a grown-up's panel open on one of them.
    const { timed } = this;
    if (this.team && timed && !timed.endless) timed.endsAt = this.goAt + timed.seconds * 1000;
  }

  update(dt, snapshot) {
    this.updateMaths(dt);
    this.showDemo();
    const { timed, field, team } = this;
    this.field.update(dt, snapshot, {
      aspect: this.session.camera.aspect,
      // Together, once the time is up nothing more pops here, while the last pops from friends' games come in.
      popping: team?.closing == null,
      spawning: true,
      showHands: true,
    });
    if (!timed) return;
    // Friends see each score as it goes up, and the glove where the hand is.
    if (field.total !== this.sentScore) {
      this.sentScore = field.total;
      this.friends.sendScore(field.total, this.sinceGo);
    }
    this.friends.sendMove('hand', this.handState(), this.sinceGo);
    if (this.shared?.host) this.friends.sendMove('world', this.worldState(), this.sinceGo);
    else this.showHostsSum();
    this.showFriendsGloves(dt);
    if (timed.endsAt !== null) timed.left = Math.max(0, (timed.endsAt - performance.now()) / 1000);
    else if (!timed.endless) timed.left = Math.max(0, timed.left - dt);
    this.showProgress();
    if (team) this.updateTeam(dt);
    else if (timed.left === 0) this.session.finish();
  }

  /**
   * Together: the game is won, for everyone, as soon as the team has popped enough between them. When the time
   * is up first, a moment is left for the last pops on friends' computers to arrive, and then it's over.
   */
  updateTeam(dt) {
    const { team, timed } = this;
    // Once it has ended on a friend's computer it's over for the team, the way it ended there.
    const you = this.friends.room.you;
    const theirs = [...this.friends.results].find(([id]) => id !== you)?.[1] ?? this.friendOver();
    if (theirs ? theirs.won : this.teamTotal >= team.goal) {
      team.won = true;
      this.session.finishLine = DID_IT_TOGETHER;
      this.session.finish();
    } else if (theirs) {
      this.endLost();
    } else if (team.closing != null) {
      team.closing -= dt;
      if (team.closing <= 0) this.endLost();
    } else if (timed.left === 0) {
      team.closing = TEAM.grace;
    }
  }

  /**
   * Together: a friend whose game is over, though how it ended never got here, as when this computer's connection
   * went for a moment just then. The room still says who's playing and who has finished. With time still on the
   * clock, or no clock, their game can only have ended because the team had enough: that's taken as how they
   * finished, and returned. With the time nearly up, this computer's own clock decides, as theirs did.
   */
  friendOver() {
    const { team, timed, friends } = this;
    for (const friend of friends.current?.friends ?? []) {
      const member = friends.room.members.find((each) => each.id === friend.id);
      if (!member || friend.gone) continue;
      if (member.racing) team.racing.add(friend.id);
      else if (team.racing.has(friend.id) && !friends.results.has(friend.id) && (timed.endless || timed.left > TEAM.grace + 1)) {
        const result = { ms: Math.round(this.sinceGo), won: true, dropped: this.scores.get(friend.id) ?? 0 };
        friends.results.set(friend.id, result);
        return result;
      }
    }
    return null;
  }

  /**
   * Together: whether the team's game was lost. A game that ended lost here is won after all if it was won on a
   * friend's computer, as when the team's last pop landed there just as the time was up here: every card says
   * the same in the end.
   */
  get teamLost() {
    const you = this.friends.room.you;
    return this.lost && ![...this.friends.results].some(([id, result]) => id !== you && result.won);
  }

  get teamTitle() {
    return this.teamLost ? TEAM_LOST_TITLE : this.mathsOn ? TEAM_SUMS_TITLE : TEAM_TITLE;
  }

  /**
   * Together: the line on the finish card that says what the team did between them, and its big button. Filled
   * in again whenever a friend's ending arrives, so a card that said the time was up says it was won after all.
   */
  showTeamCard() {
    const { team } = this;
    if (!team || !this.friends.current?.team) return;
    const lost = this.teamLost;
    // Won, the team had what it takes, even where the last of the scores never got to this computer.
    const all = lost ? this.teamTotal : Math.max(this.teamTotal, team.goal);
    const what = this.mathsOn ? 'got' : 'popped';
    const things = this.mathsOn ? 'right' : 'balloons';
    const story = byId('finish-story');
    story.textContent = lost ? `You ${what} ${all} of ${team.goal} ${this.mathsOn ? 'right ' : ''}together.` : `You ${what} ${all} ${things} together!`;
    story.hidden = false;
    byId('finish-hero').textContent = String(all);
    if (this.lost && !lost && !team.wonAfterAll) {
      // It ended lost here and was won on a friend's computer: the card says so now, with the cheer it didn't have.
      team.wonAfterAll = true;
      this.session.hud.confetti.start();
      const again = document.querySelector('#screen-finish .finish-actions .big-button');
      if (again) again.textContent = this.session.shell?.againLabel ?? 'Play again';
    }
  }

  /** The game is over and wasn't won: it ends there, kindly, with no cheering, and can be tried again. */
  endLost() {
    const { session } = this;
    this.lost = true;
    session.finishLine = AWAY_FINISH;
    session.finish();
    session.hud.confetti.stop();
    const again = document.querySelector('#screen-finish .finish-actions .big-button');
    if (again) again.textContent = 'Try again';
  }

  /**
   * The child's hand got to a balloon, and it's gone here at once. The server says whose it is: the first
   * hand to get there, here or on a friend's computer. right is whether it was the right answer, or a balloon
   * with no sum on it.
   */
  claimBalloon(balloon, side, right) {
    this.myClaims.set(balloon.id, { side, right, number: balloon.number });
    this.friends.claim(balloon.id);
  }

  /** A balloon went to someone. It pops here too, it counts if it was this child's, and a right answer moves the sum on. */
  claimed({ k, by }) {
    if (!this.shared) return;
    const mine = by === this.friends.room.you ? this.myClaims.get(k) : null;
    const balloon = this.field.removeShared(k, { burst: !mine });
    if (mine?.right) this.field.score(mine.side);
    const number = this.myClaims.get(k)?.number ?? balloon?.number;
    if (this.shared.host && this.deck && this.question && number === this.question.answer) this.rightAnswer(this.field.total);
  }

  /** The host's balloons, for friends' games: each [id, x, y, r, colour, number, flags], and the sum. */
  worldState() {
    const { field, question } = this;
    const { width, height } = field;
    const b = field.balloons
      .filter((balloon) => !field.gone.has(balloon.id) && balloon.y > -balloon.r * 3 && !balloon.basket)
      .slice(0, 24)
      .map((balloon) => {
        const right = balloon.number !== undefined && balloon.number === field.rightNumber;
        const flags = (balloon.arrived ? 1 : 0) | (balloon.leaving ? 2 : 0) | (right ? 4 : 0);
        return [balloon.id, round3(balloon.x / width), round3(balloon.y / height), round3(balloon.r / height), balloon.sprite, balloon.number ?? -1, flags];
      });
    return { b, q: question ? `${question.shown} = ?` : this.answered, qa: question ? 0 : 1 };
  }

  /** On a friend's game, the host's sum, as the host's game asks it. */
  showHostsSum() {
    const latest = this.worldTrack?.latest;
    if (!this.mathsOn || !latest) return;
    const shown = byId('maths-question');
    const text = latest.q ? `${latest.q}${latest.qa ? ' ✓' : ''}` : '';
    if (shown.textContent !== text) shown.textContent = text;
    shown.classList.toggle('is-right', Boolean(latest.qa && latest.q));
  }

  /** Where the child's glove is, for friends' games: across and down the screen, and its points in palms. */
  handState() {
    const { field } = this;
    const glove = field.gloves[field.side];
    if (!glove.visible) return { x: 0, y: 0, v: 0, o: 0, p: [] };
    const palm = field.palmSize;
    return {
      x: round2(glove.x / field.width) || 0,
      y: round2(glove.y / field.height) || 0,
      v: 1,
      o: glove.status === 'open' ? 1 : 0,
      p: glove.points.flatMap(({ x, y }) => [round2(x / palm), round2(y / palm)]),
    };
  }

  /** Each friend's glove where their hand is, a moment ago, fading in and out as it comes and goes. */
  showFriendsGloves(dt) {
    const { field } = this;
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
      glove.visible = true;
      glove.status = at.o ? 'open' : 'closed';
      glove.x = at.x * field.width;
      glove.y = at.y * field.height;
      glove.points.forEach((point, index) => {
        point.x = at.p[index * 2] * field.palmSize;
        point.y = at.p[index * 2 + 1] * field.palmSize;
      });
    }
  }

  idle(dt, snapshot) {
    if (this.demoShown) {
      this.demoShown = false;
      document.body.dataset.popDemo = 'off';
    }
    const counting = this.session.screen === 'countdown';
    this.field.update(dt, snapshot, {
      aspect: this.session.camera.aspect,
      // During the countdown the glove comes out, so the child can find their hand.
      showHands: counting,
      spawning: !counting,
    });
  }

  render() {
    this.field.render();
  }

  /** Play is over: a power-up stops, and the bluebird flies off rather than waiting by the finish card. */
  finished() {
    this.field.endPlay();
    // Together, w says whether the team made it, which ends the game the same way for a friend still playing.
    if (this.timed) this.friends.finished(this.sinceGo, { n: this.field.total, w: this.lost ? 0 : 1 });
    // Friends' gloves go with the end of the game, rather than staying where they last were, and the
    // balloons behind the finish card are this game's own again.
    for (const each of this.friendsGloves) each.glove.visible = false;
    this.shared = null;
    this.field.setShared(null);
  }

  prompt(snapshot, dt) {
    const { session } = this;
    const needed = session.handsPrompt(snapshot, dt);
    // The hand can rest here whenever it likes. A closed hand only matters when it's trying
    // to pop something, which is the bump below.
    if (needed && !needed.key.startsWith('closed')) return needed;

    const glove = this.field.gloves[snapshot.side];
    // The second time round it's only there to read.
    if (glove.burnt > 0) return { key: `cool-${snapshot.side}`, text: COOL_IT, side: null, silent: this.burns > 1, asks: 'open' };

    if (this.bump && session.playSeconds - this.bump.at < BUMP_PROMPT_SECONDS) {
      const { side } = this.bump;
      return { key: `bump-${side}`, text: OPEN_TO_POP[side], side, asks: 'open' };
    }
    if (!this.mathsOn && session.playSeconds < POP_HINT_SECONDS) {
      return { key: 'pop-hint', text: POP_HINT, side: null, asks: 'open' };
    }
    return null;
  }

  summary() {
    const { total, popped, wrong, caught, prizes } = this.field.info;
    byId('finish-prizes').textContent = Object.entries(prizes)
      .filter(([, count]) => count > 0)
      .map(([kind, count]) => `${PRIZE_MARKS[kind]} ${count}`)
      .join('   ');
    const { team } = this;
    // Together, the card is the team's: what everyone popped between them, and whether that was enough. Its title
    // and its line are filled in with the list of who popped what, now and whenever a friend's ending arrives:
    // see showTeamCard.
    this.friends.showResults();
    const story = byId('finish-story');
    if (!this.friends.current) {
      document.querySelector('#screen-finish h2').textContent = this.lost ? AWAY_TITLE : FINISH;
      story.textContent = this.lost ? `${this.field.away} balloons floated off into the sky before ${this.field.goal} were popped. You popped ${total}.` : '';
    }
    if (!team) story.hidden = !this.lost || Boolean(this.friends.current);
    // Too many floating away means that level again. A game with friends is on the host's level, so it
    // doesn't move the child's own level on.
    const all = team ? (this.lost ? this.teamTotal : Math.max(this.teamTotal, team.goal)) : total;
    return { hero: all, noun: 'game', rows: { popped, wrong, prizes: caught }, won: !this.lost, countsForLevel: !this.friends.current };
  }
}

new GameSession({
  // What the open and closed hand do here, for the hand shapes in the grown-ups' panel: see core/shapes.js.
  moves: { open: 'Pop', closed: null },
  shell: {
    title: 'Balloon Pop',
    startLabel: 'Let’s pop!',
    againLabel: 'Play again',
    finishTitle: 'You popped them all!',
    heroMark: '🎈',
    heroNoun: 'balloons',
    extraRows: [{ id: 'popped', label: 'Balloons popped' }, { id: 'wrong', label: 'Too-hot balloons' }, { id: 'prizes', label: 'Prizes caught' }],
    hudTop: `
      <div class="hud-top">
        <div class="chips">
          <div class="chip"><span id="chip-popped-label" class="chip-label">Popped</span><span id="chip-popped" class="chip-value">0 of 20</span></div>
          <div class="chip chip-prizes"><span class="chip-label">Prizes</span><span id="chip-prizes" class="chip-value">0</span></div>
          <div id="chip-time-box" class="chip" hidden><span class="chip-label">Time</span><span id="chip-time" class="chip-value">1:00</span></div>
          <div id="chip-away-box" class="chip chip-away" hidden><span class="chip-label">Floated away</span><span id="chip-away" class="chip-value">0</span></div>
        </div>
        <div class="race-progress" aria-hidden="true"><div id="race-progress-fill" class="race-progress-fill"></div></div>
        <ol id="pop-scores" class="pop-scores" hidden></ol>
      </div>
      <div id="maths-question" class="maths-question" aria-live="polite"></div>
      <div class="pop-demo" data-own aria-hidden="true">
        <svg viewBox="0 0 220 220">
          <g class="demo-balloon">
            <path class="demo-string" d="M150 112q-10 22 2 44" />
            <ellipse cx="150" cy="62" rx="38" ry="46" />
            <path d="M150 106l-8 11h16z" />
            <text class="demo-number" x="150" y="64">3</text>
          </g>
          <path class="demo-burst" d="M150 4v14M150 106v14M92 62h14M194 62h14M109 21l10 10M181 93l10 10M191 21l-10 10M119 93l-10 10" />
          <g class="demo-hand">
            <rect x="40" y="150" width="46" height="42" rx="16" />
            <path class="demo-finger" d="M46 156V128" />
            <path class="demo-finger" d="M57 152V118" />
            <path class="demo-finger" d="M69 152V116" />
            <path class="demo-finger" d="M80 156V124" />
            <path class="demo-thumb" d="M86 176L104 162" />
          </g>
        </svg>
      </div>`,
    panelSettings: `
      <fieldset class="choice">
        <legend>Balloons to pop</legend>
        <label><input type="radio" name="balloons" value="20"> 20</label>
        <label><input type="radio" name="balloons" value="40"> 40</label>
        <label><input type="radio" name="balloons" value="60"> 60</label>
      </fieldset>
      <fieldset class="choice">
        <legend>Balloons that float away</legend>
        <label><input type="radio" name="away" value="count"> They count: when too many have floated away, the game is over</label>
        <label><input type="radio" name="away" value="gentle"> Gentle: they cost nothing, and the levels climb gently</label>
      </fieldset>
      <fieldset class="choice">
        <legend>With friends</legend>
        <label><input type="radio" name="popFriends" value="together"> Together: pop them as a team, enough between you before the time is up (on Gentle there’s no clock)</label>
        <label><input type="radio" name="popFriends" value="against"> Against each other: whoever pops the most in the time comes first</label>
      </fieldset>
      <fieldset class="choice">
        <legend>Balloon speed</legend>
        <label><input type="radio" name="pace" value="slow"> Slow</label>
        <label><input type="radio" name="pace" value="medium"> Medium</label>
        <label><input type="radio" name="pace" value="fast"> Fast</label>
      </fieldset>
      <fieldset class="choice">
        <legend>Reach help (balloons drift towards an open hand)</legend>
        <label><input type="radio" name="reach" value="none"> None</label>
        <label><input type="radio" name="reach" value="little"> A little</label>
        <label><input type="radio" name="reach" value="lots"> A lot</label>
      </fieldset>
      <fieldset class="choice">
        <legend>Maths challenge (the right answer pops, and the wrong one burns the glove until the hand has been held open to cool it)</legend>
        <label><input type="radio" name="maths" value="off"> Off</label>
        <label><input type="radio" name="maths" value="add"> Adding, up to 10</label>
        <label><input type="radio" name="maths" value="addTake"> Adding and taking away, up to 20</label>
        <label><input type="radio" name="maths" value="times"> Times tables</label>
      </fieldset>`,
  },
  defaults: { balloons: 20, pace: 'slow', reach: 'little', maths: 'off', away: 'count', popFriends: 'together' },
  choices: { balloons: Number, pace: String, reach: String, maths: String, away: String, popFriends: String },
  // These go on to a game that's being played at once. The rest, and the level, start it again: see core/settings.js.
  atOnce: ['pace', 'reach'],
  // Several can play at one camera, each with a glove of their own, all popping into the one count.
  group: true,
  tagline: (side) => `Pop the balloons with your open ${side} hand!`,
  finishLine: 'You popped them all!',
  portraits: () => renderPortraits(ROSTER),
  createSound: (options) => new Sound({
    ...options,
    sounds: { pop: new URL('./audio/pop.ogg', import.meta.url), sizzle: new URL('./audio/sizzle.ogg', import.meta.url) },
  }),
  createGame: (session) => new BalloonGame(session),
}).start();
