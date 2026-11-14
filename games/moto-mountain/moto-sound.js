// The sounds of the ride. Nothing new was recorded for it: the engine is High Five Racers' real engine
// recording, played a little higher, as a smaller engine sounds, and everything else is a real recording one
// of the other games already has, used as it is. See CREDITS.md for where each came from.
import { CarSound } from '../high-five-racers/car-sound.js';

const borrowed = (file) => new URL(`../${file}`, import.meta.url);

const MOTO_SOUNDS = {
  birds: borrowed('tank-patrol/audio/birds.ogg'), // The countryside, quietly underneath.
  wind: borrowed('cannon-bay/audio/wind.ogg'), // Up in the snow at the top.
  music: borrowed('leap-trail/audio/music.ogg'),
  splash: borrowed('cannon-bay/audio/splash.ogg'), // A puddle.
  rustle: borrowed('spider-catcher/audio/rustle.ogg'), // Long grass under the wheels.
  plank: borrowed('leap-trail/audio/land.ogg'), // A hand drum: the planks of a bridge.
  swish: borrowed('mighty-moves/audio/jump.ogg'), // Off a ramp.
  ring: borrowed('robot-rescue/audio/bell.ogg'), // A bicycle bell: at a sheep, and from a friend's scooter.
  hop: borrowed('tank-patrol/audio/hop.ogg'), // The sheep trotting off.
  crunch: borrowed('giraffe-walk/audio/crunch.ogg'), // A heap of snow.
  gong: borrowed('mighty-moves/audio/bell.ogg'), // The cup.
};

const MUSIC_LEVEL = 0.12;
const BIRDS_LEVEL = 0.1;
const WIND_MOST = 0.22;
const HIGHER_CENTS = 420; // The car's engine, about a third higher, for a bike.
const RUSTLE_SECONDS = 0.55;
const PLANK_SECONDS = 0.24;
const near = (spread) => 1 + (Math.random() - 0.5) * spread;

export class MotoSound extends CarSound {
  constructor(options) {
    super({ ...options, sounds: MOTO_SOUNDS });
    this.rustleIn = 0;
    this.plankIn = 0;
  }

  startRide() {
    this.startEngine();
    if (this.engineSource) this.engineSource.detune.value = HIGHER_CENTS;
    this.startLoop('birds', BIRDS_LEVEL);
    this.startLoop('music', MUSIC_LEVEL);
    this.startLoop('wind', 0);
  }

  stopRide() {
    this.stopEngine();
    for (const name of ['birds', 'music', 'wind']) this.stopLoop(name);
  }

  /** The wind gets up as the road climbs into the snow. amount is from 0 to 1. */
  snow(amount) {
    this.setLoopLevel('wind', Math.min(1, Math.max(0, amount)) * WIND_MOST);
  }

  /** Grass under the wheels, every so often while the bike is on it. */
  onGrass(dt) {
    this.rustleIn -= dt;
    if (this.rustleIn > 0) return;
    this.rustleIn = RUSTLE_SECONDS;
    this.play('rustle', { gain: 0.3, rate: near(0.2) });
  }

  /** The planks of a bridge, one after another, quicker the faster the bike goes. speed is from 0 to 1. */
  onBridge(dt, speed) {
    this.plankIn -= dt * Math.max(0.3, speed);
    if (this.plankIn > 0) return;
    this.plankIn = PLANK_SECONDS;
    this.play('plank', { gain: 0.16, rate: 0.7 * near(0.12) });
  }

  bend() {
    this.play('sparkle', { gain: 0.3, rate: 1.2 });
  }

  splash() {
    this.play('splash', { gain: 0.3, rate: 1.3 * near(0.1) });
  }

  boost() {
    this.play('whoosh', { gain: 0.4 });
    this.play('rush', { gain: 0.3, bus: this.backgroundBus });
  }

  jump() {
    this.play('swish', { gain: 0.45 });
  }

  /** Through a row of hay bales: a thud, and straw. */
  crash() {
    this.play('landed', { gain: 0.5, rate: 0.7 });
    this.play('rustle', { gain: 0.55, rate: 0.8 });
  }

  /** Into a river. */
  wade() {
    this.play('splash', { gain: 0.45, rate: 0.9 * near(0.1) });
  }

  /** A trick in the air, and a place gained in the race. */
  trick() {
    this.play('harp', { gain: 0.35, rate: 1.3 });
  }

  placeUp() {
    this.play('sparkle', { gain: 0.35, rate: 1.5 });
  }

  land() {
    this.play('landed', { gain: 0.4, rate: near(0.1) });
  }

  /** A ring of the bell at a sheep in the road, and its hop as it trots off. */
  ring() {
    this.play('ring', { gain: 0.4 });
  }

  sheepGoes() {
    this.play('hop', { gain: 0.3, rate: 1.2 });
  }

  snowHeap() {
    this.play('crunch', { gain: 0.5, rate: 0.75 * near(0.1) });
  }

  medal() {
    this.play('harp', { gain: 0.5 });
  }

  cup() {
    this.play('gong', { gain: 0.3 });
    this.play('sparkle', { gain: 0.4, rate: 0.9, after: 0.3 });
  }

  cheer() {
    this.play('cheer', { gain: 0.25 });
  }
}
