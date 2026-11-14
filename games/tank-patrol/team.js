// Tank Patrol together with a friend: two children, each on their own computer with their own camera, each of
// them one of two tanks side by side in the same valley, stopping the robot tanks between them.
//
// The robot tanks have to be the same on both screens, and they go by where the children's tanks are, so one
// game runs them: the game of whoever made the patrol. Ten times a second it tells the friend's game where each
// one is, how many hits it has left and what shells are coming over (wire). The friend's game shows them
// (follow), and drives and fires its own tank just as it would by itself. A shot that reaches a robot tank is a
// hit, decided by the game that fired it, as that's the one its child is looking at. The friend's game shows its
// own hits at once and tells the host's game (a 'tag'), which counts them (friendTagged).
//
// It's the plain patrol, with none of what the levels bring, and with twice the robot tanks, as there are two
// tanks to stop them. Each child has their own hearts, from their own How hard: on Medium and Tough a child whose
// hearts run out has lost, and so has the team, as their game says so to the other in the result it sends at the
// end. On Gentle a child's hearts stop at one, and with both on Gentle nobody can lose, as it always was. The
// host's How hard says how often the shells come and how quickly. Shells come for each tank in turn,
// never for one whose child is resting, and the robot tanks only stop and wait when both children are resting.
// A friend who goes leaves the other to finish by themselves, with half of what was left. If the friend was the
// one running the robot tanks, the game still here takes them over as they are.
//
// What the two tanks share with a battle against each other is in pair.js. There's no screen, sound or camera in
// this file, so it all runs in the unit tests.
import { GUN, KINDS, headingTo, tanksFor } from './patrol.js';
import { Pair, wrap } from './pair.js';
import { START, groundY } from './valley-map.js';

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const round = (value, places) => Math.round(value * 10 ** places) / 10 ** places;
const gapBetween = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
/** How far a value gets to another in a frame, going quickly at first and then settling. */
const nearer = (rate, dt) => 1 - Math.exp(-rate * dt);

// Where each tank starts: side by side at the bottom of the valley, both facing up it, whoever made the patrol
// on the left.
export const TEAM_STARTS = [{ x: START.x - 9, z: START.z, heading: 0 }, { x: START.x + 9, z: START.z, heading: 0 }];
/** How many robot tanks there are to stop between the two: twice the host's number, as there are two tanks. */
export const teamTanks = (tanks) => clamp(Math.round(tanks) || 6, 1, MOST_TANKS / 2) * 2;
const KIND_NAMES = Object.keys(KINDS); // A kind goes to the friend's game as its place in this list.
const MOST_TANKS = 30; // As many robot tanks as a patrol together can have: twice the most a grown-up can choose.
export const MOST_FOES = 16; // Robot tanks and shells told to the friend's game at once: more than there ever are.
export const MOST_SHELLS = 4;
const FOLLOW_RATE = 12; // How quickly a robot tank on the friend's screen gets to where the host's game last had it.
const OWED_SECONDS = 1.2; // A hit of this child's that the host's game hasn't counted by now never got there.
const LANDING_FROM = 0.85; // A shell this far over that the host's game no longer has has landed there, and lands here.
const SHELL_OUT = 0.05; // A shell this far from where the host's game has it is put where that says.
const TAGS_AT_ONCE = 3; // More hits at once than this from the friend's game are a mistake.
const TURN_NEARER = 0.75; // A robot tank changes which child's tank it goes by when the other is this much nearer.
const AFTER_REST_SECONDS = 2.5; // No shell for a child for this long after they've stopped resting, as on a patrol.
const AIM_WITHIN = 0.45; // The friend's gun is firing at a robot tank its turret points this near.
// Side by side, going for the same robot tanks, the two are often next to each other: far enough apart that one is
// never drawn over the other, whichever way each faces.
export const TEAM_CLEAR = 10;

