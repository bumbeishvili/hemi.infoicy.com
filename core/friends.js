// Playing with friends, each on their own computer, in High Five Racers, Sky Wings, Balloon Pop, Mighty Moves,
// Bounce Back, Leap Trail, Giraffe's Maze, Cannon Bay, Tank Patrol, the Smoothie Stand, Spider Catcher, the
// Lighthouse Keeper, Giraffe's Garden, Frost Arena, Arrow Meadow, Giraffe's Puzzles, Flap, Little Chick!, Mighty
// Lift, Gobble and Grow, Giraffe's Paint Box, Moto Mountain and Rooftop Rope. One player makes a race, a flight, a
// game, a fight, a run, a battle, a match, a flock, a ride or a crossing and sends the link or its code, and the
// others open it.
// Their games talk through a small server (server/race-room.js), which only passes on what each game needs, such
// as where each car or plane is, the name typed and who drives or flies. The camera picture never leaves the
// computer, and nothing is sent at all unless a grown-up makes or joins one. How it looks is in friends-ui.js.
import { makeCode, validCode } from '../server/race-room.js';
import { SEAT, SeatSocket } from './seat.js';

// The server: the one on Cloudflare, or tools/race-server.mjs when the games are on this computer, on the port
// after theirs: 8643 for the usual 8642.
const LOCAL = ['localhost', '127.0.0.1'].includes(globalThis.location?.hostname);
export const RACE_SERVER = LOCAL ? `ws://localhost:${Number(globalThis.location.port || 8642) + 1}` : 'wss://hemi-race.infoicy.com';
const SEND_EVERY_MS = 100; // Where the car or plane is, 10 times a second.
// A connection can die without closing, as when the wifi drops, and then nothing more comes. Asking every so
// often, and hearing nothing back for a while, is how that's noticed: quickly in a race, slowly otherwise.
const HEARTBEAT = { racing: { every: 2000, silent: 6000 }, waiting: { every: 10_000, silent: 25_000 } };
// Losing the connection, it tries again, sooner at first and then every few seconds, for as long as it takes:
// a laptop waking up or wifi coming back can take a while. After this many tries it says it can't get through.
const RETRIES = 6;
const RETRY_MOST_MS = 5000;
const CONNECT_WITHIN_MS = 8000; // A connection still not open after this is given up for a new one.
const ANSWER_WITHIN_MS = 4000; // Saying something that matters, an answer should come within this.
const ID_KEY = 'camera-games-friends'; // This page's player id in each game it's in, for coming back after a reload.
const NEW_CODE_TRIES = 8; // Making a game, codes in use are passed over for another, this many times at most.
const SHOW_BEHIND_MS = 120; // Friends are shown this far in the past, so there's always a next place to go to.
const GUESS_AHEAD_MS = 500; // With nothing new for a while, they carry on this far the way they were going.
const KEEP_SAMPLES = 30;

// Several seats on one screen share what a page keeps, so each has an id of its own: see core/seat.js.
const idKey = (game, code) => `${ID_KEY}:${game}:${code}${SEAT ? `:${SEAT.index}` : ''}`;

function savedId(game, code) {
  try {
    return sessionStorage.getItem(idKey(game, code));
  } catch {
    return null;
  }
}

function saveId(game, code, id) {
  try {
    if (id) sessionStorage.setItem(idKey(game, code), id);
    else sessionStorage.removeItem(idKey(game, code));
  } catch {
    // Private windows can refuse. Coming back after a reload is then as someone new.
  }
}

/**
 * Random numbers from 0 to 1 that come out the same from the same seed, so a game laid out by chance is laid
 * out the same on every friend's computer: see go's seed in server/race-room.js.
 */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** A fresh code. */
export const newCode = () => makeCode((below) => crypto.getRandomValues(new Uint32Array(1))[0] % below);

