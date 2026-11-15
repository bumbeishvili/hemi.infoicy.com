// Bounce Back: tennis with a big, slow, floaty ball, on a sunny court by the sea. The child's open hand is the
// racket: moving the hand moves it, and the ball only goes back over the net when the hand is open. Against
// the computer, or a friend on their own computer. The rules are in rally.js, the court is drawn by court.js,
// and the players' pictures come from players.js.
import { renderPortraits } from '../../core/body/portraits.js';
import { byId as characterWithId, ROSTER } from '../../core/body/roster.js';
import { Track } from '../../core/friends.js';
import { FriendsPanel } from '../../core/friends-ui.js';
import { Glove } from '../../core/glove.js';
import { GameSession, SPOKEN } from '../../core/session.js';
import { Sound } from '../../core/sound.js';
import { Court } from './court.js';
import { BallFollower } from './follow.js';
import { renderPlayers } from './players.js';
import { Rally } from './rally.js';
import {
  aimAt, bounceNewAt, clamp, COURT, courtLevel, crossingSeconds, gravityFor, HARD, HELP, keepOnSide, modeWord,
  otherSide, PACE_NAMES, POINTS, RACKET, readMode, shotTo, sideAt, signOf, spreadFor, teamHits, touches,
} from './rules.js';

const byId = (id) => document.getElementById(id);
const HINT = ['Hit the ball with your open hand!', 'გაშლილი ხელით დაარტყი ბურთს!'];
const PRAISE = ['Nice one!', 'Great job!', 'Way to go!'];
const HINT_SECONDS = 9;
const FILM_SECONDS = 25;
const RESTING_AFTER = 15; // The ball has waited this long for a hand that isn't open: resting is fine.
const PRIZE_MARKS = { star: '⭐', shell: '🐚', trophy: '🏆', gem: '💎' };
const PRIZE_LANDS_AFTER = 750;
// Who the computer is: a different friend at each level, never the child's own character.
const OPPONENTS = ['mochi', 'truffle', 'frost', 'bramble', 'kit', 'nova', 'tur', 'widget', 'cinder', 'giraffe'];

// Playing with a friend, each on their own computer. See core/friends-ui.js for what each of these is.
const BOUNCE_WORDS = {
  toggle: 'Play with a friend',
  make: 'Make a game',
  codeLabel: 'A friend’s game code',
  codeName: 'Game code',
  how: 'Tell your friend the code. Then you both press <b>Let’s play!</b>',
  // Together or against each other, as whoever made the game chooses: see teams in core/friends-ui.js.
  together: 'Together',
  against: 'Against each other',
  howTogether: 'Tell your friend the code. Then you both press <b>Let’s play!</b>, and keep the ball going between you.',
  teamTitle: 'You did it together!',
  leave: 'Leave this game',
  privacy: 'Only your name, who you play as, whether you chose together or against each other, where your racket is and where the ball goes are sent to your friend. The camera picture stays on this computer.',
  alone: 'Play on your own',
  full: 'That game already has 2 players.',
  lost: 'Can’t reach the game. Check the internet, then try again.',
  left: 'You’ve left the game.',
  badCode: 'A game code is 3 letters and numbers.',
  busy: 'Playing',
  still: 'still playing',
};
// A friend's racket between what their game sends: where it is, how big, and their glove's points, which go
// smoothly from one to the next. Whether it can be seen and is open change half way.
const RACKET_TRACK = { lerp: ['x', 'y', 'r', 'g'], lists: ['p'], steps: ['v', 'o'] };
const round2 = (value) => Math.round(value * 100) / 100;
const round3 = (value) => Math.round(value * 1000) / 1000;

class BounceGame {
  chimeOnOpen = false; // The hand opens and closes all the time here, so a chime would be noise.

  constructor(session) {
    this.session = session;
    const { settings } = session;
    this.mode = 'solo';
    this.team = false; // With a friend, playing together rather than against each other: see prepare().
    this.mine = 'A';
    this.rally = null;
    this.follower = null;
    this.friendTrack = null;
    this.art = {};
    this.gloves = { left: new Glove('left'), right: new Glove('right') };
    this.court = new Court(byId('game'), {
      language: () => settings.language,
      prizeTarget: () => {
        const box = byId('chip-prizes')?.getBoundingClientRect();
        return box?.width ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : { x: window.innerWidth / 2, y: 60 };
      },
    });
    this.stats = this.freshStats();
    this.goAt = 0;
    this.praised = 0;
    this.restFor = 0;
    byId('finish-hero')?.closest('.finish-hero')?.insertAdjacentHTML('afterend', '<p id="finish-score" class="finish-score"></p><p id="finish-lost" class="finish-lost" hidden></p><p id="finish-prizes" class="finish-prizes"></p>');
    this.friends = new FriendsPanel({
      game: 'bounce-back',
      linkKey: 'bounce',
      words: BOUNCE_WORDS,
      hello: () => ({ driver: this.myCharacter().id, level: session.levels.current, length: settings.bouncePoints, mode: modeWord(settings.bounceHard, settings.bouncePace) }),
      screen: () => session.screen,
      portraits: () => session.portraits,
      onMove: (id, message) => this.fromFriend(id, message),
      // With the other player gone there's nobody to play, so the game is over.
      onGone: () => {
        if (session.screen === 'playing') session.finish();
      },
      // Whoever won, and then whoever has more points. Equal ones share a place.
      rank: (a, b) => Number(b.won) - Number(a.won) || b.dropped - a.dropped,
      resultText: ({ dropped }) => (this.team ? `${dropped} ${dropped === 1 ? 'hit' : 'hits'}` : `${dropped} ${dropped === 1 ? 'point' : 'points'}`),
      titles: { first: 'You won!', other: 'Great game!' },
      // With a friend, together or against each other: the grown-ups' choice, which the friends box can change too.
      teams: {
        get: () => (settings.bounceFriends === 'against' ? 'against' : 'together'),
        set: (choice) => this.chooseTeams(choice),
      },
      startAfter: byId('start'),
      waitingBefore: byId('screen-finish'),
      resultsAfter: document.querySelector('#screen-finish .finish-hero'),
      finishTitle: document.querySelector('#screen-finish h2'),
    });
    this.events = this.rallyEvents();
    this.court.myGlove = this.gloves[settings.hands];
    this.setUpScene(session.level);
    const game = this;
    this.debug = {
      court: this.court,
      gloves: this.gloves,
      get rally() {
        return game.rally;
      },
      get follower() {
        return game.follower;
      },
      get game() {
        return game;
      },
    };
  }

