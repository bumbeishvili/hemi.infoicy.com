// What playing with friends looks like, in every game that can be played with them: a box on the title card for
// making or joining a race, a flight, a game, a fight or a battle, the screen for waiting at the start, and how
// everyone did on the finish card. Each game gives its own words, and what's sent and shown about each friend. The connection
// itself is in friends.js.
//
// Once the box is open, by its button or a friend's link, the title card shows nothing else, over the game
// dimmed and blurred behind it: making a game, or typing a friend's 3-letter code, which joins as soon as it's
// typed. Then the code, who's here, a name if they'd like one, and the game's own start button, moved in under
// them. Back, or leaving, goes back to the usual title card.
//
// The box also has the way to play on this computer, two in front of one camera with the screen split between
// them: a link to together.html, which shows a copy of the game for each. In one
// of those copies, a seat (core/seat.js), the box is open from the start and already in the room the seats
// share, and it says which player this is and where they stand in place of the code and the name.
import { byId as characterWithId, ROSTER } from './body/roster.js';
import { CODE_LENGTH, mostIn, validCode } from '../server/race-room.js';
import { codeInLink, FriendsRoom, linkFor, newCode } from './friends.js';
import { MOST_SEATS, SEAT, placeOf, seatName } from './seat.js';

const NAME_KEY = 'camera-games-race-name';
const NOBODY = 'There’s no game with that code just now. Check it with your friend.';
// A friend who has gone for this long has really gone, and their car or plane goes too. Someone who lost the
// connection for a moment is back well before.
const GONE_AFTER_MS = 4000;
const byId = (id) => document.getElementById(id);
export const ordinal = (place) => ['1st', '2nd', '3rd', '4th'][place - 1] ?? `${place}th`;
// To a tenth of a second, as friends often finish within a second of each other: 0:50.3.
export const time = (ms) => {
  const tenths = Math.round(ms / 100);
  const seconds = Math.floor(tenths / 10);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}.${tenths % 10}`;
};

function savedName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveName(name) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Private windows can refuse. The name is just typed again.
  }
}

// In a game that can be played together or against each other: the two choices, which whoever made the game makes,
// and everyone else is shown.
const teamChoice = (words) => `
      <fieldset id="friends-teams" class="friends-teams">
        <legend>${words.teamLegend ?? 'How to play'}</legend>
        <label><input type="radio" name="friends-team" value="together"> ${words.together}</label>
        <label><input type="radio" name="friends-team" value="against"> ${words.against}</label>
        <p id="friends-teams-whose" class="friends-teams-whose" hidden></p>
      </fieldset>`;

/** The game's own folder, as in /games/mighty-lift/index.html, which is what together.html is told to show. */
const gameFolder = () => location.pathname.split('/').filter(Boolean).at(location.pathname.endsWith('/') ? -1 : -2) ?? '';

// Playing on this computer, with the screen split: a link for each number of players there can be, which is two.
const seatLinks = (game) => {
  const page = new URL('../together.html', import.meta.url);
  const debug = new URLSearchParams(location.search).has('debug') ? '&debug' : '';
  const links = [];
  for (let players = 2; players <= Math.min(MOST_SEATS, mostIn(game)); players += 1) {
    links.push(`<a class="friends-button" href="${page.pathname}?game=${gameFolder()}&players=${players}${debug}">${players} players</a>`);
  }
  return `
      <div id="friends-seats" class="friends-seats">
        <p class="friends-or">or on this computer</p>
        <div class="friends-seat-links">${links.join('')}</div>
        <p class="friends-how">With one camera: the screen is split, and each player has a part of it, and of the camera’s picture.</p>
      </div>`;
};

const box = (words, teams, seats) => `
  <button id="friends-toggle" class="friends-toggle" type="button" aria-expanded="false" aria-controls="friends-box">${words.toggle}</button>
  <div id="friends-box" class="friends-box" hidden>
    <h2 class="friends-title">${words.toggle}</h2>
    <div id="friends-out" class="friends-out">
      <button id="friends-make" class="friends-button" type="button">${words.make}</button>
      <p class="friends-or">or</p>
      <form id="friends-join" class="friends-join">
        <label class="friends-field">${words.codeLabel} <input id="friends-code" maxlength="${CODE_LENGTH}" autocomplete="off" spellcheck="false" autocapitalize="characters"></label>
      </form>${seats}
      <button id="friends-back" class="friends-link" type="button">Back</button>
    </div>
    <div id="friends-in" class="friends-in" hidden>
      <p id="seat-banner" class="seat-banner" hidden></p>
      <div class="friends-code-row">
        <p class="friends-code-line">${words.codeName} <strong id="friends-code-shown"></strong></p>
        <button id="friends-copy" class="friends-button" type="button">Copy the link</button>
      </div>
      <ul id="friends-here" class="friends-here"></ul>
      <p id="friends-lonely" class="friends-lonely">Waiting for a friend to join…</p>
      <label class="friends-field friends-name">Your name <input id="friends-name" maxlength="16" autocomplete="off" spellcheck="false" placeholder="if you like"></label>${teams ? teamChoice(words) : ''}
      <p id="friends-how" class="friends-how">${words.how}</p>
      <div id="friends-start" class="friends-start"></div>
      <button id="friends-leave" class="friends-link" type="button">${words.leave}</button>
    </div>
    <p id="friends-status" class="friends-status" role="status"></p>
    <p class="small-print">${words.privacy}</p>
  </div>`;

const waitingCard = (words) => `
  <div class="card title-card">
    <h2>Waiting for your friends</h2>
    <ul id="friends-waiting" class="friends-here"></ul>
    <p id="friends-wait-status" class="friends-status" role="status"></p>
    <button id="friends-now" class="big-button" type="button">Start now</button>
    <button id="friends-alone" class="friends-link" type="button">${words.alone}</button>
  </div>`;

export class FriendsPanel {
  /**
   * game is the server's name for this game's rooms, '' or 'sky-wings', and linkKey the word in a link, as in
   * #race=ABC234. words is what's on the screen: see RACE_WORDS in High Five Racers for each. The game says:
   *   hello()          what friends are told about this player, apart from the name: { driver, level, length }
   *   screen()         which screen it's on, and portraits() the characters' pictures
   *   onGone(friend)   a friend has gone in the middle, and their car or plane with them
   *   onBack(friend)   a friend who had gone is here again in the same game, as after a connection lost for
   *                    longer than a moment: a game that says this puts back what onGone took away, and the
   *                    friend counts as here again. Unless said, a friend who has gone stays gone for that game
   *   resultText(result)   how someone did, from { ms, won, dropped }, for the finish card
   *   onMove(id, message)  something came from a friend's game: where they are, or their score. Unless
   *                        said, where they are goes to the track follow() gave for them
   *   rank(a, b)       which of two results is better, less than 0 for a: unless said, those who won by
   *                    time, then the rest by how many they dropped. Equal ones share a place
   *   onRoom()         who's here has changed, as when a friend comes or chooses another character
   * titles is { first, other }, the finish card's title for coming first or not, or null to leave it be.
   * startAfter, waitingBefore and resultsAfter are where the box, the waiting screen and the results go.
   *
   * A game that can be played together or against each other gives teams, { get(), set(choice) }, which reads and
   * keeps the grown-ups' choice, 'together' or 'against', and in words: together and against, what each choice is
   * called, howTogether, what to do when it's together, and teamTitle, the finish card's title then. Whoever made
   * the game chooses, everyone is shown, and the game that starts has team: true when it's together. Then nobody
   * is placed on the finish card: everyone is on the same side.
   */
  constructor({ game = '', linkKey = 'race', words, hello, screen, portraits, onGone = () => {}, onBack = null, onMove = null, onRoom = () => {}, rank = null, resultText, titles = null, teams = null, startAfter, waitingBefore, resultsAfter, finishTitle }) {
    Object.assign(this, { linkKey, words, helloFor: hello, screen, portraits, onGone, onBack, onRoom, resultText, titles, teams });
    this.rank = rank ?? ((a, b) => Number(b.won) - Number(a.won) || (a.won ? a.ms - b.ms : b.dropped - a.dropped || a.ms - b.ms));
    this.current = null; // The race or flight with friends being played, once it has started: see start().
    this.results = new Map(); // id: { ms, won, dropped }, how each friend did.
    this.go = null;
    this.room = new FriendsRoom(game, {
      onChange: () => this.changed(),
      onGo: (message) => this.start(message),
      onMove: (id, message) => (onMove ? onMove(id, message) : this.current?.tracks.get(id)?.push(message, performance.now())),
      onDone: (id, message) => this.heardDone(id, message),
    });

    const friends = document.createElement('div');
    friends.className = 'friends';
    friends.innerHTML = box(words, teams, SEAT ? '' : seatLinks(game));
    startAfter.after(friends);
    this.friendsBox = friends;
    // The game's own start button, which goes into the box while in a race, and back again after.
    this.startButton = byId('start');
    const waiting = document.createElement('section');
    waiting.id = 'screen-friends';
    waiting.className = 'screen friends-screen';
    waiting.innerHTML = waitingCard(words);
    waitingBefore.before(waiting);
    this.resultsList = document.createElement('ol');
    this.resultsList.className = 'friends-results';
    this.resultsList.hidden = true;
    resultsAfter?.after(this.resultsList);
    this.finishTitle = finishTitle;
    this.finishWords = finishTitle?.textContent ?? '';

    byId('friends-name').value = savedName();
    byId('friends-name').addEventListener('change', () => {
      saveName(this.name);
      // Still connecting, it's kept for when the connection is up, as when it's typed straight after opening a link.
      if (this.room.status !== 'off') this.room.tell(this.hello());
    });
    byId('friends-toggle').addEventListener('click', () => {
      this.openBox(true);
      byId('friends-code').focus();
    });
    byId('friends-back').addEventListener('click', () => {
      this.openBox(false);
      this.status('');
      byId('friends-toggle').focus();
    });
    byId('friends-make').addEventListener('click', () => this.join(newCode(), { making: true }));
    // A friend's code joins as soon as it's all typed, with no button to find.
    byId('friends-code').addEventListener('input', () => this.typedCode(false));
    byId('friends-join').addEventListener('submit', (event) => {
      event.preventDefault();
      this.typedCode(true);
    });
    for (const input of friends.querySelectorAll('input[name="friends-team"]')) {
      input.addEventListener('change', () => {
        if (!input.checked) return;
        this.teams.set(input.value);
        // The friends hear at once, so what they're shown is what it'll be.
        if (this.room.status !== 'off') this.room.tell(this.hello());
        this.showTeams();
      });
    }
    this.showTeams();
    byId('friends-copy').addEventListener('click', () => this.copyLink());
    byId('friends-leave').addEventListener('click', () => this.leave());
    byId('friends-now').addEventListener('click', () => this.room.go());
    byId('friends-alone').addEventListener('click', () => {
      const { go } = this;
      this.leave();
      // Back on the title card after, it's the usual one.
      this.openBox(false);
      go?.();
    });

    if (SEAT) {
      this.takeSeat();
      return;
    }
    // A link from a friend goes straight in.
    const code = codeInLink(location.hash, linkKey);
    if (code) {
      this.openBox(true);
      this.join(code);
    }
  }

  /**
   * One of several on one screen: straight into the room the seats share, as its player, by number. The first
   * seat goes in first, so that it's the one whose choices count, as whoever makes a game with friends is.
   */
  takeSeat() {
    const { index, code, host } = SEAT;
    byId('friends-name').value = seatName(index);
    const banner = byId('seat-banner');
    banner.hidden = false;
    banner.textContent = `${seatName(index)}, ${placeOf(index)}`;
    byId('friends-how').textContent = `Stand in your own part of the camera’s picture. Then each of you presses the button in your own part of the screen.${SEAT.onePicture ? ' While you play, you’re both in one picture.' : ''}`;
    document.querySelector('#screen-friends h2').textContent = 'Waiting for the others';
    this.openBox(true);
    if (index === 0) this.join(code);
    else host.hosted.then(() => this.join(code));
  }

  get name() {
    return byId('friends-name').value.replace(/\s+/g, ' ').trim().slice(0, 16);
  }

  /** A friend's code, as it's typed: it joins once it's all there. done is Enter, when a short one is wrong too. */
  typedCode(done) {
    const code = byId('friends-code').value.replace(/\s+/g, '').toUpperCase();
    if (code.length < CODE_LENGTH && !done) {
      this.status('');
      return;
    }
    if (validCode(code) && code.length === CODE_LENGTH) this.join(code);
    else this.status(this.words.badCode);
  }

  /** What friends are told about this player, and the course it would be on if they host it. */
  hello() {
    const hello = { name: this.name, ...this.helloFor() };
    return this.teams ? { ...hello, team: this.teams.get() === 'together' ? 1 : 0 } : hello;
  }

  /** Whether the game about to be played is together: the host's choice, once in a game, and this child's until then. */
  get together() {
    if (!this.teams) return false;
    return this.room.joined && !this.room.hosting ? this.room.team : this.teams.get() === 'together';
  }

  /**
   * The choice of together or against, as it stands. Whoever made the game can change it. Everyone else sees what
   * they chose, and can't. What to do next is said for whichever it is.
   */
  showTeams() {
    if (!this.teams) return;
    const { room, words } = this;
    const theirs = room.joined && !room.hosting;
    const chosen = this.together ? 'together' : 'against';
    for (const input of this.friendsBox.querySelectorAll('input[name="friends-team"]')) {
      input.checked = input.value === chosen;
      input.disabled = theirs;
    }
    const whose = byId('friends-teams-whose');
    whose.hidden = !theirs;
    const host = room.members.find((member) => member.host);
    whose.textContent = theirs ? `${host?.name || 'Whoever made the game'} chose.` : '';
    // A seat on a split screen has its own words there: see takeSeat.
    if (!SEAT) byId('friends-how').innerHTML = this.together && words.howTogether ? words.howTogether : words.how;
    this.friendsBox.dataset.team = chosen;
  }

  /** Open, the title card shows only the box: see data-friends-box in base.css. */
  openBox(open) {
    byId('friends-box').hidden = !open;
    byId('friends-toggle').setAttribute('aria-expanded', String(open));
    document.body.toggleAttribute('data-friends-box', open);
  }

  /** In a race, the game's start button is in the box, under who's here. Out of one, it's back where it was. */
  placeStart(inRoom) {
    const slot = byId('friends-start');
    const { startButton } = this;
    if (!startButton) return;
    if (inRoom && startButton.parentElement !== slot) slot.append(startButton);
    else if (!inRoom && startButton.parentElement === slot) this.friendsBox.before(startButton);
  }

  /** making is a new game, which gets another code if this one is in use. */
  join(code, { making = false } = {}) {
    // A seat's name is its player's number, which isn't the name to keep for playing with friends.
    if (!SEAT) saveName(this.name);
    this.room.join(code, this.hello(), { making });
    history.replaceState(null, '', `#${this.linkKey}=${code}`);
  }

  leave() {
    this.room.leave();
    clearTimeout(this.goneTimer);
    this.current = null;
    this.go = null;
    history.replaceState(null, '', location.pathname + location.search);
  }

  async copyLink() {
    const link = linkFor(this.room.code, this.linkKey);
    try {
      await navigator.clipboard.writeText(link);
      this.status('Link copied. Send it to a friend.');
    } catch {
      this.status(link);
    }
  }

  status(text) {
    byId('friends-status').textContent = text;
  }

  /**
   * Ready to start: with friends, wait until everyone's ready, or the host starts. go() starts the
   * countdown. False without friends, to start at once as usual.
   */
  holdStart(go) {
    // Getting back in after losing the connection for a moment is still with friends: ready goes when it's back.
    if (!this.room.joined) {
      this.current = null;
      return false;
    }
    this.go = go;
    this.current = null;
    this.room.tell(this.hello());
    this.room.ready();
    this.changed();
    return true;
  }

  /**
   * It starts, for those in it, on the host's course. Each friend is { id, key, spec, slot }, spec being the
   * character they chose with their own name, and slot their place in the order everyone has.
   */
  start({ level, laps, length, mode, team = 0, racers, seed = 0 }) {
    if (!this.go || !racers.includes(this.room.you) || this.screen() !== 'waiting') return;
    const others = racers.filter((id) => id !== this.room.you);
    const friends = others.map((id) => {
      const member = this.room.members.find((each) => each.id === id) ?? { id, name: '', driver: '' };
      const character = characterWithId(member.driver) ?? ROSTER[0];
      const spec = { ...character, key: `friend-${id}`, name: member.name || character.name, nameKa: member.name || character.nameKa };
      return { id, key: spec.key, spec, slot: racers.indexOf(id) };
    });
    const size = length ?? laps;
    // Who hosts as it starts, as Balloon Pop's host runs the balloons everyone plays with.
    const host = this.room.members.find((member) => member.host)?.id ?? racers[0];
    this.current = { level, length: size, laps: size, mode, team: Boolean(this.teams && team), seed, friends, mySlot: racers.indexOf(this.room.you), racers, host, hosting: host === this.room.you, tracks: new Map() };
    this.results = new Map();
    this.room.racing = true;
    const { go } = this;
    this.go = null;
    go();
  }

  /** Where this friend is comes in to this track: see Track in friends.js. */
  follow(id, track) {
    this.current?.tracks.set(id, track);
  }

  /** Where the child's car or plane is, as kind car or plane. */
  sendMove(kind, state, ms) {
    if (this.current && this.room.inRoom) this.room.sendMove(kind, state, ms);
  }

  /** Balloon Pop: the child's hand got to balloon k first, as far as this computer can tell. Mighty Moves: round k. */
  claim(k) {
    if (this.current && this.room.inRoom) this.room.claim(k);
  }

  /** Playing together against the computer's: the child's shot has hit its number k, n times in all so far. */
  sendTag(k, n) {
    if (this.current && this.room.inRoom) this.room.sendTag(k, n);
  }

  /** Mighty Moves: the child's fighter made a move at their friend's, this long after "GO!". */
  sendHit(hit, ms) {
    if (this.current && this.room.inRoom) this.room.sendHit(hit, ms);
  }

  /** The child's score so far, popped or right, for friends' scoreboards. */
  sendScore(n, ms) {
    if (this.current && this.room.inRoom) this.room.sendScore(n, ms);
  }

  /** The child has finished, this long after "GO!". extra is { w: 1 if they won, n: how many they dropped }. */
  finished(ms, extra = {}) {
    if (!this.current) return;
    // Rounded once, here, so that the time on this card and on friends' cards is the same to the tenth.
    const whole = Math.round(ms);
    this.results.set(this.room.you, { ms: whole, won: extra.w !== 0, dropped: extra.n ?? 0 });
    this.room.done(whole, extra);
  }

  heardDone(id, { ms, w, n }) {
    if (!this.current?.racers.includes(id)) return;
    this.results.set(id, { ms, won: w !== 0, dropped: n ?? 0 });
    if (this.screen() === 'finish') this.showResults();
  }

  /** How everyone did so far, on the finish card: those who won by time, then the rest by how many they dropped. */
  showResults() {
    const { current } = this;
    this.resultsList.hidden = !current;
    document.body.toggleAttribute('data-friends-race', Boolean(current));
    if (!current) {
      if (this.finishTitle && this.titles) this.finishTitle.textContent = this.finishWords;
      return;
    }
    const nameOf = (id) => {
      if (id === this.room.you) return 'You';
      return current.friends.find((friend) => friend.id === id)?.spec.name ?? 'A friend';
    };
    // On a tie, the child sees themselves first.
    const you = (id) => Number(id === this.room.you);
    const finished = [...this.results.entries()].sort(([idA, a], [idB, b]) => this.rank(a, b) || you(idB) - you(idA));
    // Equal results share a place: two on 12 are both 2nd if someone has 15.
    const placeOf = (result) => 1 + finished.filter(([, other]) => this.rank(other, result) < 0).length;
    // Together, everyone is on the same side, so nobody is placed.
    const placed = (result) => (current.team ? '' : ordinal(placeOf(result)));
    this.resultsList.classList.toggle('is-team', current.team);
    const rows = finished.map(([id, result]) => `<li class="${id === this.room.you ? 'is-you' : ''}"><span class="friends-place">${placed(result)}</span> <span class="friends-who"></span> <span class="friends-time"></span></li>`);
    // Anyone who has gone before finishing is left off.
    const gone = (id) => current.friends.some((friend) => friend.id === id && friend.gone);
    const still = current.racers.filter((id) => !this.results.has(id) && !gone(id));
    for (const id of still) rows.push(`<li class="is-racing"><span class="friends-place">…</span> <span class="friends-who"></span> <span class="friends-time">${this.words.still}</span></li>`);
    this.resultsList.innerHTML = rows.join('');
    // Names go in as text, never as markup.
    [...finished.map(([id]) => id), ...still].forEach((id, index) => {
      const row = this.resultsList.children[index];
      row.querySelector('.friends-who').textContent = nameOf(id);
      if (this.results.has(id)) row.querySelector('.friends-time').textContent = this.resultText(this.results.get(id));
    });
    const mine = this.results.get(this.room.you);
    const place = mine ? placeOf(mine) : 0;
    if (this.finishTitle && current.team && this.words.teamTitle) this.finishTitle.textContent = this.words.teamTitle;
    else if (this.finishTitle && this.titles) this.finishTitle.textContent = place === 1 ? this.titles.first : this.titles.other;
  }

  /** Who's here, on the title card and the waiting screen, and anyone who's gone in the middle. */
  changed() {
    const { room, words } = this;
    // Getting back in after losing the connection, it stays as it was, saying so.
    const inRoom = room.joined;
    byId('friends-out').hidden = inRoom;
    byId('friends-in').hidden = !inRoom;
    byId('friends-lonely').hidden = !inRoom || room.members.length > 1;
    this.placeStart(inRoom);
    byId('friends-code-shown').textContent = room.code ?? '';
    // A new game whose code was in use has another, which the link says too.
    if (room.code && codeInLink(location.hash, this.linkKey) !== room.code) history.replaceState(null, '', `#${this.linkKey}=${room.code}`);
    if (inRoom) byId('friends-code').value = '';
    const said = { connecting: room.you ? 'Reconnecting…' : 'Connecting…', full: words.full, lost: words.lost, nobody: NOBODY }[room.status] ?? '';
    this.status(said);
    this.fillList(byId('friends-here'), false);
    this.fillList(byId('friends-waiting'), true);
    this.showTeams();

    // Waiting at the start: the game shows that screen as soon as this has said to wait.
    const waiting = Boolean(this.go);
    byId('friends-now').hidden = !room.hosting;
    let text = '';
    if (room.status !== 'in') text = said || words.left;
    else if (room.members.length < 2) text = 'Nobody else is here yet. Send them the link.';
    else text = room.hosting ? 'It starts when everyone is ready, or press Start now.' : 'It starts when everyone is ready.';
    byId('friends-wait-status').textContent = waiting ? text : '';

    if (this.current) this.watchForGone();
    this.onRoom();
  }

  /**
   * A friend who has gone in the middle takes their car or plane with them, unless they're back within a few
   * seconds, as they are after losing the connection for a moment. One back later than that is taken back by a
   * game that says how (onBack).
   */
  watchForGone() {
    const now = performance.now();
    for (const friend of this.current.friends) {
      const here = this.room.members.some((member) => member.id === friend.id);
      if (friend.gone) {
        // Back in the same game after longer than a moment: a game that can take them back does.
        if (!here || !this.onBack) continue;
        friend.gone = false;
        friend.missingSince = null;
        this.onBack(friend);
        if (this.screen() === 'finish') this.showResults();
        continue;
      }
      if (here) friend.missingSince = null;
      else friend.missingSince ??= now;
    }
    clearTimeout(this.goneTimer);
    if (this.current.friends.some((friend) => !friend.gone && friend.missingSince != null)) {
      this.goneTimer = setTimeout(() => this.dropGone(), GONE_AFTER_MS);
    }
  }

  dropGone() {
    if (!this.current) return;
    const now = performance.now();
    let dropped = false;
    for (const friend of this.current.friends) {
      if (friend.gone || friend.missingSince == null || now - friend.missingSince < GONE_AFTER_MS - 50) continue;
      friend.gone = true;
      this.onGone(friend);
      dropped = true;
    }
    if (dropped && this.screen() === 'finish') this.showResults();
    this.watchForGone();
  }

  fillList(list, withReady) {
    const { room } = this;
    const portraits = this.portraits() ?? {};
    list.replaceChildren(...room.members.map((member) => {
      const row = document.createElement('li');
      const character = characterWithId(member.driver) ?? ROSTER[0];
      const face = document.createElement('img');
      face.alt = '';
      face.src = portraits[character.id] ?? '';
      const name = document.createElement('span');
      name.className = 'friends-who';
      name.textContent = `${member.name || character.name}${member.id === room.you ? ' (you)' : ''}`;
      row.append(face, name);
      if (withReady) {
        const mark = document.createElement('span');
        mark.className = 'friends-mark';
        mark.textContent = member.ready ? 'Ready' : member.racing ? this.words.busy : 'Not ready yet';
        row.classList.toggle('is-ready', member.ready);
        row.append(mark);
      }
      return row;
    }));
  }
}
