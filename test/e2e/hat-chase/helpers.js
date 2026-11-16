// Getting through Hat Chase in the tests. In place of the webcam there is footage of a real person, read by the real
// tracker: standing still (strikes.webm, held still), lifting one foot and then the other (stands.webm), jumping
// (jumps.webm: three burpees, each ending in a real jump), star jumps (star-jumps.webm), a slow squat (squat.webm),
// and arms going up (lifts.webm). A test about a move lets the same clip run from the body check on, so that a
// change of clip can't be read as a move of its own. Where a test is about what comes after a move, it says what a
// tracked body would do by calling the rules in the page, or by saying how high each foot is, as the body reader
// would, so that the marching goes through the game's own reading of it.
import { expect, openGame, test, waitForScreen } from '../helpers.js';

export { judge, watchBrightness } from '../giraffe-garden/helpers.js';
export { expect, test, waitForScreen };

export const GAME = 'hat-chase';
// The magpie that waits, for a test about something else, so that a slow computer can't lose the game.
export const GENTLE = { chaseMagpie: 'waits' };

/** Settings for a game at a level. */
export const atLevel = (level, settings = {}) => ({ levels: { [GAME]: level }, ...settings });

export async function openChase(page, settings = {}) {
  await openGame(page, settings, GAME);
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'yes');
}

export const footage = (page, name, options = {}) =>
  page.evaluate(([clip, settings]) => window.__camera.showFootage(clip, settings), [name, options]);

/** A person standing still, in full view, which is what the body check wants. They never move. */
export const standInView = (page) => footage(page, 'strikes', { from: 0.2, playing: false });

/** The person of stands.webm on both feet, held still. */
export const onBothFeet = (page) => footage(page, 'stands', { from: 0.5, playing: false });

/**
 * The same footage playing on from 19.2 seconds: the right foot lifted 30 centimetres from 20 to 25.5 seconds, both
 * feet down, and then the left from 26.5 to 32.
 */
export const liftingEachFoot = (page) => footage(page, 'stands', { from: 19.2, playing: true });

/** The person of jumps.webm standing, before the first of three burpees, each ending in a real jump. */
export const readyToJump = (page) => footage(page, 'jumps', { from: 0, playing: false });
export const jumping = (page) => footage(page, 'jumps', { from: 0, playing: true });

/** The person of star-jumps.webm standing, before three jumping jacks. */
export const readyToStarJump = (page) => footage(page, 'star-jumps', { from: 0, playing: false });
export const starJumping = (page) => footage(page, 'star-jumps', { from: 0, playing: true });

/** The person of squat.webm standing, before one slow, deep squat. */
export const readyToSquat = (page) => footage(page, 'squat', { from: 0, playing: false });
export const squatting = (page) => footage(page, 'squat', { from: 0, playing: true });

/** The person of lifts.webm with both arms down, and the same person with both arms up high. */
export const armsDown = (page) => footage(page, 'lifts', { from: 0.6, playing: false });
export const armsUp = (page) => footage(page, 'lifts', { from: 19.5, playing: false });

/** An empty room. */
export const nobody = (page) => page.evaluate(() => window.__camera.showNobody());

/** From the title to the game being played, with a person in view: standing still, unless a test says. */
export async function reachPlay(page, settings = {}, person = standInView) {
  await openChase(page, settings);
  await person(page);
  await page.locator('#start').click();
  await waitForScreen(page, 'choose');
  await page.locator('#chase-start').click();
  await waitForScreen(page, 'playing');
}

/** From the title to the game being played again, in a page that's open. */
export async function playAgain(page, person = standInView) {
  await person(page);
  await page.locator('#start').click();
  await waitForScreen(page, 'choose');
  await page.locator('#chase-start').click();
  await waitForScreen(page, 'playing');
}

/** Settings saved for the next time the page is opened, and the page opened again with them. */
export async function reopenWith(page, change) {
  await page.evaluate((settings) => {
    const saved = JSON.parse(localStorage.getItem('camera-games-settings'));
    localStorage.setItem('camera-games-settings', JSON.stringify({ ...saved, ...settings }));
  }, change);
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'yes');
}

