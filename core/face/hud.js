// Everything drawn over a game played with the face: the mouth meter, prompts, the mirror's overlay, the summary
// and the grown-ups' panel. As with hands, a mouth's state is never shown by colour alone: each state also has
// its own shape and word.
import { Confetti, PromptBox } from '../hud.js';
import { FACE_OVAL, LIPS_INNER, LIPS_OUTER, MOUTH_RULES } from './mouth.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const byId = (id) => document.getElementById(id);
const percent = (value) => `${Math.round(value * 100)}%`;
const clockTime = (seconds) => {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};
// To a tenth of a second while it's short, as a mouth is often open for less than one.
const secondsText = (seconds) => (seconds < 10 ? `${seconds.toFixed(1)} sec` : seconds < 60 ? `${Math.round(seconds)} sec` : clockTime(seconds));

function svgNode(tag, attributes, parent) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  parent?.append(node);
  return node;
}

const RING_RADIUS = 52;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
const STATE_WORDS = { open: 'Open', closed: 'Open wide', missing: 'Can’t see' };
const PROBLEM_WORDS = { edge: 'Too far out', small: 'Too far away', turned: 'Look here' };

/** A ring that fills with how open the mouth is, around a little mouth that copies theirs. */
class MouthMeter {
  constructor(slot) {
    this.root = slot;
    slot.classList.add('meter', 'mouth-meter');
    const svg = svgNode('svg', { viewBox: '0 0 120 120', 'aria-hidden': 'true' }, slot);
    svgNode('circle', { class: 'meter-track', cx: 60, cy: 60, r: RING_RADIUS }, svg);
    this.fill = svgNode('circle', {
      class: 'meter-fill',
      cx: 60,
      cy: 60,
      r: RING_RADIUS,
      transform: 'rotate(-90 60 60)',
      'stroke-dasharray': `0 ${RING_LENGTH}`,
    }, svg);
    this.tick = svgNode('line', { class: 'meter-tick', x1: 60, y1: 1, x2: 60, y2: 17 }, svg);
    this.lips = svgNode('ellipse', { class: 'mouth-meter-lips', cx: 60, cy: 60, rx: 27, ry: 6 }, svg);
    this.inside = svgNode('ellipse', { class: 'mouth-meter-inside', cx: 60, cy: 60, rx: 20, ry: 1 }, svg);
    this.mark = svgNode('text', { class: 'meter-mark mouth-meter-mark', x: 60, y: 60, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, svg);

    const caption = document.createElement('div');
    caption.className = 'meter-caption';
    const name = document.createElement('span');
    name.className = 'meter-name';
    name.textContent = 'Mouth';
    this.word = document.createElement('span');
    this.word.className = 'meter-word';
    caption.append(name, this.word);
    slot.append(caption);
  }

  update(view) {
    this.root.dataset.state = view.status;
    const shown = view.status === 'missing' ? 0 : Math.min(1, view.amount);
    this.fill.setAttribute('stroke-dasharray', `${RING_LENGTH * shown} ${RING_LENGTH}`);
    // A round line cap would otherwise draw a dot at zero.
    this.fill.classList.toggle('is-hidden', shown < 0.01);
    this.tick.setAttribute('transform', `rotate(${view.lineAmount * 360} 60 60)`);
    this.tick.classList.toggle('is-hidden', view.status === 'missing');
    // The little mouth opens as theirs does.
    this.lips.setAttribute('ry', 6 + 20 * shown);
    this.lips.setAttribute('rx', 27 - 5 * shown);
    this.inside.setAttribute('ry', Math.max(0.5, 16 * shown));
    this.inside.setAttribute('rx', 20 - 5 * shown);
    this.mark.textContent = view.status === 'missing' ? '?' : '';
    this.word.textContent = view.status === 'open' ? STATE_WORDS.open : (PROBLEM_WORDS[view.reason] ?? STATE_WORDS[view.status]);
  }
}

/**
 * Draws what the tracker sees on the mirror: the edge of the face, lightly, and the lips, green once the mouth
 * counts as open and amber until then, with the inside of the mouth filled in as it opens.
 */
function drawFace(canvas, snapshot) {
  const { clientWidth: width, clientHeight: height } = canvas;
  if (!width || !height) return;
  const ratio = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(width * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const { points } = snapshot;
  if (!points) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const scale = Math.max(1.2, width / 240);
  // The picture is a mirror, so across is the other way round.
  const trace = (indices) => {
    ctx.beginPath();
    indices.forEach((index, order) => {
      const x = (1 - points[index * 3]) * width;
      const y = points[index * 3 + 1] * height;
      if (order) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.closePath();
  };
  trace(FACE_OVAL);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = scale * 1.4;
  ctx.stroke();

  const open = snapshot.status === 'open';
  trace(LIPS_INNER);
  ctx.fillStyle = open ? 'rgba(18,48,77,0.7)' : 'rgba(18,48,77,0.4)';
  ctx.fill();
  for (const [colour, lineWidth] of [['rgba(18,48,77,0.6)', scale * 4.2], [open ? '#35e07a' : '#ffb703', scale * 2.6]]) {
    trace(LIPS_OUTER);
    ctx.strokeStyle = colour;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

/** The mouth, live, in the grown-ups' panel, with how wide it has to open. */
class PanelMouth {
  constructor(parent, onStrictness) {
    const block = document.createElement('section');
    block.className = 'panel-hand panel-mouth';
    parent.append(block);

    const heading = document.createElement('h3');
    heading.textContent = 'Mouth';
    this.state = document.createElement('span');
    this.state.className = 'panel-state';
    heading.append(' ', this.state);

    const bar = document.createElement('div');
    bar.className = 'live-bar';
    this.barFill = document.createElement('div');
    this.barFill.className = 'live-bar-fill';
    this.barTarget = document.createElement('div');
    this.barTarget.className = 'live-bar-target';
    bar.append(this.barFill, this.barTarget);

    this.numbers = document.createElement('p');
    this.numbers.className = 'live-numbers';

    const sliderLabel = document.createElement('label');
    sliderLabel.className = 'strictness';
    sliderLabel.textContent = 'How wide the mouth has to open';
    this.slider = document.createElement('input');
    this.slider.type = 'range';
    this.slider.id = 'mouth-strictness';
    this.slider.min = 30;
    this.slider.max = 100;
    this.slider.step = 5;
    this.sliderValue = document.createElement('output');
    sliderLabel.append(this.slider, this.sliderValue);
    this.slider.addEventListener('input', () => {
      this.sliderValue.textContent = `${this.slider.value}% of its widest`;
      onStrictness(Number(this.slider.value) / 100);
    });

    this.note = document.createElement('p');
    this.note.className = 'panel-note';

    block.append(heading, bar, this.numbers, sliderLabel, this.note);
  }

  setStrictness(value) {
    this.slider.value = Math.round(value * 100);
    this.sliderValue.textContent = `${this.slider.value}% of its widest`;
  }

  update(view) {
    const problem = { missing: '? Not in view', edge: 'Too far out', small: 'Too far away', turned: 'Turned away' }[view.reason];
    this.state.textContent = view.status === 'open' ? '✓ Open' : problem ?? 'Not open';
    this.state.dataset.state = view.status;
    const now = view.status === 'missing' ? 0 : Math.min(1, view.amount);
    this.barFill.style.width = percent(now);
    this.barTarget.style.left = percent(view.lineAmount);
    this.numbers.textContent = view.checked
      ? `Now ${percent(now)} of its widest · needs ${percent(view.lineAmount)}`
      : `Now ${percent(now)} · needs ${percent(view.lineAmount)} · mouth check not done yet`;
    const belowFloor = view.checked && view.best < MOUTH_RULES.floor;
    this.note.classList.toggle('is-visible', belowFloor);
    this.note.textContent = belowFloor
      ? 'In the check, the mouth opened only a very little. The game always needs the lips to part a clear way, so that talking or breathing can never count as open. Try the check again, with the mouth as wide as it will comfortably go.'
      : '';
  }
}

export class FaceHud {
  /**
   * choices names the game's own settings in the panel, as radio groups, and how to read each one's value: for
   * example { bites: Number }. tagline is the line on the title card.
   */
  constructor({ speak, translate, settings, choices = {}, tagline, onStrictness, onSettings, onRecheck }) {
    this.frame = byId('camera-frame');
    this.skeleton = byId('skeleton');
    this.meter = new MouthMeter(byId('mouth-meter'));
    this.prompt = new PromptBox(speak, translate);
    this.confetti = new Confetti(byId('confetti'));
    this.count = byId('count');
    byId('tagline').textContent = tagline;

    // The grown-ups' panel.
    this.panel = byId('panel');
    this.panelMouth = new PanelMouth(byId('panel-mouth'), onStrictness);
    this.panelMouth.setStrictness(settings.mouthStrictness);
    this.panelUpdatedAt = 0;

    for (const name of ['language', ...Object.keys(choices)]) {
      // A saved value from an older version may no longer be one of the choices.
      const input = document.querySelector(`input[name="${name}"][value="${settings[name]}"]`);
      if (input) input.checked = true;
    }
    byId('setting-sound').checked = settings.sound;
    byId('setting-voice').checked = settings.voice;
    for (const input of document.querySelectorAll('input[name="language"]')) {
      input.addEventListener('change', () => onSettings({ language: input.value }));
    }
    for (const [name, read] of Object.entries(choices)) {
      for (const input of document.querySelectorAll(`input[name="${name}"]`)) {
        input.addEventListener('change', () => onSettings({ [name]: read(input.value) }));
      }
    }
    byId('setting-sound').addEventListener('change', (event) => onSettings({ sound: event.target.checked }));
    byId('setting-voice').addEventListener('change', (event) => onSettings({ voice: event.target.checked }));
    byId('recheck').addEventListener('click', onRecheck);
    byId('close-panel').addEventListener('click', () => this.panel.close());
  }

  setCameraAspect(aspect) {
    document.documentElement.style.setProperty('--camera-aspect', String(aspect));
  }

  /** Called on every new tracker result. */
  update(snapshot) {
    drawFace(this.skeleton, snapshot);
    this.meter.update(snapshot);
    this.frame.dataset.ready = snapshot.mouthOpen ? 'open' : 'not-open';
    // The outline of where to put a face shows while there's none to be seen.
    this.frame.dataset.face = snapshot.seen ? 'seen' : 'missing';
    if (this.panel.open && performance.now() - this.panelUpdatedAt > 100) {
      this.panelUpdatedAt = performance.now();
      this.panelMouth.update(snapshot);
    }
  }

  setCheckProgress(progress) {
    byId('check-progress-fill').style.width = percent(progress);
  }

  setCount(text) {
    if (this.count.textContent === text) return;
    this.count.textContent = text;
    // Restart the pop animation for each new number.
    this.count.classList.remove('pop');
    void this.count.offsetWidth;
    if (text) this.count.classList.add('pop');
  }

  showProblem(title, detail) {
    byId('problem-title').textContent = title;
    byId('problem-detail').textContent = detail;
  }

  /** hero is the big number, noun is what to call a round, and rows fills any extra rows, by their ids. */
  showSummary(stats, { hero, noun, rows = {}, won }) {
    const share = stats.seconds > 0 ? stats.openSeconds / stats.seconds : 0;
    byId('sum-open').textContent = `${clockTime(stats.openSeconds)} (${percent(share)})`;
    byId('sum-open-bar').style.width = percent(share);
    byId('sum-openings').textContent = String(stats.openings);
    byId('sum-hold').textContent = secondsText(stats.longestHold);
    byId('sum-peak').textContent = `${percent(Math.min(1, stats.peak))} of the widest in the check`;
    for (const [row, value] of Object.entries(rows)) byId(`sum-${row}`).textContent = String(value);
    byId('finish-hero').textContent = String(hero);
    byId('finish-open').textContent = `Mouth open for ${clockTime(stats.openSeconds)} of a ${clockTime(stats.seconds)} ${noun}`;
    // Confetti is for a game that was won, or that couldn't be lost.
    if (won === false) this.confetti.stop();
    else this.confetti.start();
  }

  hideSummary() {
    this.confetti.stop();
  }
}