  freshStats() {
    return { hits: 0, longest: 0, prizes: { star: 0, shell: 0, trophy: 0, gem: 0 } };
  }

  /** The child's own character: whoever they chose in the other games, or Giraffe. */
  myCharacter() {
    return characterWithId(this.session.settings.fighter) ?? ROSTER[0];
  }

  opponentAt(level, mine = this.myCharacter().id) {
    const choices = OPPONENTS.filter((id) => id !== mine);
    return characterWithId(choices[(Math.max(1, level) - 1) % choices.length]);
  }

  /** Pictures of these characters, drawn the first time each is needed. */
  artFor(specs) {
    const needed = specs.filter((spec) => !this.art[spec.id]);
    if (needed.length) {
      try {
        Object.assign(this.art, renderPlayers(needed));
      } catch (error) {
        // Without the pictures the court still works: the players are just not drawn.
        console.warn('Could not draw the players:', error);
        for (const spec of needed) this.art[spec.id] = null;
      }
    }
    return specs.map((spec) => this.art[spec.id]);
  }

  /** Who's where on the court, before a game and while it's played. */
  setUpScene(level, { friend = null } = {}) {
    const me = this.myCharacter();
    const them = friend?.spec ?? this.opponentAt(level, me.id);
    const [myArt, theirArt] = this.artFor([me, characterWithId(them.id) ?? them]);
    const other = otherSide(this.mine);
    this.opponent = them;
    this.court.myGlove = this.gloves[this.session.settings.hands];
    this.court.setPlayers({
      [this.mine]: { spec: me, art: myArt, kind: 'child', name: '', mine: true },
      [other]: { spec: them, art: theirArt, kind: friend ? 'remote' : 'computer', name: friend ? them.name : them.name, mine: false },
    });
    this.updateFlip();
    this.showPlayers();
  }

  /** The child's own half is on the side of the hand they play with. flip is 1 when side A is on the left. */
  updateFlip() {
    const hand = this.session.settings.hands;
    this.court.setFlip((this.mine === 'A') === (hand === 'left') ? 1 : -1);
    document.body.dataset.side = hand;
  }

  /** The sides of the score board, as they are on the court. */
  get leftSide() {
    return this.court.at(signOf('A') * 0.5, 0).x < this.court.cx ? 'A' : 'B';
  }

  showPlayers() {
    const portraits = this.session.portraits ?? {};
    const sides = { [this.mine]: { name: 'You', id: this.myCharacter().id }, [otherSide(this.mine)]: { name: this.opponent.name, id: this.opponent.id } };
    const left = this.leftSide;
    for (const [element, side] of [['score-left', left], ['score-right', otherSide(left)]]) {
      const box = byId(element);
      box.dataset.side = side;
      box.classList.toggle('is-mine', side === this.mine);
      box.querySelector('.score-name').textContent = sides[side].name;
      box.querySelector('.score-face').src = portraits[sides[side].id] ?? '';
    }
  }

  newAt(level) {
    return bounceNewAt(level);
  }

  holdStart(go) {
    return this.friends.holdStart(go);
  }

  setHands(side) {
    this.court.myGlove = this.gloves[side];
    const me = this.court.players[this.mine];
    if (me) me.glove = this.gloves[side];
    for (const glove of Object.values(this.gloves)) glove.hide();
    this.updateFlip();
    this.showPlayers();
  }

  settingChanged(change) {
    // A new character, how hard, how quick and how many points all start with the next game.
    if ('fighter' in change && this.session.screen !== 'playing' && this.session.screen !== 'countdown') this.setUpScene(this.session.level);
    if ('fighter' in change || 'bouncePoints' in change || 'bounceHard' in change || 'bouncePace' in change || 'bounceFriends' in change) {
      if (this.friends.room.inRoom) this.friends.room.tell(this.friends.hello());
    }
    if ('bounceFriends' in change) this.friends.showTeams();
  }

