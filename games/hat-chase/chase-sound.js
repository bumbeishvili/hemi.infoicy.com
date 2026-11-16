// The sounds of the chase. Nothing new was recorded for it: all of these are real recordings the other games
// already have, used here as they are. See CREDITS.md for where each came from.
import { Sound } from '../../core/sound.js';

const borrowed = (file) => new URL(`../${file}`, import.meta.url);

const CHASE_SOUNDS = {
  birds: borrowed('spider-catcher/audio/birds.ogg'), // The hills, quietly underneath.
  music: borrowed('leap-trail/audio/music.ogg'),
  step1: borrowed('leap-trail/audio/step-1.ogg'),
  step2: borrowed('leap-trail/audio/step-2.ogg'),
  jump: borrowed('leap-trail/audio/jump.ogg'),
  land: borrowed('leap-trail/audio/land.ogg'),
  slide: borrowed('leap-trail/audio/slide.ogg'), // Under a branch, or down out of the way of the bees.
  bump: borrowed('leap-trail/audio/bump.ogg'), // A tumble.
  boing: borrowed('robot-rescue/audio/boing.ogg'), // The springboard.
  crunch: borrowed('giraffe-walk/audio/crunch.ogg'), // Apples.
  sparkle: borrowed('mighty-moves/audio/sparkle.ogg'), // A golden feather.
  whoosh: borrowed('mighty-moves/audio/whoosh-1.ogg'), // The magpie's wings, getting away.
  gong: borrowed('mighty-moves/audio/bell.ogg'), // The cup.
  cheer: borrowed('mighty-moves/audio/cheer.ogg'),
};

const MUSIC_LEVEL = 0.13;
const BIRDS_LEVEL = 0.1;
const near = (spread) => 1 + (Math.random() - 0.5) * spread;

export class ChaseSound extends Sound {
  constructor(options) {
    super({ ...options, sounds: CHASE_SOUNDS });
  }

  startHills() {
    this.startLoop('birds', BIRDS_LEVEL);
    this.startLoop('music', MUSIC_LEVEL);
  }

  stopHills() {
    for (const name of ['birds', 'music']) this.stopLoop(name);
  }

  /** A step, one foot and then the other. */
  step(side) {
    this.play(side === 'right' ? 'step2' : 'step1', { gain: 0.3, rate: near(0.1) });
  }

  jump() {
    this.play('jump', { gain: 0.35, rate: near(0.1) });
  }

  land() {
    this.play('land', { gain: 0.3, rate: near(0.1) });
  }

  duck() {
    this.play('slide', { gain: 0.3 });
  }

  spring() {
    this.play('boing', { gain: 0.35, rate: 0.9 });
  }

  tumble() {
    this.play('bump', { gain: 0.5, rate: near(0.08) });
  }

  apples() {
    this.play('crunch', { gain: 0.4 });
  }

  /** A star on the path: the chime every game has for a move that was seen, quietly. */
  feather() {
    this.play('sparkle', { gain: 0.4 });
  }

  away() {
    this.play('whoosh', { gain: 0.3, rate: 0.8 });
  }

  cup() {
    this.play('gong', { gain: 0.3 });
    this.play('sparkle', { gain: 0.4, rate: 0.9, after: 0.3 });
  }

  cheer() {
    this.play('cheer', { gain: 0.25 });
  }
}