/** What the rules say right now, and what the screen has of it. */
export const state = (page) => page.evaluate(() => {
  const { chase, game, view } = window.__game;
  // Each game has a new one, and the game's is the one that reads the steps.
  const { marcher } = game;
  const copy = (value) => (value ? JSON.parse(JSON.stringify(value)) : value);
  const thing = (it) => it && {
    index: it.index, kind: it.kind, needs: it.needs, at: it.at, wide: it.wide, state: it.state, done: it.done, times: it.times,
    waited: it.waited, left: it.left, fuse: it.fuse, missed: Boolean(it.missed), paired: Boolean(it.paired), high: copy(it.high),
  };
  const move = chase?.hero.move;
  return {
    screen: game.screen,
    level: chase?.levelNumber,
    current: game.levels.current,
    state: chase?.state,
    hero: chase && { x: chase.hero.x, walkTo: chase.hero.walkTo, mode: chase.hero.mode, side: chase.hero.side, move: move && { kind: move.kind, big: move.big, star: Boolean(move.star), t: move.t, seconds: move.seconds, thing: move.thing?.index ?? null } },
    busy: chase?.busy,
    station: thing(chase?.station),
    next: thing(chase?.next),
    lead: chase?.lead,
    danger: chase?.danger,
    magpie: copy(chase?.magpie),
    stats: copy(chase?.stats),
    rules: chase && copy(chase.rules),
    course: chase ? chase.course.map(thing) : [],
    trees: copy(chase?.trees) ?? [],
    stars: chase ? chase.stars.map(({ at, taken }) => ({ at, taken })) : [],
    tree: chase?.treeHere ? chase.trees.indexOf(chase.treeHere) : null,
    end: chase?.end,
    time: chase?.time,
    film: game.demo.playing?.name ?? null,
    coach: document.getElementById('coach').classList.contains('is-visible'),
    coachText: document.getElementById('coach-text').textContent,
    prompt: document.getElementById('prompt').classList.contains('is-visible') ? document.getElementById('prompt-text').textContent : null,
    line: { ...marcher.line },
    turns: marcher.turns,
    frame: view.heroFrame(),
    heroAt: view.heroAt,
    magpieAt: view.magpieAt,
    place: view.place,
    camera: view.camera,
    metre: view.metre,
    ground: view.ground,
    width: view.width,
    height: view.height,
    hat: copy(view.hat),
    air: Boolean(game.air),
  };
});

export const expectSoon = (read, options = {}) => expect.poll(read, { timeout: 45_000, intervals: [100], ...options });

/**
 * Notes what the rules say happens in this game, from now on: window.__heard, each with where the character was and
 * when it was heard. The game hears all of it as before. A new game needs listening to again.
 */
export const listen = (page) => page.evaluate(() => {
  const { chase } = window.__game;
  window.__heard = [];
  const tell = chase.onEvent;
  chase.onEvent = (event) => {
    const { type, side, size, big, star, how, count, from } = event;
    window.__heard.push({ type, side, size, big, star, how, count, from, kind: event.thing?.kind, index: event.thing?.index, x: chase.hero.x, lead: chase.lead, at: performance.now() });
    tell(event);
  };
});

/** What has been heard, or only the events of one type. */
export const heard = (page, type = null) => page.evaluate((only) => (window.__heard ?? []).filter((event) => !only || event.type === only), type);

/* ---------- moving the character, as a tracked body's moves would ---------- */

// In the page: a wait, and walking on, a step at a time, until the character stands at the next thing in the way.
const IN_PAGE = `
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const marchOn = async (chase, gap, most = 400) => {
    let side = chase.hero.side === 'left' ? 'right' : 'left';
    for (let n = 0; n < most && chase.state === 'play' && !chase.station; n += 1) {
      if (chase.step(side)) side = side === 'left' ? 'right' : 'left';
      await wait(gap);
    }
    return chase.station;
  };
  const doMove = (chase, thing, size, star) => (thing.needs === 'jump' ? chase.jump(size, { star }) : chase.squat());
  const getPast = async (chase, size, star) => {
    const thing = chase.station;
    if (!thing) return null;
    for (let n = 0; n < 200 && chase.state === 'play' && thing.state !== 'cleared'; n += 1) {
      if (chase.station === thing && !chase.busy) doMove(chase, thing, size, star);
      await wait(50);
    }
    while (chase.busy && chase.state === 'play') await wait(30);
    return thing;
  };
`;

/**
 * Steps, one every so many milliseconds, as a child marching would make them, until the character is standing at the
 * next thing in the way, or the game is over. Returns that thing's index, or null. A step takes 0.4 seconds to walk.
 */
export const marchToNext = (page, every = 430) => page.evaluate(([source, gap]) => {
  const run = new Function('chase', 'gap', `${source} return marchOn(chase, gap).then((thing) => thing?.index ?? null);`);
  return run(window.__game.chase, gap);
}, [IN_PAGE, every]);

