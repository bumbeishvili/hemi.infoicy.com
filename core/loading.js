// The bar that fills while a game gets ready. There are two waits, and a bar shows through both:
//
//   opening   the page itself, from the first moment until the start button can be pressed. Before any of the
//             game's code has run there's only the style sheet, so base.css draws a bar that creeps along by
//             itself. Once the code is running, the bar on the title card takes over, and goes by what's
//             really been done: the card is up, the words are in, the game is built.
//   loading   after the start button, on the "Getting everything ready" card, while the camera opens and the
//             tracker and every sound and voice line load. It goes by what's really loaded.
//
// A bar never goes back, and it's taken away as soon as there's nothing left to wait for.

export const LOADING_BAR = `
  <div class="loading-bar" role="progressbar" aria-label="Getting everything ready" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
    <span class="loading-fill"></span>
  </div>`;

// How much of the opening bar each thing is worth. The card being up is where the style sheet's own bar got to.
export const OPENING = { card: 0.3, words: 0.2, game: 0.5 };
// And of the loading bar: the tracker and the sounds are what take the time.
export const LOADING = { camera: 0.15, tracker: 0.35, sounds: 0.5 };

const clamp = (value) => Math.min(1, Math.max(0, value));

/** How far along some loading is, from 0 to 1: parts is { name: weight }, and each part is itself from 0 to 1. */
export class Progress {
  constructor(parts) {
    this.parts = parts;
    this.done = Object.fromEntries(Object.keys(parts).map((name) => [name, 0]));
  }

  /** A part has got this far. It never goes back, and so nor does the whole. */
  set(name, share) {
    if (!(name in this.done)) return this.share;
    this.done[name] = Math.max(this.done[name], clamp(Number.isFinite(share) ? share : 0));
    return this.share;
  }

  get share() {
    const all = Object.values(this.parts).reduce((sum, weight) => sum + weight, 0);
    const got = Object.entries(this.parts).reduce((sum, [name, weight]) => sum + weight * this.done[name], 0);
    return all ? got / all : 1;
  }
}

/** Shows how far along on a bar: an element made from LOADING_BAR. */
export function fillBar(bar, share) {
  if (!bar) return;
  const percent = Math.round(clamp(share) * 100);
  bar.querySelector('.loading-fill').style.width = `${percent}%`;
  bar.setAttribute('aria-valuenow', String(percent));
}

/**
 * The bar on the title card, under the start button, from when the card goes up until the button can be pressed.
 * Returns { step(name), done() }: step says one of OPENING's parts is done, and done takes the bar away.
 */
export function openingBar() {
  const start = document.getElementById('start');
  if (!start) return { step() {}, done() {} };
  start.insertAdjacentHTML('afterend', LOADING_BAR);
  const bar = start.nextElementSibling;
  bar.classList.add('opening-bar');
  const progress = new Progress(OPENING);
  const step = (name) => fillBar(bar, progress.set(name, 1));
  step('card');
  return { step, done: () => bar.remove() };
}

/**
 * Fills the bar on the "Getting everything ready" card from what the camera, its tracker and the sounds say, for as
 * long as that card is up. camera is a TrackingCamera and sound a Sound: each says how far it's got, and calls
 * onProgress when that changes. What was loaded last time is still loaded, so the bar starts from there.
 */
export function watchLoading(camera, sound) {
  const bars = [...document.querySelectorAll('#screen-loading .loading-bar')];
  const progress = new Progress(LOADING);
  const show = () => {
    progress.set('camera', camera.progress.camera);
    progress.set('tracker', camera.progress.tracker);
    const { done, total } = sound.loaded;
    progress.set('sounds', total ? done / total : 1);
    const share = progress.share;
    for (const bar of bars) fillBar(bar, share);
    return share;
  };
  for (const bar of bars) fillBar(bar, 0);
  camera.onProgress = show;
  sound.onProgress = show;
  return show();
}
