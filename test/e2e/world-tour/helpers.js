// Playing Giraffe's World Tour in the tests, with real photos of hands going through the real tracker. A child is
// played by moving the photos of the hands that the fake camera shows, so that the gloves go where a child's would:
// over the country that's asked for, to the pot for the paint that's needed and across the flag, and up the pole.
import { expect, openGame, show, test, waitForScreen } from '../helpers.js';

export { judge, watchBrightness } from '../giraffe-garden/helpers.js';

export const GAME = 'world-tour';
export const OPEN = [null, 'open', { scale: 0.62 }];
export const FIST = [null, 'fist', { scale: 0.62 }];
export const NO_HAND = [null, null, { scale: 0.62 }];
// The gentle tour: there's always fuel, and nobody can lose.
export const GENTLE = { tourFuel: 'gentle' };
// One hand does it all: nothing has to be held.
export const ONE_HAND = { tourHold: 'never' };

/** Gets through the hand check with an open hand, as anyone would, and on into play. */
export async function startPlaying(page, settings = {}) {
  await openGame(page, settings, GAME);
  await show(page, ...(settings.hands === 'left' ? ['open', null, { scale: 0.62 }] : OPEN));
  await page.locator('#start').click();
  await waitForScreen(page, 'playing');
}

/** What the rules say right now, and where the gloves are on the screen. */
export const state = (page) => page.evaluate(() => {
  const { tour, game, view } = window.__game;
  const painting = tour.painting;
  return {
    level: tour.levelNumber,
    screen: window.__game.screen,
    state: tour.state,
    target: tour.target,
    choices: [...tour.choices],
    out: [...tour.out],
    over: tour.over,
    overFor: tour.overFor,
    flown: [...tour.flown],
    cans: tour.cans,
    stop: tour.stop,
    stops: [...tour.stops],
    paint: tour.paint,
    rollerOn: tour.rollerOn,
    hint: tour.hint && { ...tour.hint },
    held: tour.held,
    shown: tour.shown,
    gustShare: tour.gustShare,
    gustIn: tour.gust ? tour.gust.in : null,
    raisedTo: tour.raisedTo,
    gripped: tour.gripped,
    can: tour.can && { ...tour.can },
    stats: { ...tour.stats },
    rules: { ...tour.rules, wind: tour.rules.wind && { ...tour.rules.wind } },
    progress: painting ? painting.progress : null,
    done: painting ? [...painting.done] : null,
    shares: painting ? painting.done.map((_, part) => painting.share(part)) : null,
    counts: painting ? [...painting.counts] : null,
    parts: tour.flag ? tour.flag.parts.map(({ id, colour }) => ({ id, colour })) : null,
    colours: tour.flag ? { ...tour.flag.colours } : null,
    at: game.gloveOnScreen('play'),
    other: game.gloveOnScreen('other'),
    hover: game.hover,
    film: document.body.dataset.film === 'on' ? document.body.dataset.filmKind : null,
    cam: { at: [...view.cam.at], zoom: view.cam.zoom },
    plane: { x: view.plane.x, y: view.plane.y, shown: view.plane.shown },
  };
});

/**
 * Keeps the real hands' pictures moving, in the page, so the gloves go where they're told. aim says where the
 * hand in play goes:
 *   'target'            over the country that's asked for
 *   'country:POL'       over that country
 *   'pot:blue'          into that pot, or 'pot:roller'
 *   'flag:30,20'        to that place on the flag, in the flag's units
 *   'paint'             wherever a child would go next to paint the flag: to the pot that's needed, and then
 *                       over what's still bare of that colour
 *   'low' and 'high'    down by the foot of the pole, and up by its top
 *   'sweep'             back and forth across the whole flag, row by row, down it and back up, whatever is
 *                       there: 'sweep:56,85' only between those heights on the flag, in its units
 *   'can'               to the fuel can
 *   'play'              through the whole stop as a child would: 'target', then 'paint', then 'low' and 'high'
 *   { x, y }            a place on the screen, as shares of its width and height
 * photo is open, fist or none. other, if given, is the other hand: { photo, aim }, with aim 'hold' for the spot
 * where the flag is held, or a place on the screen. wobble is how far the hands wander round where they're going,
 * in screen heights, as hands that aren't steady do. Runs until stopHands.
 */
