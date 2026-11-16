// Hat Chase: a magpie has flown off with the hat, and the child's character goes after it along a path through
// the hills, seen from the side. The child marches on the spot to walk, a step for each knee lifted, and jumps,
// bends their knees and reaches up for what's in the way. The character stops at each thing by itself and waits
// for the move. The magpie flies on ahead, and out of sight it has got away. It's the game about stepping with
// both legs in turn. This file runs it from start to finish, on top of what the body games share in
// core/body/game.js. The rules are in chase.js, the marching is read in march.js, and what it looks like is in
// view.js.
import { Easing } from '../../core/body/easing.js';
import { BODY_SAY, BodyGame, byElementId, groupChoice } from '../../core/body/game.js';
import { ROSTER } from '../../core/body/roster.js';
import { mountBodyShell } from '../../core/body/shell.js';
import { BIG_JUMP, Chase, HELP_AFTER, newAt as newAtLevel } from './chase.js';
import { ChaseSound } from './chase-sound.js';
import { LIFT, Marcher } from './march.js';
import { ChaseView } from './view.js';

const AFTER_WON_SECONDS = 3.2; // The hat comes down, and then the card.
const AFTER_LOST_SECONDS = 2.2;
const COUNT_FROM = 3;
const GO_SHOWN_SECONDS = 0.9;
const IDLE_SECONDS = 5; // With no step for this long on open path, the character shows how to march.
const AIR_SECONDS = 0.45; // A jump is followed this long, to see how high it goes.
// How high a big jump is: the child's hips going up by this share of their leg length. One that only just
// counts is size 1, and one this high is BIG_JUMP, which reaches what's above a stream.
const BIG_RISE = 0.13;
const LENGTHS = [8, 12, 18];

// moveSize is the body games' setting for how big a move has to be: here, how high a jump and how deep a bend of
// the knees count. It's kept as the other games have it, as settings are saved all together.
const DEFAULTS = { moveSize: 'small', chaseMagpie: 'flies', chaseLift: 'medium', chaseLegs: 'either', chaseJump: 'jump', chaseLength: 12, fighter: 'giraffe' };
const CHOICES = { chaseMagpie: String, chaseLift: String, chaseLegs: String, chaseJump: String, chaseLength: Number };
// The card at the end of a game the magpie won. Its big button is to try again, as after any game that was lost.
const LOST_TITLE = 'The magpie got away! Try again.';

// Every one of these has a rendered voice file: see audio/voice/lines.json.
const SAY = {
  choose: 'Who’s going after the hat today?',
  mission: 'The magpie took the hat! March after it!',
  march: 'March on the spot to walk!',
  jump: 'Jump!',
  arms: 'Arms up high to jump!',
  duck: 'Bend your knees!',
  reach: 'Reach up high!',
  star: 'Do a star jump!',
  turns: 'Now the other leg!',
  away: 'The magpie is getting away! March!',
  lost: 'The magpie got away! Try again!',
  won: 'You got the hat back!',
};
// The moment something is seen, the child is told so, as words on the screen.
const SEEN_WORDS = {
  over: ['Over!', 'გადახტი!'],
  under: ['Under!', 'გაძვერი!'],
  apples: ['Apples!', 'ვაშლები!'],
  feather: ['A golden feather!', 'ოქროს ბუმბული!'],
  star: ['Star jump!', 'ვარსკვლავა!'],
  bump: ['Bump!', 'ბუხ!'],
};
const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

class HatChase extends BodyGame {
  constructor() {
    super({
      defaults: DEFAULTS,
      choices: CHOICES,
      // How high a knee has to come, and whether the legs take turns, go on to a game that's being played at
      // once. The rest, and the level, start it again.
      atOnce: ['chaseLift', 'chaseLegs'],
      lines: new URL('./audio/voice/lines.json', import.meta.url),
      createSound: (options) => new ChaseSound(options),
    });
    this.chase = null;
    // Whoever is walking: one child as the game comes, or several in front of one camera (core/body/people.js).
    // Each is { index, reader, marcher, air, easing }: their own reader of moves, their own marcher, their own
    // jump on its way up ({ since, peak }), and what counts as a jump and a bend coming down to meet them.
    this.walkers = [];
    this.timer = 0;
    this.countLeft = 0;
    this.idleFor = 0;
    this.filmFor = null;
    this.lastNumbers = {};
  }