/** Makes the move the thing the character is standing at wants, as often as it wants it, until it's past it. */
export const getPast = (page, { size = 1, star = false } = {}) => page.evaluate(([source, jump, starry]) => {
  const run = new Function('chase', 'size', 'star', `${source} return getPast(chase, size, star).then((thing) => thing?.state ?? null);`);
  return run(window.__game.chase, jump, starry);
}, [IN_PAGE, size, star]);

/**
 * Marches on, getting past each thing in the way with the move it wants, until the character is standing at a thing
 * of this kind, or one that matches, as a function of the thing, as a string. Returns its index, or null if the path
 * ran out first.
 */
export const walkUpTo = (page, kind, every = 430) => page.evaluate(([source, wanted, gap]) => {
  const run = new Function('chase', 'wanted', 'gap', `${source}
    const matches = wanted.startsWith('(') ? new Function('return ' + wanted)() : (thing) => thing.kind === wanted;
    return (async () => {
      for (let n = 0; n < 40 && chase.state === 'play'; n += 1) {
        const thing = chase.station ?? await marchOn(chase, gap);
        if (!thing) return null;
        if (matches(thing)) return thing.index;
        await getPast(chase, 1, false);
      }
      return null;
    })();`);
  return run(window.__game.chase, wanted, gap);
}, [IN_PAGE, kind, every]);

/**
 * Walks on, a step at a time, getting past whatever is in the way, until the character is standing under an apple
 * tree with its apples still on it. Returns the tree's index, or null.
 */
export const walkUnderATree = (page, every = 430) => page.evaluate(([source, gap]) => {
  const run = new Function('chase', 'gap', `${source}
    return (async () => {
      let side = 'left';
      for (let n = 0; n < 400 && chase.state === 'play'; n += 1) {
        if (chase.treeHere && !chase.busy && chase.hero.mode === 'stand') return chase.trees.indexOf(chase.treeHere);
        if (chase.station) await getPast(chase, 1, false);
        else if (chase.hero.mode === 'stand') {
          if (chase.step(side)) side = side === 'left' ? 'right' : 'left';
        }
        await wait(gap / 4);
      }
      return null;
    })();`);
  return run(window.__game.chase, gap);
}, [IN_PAGE, every]);

/**
 * Takes the character on to a little before the magpie's tree, past everything in the way, at once: for a test about
 * the end of the path. Each thing passed is counted as got past, with its stars, and the stars on the path up to
 * there too. The view is let catch up before it goes on.
 */
export const bringToTheEnd = async (page, before = 2.5) => {
  await page.evaluate((short) => {
    const { chase } = window.__game;
    for (const thing of chase.course) {
      if (thing.state === 'cleared') continue;
      thing.state = 'cleared';
      chase.stats.cleared += 1;
      chase.stats.stars += thing.worth;
    }
    chase.station = null;
    chase.hero.x = chase.end - short;
    chase.hero.walkTo = chase.hero.x;
    chase.hero.mode = 'stand';
    chase.hero.move = null;
    chase.collectStars();
    chase.magpie.x = Math.max(chase.magpie.x, chase.hero.x + 6);
  }, before);
  await expectSoon(() => page.evaluate(() => Math.abs(window.__game.view.camera - window.__game.chase.hero.x)), { timeout: 15_000 }).toBeLessThan(0.01);
};

/* ---------- the feet, as the body reader says they are ---------- */

/**
 * From now on the body reader says each foot is this high off the floor, as a share of the child's leg length,
 * whatever the camera sees, until feetAsSeen: as it would for a tracked child's feet. Everything else it reads, the
 * hips and the arms, is the camera's. The game reads its steps from this, as it would from a real child.
 */
export const feetAt = (page, rises) => page.evaluate((wanted) => {
  const { reader } = window.__game;
  if (!Object.prototype.hasOwnProperty.call(reader, '__feet')) {
    let real = reader.footRises;
    Object.defineProperty(reader, 'footRises', {
      configurable: true,
      get: () => reader.__feet ?? real,
      set: (value) => {
        real = value;
      },
    });
  }
  reader.__feet = wanted;
}, rises);

export const feetAsSeen = (page) => feetAt(page, null);

/**
 * One foot lifted this high and held, and put down again, as the body reader would say it was. Both feet are
 * otherwise down, a little off the floor as a standing child's read.
 */
