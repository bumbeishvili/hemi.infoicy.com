// Getting through Swamp Splash in the tests. In place of the webcam there is footage of a real person, read by the
// real tracker: standing still (strikes.webm, held still), jumping (jumps.webm: three burpees, each ending in a real
// jump), star jumps (star-jumps.webm), a slow squat (squat.webm), and lifting one foot and then the other
// (stands.webm). Where a test is about what comes after a jump, it says what a tracked body would do by calling
// the rules in the page.
import { expect, openGame, test, waitForScreen } from '../helpers.js';

export { judge, watchBrightness } from '../giraffe-garden/helpers.js';
export { expect, test, waitForScreen };

export const GAME = 'swamp-splash';
export const GRID = { wide: 32, high: 18 };

// The colours view.js draws, as [r, g, b].
export const MUD = { fill: [123, 82, 48], edge: [92, 59, 31], light: [148, 106, 64] };
export const GOLD = { fill: [226, 178, 58], edge: [179, 132, 28], light: [246, 216, 119] };

/** Settings for a game at a level. */
export const atLevel = (level, settings = {}) => ({ levels: { [GAME]: level }, ...settings });

export async function openSwamp(page, settings = {}) {
  await openGame(page, settings, GAME);
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'yes');
}

export const footage = (page, name, options = {}) =>
  page.evaluate(([clip, settings]) => window.__camera.showFootage(clip, settings), [name, options]);

/** A person standing still, in full view, which is what the body check wants. They never jump. */
export const standInView = (page) => footage(page, 'strikes', { from: 0.2, playing: false });

/** Three burpees, over and over, each ending in a real jump. */
export const jumping = (page) => footage(page, 'jumps');

/** Three jumping jacks, over and over: star jumps, arms and legs out. */
export const starJumping = (page) => footage(page, 'star-jumps');

/** The person of stands.webm on both feet, held still. */
export const onBothFeet = (page) => footage(page, 'stands', { from: 0.5, playing: false });

/**
 * The same footage playing on from 20 seconds: the right foot lifted 30 centimetres and held from 21 to 24.5
 * seconds, both feet down, and the left the same from 27.5 to 31.
 */
export const liftingAFoot = (page) => footage(page, 'stands', { from: 20, playing: true });

/** An empty room. */
export const nobody = (page) => page.evaluate(() => window.__camera.showNobody());

/** From the title to the game being played, with a person in view: standing still, unless a test says. */
export async function reachPlay(page, settings = {}, person = standInView) {
  await openSwamp(page, settings);
  await person(page);
  await page.locator('#start').click();
  await waitForScreen(page, 'choose');
  await page.locator('#swamp-start').click();
  await waitForScreen(page, 'playing');
}

/** What the rules say right now, and what the screen has of it. */
export const state = (page) => page.evaluate(() => {
  const { swamp, game, view } = window.__game;
  const copy = (value) => (value ? JSON.parse(JSON.stringify(value)) : value);
  return {
    screen: game.screen,
    level: swamp?.levelNumber,
    current: game.levels.current,
    state: swamp?.state,
    coverage: swamp?.coverage,
    muddy: swamp?.muddy,
    time: swamp?.time,
    cloud: swamp?.cloud,
    seconds: swamp?.rules.seconds,
    target: swamp?.rules.target,
    rules: swamp && { ...swamp.rules },
    stats: copy(swamp?.stats),
    mud: swamp ? [...swamp.mud] : [],
    shower: copy(swamp?.shower),
    bubble: copy(swamp?.bubble),
    bubbleBig: swamp?.bubbleBig,
    heron: copy(swamp?.heron),
    wind: copy(swamp?.wind),
    golden: swamp?.golden,
    bent: swamp?.bent,
    air: Boolean(window.__game.air),
    jump: view.jump,
    high: game.high,
    film: game.demo.playing?.name ?? null,
  };
});

export const expectSoon = (read, options = {}) => expect.poll(read, { timeout: 45_000, intervals: [100], ...options });

/**
 * Notes what the rules say happens in this game, from now on: window.__heard, each with when it was heard. The
 * game hears all of it as before.
 */
export const listen = (page) => page.evaluate(() => {
  const { swamp } = window.__game;
  window.__heard = [];
  const tell = swamp.onEvent;
  swamp.onEvent = (event) => {
    const { type, kind, size, big, bent, popped, star, fresh, golden, why, x, y } = event;
    // Which squares were washed, wiped or dried, and how many a splat had.
    const list = type === 'clean' ? [...event.cells] : undefined;
    window.__heard.push({ type, kind, size, big, bent, popped, star, fresh, golden, why, x, y, cells: event.cells?.length, list, at: performance.now() });
    tell(event);
  };
});

/** What has been heard, or only the events of one type. */
export const heard = (page, type = null) => page.evaluate((only) => (window.__heard ?? []).filter((event) => !only || event.type === only), type);

/** Jumps of these sizes land, one after another, as a tracked body's would. */
export const lands = (page, ...sizes) => page.evaluate((list) => {
  for (const size of list) window.__game.swamp.land(size);
}, sizes);