  /** What a level brings that's new, for the cards: see NEW_THINGS in chase.js. */
  newAt(level) {
    return newAtLevel(level);
  }

  /** One of those walking, as this game keeps them: see walkers. */
  walkerOf(index = 0) {
    this.walkers[index] ??= this.newWalker(index);
    return this.walkers[index];
  }

  newWalker(index) {
    const reader = this.players[index]?.reader ?? this.reader;
    return {
      index,
      reader,
      marcher: new Marcher({ line: this.liftLine, turns: this.settings.chaseLegs === 'turns' }),
      air: null,
      easing: { jump: new Easing(reader, 'jump'), squat: new Easing(reader, 'squat') },
    };
  }

  /** The first walker's marcher and jump: the child's, when one plays. The grown-ups' panel and the tests read them. */
  get marcher() {
    return this.walkerOf(0).marcher;
  }

  get air() {
    return this.walkerOf(0).air;
  }

  setUp() {
    this.view = new ChaseView(byElementId('game'));
    this.stage = this.view;
    this.view.setView('title');
    // How many are walking, on the chooser: each has a character, in the order they stand.
    this.watchGroupChoice(() => this.view.setWalkers(this.cast));

    byElementId('start').addEventListener('click', () => {
      this.sound.unlock();
      this.view.setView('choose');
      this.setScreen('choose');
      this.sound.ready.then(() => {
        if (this.screen === 'choose') this.sound.say(SAY.choose);
      });
    });
    byElementId('chase-start').addEventListener('click', () => this.openCameraThen(() => this.beginBodyCheck()));
    byElementId('chase-again').addEventListener('click', () => this.goAgain());
    byElementId('other-walker').addEventListener('click', () => {
      this.confetti.stop();
      this.view.setChase(null);
      this.view.setView('choose');
      this.setScreen('choose');
    });
    byElementId('recheck').addEventListener('click', () => {
      byElementId('panel').close();
      if (this.camera.running) this.beginBodyCheck(this.screen === 'playing' ? 'resume' : 'start');
      else this.openCameraThen(() => this.beginBodyCheck());
    });
  }

  debug() {
    const game = this;
    return {
      view: this.view,
      // Each game has a marcher and a chase of its own, so these are whichever is being played now.
      get marcher() {
        return game.marcher;
      },
      get chase() {
        return game.chase;
      },
      // Everyone walking, with several in front of one camera: each one's marcher and jump.
      get walkers() {
        return game.walkers;
      },
    };
  }

  showChosen() {
    this.view.setWalkers(this.cast);
  }

  settingChanged(change) {
    // A new line for the knees starts from that line, and not from where it had come down to for this child.
    if ('chaseLift' in change) for (const { marcher } of this.walkers) marcher.setLine(this.liftLine);
    if ('chaseLegs' in change) for (const { marcher } of this.walkers) marcher.turns = this.settings.chaseLegs === 'turns';
    // A new size for the smallest jump and bend that count starts from that size too, as in the other body games.
    if ('moveSize' in change) {
      for (const { reader } of this.players) reader.personal = { jump: null, squat: null, leg: null, hand: null };
      this.newEasing();
    }
  }

  /** How high a knee has to come for a step, as a share of the child's leg length. */
  get liftLine() {
    return LIFT[this.settings.chaseLift] ?? LIFT.medium;
  }

  /** Whether reaching both arms up counts as the jump, for a child who can stand and march but not jump. */
  get armsJump() {
    return this.settings.chaseJump === 'arms';
  }

  /** What counts as a jump and a bend starts again from the size chosen, for everyone walking. */
  newEasing() {
    for (const walker of this.walkers) walker.easing = { jump: new Easing(walker.reader, 'jump'), squat: new Easing(walker.reader, 'squat') };
  }