  /** Together or against each other, chosen in the friends box: kept with the grown-ups' settings, and shown there. */
  chooseTeams(choice) {
    this.session.changeSettings({ bounceFriends: choice });
    const input = document.querySelector(`input[name="bounceFriends"][value="${choice}"]`);
    if (input) input.checked = true;
  }

  /** How long since "GO!", by the clock on the wall, for friends' games. */
  get sinceGo() {
    return performance.now() - this.goAt;
  }

  /* ---------- a new game ---------- */

  prepare(level) {
    const { settings } = this.session;
    const friendly = this.friends.current;
    const friend = friendly?.friends?.[0] ?? null;
    this.mode = friend ? (friendly.hosting ? 'host' : 'guest') : 'solo';
    this.mine = this.mode === 'guest' ? 'B' : 'A';
    const playLevel = friendly?.level ?? level;
    const { hard, pace } = friendly ? readMode(friendly.mode) : { hard: settings.bounceHard, pace: settings.bouncePace };
    this.hard = HARD.includes(hard) ? hard : 'gentle';
    this.pace = PACE_NAMES.includes(pace) ? pace : 'slow';
    const points = friendly ? (POINTS.includes(friendly.length) ? friendly.length : 5) : (POINTS.includes(settings.bouncePoints) ? settings.bouncePoints : 5);
    // Together with a friend, there are no points: the two of them make so many hits between them.
    this.team = Boolean(friendly?.team);
    this.goal = this.team ? teamHits(points) : points;
    this.teamShown = 0;
    this.playLevel = playLevel;
    document.body.toggleAttribute('data-friends-race', Boolean(friendly));
    this.stats = this.freshStats();
    this.praised = 0;
    this.restFor = 0;
    this.hitOnce = false;
    this.lastScores = { A: 0, B: 0 };
    this.lastStroke = -1;
    this.lastBall = null;
    this.ballSince = 0;
    this.friendTrack = friend ? new Track(RACKET_TRACK) : null;
    this.friend = friend;
    if (this.mode === 'guest') {
      this.rally = null;
      this.follower = new BallFollower();
    } else {
      this.follower = null;
      this.rally = new Rally({ level: playLevel, pace: this.pace, hard: this.hard, goal: this.goal, mode: this.mode === 'host' ? 'host' : 'solo', team: this.team, events: this.events });
    }
    const plan = courtLevel(playLevel);
    const extras = this.mode === 'solo';
    this.court.setLevel(playLevel, { flags: extras ? plan.flags : 0, breeze: extras && plan.breeze > 0 });
    this.court.reset();
    this.setUpScene(playLevel, { friend });
    byId('score-goal').textContent = this.team ? `0 of ${this.goal} together` : `First to ${this.goal}`;
    document.body.toggleAttribute('data-friends-team', this.team);
    // Together, the two numbers are each one's hits, which add up.
    document.querySelector('#score-board .score-dash').textContent = this.team ? '+' : ':';
    byId('sum-left-points').closest('tr').hidden = this.team;
    // Prizes only come from level 2, on the child's own.
    document.body.dataset.prizes = extras && plan.stars ? 'on' : 'off';
    byId('chip-prizes').textContent = '0';
    this.showScore(true);
  }

  begin() {
    this.goAt = performance.now();
    // The glove has been out since the countdown, so the first serve can wait near it.
    this.rally?.begin({ A: this.myRacket(this.session.monitor.snapshot), B: this.mode === 'host' ? this.friendRacket() : undefined });
    this.session.sound.startLoop('waves', 0.16);
    // The court's own new things have their labels at the start.
    const { court, rally } = this;
    if (rally?.castles.length) court.introduce('castle', () => {
      const castle = rally.castles.find((each) => each.standing);
      return castle ? { ...court.at(castle.u, 0.1, 0.56), r: court.scale * 0.1 } : null;
    });
    if (rally?.plan.breeze) court.introduce('breeze', () => ({ ...court.at(0, COURT.net + 0.36, 0.96), r: court.scale * 0.05 }));
  }

