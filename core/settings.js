// Grown-ups' settings, shared between the games, and which level each game is on (core/levels.js).
// Nothing about the child or their hands is ever stored.
import { OPEN_RULES } from './hands.js';
import { SEAT } from './seat.js';

const STORAGE_KEY = 'camera-games-settings';
// With several playing on one screen (core/seat.js), the first is the child whose settings these are. Each of the
// others has settings of their own, which start as the child's: the hand they play with can be the other one.
const ownKey = () => (SEAT && SEAT.index > 0 ? `${STORAGE_KEY}:player-${SEAT.index + 1}` : STORAGE_KEY);

// The hands that can be chosen, for the panel.
export const HAND_CHOICES = [['left', 'Left hand'], ['right', 'Right hand']];

const SHARED_DEFAULTS = {
  strictness: { left: OPEN_RULES.defaultStrictness, right: OPEN_RULES.defaultStrictness },
  hands: 'right',
  sound: true,
  voice: true,
  language: 'en',
};

// How some games came before 14 November 2026, when a grown-up who had played them asked for them to be more of
// a challenge, and how they come was changed. A game's settings are saved all together, so anyone who had played
// before has the old way saved under these names, though nobody chose it, and the game as it comes now would
// never reach them. So what's saved under one of these names is dropped, once, if it's the old way. A grown-up
// who really had chosen it has to choose it again.
export const OLD_DEFAULTS = {
  flapFox: 'tumble', // Flap, Little Chick!: the fox who never catches the chick. He can now.
  arrowHelp: 'little', // Arrow Meadow: the arrow goes just where the bow points now, with no help.
  mazeSize: 'medium', // Giraffe's Maze: the big maze now.
  puzzlePieces: 'usual', // Giraffe's Puzzles: more pieces now,
  puzzleSnap: 'near', // and a piece has to be let go closer to its place.
  paintBrush: 'medium', // Giraffe's Paint Box: the small brush now.
  level: 'gentle', // Sky Wings: the sky pirates can shoot the plane down now. Only Sky Wings still has this name.
  // How big a move has to be, in the games played with the whole body. Moto Mountain and Rooftop Rope, which
  // have settings of their own for it and never use this one, saved it as medium all the same for a few days:
  // so a child who had played either was then asked for medium moves in the others, where small is how it comes.
  moveSize: 'medium',
};

/**
 * Drops what was saved when a game came another way, and keeps a note, in settled, of the names that have been
 * looked at, so that it's done once. settled: true says all of what's saved was chosen, which is what the tests
 * save theirs with.
 */
function dropOldDefaults(saved) {
  if (saved.settled === true) return;
  const settled = { ...saved.settled };
  for (const [name, old] of Object.entries(OLD_DEFAULTS)) {
    if (settled[name]) continue;
    if (saved[name] === old) delete saved[name];
    settled[name] = true;
  }
  saved.settled = settled;
}

// What a grown-up changes in the panel while a game is going either goes on to that game at once, or starts it
// again when the panel is closed, so that what they chose is what's played: it used to wait for the next game,
// and looked as though nothing had happened. These go on at once in every game: the sound, the voice and its
// language, the hand in play, how open a hand has to be and its shapes, how big a move has to be, and whether
// friends play together or against each other, which is for a game with friends. A game adds its own, the ones
// that tune how its movement is read, as atOnce. All the rest, and the level, start the game again.
const AT_ONCE = ['sound', 'voice', 'language', 'hands', 'strictness', 'shapes', 'moveSize'];

/**
 * Whether a setting goes on to the game on the screen at once. own is the game's own list of those that do, and
 * again its list of those that start it again though they go on at once elsewhere: the hand in play, in a game
 * that's laid out for one hand.
 */
export function appliesAtOnce(name, own = [], again = []) {
  if (again.includes(name)) return false;
  return AT_ONCE.includes(name) || /Friends$/.test(name) || own.includes(name);
}

/** gameDefaults adds a game's own settings to the shared ones. */
export function loadSettings(gameDefaults = {}) {
  const defaults = { ...SHARED_DEFAULTS, ...gameDefaults };
  try {
    const saved = JSON.parse(localStorage.getItem(ownKey()) ?? localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (!HAND_CHOICES.some(([value]) => value === saved.hands)) delete saved.hands;
    dropOldDefaults(saved);
    return { ...defaults, ...saved, strictness: { ...defaults.strictness, ...saved.strictness } };
  } catch {
    return structuredClone(defaults);
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(ownKey(), JSON.stringify(settings));
  } catch {
    // Private windows can refuse storage. The defaults still work.
  }
}
