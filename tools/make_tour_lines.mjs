// Writes the list of voice lines for Giraffe's World Tour, games/world-tour/audio/voice/lines.json, from what the
// game says (games/world-tour/words.js) and the countries' names (games/world-tour/flags.js):
//
//     node tools/make_tour_lines.mjs
//
// Then the voice files are rendered from it, as for any game: see tools/render_voice.py and render_voice_ka.py.
import { writeFileSync } from 'node:fs';
import { FLAGS } from '../games/world-tour/flags.js';
import { allLines } from '../games/world-tour/words.js';

// Giraffe asks where each country is, and names it, in his own voice, as in the other games he's in.
const GIRAFFE = { voice: 'am_michael', kaVoice: 'ka-GE-GiorgiNeural', kaPitch: 0 };
// What the English voice is given to read where a name's spelling would trip it up.
const SPEAK = { Türkiye: 'Turkey' };

const lines = allLines(FLAGS).map(({ id, text, ka, giraffe }) => {
  let speak = text.replaceAll('’', "'");
  for (const [name, said] of Object.entries(SPEAK)) speak = speak.replace(name, said);
  return { id, text, ...(speak === text ? {} : { speak }), ka, ...(giraffe ? GIRAFFE : {}) };
});
const out = new URL('../games/world-tour/audio/voice/lines.json', import.meta.url);
writeFileSync(out, `[\n${lines.map((line) => `  ${JSON.stringify(line)}`).join(',\n')}\n]\n`);
console.log(`${lines.length} lines -> games/world-tour/audio/voice/lines.json`);
