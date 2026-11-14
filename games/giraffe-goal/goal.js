// Giraffe's Goal: the cup final has gone to penalties, and Giraffe's team needs a goalkeeper. The child is in goal,
// looking out at the pitch. A kicker runs up and shoots, a ring shows where the ball is coming, and the child's glove
// saves it by being there, with the hand open and held up like a high five. Enough saves win the match.
//
// The rules are here, with no screen, so they run in the unit tests. main.js says where the glove is and whether the
// hand is ready to save (open, and held up: see core/upright.js), and view.js draws what this says. Places are in
// shares of the screen, x across from the left and y down from the top, and sizes and distances are in screen
// heights.
//
// It's a real match, as it comes: a kicker runs up on a clock, whether the hand is ready or not, and the other team
// wins if enough balls go in before the saves that win it for Giraffe's team. Only a hand that isn't in the picture
// at all stops the clock, and the balls with it, so a child who goes away isn't scored against for it. A grown-up can
// choose the gentle match instead, which is the game as it always was: nothing can be lost there, as a ball that
// goes in costs nothing and the match is won by saves, however many shots it takes. A kicker only runs up once the
// hand is ready to save, so every shot starts with the hand open and held up, and a resting child comes back to a
// kicker who has waited. And after a ball goes in, the next ones come slower and nearer the glove.
//
// The balls go where they do on purpose: near the hand, far out to its own side, across the middle of the picture
// to the other side, which is reaching across the body, and up high.
import { clampLevel, ramp } from '../../core/levels.js';

// How far from the middle the balls go, which is how far there is to reach, as a grown-up chooses: the part of the
// screen they arrive in.
export const REACHES = {
  close: { x: [0.32, 0.68], y: [0.34, 0.62] },
  middle: { x: [0.22, 0.78], y: [0.29, 0.68] },
  far: { x: [0.12, 0.88], y: [0.24, 0.74] },
};
export const REACH_NAMES = Object.keys(REACHES);
export const SAVES_CHOICES = [6, 10, 14]; // How many saves win the match.
// What's at stake, as a grown-up chooses: a real match, which the other team can win (the default), or the gentle
// one, which nobody can lose.
export const STAKES = ['match', 'gentle'];
// In a real match, the other team wins once this many balls have gone in: a share of the saves that win it, which
// goes down from level 1 to level 10, and never fewer than least.
export const LET_IN = { first: 0.6, last: 0.3, least: 2 };
export const LOST_SECONDS = 2.2; // The other team's cheering once they've won, before the finish card.
const FIRST_WAIT_MATCH = 1.6; // In a real match, the first kicker gives the child a moment to see the pitch.

export const SPOT = { x: 0.5, y: 0.6 }; // The penalty spot, where a ball is kicked from.
export const SPOTS_FOR_TWO = [0.43, 0.57]; // Where two kickers' balls are, across.
export const BALL = { far: 0.013, near: 0.062 }; // A ball's radius as it's kicked, and as it arrives.
export const RUN_UP = 0.7; // Seconds a kicker takes to run up.
const READY_FOR = 0.25; // The hand has to have been ready to save for this long before a kicker runs up.
const FIRST_WAIT = 0.6; // Seconds before the first kicker runs up.
// The glove can save a ball from this far through its flight, and for LINGER seconds after it arrives.
export const SAVE_FROM = 0.86;
export const LINGER = 0.45;
const TOUCH = 1.15; // How near the glove has to come, in the ball's own radius: a little more than touching.
const SHOWN = { saved: 0.4, in: 0.45 }; // Seconds a ball that's been saved, or has gone in, is still shown.
const LOB = 0.1; // How far a ball rises on its way.
// After balls go in, in a row: each makes the next ones this much slower and this much nearer the glove, up to most.
const MERCY = { slower: 0.2, nearer: 0.25, most: 3 };