  /** What the rules say happens, heard and seen. */
  rallyEvents() {
    const { sound } = this.session;
    const court = this.court;
    return {
      onServe: (side, kind) => {
        if (kind !== 'beach') court.introduce(kind, () => this.ballOnScreen());
      },
      onHit: (side, { kind, at }) => {
        const mine = side === this.mine;
        sound.play('hit', { gain: mine ? 0.7 : 0.5, rate: (mine ? 0.95 : 1.08) + Math.random() * 0.08 });
        if (kind === 'bubble') sound.play('boing', { gain: 0.25, rate: 1.4 });
        court.hit(side, at);
        if (mine) this.myHit();
        if (this.mode === 'host') this.sayBall();
      },
      onBounce: (side, { u, speed, dead }) => {
        if (speed > 0.1) sound.play('bounce', { gain: clamp(speed * 0.7, 0.12, 0.45) * (dead ? 0.7 : 1), rate: 1.05 + Math.random() * 0.1 });
        court.bounce(u, speed);
      },
      onNet: () => sound.play('bounce', { gain: 0.3, rate: 1.4 }),
      onWait: () => {
        if (this.mode === 'host') this.sayBall();
      },
      onSwing: (side) => {
        sound.play('whoosh', { gain: 0.35, rate: 1.1 });
        court.mood(side, 'oops');
      },
      onPoint: (winner) => this.pointWon(winner),
      onItem: (item) => court.introduce(item.kind, () => (item.caught || item.age >= item.life ? null : { ...court.at(item.u, item.h), r: court.scale * 0.08 })),
      onPrize: (kind, at) => {
        this.stats.prizes[kind] += 1;
        sound.play('sparkle', { gain: 0.3, rate: 1 + Math.random() * 0.1 });
        court.prize(kind, at);
        setTimeout(() => this.showPrizes(true), PRIZE_LANDS_AFTER);
      },
      onPower: (kind) => {
        sound.handsOpen();
        court.introduce(kind, () => {
          const glove = this.gloves[this.session.settings.hands];
          return { x: glove.x, y: glove.y, r: court.palmSize };
        });
      },
      onFlag: (lit) => {
        if (lit === 1) court.introduce('flags', () => ({ ...court.at(0, 0.8, 1.08), r: court.scale * 0.05 }));
      },
      onCastle: (castle, what) => {
        if (what === 'fell') {
          court.castleFalls(castle);
          sound.play('bounce', { gain: 0.4, rate: 0.7 });
        } else {
          court.castleBuilt(castle);
        }
      },
      onSave: (at) => {
        court.save(at);
        sound.play('boing', { gain: 0.35, rate: 1.25 });
      },
    };
  }

  myHit() {
    this.stats.hits += 1;
    this.hitOnce = true;
    this.restFor = 0;
  }

  pointWon(winner) {
    const { sound } = this.session;
    this.court.mood(winner, 'cheer');
    if (winner === this.mine) {
      sound.play('cheer', { gain: 0.18 });
      sound.star();
      // Praise now and then, never over anything else being said.
      if (this.praised % 2 === 0) sound.say(PRAISE[Math.floor(this.praised / 2) % PRAISE.length], { ifQuiet: true });
      this.praised += 1;
    } else {
      sound.play('tick', { gain: 0.3 });
    }
    const box = byId(winner === this.leftSide ? 'score-left' : 'score-right');
    box.classList.remove('is-up');
    void box.offsetWidth;
    box.classList.add('is-up');
    if (this.mode === 'host') this.sayBall();
  }

  /* ---------- each frame ---------- */

  update(dt, snapshot) {
    this.followHand(dt, snapshot);
    const mine = this.myRacket(snapshot);
    this.lastRacket = mine;
    if (this.mode === 'guest') this.updateGuest(dt, mine);
    else this.updateRally(dt, mine);
    if (this.friends.current) this.friends.sendMove('racket', this.racketState(), this.sinceGo);
    this.showScore();
    this.watchResting(dt, mine);
    this.showFilm();
    this.court.update(dt, this.model(dt));
    if (this.gameOver() && this.session.screen === 'playing') this.session.finish();
  }

  /** The glove follows the hand in play, on the child's own half of the court. */
  followHand(dt, snapshot) {
    const { court } = this;
    const side = snapshot.side;
    for (const [hand, glove] of Object.entries(this.gloves)) {
      if (hand !== side) {
        glove.hide();
        continue;
      }
      glove.follow(snapshot[side], dt, { aspect: this.session.camera.aspect, palmSize: court.palmSize, width: court.width, height: court.height });
      if (!glove.visible) continue;
      const net = court.at(signOf(this.mine) * 0.08, 0).x;
      if (net > court.cx) glove.x = Math.max(glove.x, net);
      else glove.x = Math.min(glove.x, net);
      glove.y = Math.min(glove.y, court.groundY - COURT.ball * court.scale);
    }
  }

  /** The child's racket, from their glove. A hand that's missing or unsure is never open. */
  myRacket(snapshot) {
    const glove = this.gloves[snapshot.side];
    const at = this.court.fromScreen(glove.x, glove.y);
    const help = HELP[this.session.settings.bounceHelp] ?? HELP.little;
    return {
      visible: glove.visible,
      open: glove.visible && snapshot.handOpen === true,
      ...keepOnSide(this.mine, at.u, at.h),
      radius: RACKET.radius * help.size,
      pull: help.pull,
    };
  }

  /** A friend's racket, as their game says, a moment ago. */
  friendRacket(now = performance.now()) {
    const at = this.friendTrack?.at(now);
    if (!at || !at.v) return { visible: false, open: false, u: signOf(otherSide(this.mine)) * 0.6, h: 0.45, radius: RACKET.radius, pull: 0 };
    return { visible: true, open: at.o === 1, u: at.x, h: at.y, radius: at.r || RACKET.radius, pull: at.g ?? 0 };
  }

  updateRally(dt, mine) {
    const inputs = { A: mine };
    if (this.mode === 'host') inputs.B = this.friendRacket();
    this.rally.update(dt, inputs);
    if (this.mode === 'host') this.friends.sendMove('ball', this.rally.wire(), this.sinceGo);
  }

