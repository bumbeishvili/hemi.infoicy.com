// The grown-ups' settings as they're saved and read back: a game's own settings on top of the shared ones, and
// the old ways some games came, which are dropped once so that the games as they come now reach everyone.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { beforeEach, test } from 'node:test';
import { OLD_DEFAULTS, appliesAtOnce, loadSettings, saveSettings } from '../../core/settings.js';

const KEY = 'camera-games-settings';
let stored = {};
globalThis.localStorage = {
  getItem: (name) => stored[name] ?? null,
  setItem: (name, value) => {
    stored[name] = String(value);
  },
};
const save = (settings) => {
  stored[KEY] = JSON.stringify(settings);
};
const saved = () => JSON.parse(stored[KEY]);

beforeEach(() => {
  stored = {};
});

test('a game comes with its own settings on top of the shared ones, and what was saved on top of both', () => {
  const fresh = loadSettings({ flapFox: 'catch' });
  assert.deepEqual([fresh.hands, fresh.sound, fresh.voice, fresh.language, fresh.flapFox], ['right', true, true, 'en', 'catch']);
  save({ hands: 'left', voice: false, levels: { 'chick-flap': 4 } });
  const settings = loadSettings({ flapFox: 'catch' });
  assert.deepEqual([settings.hands, settings.voice, settings.sound, settings.flapFox, settings.levels], ['left', false, true, 'catch', { 'chick-flap': 4 }]);
});

test('the way a game came before, saved along with everything else, is dropped, so the game comes as it does now', () => {
  // A child who had played Flap, Little Chick! has the old fox saved, though nobody chose him.
  save({ hands: 'left', flapFox: 'tumble', levels: { 'chick-flap': 4 } });
  const settings = loadSettings({ flapFox: 'catch' });
  assert.equal(settings.flapFox, 'catch');
  // Nothing else that was saved goes with it.
  assert.deepEqual([settings.hands, settings.levels], ['left', { 'chick-flap': 4 }]);
  assert.equal(settings.settled.flapFox, true);
});

test('it is dropped once: a grown-up who then chooses the old way keeps it', () => {
  save({ flapFox: 'tumble' });
  const settings = loadSettings({ flapFox: 'catch' });
  assert.equal(settings.flapFox, 'catch');
  // In the panel, the fox who never catches is chosen, and saved.
  settings.flapFox = 'tumble';
  saveSettings(settings);
  assert.equal(saved().flapFox, 'tumble');
  assert.equal(loadSettings({ flapFox: 'catch' }).flapFox, 'tumble');
  // And again after that, and in another game, which saves everything it was given.
  const elsewhere = loadSettings({ ropeCount: 6 });
  saveSettings(elsewhere);
  assert.equal(loadSettings({ flapFox: 'catch' }).flapFox, 'tumble');
});

test('a choice that was never the old way is kept, and so is one saved before the page was opened again and again', () => {
  save({ flapFox: 'wait' });
  assert.equal(loadSettings({ flapFox: 'catch' }).flapFox, 'wait');
  // Read twice with nothing saved in between: still dropped, and nothing else is.
  save({ flapFox: 'tumble', sound: false });
  loadSettings({ flapFox: 'catch' });
  const second = loadSettings({ flapFox: 'catch' });
  assert.deepEqual([second.flapFox, second.sound], ['catch', false]);
});

test('what the tests save is what they chose: saved as settled, the old way stays', () => {
  save({ flapFox: 'tumble', settled: true });
  const settings = loadSettings({ flapFox: 'catch' });
  assert.equal(settings.flapFox, 'tumble');
  assert.equal(settings.settled, true);
});

test('every old way that is dropped is named with what it was', () => {
  assert.ok(Object.keys(OLD_DEFAULTS).length >= 1);
  for (const [name, old] of Object.entries(OLD_DEFAULTS)) {
    assert.equal(typeof name, 'string');
    assert.notEqual(old, undefined);
    save({ [name]: old });
    assert.equal(loadSettings({ [name]: 'new' })[name], 'new', name);
  }
});