// What the levels bring. Missing any of it never costs anything.
export const EXTRAS = {
  starSeconds: 7, // How long a star waits to be touched.
  starOut: 0.3, // How far from the save it comes to rest: far enough that the glove has to go and get it.
  starTouch: 0.07, // How near the glove has to come to it.
  prizeLands: 0.6, // Seconds a star or a bubble takes to come to rest, and it can't be touched before.
  curl: 0.2, // How far a curling shot bends to one side, at the most.
  heavyHold: 1.2, // Seconds of the glove on a heavy ball that stop it, in all: it needn't be all at once.
  heavySlip: 3.5, // Seconds without the glove on it before it goes in.
  heavySlower: 1.2, // How much longer it takes to arrive.
  heavyBigger: 1.45,
  doubleGap: 1.5, // Seconds between the two balls of a double shot.
  goldenStars: 3,
  goldenSlower: 1.1,
  bounceFlight: 2, // Seconds a bouncing ball takes to come down again.
  bounceLob: 0.3,
  bubbles: 3, // How many bubbles a bubble ball bursts into.
  bubbleSeconds: 9,
  bubbleOut: 0.28,
  bubbleTouch: 0.075,
  trickAt: 0.3, // How far through its flight a trick shot's ring hops to its other place.
  trickSlower: 1.3,
  cupFall: 2.2, // Seconds the cup takes to float down.
  cupWaits: 10, // And how long it waits to be caught, before it's given anyway.
  cupTouch: 0.1,
};
export const PARTY_SECONDS = 2.2; // The cheering once the match is won, before the finish card.
// The glove grows as the thumb comes out of the palm: from this far out to that, by up to this much. A thumb across
// the palm reads 0, a relaxed one about 0.1 to 0.5, and one held right out 1 (see measureHand in core/hands.js).
export const BIG = { from: 0.25, to: 0.75, by: 0.32, rate: 7 };

/** How much bigger the glove is, from 0 to 1, for a thumb this far out of the palm, on a hand making the open move. */
export function bigFor(thumb, open) {
  return open ? Math.min(1, Math.max(0, (thumb - BIG.from) / (BIG.to - BIG.from))) : 0;
}

/** How many goals win the match for the other team, in a real match at a level, with so many saves to win it. */
export function goalsToLose(level, saves) {
  return Math.max(LET_IN.least, Math.round(saves * ramp(level, LET_IN.first, LET_IN.last)));
}

/**
 * What changes from level 1 to 10. Each level from 2 brings something new: see NEWS. gentle is the gentle match,
 * whose pace is the game's as it always was.
 */
export function goalLevel(level, { gentle = false } = {}) {
  const at = clampLevel(level);
  return {
    // Seconds a ball takes to arrive, and between one shot and the next, quicker each level: at level 10 a real
    // match leaves about half of level 1's time to get there, and the gentle one three quarters.
    flight: gentle ? ramp(at, 3.4, 2.5) : ramp(at, 3.4, 1.5),
    gap: gentle ? ramp(at, 1.3, 0.8) : ramp(at, 1.3, 0.5),
    // Seconds a ball that has arrived can still be saved, at the line.
    linger: gentle ? LINGER : ramp(at, LINGER, 0.2),
    // Seconds between the two balls of a double shot, which come from level 5: quicker in a real match.
    doubleGap: gentle ? EXTRAS.doubleGap : ramp(at, EXTRAS.doubleGap, 0.8),
    // From level 2, each save knocks a star out of the ball, to touch.
    stars: at >= 2,
    // From level 3, the fox's curling shot, which bends on its way.
    curl: at >= 3,
    // From level 4, the bear's heavy ball, which the glove has to hold back for a while.
    heavy: at >= 4,
    // From level 5, two kickers shoot one after the other, to different sides.
    double: at >= 5,
    // From level 6, the golden ball, to the far top corner, worth three stars.
    golden: at >= 6,
    // From level 7, the bunny's bouncing ball, which comes down again somewhere else once it's saved.
    bounce: at >= 7,
    // From level 8, the dragon's bubble ball, which bursts into bubbles to pop.
    bubbles: at >= 8,
    // From level 9, the goat's trick shot, whose ring hops to another place early in its flight.
    trick: at >= 9,
    // At level 10, the cup floats down to be caught once the match is won.
    cup: at >= 10,
  };
}