export class TeamPatrol extends Pair {
  /**
   * slot is this child's place, 0 for whoever made the patrol and 1 for their friend. runs says whether this
   * game runs the robot tanks, which is the host's. tanks and pace are the host's number of robot tanks and
   * speed. help, driving and level, how hard it is, are this child's own.
   */
  constructor({ slot = 0, runs = true, tanks = 6, pace = 'slow', level = 'medium', help = 'little', driving = 'closed', random = Math.random, onEvent = () => {} } = {}) {
    // Level 1: nothing a level brings. A game that doesn't run the robot tanks has none of its own: they come from
    // the host's game.
    super({ slot, starts: TEAM_STARTS, tanks: runs ? teamTanks(tanks) : 0, pace, level, levelNumber: 1, help, driving, random, onEvent });
    this.runs = Boolean(runs);
    this.clear = TEAM_CLEAR;
    this.total = teamTanks(tanks);
    this.line = tanksFor(this.total); // Which tanks come, in order, in case this game has to take them over.
    // A shell for each tank in turn, so each child has one as often as on a patrol by themselves.
    this.plan = { ...this.plan, lobEvery: 0.5 };
    this.lobTurn = 0; // Whose tank the next shell is for: 0 for whoever made the patrol, 1 for their friend.
    this.stoppedBy = { mine: 0, theirs: 0 };
    this.tagged = new Map(); // The host's game: how many of the friend's hits on each robot tank have been counted.
    this.tags = new Map(); // The friend's game: how many hits this child has made on each robot tank.
    this.mirrored = new Map(); // The friend's game: the host's robot tanks, by their number.
    this.over = new Set(); // The friend's game: shells that have landed or fizzled here, so they don't come again.
    this.hostPaused = false;
  }

  /** Whether the friend's tank is still here. */
  get together() {
    return this.friend?.state === 'rolling';
  }

  /* ---------- two tanks for the robot tanks to go by ---------- */

  get mostOut() {
    return super.mostOut + (this.friend?.state === 'gone' ? 0 : 1);
  }

  get inAir() {
    return super.inAir + (this.together ? 1 : 0);
  }

  /**
   * The child's tank a robot tank goes by: the nearer, sticking with the one it has unless the other is clearly
   * nearer, and not one whose child is resting while the other is playing.
   */
  tankFor(enemy) {
    const { tank, friend } = this;
    if (!this.together) return tank;
    if (friend.resting !== this.resting) return this.resting ? friend : tank;
    const mine = gapBetween(enemy, tank);
    const theirs = gapBetween(enemy, friend);
    enemy.after ??= theirs < mine ? 'friend' : 'mine';
    if (enemy.after === 'friend' && mine < theirs * TURN_NEARER) enemy.after = 'mine';
    else if (enemy.after === 'mine' && theirs < mine * TURN_NEARER) enemy.after = 'friend';
    return enemy.after === 'friend' ? friend : tank;
  }

  get childTanks() {
    return this.together ? [this.tank, this.friend] : [this.tank];
  }

  /** The robot tanks wait when both children are resting, and not while either is playing. */
  get paused() {
    if (!this.runs) return this.hostPaused;
    return this.resting && (!this.together || this.friend.resting);
  }

  /* ---------- shells, for each tank in turn ---------- */

  /**
   * Whether a shell can set off for a tank: not while its child is resting, or this child's hand has gone, and
   * not with one on its way to it already, so there's only ever one to get out from under.
   */
  canLobAt(tank) {
    if (this.shells.some(({ target }) => target === tank)) return false;
    return tank === this.tank ? this.goneFor === 0 && !this.resting : !tank.resting;
  }

  lobTarget() {
    if (!this.together) return super.lobTarget();
    const next = this.lobTurn === this.slot ? this.tank : this.friend;
    return this.canLobAt(next) ? next : null;
  }

  lobbing(dt) {
    if (!this.runs) return;
    // A turn that can't be taken passes to the other child, after as long again, so nobody has more shells
    // because their friend is resting.
    if (this.together && this.lobIn - dt <= 0 && !this.lobTarget()) {
      this.lobIn = this.lobGap();
      this.lobTurn = 1 - this.lobTurn;
      return;
    }
    super.lobbing(dt);
  }

  lob(enemy, landing, seconds, first, second = false, target = this.tank) {
    super.lob(enemy, landing, seconds, first, second, target);
    this.lobTurn = target === this.friend ? this.slot : 1 - this.slot;
  }

  /**
   * A shell lands on this child's tank if it's under it, but never while they're resting, and one that was for
   * the friend's tank only if there's a hand to have driven out of its way.
   */
  struckBy(shell) {
    if (!super.struckBy(shell) || this.resting) return false;
    return shell.target === this.tank || this.goneFor === 0;
  }

