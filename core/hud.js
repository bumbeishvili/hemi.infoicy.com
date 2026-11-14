// Everything drawn over the game: hand meters, prompts, the camera overlay, the summary
// and the grown-ups' panel. Hand state is never shown by colour alone: each state also
// has its own shape and word.
import { FINGER_NAMES, OPEN_RULES } from './hands.js';
import { CHOICES, choiceOf, fingersUp, isShaped } from './shapes.js';
import { MappingPicker, shapeIcon } from './mapping-ui.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const byId = (id) => document.getElementById(id);
const percent = (value) => `${Math.round(value * 100)}%`;
const clockTime = (seconds) => {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};
const secondsText = (seconds) => (seconds < 60 ? `${Math.round(seconds)} sec` : clockTime(seconds));

function svgNode(tag, attributes, parent) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  parent?.append(node);
  return node;
}

const RING_RADIUS = 52;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
// Drawn with the thumb on the right, which is the hand on the left of the screen.
const ICON_FINGERS = {
  pinky: { x: 44, reach: 19 },
  ring: { x: 53.5, reach: 26 },
  middle: { x: 63, reach: 29 },
  index: { x: 72.5, reach: 25 },
};
const STATE_WORDS = { open: 'Open', closed: 'Open me', missing: 'Can’t see' };
// With a shape chosen for the open move, rather than the open hand.
const SHAPE_WORDS = { made: 'Yes!', wanted: 'Show me' };
const PROBLEM_WORDS = { edge: 'Too far out', small: 'Too far away', overlap: 'Too close' };