// What each level brings that's new, for the title card, the countdown and the finish card. key says which part of
// goalLevel turns it on, which the unit tests check.
export const NEWS = {
  2: [{ key: 'stars', mark: '⭐', name: 'A star for every save', nameKa: 'ვარსკვლავი ყოველ მოგერიებაზე' }],
  3: [{ key: 'curl', mark: '🦊', name: 'The curling shot', nameKa: 'მოხვეული დარტყმა' }],
  4: [{ key: 'heavy', mark: '🐻', name: 'The heavy ball', nameKa: 'მძიმე ბურთი' }],
  5: [{ key: 'double', mark: '⚽', name: 'The double shot', nameKa: 'ორმაგი დარტყმა' }],
  6: [{ key: 'golden', mark: '🌟', name: 'The golden ball', nameKa: 'ოქროს ბურთი' }],
  7: [{ key: 'bounce', mark: '🐰', name: 'The bouncing ball', nameKa: 'მხტუნავი ბურთი' }],
  8: [{ key: 'bubbles', mark: '🫧', name: 'The bubble ball', nameKa: 'ბუშტების ბურთი' }],
  9: [{ key: 'trick', mark: '🎩', name: 'The trick shot', nameKa: 'ეშმაკური დარტყმა' }],
  10: [{ key: 'cup', mark: '🏆', name: 'The cup', nameKa: 'თასი' }],
};

// The little label each new thing has beside it the first time it comes in a game, in English and Georgian. Nothing
// new is said out loud.
export const LABELS = {
  stars: ['Touch the star!', 'შეეხე ვარსკვლავს!'],
  curl: ['It curls!', 'ბურთი უხვევს!'],
  heavy: ['Hold it back!', 'შეაკავე!'],
  double: ['Two balls!', 'ორი ბურთი!'],
  golden: ['The golden ball!', 'ოქროს ბურთი!'],
  bounce: ['It comes back!', 'ისევ მოდის!'],
  bubbles: ['Pop the bubbles!', 'გახეთქე ბუშტები!'],
  trick: ['Watch the ring!', 'რგოლს უყურე!'],
  cup: ['Catch the cup!', 'დაიჭირე თასი!'],
  // And one that isn't a level's: the first time the hand spreads wide, thumb and all.
  big: ['A big glove!', 'დიდი ხელთათმანი!'],
};

// Who takes each kind of shot, from core/body/roster.js. A double shot has two kickers.
export const KICKERS = {
  plain: ['truffle'],
  curl: ['kit'],
  heavy: ['bramble'],
  double: ['frost', 'widget'],
  golden: ['nova'],
  bounce: ['mochi'],
  bubbles: ['cinder'],
  trick: ['tur'],
};
// The kinds of shot the levels bring, the newest first.
const SPECIALS = ['trick', 'bubbles', 'bounce', 'golden', 'double', 'heavy', 'curl'];
// Where one shot after another goes: see placeFor.
const ZONES = ['near', 'out', 'across', 'high', 'near', 'across', 'out', 'high'];

/** What's new at a level, as [{ key, mark, name, nameKa }]. Nothing at level 1. */
export const goalNewAt = (level) => NEWS[clampLevel(level)] ?? [];

/** Whether the part of a level that a piece of news names is on. */
export const newsIsOn = (key, level) => Boolean(goalLevel(level)[key]);

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const mix = (from, to, share) => from + (to - from) * share;