  /* ---------- the body ---------- */

  /** How big a walker's jump is right now: 1 is the smallest that counts, and BIG_JUMP is a big one. See BIG_RISE. */
  jumpSize({ reader } = this.walkerOf(0)) {
    const least = reader.jumpNeeded;
    const rise = reader.jumpEffort ?? 0;
    return 1 + (Math.max(0, rise - least) / Math.max(0.01, BIG_RISE - least)) * (BIG_JUMP - 1);
  }

  /**
   * Each time the tracker has looked at the child: a knee lifted is a step, and a jump, bent knees or arms up
   * do what the thing in the way wants. The character shows what the child is doing, there and then.
   */
  onMoves(moves, now) {
    this.readWalker(this.walkerOf(0), moves, now);
  }

  /**
   * With several walking in front of one camera, each one's moves are read on their own. Everyone's steps take
   * them all along, each by its share, and anyone's jump, bend or reach is for all of them: see Chase.
   */
  onPlayerMoves(player, moves, now) {
    this.readWalker(this.walkerOf(player.index), moves, now);
  }

  readWalker(walker, moves, now) {
    const { view, chase } = this;
    const { reader } = walker;
    const playing = this.screen === 'playing' && chase?.state === 'play';
    const crouch = clamp((reader.sink ?? 0) / Math.max(0.001, reader.squatNeeded), 0, 1);
    view.setBody({ crouch: playing ? crouch : 0, reach: playing ? reader.skyShare ?? 0 : 0 }, walker.index);
    if (!playing) return;

    const side = walker.marcher.update(reader.footRises, now, { inAir: reader.inAir || Boolean(walker.air) });
    if (side && chase.step(side, walker.index)) {
      this.idleFor = 0;
      this.sound.step(side);
    }
    for (const { move } of moves) {
      if (move === 'flying') this.takeOff(walker, now, false);
      // A star, arms and legs out, is a jump whichever way the child jumps: it can be stepped into.
      else if (move === 'starBurst') this.takeOff(walker, now, true);
      else if (move === 'stomp') this.bend();
      else if (move === 'skyCharge') this.armsUp(walker, now);
    }
    // A jump is followed a little way up, to see how high it goes: a big one reaches what's above a stream.
    if (walker.air) {
      walker.air.peak = Math.max(walker.air.peak, this.jumpSize(walker));
      if (chase.grow(walker.air.peak)) this.newEasing();
      if (now - walker.air.since >= AIR_SECONDS || !reader.inAir) walker.air = null;
    }
  }

  takeOff(walker, now, star) {
    const { chase } = this;
    const size = star ? Math.max(1.2, this.jumpSize(walker)) : this.jumpSize(walker);
    const wanted = chase.station?.needs === 'jump';
    if (!chase.jump(size, { star })) return;
    walker.air = { since: now, peak: size };
    this.idleFor = 0;
    if (wanted) this.newEasing();
  }

  bend() {
    if (this.chase.squat()) this.newEasing();
    this.idleFor = 0;
  }

  /**
   * Both arms up high: the apples come down, or, for a child who can't jump, it's the jump. Theirs is always a big
   * one, as there's no telling a higher reach from a lower: the star over a stream is theirs to catch too.
   */
  armsUp(walker, now) {
    const { chase } = this;
    if (!this.armsJump || chase.station?.needs !== 'jump') {
      chase.reach();
      return;
    }
    if (!chase.jump(BIG_JUMP)) return;
    this.idleFor = 0;
    this.newEasing();
  }

  /** What the panel says the camera can see, so a grown-up can tell why a step isn't counting. */
  showLiveReading() {
    const now = performance.now();
    if (now - (this.panelAt ?? 0) < 200) return;
    this.panelAt = now;
    // With several walking, it's the first of them the panel tells of.
    const { reader, marcher } = this.walkerOf(0);
    const percent = (share) => `${Math.round(share * 1000) / 10}%`;
    const rises = reader.footRises ?? { left: 0, right: 0 };
    byElementId('live-reading').textContent = `The camera sees the left foot ${percent(rises.left)} of the child’s leg length off the floor, and the right foot ${percent(rises.right)}. A step is a foot ${percent(marcher.line.left)} up on the left and ${percent(marcher.line.right)} on the right, with the other foot down. A jump needs the hips to rise ${percent(reader.jumpNeeded)}, and bent knees need them to sink ${percent(reader.squatNeeded)}.`;
  }

