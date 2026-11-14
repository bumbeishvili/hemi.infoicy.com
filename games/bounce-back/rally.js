// One game of Bounce Back, from the first serve to the last point, with no screen in this file, so it can
// be tested on its own. See rules.js for the court and the numbers.
//
// The child's open hand hits the ball back over the net. A hand that's missing, or not open, never does.
// A point is over when the ball bounces twice on one side, and the other side has it, except that a child
// who was resting never loses one: if their hand wasn't open at any time while the ball was coming, the
// ball floats back up and waits for them, however long they take. On Medium, as it comes, and on Tough, a
// ball the child tried for and missed is the computer's point, so the computer can win. On Gentle, playing
// the computer, it always waits, so the game can't be lost. The computer aims for wherever the child's hand
// is, a little way off on the harder settings, and misses one of the child's shots after a few, fewer of
// them as the levels go up.
//
// With a friend on their own computer, the game of whoever made it runs this, and the friend's game sends
// where their racket is and their hits: see applyHit. The friend's game shows the ball with follow.js.
//
// A friend can be played against, as above, or with: together, the two of them keep the ball going between
// them, and every hit over the net is one for the team. There are no points to win or lose. A ball that gets
// past someone floats back up and waits for them, and the game is over, and won by both, once the team has
// made as many hits as it set out to.
import {
  advanceBall, aimAt, BALLS, BALL_KINDS, ballFor, clamp, codeOf, COURT, courtLevel, crossingSeconds,
  EXTRAS, gravityFor, keepOnSide, landingOn, missAfterRange, otherSide, RACKET, shotTo, sideAt, SIDES,
  signOf, solveShot, spreadFor, STATES, touches,
} from './rules.js';

const POINT_PAUSE = 1.5; // Seconds from one point to the next serve.
const COMPUTER_SERVES_AFTER = 1.1;
const SEEN_BEFORE_SERVE = 0.5; // The computer serves once the child's hand has been in view this long.
const HOME = { u: 0.62, h: 0.44 }; // Where a player waits, on their own side, as shares of a half.
const WAIT_EASE = 2.4; // How quickly a waiting ball floats to where it waits.
const WAIT_BOB = 0.025;
const WAIT_AWAY = 0.36; // A waiting ball is this far from the hand, just out of reach.
const WAIT_SETTLE = 1; // Seconds before a waiting ball starts drifting to an open hand.
const WAIT_READY = 0.5; // And before it can be hit at all.
const WAIT_DRIFT = 0.12; // How fast a waiting ball comes to an open hand near it, in court units a second,
const WAIT_DRIFT_HELP = 0.35; // and how much faster with reach help.
const GRACE = 0.6; // A friend's hit on its way still counts this long after the ball bounced twice.
const TEAM_PAUSE = 1.2; // Together, the last hit is seen going over for this long before the game is over.
const COMPUTER_RUN = 1.5; // How fast the computer's racket moves, in court units a second.
const BIG_RACKET = 1.4;
const round3 = (value) => Math.round(value * 1000) / 1000;

const newRacket = (side) => ({ u: signOf(side) * HOME.u, h: HOME.h, visible: false, open: false, radius: RACKET.radius, pull: 0, seenFor: 0 });
const newBall = () => ({ u: 0, h: 0.5, vu: 0, vh: 0, state: 'held', side: 'A', by: null, bounces: 0, stroke: 0, kind: 'beach', since: 0, rolling: false, waitAt: { u: 0, h: 0.5 } });

