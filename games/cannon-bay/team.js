// Cannon Bay together with a friend: two children, each on their own computer with their own camera, each
// sailing one of two ships side by side against the pirates.
//
// The pirates have to be the same on both screens, and they go by where the children's ships are, so one game
// runs them: the game of whoever made the battle. About ten times a second it tells the friend's game where
// each pirate ship is, how many hits it has left and what cannonballs are in the air (wire). The friend's game
// shows them (follow), and sails and fires its own ship just as it would by itself. A ball that reaches a
// pirate ship is a hit, decided by the game that fired it, as that's the one its child is looking at. The
// friend's game shows its own hits at once and tells the host's game (a 'tag'), which counts them
// (friendTagged). Each game decides whether a pirate's ball lands on its own child's ship.
//
// It's the plain battle, with none of what the levels bring. Each child keeps their own firing zones, help with
// lining up and hearts, from their own How hard, and the host's How hard says how often the pirates fire and how
// many of their balls are aimed true. On Medium and Tough a child whose hearts run out is sunk, and so is the team,
// as their game says so to the other in the result it sends at the end. On Gentle hearts stop at one, so with both
// on Gentle nobody can be sunk, as it always was. There are as many pirate ships as the
// host chose, each taking twice the hits, as there are two ships firing at it, with one more about at a time.
// Every other pirate goes for the friend's ship, and none goes for a child who's resting while the other sails
// on: the pirates only sail in circles and wait when both children are resting. A friend who goes leaves the
// other to finish by themselves, with half the hits still to make. If theirs was the game running the pirates,
// the game still here takes them over as they are.
//
// There's no screen, camera or sound in this file, so it all runs in the unit tests.
import { Battle, GUN_HEIGHT, LEVELS, SHIP_KINDS, VIEW_KEPT_CLEAR, forwardOf } from './battle.js';
import { duelStart } from './duel.js';

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const round = (value, places) => Math.round(value * 10 ** places) / 10 ** places;
/** The same way round, from -π to π, however many times a ship has gone round. */
const wrapped = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
/** How far a value gets to another in a frame, going quickly at first and then settling. */
const nearer = (rate, dt) => 1 - Math.exp(-rate * dt);

export const TEAM_HITS = 2; // Each pirate ship takes this many times the hits, as there are two ships firing at it.
const KIND_NAMES = Object.keys(SHIP_KINDS); // A kind goes to the friend's game as its place in this list.
export const MOST_PIRATES = 12; // Pirate ships and cannonballs told to the friend's game at once: more than there ever are.
export const MOST_BALLS = 14;
const MOST_SHIPS = 9; // As many pirate ships as a battle can have: the most a grown-up can choose.
const FOLLOW_RATE = 10; // How quickly a pirate ship on the friend's screen gets to where the host's game last had it.
const OWED_SECONDS = 1.2; // A hit of this child's that the host's game hasn't counted by now never got there.
const BALL_OUT = 0.08; // A ball this far from where the host's game has it is put where that says.
const TAGS_AT_ONCE = 4; // More hits at once than this from the friend's game are a mistake.
const HIT_WOBBLE = 0.35; // How long a pirate ship wobbles for a hit, as in battle.js.
const HIT_HEIGHT = 6.5; // How high up a pirate ship a hit shows, when it's the friend's.
const MOST_FIRED_AT_ONCE = 3; // The friend's balls shown at once, after a moment with nothing coming through.
// A pirate ship the host's game has brought round from far away, as it does one that's got stuck or left behind,
// is put where it is now on the friend's screen too, rather than sliding across the sea.
const JUMPED = 120;

