// The audio every game shares: the mixer, spoken lines and common effects. Spoken lines are
// rendered ahead of time (see tools/), so nothing is generated while playing. Everything is
// local: CREDITS.md says where each sound came from.

const AUDIO_ROOT = new URL('./audio/', import.meta.url);

const SHARED_SOUNDS = {
  star: 'sfx/star.ogg',
  handsOpen: 'sfx/hands-open.ogg',
  go: 'sfx/go.ogg',
  tick: 'sfx/tick.ogg',
  win: 'sfx/win.ogg',
  applause: 'sfx/applause.ogg',
};

// What's said at the end of a game that was lost, by a game with no line of its own for it: kind, and short.
// It's one of the lines every game has: see audio/voice/lines.json.
export const SO_CLOSE = 'So close! Try again!';

const FETCH_ATTEMPTS = 3;

const STAR_STREAK_SECONDS = 1.2;
// A rising scale, so a row of stars climbs and feels like getting somewhere.
const STAR_RATES = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2];

const MASTER_LEVEL = 0.9; // Headroom, as a sharp sound can get a little past the limiter.
// The limiter adds back gain of its own, so its loudest moments land close to full scale: a busy moment in
// Cannon Bay, a cannon, a ship going down and a voice together, reached 1.02. This keeps them under it.
const OUTPUT_LEVEL = 0.9;
const VOICE_LEVEL = 1.5;
const VOICE_DUCK = 0.45; // How far background sound drops while the voice speaks.
const LINE_PAUSE_SECONDS = 0.16; // Between one line and the next.
const LINE_WAITS_AT_MOST_MS = 4000; // After this long a line is out of date, and goes unsaid.

export class Sound {
  /** sounds adds a game's own effects, as { name: URL }. */
  constructor({ sound = true, voice = true, language = 'en', lines = [], sounds = {} } = {}) {
    this.soundOn = sound;
    this.voiceOn = voice;
    this.language = language;
    this.lines = lines;
    this.gameSounds = sounds;
    this.backgroundLevel = 1;
    this.context = null;
    this.buffers = new Map();
    this.voiceClips = new Map();
    this.ready = Promise.resolve();
    this.currentVoice = null;
    this.waitingLine = null;
    this.loops = new Map();
    this.starStreak = 0;
    this.lastStarAt = -Infinity;
  }

  /** Browsers only allow audio after a click, so this runs from the Start button. */
  unlock() {
    if (this.context) {
      this.context.resume();
      return;
    }
    this.context = new AudioContext();
    this.buildMixer();
    this.ready = this.load();
  }

  buildMixer() {
    const { context } = this;
    // A limiter, so several sounds at once can't clip. Chrome adds make-up gain to this
    // node based on these settings, which raises everything by about 3 dB.
    this.limiter = context.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.15;
    // What reaches the speakers.
    this.output = context.createGain();
    this.output.gain.value = OUTPUT_LEVEL;
    this.limiter.connect(this.output);
    this.output.connect(context.destination);

    this.master = context.createGain();
    this.master.gain.value = MASTER_LEVEL;
    this.master.connect(this.limiter);

    this.backgroundBus = context.createGain();
    this.effectsBus = context.createGain();
    this.voiceBus = context.createGain();
    this.backgroundBus.connect(this.master);
    this.effectsBus.connect(this.master);
    this.voiceBus.connect(this.master);
    this.voiceBus.gain.value = VOICE_LEVEL;
    this.backgroundBus.gain.value = this.soundOn ? this.backgroundLevel : 0;
    this.effectsBus.gain.value = this.soundOn ? 1 : 0;
  }