export class Rally {
  /**
   * mode is 'solo', against the computer, or 'host', with a friend on side B. pace, hard and goal are the
   * grown-up's choices: how quick the ball is, how hard, and how many points win. team is a friend played with
   * rather than against, and then goal is how many hits the two of them make together, and the scores are the
   * hits each has made. extras says whether the
   * levels' new things are in play, which they never are with a friend. events are told what happens:
   * onServe(side, kind), onHit(side, info), onBounce(side, info), onNet(), onWait(side), onSwing(side),
   * onPoint(winner, info), onOver(winner), onItem(item), onPrize(kind, at), onPower(kind, at),
   * onPowerEnd(kind), onFlag(lit, info), onCastle(castle, what) and onSave(at).
   */
  constructor({ level = 1, pace = 'slow', hard = 'gentle', goal = 5, mode = 'solo', team = false, extras = mode === 'solo', random = Math.random, events = {} } = {}) {
    Object.assign(this, { level, pace, hard, goal, mode, random, events, extras });
    this.team = Boolean(team) && mode === 'host';
    this.wonAt = Infinity;
    const plan = courtLevel(level, hard);
    // With a friend, it's the plain game at this level's speed, the same for both.
    this.plan = extras ? plan : { ...plan, stars: false, bubble: false, flags: 0, bigRacket: false, castles: 0, rainbow: false, breeze: 0, bird: false, golden: false, specials: [] };
    this.players = {
      A: { kind: 'child', racket: newRacket('A') },
      B: { kind: mode === 'host' ? 'remote' : 'computer', racket: newRacket('B') },
    };
    this.computerSide = this.players.B.kind === 'computer' ? 'B' : null;
    if (this.computerSide) Object.assign(this.players.B.racket, { visible: true, open: true });
    // On Gentle against the computer, the ball always waits for the child.
    this.alwaysWaits = mode === 'solo' && hard === 'gentle';
    this.time = 0;
    this.scores = { A: 0, B: 0 };
    this.point = 0;
    this.server = 'A';
    this.phase = 'ready';
    this.winner = null;
    this.rallyHits = 0;
    this.pointHits = { A: 0, B: 0 };
    this.tried = { A: false, B: false };
    this.pending = null;
    this.wind = 0;
    this.ball = newBall();
    this.computer = { plan: null, serveIn: COMPUTER_SERVES_AFTER, missAfter: 1 };
    this.stats = { hits: { A: 0, B: 0 }, longest: 0, prizes: { star: 0, shell: 0, trophy: 0, gem: 0 }, saves: 0 };
    // The levels' new things: stars and power-ups floating on the child's side, a power-up in use, the
    // flags, and the sandcastles.
    this.items = [];
    this.nextItem = 1;
    this.power = null;
    this.flagsLit = 0;
    this.castles = Array.from({ length: this.plan.castles }, (_, index) => ({ id: index, u: EXTRAS.castles[index] * signOf('B'), standing: true, fellAt: -Infinity, builtAt: -Infinity }));
    this.starIn = EXTRAS.starEvery * 0.5;
    this.powerIn = EXTRAS.firstPowerAfter;
    this.powerTurn = 0;
  }

  /** The first serve, which is always the child's: a ball that waits in front of them. */
  begin(inputs = {}) {
    // Where the hands are already, so the first serve waits near the child's.
    for (const side of SIDES) this.readRacket(side, inputs[side], 0);
    this.startPoint();
  }

  get over() {
    return this.phase === 'over';
  }

  /** How the ball moves, at this moment: gravity for its kind, and the breeze. */
  envFor(kind) {
    return { gravity: gravityFor(crossingSeconds(this.pace, this.level, kind, this.hard)), wind: this.wind };
  }

  startPoint() {
    const { ball } = this;
    this.point += 1;
    this.server = this.point % 2 === 1 ? 'A' : 'B';
    this.rallyHits = 0;
    this.pointHits = { A: 0, B: 0 };
    this.tried = { A: false, B: false };
    this.pending = null;
    this.phase = 'serve';
    const kind = ballFor(this.level, this.point, { lastPoint: this.scores.A === this.goal - 1, extras: this.extras });
    Object.assign(ball, { kind, state: 'held', side: this.server, by: null, bounces: 0, vu: 0, vh: 0, since: 0, rolling: false });
    ball.stroke += 1;
    const spot = this.waitSpot(this.server);
    Object.assign(ball, { u: spot.u, h: spot.h, waitAt: spot });
    if (this.computerSide) {
      const [fewest, most] = missAfterRange(this.hard, this.level);
      Object.assign(this.computer, { plan: null, serveIn: COMPUTER_SERVES_AFTER, missAfter: fewest + Math.floor(this.random() * (most - fewest + 1)) });
    }
    this.events.onServe?.(this.server, kind);
  }