/** A ring that fills with how open the hand is, around a little hand that copies theirs. */
class HandMeter {
  constructor(slot, side) {
    this.root = slot;
    slot.classList.add('meter');
    this.side = side;

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

    const hand = svgNode('g', side === 'right' ? { transform: 'translate(120 0) scale(-1 1)', class: 'meter-hand' } : { class: 'meter-hand' }, svg);
    svgNode('rect', { x: 39, y: 58, width: 38, height: 33, rx: 13 }, hand);
    this.fingerLines = {};
    for (const [name, { x }] of Object.entries(ICON_FINGERS)) {
      this.fingerLines[name] = svgNode('line', { x1: x, y1: 62, x2: x, y2: 58 }, hand);
    }
    this.fingerLines.thumb = svgNode('line', { x1: 75, y1: 78, x2: 72, y2: 74 }, hand);

    this.mark = svgNode('text', { class: 'meter-mark', x: 60, y: 62, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, svg);

    const caption = document.createElement('div');
    caption.className = 'meter-caption';
    const name = document.createElement('span');
    name.className = 'meter-name';
    name.textContent = side === 'left' ? 'Left' : 'Right';
    this.word = document.createElement('span');
    this.word.className = 'meter-word';
    caption.append(name, this.word);
    slot.append(caption);
  }

  update(view, { showTarget }) {
    this.root.dataset.state = view.status;
    // How far the hand is towards the open move: how open it is, or with a shape for it, how sure it is of that.
    const shown = view.status === 'missing' ? 0 : view.level ?? view.openness;
    this.fill.setAttribute('stroke-dasharray', `${RING_LENGTH * shown} ${RING_LENGTH}`);
    // A round line cap would otherwise draw a dot at zero.
    this.fill.classList.toggle('is-hidden', shown < 0.01);

    this.tick.setAttribute('transform', `rotate(${(view.line ?? view.target) * 360} 60 60)`);
    this.tick.classList.toggle('is-hidden', !showTarget || view.status === 'missing');

    for (const [name, { x, reach }] of Object.entries(ICON_FINGERS)) {
      this.fingerLines[name].setAttribute('y2', 58 - 3 - reach * view.fingers[name]);
      this.fingerLines[name].setAttribute('x2', x + (x - 58) * 0.14 * view.fingers[name]);
    }
    const thumb = view.fingers.thumb;
    this.fingerLines.thumb.setAttribute('x2', 72 + 21 * thumb);
    this.fingerLines.thumb.setAttribute('y2', 74 - 12 * thumb);

    this.mark.textContent = view.status === 'open' ? '✓' : view.status === 'missing' ? '?' : '';
    const shaped = view.shape && view.shape !== 'open';
    this.word.textContent = view.status === 'open'
      ? (shaped ? SHAPE_WORDS.made : STATE_WORDS.open)
      : (PROBLEM_WORDS[view.reason] ?? (shaped && view.status === 'closed' ? SHAPE_WORDS.wanted : STATE_WORDS[view.status]));
  }
}

/**
 * A ghost hand in the mirror showing where to put a hand, and how big it should look.
 * The tracker only finds a new hand once its palm is about 15% of the picture's height,
 * so this is drawn a little larger, at about 20%. It follows a hand out to about 6% after
 * that. The size is set in style.css.
 */
function makeHandGuide(parent, side) {
  const svg = svgNode('svg', { viewBox: '32 18 66 80', class: `hand-guide hand-guide-${side}`, 'aria-hidden': 'true' }, parent);
  const hand = svgNode('g', side === 'right' ? { transform: 'translate(130 0) scale(-1 1)' } : {}, svg);
  svgNode('rect', { x: 39, y: 58, width: 38, height: 33, rx: 13 }, hand);
  for (const { x, reach } of Object.values(ICON_FINGERS)) {
    svgNode('line', { x1: x, y1: 62, x2: x + (x - 58) * 0.14, y2: 55 - reach }, hand);
  }
  svgNode('line', { x1: 75, y1: 78, x2: 93, y2: 62 }, hand);
  return svg;
}

const BONES = {
  thumb: [0, 1, 2, 3, 4],
  index: [0, 5, 6, 7, 8],
  middle: [0, 9, 10, 11, 12],
  ring: [0, 13, 14, 15, 16],
  pinky: [0, 17, 18, 19, 20],
};
const PALM_LINE = [5, 9, 13, 17];
const STRAIGHT_FINGER = 0.55;

/**
 * Draws what the tracker sees on the mirror view, each finger coloured by its own state. With other, the hand
 * that isn't in play is drawn too, for a game played with both. links, if a game gives them, are pairs of a
 * hand's points to join with a bright line, as { play, other }: a thumb and the finger it's pinched against.
 */
function drawSkeleton(canvas, snapshot, { other = false, links = null } = {}) {
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
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const scale = Math.max(1.4, width / 220);

  const hands = [[snapshot.left, 'play'], [snapshot.right, 'play']];
  if (other) hands.push([snapshot.other, 'other']);
  for (const [hand, which] of hands) {
    if (!hand?.image) continue;
    const at = (index) => [hand.image[index].x * width, hand.image[index].y * height];
    const stroke = (indices, colour, lineWidth) => {
      ctx.beginPath();
      indices.forEach((index, order) => (order ? ctx.lineTo(...at(index)) : ctx.moveTo(...at(index))));
      ctx.strokeStyle = colour;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    };
    stroke(PALM_LINE, 'rgba(255,255,255,0.9)', scale * 1.6);
    for (const name of FINGER_NAMES) {
      const straight = hand.fingers[name] >= STRAIGHT_FINGER;
      stroke(BONES[name], 'rgba(18,48,77,0.55)', scale * 3.2);
      stroke(BONES[name], straight ? '#35e07a' : '#ffb703', scale * 2);
    }
    ctx.fillStyle = '#ffffff';
    for (const index of [4, 8, 12, 16, 20]) {
      const [x, y] = at(index);
      ctx.beginPath();
      ctx.arc(x, y, scale * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const pair of links?.[which] ?? []) {
      stroke(pair, 'rgba(18,48,77,0.7)', scale * 4.4);
      stroke(pair, '#ffd23f', scale * 2.8);
    }
  }
}

const PROMPT_APPEARS_MS = 260;
const PROMPT_CLEARS_MS = 160;
const VOICE_REPEAT_MS = 9000;
const VOICE_MAX_REPEATS = 2;

/** Holds prompts steady so they don't flicker, and stops nagging after a few repeats. */
export class PromptBox {
  /** onShown hears each prompt as it's shown, and null as it goes. */
  constructor(speak, translate, onShown = () => {}) {
    this.speak = speak;
    this.translate = translate;
    this.onShown = onShown;
    this.root = byId('prompt');
    this.text = byId('prompt-text');
    this.arrowLeft = byId('prompt-arrow-left');
    this.arrowRight = byId('prompt-arrow-right');
    this.shownKey = null;
    this.candidateKey = null;
    this.candidateSince = 0;
    this.spokenAt = 0;
    this.spokenTimes = 0;
    this.spokenKey = null;
  }

  show(prompt, now, { immediate = false, silent = false } = {}) {
    const key = prompt?.key ?? null;
    if (key !== this.candidateKey) {
      this.candidateKey = key;
      this.candidateSince = now;
    }
    const wait = key === null ? PROMPT_CLEARS_MS : PROMPT_APPEARS_MS;
    if (key !== this.shownKey && (immediate || now - this.candidateSince >= wait)) {
      this.shownKey = key;
      this.root.classList.toggle('is-visible', key !== null);
      this.text.textContent = prompt ? this.translate(prompt.text) : '';
      this.arrowLeft.classList.toggle('is-visible', prompt?.side === 'left');
      this.arrowRight.classList.toggle('is-visible', prompt?.side === 'right');
      this.onShown(prompt);
    }
    // A prompt can say it's only to be read, for something that has already been said once.
    if (prompt && key === this.shownKey && !silent && !prompt.silent) this.voice(prompt, now);
  }

  voice(prompt, now) {
    if (prompt.key !== this.spokenKey) {
      this.spokenKey = prompt.key;
      this.spokenTimes = 0;
      this.spokenAt = -Infinity;
    }
    if (this.spokenTimes >= VOICE_MAX_REPEATS || now - this.spokenAt < VOICE_REPEAT_MS) return;
    // Muted, or something else is being said: this runs every frame, so it tries again.
    if (!this.speak(prompt.text)) return;
    this.spokenAt = now;
    this.spokenTimes += 1;
  }

  clear() {
    this.show(null, Infinity, { immediate: true });
    this.spokenKey = null;
  }
}

/** A gentle fall of paper at the finish. Off for anyone who prefers reduced motion. */
export class Confetti {
  constructor(canvas) {
    this.canvas = canvas;
    this.running = false;
    this.pieces = [];
  }

  start() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    const colours = ['#ff5a4f', '#ffd23f', '#27c96b', '#3b82f6', '#a855f7'];
    this.pieces = Array.from({ length: 110 }, () => ({
      x: Math.random() * this.canvas.width,
      y: -Math.random() * this.canvas.height,
      size: 7 + Math.random() * 8,
      fall: 45 + Math.random() * 60,
      sway: Math.random() * Math.PI * 2,
      colour: colours[Math.floor(Math.random() * colours.length)],
    }));
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame((time) => this.draw(time));
  }

  stop() {
    this.running = false;
  }

  draw(time) {
    if (!this.running) return;
    const dt = Math.min(0.05, (time - this.last) / 1000);
    this.last = time;
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    let anyLeft = false;
    for (const piece of this.pieces) {
      piece.y += piece.fall * dt;
      piece.sway += dt * 1.4;
      if (piece.y < this.canvas.height + 20) anyLeft = true;
      ctx.save();
      ctx.translate(piece.x + Math.sin(piece.sway) * 22, piece.y);
      ctx.rotate(piece.sway * 0.7);
      ctx.fillStyle = piece.colour;
      ctx.fillRect(-piece.size / 2, -piece.size / 3, piece.size, (piece.size * 2) / 3);
      ctx.restore();
    }
    if (anyLeft) requestAnimationFrame((next) => this.draw(next));
    else this.running = false;
  }
}

class PanelHand {
  constructor(parent, side, onStrictness) {
    const title = side === 'left' ? 'Left hand' : 'Right hand';
    const block = document.createElement('section');
    block.className = 'panel-hand';
    block.dataset.side = side;
    parent.append(block);

    const heading = document.createElement('h3');
    heading.textContent = title;
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

    const fingers = document.createElement('div');
    fingers.className = 'finger-bars';
    this.fingerFills = {};
    for (const name of FINGER_NAMES) {
      const item = document.createElement('div');
      item.className = 'finger-bar';
      const track = document.createElement('div');
      track.className = 'finger-track';
      const fill = document.createElement('div');
      fill.className = 'finger-fill';
      track.append(fill);
      const label = document.createElement('span');
      label.textContent = name[0].toUpperCase() + name.slice(1);
      item.append(track, label);
      fingers.append(item);
      this.fingerFills[name] = fill;
    }

    const sliderLabel = document.createElement('label');
    sliderLabel.className = 'strictness';
    sliderLabel.textContent = 'How open counts as open';
    this.slider = document.createElement('input');
    this.slider.type = 'range';
    this.slider.min = 50;
    this.slider.max = 100;
    this.slider.step = 5;
    this.sliderValue = document.createElement('output');
    sliderLabel.append(this.slider, this.sliderValue);
    this.sliderLabel = sliderLabel;
    this.slider.addEventListener('input', () => {
      this.sliderValue.textContent = `${this.slider.value}% of best`;
      onStrictness(side, Number(this.slider.value) / 100);
    });

    this.note = document.createElement('p');
    this.note.className = 'panel-note';

    block.append(heading, bar, this.numbers, fingers, sliderLabel, this.note);
  }

