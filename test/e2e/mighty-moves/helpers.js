// Getting through Mighty Moves, with footage of a real person in place of the webcam.
import { expect, openGame, screenName, waitForScreen } from '../helpers.js';

/** Unless a test says, it's the fight as it was, on Gentle, where the computer can't knock a child out. */
export async function openMoves(page, settings = {}) {
  await openGame(page, { fightStrength: 'gentle', ...settings }, 'mighty-moves');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'yes');
}

export const footage = (page, name, options = {}) =>
  page.evaluate(([clip, settings]) => window.__camera.showFootage(clip, settings), [name, options]);

/** A person standing still, in full view, is what the body check wants. */
export const standInView = (page) => footage(page, 'strikes', { from: 0.2, playing: false });

export async function toChoosing(page) {
  await page.locator('#start').click();
  await waitForScreen(page, 'choose');
}

/** From the title to the first round, with a person standing in view. */
export async function reachFight(page, settings = {}) {
  await openMoves(page, settings);
  await standInView(page);
  await toChoosing(page);
  await page.locator('#fight-start').click();
  // Past the body check, the intro and the countdown, each of which can be over in a moment.
  await waitForScreen(page, 'fight');
  await expect.poll(() => page.evaluate(() => window.__game.coach.phase)).toBe('asking');
}

export const fightState = (page) => page.evaluate(() => {
  const { fight } = window.__game;
  return {
    state: fight.state,
    round: fight.round,
    time: fight.time,
    stats: fight.stats,
    player: { hp: fight.player.hp, power: fight.player.power, roundsWon: fight.player.roundsWon },
    npc: { hp: fight.npc.hp, roundsWon: fight.npc.roundsWon },
    resting: fight.resting,
  };
});

/** Says what the coach is asking for right now, and which move that was on which side. */
export const coachState = (page) => page.evaluate(() => {
  const { coach } = window.__game;
  return { phase: coach.phase, name: coach.call?.name ?? null, side: coach.call?.side ?? null, defence: coach.defence?.kind ?? null };
});

/** Makes the coach ask for this next, so a test needn't wait for it to come round. */
export const askFor = (page, name, side = null) => page.evaluate(async ([which, on]) => {
  const { coach } = window.__game;
  const { ORDER } = await import('/games/mighty-moves/moves.js');
  coach.nextIndex = ORDER.indexOf(which);
  coach.queue = [which]; // On the levels where the order is mixed up.
  if (on) coach.sidedCalls = on === coach.side ? 0 : 2;
  coach.computerIn = 1000;
  coach.call = null;
  coach.startCall();
}, [name, side]);

/** Does whatever the coach asks, as soon as it's asked, as a tracked body would. */
export const doWhatIsAsked = (page) => page.evaluate(() => {
  window.__doing = setInterval(() => {
    const { coach, game, fight } = window.__game;
    if (!coach || game.screen !== 'fight') return;
    fight.noteActivity(0);
    if (coach.phase === 'asking') game.onMoves([{ move: coach.call.exercise.reads[0], side: coach.call.side, hand: 'open' }]);
  }, 100);
});

export const stopDoingIt = (page) => page.evaluate(() => clearInterval(window.__doing));

/** Doing as the coach asks until the fight has moved on to a screen other than this one. */
export async function fightUntilRoundEnds(page) {
  await doWhatIsAsked(page);
  await expect.poll(() => screenName(page), { timeout: 120_000 }).not.toBe('fight');
  await stopDoingIt(page);
}
