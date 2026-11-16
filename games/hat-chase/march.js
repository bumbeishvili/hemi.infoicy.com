// Marching on the spot, read from how far each foot is off the floor: each knee lifted is one step. There's no
// screen or camera in this file, so it runs in the unit tests. main.js gives it what the body reader measures,
// each time the camera has looked: each foot's height off the floor, as a share of the child's leg length.
//
// A foot is lifted once it's up past the line, with the other foot down, however slowly it came up, and it has to
// come most of the way down again before it can be lifted again. Both feet up at once is a jump, not a step. A
// child who's trying and not quite getting a foot up to the line is met: after two lifts in a row that came near
// it, that leg's own line comes down a little, so a weaker leg is asked for less than a stronger one.

// How high a foot has to come for a step, as a share of leg length, which is a grown-up's choice. Someone
// standing still reads up to about 0.06, so the line is never as low as that.
export const LIFT = { low: 0.08, medium: 0.11, high: 0.16 };
export const LEAST_LINE = 0.07; // A leg's line never comes down further than this.
const DOWN = 0.5; // A lifted foot is down again below this share of its line.
const OTHER_DOWN = 0.6; // And the other foot has to be below this share of its own line for a lift to be a step.
const NEAR = 0.55; // A lift that came this near the line, and no nearer, was a try.
const TRIES = 2; // After this many tries in a row, the line comes down to meet the child,
const EASES_BY = 0.85; // to this share of what it was.
const SAME_LEG_AFTER = 2.5; // Taking turns, the same leg counts again after a pause this long.

const SIDES = ['left', 'right'];
const other = (side) => (side === 'left' ? 'right' : 'left');

export class Marcher {
  /** line is how high a foot has to come. turns is whether the legs have to take turns for a lift to count. */
  constructor({ line = LIFT.medium, turns = false } = {}) {
    this.turns = turns;
    this.setLine(line);
  }

  /** A new line for both legs, as when a grown-up changes it: whatever a leg's line had come down to is let go. */
  setLine(line) {
    this.wanted = line;
    this.line = { left: line, right: line };
    this.up = { left: false, right: false };
    this.peak = { left: 0, right: 0 };
    this.tries = { left: 0, right: 0 };
    this.last = null; // { side, at }, the last step that counted.
    this.same = false; // Taking turns, whether the last lift was the same leg again, and didn't count.
  }

  /**
   * The camera has looked. rises is { left, right }, each foot's height off the floor, now the time in seconds,
   * and inAir whether the child is in the middle of a jump. Returns 'left' or 'right' for a step with that leg,
   * or null.
   */
  update(rises, now, { inAir = false } = {}) {
    let stepped = null;
    for (const side of SIDES) {
      const rise = Math.max(0, rises?.[side] ?? 0);
      const line = this.line[side];
      if (this.up[side]) {
        if (rise < line * DOWN) this.up[side] = false;
        continue;
      }
      // Coming up: the highest it gets is kept, to tell a try from a foot that's just resting.
      if (rise >= line * DOWN) this.peak[side] = Math.max(this.peak[side], rise);
      const otherDown = Math.max(0, rises?.[other(side)] ?? 0) < this.line[other(side)] * OTHER_DOWN;
      if (!inAir && otherDown && rise >= line) {
        this.up[side] = true;
        this.peak[side] = 0;
        this.tries[side] = 0;
        if (this.counts(side, now)) stepped = side;
        continue;
      }
      // Down again without having got there: a lift that came near the line, and not up to it, was a try. One
      // that went past it without counting was a jump, with both feet up.
      if (rise < line * DOWN && this.peak[side] > 0) {
        if (!inAir && this.peak[side] >= line * NEAR && this.peak[side] < line) {
          this.tries[side] += 1;
          if (this.tries[side] >= TRIES) {
            this.line[side] = Math.max(LEAST_LINE, line * EASES_BY);
            this.tries[side] = 0;
          }
        }
        this.peak[side] = 0;
      }
    }
    return stepped;
  }

  /** Whether a lift with this leg is a step: always, unless the legs have to take turns and it's the same again. */
  counts(side, now) {
    const again = this.turns && this.last?.side === side && now - this.last.at < SAME_LEG_AFTER;
    this.same = again;
    if (again) return false;
    this.last = { side, at: now };
    return true;
  }
}
