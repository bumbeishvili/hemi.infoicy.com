// Every game gets harder level by level, from level 1 up to level 10. Winning a level moves on to the
// next one. A game that's lost stays on the same level: Sky Wings and Mighty Moves can be lost, and so
// can Robot Rescue, Tank Patrol, Cannon Bay and Bounce Back on Medium or Tough, but never on Gentle. A
// grown-up can choose any level under the gear icon. Which level each game is on is kept in the browser
// with the grown-ups' settings, and nothing else about play is.
//
// What gets harder is up to each game: more going on, quicker, and more kinds of thing to deal with.
// Nothing that a grown-up or therapist chose is changed by a level: the hand in play, how open a hand
// has to be, how far to reach, how big a movement has to be, a gentle mode that can't be lost, or help
// such as a car that steers itself. Resting is never punished at any level.
import { saveSettings } from './settings.js';

export const LAST_LEVEL = 10;
// On the finish card's big button after a game that was lost, in every game.
const TRY_AGAIN = 'Try again';

export const clampLevel = (value) => Math.min(LAST_LEVEL, Math.max(1, Math.round(Number(value)) || 1));

/** A number that goes evenly from level 1's value to level 10's. */
export function ramp(level, first, last) {
  return first + ((last - first) * (clampLevel(level) - 1)) / (LAST_LEVEL - 1);
}

/** The same, to the nearest whole number. */
export const rampWhole = (level, first, last) => Math.round(ramp(level, first, last));

/**
 * Something that changes at given levels: the value listed at this level or the nearest one below it.
 * stepsAt(5, { 1: 'calm', 4: 'windy', 8: 'stormy' }) is 'windy'.
 */
export function stepsAt(level, table) {
  const wanted = clampLevel(level);
  let found;
  for (const from of Object.keys(table).map(Number).sort((a, b) => a - b)) {
    if (from <= wanted) found = table[from];
  }
  return found;
}