export class Goal {
  /**
   * level is the level played. saves is how many win the match, and reach how far the balls go (see REACHES), as a
   * grown-up chose. side is the hand in play, 'left' or 'right', which is on that side of the picture, as in a
   * mirror. aspect is the screen's width for its height. onEvent hears what happens: see main.js.
   */
  constructor({ level = 1, saves = 10, reach = 'middle', side = 'right', stakes = 'match', aspect = 16 / 9, random = Math.random, onEvent = () => {} } = {}) {
    Object.assign(this, { aspect, random, onEvent });
    this.level = clampLevel(level);
    // A real match, which can be lost, unless the gentle one was chosen.
    this.real = stakes !== 'gentle';
    this.plan = goalLevel(level, { gentle: !this.real });
    this.target = SAVES_CHOICES.includes(saves) ? saves : 10;
    // In a real match, the goals that win it for the other team.
    this.toLose = this.real ? goalsToLose(this.level, this.target) : Infinity;
    this.box = REACHES[reach] ?? REACHES.middle;
    this.sign = side === 'left' ? -1 : 1;
    this.time = 0;
    this.phase = 'play'; // Then 'cup', at level 10, and 'won', or in a real match 'lost'.
    this.done = false;
    this.shots = [];
    this.stars = [];
    this.bubbles = [];
    this.cup = null;
    this.kickers = [];
    this.pending = []; // The second ball of a double shot, waiting for its moment.
    this.runUp = null;
    this.wait = this.real ? FIRST_WAIT_MATCH : FIRST_WAIT;
    this.readyFor = 0;
    this.glove = null; // Where the glove was last seen.
    this.count = 0; // How many shots have been taken, for which comes next.
    this.misses = 0; // Balls that have gone in, in a row.
    this.partyLeft = 0;
    this.nextId = 1;
    this.stats = { shots: 0, saves: 0, goals: 0, across: 0, out: 0, high: 0, stars: 0, run: 0, bestRun: 0, held: 0 };
    this.specials = SPECIALS.filter((kind) => this.plan[kind]);
    this.callKickers();
  }

  /** The kind of shot that comes next: every other one is a plain one, and the others take turns, the newest first. */
  kindAt(count) {
    const { specials } = this;
    if (!specials.length || count % 2 === 1) return 'plain';
    return specials[(count / 2) % specials.length];
  }

  /** The kickers for the next shot come to their spots. */
  callKickers() {
    const kind = this.kindAt(this.count);
    const who = KICKERS[kind];
    const places = who.length === 2 ? SPOTS_FOR_TWO : [SPOT.x];
    this.kickers = who.map((id, index) => ({ who: id, kind, x: places[index], y: SPOT.y, state: 'ready', t: 0 }));
  }

  /**
   * A place in a part of the goal. near is by the hand, out is far out on the hand's own side, across is over the
   * middle of the picture on the other side, high is along the top, and corner is the top corner furthest across.
   */
  placeFor(zone) {
    const { x: [left, right], y: [top, bottom] } = this.box;
    const half = (right - left) / 2;
    const tall = bottom - top;
    const { sign, random } = this;
    const places = {
      near: () => ({ x: 0.5 + sign * half * (0.25 + 0.3 * random()), y: top + tall * (0.45 + 0.4 * random()) }),
      out: () => ({ x: 0.5 + sign * half * (0.82 + 0.18 * random()), y: top + tall * (0.3 + 0.5 * random()) }),
      across: () => ({ x: 0.5 - sign * half * (0.5 + 0.5 * random()), y: top + tall * (0.35 + 0.5 * random()) }),
      high: () => ({ x: 0.5 + sign * half * (-0.25 + 0.9 * random()), y: top + tall * 0.1 * random() }),
      corner: () => ({ x: 0.5 - sign * half * 0.95, y: top + tall * 0.04 }),
    };
    return (places[zone] ?? places.near)();
  }

  /** Whether a place is across the middle from the hand, far out on its own side, or up high. */
  partsOf({ x, y }) {
    const { x: [left, right], y: [top, bottom] } = this.box;
    const along = (this.sign * (x - 0.5)) / ((right - left) / 2);
    return { across: along < -0.12, out: along > 0.72, high: y < top + (bottom - top) * 0.2 };
  }

  /** The balls on their way, or being held back. */
  get live() {
    return this.shots.filter((shot) => shot.state === 'flying' || shot.state === 'pushing');
  }

  /**
   * Where a helpful hand would go now: to the ball that arrives first, or else a bubble, a star or the cup. For the
   * tests and the film of the game, which play it as a child would.
   */
  wants() {
    const [first] = this.live.sort((a, b) => (1 - a.t) * a.flight - (1 - b.t) * b.flight);
    if (first) return { x: first.to.x, y: first.to.y, what: 'ball', kind: first.kind };
    const [bubble] = this.bubbles;
    if (bubble) return { x: bubble.x, y: bubble.y, what: 'bubble' };
    const [star] = this.stars;
    if (star) return { x: star.to.x, y: star.to.y, what: 'star' };
    if (this.cup && this.cup.state !== 'caught') return { x: this.cup.x, y: this.cup.to, what: 'cup' };
    return null;
  }