  setStrictness(value) {
    this.slider.value = Math.round(value * 100);
    this.sliderValue.textContent = `${this.slider.value}% of best`;
  }

  update(view, otherHandSeen = false) {
    const missing = otherHandSeen ? '? Only sees the other hand' : '? Not in view';
    this.state.textContent = view.status === 'open' ? '✓ Open' : view.status === 'missing' ? missing : 'Not open';
    this.state.dataset.state = view.status;
    const shaped = view.shape && view.shape !== 'open';
    const level = view.status === 'missing' ? 0 : view.level ?? view.openness;
    this.barFill.style.width = percent(level);
    this.barTarget.style.left = percent(view.line ?? view.target);
    this.sliderLabel.hidden = shaped;
    this.numbers.textContent = shaped
      ? `Shape now ${percent(level)} sure · needs ${percent(view.line)}`
      : view.checked
        ? `Now ${percent(level)} · needs ${percent(view.target)} · best today ${percent(view.best)}`
        : `Now ${percent(level)} · needs ${percent(view.target)} · hand check not done yet`;
    for (const name of FINGER_NAMES) {
      this.fingerFills[name].style.height = percent(view.status === 'missing' ? 0 : view.fingers[name]);
    }
    const belowFloor = !shaped && view.checked && view.best < OPEN_RULES.floor;
    this.note.classList.toggle('is-visible', belowFloor);
    this.note.textContent = belowFloor
      ? `The hand check reached ${percent(view.best)}. The game always needs at least ${percent(OPEN_RULES.floor)} so that a fist can never count as open. Try the check again with fingers as straight as they’ll comfortably go.`
      : '';
  }
}

// Fewer pictures a second than this, and a game feels slow.
const SLOW_BELOW = 45;

export class Hud {
  /**
   * choices names the game's own settings in the panel, as radio groups, or as a drop-down for one with a long
   * list to choose from, and how to read each one's value: for example { laps: Number }. moves and shapes are the game's moves and the hand
   * shapes for them (see core/shapes.js), and onShape(choice) hears a grown-up choose another for the open move.
   *
   * mapping is for a game that gives more than its open move to its hands (see GameSession): its rows go under
   * the open move's in the same picker, given holds what's chosen for each, and onGiven(id, value) hears a change.
   */
  constructor({ speak, translate, settings, choices = {}, tagline, moves = { open: 'Play', closed: null }, shapes, onShape = () => {}, mapping = null, given = {}, onGiven = () => {}, onStrictness, onSettings, onRecheck }) {
    this.tagline = tagline;
    this.moves = moves;
    this.frame = byId('camera-frame');
    this.skeleton = byId('skeleton');
    // For a game played with both hands: the hand that isn't in play is drawn on the mirror too, and links() says
    // which of each hand's points to join, as { play, other }. See drawSkeleton.
    this.bothHands = false;
    this.links = null;
    this.meters = {
      left: new HandMeter(byId('meter-left'), 'left'),
      right: new HandMeter(byId('meter-right'), 'right'),
    };
    this.guides = {
      left: makeHandGuide(this.frame, 'left'),
      right: makeHandGuide(this.frame, 'right'),
    };
    this.wheel = byId('wheel');
    // A prompt asking for a move's shape shows the shape too, in the hand demo.
    this.prompt = new PromptBox(speak, translate, (prompt) => this.showShapeHint(prompt?.move ?? null));
    this.demo = document.querySelector('.hand-demo');
    this.shapeNote = byId('shape-note');
    this.confetti = new Confetti(byId('confetti'));
    this.count = byId('count');

    // The grown-ups' panel.
    this.panel = byId('panel');
    this.panelHands = {
      left: new PanelHand(byId('panel-hands'), 'left', onStrictness),
      right: new PanelHand(byId('panel-hands'), 'right', onStrictness),
    };
    this.panelHands.left.setStrictness(settings.strictness.left);
    this.panelHands.right.setStrictness(settings.strictness.right);
    this.panelUpdatedAt = 0;
    // What does what: the open move's hand shape, and anything else the game gives to its hands. One picker
    // for every game: see core/mapping-ui.js.
    this.given = { ...given };
    this.picker = new MappingPicker(byId('panel-shapes'), {
      legend: mapping?.legend ?? 'Hand shapes',
      lead: mapping?.lead ?? 'Which hand shape makes the move in this game. Pointing or a few fingers can be easier than a whole open hand, and good practice too.',
      rest: moves.closed ? `${moves.closed}: any other hand, as when it rests.` : 'Any other hand rests.',
      rows: [{ id: 'open', name: moves.open, options: mapping?.open?.options ?? CHOICES, hand: mapping?.open?.hand }, ...(mapping?.rows ?? [])],
      onChange: (id, value) => (id === 'open' ? onShape(value) : onGiven(id, value)),
    });
    if (shapes) this.setShapes(shapes);

    for (const name of ['hands', 'language', ...Object.keys(choices)]) {
      // A saved value from an older version may no longer be one of the choices.
      const input = document.querySelector(`input[name="${name}"][value="${settings[name]}"]`);
      if (input) input.checked = true;
      const list = document.querySelector(`select[name="${name}"]`);
      if (list && [...list.options].some((option) => option.value === String(settings[name]))) list.value = String(settings[name]);
    }
    byId('setting-sound').checked = settings.sound;
    byId('setting-voice').checked = settings.voice;
    this.setHands(settings.hands);

    for (const input of document.querySelectorAll('input[name="hands"]')) {
      input.addEventListener('change', () => onSettings({ hands: input.value }));
    }
    for (const input of document.querySelectorAll('input[name="language"]')) {
      input.addEventListener('change', () => onSettings({ language: input.value }));
    }
    for (const [name, read] of Object.entries(choices)) {
      for (const input of document.querySelectorAll(`input[name="${name}"], select[name="${name}"]`)) {
        input.addEventListener('change', () => onSettings({ [name]: read(input.value) }));
      }
    }
    byId('setting-sound').addEventListener('change', (event) => onSettings({ sound: event.target.checked }));
    byId('setting-voice').addEventListener('change', (event) => onSettings({ voice: event.target.checked }));
    byId('recheck').addEventListener('click', onRecheck);
    byId('close-panel').addEventListener('click', () => this.panel.close());
  }