  /**
   * One frame. inputs has each child's racket, by side: { visible, open, u, h, radius, pull }, the child's
   * own from their glove, and a friend's from what their game sends.
   */
  update(dt, inputs = {}) {
    if (this.phase === 'over' || this.phase === 'ready') return;
    this.time += dt;
    this.wind = this.plan.breeze ? this.plan.breeze * Math.sin(this.time * EXTRAS.breezeRate) : 0;
    for (const side of SIDES) this.readRacket(side, inputs[side], dt);
    if (this.computerSide) this.moveComputer(dt);
    this.moveBall(dt);
    if (this.extras) this.updateExtras(dt);
    // Together, once the team has its hits, the last one is seen going over, and then it's over.
    if (this.team && this.winner && this.time >= this.wonAt + TEAM_PAUSE) {
      this.phase = 'over';
      this.events.onOver?.(this.winner);
    }
  }

  readRacket(side, input, dt) {
    const player = this.players[side];
    if (player.kind === 'computer') return;
    const { racket } = player;
    if (input) {
      Object.assign(racket, keepOnSide(side, input.u, input.h));
      racket.visible = Boolean(input.visible);
      // Fails closed: a hand that can't be seen is never open.
      racket.open = racket.visible && input.open === true;
      racket.radius = (input.radius ?? RACKET.radius) * (side === 'A' && this.power?.kind === 'big' ? BIG_RACKET : 1);
      racket.pull = input.pull ?? 0;
    }
    racket.seenFor = racket.visible ? racket.seenFor + dt : 0;
    const { ball } = this;
    if (racket.open && ball.side === side && ball.state === 'flying' && ball.by !== side) this.tried[side] = true;
  }

  /** Whether a child is there to play: their hand has been in view a moment. */
  readyFor(side) {
    const { racket } = this.players[side];
    return racket.visible && racket.seenFor >= SEEN_BEFORE_SERVE;
  }

  /**
   * Where a ball waits for a child: just out of reach of their hand, towards the net if there's room, so a
   * little reach gets to it, or in the middle of their half when the hand can't be seen.
   */
  waitSpot(side) {
    const s = signOf(side);
    const { racket, kind } = this.players[side];
    if (kind === 'computer') return { u: racket.u - s * 0.04, h: racket.h + 0.16 };
    if (!racket.visible) return { u: s * 0.58, h: 0.52 };
    const along = Math.abs(racket.u);
    const nearer = along - WAIT_AWAY >= 0.3 ? along - WAIT_AWAY : along + WAIT_AWAY;
    return { u: s * clamp(nearer, 0.3, 1), h: clamp(racket.h, 0.36, 0.72) };
  }

  /* ---------- the ball ---------- */

  moveBall(dt) {
    const { ball } = this;
    ball.since += dt;
    if (ball.state === 'held') this.holdBall(dt);
    else if (ball.state === 'waiting') this.waitBall(dt);
    else if (ball.state === 'flying') this.flyBall(dt);
    else if (ball.state === 'dead') this.deadBall(dt);
  }

  /** Before a serve. A child's serve waits for them. The computer bounces it in its hand until the child is there. */
  holdBall(dt) {
    const { ball } = this;
    const side = this.server;
    if (this.players[side].kind !== 'computer') {
      this.waitBall(dt);
      return;
    }
    const { racket } = this.players[side];
    ball.u = racket.u - signOf(side) * 0.04;
    ball.h = racket.h + 0.16 + 0.05 * Math.abs(Math.sin(this.time * 2.4));
    if (!this.readyFor(otherSide(side))) this.computer.serveIn = Math.max(this.computer.serveIn, 0.7);
    else this.computer.serveIn -= dt;
    if (this.computer.serveIn <= 0) this.strike(side);
  }

  /**
   * A ball waiting for a child floats where they can reach it. After a moment it drifts to an open hand near
   * it, which is all the lining up a child needs.
   */
  waitBall(dt) {
    const { ball } = this;
    const side = ball.side;
    const { racket, kind } = this.players[side];
    const anchor = ball.waitAt;
    if (racket.open && ball.since > WAIT_SETTLE) {
      const du = racket.u - anchor.u;
      const dh = racket.h - anchor.h;
      const gap = Math.hypot(du, dh);
      if (gap > 1e-6 && gap < RACKET.pullRange * 1.25) {
        const step = Math.min(gap, (WAIT_DRIFT + racket.pull * WAIT_DRIFT_HELP) * dt);
        anchor.u += (du / gap) * step;
        anchor.h += (dh / gap) * step;
      }
    }
    // It never waits right by the net.
    Object.assign(anchor, keepOnSide(side, anchor.u, anchor.h));
    anchor.u = signOf(side) * Math.max(Math.abs(anchor.u), 0.18);
    const blend = 1 - Math.exp(-dt * WAIT_EASE);
    ball.u += (anchor.u - ball.u) * blend;
    ball.h += (anchor.h + WAIT_BOB * Math.sin(ball.since * 2.2) - ball.h) * blend;
    ball.vu = 0;
    ball.vh = 0;
    // A moment to see it first, even if the hand is already there.
    if (kind === 'child' && ball.since > WAIT_READY && touches(ball, racket)) this.strike(side);
  }