export class TeamBattle extends Battle {
  /**
   * slot is this child's place, 0 for whoever made the battle and 1 for their friend. runs says whether this
   * game runs the pirates, which is the host's. ships and pace are the host's number of pirate ships and speed,
   * so that the pirates can keep up with both. level and cannons are this child's own.
   */
  constructor({ slot = 0, runs = true, ships = 6, pace = 'slow', level = 'medium', cannons = 'open', random = Math.random, onEvent = () => {} } = {}) {
    const mine = slot === 1 ? 1 : 0;
    // Level 1: nothing a level brings. A game that doesn't run the pirates has none of its own: they come from
    // the host's game.
    super({ ships: runs ? ships : 0, pace, level, levelNumber: 1, cannons, start: duelStart(mine), random, onEvent });
    this.slot = mine;
    this.runs = Boolean(runs);
    this.total = ships;
    this.addFriend(duelStart(1 - mine), { ally: true });
    // After the pirates, for the ship that's drawn for it: see makeBattle in main.js.
    this.friend.index = ships;
    this.beatenBy = { mine: 0, theirs: 0 };
    this.tagged = new Map(); // The host's game: how many of the friend's hits on each pirate ship have been counted.
    this.tags = new Map(); // The friend's game: how many hits this child has made on each pirate ship.
    this.mirrored = new Map(); // The friend's game: the host's pirate ships, by their number.
    this.over = new Set(); // The friend's game: cannonballs that have landed here, so they don't come again.
    this.hostPaused = false;
    this.seenFired = null; // How many balls the friend's ship had fired, as last shown.
  }

  /** Whether the friend's ship is still here. */
  get together() {
    return Boolean(this.friend);
  }

  /**
   * Each child's own firing zones, help with lining up and hearts, from their own How hard. The pirate ships take
   * as many hits as on Gentle, twice over while there are two ships firing at them.
   */
  setLevel(level) {
    super.setLevel(level);
    this.levelName = level;
    const { shipHits } = LEVELS.gentle;
    this.level = { ...this.level, shipHits: shipHits * (this.alone ? 1 : TEAM_HITS) };
  }

  /* ---------- two ships for the pirates to go for ---------- */

  get mostAtOnce() {
    return super.mostAtOnce + (this.friend ? 1 : 0);
  }

  /**
   * The ship a pirate is after: every other one goes for the friend's, and none for a child who's resting while
   * the other sails on.
   */
  preyOf(pirate) {
    const { friend } = this;
    if (!friend) return this;
    let mine = pirate.index % 2 === this.slot;
    if (friend.resting !== this.resting) mine = !this.resting;
    return mine ? this : friend;
  }

  /**
   * Nobody sails into the place either child is watching from, behind their ship. The game that runs the pirates
   * keeps them out of the friend's as well as its own child's, so they're in the same place on both screens.
   */
  keepApart() {
    super.keepApart();
    const { friend } = this;
    if (!this.runs || !friend) return;
    const back = forwardOf(friend.heading);
    const viewX = friend.x - back.x * VIEW_KEPT_CLEAR.behind;
    const viewZ = friend.z - back.z * VIEW_KEPT_CLEAR.behind;
    for (const pirate of this.pirates) {
      if (pirate.friend || pirate.state === 'gone') continue;
      const fromView = Math.hypot(pirate.x - viewX, pirate.z - viewZ) || 1;
      if (fromView >= VIEW_KEPT_CLEAR.radius) continue;
      const push = VIEW_KEPT_CLEAR.radius - fromView;
      pirate.x += ((pirate.x - viewX) / fromView) * push;
      pirate.z += ((pirate.z - viewZ) / fromView) * push;
    }
  }

  /** The pirates wait, sailing in circles, when both children are resting, and not while either sails on. */
  get paused() {
    if (!this.runs) return this.hostPaused;
    return this.resting && (!this.friend || this.friend.resting);
  }

  /** How many balls the friend's ship has fired since it was last shown, from what their game says. */
  newlyFired(fired) {
    if (this.seenFired === null || fired < this.seenFired) this.seenFired = fired;
    const count = Math.min(MOST_FIRED_AT_ONCE, fired - this.seenFired);
    this.seenFired = fired;
    return count;
  }