  moveShells(dt) {
    const before = this.shells;
    super.moveShells(dt);
    this.noteOver(before);
  }

  fizzleShells(of = null) {
    const before = this.shells;
    super.fizzleShells(of);
    this.noteOver(before);
  }

  /** In the friend's game, a shell that's landed or fizzled here doesn't come again from the host's game. */
  noteOver(before) {
    if (this.runs || !this.over) return;
    for (const shell of before) if (!this.shells.includes(shell)) this.over.add(shell.id);
  }

  /* ---------- the friend's tank ---------- */

  /** The friend's tank, where their game says. A shell on its way to it goes when their child starts resting. */
  placeFriend(at, dt = 0) {
    const { friend } = this;
    const was = friend.resting;
    const fired = super.placeFriend(at, dt);
    if (this.runs && friend.resting !== was) {
      if (friend.resting) this.fizzleShells(friend);
      else this.lobIn = Math.max(this.lobIn, AFTER_REST_SECONDS);
    }
    return fired;
  }

  /**
   * What the friend's gun seems to be firing at, for showing their shots: the robot tank within its reach that
   * their turret points at most nearly, or a place out along the turret.
   */
  friendAim() {
    const { friend } = this;
    let best = null;
    let bestOff = AIM_WITHIN;
    for (const enemy of this.rolling) {
      if (gapBetween(friend, enemy) > GUN.range + enemy.size) continue;
      const off = Math.abs(wrap(headingTo(enemy.x - friend.x, enemy.z - friend.z) - friend.turret));
      if (off < bestOff) {
        best = enemy;
        bestOff = off;
      }
    }
    if (best) return best;
    const far = GUN.range * 0.7;
    const x = friend.x + Math.sin(friend.turret) * far;
    const z = friend.z - Math.cos(friend.turret) * far;
    return { x, z, y: groundY(x, z) };
  }

  /**
   * The friend has gone. Their tank goes with them, and what's left is for one tank: half of it, though never
   * fewer than are about already. If theirs was the game running the robot tanks, this one takes them over.
   */
  friendGone() {
    if (this.friend.state === 'gone') return;
    super.friendGone();
    this.fizzleShells(this.friend);
    this.plan = { ...this.plan, lobEvery: 1 };
    if (!['ready', 'playing'].includes(this.state) || this.endIn !== null) return;
    const took = !this.runs;
    if (took) {
      // This game runs the robot tanks from here, as they are.
      this.runs = true;
      this.mirrored.clear();
      this.over.clear();
      this.tags.clear();
      for (const enemy of this.rolling) {
        Object.assign(enemy, { goal: null, flow: null });
        // One this child had just stopped, which the host's game hadn't said so yet.
        if (enemy.hp <= 0) this.stop(enemy);
      }
      if (this.endIn !== null) return;
    }
    const out = this.rolling.length;
    const left = Math.max(out, Math.ceil(this.left / 2));
    this.total = this.stats.stopped + left;
    // The last of those still to come, so that the big one still comes last.
    const line = took ? this.line : this.queue;
    const more = Math.min(line.length, left - out);
    this.queue = line.slice(line.length - more);
  }

  /* ---------- hits, on both screens ---------- */

  /** What the gun can fire at: not a robot tank this child has just stopped, before the host's game has said so. */
  get targets() {
    return super.targets.filter(({ hp }) => hp > 0);
  }

  /**
   * In the friend's game, a shot of this child's that reaches a robot tank is a hit, shown at once. The host's game
   * is told how many this child has made on that tank so far, and counts them: see friendTagged.
   */
  hit(target, shot = {}, born = []) {
    if (this.runs) {
      super.hit(target, shot, born);
      return;
    }
    if (target.state !== 'rolling' || !(target.hp > 0)) return;
    target.hp -= 1;
    target.tagAt = this.time;
    // With its last hit made, the gun lets go of it, and waits for the host's game to say it's stopped.
    if (target.hp <= 0 && this.locked === target) this.locked = null;
    this.stats.hits += 1;
    const hits = (this.tags.get(target.id) ?? 0) + 1;
    this.tags.set(target.id, hits);
    this.emit('hit', { enemy: target, kind: shot.kind, friend: false });
    this.emit('tag', { id: target.id, hits });
  }