  /** The ball as the friend's game sends it, and the child here hitting it, which shows at once. */
  updateGuest(dt, mine) {
    const now = performance.now();
    const envFor = (kind) => ({ gravity: gravityFor(crossingSeconds(this.pace, this.playLevel, kind, this.hard)), wind: 0 });
    const ball = this.follower.ballAt(now, envFor);
    this.guestBall = ball;
    this.guestRacket = mine;
    if (!ball) return;
    const side = sideAt(ball.u);
    const score = this.follower.score;
    const forMe = side === this.mine && ((ball.state === 'flying' && ball.by !== this.mine) || ball.state === 'waiting' || (ball.state === 'held' && score?.server === this.mine));
    if (forMe && !this.follower.waitingForHit && !score?.over && touches(ball, mine)) {
      // Together, a long rally is the whole idea, so shots don't drift off the friend's hand as it goes on.
      const target = aimAt(otherSide(this.mine), this.friendRacket(now), spreadFor(this.hard, this.team ? 0 : score?.rally ?? 0, true, this.playLevel));
      const shot = shotTo(ball, target, crossingSeconds(this.pace, this.playLevel, ball.kind, this.hard), envFor(ball.kind));
      const hit = { u: shot.from.u, h: shot.from.h, vu: shot.vu, vh: shot.vh, kind: ball.kind, by: this.mine };
      this.follower.hitHere(hit, ball.stroke, now);
      this.sayNow('shot', { k: ball.stroke, x: round3(hit.u), y: round3(hit.h), vx: round3(hit.vu), vy: round3(hit.vh) });
      this.session.sound.play('hit', { gain: 0.7, rate: 0.95 + Math.random() * 0.08 });
      this.court.hit(this.mine, hit);
      this.myHit();
    }
    // What the other game's ball did since the last frame: their hits, bounces and points.
    if (this.lastBall) {
      if (ball.stroke > this.lastStroke && ball.by === otherSide(this.mine) && this.lastBall.stroke >= 0) {
        this.session.sound.play('hit', { gain: 0.5, rate: 1.08 });
        this.court.hit(ball.by, ball);
      }
      if (this.lastBall.vh < -0.05 && ball.vh > 0 && ball.h < COURT.ball * 1.6) this.events.onBounce(side, { u: ball.u, speed: -this.lastBall.vh });
    }
    if (score) {
      for (const each of ['A', 'B']) if (score[each] > this.lastScores[each]) this.pointWon(each);
      this.lastScores = { A: score.A, B: score.B };
      this.stats.longest = Math.max(this.stats.longest, score.rally ?? 0);
    }
    this.ballSince = this.lastBall && this.lastBall.state === ball.state ? this.ballSince + dt : 0;
    this.lastStroke = ball.stroke;
    this.lastBall = { ...ball };
  }

  /** Something from the friend's game: where their racket is, the ball, or a hit. */
  fromFriend(id, message) {
    if (!this.friends.current?.racers.includes(id) || this.session.screen !== 'playing') return;
    const now = performance.now();
    if (message.t === 'racket') this.friendTrack?.push(message, now);
    else if (message.t === 'ball' && this.mode === 'guest') this.follower?.push(message, now);
    else if (message.t === 'shot' && this.mode === 'host') this.friendHit(message, now);
  }

  /** The friend hit the ball, as their game saw it. It goes back from there, at once. */
  friendHit(message, now) {
    const offset = this.friendTrack?.offset;
    const elapsed = Number.isFinite(offset) ? Math.max(0, (now - (message.ms + offset)) / 1000) + 0.03 : 0.08;
    this.rally.applyHit(otherSide(this.mine), { k: message.k, u: message.x, h: message.y, vu: message.vx, vh: message.vy, elapsed });
  }

  /** Sent straight away, rather than with the next of the 10 a second. */
  sayNow(kind, state) {
    if (this.friends.current && this.friends.room.inRoom) this.friends.room.say({ t: kind, ms: Math.round(this.sinceGo), ...state });
  }

  sayBall() {
    this.sayNow('ball', this.rally.wire());
  }

  /** Where the child's racket is, for the friend's game: on the court, and its glove's points, in palms. */
  racketState() {
    const glove = this.gloves[this.session.settings.hands];
    const help = HELP[this.session.settings.bounceHelp] ?? HELP.little;
    const base = { r: round3(RACKET.radius * help.size), g: round2(help.pull) };
    if (!glove.visible) return { x: 0, y: 0, v: 0, o: 0, ...base, p: [] };
    const { court } = this;
    const at = keepOnSide(this.mine, court.fromScreen(glove.x, glove.y).u, court.fromScreen(glove.x, glove.y).h);
    const palm = court.palmSize;
    return {
      x: round3(at.u),
      y: round3(at.h),
      v: 1,
      o: this.lastRacket?.open ? 1 : 0,
      ...base,
      p: glove.points.flatMap(({ x, y }) => [round2((x / palm) * court.flip), round2(y / palm)]),
    };
  }

