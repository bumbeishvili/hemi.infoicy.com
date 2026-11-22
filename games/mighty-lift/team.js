// Lifting with friends, each on their own computer: what a game tells the others about its child, and what it
// makes of what they tell it. Only numbers go between them: how far up an arm is, as a share of the way to that
// child's own line, and how their lifter stands. No screen or camera in this file, so it runs in the unit tests
// with the server's own rules (server/race-room.js).
//
// Together, everyone lifts one big weight: it goes as high as all their arms between them, and the friend under
// it gets out as fast as the share of arms that are up, so a child on their own still frees them. A rescue is
// over on every computer once it is on one: each game claims it from the server as it's done there. Against each
// other, each child frees their own friends, and the game is over for everyone when one of them has freed all of
// theirs: the most freed is first, and equal counts share a place.
import { Track } from '../../core/friends.js';
import { ARRIVE_SECONDS, FALL_RATE, LIGHT_RISE, LOWERED, MOST_LIFT, REST_SECONDS } from './lift.js';

// Each friend's arm as their game sends it, 10 times a second, shown a moment behind so that it moves smoothly.
const ARM_TRACK = { lerp: ['u'], steps: ['a', 'n', 'f', 'r'] };
const BODY_TRACK = { lists: ['p'] };
const MOST_SENT = 2; // An arm's lift is sent as no more than this.

/** What a game tells its friends about its child's arm: only numbers. lift is how far up it is. */
export function armMessage(lifting, lift) {
  return {
    u: Math.round(Math.min(MOST_SENT, Math.max(0, lift || 0)) * 100) / 100,
    a: lifting.armUp ? 1 : 0,
    n: lifting.stats.lifts,
    f: lifting.stats.freed,
    r: lifting.resting ? 1 : 0,
  };
}

/** One friend, as this game knows them: their arm, their body, and how they're doing. */
export class Mate {
  constructor(friend) {
    this.friend = friend;
    this.arm = new Track(ARM_TRACK);
    this.body = new Track(BODY_TRACK);
    this.freed = 0;
    this.lifts = 0;
    this.resting = false;
    this.gone = false;
  }

  /** A message from their game, heard at this moment. Returns whether what's on the scoreboard changed. */
  hear(message, now) {
    if (message.t === 'pose') {
      this.body.push(message, now);
      return false;
    }
    if (message.t !== 'lifter') return false;
    this.arm.push(message, now);
    const changed = this.freed !== message.f || this.lifts !== message.n;
    this.freed = message.f;
    this.lifts = message.n;
    this.resting = Boolean(message.r);
    return changed;
  }

  /** How far up their arm is at this moment, and whether it's at its own line, for the weight everyone lifts. */
  armAt(now) {
    const at = this.arm.at(now);
    return { lift: at?.u ?? 0, up: Boolean(at?.a) };
  }

  /** The numbers their lifter copies, at this moment, or none if their camera can't see them. */
  bodyAt(now) {
    return this.body.at(now)?.p ?? [];
  }
}

/** The arms of the friends who are still here, for the rules: see Lifting.update. */
export const mateArms = (mates, now) => mates.filter(({ gone }) => !gone).map((mate) => mate.armAt(now));

/**
 * Everyone's count, the most first: lifts, on one weight together, or friends freed, against each other. stats is
 * this child's own, and each row is { name, count, you }. me is this child's name in it: You, or Player 1 for two in
 * one picture on one screen, who both read it.
 */
export function scoreRows(stats, mates, team, me = 'You') {
  const count = (freed, lifts) => (team ? lifts : freed);
  const rows = [
    { name: me, count: count(stats.freed, stats.lifts), you: true },
    ...mates.filter(({ gone }) => !gone).map(({ friend, freed, lifts }) => ({ name: friend.spec.name, count: count(freed, lifts), you: false })),
  ];
  // On a tie, the child sees themselves first.
  return rows.sort((a, b) => b.count - a.count || Number(b.you) - Number(a.you));
}