export const leadHands = (page, { aim = 'play', photo = 'open', other = null, side = 'right', gain = 0.1, wobble = 0 } = {}) => page.evaluate(({ aim: wanted, photo: picture, other: second, side: hand, gain: rate, wobble: shake }) => {
  window.__lead?.stop();
  const kept = window.__lead?.at ?? { play: { x: 0, y: 0 }, other: { x: 0, y: 0 } };
  const otherHand = hand === 'right' ? 'left' : 'right';
  const started = performance.now();
  let lifted = false;

  /** Where a child would put the brush next: the pot that's needed, or the nearest bare place of this colour. */
  const nextToPaint = (tour, view, from) => {
    const { painting, flag } = tour;
    const takes = flag.parts.map((part, number) => !painting.done[number] && part.colour === tour.paint);
    const pot = (paint) => view.pots.find((each) => each.paint === paint);
    if (!tour.paint || !takes.some(Boolean)) {
      const next = flag.parts.findIndex((_, number) => !painting.done[number]);
      return next < 0 ? null : pot(flag.parts[next].colour);
    }
    const here = from ? view.toFlag(from.x, from.y) : { x: 0, y: 0 };
    let [best, nearest] = [null, Infinity];
    for (let cell = 0; cell < painting.owner.length; cell += 1) {
      const part = painting.owner[cell];
      if (part < 0 || !takes[part] || painting.painted[cell]) continue;
      const [x, y] = [(cell % painting.wide) + 0.5, Math.floor(cell / painting.wide) + 0.5];
      // Along the rows first, as a hand sweeps, and never off towards the edge of the camera's picture for long.
      const far = Math.abs(y - here.y) * 2.2 + Math.abs(x - here.x);
      if (far < nearest) [best, nearest] = [{ x, y }, far];
    }
    return best && { x: view.board.x + best.x * view.board.unit, y: view.board.y + best.y * view.board.unit };
  };

  const place = (what, at) => {
    const { tour, view } = window.__game;
    if (!what) return null;
    if (typeof what === 'object') return { x: what.x * innerWidth, y: what.y * innerHeight };
    if (what === 'play') {
      if (tour.state === 'find') return place('target', at);
      if (tour.state === 'fly' && tour.can && !tour.can.taken) return place('can', at);
      if (tour.state === 'paint') return place('paint', at);
      if (tour.state === 'raise') {
        if (!tour.gripped) lifted = false;
        if (tour.gripped) lifted = true;
        return place(lifted ? 'high' : 'low', at);
      }
      return null;
    }
    if (what === 'target') return tour.state === 'find' ? view.onScreen(tour.places[tour.target]) : null;
    if (what.startsWith('country:')) return view.onScreen(tour.places[what.slice(8)]);
    if (what.startsWith('pot:')) return view.pots?.find((pot) => pot.paint === what.slice(4)) ?? null;
    if (what.startsWith('flag:')) {
      const [x, y] = what.slice(5).split(',').map(Number);
      return view.board ? { x: view.board.x + x * view.board.unit, y: view.board.y + y * view.board.unit } : null;
    }
    if (what === 'paint') return tour.state === 'paint' ? nextToPaint(tour, view, at) : null;
    if (what.startsWith('sweep')) {
      if (tour.state !== 'paint' || !view.board) return null;
      const [top, bottom] = what.includes(':') ? what.slice(6).split(',').map(Number) : [8, 92];
      // Rows no more than 10 apart, each taking 3 seconds, a little past each end of the flag so the hand gets
      // right to its edges.
      const rows = Math.max(2, Math.ceil((bottom - top) / 10) + 1);
      const t = (performance.now() - started) / 1000;
      const row = Math.floor(t / 3);
      const along = (t % 3) / 3;
      const turn = row % (rows * 2 - 2);
      const y = top + ((bottom - top) * (turn < rows ? turn : rows * 2 - 2 - turn)) / (rows - 1);
      const x = -6 + (tour.flag.wide + 12) * (row % 2 ? 1 - along : along);
      return { x: view.board.x + x * view.board.unit, y: view.board.y + y * view.board.unit };
    }
    if (what === 'low') return { x: innerWidth * 0.62, y: innerHeight * 0.76 };
    if (what === 'high') return { x: innerWidth * 0.62, y: innerHeight * 0.26 };
    if (what === 'can') return view.can;
    if (what === 'hold') return view.hold ?? null;
    return null;
  };

  const step = (which, what, shown, limits) => {
    const { game } = window.__game;
    const offset = kept[which];
    const at = game.gloveOnScreen(which);
    const to = place(what, at);
    if (at && to) {
      const t = (performance.now() - started) / 1000;
      const [wx, wy] = [Math.sin(t * 5.1) * shake * innerHeight, Math.cos(t * 3.7) * shake * innerHeight];
      offset.x += ((to.x + wx - at.x) / innerWidth) * 1280 * rate;
      offset.y += ((to.y + wy - at.y) / innerHeight) * 720 * rate;
    } else if (!at && shown) {
      // Lost, as a hand right at the edge of the picture can be: back towards the middle, as anyone would.
      offset.x *= 0.95;
      offset.y *= 0.95;
    }
    offset.x = Math.max(limits[0], Math.min(limits[1], offset.x));
    offset.y = Math.max(-260, Math.min(240, offset.y));
  };

  const timer = setInterval(() => {
    const mine = picture === 'none' ? null : picture;
    const theirs = second && second.photo !== 'none' ? second.photo ?? 'open' : null;
    // Each hand's photo starts on its own side of the picture, and can go right across it, but stays in it.
    step('play', wanted, mine, hand === 'left' ? [-220, 780] : [-780, 220]);
    if (second) step('other', second.aim ?? 'hold', theirs, otherHand === 'left' ? [-220, 780] : [-780, 220]);
    window.__camera.show({
      [hand]: mine,
      [otherHand]: theirs,
      scale: 0.62,
      [`${hand}OffsetX`]: kept.play.x,
      [`${hand}OffsetY`]: kept.play.y,
      [`${otherHand}OffsetX`]: kept.other.x,
      [`${otherHand}OffsetY`]: kept.other.y,
    });
  }, 33);
  window.__lead = { at: kept, stop: () => clearInterval(timer) };
}, { aim, photo, other, side, gain, wobble });