  flyBall(dt) {
    const { ball } = this;
    this.pullTowardsRacket(dt);
    for (const event of advanceBall(ball, dt, this.envFor(ball.kind))) {
      if (event.type === 'cross') this.crossed(event.to);
      else if (event.type === 'bounce') this.bounced(event);
      else if (event.type === 'net') this.events.onNet?.();
      if (ball.state !== 'flying') return;
    }
    // Gone right off the end, which is as good as bouncing twice.
    if (Math.abs(ball.u) > 1.75 && !this.birdSaves(ball.side)) {
      this.secondBounce(ball.side);
      if (ball.state !== 'flying') return;
    }
    const side = ball.side;
    if (ball.by !== side && this.players[side].kind === 'child' && touches(ball, this.players[side].racket)) this.strike(side);
    if (this.pending && this.time >= this.pending.at) {
      const { to } = this.pending;
      this.pending = null;
      this.pointTo(to);
    }
  }

  /** Help with lining up: an open hand on the side the ball is coming to draws it in. */
  pullTowardsRacket(dt) {
    const { ball } = this;
    const side = ball.side;
    const player = this.players[side];
    if (player.kind === 'computer' || ball.by === side || Math.abs(ball.u) < 0.15) return;
    const { racket } = player;
    if (!racket.open) return;
    const du = racket.u - ball.u;
    const dh = racket.h - ball.h;
    const gap = Math.hypot(du, dh);
    if (gap < 1e-6 || gap > RACKET.pullRange) return;
    const bird = side === 'A' && this.power?.kind === 'bird' ? 2 : 1;
    const pull = racket.pull * bird * (1 - gap / RACKET.pullRange);
    ball.vu += (du / gap) * pull * dt;
    ball.vh += (dh / gap) * pull * dt;
  }

  crossed(to) {
    const { ball } = this;
    ball.side = to;
    ball.bounces = 0;
    this.tried[to] = this.players[to].racket.open;
  }

  bounced(event) {
    const { ball } = this;
    const side = sideAt(event.u);
    ball.side = side;
    ball.bounces += 1;
    this.events.onBounce?.(side, event);
    if (this.extras && ball.bounces === 1 && this.players[side].kind === 'computer' && ball.by === otherSide(side)) this.knockCastle(event.u);
    if (ball.bounces >= 2 && !this.birdSaves(side)) this.secondBounce(side);
  }

  /** The ball has bounced twice on a side: a point for the other side, unless it waits for a child resting. */
  secondBounce(side) {
    if (this.pending || this.ball.state !== 'flying') return;
    // Together, there's nothing to lose: it floats back up and waits for whoever it got past, and the hits in
    // a row start again.
    if (this.team) {
      this.rallyHits = 0;
      this.startWaiting(side);
      return;
    }
    const player = this.players[side];
    if (player.kind === 'computer') {
      this.pointTo(otherSide(side));
      return;
    }
    if (this.alwaysWaits || !this.tried[side]) {
      this.startWaiting(side);
      return;
    }
    // A friend's hit may be on its way.
    if (player.kind === 'remote') {
      this.pending = { to: otherSide(side), at: this.time + GRACE };
      return;
    }
    this.pointTo(otherSide(side));
  }

  startWaiting(side) {
    const { ball } = this;
    Object.assign(ball, { state: 'waiting', side, by: null, bounces: 0, vu: 0, vh: 0, since: 0, rolling: false });
    ball.waitAt = this.waitSpot(side);
    this.tried[side] = false;
    this.events.onWait?.(side);
  }

  /** The point is over: the ball rolls away, and the next point starts after a moment. */
  deadBall(dt) {
    const { ball } = this;
    for (const event of advanceBall(ball, dt, { gravity: this.envFor(ball.kind).gravity, wind: 0 })) {
      if (event.type === 'bounce') this.events.onBounce?.(sideAt(event.u), { ...event, dead: true });
    }
    if (ball.since < POINT_PAUSE) return;
    if (this.winner) {
      this.phase = 'over';
      this.events.onOver?.(this.winner);
      return;
    }
    this.startPoint();
  }