export const liftFoot = (page, side, { height = 0.2, hold = 400, rest = 400 } = {}) => page.evaluate(async ([foot, high, up, down]) => {
  const { reader } = window.__game;
  if (!Object.prototype.hasOwnProperty.call(reader, '__feet')) throw new Error('feetAt first');
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  reader.__feet = { left: 0.02, right: 0.02, [foot]: high };
  await wait(up);
  reader.__feet = { left: 0.02, right: 0.02 };
  await wait(down);
}, [side, height, hold, rest]);

/* ---------- what's on the screen ---------- */

// In the page: the view drawn once onto a canvas of its own, which the computer draws itself rather than the
// graphics card, and so the same way every time: the game's own canvas, drawn by the graphics card, can draw the
// edge of a shape a little differently from one time to the next. without names view methods left out of it.
const DRAW_ASIDE = `
  const drawAside = (view, without = {}) => {
    const { canvas } = view;
    if (!window.__aside || window.__aside.width !== canvas.width || window.__aside.height !== canvas.height) {
      window.__aside = document.createElement('canvas');
      window.__aside.width = canvas.width;
      window.__aside.height = canvas.height;
    }
    const aside = window.__aside.getContext('2d', { alpha: false, willReadFrequently: true });
    const [ctx, kept] = [view.ctx, Object.keys(without).map((name) => [name, view[name]])];
    for (const [name, skip] of Object.entries(without)) view[name] = skip;
    view.ctx = aside;
    try {
      view.render();
    } finally {
      view.ctx = ctx;
      for (const [name, method] of kept) view[name] = method;
    }
    return aside.getImageData(0, 0, canvas.width, canvas.height).data;
  };
`;

/**
 * Where something is drawn on the game's canvas, in CSS pixels: the box around every pixel that changes when it
 * isn't drawn. name is the view's method that draws it, as 'drawHero' or 'drawMagpie', and which, if given, is the
 * one of the things that method draws: the index of a thing in the way, a star on the path, or an apple tree. Drawn
 * at the same moment each time, so nothing moves in between. within, if given, is the only part of the screen looked
 * at, in CSS pixels, for a method that draws more than one thing and doesn't say which. null if nothing is drawn.
 */
export const drawnBox = (page, name, which = null, within = null) => page.evaluate(([source, method, only, area]) => {
  const run = new Function('method', 'only', 'area', `${source}
    const { view } = window.__game;
    const { canvas, ratio } = view;
    const all = drawAside(view);
    const draw = view[method];
    const without = drawAside(view, {
      [method]: function skip(...args) {
        if (only !== null && (args[0]?.index ?? args[1]) !== only) draw.apply(this, args);
      },
    });
    // Drawn again: a few pixels at the edge of a shape can come out differently even so, and they aren't counted.
    const again = drawAside(view);
    const apart = (a, b, i) => Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    const { width, height } = canvas;
    // Clearly different: a shadow, drawn faintly, isn't counted.
    const changed = new Uint8Array(width * height);
    for (let at = 0; at < changed.length; at += 1) {
      const i = at * 4;
      changed[at] = apart(all, without, i) >= 100 && apart(again, without, i) >= 100 && apart(all, again, i) < 30 ? 1 : 0;
    }
    let box = null;
    for (let at = 0; at < changed.length; at += 1) {
      if (!changed[at]) continue;
      const [x, y] = [at % width, Math.floor(at / width)];
      if (area && (x < area.left * ratio || x >= area.right * ratio || y < area.top * ratio || y >= area.bottom * ratio)) continue;
      // A pixel by itself, with hardly anything around it changed, isn't part of a drawing.
      let around = 0;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) if ((dx || dy) && x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height) around += changed[at + dy * width + dx];
      if (around < 3) continue;
      if (!box) box = { left: x, right: x, top: y, bottom: y, count: 0 };
      box.left = Math.min(box.left, x);
      box.right = Math.max(box.right, x);
      box.top = Math.min(box.top, y);
      box.bottom = Math.max(box.bottom, y);
      box.count += 1;
    }
    return box && { left: box.left / ratio, right: (box.right + 1) / ratio, top: box.top / ratio, bottom: (box.bottom + 1) / ratio, count: box.count / (ratio * ratio) };`);
  return run(method, only, area);
}, [DRAW_ASIDE, name, which, within]);

/**
 * How many of the canvas's pixels in a box, in CSS pixels, are near a colour, [r, g, b], as it's drawn now. without
 * names view methods that aren't drawn this time, to leave out what isn't being looked at.
 */