  /* ---------- a game ---------- */

  afterBodyCheck(then) {
    if (then === 'resume') {
      this.view.setView('play');
      this.setScreen('playing');
    } else this.countDown();
  }

  countDown() {
    const { settings, view } = this;
    this.chase = new Chase({
      level: this.startLevel(),
      things: LENGTHS.includes(settings.chaseLength) ? settings.chaseLength : 12,
      gentle: settings.chaseMagpie === 'waits',
      walkers: this.players.length,
      onEvent: (event) => this.onChaseEvent(event),
    });
    view.setChase(this.chase);
    view.setView('play');
    // Each game has new marchers, with nothing of the last game's in them.
    this.walkers = this.players.map(({ index }) => this.newWalker(index));
    this.idleFor = 0;
    this.filmFor = null;
    this.lastNumbers = {};
    this.hideCoach();
    this.updateHud();
    this.countLeft = COUNT_FROM;
    this.setCount(String(COUNT_FROM));
    this.sound.count(COUNT_FROM);
    this.setScreen('countdown');
  }

  updateCountdown(dt) {
    const before = Math.ceil(this.countLeft);
    this.countLeft -= dt;
    const after = Math.ceil(this.countLeft);
    if (this.countLeft <= 0) this.beginPlay();
    else if (after !== before) {
      this.setCount(String(after));
      this.sound.count(after);
    }
  }

  beginPlay() {
    this.setCount(this.translate('Go!'));
    this.sound.go();
    this.sound.startHills();
    this.timer = GO_SHOWN_SECONDS;
    this.setScreen('playing');
    this.chase.begin();
    // The mission, in one line.
    this.sound.say(SAY.mission);
  }

  /** The character showing a move, with what's asked for under it. */
  showFilm(name, text) {
    const key = `${name}:${text}`;
    if (this.filmFor === key) return;
    this.filmFor = key;
    this.showCoach(name, this.translate(text));
  }

  hideFilm() {
    if (this.filmFor === null) return;
    this.filmFor = null;
    this.hideCoach();
  }

  /** What the thing the character is standing at wants: the film that shows it, and the words. */
  wanted(station) {
    if (station.needs === 'squat') return ['squat', SAY.duck];
    // A springboard takes any jump, and shows the star jump that catches the stars above it.
    if (station.kind === 'spring' && !this.armsJump) return ['starJump', SAY.star];
    return this.armsJump ? ['skyReach', SAY.arms] : ['jump', SAY.jump];
  }