  /** What the court draws now. */
  model() {
    if (this.mode === 'guest') {
      const ball = this.guestBall ? { ...this.guestBall, since: this.ballSince, side: sideAt(this.guestBall.u) } : null;
      const other = otherSide(this.mine);
      const theirs = this.friendRacket();
      const points = { [other]: this.friendTrack?.at(performance.now())?.p ?? null };
      return { ball, rackets: { [this.mine]: this.guestRacket, [other]: theirs }, points, rally: this.follower.score?.rally ?? 0 };
    }
    const { rally } = this;
    const other = otherSide(this.mine);
    const points = this.mode === 'host' ? { [other]: this.friendTrack?.at(performance.now())?.p ?? null } : {};
    return {
      ball: rally.ball,
      rackets: { A: rally.players.A.racket, B: rally.players.B.racket },
      points,
      items: rally.items,
      power: rally.power,
      castles: rally.castles,
      flagsLit: rally.flagsLit,
      wind: rally.wind,
      rally: rally.rallyHits,
    };
  }

  /** The score now, by side. */
  scores() {
    if (this.mode === 'guest') {
      const score = this.follower?.score;
      return { A: score?.A ?? 0, B: score?.B ?? 0 };
    }
    return { ...(this.rally?.scores ?? { A: 0, B: 0 }) };
  }

  winner() {
    if (this.mode === 'guest') return this.follower?.score?.winner ?? null;
    return this.rally?.winner ?? null;
  }

  gameOver() {
    if (this.mode === 'guest') {
      // The other game says so, or its player has finished.
      const host = this.friend?.id;
      return Boolean(this.follower?.score?.over || (host && this.friends.results.has(host)));
    }
    return Boolean(this.rally?.over);
  }

  showScore(force = false) {
    const scores = this.scores();
    const key = `${scores.A}:${scores.B}:${this.leftSide}`;
    if (!force && key === this.scoreKey) return;
    this.scoreKey = key;
    const left = this.leftSide;
    byId('score-left').querySelector('.score-value').textContent = String(scores[left]);
    byId('score-right').querySelector('.score-value').textContent = String(scores[otherSide(left)]);
    if (this.team) this.showTeamHits(scores.A + scores.B);
  }

  /** Together: how many hits the two of them have made, of how many, and a cheer for every five. */
  showTeamHits(total) {
    const shown = Math.min(total, this.goal);
    byId('score-goal').textContent = `${shown} of ${this.goal} together`;
    if (shown <= this.teamShown) return;
    const fives = Math.floor(shown / 5) > Math.floor(this.teamShown / 5);
    this.teamShown = shown;
    if (!fives || this.session.screen !== 'playing') return;
    const { sound } = this.session;
    sound.star();
    for (const side of ['A', 'B']) this.court.mood(side, 'cheer');
    if (this.praised % 2 === 0) sound.say(PRAISE[Math.floor(this.praised / 2) % PRAISE.length], { ifQuiet: true });
    this.praised += 1;
  }

  showPrizes(landed = false) {
    const total = Object.values(this.stats.prizes).reduce((sum, count) => sum + count, 0);
    byId('chip-prizes').textContent = String(total);
    if (!landed) return;
    const box = byId('chip-prizes').closest('.chip');
    box.classList.remove('is-caught');
    void box.offsetWidth;
    box.classList.add('is-caught');
  }

  /** Whether the ball is the child's to hit now: coming to them, or waiting for them. */
  ballForMe() {
    const ball = this.mode === 'guest' ? this.guestBall : this.rally?.ball;
    if (!ball) return false;
    const side = this.mode === 'guest' ? sideAt(ball.u) : ball.side;
    if (side !== this.mine && !(ball.state === 'flying' && ball.by !== this.mine && ball.vu * signOf(this.mine) > 0)) return false;
    return ball.state === 'waiting' || ball.state === 'held' || (ball.state === 'flying' && ball.by !== this.mine);
  }

  /** How long the ball has waited for a hand that isn't open. */
  watchResting(dt, mine) {
    const ball = this.mode === 'guest' ? this.guestBall : this.rally?.ball;
    const waiting = this.ballForMe() && ball && ball.state !== 'flying';
    this.restFor = waiting && !mine.open ? this.restFor + dt : 0;
  }

  /** The little film of what to do, until the child has hit the ball. */
  showFilm() {
    const wanted = !this.hitOnce && this.session.playSeconds < FILM_SECONDS;
    if (wanted !== this.filmShown) {
      this.filmShown = wanted;
      document.body.dataset.film = wanted ? 'on' : 'off';
    }
  }

  idle(dt, snapshot) {
    const counting = this.session.screen === 'countdown';
    if (this.filmShown) {
      this.filmShown = false;
      document.body.dataset.film = 'off';
    }
    // During the countdown the glove comes out, so the child can find their hand.
    if (counting) this.followHand(dt, snapshot);
    else for (const glove of Object.values(this.gloves)) glove.hide();
    const mine = counting ? this.myRacket(snapshot) : { visible: false, open: false, u: signOf(this.mine) * 0.6, h: 0.45, radius: RACKET.radius };
    const other = otherSide(this.mine);
    // In the middle of a game, as when the hand is checked again, it all stays where it is.
    if (this.rally && this.rally.phase !== 'ready' && this.rally.phase !== 'over') {
      this.court.update(dt, this.model());
      return;
    }
    // Before a game, and behind the cards: the ball waits on the child's side, and the other player is ready.
    const bob = 0.02 * Math.sin(performance.now() / 600);
    const spot = { u: signOf(this.mine) * 0.58, h: 0.52 + bob };
    const theirs = this.mode !== 'solo' ? this.friendRacket() : { visible: true, open: true, u: signOf(other) * 0.62, h: 0.44, radius: RACKET.radius };
    this.court.update(dt, {
      ball: { ...spot, vu: 0, vh: 0, state: 'held', kind: 'beach', stroke: -1, side: this.mine, by: null, since: 1 },
      rackets: { [this.mine]: mine, [other]: theirs },
      rally: 0,
    });
  }