  /**
   * The hand shapes for the game's moves: in the panel, on the title card, and in the hand demo, which shows the
   * open move's shape during the hand check, and whenever a prompt asks for it.
   */
  setShapes(shapes) {
    this.shapes = shapes;
    this.picker.set({ ...this.given, open: choiceOf(shapes.open) });
    const shaped = isShaped(shapes);
    this.shapeNote.hidden = !shaped;
    this.shapeNote.innerHTML = shaped ? `<span class="shape-note-move">${shapeIcon(shapes.open)} ${this.moves.open}: ${shapes.open.name}</span>` : '';
    this.showShapeHint(null);
  }

  /** What's chosen for everything else a game gives to its hands, as { id: value }: shown in the panel. */
  setGiven(given) {
    this.given = { ...given };
    if (this.shapes) this.picker.set({ ...this.given, open: choiceOf(this.shapes.open) });
  }

  /**
   * How it's running, at the foot of the panel: pictures drawn a second, and looks at the hands a second while
   * the camera is on. Under about 45 pictures a second a game feels slow, and the panel says what can help.
   */
  showPace({ frames, looks }, camera) {
    if (!this.panel.open) return;
    const hands = camera ? ` and reading the hands ${looks} times a second` : '';
    const slow = frames < SLOW_BELOW ? ' That’s slow for these games: closing other tabs and programs, and plugging the computer in, can help.' : '';
    byId('panel-pace').textContent = `This computer is drawing ${frames} pictures a second${hands}.${slow}`;
  }