  updatePlaying(dt, now) {
    const { chase } = this;
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) this.setCount('');
    }
    // Nobody in the picture: everything waits, the magpie too.
    const lost = this.bodyLost();
    chase.update(dt, { seen: !lost });
    if (chase.state !== 'play') return;
    this.idleFor = lost ? 0 : this.idleFor + dt;
    const { station } = chase;
    // A child who's trying and not getting as high, or as low, as counts: what counts comes down to meet them,
    // as in the other body games (core/body/easing.js).
    if (!lost && station && !chase.busy) for (const { easing } of this.walkers) easing[station.needs]?.update(dt);
    this.updateHud();

    // What's asked for, and the character showing how, whenever something is wanted of the child.
    let film = null;
    if (lost) {
      this.hideFilm();
      this.prompt.show({ key: 'come-back', text: BODY_SAY.comeBack, side: null }, now);
      return;
    }
    if (station && !chase.busy) {
      // After a long wait at something, marching on climbs past it, and that's what's shown.
      film = station.waited >= HELP_AFTER ? ['highKnees', SAY.march] : this.wanted(station);
    } else if (!chase.busy && chase.treeHere) film = ['skyReach', SAY.reach];
    else if (!chase.busy && this.walkers.some(({ marcher }) => marcher.same)) film = ['highKnees', SAY.turns];
    else if (!chase.busy && (chase.stats.steps === 0 || this.idleFor > IDLE_SECONDS)) film = ['highKnees', SAY.march];
    if (film) {
      this.showFilm(...film);
      this.prompt.show({ key: film[1], text: film[1], side: null }, now);
    } else {
      this.hideFilm();
      this.prompt.show(null, now);
    }
  }

  /** Along the top: the stars, how far ahead the magpie is, and how far along the path the character has come. */
  updateHud() {
    const { chase } = this;
    if (!chase) return;
    const danger = Math.round(chase.danger * 100);
    const progress = Math.round(chase.progress * 100);
    const key = `${chase.stats.stars}:${danger}:${progress}`;
    if (this.lastNumbers.hud === key) return;
    this.lastNumbers.hud = key;
    byElementId('stars').textContent = String(chase.stats.stars);
    const { gentle } = chase.rules;
    const far = danger >= 70;
    byElementId('magpie-words').textContent = gentle ? 'Waiting for you' : far ? 'Getting away!' : danger >= 35 ? 'Ahead' : 'Close';
    byElementId('magpie-chip').dataset.danger = far ? 'far' : 'near';
    byElementId('magpie-fill').style.width = `${danger}%`;
    byElementId('magpie-meter').setAttribute('aria-valuenow', String(danger));
    byElementId('magpie-meter').hidden = gentle;
    byElementId('path-fill').style.width = `${progress}%`;
  }

  /** What the rules say happened, heard and seen. */
  onChaseEvent(event) {
    const { sound, view, chase } = this;
    view.on(event);
    // The words that say a move was seen come up ahead of the character, under where the magpie flies.
    const beside = { x: 0.5, y: 0.52 };
    switch (event.type) {
      case 'jump':
        if (event.thing.kind === 'spring') sound.spring();
        else sound.jump();
        if (event.star) this.showSeen(SEEN_WORDS.star, beside);
        break;
      case 'hop':
        sound.jump();
        break;
      case 'duck':
        sound.duck();
        break;
      case 'cleared':
        if (event.how === 'duck') this.showSeen(SEEN_WORDS.under, beside);
        else if (event.how !== 'clamber') {
          sound.land();
          this.showSeen(SEEN_WORDS.over, beside);
        }
        break;
      case 'high':
        if (event.thing.high.feather) {
          sound.feather();
          this.showSeen(SEEN_WORDS.feather, beside);
        }
        break;
      case 'apples':
        sound.apples();
        this.showSeen(SEEN_WORDS.apples, beside);
        break;
      case 'tumble':
        sound.tumble();
        this.showSeen(SEEN_WORDS.bump, beside);
        break;
      case 'away':
        sound.away();
        sound.say(SAY.away, { ifQuiet: true });
        break;
      case 'cup':
        sound.cup();
        break;
      case 'won':
        this.onWon();
        break;
      case 'lost':
        this.onLost();
        break;
      default:
    }
    if (chase) this.updateHud();
  }

  /** What every ending does: the camera goes off, and nothing more is asked for. */
  wrapUp() {
    this.camera.stop();
    for (const { reader } of this.players) reader.forget();
    this.latestBody = null;
    this.stillBodies();
    this.hideFilm();
    this.prompt.clear();
    this.setCount('');
    this.updateHud();
    this.sound.stopHills();
  }

  /** Nobody is in the air, bending or reaching any more: each character stands as it is. */
  stillBodies() {
    for (const walker of this.walkers) {
      walker.air = null;
      this.view.setBody({}, walker.index);
    }
  }

  onWon() {
    this.wrapUp();
    this.sound.finish(SAY.won);
    this.sound.cheer();
    this.timer = AFTER_WON_SECONDS;
    this.setScreen('finishing');
  }

  /** The magpie is out of sight: it has got away, and the card says so, with no cheering. */
  onLost() {
    this.wrapUp();
    this.sound.away();
    this.sound.finish(SAY.lost, { lost: true });
    this.timer = AFTER_LOST_SECONDS;
    this.setScreen('finishing');
  }

  showFinish() {
    const { chase } = this;
    const { stats, rules } = chase;
    const lost = chase.state === 'lost';
    byElementId('finish-stars').textContent = String(stats.stars);
    const things = chase.course.length;
    const got = lost ? `, and got past ${stats.cleared + stats.helped} of the ${things} things in the way` : `, and got past all ${things} things in the way`;
    // With several walking, how many steps they took between them, and each one's share by their character's name.
    const cast = this.cast;
    byElementId('finish-line').textContent = this.grouped
      ? `Together you took ${plural(stats.steps, 'step')}: ${stats.by.map((steps, index) => `${cast[index].name} ${steps}`).join(', ')}. You got past ${lost ? `${stats.cleared + stats.helped} of the` : 'all'} ${things} things in the way.`
      : `${this.chosen.name} took ${plural(stats.steps, 'step')}, ${stats.left} with the left leg and ${stats.right} with the right${got}.`;
    byElementId('finish-prizes').textContent = this.prizeWords();
    this.fillTallyCards(byElementId('finish-tally'), [
      { name: 'steps', icon: 'highKnees', label: 'Steps', value: stats.steps },
      { name: 'jumps', icon: 'jump', label: 'Jumps', value: stats.jumps },
      ...(rules.kinds.includes('branch') ? [{ name: 'squats', icon: 'squat', label: 'Knee bends', value: stats.squats }] : []),
      ...(rules.trees ? [{ name: 'reaches', icon: 'skyReach', label: 'Reaches up', value: stats.reaches }] : []),
      ...(rules.kinds.includes('spring') ? [{ name: 'stars', icon: 'starJump', label: 'Star jumps', value: stats.starJumps }] : []),
    ]);
    // Catching the magpie up at its tree moves on a level, and a game it got away in is to be tried again.
    this.finishLevel(!lost);
    if (lost) {
      byElementId('finish-title').textContent = LOST_TITLE;
      // The character stands beside the card, not under it.
      this.view.setView('lost');
    } else {
      byElementId('finish-title').textContent = SAY.won;
      this.view.setView('finish');
      this.confetti.start();
    }
    this.setScreen('finish');
  }

  /** What else happened, in words, from what this level has. */
  prizeWords() {
    const { stats, rules } = this.chase;
    const parts = [];
    if (stats.big) parts.push(`${plural(stats.big, 'big jump')}`);
    if (rules.trees && stats.apples) parts.push(`${plural(stats.apples, 'apple')} picked`);
    if (rules.feathers && stats.feathers) parts.push(`${plural(stats.feathers, 'golden feather')} caught`);
    if (stats.tumbles) parts.push(`${plural(stats.tumbles, 'tumble')}`);
    if (stats.cup) parts.push('the cup is won');
    if (!parts.length) return '';
    const last = parts.pop();
    const words = parts.length ? `${parts.join(', ')} and ${last}` : last;
    return `${words[0].toUpperCase()}${words.slice(1)}.`;
  }

  /**
   * What a round leaves going, stopped when a grown-up's change in the panel starts the game again: see
   * startAgain in core/body/game.js.
   */
  leaveRound() {
    this.stillBodies();
    this.hideFilm();
    this.sound.stopHills();
  }

  goAgain() {
    this.confetti.stop();
    for (const { reader } of this.players) reader.forget();
    this.openCameraThen(() => this.beginBodyCheck());
  }

  /* ---------- every frame ---------- */

  frame(dt, now) {
    switch (this.screen) {
      case 'countdown':
        this.updateCountdown(dt);
        break;
      case 'playing':
        this.updatePlaying(dt, now);
        break;
      case 'finishing':
        this.timer -= dt;
        if (this.timer <= 0) this.showFinish();
        break;
      default:
    }
  }
}