test('with nothing saved, or something that can\'t be read, the game comes as it comes', () => {
  assert.equal(loadSettings({ flapFox: 'catch' }).flapFox, 'catch');
  stored[KEY] = 'not json';
  assert.equal(loadSettings({ flapFox: 'catch' }).flapFox, 'catch');
});

test('no two games save a setting under one name and have it come two ways', () => {
  // Settings are saved all together, with everything the game on the screen has. So where two games share a
  // name and come differently, whichever was played last decides for the other: Leap Trail and Smoothie Stand
  // came to be medium under pace while Balloon Pop stayed slow, and Moto Mountain and Rooftop Rope saved the
  // other body games' move size as medium.
  const games = new URL('../../games/', import.meta.url);
  const comes = new Map();
  for (const game of readdirSync(games)) {
    let source;
    try {
      source = readFileSync(new URL(`${game}/main.js`, games), 'utf8');
    } catch {
      continue;
    }
    for (const [, block] of source.matchAll(/(?:const DEFAULTS = |defaults: )\{([\s\S]*?)\}[;,]/g)) {
      for (const [, name, value] of block.matchAll(/(\w+): ('[^']*'|-?[\d.]+|true|false)/g)) {
        if (!comes.has(name)) comes.set(name, new Map());
        comes.get(name).set(game, value);
      }
    }
  }
  assert.ok(comes.size > 60, `only found ${comes.size} settings`);
  // High Five Racers' reach is another setting altogether, with choices of its own, from before the others had
  // theirs: each game takes a choice it doesn't know as its own way of coming.
  const known = new Set(['reach']);
  const twoWays = [...comes].filter(([name, games]) => !known.has(name) && new Set(games.values()).size > 1).map(([name, games]) => `${name}: ${[...games].map(([game, value]) => `${game} ${value}`).join(', ')}`);
  assert.deepEqual(twoWays, []);
});

test('some settings go on to a game that is being played at once, and the rest start it again', () => {
  // In every game: the sound, the voice and its language, the hand in play, how open a hand has to be and its
  // shapes, and how big a move has to be.
  for (const name of ['sound', 'voice', 'language', 'hands', 'strictness', 'shapes', 'moveSize']) assert.equal(appliesAtOnce(name), true, name);
  // Together or against each other is for a game with friends, whatever a game calls it.
  assert.equal(appliesAtOnce('ropeFriends'), true);
  assert.equal(appliesAtOnce('tankFriends', []), true);
  // A game's own, the ones that tune how its movement is read or helped.
  assert.equal(appliesAtOnce('ropeLift', ['ropeLift']), true);
  assert.equal(appliesAtOnce('ropeLift'), false);
  // The rest start the game again: what the game is, how long it is, and what can be lost in it.
  for (const name of ['maths', 'balloons', 'ropeDrops', 'flapFox', 'laps', 'fighter']) assert.equal(appliesAtOnce(name, ['reach', 'pace']), false, name);
  // And in a game that's laid out for one hand, the hand in play does too.
  assert.equal(appliesAtOnce('hands', [], ['hands']), false);
  assert.equal(appliesAtOnce('hands', ['flapRise'], []), true);
});

test('every game says which of its own settings go on at once, and each of them is one of its settings', () => {
  const games = new URL('../../games/', import.meta.url);
  let count = 0;
  for (const game of readdirSync(games)) {
    let source;
    try {
      source = readFileSync(new URL(`${game}/main.js`, games), 'utf8');
    } catch {
      continue;
    }
    count += 1;
    const lists = [...source.matchAll(/atOnce: \[([^\]]*)\]/g)];
    assert.equal(lists.length, 1, `${game} has one list of what goes on at once`);
    const names = [...lists[0][1].matchAll(/'(\w+)'/g)].map(([, name]) => name);
    const own = new Set();
    for (const [, block] of source.matchAll(/(?:const DEFAULTS = |defaults: )\{([\s\S]*?)\}[;,]/g)) {
      for (const [, name] of block.matchAll(/(\w+): /g)) own.add(name);
    }
    for (const name of names) {
      assert.ok(own.has(name), `${game}: ${name} is one of its settings`);
      // What can be lost, and what the game is, are never among them.
      assert.equal(/Friends$/.test(name), false, `${game}: ${name} needn't be listed`);
    }
  }
  assert.equal(count, 29);
});
