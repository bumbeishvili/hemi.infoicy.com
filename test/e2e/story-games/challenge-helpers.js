// Giraffe's Long Walk Home and the Lighthouse Keeper can be lost by default now: the sun goes down on the
// walk, and a ship only waits so long for its window. The tests written for the games as they were play on
// Gentle unless they say otherwise, through these, which are the shared helpers with that one difference.
// daylight: undefined or storm: undefined leaves the game's own default.
import { openGame as openAnyGame } from '../helpers.js';
import { startPlaying as startAnyGame } from './helpers.js';

const GENTLE = { 'giraffe-walk': { daylight: 'gentle' }, lighthouse: { storm: 'gentle' } };

export const gentleFor = (game, settings = {}) => ({ ...(GENTLE[game] ?? {}), ...settings });

export const openGame = (page, settings = {}, game = 'high-five-racers', hash = '') => openAnyGame(page, gentleFor(game, settings), game, hash);

export const startPlaying = (page, game, settings = {}, scene = undefined) => startAnyGame(page, game, gentleFor(game, settings), scene);