const choice = (name, value, words) => `<label><input type="radio" name="${name}" value="${value}"> ${words}</label>`;
const percent = (share) => `${Math.round(share * 100)}%`;

mountBodyShell({
  title: 'Hat Chase',
  tagline: 'The magpie took the hat! March on the spot to walk after it, and jump, duck and reach on the way.',
  startLabel: 'Choose your walker',
  chooseTitle: 'Who’s going after the hat today?',
  chooseSide: `
      <p class="choose-tip">March on the spot, and your walker walks: a step for each knee you lift. It stops at whatever is in the way, and shows you what to do. Don’t let the magpie get out of sight!</p>
      ${groupChoice()}
      <button id="chase-start" class="big-button" type="button">Let’s go!</button>`,
  hud: `
  <header id="chase-top" class="chase-top">
    <div class="chip"><span class="chip-label">Stars</span><span id="stars" class="chip-value">0</span></div>
    <div id="magpie-chip" class="chip chip-magpie" data-danger="near">
      <span class="chip-label">The magpie</span>
      <span id="magpie-words" class="chip-value">Close</span>
      <span id="magpie-meter" class="magpie-meter" role="progressbar" aria-label="How far ahead the magpie is" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="magpie-fill" class="magpie-fill"></span></span>
    </div>
    <div class="path-track" aria-hidden="true"><div id="path-fill" class="path-fill"></div><span class="path-end">🌳</span></div>
  </header>`,
  finishBody: `
      <h2 id="finish-title">You got the hat back!</h2>
      <p class="finish-hero"><span class="hero-mark" aria-hidden="true">★</span> <span id="finish-stars">0</span> stars</p>
      <p id="finish-line" class="finish-open"></p>
      <p id="finish-prizes" class="finish-prizes"></p>
      <div id="finish-tally" class="finish-tally"></div>
      <p class="small-print">These numbers are shown once and not saved.</p>
      <div class="finish-actions">
        <button id="chase-again" class="big-button" type="button">Go again</button>
        <button id="other-walker" class="soft-button" type="button">Choose another walker</button>
        <a class="all-games" href="../../index.html">All games</a>
      </div>`,
  panelLead: 'The game is paused. The camera needs to see all of the child, feet too, standing up. Marching and jumping need room: clear the floor, and stay close by.',
  handLegend: 'Side being worked on',
  safetyPrint: 'Marching and jumping, a child can slip or land badly: please clear some space on a floor that isn’t slippery, and stay close by.',
  panelSettings: `
    <fieldset class="choice">
      <legend>The magpie</legend>
      ${choice('chaseMagpie', 'flies', 'It flies on: out of sight, it has got away, and the level is tried again')}
      ${choice('chaseMagpie', 'waits', 'Gentle: it waits a little way ahead. Take all the time you need')}
    </fieldset>
    <fieldset class="choice">
      <legend>How high a knee has to come for a step: the foot off the floor by this share of the child’s leg length. A leg that keeps nearly getting there is asked for a little less</legend>
      ${choice('chaseLift', 'low', `Low: ${percent(LIFT.low)}`)}
      ${choice('chaseLift', 'medium', `Medium: ${percent(LIFT.medium)}`)}
      ${choice('chaseLift', 'high', `High: ${percent(LIFT.high)}`)}
    </fieldset>
    <fieldset class="choice">
      <legend>Which leg steps</legend>
      ${choice('chaseLegs', 'either', 'Either: every knee lifted is a step')}
      ${choice('chaseLegs', 'turns', 'The legs take turns: the same leg twice running doesn’t count, so the weaker one has to do its share')}
    </fieldset>
    <fieldset class="choice">
      <legend>How the child jumps</legend>
      ${choice('chaseJump', 'jump', 'Really jumping, or a star jump')}
      ${choice('chaseJump', 'arms', 'Reaching both arms up high, for a child who can stand and march but not jump')}
    </fieldset>
    <fieldset class="choice">
      <legend>Length of the path</legend>
      ${choice('chaseLength', '8', '8 things in the way')}
      ${choice('chaseLength', '12', '12 things in the way')}
      ${choice('chaseLength', '18', '18 things in the way')}
    </fieldset>`,
});

// Checked here so that a mistake in the roster shows up as soon as the page loads.
if (!ROSTER.length) console.error('No walkers');

new HatChase().start();