  /** A new ball leaves a kicker's foot. */
  launch(kind, zone, from, { second = false } = {}) {
    const { plan, glove } = this;
    const mercy = Math.min(this.misses, MERCY.most);
    let to = this.placeFor(kind === 'golden' ? 'corner' : zone);
    if (mercy && glove) {
      const { x: [left, right], y: [top, bottom] } = this.box;
      const nearer = MERCY.nearer * mercy;
      to = { x: clamp(mix(to.x, glove.x, nearer), left, right), y: clamp(mix(to.y, glove.y, nearer), top, bottom) };
    }
    const slower = { heavy: EXTRAS.heavySlower, golden: EXTRAS.goldenSlower, trick: EXTRAS.trickSlower }[kind] ?? 1;
    const shot = {
      id: this.nextId,
      kind,
      second,
      from: { ...from },
      to,
      t: 0,
      flight: plan.flight * slower * (1 + MERCY.slower * mercy),
      // A curling shot bends towards the side it started from, then comes round.
      curve: kind === 'curl' ? EXTRAS.curl * (to.x < 0.5 ? 1 : -1) : 0,
      lob: LOB,
      far: BALL.far,
      near: BALL.near * (kind === 'heavy' ? EXTRAS.heavyBigger : 1),
      state: 'flying',
      covered: false,
      pushed: 0,
      slipped: 0,
      touched: false,
      bounces: kind === 'bounce' ? 1 : 0,
      hopped: false,
      gone: 0,
    };
    // A trick shot's other place: as far over on the other side of the middle, and as high.
    if (kind === 'trick') shot.other = { x: 1 - to.x, y: to.y };
    this.nextId += 1;
    this.stats.shots += 1;
    this.shots.push(shot);
    this.onEvent({ type: 'kick', shot });
    return shot;
  }

  /** Where a ball is now, and how big: { x, y, r }. */
  ballAt(shot) {
    const t = clamp(shot.t, 0, 1);
    const along = t ** 1.35;
    const arc = 4 * along * (1 - along);
    return {
      x: mix(shot.from.x, shot.to.x, along) + (shot.curve * arc) / this.aspect,
      y: mix(shot.from.y, shot.to.y, along) - shot.lob * arc,
      r: mix(shot.far, shot.near, t ** 1.8),
    };
  }

  /** Whether the glove, ready to save, is on a ball. */
  touching(glove, ball) {
    return Boolean(glove?.ready) && glove.reach(ball.x, ball.y) <= ball.r * TOUCH;
  }

  /**
   * One frame. glove is { visible, ready, x, y, reach(x, y) }: whether the hand is in the picture, whether it's
   * ready to save (open, and held up), where it is, and how far its nearest part is from a place, in screen
   * heights.
   */
  update(dt, { glove = null } = {}) {
    if (this.done) return;
    this.time += dt;
    if (glove?.visible) this.glove = { x: glove.x, y: glove.y };
    this.readyFor = glove?.ready ? this.readyFor + dt : 0;
    if (glove?.ready) this.stats.held += dt;
    // In a real match, with no hand in the picture the kickers wait and the balls stop where they are, so a child
    // who goes away, or whose hand the camera loses, isn't scored against for it.
    const away = this.real && !glove?.visible;

    if (this.phase === 'play' && !away) this.playOn(dt);
    for (const shot of this.shots) this.fly(shot, away ? 0 : dt, glove);
    this.shots = this.shots.filter((shot) => !(shot.state === 'saved' && shot.gone >= SHOWN.saved) && !(shot.state === 'in' && shot.gone >= SHOWN.in));
    this.floatPrizes(dt, glove);

    if (this.phase === 'play' && this.stats.saves >= this.target) this.matchWon();
    if (this.phase === 'cup') this.floatCup(dt, glove);
    if (this.phase === 'won' || this.phase === 'lost') {
      this.partyLeft -= dt;
      if (this.partyLeft <= 0) this.done = true;
    }
  }

