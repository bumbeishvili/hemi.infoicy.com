// The sounds of the swamp. Nothing new was recorded for it: all of these are real recordings the other games
// already have, used here as they are. See CREDITS.md for where each came from.
import { Sound } from '../../core/sound.js';

const borrowed = (file) => new URL(`../${file}`, import.meta.url);

const SWAMP_SOUNDS = {
  birds: borrowed('spider-catcher/audio/birds.ogg'), // The swamp, quietly underneath.
  music: borrowed('leap-trail/audio/music.ogg'),
  wind: borrowed('cannon-bay/audio/wind.ogg'), // The rain cloud coming nearer.
  jump: borrowed('leap-trail/audio/jump.ogg'),
  splash: borrowed('cannon-bay/audio/splash.ogg'), // Landing in the swamp.
  splat: borrowed('robot-rescue/audio/goo-splat.ogg'), // Mud on the window.
  boing: borrowed('robot-rescue/audio/boing.ogg'), // A frog.
  pop: borrowed('balloon-pop/audio/pop.ogg'), // The mud bubble.
  whoosh: borrowed('mighty-moves/audio/whoosh-1.ogg'), // The heron's wings.
  wipe: borrowed('lighthouse/audio/wipe.ogg'), // The window washed or wiped.
  sparkle: borrowed('mighty-moves/audio/sparkle.ogg'), // Golden mud.
  gong: borrowed('mighty-moves/audio/bell.ogg'), // The cup.
  cheer: borrowed('mighty-moves/audio/cheer.ogg'),
};

const MUSIC_LEVEL = 0.13;
const BIRDS_LEVEL = 0.1;
const WIND_MOST = 0.22;
const near = (spread) => 1 + (Math.random() - 0.5) * spread;

export class SwampSound extends Sound {
  constructor(options) {
    super({ ...options, sounds: SWAMP_SOUNDS });
  }

  startSwamp() {
    this.startLoop('birds', BIRDS_LEVEL);
    this.startLoop('music', MUSIC_LEVEL);
    this.startLoop('wind', 0);
  }

  stopSwamp() {
    for (const name of ['birds', 'music', 'wind']) this.stopLoop(name);
  }

  /** The wind gets up as the rain cloud comes nearer. share is how far it has come, from 0 to 1. */
  cloud(share) {
    this.setLoopLevel('wind', Math.min(1, Math.max(0, (share - 0.5) * 2)) * WIND_MOST);
  }

  jump() {
    this.play('jump', { gain: 0.35, rate: near(0.1) });
  }

  /** Landing in the swamp: louder and deeper for a bigger jump. */
  splash(size) {
    const big = Math.min(1, Math.max(0, (size - 1) / 1.4));
    this.play('splash', { gain: 0.3 + big * 0.3, rate: 1.15 - big * 0.3 });
  }

  /** Mud on the window. */
  splat(squares) {
    this.play('splat', { gain: Math.min(0.5, 0.2 + squares * 0.005), rate: near(0.12), after: 0.12 });
  }

  frog() {
    this.play('boing', { gain: 0.3, rate: 1.3 + Math.random() * 0.3, after: 0.1 });
  }

  pop() {
    this.play('pop', { gain: 0.5, rate: 0.7 });
  }

  heron() {
    this.play('whoosh', { gain: 0.3, rate: 0.8 });
  }

  wash() {
    this.play('wipe', { gain: 0.4 });
  }

  gold() {
    this.play('sparkle', { gain: 0.4 });
  }

  cup() {
    this.play('gong', { gain: 0.3 });
    this.play('sparkle', { gain: 0.4, rate: 0.9, after: 0.3 });
  }

  cheer() {
    this.play('cheer', { gain: 0.25 });
  }
}
