// Swamp Splash: every line the game can say has a rendered voice file, in both languages, and nothing is rendered
// that it can't say. The lines are read out of main.js, where they're kept, as the page itself can't run here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const folder = new URL('../../games/swamp-splash/audio/voice/', import.meta.url);
const source = readFileSync(new URL('../../games/swamp-splash/main.js', import.meta.url), 'utf8');

test('every line Swamp Splash says has its voice file, in English and in Georgian', () => {
  const block = source.match(/const SAY = \{([\s\S]+?)\n\};/);
  assert.ok(block, 'main.js keeps what it says in SAY');
  const said = [...block[1].matchAll(/: '([^']+)'/g)].map(([, text]) => text);
  assert.ok(said.length >= 10, `only found ${said.length} lines`);
  const lines = JSON.parse(readFileSync(new URL('lines.json', folder), 'utf8'));
  const known = new Map(lines.map((line) => [line.text, line]));
  for (const text of said) {
    const line = known.get(text);
    assert.ok(line, `"${text}" is in lines.json`);
    assert.match(line.ka, /[ა-ჿ]/, `"${text}" has its Georgian`);
    for (const language of ['en', 'ka']) assert.ok(existsSync(new URL(`${language}/${line.id}.ogg`, folder)), `${language}/${line.id}.ogg`);
  }
  // Nothing rendered that the game can no longer say.
  assert.deepEqual(lines.map((line) => line.text).filter((text) => !said.includes(text)), []);
});

test('the words shown on the screen as something is seen have their Georgian beside them', () => {
  const block = source.match(/const SEEN_WORDS = \{([\s\S]+?)\n\};/);
  assert.ok(block, 'main.js keeps them in SEEN_WORDS');
  const pairs = [...block[1].matchAll(/\['([^']+)', '([^']+)'\]/g)];
  assert.ok(pairs.length >= 4);
  for (const [, english, georgian] of pairs) assert.match(georgian, /[ა-ჿ]/, `"${english}" has its Georgian`);
});