  /** A dropped connection shouldn't cost a child a spoken line, so this tries again. */
  async fetchClip(url) {
    for (let attempt = 1; ; attempt += 1) {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${url}: ${response.status}`);
        return await this.context.decodeAudioData(await response.arrayBuffer());
      } catch (error) {
        if (attempt === FETCH_ATTEMPTS) throw error;
        await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
      }
    }
  }

  /** One bad file shouldn't stop a child playing, so each one fails on its own. */
  async loadClip(url, store) {
    try {
      store(await this.fetchClip(url));
    } catch (error) {
      console.error('Could not load a sound:', String(url), error);
    }
  }

  async load() {
    const shared = Object.entries(SHARED_SOUNDS).map(([name, file]) => [name, new URL(file, AUDIO_ROOT)]);
    await Promise.all([
      ...[...shared, ...Object.entries(this.gameSounds)].map(([name, url]) =>
        this.loadClip(url, (buffer) => this.buffers.set(name, buffer))),
      this.loadVoice(),
    ]);
  }

  async loadVoice() {
    const language = this.language;
    const clips = new Map();
    // A game can bring lines of its own, with base saying which folder they're in.
    await Promise.all(this.lines.map(({ id, text, base = new URL('voice/', AUDIO_ROOT) }) =>
      this.loadClip(new URL(`${language}/${id}.ogg`, base), (buffer) => clips.set(text, buffer))));
    // The language may have changed again while these were loading.
    if (language !== this.language) return;
    this.voiceClips = clips;
    this.linesLoaded = true;
  }

  setLanguage(language) {
    if (language === this.language) return;
    this.language = language;
    if (!this.context) return;
    this.stopVoice();
    this.linesLoaded = false;
    this.ready = this.loadVoice();
  }

  setEnabled({ sound, voice }) {
    if (sound !== undefined) this.soundOn = sound;
    if (voice !== undefined) {
      this.voiceOn = voice;
      if (!voice) this.stopVoice();
    }
    if (!this.context) return;
    const level = this.soundOn ? 1 : 0;
    this.effectsBus.gain.setTargetAtTime(level, this.context.currentTime, 0.02);
    this.setBackgroundLevel();
  }

  setBackgroundLevel() {
    const speaking = this.currentVoice !== null;
    const level = this.soundOn ? this.backgroundLevel * (speaking ? VOICE_DUCK : 1) : 0;
    this.backgroundBus.gain.setTargetAtTime(level, this.context.currentTime, speaking ? 0.04 : 0.25);
  }

  /** A sound effect. after is how many seconds from now it starts, for sounds that shouldn't all start at once. */
  play(name, { gain = 1, rate = 1, bus = this.effectsBus, after = 0 } = {}) {
    const buffer = this.buffers.get(name);
    if (!this.context || !buffer || !this.soundOn) return;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const level = this.context.createGain();
    level.gain.value = gain;
    source.connect(level).connect(bus);
    source.start(after > 0 ? this.context.currentTime + after : 0);
  }

  /** A sound that keeps going until it's stopped, under everything else. */
  startLoop(name, level) {
    if (!this.context || this.loops.has(name)) return;
    const buffer = this.buffers.get(name);
    if (!buffer) return;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = this.context.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(level, this.context.currentTime, 0.6);
    source.connect(gain).connect(this.backgroundBus);
    source.start();
    this.loops.set(name, { source, gain });
  }

  stopLoop(name) {
    const loop = this.loops.get(name);
    if (!loop) return;
    this.loops.delete(name);
    loop.gain.gain.setTargetAtTime(0, this.context.currentTime, 0.3);
    loop.source.stop(this.context.currentTime + 1.5);
  }

  /** How loud a loop is now, for a sound that follows what the child is doing. */
  setLoopLevel(name, level) {
    const loop = this.loops.get(name);
    if (loop) loop.gain.gain.setTargetAtTime(level, this.context.currentTime, 0.08);
  }

  /** Each star in a row plays the next note up. */
  star() {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.starStreak = now - this.lastStarAt < STAR_STREAK_SECONDS ? this.starStreak + 1 : 0;
    this.lastStarAt = now;
    this.play('star', { gain: 0.7, rate: STAR_RATES[Math.min(this.starStreak, STAR_RATES.length - 1)] });
  }

  /** A number in the countdown. */
  count(number) {
    this.play('tick', { gain: 0.5 });
    this.say(String(number));
  }

  go() {
    this.play('go', { gain: 0.5 });
    this.say('Go!');
  }

  /** The small lift when the hand opens. */
  handsOpen() {
    this.play('handsOpen', { gain: 0.5 });
  }

  /** The small lift that says the camera saw that. */
  seen() {
    this.play('handsOpen', { gain: 0.45 });
  }

  /** The celebration at the end of a game, and what the voice says over it. */
  /**
   * The end of a game: the fanfare and the clapping, and then what's said. A game that was lost has neither:
   * only what's said, if anything is. What it ended with is kept, for the tests to read.
   */
  finish(line, { lost = false } = {}) {
    this.finished = { line: line ?? null, lost };
    if (!lost) {
      this.play('win', { gain: 0.8 });
      this.play('applause', { gain: 0.32 });
    }
    if (line) setTimeout(() => this.say(line), lost ? 300 : 650);
  }

  /**
   * Says a pre-rendered line, and returns whether it will be heard. A line is never cut off, as
   * nothing sounds less like a person. If something is being said, this waits until it has finished,
   * in place of anything else that was waiting, because the newest is the most up to date. With
   * ifQuiet it's only said if nothing is being said or waiting, for things that can go unsaid.
   */
  say(text, { ifQuiet = false } = {}) {
    if (!this.context) return false;
    const clip = this.voiceClips.get(text);
    // Every line should have a file. Missing one is a bug, so it's logged even when muted.
    if (!clip) {
      if (this.linesLoaded) console.error(`No voice clip for "${text}". Add it to core/audio/voice/lines.json.`);
      return false;
    }
    if (!this.voiceOn) return false;
    return this.sayClip(text, clip, ifQuiet);
  }

  sayClip(text, clip, ifQuiet) {
    if (!this.currentVoice) {
      this.speak(text, clip);
      return true;
    }
    if (ifQuiet) return false;
    // Saying the same thing twice in a row is what a machine does.
    if (this.currentVoice.text !== text) this.waitingLine = { text, clip, at: performance.now() };
    return true;
  }

  speak(text, clip, after = 0) {
    const source = this.context.createBufferSource();
    source.buffer = clip;
    source.connect(this.voiceBus);
    source.onended = () => {
      if (this.currentVoice?.source !== source) return;
      this.currentVoice = null;
      this.sayWaitingLine();
      this.setBackgroundLevel();
    };
    source.start(this.context.currentTime + after);
    this.currentVoice = { source, text };
    this.setBackgroundLevel();
  }

  /** The next line, after the short pause a person would leave, unless it's out of date by now. */
  sayWaitingLine() {
    const waiting = this.waitingLine;
    this.waitingLine = null;
    if (waiting && performance.now() - waiting.at <= LINE_WAITS_AT_MOST_MS) this.speak(waiting.text, waiting.clip, LINE_PAUSE_SECONDS);
  }

  /** Only for when everything is stopping: a pause, a hidden tab, muting or a new language. */
  stopVoice() {
    this.waitingLine = null;
    const speaking = this.currentVoice;
    if (!speaking) return;
    this.currentVoice = null;
    speaking.source.onended = null;
    speaking.source.stop();
    if (this.context) this.setBackgroundLevel();
  }

  /** Everything goes silent, for a pause or a hidden tab. resume() brings it back. */
  quiet() {
    this.stopVoice();
    if (this.context) this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.03);
  }

  resume() {
    if (this.context) this.master.gain.setTargetAtTime(MASTER_LEVEL, this.context.currentTime, 0.05);
  }
}