  /**
   * The host's game hears that the friend has hit robot tank id this many times in all. Each one not counted yet
   * is a hit on it, the friend's, and it can stop it.
   */
  friendTagged(id, total) {
    if (!this.runs || this.state !== 'playing') return;
    const had = this.tagged.get(id) ?? 0;
    const fresh = Math.round(total) - had;
    if (!(fresh > 0)) return;
    this.tagged.set(id, had + fresh);
    const enemy = this.enemies.find((each) => each.id === id);
    if (!enemy) return;
    for (let i = 0; i < Math.min(fresh, TAGS_AT_ONCE); i += 1) this.hit(enemy, { kind: 'ball', friend: true, origin: this.friend });
  }

  /** Whose shot stopped it is counted by the game that runs the robot tanks, for both. */
  stop(enemy, shot = {}) {
    const before = this.stats.stopped;
    super.stop(enemy, shot);
    if (this.runs && this.stats.stopped > before) this.stoppedBy[shot.friend ? 'theirs' : 'mine'] += 1;
  }

  /* ---------- the robot tanks, from the host's game to the friend's ---------- */

  /**
   * What the host's game tells the friend's, as rows of numbers: each robot tank still rolling as [id, kind, x, z,
   * heading, turret, hits left, hits at first, speed], each shell as [id, from x, from z, to x, to z, how far over,
   * seconds, whose tank it's for, which robot tank lobbed it], and n: how many are stopped, of how many, how many
   * each child stopped, whoever made the patrol first, whether the robot tanks are waiting, and whether it's won.
   */
  wire() {
    const { slot, friend, stoppedBy } = this;
    const e = this.rolling.slice(0, MOST_FOES).map((enemy) => [
      enemy.id,
      KIND_NAMES.indexOf(enemy.kind),
      round(enemy.x, 2),
      round(enemy.z, 2),
      round(wrap(enemy.heading), 3),
      round(wrap(enemy.turret), 3),
      Math.max(0, enemy.hp),
      enemy.maxHp,
      round(enemy.speed, 1),
    ]);
    const s = this.shells.slice(0, MOST_SHELLS).map((shell) => [
      shell.id,
      round(shell.from.x, 2),
      round(shell.from.z, 2),
      round(shell.to.x, 2),
      round(shell.to.z, 2),
      round(clamp(shell.share, 0, 1), 3),
      round(shell.seconds, 2),
      shell.target === friend ? 1 - slot : slot,
      shell.by ?? 0,
    ]);
    const by = slot === 0 ? [stoppedBy.mine, stoppedBy.theirs] : [stoppedBy.theirs, stoppedBy.mine];
    return { e, s, n: [this.stats.stopped, this.total, ...by, this.paused ? 1 : 0, this.ending === 'won' ? 1 : 0] };
  }

  /**
   * The friend's game hears where the host's robot tanks and shells are, and how it's going. It comes from another
   * computer, so nothing in it is taken on trust: anything that isn't a row of numbers is passed over.
   */
  follow(wire) {
    if (this.runs || !['ready', 'playing'].includes(this.state) || this.endIn !== null) return;
    const { e, s, n } = wire ?? {};
    const rows = (list) => (Array.isArray(list) ? list.filter((row) => Array.isArray(row) && row.length >= 9 && row.every(Number.isFinite)) : []);
    const [stopped = 0, total = 0, byHost = 0, byFriend = 0, paused = 0, won = 0] = Array.isArray(n) ? n.map((value) => (Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0)) : [];
    this.hostPaused = Boolean(paused);
    if (total > 0) this.total = Math.min(total, MOST_TANKS);
    this.followFoes(rows(e));
    this.followShells(rows(s));
    this.stats.stopped = Math.max(this.stats.stopped, Math.min(stopped, this.total));
    this.stoppedBy = this.slot === 0 ? { mine: byHost, theirs: byFriend } : { mine: byFriend, theirs: byHost };
    if (this.state === 'playing' && (won || this.left <= 0)) this.allStopped();
  }