export const colourIn = (page, box, colour, { near = 30, without = [] } = {}) => page.evaluate(([source, area, wanted, close, skip]) => {
  const run = new Function('area', 'wanted', 'close', 'skip', `${source}
    const { view } = window.__game;
    const { ratio, canvas } = view;
    const data = drawAside(view, Object.fromEntries(skip.map((name) => [name, () => {}])));
    const [left, top] = [Math.max(0, Math.floor(area.left * ratio)), Math.max(0, Math.floor(area.top * ratio))];
    const right = Math.min(canvas.width, Math.ceil(area.right * ratio));
    const bottom = Math.min(canvas.height, Math.ceil(area.bottom * ratio));
    let found = 0;
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const i = (y * canvas.width + x) * 4;
        if (Math.hypot(data[i] - wanted[0], data[i + 1] - wanted[1], data[i + 2] - wanted[2]) < close) found += 1;
      }
    }
    return found / (ratio * ratio);`);
  return run(area, wanted, close, skip);
}, [DRAW_ASIDE, box, colour, near, without]);

/**
 * Lays a new path, as starting the game again would, until it has what a test wants: a function of the rules, as a
 * string, as in '(chase) => chase.course.some(({ kind }) => kind === \'spring\')'. Then on to play again.
 */
export const pathWith = async (page, wanted) => {
  const tries = await page.evaluate((test) => {
    const has = new Function('chase', `return (${test})(chase);`);
    const { game } = window.__game;
    let again = 0;
    while (!has(game.chase) && again < 100) {
      game.countDown();
      again += 1;
    }
    if (!has(game.chase)) throw new Error(`no path had ${test}`);
    return again;
  }, wanted);
  if (tries) await waitForScreen(page, 'playing');
  return tries;
};

/** The middle of a box. */
export const middle = (box) => ({ x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 });

/**
 * Whether the character's picture, drawn in this box, stands where the view says its feet are: across, its feet
 * within its picture, and its feet at the bottom of it. A character's long neck or arms out make the picture wider on
 * one side, so only that the feet are inside it is asked.
 */
export const standsAt = (box, at, metre) => Boolean(box) && at.x > box.left && at.x < box.right && Math.abs(box.bottom - at.y) < metre * 0.3 && box.right - box.left < metre * 3;

/**
 * Waits in the page, frame by frame, until the character is so far through what it's doing, as a share, and says how
 * it's drawn then: which picture, and how high off the path. null if it had finished first.
 */
export const partWay = (page, share) => page.evaluate((wanted) => new Promise((done) => {
  const look = () => {
    const { chase, view } = window.__game;
    const { move } = chase.hero;
    if (!move) {
      done(null);
      return;
    }
    if (move.t / move.seconds >= wanted) {
      done({ share: move.t / move.seconds, kind: move.kind, frame: view.heroFrame(), y: view.heroAt.y, ground: view.ground, metre: view.metre });
      return;
    }
    requestAnimationFrame(look);
  };
  look();
}), share);

/** Holds the game still, as it is, and lets it go again: the picture is still drawn. */
export const hold = (page, still = true) => page.evaluate((paused) => {
  window.__game.game.paused = paused;
}, still);

/** Where the pieces on top of the game are, as { name: { left, top, right, bottom } }, for those that are showing. */
export const boxes = (page) => page.evaluate(() => {
  const found = {};
  const take = (name, selector) => {
    const element = document.querySelector(selector);
    const box = element?.getBoundingClientRect();
    if (box && box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== 'hidden') found[name] = { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
  };
  take('stars chip', '#chase-top .chip:first-child');
  take('magpie chip', '#magpie-chip');
  take('path bar', '.path-track');
  take('camera', '#camera-frame');
  take('film', '#coach');
  take('prompt', '#prompt');
  take('gear', '#open-panel');
  return found;
});

/** Whether two boxes overlap. */
export const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * Reads how bright each part of the game's canvas is, frame by frame, until a condition holds and for so many
 * frames after it. each, if given, is run in the page before each frame is read, with the frame's number and
 * window.__game: as a string, as in '(n, { chase }) => { if (n === 5) chase.jump(2); }'. until is a string too.
 */
export const watchUntil = (page, until, { after = 60, most = 3000, each = null } = {}) => page.evaluate(async ({ wanted, extra, limit, step }) => {
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
    const { chase, game } = window.__game;
    reading.push({ at: performance.now(), cells, screen: game.screen, mode: chase?.hero.mode ?? null, x: chase?.hero.x ?? null, state: chase?.state ?? null });
    if (left === null && there(window.__game)) left = extra;
    else if (left !== null) left -= 1;
  }
  return { reading, reached: left !== null };
}, { wanted: until, extra: after, limit: most, step: each });

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

export const shot = (page, name) => page.screenshot({ path: `test-results/screens/${name}.png` });