export const stopHands = (page) => page.evaluate(() => window.__lead?.stop());

export const expectSoon = (read, options = {}) => expect.poll(read, { timeout: 45_000, intervals: [100], ...options });

/** Waits until the tour is at a state: 'find', 'fly', 'land', 'paint', 'raise', 'settle', 'won' or 'lost'. */
export const waitForState = (page, name, timeout = 60_000) => expectSoon(async () => (await state(page)).state, { timeout }).toBe(name);

/** On to a later stop of the journey, as though the flags before it were up: for getting to something slow to reach. */
export const skipTo = (page, stop) => page.evaluate((n) => {
  const { tour } = window.__game;
  tour.stop = n;
  tour.flown = tour.stops.slice(0, n);
  tour.ask();
}, stop);

/** How far the glove is from a place on the screen, or a long way if it can't be seen. */
export const gloveFrom = async (page, where, which = 'at') => {
  const now = (await state(page))[which];
  return now && where ? Math.hypot(now.x - where.x, now.y - where.y) : 9999;
};

/**
 * Chooses a country as a child who knows where it is would: the closed hand goes over it, which chooses nothing,
 * and opens there, and the choice is waited for. After a wrong one the hand closes again where it is, before the
 * moment's rest is over, so that what's chosen next is the test's to say.
 */
export async function choose(page, id) {
  await leadHands(page, { aim: `country:${id}`, photo: 'fist' });
  await expectSoon(async () => (await state(page)).hover, { timeout: 30_000 }).toBe(id);
  await leadHands(page, { aim: `country:${id}` });
  await expectSoon(async () => {
    const now = await state(page);
    return now.state !== 'find' || now.out.includes(id);
  }, { timeout: 30_000 }).toBe(true);
  if ((await state(page)).state !== 'fly') await leadHands(page, { aim: `country:${id}`, photo: 'fist' });
}