  render() {
    this.court.render();
  }

  finished() {
    const { sound } = this.session;
    sound.stopLoop('waves');
    if (this.mode === 'host') this.sayBall();
    const scores = this.scores();
    const mine = scores[this.mine];
    // Together, both won, and what's said of each is the hits they made.
    const iWon = this.team || this.winner() === this.mine || (!this.winner() && mine > scores[otherSide(this.mine)]);
    if (this.friends.current) this.friends.finished(this.sinceGo, { n: mine, w: iWon ? 1 : 0 });
    for (const glove of Object.values(this.gloves)) glove.hide();
  }

  prompt(snapshot, dt) {
    const { session } = this;
    const needed = session.handsPrompt(snapshot, dt);
    const forMe = this.ballForMe();
    // The ball has waited a while for a hand that's resting: that's fine, and it's said once or twice.
    if (forMe && this.restFor > RESTING_AFTER) return { key: 'resting', text: SPOKEN.resting, side: null };
    // The hand can rest whenever it likes. Not being open only matters when the ball is the child's to hit.
    if (needed && !needed.key.startsWith('closed')) return needed;
    if (needed && forMe) return needed;
    if (!this.hitOnce && session.playSeconds < HINT_SECONDS) {
      return { key: 'bounce-hint', text: session.settings.language === 'ka' ? HINT[1] : HINT[0], side: null, silent: true, asks: 'open' };
    }
    return null;
  }

  summary() {
    const scores = this.scores();
    const other = otherSide(this.mine);
    const won = this.winner() === this.mine || (!this.winner() && scores[this.mine] > scores[other]);
    const solo = this.mode === 'solo' && !this.friends.current;
    const rally = this.rally?.stats;
    const longest = rally ? rally.longest : this.stats.longest;
    const hand = this.session.settings.hands;
    const row = (value) => ({ left: hand === 'left' ? value : '', right: hand === 'right' ? value : '' });
    const prizes = Object.values(this.stats.prizes).reduce((sum, count) => sum + count, 0);
    // With friends, the results say who won. On their own, the title says how it went.
    this.friends.showResults();
    if (solo) document.querySelector('#screen-finish h2').textContent = won ? 'You won!' : 'So close!';
    // A game lost to the computer: its player won this one, and it's the same level again, without confetti.
    byId('finish-lost').hidden = !solo || won;
    if (solo && !won) {
      byId('finish-lost').textContent = `${this.opponent.name} won this one, ${scores[other]} to ${scores[this.mine]}. Have another go!`;
      setTimeout(() => {
        this.session.hud.confetti.stop();
        const again = document.querySelector('#screen-finish .finish-actions .big-button');
        if (again) again.textContent = 'Try again';
      }, 0);
    }
    const portraits = this.session.portraits ?? {};
    const scoreLine = byId('finish-score');
    scoreLine.replaceChildren();
    const face = (id) => {
      const image = document.createElement('img');
      image.alt = '';
      image.src = portraits[id] ?? '';
      return image;
    };
    const numbers = document.createElement('span');
    // Together, the hits each made add up to the team's.
    numbers.textContent = this.team ? `${scores[this.mine]} + ${scores[other]} = ${scores[this.mine] + scores[other]}` : `${scores[this.mine]} : ${scores[other]}`;
    scoreLine.append(face(this.myCharacter().id), numbers, face(this.opponent.id));
    byId('finish-prizes').textContent = Object.entries(this.stats.prizes)
      .filter(([, count]) => count > 0)
      .map(([kind, count]) => `${PRIZE_MARKS[kind]} ${count}`)
      .join('   ');
    // "1 hit", and otherwise "hits".
    const noun = byId('finish-hero')?.nextSibling;
    if (noun?.nodeType === Node.TEXT_NODE) noun.textContent = this.stats.hits === 1 ? ' hit' : ' hits';
    return {
      hero: this.stats.hits,
      noun: 'game',
      rows: { points: row(scores[this.mine]), rally: row(longest), prizes: row(prizes) },
      won: solo ? won : true,
      // A game with a friend is on the host's level, so it doesn't move the child's own level on.
      countsForLevel: !this.friends.current,
    };
  }

  /** Where the ball is on the screen, for its label. */
  ballOnScreen() {
    const { court } = this;
    const { u, h } = court.shown;
    return { ...court.at(u, h), r: COURT.ball * court.scale };
  }
}

const choice = (name, value, label) => `<label><input type="radio" name="${name}" value="${value}"> ${label}</label>`;
const characterChoices = ROSTER.map(({ id, name }) => choice('fighter', id, name)).join('\n        ');

