// Balloon Pop's numbers, and what each level changes, with no screen in this file so it can be tested
// on its own. Level 1 is the game as it always was. A grown-up's choices are never changed by a level:
// the hand, how open it has to be, reach help, how many balloons to pop, and the maths challenge's kind.
// Balloon speed is a grown-up's choice too, and a level only goes a little faster than whichever it is.
//
// Every level from 2 brings something new to see and play with, and keeps what came before: presents
// with sweets in them, power-up bubbles, star balloons, pairs, friends in baskets, a magnet, rainbow
// balloons, a bluebird and big balloons. Prizes only ever add: missing one costs nothing.
//
// What's at stake: balloons that float off the top of the sky get away, and when too many have got away
// before the child has popped enough, the game is over and that level comes round again (see awayAllowed).
// On Gentle, a grown-up's choice, floating away costs nothing and the levels climb as gently as they did.
import { ramp, rampWhole, stepsAt } from '../../core/levels.js';
import { choicesFor, LEVELS as MATHS } from './maths.js';

// rise is in screen heights a second, every is seconds between balloons, most is how many
// can be up at once. Even fast is gentle: this is about reaching, not reaction time.
export const PACES = {
  slow: { rise: 0.085, every: 1.05, most: 7 },
  medium: { rise: 0.115, every: 0.8, most: 9 },
  fast: { rise: 0.16, every: 0.6, most: 11 },
};

export const WANDERER_CHANCE = 0.25; // Balloons that sway wide and drift across, at level 1.
// A star balloon only pops once an open hand has stayed on it this long, with a ring closing round it.
// Holding the hand open is the exercise itself, so it's a little more of what the game is for.
export const STAR_HOLD_SECONDS = 0.35;
export const MOST_ANSWERS = 5; // The most balloons with answers on them, so they fit side by side.

// A power-up lasts this long once its bubble is popped.
export const POWER_SECONDS = 8;
// The first power-up bubble, and the first friend in a basket, come this soon in a game, so they're met.
export const FIRST_POWER_AFTER = 5;
export const FIRST_BASKET_AFTER = 8;
// A big balloon pops into this many ordinary ones.
export const BIG_SPLITS_INTO = 3;
// A friend in a basket hangs under this many balloons.
export const BASKET_BALLOONS = 3;

// Prizes. Each one comes out of something popped, falls slowly, drifts towards a nearby hand and is
// caught by the glove just coming near it, open or closed. One that isn't caught fades on the hills.
export const PRIZE = {
  fall: 0.075, // How fast one falls, in screen heights a second: about 10 seconds from the top.
  pullRange: 0.4, // How near the hand it has to be to drift towards it, in screen heights.
  pull: 0.24, // How fast it drifts, in screen heights a second.
  catchPalms: 1.5, // How near the glove catches it, in palm lengths from the middle of the hand.
};
// What the magnet does: prizes come from further and faster, and balloons drift to the hand.
export const MAGNET = { pullRange: 0.75, pull: 0.65, balloonRange: 0.5, balloonPull: 0.12 };
// The bubble round the glove: popping and catching reach this much further, in palm lengths.
export const BUBBLE_REACH = 0.65;
// The bluebird pops a balloon near the hand this often, and only this near it, in screen heights.
export const BIRD = { every: 1.1, range: 0.34, flySeconds: 0.45 };

// How many balloons may get away in a game, as a share of how many there are to pop, at level 1 and at
// level 10. At level 1 it's twice as many, so a child new to it has plenty of time, and at level 10 half.
export const AWAY_SHARE = [2, 0.5];
export const LEAST_AWAY = 3;

/** How many balloons can float away before the game is over, for a number to pop at a level. */
export function awayAllowed(goal, level) {
  return Math.max(LEAST_AWAY, Math.round(goal * ramp(level, AWAY_SHARE[0], AWAY_SHARE[1])));
}

// Friends playing together, on the same side: what everyone pops adds up, and the team has this many to pop
// between them before the time is up, as a share of the host's number of balloons. The balloons are the host's,
// and no more of them come for more players, so the number is the same for two friends or four. With the maths
// challenge on it's right answers, and far fewer, as only one child can have each sum. grace is how long after
// the time is up a pop on a friend's computer can still arrive and count, in seconds.
export const TEAM = { pops: 1.5, sums: 0.35, grace: 0.8 };

/** How many the team has to pop between them, or get right with the maths challenge on. */
export function teamGoal(balloons, { maths = false } = {}) {
  return Math.max(1, Math.round(balloons * (maths ? TEAM.sums : TEAM.pops)));
}