  /**
   * The friend has gone. Their ship goes with them, and what's left is for one ship: the pirates afloat have half
   * their hits still to take, and those to come take the usual number. If theirs was the game running the pirates,
   * this one takes them over as they are.
   */
  friendGone() {
    if (!this.friend) return;
    this.removeFriend();
    this.alone = true;
    this.setLevel(this.levelName);
    if (!['ready', 'sailing'].includes(this.state)) return;
    if (!this.runs) {
      this.runs = true;
      this.mirrored.clear();
      this.over.clear();
      this.tags.clear();
      // One this child had just beaten, which the host's game hadn't said so yet.
      for (const pirate of this.afloat) if (pirate.hitsLeft <= 0) this.beat(pirate);
      this.roles = this.planRoles();
      this.waiting = Math.max(0, this.total - this.stats.beaten - this.afloat.length);
      if (this.state === 'sailing') this.fill();
    }
    for (const pirate of this.afloat) {
      pirate.hitsLeft = Math.max(1, Math.ceil(pirate.hitsLeft / 2));
      pirate.maxHits = Math.max(pirate.hitsLeft, Math.round(pirate.maxHits / 2));
    }
  }

  /* ---------- hits, on both screens ---------- */

  /** What the cannons can fire at: not a pirate ship this child has just beaten, before the host's game has said so. */
  canTarget(pirate) {
    return super.canTarget(pirate) && pirate.hitsLeft > 0;
  }

  /**
   * In the friend's game, a ball of this child's that reaches a pirate ship is a hit, shown at once. The host's
   * game is told how many this child has made on that ship so far, and counts them: see friendTagged.
   */
  hit(pirate, shot) {
    if (this.runs || pirate.friend) {
      super.hit(pirate, shot);
      return;
    }
    if (pirate.state !== 'sailing' || !(pirate.hitsLeft > 0)) return;
    pirate.hitsLeft -= 1;
    pirate.hitLeft = HIT_WOBBLE;
    pirate.tagAt = this.time;
    this.stats.hits += 1;
    const hits = (this.tags.get(pirate.index) ?? 0) + 1;
    this.tags.set(pirate.index, hits);
    this.emit('hit', { pirate, x: shot.x, y: shot.y, z: shot.z, fire: null, theirs: false });
    this.emit('tag', { id: pirate.index, hits });
  }

  /**
   * The host's game hears that the friend has hit pirate ship index this many times in all. Each one not counted
   * yet is a hit on it, the friend's, and it can beat it.
   */
  friendTagged(index, total) {
    if (!this.runs || this.state !== 'sailing') return;
    const had = this.tagged.get(index) ?? 0;
    const fresh = Math.round(total) - had;
    if (!(fresh > 0)) return;
    this.tagged.set(index, had + fresh);
    const pirate = this.pirates.find((each) => each.index === index && !each.friend && !each.little);
    if (!pirate) return;
    for (let i = 0; i < Math.min(fresh, TAGS_AT_ONCE) && pirate.state === 'sailing'; i += 1) {
      this.hit(pirate, { x: pirate.x, y: HIT_HEIGHT, z: pirate.z, fire: null, theirs: true });
    }
  }

  /** Whose ball beat it is counted by the game that runs the pirates, for both. */
  beat(pirate, shot = {}) {
    const before = this.stats.beaten;
    super.beat(pirate, shot);
    if (this.runs && this.stats.beaten > before) this.beatenBy[shot.theirs ? 'theirs' : 'mine'] += 1;
  }

  /** In the friend's game, a pirate's cannonball that has landed here doesn't come again from the host's game. */
  landBall(ball) {
    super.landBall(ball);
    if (!this.runs && ball.id !== undefined) this.over.add(ball.id);
  }

  /* ---------- the pirates, from the host's game to the friend's ---------- */