  /** The kickers: waiting for the hand, running up, and shooting. */
  playOn(dt) {
    for (const kicker of this.kickers) {
      if (kicker.state === 'kicked') kicker.t += dt;
    }
    for (const later of this.pending) {
      later.left -= dt;
      if (later.left > 0) continue;
      later.kicker.state = 'kicked';
      later.kicker.t = 0;
      this.launch(later.kind, later.zone, { x: later.kicker.x, y: later.kicker.y }, { second: true });
    }
    this.pending = this.pending.filter((later) => later.left > 0);

    if (this.runUp) {
      this.runUp.t += dt;
      for (const kicker of this.kickers) {
        if (kicker.state === 'runup') kicker.t = Math.min(1, this.runUp.t / RUN_UP);
      }
      if (this.runUp.t >= RUN_UP) this.shoot();
      return;
    }
    if (this.live.length || this.pending.length) return;
    this.wait -= dt;
    // In a real match the kicker shoots on the clock, ready or not. In the gentle one, the kicker waits for the hand to
    // be ready: nobody shoots at a child who's resting.
    if (this.wait > 0 || (!this.real && this.readyFor < READY_FOR)) return;
    this.runUp = { t: 0 };
    for (const kicker of this.kickers) Object.assign(kicker, { state: 'runup', t: 0 });
    this.onEvent({ type: 'runup', kickers: this.kickers });
  }

  /** The run-up is over: the ball is kicked, and with a double shot the second kicker's follows. */
  shoot() {
    const [first, second] = this.kickers;
    const { kind } = first;
    const zone = ZONES[this.count % ZONES.length];
    this.runUp = null;
    first.state = 'kicked';
    first.t = 0;
    if (kind === 'double') {
      // One to the hand's own side, and then one across.
      this.launch('double', 'out', { x: first.x, y: first.y });
      second.state = 'waiting';
      this.pending.push({ left: this.plan.doubleGap, kind: 'double', zone: 'across', kicker: second });
    } else {
      this.launch(kind, kind === 'trick' ? 'out' : zone, { x: first.x, y: first.y });
    }
    this.count += 1;
  }

  /** One ball's frame: on its way, at the line, being held back, or over. */
  fly(shot, dt, glove) {
    if (shot.state === 'saved' || shot.state === 'in') {
      shot.gone += dt;
      return;
    }
    if (shot.state === 'pushing') {
      const ball = this.ballAt(shot);
      shot.covered = this.touching(glove, ball);
      if (shot.covered) {
        if (!shot.touched) {
          shot.touched = true;
          this.onEvent({ type: 'push', shot });
        }
        shot.pushed += dt;
        if (shot.pushed >= EXTRAS.heavyHold) this.save(shot, ball);
      } else {
        shot.slipped += dt;
        if (shot.slipped >= EXTRAS.heavySlip) this.letIn(shot);
      }
      return;
    }
    shot.t += dt / shot.flight;
    if (shot.kind === 'trick' && !shot.hopped && shot.t >= EXTRAS.trickAt) {
      // The ring hops to its other place, and the ball bends round to it.
      const here = this.ballAt(shot);
      shot.hopped = true;
      shot.from = { x: here.x, y: here.y };
      shot.far = here.r;
      shot.flight *= 1 - shot.t;
      shot.t = 0;
      shot.to = shot.other;
      shot.lob *= 0.5;
      this.onEvent({ type: 'hop', shot });
    }
    const ball = this.ballAt(shot);
    // The ring says so as soon as the glove is in the right place, ready to save.
    shot.covered = Boolean(glove?.ready) && glove.reach(shot.to.x, shot.to.y) <= shot.near * TOUCH;
    if (shot.t < SAVE_FROM) return;
    const heavy = shot.kind === 'heavy';
    if (!heavy && this.touching(glove, ball)) {
      this.save(shot, ball);
    } else if (shot.t >= 1) {
      const linger = this.plan.linger / shot.flight;
      shot.t = Math.min(shot.t, 1 + linger);
      if (heavy) {
        shot.state = 'pushing';
        this.onEvent({ type: 'thud', shot });
      } else if (shot.t >= 1 + linger) {
        this.letIn(shot);
      }
    }
  }

