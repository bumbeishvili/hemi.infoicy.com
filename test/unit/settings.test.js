// The grown-ups' settings as they're saved and read back: a game's own settings on top of the shared ones, and
// the old ways some games came, which are dropped once so that the games as they come now reach everyone.
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { OLD_DEFAULTS, loadSettings, saveSettings } from '../../core/settings.js';

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
