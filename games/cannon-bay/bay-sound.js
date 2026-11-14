// The sounds of Cannon Bay. All real recordings, prepared ahead of time: see CREDITS.md and
// build_sounds.py. Some of them are shared with the other games. The cannons are kept soft and friendly,
// and anything further away is quieter.
import { Sound } from '../../core/sound.js';

const here = (file) => new URL(`./audio/${file}`, import.meta.url);
const other = (file) => new URL(`../${file}`, import.meta.url);

const BAY_SOUNDS = {
  cannon: here('cannon.ogg'),
  splash: here('splash.ogg'),
  thud: here('thud.ogg'),
  creak: here('creak.ogg'),
  wind: here('wind.ogg'),
  canvas: here('canvas.ogg'),
  gulls: here('gulls.ogg'),
  row: here('row.ogg'),
  music: here('music.ogg'),
  waves: other('lighthouse/audio/waves.ogg'),
  wash: other('lighthouse/audio/waves.ogg'),
  horn: other('lighthouse/audio/horn.ogg'),
  down: other('mighty-moves/audio/boom.ogg'),
  sparkle: other('mighty-moves/audio/sparkle.ogg'),
  // For the higher levels' prizes and power-ups.
  boing: other('robot-rescue/audio/boing.ogg'),
  bubble: other('robot-rescue/audio/goo-pop.ogg'),
  unlock: other('robot-rescue/audio/unlock.ogg'),
  bell: other('robot-rescue/audio/bell.ogg'),
};

const LOOPS = { waves: 0.22, wash: 0, creak: 0.12, wind: 0.03, gulls: 0.1, music: 0.14 };
const WASH_MOST = 0.2;
const WIND_LEAST = 0.03;
const WIND_MOST = 0.14;
const UNDER_THE_VOICE = 0.55; // How loud the cannons and splashes are while someone is speaking.
const CANVAS_EVERY_MS = 2500;
const GOLD_APART_MS = 110;
const GOLD_ROW_MS = 1500;
const GOLD_RATES = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2];
const HIT_APART_MS = 10; // Hits in the same frame, like a triple shot's, are heard as one.
const STRUCK_APART_MS = 120; // A friend's hits that are shown together, after a moment's wait, are heard as one.

const near = (spread) => 1 + (Math.random() - 0.5) * spread;
/** How loud something is from this far away: all of it close by, and never quite nothing. */
const atDistance = (away) => Math.max(0.2, 1 - away / 620);

export class BaySound extends Sound {
  constructor(options) {
    super({ ...options, sounds: BAY_SOUNDS });
    this.canvasAt = -Infinity;
    this.goldAt = -Infinity;
    this.goldStreak = 0;
    this.hitAt = -Infinity;
    this.struckAt = -Infinity;
  }

  /** What's being said matters more than what's going on, and together they could clip. */
  get underVoice() {
    return this.currentVoice ? UNDER_THE_VOICE : 1;
  }

  /** The sea and the ship go on for the whole round. */
  startSea() {
    for (const [name, level] of Object.entries(LOOPS)) this.startLoop(name, level);
    const wash = this.loops.get('wash');
    // The same waves, quicker and so a little brighter, for the water going past the hull.
    if (wash) wash.source.playbackRate.value = 1.4;
  }

  stopSea() {
    for (const name of Object.keys(LOOPS)) this.stopLoop(name);
  }

  /** Water going past and wind in the sails, for how fast it's going and how far up they are. */
  sailing(way, sails) {
    this.setLoopLevel('wash', Math.min(1, way) * WASH_MOST);
    this.setLoopLevel('wind', WIND_LEAST + sails * (WIND_MOST - WIND_LEAST));
  }

  /** The sails filling, when they go up. */
  sailsUp() {
    const now = performance.now();
    if (now - this.canvasAt < CANVAS_EVERY_MS) return;
    this.canvasAt = now;
    this.play('canvas', { gain: 0.42, rate: near(0.12) });
  }

  /** One of the child's cannons. */
  cannon() {
    this.play('cannon', { gain: 0.3 * this.underVoice, rate: near(0.16) });
  }

  /** A pirate's cannon, further off. */
  theirCannon(away) {
    this.play('cannon', { gain: 0.22 * atDistance(away) * this.underVoice, rate: 0.86 * near(0.12) });
  }

  splash(away, size = 1) {
    this.play('splash', { gain: 0.3 * size * atDistance(away) * this.underVoice, rate: (size < 1 ? 1.25 : 1) * near(0.2) });
  }