/**
 * Jumps of this size land until the window is at least this muddy. It's for getting a game ready for something
 * else, so a test that asks for so much that the last jump wins is a mistake in the test, and says so.
 */
export const muddyTo = async (page, share, size = 2.2) => {
  const { coverage, state: now } = await page.evaluate(([most, jump]) => {
    const { swamp } = window.__game;
    while (swamp.state === 'play' && swamp.coverage < most) swamp.land(jump);
    return { coverage: swamp.coverage, state: swamp.state };
  }, [share, size]);
  expect(now, `the window made ${Math.round(share * 100)}% muddy with jumps of ${size} is still being played`).toBe('play');
  return coverage;
};

/** Waits until every square on the screen shows what the rules say it is. */
export const settled = (page) => expectSoon(() => page.evaluate(() => {
  const { swamp, view } = window.__game;
  return [...swamp.mud].every((mud, cell) => view.shown[cell] === (mud ? 1 : 0));
}), { timeout: 20_000 }).toBe(true);

/** The colours on the game's canvas at places on the screen, in CSS pixels, once the next frame is drawn. */
export const pixels = (page, places) => page.evaluate(async (list) => {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const { view } = window.__game;
  return list.map(({ x, y }) => [...view.ctx.getImageData(Math.round(x * view.ratio), Math.round(y * view.ratio), 1, 1).data].slice(0, 3));
}, places);

/** Where the middle of a square of the window is on the screen, in CSS pixels. */
export const middleOf = (cell, { width, height }) => ({
  x: ((cell % GRID.wide) + 0.5) * (width / GRID.wide),
  y: (Math.floor(cell / GRID.wide) + 0.5) * (height / GRID.high),
});

/** The colour on the canvas at the middle of each of these squares. */
export const squareColours = async (page, cells) => {
  const size = await page.evaluate(() => ({ width: window.__game.view.width, height: window.__game.view.height }));
  return pixels(page, cells.map((cell) => middleOf(cell, size)));
};

export const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** How far a colour is from the line between two others, which is the colours an edge between them can have. */
const fromLine = (colour, a, b) => {
  const along = [0, 1, 2].map((n) => b[n] - a[n]);
  const off = [0, 1, 2].map((n) => colour[n] - a[n]);
  const share = Math.min(1, Math.max(0, along.reduce((sum, value, n) => sum + value * off[n], 0) / along.reduce((sum, value) => sum + value * value, 0)));
  return distance(colour, [0, 1, 2].map((n) => a[n] + along[n] * share));
};

/**
 * Whether a colour is the mud's, its shine, or between the two, or its dark edge. The swamp has mud of its own
 * painted in the water, a paler mix of the mud and the water, and that isn't mud on the window.
 */
export const looksMuddy = (colour, look = MUD) => fromLine(colour, look.fill, look.light) < 14 || distance(colour, look.edge) < 12;

/** The same, as a function's source, for tests that read the screen in the page, frame by frame. */
export const LOOKS_MUDDY = `(colour, look) => {
  const along = [0, 1, 2].map((n) => look.light[n] - look.fill[n]);
  const off = [0, 1, 2].map((n) => colour[n] - look.fill[n]);
  const share = Math.min(1, Math.max(0, along.reduce((sum, value, n) => sum + value * off[n], 0) / along.reduce((sum, value) => sum + value * value, 0)));
  const near = Math.hypot(...[0, 1, 2].map((n) => colour[n] - (look.fill[n] + along[n] * share)));
  return near < 14 || Math.hypot(...[0, 1, 2].map((n) => colour[n] - look.edge[n])) < 12;
}`;

/**
 * The squares the character is drawn over, standing, crouching or landing, with one more all round: its picture
 * is brown in places too, and its shape changes as the child's knees bend.
 */
export const characterSquares = (page) => page.evaluate(({ wide, high }) => {
  const { view } = window.__game;
  const { art, width: w, height: h } = view;
  if (!art) return [];
  const scale = (h * 0.34) / art.tall;
  const feet = { x: w * 0.5, y: h * 0.8 };
  const box = { left: feet.x - art.foot.x * scale * 1.15, right: feet.x + (art.width - art.foot.x) * scale * 1.15, top: feet.y - art.foot.y * scale, bottom: feet.y + (art.height - art.foot.y) * scale };
  const [cw, ch] = [w / wide, h / high];
  const cells = [];
  for (let y = 0; y < high; y += 1) {
    for (let x = 0; x < wide; x += 1) {
      if ((x + 1.5) * cw > box.left && (x - 0.5) * cw < box.right && (y + 1.5) * ch > box.top && (y - 0.5) * ch < box.bottom) cells.push(y * wide + x);
    }
  }
  return cells;
}, GRID);

/** The squares within so many squares of a muddy one, and the muddy ones themselves. */
export function nearMud(mud, reach = 2) {
  const near = new Set();
  mud.forEach((value, cell) => {
    if (!value) return;
    const [cx, cy] = [cell % GRID.wide, Math.floor(cell / GRID.wide)];
    for (let y = cy - reach; y <= cy + reach; y += 1) {
      for (let x = cx - reach; x <= cx + reach; x += 1) if (x >= 0 && y >= 0 && x < GRID.wide && y < GRID.high) near.add(y * GRID.wide + x);
    }
  });
  return near;
}