  /** The glove has the ball. */
  save(shot, ball) {
    const { stats, plan } = this;
    const at = { x: ball.x, y: ball.y };
    // Where it was going, which is where the hand had to get to.
    const parts = this.partsOf(shot.to);
    stats.saves += 1;
    stats.run += 1;
    stats.bestRun = Math.max(stats.bestRun, stats.run);
    for (const part of ['across', 'out', 'high']) stats[part] += parts[part] ? 1 : 0;
    this.misses = 0;
    const last = stats.saves >= this.target;
    this.onEvent({ type: 'save', shot, at, parts, last });

    if (shot.kind === 'golden') {
      // Its stars fly straight up to the tally.
      stats.stars += EXTRAS.goldenStars;
      this.onEvent({ type: 'prize', kind: 'star', at, count: EXTRAS.goldenStars });
    } else if (shot.kind === 'bubbles' && !last) {
      this.burst(at);
    } else if (plan.stars && !last) {
      this.dropStar(at);
    }

    if (shot.bounces > 0 && !last) {
      // It bounces up off the glove, and comes down again on the other side of where it was.
      shot.bounces -= 1;
      shot.from = at;
      shot.to = this.placeFor(parts.across ? 'near' : 'across');
      shot.t = 0;
      shot.flight = EXTRAS.bounceFlight;
      shot.lob = EXTRAS.bounceLob;
      shot.far = shot.near * 0.8;
      shot.curve = 0;
      this.onEvent({ type: 'bounce', shot });
      return;
    }
    shot.state = 'saved';
    shot.at = at;
    shot.gone = 0;
    this.afterShot();
  }

  /**
   * The ball goes in. In a real match it's a goal to the other team, and enough of them win it. In the gentle match
   * nothing is lost: the next ones come slower, and nearer the glove.
   */
  letIn(shot) {
    this.stats.goals += 1;
    this.stats.run = 0;
    if (!this.real) this.misses += 1;
    shot.state = 'in';
    shot.gone = 0;
    shot.covered = false;
    this.onEvent({ type: 'goal', shot });
    this.afterShot();
    if (this.phase === 'play' && this.stats.goals >= this.toLose) this.matchLost();
  }

  /** Whether the other team has won the match. */
  get lost() {
    return this.phase === 'lost';
  }

  /** Once no ball is on its way, the next kickers come to their spots, and wait a moment. */
  afterShot() {
    if (this.live.length || this.pending.length) return;
    this.wait = this.plan.gap;
    this.callKickers();
  }

  /**
   * A place in the goal about so far from another, in a direction (in radians, 0 to the right and a quarter turn
   * down), or as near that direction as leaves it furthest away, as the edge of the goal may be in the way.
   */
  placeAway(at, far, angle) {
    const { x: [left, right], y: [top, bottom] } = this.box;
    let best = null;
    for (const turn of [0, 1, -1, 2, -2, 3]) {
      const way = angle + (turn * Math.PI) / 3;
      const to = { x: clamp(at.x + (Math.cos(way) * far) / this.aspect, left, right), y: clamp(at.y + Math.sin(way) * far, top, bottom) };
      const gap = Math.hypot((to.x - at.x) * this.aspect, to.y - at.y);
      if (gap >= far * 0.8) return to;
      if (!best || gap > best.gap) best = { to, gap };
    }
    return best.to;
  }

  /** A star pops out of a saved ball, and comes to rest a little way off, towards the middle of the goal. */
  dropStar(at) {
    const { y: [top, bottom] } = this.box;
    const middle = { x: 0.5, y: (top + bottom) / 2 };
    const to = this.placeAway(at, EXTRAS.starOut, Math.atan2(middle.y - at.y, (middle.x - at.x) * this.aspect));
    const star = { id: this.nextId, x: at.x, y: at.y, from: at, to, age: 0, left: EXTRAS.starSeconds };
    this.nextId += 1;
    this.stars.push(star);
    this.onEvent({ type: 'star', star });
  }

  /** A bubble ball bursts into bubbles, round where it was saved. */
  burst(at) {
    const turn = this.random() * Math.PI * 2;
    for (let n = 0; n < EXTRAS.bubbles; n += 1) {
      const to = this.placeAway(at, EXTRAS.bubbleOut, turn + (n * Math.PI * 2) / EXTRAS.bubbles);
      this.bubbles.push({ id: this.nextId, x: at.x, y: at.y, from: at, to, age: 0, left: EXTRAS.bubbleSeconds, phase: n * 2.1 });
      this.nextId += 1;
    }
    this.onEvent({ type: 'bubbles', at });
  }