  /** A ball hitting a pirate ship. A triple shot's three balls land together, and make one thud. */
  hit(away) {
    const now = performance.now();
    if (now - this.hitAt < HIT_APART_MS) return;
    this.hitAt = now;
    this.play('thud', { gain: 0.24 * atDistance(away) * this.underVoice, rate: near(0.24) });
  }

  /**
   * With a friend, one of their balls hitting the child's ship: the thud of a hit, a little lower, and no
   * louder than the child's own, as it can come as often.
   */
  struck() {
    const now = performance.now();
    if (now - this.struckAt < STRUCK_APART_MS) return;
    this.struckAt = now;
    this.play('thud', { gain: 0.26 * this.underVoice, rate: 0.86 * near(0.12) });
  }

  /** A ball hitting the child's ship, which is soft too. */
  hurt() {
    this.play('thud', { gain: 0.5 * this.underVoice, rate: 0.82 * near(0.1) });
    this.play('splash', { gain: 0.18 * this.underVoice, rate: 1.1 * near(0.1) });
  }

  /**
   * A ship beaten: a low drum and something sparkling, and the first stroke of the oars as its crew rows
   * away. A raft has nobody on it to row, and a little raft is just the drum.
   */
  beaten(away, { small = false, rowing = true } = {}) {
    this.play('down', { gain: (small ? 0.2 : 0.34) * atDistance(away) * this.underVoice, rate: (small ? 1.25 : 1) * near(0.1) });
    if (small) return;
    // A little after the drum, and the oars after that, so they don't all start on top of the cannon's thump
    // and the voice: together they reached the top of what can be played without clipping.
    this.play('sparkle', { gain: 0.26 * this.underVoice, rate: near(0.08), after: 0.12 });
    if (rowing) this.play('row', { gain: 0.28 * atDistance(away) * this.underVoice, rate: near(0.12), after: 0.25 });
  }

  /** Something picked up off the water: a gem rings like the gold, and the rest have their own. */
  prize({ kind }) {
    if (kind === 'gem' || kind === 'heart') this.gold();
    else if (kind === 'chest' || kind === 'key') this.play('unlock', { gain: 0.32 * this.underVoice, rate: near(0.08) });
    else if (kind === 'cage') this.play('bell', { gain: 0.26 * this.underVoice, rate: near(0.06) });
  }

  /** A power-up taking hold. */
  powerUp() {
    this.play('sparkle', { gain: 0.3 * this.underVoice, rate: 1.12 * near(0.06) });
  }

  /** A ship caught in a bubble, or a ball bouncing off the shield. */
  bubble(away, gain = 1) {
    this.play('bubble', { gain: 0.3 * gain * atDistance(away) * this.underVoice, rate: 0.8 * near(0.16) });
  }

  /** The big bouncing ball, going on to the next ship. */
  boing(away) {
    this.play('boing', { gain: 0.22 * atDistance(away) * this.underVoice, rate: near(0.14) });
  }

  /** One of the pirate king's sails coming down. */
  sailDown(away) {
    this.play('canvas', { gain: 0.36 * atDistance(away) * this.underVoice, rate: 0.8 * near(0.1) });
  }

  /** A smoke ship's puff of smoke. */
  puff(away) {
    this.play('canvas', { gain: 0.22 * atDistance(away) * this.underVoice, rate: 1.3 * near(0.1) });
  }

  /** A coin picked up, each one in a row a note higher. Several at once only ring once. */
  gold() {
    const now = performance.now();
    if (now - this.goldAt < GOLD_APART_MS) return;
    this.goldStreak = now - this.goldAt < GOLD_ROW_MS ? this.goldStreak + 1 : 0;
    this.goldAt = now;
    this.play('star', { gain: 0.3 * this.underVoice, rate: GOLD_RATES[Math.min(this.goldStreak, GOLD_RATES.length - 1)] });
  }

  won() {
    this.play('horn', { gain: 0.26 });
  }

  /** The celebration, kept down a little, as the ship's horn is still sounding and the voice comes in over it. */
  /** The end of a battle: a kinder sound for one the pirates won, with no fanfare to be sad about. */
  finish(line) {
    if (this.lost) {
      this.play('sparkle', { gain: 0.4 });
      setTimeout(() => this.say(line), 450);
      return;
    }
    this.play('win', { gain: 0.5 });
    this.play('applause', { gain: 0.2 });
    setTimeout(() => this.say(line), 650);
  }
}