/**
 * Reads how bright each part of the game's canvas is, frame by frame, until a condition holds and for so many
 * frames after it. each, if given, is run in the page before each frame is read, with the frame's number and
 * window.__game: as a string, as in '(n, { swamp }) => { if (n === 5) swamp.land(2.8); }'. until is a string too.
 */
export const watchUntil = (page, until, { after = 60, most = 4000, each = null } = {}) => page.evaluate(async ({ wanted, extra, limit, step }) => {
  const there = new Function('game', `return (${wanted})(game);`);
  const before = step ? new Function('n', 'game', `return (${step})(n, game);`) : null;
  const [wide, high] = [32, 18];
  const small = document.createElement('canvas');
  small.width = wide;
  small.height = high;
  const context = small.getContext('2d', { willReadFrequently: true });
  const canvas = document.getElementById('game');
  const reading = [];
  let left = null;
  for (let i = 0; i < limit && left !== 0; i += 1) {
    before?.(i, window.__game);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    context.drawImage(canvas, 0, 0, wide, high);
    const { data } = context.getImageData(0, 0, wide, high);
    const cells = new Array(wide * high);
    for (let j = 0; j < cells.length; j += 1) cells[j] = Math.round((data[j * 4] + data[j * 4 + 1] + data[j * 4 + 2]) / 3);
    const { swamp } = window.__game;
    reading.push({ at: performance.now(), cells, coverage: swamp?.coverage ?? 0, golden: swamp?.stats.stars ?? 0, state: swamp?.state });
    if (left === null && there(window.__game)) left = extra;
    else if (left !== null) left -= 1;
  }
  return { reading, reached: left !== null };
}, { wanted: until, extra: after, limit: most, step: each });

/** How many frames the page draws in a second, over a few seconds. */
export const framesASecond = (page, seconds = 4) => page.evaluate((long) => new Promise((done) => {
  let frames = 0;
  const started = performance.now();
  const count = () => {
    frames += 1;
    if (performance.now() - started > long * 1000) done(frames / long);
    else requestAnimationFrame(count);
  };
  requestAnimationFrame(count);
}), seconds);

/** Notes every line the voice is asked to say from now on, and whether it will be heard: window.__said. */
export const noteWhatIsSaid = (page) => page.evaluate(() => {
  const { sound } = window.__game;
  window.__said = [];
  const say = sound.say.bind(sound);
  sound.say = (text, options) => {
    const heardIt = say(text, options);
    window.__said.push({ text, heard: heardIt });
    return heardIt;
  };
});

export const said = (page) => page.evaluate(() => window.__said ?? []);

/**
 * Notes every word that flies up on the screen from now on: window.__callouts. They're only there for a moment,
 * which a busy computer can miss between two looks.
 */
export const noteCallouts = (page) => page.evaluate(() => {
  window.__callouts = [];
  new MutationObserver((changes) => {
    for (const { addedNodes } of changes) for (const node of addedNodes) window.__callouts.push(node.textContent);
  }).observe(document.getElementById('callouts'), { childList: true });
});

export const calloutsSeen = (page) => page.evaluate(() => window.__callouts ?? []);

/**
 * Notes, from now on, everything the character's film and the prompt say, and when the film comes and goes:
 * window.__asked, as { at, what: 'film' or 'prompt' or 'shown' or 'hidden', text }.
 */
export const noteAsked = (page) => page.evaluate(() => {
  window.__asked = [];
  const note = (what, text = null) => window.__asked.push({ at: performance.now(), what, text });
  const coach = document.getElementById('coach');
  new MutationObserver(() => note(coach.classList.contains('is-visible') ? 'shown' : 'hidden')).observe(coach, { attributes: true, attributeFilter: ['class'] });
  for (const [id, what] of [['coach-text', 'film'], ['prompt-text', 'prompt']]) {
    const element = document.getElementById(id);
    new MutationObserver(() => note(what, element.textContent)).observe(element, { childList: true, characterData: true, subtree: true });
  }
});

export const asked = (page) => page.evaluate(() => window.__asked ?? []);

/** Settings saved for the next time the page is opened, and the page opened again with them. */
export async function reopenWith(page, change) {
  await page.evaluate((settings) => {
    const saved = JSON.parse(localStorage.getItem('camera-games-settings'));
    localStorage.setItem('camera-games-settings', JSON.stringify({ ...saved, ...settings }));
  }, change);
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'yes');
}

/** From the title to the game being played again, in a page that's open, with a person standing in view. */
export async function playAgain(page, person = standInView) {
  await person(page);
  await page.locator('#start').click();
  await waitForScreen(page, 'choose');
  await page.locator('#swamp-start').click();
  await waitForScreen(page, 'playing');
}

export const shot = (page, name) => page.screenshot({ path: `test-results/screens/${name}.png` });