/** Which game this page is, from its folder, as in games/lighthouse/. */
export function gameIdFromPage(path = globalThis.location?.pathname ?? '') {
  return path.match(/\/games\/([^/]+)\//)?.[1] ?? 'game';
}

export class Levels {
  /** settings is the grown-ups' settings object, which this keeps the level in. */
  constructor(settings, game = gameIdFromPage()) {
    this.settings = settings;
    this.game = game;
    this.last = null;
  }

  get current() {
    return clampLevel(this.settings.levels?.[this.game] ?? 1);
  }

  choose(level) {
    this.settings.levels = { ...this.settings.levels, [this.game]: clampLevel(level) };
    this.last = null;
    saveSettings(this.settings);
  }

  /**
   * At the end of a game. played is the level that was played. A level that's won moves on to the next
   * one, up to the last. If a grown-up chose another level while it was being played, that's the next one.
   */
  complete(won = true, played = this.current) {
    const chosen = this.current;
    if (chosen !== played) {
      this.last = { played, next: chosen, won, allDone: false };
      return this.last;
    }
    const next = won ? Math.min(LAST_LEVEL, played + 1) : played;
    if (next !== played) this.choose(next);
    this.last = { played, next, won, allDone: won && played === LAST_LEVEL };
    return this.last;
  }
}

/** The words on the cards. The cards are in English, like the rest of them. */
export function levelWords({ played, next, won, allDone }) {
  if (allDone) return `All ${LAST_LEVEL} levels done!`;
  if (!won) return `Let’s try level ${played} again!`;
  return `Level ${played} done! Next: level ${next}`;
}

const pips = Array.from({ length: LAST_LEVEL }, (_, index) => `<li data-level="${index + 1}"></li>`).join('');

/** What a level brings that's new, as little chips: a picture and a name each. */
export function newsMarkup(news, language = 'en') {
  return news
    .map(({ mark, name, nameKa }) => `<span class="level-new-chip"><span class="level-new-mark" aria-hidden="true">${mark}</span>${language === 'ka' && nameKa ? nameKa : name}</span>`)
    .join('');
}

/**
 * Puts the level on the title card, the finish card, the countdown and the grown-ups' panel. Both kinds
 * of game have the same pieces to put it in. language() says which language the countdown speaks, and
 * onChoose(level) is told when a grown-up picks a level. newAt(level) is what's new at a level, as a list
 * of { mark, name, nameKa }, where mark is a small picture such as an emoji: it's shown on the title card,
 * under the countdown, and on the finish card as what's coming next. It returns refresh() and showResult(result).
 */
export function mountLevels(levels, { language = () => 'en', onChoose = () => {}, newAt = () => [] } = {}) {
  const byId = (id) => document.getElementById(id);
  const make = (tag, id, className) => {
    const element = document.createElement(tag);
    element.id = id;
    element.className = className;
    return element;
  };

  const badge = make('p', 'level-badge', 'level-badge');
  document.querySelector('#screen-welcome h1')?.after(badge);
  const welcomeNew = make('p', 'level-new', 'level-new');
  badge.after(welcomeNew);

  const done = make('div', 'level-done', 'level-done');
  done.innerHTML = `<p id="level-done-text" class="level-done-text"></p><ol id="level-pips" class="level-pips" aria-hidden="true">${pips}</ol><p id="level-next-new" class="level-new"></p>`;
  document.querySelector('#screen-finish h2')?.after(done);

  const now = make('div', 'level-now', 'level-now');
  now.setAttribute('aria-hidden', 'true');
  document.body.append(now);
  const nowNew = make('div', 'level-new-now', 'level-new level-new-now');
  nowNew.setAttribute('aria-hidden', 'true');
  document.body.append(nowNew);

  const choice = make('fieldset', 'level-choice', 'choice level-choice');
  choice.innerHTML = `
      <legend>Level, each a little harder than the last. Winning one moves on to the next.</legend>
      ${Array.from({ length: LAST_LEVEL }, (_, index) => `<label><input type="radio" name="game-level" value="${index + 1}"> ${index + 1}</label>`).join('\n      ')}`;
  byId('setting-sound')?.closest('fieldset')?.before(choice);

  // The finish card's big button, whatever a game calls it, keeps its own words unless it's a new level, or the
  // game was lost, when it's to try again.
  const again = document.querySelector('#screen-finish .finish-actions .big-button');
  const againLabel = again?.textContent ?? '';

  const ui = {
    refresh() {
      const level = levels.current;
      badge.textContent = `Level ${level} of ${LAST_LEVEL}`;
      now.textContent = language() === 'ka' ? `დონე ${level}` : `Level ${level}`;
      for (const input of choice.querySelectorAll('input')) input.checked = Number(input.value) === level;
      const news = level > 1 ? newAt(level) : [];
      welcomeNew.innerHTML = news.length ? `<span class="level-new-lead">New:</span>${newsMarkup(news)}` : '';
      nowNew.innerHTML = news.length ? `<span class="level-new-lead">${language() === 'ka' ? 'ახალი:' : 'New:'}</span>${newsMarkup(news, language())}` : '';
      const result = levels.last;
      const coming = result?.won && !result.allDone ? newAt(result.next) : [];
      byId('level-next-new').innerHTML = coming.length ? `<span class="level-new-lead">Coming up:</span>${newsMarkup(coming)}` : '';
      byId('level-done-text').textContent = result ? levelWords(result) : `Next: level ${level}`;
      for (const pip of done.querySelectorAll('li')) {
        const at = Number(pip.dataset.level);
        pip.classList.toggle('is-done', result ? at <= result.played && (result.won || at < result.played) : at < level);
        pip.classList.toggle('is-next', at === level && !result?.allDone);
      }
      if (again) again.textContent = result?.won && !result.allDone ? 'Next level' : result && !result.won ? TRY_AGAIN : againLabel;
    },
    showResult(result) {
      ui.refresh();
      return result;
    },
  };

  for (const input of choice.querySelectorAll('input')) {
    input.addEventListener('change', () => {
      levels.choose(Number(input.value));
      ui.refresh();
      onChoose(levels.current);
    });
  }
  ui.refresh();
  return ui;
}