  /** Stars and bubbles drift out to where they wait, and the glove touching one takes it. Any hand will do. */
  floatPrizes(dt, glove) {
    const near = (thing, touch) => Boolean(glove?.visible) && thing.age >= EXTRAS.prizeLands && glove.reach(thing.x, thing.y) <= touch;
    for (const star of this.stars) {
      star.age += dt;
      star.left -= dt;
      const out = 1 - (1 - clamp(star.age / EXTRAS.prizeLands, 0, 1)) ** 2;
      star.x = mix(star.from.x, star.to.x, out);
      star.y = mix(star.from.y, star.to.y, out);
      if (near(star, EXTRAS.starTouch)) {
        star.taken = true;
        this.stats.stars += 1;
        this.onEvent({ type: 'prize', kind: 'star', at: { x: star.x, y: star.y }, count: 1 });
      }
    }
    this.stars = this.stars.filter((star) => !star.taken && star.left > 0);
    for (const bubble of this.bubbles) {
      bubble.age += dt;
      bubble.left -= dt;
      const out = 1 - (1 - clamp(bubble.age / EXTRAS.prizeLands, 0, 1)) ** 2;
      bubble.x = mix(bubble.from.x, bubble.to.x, out);
      bubble.y = mix(bubble.from.y, bubble.to.y, out) + Math.sin(this.time * 1.6 + bubble.phase) * 0.008 * out;
      if (near(bubble, EXTRAS.bubbleTouch)) {
        bubble.taken = true;
        this.stats.stars += 1;
        this.onEvent({ type: 'pop', at: { x: bubble.x, y: bubble.y } });
        this.onEvent({ type: 'prize', kind: 'star', at: { x: bubble.x, y: bubble.y }, count: 1 });
      }
    }
    this.bubbles = this.bubbles.filter((bubble) => !bubble.taken && bubble.left > 0);
  }

  /** Anything still on its way is over, and nothing more is kicked. */
  stopKicking() {
    this.shots = this.shots.filter((shot) => shot.state === 'saved' || shot.state === 'in');
    this.pending = [];
    this.runUp = null;
    for (const kicker of this.kickers) Object.assign(kicker, { state: 'ready', t: 0 });
  }

  /** In a real match, enough balls have gone in: the other team cheers, and the match is over. */
  matchLost() {
    this.stopKicking();
    this.phase = 'lost';
    this.partyLeft = LOST_SECONDS;
    this.onEvent({ type: 'lost' });
  }

  /** Enough saves: the match is won. At level 10 the cup comes down first. */
  matchWon() {
    this.stopKicking();
    if (this.plan.cup) {
      const { y: [top, bottom] } = this.box;
      this.phase = 'cup';
      this.cup = { x: 0.5, y: top - 0.12, from: top - 0.12, to: (top + bottom) / 2, t: 0, waited: 0, state: 'falling' };
      this.onEvent({ type: 'cup-out', cup: this.cup });
      return;
    }
    this.celebrate();
  }

  /** The cup floats down to the middle of the goal, and waits there to be caught. It's never lost. */
  floatCup(dt, glove) {
    const { cup } = this;
    cup.t = Math.min(1, cup.t + dt / EXTRAS.cupFall);
    cup.y = mix(cup.from, cup.to, 1 - (1 - cup.t) ** 2);
    if (cup.t >= 1) {
      cup.state = 'waiting';
      cup.waited += dt;
    }
    const caught = Boolean(glove?.visible) && cup.t > 0.3 && glove.reach(cup.x, cup.y) <= EXTRAS.cupTouch;
    if (caught || cup.waited >= EXTRAS.cupWaits) {
      cup.state = 'caught';
      cup.byHand = caught;
      this.onEvent({ type: 'cup', cup, caught });
      this.celebrate();
    }
  }

  celebrate() {
    this.phase = 'won';
    this.partyLeft = PARTY_SECONDS;
    this.onEvent({ type: 'won' });
  }
}