// What the host's game tells the others about its game, in one word of letters: the kind of sums, and, playing
// together, whether a grown-up chose Gentle, which takes the clock away. See mode in server/race-room.js.
const GENTLE_MARK = 'Easy';

export function friendsMode(maths, gentle = false) {
  return `${maths ?? 'off'}${gentle ? GENTLE_MARK : ''}`;
}

/** The host's kind of sums, 'off' for anything else, and whether their game is Gentle. */
export function readFriendsMode(mode) {
  const text = typeof mode === 'string' ? mode : '';
  const gentle = text.endsWith(GENTLE_MARK);
  const maths = gentle ? text.slice(0, -GENTLE_MARK.length) : text;
  return { maths: Object.hasOwn(MATHS, maths) ? maths : 'off', gentle };
}

/**
 * What changes from level 1 to 10. gentle is the game as it was before balloons could get away: its
 * levels climb as gently as they always did. Otherwise they climb further.
 */
export function balloonLevel(level, { gentle = false } = {}) {
  return {
    // Balloons float up faster. On Gentle, even at level 10 each is on the screen for 3/4 of the time it
    // was, and otherwise for 2/3 of it.
    rise: ramp(level, 1, gentle ? 1.35 : 1.5),
    // They come along more often: the time between them, as a share of the chosen speed's.
    every: ramp(level, 1, gentle ? 0.72 : 0.62),
    // More of them can be up at once.
    most: rampWhole(level, 0, 3),
    // More of them sway wide and drift across.
    wanderers: ramp(level, WANDERER_CHANCE, 0.5),
    // From level 2, some balloons carry a present, which falls on a little parachute when the balloon
    // pops. Catching it gives a sweet.
    presents: stepsAt(level, { 1: 0, 2: 0.14, 6: 0.16 }),
    // From level 4, star balloons, which need the open hand held on them for a moment, and drop a star.
    stars: stepsAt(level, { 1: 0, 4: 0.15, 6: 0.25, 9: 0.3 }),
    // From level 5, two balloons tied together come up as a pair, and come apart when one pops.
    // Popping both drops a gem.
    pairs: stepsAt(level, { 1: 0, 5: 0.15, 8: 0.2 }),
    // From level 7, a breeze pushes every balloon slowly one way and then the other, as a share of the
    // screen's width each way.
    breeze: stepsAt(level, { 1: 0, 7: 0.03, 9: 0.045 }),
    // From level 8, now and then a rainbow balloon, whose pop spreads to the balloons round it.
    rainbow: stepsAt(level, { 1: 0, 8: 0.06 }),
    // At level 10, now and then a big balloon, which pops into three ordinary ones.
    big: stepsAt(level, { 1: 0, 10: 0.05 }),
    // From level 6, a friend floats by in a basket under three balloons, this many seconds apart.
    // Popping all three brings them gently down, and they leave a heart.
    baskets: stepsAt(level, { 1: 0, 6: 26, 9: 22 }),
    // Power-up bubbles, which change things for a few seconds once popped, this many seconds apart.
    powerEvery: stepsAt(level, { 1: 0, 3: 16, 7: 14, 9: 13 }),
    // Which power-ups there are: a bubble round the glove (from 3), a magnet (from 7) and the bluebird
    // (from 9). The newest comes first.
    powers: stepsAt(level, { 1: [], 3: ['bubble'], 7: ['bubble', 'magnet'], 9: ['bubble', 'magnet', 'bird'] }),
    // Which prizes there are, from what: sweets from presents, stars from star balloons, gems from pairs,
    // and hearts from friends in baskets.
    prizes: stepsAt(level, { 1: [], 2: ['sweet'], 4: ['sweet', 'star'], 5: ['sweet', 'star', 'gem'], 6: ['sweet', 'star', 'gem', 'heart'] }),
    // Where it is: over the hills, then by the sea from level 5, and at the Harvest Fair from level 8.
    place: stepsAt(level, { 1: 'hills', 5: 'seaside', 8: 'fair' }),
    // With the maths challenge on, from level 4 one more answer to choose from, and from level 8 two.
    answers: stepsAt(level, { 1: 0, 4: 1, 8: 2 }),
  };
}