  pointTo(winner) {
    const { ball } = this;
    this.scores[winner] += 1;
    Object.assign(ball, { state: 'dead', since: 0 });
    this.pending = null;
    this.phase = 'point';
    if (this.computerSide) this.computer.plan = null;
    if (this.scores[winner] >= this.goal) this.winner = winner;
    this.events.onPoint?.(winner, { rally: this.rallyHits, scores: { ...this.scores } });
  }

  /* ---------- hitting it ---------- */

  /** Where a shot from this side goes: to the other child's hand, or onto the computer's court. */
  targetFor(side) {
    const receiver = otherSide(side);
    const player = this.players[receiver];
    if (player.kind === 'computer') return landingOn(receiver, this.castles, this.random);
    // Together, a long rally is the whole idea, so shots don't drift further off the hand as it goes on.
    return aimAt(receiver, player.racket, spreadFor(this.hard, this.team ? 0 : this.rallyHits, this.mode === 'host', this.level), this.random);
  }

  /** A hit from this side. given is a friend's own hit, as their game worked it out: { vu, vh }. */
  strike(side, given = null) {
    const { ball } = this;
    let shot = given;
    if (!shot) {
      shot = shotTo(ball, this.targetFor(side), crossingSeconds(this.pace, this.level, ball.kind, this.hard), this.envFor(ball.kind));
      ball.u = shot.from.u;
      ball.h = shot.from.h;
    }
    Object.assign(ball, { vu: shot.vu, vh: shot.vh, state: 'flying', by: side, side, bounces: 0, since: 0, rolling: false });
    ball.stroke += 1;
    this.rallyHits += 1;
    this.pointHits[side] += 1;
    this.stats.hits[side] += 1;
    this.stats.longest = Math.max(this.stats.longest, this.rallyHits);
    this.tried[side] = false;
    this.pending = null;
    this.phase = 'rally';
    if (this.computerSide) this.computer.plan = null;
    this.events.onHit?.(side, { kind: ball.kind, rally: this.rallyHits, by: this.players[side].kind, at: { u: ball.u, h: ball.h } });
    if (this.extras && this.players[side].kind === 'child') this.childHit();
    if (this.team) this.teamHit(side);
  }

  /** How many hits the two of them have made together. */
  get teamHits() {
    return this.scores.A + this.scores.B;
  }

  /** Together, every hit is one for the team, kept as whose it was, until the team has as many as it set out to. */
  teamHit(side) {
    if (this.winner) return;
    this.scores[side] += 1;
    this.events.onTeamHit?.(side, { hits: this.teamHits, goal: this.goal });
    if (this.teamHits >= this.goal) {
      this.winner = 'both';
      this.wonAt = this.time;
    }
  }

  /**
   * A friend's hit, from their game: { k, u, h, vu, vh, elapsed }. k is which ball they hit, and elapsed how
   * long ago, as best this game can tell. Returns whether it counted: a hit on a ball that has gone, or from
   * the wrong side, doesn't.
   */
  applyHit(side, hit) {
    const { ball } = this;
    if (this.players[side]?.kind !== 'remote' || this.phase === 'over' || this.phase === 'point') return false;
    if (hit.k !== ball.stroke || ball.side !== side || sideAt(hit.u) !== side) return false;
    const open = (ball.state === 'flying' && ball.by !== side) || ball.state === 'waiting' || (ball.state === 'held' && this.server === side);
    if (!open || ![hit.u, hit.h, hit.vu, hit.vh].every(Number.isFinite)) return false;
    const moved = { u: hit.u, h: Math.max(COURT.ball, hit.h), vu: hit.vu, vh: hit.vh, rolling: false };
    advanceBall(moved, clamp(hit.elapsed ?? 0, 0, 0.35), this.envFor(ball.kind));
    ball.u = moved.u;
    ball.h = moved.h;
    this.strike(side, moved);
    if (sideAt(ball.u) !== side) this.crossed(sideAt(ball.u));
    return true;
  }

  /* ---------- the computer ---------- */

