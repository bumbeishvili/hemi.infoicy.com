// High Five Racers' tests use the shared helpers, with one difference: the tests written for the race as it
// was, where the others wait for a resting child and ease off so the child wins, race on Gentle unless they
// say otherwise. rivals: undefined leaves the game's own default, racing to win.
import { openGame as openAnyGame } from '../helpers.js';

export * from '../helpers.js';

export function openGame(page, settings = {}, game = 'high-five-racers', hash = '') {
  return openAnyGame(page, game === 'high-five-racers' ? { rivals: 'gentle', ...settings } : settings, game, hash);
}
