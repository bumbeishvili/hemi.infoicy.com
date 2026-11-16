// The screens the whole-body games share: the mirror, prompts, the title, choosing and finish
// cards, and the grown-ups' panel. Each game's index.html only holds its own canvas.
import { LOADING_BAR } from '../loading.js';

const GEAR_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-1.7-1L15 3.500h-4L10.700 6a7.500 7.500 0 0 0-1.700 1l-2.400-1-2 3.400 2 1.600a7.600 7.600 0 0 0 0 2l-2 1.600 2 3.400 2.400-1a7.500 7.500 0 0 0 1.700 1l.3 2.500h4l.3-2.500a7.500 7.500 0 0 0 1.700-1l2.400 1 2-3.400zM12.700 15a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/></svg>`;

const ALL_GAMES = '<a class="all-games" href="../../index.html">All games</a>';

/**
 * title, tagline, startLabel and chooseTitle are the words on the cards. chosenExtra adds to the
 * card about the chosen character, and chooseSide is the card next to it, with the button that
 * starts. hud holds the game's own display, finishBody fills the finish card, and panelLead and
 * panelSettings are its part of the grown-ups' panel. recheckLabel names the button there.
 */
export function mountBodyShell({
  title,
  tagline,
  startLabel,
  chooseTitle,
  chosenExtra = '',
  chooseSide,
  hud = '',
  finishBody,
  panelLead,
  panelSettings = '',
  handLegend = 'Hand to play with',
  safetyPrint = 'Please clear some space, and stay close by.',
}) {
  document.body.insertAdjacentHTML('beforeend', `
  <div id="camera-frame" class="camera-frame body-frame">
    <video id="camera" playsinline muted aria-label="Mirror view from your camera"></video>
    <svg id="body-guide" class="body-guide" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <circle cx="50" cy="19" r="6.5" />
      <path d="M50 28V58M50 58L40 92M50 58L60 92M50 32L34 52M50 32L66 52" />
    </svg>
    <canvas id="skeleton" aria-hidden="true"></canvas>
  </div>

  ${hud}

  <button id="open-panel" class="gear" type="button" aria-label="Settings for grown-ups">${GEAR_ICON}</button>

  <div id="prompt" class="prompt" role="status" aria-live="polite">
    <span id="prompt-arrow-left" class="prompt-arrow" aria-hidden="true">◀</span>
    <span id="prompt-text"></span>
    <span id="prompt-arrow-right" class="prompt-arrow" aria-hidden="true">▶</span>
  </div>

  <div id="coach" class="coach" aria-live="polite">
    <canvas id="coach-demo" class="coach-demo" aria-hidden="true"></canvas>
    <span id="coach-text" class="coach-text"></span>
    <div class="coach-effort" aria-hidden="true"><div id="coach-effort-fill" class="coach-effort-fill"></div></div>
  </div>

  <div id="callouts" class="callouts" aria-hidden="true"></div>
  <div id="count" class="count body-count" aria-live="assertive"></div>

  <section id="screen-welcome" class="screen">
    <div class="card title-card">
      <h1>${title}</h1>
      <p class="tagline">${tagline}</p>
      <button id="start" class="big-button" type="button">${startLabel}</button>
      ${ALL_GAMES}
      <p class="small-print">For grown-ups: the camera picture stays on this computer. It is never saved or sent anywhere. ${safetyPrint}</p>
    </div>
  </section>

  <section id="screen-choose" class="choose">
    <header class="choose-head">
      ${ALL_GAMES}
      <h2>${chooseTitle}</h2>
    </header>
    <div class="chosen">
      <h3 id="chosen-name" class="chosen-name"></h3>
      <p id="chosen-title" class="chosen-title"></p>
      ${chosenExtra}
    </div>
    <div class="choose-side">${chooseSide}</div>
    <div id="fighter-grid" class="fighter-grid" role="radiogroup" aria-label="Characters"></div>
  </section>

  <section id="screen-loading" class="screen">
    <div class="card title-card">
      <h2>Getting everything ready…</h2>
      ${LOADING_BAR}
      <p class="small-print">If your browser asks, please allow the camera.</p>
    </div>
  </section>

  <section id="screen-problem" class="screen">
    <div class="card title-card">
      <h2 id="problem-title">We can’t see the camera</h2>
      <p id="problem-detail" class="problem-detail"></p>
      <button id="problem-retry" class="big-button" type="button">Try again</button>
    </div>
  </section>

  <div id="body-check" class="body-check">
    <div id="check-progress" class="check-progress"><div id="check-progress-fill"></div></div>
    <p class="small-print">Clear some space, with nothing nearby to bump into.</p>
  </div>

  <section id="screen-finish" class="screen">
    <canvas id="confetti" aria-hidden="true"></canvas>
    <div class="card finish-card">${finishBody}</div>
  </section>

  <dialog id="panel" class="panel" aria-labelledby="panel-title">
    <div class="panel-head">
      <h2 id="panel-title">For grown-ups</h2>
      <a id="panel-all-games" class="panel-link" href="../../index.html">All games</a>
      <button id="close-panel" class="panel-close" type="button">Done</button>
    </div>
    <p class="panel-lead">${panelLead}</p>
    <p id="live-reading" class="live-reading"></p>

    <fieldset class="choice">
      <legend>How big a movement has to be</legend>
      <label><input type="radio" name="moveSize" value="tiny"> Very small, which may count a few extra moves</label>
      <label><input type="radio" name="moveSize" value="small"> Small, and one arm can do what asks for two</label>
      <label><input type="radio" name="moveSize" value="medium"> Medium</label>
      <label><input type="radio" name="moveSize" value="big"> Big</label>
    </fieldset>
    <fieldset class="choice">
      <legend>${handLegend}</legend>
      <label><input type="radio" name="hands" value="left"> Left</label>
      <label><input type="radio" name="hands" value="right"> Right</label>
    </fieldset>
    ${panelSettings}
    <fieldset class="choice">
      <legend>Sound</legend>
      <label><input type="checkbox" id="setting-sound"> Sound effects and music</label>
      <label><input type="checkbox" id="setting-voice"> Spoken prompts</label>
    </fieldset>
    <fieldset class="choice">
      <legend>Voice language</legend>
      <label><input type="radio" name="language" value="en"> English</label>
      <label lang="ka"><input type="radio" name="language" value="ka"> ქართული</label>
    </fieldset>

    <div class="panel-actions">
      <button id="recheck" class="soft-button" type="button">Check the body view again</button>
    </div>
    <p class="small-print">These games are not medical devices and don’t replace therapy. Please check with the child’s therapist which movements are right, and how long to play. Stop if anything hurts, or if balance is a worry.</p>
  </dialog>`);
}