  followFoes(rows) {
    const seen = new Set();
    for (const row of rows) {
      const [id, kind, h, a] = [row[0], row[1], row[4], row[5]];
      // Kept to the valley, and to as many hits as a robot tank could have.
      const [x, z] = [clamp(row[2], -60, 60), clamp(row[3], -50, 40)];
      const max = clamp(Math.round(row[7]), 1, 99);
      const hp = clamp(Math.round(row[6]), 0, max);
      seen.add(id);
      let enemy = this.mirrored.get(id);
      if (!enemy) {
        enemy = this.makeEnemy(KIND_NAMES[kind] ?? KIND_NAMES[0], { x, z });
        Object.assign(enemy, { id, heading: h, turret: a, hp, maxHp: max });
        this.mirrored.set(id, enemy);
        this.enemies.push(enemy);
        this.emit('spawn', { enemy });
      }
      enemy.at = { x, z, h, a };
      enemy.speed = clamp(row[8], 0, 30);
      if (hp < enemy.hp) {
        // The friend's hit, which shows here as it's counted there.
        enemy.hp = hp;
        this.emit('hit', { enemy, kind: 'ball', friend: true });
      } else if (hp > enemy.hp && this.time - (enemy.tagAt ?? -Infinity) > OWED_SECONDS) {
        enemy.hp = hp;
      }
    }
    // One the host's game no longer has rolling has been stopped, by whichever of the two.
    for (const [id, enemy] of this.mirrored) {
      if (seen.has(id)) continue;
      this.mirrored.delete(id);
      if (enemy.state !== 'rolling') continue;
      const mine = enemy.hp <= 0;
      enemy.hp = 0;
      this.stop(enemy, { friend: !mine });
    }
  }

  followShells(rows) {
    const flying = new Set();
    for (const row of rows) {
      const [id, fromX, fromZ, toX, toZ, share, seconds, slot, by] = row;
      flying.add(id);
      if (this.over.has(id)) continue;
      const shell = this.shells.find((each) => each.id === id);
      if (shell) {
        if (Math.abs(share - shell.share) > SHELL_OUT) shell.share = share;
        continue;
      }
      if (!(share >= 0 && share < 1) || !(seconds >= 1 && seconds <= 30)) continue;
      const target = slot === this.slot ? this.tank : this.friend;
      // One that set off for this child's tank just as they began to rest, before the host's game had heard.
      if (target === this.tank && this.resting) {
        this.over.add(id);
        continue;
      }
      const fresh = { id, share, seconds, blast: this.level.blast, from: { x: fromX, y: groundY(fromX, fromZ) + 4, z: fromZ }, to: { x: toX, y: groundY(toX, toZ), z: toZ }, target, by };
      this.shells.push(fresh);
      this.emit('lob', { enemy: this.mirrored.get(by) ?? null, shell: fresh, first: !this.firstLobbed, second: false });
      this.firstLobbed = true;
    }
    // One the host's game has taken away before it came down has fizzled there, as when a rest begins.
    const fizzled = this.shells.filter(({ id, share }) => !flying.has(id) && share < LANDING_FROM);
    for (const shell of fizzled) this.emit('fizzle', { shell });
    this.shells = this.shells.filter((shell) => !fizzled.includes(shell));
    for (const id of this.over) if (!flying.has(id)) this.over.delete(id);
  }

  /** In the friend's game, the robot tanks go smoothly to where the host's game last had them. */
  moveEnemies(dt, moving) {
    if (this.runs || !['ready', 'playing'].includes(this.state)) {
      super.moveEnemies(dt, moving);
      return;
    }
    const share = nearer(FOLLOW_RATE, dt);
    for (const enemy of this.enemies) {
      enemy.hitLeft = Math.max(0, enemy.hitLeft - dt);
      if (enemy.state !== 'rolling') {
        this.settleEnemy(enemy, dt);
        continue;
      }
      const { at } = enemy;
      if (!at) continue;
      enemy.x += (at.x - enemy.x) * share;
      enemy.z += (at.z - enemy.z) * share;
      enemy.y = groundY(enemy.x, enemy.z);
      const turned = wrap(at.h - enemy.heading) * share;
      enemy.heading += turned;
      enemy.turnRate = dt > 0 ? turned / dt : 0;
      enemy.turret += wrap(at.a - enemy.turret) * share;
    }
    this.enemies = this.enemies.filter(({ state }) => state !== 'gone');
  }
}