/** The code in a link, as in #race=ABC234. The part after # never goes to a web server. */
export function codeInLink(hash = location.hash, key = 'race') {
  const code = new URLSearchParams(hash.replace(/^#/, '')).get(key)?.toUpperCase();
  return validCode(code) ? code : null;
}

export const linkFor = (code, key = 'race') => `${location.origin}${location.pathname}#${key}=${code}`;

/** The shortest way round from one angle to another, in radians. */
const turn = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/**
 * Where a friend is, from what their game sends. Each message says how long after "GO!" it was sent, by
 * their clock, which is what they're placed by: messages that arrive bunched up still move them smoothly.
 * offset is how much later than that they get here at best, which the slowest ones are measured against.
 * kind says what's in a message: lerp, numbers that go smoothly from one to the next, angles, which go the
 * short way round, steps, which change half way, and guess(last, seconds), where they'd be that long after
 * the last message, going the way they were.
 */
export class Track {
  constructor({ lerp = [], angles = [], lists = [], steps = [], guess = () => ({}) }) {
    Object.assign(this, { lerp, angles, lists, steps, guess });
    this.clear();
  }

  clear() {
    this.samples = [];
    this.offset = null;
  }

  push(sample, receivedAt) {
    const offset = receivedAt - sample.ms;
    // The best so far, drifting slowly back up, so that a slower connection later on is caught up with.
    this.offset = this.offset === null || offset < this.offset ? offset : this.offset + (offset - this.offset) * 0.02;
    const last = this.samples.at(-1);
    if (last && sample.ms <= last.ms) return;
    this.samples.push(sample);
    if (this.samples.length > KEEP_SAMPLES) this.samples.shift();
  }

  /** Where they're to be shown at this moment, or null before anything has come. */
  at(now) {
    const { samples } = this;
    if (!samples.length) return null;
    const time = now - this.offset - SHOW_BEHIND_MS;
    const last = samples.at(-1);
    if (time >= last.ms) {
      const ahead = Math.min(time - last.ms, GUESS_AHEAD_MS) / 1000;
      return { ...last, ...this.guess(last, ahead) };
    }
    let after = samples.length - 1;
    while (after > 0 && samples[after - 1].ms > time) after -= 1;
    if (after === 0) return { ...samples[0] };
    const before = samples[after - 1];
    const next = samples[after];
    const share = (time - before.ms) / Math.max(1, next.ms - before.ms);
    const out = { ms: time };
    for (const key of this.lerp) out[key] = before[key] + (next[key] - before[key]) * share;
    for (const key of this.angles) out[key] = before[key] + turn(before[key], next[key]) * share;
    for (const key of this.steps) out[key] = share < 0.5 ? before[key] : next[key];
    // Lists of numbers, each going smoothly to the next, unless one of them is a different length.
    for (const key of this.lists) {
      const [from, to] = [before[key] ?? [], next[key] ?? []];
      out[key] = from.length === to.length ? from.map((value, index) => value + (to[index] - value) * share) : share < 0.5 ? from : to;
    }
    return out;
  }
}

/**
 * One room, from this computer's side. game is which game's rooms, as the server keeps each game's apart:
 * '' for High Five Racers, whose rooms came first, or 'sky-wings'. events: onChange() whenever who's here or
 * the connection changes, onGo({ level, length, racers }) as it starts, onMove(id, message) for where a
 * friend is, and onDone(id, message) as they finish. status is off, connecting, in, full, nobody (no game with
 * that code) or lost. A connection that's lost is made again by itself, for as long as it takes, and whatever
 * mattered that may have been lost with it, being ready or finished, is said again.
 */
export class FriendsRoom {
  constructor(game = '', events = {}) {
    this.game = game;
    this.events = events;
    this.status = 'off';
    this.code = null;
    this.members = [];
    // Whether the host's game is to be played together, rather than against each other, in the games with both.
    this.team = false;
    this.you = null;
    this.hello = null;
    this.socket = null;
    this.sentAt = {}; // When each kind of thing was last sent, as each is sent at most 10 times a second.
    this.racing = false; // In a race, which a connection lost for a moment and back again carries on with.
    this.readyToGo = false; // Waiting at the start, until it starts.
    this.finishedWith = null; // The finish, until the next start, in case it has to be said again.
    this.checkedAt = null;
    // Back from sleep, or with the wifi back, it doesn't wait for the next try.
    globalThis.addEventListener?.('online', () => this.wake());
    globalThis.document?.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.wake();
    });
  }

  get inRoom() {
    return this.status === 'in';
  }

  /** In a game, or getting back into it after losing the connection: still in it, as far as the game goes. */
  get joined() {
    return this.status === 'in' || (Boolean(this.you) && ['connecting', 'lost'].includes(this.status));
  }

  get me() {
    return this.members.find(({ id }) => id === this.you) ?? null;
  }

  get hosting() {
    return Boolean(this.me?.host);
  }

  /**
   * Joins the race with this code, or makes a new one with it, which the server says if it's already in use, and
   * then another code is tried. hello is { name, driver, level, laps }.
   */
  join(code, hello, { making = false, tried = 0 } = {}) {
    this.leave();
    this.code = code;
    this.hello = hello;
    this.making = making;
    this.codesTried = tried;
    this.tries = 0;
    // Back in a game this page was in, as after a reload: the same player, keeping their place.
    this.you = making ? null : savedId(this.game, code);
    this.connect();
  }

  connect() {
    this.status = 'connecting';
    this.events.onChange?.();
    let socket;
    try {
      // Coming back after losing the connection, with the same id, so friends still see the same car.
      const asking = this.you ? `?was=${encodeURIComponent(this.you)}` : this.making ? '?make=1' : '';
      // One of several on one screen is in a room kept in the page, not on the server: see core/seat.js.
      socket = new (SEAT ? SeatSocket : WebSocket)(`${RACE_SERVER}/room/${this.game ? `${this.game}/` : ''}${this.code}${asking}`);
    } catch {
      this.reconnect();
      return;
    }
    this.socket = socket;
    clearTimeout(this.connecting);
    this.connecting = setTimeout(() => {
      if (this.socket === socket && socket.readyState === WebSocket.CONNECTING) this.reconnect();
    }, CONNECT_WITHIN_MS);
    socket.addEventListener('open', () => {
      clearTimeout(this.connecting);
      this.tries = 0;
      this.heardAt = performance.now();
      this.pingedAt = this.heardAt;
      this.checkedAt = null;
      this.say({ t: 'hi', ...this.hello, racing: this.racing });
      // Whatever mattered and may have been lost with the last connection goes again.
      if (this.readyToGo) this.say({ t: 'ready' });
      if (this.finishedWith) this.say(this.finishedWith);
      clearInterval(this.pinger);
      this.pinger = setInterval(() => this.beat(), 1000);
    });
    socket.addEventListener('message', ({ data }) => this.hear(data));
    socket.addEventListener('close', () => {
      if (this.socket !== socket || this.status === 'full') return;
      this.reconnect();
    });
  }

  /**
   * A moment's break is put right by itself, with a new connection, as the same player. The old one isn't
   * waited for: one that died without closing could take a long time to say so.
   */
  reconnect() {
    const { socket } = this;
    this.socket = null;
    clearInterval(this.pinger);
    clearTimeout(this.connecting);
    try {
      socket?.close();
    } catch {
      // Already closing.
    }
    this.tries += 1;
    // Still trying, but after a while it says it can't get through.
    this.status = this.tries > RETRIES ? 'lost' : 'connecting';
    this.events.onChange?.();
    clearTimeout(this.retry);
    this.retry = setTimeout(() => this.connect(), Math.min(RETRY_MOST_MS, 600 * this.tries));
  }

  /** Back from sleep, or with the wifi back: tries again now, or checks the connection still works. */
  wake() {
    if (!this.code) return;
    if (this.status === 'in') {
      this.checkSoon();
    } else if (['connecting', 'lost'].includes(this.status) && !this.socket) {
      // Waiting for the next try: no need to wait.
      clearTimeout(this.retry);
      this.connect();
    }
  }

  /** After saying something that matters, the server should answer soon. If it doesn't, start again. */
  checkSoon(now = performance.now()) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.checkedAt = now;
    this.pingedAt = now;
    this.send('ping');
  }

  /** Asks the server now and then, and starts again if it has gone quiet. */
  beat(now = performance.now()) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    const { every, silent } = this.racing ? HEARTBEAT.racing : HEARTBEAT.waiting;
    const unanswered = this.checkedAt !== null && this.heardAt < this.checkedAt && now - this.checkedAt > ANSWER_WITHIN_MS;
    if (now - this.heardAt > silent || unanswered) {
      this.reconnect();
      return;
    }
    if (now - this.pingedAt >= every) {
      this.pingedAt = now;
      this.send('ping');
    }
  }

  lost() {
    this.socket = null;
    this.status = 'lost';
    this.racing = false;
    this.members = [];
    this.events.onChange?.();
  }

  hear(text) {
    this.heardAt = performance.now();
    if (text === 'pong') return;
    let message;
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    if (message.t === 'nobody') {
      // No game with that code just now: nothing to wait for, so nothing more is tried.
      this.status = 'nobody';
      this.socket?.close();
      this.socket = null;
      clearInterval(this.pinger);
      saveId(this.game, this.code, null);
      this.events.onChange?.();
    } else if (message.t === 'taken') {
      // Someone's using that code: another, then, unless that's happened again and again.
      if (this.codesTried + 1 >= NEW_CODE_TRIES) {
        this.lost();
        return;
      }
      this.join(newCode(), this.hello, { making: true, tried: this.codesTried + 1 });
    } else if (message.t === 'room') {
      this.making = false;
      this.status = 'in';
      this.you = message.you;
      saveId(this.game, this.code, this.you);
      this.members = message.members;
      this.team = Boolean(message.team);
      this.events.onChange?.();
    } else if (message.t === 'full') {
      this.status = 'full';
      this.socket?.close();
      this.socket = null;
      this.events.onChange?.();
    } else if (message.t === 'go') {
      this.readyToGo = false;
      this.events.onGo?.(message);
    } else if (['car', 'plane', 'score', 'hand', 'world', 'claimed', 'hit', 'pose', 'racket', 'ball', 'shot', 'runner', 'wiped', 'stand', 'ship', 'catcher', 'tank', 'walker', 'can', 'jigsaw', 'brush', 'trooper', 'eater', 'foes', 'tag'].includes(message.t)) {
      this.events.onMove?.(message.from, message);
    } else if (message.t === 'archer') {
      // Arrow Meadow: how a friend's bow is, and what they've let go.
      this.events.onMove?.(message.from, message);
    } else if (message.t === 'chick') {
      // Flap, Little Chick!: where a friend's chick is.
      this.events.onMove?.(message.from, message);
    } else if (message.t === 'lifter') {
      // Mighty Lift: how far up a friend's arm is.
      this.events.onMove?.(message.from, message);
    } else if (message.t === 'rider') {
      // Moto Mountain: where a friend's bike is on the road.
      this.events.onMove?.(message.from, message);
    } else if (message.t === 'balancer') {
      // Rooftop Rope: where a friend's walker is on the ropes.
      this.events.onMove?.(message.from, message);
    } else if (message.t === 'done') {
      this.events.onDone?.(message.from, message);
    }
  }

  send(text) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(text);
  }

  say(message) {
    this.send(JSON.stringify(message));
  }

  /** The name, driver or course has changed. */
  tell(hello) {
    this.hello = { ...this.hello, ...hello };
    this.say({ t: 'hi', ...this.hello, racing: this.racing });
  }

  ready() {
    this.racing = false;
    this.readyToGo = true;
    this.finishedWith = null;
    this.say({ t: 'ready' });
    this.checkSoon();
  }

  /** The host starts the race with whoever is ready. */
  go() {
    this.say({ t: 'go' });
  }

  /** Where the car or plane is, as kind car or plane, sent no more than 10 times a second. ms is how long since "GO!". */
  sendMove(kind, state, ms, now = performance.now()) {
    if (now - (this.sentAt[kind] ?? -Infinity) < SEND_EVERY_MS) return;
    this.sentAt[kind] = now;
    this.say({ t: kind, ms: Math.round(ms), ...state });
  }

  /**
   * Balloon Pop: this player's hand got to balloon k. Mighty Moves: their fighter has won round k. Whoever's
   * claim reaches the server first has it.
   */
  claim(k) {
    this.say({ t: 'claim', k });
  }

  /** Mighty Moves: their fighter's move, every one, as each lands on the friend's fighter: see cleanHit. */
  sendHit(hit, ms) {
    this.say({ t: 'hit', ms: Math.round(ms), ...hit });
  }

  /**
   * Playing together against the computer's: this player's shot has hit its number k, n times in all so far, as
   * their own game decides. Only the host's game hears it, as it runs them: see cleanTag.
   */
  sendTag(k, n) {
    this.say({ t: 'tag', k, n });
  }

  /** How many popped, or got right, so far, this long after "GO!". Only sent when it changes. */
  sendScore(n, ms) {
    this.say({ t: 'score', ms: Math.round(ms), n });
  }

  /** Finished, this long after "GO!". extra is how it went: n, how many were dropped, and w, 1 if all of them. */
  done(ms, extra = {}) {
    this.racing = false;
    this.finishedWith = { t: 'done', ms: Math.round(ms), ...extra };
    this.say(this.finishedWith);
    this.checkSoon();
  }

  leave() {
    clearTimeout(this.retry);
    clearTimeout(this.connecting);
    clearInterval(this.pinger);
    // Leaving on purpose, coming back is as someone new.
    if (this.code && this.status !== 'off') saveId(this.game, this.code, null);
    const { socket } = this;
    this.socket = null;
    if (socket) {
      try {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: 'leave' }));
        socket.close();
      } catch {
        // Already closing.
      }
    }
    this.status = 'off';
    this.racing = false;
    this.readyToGo = false;
    this.finishedWith = null;
    this.members = [];
    this.team = false;
    this.you = null;
    this.code = null;
    this.events.onChange?.();
  }
}