// What each level brings that's new, for the title card, the countdown and the finish card. key says
// which part of balloonLevel turns it on, which the unit tests check.
const NEWS = {
  2: [
    { key: 'presents', mark: '🎁', name: 'Present balloons', nameKa: 'საჩუქრიანი ბუშტები' },
    { key: 'sweet', mark: '🍬', name: 'Sweets', nameKa: 'კანფეტები' },
  ],
  3: [{ key: 'bubble', mark: '🫧', name: 'Bubble glove', nameKa: 'ბუშტის ხელთათმანი' }],
  4: [{ key: 'stars', mark: '⭐', name: 'Star balloons', nameKa: 'ვარსკვლავიანი ბუშტები' }],
  5: [
    { key: 'pairs', mark: '🎈', name: 'Balloon pairs', nameKa: 'ბუშტების წყვილები' },
    { key: 'gem', mark: '💎', name: 'Gems', nameKa: 'ძვირფასი ქვები' },
    { key: 'seaside', mark: '🌊', name: 'By the sea', nameKa: 'ზღვასთან' },
  ],
  6: [
    { key: 'baskets', mark: '🧺', name: 'Friends in baskets', nameKa: 'მეგობრები კალათებში' },
    { key: 'heart', mark: '💗', name: 'Hearts', nameKa: 'გულები' },
  ],
  7: [
    { key: 'magnet', mark: '🧲', name: 'Magnet', nameKa: 'მაგნიტი' },
    { key: 'breeze', mark: '🍃', name: 'Breeze', nameKa: 'ნიავი' },
  ],
  8: [
    { key: 'rainbow', mark: '🌈', name: 'Rainbow balloons', nameKa: 'ცისარტყელა ბუშტები' },
    { key: 'fair', mark: '🎡', name: 'The fair', nameKa: 'ბაზრობა' },
  ],
  9: [{ key: 'bird', mark: '🐦', name: 'Bluebird helper', nameKa: 'ლურჯი ჩიტი' }],
  10: [{ key: 'big', mark: '🎈', name: 'Big balloons', nameKa: 'დიდი ბუშტები' }],
};

// The places, which follow one another rather than adding up.
export const PLACES = ['seaside', 'fair'];

// With the maths challenge on, a level that adds an answer to choose from says so.
const MORE_ANSWERS = { key: 'answers', mark: '🔢', name: 'One more answer', nameKa: 'კიდევ ერთი პასუხი' };

/**
 * What's new at a level, as [{ key, mark, name, nameKa }]. Nothing at level 1. maths is the maths
 * challenge's kind, or 'off'. With it on, only balloons with answers come up, so what's new is one more
 * answer to choose from, at a level that really adds one (there are never more than MOST_ANSWERS), and
 * a new place, as the places still change.
 */
export function balloonNewAt(level, { maths = 'off' } = {}) {
  const news = NEWS[level] ?? [];
  if (!Object.hasOwn(MATHS, maths ?? '')) return news;
  const answers = (at) => choicesFor(maths, balloonLevel(at).answers, MOST_ANSWERS);
  const more = level > 1 && answers(level) > answers(level - 1);
  return [...(more ? [MORE_ANSWERS] : []), ...news.filter(({ key }) => PLACES.includes(key))];
}

/** Whether the part of a level that a piece of news names is on. */
export function newsIsOn(key, level) {
  const plan = balloonLevel(level);
  const on = {
    presents: plan.presents > 0,
    stars: plan.stars > 0,
    pairs: plan.pairs > 0,
    breeze: plan.breeze > 0,
    rainbow: plan.rainbow > 0,
    big: plan.big > 0,
    baskets: plan.baskets > 0,
    seaside: plan.place === 'seaside',
    fair: plan.place === 'fair',
  };
  if (key in on) return on[key];
  if (['bubble', 'magnet', 'bird'].includes(key)) return plan.powers.includes(key) && plan.powerEvery > 0;
  return plan.prizes.includes(key);
}

/**
 * How many balloons come up a minute at a speed and level, counting both of a pair, the three a big one
 * pops into, and the two more that a friend's basket brings. A power-up bubble takes a balloon's place.
 */
export function balloonsPerMinute(paceName, level, options = {}) {
  const plan = balloonLevel(level, options);
  const stream = (60 / (PACES[paceName].every * plan.every)) * (1 + plan.pairs + plan.big * BIG_SPLITS_INTO);
  const baskets = plan.baskets ? (60 / plan.baskets) * (BASKET_BALLOONS - 1) : 0;
  return stream + baskets;
}

/** How many seconds a balloon takes to float up the screen, at its usual pace. */
export function secondsOnScreen(paceName, level, options = {}) {
  return 1 / (PACES[paceName].rise * balloonLevel(level, options).rise);
}
