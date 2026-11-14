// Playing Gobble and Grow in the tests. There are no photos of faces to show the real face tracker, so the camera
// is a drawing of a face and the tracker a stand-in that reports it (../fake-face.js): everything after that is
// the real game. A child is played by saying where the drawn face is and how far open its mouth is, moving it
// until the creature is where the soup wants it.
import { fileURLToPath } from 'node:url';
import { expect, shot, test, waitForScreen } from '../helpers.js';

export { judge, watchBrightness } from '../bounce-back/helpers.js';
export { expect, shot, test, waitForScreen };

const fakeFace = fileURLToPath(new URL('../fake-face.js', import.meta.url));

export const GAME = 'gobble-grow';
/** How far apart the lips are, as the tracker measures it: a mouth wide open, and one that's shut. */
export const WIDE = 0.4;
export const SHUT = 0.01;

/**
 * Opens the game with the drawn face for a camera and the stand-in for the tracker, sound and voice off unless a test
 * says. It's the soup as it always was, where bigger things only nudge, the gentle choice under "Bigger things",
 * unless a test says: caught.spec.js has the bigger things that catch, as the game comes.
 */
export async function openGobble(page, settings = {}, hash = '') {
  await page.addInitScript({ path: fakeFace });
  await page.addInitScript((saved) => {
    if (!localStorage.getItem('camera-games-settings')) localStorage.setItem('camera-games-settings', JSON.stringify(saved));
  }, { voice: false, sound: false, gobbleBig: 'gentle', ...settings });
  await page.goto(`/games/${GAME}/index.html?debug${hash}`);
  // A link to play with friends opens the friends box, which is all the title card shows.
  await expect(page.locator('#start:visible, #friends-box:visible').first()).toBeVisible();
}

/** Changes what the child is doing: see fake-face.js. Anything not said stays as it was. */
export const face = (page, change) => page.evaluate((scene) => window.__face.show(scene), change);

export const atLevel = (level) => ({ levels: { [GAME]: level } });

/** Opens wide for the mouth check, as anyone would once they've heard what's asked, and shuts again. */
export async function passCheck(page, wide = WIDE) {
  await waitForScreen(page, 'check');
  await page.waitForTimeout(500);
  await face(page, { open: wide });
  await expect.poll(() => page.evaluate(() => window.__game.screen), { timeout: 30_000, intervals: [50] }).not.toBe('check');
  await face(page, { open: SHUT });
}

/** Gets through the mouth check and on into play. */
export async function startPlaying(page, settings = {}, hash = '') {
  await openGobble(page, settings, hash);
  await face(page, { open: SHUT });
  await page.locator('#start').click();
  await passCheck(page);
  await waitForScreen(page, 'playing');
}

/** What the rules say right now, and how the mouth is read. */
export const state = (page) => page.evaluate(() => {
  const { soup, game, view, monitor, session } = window.__game;
  const { creature } = soup;
  const { snapshot } = monitor;
  return {
    level: soup.level,
    world: view.world.id,
    phase: soup.phase,
    won: soup.won,
    goal: soup.goal,
    eaten: soup.eaten,
    total: soup.total,
    together: soup.together,
    auto: soup.auto,
    seed: soup.seed,
    stats: { ...soup.stats, byKind: [...soup.stats.byKind] },
    creature: { x: creature.x, y: creature.y, r: creature.r, facing: creature.facing, holding: creature.holding ? creature.holding.id : null, heldFor: creature.heldFor },
    target: soup.target ? soup.target.id : null,
    waitedFor: soup.waitedFor,
    foods: soup.foods.map(({ id, kind, x, y, r, state: how }) => ({ id, kind, x, y, r, state: how })),
    mouth: { status: snapshot.status, reason: snapshot.reason, open: snapshot.mouthOpen, openness: snapshot.openness, amount: snapshot.amount, line: snapshot.line, best: snapshot.best, checked: snapshot.checked, x: snapshot.x, y: snapshot.y },
    shownMouth: game.mouth ?? 0,
    pulling: Boolean(view.pull),
    labels: view.labels.map((label) => label.words[0]),
    named: [...view.introduced],
    film: document.body.dataset.film,
    prompt: document.getElementById('prompt').classList.contains('is-visible') ? document.getElementById('prompt-text').textContent : '',
    ownLevel: session.levels.current,
    playSeconds: session.playSeconds,
  };
});