  /**
   * What the host's game tells the friend's, as rows of numbers: each pirate ship afloat as [number, kind, x, z,
   * heading, speed, hits left, hits at first, which side it fires from], each of their cannonballs as [number,
   * from x, from z, to x, to z, how far over, seconds, how high it arcs, whose ship it's for, which pirate fired
   * it], and n: how many are beaten, of how many, how many each child beat, whoever made the battle first,
   * whether the pirates are waiting, and whether it's won.
   */
  wire() {
    const { slot, friend, beatenBy } = this;
    const e = this.afloat
      .filter((pirate) => !pirate.friend)
      .slice(0, MOST_PIRATES)
      .map((pirate) => [
        pirate.index,
        KIND_NAMES.indexOf(pirate.kind),
        round(pirate.x, 1),
        round(pirate.z, 1),
        round(wrapped(pirate.heading), 3),
        round(pirate.speed, 1),
        Math.max(0, pirate.hitsLeft),
        pirate.maxHits,
        pirate.burstSide >= 0 ? 1 : -1,
      ]);
    const s = this.balls
      .filter((ball) => !ball.homing)
      .slice(-MOST_BALLS)
      .map((ball) => [
        ball.id,
        round(ball.from.x, 1),
        round(ball.from.z, 1),
        round(ball.to.x, 1),
        round(ball.to.z, 1),
        round(clamp(ball.t, 0, 1), 3),
        round(ball.seconds, 2),
        round(ball.arc, 1),
        ball.prey === friend && friend ? 1 - slot : slot,
        ball.pirate.index,
      ]);
    const by = slot === 0 ? [beatenBy.mine, beatenBy.theirs] : [beatenBy.theirs, beatenBy.mine];
    return { e, s, n: [this.stats.beaten, this.total, ...by, this.paused ? 1 : 0, this.wonIn !== null || this.state === 'won' ? 1 : 0] };
  }

  /**
   * The friend's game hears where the host's pirate ships and their cannonballs are, and how it's going. It comes
   * from another computer, so nothing in it is taken on trust: anything that isn't a row of numbers is passed over.
   */
  follow(wire) {
    if (this.runs || this.state !== 'sailing') return;
    const { e, s, n } = wire ?? {};
    const rows = (list, length) => (Array.isArray(list) ? list.filter((row) => Array.isArray(row) && row.length >= length && row.every(Number.isFinite)) : []);
    const [beaten = 0, total = 0, byHost = 0, byFriend = 0, paused = 0, won = 0] = Array.isArray(n) ? n.map((value) => (Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0)) : [];
    this.hostPaused = Boolean(paused);
    if (total > 0) this.total = Math.min(total, MOST_SHIPS);
    this.followPirates(rows(e, 9));
    this.followBalls(rows(s, 10));
    this.stats.beaten = Math.max(this.stats.beaten, Math.min(beaten, this.total));
    this.beatenBy = this.slot === 0 ? { mine: byHost, theirs: byFriend } : { mine: byFriend, theirs: byHost };
    if (won || this.left <= 0) this.allBeaten();
  }

