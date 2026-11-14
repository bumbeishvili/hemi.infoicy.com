// Balloon Pop's tests use the shared helpers, with one difference: the tests written for the game as it was,
// where a balloon floating away costs nothing, play on Gentle unless they say otherwise. away: undefined
// leaves the game's own default, where too many floating away ends the game.
import { openGame as openAnyGame } from '../helpers.js';

export * from '../helpers.js';

export function openGame(page, settings = {}, game = 'high-five-racers', hash = '') {
  return openAnyGame(page, game === 'balloon-pop' ? { away: 'gentle', ...settings } : settings, game, hash);
}