/**
 * Plays a child, in the page, until stopChild. Their face goes where it has to for the creature to be on the
 * nearest thing it can eat, and mouth says what their mouth does: 'eat' opens wide when something is in reach,
 * holds it a moment and shuts, 'shut' never opens, 'open' never shuts, and a number is how far open it stays.
 * steer: false keeps the face still. wobble, from 0 to 1, makes it a real child's: a head that's never still, a
 * mouth that trembles, and a face the tracker loses for a couple of frames now and then.
 */
export const playChild = (page, { mouth = 'eat', steer = true, wobble = 0, wide = WIDE, hold = 12, extra = {} } = {}) => page.evaluate(({ how, steering, shake, open, holdFrames, more }) => {
  window.__child?.stop();
  let { x, y } = window.__face.scene;
  let frame = 0;
  let opened = false;
  let openFor = 0;
  const timer = setInterval(() => {
    const { soup } = window.__game;
    frame += 1;
    const wanted = steering ? soup.wants() : null;
    if (wanted) {
      // A head only moves so fast, and where the creature is, is a moment behind the head.
      x += Math.max(-0.006, Math.min(0.006, (wanted.x - soup.creature.x) * 0.012));
      y += Math.max(-0.006, Math.min(0.006, (wanted.y - soup.creature.y) * 0.012));
    }
    x = Math.max(0.28, Math.min(0.72, x));
    y = Math.max(0.3, Math.min(0.58, y));
    let lips = 0.01;
    if (how === 'eat') {
      if (!opened && soup.target) [opened, openFor] = [true, 0];
      else if (opened && (openFor += 1) > holdFrames) opened = false;
      lips = opened ? open : 0.01;
    } else if (how === 'open') {
      lips = open;
    } else if (typeof how === 'number') {
      lips = how;
    }
    const lost = shake > 0 && frame % 45 < 2;
    window.__face.show({
      ...more,
      seen: !lost && more.seen !== false,
      x: x + shake * 0.005 * Math.sin(frame * 1.7),
      y: y + shake * 0.004 * Math.cos(frame * 1.3),
      open: Math.max(0, lips + shake * 0.025 * Math.sin(frame * 2.3)),
      roll: (more.roll ?? 0) + shake * 6 * Math.sin(frame * 0.21),
    });
    window.__child.x = x;
    window.__child.y = y;
  }, 33);
  window.__child = { x, y, stop: () => clearInterval(timer) };
}, { how: mouth, steering: steer, shake: wobble, open: wide, holdFrames: hold, more: extra });

export const stopChild = (page) => page.evaluate(() => window.__child?.stop());

export const expectSoon = (read, options = {}) => expect.poll(read, { timeout: 45_000, intervals: [100], ...options });

/** Puts a thing of a kind right by the creature, staying put, for what needs one there: 0 is the smallest kind, and 2 the biggest. */
export const putFood = (page, kind = 0, { dx = 0.5, dy = 0 } = {}) => page.evaluate(([which, across, down]) => {
  const { soup } = window.__game;
  const { creature } = soup;
  const place = { x: creature.x + creature.r * across, y: creature.y + creature.r * down };
  const food = {
    id: 9000 + Math.floor(Math.random() * 900),
    kind: which,
    r: 0.055 * [0.5, 1.25, 1.7][which],
    born: soup.time,
    life: 1000,
    from: place,
    vel: { x: 0, y: 0 },
    across: { x: 0, y: 1 },
    sway: 0,
    beat: 0,
    phase: 0,
    state: 'drift',
    bumped: false,
    ...place,
  };
  soup.foods.push(food);
  return food.id;
}, [kind, dx, dy]);

/**
 * Empties the soup, and stops anything more arriving, for a test that wants only what it puts there, with no
 * labels showing or said yet.
 */
export const emptySoup = (page) => page.evaluate(() => {
  const { soup, view } = window.__game;
  soup.foods = [];
  soup.next = Infinity;
  soup.spawnDue = () => {};
  view.labels = [];
  view.wanted = [];
  view.introduced.clear();
});