  showShapeHint(move) {
    if (!this.shapes) return;
    const shape = this.shapes.open;
    document.body.toggleAttribute('data-shape-hint', Boolean(move === 'open' && shape.fingers));
    this.demo.toggleAttribute('data-shaped', Boolean(shape.fingers));
    const up = new Set(fingersUp(shape));
    for (const finger of this.demo.querySelectorAll('[data-finger]')) finger.classList.toggle('is-up', up.has(finger.dataset.finger));
  }

  setCameraAspect(aspect) {
    document.documentElement.style.setProperty('--camera-aspect', String(aspect));
  }

  /** Everything about the hand that isn't in play is hidden with this, in base.css. */
  setHands(side) {
    document.body.dataset.hands = side;
    byId('tagline').textContent = this.tagline(side);
  }

  /** Called on every new tracker result. */
  updateHands(snapshot) {
    drawSkeleton(this.skeleton, snapshot, { other: this.bothHands, links: this.links?.() ?? null });
    const showTarget = snapshot[snapshot.side].checked;
    this.meters.left.update(snapshot.left, { showTarget });
    this.meters.right.update(snapshot.right, { showTarget });
    for (const side of ['left', 'right']) {
      this.guides[side].classList.toggle('is-wanted', snapshot.side === side && snapshot[side].status === 'missing');
    }
    if (this.wheel) this.wheel.style.transform = `rotate(${snapshot.steer * 55}deg)`;
    this.frame.dataset.ready = snapshot.handOpen ? 'open' : 'not-open';

    if (this.panel.open && performance.now() - this.panelUpdatedAt > 100) {
      this.panelUpdatedAt = performance.now();
      this.panelHands.left.update(snapshot.left, snapshot.otherHandSeen);
      this.panelHands.right.update(snapshot.right, snapshot.otherHandSeen);
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

  /** hero is the big number, noun is what to call a round, and rows fills any extra rows. */
  showSummary(stats, side, { hero, noun, rows = {}, won }) {
    const handRow = (side) => {
      const hand = stats[side];
      const share = stats.seconds > 0 ? hand.openSeconds / stats.seconds : 0;
      byId(`sum-${side}-open`).textContent = `${clockTime(hand.openSeconds)} (${percent(share)})`;
      byId(`sum-${side}-open-bar`).style.width = percent(share);
      byId(`sum-${side}-openings`).textContent = String(hand.openings);
      byId(`sum-${side}-hold`).textContent = secondsText(hand.longestHold);
      byId(`sum-${side}-peak`).textContent = percent(hand.peak);
    };
    handRow('left');
    handRow('right');
    for (const [row, values] of Object.entries(rows)) {
      for (const hand of ['left', 'right']) byId(`sum-${hand}-${row}`).textContent = String(values[hand]);
    }
    byId('finish-hero').textContent = String(hero);
    const who = side === 'left' ? 'Left hand' : 'Right hand';
    byId('finish-open').textContent = `${who} open for ${clockTime(stats.handOpenSeconds)} of a ${clockTime(stats.seconds)} ${noun}`;
    // Confetti is for a game that was won, or that couldn't be lost.
    if (won === false) this.confetti.stop();
    else this.confetti.start();
  }

  hideSummary() {
    this.confetti.stop();
  }
}