  followPirates(rows) {
    const seen = new Set();
    for (const row of rows) {
      const [index, kind, x, z, h, speed] = row;
      if (!Number.isInteger(index) || index < 0 || index >= MOST_SHIPS) continue;
      // As many hits as a pirate ship could have.
      const max = clamp(Math.round(row[7]), 1, 999);
      const left = clamp(Math.round(row[6]), 0, max);
      seen.add(index);
      let pirate = this.mirrored.get(index);
      if (!pirate) {
        pirate = this.makePirate(KIND_NAMES[kind] ?? KIND_NAMES[0], x, z, index);
        Object.assign(pirate, { heading: h, speed: clamp(speed, 0, 100), maxHits: max, hitsLeft: left });
        this.mirrored.set(index, pirate);
        this.pirates.push(pirate);
        this.nextPirate = Math.max(this.nextPirate, index + 1);
        this.emit('spawn', { pirate });
      }
      pirate.at = { x, z, h, speed: clamp(speed, 0, 100) };
      pirate.maxHits = max;
      if (Math.hypot(x - pirate.x, z - pirate.z) > JUMPED) Object.assign(pirate, { x, z, heading: h });
      pirate.burstSide = row[8] >= 0 ? 1 : -1;
      if (left < pirate.hitsLeft) {
        // The friend's hit, which shows here as it's counted there.
        pirate.hitsLeft = left;
        pirate.hitLeft = HIT_WOBBLE;
        this.emit('hit', { pirate, x: pirate.x, y: HIT_HEIGHT, z: pirate.z, fire: null, theirs: true });
      } else if (left > pirate.hitsLeft && this.time - (pirate.tagAt ?? -Infinity) > OWED_SECONDS) {
        pirate.hitsLeft = left;
      }
    }
    // One the host's game no longer has afloat has been beaten, by whichever of the two.
    for (const [index, pirate] of this.mirrored) {
      if (seen.has(index)) continue;
      this.mirrored.delete(index);
      if (pirate.state !== 'sailing') continue;
      const mine = pirate.hitsLeft <= 0;
      pirate.hitsLeft = 0;
      this.beat(pirate, { theirs: !mine });
    }
  }

  followBalls(rows) {
    const flying = new Set();
    for (const row of rows) {
      const [id, fromX, fromZ, toX, toZ, t, seconds, arc, slot, index] = row;
      flying.add(id);
      if (this.over.has(id)) continue;
      const ball = this.balls.find((each) => each.id === id);
      if (ball) {
        if (Math.abs(t - ball.t) > BALL_OUT) ball.t = t;
        continue;
      }
      if (!(t >= 0 && t < 1) || !(seconds >= 0.2 && seconds <= 10)) continue;
      // Fired from where its pirate ship is on this screen, or from where the host's game says, if it's not here.
      const pirate = this.mirrored.get(index) ?? { index, x: fromX, z: fromZ, heading: 0, burstSide: 1 };
      const fresh = { id, from: { x: fromX, y: GUN_HEIGHT, z: fromZ }, to: { x: toX, z: toZ }, t, seconds, arc: clamp(arc, 0, 200), x: fromX, y: GUN_HEIGHT, z: fromZ, harmless: this.resting, pirate, prey: slot === this.slot ? this : this.friend };
      this.balls.push(fresh);
      this.emit('pirate-fire', { pirate, ball: fresh });
    }
    for (const id of this.over) if (!flying.has(id)) this.over.delete(id);
  }

  /** In the friend's game, the pirate ships go smoothly to where the host's game last had them. */
  movePirate(pirate, dt) {
    if (this.runs || pirate.friend || pirate.state !== 'sailing' || this.state !== 'sailing') {
      super.movePirate(pirate, dt);
      return;
    }
    pirate.hitLeft = Math.max(0, pirate.hitLeft - dt);
    const { at } = pirate;
    if (!at) return;
    // Between what it's told, a pirate ship carries on the way it was going, so that a fast one doesn't fall behind.
    const forward = forwardOf(at.h);
    at.x += forward.x * at.speed * dt;
    at.z += forward.z * at.speed * dt;
    const share = nearer(FOLLOW_RATE, dt);
    pirate.x += (at.x - pirate.x) * share;
    pirate.z += (at.z - pirate.z) * share;
    const turned = wrapped(at.h - pirate.heading) * share;
    pirate.heading += turned;
    // How hard it's turning, for how far it leans, as a share of the hardest a pirate ship turns.
    if (dt > 0) pirate.turning += (clamp(turned / (0.52 * dt), -1, 1) - pirate.turning) * nearer(3, dt);
    pirate.speed += (at.speed - pirate.speed) * share;
  }
}