new GameSession({
  // What the open and closed hand do here, for the hand shapes in the grown-ups' panel: see core/shapes.js.
  moves: { open: 'Hit the ball', closed: null },
  shell: {
    title: 'Bounce Back',
    startLabel: 'Let’s play!',
    againLabel: 'Play again',
    finishTitle: 'You won!',
    heroMark: '🏐',
    heroNoun: 'hits',
    extraRows: [{ id: 'points', label: 'Points won' }, { id: 'rally', label: 'Longest rally' }, { id: 'prizes', label: 'Prizes caught' }],
    hudTop: `
      <div id="score-board" class="score-board">
        <div id="score-left" class="score-player"><img class="score-face" alt=""><span class="score-name"></span><span class="score-value">0</span></div>
        <span class="score-dash" aria-hidden="true">:</span>
        <div id="score-right" class="score-player score-player-right"><span class="score-value">0</span><span class="score-name"></span><img class="score-face" alt=""></div>
        <p id="score-goal" class="score-goal">First to 5</p>
        <div class="chip chip-prizes"><span class="chip-label">Prizes</span><span id="chip-prizes" class="chip-value">0</span></div>
      </div>
      <div class="bounce-film" aria-hidden="true">
        <svg viewBox="0 0 220 140">
          <path class="film-court" d="M6 118h208" />
          <path class="film-net" d="M110 118V80" />
          <g class="film-hand">
            <rect x="160" y="84" width="30" height="27" rx="10" />
            <path class="film-finger" d="M165 87V69" />
            <path class="film-finger" d="M172 85V63" />
            <path class="film-finger" d="M180 85V62" />
            <path class="film-finger" d="M187 87V68" />
            <path class="film-finger film-thumb" d="M160 100L148 92" />
          </g>
          <g class="film-ball">
            <circle cx="0" cy="0" r="11" />
            <path d="M0-11V11M-11 0H11" />
          </g>
        </svg>
      </div>`,
    panelSettings: `
      <fieldset class="choice">
        <legend>How hard</legend>
        ${choice('bounceHard', 'medium', 'Medium: a ball the child tries for and misses is the computer’s point, so the computer can win, and it plays better level by level')}
        ${choice('bounceHard', 'tough', 'Tough: the computer aims further off the hand, and misses fewer')}
        ${choice('bounceHard', 'gentle', 'Gentle: the ball always waits for the child, so the computer can never score')}
      </fieldset>
      <fieldset class="choice">
        <legend>Ball speed</legend>
        ${choice('bouncePace', 'slow', 'Slow')}
        ${choice('bouncePace', 'medium', 'Medium')}
        ${choice('bouncePace', 'fast', 'Fast')}
      </fieldset>
      <fieldset class="choice">
        <legend>Reach help (a bigger racket, and the ball drifts towards an open hand)</legend>
        ${choice('bounceHelp', 'none', 'A little')}
        ${choice('bounceHelp', 'little', 'More')}
        ${choice('bounceHelp', 'lots', 'A lot')}
      </fieldset>
      <fieldset class="choice">
        <legend>Points to win (together with a friend: 20, 30 or 40 hits between you)</legend>
        ${choice('bouncePoints', '5', '5')}
        ${choice('bouncePoints', '7', '7')}
        ${choice('bouncePoints', '11', '11')}
      </fieldset>
      <fieldset class="choice">
        <legend>With a friend</legend>
        ${choice('bounceFriends', 'together', 'Together: keep the ball going between you, and count your hits as a team')}
        ${choice('bounceFriends', 'against', 'Against each other: first to the points wins')}
      </fieldset>
      <fieldset class="choice">
        <legend>Who plays</legend>
        ${characterChoices}
      </fieldset>`,
  },
  // How hard is bounceHard, which came in when Medium became how the game comes: the old bounceLevel, saved
  // when Gentle was how it came, is left behind, so that the game as it comes now reaches everyone.
  defaults: { bounceHard: 'medium', bouncePace: 'slow', bounceHelp: 'little', bouncePoints: 5, bounceFriends: 'together', fighter: ROSTER[0].id },
  choices: { bounceHard: String, bouncePace: String, bounceHelp: String, bouncePoints: Number, bounceFriends: String, fighter: String },
  // These go on to a game that's being played at once. The rest, and the level, start it again: see core/settings.js.
  atOnce: ['bounceHelp'],
  tagline: (side) => `Hit the big ball back over the net with your open ${side} hand!`,
  finishLine: 'Great job!',
  portraits: () => renderPortraits(ROSTER),
  createSound: (options) => new Sound({
    ...options,
    sounds: {
      hit: new URL('../high-five-racers/audio/slap.ogg', import.meta.url),
      bounce: new URL('../leap-trail/audio/land.ogg', import.meta.url),
      boing: new URL('../robot-rescue/audio/boing.ogg', import.meta.url),
      whoosh: new URL('../mighty-moves/audio/whoosh-1.ogg', import.meta.url),
      cheer: new URL('../mighty-moves/audio/cheer.ogg', import.meta.url),
      sparkle: new URL('../mighty-moves/audio/sparkle.ogg', import.meta.url),
      waves: new URL('../lighthouse/audio/waves.ogg', import.meta.url),
    },
  }),
  createGame: (session) => new BounceGame(session),
}).start();