/** Waits until the hand in play is seen as closed, or open. */
export const waitForHand = (page, status, side = 'right') => expectSoon(() => page.evaluate((hand) => window.__game.monitor.snapshot[hand].status, side), { timeout: 30_000 }).toBe(status);

/** Starts writing down, every frame, what the rules and the screen say. recorded() stops it and gives the frames. */
export const record = (page) => page.evaluate(() => {
  window.__frames = [];
  window.__recording = true;
  const tick = () => {
    if (!window.__recording) return;
    const { tour, game, view, monitor } = window.__game;
    const at = game.gloveOnScreen('play');
    window.__frames.push({
      t: performance.now(),
      state: tour.state,
      target: tour.target,
      over: tour.over,
      overFor: tour.overFor,
      hover: game.hover,
      at: Boolean(at),
      open: Boolean(at) && monitor.snapshot.handOpen === true,
      wrong: tour.stats.wrong,
      out: [...tour.out],
      film: document.body.dataset.film === 'on' ? document.body.dataset.filmKind : null,
      parts: tour.stats.parts,
      gripped: tour.gripped,
      cans: tour.cans,
      onCan: Boolean(at && tour.can && view.onCan(at.x, at.y)),
      taken: Boolean(tour.can?.taken),
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
export const recorded = (page) => page.evaluate(() => {
  window.__recording = false;
  return window.__frames;
});

/**
 * Reads how bright each part of the picture is, frame by frame, as watchBrightness does, from now until the tour
 * gets somewhere, and for some frames after. until is { state, screen, or a count of the tour's stats such as
 * parts: 1 or gusts: 2 }, all of which have to be so. Gives { reading, reached }, with the tour's state and how
 * far up the board is at each frame of the reading, so it can be judged a part at a time.
 */
export const watchUntil = (page, until, { after = 60, most = 4000 } = {}) => page.evaluate(async ({ wanted, extra, limit }) => {
  const there = () => {
    const { tour } = window.__game;
    return Object.entries(wanted).every(([key, value]) => {
      if (key === 'state') return tour.state === value;
      if (key === 'screen') return window.__game.screen === value;
      return (tour.stats[key] ?? 0) >= value;
    });
  };
  const [wide, high] = [32, 18];
  const small = document.createElement('canvas');
  small.width = wide;
  small.height = high;
  const context = small.getContext('2d', { willReadFrequently: true });
  const canvas = document.getElementById('game');
  const reading = [];
  let left = null;
  for (let i = 0; i < limit && left !== 0; i += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    context.drawImage(canvas, 0, 0, wide, high);
    const { data } = context.getImageData(0, 0, wide, high);
    const cells = new Array(wide * high);
    for (let j = 0; j < cells.length; j += 1) cells[j] = Math.round((data[j * 4] + data[j * 4 + 1] + data[j * 4 + 2]) / 3);
    const { tour, view } = window.__game;
    reading.push({ at: performance.now(), cells, state: tour.state, board: view.boardFor });
    if (left === null && there()) left = extra;
    else if (left !== null) left -= 1;
  }
  return { reading, reached: left !== null };
}, { wanted: until, extra: after, limit: most });

/** The colours on the screen at some places, as [r, g, b], once the next frame is drawn. */
export const screenPixels = (page, places) => page.evaluate(async (list) => {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const { view } = window.__game;
  return list.map(({ x, y }) => [...view.ctx.getImageData(Math.round(x * view.ratio), Math.round(y * view.ratio), 1, 1).data].slice(0, 3));
}, places);

/** The colours of the flag on its board at some places on it, in its units, as [r, g, b]. */
export const flagPixels = (page, places) => page.evaluate(async (list) => {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const { view } = window.__game;
  const ctx = view.flagCanvas.getContext('2d');
  return list.map(({ x, y }) => [...ctx.getImageData(Math.floor(x * view.pixels), Math.floor(y * view.pixels), 1, 1).data].slice(0, 3));
}, places);

/** Bare paper, with its fine lines, is pale grey: anything painted is darker in some channel. */
export const isPaper = ([r, g, b]) => Math.min(r, g, b) >= 200;

export { test, expect, show, waitForScreen };