  moveComputer(dt) {
    const side = this.computerSide;
    const s = signOf(side);
    const ai = this.computer;
    const { racket } = this.players[side];
    const { ball } = this;
    let goal = { u: s * HOME.u, h: HOME.h };
    if (ball.state === 'held' && this.server === side) goal = { u: s * 0.8, h: 0.4 };
    else if (ball.state === 'flying' && ball.by && ball.by !== side) {
      if (!ai.plan || ai.plan.stroke !== ball.stroke) ai.plan = this.planFor(side);
      goal = ai.plan.goal;
    }
    const du = goal.u - racket.u;
    const dh = goal.h - racket.h;
    const gap = Math.hypot(du, dh);
    const step = Math.min(gap, COMPUTER_RUN * dt);
    if (gap > 1e-6) {
      racket.u += (du / gap) * step;
      racket.h += (dh / gap) * step;
    }
    if (ball.state !== 'flying' || !ai.plan || ball.by === side || ball.side !== side) return;
    const ready = ball.bounces >= 1 || !ai.plan.afterBounce;
    if (ai.plan.miss) {
      if (!ai.plan.swung && ready && Math.abs(ball.u - racket.u) < 0.3) {
        ai.plan.swung = true;
        this.events.onSwing?.(side);
      }
    } else if (ready && touches(ball, racket)) {
      this.strike(side);
    }
  }

  /**
   * Where the computer will hit the ball that's coming: after it bounces, at the top of the bounce or on its
   * way down through a comfortable height. Once the child has hit it enough times this point, it goes a
   * little wrong instead, and misses.
   */
  planFor(side) {
    const s = signOf(side);
    const { ball } = this;
    const env = this.envFor(ball.kind);
    const copy = { u: ball.u, h: ball.h, vu: ball.vu, vh: ball.vh, rolling: false };
    const step = 1 / 60;
    let bounced = false;
    let best = null;
    let volley = null;
    for (let t = 0; t < 7 && !best; t += step) {
      const events = advanceBall(copy, step, env);
      if (events.some(({ type, u }) => type === 'bounce' && sideAt(u) === side)) {
        if (bounced) break;
        bounced = true;
      }
      if (copy.u * s < 0.15) continue;
      if (!bounced) {
        if (!volley || Math.abs(copy.h - 0.45) < Math.abs(volley.h - 0.45)) volley = { u: copy.u, h: copy.h };
      } else if (copy.vh < 0 && copy.h <= 0.6) {
        best = { u: copy.u, h: copy.h };
      }
    }
    const at = best ?? volley ?? { u: s * HOME.u, h: HOME.h };
    const miss = this.pointHits[otherSide(side)] >= this.computer.missAfter;
    const goal = miss
      ? { u: s * clamp(Math.abs(at.u) - 0.42, 0.15, 1.2), h: clamp(at.h - 0.12, 0.2, 0.7) }
      : { u: s * clamp(Math.abs(at.u), 0.1, 1.25), h: clamp(at.h, COURT.ball, 1.2) };
    return { stroke: ball.stroke, goal, miss, afterBounce: Boolean(best), swung: false };
  }

  /* ---------- the levels' new things, on the child's own ---------- */

  updateExtras(dt) {
    const { plan } = this;
    const { racket } = this.players.A;
    const playing = this.phase === 'serve' || this.phase === 'rally';
    // A power-up's time only runs while the hand is open, so resting never wastes it.
    if (this.power) {
      if (racket.open) this.power.left -= dt;
      if (this.power.left <= 0) {
        const { kind } = this.power;
        this.power = null;
        this.events.onPowerEnd?.(kind);
      }
    }
    if (playing && plan.stars) {
      this.starIn -= dt;
      if (this.starIn <= 0) {
        this.starIn = EXTRAS.starEvery;
        if (!this.items.some(({ kind }) => kind === 'star')) this.addItem('star');
      }
    }
    // The newest power-up comes first, and they take turns after that.
    const powers = [plan.bird && 'bird', plan.bigRacket && 'big'].filter(Boolean);
    if (playing && powers.length && !this.power && !this.items.some(({ kind }) => kind !== 'star')) {
      this.powerIn -= dt;
      if (this.powerIn <= 0) {
        this.powerIn = EXTRAS.powerEvery;
        this.addItem(powers[this.powerTurn % powers.length]);
        this.powerTurn += 1;
      }
    }
    for (const item of this.items) {
      item.age += dt;
      // Stars drift slowly down. Everything bobs a little.
      if (item.kind === 'star') item.baseH = Math.max(0.28, item.baseH - 0.018 * dt);
      item.h = item.baseH + 0.03 * Math.sin(item.age * 1.3 + item.phase);
      // Caught just by the glove coming near, open or closed.
      if (racket.visible && Math.hypot(item.u - racket.u, item.h - racket.h) < EXTRAS.catchReach) this.catchItem(item);
    }
    this.items = this.items.filter((item) => !item.caught && item.age < item.life);
    for (const castle of this.castles) {
      if (!castle.standing && this.time - castle.fellAt > EXTRAS.castleBack) {
        castle.standing = true;
        castle.builtAt = this.time;
        this.events.onCastle?.(castle, 'built');
      }
    }
  }

