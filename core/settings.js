// Grown-ups' settings, shared between the games, and which level each game is on (core/levels.js).
// Nothing about the child or their hands is ever stored.
import { OPEN_RULES } from './hands.js';

const STORAGE_KEY = 'camera-games-settings';

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

/** gameDefaults adds a game's own settings to the shared ones. */
export function loadSettings(gameDefaults = {}) {
  const defaults = { ...SHARED_DEFAULTS, ...gameDefaults };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (!HAND_CHOICES.some(([value]) => value === saved.hands)) delete saved.hands;
    dropOldDefaults(saved);
    return { ...defaults, ...saved, strictness: { ...defaults.strictness, ...saved.strictness } };
  } catch {
    return structuredClone(defaults);
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private windows can refuse storage. The defaults still work.
  }
}
