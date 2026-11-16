// The screens every game shares: the mirror, prompts, hand meters, the title and finish
// cards, and the grown-ups' panel. Each game's index.html only holds its own canvas.

import { LOADING_BAR } from './loading.js';
import { HAND_CHOICES } from './settings.js';

const GEAR_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-1.7-1L15 3.500h-4L10.700 6a7.500 7.500 0 0 0-1.700 1l-2.400-1-2 3.400 2 1.600a7.600 7.600 0 0 0 0 2l-2 1.600 2 3.400 2.400-1a7.500 7.500 0 0 0 1.700 1l.3 2.500h4l.3-2.500a7.500 7.500 0 0 0 1.700-1l2.400 1 2-3.400zM12.700 15a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/></svg>`;

const WHEEL = `
  <div id="wheel" class="wheel" aria-hidden="true">
    <svg viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="26" />
      <circle class="wheel-hub" cx="32" cy="32" r="6" />
      <path d="M6 32H26M38 32H58M32 38V58" />
    </svg>
  </div>`;

const ALL_GAMES = '<a class="all-games" href="../../index.html">All games</a>';

/**
 * title, startLabel, againLabel and finishTitle are the words on the cards. heroMark and
 * heroNoun label the big number at the finish. hudTop and panelSettings hold a game's own
 * markup. extraRows adds rows to the summary, as { id, label }. withWheel shows the wheel.
 */
export function mountShell({
  title,
  startLabel,
  againLabel,
  finishTitle,
  heroMark,
  heroNoun,
  hudTop = '',
  panelSettings = '',
  extraRows = [],
  withWheel = false,
}) {
  const rows = extraRows
    .map(({ id, label }) => `<tr><th scope="row">${label}</th><td id="sum-left-${id}"></td><td id="sum-right-${id}"></td></tr>`)
    .join('');

  document.body.insertAdjacentHTML('beforeend', `
  <div id="camera-frame" class="camera-frame">
    <video id="camera" playsinline muted aria-label="Mirror view from your camera"></video>
    <canvas id="skeleton" aria-hidden="true"></canvas>
  </div>

  ${hudTop}

  <button id="open-panel" class="gear" type="button" aria-label="Settings for grown-ups">${GEAR_ICON}</button>

  <div id="prompt" class="prompt" role="status" aria-live="polite">
    <span id="prompt-arrow-left" class="prompt-arrow" aria-hidden="true">◀</span>
    <span id="prompt-text"></span>
    <span id="prompt-arrow-right" class="prompt-arrow" aria-hidden="true">▶</span>
  </div>

  <div class="hands-bar">
    <div id="meter-left" class="meter-slot"></div>
    ${withWheel ? WHEEL : ''}
    <div id="meter-right" class="meter-slot"></div>
  </div>

  <section id="screen-welcome" class="screen">
    <div class="card title-card">
      <h1>${title}</h1>
      <p id="tagline" class="tagline"></p>
      <p id="shape-note" class="shape-note" hidden></p>
      <button id="start" class="big-button" type="button">${startLabel}</button>
      ${ALL_GAMES}
      <p class="small-print">For grown-ups: the camera picture stays on this computer. It is never saved or sent anywhere.</p>
    </div>
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

  <div id="check-progress" class="check-progress" aria-hidden="true"><div id="check-progress-fill"></div></div>

  <div class="hand-demo" aria-hidden="true">
    <svg viewBox="0 0 100 110">
      <g class="hand-demo-hand">
        <rect x="26" y="58" width="48" height="42" rx="16" />
        <path class="hand-demo-finger" data-finger="pinky" d="M33 62V36" />
        <path class="hand-demo-finger" data-finger="ring" d="M45 58V24" />
        <path class="hand-demo-finger" data-finger="middle" d="M57 58V22" />
        <path class="hand-demo-finger" data-finger="index" d="M68 62V32" />
        <path class="hand-demo-finger hand-demo-thumb" data-finger="thumb" d="M74 82L92 66" />
      </g>
    </svg>
  </div>

  <div id="count" class="count" aria-live="assertive"></div>

  <section id="screen-finish" class="screen">
    <canvas id="confetti" aria-hidden="true"></canvas>
    <div class="card finish-card">
      <h2>${finishTitle}</h2>
      <p class="finish-hero"><span class="hero-mark" aria-hidden="true">${heroMark}</span> <span id="finish-hero">0</span> ${heroNoun}</p>
      <p id="finish-open" class="finish-open"></p>
      <table class="summary">
        <thead>
          <tr><th scope="col"><span class="visually-hidden">Measure</span></th><th scope="col">Left hand</th><th scope="col">Right hand</th></tr>
        </thead>
        <tbody>
          ${rows}
          <tr>
            <th scope="row">Time open</th>
            <td><span id="sum-left-open"></span><span class="thin-meter"><span id="sum-left-open-bar"></span></span></td>
            <td><span id="sum-right-open"></span><span class="thin-meter"><span id="sum-right-open-bar"></span></span></td>
          </tr>
          <tr><th scope="row">Times opened</th><td id="sum-left-openings"></td><td id="sum-right-openings"></td></tr>
          <tr><th scope="row">Longest hold</th><td id="sum-left-hold"></td><td id="sum-right-hold"></td></tr>
          <tr><th scope="row">Widest opening</th><td id="sum-left-peak"></td><td id="sum-right-peak"></td></tr>
        </tbody>
      </table>
      <p class="small-print">These numbers are shown once and not saved.</p>
      <div class="finish-actions">
        <button id="play-again" class="big-button" type="button">${againLabel}</button>
        ${ALL_GAMES}
      </div>
    </div>
  </section>

  <dialog id="panel" class="panel" aria-labelledby="panel-title">
    <div class="panel-head">
      <h2 id="panel-title">For grown-ups</h2>
      <a id="panel-all-games" class="panel-link" href="../../index.html">All games</a>
      <button id="close-panel" class="panel-close" type="button">Done</button>
    </div>
    <p class="panel-lead">The game is paused. A hand only counts as open once it reaches its line.</p>
    <div id="panel-hands" class="panel-hands"></div>

    <fieldset class="choice">
      <legend>Hand to play with</legend>
      ${HAND_CHOICES.map(([value, label]) => `<label><input type="radio" name="hands" value="${value}"> ${label}</label>`).join('\n      ')}
    </fieldset>

    <div id="panel-shapes"></div>

    ${panelSettings}

    <fieldset class="choice">
      <legend>Sound</legend>
      <label><input type="checkbox" id="setting-sound"> Sound effects</label>
      <label><input type="checkbox" id="setting-voice"> Spoken prompts</label>
    </fieldset>

    <fieldset class="choice">
      <legend>Voice language</legend>
      <label><input type="radio" name="language" value="en"> English</label>
      <label lang="ka"><input type="radio" name="language" value="ka"> ქართული</label>
    </fieldset>

    <div class="panel-actions">
      <button id="recheck" class="soft-button" type="button">Check hands again</button>
    </div>
    <p id="panel-pace" class="small-print panel-pace"></p>
    <p class="small-print">These games are not medical devices and don’t replace therapy. Please check targets and how long to play with the child’s therapist, and stop if anything hurts.</p>
  </dialog>`);
}