  addItem(kind) {
    const item = {
      id: this.nextItem,
      kind,
      u: signOf('A') * (0.3 + 0.55 * this.random()),
      baseH: 0.4 + 0.4 * this.random(),
      h: 0,
      age: 0,
      life: kind === 'star' ? EXTRAS.starLife : EXTRAS.starLife + 4,
      phase: this.random() * 6,
      caught: false,
    };
    this.nextItem += 1;
    item.h = item.baseH;
    this.items.push(item);
    this.events.onItem?.(item);
    return item;
  }

  catchItem(item) {
    item.caught = true;
    if (item.kind === 'star') {
      this.prize('star', item);
      return;
    }
    const seconds = item.kind === 'bird' ? EXTRAS.birdSeconds : EXTRAS.powerSeconds;
    this.power = { kind: item.kind, left: seconds, seconds };
    this.events.onPower?.(item.kind, { u: item.u, h: item.h });
  }

  prize(kind, at) {
    this.stats.prizes[kind] += 1;
    this.events.onPrize?.(kind, { u: at.u, h: at.h });
  }

  get prizeTotal() {
    return Object.values(this.stats.prizes).reduce((sum, count) => sum + count, 0);
  }

  /** The child hit it: a flag coloured in, and a prize from a rainbow or golden ball. */
  childHit() {
    const { ball, plan } = this;
    const prize = BALLS[ball.kind]?.prize;
    if (prize) this.prize(prize, ball);
    if (!plan.flags) return;
    this.flagsLit += 1;
    const full = this.flagsLit >= plan.flags;
    this.events.onFlag?.(this.flagsLit, { full });
    if (!full) return;
    this.prize('trophy', { u: 0, h: 0.95 });
    this.flagsLit = 0;
  }

  knockCastle(u) {
    const castle = this.castles.find((each) => each.standing && Math.abs(each.u - u) < EXTRAS.castleReach);
    if (!castle) return;
    castle.standing = false;
    castle.fellAt = this.time;
    this.prize('shell', { u: castle.u, h: 0.18 });
    this.events.onCastle?.(castle, 'fell');
  }

  /** With the bluebird about, a ball that would bounce twice on the child's side is bopped back up to their hand. */
  birdSaves(side) {
    if (!this.extras || side !== 'A' || this.power?.kind !== 'bird') return false;
    const { ball } = this;
    if (ball.by === side) return false;
    const { racket } = this.players.A;
    const to = racket.visible ? { u: racket.u, h: clamp(racket.h, 0.3, 0.8) } : this.waitSpot(side);
    const shot = solveShot({ u: ball.u, h: ball.h }, to, 1.1, this.envFor(ball.kind));
    Object.assign(ball, { vu: shot.vu, vh: shot.vh, rolling: false, bounces: 0 });
    this.stats.saves += 1;
    this.events.onSave?.({ u: ball.u, h: ball.h });
    return true;
  }

  /* ---------- for a friend's game ---------- */

  /** The ball and the score, as small numbers for a friend's game: see cleanBall in server/race-room.js. */
  wire() {
    const { ball } = this;
    return {
      x: round3(ball.u),
      y: round3(ball.h),
      vx: round3(ball.vu),
      vy: round3(ball.vh),
      s: STATES.indexOf(ball.state),
      k: ball.stroke,
      a: this.scores.A,
      b: this.scores.B,
      n: this.rallyHits,
      f: BALL_KINDS.indexOf(ball.kind),
      l: codeOf(ball.by),
      sv: codeOf(this.server),
      g: codeOf(this.winner),
      r: ball.rolling ? 1 : 0,
      w: this.phase === 'over' ? 1 : 0,
    };
  }
}