/** Against each other: whether the game is over because someone has freed all of theirs. results is each one's finish. */
export const someoneFreedAll = (results) => [...results.values()].some(({ won }) => won);

/** What this child's finish says to friends: w is 1 for a game played to its end, and n what they're counted by. */
export function finishMessage(lifting, team) {
  const all = lifting.stats.freed >= lifting.rescues.length;
  return { w: team || all ? 1 : 0, n: team ? lifting.stats.lifts : lifting.stats.freed };
}

// A friend's own rescue, while it's only guessed at from their arm: it stops short of free until their game says so.
const GUESS_MOST = 0.92;

/**
 * Two in one picture on one screen, against each other (core/one-picture.js): the second player's own rescue, as
 * the first player's game shows it beside their lifter, the way their own game has it, worked out from what their
 * game sends. Their basket goes up as their arm does, and their friend gets out while it's at their line, for as
 * long as a hold is (holdSeconds, the host's, the same for both), and is free once their game says they've freed
 * them: what's freed only ever comes from there. Then the basket comes down with their arm, a rest, and the next
 * friend in need comes in. rescues is the list of them, laid out as for a game with friends: baskets only.
 */
export class FriendRescue {
  constructor(rescues, holdSeconds) {
    this.rescues = rescues;
    this.holdSeconds = Math.max(0.1, holdSeconds);
    this.index = 0;
    this.phase = 'arriving';
    this.phaseFor = 0;
    this.height = 0; // How high the basket is, as a lift: 1 at the line.
    this.progress = 0; // How far out the friend has got: never lost, as in the game itself.
    this.freeing = false; // Whether they're getting out just now.
  }

  get rescue() {
    return this.rescues[this.index] ?? null;
  }

  /** How many there are still to free, this one too. */
  get left() {
    return Math.max(0, this.rescues.length - this.index - (this.phase === 'freed' || this.phase === 'resting' ? 1 : 0));
  }

  /** How far out the friend is to be shown: out while it's held up, back under if it comes down, and out once free. */
  get out() {
    if (this.phase === 'freed' || this.phase === 'resting') return 1;
    return this.freeing ? this.progress : 0;
  }

  setPhase(phase) {
    this.phase = phase;
    this.phaseFor = 0;
  }

  /**
   * One frame. lift is how far up their arm is, as a share of the way to their own line, up whether it's at it, and
   * freed how many friends their game says they've freed.
   */
  update(dt, { lift = 0, up = false, freed = 0 } = {}) {
    this.phaseFor += dt;
    const arm = Math.min(MOST_LIFT, Math.max(0, lift));
    // Their game has freed this one, however far it had got here.
    if (freed > this.index && (this.phase === 'arriving' || this.phase === 'lifting')) this.setPhase('freed');
    if (this.phase === 'arriving') {
      this.height = 0;
      this.freeing = false;
      if (this.phaseFor >= ARRIVE_SECONDS) this.setPhase('lifting');
      return;
    }
    if (this.phase === 'resting') {
      this.height = 0;
      if (this.phaseFor < REST_SECONDS) return;
      this.index += 1;
      this.progress = 0;
      this.setPhase(this.rescue ? 'arriving' : 'done');
      return;
    }
    if (this.phase === 'done') return;
    // The basket follows the arm up, a little behind it, and down quickly.
    this.height = arm > this.height ? Math.min(arm, this.height + LIGHT_RISE * dt) : this.height + (arm - this.height) * (1 - Math.exp(-FALL_RATE * dt));
    if (this.phase === 'freed') {
      this.freeing = false;
      // Once their arm is down again, there's a rest before the next one.
      if (arm < LOWERED) this.setPhase('resting');
      return;
    }
    this.freeing = up && this.height >= 0.95;
    if (this.freeing) this.progress = Math.min(GUESS_MOST, this.progress + dt / this.holdSeconds);
  }
}
